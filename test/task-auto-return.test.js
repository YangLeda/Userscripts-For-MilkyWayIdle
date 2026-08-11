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
const { captureTaskReturnContext, taskIdentity } =
  await import("../src/features/task-auto-return.js");

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

function taskPage({ task = true, collapsed = false, scrollTop = 143 } = {}) {
  const root = document.getElementById("root");
  root.innerHTML = `
    <div class="TasksPanel_taskList__test">
      <section class="mwi-task-profession-group" data-profession="crafting">
        <button class="mwi-task-profession-header" aria-expanded="${!collapsed}">Crafting</button>
        ${
          task
            ? `<div class="RandomTask_randomTask__test" data-mwitools-original-index="0" data-mwitools-profession="crafting"><button>Go</button></div>`
            : ""
        }
      </section>
    </div>`;
  const list = root.querySelector("[class*=TasksPanel_taskList]");
  setScrollable(list, scrollTop);
  return {
    root,
    list,
    card: root.querySelector("[class*=RandomTask_randomTask]"),
    go: root.querySelector("[class*=RandomTask_randomTask] button"),
    header: root.querySelector(".mwi-task-profession-header"),
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

test("queue submission returns to the stable task and expands its group", async () => {
  await runtime.features.restart("taskAutoReturn");
  const first = taskPage();
  let restored = 0;
  let expanded = 0;
  const host = attachGameHost(() => {
    const returned = taskPage({ collapsed: true });
    returned.card.scrollIntoView = () => {
      restored += 1;
    };
    returned.header.addEventListener("click", () => {
      expanded += 1;
      returned.header.setAttribute("aria-expanded", "true");
    });
  });
  first.go.click();
  const commit = actionPage();
  await settle(20);
  commit.click();
  await settle(620);
  assert.deepEqual(host.targets, ["tasks"]);
  assert.equal(restored, 1);
  assert.equal(expanded, 1);
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
