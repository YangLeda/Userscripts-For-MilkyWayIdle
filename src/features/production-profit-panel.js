import { runtime } from "../core/runtime.js";
import {
  actionName as localizedActionName,
  itemName as localizedItemName,
  localize,
} from "../core/localization.js";

const PANEL_ID = "mwitools-production-profit-panel";
const STYLE_ID = "mwitools-production-profit-panel-style";
const VIEWPORT_MARGIN = 12;
const PANEL_GAP = 10;

let activePanel = null;

function t(zh, en) {
  return localize(zh, en);
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
  return localizedItemName(itemHrid);
}

function actionName(actionHrid, detail) {
  return localizedActionName(actionHrid, { detail });
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
    .mwi-profit-valuation-row.mwi-loot-valuation-row { grid-template-columns:126px repeat(3,minmax(0,1fr)); }
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
    .mwi-profit-close { flex:0 0 auto; width:22px; height:22px; margin-left:auto; padding:0; border:1px solid rgba(255,255,255,.16); border-radius:5px; background:rgba(255,255,255,.06); color:#e7e9ef; font-size:14px; line-height:1; cursor:pointer; }
    .mwi-profit-close:hover { background:rgba(255,255,255,.14); }
    .mwi-loot-controls { display:grid; grid-template-columns:minmax(0,1fr); gap:8px; margin:10px 12px 0; padding:8px 10px; border:1px solid rgba(255,255,255,.08); border-radius:7px; background:rgba(0,0,0,.12); }
    .mwi-loot-controls.has-key { grid-template-columns:repeat(3,minmax(0,1fr)); }
    .mwi-loot-control { display:grid; min-width:0; min-height:38px; grid-template-columns:minmax(0,1fr) 36px; grid-template-rows:auto 20px; align-items:center; gap:2px 7px; padding:0 7px; border-left:1px solid rgba(255,255,255,.07); }
    .mwi-loot-control:first-child { padding-left:0; border-left:0; }
    .mwi-loot-control-label { min-width:0; grid-column:1 / 3; color:#edf0f4; font-size:10.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mwi-loot-control-state { min-width:0; color:var(--color-text-secondary,#aeb4bf); font-size:9.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mwi-loot-switch { position:relative; width:36px; height:20px; flex:0 0 36px; }
    .mwi-loot-switch input { position:absolute; opacity:0; pointer-events:none; }
    .mwi-loot-switch span { position:absolute; inset:0; border-radius:999px; cursor:pointer; background:#555; transition:.16s; }
    .mwi-loot-switch span::after { content:""; position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#fff; transition:.16s; }
    .mwi-loot-switch input:checked + span { background:var(--color-primary,#70a8ff); }
    .mwi-loot-switch input:checked + span::after { transform:translateX(16px); }
    .mwi-loot-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(112px,1fr)); gap:6px; margin-top:8px; }
    .mwi-loot-cell { position:relative; display:flex; min-width:0; align-items:center; gap:6px; padding:5px 7px; border:1px solid rgba(255,255,255,.08); border-radius:6px; background:rgba(255,255,255,.03); }
    .mwi-loot-cell.unpriced { opacity:.6; }
    .mwi-loot-cell.best-redemption { border-color:rgba(255,193,74,.86); background:linear-gradient(135deg,rgba(255,185,55,.16),rgba(255,255,255,.035)); box-shadow:0 0 0 1px rgba(255,184,55,.12),0 0 14px rgba(255,171,42,.12); }
    .mwi-loot-best-badge { position:absolute; top:-6px; right:-4px; z-index:1; padding:1px 5px; border:1px solid rgba(255,211,112,.72); border-radius:999px; background:#7b5410; color:#fff3cf; font-size:8px; font-weight:750; line-height:1.35; white-space:nowrap; }
    .mwi-loot-cell-icon { position:relative; flex:0 0 26px; width:26px; height:26px; }
    .mwi-loot-cell-icon .mwi-profit-icon,.mwi-loot-cell-icon .mwi-profit-icon-fallback { width:26px; height:26px; }
    .mwi-loot-cell-chance { position:absolute; right:-3px; bottom:-3px; padding:0 3px; border-radius:6px; background:rgba(15,18,28,.92); color:#cbd3f4; font-size:8px; line-height:1.3; box-shadow:0 0 0 1px rgba(255,255,255,.1); }
    .mwi-loot-cell-main { min-width:0; }
    .mwi-loot-cell-name { overflow:hidden; color:#edf0f4; font-size:10.5px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
    .mwi-loot-cell-value { margin-top:1px; color:#82dfa4; font-size:10px; font-weight:650; }
    .mwi-loot-cell.unpriced .mwi-loot-cell-value { color:var(--color-text-secondary,#9ba2ad); }
    .mwi-profit-state { margin:12px; padding:18px; border:1px solid rgba(255,255,255,.09); border-radius:8px; background:rgba(255,255,255,.03); color:var(--color-text-secondary,#acb3be); text-align:center; }
    .mwi-profit-icon,.mwi-profit-icon-fallback { width:26px; height:26px; }
    .mwi-profit-icon-fallback { display:grid; place-items:center; border-radius:5px; background:rgba(255,255,255,.09); color:#fff; font-weight:700; }
    .mwi-profit-header-icon .mwi-profit-icon,.mwi-profit-header-icon .mwi-profit-icon-fallback { width:32px; height:32px; }
    .mwi-profit-tea .mwi-profit-icon,.mwi-profit-tea .mwi-profit-icon-fallback { width:23px; height:23px; }
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
      zh: "市场价值",
      en: "Market value",
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
  const redemptions = drop.redemptions ?? [];
  const redemptionLines = redemptions.map((route) => {
    const tokenName = itemName(route.tokenItemHrid);
    return `${t("最佳兑换", "Best exchange")} · ${tokenName}: ${formatNumber(route.tokenCount, 0)} → ${formatNumber(route.rewardCount, 0)} ${name} · ${formatMoney(route.valuePerToken)} / ${t("代币", "token")}`;
  });
  const sourceLabel =
    drop.valueSource === "redemption"
      ? t("最佳兑换折算", "Best redemption")
      : drop.valueSource === "derived"
        ? t("派生期望值", "Derived expected value")
        : drop.valueSource === "excluded"
          ? t("牛铃已忽略", "Cowbells ignored")
          : drop.valueSource === "zero"
            ? t("封印计为 0", "Seal valued at 0")
            : drop.nested
              ? t("开箱期望", "Opening EV")
              : t("单价", "Unit");
  const title = [
    `${name}\n${t("概率", "Chance")}: ${chance} · ${t("数量", "Count")}: ${countRange} · ${t("期望", "Expected")}: ${formatNumber(drop.expectedCount, 2)}`,
    `${sourceLabel}: ${drop.priced ? formatMoney(drop.unitValue) : t("无价", "No price")} · ${t("期望价值", "Expected value")}: ${drop.priced ? formatMoney(drop.value) : t("无价", "No price")}`,
    ...redemptionLines,
  ].join("\n");
  const valueText = drop.priced
    ? `${drop.nested ? "≈" : ""}${formatMoney(drop.value)}`
    : t("无价", "No price");
  return `
    <div class="mwi-loot-cell${drop.priced ? "" : " unpriced"}${redemptions.length ? " best-redemption" : ""}" data-item-hrid="${escapeHtml(drop.itemHrid)}" title="${escapeHtml(title)}">
      ${redemptions.length ? `<span class="mwi-loot-best-badge">${t("最佳兑换", "Best Exchange")}</span>` : ""}
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

function renderLootSwitch(setting, label, state, checked) {
  return `<div class="mwi-loot-control">
    <span class="mwi-loot-control-label">${escapeHtml(label)}</span>
    <span class="mwi-loot-control-state">${escapeHtml(state)}</span>
    <label class="mwi-loot-switch">
      <input type="checkbox" data-mwi-loot-setting="${setting}" aria-label="${escapeHtml(label)}"${checked ? " checked" : ""}>
      <span aria-hidden="true"></span>
    </label>
  </div>`;
}

function renderLootChestControls(config, hasKey) {
  const controls = [
    renderLootSwitch(
      "lootSellAtAsk",
      t("产物卖出", "Sell drops"),
      config.sellAtAsk ? t("挂卖单", "List at ask") : t("立即卖出", "Sell now"),
      config.sellAtAsk,
    ),
    renderLootSwitch(
      "lootIgnoreCowbells",
      t("牛铃价值", "Cowbell value"),
      config.ignoreCowbells ? t("忽略", "Ignored") : t("计入", "Included"),
      config.ignoreCowbells,
    ),
  ];
  if (hasKey) {
    controls.push(
      renderLootSwitch(
        "lootBuyAtAsk",
        t("钥匙或碎片", "Key or fragments"),
        config.buyAtAsk ? t("立即买入", "Buy now") : t("挂买单", "Place bid"),
        config.buyAtAsk,
      ),
      renderLootSwitch(
        "lootKeyFromFragments",
        t("钥匙来源", "Key source"),
        config.fromFragments
          ? t("碎片自制", "Craft fragments")
          : t("购买成品", "Buy finished"),
        config.fromFragments,
      ),
    );
  }
  return `<div class="mwi-loot-controls${hasKey ? " has-key" : ""}">${controls.join("")}</div>`;
}

function renderLootChestPanel(panel, itemHrid, chest, options = {}) {
  const pinned = Boolean(options.pinned);
  const productName = itemName(itemHrid);
  const hasKey = Boolean(chest.keyItemHrid);
  const statusClass = chest.complete ? "complete" : "partial";
  const statusLabel = chest.complete
    ? t("完整计价", "Fully priced")
    : t("部分计价", "Partial pricing");
  panel.dataset.status = statusClass;
  panel.classList.toggle("mwi-profit-pinned", pinned);
  panel.innerHTML = `
    <header class="mwi-profit-header">
      <div class="mwi-profit-header-icon">${renderItemIcon(itemHrid, productName)}</div>
      <div class="mwi-profit-header-main">
        <div class="mwi-profit-title">${escapeHtml(productName)}</div>
        <div class="mwi-profit-subtitle">${escapeHtml(hasKey ? t("开箱期望 · 已扣钥匙成本", "Opening estimate · net of key cost") : t("开箱期望", "Opening estimate"))}</div>
      </div>
      <div class="mwi-profit-status ${statusClass}">${statusLabel}</div>
      ${pinned ? `<button type="button" class="mwi-profit-close" aria-label="${t("关闭", "Close")}" data-mwi-loot-close="1">×</button>` : ""}
    </header>`;

  if (pinned) {
    panel.insertAdjacentHTML(
      "beforeend",
      renderLootChestControls(chest.config, hasKey),
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

  const sellLabel = chest.config.sellAtAsk
    ? t("挂卖单", "List at ask")
    : t("立即卖出", "Sell now");
  const keyLabel = !hasKey
    ? t("无需钥匙", "No key")
    : chest.config.fromFragments
      ? t("碎片自制", "Crafted from fragments")
      : t("购买成品", "Buy finished");
  panel.insertAdjacentHTML(
    "beforeend",
    `<div class="mwi-profit-valuations">
      <section class="mwi-profit-valuation-row mwi-loot-valuation-row${chest.complete ? "" : " incomplete"}" data-mode="fair">
        <div class="mwi-profit-valuation-name">
          <div class="mwi-profit-valuation-title">${t("期望价值", "Expected value")}</div>
          <div class="mwi-profit-valuation-state">${escapeHtml(`${sellLabel} · ${keyLabel}`)}</div>
        </div>
        ${renderValuationMetric(t("毛期望价值", "Gross value"), chest.grossValue)}
        ${renderValuationMetric(t("钥匙成本", "Key cost"), hasKey && !chest.keyComplete ? null : chest.keyCost)}
        ${renderValuationMetric(t("净期望价值", "Net value"), chest.netValue, true)}
      </section>
    </div>`,
  );

  panel.insertAdjacentHTML(
    "beforeend",
    `<div class="mwi-profit-hint">${t(
      pinned
        ? "开关会立即重算并保存；高亮卡片是每枚代币回报最高的兑换物品。"
        : "双击固定面板后可调整买卖方向和钥匙来源；高亮卡片是每枚代币回报最高的兑换物品。",
      pinned
        ? "Switches recalculate and save immediately; highlighted cards are the best return per token."
        : "Double-click to pin and adjust pricing; highlighted cards are the best return per token.",
    )}</div>`,
  );

  if (chest.missing.length) {
    panel.insertAdjacentHTML(
      "beforeend",
      `<div class="mwi-profit-warning">${escapeHtml(
        `${t("以下物品缺少所选口径的价格或配方，未计入期望：", "These items lack prices or recipes for the selected mode and were excluded: ")}${chest.missing.map(itemName).join(runtime.config.isZH ? "、" : ", ")}`,
      )}</div>`,
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
  if (state.outsideHandler) {
    document.removeEventListener("mousedown", state.outsideHandler, true);
    document.removeEventListener("pointerdown", state.outsideHandler, true);
  }
  for (const stop of state.settingStops ?? []) stop?.();
  state.panel?.remove();
  activePanel = null;
}

function createPanelElement() {
  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-live", "polite");
  return panel;
}

function mountPanel(anchor, panel, extraState = {}) {
  const pinned = Boolean(extraState.pinned);
  anchor.insertAdjacentElement("afterend", panel);
  const position = () =>
    globalThis.requestAnimationFrame?.(positionPanel) ?? positionPanel();
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
  position();
  if (pinned && document.body && panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }
  return panel;
}

function attachStickyOutsideHandler(panel, anchor) {
  const outsideHandler = (event) => {
    if (!activePanel?.sticky || activePanel.panel !== panel) return;
    if (panel.contains(event.target) || anchor.contains?.(event.target)) return;
    runtime.api.clearTooltipProfitHoverContext?.(anchor);
    hideProductionProfitPanel();
  };
  globalThis.setTimeout?.(() => {
    if (activePanel?.panel !== panel) return;
    document.addEventListener("pointerdown", outsideHandler, true);
    activePanel.outsideHandler = outsideHandler;
  }, 0);
}

function showProductionProfitPanel(anchor, itemHrid, options = {}) {
  if (activePanel?.pinned) return null;
  if (runtime.api.shouldSuppressMarketFeatures?.()) {
    hideProductionProfitPanel();
    return null;
  }
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
  const sticky = Boolean(options.sticky);
  panel.classList.toggle("mwi-profit-pinned", sticky);
  renderPanel(panel, primaryItemHrid, projection, {
    directAction: Boolean(options.actionHrid),
  });
  const mounted = mountPanel(anchor, panel, {
    itemHrid: primaryItemHrid,
    actionHrid,
    sticky,
  });
  if (sticky) attachStickyOutsideHandler(panel, anchor);
  return mounted;
}

function showLootChestPanel(anchor, itemHrid, options = {}) {
  const pinned = Boolean(options.pinned);
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
  mountPanel(anchor, panel, { itemHrid, pinned, kind: "loot" });
  if (pinned) attachLootChestControls(panel, itemHrid);
  return panel;
}

function attachLootChestControls(panel, itemHrid) {
  const rerender = () => {
    const chest = runtime.api.projectLootChest?.(itemHrid);
    if (activePanel?.panel !== panel || !chest) return;
    renderLootChestPanel(panel, itemHrid, chest, { pinned: true });
  };
  panel.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-mwi-loot-close]")) return;
    event.stopPropagation();
    hideProductionProfitPanel();
  });
  panel.addEventListener("change", (event) => {
    const input = event.target.closest?.("input[data-mwi-loot-setting]");
    if (!input) return;
    event.stopPropagation();
    void runtime.settings.set?.(input.dataset.mwiLootSetting, input.checked);
  });
  const settingStops = [
    "lootSellAtAsk",
    "lootBuyAtAsk",
    "lootKeyFromFragments",
    "lootIgnoreCowbells",
  ].map((settingId) => runtime.settings.onChange?.(settingId, rerender));
  settingStops.push(
    runtime.settings.onChange?.("lootChestEstimate", (enabled) => {
      if (!enabled) hideProductionProfitPanel();
    }),
  );
  if (activePanel?.panel === panel) activePanel.settingStops = settingStops;

  const outsideHandler = (event) => {
    if (!activePanel?.pinned || activePanel.panel !== panel) return;
    if (panel.contains(event.target)) return;
    hideProductionProfitPanel();
  };
  globalThis.setTimeout?.(() => {
    if (activePanel?.panel !== panel) return;
    document.addEventListener("mousedown", outsideHandler, true);
    activePanel.outsideHandler = outsideHandler;
  }, 0);
}

function pinActiveLootChestPanel() {
  const state = activePanel;
  if (!state || state.pinned || state.kind !== "loot" || !state.itemHrid) {
    return false;
  }
  if (!state.anchor?.isConnected) return false;
  return Boolean(
    showLootChestPanel(state.anchor, state.itemHrid, { pinned: true }),
  );
}

function dismissHoverPanel() {
  if (activePanel?.pinned || activePanel?.sticky) return;
  hideProductionProfitPanel();
}

runtime.settings.onChange?.("adaptIronCowMarketFeatures", () => {
  if (runtime.api.shouldSuppressMarketFeatures?.()) {
    hideProductionProfitPanel();
  }
});

runtime.onMessage("init_character_data", () => {
  if (runtime.api.shouldSuppressMarketFeatures?.()) {
    hideProductionProfitPanel();
  }
});

Object.assign(runtime.api, {
  hideProductionProfitPanel,
  dismissHoverPanel,
  pinActiveLootChestPanel,
  positionProductionProfitPanel: positionPanel,
  showLootChestPanel,
  showProductionProfitPanel,
});
