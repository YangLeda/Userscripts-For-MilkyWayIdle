import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.window = dom.window;

localStorage.setItem(
  "script_settingsMap",
  JSON.stringify({
    showDamage: { id: "showDamage", isTrue: false },
    battleBuffs: { id: "battleBuffs", isTrue: false },
    forceMWIToolsDisplayZH: { id: "forceMWIToolsDisplayZH", isTrue: true },
  }),
);

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/features/settings-and-notifications.js");
runtime.api.readSettings();
runtime.api.dpsPerformance = {
  get: () => ({
    showGraph: false,
    recountShowGraph: false,
    refreshIntervalMs: 1000,
  }),
  set: () => {
    throw new Error("upgrade close must not rewrite DPS settings");
  },
};
const profile = await import("../src/core/performance-profile.js");

test("closing the upgrade guide preserves migrated settings and records custom", async () => {
  assert.equal(profile.hasExistingSettingsAtLoad(), true);
  const before = localStorage.getItem("MWITools_settings_v2");
  const state = await profile.completePerformanceOnboardingWithoutChanges();
  assert.equal(state.completed, true);
  assert.equal(state.tier, "custom");
  assert.equal(runtime.settings.get("showDamage"), false);
  assert.equal(runtime.settings.get("battleBuffs"), false);
  assert.equal(runtime.settings.get("forceMWIToolsDisplayZH"), true);
  assert.equal(localStorage.getItem("MWITools_settings_v2"), before);
  dom.window.close();
});
