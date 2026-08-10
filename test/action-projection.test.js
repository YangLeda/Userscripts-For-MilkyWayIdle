import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.window = dom.window;

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
await import("../src/core/action-projection.js");

runtime.state.initData_actionDetailMap = {
  "/actions/crafting/test": {
    hrid: "/actions/crafting/test",
    type: "/action_types/crafting",
    baseTimeCost: 10_000_000_000,
    inputItems: [{ itemHrid: "/items/input", count: 2 }],
    outputItems: [{ itemHrid: "/items/output", count: 1 }],
  },
};
runtime.state.initData_characterItems = [
  {
    itemHrid: "/items/input",
    itemLocationHrid: "/item_locations/inventory",
    count: 20,
  },
];
runtime.state.initData_characterSkills = [];
runtime.state.initData_actionTypeDrinkSlotsMap = {};
runtime.state.initData_itemDetailMap = {};
runtime.state.currentEquipmentMap = {};
runtime.state.actionTypeBuffSources = {};
runtime.api.getToolsSpeedBuffByActionHrid = () => 0;
runtime.api.getTotalEffiPercentage = () => 0;
runtime.api.getTeaBuffsByActionHrid = () => ({
  efficiency: 0,
  lessResource: 0,
  quantity: 0,
});
runtime.api.getAskPrice = (itemHrid) => (itemHrid === "/items/input" ? 10 : 0);
runtime.api.getNetSellPrice = (itemHrid) =>
  itemHrid === "/items/output" ? 100 : 0;

test("action projection shares duration, direct material capacity and net profit", () => {
  const result = runtime.api.projectAction("/actions/crafting/test", 5, {
    now: 1_000,
  });
  assert.equal(result.status, "complete");
  assert.equal(result.totalSeconds, 50);
  assert.equal(result.finishAt, 51_000);
  assert.equal(result.maxCraftable, 10);
  assert.equal(result.outputs[0].expectedCount, 5);
  assert.equal(result.netProfitPerAction, 80);
  assert.equal(result.profitPerHour, 28_800);
  assert.equal(result.totalProfit, 400);
});

test("missing prices stay incomplete instead of becoming zero-profit", () => {
  runtime.api.getNetSellPrice = () => 0;
  const result = runtime.api.projectAction("/actions/crafting/test", 1);
  assert.equal(result.status, "incomplete");
  assert.equal(result.netProfitPerAction, null);
  assert.deepEqual(result.missingPrices, ["/items/output"]);
});

test("actions without a maximum count remain infinite in queue projections", () => {
  const action = {
    actionHrid: "/actions/crafting/test",
    hasMaxCount: false,
    maxCount: 0,
    currentCount: 100,
  };
  const result = runtime.api.projectAction(action);
  assert.equal(result.infinite, true);
  assert.equal(result.totalSeconds, Infinity);
  const queue = runtime.api.projectQueue([action], { now: 1_000 });
  assert.equal(queue.hasInfinite, true);
  assert.equal(queue.finishAt, null);
});

test("an open production panel uses the game's live duration and discrete efficiency rounding", () => {
  runtime.api.getTotalEffiPercentage = () => 156;
  const result = runtime.api.projectAction("/actions/crafting/test", 300, {
    durationPerAction: 6.11,
  });
  assert.equal(result.totalSeconds, 117 * 6.11);
  assert.ok(Math.abs(result.secondsPerAction - 6.11 / 2.56) < 1e-10);
  runtime.api.getTotalEffiPercentage = () => 0;
});

test("a positive production count always takes at least one live action", () => {
  runtime.api.getTotalEffiPercentage = () => 104;
  const result = runtime.api.projectAction("/actions/crafting/test", 1, {
    durationPerAction: 8.87,
  });
  assert.equal(result.totalSeconds, 8.87);
  runtime.api.getTotalEffiPercentage = () => 0;
});

test("the current action projection subtracts elapsed time from its active cycle", () => {
  const result = runtime.api.projectAction(
    {
      actionHrid: "/actions/crafting/test",
      hasMaxCount: true,
      maxCount: 6,
      currentCount: 0,
    },
    undefined,
    {
      now: 1_000,
      durationPerAction: 10,
      currentCycleRemainingSeconds: 3,
    },
  );
  assert.equal(result.totalSeconds, 53);
  assert.equal(result.finishAt, 54_000);
});

test("current artisan and gourmet tea use the equipped pouch concentration", () => {
  runtime.state.initData_actionDetailMap["/actions/crafting/tea-test"] = {
    hrid: "/actions/crafting/tea-test",
    type: "/action_types/crafting",
    baseTimeCost: 4_000_000_000,
    upgradeItemHrid: "/items/base",
    inputItems: [{ itemHrid: "/items/input", count: 2 }],
    outputItems: [{ itemHrid: "/items/tea-output", count: 1 }],
    essenceDropTable: [
      {
        itemHrid: "/items/essence",
        dropRate: 0.5,
        minCount: 2,
        maxCount: 4,
      },
    ],
    rareDropTable: [
      {
        itemHrid: "/items/rare",
        dropRate: 0.1,
        minCount: 1,
        maxCount: 1,
      },
    ],
  };
  runtime.state.initData_itemDetailMap = {
    "/items/artisan_gourmet_tea": {
      consumableDetail: {
        buffs: [
          { typeHrid: "/buff_types/artisan", flatBoost: 0.1 },
          { typeHrid: "/buff_types/gourmet", flatBoost: 0.2 },
        ],
      },
    },
    "/items/guzzling_pouch": {
      equipmentDetail: {
        noncombatStats: { drinkConcentration: 0.1 },
        noncombatEnhancementBonuses: { drinkConcentration: 0.1 },
      },
    },
  };
  runtime.state.initData_actionTypeDrinkSlotsMap = {
    "/action_types/crafting": [{ itemHrid: "/items/artisan_gourmet_tea" }],
  };
  runtime.state.currentEquipmentMap = {
    pouch: {
      itemHrid: "/items/guzzling_pouch",
      itemLocationHrid: "/item_locations/pouch",
      enhancementLevel: 0,
      count: 1,
    },
  };
  runtime.state.actionTypeBuffSources = {
    equipmentActionTypeBuffsMap: {
      "/action_types/crafting": [
        { typeHrid: "/buff_types/action_speed", flatBoost: 0.5 },
        { typeHrid: "/buff_types/essence_find", flatBoost: 0.2 },
        { typeHrid: "/buff_types/rare_find", flatBoost: 0.5 },
      ],
    },
  };
  runtime.state.initData_characterItems = [
    {
      itemHrid: "/items/input",
      itemLocationHrid: "/item_locations/inventory",
      count: 200,
    },
  ];
  runtime.api.getAskPrice = (itemHrid) =>
    ({
      "/items/artisan_gourmet_tea": 100,
      "/items/base": 50,
      "/items/input": 10,
    })[itemHrid] ?? 0;
  runtime.api.getNetSellPrice = (itemHrid) =>
    ({
      "/items/tea-output": 100,
      "/items/essence": 20,
      "/items/rare": 1_000,
    })[itemHrid] ?? 0;
  runtime.api.getTotalEffiPercentage = () => 0;

  const result = runtime.api.projectAction("/actions/crafting/tea-test", 1);
  assert.equal(result.status, "complete");
  assert.equal(result.cycleSeconds, 3);
  assert.equal(result.actionsPerHour, 1_200);
  assert.equal(result.teaEffects.concentrationMultiplier, 1.1);
  assert.ok(Math.abs(result.teaEffects.lessResource - 0.11) < 1e-12);
  assert.ok(Math.abs(result.teaEffects.quantity - 0.22) < 1e-12);
  assert.equal(
    result.inputs.find((item) => item.itemHrid === "/items/base")
      .effectiveCount,
    1,
  );
  assert.equal(
    result.inputs.find((item) => item.itemHrid === "/items/input")
      .effectiveCount,
    1.78,
  );
  assert.ok(Math.abs(result.materialCostPerAction - 67.8) < 1e-12);
  assert.ok(Math.abs(result.primaryRevenuePerAction - 122) < 1e-12);
  assert.ok(Math.abs(result.byproductRevenuePerAction - 186) < 1e-12);
  assert.ok(Math.abs(result.teaCostPerHour - 1_320) < 1e-12);
  assert.ok(Math.abs(result.netProfitPerAction - 239.1) < 1e-12);
  assert.ok(Math.abs(result.profitPerHour - 286_920) < 1e-8);
});

test("tea effects are zero when the current player has no selected drinks", () => {
  runtime.state.initData_actionTypeDrinkSlotsMap = {
    "/action_types/crafting": [],
  };
  const result = runtime.api.projectAction("/actions/crafting/tea-test", 1);
  assert.equal(result.teaEffects.lessResource, 0);
  assert.equal(result.teaEffects.quantity, 0);
  assert.equal(result.teaCostPerHour, 0);
  assert.equal(
    result.inputs.find((item) => item.itemHrid === "/items/input")
      .effectiveCount,
    2,
  );
});

test("unpriced optional drops produce a partial result instead of hiding profit", () => {
  runtime.api.getNetSellPrice = (itemHrid) =>
    ({
      "/items/tea-output": 100,
      "/items/essence": 20,
    })[itemHrid] ?? 0;
  const result = runtime.api.projectAction("/actions/crafting/tea-test", 1);
  assert.equal(result.status, "complete");
  assert.equal(result.isPartial, true);
  assert.deepEqual(result.unpricedByproducts, ["/items/rare"]);
  assert.equal(result.byproductRevenuePerAction, 36);
});

test("projection waits for actual character data instead of applying defaults", () => {
  const skills = runtime.state.initData_characterSkills;
  runtime.state.initData_characterSkills = null;
  const result = runtime.api.projectAction("/actions/crafting/tea-test", 1);
  assert.equal(result.status, "waiting");
  assert.deepEqual(result.missing, ["playerData"]);
  assert.equal(result.profitPerHour, null);
  runtime.state.initData_characterSkills = skills;
});
