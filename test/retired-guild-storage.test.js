import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  cleanupRetiredGuildStorage,
  isRetiredGuildStorageName,
} from "../src/core/retired-guild-storage.js";

const oldKey = "MWITools_xp_history_v2:production:guild:42";
const root = "MWITools_shared_v1:live:";
const record = root + "record:" + encodeURIComponent(oldKey) + ":";
const migration = root + "migration:https://www.milkywayidle.com:" + oldKey;
const retired = [
  "MWITools_xp_history_v1",
  oldKey,
  "MWITools_xp_migrated:production:guild:42",
  "MWITools_xp_object_migrated_v2:production:guild:42",
  record + "%5B%5D",
  record + "packed",
  record + "page:generation:0",
  record + "commit:generation",
  root + "revision:" + encodeURIComponent(oldKey),
  migration,
  root + "recovery:" + encodeURIComponent(migration),
  "MWITools_shared_v1:test:record:MWITools_xp_history_v1:%5B%5D",
];
const preserved = [
  "gameSettings",
  "MWITools_asset_history_v1",
  "kikimeter:history:production:42",
  "MWITools_guild_credit_recommendation_count_v1",
  "script_settingsMap",
  "MWITools_settings_v2",
  root + "record:MWITools_procurement_v1%3Aproduction%3A42:%5B%22guild%22%5D",
  root +
    "recovery:" +
    encodeURIComponent(
      root + "migration:https://www.milkywayidle.com:script_settingsMap",
    ),
  "MWITools_xp_history_v10",
  "MWITools_xp_history_v2_other",
  "another_script:MWITools_xp_history_v1",
  root + "record:MWITools_settings_v2:%5B%22MWITools_xp_history_v1%22%5D",
];
function fixture() {
  const dom = new JSDOM("", { url: "https://www.milkywayidle.com/game" });
  const gm = new Map();
  const host = {
    localStorage: dom.window.localStorage,
    setTimeout,
    clearTimeout,
    console: { info() {}, warn() {} },
    GM_listValues: () => [...gm.keys()],
    GM_getValue() {
      throw new Error("Cleanup must not read stored values");
    },
    GM_deleteValues: (names) => {
      assert.ok(names.length <= 128);
      names.forEach((key) => gm.delete(key));
    },
  };
  return { dom, gm, host };
}

test("retired store matching covers historical formats without matching active or foreign stores", () => {
  for (const name of retired)
    assert.equal(isRetiredGuildStorageName(name), true, name);
  for (const name of preserved)
    assert.equal(isRetiredGuildStorageName(name), false, name);
  assert.equal(
    isRetiredGuildStorageName(root + "record:%invalid:page:1"),
    false,
  );
  assert.equal(
    isRetiredGuildStorageName(root + "record:MWITools_xp_history_v1X"),
    false,
  );
});

test("startup physically removes all obsolete key formats in batches without loading their values", async () => {
  const { dom, gm, host } = fixture();
  const many = Array.from(
    { length: 6000 },
    (_, index) =>
      record + encodeURIComponent(JSON.stringify([`xp:guild:42:${index}`])),
  );
  for (const key of [...retired, ...many]) gm.set(key, "large old payload");
  for (const key of [...retired, ...preserved])
    host.localStorage.setItem(key, "keep or remove");
  for (const key of preserved) gm.set(key, "keep");
  let turns = 0;
  const timer = setInterval(() => turns++, 0);
  try {
    const work = cleanupRetiredGuildStorage(host);
    assert.equal(
      gm.size,
      retired.length + many.length + preserved.length,
      "startup first yields before deleting",
    );
    const result = await work;
    assert.equal(result.shared, retired.length + many.length);
    assert.equal(result.local, retired.length);
    assert.equal(result.failed, 0);
    assert.ok(turns > 2);
    assert.deepEqual([...gm.keys()], preserved);
    for (const key of preserved)
      assert.equal(host.localStorage.getItem(key), "keep or remove");
    for (const key of retired)
      assert.equal(host.localStorage.getItem(key), null);
    assert.equal((await cleanupRetiredGuildStorage(host)).shared, 0);
  } finally {
    clearInterval(timer);
    dom.window.close();
  }
});

test("individual deletion failures do not block startup and remaining keys retry next time", async () => {
  const { dom, gm, host } = fixture();
  delete host.GM_deleteValues;
  retired.forEach((name) => gm.set(name, "old"));
  let fail = true;
  host.GM_deleteValue = (key) => {
    if (fail && key === oldKey)
      throw new Error("Manager temporarily unavailable");
    gm.delete(key);
  };
  const first = await cleanupRetiredGuildStorage(host);
  assert.equal(first.failed, 1);
  assert.ok(gm.has(oldKey));
  fail = false;
  assert.equal((await cleanupRetiredGuildStorage(host)).failed, 0);
  assert.equal(gm.size, 0);
  dom.window.close();
});

test("blocked IndexedDB deletion releases startup and can finish when the old tab closes", async () => {
  const { dom, host } = fixture();
  let request;
  host.indexedDB = {
    deleteDatabase(name) {
      assert.equal(name, "MWIToolsHistory");
      request = {};
      globalThis.queueMicrotask(() => request.onblocked());
      return request;
    },
  };
  const result = await cleanupRetiredGuildStorage(host);
  assert.equal(result.database, "blocked");
  request.onsuccess();
  assert.equal(result.database, "deleted");
  dom.window.close();
});

test("unresponsive database deletion is bounded and database failures are retryable", async () => {
  const { dom, host } = fixture();
  host.setTimeout = (callback, delay) =>
    setTimeout(callback, delay === 500 ? 5 : delay);
  host.indexedDB = { deleteDatabase: () => ({}) };
  assert.equal((await cleanupRetiredGuildStorage(host)).database, "pending");
  host.indexedDB.deleteDatabase = () => {
    const request = { error: new Error("database unavailable") };
    globalThis.queueMicrotask(() => request.onerror());
    return request;
  };
  const result = await cleanupRetiredGuildStorage(host);
  assert.equal(result.database, "failed");
  assert.equal(result.failed, 1);
  dom.window.close();
});

test("old backups skip retired local, packed and recovery data but restore active settings", async () => {
  const { dom, gm, host } = fixture();
  Object.assign(globalThis, {
    localStorage: host.localStorage,
    location: dom.window.location,
    GM_getValue: (key, fallback) => gm.get(key) ?? fallback,
    GM_setValue: (key, value) => gm.set(key, value),
    GM_listValues: host.GM_listValues,
    GM_deleteValue: (key) => gm.delete(key),
  });
  const storage = await import("../src/core/shared-storage.js?retired-backup");
  const data = Object.fromEntries(
    retired
      .filter((name) => name.startsWith(root))
      .map((name) => [
        name.slice(root.length),
        { type: "value", value: "old archive" },
      ]),
  );
  data["local:" + oldKey] = "old local archive";
  data["record:MWITools_settings_v2:%5B%5D"] = {
    type: "value",
    value: { version: 2, values: { taskInsights: false } },
  };
  storage.restoreSharedBackup({
    __mwitools_backup__: true,
    version: 1,
    environment: "live",
    data,
  });
  assert.equal(
    JSON.parse(storage.sharedStorage.getItem("MWITools_settings_v2")).values
      .taskInsights,
    false,
  );
  assert.equal([...gm.keys()].some(isRetiredGuildStorageName), false);
  assert.equal(host.localStorage.getItem(oldKey), null);
  // Even archives reintroduced by an old tab are never read during new backups.
  gm.set(record + "packed", "invalid manifest that must not be read");
  const backup = storage.exportSharedBackup();
  assert.equal(
    Object.keys(backup.data).some((key) =>
      isRetiredGuildStorageName(root + key),
    ),
    false,
  );
  await cleanupRetiredGuildStorage(host);
  dom.window.close();
});
