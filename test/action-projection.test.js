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
await import("../src/core/asset-values.js");

runtime.state.initData_actionDetailMap = {
  "/actions/crafting/test": {
    hrid: "/actions/crafting/test",
    type: "/action_types/crafting",
    baseTimeCost: 10_000_000_000,
    inputItems: [{ itemHrid: "/items/input", count: 2 }],
    outputItems: [{ itemHrid: "/items/output", count: 1 }],
  },
  "/actions/foraging/test": {
    hrid: "/actions/foraging/test",
    type: "/action_types/foraging",
    baseTimeCost: 10_000_000_000,
    inputItems: [],
    outputItems: [{ itemHrid: "/items/output", count: 1 }],
  },
  "/actions/milking/rainbow-cow": {
    hrid: "/actions/milking/rainbow-cow",
    type: "/action_types/milking",
    sortIndex: 10,
    baseTimeCost: 10_000_000_000,
    dropTable: [
      {
        itemHrid: "/items/rainbow_milk",
        dropRate: 0.5,
        minCount: 2,
        maxCount: 4,
      },
    ],
  },
  "/actions/combat/rainbow-cow": {
    hrid: "/actions/combat/rainbow-cow",
    type: "/action_types/combat",
    sortIndex: 1,
    dropTable: [
      {
        itemHrid: "/items/rainbow_milk",
        dropRate: 1,
        minCount: 99,
        maxCount: 99,
      },
    ],
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
runtime.api.getBidPrice = (itemHrid) => (itemHrid === "/items/input" ? 8 : 0);
runtime.api.getNetSellPriceAtAsk = (itemHrid) =>
  itemHrid === "/items/output" ? 114 : 0;
runtime.api.getFairValue = (itemHrid) => {
  const ask = runtime.api.getAskPrice(itemHrid);
  if (ask > 0) return ask;
  const netSell = runtime.api.getNetSellPrice(itemHrid);
  return netSell > 0 ? netSell / 0.95 : 0;
};
runtime.api.getAssetAskPrice = (...args) => runtime.api.getAskPrice(...args);
runtime.api.getAssetBidPrice = (...args) => runtime.api.getBidPrice(...args);
runtime.api.getAssetFairValue = (...args) => runtime.api.getFairValue(...args);
runtime.api.getAssetNetSellPrice = (...args) =>
  runtime.api.getNetSellPrice(...args);
runtime.api.getAssetNetSellPriceAtAsk = (...args) =>
  runtime.api.getNetSellPriceAtAsk(...args);

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
  assert.equal(result.valuationMode, "fair");
  assert.equal(result.valuations.conservative.netProfitPerAction, 80);
  assert.equal(result.valuations.fair.netProfitPerAction, 80);
  assert.equal(result.valuations.aggressive.netProfitPerAction, 98);
});

test("crafting-cost projection applies Artisan reduction, concentration, and drink cost", () => {
  const previous = {
    actions: runtime.state.initData_actionDetailMap,
    items: runtime.state.initData_itemDetailMap,
    slots: runtime.state.initData_actionTypeDrinkSlotsMap,
    equipment: runtime.state.currentEquipmentMap,
  };
  runtime.state.initData_actionDetailMap = {
    ...previous.actions,
    "/actions/crafting/key": {
      hrid: "/actions/crafting/key",
      type: "/action_types/crafting",
      baseTimeCost: 10_000_000_000,
      inputItems: [
        { itemHrid: "/items/input", count: 2 },
        { itemHrid: "/items/key_base", count: 2 },
      ],
      upgradeItemHrid: "/items/key_base",
      outputItems: [{ itemHrid: "/items/key", count: 2 }],
    },
  };
  runtime.state.initData_itemDetailMap = {
    ...previous.items,
    "/items/artisan_tea": {
      consumableDetail: {
        buffs: [{ typeHrid: "/buff_types/artisan", flatBoost: 0.1 }],
      },
    },
    "/items/guzzling_pouch": {
      equipmentDetail: {
        noncombatStats: { drinkConcentration: 0.5 },
        noncombatEnhancementBonuses: { drinkConcentration: 0.5 },
      },
    },
  };
  runtime.state.initData_actionTypeDrinkSlotsMap = {
    "/action_types/crafting": [{ itemHrid: "/items/artisan_tea" }],
  };
  runtime.state.currentEquipmentMap = {
    back: { itemHrid: "/items/guzzling_pouch", enhancementLevel: 0 },
  };

  try {
    const result = runtime.api.projectActionCraftingCost(
      "/actions/crafting/key",
      {
        getUnitPrice: (itemHrid) =>
          ({
            "/items/input": 10,
            "/items/key_base": 20,
            "/items/artisan_tea": 100,
          })[itemHrid] ?? 0,
      },
    );

    assert.equal(result.status, "complete");
    assert.equal(result.teaEffects.concentrationMultiplier, 1.5);
    assert.ok(Math.abs(result.teaEffects.lessResource - 0.15) < 1e-12);
    assert.ok(Math.abs(result.inputs[0].effectiveCount - 1.7) < 1e-12);
    assert.ok(Math.abs(result.inputs[1].effectiveCount - 2.7) < 1e-12);
    assert.equal(result.materialCostPerAction, 71);
    assert.equal(result.drinks[0].countPerHour, 18);
    assert.equal(result.teaCostPerAction, 5);
    assert.equal(result.totalCostPerAction, 76);
    assert.deepEqual(result.outputs, [{ itemHrid: "/items/key", count: 2 }]);
  } finally {
    runtime.state.initData_actionDetailMap = previous.actions;
    runtime.state.initData_itemDetailMap = previous.items;
    runtime.state.initData_actionTypeDrinkSlotsMap = previous.slots;
    runtime.state.currentEquipmentMap = previous.equipment;
  }
});

test("production resolver maps gathering drop tables and excludes combat loot", () => {
  assert.equal(
    runtime.api.resolveProductionActionByItemHrid("/items/rainbow_milk"),
    "/actions/milking/rainbow-cow",
  );
  assert.deepEqual(
    runtime.api.getExpectedOutputs(
      runtime.state.initData_actionDetailMap["/actions/milking/rainbow-cow"],
    ),
    [{ itemHrid: "/items/rainbow_milk", count: 1.5 }],
  );
});

test("projection exposes market, high-buy-low-sell, and low-buy-high-sell valuations", () => {
  const originalFairValue = runtime.api.getFairValue;
  runtime.api.getFairValue = (itemHrid) =>
    itemHrid === "/items/input" ? 9 : itemHrid === "/items/output" ? 110 : 0;

  const result = runtime.api.projectAction("/actions/crafting/test", 1);
  assert.equal(result.netProfitPerAction, 86.5);
  assert.equal(result.valuations.conservative.netProfitPerAction, 80);
  assert.equal(result.valuations.fair.netProfitPerAction, 86.5);
  assert.equal(result.valuations.aggressive.netProfitPerAction, 98);
  assert.equal(runtime.settings.settingsMap.profitValuationMode, undefined);

  runtime.api.getFairValue = originalFairValue;
});

test("missing prices stay incomplete instead of becoming zero-profit", () => {
  runtime.api.getNetSellPrice = () => 0;
  const result = runtime.api.projectAction("/actions/crafting/test", 1);
  assert.equal(result.status, "incomplete");
  assert.equal(result.netProfitPerAction, null);
  assert.deepEqual(result.missingPrices, ["/items/output"]);
});

test("infinite production is capped by live material inventory", () => {
  runtime.api.getAskPrice = (itemHrid) =>
    itemHrid === "/items/input" ? 10 : 0;
  runtime.api.getNetSellPrice = (itemHrid) =>
    itemHrid === "/items/output" ? 100 : 0;
  const action = {
    actionHrid: "/actions/crafting/test",
    hasMaxCount: false,
    maxCount: 0,
    currentCount: 100,
  };
  const result = runtime.api.projectAction(action);
  assert.equal(result.infinite, true);
  assert.equal(result.effectivelyInfinite, false);
  assert.equal(result.materialLimited, true);
  assert.equal(result.effectiveCount, 10);
  assert.equal(result.totalSeconds, 100);
  assert.equal(result.outputs[0].expectedCount, 10);
  assert.equal(result.totalProfit, 800);

  const queue = runtime.api.projectQueue(
    [
      action,
      {
        actionHrid: "/actions/crafting/test",
        hasMaxCount: true,
        maxCount: 1,
        currentCount: 0,
      },
    ],
    { now: 1_000 },
  );
  assert.equal(queue.hasInfinite, false);
  assert.equal(queue.items[1].startsAt, 101_000);
  assert.equal(queue.finishAt, 111_000);
});

test("empty inventory keeps an infinite production request infinite", () => {
  const input = runtime.state.initData_characterItems.find(
    ({ itemHrid }) => itemHrid === "/items/input",
  );
  const previousCount = input.count;
  input.count = 0;
  const result = runtime.api.projectAction({
    actionHrid: "/actions/crafting/test",
    hasMaxCount: false,
  });
  assert.equal(result.maxCraftable, 0);
  assert.equal(result.effectiveCount, Infinity);
  assert.equal(result.effectivelyInfinite, true);
  assert.equal(result.materialLimited, false);
  assert.equal(result.totalSeconds, Infinity);

  const explicitlyLimited = runtime.api.projectAction(
    "/actions/crafting/test",
    Infinity,
    { respectInventoryLimit: true },
  );
  assert.equal(explicitlyLimited.respectsInventoryLimit, true);
  assert.equal(explicitlyLimited.maxCraftable, 0);
  assert.equal(explicitlyLimited.effectiveCount, 0);
  assert.equal(explicitlyLimited.effectivelyInfinite, false);
  assert.equal(explicitlyLimited.totalSeconds, 0);
  assert.equal(explicitlyLimited.outputs[0].expectedCount, 0);
  assert.equal(explicitlyLimited.totalProfit, 0);
  input.count = previousCount;
});

test("infinite gathering without inputs remains effectively infinite", () => {
  const action = {
    actionHrid: "/actions/foraging/test",
    hasMaxCount: false,
  };
  const result = runtime.api.projectAction(action);
  assert.equal(result.infinite, true);
  assert.equal(result.effectivelyInfinite, true);
  assert.equal(result.materialLimited, false);
  assert.equal(result.effectiveCount, Infinity);
  assert.equal(result.totalSeconds, Infinity);

  const queue = runtime.api.projectQueue([action], { now: 1_000 });
  assert.equal(queue.hasInfinite, true);
  assert.equal(queue.finishAt, null);
});

test("explicit planning counts are not capped by current inventory", () => {
  const result = runtime.api.projectAction("/actions/crafting/test", 100);
  assert.equal(result.respectsInventoryLimit, false);
  assert.equal(result.maxCraftable, 10);
  assert.equal(result.effectiveCount, 100);
  assert.equal(result.totalSeconds, 1_000);
  assert.equal(result.outputs[0].expectedCount, 100);
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
    inputItems: [
      { itemHrid: "/items/base", count: 8 },
      { itemHrid: "/items/input", count: 2 },
    ],
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
  assert.deepEqual(result.missingPrices, []);
  assert.equal(result.status, "complete");
  assert.equal(result.cycleSeconds, 3);
  assert.equal(result.actionsPerHour, 1_200);
  assert.equal(result.teaEffects.concentrationMultiplier, 1.1);
  assert.ok(Math.abs(result.teaEffects.lessResource - 0.11) < 1e-12);
  assert.ok(Math.abs(result.teaEffects.quantity - 0.22) < 1e-12);
  assert.ok(
    Math.abs(
      result.inputs.find((item) => item.itemHrid === "/items/base")
        .effectiveCount - 8.12,
    ) < 1e-12,
  );
  assert.equal(
    result.inputs.find((item) => item.itemHrid === "/items/input")
      .effectiveCount,
    1.78,
  );
  assert.ok(Math.abs(result.materialCostPerAction - 423.8) < 1e-12);
  assert.ok(Math.abs(result.primaryRevenuePerAction - 122) < 1e-12);
  assert.ok(Math.abs(result.byproductRevenuePerAction - 186) < 1e-12);
  assert.ok(Math.abs(result.teaCostPerHour - 1_320) < 1e-12);
  assert.ok(Math.abs(result.netProfitPerAction - -116.9) < 1e-12);
  assert.ok(Math.abs(result.profitPerHour - -140_280) < 1e-8);
});

test("production profiles combine community timing buffs and pouch overrides", () => {
  const previousBuffs = runtime.state.actionTypeBuffSources;
  const previousEfficiency = runtime.api.getTotalEffiPercentage;
  runtime.state.actionTypeBuffSources = {
    communityActionTypeBuffsMap: {
      "/action_types/crafting": [
        { typeHrid: "/buff_types/action_speed", flatBoost: 0.2 },
      ],
    },
  };
  runtime.api.getTotalEffiPercentage = () => 50;

  const profile = runtime.api.getActionProductionProfile(
    "/actions/crafting/tea-test",
    { guzzlingPouchLevel: 0 },
  );
  assert.equal(profile.status, "complete");
  assert.equal(profile.speedPercent, 20);
  assert.equal(profile.efficiencyPercent, 50);
  assert.ok(Math.abs(profile.teaEffects.lessResource - 0.11) < 1e-12);
  assert.ok(Math.abs(profile.outputs[0].count - 1.22) < 1e-12);
  assert.ok(Math.abs(profile.secondsPerAction - 20 / 9) < 1e-12);

  runtime.state.actionTypeBuffSources = previousBuffs;
  runtime.api.getTotalEffiPercentage = previousEfficiency;
});

test("efficiency tea reads a ten-percent buff while five remains its duration in minutes", () => {
  const previous = {
    actions: runtime.state.initData_actionDetailMap,
    items: runtime.state.initData_itemDetailMap,
    slots: runtime.state.initData_actionTypeDrinkSlotsMap,
    equipment: runtime.state.currentEquipmentMap,
  };
  runtime.state.initData_actionDetailMap = {
    ...previous.actions,
    "/actions/crafting/efficiency-tea-test": {
      hrid: "/actions/crafting/efficiency-tea-test",
      type: "/action_types/crafting",
      baseTimeCost: 10_000_000_000,
      outputItems: [{ itemHrid: "/items/output", count: 1 }],
    },
  };
  runtime.state.initData_itemDetailMap = {
    ...previous.items,
    "/items/efficiency_tea": {
      consumableDetail: {
        buffs: [{ typeHrid: "/buff_types/efficiency", flatBoost: 0.1 }],
        cooldownDuration: 5 * 60 * 1_000_000_000,
      },
    },
  };
  runtime.state.initData_actionTypeDrinkSlotsMap = {
    "/action_types/crafting": [{ itemHrid: "/items/efficiency_tea" }],
  };
  runtime.state.currentEquipmentMap = {};

  const base = runtime.api.getActionProductionProfile(
    "/actions/crafting/efficiency-tea-test",
  );
  assert.equal(base.teaEffects.efficiency, 0.1);
  assert.equal(
    runtime.state.initData_itemDetailMap["/items/efficiency_tea"]
      .consumableDetail.cooldownDuration /
      1_000_000_000 /
      60,
    5,
  );

  runtime.state.initData_itemDetailMap["/items/guzzling_pouch"] = {
    equipmentDetail: {
      noncombatStats: { drinkConcentration: 0.5 },
      noncombatEnhancementBonuses: { drinkConcentration: 0.5 },
    },
  };
  const concentrated = runtime.api.getActionProductionProfile(
    "/actions/crafting/efficiency-tea-test",
    { guzzlingPouchLevel: 0 },
  );
  assert.equal(concentrated.teaEffects.concentrationMultiplier, 1.5);
  assert.ok(Math.abs(concentrated.teaEffects.efficiency - 0.15) < 1e-12);

  runtime.state.initData_actionDetailMap = previous.actions;
  runtime.state.initData_itemDetailMap = previous.items;
  runtime.state.initData_actionTypeDrinkSlotsMap = previous.slots;
  runtime.state.currentEquipmentMap = previous.equipment;
});

test("production costs fall back to market value and expose fallback item HRIDs", () => {
  const previous = {
    ask: runtime.api.getAskPrice,
    bid: runtime.api.getBidPrice,
    fair: runtime.api.getFairValue,
    slots: runtime.state.initData_actionTypeDrinkSlotsMap,
  };
  runtime.api.getAskPrice = () => 0;
  runtime.api.getBidPrice = () => 0;
  runtime.api.getFairValue = (itemHrid) =>
    itemHrid === "/items/input" ? 9 : 0;
  runtime.state.initData_actionTypeDrinkSlotsMap = {
    ...previous.slots,
    "/action_types/crafting": [],
  };

  let result = runtime.api.projectAction("/actions/crafting/test", 1);
  for (const mode of ["conservative", "aggressive"]) {
    assert.equal(result.valuations[mode].costComplete, true);
    assert.equal(result.valuations[mode].materialCostPerAction, 18);
    assert.deepEqual(result.valuations[mode].fallbackItemHrids, [
      "/items/input",
    ]);
  }

  runtime.api.getFairValue = () => 0;
  result = runtime.api.projectAction("/actions/crafting/test", 1);
  assert.equal(result.valuations.conservative.costComplete, false);
  assert.deepEqual(result.valuations.conservative.costMissingPrices, [
    "/items/input",
  ]);

  runtime.api.getAskPrice = previous.ask;
  runtime.api.getBidPrice = previous.bid;
  runtime.api.getFairValue = previous.fair;
  runtime.state.initData_actionTypeDrinkSlotsMap = previous.slots;
});

test("gathering processing tea splits raw drops into recipe outputs", () => {
  const previous = {
    actions: runtime.state.initData_actionDetailMap,
    items: runtime.state.initData_itemDetailMap,
    slots: runtime.state.initData_actionTypeDrinkSlotsMap,
    equipment: runtime.state.currentEquipmentMap,
    buffs: runtime.state.actionTypeBuffSources,
    ask: runtime.api.getAskPrice,
    netSell: runtime.api.getNetSellPrice,
    fair: runtime.api.getFairValue,
  };
  runtime.state.initData_actionDetailMap = {
    ...previous.actions,
    "/actions/foraging/cotton": {
      hrid: "/actions/foraging/cotton",
      type: "/action_types/foraging",
      baseTimeCost: 10_000_000_000,
      dropTable: [
        {
          itemHrid: "/items/cotton",
          dropRate: 1,
          minCount: 1,
          maxCount: 3,
        },
      ],
    },
    "/actions/tailoring/cotton_fabric": {
      hrid: "/actions/tailoring/cotton_fabric",
      type: "/action_types/tailoring",
      inputItems: [{ itemHrid: "/items/cotton", count: 2 }],
      outputItems: [{ itemHrid: "/items/cotton_fabric", count: 1 }],
    },
  };
  runtime.state.initData_itemDetailMap = {
    "/items/processing_tea": {
      consumableDetail: {
        buffs: [{ typeHrid: "/buff_types/processing", flatBoost: 0.25 }],
      },
    },
  };
  runtime.state.initData_actionTypeDrinkSlotsMap = {
    "/action_types/foraging": [{ itemHrid: "/items/processing_tea" }],
  };
  runtime.state.currentEquipmentMap = {};
  runtime.state.actionTypeBuffSources = {};
  runtime.api.getAskPrice = (itemHrid) =>
    itemHrid === "/items/processing_tea" ? 1 : 0;
  runtime.api.getNetSellPrice = (itemHrid) =>
    ({ "/items/cotton": 10, "/items/cotton_fabric": 100 })[itemHrid] ?? 0;
  runtime.api.getFairValue = (itemHrid) =>
    runtime.api.getAskPrice(itemHrid) || runtime.api.getNetSellPrice(itemHrid);

  const result = runtime.api.projectAction("/actions/foraging/cotton", 1);
  assert.equal(result.status, "complete");
  assert.equal(result.outputs.length, 2);
  assert.equal(result.outputs[0].itemHrid, "/items/cotton");
  assert.equal(result.outputs[0].effectiveCount, 1.5);
  assert.equal(result.outputs[1].itemHrid, "/items/cotton_fabric");
  assert.equal(result.outputs[1].effectiveCount, 0.25);
  assert.equal(result.primaryRevenuePerAction, 38);

  runtime.state.initData_actionDetailMap = previous.actions;
  runtime.state.initData_itemDetailMap = previous.items;
  runtime.state.initData_actionTypeDrinkSlotsMap = previous.slots;
  runtime.state.currentEquipmentMap = previous.equipment;
  runtime.state.actionTypeBuffSources = previous.buffs;
  runtime.api.getAskPrice = previous.ask;
  runtime.api.getNetSellPrice = previous.netSell;
  runtime.api.getFairValue = previous.fair;
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

test("rare openables use three derived values and report missing inner drops", () => {
  runtime.state.initData_actionDetailMap["/actions/foraging/rare-crate"] = {
    hrid: "/actions/foraging/rare-crate",
    type: "/action_types/foraging",
    baseTimeCost: 10_000_000_000,
    inputItems: [],
    outputItems: [{ itemHrid: "/items/output", count: 1 }],
    rareDropTable: [
      {
        itemHrid: "/items/large_artisans_crate",
        dropRate: 0.1,
        minCount: 1,
        maxCount: 1,
      },
    ],
  };
  runtime.state.initData_openableLootDropMap = {
    "/items/large_artisans_crate": [
      {
        itemHrid: "/items/rare_leaf",
        dropRate: 1,
        minCount: 2,
        maxCount: 2,
      },
      {
        itemHrid: "/items/missing_leaf",
        dropRate: 0.25,
        minCount: 1,
        maxCount: 1,
      },
    ],
  };
  runtime.state.initData_itemDetailMap = {};
  const originals = {
    ask: runtime.api.getAskPrice,
    bid: runtime.api.getBidPrice,
    fair: runtime.api.getFairValue,
    conservative: runtime.api.getNetSellPrice,
    aggressive: runtime.api.getNetSellPriceAtAsk,
    tax: runtime.api.getMarketTaxRate,
  };
  runtime.api.getAskPrice = () => 0;
  runtime.api.getBidPrice = () => 0;
  runtime.api.getNetSellPrice = (itemHrid) =>
    itemHrid === "/items/output"
      ? 100
      : itemHrid === "/items/rare_leaf"
        ? 90
        : 0;
  runtime.api.getFairValue = (itemHrid) =>
    itemHrid === "/items/output"
      ? 100 / 0.95
      : itemHrid === "/items/rare_leaf"
        ? 110
        : 0;
  runtime.api.getNetSellPriceAtAsk = (itemHrid) =>
    itemHrid === "/items/output"
      ? 120
      : itemHrid === "/items/rare_leaf"
        ? 135
        : 0;
  runtime.api.getMarketTaxRate = () => 0.05;
  runtime.api.invalidateAssetValueCache();

  const result = runtime.api.projectAction("/actions/foraging/rare-crate", 1);
  assert.equal(result.status, "complete");
  assert.equal(result.isPartial, true);
  assert.equal(result.byproductOutputs[0].valueSource, "derived");
  assert.equal(result.valuations.conservative.byproductRevenuePerAction, 18);
  assert.ok(
    Math.abs(result.valuations.fair.byproductRevenuePerAction - 20.9) < 1e-10,
  );
  assert.equal(result.valuations.aggressive.byproductRevenuePerAction, 27);
  assert.deepEqual(result.derivedMissingPrices, ["/items/missing_leaf"]);

  Object.assign(runtime.api, {
    getAskPrice: originals.ask,
    getBidPrice: originals.bid,
    getFairValue: originals.fair,
    getNetSellPrice: originals.conservative,
    getNetSellPriceAtAsk: originals.aggressive,
    getMarketTaxRate: originals.tax,
  });
  runtime.api.invalidateAssetValueCache();
});

test("unpriced optional drops produce a partial result instead of hiding profit", () => {
  runtime.api.getNetSellPrice = (itemHrid) =>
    ({
      "/items/tea-output": 100,
      "/items/essence": 20,
    })[itemHrid] ?? 0;
  const result = runtime.api.projectAction("/actions/crafting/tea-test", 1);
  assert.deepEqual(result.missingPrices, []);
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

test("alchemy projections use selected stacks, bulk size, catalyst, coins and live progress", () => {
  const previous = {
    actions: runtime.state.initData_actionDetailMap,
    items: runtime.state.initData_itemDetailMap,
    inventory: runtime.state.initData_characterItems,
    slots: runtime.state.initData_actionTypeDrinkSlotsMap,
  };
  const actionHrids = [
    "/actions/alchemy/coinify",
    "/actions/alchemy/decompose",
    "/actions/alchemy/transmute",
    "/actions/alchemy/unrefine",
  ];
  runtime.state.initData_actionDetailMap = Object.fromEntries(
    actionHrids.map((hrid) => [
      hrid,
      {
        hrid,
        type: "/action_types/alchemy",
        function: "/action_functions/alchemy",
        baseTimeCost: 10_000_000_000,
      },
    ]),
  );
  runtime.state.initData_itemDetailMap = {
    "/items/alchemy_target": {
      itemLevel: 10,
      sellPrice: 1_000,
      alchemyDetail: { bulkMultiplier: 5 },
    },
    "/items/catalyst": {},
    "/items/coin": {},
  };
  runtime.state.initData_characterItems = [
    {
      hash: "target-stack",
      itemHrid: "/items/alchemy_target",
      itemLocationHrid: "/item_locations/inventory",
      count: 25,
    },
    {
      hash: "catalyst-stack",
      itemHrid: "/items/catalyst",
      itemLocationHrid: "/item_locations/inventory",
      count: 1,
    },
    {
      hash: "coin-stack",
      itemHrid: "/items/coin",
      itemLocationHrid: "/item_locations/inventory",
      count: 1_200,
    },
  ];
  runtime.state.initData_actionTypeDrinkSlotsMap = {
    "/action_types/alchemy": [],
  };

  const capacityByAction = Object.fromEntries(
    actionHrids.map((actionHrid) => {
      const result = runtime.api.projectAction({
        actionHrid,
        primaryItemHash: "target-stack",
        hasMaxCount: false,
      });
      return [actionHrid, result.maxCraftable];
    }),
  );
  assert.deepEqual(capacityByAction, {
    "/actions/alchemy/coinify": 5,
    "/actions/alchemy/decompose": 2,
    "/actions/alchemy/transmute": 1,
    "/actions/alchemy/unrefine": 2,
  });

  const catalystLimited = runtime.api.projectAction({
    actionHrid: "/actions/alchemy/coinify",
    primaryItemHash: "target-stack",
    secondaryItemHash: "catalyst-stack",
    hasMaxCount: false,
  });
  assert.equal(catalystLimited.effectiveCount, 1);
  assert.equal(catalystLimited.totalSeconds, 10);

  const finite = runtime.api.projectAction(
    {
      actionHrid: "/actions/alchemy/coinify",
      primaryItemHash: "target-stack",
      hasMaxCount: true,
      maxCount: 5,
      currentCount: 2,
    },
    undefined,
    { durationPerAction: 10, currentCycleRemainingSeconds: 2 },
  );
  assert.equal(finite.effectiveCount, 3);
  assert.equal(finite.totalSeconds, 22);

  const missingSelection = runtime.api.projectAction({
    actionHrid: "/actions/alchemy/coinify",
    hasMaxCount: false,
  });
  assert.equal(missingSelection.status, "waiting");
  assert.deepEqual(missingSelection.missing, ["primaryItem"]);
  assert.equal(missingSelection.totalSeconds, null);

  runtime.state.initData_actionDetailMap = previous.actions;
  runtime.state.initData_itemDetailMap = previous.items;
  runtime.state.initData_characterItems = previous.inventory;
  runtime.state.initData_actionTypeDrinkSlotsMap = previous.slots;
});
