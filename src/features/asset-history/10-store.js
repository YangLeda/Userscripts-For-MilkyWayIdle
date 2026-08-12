import { runtime } from "../../core/runtime.js";
import { ASSET_COMPONENT_KEYS } from "./00-snapshot.js";

export const ASSET_HISTORY_STORAGE_KEY = "MWITools_asset_history_v1";
export const ASSET_HISTORY_BACKUP_MARKER = "__mwitools_asset_history_backup__";
const LEGACY_KEYS = {
  total: "kbd_calc_data",
  breakdown: "kbd_calc_breakdown_data",
  tags: "kbd_calc_tags",
  tagPrefs: "kbd_calc_tag_prefs",
  tagPanel: "kbd_calc_tag_panel",
  dataPanel: "kbd_calc_data_panel",
  lastUpdate: "kbd_calc_last_update_at",
  goalTarget: "ep_goal_target",
  achievements: "ep_achievements_data",
  language: "ep_lang",
  tagColors: "ep_tag_colors",
  windowSize: "ep_window_size",
  chartSettings: "ep_chart_settings",
  heatmapStyle: "ep_heatmap_style",
  glassHeartMode: "ep_glass_heart_mode",
  themeMode: "ep_theme_mode",
  lightBg: "ep_light_bg",
};

export const ASSET_HISTORY_SCHEMA_VERSION = 2;

export const DEFAULT_ASSET_HISTORY_PREFERENCES = Object.freeze({
  language: null,
  themeMode: "dark",
  lightBg: { h: 38, s: 44 },
  glassHeartMode: false,
  windowSize: null,
  heatmapStyle: "B",
  tagColors: {},
  chart: {
    defaultView: "networth",
    defaultRange: 30,
    maWindow: 7,
    lineTension: 0.25,
  },
});

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function createEmptyData() {
  return {
    version: ASSET_HISTORY_SCHEMA_VERSION,
    roles: {},
    migrations: { everydayProfit: {} },
    legacy: {},
    preferences: structuredClonePreferences(),
  };
}

function structuredClonePreferences(value = DEFAULT_ASSET_HISTORY_PREFERENCES) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePreferences(input = {}) {
  const defaults = structuredClonePreferences();
  const chart = { ...defaults.chart, ...(input.chart ?? {}) };
  const range = chart.defaultRange;
  chart.defaultView = [
    "networth",
    "profit",
    "breakdown",
    "statsReport",
  ].includes(chart.defaultView)
    ? chart.defaultView
    : defaults.chart.defaultView;
  chart.defaultRange = [7, 15, 30, null].includes(range) ? range : 30;
  chart.maWindow = Math.min(90, Math.max(2, Number(chart.maWindow) || 7));
  chart.lineTension = [0, 0.15, 0.25, 0.4].includes(Number(chart.lineTension))
    ? Number(chart.lineTension)
    : 0.25;
  const lightBg = { ...defaults.lightBg, ...(input.lightBg ?? {}) };
  lightBg.h = Math.min(360, Math.max(0, Number(lightBg.h) || 0));
  lightBg.s = Math.min(60, Math.max(0, Number(lightBg.s) || 0));
  return {
    ...defaults,
    ...input,
    language: ["zh", "en"].includes(input.language) ? input.language : null,
    themeMode: input.themeMode === "light" ? "light" : "dark",
    lightBg,
    glassHeartMode: Boolean(input.glassHeartMode),
    windowSize:
      Number(input.windowSize?.w) > 0 && Number(input.windowSize?.h) > 0
        ? { w: Number(input.windowSize.w), h: Number(input.windowSize.h) }
        : null,
    heatmapStyle: ["A", "B", "C", "D"].includes(input.heatmapStyle)
      ? input.heatmapStyle
      : "B",
    tagColors:
      input.tagColors && typeof input.tagColors === "object"
        ? { ...input.tagColors }
        : {},
    chart,
  };
}

function normalizeRole(role = {}) {
  return {
    ...role,
    days: role.days && typeof role.days === "object" ? role.days : {},
    tags: role.tags && typeof role.tags === "object" ? role.tags : {},
    achievements:
      role.achievements && typeof role.achievements === "object"
        ? role.achievements
        : {},
    goalTarget:
      Number.isFinite(Number(role.goalTarget)) && Number(role.goalTarget) > 0
        ? Number(role.goalTarget)
        : null,
    tagVisibility: role.tagVisibility !== false,
    lastUpdate: role.lastUpdate ?? null,
  };
}

function migrateStoredData(loaded) {
  if (!loaded || typeof loaded !== "object") return createEmptyData();
  if (loaded.version !== 1 && loaded.version !== ASSET_HISTORY_SCHEMA_VERSION) {
    return createEmptyData();
  }
  return {
    ...loaded,
    version: ASSET_HISTORY_SCHEMA_VERSION,
    roles: Object.fromEntries(
      Object.entries(loaded.roles ?? {}).map(([key, role]) => [
        key,
        normalizeRole(role),
      ]),
    ),
    migrations: {
      ...(loaded.migrations ?? {}),
      everydayProfit: loaded.migrations?.everydayProfit ?? {},
    },
    legacy: loaded.legacy ?? {},
    preferences: normalizePreferences(loaded.preferences),
  };
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sumIfComplete(values, keys) {
  const parts = keys.map((key) => finiteOrNull(values[key]));
  return parts.every(Number.isFinite)
    ? parts.reduce((total, value) => total + value, 0)
    : null;
}

export function normalizeAssetValues(input = {}, options = {}) {
  const values = Object.fromEntries(
    ASSET_COMPONENT_KEYS.map((key) => [key, finiteOrNull(input[key])]),
  );
  values.liquid = sumIfComplete(values, [
    "equipment",
    "inventory",
    "marketListings",
  ]);
  values.fixed = sumIfComplete(values, [
    "houses",
    "abilities",
    "nonTradableTokens",
    "shrine",
  ]);
  values.total =
    Number.isFinite(values.liquid) && Number.isFinite(values.fixed)
      ? values.liquid + values.fixed
      : options.preserveTotal
        ? finiteOrNull(input.total)
        : null;
  return values;
}

export function getUtc8DayKey(date = new Date()) {
  return new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

function parseDayKey(dayKey) {
  const [year, month, day] = String(dayKey).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function dayGap(left, right) {
  return Math.round((parseDayKey(right) - parseDayKey(left)) / 86_400_000);
}

function roleBucketFromLegacy(data, roleName, characterId) {
  if (!data || typeof data !== "object") return {};
  if (roleName && data[roleName]) return data[roleName];
  if (characterId && data[characterId]) return data[characterId];
  const roles = Object.keys(data);
  return roles.length === 1 ? data[roles[0]] : {};
}

function legacyValues(total, breakdown = {}) {
  return normalizeAssetValues(
    {
      equipment: breakdown.equip,
      inventory: breakdown.inventory,
      marketListings: breakdown.orders,
      houses: breakdown.house,
      abilities: breakdown.skill,
      nonTradableTokens: null,
      shrine: null,
      total,
    },
    { preserveTotal: true },
  );
}

function mergeDays(base = {}, incoming = {}) {
  return { ...base, ...incoming };
}

function normalizeLegacyTags(input = {}) {
  return Object.fromEntries(
    Object.entries(input ?? {})
      .map(([date, tags]) => [
        date,
        (Array.isArray(tags) ? tags : [])
          .map((tag, index) => ({
            id:
              String(tag?.id ?? "").trim() ||
              `legacy-${date}-${String(index).padStart(3, "0")}`,
            text: String(tag?.text ?? "")
              .trim()
              .slice(0, 60),
            type: String(tag?.type ?? ""),
          }))
          .filter((tag) => tag.text),
      ])
      .filter(([, tags]) => tags.length),
  );
}

function mergeTagBuckets(base = {}, incoming = {}) {
  const result = { ...base };
  for (const [date, tags] of Object.entries(incoming)) {
    const known = new Set((result[date] ?? []).map((tag) => tag.id));
    result[date] = [
      ...(result[date] ?? []),
      ...tags.filter((tag) => !known.has(tag.id)),
    ];
  }
  return result;
}

function readLegacyPreferencePayload(storage, payload = null) {
  const read = (name, fallback = null) =>
    payload
      ? (payload[LEGACY_KEYS[name]] ?? fallback)
      : safeParse(storage?.getItem(LEGACY_KEYS[name]), fallback);
  const readText = (name) =>
    payload
      ? (payload[LEGACY_KEYS[name]] ?? null)
      : storage?.getItem(LEGACY_KEYS[name]);
  const result = {};
  const textFields = ["language", "themeMode", "heatmapStyle"];
  for (const field of textFields) {
    const value = readText(field);
    if (value !== null && value !== undefined) result[field] = value;
  }
  const objectFields = ["lightBg", "windowSize", "tagColors"];
  for (const field of objectFields) {
    const value = read(field, null);
    if (value !== null && value !== undefined) result[field] = value;
  }
  const glassHeartMode = readText("glassHeartMode");
  if (glassHeartMode !== null && glassHeartMode !== undefined) {
    result.glassHeartMode = glassHeartMode === true || glassHeartMode === "1";
  }
  const chart = read("chartSettings", null);
  if (chart && typeof chart === "object") result.chart = chart;
  return result;
}

function legacyPayloadFromStorage(storage) {
  return Object.fromEntries(
    Object.values(LEGACY_KEYS).map((key) => [
      key,
      safeParse(storage?.getItem(key), storage?.getItem(key)),
    ]),
  );
}

export class AssetHistoryStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    const loaded = safeParse(storage?.getItem(ASSET_HISTORY_STORAGE_KEY), null);
    this.data = migrateStoredData(loaded);
    if (loaded && loaded.version !== ASSET_HISTORY_SCHEMA_VERSION) this.save();
  }

  save() {
    this.storage?.setItem(ASSET_HISTORY_STORAGE_KEY, JSON.stringify(this.data));
  }

  scopeKey(characterId = runtime.state.currentCharacterId) {
    const server = runtime.api.getMarketEnvironment?.() ?? "production";
    return `${server}:${String(characterId ?? "")}`;
  }

  getRole(scopeKey = this.scopeKey()) {
    this.data.roles[scopeKey] = normalizeRole(this.data.roles[scopeKey]);
    return this.data.roles[scopeKey];
  }

  getPreferences() {
    this.data.preferences = normalizePreferences(this.data.preferences);
    return structuredClonePreferences(this.data.preferences);
  }

  setPreferences(patch = {}) {
    this.data.preferences = normalizePreferences({
      ...this.data.preferences,
      ...patch,
      chart: {
        ...(this.data.preferences?.chart ?? {}),
        ...(patch.chart ?? {}),
      },
      lightBg: {
        ...(this.data.preferences?.lightBg ?? {}),
        ...(patch.lightBg ?? {}),
      },
    });
    this.save();
    return this.getPreferences();
  }

  resetPreferences() {
    this.data.preferences = structuredClonePreferences();
    this.save();
    return this.getPreferences();
  }

  listTags(scopeKey = this.scopeKey()) {
    const tags = this.getRole(scopeKey).tags;
    return Object.entries(tags)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([date, values]) =>
        (Array.isArray(values) ? values : []).map((tag) => ({ ...tag, date })),
      );
  }

  addTag(date, text, type = "", scopeKey = this.scopeKey()) {
    const cleanText = String(text ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    if (!date || !cleanText) return null;
    const role = this.getRole(scopeKey);
    role.tags[date] ??= [];
    const tag = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      text: cleanText,
      type: String(type ?? ""),
    };
    role.tags[date].push(tag);
    this.save();
    return { ...tag, date };
  }

  updateTag(tagId, patch = {}, scopeKey = this.scopeKey()) {
    const role = this.getRole(scopeKey);
    for (const [date, tags] of Object.entries(role.tags)) {
      const tag = (tags ?? []).find((candidate) => candidate.id === tagId);
      if (!tag) continue;
      const cleanText = String(patch.text ?? tag.text)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
      if (!cleanText) return false;
      tag.text = cleanText;
      if (patch.type !== undefined) tag.type = String(patch.type ?? "");
      this.save();
      return { ...tag, date };
    }
    return false;
  }

  deleteTag(tagId, scopeKey = this.scopeKey()) {
    const role = this.getRole(scopeKey);
    for (const [date, tags] of Object.entries(role.tags)) {
      const next = (tags ?? []).filter((tag) => tag.id !== tagId);
      if (next.length === tags.length) continue;
      if (next.length) role.tags[date] = next;
      else delete role.tags[date];
      this.save();
      return true;
    }
    return false;
  }

  setTagVisibility(visible, scopeKey = this.scopeKey()) {
    this.getRole(scopeKey).tagVisibility = Boolean(visible);
    this.save();
    return Boolean(visible);
  }

  setGoalTarget(value, scopeKey = this.scopeKey()) {
    const target = Number(value);
    this.getRole(scopeKey).goalTarget =
      Number.isFinite(target) && target > 0 ? target : null;
    this.save();
    return this.getRole(scopeKey).goalTarget;
  }

  getGoalTarget(scopeKey = this.scopeKey()) {
    return this.getRole(scopeKey).goalTarget;
  }

  getAchievements(scopeKey = this.scopeKey()) {
    return { ...this.getRole(scopeKey).achievements };
  }

  syncAchievements(results, scopeKey = this.scopeKey()) {
    const role = this.getRole(scopeKey);
    let changed = false;
    for (const result of results ?? []) {
      if (!result?.unlocked || role.achievements[result.id]) continue;
      role.achievements[result.id] = {
        unlocked: true,
        date: result.date ?? null,
      };
      changed = true;
    }
    if (changed) this.save();
    return this.getAchievements(scopeKey);
  }

  list(scopeKey = this.scopeKey()) {
    return Object.entries(this.getRole(scopeKey).days).sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }

  record(snapshot, scopeKey = this.scopeKey(snapshot?.characterId)) {
    if (!snapshot?.complete) return false;
    const values = normalizeAssetValues(snapshot.values);
    if (!Number.isFinite(values.total)) return false;
    const dayKey = getUtc8DayKey(new Date(snapshot.recordedAt));
    const role = this.getRole(scopeKey);
    role.server = snapshot.server;
    role.characterId = snapshot.characterId;
    role.days[dayKey] = {
      recordedAt: snapshot.recordedAt,
      values,
    };
    this.save();
    return dayKey;
  }

  comparison(dayKey = getUtc8DayKey(), scopeKey = this.scopeKey()) {
    const entries = this.list(scopeKey).filter(([date]) => date < dayKey);
    if (!entries.length) return null;
    const yesterday = new Date(parseDayKey(dayKey) - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const exact = entries.find(([date]) => date === yesterday);
    const [date, record] = exact ?? entries.at(-1);
    return { date, record, gapDays: dayGap(date, dayKey) };
  }

  sevenDayAverage(dayKey = getUtc8DayKey(), scopeKey = this.scopeKey()) {
    const entries = this.list(scopeKey).filter(
      ([date, record]) =>
        date <= dayKey && Number.isFinite(record?.values?.total),
    );
    if (entries.length < 2) return null;
    const currentIndex = entries.findLastIndex(([date]) => date <= dayKey);
    const current = entries[currentIndex];
    let baseline = entries[Math.max(0, currentIndex - 1)];
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const candidate = entries[index];
      baseline = candidate;
      if (dayGap(candidate[0], current[0]) >= 7) break;
    }
    const gap = dayGap(baseline[0], current[0]);
    if (gap <= 0) return null;
    return (current[1].values.total - baseline[1].values.total) / gap;
  }

  updateDay(dayKey, componentValues, scopeKey = this.scopeKey()) {
    const values = normalizeAssetValues(componentValues);
    if (!ASSET_COMPONENT_KEYS.every((key) => Number.isFinite(values[key]))) {
      throw new TypeError("Every asset component needs a finite value");
    }
    this.getRole(scopeKey).days[dayKey] = {
      recordedAt: new Date().toISOString(),
      values,
      edited: true,
    };
    this.save();
    return values;
  }

  deleteDay(dayKey, scopeKey = this.scopeKey()) {
    const days = this.getRole(scopeKey).days;
    if (!Object.hasOwn(days, dayKey)) return false;
    delete days[dayKey];
    this.save();
    return true;
  }

  cleanupInvalid(scopeKey = this.scopeKey()) {
    let removed = 0;
    for (const [dayKey, record] of this.list(scopeKey)) {
      if (!Number.isFinite(record?.values?.total)) {
        delete this.getRole(scopeKey).days[dayKey];
        removed += 1;
      }
    }
    if (removed) this.save();
    return removed;
  }

  detectAnomalies(scopeKey = this.scopeKey()) {
    const entries = this.list(scopeKey).filter(([, record]) =>
      Number.isFinite(record?.values?.total),
    );
    if (entries.length < 5) return [];
    const changes = entries.slice(1).map(([date, record], index) => ({
      date,
      value:
        (record.values.total - entries[index][1].values.total) /
        Math.max(1, dayGap(entries[index][0], date)),
    }));
    const mean =
      changes.reduce((total, change) => total + change.value, 0) /
      changes.length;
    const deviation = Math.sqrt(
      changes.reduce((total, change) => total + (change.value - mean) ** 2, 0) /
        changes.length,
    );
    if (!(deviation > 0)) return [];
    const anomalies = [];
    for (let index = 0; index < changes.length - 1; index += 1) {
      const change = changes[index];
      const next = changes[index + 1];
      const zScore = (change.value - mean) / deviation;
      if (Math.abs(zScore) < 4 || !Number.isFinite(next?.value)) continue;
      const reversed =
        (change.value > 0 && next.value < 0) ||
        (change.value < 0 && next.value > 0);
      const reversalRatio = Math.abs(next.value) / Math.abs(change.value);
      if (reversed && reversalRatio >= 0.5) {
        anomalies.push({ ...change, zScore, reversalRatio });
      }
    }
    return anomalies;
  }

  importLegacyPayload(
    payload,
    { scopeKey = this.scopeKey(), roleName = "", mode = "merge" } = {},
  ) {
    const characterId = scopeKey.split(":").at(-1);
    const totalData = payload?.[LEGACY_KEYS.total] ?? {};
    const breakdownData = payload?.[LEGACY_KEYS.breakdown] ?? {};
    const totals = roleBucketFromLegacy(totalData, roleName, characterId);
    const breakdowns = roleBucketFromLegacy(
      breakdownData,
      roleName,
      characterId,
    );
    const days = {};
    for (const dayKey of new Set([
      ...Object.keys(totals ?? {}),
      ...Object.keys(breakdowns ?? {}),
    ])) {
      const values = legacyValues(totals?.[dayKey], breakdowns?.[dayKey]);
      if (!Number.isFinite(values.total)) continue;
      days[dayKey] = { recordedAt: `${dayKey}T15:59:59.999Z`, values };
    }
    const role = this.getRole(scopeKey);
    role.days = mode === "replace" ? days : { ...days, ...role.days };
    role.legacyRoleName = roleName || role.legacyRoleName || null;

    const tagData = payload?.[LEGACY_KEYS.tags] ?? {};
    const tags = normalizeLegacyTags(
      roleBucketFromLegacy(tagData, roleName, characterId),
    );
    role.tags = mode === "replace" ? tags : mergeTagBuckets(role.tags, tags);

    const achievementData = payload?.[LEGACY_KEYS.achievements] ?? {};
    const achievements = roleBucketFromLegacy(
      achievementData,
      roleName,
      characterId,
    );
    role.achievements =
      mode === "replace"
        ? { ...achievements }
        : { ...achievements, ...role.achievements };

    const goalData = payload?.[LEGACY_KEYS.goalTarget] ?? {};
    const legacyGoal =
      goalData?.[roleName] ?? goalData?.[characterId] ?? role.goalTarget;
    if (Number(legacyGoal) > 0) role.goalTarget = Number(legacyGoal);

    const tagPrefs = payload?.[LEGACY_KEYS.tagPrefs] ?? {};
    const legacyVisibility = tagPrefs?.[roleName] ?? tagPrefs?.[characterId];
    if (typeof legacyVisibility === "boolean") {
      role.tagVisibility = legacyVisibility;
    }
    const lastUpdates = payload?.[LEGACY_KEYS.lastUpdate] ?? {};
    role.lastUpdate =
      lastUpdates?.[roleName] ?? lastUpdates?.[characterId] ?? role.lastUpdate;

    this.data.preferences = normalizePreferences({
      ...this.data.preferences,
      ...readLegacyPreferencePayload(this.storage, payload),
    });
    return {
      importedDays: Object.keys(days).length,
      importedTags: Object.values(tags).reduce(
        (total, values) => total + values.length,
        0,
      ),
      importedAchievements: Object.keys(achievements ?? {}).length,
    };
  }

  migrateLegacy({ scopeKey = this.scopeKey(), roleName = "" } = {}) {
    if (this.data.migrations.everydayProfit[scopeKey]?.schema === 2) {
      return false;
    }
    const payload = legacyPayloadFromStorage(this.storage);
    const totalBuckets = payload?.[LEGACY_KEYS.total] ?? {};
    const characterId = scopeKey.split(":").at(-1);
    const usedBuckets = new Set(
      Object.values(this.data.migrations.everydayProfit)
        .map((migration) => migration?.legacyRoleName)
        .filter(Boolean),
    );
    const resolvedRoleName =
      (roleName && Object.hasOwn(totalBuckets, roleName) && roleName) ||
      (characterId &&
        Object.hasOwn(totalBuckets, characterId) &&
        characterId) ||
      Object.keys(totalBuckets).find((name) => !usedBuckets.has(name)) ||
      roleName;
    const imported = this.importLegacyPayload(payload, {
      scopeKey,
      roleName: resolvedRoleName,
    });
    this.data.legacy = {
      ...this.data.legacy,
      everydayProfit: payload,
    };
    this.data.migrations.everydayProfit[scopeKey] = {
      schema: 2,
      migratedAt: new Date().toISOString(),
      legacyRoleName: resolvedRoleName || null,
      ...imported,
    };
    this.save();
    return imported.importedDays;
  }

  exportBackup() {
    return {
      [ASSET_HISTORY_BACKUP_MARKER]: true,
      schema: ASSET_HISTORY_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: this.data,
    };
  }

  importBackup(backup, { mode = "merge", scopeKey = this.scopeKey() } = {}) {
    if (backup?.[ASSET_HISTORY_BACKUP_MARKER] === true) {
      const migrated = migrateStoredData(backup.data);
      if (mode === "full") {
        this.data = migrated;
        this.save();
        return Object.values(this.data.roles).reduce(
          (total, role) => total + Object.keys(role.days ?? {}).length,
          0,
        );
      }
      const incomingRole = normalizeRole(migrated.roles?.[scopeKey]);
      const role = this.getRole(scopeKey);
      role.days =
        mode === "replace"
          ? { ...incomingRole.days }
          : mergeDays(role.days, incomingRole.days);
      role.tags =
        mode === "replace"
          ? { ...incomingRole.tags }
          : mergeTagBuckets(role.tags, incomingRole.tags);
      role.achievements =
        mode === "replace"
          ? { ...incomingRole.achievements }
          : { ...incomingRole.achievements, ...role.achievements };
      if (incomingRole.goalTarget) role.goalTarget = incomingRole.goalTarget;
      role.tagVisibility = incomingRole.tagVisibility;
      this.data.preferences = normalizePreferences({
        ...this.data.preferences,
        ...migrated.preferences,
      });
      this.data.legacy = {
        ...this.data.legacy,
        ...(migrated.legacy ?? {}),
      };
      this.save();
      return Object.keys(incomingRole.days).length;
    }
    if (backup?.__everyday_profit_backup__ === true) {
      const payload = { ...(backup.payload ?? {}), ...(backup.settings ?? {}) };
      const roleName = this.getRole(scopeKey).legacyRoleName ?? "";
      const imported = this.importLegacyPayload(payload, {
        scopeKey,
        roleName,
        mode,
      });
      this.data.legacy.importedEverydayProfit = payload;
      this.save();
      return imported.importedDays;
    }
    throw new TypeError("Unsupported asset history backup");
  }
}

export const assetHistoryStore = new AssetHistoryStore();
