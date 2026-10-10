import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  readPackedHistory,
  writePackedHistory,
} from "../src/core/packed-history.js";

const gm = new Map();
const dom = new JSDOM("", { url: "https://www.milkywayidle.com" });
Object.assign(globalThis, {
  localStorage: dom.window.localStorage,
  location: dom.window.location,
  GM_getValue: (key, fallback) =>
    gm.has(key) ? globalThis.structuredClone(gm.get(key)) : fallback,
  GM_setValue: (key, value) => gm.set(key, globalThis.structuredClone(value)),
  GM_deleteValue: (key) => gm.delete(key),
  GM_listValues: () => [...gm.keys()],
});
const {
  sharedStorage,
  exportSharedBackup,
  restoreSharedBackup,
  scheduleSharedMigration,
} = await import("../src/core/shared-storage.js");
const prefix = (name) =>
  `MWITools_shared_v1:live:record:${encodeURIComponent(name)}:`;
const pathKey = (base, path) => base + encodeURIComponent(JSON.stringify(path));
const day = 86400000;

test("rolling XP retention bounds keys and deletion metadata; expired old-tab writes cannot resurrect samples", () => {
  const name = "MWITools_xp_history_v2:member:growth";
  const realNow = Date.now;
  const start = realNow();
  try {
    for (let index = 0; index < 65; index++) {
      Date.now = () => start + index * day;
      sharedStorage.setItem(
        name,
        JSON.stringify(
          Array.from({ length: 100 }, (_, sample) => ({
            objectKey: "member:growth",
            at: Date.now() + sample,
            xp: index * 100 + sample,
          })),
        ),
      );
    }
    const base = prefix(name);
    assert.equal(
      [...gm.keys()].filter((key) => key.startsWith(base)).length,
      2,
    );
    const entries = readPackedHistory(base);
    assert.ok(
      entries.size <= 3201,
      "expired tombstones are bounded by the retention window",
    );
    assert.ok(
      JSON.stringify([...gm]).length < 100000,
      "repeated namespace strings and individual GM keys must disappear",
    );
    const current = sharedStorage.getItem(name);
    gm.set(pathKey(base, [`xp:member:growth:${start}`]), {
      type: "value",
      value: { objectKey: "member:growth", at: start, xp: 9999 },
      updatedAt: Date.now() + 1,
    });
    gm.set(
      `MWITools_shared_v1:live:revision:${encodeURIComponent(name)}`,
      "old-tab-write",
    );
    assert.equal(sharedStorage.getItem(name), current);
    assert.equal(
      [...gm.keys()].filter((key) => key.startsWith(base)).length,
      2,
    );
  } finally {
    Date.now = realNow;
  }
});

test("background migrates GM-only old field schemas, retaining active samples and recent deletions", async () => {
  const name = "MWITools_xp_history_v2:member:legacy";
  const base = prefix(name);
  const at = Date.now();
  const identity = `xp:member:legacy:${at}`;
  const gone = `xp:member:legacy:${at - 1}`;
  const node = (path, value) =>
    gm.set(pathKey(base, path), { ...value, updatedAt: at });
  node([], { type: "records", order: [identity, gone] });
  node([identity], { type: "object" });
  node([identity, "objectKey"], { type: "value", value: "member:legacy" });
  node([identity, "at"], { type: "value", value: at });
  node([identity, "xp"], { type: "value", value: { smithing: 700 } });
  node([gone], { deleted: true });
  // Fresh module indexes the already persisted stores, even with no local key.
  const fresh = await import("../src/core/shared-storage.js?gm-only");
  await fresh.scheduleSharedMigration();
  const expected = [{ objectKey: "member:legacy", at, xp: { smithing: 700 } }];
  assert.deepEqual(JSON.parse(fresh.sharedStorage.getItem(name)), expected);
  assert.equal([...gm.keys()].filter((key) => key.startsWith(base)).length, 2);
  assert.equal(
    readPackedHistory(base).get(JSON.stringify([gone])).deleted,
    true,
  );
});

test("compressed writes are paged, failed verification keeps the previous generation", () => {
  const base = "test:packed:";
  const old = new Map([["[]", { type: "value", value: "old" }]]);
  writePackedHistory(base, old);
  const originalSet = globalThis.GM_setValue;
  const next = new Map([
    [
      "[]",
      {
        type: "value",
        value: Array.from(
          { length: 50000 },
          (_, index) => `${index}:${Math.random()}`,
        ),
      },
    ],
  ]);
  let pages = 0;
  globalThis.GM_setValue = (key, value) => {
    if (key.includes(":page:")) {
      pages++;
      assert.ok(value.length <= 128 * 1024);
      if (pages === 2) return;
    }
    originalSet(key, value);
  };
  try {
    assert.throws(() => writePackedHistory(base, next), /verification/);
    assert.deepEqual(readPackedHistory(base), old);
    assert.equal(
      [...gm.keys()].filter((key) => key.startsWith(base)).length,
      2,
    );
  } finally {
    globalThis.GM_setValue = originalSet;
  }
});

test("version-1 backup exports complete samples and imports into packed storage", async () => {
  const name = "MWITools_xp_history_v2:member:backup";
  const rows = [{ objectKey: "member:backup", at: Date.now(), xp: 123 }];
  sharedStorage.setItem(name, JSON.stringify(rows));
  const backup = exportSharedBackup();
  assert.equal(backup.version, 1);
  assert.ok(
    !Object.keys(backup.data).some((key) =>
      /:packed$|:page:|:commit:/.test(key),
    ),
  );
  sharedStorage.setItem(name, JSON.stringify([{ ...rows[0], xp: 999 }]));
  restoreSharedBackup(backup);
  assert.deepEqual(JSON.parse(sharedStorage.getItem(name)), rows);
  await scheduleSharedMigration();
});

test("packed XP histories merge independent cross-site samples and keep deleted samples deleted", async () => {
  const name = "MWITools_xp_history_v2:member:cross-site";
  const row = { objectKey: "member:cross-site", at: Date.now(), xp: 1 };
  const other = await import("../src/core/shared-storage.js?packed-cn");
  sharedStorage.setItem(name, JSON.stringify([row]));
  other.sharedStorage.getItem(name);
  sharedStorage.setItem(
    name,
    JSON.stringify([row, { ...row, at: row.at + 1, xp: 2 }]),
  );
  other.sharedStorage.setItem(
    name,
    JSON.stringify([row, { ...row, at: row.at + 2, xp: 3 }]),
  );
  assert.deepEqual(
    JSON.parse(sharedStorage.getItem(name))
      .map(({ xp }) => xp)
      .sort(),
    [1, 2, 3],
  );
  other.sharedStorage.getItem(name);
  sharedStorage.removeItem(name);
  other.sharedStorage.setItem(
    name,
    JSON.stringify([
      row,
      { ...row, at: row.at + 2, xp: 3 },
      { ...row, at: row.at + 1, xp: 2 },
    ]),
  );
  assert.deepEqual(JSON.parse(sharedStorage.getItem(name) ?? "[]"), []);
});

test("failed manifest commits do not accumulate unpublished pages", () => {
  const base = "test:manifest-failure:";
  const old = new Map([["[]", { type: "value", value: 1 }]]);
  writePackedHistory(base, old);
  const original = globalThis.GM_setValue;
  globalThis.GM_setValue = (key, value) => {
    if (key.includes(":commit:")) return;
    original(key, value);
  };
  try {
    for (let attempt = 0; attempt < 3; attempt++)
      assert.throws(
        () =>
          writePackedHistory(
            base,
            new Map([["[]", { type: "value", value: 2 }]]),
          ),
        /manifest verification/,
      );
    assert.deepEqual(readPackedHistory(base), old);
    assert.equal(
      [...gm.keys()].filter((key) => key.startsWith(base)).length,
      2,
    );
  } finally {
    globalThis.GM_setValue = original;
  }
});

test("legacy bulk loading and cleanup yield between bounded batches", async () => {
  const name = "MWITools_xp_history_v2:member:yielding";
  const base = prefix(name);
  const at = Date.now();
  const ids = Array.from(
    { length: 600 },
    (_, index) => `xp:member:yielding:${at + index}`,
  );
  gm.set(pathKey(base, []), { type: "records", order: ids, updatedAt: at });
  ids.forEach((id, index) =>
    gm.set(pathKey(base, [id]), {
      type: "value",
      value: { objectKey: "member:yielding", at: at + index, xp: index },
      updatedAt: at,
    }),
  );
  const fresh = await import("../src/core/shared-storage.js?yielding");
  let turns = 0;
  const timer = setInterval(() => turns++, 0);
  globalThis.GM_getValues = (names) => {
    assert.ok(names.length <= 256);
    return Object.fromEntries(
      names.map((key) => [key, globalThis.GM_getValue(key)]),
    );
  };
  try {
    await fresh.prepareSharedHistory(name);
    assert.ok(
      turns > 2,
      "the page can run work while loading and deleting old keys",
    );
    assert.equal(JSON.parse(fresh.sharedStorage.getItem(name)).length, 600);
    assert.equal(
      [...gm.keys()].filter((key) => key.startsWith(base)).length,
      2,
    );
  } finally {
    clearInterval(timer);
    delete globalThis.GM_getValues;
  }
});

test("simultaneous publications retain both writers and consolidate on the next save", () => {
  const base = "test:concurrent:";
  const first = new Map([["[]", { type: "records", order: [], updatedAt: 1 }]]);
  writePackedHistory(base, first);
  const a = new Map([
    ["[]", { type: "records", order: ["xp:a:1"], updatedAt: 2 }],
    [
      JSON.stringify(["xp:a:1"]),
      { type: "value", value: { objectKey: "a", at: 1, xp: 10 }, updatedAt: 2 },
    ],
  ]);
  const b = new Map([
    ["[]", { type: "records", order: ["xp:b:2"], updatedAt: 2 }],
    [
      JSON.stringify(["xp:b:2"]),
      { type: "value", value: { objectKey: "b", at: 2, xp: 20 }, updatedAt: 2 },
    ],
  ]);
  const original = globalThis.GM_setValue;
  let concurrent = false;
  globalThis.GM_setValue = (key, value) => {
    if (key.startsWith(base) && key.includes(":commit:") && !concurrent) {
      concurrent = true;
      writePackedHistory(base, b);
    }
    original(key, value);
  };
  try {
    writePackedHistory(base, a);
  } finally {
    globalThis.GM_setValue = original;
  }
  const both = readPackedHistory(base);
  assert.ok(both.has(JSON.stringify(["xp:a:1"])));
  assert.ok(both.has(JSON.stringify(["xp:b:2"])));
  writePackedHistory(base, both);
  assert.equal([...gm.keys()].filter((key) => key.startsWith(base)).length, 2);
});
