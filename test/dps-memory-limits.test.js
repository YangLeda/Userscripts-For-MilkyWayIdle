import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import {
  createPlayerCache,
  PLAYER_CACHE_LIMIT,
} from "../src/features/dps/player-cache.js";

test("player cache evicts old names, preserves recently used players and does not rewrite unchanged values", () => {
  const values = new Map();
  let writes = 0;
  const cache = createPlayerCache({
    getItem: (key) => values.get(key),
    setItem: (key, value) => {
      writes++;
      values.set(key, value);
    },
  });
  for (let index = 0; index < 256; index++)
    cache.set(`Player${index}`, "classId", "fire");
  cache.get("Player0", "classId");
  const before = writes;
  for (let index = 0; index < 1000; index++)
    cache.set("Player0", "classId", "fire");
  assert.equal(writes, before);
  cache.set("Player256", "classId", "water");
  assert.equal(cache.get("Player1", "classId"), undefined);
  assert.equal(cache.get("Player0", "classId"), "fire");
  for (let index = 257; index < 5000; index++)
    cache.set(`Player${index}`, "weaponHrid", "/items/blazing_trident");
  assert.equal(JSON.parse([...values.values()][0]).length, PLAYER_CACHE_LIMIT);
});

test("oversized or malformed legacy player caches cannot bypass the limit", () => {
  let saved;
  const cache = createPlayerCache({
    getItem: () =>
      JSON.stringify([
        ...Array.from({ length: 2000 }, (_, index) => [
          `P${index}`,
          { classId: "fire" },
        ]),
        null,
        {},
      ]),
    setItem: (_key, value) => {
      saved = value;
    },
  });
  assert.equal(cache.get("P0", "classId"), undefined);
  assert.equal(cache.get("P1999", "classId"), "fire");
  assert.equal(JSON.parse(saved).length, PLAYER_CACHE_LIMIT);
});

const dom = new JSDOM(
  "<!doctype html><html><body><button id='target'>Player</button></body></html>",
  { url: "https://www.milkywayidle.com" },
);
for (const [name, value] of Object.entries({
  document: dom.window.document,
  window: dom.window,
  unsafeWindow: dom.window,
  localStorage: dom.window.localStorage,
  EventTarget: dom.window.EventTarget,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
}))
  Object.defineProperty(globalThis, name, { configurable: true, value });
localStorage.setItem(
  "kikimeter:settings:v4",
  JSON.stringify({
    language: "en",
    classOverrides: { Fixed: "water" },
    classCache: { Old: "fire" },
    weaponCache: { Old: "/items/old" },
  }),
);
const bundled = await build({
  entryPoints: ["test-support/dps-entry.js"],
  bundle: true,
  format: "esm",
  platform: "node",
  loader: { ".png": "dataurl" },
  write: false,
});
const { Settings, ClassSystem, Capture, ClassProbe, Session } = await import(
  "data:text/javascript;base64," +
    globalThis.Buffer.from(bundled.outputFiles[0].text).toString("base64")
);

test("derived class and weapon data stay bounded and local while manual overrides survive", () => {
  const before = JSON.parse(localStorage.getItem("kikimeter:settings:v4"));
  assert.equal(before.classCache, undefined);
  assert.equal(before.weaponCache, undefined);
  assert.equal(Settings.getClassOverride("Fixed"), "water");
  for (let index = 0; index < 2000; index++) {
    ClassSystem.setDetected(`P${index}`, "fire");
    Settings.setCachedWeapon(`P${index}`, "/items/blazing_trident");
  }
  assert.ok(
    Object.keys(ClassSystem.diagnostics()).length <= PLAYER_CACHE_LIMIT,
  );
  assert.equal(Settings.getCachedClass("P0"), undefined);
  assert.equal(Settings.getCachedClass("P1999"), "fire");
  assert.equal(
    JSON.parse(localStorage.getItem("kikimeter:player-cache:v1")).length,
    PLAYER_CACHE_LIMIT,
  );
  assert.equal(
    localStorage.getItem("kikimeter:settings:v4"),
    JSON.stringify(before),
    "learning players must not rewrite shared settings",
  );
});

test("manual capture stops at message and size limits and clear releases retained messages", () => {
  Capture.start();
  for (let index = 0; index < 5000; index++)
    Capture.record("battle_updated", { index });
  assert.equal(Capture.size(), 1000);
  Capture.clear();
  assert.equal(Capture.size(), 0);
  Capture.start();
  Capture.record("large", { text: "x".repeat(900000) });
  Capture.record("large", { text: "x".repeat(900000) });
  assert.equal(Capture.size(), 1);
  Capture.clear();
});

test("repeated reconnect fragments stay bounded without losing damage or accuracy totals", () => {
  Session.reset();
  for (let index = 0; index < 2000; index++) {
    Session.addTeamDamage(10, performance.now());
    Session.addPlayerDamage("Player", 10, "auto");
    Session.addPlayerAccuracy("Player", true, [
      { monsterName: "Rat", monsterHrid: "/monsters/rat", hit: true },
    ]);
    Session.pause("reconnect");
    Session.resume("reconnected");
  }
  const snapshot = Session.serialize();
  assert.ok(snapshot.fragments.length <= 100);
  assert.equal(snapshot.teamDamage, 20000);
  assert.equal(
    snapshot.fragments.reduce((sum, part) => sum + part.teamDamage, 0),
    20000,
  );
  assert.equal(
    snapshot.fragments.reduce(
      (sum, part) => sum + (part.players?.accuracy?.Player?.hits || 0),
      0,
    ),
    2000,
  );
  Session.restore(snapshot);
  Session.resume();
  assert.ok(Session.getFragments().length <= 100);
});

test("full probe stops at its message or combined byte budget including clicks", () => {
  try {
    ClassProbe.start();
    for (let index = 0; index < 5000; index++)
      ClassProbe.record("battle_updated", { index });
    assert.equal(ClassProbe.status().active, false);
    assert.equal(ClassProbe.status().fullMessageCount, 1000);
    assert.ok(ClassProbe.status().captureChars <= 1_000_000);
    ClassProbe.start();
    ClassProbe.record("oversized", { text: "x".repeat(1_100_000) });
    assert.equal(ClassProbe.status().active, false);
    assert.equal(ClassProbe.status().fullMessageCount, 0);
    ClassProbe.start();
    const button = document.getElementById("target");
    button.textContent = "x".repeat(20000);
    for (let index = 0; index < 100; index++) button.click();
    assert.equal(ClassProbe.status().active, false);
    assert.ok(ClassProbe.status().captureChars <= 1_000_000);
  } finally {
    ClassProbe.clear();
    dom.window.close();
  }
});
