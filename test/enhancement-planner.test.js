import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEnhancementPlan,
  calculateNormalEnhancementFlow,
  calculatePhilosopherEnhancementFlow,
  ENHANCEMENT_PROFILE,
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
  assert.equal(ENHANCEMENT_PROFILE.playerLevel, 140);
  assert.equal(ENHANCEMENT_PROFILE.tool.enhancementLevel, 14);
  assert.equal(ENHANCEMENT_PROFILE.ultraTeaLevel, 8);
  const stats = getEnhancementProfileStats({
    itemLevel: 100,
    itemDetailMap: itemDetailMap(),
    bonusMultiplierTable: MULTIPLIERS,
  });

  assert.equal(stats.effectiveLevel, 148);
  assert.equal(stats.toolSuccess, 0.063084);
  assert.equal(stats.gloveSpeed, 0.129);
  assert.equal(stats.topSpeed, 0.129);
  assert.equal(stats.bottomsSpeed, 0.129);
  assert.equal(stats.capeSpeed, 0.0928);
  assert.equal(stats.blessedChance, 0.01);
  assert.ok(Math.abs(stats.successBonus - 0.091084) < 1e-12);
  assert.ok(Math.abs(stats.speedBonus - 1.0998) < 1e-12);
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
  });
  const withoutBlessedInputs = calculatePhilosopherEnhancementFlow({
    targetLevel: 4,
    protectLevel: 2,
    philosopherStartLevel: 2,
    successRates: [0.5, 0.5, 0.5, 0.5],
    successBonus: 0,
    blessedChance: 0,
  });

  assert.equal(withBlessedInputs.aCount, 2);
  assert.equal(withBlessedInputs.bCount, 1);
  assert.equal(withBlessedInputs.mirrorCount, 2);
  assert.equal(withoutBlessedInputs.aCount, 2);
  assert.equal(withoutBlessedInputs.bCount, 1);
  assert.notEqual(
    withBlessedInputs.totalActions,
    withoutBlessedInputs.totalActions,
  );
});

test("mirror input counts are integers and use one fewer mirror than inputs", () => {
  const flow = calculatePhilosopherEnhancementFlow({
    targetLevel: 20,
    protectLevel: 6,
    philosopherStartLevel: 12,
    successRates: Array(20).fill(0.5),
    successBonus: 0,
    blessedChance: 0.01,
  });

  assert.equal(flow.aCount, 34);
  assert.equal(flow.bCount, 21);
  assert.equal(flow.mirrorCount, 54);
  assert.equal(flow.mirrorCount, flow.aCount + flow.bCount - 1);
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

test("planner can force regular protection mirrors and disable philosopher synthesis", () => {
  const values = prices();
  const defaultPlan = calculateEnhancementPlan({
    itemHrid: "/items/target",
    targetLevel: 10,
    itemDetailMap: itemDetailMap(),
    bonusMultiplierTable: MULTIPLIERS,
    getFairValue: (hrid) => values[hrid] ?? 0,
  });
  const mirrorPlan = calculateEnhancementPlan({
    itemHrid: "/items/target",
    targetLevel: 10,
    itemDetailMap: itemDetailMap(),
    bonusMultiplierTable: MULTIPLIERS,
    getFairValue: (hrid) => values[hrid] ?? 0,
    forcedProtectionItemHrid: "/items/mirror_of_protection",
    allowPhilosopherMirror: false,
  });

  assert.equal(mirrorPlan.status, "complete");
  assert.equal(mirrorPlan.philosopherStart, null);
  assert.ok(mirrorPlan.totalCost > defaultPlan.totalCost);
  assert.equal(mirrorPlan.protectionItemHrid, "/items/mirror_of_protection");
  assert.equal(mirrorPlan.protectionUnitCost, 80_000);
});

test("planner compares resolved base cost with protection items and mirrors", () => {
  const mirrorValues = prices({
    "/items/target": 100_000,
    "/items/special_protection": 90_000,
    "/items/mirror_of_protection": 80_000,
  });
  const mirrorPlan = calculateEnhancementPlan({
    itemHrid: "/items/target",
    targetLevel: 10,
    itemDetailMap: itemDetailMap(),
    bonusMultiplierTable: MULTIPLIERS,
    getFairValue: (hrid) => mirrorValues[hrid] ?? 0,
  });
  assert.equal(mirrorPlan.status, "complete");
  assert.equal(mirrorPlan.protectionItemHrid, "/items/mirror_of_protection");
  assert.equal(mirrorPlan.protectionUnitCost, 80_000);

  const baseValues = prices({
    "/items/target": 40_000,
    "/items/special_protection": 90_000,
    "/items/mirror_of_protection": 80_000,
  });
  const basePlan = calculateEnhancementPlan({
    itemHrid: "/items/target",
    targetLevel: 10,
    itemDetailMap: itemDetailMap(),
    bonusMultiplierTable: MULTIPLIERS,
    getFairValue: (hrid) => baseValues[hrid] ?? 0,
  });
  assert.equal(basePlan.status, "complete");
  assert.equal(basePlan.protectionItemHrid, "/items/target");
  assert.equal(basePlan.protectionUnitCost, 40_000);
});

test("protection candidates without a market value are skipped", () => {
  const acquisitionValues = prices({
    "/items/target": 1_000_000,
    "/items/special_protection": 1,
  });
  const marketValues = prices({
    "/items/target": 100_000,
    "/items/special_protection": 0,
    "/items/mirror_of_protection": 80_000,
  });
  const plan = calculateEnhancementPlan({
    itemHrid: "/items/target",
    targetLevel: 10,
    itemDetailMap: itemDetailMap(),
    bonusMultiplierTable: MULTIPLIERS,
    getFairValue: (hrid) => acquisitionValues[hrid] ?? 0,
    getMarketValue: (hrid) => marketValues[hrid] ?? 0,
  });

  assert.equal(plan.status, "complete");
  assert.equal(plan.protectionItemHrid, "/items/mirror_of_protection");
  assert.equal(plan.protectionUnitCost, 80_000);
  assert.ok(!plan.missingMarketValues.includes("/items/special_protection"));
});

test("non-tradable enhancement materials use their fixed coin shop price", () => {
  const details = itemDetailMap();
  details["/items/target"].enhancementCosts = [
    { itemHrid: "/items/trainee_enhancing_charm", count: 32 },
    { itemHrid: "/items/coin", count: 7_490 },
  ];
  details["/items/trainee_enhancing_charm"] = { isTradable: false };
  const values = prices();
  const shared = {
    itemHrid: "/items/target",
    targetLevel: 10,
    itemDetailMap: details,
    bonusMultiplierTable: MULTIPLIERS,
    getFairValue: (hrid) => values[hrid] ?? 0,
    getMarketValue: (hrid) => values[hrid] ?? 0,
  };
  const shopPlan = calculateEnhancementPlan({
    ...shared,
    shopItemDetailMap: {
      "/shop_items/trainee_enhancing_charm": {
        itemHrid: "/items/trainee_enhancing_charm",
        costs: [{ itemHrid: "/items/coin", count: 250_000 }],
      },
    },
  });
  const explicitlyPricedPlan = calculateEnhancementPlan({
    ...shared,
    getMarketValue: (hrid) =>
      hrid === "/items/trainee_enhancing_charm" ? 250_000 : (values[hrid] ?? 0),
  });

  assert.equal(shopPlan.status, "complete");
  assert.equal(shopPlan.baseCost, 1_000_000);
  assert.equal(shopPlan.totalCost, explicitlyPricedPlan.totalCost);
  assert.ok(
    !shopPlan.missingMarketValues.includes("/items/trainee_enhancing_charm"),
  );
});

test("tradable enhancement materials never fall back to shop prices", () => {
  const details = itemDetailMap();
  details["/items/material"] = { isTradable: true };
  const values = prices({ "/items/material": 0 });
  const plan = calculateEnhancementPlan({
    itemHrid: "/items/target",
    targetLevel: 10,
    itemDetailMap: details,
    shopItemDetailMap: {
      "/shop_items/material": {
        itemHrid: "/items/material",
        costs: [{ itemHrid: "/items/coin", count: 1 }],
      },
    },
    bonusMultiplierTable: MULTIPLIERS,
    getFairValue: (hrid) => values[hrid] ?? 0,
    getMarketValue: (hrid) => values[hrid] ?? 0,
  });

  assert.equal(plan.status, "unavailable");
  assert.ok(plan.missingMarketValues.includes("/items/material"));
});

test("charm bases follow their full artisan-adjusted root chain", () => {
  const makePlan = ({ type, rootItemHrid, rootPrice, craftBasic }) => {
    const targetHrid = `/items/grandmaster_${type}_charm`;
    const traineeHrid = `/items/trainee_${type}_charm`;
    const details = itemDetailMap();
    details[targetHrid] = {
      itemLevel: 100,
      enhancementCosts: [
        { itemHrid: traineeHrid, count: 32 },
        { itemHrid: "/items/coin", count: 7_490 },
      ],
    };
    details[traineeHrid] = { isTradable: false };

    const actions = {};
    const tiers = [
      ["advanced", "basic", 8],
      ["expert", "advanced", 6],
      ["master", "expert", 4],
      ["grandmaster", "master", 2],
    ];
    if (craftBasic) {
      actions[`/actions/crafting/basic_${type}_charm`] = {
        inputItems: [{ itemHrid: rootItemHrid, count: 10_000 }],
        outputItems: [{ itemHrid: `/items/basic_${type}_charm`, count: 1 }],
      };
    }
    for (const [tier, priorTier, count] of tiers) {
      const inputHrid = `/items/${priorTier}_${type}_charm`;
      actions[`/actions/crafting/${tier}_${type}_charm`] = {
        upgradeItemHrid: inputHrid,
        inputItems: [{ itemHrid: inputHrid, count }],
        outputItems: [{ itemHrid: `/items/${tier}_${type}_charm`, count: 1 }],
      };
    }

    const projectAction = (actionHrid, count, context) => {
      assert.equal(count, 1);
      assert.equal(context.respectInventoryLimit, false);
      const action = actions[actionHrid];
      return {
        status: "complete",
        actionsPerHour: 100,
        inputs: action.inputItems.map((input) => {
          const isUpgradeItem = input.itemHrid === action.upgradeItemHrid;
          return {
            itemHrid: input.itemHrid,
            isUpgradeItem,
            effectiveCount: (isUpgradeItem ? 1 : 0) + input.count * 0.8,
          };
        }),
        outputs: action.outputItems.map((output) => ({
          ...output,
          effectiveCount: output.count,
        })),
        teaEffects: {
          drinks: [{ itemHrid: "/items/artisan_tea", countPerHour: 12 }],
        },
      };
    };
    const values = prices({
      [rootItemHrid]: rootPrice,
      [targetHrid]: 1,
      "/items/artisan_tea": 500,
    });
    for (const [tier] of tiers.slice(0, -1)) {
      values[`/items/${tier}_${type}_charm`] = 1;
    }
    const plan = calculateEnhancementPlan({
      itemHrid: targetHrid,
      targetLevel: 1,
      itemDetailMap: details,
      actionDetailMap: actions,
      shopItemDetailMap: {
        [`/shop_items/trainee_${type}_charm`]: {
          itemHrid: traineeHrid,
          costs: [{ itemHrid: "/items/coin", count: 250_000 }],
        },
      },
      bonusMultiplierTable: MULTIPLIERS,
      getFairValue: (hrid) => values[hrid] ?? 0,
      getMarketValue: (hrid) => values[hrid] ?? 0,
      projectAction,
    });

    let expectedBaseCost = craftBasic
      ? 10_000 * 0.8 * rootPrice + (12 / 100) * 500
      : rootPrice;
    for (const [, , inputCount] of tiers) {
      expectedBaseCost =
        (1 + inputCount * 0.8) * expectedBaseCost + (12 / 100) * 500;
    }
    assert.equal(plan.status, "complete");
    assert.ok(Math.abs(plan.baseCost - expectedBaseCost) < 1e-6);
    return plan;
  };

  makePlan({
    type: "attack",
    rootItemHrid: "/items/basic_attack_charm",
    rootPrice: 1_000,
    craftBasic: false,
  });
  makePlan({
    type: "enhancing",
    rootItemHrid: "/items/enhancing_essence",
    rootPrice: 100,
    craftBasic: true,
  });
});

test("enhancement and protection consumables use market values instead of acquisition costs", () => {
  const acquisitionValues = prices({
    "/items/target": 40_000,
    "/items/material": 1,
    "/items/special_protection": 1,
    "/items/mirror_of_protection": 1,
    "/items/philosophers_mirror": 1,
    "/items/ultra_enhancing_tea": 1,
    "/items/blessed_tea": 1,
  });
  const marketValues = prices({
    "/items/target": 100_000,
    "/items/material": 2_000,
    "/items/special_protection": 50_000,
    "/items/mirror_of_protection": 80_000,
    "/items/philosophers_mirror": 1_000_000,
    "/items/ultra_enhancing_tea": 1_500,
    "/items/blessed_tea": 750,
  });
  const acquisitionCalls = [];
  const marketCalls = [];
  const plan = calculateEnhancementPlan({
    itemHrid: "/items/target",
    targetLevel: 10,
    itemDetailMap: itemDetailMap(),
    bonusMultiplierTable: MULTIPLIERS,
    getFairValue: (hrid) => {
      acquisitionCalls.push(hrid);
      return acquisitionValues[hrid] ?? 0;
    },
    getMarketValue: (hrid) => {
      marketCalls.push(hrid);
      return marketValues[hrid] ?? 0;
    },
  });

  assert.equal(plan.status, "complete");
  assert.equal(plan.baseCost, 40_000);
  assert.deepEqual(acquisitionCalls, ["/items/target"]);
  assert.ok(marketCalls.includes("/items/material"));
  assert.ok(marketCalls.includes("/items/ultra_enhancing_tea"));
  assert.ok(marketCalls.includes("/items/blessed_tea"));
  assert.ok(marketCalls.includes("/items/target"));
  assert.ok(marketCalls.includes("/items/special_protection"));
  assert.ok(marketCalls.includes("/items/mirror_of_protection"));
  assert.ok(marketCalls.includes("/items/philosophers_mirror"));
  assert.equal(plan.protectionItemHrid, "/items/special_protection");
  assert.equal(plan.protectionUnitCost, 50_000);
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
  assert.equal(Number.isInteger(plan.aCount), true);
  assert.equal(Number.isInteger(plan.bCount), true);
  assert.equal(
    plan.expectedPhilosopherMirrorCount,
    plan.aCount + plan.bCount - 1,
  );
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

test("refining cost uses artisan-adjusted inputs and includes crafting drinks", () => {
  const values = prices({
    "/items/refining_shard": 300,
    "/items/artisan_tea": 500,
  });
  const actionDetailMap = {
    "/actions/refine_target": {
      upgradeItemHrid: "/items/target",
      inputItems: [{ itemHrid: "/items/refining_shard", count: 100 }],
      outputItems: [{ itemHrid: "/items/target_refined", count: 1 }],
    },
  };
  const options = {
    targetLevel: 10,
    itemDetailMap: itemDetailMap(),
    actionDetailMap,
    bonusMultiplierTable: MULTIPLIERS,
    getFairValue: (hrid) => values[hrid] ?? 0,
    projectAction: (actionHrid, count, context) => {
      assert.equal(actionHrid, "/actions/refine_target");
      assert.equal(count, 1);
      assert.equal(context.respectInventoryLimit, false);
      return {
        status: "complete",
        actionsPerHour: 100,
        inputs: [
          {
            itemHrid: "/items/target",
            effectiveCount: 1,
            isUpgradeItem: true,
          },
          {
            itemHrid: "/items/refining_shard",
            effectiveCount: 80,
            isUpgradeItem: false,
          },
        ],
        teaEffects: {
          drinks: [{ itemHrid: "/items/artisan_tea", countPerHour: 12 }],
        },
      };
    },
  };
  const base = calculateEnhancementPlan({
    ...options,
    itemHrid: "/items/target",
  });
  const refined = calculateEnhancementPlan({
    ...options,
    itemHrid: "/items/target_refined",
  });
  const expectedRefinementCost = 80 * 300 + (12 / 100) * 500;

  assert.equal(refined.refinementCost, expectedRefinementCost);
  assert.ok(
    Math.abs(refined.totalCost - base.totalCost - expectedRefinementCost) <
      1e-6,
  );
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
