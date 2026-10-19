import assert from "node:assert/strict";
import test from "node:test";
import {
  DPS_HISTORY_KEY,
  boundDpsHistory,
} from "../src/core/bounded-dps-history.js";

const gm = new Map(),
  local = new Map();
globalThis.location = {
  hostname: "www.milkywayidle.com",
  origin: "https://www.milkywayidle.com",
};
globalThis.localStorage = {
  getItem: (key) => local.get(key) ?? null,
  setItem: (key, value) => local.set(key, String(value)),
  get length() {
    return local.size;
  },
  key: (index) => [...local.keys()][index],
};
globalThis.GM_getValue = (key, fallback) =>
  gm.has(key) ? globalThis.structuredClone(gm.get(key)) : fallback;
globalThis.GM_setValue = (key, value) =>
  gm.set(key, globalThis.structuredClone(value));
globalThis.GM_listValues = () => [...gm.keys()];
globalThis.GM_deleteValue = (key) => gm.delete(key);
const a = await import("../src/core/shared-storage.js?bounded-a");
const b = await import("../src/core/shared-storage.js?bounded-b");
const prefix = `MWITools_shared_v1:live:record:${encodeURIComponent(DPS_HISTORY_KEY)}:`;
const headKey = "MWITools_shared_v1:live:bounded:dps-history:v1";
const mirrorKey = prefix + encodeURIComponent("[]");
let epoch = 1700000000000;
test.beforeEach(() => {
  epoch += 1000000000;
});
const entry = (id) => ({
  id: String(id),
  type: "combat",
  teamDamage: id * 100,
  endedAt: new Date(epoch + id * 60000).toISOString(),
});
const read = (store = a.sharedStorage) =>
  JSON.parse(store.getItem(DPS_HISTORY_KEY));
const write = (entries, store = a.sharedStorage) =>
  store.setItem(DPS_HISTORY_KEY, JSON.stringify(entries));
async function until(predicate) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(predicate(), "asynchronous field cleanup completes");
}
const legacyField = (path, value) => [
  prefix + encodeURIComponent(JSON.stringify(path)),
  value,
];

test("migrate visible legacy history, verify the snapshot, then delete old fields in batches", async () => {
  for (const [key, value] of [
    legacyField([], { type: "records", order: ["id:1"] }),
    legacyField(["id:1"], { type: "object" }),
    ...Object.entries(entry(1)).map(([key, value]) =>
      legacyField(["id:1", key], { type: "value", value }),
    ),
    ...Array.from({ length: 1000 }, (_, id) =>
      legacyField([`id:deleted-${id}`], { deleted: true }),
    ),
  ])
    gm.set(key, value);
  const original = GM_setValue;
  globalThis.GM_setValue = (key, value) => {
    if (key === headKey) throw new Error("quota failure");
    original(key, value);
  };
  assert.throws(() => read(), /quota failure/);
  assert.ok(gm.size > 1000, "failed snapshot must leave legacy history intact");
  globalThis.GM_setValue = original;
  assert.deepEqual(read(), [entry(1)]);
  assert.ok(gm.has(headKey));
  assert.ok(
    gm.size > 1000,
    "cleanup yields after committing the verified snapshot",
  );
  await until(
    () => [...gm.keys()].filter((key) => key.startsWith(prefix)).length === 1,
  );
  assert.deepEqual(gm.get(mirrorKey).value, [entry(1)]);
});

test("600 different fights retain ten histories and a constant number of GM records", () => {
  a.sharedStorage.removeItem(DPS_HISTORY_KEY);
  let firstSize;
  for (let index = 1; index <= 600; index++) {
    write([entry(index), ...read()].slice(0, 10));
    if (index === 100) firstSize = gm.size;
  }
  assert.equal(read().length, 10);
  assert.equal(read()[0].id, "600");
  assert.equal(gm.size, firstSize);
  assert.equal(
    [...gm.keys()].filter((key) => key.startsWith(prefix)).length,
    1,
  );
  assert.equal([...gm.values()].filter((value) => value?.deleted).length, 0);
});

test("stale tabs merge independent edits and cannot re-create deleted histories", () => {
  a.sharedStorage.removeItem(DPS_HISTORY_KEY);
  write([entry(1), entry(2)]);
  const left = read(a.sharedStorage),
    right = read(b.sharedStorage);
  left.find((value) => value.id === "1").customName = "renamed";
  write(left, a.sharedStorage);
  right.find((value) => value.id === "2").favorite = true;
  write(right, b.sharedStorage);
  assert.equal(read().find((value) => value.id === "1").customName, "renamed");
  assert.equal(read().find((value) => value.id === "2").favorite, true);
  const stale = read(b.sharedStorage);
  write(
    read(a.sharedStorage).filter((value) => value.id !== "1"),
    a.sharedStorage,
  );
  stale.find((value) => value.id === "1").customName = "stale edit";
  write([entry(3), ...stale], b.sharedStorage);
  assert.deepEqual(
    read().map((value) => value.id),
    ["3", "2"],
  );
  a.sharedStorage.removeItem(DPS_HISTORY_KEY);
  write(stale, b.sharedStorage);
  assert.deepEqual(
    read(),
    [],
    "clearing histories cannot be undone by a stale re-save",
  );
});

test("old-format writes and a second origin's local archives cannot revive deleted IDs", () => {
  write([entry(4)]);
  a.sharedStorage.removeItem(DPS_HISTORY_KEY);
  gm.set(mirrorKey, { type: "records", order: ["id:4"] });
  gm.set(...legacyField(["id:4"], { type: "object" }));
  for (const [key, value] of Object.entries(entry(4)))
    gm.set(...legacyField(["id:4", key], { type: "value", value }));
  local.set(DPS_HISTORY_KEY, JSON.stringify([entry(4)]));
  globalThis.location = {
    hostname: "www.milkywayidlecn.com",
    origin: "https://www.milkywayidlecn.com",
  };
  assert.deepEqual(read(b.sharedStorage), []);
  globalThis.location = {
    hostname: "www.milkywayidle.com",
    origin: "https://www.milkywayidle.com",
  };
});

test("new backups round trip and legacy field backups import without recreating tombstones", () => {
  write([entry(5)]);
  const backup = a.exportSharedBackup();
  assert.equal(
    Object.keys(backup.data).filter((key) =>
      key.startsWith(prefix.slice("MWITools_shared_v1:live:".length)),
    ).length,
    1,
  );
  a.sharedStorage.removeItem(DPS_HISTORY_KEY);
  a.restoreSharedBackup(backup);
  assert.deepEqual(read(), [entry(5)]);
  const legacy = Object.fromEntries(
    [
      legacyField([], { type: "records", order: ["id:6"] }),
      legacyField(["id:6"], { type: "object" }),
      ...Object.entries(entry(6)).map(([key, value]) =>
        legacyField(["id:6", key], { type: "value", value }),
      ),
    ].map(([key, value]) => [
      key.slice("MWITools_shared_v1:live:".length),
      value,
    ]),
  );
  a.restoreSharedBackup({ ...backup, data: legacy });
  assert.deepEqual(read(), [entry(6)]);
  const before = read();
  assert.throws(
    () =>
      a.restoreSharedBackup({
        ...backup,
        data: {
          [legacyField(["id:6", "customName"], {
            type: "value",
            value: "partial",
          })[0].slice("MWITools_shared_v1:live:".length)]: {
            type: "value",
            value: "partial",
          },
        },
      }),
    /Incomplete DPS history backup/,
  );
  assert.deepEqual(
    read(),
    before,
    "incomplete backups cannot clear valid history",
  );
});

test("partial restore failures roll back the authoritative history snapshot", () => {
  const backup = a.exportSharedBackup();
  write([entry(7), ...read()]);
  const before = read();
  let fail = true;
  globalThis.GM_setValues = (values) => {
    for (const [key, value] of Object.entries(values)) {
      GM_setValue(key, value);
      if (fail) {
        fail = false;
        throw new Error("partial failure");
      }
    }
  };
  try {
    assert.throws(() => a.restoreSharedBackup(backup), /partial failure/);
    assert.deepEqual(read(), before);
  } finally {
    delete globalThis.GM_setValues;
  }
});

test("history keeps favorites, caps non-favorites and enforces its UTF-8 byte budget", () => {
  const bounded = boundDpsHistory([
    { ...entry(1), favorite: true },
    ...Array.from({ length: 40 }, (_, index) => entry(index + 2)),
  ]);
  assert.equal(bounded.length, 11);
  assert.ok(bounded.find((value) => value.id === "1").favorite);
  const unicode = boundDpsHistory(
    Array.from({ length: 30 }, (_, index) => ({
      ...entry(index + 1),
      favorite: true,
      customName: "奶".repeat(30000),
    })),
  );
  assert.ok(
    new globalThis.TextEncoder().encode(JSON.stringify(unicode)).length <=
      1_000_000,
  );
  assert.ok(unicode.length > 0 && unicode.length < 30);
});

test("derived player cache fields are skipped, cleaned, and excluded from backup imports", async () => {
  const key = "kikimeter:settings:v4",
    settingsPrefix = `MWITools_shared_v1:live:record:${encodeURIComponent(key)}:`;
  gm.set(settingsPrefix + encodeURIComponent("[]"), { type: "object" });
  gm.set(settingsPrefix + encodeURIComponent('["language"]'), {
    type: "value",
    value: "en",
  });
  gm.set(settingsPrefix + encodeURIComponent('["classOverrides"]'), {
    type: "object",
  });
  gm.set(settingsPrefix + encodeURIComponent('["classOverrides","Player"]'), {
    type: "value",
    value: "fire",
  });
  const cacheKey =
    settingsPrefix + encodeURIComponent('["classCache","OldPlayer"]');
  gm.set(cacheKey, { type: "value", value: "fire" });
  assert.deepEqual(JSON.parse(a.sharedStorage.getItem(key)), {
    language: "en",
    classOverrides: { Player: "fire" },
  });
  await until(() => !gm.has(cacheKey));
  const backup = a.exportSharedBackup();
  a.restoreSharedBackup({
    ...backup,
    data: {
      [cacheKey.slice("MWITools_shared_v1:live:".length)]: {
        type: "value",
        value: "fire",
      },
    },
  });
  assert.equal(gm.has(cacheKey), false);
});
