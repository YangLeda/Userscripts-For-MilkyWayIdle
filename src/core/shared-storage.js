// Persistent plugin data is shared by the two live origins. Game caches and
// in-flight sessions deliberately continue to use origin-local storage.
import { startupDiagnostics } from "./startup-diagnostics.js";
import {
  isPackedHistory,
  readPackedHistory,
  writePackedHistory,
  deleteStorageNames,
  compactHistoryEntries,
  expiredHistoryPath,
} from "./packed-history.js";

const PREFIX = "MWITools_shared_v1:";
const bases = new Map();
const observed = new Set();
const tracedReads = new Set();
// Cache immutable read snapshots; revisions invalidate only the changed store.
const snapshots = new Map();
let indexedNames = null;
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canonical = (key) => String(key).replace(/(^|:)china:/g, "$1production:");
const environment = () =>
  String(globalThis.location?.hostname ?? "").startsWith("test.")
    ? "test"
    : "live";
const root = () => `${PREFIX}${environment()}:`;
const shared = (key) =>
  /^(MWITools_|script_settingsMap$|kikimeter:(settings|history):|kbd_|ep_)/.test(
    key,
  ) &&
  !/cache|marketAPI|market_data|game_locale|important_update_manifest|xp_(?:object_)?migrated|popover_scroll|active:/i.test(
    key,
  );
const available = () =>
  typeof globalThis.GM_getValue === "function" &&
  typeof globalThis.GM_setValue === "function" &&
  typeof globalThis.GM_listValues === "function";
const native = () => globalThis.localStorage;
const parse = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};
const identity = (value) => {
  if (!value || typeof value !== "object") return null;
  if (value.id != null) return `id:${value.id}`;
  if (value.itemHrid)
    return `item:${value.itemHrid}:${value.enhancementLevel ?? 0}`;
  if (value.objectKey && value.at != null)
    return `xp:${value.objectKey}:${value.at}`;
  if (value.day || value.date) return `day:${value.day ?? value.date}`;
  return null;
};
function flatten(value, path = [], output = new Map()) {
  const key = JSON.stringify(path);
  if (
    value &&
    typeof value === "object" &&
    value.objectKey &&
    value.at != null &&
    Object.hasOwn(value, "xp")
  ) {
    // A timestamped XP sample is one immutable record, not separate GM keys per field.
    output.set(key, { type: "value", value });
  } else if (
    Array.isArray(value) &&
    value.length &&
    value.every(identity) &&
    new Set(value.map(identity)).size === value.length
  ) {
    output.set(key, { type: "records", order: value.map(identity) });
    value.forEach((record) =>
      flatten(record, [...path, identity(record)], output),
    );
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    output.set(key, { type: "object" });
    for (const [name, entry] of Object.entries(value)) {
      if (forbidden.has(name)) throw new TypeError("Invalid storage key");
      flatten(entry, [...path, canonical(name)], output);
    }
  } else output.set(key, { type: "value", value });
  return output;
}
function inflate(entries, path = [], children = null) {
  if (!children) {
    children = new Map();
    for (const encoded of entries.keys()) {
      const candidate = JSON.parse(encoded);
      if (!candidate.length) continue;
      const parent = JSON.stringify(candidate.slice(0, -1));
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(candidate.at(-1));
    }
  }
  const node = entries.get(JSON.stringify(path));
  if (!node || node.deleted) return undefined;
  if (node.type === "value") return node.value;
  const result = {};
  for (const name of children.get(JSON.stringify(path)) ?? []) {
    const candidate = [...path, name];
    if (forbidden.has(name)) continue;
    const value = inflate(entries, candidate, children);
    if (value !== undefined) result[name] = value;
  }
  if (node.type !== "records") return result;
  return [...new Set([...(node.order ?? []), ...Object.keys(result)])]
    .filter((key) => Object.hasOwn(result, key))
    .map((key) => result[key]);
}
function recordPrefix(key) {
  return `${root()}record:${encodeURIComponent(canonical(key))}:`;
}
function revisionKey(key) {
  return `${root()}revision:${encodeURIComponent(canonical(key))}`;
}
function indexRecordName(name) {
  const prefix = name.match(
    /^MWITools_shared_v1:(?:live|test):record:[^:]+:/,
  )?.[0];
  if (!prefix) return;
  if (!indexedNames.has(prefix)) indexedNames.set(prefix, new Set());
  indexedNames.get(prefix).add(name);
}
function listNames() {
  if (!indexedNames) {
    indexedNames = new Map();
    for (const name of globalThis.GM_listValues()) indexRecordName(name);
  }
  return indexedNames;
}
function getValues(names) {
  const values = {};
  for (let index = 0; index < names.length; index += 256) {
    const batch = names.slice(index, index + 256);
    Object.assign(
      values,
      typeof globalThis.GM_getValues === "function"
        ? globalThis.GM_getValues(batch)
        : Object.fromEntries(
            batch.map((name) => [name, globalThis.GM_getValue(name)]),
          ),
    );
  }
  return values;
}
function setValues(values) {
  const entries = Object.entries(values);
  if (!entries.length) return;
  let batch = {};
  let size = 0;
  const flush = () => {
    if (typeof globalThis.GM_setValues === "function")
      globalThis.GM_setValues(batch);
    else
      for (const [key, value] of Object.entries(batch))
        globalThis.GM_setValue(key, value);
    batch = {};
    size = 0;
  };
  for (const [key, value] of entries) {
    const cost = 2 * (key.length + JSON.stringify(value).length);
    if (size && (size + cost > 512 * 1024 || Object.keys(batch).length >= 256))
      flush();
    batch[key] = value;
    size += cost;
  }
  flush();
  if (indexedNames) {
    for (const [key] of entries) indexRecordName(key);
  }
}
function entriesFor(key, prepared = null) {
  const prefix = recordPrefix(key);
  const revision = globalThis.GM_getValue(revisionKey(key), null);
  const cached = snapshots.get(prefix);
  if (cached && cached.revision === revision && !prepared)
    return cached.entries;
  // A revision can arrive before the cross-tab change event.
  if (
    cached ||
    (revision !== null &&
      typeof globalThis.GM_addValueChangeListener !== "function")
  )
    indexedNames = null;
  const names = [...(listNames().get(prefix) ?? [])];
  const values =
    prepared?.values ??
    getValues(
      names.filter((name) => name.slice(prefix.length).startsWith("%5B")),
    );
  const packed = isPackedHistory(key) ? readPackedHistory(prefix) : null;
  let entries = packed ?? new Map();
  const floor = packed?.get("[]")?.xpFloor ?? 0;
  for (const name of names) {
    const path = decodeURIComponent(name.slice(prefix.length));
    // Packed pages and their manifest share the store prefix, but are not paths.
    if (
      path === "packed" ||
      path.startsWith("page:") ||
      path.startsWith("commit:")
    )
      continue;
    const value = values[name];
    if (expiredHistoryPath(path, floor) && !entries.has(path)) continue;
    if (
      !entries.has(path) ||
      (value?.updatedAt ?? 0) > (entries.get(path)?.updatedAt ?? 0)
    )
      entries.set(path, value);
  }
  if (
    isPackedHistory(key) &&
    names.some((name) => name.slice(prefix.length).startsWith("%5B"))
  ) {
    entries = compactHistoryEntries(
      entries,
      inflate,
      key.startsWith("MWITools_xp_history_v2:"),
    );
    writePackedHistory(prefix, entries);
    const legacyNames = names.filter((name) =>
      name.slice(prefix.length).startsWith("%5B"),
    );
    if (prepared) prepared.deletes = legacyNames;
    else {
      deleteStorageNames(legacyNames);
      if (indexedNames)
        legacyNames.forEach((name) => indexedNames.get(prefix)?.delete(name));
    }
  }
  snapshots.set(prefix, { revision, entries });
  return entries;
}

function write(key, raw, { migration = false } = {}) {
  const before = bases.get(recordPrefix(key)) ?? entriesFor(key);
  const next = raw === null ? new Map() : flatten(parse(raw));
  const current = entriesFor(key);
  const updates = {};
  const merged = new Map(current);
  for (const path of new Set([...before.keys(), ...next.keys()])) {
    const previous = before.get(path);
    const value = next.get(path) ?? { deleted: true };
    const strip = (entry) =>
      entry &&
      Object.fromEntries(
        Object.entries(entry).filter(
          ([name]) =>
            name !== "updatedAt" &&
            name !== "sourceUpdatedAt" &&
            name !== "xpFloor",
        ),
      );
    if (equal(strip(previous), value)) continue;
    let sourceUpdatedAt = null;
    const parts = JSON.parse(path);
    for (
      let length = parts.length;
      length >= 0 && sourceUpdatedAt === null;
      length--
    ) {
      for (const field of ["updatedAt", "recordedAt", "modifiedAt"]) {
        const value = next.get(
          JSON.stringify([...parts.slice(0, length), field]),
        )?.value;
        const time = typeof value === "number" ? value : Date.parse(value);
        if (Number.isFinite(time)) {
          sourceUpdatedAt = time;
          break;
        }
      }
    }
    if (
      isPackedHistory(key) &&
      expiredHistoryPath(path, current.get("[]")?.xpFloor ?? 0) &&
      !current.has(path)
    )
      continue;
    const stored = current.get(path);
    if (
      migration &&
      stored &&
      (stored.deleted ||
        !Number.isFinite(sourceUpdatedAt) ||
        !Number.isFinite(stored.sourceUpdatedAt) ||
        sourceUpdatedAt <= stored.sourceUpdatedAt)
    )
      continue;
    const entry = {
      ...value,
      updatedAt: Date.now(),
      sourceUpdatedAt: migration ? sourceUpdatedAt : Date.now(),
    };
    updates[recordPrefix(key) + encodeURIComponent(path)] = entry;
    merged.set(path, entry);
  }
  if (!Object.keys(updates).length) return;
  const revision = `${Date.now()}:${Math.random()}`;
  updates[revisionKey(key)] = revision;
  if (isPackedHistory(key)) {
    const compact = compactHistoryEntries(
      merged,
      inflate,
      key.startsWith("MWITools_xp_history_v2:"),
    );
    merged.clear();
    compact.forEach((value, path) => merged.set(path, value));
    writePackedHistory(recordPrefix(key), merged);
    globalThis.GM_setValue(revisionKey(key), revision);
  } else setValues(updates);
  bases.set(recordPrefix(key), merged);
  snapshots.set(recordPrefix(key), { revision, entries: merged });
  globalThis.GM_setValue(`${root()}changed`, {
    key: canonical(key),
    at: Date.now(),
    nonce: Math.random(),
  });
}
function migrate(key) {
  const marker = `${root()}migration:${globalThis.location?.origin ?? "local"}:${key}`;
  if (globalThis.GM_getValue(marker)) return;
  const raw = native()?.getItem(key);
  if (raw !== null && raw !== undefined) {
    startupDiagnostics.mark(
      "storage:migrate",
      `${key.split(":")[0]} (${raw.length} chars)`,
      true,
    );
    // The complete pre-migration copy is also the recovery record for unknown-age conflicts.
    globalThis.GM_setValue(`${root()}recovery:${encodeURIComponent(marker)}`, {
      key,
      raw,
      at: Date.now(),
    });
    write(key, raw, { migration: true });
    startupDiagnostics.mark("storage:migrated", key.split(":")[0]);
  }
  globalThis.GM_setValue(marker, true);
}
export const sharedStorage = {
  getItem(key) {
    if (startupDiagnostics.enabled && !tracedReads.has(key)) {
      tracedReads.add(key);
      startupDiagnostics.mark("storage:read", key.split(":")[0], true);
    }
    if (!available() || !shared(key)) return native()?.getItem(key) ?? null;
    migrate(key);
    observed.add(canonical(key));
    const entries = entriesFor(key);
    bases.set(recordPrefix(key), entries);
    const snapshot = snapshots.get(recordPrefix(key));
    if (!Object.hasOwn(snapshot, "raw")) {
      const value = inflate(entries);
      snapshot.raw =
        value === undefined
          ? null
          : typeof value === "string"
            ? value
            : JSON.stringify(value);
    }
    return snapshot.raw;
  },
  setItem(key, value) {
    if (!available() || !shared(key)) return native()?.setItem(key, value);
    migrate(key);
    write(key, String(value));
  },
  removeItem(key) {
    if (!available() || !shared(key)) return native()?.removeItem(key);
    migrate(key);
    write(key, null);
  },
};
export function exportSharedBackup() {
  const data = {};
  if (available()) {
    // Explicit backup includes inactive characters even if background import has not finished.
    for (const key of localKeys()) migrate(key);
    const names = globalThis
      .GM_listValues()
      .filter(
        (key) => key.startsWith(root()) && /:(record|recovery):/.test(key),
      );
    const values = getValues(
      names.filter((name) => !/:page:|:commit:|:packed$/.test(name)),
    );
    for (const key of names) {
      if (/:page:|:commit:|:packed$/.test(key)) continue;
      const relative = key.slice(root().length);
      const logical = relative.startsWith("record:")
        ? decodeURIComponent(relative.slice(7, relative.indexOf(":", 7)))
        : values[key]?.key;
      if (shared(logical)) data[relative] = values[key];
    }
    const prefixes = new Set(
      names
        .filter((name) => name.endsWith(":packed") || name.includes(":commit:"))
        .map((name) =>
          name.endsWith(":packed")
            ? name.slice(0, -6)
            : name.slice(0, name.lastIndexOf(":commit:") + 1),
        ),
    );
    for (const prefix of prefixes) {
      const logical = decodeURIComponent(
        prefix.slice((root() + "record:").length, -1),
      );
      if (!isPackedHistory(logical)) continue;
      for (const [path, entry] of entriesFor(logical))
        data[prefix.slice(root().length) + encodeURIComponent(path)] = entry;
    }
  } else {
    for (let index = 0; index < (native()?.length ?? 0); index++) {
      const key = native().key(index);
      if (shared(key)) data[`local:${key}`] = native().getItem(key);
    }
  }
  return {
    __mwitools_backup__: true,
    version: 1,
    environment: environment(),
    exportedAt: new Date().toISOString(),
    data,
  };
}
export function restoreSharedBackup(backup) {
  if (
    backup?.__mwitools_backup__ !== true ||
    backup.version !== 1 ||
    !backup.data ||
    typeof backup.data !== "object" ||
    Array.isArray(backup.data) ||
    backup.environment !== environment()
  )
    throw new TypeError("Invalid MWITools backup or environment");
  const entries = Object.entries(backup.data);
  for (const [key, value] of entries) {
    if (key.startsWith("local:")) {
      if (!shared(key.slice(6)) || typeof value !== "string")
        throw new TypeError("Invalid local backup record");
    } else if (
      !/^(record|recovery):/.test(key) ||
      !value ||
      typeof value !== "object"
    )
      throw new TypeError("Invalid backup record");
    if (key.startsWith("record:")) {
      if (
        value.deleted !== true &&
        !["value", "object", "records"].includes(value.type)
      )
        throw new TypeError("Invalid backup value");
      const split = key.indexOf(":", 7);
      if (split < 0 || !shared(decodeURIComponent(key.slice(7, split))))
        throw new TypeError("Invalid backup key");
      const path = JSON.parse(decodeURIComponent(key.slice(split + 1)));
      if (
        !Array.isArray(path) ||
        path.some((part) => typeof part !== "string" || forbidden.has(part))
      )
        throw new TypeError("Invalid backup path");
    }
  }
  if (!available() && entries.some(([key]) => !key.startsWith("local:")))
    throw new Error(
      (native()?.getItem("i18nextLng") ?? "").startsWith("zh")
        ? "脚本管理器共享存储不可用"
        : "Shared userscript storage unavailable",
    );
  const previous = entries.map(([key]) => [
    key,
    key.startsWith("local:")
      ? sharedStorage.getItem(key.slice(6))
      : key.startsWith("record:")
        ? (entriesFor(
            decodeURIComponent(key.slice(7, key.indexOf(":", 7))),
          ).get(decodeURIComponent(key.slice(key.indexOf(":", 7) + 1))) ?? null)
        : globalThis.GM_getValue(root() + key, null),
  ]);
  try {
    const updates = {};
    for (const [key, value] of entries) {
      if (key.startsWith("local:")) sharedStorage.setItem(key.slice(6), value);
      else updates[root() + key] = { ...value, updatedAt: Date.now() };
    }
    setValues(updates);
  } catch (error) {
    const rollback = {};
    for (const [key, value] of previous) {
      if (key.startsWith("local:"))
        value === null
          ? sharedStorage.removeItem(key.slice(6))
          : sharedStorage.setItem(key.slice(6), value);
      else rollback[root() + key] = value ?? { deleted: true };
    }
    setValues(rollback);
    snapshots.clear();
    indexedNames = null;
    throw error;
  }
  bases.clear();
  snapshots.clear();
  indexedNames = null;
  const changedKeys = new Set(
    entries
      .map(([key]) =>
        key.startsWith("local:")
          ? canonical(key.slice(6))
          : key.startsWith("record:")
            ? decodeURIComponent(key.slice(7, key.indexOf(":", 7)))
            : null,
      )
      .filter(Boolean),
  );
  for (const key of changedKeys) {
    const detail = { key, at: Date.now(), nonce: Math.random() };
    if (available()) {
      globalThis.GM_setValue(
        revisionKey(key),
        `${Date.now()}:${Math.random()}`,
      );
      globalThis.GM_setValue(`${root()}changed`, detail);
    }
    if (typeof globalThis.CustomEvent === "function")
      globalThis.dispatchEvent?.(
        new CustomEvent("mwitools-shared-storage", { detail }),
      );
  }
}
if (typeof globalThis.GM_addValueChangeListener === "function") {
  globalThis.GM_addValueChangeListener(
    `${root()}changed`,
    (_name, _old, value, remote) => {
      if (!remote) return;
      indexedNames = null;
      // Also handle events from an older release that has no revision key.
      snapshots.delete(recordPrefix(value?.key));
      if (!observed.has(value?.key)) return;
      globalThis.dispatchEvent?.(
        new CustomEvent("mwitools-shared-storage", { detail: value }),
      );
    },
  );
}

const historyPreparations = new Map();
let cleanupApiTraced = false;
export function prepareSharedHistory(key) {
  if (!available() || !isPackedHistory(key)) return Promise.resolve();
  const prefix = recordPrefix(key);
  if (historyPreparations.has(prefix)) return historyPreparations.get(prefix);
  const work = (async () => {
    migrate(key);
    let prepared;
    for (let attempt = 0; attempt < 3; attempt++) {
      const revision = globalThis.GM_getValue(revisionKey(key), null);
      const names = [...(listNames().get(prefix) ?? [])].filter((name) =>
        name.slice(prefix.length).startsWith("%5B"),
      );
      if (!names.length) return;
      prepared = { values: {}, deletes: [] };
      for (let index = 0; index < names.length; index += 256) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        Object.assign(
          prepared.values,
          startupDiagnostics.measure("storage:legacy-read", () =>
            getValues(names.slice(index, index + 256)),
          ),
        );
      }
      if (globalThis.GM_getValue(revisionKey(key), null) === revision) break;
      indexedNames = null;
      if (attempt === 2) return; // Active old tabs: retry later rather than block or overwrite.
    }
    startupDiagnostics.measure("storage:history-pack", () =>
      entriesFor(key, prepared),
    );
    if (!cleanupApiTraced) {
      cleanupApiTraced = true;
      startupDiagnostics.mark(
        "storage:delete-api",
        typeof globalThis.GM_deleteValues === "function"
          ? "bulk"
          : "individual",
      );
    }
    const chunkSize =
      typeof globalThis.GM_deleteValues === "function" ? 4096 : 32;
    for (let index = 0; index < prepared.deletes.length; index += chunkSize) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const batch = prepared.deletes.slice(index, index + chunkSize);
      const current = getValues(batch);
      const unchanged = batch.filter((name) =>
        equal(current[name], prepared.values[name]),
      );
      startupDiagnostics.measure("storage:legacy-delete", () =>
        deleteStorageNames(unchanged),
      );
      if (indexedNames)
        unchanged.forEach((name) => indexedNames.get(prefix)?.delete(name));
    }
  })().finally(() => historyPreparations.delete(prefix));
  historyPreparations.set(prefix, work);
  return work;
}

function localKeys() {
  return Array.from({ length: native()?.length ?? 0 }, (_, index) =>
    native().key(index),
  ).filter(shared);
}
let migrationRun = null;
// Used stores still migrate on first read. Import inactive stores after startup,
// yielding between them rather than blocking game modules during import.
export function scheduleSharedMigration() {
  if (!available()) return Promise.resolve();
  if (migrationRun) return migrationRun;
  // Guild XP tracking was removed. Archived history is only read or migrated
  // by explicit backup/restore operations, never as background startup work.
  const keys = localKeys().filter((key) => !isPackedHistory(key));
  migrationRun = (async () => {
    for (const key of keys) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      try {
        migrate(key);
      } catch (error) {
        startupDiagnostics.error("storage:migration-failed", error);
      }
      if (!observed.has(canonical(key))) {
        bases.delete(recordPrefix(key));
        snapshots.delete(recordPrefix(key));
      }
    }
  })().finally(() => {
    migrationRun = null;
  });
  return migrationRun;
}
