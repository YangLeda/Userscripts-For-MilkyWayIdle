import LZString from "lz-string";

import { runtime } from "./runtime.js";

const MARKET_TAX_RATE = 0.05;
const COWBELL_TAX_RATE = 0.18;
const MARKET_MAX_PRICE = 1_000_000_000_000;
const TEST_MARKET_REFRESH_MS = 10 * 60 * 1000;
const PRODUCTION_MARKET_REFRESH_MS = 6 * 60 * 60 * 1000;

let assetValuationMarketSnapshot = null;
let assetValuationMarketDirty = false;

function getMarketEnvironment(hostname = globalThis.location?.hostname ?? "") {
  if (hostname.startsWith("test.")) return "test";
  if (hostname.endsWith("milkywayidlecn.com")) return "china";
  return "production";
}

function getMarketApiUrl(hostname = globalThis.location?.hostname ?? "") {
  switch (getMarketEnvironment(hostname)) {
    case "test":
      return "https://test.milkywayidle.com/game_data/marketplace.json";
    case "china":
      return "https://www.milkywayidlecn.com/game_data/marketplace.json";
    default:
      return "https://www.milkywayidle.com/game_data/marketplace.json";
  }
}

function getMarketRefreshInterval(
  hostname = globalThis.location?.hostname ?? "",
) {
  return getMarketEnvironment(hostname) === "test"
    ? TEST_MARKET_REFRESH_MS
    : PRODUCTION_MARKET_REFRESH_MS;
}

function getLevelValue(map, itemHrid, enhancementLevel = 0) {
  const itemValues = map?.[itemHrid];
  if (!itemValues) return null;
  const value =
    itemValues[enhancementLevel] ?? itemValues[String(enhancementLevel)];
  return Number.isFinite(Number(value)) && Number(value) >= 0
    ? Number(value)
    : null;
}

function getMarketRecordFrom(marketApiJson, itemHrid, enhancementLevel = 0) {
  return (
    marketApiJson?.marketData?.[itemHrid]?.[enhancementLevel] ??
    marketApiJson?.marketData?.[itemHrid]?.[String(enhancementLevel)] ??
    null
  );
}

function getMarketRecord(itemHrid, enhancementLevel = 0) {
  return getMarketRecordFrom(
    runtime.state.marketApiJson,
    itemHrid,
    enhancementLevel,
  );
}

function cloneMarketItemValues(source) {
  return Object.fromEntries(
    Object.entries(source ?? {}).map(([itemHrid, levels]) => [
      itemHrid,
      { ...(levels ?? {}) },
    ]),
  );
}

// Asset history uses one immutable price generation per page session. Live
// orderbooks can continue changing without mixing prices inside one valuation.
function ensureAssetValuationMarketSnapshot() {
  assetValuationMarketSnapshot ??= {
    marketApiJson: runtime.state.marketApiJson,
    marketItemValues: cloneMarketItemValues(runtime.state.marketItemValues),
  };
  return assetValuationMarketSnapshot;
}

function markAssetValuationMarketDirty() {
  if (assetValuationMarketSnapshot) assetValuationMarketDirty = true;
}

function resetAssetValuationMarketSnapshot() {
  assetValuationMarketSnapshot = null;
  assetValuationMarketDirty = false;
}

function isAssetValuationMarketDirty() {
  return assetValuationMarketDirty;
}

function getAskPrice(itemHrid, enhancementLevel = 0) {
  const price = Number(getMarketRecord(itemHrid, enhancementLevel)?.a);
  return price > 0 ? price : 0;
}

function getBidPrice(itemHrid, enhancementLevel = 0) {
  const price = Number(getMarketRecord(itemHrid, enhancementLevel)?.b);
  return price > 0 ? price : 0;
}

function getFairValue(itemHrid, enhancementLevel = 0) {
  const serverValue = getLevelValue(
    runtime.state.marketItemValues,
    itemHrid,
    enhancementLevel,
  );
  if (serverValue !== null && serverValue > 0) return serverValue;

  const ask = getAskPrice(itemHrid, enhancementLevel);
  const bid = getBidPrice(itemHrid, enhancementLevel);
  if (ask > 0 && bid > 0) return (ask + bid) / 2;
  return ask || bid || 0;
}

function getAssetMarketRecord(itemHrid, enhancementLevel = 0) {
  return getMarketRecordFrom(
    ensureAssetValuationMarketSnapshot().marketApiJson,
    itemHrid,
    enhancementLevel,
  );
}

function getAssetAskPrice(itemHrid, enhancementLevel = 0) {
  const price = Number(getAssetMarketRecord(itemHrid, enhancementLevel)?.a);
  return price > 0 ? price : 0;
}

function getAssetBidPrice(itemHrid, enhancementLevel = 0) {
  const price = Number(getAssetMarketRecord(itemHrid, enhancementLevel)?.b);
  return price > 0 ? price : 0;
}

function getAssetFairValue(itemHrid, enhancementLevel = 0) {
  const snapshot = ensureAssetValuationMarketSnapshot();
  const serverValue = getLevelValue(
    snapshot.marketItemValues,
    itemHrid,
    enhancementLevel,
  );
  if (serverValue !== null && serverValue > 0) return serverValue;

  const ask = getAssetAskPrice(itemHrid, enhancementLevel);
  const bid = getAssetBidPrice(itemHrid, enhancementLevel);
  if (ask > 0 && bid > 0) return (ask + bid) / 2;
  return ask || bid || 0;
}

function getAssetNetSellPrice(itemHrid, enhancementLevel = 0) {
  return (
    getAssetBidPrice(itemHrid, enhancementLevel) *
    (1 - getMarketTaxRate(itemHrid))
  );
}

function getAssetNetSellPriceAtAsk(itemHrid, enhancementLevel = 0) {
  return (
    getAssetAskPrice(itemHrid, enhancementLevel) *
    (1 - getMarketTaxRate(itemHrid))
  );
}

function getMarketTaxRate(itemHrid) {
  return itemHrid === "/items/bag_of_10_cowbells"
    ? COWBELL_TAX_RATE
    : MARKET_TAX_RATE;
}

function getNetSellPrice(itemHrid, enhancementLevel = 0) {
  return (
    getBidPrice(itemHrid, enhancementLevel) * (1 - getMarketTaxRate(itemHrid))
  );
}

function getNetSellPriceAtAsk(itemHrid, enhancementLevel = 0) {
  return (
    getAskPrice(itemHrid, enhancementLevel) * (1 - getMarketTaxRate(itemHrid))
  );
}

function getMarketPriceIncrement(price) {
  const integerPrice = Math.max(1, Math.floor(Math.abs(Number(price) || 0)));
  const priceText = String(integerPrice);
  const firstDigit = Number(priceText[0]);
  const digits = priceText.length;

  if (firstDigit <= 2 && digits >= 4) return 5 * 10 ** (digits - 4);
  if (firstDigit <= 4 && digits >= 3) return 10 ** (digits - 3);
  if (digits >= 3) return 2 * 10 ** (digits - 3);
  return 1;
}

function normalizeMarketPrice(price, minimum = 1, maximum = MARKET_MAX_PRICE) {
  const numericPrice = Math.min(
    Math.max(Number(price) || minimum, minimum),
    maximum,
  );
  const increment = getMarketPriceIncrement(numericPrice);
  const normalized = Math.round(numericPrice / increment) * increment;
  return Math.min(Math.max(normalized, minimum), maximum);
}

function parseCompactNumber(value) {
  if (typeof value === "number") return value;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(runtime.config.THOUSAND_SEPERATOR || ",", "")
    .replace(runtime.config.DECIMAL_SEPERATOR || ".", ".");
  const match = normalized.match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*([kmbt])?$/i);
  if (!match) return Number.NaN;
  const multipliers = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  return Number(match[1]) * (multipliers[match[2]] ?? 1);
}

function getNumberLocale() {
  return runtime.config.isZH ? "zh-CN" : "en-US";
}

function formatExactNumber(value, fractionDigits = 20) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const maximumFractionDigits = Math.min(
    20,
    Math.max(0, Math.floor(Number(fractionDigits) || 0)),
  );
  return new Intl.NumberFormat(getNumberLocale(), {
    maximumFractionDigits,
    useGrouping: true,
  }).format(number);
}

function numberFormatter(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const absolute = Math.abs(number);
  const maximumFractionDigits = Math.min(2, Math.max(0, Number(digits) || 0));
  if (absolute < 1_000) {
    return new Intl.NumberFormat(getNumberLocale(), {
      maximumFractionDigits,
      useGrouping: true,
    }).format(number);
  }

  const units = [
    { value: 1e3, symbol: "K" },
    { value: 1e6, symbol: "M" },
    { value: 1e9, symbol: "B" },
    { value: 1e12, symbol: "T" },
  ];
  const capAtMillions =
    absolute >= 1e6 && runtime.settings.get?.("displayCapMM");
  let unit = capAtMillions
    ? units[1]
    : [...units].reverse().find(({ value: size }) => absolute >= size);
  let scaled = number / unit.value;
  let rounded = Number(scaled.toFixed(maximumFractionDigits));
  const index = units.indexOf(unit);
  if (
    !capAtMillions &&
    Math.abs(rounded) >= 1_000 &&
    index < units.length - 1
  ) {
    unit = units[index + 1];
    scaled = number / unit.value;
    rounded = Number(scaled.toFixed(maximumFractionDigits));
  }
  return `${rounded.toLocaleString(getNumberLocale(), {
    maximumFractionDigits,
    useGrouping: true,
  })}${unit.symbol}`;
}

function createFormattedNumber(value, options = {}) {
  const element = document.createElement(options.tagName ?? "span");
  element.className = options.className ?? "mwi-number";
  element.textContent = numberFormatter(value, options.digits ?? 2);
  element.title = formatExactNumber(value);
  if (options.label) element.setAttribute("aria-label", options.label);
  return element;
}

function formatScore(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "-";

  const fixedValue =
    numericValue > 100
      ? Math.round(numericValue).toString()
      : numericValue.toFixed(1);
  const [integerPart, decimalPart] = fixedValue.split(".");
  const groupedInteger = integerPart.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    runtime.config.THOUSAND_SEPERATOR || ",",
  );
  if (decimalPart === undefined) return groupedInteger;
  return `${groupedInteger}${runtime.config.DECIMAL_SEPERATOR || "."}${decimalPart}`;
}

function getPriceBand(itemHrid, enhancementLevel = 0) {
  const storedBand =
    runtime.state.marketPriceBands?.[itemHrid]?.[enhancementLevel];
  if (storedBand) return storedBand;
  const fairValue = getFairValue(itemHrid, enhancementLevel);
  if (!fairValue) return null;
  return {
    minimum: normalizeMarketPrice(fairValue * 0.9),
    maximum: normalizeMarketPrice(fairValue * 1.1),
  };
}

function parseStoredMarketItemValues(rawValue) {
  if (!rawValue) return null;
  const candidates = [
    rawValue,
    LZString.decompressFromUTF16(rawValue),
    LZString.decompress(rawValue),
    LZString.decompressFromBase64(rawValue),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed?.marketItemValues) return parsed;
    } catch {
      // Try the next storage encoding used by the game client.
    }
  }
  return null;
}

function loadMarketItemValuesFromStorage() {
  let parsed = null;
  try {
    const pageGlobal = globalThis.unsafeWindow ?? globalThis;
    parsed = pageGlobal.localStorageUtil?.getMarketItemValues?.() ?? null;
  } catch (error) {
    console.error(
      runtime.config.isZH
        ? "[MWITools] 无法从游戏缓存读取市场价值"
        : "[MWITools] Unable to read market values from the game cache",
      error,
    );
  }
  parsed ??= parseStoredMarketItemValues(
    globalThis.localStorage?.getItem("marketItemValues"),
  );
  if (!parsed) return false;
  runtime.state.marketValuesVersion = parsed.marketValuesVersion ?? null;
  runtime.state.marketItemValues = parsed.marketItemValues;
  markAssetValuationMarketDirty();
  return true;
}

function validateMarketJsonFetch(jsonValue, isSave = false) {
  if (!jsonValue) return null;
  let jsonObj = jsonValue;
  try {
    if (typeof jsonValue === "string") jsonObj = JSON.parse(jsonValue);
  } catch (error) {
    console.error(
      runtime.config.isZH
        ? "[MWITools] 市场数据 JSON 解析失败："
        : "[MWITools] Failed to parse market data JSON:",
      error.message,
    );
    return null;
  }
  if (!jsonObj?.timestamp || !jsonObj?.marketData) return null;

  const fixedPrices = {
    "/items/coin": { a: 1, b: 1 },
    "/items/task_token": { a: 0, b: 0 },
    "/items/cowbell": { a: 0, b: 0 },
    "/items/small_treasure_chest": { a: 0, b: 0 },
    "/items/medium_treasure_chest": { a: 0, b: 0 },
    "/items/large_treasure_chest": { a: 0, b: 0 },
    "/items/basic_task_badge": { a: 0, b: 0 },
    "/items/advanced_task_badge": { a: 0, b: 0 },
    "/items/expert_task_badge": { a: 0, b: 0 },
  };
  for (const [itemHrid, prices] of Object.entries(fixedPrices)) {
    jsonObj.marketData[itemHrid] = { 0: prices };
  }
  runtime.state.marketApiJson = jsonObj;
  markAssetValuationMarketDirty();
  if (isSave) {
    localStorage.setItem("MWITools_marketAPI_timestamp", String(Date.now()));
    localStorage.setItem("MWITools_marketAPI_json", JSON.stringify(jsonObj));
  }
  return jsonObj;
}

function setMarketFetchFailure(reasonZh, reasonEn) {
  console.warn(
    runtime.config.isZH
      ? `[MWITools] ${reasonZh}；将优先使用可用的市场缓存。`
      : `[MWITools] ${reasonEn}; using cached market data when available.`,
  );
}

function requestMarketJson() {
  const sendRequest =
    typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
      ? GM.xmlHttpRequest
      : typeof GM_xmlhttpRequest === "function"
        ? GM_xmlhttpRequest
        : null;
  if (!sendRequest) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    let watchdog;
    const finish = (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      resolve(response);
    };
    watchdog = setTimeout(() => finish(null), 5_500);
    const options = {
      url: getMarketApiUrl(),
      method: "GET",
      timeout: 5000,
      onload: finish,
      onabort: () => finish(null),
      onerror: () => finish(null),
      ontimeout: () => finish(null),
    };
    try {
      const result = sendRequest(options);
      if (result?.then) result.then(finish).catch(() => finish(null));
    } catch (error) {
      console.error(
        runtime.config.isZH
          ? "[MWITools] 市场数据请求失败"
          : "[MWITools] Market data request failed",
        error,
      );
      finish(null);
    }
  });
}

function hasMarketValueSource() {
  return Boolean(
    runtime.state.marketApiJson ||
    Object.keys(runtime.state.marketItemValues ?? {}).length,
  );
}

async function ensureMarketValueSource() {
  if (hasMarketValueSource()) return true;
  return Boolean(await fetchMarketJSON());
}

async function fetchMarketJSON(forceFetch = false) {
  const cacheTimestamp = Number(
    localStorage.getItem("MWITools_marketAPI_timestamp"),
  );
  const cachedJson = localStorage.getItem("MWITools_marketAPI_json");
  if (
    !forceFetch &&
    cachedJson &&
    cacheTimestamp &&
    Date.now() - cacheTimestamp < getMarketRefreshInterval()
  ) {
    return validateMarketJsonFetch(cachedJson, false);
  }

  const response = await requestMarketJson();
  const jsonObj = validateMarketJsonFetch(
    response?.status === 200 ? response.responseText : null,
    true,
  );
  if (jsonObj) {
    return jsonObj;
  }

  setMarketFetchFailure("市场 API 请求失败", "Market API request failed");
  if (cachedJson) {
    const cached = validateMarketJsonFetch(cachedJson, false);
    if (cached) return cached;
  }
  if (getMarketEnvironment() === "test") return null;
  return validateMarketJsonFetch(runtime.data.MARKET_JSON_LOCAL_BACKUP, false);
}

function applyMarketItemValues(payload) {
  if (!payload.marketItemValues) return;
  runtime.state.marketValuesVersion = payload.marketValuesVersion ?? null;
  runtime.state.marketItemValues = payload.marketItemValues;
  markAssetValuationMarketDirty();
}

function applyMarketOrderBooks(payload) {
  const orderBookPayload = payload.marketItemOrderBooks ?? payload;
  const itemHrid = orderBookPayload.itemHrid;
  if (!itemHrid) return;
  runtime.state.marketOrderBooks[itemHrid] = orderBookPayload.orderBooks ?? {};
  if (orderBookPayload.marketValues) {
    runtime.state.marketItemValues[itemHrid] = {
      ...(runtime.state.marketItemValues[itemHrid] ?? {}),
      ...orderBookPayload.marketValues,
    };
    markAssetValuationMarketDirty();
  }
  const minimums = orderBookPayload.priceBandMins ?? {};
  const maximums = orderBookPayload.priceBandMaxs ?? {};
  const levels = new Set([...Object.keys(minimums), ...Object.keys(maximums)]);
  runtime.state.marketPriceBands[itemHrid] ??= {};
  for (const level of levels) {
    runtime.state.marketPriceBands[itemHrid][level] = {
      minimum: Number(minimums[level]) || 0,
      maximum: Number(maximums[level]) || MARKET_MAX_PRICE,
    };
  }
}

function applyMarketListings(payload) {
  const listings =
    payload.myMarketListings ??
    payload.marketListings ??
    payload.endMarketListings ??
    payload.listings;
  if (!Array.isArray(listings)) return;
  if (payload.myMarketListings || payload.marketListings || payload.listings) {
    runtime.state.initData_myMarketListings = listings;
    return;
  }

  const current = [...(runtime.state.initData_myMarketListings ?? [])];
  for (const listing of listings) {
    const listingId = listing.id ?? listing.marketListingId;
    const index = current.findIndex(
      (candidate) => (candidate.id ?? candidate.marketListingId) === listingId,
    );
    if (listing.isDone || listing.isCancelled) {
      if (index >= 0) current.splice(index, 1);
    } else if (index >= 0) {
      current[index] = listing;
    } else {
      current.push(listing);
    }
  }
  runtime.state.initData_myMarketListings = current;
}

function getListingWorkingPrice(listing) {
  return Number(listing?.workingPrice) > 0
    ? Number(listing.workingPrice)
    : Number(listing?.price) || 0;
}

Object.assign(runtime.api, {
  getMarketEnvironment,
  getMarketApiUrl,
  getMarketRefreshInterval,
  getAskPrice,
  getBidPrice,
  getFairValue,
  getAssetAskPrice,
  getAssetBidPrice,
  getAssetFairValue,
  getAssetNetSellPrice,
  getAssetNetSellPriceAtAsk,
  resetAssetValuationMarketSnapshot,
  isAssetValuationMarketDirty,
  getMarketTaxRate,
  getNetSellPrice,
  getNetSellPriceAtAsk,
  getMarketPriceIncrement,
  normalizeMarketPrice,
  parseCompactNumber,
  numberFormatter,
  formatExactNumber,
  createFormattedNumber,
  formatScore,
  getPriceBand,
  parseStoredMarketItemValues,
  loadMarketItemValuesFromStorage,
  validateMarketJsonFetch,
  fetchMarketJSON,
  hasMarketValueSource,
  ensureMarketValueSource,
  applyMarketItemValues,
  applyMarketOrderBooks,
  applyMarketListings,
  getListingWorkingPrice,
});
