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

function getDirectInputs(detail) {
  const inputs = asArray(detail?.inputItems).map((item) => ({
    itemHrid: item.itemHrid,
    count: Number(item.count) || 0,
    isUpgradeItem: false,
  }));
  if (detail?.upgradeItemHrid) {
    inputs.push({
      itemHrid: detail.upgradeItemHrid,
      count: 1,
      isUpgradeItem: true,
    });
  }
  return inputs;
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

function getPrice(itemHrid, kind, optimistic = false) {
  // Pessimistic (immediate execution): buy inputs at ask, sell outputs at the
  // net bid. Optimistic (patient limit orders): buy inputs at bid, sell outputs
  // at the net ask. The optimistic side is the reachable upper bound when the
  // player is willing to wait for their own orders to fill.
  let value;
  if (kind === "sell") {
    value = optimistic
      ? runtime.api.getNetSellPriceAtAsk?.(itemHrid, 0)
      : runtime.api.getNetSellPrice?.(itemHrid, 0);
  } else {
    value = optimistic
      ? runtime.api.getBidPrice?.(itemHrid, 0)
      : runtime.api.getAskPrice?.(itemHrid, 0);
  }
  return Number(value) > 0 ? Number(value) : null;
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
  ).filter(([, detail]) =>
    asArray(detail?.outputItems).some((output) => output?.itemHrid === target),
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
  const outputs = getExpectedOutputs(detail);
  const lessResource = teaEffects.lessResource;
  const quantityBonus = teaEffects.quantity;

  let maxCraftable = Infinity;
  for (const input of inputs) {
    const effectiveCount =
      input.count * (input.isUpgradeItem ? 1 : 1 - lessResource);
    if (effectiveCount > 0) {
      maxCraftable = Math.min(
        maxCraftable,
        Math.floor(getInventoryCount(input.itemHrid) / effectiveCount),
      );
    }
  }
  if (!inputs.length) maxCraftable = Infinity;

  const executableCount = respectInventoryLimit
    ? Math.min(normalizedCount, maxCraftable)
    : normalizedCount;
  const effectivelyInfinite = !Number.isFinite(executableCount);
  const materialLimited =
    respectInventoryLimit &&
    inputs.length > 0 &&
    Number.isFinite(maxCraftable) &&
    (infinite || maxCraftable < normalizedCount);

  const missingPrices = [];
  const inputDetails = inputs.map((input) => {
    const effectiveCount =
      input.count * (input.isUpgradeItem ? 1 : 1 - lessResource);
    const unitPrice = getPrice(input.itemHrid, "buy");
    if (unitPrice === null) missingPrices.push(input.itemHrid);
    return {
      ...input,
      effectiveCount,
      owned: getInventoryCount(input.itemHrid),
      unitPrice,
      valuePerAction: unitPrice === null ? null : effectiveCount * unitPrice,
    };
  });
  const materialCostPerAction = inputDetails.reduce(
    (total, input) => total + (input.valuePerAction ?? 0),
    0,
  );

  const outputDetails = outputs.map((output) => {
    const effectiveCount = output.count * (1 + quantityBonus);
    const unitPrice = getPrice(output.itemHrid, "sell");
    if (unitPrice === null) missingPrices.push(output.itemHrid);
    return {
      ...output,
      baseCount: output.count,
      effectiveCount,
      expectedCount:
        effectiveCount * (effectivelyInfinite ? 1 : executableCount),
      kind: "primary",
      owned: getInventoryCount(output.itemHrid),
      unitPrice,
      valuePerAction: unitPrice === null ? null : effectiveCount * unitPrice,
    };
  });
  const primaryRevenuePerAction = outputDetails.reduce(
    (total, output) => total + (output.valuePerAction ?? 0),
    0,
  );

  const unpricedByproducts = [];
  const byproductOutputs = getOptionalOutputs(actionHrid, detail).map(
    (output) => {
      const unitPrice = getPrice(output.itemHrid, "sell");
      if (unitPrice === null) unpricedByproducts.push(output.itemHrid);
      return {
        ...output,
        effectiveCount: output.count,
        expectedCount:
          output.count * (effectivelyInfinite ? 1 : executableCount),
        owned: getInventoryCount(output.itemHrid),
        unitPrice,
        valuePerAction: unitPrice === null ? null : output.count * unitPrice,
      };
    },
  );
  const byproductRevenuePerAction = byproductOutputs.reduce(
    (total, output) => total + (output.valuePerAction ?? 0),
    0,
  );
  const revenuePerAction = primaryRevenuePerAction + byproductRevenuePerAction;

  let teaCostPerHour = 0;
  const drinks = teaEffects.drinks.map((drink) => {
    const price = getPrice(drink.itemHrid, "buy");
    if (price === null) missingPrices.push(drink.itemHrid);
    const countPerHour = DRINKS_PER_HOUR * teaEffects.concentrationMultiplier;
    const costPerHour = price === null ? null : price * countPerHour;
    teaCostPerHour += costPerHour ?? 0;
    return {
      ...drink,
      countPerHour,
      costPerHour,
      unitPrice: price,
    };
  });
  const actionsPerHour = secondsPerAction ? 3600 / secondsPerAction : null;
  const teaCostPerAction = actionsPerHour ? teaCostPerHour / actionsPerHour : 0;
  const complete = missingPrices.length === 0 && secondsPerAction !== null;
  const netProfitPerAction = complete
    ? revenuePerAction - materialCostPerAction - teaCostPerAction
    : null;

  // Optimistic bound: same quantities, priced as if every buy fills at bid and
  // every sell fills at ask (patient limit orders). The pessimistic figures
  // above stay the headline numbers; this only adds an upper bound.
  const sumValue = (items, kind) =>
    items.reduce((total, item) => {
      const price = getPrice(item.itemHrid, kind, true);
      return total + (price === null ? 0 : (item.effectiveCount ?? 0) * price);
    }, 0);
  const optimisticMaterialCostPerAction = sumValue(inputDetails, "buy");
  const optimisticRevenuePerAction =
    sumValue(outputDetails, "sell") + sumValue(byproductOutputs, "sell");
  let optimisticTeaCostPerHour = 0;
  for (const drink of drinks) {
    const price = getPrice(drink.itemHrid, "buy", true);
    optimisticTeaCostPerHour += price === null ? 0 : price * drink.countPerHour;
  }
  const optimisticTeaCostPerAction = actionsPerHour
    ? optimisticTeaCostPerHour / actionsPerHour
    : 0;
  const optimisticNetProfitPerAction = complete
    ? optimisticRevenuePerAction -
      optimisticMaterialCostPerAction -
      optimisticTeaCostPerAction
    : null;
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
    isPartial: complete && unpricedByproducts.length > 0,
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
    materialCostPerAction,
    teaCostPerHour,
    teaCostPerAction,
    primaryRevenuePerAction,
    byproductRevenuePerAction,
    revenuePerAction,
    netProfitPerAction,
    profitPerHour:
      netProfitPerAction === null || !actionsPerHour
        ? null
        : netProfitPerAction * actionsPerHour,
    totalProfit:
      netProfitPerAction === null || effectivelyInfinite
        ? null
        : netProfitPerAction * executableCount,
    optimistic: {
      materialCostPerAction: optimisticMaterialCostPerAction,
      revenuePerAction: optimisticRevenuePerAction,
      teaCostPerHour: optimisticTeaCostPerHour,
      teaCostPerAction: optimisticTeaCostPerAction,
      netProfitPerAction: optimisticNetProfitPerAction,
      profitPerHour:
        optimisticNetProfitPerAction === null || !actionsPerHour
          ? null
          : optimisticNetProfitPerAction * actionsPerHour,
      totalProfit:
        optimisticNetProfitPerAction === null || effectivelyInfinite
          ? null
          : optimisticNetProfitPerAction * executableCount,
    },
    missingPrices: [...new Set(missingPrices)],
    unpricedByproducts: [...new Set(unpricedByproducts)],
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
  projectAction,
  projectQueue,
  resolveProductionActionByItemHrid,
});
