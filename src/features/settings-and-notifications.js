import { runtime } from "../core/runtime.js";
import {
  getGameTranslation,
  matchesGameTranslation,
} from "../core/game-localization.js";
import { createFrameScheduler } from "../core/frame-scheduler.js";
import { subscribeMutationChannel } from "../core/mutation-channel.js";
import {
  ensureHeaderToolsHost,
  HEADER_TOOLS_ID,
  removeHeaderToolsHostIfEmpty,
} from "./header-tools.js";

const SETTINGS_V2_KEY = "MWITools_settings_v2";
const BACK_MIRROR_DEFAULT_CORRECTION_KEY =
  "MWITools_back_mirror_default_disabled_v2";
const SETTINGS_STYLE_ID = "mwitools-settings-style";
const EQUIPMENT_WARNING_STYLE_ID = "mwitools-equipment-warning-style";
const SETTINGS_TAB_ATTRIBUTE = "data-mwitools-settings-tab";
const SETTINGS_PANEL_ATTRIBUTE = "data-mwitools-settings-panel";
const SETTINGS_ROOT_ATTRIBUTE = "data-mwitools-settings-root";
const SETTINGS_BUTTON_ID = "mwitools-settings-button";
const SETTINGS_POPOVER_ID = "mwitools-settings-popover";
const TOOLTIP_PROFIT_SHORTCUT_KEY = "MWITools_tooltip_profit_key_v1";
const GUILD_CREDIT_RECOMMENDATION_COUNT_KEY =
  "MWITools_guild_credit_recommendation_count_v1";

function normalizeGuildCreditRecommendationCount(value) {
  const count = Math.floor(Number(value));
  return Number.isFinite(count) ? Math.min(8, Math.max(1, count)) : 3;
}

function loadGuildCreditRecommendationCount() {
  const stored = localStorage.getItem(GUILD_CREDIT_RECOMMENDATION_COUNT_KEY);
  return stored === null ? 3 : normalizeGuildCreditRecommendationCount(stored);
}

let guildCreditRecommendationCount = loadGuildCreditRecommendationCount();

function getGuildCreditRecommendationCount() {
  return guildCreditRecommendationCount;
}

function setGuildCreditRecommendationCount(value) {
  guildCreditRecommendationCount =
    normalizeGuildCreditRecommendationCount(value);
  localStorage.setItem(
    GUILD_CREDIT_RECOMMENDATION_COUNT_KEY,
    String(guildCreditRecommendationCount),
  );
  document
    .querySelectorAll?.("[data-mwitools-guild-credit-count]")
    .forEach((select) => {
      select.value = String(guildCreditRecommendationCount);
    });
  if (runtime.settings.get("guildCreditConversionsSort")) {
    void runtime.api.renderGuildCreditRecommendations?.();
  }
  return guildCreditRecommendationCount;
}

function normalizeTooltipProfitShortcut(value) {
  const code = String(value?.code ?? "").trim();
  if (!code) return { code: "Control", display: "Ctrl" };
  return {
    code,
    display: String(value?.display ?? code).trim() || code,
  };
}

function loadTooltipProfitShortcut() {
  try {
    return normalizeTooltipProfitShortcut(
      JSON.parse(localStorage.getItem(TOOLTIP_PROFIT_SHORTCUT_KEY) || "null"),
    );
  } catch {
    return normalizeTooltipProfitShortcut(null);
  }
}

let tooltipProfitShortcut = loadTooltipProfitShortcut();

function shortcutCodeFromEvent(event) {
  if (["Control", "Shift", "Alt", "Meta"].includes(event?.key)) {
    return event.key;
  }
  return String(event?.code ?? event?.key ?? "");
}

function shortcutDisplayFromEvent(event) {
  if (event?.key === "Control") return "Ctrl";
  if (event?.key === "Meta") return "Meta";
  if (["Shift", "Alt"].includes(event?.key)) return event.key;
  if (event?.code === "Space") return "Space";
  if (String(event?.code).startsWith("Arrow")) {
    return String(event.code).slice(5);
  }
  return event?.key?.length === 1
    ? event.key.toUpperCase()
    : event?.key || event?.code;
}

function getTooltipProfitShortcut() {
  return { ...tooltipProfitShortcut };
}

function setTooltipProfitShortcut(value) {
  tooltipProfitShortcut = normalizeTooltipProfitShortcut(value);
  localStorage.setItem(
    TOOLTIP_PROFIT_SHORTCUT_KEY,
    JSON.stringify(tooltipProfitShortcut),
  );
  return getTooltipProfitShortcut();
}

function matchesTooltipProfitShortcut(event) {
  return shortcutCodeFromEvent(event) === tooltipProfitShortcut.code;
}

function persistSettings() {
  const values = Object.fromEntries(
    Object.entries(runtime.settings.settingsMap).map(([id, setting]) => [
      id,
      Boolean(setting.isTrue),
    ]),
  );
  const preferences = Object.fromEntries(
    Object.keys(runtime.settings.preferenceDefinitions ?? {}).map((id) => [
      id,
      runtime.settings.getPreference(id),
    ]),
  );
  localStorage.setItem(
    SETTINGS_V2_KEY,
    JSON.stringify({ version: 2, values, preferences }),
  );

  // Keep the legacy shape current so users can safely roll back MWITools.
  localStorage.setItem(
    "script_settingsMap",
    JSON.stringify(runtime.settings.settingsMap),
  );
}

function applyStoredSetting(id, value) {
  const setting = runtime.settings.settingsMap[id];
  if (!setting) return;
  setting.isTrue = Boolean(value);
}

function applyVisualSettings() {
  runtime.config.isZH =
    runtime.settings.settingsMap.forceMWIToolsDisplayZH.isTrue ||
    runtime.config.isZHInGameSetting;
  runtime.config.SCRIPT_COLOR_MAIN = runtime.settings.settingsMap
    .useOrangeAsMainColor.isTrue
    ? "orange"
    : "green";
  runtime.config.SCRIPT_COLOR_TOOLTIP = runtime.settings.settingsMap
    .useOrangeAsMainColor.isTrue
    ? "#804600"
    : "darkgreen";
  const scale =
    { standard: 1, large: 1.12, largest: 1.25 }[
      runtime.settings.getPreference("uiFontScale")
    ] ?? 1;
  document.documentElement?.style.setProperty(
    "--mwi-ui-font-scale",
    String(scale),
  );
  const hoverScale =
    { standard: 1, large: 1.12, largest: 1.25 }[
      runtime.settings.getPreference("hoverFontScale")
    ] ?? 1;
  document.documentElement?.style.setProperty(
    "--mwi-hover-font-scale",
    String(hoverScale),
  );
}

runtime.settings.onPreferenceChange?.("uiFontScale", applyVisualSettings);
runtime.settings.onPreferenceChange?.("hoverFontScale", applyVisualSettings);

function readSettings() {
  let loadedV2 = false;
  let storedPreferences = null;
  try {
    const storedV2 = JSON.parse(
      localStorage.getItem(SETTINGS_V2_KEY) || "null",
    );
    if (storedV2?.version === 2 && storedV2.values) {
      for (const [id, value] of Object.entries(storedV2.values)) {
        applyStoredSetting(id, value);
      }
      storedPreferences = storedV2.preferences ?? null;
      loadedV2 = true;
    }
  } catch (error) {
    console.warn(
      runtime.config.isZH
        ? "[MWITools] 无法读取新版设置。"
        : "[MWITools] Could not read v2 settings.",
      error,
    );
  }

  if (!loadedV2) {
    try {
      const legacy = JSON.parse(
        localStorage.getItem("script_settingsMap") || "null",
      );
      for (const option of Object.values(legacy ?? {})) {
        if (!option?.id) continue;
        applyStoredSetting(option.id, option.isTrue);
      }
    } catch (error) {
      console.warn(
        runtime.config.isZH
          ? "[MWITools] 无法迁移旧版设置。"
          : "[MWITools] Could not migrate legacy settings.",
        error,
      );
    }
  }

  const legacyProductionSummaryEnabled = Boolean(
    runtime.settings.settingsMap.productionSummary.isTrue,
  );
  for (const [id, definition] of Object.entries(
    runtime.settings.preferenceDefinitions ?? {},
  )) {
    const value =
      storedPreferences?.[id] ??
      (id === "productionSummaryMode" && !legacyProductionSummaryEnabled
        ? "off"
        : definition.defaultValue);
    void runtime.settings.setPreference(id, value, { persist: false });
  }
  runtime.settings.settingsMap.productionSummary.isTrue =
    runtime.settings.getPreference("productionSummaryMode") !== "off";

  // Reset the briefly repurposed back-equipment option once. Valuing plain
  // back gear by a protection mirror is opt-in, so later choices stick.
  if (!localStorage.getItem(BACK_MIRROR_DEFAULT_CORRECTION_KEY)) {
    runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue = false;
    localStorage.setItem(BACK_MIRROR_DEFAULT_CORRECTION_KEY, "1");
  }
  applyVisualSettings();
  persistSettings();
}

function addSettingsStyles() {
  if (document.getElementById(SETTINGS_STYLE_ID)) return;
  const styleHost = document.head ?? document.documentElement;
  if (!styleHost) return;
  const style = document.createElement("style");
  style.id = SETTINGS_STYLE_ID;
  style.textContent = `
    #${HEADER_TOOLS_ID} { display:flex; align-items:center; justify-content:center; gap:4px; width:max-content; max-width:100%; margin:2px auto 0; }
    #${SETTINGS_BUTTON_ID} { display:inline-flex; width:22px; height:20px; flex:0 0 22px; align-items:center; justify-content:center; box-sizing:border-box; margin:0; padding:0; border:1px solid rgba(160,176,210,.45); border-radius:4px; background:rgba(118,138,180,.12); color:#bdc9e5; font:700 13px/1 sans-serif; cursor:pointer; }
    #${SETTINGS_BUTTON_ID}:hover,#${SETTINGS_BUTTON_ID}[aria-expanded="true"] { border-color:rgba(245,158,11,.65); background:rgba(245,158,11,.16); color:#ffd27a; }
    #${SETTINGS_BUTTON_ID}:focus-visible { outline:2px solid var(--color-primary,${runtime.config.SCRIPT_COLOR_MAIN}); outline-offset:1px; }
    #${SETTINGS_POPOVER_ID} { position:fixed; z-index:2147482500; overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain; box-sizing:border-box; padding:10px; border:1px solid rgba(116,132,170,.72); border-radius:9px; background:var(--color-background-primary,#171b2a); box-shadow:0 18px 54px rgba(0,0,0,.62); color:var(--color-text-primary,#eee); }
    #${SETTINGS_POPOVER_ID}[hidden] { display:none; }
    #script_settings,[${SETTINGS_ROOT_ATTRIBUTE}] { width:100%; color:var(--color-text-primary,#eee); }
    #script_settings { margin-top:14px; }
    [${SETTINGS_PANEL_ATTRIBUTE}] { width:100%; box-sizing:border-box; }
    [${SETTINGS_TAB_ATTRIBUTE}][aria-selected="true"] { color:var(--color-primary,#fff); }
    .mwi-settings-hero { display:flex; justify-content:space-between; gap:14px; align-items:end; margin-bottom:11px; }
    .mwi-settings-hero-actions { display:flex; align-items:center; gap:7px; }
    .mwi-settings-close { display:inline-flex; width:30px; height:30px; flex:0 0 30px; align-items:center; justify-content:center; border:0; border-radius:5px; background:rgba(255,255,255,.06); color:var(--color-text-secondary,#aaa); font-size:19px; cursor:pointer; }
    .mwi-settings-close:hover { background:rgba(255,255,255,.12); color:var(--color-text-primary,#fff); }
    .mwi-settings-title { font-size:1.2rem; font-weight:700; letter-spacing:.01em; }
    .mwi-settings-subtitle { color:var(--color-text-secondary,#aaa); margin-top:3px; font-size:calc(.78rem * var(--mwi-ui-font-scale,1)); line-height:1.35; }
    .mwi-settings-search { width:min(320px,100%); box-sizing:border-box; border:1px solid rgba(255,255,255,.16); border-radius:5px; background:rgba(0,0,0,.2); color:inherit; padding:7px 9px; }
    .mwi-settings-group { margin:0 0 10px; border:1px solid rgba(255,255,255,.12); border-radius:7px; background:rgba(0,0,0,.13); overflow:hidden; }
    .mwi-settings-group-head { padding:10px 13px 8px; border-bottom:1px solid rgba(255,255,255,.08); }
    .mwi-settings-group-title { font-size:1rem; font-weight:700; }
    .mwi-settings-group-summary { color:var(--color-text-secondary,#aaa); font-size:calc(.75rem * var(--mwi-ui-font-scale,1)); margin-top:2px; line-height:1.35; }
    .mwi-settings-grid { display:flex; flex-direction:column; padding:0 10px; }
    .mwi-performance-settings-card { display:flex; min-height:58px; align-items:center; justify-content:space-between; gap:14px; padding:9px 4px; border-bottom:1px solid rgba(255,255,255,.075); }
    .mwi-performance-settings-copy { min-width:0; }
    .mwi-performance-settings-title { display:flex; align-items:center; gap:8px; font-size:calc(.84rem * var(--mwi-ui-font-scale,1)); font-weight:700; }
    .mwi-performance-settings-profile { display:inline-flex; padding:1px 7px; border-radius:999px; background:rgba(238,154,29,.14); color:#ffd084; font-size:calc(.6875rem * var(--mwi-ui-font-scale,1)); white-space:nowrap; }
    .mwi-performance-settings-summary { margin-top:3px; color:var(--color-text-secondary,#aaa); font-size:calc(.71rem * var(--mwi-ui-font-scale,1)); line-height:1.35; }
    .mwi-performance-settings-open { flex:0 0 auto; border:1px solid rgba(238,154,29,.62); border-radius:4px; padding:6px 10px; background:rgba(238,154,29,.12); color:#ffd084; font:inherit; font-size:calc(.72rem * var(--mwi-ui-font-scale,1)); cursor:pointer; }
    .mwi-performance-settings-open:hover { background:rgba(238,154,29,.2); }
    .mwi-setting-card { min-width:0; padding:7px 4px; border-bottom:1px solid rgba(255,255,255,.075); transition:background .15s; }
    .mwi-setting-card:last-child { border-bottom:0; }
    .mwi-setting-card:hover { background:rgba(255,255,255,.025); }
    .mwi-setting-card.mwi-setting-child { margin-top:5px; padding:6px 8px; border:1px solid rgba(255,255,255,.075); border-radius:5px; background:rgba(0,0,0,.12); }
    .mwi-setting-card.mwi-setting-child:has(input:disabled) { opacity:.52; }
    .mwi-setting-row { display:grid; min-height:42px; grid-template-columns:minmax(170px,.72fr) minmax(260px,1.5fr) auto minmax(40px,auto); align-items:center; gap:8px 14px; }
    .mwi-setting-copy { display:contents; }
    .mwi-setting-title-line { display:flex; min-width:0; grid-column:1; grid-row:1; align-items:center; gap:7px; text-align:left; }
    .mwi-setting-title { min-width:0; font-size:calc(.84rem * var(--mwi-ui-font-scale,1)); font-weight:650; line-height:1.25; }
    .mwi-setting-summary { overflow:hidden; grid-column:2; grid-row:1; color:var(--color-text-secondary,#aaa); font-size:calc(.71rem * var(--mwi-ui-font-scale,1)); line-height:1.3; text-align:left; text-overflow:ellipsis; white-space:nowrap; }
    .mwi-setting-status { display:inline-flex; flex:0 0 auto; padding:1px 6px; border-radius:999px; font-size:calc(.6875rem * var(--mwi-ui-font-scale,1)); color:#aaa; background:rgba(255,255,255,.07); }
    .mwi-setting-status[data-status="active"] { color:#87d7a0; background:rgba(70,170,100,.13); }
    .mwi-setting-status[data-status="failed"] { color:#ff9a90; background:rgba(210,70,60,.14); }
    .mwi-setting-status[data-status="waiting"] { color:#e3c56d; background:rgba(210,170,60,.13); }
    .mwi-setting-toggle { position:relative; width:36px; height:20px; grid-column:4; grid-row:1; justify-self:end; }
    .mwi-setting-toggle input { position:absolute; opacity:0; }
    .mwi-setting-toggle span { position:absolute; inset:0; border-radius:999px; cursor:pointer; background:#555; transition:.16s; }
    .mwi-setting-toggle span::after { content:""; position:absolute; width:16px; height:16px; left:2px; top:2px; border-radius:50%; background:#fff; transition:.16s; }
    .mwi-setting-toggle input:checked + span { background:var(--color-primary,${runtime.config.SCRIPT_COLOR_MAIN}); }
    .mwi-setting-toggle input:checked + span::after { transform:translateX(16px); }
    .mwi-setting-more { grid-column:3; grid-row:1; margin:0; font-size:calc(.6875rem * var(--mwi-ui-font-scale,1)); color:var(--color-text-secondary,#aaa); text-align:left; white-space:nowrap; }
    .mwi-setting-more summary { display:inline-block; cursor:pointer; color:var(--color-primary,${runtime.config.SCRIPT_COLOR_MAIN}); list-style-position:inside; }
    .mwi-setting-more[open] { grid-column:1 / 4; grid-row:2; margin:0; padding-top:5px; border-top:1px solid rgba(255,255,255,.06); white-space:normal; }
    .mwi-setting-more p { margin:4px 0 1px; line-height:1.4; }
    .mwi-setting-retry { margin-left:8px; border:0; border-radius:4px; padding:2px 6px; cursor:pointer; color:inherit; background:rgba(255,255,255,.1); }
    .mwi-setting-shortcut-row { display:flex; align-items:center; justify-content:flex-end; gap:8px; margin:5px 44px 1px 0; color:var(--color-text-secondary,#aaa); font-size:calc(.7rem * var(--mwi-ui-font-scale,1)); }
    .mwi-setting-shortcut { min-width:92px; border:1px solid rgba(255,255,255,.16); border-radius:5px; padding:4px 8px; cursor:pointer; color:inherit; background:rgba(255,255,255,.07); }
    .mwi-setting-select { min-width:92px; border:1px solid rgba(255,255,255,.16); border-radius:5px; padding:4px 24px 4px 8px; color:inherit; background:var(--color-background-secondary,#292929); font:inherit; }
    .mwi-setting-primary-select { grid-column:4; grid-row:1; justify-self:end; }
    .mwi-setting-select:disabled { cursor:not-allowed; opacity:.5; }
    @media (max-width:700px) { #${SETTINGS_POPOVER_ID} { padding:8px; } .mwi-settings-hero { align-items:stretch; flex-direction:column; } .mwi-settings-hero-actions { width:100%; } .mwi-settings-hero-actions .mwi-settings-search { flex:1; } .mwi-settings-search { width:100%; } .mwi-performance-settings-card { align-items:flex-start; } .mwi-performance-settings-open { max-width:118px; } .mwi-setting-row { grid-template-columns:minmax(0,1fr) auto; gap:3px 10px; padding:3px 0; } .mwi-setting-title-line { grid-column:1;grid-row:1; } .mwi-setting-summary { grid-column:1;grid-row:2;white-space:normal; } .mwi-setting-more { grid-column:1;grid-row:3; } .mwi-setting-more[open] { grid-column:1 / 3;grid-row:3; } .mwi-setting-toggle { grid-column:2;grid-row:1 / 4; } .mwi-setting-primary-select { grid-column:2;grid-row:1 / 3; } }
  `;
  styleHost.appendChild(style);
}

function localizedText(value) {
  return value?.[runtime.config.isZH ? "zh" : "en"] ?? "";
}

function featureStatusForSetting(id) {
  const featureStatus = runtime.features.getStatus(id);
  if (featureStatus.status !== "unregistered") return featureStatus;
  return {
    id,
    status: runtime.settings.get(id) ? "active" : "disabled",
    error: null,
  };
}

function statusLabel(status) {
  const labels = runtime.config.isZH
    ? {
        active: "已启用",
        disabled: "已关闭",
        initializing: "正在启动",
        waiting: "等待游戏数据",
        failed: "启动失败",
      }
    : {
        active: "Enabled",
        disabled: "Disabled",
        initializing: "Starting",
        waiting: "Waiting for game data",
        failed: "Failed to start",
      };
  return labels[status] ?? labels.disabled;
}

function getSettingDescendants(id) {
  return Object.values(runtime.settings.catalog).filter((candidate) => {
    let parent = candidate.parent;
    while (parent) {
      if (parent === id) return true;
      parent = runtime.settings.catalog[parent]?.parent;
    }
    return false;
  });
}

function areSettingParentsEnabled(definition) {
  let parent = definition.parent;
  while (parent) {
    if (!runtime.settings.get(parent)) return false;
    parent = runtime.settings.catalog[parent]?.parent;
  }
  return true;
}

function settingsRoots() {
  return [
    ...document.querySelectorAll(
      `#script_settings,[${SETTINGS_ROOT_ATTRIBUTE}]`,
    ),
  ];
}

function cleanupSettingsRoot(root) {
  for (const card of root?.querySelectorAll(
    ".mwi-setting-card,.mwi-performance-settings-card",
  ) ?? []) {
    card._mwitoolsCleanup?.();
  }
}

function renderAllSettings() {
  for (const root of settingsRoots()) renderSettings(root);
  const label = runtime.config.isZH
    ? "MWITools 快捷设置"
    : "MWITools quick settings";
  document
    .getElementById(SETTINGS_BUTTON_ID)
    ?.setAttribute("aria-label", label);
  document
    .getElementById(SETTINGS_POPOVER_ID)
    ?.setAttribute("aria-label", label);
}

function createSelectSettingCard(definition, options = {}) {
  const card = document.createElement("article");
  card.className = "mwi-setting-card";
  if (options.child) card.classList.add("mwi-setting-child");
  card.dataset.search = [
    definition.title?.zh,
    definition.title?.en,
    definition.summary?.zh,
    definition.summary?.en,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const row = document.createElement("div");
  row.className = "mwi-setting-row";
  const copy = document.createElement("div");
  copy.className = "mwi-setting-copy";
  const titleLine = document.createElement("div");
  titleLine.className = "mwi-setting-title-line";
  const title = document.createElement("div");
  title.className = "mwi-setting-title";
  title.textContent = localizedText(definition.title);
  titleLine.append(title);
  const summary = document.createElement("div");
  summary.className = "mwi-setting-summary";
  summary.textContent = localizedText(definition.summary);
  copy.append(titleLine, summary);
  if (definition.details) {
    const details = document.createElement("details");
    details.className = "mwi-setting-more";
    const heading = document.createElement("summary");
    heading.textContent = runtime.config.isZH ? "详细说明" : "Details";
    const detailsCopy = document.createElement("p");
    detailsCopy.textContent = localizedText(definition.details);
    details.append(heading, detailsCopy);
    copy.append(details);
  }

  const select = document.createElement("select");
  select.className = "mwi-setting-select mwi-setting-primary-select";
  select.setAttribute("aria-label", localizedText(definition.title));
  for (const [value, label] of definition.control.options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = localizedText(label);
    select.append(option);
  }
  const preferenceId = definition.control.preference;
  select.value = runtime.settings.getPreference(preferenceId);
  select.addEventListener("change", async () => {
    const value = select.value;
    await runtime.settings.setPreference(preferenceId, value);
    if (preferenceId === "productionSummaryMode") {
      await runtime.settings.set("productionSummary", value !== "off");
    }
    if (preferenceId === "uiFontScale") applyVisualSettings();
  });
  row.append(copy, select);
  card.append(row);
  const stopPreferenceListener = runtime.settings.onPreferenceChange(
    preferenceId,
    (value) => {
      select.value = value;
      if (preferenceId === "uiFontScale") applyVisualSettings();
    },
  );
  card._mwitoolsCleanup = () => stopPreferenceListener?.();
  return card;
}

function createSettingCard(definition, options = {}) {
  if (definition.control?.type === "select") {
    return createSelectSettingCard(definition, options);
  }
  const setting = runtime.settings.settingsMap[definition.id];
  const children = Object.values(runtime.settings.catalog).filter(
    (candidate) => candidate.parent === definition.id,
  );
  const descendants = getSettingDescendants(definition.id);
  const card = document.createElement("article");
  let cancelShortcutCapture = null;
  let auxiliaryControl = null;
  card.className = "mwi-setting-card";
  if (options.child) card.classList.add("mwi-setting-child");
  card.dataset.search = [
    definition.title?.zh,
    definition.title?.en,
    definition.summary?.zh,
    definition.summary?.en,
    ...(definition.id === "guildCreditConversionsSort"
      ? ["推荐数量", "recommendation count"]
      : []),
    ...descendants.flatMap((child) => [
      child.title?.zh,
      child.title?.en,
      child.summary?.zh,
      child.summary?.en,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const row = document.createElement("div");
  row.className = "mwi-setting-row";
  const copy = document.createElement("div");
  copy.className = "mwi-setting-copy";
  const title = document.createElement("div");
  title.className = "mwi-setting-title";
  title.textContent = localizedText(definition.title);
  const summary = document.createElement("div");
  summary.className = "mwi-setting-summary";
  summary.textContent = localizedText(definition.summary);
  const status = document.createElement("span");
  status.className = "mwi-setting-status";
  const setStatus = () => {
    const current = featureStatusForSetting(definition.id);
    status.dataset.status = current.status;
    status.textContent = statusLabel(current.status);
    if (current.error) status.title = current.error;
    if (current.status === "failed") {
      const retry = document.createElement("button");
      retry.className = "mwi-setting-retry";
      retry.type = "button";
      retry.textContent = runtime.config.isZH ? "重试" : "Retry";
      retry.addEventListener("click", () =>
        runtime.features.restart(definition.id),
      );
      status.appendChild(retry);
    }
    if (auxiliaryControl) auxiliaryControl.disabled = !checkbox.checked;
  };
  setStatus();
  const titleLine = document.createElement("div");
  titleLine.className = "mwi-setting-title-line";
  titleLine.append(title, status);
  copy.append(titleLine, summary);

  const toggle = document.createElement("label");
  toggle.className = "mwi-setting-toggle";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.settingId = definition.id;
  checkbox.checked = Boolean(setting.isTrue);
  if (definition.parent) {
    checkbox.disabled = !areSettingParentsEnabled(definition);
  }
  checkbox.setAttribute("aria-label", localizedText(definition.title));
  const track = document.createElement("span");
  toggle.append(checkbox, track);
  if (definition.details) {
    const details = document.createElement("details");
    details.className = "mwi-setting-more";
    const detailsSummary = document.createElement("summary");
    detailsSummary.textContent = runtime.config.isZH ? "详细说明" : "Details";
    details.append(detailsSummary);
    const detailsCopy = document.createElement("p");
    detailsCopy.textContent = localizedText(definition.details);
    details.append(detailsCopy);
    copy.append(details);
  }
  row.append(copy, toggle);
  card.append(row);
  if (definition.id === "itemTooltip_profitRequireKey") {
    const shortcutRow = document.createElement("div");
    shortcutRow.className = "mwi-setting-shortcut-row";
    const shortcutLabel = document.createElement("span");
    shortcutLabel.textContent = runtime.config.isZH
      ? "触发按键"
      : "Trigger key";
    const shortcutButton = document.createElement("button");
    shortcutButton.type = "button";
    shortcutButton.className = "mwi-setting-shortcut";
    const updateShortcutText = () => {
      shortcutButton.textContent = getTooltipProfitShortcut().display;
    };
    updateShortcutText();
    shortcutButton.addEventListener("click", () => {
      cancelShortcutCapture?.();
      shortcutButton.textContent = runtime.config.isZH
        ? "请按一个键…"
        : "Press one key…";
      const capture = (event) => {
        event.preventDefault();
        event.stopPropagation();
        cancelShortcutCapture?.();
        if (event.key === "Escape") {
          updateShortcutText();
          return;
        }
        setTooltipProfitShortcut({
          code: shortcutCodeFromEvent(event),
          display: shortcutDisplayFromEvent(event),
        });
        updateShortcutText();
      };
      cancelShortcutCapture = () => {
        window.removeEventListener("keydown", capture, true);
        cancelShortcutCapture = null;
      };
      window.addEventListener("keydown", capture, true);
    });
    shortcutRow.append(shortcutLabel, shortcutButton);
    card.append(shortcutRow);
  }
  if (definition.id === "guildCreditConversionsSort") {
    const countRow = document.createElement("div");
    countRow.className = "mwi-setting-shortcut-row";
    const countLabel = document.createElement("span");
    countLabel.textContent = runtime.config.isZH
      ? "推荐数量"
      : "Recommendations";
    const countSelect = document.createElement("select");
    countSelect.className = "mwi-setting-select";
    countSelect.dataset.mwitoolsGuildCreditCount = "";
    countSelect.setAttribute(
      "aria-label",
      runtime.config.isZH ? "公会信用推荐数量" : "Guild credit recommendations",
    );
    for (let count = 1; count <= 8; count += 1) {
      const option = document.createElement("option");
      option.value = String(count);
      option.textContent = String(count);
      countSelect.appendChild(option);
    }
    countSelect.value = String(getGuildCreditRecommendationCount());
    countSelect.disabled = !checkbox.checked;
    countSelect.addEventListener("change", () => {
      countSelect.value = String(
        setGuildCreditRecommendationCount(countSelect.value),
      );
    });
    countRow.append(countLabel, countSelect);
    card.append(countRow);
    auxiliaryControl = countSelect;
  }
  for (const child of children) {
    card.append(createSettingCard(child, { child: true }));
  }

  checkbox.addEventListener("change", async () => {
    await runtime.settings.set(definition.id, checkbox.checked);
    if (
      definition.id === "forceMWIToolsDisplayZH" ||
      definition.id === "useOrangeAsMainColor" ||
      children.length
    ) {
      applyVisualSettings();
      renderAllSettings();
      return;
    }
    setStatus();
  });

  const stopStatusListener = runtime.features.onStatusChange((id) => {
    if (id === definition.id) setStatus();
  });
  const stopSettingListener = runtime.settings.onChange(
    definition.id,
    (value) => {
      checkbox.checked = Boolean(value);
      setStatus();
    },
  );
  card._mwitoolsCleanup = () => {
    cancelShortcutCapture?.();
    stopStatusListener?.();
    stopSettingListener?.();
  };
  return card;
}

function performanceProfileLabel(
  state = runtime.api.performanceProfiles?.getState?.(),
) {
  const usages = runtime.config.isZH
    ? { life: "生活", combat: "战斗", balanced: "平衡" }
    : { life: "Skilling", combat: "Combat", balanced: "Balanced" };
  const tiers = runtime.config.isZH
    ? {
        smooth: "流畅优先",
        standard: "标准",
        full: "完整功能",
        custom: "自定义",
      }
    : {
        smooth: "Smooth",
        standard: "Standard",
        full: "Full features",
        custom: "Custom",
      };
  return `${usages[state?.usage] ?? usages.balanced} · ${tiers[state?.tier] ?? tiers.custom}`;
}

function createPerformanceSettingsCard() {
  const card = document.createElement("article");
  card.className = "mwi-performance-settings-card";
  card.dataset.search = "性能 引导 档位 生活 战斗 平衡 performance guide tier";
  const copy = document.createElement("div");
  copy.className = "mwi-performance-settings-copy";
  const title = document.createElement("div");
  title.className = "mwi-performance-settings-title";
  const titleText = document.createElement("span");
  titleText.textContent = runtime.config.isZH
    ? "性能与初始化引导"
    : "Performance setup guide";
  const profile = document.createElement("span");
  profile.className = "mwi-performance-settings-profile";
  const update = () => {
    profile.textContent = performanceProfileLabel();
  };
  update();
  title.append(titleText, profile);
  const summary = document.createElement("div");
  summary.className = "mwi-performance-settings-summary";
  summary.textContent = runtime.config.isZH
    ? "重新选择玩法、设备档位，或按功能组自定义。取消不会修改当前设置。"
    : "Choose your play style and device tier again, or customize each group. Cancelling keeps current settings.";
  copy.append(title, summary);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mwi-performance-settings-open";
  button.textContent = runtime.config.isZH ? "重新开始引导" : "Restart guide";
  button.addEventListener("click", () => {
    void runtime.api.openPerformanceOnboarding?.({ firstRun: false });
  });
  const onProfileChange = () => update();
  document.addEventListener(
    "mwitools:performance-profile-change",
    onProfileChange,
  );
  card._mwitoolsCleanup = () =>
    document.removeEventListener(
      "mwitools:performance-profile-change",
      onProfileChange,
    );
  card.append(copy, button);
  return card;
}

function renderSettings(root) {
  if (!root) return;
  cleanupSettingsRoot(root);
  root.replaceChildren();

  const hero = document.createElement("div");
  hero.className = "mwi-settings-hero";
  const heroCopy = document.createElement("div");
  const heading = document.createElement("div");
  heading.className = "mwi-settings-title";
  heading.textContent = "MWITools";
  const subtitle = document.createElement("div");
  subtitle.className = "mwi-settings-subtitle";
  subtitle.textContent = runtime.config.isZH
    ? "所有设置会立即生效。功能数据与公会经验只保存在当前设备。"
    : "Settings apply immediately. Feature data and guild XP stay on this device.";
  heroCopy.append(heading, subtitle);
  const search = document.createElement("input");
  search.className = "mwi-settings-search";
  search.type = "search";
  search.placeholder = runtime.config.isZH
    ? "搜索功能或说明"
    : "Search settings";
  const heroActions = document.createElement("div");
  heroActions.className = "mwi-settings-hero-actions";
  heroActions.append(search);
  if (root.hasAttribute(SETTINGS_ROOT_ATTRIBUTE)) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "mwi-settings-close";
    close.dataset.mwitoolsSettingsClose = "";
    close.setAttribute("aria-label", runtime.config.isZH ? "关闭" : "Close");
    close.textContent = "×";
    heroActions.append(close);
  }
  hero.append(heroCopy, heroActions);
  root.append(hero);

  for (const [groupId, group] of Object.entries(runtime.settings.groups)) {
    const definitions = Object.values(runtime.settings.catalog).filter(
      (definition) =>
        definition.group === groupId &&
        !definition.parent &&
        !definition.hidden &&
        (runtime.settings.settingsMap[definition.id] || definition.control),
    );
    if (!definitions.length) continue;
    const section = document.createElement("section");
    section.className = "mwi-settings-group";
    const head = document.createElement("header");
    head.className = "mwi-settings-group-head";
    const groupTitle = document.createElement("div");
    groupTitle.className = "mwi-settings-group-title";
    groupTitle.textContent = localizedText(group.title);
    const groupSummary = document.createElement("div");
    groupSummary.className = "mwi-settings-group-summary";
    groupSummary.textContent = localizedText(group.summary);
    head.append(groupTitle, groupSummary);
    const grid = document.createElement("div");
    grid.className = "mwi-settings-grid";
    if (groupId === "general") grid.append(createPerformanceSettingsCard());
    for (const definition of definitions) {
      grid.appendChild(createSettingCard(definition));
    }
    section.append(head, grid);
    root.append(section);
  }

  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    for (const card of root.querySelectorAll(
      ".mwi-setting-card,.mwi-performance-settings-card",
    )) {
      card.hidden = Boolean(query) && !card.dataset.search.includes(query);
    }
    for (const group of root.querySelectorAll(".mwi-settings-group")) {
      group.hidden = ![
        ...group.querySelectorAll(
          ".mwi-setting-card,.mwi-performance-settings-card",
        ),
      ].some((card) => !card.hidden);
    }
  });
}

function positionSettingsPopover() {
  const button = document.getElementById(SETTINGS_BUTTON_ID);
  const popover = document.getElementById(SETTINGS_POPOVER_ID);
  if (!button || !popover || popover.hidden) return;
  const rect = button.getBoundingClientRect();
  const viewportWidth = Math.max(
    320,
    globalThis.innerWidth || document.documentElement?.clientWidth || 0,
  );
  const viewportHeight = Math.max(
    320,
    globalThis.innerHeight || document.documentElement?.clientHeight || 0,
  );
  const margin = 8;
  const width = Math.min(620, viewportWidth - margin * 2);
  let top = rect.bottom + 6;
  let maxHeight = viewportHeight - top - margin;
  if (maxHeight < 240) {
    top = margin;
    maxHeight = viewportHeight - margin * 2;
  }
  const left = Math.min(
    viewportWidth - width - margin,
    Math.max(margin, rect.right - width),
  );
  Object.assign(popover.style, {
    width: `${width}px`,
    maxHeight: `${Math.max(180, maxHeight)}px`,
    left: `${left}px`,
    top: `${top}px`,
  });
}

function closeSettingsPopover({ restoreFocus = false } = {}) {
  const button = document.getElementById(SETTINGS_BUTTON_ID);
  const popover = document.getElementById(SETTINGS_POPOVER_ID);
  if (!popover || popover.hidden) return false;
  popover.hidden = true;
  button?.setAttribute("aria-expanded", "false");
  if (restoreFocus) button?.focus();
  return true;
}

function ensureSettingsPopover() {
  let popover = document.getElementById(SETTINGS_POPOVER_ID);
  if (popover) {
    popover.setAttribute(
      "aria-label",
      runtime.config.isZH ? "MWITools 快捷设置" : "MWITools quick settings",
    );
    return popover;
  }
  popover = document.createElement("section");
  popover.id = SETTINGS_POPOVER_ID;
  popover.hidden = true;
  popover.setAttribute("role", "dialog");
  popover.setAttribute(
    "aria-label",
    runtime.config.isZH ? "MWITools 快捷设置" : "MWITools quick settings",
  );
  const root = document.createElement("div");
  root.setAttribute(SETTINGS_ROOT_ATTRIBUTE, "");
  popover.append(root);
  popover.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-mwitools-settings-close]")) {
      closeSettingsPopover({ restoreFocus: true });
    }
  });
  document.body.append(popover);
  renderSettings(root);
  return popover;
}

function toggleSettingsPopover() {
  const button = document.getElementById(SETTINGS_BUTTON_ID);
  const popover = ensureSettingsPopover();
  if (!button) return false;
  if (!popover.hidden) return closeSettingsPopover();
  renderSettings(popover.querySelector(`[${SETTINGS_ROOT_ATTRIBUTE}]`));
  popover.hidden = false;
  button.setAttribute("aria-expanded", "true");
  positionSettingsPopover();
  popover.querySelector(".mwi-settings-search")?.focus();
  return true;
}

function ensureSettingsLauncher() {
  const host = ensureHeaderToolsHost();
  if (!host) return null;
  let button = document.getElementById(SETTINGS_BUTTON_ID);
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.id = SETTINGS_BUTTON_ID;
    button.textContent = "⚙";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", SETTINGS_POPOVER_ID);
    button.addEventListener("click", () => toggleSettingsPopover());
  }
  button.setAttribute(
    "aria-label",
    runtime.config.isZH ? "MWITools 快捷设置" : "MWITools quick settings",
  );
  if (button.parentElement !== host || button !== host.firstElementChild) {
    host.prepend(button);
  }
  return button;
}

function restoreNativeSettingsPanels(tabList, panelsContainer, selectedTab) {
  const customTab = tabList?.querySelector(`[${SETTINGS_TAB_ATTRIBUTE}]`);
  const customPanel = panelsContainer?.querySelector(
    `[${SETTINGS_PANEL_ATTRIBUTE}]`,
  );
  if (!customTab || !customPanel) return;
  customTab.setAttribute("aria-selected", "false");
  customTab.tabIndex = -1;
  customTab.classList.remove("Mui-selected");
  customPanel.hidden = true;
  const nativeTabs = [
    ...tabList.querySelectorAll(
      'button[role="tab"]:not([data-mwitools-settings-tab])',
    ),
  ];
  if (selectedTab) {
    for (const tab of nativeTabs) {
      const selected = tab === selectedTab;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.classList.toggle("Mui-selected", selected);
    }
  }
  for (const panel of panelsContainer.children) {
    if (panel !== customPanel) panel.hidden = false;
  }
  const indicator = tabList.querySelector('[class*="MuiTabs-indicator"]');
  if (indicator?.dataset.mwitoolsOriginalStyle != null) {
    const originalStyle = indicator.dataset.mwitoolsOriginalStyle;
    if (originalStyle) indicator.setAttribute("style", originalStyle);
    else indicator.removeAttribute("style");
    delete indicator.dataset.mwitoolsOriginalStyle;
  }
}

function ensureSettingsPanel() {
  const settingsPanel = document.querySelector(
    '[class*="SettingsPanel_settingsPanel"]',
  );
  const tabList = settingsPanel?.querySelector('[role="tablist"]');
  const nativePanels = [
    ...(settingsPanel?.querySelectorAll(
      '[class*="TabPanel_tabPanel"]:not([data-mwitools-settings-panel])',
    ) ?? []),
  ];
  const panelsContainer =
    settingsPanel?.querySelector(
      '[class*="TabsComponent_tabPanelsContainer"]',
    ) ?? nativePanels[0]?.parentElement;
  const nativeTabs = [
    ...(tabList?.querySelectorAll(
      'button[role="tab"]:not([data-mwitools-settings-tab])',
    ) ?? []),
  ];
  if (
    !tabList ||
    !panelsContainer ||
    !nativeTabs.length ||
    !nativePanels.length
  )
    return;

  let customTab = tabList.querySelector(`[${SETTINGS_TAB_ATTRIBUTE}]`);
  if (!customTab) {
    customTab = nativeTabs.at(-1).cloneNode(true);
    customTab.removeAttribute("id");
    customTab.removeAttribute("aria-controls");
    customTab.setAttribute(SETTINGS_TAB_ATTRIBUTE, "");
    customTab.setAttribute("aria-selected", "false");
    customTab.tabIndex = -1;
    customTab.classList.remove("Mui-selected");
    customTab.textContent = "MWITools";
    tabList.append(customTab);
  }

  let customPanel = panelsContainer.querySelector(
    `[${SETTINGS_PANEL_ATTRIBUTE}]`,
  );
  if (!customPanel) {
    customPanel = document.createElement("div");
    customPanel.className = nativePanels[0].className;
    customPanel.setAttribute(SETTINGS_PANEL_ATTRIBUTE, "");
    customPanel.setAttribute("role", "tabpanel");
    customPanel.hidden = true;
    panelsContainer.append(customPanel);
  }

  let root = document.querySelector("#script_settings");
  if (!root) {
    root = document.createElement("div");
    root.id = "script_settings";
  }
  if (root.parentElement !== customPanel) customPanel.append(root);
  if (root.dataset.mwitoolsVersion !== "3") {
    root.dataset.mwitoolsVersion = "3";
    renderSettings(root);
  }

  if (!customTab._mwitoolsActivateSettings) {
    const activate = () => {
      for (const tab of nativeTabs) {
        tab.setAttribute("aria-selected", "false");
        tab.tabIndex = -1;
        tab.classList.remove("Mui-selected");
      }
      for (const panel of nativePanels) panel.hidden = true;
      customTab.setAttribute("aria-selected", "true");
      customTab.tabIndex = 0;
      customTab.classList.add("Mui-selected");
      customPanel.hidden = false;
      const indicator = tabList.querySelector('[class*="MuiTabs-indicator"]');
      if (indicator) {
        if (indicator.dataset.mwitoolsOriginalStyle == null) {
          indicator.dataset.mwitoolsOriginalStyle =
            indicator.getAttribute("style") ?? "";
        }
        indicator.style.left = `${customTab.offsetLeft}px`;
        indicator.style.width = `${customTab.offsetWidth}px`;
      }
    };
    customTab.addEventListener("click", activate);
    customTab._mwitoolsActivateSettings = activate;
  }

  if (!tabList._mwitoolsRestoreSettings) {
    const restore = (event) => {
      if (event.target.closest?.(`[${SETTINGS_TAB_ATTRIBUTE}]`)) return;
      const selectedTab = event.target.closest?.('button[role="tab"]');
      if (!selectedTab) return;
      setTimeout(() =>
        restoreNativeSettingsPanels(tabList, panelsContainer, selectedTab),
      );
    };
    tabList.addEventListener("click", restore);
    tabList._mwitoolsRestoreSettings = restore;
  }
}

function getEquipmentWarning() {
  if (runtime.state.labyrinthActive) return null;
  const currentActionHrid =
    runtime.state.currentActionsHridList?.[0]?.actionHrid;
  if (!currentActionHrid) return null;
  const hasHat =
    runtime.state.currentEquipmentMap["/item_locations/head"]?.itemHrid ===
    "/items/red_culinary_hat"
      ? true
      : false; // Cooking, Brewing
  const hasOffHand =
    runtime.state.currentEquipmentMap["/item_locations/off_hand"]?.itemHrid ===
    "/items/eye_watch"
      ? true
      : false; // Cheesesmithing, Crafting, Tailoring
  const hasBoot =
    runtime.state.currentEquipmentMap["/item_locations/feet"]?.itemHrid ===
    "/items/collectors_boots"
      ? true
      : false; // Milking, Foraging, Woodcutting
  const hasGlove =
    runtime.state.currentEquipmentMap["/item_locations/hands"]?.itemHrid ===
    "/items/enchanted_gloves"
      ? true
      : false; // Enhancing

  if (currentActionHrid.includes("/actions/combat/")) {
    if (hasHat || hasOffHand || hasBoot || hasGlove) {
      return {
        code: "skilling-gear-in-combat",
        text: runtime.config.isZH
          ? "正在穿着生活装备"
          : "Skilling gear equipped in combat",
      };
    }
  } else if (
    currentActionHrid.includes("/actions/cooking/") ||
    currentActionHrid.includes("/actions/brewing/")
  ) {
    if (!hasHat && hasItemHridInInv("/items/red_culinary_hat")) {
      return {
        code: "missing-production-hat",
        itemHrid: "/items/red_culinary_hat",
        text: runtime.config.isZH
          ? "未装备生活帽"
          : "Skilling hat not equipped",
      };
    }
  } else if (
    currentActionHrid.includes("/actions/cheesesmithing/") ||
    currentActionHrid.includes("/actions/crafting/") ||
    currentActionHrid.includes("/actions/tailoring/")
  ) {
    if (!hasOffHand && hasItemHridInInv("/items/eye_watch")) {
      return {
        code: "missing-production-off-hand",
        itemHrid: "/items/eye_watch",
        text: runtime.config.isZH
          ? "未装备生活副手"
          : "Skilling off-hand not equipped",
      };
    }
  } else if (
    currentActionHrid.includes("/actions/milking/") ||
    currentActionHrid.includes("/actions/foraging/") ||
    currentActionHrid.includes("/actions/woodcutting/")
  ) {
    if (!hasBoot && hasItemHridInInv("/items/collectors_boots")) {
      return {
        code: "missing-production-boots",
        itemHrid: "/items/collectors_boots",
        text: runtime.config.isZH
          ? "未装备生活鞋"
          : "Skilling boots not equipped",
      };
    }
  } else if (currentActionHrid.includes("/actions/enhancing")) {
    if (!hasGlove && hasItemHridInInv("/items/enchanted_gloves")) {
      return {
        code: "missing-enhancing-gloves",
        itemHrid: "/items/enchanted_gloves",
        text: runtime.config.isZH
          ? "未装备强化手套"
          : "Enhancing gloves not equipped",
      };
    }
  }
  return null;
}

function addEquipmentWarningStyles() {
  if (document.getElementById(EQUIPMENT_WARNING_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = EQUIPMENT_WARNING_STYLE_ID;
  style.textContent = `
    .mwi-equipment-warning-host { position:relative!important; }
    @keyframes mwi-equipment-warning-pulse { 0%,100% { box-shadow:0 0 0 2px rgba(255,75,75,.38),0 2px 10px rgba(0,0,0,.42); } 50% { box-shadow:0 0 0 4px rgba(255,75,75,.16),0 2px 12px rgba(0,0,0,.5); } }
    #script_item_warning { position:absolute; z-index:7; display:flex; box-sizing:border-box; min-width:28px; max-width:var(--mwi-equipment-warning-space,216px); height:22px; align-items:center; gap:5px; padding:1px 7px; border:2px solid #ff5b5b; outline:1px solid rgba(255,194,194,.72); outline-offset:2px; border-radius:999px; background:rgba(91,14,22,.96); color:#fff4f4; box-shadow:0 0 0 2px rgba(255,75,75,.38),0 2px 10px rgba(0,0,0,.42); text-shadow:0 1px 1px rgba(0,0,0,.9); font:inherit; font-size:calc(.6875rem * var(--mwi-ui-font-scale,1)); font-weight:750; line-height:1; white-space:nowrap; overflow:hidden; pointer-events:none; animation:mwi-equipment-warning-pulse 1.8s ease-in-out infinite; }
    .mwi-equipment-warning-icon { flex:0 0 auto; color:#ffb7b7; font-size:.78rem; }
    .mwi-equipment-warning-text { min-width:0; overflow:hidden; text-overflow:ellipsis; }
    @media(prefers-reduced-motion:reduce) { #script_item_warning { animation:none; } }
    @media(max-width:680px) { #script_item_warning { width:28px; max-width:28px; justify-content:center; padding:2px; } .mwi-equipment-warning-text { display:none; } }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function removeEquipmentWarning() {
  document.querySelector("#script_item_warning")?.remove();
  document
    .querySelectorAll(".mwi-equipment-warning-host")
    .forEach((host) => host.classList.remove("mwi-equipment-warning-host"));
}

function positionEquipmentWarning(warning, host, communityBuffs) {
  const hostRect = host.getBoundingClientRect();
  const anchorRect = communityBuffs.getBoundingClientRect();
  const left = Math.max(0, anchorRect.left - hostRect.left);
  const top = Math.max(0, anchorRect.bottom - hostRect.top + 4);
  const viewportWidth = host.ownerDocument?.defaultView?.innerWidth ?? 0;
  const availableInViewport = viewportWidth
    ? Math.max(26, viewportWidth - hostRect.left - left - 12)
    : anchorRect.width;
  warning.style.left = `${left}px`;
  warning.style.top = `${top}px`;
  warning.style.setProperty(
    "--mwi-equipment-warning-space",
    `${Math.min(216, anchorRect.width || 216, availableInViewport)}px`,
  );
}

/* 检查是否穿错生产/战斗装备 */
function checkEquipment() {
  const warningState = getEquipmentWarning();
  const host = document.querySelector('div[class*="Header_actionInfo"]');
  const communityBuffs = host?.querySelector(
    'div[class*="Header_communityBuffs"]',
  );
  if (!warningState || !host || !communityBuffs) {
    removeEquipmentWarning();
    return warningState;
  }

  addEquipmentWarningStyles();
  document
    .querySelectorAll(".mwi-equipment-warning-host")
    .forEach((element) => {
      if (element !== host)
        element.classList.remove("mwi-equipment-warning-host");
    });
  host.classList.add("mwi-equipment-warning-host");
  let warning = document.querySelector("#script_item_warning");
  if (!warning) {
    warning = document.createElement("div");
    warning.id = "script_item_warning";
    warning.setAttribute("role", "status");
    const icon = document.createElement("span");
    icon.className = "mwi-equipment-warning-icon";
    icon.textContent = "⚠";
    const text = document.createElement("span");
    text.className = "mwi-equipment-warning-text";
    warning.append(icon, text);
  }
  if (warning.parentElement !== host) host.appendChild(warning);
  warning.dataset.code = warningState.code;
  warning.querySelector(".mwi-equipment-warning-text").textContent =
    warningState.text;
  warning.title = warningState.text;
  positionEquipmentWarning(warning, host, communityBuffs);
  return warningState;
}

function hasItemHridInInv(hrid) {
  let result = null;
  for (const item of runtime.state.initData_characterItems) {
    if (
      item.itemHrid === hrid &&
      item.itemLocationHrid === "/item_locations/inventory"
    ) {
      result = item;
    }
  }
  return result ? true : false;
}

/* 空闲时弹窗通知 */
function notificate() {
  if (typeof GM_notification === "undefined" || !GM_notification) {
    console.error(
      runtime.config.isZH
        ? "[MWITools] 当前环境不支持系统通知。"
        : "[MWITools] System notifications are unavailable.",
    );
    return;
  }
  if (runtime.state.currentActionsHridList.length > 0) {
    return;
  }
  console.log(
    runtime.config.isZH
      ? "[MWITools] 行动队列为空，发送系统通知。"
      : "[MWITools] Action queue is empty; sending a notification.",
  );
  GM_notification({
    text: runtime.config.isZH ? "动作队列为空" : "Action queue is empty.",
    title: "MWITools",
  });
}

/* 市场价格自动输入最小压价 */
function handleMarketNewOrder(node) {
  const title = runtime.api.getOriTextFromElement(
    node.querySelector(".MarketplacePanel_header__yahJo"),
  );
  const normalizedTitle = String(title ?? "").toLocaleLowerCase();
  const immediateTitles = [
    getGameTranslation("marketplacePanel.buyNow"),
    getGameTranslation("marketplacePanel.sellNow"),
    "Buy Now",
    "Sell Now",
    "立即购买",
    "立即出售",
  ]
    .filter(Boolean)
    .map((value) => value.toLocaleLowerCase());
  if (
    !title ||
    immediateTitles.some((value) => normalizedTitle.includes(value))
  ) {
    return;
  }
  const label = node.querySelector("span.MarketplacePanel_bestPrice__3bgKp");
  const inputDiv = node.querySelector(
    ".MarketplacePanel_inputContainer__3xmB2 .MarketplacePanel_priceInputs__3iWxy",
  );
  if (!label || !inputDiv) {
    console.error(
      runtime.config.isZH
        ? "[MWITools] 市场订单窗口缺少价格输入控件。"
        : "[MWITools] The market order dialog is missing price controls.",
    );
    return;
  }

  label.click();

  const clickAdjustmentButton = (direction) => {
    const buttons = [...inputDiv.querySelectorAll("button")];
    const target = buttons.find((button) => {
      const label =
        `${button.textContent} ${button.getAttribute("aria-label") ?? ""} ${button.title ?? ""}`
          .trim()
          .toLowerCase();
      if (direction === "increase") {
        return label === "+" || label.includes("increase");
      }
      return label === "-" || label === "−" || label.includes("decrease");
    });
    target?.click();
    return Boolean(target);
  };

  const priceLabel = String(
    runtime.api.getOriTextFromElement(label.parentElement) ??
      label.parentElement.textContent ??
      "",
  ).toLocaleLowerCase();
  const buyLabel = getGameTranslation(
    "marketplacePanel.buy",
  ).toLocaleLowerCase();
  const sellLabel = getGameTranslation(
    "marketplacePanel.sell",
  ).toLocaleLowerCase();
  if (
    matchesGameTranslation("marketplacePanel.priceBestBuyOffer", priceLabel) ||
    priceLabel.includes("best buy") ||
    priceLabel.includes("购买") ||
    (buyLabel && priceLabel.includes(buyLabel))
  ) {
    if (!clickAdjustmentButton("increase")) {
      console.error(
        runtime.config.isZH
          ? "[MWITools] 未找到提高收购价按钮。"
          : "[MWITools] The increase-bid-price button was not found.",
      );
    }
  } else if (
    matchesGameTranslation("marketplacePanel.priceBestSellOffer", priceLabel) ||
    priceLabel.includes("best sell") ||
    priceLabel.includes("出售") ||
    (sellLabel && priceLabel.includes(sellLabel))
  ) {
    if (!clickAdjustmentButton("decrease")) {
      console.error(
        runtime.config.isZH
          ? "[MWITools] 未找到降低出售价按钮。"
          : "[MWITools] The decrease-ask-price button was not found.",
      );
    }
  }
}

/* 伤害统计 */

Object.assign(runtime.api, {
  persistSettings,
  readSettings,
  getTooltipProfitShortcut,
  setTooltipProfitShortcut,
  matchesTooltipProfitShortcut,
  getGuildCreditRecommendationCount,
  setGuildCreditRecommendationCount,
  getEquipmentWarning,
  checkEquipment,
  hasItemHridInInv,
  notificate,
  handleMarketNewOrder,
});

runtime.features.register({
  id: "settingsUi",
  scope: "global",
  initialize({ scope }) {
    addSettingsStyles();
    ensureSettingsPanel();
    ensureSettingsLauncher();
    const render = () => {
      addSettingsStyles();
      ensureSettingsPanel();
      ensureSettingsLauncher();
    };
    const scheduler = createFrameScheduler(render);
    subscribeMutationChannel(
      {
        name: "header-mount",
        target: document.body,
        options: { childList: true, subtree: true },
        scope,
      },
      (records) => {
        const relevant = records.some((record) => {
          const target =
            record.target?.nodeType === 1
              ? record.target
              : record.target?.parentElement;
          if (
            target?.closest?.(
              `#script_settings,[${SETTINGS_ROOT_ATTRIBUTE}],[${SETTINGS_TAB_ATTRIBUTE}],[${SETTINGS_PANEL_ATTRIBUTE}],#${SETTINGS_BUTTON_ID},#${SETTINGS_POPOVER_ID},#${HEADER_TOOLS_ID}`,
            )
          ) {
            return false;
          }
          if (target?.closest?.('[class*="SettingsPanel_settingsPanel"]')) {
            return true;
          }
          return [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              node?.nodeType === 1 &&
              (node.matches?.(
                '[class*="SettingsPanel_settingsPanel"],[class*="Header_totalLevel"],[class*="totalLevel"]',
              ) ||
                node.querySelector?.(
                  '[class*="SettingsPanel_settingsPanel"],[class*="Header_totalLevel"],[class*="totalLevel"]',
                )),
          );
        });
        if (relevant) scheduler.schedule();
      },
    );
    scope.event(document, "click", (event) => {
      const popover = document.getElementById(SETTINGS_POPOVER_ID);
      if (
        !popover ||
        popover.hidden ||
        popover.contains(event.target) ||
        event.target.closest?.(`#${SETTINGS_BUTTON_ID}`)
      ) {
        return;
      }
      closeSettingsPopover();
    });
    scope.event(document, "keydown", (event) => {
      if (event.key === "Escape") {
        closeSettingsPopover({ restoreFocus: true });
      }
    });
    scope.event(globalThis, "resize", positionSettingsPopover);
    scope.event(globalThis, "scroll", positionSettingsPopover, true);
    scope.add(() => {
      scheduler.cancel();
      for (const root of settingsRoots()) cleanupSettingsRoot(root);
      const customTab = document.querySelector(`[${SETTINGS_TAB_ATTRIBUTE}]`);
      const tabList = customTab?.parentElement;
      if (tabList?._mwitoolsRestoreSettings) {
        tabList.removeEventListener("click", tabList._mwitoolsRestoreSettings);
        delete tabList._mwitoolsRestoreSettings;
      }
      customTab?.remove();
      document.querySelector(`[${SETTINGS_PANEL_ATTRIBUTE}]`)?.remove();
      document.querySelector("#script_settings")?.remove();
      document.getElementById(SETTINGS_POPOVER_ID)?.remove();
      document.getElementById(SETTINGS_BUTTON_ID)?.remove();
      removeHeaderToolsHostIfEmpty();
      document.getElementById(SETTINGS_STYLE_ID)?.remove();
    });
  },
});
