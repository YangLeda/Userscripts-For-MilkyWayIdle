import { runtime } from "../core/runtime.js";
import { parseCompactNumber } from "../core/market.js";
import { itemName } from "../core/localization.js";
import {
  getLocalizedEntityName,
  resolveLocalizedEntity,
} from "../core/game-localization.js";
import { createFrameScheduler } from "../core/frame-scheduler.js";
import { formatRemainingTiming } from "../core/time-format.js";
import { getGameSpriteHref } from "../core/game-assets.js";

const PRODUCTION_PROFILE_MESSAGES = Object.freeze([
  "init_character_data",
  "items_updated",
  "skills_updated",
  "house_rooms_updated",
  "achievement_buffs_updated",
  "moo_pass_buffs_updated",
  "community_buffs_updated",
  "consumable_buffs_updated",
  "action_type_consumable_slots_updated",
  "equipment_buffs_updated",
  "personal_buffs_updated",
  "guild_buffs_updated",
  "abilities_updated",
  "character_abilities_updated",
]);
const PRODUCTION_PANEL_REBUILD_MESSAGES = new Set([
  "abilities_updated",
  "character_abilities_updated",
]);

const STYLE_ID = "mwitools-action-dashboard-style";
const QUICK_HOURS = [0.5, 1, 2, 3, 4, 5, 6, 10, 12, 24];
const QUICK_COUNTS = [10, 100, 300, 500, 1_000, 2_000];
const ACTION_SURFACE_SELECTOR =
  'div[class*="Header_actionName"],div[class*="SkillActionDetail_regularComponent"],div[class*="SkillActionDetail_skillActionDetail"]';
const OWNED_ACTION_UI_SELECTOR =
  "#mwi-action-dashboard,#mwi-production-summary,.mwi-production-quick-inputs,.mwi-max-action-button,.mwi-production-duration-inline,.mwi-production-extensions";
const PRODUCTION_MODULE_ORDER = Object.freeze({
  quickInputs: 10,
  summary: 20,
  shortage: 30,
  targetLevel: 40,
});
let productionDataRevision = 0;
let enhancementTimingCache = { identity: "", count: null };

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function formatDuration(seconds) {
  if (seconds === Infinity) return "∞";
  if (!Number.isFinite(seconds)) return "—";
  const normalized = Math.max(0, Math.round(seconds));
  if (normalized < 86_400) {
    return runtime.api.timeReadable?.(normalized) || `${normalized}s`;
  }
  const days = Math.floor(normalized / 86_400);
  const hours = Math.floor((normalized % 86_400) / 3_600);
  const minutes = Math.floor((normalized % 3_600) / 60);
  const parts = [t(`${days}天`, `${days}d`)];
  if (hours > 0) parts.push(t(`${hours}小时`, `${hours}h`));
  if (minutes > 0) parts.push(t(`${minutes}分`, `${minutes}m`));
  return parts.join(runtime.config.isZH ? "" : " ");
}

function number(value) {
  return runtime.api.createFormattedNumber(value);
}

function outputItemName(itemHrid) {
  return itemName(itemHrid, { fallback: "?" });
}

function nativeProductionItem(panel, itemHrid, name) {
  const bare = String(itemHrid ?? "")
    .split("/")
    .at(-1);
  const candidates = [
    ...(panel?.querySelectorAll(
      ':scope div[class*="SkillActionDetail_dropTable"] div[class*="Item_item"]',
    ) ?? []),
  ].filter((candidate) =>
    [...candidate.classList].some((className) =>
      className.startsWith("Item_item__"),
    ),
  );
  const prototype =
    candidates.find((candidate) => {
      const href =
        candidate.querySelector("use")?.getAttribute("href") ??
        candidate.querySelector("use")?.getAttribute("xlink:href") ??
        "";
      return bare && href.endsWith(`#${bare}`);
    }) ?? candidates[0];
  if (!prototype) return null;

  const item = prototype.cloneNode(true);
  item.classList.add("mwi-production-native-item");
  for (const className of [...item.classList]) {
    if (className.includes("Item_clickable")) item.classList.remove(className);
  }
  const href = getGameSpriteHref("items", itemHrid);
  const use = item.querySelector("use");
  if (use && href && bare) {
    use.setAttribute("href", href);
    use.setAttribute("xlink:href", href);
  }
  const svg = item.querySelector("svg");
  svg?.setAttribute("aria-label", name);
  const itemName = item.querySelector('[class*="Item_name"]');
  if (itemName) itemName.textContent = name;
  return item;
}

function fallbackProductionItem(itemHrid, name) {
  const item = document.createElement("span");
  item.className = "mwi-production-native-fallback";
  const bare = String(itemHrid ?? "")
    .split("/")
    .at(-1);
  const href = getGameSpriteHref("items", itemHrid);
  if (bare && href) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("mwi-production-output-icon");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("aria-label", name);
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", href);
    use.setAttribute("xlink:href", href);
    svg.append(use);
    item.append(svg);
  } else {
    const fallback = document.createElement("span");
    fallback.className = "mwi-production-output-fallback";
    fallback.setAttribute("aria-hidden", "true");
    fallback.textContent = "?";
    item.append(fallback);
  }
  const label = document.createElement("span");
  label.className = "mwi-production-output-name";
  label.textContent = name;
  item.append(label);
  return item;
}

function createProductionOutput(output, panel) {
  const item = document.createElement("span");
  item.className = "mwi-production-output-item";
  const name = outputItemName(output.itemHrid);
  const normalizedCount = Number.isFinite(Number(output.expectedCount))
    ? Math.round(Number(output.expectedCount) * 1e9) / 1e9
    : output.expectedCount;
  const exactCount =
    runtime.api.formatExactNumber?.(normalizedCount) ?? String(normalizedCount);
  item.title = `${name} ×${exactCount}`;
  item.setAttribute("aria-label", item.title);
  item.append(
    nativeProductionItem(panel, output.itemHrid, name) ??
      fallbackProductionItem(output.itemHrid, name),
  );

  const count = document.createElement("span");
  count.className = "mwi-production-output-count";
  count.append("×", number(output.expectedCount));
  item.append(count);
  return item;
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  const productionFont = runtime.config.isZH
    ? "inherit"
    : 'ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif';
  style.textContent = `
    .mwi-action-dashboard-host { position:relative!important; }
    .mwi-action-dashboard { position:absolute; top:50%; right:0; z-index:5; box-sizing:border-box; max-width:var(--mwi-action-dashboard-max-width,calc(100% - var(--mwi-action-dashboard-left,0px))); margin:0; padding:2px 6px; transform:translateY(-50%); border:1px solid rgba(255,255,255,.1); border-radius:4px; background:rgba(0,0,0,.18); font:inherit; font-size:inherit; line-height:1.25; white-space:normal; overflow:hidden; pointer-events:none; }
    .mwi-action-line { display:flex; align-items:center; flex-wrap:nowrap; gap:3px 10px; max-width:100%; color:#ffa500; }
    .mwi-action-line > * { min-width:0; white-space:nowrap; }
    .mwi-action-line strong { color:inherit; font-weight:650; }
    .mwi-action-dashboard[data-compact="true"] { right:auto; width:max-content; padding-inline:4px; }
    .mwi-action-dashboard[data-compact="true"] .mwi-action-line { gap:2px 6px; }
    .mwi-action-time { overflow:hidden; text-overflow:ellipsis; font-variant-numeric:tabular-nums; }
    .mwi-production-card { width:100%; max-width:100%; min-width:0; box-sizing:border-box; contain:inline-size; margin-top:6px; padding:6px; border:1px solid rgba(255,255,255,.12); border-radius:5px; background:rgba(255,255,255,.025); color:var(--color-text-primary,#eee); font-family:${productionFont}; font-size:calc(.6875rem * var(--mwi-ui-font-scale,1)); }
    .mwi-production-extensions { display:contents!important; }
    .mwi-production-extensions > * { flex:0 0 auto!important; align-self:stretch; min-height:0!important; height:auto!important; }
    .mwi-production-card-title { display:flex; width:100%; align-items:center; gap:6px; box-sizing:border-box; padding:0 2px 4px; border:0; background:transparent; color:inherit; font:inherit; font-size:calc(.75rem * var(--mwi-ui-font-scale,1)); font-weight:650; text-align:left; cursor:pointer; }
    .mwi-production-card-title::before { content:"▸"; color:var(--color-text-secondary,#aaa); transition:transform .12s ease; }
    .mwi-production-card[data-expanded="true"] .mwi-production-card-title::before { transform:rotate(90deg); }
    .mwi-production-card[data-mode="expanded"] .mwi-production-card-title { cursor:default; }
    .mwi-production-card[data-mode="expanded"] .mwi-production-card-title::before { content:""; }
    .mwi-production-card-body[hidden] { display:none; }
    .mwi-production-metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,110px),1fr)); gap:4px; }
    .mwi-production-metric { min-width:0; overflow:hidden; padding:4px 3px; border-radius:3px; background:rgba(0,0,0,.14); text-align:center; }
    .mwi-production-label { min-height:1.45em; color:var(--color-text-secondary,#aaa); font-size:calc(.6875rem * var(--mwi-ui-font-scale,1)); line-height:1.2; }
    .mwi-production-value { margin-top:1px; font-size:calc(.72rem * var(--mwi-ui-font-scale,1)); line-height:1.25; font-weight:600; overflow-wrap:anywhere; }
    .mwi-production-output-metric { grid-column:1/-1; }
    .mwi-production-output-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,120px),1fr)); gap:4px 8px; width:100%; }
    .mwi-production-output-grid[data-count="1"] .mwi-production-output-item { grid-column:1/-1; }
    .mwi-production-output-item { display:flex; min-width:0; align-items:center; justify-content:center; gap:4px; overflow:hidden; }
    .mwi-production-native-item,.mwi-production-native-fallback { display:inline-flex!important; min-width:0; align-items:center; gap:4px; overflow:hidden; pointer-events:none; }
    .mwi-production-native-fallback { padding:1px 6px; border:1px solid rgb(152,167,233); border-radius:4px; background:rgb(44,46,69); color:rgb(231,231,231); }
    .mwi-production-native-item [class*="Item_iconContainer"] { width:14px!important; height:14px!important; flex:0 0 14px!important; }
    .mwi-production-native-item [class*="Item_name"],.mwi-production-output-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mwi-production-output-icon,.mwi-production-output-fallback { display:grid; width:14px; height:14px; flex:0 0 14px; place-items:center; }
    .mwi-production-output-fallback { border-radius:4px; background:rgba(255,255,255,.08); color:var(--color-text-secondary,#aaa); font-size:calc(.72rem * var(--mwi-ui-font-scale,1)); }
    .mwi-production-output-count { flex:0 0 auto; min-width:0; font-size:calc(.72rem * var(--mwi-ui-font-scale,1)); font-weight:700; line-height:1; white-space:nowrap; }
    .mwi-production-warning { margin:4px 2px 0; color:#d7bb67; font-size:calc(.6875rem * var(--mwi-ui-font-scale,1)); line-height:1.25; }
    .mwi-max-action-button { margin-inline-start:4px; }
    .mwi-production-duration-inline { display:inline-flex; align-items:center; margin-inline-start:7px; padding:0; border:0; background:transparent; color:${runtime.config.SCRIPT_COLOR_MAIN}; font-family:${productionFont}; font-size:calc(.6875rem * var(--mwi-ui-font-scale,1)); line-height:1.2; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .mwi-production-quick-inputs { position:relative; display:grid; z-index:0; box-sizing:border-box; gap:3px; width:100%; min-width:0; margin:4px 0 1px; color:var(--color-text-secondary,#aaa); font-size:calc(.6875rem * var(--mwi-ui-font-scale,1)); }
    .mwi-production-quick-row { display:flex; min-width:0; align-items:flex-start; gap:3px; }
    .mwi-production-quick-label { flex:0 0 3.25em; color:${runtime.config.SCRIPT_COLOR_MAIN}; white-space:nowrap; }
    .mwi-production-quick-buttons { display:flex; min-width:0; flex:1; flex-wrap:wrap; gap:2px; }
    .mwi-production-quick-button { min-width:0!important; height:21px!important; padding:1px 5px!important; font-size:calc(.6875rem * var(--mwi-ui-font-scale,1))!important; line-height:1!important; }
    @media(max-width:520px){.mwi-action-dashboard{right:auto;width:max-content;padding-inline:4px}.mwi-action-line{gap:2px 6px}.mwi-production-card{padding:5px}.mwi-production-card-title{padding-bottom:3px}.mwi-production-metrics,.mwi-production-output-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:3px}.mwi-production-metric{padding:3px 2px}.mwi-production-label{min-height:1.3em}.mwi-production-output-grid[data-count="1"] .mwi-production-output-item{grid-column:1/-1}.mwi-production-output-item{gap:3px}}
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function getLiveActionTiming(host) {
  const currentAction =
    host?.closest?.('[class*="Header_currentAction"]') ?? host?.parentElement;
  const bar = currentAction?.querySelector?.(
    '[class*="ProgressBar_progressBar"]',
  );
  if (!bar) return { durationPerAction: null, currentCycleRemaining: null };

  let durationPerAction = Number(bar.style?.getPropertyValue?.("--duration"));
  if (!Number.isFinite(durationPerAction) || durationPerAction <= 0) {
    const text = runtime.api.getOriTextFromElement?.(
      bar.querySelector('[class*="ProgressBar_text"]'),
    );
    const match = String(text ?? "").match(/[\d.,\s\u00a0\u202f]+/);
    durationPerAction = match ? parseCompactNumber(match[0]) : null;
  }
  if (!Number.isFinite(durationPerAction) || durationPerAction <= 0) {
    return { durationPerAction: null, currentCycleRemaining: null };
  }

  const active = bar.querySelector('[class*="ProgressBar_active"]');
  const transform = active
    ? (active.ownerDocument?.defaultView?.getComputedStyle(active).transform ??
      active.style?.transform)
    : null;
  const match = String(transform ?? "").match(/^matrix(?:3d)?\(\s*(-?[\d.]+)/);
  const progress = match ? Number(match[1]) : null;
  const currentCycleRemaining = Number.isFinite(progress)
    ? durationPerAction * (1 - Math.min(1, Math.max(0, progress)))
    : durationPerAction;
  return { durationPerAction, currentCycleRemaining };
}

function getNativeEnhancementCount(host, action) {
  if (!String(action?.actionHrid ?? "").includes("/enhancing")) return null;
  const matches = [
    ...nativeActionText(host).matchAll(/[（(]\s*([\d\s.,]+)\s*[)）]/g),
  ];
  const match = matches.at(-1);
  if (!match) return null;
  const count = parseCompactNumber(match[1]);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function getProductionPanelDuration(panel) {
  for (const value of panel?.querySelectorAll(
    'div[class*="SkillActionDetail_value"]',
  ) ?? []) {
    const text = String(runtime.api.getOriTextFromElement?.(value) ?? "")
      .trim()
      .replaceAll(runtime.config.THOUSAND_SEPERATOR, "")
      .replace(runtime.config.DECIMAL_SEPERATOR, ".");
    const match = text.match(/^([\d.]+)\s*s$/i);
    if (match && Number(match[1]) > 0) return Number(match[1]);
  }
  return null;
}

function clearActionDashboard() {
  document.querySelector("#mwi-action-dashboard")?.remove();
  document
    .querySelectorAll(".mwi-action-dashboard-host")
    .forEach((element) =>
      element.classList.remove("mwi-action-dashboard-host"),
    );
  enhancementTimingCache = { identity: "", count: null };
}

function nativeActionText(host) {
  return [...(host?.childNodes ?? [])]
    .filter(
      (node) =>
        node.nodeType !== 1 ||
        (node.id !== "mwi-action-dashboard" &&
          node.id !== "script_item_warning"),
    )
    .map((node) => node.textContent ?? "")
    .join(" ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function normalizedActionText(value) {
  return String(value ?? "")
    .replaceAll(/\([^)]*\)\s*$/g, "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function actionHeaderNames(actionHrid, detail) {
  const names = new Set([
    detail?.name,
    getLocalizedEntityName("action", actionHrid),
  ]);
  for (const output of runtime.api.getExpectedOutputs?.(detail) ?? []) {
    names.add(runtime.state.initData_itemDetailMap?.[output.itemHrid]?.name);
    names.add(getLocalizedEntityName("item", output.itemHrid));
  }
  return [...names].map(normalizedActionText).filter(Boolean);
}

function actionMatchesHeader(action, host) {
  const actionHrid = action?.actionHrid;
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  if (!actionHrid || !detail || detail.type === "/action_types/combat") {
    return false;
  }
  const header = normalizedActionText(nativeActionText(host));
  if (!header || /^(doing nothing|无事可做|没有行动)$/.test(header)) {
    return false;
  }
  if (resolveLocalizedEntity("action", header) === actionHrid) return true;
  if (String(actionHrid).includes("/enhancing")) {
    return (
      getNativeEnhancementCount(host, action) !== null ||
      /\+\s*\d+/.test(header) ||
      actionHeaderNames(actionHrid, detail).some((name) =>
        header.includes(name),
      )
    );
  }
  return actionHeaderNames(actionHrid, detail).some(
    (name) => header === name || header.includes(name),
  );
}

function rectWidth(rect) {
  return Math.max(
    0,
    Number(rect?.width) || Number(rect?.right) - Number(rect?.left),
  );
}

function actionDashboardLayout(host, lastNativeChild) {
  const hostRect = host.getBoundingClientRect();
  const currentAction =
    host.closest?.('[class*="Header_currentAction"]') ?? host.parentElement;
  const currentActionRect = currentAction?.getBoundingClientRect?.();
  const layoutRect = rectWidth(hostRect) ? hostRect : currentActionRect;
  const layoutLeft = Number(layoutRect?.left) || 0;
  let layoutRight = Number(layoutRect?.right) || layoutLeft;
  const childRect = lastNativeChild?.getBoundingClientRect();
  const childRight = Number(childRect?.right) || layoutLeft;

  for (const sibling of currentAction?.parentElement?.children ?? []) {
    if (sibling === currentAction) continue;
    const siblingRect = sibling.getBoundingClientRect?.();
    const siblingLeft = Number(siblingRect?.left);
    if (
      rectWidth(siblingRect) > 0 &&
      Number.isFinite(siblingLeft) &&
      siblingLeft >= childRight
    ) {
      layoutRight = Math.min(layoutRight, siblingLeft - 6);
    }
  }

  const left = Math.max(0, childRight - layoutLeft + 7);
  return {
    left,
    availableWidth: Math.max(0, layoutRight - layoutLeft - left),
  };
}

function renderActionDashboard() {
  addStyles();
  const host = document.querySelector('div[class*="Header_actionName"]');
  const actions = [...(runtime.state.currentActionsHridList ?? [])].sort(
    (left, right) => Number(left?.ordinal ?? 0) - Number(right?.ordinal ?? 0),
  );
  const current = actions[0];
  if (!host || !current) {
    clearActionDashboard();
    return null;
  }
  const identity = String(current.id ?? current.actionHrid ?? "");
  const isEnhancement = String(current.actionHrid ?? "").includes("/enhancing");
  const existingRoot = host.querySelector("#mwi-action-dashboard");
  if (!actionMatchesHeader(current, host)) {
    if (isEnhancement && existingRoot?.dataset.actionIdentity === identity) {
      return existingRoot;
    }
    clearActionDashboard();
    return null;
  }
  const timing = getLiveActionTiming(host);
  let enhancementCount = getNativeEnhancementCount(host, current);
  if (isEnhancement) {
    if (enhancementTimingCache.identity !== identity) {
      enhancementTimingCache = { identity, count: null };
    }
    if (enhancementCount !== null) {
      enhancementTimingCache.count = enhancementCount;
    } else if (enhancementTimingCache.count !== null) {
      enhancementCount = enhancementTimingCache.count;
    } else if (existingRoot?.dataset.actionIdentity === identity) {
      return existingRoot;
    } else {
      clearActionDashboard();
      return null;
    }
  } else {
    enhancementTimingCache = { identity: "", count: null };
  }
  const projection = runtime.api.projectAction(
    current,
    enhancementCount ?? undefined,
    {
      durationPerAction: timing.durationPerAction,
      currentCycleRemainingSeconds: timing.currentCycleRemaining,
    },
  );
  let root = existingRoot;
  if (!root) {
    root = document.createElement("div");
    root.id = "mwi-action-dashboard";
    root.className = "mwi-action-dashboard";
    host.appendChild(root);
  }
  host.classList.add("mwi-action-dashboard-host");
  root.dataset.actionIdentity = identity;
  root.style.position = "absolute";
  const lastNativeChild = [...host.children]
    .filter(
      (element) => element !== root && element.id !== "script_item_warning",
    )
    .at(-1);
  const { left, availableWidth } = actionDashboardLayout(host, lastNativeChild);
  root.style.left = `${left}px`;
  root.style.setProperty("--mwi-action-dashboard-left", `${left}px`);
  if (availableWidth > 0) {
    root.style.setProperty(
      "--mwi-action-dashboard-max-width",
      `${availableWidth}px`,
    );
  } else {
    root.style.removeProperty("--mwi-action-dashboard-max-width");
  }
  const viewportWidth =
    Number(host.ownerDocument?.defaultView?.innerWidth) || 0;
  root.dataset.compact = String(
    (availableWidth > 0 && availableWidth < 420) ||
      (availableWidth === 0 && viewportWidth > 0 && viewportWidth <= 520),
  );
  root.dataset.tight = String(availableWidth > 0 && availableWidth < 180);
  root.removeAttribute("title");
  let primary = root.querySelector(":scope > .mwi-action-line");
  if (!primary) {
    primary = document.createElement("div");
    primary.className = "mwi-action-line";
    root.append(primary);
  }
  let currentTime = primary.querySelector(":scope > .mwi-action-time");
  if (!currentTime) {
    currentTime = document.createElement("strong");
    currentTime.className = "mwi-action-time";
    primary.append(currentTime);
  }
  currentTime.textContent = formatRemainingTiming(
    projection.totalSeconds,
    projection.finishAt,
    { isZH: runtime.config.isZH },
  );
  currentTime.removeAttribute("title");
  if (projection.materialLimited) {
    currentTime.title = t(
      "已按当前库存中的可用原料计算",
      "Limited by materials currently in inventory",
    );
  } else if (enhancementCount !== null) {
    currentTime.title = t(
      "已按强化栏当前可处理数量计算",
      "Based on the amount currently available for enhancement",
    );
  }
  return root;
}

function mutationElement(node) {
  return node?.nodeType === 1 ? node : node?.parentElement;
}

function isOwnedActionUi(node) {
  const element = mutationElement(node);
  return Boolean(
    element?.matches?.(OWNED_ACTION_UI_SELECTOR) ||
    element?.closest?.(OWNED_ACTION_UI_SELECTOR),
  );
}

function shouldScheduleActionUi(records) {
  return records.some((record) => {
    const target = mutationElement(record.target);
    const removedProductionMount = [...(record.removedNodes ?? [])].some(
      (node) =>
        node?.nodeType === 1 &&
        (node.matches?.(".mwi-production-extensions") ||
          node.querySelector?.(".mwi-production-extensions")),
    );
    if (removedProductionMount && target?.closest?.(ACTION_SURFACE_SELECTOR)) {
      return true;
    }
    const changed = [
      ...(record.addedNodes ?? []),
      ...(record.removedNodes ?? []),
    ].filter((node) => node?.nodeType === 1);
    if (
      isOwnedActionUi(target) ||
      (changed.length && changed.every(isOwnedActionUi))
    ) {
      return false;
    }
    if (target?.closest?.(ACTION_SURFACE_SELECTOR)) return true;
    return changed.some(
      (node) =>
        node.matches?.(ACTION_SURFACE_SELECTOR) ||
        node.querySelector?.(ACTION_SURFACE_SELECTOR),
    );
  });
}

function bindActionUiRenderer(scope, render, messages = []) {
  const scheduler = createFrameScheduler(render);
  const schedule = () => scheduler.schedule();
  const MutationObserverRef =
    globalThis.MutationObserver ?? document.defaultView?.MutationObserver;
  const observer = new MutationObserverRef((records) => {
    if (shouldScheduleActionUi(records)) schedule();
  });
  scope.observer(observer, document.body, { childList: true, subtree: true });
  const scheduleFromInput = (event) => {
    if (event.target?.closest?.(ACTION_SURFACE_SELECTOR)) schedule();
  };
  scope.event(document, "input", scheduleFromInput, true);
  scope.event(document, "change", scheduleFromInput, true);
  for (const message of messages) {
    scope.add(
      runtime.onMessage(message, () => {
        productionDataRevision += 1;
        schedule();
        if (PRODUCTION_PANEL_REBUILD_MESSAGES.has(message)) {
          scope.timeout(schedule, 100);
          scope.timeout(schedule, 300);
        }
      }),
    );
  }
  scope.add(() => scheduler.cancel());
  return { schedule };
}

function isHiddenActionElement(element) {
  for (let current = element; current; current = current.parentElement) {
    const className = String(current.className ?? "");
    if (
      current.hidden ||
      current.getAttribute?.("aria-hidden") === "true" ||
      current.style?.display === "none" ||
      current.style?.visibility === "hidden" ||
      (/MainPanel_/.test(className) && /hidden/i.test(className))
    ) {
      return true;
    }
    const style = current.ownerDocument?.defaultView?.getComputedStyle(current);
    if (style?.display === "none" || style?.visibility === "hidden") {
      return true;
    }
  }
  return false;
}

function resolveActiveProductionPanelContext() {
  const panels = [
    ...document.querySelectorAll(
      'div[class*="SkillActionDetail_regularComponent"],div[class*="SkillActionDetail_skillActionDetail"]',
    ),
  ]
    .filter((panel) => !isHiddenActionElement(panel))
    .sort((left, right) => {
      const modalPriority =
        Number(Boolean(right.closest('[class*="Modal_modalContainer"]'))) -
        Number(Boolean(left.closest('[class*="Modal_modalContainer"]')));
      if (modalPriority) return modalPriority;
      if (left.contains(right)) return 1;
      if (right.contains(left)) return -1;
      return 0;
    });
  for (const panel of panels) {
    const actionHrid = resolvePanelAction(panel);
    if (!actionHrid || !isProductionAction(actionHrid)) continue;
    const input = getCountInput(panel);
    const parsedCount = input
      ? runtime.api.parseCompactNumber?.(input.value)
      : Number.NaN;
    return {
      panel,
      input,
      actionHrid,
      count:
        Number.isFinite(parsedCount) && parsedCount > 0
          ? Math.ceil(parsedCount)
          : null,
    };
  }
  return null;
}

function getProductionPanelMount(panel, { create = true } = {}) {
  if (!panel) return null;
  let mount = panel.querySelector(":scope > .mwi-production-extensions");
  if (mount || !create) return mount;
  mount = document.createElement("div");
  mount.className = "mwi-production-extensions";
  mount.dataset.mwitoolsProductionExtension = "true";
  const anchor =
    panel.querySelector('div[class*="SkillActionDetail_actionContainer"]') ??
    panel.querySelector('div[class*="SkillActionDetail_name"]');
  if (anchor) anchor.insertAdjacentElement("afterend", mount);
  else panel.append(mount);
  return mount;
}

function mountProductionModule(panel, element, slot) {
  const mount = getProductionPanelMount(panel);
  if (!mount || !element) return null;
  element.dataset.mwitoolsProductionSlot = slot;
  const order = PRODUCTION_MODULE_ORDER[slot] ?? Number.MAX_SAFE_INTEGER;
  const next = [...mount.children].find(
    (child) =>
      (PRODUCTION_MODULE_ORDER[child.dataset.mwitoolsProductionSlot] ??
        Number.MAX_SAFE_INTEGER) > order,
  );
  mount.insertBefore(element, next ?? null);
  return element;
}

function findActionPanel() {
  return resolveActiveProductionPanelContext()?.panel ?? null;
}

function getCountInput(panel) {
  return panel?.querySelector(
    'div[class*="SkillActionDetail_maxActionCountInput"] input',
  );
}

function findInfinityButton(panel, input) {
  const container =
    input?.closest('div[class*="SkillActionDetail_actionContainer"]') ?? panel;
  return [...(container?.querySelectorAll("button") ?? [])].find((button) => {
    if (button.classList.contains("mwi-max-action-button")) return false;
    const text = String(
      runtime.api.getOriTextFromElement?.(button) ?? button.textContent ?? "",
    ).trim();
    return text === "∞" || /infinite|unlimited/i.test(button.title ?? "");
  });
}

function setReactInputValue(input, value) {
  if (typeof runtime.api.reactInputTriggerHack === "function") {
    runtime.api.reactInputTriggerHack(input, value);
    return;
  }
  const view = input.ownerDocument?.defaultView ?? window;
  const previous = input.value;
  const setter = Object.getOwnPropertyDescriptor(
    view.HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input._valueTracker?.setValue(previous);
  input.dispatchEvent(new view.Event("input", { bubbles: true }));
}

function removeProductionQuickInputs() {
  document
    .querySelectorAll(".mwi-production-quick-inputs")
    .forEach((element) => element.remove());
}

function quickButtonPrototype(panel, input) {
  const container =
    input?.closest('div[class*="SkillActionDetail_maxActionCountInput"]') ??
    panel;
  return [...(container?.querySelectorAll("button") ?? [])].find(
    (button) => !button.classList.contains("mwi-production-quick-button"),
  );
}

function applyProductionQuickCount(input, count) {
  if (!input?.isConnected || !Number.isSafeInteger(count) || count <= 0) return;
  setReactInputValue(input, String(count));
  input.dispatchEvent(
    new (input.ownerDocument?.defaultView?.Event ?? Event)("change", {
      bubbles: true,
    }),
  );
  renderProductionPanel();
}

function getMinimumCountForDuration(actionHrid, targetSeconds, cycleSeconds) {
  if (
    !Number.isFinite(targetSeconds) ||
    targetSeconds <= 0 ||
    !Number.isFinite(cycleSeconds) ||
    cycleSeconds <= 0
  ) {
    return 0;
  }
  const efficiencyPercent = Number(
    runtime.api.getTotalEffiPercentage?.(actionHrid),
  );
  const rawMultiplier = 1 + efficiencyPercent / 100;
  const efficiencyMultiplier =
    Number.isFinite(rawMultiplier) && rawMultiplier > 0 ? rawMultiplier : 1;
  const targetCycles = Math.max(1, Math.ceil(targetSeconds / cycleSeconds));
  let count = Math.max(
    1,
    Math.ceil((targetCycles - 0.5) * efficiencyMultiplier),
  );
  while (Math.round(count / efficiencyMultiplier) < targetCycles) count += 1;
  while (
    count > 1 &&
    Math.round((count - 1) / efficiencyMultiplier) >= targetCycles
  ) {
    count -= 1;
  }
  return count;
}

function createProductionQuickRow({
  panel,
  input,
  id,
  label,
  values,
  resolveCount,
}) {
  const row = document.createElement("div");
  row.id = id;
  row.className = "mwi-production-quick-row";
  const caption = document.createElement("span");
  caption.className = "mwi-production-quick-label";
  caption.textContent = label;
  const buttons = document.createElement("div");
  buttons.className = "mwi-production-quick-buttons";
  const prototype = quickButtonPrototype(panel, input);
  for (const value of values) {
    const button =
      prototype?.cloneNode(false) ?? document.createElement("button");
    button.type = "button";
    button.classList.add("mwi-production-quick-button");
    button.textContent = runtime.api.numberFormatter(value);
    button.dataset.quickValue = String(value);
    button.addEventListener("click", () => {
      const count = resolveCount(value);
      applyProductionQuickCount(input, count);
    });
    buttons.append(button);
  }
  row.append(caption, buttons);
  return row;
}

function renderProductionQuickInputs() {
  addStyles();
  const context = resolveActiveProductionPanelContext();
  const panel = context?.panel ?? null;
  const input = context?.input ?? null;
  const actionHrid = context?.actionHrid ?? null;
  document.querySelectorAll(".mwi-production-quick-inputs").forEach((host) => {
    if (!panel?.contains(host)) host.remove();
  });
  if (!panel || !input || !actionHrid || !isProductionAction(actionHrid)) {
    panel?.querySelector(".mwi-production-quick-inputs")?.remove();
    return null;
  }
  const countGroup = input.closest(
    'div[class*="SkillActionDetail_maxActionCountInput"]',
  );
  if (!countGroup) return null;

  let host = panel.querySelector(".mwi-production-quick-inputs");
  const duration = getProductionPanelDuration(panel);
  if (!host) {
    host = document.createElement("div");
    host.className = "mwi-production-quick-inputs";
    const hours = createProductionQuickRow({
      panel,
      input,
      id: "quickInputHourButtons",
      label: t("时长", "Hours"),
      values: QUICK_HOURS,
      resolveCount: (hoursValue) => {
        const liveDuration = getProductionPanelDuration(panel);
        return getMinimumCountForDuration(
          actionHrid,
          hoursValue * 3_600,
          liveDuration,
        );
      },
    });
    const counts = createProductionQuickRow({
      panel,
      input,
      id: "quickInputCountButtons",
      label: t("次数", "Count"),
      values: QUICK_COUNTS,
      resolveCount: (count) => count,
    });
    host.append(hours, counts);
    mountProductionModule(panel, host, "quickInputs");
  }
  const efficiencyPercent = Number(
    runtime.api.getTotalEffiPercentage?.(actionHrid),
  );
  const normalizedEfficiency =
    Number.isFinite(efficiencyPercent) && efficiencyPercent > -100
      ? efficiencyPercent
      : 0;
  host.querySelectorAll("#quickInputHourButtons button").forEach((button) => {
    button.disabled = !Number.isFinite(duration) || duration <= 0;
    button.title = button.disabled
      ? t("无法读取当前单次耗时", "Current action duration unavailable")
      : t(
          `按当前 ${duration}s/次与 ${normalizedEfficiency.toFixed(1)}% 综合效率换算，实际时长不少于所选值；增益变化后请重新选择`,
          `Uses the current ${duration}s cycle and ${normalizedEfficiency.toFixed(1)}% efficiency, rounding up to at least the selected duration; select again after buffs change`,
        );
  });
  return host;
}

function syncMaxButton(panel, input, maxCraftable) {
  let button = panel?.querySelector(".mwi-max-action-button");
  const infinityButton = findInfinityButton(panel, input);
  if (!input || !infinityButton) {
    button?.remove();
    return;
  }
  if (!button) {
    button = infinityButton.cloneNode(false);
    button.type = "button";
    button.classList.add("mwi-max-action-button");
    button.textContent = t("最大", "Max");
    button.addEventListener("click", () => {
      const count = Number(button.dataset.maxCraftable);
      if (!Number.isSafeInteger(count) || count <= 0) return;
      const livePanel = button.closest(
        'div[class*="SkillActionDetail_regularComponent"],div[class*="SkillActionDetail_skillActionDetail"]',
      );
      const liveInput = getCountInput(livePanel) ?? input;
      setReactInputValue(liveInput, String(count));
      liveInput.dispatchEvent(
        new (liveInput.ownerDocument?.defaultView?.Event ?? Event)("change", {
          bubbles: true,
        }),
      );
      renderProductionPanel();
    });
    infinityButton.insertAdjacentElement("afterend", button);
  }
  const enabled = Number.isSafeInteger(maxCraftable) && maxCraftable > 0;
  button.disabled = !enabled;
  button.dataset.maxCraftable = enabled ? String(maxCraftable) : "";
  button.title = enabled
    ? t(
        `填入库存最多可做 ${maxCraftable} 次`,
        `Use inventory maximum: ${maxCraftable}`,
      )
    : t("当前没有有限的可生产次数", "No finite production maximum");
}

function syncProductionDuration(panel, input, totalSeconds) {
  document
    .querySelectorAll(".mwi-production-duration-inline")
    .forEach((element) => {
      if (!panel?.contains(element)) element.remove();
    });
  const target =
    input?.closest(
      'div[class*="SkillActionDetail_maxActionCountInput"],div[class*="SkillActionDetail_actionContainer"]',
    ) ??
    panel?.querySelector('div[class*="SkillActionDetail_actionContainer"]');
  if (!target) return null;
  let duration = panel.querySelector(".mwi-production-duration-inline");
  if (!duration) {
    duration = document.createElement("span");
    duration.className = "mwi-production-duration-inline";
  }
  duration.textContent = `${t("耗时", "Duration")} ${formatDuration(totalSeconds)}`;
  target.append(duration);
  return duration;
}

function removeProductionDuration() {
  document
    .querySelectorAll(".mwi-production-duration-inline")
    .forEach((element) => element.remove());
}

function resolvePanelAction(panel) {
  const nameElement = panel?.querySelector(
    'div[class*="SkillActionDetail_name"]',
  );
  if (!nameElement) return null;
  const name = runtime.api.getOriTextFromElement?.(nameElement)?.trim();
  if (!name) return null;

  const localizedAction = resolveLocalizedEntity("action", name);
  if (localizedAction) return localizedAction;

  const actionMap = runtime.state.initData_actionDetailMap;
  if (!actionMap) return null;

  const candidateNames = new Set([name]);
  for (const [actionHrid, detail] of Object.entries(actionMap)) {
    if (candidateNames.has(detail?.name)) return actionHrid;
  }

  const itemHrid = resolveLocalizedEntity("item", name);
  if (itemHrid) {
    const outputAction = Object.entries(actionMap).find(([, detail]) =>
      runtime.api
        .getExpectedOutputs?.(detail)
        .some((output) => output.itemHrid === itemHrid),
    );
    if (outputAction) return outputAction[0];
  }

  return runtime.api.getActionHridFromItemName?.(name) ?? null;
}

function isProductionAction(actionHrid) {
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  if (!detail) return false;
  const actionType = String(detail.type ?? "");
  if (actionType.includes("combat")) return false;
  return Boolean(runtime.api.getExpectedOutputs?.(detail)?.length);
}

function metric(label, value) {
  const box = document.createElement("div");
  box.className = "mwi-production-metric";
  const caption = document.createElement("div");
  caption.className = "mwi-production-label";
  caption.textContent = label;
  const content = document.createElement("div");
  content.className = "mwi-production-value";
  if (value?.nodeType) content.append(value);
  else content.textContent = value;
  box.append(caption, content);
  return box;
}

function renderProductionPanel() {
  addStyles();
  const summaryMode =
    runtime.settings.getPreference?.("productionSummaryMode") ??
    (runtime.settings.get("productionSummary") ? "collapsed" : "off");
  if (!runtime.settings.get("productionSummary") || summaryMode === "off") {
    document
      .querySelectorAll("#mwi-production-summary")
      .forEach((card) => card.remove());
    document
      .querySelectorAll(".mwi-max-action-button")
      .forEach((button) => button.remove());
    removeProductionDuration();
    return;
  }
  const context = resolveActiveProductionPanelContext();
  const panel = context?.panel ?? null;
  const input = context?.input ?? null;
  const existingCards = [
    ...document.querySelectorAll("#mwi-production-summary"),
  ];
  if (!panel) {
    existingCards.forEach((card) => card.remove());
    document
      .querySelectorAll(".mwi-max-action-button")
      .forEach((button) => button.remove());
    removeProductionDuration();
    return;
  }
  existingCards
    .filter((card) => !panel.contains(card))
    .forEach((card) => card.remove());
  document.querySelectorAll(".mwi-max-action-button").forEach((button) => {
    if (!panel.contains(button)) button.remove();
  });
  const existingCard = panel.querySelector("#mwi-production-summary");
  const actionHrid = context?.actionHrid ?? null;
  if (!actionHrid || !isProductionAction(actionHrid)) {
    existingCard?.remove();
    panel.querySelector(".mwi-max-action-button")?.remove();
    panel.querySelector(".mwi-production-duration-inline")?.remove();
    return;
  }
  const count = context?.count ?? Number.POSITIVE_INFINITY;
  const durationPerAction = getProductionPanelDuration(panel);
  const showProfit =
    runtime.settings.get("productionProfit") &&
    !runtime.api.shouldSuppressMarketFeatures?.();
  const actionType =
    runtime.state.initData_actionDetailMap?.[actionHrid]?.type ?? null;
  const selectedDrinkHrids = Array.isArray(
    runtime.state.initData_actionTypeDrinkSlotsMap?.[actionType],
  )
    ? runtime.state.initData_actionTypeDrinkSlotsMap[actionType].map(
        (drink) => drink?.itemHrid ?? null,
      )
    : [];
  const signature = JSON.stringify([
    actionHrid,
    Number.isFinite(count) ? count : "infinite",
    durationPerAction,
    showProfit,
    summaryMode,
    runtime.config.isZH,
    productionDataRevision,
    selectedDrinkHrids,
    (runtime.state.initData_characterItems ?? []).map((item) => [
      item.itemHrid,
      item.itemLocationHrid,
      item.enhancementLevel ?? 0,
      item.count ?? 0,
    ]),
  ]);
  const hasDuration = Boolean(
    panel.querySelector(".mwi-production-duration-inline"),
  );
  const needsMaxButton = Boolean(
    input &&
    findInfinityButton(panel, input) &&
    !panel.querySelector(".mwi-max-action-button"),
  );
  if (
    existingCard?.dataset.renderSignature === signature &&
    hasDuration &&
    !needsMaxButton
  ) {
    return existingCard;
  }
  const projection = runtime.api.projectAction(actionHrid, count, {
    durationPerAction,
    respectInventoryLimit: !Number.isFinite(count),
  });
  syncMaxButton(panel, input, projection.maxCraftable);
  syncProductionDuration(panel, input, projection.totalSeconds);
  if (existingCard?.dataset.renderSignature === signature) return existingCard;
  let card = panel.querySelector("#mwi-production-summary");
  if (!card) {
    card = document.createElement("section");
    card.id = "mwi-production-summary";
    card.className = "mwi-production-card";
    mountProductionModule(panel, card, "summary");
  }
  const sameAction = card.dataset.actionHrid === actionHrid;
  const wasExpanded = sameAction && card.dataset.expanded === "true";
  card.dataset.renderSignature = signature;
  card.dataset.actionHrid = actionHrid;
  card.dataset.mode = summaryMode;
  const expanded = summaryMode === "expanded" || wasExpanded;
  card.dataset.expanded = String(expanded);
  const extensions = [
    ...card.querySelectorAll('[data-mwitools-production-extension="true"]'),
  ];
  for (const extension of extensions) {
    card.insertAdjacentElement("afterend", extension);
  }
  card.replaceChildren();
  const title = document.createElement("button");
  title.type = "button";
  title.className = "mwi-production-card-title";
  title.textContent = t("本次生产摘要", "Production summary");
  title.setAttribute("aria-expanded", String(expanded));
  const body = document.createElement("div");
  body.className = "mwi-production-card-body";
  body.hidden = !expanded;
  if (summaryMode === "collapsed") {
    title.addEventListener("click", () => {
      const next = card.dataset.expanded !== "true";
      card.dataset.expanded = String(next);
      title.setAttribute("aria-expanded", String(next));
      body.hidden = !next;
    });
  }
  const grid = document.createElement("div");
  grid.className = "mwi-production-metrics";

  const outputs = document.createElement("div");
  outputs.className = "mwi-production-output-grid";
  outputs.dataset.count = String(projection.outputs?.length ?? 0);
  projection.outputs?.forEach((output) =>
    outputs.append(createProductionOutput(output, panel)),
  );
  const outputMetric = metric(
    projection.effectivelyInfinite
      ? t("预期单次产出", "Output per action")
      : t("预期总产出", "Total output"),
    outputs,
  );
  outputMetric.classList.add("mwi-production-output-metric");
  grid.append(
    outputMetric,
    metric(
      t("当前拥有", "Owned"),
      projection.outputs?.length
        ? projection.outputs
            .map((output) => runtime.api.numberFormatter(output.owned))
            .join(" · ")
        : "—",
    ),
    metric(
      t("库存最多可做", "Max craftable"),
      projection.maxCraftable === Infinity
        ? "∞"
        : number(projection.maxCraftable),
    ),
  );
  if (showProfit) {
    grid.append(
      metric(
        t("每次净利润", "Per action"),
        number(projection.netProfitPerAction),
      ),
      metric(t("每小时净利润", "Per hour"), number(projection.profitPerHour)),
      metric(
        t("每天净利润", "Per day"),
        number(
          projection.profitPerHour === null
            ? null
            : projection.profitPerHour * 24,
        ),
      ),
      metric(
        t("本次总净利润", "Total profit"),
        projection.netProfitPerAction === null
          ? number(null)
          : projection.effectivelyInfinite
            ? "∞"
            : number(projection.totalProfit),
      ),
    );
  }
  body.append(grid);
  if (showProfit && projection.status === "incomplete") {
    const warning = document.createElement("div");
    warning.className = "mwi-production-warning";
    warning.textContent = t(
      "部分市场价格缺失，利润暂不显示为 0。",
      "Some market prices are missing; profit is not treated as zero.",
    );
    body.append(warning);
  }
  card.append(title, body);
}

function removeActionUi() {
  document.querySelector("#mwi-action-dashboard")?.remove();
  document
    .querySelectorAll(".mwi-action-dashboard-host")
    .forEach((element) =>
      element.classList.remove("mwi-action-dashboard-host"),
    );
  document.querySelector("#mwi-production-summary")?.remove();
  document.querySelector(".mwi-max-action-button")?.remove();
  removeProductionDuration();
  removeProductionQuickInputs();
  document
    .querySelectorAll(".mwi-production-extensions:empty")
    .forEach((mount) => mount.remove());
}

runtime.features.register({
  id: "totalActionTime",
  setting: "totalActionTime",
  scope: "character",
  initialize({ scope }) {
    addStyles();
    let refreshTimer = null;
    const render = () => {
      const mounted = renderActionDashboard();
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      refreshTimer = mounted
        ? setTimeout(() => renderer.schedule(), 1000)
        : null;
    };
    const renderer = bindActionUiRenderer(scope, render, [
      "actions_updated",
      "action_completed",
      ...PRODUCTION_PROFILE_MESSAGES,
    ]);
    render();
    scope.add(() => {
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      clearActionDashboard();
    });
  },
});

runtime.features.register({
  id: "actionBarProfit",
  setting: "actionBarProfit",
  scope: "character",
  dependsOn: ["totalActionTime"],
  initialize() {
    renderActionDashboard();
    return renderActionDashboard;
  },
});

runtime.features.register({
  id: "actionPanel_totalTime_quickInputs",
  setting: "actionPanel_totalTime_quickInputs",
  scope: "character",
  dependsOn: ["actionPanel_totalTime"],
  initialize({ scope }) {
    renderProductionQuickInputs();
    bindActionUiRenderer(scope, renderProductionQuickInputs, [
      "actions_updated",
      ...PRODUCTION_PROFILE_MESSAGES,
    ]);
    scope.add(removeProductionQuickInputs);
  },
});

runtime.features.register({
  id: "productionSummary",
  setting: "productionSummary",
  scope: "character",
  initialize({ scope }) {
    renderProductionPanel();
    bindActionUiRenderer(scope, renderProductionPanel, [
      "actions_updated",
      "action_completed",
      "market_item_values_updated",
      "market_item_order_books_updated",
      ...PRODUCTION_PROFILE_MESSAGES,
    ]);
    scope.add(
      runtime.settings.onChange?.("productionProfit", () => {
        productionDataRevision += 1;
        renderProductionPanel();
      }),
    );
    scope.add(
      runtime.settings.onChange?.("adaptIronCowMarketFeatures", () => {
        productionDataRevision += 1;
        renderProductionPanel();
      }),
    );
    scope.add(
      runtime.settings.onPreferenceChange?.("productionSummaryMode", () => {
        productionDataRevision += 1;
        renderProductionPanel();
      }),
    );
    scope.add(() =>
      document.querySelector("#mwi-production-summary")?.remove(),
    );
    scope.add(() =>
      document
        .querySelectorAll(".mwi-production-extensions:empty")
        .forEach((mount) => mount.remove()),
    );
  },
});

runtime.features.register({
  id: "productionProfit",
  setting: "productionProfit",
  scope: "character",
  dependsOn: ["productionSummary"],
  initialize() {
    renderProductionPanel();
    return renderProductionPanel;
  },
});

Object.assign(runtime.api, {
  renderActionDashboard,
  renderProductionPanel,
  getProductionPanelDuration,
  getLiveActionTiming,
  resolveProductionAction: resolvePanelAction,
  resolveActiveProductionPanelContext,
  getProductionPanelMount,
  mountProductionModule,
  renderProductionQuickInputs,
  removeProductionQuickInputs,
  removeActionUi,
});
