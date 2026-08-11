import { runtime } from "../core/runtime.js";

const STYLE_ID = "mwitools-task-style";
const TASK_SELECTOR =
  'div[class*="RandomTask_randomTask"]:not([data-mwitools-task-mirror="true"])';
let originalCards = [];
let taskListParent = null;
let pageClassifications = new Map();
let pageTaskIds = new Map();
let pageNewTaskIds = new Set();
let pendingResetSlots = new Set();
let lastRenderedCards = [];
let lastTaskRenderSignature = "";
let lastActionDetails = null;
let lastActionCategories = null;
let combatGroupMode = "planet";
let taskSpriteManifestPromise = null;
const taskSpriteBases = new Map();
const collapsedProfessions = new Set();
const collapsedDungeonGroups = new Set();

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
const NEW_PROFESSION = {
  key: "new",
  zh: "新任务",
  en: "New Tasks",
  order: -2,
};

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function taskId(task) {
  return String(
    task?.id ??
      task?.characterQuestID ??
      task?.characterQuestId ??
      task?.questID ??
      task?.questId ??
      task?.characterTaskID ??
      task?.characterTaskId ??
      "",
  );
}

function combatModeStorageKey() {
  const server = globalThis.location?.hostname ?? "unknown";
  return `MWITools_task_combat_mode_v1:${server}:${String(runtime.state.currentCharacterId ?? "")}`;
}

function readCombatGroupMode() {
  try {
    return localStorage.getItem(combatModeStorageKey()) === "dungeon"
      ? "dungeon"
      : "planet";
  } catch {
    return "planet";
  }
}

function writeCombatGroupMode(mode) {
  try {
    localStorage.setItem(combatModeStorageKey(), mode);
  } catch {
    // Ignore storage failures; the mode still works for this page visit.
  }
}

function rememberSpriteBase(kind, value) {
  const base = String(value ?? "").split("#")[0];
  if (base.includes(`${kind}_sprite`) && base.endsWith(".svg")) {
    taskSpriteBases.set(kind, base);
  }
}

function scanTaskSpriteBases() {
  try {
    document
      .querySelectorAll("svg use")
      .forEach((use) =>
        ["items", "actions", "combat_monsters"].forEach((kind) =>
          rememberSpriteBase(
            kind,
            use.getAttribute("href") ?? use.getAttribute("xlink:href"),
          ),
        ),
      );
    globalThis.performance
      ?.getEntriesByType?.("resource")
      ?.forEach((entry) =>
        ["items", "actions", "combat_monsters"].forEach((kind) =>
          rememberSpriteBase(kind, entry.name),
        ),
      );
  } catch {
    // Resource timing may be unavailable in tests or hardened browsers.
  }
}

async function loadTaskSpriteManifest() {
  if (taskSpriteManifestPromise) return taskSpriteManifestPromise;
  taskSpriteManifestPromise = (async () => {
    scanTaskSpriteBases();
    try {
      const response = await globalThis.fetch(
        new URL("/asset-manifest.json", globalThis.location?.origin).href,
      );
      if (!response.ok) return;
      const manifest = await response.json();
      for (const value of Object.values(manifest?.files ?? {})) {
        for (const kind of ["items", "actions", "combat_monsters"]) {
          rememberSpriteBase(kind, value);
        }
      }
    } catch {
      // DOM and performance-resource discovery remain available as fallbacks.
    }
  })();
  return taskSpriteManifestPromise;
}

function taskSpriteHref(kind, hrid) {
  scanTaskSpriteBases();
  const base = taskSpriteBases.get(kind);
  return base
    ? `${base}#${String(hrid ?? "")
        .split("/")
        .at(-1)}`
    : "";
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
    .mwi-task-profession-body { display:none; }
    .mwi-task-combat-location { grid-column:1/-1; min-width:0; }
    .mwi-task-combat-location-title { margin:0 0 6px; padding:4px 8px; border-left:2px solid rgba(255,255,255,.22); color:var(--color-text-secondary,#bbb); font-size:.7rem; font-weight:600; }
    .mwi-task-combat-location-body { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr)); gap:10px; min-width:0; }
    .mwi-task-dungeon-header { display:flex; width:100%; align-items:center; gap:8px; margin:0 0 6px; padding:5px 8px; border:1px solid rgba(255,255,255,.11); border-left:2px solid rgba(183,126,255,.72); border-radius:5px; background:rgba(70,42,100,.18); color:var(--color-text-secondary,#bbb); font:inherit; font-size:.7rem; font-weight:650; text-align:left; cursor:pointer; }
    .mwi-task-dungeon-header span:last-child { margin-left:auto; transition:transform .15s ease; }
    .mwi-task-dungeon-header[aria-expanded="false"] span:last-child { transform:rotate(-90deg); }
    .mwi-task-dungeon-body { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr)); gap:10px; min-width:0; }
    .mwi-task-combat-mode { display:flex; width:max-content; gap:2px; margin:4px 0 8px; padding:2px; border:1px solid rgba(255,255,255,.12); border-radius:6px; background:rgba(0,0,0,.18); }
    .mwi-task-combat-mode button { padding:3px 10px; border:0; border-radius:4px; background:transparent; color:var(--color-text-secondary,#bbb); font:inherit; font-size:.7rem; cursor:pointer; }
    .mwi-task-combat-mode button[aria-pressed="true"] { background:${runtime.config.SCRIPT_COLOR_MAIN}; color:#18130a; font-weight:700; }
    ${TASK_SELECTOR}[data-mwitools-collapsed="true"] { display:none !important; }
    ${TASK_SELECTOR}[data-mwitools-dungeon-source="true"] { display:none !important; }
    .mwi-task-bg { position:absolute; z-index:0; top:0; left:50%; width:30%; height:100%; opacity:.3; pointer-events:none; }
    .mwi-task-bg svg { width:100%; height:100%; }
    ${TASK_SELECTOR} > :not(.mwi-task-bg),[data-mwitools-task-mirror="true"] > :not(.mwi-task-bg) { position:relative; z-index:1; }
    [data-mwitools-task-mirror="true"] { position:relative; }
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

function targetNameFromCard(card) {
  return visibleTaskTitle(card)
    .split(/\s[-–]\s/)
    .slice(1)
    .join(" - ")
    .trim();
}

function itemHridFromDisplayName(name) {
  if (!name) return "";
  const normalized = name.replace(/\s+\+\d+\s*$/, "").trim();
  const englishName = runtime.config.isZHInGameSetting
    ? (runtime.api.getItemEnNameFromZhName?.(normalized) ?? normalized)
    : normalized;
  if (runtime.state.itemEnNameToHridMap?.[englishName]) {
    return runtime.state.itemEnNameToHridMap[englishName];
  }
  return (
    Object.entries(runtime.data.ZHItemNames ?? {}).find(
      ([, localizedName]) => localizedName === normalized,
    )?.[0] ?? ""
  );
}

function monsterHridForCard(card, task) {
  const direct = nestedValue(task, ["monsterHrid", "targetMonsterHrid"]);
  if (direct) return String(direct);
  const actionHrid = String(taskActionHrid(task) ?? "");
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  if (
    actionHrid.startsWith("/actions/combat/") &&
    !detail?.combatZoneInfo?.isDungeon &&
    detail?.combatZoneInfo?.fightInfo?.battlesPerBoss !== 10
  ) {
    return actionHrid.replace("/actions/combat/", "/monsters/");
  }
  const monsterName = targetNameFromCard(card)
    .replace(/\s+(?:图|Z)\s*\d+\s*$/i, "")
    .trim();
  const translated = runtime.api.getOthersFromZhName?.(monsterName);
  if (String(translated).startsWith("/monsters/")) return translated;
  if (String(translated).startsWith("/actions/combat/")) {
    return String(translated).replace("/actions/combat/", "/monsters/");
  }
  const matchingAction = Object.values(
    runtime.state.initData_actionDetailMap ?? {},
  ).find(
    (candidate) =>
      String(candidate?.hrid).startsWith("/actions/combat/") &&
      !candidate?.combatZoneInfo?.isDungeon &&
      (candidate?.name === monsterName ||
        runtime.data.ZHActionNames?.[candidate.hrid] === monsterName),
  );
  return matchingAction?.hrid?.replace("/actions/combat/", "/monsters/");
}

export function taskArtworkForCard(card, task) {
  const profession = professionForCard(card, task);
  if (profession.key === "combat") {
    const monsterHrid = monsterHridForCard(card, task);
    if (monsterHrid) return { kind: "combat_monsters", hrid: monsterHrid };
  }

  const namedItemHrid = itemHridFromDisplayName(targetNameFromCard(card));
  if (namedItemHrid) return { kind: "items", hrid: namedItemHrid };

  const actionHrid = taskActionHrid(task);
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  const outputs = [
    ...(detail?.outputItems ?? []),
    ...(detail?.dropTable ?? []),
  ];
  const outputItemHrid =
    detail?.upgradeItemHrid ??
    (outputs.length === 1
      ? (outputs[0]?.itemHrid ?? outputs[0]?.hrid)
      : outputs.find((output) => Number(output?.dropRate ?? 1) >= 1)?.itemHrid);
  if (outputItemHrid) return { kind: "items", hrid: outputItemHrid };
  return actionHrid ? { kind: "actions", hrid: actionHrid } : null;
}

function decorateCard(card, task) {
  card.querySelector(".mwi-task-insight")?.remove();
  if (!runtime.settings.get("taskIcons")) {
    card.querySelector(":scope > .mwi-task-bg")?.remove();
    return;
  }
  const artwork = taskArtworkForCard(card, task);
  const href = artwork ? taskSpriteHref(artwork.kind, artwork.hrid) : "";
  const existing = card.querySelector(":scope > .mwi-task-bg");
  if (!href) {
    existing?.remove();
    return;
  }
  if (existing?.dataset.spriteHref === href) return;
  existing?.remove();
  const background = document.createElement("div");
  background.className = "mwi-task-bg";
  background.dataset.spriteHref = href;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", href);
  svg.appendChild(use);
  background.appendChild(svg);
  card.style.position = "relative";
  card.appendChild(background);
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

function dungeonLocation(detail) {
  const name =
    (runtime.config.isZH
      ? runtime.data.ZHActionNames?.[detail?.hrid]
      : detail?.name) ?? detail?.name;
  return {
    key: `dungeon-${detail?.hrid}`,
    label: name || t("未知地牢", "Unknown dungeon"),
    order: Number(detail?.sortIndex ?? 9999),
  };
}

export function dungeonLocationsForCard(card, task) {
  const actionHrid = taskActionHrid(task);
  const taskDetail = runtime.state.initData_actionDetailMap?.[actionHrid];
  if (taskDetail?.combatZoneInfo?.isDungeon) {
    return [dungeonLocation(taskDetail)];
  }
  const monsterHrid = monsterHridForCard(card, task);
  if (!monsterHrid) {
    return [
      {
        key: "dungeon-unresolved",
        label: t("其他战斗", "Other combat"),
        order: 99_999,
      },
    ];
  }
  const matches = Object.values(runtime.state.initData_actionDetailMap ?? {})
    .filter(
      (detail) =>
        detail?.combatZoneInfo?.isDungeon &&
        JSON.stringify(detail.combatZoneInfo?.fightInfo ?? {}).includes(
          `"${monsterHrid}"`,
        ),
    )
    .map(dungeonLocation)
    .sort(
      (left, right) =>
        left.order - right.order || left.label.localeCompare(right.label),
    );
  return matches.length
    ? matches
    : [
        {
          key: "dungeon-unresolved",
          label: t("其他战斗", "Other combat"),
          order: 99_999,
        },
      ];
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
  const actionDetails = Object.values(
    runtime.state.initData_actionDetailMap ?? {},
  ).filter((detail) => detail?.hrid);
  const procurement = runtime.api.procurement;
  const parent = new Map();
  const firstSeen = new Map();
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
  for (const detail of actionDetails) {
    parent.set(detail.hrid, detail.hrid);
  }
  for (const detail of actionDetails) {
    const producer = detail.upgradeItemHrid
      ? procurement?.getProducerAction?.(detail.upgradeItemHrid)
      : null;
    if (producer?.actionHrid && producer.actionHrid !== detail.hrid)
      union(detail.hrid, producer.actionHrid);
  }
  for (const [index, task] of tasks.entries()) {
    const actionHrid = taskActionHrid(task);
    if (parent.has(actionHrid) && !firstSeen.has(actionHrid))
      firstSeen.set(actionHrid, index);
  }
  const cache = new Map();
  const visiting = new Set();
  const depth = (actionHrid) => {
    if (cache.has(actionHrid)) return cache.get(actionHrid);
    if (visiting.has(actionHrid)) return 0;
    visiting.add(actionHrid);
    const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
    let value = 0;
    const producer = detail?.upgradeItemHrid
      ? procurement?.getProducerAction?.(detail.upgradeItemHrid)
      : null;
    if (producer?.actionHrid && producer.actionHrid !== actionHrid)
      value = depth(producer.actionHrid) + 1;
    visiting.delete(actionHrid);
    cache.set(actionHrid, value);
    return value;
  };
  for (const task of tasks) depth(taskActionHrid(task));
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

function syncPageNewTasks(cards, tasks, enteredNewTaskPage) {
  if (!runtime.settings.settingsMap.taskNewBadge.isTrue) {
    pageNewTaskIds.clear();
    runtime.state.mwitoolsPageNewTaskIds = new Set();
    return;
  }
  const freshIds = new Set(runtime.api.getNewTaskIds?.() ?? []);
  const activeIds = new Set();
  cards.forEach((card, index) => {
    const id = taskId(tasks[index]);
    if (!id) return;
    activeIds.add(id);
    const previousId = pageTaskIds.get(index);
    const changed = previousId && previousId !== id;
    if (enteredNewTaskPage || !previousId) {
      if (freshIds.has(id)) pageNewTaskIds.add(id);
    } else if (changed) {
      if (
        pendingResetSlots.has(index) &&
        pageClassifications.get(index)?.profession?.key === NEW_PROFESSION.key
      ) {
        pageNewTaskIds.add(id);
      } else if (freshIds.has(id)) {
        pageNewTaskIds.add(id);
      }
      pendingResetSlots.delete(index);
    } else if (freshIds.has(id)) {
      pageNewTaskIds.add(id);
    }
    pageTaskIds.set(index, id);
    card.dataset.mwitoolsTaskId = id;
  });
  for (const id of [...pageNewTaskIds]) {
    if (!activeIds.has(id)) pageNewTaskIds.delete(id);
  }
  runtime.state.mwitoolsPageNewTaskIds = new Set(pageNewTaskIds);
  const activeFresh = [...freshIds].filter((id) => activeIds.has(id));
  if (activeFresh.length) runtime.api.acknowledgeNewTaskIds?.(activeFresh);
}

function ensureCombatModeToggle() {
  if (!taskListParent?.isConnected) return;
  let controls = taskListParent.parentElement?.querySelector(
    ":scope > .mwi-task-combat-mode",
  );
  if (!controls) {
    controls = document.createElement("div");
    controls.className = "mwi-task-combat-mode";
    for (const [mode, zh, en] of [
      ["planet", "星球", "Planet"],
      ["dungeon", "地牢", "Dungeon"],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.mode = mode;
      button.textContent = t(zh, en);
      button.addEventListener("click", () => {
        if (combatGroupMode === mode) return;
        combatGroupMode = mode;
        writeCombatGroupMode(mode);
        lastTaskRenderSignature = "";
        renderTasks();
      });
      controls.appendChild(button);
    }
    taskListParent.insertAdjacentElement("beforebegin", controls);
  }
  for (const button of controls.querySelectorAll("button[data-mode]")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.mode === combatGroupMode),
    );
  }
}

function ungroupCards() {
  if (!taskListParent?.isConnected) return;
  taskListParent
    .querySelectorAll(
      ":scope > .mwi-task-profession-group,:scope > .mwi-task-combat-location",
    )
    .forEach((group) => group.remove());
  taskListParent.parentElement
    ?.querySelector(":scope > .mwi-task-combat-mode")
    ?.remove();
  taskListParent
    .querySelectorAll(`:scope > ${TASK_SELECTOR}`)
    .forEach((card) => {
      card.style.order = card.dataset.mwitoolsOriginalOrder ?? "";
      delete card.dataset.mwitoolsOriginalOrder;
      delete card.dataset.mwitoolsOriginalIndex;
      delete card.dataset.mwitoolsCollapsed;
      delete card.dataset.mwitoolsProfession;
      delete card.dataset.mwitoolsLocation;
      delete card.dataset.mwitoolsDungeonSource;
      delete card.dataset.mwitoolsTaskId;
    });
}

function orderedRows(cards, tasks) {
  const chains = productionDepth(tasks);
  const rows = cards.map((card, index) => {
    const task = tasks[index];
    const slot = Number(card.dataset.mwitoolsOriginalIndex ?? index);
    const completed = isCompletedCard(card, task);
    const previous = pageClassifications.get(slot);
    const isNew = pageNewTaskIds.has(taskId(task));
    const computedProfession = isNew
      ? NEW_PROFESSION
      : completed
        ? COMPLETED_PROFESSION
        : professionForCard(card, task);
    const profession = isNew
      ? NEW_PROFESSION
      : !completed &&
          previous &&
          !previous.completed &&
          previous.profession.key !== NEW_PROFESSION.key
        ? previous.profession
        : computedProfession;
    const location =
      profession.key === "combat"
        ? !completed && previous?.profession.key === "combat"
          ? previous.location
          : combatLocationForCard(card, task)
        : null;
    const dungeonLocations =
      profession.key === "combat"
        ? !completed && previous?.profession.key === "combat"
          ? (previous.dungeonLocations ?? dungeonLocationsForCard(card, task))
          : dungeonLocationsForCard(card, task)
        : [];
    pageClassifications.set(slot, {
      completed,
      profession,
      location,
      dungeonLocations,
    });
    return {
      card,
      task,
      profession,
      location,
      dungeonLocations,
      info: actionSortInfo(task, slot),
      depth: chains?.depths.get(taskActionHrid(task)) ?? 0,
      chain: chains?.groups.get(taskActionHrid(task)) ?? index,
    };
  });
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
  const expanded = String(!collapsed);
  if (header.getAttribute("aria-expanded") !== expanded) {
    header.setAttribute("aria-expanded", expanded);
  }
  if (body.hidden !== collapsed) body.hidden = collapsed;
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
    renderTasks();
  });
  group.append(header, body);
  return group;
}

function mirrorTaskCard(source) {
  const mirror = source.cloneNode(true);
  mirror.dataset.mwitoolsTaskMirror = "true";
  mirror.removeAttribute("id");
  mirror.style.order = "";
  mirror.style.display = "";
  delete mirror.dataset.mwitoolsDungeonSource;
  delete mirror.dataset.mwitoolsCollapsed;
  mirror.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  mirror.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const mirrorButton = event.target.closest("button");
    if (mirrorButton) {
      const mirrorButtons = [...mirror.querySelectorAll("button")];
      const sourceButtons = [...source.querySelectorAll("button")];
      sourceButtons[mirrorButtons.indexOf(mirrorButton)]?.click();
      return;
    }
    source.click();
  });
  return mirror;
}

function renderDungeonCombatGroups(parent, rows, nextOrder) {
  const locations = new Map();
  for (const row of rows) {
    row.card.dataset.mwitoolsDungeonSource = "true";
    for (const location of row.dungeonLocations ?? []) {
      if (!locations.has(location.key)) {
        locations.set(location.key, { location, rows: [] });
      }
      locations.get(location.key).rows.push(row);
    }
  }
  const orderedLocations = [...locations.values()].sort(
    (left, right) =>
      left.location.order - right.location.order ||
      left.location.label.localeCompare(right.location.label),
  );
  const active = new Set();
  for (const { location, rows: locationRows } of orderedLocations) {
    active.add(location.key);
    let section = parent.querySelector(
      `:scope > .mwi-task-combat-location[data-location="${location.key}"]`,
    );
    if (!section || section.dataset.mode !== "dungeon") {
      section?.remove();
      section = document.createElement("section");
      section.className = "mwi-task-combat-location";
      section.dataset.location = location.key;
      section.dataset.mode = "dungeon";
      const header = document.createElement("button");
      header.type = "button";
      header.className = "mwi-task-dungeon-header";
      const title = document.createElement("span");
      title.className = "mwi-task-combat-location-title-text";
      const chevron = document.createElement("span");
      chevron.textContent = "▾";
      header.append(title, chevron);
      const body = document.createElement("div");
      body.className = "mwi-task-dungeon-body";
      header.addEventListener("click", () => {
        if (collapsedDungeonGroups.has(location.key)) {
          collapsedDungeonGroups.delete(location.key);
        } else {
          collapsedDungeonGroups.add(location.key);
        }
        lastTaskRenderSignature = "";
        renderTasks();
      });
      section.append(header, body);
      parent.appendChild(section);
    }
    const collapsed = collapsedDungeonGroups.has(location.key);
    const header = section.querySelector(".mwi-task-dungeon-header");
    header.setAttribute("aria-expanded", String(!collapsed));
    section.querySelector(".mwi-task-combat-location-title-text").textContent =
      `${location.label} (${locationRows.length})`;
    const body = section.querySelector(".mwi-task-dungeon-body");
    body.hidden = collapsed;
    body.replaceChildren(
      ...locationRows.map(({ card }) => mirrorTaskCard(card)),
    );
    section.hidden = collapsedProfessions.has("combat");
    section.style.order = String(nextOrder.value++);
  }
  return active;
}

function renderCombatGroups(parent, rows, nextOrder) {
  if (combatGroupMode === "dungeon") {
    return renderDungeonCombatGroups(parent, rows, nextOrder);
  }
  for (const row of rows) delete row.card.dataset.mwitoolsDungeonSource;
  const locations = new Map();
  for (const row of rows) {
    const location = row.location ?? combatLocationForCard(row.card, row.task);
    if (!locations.has(location.key))
      locations.set(location.key, { location, rows: [] });
    locations.get(location.key).rows.push(row);
  }
  const orderedLocations = [...locations.values()].sort(
    (left, right) =>
      left.location.order - right.location.order ||
      left.location.label.localeCompare(right.location.label),
  );
  const active = new Set();
  for (const { location, rows: locationRows } of orderedLocations) {
    active.add(location.key);
    let section = parent.querySelector(
      `:scope > .mwi-task-combat-location[data-location="${location.key}"]`,
    );
    if (!section || section.dataset.mode === "dungeon") {
      section?.remove();
      section = document.createElement("section");
      section.className = "mwi-task-combat-location";
      section.dataset.location = location.key;
      section.dataset.mode = "planet";
      const title = document.createElement("h4");
      title.className = "mwi-task-combat-location-title";
      section.append(title);
      parent.appendChild(section);
    }
    section.querySelector(".mwi-task-combat-location-title").textContent =
      `${location.label} (${locationRows.length})`;
    section.style.order = String(nextOrder.value++);
    for (const row of locationRows) {
      row.card.style.order = String(nextOrder.value++);
      row.card.dataset.mwitoolsLocation = location.key;
    }
  }
  return active;
}

function renderRegularGroup(rows, nextOrder) {
  for (const row of rows) row.card.style.order = String(nextOrder.value++);
}

function groupCards(cards, tasks) {
  if (!taskListParent) return;
  for (const card of cards) delete card.dataset.mwitoolsDungeonSource;
  document
    .querySelectorAll(".mwi-task-toolbar")
    .forEach((node) => node.remove());
  const rows = orderedRows(cards, tasks);
  const customDefinitions = rows
    .map((row) => row.profession)
    .filter(
      (profession, index, all) =>
        ![NEW_PROFESSION, COMPLETED_PROFESSION, ...PROFESSIONS].some(
          (known) => known.key === profession.key,
        ) &&
        all.findIndex((candidate) => candidate.key === profession.key) ===
          index,
    );
  const definitions = [
    NEW_PROFESSION,
    COMPLETED_PROFESSION,
    ...PROFESSIONS,
    ...customDefinitions,
  ];
  const activeKeys = new Set([COMPLETED_PROFESSION.key]);
  const activeLocations = new Set();
  const nextOrder = { value: 1 };
  for (const profession of definitions) {
    const matching = rows.filter(
      (row) => row.profession.key === profession.key,
    );
    if (!matching.length && profession.key !== COMPLETED_PROFESSION.key)
      continue;
    activeKeys.add(profession.key);
    const group = ensureProfessionGroup(taskListParent, profession);
    if (!group.isConnected) taskListParent.appendChild(group);
    const title = runtime.config.isZH ? profession.zh : profession.en;
    const titleNode = group.querySelector(".mwi-task-profession-title");
    if (titleNode.textContent !== title) titleNode.textContent = title;
    const count = String(matching.length);
    const countNode = group.querySelector(".mwi-task-profession-count");
    if (countNode.textContent !== count) countNode.textContent = count;
    const groupOrder = String(nextOrder.value++);
    if (group.style.order !== groupOrder) group.style.order = groupOrder;
    updateGroupCollapsedState(group, profession);
    for (const row of matching) {
      if (row.card.dataset.mwitoolsProfession !== profession.key) {
        row.card.dataset.mwitoolsProfession = profession.key;
      }
      const collapsed = String(collapsedProfessions.has(profession.key));
      if (row.card.dataset.mwitoolsCollapsed !== collapsed) {
        row.card.dataset.mwitoolsCollapsed = collapsed;
      }
    }
    if (profession.key === "combat") {
      for (const key of renderCombatGroups(
        taskListParent,
        matching,
        nextOrder,
      )) {
        activeLocations.add(key);
      }
    } else {
      renderRegularGroup(matching, nextOrder);
    }
  }
  taskListParent
    .querySelectorAll(":scope > .mwi-task-profession-group")
    .forEach((group) => {
      if (!activeKeys.has(group.dataset.profession)) group.remove();
    });
  taskListParent
    .querySelectorAll(":scope > .mwi-task-combat-location")
    .forEach((section) => {
      if (!activeLocations.has(section.dataset.location)) section.remove();
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

function wireResetButtons(cards) {
  cards.forEach((card, index) => {
    if (card.dataset.mwitoolsResetWired) return;
    const button = [...card.querySelectorAll("button")].find((candidate) =>
      /reset|重置/i.test(candidate.textContent),
    );
    if (!button) return;
    card.dataset.mwitoolsResetWired = "true";
    button.addEventListener(
      "click",
      () => {
        pendingResetSlots.add(index);
        const timeout = setTimeout(
          () => pendingResetSlots.delete(index),
          30_000,
        );
        timeout?.unref?.();
      },
      true,
    );
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

function taskRenderSignature(cards, tasks) {
  const settings = [
    runtime.config.isZH,
    runtime.settings.get("taskAutoSort"),
    runtime.settings.get("taskIcons"),
    combatGroupMode,
    [...pageNewTaskIds].sort().join(","),
    [...collapsedProfessions].sort().join(","),
    [...collapsedDungeonGroups].sort().join(","),
  ];
  const rows = cards.map((card, index) => {
    const task = tasks[index] ?? {};
    return [
      taskActionHrid(task) ?? "",
      visibleTaskTitle(card),
      String(card.textContent ?? "").match(
        /(?:进度|progress)\s*[:：]\s*[\d,.]+\s*\/\s*[\d,.]+/i,
      )?.[0] ?? "",
      isCompletedCard(card, task) ? "1" : "0",
      card.dataset.mwitoolsProfession ?? "",
      card.dataset.mwitoolsCollapsed ?? "",
    ].join("\u001f");
  });
  return [...settings, ...rows].join("\u001e");
}

function renderTasks() {
  let cards = [...document.querySelectorAll(TASK_SELECTOR)];
  if (!cards.length) {
    applyPendingMerge();
    if (taskListParent && !taskListParent.isConnected) {
      originalCards = [];
      taskListParent = null;
      lastRenderedCards = [];
      lastTaskRenderSignature = "";
      lastActionDetails = null;
      lastActionCategories = null;
      pageClassifications = new Map();
      pageTaskIds = new Map();
      pageNewTaskIds = new Set();
      pendingResetSlots = new Set();
      runtime.state.mwitoolsPageNewTaskIds = new Set();
    }
    return;
  }
  const observedParent = cards[0]?.parentElement ?? null;
  const enteredNewTaskPage =
    !taskListParent?.isConnected ||
    (observedParent && observedParent !== taskListParent);
  if (enteredNewTaskPage) {
    ungroupCards();
    originalCards = [];
    pageClassifications = new Map();
    pageTaskIds = new Map();
    pageNewTaskIds = new Set();
    pendingResetSlots = new Set();
    combatGroupMode = readCombatGroupMode();
    taskListParent = observedParent;
  }
  cards = cards.filter((card) => card.parentElement === taskListParent);
  const tasks = runtime.state.characterQuests ?? [];
  const cardTasks = cards.map((card, index) => tasks[index] ?? {});
  syncPageNewTasks(cards, cardTasks, enteredNewTaskPage);
  ensureCombatModeToggle();
  const signature = taskRenderSignature(cards, cardTasks);
  const sameCards =
    cards.length === lastRenderedCards.length &&
    cards.every((card, index) => card === lastRenderedCards[index]);
  const actionDetails = runtime.state.initData_actionDetailMap;
  const actionCategories = runtime.state.initData_actionCategoryDetailMap;
  if (
    !enteredNewTaskPage &&
    sameCards &&
    actionDetails === lastActionDetails &&
    actionCategories === lastActionCategories &&
    signature === lastTaskRenderSignature
  ) {
    applyPendingMerge();
    return;
  }

  originalCards = [...cards];
  originalCards.forEach((card, index) => {
    if (!("mwitoolsOriginalOrder" in card.dataset))
      card.dataset.mwitoolsOriginalOrder = card.style.order;
    const originalIndex = String(index);
    if (card.dataset.mwitoolsOriginalIndex !== originalIndex) {
      card.dataset.mwitoolsOriginalIndex = originalIndex;
    }
    if ("mwitoolsLocation" in card.dataset) {
      delete card.dataset.mwitoolsLocation;
    }
  });
  cards.forEach((card, index) => decorateCard(card, cardTasks[index]));
  wireMergeButtons(cards, cardTasks);
  wireResetButtons(cards);
  groupCards(cards, cardTasks);
  applyPendingMerge();
  lastRenderedCards = [...cards];
  lastActionDetails = actionDetails;
  lastActionCategories = actionCategories;
  lastTaskRenderSignature = taskRenderSignature(cards, cardTasks);
}

function cleanupTasks() {
  ungroupCards();
  document
    .querySelectorAll(
      ".mwi-task-insight,.mwi-task-toolbar,.mwi-task-profession-group,.mwi-task-bg,.mwi-task-merged-note",
    )
    .forEach((node) => node.remove());
  document
    .querySelectorAll("[data-mwitools-merge-wired],[data-mwitools-reset-wired]")
    .forEach((node) => {
      delete node.dataset.mwitoolsMergeWired;
      delete node.dataset.mwitoolsResetWired;
    });
  document.getElementById(STYLE_ID)?.remove();
  originalCards = [];
  taskListParent = null;
  pageClassifications = new Map();
  pageTaskIds = new Map();
  pageNewTaskIds = new Set();
  pendingResetSlots = new Set();
  runtime.state.mwitoolsPageNewTaskIds = new Set();
  lastRenderedCards = [];
  lastTaskRenderSignature = "";
  lastActionDetails = null;
  lastActionCategories = null;
  collapsedProfessions.clear();
  collapsedDungeonGroups.clear();
}

runtime.features.register({
  id: "taskInsights",
  setting: "taskInsights",
  scope: "character",
  initialize({ scope }) {
    addStyles();
    renderTasks();
    void loadTaskSpriteManifest().then(() => {
      lastTaskRenderSignature = "";
      renderTasks();
    });
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
  addTaskStyles: addStyles,
  taskActionHrid,
  taskRemaining,
  taskProjection,
  renderTasks,
  restoreTaskOrder: renderTasks,
});
