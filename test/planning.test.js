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
await import("../src/core/planning.js");

const procurement = runtime.api.procurement;
const planning = runtime.api.planning;

runtime.state.initData_itemDetailMap = {
  "/items/log": { name: "Log", isTradable: true },
  "/items/board": { name: "Board", isTradable: true },
  "/items/nail": { name: "Nail", isTradable: true },
  "/items/final": { name: "Final", isTradable: true },
};
runtime.state.initData_actionDetailMap = {
  "/actions/woodcutting/log": {
    hrid: "/actions/woodcutting/log",
    name: "Log",
    type: "/action_types/woodcutting",
    baseTimeCost: 10_000_000_000,
    dropTable: [
      { itemHrid: "/items/log", dropRate: 1, minCount: 1, maxCount: 1 },
    ],
  },
  "/actions/crafting/board": {
    hrid: "/actions/crafting/board",
    name: "Board",
    type: "/action_types/crafting",
    baseTimeCost: 10_000_000_000,
    inputItems: [{ itemHrid: "/items/log", count: 2 }],
    outputItems: [{ itemHrid: "/items/board", count: 1 }],
  },
  "/actions/crafting/project-one": {
    hrid: "/actions/crafting/project-one",
    name: "Project one",
    type: "/action_types/crafting",
    baseTimeCost: 10_000_000_000,
    inputItems: [{ itemHrid: "/items/log", count: 1 }],
    outputItems: [{ itemHrid: "/items/nail", count: 1 }],
  },
  "/actions/crafting/project-two": {
    hrid: "/actions/crafting/project-two",
    name: "Project two",
    type: "/action_types/crafting",
    baseTimeCost: 10_000_000_000,
    inputItems: [{ itemHrid: "/items/log", count: 1 }],
    outputItems: [{ itemHrid: "/items/final", count: 1 }],
  },
};
runtime.state.initData_characterSkills = [];
runtime.state.initData_actionTypeDrinkSlotsMap = {};
runtime.state.currentEquipmentMap = {};
runtime.state.actionTypeBuffSources = {};
runtime.state.initData_shopItemDetailMap = {};
runtime.state.initData_houseRoomDetailMap = {
  "/house_rooms/workshop": {
    name: "Workshop",
    upgradeCostsMap: {
      1: [{ itemHrid: "/items/board", count: 3 }],
      2: [{ itemHrid: "/items/board", count: 5 }],
    },
  },
};
runtime.state.initData_characterHouseRoomMap = {
  "/house_rooms/workshop": {
    houseRoomHrid: "/house_rooms/workshop",
    level: 0,
  },
};
runtime.state.initData_characterItems = [
  {
    id: "logs",
    itemHrid: "/items/log",
    itemLocationHrid: "/item_locations/inventory",
    enhancementLevel: 0,
    count: 50,
  },
];
runtime.api.getToolsSpeedBuffByActionHrid = () => 0;
runtime.api.getTotalEffiPercentage = () => 0;

test("projects aggregate inventory and cart coverage by source", () => {
  procurement.loadCharacterData("planning-ledger");
  const one = procurement.createPlan("/actions/crafting/project-one", 100, [
    {
      itemHrid: "/items/log",
      enhancementLevel: 0,
      suggested: 100,
      purchasable: true,
    },
  ]);
  assert.equal(procurement.addProjectRequirementsToCart(one.id).added, 1);
  assert.equal(procurement.getCartItem("/items/log").quantity, 50);

  const two = procurement.createPlan("/actions/crafting/project-two", 200, [
    {
      itemHrid: "/items/log",
      enhancementLevel: 0,
      suggested: 200,
      purchasable: true,
    },
  ]);
  assert.equal(procurement.addProjectRequirementsToCart(two.id).added, 1);
  assert.deepEqual(procurement.getCartAllocationSummary("/items/log"), {
    total: 250,
    manual: 0,
    planning: 0,
    project: 250,
    projects: { [one.id]: 50, [two.id]: 200 },
  });
  assert.equal(procurement.getProjectReservedInventory("/items/log"), 50);
});

test("planning keeps project and manual cart quantities separate", () => {
  planning.upsertGoal({
    kind: "item",
    targetHrid: "/items/log",
    target: 1000,
  });
  let result = planning.calculate();
  let log = result.materials.find(
    (material) => material.itemHrid === "/items/log",
  );
  assert.equal(log.required, 1000);
  assert.equal(log.owned, 50);
  assert.equal(log.projectInventory, 50);
  assert.equal(log.cart.project, 250);
  assert.equal(log.addableShortage, 1000);

  assert.equal(planning.addShortagesToCart().added, 1);
  assert.equal(procurement.getCartItem("/items/log").quantity, 1250);
  result = planning.calculate();
  log = result.materials.find((material) => material.itemHrid === "/items/log");
  assert.equal(log.cart.planning, 1000);
  assert.equal(log.addableShortage, 0);
  assert.equal(planning.addShortagesToCart().added, 0);

  procurement.addToCart({ itemHrid: "/items/log", quantity: 100 });
  assert.equal(procurement.getCartItem("/items/log").quantity, 1350);
  assert.equal(planning.calculate().materials[0].addableShortage, 0);
  assert.equal(procurement.getCartAllocationSummary("/items/log").manual, 100);
});

test("planning recursively expands item and house goals with shared inventory", () => {
  procurement.loadCharacterData("planning-recursion");
  runtime.state.initData_characterItems = [];
  procurement.loadCharacterData("planning-recursion");
  const previousProfile = runtime.api.getActionProductionProfile;
  runtime.api.getActionProductionProfile = (actionHrid, options) =>
    actionHrid === "/actions/crafting/board"
      ? {
          status: "complete",
          outputs: [{ itemHrid: "/items/board", count: 2 }],
          teaEffects: { lessResource: 0.5 },
        }
      : previousProfile(actionHrid, options);
  planning.upsertGoal({
    kind: "item",
    targetHrid: "/items/board",
    target: 2,
  });
  planning.upsertGoal({
    kind: "house",
    targetHrid: "/house_rooms/workshop",
    target: 99,
  });
  assert.equal(
    planning
      .getGoals()
      .find((goal) => goal.targetHrid === "/house_rooms/workshop").target,
    2,
  );
  const result = planning.calculate();
  const board = result.steps.find((step) => step.itemHrid === "/items/board");
  const log = result.materials.find(
    (material) => material.itemHrid === "/items/log",
  );
  // The house still demands exactly 8 boards. Its first 3-board tier creates
  // one batch surplus, so only 9 of the combined 10-board demand remains to
  // be produced while the buffed recipe takes 5 actions and 5 logs.
  assert.equal(board.requiredOutput, 9);
  assert.equal(board.actionCount, 5);
  assert.equal(log.required, 5);

  runtime.api.getActionProductionProfile = previousProfile;

  planning.setPolicy("/items/board", "acquire");
  const acquired = planning.calculate();
  assert.equal(
    acquired.steps.some((step) => step.itemHrid === "/items/board"),
    false,
  );
  assert.equal(
    acquired.materials.find((material) => material.itemHrid === "/items/board")
      .required,
    10,
  );
});

test("planning goals and policies remain isolated by character", () => {
  procurement.loadCharacterData("planning-empty");
  assert.deepEqual(planning.getGoals(), []);
  assert.equal(planning.getPolicy("/items/board"), "produce");
  procurement.loadCharacterData("planning-recursion");
  assert.equal(planning.getGoals().length, 2);
  assert.equal(planning.getPolicy("/items/board"), "acquire");
});

test("released project and planning allocations become manual", () => {
  runtime.state.initData_characterItems = [
    {
      id: "release-logs",
      itemHrid: "/items/log",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 50,
    },
  ];
  procurement.loadCharacterData("planning-release");
  const project = procurement.createPlan("/actions/crafting/project-one", 100, [
    {
      itemHrid: "/items/log",
      enhancementLevel: 0,
      suggested: 100,
      purchasable: true,
    },
  ]);
  procurement.addProjectRequirementsToCart(project.id);
  planning.upsertGoal({
    kind: "item",
    targetHrid: "/items/log",
    target: 1000,
  });
  planning.addShortagesToCart();

  procurement.updatePlan(project.id, { status: "completed" });
  assert.deepEqual(procurement.getCartAllocationSummary("/items/log"), {
    total: 1050,
    manual: 100,
    planning: 950,
    project: 0,
    projects: {},
  });
});

test("planning expands shop exchanges and shares co-products", () => {
  runtime.state.initData_itemDetailMap = {
    ...runtime.state.initData_itemDetailMap,
    "/items/token": { name: "Token", isTradable: false },
    "/items/shop_goal": { name: "Shop Goal", isTradable: false },
    "/items/alpha": { name: "Alpha", isTradable: false },
    "/items/beta": { name: "Beta", isTradable: false },
  };
  runtime.state.initData_actionDetailMap = {
    ...runtime.state.initData_actionDetailMap,
    "/actions/crafting/pair": {
      hrid: "/actions/crafting/pair",
      name: "Pair",
      type: "/action_types/crafting",
      baseTimeCost: 10_000_000_000,
      inputItems: [{ itemHrid: "/items/log", count: 1 }],
      outputItems: [
        { itemHrid: "/items/alpha", count: 1 },
        { itemHrid: "/items/beta", count: 1 },
      ],
    },
  };
  runtime.state.initData_shopItemDetailMap = {
    "/shop_items/shop_goal": {
      hrid: "/shop_items/shop_goal",
      itemHrid: "/items/shop_goal",
      itemCount: 2,
      costs: [{ itemHrid: "/items/token", count: 3 }],
    },
  };
  runtime.state.initData_characterItems = [];
  procurement.loadCharacterData("planning-routes");
  planning.upsertGoal({
    kind: "item",
    targetHrid: "/items/shop_goal",
    target: 4,
  });
  planning.upsertGoal({
    kind: "item",
    targetHrid: "/items/alpha",
    target: 1,
  });
  planning.upsertGoal({
    kind: "item",
    targetHrid: "/items/beta",
    target: 1,
  });

  const result = planning.calculate();
  assert.equal(
    result.steps.find((step) => step.id === "/shop_items/shop_goal")
      .actionCount,
    2,
  );
  assert.equal(
    result.materials.find((material) => material.itemHrid === "/items/token")
      .required,
    6,
  );
  assert.equal(
    result.steps.find((step) => step.id === "/actions/crafting/pair")
      .actionCount,
    1,
  );
  assert.equal(
    result.materials.find((material) => material.itemHrid === "/items/log")
      .required,
    1,
  );
});

test("planning reports recipe cycles as base materials", () => {
  runtime.state.initData_itemDetailMap = {
    ...runtime.state.initData_itemDetailMap,
    "/items/cycle_a": { name: "Cycle A", isTradable: false },
    "/items/cycle_b": { name: "Cycle B", isTradable: false },
  };
  runtime.state.initData_actionDetailMap = {
    ...runtime.state.initData_actionDetailMap,
    "/actions/crafting/cycle_a": {
      hrid: "/actions/crafting/cycle_a",
      name: "Cycle A",
      type: "/action_types/crafting",
      baseTimeCost: 10_000_000_000,
      inputItems: [{ itemHrid: "/items/cycle_b", count: 1 }],
      outputItems: [{ itemHrid: "/items/cycle_a", count: 1 }],
    },
    "/actions/crafting/cycle_b": {
      hrid: "/actions/crafting/cycle_b",
      name: "Cycle B",
      type: "/action_types/crafting",
      baseTimeCost: 10_000_000_000,
      inputItems: [{ itemHrid: "/items/cycle_a", count: 1 }],
      outputItems: [{ itemHrid: "/items/cycle_b", count: 1 }],
    },
  };
  procurement.loadCharacterData("planning-cycle");
  planning.upsertGoal({
    kind: "item",
    targetHrid: "/items/cycle_a",
    target: 1,
  });
  const result = planning.calculate();
  assert.equal(result.warnings[0].type, "cycle");
  assert.equal(result.materials[0].reasons.includes("cycle"), true);
});
