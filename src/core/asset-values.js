import { runtime } from "./runtime.js";

const SHOP_CURRENCY_HRIDS = new Set([
  "/items/chimerical_token",
  "/items/sinister_token",
  "/items/enchanted_token",
  "/items/pirate_token",
  "/items/task_token",
  "/items/labyrinth_token",
]);

const assetValueCache = new Map();
let guildCreditHridCache = null;

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function entriesOfMap(value) {
  if (Array.isArray(value)) {
    return value.map((record, index) => [
      record?.hrid ??
        record?.itemHrid ??
        record?.guildBuffHrid ??
        String(index),
      record,
    ]);
  }
  return Object.entries(value ?? {});
}

function invalidateAssetValueCache() {
  assetValueCache.clear();
  guildCreditHridCache = null;
}

function getItemDetails(itemHrid) {
  return runtime.state.initData_itemDetailMap?.[itemHrid] ?? null;
}

function getGuildCreditHrids() {
  if (guildCreditHridCache) return guildCreditHridCache;
  const result = new Set();
  for (const [, detail] of entriesOfMap(runtime.state.initData_itemDetailMap)) {
    for (const conversion of detail?.guildCreditConversions ?? []) {
      if (conversion?.creditItemHrid) result.add(conversion.creditItemHrid);
    }
  }
  guildCreditHridCache = result;
  return result;
}

function isNonTradableTokenAsset(itemHrid) {
  return (
    itemHrid === "/items/cowbell" ||
    itemHrid === "/items/guild_token" ||
    getGuildCreditHrids().has(itemHrid)
  );
}

function getGuildCreditValue(creditItemHrid) {
  let bestValue = Number.POSITIVE_INFINITY;
  for (const [fallbackHrid, detail] of entriesOfMap(
    runtime.state.initData_itemDetailMap,
  )) {
    const itemHrid = detail?.hrid ?? detail?.itemHrid ?? fallbackHrid;
    if (!itemHrid || itemHrid === "/items/guild_token") continue;
    const materialValue = runtime.api.getFairValue(itemHrid, 0);
    if (!(materialValue > 0)) continue;
    for (const conversion of detail?.guildCreditConversions ?? []) {
      if (conversion?.creditItemHrid !== creditItemHrid) continue;
      const itemCount = positiveNumber(conversion.itemCount);
      const creditCount = positiveNumber(conversion.creditCount);
      if (!itemCount || !creditCount) continue;
      bestValue = Math.min(
        bestValue,
        (materialValue * itemCount) / creditCount,
      );
    }
  }
  return Number.isFinite(bestValue) ? bestValue : 0;
}

function getGuildTokenValue(context) {
  const detail = getItemDetails("/items/guild_token");
  let bestValue = 0;
  for (const conversion of detail?.guildCreditConversions ?? []) {
    const creditItemHrid = conversion?.creditItemHrid;
    const tokenCount = positiveNumber(
      conversion?.guildTokenCount ?? conversion?.itemCount,
    );
    const creditCount = positiveNumber(conversion?.creditCount);
    if (!creditItemHrid || !tokenCount || !creditCount) continue;
    const creditValue = getAssetValueInternal(creditItemHrid, 0, context);
    if (!(creditValue > 0)) continue;
    bestValue = Math.max(bestValue, (creditValue * creditCount) / tokenCount);
  }
  return bestValue;
}

function getDropRecords(itemHrid) {
  const entry = runtime.state.initData_openableLootDropMap?.[itemHrid];
  if (Array.isArray(entry)) return entry;
  return entry?.drops ?? entry?.dropTable ?? entry?.items ?? [];
}

function getOpenableValue(itemHrid, context) {
  const drops = getDropRecords(itemHrid);
  if (!Array.isArray(drops) || !drops.length) return 0;
  let total = 0;
  for (const drop of drops) {
    const dropItemHrid = drop?.itemHrid ?? drop?.hrid;
    if (!dropItemHrid) continue;
    const rawDropRate = Array.isArray(drop.dropRate)
      ? drop.dropRate[0]
      : drop.dropRate;
    const dropRate = Number.isFinite(Number(rawDropRate))
      ? Math.max(0, Number(rawDropRate))
      : 1;
    const minimum = Number(drop.minCount ?? drop.count ?? 1);
    const maximum = Number(drop.maxCount ?? drop.count ?? minimum);
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) continue;
    const expectedCount = dropRate * (minimum + maximum) * 0.5;
    const value = getAssetValueInternal(
      dropItemHrid,
      drop.enhancementLevel ?? 0,
      context,
    );
    total += expectedCount * value;
  }
  return total;
}

function normalizeCostRecords(detail) {
  const raw = detail?.costs ?? detail?.costItems ?? detail?.cost;
  if (Array.isArray(raw)) return raw;
  if (raw?.itemHrid || raw?.hrid) return [raw];
  return Object.entries(raw ?? {}).map(([itemHrid, value]) => ({
    itemHrid,
    count: value?.count ?? value,
  }));
}

function normalizeRewardRecords(detail) {
  const raw = detail?.itemRewards ?? detail?.rewards ?? detail?.rewardItems;
  if (Array.isArray(raw)) return raw;
  if (raw?.itemHrid || raw?.hrid) return [raw];
  const itemHrid =
    detail?.itemHrid ??
    detail?.rewardItemHrid ??
    detail?.item?.itemHrid ??
    runtime.state.itemEnNameToHridMap?.[detail?.name];
  return itemHrid
    ? [
        {
          itemHrid,
          count:
            detail?.outputCount ??
            detail?.itemCount ??
            detail?.rewardCount ??
            1,
          enhancementLevel: detail?.enhancementLevel ?? 0,
        },
      ]
    : [];
}

function getShopDetails() {
  return [
    runtime.state.initData_shopItemDetailMap,
    runtime.state.initData_taskShopItemDetailMap,
    runtime.state.initData_labyrinthShopItemDetailMap,
  ].flatMap((map) => entriesOfMap(map).map(([, detail]) => detail));
}

function getShopCurrencyValue(currencyItemHrid, context) {
  let bestValue = 0;
  for (const detail of getShopDetails()) {
    const costs = normalizeCostRecords(detail);
    const targetCost = costs.find(
      (cost) => (cost?.itemHrid ?? cost?.hrid) === currencyItemHrid,
    );
    const targetCount = positiveNumber(targetCost?.count);
    if (!targetCount) continue;

    let rewardValue = 0;
    for (const reward of normalizeRewardRecords(detail)) {
      const itemHrid = reward?.itemHrid ?? reward?.hrid;
      if (!itemHrid) continue;
      rewardValue +=
        positiveNumber(reward.count ?? 1) *
        getAssetValueInternal(itemHrid, reward.enhancementLevel ?? 0, context);
    }

    let otherCostValue = 0;
    for (const cost of costs) {
      const itemHrid = cost?.itemHrid ?? cost?.hrid;
      if (!itemHrid || itemHrid === currencyItemHrid) continue;
      otherCostValue +=
        positiveNumber(cost.count) *
        getAssetValueInternal(itemHrid, 0, context);
    }
    bestValue = Math.max(
      bestValue,
      Math.max(0, rewardValue - otherCostValue) / targetCount,
    );
  }
  return bestValue;
}

function getAssetValueInternal(itemHrid, enhancementLevel, context) {
  if (!itemHrid) return 0;
  const level = Number(enhancementLevel) || 0;
  const cacheKey = `${itemHrid}:${level}`;
  if (assetValueCache.has(cacheKey)) return assetValueCache.get(cacheKey);
  if (context.has(cacheKey)) return 0;

  const fairValue = runtime.api.getFairValue(itemHrid, level);
  if (fairValue > 0) {
    assetValueCache.set(cacheKey, fairValue);
    return fairValue;
  }

  context.add(cacheKey);
  let value = 0;
  if (itemHrid === "/items/cowbell") {
    value = getAssetValueInternal("/items/bag_of_10_cowbells", 0, context) / 10;
  } else if (getGuildCreditHrids().has(itemHrid)) {
    value = getGuildCreditValue(itemHrid);
  } else if (itemHrid === "/items/guild_token") {
    value = getGuildTokenValue(context);
  } else if (SHOP_CURRENCY_HRIDS.has(itemHrid)) {
    value = getShopCurrencyValue(itemHrid, context);
  } else {
    value = getOpenableValue(itemHrid, context);
  }
  context.delete(cacheKey);

  if (!(value > 0)) {
    value = positiveNumber(getItemDetails(itemHrid)?.sellPrice);
  }

  const normalizedValue = Number.isFinite(value) && value > 0 ? value : 0;
  assetValueCache.set(cacheKey, normalizedValue);
  return normalizedValue;
}

function getAssetValue(itemHrid, enhancementLevel = 0) {
  return getAssetValueInternal(itemHrid, enhancementLevel, new Set());
}

function getGuildBuffLevel(guildBuffHrid) {
  const levels = runtime.state.guildBuffLevels;
  const record = Array.isArray(levels)
    ? levels.find(
        (value) => (value?.guildBuffHrid ?? value?.hrid) === guildBuffHrid,
      )
    : levels?.[guildBuffHrid];
  const level = Number(
    typeof record === "object"
      ? (record?.level ?? record?.currentLevel)
      : record,
  );
  return Number.isSafeInteger(level) && level > 0 ? level : 0;
}

function getGuildShrineValue() {
  if (!runtime.state.guildDataLoaded) return null;
  const details = entriesOfMap(runtime.state.initData_guildBuffDetailMap);
  if (!details.length) return null;

  let total = 0;
  for (const [fallbackHrid, detail] of details) {
    const guildBuffHrid = detail?.guildBuffHrid ?? detail?.hrid ?? fallbackHrid;
    const levelCosts = detail?.levelCosts;
    if (!guildBuffHrid || !levelCosts) continue;
    const currentLevel = getGuildBuffLevel(guildBuffHrid);
    for (let level = 1; level <= currentLevel; level += 1) {
      const cost = levelCosts[level] ?? levelCosts[String(level)];
      if (!cost) return null;
      const guildTokenCount = positiveNumber(cost.guildTokenCost);
      if (guildTokenCount) {
        const tokenValue = getAssetValue("/items/guild_token", 0);
        if (!(tokenValue > 0)) return null;
        total += guildTokenCount * tokenValue;
      }
      for (const creditCost of cost.creditCosts ?? []) {
        const count = positiveNumber(creditCost?.count);
        if (!count) continue;
        const creditValue = getAssetValue(creditCost.itemHrid, 0);
        if (!(creditValue > 0)) return null;
        total += count * creditValue;
      }
    }
  }
  return total;
}

Object.assign(runtime.api, {
  getAssetValue,
  getGuildShrineValue,
  isNonTradableTokenAsset,
  invalidateAssetValueCache,
});
