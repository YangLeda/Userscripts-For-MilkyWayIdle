import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
const gm = new Map();
globalThis.GM_getValue = (key, fallback) =>
  gm.has(key) ? globalThis.structuredClone(gm.get(key)) : fallback;
globalThis.GM_setValue = (key, value) =>
  gm.set(key, globalThis.structuredClone(value));
globalThis.GM_listValues = () => [...gm.keys()];
const domains = new Map();
function site(host) {
  if (!domains.has(host))
    domains.set(host, new JSDOM("", { url: `https://${host}` }));
  globalThis.localStorage = domains.get(host).window.localStorage;
  globalThis.location = domains.get(host).window.location;
}
site("www.milkywayidle.com");
const a = await import("../src/core/shared-storage.js?site=a");
const b = await import("../src/core/shared-storage.js?site=b");
const key = "MWITools_procurement_v1:production:42";
const cnKey = key.replace(":production:", ":china:");
const put = (store, value, name = key) =>
  store.setItem(name, JSON.stringify(value));
const get = (store, name = key) => JSON.parse(store.getItem(name));
test("import does not synchronously migrate inactive stores; background migration yields and backup includes them", async () => {
  const inactive = "MWITools_test_inactive_character";
  localStorage.setItem(
    inactive,
    JSON.stringify({ cart: [{ itemHrid: "/items/inactive", quantity: 8 }] }),
  );
  const before = gm.size;
  const fresh = await import("../src/core/shared-storage.js?lazy-startup");
  assert.equal(gm.size, before, "module evaluation must not write migrations");
  const run = fresh.scheduleSharedMigration();
  assert.equal(gm.size, before, "first background work yields to the game");
  assert.equal(
    run,
    fresh.scheduleSharedMigration(),
    "coalesce background imports",
  );
  await run;
  assert.equal(
    JSON.parse(fresh.sharedStorage.getItem(inactive)).cart[0].quantity,
    8,
  );
  const backupOnly = "MWITools_test_backup_inactive";
  localStorage.setItem(backupOnly, "backup-value");
  assert.ok(
    Object.keys(fresh.exportSharedBackup().data).some((name) =>
      name.startsWith(`record:${backupOnly}:`),
    ),
  );
});
test("live origins merge records once without adding duplicate quantities", () => {
  localStorage.setItem(
    key,
    JSON.stringify({ cart: [{ itemHrid: "/items/a", quantity: 20 }] }),
  );
  assert.equal(get(a.sharedStorage).cart[0].quantity, 20);
  site("www.milkywayidlecn.com");
  localStorage.setItem(
    cnKey,
    JSON.stringify({
      cart: [
        { itemHrid: "/items/a", quantity: 20 },
        { itemHrid: "/items/b", quantity: 3 },
      ],
    }),
  );
  assert.equal(get(b.sharedStorage, cnKey).cart.length, 2);
  assert.equal(get(b.sharedStorage, cnKey).cart[0].quantity, 20);
  assert.ok(
    Object.keys(b.exportSharedBackup().data).some((key) =>
      key.startsWith("recovery:"),
    ),
  );
});
test("stale tab edits preserve independent changes and cannot resurrect a deleted record", () => {
  const stale = get(b.sharedStorage, cnKey);
  site("www.milkywayidle.com");
  const latest = get(a.sharedStorage);
  latest.cart = latest.cart.filter((row) => row.itemHrid !== "/items/a");
  put(a.sharedStorage, latest);
  site("www.milkywayidlecn.com");
  stale.cart.find((row) => row.itemHrid === "/items/b").quantity = 7;
  put(b.sharedStorage, stale, cnKey);
  assert.deepEqual(get(b.sharedStorage, cnKey).cart, [
    { itemHrid: "/items/b", quantity: 7 },
  ]);
});
test("test server and stable character IDs stay isolated", () => {
  site("test.milkywayidle.com");
  assert.equal(a.sharedStorage.getItem(key), null);
  site("www.milkywayidle.com");
  assert.equal(a.sharedStorage.getItem(key.replace(":42", ":43")), null);
  assert.equal(get(a.sharedStorage).cart[0].quantity, 7);
});
test("backup validates all records before restoring and restores round trip", () => {
  const backup = a.exportSharedBackup();
  const before = JSON.stringify([...gm]);
  assert.throws(() =>
    a.restoreSharedBackup({
      ...backup,
      data: { ...backup.data, "bad:key": 1 },
    }),
  );
  assert.equal(JSON.stringify([...gm]), before);
  a.restoreSharedBackup(backup);
  assert.equal(get(a.sharedStorage).cart[0].quantity, 7);
});

test("newer timestamped records win during migration while unknown-age conflicts are retained", async () => {
  site("www.milkywayidle.com");
  const newerKey = "MWITools_procurement_v1:production:timestamped";
  localStorage.setItem(
    newerKey,
    JSON.stringify({
      cart: [
        {
          itemHrid: "/items/a",
          quantity: 2,
          updatedAt: "2026-09-01T00:00:00Z",
        },
      ],
    }),
  );
  get(a.sharedStorage, newerKey);
  site("www.milkywayidlecn.com");
  const cn = newerKey.replace(":production:", ":china:");
  localStorage.setItem(
    cn,
    JSON.stringify({
      cart: [
        {
          itemHrid: "/items/a",
          quantity: 9,
          updatedAt: "2026-09-28T00:00:00Z",
        },
      ],
    }),
  );
  assert.equal(get(b.sharedStorage, cn).cart[0].quantity, 9);
});

test("large shared stores batch writes and reuse unchanged reads without scanning all keys", () => {
  site("www.milkywayidle.com");
  const original = {
    get: GM_getValue,
    list: globalThis.GM_listValues,
    set: GM_setValue,
  };
  let reads = 0,
    lists = 0,
    batches = 0,
    writes = 0;
  globalThis.GM_getValue = (...args) => {
    reads++;
    return original.get(...args);
  };
  globalThis.GM_listValues = () => {
    lists++;
    return original.list();
  };
  globalThis.GM_setValue = (...args) => {
    writes++;
    return original.set(...args);
  };
  globalThis.GM_setValues = (values) => {
    batches++;
    for (const [key, value] of Object.entries(values)) original.set(key, value);
  };
  const name = "MWITools_test_large_history";
  const raw = JSON.stringify(
    Array.from({ length: 1500 }, (_, id) => ({ id, at: id, xp: id * 20 })),
  );
  try {
    a.sharedStorage.setItem(name, raw);
    assert.equal(
      batches,
      1,
      "all changed records cross the manager bridge in one batch",
    );
    assert.equal(a.sharedStorage.getItem(name), raw);
    reads = lists = writes = batches = 0;
    for (let i = 0; i < 30; i++)
      assert.equal(a.sharedStorage.getItem(name), raw);
    assert.equal(
      lists,
      0,
      "unchanged reads must not enumerate the full userscript store",
    );
    assert.ok(
      reads <= 60,
      "only the migration marker and revision need reading",
    );
    a.sharedStorage.setItem(name, raw);
    assert.equal(batches, 0);
    assert.equal(
      writes,
      0,
      "unchanged writes must not send cross-tab refresh events",
    );
  } finally {
    globalThis.GM_getValue = original.get;
    globalThis.GM_listValues = original.list;
    globalThis.GM_setValue = original.set;
    delete globalThis.GM_setValues;
  }
});

test("bulk reads reload changed remote records and keep test-server snapshots separate", async () => {
  site("www.milkywayidle.com");
  let bulkReads = 0;
  globalThis.GM_getValues = (keys) => {
    bulkReads++;
    return Object.fromEntries(keys.map((key) => [key, GM_getValue(key)]));
  };
  const other = await import("../src/core/shared-storage.js?bulk-reader");
  const name = "MWITools_test_remote";
  try {
    a.sharedStorage.setItem(name, JSON.stringify({ value: 1 }));
    assert.equal(other.sharedStorage.getItem(name), '{"value":1}');
    const firstReads = bulkReads;
    assert.equal(other.sharedStorage.getItem(name), '{"value":1}');
    assert.equal(bulkReads, firstReads);
    a.sharedStorage.setItem(name, JSON.stringify({ value: 2 }));
    assert.equal(other.sharedStorage.getItem(name), '{"value":2}');
    site("test.milkywayidle.com");
    other.sharedStorage.setItem(name, '{"value":3}');
    assert.equal(other.sharedStorage.getItem(name), '{"value":3}');
    site("www.milkywayidle.com");
    assert.equal(other.sharedStorage.getItem(name), '{"value":2}');
  } finally {
    delete globalThis.GM_getValues;
  }
});

test("language caches and origin migration markers stay local", () => {
  site("www.milkywayidle.com");
  const before = gm.size;
  for (const name of [
    "MWITools_game_locale_v1:build:zh",
    "MWITools_important_update_manifest_v1",
    "MWITools_xp_migrated:member:42",
    "MWITools_xp_object_migrated_v2:member:42",
  ]) {
    a.sharedStorage.setItem(name, "local-only");
    assert.equal(localStorage.getItem(name), "local-only");
    assert.equal(a.sharedStorage.getItem(name), "local-only");
  }
  assert.equal(gm.size, before);
});

test("XP samples remain whole records and bulk restore rolls back failed writes", () => {
  site("www.milkywayidle.com");
  const name = "MWITools_xp_history_v2:member:atomic-test";
  const raw = JSON.stringify([
    { objectKey: "member:atomic-test", at: 123, xp: 456 },
  ]);
  a.sharedStorage.setItem(name, raw);
  const prefix = `MWITools_shared_v1:live:record:${encodeURIComponent(name)}:`;
  assert.equal(
    [...gm.keys()].filter((key) => key.startsWith(prefix)).length,
    2,
    "one order node and one complete sample, with no per-field GM keys",
  );
  const backup = a.exportSharedBackup();
  a.sharedStorage.setItem(
    name,
    JSON.stringify([{ objectKey: "member:atomic-test", at: 123, xp: 789 }]),
  );
  const expected = a.sharedStorage.getItem(name);
  let fail = true;
  globalThis.GM_setValues = (values) => {
    for (const [key, value] of Object.entries(values)) {
      globalThis.GM_setValue(key, value);
      if (fail) {
        fail = false;
        throw new Error("simulated batch failure");
      }
    }
  };
  try {
    assert.throws(
      () => a.restoreSharedBackup(backup),
      /simulated batch failure/,
    );
    assert.equal(a.sharedStorage.getItem(name), expected);
    a.restoreSharedBackup(backup);
    assert.equal(a.sharedStorage.getItem(name), raw);
  } finally {
    delete globalThis.GM_setValues;
  }
});
