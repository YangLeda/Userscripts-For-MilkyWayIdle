import { runtime } from "./runtime.js";

const SHOP_CURRENCY_HRIDS = new Set([
  "/items/chimerical_token",
  "/items/sinister_token",
  "/items/enchanted_token",
  "/items/pirate_token",
  "/items/task_token",
  "/items/labyrinth_token",
]);
const COWBELL_VALUE_HRIDS = new Set([
  "/items/cowbell",
  "/items/bag_of_10_cowbells",
]);
const OPTIONAL_TOKEN_ASSET_HRIDS = new Set([
  "/items/guild_token",
  "/items/chimerical_token",
  "/items/sinister_token",
  "/items/enchanted_token",
  "/items/pirate_token",
]);
const ENHANCED_EQUIPMENT_MAX_MARKET_DEVIATION = 0.2;
const MAX_ACQUISITION_DEPTH = 12;
const DUNGEON_CHEST_HRID_PATTERN = /^\/items\/(.+?)(?:_refinement)?_chest$/;

const assetValueCache = new Map();
const assetLiquidationCache = new Map();
let guildCreditHridCache = null;
let actionOutputIndexSource = null;
let actionOutputIndexes = null;
let shopRewardIndexSources = null;
let shopRewardIndex = null;

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
  assetLiquidationCache.clear();
  guildCreditHridCache = null;
  actionOutputIndexSource = null;
  actionOutputIndexes = null;
  shopRewardIndexSources = null;
  shopRewardIndex = null;
  runtime.api.resetAssetValuationMarketSnapshot?.();
}

function getItemDetails(itemHrid) {
  return runtime.state.initData_itemDetailMap?.[itemHrid] ?? null;
}

function getDungeonEntryKeyItemHrid(itemHrid) {
  const match = DUNGEON_CHEST_HRID_PATTERN.exec(String(itemHrid ?? ""));
  if (!match) return null;
  const entryKeyItemHrid = `/items/${match[1]}_entry_key`;
  return getItemDetails(entryKeyItemHrid) ? entryKeyItemHrid : null;
}

function settingEnabled(id) {
  return Boolean(
    runtime.settings.get?.(id) ?? runtime.settings.settingsMap?.[id]?.isTrue,
  );
}

function shouldIncludeCowbellsInAssets() {
  return settingEnabled("includeCowbellsInAssets");
}

function shouldIncludeGuildDungeonTokensInAssets() {
  return settingEnabled("includeGuildDungeonTokensInAssets");
}

function isOptionalTokenAsset(itemHrid) {
  return OPTIONAL_TOKEN_ASSET_HRIDS.has(itemHrid);
}

function isBackEquipment(itemHrid, itemLocationHrid = "") {
  if (itemLocationHrid === "/item_locations/back") return true;
  if (/(?:^|_)cape(?:_refined)?$/.test(String(itemHrid).split("/").at(-1))) {
    return true;
  }
  const detail = getItemDetails(itemHrid);
  const equipment = detail?.equipmentDetail;
  return [
    detail?.itemLocationHrid,
    detail?.equipmentSlotHrid,
    detail?.slotHrid,
    equipment?.itemLocationHrid,
    equipment?.equipmentSlotHrid,
    equipment?.slotHrid,
    equipment?.equipmentTypeHrid,
    equipment?.typeHrid,
    equipment?.type,
  ].some((value) => /(?:^|[/_])back(?:$|[/_])/.test(String(value ?? "")));
}

function isEquipment(itemHrid) {
  return Boolean(getItemDetails(itemHrid)?.equipmentDetail);
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
    (isOptionalTokenAsset(itemHrid) &&
      shouldIncludeGuildDungeonTokensInAssets()) ||
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
    const materialValue = runtime.api.getAssetFairValue(itemHrid, 0);
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
  const dropMap = runtime.state.initData_openableLootDropMap;
  const entry =
    dropMap instanceof Map ? dropMap.get(itemHrid) : dropMap?.[itemHrid];
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
  const keyItemHrid = getItemDetails(itemHrid)?.openKeyItemHrid;
  let keyCost = 0;
  if (keyItemHrid) {
    const keyCraftingCost = getCraftedAcquisitionValue(keyItemHrid, 0, context);
    if (!(keyCraftingCost > 0)) return 0;
    keyCost += keyCraftingCost;
  }
  const entryKeyItemHrid = getDungeonEntryKeyItemHrid(itemHrid);
  if (entryKeyItemHrid) {
    const entryKeyCost = getAssetValueInternal(entryKeyItemHrid, 0, context);
    if (!(entryKeyCost > 0)) return 0;
    keyCost += entryKeyCost;
  }
  return Math.max(0, total - keyCost);
}

function isPersonalBuffScroll(itemHrid) {
  return Boolean(getItemDetails(itemHrid)?.scrollDetail?.personalBuffTypeHrid);
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

function assetItemKey(itemHrid, enhancementLevel = 0) {
  return `${itemHrid}#${Number(enhancementLevel) || 0}`;
}

function getActionOutputIndexes() {
  const source = runtime.state.initData_actionDetailMap;
  if (source === actionOutputIndexSource && actionOutputIndexes) {
    return actionOutputIndexes;
  }
  const byItemAndLevel = new Map();
  const upgradesByItem = new Map();
  for (const [, action] of entriesOfMap(source)) {
    const countsByKey = new Map();
    const countsByItem = new Map();
    for (const output of action?.outputItems ?? []) {
      const itemHrid = output?.itemHrid ?? output?.hrid;
      if (!itemHrid) continue;
      const count = positiveNumber(output.count ?? 1);
      if (!count) continue;
      const key = assetItemKey(itemHrid, output.enhancementLevel);
      countsByKey.set(key, (countsByKey.get(key) ?? 0) + count);
      countsByItem.set(itemHrid, (countsByItem.get(itemHrid) ?? 0) + count);
    }
    for (const [key, outputCount] of countsByKey) {
      const candidates = byItemAndLevel.get(key) ?? [];
      candidates.push({ action, outputCount });
      byItemAndLevel.set(key, candidates);
    }
    if (action?.upgradeItemHrid) {
      for (const [itemHrid, outputCount] of countsByItem) {
        const candidates = upgradesByItem.get(itemHrid) ?? [];
        candidates.push({ action, outputCount });
        upgradesByItem.set(itemHrid, candidates);
      }
    }
  }
  actionOutputIndexSource = source;
  actionOutputIndexes = { byItemAndLevel, upgradesByItem };
  return actionOutputIndexes;
}

function getShopRewardIndex() {
  const sources = [
    runtime.state.initData_shopItemDetailMap,
    runtime.state.initData_taskShopItemDetailMap,
    runtime.state.initData_labyrinthShopItemDetailMap,
  ];
  if (
    shopRewardIndex &&
    shopRewardIndexSources?.every((source, index) => source === sources[index])
  ) {
    return shopRewardIndex;
  }
  const index = new Map();
  for (const detail of getShopDetails()) {
    const countsByKey = new Map();
    for (const reward of normalizeRewardRecords(detail)) {
      const itemHrid = reward?.itemHrid ?? reward?.hrid;
      if (!itemHrid) continue;
      const count = positiveNumber(reward.count ?? 1);
      if (!count) continue;
      const key = assetItemKey(itemHrid, reward.enhancementLevel);
      countsByKey.set(key, (countsByKey.get(key) ?? 0) + count);
    }
    for (const [key, rewardCount] of countsByKey) {
      const candidates = index.get(key) ?? [];
      candidates.push({ detail, rewardCount });
      index.set(key, candidates);
    }
  }
  shopRewardIndexSources = sources;
  shopRewardIndex = index;
  return shopRewardIndex;
}

function getLootConfig(overrides = {}) {
  const settings = runtime.settings.settingsMap ?? {};
  return {
    sellAtAsk: Boolean(settings.lootSellAtAsk?.isTrue),
    buyAtAsk: settings.lootBuyAtAsk?.isTrue !== false,
    fromFragments: Boolean(settings.lootKeyFromFragments?.isTrue),
    ignoreCowbells: Boolean(settings.lootIgnoreCowbells?.isTrue),
    ...overrides,
  };
}

function lootSaleValue(itemHrid, enhancementLevel, sellAtAsk) {
  if (itemHrid === "/items/coin") return 1;
  const price = sellAtAsk
    ? positiveNumber(runtime.api.getAssetAskPrice?.(itemHrid, enhancementLevel))
    : positiveNumber(
        runtime.api.getAssetBidPrice?.(itemHrid, enhancementLevel),
      );
  if (!(price > 0)) return 0;
  const taxRate = Number(runtime.api.getMarketTaxRate?.(itemHrid)) || 0;
  return price * Math.max(0, 1 - taxRate);
}

function lootPurchaseValue(itemHrid, enhancementLevel, buyAtAsk) {
  if (itemHrid === "/items/coin") return 1;
  return buyAtAsk
    ? positiveNumber(runtime.api.getAssetAskPrice?.(itemHrid, enhancementLevel))
    : positiveNumber(
        runtime.api.getAssetBidPrice?.(itemHrid, enhancementLevel),
      );
}

function lootDropIdentity(itemHrid, enhancementLevel = 0) {
  return `${itemHrid}:${Number(enhancementLevel) || 0}`;
}

function normalizeLootDrops(itemHrid) {
  return getDropRecords(itemHrid).flatMap((drop) => {
    const dropItemHrid = drop?.itemHrid ?? drop?.hrid;
    if (!dropItemHrid) return [];
    const rawDropRate = Array.isArray(drop.dropRate)
      ? drop.dropRate[0]
      : drop.dropRate;
    const dropRate = Number.isFinite(Number(rawDropRate))
      ? Math.max(0, Number(rawDropRate))
      : 1;
    const minimum = Number(drop.minCount ?? drop.count ?? 1);
    const maximum = Number(drop.maxCount ?? drop.count ?? minimum);
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return [];
    const enhancementLevel = Number(drop.enhancementLevel ?? 0) || 0;
    return [
      {
        itemHrid: dropItemHrid,
        enhancementLevel,
        dropRate,
        minCount: minimum,
        maxCount: maximum,
        expectedCount: dropRate * (minimum + maximum) * 0.5,
      },
    ];
  });
}

function getLootKeyCost(keyItemHrid, config) {
  if (!keyItemHrid) {
    return { value: 0, complete: true, source: "none", missing: [] };
  }
  if (!config.fromFragments) {
    const value = lootPurchaseValue(keyItemHrid, 0, config.buyAtAsk);
    return {
      value,
      complete: value > 0,
      source: "finished",
      missing: value > 0 ? [] : [keyItemHrid],
    };
  }

  let bestValue = Number.POSITIVE_INFINITY;
  let sawRecipe = false;
  const missing = new Set();
  for (const [actionMapHrid, action] of entriesOfMap(
    runtime.state.initData_actionDetailMap,
  )) {
    const outputCount = (action?.outputItems ?? []).reduce((total, output) => {
      const outputHrid = output?.itemHrid ?? output?.hrid;
      const outputLevel = Number(output?.enhancementLevel ?? 0) || 0;
      return outputHrid === keyItemHrid && outputLevel === 0
        ? total + positiveNumber(output.count ?? 1)
        : total;
    }, 0);
    if (!outputCount) continue;
    sawRecipe = true;
    const actionHrid = action?.hrid ?? action?.actionHrid ?? actionMapHrid;
    const projection = runtime.api.projectActionCraftingCost?.(actionHrid, {
      getUnitPrice: (inputHrid, enhancementLevel = 0) =>
        lootPurchaseValue(inputHrid, enhancementLevel, config.buyAtAsk),
    });
    if (
      projection?.complete &&
      Number.isFinite(projection.totalCostPerAction)
    ) {
      bestValue = Math.min(
        bestValue,
        projection.totalCostPerAction / outputCount,
      );
      continue;
    }
    for (const missingItemHrid of projection?.missingPrices ?? []) {
      missing.add(missingItemHrid);
    }
    if (!projection || projection.missing?.length) missing.add(keyItemHrid);
  }

  return {
    value: Number.isFinite(bestValue) ? bestValue : 0,
    complete: Number.isFinite(bestValue),
    source: "fragments",
    missing: Number.isFinite(bestValue)
      ? []
      : [...missing, ...(sawRecipe ? [] : [keyItemHrid])],
  };
}

function getBestLootRedemptions(drops, config) {
  const displayedItems = new Set(
    drops.map((drop) => lootDropIdentity(drop.itemHrid, drop.enhancementLevel)),
  );
  const tokenHrids = new Set(
    drops
      .map((drop) => drop.itemHrid)
      .filter((itemHrid) => SHOP_CURRENCY_HRIDS.has(itemHrid)),
  );
  const bestByToken = new Map();
  if (!tokenHrids.size) return bestByToken;

  for (const detail of getShopDetails()) {
    const costs = normalizeCostRecords(detail);
    const rewards = normalizeRewardRecords(detail);
    if (!costs.length || rewards.length !== 1) continue;
    const reward = rewards[0];
    const rewardItemHrid = reward?.itemHrid ?? reward?.hrid;
    const rewardLevel = Number(reward?.enhancementLevel ?? 0) || 0;
    const rewardCount = positiveNumber(reward?.count ?? 1);
    if (
      !rewardItemHrid ||
      !rewardCount ||
      (config.ignoreCowbells && COWBELL_VALUE_HRIDS.has(rewardItemHrid)) ||
      !displayedItems.has(lootDropIdentity(rewardItemHrid, rewardLevel))
    ) {
      continue;
    }
    const rewardUnitValue = lootSaleValue(
      rewardItemHrid,
      rewardLevel,
      config.sellAtAsk,
    );
    if (!(rewardUnitValue > 0)) continue;

    for (const tokenItemHrid of tokenHrids) {
      const tokenCount = costs.reduce((total, cost) => {
        const costHrid = cost?.itemHrid ?? cost?.hrid;
        return costHrid === tokenItemHrid
          ? total + positiveNumber(cost.count)
          : total;
      }, 0);
      if (!tokenCount) continue;

      let otherCostValue = 0;
      let complete = true;
      for (const cost of costs) {
        const costHrid = cost?.itemHrid ?? cost?.hrid;
        const count = positiveNumber(cost?.count);
        if (!costHrid || !count || costHrid === tokenItemHrid) continue;
        const unitValue = lootPurchaseValue(
          costHrid,
          Number(cost?.enhancementLevel ?? 0) || 0,
          config.buyAtAsk,
        );
        if (!(unitValue > 0)) {
          complete = false;
          break;
        }
        otherCostValue += count * unitValue;
      }
      if (!complete) continue;

      const totalValue = Math.max(
        0,
        rewardUnitValue * rewardCount - otherCostValue,
      );
      const valuePerToken = totalValue / tokenCount;
      if (!(valuePerToken > 0)) continue;
      const candidate = {
        tokenItemHrid,
        tokenCount,
        rewardItemHrid,
        rewardEnhancementLevel: rewardLevel,
        rewardCount,
        rewardUnitValue,
        totalValue,
        valuePerToken,
      };
      const current = bestByToken.get(tokenItemHrid);
      if (
        !current ||
        valuePerToken > current.valuePerToken ||
        (valuePerToken === current.valuePerToken &&
          rewardItemHrid.localeCompare(current.rewardItemHrid) < 0)
      ) {
        bestByToken.set(tokenItemHrid, candidate);
      }
    }
  }
  return bestByToken;
}

function projectLootChestInternal(itemHrid, config, visited) {
  if (visited.has(itemHrid)) return null;
  const normalizedDrops = normalizeLootDrops(itemHrid);
  if (!normalizedDrops.length) return null;
  visited.add(itemHrid);

  const bestRedemptions = getBestLootRedemptions(normalizedDrops, config);
  const rows = [];
  let grossValue = 0;
  for (const drop of normalizedDrops) {
    const cowbellExcluded =
      config.ignoreCowbells && COWBELL_VALUE_HRIDS.has(drop.itemHrid);
    const nestedChest = normalizeLootDrops(drop.itemHrid).length > 0;
    const marketValue = lootSaleValue(
      drop.itemHrid,
      drop.enhancementLevel,
      config.sellAtAsk,
    );
    const tokenRedemption = bestRedemptions.get(drop.itemHrid) ?? null;
    const liquidationMode = config.sellAtAsk ? "aggressive" : "conservative";
    let unitValue = 0;
    let valueSource = "missing";
    let nested = false;
    let priced = false;
    let nestedMissing = [];
    let pendingSelfReference = false;
    if (cowbellExcluded) {
      unitValue = 0;
      valueSource = "excluded";
      priced = true;
    } else if (nestedChest && drop.itemHrid === itemHrid) {
      pendingSelfReference = true;
    } else if (nestedChest) {
      const nestedProjection = projectLootChestInternal(
        drop.itemHrid,
        config,
        visited,
      );
      if (nestedProjection && Number.isFinite(nestedProjection.netValue)) {
        unitValue = Math.max(0, nestedProjection.netValue);
        valueSource = "nested";
        nested = true;
        priced = true;
        nestedMissing = nestedProjection.missing;
      }
    }
    if (!priced && !pendingSelfReference && marketValue > 0) {
      unitValue = marketValue;
      valueSource = "market";
      priced = true;
    }
    if (!priced && !pendingSelfReference && tokenRedemption) {
      unitValue = tokenRedemption.valuePerToken;
      valueSource = "redemption";
      priced = true;
    }
    if (!priced && !pendingSelfReference && !nestedChest) {
      const derivedLiquidation = getAssetLiquidationValueInternal(
        drop.itemHrid,
        drop.enhancementLevel,
        liquidationMode,
        new Set(),
      );
      if (derivedLiquidation.value > 0) {
        unitValue = derivedLiquidation.value;
        valueSource = "derived";
        priced = true;
        nestedMissing = derivedLiquidation.missingItemHrids;
      }
    }
    if (
      !priced &&
      !pendingSelfReference &&
      isPersonalBuffScroll(drop.itemHrid)
    ) {
      unitValue = 0;
      valueSource = "zero";
      priced = true;
      nestedMissing = [];
    }
    const value = drop.expectedCount * unitValue;
    grossValue += value;
    const redemptions = [...bestRedemptions.values()].filter(
      (route) =>
        route.rewardItemHrid === drop.itemHrid &&
        route.rewardEnhancementLevel === drop.enhancementLevel,
    );
    rows.push({
      ...drop,
      unitValue,
      value,
      priced,
      nested,
      nestedMissing,
      pendingSelfReference,
      valueSource,
      tokenRedemption,
      redemptions,
    });
  }

  const keyItemHrid = getItemDetails(itemHrid)?.openKeyItemHrid ?? null;
  const entryKeyItemHrid = getDungeonEntryKeyItemHrid(itemHrid);
  const key = getLootKeyCost(keyItemHrid, config);
  const entryKey = getLootKeyCost(entryKeyItemHrid, {
    ...config,
    fromFragments: false,
  });
  const keyCost = key.value + entryKey.value;
  const keyComplete = key.complete && entryKey.complete;
  const selfRows = rows.filter((row) => row.pendingSelfReference);
  const selfExpectedCount = selfRows.reduce(
    (total, row) => total + row.expectedCount,
    0,
  );
  if (selfRows.length && keyComplete && selfExpectedCount < 1) {
    const selfValue = Math.max(
      0,
      (grossValue - keyCost) / (1 - selfExpectedCount),
    );
    for (const row of selfRows) {
      row.unitValue = selfValue;
      row.value = row.expectedCount * selfValue;
      row.priced = true;
      row.nested = true;
      row.valueSource = "nested";
      row.pendingSelfReference = false;
      grossValue += row.value;
    }
  }
  const missing = new Set(
    rows
      .filter((row) => row.expectedCount > 0 && !row.priced)
      .map((row) => row.itemHrid),
  );
  for (const row of rows) {
    for (const missingItemHrid of row.nestedMissing) {
      missing.add(missingItemHrid);
    }
  }
  for (const missingItemHrid of key.missing) missing.add(missingItemHrid);
  for (const missingItemHrid of entryKey.missing) {
    missing.add(missingItemHrid);
  }
  const complete = missing.size === 0 && keyComplete;
  const netValue = keyComplete ? grossValue - keyCost : null;
  visited.delete(itemHrid);
  return {
    itemHrid,
    keyItemHrid,
    entryKeyItemHrid,
    config,
    drops: rows.sort((left, right) => right.value - left.value),
    redemptions: [...bestRedemptions.values()],
    grossValue,
    keyCost,
    chestKeyCost: key.value,
    entryKeyCost: entryKey.value,
    keySource: key.source,
    keyComplete,
    chestKeyComplete: key.complete,
    entryKeyComplete: entryKey.complete,
    netValue,
    complete,
    missing: [...missing],
  };
}

function projectLootChest(itemHrid, overrides = {}) {
  return projectLootChestInternal(
    itemHrid,
    getLootConfig(overrides),
    new Set(),
  );
}

function acquisitionCostValue(itemHrid, enhancementLevel, context) {
  if (itemHrid === "/items/coin") return 1;
  const acquisitionDepth = [...context].filter((key) =>
    String(key).endsWith(":acquisition"),
  ).length;
  if (acquisitionDepth >= MAX_ACQUISITION_DEPTH) return 0;
  return getAssetValueInternal(itemHrid, enhancementLevel, context, {
    forceAcquisitionValue: true,
  });
}

function getShopAcquisitionValue(itemHrid, enhancementLevel, context) {
  let bestValue = Number.POSITIVE_INFINITY;
  const candidates =
    getShopRewardIndex().get(assetItemKey(itemHrid, enhancementLevel)) ?? [];
  for (const { detail, rewardCount } of candidates) {
    let totalCost = 0,
      complete = true;
    for (const cost of normalizeCostRecords(detail)) {
      const costHrid = cost?.itemHrid ?? cost?.hrid;
      const count = positiveNumber(cost?.count);
      if (!costHrid || !count) continue;
      const unitValue = acquisitionCostValue(
        costHrid,
        Number(cost?.enhancementLevel ?? 0) || 0,
        context,
      );
      if (!(unitValue > 0)) {
        complete = false;
        break;
      }
      totalCost += count * unitValue;
    }
    if (complete && totalCost > 0) {
      bestValue = Math.min(bestValue, totalCost / rewardCount);
    }
  }
  return Number.isFinite(bestValue) ? bestValue : 0;
}

function getRefinedAcquisitionValue(itemHrid, enhancementLevel, context) {
  if (!String(itemHrid).endsWith("_refined")) return 0;
  let bestValue = Number.POSITIVE_INFINITY;
  const candidates =
    getActionOutputIndexes().upgradesByItem.get(itemHrid) ?? [];
  for (const { action, outputCount } of candidates) {
    const baseItemHrid = action?.upgradeItemHrid;
    if (!baseItemHrid) continue;

    const retainedLevel = action.retainAllEnhancement ? enhancementLevel : 0;
    let totalCost = acquisitionCostValue(baseItemHrid, retainedLevel, context),
      complete = totalCost > 0;
    for (const cost of action.inputItems ?? []) {
      const costHrid = cost?.itemHrid ?? cost?.hrid;
      const count = positiveNumber(cost?.count);
      if (!costHrid || !count) continue;
      const unitValue = acquisitionCostValue(
        costHrid,
        Number(cost?.enhancementLevel ?? 0) || 0,
        context,
      );
      if (!(unitValue > 0)) {
        complete = false;
        break;
      }
      totalCost += count * unitValue;
    }
    if (complete && totalCost > 0) {
      bestValue = Math.min(bestValue, totalCost / outputCount);
    }
  }
  return Number.isFinite(bestValue) ? bestValue : 0;
}

function getCraftedAcquisitionValue(itemHrid, enhancementLevel, context) {
  let bestValue = Number.POSITIVE_INFINITY;
  const candidates =
    getActionOutputIndexes().byItemAndLevel.get(
      assetItemKey(itemHrid, enhancementLevel),
    ) ?? [];
  for (const { action, outputCount } of candidates) {
    let totalCost = 0;
    let complete = true;
    const inputItems = action?.inputItems ?? [];
    const upgradeItemHrid = action?.upgradeItemHrid;
    if (upgradeItemHrid) {
      const retainedLevel = action.retainAllEnhancement ? enhancementLevel : 0;
      const upgradeValue = acquisitionCostValue(
        upgradeItemHrid,
        retainedLevel,
        context,
      );
      if (!(upgradeValue > 0)) complete = false;
      else totalCost += upgradeValue;
    }
    for (const input of inputItems) {
      const inputHrid = input?.itemHrid ?? input?.hrid;
      const count = positiveNumber(input?.count);
      if (!inputHrid || !count) continue;
      const inputValue = acquisitionCostValue(
        inputHrid,
        Number(input?.enhancementLevel ?? 0) || 0,
        context,
      );
      if (!(inputValue > 0)) {
        complete = false;
        break;
      }
      totalCost += count * inputValue;
    }
    if (complete && totalCost > 0) {
      bestValue = Math.min(bestValue, totalCost / outputCount);
    }
  }
  return Number.isFinite(bestValue) ? bestValue : 0;
}

function getEnhancedEquipmentCost(
  itemHrid,
  enhancementLevel,
  context,
  options = {},
) {
  if (
    !(enhancementLevel > 0) ||
    !isEquipment(itemHrid) ||
    typeof runtime.api.calculateEnhancementPlan !== "function"
  ) {
    return 0;
  }
  const backEquipment = isBackEquipment(itemHrid, options.itemLocationHrid);
  const plan = runtime.api.calculateEnhancementPlan({
    itemHrid,
    targetLevel: enhancementLevel,
    forcedProtectionItemHrid: backEquipment
      ? "/items/mirror_of_protection"
      : null,
    allowPhilosopherMirror: !backEquipment,
    getFairValue: (hrid, level = 0) =>
      acquisitionCostValue(hrid, level, context),
    getMarketValue: (hrid, level = 0) =>
      runtime.api.getAssetFairValue(hrid, level),
  });
  return plan?.status === "complete" ? positiveNumber(plan.totalCost) : 0;
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

function getAssetValueInternal(
  itemHrid,
  enhancementLevel,
  context,
  options = {},
) {
  if (!itemHrid) return 0;
  if (itemHrid === "/items/coin") return 1;
  const level = Number(enhancementLevel) || 0;
  const directFairValue = runtime.api.getAssetFairValue(itemHrid, level);
  const backEquipment = isBackEquipment(itemHrid, options.itemLocationHrid);
  const enhancedEquipment = level > 0 && isEquipment(itemHrid);
  const refinedBackEquipment =
    backEquipment && String(itemHrid).endsWith("_refined");
  const ordinaryBackMirrorValue =
    level === 0 &&
    backEquipment &&
    !refinedBackEquipment &&
    options.forceAcquisitionValue !== true &&
    settingEnabled("valueBackEquipmentWithProtectionMirror");
  const preferAcquisitionValue =
    options.forceAcquisitionValue === true || refinedBackEquipment;
  const cacheMode = enhancedEquipment
    ? backEquipment
      ? "enhancement-protected-mirror"
      : "enhancement-protected"
    : ordinaryBackMirrorValue
      ? "protection-mirror-value"
      : preferAcquisitionValue
        ? "acquisition"
        : "market";
  const cacheKey = `${itemHrid}:${level}:${cacheMode}`;
  if (assetValueCache.has(cacheKey)) return assetValueCache.get(cacheKey);
  if (context.has(cacheKey)) return 0;

  if (ordinaryBackMirrorValue) {
    context.add(cacheKey);
    const mirrorValue = getAssetValueInternal(
      "/items/mirror_of_protection",
      0,
      context,
    );
    context.delete(cacheKey);
    if (mirrorValue > 0) {
      assetValueCache.set(cacheKey, mirrorValue);
      return mirrorValue;
    }
  }

  if (enhancedEquipment) {
    const enhancementCost = getEnhancedEquipmentCost(
      itemHrid,
      level,
      context,
      options,
    );
    if (enhancementCost > 0) {
      const deviation =
        directFairValue > 0
          ? Math.abs(directFairValue - enhancementCost) / enhancementCost
          : Number.POSITIVE_INFINITY;
      const value =
        directFairValue > 0 &&
        deviation <= ENHANCED_EQUIPMENT_MAX_MARKET_DEVIATION
          ? directFairValue
          : enhancementCost;
      assetValueCache.set(cacheKey, value);
      return value;
    }
    if (directFairValue > 0) {
      assetValueCache.set(cacheKey, directFairValue);
      return directFairValue;
    }
  }

  if (!preferAcquisitionValue && directFairValue > 0) {
    assetValueCache.set(cacheKey, directFairValue);
    return directFairValue;
  }

  if (directFairValue <= 0 && isPersonalBuffScroll(itemHrid)) {
    assetValueCache.set(cacheKey, 0);
    return 0;
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
    if (preferAcquisitionValue) {
      const candidates = [
        directFairValue,
        getShopAcquisitionValue(itemHrid, level, context),
        getCraftedAcquisitionValue(itemHrid, level, context),
        getRefinedAcquisitionValue(itemHrid, level, context),
      ].filter((candidate) => candidate > 0);
      value = candidates.length ? Math.min(...candidates) : 0;
    } else {
      value = Math.max(
        !backEquipment ? getShopAcquisitionValue(itemHrid, level, context) : 0,
        getRefinedAcquisitionValue(itemHrid, level, context),
        getOpenableValue(itemHrid, context),
      );
    }
  }
  context.delete(cacheKey);

  const keyedOpenable =
    Boolean(getItemDetails(itemHrid)?.openKeyItemHrid) &&
    getDropRecords(itemHrid).length > 0;
  if (keyedOpenable && !(value > 0)) {
    assetValueCache.set(cacheKey, 0);
    return 0;
  }
  if (!(value > 0)) value = directFairValue;
  if (!(value > 0)) {
    value = positiveNumber(getItemDetails(itemHrid)?.sellPrice);
  }

  const normalizedValue = Number.isFinite(value) && value > 0 ? value : 0;
  assetValueCache.set(cacheKey, normalizedValue);
  return normalizedValue;
}

function getAssetValue(itemHrid, enhancementLevel = 0, options = {}) {
  return getAssetValueInternal(itemHrid, enhancementLevel, new Set(), options);
}

function directLiquidationValue(itemHrid, enhancementLevel, mode) {
  if (mode === "conservative") {
    return positiveNumber(
      runtime.api.getAssetNetSellPrice?.(itemHrid, enhancementLevel),
    );
  }
  if (mode === "aggressive") {
    return positiveNumber(
      runtime.api.getAssetNetSellPriceAtAsk?.(itemHrid, enhancementLevel),
    );
  }
  const fairValue = positiveNumber(
    runtime.api.getAssetFairValue?.(itemHrid, enhancementLevel),
  );
  if (!fairValue) return 0;
  const taxRate = Number(runtime.api.getMarketTaxRate?.(itemHrid)) || 0;
  return fairValue * Math.max(0, 1 - taxRate);
}

function liquidationResult(value, source, missingItemHrids = []) {
  const normalizedValue = positiveNumber(value);
  const missing = [...new Set(missingItemHrids.filter(Boolean))];
  return {
    value: normalizedValue,
    complete: normalizedValue > 0 && missing.length === 0,
    source: normalizedValue > 0 ? source : "missing",
    missingItemHrids: missing,
  };
}

function mergeLiquidationMissing(results) {
  return results.flatMap((result) => result?.missingItemHrids ?? []);
}

function getCraftedLiquidationValue(itemHrid, enhancementLevel, mode, context) {
  let bestValue = Number.POSITIVE_INFINITY;
  let missingItemHrids = [];
  const candidates =
    getActionOutputIndexes().byItemAndLevel.get(
      assetItemKey(itemHrid, enhancementLevel),
    ) ?? [];
  for (const { action, outputCount } of candidates) {
    const inputItems = [...(action?.inputItems ?? [])];
    const upgradeItemHrid = action?.upgradeItemHrid;
    if (upgradeItemHrid) {
      inputItems.unshift({
        itemHrid: upgradeItemHrid,
        enhancementLevel: action.retainAllEnhancement ? enhancementLevel : 0,
        count: 1,
      });
    }

    let totalCost = 0;
    let complete = true;
    const results = [];
    for (const input of inputItems) {
      const inputHrid = input?.itemHrid ?? input?.hrid;
      const count = positiveNumber(input?.count);
      if (!inputHrid || !count) continue;
      const result =
        inputHrid === "/items/coin"
          ? liquidationResult(1, "coin")
          : getAssetLiquidationValueInternal(
              inputHrid,
              Number(input?.enhancementLevel ?? 0) || 0,
              mode,
              context,
            );
      results.push(result);
      if (!(result.value > 0)) {
        complete = false;
        continue;
      }
      totalCost += count * result.value;
    }
    if (complete && totalCost > 0) {
      const unitCost = totalCost / outputCount;
      if (unitCost < bestValue) bestValue = unitCost;
    } else {
      missingItemHrids.push(...mergeLiquidationMissing(results));
    }
  }
  if (Number.isFinite(bestValue)) {
    return liquidationResult(bestValue, "crafting");
  }
  return liquidationResult(0, "missing", [...missingItemHrids, itemHrid]);
}

function getGuildCreditLiquidationValue(creditItemHrid, mode, context) {
  let bestValue = Number.POSITIVE_INFINITY;
  let bestResult = null;
  for (const [fallbackHrid, detail] of entriesOfMap(
    runtime.state.initData_itemDetailMap,
  )) {
    const itemHrid = detail?.hrid ?? detail?.itemHrid ?? fallbackHrid;
    if (!itemHrid || itemHrid === "/items/guild_token") continue;
    for (const conversion of detail?.guildCreditConversions ?? []) {
      if (conversion?.creditItemHrid !== creditItemHrid) continue;
      const itemCount = positiveNumber(conversion.itemCount);
      const creditCount = positiveNumber(conversion.creditCount);
      if (!itemCount || !creditCount) continue;
      const material = getAssetLiquidationValueInternal(
        itemHrid,
        0,
        mode,
        context,
      );
      if (material.value > 0) {
        const value = (material.value * itemCount) / creditCount;
        if (value < bestValue) {
          bestValue = value;
          bestResult = material;
        }
      }
    }
  }
  return liquidationResult(
    Number.isFinite(bestValue) ? bestValue : 0,
    "conversion",
    bestResult?.missingItemHrids ?? [],
  );
}

function getGuildTokenLiquidationValue(mode, context) {
  const detail = getItemDetails("/items/guild_token");
  let bestValue = 0;
  let bestResult = null;
  for (const conversion of detail?.guildCreditConversions ?? []) {
    const creditItemHrid = conversion?.creditItemHrid;
    const tokenCount = positiveNumber(
      conversion?.guildTokenCount ?? conversion?.itemCount,
    );
    const creditCount = positiveNumber(conversion?.creditCount);
    if (!creditItemHrid || !tokenCount || !creditCount) continue;
    const credit = getAssetLiquidationValueInternal(
      creditItemHrid,
      0,
      mode,
      context,
    );
    if (credit.value > 0) {
      const value = (credit.value * creditCount) / tokenCount;
      if (value > bestValue) {
        bestValue = value;
        bestResult = credit;
      }
    }
  }
  return liquidationResult(
    bestValue,
    "conversion",
    bestResult?.missingItemHrids ?? [],
  );
}

function getShopCurrencyLiquidationValue(currencyItemHrid, mode, context) {
  let bestValue = 0;
  let bestResults = [];
  for (const detail of getShopDetails()) {
    const costs = normalizeCostRecords(detail);
    const targetCost = costs.find(
      (cost) => (cost?.itemHrid ?? cost?.hrid) === currencyItemHrid,
    );
    const targetCount = positiveNumber(targetCost?.count);
    if (!targetCount) continue;

    const results = [];
    let rewardValue = 0;
    for (const reward of normalizeRewardRecords(detail)) {
      const itemHrid = reward?.itemHrid ?? reward?.hrid;
      if (!itemHrid) continue;
      const result = getAssetLiquidationValueInternal(
        itemHrid,
        reward.enhancementLevel ?? 0,
        mode,
        context,
      );
      results.push(result);
      rewardValue += positiveNumber(reward.count ?? 1) * result.value;
    }

    let otherCostValue = 0;
    for (const cost of costs) {
      const itemHrid = cost?.itemHrid ?? cost?.hrid;
      if (!itemHrid || itemHrid === currencyItemHrid) continue;
      const result = getAssetLiquidationValueInternal(
        itemHrid,
        0,
        mode,
        context,
      );
      results.push(result);
      otherCostValue += positiveNumber(cost.count) * result.value;
    }
    const value = Math.max(0, rewardValue - otherCostValue) / targetCount;
    if (value > bestValue) {
      bestValue = value;
      bestResults = results;
    }
  }
  return liquidationResult(
    bestValue,
    "conversion",
    mergeLiquidationMissing(bestResults),
  );
}

function getOpenableLiquidationValue(itemHrid, mode, context) {
  const drops = getDropRecords(itemHrid);
  if (!Array.isArray(drops) || !drops.length) {
    return liquidationResult(0, "missing", [itemHrid]);
  }
  let total = 0;
  const results = [];
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
    const result = getAssetLiquidationValueInternal(
      dropItemHrid,
      drop.enhancementLevel ?? 0,
      mode,
      context,
    );
    results.push(result);
    total += dropRate * (minimum + maximum) * 0.5 * result.value;
  }
  const keyItemHrid = getItemDetails(itemHrid)?.openKeyItemHrid;
  if (keyItemHrid) {
    const keyResult = getCraftedLiquidationValue(keyItemHrid, 0, mode, context);
    results.push(keyResult);
    if (!(keyResult.value > 0)) {
      return liquidationResult(0, "missing", [
        ...mergeLiquidationMissing(results),
        keyItemHrid,
      ]);
    }
    total = Math.max(0, total - keyResult.value);
  }
  const entryKeyItemHrid = getDungeonEntryKeyItemHrid(itemHrid);
  if (entryKeyItemHrid) {
    const entryKeyResult = getAssetLiquidationValueInternal(
      entryKeyItemHrid,
      0,
      mode,
      context,
    );
    results.push(entryKeyResult);
    if (!(entryKeyResult.value > 0)) {
      return liquidationResult(0, "missing", [
        ...mergeLiquidationMissing(results),
        entryKeyItemHrid,
      ]);
    }
    total = Math.max(0, total - entryKeyResult.value);
  }
  if (!(total > 0) && results.every((result) => result.complete)) {
    return {
      value: 0,
      complete: true,
      source: "openable",
      missingItemHrids: [],
    };
  }
  return liquidationResult(total, "openable", mergeLiquidationMissing(results));
}

function getAssetLiquidationValueInternal(
  itemHrid,
  enhancementLevel,
  mode,
  context,
) {
  if (!itemHrid) return liquidationResult(0, "missing");
  const normalizedMode = ["conservative", "fair", "aggressive"].includes(mode)
    ? mode
    : "fair";
  const level = Number(enhancementLevel) || 0;
  const cacheKey = `${normalizedMode}:${itemHrid}:${level}`;
  if (assetLiquidationCache.has(cacheKey)) {
    return assetLiquidationCache.get(cacheKey);
  }
  if (context.has(cacheKey)) {
    return liquidationResult(0, "missing", [itemHrid]);
  }

  const directValue = directLiquidationValue(itemHrid, level, normalizedMode);
  if (directValue > 0) {
    const result = liquidationResult(directValue, "market");
    assetLiquidationCache.set(cacheKey, result);
    return result;
  }

  context.add(cacheKey);
  let result;
  if (itemHrid === "/items/cowbell") {
    const bag = getAssetLiquidationValueInternal(
      "/items/bag_of_10_cowbells",
      0,
      normalizedMode,
      context,
    );
    result = liquidationResult(
      bag.value / 10,
      "conversion",
      bag.missingItemHrids,
    );
  } else if (getGuildCreditHrids().has(itemHrid)) {
    result = getGuildCreditLiquidationValue(itemHrid, normalizedMode, context);
  } else if (itemHrid === "/items/guild_token") {
    result = getGuildTokenLiquidationValue(normalizedMode, context);
  } else if (SHOP_CURRENCY_HRIDS.has(itemHrid)) {
    result = getShopCurrencyLiquidationValue(itemHrid, normalizedMode, context);
  } else {
    result = getOpenableLiquidationValue(itemHrid, normalizedMode, context);
  }
  context.delete(cacheKey);

  const keyedOpenable =
    Boolean(getItemDetails(itemHrid)?.openKeyItemHrid) &&
    getDropRecords(itemHrid).length > 0;
  if (!(result.value > 0) && result.source === "missing" && !keyedOpenable) {
    const sellPrice = positiveNumber(getItemDetails(itemHrid)?.sellPrice);
    result = sellPrice
      ? liquidationResult(sellPrice, "sell-price")
      : liquidationResult(0, "missing", [...result.missingItemHrids, itemHrid]);
  }
  assetLiquidationCache.set(cacheKey, result);
  return result;
}

function getAssetLiquidationValue(
  itemHrid,
  enhancementLevel = 0,
  mode = "fair",
) {
  return getAssetLiquidationValueInternal(
    itemHrid,
    enhancementLevel,
    mode,
    new Set(),
  );
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
  getAssetLiquidationValue,
  getGuildShrineValue,
  projectLootChest,
  isBackEquipment,
  isNonTradableTokenAsset,
  isOptionalTokenAsset,
  invalidateAssetValueCache,
  shouldIncludeCowbellsInAssets,
  shouldIncludeGuildDungeonTokensInAssets,
});

function refreshConfiguredAssetValues() {
  invalidateAssetValueCache();
  runtime.api.scheduleNetworthRefresh?.();
  if (runtime.settings.settingsMap.assetHistory.isTrue) {
    runtime.api.scheduleAssetSnapshotRefresh?.(0);
  }
}

runtime.settings.onChange?.(
  "includeCowbellsInAssets",
  refreshConfiguredAssetValues,
);
runtime.settings.onChange?.(
  "includeGuildDungeonTokensInAssets",
  refreshConfiguredAssetValues,
);
runtime.settings.onChange?.(
  "valueBackEquipmentWithProtectionMirror",
  refreshConfiguredAssetValues,
);
