import assert from "node:assert/strict";
import test, { after } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  "<!doctype html><html><head></head><body><div id='root'></div></body></html>",
  { url: "https://test.milkywayidle.com/" },
);
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.location = dom.window.location;
globalThis.localStorage = dom.window.localStorage;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.getComputedStyle = dom.window.getComputedStyle;

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/core/state.js");
const { registerGameLocaleResources } =
  await import("../src/core/game-localization.js");
const { captureTaskReturnContext, taskIdentity } =
  await import("../src/features/task-auto-return.js");

registerGameLocaleResources("es", {
  randomTask: { go: "Ir" },
  questModal: { go: "Ir" },
  skillActionDetail: {
    buttons: {
      start: "Comenzar",
      startNow: "Empezar ahora",
      addToQueue: "Añadir a la cola #{{count}}",
    },
  },
  navigationBar: { tasks: "Tareas" },
  itemNames: { "/items/coin": "Moneda" },
  actionNames: { "/actions/milking/cow": "Vaca" },
  monsterNames: { "/monsters/rat": "Rata" },
  abilityNames: { "/abilities/strike": "Golpe" },
});

runtime.config.isZH = true;
runtime.api.getOriTextFromElement = (element) => element?.textContent ?? "";
runtime.state.characterQuests = [
  { characterQuestID: 71, actionHrid: "/actions/cheese_brush" },
];
await runtime.features.handleCharacterData({ character: { id: "tasks-a" } });

after(async () => {
  await runtime.features.disable("taskAutoReturn");
  dom.window.close();
});

function settle(delay = 80) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function setScrollable(element, scrollTop = 0) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 500 },
  });
  element.style.overflowY = "auto";
  element.scrollTop = scrollTop;
}

function taskPage({ task = true, scrollTop = 143, goLabel = "Go" } = {}) {
  const root = document.getElementById("root");
  root.innerHTML = `
    <div class="TasksPanel_taskList__test">
      ${
        task
          ? `<div class="RandomTask_randomTask__test" data-mwitools-original-index="0" data-mwitools-profession="crafting"><button>${goLabel}</button></div>`
          : ""
      }
    </div>`;
  const list = root.querySelector("[class*=TasksPanel_taskList]");
  setScrollable(list, scrollTop);
  return {
    root,
    list,
    card: root.querySelector("[class*=RandomTask_randomTask]"),
    go: root.querySelector("[class*=RandomTask_randomTask] button"),
  };
}

function actionPage(label = "添加到队列") {
  const root = document.getElementById("root");
  root.innerHTML = `<div class="Modal_modalContainer__test"><div class="SkillActionDetail_regularComponent__test"><button>${label}</button></div></div>`;
  return root.querySelector("button");
}

function attachGameHost(renderTasks) {
  const root = document.getElementById("root");
  const host = {
    targets: [],
    setState() {},
    handleChangeNavTarget(target) {
      this.targets.push(target);
      renderTasks?.();
    },
  };
  root.__reactContainer$mwitoolsTest = { stateNode: host };
  return host;
}

test("task return context uses the stable quest ID, profession and scroll", () => {
  const { card } = taskPage();
  const context = captureTaskReturnContext(
    card,
    runtime.state.characterQuests,
    1_000,
  );
  assert.equal(taskIdentity(runtime.state.characterQuests[0]), "71");
  assert.deepEqual(context, {
    taskId: "71",
    originalIndex: 0,
    profession: "crafting",
    scrollTop: 143,
    expiresAt: 31_000,
    sawAction: false,
  });
});

test("queue submission returns to the stable task in the flat list", async () => {
  await runtime.features.restart("taskAutoReturn");
  const first = taskPage();
  let returnedList;
  const host = attachGameHost(() => {
    const returned = taskPage();
    returnedList = returned.list;
    returnedList.scrollTop = 0;
    returnedList.getBoundingClientRect = () => ({ top: 0, height: 100 });
    returned.card.getBoundingClientRect = () => ({
      top: 300 - returnedList.scrollTop,
      height: 20,
    });
    returned.card.scrollIntoView = () => {
      throw new Error("automatic return must not scroll the page root");
    };
  });
  first.go.click();
  const commit = actionPage();
  await settle(20);
  commit.click();
  await settle(620);
  assert.deepEqual(host.targets, ["tasks"]);
  assert.equal(returnedList.scrollTop, 260);
});

test("localized task and queue buttons preserve automatic return", async () => {
  localStorage.setItem("i18nextLng", "es");
  await runtime.features.restart("taskAutoReturn");
  const first = taskPage({ goLabel: "Ir" });
  let returnedList;
  const host = attachGameHost(() => {
    const returned = taskPage({ goLabel: "Ir" });
    returnedList = returned.list;
    returnedList.scrollTop = 0;
    returnedList.getBoundingClientRect = () => ({ top: 0, height: 100 });
    returned.card.getBoundingClientRect = () => ({
      top: 300 - returnedList.scrollTop,
      height: 20,
    });
  });
  first.go.click();
  const commit = actionPage("Añadir a la cola #1");
  await settle(20);
  commit.click();
  await settle(620);
  assert.deepEqual(host.targets, ["tasks"]);
  assert.equal(returnedList.scrollTop, 260);
  localStorage.setItem("i18nextLng", "zh-CN");
});

test("late task insertion recenters only the task list without page overscroll", async () => {
  await runtime.features.restart("taskAutoReturn");
  const first = taskPage();
  let returnedList;
  let cardOffset = 300;
  document.documentElement.scrollTop = 77;
  const host = attachGameHost(() => {
    const returned = taskPage({ scrollTop: 0 });
    returnedList = returned.list;
    returned.card.dataset.mwitoolsTaskId = "71";
    returnedList.getBoundingClientRect = () => ({ top: 0, height: 100 });
    returned.card.getBoundingClientRect = () => ({
      top: cardOffset - returnedList.scrollTop,
      height: 20,
    });
    setTimeout(() => {
      const fresh = document.createElement("div");
      fresh.className = "RandomTask_randomTask__late";
      fresh.dataset.mwitoolsTaskId = "72";
      returnedList.prepend(fresh);
      cardOffset += 60;
    }, 20);
  });
  first.go.click();
  const commit = actionPage();
  await settle(20);
  commit.click();
  await settle(700);
  assert.deepEqual(host.targets, ["tasks"]);
  assert.equal(returnedList.scrollTop, 320);
  assert.ok(returnedList.scrollTop <= 400);
  assert.equal(document.documentElement.scrollTop, 77);
});

test("manual close returns, while a non-task action never does", async () => {
  await runtime.features.restart("taskAutoReturn");
  const first = taskPage();
  const host = attachGameHost(() => taskPage());
  first.go.click();
  actionPage("Start now");
  await settle(20);
  document.getElementById("root").innerHTML = "";
  await settle();
  assert.deepEqual(host.targets, ["tasks"]);

  host.targets.length = 0;
  actionPage();
  await settle(20);
  document.getElementById("root").innerHTML = "";
  await settle();
  assert.deepEqual(host.targets, []);
});

test("a missing original task falls back to its prior scroll position", async () => {
  await runtime.features.restart("taskAutoReturn");
  const first = taskPage({ scrollTop: 207 });
  let returnedList;
  const host = attachGameHost(() => {
    returnedList = taskPage({ task: false, scrollTop: 0 }).list;
  });
  first.go.click();
  const commit = actionPage("Start action");
  await settle(20);
  commit.click();
  await settle(620);
  assert.deepEqual(host.targets, ["tasks"]);
  assert.equal(returnedList.scrollTop, 207);
});

test("character switch and feature disable discard pending navigation", async () => {
  await runtime.features.restart("taskAutoReturn");
  let first = taskPage();
  const host = attachGameHost(() => taskPage());
  first.go.click();
  actionPage();
  await settle(20);
  await runtime.features.handleCharacterData({ character: { id: "tasks-b" } });
  document.getElementById("root").innerHTML = "";
  await settle();
  assert.deepEqual(host.targets, []);

  first = taskPage();
  first.go.click();
  actionPage();
  await settle(20);
  await runtime.features.disable("taskAutoReturn");
  document.getElementById("root").innerHTML = "";
  await settle();
  assert.deepEqual(host.targets, []);
});
