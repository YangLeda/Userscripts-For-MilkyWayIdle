import assert from "node:assert/strict";
import test from "node:test";

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
await import("../src/core/asset-values.js");

const assetSettings = {
  includeCowbellsInAssets: false,
  includeGuildDungeonTokensInAssets: true,
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
  "/items/mirror_of_protection": { 0: 80_000 },
  "/items/test_cape": { 5: 50_000 },
  "/items/artificer_cape_refined": { 5: 60_000 },
  "/items/test_sword": { 5: 40_000 },
  "/items/labyrinth_refinement_shard": { 0: 20 },
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
  "/items/test_quiver": {
    sellPrice: 12_345,
    equipmentDetail: { equipmentSlotHrid: "/item_locations/back" },
  },
  "/items/artificer_cape_refined": {
    equipmentDetail: { type: "/equipment_types/back" },
  },
  "/items/test_sword": {
    equipmentDetail: { equipmentSlotHrid: "/item_locations/main_hand" },
  },
  "/items/chance_cape": {
    sellPrice: 100_000,
    equipmentDetail: { type: "/equipment_types/back" },
  },
  "/items/chance_cape_refined": {
    sellPrice: 100_000,
    equipmentDetail: { type: "/equipment_types/back" },
  },
};

test("coin keeps its fixed asset value without market data", () => {
  const originalGetAssetFairValue = runtime.api.getAssetFairValue;
  runtime.api.getAssetFairValue = () => {
    throw new Error("coin valuation must not read the market snapshot");
  };

  assert.equal(runtime.api.getAssetValue("/items/coin"), 1);

  runtime.api.getAssetFairValue = originalGetAssetFairValue;
});
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
  chance_cape: {
    itemHrid: "/items/chance_cape",
    cost: { itemHrid: "/items/labyrinth_token", count: 250 },
    outputCount: 1,
  },
};
runtime.state.initData_actionDetailMap = {
  chance_cape_refined: {
    upgradeItemHrid: "/items/chance_cape",
    retainAllEnhancement: true,
    inputItems: [{ itemHrid: "/items/labyrinth_refinement_shard", count: 10 }],
    outputItems: [{ itemHrid: "/items/chance_cape_refined", count: 1 }],
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

test("keyed dungeon chests subtract their opening and entry keys", () => {
  const originalFairValue = runtime.api.getAssetFairValue;
  const originalNetSellPrice = runtime.api.getAssetNetSellPrice;
  const originalNetSellPriceAtAsk = runtime.api.getAssetNetSellPriceAtAsk;
  const originalTaxRate = runtime.api.getMarketTaxRate;
  const chestHrids = [
    "/items/chimerical_chest",
    "/items/chimerical_refinement_chest",
    "/items/sinister_chest",
    "/items/sinister_refinement_chest",
    "/items/enchanted_chest",
    "/items/enchanted_refinement_chest",
    "/items/pirate_chest",
    "/items/pirate_refinement_chest",
  ];
  const entryKeyHrids = new Set(
    chestHrids.map((chestHrid) =>
      chestHrid.replace(/(?:_refinement)?_chest$/, "_entry_key"),
    ),
  );
  for (const entryKeyHrid of entryKeyHrids) {
    runtime.state.initData_itemDetailMap[entryKeyHrid] = {};
  }
  for (const chestHrid of chestHrids) {
    runtime.state.initData_itemDetailMap[chestHrid] = {
      sellPrice: 77,
      openKeyItemHrid: "/items/dungeon_test_key",
    };
    runtime.state.initData_openableLootDropMap[chestHrid] = [
      {
        itemHrid: "/items/dungeon_test_loot",
        dropRate: 1,
        minCount: 1,
        maxCount: 1,
      },
    ];
  }
  runtime.state.initData_actionDetailMap.dungeon_test_key = {
    inputItems: [{ itemHrid: "/items/dungeon_test_key_material", count: 2 }],
    outputItems: [{ itemHrid: "/items/dungeon_test_key", count: 1 }],
  };
  runtime.state.initData_itemDetailMap["/items/keyless_refinement_chest"] = {};
  runtime.state.initData_openableLootDropMap[
    "/items/keyless_refinement_chest"
  ] = [
    {
      itemHrid: "/items/dungeon_test_loot",
      dropRate: 1,
      minCount: 1,
      maxCount: 1,
    },
  ];
  runtime.state.initData_itemDetailMap["/items/outer_dungeon_chest"] = {};
  runtime.state.initData_openableLootDropMap["/items/outer_dungeon_chest"] = [
    {
      itemHrid: chestHrids[0],
      dropRate: 1,
      minCount: 1,
      maxCount: 1,
    },
  ];
  const fairValues = {
    "/items/dungeon_test_loot": 1_000,
    "/items/dungeon_test_key": 200,
    "/items/dungeon_test_key_material": 50,
    ...Object.fromEntries([...entryKeyHrids].map((hrid) => [hrid, 25])),
  };
  runtime.api.getAssetFairValue = (itemHrid) => fairValues[itemHrid] ?? 0;
  runtime.api.getAssetNetSellPrice = (itemHrid) =>
    itemHrid === "/items/dungeon_test_loot"
      ? 700
      : entryKeyHrids.has(itemHrid)
        ? 20
        : itemHrid === "/items/dungeon_test_key"
          ? 100
          : itemHrid === "/items/dungeon_test_key_material"
            ? 40
            : 0;
  runtime.api.getAssetNetSellPriceAtAsk = (itemHrid) =>
    itemHrid === "/items/dungeon_test_loot"
      ? 1_300
      : entryKeyHrids.has(itemHrid)
        ? 30
        : itemHrid === "/items/dungeon_test_key"
          ? 300
          : itemHrid === "/items/dungeon_test_key_material"
            ? 60
            : 0;
  runtime.api.getMarketTaxRate = () => 0.1;
  runtime.api.invalidateAssetValueCache();

  for (const chestHrid of chestHrids) {
    assert.equal(runtime.api.getAssetValue(chestHrid), 875);
    assert.equal(
      runtime.api.getAssetLiquidationValue(chestHrid, 0, "conservative").value,
      600,
    );
    assert.equal(
      runtime.api.getAssetLiquidationValue(chestHrid, 0, "fair").value,
      787.5,
    );
    assert.equal(
      runtime.api.getAssetLiquidationValue(chestHrid, 0, "aggressive").value,
      1_150,
    );
  }
  assert.equal(
    runtime.api.getAssetValue("/items/keyless_refinement_chest"),
    1_000,
  );
  assert.equal(runtime.api.getAssetValue("/items/outer_dungeon_chest"), 875);

  fairValues["/items/dungeon_test_loot"] = 100;
  fairValues["/items/dungeon_test_key_material"] = 100;
  runtime.api.getAssetNetSellPrice = (itemHrid) =>
    itemHrid === "/items/dungeon_test_loot"
      ? 100
      : entryKeyHrids.has(itemHrid)
        ? 20
        : itemHrid === "/items/dungeon_test_key_material"
          ? 200
          : 0;
  runtime.api.invalidateAssetValueCache();
  assert.equal(runtime.api.getAssetValue(chestHrids[0]), 0);
  assert.deepEqual(
    runtime.api.getAssetLiquidationValue(chestHrids[0], 0, "conservative"),
    {
      value: 0,
      complete: true,
      source: "openable",
      missingItemHrids: [],
    },
  );

  delete fairValues["/items/dungeon_test_key_material"];
  runtime.api.getAssetNetSellPrice = (itemHrid) =>
    itemHrid === "/items/dungeon_test_loot"
      ? 100
      : entryKeyHrids.has(itemHrid)
        ? 20
        : 0;
  runtime.api.invalidateAssetValueCache();
  assert.equal(runtime.api.getAssetValue(chestHrids[0]), 0);
  const incomplete = runtime.api.getAssetLiquidationValue(
    chestHrids[0],
    0,
    "conservative",
  );
  assert.equal(incomplete.value, 0);
  assert.equal(incomplete.complete, false);
  assert.ok(
    incomplete.missingItemHrids.includes("/items/dungeon_test_key_material"),
  );

  Object.assign(runtime.api, {
    getAssetFairValue: originalFairValue,
    getAssetNetSellPrice: originalNetSellPrice,
    getAssetNetSellPriceAtAsk: originalNetSellPriceAtAsk,
    getMarketTaxRate: originalTaxRate,
  });
  for (const chestHrid of [
    ...chestHrids,
    "/items/keyless_refinement_chest",
    "/items/outer_dungeon_chest",
  ]) {
    delete runtime.state.initData_itemDetailMap[chestHrid];
    delete runtime.state.initData_openableLootDropMap[chestHrid];
  }
  for (const entryKeyHrid of entryKeyHrids) {
    delete runtime.state.initData_itemDetailMap[entryKeyHrid];
  }
  delete runtime.state.initData_actionDetailMap.dungeon_test_key;
  runtime.api.invalidateAssetValueCache();
});

test("unpriced personal buff scrolls are zero while direct markets still win", () => {
  const scrollHrid = "/items/test_action_speed_scroll";
  const shopItemHrid = "/items/test_labyrinth_shop_item";
  runtime.state.initData_itemDetailMap[scrollHrid] = {
    scrollDetail: { personalBuffTypeHrid: "/buff_types/action_speed" },
  };
  runtime.state.initData_itemDetailMap[shopItemHrid] = {};
  runtime.state.initData_labyrinthShopItemDetailMap.test_action_speed_scroll = {
    itemHrid: scrollHrid,
    cost: { itemHrid: "/items/labyrinth_token", count: 30 },
    outputCount: 1,
  };
  runtime.state.initData_labyrinthShopItemDetailMap.test_labyrinth_shop_item = {
    itemHrid: shopItemHrid,
    cost: { itemHrid: "/items/labyrinth_token", count: 2 },
    outputCount: 1,
  };
  runtime.api.invalidateAssetValueCache();

  assert.equal(runtime.api.getAssetValue(scrollHrid), 0);
  assert.equal(runtime.api.getAssetValue(scrollHrid) * 275, 0);
  assert.equal(runtime.api.getAssetValue(shopItemHrid), 1_600);

  runtime.state.marketItemValues[scrollHrid] = { 0: 291_000 };
  runtime.api.invalidateAssetValueCache();
  assert.equal(runtime.api.getAssetValue(scrollHrid), 291_000);

  delete runtime.state.marketItemValues[scrollHrid];
  delete runtime.state.initData_itemDetailMap[scrollHrid];
  delete runtime.state.initData_itemDetailMap[shopItemHrid];
  delete runtime.state.initData_labyrinthShopItemDetailMap
    .test_action_speed_scroll;
  delete runtime.state.initData_labyrinthShopItemDetailMap
    .test_labyrinth_shop_item;
  runtime.api.invalidateAssetValueCache();
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
    fair: runtime.api.getAssetFairValue,
    conservative: runtime.api.getAssetNetSellPrice,
    aggressive: runtime.api.getAssetNetSellPriceAtAsk,
    tax: runtime.api.getMarketTaxRate,
  };
  runtime.api.getAssetNetSellPrice = (itemHrid) =>
    itemHrid === "/items/liquid_leaf" ? 90 : 0;
  runtime.api.getAssetFairValue = (itemHrid) =>
    itemHrid === "/items/liquid_leaf" ? 110 : 0;
  runtime.api.getAssetNetSellPriceAtAsk = (itemHrid) =>
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
    getAssetFairValue: originals.fair,
    getAssetNetSellPrice: originals.conservative,
    getAssetNetSellPriceAtAsk: originals.aggressive,
    getMarketTaxRate: originals.tax,
  });
  runtime.api.invalidateAssetValueCache();
});

test("direct market and NPC sell values take priority without double tax", () => {
  const originals = {
    fair: runtime.api.getAssetFairValue,
    tax: runtime.api.getMarketTaxRate,
  };
  runtime.api.getAssetFairValue = (itemHrid) =>
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

  runtime.api.getAssetFairValue = originals.fair;
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

test("live orderbook prices wait for the next asset valuation session", () => {
  const itemHrid = "/items/session_frozen_value";
  runtime.state.initData_itemDetailMap[itemHrid] = {};
  runtime.state.marketItemValues[itemHrid] = { 0: 100 };
  runtime.api.invalidateAssetValueCache();

  assert.equal(runtime.api.getAssetValue(itemHrid), 100);
  runtime.api.applyMarketOrderBooks({
    itemHrid,
    orderBooks: {},
    marketValues: { 0: 250 },
  });

  assert.equal(runtime.api.getFairValue(itemHrid), 250);
  assert.equal(runtime.api.getAssetValue(itemHrid), 100);
  assert.equal(
    runtime.api.getAssetValue(itemHrid, 0, {
      forceAcquisitionValue: true,
      useLiveMarketValues: true,
    }),
    250,
  );
  assert.equal(runtime.api.isAssetValuationMarketDirty(), true);

  runtime.api.invalidateAssetValueCache();
  assert.equal(runtime.api.getAssetValue(itemHrid), 250);

  delete runtime.state.initData_itemDetailMap[itemHrid];
  delete runtime.state.marketItemValues[itemHrid];
  runtime.api.invalidateAssetValueCache();
});

test("upgrade crafting always adds one base item beyond matching recipe inputs", () => {
  const previousActions = runtime.state.initData_actionDetailMap;
  runtime.state.initData_actionDetailMap = {
    ...previousActions,
    stacked_upgrade: {
      upgradeItemHrid: "/items/upgrade_base",
      inputItems: [{ itemHrid: "/items/upgrade_base", count: 8 }],
      outputItems: [{ itemHrid: "/items/upgraded_result", count: 1 }],
    },
  };
  runtime.state.marketItemValues["/items/upgrade_base"] = { 0: 100 };
  runtime.api.invalidateAssetValueCache();

  assert.equal(
    runtime.api.getAssetValue("/items/upgraded_result", 0, {
      forceAcquisitionValue: true,
    }),
    900,
  );

  delete runtime.state.marketItemValues["/items/upgrade_base"];
  runtime.state.initData_actionDetailMap = previousActions;
  runtime.api.invalidateAssetValueCache();
});

test("live acquisition values propagate through recursive crafting inputs", () => {
  const previousActions = runtime.state.initData_actionDetailMap;
  const originalGetAssetFairValue = runtime.api.getAssetFairValue;
  const originalGetFairValue = runtime.api.getFairValue;
  runtime.state.initData_actionDetailMap = {
    ...previousActions,
    live_acquisition_recipe: {
      inputItems: [{ itemHrid: "/items/live_acquisition_input", count: 3 }],
      outputItems: [{ itemHrid: "/items/live_acquisition_output", count: 1 }],
    },
  };
  runtime.api.getAssetFairValue = (hrid) =>
    hrid === "/items/live_acquisition_input" ? 100 : 0;
  runtime.api.getFairValue = (hrid) =>
    hrid === "/items/live_acquisition_input" ? 250 : 0;
  runtime.api.invalidateAssetValueCache();

  assert.equal(
    runtime.api.getAssetValue("/items/live_acquisition_output", 0, {
      forceAcquisitionValue: true,
    }),
    300,
  );
  assert.equal(
    runtime.api.getAssetValue("/items/live_acquisition_output", 0, {
      forceAcquisitionValue: true,
      useLiveMarketValues: true,
    }),
    750,
  );

  runtime.api.getAssetFairValue = originalGetAssetFairValue;
  runtime.api.getFairValue = originalGetFairValue;
  runtime.state.initData_actionDetailMap = previousActions;
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
  assetSettings.includeGuildDungeonTokensInAssets = false;
  for (const itemHrid of [
    "/items/guild_token",
    "/items/chimerical_token",
    "/items/sinister_token",
    "/items/enchanted_token",
    "/items/pirate_token",
  ]) {
    assert.equal(runtime.api.isNonTradableTokenAsset(itemHrid), false);
  }
  assetSettings.includeGuildDungeonTokensInAssets = true;
});

test("enhanced equipment uses cost only outside the twenty-percent market band", () => {
  const originalPlanner = runtime.api.calculateEnhancementPlan;
  runtime.api.calculateEnhancementPlan = () => ({
    status: "complete",
    totalCost: 100_000,
  });

  const setMarketValue = (value) => {
    runtime.state.marketItemValues["/items/test_sword"] =
      value == null ? {} : { 5: value };
    runtime.api.invalidateAssetValueCache();
  };
  setMarketValue(80_000);
  assert.equal(runtime.api.getAssetValue("/items/test_sword", 5), 80_000);
  setMarketValue(120_000);
  assert.equal(runtime.api.getAssetValue("/items/test_sword", 5), 120_000);
  setMarketValue(79_999);
  assert.equal(runtime.api.getAssetValue("/items/test_sword", 5), 100_000);
  setMarketValue(120_001);
  assert.equal(runtime.api.getAssetValue("/items/test_sword", 5), 100_000);
  setMarketValue(null);
  assert.equal(runtime.api.getAssetValue("/items/test_sword", 5), 100_000);

  runtime.api.calculateEnhancementPlan = () => ({ status: "unavailable" });
  setMarketValue(40_000);
  assert.equal(runtime.api.getAssetValue("/items/test_sword", 5), 40_000);

  runtime.state.marketItemValues["/items/test_sword"] = {
    0: 30_000,
    5: 40_000,
  };
  runtime.api.invalidateAssetValueCache();
  assert.equal(runtime.api.getAssetValue("/items/test_sword", 0), 30_000);

  runtime.api.calculateEnhancementPlan = originalPlanner;
  runtime.state.marketItemValues["/items/test_sword"] = { 5: 40_000 };
  runtime.api.invalidateAssetValueCache();
});

test("enhanced charms use the cheapest complete market, shop, or crafting chain", () => {
  const originalPlanner = runtime.api.calculateEnhancementPlan;
  const previousActions = runtime.state.initData_actionDetailMap;
  const previousShop = runtime.state.initData_shopItemDetailMap;
  const addedItemHrids = [
    "/items/grandmaster_enhancing_charm",
    "/items/master_enhancing_charm",
    "/items/basic_enhancing_charm",
    "/items/trainee_enhancing_charm",
    "/items/enhancing_essence",
  ];
  runtime.state.initData_itemDetailMap = {
    ...runtime.state.initData_itemDetailMap,
    "/items/grandmaster_enhancing_charm": {
      equipmentDetail: { equipmentSlotHrid: "/item_locations/charm" },
    },
    "/items/master_enhancing_charm": {},
    "/items/basic_enhancing_charm": {},
    "/items/trainee_enhancing_charm": {},
    "/items/enhancing_essence": {},
  };
  runtime.state.marketItemValues = {
    ...runtime.state.marketItemValues,
    "/items/grandmaster_enhancing_charm": {
      0: 5_000_000,
      10: 12_000_000,
    },
    "/items/enhancing_essence": { 0: 100 },
  };
  runtime.state.initData_shopItemDetailMap = {
    ...previousShop,
    trainee_enhancing_charm: {
      itemHrid: "/items/trainee_enhancing_charm",
      costs: [{ itemHrid: "/items/coin", count: 250_000 }],
    },
  };
  runtime.state.initData_actionDetailMap = {
    ...previousActions,
    basic_enhancing_charm: {
      inputItems: [{ itemHrid: "/items/enhancing_essence", count: 100 }],
      outputItems: [{ itemHrid: "/items/basic_enhancing_charm", count: 1 }],
    },
    master_enhancing_charm: {
      upgradeItemHrid: "/items/basic_enhancing_charm",
      inputItems: [{ itemHrid: "/items/basic_enhancing_charm", count: 2 }],
      outputItems: [{ itemHrid: "/items/master_enhancing_charm", count: 1 }],
    },
    grandmaster_enhancing_charm: {
      upgradeItemHrid: "/items/master_enhancing_charm",
      inputItems: [{ itemHrid: "/items/master_enhancing_charm", count: 2 }],
      outputItems: [
        { itemHrid: "/items/grandmaster_enhancing_charm", count: 1 },
      ],
    },
  };
  let quotedBase = 0;
  let quotedMaterial = 0;
  runtime.api.calculateEnhancementPlan = (options) => {
    quotedBase = options.getFairValue("/items/grandmaster_enhancing_charm", 0);
    quotedMaterial = options.getFairValue("/items/trainee_enhancing_charm", 0);
    return {
      status: "complete",
      totalCost: quotedBase + quotedMaterial * 10,
    };
  };
  runtime.api.invalidateAssetValueCache();

  assert.equal(
    runtime.api.getAssetValue("/items/grandmaster_enhancing_charm", 10),
    2_590_000,
  );
  assert.equal(quotedBase, 90_000);
  assert.equal(quotedMaterial, 250_000);

  runtime.api.calculateEnhancementPlan = originalPlanner;
  runtime.state.initData_actionDetailMap = previousActions;
  runtime.state.initData_shopItemDetailMap = previousShop;
  for (const itemHrid of addedItemHrids) {
    delete runtime.state.initData_itemDetailMap[itemHrid];
    delete runtime.state.marketItemValues[itemHrid];
  }
  runtime.api.invalidateAssetValueCache();
});

test("non-refined and refined back gear keep acquisition and enhancement value", () => {
  const originalPlanner = runtime.api.calculateEnhancementPlan;
  runtime.api.calculateEnhancementPlan = (options) => {
    const baseValue = options.getFairValue("/items/chance_cape", 0);
    const refinementValue = options.itemHrid.endsWith("_refined")
      ? options.getFairValue("/items/labyrinth_refinement_shard", 0) * 10
      : 0;
    return {
      status: "complete",
      totalCost:
        baseValue + refinementValue + Number(options.targetLevel) * 1_000,
    };
  };

  // The dynamic labyrinth-token value is 800, so acquisition costs 250 × 800.
  // Plain +0 back gear normally uses its market/NPC fallback. Refined gear
  // retains acquisition and refinement costs regardless of the mirror option.
  assetSettings.valueBackEquipmentWithProtectionMirror = false;
  runtime.api.invalidateAssetValueCache();
  assert.equal(runtime.api.getAssetValue("/items/chance_cape", 0), 100_000);
  assert.equal(runtime.api.getAssetValue("/items/test_quiver", 0), 12_345);
  assert.equal(
    runtime.api.getAssetValue("/items/chance_cape_refined", 0),
    200_200,
  );
  assert.equal(runtime.api.getAssetValue("/items/chance_cape", 5), 205_000);
  assert.equal(
    runtime.api.getAssetValue("/items/chance_cape_refined", 5),
    205_200,
  );

  assetSettings.valueBackEquipmentWithProtectionMirror = true;
  runtime.api.invalidateAssetValueCache();
  assert.equal(runtime.api.getAssetValue("/items/chance_cape", 0), 80_000);
  assert.equal(runtime.api.getAssetValue("/items/test_quiver", 0), 80_000);
  assert.equal(runtime.api.getAssetValue("/items/chance_cape", 5), 205_000);
  assert.equal(
    runtime.api.getAssetValue("/items/chance_cape_refined", 5),
    205_200,
  );

  runtime.api.calculateEnhancementPlan = originalPlanner;
  assetSettings.valueBackEquipmentWithProtectionMirror = false;
  runtime.api.invalidateAssetValueCache();
});

test("all enhanced back equipment uses forced protection-mirror value", () => {
  const originalPlanner = runtime.api.calculateEnhancementPlan;
  let received = null;
  runtime.api.calculateEnhancementPlan = (options) => {
    received = options;
    return {
      status: "complete",
      totalCost: options.forcedProtectionItemHrid ? 123_456 : 234_567,
    };
  };

  assetSettings.valueBackEquipmentWithProtectionMirror = false;
  runtime.api.invalidateAssetValueCache();
  assert.equal(runtime.api.getAssetValue("/items/test_cape", 5), 123_456);
  assert.equal(
    received.forcedProtectionItemHrid,
    "/items/mirror_of_protection",
  );
  assert.equal(received.allowPhilosopherMirror, true);
  runtime.api.invalidateAssetValueCache();
  assert.equal(runtime.api.getAssetValue("/items/test_quiver", 5), 123_456);
  assert.equal(
    received.forcedProtectionItemHrid,
    "/items/mirror_of_protection",
  );

  assetSettings.valueBackEquipmentWithProtectionMirror = true;
  runtime.api.invalidateAssetValueCache();
  assert.equal(runtime.api.getAssetValue("/items/test_cape", 5), 123_456);
  assert.equal(
    received.forcedProtectionItemHrid,
    "/items/mirror_of_protection",
  );
  assert.equal(received.allowPhilosopherMirror, true);
  runtime.api.invalidateAssetValueCache();
  assert.equal(
    runtime.api.getAssetValue("/items/artificer_cape_refined", 5),
    123_456,
  );
  assert.equal(received.itemHrid, "/items/artificer_cape_refined");
  assert.equal(runtime.api.getAssetValue("/items/test_sword", 5), 234_567);
  assert.equal(received.forcedProtectionItemHrid, null);
  assert.equal(received.allowPhilosopherMirror, true);
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
      isCombat: true,
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
      isCombat: false,
      levelCosts: [
        null,
        {
          guildTokenCost: 0,
          creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 2 }],
        },
      ],
    },
    "/guild_buffs/scholar_combat": {
      isCombat: true,
      levelCosts: [
        null,
        {
          guildTokenCost: 0,
          creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 4 }],
        },
      ],
    },
    "/guild_buffs/scholar_skilling": {
      isCombat: false,
      levelCosts: [
        null,
        {
          guildTokenCost: 0,
          creditCosts: [{ itemHrid: "/items/green_guild_credit", count: 6 }],
        },
      ],
    },
  };
  runtime.state.guildBuffLevels = {
    "/guild_buffs/force_combat": { level: 2 },
    "/guild_buffs/force_skilling": 1,
    "/guild_buffs/scholar_combat": 1,
    "/guild_buffs/scholar_skilling": 1,
  };
  runtime.state.guildDataLoaded = true;
  assert.deepEqual(runtime.api.getGuildShrineValues(), {
    battle: 840,
    skilling: 160,
    total: 1000,
  });
  assert.equal(runtime.api.getGuildShrineValue(), 1000);

  runtime.state.guildDataLoaded = false;
  assert.equal(runtime.api.getGuildShrineValue(), null);
  assert.deepEqual(
    runtime.api.getGuildShrineValues({
      "/guild_buffs/force_combat": 1,
      "/guild_buffs/force_skilling": 0,
      "/guild_buffs/scholar_combat": 0,
      "/guild_buffs/scholar_skilling": 0,
    }),
    { battle: 460, skilling: 0, total: 460 },
  );

  const savedCost =
    runtime.state.initData_guildBuffDetailMap["/guild_buffs/force_combat"]
      .levelCosts[2];
  runtime.state.initData_guildBuffDetailMap[
    "/guild_buffs/force_combat"
  ].levelCosts[2] = null;
  assert.deepEqual(
    runtime.api.getGuildShrineValues(runtime.state.guildBuffLevels),
    { battle: null, skilling: 160, total: null },
  );
  runtime.state.initData_guildBuffDetailMap[
    "/guild_buffs/force_combat"
  ].levelCosts[2] = savedCost;
});

test("recipe and shop reverse indexes rebuild when source objects are replaced", () => {
  const previousActions = runtime.state.initData_actionDetailMap;
  const previousShop = runtime.state.initData_shopItemDetailMap;
  const previousTaskShop = runtime.state.initData_taskShopItemDetailMap;
  const previousLabyrinthShop =
    runtime.state.initData_labyrinthShopItemDetailMap;

  runtime.state.initData_taskShopItemDetailMap = {};
  runtime.state.initData_labyrinthShopItemDetailMap = {};
  runtime.state.initData_shopItemDetailMap = {};
  runtime.state.initData_actionDetailMap = {
    first_recipe: {
      inputItems: [{ itemHrid: "/items/material_cheap", count: 2 }],
      outputItems: [{ itemHrid: "/items/indexed_recipe_a", count: 1 }],
    },
  };
  runtime.api.invalidateAssetValueCache();
  assert.equal(
    runtime.api.getAssetValue("/items/indexed_recipe_a", 0, {
      forceAcquisitionValue: true,
    }),
    200,
  );

  runtime.state.initData_actionDetailMap = {
    replacement_recipe: {
      inputItems: [{ itemHrid: "/items/material_expensive", count: 3 }],
      outputItems: [{ itemHrid: "/items/indexed_recipe_b", count: 1 }],
    },
  };
  assert.equal(
    runtime.api.getAssetValue("/items/indexed_recipe_b", 0, {
      forceAcquisitionValue: true,
    }),
    1_500,
  );

  runtime.state.initData_shopItemDetailMap = {
    first_reward: {
      itemHrid: "/items/indexed_shop_a",
      costs: [{ itemHrid: "/items/material_cheap", count: 4 }],
    },
  };
  assert.equal(runtime.api.getAssetValue("/items/indexed_shop_a"), 400);

  runtime.state.initData_shopItemDetailMap = {
    replacement_reward: {
      itemHrid: "/items/indexed_shop_b",
      costs: [{ itemHrid: "/items/material_expensive", count: 2 }],
    },
  };
  assert.equal(runtime.api.getAssetValue("/items/indexed_shop_b"), 1_000);

  runtime.state.initData_actionDetailMap = previousActions;
  runtime.state.initData_shopItemDetailMap = previousShop;
  runtime.state.initData_taskShopItemDetailMap = previousTaskShop;
  runtime.state.initData_labyrinthShopItemDetailMap = previousLabyrinthShop;
  runtime.api.invalidateAssetValueCache();
});
