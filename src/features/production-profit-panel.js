import { runtime } from "../core/runtime.js";

const PANEL_ID = "mwitools-production-profit-panel";
const STYLE_ID = "mwitools-production-profit-panel-style";
const VIEWPORT_MARGIN = 12;
const PANEL_GAP = 10;

let activePanel = null;

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return "—";
  if (Math.abs(Number(value)) >= 1000) {
    return (
      runtime.api.numberFormatter?.(Number(value), digits) ?? String(value)
    );
  }
  return new Intl.NumberFormat(runtime.config.isZH ? "zh-CN" : "en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  return Number.isFinite(Number(value)) ? formatNumber(value, 1) : "—";
}

function exactNumberTitle(value) {
  if (value === null || value === undefined || value === "") return "";
  if (!Number.isFinite(Number(value))) return "";
  return escapeHtml(
    runtime.api.formatExactNumber?.(Number(value)) ?? String(value),
  );
}

function numberTitleAttribute(value) {
  const title = exactNumberTitle(value);
  return title ? ` title="${title}"` : "";
}

function formatPercent(value) {
  return `${Number(value || 0) >= 0 ? "+" : ""}${formatNumber(value, 1)}%`;
}

function itemName(itemHrid) {
  return (
    (runtime.config.isZH
      ? runtime.data.ZHItemNames?.[itemHrid]
      : runtime.state.initData_itemDetailMap?.[itemHrid]?.name) ??
    runtime.state.initData_itemDetailMap?.[itemHrid]?.name ??
    itemHrid?.split("/").at(-1) ??
    "—"
  );
}

function actionName(actionHrid, detail) {
  return (
    (runtime.config.isZH
      ? runtime.data.ZHActionNames?.[actionHrid]
      : detail?.name) ??
    detail?.name ??
    actionHrid?.split("/").at(-1) ??
    "—"
  );
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

function renderItemIcon(itemHrid, name) {
  const bare = String(itemHrid ?? "")
    .split("/")
    .at(-1);
  const sprite = findItemsSpriteBase();
  if (!bare || !sprite) {
    return `<span class="mwi-profit-icon-fallback">${escapeHtml(
      String(name || "?")
        .trim()
        .charAt(0) || "?",
    )}</span>`;
  }
  const href = `${sprite}#${bare}`;
  return `<svg class="mwi-profit-icon" viewBox="0 0 32 32" aria-label="${escapeHtml(name)}"><use href="${escapeHtml(href)}" xlink:href="${escapeHtml(href)}"></use></svg>`;
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${PANEL_ID} { position:fixed; z-index:2147483000; width:min(620px,calc(100vw - 24px)); max-height:min(75vh,680px); box-sizing:border-box; overflow:auto; pointer-events:none; color:var(--color-text-primary,#f2f2f2); border:1px solid rgba(255,255,255,.16); border-radius:10px; background:linear-gradient(145deg,rgba(35,39,47,.985),rgba(19,22,28,.985)); box-shadow:0 18px 48px rgba(0,0,0,.48),0 2px 8px rgba(0,0,0,.3); font-family:inherit; font-size:12px; line-height:1.35; scrollbar-width:thin; backdrop-filter:blur(12px); }
    #${PANEL_ID} * { box-sizing:border-box; }
    .mwi-profit-header { display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid rgba(255,255,255,.1); }
    .mwi-profit-header-icon { display:grid; width:38px; height:38px; flex:0 0 38px; place-items:center; border-radius:8px; background:rgba(255,255,255,.065); }
    .mwi-profit-header-main { min-width:0; }
    .mwi-profit-title { color:#fff; font-size:14px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mwi-profit-subtitle { margin-top:2px; color:var(--color-text-secondary,#aeb4bf); font-size:11px; }
    .mwi-profit-status { margin-left:auto; padding:3px 8px; border:1px solid currentColor; border-radius:999px; font-size:10px; font-weight:650; white-space:nowrap; }
    .mwi-profit-status.complete { color:#7bd69a; background:rgba(66,185,108,.1); }
    .mwi-profit-status.partial { color:#e7bd68; background:rgba(221,164,51,.1); }
    .mwi-profit-status.incomplete { color:#ef8c86; background:rgba(218,73,65,.1); }
    .mwi-profit-status.waiting { color:#9fb8df; background:rgba(74,119,187,.1); }
    .mwi-profit-body { display:grid; grid-template-columns:minmax(0,1fr) 138px minmax(0,1fr); gap:10px; padding:12px; align-items:stretch; }
    .mwi-profit-card { min-width:0; padding:10px; border:1px solid rgba(255,255,255,.095); border-radius:8px; background:rgba(255,255,255,.035); }
    .mwi-profit-card.cost { border-top:2px solid rgba(239,124,111,.72); }
    .mwi-profit-card.income { border-top:2px solid rgba(83,201,132,.72); }
    .mwi-profit-card-title { display:flex; align-items:center; justify-content:space-between; margin-bottom:7px; color:#fff; font-size:11px; font-weight:700; letter-spacing:.04em; }
    .mwi-profit-card-total { color:var(--color-text-secondary,#aeb4bf); font-size:10px; font-weight:600; }
    .mwi-profit-item { display:grid; grid-template-columns:28px minmax(0,1fr) auto; gap:7px; align-items:center; padding:7px 0; border-top:1px solid rgba(255,255,255,.065); }
    .mwi-profit-item:first-of-type { border-top:0; }
    .mwi-profit-item-name { min-width:0; color:#edf0f4; font-size:11px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mwi-profit-item-meta { margin-top:2px; color:var(--color-text-secondary,#9ba2ad); font-size:9.5px; }
    .mwi-profit-item-value { min-width:64px; text-align:right; }
    .mwi-profit-item-value strong { display:block; color:#fff; font-size:11px; }
    .mwi-profit-item-value span { display:block; margin-top:2px; color:var(--color-text-secondary,#9ba2ad); font-size:9.5px; }
    .mwi-profit-kind { display:inline-block; margin-right:4px; padding:0 4px; border-radius:3px; background:rgba(255,255,255,.075); color:#bdc5d1; font-size:8.5px; }
    .mwi-profit-player { display:flex; min-width:0; flex-direction:column; align-items:center; justify-content:center; gap:7px; padding:9px 7px; border:1px solid rgba(255,255,255,.095); border-radius:8px; background:rgba(255,255,255,.025); text-align:center; }
    .mwi-profit-player-title { color:#fff; font-size:11px; font-weight:700; }
    .mwi-profit-teas { display:flex; min-height:28px; align-items:center; justify-content:center; gap:4px; }
    .mwi-profit-tea { display:grid; width:27px; height:27px; place-items:center; border-radius:6px; background:rgba(255,255,255,.07); }
    .mwi-profit-no-tea { color:var(--color-text-secondary,#9ba2ad); font-size:9.5px; }
    .mwi-profit-effects { display:flex; flex-wrap:wrap; justify-content:center; gap:3px; }
    .mwi-profit-effect { padding:2px 5px; border-radius:999px; color:#d5dbe4; background:rgba(255,255,255,.07); font-size:9px; }
    .mwi-profit-flow { color:var(--color-primary,#70a8ff); font-size:24px; line-height:1; }
    .mwi-profit-stat-list { width:100%; }
    .mwi-profit-stat { display:flex; justify-content:space-between; gap:6px; padding:3px 0; border-top:1px solid rgba(255,255,255,.055); color:var(--color-text-secondary,#a4abb6); font-size:9.5px; }
    .mwi-profit-stat strong { color:#edf0f4; font-weight:650; }
    .mwi-profit-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:7px; padding:0 12px 12px; }
    .mwi-profit-metric { min-width:0; padding:8px; border:1px solid rgba(255,255,255,.08); border-radius:7px; background:rgba(255,255,255,.035); text-align:center; }
    .mwi-profit-metric-label { color:var(--color-text-secondary,#9da5b0); font-size:9px; }
    .mwi-profit-metric-value { margin-top:3px; color:#fff; font-size:12px; font-weight:700; overflow-wrap:anywhere; }
    .mwi-profit-metric.profit { border-color:rgba(75,194,124,.24); background:rgba(55,160,97,.09); }
    .mwi-profit-metric.profit .mwi-profit-metric-value { color:#82dfa4; }
    .mwi-profit-warning { margin:0 12px 12px; padding:8px 10px; border:1px solid rgba(224,177,75,.25); border-radius:7px; background:rgba(195,139,30,.09); color:#e3c276; font-size:10px; }
    .mwi-profit-state { margin:12px; padding:18px; border:1px solid rgba(255,255,255,.09); border-radius:8px; background:rgba(255,255,255,.03); color:var(--color-text-secondary,#acb3be); text-align:center; }
    .mwi-profit-icon,.mwi-profit-icon-fallback { width:26px; height:26px; }
    .mwi-profit-icon-fallback { display:grid; place-items:center; border-radius:5px; background:rgba(255,255,255,.09); color:#fff; font-weight:700; }
    .mwi-profit-header-icon .mwi-profit-icon,.mwi-profit-header-icon .mwi-profit-icon-fallback { width:32px; height:32px; }
    .mwi-profit-tea .mwi-profit-icon,.mwi-profit-tea .mwi-profit-icon-fallback { width:23px; height:23px; }
    @media(max-width:760px){#${PANEL_ID}{max-height:70vh}.mwi-profit-body{grid-template-columns:1fr}.mwi-profit-player{order:-1;flex-direction:row;flex-wrap:wrap}.mwi-profit-flow{transform:rotate(90deg)}.mwi-profit-stat-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 8px}.mwi-profit-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function renderItemRow(item, type) {
  const name = itemName(item.itemHrid);
  const isInput = type === "input";
  const baseCount = Number(item.baseCount ?? item.count) || 0;
  const effectiveCount = Number(item.effectiveCount ?? item.count) || 0;
  let quantity = formatNumber(effectiveCount, 3);
  if (Math.abs(baseCount - effectiveCount) > 1e-9) {
    quantity = `${formatNumber(baseCount, 3)} → ${quantity}`;
  }
  let kind = "";
  if (item.isUpgradeItem) kind = t("前置", "Base");
  if (item.kind === "essence") kind = t("精华", "Essence");
  if (item.kind === "rare") kind = t("稀有", "Rare");
  const priceLabel = isInput ? t("买价", "Ask") : t("税后卖价", "Net bid");
  return `
    <div class="mwi-profit-item" data-item-hrid="${escapeHtml(item.itemHrid)}">
      <div>${renderItemIcon(item.itemHrid, name)}</div>
      <div>
        <div class="mwi-profit-item-name">${kind ? `<span class="mwi-profit-kind">${escapeHtml(kind)}</span>` : ""}${escapeHtml(name)}</div>
        <div class="mwi-profit-item-meta">${escapeHtml(quantity)} · ${priceLabel} <span${numberTitleAttribute(item.unitPrice)}>${formatMoney(item.unitPrice)}</span></div>
      </div>
      <div class="mwi-profit-item-value">
        <strong${numberTitleAttribute(item.valuePerAction)}>${formatMoney(item.valuePerAction)}</strong>
        <span>${t("每动作", "per action")}</span>
      </div>
    </div>`;
}

function renderMetric(label, value, profit = false, exactValue = null) {
  return `<div class="mwi-profit-metric${profit ? " profit" : ""}"><div class="mwi-profit-metric-label">${escapeHtml(label)}</div><div class="mwi-profit-metric-value"${numberTitleAttribute(exactValue)}>${escapeHtml(value)}</div></div>`;
}

function statusInfo(projection) {
  if (projection.status === "waiting") {
    return {
      className: "waiting",
      label: t("玩家数据未就绪", "Player data pending"),
    };
  }
  if (projection.status === "incomplete") {
    return { className: "incomplete", label: t("无法计算", "Unavailable") };
  }
  if (projection.isPartial) {
    return { className: "partial", label: t("部分计价", "Partial pricing") };
  }
  return { className: "complete", label: t("完整计价", "Fully priced") };
}

function renderPanel(panel, itemHrid, projection) {
  const productName = itemName(itemHrid);
  const status = statusInfo(projection);
  const detail = projection.detail;
  panel.dataset.status = status.className;
  panel.innerHTML = `
    <header class="mwi-profit-header">
      <div class="mwi-profit-header-icon">${renderItemIcon(itemHrid, productName)}</div>
      <div class="mwi-profit-header-main">
        <div class="mwi-profit-title">${escapeHtml(productName)}</div>
        <div class="mwi-profit-subtitle">${escapeHtml(actionName(projection.actionHrid, detail))} · ${t("当前玩家实时配置", "Current player configuration")}</div>
      </div>
      <div class="mwi-profit-status ${status.className}">${escapeHtml(status.label)}</div>
    </header>`;

  if (projection.status === "waiting") {
    panel.insertAdjacentHTML(
      "beforeend",
      `<div class="mwi-profit-state">${t("正在等待当前角色的装备、技能与茶饮数据，未使用任何默认配置。", "Waiting for this character's equipment, skills, and drink data. No defaults are being used.")}</div>`,
    );
    return;
  }

  const inputRows = (projection.inputs ?? [])
    .map((item) => renderItemRow(item, "input"))
    .join("");
  const outputRows = [
    ...(projection.outputs ?? []),
    ...(projection.byproductOutputs ?? []),
  ]
    .map((item) => renderItemRow(item, "output"))
    .join("");
  const teas = projection.teaEffects?.drinks ?? [];
  const teaIcons = teas.length
    ? teas
        .map((tea) => {
          const name = itemName(tea.itemHrid);
          return `<span class="mwi-profit-tea">${renderItemIcon(tea.itemHrid, name)}</span>`;
        })
        .join("")
    : `<span class="mwi-profit-no-tea">${t("未使用茶饮", "No active drinks")}</span>`;
  const effects = [];
  if (projection.teaEffects?.lessResource > 0) {
    effects.push(
      `<span class="mwi-profit-effect">${t("工匠", "Artisan")} −${formatNumber(projection.teaEffects.lessResource * 100, 1)}%</span>`,
    );
  }
  if (projection.teaEffects?.quantity > 0) {
    effects.push(
      `<span class="mwi-profit-effect">${t("额外产量", "Extra output")} +${formatNumber(projection.teaEffects.quantity * 100, 1)}%</span>`,
    );
  }
  panel.insertAdjacentHTML(
    "beforeend",
    `<div class="mwi-profit-body">
      <section class="mwi-profit-card cost">
        <div class="mwi-profit-card-title"><span>${t("投入", "Inputs")}</span><span class="mwi-profit-card-total"${numberTitleAttribute(projection.materialCostPerAction)}>${formatMoney(projection.materialCostPerAction)} / ${t("动作", "action")}</span></div>
        ${inputRows || `<div class="mwi-profit-no-tea">${t("无材料投入", "No material inputs")}</div>`}
      </section>
      <section class="mwi-profit-player">
        <div class="mwi-profit-player-title">${t("当前玩家", "Current player")}</div>
        <div class="mwi-profit-teas">${teaIcons}</div>
        <div class="mwi-profit-effects">${effects.join("")}</div>
        <div class="mwi-profit-flow">→</div>
        <div class="mwi-profit-stat-list">
          <div class="mwi-profit-stat"><span>${t("饮料浓度", "Drink strength")}</span><strong>×${formatNumber(projection.teaEffects?.concentrationMultiplier ?? 1, 3)}</strong></div>
          <div class="mwi-profit-stat"><span>${t("动作速度", "Action speed")}</span><strong>${formatPercent(projection.speedPercent)}</strong></div>
          <div class="mwi-profit-stat"><span>${t("综合效率", "Efficiency")}</span><strong>${formatPercent(projection.efficiencyPercent)}</strong></div>
          <div class="mwi-profit-stat"><span>${t("动作/小时", "Actions/hour")}</span><strong>${formatNumber(projection.actionsPerHour, 1)}</strong></div>
          <div class="mwi-profit-stat"><span>${t("茶费/小时", "Drinks/hour")}</span><strong${numberTitleAttribute(projection.teaCostPerHour)}>${formatMoney(projection.teaCostPerHour)}</strong></div>
        </div>
      </section>
      <section class="mwi-profit-card income">
        <div class="mwi-profit-card-title"><span>${t("产出", "Outputs")}</span><span class="mwi-profit-card-total"${numberTitleAttribute(projection.revenuePerAction)}>${formatMoney(projection.revenuePerAction)} / ${t("动作", "action")}</span></div>
        ${outputRows || `<div class="mwi-profit-no-tea">${t("无可计价产出", "No priced outputs")}</div>`}
      </section>
    </div>`,
  );

  panel.insertAdjacentHTML(
    "beforeend",
    `<div class="mwi-profit-summary">
      ${renderMetric(t("材料成本/动作", "Materials/action"), formatMoney(projection.materialCostPerAction), false, projection.materialCostPerAction)}
      ${renderMetric(t("茶饮成本/动作", "Drinks/action"), formatMoney(projection.teaCostPerAction), false, projection.teaCostPerAction)}
      ${renderMetric(t("主产物收入/动作", "Primary/action"), formatMoney(projection.primaryRevenuePerAction), false, projection.primaryRevenuePerAction)}
      ${renderMetric(t("副产物收入/动作", "Byproducts/action"), formatMoney(projection.byproductRevenuePerAction), false, projection.byproductRevenuePerAction)}
      ${renderMetric(t("净利润/动作", "Profit/action"), formatMoney(projection.netProfitPerAction), true, projection.netProfitPerAction)}
      ${renderMetric(t("净利润/小时", "Profit/hour"), formatMoney(projection.profitPerHour), true, projection.profitPerHour)}
      ${renderMetric(t("净利润/天", "Profit/day"), formatMoney(projection.profitPerHour === null ? null : projection.profitPerHour * 24), true, projection.profitPerHour === null ? null : projection.profitPerHour * 24)}
      ${renderMetric(t("有效周期", "Effective cycle"), projection.secondsPerAction ? `${formatNumber(projection.secondsPerAction, 3)}s` : "—")}
    </div>`,
  );

  if (projection.status === "incomplete") {
    const names = (projection.missingPrices ?? []).map(itemName).join("、");
    panel.insertAdjacentHTML(
      "beforeend",
      `<div class="mwi-profit-warning">${t("缺少必需市场价格，利润暂不计算：", "Missing required market prices; profit is unavailable: ")}${escapeHtml(names || "—")}</div>`,
    );
  } else if (projection.unpricedByproducts?.length) {
    const names = projection.unpricedByproducts.map(itemName).join("、");
    panel.insertAdjacentHTML(
      "beforeend",
      `<div class="mwi-profit-warning">${t("以下副产物没有市场价，已从利润中排除：", "These byproducts have no market price and were excluded: ")}${escapeHtml(names)}</div>`,
    );
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function positionPanel() {
  const state = activePanel;
  if (!state?.anchor?.isConnected || !state.panel?.isConnected) {
    hideProductionProfitPanel();
    return;
  }
  const anchorRect = state.anchor.getBoundingClientRect();
  const panelRect = state.panel.getBoundingClientRect();
  const viewportWidth =
    globalThis.innerWidth ?? document.documentElement.clientWidth;
  const viewportHeight =
    globalThis.innerHeight ?? document.documentElement.clientHeight;
  const roomRight = viewportWidth - anchorRect.right - VIEWPORT_MARGIN;
  const roomLeft = anchorRect.left - VIEWPORT_MARGIN;
  let placement = "right";
  let left;
  let top;
  if (roomRight >= panelRect.width + PANEL_GAP) {
    left = anchorRect.right + PANEL_GAP;
    top = clamp(
      anchorRect.top,
      VIEWPORT_MARGIN,
      viewportHeight - panelRect.height - VIEWPORT_MARGIN,
    );
  } else if (roomLeft >= panelRect.width + PANEL_GAP) {
    placement = "left";
    left = anchorRect.left - panelRect.width - PANEL_GAP;
    top = clamp(
      anchorRect.top,
      VIEWPORT_MARGIN,
      viewportHeight - panelRect.height - VIEWPORT_MARGIN,
    );
  } else {
    const roomBelow = viewportHeight - anchorRect.bottom - VIEWPORT_MARGIN;
    placement = roomBelow >= panelRect.height + PANEL_GAP ? "bottom" : "top";
    left = clamp(
      anchorRect.left,
      VIEWPORT_MARGIN,
      viewportWidth - panelRect.width - VIEWPORT_MARGIN,
    );
    top =
      placement === "bottom"
        ? anchorRect.bottom + PANEL_GAP
        : anchorRect.top - panelRect.height - PANEL_GAP;
    top = clamp(
      top,
      VIEWPORT_MARGIN,
      viewportHeight - panelRect.height - VIEWPORT_MARGIN,
    );
  }
  state.panel.dataset.placement = placement;
  state.panel.style.left = `${Math.round(left)}px`;
  state.panel.style.top = `${Math.round(top)}px`;
}

function hideProductionProfitPanel() {
  const state = activePanel;
  if (!state) {
    document.getElementById(PANEL_ID)?.remove();
    return;
  }
  state.mutationObserver?.disconnect();
  state.resizeObserver?.disconnect();
  globalThis.removeEventListener?.("resize", state.position);
  globalThis.removeEventListener?.("scroll", state.position, true);
  state.panel?.remove();
  activePanel = null;
}

function showProductionProfitPanel(anchor, itemHrid) {
  const actionHrid = runtime.api.resolveProductionActionByItemHrid?.(itemHrid);
  if (!anchor?.isConnected || !actionHrid) {
    hideProductionProfitPanel();
    return null;
  }
  hideProductionProfitPanel();
  addStyles();
  const projection = runtime.api.projectAction(actionHrid, 1);
  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-live", "polite");
  renderPanel(panel, itemHrid, projection);
  anchor.insertAdjacentElement("afterend", panel);

  const position = () =>
    globalThis.requestAnimationFrame?.(positionPanel) ?? positionPanel();
  const mutationObserver = new MutationObserver(() => {
    if (!anchor.isConnected) hideProductionProfitPanel();
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });
  const resizeObserver = globalThis.ResizeObserver
    ? new globalThis.ResizeObserver(position)
    : null;
  resizeObserver?.observe(anchor);
  resizeObserver?.observe(panel);
  activePanel = {
    anchor,
    itemHrid,
    mutationObserver,
    panel,
    position,
    resizeObserver,
  };
  globalThis.addEventListener?.("resize", position);
  globalThis.addEventListener?.("scroll", position, true);
  position();
  return panel;
}

Object.assign(runtime.api, {
  hideProductionProfitPanel,
  positionProductionProfitPanel: positionPanel,
  showProductionProfitPanel,
});
