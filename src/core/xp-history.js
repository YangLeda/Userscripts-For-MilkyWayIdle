import { runtime } from "./runtime.js";

const DB_NAME = "MWIToolsHistory";
const STORE_NAME = "xpSnapshots";
const FALLBACK_KEY = "MWITools_xp_history_v1";
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

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
    const value = JSON.parse(
      globalThis.localStorage?.getItem(FALLBACK_KEY) || "[]",
    );
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeFallback(records) {
  try {
    globalThis.localStorage?.setItem(FALLBACK_KEY, JSON.stringify(records));
  } catch (error) {
    console.warn("[MWITools] Unable to save XP history fallback", error);
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
  let previous = null;
  if (latest) {
    previous = [...sorted]
      .reverse()
      .find(
        (record) =>
          latest.at - record.at >= 5 * 60 * 1000 && record.xp <= latest.xp,
      );
  }
  return {
    recent:
      latest && previous
        ? ((latest.xp - previous.xp) / (latest.at - previous.at)) * HOUR_MS
        : null,
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
