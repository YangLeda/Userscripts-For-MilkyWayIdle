import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const TASK_SELECTOR = 'div[class*="RandomTask_randomTask"]';
const card = (title, progress, action = "前往") => `
  <div class="RandomTask_randomTask__test">
    <div class="RandomTask_name__test">${title}</div>
    <div>进度: ${progress}</div>
    <button>重置</button>
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
await import("../src/core/game-data.js");
const { registerGameLocaleResources } =
  await import("../src/core/game-localization.js");
const { resetGameSpriteSources } = await import("../src/core/game-assets.js");
await import("../src/core/state.js");
await import("../src/core/action-projection.js");
await import("../src/core/procurement.js");
const {
  dungeonLocationsForCard,
  repairRangedWayIdleRerollButtons,
  shouldRenderTaskMutations,
  taskArtworkForCard,
} = await import("../src/features/tasks.js");
const { taskNewStorageKey, writeTaskNewState } =
  await import("../src/features/task-new-badge.js");

registerGameLocaleResources("zh", {
  itemNames: { "/items/lumber": "木板" },
  actionNames: {
    "/actions/crafting/done": "已完成木板",
    "/actions/crafting/lumber": "木板",
    "/actions/milking/cow": "奶牛",
    "/actions/combat/fly": "苍蝇",
    "/actions/combat/aquahorse": "水马",
    "/actions/combat/chimerical_den": "奇幻洞穴",
    "/actions/combat/sinister_circus": "邪恶马戏团",
    "/actions/combat/enchanted_fortress": "魔法城堡",
    "/actions/combat/pirate_cove": "海盗湾",
    "/actions/combat/rat": "杰瑞",
    "/actions/combat/eye": "独眼",
    "/actions/cheesesmithing/burble_brush": "深紫刷子",
    "/actions/cheesesmithing/crimson_brush": "绛红刷子",
    "/actions/cheesesmithing/rainbow_brush": "彩虹刷子",
    "/actions/cheesesmithing/unrelated_tool": "无关工具",
  },
  monsterNames: {
    "/monsters/fly": "苍蝇",
    "/monsters/aquahorse": "水马",
    "/monsters/rat": "杰瑞",
    "/monsters/eye": "独眼",
    "/monsters/frost_sniper": "霜冻狙击手",
    "/monsters/luna_butterfly": "月神之蝶",
  },
  abilityNames: { "/abilities/strike": "猛击" },
});

runtime.api.getOriTextFromElement = (element) => element?.textContent ?? "";
runtime.settings.settingsMap.taskIcons.isTrue = false;
runtime.settings.settingsMap.taskAutoSort.isTrue = false;
runtime.state.currentCharacterId = "tasks-test";
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
    outputItems: [{ itemHrid: "/items/lumber", count: 1 }],
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
    combatZoneInfo: {
      isDungeon: false,
      fightInfo: { battlesPerBoss: 0, monsterHrid: "/monsters/fly" },
    },
  },
  "/actions/combat/smelly_planet": {
    hrid: "/actions/combat/smelly_planet",
    name: "Smelly Planet",
    type: "/action_types/combat",
    category: "/action_categories/combat/smelly_planet",
    combatZoneInfo: {
      isDungeon: false,
      fightInfo: {
        battlesPerBoss: 10,
        bossSpawns: [{ combatMonsterHrid: "/monsters/luna_butterfly" }],
      },
    },
  },
  "/actions/combat/aquahorse": {
    hrid: "/actions/combat/aquahorse",
    name: "Aquahorse",
    type: "/action_types/combat",
    category: "/action_categories/combat/aqua_planet",
    combatZoneInfo: {
      isDungeon: false,
      fightInfo: { battlesPerBoss: 0, monsterHrid: "/monsters/aquahorse" },
    },
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
    combatZoneInfo: {
      isDungeon: true,
      dungeonInfo: {
        randomSpawnInfoMap: {
          fly: { combatMonsterHrid: "/monsters/fly" },
          horse: { combatMonsterHrid: "/monsters/aquahorse" },
        },
        fixedSpawnsMap: {},
      },
    },
  },
  "/actions/combat/sinister_circus": {
    hrid: "/actions/combat/sinister_circus",
    name: "Sinister Circus",
    type: "/action_types/combat",
    category: "/action_categories/combat/dungeons",
    sortIndex: 57,
    combatZoneInfo: {
      isDungeon: true,
      dungeonInfo: {
        randomSpawnInfoMap: {
          fly: { combatMonsterHrid: "/monsters/fly" },
        },
        fixedSpawnsMap: {},
      },
    },
  },
  "/actions/combat/enchanted_fortress": {
    hrid: "/actions/combat/enchanted_fortress",
    name: "Enchanted Fortress",
    type: "/action_types/combat",
    category: "/action_categories/combat/dungeons",
    sortIndex: 58,
    combatZoneInfo: {
      isDungeon: true,
      dungeonInfo: {
        randomSpawnInfoMap: {
          horse: { combatMonsterHrid: "/monsters/aquahorse" },
        },
        fixedSpawnsMap: {},
      },
    },
  },
  "/actions/combat/pirate_cove": {
    hrid: "/actions/combat/pirate_cove",
    name: "Pirate Cove",
    type: "/action_types/combat",
    category: "/action_categories/combat/dungeons",
    sortIndex: 59,
    combatZoneInfo: {
      isDungeon: true,
      dungeonInfo: {
        randomSpawnInfoMap: {
          fly: { combatMonsterHrid: "/monsters/fly" },
        },
        fixedSpawnsMap: {},
      },
    },
  },
};
runtime.state.initData_combatMonsterDetailMap = {
  "/monsters/fly": { hrid: "/monsters/fly", name: "Fly" },
  "/monsters/aquahorse": { hrid: "/monsters/aquahorse", name: "Aquahorse" },
  "/monsters/rat": { hrid: "/monsters/rat", name: "Rat" },
  "/monsters/eye": { hrid: "/monsters/eye", name: "Eye" },
  "/monsters/frost_sniper": {
    hrid: "/monsters/frost_sniper",
    name: "Frost Sniper",
  },
};
runtime.state.initData_monsterDetailMap =
  runtime.state.initData_combatMonsterDetailMap;
runtime.state.characterQuests = [
  { actionHrid: "/actions/crafting/done" },
  { actionHrid: "/actions/crafting/lumber" },
  { actionHrid: "/actions/milking/cow" },
  { actionHrid: "/actions/combat/fly" },
  { actionHrid: "/actions/combat/aquahorse" },
  { actionHrid: "/actions/combat/chimerical_den" },
];

test("tasks use a flat sorted list with statistics filters", () => {
  runtime.api.addTaskStyles();
  runtime.api.renderTasks();

  const styles = document.querySelector("#mwitools-task-style").textContent;
  assert.match(
    styles,
    /TasksPanel_taskList[^}]*repeat\(auto-fill,minmax\(min\(100%,270px\),1fr\)/,
  );
  assert.match(
    styles,
    /TasksPanel_taskList[^}]*> \*[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*box-sizing:\s*border-box/,
  );
  assert.match(styles, /RandomTask_randomTask[^}]*min-width:\s*0\s*!important/);
  assert.match(
    styles,
    /\.mwi-task-toolbar[^}]*display:flex[^}]*flex-direction:column/,
  );
  assert.match(
    styles,
    /\.mwi-task-filter-group--life,\.mwi-task-filter-group--combat\s*\{[^}]*flex-wrap:nowrap/,
  );
  assert.match(styles, /\.mwi-task-filter-groups\s*\{[^}]*flex-wrap:nowrap/);
  assert.match(
    styles,
    /\.mwi-task-filter-group--combat\s*\{[^}]*flex:0 0 auto/,
  );
  assert.match(
    styles,
    /@media \(max-width:640px\)[\s\S]*\.mwi-task-filter-groups\s*\{[^}]*flex-wrap:wrap[\s\S]*\.mwi-task-filter-group--life\s*\{[^}]*flex-wrap:wrap/,
  );
  assert.match(
    styles,
    /\.mwi-task-bg\s*\{[^}]*top:6%[^}]*right:8%[^}]*left:0[^}]*display:flex[^}]*height:88%[^}]*flex-direction:row-reverse/,
  );
  assert.match(
    styles,
    /\.mwi-task-bg svg\s*\{[^}]*width:24%[^}]*height:100%[^}]*flex:0 0 24%/,
  );
  assert.match(
    styles,
    /\.mwi-task-merge-toast[^}]*position:fixed[^}]*z-index:2147483200/,
  );
  assert.doesNotMatch(styles, /repeat\(auto-fit/);
  assert.match(styles, /@media \(max-width:640px\)/);
  assert.equal(document.querySelector(".mwi-task-profession-group"), null);
  assert.equal(document.querySelector(".mwi-task-combat-location"), null);
  assert.equal(
    document.querySelector('[data-mwitools-task-mirror="true"]'),
    null,
  );
  assert.equal(document.querySelector(".mwi-task-insight"), null);

  const taskList = document.querySelector('[class*="TasksPanel_taskList"]');
  assert.ok(
    [...taskList.querySelectorAll(TASK_SELECTOR)].every(
      (taskCard) => taskCard.parentElement === taskList,
    ),
    "native React task cards must never be reparented",
  );
  const orderedTitles = [...taskList.querySelectorAll(TASK_SELECTOR)]
    .sort((left, right) => Number(left.style.order) - Number(right.style.order))
    .map(
      (taskCard) =>
        taskCard.querySelector('div[class*="RandomTask_name"]').textContent,
    );
  assert.deepEqual(orderedTitles, [
    "制作 - 已完成木板",
    "挤奶 - 奶牛",
    "制作 - 木板",
    "击败 - 苍蝇",
    "击败 - 水马",
    "击败 - 地牢怪物",
  ]);
  assert.equal(
    taskList.querySelector(
      `${TASK_SELECTOR}[data-mwitools-task-state="completed"]`,
    ).dataset.mwitoolsProfession,
    "crafting",
  );

  const toolbar = document.querySelector(".mwi-task-toolbar");
  assert.ok(toolbar);
  assert.equal(toolbar.querySelectorAll(".mwi-task-filter").length, 14);
  const resetFilter = toolbar.querySelector('[data-filter-kind="reset"]');
  const sortButton = toolbar.querySelector(".mwi-task-sort-button");
  assert.equal(
    resetFilter.parentElement.className,
    "mwi-task-toolbar-controls",
  );
  assert.equal(sortButton.parentElement, resetFilter.parentElement);
  assert.equal(
    toolbar.querySelectorAll(
      '[data-filter-kind="profession"] .mwi-task-filter-label,[data-filter-kind="combat"] .mwi-task-filter-label,[data-filter-kind="dungeon"] .mwi-task-filter-label',
    ).length,
    0,
  );
  assert.ok(
    [
      ...toolbar.querySelectorAll(
        '[data-filter-kind="profession"],[data-filter-kind="combat"],[data-filter-kind="dungeon"]',
      ),
    ].every(
      (button) =>
        button.title.includes("(") &&
        button.getAttribute("aria-label") === button.title &&
        button.hasAttribute("aria-pressed"),
    ),
  );
  assert.equal(
    toolbar.querySelector('[data-filter-kind="reset"] .mwi-task-filter-label')
      .textContent,
    "重置筛选",
  );
  assert.equal(
    toolbar.querySelector(".mwi-task-sort-button .mwi-task-filter-label")
      .textContent,
    "任务排序",
  );
  assert.equal(
    toolbar.querySelectorAll(
      ":scope > .mwi-task-filter-groups > .mwi-task-filter-group--life > .mwi-task-filter",
    ).length,
    8,
  );
  assert.equal(
    toolbar.querySelectorAll(
      ":scope > .mwi-task-filter-groups > .mwi-task-filter-group--combat .mwi-task-filter",
    ).length,
    5,
  );
  assert.equal(
    toolbar.querySelector(
      '[data-filter-kind="profession"][data-filter-value="alchemy"]',
    ),
    null,
  );
  assert.equal(
    toolbar.querySelector(
      '[data-filter-kind="profession"][data-filter-value="enhancing"]',
    ),
    null,
  );
  assert.equal(resetFilter.querySelector(".mwi-task-filter-count"), null);
  assert.equal(resetFilter.hasAttribute("aria-pressed"), false);
  assert.equal(resetFilter.disabled, true);
  assert.equal(
    toolbar.querySelector(
      '[data-filter-kind="profession"][data-filter-value="crafting"] .mwi-task-filter-count',
    ).textContent,
    "2",
  );
  assert.equal(
    toolbar.querySelector('[data-filter-kind="combat"] .mwi-task-filter-count')
      .textContent,
    "3",
  );
  assert.ok(sortButton);
  assert.equal(
    taskList.querySelectorAll(`${TASK_SELECTOR}[data-mwitools-filtered="true"]`)
      .length,
    0,
  );
  assert.ok(
    [
      ...toolbar.querySelectorAll(
        '[data-filter-kind="profession"],[data-filter-kind="combat"],[data-filter-kind="dungeon"]',
      ),
    ].every((button) => button.getAttribute("aria-pressed") === "false"),
  );

  toolbar
    .querySelector(
      '[data-filter-kind="profession"][data-filter-value="crafting"]',
    )
    .click();
  assert.equal(
    taskList.querySelectorAll(`${TASK_SELECTOR}[data-mwitools-filtered="true"]`)
      .length,
    4,
  );
  toolbar.querySelector('[data-filter-kind="combat"]').click();
  assert.equal(
    taskList.querySelectorAll(`${TASK_SELECTOR}[data-mwitools-filtered="true"]`)
      .length,
    1,
  );
  assert.equal(resetFilter.disabled, false);
  resetFilter.click();
  assert.equal(
    taskList.querySelectorAll(`${TASK_SELECTOR}[data-mwitools-filtered="true"]`)
      .length,
    0,
  );
});

test("task artwork resolves target items and monsters as translucent sprite art", () => {
  const cards = [...document.querySelectorAll(TASK_SELECTOR)];
  assert.deepEqual(
    taskArtworkForCard(cards[1], runtime.state.characterQuests[1]),
    {
      kind: "items",
      hrid: "/items/lumber",
    },
  );
  assert.deepEqual(
    taskArtworkForCard(cards[3], runtime.state.characterQuests[3]),
    {
      kind: "combat_monsters",
      hrid: "/monsters/fly",
    },
  );
  assert.deepEqual(
    taskArtworkForCard(cards[3], {
      actionHrid: "/actions/combat/aquahorse",
      monsterHrid: "/monsters/aquahorse",
    }),
    {
      kind: "combat_monsters",
      hrid: "/monsters/fly",
    },
    "the monster visibly named on the card must win over a zone or stale task ID",
  );

  document.body.insertAdjacentHTML(
    "afterbegin",
    `<svg style="display:none"><use href="/static/media/items_sprite.test.svg#coin"></use></svg>
     <svg style="display:none"><use href="/static/media/combat_monsters_sprite.test.svg#fly"></use></svg>`,
  );
  resetGameSpriteSources();
  const originalQuerySelectorAll = document.querySelectorAll.bind(document);
  let spriteSourceScans = 0;
  document.querySelectorAll = function querySelectorAll(selector) {
    if (selector === "svg use,img[src],link[href]") spriteSourceScans += 1;
    return originalQuerySelectorAll(selector);
  };
  runtime.settings.settingsMap.taskIcons.isTrue = true;
  runtime.api.renderTasks();
  assert.equal(spriteSourceScans, 1);
  assert.match(
    cards[1].querySelector(".mwi-task-bg use").getAttribute("href"),
    /items_sprite\.test\.svg#lumber$/,
  );
  assert.match(
    cards[3].querySelector(".mwi-task-bg use").getAttribute("href"),
    /combat_monsters_sprite\.test\.svg#fly$/,
  );
  runtime.settings.settingsMap.taskIcons.isTrue = false;
  runtime.api.renderTasks();
  document.querySelectorAll = originalQuerySelectorAll;
});

test("combat action indexes are reused for repeated dungeon classification", () => {
  const originalMap = runtime.state.initData_actionDetailMap;
  let dungeonInfoReads = 0;
  const fightInfo = { monsterHrid: "/monsters/cached_beast" };
  runtime.state.initData_actionDetailMap = {
    "/actions/combat/cached_beast": {
      hrid: "/actions/combat/cached_beast",
      name: "Cached Beast",
      type: "/action_types/combat",
      category: "/action_categories/combat/smelly_planet",
      combatZoneInfo: { isDungeon: false, fightInfo },
    },
    "/actions/combat/cached_dungeon": {
      hrid: "/actions/combat/cached_dungeon",
      name: "Cached Dungeon",
      type: "/action_types/combat",
      combatZoneInfo: {
        isDungeon: true,
        get dungeonInfo() {
          dungeonInfoReads += 1;
          return {
            randomSpawnInfoMap: { cached: fightInfo },
            fixedSpawnsMap: {},
          };
        },
      },
    },
  };
  const wrapper = document.createElement("div");
  wrapper.innerHTML = card("击败 - Cached Beast", "0 / 10");
  const taskCard = wrapper.firstElementChild;
  const context = { monsterHrid: "/monsters/cached_beast" };
  assert.equal(
    dungeonLocationsForCard(taskCard, {}, context)[0].isDungeon,
    true,
  );
  const readsAfterBuild = dungeonInfoReads;
  dungeonLocationsForCard(taskCard, {}, context);
  dungeonLocationsForCard(taskCard, {}, context);
  assert.equal(dungeonInfoReads, readsAfterBuild);
  runtime.state.initData_actionDetailMap = originalMap;
});

test("task monsters resolve through a non-Chinese official dictionary", () => {
  registerGameLocaleResources("es", {
    itemNames: { "/items/lumber": "Madera" },
    actionNames: { "/actions/combat/fly": "Mosca" },
    monsterNames: { "/monsters/fly": "Mosca" },
    abilityNames: { "/abilities/strike": "Golpe" },
  });
  localStorage.setItem("i18nextLng", "es");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = card("Derrotar - Mosca", "0 / 10");
  assert.deepEqual(taskArtworkForCard(wrapper.firstElementChild, {}), {
    kind: "combat_monsters",
    hrid: "/monsters/fly",
  });
  localStorage.setItem("i18nextLng", "zh-CN");
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
    assert.equal(currentList.querySelector(".mwi-task-profession-group"), null);
    assert.ok(document.querySelector(".mwi-task-toolbar"));
    assert.ok(
      [...currentList.querySelectorAll(TASK_SELECTOR)].every(
        (taskCard) => taskCard.parentElement === currentList,
      ),
    );
  }
});

test("a reset refreshes metadata without changing the current card order", () => {
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="TasksPanel_taskList__reset">
      ${card("制作 - 木板", "0 / 5")}
      ${card("挤奶 - 奶牛", "0 / 20")}
    </div>`,
  );
  runtime.state.characterQuests = [
    { actionHrid: "/actions/crafting/lumber" },
    { actionHrid: "/actions/milking/cow" },
  ];
  runtime.api.renderTasks();

  const resetList = document.querySelector(".TasksPanel_taskList__reset");
  const resetCard = resetList.querySelector(TASK_SELECTOR);
  const originalOrder = resetCard.style.order;
  resetCard.querySelector('div[class*="RandomTask_name"]').textContent =
    "挤奶 - 新奶牛";
  runtime.state.characterQuests[0] = {
    actionHrid: "/actions/milking/cow",
  };
  runtime.api.renderTasks();

  assert.equal(resetCard.dataset.mwitoolsProfession, "milking");
  assert.equal(resetCard.style.order, originalOrder);
  document.querySelector(".mwi-task-sort-button").click();
  assert.equal(resetCard.style.order, "1");

  resetList.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="TasksPanel_taskList__reset-reentered">
      ${card("挤奶 - 新奶牛", "0 / 5")}
      ${card("挤奶 - 奶牛", "0 / 20")}
    </div>`,
  );
  runtime.api.renderTasks();
  assert.equal(
    document.querySelectorAll(
      '.TasksPanel_taskList__reset-reentered [data-mwitools-profession="milking"]',
    ).length,
    2,
  );
  assert.equal(
    document.querySelector(
      '.TasksPanel_taskList__reset-reentered [data-profession="crafting"]',
    ),
    null,
  );
});

test("task mutation filtering ignores MWITools decorations but keeps native progress", () => {
  const list = document.createElement("div");
  list.className = "TasksPanel_taskList__mutation-filter";
  const taskCard = document.createElement("div");
  taskCard.className = "RandomTask_randomTask__mutation-filter";
  const progress = document.createElement("div");
  progress.textContent = "进度: 1 / 10";
  taskCard.append(progress);
  list.append(taskCard);
  document.body.append(list);

  const background = document.createElement("div");
  background.className = "mwi-task-bg";
  assert.equal(
    shouldRenderTaskMutations([
      {
        type: "childList",
        target: taskCard,
        addedNodes: [background],
        removedNodes: [],
      },
    ]),
    false,
  );
  taskCard.append(background);
  background.remove();
  assert.equal(
    shouldRenderTaskMutations([
      {
        type: "childList",
        target: taskCard,
        addedNodes: [],
        removedNodes: [background],
      },
    ]),
    true,
    "React removing a task icon must schedule its restoration",
  );
  const newBadge = document.createElement("span");
  newBadge.className = "mwi-task-new-badge";
  assert.equal(
    shouldRenderTaskMutations([
      {
        type: "childList",
        target: taskCard,
        addedNodes: [newBadge],
        removedNodes: [],
      },
    ]),
    false,
  );
  assert.equal(
    shouldRenderTaskMutations([
      {
        type: "characterData",
        target: progress.firstChild,
        addedNodes: [],
        removedNodes: [],
      },
    ]),
    true,
  );
  list.remove();
});

test("opening the native reset payment choice pauses task regrouping", () => {
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="TasksPanel_taskList__reset-choice">
      ${card("制作 - 木板", "0 / 5")}
    </div>`,
  );
  runtime.state.characterQuests = [
    { id: "reset-choice", actionHrid: "/actions/crafting/lumber" },
  ];
  runtime.api.renderTasks();

  const resetCard = document.querySelector(
    '.TasksPanel_taskList__reset-choice [class*="RandomTask_randomTask"]',
  );
  const resetButton = [...resetCard.querySelectorAll("button")].find(
    (button) => button.textContent === "重置",
  );
  let nativeClicks = 0;
  resetButton.addEventListener("click", () => {
    nativeClicks += 1;
  });
  resetButton.click();

  const records = [{ target: resetCard, addedNodes: [], removedNodes: [] }];
  assert.equal(nativeClicks, 1);
  assert.equal(shouldRenderTaskMutations(records), false);
  assert.equal(shouldRenderTaskMutations(records, Date.now() + 10_001), true);

  const replacement = document.createElement("button");
  replacement.textContent = "重置";
  resetButton.replaceWith(replacement);
  const originalDateNow = Date.now;
  const later = originalDateNow() + 20_000;
  Date.now = () => later;
  try {
    replacement.click();
    assert.equal(shouldRenderTaskMutations(records, later), false);
  } finally {
    Date.now = originalDateNow;
  }
  runtime.state.characterQuests[0] = {
    ...runtime.state.characterQuests[0],
    id: "reset-choice-completed",
  };
  runtime.api.renderTasks();
});

test("Ranged Way Idle interop restores only a stale preferred reroll button", () => {
  const container = document.createElement("div");
  container.className = "RandomTask_rerollOptionsContainer__ranged-fixture";
  const expensive = document.createElement("button");
  expensive.className = "RangedWayIdleTaskButton Button_disabled__fixture";
  expensive.dataset.moreExpensive = "true";
  expensive.disabled = true;
  const preferred = document.createElement("button");
  preferred.className = "RangedWayIdleTaskButton Button_disabled__fixture";
  preferred.dataset.moreExpensive = "false";
  preferred.disabled = true;
  const preferredState = { isOnCooldown: true };
  preferred.__reactFiber$rangedFixture = {
    return: { stateNode: { state: preferredState } },
  };
  container.append(expensive, preferred);
  document.body.append(container);

  assert.equal(repairRangedWayIdleRerollButtons(), 1);
  assert.equal(preferred.disabled, false);
  assert.equal(preferredState.isOnCooldown, false);
  assert.equal(
    [...preferred.classList].some((name) =>
      name.startsWith("Button_disabled__"),
    ),
    false,
  );
  assert.equal(expensive.disabled, true);
  assert.equal(expensive.classList.contains("Button_disabled__fixture"), true);

  expensive.disabled = false;
  expensive.classList.remove("Button_disabled__fixture");
  preferred.disabled = true;
  preferredState.isOnCooldown = true;
  assert.equal(repairRangedWayIdleRerollButtons(), 0);
  assert.equal(
    preferred.disabled,
    true,
    "disabled mode must be inferred safely",
  );
  assert.equal(preferredState.isOnCooldown, true);

  const extra = document.createElement("button");
  extra.className = "RangedWayIdleTaskButton";
  extra.dataset.moreExpensive = "false";
  container.append(extra);
  expensive.disabled = true;
  expensive.classList.add("Button_disabled__fixture");
  assert.equal(repairRangedWayIdleRerollButtons(), 0);
  container.remove();
});

test("an open reroll payment choice pauses task artwork writes until it closes", () => {
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div class="TasksPanel_taskList__reroll-pause">
       ${card("制作 - 木板", "0 / 5")}
     </div>`,
  );
  runtime.settings.settingsMap.taskNewBadge.isTrue = false;
  runtime.settings.settingsMap.taskIcons.isTrue = true;
  runtime.state.characterQuests = [
    { id: "reroll-pause", actionHrid: "/actions/crafting/lumber" },
  ];
  assert.equal(runtime.api.renderTasks(), true);
  const taskCard = document.querySelector(
    ".TasksPanel_taskList__reroll-pause " + TASK_SELECTOR,
  );
  const background = taskCard.querySelector(".mwi-task-bg");
  const options = document.createElement("div");
  options.className = "RandomTask_rerollOptionsContainer__pause";
  document.body.append(options);
  taskCard.querySelector('[class*="RandomTask_name"]').textContent =
    "制作 - New Output";
  runtime.state.initData_actionDetailMap["/actions/crafting/new_output"] = {
    hrid: "/actions/crafting/new_output",
    name: "New Output",
    type: "/action_types/crafting",
    outputItems: [{ itemHrid: "/items/new_output", count: 1 }],
  };
  runtime.state.characterQuests = [
    { id: "reroll-pause-new", actionHrid: "/actions/crafting/new_output" },
  ];
  assert.equal(runtime.api.renderTasks(), true);
  assert.equal(taskCard.querySelector(".mwi-task-bg"), background);
  assert.match(
    background.querySelector("use").getAttribute("href"),
    /#lumber$/,
  );

  options.remove();
  assert.equal(runtime.api.renderTasks(), true);
  assert.equal(taskCard.querySelector(".mwi-task-bg"), background);
  assert.match(
    background.querySelector("use").getAttribute("href"),
    /#new_output$/,
  );
  runtime.settings.settingsMap.taskIcons.isTrue = false;
});

test("disabling task statistics keeps the manual sort control only", () => {
  runtime.settings.settingsMap.taskStatistics.isTrue = false;
  runtime.api.renderTasks();
  const toolbar = document.querySelector(".mwi-task-toolbar");
  assert.ok(toolbar.querySelector(".mwi-task-sort-button"));
  assert.equal(toolbar.querySelector(".mwi-task-filter"), null);
  assert.equal(
    document.querySelectorAll(`${TASK_SELECTOR}[data-mwitools-filtered="true"]`)
      .length,
    0,
  );
  runtime.settings.settingsMap.taskStatistics.isTrue = true;
  runtime.api.renderTasks();
  assert.equal(
    document.querySelectorAll(".mwi-task-toolbar .mwi-task-filter").length,
    14,
  );
});

test("new tasks sort first for one task-page visit without a group", () => {
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="TasksPanel_taskList__new-group">
      ${card("制作 - 木板", "0 / 5")}
      ${card("制作 - 新木板", "0 / 5")}
    </div>`,
  );
  runtime.state.characterQuests = [
    { id: "known-task", actionHrid: "/actions/crafting/lumber" },
    { id: "fresh-task", actionHrid: "/actions/crafting/lumber" },
  ];
  writeTaskNewState(taskNewStorageKey("tasks-test"), {
    initialized: true,
    known: new Set(["known-task", "fresh-task"]),
    fresh: new Set(["fresh-task"]),
  });
  runtime.settings.settingsMap.taskNewBadge.isTrue = true;
  runtime.api.renderTasks();

  const list = document.querySelector(".TasksPanel_taskList__new-group");
  const freshCard = [...list.querySelectorAll(TASK_SELECTOR)].find((taskCard) =>
    taskCard.textContent.includes("新木板"),
  );
  assert.equal(freshCard.dataset.mwitoolsTaskState, "new");
  assert.equal(freshCard.dataset.mwitoolsProfession, "crafting");
  assert.equal(freshCard.style.order, "1");

  freshCard.querySelector("button").click();
  freshCard.querySelector('div[class*="RandomTask_name"]').textContent =
    "挤奶 - 新奶牛";
  runtime.state.characterQuests[1] = {
    id: "reset-task",
    actionHrid: "/actions/milking/cow",
  };
  runtime.api.renderTasks();
  assert.equal(freshCard.dataset.mwitoolsTaskState, "new");
  assert.equal(freshCard.dataset.mwitoolsProfession, "milking");

  runtime.api.armTemporaryTaskReturn(Date.now() + 30_000);
  list.remove();
  runtime.api.renderTasks();
  assert.deepEqual([...runtime.state.mwitoolsPageNewTaskIds], ["reset-task"]);
  runtime.api.resumeTemporaryTaskReturn();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="TasksPanel_taskList__new-auto-returned">
      ${card("制作 - 木板", "0 / 5")}
      ${card("挤奶 - 新奶牛", "0 / 5")}
    </div>`,
  );
  runtime.api.renderTasks();
  assert.equal(
    document.querySelector(
      '.TasksPanel_taskList__new-auto-returned [data-mwitools-task-id="reset-task"]',
    )?.dataset.mwitoolsTaskState,
    "new",
  );

  document.querySelector(".TasksPanel_taskList__new-auto-returned").remove();
  runtime.api.renderTasks();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="TasksPanel_taskList__new-reentered">
      ${card("制作 - 木板", "0 / 5")}
      ${card("挤奶 - 新奶牛", "0 / 5")}
    </div>`,
  );
  runtime.api.renderTasks();
  assert.equal(
    document.querySelector(
      '.TasksPanel_taskList__new-reentered [data-mwitools-task-id="reset-task"]',
    )?.dataset.mwitoolsTaskState,
    "normal",
  );
  assert.equal(
    document.querySelectorAll(
      '.TasksPanel_taskList__new-reentered [data-mwitools-profession="milking"]',
    ).length,
    1,
  );
});

test("new tasks received on the current page move ahead of every category", () => {
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="TasksPanel_taskList__live-new">
      ${card("挤奶 - 奶牛", "0 / 20")}
      ${card("击败 - 苍蝇", "0 / 10")}
      ${card("击败 - 水马", "0 / 10")}
    </div>`,
  );
  runtime.state.characterQuests = [
    { id: "known-milking", actionHrid: "/actions/milking/cow" },
    { id: "known-fly", actionHrid: "/actions/combat/fly" },
    { id: "known-aquahorse", actionHrid: "/actions/combat/aquahorse" },
  ];
  writeTaskNewState(taskNewStorageKey("tasks-test"), {
    initialized: true,
    known: new Set(runtime.state.characterQuests.map(({ id }) => id)),
    fresh: new Set(),
  });
  runtime.settings.settingsMap.taskNewBadge.isTrue = true;
  runtime.api.renderTasks();

  const list = document.querySelector(".TasksPanel_taskList__live-new");
  const cards = [...list.querySelectorAll(TASK_SELECTOR)];
  cards[1].querySelector('div[class*="RandomTask_name"]').textContent =
    "制作 - 木板";
  cards[1].querySelector("div:nth-child(2)").textContent = "进度: 0 / 5";
  cards[2].querySelector('div[class*="RandomTask_name"]').textContent =
    "挤奶 - 奶牛";
  cards[2].querySelector("div:nth-child(2)").textContent = "进度: 0 / 20";
  runtime.state.characterQuests = [
    { id: "known-milking", actionHrid: "/actions/milking/cow" },
    { id: "fresh-crafting", actionHrid: "/actions/crafting/lumber" },
    { id: "fresh-milking", actionHrid: "/actions/milking/cow" },
  ];
  writeTaskNewState(taskNewStorageKey("tasks-test"), {
    initialized: true,
    known: new Set(runtime.state.characterQuests.map(({ id }) => id)),
    fresh: new Set(["fresh-crafting", "fresh-milking"]),
  });

  runtime.api.renderTasks();

  const orderedIds = [...list.querySelectorAll(TASK_SELECTOR)]
    .sort((left, right) => Number(left.style.order) - Number(right.style.order))
    .map((taskCard) => taskCard.dataset.mwitoolsTaskId);
  assert.deepEqual(orderedIds, [
    "fresh-milking",
    "fresh-crafting",
    "known-milking",
  ]);
  assert.deepEqual(
    [...list.querySelectorAll('[data-mwitools-task-state="new"]')]
      .sort(
        (left, right) => Number(left.style.order) - Number(right.style.order),
      )
      .map((taskCard) => taskCard.dataset.mwitoolsProfession),
    ["milking", "crafting"],
  );
});

test("dungeon counts overlap and filters keep native combat cards", () => {
  runtime.state.initData_actionDetailMap = {
    ...runtime.state.initData_actionDetailMap,
  };
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="TasksPanel_taskList__dungeons">
      ${card("击败 - 苍蝇", "0 / 10")}
      ${card("击败 - 水马", "0 / 10")}
      ${card("击败 - 苍蝇", "0 / 10")}
      ${card("击败 - 奇幻洞穴", "0 / 1")}
      ${card("击败 - 霜冻狙击手", "0 / 10")}
    </div>`,
  );
  runtime.state.initData_actionDetailMap["/actions/combat/chimerical_den"] = {
    ...runtime.state.initData_actionDetailMap["/actions/combat/chimerical_den"],
    combatZoneInfo: {
      isDungeon: true,
      dungeonInfo: {
        randomSpawnInfoMap: {
          fly: { combatMonsterHrid: "/monsters/fly" },
          horse: { combatMonsterHrid: "/monsters/aquahorse" },
        },
        fixedSpawnsMap: {},
      },
    },
  };
  runtime.state.initData_actionDetailMap["/actions/combat/sinister_circus"] = {
    hrid: "/actions/combat/sinister_circus",
    name: "Sinister Circus",
    type: "/action_types/combat",
    category: "/action_categories/combat/dungeons",
    sortIndex: 57,
    combatZoneInfo: {
      isDungeon: true,
      dungeonInfo: {
        randomSpawnInfoMap: {
          fly: { combatMonsterHrid: "/monsters/fly" },
        },
        fixedSpawnsMap: {},
      },
    },
  };
  runtime.state.initData_actionDetailMap["/actions/combat/enchanted_fortress"] =
    {
      hrid: "/actions/combat/enchanted_fortress",
      name: "Enchanted Fortress",
      type: "/action_types/combat",
      category: "/action_categories/combat/dungeons",
      sortIndex: 58,
      combatZoneInfo: {
        isDungeon: true,
        dungeonInfo: {
          randomSpawnInfoMap: {
            horse: { combatMonsterHrid: "/monsters/aquahorse" },
          },
          fixedSpawnsMap: {},
        },
      },
    };
  runtime.state.initData_actionDetailMap["/actions/combat/pirate_cove"] = {
    hrid: "/actions/combat/pirate_cove",
    name: "Pirate Cove",
    type: "/action_types/combat",
    category: "/action_categories/combat/dungeons",
    sortIndex: 59,
    combatZoneInfo: {
      isDungeon: true,
      dungeonInfo: {
        randomSpawnInfoMap: {
          fly: { combatMonsterHrid: "/monsters/fly" },
        },
        fixedSpawnsMap: {},
      },
    },
  };
  runtime.state.initData_actionDetailMap["/actions/combat/frost_sniper"] = {
    hrid: "/actions/combat/frost_sniper",
    name: "Frost Sniper",
    type: "/action_types/combat",
    category: "/action_categories/combat/aqua_planet",
    combatZoneInfo: { isDungeon: false, fightInfo: { battlesPerBoss: 0 } },
  };
  for (const [hrid, name] of [
    ["/actions/combat/sorcerers_tower", "Sorcerer's Tower"],
    ["/actions/combat/infernal_abyss", "Infernal Abyss"],
  ]) {
    runtime.state.initData_actionDetailMap[hrid] = {
      hrid,
      name,
      type: "/action_types/combat",
      category: `/action_categories/combat/${hrid.split("/").at(-1)}`,
      combatZoneInfo: { isDungeon: false, fightInfo: { battlesPerBoss: 10 } },
    };
  }
  runtime.state.characterQuests = [
    { id: "fly-1", actionHrid: "/actions/combat/fly" },
    { id: "horse", actionHrid: "/actions/combat/aquahorse" },
    { id: "fly-2", actionHrid: "/actions/combat/fly" },
    { id: "den", actionHrid: "/actions/combat/chimerical_den" },
    {
      id: "frost-sniper",
      actionHrid: "/actions/combat/frost_sniper",
      monsterHrid: "/monsters/frost_sniper",
    },
  ];
  runtime.settings.settingsMap.taskNewBadge.isTrue = false;
  runtime.settings.settingsMap.taskIcons.isTrue = true;
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<svg style="display:none">
      <use href="/static/media/actions_sprite.test.svg#chimerical_den"></use>
      <use href="/static/media/combat_monsters_sprite.test.svg#fly"></use>
    </svg>`,
  );
  resetGameSpriteSources();
  runtime.api.renderTasks();

  const list = document.querySelector(".TasksPanel_taskList__dungeons");
  const toolbar = document.querySelector(".mwi-task-toolbar");
  assert.equal(list.querySelectorAll(TASK_SELECTOR).length, 5);
  assert.equal(
    document.querySelectorAll('[data-mwitools-task-mirror="true"]').length,
    0,
  );
  assert.equal(
    document.querySelectorAll(".mwi-task-combat-location").length,
    0,
  );
  const dungeonCount = (actionHrid) =>
    Number(
      toolbar.querySelector(
        `[data-filter-kind="dungeon"][data-filter-value="${actionHrid}"] .mwi-task-filter-count`,
      ).textContent,
    );
  assert.equal(dungeonCount("/actions/combat/chimerical_den"), 4);
  assert.equal(dungeonCount("/actions/combat/sinister_circus"), 2);
  assert.equal(dungeonCount("/actions/combat/enchanted_fortress"), 1);
  assert.equal(dungeonCount("/actions/combat/pirate_cove"), 2);
  for (const [actionHrid, title] of [
    ["/actions/combat/sorcerers_tower", "巫师之塔"],
    ["/actions/combat/infernal_abyss", "地狱深渊"],
  ]) {
    const probe = document.createElement("div");
    probe.innerHTML = card(`击败 - ${title}`, "0 / 10");
    assert.equal(
      dungeonLocationsForCard(probe.firstElementChild, { actionHrid })[0].key,
      "non-dungeon-monsters",
    );
  }
  assert.equal(
    dungeonLocationsForCard(
      document.querySelector(TASK_SELECTOR),
      runtime.state.characterQuests[0],
    ).length,
    3,
  );
  assert.deepEqual(
    [
      ...document
        .querySelector(TASK_SELECTOR)
        .querySelectorAll(":scope > .mwi-task-bg use"),
    ].map((use) => use.getAttribute("href")),
    [
      "/static/media/combat_monsters_sprite.test.svg#fly",
      "/static/media/actions_sprite.test.svg#chimerical_den",
      "/static/media/actions_sprite.test.svg#sinister_circus",
      "/static/media/actions_sprite.test.svg#pirate_cove",
    ],
  );
  const firstTaskCard = document.querySelector(TASK_SELECTOR);
  assert.equal(firstTaskCard.dataset.mwitoolsMapIndex, "1");
  assert.equal(
    firstTaskCard.dataset.mwitoolsTaskIconSignature,
    [
      "/static/media/combat_monsters_sprite.test.svg#fly",
      "/static/media/actions_sprite.test.svg#chimerical_den",
      "/static/media/actions_sprite.test.svg#sinister_circus",
      "/static/media/actions_sprite.test.svg#pirate_cove",
    ].join("\n"),
  );

  toolbar
    .querySelector(
      '[data-filter-kind="dungeon"][data-filter-value="/actions/combat/chimerical_den"]',
    )
    .click();
  assert.equal(
    list.querySelectorAll(`${TASK_SELECTOR}[data-mwitools-filtered="true"]`)
      .length,
    1,
  );
  for (const actionHrid of [
    "/actions/combat/sinister_circus",
    "/actions/combat/enchanted_fortress",
    "/actions/combat/pirate_cove",
  ]) {
    toolbar
      .querySelector(
        `[data-filter-kind="dungeon"][data-filter-value="${actionHrid}"]`,
      )
      .click();
  }
  assert.equal(
    list.querySelectorAll(`${TASK_SELECTOR}[data-mwitools-filtered="true"]`)
      .length,
    1,
  );
  toolbar.querySelector('[data-filter-kind="combat"]').click();
  assert.equal(
    list.querySelectorAll(`${TASK_SELECTOR}[data-mwitools-filtered="true"]`)
      .length,
    0,
  );
  toolbar.querySelector('[data-filter-kind="reset"]').click();
  assert.equal(
    list.querySelectorAll(`${TASK_SELECTOR}[data-mwitools-filtered="true"]`)
      .length,
    0,
  );
  runtime.settings.settingsMap.taskNewBadge.isTrue = true;
  runtime.settings.settingsMap.taskIcons.isTrue = false;
});

test("official dungeon spawn maps recognize Eye in every matching dungeon", () => {
  runtime.state.initData_actionDetailMap = {
    ...runtime.state.initData_actionDetailMap,
  };
  runtime.state.initData_actionDetailMap["/actions/combat/eye"] = {
    hrid: "/actions/combat/eye",
    name: "Eye",
    type: "/action_types/combat",
    category: "/action_categories/combat/planet_of_the_eyes",
    combatZoneInfo: {
      isDungeon: false,
      fightInfo: {
        randomSpawnInfo: {
          maxSpawnCount: 1,
          maxTotalStrength: 1,
          spawns: [
            {
              combatMonsterHrid: "/monsters/eye",
              difficultyTier: 0,
              rate: 1,
              strength: 1,
            },
          ],
        },
        bossSpawns: null,
        battlesPerBoss: 0,
      },
    },
  };
  for (const [actionHrid, name, sortIndex] of [
    ["/actions/combat/chimerical_den", "Chimerical Den", 56],
    ["/actions/combat/sinister_circus", "Sinister Circus", 57],
    ["/actions/combat/enchanted_fortress", "Enchanted Fortress", 58],
    ["/actions/combat/pirate_cove", "Pirate Cove", 59],
  ]) {
    runtime.state.initData_actionDetailMap[actionHrid] = {
      hrid: actionHrid,
      name,
      type: "/action_types/combat",
      category: "/action_categories/combat/dungeons",
      sortIndex,
      combatZoneInfo: {
        isDungeon: true,
        dungeonInfo: {
          randomSpawnInfoMap:
            actionHrid === "/actions/combat/chimerical_den" ||
            actionHrid === "/actions/combat/pirate_cove"
              ? { eye: { combatMonsterHrid: "/monsters/eye" } }
              : {},
          fixedSpawnsMap: {},
        },
      },
    };
  }

  const probe = document.createElement("div");
  probe.innerHTML = card("击败 - 独眼", "0 / 10");
  const task = { actionHrid: "/actions/combat/eye" };

  assert.deepEqual(
    dungeonLocationsForCard(probe.firstElementChild, task).map(
      (location) => location.actionHrid,
    ),
    ["/actions/combat/chimerical_den", "/actions/combat/pirate_cove"],
  );
  assert.deepEqual(
    dungeonLocationsForCard(probe.firstElementChild, {
      monsterHrid: "/monsters/eye",
    }).map((location) => location.actionHrid),
    ["/actions/combat/chimerical_den", "/actions/combat/pirate_cove"],
    "an inferred first dungeon must not hide the monster's other dungeons",
  );
  const dungeonProbe = document.createElement("div");
  dungeonProbe.innerHTML = card("击败 - 奇幻洞穴", "0 / 1");
  assert.deepEqual(
    dungeonLocationsForCard(dungeonProbe.firstElementChild, {
      actionHrid: "/actions/combat/chimerical_den",
    }).map((location) => location.actionHrid),
    ["/actions/combat/chimerical_den"],
    "a task explicitly targeting a dungeon must stay assigned to that dungeon",
  );
  assert.deepEqual(taskArtworkForCard(probe.firstElementChild, task), {
    kind: "combat_monsters",
    hrid: "/monsters/eye",
  });
});

test("merged task counts appear in a transient toast outside the action panel", () => {
  const panel = document.createElement("div");
  panel.className = "SkillActionDetail_regularComponent__merge";
  panel.innerHTML = `
    <div class="SkillActionDetail_name__merge">木板</div>
    <div class="SkillActionDetail_actionContainer__merge">
      <div class="SkillActionDetail_maxActionCountInput__merge">
        <div><input value="1"></div>
      </div>
    </div>
  `;
  document.body.append(panel);
  const previousResolver = runtime.api.getActionHridFromItemName;
  const previousExactFormatter = runtime.api.formatExactNumber;
  runtime.api.getActionHridFromItemName = () => "/actions/crafting/lumber";
  runtime.api.formatExactNumber = (value) => String(value);
  runtime.state.pendingMergedTask = {
    actionHrid: "/actions/crafting/lumber",
    taskCount: 2,
    count: 724,
  };

  runtime.api.renderTasks();

  const toast = document.querySelector(".mwi-task-merge-toast");
  assert.ok(toast);
  assert.match(toast.textContent, /已合并 2 个同动作任务，共 724 次/);
  assert.equal(panel.querySelector(".mwi-task-merge-toast"), null);
  assert.equal(panel.querySelector(".mwi-task-merged-note"), null);
  assert.equal(runtime.state.pendingMergedTask, null);

  toast.remove();
  panel.remove();
  runtime.api.getActionHridFromItemName = previousResolver;
  runtime.api.formatExactNumber = previousExactFormatter;
});

test("combat monster grouping stays stable through reset and refreshes on re-entry", () => {
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="TasksPanel_taskList__monster-order">
      ${card("击败 - 苍蝇", "0 / 10")}
      ${card("击败 - 杰瑞", "0 / 10")}
      ${card("击败 - 苍蝇", "0 / 10")}
    </div>`,
  );
  runtime.state.initData_actionDetailMap["/actions/combat/rat"] = {
    hrid: "/actions/combat/rat",
    name: "Rat",
    type: "/action_types/combat",
    category: "/action_categories/combat/smelly_planet",
    combatZoneInfo: { isDungeon: false, fightInfo: { battlesPerBoss: 0 } },
  };
  runtime.state.characterQuests = [
    { id: "stable-fly-1", actionHrid: "/actions/combat/fly" },
    { id: "stable-rat", actionHrid: "/actions/combat/rat" },
    { id: "stable-fly-2", actionHrid: "/actions/combat/fly" },
  ];
  runtime.settings.settingsMap.taskNewBadge.isTrue = false;
  localStorage.setItem(
    "MWITools_task_combat_mode_v1:test.milkywayidle.com:tasks-test",
    "planet",
  );
  runtime.api.renderTasks();

  const orderedTitles = (root) =>
    [...root.querySelectorAll(TASK_SELECTOR)]
      .sort(
        (left, right) => Number(left.style.order) - Number(right.style.order),
      )
      .map(
        (taskCard) =>
          taskCard.querySelector('div[class*="RandomTask_name"]').textContent,
      );
  const list = document.querySelector(".TasksPanel_taskList__monster-order");
  assert.deepEqual(orderedTitles(list), [
    "击败 - 苍蝇",
    "击败 - 苍蝇",
    "击败 - 杰瑞",
  ]);

  const firstSlot = list.querySelector(TASK_SELECTOR);
  const originalOrder = firstSlot.style.order;
  firstSlot.querySelector("button").click();
  list.remove();
  runtime.api.renderTasks();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="TasksPanel_taskList__monster-order-reset">
      ${card("击败 - 杰瑞", "0 / 10")}
      ${card("击败 - 苍蝇", "0 / 10")}
      ${card("击败 - 杰瑞", "0 / 10")}
    </div>`,
  );
  runtime.state.characterQuests = [
    { id: "stable-rat", actionHrid: "/actions/combat/rat" },
    { id: "stable-fly-2", actionHrid: "/actions/combat/fly" },
    { id: "reset-rat", actionHrid: "/actions/combat/rat" },
  ];
  runtime.api.renderTasks();
  const resetList = document.querySelector(
    ".TasksPanel_taskList__monster-order-reset",
  );
  const resetCard = resetList.querySelector(
    `${TASK_SELECTOR}[data-mwitools-task-id="reset-rat"]`,
  );
  assert.equal(resetCard.dataset.mwitoolsOriginalIndex, "0");
  assert.equal(resetCard.style.order, originalOrder);
  assert.deepEqual(orderedTitles(resetList), [
    "击败 - 杰瑞",
    "击败 - 苍蝇",
    "击败 - 杰瑞",
  ]);

  resetList.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="TasksPanel_taskList__monster-order-reentered">
      ${card("击败 - 杰瑞", "0 / 10")}
      ${card("击败 - 杰瑞", "0 / 10")}
      ${card("击败 - 苍蝇", "0 / 10")}
    </div>`,
  );
  runtime.state.characterQuests = [
    { id: "reset-rat", actionHrid: "/actions/combat/rat" },
    { id: "stable-rat", actionHrid: "/actions/combat/rat" },
    { id: "stable-fly-2", actionHrid: "/actions/combat/fly" },
  ];
  runtime.api.renderTasks();
  assert.deepEqual(
    orderedTitles(
      document.querySelector(".TasksPanel_taskList__monster-order-reentered"),
    ),
    ["击败 - 杰瑞", "击败 - 杰瑞", "击败 - 苍蝇"],
  );
  runtime.settings.settingsMap.taskNewBadge.isTrue = true;
});

test("production-chain tasks stay together when automatic sorting is disabled", () => {
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="TasksPanel_taskList__chains">
      ${card("奶酪锻造 - 绛红刷子", "0 / 5")}
      ${card("奶酪锻造 - 无关工具", "0 / 5")}
      ${card("奶酪锻造 - 彩虹刷子", "0 / 5")}
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
      action(
        "/actions/cheesesmithing/rainbow_brush",
        [{ itemHrid: "/items/crimson_brush", count: 1 }],
        [{ itemHrid: "/items/rainbow_brush", count: 1 }],
        5,
        "/items/crimson_brush",
      ),
    ].map((detail) => [detail.hrid, detail]),
  );
  runtime.state.characterQuests = [
    { actionHrid: "/actions/cheesesmithing/crimson_brush" },
    { actionHrid: "/actions/cheesesmithing/unrelated_tool" },
    { actionHrid: "/actions/cheesesmithing/rainbow_brush" },
  ];
  runtime.settings.settingsMap.taskAutoSort.isTrue = false;

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
    "奶酪锻造 - 绛红刷子",
    "奶酪锻造 - 彩虹刷子",
    "奶酪锻造 - 无关工具",
  ]);
});

test("shuffled quest data still keeps the brush chain together", () => {
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  const quests = [
    {
      id: 41,
      actionHrid: "/actions/cheesesmithing/unrelated_tool",
      goalCount: 5,
      currentCount: 0,
    },
    {
      id: 42,
      actionHrid: "/actions/cheesesmithing/crimson_brush",
      goalCount: 5,
      currentCount: 0,
    },
    {
      id: 43,
      actionHrid: "/actions/cheesesmithing/rainbow_brush",
      goalCount: 5,
      currentCount: 0,
    },
    {
      id: 44,
      actionHrid: "/actions/cheesesmithing/burble_brush",
      goalCount: 5,
      currentCount: 0,
    },
  ];
  const list = document.createElement("div");
  list.className = "TasksPanel_taskList__shuffled";
  list.innerHTML = [
    card("奶酪锻造 - 彩虹刷子", "0 / 5"),
    card("奶酪锻造 - 无关工具", "0 / 5"),
    card("奶酪锻造 - 深紫刷子", "0 / 5"),
    card("奶酪锻造 - 绛红刷子", "0 / 5"),
  ].join("");
  const cards = [...list.querySelectorAll(TASK_SELECTOR)];
  [quests[2], quests[0], quests[3], quests[1]].forEach((quest, index) => {
    cards[index].__reactFiber$task = {
      return: { stateNode: { props: { characterQuest: quest } } },
    };
  });
  document.body.appendChild(list);
  runtime.state.initData_actionCategoryDetailMap = {
    "/action_categories/cheesesmithing/tools": { sortIndex: 1 },
  };
  runtime.state.initData_actionDetailMap = {
    "/actions/cheesesmithing/burble_brush": {
      hrid: "/actions/cheesesmithing/burble_brush",
      name: "Burble Brush",
      type: "/action_types/cheesesmithing",
      category: "/action_categories/cheesesmithing/tools",
      outputItems: [{ itemHrid: "/items/burble_brush", count: 1 }],
      sortIndex: 1,
    },
    "/actions/cheesesmithing/crimson_brush": {
      hrid: "/actions/cheesesmithing/crimson_brush",
      name: "Crimson Brush",
      type: "/action_types/cheesesmithing",
      category: "/action_categories/cheesesmithing/tools",
      upgradeItemHrid: "/items/burble_brush",
      outputItems: [{ itemHrid: "/items/crimson_brush", count: 1 }],
      sortIndex: 2,
    },
    "/actions/cheesesmithing/rainbow_brush": {
      hrid: "/actions/cheesesmithing/rainbow_brush",
      name: "Rainbow Brush",
      type: "/action_types/cheesesmithing",
      category: "/action_categories/cheesesmithing/tools",
      upgradeItemHrid: "/items/crimson_brush",
      outputItems: [{ itemHrid: "/items/rainbow_brush", count: 1 }],
      sortIndex: 3,
    },
    "/actions/cheesesmithing/unrelated_tool": {
      hrid: "/actions/cheesesmithing/unrelated_tool",
      name: "Unrelated Tool",
      type: "/action_types/cheesesmithing",
      category: "/action_categories/cheesesmithing/tools",
      outputItems: [{ itemHrid: "/items/unrelated_tool", count: 1 }],
      sortIndex: 4,
    },
  };
  runtime.state.characterQuests = quests;
  runtime.settings.settingsMap.taskAutoSort.isTrue = false;

  runtime.api.renderTasks();

  const orderedCards = cards.sort(
    (left, right) => Number(left.style.order) - Number(right.style.order),
  );
  assert.deepEqual(
    orderedCards.map(
      (taskCard) =>
        taskCard.querySelector('div[class*="RandomTask_name"]').textContent,
    ),
    [
      "奶酪锻造 - 深紫刷子",
      "奶酪锻造 - 绛红刷子",
      "奶酪锻造 - 彩虹刷子",
      "奶酪锻造 - 无关工具",
    ],
  );
  assert.equal(
    cards.find((taskCard) => taskCard.textContent.includes("彩虹刷子")).dataset
      .mwitoolsTaskIndex,
    "2",
  );
});

test("unchanged task polling performs no repeated DOM writes", async () => {
  runtime.api.renderTasks();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const list = document.querySelector('[class*="TasksPanel_taskList"]');
  const records = [];
  const observer = new dom.window.MutationObserver((mutations) =>
    records.push(...mutations),
  );
  observer.observe(list, { attributes: true, childList: true, subtree: true });

  runtime.api.renderTasks();
  await new Promise((resolve) => setTimeout(resolve, 0));
  observer.disconnect();
  assert.equal(records.length, 0);
});

test("producer lookups build the action output index only once per action map", () => {
  const originalMap = runtime.state.initData_actionDetailMap;
  const originalExpectedOutputs = runtime.api.getExpectedOutputs;
  let outputReads = 0;
  runtime.state.initData_actionDetailMap = {
    "/actions/crafting/cached": {
      hrid: "/actions/crafting/cached",
      outputItems: [{ itemHrid: "/items/cached", count: 2 }],
    },
    "/actions/crafting/other": {
      hrid: "/actions/crafting/other",
      outputItems: [{ itemHrid: "/items/other", count: 1 }],
    },
  };
  runtime.api.getExpectedOutputs = (detail) => {
    outputReads += 1;
    return originalExpectedOutputs(detail);
  };

  assert.equal(
    runtime.api.procurement.getProducerAction("/items/cached").actionHrid,
    "/actions/crafting/cached",
  );
  const readsAfterBuild = outputReads;
  runtime.api.procurement.getProducerAction("/items/cached");
  runtime.api.procurement.getProducerAction("/items/other");
  assert.equal(outputReads, readsAfterBuild);

  runtime.api.getExpectedOutputs = originalExpectedOutputs;
  runtime.state.initData_actionDetailMap = originalMap;
});

test("rerolled reused cards merge the latest matching task totals", () => {
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  const list = document.createElement("div");
  list.className = "TasksPanel_taskList__rerolled-merge";
  list.innerHTML = [
    card("制作 - 木板", "1 / 5"),
    card("挤奶 - 奶牛", "2 / 8"),
  ].join("");
  document.body.appendChild(list);
  runtime.settings.settingsMap.taskMergeActions.isTrue = true;
  runtime.state.characterQuests = [
    {
      id: "existing-lumber",
      actionHrid: "/actions/crafting/lumber",
      goalCount: 5,
      currentCount: 1,
    },
    {
      id: "reroll-old",
      actionHrid: "/actions/milking/cow",
      goalCount: 8,
      currentCount: 2,
    },
  ];
  runtime.api.renderTasks();

  const reusedCard = list.querySelectorAll(TASK_SELECTOR)[1];
  assert.equal(reusedCard.dataset.mwitoolsTaskId, "reroll-old");
  assert.equal(reusedCard.dataset.mwitoolsMergeWired, "true");
  reusedCard.querySelector('[class*="RandomTask_name"]').textContent =
    "制作 - 木板";
  [...reusedCard.querySelectorAll("div")].find((node) =>
    node.textContent.startsWith("进度:"),
  ).textContent = "进度: 1 / 6";
  const replacementButton = document.createElement("button");
  replacementButton.textContent = "前往";
  reusedCard.querySelectorAll("button")[1].replaceWith(replacementButton);
  runtime.state.characterQuests = [
    {
      id: "existing-lumber",
      actionHrid: "/actions/crafting/lumber",
      goalCount: 5,
      currentCount: 1,
    },
    {
      id: "reroll-new",
      actionHrid: "/actions/crafting/lumber",
      goalCount: 6,
      currentCount: 1,
    },
  ];
  runtime.api.renderTasks();

  assert.equal(reusedCard.dataset.mwitoolsTaskId, "reroll-new");
  replacementButton.click();
  assert.deepEqual(runtime.state.pendingMergedTask, {
    actionHrid: "/actions/crafting/lumber",
    count: 9,
    taskCount: 2,
  });

  runtime.state.pendingMergedTask = null;
  runtime.state.characterQuests = runtime.state.characterQuests.map(
    ({ id: _id, ...task }) => task,
  );
  runtime.api.renderTasks();
  replacementButton.click();
  assert.deepEqual(runtime.state.pendingMergedTask, {
    actionHrid: "/actions/crafting/lumber",
    count: 9,
    taskCount: 2,
  });

  runtime.state.pendingMergedTask = null;
  runtime.state.characterQuests = [];
  replacementButton.click();
  assert.equal(runtime.state.pendingMergedTask, null);
});

test("planet boss tasks convert remaining bosses into required battles", () => {
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  const previousActionMap = runtime.state.initData_actionDetailMap;
  runtime.state.initData_actionDetailMap = {
    "/actions/combat/smelly_planet": {
      hrid: "/actions/combat/smelly_planet",
      name: "Smelly Planet",
      type: "/action_types/combat",
      category: "/action_categories/combat/smelly_planet",
      combatZoneInfo: {
        isDungeon: false,
        fightInfo: {
          battlesPerBoss: 10,
          bossSpawns: [{ combatMonsterHrid: "/monsters/luna_butterfly" }],
        },
      },
    },
  };
  const list = document.createElement("div");
  list.className = "TasksPanel_taskList__planet-boss";
  list.innerHTML = card("击败 - 月神之蝶", "0 / 4");
  document.body.appendChild(list);
  runtime.settings.settingsMap.taskMergeActions.isTrue = true;
  runtime.state.characterQuests = [
    {
      id: "smelly-planet-boss",
      monsterHrid: "/monsters/luna_butterfly",
      goalCount: 4,
      currentCount: 0,
    },
  ];

  runtime.api.renderTasks();
  list.querySelectorAll("button")[1].click();

  assert.deepEqual(runtime.state.pendingMergedTask, {
    actionHrid: "/actions/combat/smelly_planet",
    count: 40,
    taskCount: 1,
  });
  runtime.state.pendingMergedTask = null;
  runtime.state.initData_actionDetailMap = previousActionMap;
});

test("matching planet boss tasks merge after converting each boss count", () => {
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  const previousActionMap = runtime.state.initData_actionDetailMap;
  runtime.state.initData_actionDetailMap = {
    "/actions/combat/smelly_planet": {
      hrid: "/actions/combat/smelly_planet",
      name: "Smelly Planet",
      type: "/action_types/combat",
      category: "/action_categories/combat/smelly_planet",
      combatZoneInfo: {
        isDungeon: false,
        fightInfo: {
          battlesPerBoss: 10,
          bossSpawns: [{ combatMonsterHrid: "/monsters/luna_butterfly" }],
        },
      },
    },
  };
  const list = document.createElement("div");
  list.className = "TasksPanel_taskList__merged-planet-boss";
  list.innerHTML = [
    card("击败 - 月神之蝶", "0 / 4"),
    card("击败 - 月神之蝶", "1 / 3"),
  ].join("");
  document.body.appendChild(list);
  runtime.settings.settingsMap.taskMergeActions.isTrue = true;
  runtime.state.characterQuests = [
    {
      id: "smelly-planet-boss-a",
      monsterHrid: "/monsters/luna_butterfly",
      goalCount: 4,
      currentCount: 0,
    },
    {
      id: "smelly-planet-boss-b",
      monsterHrid: "/monsters/luna_butterfly",
      goalCount: 3,
      currentCount: 1,
    },
  ];

  runtime.api.renderTasks();
  list.querySelectorAll(TASK_SELECTOR)[0].querySelectorAll("button")[1].click();

  assert.deepEqual(runtime.state.pendingMergedTask, {
    actionHrid: "/actions/combat/smelly_planet",
    count: 60,
    taskCount: 2,
  });
  runtime.state.pendingMergedTask = null;
  runtime.state.initData_actionDetailMap = previousActionMap;
});

test("same-monster combat tasks merge across compatible combat actions", () => {
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  const previousActionMap = runtime.state.initData_actionDetailMap;
  const previousResolver = runtime.api.getActionHridFromItemName;
  runtime.state.initData_actionDetailMap = Object.fromEntries(
    ["zone_a", "zone_b"].map((zone) => [
      `/actions/combat/${zone}`,
      {
        hrid: `/actions/combat/${zone}`,
        type: "/action_types/combat",
        combatZoneInfo: {
          isDungeon: false,
          fightInfo: {
            randomSpawns: [{ combatMonsterHrid: "/monsters/fly" }],
          },
        },
      },
    ]),
  );
  const list = document.createElement("div");
  list.className = "TasksPanel_taskList__same-monster";
  list.innerHTML = [
    card("击败 - 苍蝇", "0 / 4"),
    card("击败 - 苍蝇", "1 / 6"),
  ].join("");
  document.body.appendChild(list);
  runtime.settings.settingsMap.taskMergeActions.isTrue = true;
  runtime.state.characterQuests = [
    {
      id: "fly-a",
      actionHrid: "/actions/combat/zone_a",
      monsterHrid: "/monsters/fly",
      goalCount: 4,
      currentCount: 0,
    },
    {
      id: "fly-b",
      actionHrid: "/actions/combat/zone_b",
      monsterHrid: "/monsters/fly",
      goalCount: 6,
      currentCount: 1,
    },
  ];
  runtime.api.renderTasks();
  list.querySelectorAll(TASK_SELECTOR)[0].querySelectorAll("button")[1].click();
  assert.equal(runtime.state.pendingMergedTask.count, 9);
  assert.equal(runtime.state.pendingMergedTask.taskCount, 2);

  const panel = document.createElement("div");
  panel.className = "SkillActionDetail_regularComponent__same-monster";
  panel.innerHTML = `
    <div class="SkillActionDetail_name__same-monster">Zone B</div>
    <div class="SkillActionDetail_maxActionCountInput__same-monster"><input value="1"></div>`;
  document.body.append(panel);
  runtime.api.getActionHridFromItemName = () => "/actions/combat/zone_b";
  runtime.api.renderTasks();
  assert.equal(panel.querySelector("input").value, "9");
  assert.equal(runtime.state.pendingMergedTask, null);

  panel.remove();
  runtime.api.getActionHridFromItemName = previousResolver;
  runtime.state.initData_actionDetailMap = previousActionMap;
});

test("full task capacity still renders the task module beside its reward card", () => {
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  const quests = Array.from({ length: 30 }, (_, index) => ({
    id: `full-capacity-${index}`,
    actionHrid: "/actions/crafting/lumber",
    currentCount: 0,
    goalCount: 5,
  }));
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div class="TasksPanel_taskList__reward-card">
       <div class="RandomTask_randomTask__reward">
         <div class="RandomTask_name__reward">小紫牛的礼物</div>
         <div>42 / 50 任务积分</div>
         <button>领取</button>
       </div>
       ${quests.map(() => card("制作 - 木板", "0 / 5")).join("")}
     </div>`,
  );
  runtime.state.characterQuests = quests;
  runtime.settings.settingsMap.taskNewBadge.isTrue = false;
  const list = document.querySelector(".TasksPanel_taskList__reward-card");
  const [rewardCard, ...questCards] = list.querySelectorAll(TASK_SELECTOR);
  questCards.forEach((questCard, index) => {
    questCard.__reactFiber$quest = {
      memoizedProps: { characterQuest: quests[index] },
    };
  });

  assert.equal(runtime.api.renderTasks({ allowReusedPositional: false }), true);
  assert.equal(rewardCard.dataset.mwitoolsTaskId, undefined);
  assert.equal(questCards.length, 30);
  assert.deepEqual(
    questCards.map((questCard) => questCard.dataset.mwitoolsTaskId),
    quests.map(({ id }) => id),
  );
  assert.ok(document.querySelector(".mwi-task-toolbar"));
});

test("reused task cards keep the old icon during transition and settle on the new task", () => {
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<svg style="display:none"><use href="/static/media/items_sprite.reuse.svg#seed"></use></svg>
     <div class="TasksPanel_taskList__reused-icon">
       ${card("制作 - Old Output", "0 / 5")}
     </div>`,
  );
  const oldQuest = {
    id: "icon-old",
    actionHrid: "/actions/crafting/old_output",
    goalCount: 5,
    currentCount: 0,
  };
  const newQuest = {
    id: "icon-new",
    actionHrid: "/actions/crafting/new_output",
    goalCount: 7,
    currentCount: 0,
  };
  runtime.state.initData_actionDetailMap = {
    ...runtime.state.initData_actionDetailMap,
    [oldQuest.actionHrid]: {
      hrid: oldQuest.actionHrid,
      name: "Old Output",
      type: "/action_types/crafting",
      outputItems: [{ itemHrid: "/items/old_output", count: 1 }],
    },
    [newQuest.actionHrid]: {
      hrid: newQuest.actionHrid,
      name: "New Output",
      type: "/action_types/crafting",
      outputItems: [{ itemHrid: "/items/new_output", count: 1 }],
    },
  };
  runtime.settings.settingsMap.taskNewBadge.isTrue = false;
  runtime.settings.settingsMap.taskIcons.isTrue = true;
  runtime.state.characterQuests = [oldQuest];
  assert.equal(runtime.api.renderTasks(), true);

  const reusedCard = document.querySelector(
    ".TasksPanel_taskList__reused-icon " + TASK_SELECTOR,
  );
  reusedCard.__reactFiber$staleQuest = {
    memoizedProps: { characterQuest: oldQuest },
  };
  assert.match(
    reusedCard.querySelector(".mwi-task-bg use").getAttribute("href"),
    /items_sprite\.test\.svg#old_output$|items_sprite\.reuse\.svg#old_output$/,
  );
  const background = reusedCard.querySelector(".mwi-task-bg");
  const artworkSvg = background.querySelector("svg");
  const artworkUse = artworkSvg.querySelector("use");

  runtime.state.characterQuests = [newQuest];
  assert.equal(
    runtime.api.renderTasks({ allowReusedPositional: false }),
    false,
  );
  assert.equal(reusedCard.dataset.mwitoolsTaskId, "icon-old");
  assert.match(
    reusedCard.querySelector(".mwi-task-bg use").getAttribute("href"),
    /#old_output$/,
  );

  reusedCard.querySelector('[class*="RandomTask_name"]').textContent =
    "制作 - New Output";
  [...reusedCard.querySelectorAll("div")].find((node) =>
    node.textContent.startsWith("进度:"),
  ).textContent = "进度: 0 / 7";
  assert.equal(runtime.api.renderTasks(), true);
  assert.equal(reusedCard.dataset.mwitoolsTaskId, "icon-new");
  assert.match(
    reusedCard.querySelector(".mwi-task-bg use").getAttribute("href"),
    /#new_output$/,
  );
  assert.equal(reusedCard.querySelector(".mwi-task-bg"), background);
  assert.equal(background.querySelector("svg"), artworkSvg);
  assert.equal(artworkSvg.querySelector("use"), artworkUse);

  const removedBackground = reusedCard.querySelector(".mwi-task-bg");
  removedBackground.remove();
  assert.equal(
    shouldRenderTaskMutations(
      [
        {
          type: "childList",
          target: reusedCard,
          addedNodes: [],
          removedNodes: [removedBackground],
        },
      ],
      Number.MAX_SAFE_INTEGER,
    ),
    true,
  );
  assert.equal(runtime.api.renderTasks(), true);
  assert.match(
    reusedCard.querySelector(".mwi-task-bg use").getAttribute("href"),
    /#new_output$/,
  );
  runtime.settings.settingsMap.taskIcons.isTrue = false;
});

test("localized task controls wire merge and reset behavior", () => {
  registerGameLocaleResources("es", {
    randomTask: {
      go: "Ir",
      reroll: "Volver a tirar",
      claimReward: "Reclamar recompensa",
    },
    questModal: { go: "Ir", claimReward: "Reclamar recompensa" },
    itemNames: { "/items/lumber": "Madera" },
    actionNames: { "/actions/crafting/lumber": "Madera" },
    monsterNames: { "/monsters/rat": "Rata" },
    abilityNames: { "/abilities/strike": "Golpe" },
  });
  localStorage.setItem("i18nextLng", "es");
  document.querySelector('[class*="TasksPanel_taskList"]')?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="TasksPanel_taskList__localized-controls">
      <div class="RandomTask_randomTask__localized">
        <div class="RandomTask_name__localized">Fabricación - Madera</div>
        <div>Progreso: 0 / 5</div>
        <button>Volver a tirar</button>
        <button>Ir</button>
      </div>
    </div>`,
  );
  runtime.state.characterQuests = [
    { id: "localized-controls", actionHrid: "/actions/crafting/lumber" },
  ];
  runtime.settings.settingsMap.taskMergeActions.isTrue = true;
  runtime.api.renderTasks();

  const localizedCard = document.querySelector(
    ".RandomTask_randomTask__localized",
  );
  assert.equal(localizedCard.dataset.mwitoolsMergeWired, "true");
  assert.equal(localizedCard.dataset.mwitoolsResetWired, "true");
  [...localizedCard.querySelectorAll("button")]
    .find((button) => button.textContent === "Ir")
    .click();
  assert.deepEqual(runtime.state.pendingMergedTask, {
    actionHrid: "/actions/crafting/lumber",
    count: 0,
    taskCount: 1,
  });
  runtime.state.pendingMergedTask = null;
  localStorage.setItem("i18nextLng", "zh-CN");
});
