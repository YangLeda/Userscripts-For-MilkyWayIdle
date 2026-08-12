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
