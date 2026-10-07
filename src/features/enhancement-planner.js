import { runtime } from "../core/runtime.js";

export const ENHANCEMENT_PROFILE = Object.freeze({
  playerLevel: 140,
  houseLevel: 8,
  tool: { hrid: "/items/celestial_enhancer", enhancementLevel: 14 },
  top: { hrid: "/items/enhancers_top", enhancementLevel: 10 },
  bottoms: { hrid: "/items/enhancers_bottoms", enhancementLevel: 10 },
  gloves: { hrid: "/items/enchanted_gloves", enhancementLevel: 10 },
  cape: { hrid: "/items/chance_cape_refined", enhancementLevel: 5 },
  teas: ["/items/ultra_enhancing_tea", "/items/blessed_tea"],
  ultraTeaLevel: 8,
  ultraTeaSpeed: 0.06,
  blessedChance: 0.01,
  houseSpeedPerLevel: 0.01,
  houseSuccessPerLevel: 0.0005,
  baseActionSeconds: 12,
  teaDurationSeconds: 300,
});

export const DEFAULT_ENHANCEMENT_SIMULATION_PROFILE = Object.freeze({
  baseCostMode: "acquisition_cost",
  playerLevel: 136,
  houseLevel: 8,
  enhancerBonusPercent: 5.26,
  gearSpeedBonusPercent: 37.22,
  teaType: "ultra_enhancing_tea",
  blessedTea: true,
  timeFeePerHour: 0,
  taxRatePercent: 2,
});

const DEFAULT_SUCCESS_RATES = [
  0.5, 0.45, 0.45, 0.4, 0.4, 0.4, 0.35, 0.35, 0.35, 0.35, 0.3, 0.3, 0.3, 0.3,
  0.3, 0.3, 0.3, 0.3, 0.3, 0.3,
];

const DEFAULT_BONUS_MULTIPLIERS = [
  0, 1, 2.1, 3.3, 4.6, 6, 7.5, 9.1, 10.8, 12.6, 14.5, 16.7, 19.2, 22, 25.1,
  28.5, 32.2, 36.2, 40.5, 45.1, 50,
];

const EPSILON = 1e-9;
const ENHANCEMENT_FLOW_CACHE_LIMIT = 4096;
const enhancementFlowCache = new Map();
let enhancementFlowCacheWeight = 0;

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizedTable(source, fallback) {
  if (!source) return fallback;
  const values = Array.isArray(source)
    ? source
    : Object.keys(source)
        .sort((left, right) => Number(left) - Number(right))
        .map((key) => source[key]);
  return values.length ? values.map(Number) : fallback;
}

function entriesOfMap(value) {
  return value instanceof Map
    ? [...value.entries()]
    : Object.entries(value ?? {});
}

function nonTradableCoinShopPrice(itemHrid, itemDetailMap, shopItemDetailMap) {
  if (itemDetailMap?.[itemHrid]?.isTradable === true) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (const [, detail] of entriesOfMap(shopItemDetailMap)) {
    if (detail?.itemHrid !== itemHrid) continue;
    const costs = Array.isArray(detail.costs) ? detail.costs : [];
    if (
      costs.length !== 1 ||
      costs[0]?.itemHrid !== "/items/coin" ||
      !(Number(costs[0]?.count) > 0)
    ) {
      continue;
    }
    best = Math.min(best, Number(costs[0].count));
  }
  return Number.isFinite(best) ? best : 0;
}

function charmRecipe(itemHrid, actionDetailMap) {
  return entriesOfMap(actionDetailMap)
    .map(([fallbackHrid, detail]) => ({
      actionHrid: detail?.hrid ?? fallbackHrid,
      detail,
    }))
    .find(({ detail }) =>
      detail?.outputItems?.some((output) => output.itemHrid === itemHrid),
    );
}

function projectedCharmRecipe(recipe, itemHrid, projectAction) {
  if (!recipe || typeof projectAction !== "function") return null;
  const projection = projectAction(recipe.actionHrid, 1, {
    respectInventoryLimit: false,
  });
  if (
    !["complete", "incomplete"].includes(projection?.status) ||
    !Array.isArray(projection.inputs)
  ) {
    return null;
  }
  const outputCount = projection.outputs
    ?.filter((output) => output.itemHrid === itemHrid)
    .reduce(
      (total, output) =>
        total + finitePositive(output.effectiveCount ?? output.count),
      0,
    );
  const fallbackOutputCount = recipe.detail.outputItems
    .filter((output) => output.itemHrid === itemHrid)
    .reduce((total, output) => total + finitePositive(output.count), 0);
  const actionsPerHour = finitePositive(projection.actionsPerHour);
  const teaInputs = [];
  for (const drink of projection.teaEffects?.drinks ?? []) {
    const count = actionsPerHour
      ? finitePositive(drink.countPerHour) / actionsPerHour
      : 0;
    if (drink.itemHrid && count > 0) {
      teaInputs.push({ itemHrid: drink.itemHrid, count });
    }
  }
  return {
    outputCount: finitePositive(outputCount) || fallbackOutputCount,
    inputs: projection.inputs.map((input) => ({
      itemHrid: input.itemHrid,
      count: finitePositive(input.effectiveCount),
    })),
    teaInputs,
  };
}

function charmBaseCost({
  itemHrid,
  actionDetailMap,
  projectAction,
  resolveLeafPrice,
  visited = new Set(),
}) {
  if (!itemHrid || visited.has(itemHrid)) return 0;
  const recipe = charmRecipe(itemHrid, actionDetailMap);
  if (!recipe) return resolveLeafPrice(itemHrid);
  const projected = projectedCharmRecipe(recipe, itemHrid, projectAction);
  if (!projected?.outputCount) return 0;

  const nextVisited = new Set(visited).add(itemHrid);
  let totalCost = 0;
  for (const input of projected.inputs) {
    if (!input.itemHrid || !(input.count > 0)) continue;
    const unitPrice = input.itemHrid.endsWith("_charm")
      ? charmBaseCost({
          itemHrid: input.itemHrid,
          actionDetailMap,
          projectAction,
          resolveLeafPrice,
          visited: nextVisited,
        })
      : resolveLeafPrice(input.itemHrid);
    if (!(unitPrice > 0)) return 0;
    totalCost += input.count * unitPrice;
  }
  for (const tea of projected.teaInputs) {
    const unitPrice = resolveLeafPrice(tea.itemHrid);
    if (!(unitPrice > 0)) return 0;
    totalCost += tea.count * unitPrice;
  }
  return totalCost > 0 ? totalCost / projected.outputCount : 0;
}

function successRateAt(table, level) {
  const value = Number(table[level] ?? table.at(-1));
  if (!Number.isFinite(value)) return 0;
  return value > 1 ? value / 100 : value;
}

function enhancementFlowProfileKey({
  targetLevel,
  successRates,
  successBonus,
  blessedChance,
}) {
  const target = Math.max(0, Math.floor(Number(targetLevel) || 0));
  const bonus = Number(successBonus) || 0;
  const blessed = Number(blessedChance) || 0;
  const effectiveSuccessRates = Array.from({ length: target }, (_, level) =>
    Math.min(1, successRateAt(successRates, level) * (1 + bonus)),
  );
  return `${target}|${blessed}|${effectiveSuccessRates.join(",")}`;
}

function freezeEnhancementFlow(flow) {
  if (!flow) return null;
  return Object.freeze({
    ...flow,
    actionsByLevel: Object.freeze([...(flow.actionsByLevel ?? [])]),
  });
}

function cloneEnhancementFlow(flow) {
  return flow
    ? { ...flow, actionsByLevel: [...(flow.actionsByLevel ?? [])] }
    : null;
}

function cachedEnhancementValue(key, weight, calculate) {
  if (enhancementFlowCache.has(key)) {
    const cached = enhancementFlowCache.get(key);
    enhancementFlowCache.delete(key);
    enhancementFlowCache.set(key, cached);
    return cached.value;
  }
  const normalizedWeight = Math.max(1, Math.floor(Number(weight) || 1));
  const value = calculate();
  enhancementFlowCache.set(key, { value, weight: normalizedWeight });
  enhancementFlowCacheWeight += normalizedWeight;
  while (enhancementFlowCacheWeight > ENHANCEMENT_FLOW_CACHE_LIMIT) {
    const oldestKey = enhancementFlowCache.keys().next().value;
    const oldest = enhancementFlowCache.get(oldestKey);
    enhancementFlowCache.delete(oldestKey);
    enhancementFlowCacheWeight -= oldest?.weight ?? 0;
  }
  return value;
}

function cachedEnhancementFlow(key, calculate) {
  return cachedEnhancementValue(key, 1, () =>
    freezeEnhancementFlow(calculate()),
  );
}

function solveLinearSystem(matrix, vector) {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [
    ...row.map(Number),
    Number(vector[index]),
  ]);

  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (
        Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])
      ) {
        pivot = row;
      }
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) return null;
    if (pivot !== column) {
      [augmented[pivot], augmented[column]] = [
        augmented[column],
        augmented[pivot],
      ];
    }

    const divisor = augmented[column][column];
    for (let index = column; index <= size; index++) {
      augmented[column][index] /= divisor;
    }
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (Math.abs(factor) < 1e-15) continue;
      for (let index = column; index <= size; index++) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }

  const result = augmented.map((row) => row[size]);
  return result.every(Number.isFinite) ? result : null;
}

function equipmentStat(itemMap, bonusTable, equipment, stat) {
  const detail = itemMap?.[equipment.hrid]?.equipmentDetail;
  const base = Number(detail?.noncombatStats?.[stat]);
  const perMultiplier = Number(
    detail?.noncombatEnhancementBonuses?.[stat] ?? 0,
  );
  const multiplier = Number(bonusTable[equipment.enhancementLevel]);
  if (!Number.isFinite(base) || !Number.isFinite(multiplier)) return null;
  return base + perMultiplier * multiplier;
}

export function getEnhancementProfileStats({
  itemLevel,
  itemDetailMap = runtime.state.initData_itemDetailMap,
  bonusMultiplierTable = runtime.state
    .initData_enhancementLevelTotalBonusMultiplierTable,
  simulationProfile = null,
} = {}) {
  if (simulationProfile) {
    const targetItemLevel = Number(itemLevel);
    if (!Number.isFinite(targetItemLevel) || targetItemLevel <= 0) {
      return null;
    }
    const teaLevelBonus =
      {
        enhancing_tea: 3,
        super_enhancing_tea: 6,
        ultra_enhancing_tea: 8,
      }[simulationProfile.teaType] ?? 0;
    const playerLevel = Number(simulationProfile.playerLevel) || 0;
    const houseLevel = Number(simulationProfile.houseLevel) || 0;
    const effectiveLevel = playerLevel + teaLevelBonus;
    const levelSuccess =
      effectiveLevel >= targetItemLevel
        ? (effectiveLevel + houseLevel - targetItemLevel) * 0.0005
        : -0.5 * (1 - effectiveLevel / targetItemLevel) + houseLevel * 0.0005;
    const successBonus =
      levelSuccess +
      (Number(simulationProfile.enhancerBonusPercent) || 0) / 100;
    const speedBonus =
      (houseLevel +
        (Number(simulationProfile.gearSpeedBonusPercent) || 0) +
        (effectiveLevel > targetItemLevel
          ? effectiveLevel - targetItemLevel
          : 0)) /
      100;
    return {
      effectiveLevel,
      toolSuccess: (Number(simulationProfile.enhancerBonusPercent) || 0) / 100,
      gloveSpeed: (Number(simulationProfile.gearSpeedBonusPercent) || 0) / 100,
      topSpeed: 0,
      bottomsSpeed: 0,
      capeSpeed: 0,
      successBonus,
      speedBonus,
      blessedChance: simulationProfile.blessedTea ? 0.01 : 0,
      secondsPerAction:
        ENHANCEMENT_PROFILE.baseActionSeconds / (1 + speedBonus),
    };
  }

  const bonusTable = normalizedTable(
    bonusMultiplierTable,
    DEFAULT_BONUS_MULTIPLIERS,
  );
  const toolSuccess = equipmentStat(
    itemDetailMap,
    bonusTable,
    ENHANCEMENT_PROFILE.tool,
    "enhancingSuccess",
  );
  const gloveSpeed = equipmentStat(
    itemDetailMap,
    bonusTable,
    ENHANCEMENT_PROFILE.gloves,
    "enhancingSpeed",
  );
  const topSpeed = equipmentStat(
    itemDetailMap,
    bonusTable,
    ENHANCEMENT_PROFILE.top,
    "enhancingSpeed",
  );
  const bottomsSpeed = equipmentStat(
    itemDetailMap,
    bonusTable,
    ENHANCEMENT_PROFILE.bottoms,
    "enhancingSpeed",
  );
  const capeSpeed = equipmentStat(
    itemDetailMap,
    bonusTable,
    ENHANCEMENT_PROFILE.cape,
    "enhancingSpeed",
  );
  const targetItemLevel = Number(itemLevel);
  if (
    toolSuccess === null ||
    topSpeed === null ||
    bottomsSpeed === null ||
    gloveSpeed === null ||
    capeSpeed === null ||
    !Number.isFinite(targetItemLevel) ||
    targetItemLevel <= 0
  ) {
    return null;
  }

  const effectiveLevel =
    ENHANCEMENT_PROFILE.playerLevel + ENHANCEMENT_PROFILE.ultraTeaLevel;
  const levelSuccess =
    effectiveLevel >= targetItemLevel
      ? (effectiveLevel - targetItemLevel) * 0.0005
      : -0.5 * (1 - effectiveLevel / targetItemLevel);
  const successBonus =
    levelSuccess +
    toolSuccess +
    ENHANCEMENT_PROFILE.houseLevel * ENHANCEMENT_PROFILE.houseSuccessPerLevel;
  const speedBonus =
    gloveSpeed +
    topSpeed +
    bottomsSpeed +
    capeSpeed +
    ENHANCEMENT_PROFILE.houseLevel * ENHANCEMENT_PROFILE.houseSpeedPerLevel +
    ENHANCEMENT_PROFILE.ultraTeaSpeed +
    Math.max(0, effectiveLevel - targetItemLevel) * 0.01;

  return {
    effectiveLevel,
    toolSuccess,
    gloveSpeed,
    topSpeed,
    bottomsSpeed,
    capeSpeed,
    successBonus,
    speedBonus,
    blessedChance: ENHANCEMENT_PROFILE.blessedChance,
    secondsPerAction: ENHANCEMENT_PROFILE.baseActionSeconds / (1 + speedBonus),
  };
}

function addTransition(matrix, from, to, rate, targetLevel) {
  if (rate <= 0 || to >= targetLevel) return;
  matrix[to][from] -= rate;
}

function calculateNormalEnhancementFlowUncached({
  targetLevel,
  protectLevel,
  successRates = DEFAULT_SUCCESS_RATES,
  successBonus,
  blessedChance,
}) {
  if (targetLevel < 1) return null;
  const matrix = Array.from({ length: targetLevel }, (_, row) =>
    Array.from({ length: targetLevel }, (_, column) =>
      row === column ? 1 : 0,
    ),
  );
  const source = Array(targetLevel).fill(0);
  source[0] = 1;
  const failRates = [];

  for (let level = 0; level < targetLevel; level++) {
    const success = Math.min(
      1,
      successRateAt(successRates, level) * (1 + successBonus),
    );
    const fail = Math.max(0, 1 - success);
    failRates[level] = fail;
    addTransition(
      matrix,
      level,
      level + 1,
      success * (1 - blessedChance),
      targetLevel,
    );
    addTransition(
      matrix,
      level,
      level + 2,
      success * blessedChance,
      targetLevel,
    );
    const failLevel = level >= protectLevel ? Math.max(0, level - 1) : 0;
    addTransition(matrix, level, failLevel, fail, targetLevel);
  }

  const actionsByLevel = solveLinearSystem(matrix, source);
  if (
    !actionsByLevel ||
    actionsByLevel.some((value) => value < -EPSILON || !Number.isFinite(value))
  ) {
    return null;
  }
  const normalizedActions = actionsByLevel.map((value) =>
    Math.abs(value) < EPSILON ? 0 : value,
  );
  const protectionCount = normalizedActions.reduce(
    (sum, actions, level) =>
      sum + (level >= protectLevel ? actions * failRates[level] : 0),
    0,
  );
  return {
    actionsByLevel: normalizedActions,
    totalActions: normalizedActions.reduce((sum, value) => sum + value, 0),
    protectionCount,
  };
}

function getCachedNormalEnhancementFlow(options, profileKeys = null) {
  const protectLevel = Math.max(
    0,
    Math.floor(Number(options.protectLevel) || 0),
  );
  const targetLevel = Math.max(0, Math.floor(Number(options.targetLevel) || 0));
  let profileKey = profileKeys?.get(targetLevel);
  if (!profileKey) {
    profileKey = enhancementFlowProfileKey(options);
    profileKeys?.set(targetLevel, profileKey);
  }
  return cachedEnhancementFlow(`normal|${protectLevel}|${profileKey}`, () =>
    calculateNormalEnhancementFlowUncached(options),
  );
}

export function calculateNormalEnhancementFlow(options) {
  return cloneEnhancementFlow(
    getCachedNormalEnhancementFlow(options, new Map()),
  );
}

function calculateMirrorRequirements(targetLevel, philosopherStartLevel) {
  const requirements = Array(targetLevel + 1).fill(0);
  const actionsByLevel = Array(targetLevel).fill(0);
  requirements[targetLevel] = 1;

  for (let level = targetLevel - 1; level >= philosopherStartLevel; level--) {
    const actions = requirements[level + 1];
    actionsByLevel[level] = actions;
    requirements[level] += actions;
    requirements[level - 1] += actions;
  }

  const aCount = requirements[philosopherStartLevel];
  const bCount = requirements[philosopherStartLevel - 1];
  return {
    actionsByLevel,
    aCount,
    bCount,
    mirrorCount: aCount + bCount - 1,
  };
}

function calculatePhilosopherEnhancementFlowUncached(
  {
    targetLevel,
    protectLevel,
    philosopherStartLevel,
    successRates = DEFAULT_SUCCESS_RATES,
    successBonus,
    blessedChance,
  },
  resolveNormalFlow,
) {
  if (
    targetLevel <= 1 ||
    philosopherStartLevel < 1 ||
    philosopherStartLevel >= targetLevel
  ) {
    return null;
  }
  const mirror = calculateMirrorRequirements(
    targetLevel,
    philosopherStartLevel,
  );
  const aFlow = resolveNormalFlow({
    targetLevel: philosopherStartLevel,
    protectLevel,
    successRates,
    successBonus,
    blessedChance,
  });
  const bFlow =
    philosopherStartLevel > 1
      ? resolveNormalFlow({
          targetLevel: philosopherStartLevel - 1,
          protectLevel,
          successRates,
          successBonus,
          blessedChance,
        })
      : { actionsByLevel: [], totalActions: 0, protectionCount: 0 };
  if (!aFlow || !bFlow) return null;

  const actionsByLevel = [...mirror.actionsByLevel];
  for (let level = 0; level < philosopherStartLevel; level++) {
    actionsByLevel[level] =
      mirror.aCount * (aFlow.actionsByLevel[level] ?? 0) +
      mirror.bCount * (bFlow.actionsByLevel[level] ?? 0);
  }
  const normalActions =
    mirror.aCount * aFlow.totalActions + mirror.bCount * bFlow.totalActions;
  const protectionCount =
    mirror.aCount * aFlow.protectionCount +
    mirror.bCount * bFlow.protectionCount;
  return {
    actionsByLevel,
    baseItemCount: mirror.aCount + mirror.bCount,
    mirrorCount: mirror.mirrorCount,
    protectionCount,
    totalActions: normalActions + mirror.mirrorCount,
    aCount: mirror.aCount,
    bCount: mirror.bCount,
  };
}

function getCachedPhilosopherEnhancementFlow(options, profileKeys = null) {
  const protectLevel = Math.max(
    0,
    Math.floor(Number(options.protectLevel) || 0),
  );
  const philosopherStartLevel = Math.max(
    0,
    Math.floor(Number(options.philosopherStartLevel) || 0),
  );
  const targetLevel = Math.max(0, Math.floor(Number(options.targetLevel) || 0));
  let profileKey = profileKeys?.get(targetLevel);
  if (!profileKey) {
    profileKey = enhancementFlowProfileKey(options);
    profileKeys?.set(targetLevel, profileKey);
  }
  return cachedEnhancementFlow(
    `philosopher|${protectLevel}|${philosopherStartLevel}|${profileKey}`,
    () =>
      calculatePhilosopherEnhancementFlowUncached(options, (normalOptions) =>
        getCachedNormalEnhancementFlow(normalOptions, profileKeys),
      ),
  );
}

export function calculatePhilosopherEnhancementFlow(options) {
  return cloneEnhancementFlow(
    getCachedPhilosopherEnhancementFlow(options, new Map()),
  );
}

function getCachedEnhancementFlowTable({
  targetLevel,
  successRates,
  successBonus,
  blessedChance,
}) {
  const target = Math.max(0, Math.floor(Number(targetLevel) || 0));
  const profileKey = enhancementFlowProfileKey({
    targetLevel: target,
    successRates,
    successBonus,
    blessedChance,
  });
  const flowCount = target + (target * (target - 1)) / 2;
  return cachedEnhancementValue(`table|${profileKey}`, flowCount, () => {
    const localNormalFlows = Array.from({ length: target + 1 }, () => []);
    const resolveNormalFlow = (options) => {
      const flowTarget = Math.max(
        0,
        Math.floor(Number(options.targetLevel) || 0),
      );
      const protectLevel = Math.max(
        0,
        Math.floor(Number(options.protectLevel) || 0),
      );
      if (localNormalFlows[flowTarget][protectLevel] === undefined) {
        localNormalFlows[flowTarget][protectLevel] =
          calculateNormalEnhancementFlowUncached(options);
      }
      return localNormalFlows[flowTarget][protectLevel];
    };
    const normal = Array(target + 1).fill(null);
    for (let protectLevel = 1; protectLevel <= target; protectLevel++) {
      normal[protectLevel] = resolveNormalFlow({
        targetLevel: target,
        protectLevel,
        successRates,
        successBonus,
        blessedChance,
      });
    }
    const philosopher = Array.from({ length: target }, () => []);
    for (
      let philosopherStartLevel = 1;
      philosopherStartLevel < target;
      philosopherStartLevel++
    ) {
      for (
        let protectLevel = 1;
        protectLevel <= philosopherStartLevel;
        protectLevel++
      ) {
        philosopher[philosopherStartLevel][protectLevel] =
          calculatePhilosopherEnhancementFlowUncached(
            {
              targetLevel: target,
              protectLevel,
              philosopherStartLevel,
              successRates,
              successBonus,
              blessedChance,
            },
            resolveNormalFlow,
          );
      }
    }
    return { normal, philosopher };
  });
}

function unavailableResult(missingMarketValues = []) {
  return {
    status: "unavailable",
    totalCost: null,
    baseCost: null,
    refinementCost: null,
    totalSeconds: null,
    normalProtectStart: null,
    expectedProtectionCount: null,
    expectedNormalProtectionCount: null,
    expectedPhilosopherMirrorCount: null,
    philosopherStart: null,
    aLevel: null,
    aCount: null,
    bLevel: null,
    bCount: null,
    missingMarketValues: [...new Set(missingMarketValues)],
  };
}

function refinementRecipe(itemHrid, baseItemHrid, actionDetailMap) {
  if (itemHrid === baseItemHrid) return { actionHrid: "", inputItems: [] };
  const actions =
    actionDetailMap instanceof Map
      ? [...actionDetailMap.entries()]
      : Object.entries(actionDetailMap ?? {});
  const match = actions.find(
    ([, detail]) =>
      detail?.upgradeItemHrid === baseItemHrid &&
      detail?.outputItems?.some((output) => output.itemHrid === itemHrid),
  );
  if (!match) return null;
  const [fallbackHrid, action] = match;
  return {
    actionHrid: action.hrid ?? fallbackHrid,
    inputItems: action.inputItems ?? [],
  };
}

function refinementCostComponents(recipe, projectAction) {
  const rawInputs = recipe.inputItems.map((input) => ({
    itemHrid: input.itemHrid,
    count: Number(input.count) || 0,
  }));
  if (!recipe.actionHrid || typeof projectAction !== "function") {
    return rawInputs;
  }
  const projection = projectAction(recipe.actionHrid, 1, {
    respectInventoryLimit: false,
  });
  if (
    !["complete", "incomplete"].includes(projection?.status) ||
    !Array.isArray(projection.inputs)
  ) {
    return rawInputs;
  }
  const components = projection.inputs
    .filter((input) => !input.isUpgradeItem)
    .map((input) => ({
      itemHrid: input.itemHrid,
      count: Number(input.effectiveCount) || 0,
    }));
  const actionsPerHour = finitePositive(projection.actionsPerHour);
  if (actionsPerHour) {
    for (const drink of projection.teaEffects?.drinks ?? []) {
      const count = finitePositive(drink.countPerHour) / actionsPerHour;
      if (drink.itemHrid && count > 0) {
        components.push({ itemHrid: drink.itemHrid, count });
      }
    }
  }
  return components;
}

export function calculateEnhancementPlan({
  itemHrid,
  targetLevel,
  itemDetailMap = runtime.state.initData_itemDetailMap,
  successRateTable = runtime.state.initData_enhancementLevelSuccessRateTable,
  bonusMultiplierTable = runtime.state
    .initData_enhancementLevelTotalBonusMultiplierTable,
  actionDetailMap = runtime.state.initData_actionDetailMap,
  shopItemDetailMap = runtime.state.initData_shopItemDetailMap,
  getFairValue = runtime.api.getFairValue,
  getMarketValue = getFairValue,
  projectAction = runtime.api.projectAction,
  forcedProtectionItemHrid = null,
  allowPhilosopherMirror = true,
  simulationProfile = null,
} = {}) {
  const target = Math.max(0, Math.floor(Number(targetLevel) || 0));
  const baseItemHrid = itemHrid.endsWith("_refined")
    ? itemHrid.replace("_refined", "")
    : itemHrid;
  const item = itemDetailMap?.[baseItemHrid];
  const refiningRecipe = refinementRecipe(
    itemHrid,
    baseItemHrid,
    actionDetailMap,
  );
  if (refiningRecipe === null) return unavailableResult();
  if (!item?.enhancementCosts?.length || target < 1) return unavailableResult();
  const stats = getEnhancementProfileStats({
    itemLevel: item.itemLevel,
    itemDetailMap,
    bonusMultiplierTable,
    simulationProfile,
  });
  if (!stats) return unavailableResult();

  const missing = new Set();
  const resolvePrice = (resolver, hrid, level = 0) => {
    if (hrid === "/items/coin") return 1;
    const value = finitePositive(resolver?.(hrid, level));
    if (!value) missing.add(hrid);
    return value;
  };
  const acquisitionPrice = (hrid, level = 0) =>
    resolvePrice(getFairValue, hrid, level);
  const marketPrice = (hrid, level = 0) =>
    resolvePrice(getMarketValue, hrid, level);
  const optionalMarketPrice = (hrid, level = 0) => {
    if (hrid === "/items/coin") return 1;
    return finitePositive(getMarketValue?.(hrid, level));
  };
  const resolveCharmLeafPrice = (hrid) => {
    const value =
      optionalMarketPrice(hrid, 0) ||
      nonTradableCoinShopPrice(hrid, itemDetailMap, shopItemDetailMap);
    if (!value) missing.add(hrid);
    return value;
  };
  const useFairValueBase = simulationProfile?.baseCostMode === "fair_value";
  const basePrice = useFairValueBase
    ? marketPrice(baseItemHrid, 0)
    : baseItemHrid.endsWith("_charm")
      ? charmBaseCost({
          itemHrid: baseItemHrid,
          actionDetailMap,
          projectAction,
          resolveLeafPrice: resolveCharmLeafPrice,
        })
      : acquisitionPrice(baseItemHrid, 0);
  if (!basePrice && baseItemHrid.endsWith("_charm") && !useFairValueBase) {
    missing.add(baseItemHrid);
  }
  let materialCostPerAction = 0;
  let hasMissingRequiredPrice = !basePrice;
  for (const cost of item.enhancementCosts) {
    const unitPrice =
      optionalMarketPrice(cost.itemHrid, 0) ||
      nonTradableCoinShopPrice(cost.itemHrid, itemDetailMap, shopItemDetailMap);
    if (!unitPrice) {
      missing.add(cost.itemHrid);
      hasMissingRequiredPrice = true;
    }
    materialCostPerAction += unitPrice * Number(cost.count || 0);
  }
  let refinementCost = 0;
  for (const cost of refinementCostComponents(refiningRecipe, projectAction)) {
    const unitPrice = acquisitionPrice(cost.itemHrid, 0);
    if (!unitPrice) hasMissingRequiredPrice = true;
    refinementCost += unitPrice * Number(cost.count || 0);
  }
  const teaType = simulationProfile?.teaType ?? "ultra_enhancing_tea";
  const enhancingTeaHrid = teaType === "none" ? null : `/items/${teaType}`;
  const enhancingTeaPrice = enhancingTeaHrid
    ? marketPrice(enhancingTeaHrid, 0)
    : 0;
  const useBlessedTea = simulationProfile
    ? Boolean(simulationProfile.blessedTea)
    : true;
  const blessedTeaPrice = useBlessedTea
    ? marketPrice("/items/blessed_tea", 0)
    : 0;
  if (
    (enhancingTeaHrid && !enhancingTeaPrice) ||
    (useBlessedTea && !blessedTeaPrice)
  ) {
    hasMissingRequiredPrice = true;
  }
  if (hasMissingRequiredPrice) return unavailableResult([...missing]);

  let protectionChoice = null;
  const considerProtection = (hrid, value) => {
    if (
      hrid &&
      value > 0 &&
      (!protectionChoice || value < protectionChoice.value)
    ) {
      protectionChoice = { hrid, value };
    }
  };
  if (forcedProtectionItemHrid) {
    considerProtection(
      forcedProtectionItemHrid,
      optionalMarketPrice(forcedProtectionItemHrid, 0),
    );
  } else {
    considerProtection(baseItemHrid, optionalMarketPrice(baseItemHrid, 0));
    for (const candidate of new Set(item.protectionItemHrids ?? [])) {
      considerProtection(candidate, optionalMarketPrice(candidate, 0));
    }
    considerProtection(
      "/items/mirror_of_protection",
      optionalMarketPrice("/items/mirror_of_protection", 0),
    );
  }
  const protectionPrice = protectionChoice?.value ?? 0;
  const philosopherMirrorPrice = marketPrice("/items/philosophers_mirror", 0);
  const successRates = normalizedTable(successRateTable, DEFAULT_SUCCESS_RATES);
  const enhancingTeaCostPerAction =
    (stats.secondsPerAction / ENHANCEMENT_PROFILE.teaDurationSeconds) *
    enhancingTeaPrice;
  const blessedTeaCostPerNormalAction =
    (stats.secondsPerAction / ENHANCEMENT_PROFILE.teaDurationSeconds) *
    blessedTeaPrice;
  const timeFeePerAction =
    (stats.secondsPerAction / 3600) *
    (Number(simulationProfile?.timeFeePerHour) || 0);
  const normalActionCost =
    materialCostPerAction +
    enhancingTeaCostPerAction +
    blessedTeaCostPerNormalAction +
    timeFeePerAction;
  let best = null;
  const flowTable = getCachedEnhancementFlowTable({
    targetLevel: target,
    successRates,
    successBonus: stats.successBonus,
    blessedChance: stats.blessedChance,
  });

  for (let protectLevel = 1; protectLevel <= target; protectLevel++) {
    const flow = flowTable.normal[protectLevel];
    if (!flow) continue;
    if (flow.protectionCount > EPSILON && !protectionPrice) continue;
    const totalCost =
      basePrice +
      flow.totalActions * normalActionCost +
      flow.protectionCount * protectionPrice;
    if (!best || totalCost < best.totalCost) {
      best = {
        mode: "normal",
        totalCost,
        totalActions: flow.totalActions,
        protectionCount: flow.protectionCount,
        mirrorCount: 0,
        protectLevel,
        philosopherStartLevel: null,
        aCount: 0,
        bCount: 0,
      };
    }
  }

  if (allowPhilosopherMirror && philosopherMirrorPrice > 0) {
    for (
      let philosopherStartLevel = 1;
      philosopherStartLevel < target;
      philosopherStartLevel++
    ) {
      for (
        let protectLevel = 1;
        protectLevel <= philosopherStartLevel;
        protectLevel++
      ) {
        const flow = flowTable.philosopher[philosopherStartLevel][protectLevel];
        if (!flow || flow.baseItemCount < -EPSILON) continue;
        if (flow.protectionCount > EPSILON && !protectionPrice) continue;
        const totalCost =
          flow.baseItemCount * basePrice +
          flow.totalActions *
            (materialCostPerAction +
              enhancingTeaCostPerAction +
              timeFeePerAction) +
          (flow.totalActions - flow.mirrorCount) *
            blessedTeaCostPerNormalAction +
          flow.protectionCount * protectionPrice +
          flow.mirrorCount * philosopherMirrorPrice;
        if (!best || totalCost < best.totalCost) {
          best = {
            mode: "philosopher",
            totalCost,
            totalActions: flow.totalActions,
            protectionCount: flow.protectionCount,
            mirrorCount: flow.mirrorCount,
            protectLevel,
            philosopherStartLevel,
            aCount: flow.aCount,
            bCount: flow.bCount,
          };
        }
      }
    }
  }

  if (!best) return unavailableResult([...missing]);
  const taxMultiplier =
    simulationProfile && Number(simulationProfile.taxRatePercent) > 0
      ? 1 / (1 - Number(simulationProfile.taxRatePercent) / 100)
      : 1;
  const totalCostBeforeTax = best.totalCost + refinementCost;
  return {
    status: "complete",
    totalCost: totalCostBeforeTax * taxMultiplier,
    totalCostBeforeTax,
    taxRatePercent: simulationProfile
      ? Number(simulationProfile.taxRatePercent) || 0
      : 0,
    simulationProfile: simulationProfile ? { ...simulationProfile } : null,
    baseCost: basePrice,
    refinementCost,
    totalSeconds: best.totalActions * stats.secondsPerAction,
    normalProtectStart:
      best.protectionCount > EPSILON ? best.protectLevel : null,
    expectedProtectionCount:
      best.mode === "philosopher" ? best.mirrorCount : best.protectionCount,
    expectedNormalProtectionCount: best.protectionCount,
    expectedPhilosopherMirrorCount: best.mirrorCount,
    protectionItemHrid:
      best.protectionCount > EPSILON ? (protectionChoice?.hrid ?? null) : null,
    protectionUnitCost: best.protectionCount > EPSILON ? protectionPrice : 0,
    philosopherStart: best.philosopherStartLevel,
    aLevel: best.philosopherStartLevel,
    aCount: best.aCount,
    bLevel:
      best.philosopherStartLevel === null
        ? null
        : best.philosopherStartLevel - 1,
    bCount: best.bCount,
    missingMarketValues: [...missing],
  };
}

Object.assign(runtime.api, {
  calculateEnhancementPlan,
  calculateNormalEnhancementFlow,
  calculatePhilosopherEnhancementFlow,
  getEnhancementProfileStats,
});
