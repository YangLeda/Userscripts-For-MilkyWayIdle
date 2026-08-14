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
await import("../src/core/game-data.js");
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
    type: "/action_types/crafting",
    inputItems: [{ itemHrid: "/items/glue", count: 1 }],
    outputItems: [{ itemHrid: "/items/board", count: 2 }],
  },
  "/actions/crafting/final": {
    hrid: "/actions/crafting/final",
    name: "Final",
    type: "/action_types/crafting",
    inputItems: [{ itemHrid: "/items/nail", count: 2 }],
    upgradeItemHrid: "/items/board",
    outputItems: [{ itemHrid: "/items/final", count: 1 }],
  },
  "/actions/crafting/supreme": {
    hrid: "/actions/crafting/supreme",
    name: "Supreme",
    type: "/action_types/crafting",
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

test("train planning uses current tea output counts", () => {
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
    consumableDetail: {
      buffs: [{ typeHrid: "/buff_types/gourmet", flatBoost: 1 }],
    },
  };

  const plan = planning.createTrainPlan(
    "/items/final",
    { "/items/final": 3 },
    { preferShop: false },
  );
  assert.equal(plan.steps[0].count, 1);
  assert.equal(plan.steps[0].outputCount, 4);
  assert.equal(plan.steps[0].outputCountSource, "player");
  assert.deepEqual(plan.unavailableOutputs, []);

  runtime.state.initData_characterSkills = previous.skills;
  runtime.state.initData_actionTypeDrinkSlotsMap = previous.slots;
  runtime.state.currentEquipmentMap = previous.equipment;
  runtime.state.actionTypeBuffSources = previous.buffs;
  delete runtime.state.initData_itemDetailMap["/items/gourmet_tea"];
});

test("train planning blocks a route when current tea removes its output", () => {
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

  const plan = planning.createTrainPlan(
    "/items/final",
    { "/items/final": 3 },
    { preferShop: false },
  );
  assert.deepEqual(plan.unavailableOutputs, ["/items/board"]);
  assert.equal(train.startTrain(plan, { navigateAction: () => true }), false);

  runtime.state.initData_characterSkills = previous.skills;
  runtime.state.initData_actionTypeDrinkSlotsMap = previous.slots;
  runtime.state.currentEquipmentMap = previous.equipment;
  runtime.state.actionTypeBuffSources = previous.buffs;
  delete runtime.state.initData_itemDetailMap["/items/processing_tea"];
  delete runtime.state.initData_actionDetailMap[
    "/actions/crafting/board_lumber"
  ];
});

test("train action index is reused and invalidates when action data changes", () => {
  const originalMap = runtime.state.initData_actionDetailMap;
  const originalOutputs = runtime.api.getExpectedOutputs;
  let outputReads = 0;
  runtime.api.getExpectedOutputs = (detail) => {
    outputReads += 1;
    return originalOutputs(detail);
  };
  try {
    runtime.state.initData_actionDetailMap = {
      first: {
        hrid: "first",
        upgradeItemHrid: "/items/base",
        outputItems: [{ itemHrid: "/items/first", count: 1 }],
      },
      base: {
        hrid: "base",
        outputItems: [{ itemHrid: "/items/base", count: 1 }],
      },
    };
    assert.ok(planning.findUpgradeActionToItem("/items/first"));
    assert.ok(planning.findBaseActionForItem("/items/base"));
    assert.equal(outputReads, 2);
    planning.findUpgradeActionToItem("/items/first");
    planning.findBaseActionForItem("/items/base");
    assert.equal(outputReads, 2);

    runtime.state.initData_actionDetailMap = {
      next: {
        hrid: "next",
        upgradeItemHrid: "/items/base",
        outputItems: [{ itemHrid: "/items/next", count: 1 }],
      },
    };
    assert.ok(planning.findUpgradeActionToItem("/items/next"));
    assert.equal(outputReads, 3);
  } finally {
    runtime.api.getExpectedOutputs = originalOutputs;
    runtime.state.initData_actionDetailMap = originalMap;
  }
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

test("a train cannot start without an explicit production count", () => {
  const plan = planning.buildTrainChain("/items/final");
  assert.equal(plan.steps.at(-1).count, undefined);
  assert.equal(train.startTrain(plan, { navigateAction: () => true }), false);
  assert.equal(train.getTrainState(), null);
  assert.equal(document.querySelector("#mwi-train-active-indicator"), null);
});

test("default train navigation accepts a GamePage instance without navTarget", () => {
  document.body.innerHTML = '<div class="GamePage_gamePage__test"></div>';
  delete globalThis.mwi;
  const calls = [];
  const gamePage = document.querySelector('[class*="GamePage_gamePage"]');
  gamePage.__reactFiber$train = {
    stateNode: null,
    return: {
      stateNode: {
        handleGoToActionTypeDetail(actionHrid) {
          calls.push(actionHrid);
        },
      },
      return: null,
    },
  };
  const plan = {
    cycle: false,
    truncated: false,
    steps: [
      {
        kind: "craft",
        actionHrid: "/actions/crafting/board",
        outputHrid: "/items/board",
        count: 1,
      },
    ],
  };
  assert.equal(train.startTrain(plan), true);
  assert.deepEqual(calls, ["/actions/crafting/board"]);
  assert.equal(train.getTrainState().index, 0);
  train.cancelTrain();
  document.body.replaceChildren();
});

test("active train stays globally visible and can be cancelled from any page", () => {
  document.body.innerHTML = '<main data-page="unrelated"></main>';
  const plan = {
    cycle: false,
    truncated: false,
    steps: [
      {
        kind: "craft",
        actionHrid: "/actions/crafting/board",
        outputHrid: "/items/board",
        count: 1,
      },
      {
        kind: "upgrade",
        actionHrid: "/actions/crafting/final",
        inputHrid: "/items/board",
        outputHrid: "/items/final",
        count: 1,
      },
    ],
  };
  assert.equal(train.startTrain(plan, { navigateAction: () => true }), true);
  const indicator = document.querySelector("#mwi-train-active-indicator");
  assert.match(indicator.textContent, /Train in progress \(1\/2\)/);
  indicator.click();
  assert.equal(train.getTrainState(), null);
  assert.equal(document.querySelector("#mwi-train-active-indicator"), null);
  document.body.replaceChildren();
});

test("automatic step shopping enables the mode and adds current shortages", async () => {
  runtime.api.procurement.clearCart({ includeStarred: true });
  document.body.innerHTML = `
    <div class="Modal_modalContainer__test">
      <div class="Modal_modal__test">
        <div class="Modal_modalContent__test">
          <div class="SkillActionDetail_regularComponent__test">
            <div class="SkillActionDetail_maxActionCountInput__test"><input value="1"></div>
            <div class="SkillActionDetail_buttonsContainer__test"></div>
          </div>
        </div>
      </div>
    </div>`;
  const originalResolver = runtime.api.resolveProductionAction;
  runtime.api.resolveProductionAction = () => "/actions/crafting/board";
  const plan = {
    cycle: false,
    truncated: false,
    steps: [
      {
        kind: "craft",
        actionHrid: "/actions/crafting/board",
        outputHrid: "/items/board",
        count: 1,
      },
      {
        kind: "upgrade",
        actionHrid: "/actions/crafting/final",
        inputHrid: "/items/board",
        outputHrid: "/items/final",
        count: 1,
      },
    ],
  };
  assert.equal(train.startTrain(plan, { navigateAction: () => true }), true);
  assert.equal(train.setTrainAutoCart(true), true);
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.equal(train.getTrainState().autoCartEnabled, true);
  assert.equal(runtime.api.procurement.getCartItem("/items/glue").quantity, 1);
  assert.equal(
    document
      .querySelector('[class*="Modal_modal"]:not([class*="modalContainer"])')
      .classList.contains("mwi-train-window-wide"),
    true,
  );
  train.cancelTrain();
  runtime.api.resolveProductionAction = originalResolver;
  document.body.replaceChildren();
});

test("skill navigation click is accepted while the target action panel mounts", () => {
  document.body.innerHTML = '<button data-target="crafting">Crafting</button>';
  let clicked = 0;
  document.querySelector("button").addEventListener("click", () => {
    clicked += 1;
  });
  assert.equal(train.navigateToTrainAction("/actions/crafting/board"), true);
  assert.equal(clicked, 1);
  document.body.replaceChildren();
});

test("DOM action navigation opens the skill and exact action card", async () => {
  document.body.innerHTML = `<div class="NavigationBar_navigationLink__test"><svg><use href="#crafting"></use></svg>Crafting</div>`;
  const navigation = document.querySelector(
    '[class*="NavigationBar_navigationLink"]',
  );
  let opened = 0;
  navigation.addEventListener("click", () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="SkillAction_skillAction__test"><div class="SkillAction_name__test">Board</div><svg><use href="#board"></use></svg></div>`,
    );
    document
      .querySelector('[class*="SkillAction_skillAction"]')
      .addEventListener("click", () => {
        opened += 1;
      });
  });
  assert.equal(train.navigateToTrainAction("/actions/crafting/board"), true);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(opened, 1);
  document.body.replaceChildren();
});

test("shop navigation falls back to native DOM and only prefills quantity", async () => {
  document.body.innerHTML = `<div class="NavigationBar_navigationLink__test"><svg><use href="#shop"></use></svg>Shop</div>`;
  const navigation = document.querySelector(
    '[class*="NavigationBar_navigationLink"]',
  );
  let purchases = 0;
  navigation.addEventListener("click", () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="ShopPanel_shopPanel__test"><div class="ShopPanel_shopItems__test"><div class="ShopPanel_shopItem__test"><div class="ShopPanel_name__test">Board</div><svg><use href="#board"></use></svg></div></div></div>`,
    );
    document
      .querySelector('[class*="ShopPanel_shopItem"]')
      .addEventListener("click", () => {
        const modal = document.createElement("div");
        modal.className = "ShopPanel_modalContent__test";
        modal.innerHTML = `<input type="number" value="1"><button type="button">Buy</button>`;
        modal.querySelector("button").addEventListener("click", () => {
          purchases += 1;
        });
        document.body.appendChild(modal);
      });
  });
  const plan = {
    cycle: false,
    truncated: false,
    steps: [
      {
        kind: "shop",
        shopHrid: "/shop_items/board",
        outputHrid: "/items/board",
        count: 4,
      },
    ],
  };
  assert.equal(train.startTrain(plan), true);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(
    document
      .querySelector('[class*="ShopPanel_shopItem"]')
      .classList.contains("mwi-train-shop-target"),
    false,
  );
  assert.equal(
    document
      .querySelector('[class*="ShopPanel_shopItem__"]')
      .classList.contains("mwi-train-shop-target"),
    true,
  );
  assert.equal(document.querySelector('input[type="number"]').value, "4");
  assert.equal(purchases, 0);
  train.cancelTrain();
  document.body.replaceChildren();
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

test("English and localized native queue buttons advance to the next train stop", async () => {
  const originalResolver = runtime.api.resolveProductionAction;
  runtime.api.resolveProductionAction = () => "/actions/crafting/board";
  const plan = {
    cycle: false,
    truncated: false,
    steps: [
      {
        kind: "craft",
        actionHrid: "/actions/crafting/board",
        outputHrid: "/items/board",
        count: 1,
      },
      {
        kind: "upgrade",
        actionHrid: "/actions/crafting/final",
        inputHrid: "/items/board",
        outputHrid: "/items/final",
        count: 1,
      },
    ],
  };
  for (const label of ["Add Queue #5", "Añadir a la cola"]) {
    document.body.innerHTML = `
      <div class="SkillActionDetail_regularComponent__test">
        <div class="SkillActionDetail_maxActionCountInput__test"><input value="1"></div>
        <div class="SkillActionDetail_buttonsContainer__test">
          <button type="button">${label}</button>
        </div>
      </div>`;
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
    await new Promise((resolve) => setTimeout(resolve, 30));
    document
      .querySelector(".SkillActionDetail_buttonsContainer__test > button")
      .click();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(train.getTrainState().index, 1, label);
    assert.deepEqual(
      navigated,
      ["/actions/crafting/board", "/actions/crafting/final"],
      label,
    );
    train.cancelTrain();
  }
  runtime.api.resolveProductionAction = originalResolver;
  document.body.replaceChildren();
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
