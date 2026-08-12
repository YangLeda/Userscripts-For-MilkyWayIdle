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
const { registerGameLocaleResources } =
  await import("../src/core/game-localization.js");
const { resolveTaskCards } =
  await import("../src/core/task-card-resolution.js");

function card(name, progress, fiberTask = null) {
  const element = document.createElement("div");
  element.className = "RandomTask_randomTask__test";
  element.innerHTML = `<div class="RandomTask_name__test">Cheesesmithing - ${name}</div><div>Progress: ${progress}</div>`;
  if (fiberTask) {
    element.__reactFiber$task = {
      memoizedProps: null,
      return: { stateNode: { props: { characterQuest: fiberTask } } },
    };
  }
  return element;
}

const remaining = (task) => task.goalCount - task.currentCount;
const actionHrid = (task) => task.actionHrid;

test("task cards use their Fiber quest instead of the DOM position", () => {
  const crimson = {
    id: 1,
    actionHrid: "/actions/cheesesmithing/crimson_brush",
    goalCount: 6,
    currentCount: 0,
  };
  const rainbow = {
    id: 2,
    actionHrid: "/actions/cheesesmithing/rainbow_brush",
    goalCount: 6,
    currentCount: 0,
  };
  runtime.state.initData_actionDetailMap = {
    [crimson.actionHrid]: { name: "Crimson Brush" },
    [rainbow.actionHrid]: { name: "Rainbow Brush" },
  };
  const cards = [
    card("Rainbow Brush", "0 / 6", rainbow),
    card("Crimson Brush", "0 / 6", crimson),
  ];
  const resolved = resolveTaskCards(cards, [crimson, rainbow], {
    taskActionHrid: actionHrid,
    taskRemaining: remaining,
  });
  assert.deepEqual(
    resolved.map(({ taskId, taskIndex, originalIndex }) => [
      taskId,
      taskIndex,
      originalIndex,
    ]),
    [
      ["2", 1, 0],
      ["1", 0, 1],
    ],
  );
});

test("semantic fallback matches shuffled and duplicate actions by progress", () => {
  const quests = [
    {
      id: 11,
      actionHrid: "/actions/cheesesmithing/crimson_brush",
      goalCount: 9,
      currentCount: 1,
    },
    {
      id: 12,
      actionHrid: "/actions/cheesesmithing/rainbow_brush",
      goalCount: 6,
      currentCount: 0,
    },
    {
      id: 13,
      actionHrid: "/actions/cheesesmithing/crimson_brush",
      goalCount: 6,
      currentCount: 0,
    },
  ];
  runtime.state.initData_actionDetailMap = {
    "/actions/cheesesmithing/crimson_brush": { name: "Crimson Brush" },
    "/actions/cheesesmithing/rainbow_brush": { name: "Rainbow Brush" },
  };
  const cards = [
    card("Rainbow Brush", "0 / 6"),
    card("Crimson Brush", "0 / 6"),
    card("Crimson Brush", "1 / 9"),
  ];
  cards[0].dataset.mwitoolsTaskId = "11";
  const resolved = resolveTaskCards(cards, quests, {
    taskActionHrid: actionHrid,
    taskRemaining: remaining,
  });
  assert.deepEqual(
    resolved.map(({ taskId }) => taskId),
    ["12", "13", "11"],
  );
});

test("semantic task progress follows game-locale grouping separators", () => {
  localStorage.setItem("i18nextLng", "pt");
  const action = "/actions/cheesesmithing/grouped_progress";
  runtime.state.initData_actionDetailMap = {
    [action]: { name: "Grouped Progress" },
  };
  const quests = [
    { id: 21, actionHrid: action, goalCount: 2_000, currentCount: 1_234 },
    { id: 22, actionHrid: action, goalCount: 3_000, currentCount: 1_000 },
  ];
  const resolved = resolveTaskCards(
    [
      card("Grouped Progress", "1.000 / 3.000"),
      card("Grouped Progress", "1.234 / 2.000"),
    ],
    quests,
    { taskActionHrid: actionHrid, taskRemaining: remaining },
  );
  assert.deepEqual(
    resolved.map(({ taskId }) => taskId),
    ["22", "21"],
  );
  localStorage.setItem("i18nextLng", "en-US");
});

test("previous task IDs bypass repeated semantic matching in shuffled English cards", () => {
  const quests = [
    { id: 31, actionHrid: "/actions/crafting/first" },
    { id: 32, actionHrid: "/actions/crafting/second" },
  ];
  runtime.state.initData_actionDetailMap = {
    "/actions/crafting/first": { name: "First" },
    "/actions/crafting/second": { name: "Second" },
  };
  const cards = [card("Second", "0 / 1"), card("First", "0 / 1")];
  cards[0].dataset.mwitoolsTaskId = "32";
  cards[1].dataset.mwitoolsTaskId = "31";
  let actionReads = 0;
  const resolved = resolveTaskCards(cards, quests, {
    taskActionHrid(task) {
      actionReads += 1;
      return task.actionHrid;
    },
    taskRemaining: () => 1,
  });
  assert.deepEqual(
    resolved.map(({ taskId }) => taskId),
    ["32", "31"],
  );
  assert.equal(actionReads, 4);
});

test("cached action labels invalidate when the game locale changes", () => {
  const action = "/actions/crafting/localized";
  const quest = { id: 41, actionHrid: action, goalCount: 1, currentCount: 0 };
  runtime.state.initData_actionDetailMap = { [action]: { name: "Original" } };
  registerGameLocaleResources("en", {
    itemNames: {},
    actionNames: { [action]: "English Action" },
    monsterNames: {},
    abilityNames: {},
  });
  registerGameLocaleResources("es", {
    itemNames: {},
    actionNames: { [action]: "Acción Española" },
    monsterNames: {},
    abilityNames: {},
  });
  localStorage.setItem("i18nextLng", "en-US");
  assert.equal(
    resolveTaskCards([card("English Action", "0 / 1")], [quest], {
      taskActionHrid: actionHrid,
      taskRemaining: remaining,
    })[0].taskId,
    "41",
  );
  localStorage.setItem("i18nextLng", "es");
  assert.equal(
    resolveTaskCards([card("Acción Española", "0 / 1")], [quest], {
      taskActionHrid: actionHrid,
      taskRemaining: remaining,
    })[0].taskId,
    "41",
  );
  localStorage.setItem("i18nextLng", "en-US");
});
