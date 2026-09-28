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
