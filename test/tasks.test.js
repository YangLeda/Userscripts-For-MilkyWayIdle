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
await import("../src/data/translations.js");
await import("../src/core/state.js");
await import("../src/core/action-projection.js");
await import("../src/core/procurement.js");
const {
  dungeonLocationsForCard,
  shouldRenderTaskMutations,
  taskArtworkForCard,
} = await import("../src/features/tasks.js");
const { taskNewStorageKey, writeTaskNewState } =
  await import("../src/features/task-new-badge.js");

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
  assert.match(
    styles,
    /TasksPanel_taskList[^}]*repeat\(auto-fill,minmax\(min\(100%,270px\),1fr\)/,
  );
  assert.match(styles, /RandomTask_randomTask[^}]*min-width:\s*0\s*!important/);
  assert.match(
    styles,
    /\.mwi-task-combat-location-body[^}]*repeat\(auto-fill,minmax\(min\(100%,270px\),1fr\)[^}]*gap:8px/,
  );
  assert.match(
    styles,
    /\.mwi-task-bg\s*\{[^}]*top:6%[^}]*left:68%[^}]*width:24%[^}]*height:88%/,
  );
  assert.match(
    styles,
    /\.mwi-task-merge-toast[^}]*position:fixed[^}]*z-index:2147483200/,
  );
  assert.doesNotMatch(styles, /repeat\(auto-fit/);
  assert.match(
    styles,
    /\.mwi-task-profession-header\s*\{[^}]*border:\s*0[^}]*border-left:\s*3px solid rgba\(var\(--mwi-task-group-accent\),\.78\)[^}]*border-radius:\s*0[^}]*background:\s*transparent/s,
  );
  assert.match(
    styles,
    /\.mwi-task-dungeon-header\s*\{[^}]*border:\s*0[^}]*border-left:\s*2px solid rgba\(183,126,255,\.78\)[^}]*border-radius:\s*0[^}]*background:\s*transparent/s,
  );
  assert.match(
    styles,
    /data-profession="new"[^}]*--mwi-task-group-accent:230,181,79/,
  );
  assert.match(
    styles,
    /data-profession="completed"[^}]*--mwi-task-group-accent:90,200,149/,
  );
  assert.match(
    styles,
    /data-profession="combat"[^}]*--mwi-task-group-accent:238,115,103/,
  );

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
  runtime.settings.settingsMap.taskIcons.isTrue = true;
  runtime.api.renderTasks();
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

test("a reset task keeps its current category until the task page is re-entered", () => {
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
  resetCard.querySelector('div[class*="RandomTask_name"]').textContent =
    "挤奶 - 新奶牛";
  runtime.state.characterQuests[0] = {
    actionHrid: "/actions/milking/cow",
  };
  runtime.api.renderTasks();

  assert.equal(resetCard.dataset.mwitoolsProfession, "crafting");
  assert.deepEqual(
    [...resetList.querySelectorAll(".mwi-task-profession-title")].map(
      (title) => title.textContent,
    ),
    ["已完成", "挤奶", "制作"],
  );

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
});

test("new tasks stay in the top group for one task-page visit", () => {
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
  assert.equal(
    list.querySelector(".mwi-task-profession-title").textContent,
    "新任务",
  );
  const freshCard = [...list.querySelectorAll(TASK_SELECTOR)].find((taskCard) =>
    taskCard.textContent.includes("新木板"),
  );
  assert.equal(freshCard.dataset.mwitoolsProfession, "new");

  freshCard.querySelector("button").click();
  freshCard.querySelector('div[class*="RandomTask_name"]').textContent =
    "挤奶 - 新奶牛";
  runtime.state.characterQuests[1] = {
    id: "reset-task",
    actionHrid: "/actions/milking/cow",
  };
  runtime.api.renderTasks();
  assert.equal(freshCard.dataset.mwitoolsProfession, "new");

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
    )?.dataset.mwitoolsProfession,
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
      '.TasksPanel_taskList__new-reentered [data-profession="new"]',
    ),
    null,
  );
  assert.equal(
    document.querySelectorAll(
      '.TasksPanel_taskList__new-reentered [data-mwitools-profession="milking"]',
    ).length,
    1,
  );
});

test("dungeon mode mirrors multi-dungeon monsters and forwards actions", () => {
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
      fightInfo: {
        monsters: ["/monsters/fly", "/monsters/aquahorse"],
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
      fightInfo: { monsters: ["/monsters/fly"] },
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
        fightInfo: { monsters: ["/monsters/aquahorse"] },
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
      fightInfo: { monsters: ["/monsters/fly"] },
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
  localStorage.setItem(
    "MWITools_task_combat_mode_v1:test.milkywayidle.com:tasks-test",
    "planet",
  );
  runtime.api.renderTasks();

  const controls = document.querySelector(".mwi-task-combat-mode");
  controls.querySelector('[data-mode="dungeon"]').click();
  assert.equal(
    document.querySelectorAll('.mwi-task-combat-location[data-mode="dungeon"]')
      .length,
    5,
  );
  assert.equal(
    document.querySelectorAll('[data-mwitools-task-mirror="true"]').length,
    10,
  );
  const denMirror = [
    ...document.querySelectorAll('[data-mwitools-task-mirror="true"]'),
  ].find(
    (taskCard) =>
      taskCard.textContent.includes("苍蝇") &&
      taskCard
        .closest(".mwi-task-combat-location")
        ?.dataset.location.includes("chimerical_den"),
  );
  assert.deepEqual(
    [...denMirror.querySelectorAll(":scope > .mwi-task-bg use")].map((use) =>
      use.getAttribute("href").split("#").at(-1),
    ),
    ["fly", "chimerical_den"],
  );
  assert.equal(
    denMirror.querySelectorAll(":scope > .mwi-task-bg--monster").length,
    1,
  );
  assert.equal(
    denMirror.querySelectorAll(":scope > .mwi-task-bg--dungeon").length,
    1,
  );
  assert.deepEqual(
    [
      ...new Set(
        [...document.querySelectorAll(".mwi-task-bg--dungeon use")].map((use) =>
          use.getAttribute("href").split("#").at(-1),
        ),
      ),
    ].sort(),
    ["chimerical_den", "enchanted_fortress", "pirate_cove", "sinister_circus"],
  );
  assert.ok(
    [...document.querySelectorAll(".mwi-task-bg--dungeon use")].every((use) =>
      use.getAttribute("href").split("#").at(-1),
    ),
    "dungeon artwork never uses an empty sprite fragment",
  );
  const nonDungeon = document.querySelector(
    '.mwi-task-combat-location[data-location="non-dungeon-monsters"]',
  );
  assert.equal(
    nonDungeon.querySelector(".mwi-task-combat-location-title-text")
      .textContent,
    "非地牢怪物 (1)",
  );
  assert.equal(nonDungeon.querySelectorAll(".mwi-task-bg--dungeon").length, 0);
  assert.doesNotMatch(
    document.querySelector(".TasksPanel_taskList__dungeons").textContent,
    /其他战斗|Other combat/,
  );
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
  const chimericalTitles = [
    ...document.querySelector(
      '.mwi-task-combat-location[data-location*="chimerical_den"] .mwi-task-dungeon-body',
    ).children,
  ].map(
    (taskCard) =>
      taskCard.querySelector('div[class*="RandomTask_name"]').textContent,
  );
  assert.deepEqual(chimericalTitles.slice(0, 2), [
    "击败 - 苍蝇",
    "击败 - 苍蝇",
  ]);
  assert.equal(
    document.querySelectorAll('[data-mwitools-dungeon-source="true"]').length,
    5,
  );
  assert.equal(
    dungeonLocationsForCard(
      document.querySelector(TASK_SELECTOR),
      runtime.state.characterQuests[0],
    ).length,
    3,
  );

  const sourceFly = [...document.querySelectorAll(TASK_SELECTOR)].find(
    (taskCard) => taskCard.textContent.includes("苍蝇"),
  );
  let forwarded = 0;
  [...sourceFly.querySelectorAll("button")]
    .at(-1)
    .addEventListener("click", () => {
      forwarded += 1;
    });
  const mirrorFly = [
    ...document.querySelectorAll('[data-mwitools-task-mirror="true"]'),
  ].find((taskCard) => taskCard.textContent.includes("苍蝇"));
  [...mirrorFly.querySelectorAll("button")].at(-1).click();
  assert.equal(forwarded, 1);

  controls.querySelector('[data-mode="planet"]').click();
  assert.equal(
    document.querySelectorAll('[data-mwitools-task-mirror="true"]').length,
    0,
  );
  assert.equal(
    document.querySelectorAll('[data-mwitools-dungeon-source="true"]').length,
    0,
  );
  runtime.settings.settingsMap.taskNewBadge.isTrue = true;
  runtime.settings.settingsMap.taskIcons.isTrue = false;
});

test("known dungeon roster recognizes Eye when live dungeon fight info is empty", () => {
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
        fightInfo: {
          randomSpawnInfo: {
            maxSpawnCount: 0,
            maxTotalStrength: 0,
            spawns: null,
          },
          bossSpawns: null,
          battlesPerBoss: 0,
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
  firstSlot.querySelector('div[class*="RandomTask_name"]').textContent =
    "击败 - 杰瑞";
  runtime.state.characterQuests[0] = {
    id: "reset-rat",
    actionHrid: "/actions/combat/rat",
  };
  runtime.api.renderTasks();
  assert.equal(firstSlot.style.order, originalOrder);
  assert.deepEqual(orderedTitles(list), [
    "击败 - 杰瑞",
    "击败 - 苍蝇",
    "击败 - 杰瑞",
  ]);

  list.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="TasksPanel_taskList__monster-order-reentered">
      ${card("击败 - 杰瑞", "0 / 10")}
      ${card("击败 - 杰瑞", "0 / 10")}
      ${card("击败 - 苍蝇", "0 / 10")}
    </div>`,
  );
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
