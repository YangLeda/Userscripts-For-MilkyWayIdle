import closeIcon from "./assets/close.png";
import copyIcon from "./assets/copy.png";
import debugIcon from "./assets/debug.png";
import resetIcon from "./assets/reset.png";
import trendIcon from "./assets/trend.png";
import { runtime } from "../../core/runtime.js";
import {
  getGameSpriteHref,
  scanGameSpriteSources,
} from "../../core/game-assets.js";
import { getGameTranslation } from "../../core/game-localization.js";

/*
 * 普通战斗伤害归属：单人 pMap 直接归属；多人 pMap 优先使用 atkCounter
 * 增量识别真正行动者，其次使用唯一 MP 下降者；仍不明确时只保留团队伤害。
 * 公会试炼使用新版全员 atkCounter 与怪物 dmgCounter，不再按 MP 或人数估算。
 * 怪物与玩家的生命/魔法基线都来自 new_battle，避免重连后的幽灵伤害。
 * 来源：galaxy-cow-dps 1.0.50（fa4d36b），MIT License。
 * 可在控制台调用 window.__MWI_DPS.diagnostics() 查看实时诊断。
 */

const pageWindow = globalThis.unsafeWindow ?? globalThis;
const MWI = (pageWindow.__MWI_DPS = pageWindow.__MWI_DPS || {});
MWI.__mwitoolsIntegrated = true;
const VERSION = "1.0.51";

// Classe CSS du conteneur d'onglets du jeu. Si le jeu la change, modifier ici.
const TAB_CONTAINER_CLASS = "TabsComponent_tabsContainer__3BDUp";

// Details 风格的主强调色。
const ACCENT = "#d4af37";
const GameAssets = Object.freeze({
  ability: (id) => getGameSpriteHref("abilities", id),
  skill: (id) => getGameSpriteHref("skills", id),
  item: (id) => getGameSpriteHref("items", id),
  misc: (id) => getGameSpriteHref("misc", id),
  avatar: (id) => getGameSpriteHref("avatars", id),
  scan: () => scanGameSpriteSources({ force: true }),
});
const SKILL_MODE_ICONS = {
  get attack() {
    return GameAssets.skill("attack");
  },
  get defense() {
    return GameAssets.skill("defense");
  },
  get stamina() {
    return GameAssets.skill("stamina");
  },
  get steadyShot() {
    return GameAssets.ability("/abilities/steady_shot");
  },
};
const TOOLBAR_ICONS = {
  get history() {
    return GameAssets.misc("loot_tracker");
  },
  get settings() {
    return GameAssets.misc("settings");
  },
  trend: trendIcon,
  debug: debugIcon,
  reset: resetIcon,
  copy: copyIcon,
  close: closeIcon,
};

// 旧版颜色选择器兼容值；新版默认颜色由职业决定。
const PALETTE = [
  "#C41E3A",
  "#00FF98",
  "#3FC7EB",
  "#C69B6D",
  "#A330C9",
  "#FFF468",
  "#AAD372",
  "#0070DD",
  "#F48CBA",
];

// ─── Settings ─────────────────────────────────────────────────────────────────
const Settings = (() => {
  const KEY = "kikimeter:settings:v4";
  const LEGACY_KEY = "kikimeter:settings:v3";
  const defaultLanguage =
    typeof runtime.config.isZH === "boolean"
      ? runtime.config.isZH
        ? "zh"
        : "en"
      : /^zh\b/i.test(globalThis.navigator?.language ?? "")
        ? "zh"
        : "en";
  const defaults = {
    colors: {},
    classOverrides: {},
    classCache: {},
    weaponCache: {},
    mainMode: "dps",
    showHealing: true,
    showGraph: false,
    autoReset: true,
    language: defaultLanguage,
    panelOpacity: 100,
    refreshIntervalMs: 1000,
  };
  let state = { ...defaults };
  try {
    const s = JSON.parse(
      localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || "{}",
    );
    if (s && typeof s === "object") state = { ...defaults, ...s };
  } catch (e) {}
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
  }
  return {
    getColor: (n) => state.colors[n],
    setColor: (n, c) => {
      state.colors[n] = c;
      save();
    },
    getClassOverride: (n) => state.classOverrides[n],
    setClassOverride: (n, c) => {
      if (c) state.classOverrides[n] = c;
      else delete state.classOverrides[n];
      save();
    },
    getCachedClass: (n) => state.classCache[n],
    setCachedClass: (n, c) => {
      if (c) state.classCache[n] = c;
      else delete state.classCache[n];
      save();
    },
    getCachedWeapon: (n) => state.weaponCache[n] || "",
    setCachedWeapon: (n, w) => {
      if (w) state.weaponCache[n] = w;
      else delete state.weaponCache[n];
      save();
    },
    getShowHealing: () => state.showHealing,
    setShowHealing: (v) => {
      state.showHealing = v;
      save();
    },
    getShowGraph: () => state.showGraph,
    setShowGraph: (v) => {
      state.showGraph = v;
      save();
    },
    getMainMode: () =>
      ["dps", "hps", "taken", "accuracy", "debug"].includes(state.mainMode)
        ? state.mainMode
        : "dps",
    setMainMode: (v) => {
      state.mainMode = ["dps", "hps", "taken", "accuracy", "debug"].includes(v)
        ? v
        : "dps";
      save();
    },
    getAutoReset: () => state.autoReset,
    setAutoReset: (v) => {
      state.autoReset = v;
      save();
    },
    getRecountMode: () => state.recountMode || "dmg",
    setRecountMode: (v) => {
      state.recountMode = v;
      save();
    },
    getRecountPos: () => state.recountPos,
    setRecountPos: (p) => {
      state.recountPos = p;
      save();
    },
    getRecountSize: () => state.recountSize,
    setRecountSize: (s) => {
      state.recountSize = s;
      save();
    },
    getPanelLayoutVersion: () => Number(state.panelLayoutVersion) || 0,
    setPanelLayoutVersion: (v) => {
      state.panelLayoutVersion = Number(v) || 0;
      save();
    },
    getRecountShowGraph: () => state.recountShowGraph !== false,
    setRecountShowGraph: (v) => {
      state.recountShowGraph = v;
      save();
    },
    getRefreshInterval: () =>
      Number(state.refreshIntervalMs) === 2000 ? 2000 : 1000,
    getPerformance: () => ({
      showGraph: Boolean(state.showGraph),
      recountShowGraph: state.recountShowGraph !== false,
      refreshIntervalMs: Number(state.refreshIntervalMs) === 2000 ? 2000 : 1000,
    }),
    setPerformance: (patch = {}) => {
      if (patch.showGraph !== undefined) {
        state.showGraph = Boolean(patch.showGraph);
      }
      if (patch.recountShowGraph !== undefined) {
        state.recountShowGraph = Boolean(patch.recountShowGraph);
      }
      if (patch.refreshIntervalMs !== undefined) {
        state.refreshIntervalMs =
          Number(patch.refreshIntervalMs) === 2000 ? 2000 : 1000;
      }
      save();
      return {
        showGraph: Boolean(state.showGraph),
        recountShowGraph: state.recountShowGraph !== false,
        refreshIntervalMs:
          Number(state.refreshIntervalMs) === 2000 ? 2000 : 1000,
      };
    },
    getDebugMode: () => state.debugMode || false,
    setDebugMode: (v) => {
      state.debugMode = v;
      save();
    },
    getLanguage: () => (state.language === "en" ? "en" : "zh"),
    setLanguage: (v) => {
      state.language = v === "en" ? "en" : "zh";
      save();
    },
    getPanelOpacity: () =>
      Math.max(10, Math.min(100, Number(state.panelOpacity) || 100)),
    setPanelOpacity: (v) => {
      state.panelOpacity = Math.max(10, Math.min(100, Number(v) || 100));
      save();
    },
    getLauncherPos: () => state.launcherPos,
    setLauncherPos: (p) => {
      state.launcherPos = p && typeof p === "object" ? p : null;
      save();
    },
  };
})();

runtime.api.dpsPerformance = {
  get: Settings.getPerformance,
  set: Settings.setPerformance,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDamage(n) {
  const value = Number(n) || 0,
    absolute = Math.abs(value);
  if (absolute >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (absolute >= 1_000) return (value / 1_000).toFixed(1) + "K";
  return Math.round(value).toString();
}
function formatRate(n) {
  const value = Number(n) || 0;
  return Math.abs(value) >= 1_000 ? formatDamage(value) : value.toFixed(1);
}
function formatDuration(s) {
  const sec = Math.floor(s % 60),
    min = Math.floor(s / 60) % 60,
    hr = Math.floor(s / 3600);
  const p = (n) => String(n).padStart(2, "0");
  return hr > 0 ? hr + ":" + p(min) + ":" + p(sec) : min + ":" + p(sec);
}
// Crée un élément DOM avec des styles inline directement appliqués.
function el(tag, styles) {
  const e = document.createElement(tag);
  if (styles) Object.assign(e.style, styles);
  return e;
}
function iconElement(source, label = "") {
  const value = String(source || "");
  if (value.includes("/static/media/") && value.includes(".svg#")) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", value);
    svg.appendChild(use);
    return svg;
  }
  const image = document.createElement("img");
  image.src = value;
  image.alt = label;
  return image;
}

// 公会试炼持续约一小时，但服务器会在换关时更换 battleId。对 Session 来说，
// 同一角色、同一本地日期的所有试炼关卡属于同一场；普通战斗仍使用原始 ID。
const CombatIdentity = (() => {
  function dayStamp(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (number) => String(number).padStart(2, "0");
    return (
      date.getFullYear() +
      "-" +
      pad(date.getMonth() + 1) +
      "-" +
      pad(date.getDate())
    );
  }
  function resolve(detail, type, characterId, now = new Date()) {
    const rawKey = String((detail && detail.combatKey) || "");
    const day = dayStamp(now);
    return type === "trial"
      ? { key: "guild-trial-day-" + characterId + "-" + day, rawKey, day }
      : { key: rawKey, rawKey, day };
  }
  function matches(oldMeta, resolved, type, characterId) {
    if (
      !oldMeta ||
      String(oldMeta.characterId || "unknown") !== String(characterId)
    )
      return false;
    if (oldMeta.combatKey === resolved.key) return true;
    // 兼容从 1.0.3 升级时仍以 battleId 保存的当天活动试炼。
    return (
      type === "trial" &&
      oldMeta.type === "trial" &&
      !oldMeta.manualReset &&
      !String(oldMeta.combatKey || "").includes("-manual-") &&
      dayStamp(oldMeta.startedAt) === resolved.day
    );
  }
  return { dayStamp, resolve, matches };
})();

// 伤害事件必须与当前 Session 类型一致。即使服务器消息乱序或某个试炼
// 检测信号迟到，普通战斗事件也不能写入试炼记录。
function combatEventMatchesSession(detail = {}, meta = {}) {
  const eventType = detail.battleType,
    sessionType = meta.type;
  if (!eventType || !sessionType) return true;
  return (
    eventType === sessionType ||
    (eventType === "combat" && sessionType === "labyrinth")
  );
}

// 测试服的公会试炼标签可能显示为“试炼1”（角标人数），且不再出现旧版
// “进行中”文字。直接读取该标签栏当前选中的 tab，避免依赖易变化的文案。
function isSelectedTrialTabBar(container) {
  if (!container || typeof container.querySelector !== "function") return false;
  const selected = container.querySelector(
    '[role="tab"][aria-selected="true"]',
  );
  const label = String((selected && selected.textContent) || "")
    .replace(/\s+/g, "")
    .toLowerCase();
  const trialLabels = [
    getGameTranslation("guildPanel.trials"),
    getGameTranslation("guildPanel.combatTrial"),
    getGameTranslation("guildPanel.skillingTrial"),
    "试炼",
    "試煉",
    "trials",
    "trial",
  ]
    .map((value) => String(value).replace(/\s+/g, "").toLowerCase())
    .filter(Boolean);
  return trialLabels.some((value) => label.startsWith(value));
}

// 活动试炼在部分服务器会从“试炼”切换到单独的“进行中 / In Progress”
// 标签。只在附近仍能找到公会或试炼语义时承认该标签，避免其他页面同名
// 标签误挂载 DPS 入口。
function isSelectedGuildProgressTabBar(container) {
  if (!container || typeof container.querySelector !== "function") return false;
  const selected = container.querySelector(
    '[role="tab"][aria-selected="true"]',
  );
  const label = String((selected && selected.textContent) || "")
    .replace(/\s+/g, "")
    .toLowerCase();
  const progressLabels = [
    getGameTranslation("guildPanel.trialInProgress"),
    "进行中",
    "進行中",
    "inprogress",
  ]
    .map((value) => String(value).replace(/\s+/g, "").toLowerCase())
    .filter(Boolean);
  if (!progressLabels.some((value) => label.startsWith(value))) return false;
  const contextLabels = [
    getGameTranslation("guildPanel.trials"),
    getGameTranslation("guildPanel.combatTrial"),
    getGameTranslation("guildPanel.skillingTrial"),
    getGameTranslation("navigationBar.guild"),
    "试炼",
    "試煉",
    "trial",
    "公会",
    "公會",
    "guild",
  ]
    .map((value) => String(value).replace(/\s+/g, "").toLowerCase())
    .filter(Boolean);
  let node = container;
  for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
    const context = String(node.textContent || "")
      .replace(/\s+/g, "")
      .toLowerCase();
    if (contextLabels.some((value) => context.includes(value))) return true;
    if (
      typeof document !== "undefined" &&
      (node === document.body || node === document.documentElement)
    )
      break;
  }
  return false;
}

export {
  ACCENT,
  CombatIdentity,
  GameAssets,
  MWI,
  PALETTE,
  SKILL_MODE_ICONS,
  Settings,
  TAB_CONTAINER_CLASS,
  TOOLBAR_ICONS,
  VERSION,
  combatEventMatchesSession,
  el,
  formatDamage,
  formatDuration,
  formatRate,
  iconElement,
  isSelectedGuildProgressTabBar,
  isSelectedTrialTabBar,
};
