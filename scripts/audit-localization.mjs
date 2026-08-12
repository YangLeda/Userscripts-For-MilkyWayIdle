import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "espree";

/* global console */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "src");
const localizers = new Set([
  "t",
  "langText",
  "localize",
  "localizedText",
  "entityName",
  "itemName",
  "actionName",
  "abilityName",
  "monsterName",
]);
const languageMarkers =
  /\bisZH\b|isZHInGameSetting|isZHIn3rdPartyWebsites|getLanguage\s*\(|i18nextLng|\blanguage\b|\benglish\b/;
const visibleProperties = new Set([
  "textContent",
  "innerText",
  "innerHTML",
  "outerHTML",
  "title",
  "placeholder",
  "ariaLabel",
]);
const visibleMethods = new Set([
  "alert",
  "confirm",
  "prompt",
  "showToast",
  "toast",
  "notify",
  "insertAdjacentHTML",
]);
const visibleAttributes = new Set(["title", "aria-label", "placeholder"]);

// These exclusions are deliberately narrow and documented. DPS diagnostics are
// excluded by product decision; the normal DPS UI/export remains audited by the
// rest of the DPS modules and covered by DPS localization tests.
const excludedFiles = new Map([
  [
    "src/features/dps/10-combat-sources.js",
    "DPS class probes, packet capture helpers and diagnostic source scanners",
  ],
  [
    "src/features/dps/40-socket-parser.js",
    "DPS packet scanner and attribution diagnostics",
  ],
]);

const allowedLiterals = [
  {
    file: "src/features/dps/20-session.js",
    pattern: /已开始抓取战斗消息|已停止抓取|条消息/,
    reason: "DPS packet-capture diagnostics are explicitly out of scope",
  },
  {
    file: "src/features/dps/70-recount-compat.js",
    pattern: /<svg|<path/,
    reason: "Static SVG markup contains no player-facing language",
  },
  {
    file: "src/features/external-tools.js",
    pattern: /After|days:|script_expense|script_revenue/,
    reason:
      "Third-party page template selects its paired language or copies source-page text at render time",
  },
  {
    file: "src/features/game-widgets.js",
    pattern: /<div|<span/,
    reason: "Numeric-only game overlay markup contains no localized copy",
  },
  {
    file: "src/features/procurement.js",
    pattern: /<input|mwi-procurement-nav-icon/,
    reason:
      "Generated control markup interpolates already localized entity names",
  },
  {
    file: "src/features/production-profit-panel.js",
    pattern: /mwi-profit/,
    reason: "Panel markup interpolates text resolved before rendering",
  },
];

const deprecatedTerms = [
  {
    pattern: /服务器市场价值|Server market value/i,
    replacement: "市场价值 / Market value",
  },
  {
    pattern: /地下城钥匙/,
    replacement: "地牢钥匙",
  },
];

const deprecatedTermAllowlist = [
  {
    file: "src/features/inventory.js",
    pattern: /^地下城钥匙$/,
    reason:
      "Legacy game-DOM matching alias; rendered terminology still uses 地牢钥匙",
  },
];

function walk(node, ancestors, visit) {
  if (!node || typeof node !== "object") return;
  visit(node, ancestors);
  const next = [...ancestors, node];
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent" || key === "comments" || key === "tokens") continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, next, visit);
    } else if (value?.type) {
      walk(value, next, visit);
    }
  }
}

function calleeName(callee) {
  if (!callee) return "";
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression") {
    return callee.computed ? callee.property?.value : callee.property?.name;
  }
  return "";
}

function literalText(node) {
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node.type === "TemplateElement")
    return node.value.cooked ?? node.value.raw;
  return null;
}

function sourceOf(source, node) {
  return source.slice(node.range[0], node.range[1]);
}

function hasLanguageGuard(source, ancestors) {
  return ancestors.some((ancestor) => {
    if (ancestor.type === "ConditionalExpression") {
      return languageMarkers.test(sourceOf(source, ancestor.test));
    }
    if (ancestor.type === "IfStatement") {
      return languageMarkers.test(sourceOf(source, ancestor.test));
    }
    return false;
  });
}

function isLocalized(source, ancestors) {
  if (hasLanguageGuard(source, ancestors)) return true;
  return ancestors.some((ancestor) => {
    if (
      ancestor.type === "CallExpression" &&
      localizers.has(calleeName(ancestor.callee))
    ) {
      return true;
    }
    if (ancestor.type === "TemplateLiteral") {
      const template = sourceOf(source, ancestor);
      return (
        /\$\{\s*(?:this\.)?(?:t|langText|localize|localizedText|entityName|itemName|actionName|abilityName|monsterName)\s*\(/.test(
          template,
        ) || languageMarkers.test(template)
      );
    }
    if (ancestor.type === "ArrayExpression") {
      const values = ancestor.elements
        .map((element) => literalText(element))
        .filter((value) => value !== null);
      return (
        values.some((value) => /[\p{Script=Han}]/u.test(value)) &&
        values.some((value) => /[A-Za-z]/.test(value))
      );
    }
    return false;
  });
}

function isStyleText(source, ancestors) {
  return ancestors.some((ancestor) => {
    if (ancestor.type !== "AssignmentExpression") return false;
    const left = sourceOf(source, ancestor.left);
    return /(?:^|\.)style\.textContent$/.test(left);
  });
}

function isVisibleSink(node, ancestors) {
  const parent = ancestors.at(-1);
  if (!parent) return false;
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index];
    if (ancestor.type === "CallExpression") {
      const name = calleeName(ancestor.callee);
      const objectName =
        ancestor.callee?.type === "MemberExpression"
          ? ancestor.callee.object?.name
          : "";
      if (objectName === "console" || visibleMethods.has(name)) return true;
      if (name === "setAttribute") {
        const attribute = ancestor.arguments[0];
        if (
          attribute?.type === "Literal" &&
          visibleAttributes.has(String(attribute.value).toLowerCase())
        ) {
          return true;
        }
      }
    }
    if (
      ancestor.type === "NewExpression" &&
      calleeName(ancestor.callee) === "Error"
    ) {
      return true;
    }
    if (
      ancestor.type === "AssignmentExpression" &&
      ancestor.left?.type === "MemberExpression" &&
      visibleProperties.has(calleeName(ancestor.left))
    ) {
      return true;
    }
  }
  return false;
}

function isHumanText(value) {
  const text = String(value).trim();
  if (!text) return false;
  if (/^[.#[/]|^[A-Za-z_$][\w$]*$/.test(text)) return false;
  return /[\p{Script=Han}]|[A-Za-z]{3,}[\s:,.!?]/u.test(text);
}

function allowedLiteral(relative, value) {
  return allowedLiterals.some(
    (entry) => entry.file === relative && entry.pattern.test(value),
  );
}

function allowedDeprecatedTerm(relative, value) {
  return deprecatedTermAllowlist.some(
    (entry) => entry.file === relative && entry.pattern.test(value),
  );
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

const failures = [];
let checkedFiles = 0;
let excludedCount = 0;
for (const file of await sourceFiles(sourceRoot)) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  if (excludedFiles.has(relative)) {
    excludedCount += 1;
    continue;
  }
  const source = await readFile(file, "utf8");
  const ast = parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    range: true,
    loc: true,
  });
  checkedFiles += 1;
  walk(ast, [], (node, ancestors) => {
    const value = literalText(node);
    if (value === null) return;
    for (const term of deprecatedTerms) {
      if (term.pattern.test(value) && !allowedDeprecatedTerm(relative, value)) {
        failures.push({
          relative,
          line: node.loc.start.line,
          message: `deprecated term; use ${term.replacement}`,
        });
      }
    }
    if (
      isHumanText(value) &&
      isVisibleSink(node, ancestors) &&
      !isStyleText(source, ancestors) &&
      !allowedLiteral(relative, value) &&
      !isLocalized(source, ancestors)
    ) {
      failures.push({
        relative,
        line: node.loc.start.line,
        message: "player-visible or logged text bypasses the bilingual entry",
      });
    }
  });
}

if (failures.length) {
  console.error("Localization audit failed:");
  for (const failure of failures) {
    console.error(`  ${failure.relative}:${failure.line} — ${failure.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Localization audit passed (${checkedFiles} files checked; ${excludedCount} DPS diagnostic files excluded with documented reasons).`,
  );
}
