import { runtime } from "../core/runtime.js";

const PANEL_ID = "mwitools-enhancement-cost-panel";
const STYLE_ID = "mwitools-enhancement-cost-panel-style";
const VIEWPORT_MARGIN = 12;
const PANEL_GAP = 8;

let activePanel = null;

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${PANEL_ID} { position:fixed; z-index:2147483000; width:min(252px,calc(100vw - 24px)); box-sizing:border-box; overflow:hidden; pointer-events:none; color:var(--color-text-primary,#eef1f6); border:1px solid rgba(255,255,255,.16); border-radius:8px; background:linear-gradient(145deg,rgba(34,38,47,.985),rgba(18,21,27,.985)); box-shadow:0 12px 34px rgba(0,0,0,.44),0 2px 7px rgba(0,0,0,.28); font-family:inherit; font-size:11px; line-height:1.25; }
    #${PANEL_ID}.mwi-enhancement-sticky { pointer-events:auto; }
    #${PANEL_ID} * { box-sizing:border-box; }
    .mwi-enhancement-grid { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; }
    .mwi-enhancement-metric { display:contents; }
    .mwi-enhancement-label,.mwi-enhancement-value { min-height:27px; display:flex; align-items:center; padding:5px 9px; border-bottom:1px solid rgba(255,255,255,.075); }
    .mwi-enhancement-metric:last-child .mwi-enhancement-label,.mwi-enhancement-metric:last-child .mwi-enhancement-value { border-bottom:0; }
    .mwi-enhancement-label { min-width:0; color:var(--color-text-secondary,#aeb5c0); }
    .mwi-enhancement-value { justify-content:flex-end; color:#fff; font-weight:650; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .mwi-enhancement-protection .mwi-enhancement-label { display:none; }
    .mwi-enhancement-protection .mwi-enhancement-value { grid-column:1/-1; justify-content:flex-start; white-space:normal; }
  `;
  document.head.append(style);
}

function exactTitle(value) {
  if (!Number.isFinite(Number(value))) return "";
  return runtime.api.formatExactNumber?.(Number(value)) ?? String(value);
}

function compactNumber(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return "—";
  if (Math.abs(Number(value)) >= 1000) {
    return (
      runtime.api.numberFormatter?.(Number(value), digits) ?? String(value)
    );
  }
  return new Intl.NumberFormat(runtime.config.NUMBER_LOCALE || "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function countWithUnit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const rounded = Math.round(number);
  const digits = Math.abs(number - rounded) < 1e-8 ? 0 : 1;
  return `${compactNumber(number, digits)} ${t("个", "pcs")}`;
}

function metric(label, value, exactValue = null, titleText = "") {
  const row = document.createElement("div");
  row.className = "mwi-enhancement-metric";
  const caption = document.createElement("div");
  caption.className = "mwi-enhancement-label";
  caption.textContent = label;
  const content = document.createElement("div");
  content.className = "mwi-enhancement-value";
  content.textContent = value;
  const title = titleText || exactTitle(exactValue);
  if (title) content.title = title;
  row.append(caption, content);
  return row;
}

function protectionUsage(plan) {
  const normal = Number(plan?.expectedNormalProtectionCount);
  const mirror = Number(plan?.expectedPhilosopherMirrorCount);
  if (!Number.isFinite(normal) || !Number.isFinite(mirror)) {
    return { text: "—", title: "" };
  }
  return {
    text: t(
      `普通保护 ${compactNumber(normal, 1)} 次，贤者之镜 ${compactNumber(mirror, 1)} 次`,
      `Regular protection: ${compactNumber(normal, 1)} uses; Philosopher's Mirror: ${compactNumber(mirror, 1)} uses`,
    ),
    title: t(
      `普通保护：${exactTitle(normal)} 次；贤者之镜：${exactTitle(mirror)} 次`,
      `Regular protection: ${exactTitle(normal)} uses; Philosopher's Mirror: ${exactTitle(mirror)} uses`,
    ),
  };
}

function renderPanel(panel, plan) {
  const complete = plan?.status === "complete";
  const protection = complete
    ? protectionUsage(plan)
    : { text: "—", title: "" };
  const normalStart = complete
    ? plan.normalProtectStart === null
      ? t("不用", "None")
      : `+${plan.normalProtectStart}`
    : "—";
  const philosopherStart = complete
    ? plan.philosopherStart === null
      ? t("不用", "None")
      : `+${plan.philosopherStart}`
    : "—";
  const aLabel =
    complete && plan.aLevel !== null
      ? t(`需要 +${plan.aLevel}`, `Need +${plan.aLevel}`)
      : t("需要", "Need");
  const bLabel =
    complete && plan.bLevel !== null
      ? t(`需要 +${plan.bLevel}`, `Need +${plan.bLevel}`)
      : t("需要", "Need");
  const grid = document.createElement("div");
  grid.className = "mwi-enhancement-grid";
  const protectionMetric = metric("", protection.text, null, protection.title);
  protectionMetric.classList.add("mwi-enhancement-protection");
  grid.append(
    metric(
      t("总成本", "Total cost"),
      complete ? compactNumber(plan.totalCost, 1) : "—",
      plan?.totalCost,
    ),
    metric(
      t("底子成本", "Base cost"),
      complete ? compactNumber(plan.baseCost, 1) : "—",
      plan?.baseCost,
    ),
    ...(complete && Number(plan.refinementCost) > 0
      ? [
          metric(
            t("其中精炼", "Includes refining"),
            compactNumber(plan.refinementCost, 1),
            plan.refinementCost,
          ),
        ]
      : []),
    metric(
      t("耗时", "Time"),
      complete ? runtime.api.timeReadable(plan.totalSeconds) : "—",
      plan?.totalSeconds,
    ),
    metric(t("开始保护", "Protect from"), normalStart),
    protectionMetric,
    metric(t("开始贤者保护", "Philosopher's Mirror from"), philosopherStart),
    metric(aLabel, complete ? countWithUnit(plan.aCount) : "—", plan?.aCount),
    metric(bLabel, complete ? countWithUnit(plan.bCount) : "—", plan?.bCount),
  );
  panel.replaceChildren(grid);
  panel.dataset.status = complete ? "complete" : "unavailable";
}

function positionPanel() {
  const state = activePanel;
  if (!state?.panel?.isConnected) {
    hideEnhancementCostPanel();
    return;
  }
  let anchorRect = state.anchorRect;
  if (state.anchor?.isConnected) {
    anchorRect = state.anchor.getBoundingClientRect();
    if (state.sticky) state.anchorRect = anchorRect;
  } else if (!state.sticky) {
    hideEnhancementCostPanel();
    return;
  }
  if (!anchorRect) return;
  const panelRect = state.panel.getBoundingClientRect();
  const viewportWidth =
    Number(globalThis.innerWidth) || document.documentElement.clientWidth;
  const viewportHeight =
    Number(globalThis.innerHeight) || document.documentElement.clientHeight;
  const roomRight = viewportWidth - anchorRect.right - VIEWPORT_MARGIN;
  const roomLeft = anchorRect.left - VIEWPORT_MARGIN;
  const roomBelow = viewportHeight - anchorRect.bottom - VIEWPORT_MARGIN;
  const roomAbove = anchorRect.top - VIEWPORT_MARGIN;
  let placement = "right";
  let left = anchorRect.right + PANEL_GAP;
  let top = anchorRect.top;

  if (
    roomRight < panelRect.width + PANEL_GAP &&
    roomLeft >= panelRect.width + PANEL_GAP
  ) {
    placement = "left";
    left = anchorRect.left - panelRect.width - PANEL_GAP;
  } else if (
    roomRight < panelRect.width + PANEL_GAP &&
    roomLeft < panelRect.width + PANEL_GAP
  ) {
    if (roomBelow >= panelRect.height + PANEL_GAP || roomBelow >= roomAbove) {
      placement = "bottom";
      left = anchorRect.left;
      top = anchorRect.bottom + PANEL_GAP;
    } else {
      placement = "top";
      left = anchorRect.left;
      top = anchorRect.top - panelRect.height - PANEL_GAP;
    }
  }
  left = Math.min(
    Math.max(VIEWPORT_MARGIN, left),
    viewportWidth - panelRect.width - VIEWPORT_MARGIN,
  );
  top = Math.min(
    Math.max(VIEWPORT_MARGIN, top),
    viewportHeight - panelRect.height - VIEWPORT_MARGIN,
  );
  state.panel.dataset.placement = placement;
  state.panel.style.left = `${Math.round(left)}px`;
  state.panel.style.top = `${Math.round(top)}px`;
}

export function hideEnhancementCostPanel() {
  const state = activePanel;
  if (!state) {
    document.getElementById(PANEL_ID)?.remove();
    return;
  }
  state.mutationObserver?.disconnect();
  state.resizeObserver?.disconnect();
  globalThis.removeEventListener?.("resize", state.position);
  globalThis.removeEventListener?.("scroll", state.position, true);
  if (state.outsideHandler) {
    document.removeEventListener("pointerdown", state.outsideHandler, true);
  }
  state.panel?.remove();
  activePanel = null;
}

function attachStickyOutsideHandler(panel, anchor) {
  const outsideHandler = (event) => {
    if (!activePanel?.sticky || activePanel.panel !== panel) return;
    if (panel.contains(event.target)) return;
    runtime.api.clearTooltipProfitHoverContext?.(anchor, null, {
      preserveTouchPress: true,
    });
    hideEnhancementCostPanel();
  };
  globalThis.setTimeout?.(() => {
    if (activePanel?.panel !== panel) return;
    document.addEventListener("pointerdown", outsideHandler, true);
    activePanel.outsideHandler = outsideHandler;
  }, 0);
}

export function showEnhancementCostPanel(anchor, plan = null, options = {}) {
  if (!anchor?.isConnected) {
    hideEnhancementCostPanel();
    return null;
  }
  const sticky = Boolean(
    options.sticky || (activePanel?.anchor === anchor && activePanel?.sticky),
  );
  if (
    activePanel?.anchor === anchor &&
    activePanel.panel?.isConnected &&
    activePanel.sticky === sticky
  ) {
    renderPanel(activePanel.panel, plan);
    activePanel.position();
    return activePanel.panel;
  }
  hideEnhancementCostPanel();
  addStyles();
  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.classList.toggle("mwi-enhancement-sticky", sticky);
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-live", "polite");
  renderPanel(panel, plan);
  anchor.insertAdjacentElement("afterend", panel);

  const position = () =>
    globalThis.requestAnimationFrame?.(positionPanel) ?? positionPanel();
  const mutationObserver = sticky
    ? null
    : new MutationObserver(() => {
        if (!anchor.isConnected) hideEnhancementCostPanel();
      });
  mutationObserver?.observe(anchor.parentNode ?? document.body, {
    childList: true,
  });
  const resizeObserver = globalThis.ResizeObserver
    ? new globalThis.ResizeObserver(position)
    : null;
  resizeObserver?.observe(anchor);
  resizeObserver?.observe(panel);
  activePanel = {
    anchor,
    mutationObserver,
    panel,
    position,
    resizeObserver,
    sticky,
    anchorRect: sticky ? anchor.getBoundingClientRect() : null,
  };
  if (sticky && document.body && panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }
  globalThis.addEventListener?.("resize", position);
  globalThis.addEventListener?.("scroll", position, true);
  position();
  if (sticky) attachStickyOutsideHandler(panel, anchor);
  return panel;
}

export const positionEnhancementCostPanel = positionPanel;

runtime.settings.onChange?.("enhanceSim", (enabled) => {
  if (!enabled) hideEnhancementCostPanel();
});

Object.assign(runtime.api, {
  hideEnhancementCostPanel,
  positionEnhancementCostPanel,
  showEnhancementCostPanel,
});
