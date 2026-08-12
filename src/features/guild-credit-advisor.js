import { runtime } from "../core/runtime.js";
import {
  itemName as localizedItemName,
  localize,
} from "../core/localization.js";

const CARD_ID = "mwitools-guild-credit-advisor";
const LEGACY_STYLE_ID = "mwitools-guild-credit-advisor-style";
const LEGACY_SUMMARY_CLASS = "mwi-guild-credit-recommendation";
const MODAL_SELECTOR = '[class*="GuildPanel_exchangeModalContent"]';
const ITEM_SELECTOR = '[class*="ItemSelector_menu"]';
const VIEWPORT_MARGIN = 12;
const PANEL_GAP = 12;

const CREDIT_COLORS = {
  green: "#43c4ad",
  brown: "#b8885b",
  white: "#dfe4f2",
  blue: "#6ea9ff",
  purple: "#a980e9",
  red: "#e65d68",
  silver: "#aeb9c9",
  gold: "#d8a33c",
};

let advisorPositionState = null;
let advisorPositionFrame = null;

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

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return "—";
  return runtime.api.numberFormatter?.(Number(value), digits) ?? String(value);
}

function formatExact(value) {
  if (!Number.isFinite(Number(value))) return "—";
  return runtime.api.formatExactNumber?.(Number(value)) ?? String(value);
}

function isVisible(element) {
  if (!element?.isConnected) return false;
  for (let current = element; current; current = current.parentElement) {
    if (current.hidden || current.getAttribute?.("aria-hidden") === "true") {
      return false;
    }
    const style =
      current.ownerDocument?.defaultView?.getComputedStyle?.(current);
    if (style?.display === "none" || style?.visibility === "hidden") {
      return false;
    }
  }
  return true;
}

export function findGuildExchangeModal(documentRef = document) {
  return [...documentRef.querySelectorAll(MODAL_SELECTOR)]
    .filter(isVisible)
    .at(-1);
}

export function findVisibleItemSelector(documentRef = document) {
  return [...documentRef.querySelectorAll(ITEM_SELECTOR)]
    .filter(isVisible)
    .at(-1);
}

function itemHridFromIcon(icon) {
  let label = icon?.getAttribute?.("aria-label")?.trim();
  if (label && runtime.config.isZHInGameSetting) {
    label = runtime.api.getItemEnNameFromZhName?.(label) ?? label;
  }
  if (label && runtime.state.itemEnNameToHridMap?.[label]) {
    return runtime.state.itemEnNameToHridMap[label];
  }
  const fragment = icon
    ?.querySelector?.("use")
    ?.getAttribute?.("href")
    ?.split("#")
    .at(-1);
  if (!fragment) return "";
  return Object.keys(runtime.state.initData_itemDetailMap ?? {}).find(
    (itemHrid) => itemHrid.split("/").at(-1) === fragment,
  );
}

function guildCreditHrids() {
  const result = new Set();
  for (const detail of Object.values(
    runtime.state.initData_itemDetailMap ?? {},
  )) {
    for (const conversion of detail?.guildCreditConversions ?? []) {
      if (conversion?.creditItemHrid) result.add(conversion.creditItemHrid);
    }
  }
  return result;
}

export function readGuildExchangeContext(modal) {
  const creditHrids = guildCreditHrids();
  const iconHrids = [...modal.querySelectorAll("svg[aria-label]")]
    .map(itemHridFromIcon)
    .filter(Boolean);
  const creditItemHrid = iconHrids.find((itemHrid) =>
    creditHrids.has(itemHrid),
  );
  const selectedItemHrid = iconHrids.find(
    (itemHrid) =>
      itemHrid !== creditItemHrid &&
      runtime.state.initData_itemDetailMap?.[
        itemHrid
      ]?.guildCreditConversions?.some(
        (conversion) => conversion.creditItemHrid === creditItemHrid,
      ),
  );
  const batchInput = modal.querySelector('input[type="number"],input');
  return {
    creditItemHrid,
    selectedItemHrid,
    batchCount: Math.max(1, Math.floor(positiveNumber(batchInput?.value) || 1)),
  };
}

export function collectGuildCreditConversions(creditItemHrid) {
  const result = [];
  for (const [fallbackHrid, detail] of Object.entries(
    runtime.state.initData_itemDetailMap ?? {},
  )) {
    const itemHrid = detail?.hrid ?? detail?.itemHrid ?? fallbackHrid;
    for (const conversion of detail?.guildCreditConversions ?? []) {
      if (conversion?.creditItemHrid !== creditItemHrid) continue;
      const itemCount = positiveNumber(conversion.itemCount);
      const creditCount = positiveNumber(conversion.creditCount);
      if (!itemCount || !creditCount) continue;
      result.push({ itemHrid, itemCount, creditCount, detail });
    }
  }
  return result;
}

function normalizeOrder(order) {
  if (Array.isArray(order)) {
    return {
      price: positiveNumber(order[0]),
      quantity: positiveNumber(order[1]),
    };
  }
  const quantity = positiveNumber(
    order?.quantity ??
      order?.count ??
      positiveNumber(order?.orderQuantity) -
        positiveNumber(order?.filledQuantity),
  );
  return { price: positiveNumber(order?.price), quantity };
}

function marketLevelBook(itemHrid) {
  return (
    runtime.state.marketOrderBooks?.[itemHrid]?.[0] ??
    runtime.state.marketOrderBooks?.[itemHrid]?.["0"] ??
    null
  );
}

function quoteOrderBook(itemHrid, quantity, side) {
  const required = positiveNumber(quantity);
  if (!required) {
    return { available: false, totalValue: 0, estimated: false };
  }
  const levelBook = marketLevelBook(itemHrid);
  const orders = levelBook?.[side];
  if (levelBook) {
    if (!Array.isArray(orders)) {
      return { available: false, totalValue: 0, estimated: false };
    }
    let remaining = required;
    let totalValue = 0;
    const descending = side === "bids";
    const normalized = orders
      .map(normalizeOrder)
      .filter(({ price, quantity: available }) => price > 0 && available > 0)
      .sort((left, right) =>
        descending ? right.price - left.price : left.price - right.price,
      );
    for (const order of normalized) {
      const filled = Math.min(remaining, order.quantity);
      totalValue += filled * order.price;
      remaining -= filled;
      if (remaining <= 0) break;
    }
    return remaining <= 0
      ? { available: true, totalValue, estimated: false }
      : { available: false, totalValue: 0, estimated: false };
  }
  const fallbackPrice = positiveNumber(
    side === "bids"
      ? runtime.api.getBidPrice?.(itemHrid, 0)
      : runtime.api.getAskPrice?.(itemHrid, 0),
  );
  return fallbackPrice
    ? {
        available: true,
        totalValue: fallbackPrice * required,
        estimated: true,
      }
    : { available: false, totalValue: 0, estimated: true };
}

export function quoteGuildCreditAsk(itemHrid, requiredItems) {
  const quote = quoteOrderBook(itemHrid, requiredItems, "asks");
  return {
    available: quote.available,
    totalCost: quote.totalValue,
    estimated: quote.estimated,
  };
}

export function quoteGuildCreditBid(itemHrid, quantity) {
  const quote = quoteOrderBook(itemHrid, quantity, "bids");
  return {
    available: quote.available,
    grossValue: quote.totalValue,
    estimated: quote.estimated,
  };
}

export function evaluateGuildCreditConversion(conversion, targetCredits = 1) {
  const batches = Math.max(
    1,
    Math.ceil(positiveNumber(targetCredits) / conversion.creditCount),
  );
  const requiredItems = batches * conversion.itemCount;
  const producedCredits = batches * conversion.creditCount;
  const quote = quoteGuildCreditAsk(conversion.itemHrid, requiredItems);
  return {
    ...conversion,
    ...quote,
    batches,
    requiredItems,
    producedCredits,
    costPerCredit: quote.available
      ? quote.totalCost / producedCredits
      : Number.POSITIVE_INFINITY,
  };
}

export function evaluateGuildCreditOptions(creditItemHrid, targetCredits = 1) {
  return collectGuildCreditConversions(creditItemHrid)
    .map((conversion) =>
      evaluateGuildCreditConversion(conversion, targetCredits),
    )
    .filter(({ available }) => available)
    .sort(
      (left, right) =>
        left.costPerCredit - right.costPerCredit ||
        left.totalCost - right.totalCost ||
        itemName(left.itemHrid).localeCompare(itemName(right.itemHrid)),
    );
}

function affordableItemsFromAsks(itemHrid, budget) {
  const availableBudget = positiveNumber(budget);
  if (!availableBudget) return { quantity: 0, estimated: false };
  const levelBook = marketLevelBook(itemHrid);
  if (levelBook) {
    if (!Array.isArray(levelBook.asks)) {
      return { quantity: 0, estimated: false };
    }
    let remainingBudget = availableBudget;
    let quantity = 0;
    const asks = levelBook.asks
      .map(normalizeOrder)
      .filter(({ price, quantity: available }) => price > 0 && available > 0)
      .sort((left, right) => left.price - right.price);
    for (const ask of asks) {
      const affordable = Math.floor(remainingBudget / ask.price);
      const purchased = Math.min(ask.quantity, affordable);
      if (purchased <= 0) break;
      quantity += purchased;
      remainingBudget -= purchased * ask.price;
    }
    return { quantity, estimated: false };
  }
  const askPrice = positiveNumber(runtime.api.getAskPrice?.(itemHrid, 0));
  return {
    quantity: askPrice ? Math.floor(availableBudget / askPrice) : 0,
    estimated: Boolean(askPrice),
  };
}

function buyGuildCreditsWithinBudget(conversion, budget) {
  const affordable = affordableItemsFromAsks(conversion.itemHrid, budget);
  const batches = Math.floor(affordable.quantity / conversion.itemCount);
  if (batches <= 0) {
    return {
      available: false,
      estimated: affordable.estimated,
      batches: 0,
      requiredItems: 0,
      producedCredits: 0,
      totalCost: 0,
    };
  }
  const requiredItems = batches * conversion.itemCount;
  const quote = quoteGuildCreditAsk(conversion.itemHrid, requiredItems);
  return {
    available: quote.available && quote.totalCost <= budget,
    estimated: affordable.estimated || quote.estimated,
    batches,
    requiredItems,
    producedCredits: batches * conversion.creditCount,
    totalCost: quote.totalCost,
  };
}

export function evaluateGuildCreditReplacement(
  selectedConversion,
  batchCount,
  bestConversion,
) {
  const selectedBatches = Math.max(1, Math.floor(positiveNumber(batchCount)));
  const directCredits = selectedBatches * selectedConversion.creditCount;
  if (selectedConversion.itemHrid === bestConversion.itemHrid) {
    return { status: "already_optimal", directCredits, difference: 0 };
  }
  const saleQuantity = selectedBatches * selectedConversion.itemCount;
  const sale = quoteGuildCreditBid(selectedConversion.itemHrid, saleQuantity);
  if (!sale.available) {
    return { status: "no_sell_quote", directCredits, saleQuantity, sale };
  }
  const taxRate = Math.max(
    0,
    Math.min(
      1,
      Number(runtime.api.getMarketTaxRate?.(selectedConversion.itemHrid)) || 0,
    ),
  );
  const netSaleValue = sale.grossValue * (1 - taxRate);
  const replacement = buyGuildCreditsWithinBudget(bestConversion, netSaleValue);
  if (!replacement.available) {
    return {
      status: "unaffordable",
      directCredits,
      saleQuantity,
      taxRate,
      netSaleValue,
      sale,
      replacement,
    };
  }
  return {
    status: "ok",
    directCredits,
    saleQuantity,
    taxRate,
    netSaleValue,
    sale,
    replacement,
    difference: replacement.producedCredits - directCredits,
    estimated: sale.estimated || replacement.estimated,
  };
}

function itemName(itemHrid) {
  return localizedItemName(itemHrid, { fallback: itemHrid });
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

function itemIconMarkup(itemHrid, name) {
  const sprite = findItemsSpriteBase();
  const bare = String(itemHrid ?? "")
    .split("/")
    .at(-1);
  if (!sprite || !bare) {
    return `<span class="icon-fallback" aria-label="${escapeHtml(name)}">?</span>`;
  }
  const href = `${sprite}#${bare}`;
  return `<svg class="item-icon" viewBox="0 0 32 32" role="img" aria-label="${escapeHtml(name)}"><use href="${escapeHtml(href)}" xlink:href="${escapeHtml(href)}"></use></svg>`;
}

function creditColor(creditItemHrid) {
  const key = String(creditItemHrid ?? "")
    .split("/")
    .at(-1)
    ?.split("_")[0];
  return CREDIT_COLORS[key] ?? runtime.config.SCRIPT_COLOR_MAIN ?? "#43c4ad";
}

function advisorStyles() {
  return `
    :host{position:fixed;z-index:2147483000;display:block;width:min(400px,calc(100vw - 24px));max-height:calc(100dvh - 24px);box-sizing:border-box;color:#f4f5ff;font-family:inherit;font-size:12px;line-height:1.35}
    *{box-sizing:border-box}
    .advisor{display:flex;max-height:inherit;flex-direction:column;overflow:hidden;border:1px solid #414361;border-left:4px solid var(--mwi-credit-accent,#43c4ad);border-radius:8px;background:#171927;box-shadow:0 10px 30px rgba(0,0,0,.48)}
    .head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:9px 11px;border-bottom:1px solid #414361;background:#24263e}
    .title{display:grid;gap:2px;min-width:0;color:#fff;font-size:15px;font-weight:750}
    .credit{display:flex;align-items:center;gap:5px;min-width:0;color:#c7cae4;font-size:10px;font-weight:500}
    .credit::before{width:8px;height:8px;flex:0 0 8px;border-radius:2px;background:var(--mwi-credit-accent,#43c4ad);content:""}
    .basis{padding-top:2px;color:#aeb1c9;font-size:10px;white-space:nowrap}
    .body{min-height:0;overflow-x:hidden;overflow-y:auto;padding:7px;scrollbar-width:thin}
    .ranking{display:grid;gap:5px}
    .rank-row{display:grid;min-height:52px;grid-template-columns:22px 28px minmax(0,1fr) auto;align-items:center;gap:7px;padding:5px 7px;border:1px solid #3d3f5d;border-radius:6px;background:#202139}
    .rank-row.best{border-color:color-mix(in srgb,var(--mwi-credit-accent,#43c4ad) 72%,#414361);background:color-mix(in srgb,var(--mwi-credit-accent,#43c4ad) 13%,#202139)}
    .rank-row.current-row{margin-top:6px;border-style:dashed;background:#1d1f33}
    .rank{display:grid;width:21px;height:21px;place-items:center;border:1px solid #555976;border-radius:50%;color:#c9cce2;font:700 10px ui-monospace,SFMono-Regular,Menlo,monospace}
    .best .rank{border-color:var(--mwi-credit-accent,#43c4ad);background:var(--mwi-credit-accent,#43c4ad);color:#111827}
    .item-icon,.icon-fallback{display:grid;width:28px;height:28px;place-items:center;overflow:hidden;border-radius:4px;background:#292b45;color:#c7cae4;font-weight:700}
    .copy{display:grid;min-width:0;gap:2px}
    .name-line{display:flex;min-width:0;align-items:center;gap:5px}
    .name{min-width:0;overflow:hidden;color:#f5f6ff;font-size:12px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
    .tag{flex:0 0 auto;padding:1px 4px;border:1px solid color-mix(in srgb,var(--mwi-credit-accent,#43c4ad) 65%,#555976);border-radius:999px;color:var(--mwi-credit-accent,#43c4ad);font-size:8px;font-weight:700}
    .meta{overflow:hidden;color:#aeb1c9;font-size:9px;text-overflow:ellipsis;white-space:nowrap}
    .price{display:grid;justify-items:end;gap:1px;color:var(--mwi-credit-accent,#43c4ad);font:750 17px/1 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}
    .price small{color:#aeb1c9;font:500 8px/1.2 inherit}
    .current-heading{margin:7px 2px 4px;color:#aeb1c9;font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
    .summary{margin-top:7px;padding:7px 8px;border-top:1px solid #414361;border-radius:0 0 5px 5px;background:#1d1f31;color:#dfe1f4;font-size:10px;line-height:1.45;text-align:center}
    .summary strong{color:var(--mwi-credit-accent,#43c4ad);font-size:12px}
    .summary.warning strong{color:#ffd17c}
    .estimate{margin-top:4px;color:#9296b0;font-size:9px;text-align:center}
    .empty{padding:14px;color:#bfc2d9;text-align:center}
    @media(max-width:760px){:host{width:min(400px,calc(100vw - 24px))}.head{padding:8px 9px}.body{padding:6px}.rank-row{min-height:48px;padding:4px 6px}.price{font-size:15px}}
  `;
}

function createAdvisorHost() {
  let host = document.getElementById(CARD_ID);
  if (host?.shadowRoot) return host;
  host?.remove();
  host = document.createElement("div");
  host.id = CARD_ID;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = advisorStyles();
  const advisor = document.createElement("aside");
  advisor.className = "advisor";
  advisor.setAttribute("role", "complementary");
  advisor.setAttribute("aria-live", "polite");
  shadow.append(style, advisor);
  return host;
}

function rankRowMarkup(
  option,
  index,
  { current = false, separate = false } = {},
) {
  const name = itemName(option.itemHrid);
  const pricePrefix = option.estimated ? "≈" : "";
  const meta = t(
    `${formatExact(option.requiredItems)} 个 · ${formatNumber(option.totalCost)} 总成本`,
    `${formatExact(option.requiredItems)} items · ${formatNumber(option.totalCost)} total`,
  );
  return `<div class="rank-row${index === 0 ? " best" : ""}${separate ? " current-row" : ""}">
    <span class="rank">${separate ? "—" : index + 1}</span>
    ${itemIconMarkup(option.itemHrid, name)}
    <span class="copy"><span class="name-line"><span class="name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>${current ? `<span class="tag">${escapeHtml(t("当前", "Current"))}</span>` : ""}</span><span class="meta" title="${escapeHtml(meta)}">${escapeHtml(meta)}</span></span>
    <span class="price" title="${escapeHtml(formatExact(option.costPerCredit))}">${pricePrefix}${escapeHtml(formatNumber(option.costPerCredit))}<small>${escapeHtml(t("每信用点", "per credit"))}</small></span>
  </div>`;
}

function replacementSummaryMarkup(result, best) {
  if (!result) {
    return `<div class="summary">${escapeHtml(t("选择兑换物品后可比较卖出换购收益。", "Select an exchange item to compare sell-and-rebuy returns."))}</div>`;
  }
  if (result.status === "already_optimal") {
    return `<div class="summary"><strong>${escapeHtml(t("当前方案已是单位信用成本最优", "The selected option already has the best unit cost"))}</strong></div>`;
  }
  if (result.status === "no_sell_quote") {
    return `<div class="summary warning"><strong>${escapeHtml(t("当前物品没有足够的收购报价", "The selected item has insufficient buy-order depth"))}</strong><br>${escapeHtml(t("无法估算卖出换购结果。", "The sell-and-rebuy result cannot be estimated."))}</div>`;
  }
  if (result.status === "unaffordable") {
    return `<div class="summary warning"><strong>${escapeHtml(t("税后收入不足以购买一个最优兑换批次", "Net sale proceeds cannot buy one batch of the best option"))}</strong></div>`;
  }
  const name = itemName(best.itemHrid);
  const difference = Number(result.difference) || 0;
  let conclusion;
  if (difference > 0) {
    conclusion = t(
      `卖出当前物品并改买${name}，可多兑换 ${formatExact(difference)} 点信用。`,
      `Sell the selected items and buy ${name} to gain ${formatExact(difference)} more credits.`,
    );
  } else if (difference < 0) {
    conclusion = t(
      `直接兑换更划算；改买${name}会少 ${formatExact(-difference)} 点信用。`,
      `Direct exchange is better; switching to ${name} yields ${formatExact(-difference)} fewer credits.`,
    );
  } else {
    conclusion = t(
      `直接兑换与改买${name}获得的信用点相同。`,
      `Direct exchange and switching to ${name} yield the same credits.`,
    );
  }
  return `<div class="summary"><strong>${escapeHtml(conclusion)}</strong><br>${escapeHtml(t(`税后可用 ${formatNumber(result.netSaleValue)}，可购买 ${formatExact(result.replacement.requiredItems)} 个材料。`, `${formatNumber(result.netSaleValue)} net proceeds buy ${formatExact(result.replacement.requiredItems)} materials.`))}</div>`;
}

function advisorMarkup({ context, ranked, selected, replacement }) {
  const top = ranked.slice(0, 3);
  const creditName = itemName(context.creditItemHrid);
  const selectedInTop = top.some(
    ({ itemHrid }) => itemHrid === context.selectedItemHrid,
  );
  const ranking = top
    .map((option, index) =>
      rankRowMarkup(option, index, {
        current: option.itemHrid === context.selectedItemHrid,
      }),
    )
    .join("");
  const current =
    selected && !selectedInTop
      ? `<div class="current-heading">${escapeHtml(t("当前方案", "Selected option"))}</div>${rankRowMarkup(selected, -1, { current: true, separate: true })}`
      : "";
  const estimated =
    ranked.some(({ estimated: value }) => value) || replacement?.estimated;
  return `<header class="head"><span class="title">${escapeHtml(t("公会信用兑换推荐", "Guild Credit Exchange"))}<span class="credit">${escapeHtml(creditName)}</span></span><span class="basis">${escapeHtml(t("按订单深度", "Order-book depth"))}</span></header>
    <div class="body">${ranking ? `<div class="ranking">${ranking}</div>${current}${replacementSummaryMarkup(replacement, top[0])}${estimated ? `<div class="estimate">${escapeHtml(t("带 ≈ 的市场结果使用当前最低报价估算。", "Estimated market results use the current best quote."))}</div>` : ""}` : `<div class="empty">${escapeHtml(t("没有具备完整报价的兑换方案。", "No exchange option has a complete market quote."))}</div>`}</div>`;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function findGuildExchangeAnchor(modal) {
  return modal.closest('[class*="Modal_modalContainer"]') ?? modal;
}

function viewportSize() {
  return {
    width:
      Number(globalThis.innerWidth) || document.documentElement.clientWidth,
    height:
      Number(globalThis.innerHeight) || document.documentElement.clientHeight,
  };
}

function overlapsRect({ left, top, width, height }, blocker) {
  if (!(blocker?.width > 0) || !(blocker?.height > 0)) return false;
  return !(
    left + width <= blocker.left ||
    left >= blocker.right ||
    top + height <= blocker.top ||
    top >= blocker.bottom
  );
}

function restoreGuildExchangeAnchor(state = advisorPositionState) {
  if (!state?.anchor || state.originalTranslate === undefined) return;
  if (state.originalTranslate) {
    state.anchor.style.setProperty(
      "translate",
      state.originalTranslate,
      state.originalTranslatePriority,
    );
  } else {
    state.anchor.style.removeProperty("translate");
  }
  state.shiftY = 0;
}

function shiftGuildExchangeAnchor(state, shiftY) {
  const amount = Math.max(0, Math.round(shiftY));
  if (!amount) return;
  state.anchor.style.setProperty("translate", `0 ${amount}px`, "important");
  state.shiftY = amount;
}

export function positionGuildCreditAdvisor() {
  const state = advisorPositionState;
  if (!state?.host?.isConnected || !state.anchor?.isConnected) return false;
  // Restore synchronously before measuring so repeated positioning never adds
  // the previous offset again. Both writes happen before the browser paints.
  restoreGuildExchangeAnchor(state);
  const anchorRect = state.anchor.getBoundingClientRect();
  const hostRect = state.host.getBoundingClientRect();
  const viewport = viewportSize();
  const width = hostRect.width || Math.min(400, viewport.width - 24);
  const height = hostRect.height || Math.min(260, viewport.height - 24);
  const selectorRect = findVisibleItemSelector()?.getBoundingClientRect?.();
  const sideTop = clamp(
    anchorRect.top,
    VIEWPORT_MARGIN,
    viewport.height - height - VIEWPORT_MARGIN,
  );
  const rightCandidate = {
    left: anchorRect.right + PANEL_GAP,
    top: sideTop,
    width,
    height,
  };
  const leftCandidate = {
    left: anchorRect.left - PANEL_GAP - width,
    top: sideTop,
    width,
    height,
  };
  const topCandidate = {
    left: clamp(
      anchorRect.left + (anchorRect.width - width) / 2,
      VIEWPORT_MARGIN,
      viewport.width - width - VIEWPORT_MARGIN,
    ),
    top: anchorRect.top - PANEL_GAP - height,
    width,
    height,
  };
  const fitsRight =
    rightCandidate.left + width <= viewport.width - VIEWPORT_MARGIN &&
    !overlapsRect(rightCandidate, selectorRect);
  const fitsLeft =
    leftCandidate.left >= VIEWPORT_MARGIN &&
    !overlapsRect(leftCandidate, selectorRect);
  const fitsTop =
    topCandidate.top >= VIEWPORT_MARGIN &&
    !overlapsRect(topCandidate, selectorRect);
  const selectorTopSpace = selectorRect
    ? selectorRect.top - PANEL_GAP - VIEWPORT_MARGIN
    : 0;
  const fitsCompressedTop = selectorTopSpace > 0;
  let placement;
  if (fitsRight) {
    placement = "right";
  } else if (fitsLeft) {
    placement = "left";
  } else if (fitsTop) {
    placement = "top";
  } else if (fitsCompressedTop) {
    placement = "top-compressed";
  } else {
    placement = "overlay";
  }

  let left;
  let top;
  let maxHeight = viewport.height - VIEWPORT_MARGIN * 2;
  if (placement === "right") {
    ({ left, top } = rightCandidate);
  } else if (placement === "left") {
    ({ left, top } = leftCandidate);
  } else if (placement === "top") {
    ({ left, top } = topCandidate);
    maxHeight = anchorRect.top - PANEL_GAP - VIEWPORT_MARGIN;
  } else if (placement === "top-compressed") {
    left = topCandidate.left;
    maxHeight = selectorTopSpace;
    top = selectorRect.top - PANEL_GAP - Math.min(height, maxHeight);
  } else {
    left = topCandidate.left;
    top = clamp(
      anchorRect.top,
      VIEWPORT_MARGIN,
      viewport.height - height - VIEWPORT_MARGIN,
    );
  }
  state.host.dataset.placement = placement;
  state.host.style.left = `${Math.round(left)}px`;
  state.host.style.top = `${Math.round(top)}px`;
  state.host.style.maxHeight = `${
    placement === "top-compressed"
      ? Math.max(1, Math.round(maxHeight))
      : Math.max(72, Math.round(maxHeight))
  }px`;
  if (placement === "top-compressed" || placement === "overlay") {
    const visibleHeight = Math.min(height, maxHeight);
    shiftGuildExchangeAnchor(
      state,
      top + visibleHeight + PANEL_GAP - anchorRect.top,
    );
  }
  return true;
}

function scheduleGuildCreditAdvisorPosition() {
  if (advisorPositionFrame !== null) return;
  const run = () => {
    advisorPositionFrame = null;
    positionGuildCreditAdvisor();
  };
  if (typeof globalThis.requestAnimationFrame === "function") {
    advisorPositionFrame = globalThis.requestAnimationFrame(run);
  } else {
    advisorPositionFrame = setTimeout(run, 0);
  }
}

function clearGuildCreditAdvisorPosition() {
  if (advisorPositionFrame !== null) {
    if (typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(advisorPositionFrame);
    } else {
      clearTimeout(advisorPositionFrame);
    }
    advisorPositionFrame = null;
  }
  restoreGuildExchangeAnchor();
  advisorPositionState?.resizeObserver?.disconnect();
  advisorPositionState = null;
}

function mountGuildCreditAdvisor(host, modal) {
  const anchor = findGuildExchangeAnchor(modal);
  if (host.parentElement !== document.body) document.body.append(host);
  if (
    advisorPositionState?.host !== host ||
    advisorPositionState?.anchor !== anchor
  ) {
    clearGuildCreditAdvisorPosition();
    const resizeObserver = globalThis.ResizeObserver
      ? new globalThis.ResizeObserver(scheduleGuildCreditAdvisorPosition)
      : null;
    resizeObserver?.observe(anchor);
    resizeObserver?.observe(host);
    advisorPositionState = {
      anchor,
      host,
      resizeObserver,
      originalTranslate: anchor.style.getPropertyValue("translate"),
      originalTranslatePriority: anchor.style.getPropertyPriority("translate"),
      shiftY: 0,
    };
  }
  positionGuildCreditAdvisor();
}

function removeGuildCreditAdvisor() {
  clearGuildCreditAdvisorPosition();
  document.getElementById(CARD_ID)?.remove();
}

export async function renderGuildCreditAdvisor({ marketReady = false } = {}) {
  const modal = findGuildExchangeModal();
  if (!modal) {
    removeGuildCreditAdvisor();
    return null;
  }
  const context = readGuildExchangeContext(modal);
  if (!context.creditItemHrid) {
    removeGuildCreditAdvisor();
    return null;
  }
  if (!marketReady && !(await runtime.api.ensureMarketValueSource?.())) {
    removeGuildCreditAdvisor();
    return null;
  }

  const conversions = collectGuildCreditConversions(context.creditItemHrid);
  const selectedConversion = conversions.find(
    ({ itemHrid }) => itemHrid === context.selectedItemHrid,
  );
  const targetCredits = selectedConversion
    ? selectedConversion.creditCount * context.batchCount
    : 1;
  const ranked = evaluateGuildCreditOptions(
    context.creditItemHrid,
    targetCredits,
  );
  const best = ranked[0];
  const selected = selectedConversion
    ? evaluateGuildCreditConversion(selectedConversion, targetCredits)
    : null;
  const replacement =
    selectedConversion && best
      ? evaluateGuildCreditReplacement(
          selectedConversion,
          context.batchCount,
          best,
        )
      : null;

  const host = createAdvisorHost();
  host.style.setProperty(
    "--mwi-credit-accent",
    creditColor(context.creditItemHrid),
  );
  const advisor = host.shadowRoot.querySelector(".advisor");
  advisor.setAttribute(
    "aria-label",
    t("公会信用兑换推荐", "Guild Credit Exchange"),
  );
  advisor.innerHTML = advisorMarkup({
    context,
    ranked,
    selected,
    replacement,
  });
  mountGuildCreditAdvisor(host, modal);
  return host;
}

export async function renderGuildCreditRecommendations() {
  if (!findGuildExchangeModal()) {
    cleanup();
    return null;
  }
  if (!(await runtime.api.ensureMarketValueSource?.())) {
    cleanup();
    return null;
  }
  const advisor = await renderGuildCreditAdvisor({ marketReady: true });
  return { summaries: [], advisor };
}

function cleanup() {
  removeGuildCreditAdvisor();
  document.getElementById(LEGACY_STYLE_ID)?.remove();
  document
    .querySelectorAll(`.${LEGACY_SUMMARY_CLASS}`)
    .forEach((element) => element.remove());
}

runtime.features.register({
  id: "guildCreditConversionsSort",
  setting: "guildCreditConversionsSort",
  scope: "character",
  initialize({ scope }) {
    document.getElementById(LEGACY_STYLE_ID)?.remove();
    document
      .querySelectorAll(`.${LEGACY_SUMMARY_CLASS}`)
      .forEach((element) => element.remove());
    let frame = null;
    const schedule = () => {
      if (frame !== null) return;
      const run = () => {
        frame = null;
        void renderGuildCreditRecommendations();
      };
      if (typeof globalThis.requestAnimationFrame === "function") {
        frame = globalThis.requestAnimationFrame(run);
      } else {
        frame = setTimeout(run, 0);
      }
    };
    const observer = new MutationObserver((mutations) => {
      const activeModal = findGuildExchangeModal();
      const relevant = mutations.some((mutation) => {
        if (
          activeModal &&
          (mutation.target === activeModal ||
            activeModal.contains?.(mutation.target) ||
            mutation.target?.contains?.(activeModal))
        ) {
          return true;
        }
        if (
          mutation.type === "attributes" &&
          (mutation.target?.matches?.(`${MODAL_SELECTOR},${ITEM_SELECTOR}`) ||
            mutation.target?.querySelector?.(
              `${MODAL_SELECTOR},${ITEM_SELECTOR}`,
            ))
        ) {
          return true;
        }
        return [...mutation.addedNodes, ...mutation.removedNodes].some(
          (node) =>
            node?.matches?.(MODAL_SELECTOR) ||
            node?.matches?.(ITEM_SELECTOR) ||
            node?.querySelector?.(MODAL_SELECTOR) ||
            node?.querySelector?.(ITEM_SELECTOR),
        );
      });
      if (relevant) schedule();
    });
    scope.observer(observer, document.body, {
      attributes: true,
      attributeFilter: [
        "aria-hidden",
        "aria-label",
        "class",
        "hidden",
        "href",
        "style",
      ],
      childList: true,
      subtree: true,
    });
    const scheduleFromModal = (event) => {
      if (event.target?.closest?.(MODAL_SELECTOR)) schedule();
    };
    scope.event(document, "input", scheduleFromModal, true);
    scope.event(document, "change", scheduleFromModal, true);
    scope.event(
      globalThis.window ?? globalThis,
      "resize",
      scheduleGuildCreditAdvisorPosition,
    );
    scope.event(
      globalThis.window ?? globalThis,
      "orientationchange",
      scheduleGuildCreditAdvisorPosition,
    );
    scope.event(
      globalThis.window ?? globalThis,
      "scroll",
      scheduleGuildCreditAdvisorPosition,
      true,
    );
    for (const messageType of [
      "market_item_values_updated",
      "market_item_order_books_updated",
    ]) {
      scope.add(runtime.onMessage(messageType, schedule));
    }
    scope.add(() => {
      if (frame !== null) {
        if (typeof globalThis.cancelAnimationFrame === "function") {
          globalThis.cancelAnimationFrame(frame);
        } else {
          clearTimeout(frame);
        }
      }
      cleanup();
    });
    schedule();
  },
});

Object.assign(runtime.api, {
  renderGuildCreditAdvisor,
  renderGuildCreditRecommendations,
});
