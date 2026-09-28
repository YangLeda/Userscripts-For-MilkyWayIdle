import { sharedStorage } from "./shared-storage.js";
import { runtime } from "./runtime.js";

const DB_NAME = "MWIToolsHistory";
const STORE_NAME = "xpSnapshots";
const FALLBACK_KEY = "MWITools_xp_history_v1";
const OBJECT_KEY_PREFIX = "MWITools_xp_history_v2:";
const migrations = new Map();
let migrationQueue = Promise.resolve();
let legacyRaw = null;
let legacyByObject = new Map();
const sharedAvailable = () =>
  typeof globalThis.GM_getValue === "function" &&
  typeof globalThis.GM_setValue === "function" &&
  typeof globalThis.GM_listValues === "function";

function legacyHistory(objectKey) {
  const raw = sharedStorage.getItem(FALLBACK_KEY);
  if (raw !== legacyRaw) {
    legacyRaw = raw;
    legacyByObject = new Map();
    let records;
    try {
      records = JSON.parse(raw || "[]");
    } catch {
      records = [];
    }
    for (const record of Array.isArray(records) ? records : []) {
      if (!legacyByObject.has(record.objectKey))
        legacyByObject.set(record.objectKey, []);
      legacyByObject.get(record.objectKey).push(record);
    }
  }
  return legacyByObject.get(objectKey) ?? [];
}
function readObjectHistory(objectKey) {
  const value = JSON.parse(
    sharedStorage.getItem(OBJECT_KEY_PREFIX + objectKey) || "[]",
  );
  return Array.isArray(value) ? value : [];
}
function writeObjectHistory(objectKey, records) {
  sharedStorage.setItem(
    OBJECT_KEY_PREFIX + objectKey,
    JSON.stringify(records.map(({ at, xp }) => ({ objectKey, at, xp }))),
  );
}
async function migrateObjectHistory(objectKey) {
  const marker = `MWITools_xp_object_migrated_v2:${objectKey}`;
  if (globalThis.localStorage?.getItem(marker)) return;
  // Import each origin once, retaining both shared legacy samples and its IndexedDB.
  const legacy = legacyHistory(objectKey);
  const indexed = await readIndexed(objectKey);
  const current = readObjectHistory(objectKey);
  const merged = new Map(
    [...legacy, ...(indexed ?? []), ...current]
      .filter(
        (record) => Number.isFinite(record.at) && Number.isFinite(record.xp),
      )
      .map((record) => [record.at, record]),
  );
  const records = [...merged.values()].sort((a, b) => a.at - b.at);
  if (records.length) writeObjectHistory(objectKey, records);
  globalThis.localStorage?.setItem(marker, "true");
}
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const RECENT_WINDOW_MS = 6 * HOUR_MS;
const RECENT_MINIMUM_COVERAGE_MS = HOUR_MS;

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = globalThis.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: "key",
          autoIncrement: true,
        });
        store.createIndex("objectKey", "objectKey", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function readFallback() {
  try {
    const value = JSON.parse(sharedStorage?.getItem(FALLBACK_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeFallback(records) {
  try {
    sharedStorage?.setItem(FALLBACK_KEY, JSON.stringify(records));
  } catch (error) {
    console.warn(
      runtime.config.isZH
        ? "[MWITools] 无法保存经验历史备用数据"
        : "[MWITools] Unable to save XP history fallback",
      error,
    );
  }
}

async function readIndexed(objectKey) {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction
      .objectStore(STORE_NAME)
      .index("objectKey")
      .getAll(objectKey);
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => resolve(null);
  });
}

async function replaceIndexed(objectKey, records) {
  const database = await openDatabase();
  if (!database) return false;
  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store
      .index("objectKey")
      .openKeyCursor(globalThis.IDBKeyRange.only(objectKey));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
        return;
      }
      for (const record of records) store.add({ ...record, objectKey });
    };
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => resolve(false);
  });
}

async function getXpHistory(objectKey) {
  if (sharedAvailable()) {
    const migrationKey = `${globalThis.location?.origin ?? "local"}:${objectKey}`;
    if (!migrations.has(migrationKey)) {
      const marker = `MWITools_xp_object_migrated_v2:${objectKey}`;
      const work = globalThis.localStorage?.getItem(marker)
        ? Promise.resolve()
        : migrationQueue
            .then(() => new Promise((resolve) => setTimeout(resolve, 0)))
            .then(() => migrateObjectHistory(objectKey));
      // Large guild imports yield between members instead of blocking one frame.
      if (!globalThis.localStorage?.getItem(marker))
        migrationQueue = work.catch(() => {});
      const pending = work.finally(() => migrations.delete(migrationKey));
      migrations.set(migrationKey, pending);
    }
    await migrations.get(migrationKey);
    return readObjectHistory(objectKey).sort((a, b) => a.at - b.at);
  }
  const indexed = await readIndexed(objectKey);
  if (indexed !== null) return indexed.sort((a, b) => a.at - b.at);
  return readFallback()
    .filter((record) => record.objectKey === objectKey)
    .sort((a, b) => a.at - b.at);
}

function compactHistory(records, now = Date.now()) {
  const cutoff = now - RETENTION_MS;
  const recentCutoff = now - 24 * HOUR_MS;
  const hourly = new Map();
  const recent = [];
  for (const record of records) {
    if (record.at < cutoff) continue;
    if (record.at >= recentCutoff) recent.push(record);
    else hourly.set(Math.floor(record.at / HOUR_MS), record);
  }
  return [...hourly.values(), ...recent].sort((a, b) => a.at - b.at);
}

async function saveHistory(objectKey, records) {
  if (sharedAvailable()) {
    writeObjectHistory(objectKey, records);
    return;
  }
  if (await replaceIndexed(objectKey, records)) return;
  const retained = readFallback().filter(
    (record) => record.objectKey !== objectKey,
  );
  writeFallback([
    ...retained,
    ...records.map((record) => ({ ...record, objectKey })),
  ]);
}

async function recordXpSnapshot(objectKey, xp, at = Date.now()) {
  const numericXp = Number(xp);
  const numericAt = Number(at);
  if (!objectKey || !Number.isFinite(numericXp) || !Number.isFinite(numericAt))
    return false;
  const records = await getXpHistory(objectKey);
  const last = records.at(-1);
  if (
    last &&
    (last.xp === numericXp || last.at >= numericAt || last.xp > numericXp)
  )
    return false;
  records.push({ xp: numericXp, at: numericAt });
  await saveHistory(objectKey, compactHistory(records, numericAt));
  return true;
}

function calculateWindowRate(records, windowMs, minimumCoverageMs, now) {
  const latest = records.at(-1);
  if (!latest) return null;
  const candidates = records.filter(
    (record) => record.at >= now - windowMs && record.at <= latest.at,
  );
  const first = candidates[0];
  if (
    !first ||
    latest.at - first.at < minimumCoverageMs ||
    latest.xp < first.xp
  )
    return null;
  return ((latest.xp - first.xp) / (latest.at - first.at)) * HOUR_MS;
}

function calculateXpRates(records, now = Date.now()) {
  const sorted = [...records].sort((a, b) => a.at - b.at);
  const latest = sorted.at(-1);
  return {
    recent: calculateWindowRate(
      sorted,
      RECENT_WINDOW_MS,
      RECENT_MINIMUM_COVERAGE_MS,
      now,
    ),
    hour: calculateWindowRate(sorted, HOUR_MS, 30 * 60 * 1000, now),
    day: calculateWindowRate(sorted, 24 * HOUR_MS, 12 * HOUR_MS, now),
    lastSampleAt: latest?.at ?? null,
    points: sorted,
  };
}

Object.assign(runtime.api, {
  getXpHistory,
  compactXpHistory: compactHistory,
  recordXpSnapshot,
  calculateXpRates,
});
