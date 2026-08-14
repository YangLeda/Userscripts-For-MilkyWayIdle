import assert from "node:assert/strict";
import test, { after } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  {
    url: "https://www.milkywayidle.com/",
    pretendToBeVisual: true,
  },
);
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.Event = dom.window.Event;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.window = dom.window;

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
const profile = await import("../src/core/performance-profile.js");

let dpsPerformance = {
  showGraph: false,
  recountShowGraph: false,
  refreshIntervalMs: 1000,
};
let persistCount = 0;
let pageReloadCount = 0;
runtime.api.persistSettings = () => {
  persistCount += 1;
};
runtime.api.dpsPerformance = {
  get: () => ({ ...dpsPerformance }),
  set: (value) => {
    dpsPerformance = { ...dpsPerformance, ...value };
    return { ...dpsPerformance };
  },
};
runtime.api.reloadPage = () => {
  pageReloadCount += 1;
};
runtime.features.pauseInitialization();

after(() => dom.window.close());

test("conditional profile rules cover combat, life, all-on, and all-off", () => {
  assert.equal(profile.resolveConditionalRule("combat-on", "life"), false);
  assert.equal(profile.resolveConditionalRule("combat-on", "combat"), true);
  assert.equal(profile.resolveConditionalRule("combat-on", "balanced"), true);
  assert.equal(profile.resolveConditionalRule("life-on", "life"), true);
  assert.equal(profile.resolveConditionalRule("life-on", "combat"), false);
  assert.equal(profile.resolveConditionalRule("life-on", "balanced"), true);
  assert.equal(profile.resolveConditionalRule("all-on", "life"), true);
  assert.equal(profile.resolveConditionalRule("all-off", "combat"), false);
});

test("all nine usage and performance presets resolve to the approved matrix", () => {
  for (const usage of ["life", "combat", "balanced"]) {
    const smooth = profile.resolvePresetChoices(usage, "smooth");
    assert.equal(smooth.dps, usage !== "life");
    assert.equal(smooth.battleBuffs, false);
    assert.equal(smooth.assetHistory, false);
    assert.equal(smooth.decorativeAnimations, false);
    assert.equal(smooth.dpsGraph, false);
    assert.equal(smooth.refreshIntervalMs, 2000);

    const standard = profile.resolvePresetChoices(usage, "standard");
    assert.equal(standard.dps, true);
    assert.equal(standard.battleBuffs, usage !== "life");
    assert.equal(standard.assetHistory, true);
    assert.equal(standard.decorativeAnimations, true);
    assert.equal(standard.dpsGraph, false);
    assert.equal(standard.refreshIntervalMs, 1000);

    const full = profile.resolvePresetChoices(usage, "full");
    for (const [field, value] of Object.entries(full)) {
      assert.equal(value, field === "refreshIntervalMs" ? 1000 : true);
    }
  }
});

test("a profile applies settings atomically and leaves unrelated settings alone", async () => {
  const originalLanguage =
    runtime.settings.settingsMap.forceMWIToolsDisplayZH.isTrue;
  persistCount = 0;
  const state = await profile.applyPerformanceProfile({
    usage: "combat",
    tier: "full",
  });

  assert.equal(persistCount, 1);
  assert.equal(state.completed, true);
  assert.equal(state.usage, "combat");
  assert.equal(state.tier, "full");
  assert.equal(runtime.settings.get("showDamage"), true);
  assert.equal(runtime.settings.get("battleBuffs"), true);
  assert.equal(runtime.settings.get("assetHistory"), true);
  assert.equal(runtime.settings.get("itemTooltip_profitRequireKey"), true);
  assert.equal(
    runtime.settings.getPreference("productionSummaryMode"),
    "collapsed",
  );
  assert.deepEqual(dpsPerformance, {
    showGraph: true,
    recountShowGraph: true,
    refreshIntervalMs: 1000,
  });
  assert.equal(document.documentElement.dataset.mwitoolsDecorativeMotion, "on");
  assert.equal(
    runtime.settings.settingsMap.forceMWIToolsDisplayZH.isTrue,
    originalLanguage,
  );

  runtime.settings.settingsMap.showDamage.isTrue = false;
  assert.equal(profile.getProfileState().tier, "custom");
});

test("batch validation rejects the whole update before mutating any setting", async () => {
  const before = runtime.settings.get("showDamage");
  await assert.rejects(
    runtime.settings.applyBatch({
      values: { showDamage: !before, missingPerformanceSetting: true },
    }),
    /Unknown MWITools setting/,
  );
  assert.equal(runtime.settings.get("showDamage"), before);

  await assert.rejects(
    runtime.settings.applyBatch({
      preferences: { productionSummaryMode: "invalid" },
    }),
    /Invalid MWITools preference/,
  );
});

test("closing a fresh install records balanced standard defaults", async () => {
  localStorage.removeItem(profile.PERFORMANCE_PROFILE_STORAGE_KEY);
  profile.resetPerformanceProfileForTests();
  const state = await profile.completePerformanceOnboardingWithoutChanges();
  assert.equal(state.completed, true);
  assert.equal(state.usage, "balanced");
  assert.equal(state.tier, "standard");
  assert.equal(runtime.settings.get("showDamage"), true);
  assert.equal(runtime.settings.get("battleBuffs"), true);
  assert.equal(dpsPerformance.showGraph, false);
});

test("the native-style custom path groups choices, applies once, and restores focus", async () => {
  const { openPerformanceOnboarding, PERFORMANCE_ONBOARDING_ID } =
    await import("../src/features/performance-onboarding.js");
  const trigger = document.createElement("button");
  trigger.textContent = "settings";
  document.body.append(trigger);
  trigger.focus();
  runtime.config.isZH = true;
  pageReloadCount = 0;

  const resultPromise = openPerformanceOnboarding({ firstRun: false });
  const root = document.getElementById(PERFORMANCE_ONBOARDING_ID);
  assert.ok(root);
  assert.equal(root.getAttribute("aria-modal"), "true");
  assert.ok(root.querySelector(".mwi-performance-card"));
  assert.match(root.textContent, /设备长时间挂机/);
  assert.doesNotMatch(root.textContent, /手机长时间挂机/);
  const progress = () => root.querySelector('[role="progressbar"]');
  assert.equal(progress().getAttribute("aria-valuenow"), "0");
  assert.equal(progress().getAttribute("aria-valuemax"), "3");

  const next = () =>
    root.querySelector(".mwi-performance-button-primary").click();
  next();
  assert.equal(progress().getAttribute("aria-valuenow"), "1");
  assert.doesNotMatch(root.textContent, /战斗开/);
  root.querySelector('[data-value="life"]').click();
  next();
  assert.equal(progress().getAttribute("aria-valuenow"), "2");
  root.querySelector('[data-value="custom"]').click();
  assert.equal(progress().getAttribute("aria-valuemax"), "7");
  assert.equal(progress().getAttribute("aria-valuenow"), "2");
  next();
  assert.equal(progress().getAttribute("aria-valuenow"), "3");
  assert.match(
    root.querySelector(".mwi-performance-title").textContent,
    /战斗|Combat/,
  );

  const dpsToggle = root.querySelector('input[aria-label*="DPS"]');
  dpsToggle.checked = false;
  dpsToggle.dispatchEvent(new Event("change", { bubbles: true }));
  const refresh = root.querySelector("select");
  refresh.value = "2000";
  refresh.dispatchEvent(new Event("change", { bubbles: true }));

  for (let step = 0; step < 4; step += 1) next();
  assert.match(
    root.querySelector(".mwi-performance-title").textContent,
    /确认|Confirm/,
  );
  assert.equal(progress().getAttribute("aria-valuenow"), "7");
  assert.equal(progress().textContent.includes("7 / 7"), true);
  next();
  const result = await resultPromise;
  assert.equal(result.result, "applied");
  assert.equal(result.profile.tier, "custom");
  assert.equal(result.profile.usage, "life");
  assert.equal(runtime.settings.get("showDamage"), false);
  assert.equal(dpsPerformance.refreshIntervalMs, 2000);
  assert.equal(pageReloadCount, 1);
  assert.equal(document.activeElement, trigger);
});

test("Esc cancels a restarted guide without applying edits or leaking dialogs", async () => {
  const { openPerformanceOnboarding, PERFORMANCE_ONBOARDING_ID } =
    await import("../src/features/performance-onboarding.js");
  const before = localStorage.getItem(profile.PERFORMANCE_PROFILE_STORAGE_KEY);
  const reloadCountBeforeCancel = pageReloadCount;
  const resultPromise = openPerformanceOnboarding({ firstRun: false });
  document.dispatchEvent(
    new globalThis.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    }),
  );
  const result = await resultPromise;
  assert.equal(result.result, "cancelled");
  assert.equal(pageReloadCount, reloadCountBeforeCancel);
  assert.equal(
    localStorage.getItem(profile.PERFORMANCE_PROFILE_STORAGE_KEY),
    before,
  );
  await new Promise((resolve) => setTimeout(resolve, 320));
  assert.equal(
    document.querySelectorAll(`#${PERFORMANCE_ONBOARDING_ID}`).length,
    0,
  );
});
