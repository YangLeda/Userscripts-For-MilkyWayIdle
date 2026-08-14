import { runtime } from "./runtime.js";

export const PERFORMANCE_PROFILE_STORAGE_KEY =
  "MWITools_performance_profile_v1";
export const PERFORMANCE_PROFILE_VERSION = 1;

const USAGES = Object.freeze(["life", "combat", "balanced"]);
const TIERS = Object.freeze(["smooth", "standard", "full", "custom"]);
const REFRESH_INTERVALS = Object.freeze([1000, 2000]);
const EXISTING_SETTINGS_AT_LOAD = Boolean(
  globalThis.localStorage?.getItem("MWITools_settings_v2") ||
  globalThis.localStorage?.getItem("script_settingsMap"),
);

const GUILD_SETTINGS = Object.freeze([
  "guildXpTracking",
  "guildOverview",
  "guildMemberXp",
  "guildLeaderboardXp",
  "guildIdleMembers",
  "leaderboardOverlay",
  "leaderboardXpRate",
]);
const COMPLEX_CALCULATION_SETTINGS = Object.freeze([
  "actionBarProfit",
  "productionProfit",
  "itemTooltip_profit",
  "lootChestEstimate",
  "enhanceSim",
]);

const DEFAULT_CHOICES = Object.freeze({
  dps: true,
  battleBuffs: true,
  taskEnhancements: true,
  taskArt: true,
  assetHistory: true,
  totalAssetsAndSort: true,
  productionSummary: true,
  complexCalculations: true,
  guildEnhancements: true,
  decorativeAnimations: true,
  dpsGraph: false,
  refreshIntervalMs: 1000,
});

function normalizeUsage(value) {
  return USAGES.includes(value) ? value : "balanced";
}

function normalizeTier(value) {
  return TIERS.includes(value) ? value : "standard";
}

function normalizeRefreshInterval(value) {
  const interval = Number(value);
  return REFRESH_INTERVALS.includes(interval) ? interval : 1000;
}

function normalizeChoices(value = {}, fallback = DEFAULT_CHOICES) {
  return {
    dps: Boolean(value.dps ?? fallback.dps),
    battleBuffs: Boolean(value.battleBuffs ?? fallback.battleBuffs),
    taskEnhancements: Boolean(
      value.taskEnhancements ?? fallback.taskEnhancements,
    ),
    taskArt: Boolean(value.taskArt ?? fallback.taskArt),
    assetHistory: Boolean(value.assetHistory ?? fallback.assetHistory),
    totalAssetsAndSort: Boolean(
      value.totalAssetsAndSort ?? fallback.totalAssetsAndSort,
    ),
    productionSummary: Boolean(
      value.productionSummary ?? fallback.productionSummary,
    ),
    complexCalculations: Boolean(
      value.complexCalculations ?? fallback.complexCalculations,
    ),
    guildEnhancements: Boolean(
      value.guildEnhancements ?? fallback.guildEnhancements,
    ),
    decorativeAnimations: Boolean(
      value.decorativeAnimations ?? fallback.decorativeAnimations,
    ),
    dpsGraph: Boolean(value.dpsGraph ?? fallback.dpsGraph),
    refreshIntervalMs: normalizeRefreshInterval(
      value.refreshIntervalMs ?? fallback.refreshIntervalMs,
    ),
  };
}

function normalizeStoredProfile(value) {
  const profile = value && typeof value === "object" ? value : {};
  return {
    version: PERFORMANCE_PROFILE_VERSION,
    completed:
      profile.version === PERFORMANCE_PROFILE_VERSION &&
      profile.completed === true,
    usage: normalizeUsage(profile.usage),
    tier: normalizeTier(profile.tier),
    choices: normalizeChoices(profile.choices),
  };
}

function loadStoredProfile() {
  try {
    return normalizeStoredProfile(
      JSON.parse(
        globalThis.localStorage?.getItem(PERFORMANCE_PROFILE_STORAGE_KEY) ||
          "null",
      ),
    );
  } catch {
    return normalizeStoredProfile(null);
  }
}

let storedProfile = loadStoredProfile();

function saveStoredProfile(profile) {
  storedProfile = normalizeStoredProfile({
    ...profile,
    version: PERFORMANCE_PROFILE_VERSION,
    completed: true,
  });
  globalThis.localStorage?.setItem(
    PERFORMANCE_PROFILE_STORAGE_KEY,
    JSON.stringify(storedProfile),
  );
  return storedProfile;
}

export function resolveConditionalRule(rule, usage) {
  const normalizedUsage = normalizeUsage(usage);
  if (rule === "all-on") return true;
  if (rule === "all-off") return false;
  if (rule === "combat-on") return normalizedUsage !== "life";
  if (rule === "life-on") return normalizedUsage !== "combat";
  return Boolean(rule);
}

export function resolvePresetChoices(usage, tier) {
  const normalizedUsage = normalizeUsage(usage);
  const normalizedTier = normalizeTier(tier);
  if (normalizedTier === "custom") return normalizeChoices();
  return normalizeChoices({
    dps: resolveConditionalRule(
      normalizedTier === "smooth" ? "combat-on" : "all-on",
      normalizedUsage,
    ),
    battleBuffs: resolveConditionalRule(
      normalizedTier === "smooth"
        ? "all-off"
        : normalizedTier === "standard"
          ? "combat-on"
          : "all-on",
      normalizedUsage,
    ),
    taskEnhancements: true,
    taskArt: true,
    assetHistory: normalizedTier !== "smooth",
    totalAssetsAndSort: true,
    productionSummary: true,
    complexCalculations: true,
    guildEnhancements: true,
    decorativeAnimations: normalizedTier !== "smooth",
    dpsGraph: normalizedTier === "full",
    refreshIntervalMs: normalizedTier === "smooth" ? 2000 : 1000,
  });
}

function configurationFromChoices(choices) {
  const normalized = normalizeChoices(choices);
  const values = {
    showDamage: normalized.dps,
    battleBuffs: normalized.battleBuffs,
    taskInsights: normalized.taskEnhancements,
    taskIcons: normalized.taskEnhancements && normalized.taskArt,
    assetHistory: normalized.assetHistory,
    invWorth: normalized.totalAssetsAndSort,
    invSort: normalized.totalAssetsAndSort,
    actionPanel_totalTime: true,
    productionSummary: normalized.productionSummary,
    itemTooltip_prices: true,
    itemTooltip_profitRequireKey: true,
    leaderboardBadgeGlint:
      normalized.guildEnhancements && normalized.decorativeAnimations,
  };
  for (const id of COMPLEX_CALCULATION_SETTINGS) {
    values[id] = normalized.complexCalculations;
  }
  for (const id of GUILD_SETTINGS) {
    values[id] = normalized.guildEnhancements;
  }
  return {
    values,
    preferences: {
      productionSummaryMode: normalized.productionSummary ? "collapsed" : "off",
    },
    dps: {
      showGraph: normalized.dpsGraph,
      recountShowGraph: normalized.dpsGraph,
      refreshIntervalMs: normalized.refreshIntervalMs,
    },
    decorativeAnimations: normalized.decorativeAnimations,
  };
}

function currentChoices() {
  const get = (id) => Boolean(runtime.settings.get?.(id));
  const dps = runtime.api.dpsPerformance?.get?.() ?? {};
  const decorativeMotion =
    globalThis.document?.documentElement?.dataset.mwitoolsDecorativeMotion;
  const summaryMode =
    runtime.settings.getPreference?.("productionSummaryMode") ?? "collapsed";
  return normalizeChoices({
    dps: get("showDamage"),
    battleBuffs: get("battleBuffs"),
    taskEnhancements: get("taskInsights"),
    taskArt: get("taskIcons"),
    assetHistory: get("assetHistory"),
    totalAssetsAndSort: get("invWorth") && get("invSort"),
    productionSummary: get("productionSummary") && summaryMode !== "off",
    complexCalculations: COMPLEX_CALCULATION_SETTINGS.every(get),
    guildEnhancements: GUILD_SETTINGS.every(get),
    decorativeAnimations:
      decorativeMotion === "on" ||
      (decorativeMotion !== "off" && get("leaderboardBadgeGlint")),
    dpsGraph: Boolean(dps.showGraph && dps.recountShowGraph),
    refreshIntervalMs: dps.refreshIntervalMs,
  });
}

function choicesMatch(left, right) {
  return Object.keys(DEFAULT_CHOICES).every((key) => left[key] === right[key]);
}

function applyDecorativeMotion(enabled) {
  const root = globalThis.document?.documentElement;
  if (root) root.dataset.mwitoolsDecorativeMotion = enabled ? "on" : "off";
}

function emitProfileChange() {
  const EventRef =
    globalThis.CustomEvent ?? globalThis.document?.defaultView?.CustomEvent;
  if (!EventRef || !globalThis.document?.dispatchEvent) return;
  globalThis.document.dispatchEvent(
    new EventRef("mwitools:performance-profile-change", {
      detail: getProfileState(),
    }),
  );
}

export function getProfileState() {
  const current = currentChoices();
  const tier = normalizeTier(storedProfile.tier);
  const matches =
    tier !== "custom" &&
    choicesMatch(current, resolvePresetChoices(storedProfile.usage, tier));
  return {
    ...storedProfile,
    tier: matches ? tier : "custom",
    choices: current,
  };
}

export function shouldRunPerformanceOnboarding() {
  return !storedProfile.completed;
}

export function recommendPerformanceTier(
  windowRef = globalThis.window ?? globalThis,
) {
  const coarse = Boolean(
    windowRef.matchMedia?.("(any-pointer: coarse)")?.matches,
  );
  const narrow =
    Number(windowRef.innerWidth) > 0 && windowRef.innerWidth <= 760;
  return coarse || narrow ? "smooth" : "standard";
}

export function hasExistingSettingsAtLoad() {
  return EXISTING_SETTINGS_AT_LOAD;
}

export async function applyPerformanceProfile({
  usage = "balanced",
  tier = "standard",
  choices = null,
} = {}) {
  const normalizedUsage = normalizeUsage(usage);
  const normalizedTier = normalizeTier(tier);
  const resolvedChoices =
    normalizedTier === "custom"
      ? normalizeChoices(choices, currentChoices())
      : resolvePresetChoices(normalizedUsage, normalizedTier);
  const configuration = configurationFromChoices(resolvedChoices);
  if (typeof runtime.settings.applyBatch !== "function") {
    throw new Error(
      runtime.config.isZH
        ? "MWITools 批量设置接口不可用"
        : "MWITools batch settings API is unavailable",
    );
  }
  await runtime.settings.applyBatch({
    values: configuration.values,
    preferences: configuration.preferences,
  });
  runtime.api.dpsPerformance?.set?.(configuration.dps);
  applyDecorativeMotion(configuration.decorativeAnimations);
  saveStoredProfile({
    usage: normalizedUsage,
    tier: normalizedTier,
    choices: resolvedChoices,
  });
  emitProfileChange();
  return getProfileState();
}

export async function completePerformanceOnboardingWithoutChanges() {
  if (!EXISTING_SETTINGS_AT_LOAD) {
    return applyPerformanceProfile({ usage: "balanced", tier: "standard" });
  }
  const choices = currentChoices();
  applyDecorativeMotion(choices.decorativeAnimations);
  saveStoredProfile({
    usage: storedProfile.usage,
    tier: "custom",
    choices,
  });
  emitProfileChange();
  return getProfileState();
}

export function initializePerformancePolicy() {
  applyDecorativeMotion(storedProfile.choices.decorativeAnimations);
  return getProfileState();
}

export function resetPerformanceProfileForTests() {
  storedProfile = loadStoredProfile();
  initializePerformancePolicy();
}

Object.assign(runtime.api, {
  performanceProfiles: {
    apply: applyPerformanceProfile,
    completeWithoutChanges: completePerformanceOnboardingWithoutChanges,
    currentChoices,
    getState: getProfileState,
    hasExistingSettingsAtLoad,
    initializePolicy: initializePerformancePolicy,
    recommendTier: recommendPerformanceTier,
    resolveConditionalRule,
    resolvePresetChoices,
    shouldRun: shouldRunPerformanceOnboarding,
  },
});
