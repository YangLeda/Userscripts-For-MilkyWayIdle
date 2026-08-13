import { runtime } from "../core/runtime.js";
import { parseCompactNumber } from "../core/market.js";
import "../core/train-planning.js";
import {
  getGameLocale,
  getLocalizedEntityName,
  matchesGameTranslations,
  resolveLocalizedEntity,
} from "../core/game-localization.js";
import {
  resolveTaskCards,
  taskCardTaskId,
} from "../core/task-card-resolution.js";
import { createFrameScheduler } from "../core/frame-scheduler.js";

const STYLE_ID = "mwitools-task-style";
const TASK_SELECTOR =
  'div[class*="RandomTask_randomTask"]:not([data-mwitools-task-mirror="true"])';
const OWNED_TASK_SELECTOR =
  '.mwi-task-insight,.mwi-task-toolbar,.mwi-task-profession-group,.mwi-task-combat-location,.mwi-task-combat-mode,.mwi-task-bg,.mwi-task-merged-note,.mwi-task-merge-toast,.mwi-task-train-planner,.mwi-task-new-badge,[data-mwitools-task-mirror="true"]';
const MERGE_HANDLER = Symbol("mwitoolsTaskMergeHandler");
let originalCards = [];
let taskListParent = null;
let pageClassifications = new Map();
let pageTaskIds = new Map();
let pageNewTaskIds = new Set();
let pendingResetSlots = new Set();
let nativeResetChoiceUntil = 0;
let temporaryTaskReturn = null;
let lastRenderedCards = [];
let lastTaskRenderSignature = "";
let lastActionDetails = null;
let lastActionCategories = null;
let taskSpriteManifestPromise = null;
const taskSpriteBases = new Map();
let spriteScanDocument = null;
let spriteSourcesScanned = false;
let cachedTaskActionIndex = null;
let cachedTaskActionIndexMap = null;
let cachedTaskActionIndexLocale = "";
const taskActionCache = new WeakMap();
const taskRemainingCache = new WeakMap();
let pageOrderBySlot = new Map();
let activeProfessionFilters = new Set();
let combatFilterEnabled = false;
let activeDungeonFilters = new Set();

// The live game currently exposes empty fightInfo for dungeon actions, so
// dungeon membership cannot be derived from initData_actionDetailMap alone.
// Keep the known monster HRIDs as a fallback while still accepting runtime
// fightInfo below if the game starts publishing dungeon rosters again.
const KNOWN_DUNGEON_ROSTERS = [
  {
    actionHrid: "/actions/combat/chimerical_den",
    sortIndex: 56,
    monsters: new Set([
      "/monsters/alligator",
      "/monsters/aquahorse",
      "/monsters/butterjerry",
      "/monsters/centaur_archer",
      "/monsters/crab",
      "/monsters/dodocamel",
      "/monsters/eye",
      "/monsters/eyes",
      "/monsters/frog",
      "/monsters/gobo_boomy",
      "/monsters/gobo_shooty",
      "/monsters/gobo_slashy",
      "/monsters/gobo_smashy",
      "/monsters/gobo_stabby",
      "/monsters/griffin",
      "/monsters/jackalope",
      "/monsters/jungle_sprite",
      "/monsters/manticore",
      "/monsters/myconid",
      "/monsters/nom_nom",
      "/monsters/porcupine",
      "/monsters/rat",
      "/monsters/sea_snail",
      "/monsters/skunk",
      "/monsters/slimy",
      "/monsters/snake",
      "/monsters/swampy",
      "/monsters/turtle",
      "/monsters/veyes",
    ]),
  },
  {
    actionHrid: "/actions/combat/sinister_circus",
    sortIndex: 57,
    monsters: new Set([
      "/monsters/acrobat",
      "/monsters/black_bear",
      "/monsters/deranged_jester",
      "/monsters/elementalist",
      "/monsters/flame_sorcerer",
      "/monsters/gobo_boomy",
      "/monsters/gobo_shooty",
      "/monsters/gobo_slashy",
      "/monsters/gobo_smashy",
      "/monsters/gobo_stabby",
      "/monsters/grizzly_bear",
      "/monsters/gummy_bear",
      "/monsters/ice_sorcerer",
      "/monsters/juggler",
      "/monsters/magician",
      "/monsters/novice_sorcerer",
      "/monsters/panda",
      "/monsters/polar_bear",
      "/monsters/rabid_rabbit",
      "/monsters/vampire",
      "/monsters/werewolf",
      "/monsters/zombie",
      "/monsters/zombie_bear",
    ]),
  },
  {
    actionHrid: "/actions/combat/enchanted_fortress",
    sortIndex: 58,
    monsters: new Set([
      "/monsters/abyssal_imp",
      "/monsters/black_bear",
      "/monsters/elementalist",
      "/monsters/enchanted_bishop",
      "/monsters/enchanted_king",
      "/monsters/enchanted_knight",
      "/monsters/enchanted_pawn",
      "/monsters/enchanted_queen",
      "/monsters/enchanted_rook",
      "/monsters/flame_sorcerer",
      "/monsters/grizzly_bear",
      "/monsters/ice_sorcerer",
      "/monsters/magnetic_golem",
      "/monsters/novice_sorcerer",
      "/monsters/panda",
      "/monsters/polar_bear",
      "/monsters/soul_hunter",
      "/monsters/stalactite_golem",
    ]),
  },
  {
    actionHrid: "/actions/combat/pirate_cove",
    sortIndex: 59,
    monsters: new Set([
      "/monsters/abyssal_imp",
      "/monsters/anchor_shark",
      "/monsters/brine_marksman",
      "/monsters/captain_fishhook",
      "/monsters/eye",
      "/monsters/eyes",
      "/monsters/granite_golem",
      "/monsters/infernal_warlock",
      "/monsters/magnetic_golem",
      "/monsters/soul_hunter",
      "/monsters/squawker",
      "/monsters/stalactite_golem",
      "/monsters/the_kraken",
      "/monsters/tidal_conjuror",
      "/monsters/vampire",
      "/monsters/veyes",
      "/monsters/werewolf",
      "/monsters/zombie",
    ]),
  },
];

const PROFESSIONS = [
  ["milking", "挤奶", "Milking"],
  ["foraging", "采摘", "Foraging"],
  ["woodcutting", "伐木", "Woodcutting"],
  ["cheesesmithing", "奶酪锻造", "Cheesesmithing"],
  ["crafting", "制作", "Crafting"],
  ["tailoring", "缝纫", "Tailoring"],
  ["cooking", "烹饪", "Cooking"],
  ["brewing", "冲泡", "Brewing"],
  ["combat", "战斗", "Combat"],
].map(([key, zh, en], order) => ({ key, zh, en, order }));
const LIFE_PROFESSIONS = PROFESSIONS.filter(({ key }) => key !== "combat");
const DUNGEON_FILTERS = [
  ["/actions/combat/chimerical_den", "奇幻洞穴", "Chimerical Den"],
  ["/actions/combat/sinister_circus", "邪恶马戏团", "Sinister Circus"],
  ["/actions/combat/enchanted_fortress", "迷人要塞", "Enchanted Fortress"],
  ["/actions/combat/pirate_cove", "海盗湾", "Pirate Cove"],
].map(([actionHrid, zh, en]) => ({ actionHrid, zh, en }));

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function taskId(task) {
  return taskCardTaskId(task);
}

export function armTemporaryTaskReturn(expiresAt) {
  const deadline = Number(expiresAt);
  temporaryTaskReturn = Number.isFinite(deadline)
    ? { expiresAt: deadline, returning: false }
    : null;
}

export function resumeTemporaryTaskReturn(now = Date.now()) {
  if (!temporaryTaskReturn || temporaryTaskReturn.expiresAt <= now) {
    temporaryTaskReturn = null;
    return false;
  }
  temporaryTaskReturn.returning = true;
  return true;
}

export function cancelTemporaryTaskReturn() {
  temporaryTaskReturn = null;
}

function hasTemporaryTaskReturn(now = Date.now()) {
  if (!temporaryTaskReturn || temporaryTaskReturn.expiresAt <= now) {
    temporaryTaskReturn = null;
    return false;
  }
  return true;
}

function consumeTemporaryTaskReturn(now = Date.now()) {
  if (!hasTemporaryTaskReturn(now) || !temporaryTaskReturn.returning) {
    return false;
  }
  temporaryTaskReturn = null;
  return true;
}

function resetTaskFilters() {
  activeProfessionFilters.clear();
  combatFilterEnabled = false;
  activeDungeonFilters.clear();
}

function hasActiveTaskFilters() {
  return (
    activeProfessionFilters.size > 0 ||
    combatFilterEnabled ||
    activeDungeonFilters.size > 0
  );
}

function rememberSpriteBase(kind, value) {
  const base = String(value ?? "").split("#")[0];
  if (base.includes(`${kind}_sprite`) && base.endsWith(".svg")) {
    taskSpriteBases.set(kind, base);
  }
}

function scanTaskSpriteBases({ force = false } = {}) {
  if (spriteScanDocument !== document) {
    spriteScanDocument = document;
    spriteSourcesScanned = false;
  }
  if (spriteSourcesScanned && !force) return;
  spriteSourcesScanned = true;
  try {
    document
      .querySelectorAll("svg use")
      .forEach((use) =>
        ["items", "actions", "combat_monsters", "skills", "misc"].forEach(
          (kind) =>
            rememberSpriteBase(
              kind,
              use.getAttribute("href") ?? use.getAttribute("xlink:href"),
            ),
        ),
      );
    globalThis.performance
      ?.getEntriesByType?.("resource")
      ?.forEach((entry) =>
        ["items", "actions", "combat_monsters", "skills", "misc"].forEach(
          (kind) => rememberSpriteBase(kind, entry.name),
        ),
      );
  } catch {
    // Resource timing may be unavailable in tests or hardened browsers.
  }
}

async function loadTaskSpriteManifest() {
  if (taskSpriteManifestPromise) return taskSpriteManifestPromise;
  taskSpriteManifestPromise = (async () => {
    scanTaskSpriteBases({ force: true });
    try {
      const response = await globalThis.fetch(
        new URL("/asset-manifest.json", globalThis.location?.origin).href,
      );
      if (!response.ok) return;
      const manifest = await response.json();
      for (const value of Object.values(manifest?.files ?? {})) {
        for (const kind of [
          "items",
          "actions",
          "combat_monsters",
          "skills",
          "misc",
        ]) {
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
  const base = taskSpriteBases.get(kind);
  const symbol = String(hrid ?? "")
    .split("/")
    .at(-1);
  return base && symbol ? `${base}#${symbol}` : "";
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [class*="TasksPanel_taskList"] { grid-template-columns:repeat(auto-fill,minmax(min(100%,270px),1fr)) !important; gap:8px !important; }
    [class*="TasksPanel_taskList"] > * { min-width:0 !important; max-width:100% !important; box-sizing:border-box !important; }
    [class*="RandomTask_randomTask"] { min-width:0 !important; }
    [class*="RandomTask_randomTask"] > [class*="RandomTask_content"] { gap:2px !important; padding:8px !important; font-size:.8125rem; }
    [class*="RandomTask_randomTask"] [class*="RandomTask_taskInfo"] { gap:2px !important; }
    [class*="RandomTask_randomTask"] [class*="RandomTask_buttonsContainer"] { margin-top:2px !important; }
    .mwi-task-toolbar { display:flex; flex-direction:column; align-items:stretch; gap:4px; margin:4px 0 8px; padding:5px; border:1px solid rgba(255,255,255,.12); border-radius:7px; background:rgba(0,0,0,.18); }
    .mwi-task-toolbar-controls { display:flex; width:100%; align-items:center; gap:4px; }
    .mwi-task-filter-groups { display:flex; width:100%; min-width:0; align-items:center; flex-wrap:nowrap; gap:4px; }
    .mwi-task-filter-group { display:flex; align-items:center; flex-wrap:wrap; gap:3px; }
    .mwi-task-filter-group--life,.mwi-task-filter-group--combat { flex-wrap:nowrap; }
    .mwi-task-filter-group--combat { flex:0 0 auto; }
    .mwi-task-dungeon-filters { display:inline-flex; align-items:center; gap:3px; padding-left:4px; border-left:1px solid rgba(255,255,255,.12); }
    .mwi-task-filter,.mwi-task-sort-button { display:inline-flex; min-height:28px; align-items:center; justify-content:center; gap:4px; box-sizing:border-box; padding:3px 7px; border:1px solid rgba(255,255,255,.14); border-radius:5px; background:rgba(255,255,255,.08); color:var(--color-text-primary,#eee); font:inherit; font-size:.7rem; cursor:pointer; }
    .mwi-task-filter:hover,.mwi-task-sort-button:hover { background:rgba(255,255,255,.14); }
    .mwi-task-filter:disabled { opacity:.38; cursor:default; filter:saturate(.35); }
    .mwi-task-filter:focus-visible,.mwi-task-sort-button:focus-visible { outline:2px solid ${runtime.config.SCRIPT_COLOR_MAIN}; outline-offset:1px; }
    .mwi-task-filter[aria-pressed="true"] { border-color:rgba(226,181,79,.62); background:rgba(226,181,79,.18); color:#f3d58b; }
    .mwi-task-filter[aria-pressed="false"] { opacity:.38; filter:saturate(.35); }
    .mwi-task-filter-icon { display:inline-flex; width:18px; height:18px; flex:0 0 18px; align-items:center; justify-content:center; font-size:13px; line-height:1; }
    .mwi-task-filter-icon svg { width:100%; height:100%; }
    .mwi-task-filter-label { white-space:nowrap; }
    .mwi-task-filter-count { min-width:1.1em; color:inherit; font-weight:750; font-variant-numeric:tabular-nums; text-align:center; }
    .mwi-task-sort-button { margin-left:auto; border-color:rgba(120,174,255,.45); color:#b8d5ff; }
    ${TASK_SELECTOR}[data-mwitools-filtered="true"] { display:none !important; }
    .mwi-task-bg { position:absolute; z-index:0; top:6%; left:68%; width:24%; height:88%; opacity:.3; pointer-events:none; }
    .mwi-task-bg svg { width:100%; height:100%; }
    ${TASK_SELECTOR} > :not(.mwi-task-bg) { position:relative; z-index:1; }
    .mwi-task-merge-toast { position:fixed; top:56px; right:14px; z-index:2147483200; max-width:min(360px,calc(100vw - 28px)); box-sizing:border-box; padding:8px 11px; border:1px solid rgba(102,205,135,.5); border-radius:6px; background:rgba(15,24,20,.97); box-shadow:0 8px 22px rgba(0,0,0,.4); color:#a8e5b7; font-size:.75rem; line-height:1.35; animation:mwi-task-toast-in .16s ease-out; }
    @keyframes mwi-task-toast-in { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
    @media (max-width:640px) {
      .mwi-task-toolbar { gap:3px; padding:4px; }
      .mwi-task-filter-groups { flex-wrap:wrap; }
      .mwi-task-filter-group--life { min-width:0; flex:1 1 auto; flex-wrap:wrap; }
      .mwi-task-filter,.mwi-task-sort-button { min-width:28px; min-height:28px; gap:2px; padding:3px 5px; }
    }
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

function normalizeTaskLookupName(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

function getTaskActionIndex() {
  const actionMap = runtime.state.initData_actionDetailMap ?? {};
  const locale = getGameLocale();
  if (
    cachedTaskActionIndex &&
    cachedTaskActionIndexMap === actionMap &&
    cachedTaskActionIndexLocale === locale
  ) {
    return cachedTaskActionIndex;
  }
  const combatByName = new Map();
  const combatByMonster = new Map();
  const dungeonsByMonster = new Map();
  const zoneActionByCategory = new Map();
  for (const detail of Object.values(actionMap)) {
    if (!String(detail?.hrid).startsWith("/actions/combat/")) continue;
    for (const name of [
      detail.name,
      runtime.data.ZHActionNames?.[detail.hrid],
      getLocalizedEntityName("action", detail.hrid, { locale }),
    ]) {
      const normalized = normalizeTaskLookupName(name);
      if (normalized && !combatByName.has(normalized)) {
        combatByName.set(normalized, detail);
      }
    }
    if (
      detail?.category &&
      detail?.combatZoneInfo?.fightInfo?.battlesPerBoss === 10 &&
      !zoneActionByCategory.has(detail.category)
    ) {
      zoneActionByCategory.set(detail.category, detail);
    }
    const monsters = fightMonsterHrids(detail?.combatZoneInfo?.fightInfo);
    for (const monsterHrid of monsters) {
      if (!combatByMonster.has(monsterHrid)) {
        combatByMonster.set(monsterHrid, detail);
      }
      if (!detail?.combatZoneInfo?.isDungeon) continue;
      if (!dungeonsByMonster.has(monsterHrid)) {
        dungeonsByMonster.set(monsterHrid, []);
      }
      dungeonsByMonster.get(monsterHrid).push(detail);
    }
  }
  cachedTaskActionIndexMap = actionMap;
  cachedTaskActionIndexLocale = locale;
  cachedTaskActionIndex = {
    combatByName,
    combatByMonster,
    dungeonsByMonster,
    zoneActionByCategory,
  };
  return cachedTaskActionIndex;
}

function taskActionHrid(task) {
  if (!task || typeof task !== "object") return null;
  const direct =
    task.actionHrid ??
    task.taskActionHrid ??
    task.skillActionHrid ??
    nestedValue(task, ["actionHrid", "taskActionHrid", "skillActionHrid"]);
  if (direct) return direct;
  const actionMap = runtime.state.initData_actionDetailMap ?? {};
  const monsterHrid = task.monsterHrid ?? nestedValue(task, ["monsterHrid"]);
  const cached = taskActionCache.get(task);
  if (cached?.actionMap === actionMap && cached.monsterHrid === monsterHrid) {
    return cached.value;
  }
  const value =
    getTaskActionIndex().combatByMonster.get(monsterHrid)?.hrid ?? null;
  taskActionCache.set(task, { actionMap, monsterHrid, value });
  return value;
}

function taskRemaining(task) {
  if (!task || typeof task !== "object") return 0;
  const targetSource =
    task.targetCount ??
    task.requiredCount ??
    task.goalCount ??
    task.count ??
    nestedValue(task, ["targetCount", "requiredCount", "goalCount", "count"]);
  const currentSource =
    task.currentCount ??
    task.completedCount ??
    task.progressCount ??
    nestedValue(task, ["currentCount", "completedCount", "progressCount"]);
  const cached = taskRemainingCache.get(task);
  if (
    cached?.targetSource === targetSource &&
    cached.currentSource === currentSource
  ) {
    return cached.value;
  }
  const target = Number(targetSource);
  const current = Number(currentSource);
  const value = Number.isFinite(target)
    ? Math.max(0, target - (Number.isFinite(current) ? current : 0))
    : 0;
  taskRemainingCache.set(task, { currentSource, targetSource, value });
  return value;
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

function targetNameFromTitle(title) {
  return String(title ?? "")
    .split(/\s[-–]\s/)
    .slice(1)
    .join(" - ")
    .trim();
}

function itemHridFromDisplayName(name) {
  if (!name) return "";
  const normalized = name.replace(/\s+\+\d+\s*$/, "").trim();
  return resolveLocalizedEntity("item", normalized);
}

function namedMonsterHridForCard(card, title = visibleTaskTitle(card)) {
  const monsterName = targetNameFromTitle(title)
    .replace(/\s+(?:图|Z)\s*\d+\s*$/i, "")
    .trim();
  const translated = resolveLocalizedEntity("monster", monsterName);
  if (String(translated).startsWith("/monsters/")) return translated;
  if (String(translated).startsWith("/actions/combat/")) {
    return String(translated).replace("/actions/combat/", "/monsters/");
  }
  const matchingAction = getTaskActionIndex().combatByName.get(
    normalizeTaskLookupName(monsterName),
  );
  if (matchingAction?.combatZoneInfo?.isDungeon) return null;
  return matchingAction?.hrid?.replace("/actions/combat/", "/monsters/");
}

function normalizeMonsterHrid(value) {
  if (typeof value !== "string") return "";
  if (value.startsWith("/monsters/")) return value;
  if (!value.startsWith("/actions/combat/")) return "";
  const candidate = value.replace("/actions/combat/", "/monsters/");
  return Object.hasOwn(runtime.data.ZHOthersDic ?? {}, candidate)
    ? candidate
    : "";
}

function fightMonsterHrids(value, result = new Set(), visited = new Set()) {
  if (!value || visited.has(value)) return result;
  if (typeof value === "string") {
    const normalized = normalizeMonsterHrid(value);
    if (normalized) result.add(normalized);
    return result;
  }
  if (typeof value !== "object") return result;
  visited.add(value);
  for (const child of Object.values(value)) {
    fightMonsterHrids(child, result, visited);
  }
  return result;
}

function monsterHridForCard(card, task, title = visibleTaskTitle(card)) {
  // The rendered title is the task's authoritative target. Action HRIDs may
  // identify a whole zone or dungeon and must not be treated as monster IDs.
  const named = namedMonsterHridForCard(card, title);
  if (named) return named;

  const direct = normalizeMonsterHrid(
    nestedValue(task, [
      "monsterHrid",
      "targetMonsterHrid",
      "combatMonsterHrid",
    ]),
  );
  if (direct) return direct;

  const actionHrid = String(taskActionHrid(task) ?? "");
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  const fightCandidates = [
    ...fightMonsterHrids(detail?.combatZoneInfo?.fightInfo),
  ];
  if (fightCandidates.length === 1) return fightCandidates[0];
  return normalizeMonsterHrid(actionHrid) || null;
}

export function taskArtworkForCard(card, task, context = {}) {
  const title = context.title ?? visibleTaskTitle(card);
  const profession = context.profession ?? professionForCard(card, task, title);
  if (profession.key === "combat") {
    const monsterHrid =
      context.monsterHrid ?? monsterHridForCard(card, task, title);
    if (monsterHrid) return { kind: "combat_monsters", hrid: monsterHrid };
  }

  const namedItemHrid = itemHridFromDisplayName(targetNameFromTitle(title));
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

function decorateCard(card, task, artwork = null) {
  card.querySelector(".mwi-task-insight")?.remove();
  if (!runtime.settings.get("taskIcons")) {
    card.querySelector(":scope > .mwi-task-bg")?.remove();
    return;
  }
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

function taskIconMatches(card, task) {
  const existing = card.querySelector(":scope > .mwi-task-bg");
  if (!runtime.settings.get("taskIcons")) return !existing;
  const artwork = taskArtworkForCard(card, task);
  const href = artwork ? taskSpriteHref(artwork.kind, artwork.hrid) : "";
  return href ? existing?.dataset.spriteHref === href : existing === null;
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

function isQuestTaskCard(card) {
  // Full-capacity task pages can include a task-points reward tile that shares
  // the native card and name classes but has no quest identity or progress.
  if (!card.querySelector('div[class*="RandomTask_name"]')) return false;
  if (
    /(?:进度|progress)\s*:?[\s\S]*?\d[\d,.\s\u00a0\u202f]*\s*\/\s*\d/i.test(
      String(card.textContent ?? ""),
    )
  ) {
    return true;
  }
  return [...card.querySelectorAll("button")].some((button) =>
    matchesGameTranslations(
      ["randomTask.reroll", "randomTask.go", "questModal.go"],
      button.textContent,
      { fallbackPatterns: [/^(?:reset|重置|go|前往)$/i] },
    ),
  );
}

function professionForCard(card, task, title = visibleTaskTitle(card)) {
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
  if (resolveLocalizedEntity("monster", targetNameFromTitle(title))) {
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
    order: PROFESSIONS.length - 1.5,
  };
}

function isCompletedCard(card, task, cardText = null) {
  const target = Number(
    nestedValue(task, ["targetCount", "requiredCount", "goalCount", "count"]),
  );
  if (target > 0 && taskRemaining(task) === 0) return true;
  if (
    [...card.querySelectorAll("button")].some((button) =>
      matchesGameTranslations(
        ["randomTask.claimReward", "questModal.claimReward"],
        button.textContent,
        { fallbackPatterns: [/claim|领取/i] },
      ),
    )
  ) {
    return true;
  }
  const text = String(
    cardText ??
      runtime.api.getOriTextFromElement?.(card) ??
      card.textContent ??
      "",
  );
  const progress = text.match(
    /(?:进度|progress)\s*[:：]\s*([\d,.\s\u00a0\u202f]+)\s*\/\s*([\d,.\s\u00a0\u202f]+)/i,
  );
  if (progress) {
    const current = parseCompactNumber(progress[1]);
    const target = parseCompactNumber(progress[2]);
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

function combatDetailForCard(
  card,
  task,
  { title = visibleTaskTitle(card), monsterHrid = "" } = {},
) {
  const taskDetail =
    runtime.state.initData_actionDetailMap?.[taskActionHrid(task)];
  const monsterName = targetNameFromTitle(title)
    .replace(/\s+(?:图|Z)\s*\d+\s*$/i, "")
    .trim();
  const translatedHrid =
    resolveLocalizedEntity("monster", monsterName) ||
    resolveLocalizedEntity("action", monsterName);
  const resolvedMonsterHrid =
    monsterHrid ||
    String(translatedHrid ?? "").replace("/actions/combat/", "/monsters/");
  const index = getTaskActionIndex();
  const translatedActionHrid = String(translatedHrid ?? "").replace(
    "/monsters/",
    "/actions/combat/",
  );
  const translatedDetail =
    runtime.state.initData_actionDetailMap?.[translatedActionHrid];
  const indexedDetail =
    index.combatByName.get(normalizeTaskLookupName(monsterName)) ??
    index.combatByMonster.get(resolvedMonsterHrid);
  if (translatedDetail ?? indexedDetail)
    return translatedDetail ?? indexedDetail;
  return String(taskDetail?.hrid ?? taskActionHrid(task)).startsWith(
    "/actions/combat/",
  )
    ? taskDetail
    : null;
}

function combatLocationForCard(
  card,
  task,
  {
    detail = combatDetailForCard(card, task),
    title = visibleTaskTitle(card),
  } = {},
) {
  const categories = runtime.state.initData_actionCategoryDetailMap ?? {};
  if (detail?.combatZoneInfo?.isDungeon) {
    const name =
      (runtime.config.isZH
        ? runtime.data.ZHActionNames?.[detail.hrid]
        : detail.name) ?? detail.name;
    return {
      key: `dungeon-${detail.hrid}`,
      label: name ? `${t("地牢", "Dungeon")} · ${name}` : t("地牢", "Dungeon"),
      order: 10_000 + Number(detail.sortIndex ?? 0),
    };
  }
  if (detail?.category) {
    const category = categories[detail.category];
    const zoneAction = getTaskActionIndex().zoneActionByCategory.get(
      detail.category,
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
  const mapIndex = title.match(/(?:图|Z)\s*(\d+)\s*$/i)?.[1];
  if (mapIndex) {
    return {
      key: `zone-index-${mapIndex}`,
      label: `${t("地图", "Zone")} ${mapIndex}`,
      order: Number(mapIndex),
    };
  }
  return {
    key: "non-dungeon-monsters",
    label: t("非地牢怪物", "Non-dungeon monsters"),
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
    actionHrid: detail?.hrid ?? "",
    isDungeon: true,
    label: name || t("地牢", "Dungeon"),
    order: Number(detail?.sortIndex ?? 9999),
  };
}

function nonDungeonLocation() {
  return {
    key: "non-dungeon-monsters",
    actionHrid: "",
    isDungeon: false,
    label: t("非地牢怪物", "Non-dungeon monsters"),
    order: 99_999,
  };
}

export function dungeonLocationsForCard(card, task, context = {}) {
  const actionHrid = taskActionHrid(task);
  const taskDetail = runtime.state.initData_actionDetailMap?.[actionHrid];
  if (taskDetail?.combatZoneInfo?.isDungeon) {
    return [dungeonLocation(taskDetail)];
  }
  const monsterHrid =
    context.monsterHrid ??
    monsterHridForCard(card, task, context.title ?? visibleTaskTitle(card));
  if (!monsterHrid) return [nonDungeonLocation()];
  const actionDetails = runtime.state.initData_actionDetailMap ?? {};
  const matchingDungeonHrids = new Set(
    (getTaskActionIndex().dungeonsByMonster.get(monsterHrid) ?? []).map(
      (detail) => detail.hrid,
    ),
  );
  for (const dungeon of KNOWN_DUNGEON_ROSTERS) {
    if (dungeon.monsters.has(monsterHrid)) {
      matchingDungeonHrids.add(dungeon.actionHrid);
    }
  }
  const matches = [...matchingDungeonHrids]
    .map((dungeonActionHrid) => {
      const known = KNOWN_DUNGEON_ROSTERS.find(
        (dungeon) => dungeon.actionHrid === dungeonActionHrid,
      );
      return (
        actionDetails[dungeonActionHrid] ?? {
          hrid: dungeonActionHrid,
          sortIndex: known?.sortIndex,
          combatZoneInfo: { isDungeon: true },
        }
      );
    })
    .map(dungeonLocation)
    .sort(
      (left, right) =>
        left.order - right.order || left.label.localeCompare(right.label),
    );
  return matches.length ? matches : [nonDungeonLocation()];
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

function productionChains(tasks) {
  if (!runtime.settings.get("taskTrainPlanner")) return null;
  const planning = runtime.api.trainPlanning;
  if (!planning) return null;
  const rows = tasks.map((task, index) => {
    const actionHrid = taskActionHrid(task);
    const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
    const outputHrid = runtime.api.getExpectedOutputs?.(detail)?.[0]?.itemHrid;
    const root = outputHrid ? planning.trainChainRoot(outputHrid) : "";
    const depth = outputHrid ? planning.trainChainDepth(outputHrid) : -1;
    return {
      actionHrid,
      root: root && depth >= 0 ? root : `task:${index}`,
      depth: Math.max(0, depth),
      index,
    };
  });
  const groupOrder = new Map();
  for (const row of rows) {
    if (!groupOrder.has(row.root)) groupOrder.set(row.root, row.index);
  }
  return new Map(
    rows.map((row) => [
      row.actionHrid,
      { depth: row.depth, group: groupOrder.get(row.root) ?? row.index },
    ]),
  );
}

function assignStablePageSlots(cards, tasks) {
  const activeTaskIds = new Set(tasks.map(taskId).filter(Boolean));
  const knownSlotByTaskId = new Map(
    [...pageTaskIds].map(([slot, id]) => [id, slot]),
  );
  const replacementSlots = [...pendingResetSlots].filter((slot) => {
    const previousId = pageTaskIds.get(slot);
    return !previousId || !activeTaskIds.has(previousId);
  });
  const usedSlots = new Set();

  cards.forEach((card, index) => {
    const id = taskId(tasks[index]);
    const existingSlot = Number(card.dataset.mwitoolsOriginalIndex);
    let slot = Number.isInteger(existingSlot) ? existingSlot : undefined;
    if (slot === undefined && id) slot = knownSlotByTaskId.get(id);
    if (slot === undefined && replacementSlots.length) {
      slot = replacementSlots.shift();
    }
    if (slot === undefined || usedSlots.has(slot)) {
      slot = 0;
      while (usedSlots.has(slot)) slot += 1;
    }
    usedSlots.add(slot);
    const slotValue = String(slot);
    if (card.dataset.mwitoolsOriginalIndex !== slotValue) {
      card.dataset.mwitoolsOriginalIndex = slotValue;
    }
  });
}

function syncPageNewTasks(cards, tasks, enteredNewTaskPage) {
  if (!runtime.settings.settingsMap.taskNewBadge.isTrue) {
    pageNewTaskIds.clear();
    cards.forEach((card, index) => {
      const id = taskId(tasks[index]);
      if (!id) return;
      const slot = Number(card.dataset.mwitoolsOriginalIndex ?? index);
      const previousId = pageTaskIds.get(slot);
      if (previousId && previousId !== id) pendingResetSlots.delete(slot);
      pageTaskIds.set(slot, id);
      if (card.dataset.mwitoolsTaskId !== id) {
        card.dataset.mwitoolsTaskId = id;
      }
    });
    runtime.state.mwitoolsPageNewTaskIds = new Set();
    return false;
  }
  const previousNewTaskIds = new Set(pageNewTaskIds);
  const freshIds = new Set(runtime.api.getNewTaskIds?.() ?? []);
  const activeIds = new Set();
  cards.forEach((card, index) => {
    const id = taskId(tasks[index]);
    if (!id) return;
    const slot = Number(card.dataset.mwitoolsOriginalIndex ?? index);
    activeIds.add(id);
    const previousId = pageTaskIds.get(slot);
    const changed = previousId && previousId !== id;
    if (enteredNewTaskPage || !previousId) {
      if (freshIds.has(id)) pageNewTaskIds.add(id);
    } else if (changed) {
      if (pendingResetSlots.has(slot)) {
        if (pageClassifications.get(slot)?.state === "new") {
          pageNewTaskIds.add(id);
        }
      } else if (freshIds.has(id)) {
        pageNewTaskIds.add(id);
      }
      pendingResetSlots.delete(slot);
    } else if (freshIds.has(id)) {
      pageNewTaskIds.add(id);
    }
    pageTaskIds.set(slot, id);
    if (card.dataset.mwitoolsTaskId !== id) {
      card.dataset.mwitoolsTaskId = id;
    }
  });
  for (const id of [...pageNewTaskIds]) {
    if (!activeIds.has(id)) pageNewTaskIds.delete(id);
  }
  runtime.state.mwitoolsPageNewTaskIds = new Set(pageNewTaskIds);
  const activeFresh = [...freshIds].filter((id) => activeIds.has(id));
  if (activeFresh.length) runtime.api.acknowledgeNewTaskIds?.(activeFresh);
  return (
    previousNewTaskIds.size !== pageNewTaskIds.size ||
    [...pageNewTaskIds].some((id) => !previousNewTaskIds.has(id))
  );
}

function cleanupListDecorations({ restoreOrder = true } = {}) {
  if (!taskListParent?.isConnected) return;
  taskListParent
    .querySelectorAll(
      ":scope > .mwi-task-profession-group,:scope > .mwi-task-combat-location,:scope > .mwi-task-toolbar",
    )
    .forEach((group) => group.remove());
  taskListParent.parentElement
    ?.querySelectorAll(":scope > .mwi-task-combat-mode")
    .forEach((node) => node.remove());
  taskListParent
    .querySelectorAll(':scope > [data-mwitools-task-mirror="true"]')
    .forEach((node) => node.remove());
  if (!restoreOrder) return;
  taskListParent.parentElement
    ?.querySelector(":scope > .mwi-task-toolbar")
    ?.remove();
  taskListParent
    .querySelectorAll(`:scope > ${TASK_SELECTOR}`)
    .forEach((card) => {
      card.style.order = card.dataset.mwitoolsOriginalOrder ?? "";
      delete card.dataset.mwitoolsOriginalOrder;
      delete card.dataset.mwitoolsOriginalIndex;
      delete card.dataset.mwitoolsTaskIndex;
      delete card.dataset.mwitoolsTaskId;
      delete card.dataset.mwitoolsCollapsed;
      delete card.dataset.mwitoolsProfession;
      delete card.dataset.mwitoolsTaskState;
      delete card.dataset.mwitoolsDungeonHrids;
      delete card.dataset.mwitoolsFiltered;
      delete card.dataset.mwitoolsLocation;
      delete card.dataset.mwitoolsDungeonSource;
    });
}

function taskCardSnapshot(card, task) {
  const title = visibleTaskTitle(card);
  const cardText = String(
    runtime.api.getOriTextFromElement?.(card) ?? card.textContent ?? "",
  );
  return {
    actionHrid: taskActionHrid(task) ?? "",
    card,
    completed: isCompletedCard(card, task, cardText),
    progress:
      cardText.match(
        /(?:进度|progress)\s*[:：]\s*[\d,.\s\u00a0\u202f]+\s*\/\s*[\d,.\s\u00a0\u202f]+/i,
      )?.[0] ?? "",
    task,
    taskId: taskId(task),
    title,
  };
}

function orderedRows(cards, tasks, snapshots = null) {
  const chains = productionChains(tasks);
  const rows = cards.map((card, index) => {
    const task = tasks[index];
    const snapshot = snapshots?.[index] ?? taskCardSnapshot(card, task);
    const slot = Number(card.dataset.mwitoolsOriginalIndex ?? index);
    const completed = snapshot.completed;
    const isNew = pageNewTaskIds.has(taskId(task));
    const state = isNew ? "new" : completed ? "completed" : "normal";
    const profession = professionForCard(card, task, snapshot.title);
    const monsterHrid =
      profession.key === "combat"
        ? monsterHridForCard(card, task, snapshot.title)
        : "";
    const combatDetail =
      profession.key === "combat"
        ? combatDetailForCard(card, task, {
            title: snapshot.title,
            monsterHrid,
          })
        : null;
    const location =
      profession.key === "combat"
        ? combatLocationForCard(card, task, {
            detail: combatDetail,
            title: snapshot.title,
          })
        : null;
    const dungeonLocations =
      profession.key === "combat"
        ? dungeonLocationsForCard(card, task, {
            title: snapshot.title,
            monsterHrid,
          })
        : [];
    const monsterGroupKey =
      profession.key === "combat"
        ? monsterHrid || snapshot.actionHrid || `combat-slot-${slot}`
        : "";
    const artwork = runtime.settings.get("taskIcons")
      ? taskArtworkForCard(card, task, {
          title: snapshot.title,
          profession,
          monsterHrid,
        })
      : null;
    pageClassifications.set(slot, {
      completed,
      state,
      profession,
      location,
      dungeonLocations,
      monsterGroupKey,
      artwork,
    });
    const taskState = state;
    if (card.dataset.mwitoolsTaskState !== taskState) {
      card.dataset.mwitoolsTaskState = taskState;
    }
    if (card.dataset.mwitoolsProfession !== profession.key) {
      card.dataset.mwitoolsProfession = profession.key;
    }
    const dungeonHrids = dungeonLocations
      .filter(({ isDungeon, actionHrid }) => isDungeon && actionHrid)
      .map(({ actionHrid }) => actionHrid)
      .join(",");
    if (card.dataset.mwitoolsDungeonHrids !== dungeonHrids) {
      card.dataset.mwitoolsDungeonHrids = dungeonHrids;
    }
    return {
      card,
      task,
      slot,
      state,
      profession,
      location,
      dungeonLocations,
      monsterGroupKey,
      artwork,
      info: actionSortInfo(task, slot),
      depth: chains?.get(taskActionHrid(task))?.depth ?? 0,
      chain: chains?.get(taskActionHrid(task))?.group ?? index,
    };
  });
  const stateOrder = { new: 0, completed: 1, normal: 2 };
  const firstSlotByMonster = new Map();
  for (const row of rows) {
    if (row.profession.key !== "combat") continue;
    const key = row.monsterGroupKey || `combat-slot-${row.info.originalIndex}`;
    const current = firstSlotByMonster.get(key);
    if (current === undefined || row.info.originalIndex < current) {
      firstSlotByMonster.set(key, row.info.originalIndex);
    }
  }
  rows.sort((left, right) => {
    const taskStateOrder = stateOrder[left.state] - stateOrder[right.state];
    if (taskStateOrder) return taskStateOrder;
    const professionOrder = left.profession.order - right.profession.order;
    if (professionOrder) return professionOrder;
    if (left.profession.key === "combat") {
      const locationOrder =
        Number(left.location?.order ?? 99_999) -
        Number(right.location?.order ?? 99_999);
      if (locationOrder) return locationOrder;
      const leftKey =
        left.monsterGroupKey || `combat-slot-${left.info.originalIndex}`;
      const rightKey =
        right.monsterGroupKey || `combat-slot-${right.info.originalIndex}`;
      return (
        firstSlotByMonster.get(leftKey) - firstSlotByMonster.get(rightKey) ||
        left.info.originalIndex - right.info.originalIndex
      );
    }
    if (!chains) {
      return left.info.originalIndex - right.info.originalIndex;
    }
    if (!runtime.settings.get("taskAutoSort")) {
      return (
        left.chain - right.chain ||
        left.depth - right.depth ||
        left.info.originalIndex - right.info.originalIndex
      );
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

function updatePressedState(button, pressed) {
  const value = String(Boolean(pressed));
  if (button.getAttribute("aria-pressed") !== value) {
    button.setAttribute("aria-pressed", value);
  }
}

function createTaskFilterButton({
  kind,
  value,
  label,
  iconKind = "",
  iconHrid = "",
  fallback = "•",
  showLabel = false,
  showCount = true,
  onClick,
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mwi-task-filter";
  button.dataset.filterKind = kind;
  button.dataset.filterValue = value;
  button.dataset.iconKind = iconKind;
  button.dataset.iconHrid = iconHrid;
  button.dataset.iconFallback = fallback;
  button.title = label;
  button.setAttribute("aria-label", label);
  const icon = document.createElement("span");
  icon.className = "mwi-task-filter-icon";
  const count = document.createElement("span");
  count.className = "mwi-task-filter-count";
  button.append(icon);
  if (showLabel) {
    const text = document.createElement("span");
    text.className = "mwi-task-filter-label";
    text.textContent = label;
    button.append(text);
  }
  if (showCount) button.append(count);
  button.addEventListener("click", onClick);
  return button;
}

function updateTaskFilterIcon(button) {
  const icon = button.querySelector(".mwi-task-filter-icon");
  if (!icon) return;
  const href = button.dataset.iconKind
    ? taskSpriteHref(button.dataset.iconKind, button.dataset.iconHrid)
    : "";
  const signature = href || `fallback:${button.dataset.iconFallback}`;
  if (icon.dataset.signature === signature) return;
  icon.dataset.signature = signature;
  icon.replaceChildren();
  if (!href) {
    icon.textContent = button.dataset.iconFallback || "•";
    return;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", href);
  svg.append(use);
  icon.append(svg);
}

function updateTaskFilterButton(button, { label, count, pressed }) {
  updatePressedState(button, pressed);
  const countText = String(count);
  const countNode = button.querySelector(".mwi-task-filter-count");
  if (countNode?.textContent !== countText) countNode.textContent = countText;
  const title = `${label} (${countText})`;
  if (button.title !== title) button.title = title;
  if (button.getAttribute("aria-label") !== title) {
    button.setAttribute("aria-label", title);
  }
  updateTaskFilterIcon(button);
}

function applyTaskFilters(rows) {
  const statisticsEnabled = runtime.settings.get("taskStatistics");
  const hasActiveFilters = hasActiveTaskFilters();
  for (const row of rows) {
    let visible = true;
    if (statisticsEnabled && hasActiveFilters) {
      const professionMatches = activeProfessionFilters.has(row.profession.key);
      const combatMatches =
        combatFilterEnabled && row.profession.key === "combat";
      const dungeonMatches =
        row.profession.key === "combat" &&
        row.dungeonLocations.some(
          ({ isDungeon, actionHrid }) =>
            isDungeon && activeDungeonFilters.has(actionHrid),
        );
      visible = professionMatches || combatMatches || dungeonMatches;
    }
    const filtered = String(!visible);
    if (row.card.dataset.mwitoolsFiltered !== filtered) {
      row.card.dataset.mwitoolsFiltered = filtered;
    }
  }
}

function ensureTaskToolbar(rows) {
  if (!taskListParent?.isConnected) return;
  const statisticsEnabled = runtime.settings.get("taskStatistics");
  const signature = [runtime.config.isZH, statisticsEnabled].join(":");
  let toolbar = taskListParent.parentElement?.querySelector(
    ":scope > .mwi-task-toolbar",
  );
  if (toolbar?.dataset.signature !== signature) {
    toolbar?.remove();
    toolbar = document.createElement("div");
    toolbar.className = "mwi-task-toolbar";
    toolbar.dataset.signature = signature;
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute(
      "aria-label",
      t("任务排序与筛选", "Task sorting and filters"),
    );

    if (statisticsEnabled) {
      const controls = document.createElement("div");
      controls.className = "mwi-task-toolbar-controls";
      controls.append(
        createTaskFilterButton({
          kind: "reset",
          value: "reset",
          label: t("重置筛选", "Reset filters"),
          fallback: "↺",
          showLabel: true,
          showCount: false,
          onClick: () => {
            resetTaskFilters();
            lastTaskRenderSignature = "";
            renderTasks();
          },
        }),
      );
      toolbar.append(controls);

      const filterGroups = document.createElement("div");
      filterGroups.className = "mwi-task-filter-groups";
      const lifeFilters = document.createElement("div");
      lifeFilters.className =
        "mwi-task-filter-group mwi-task-filter-group--life";
      for (const profession of LIFE_PROFESSIONS) {
        lifeFilters.append(
          createTaskFilterButton({
            kind: "profession",
            value: profession.key,
            label: runtime.config.isZH ? profession.zh : profession.en,
            iconKind: "skills",
            iconHrid: profession.key,
            fallback: (runtime.config.isZH ? profession.zh : profession.en)[0],
            onClick: () => {
              if (activeProfessionFilters.has(profession.key)) {
                activeProfessionFilters.delete(profession.key);
              } else {
                activeProfessionFilters.add(profession.key);
              }
              lastTaskRenderSignature = "";
              renderTasks();
            },
          }),
        );
      }
      filterGroups.append(lifeFilters);

      const combatFilters = document.createElement("div");
      combatFilters.className =
        "mwi-task-filter-group mwi-task-filter-group--combat";
      combatFilters.append(
        createTaskFilterButton({
          kind: "combat",
          value: "combat",
          label: t("战斗", "Combat"),
          iconKind: "misc",
          iconHrid: "combat",
          fallback: "⚔",
          onClick: () => {
            combatFilterEnabled = !combatFilterEnabled;
            lastTaskRenderSignature = "";
            renderTasks();
          },
        }),
      );

      const dungeons = document.createElement("div");
      dungeons.className = "mwi-task-dungeon-filters";
      for (const dungeon of DUNGEON_FILTERS) {
        dungeons.append(
          createTaskFilterButton({
            kind: "dungeon",
            value: dungeon.actionHrid,
            label: runtime.config.isZH ? dungeon.zh : dungeon.en,
            iconKind: "actions",
            iconHrid: dungeon.actionHrid,
            fallback: "◆",
            onClick: () => {
              if (activeDungeonFilters.has(dungeon.actionHrid)) {
                activeDungeonFilters.delete(dungeon.actionHrid);
              } else {
                activeDungeonFilters.add(dungeon.actionHrid);
              }
              lastTaskRenderSignature = "";
              renderTasks();
            },
          }),
        );
      }
      combatFilters.append(dungeons);
      filterGroups.append(combatFilters);
      toolbar.append(filterGroups);
    }

    const sortButton = document.createElement("button");
    sortButton.type = "button";
    sortButton.className = "mwi-task-sort-button";
    sortButton.title = t("重新排序任务", "Sort tasks again");
    sortButton.setAttribute("aria-label", sortButton.title);
    const sortIcon = document.createElement("span");
    sortIcon.className = "mwi-task-filter-icon";
    sortIcon.textContent = "↕";
    const sortLabel = document.createElement("span");
    sortLabel.className = "mwi-task-filter-label";
    sortLabel.textContent = t("任务排序", "Sort tasks");
    sortButton.append(sortIcon, sortLabel);
    sortButton.addEventListener("click", () => sortTasks());
    const controls =
      toolbar.querySelector(":scope > .mwi-task-toolbar-controls") ?? toolbar;
    controls.append(sortButton);
    taskListParent.insertAdjacentElement("beforebegin", toolbar);
  }

  if (!statisticsEnabled) return;
  const professionCounts = new Map(LIFE_PROFESSIONS.map(({ key }) => [key, 0]));
  const dungeonCounts = new Map(
    DUNGEON_FILTERS.map(({ actionHrid }) => [actionHrid, 0]),
  );
  let combatCount = 0;
  for (const row of rows) {
    if (professionCounts.has(row.profession.key)) {
      professionCounts.set(
        row.profession.key,
        professionCounts.get(row.profession.key) + 1,
      );
    }
    if (row.profession.key !== "combat") continue;
    combatCount += 1;
    for (const { isDungeon, actionHrid } of row.dungeonLocations) {
      if (isDungeon && dungeonCounts.has(actionHrid)) {
        dungeonCounts.set(actionHrid, dungeonCounts.get(actionHrid) + 1);
      }
    }
  }
  const resetButton = toolbar.querySelector('[data-filter-kind="reset"]');
  resetButton.disabled = !hasActiveTaskFilters();
  resetButton.title = t("清除全部任务筛选", "Clear all task filters");
  resetButton.setAttribute("aria-label", resetButton.title);
  for (const profession of LIFE_PROFESSIONS) {
    const button = toolbar.querySelector(
      `[data-filter-kind="profession"][data-filter-value="${profession.key}"]`,
    );
    updateTaskFilterButton(button, {
      label: runtime.config.isZH ? profession.zh : profession.en,
      count: professionCounts.get(profession.key),
      pressed: activeProfessionFilters.has(profession.key),
    });
  }
  updateTaskFilterButton(toolbar.querySelector('[data-filter-kind="combat"]'), {
    label: t("战斗", "Combat"),
    count: combatCount,
    pressed: combatFilterEnabled,
  });
  for (const dungeon of DUNGEON_FILTERS) {
    const button = toolbar.querySelector(
      `[data-filter-kind="dungeon"][data-filter-value="${dungeon.actionHrid}"]`,
    );
    updateTaskFilterButton(button, {
      label: runtime.config.isZH ? dungeon.zh : dungeon.en,
      count: dungeonCounts.get(dungeon.actionHrid),
      pressed: activeDungeonFilters.has(dungeon.actionHrid),
    });
  }
}

function applyExplicitSort(rows) {
  rows.forEach((row, index) => {
    const order = index + 1;
    const value = String(order);
    if (row.card.style.order !== value) row.card.style.order = value;
    pageOrderBySlot.set(row.slot, order);
  });
}

function restoreStableOrders(rows) {
  let nextOrder = Math.max(0, ...pageOrderBySlot.values()) + 1;
  for (const row of rows) {
    let order = pageOrderBySlot.get(row.slot);
    if (!Number.isFinite(order)) {
      const current = Number(row.card.style.order);
      order =
        row.card.style.order && Number.isFinite(current)
          ? current
          : nextOrder++;
      pageOrderBySlot.set(row.slot, order);
    }
    const value = String(order);
    if (row.card.style.order !== value) row.card.style.order = value;
  }
}

function renderFlatTaskList(rows, { sort = false } = {}) {
  if (!taskListParent) return;
  cleanupListDecorations({ restoreOrder: false });
  if (sort) applyExplicitSort(rows);
  else restoreStableOrders(rows);
  ensureTaskToolbar(rows);
  applyTaskFilters(rows);
  return rows;
}

function isMergeNavigationButton(candidate) {
  return matchesGameTranslations(
    ["randomTask.go", "questModal.go"],
    candidate?.textContent,
    { fallbackPatterns: [/^(?:go|前往|开始)$/i] },
  );
}

function liveTaskForCard(card, tasks) {
  const parent = card?.parentElement;
  if (!parent) return null;
  const cards = [...document.querySelectorAll(TASK_SELECTOR)].filter(
    (candidate) => candidate.parentElement === parent,
  );
  return (
    resolveTaskCards(cards, tasks, {
      taskActionHrid,
      taskRemaining,
    }).find((entry) => entry.card === card)?.task ?? null
  );
}

function wireMergeButtons(cards) {
  cards.forEach((card) => {
    if (card[MERGE_HANDLER]) return;
    if (![...card.querySelectorAll("button")].some(isMergeNavigationButton)) {
      return;
    }
    const handler = (event) => {
      const button = event.target?.closest?.("button");
      if (
        !button ||
        !card.contains(button) ||
        !isMergeNavigationButton(button) ||
        !runtime.settings.get("taskMergeActions")
      ) {
        return;
      }
      const tasks = runtime.state.characterQuests ?? [];
      const currentTask = liveTaskForCard(card, tasks);
      const actionHrid = taskActionHrid(currentTask);
      if (!actionHrid) return;
      const matching = tasks.filter(
        (task) => taskActionHrid(task) === actionHrid,
      );
      if (!matching.length) return;
      runtime.state.pendingMergedTask = {
        actionHrid,
        count: matching.reduce((sum, task) => sum + taskRemaining(task), 0),
        taskCount: matching.length,
      };
    };
    card[MERGE_HANDLER] = handler;
    card.dataset.mwitoolsMergeWired = "true";
    card.addEventListener("click", handler, true);
  });
}

function wireResetButtons(cards) {
  cards.forEach((card, index) => {
    if (card.dataset.mwitoolsResetWired) return;
    const isResetButton = (candidate) =>
      matchesGameTranslations("randomTask.reroll", candidate.textContent, {
        fallbackPatterns: [/^(?:reset|重置)$/i],
      });
    const hasResetButton = [...card.querySelectorAll("button")].some(
      isResetButton,
    );
    if (!hasResetButton) return;
    card.dataset.mwitoolsResetWired = "true";
    card.addEventListener(
      "click",
      (event) => {
        const button = event.target?.closest?.("button");
        if (!button || !card.contains(button) || !isResetButton(button)) {
          return;
        }
        nativeResetChoiceUntil = Date.now() + 10_000;
        const slot = Number(card.dataset.mwitoolsOriginalIndex ?? index);
        pendingResetSlots.add(slot);
        const timeout = setTimeout(
          () => pendingResetSlots.delete(slot),
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
  const actionHrid =
    resolveLocalizedEntity("action", name) ||
    runtime.api.getActionHridFromItemName?.(name);
  if (actionHrid !== pending.actionHrid) return;
  runtime.api.reactInputTriggerHack?.(input, pending.count);
  document
    .querySelectorAll(".mwi-task-merged-note,.mwi-task-merge-toast")
    .forEach((node) => node.remove());
  const toast = document.createElement("div");
  toast.className = "mwi-task-merge-toast";
  toast.setAttribute("role", "status");
  toast.textContent = t(
    `已合并 ${pending.taskCount} 个同动作任务，共 ${runtime.api.formatExactNumber(pending.count)} 次。`,
    `Merged ${pending.taskCount} matching tasks for ${runtime.api.formatExactNumber(pending.count)} actions.`,
  );
  document.body.append(toast);
  const timeout = setTimeout(() => toast.remove(), 3200);
  timeout?.unref?.();
  runtime.state.pendingMergedTask = null;
}

export function shouldRenderTaskMutations(records, now = Date.now()) {
  if (now < nativeResetChoiceUntil) return false;
  const removedBackground = records.some((record) => {
    const target =
      record.target?.nodeType === 1
        ? record.target
        : record.target?.parentElement;
    return (
      target?.isConnected &&
      target?.closest?.(TASK_SELECTOR) &&
      [...(record.removedNodes ?? [])].some(
        (node) => node?.nodeType === 1 && node.matches?.(".mwi-task-bg"),
      )
    );
  });
  const addedBackground = records.some((record) =>
    [...(record.addedNodes ?? [])].some(
      (node) => node?.nodeType === 1 && node.matches?.(".mwi-task-bg"),
    ),
  );
  if (removedBackground && !addedBackground) return true;
  return records.some((record) => {
    const target =
      record.target?.nodeType === 1
        ? record.target
        : record.target?.parentElement;
    if (target?.closest?.(OWNED_TASK_SELECTOR)) return false;
    const changedNodes = [
      ...(record.addedNodes ?? []),
      ...(record.removedNodes ?? []),
    ].filter((node) => node?.nodeType === 1);
    if (
      changedNodes.length &&
      changedNodes.every(
        (node) =>
          node.matches?.(OWNED_TASK_SELECTOR) ||
          node.closest?.(OWNED_TASK_SELECTOR),
      )
    ) {
      return false;
    }
    if (target?.closest?.('[class*="TasksPanel_taskList"]')) return true;
    return changedNodes.some(
      (node) =>
        node.matches?.('[class*="TasksPanel_taskList"]') ||
        node.querySelector?.('[class*="TasksPanel_taskList"]'),
    );
  });
}

function taskRenderSignature(snapshots) {
  const settings = [
    runtime.config.isZH,
    runtime.settings.get("taskAutoSort"),
    runtime.settings.get("taskIcons"),
    runtime.settings.get("taskStatistics"),
    [...pageNewTaskIds].sort().join(","),
    [...activeProfessionFilters].sort().join(","),
    combatFilterEnabled,
    [...activeDungeonFilters].sort().join(","),
  ];
  const rows = snapshots.map((snapshot) => {
    return [
      snapshot.actionHrid,
      snapshot.title,
      snapshot.progress,
      snapshot.completed ? "1" : "0",
      snapshot.taskId,
    ].join("\u001f");
  });
  return [...settings, ...rows].join("\u001e");
}

function renderTasks({ forceSort = false, allowReusedPositional = true } = {}) {
  let cards = [...document.querySelectorAll(TASK_SELECTOR)];
  if (!cards.length) {
    applyPendingMerge();
    document
      .querySelectorAll(".mwi-task-toolbar")
      .forEach((node) => node.remove());
    if (taskListParent && !taskListParent.isConnected) {
      originalCards = [];
      taskListParent = null;
      lastRenderedCards = [];
      lastTaskRenderSignature = "";
      lastActionDetails = null;
      lastActionCategories = null;
      if (!hasTemporaryTaskReturn() && !pendingResetSlots.size) {
        pageClassifications = new Map();
        pageTaskIds = new Map();
        pageNewTaskIds = new Set();
        pendingResetSlots = new Set();
        pageOrderBySlot = new Map();
        runtime.state.mwitoolsPageNewTaskIds = new Set();
      }
    }
    return true;
  }
  const observedParent = cards[0]?.parentElement ?? null;
  const enteredNewTaskPage =
    !taskListParent?.isConnected ||
    (observedParent && observedParent !== taskListParent);
  const resumedTaskPage = enteredNewTaskPage && consumeTemporaryTaskReturn();
  const resumedResetPage = enteredNewTaskPage && pendingResetSlots.size > 0;
  const sortOnEntry = enteredNewTaskPage && !resumedResetPage;
  if (enteredNewTaskPage) {
    cleanupListDecorations({ restoreOrder: false });
    document
      .querySelectorAll(".mwi-task-toolbar")
      .forEach((node) => node.remove());
    originalCards = [];
    if (!resumedTaskPage && !resumedResetPage) {
      pageClassifications = new Map();
      pageTaskIds = new Map();
      pageNewTaskIds = new Set();
      pendingResetSlots = new Set();
    }
    if (!resumedResetPage) {
      pageOrderBySlot = new Map();
      resetTaskFilters();
    }
    taskListParent = observedParent;
  }
  cards = cards.filter(
    (card) => card.parentElement === taskListParent && isQuestTaskCard(card),
  );
  if (!cards.length) {
    document
      .querySelectorAll(".mwi-task-toolbar")
      .forEach((node) => node.remove());
    lastRenderedCards = [];
    lastTaskRenderSignature = "";
    applyPendingMerge();
    return true;
  }
  const tasks = runtime.state.characterQuests ?? [];
  const cardEntries = resolveTaskCards(cards, tasks, {
    taskActionHrid,
    taskRemaining,
    allowReusedPositional,
  });
  if (cardEntries.some((entry) => !entry.resolved)) return false;
  const cardTasks = cardEntries.map(({ task }) => task);
  assignStablePageSlots(cards, cardTasks);
  const newTaskSetChanged = syncPageNewTasks(
    cards,
    cardTasks,
    enteredNewTaskPage && !resumedTaskPage && !resumedResetPage,
  );
  const snapshots = cards.map((card, index) =>
    taskCardSnapshot(card, cardTasks[index]),
  );
  const signature = taskRenderSignature(snapshots);
  const sameCards =
    cards.length === lastRenderedCards.length &&
    cards.every((card, index) => card === lastRenderedCards[index]);
  const actionDetails = runtime.state.initData_actionDetailMap;
  const actionCategories = runtime.state.initData_actionCategoryDetailMap;
  if (
    !enteredNewTaskPage &&
    !forceSort &&
    sameCards &&
    actionDetails === lastActionDetails &&
    actionCategories === lastActionCategories &&
    signature === lastTaskRenderSignature &&
    cardEntries.every(({ card, task }) => taskIconMatches(card, task))
  ) {
    applyPendingMerge();
    return true;
  }

  originalCards = [...cards];
  originalCards.forEach((card, index) => {
    if (!("mwitoolsOriginalOrder" in card.dataset))
      card.dataset.mwitoolsOriginalOrder = card.style.order;
    const taskIndex = String(cardEntries[index]?.taskIndex ?? -1);
    if (card.dataset.mwitoolsTaskIndex !== taskIndex) {
      card.dataset.mwitoolsTaskIndex = taskIndex;
    }
    if ("mwitoolsLocation" in card.dataset) {
      delete card.dataset.mwitoolsLocation;
    }
  });
  if (runtime.settings.get("taskIcons")) scanTaskSpriteBases();
  const rows = orderedRows(cards, cardTasks, snapshots);
  rows.forEach((row) => decorateCard(row.card, row.task, row.artwork));
  wireMergeButtons(cards);
  wireResetButtons(cards);
  renderFlatTaskList(rows, {
    sort: forceSort || sortOnEntry || newTaskSetChanged,
  });
  applyPendingMerge();
  lastRenderedCards = [...cards];
  lastActionDetails = actionDetails;
  lastActionCategories = actionCategories;
  lastTaskRenderSignature = signature;
  return true;
}

function sortTasks() {
  lastTaskRenderSignature = "";
  renderTasks({ forceSort: true });
}

function cleanupTasks() {
  cleanupListDecorations();
  document
    .querySelectorAll(
      ".mwi-task-insight,.mwi-task-toolbar,.mwi-task-profession-group,.mwi-task-bg,.mwi-task-merged-note,.mwi-task-merge-toast",
    )
    .forEach((node) => node.remove());
  document.querySelectorAll("[data-mwitools-merge-wired]").forEach((node) => {
    const handler = node[MERGE_HANDLER];
    if (handler) node.removeEventListener("click", handler, true);
    delete node[MERGE_HANDLER];
    delete node.dataset.mwitoolsMergeWired;
  });
  document.querySelectorAll("[data-mwitools-reset-wired]").forEach((node) => {
    delete node.dataset.mwitoolsResetWired;
  });
  document.getElementById(STYLE_ID)?.remove();
  originalCards = [];
  taskListParent = null;
  pageClassifications = new Map();
  pageTaskIds = new Map();
  pageNewTaskIds = new Set();
  pendingResetSlots = new Set();
  nativeResetChoiceUntil = 0;
  temporaryTaskReturn = null;
  runtime.state.mwitoolsPageNewTaskIds = new Set();
  lastRenderedCards = [];
  lastTaskRenderSignature = "";
  lastActionDetails = null;
  lastActionCategories = null;
  pageOrderBySlot = new Map();
  resetTaskFilters();
}

runtime.features.register({
  id: "taskInsights",
  setting: "taskInsights",
  scope: "character",
  initialize({ scope }) {
    addStyles();
    let active = true;
    let settleRetries = 0;
    let renderScheduler = null;
    const render = () => {
      const settled = renderTasks({
        allowReusedPositional: false,
      });
      if (!settled && settleRetries < 3) {
        settleRetries += 1;
        renderScheduler.schedule();
      } else {
        settleRetries = 0;
      }
    };
    renderScheduler = createFrameScheduler(render);
    const scheduleRender = () => renderScheduler.schedule();
    render();
    void loadTaskSpriteManifest().then(() => {
      if (!active) return;
      lastTaskRenderSignature = "";
      scheduleRender();
    });
    const observer = new MutationObserver((records) => {
      if (shouldRenderTaskMutations(records)) scheduleRender();
    });
    scope.observer(observer, document.body, {
      childList: true,
      subtree: true,
    });
    scope.add(
      runtime.onMessage("quests_updated", () => {
        nativeResetChoiceUntil = 0;
        scheduleRender();
      }),
    );
    scope.add(() => {
      active = false;
      renderScheduler.cancel();
      cleanupTasks();
    });
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
  armTemporaryTaskReturn,
  cancelTemporaryTaskReturn,
  resumeTemporaryTaskReturn,
  taskActionHrid,
  taskRemaining,
  taskProjection,
  renderTasks,
  sortTasks,
  restoreTaskOrder: sortTasks,
});
