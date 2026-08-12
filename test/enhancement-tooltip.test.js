import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.window = dom.window;

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
const { getTooltipEnhancementPlanOptions } =
  await import("../src/features/enhancement-tooltip.js");

test("enhancement tooltip values every back type with protection mirrors", () => {
  const originals = {
    getFairValue: runtime.api.getFairValue,
    getAssetValue: runtime.api.getAssetValue,
    isBackEquipment: runtime.api.isBackEquipment,
  };
  runtime.api.getFairValue = () => 0;
  runtime.api.getAssetValue = (hrid) =>
    ({
      "/items/chance_cape": 100_000,
      "/items/labyrinth_refinement_shard": 25_000,
    })[hrid] ?? 0;
  runtime.api.isBackEquipment = (hrid) =>
    hrid.includes("cape") || hrid.includes("quiver");

  runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue = false;
  let options = getTooltipEnhancementPlanOptions("/items/chance_cape_refined");
  assert.equal(options.getFairValue("/items/chance_cape", 0), 100_000);
  assert.equal(
    options.getFairValue("/items/labyrinth_refinement_shard", 0),
    25_000,
  );
  assert.equal(options.forcedProtectionItemHrid, "/items/mirror_of_protection");
  assert.equal(options.allowPhilosopherMirror, false);

  options = getTooltipEnhancementPlanOptions("/items/enchanted_quiver");
  assert.equal(options.forcedProtectionItemHrid, "/items/mirror_of_protection");
  assert.equal(options.allowPhilosopherMirror, false);

  runtime.api.getFairValue = () => 999_999;
  runtime.api.getAssetValue = () => 123_456;
  options = getTooltipEnhancementPlanOptions("/items/advanced_attack_charm");
  assert.equal(
    options.getFairValue("/items/advanced_attack_charm", 0),
    123_456,
  );
  assert.equal(options.forcedProtectionItemHrid, null);
  assert.equal(options.allowPhilosopherMirror, true);

  runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue = true;
  options = getTooltipEnhancementPlanOptions("/items/chance_cape_refined");
  assert.equal(options.forcedProtectionItemHrid, "/items/mirror_of_protection");
  assert.equal(options.allowPhilosopherMirror, false);

  runtime.api.getFairValue = originals.getFairValue;
  runtime.api.getAssetValue = originals.getAssetValue;
  runtime.api.isBackEquipment = originals.isBackEquipment;
  runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue = false;
});
