import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEnhancementPlan,
  calculateNormalEnhancementFlow,
  calculatePhilosopherEnhancementFlow,
  getEnhancementProfileStats,
} from "../src/features/enhancement-planner.js";

const MULTIPLIERS = [
  0, 1, 2.1, 3.3, 4.6, 6, 7.5, 9.1, 10.8, 12.6, 14.5, 16.7, 19.2, 22, 25.1,
  28.5, 32.2, 36.2, 40.5, 45.1, 50,
];

function equipment(stats, bonuses) {
  return {
    equipmentDetail: {
      noncombatStats: stats,
      noncombatEnhancementBonuses: bonuses,
    },
  };
}

function itemDetailMap(itemLevel = 100) {
  return {
    "/items/celestial_enhancer": equipment(
      { enhancingSuccess: 0.042 },
      { enhancingSuccess: 0.00084 },
    ),
    "/items/enhancers_top": equipment(
      { enhancingSpeed: 0.1 },
      { enhancingSpeed: 0.002 },
    ),
    "/items/enhancers_bottoms": equipment(
      { enhancingSpeed: 0.1 },
      { enhancingSpeed: 0.002 },
    ),
    "/items/enchanted_gloves": equipment(
      { enhancingSpeed: 0.1 },
      { enhancingSpeed: 0.002 },
    ),
    "/items/chance_cape_refined": equipment(
      { enhancingSpeed: 0.058 },
      { enhancingSpeed: 0.0058 },
    ),
    "/items/target": {
      itemLevel,
      enhancementCosts: [
        { itemHrid: "/items/material", count: 2 },
        { itemHrid: "/items/coin", count: 100 },
      ],
      protectionItemHrids: ["/items/special_protection"],
    },
    "/items/target_refined": {
      itemLevel,
    },
  };
}

function prices(overrides = {}) {
  return {
    "/items/target": 1_000_000,
    "/items/material": 1_000,
    "/items/special_protection": 50_000,
    "/items/mirror_of_protection": 80_000,
    "/items/philosophers_mirror": 1_000_000,
    "/items/ultra_enhancing_tea": 1_000,
    "/items/blessed_tea": 500,
    ...overrides,
  };
}

test("fixed profile derives all requested equipment, house and tea buffs", () => {
  const stats = getEnhancementProfileStats({
    itemLevel: 100,
    itemDetailMap: itemDetailMap(),
    bonusMultiplierTable: MULTIPLIERS,
  });

  assert.equal(stats.effectiveLevel, 143);
  assert.equal(stats.toolSuccess, 0.058128);
  assert.equal(stats.gloveSpeed, 0.129);
  assert.equal(stats.topSpeed, 0.129);
  assert.equal(stats.bottomsSpeed, 0.129);
  assert.equal(stats.capeSpeed, 0.0928);
  assert.equal(stats.blessedChance, 0.01);
  assert.ok(Math.abs(stats.successBonus - 0.083628) < 1e-12);
  assert.ok(Math.abs(stats.speedBonus - 1.0498) < 1e-12);
});

test("normal flow matches the reference Markov expectation", () => {
  const flow = calculateNormalEnhancementFlow({
    targetLevel: 3,
    protectLevel: 2,
    successRates: [0.5, 0.5, 0.5],
    successBonus: 0,
    blessedChance: 0,
  });

  assert.deepEqual(flow.actionsByLevel, [6, 4, 2]);
  assert.equal(flow.totalActions, 12);
  assert.equal(flow.protectionCount, 1);
});

test("philosopher flow matches the reference material-flow solution", () => {
  const flow = calculatePhilosopherEnhancementFlow({
    targetLevel: 4,
    protectLevel: 2,
    philosopherStartLevel: 2,
    successRates: [0.5, 0.5, 0.5, 0.5],
    successBonus: 0,
    blessedChance: 0,
  });

  assert.deepEqual(flow.actionsByLevel, [10, 4, 1, 1]);
  assert.equal(flow.baseItemCount, 3);
  assert.equal(flow.mirrorCount, 2);
  assert.equal(flow.protectionCount, 0);
  assert.equal(flow.totalActions, 16);
  assert.equal(flow.aCount, 2);
  assert.equal(flow.bCount, 1);
});

test("blessed tea applies while making inputs but not during mirror combinations", () => {
  const withBlessedInputs = calculatePhilosopherEnhancementFlow({
    targetLevel: 4,
    protectLevel: 2,
    philosopherStartLevel: 2,
    successRates: [0.5, 0.5, 0.5, 0.5],
    successBonus: 0,
    blessedChance: 0.01,
    philosopherBlessedChance: 0,
  });
  const withoutBlessedInputs = calculatePhilosopherEnhancementFlow({
    targetLevel: 4,
    protectLevel: 2,
    philosopherStartLevel: 2,
    successRates: [0.5, 0.5, 0.5, 0.5],
    successBonus: 0,
    blessedChance: 0,
    philosopherBlessedChance: 0,
  });

  assert.ok(Math.abs(withBlessedInputs.aCount - 1.9804931181305079) < 1e-12);
  assert.ok(Math.abs(withBlessedInputs.bCount - 0.9804931181305079) < 1e-12);
  assert.equal(withBlessedInputs.mirrorCount, withBlessedInputs.aCount);
  assert.equal(withoutBlessedInputs.aCount, 2);
  assert.equal(withoutBlessedInputs.bCount, 1);
  assert.notEqual(
    withBlessedInputs.totalActions,
    withoutBlessedInputs.totalActions,
  );
});

test("planner chooses a normal plan when philosopher acquisition is expensive", () => {
  const values = prices();
  const plan = calculateEnhancementPlan({
    itemHrid: "/items/target",
    targetLevel: 10,
    itemDetailMap: itemDetailMap(),
    bonusMultiplierTable: MULTIPLIERS,
    getFairValue: (hrid) => values[hrid] ?? 0,
  });

  assert.equal(plan.status, "complete");
  assert.equal(plan.philosopherStart, null);
  assert.equal(plan.aCount, 0);
  assert.equal(plan.bCount, 0);
  assert.ok(plan.totalCost > 0);
  assert.ok(plan.totalSeconds > 0);
});

test("planner chooses philosopher protection and reports required enhancement inputs", () => {
  const values = prices({
    "/items/target": 1,
    "/items/material": 1,
    "/items/special_protection": 1_000_000_000,
    "/items/mirror_of_protection": 1_000_000_000,
    "/items/philosophers_mirror": 1,
    "/items/ultra_enhancing_tea": 1,
    "/items/blessed_tea": 1,
  });
  const plan = calculateEnhancementPlan({
    itemHrid: "/items/target",
    targetLevel: 10,
    itemDetailMap: itemDetailMap(150),
    bonusMultiplierTable: MULTIPLIERS,
    getFairValue: (hrid) => values[hrid] ?? 0,
  });

  assert.equal(plan.status, "complete");
  assert.equal(plan.philosopherStart, 1);
  assert.equal(plan.aLevel, 1);
  assert.equal(plan.bLevel, 0);
  assert.ok(plan.aCount > plan.bCount);
  assert.ok(plan.bCount > 0);
  assert.ok(Number.isFinite(plan.aCount));
  assert.ok(Number.isFinite(plan.bCount));
  assert.equal(
    plan.expectedProtectionCount,
    plan.expectedPhilosopherMirrorCount,
  );
  assert.ok(plan.expectedProtectionCount > 0);
  assert.equal(plan.normalProtectStart, null);
});

test("planner prices every component through fair value and treats coin as one", () => {
  const values = prices();
  const calls = [];
  const plan = calculateEnhancementPlan({
    itemHrid: "/items/target",
    targetLevel: 1,
    itemDetailMap: itemDetailMap(),
    bonusMultiplierTable: MULTIPLIERS,
    getFairValue: (hrid, level) => {
      calls.push([hrid, level]);
      return values[hrid] ?? 0;
    },
  });

  assert.equal(plan.status, "complete");
  assert.ok(calls.some(([hrid]) => hrid === "/items/target"));
  assert.ok(calls.some(([hrid]) => hrid === "/items/material"));
  assert.ok(calls.some(([hrid]) => hrid === "/items/ultra_enhancing_tea"));
  assert.ok(calls.some(([hrid]) => hrid === "/items/blessed_tea"));
  assert.ok(!calls.some(([hrid]) => hrid === "/items/coin"));
  assert.equal(plan.expectedProtectionCount, 0);
});

test("missing required market value produces an unavailable result", () => {
  const values = prices({ "/items/material": 0 });
  const plan = calculateEnhancementPlan({
    itemHrid: "/items/target",
    targetLevel: 10,
    itemDetailMap: itemDetailMap(),
    bonusMultiplierTable: MULTIPLIERS,
    getFairValue: (hrid) => values[hrid] ?? 0,
  });

  assert.equal(plan.status, "unavailable");
  assert.equal(plan.totalCost, null);
  assert.deepEqual(plan.missingMarketValues, ["/items/material"]);
});

test("refined gear uses the base enhancement plan plus one refining recipe", () => {
  const values = prices({ "/items/refining_shard": 300 });
  const actionDetailMap = {
    "/actions/refine_target": {
      upgradeItemHrid: "/items/target",
      inputItems: [{ itemHrid: "/items/refining_shard", count: 100 }],
      outputItems: [{ itemHrid: "/items/target_refined", count: 1 }],
    },
  };
  const calls = [];
  const options = {
    targetLevel: 10,
    itemDetailMap: itemDetailMap(),
    actionDetailMap,
    bonusMultiplierTable: MULTIPLIERS,
    getFairValue: (hrid) => {
      calls.push(hrid);
      return values[hrid] ?? 0;
    },
  };
  const base = calculateEnhancementPlan({
    ...options,
    itemHrid: "/items/target",
  });
  calls.length = 0;
  const refined = calculateEnhancementPlan({
    ...options,
    itemHrid: "/items/target_refined",
  });

  assert.equal(refined.status, "complete");
  assert.ok(Math.abs(refined.totalCost - base.totalCost - 30_000) < 1e-6);
  assert.ok(calls.includes("/items/target"));
  assert.ok(calls.includes("/items/refining_shard"));
  assert.ok(!calls.includes("/items/target_refined"));
});

test("high enhancement targets remain finite without external math", () => {
  const values = prices();
  const plan = calculateEnhancementPlan({
    itemHrid: "/items/target",
    targetLevel: 20,
    itemDetailMap: itemDetailMap(),
    bonusMultiplierTable: MULTIPLIERS,
    getFairValue: (hrid) => values[hrid] ?? 0,
  });

  assert.equal(plan.status, "complete");
  assert.ok(Number.isFinite(plan.totalCost));
  assert.ok(Number.isFinite(plan.totalSeconds));
});
