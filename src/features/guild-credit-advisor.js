import { runtime } from "../core/runtime.js";

const CARD_ID = "mwitools-guild-credit-advisor";
const STYLE_ID = "mwitools-guild-credit-advisor-style";
const MODAL_SELECTOR = '[class*="GuildPanel_exchangeModalContent"]';

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function isVisible(element) {
  if (!element?.isConnected || element.hidden) return false;
  const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
  return style?.display !== "none" && style?.visibility !== "hidden";
}

export function findGuildExchangeModal(documentRef = document) {
  return [...documentRef.querySelectorAll(MODAL_SELECTOR)]
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

function normalizeAsk(order) {
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

export function quoteGuildCreditAsk(itemHrid, requiredItems) {
  const levelBook =
    runtime.state.marketOrderBooks?.[itemHrid]?.[0] ??
    runtime.state.marketOrderBooks?.[itemHrid]?.["0"];
  if (levelBook && Array.isArray(levelBook.asks)) {
    let remaining = requiredItems;
    let totalCost = 0;
    const asks = levelBook.asks
      .map(normalizeAsk)
      .filter(({ price, quantity }) => price > 0 && quantity > 0)
      .sort((left, right) => left.price - right.price);
    for (const ask of asks) {
      const quantity = Math.min(remaining, ask.quantity);
      totalCost += quantity * ask.price;
      remaining -= quantity;
      if (remaining <= 0) break;
    }
    return remaining <= 0
      ? { available: true, totalCost, estimated: false }
      : { available: false, totalCost: 0, estimated: false };
  }

  const askPrice = positiveNumber(runtime.api.getAskPrice?.(itemHrid, 0));
  return askPrice
    ? {
        available: true,
        totalCost: askPrice * requiredItems,
        estimated: true,
      }
    : { available: false, totalCost: 0, estimated: true };
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

function itemName(itemHrid) {
  const detail = runtime.state.initData_itemDetailMap?.[itemHrid];
  if (runtime.config.isZH) {
    return runtime.data.ZHItemNames?.[itemHrid] ?? detail?.name ?? itemHrid;
  }
  return detail?.name ?? itemHrid;
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${CARD_ID}{position:absolute;z-index:20;top:0;left:calc(100% + 10px);width:260px;padding:10px;border:1px solid rgba(255,180,60,.45);border-radius:7px;background:rgba(20,23,31,.97);color:var(--color-text-primary,#eee);font-size:.72rem;box-shadow:0 8px 24px rgba(0,0,0,.38)}
    #${CARD_ID} .mwi-guild-advisor-title{margin-bottom:7px;color:${runtime.config.SCRIPT_COLOR_MAIN};font-size:.82rem;font-weight:750}
    #${CARD_ID} .mwi-guild-advisor-best{padding:7px;border-radius:5px;background:rgba(255,170,45,.1)}
    #${CARD_ID} .mwi-guild-advisor-name{font-weight:700}
    #${CARD_ID} .mwi-guild-advisor-row{display:flex;justify-content:space-between;gap:8px;margin-top:4px;color:var(--color-text-secondary,#bbb)}
    #${CARD_ID} .mwi-guild-advisor-row strong{color:var(--color-text-primary,#eee);text-align:right}
    #${CARD_ID} .mwi-guild-advisor-selected{margin-top:7px;padding-top:7px;border-top:1px solid rgba(255,255,255,.12)}
    #${CARD_ID} .mwi-guild-advisor-note{margin-top:6px;color:var(--color-text-secondary,#aaa);font-size:.66rem}
    @media(max-width:1150px){#${CARD_ID}{position:relative;top:auto;left:auto;width:auto;margin-top:8px}}
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function appendRow(parent, label, value) {
  const row = document.createElement("div");
  row.className = "mwi-guild-advisor-row";
  const labelNode = document.createElement("span");
  labelNode.textContent = label;
  const valueNode = document.createElement("strong");
  valueNode.textContent = value;
  row.append(labelNode, valueNode);
  parent.appendChild(row);
}

export async function renderGuildCreditAdvisor() {
  const modal = findGuildExchangeModal();
  if (!modal) {
    document.getElementById(CARD_ID)?.remove();
    return null;
  }
  const context = readGuildExchangeContext(modal);
  if (!context.creditItemHrid) {
    document.getElementById(CARD_ID)?.remove();
    return null;
  }
  if (!(await runtime.api.ensureMarketValueSource?.())) return null;

  const conversions = collectGuildCreditConversions(context.creditItemHrid);
  const selectedConversion = conversions.find(
    ({ itemHrid }) => itemHrid === context.selectedItemHrid,
  );
  const targetCredits = selectedConversion
    ? selectedConversion.creditCount * context.batchCount
    : 1;
  const evaluated = conversions
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
  const best = evaluated[0];

  addStyles();
  let card = document.getElementById(CARD_ID);
  if (!card) {
    card = document.createElement("aside");
    card.id = CARD_ID;
    modal.style.position = "relative";
    modal.appendChild(card);
  }
  card.replaceChildren();
  const title = document.createElement("div");
  title.className = "mwi-guild-advisor-title";
  title.textContent = t("公会信用兑换性价比", "Guild credit value");
  card.appendChild(title);

  if (!best) {
    const empty = document.createElement("div");
    empty.textContent = t(
      "没有可用的市场出售价或订单深度。",
      "No usable market asks or order-book depth.",
    );
    card.appendChild(empty);
    return card;
  }

  const bestBox = document.createElement("div");
  bestBox.className = "mwi-guild-advisor-best";
  const bestName = document.createElement("div");
  bestName.className = "mwi-guild-advisor-name";
  bestName.textContent = `${t("最优：", "Best: ")}${itemName(best.itemHrid)}`;
  bestBox.appendChild(bestName);
  appendRow(
    bestBox,
    t("每信用点", "Per credit"),
    runtime.api.numberFormatter(best.costPerCredit),
  );
  appendRow(
    bestBox,
    t("需要材料", "Items required"),
    runtime.api.formatExactNumber(best.requiredItems),
  );
  appendRow(
    bestBox,
    t("本批总成本", "Batch cost"),
    runtime.api.numberFormatter(best.totalCost),
  );
  card.appendChild(bestBox);

  if (selectedConversion) {
    const selected = evaluateGuildCreditConversion(
      selectedConversion,
      targetCredits,
    );
    const selectedBox = document.createElement("div");
    selectedBox.className = "mwi-guild-advisor-selected";
    const selectedName = document.createElement("div");
    selectedName.className = "mwi-guild-advisor-name";
    selectedName.textContent = `${t("当前：", "Selected: ")}${itemName(selected.itemHrid)}`;
    selectedBox.appendChild(selectedName);
    if (selected.available) {
      appendRow(
        selectedBox,
        t("每信用点", "Per credit"),
        runtime.api.numberFormatter(selected.costPerCredit),
      );
      const premium =
        best.costPerCredit > 0
          ? ((selected.costPerCredit / best.costPerCredit - 1) * 100).toFixed(1)
          : "0.0";
      appendRow(selectedBox, t("比最优高", "Above best"), `${premium}%`);
    } else {
      appendRow(
        selectedBox,
        t("报价", "Quote"),
        t("深度不足", "Insufficient depth"),
      );
    }
    card.appendChild(selectedBox);
  }

  if (best.estimated || evaluated.some(({ estimated }) => estimated)) {
    const note = document.createElement("div");
    note.className = "mwi-guild-advisor-note";
    note.textContent = t(
      "未加载完整订单簿的物品按当前最低卖价估算。",
      "Items without a loaded order book use the current lowest ask estimate.",
    );
    card.appendChild(note);
  }
  return card;
}

function cleanup() {
  document.getElementById(CARD_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
}

runtime.features.register({
  id: "guildCreditConversionsSort",
  setting: "guildCreditConversionsSort",
  scope: "character",
  initialize({ scope }) {
    let frame = null;
    const schedule = () => {
      if (frame !== null) return;
      const run = () => {
        frame = null;
        void renderGuildCreditAdvisor();
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
        if (mutation.target?.closest?.(`#${CARD_ID}`)) return false;
        const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
        if (
          changedNodes.length > 0 &&
          changedNodes.every(
            (node) => node?.id === CARD_ID || node?.closest?.(`#${CARD_ID}`),
          )
        ) {
          return false;
        }
        if (
          activeModal &&
          (mutation.target === activeModal ||
            activeModal.contains?.(mutation.target))
        ) {
          return true;
        }
        return changedNodes.some(
          (node) =>
            node?.matches?.(MODAL_SELECTOR) ||
            node?.querySelector?.(MODAL_SELECTOR),
        );
      });
      if (relevant) schedule();
    });
    scope.observer(observer, document.body, { childList: true, subtree: true });
    const scheduleFromModal = (event) => {
      if (event.target?.closest?.(MODAL_SELECTOR)) schedule();
    };
    scope.event(document, "input", scheduleFromModal, true);
    scope.event(document, "change", scheduleFromModal, true);
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
});
