import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://www.milkywayidle.com/",
  pretendToBeVisual: true,
});
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.Event = dom.window.Event;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(
  dom.window,
);

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/data/translations.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
await import("../src/core/action-projection.js");
await import("../src/core/procurement.js");
const planning = await import("../src/core/train-planning.js");
const train = await import("../src/features/semi-auto-train.js");

runtime.config.isZH = false;
runtime.state.initData_itemDetailMap = {
  "/items/coin": { name: "Coin" },
  "/items/log": { name: "Log" },
  "/items/glue": { name: "Glue" },
  "/items/board": { name: "Board" },
  "/items/nail": { name: "Nail" },
  "/items/final": { name: "Final" },
  "/items/supreme": { name: "Supreme" },
};
runtime.state.initData_actionDetailMap = {
  "/actions/crafting/board": {
    hrid: "/actions/crafting/board",
    name: "Board",
    inputItems: [{ itemHrid: "/items/glue", count: 1 }],
    outputItems: [{ itemHrid: "/items/board", count: 2 }],
  },
  "/actions/crafting/final": {
    hrid: "/actions/crafting/final",
    name: "Final",
    inputItems: [{ itemHrid: "/items/nail", count: 2 }],
    upgradeItemHrid: "/items/board",
    outputItems: [{ itemHrid: "/items/final", count: 1 }],
  },
  "/actions/crafting/supreme": {
    hrid: "/actions/crafting/supreme",
    name: "Supreme",
    inputItems: [{ itemHrid: "/items/nail", count: 1 }],
    upgradeItemHrid: "/items/final",
    outputItems: [{ itemHrid: "/items/supreme", count: 1 }],
  },
};
runtime.state.initData_shopItemDetailMap = {
  board_shop: {
    hrid: "/shop_items/board",
    itemHrid: "/items/board",
    outputCount: 1,
    costs: [{ itemHrid: "/items/coin", count: 5 }],
  },
};
runtime.state.initData_characterItems = [
  {
    id: "board-stack",
    itemHrid: "/items/board",
    itemLocationHrid: "/item_locations/inventory",
    enhancementLevel: 0,
    count: 1,
  },
  {
    id: "nail-stack",
    itemHrid: "/items/nail",
    itemLocationHrid: "/item_locations/inventory",
    enhancementLevel: 0,
    count: 1,
  },
];
runtime.api.getTeaBuffsByActionHrid = () => ({ lessResource: 0 });
runtime.api.getAskPrice = () => 10;
runtime.api.procurement.setSetting("safetyLevel", "off");
runtime.api.procurement.loadCharacterData("train-character");

test("train planning builds a proportional chain and prefers a cheaper shop root", () => {
  const plan = planning.createTrainPlan("/items/final", {
    "/items/final": 3,
  });
  assert.deepEqual(
    plan.steps.map(({ kind, outputHrid, count }) => [kind, outputHrid, count]),
    [
      ["shop", "/items/board", 2],
      ["upgrade", "/items/final", 3],
    ],
  );

  const rootTask = planning.createTrainPlan("/items/final", {
    "/items/board": 1,
    "/items/final": 3,
  });
  assert.equal(rootTask.steps[0].kind, "craft");
  assert.equal(rootTask.steps[0].count, 1);
  assert.equal(planning.trainChainDepth("/items/final"), 1);
  assert.equal(planning.trainChainDepth("/items/board"), 0);
  assert.equal(planning.trainChainDepth("/items/log"), -1);
});

test("train chains report cycles and parse compact counts", () => {
  const original = runtime.state.initData_actionDetailMap;
  runtime.state.initData_actionDetailMap = {
    a: {
      hrid: "a",
      upgradeItemHrid: "/items/b",
      outputItems: [{ itemHrid: "/items/a", count: 1 }],
    },
    b: {
      hrid: "b",
      upgradeItemHrid: "/items/a",
      outputItems: [{ itemHrid: "/items/b", count: 1 }],
    },
  };
  const cyclic = planning.buildTrainChain("/items/a");
  assert.equal(cyclic.cycle, true);
  assert.equal(train.startTrain(cyclic, { navigateAction: () => true }), false);
  runtime.state.initData_actionDetailMap = original;
  assert.equal(planning.parseTrainCount("1.5k"), 1500);
  assert.equal(planning.parseTrainCount("2m"), 2_000_000);
  assert.equal(planning.parseTrainCount("∞"), null);
});

test("step shopping accumulates shared materials without buying train intermediates", async () => {
  runtime.api.procurement.clearCart({ includeStarred: true });
  const plan = planning.createTrainPlan(
    "/items/supreme",
    { "/items/supreme": 2 },
    { preferShop: false },
  );
  const navigated = [];
  assert.equal(
    train.startTrain(plan, {
      navigateAction(actionHrid) {
        navigated.push(actionHrid);
        return true;
      },
    }),
    true,
  );
  assert.equal(navigated[0], "/actions/crafting/board");

  const first = train.addCurrentTrainStepToCart({ input: { value: "1" } });
  assert.equal(first.added, 1);
  assert.equal(runtime.api.procurement.getCartItem("/items/glue").quantity, 1);
  assert.equal(runtime.api.procurement.getCartItem("/items/board"), null);
  assert.equal(train.getTrainState().index, 0);

  train.notifyCurrentTrainStepQueued({ input: { value: "1" } });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(train.getTrainState().index, 1);
  assert.equal(navigated[1], "/actions/crafting/final");
  const second = train.addCurrentTrainStepToCart({ input: { value: "2" } });
  assert.equal(second.added, 1);
  assert.equal(runtime.api.procurement.getCartItem("/items/nail").quantity, 3);
  assert.equal(runtime.api.procurement.getCartItem("/items/board"), null);

  train.notifyCurrentTrainStepQueued({ input: { value: "2" } });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(train.getTrainState().index, 2);
  const third = train.addCurrentTrainStepToCart({ input: { value: "2" } });
  assert.equal(third.added, 1);
  assert.equal(runtime.api.procurement.getCartItem("/items/nail").quantity, 5);
  assert.equal(runtime.api.procurement.getCartItem("/items/final"), null);
  const repeated = train.addCurrentTrainStepToCart({ input: { value: "2" } });
  assert.equal(repeated.added, 0);
  assert.equal(train.getTrainState().index, 2);
  train.cancelTrain();
});

test("shop stops advance only after the expected inventory arrives", async () => {
  const navigated = [];
  const plan = planning.createTrainPlan("/items/final", {
    "/items/final": 3,
  });
  train.startTrain(plan, {
    navigateShop() {
      navigated.push("shop");
      return true;
    },
    navigateAction(actionHrid) {
      navigated.push(actionHrid);
      return true;
    },
  });
  assert.deepEqual(navigated, ["shop"]);
  runtime.api.procurement.applyInventoryUpdates([
    {
      id: "board-stack",
      itemHrid: "/items/board",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 3,
    },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(train.getTrainState().index, 1);
  assert.equal(navigated[1], "/actions/crafting/final");
  train.cancelTrain();
});
