import { runtime } from "./runtime.js";

export const SUPPORTED_GAME_LOCALES = Object.freeze([
  "en",
  "es",
  "fr",
  "pt",
  "zh",
  "zh-TW",
  "ja",
  "ko",
  "ru",
]);

const LOCALE_SET = new Set(SUPPORTED_GAME_LOCALES);
const ENTITY_TYPES = Object.freeze({
  item: {
    resourceKey: "itemNames",
    stateKey: "initData_itemDetailMap",
    prefix: "/items/",
    sprite: "items_sprite",
  },
  action: {
    resourceKey: "actionNames",
    stateKey: "initData_actionDetailMap",
    prefix: "/actions/",
    sprite: "actions_sprite",
  },
  monster: {
    resourceKey: "monsterNames",
    stateKey: "initData_monsterDetailMap",
    prefix: "/monsters/",
    sprite: "combat_monsters_sprite",
  },
  ability: {
    resourceKey: "abilityNames",
    stateKey: "initData_abilityDetailMap",
    prefix: "/abilities/",
    sprite: "abilities_sprite",
  },
});
const TYPE_ALIASES = Object.freeze({
  items: "item",
  actions: "action",
  monsters: "monster",
  abilities: "ability",
});
const localeResources = new Map();
const reverseIndexes = new WeakMap();
const warnedLocales = new Set();

function pageGlobal() {
  return globalThis.unsafeWindow ?? globalThis.window ?? globalThis;
}

export function normalizeGameLocale(value) {
  const raw = String(value ?? "")
    .trim()
    .replaceAll("_", "-");
  if (!raw) return "en";
  const lower = raw.toLowerCase();
  if (
    lower === "zh-tw" ||
    lower === "zh-hant" ||
    lower.startsWith("zh-hant-") ||
    lower === "zh-hk" ||
    lower === "zh-mo"
  ) {
    return "zh-TW";
  }
  if (lower === "zh" || lower.startsWith("zh-")) return "zh";
  const base = lower.split("-")[0];
  return LOCALE_SET.has(base) ? base : "en";
}

export function getGameLocale() {
  return normalizeGameLocale(
    runtime.config.gameLanguage ??
      globalThis.localStorage?.getItem?.("i18nextLng") ??
      globalThis.document?.documentElement?.lang ??
      globalThis.navigator?.language,
  );
}

function webpackQueues(target = pageGlobal()) {
  const queues = [];
  for (const key of Object.getOwnPropertyNames(target ?? {})) {
    if (!/^webpack(?:Jsonp|Chunk)/i.test(key)) continue;
    let value;
    try {
      value = target[key];
    } catch {
      continue;
    }
    if (Array.isArray(value)) queues.push(value);
  }
  return queues;
}

function chunkEntries(target) {
  return webpackQueues(target).flatMap((queue) =>
    queue.filter((entry) => entry?.[1] && typeof entry[1] === "object"),
  );
}

function localeModuleMap(entries) {
  const result = new Map();
  const pattern =
    /["']\.\/([^"'\\]+)\/index\.js["']\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/g;
  for (const entry of entries) {
    for (const factory of Object.values(entry[1])) {
      if (typeof factory !== "function") continue;
      const source = Function.prototype.toString.call(factory);
      if (!source.includes("./zh-TW/index.js")) continue;
      for (const match of source.matchAll(pattern)) {
        result.set(normalizeGameLocale(match[1]), String(match[2]));
      }
    }
  }
  return result;
}

function runLocaleFactory(factory) {
  const module = { exports: {} };
  const exports = module.exports;
  const webpackRequire = () => {
    throw new Error(
      runtime.config.isZH
        ? "游戏语言模块意外引用了其他模块"
        : "The game locale unexpectedly imported another module",
    );
  };
  webpackRequire.r = (target) => {
    Object.defineProperty(target, "__esModule", { value: true });
  };
  webpackRequire.d = (target, nameOrDefinition, getter) => {
    const definition =
      typeof nameOrDefinition === "object"
        ? nameOrDefinition
        : { [nameOrDefinition]: getter };
    for (const [name, get] of Object.entries(definition)) {
      if (typeof get !== "function" || Object.hasOwn(target, name)) continue;
      Object.defineProperty(target, name, {
        enumerable: true,
        get,
      });
    }
  };
  factory.call(exports, module, exports, webpackRequire);
  return module.exports?.default ?? exports.default ?? module.exports;
}

function validResourceMap(value, prefix) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).some((key) => key.startsWith(prefix));
}

export function validateGameLocaleResources(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    validResourceMap(value.itemNames, "/items/") &&
    validResourceMap(value.actionNames, "/actions/") &&
    validResourceMap(value.monsterNames, "/monsters/") &&
    validResourceMap(value.abilityNames, "/abilities/"),
  );
}

export function extractGameLocaleResources(
  locale = getGameLocale(),
  target = pageGlobal(),
) {
  const normalizedLocale = normalizeGameLocale(locale);
  if (normalizedLocale === "en") return null;
  const entries = chunkEntries(target);
  const moduleMap = localeModuleMap(entries);
  const expectedModuleId = moduleMap.get(normalizedLocale);
  const candidates = [];
  for (const entry of entries) {
    for (const [moduleId, factory] of Object.entries(entry[1])) {
      if (typeof factory !== "function") continue;
      if (expectedModuleId && moduleId !== expectedModuleId) continue;
      const source = Function.prototype.toString.call(factory);
      if (
        !expectedModuleId &&
        (!source.includes("itemNames") ||
          !source.includes("actionNames") ||
          !source.includes("monsterNames") ||
          !source.includes("abilityNames"))
      ) {
        continue;
      }
      candidates.push(factory);
    }
  }
  for (const factory of candidates) {
    try {
      const resources = runLocaleFactory(factory);
      if (validateGameLocaleResources(resources)) return resources;
    } catch {
      // A future game bundle may import shared modules from locale chunks.
    }
  }
  return null;
}

function englishResourceMap(type) {
  const definition = ENTITY_TYPES[type];
  const details = runtime.state[definition.stateKey];
  if (!details || typeof details !== "object") return {};
  return Object.fromEntries(
    Object.entries(details)
      .map(([hrid, detail]) => [hrid, String(detail?.name ?? "").trim()])
      .filter(([, name]) => name),
  );
}

function englishResources() {
  const resources = {
    itemNames: englishResourceMap("item"),
    actionNames: englishResourceMap("action"),
    monsterNames: englishResourceMap("monster"),
    abilityNames: englishResourceMap("ability"),
  };
  for (const [hrid, name] of Object.entries(resources.actionNames)) {
    if (!hrid.startsWith("/actions/combat/")) continue;
    const monsterHrid = hrid.replace("/actions/combat/", "/monsters/");
    if (!resources.monsterNames[monsterHrid]) {
      resources.monsterNames[monsterHrid] = name;
    }
  }
  return resources;
}

function simplifiedResources() {
  const others = runtime.data.ZHOthersDic ?? {};
  return {
    itemNames: runtime.data.ZHItemNames ?? {},
    actionNames: runtime.data.ZHActionNames ?? {},
    monsterNames: Object.fromEntries(
      Object.entries(others).filter(([hrid]) => hrid.startsWith("/monsters/")),
    ),
    abilityNames: Object.fromEntries(
      Object.entries(others).filter(([hrid]) => hrid.startsWith("/abilities/")),
    ),
  };
}

export function getGameLocaleResources(locale = getGameLocale()) {
  const normalizedLocale = normalizeGameLocale(locale);
  if (normalizedLocale === "en") return englishResources();
  if (localeResources.has(normalizedLocale)) {
    return localeResources.get(normalizedLocale);
  }
  const extracted = extractGameLocaleResources(normalizedLocale);
  if (extracted) {
    localeResources.set(normalizedLocale, extracted);
    return extracted;
  }
  if (normalizedLocale === "zh") return simplifiedResources();
  if (!warnedLocales.has(normalizedLocale)) {
    warnedLocales.add(normalizedLocale);
    console.warn(
      `[MWITools] The official ${normalizedLocale} game language resources are not available yet. Locale-dependent fallbacks will stay disabled.`,
    );
  }
  return null;
}

export function registerGameLocaleResources(locale, resources) {
  const normalizedLocale = normalizeGameLocale(locale);
  if (normalizedLocale === "en" || !validateGameLocaleResources(resources)) {
    return false;
  }
  localeResources.set(normalizedLocale, resources);
  return true;
}

function entityType(kind) {
  const normalized = TYPE_ALIASES[kind] ?? kind;
  return ENTITY_TYPES[normalized] ? normalized : null;
}

function normalizedName(value, type = "") {
  let result = String(value ?? "")
    .normalize("NFKC")
    .replaceAll(/\s+/g, " ")
    .trim();
  if (type === "item") result = result.replace(/\s+\+\d+\s*$/, "").trim();
  return result;
}

function reverseIndex(resources, type) {
  let indexes = reverseIndexes.get(resources);
  if (!indexes) {
    indexes = new Map();
    reverseIndexes.set(resources, indexes);
  }
  if (indexes.has(type)) return indexes.get(type);
  const definition = ENTITY_TYPES[type];
  const index = new Map();
  for (const [hrid, name] of Object.entries(
    resources?.[definition.resourceKey] ?? {},
  )) {
    const key = normalizedName(name, type);
    if (!key) continue;
    if (index.has(key) && index.get(key) !== hrid) index.set(key, null);
    else index.set(key, hrid);
  }
  indexes.set(type, index);
  return index;
}

function directHrid(type, value) {
  const definition = ENTITY_TYPES[type];
  const candidate = String(value ?? "").trim();
  return candidate.startsWith(definition.prefix) ? candidate : "";
}

export function resolveLocalizedEntity(
  kind,
  name,
  { locale = getGameLocale() } = {},
) {
  const type = entityType(kind);
  if (!type) return "";
  const direct = directHrid(type, name);
  if (direct) return direct;
  const key = normalizedName(name, type);
  if (!key) return "";
  if (type === "item") {
    const directEnglish = runtime.state.itemEnNameToHridMap?.[name];
    if (directEnglish) return directEnglish;
    for (const [englishName, hrid] of Object.entries(
      runtime.state.itemEnNameToHridMap ?? {},
    )) {
      if (normalizedName(englishName, type) === key) return hrid;
    }
  }
  const sources = [getGameLocaleResources(locale), englishResources()];
  if (normalizeGameLocale(locale) !== "zh") sources.push(simplifiedResources());
  for (const resources of sources) {
    if (!resources) continue;
    const match = reverseIndex(resources, type).get(key);
    if (match) return match;
  }
  return "";
}

export function getLocalizedEntityName(
  kind,
  hrid,
  { locale = getGameLocale(), fallback = "" } = {},
) {
  const type = entityType(kind);
  if (!type) return fallback;
  const definition = ENTITY_TYPES[type];
  const resources = getGameLocaleResources(locale);
  return (
    resources?.[definition.resourceKey]?.[hrid] ??
    englishResources()[definition.resourceKey]?.[hrid] ??
    fallback
  );
}

function elementCandidates(element) {
  const result = [];
  for (let current = element; current && result.length < 24;) {
    result.push(current);
    current = current.parentElement;
  }
  for (const child of element?.querySelectorAll?.("[data-hrid],svg,use") ??
    []) {
    if (!result.includes(child)) result.push(child);
  }
  return result;
}

function datasetHrid(type, element) {
  const names = [
    `${type}Hrid`,
    "hrid",
    "itemHrid",
    "actionHrid",
    "monsterHrid",
    "abilityHrid",
  ];
  for (const name of names) {
    const value = element?.dataset?.[name];
    const direct = directHrid(type, value);
    if (direct) return direct;
  }
  return "";
}

function spriteHrid(type, element) {
  const definition = ENTITY_TYPES[type];
  const href = String(
    element?.getAttribute?.("href") ??
      element?.getAttribute?.("xlink:href") ??
      element?.querySelector?.("use")?.getAttribute?.("href") ??
      "",
  );
  const [base, fragment = ""] = href.split("#");
  if (!fragment || !base.includes(definition.sprite)) return "";
  return `${definition.prefix}${fragment}`;
}

export function resolveEntityFromElement(
  kind,
  element,
  { locale = getGameLocale() } = {},
) {
  const type = entityType(kind);
  if (!type || !element) return "";
  const candidates = elementCandidates(element);
  for (const candidate of candidates) {
    const hrid = datasetHrid(type, candidate) || spriteHrid(type, candidate);
    if (hrid) return hrid;
  }
  for (const candidate of candidates) {
    for (const value of [
      candidate?.getAttribute?.("aria-label"),
      candidate?.getAttribute?.("title"),
      candidate?.textContent,
    ]) {
      const hrid = resolveLocalizedEntity(type, value, { locale });
      if (hrid) return hrid;
    }
  }
  return "";
}

export function getGameTranslation(path, { locale = getGameLocale() } = {}) {
  let value = getGameLocaleResources(locale);
  for (const key of String(path ?? "")
    .replace(/^translation\./, "")
    .split(".")) {
    if (!key || !value || typeof value !== "object") return "";
    value = value[key];
  }
  return typeof value === "string" ? value : "";
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesGameTranslation(
  path,
  text,
  { locale = getGameLocale() } = {},
) {
  const template = getGameTranslation(path, { locale });
  if (!template) return false;
  const parts = template.split(/(<[^>]+\/>|{{[^}]+}}|\$t\([^)]*\))/g);
  const pattern = parts
    .map((part, index) =>
      index % 2 ? ".*?" : escapeRegularExpression(part).replace(/\s+/g, "\\s+"),
    )
    .join("");
  return new RegExp(`^${pattern}$`, "iu").test(String(text ?? "").trim());
}

export function resetGameLocalizationCache() {
  localeResources.clear();
  warnedLocales.clear();
}

Object.assign(runtime.api, {
  getGameLocale,
  getGameLocaleResources,
  registerGameLocaleResources,
  getGameTranslation,
  matchesGameTranslation,
  resolveLocalizedEntity,
  resolveEntityFromElement,
  getLocalizedEntityName,
});
