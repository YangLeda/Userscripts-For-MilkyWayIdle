// Persistent plugin data is shared by the two live origins. Game caches and
// in-flight sessions deliberately continue to use origin-local storage.
import { startupDiagnostics } from "./startup-diagnostics.js";

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
function setValues(values) {
  const entries = Object.entries(values);
  if (!entries.length) return;
  if (typeof globalThis.GM_setValues === "function") {
    globalThis.GM_setValues(values);
  } else {
    for (const [key, value] of entries) globalThis.GM_setValue(key, value);
  }
  if (indexedNames) {
    for (const [key] of entries) indexRecordName(key);
  }
}
function entriesFor(key) {
  const prefix = recordPrefix(key);
  const revision = globalThis.GM_getValue(revisionKey(key), null);
  const cached = snapshots.get(prefix);
  if (cached && cached.revision === revision) return cached.entries;
  // A revision can arrive before the cross-tab change event.
  if (
    cached ||
    (revision !== null &&
      typeof globalThis.GM_addValueChangeListener !== "function")
  )
    indexedNames = null;
  const names = [...(listNames().get(prefix) ?? [])];
  const values =
    typeof globalThis.GM_getValues === "function"
      ? globalThis.GM_getValues(names)
      : Object.fromEntries(
          names.map((name) => [name, globalThis.GM_getValue(name)]),
        );
  const entries = new Map(
    names.map((name) => [
      decodeURIComponent(name.slice(prefix.length)),
      values[name],
    ]),
  );
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
          ([name]) => name !== "updatedAt" && name !== "sourceUpdatedAt",
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
  setValues(updates);
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
    const values =
      typeof globalThis.GM_getValues === "function"
        ? globalThis.GM_getValues(names)
        : Object.fromEntries(
            names.map((key) => [key, globalThis.GM_getValue(key)]),
          );
    for (const key of names) {
      const relative = key.slice(root().length);
      const logical = relative.startsWith("record:")
        ? decodeURIComponent(relative.slice(7, relative.indexOf(":", 7)))
        : values[key]?.key;
      if (shared(logical)) data[relative] = values[key];
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
  const keys = localKeys();
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
