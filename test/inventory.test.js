import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<!doctype html><body>
    <div class="Header_totalLevel__8LY3Q"></div>
    <section id="inventory-parent"><div class="Inventory_items__6SXv0">
      <div><div class="Inventory_itemGrid__test">
        <div class="Inventory_label__test"><span class="Inventory_categoryButton__test" style="font-size:14px;line-height:20px">食物</span></div>
        <div class="Item_itemContainer__test"><svg aria-label="Milk"></svg></div>
      </div></div>
      <div><div class="Inventory_itemGrid__test">
        <div class="Inventory_label__test"><span class="Inventory_categoryButton__test">+ 地下城钥匙 (1)</span></div>
      </div>
    </div></section>
  </body>`,
  { url: "https://test.milkywayidle.com/" },
);
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.window = dom.window;
globalThis.setTimeout = () => 0;
globalThis.clearTimeout = () => {};
localStorage.setItem("i18nextLng", "zh-CN");

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
await import("../src/core/asset-values.js");
await import("../src/features/asset-history/00-snapshot.js");
await import("../src/features/inventory.js");

runtime.state.initData_characterItems = [
  {
    id: 1,
    itemHrid: "/items/milk",
    itemLocationHrid: "/item_locations/inventory",
    enhancementLevel: 0,
    count: 10,
  },
  {
    id: 2,
    itemHrid: "/items/test_dungeon_key",
    itemLocationHrid: "/item_locations/inventory",
    enhancementLevel: 0,
    count: 2,
  },
];
runtime.state.currentCharacterId = "inventory-test";
runtime.state.initData_myMarketListings = [];
runtime.state.marketItemValues = {
  "/items/milk": { 0: 1000 },
  "/items/test_dungeon_key": { 0: 2500 },
};
runtime.state.marketApiJson = {
  timestamp: 1,
  marketData: {
    "/items/milk": { 0: { a: 1100, b: 900 } },
    "/items/test_dungeon_key": { 0: { a: 2600, b: 2400 } },
  },
};
runtime.state.initData_itemDetailMap = {
  "/items/milk": { categoryHrid: "/item_categories/food" },
  "/items/test_dungeon_key": {
    categoryHrid: "/item_categories/dungeon_key",
  },
};
runtime.state.itemEnNameToHridMap = { Milk: "/items/milk" };
runtime.api.fetchMarketJSON = async () => runtime.state.marketApiJson;
runtime.api.getSelfBuildScores = async () => ({
  battle: { house: 1, abilities: 2, equipment: 3, total: 6 },
  skilling: { house: 1, tools: 4, equipment: 5, total: 10, available: true },
  assets: { allHouses: 10, allAbilities: 20 },
  equipmentHidden: false,
});

test("inventory sorting uses derived values when an item has no order-book price", () => {
  const originalGetAssetValue = runtime.api.getAssetValue;
  const originalGetFairValue = runtime.api.getFairValue;
  const originalGetAskPrice = runtime.api.getAskPrice;
  const originalGetBidPrice = runtime.api.getBidPrice;
  runtime.api.getAssetValue = () => 7_500;
  runtime.api.getFairValue = () => 0;
  runtime.api.getAskPrice = () => 0;
  runtime.api.getBidPrice = () => 0;

  assert.equal(
    runtime.api.getInventorySortUnitValue("/items/derived", 0, "fair"),
    7_500,
  );
  assert.equal(
    runtime.api.getInventorySortUnitValue("/items/derived", 0, "ask"),
    7_500,
  );
  assert.equal(
    runtime.api.getInventorySortUnitValue("/items/derived", 0, "bid"),
    7_500,
  );

  runtime.api.getAskPrice = () => 8_000;
  runtime.api.getBidPrice = () => 7_000;
  assert.equal(
    runtime.api.getInventorySortUnitValue("/items/listed", 0, "ask"),
    8_000,
  );
  assert.equal(
    runtime.api.getInventorySortUnitValue("/items/listed", 0, "bid"),
    7_000,
  );

  runtime.api.getAssetValue = originalGetAssetValue;
  runtime.api.getFairValue = originalGetFairValue;
  runtime.api.getAskPrice = originalGetAskPrice;
  runtime.api.getBidPrice = originalGetBidPrice;
});

test("inventory sorting reads the enhancement level displayed on the item", () => {
  const enhanced = document.createElement("div");
  enhanced.innerHTML = '<span class="Item_enhancementLevel__test">+11</span>';
  assert.equal(runtime.api.getInventoryItemEnhancementLevel(enhanced), 11);

  const plain = document.createElement("div");
  assert.equal(runtime.api.getInventoryItemEnhancementLevel(plain), 0);
});

test("derived currency, loot, and equipment categories participate in inventory sorting", () => {
  assert.equal(runtime.api.isSortableInventoryCategory("Currencies"), true);
  assert.equal(runtime.api.isSortableInventoryCategory("Loots"), true);
  assert.equal(runtime.api.isSortableInventoryCategory("Food"), true);
  assert.equal(runtime.api.isSortableInventoryCategory("Equipment"), true);
  assert.equal(runtime.api.isSortableInventoryCategory("装备"), true);
  assert.equal(runtime.api.isSortableInventoryCategory("裝備"), true);
  assert.equal(
    runtime.api.isSortableInventoryCategory(
      "Équipement",
      "/item_categories/equipment",
    ),
    true,
  );
});

test("inventory asset summaries rerender without restoring the removed header UI", async () => {
  await runtime.api.calculateNetworth();
  await Promise.resolve();
  await runtime.api.calculateNetworth();
  await Promise.resolve();

  assert.equal(document.querySelectorAll("#script_current_assets").length, 0);
  assert.equal(
    document.querySelectorAll("#script_inventory_summary").length,
    1,
  );
  assert.equal(document.querySelectorAll("#script_api_fail_popout").length, 0);
  assert.equal(
    document.querySelectorAll(".mwi-inventory-category-value").length,
    2,
  );
  assert.equal(
    document.querySelector(".mwi-inventory-category-value").textContent,
    "价值 10K",
  );
  assert.match(
    document.querySelector(".mwi-inventory-category-value").title,
    /分类价值: 10,000/,
  );
  assert.match(
    [...document.querySelectorAll('[class*="Inventory_label"]')][1].textContent,
    /地下城钥匙 \(1\).*价值 5K/,
  );
  assert.equal(
    document.querySelectorAll(".mwi-inventory-summary-grid .mwi-summary-card")
      .length,
    3,
  );
  assert.equal(document.querySelectorAll(".mwi-summary-icon").length, 0);
  assert.equal(
    document.querySelectorAll("#script_refresh_inventory_btn").length,
    0,
  );
  const summaryStyles = document.querySelector(
    "#mwitools-inventory-summary-style",
  ).textContent;
  assert.match(
    summaryStyles,
    /\[class\*="Item_enhancementLevel"\] ~ #script_stack_price \{\s*margin-top: 15px;/,
  );
  assert.doesNotMatch(summaryStyles, /#script_stack_price[^}]*text-shadow/);
  assert.doesNotMatch(summaryStyles, /width:\s*calc\(100% \+ \.5rem\)/);
  assert.doesNotMatch(summaryStyles, /margin-inline:\s*-\.25rem/);
  assert.match(
    summaryStyles,
    /\.mwi-inventory-summary-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s,
  );
  assert.match(
    summaryStyles,
    /\.mwi-inventory-summary-grid\s*\{[^}]*gap:\s*\.0625rem/s,
  );
  assert.match(
    summaryStyles,
    /\.mwi-summary-card\s*\{[^}]*border:\s*0[^}]*border-left:\s*2px solid rgba\(var\(--mwi-summary-accent\), \.75\)[^}]*border-radius:\s*0[^}]*background:\s*transparent/s,
  );
  assert.match(
    summaryStyles,
    /\.mwi-summary-toggle\s*\{[^}]*min-height:\s*1\.375rem[^}]*padding:\s*\.1875rem \.25rem/s,
  );
  assert.match(
    summaryStyles,
    /\.mwi-summary-label\s*\{[^}]*font-size:\s*inherit/s,
  );
  assert.match(
    summaryStyles,
    /\.mwi-summary-value\s*\{[^}]*font-size:\s*inherit/s,
  );
  assert.match(
    summaryStyles,
    /\.mwi-summary-stat\s*\{[^}]*justify-content:\s*flex-start[^}]*gap:\s*\.375rem[^}]*padding:\s*\.15rem \.25rem/s,
  );
  assert.match(
    summaryStyles,
    /\.mwi-asset-toggle\s*\{[^}]*min-height:\s*0[^}]*padding:\s*\.15rem \.25rem[^}]*font-size:\s*inherit/s,
  );
  assert.match(
    summaryStyles,
    /\.mwi-asset-row\s*\{[^}]*justify-content:\s*flex-start[^}]*gap:\s*\.375rem[^}]*padding:\s*\.15rem 0[^}]*font-size:\s*inherit/s,
  );
  assert.match(
    summaryStyles,
    /\.mwi-asset-subtotal\s*\{[^}]*margin-left:\s*6px/s,
  );
  assert.match(
    summaryStyles,
    /\.mwi-summary-stat-value\s*\{[^}]*font-weight:\s*650/s,
  );
  assert.match(
    summaryStyles,
    /\.mwi-asset-row \.mwi-number, \.mwi-asset-row > span:last-child\s*\{[^}]*font-weight:\s*600/s,
  );
  const sortControls = document.querySelector("#script_inv_sort_controls");
  const summary = document.querySelector("#script_inventory_summary");
  assert.equal(sortControls.nextElementSibling, summary);
  const noneButton = document.querySelector("#script_sortByNone_btn");
  assert.equal(noneButton.style.fontWeight, "700");
  document.querySelector("#script_sortByFair_btn").click();
  assert.equal(
    document.querySelector("#script_sortByFair_btn").style.fontWeight,
    "700",
  );
  assert.equal(noneButton.style.fontWeight, "500");

  const profitTab = document.createElement("button");
  profitTab.id = "mwitools-asset-history-tab";
  profitTab.setAttribute("aria-selected", "true");
  profitTab.dataset.active = "true";
  document.body.prepend(profitTab);
  await runtime.api.calculateNetworth();
  assert.equal(summary.style.display, "none");
  assert.equal(sortControls.style.display, "none");
  profitTab.remove();
  await runtime.api.calculateNetworth();
  assert.equal(summary.style.display, "");
  assert.equal(sortControls.style.display, "");
  assert.equal(
    document
      .querySelector("#script_inventory_summary")
      .style.getPropertyValue("--mwi-inventory-heading-font-size"),
    "14px",
  );
  assert.equal(
    document
      .querySelector("#script_inventory_summary")
      .style.getPropertyValue("--mwi-inventory-heading-line-height"),
    "20px",
  );
  assert.match(summaryStyles, /\.mwi-summary-stats::before/);
  assert.match(summaryStyles, /\.mwi-summary-stat::before/);
  assert.match(summaryStyles, /\.mwi-asset-rows::before/);
  assert.equal(
    document.querySelector("#toggleScores").getAttribute("aria-expanded"),
    "false",
  );
  assert.match(
    document.querySelector("#toggleScores").textContent,
    /战斗着装评分：\s*6\.0/,
  );
  assert.match(
    document.querySelector("#toggleSkillingScores").textContent,
    /生活着装评分：\s*10\.0/,
  );
  assert.match(
    document.querySelector("#buildScores").textContent,
    /房屋：\s*1\.0/,
  );
  assert.match(
    document.querySelector("#skillingScores").textContent,
    /房屋：\s*1\.0/,
  );
  assert.match(
    document.querySelector("#skillingScores").textContent,
    /工具：\s*4\.0/,
  );
  assert.match(
    document.querySelector("#toggleNetWorth").textContent,
    /总资产：/,
  );
  assert.match(
    document.querySelector("#toggleCurrentAssets").textContent,
    /流动资产\s*15K/,
  );
  assert.equal(
    document
      .querySelector("#toggleCurrentAssets")
      .firstElementChild.classList.contains("mwi-summary-chevron"),
    true,
  );
  assert.match(document.querySelector("#currentAssets").textContent, /装备：/);
  assert.match(document.querySelector("#currentAssets").textContent, /库存：/);
  assert.match(
    document.querySelector("#currentAssets").textContent,
    /市场订单：/,
  );
  assert.match(
    document.querySelector("#toggleNonCurrentAssets").textContent,
    /非流动资产\s*30M/,
  );
  assert.equal(
    document
      .querySelector("#toggleNonCurrentAssets")
      .firstElementChild.classList.contains("mwi-summary-chevron"),
    true,
  );
  assert.equal(document.querySelectorAll(".mwi-asset-subtotal").length, 2);
  assert.match(
    document.querySelector("#nonCurrentAssets").textContent,
    /房屋：\s*10M/,
  );
  assert.match(
    document.querySelector("#nonCurrentAssets").textContent,
    /技能：\s*20M/,
  );
  assert.match(
    document.querySelector("#nonCurrentAssets").textContent,
    /不可交易代币：\s*0/,
  );
  assert.match(
    document.querySelector("#nonCurrentAssets").textContent,
    /神龛：\s*—/,
  );
  assert.doesNotMatch(
    document.querySelector(".mwi-summary-card--assets").textContent,
    /价值/,
  );
  assert.doesNotMatch(document.body.textContent, /战力打造分/);

  document.querySelector("#toggleScores").click();
  assert.equal(document.querySelector("#buildScores").hidden, false);
  assert.equal(
    document.querySelector("#toggleScores").getAttribute("aria-expanded"),
    "true",
  );

  runtime.config.isZH = false;
  await runtime.api.calculateNetworth();
  await Promise.resolve();
  const englishAssets = document.querySelector(".mwi-summary-card--assets");
  for (const label of [
    "Total assets:",
    "Liquid assets",
    "Equipment:",
    "Inventory:",
    "Market orders:",
    "Non-current assets",
    "Houses:",
    "Abilities:",
    "Non-tradable tokens:",
    "Shrine:",
  ]) {
    assert.match(englishAssets.textContent, new RegExp(label));
  }
  assert.doesNotMatch(englishAssets.textContent, /value/i);
  runtime.config.isZH = true;
  await runtime.api.calculateNetworth();
  await Promise.resolve();

  await runtime.api.calculateNetworth();
  await Promise.resolve();
  assert.equal(document.querySelector("#buildScores").hidden, false);
  assert.equal(
    document.querySelector("#toggleScores").getAttribute("aria-expanded"),
    "true",
  );
});

test("inventory scores and total assets stay frozen for the page session", async () => {
  const originalCharacterId = runtime.state.currentCharacterId;
  const originalRefresh = runtime.api.refreshAssetSnapshot;
  let refreshCount = 0;
  runtime.state.currentCharacterId = "frozen-inventory-session";
  runtime.api.refreshAssetSnapshot = async () => {
    refreshCount += 1;
    return originalRefresh();
  };

  await runtime.api.calculateNetworth();
  const before = document.querySelector(
    "#script_inventory_summary",
  ).textContent;

  runtime.state.marketItemValues["/items/milk"][0] = 2_000;
  runtime.api.invalidateAssetValueCache();
  document.querySelector("#script_inventory_summary").remove();
  await runtime.api.calculateNetworth({ force: true });

  assert.equal(
    document.querySelector("#script_inventory_summary").textContent,
    before,
  );
  assert.equal(refreshCount, 1);
  assert.equal(
    document.querySelectorAll("#script_refresh_inventory_btn").length,
    0,
  );

  runtime.state.marketItemValues["/items/milk"][0] = 1_000;
  runtime.api.invalidateAssetValueCache();
  runtime.api.refreshAssetSnapshot = originalRefresh;
  runtime.state.currentCharacterId = originalCharacterId;
});

test("inventory summary returns when the game reuses a processed inventory node", async () => {
  await runtime.api.calculateNetworth({ force: true });
  const inventory = document.querySelector('div[class*="Inventory_items"]');
  const originalSummary = document.querySelector("#script_inventory_summary");
  assert.ok(originalSummary);
  assert.ok(inventory.classList.contains("script_buildScore_added"));
  assert.ok(inventory.dataset.mwitoolsInventoryDisplayVersion);

  originalSummary.remove();
  await runtime.api.calculateNetworth();

  const restoredSummary = document.querySelector("#script_inventory_summary");
  assert.ok(restoredSummary);
  assert.match(restoredSummary.textContent, /战斗着装评分/);
  assert.match(restoredSummary.textContent, /总资产/);
});

test("listing values use explicit balances and never infer buy reserves", () => {
  const totals = runtime.api.calculateMarketListingValues([
    {
      isSell: true,
      status: "partially_filled",
      itemHrid: "/items/milk",
      enhancementLevel: 0,
      orderQuantity: 10,
      filledQuantity: 4,
      unclaimedCoinCount: 100,
    },
    {
      isSell: false,
      status: "waiting",
      itemHrid: "/items/milk",
      enhancementLevel: 0,
      orderQuantity: 10,
      filledQuantity: 2,
      price: 9999,
      coinsAvailable: 5000,
      unclaimedItemCount: 2,
    },
    {
      isSell: true,
      status: "cancelled",
      itemHrid: "/items/milk",
      enhancementLevel: 0,
      orderQuantity: 10,
      filledQuantity: 2,
      coinsAvailable: 40,
      unclaimedCoinCount: 50,
      unclaimedItemCount: 3,
    },
  ]);

  assert.deepEqual(totals, { fair: 15_890, ask: 16_960, bid: 14_820 });
});

test("guild currencies move to fixed assets while task tokens stay inventory", async () => {
  const originalCharacterId = runtime.state.currentCharacterId;
  runtime.state.currentCharacterId = "guild-currency-display";
  runtime.state.initData_itemDetailMap = {
    "/items/credit_material": {
      guildCreditConversions: [
        {
          creditItemHrid: "/items/green_guild_credit",
          itemCount: 5,
          creditCount: 10,
        },
      ],
    },
    "/items/guild_token": {
      guildCreditConversions: [
        {
          creditItemHrid: "/items/green_guild_credit",
          guildTokenCount: 1,
          creditCount: 2,
        },
      ],
    },
  };
  runtime.state.initData_taskShopItemDetailMap = {
    reward: {
      itemHrid: "/items/task_reward",
      cost: { itemHrid: "/items/task_token", count: 10 },
    },
  };
  runtime.state.marketItemValues = {
    "/items/milk": { 0: 1000 },
    "/items/bag_of_10_cowbells": { 0: 1000 },
    "/items/credit_material": { 0: 100 },
    "/items/task_reward": { 0: 1000 },
  };
  runtime.state.initData_characterItems = [
    {
      itemHrid: "/items/milk",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 10,
    },
    {
      itemHrid: "/items/cowbell",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 2,
    },
    {
      itemHrid: "/items/green_guild_credit",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 3,
    },
    {
      itemHrid: "/items/guild_token",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 1,
    },
    {
      itemHrid: "/items/task_token",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 4,
    },
  ];
  runtime.state.initData_guildBuffDetailMap = {
    "/guild_buffs/test": {
      levelCosts: [
        null,
        {
          guildTokenCost: 1,
          creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 1 }],
        },
      ],
    },
  };
  runtime.state.guildBuffLevels = { "/guild_buffs/test": 1 };
  runtime.state.guildDataLoaded = true;
  runtime.api.invalidateAssetValueCache();

  await runtime.api.calculateNetworth({ force: true });
  await Promise.resolve();

  assert.match(
    document.querySelector("#currentAssets").textContent,
    /库存：10\.4K/,
  );
  assert.match(
    document.querySelector("#nonCurrentAssets").textContent,
    /不可交易代币：250/,
  );
  assert.match(
    document.querySelector("#nonCurrentAssets").textContent,
    /神龛：150/,
  );

  await runtime.settings.set("includeCowbellsInAssets", true);
  runtime.api.invalidateAssetValueCache();
  await runtime.api.calculateNetworth();
  assert.match(document.querySelector("#nonCurrentAssets").textContent, /250/);

  const freshSnapshot = await runtime.api.getAssetSnapshot();
  assert.equal(freshSnapshot.values.nonTradableTokens, 450);

  await runtime.settings.set("includeCowbellsInAssets", false);
  runtime.state.currentCharacterId = originalCharacterId;
});

test("optional token setting excludes the same stacks from inventory category values", async () => {
  const optionalTokens = [
    "/items/guild_token",
    "/items/chimerical_token",
    "/items/sinister_token",
    "/items/enchanted_token",
    "/items/pirate_token",
  ];
  const previousItems = runtime.state.initData_characterItems;
  const previousDetails = runtime.state.initData_itemDetailMap;
  const previousAsset = runtime.api.getAssetValue;
  runtime.state.initData_characterItems = [
    ...optionalTokens.map((itemHrid) => ({
      itemHrid,
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 1,
    })),
    {
      itemHrid: "/items/task_token",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 1,
    },
  ];
  runtime.state.initData_itemDetailMap = Object.fromEntries(
    runtime.state.initData_characterItems.map(({ itemHrid }) => [
      itemHrid,
      { categoryHrid: "/item_categories/currency" },
    ]),
  );
  runtime.api.getAssetValue = () => 10;

  await runtime.settings.set("includeGuildDungeonTokensInAssets", true, {
    persist: false,
  });
  assert.equal(
    runtime.api
      .calculateInventoryCategoryValues()
      .get("/item_categories/currency"),
    60,
  );
  await runtime.settings.set("includeGuildDungeonTokensInAssets", false, {
    persist: false,
  });
  assert.equal(
    runtime.api
      .calculateInventoryCategoryValues()
      .get("/item_categories/currency"),
    10,
  );
  await runtime.settings.set("includeGuildDungeonTokensInAssets", true, {
    persist: false,
  });
  runtime.state.initData_characterItems = previousItems;
  runtime.state.initData_itemDetailMap = previousDetails;
  runtime.api.getAssetValue = previousAsset;
});

test("market value sorting ranks every stack descending inside its category", async () => {
  document.body.innerHTML = `<section id="sort-parent"><div class="Inventory_items__newHash">
    <div class="Inventory_category__newHash"><div class="Inventory_itemGrid__newHash">
      <div class="Inventory_label__newHash"><span class="Inventory_categoryButton__newHash">Food</span></div>
      <div id="low" class="Item_itemContainer__newHash"><div class="Item_item__newHash Item_clickable__newHash"><svg aria-label="Low"></svg><span class="Item_count__newHash">2</span></div></div>
      <div id="high" class="Item_itemContainer__newHash"><div class="Item_item__newHash Item_clickable__newHash"><svg aria-label="High"></svg><span class="Item_count__newHash">1</span></div></div>
      <div id="middle" class="Item_itemContainer__newHash"><div class="Item_item__newHash Item_clickable__newHash"><svg aria-label="Middle"></svg><span class="Item_count__newHash">3</span></div></div>
    </div></div>
  </div></section>`;
  const originalGetAssetValue = runtime.api.getAssetValue;
  const originalFetchMarketJSON = runtime.api.fetchMarketJSON;
  runtime.api.getAssetValue = (hrid) =>
    ({ "/items/low": 10.25, "/items/high": 100.5, "/items/middle": 20.1 })[
      hrid
    ] ?? 0;
  runtime.state.itemEnNameToHridMap = {
    Low: "/items/low",
    High: "/items/high",
    Middle: "/items/middle",
  };
  runtime.state.marketApiJson = { marketData: {} };
  runtime.api.fetchMarketJSON = async () => runtime.state.marketApiJson;
  runtime.settings.settingsMap.invSort.isTrue = true;

  await runtime.api.addInvSortButton(
    document.querySelector(".Inventory_items__newHash"),
  );
  document.querySelector("#script_sortByFair_btn").click();

  assert.equal(document.querySelector("#high").style.order, "0");
  assert.equal(document.querySelector("#middle").style.order, "1");
  assert.equal(document.querySelector("#low").style.order, "2");
  assert.match(document.querySelector("#high").textContent, /100\.5/);
  assert.match(document.querySelector("#middle").textContent, /60\.3/);
  assert.match(document.querySelector("#low").textContent, /20\.5/);

  runtime.api.getAssetValue = originalGetAssetValue;
  runtime.api.fetchMarketJSON = originalFetchMarketJSON;
});

test("equipment sorting uses enhancement, stack size, and derived badge values", async () => {
  document.body.innerHTML = `<section><div class="Inventory_items__gear">
    <div><div class="Inventory_itemGrid__gear">
      <div class="Inventory_label__gear"><span class="Inventory_categoryButton__gear">Equipment</span></div>
      <div id="plain-gear" class="Item_itemContainer__gear"><div class="Item_item__gear"><svg aria-label="Plain Gear"></svg><span class="Item_count__gear">2</span></div></div>
      <div id="enhanced-gear" class="Item_itemContainer__gear"><div class="Item_item__gear"><svg aria-label="Enhanced Gear"></svg><span class="Item_enhancementLevel__gear">+7</span></div></div>
      <div id="derived-gear" class="Item_itemContainer__gear"><div class="Item_item__gear"><svg aria-label="Derived Gear"></svg></div></div>
    </div></div>
  </div></section>`;
  const originalAsset = runtime.api.getAssetValue;
  const originalFetch = runtime.api.fetchMarketJSON;
  runtime.state.itemEnNameToHridMap = {
    "Plain Gear": "/items/plain-gear",
    "Enhanced Gear": "/items/enhanced-gear",
    "Derived Gear": "/items/derived-gear",
  };
  runtime.api.getAssetValue = (hrid, level) =>
    hrid === "/items/plain-gear"
      ? 60
      : hrid === "/items/enhanced-gear" && level === 7
        ? 150
        : hrid === "/items/derived-gear"
          ? 140
          : 0;
  runtime.api.fetchMarketJSON = async () => ({ marketData: {} });
  runtime.settings.settingsMap.invSort.isTrue = true;

  await runtime.api.addInvSortButton(
    document.querySelector(".Inventory_items__gear"),
  );
  document.querySelector("#script_sortByFair_btn").click();

  assert.equal(document.querySelector("#enhanced-gear").style.order, "0");
  assert.equal(document.querySelector("#derived-gear").style.order, "1");
  assert.equal(document.querySelector("#plain-gear").style.order, "2");
  assert.match(document.querySelector("#enhanced-gear").textContent, /150/);
  assert.match(document.querySelector("#derived-gear").textContent, /140/);
  assert.match(document.querySelector("#plain-gear").textContent, /120/);

  runtime.api.getAssetValue = originalAsset;
  runtime.api.fetchMarketJSON = originalFetch;
});

test("all nine game languages keep asset and build-score summaries on the inventory tab", async () => {
  const { registerGameLocaleResources } =
    await import("../src/core/game-localization.js");
  runtime.settings.settingsMap.invWorth.isTrue = true;

  const inventoryLabels = {
    en: "Inventory",
    es: "Inventario",
    fr: "Inventaire",
    pt: "Inventário",
    zh: "库存",
    "zh-TW": "庫存",
    ja: "インベントリ",
    ko: "인벤토리",
    ru: "Инвентарь",
  };

  for (const [locale, inventoryLabel] of Object.entries(inventoryLabels)) {
    if (locale !== "en" && locale !== "zh") {
      registerGameLocaleResources(locale, {
        characterManagement: { inventory: inventoryLabel },
        itemNames: { "/items/milk": `milk-${locale}` },
        actionNames: { "/actions/milking/cow": `cow-${locale}` },
        monsterNames: { "/monsters/rat": `rat-${locale}` },
        abilityNames: { "/abilities/strike": `strike-${locale}` },
      });
    }
    localStorage.setItem("i18nextLng", locale);
    document.body.innerHTML = `
      <section id="character-management">
        <nav role="tablist">
          <button id="inventory-tab" role="tab" aria-selected="true">${inventoryLabel}</button>
          <button id="equipment-tab" role="tab" aria-selected="false">equipment-${locale}</button>
        </nav>
        <div class="TabsComponent_tabPanelsContainer__test">
          <div class="TabPanel_tabPanel__test">
            <div class="Inventory_items__${locale}"></div>
          </div>
        </div>
      </section>`;

    await runtime.api.calculateNetworth({ force: true });
    await Promise.resolve();
    let summary = document.querySelector("#script_inventory_summary");
    assert.ok(summary, locale);
    assert.notEqual(summary.style.display, "none", locale);
    assert.match(summary.textContent, /战斗着装评分/, locale);
    assert.match(summary.textContent, /生活着装评分/, locale);
    assert.match(summary.textContent, /总资产/, locale);

    document
      .querySelector("#inventory-tab")
      .setAttribute("aria-selected", "false");
    document
      .querySelector("#equipment-tab")
      .setAttribute("aria-selected", "true");
    await runtime.api.calculateNetworth({ force: true });
    summary = document.querySelector("#script_inventory_summary");
    assert.equal(summary.style.display, "none", locale);

    document
      .querySelector("#equipment-tab")
      .setAttribute("aria-selected", "false");
    document
      .querySelector("#inventory-tab")
      .setAttribute("aria-selected", "true");
    await runtime.api.calculateNetworth({ force: true });
    summary = document.querySelector("#script_inventory_summary");
    assert.notEqual(summary.style.display, "none", locale);
  }
  localStorage.setItem("i18nextLng", "zh-CN");
});
