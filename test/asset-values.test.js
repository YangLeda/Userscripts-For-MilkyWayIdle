import assert from "node:assert/strict";
import test from "node:test";

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
await import("../src/core/asset-values.js");

const assetSettings = {
  includeCowbellsInAssets: false,
  valueBackEquipmentWithProtectionMirror: false,
};
runtime.settings.get = (id) => assetSettings[id];

runtime.state.itemEnNameToHridMap = {};
runtime.state.marketApiJson = {
  timestamp: 1,
  marketData: { "/items/coin": { 0: { a: 1, b: 1 } } },
};
runtime.state.marketItemValues = {
  "/items/material_cheap": { 0: 100 },
  "/items/material_expensive": { 0: 500 },
  "/items/purple_material": { 0: 100 },
  "/items/bag_of_10_cowbells": { 0: 1000 },
  "/items/dungeon_reward": { 0: 3000 },
  "/items/task_drop_a": { 0: 100 },
  "/items/task_drop_b": { 0: 200 },
  "/items/labyrinth_reward": { 0: 4000 },
  "/items/test_cape": { 5: 50_000 },
  "/items/artificer_cape_refined": { 5: 60_000 },
  "/items/test_sword": { 5: 40_000 },
};
runtime.state.initData_itemDetailMap = {
  "/items/material_cheap": {
    guildCreditConversions: [
      {
        creditItemHrid: "/items/green_guild_credit",
        itemCount: 2,
        creditCount: 10,
      },
    ],
  },
  "/items/material_expensive": {
    guildCreditConversions: [
      {
        creditItemHrid: "/items/green_guild_credit",
        itemCount: 1,
        creditCount: 10,
      },
    ],
  },
  "/items/purple_material": {
    guildCreditConversions: [
      {
        creditItemHrid: "/items/purple_guild_credit",
        itemCount: 1,
        creditCount: 1,
      },
    ],
  },
  "/items/guild_token": {
    guildCreditConversions: [
      {
        creditItemHrid: "/items/green_guild_credit",
        guildTokenCount: 1,
        creditCount: 10,
      },
      {
        creditItemHrid: "/items/purple_guild_credit",
        guildTokenCount: 1,
        creditCount: 1,
      },
    ],
  },
  "/items/vendor_only": { sellPrice: 1234 },
  "/items/task_crate": { sellPrice: 5 },
  "/items/test_cape": {
    equipmentDetail: { equipmentSlotHrid: "/item_locations/back" },
  },
  "/items/artificer_cape_refined": {
    equipmentDetail: { type: "/equipment_types/back" },
  },
  "/items/test_sword": {
    equipmentDetail: { equipmentSlotHrid: "/item_locations/main_hand" },
  },
};
runtime.state.initData_shopItemDetailMap = {
  dungeon_reward: {
    itemHrid: "/items/dungeon_reward",
    costs: [{ itemHrid: "/items/chimerical_token", count: 2 }],
  },
};
runtime.state.initData_taskShopItemDetailMap = {
  task_crate: {
    itemHrid: "/items/task_crate",
    cost: { itemHrid: "/items/task_token", count: 30 },
  },
  weaker_task_reward: {
    itemHrid: "/items/dungeon_reward",
    cost: { itemHrid: "/items/task_token", count: 100 },
  },
};
runtime.state.initData_labyrinthShopItemDetailMap = {
  labyrinth_reward: {
    itemHrid: "/items/labyrinth_reward",
    cost: { itemHrid: "/items/labyrinth_token", count: 10 },
    outputCount: 2,
  },
};
runtime.state.initData_openableLootDropMap = {
  "/items/task_crate": [
    {
      itemHrid: "/items/task_drop_a",
      dropRate: 1,
      minCount: 10,
      maxCount: 10,
    },
    {
      itemHrid: "/items/task_drop_b",
      dropRate: 0.5,
      minCount: 2,
      maxCount: 2,
    },
  ],
  "/items/outer_crate": [
    {
      itemHrid: "/items/task_crate",
      dropRate: 1,
      minCount: 2,
      maxCount: 2,
    },
  ],
  "/items/cyclic_crate": [
    {
      itemHrid: "/items/cyclic_crate",
      dropRate: 1,
      minCount: 1,
      maxCount: 1,
    },
  ],
};
runtime.api.invalidateAssetValueCache();

test("special currencies use dynamic best-value conversions", () => {
  assert.equal(runtime.api.getAssetValue("/items/cowbell"), 100);
  assert.equal(runtime.api.getAssetValue("/items/green_guild_credit"), 20);
  assert.equal(runtime.api.getAssetValue("/items/guild_token"), 200);
  assert.equal(runtime.api.getAssetValue("/items/chimerical_token"), 1500);
  assert.equal(runtime.api.getAssetValue("/items/task_token"), 40);
  assert.equal(runtime.api.getAssetValue("/items/labyrinth_token"), 800);
});

test("openable values support expected drops, nesting and cycle guards", () => {
  assert.equal(runtime.api.getAssetValue("/items/task_crate"), 1200);
  assert.equal(runtime.api.getAssetValue("/items/outer_crate"), 2400);
  assert.equal(runtime.api.getAssetValue("/items/cyclic_crate"), 0);
});

test("output liquidation values recurse through openables for all valuation modes", () => {
  runtime.state.initData_openableLootDropMap["/items/large_artisans_crate"] = [
    {
      itemHrid: "/items/liquid_leaf",
      dropRate: 1,
      minCount: 2,
      maxCount: 2,
    },
    {
      itemHrid: "/items/unpriced_leaf",
      dropRate: 0.5,
      minCount: 1,
      maxCount: 1,
    },
  ];
  const originals = {
    fair: runtime.api.getFairValue,
    conservative: runtime.api.getNetSellPrice,
    aggressive: runtime.api.getNetSellPriceAtAsk,
    tax: runtime.api.getMarketTaxRate,
  };
  runtime.api.getNetSellPrice = (itemHrid) =>
    itemHrid === "/items/liquid_leaf" ? 90 : 0;
  runtime.api.getFairValue = (itemHrid) =>
    itemHrid === "/items/liquid_leaf" ? 110 : 0;
  runtime.api.getNetSellPriceAtAsk = (itemHrid) =>
    itemHrid === "/items/liquid_leaf" ? 135 : 0;
  runtime.api.getMarketTaxRate = () => 0.1;
  runtime.api.invalidateAssetValueCache();

  const conservative = runtime.api.getAssetLiquidationValue(
    "/items/large_artisans_crate",
    0,
    "conservative",
  );
  const fair = runtime.api.getAssetLiquidationValue(
    "/items/large_artisans_crate",
    0,
    "fair",
  );
  const aggressive = runtime.api.getAssetLiquidationValue(
    "/items/large_artisans_crate",
    0,
    "aggressive",
  );
  assert.equal(conservative.value, 180);
  assert.equal(fair.value, 198);
  assert.equal(aggressive.value, 270);
  assert.equal(fair.source, "openable");
  assert.equal(fair.complete, false);
  assert.deepEqual(fair.missingItemHrids, ["/items/unpriced_leaf"]);

  Object.assign(runtime.api, {
    getFairValue: originals.fair,
    getNetSellPrice: originals.conservative,
    getNetSellPriceAtAsk: originals.aggressive,
    getMarketTaxRate: originals.tax,
  });
  runtime.api.invalidateAssetValueCache();
});

test("direct market and NPC sell values take priority without double tax", () => {
  const originals = {
    fair: runtime.api.getFairValue,
    tax: runtime.api.getMarketTaxRate,
  };
  runtime.api.getFairValue = (itemHrid) =>
    itemHrid === "/items/task_crate" ? 1_000 : 0;
  runtime.api.getMarketTaxRate = () => 0.05;
  runtime.api.invalidateAssetValueCache();
  assert.deepEqual(
    runtime.api.getAssetLiquidationValue("/items/task_crate", 0, "fair"),
    {
      value: 950,
      complete: true,
      source: "market",
      missingItemHrids: [],
    },
  );
  assert.deepEqual(
    runtime.api.getAssetLiquidationValue("/items/vendor_only", 0, "fair"),
    {
      value: 1234,
      complete: true,
      source: "sell-price",
      missingItemHrids: [],
    },
  );

  runtime.api.getFairValue = originals.fair;
  runtime.api.getMarketTaxRate = originals.tax;
  runtime.api.invalidateAssetValueCache();
});

test("a direct server value wins over every derived route", () => {
  runtime.state.marketItemValues["/items/task_token"] = { 0: 999 };
  runtime.api.invalidateAssetValueCache();
  assert.equal(runtime.api.getAssetValue("/items/task_token"), 999);
  delete runtime.state.marketItemValues["/items/task_token"];
  runtime.api.invalidateAssetValueCache();
});

test("the game sell price is only the final fallback", () => {
  assert.equal(runtime.api.getAssetValue("/items/vendor_only"), 1234);
  assert.equal(runtime.api.getAssetValue("/items/task_crate"), 1200);
});

test("non-tradable token assets are classified separately", () => {
  assert.equal(runtime.api.isNonTradableTokenAsset("/items/cowbell"), true);
  assert.equal(runtime.api.isNonTradableTokenAsset("/items/guild_token"), true);
  assert.equal(
    runtime.api.isNonTradableTokenAsset("/items/green_guild_credit"),
    true,
  );
  assert.equal(runtime.api.isNonTradableTokenAsset("/items/task_token"), false);
  assert.equal(
    runtime.api.isNonTradableTokenAsset("/items/labyrinth_token"),
    false,
  );
});

test("back equipment can use forced protection-mirror enhancement value", () => {
  const originalPlanner = runtime.api.calculateEnhancementPlan;
  let received = null;
  runtime.api.calculateEnhancementPlan = (options) => {
    received = options;
    return { status: "complete", totalCost: 123_456 };
  };

  assetSettings.valueBackEquipmentWithProtectionMirror = false;
  runtime.api.invalidateAssetValueCache();
  assert.equal(runtime.api.getAssetValue("/items/test_cape", 5), 50_000);

  assetSettings.valueBackEquipmentWithProtectionMirror = true;
  runtime.api.invalidateAssetValueCache();
  assert.equal(runtime.api.getAssetValue("/items/test_cape", 5), 123_456);
  assert.equal(
    received.forcedProtectionItemHrid,
    "/items/mirror_of_protection",
  );
  assert.equal(received.allowPhilosopherMirror, false);
  runtime.api.invalidateAssetValueCache();
  assert.equal(
    runtime.api.getAssetValue("/items/artificer_cape_refined", 5),
    123_456,
  );
  assert.equal(received.itemHrid, "/items/artificer_cape_refined");
  assert.equal(runtime.api.getAssetValue("/items/test_sword", 5), 40_000);
  assert.equal(
    runtime.api.isBackEquipment(
      "/items/unknown_back_item",
      "/item_locations/back",
    ),
    true,
  );

  assetSettings.valueBackEquipmentWithProtectionMirror = false;
  runtime.api.calculateEnhancementPlan = originalPlanner;
  runtime.api.invalidateAssetValueCache();
});

test("guild shrine value accumulates every purchased buff level", () => {
  runtime.state.initData_guildBuffDetailMap = {
    "/guild_buffs/force_combat": {
      levelCosts: [
        null,
        {
          guildTokenCost: 2,
          creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 3 }],
        },
        {
          guildTokenCost: 1,
          creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 5 }],
        },
      ],
    },
    "/guild_buffs/force_skilling": {
      levelCosts: [
        null,
        {
          guildTokenCost: 0,
          creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 2 }],
        },
      ],
    },
  };
  runtime.state.guildBuffLevels = {
    "/guild_buffs/force_combat": { level: 2 },
    "/guild_buffs/force_skilling": 1,
  };
  runtime.state.guildDataLoaded = true;
  assert.equal(runtime.api.getGuildShrineValue(), 800);

  runtime.state.guildDataLoaded = false;
  assert.equal(runtime.api.getGuildShrineValue(), null);
});
