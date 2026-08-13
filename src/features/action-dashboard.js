import { runtime } from "../core/runtime.js";
import { parseCompactNumber } from "../core/market.js";
import { itemName } from "../core/localization.js";
import {
  getLocalizedEntityName,
  resolveLocalizedEntity,
} from "../core/game-localization.js";

const STYLE_ID = "mwitools-action-dashboard-style";
const QUICK_HOURS = [0.5, 1, 2, 3, 4, 5, 6, 10, 12, 24];
const QUICK_COUNTS = [10, 100, 300, 500, 1_000, 2_000];

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

function formatClock(timestamp) {
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat(runtime.config.isZH ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function number(value) {
  return runtime.api.createFormattedNumber(value);
}

function findItemsSpriteBase() {
  for (const entry of globalThis.performance?.getEntriesByType?.("resource") ??
    []) {
    if (entry.name?.includes("items_sprite") && entry.name.endsWith(".svg")) {
      try {
        return new URL(entry.name).pathname;
      } catch {
        return entry.name;
      }
    }
  }
  const use = document.querySelector(
    'svg use[href*="items_sprite"],svg use[xlink\\:href*="items_sprite"]',
  );
  const href =
    use?.getAttribute("href") ?? use?.getAttribute("xlink:href") ?? "";
  return href.includes("#") ? href.split("#")[0] : "";
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
  const sprite = findItemsSpriteBase();
  const use = item.querySelector("use");
  if (use && sprite && bare) {
    const href = `${sprite}#${bare}`;
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
  const sprite = findItemsSpriteBase();
  if (bare && sprite) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("mwi-production-output-icon");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("aria-label", name);
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    const href = `${sprite}#${bare}`;
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
  style.textContent = `
    .mwi-action-dashboard-host { position:relative!important; }
    .mwi-action-dashboard { position:absolute; top:50%; right:0; z-index:5; box-sizing:border-box; max-width:calc(100% - var(--mwi-action-dashboard-left,0px)); margin:0; padding:2px 6px; transform:translateY(-50%); border:1px solid rgba(255,255,255,.1); border-radius:4px; background:rgba(0,0,0,.18); font:inherit; font-size:inherit; line-height:1.25; white-space:normal; overflow:visible; pointer-events:none; }
    .mwi-action-line { display:flex; align-items:center; flex-wrap:nowrap; gap:3px 10px; max-width:100%; color:#ffa500; }
    .mwi-action-line > * { min-width:0; white-space:nowrap; }
    .mwi-action-line strong { color:inherit; font-weight:650; }
    .mwi-action-dashboard[data-compact="true"] { right:auto; width:max-content; padding-inline:4px; }
    .mwi-action-dashboard[data-compact="true"] .mwi-action-line { gap:2px 6px; }
    .mwi-action-dashboard[data-compact="true"] .mwi-action-eta { display:none; }
    .mwi-production-card { width:100%; max-width:100%; min-width:0; box-sizing:border-box; contain:inline-size; margin-top:6px; padding:6px; border:1px solid rgba(255,255,255,.12); border-radius:5px; background:rgba(255,255,255,.025); color:var(--color-text-primary,#eee); font-size:.6875rem; }
    .mwi-production-card-title { padding:0 2px 4px; font-size:.72rem; font-weight:600; }
    .mwi-production-metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,110px),1fr)); gap:4px; }
    .mwi-production-metric { min-width:0; overflow:hidden; padding:4px 3px; border-radius:3px; background:rgba(0,0,0,.14); text-align:center; }
    .mwi-production-label { min-height:1.45em; color:var(--color-text-secondary,#aaa); font-size:.6rem; line-height:1.2; }
    .mwi-production-value { margin-top:1px; font-size:.7rem; line-height:1.25; font-weight:600; overflow-wrap:anywhere; }
    .mwi-production-output-metric { grid-column:1/-1; }
    .mwi-production-output-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,120px),1fr)); gap:4px 8px; width:100%; }
    .mwi-production-output-grid[data-count="1"] .mwi-production-output-item { grid-column:1/-1; }
    .mwi-production-output-item { display:flex; min-width:0; align-items:center; justify-content:center; gap:4px; overflow:hidden; }
    .mwi-production-native-item,.mwi-production-native-fallback { display:inline-flex!important; min-width:0; align-items:center; gap:4px; overflow:hidden; pointer-events:none; }
    .mwi-production-native-fallback { padding:1px 6px; border:1px solid rgb(152,167,233); border-radius:4px; background:rgb(44,46,69); color:rgb(231,231,231); }
    .mwi-production-native-item [class*="Item_iconContainer"] { width:14px!important; height:14px!important; flex:0 0 14px!important; }
    .mwi-production-native-item [class*="Item_name"],.mwi-production-output-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mwi-production-output-icon,.mwi-production-output-fallback { display:grid; width:14px; height:14px; flex:0 0 14px; place-items:center; }
    .mwi-production-output-fallback { border-radius:4px; background:rgba(255,255,255,.08); color:var(--color-text-secondary,#aaa); font-size:.72rem; }
    .mwi-production-output-count { flex:0 0 auto; min-width:0; font-size:.72rem; font-weight:700; line-height:1; white-space:nowrap; }
    .mwi-production-warning { margin:4px 2px 0; color:#d7bb67; font-size:.6rem; line-height:1.25; }
    .mwi-max-action-button { margin-inline-start:4px; }
    .mwi-production-quick-inputs { position:relative; display:grid; z-index:0; box-sizing:border-box; gap:3px; width:100%; min-width:0; margin:4px 0 1px; color:var(--color-text-secondary,#aaa); font-size:.625rem; }
    .mwi-production-quick-row { display:flex; min-width:0; align-items:flex-start; gap:3px; }
    .mwi-production-quick-label { flex:0 0 3.25em; color:${runtime.config.SCRIPT_COLOR_MAIN}; white-space:nowrap; }
    .mwi-production-quick-buttons { display:flex; min-width:0; flex:1; flex-wrap:wrap; gap:2px; }
    .mwi-production-quick-button { min-width:0!important; height:21px!important; padding:1px 5px!important; font-size:.625rem!important; line-height:1!important; }
    @media(max-width:520px){.mwi-action-dashboard{right:auto;width:max-content;padding-inline:4px}.mwi-action-line{gap:2px 6px}.mwi-action-eta{display:none}.mwi-production-card{padding:5px;font-size:.625rem}.mwi-production-card-title{padding-bottom:3px;font-size:.66rem}.mwi-production-metrics,.mwi-production-output-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:3px}.mwi-production-metric{padding:3px 2px}.mwi-production-label{min-height:1.3em;font-size:.54rem}.mwi-production-value{font-size:.64rem}.mwi-production-output-grid[data-count="1"] .mwi-production-output-item{grid-column:1/-1}.mwi-production-output-item{gap:3px}.mwi-production-output-count{font-size:.66rem}}
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
    runtime.data.ZHActionNames?.[actionHrid],
    getLocalizedEntityName("action", actionHrid),
  ]);
  for (const output of runtime.api.getExpectedOutputs?.(detail) ?? []) {
    names.add(runtime.state.initData_itemDetailMap?.[output.itemHrid]?.name);
    names.add(runtime.data.ZHItemNames?.[output.itemHrid]);
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

function renderActionDashboard() {
  addStyles();
  const host = document.querySelector('div[class*="Header_actionName"]');
  const actions = [...(runtime.state.currentActionsHridList ?? [])].sort(
    (left, right) => Number(left?.ordinal ?? 0) - Number(right?.ordinal ?? 0),
  );
  const current = actions[0];
  if (!host || !current || !actionMatchesHeader(current, host)) {
    clearActionDashboard();
    return;
  }
  const timing = getLiveActionTiming(host);
  const enhancementCount = getNativeEnhancementCount(host, current);
  const projection = runtime.api.projectAction(
    current,
    enhancementCount ?? undefined,
    {
      durationPerAction: timing.durationPerAction,
      currentCycleRemainingSeconds: timing.currentCycleRemaining,
    },
  );
  let root = host.querySelector("#mwi-action-dashboard");
  if (!root) {
    root = document.createElement("div");
    root.id = "mwi-action-dashboard";
    root.className = "mwi-action-dashboard";
    host.appendChild(root);
  }
  host.classList.add("mwi-action-dashboard-host");
  root.style.position = "absolute";
  const lastNativeChild = [...host.children]
    .filter(
      (element) => element !== root && element.id !== "script_item_warning",
    )
    .at(-1);
  const hostRect = host.getBoundingClientRect();
  const childRect = lastNativeChild?.getBoundingClientRect();
  const left = Math.max(
    0,
    (childRect?.right ?? hostRect.left) - hostRect.left + 7,
  );
  root.style.left = `${left}px`;
  root.style.setProperty("--mwi-action-dashboard-left", `${left}px`);
  const hostWidth = Math.max(
    0,
    Number(hostRect.width) || Number(hostRect.right) - Number(hostRect.left),
  );
  const viewportWidth =
    Number(host.ownerDocument?.defaultView?.innerWidth) || 0;
  const availableWidth = Math.max(0, hostWidth - left);
  root.dataset.compact = String(
    (availableWidth > 0 && availableWidth < 420) ||
      (availableWidth === 0 && viewportWidth > 0 && viewportWidth <= 520),
  );
  root.replaceChildren();
  root.removeAttribute("title");

  const primary = document.createElement("div");
  primary.className = "mwi-action-line";
  const remaining = document.createElement("span");
  const effectivelyInfinite =
    projection.effectivelyInfinite ?? projection.infinite;
  const effectiveCount = projection.effectiveCount ?? projection.count;
  remaining.append(
    `${t("剩余", "Remaining")} `,
    effectivelyInfinite ? "∞" : number(effectiveCount),
  );
  if (projection.materialLimited) {
    remaining.title = t(
      "已按当前库存中的可用原料计算",
      "Limited by materials currently in inventory",
    );
  } else if (enhancementCount !== null) {
    remaining.title = t(
      "已按强化栏当前可处理数量计算",
      "Based on the amount currently available for enhancement",
    );
  }
  const currentTime = document.createElement("span");
  currentTime.textContent = `${t("还需", "Time left")} ${formatDuration(
    projection.totalSeconds,
  )}`;
  const eta = document.createElement("strong");
  eta.className = "mwi-action-eta";
  eta.textContent = projection.finishAt
    ? `${t("预计完成", "Finishes at")} ${formatClock(projection.finishAt)}`
    : `${t("预计完成", "Finishes at")} —`;
  primary.append(remaining, currentTime, eta);
  root.append(primary);
}

function findActionPanel() {
  const candidates = [
    ...document.querySelectorAll(
      'div[class*="SkillActionDetail_regularComponent"],div[class*="SkillActionDetail_skillActionDetail"]',
    ),
  ];
  const visible = candidates.filter((candidate) => {
    for (let current = candidate; current; current = current.parentElement) {
      if (current.hidden || current.getAttribute("aria-hidden") === "true") {
        return false;
      }
      const style =
        current.ownerDocument?.defaultView?.getComputedStyle(current);
      if (style?.display === "none" || style?.visibility === "hidden") {
        return false;
      }
    }
    return true;
  });
  return (
    visible.find((candidate) =>
      String(candidate.className).includes("regularComponent"),
    ) ??
    visible.at(-1) ??
    null
  );
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
  const panel = findActionPanel();
  const input = getCountInput(panel);
  const actionHrid = resolvePanelAction(panel);
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
    const actionContainer = countGroup.closest(
      'div[class*="SkillActionDetail_actionContainer"]',
    );
    (actionContainer ?? countGroup).insertAdjacentElement("afterend", host);
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
  if (!runtime.settings.get("productionSummary")) {
    document
      .querySelectorAll("#mwi-production-summary")
      .forEach((card) => card.remove());
    document
      .querySelectorAll(".mwi-max-action-button")
      .forEach((button) => button.remove());
    return;
  }
  const panel = findActionPanel();
  const input = getCountInput(panel);
  const existingCards = [
    ...document.querySelectorAll("#mwi-production-summary"),
  ];
  if (!panel) {
    existingCards.forEach((card) => card.remove());
    document
      .querySelectorAll(".mwi-max-action-button")
      .forEach((button) => button.remove());
    return;
  }
  existingCards
    .filter((card) => !panel.contains(card))
    .forEach((card) => card.remove());
  document.querySelectorAll(".mwi-max-action-button").forEach((button) => {
    if (!panel.contains(button)) button.remove();
  });
  const existingCard = panel.querySelector("#mwi-production-summary");
  const actionHrid = resolvePanelAction(panel);
  if (!actionHrid || !isProductionAction(actionHrid)) {
    existingCard?.remove();
    panel.querySelector(".mwi-max-action-button")?.remove();
    return;
  }
  const count = input
    ? runtime.api.parseCompactNumber(input.value)
    : Number.POSITIVE_INFINITY;
  const projection = runtime.api.projectAction(actionHrid, count, {
    durationPerAction: getProductionPanelDuration(panel),
    respectInventoryLimit: !Number.isFinite(count),
  });
  syncMaxButton(panel, input, projection.maxCraftable);
  let card = panel.querySelector("#mwi-production-summary");
  if (!card) {
    card = document.createElement("section");
    card.id = "mwi-production-summary";
    card.className = "mwi-production-card";
    const anchor =
      panel.querySelector('div[class*="SkillActionDetail_actionContainer"]') ??
      input?.parentElement ??
      panel.querySelector('div[class*="SkillActionDetail_name"]');
    if (anchor) anchor.insertAdjacentElement("afterend", card);
    else panel.appendChild(card);
  }
  const extensions = [
    ...card.querySelectorAll('[data-mwitools-production-extension="true"]'),
  ];
  card.replaceChildren();
  const title = document.createElement("div");
  title.className = "mwi-production-card-title";
  title.textContent = t("本次生产摘要", "Production summary");
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
    metric(
      t("本次总耗时", "Duration"),
      formatDuration(projection.totalSeconds),
    ),
  );
  const showProfit =
    runtime.settings.get("productionProfit") &&
    !runtime.api.shouldSuppressMarketFeatures?.();
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
  card.append(title, grid);
  if (showProfit && projection.status === "incomplete") {
    const warning = document.createElement("div");
    warning.className = "mwi-production-warning";
    warning.textContent = t(
      "部分市场价格缺失，利润暂不显示为 0。",
      "Some market prices are missing; profit is not treated as zero.",
    );
    card.append(warning);
  }
  card.append(...extensions);
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
  removeProductionQuickInputs();
}

runtime.features.register({
  id: "totalActionTime",
  setting: "totalActionTime",
  scope: "character",
  initialize({ scope }) {
    addStyles();
    renderActionDashboard();
    scope.interval(renderActionDashboard, 500);
    scope.add(() => {
      document.querySelector("#mwi-action-dashboard")?.remove();
      document
        .querySelectorAll(".mwi-action-dashboard-host")
        .forEach((element) =>
          element.classList.remove("mwi-action-dashboard-host"),
        );
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
    scope.interval(renderProductionQuickInputs, 350);
    scope.add(removeProductionQuickInputs);
  },
});

runtime.features.register({
  id: "productionSummary",
  setting: "productionSummary",
  scope: "character",
  initialize({ scope }) {
    renderProductionPanel();
    scope.interval(renderProductionPanel, 350);
    scope.add(() =>
      document.querySelector("#mwi-production-summary")?.remove(),
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
  renderProductionQuickInputs,
  removeProductionQuickInputs,
  removeActionUi,
});
