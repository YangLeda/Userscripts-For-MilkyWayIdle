import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/data/translations.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
await import("../src/core/action-projection.js");
await import("../src/core/procurement.js");
await import("../src/core/train-planning.js");

runtime.state.initData_itemDetailMap = {
  "/items/base": { name: "Base" },
  "/items/middle": { name: "Middle" },
  "/items/top": { name: "Top" },
  "/items/other": { name: "Other" },
};
runtime.state.initData_actionDetailMap = {
  "/actions/crafting/base": {
    hrid: "/actions/crafting/base",
    outputItems: [{ itemHrid: "/items/base", count: 1 }],
  },
  "/actions/crafting/middle": {
    hrid: "/actions/crafting/middle",
    upgradeItemHrid: "/items/base",
    outputItems: [{ itemHrid: "/items/middle", count: 1 }],
  },
  "/actions/crafting/top": {
    hrid: "/actions/crafting/top",
    upgradeItemHrid: "/items/middle",
    outputItems: [{ itemHrid: "/items/top", count: 1 }],
  },
  "/actions/crafting/other": {
    hrid: "/actions/crafting/other",
    outputItems: [{ itemHrid: "/items/other", count: 1 }],
  },
};
runtime.state.initData_characterItems = [];
runtime.state.initData_shopItemDetailMap = {};
runtime.api.procurement.loadCharacterData("task-train-character");
runtime.api.taskActionHrid = (task) => task.actionHrid;
runtime.api.taskRemaining = (task) =>
  Math.max(0, Number(task.goalCount) - Number(task.currentCount));

const planner = await import("../src/features/task-train-planner.js");

const quests = [
  {
    actionHrid: "/actions/crafting/middle",
    goalCount: 4,
    currentCount: 1,
  },
  {
    actionHrid: "/actions/crafting/top",
    goalCount: 3,
    currentCount: 1,
  },
  {
    actionHrid: "/actions/crafting/other",
    goalCount: 2,
    currentCount: 0,
  },
  {
    actionHrid: "/actions/crafting/base",
    goalCount: 1,
    currentCount: 1,
  },
];

test("task planner gives one highest-chain entry and labels other task states", () => {
  const { entries, groups } = planner.collectTaskTrainGroups(quests);
  assert.deepEqual(
    entries.map(({ state }) => state),
    ["planned", "top", "isolated", "done"],
  );
  assert.equal(groups.get("/items/base").length, 2);
});

test("task planner combines every remaining count in the same chain", () => {
  const plan = planner.createTaskTrainPlan("/items/base", quests);
  assert.deepEqual(
    plan.steps.map(({ outputHrid, count }) => [outputHrid, count]),
    [
      ["/items/base", 3],
      ["/items/middle", 3],
      ["/items/top", 2],
    ],
  );
});

test("a lone base-production task does not create an empty train", () => {
  const { entries, groups } = planner.collectTaskTrainGroups([
    {
      actionHrid: "/actions/crafting/base",
      goalCount: 2,
      currentCount: 0,
    },
  ]);
  assert.equal(entries[0].state, "isolated");
  assert.equal(groups.size, 0);
});

test("task train mutation filtering ignores MWITools controls but sees native cards", () => {
  const taskCard = document.createElement("div");
  taskCard.className = "RandomTask_randomTask__mutation-filter";
  const control = document.createElement("button");
  control.className = "mwi-task-train-planner";
  assert.equal(
    planner.shouldRenderTaskTrainMutations([
      {
        type: "childList",
        target: taskCard,
        addedNodes: [control],
        removedNodes: [],
      },
    ]),
    false,
  );

  const nativeCard = document.createElement("div");
  nativeCard.className = "RandomTask_randomTask__native";
  assert.equal(
    planner.shouldRenderTaskTrainMutations([
      {
        type: "childList",
        target: document.body,
        addedNodes: [nativeCard],
        removedNodes: [],
      },
    ]),
    true,
  );
});

test("localized train controls are inserted immediately before the native go button", async () => {
  const { registerGameLocaleResources } =
    await import("../src/core/game-localization.js");
  registerGameLocaleResources("es", {
    randomTask: { go: "Ir" },
    itemNames: { "/items/base": "Base" },
    actionNames: { "/actions/crafting/base": "Crear base" },
    monsterNames: { "/monsters/rat": "Rata" },
    abilityNames: { "/abilities/strike": "Golpe" },
  });
  localStorage.setItem("i18nextLng", "es");

  const card = document.createElement("div");
  const action = document.createElement("div");
  const buttons = document.createElement("div");
  const reroll = document.createElement("button");
  const go = document.createElement("button");
  const control = document.createElement("button");
  reroll.textContent = "Volver a tirar";
  go.textContent = "Ir";
  control.className = "mwi-task-train-planner";
  buttons.append(reroll, go);
  card.append(action, buttons);

  planner.insertBeforeTaskNavigation(card, action, control);

  assert.equal(control.parentElement, buttons);
  assert.equal(control.nextElementSibling, go);
  localStorage.setItem("i18nextLng", "en");
});
