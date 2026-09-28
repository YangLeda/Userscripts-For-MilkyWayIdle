import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("", { url: "https://www.milkywayidle.com" });
const gm = new Map();
const changed = [];
Object.assign(globalThis, {
  localStorage: dom.window.localStorage,
  location: dom.window.location,
  GM_getValue: (key, fallback) =>
    gm.has(key) ? globalThis.structuredClone(gm.get(key)) : fallback,
  GM_setValue: (key, value) => {
    changed.push(key);
    gm.set(key, globalThis.structuredClone(value));
  },
  GM_listValues: () => [...gm.keys()],
  GM_setValues: (values) => {
    for (const [key, value] of Object.entries(values)) {
      changed.push(key);
      gm.set(key, globalThis.structuredClone(value));
    }
  },
});
const hour = 3_600_000;
const now = Date.now();
const legacy = Array.from({ length: 100 }, (_, id) =>
  Array.from({ length: 20 }, (_, index) => ({
    objectKey: `member:${id}`,
    at: now - (20 - index) * hour,
    xp: index * 100,
  })),
).flat();
localStorage.setItem("MWITools_xp_history_v1", JSON.stringify(legacy));
const { runtime } = await import("../src/core/runtime.js");
const { sharedStorage } = await import("../src/core/shared-storage.js");
await import("../src/core/xp-history.js");

test("XP history imports legacy samples and updates only the sampled member", async () => {
  const beforeLegacy = sharedStorage.getItem("MWITools_xp_history_v1");
  const first = await runtime.api.getXpHistory("member:1");
  const second = await runtime.api.getXpHistory("member:2");
  assert.equal(first.length, 20);
  assert.equal(second.length, 20);
  changed.length = 0;
  assert.equal(await runtime.api.recordXpSnapshot("member:1", 2100, now), true);
  assert.equal((await runtime.api.getXpHistory("member:1")).at(-1).xp, 2100);
  assert.deepEqual(await runtime.api.getXpHistory("member:2"), second);
  assert.equal(
    sharedStorage.getItem("MWITools_xp_history_v1"),
    beforeLegacy,
    "legacy history remains a recoverable copy",
  );
  const records = changed.filter((key) => key.includes(":record:"));
  assert.ok(records.length > 0 && records.length < 10);
  assert.ok(
    records.every((key) =>
      decodeURIComponent(key).includes("MWITools_xp_history_v2:member:1:"),
    ),
    "no other member or full-history writes",
  );
  changed.length = 0;
  assert.equal(
    await runtime.api.recordXpSnapshot("member:1", 2100, now + hour),
    false,
  );
  assert.equal(changed.length, 0, "unchanged XP produces no storage writes");
});

test("first-time member migrations yield to the page event loop", async () => {
  let pageTurnRan = false;
  setTimeout(() => {
    pageTurnRan = true;
  }, 0);
  const rows = await Promise.all(
    [3, 4, 5].map((id) => runtime.api.getXpHistory(`member:${id}`)),
  );
  assert.equal(
    pageTurnRan,
    true,
    "migration must allow pending UI work to run",
  );
  assert.ok(rows.every((history) => history.length === 20));
});
