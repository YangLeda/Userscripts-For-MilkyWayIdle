import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.window = dom.window;

localStorage.setItem(
  "script_settingsMap",
  JSON.stringify({
    legacyOrange: { id: "useOrangeAsMainColor", isTrue: true },
    legacyChinese: { id: "forceMWIToolsDisplayZH", isTrue: true },
    legacyDps: { id: "showDamage", isTrue: false },
    legacyDpsGraph: { id: "showDamageGraph", isTrue: true },
    legacyDpsTransparency: {
      id: "damageGraphTransparentBackground",
      isTrue: true,
    },
    removedOption: { id: "removed_option", isTrue: true },
  }),
);

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/features/settings-and-notifications.js");

test("legacy settings merge into current defaults", () => {
  assert.doesNotThrow(() => runtime.api.readSettings());
  assert.equal(runtime.settings.settingsMap.useOrangeAsMainColor.isTrue, true);
  assert.equal(
    runtime.settings.settingsMap.forceMWIToolsDisplayZH.isTrue,
    true,
  );
  assert.equal(runtime.config.isZH, true);
  assert.equal(runtime.config.SCRIPT_COLOR_MAIN, "orange");
  assert.equal(runtime.config.SCRIPT_COLOR_TOOLTIP, "#804600");
  assert.equal(runtime.settings.settingsMap.totalActionTime.isTrue, true);
  assert.equal(runtime.settings.settingsMap.assetHistory.isTrue, true);
  assert.equal(
    runtime.settings.settingsMap.includeCowbellsInAssets.isTrue,
    false,
  );
  assert.equal(
    runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue,
    true,
  );
  assert.equal(runtime.settings.settingsMap.networth, undefined);
  assert.equal(runtime.settings.settingsMap.networkAlert, undefined);
  assert.equal(runtime.settings.settingsMap.showDamage.isTrue, false);
  assert.equal(runtime.settings.settingsMap.showDamageGraph, undefined);
  assert.equal(
    runtime.settings.settingsMap.damageGraphTransparentBackground,
    undefined,
  );
  const stored = JSON.parse(localStorage.getItem("MWITools_settings_v2"));
  assert.equal(stored.version, 2);
  assert.equal(stored.values.displayCapMM, false);
  assert.equal(stored.values.showDamage, false);
  assert.equal(stored.values.showDamageGraph, undefined);
  assert.equal(stored.values.damageGraphTransparentBackground, undefined);
  assert.equal(stored.values.profitValuationMode, "fair");
  assert.equal(
    Object.keys(stored.values).length,
    Object.keys(runtime.settings.settingsMap).length,
  );
});

test("setting changes persist the versioned and rollback-compatible shapes", async () => {
  await runtime.settings.set("notifiEmptyAction", true);
  assert.equal(
    JSON.parse(localStorage.getItem("MWITools_settings_v2")).values
      .notifiEmptyAction,
    true,
  );
  await runtime.settings.set("profitValuationMode", "aggressive");
  assert.equal(runtime.settings.get("profitValuationMode"), "aggressive");
  assert.equal(
    JSON.parse(localStorage.getItem("MWITools_settings_v2")).values
      .profitValuationMode,
    "aggressive",
  );
  assert.equal(
    JSON.parse(localStorage.getItem("script_settingsMap")).profitValuationMode
      .value,
    "aggressive",
  );
  await runtime.settings.set("profitValuationMode", "fair");
  assert.equal(
    JSON.parse(localStorage.getItem("script_settingsMap")).notifiEmptyAction
      .isTrue,
    true,
  );
});

test("back mirror valuation migrates to enabled once and then preserves user choice", () => {
  const migrationKey = "MWITools_back_mirror_default_enabled_v1";
  localStorage.removeItem(migrationKey);
  runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue = false;
  runtime.api.readSettings();
  assert.equal(
    runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue,
    true,
  );

  runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue = false;
  runtime.api.persistSettings();
  runtime.api.readSettings();
  assert.equal(
    runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue,
    false,
  );
});

test("card settings render every visible setting with nested children and search", async (t) => {
  document.body.innerHTML =
    '<div class="SettingsPanel_profileTab__test"></div>';
  await runtime.features.enable("settingsUi");
  t.after(() => runtime.features.disable("settingsUi"));
  const root = document.querySelector("#script_settings");
  assert.equal(root.dataset.mwitoolsVersion, "2");
  assert.equal(root.querySelectorAll(".mwi-settings-group").length, 10);
  assert.equal(root.querySelectorAll(".mwi-setting-card").length, 47);
  assert.ok(root.querySelectorAll(".mwi-setting-child").length >= 14);
  const valuationChoices = root.querySelector(
    '[role="radiogroup"][aria-label="利润估值口径"]',
  );
  assert.ok(valuationChoices);
  assert.equal(root.querySelector('select[aria-label="利润估值口径"]'), null);
  const valuationInputs = [
    ...valuationChoices.querySelectorAll('input[type="radio"]'),
  ];
  assert.deepEqual(
    valuationInputs.map((input) => input.value),
    ["conservative", "fair", "aggressive"],
  );
  assert.equal(
    valuationChoices.querySelector('input[value="fair"]').checked,
    true,
  );
  assert.match(valuationChoices.textContent, /最低卖单价买入/);
  assert.match(valuationChoices.textContent, /服务器市场价值/);
  assert.match(valuationChoices.textContent, /最高买单价挂单买入/);
  const aggressiveChoice = valuationChoices.querySelector(
    'input[value="aggressive"]',
  );
  aggressiveChoice.checked = true;
  aggressiveChoice.dispatchEvent(
    new dom.window.Event("change", { bubbles: true }),
  );
  assert.equal(runtime.settings.get("profitValuationMode"), "aggressive");
  await runtime.settings.set("profitValuationMode", "fair");
  const topLevelCards = root.querySelectorAll(
    ".mwi-settings-grid > .mwi-setting-card",
  );
  assert.ok(topLevelCards.length > 20);
  for (const card of topLevelCards) {
    assert.equal(card.querySelectorAll(":scope > .mwi-setting-row").length, 1);
    assert.ok(
      card.querySelector(":scope > .mwi-setting-row > .mwi-setting-copy"),
    );
    assert.ok(
      card.querySelector(":scope > .mwi-setting-row > .mwi-setting-toggle"),
    );
    assert.ok(card.querySelector(".mwi-setting-more"));
  }
  assert.match(
    document.querySelector("#mwitools-settings-style").textContent,
    /\.mwi-settings-grid \{ display:flex; flex-direction:column;/,
  );
  assert.match(root.textContent, /牛铃计入总资产/);
  assert.match(root.textContent, /背部装备按保护之镜估值/);

  const search = root.querySelector(".mwi-settings-search");
  search.value = "Idle members";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  assert.deepEqual(
    [...root.querySelectorAll(".mwi-settings-group")]
      .filter((group) => !group.hidden)
      .map(
        (group) => group.querySelector(".mwi-settings-group-title").textContent,
      ),
    ["公会"],
  );
  assert.match(root.textContent, /排行榜与排名/);
  await runtime.features.disable("settingsUi");
});

test("market autofill selects semantic plus and minus buttons", () => {
  runtime.api.getOriTextFromElement = (element) => element?.textContent ?? "";
  document.body.innerHTML = `
    <div id="market-order">
      <div class="MarketplacePanel_header__yahJo">Limit Order</div>
      <div id="best-label">Best Buy <span class="MarketplacePanel_bestPrice__3bgKp">Best</span></div>
      <div class="MarketplacePanel_inputContainer__3xmB2">
        <div class="MarketplacePanel_priceInputs__3iWxy">
          <div class="MarketplacePanel_buttonContainer__vJQud"><button>Min</button></div>
          <div class="MarketplacePanel_buttonContainer__vJQud"><button id="minus">−</button></div>
          <div class="MarketplacePanel_buttonContainer__vJQud"><button id="plus">+</button></div>
          <div class="MarketplacePanel_buttonContainer__vJQud"><button>Max</button></div>
        </div>
      </div>
    </div>`;
  const order = document.querySelector("#market-order");
  let plusClicks = 0;
  let minusClicks = 0;
  document.querySelector("#plus").addEventListener("click", () => plusClicks++);
  document
    .querySelector("#minus")
    .addEventListener("click", () => minusClicks++);

  runtime.api.handleMarketNewOrder(order);
  document.querySelector("#best-label").firstChild.textContent = "Best Sell ";
  runtime.api.handleMarketNewOrder(order);

  assert.equal(plusClicks, 1);
  assert.equal(minusClicks, 1);
});
