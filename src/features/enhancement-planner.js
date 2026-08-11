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

const DEFAULT_SUCCESS_RATES = [
  0.5, 0.45, 0.45, 0.4, 0.4, 0.4, 0.35, 0.35, 0.35, 0.35, 0.3, 0.3, 0.3, 0.3,
  0.3, 0.3, 0.3, 0.3, 0.3, 0.3,
];

const DEFAULT_BONUS_MULTIPLIERS = [
  0, 1, 2.1, 3.3, 4.6, 6, 7.5, 9.1, 10.8, 12.6, 14.5, 16.7, 19.2, 22, 25.1,
  28.5, 32.2, 36.2, 40.5, 45.1, 50,
];

const EPSILON = 1e-9;

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

function successRateAt(table, level) {
  const value = Number(table[level] ?? table.at(-1));
  if (!Number.isFinite(value)) return 0;
  return value > 1 ? value / 100 : value;
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
} = {}) {
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

export function calculateNormalEnhancementFlow({
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

export function calculatePhilosopherEnhancementFlow({
  targetLevel,
  protectLevel,
  philosopherStartLevel,
  successRates = DEFAULT_SUCCESS_RATES,
  successBonus,
  blessedChance,
}) {
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
  const aFlow = calculateNormalEnhancementFlow({
    targetLevel: philosopherStartLevel,
    protectLevel,
    successRates,
    successBonus,
    blessedChance,
  });
  const bFlow =
    philosopherStartLevel > 1
      ? calculateNormalEnhancementFlow({
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

function unavailableResult(missingMarketValues = []) {
  return {
    status: "unavailable",
    totalCost: null,
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

function refinementInputs(itemHrid, baseItemHrid, actionDetailMap) {
  if (itemHrid === baseItemHrid) return [];
  const actions =
    actionDetailMap instanceof Map
      ? [...actionDetailMap.values()]
      : Object.values(actionDetailMap ?? {});
  const action = actions.find(
    (detail) =>
      detail?.upgradeItemHrid === baseItemHrid &&
      detail?.outputItems?.some((output) => output.itemHrid === itemHrid),
  );
  return action?.inputItems ?? null;
}

export function calculateEnhancementPlan({
  itemHrid,
  targetLevel,
  itemDetailMap = runtime.state.initData_itemDetailMap,
  successRateTable = runtime.state.initData_enhancementLevelSuccessRateTable,
  bonusMultiplierTable = runtime.state
    .initData_enhancementLevelTotalBonusMultiplierTable,
  actionDetailMap = runtime.state.initData_actionDetailMap,
  getFairValue = runtime.api.getFairValue,
  forcedProtectionItemHrid = null,
  allowPhilosopherMirror = true,
} = {}) {
  const target = Math.max(0, Math.floor(Number(targetLevel) || 0));
  const baseItemHrid = itemHrid.endsWith("_refined")
    ? itemHrid.replace("_refined", "")
    : itemHrid;
  const item = itemDetailMap?.[baseItemHrid];
  const refiningInputs = refinementInputs(
    itemHrid,
    baseItemHrid,
    actionDetailMap,
  );
  if (refiningInputs === null) return unavailableResult();
  if (!item?.enhancementCosts?.length || target < 1) return unavailableResult();
  const stats = getEnhancementProfileStats({
    itemLevel: item.itemLevel,
    itemDetailMap,
    bonusMultiplierTable,
  });
  if (!stats) return unavailableResult();

  const missing = new Set();
  const price = (hrid, level = 0) => {
    if (hrid === "/items/coin") return 1;
    const value = finitePositive(getFairValue?.(hrid, level));
    if (!value) missing.add(hrid);
    return value;
  };
  const basePrice = price(baseItemHrid, 0);
  let materialCostPerAction = 0;
  let hasMissingRequiredPrice = !basePrice;
  for (const cost of item.enhancementCosts) {
    const unitPrice = price(cost.itemHrid, 0);
    if (!unitPrice) hasMissingRequiredPrice = true;
    materialCostPerAction += unitPrice * Number(cost.count || 0);
  }
  let refinementCost = 0;
  for (const cost of refiningInputs) {
    const unitPrice = price(cost.itemHrid, 0);
    if (!unitPrice) hasMissingRequiredPrice = true;
    refinementCost += unitPrice * Number(cost.count || 0);
  }
  const ultraTeaPrice = price("/items/ultra_enhancing_tea", 0);
  const blessedTeaPrice = price("/items/blessed_tea", 0);
  if (!ultraTeaPrice || !blessedTeaPrice) hasMissingRequiredPrice = true;
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
      price(forcedProtectionItemHrid, 0),
    );
  } else {
    // The equipment itself protects at the same fully resolved acquisition
    // cost used for the base item, not a second direct-market lookup.
    considerProtection(baseItemHrid, basePrice);
    for (const candidate of new Set(item.protectionItemHrids ?? [])) {
      considerProtection(candidate, price(candidate, 0));
    }
    considerProtection(
      "/items/mirror_of_protection",
      price("/items/mirror_of_protection", 0),
    );
  }
  const protectionPrice = protectionChoice?.value ?? 0;
  const philosopherMirrorPrice = price("/items/philosophers_mirror", 0);
  const successRates = normalizedTable(successRateTable, DEFAULT_SUCCESS_RATES);
  const ultraTeaCostPerAction =
    (stats.secondsPerAction / ENHANCEMENT_PROFILE.teaDurationSeconds) *
    ultraTeaPrice;
  const blessedTeaCostPerNormalAction =
    (stats.secondsPerAction / ENHANCEMENT_PROFILE.teaDurationSeconds) *
    blessedTeaPrice;
  const normalActionCost =
    materialCostPerAction +
    ultraTeaCostPerAction +
    blessedTeaCostPerNormalAction;
  let best = null;

  for (let protectLevel = 1; protectLevel <= target; protectLevel++) {
    const flow = calculateNormalEnhancementFlow({
      targetLevel: target,
      protectLevel,
      successRates,
      successBonus: stats.successBonus,
      blessedChance: stats.blessedChance,
    });
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
        const flow = calculatePhilosopherEnhancementFlow({
          targetLevel: target,
          protectLevel,
          philosopherStartLevel,
          successRates,
          successBonus: stats.successBonus,
          blessedChance: stats.blessedChance,
        });
        if (!flow || flow.baseItemCount < -EPSILON) continue;
        if (flow.protectionCount > EPSILON && !protectionPrice) continue;
        const totalCost =
          flow.baseItemCount * basePrice +
          flow.totalActions * (materialCostPerAction + ultraTeaCostPerAction) +
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
  return {
    status: "complete",
    totalCost: best.totalCost + refinementCost,
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
