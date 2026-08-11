import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const TASK_SELECTOR = 'div[class*="RandomTask_randomTask"]';
const card = (title, progress, action = "前往") => `
  <div class="RandomTask_randomTask__test">
    <div class="RandomTask_name__test">${title}</div>
    <div>进度: ${progress}</div>
    <button>${action}</button>
    <div class="mwi-task-insight">任务净利润 — 队列同动作 0</div>
  </div>`;

const dom = new JSDOM(
  `<!doctype html><html><head></head><body>
    <div class="TasksPanel_taskList__test">
      <section class="mwi-task-toolbar">任务总览</section>
      ${card("制作 - 已完成木板", "5 / 5", "领取")}
      ${card("制作 - 木板", "0 / 5")}
      ${card("挤奶 - 奶牛", "0 / 20")}
      ${card("击败 - 苍蝇", "0 / 10")}
      ${card("击败 - 水马", "0 / 10")}
      ${card("击败 - 地牢怪物", "0 / 10")}
    </div>
  </body></html>`,
  { url: "https://test.milkywayidle.com/" },
);
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.window = dom.window;
localStorage.setItem("i18nextLng", "zh-CN");

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/data/translations.js");
await import("../src/core/state.js");
await import("../src/core/action-projection.js");
await import("../src/core/procurement.js");
await import("../src/features/tasks.js");

runtime.api.getOriTextFromElement = (element) => element?.textContent ?? "";
runtime.settings.settingsMap.taskIcons.isTrue = false;
runtime.settings.settingsMap.taskAutoSort.isTrue = false;
runtime.state.initData_actionCategoryDetailMap = {
  "/action_categories/combat/smelly_planet": {
    name: "Smelly Planet",
    sortIndex: 1,
  },
  "/action_categories/combat/aqua_planet": {
    name: "Aqua Planet",
    sortIndex: 3,
  },
  "/action_categories/combat/dungeons": { name: "Dungeons", sortIndex: 12 },
};
runtime.state.initData_actionDetailMap = {
  "/actions/crafting/done": {
    hrid: "/actions/crafting/done",
    name: "Done Lumber",
    type: "/action_types/crafting",
  },
  "/actions/crafting/lumber": {
    hrid: "/actions/crafting/lumber",
    name: "Lumber",
    type: "/action_types/crafting",
  },
  "/actions/milking/cow": {
    hrid: "/actions/milking/cow",
    name: "Cow",
    type: "/action_types/milking",
  },
  "/actions/combat/fly": {
    hrid: "/actions/combat/fly",
    name: "Fly",
    type: "/action_types/combat",
    category: "/action_categories/combat/smelly_planet",
    combatZoneInfo: { isDungeon: false, fightInfo: { battlesPerBoss: 0 } },
  },
  "/actions/combat/smelly_planet": {
    hrid: "/actions/combat/smelly_planet",
    name: "Smelly Planet",
    type: "/action_types/combat",
    category: "/action_categories/combat/smelly_planet",
    combatZoneInfo: { isDungeon: false, fightInfo: { battlesPerBoss: 10 } },
  },
  "/actions/combat/aquahorse": {
    hrid: "/actions/combat/aquahorse",
    name: "Aquahorse",
    type: "/action_types/combat",
    category: "/action_categories/combat/aqua_planet",
    combatZoneInfo: { isDungeon: false, fightInfo: { battlesPerBoss: 0 } },
  },
  "/actions/combat/aqua_planet": {
    hrid: "/actions/combat/aqua_planet",
    name: "Aqua Planet",
    type: "/action_types/combat",
    category: "/action_categories/combat/aqua_planet",
    combatZoneInfo: { isDungeon: false, fightInfo: { battlesPerBoss: 10 } },
  },
  "/actions/combat/chimerical_den": {
    hrid: "/actions/combat/chimerical_den",
    name: "Chimerical Den",
    type: "/action_types/combat",
    category: "/action_categories/combat/dungeons",
    sortIndex: 56,
    combatZoneInfo: { isDungeon: true, fightInfo: { battlesPerBoss: 0 } },
  },
};
runtime.state.characterQuests = [
  { actionHrid: "/actions/crafting/done" },
  { actionHrid: "/actions/crafting/lumber" },
  { actionHrid: "/actions/milking/cow" },
  { actionHrid: "/actions/combat/fly" },
  { actionHrid: "/actions/combat/aquahorse" },
  { actionHrid: "/actions/combat/chimerical_den" },
];

test("tasks use collapsible profession groups, pin completed cards, and nest combat locations", () => {
  runtime.api.addTaskStyles();
  runtime.api.renderTasks();

  const styles = document.querySelector("#mwitools-task-style").textContent;
  assert.match(styles, /repeat\(auto-fill,minmax\(min\(100%,320px\),1fr\)\)/);
  assert.doesNotMatch(styles, /repeat\(auto-fit/);

  const groups = [...document.querySelectorAll(".mwi-task-profession-group")];
  assert.deepEqual(
    groups.map(
      (group) => group.querySelector(".mwi-task-profession-title").textContent,
    ),
    ["已完成", "挤奶", "制作", "战斗"],
  );
  assert.equal(document.querySelector(".mwi-task-toolbar"), null);
  assert.equal(document.querySelector(".mwi-task-insight"), null);
  assert.match(
    document.querySelector(
      `${TASK_SELECTOR}[data-mwitools-profession="completed"]`,
    ).textContent,
    /已完成木板/,
  );
  assert.doesNotMatch(
    document.querySelector(
      `${TASK_SELECTOR}[data-mwitools-profession="crafting"]`,
    ).textContent,
    /已完成木板/,
  );

  const taskList = document.querySelector('[class*="TasksPanel_taskList"]');
  assert.ok(
    [...taskList.querySelectorAll(TASK_SELECTOR)].every(
      (taskCard) => taskCard.parentElement === taskList,
    ),
    "native React task cards must never be reparented",
  );

  const combatLocations = [
    ...document.querySelectorAll(".mwi-task-combat-location-title"),
  ].map((title) => title.textContent);
  assert.deepEqual(combatLocations, [
    "地图 1 · 臭臭星球 (1)",
    "地图 3 · 海洋星球 (1)",
    "地牢 · 奇幻洞穴 (1)",
  ]);

  const milking = document.querySelector('[data-profession="milking"]');
  milking.querySelector(".mwi-task-profession-header").click();
  assert.equal(
    milking
      .querySelector(".mwi-task-profession-header")
      .getAttribute("aria-expanded"),
    "false",
  );
  assert.equal(milking.querySelector(".mwi-task-profession-body").hidden, true);
  assert.equal(
    document.querySelector(
      `${TASK_SELECTOR}[data-mwitools-profession="milking"]`,
    ).dataset.mwitoolsCollapsed,
    "true",
  );
  runtime.api.renderTasks();
  assert.equal(milking.querySelector(".mwi-task-profession-body").hidden, true);
});

test("submitting a completed task can replace its card without parent mismatch", () => {
  const taskList = document.querySelector('[class*="TasksPanel_taskList"]');
  const submitted = taskList.querySelector(TASK_SELECTOR);
  submitted.remove();
  taskList.insertAdjacentHTML("afterbegin", card("制作 - 新领取木板", "0 / 5"));
  runtime.state.characterQuests = [
    { actionHrid: "/actions/crafting/lumber" },
    ...runtime.state.characterQuests.slice(1),
  ];

  assert.doesNotThrow(() => runtime.api.renderTasks());
  assert.ok(
    [...taskList.querySelectorAll(TASK_SELECTOR)].every(
      (taskCard) => taskCard.parentElement === taskList,
    ),
  );
});

test("re-entering a rebuilt task page never moves new cards into a detached page", () => {
  for (let visit = 0; visit < 3; visit += 1) {
    document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="TasksPanel_taskList__visit${visit}">
        ${card(`制作 - 木板 ${visit}`, "0 / 5")}
        ${card(`挤奶 - 奶牛 ${visit}`, "0 / 20")}
      </div>`,
    );
    runtime.state.characterQuests = [
      { actionHrid: "/actions/crafting/lumber" },
      { actionHrid: "/actions/milking/cow" },
    ];

    runtime.api.renderTasks();

    const currentList = document.querySelector(
      `.TasksPanel_taskList__visit${visit}`,
    );
    assert.ok(currentList?.isConnected);
    assert.equal(currentList.querySelectorAll(TASK_SELECTOR).length, 2);
    assert.deepEqual(
      [...currentList.querySelectorAll(".mwi-task-profession-title")].map(
        (title) => title.textContent,
      ),
      ["已完成", "挤奶", "制作"],
    );
  }
});

test("auto sort keeps tasks from the same full production chain together", () => {
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="TasksPanel_taskList__chains">
      ${card("奶酪锻造 - 深紫刷子", "0 / 5")}
      ${card("奶酪锻造 - 无关工具", "0 / 5")}
      ${card("奶酪锻造 - 绛红刷子", "0 / 5")}
    </div>`,
  );
  runtime.state.initData_actionCategoryDetailMap = {
    "/action_categories/cheesesmithing/tools": { sortIndex: 1 },
  };
  const action = (
    hrid,
    inputItems,
    outputItems,
    sortIndex,
    upgradeItemHrid,
  ) => ({
    hrid,
    name: hrid.split("/").pop(),
    type: "/action_types/cheesesmithing",
    category: "/action_categories/cheesesmithing/tools",
    inputItems,
    outputItems,
    sortIndex,
    upgradeItemHrid,
  });
  runtime.state.initData_actionDetailMap = Object.fromEntries(
    [
      action(
        "/actions/cheesesmithing/burble_brush",
        [{ itemHrid: "/items/burble_ingot", count: 1 }],
        [{ itemHrid: "/items/burble_brush", count: 1 }],
        1,
      ),
      action(
        "/actions/cheesesmithing/hidden_brush_stage",
        [{ itemHrid: "/items/burble_brush", count: 1 }],
        [{ itemHrid: "/items/hidden_brush_stage", count: 1 }],
        2,
        "/items/burble_brush",
      ),
      action(
        "/actions/cheesesmithing/unrelated_tool",
        [{ itemHrid: "/items/unrelated_ingot", count: 1 }],
        [{ itemHrid: "/items/unrelated_tool", count: 1 }],
        3,
      ),
      action(
        "/actions/cheesesmithing/crimson_brush",
        [{ itemHrid: "/items/hidden_brush_stage", count: 1 }],
        [{ itemHrid: "/items/crimson_brush", count: 1 }],
        4,
        "/items/hidden_brush_stage",
      ),
    ].map((detail) => [detail.hrid, detail]),
  );
  runtime.state.characterQuests = [
    { actionHrid: "/actions/cheesesmithing/burble_brush" },
    { actionHrid: "/actions/cheesesmithing/unrelated_tool" },
    { actionHrid: "/actions/cheesesmithing/crimson_brush" },
  ];
  runtime.settings.settingsMap.taskAutoSort.isTrue = true;

  runtime.api.renderTasks();

  const orderedTitles = [
    ...document.querySelectorAll(
      '.TasksPanel_taskList__chains > div[class*="RandomTask_randomTask"]',
    ),
  ]
    .sort((left, right) => Number(left.style.order) - Number(right.style.order))
    .map(
      (taskCard) =>
        taskCard.querySelector('div[class*="RandomTask_name"]').textContent,
    );
  assert.deepEqual(orderedTitles, [
    "奶酪锻造 - 深紫刷子",
    "奶酪锻造 - 绛红刷子",
    "奶酪锻造 - 无关工具",
  ]);
});
