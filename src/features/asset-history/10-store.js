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
};

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function createEmptyData() {
  return {
    version: 1,
    roles: {},
    migrations: { everydayProfit: {} },
    legacy: {},
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

export class AssetHistoryStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    const loaded = safeParse(storage?.getItem(ASSET_HISTORY_STORAGE_KEY), null);
    this.data = loaded?.version === 1 ? loaded : createEmptyData();
  }

  save() {
    this.storage?.setItem(ASSET_HISTORY_STORAGE_KEY, JSON.stringify(this.data));
  }

  scopeKey(characterId = runtime.state.currentCharacterId) {
    const server = runtime.api.getMarketEnvironment?.() ?? "production";
    return `${server}:${String(characterId ?? "")}`;
  }

  getRole(scopeKey = this.scopeKey()) {
    this.data.roles[scopeKey] ??= { days: {} };
    this.data.roles[scopeKey].days ??= {};
    return this.data.roles[scopeKey];
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
    return changes
      .map((change) => ({
        ...change,
        zScore: (change.value - mean) / deviation,
      }))
      .filter(({ zScore }) => Math.abs(zScore) >= 4);
  }

  migrateLegacy({ scopeKey = this.scopeKey(), roleName = "" } = {}) {
    if (this.data.migrations.everydayProfit[scopeKey]) return false;
    const characterId = scopeKey.split(":").at(-1);
    const totalData = safeParse(this.storage?.getItem(LEGACY_KEYS.total), {});
    const breakdownData = safeParse(
      this.storage?.getItem(LEGACY_KEYS.breakdown),
      {},
    );
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
    role.days = { ...days, ...role.days };
    role.legacyRoleName = roleName || null;
    this.data.legacy = Object.fromEntries(
      Object.entries(LEGACY_KEYS)
        .filter(([name]) => name !== "total" && name !== "breakdown")
        .map(([name, key]) => [
          name,
          safeParse(this.storage?.getItem(key), {}),
        ]),
    );
    this.data.migrations.everydayProfit[scopeKey] = {
      migratedAt: new Date().toISOString(),
      importedDays: Object.keys(days).length,
    };
    this.save();
    return Object.keys(days).length;
  }

  exportBackup() {
    return {
      [ASSET_HISTORY_BACKUP_MARKER]: true,
      schema: 1,
      exportedAt: new Date().toISOString(),
      data: this.data,
    };
  }

  importBackup(backup, { mode = "merge", scopeKey = this.scopeKey() } = {}) {
    if (backup?.[ASSET_HISTORY_BACKUP_MARKER] === true) {
      const incoming = backup.data?.roles?.[scopeKey]?.days ?? {};
      const role = this.getRole(scopeKey);
      role.days =
        mode === "replace" ? { ...incoming } : mergeDays(role.days, incoming);
      this.data.legacy = {
        ...this.data.legacy,
        ...(backup.data?.legacy ?? {}),
      };
      this.save();
      return Object.keys(incoming).length;
    }
    if (backup?.__everyday_profit_backup__ === true) {
      const payload = backup.payload ?? {};
      const totalData = payload[LEGACY_KEYS.total] ?? {};
      const breakdownData = payload[LEGACY_KEYS.breakdown] ?? {};
      const roleName = this.getRole(scopeKey).legacyRoleName ?? "";
      const characterId = scopeKey.split(":").at(-1);
      const totals = roleBucketFromLegacy(totalData, roleName, characterId);
      const breakdowns = roleBucketFromLegacy(
        breakdownData,
        roleName,
        characterId,
      );
      const incoming = {};
      for (const dayKey of new Set([
        ...Object.keys(totals),
        ...Object.keys(breakdowns),
      ])) {
        const values = legacyValues(totals[dayKey], breakdowns[dayKey]);
        if (Number.isFinite(values.total)) {
          incoming[dayKey] = {
            recordedAt: `${dayKey}T15:59:59.999Z`,
            values,
          };
        }
      }
      const role = this.getRole(scopeKey);
      role.days =
        mode === "replace" ? incoming : mergeDays(role.days, incoming);
      this.data.legacy.importedEverydayProfit = payload;
      this.save();
      return Object.keys(incoming).length;
    }
    throw new TypeError("Unsupported asset history backup");
  }
}

export const assetHistoryStore = new AssetHistoryStore();
