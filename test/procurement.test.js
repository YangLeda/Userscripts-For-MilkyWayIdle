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
globalThis.Event = dom.window.Event;

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/data/translations.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
await import("../src/core/action-projection.js");
await import("../src/core/procurement.js");

const procurement = runtime.api.procurement;

runtime.state.initData_itemDetailMap = {
  "/items/log": { name: "Log" },
  "/items/board": { name: "Board" },
  "/items/nail": { name: "Nail" },
  "/items/final": { name: "Final" },
};
runtime.state.initData_actionDetailMap = {
  "/actions/crafting/board": {
    hrid: "/actions/crafting/board",
    name: "Board",
    type: "/action_types/crafting",
    inputItems: [{ itemHrid: "/items/log", count: 2 }],
    outputItems: [{ itemHrid: "/items/board", count: 1 }],
  },
  "/actions/crafting/final": {
    hrid: "/actions/crafting/final",
    name: "Final",
    type: "/action_types/crafting",
    inputItems: [{ itemHrid: "/items/nail", count: 2 }],
    upgradeItemHrid: "/items/board",
    outputItems: [{ itemHrid: "/items/final", count: 1 }],
  },
  "/actions/crafting/stacked-final": {
    hrid: "/actions/crafting/stacked-final",
    name: "Stacked Final",
    type: "/action_types/crafting",
    inputItems: [{ itemHrid: "/items/board", count: 8 }],
    upgradeItemHrid: "/items/board",
    outputItems: [{ itemHrid: "/items/final", count: 1 }],
  },
};
runtime.state.initData_characterItems = [
  {
    id: "log-stack",
    itemHrid: "/items/log",
    itemLocationHrid: "/item_locations/inventory",
    enhancementLevel: 0,
    count: 5,
  },
  {
    id: "nail-stack",
    itemHrid: "/items/nail",
    itemLocationHrid: "/item_locations/inventory",
    enhancementLevel: 0,
    count: 1,
  },
];
runtime.api.getTeaBuffsByActionHrid = () => ({ lessResource: 10 });
procurement.setSetting("safetyLevel", "off");
procurement.loadCharacterData("character-a");

test("procurement computes direct shortages and recursive upgrade leaves", () => {
  const direct = procurement.calculateRequirements(
    "/actions/crafting/final",
    3,
  );
  const nail = direct.materials.find(
    (material) => material.itemHrid === "/items/nail",
  );
  const board = direct.materials.find(
    (material) => material.itemHrid === "/items/board",
  );
  assert.equal(nail.suggested, 6);
  assert.equal(nail.shortage, 5);
  assert.equal(board.suggested, 3);

  const chain = procurement.calculateUpgradeChain("/actions/crafting/final", 3);
  assert.equal(chain.stages.length, 2);
  assert.deepEqual(
    chain.leaves.map(({ itemHrid, suggested }) => [itemHrid, suggested]),
    [
      ["/items/nail", 6],
      ["/items/log", 6],
    ],
  );
});

test("upgrade chains use current tea output without purchasing the tea itself", () => {
  const previous = {
    skills: runtime.state.initData_characterSkills,
    slots: runtime.state.initData_actionTypeDrinkSlotsMap,
    equipment: runtime.state.currentEquipmentMap,
    buffs: runtime.state.actionTypeBuffSources,
  };
  runtime.state.initData_characterSkills = [];
  runtime.state.initData_actionTypeDrinkSlotsMap = {
    "/action_types/crafting": [{ itemHrid: "/items/gourmet_tea" }],
  };
  runtime.state.currentEquipmentMap = {};
  runtime.state.actionTypeBuffSources = {};
  runtime.state.initData_itemDetailMap["/items/gourmet_tea"] = {
    name: "Gourmet Tea",
    consumableDetail: {
      buffs: [{ typeHrid: "/buff_types/gourmet", flatBoost: 1 }],
    },
  };

  const chain = procurement.calculateUpgradeChain("/actions/crafting/final", 3);
  assert.equal(chain.stages[1].count, 2);
  assert.equal(
    chain.leaves.find((material) => material.itemHrid === "/items/log")
      .suggested,
    4,
  );
  assert.equal(
    chain.leaves.some((material) => material.itemHrid === "/items/gourmet_tea"),
    false,
  );

  runtime.state.initData_characterSkills = previous.skills;
  runtime.state.initData_actionTypeDrinkSlotsMap = previous.slots;
  runtime.state.currentEquipmentMap = previous.equipment;
  runtime.state.actionTypeBuffSources = previous.buffs;
  delete runtime.state.initData_itemDetailMap["/items/gourmet_tea"];
});

test("upgrade chains buy an intermediate when current tea diverts all output", () => {
  const previous = {
    skills: runtime.state.initData_characterSkills,
    slots: runtime.state.initData_actionTypeDrinkSlotsMap,
    equipment: runtime.state.currentEquipmentMap,
    buffs: runtime.state.actionTypeBuffSources,
  };
  runtime.state.initData_characterSkills = [];
  runtime.state.initData_actionTypeDrinkSlotsMap = {
    "/action_types/crafting": [{ itemHrid: "/items/processing_tea" }],
  };
  runtime.state.currentEquipmentMap = {};
  runtime.state.actionTypeBuffSources = {};
  runtime.state.initData_itemDetailMap["/items/processing_tea"] = {
    name: "Processing Tea",
    consumableDetail: {
      buffs: [{ typeHrid: "/buff_types/processing", flatBoost: 1 }],
    },
  };
  runtime.state.initData_actionDetailMap["/actions/crafting/board_lumber"] = {
    hrid: "/actions/crafting/board_lumber",
    type: "/action_types/crafting",
    inputItems: [{ itemHrid: "/items/board", count: 1 }],
    outputItems: [{ itemHrid: "/items/board_lumber", count: 1 }],
  };

  const chain = procurement.calculateUpgradeChain("/actions/crafting/final", 3);
  assert.deepEqual(chain.unavailableOutputs, ["/items/board"]);
  assert.equal(chain.stages.length, 1);
  assert.equal(
    chain.leaves.find((material) => material.itemHrid === "/items/board")
      .suggested,
    3,
  );

  runtime.state.initData_characterSkills = previous.skills;
  runtime.state.initData_actionTypeDrinkSlotsMap = previous.slots;
  runtime.state.currentEquipmentMap = previous.equipment;
  runtime.state.actionTypeBuffSources = previous.buffs;
  delete runtime.state.initData_itemDetailMap["/items/processing_tea"];
  delete runtime.state.initData_actionDetailMap[
    "/actions/crafting/board_lumber"
  ];
});

test("non-back refinement upgrades remain purchasable", () => {
  Object.assign(runtime.state.initData_itemDetailMap, {
    "/items/test_sword": {
      name: "Test Sword",
      equipmentDetail: { type: "/equipment_types/main_hand" },
    },
    "/items/test_sword_refined": {
      name: "Test Sword ★",
      equipmentDetail: { type: "/equipment_types/main_hand" },
    },
    "/items/refinement_shard": { name: "Refinement Shard" },
  });
  runtime.state.initData_actionDetailMap["/actions/forge/test_sword_refined"] =
    {
      hrid: "/actions/forge/test_sword_refined",
      name: "Test Sword ★",
      type: "/action_types/forging",
      upgradeItemHrid: "/items/test_sword",
      inputItems: [{ itemHrid: "/items/refinement_shard", count: 10 }],
      outputItems: [{ itemHrid: "/items/test_sword_refined", count: 1 }],
    };

  const direct = procurement.calculateRequirements(
    "/actions/forge/test_sword_refined",
    1,
  );
  assert.equal(
    direct.materials.find(
      (material) => material.itemHrid === "/items/test_sword",
    ).purchasable,
    true,
  );
  const chain = procurement.calculateUpgradeChain(
    "/actions/forge/test_sword_refined",
    1,
  );
  assert.equal(
    chain.leaves.some((material) => material.itemHrid === "/items/test_sword"),
    true,
  );
});

test("artisan safety margin uses per-action fractional variance and pouch concentration", () => {
  procurement.setSetting("safetyLevel", "95");
  procurement.setSetting("safetyThreshold", 10);
  const buffered = procurement.suggestedMaterialCount(2, 100, 0.1);
  assert.equal(buffered.expected, 180);
  assert.equal(buffered.suggested, 187);

  procurement.setSetting("safetyLevel", "off");
  procurement.setSetting("guzzlingPouchLevel", 0);
  const concentrated = procurement.calculateRequirements(
    "/actions/crafting/final",
    100,
  );
  assert.equal(
    concentrated.materials.find(
      (material) => material.itemHrid === "/items/nail",
    ).suggested,
    178,
  );
  procurement.setSetting("guzzlingPouchLevel", -1);
});

test("upgrade recipes add one unreduced base item to artisan-adjusted materials", () => {
  const result = procurement.calculateRequirements(
    "/actions/crafting/stacked-final",
    3,
  );
  const board = result.materials.find(
    (material) => material.itemHrid === "/items/board",
  );
  assert.equal(board.raw, 27);
  assert.equal(board.expected, 24.6);
  assert.equal(board.suggested, 25);

  const chain = procurement.calculateUpgradeChain(
    "/actions/crafting/stacked-final",
    3,
  );
  assert.deepEqual(
    chain.leaves.map(({ itemHrid, suggested }) => [itemHrid, suggested]),
    [["/items/log", 45]],
  );
});

test("selected upgrade stages buy predecessor items when their producer is excluded", () => {
  const chain = procurement.calculateUpgradeChain("/actions/crafting/final", 3);
  const materials = procurement.selectUpgradeChainMaterials(chain, [
    "/actions/crafting/final",
  ]);
  assert.deepEqual(
    materials.map(({ itemHrid, suggested }) => [itemHrid, suggested]),
    [
      ["/items/nail", 6],
      ["/items/board", 3],
    ],
  );
});

test("projects lock inventory and only duplicate their own cart shortages", () => {
  const chain = procurement.calculateUpgradeChain("/actions/crafting/final", 3);
  const plan = procurement.createPlan(
    "/actions/crafting/final",
    3,
    chain.leaves,
  );
  assert.ok(plan?.id);
  assert.equal(procurement.getLockedDetails("/items/log").total, 6);
  assert.equal(procurement.getEffectiveInventory("/items/log"), 0);

  const first = procurement.addProjectRequirementsToCart(plan.id);
  const second = procurement.addProjectRequirementsToCart(plan.id);
  assert.equal(first.added, 2);
  assert.equal(second.added, 0);
  assert.deepEqual(
    procurement
      .getCartItems()
      .map((item) => [item.itemHrid, item.allocations.projects[plan.id]]),
    [
      ["/items/nail", 5],
      ["/items/log", 1],
    ],
  );
  procurement.removePlan(plan.id);
  assert.deepEqual(
    procurement
      .getCartItems()
      .map((item) => [item.itemHrid, item.allocations.manual]),
    [
      ["/items/nail", 5],
      ["/items/log", 1],
    ],
  );
});

test("projects disappear after their shopping rows are fulfilled or cleared", () => {
  for (const plan of procurement.getPlans()) procurement.removePlan(plan.id);
  procurement.clearCart({ includeStarred: true });
  const purchased = procurement.createPlan("/actions/crafting/board", 10, [
    {
      itemHrid: "/items/log",
      enhancementLevel: 0,
      suggested: 10,
      purchasable: true,
    },
  ]);
  procurement.addProjectRequirementsToCart(purchased.id);
  assert.equal(
    procurement.getPlans().some((plan) => plan.id === purchased.id),
    true,
  );
  procurement.confirmMarketPurchase("/items/log", 5);
  assert.equal(
    procurement.getPlans().some((plan) => plan.id === purchased.id),
    false,
  );

  const cleared = procurement.createPlan("/actions/crafting/final", 3, [
    {
      itemHrid: "/items/nail",
      enhancementLevel: 0,
      suggested: 6,
      purchasable: true,
    },
    {
      itemHrid: "/items/log",
      enhancementLevel: 0,
      suggested: 6,
      purchasable: true,
    },
  ]);
  procurement.addProjectRequirementsToCart(cleared.id);
  procurement.clearCart({ includeStarred: true });
  assert.equal(
    procurement.getPlans().some((plan) => plan.id === cleared.id),
    false,
  );
});

test("confirmed purchases suppress the matching inventory delta only once", () => {
  procurement.clearCart({ includeStarred: true });
  procurement.addToCart({ itemHrid: "/items/board", quantity: 10 });
  assert.equal(procurement.confirmMarketPurchase("/items/board", 4), true);
  assert.equal(procurement.getCartItem("/items/board").quantity, 6);

  procurement.applyInventoryUpdates([
    {
      id: "board-stack",
      itemHrid: "/items/board",
      itemLocationHrid: "/item_locations/inventory",
      count: 4,
    },
  ]);
  assert.equal(procurement.getCartItem("/items/board").quantity, 6);

  procurement.applyInventoryUpdates([
    {
      id: "board-stack",
      itemHrid: "/items/board",
      itemLocationHrid: "/item_locations/inventory",
      count: 6,
    },
  ]);
  assert.equal(procurement.getCartItem("/items/board").quantity, 4);
});

test("shopping data is isolated by server and character", () => {
  procurement.addToCart({ itemHrid: "/items/nail", quantity: 7 });
  procurement.loadCharacterData("character-b");
  assert.equal(procurement.getCartItems().length, 0);
  procurement.loadCharacterData("character-a");
  assert.equal(procurement.getCartItem("/items/nail").quantity, 7);
  assert.equal(window.MWITools.shopping.apiVersion, 1);
  assert.notEqual(
    window.MWITools.shopping.getCartItems(),
    procurement.getCartItems(),
  );
});

test("v1 shopping data migrates project claims in creation order", () => {
  localStorage.setItem(
    "MWITools_procurement_v1:production:legacy-character",
    JSON.stringify({
      version: 1,
      cart: [
        {
          itemHrid: "/items/log",
          enhancementLevel: 0,
          quantity: 10,
        },
      ],
      plans: [
        {
          id: "legacy-project",
          actionHrid: "/actions/crafting/board",
          targetCount: 4,
          materials: { "/items/log#0": 8 },
          status: "active",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }),
  );
  procurement.loadCharacterData("legacy-character");
  assert.deepEqual(procurement.getCartAllocationSummary("/items/log"), {
    total: 10,
    manual: 7,
    planning: 0,
    project: 3,
    projects: { "legacy-project": 3 },
  });
  assert.equal(
    JSON.parse(
      localStorage.getItem(
        "MWITools_procurement_v1:production:legacy-character",
      ),
    ).version,
    2,
  );
});
