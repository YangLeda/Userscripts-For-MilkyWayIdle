import { runtime } from "../core/runtime.js";

const STYLE_ID = "mwitools-task-style";
const TASK_SELECTOR = 'div[class*="RandomTask_randomTask"]';
let originalCards = [];
let taskListParent = null;
const collapsedProfessions = new Set();

const PROFESSIONS = [
  ["milking", "挤奶", "Milking"],
  ["foraging", "采摘", "Foraging"],
  ["woodcutting", "伐木", "Woodcutting"],
  ["cheesesmithing", "奶酪锻造", "Cheesesmithing"],
  ["crafting", "制作", "Crafting"],
  ["tailoring", "缝纫", "Tailoring"],
  ["cooking", "烹饪", "Cooking"],
  ["brewing", "冲泡", "Brewing"],
  ["alchemy", "炼金", "Alchemy"],
  ["enhancing", "强化", "Enhancing"],
  ["combat", "战斗", "Combat"],
].map(([key, zh, en], order) => ({ key, zh, en, order }));
const COMPLETED_PROFESSION = {
  key: "completed",
  zh: "已完成",
  en: "Completed",
  order: -1,
};

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .mwi-task-profession-group { grid-column:1/-1; min-width:0; }
    .mwi-task-profession-header { display:flex; width:100%; min-height:36px; align-items:center; gap:8px; padding:7px 10px; border:1px solid rgba(255,255,255,.13); border-left:3px solid var(--color-primary,${runtime.config.SCRIPT_COLOR_MAIN}); border-radius:6px; background:rgba(0,0,0,.2); color:var(--color-text-primary,#eee); font:inherit; text-align:left; cursor:pointer; }
    .mwi-task-profession-header:hover { background:rgba(255,255,255,.055); }
    .mwi-task-profession-title { font-weight:650; }
    .mwi-task-profession-count { min-width:22px; padding:1px 6px; border-radius:999px; background:rgba(255,255,255,.09); color:var(--color-text-secondary,#bbb); font-size:.68rem; text-align:center; }
    .mwi-task-profession-chevron { margin-left:auto; color:var(--color-text-secondary,#aaa); transition:transform .15s ease; }
    .mwi-task-profession-header[aria-expanded="false"] .mwi-task-profession-chevron { transform:rotate(-90deg); }
    .mwi-task-profession-body { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr)); gap:10px; min-width:0; margin-top:8px; }
    .mwi-task-profession-body[hidden] { display:none; }
    .mwi-task-profession-body[data-combat="true"] { display:block; }
    .mwi-task-profession-body[data-combat="true"][hidden] { display:none; }
    .mwi-task-combat-location + .mwi-task-combat-location { margin-top:10px; }
    .mwi-task-combat-location-title { margin:0 0 6px; padding:4px 8px; border-left:2px solid rgba(255,255,255,.22); color:var(--color-text-secondary,#bbb); font-size:.7rem; font-weight:600; }
    .mwi-task-combat-location-body { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr)); gap:10px; min-width:0; }
    .mwi-task-bg { position:absolute; right:5px; bottom:4px; width:58px; height:58px; opacity:.075; pointer-events:none; }
    .mwi-task-merged-note { margin-top:7px; padding:7px 9px; border-radius:5px; background:rgba(70,170,100,.12); color:#9bd7aa; font-size:.72rem; }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function nestedValue(value, keys) {
  const pending = [value];
  const visited = new Set();
  while (pending.length) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || visited.has(current))
      continue;
    visited.add(current);
    for (const key of keys) {
      if (current[key] !== undefined && current[key] !== null)
        return current[key];
    }
    pending.push(
      ...Object.values(current).filter(
        (child) => child && typeof child === "object",
      ),
    );
  }
  return null;
}

function taskActionHrid(task) {
  const direct = nestedValue(task, [
    "actionHrid",
    "taskActionHrid",
    "skillActionHrid",
  ]);
  if (direct) return direct;
  const monsterHrid = nestedValue(task, ["monsterHrid"]);
  if (!monsterHrid) return null;
  for (const detail of Object.values(
    runtime.state.initData_actionDetailMap ?? {},
  )) {
    if (!String(detail?.hrid).startsWith("/actions/combat/")) continue;
    const fightInfo = JSON.stringify(detail.combatZoneInfo?.fightInfo ?? {});
    if (fightInfo.includes(`"${monsterHrid}"`)) return detail.hrid;
  }
  return null;
}

function taskRemaining(task) {
  const target = Number(
    nestedValue(task, ["targetCount", "requiredCount", "goalCount", "count"]),
  );
  const current = Number(
    nestedValue(task, ["currentCount", "completedCount", "progressCount"]),
  );
  return Number.isFinite(target)
    ? Math.max(0, target - (Number.isFinite(current) ? current : 0))
    : 0;
}

function rewardValue(task) {
  let rewards = nestedValue(task, ["rewardItems", "rewards", "items"]);
  if (!Array.isArray(rewards) && task?.itemRewardsJSON) {
    try {
      rewards = JSON.parse(task.itemRewardsJSON);
    } catch {
      rewards = [];
    }
  }
  if (!Array.isArray(rewards)) return 0;
  return rewards.reduce((sum, reward) => {
    const itemHrid = reward.itemHrid ?? reward.hrid;
    const price = runtime.api.getNetSellPrice?.(
      itemHrid,
      reward.enhancementLevel ?? 0,
    );
    return sum + (Number(price) || 0) * (Number(reward.count) || 0);
  }, 0);
}

function taskProjection(task) {
  const actionHrid = taskActionHrid(task);
  if (!actionHrid) return null;
  const remaining = taskRemaining(task);
  const projection = runtime.api.projectAction(actionHrid, remaining);
  const reward = rewardValue(task);
  return {
    ...projection,
    rewardValue: reward,
    taskProfit:
      projection.totalProfit === null ? null : projection.totalProfit + reward,
    taskProfitPerHour:
      projection.totalProfit === null ||
      !Number.isFinite(projection.totalSeconds) ||
      projection.totalSeconds <= 0
        ? null
        : ((projection.totalProfit + reward) / projection.totalSeconds) * 3600,
  };
}

function decorateCard(card, task) {
  card.querySelector(".mwi-task-insight")?.remove();

  if (
    runtime.settings.get("taskIcons") &&
    !card.querySelector(".mwi-task-bg")
  ) {
    const source = card.querySelector("svg");
    if (source) {
      const icon = source.cloneNode(true);
      icon.classList.add("mwi-task-bg");
      card.style.position = "relative";
      card.appendChild(icon);
    }
  }
}

function visibleTaskTitle(card) {
  const name = card.querySelector('div[class*="RandomTask_name"]');
  const text = String(
    runtime.api.getOriTextFromElement?.(name ?? card) ??
      name?.textContent ??
      card.textContent ??
      "",
  );
  return text.trim().split("\n")[0].trim();
}

function professionForCard(card, task) {
  const title = visibleTaskTitle(card);
  for (const profession of PROFESSIONS) {
    const labels = [profession.zh, profession.en];
    if (
      labels.some(
        (label) =>
          title === label ||
          title.startsWith(`${label} -`) ||
          title.startsWith(`${label} –`),
      )
    ) {
      return profession;
    }
  }
  if (/^(击败|Defeat|Kill)(?:\s|[-–]|$)/i.test(title)) {
    return PROFESSIONS.find(({ key }) => key === "combat");
  }
  const actionHrid = taskActionHrid(task);
  const actionType = runtime.state.initData_actionDetailMap?.[actionHrid]?.type;
  const key = String(actionType ?? "")
    .split("/")
    .pop();
  const known = PROFESSIONS.find((profession) => profession.key === key);
  if (known) return known;
  const prefix = title.split(/\s[-–]\s/)[0]?.trim() || t("任务", "Tasks");
  return {
    key: `custom-${prefix.toLowerCase().replaceAll(/[^\p{L}\p{N}]+/gu, "-")}`,
    zh: prefix,
    en: prefix,
    order: PROFESSIONS.length - 0.5,
  };
}

function isCompletedCard(card, task) {
  if (
    [...card.querySelectorAll("button")].some((button) =>
      /claim|领取/i.test(button.textContent),
    )
  ) {
    return true;
  }
  const text = String(
    runtime.api.getOriTextFromElement?.(card) ?? card.textContent ?? "",
  );
  const progress = text.match(
    /(?:进度|progress)\s*[:：]\s*([\d,.]+)\s*\/\s*([\d,.]+)/i,
  );
  if (progress) {
    const current = Number(progress[1].replaceAll(",", ""));
    const target = Number(progress[2].replaceAll(",", ""));
    if (
      Number.isFinite(current) &&
      Number.isFinite(target) &&
      target > 0 &&
      current >= target
    ) {
      return true;
    }
  }
  return false;
}

function combatDetailForCard(card, task) {
  const taskDetail =
    runtime.state.initData_actionDetailMap?.[taskActionHrid(task)];
  const monsterName = visibleTaskTitle(card)
    .replace(/^(击败|Defeat|Kill)\s*[-–]\s*/i, "")
    .replace(/\s+(?:图|Z)\s*\d+\s*$/i, "")
    .trim();
  const translatedHrid = runtime.config.isZHInGameSetting
    ? (runtime.api.getOthersFromZhName?.(monsterName) ??
      runtime.api.getActionEnNameFromZhName?.(monsterName))
    : null;
  const monsterHrid = String(translatedHrid ?? "").replace(
    "/actions/combat/",
    "/monsters/",
  );
  for (const detail of Object.values(
    runtime.state.initData_actionDetailMap ?? {},
  )) {
    if (!String(detail?.hrid).startsWith("/actions/combat/")) continue;
    const localizedName = runtime.data.ZHActionNames?.[detail.hrid];
    if (
      detail.name?.toLowerCase() === monsterName.toLowerCase() ||
      localizedName === monsterName ||
      detail.hrid ===
        String(translatedHrid).replace("/monsters/", "/actions/combat/")
    ) {
      return detail;
    }
    if (
      monsterHrid &&
      JSON.stringify(detail.combatZoneInfo?.fightInfo ?? {}).includes(
        `"${monsterHrid}"`,
      )
    ) {
      return detail;
    }
  }
  return String(taskDetail?.hrid ?? taskActionHrid(task)).startsWith(
    "/actions/combat/",
  )
    ? taskDetail
    : null;
}

function combatLocationForCard(card, task) {
  const detail = combatDetailForCard(card, task);
  const categories = runtime.state.initData_actionCategoryDetailMap ?? {};
  if (detail?.combatZoneInfo?.isDungeon) {
    const name =
      (runtime.config.isZH
        ? runtime.data.ZHActionNames?.[detail.hrid]
        : detail.name) ?? detail.name;
    return {
      key: `dungeon-${detail.hrid}`,
      label: `${t("地牢", "Dungeon")} · ${name}`,
      order: 10_000 + Number(detail.sortIndex ?? 0),
    };
  }
  if (detail?.category) {
    const category = categories[detail.category];
    const zoneAction = Object.values(
      runtime.state.initData_actionDetailMap ?? {},
    ).find(
      (candidate) =>
        candidate?.category === detail.category &&
        candidate?.combatZoneInfo?.fightInfo?.battlesPerBoss === 10,
    );
    const name =
      (runtime.config.isZH
        ? runtime.data.ZHActionNames?.[zoneAction?.hrid]
        : zoneAction?.name) ?? category?.name;
    const sortIndex = Number(category?.sortIndex ?? 9999);
    return {
      key: `zone-${detail.category}`,
      label: `${t("地图", "Zone")} ${sortIndex}${name ? ` · ${name}` : ""}`,
      order: sortIndex,
    };
  }
  const mapIndex = visibleTaskTitle(card).match(/(?:图|Z)\s*(\d+)\s*$/i)?.[1];
  if (mapIndex) {
    return {
      key: `zone-index-${mapIndex}`,
      label: `${t("地图", "Zone")} ${mapIndex}`,
      order: Number(mapIndex),
    };
  }
  return {
    key: "combat-unresolved",
    label: t("其他战斗", "Other combat"),
    order: 99_999,
  };
}

function actionSortInfo(task, originalIndex) {
  const actionHrid = taskActionHrid(task);
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  if (!detail) return { originalIndex, unknown: true };
  const category =
    runtime.state.initData_actionCategoryDetailMap?.[detail.category];
  return {
    originalIndex,
    unknown: false,
    category: Number(category?.sortIndex ?? 9999),
    level: Number(detail.levelRequirement?.level ?? 0),
    action: Number(detail.sortIndex ?? detail.actionSortIndex ?? 0),
    name: String(detail.name ?? actionHrid),
    actionHrid,
  };
}

function productionDepth(tasks) {
  const producers = new Map();
  const parent = new Map();
  const firstSeen = new Map();
  const itemOwner = new Map();
  const find = (actionHrid) => {
    const current = parent.get(actionHrid) ?? actionHrid;
    if (current === actionHrid) return current;
    const root = find(current);
    parent.set(actionHrid, root);
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };
  for (const [index, task] of tasks.entries()) {
    const actionHrid = taskActionHrid(task);
    const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
    if (!actionHrid || !detail) continue;
    parent.set(actionHrid, actionHrid);
    firstSeen.set(actionHrid, index);
    const outputs = runtime.api.getExpectedOutputs(detail);
    const inputs = runtime.api.getDirectInputs(detail);
    for (const output of outputs) {
      producers.set(output.itemHrid, actionHrid);
    }
    for (const item of [...inputs, ...outputs]) {
      const owner = itemOwner.get(item.itemHrid);
      if (owner) union(actionHrid, owner);
      else itemOwner.set(item.itemHrid, actionHrid);
    }
  }
  const cache = new Map();
  const visiting = new Set();
  let cycle = false;
  const depth = (actionHrid) => {
    if (cache.has(actionHrid)) return cache.get(actionHrid);
    if (visiting.has(actionHrid)) {
      cycle = true;
      return 0;
    }
    visiting.add(actionHrid);
    const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
    let value = 0;
    for (const input of runtime.api.getDirectInputs(detail)) {
      const producer = producers.get(input.itemHrid);
      if (producer && producer !== actionHrid)
        value = Math.max(value, depth(producer) + 1);
    }
    visiting.delete(actionHrid);
    cache.set(actionHrid, value);
    return value;
  };
  for (const task of tasks) depth(taskActionHrid(task));
  if (cycle) return null;
  const groupMinimum = new Map();
  for (const [actionHrid, index] of firstSeen) {
    const root = find(actionHrid);
    groupMinimum.set(root, Math.min(groupMinimum.get(root) ?? index, index));
  }
  const groups = new Map(
    [...firstSeen.keys()].map((actionHrid) => [
      actionHrid,
      groupMinimum.get(find(actionHrid)) ?? firstSeen.get(actionHrid),
    ]),
  );
  return { depths: cache, groups };
}

function ungroupCards() {
  if (!taskListParent) return;
  const cards = [...document.querySelectorAll(TASK_SELECTOR)].sort(
    (left, right) =>
      Number(left.dataset.mwitoolsOriginalIndex ?? 0) -
      Number(right.dataset.mwitoolsOriginalIndex ?? 0),
  );
  for (const card of cards) taskListParent.appendChild(card);
  taskListParent
    .querySelectorAll(":scope > .mwi-task-profession-group")
    .forEach((group) => group.remove());
}

function orderedRows(cards, tasks) {
  const chains = productionDepth(tasks);
  const rows = cards.map((card, index) => ({
    card,
    task: tasks[index],
    profession: isCompletedCard(card, tasks[index])
      ? COMPLETED_PROFESSION
      : professionForCard(card, tasks[index]),
    info: actionSortInfo(
      tasks[index],
      Number(card.dataset.mwitoolsOriginalIndex ?? index),
    ),
    depth: chains?.depths.get(taskActionHrid(tasks[index])) ?? 0,
    chain: chains?.groups.get(taskActionHrid(tasks[index])) ?? index,
  }));
  rows.sort((left, right) => {
    const professionOrder = left.profession.order - right.profession.order;
    if (professionOrder) return professionOrder;
    if (!runtime.settings.get("taskAutoSort") || !chains) {
      return left.info.originalIndex - right.info.originalIndex;
    }
    if (left.info.unknown && right.info.unknown)
      return left.info.originalIndex - right.info.originalIndex;
    if (left.info.unknown) return 1;
    if (right.info.unknown) return -1;
    return (
      left.info.category - right.info.category ||
      left.chain - right.chain ||
      left.depth - right.depth ||
      left.info.level - right.info.level ||
      left.info.action - right.info.action ||
      left.info.name.localeCompare(right.info.name) ||
      left.info.originalIndex - right.info.originalIndex
    );
  });
  return rows;
}

function updateGroupCollapsedState(group, profession) {
  const collapsed = collapsedProfessions.has(profession.key);
  const header = group.querySelector(".mwi-task-profession-header");
  const body = group.querySelector(".mwi-task-profession-body");
  header.setAttribute("aria-expanded", String(!collapsed));
  body.hidden = collapsed;
}

function ensureProfessionGroup(parent, profession) {
  let group = parent.querySelector(
    `:scope > .mwi-task-profession-group[data-profession="${profession.key}"]`,
  );
  if (group) return group;
  group = document.createElement("section");
  group.className = "mwi-task-profession-group";
  group.dataset.profession = profession.key;
  const header = document.createElement("button");
  header.type = "button";
  header.className = "mwi-task-profession-header";
  const title = document.createElement("span");
  title.className = "mwi-task-profession-title";
  const count = document.createElement("span");
  count.className = "mwi-task-profession-count";
  const chevron = document.createElement("span");
  chevron.className = "mwi-task-profession-chevron";
  chevron.textContent = "▾";
  header.append(title, count, chevron);
  const body = document.createElement("div");
  body.className = "mwi-task-profession-body";
  header.addEventListener("click", () => {
    if (collapsedProfessions.has(profession.key)) {
      collapsedProfessions.delete(profession.key);
    } else {
      collapsedProfessions.add(profession.key);
    }
    updateGroupCollapsedState(group, profession);
  });
  group.append(header, body);
  return group;
}

function renderCombatGroups(body, rows) {
  body.dataset.combat = "true";
  const locations = new Map();
  for (const row of rows) {
    const location = combatLocationForCard(row.card, row.task);
    if (!locations.has(location.key))
      locations.set(location.key, { location, rows: [] });
    locations.get(location.key).rows.push(row);
  }
  const orderedLocations = [...locations.values()].sort(
    (left, right) =>
      left.location.order - right.location.order ||
      left.location.label.localeCompare(right.location.label),
  );
  const desiredSections = [];
  for (const { location, rows: locationRows } of orderedLocations) {
    let section = body.querySelector(
      `:scope > .mwi-task-combat-location[data-location="${location.key}"]`,
    );
    if (!section) {
      section = document.createElement("section");
      section.className = "mwi-task-combat-location";
      section.dataset.location = location.key;
      const title = document.createElement("h4");
      title.className = "mwi-task-combat-location-title";
      const cards = document.createElement("div");
      cards.className = "mwi-task-combat-location-body";
      section.append(title, cards);
    }
    section.querySelector(".mwi-task-combat-location-title").textContent =
      `${location.label} (${locationRows.length})`;
    const cards = section.querySelector(".mwi-task-combat-location-body");
    const desiredCards = locationRows.map((row) => row.card);
    const currentCards = [...cards.children];
    if (
      currentCards.length !== desiredCards.length ||
      currentCards.some((card, index) => card !== desiredCards[index])
    ) {
      cards.replaceChildren(...desiredCards);
    }
    desiredSections.push(section);
  }
  const currentSections = [...body.children];
  if (
    currentSections.length !== desiredSections.length ||
    currentSections.some((section, index) => section !== desiredSections[index])
  ) {
    body.replaceChildren(...desiredSections);
  }
}

function renderRegularGroup(body, rows) {
  delete body.dataset.combat;
  const desiredCards = rows.map((row) => row.card);
  const currentCards = [...body.children];
  if (
    currentCards.length !== desiredCards.length ||
    currentCards.some((card, index) => card !== desiredCards[index])
  ) {
    body.replaceChildren(...desiredCards);
  }
}

function groupCards(cards, tasks) {
  if (!taskListParent) return;
  document
    .querySelectorAll(".mwi-task-toolbar")
    .forEach((node) => node.remove());
  const rows = orderedRows(cards, tasks);
  const customDefinitions = rows
    .map((row) => row.profession)
    .filter(
      (profession, index, all) =>
        ![COMPLETED_PROFESSION, ...PROFESSIONS].some(
          (known) => known.key === profession.key,
        ) &&
        all.findIndex((candidate) => candidate.key === profession.key) ===
          index,
    );
  const definitions = [
    COMPLETED_PROFESSION,
    ...PROFESSIONS,
    ...customDefinitions,
  ];
  const activeKeys = new Set([COMPLETED_PROFESSION.key]);
  for (const profession of definitions) {
    const matching = rows.filter(
      (row) => row.profession.key === profession.key,
    );
    if (!matching.length && profession.key !== COMPLETED_PROFESSION.key)
      continue;
    activeKeys.add(profession.key);
    const group = ensureProfessionGroup(taskListParent, profession);
    group.querySelector(".mwi-task-profession-title").textContent = runtime
      .config.isZH
      ? profession.zh
      : profession.en;
    group.querySelector(".mwi-task-profession-count").textContent = String(
      matching.length,
    );
    const body = group.querySelector(".mwi-task-profession-body");
    if (profession.key === "combat") renderCombatGroups(body, matching);
    else renderRegularGroup(body, matching);
    updateGroupCollapsedState(group, profession);
    taskListParent.appendChild(group);
  }
  taskListParent
    .querySelectorAll(":scope > .mwi-task-profession-group")
    .forEach((group) => {
      if (!activeKeys.has(group.dataset.profession)) group.remove();
    });
}

function wireMergeButtons(cards, tasks) {
  cards.forEach((card, index) => {
    if (card.dataset.mwitoolsMergeWired) return;
    const button = [...card.querySelectorAll("button")].find((candidate) =>
      /go|前往|开始/i.test(candidate.textContent),
    );
    if (!button) return;
    card.dataset.mwitoolsMergeWired = "true";
    button.addEventListener("click", () => {
      if (!runtime.settings.get("taskMergeActions")) return;
      const actionHrid = taskActionHrid(tasks[index]);
      const matching = tasks.filter(
        (task) => taskActionHrid(task) === actionHrid,
      );
      runtime.state.pendingMergedTask = {
        actionHrid,
        count: matching.reduce((sum, task) => sum + taskRemaining(task), 0),
        taskCount: matching.length,
      };
    });
  });
}

function applyPendingMerge() {
  const pending = runtime.state.pendingMergedTask;
  if (!pending) return;
  const input = document.querySelector(
    'div[class*="SkillActionDetail_maxActionCountInput"] input',
  );
  if (!input) return;
  const panel =
    input.closest('div[class*="SkillActionDetail_regularComponent"]') ??
    input
      .closest('div[class*="Modal_modalContainer"]')
      ?.querySelector('div[class*="SkillActionDetail_regularComponent"]') ??
    input.parentElement;
  const name = runtime.api.getOriTextFromElement?.(
    panel.querySelector('div[class*="SkillActionDetail_name"]'),
  );
  let actionHrid = runtime.api.getActionHridFromItemName?.(name);
  if (runtime.config.isZHInGameSetting && !actionHrid) {
    actionHrid = runtime.api.getActionHridFromItemName?.(
      runtime.api.getActionEnNameFromZhName?.(name),
    );
  }
  if (actionHrid !== pending.actionHrid) return;
  runtime.api.reactInputTriggerHack?.(input, pending.count);
  let note = panel.querySelector(".mwi-task-merged-note");
  if (!note) {
    note = document.createElement("div");
    note.className = "mwi-task-merged-note";
    input.parentElement.insertAdjacentElement("afterend", note);
  }
  note.textContent = t(
    `已合并 ${pending.taskCount} 个同动作任务，共 ${runtime.api.formatExactNumber(pending.count)} 次。`,
    `Merged ${pending.taskCount} matching tasks for ${runtime.api.formatExactNumber(pending.count)} actions.`,
  );
  runtime.state.pendingMergedTask = null;
}

function renderTasks() {
  let cards = [...document.querySelectorAll(TASK_SELECTOR)];
  if (!cards.length) return;
  if (
    !originalCards.length ||
    originalCards.some((card) => !card.isConnected)
  ) {
    ungroupCards();
    cards = [...document.querySelectorAll(TASK_SELECTOR)];
    taskListParent =
      cards[0]?.closest(".mwi-task-profession-group")?.parentElement ??
      cards[0]?.parentElement ??
      taskListParent;
    originalCards = [...cards];
    originalCards.forEach((card, index) => {
      card.dataset.mwitoolsOriginalIndex = String(index);
    });
  } else if (!taskListParent) {
    taskListParent =
      cards[0]?.closest(".mwi-task-profession-group")?.parentElement ??
      cards[0]?.parentElement;
  }
  const tasks = runtime.state.characterQuests ?? [];
  const cardTasks = cards.map(
    (card, index) =>
      tasks[Number(card.dataset.mwitoolsOriginalIndex ?? index)] ?? {},
  );
  cards.forEach((card, index) => decorateCard(card, cardTasks[index]));
  wireMergeButtons(cards, cardTasks);
  groupCards(cards, cardTasks);
  applyPendingMerge();
}

function cleanupTasks() {
  ungroupCards();
  document
    .querySelectorAll(
      ".mwi-task-insight,.mwi-task-toolbar,.mwi-task-profession-group,.mwi-task-bg,.mwi-task-merged-note",
    )
    .forEach((node) => node.remove());
  document
    .querySelectorAll("[data-mwitools-merge-wired]")
    .forEach((node) => delete node.dataset.mwitoolsMergeWired);
  document.getElementById(STYLE_ID)?.remove();
  originalCards = [];
  taskListParent = null;
  collapsedProfessions.clear();
}

runtime.features.register({
  id: "taskInsights",
  setting: "taskInsights",
  scope: "character",
  initialize({ scope }) {
    addStyles();
    renderTasks();
    scope.interval(renderTasks, 500);
    scope.add(cleanupTasks);
  },
});

for (const id of [
  "taskMaterials",
  "taskQueueProgress",
  "taskAutoSort",
  "taskIcons",
  "taskStatistics",
  "taskClaimCollector",
  "taskMergeActions",
]) {
  runtime.features.register({
    id,
    setting: id,
    scope: "character",
    dependsOn: ["taskInsights"],
    initialize() {
      renderTasks();
      return renderTasks;
    },
  });
}

Object.assign(runtime.api, {
  taskActionHrid,
  taskRemaining,
  taskProjection,
  renderTasks,
  restoreTaskOrder: renderTasks,
});
