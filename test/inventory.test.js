import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<!doctype html><body>
    <div class="Header_totalLevel__8LY3Q"></div>
    <section id="inventory-parent"><div class="Inventory_items__6SXv0">
      <div><div class="Inventory_itemGrid__test">
        <div class="Inventory_label__test"><span class="Inventory_categoryButton__test">食物</span></div>
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
    /总资产价值/,
  );
  assert.match(
    document.querySelector("#nonCurrentAssets").textContent,
    /房子价值：\s*10M/,
  );
  assert.match(
    document.querySelector("#nonCurrentAssets").textContent,
    /技能价值：\s*20M/,
  );
  assert.match(
    document.querySelector("#nonCurrentAssets").textContent,
    /不可交易代币：\s*0/,
  );
  assert.match(
    document.querySelector("#nonCurrentAssets").textContent,
    /神龛：\s*—/,
  );
  assert.doesNotMatch(document.body.textContent, /战力打造分/);

  document.querySelector("#toggleScores").click();
  assert.equal(document.querySelector("#buildScores").hidden, false);
  assert.equal(
    document.querySelector("#toggleScores").getAttribute("aria-expanded"),
    "true",
  );

  await runtime.api.calculateNetworth();
  await Promise.resolve();
  assert.equal(document.querySelector("#buildScores").hidden, false);
  assert.equal(
    document.querySelector("#toggleScores").getAttribute("aria-expanded"),
    "true",
  );
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

  await runtime.api.calculateNetworth();
  await Promise.resolve();

  assert.match(
    document.querySelector("#currentAssets").textContent,
    /库存价值：10\.4K/,
  );
  assert.match(
    document.querySelector("#nonCurrentAssets").textContent,
    /不可交易代币：450/,
  );
  assert.match(
    document.querySelector("#nonCurrentAssets").textContent,
    /神龛：150/,
  );
});
