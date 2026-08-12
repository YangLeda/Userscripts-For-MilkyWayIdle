import { runtime } from "./runtime.js";

const MIN_ACTION_SECONDS = 3;
const DRINKS_PER_HOUR = 12;
const ENHANCEMENT_BONUSES = Object.freeze([
  0, 0.02, 0.042, 0.066, 0.092, 0.12, 0.15, 0.182, 0.216, 0.255, 0.29, 0.33,
  0.372, 0.416, 0.462, 0.51, 0.56, 0.612, 0.666, 0.722, 0.78,
]);

const BUFF_TYPES = Object.freeze({
  actionSpeed: "/buff_types/action_speed",
  artisan: "/buff_types/artisan",
  essenceFind: "/buff_types/essence_find",
  gathering: "/buff_types/gathering",
  gourmet: "/buff_types/gourmet",
  rareFind: "/buff_types/rare_find",
});

const ALCHEMY_ACTION_HRIDS = Object.freeze({
  coinify: "/actions/alchemy/coinify",
  decompose: "/actions/alchemy/decompose",
  transmute: "/actions/alchemy/transmute",
  unrefine: "/actions/alchemy/unrefine",
});
const COIN_ITEM_HRID = "/items/coin";

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getInventoryCount(itemHrid) {
  return (runtime.state.initData_characterItems ?? [])
    .filter(
      (item) =>
        item.itemHrid === itemHrid &&
        item.itemLocationHrid === "/item_locations/inventory",
    )
    .reduce((sum, item) => sum + Number(item.count || 0), 0);
}

function getInventoryItemByHash(hash) {
  if (!hash) return null;
  return (
    (runtime.state.initData_characterItems ?? []).find(
      (item) =>
        item.hash === hash &&
        item.itemLocationHrid === "/item_locations/inventory",
    ) ?? null
  );
}

function getAlchemyCoinCost(actionHrid, itemDetail) {
  const itemLevel = Math.max(0, Number(itemDetail?.itemLevel) || 0);
  if (actionHrid === ALCHEMY_ACTION_HRIDS.coinify) return 0;
  if (
    actionHrid === ALCHEMY_ACTION_HRIDS.decompose ||
    actionHrid === ALCHEMY_ACTION_HRIDS.unrefine
  ) {
    return Math.floor(5 * (10 + itemLevel));
  }
  if (actionHrid === ALCHEMY_ACTION_HRIDS.transmute) {
    return Math.max(50, Math.floor((Number(itemDetail?.sellPrice) || 0) / 5));
  }
  return 0;
}

function getAlchemyCapacity(action, detail, lessResource) {
  if (detail?.function !== "/action_functions/alchemy") return null;
  const primary = getInventoryItemByHash(action?.primaryItemHash);
  if (!primary) {
    return { known: false, maxCraftable: null, missing: ["primaryItem"] };
  }
  const primaryDetail =
    runtime.state.initData_itemDetailMap?.[primary.itemHrid];
  const bulkMultiplier = Math.max(
    1,
    Math.floor(Number(primaryDetail?.alchemyDetail?.bulkMultiplier) || 1),
  );
  let maxCraftable = Math.floor(
    Math.max(0, Number(primary.count) || 0) / bulkMultiplier,
  );

  if (action?.secondaryItemHash) {
    const secondary = getInventoryItemByHash(action.secondaryItemHash);
    if (!secondary) {
      return { known: false, maxCraftable: null, missing: ["secondaryItem"] };
    }
    maxCraftable =
      primary.hash === secondary.hash
        ? Math.floor(
            Math.max(0, Number(primary.count) || 0) / (bulkMultiplier + 1),
          )
        : Math.min(maxCraftable, Math.max(0, Number(secondary.count) || 0));
  }

  const coinCost = getAlchemyCoinCost(action.actionHrid, primaryDetail);
  if (coinCost > 0) {
    const reduction = Math.min(1, Math.max(0, Number(lessResource) || 0));
    const effectiveCoinCost = coinCost * bulkMultiplier * (1 - reduction);
    if (effectiveCoinCost > 0) {
      maxCraftable = Math.min(
        maxCraftable,
        Math.floor(getInventoryCount(COIN_ITEM_HRID) / effectiveCoinCost),
      );
    }
  }

  return {
    known: true,
    maxCraftable: Math.max(0, maxCraftable),
    bulkMultiplier,
    coinCost,
    primary,
  };
}

function getExpectedOutputs(detail) {
  if (asArray(detail?.outputItems).length) {
    return asArray(detail.outputItems).map((item) => ({
      itemHrid: item.itemHrid,
      count: Number(item.count) || 0,
    }));
  }
  return asArray(detail?.dropTable).map((drop) => ({
    itemHrid: drop.itemHrid,
    count:
      (Number(drop.dropRate ?? 1) || 0) *
      ((Number(drop.minCount ?? drop.count ?? 0) +
        Number(drop.maxCount ?? drop.count ?? 0)) /
        2),
  }));
}

function getProcessingProductMap() {
  const result = new Map();
  for (const [actionHrid, detail] of Object.entries(
    runtime.state.initData_actionDetailMap ?? {},
  )) {
    if (!/(?:fabric|lumber|cheese)$/.test(actionHrid)) continue;
    const input = asArray(detail?.inputItems)[0];
    const output = asArray(detail?.outputItems)[0];
    const inputCount = Number(input?.count) || 0;
    if (!input?.itemHrid || !output?.itemHrid || inputCount <= 0) continue;
    result.set(input.itemHrid, {
      itemHrid: output.itemHrid,
      inputCount,
    });
  }
  if (!result.has("/items/rainbow_milk")) {
    result.set("/items/rainbow_milk", {
      itemHrid: "/items/rainbow_cheese",
      inputCount: 2,
    });
  }
  return result;
}

function getEffectiveOutputs(detail, teaEffects) {
  const quantityMultiplier = 1 + Math.max(0, teaEffects?.quantity ?? 0);
  const processingRate = Math.min(
    1,
    Math.max(0, teaEffects?.upgradedProduct ?? 0),
  );
  const processingMap = processingRate > 0 ? getProcessingProductMap() : null;
  const result = [];
  for (const output of getExpectedOutputs(detail)) {
    const processing = processingMap?.get(output.itemHrid);
    const baseCount = Number(output.count) || 0;
    const rawCount =
      baseCount * quantityMultiplier * (processing ? 1 - processingRate : 1);
    if (rawCount > 0) {
      result.push({ ...output, baseCount, count: rawCount });
    }
    if (processing) {
      const processedCount =
        (baseCount * quantityMultiplier * processingRate) /
        processing.inputCount;
      if (processedCount > 0) {
        result.push({
          itemHrid: processing.itemHrid,
          baseCount: 0,
          count: processedCount,
          kind: "processed",
          processedFromItemHrid: output.itemHrid,
        });
      }
    }
  }
  return result;
}

function getDirectInputs(detail) {
  const inputs = asArray(detail?.inputItems).map((item) => ({
    itemHrid: item.itemHrid,
    enhancementLevel: Number(item.enhancementLevel ?? 0) || 0,
    count: Number(item.count) || 0,
    isUpgradeItem: false,
    upgradeItemCount: 0,
  }));
  if (detail?.upgradeItemHrid) {
    const matchingIndex = inputs.findIndex(
      (input) => input.itemHrid === detail.upgradeItemHrid,
    );
    if (matchingIndex >= 0) {
      inputs[matchingIndex] = {
        ...inputs[matchingIndex],
        count: inputs[matchingIndex].count + 1,
        isUpgradeItem: true,
        upgradeItemCount: 1,
      };
    } else {
      inputs.push({
        itemHrid: detail.upgradeItemHrid,
        enhancementLevel: 0,
        count: 1,
        isUpgradeItem: true,
        upgradeItemCount: 1,
      });
    }
  }
  return inputs;
}

function getEffectiveInputCount(input, lessResource) {
  const count = Math.max(0, Number(input?.count) || 0);
  const reduction = Math.min(1, Math.max(0, Number(lessResource) || 0));
  if (!input?.isUpgradeItem) return count * (1 - reduction);
  const retainedCount = Math.min(
    count,
    Math.max(0, Number(input?.upgradeItemCount) || 1),
  );
  return retainedCount + (count - retainedCount) * (1 - reduction);
}

function getActionBuffs(actionHrid) {
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  const sources = runtime.state.actionTypeBuffSources;
  if (!detail || !sources) return null;
  const buffs = [];
  for (const sourceMap of Object.values(sources)) {
    const actionBuffs = sourceMap?.[detail.type];
    if (Array.isArray(actionBuffs)) buffs.push(...actionBuffs);
  }
  return buffs;
}

function getActionBuffRatio(actionHrid, typeHrid) {
  const buffs = getActionBuffs(actionHrid);
  if (!buffs) return null;
  return buffs.reduce((total, buff) => {
    if (buff?.typeHrid !== typeHrid) return total;
    return (
      total + (Number(buff.flatBoost) || 0) + (Number(buff.ratioBoost) || 0)
    );
  }, 0);
}

function getEquippedItem(itemHrid) {
  const candidates = Object.values(runtime.state.currentEquipmentMap ?? {});
  if (!candidates.length) {
    candidates.push(
      ...(runtime.state.initData_characterItems ?? []).filter(
        (item) => item?.itemLocationHrid !== "/item_locations/inventory",
      ),
    );
  }
  return candidates
    .filter(
      (item) => item?.itemHrid === itemHrid && Number(item.count ?? 1) > 0,
    )
    .sort(
      (left, right) =>
        (Number(right.enhancementLevel) || 0) -
        (Number(left.enhancementLevel) || 0),
    )[0];
}

function getDrinkConcentrationMultiplier() {
  const pouch = getEquippedItem("/items/guzzling_pouch");
  if (!pouch) return 1;
  const detail =
    runtime.state.initData_itemDetailMap?.["/items/guzzling_pouch"];
  const base = Number(
    detail?.equipmentDetail?.noncombatStats?.drinkConcentration ?? 0,
  );
  const enhancement = Number(
    detail?.equipmentDetail?.noncombatEnhancementBonuses?.drinkConcentration ??
      base,
  );
  const level = Math.max(0, Math.floor(Number(pouch.enhancementLevel) || 0));
  return Math.max(
    1,
    1 + base + enhancement * (ENHANCEMENT_BONUSES[level] ?? 0),
  );
}

function getSelectedDrinks(detail) {
  const slots = runtime.state.initData_actionTypeDrinkSlotsMap;
  if (!slots || typeof slots !== "object") return null;
  return asArray(slots[detail.type]).filter((drink) => drink?.itemHrid);
}

function getEffectiveTeaEffects(actionHrid) {
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  const drinks = detail ? getSelectedDrinks(detail) : null;
  if (!detail || drinks === null) return null;
  const concentrationMultiplier = getDrinkConcentrationMultiplier();
  const base = {
    efficiency: 0,
    extraExp: 0,
    lessResource: 0,
    quantity: 0,
    upgradedProduct: 0,
  };
  const drinkDetails = [];
  for (const drink of drinks) {
    const item = runtime.state.initData_itemDetailMap?.[drink.itemHrid];
    if (!item) return null;
    for (const buff of asArray(item.consumableDetail?.buffs)) {
      const flat = Number(buff.flatBoost) || 0;
      if (buff.typeHrid === BUFF_TYPES.artisan) {
        base.lessResource += flat;
      } else if (
        buff.typeHrid === BUFF_TYPES.gathering ||
        buff.typeHrid === BUFF_TYPES.gourmet
      ) {
        base.quantity += flat;
      } else if (buff.typeHrid === "/buff_types/wisdom") {
        base.extraExp += flat;
      } else if (buff.typeHrid === "/buff_types/processing") {
        base.upgradedProduct += flat;
      } else if (buff.typeHrid === "/buff_types/efficiency") {
        base.efficiency += flat;
      } else if (buff.typeHrid === "/buff_types/action_level") {
        base.efficiency -= flat / 100;
      } else if (
        buff.typeHrid ===
        `/buff_types/${detail.type.replace("/action_types/", "")}_level`
      ) {
        base.efficiency += flat / 100;
      }
    }
    drinkDetails.push({ itemHrid: drink.itemHrid });
  }
  return {
    concentrationMultiplier,
    drinks: drinkDetails,
    efficiency: base.efficiency * concentrationMultiplier,
    extraExp: base.extraExp * concentrationMultiplier,
    lessResource: Math.min(
      1,
      Math.max(0, base.lessResource * concentrationMultiplier),
    ),
    quantity: Math.max(0, base.quantity * concentrationMultiplier),
    upgradedProduct: Math.max(
      0,
      base.upgradedProduct * concentrationMultiplier,
    ),
  };
}

function projectActionCraftingCost(actionOrHrid, options = {}) {
  const action =
    typeof actionOrHrid === "string"
      ? { actionHrid: actionOrHrid }
      : (actionOrHrid ?? {});
  const actionHrid = action.actionHrid ?? action.hrid;
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  if (!actionHrid || !detail) {
    return {
      status: "waiting",
      complete: false,
      actionHrid,
      missing: ["actionData"],
      missingPrices: [],
    };
  }
  if (!isPlayerDataReady()) {
    return {
      status: "waiting",
      complete: false,
      actionHrid,
      detail,
      missing: ["playerData"],
      missingPrices: [],
    };
  }

  const teaEffects = getEffectiveTeaEffects(actionHrid);
  if (!teaEffects) {
    return {
      status: "waiting",
      complete: false,
      actionHrid,
      detail,
      missing: ["playerData"],
      missingPrices: [],
    };
  }

  const getUnitPrice =
    typeof options.getUnitPrice === "function"
      ? options.getUnitPrice
      : () => null;
  const missingPrices = [];
  const inputs = getDirectInputs(detail).map((input) => {
    const effectiveCount = getEffectiveInputCount(
      input,
      teaEffects.lessResource,
    );
    const unitPrice = Number(
      getUnitPrice(input.itemHrid, input.enhancementLevel ?? 0),
    );
    if (!(unitPrice > 0)) missingPrices.push(input.itemHrid);
    return {
      ...input,
      effectiveCount,
      unitPrice: unitPrice > 0 ? unitPrice : null,
      valuePerAction: unitPrice > 0 ? effectiveCount * unitPrice : null,
    };
  });
  const materialCostPerAction = inputs.reduce(
    (total, input) => total + (input.valuePerAction ?? 0),
    0,
  );

  const timing = getEffectiveSeconds(actionHrid, detail, options);
  const secondsPerAction = timing?.secondsPerAction ?? null;
  const actionsPerHour = secondsPerAction ? 3600 / secondsPerAction : null;
  const drinks = teaEffects.drinks.map((drink) => {
    const unitPrice = Number(getUnitPrice(drink.itemHrid, 0));
    if (!(unitPrice > 0)) missingPrices.push(drink.itemHrid);
    const countPerHour = DRINKS_PER_HOUR * teaEffects.concentrationMultiplier;
    const costPerHour = unitPrice > 0 ? unitPrice * countPerHour : null;
    return {
      ...drink,
      unitPrice: unitPrice > 0 ? unitPrice : null,
      countPerHour,
      costPerHour,
    };
  });
  const requiresTiming = drinks.length > 0;
  const teaCostPerHour = drinks.reduce(
    (total, drink) => total + (drink.costPerHour ?? 0),
    0,
  );
  const teaCostPerAction = actionsPerHour
    ? teaCostPerHour / actionsPerHour
    : requiresTiming
      ? null
      : 0;
  const complete =
    missingPrices.length === 0 && (!requiresTiming || actionsPerHour !== null);
  const totalCostPerAction = complete
    ? materialCostPerAction + teaCostPerAction
    : null;

  return {
    status: complete ? "complete" : "incomplete",
    complete,
    actionHrid,
    detail,
    inputs,
    outputs: getExpectedOutputs(detail),
    drinks,
    teaEffects: { ...teaEffects, drinks },
    secondsPerAction,
    actionsPerHour,
    materialCostPerAction,
    teaCostPerHour,
    teaCostPerAction,
    totalCostPerAction,
    missing: requiresTiming && !actionsPerHour ? ["actionTiming"] : [],
    missingPrices: [...new Set(missingPrices)],
  };
}

function isPlayerDataReady() {
  return (
    Array.isArray(runtime.state.initData_characterSkills) &&
    Array.isArray(runtime.state.initData_characterItems) &&
    runtime.state.initData_actionTypeDrinkSlotsMap !== null &&
    runtime.state.initData_actionTypeDrinkSlotsMap !== undefined
  );
}

function getActionCount(action) {
  if (action?.hasMaxCount === false) return Infinity;
  const target = Number(
    action?.targetCount ??
      action?.maxCount ??
      action?.count ??
      action?.actionCount,
  );
  if (!Number.isFinite(target) || target < 0) return Infinity;
  const current = Number(action?.currentCount ?? action?.completedCount ?? 0);
  return Math.max(0, target - (Number.isFinite(current) ? current : 0));
}

function getEfficiencyMultiplier(actionHrid) {
  const efficiency =
    Number(runtime.api.getTotalEffiPercentage?.(actionHrid)) || 0;
  return 1 + efficiency / 100;
}

function getActionSpeedPercent(actionHrid) {
  const authoritative = getActionBuffRatio(actionHrid, BUFF_TYPES.actionSpeed);
  if (authoritative !== null) return authoritative * 100;
  return Number(runtime.api.getToolsSpeedBuffByActionHrid?.(actionHrid)) || 0;
}

function getEffectiveSeconds(actionHrid, detail, context = {}) {
  const efficiencyPercent = (getEfficiencyMultiplier(actionHrid) - 1) * 100;
  const speedPercent = getActionSpeedPercent(actionHrid);
  const liveDuration = Number(context.durationPerAction);
  if (Number.isFinite(liveDuration) && liveDuration > 0) {
    return {
      cycleSeconds: liveDuration,
      efficiencyPercent,
      secondsPerAction: liveDuration / getEfficiencyMultiplier(actionHrid),
      speedPercent,
      timingSource: "live",
    };
  }
  const baseSeconds = Number(detail?.baseTimeCost) / 1e9;
  if (!Number.isFinite(baseSeconds) || baseSeconds <= 0) return null;
  const cycleSeconds = Math.max(
    MIN_ACTION_SECONDS,
    baseSeconds / (1 + speedPercent / 100),
  );
  return {
    baseSeconds,
    cycleSeconds,
    efficiencyPercent,
    secondsPerAction: cycleSeconds / getEfficiencyMultiplier(actionHrid),
    speedPercent,
    timingSource: "calculated",
  };
}

const PROFIT_VALUATION_MODES = new Set(["conservative", "fair", "aggressive"]);
const PROFIT_ACTION_TYPES = new Set([
  "/action_types/alchemy",
  "/action_types/brewing",
  "/action_types/cheesesmithing",
  "/action_types/cooking",
  "/action_types/crafting",
  "/action_types/foraging",
  "/action_types/milking",
  "/action_types/tailoring",
  "/action_types/woodcutting",
]);

function getDirectPrice(itemHrid, kind, mode) {
  let value = 0;
  if (mode === "conservative") {
    value =
      kind === "sell"
        ? runtime.api.getNetSellPrice?.(itemHrid, 0)
        : runtime.api.getAskPrice?.(itemHrid, 0);
  } else if (mode === "aggressive") {
    value =
      kind === "sell"
        ? runtime.api.getNetSellPriceAtAsk?.(itemHrid, 0)
        : runtime.api.getBidPrice?.(itemHrid, 0);
  } else {
    value = runtime.api.getFairValue?.(itemHrid, 0);
    if (kind === "sell" && Number(value) > 0) {
      value *= 1 - (Number(runtime.api.getMarketTaxRate?.(itemHrid)) || 0);
    }
  }
  return Number(value) > 0 ? Number(value) : null;
}

function getPriceInfo(itemHrid, kind, mode) {
  const direct = getDirectPrice(itemHrid, kind, mode);
  if (direct !== null || kind !== "sell") {
    return {
      value: direct,
      source: direct === null ? "missing" : "market",
      complete: direct !== null,
      missingItemHrids: direct === null ? [itemHrid] : [],
    };
  }
  const derived = runtime.api.getAssetLiquidationValue?.(itemHrid, 0, mode);
  if (!(Number(derived?.value) > 0)) {
    return {
      value: null,
      source: "missing",
      complete: false,
      missingItemHrids: derived?.missingItemHrids ?? [itemHrid],
    };
  }
  return {
    value: Number(derived.value),
    source: derived.source === "market" ? "market" : "derived",
    complete: Boolean(derived.complete),
    missingItemHrids: derived.missingItemHrids ?? [],
  };
}

function getPrice(itemHrid, kind, mode) {
  return getPriceInfo(itemHrid, kind, mode).value;
}

function expectedDropCount(drop) {
  const minimum = Number(drop?.minCount ?? drop?.count ?? 0) || 0;
  const maximum = Number(drop?.maxCount ?? drop?.count ?? minimum) || 0;
  const rate = Number(drop?.dropRate ?? 1) || 0;
  return rate * ((minimum + maximum) / 2);
}

function getOptionalOutputs(actionHrid, detail) {
  const essenceFind = Math.max(
    0,
    Number(getActionBuffRatio(actionHrid, BUFF_TYPES.essenceFind)) || 0,
  );
  const rareFind = Math.max(
    0,
    Number(getActionBuffRatio(actionHrid, BUFF_TYPES.rareFind)) || 0,
  );
  return [
    ...asArray(detail?.essenceDropTable).map((drop) => ({
      itemHrid: drop.itemHrid,
      count: expectedDropCount(drop) * (1 + essenceFind),
      baseCount: expectedDropCount(drop),
      findBonus: essenceFind,
      kind: "essence",
    })),
    ...asArray(detail?.rareDropTable).map((drop) => ({
      itemHrid: drop.itemHrid,
      count: expectedDropCount(drop) * (1 + rareFind),
      baseCount: expectedDropCount(drop),
      findBonus: rareFind,
      kind: "rare",
    })),
  ];
}

function resolveProductionActionByItemHrid(itemHrid) {
  const target = String(itemHrid ?? "");
  if (!target) return null;
  const matches = Object.entries(
    runtime.state.initData_actionDetailMap ?? {},
  ).filter(
    ([, detail]) =>
      PROFIT_ACTION_TYPES.has(detail?.type) &&
      getExpectedOutputs(detail).some(
        (output) => output?.itemHrid === target && Number(output.count) > 0,
      ),
  );
  if (!matches.length) return null;
  const slug = target.split("/").at(-1);
  const exact = matches.find(([actionHrid]) => actionHrid.endsWith(`/${slug}`));
  if (exact) return exact[0];
  matches.sort(
    ([leftHrid, left], [rightHrid, right]) =>
      (Number(left?.sortIndex) || 0) - (Number(right?.sortIndex) || 0) ||
      leftHrid.localeCompare(rightHrid),
  );
  return matches[0][0];
}

function projectAction(actionOrHrid, requestedCount, context = {}) {
  const action =
    typeof actionOrHrid === "string"
      ? { actionHrid: actionOrHrid }
      : (actionOrHrid ?? {});
  const actionHrid = action.actionHrid ?? action.hrid;
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  if (!actionHrid || !detail) {
    return { status: "waiting", actionHrid, missing: ["actionData"] };
  }

  const count =
    requestedCount === undefined
      ? getActionCount(action)
      : Number(requestedCount);
  const infinite = count === Infinity || !Number.isFinite(count);
  const normalizedCount = infinite ? Infinity : Math.max(0, count);
  const respectInventoryLimit =
    context.respectInventoryLimit ??
    (requestedCount === undefined && typeof actionOrHrid !== "string");
  if (!isPlayerDataReady()) {
    return {
      status: "waiting",
      actionHrid,
      detail,
      count: normalizedCount,
      infinite,
      effectiveCount: normalizedCount,
      effectivelyInfinite: infinite,
      materialLimited: false,
      missing: ["playerData"],
      missingPrices: [],
      netProfitPerAction: null,
      profitPerHour: null,
      totalProfit: null,
      totalSeconds: null,
    };
  }

  const timing = getEffectiveSeconds(actionHrid, detail, context);
  const teaEffects = getEffectiveTeaEffects(actionHrid);
  if (!teaEffects) {
    return {
      status: "waiting",
      actionHrid,
      detail,
      count: normalizedCount,
      infinite,
      effectiveCount: normalizedCount,
      effectivelyInfinite: infinite,
      materialLimited: false,
      missing: ["playerData"],
      missingPrices: [],
      netProfitPerAction: null,
      profitPerHour: null,
      totalProfit: null,
      totalSeconds: null,
    };
  }

  const secondsPerAction = timing?.secondsPerAction ?? null;
  const inputs = getDirectInputs(detail);
  const outputs = getEffectiveOutputs(detail, teaEffects);
  const lessResource = teaEffects.lessResource;

  const alchemyCapacity = getAlchemyCapacity(action, detail, lessResource);
  if (alchemyCapacity && !alchemyCapacity.known) {
    return {
      status: "waiting",
      actionHrid,
      detail,
      count: normalizedCount,
      infinite,
      effectiveCount: null,
      effectivelyInfinite: false,
      materialLimited: false,
      maxCraftable: null,
      missing: alchemyCapacity.missing,
      missingPrices: [],
      netProfitPerAction: null,
      profitPerHour: null,
      totalProfit: null,
      secondsPerAction,
      totalSeconds: null,
      finishAt: null,
    };
  }

  let maxCraftable = alchemyCapacity?.maxCraftable ?? Infinity;
  if (!alchemyCapacity) {
    for (const input of inputs) {
      const effectiveCount = getEffectiveInputCount(input, lessResource);
      if (effectiveCount > 0) {
        maxCraftable = Math.min(
          maxCraftable,
          Math.floor(getInventoryCount(input.itemHrid) / effectiveCount),
        );
      }
    }
    if (!inputs.length) maxCraftable = Infinity;
  }

  const canApplyInventoryLimit =
    respectInventoryLimit &&
    (Boolean(alchemyCapacity) || !(infinite && maxCraftable === 0));
  const executableCount = canApplyInventoryLimit
    ? Math.min(normalizedCount, maxCraftable)
    : normalizedCount;
  const effectivelyInfinite = !Number.isFinite(executableCount);
  const materialLimited =
    respectInventoryLimit &&
    (inputs.length > 0 || Boolean(alchemyCapacity)) &&
    Number.isFinite(maxCraftable) &&
    maxCraftable > 0 &&
    (infinite || maxCraftable < normalizedCount);

  const valuationMode = "fair";
  const optionalOutputs = getOptionalOutputs(actionHrid, detail);
  const actionsPerHour = secondsPerAction ? 3600 / secondsPerAction : null;

  function calculateValuation(mode) {
    const missingPrices = [];
    const unpricedByproducts = [];
    const derivedMissingPrices = [];
    const materialCostPerAction = inputs.reduce((total, input) => {
      const effectiveCount = getEffectiveInputCount(input, lessResource);
      const price = getPrice(input.itemHrid, "buy", mode);
      if (price === null) missingPrices.push(input.itemHrid);
      return total + (price === null ? 0 : effectiveCount * price);
    }, 0);
    const primaryRevenuePerAction = outputs.reduce((total, output) => {
      const effectiveCount = output.count;
      const priceInfo = getPriceInfo(output.itemHrid, "sell", mode);
      if (priceInfo.value === null) missingPrices.push(output.itemHrid);
      if (!priceInfo.complete && priceInfo.value !== null) {
        derivedMissingPrices.push(...priceInfo.missingItemHrids);
      }
      return (
        total +
        (priceInfo.value === null ? 0 : effectiveCount * priceInfo.value)
      );
    }, 0);
    const byproductRevenuePerAction = optionalOutputs.reduce(
      (total, output) => {
        const priceInfo = getPriceInfo(output.itemHrid, "sell", mode);
        if (priceInfo.value === null) unpricedByproducts.push(output.itemHrid);
        if (!priceInfo.complete && priceInfo.value !== null) {
          derivedMissingPrices.push(...priceInfo.missingItemHrids);
        }
        return (
          total +
          (priceInfo.value === null ? 0 : output.count * priceInfo.value)
        );
      },
      0,
    );
    let teaCostPerHour = 0;
    for (const drink of teaEffects.drinks) {
      const price = getPrice(drink.itemHrid, "buy", mode);
      if (price === null) missingPrices.push(drink.itemHrid);
      const countPerHour = DRINKS_PER_HOUR * teaEffects.concentrationMultiplier;
      teaCostPerHour += price === null ? 0 : price * countPerHour;
    }
    const teaCostPerAction = actionsPerHour
      ? teaCostPerHour / actionsPerHour
      : 0;
    const revenuePerAction =
      primaryRevenuePerAction + byproductRevenuePerAction;
    const complete = missingPrices.length === 0 && secondsPerAction !== null;
    const netProfitPerAction = complete
      ? revenuePerAction - materialCostPerAction - teaCostPerAction
      : null;
    const profitPerHour =
      netProfitPerAction === null || !actionsPerHour
        ? null
        : netProfitPerAction * actionsPerHour;
    const totalProfit =
      netProfitPerAction === null || effectivelyInfinite
        ? null
        : netProfitPerAction * executableCount;
    return {
      mode,
      complete,
      materialCostPerAction,
      teaCostPerHour,
      teaCostPerAction,
      primaryRevenuePerAction,
      byproductRevenuePerAction,
      revenuePerAction,
      netProfitPerAction,
      profitPerHour,
      totalProfit,
      missingPrices: [...new Set(missingPrices)],
      unpricedByproducts: [...new Set(unpricedByproducts)],
      derivedMissingPrices: [...new Set(derivedMissingPrices)],
    };
  }

  const valuations = Object.fromEntries(
    [...PROFIT_VALUATION_MODES].map((mode) => [mode, calculateValuation(mode)]),
  );
  const selectedValuation = valuations[valuationMode];
  const missingPrices = selectedValuation.missingPrices;
  const inputDetails = inputs.map((input) => {
    const effectiveCount = getEffectiveInputCount(input, lessResource);
    const unitPrice = getPrice(input.itemHrid, "buy", valuationMode);
    return {
      ...input,
      effectiveCount,
      owned: getInventoryCount(input.itemHrid),
      unitPrice,
      valuePerAction: unitPrice === null ? null : effectiveCount * unitPrice,
    };
  });
  const outputDetails = outputs.map((output) => {
    const effectiveCount = output.count;
    const priceInfo = getPriceInfo(output.itemHrid, "sell", valuationMode);
    const unitPrice = priceInfo.value;
    return {
      ...output,
      baseCount: output.baseCount ?? output.count,
      effectiveCount,
      expectedCount:
        effectiveCount * (effectivelyInfinite ? 1 : executableCount),
      kind: "primary",
      owned: getInventoryCount(output.itemHrid),
      unitPrice,
      valueSource: priceInfo.source,
      derivedMissingPrices: priceInfo.missingItemHrids,
      valuePerAction: unitPrice === null ? null : effectiveCount * unitPrice,
    };
  });
  const unpricedByproducts = selectedValuation.unpricedByproducts;
  const byproductOutputs = optionalOutputs.map((output) => {
    const priceInfo = getPriceInfo(output.itemHrid, "sell", valuationMode);
    const unitPrice = priceInfo.value;
    return {
      ...output,
      effectiveCount: output.count,
      expectedCount: output.count * (effectivelyInfinite ? 1 : executableCount),
      owned: getInventoryCount(output.itemHrid),
      unitPrice,
      valueSource: priceInfo.source,
      derivedMissingPrices: priceInfo.missingItemHrids,
      valuePerAction: unitPrice === null ? null : output.count * unitPrice,
    };
  });

  const drinks = teaEffects.drinks.map((drink) => {
    const price = getPrice(drink.itemHrid, "buy", valuationMode);
    const countPerHour = DRINKS_PER_HOUR * teaEffects.concentrationMultiplier;
    const costPerHour = price === null ? null : price * countPerHour;
    return {
      ...drink,
      countPerHour,
      costPerHour,
      unitPrice: price,
    };
  });
  const complete = selectedValuation.complete;
  let totalSeconds = null;
  if (effectivelyInfinite) {
    totalSeconds = Infinity;
  } else if (secondsPerAction !== null) {
    const liveDuration = Number(context.durationPerAction);
    if (Number.isFinite(liveDuration) && liveDuration > 0) {
      const cycles = Math.max(
        executableCount > 0 ? 1 : 0,
        Math.round(executableCount / getEfficiencyMultiplier(actionHrid)),
      );
      const currentCycleRemaining = Number(
        context.currentCycleRemainingSeconds,
      );
      totalSeconds =
        cycles > 0 &&
        Number.isFinite(currentCycleRemaining) &&
        currentCycleRemaining >= 0
          ? Math.min(liveDuration, currentCycleRemaining) +
            Math.max(0, cycles - 1) * liveDuration
          : cycles * liveDuration;
    } else {
      totalSeconds = executableCount * secondsPerAction;
    }
  }
  const now = Number(context.now ?? Date.now());

  return {
    status: complete ? "complete" : "incomplete",
    isPartial:
      complete &&
      (unpricedByproducts.length > 0 ||
        selectedValuation.derivedMissingPrices.length > 0),
    actionHrid,
    detail,
    count: normalizedCount,
    infinite,
    effectiveCount: executableCount,
    effectivelyInfinite,
    materialLimited,
    respectsInventoryLimit: Boolean(respectInventoryLimit),
    secondsPerAction,
    totalSeconds,
    finishAt:
      Number.isFinite(totalSeconds) && totalSeconds !== null
        ? now + totalSeconds * 1000
        : null,
    inputs: inputDetails,
    outputs: outputDetails,
    byproductOutputs,
    actionsPerHour,
    baseSeconds: timing?.baseSeconds ?? null,
    cycleSeconds: timing?.cycleSeconds ?? null,
    efficiencyPercent: timing?.efficiencyPercent ?? 0,
    speedPercent: timing?.speedPercent ?? 0,
    timingSource: timing?.timingSource ?? null,
    teaEffects: { ...teaEffects, drinks },
    maxCraftable,
    valuationMode,
    valuations,
    materialCostPerAction: selectedValuation.materialCostPerAction,
    teaCostPerHour: selectedValuation.teaCostPerHour,
    teaCostPerAction: selectedValuation.teaCostPerAction,
    primaryRevenuePerAction: selectedValuation.primaryRevenuePerAction,
    byproductRevenuePerAction: selectedValuation.byproductRevenuePerAction,
    revenuePerAction: selectedValuation.revenuePerAction,
    netProfitPerAction: selectedValuation.netProfitPerAction,
    profitPerHour: selectedValuation.profitPerHour,
    totalProfit: selectedValuation.totalProfit,
    missingPrices,
    unpricedByproducts,
    derivedMissingPrices: selectedValuation.derivedMissingPrices,
  };
}

function projectQueue(
  actions = runtime.state.currentActionsHridList,
  context = {},
) {
  const now = Number(context.now ?? Date.now());
  let elapsed = 0;
  let hasInfinite = false;
  const items = [];
  for (const action of actions ?? []) {
    const projection = projectAction(action, undefined, { ...context, now });
    const startsAt = hasInfinite ? null : now + elapsed * 1000;
    if (Number.isFinite(projection.totalSeconds) && !hasInfinite) {
      elapsed += projection.totalSeconds;
    } else {
      hasInfinite = true;
    }
    items.push({
      ...projection,
      action,
      startsAt,
      cumulativeFinishAt: hasInfinite ? null : now + elapsed * 1000,
    });
  }
  return {
    items,
    totalSeconds: hasInfinite ? Infinity : elapsed,
    finishAt: hasInfinite ? null : now + elapsed * 1000,
    hasInfinite,
  };
}

Object.assign(runtime.api, {
  getActionBuffRatio,
  getActionSpeedPercent,
  getDrinkConcentrationMultiplier,
  getEffectiveTeaEffects,
  getInventoryCount,
  getExpectedOutputs,
  getDirectInputs,
  getActionRemainingCount: getActionCount,
  isPlayerProjectionDataReady: isPlayerDataReady,
  projectActionCraftingCost,
  projectAction,
  projectQueue,
  resolveProductionActionByItemHrid,
});
