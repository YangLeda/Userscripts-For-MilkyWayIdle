import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.window = dom.window;
globalThis.GM_getValue = (_key, fallback) => fallback;
globalThis.GM_setValue = () => {};
const SETTINGS_POPOVER_SCROLL_KEY = "MWITools_settings_popover_scroll_v1";

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
    legacyConsumableTips: { id: "showConsumTips", isTrue: true },
  }),
);

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/core/state.js");
await import("../src/core/message-state.js");
await import("../src/core/messages.js");
await import("../src/features/settings-and-notifications.js");
await import("../src/features/message-effects.js");
const { registerGameLocaleResources } =
  await import("../src/core/game-localization.js");

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
  assert.equal(runtime.settings.settingsMap.planningPage.isTrue, true);
  assert.equal(runtime.settings.catalog.planningPage.group, "production");
  assert.equal(runtime.settings.catalog.planningPage.parent, undefined);
  assert.equal(
    runtime.settings.settingsMap.includeCowbellsInAssets.isTrue,
    false,
  );
  assert.equal(
    runtime.settings.settingsMap.includeGuildDungeonTokensInAssets.isTrue,
    true,
  );
  assert.equal(
    runtime.settings.settingsMap.hideReadyProductionShortage.isTrue,
    false,
  );
  assert.equal(
    runtime.settings.getPreference("productionSummaryMode"),
    "collapsed",
  );
  assert.equal(runtime.settings.getPreference("uiFontScale"), "standard");
  assert.equal(runtime.settings.getPreference("hoverFontScale"), "standard");
  assert.equal(runtime.settings.settingsMap.lootIgnoreCowbells.isTrue, false);
  assert.equal(runtime.settings.settingsMap.leaderboardBadgeGlint.isTrue, true);
  assert.equal(
    runtime.settings.catalog.leaderboardBadgeGlint.parent,
    "leaderboardOverlay",
  );
  assert.equal(
    runtime.settings.settingsMap.valueBackEquipmentWithProtectionMirror.isTrue,
    false,
  );
  assert.equal(runtime.settings.settingsMap.networth, undefined);
  assert.equal(runtime.settings.settingsMap.networkAlert, undefined);
  assert.equal(runtime.settings.settingsMap.showConsumTips.isTrue, true);
  assert.equal(
    runtime.settings.catalog.showConsumTips.parent,
    "itemTooltip_prices",
  );
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
  assert.equal(stored.values.showConsumTips, true);
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
  await runtime.settings.setPreference("productionSummaryMode", "expanded");
  await runtime.settings.setPreference("uiFontScale", "large");
  await runtime.settings.setPreference("hoverFontScale", "largest");
  assert.equal(
    JSON.parse(localStorage.getItem("MWITools_settings_v2")).values
      .notifiEmptyAction,
    true,
  );
  const stored = JSON.parse(localStorage.getItem("MWITools_settings_v2"));
  assert.equal(stored.preferences.productionSummaryMode, "expanded");
  assert.equal(stored.preferences.uiFontScale, "large");
  assert.equal(stored.preferences.hoverFontScale, "largest");
  assert.equal(
    document.documentElement.style.getPropertyValue("--mwi-ui-font-scale"),
    "1.12",
  );
  assert.equal(
    document.documentElement.style.getPropertyValue("--mwi-hover-font-scale"),
    "1.25",
  );
  await runtime.settings.setPreference("productionSummaryMode", "collapsed");
  await runtime.settings.setPreference("uiFontScale", "standard");
  await runtime.settings.setPreference("hoverFontScale", "standard");
  assert.equal(
    JSON.parse(localStorage.getItem("script_settingsMap")).notifiEmptyAction
      .isTrue,
    true,
  );
});

test("legacy disabled production summaries migrate to off mode", () => {
  localStorage.removeItem("MWITools_settings_v2");
  localStorage.setItem(
    "script_settingsMap",
    JSON.stringify({
      productionSummary: { id: "productionSummary", isTrue: false },
    }),
  );
  runtime.api.readSettings();
  assert.equal(runtime.settings.getPreference("productionSummaryMode"), "off");
  assert.equal(runtime.settings.settingsMap.productionSummary.isTrue, false);
  runtime.settings.settingsMap.productionSummary.isTrue = true;
  void runtime.settings.setPreference("productionSummaryMode", "collapsed", {
    persist: false,
  });
  runtime.api.persistSettings();
});

test("iron-cow adaptation recognizes both game modes and stays scoped to iron-cow characters", async () => {
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

test("iron-cow detection automatically enables and persists market adaptation", async () => {
  runtime.api.scheduleNetworthRefresh = () => {};
  runtime.api.assetHistory = { scheduleRefresh() {} };
  runtime.api.checkEquipment = () => {};
  runtime.state.currentCharacterGameMode = "standard";
  await runtime.settings.set("adaptIronCowMarketFeatures", false);
  runtime.api.handleMessage(
    JSON.stringify({
      type: "init_character_data",
      character: { id: "standard-1", gameMode: "standard" },
      characterSkills: [],
      characterItems: [],
      characterActions: [],
    }),
  );
  assert.equal(
    runtime.settings.settingsMap.adaptIronCowMarketFeatures.isTrue,
    false,
  );

  runtime.api.handleMessage(
    JSON.stringify({
      type: "init_character_data",
      character: { id: "iron-1", gameMode: "ironcow" },
      characterSkills: [],
      characterItems: [],
      characterActions: [],
    }),
  );
  assert.equal(
    runtime.settings.settingsMap.adaptIronCowMarketFeatures.isTrue,
    true,
  );
  assert.equal(
    JSON.parse(localStorage.getItem("MWITools_settings_v2")).values
      .adaptIronCowMarketFeatures,
    true,
  );

  await runtime.settings.set("adaptIronCowMarketFeatures", false);
  runtime.api.handleMessage(
    JSON.stringify({
      type: "init_character_data",
      character: { id: "iron-2", gameMode: "legacy_ironcow" },
      characterSkills: [],
      characterItems: [],
      characterActions: [],
    }),
  );
  assert.equal(
    runtime.settings.settingsMap.adaptIronCowMarketFeatures.isTrue,
    true,
  );
  assert.equal(runtime.api.shouldSuppressMarketFeatures(), true);
  runtime.api.handleMessage(
    JSON.stringify({
      type: "init_character_data",
      character: { id: "standard-2", gameMode: "standard" },
      characterSkills: [],
      characterItems: [],
      characterActions: [],
    }),
  );
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

test("guild credit recommendation count defaults to three and clamps to one through eight", () => {
  localStorage.removeItem("MWITools_guild_credit_recommendation_count_v1");
  let renders = 0;
  const previousRender = runtime.api.renderGuildCreditRecommendations;
  runtime.api.renderGuildCreditRecommendations = () => {
    renders += 1;
  };
  runtime.api.setGuildCreditRecommendationCount(3);
  assert.equal(runtime.api.getGuildCreditRecommendationCount(), 3);
  assert.equal(
    localStorage.getItem("MWITools_guild_credit_recommendation_count_v1"),
    "3",
  );
  assert.equal(runtime.api.setGuildCreditRecommendationCount(0), 1);
  assert.equal(runtime.api.setGuildCreditRecommendationCount(9), 8);
  assert.equal(runtime.api.setGuildCreditRecommendationCount("invalid"), 3);
  assert.equal(renders, 4);
  if (previousRender)
    runtime.api.renderGuildCreditRecommendations = previousRender;
  else delete runtime.api.renderGuildCreditRecommendations;
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

test("the settings catalog exposes every persisted setting and enum preference", () => {
  const catalog = Object.values(runtime.settings.catalog);
  assert.deepEqual(
    catalog
      .filter((definition) => runtime.settings.settingsMap[definition.id])
      .map(({ id }) => id)
      .sort(),
    Object.keys(runtime.settings.settingsMap).sort(),
  );
  assert.deepEqual(
    catalog
      .flatMap((definition) =>
        definition.control?.preference ? [definition.control.preference] : [],
      )
      .sort(),
    Object.keys(runtime.settings.preferenceDefinitions).sort(),
  );
});

test("card settings render every visible setting with nested children and search", async (t) => {
  localStorage.removeItem(SETTINGS_POPOVER_SCROLL_KEY);
  document.body.innerHTML = `
    <header><div id="identity"><div class="Header_totalLevel__test">总等级: 2178</div></div></header>
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
  const settingsButton = document.querySelector("#mwitools-settings-button");
  const headerTools = document.querySelector("#mwitools-header-tools");
  assert.ok(settingsButton);
  assert.equal(settingsButton.parentElement, headerTools);
  assert.equal(headerTools.previousElementSibling.textContent, "总等级: 2178");
  assert.equal(settingsButton.getAttribute("aria-expanded"), "false");
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
  const performanceCard = root.querySelector(".mwi-performance-settings-card");
  assert.ok(performanceCard);
  assert.equal(
    performanceCard.parentElement.firstElementChild,
    performanceCard,
  );
  let guideOpenCount = 0;
  runtime.api.openPerformanceOnboarding = () => {
    guideOpenCount += 1;
  };
  performanceCard.querySelector(".mwi-performance-settings-open").click();
  assert.equal(guideOpenCount, 1);
  assert.equal(
    root.querySelectorAll(".mwi-setting-card").length,
    Object.values(runtime.settings.catalog).filter(
      (definition) =>
        !definition.hidden &&
        (runtime.settings.settingsMap[definition.id] || definition.control),
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
      card.querySelector(":scope > .mwi-setting-row > .mwi-setting-toggle") ||
        card.querySelector(
          ":scope > .mwi-setting-row > .mwi-setting-primary-select",
        ),
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
  const summaryMode = root.querySelector('select[aria-label="本次生产摘要"]');
  assert.ok(summaryMode);
  assert.equal(summaryMode.value, "collapsed");
  assert.deepEqual(
    [...summaryMode.options].map((option) => option.value),
    ["collapsed", "expanded", "off"],
  );
  const quickHours = root.querySelector('input[aria-label="快捷小时"]');
  const quickCounts = root.querySelector('input[aria-label="快捷次数"]');
  assert.equal(quickHours.value, "0.5,1,2,3,4,5,6,10,12,24");
  assert.equal(quickCounts.value, "10,100,300,500,1000,2000");
  quickHours.value = "0.25, 2, 8";
  quickHours.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve));
  assert.equal(
    runtime.settings.getPreference("productionQuickHours"),
    "0.25, 2, 8",
  );
  const fontScale = root.querySelector('select[aria-label="插件字号"]');
  assert.ok(fontScale);
  assert.deepEqual(
    [...fontScale.options].map((option) => option.value),
    ["standard", "large", "largest"],
  );
  const guildCreditCount = root.querySelector(
    'select[aria-label="公会信用推荐数量"]',
  );
  assert.ok(guildCreditCount);
  assert.equal(guildCreditCount.value, "3");
  assert.deepEqual(
    [...guildCreditCount.options].map((option) => option.value),
    ["1", "2", "3", "4", "5", "6", "7", "8"],
  );
  guildCreditCount.value = "7";
  guildCreditCount.dispatchEvent(
    new dom.window.Event("change", { bubbles: true }),
  );
  assert.equal(runtime.api.getGuildCreditRecommendationCount(), 7);
  const guildCreditToggle = root.querySelector(
    'input[data-setting-id="guildCreditConversionsSort"]',
  );
  await runtime.settings.set("guildCreditConversionsSort", false);
  assert.equal(guildCreditCount.disabled, true);
  await runtime.settings.set("guildCreditConversionsSort", true);
  assert.equal(guildCreditToggle.checked, true);
  assert.equal(guildCreditCount.disabled, false);
  runtime.api.setGuildCreditRecommendationCount(3);
  const lootSellToggle = root.querySelector(
    'input[data-setting-id="lootSellAtAsk"]',
  );
  assert.ok(lootSellToggle);
  await runtime.settings.set("lootSellAtAsk", true);
  assert.equal(lootSellToggle.checked, true);

  settingsButton.click();
  const popover = document.querySelector("#mwitools-settings-popover");
  const popoverRoot = popover.querySelector("[data-mwitools-settings-root]");
  assert.equal(popover.hidden, false);
  assert.equal(settingsButton.getAttribute("aria-expanded"), "true");
  assert.equal(
    popoverRoot.querySelectorAll(".mwi-settings-group").length,
    root.querySelectorAll(".mwi-settings-group").length,
  );
  const popupLootSellToggle = popoverRoot.querySelector(
    'input[data-setting-id="lootSellAtAsk"]',
  );
  assert.equal(popupLootSellToggle.checked, true);
  popupLootSellToggle.checked = false;
  popupLootSellToggle.dispatchEvent(
    new dom.window.Event("change", { bubbles: true }),
  );
  await new Promise((resolve) => setTimeout(resolve));
  assert.equal(runtime.settings.get("lootSellAtAsk"), false);
  assert.equal(lootSellToggle.checked, false);
  popover.scrollTop = 640;
  popover.dispatchEvent(new dom.window.Event("scroll"));
  assert.equal(localStorage.getItem(SETTINGS_POPOVER_SCROLL_KEY), "640");
  document.body.dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true }),
  );
  assert.equal(popover.hidden, true);
  assert.equal(settingsButton.getAttribute("aria-expanded"), "false");
  popover.scrollTop = 0;
  settingsButton.click();
  assert.equal(popover.scrollTop, 640);
  settingsButton.click();
  assert.equal(popover.hidden, true);
  settingsButton.click();
  popover.querySelector("[data-mwitools-settings-close]").click();
  assert.equal(popover.hidden, true);
  settingsButton.click();
  document.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(popover.hidden, true);
  assert.equal(document.activeElement, settingsButton);

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
  assert.equal(document.querySelector("#mwitools-settings-button"), null);
  assert.equal(document.querySelector("#mwitools-settings-popover"), null);
  assert.equal(document.querySelector("#mwitools-header-tools"), null);

  await runtime.features.enable("settingsUi");
  document.querySelector("#mwitools-settings-button").click();
  assert.equal(
    document.querySelector("#mwitools-settings-popover").scrollTop,
    640,
  );
  await runtime.features.disable("settingsUi");
  localStorage.removeItem(SETTINGS_POPOVER_SCROLL_KEY);
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

test("market autofill recognizes the current official locale template", () => {
  registerGameLocaleResources("es", {
    itemNames: { "/items/coin": "Moneda" },
    actionNames: { "/actions/milking/cow": "Vaca" },
    monsterNames: { "/monsters/rat": "Rata" },
    abilityNames: { "/abilities/strike": "Golpe" },
    marketplacePanel: {
      buy: "Comprar",
      sell: "Vender",
      priceBestBuyOffer: "Precio (mejor oferta de compra: <bestPrice />)",
    },
  });
  localStorage.setItem("i18nextLng", "es");
  document.body.innerHTML = `
    <div id="market-order-es">
      <div class="MarketplacePanel_header__yahJo">Orden limitada</div>
      <div id="best-label-es">Precio (mejor oferta de compra: <span class="MarketplacePanel_bestPrice__3bgKp">42</span>)</div>
      <div class="MarketplacePanel_inputContainer__3xmB2"><div class="MarketplacePanel_priceInputs__3iWxy"><button id="plus-es">+</button></div></div>
    </div>`;
  let clicks = 0;
  document.querySelector("#plus-es").addEventListener("click", () => clicks++);
  runtime.api.handleMarketNewOrder(document.querySelector("#market-order-es"));
  assert.equal(clicks, 1);
  localStorage.setItem("i18nextLng", "en");
});
