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
const { registerGameLocaleResources } =
  await import("../src/core/game-localization.js");
const { getTooltipEnhancementPlanOptions, readEnhancedTooltipItem } =
  await import("../src/features/enhancement-tooltip.js");

test("refined tooltip identity comes from its sprite and level marker", () => {
  runtime.state.initData_itemDetailMap = {
    "/items/rippling_trident": { name: "Rippling Trident" },
    "/items/rippling_trident_refined": { name: "Rippling Trident ★" },
  };
  const tooltip = document.createElement("div");
  tooltip.innerHTML = `
    <svg aria-label="涟漪三叉戟 ★"><use href="/items_sprite.svg#rippling_trident_refined"></use></svg>
    <div class="ItemTooltipText_name__2JAHA">
      <span>涟漪三叉戟</span><span>★</span><span>+14</span>
    </div>`;

  assert.deepEqual(readEnhancedTooltipItem(tooltip), {
    itemHrid: "/items/rippling_trident_refined",
    enhancementLevel: 14,
  });
});

test("tooltip identity falls back to the current official locale dictionary", () => {
  runtime.state.initData_itemDetailMap = {
    "/items/rippling_trident": { name: "Rippling Trident" },
  };
  runtime.api.getOriTextFromElement = (element) => element?.textContent ?? "";
  registerGameLocaleResources("es", {
    itemNames: { "/items/rippling_trident": "Tridente Ondulante" },
    actionNames: { "/actions/milking/cow": "Vaca" },
    monsterNames: { "/monsters/rat": "Rata" },
    abilityNames: { "/abilities/strike": "Golpe" },
  });
  localStorage.setItem("i18nextLng", "es");
  const tooltip = document.createElement("div");
  tooltip.innerHTML = `<div class="ItemTooltipText_name__2JAHA"><span>Tridente Ondulante</span><span>+7</span></div>`;
  assert.deepEqual(readEnhancedTooltipItem(tooltip), {
    itemHrid: "/items/rippling_trident",
    enhancementLevel: 7,
  });
  localStorage.setItem("i18nextLng", "en");
});

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
  assert.equal(options.getMarketValue("/items/chance_cape", 0), 0);
  assert.equal(options.forcedProtectionItemHrid, "/items/mirror_of_protection");
  assert.equal(options.allowPhilosopherMirror, true);

  options = getTooltipEnhancementPlanOptions("/items/enchanted_quiver");
  assert.equal(options.forcedProtectionItemHrid, "/items/mirror_of_protection");
  assert.equal(options.allowPhilosopherMirror, true);

  runtime.api.getFairValue = () => 999_999;
  runtime.api.getAssetValue = () => 123_456;
  options = getTooltipEnhancementPlanOptions("/items/advanced_attack_charm");
  assert.equal(
    options.getFairValue("/items/advanced_attack_charm", 0),
    123_456,
  );
  assert.equal(
    options.getMarketValue("/items/advanced_attack_charm", 0),
    999_999,
  );
  assert.equal(options.forcedProtectionItemHrid, null);
  assert.equal(options.allowPhilosopherMirror, true);

  runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue = true;
  options = getTooltipEnhancementPlanOptions("/items/chance_cape_refined");
  assert.equal(options.forcedProtectionItemHrid, "/items/mirror_of_protection");
  assert.equal(options.allowPhilosopherMirror, true);

  runtime.api.getFairValue = originals.getFairValue;
  runtime.api.getAssetValue = originals.getAssetValue;
  runtime.api.isBackEquipment = originals.isBackEquipment;
  runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue = false;
});
