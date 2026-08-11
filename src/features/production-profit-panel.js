import { runtime } from "../core/runtime.js";
import { positionAnchoredPanel } from "../core/panel-position.js";
import { escapeHtml, findItemsSpriteBase } from "../core/dom-utils.js";

const PANEL_ID = "mwitools-production-profit-panel";
const STYLE_ID = "mwitools-production-profit-panel-style";
const VIEWPORT_MARGIN = 12;
const PANEL_GAP = 10;

let activePanel = null;

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
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
    #${PANEL_ID} { position:fixed; z-index:2147483000; width:min(760px,calc(100vw - 24px)); max-height:min(78vh,760px); box-sizing:border-box; overflow:auto; pointer-events:none; color:var(--color-text-primary,#f2f2f2); border:1px solid rgba(255,255,255,.16); border-radius:10px; background:linear-gradient(145deg,rgba(35,39,47,.985),rgba(19,22,28,.985)); box-shadow:0 18px 48px rgba(0,0,0,.48),0 2px 8px rgba(0,0,0,.3); font-family:inherit; font-size:12px; line-height:1.35; scrollbar-width:thin; backdrop-filter:blur(12px); }
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
    .mwi-profit-valuations { display:flex; flex-direction:column; gap:4px; padding:0 12px 10px; }
    .mwi-profit-valuation-row { display:grid; grid-template-columns:126px repeat(6,minmax(0,1fr)); min-width:0; overflow:hidden; border:1px solid rgba(255,255,255,.1); border-left:3px solid var(--mwi-valuation-color); border-radius:7px; background:rgba(255,255,255,.03); }
    .mwi-profit-valuation-row[data-mode="fair"] { --mwi-valuation-color:#74a9ef; }
    .mwi-profit-valuation-row[data-mode="conservative"] { --mwi-valuation-color:#e1b65d; }
    .mwi-profit-valuation-row[data-mode="aggressive"] { --mwi-valuation-color:#68c98e; }
    .mwi-profit-valuation-row.incomplete { opacity:.72; }
    .mwi-profit-valuation-name { display:flex; min-width:0; flex-direction:column; justify-content:center; gap:1px; padding:5px 8px; border-right:1px solid rgba(255,255,255,.08); }
    .mwi-profit-valuation-title { color:#fff; font-size:10.5px; font-weight:750; line-height:1.2; }
    .mwi-profit-valuation-state { color:var(--mwi-valuation-color); font-size:8px; line-height:1.15; }
    .mwi-profit-valuation-metric { min-width:0; padding:5px 4px; border-left:1px solid rgba(255,255,255,.055); text-align:center; }
    .mwi-profit-valuation-name + .mwi-profit-valuation-metric { border-left:0; }
    .mwi-profit-valuation-label { min-height:2.2em; color:var(--color-text-secondary,#9da5b0); font-size:8px; line-height:1.1; }
    .mwi-profit-valuation-value { margin-top:2px; color:#fff; font-size:10.5px; font-weight:700; overflow-wrap:anywhere; }
    .mwi-profit-valuation-metric.profit { background:rgba(55,160,97,.075); }
    .mwi-profit-valuation-metric.profit .mwi-profit-valuation-value { color:#82dfa4; }
    .mwi-profit-warning { margin:0 12px 12px; padding:8px 10px; border:1px solid rgba(224,177,75,.25); border-radius:7px; background:rgba(195,139,30,.09); color:#e3c276; font-size:10px; }
    .mwi-profit-hint { margin:0 12px 12px; color:var(--color-text-secondary,#8b93a0); font-size:9.5px; line-height:1.35; }
    #${PANEL_ID}.mwi-profit-pinned { pointer-events:auto; }
    .mwi-profit-close { flex:0 0 auto; width:22px; height:22px; margin-left:6px; padding:0; border:1px solid rgba(255,255,255,.16); border-radius:5px; background:rgba(255,255,255,.06); color:#e7e9ef; font-size:14px; line-height:1; cursor:pointer; }
    .mwi-profit-close:hover { background:rgba(255,255,255,.14); }
    .mwi-loot-controls { display:flex; flex-wrap:wrap; gap:6px; margin:0 12px 4px; }
    .mwi-loot-pill { padding:3px 9px; border:1px solid rgba(255,255,255,.16); border-radius:999px; background:rgba(255,255,255,.05); color:var(--color-text-secondary,#c2c8d2); font-size:10px; font-weight:600; cursor:pointer; }
    .mwi-loot-pill:hover { border-color:rgba(255,255,255,.3); }
    .mwi-loot-pill.active { border-color:var(--color-primary,#70a8ff); background:rgba(112,168,255,.16); color:#dbe6ff; }
    .mwi-profit-state { margin:12px; padding:18px; border:1px solid rgba(255,255,255,.09); border-radius:8px; background:rgba(255,255,255,.03); color:var(--color-text-secondary,#acb3be); text-align:center; }
    .mwi-profit-icon,.mwi-profit-icon-fallback { width:26px; height:26px; }
    .mwi-profit-icon-fallback { display:grid; place-items:center; border-radius:5px; background:rgba(255,255,255,.09); color:#fff; font-weight:700; }
    .mwi-profit-header-icon .mwi-profit-icon,.mwi-profit-header-icon .mwi-profit-icon-fallback { width:32px; height:32px; }
    .mwi-profit-tea .mwi-profit-icon,.mwi-profit-tea .mwi-profit-icon-fallback { width:23px; height:23px; }
    .mwi-loot-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(112px,1fr)); gap:6px; margin-top:8px; }
    .mwi-loot-cell { display:flex; min-width:0; align-items:center; gap:6px; padding:5px 7px; border:1px solid rgba(255,255,255,.08); border-radius:6px; background:rgba(255,255,255,.03); }
    .mwi-loot-cell.unpriced { opacity:.6; }
    .mwi-loot-cell-icon { position:relative; flex:0 0 26px; width:26px; height:26px; }
    .mwi-loot-cell-icon .mwi-profit-icon,.mwi-loot-cell-icon .mwi-profit-icon-fallback { width:26px; height:26px; }
    .mwi-loot-cell-chance { position:absolute; right:-3px; bottom:-3px; padding:0 3px; border-radius:6px; background:rgba(15,18,28,.92); color:#cbd3f4; font-size:8px; line-height:1.3; box-shadow:0 0 0 1px rgba(255,255,255,.1); }
    .mwi-loot-cell-main { min-width:0; }
    .mwi-loot-cell-name { overflow:hidden; color:#edf0f4; font-size:10.5px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
    .mwi-loot-cell-value { margin-top:1px; color:#82dfa4; font-size:10px; font-weight:650; }
    .mwi-loot-cell.unpriced .mwi-loot-cell-value { color:var(--color-text-secondary,#9ba2ad); }
    @media(max-width:760px){#${PANEL_ID}{max-height:72vh}.mwi-profit-body{grid-template-columns:1fr}.mwi-profit-player{order:-1;flex-direction:row;flex-wrap:wrap}.mwi-profit-flow{transform:rotate(90deg)}.mwi-profit-stat-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 8px}.mwi-profit-valuation-row{grid-template-columns:repeat(2,minmax(0,1fr))}.mwi-profit-valuation-name{grid-column:1 / 3;border-right:0;border-bottom:1px solid rgba(255,255,255,.08)}.mwi-profit-valuation-metric{border-top:1px solid rgba(255,255,255,.055)}.mwi-profit-valuation-name + .mwi-profit-valuation-metric{border-left:0}}
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
  const priceLabel = isInput
    ? t("市价", "Market value")
    : item.valueSource === "derived"
      ? t("派生期望值", "Derived expected value")
      : t("税后市价", "Net market value");
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

function renderValuationMetric(label, value, profit = false) {
  return `<div class="mwi-profit-valuation-metric${profit ? " profit" : ""}"><div class="mwi-profit-valuation-label">${escapeHtml(label)}</div><div class="mwi-profit-valuation-value"${numberTitleAttribute(value)}>${formatMoney(value)}</div></div>`;
}

const VALUATION_ROWS = [
  {
    mode: "fair",
    title: { zh: "市价", en: "Market value" },
    explanation: {
      zh: "服务器市场价值",
      en: "Server market value",
    },
  },
  {
    mode: "conservative",
    title: { zh: "效率（高买低卖）", en: "Efficiency (buy high, sell low)" },
    explanation: {
      zh: "卖单买入 · 买单卖出",
      en: "Buy at ask · sell at bid",
    },
  },
  {
    mode: "aggressive",
    title: { zh: "贪心（低买高卖）", en: "Greedy (buy low, sell high)" },
    explanation: {
      zh: "买单买入 · 卖单卖出",
      en: "Buy at bid · sell at ask",
    },
  },
];

function valuationText(value) {
  return value?.[runtime.config.isZH ? "zh" : "en"] ?? "";
}

function renderValuationRow(definition, valuation) {
  const complete = Boolean(valuation?.complete);
  const totalCost = complete
    ? valuation.materialCostPerAction + valuation.teaCostPerAction
    : null;
  const profitPerDay = complete ? valuation.profitPerHour * 24 : null;
  return `<section class="mwi-profit-valuation-row${complete ? "" : " incomplete"}" data-mode="${definition.mode}">
    <div class="mwi-profit-valuation-name">
      <div class="mwi-profit-valuation-title">${escapeHtml(valuationText(definition.title))}</div>
      <div class="mwi-profit-valuation-state">${escapeHtml(valuationText(definition.explanation))}</div>
    </div>
    ${renderValuationMetric(t("税后收入/动作", "Net revenue/action"), complete ? valuation.revenuePerAction : null)}
    ${renderValuationMetric(t("材料成本/动作", "Materials/action"), complete ? valuation.materialCostPerAction : null)}
    ${renderValuationMetric(t("茶饮成本/动作", "Tea cost/action"), complete ? valuation.teaCostPerAction : null)}
    ${renderValuationMetric(t("总成本/动作", "Total cost/action"), totalCost)}
    ${renderValuationMetric(t("净利润/动作", "Net profit/action"), complete ? valuation.netProfitPerAction : null, true)}
    ${renderValuationMetric(t("净利润/天", "Net profit/day"), profitPerDay, true)}
  </section>`;
}

function statusInfo(projection) {
  if (projection.status === "waiting") {
    return {
      className: "waiting",
      label: t("玩家数据未就绪", "Player data pending"),
    };
  }
  const valuations = VALUATION_ROWS.map(
    ({ mode }) => projection.valuations?.[mode],
  );
  const completeCount = valuations.filter(
    (valuation) => valuation?.complete,
  ).length;
  if (completeCount === 0) {
    return { className: "incomplete", label: t("无法计算", "Unavailable") };
  }
  if (completeCount < valuations.length) {
    return {
      className: "partial",
      label: t("部分口径缺价", "Some prices missing"),
    };
  }
  if (
    valuations.some(
      (valuation) =>
        valuation?.unpricedByproducts?.length > 0 ||
        valuation?.derivedMissingPrices?.length > 0,
    )
  ) {
    return { className: "partial", label: t("部分计价", "Partial pricing") };
  }
  return { className: "complete", label: t("完整计价", "Fully priced") };
}

function renderPanel(panel, itemHrid, projection, options = {}) {
  const productName = itemName(itemHrid);
  const status = statusInfo(projection);
  const detail = projection.detail;
  const directAction = Boolean(options.directAction);
  const title = directAction
    ? actionName(projection.actionHrid, detail)
    : productName;
  const subtitle = directAction
    ? `${t("全部期望产物", "All expected outputs")} · ${t("当前玩家实时配置", "Current player configuration")}`
    : `${actionName(projection.actionHrid, detail)} · ${t("当前玩家实时配置", "Current player configuration")}`;
  panel.dataset.status = status.className;
  panel.innerHTML = `
    <header class="mwi-profit-header">
      <div class="mwi-profit-header-icon">${renderItemIcon(itemHrid, productName)}</div>
      <div class="mwi-profit-header-main">
        <div class="mwi-profit-title">${escapeHtml(title)}</div>
        <div class="mwi-profit-subtitle">${escapeHtml(subtitle)}</div>
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
          <div class="mwi-profit-stat"><span>${t("茶费/小时", "Tea cost/hour")}</span><strong${numberTitleAttribute(projection.teaCostPerHour)}>${formatMoney(projection.teaCostPerHour)}</strong></div>
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
    `<div class="mwi-profit-valuations">
      ${VALUATION_ROWS.map((definition) => renderValuationRow(definition, projection.valuations?.[definition.mode])).join("")}
    </div>`,
  );

  const missingValuations = VALUATION_ROWS.filter(
    ({ mode }) => !projection.valuations?.[mode]?.complete,
  );
  const warningParts = [];
  if (missingValuations.length) {
    const details = missingValuations
      .map((definition) => {
        const names = (
          projection.valuations?.[definition.mode]?.missingPrices ?? []
        )
          .map(itemName)
          .join(runtime.config.isZH ? "、" : ", ");
        return `${valuationText(definition.title)}：${names || "—"}`;
      })
      .join(runtime.config.isZH ? "；" : "; ");
    warningParts.push(
      `${t("以下口径缺少必需市场价格：", "Required prices are missing for: ")}${details}`,
    );
  }
  const unpricedByproducts = [
    ...new Set(
      VALUATION_ROWS.flatMap(
        ({ mode }) => projection.valuations?.[mode]?.unpricedByproducts ?? [],
      ),
    ),
  ];
  if (unpricedByproducts.length) {
    warningParts.push(
      `${t("以下副产物没有市场价，已从利润中排除：", "These byproducts have no market price and were excluded: ")}${unpricedByproducts.map(itemName).join(runtime.config.isZH ? "、" : ", ")}`,
    );
  }
  const derivedMissingPrices = [
    ...new Set(
      VALUATION_ROWS.flatMap(
        ({ mode }) => projection.valuations?.[mode]?.derivedMissingPrices ?? [],
      ),
    ),
  ];
  if (derivedMissingPrices.length) {
    warningParts.push(
      `${t("派生期望值仍有内部产物缺价，当前利润只计入已知部分：", "Some contents used by derived expected values are unpriced; profit includes only known contents: ")}${derivedMissingPrices.map(itemName).join(runtime.config.isZH ? "、" : ", ")}`,
    );
  }
  if (!warningParts.length) return;
  panel.insertAdjacentHTML(
    "beforeend",
    `<div class="mwi-profit-warning">${escapeHtml(warningParts.join(runtime.config.isZH ? "；" : "; "))}</div>`,
  );
}

function positionPanel() {
  const state = activePanel;
  const positioned = positionAnchoredPanel(state?.anchor, state?.panel, {
    gap: PANEL_GAP,
    margin: VIEWPORT_MARGIN,
  });
  if (!positioned) hideProductionProfitPanel();
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
  if (state.outsideHandler) {
    document.removeEventListener("mousedown", state.outsideHandler, true);
  }
  state.panel?.remove();
  activePanel = null;
}

function renderLootChestDropCell(drop) {
  const name = itemName(drop.itemHrid);
  const chance =
    drop.dropRate >= 1
      ? t("必得", "100%")
      : `${formatNumber(drop.dropRate * 100, drop.dropRate * 100 < 1 ? 2 : 0)}%`;
  const countRange =
    drop.minCount === drop.maxCount
      ? formatNumber(drop.minCount, 0)
      : `${formatNumber(drop.minCount, 0)}–${formatNumber(drop.maxCount, 0)}`;
  // The full breakdown lives in the title so nothing is lost in the compact
  // cell (the hover panel cannot be scrolled).
  // Nested non-tradable chests are valued by their own opening expectation.
  const unitLabel = drop.nested
    ? `${t("开箱期望", "Opening EV")} ${formatMoney(drop.unitValue)}`
    : `${t("单价", "Unit")}: ${formatMoney(drop.unitValue)}`;
  const title = `${name}${drop.nested ? ` (${t("嵌套宝箱", "Nested chest")})` : ""}\n${t("概率", "Chance")}: ${chance} · ${t("数量", "Count")}: ${countRange} · ${t("期望", "Expected")}: ${formatNumber(drop.expectedCount, 2)}\n${unitLabel} · ${t("期望价值", "Expected value")}: ${drop.priced ? formatMoney(drop.value) : t("无价", "No price")}`;
  const valueText = drop.priced
    ? `${drop.nested ? "≈" : ""}${formatMoney(drop.value)}`
    : t("无价", "No price");
  return `
    <div class="mwi-loot-cell${drop.priced ? "" : " unpriced"}" data-item-hrid="${escapeHtml(drop.itemHrid)}" title="${escapeHtml(title)}">
      <div class="mwi-loot-cell-icon">
        ${renderItemIcon(drop.itemHrid, name)}
        <span class="mwi-loot-cell-chance">${escapeHtml(chance)}</span>
      </div>
      <div class="mwi-loot-cell-main">
        <div class="mwi-loot-cell-name">${escapeHtml(name)}</div>
        <div class="mwi-loot-cell-value">${escapeHtml(valueText)}</div>
      </div>
    </div>`;
}

// A pinned loot panel exposes the three valuation options as inline toggle
// pills so players can change them without opening settings.
function renderLootChestControls(config = {}) {
  const pill = (setting, label, active) =>
    `<button type="button" class="mwi-loot-pill${active ? " active" : ""}" data-mwi-loot-setting="${setting}">${escapeHtml(label)}</button>`;
  return `<div class="mwi-loot-controls">
    ${pill(
      "lootSellAtAsk",
      config.sellAtAsk
        ? t("卖出：卖单(左)", "Sell: ask (left)")
        : t("卖出：买单(右)", "Sell: bid (right)"),
      config.sellAtAsk,
    )}
    ${pill(
      "lootBuyAtAsk",
      config.buyAtAsk
        ? t("买入：卖单(左)", "Buy: ask (left)")
        : t("买入：买单(右)", "Buy: bid (right)"),
      config.buyAtAsk,
    )}
    ${pill(
      "lootKeyFromFragments",
      config.fromFragments
        ? t("钥匙：碎片自制", "Key: fragments")
        : t("钥匙：成品", "Key: finished"),
      config.fromFragments,
    )}
  </div>`;
}

function renderLootChestPanel(panel, itemHrid, chest, options = {}) {
  const pinned = Boolean(options.pinned);
  const productName = itemName(itemHrid);
  const hasKey = Boolean(chest.keyItemHrid);
  const subtitle = hasKey
    ? `${t("开箱期望", "Opening estimate")} · ${t("已扣钥匙成本", "Net of key cost")}`
    : t("开箱期望", "Opening estimate");
  panel.dataset.status = "complete";
  panel.classList.toggle("mwi-profit-pinned", pinned);
  const closeButton = pinned
    ? `<button type="button" class="mwi-profit-close" aria-label="${t("关闭", "Close")}" data-mwi-loot-close="1">×</button>`
    : "";
  panel.innerHTML = `
    <header class="mwi-profit-header">
      <div class="mwi-profit-header-icon">${renderItemIcon(itemHrid, productName)}</div>
      <div class="mwi-profit-header-main">
        <div class="mwi-profit-title">${escapeHtml(productName)}</div>
        <div class="mwi-profit-subtitle">${escapeHtml(subtitle)}</div>
      </div>
      ${closeButton}
    </header>`;

  if (pinned) {
    panel.insertAdjacentHTML(
      "beforeend",
      renderLootChestControls(chest.config),
    );
  }

  const cells = chest.drops.map(renderLootChestDropCell).join("");
  panel.insertAdjacentHTML(
    "beforeend",
    `<section class="mwi-profit-card income" style="margin:12px;">
      <div class="mwi-profit-card-title"><span>${t("可能产出", "Possible drops")} (${chest.drops.length})</span><span class="mwi-profit-card-total"${numberTitleAttribute(chest.grossValue)}>${formatMoney(chest.grossValue)}</span></div>
      ${cells ? `<div class="mwi-loot-grid">${cells}</div>` : `<div class="mwi-profit-no-tea">${t("无可计价产出", "No priced drops")}</div>`}
    </section>`,
  );

  const config = chest.config ?? {};
  const sellLabel = config.sellAtAsk
    ? t("卖单挂单(左)", "Sell order (left)")
    : t("买单立即(右)", "Buy order (right)");
  const buyLabel = config.buyAtAsk
    ? t("卖单立即(左)", "Sell order (left)")
    : t("买单挂单(右)", "Buy order (right)");
  const metrics = [
    renderValuationMetric(t("毛期望价值", "Gross value"), chest.grossValue),
  ];
  if (hasKey) {
    const keySource = config.fromFragments
      ? t("碎片自制", "Crafted from fragments")
      : t("成品买入", "Finished key");
    metrics.push(
      renderValuationMetric(
        `${t("钥匙成本", "Key cost")} (${escapeHtml(keySource)})`,
        chest.keyCost,
      ),
      renderValuationMetric(t("净期望价值", "Net value"), chest.netValue, true),
    );
  }
  const stateLine = hasKey
    ? `${t("产物", "Drops")}: ${sellLabel} · ${t("钥匙", "Key")}: ${buyLabel} · ${escapeHtml(itemName(chest.keyItemHrid))}`
    : `${t("产物卖出", "Drops sold at")}: ${sellLabel}`;
  panel.insertAdjacentHTML(
    "beforeend",
    `<div class="mwi-profit-valuations">
      <section class="mwi-profit-valuation-row" data-mode="fair">
        <div class="mwi-profit-valuation-name">
          <div class="mwi-profit-valuation-title">${t("期望价值", "Expected value")}</div>
          <div class="mwi-profit-valuation-state">${escapeHtml(stateLine)}</div>
        </div>
        ${metrics.join("")}
      </section>
    </div>`,
  );

  panel.insertAdjacentHTML(
    "beforeend",
    `<div class="mwi-profit-hint">${t(
      "可在 MWITools 设置的“宝箱价值估算”中展开设置钥匙来源与买卖方向。",
      "Expand “Loot chest estimate” in MWITools settings to set key source and buy/sell sides.",
    )}</div>`,
  );

  if (chest.missing.length) {
    const names = chest.missing.map(itemName).join("、");
    panel.insertAdjacentHTML(
      "beforeend",
      `<div class="mwi-profit-warning" style="margin:0 12px 12px;">${t("以下产出没有市场价，已从期望中排除：", "These drops have no market price and were excluded: ")}${escapeHtml(names)}</div>`,
    );
  }
}

// Insert the panel after the anchor and wire up the shared lifecycle: keep it
// positioned on resize/scroll and remove it when the anchor leaves the DOM.
function mountPanel(anchor, panel, extraState = {}) {
  const pinned = Boolean(extraState.pinned);
  anchor.insertAdjacentElement("afterend", panel);
  const position = () =>
    globalThis.requestAnimationFrame?.(positionPanel) ?? positionPanel();
  // A pinned panel outlives its anchor tooltip, so it stays put (no reposition)
  // and does not auto-hide when the tooltip disappears.
  let mutationObserver = null;
  let resizeObserver = null;
  if (!pinned) {
    mutationObserver = new MutationObserver(() => {
      if (!anchor.isConnected) hideProductionProfitPanel();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    resizeObserver = globalThis.ResizeObserver
      ? new globalThis.ResizeObserver(position)
      : null;
    resizeObserver?.observe(anchor);
    resizeObserver?.observe(panel);
    globalThis.addEventListener?.("resize", position);
    globalThis.addEventListener?.("scroll", position, true);
  }
  activePanel = {
    anchor,
    panel,
    position,
    mutationObserver,
    resizeObserver,
    pinned,
    ...extraState,
  };
  // Position while the anchor tooltip is still in the DOM, then, for a pinned
  // panel, reparent it to <body>. The panel is inserted next to the tooltip,
  // which lives in a React portal; when the mouse leaves, React unmounts that
  // subtree and would take the panel with it. Moving to <body> detaches it from
  // the tooltip's lifecycle so it stays put until closed explicitly.
  position();
  if (pinned && document.body && panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }
  return panel;
}

function createPanelElement() {
  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-live", "polite");
  return panel;
}

function showProductionProfitPanel(anchor, itemHrid, options = {}) {
  // A pinned panel stays until closed explicitly; ignore hover-driven panels.
  if (activePanel?.pinned) return null;
  const actionHrid =
    options.actionHrid ??
    runtime.api.resolveProductionActionByItemHrid?.(itemHrid);
  if (!anchor?.isConnected || !actionHrid) {
    hideProductionProfitPanel();
    return null;
  }
  hideProductionProfitPanel();
  addStyles();
  const projection = runtime.api.projectAction(actionHrid, 1);
  const primaryItemHrid =
    itemHrid ??
    runtime.api.getExpectedOutputs?.(projection.detail)?.[0]?.itemHrid;
  if (!primaryItemHrid) return null;
  const panel = createPanelElement();
  renderPanel(panel, primaryItemHrid, projection, {
    directAction: Boolean(options.actionHrid),
  });
  return mountPanel(anchor, panel, {
    itemHrid: primaryItemHrid,
    actionHrid,
  });
}

function showLootChestPanel(anchor, itemHrid, options = {}) {
  const pinned = Boolean(options.pinned);
  // A hover panel must not replace or close an already-pinned one; only an
  // explicit pinned request (double-click) may take over.
  if (!pinned && activePanel?.pinned) return null;
  const chest = runtime.api.projectLootChest?.(itemHrid);
  if (!anchor?.isConnected || !chest) {
    hideProductionProfitPanel();
    return null;
  }
  hideProductionProfitPanel();
  addStyles();
  const panel = createPanelElement();
  renderLootChestPanel(panel, itemHrid, chest, { pinned });
  mountPanel(anchor, panel, { itemHrid, pinned });
  if (pinned) attachLootChestControls(panel, itemHrid);
  return panel;
}

// Wire up a pinned loot panel: pill toggles flip a setting and re-render in
// place; the × button and any outside click close it.
function attachLootChestControls(panel, itemHrid) {
  const rerender = () => {
    const chest = runtime.api.projectLootChest?.(itemHrid);
    if (!chest) return;
    renderLootChestPanel(panel, itemHrid, chest, { pinned: true });
  };
  panel.addEventListener("click", (event) => {
    const closeButton = event.target.closest?.("[data-mwi-loot-close]");
    if (closeButton) {
      event.stopPropagation();
      hideProductionProfitPanel();
      return;
    }
    const pill = event.target.closest?.("[data-mwi-loot-setting]");
    if (!pill) return;
    event.stopPropagation();
    const settingId = pill.dataset.mwiLootSetting;
    const next = !runtime.settings.get?.(settingId);
    void runtime.settings.set?.(settingId, next, { persist: true });
    rerender();
  });
  const outsideHandler = (event) => {
    if (!activePanel?.pinned || activePanel.panel !== panel) return;
    if (panel.contains(event.target)) return;
    hideProductionProfitPanel();
  };
  // Defer so the double-click that opened the panel does not immediately close
  // it, and register on the document so any outside click dismisses it.
  globalThis.setTimeout?.(() => {
    if (activePanel?.panel !== panel) return;
    document.addEventListener("mousedown", outsideHandler, true);
    activePanel.outsideHandler = outsideHandler;
  }, 0);
}

// Re-open the currently shown loot panel in pinned mode, keeping its position.
// Used by the double-click handler; no-op if no loot panel is open.
function pinActiveLootChestPanel() {
  const state = activePanel;
  if (!state || state.pinned || !state.itemHrid) return false;
  if (!runtime.state.initData_openableLootDropMap?.[state.itemHrid]) {
    return false;
  }
  const anchor = state.anchor;
  const itemHrid = state.itemHrid;
  if (!anchor?.isConnected) return false;
  return Boolean(showLootChestPanel(anchor, itemHrid, { pinned: true }));
}

// Hover-driven "hide" (mouse leaving an item): a no-op while a panel is pinned
// so moving the cursor to other items does not dismiss the pinned panel.
function dismissHoverPanel() {
  if (activePanel?.pinned) return;
  hideProductionProfitPanel();
}

Object.assign(runtime.api, {
  hideProductionProfitPanel,
  dismissHoverPanel,
  positionProductionProfitPanel: positionPanel,
  showProductionProfitPanel,
  showLootChestPanel,
  pinActiveLootChestPanel,
});
