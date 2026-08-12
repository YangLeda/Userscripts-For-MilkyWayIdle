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
  assert.equal(runtime.settings.settingsMap.lootIgnoreCowbells.isTrue, false);
  assert.equal(
    runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue,
    false,
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
  assert.equal(stored.values.profitValuationMode, undefined);
  assert.equal(runtime.settings.settingsMap.profitValuationMode, undefined);
  assert.equal(runtime.settings.catalog.displayCapMM.hidden, undefined);
  assert.equal(runtime.settings.catalog.displayCapMM.group, "general");
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
  assert.equal(
    JSON.parse(localStorage.getItem("script_settingsMap")).notifiEmptyAction
      .isTrue,
    true,
  );
});

test("iron-cow adaptation recognizes both game modes and remains opt-in", async () => {
  runtime.state.currentCharacterGameMode = "ironcow";
  assert.equal(runtime.api.isIronCowCharacter(), true);
  assert.equal(runtime.api.shouldSuppressMarketFeatures(), false);

  await runtime.settings.set("adaptIronCowMarketFeatures", true);
  assert.equal(runtime.api.shouldSuppressMarketFeatures(), true);
  runtime.state.currentCharacterGameMode = "legacy_ironcow";
  assert.equal(runtime.api.isIronCowCharacter(), true);
  assert.equal(runtime.api.shouldSuppressMarketFeatures(), true);
  runtime.state.currentCharacterGameMode = "standard";
  assert.equal(runtime.api.isIronCowCharacter(), false);
  assert.equal(runtime.api.shouldSuppressMarketFeatures(), false);
  await runtime.settings.set("adaptIronCowMarketFeatures", false);
});

test("profit tooltip shortcut uses separate single-key persistence", () => {
  localStorage.removeItem("MWITools_tooltip_profit_key_v1");
  runtime.api.setTooltipProfitShortcut({ code: "Control", display: "Ctrl" });
  assert.deepEqual(runtime.api.getTooltipProfitShortcut(), {
    code: "Control",
    display: "Ctrl",
  });
  runtime.api.setTooltipProfitShortcut({ code: "KeyK", display: "K" });
  assert.equal(
    JSON.parse(localStorage.getItem("MWITools_tooltip_profit_key_v1")).code,
    "KeyK",
  );
  assert.equal(
    runtime.api.matchesTooltipProfitShortcut({ code: "KeyK" }),
    true,
  );
  assert.equal(
    runtime.api.matchesTooltipProfitShortcut({ key: "Control" }),
    false,
  );
  runtime.api.setTooltipProfitShortcut({ code: "Control", display: "Ctrl" });
});

test("back mirror valuation resets to disabled once and then preserves user choice", () => {
  const correctionKey = "MWITools_back_mirror_default_disabled_v2";
  localStorage.removeItem(correctionKey);
  runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue = true;
  runtime.api.persistSettings();
  runtime.api.readSettings();
  assert.equal(
    runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue,
    false,
  );

  runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue = true;
  runtime.api.persistSettings();
  runtime.api.readSettings();
  assert.equal(
    runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue,
    true,
  );
});

test("the settings catalog exposes every persisted feature switch", () => {
  assert.deepEqual(
    Object.values(runtime.settings.catalog)
      .map(({ id }) => id)
      .sort(),
    Object.keys(runtime.settings.settingsMap).sort(),
  );
});

test("card settings render every visible setting with nested children and search", async (t) => {
  document.body.innerHTML = `
    <div class="SettingsPanel_settingsPanel__test">
      <div role="tablist">
        <button class="MuiTab-root Mui-selected" role="tab" aria-selected="true">Profile</button>
        <button class="MuiTab-root" role="tab" aria-selected="false">Account</button>
        <span class="MuiTabs-indicator" style="left: 0px; width: 80px"></span>
      </div>
      <div class="TabsComponent_tabPanelsContainer__test">
        <div class="TabPanel_tabPanel__test SettingsPanel_profileTab__test"></div>
        <div class="TabPanel_tabPanel__test TabPanel_hidden__test"></div>
      </div>
    </div>`;
  await runtime.features.enable("settingsUi");
  t.after(() => runtime.features.disable("settingsUi"));
  const root = document.querySelector("#script_settings");
  const customTab = document.querySelector("[data-mwitools-settings-tab]");
  const customPanel = document.querySelector("[data-mwitools-settings-panel]");
  assert.equal(root.dataset.mwitoolsVersion, "3");
  assert.equal(customTab.textContent, "MWITools");
  assert.equal(customPanel.contains(root), true);
  assert.equal(
    document.querySelector(".SettingsPanel_profileTab__test").contains(root),
    false,
  );
  assert.equal(customPanel.hidden, true);
  customTab.click();
  assert.equal(customTab.getAttribute("aria-selected"), "true");
  assert.equal(customPanel.hidden, false);
  assert.equal(
    document.querySelector(".SettingsPanel_profileTab__test").hidden,
    true,
  );
  assert.equal(root.querySelectorAll(".mwi-settings-group").length, 10);
  assert.equal(
    root.querySelectorAll(".mwi-setting-card").length,
    Object.values(runtime.settings.catalog).filter(
      (definition) =>
        !definition.hidden && runtime.settings.settingsMap[definition.id],
    ).length,
  );
  assert.ok(root.querySelectorAll(".mwi-setting-child").length >= 14);
  assert.equal(
    root.querySelectorAll(".mwi-setting-more .mwi-setting-child").length,
    0,
  );
  assert.ok(
    [...root.querySelectorAll(".mwi-setting-child")].every(
      (card) => card.closest("details") === null,
    ),
  );
  assert.doesNotMatch(root.textContent, /更多设置/);
  assert.doesNotMatch(root.textContent, /利润估值口径/);
  assert.equal(root.querySelector('[role="radiogroup"]'), null);
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
  assert.match(root.textContent, /宝箱估值忽略牛铃/);
  assert.match(root.textContent, /普通背部装备按保护之镜估值/);
  assert.match(root.textContent, /购物车与采购/);
  const lootSellToggle = root.querySelector(
    'input[data-setting-id="lootSellAtAsk"]',
  );
  assert.ok(lootSellToggle);
  await runtime.settings.set("lootSellAtAsk", true);
  assert.equal(lootSellToggle.checked, true);

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
  const profileTab = document.querySelector(
    'button[role="tab"]:not([data-mwitools-settings-tab])',
  );
  profileTab.click();
  await new Promise((resolve) => setTimeout(resolve));
  assert.equal(customPanel.hidden, true);
  assert.equal(profileTab.getAttribute("aria-selected"), "true");
  assert.equal(
    document.querySelectorAll("[data-mwitools-settings-tab]").length,
    1,
  );
  await runtime.features.disable("settingsUi");
  assert.equal(document.querySelector("[data-mwitools-settings-tab]"), null);
  assert.equal(document.querySelector("[data-mwitools-settings-panel]"), null);
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
