import { runtime } from "../core/runtime.js";
import "../core/train-planning.js";
import {
  resolveTaskCards,
  taskCardTaskId,
} from "../core/task-card-resolution.js";

const STYLE_ID = "mwitools-task-style";
const TASK_SELECTOR =
  'div[class*="RandomTask_randomTask"]:not([data-mwitools-task-mirror="true"])';
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
let combatGroupMode = "planet";
let taskSpriteManifestPromise = null;
const taskSpriteBases = new Map();
const collapsedProfessions = new Set();
const collapsedDungeonGroups = new Set();

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
    [class*="RandomTask_randomTask"] { min-width:0 !important; }
    [class*="RandomTask_randomTask"] > [class*="RandomTask_content"] { gap:2px !important; padding:8px !important; font-size:.8125rem; }
    [class*="RandomTask_randomTask"] [class*="RandomTask_taskInfo"] { gap:2px !important; }
    [class*="RandomTask_randomTask"] [class*="RandomTask_buttonsContainer"] { margin-top:2px !important; }
    .mwi-task-profession-group { --mwi-task-group-accent:120,174,255; grid-column:1/-1; min-width:0; }
    .mwi-task-profession-group[data-profession="new"] { --mwi-task-group-accent:230,181,79; }
    .mwi-task-profession-group[data-profession="completed"] { --mwi-task-group-accent:90,200,149; }
    .mwi-task-profession-group[data-profession="combat"] { --mwi-task-group-accent:238,115,103; }
    .mwi-task-profession-header { display:flex; width:100%; min-height:32px; box-sizing:border-box; align-items:center; gap:7px; padding:5px 9px; border:0; border-left:3px solid rgba(var(--mwi-task-group-accent),.78); border-radius:0; background:transparent; color:var(--color-text-primary,#eee); font:inherit; text-align:left; cursor:pointer; }
    .mwi-task-profession-header:hover { background:rgba(var(--mwi-task-group-accent),.075); }
    .mwi-task-profession-header:focus-visible { outline:2px solid rgba(var(--mwi-task-group-accent),.72); outline-offset:-3px; }
    .mwi-task-profession-title { font-weight:650; }
    .mwi-task-profession-count { min-width:1.25rem; padding:0; border:0; background:transparent; color:rgba(var(--mwi-task-group-accent),.95); font-size:.68rem; font-weight:700; text-align:center; }
    .mwi-task-profession-chevron { margin-left:auto; color:rgba(var(--mwi-task-group-accent),.9); transition:transform .15s ease; }
    .mwi-task-profession-header[aria-expanded="false"] .mwi-task-profession-chevron { transform:rotate(-90deg); }
    .mwi-task-profession-body { display:none; }
    .mwi-task-combat-location { grid-column:1/-1; min-width:0; }
    .mwi-task-combat-location-title { margin:0 0 6px; padding:4px 8px; border-left:2px solid rgba(255,255,255,.22); color:var(--color-text-secondary,#bbb); font-size:.7rem; font-weight:600; }
    .mwi-task-combat-location-body { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,270px),1fr)); gap:8px; min-width:0; }
    .mwi-task-dungeon-header { display:flex; width:100%; align-items:center; gap:8px; margin:0 0 6px; padding:5px 8px; border:0; border-left:2px solid rgba(183,126,255,.78); border-radius:0; background:transparent; color:var(--color-text-secondary,#bbb); font:inherit; font-size:.7rem; font-weight:650; text-align:left; cursor:pointer; }
    .mwi-task-dungeon-header:hover { background:rgba(183,126,255,.07); }
    .mwi-task-dungeon-header:focus-visible { outline:2px solid rgba(183,126,255,.62); outline-offset:-3px; }
    .mwi-task-dungeon-header span:last-child { margin-left:auto; transition:transform .15s ease; }
    .mwi-task-dungeon-header[aria-expanded="false"] span:last-child { transform:rotate(-90deg); }
    .mwi-task-dungeon-body { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,270px),1fr)); gap:8px; min-width:0; }
    .mwi-task-combat-mode { display:flex; width:max-content; gap:2px; margin:4px 0 8px; padding:2px; border:1px solid rgba(255,255,255,.12); border-radius:6px; background:rgba(0,0,0,.18); }
    .mwi-task-combat-mode button { padding:3px 10px; border:0; border-radius:4px; background:transparent; color:var(--color-text-secondary,#bbb); font:inherit; font-size:.7rem; cursor:pointer; }
    .mwi-task-combat-mode button[aria-pressed="true"] { background:${runtime.config.SCRIPT_COLOR_MAIN}; color:#18130a; font-weight:700; }
    ${TASK_SELECTOR}[data-mwitools-collapsed="true"] { display:none !important; }
    ${TASK_SELECTOR}[data-mwitools-dungeon-source="true"] { display:none !important; }
    .mwi-task-bg { position:absolute; z-index:0; top:6%; left:68%; width:24%; height:88%; opacity:.3; pointer-events:none; }
    .mwi-task-bg.mwi-task-bg--monster { left:42%; }
    .mwi-task-bg.mwi-task-bg--dungeon { left:68%; }
    .mwi-task-bg svg { width:100%; height:100%; }
    ${TASK_SELECTOR} > :not(.mwi-task-bg),[data-mwitools-task-mirror="true"] > :not(.mwi-task-bg) { position:relative; z-index:1; }
    [data-mwitools-task-mirror="true"] { position:relative; }
    .mwi-task-merge-toast { position:fixed; top:56px; right:14px; z-index:2147483200; max-width:min(360px,calc(100vw - 28px)); box-sizing:border-box; padding:8px 11px; border:1px solid rgba(102,205,135,.5); border-radius:6px; background:rgba(15,24,20,.97); box-shadow:0 8px 22px rgba(0,0,0,.4); color:#a8e5b7; font-size:.75rem; line-height:1.35; animation:mwi-task-toast-in .16s ease-out; }
    @keyframes mwi-task-toast-in { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
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

function namedMonsterHridForCard(card) {
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

function monsterHridForCard(card, task) {
  // The rendered title is the task's authoritative target. Action HRIDs may
  // identify a whole zone or dungeon and must not be treated as monster IDs.
  const named = namedMonsterHridForCard(card);
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

function addDungeonArtwork(card, location) {
  card.querySelector(":scope > .mwi-task-bg--dungeon")?.remove();
  const monster = card.querySelector(":scope > .mwi-task-bg");
  monster?.classList.remove("mwi-task-bg--monster");
  const actionHrid = location?.isDungeon ? location.actionHrid : "";
  if (!actionHrid) return;
  const href = taskSpriteHref("actions", actionHrid);
  if (!href) return;
  monster?.classList.add("mwi-task-bg--monster");
  const background = document.createElement("div");
  background.className = "mwi-task-bg mwi-task-bg--dungeon";
  background.dataset.spriteHref = href;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", href);
  svg.append(use);
  background.append(svg);
  card.append(background);
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
      label: name ? `${t("地牢", "Dungeon")} · ${name}` : t("地牢", "Dungeon"),
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

export function dungeonLocationsForCard(card, task) {
  const actionHrid = taskActionHrid(task);
  const taskDetail = runtime.state.initData_actionDetailMap?.[actionHrid];
  if (taskDetail?.combatZoneInfo?.isDungeon) {
    return [dungeonLocation(taskDetail)];
  }
  const monsterHrid = monsterHridForCard(card, task);
  if (!monsterHrid) return [nonDungeonLocation()];
  const actionDetails = runtime.state.initData_actionDetailMap ?? {};
  const matchingDungeonHrids = new Set(
    Object.values(actionDetails)
      .filter(
        (detail) =>
          detail?.combatZoneInfo?.isDungeon &&
          JSON.stringify(detail.combatZoneInfo?.fightInfo ?? {}).includes(
            `"${monsterHrid}"`,
          ),
      )
      .map((detail) => detail.hrid),
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
    const pressed = String(button.dataset.mode === combatGroupMode);
    if (button.getAttribute("aria-pressed") !== pressed) {
      button.setAttribute("aria-pressed", pressed);
    }
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
      delete card.dataset.mwitoolsTaskIndex;
      delete card.dataset.mwitoolsTaskId;
      delete card.dataset.mwitoolsCollapsed;
      delete card.dataset.mwitoolsProfession;
      delete card.dataset.mwitoolsLocation;
      delete card.dataset.mwitoolsDungeonSource;
      delete card.dataset.mwitoolsTaskId;
    });
}

function orderedRows(cards, tasks) {
  const chains = productionChains(tasks);
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
    const computedMonsterGroupKey =
      profession.key === "combat"
        ? monsterHridForCard(card, task) ||
          taskActionHrid(task) ||
          `combat-slot-${slot}`
        : "";
    const monsterGroupKey =
      profession.key === "combat" &&
      !completed &&
      previous?.profession.key === "combat"
        ? (previous.monsterGroupKey ?? computedMonsterGroupKey)
        : computedMonsterGroupKey;
    pageClassifications.set(slot, {
      completed,
      profession,
      location,
      dungeonLocations,
      monsterGroupKey,
    });
    return {
      card,
      task,
      profession,
      location,
      dungeonLocations,
      monsterGroupKey,
      info: actionSortInfo(task, slot),
      depth: chains?.get(taskActionHrid(task))?.depth ?? 0,
      chain: chains?.get(taskActionHrid(task))?.group ?? index,
    };
  });
  rows.sort((left, right) => {
    const professionOrder = left.profession.order - right.profession.order;
    if (professionOrder) return professionOrder;
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

function mirrorTaskCard(source, location) {
  const mirror = source.cloneNode(true);
  mirror.dataset.mwitoolsTaskMirror = "true";
  mirror.removeAttribute("id");
  mirror.style.order = "";
  mirror.style.display = "";
  delete mirror.dataset.mwitoolsDungeonSource;
  delete mirror.dataset.mwitoolsCollapsed;
  addDungeonArtwork(mirror, location);
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

function groupMatchingMonsters(rows) {
  const firstSlotByMonster = new Map();
  for (const row of rows) {
    const key = row.monsterGroupKey || `combat-slot-${row.info.originalIndex}`;
    const current = firstSlotByMonster.get(key);
    if (current === undefined || row.info.originalIndex < current) {
      firstSlotByMonster.set(key, row.info.originalIndex);
    }
  }
  return [...rows].sort((left, right) => {
    const leftKey =
      left.monsterGroupKey || `combat-slot-${left.info.originalIndex}`;
    const rightKey =
      right.monsterGroupKey || `combat-slot-${right.info.originalIndex}`;
    return (
      firstSlotByMonster.get(leftKey) - firstSlotByMonster.get(rightKey) ||
      left.info.originalIndex - right.info.originalIndex
    );
  });
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
  for (const { location, rows: unsortedLocationRows } of orderedLocations) {
    const locationRows = groupMatchingMonsters(unsortedLocationRows);
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
      ...locationRows.map(({ card }) => mirrorTaskCard(card, location)),
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
  for (const { location, rows: unsortedLocationRows } of orderedLocations) {
    const locationRows = groupMatchingMonsters(unsortedLocationRows);
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
    const hasResetButton = [...card.querySelectorAll("button")].some(
      (candidate) => /reset|重置/i.test(candidate.textContent),
    );
    if (!hasResetButton) return;
    card.dataset.mwitoolsResetWired = "true";
    card.addEventListener(
      "click",
      (event) => {
        const button = event.target?.closest?.("button");
        if (
          !button ||
          !card.contains(button) ||
          !/reset|重置/i.test(button.textContent)
        ) {
          return;
        }
        nativeResetChoiceUntil = Date.now() + 10_000;
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
  return records.some((record) => {
    const target =
      record.target?.nodeType === 1
        ? record.target
        : record.target?.parentElement;
    if (target?.closest?.('[class*="TasksPanel_taskList"]')) return true;
    return [...(record.addedNodes ?? []), ...(record.removedNodes ?? [])]
      .filter((node) => node?.nodeType === 1)
      .some(
        (node) =>
          node.matches?.('[class*="TasksPanel_taskList"]') ||
          node.querySelector?.('[class*="TasksPanel_taskList"]'),
      );
  });
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
      if (!hasTemporaryTaskReturn()) {
        pageClassifications = new Map();
        pageTaskIds = new Map();
        pageNewTaskIds = new Set();
        pendingResetSlots = new Set();
        runtime.state.mwitoolsPageNewTaskIds = new Set();
      }
    }
    return;
  }
  const observedParent = cards[0]?.parentElement ?? null;
  const enteredNewTaskPage =
    !taskListParent?.isConnected ||
    (observedParent && observedParent !== taskListParent);
  const resumedTaskPage = enteredNewTaskPage && consumeTemporaryTaskReturn();
  if (enteredNewTaskPage) {
    ungroupCards();
    originalCards = [];
    if (!resumedTaskPage) {
      pageClassifications = new Map();
      pageTaskIds = new Map();
      pageNewTaskIds = new Set();
      pendingResetSlots = new Set();
    }
    combatGroupMode = readCombatGroupMode();
    taskListParent = observedParent;
  }
  cards = cards.filter((card) => card.parentElement === taskListParent);
  const tasks = runtime.state.characterQuests ?? [];
  const cardEntries = resolveTaskCards(cards, tasks, {
    taskActionHrid,
    taskRemaining,
  });
  const cardTasks = cardEntries.map(({ task }) => task);
  syncPageNewTasks(cards, cardTasks, enteredNewTaskPage && !resumedTaskPage);
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
    if (!("mwitoolsOriginalIndex" in card.dataset)) {
      card.dataset.mwitoolsOriginalIndex = String(index);
    }
    const taskIndex = String(cardEntries[index]?.taskIndex ?? -1);
    if (card.dataset.mwitoolsTaskIndex !== taskIndex) {
      card.dataset.mwitoolsTaskIndex = taskIndex;
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
      ".mwi-task-insight,.mwi-task-toolbar,.mwi-task-profession-group,.mwi-task-bg,.mwi-task-merged-note,.mwi-task-merge-toast",
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
  nativeResetChoiceUntil = 0;
  temporaryTaskReturn = null;
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
    let renderPending = false;
    const scheduleRender = () => {
      if (renderPending) return;
      renderPending = true;
      (globalThis.requestAnimationFrame ?? globalThis.setTimeout)(() => {
        renderPending = false;
        renderTasks();
      });
    };
    const observer = new MutationObserver((records) => {
      if (shouldRenderTaskMutations(records)) scheduleRender();
    });
    scope.observer(observer, document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    scope.add(
      runtime.onMessage("quests_updated", () => {
        nativeResetChoiceUntil = 0;
        scheduleRender();
      }),
    );
    scope.add(() => {
      renderPending = false;
    });
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
  armTemporaryTaskReturn,
  cancelTemporaryTaskReturn,
  resumeTemporaryTaskReturn,
  taskActionHrid,
  taskRemaining,
  taskProjection,
  renderTasks,
  restoreTaskOrder: renderTasks,
});
