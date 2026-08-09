import assert from "node:assert/strict";
import test from "node:test";

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
await import("../src/core/asset-values.js");

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

test("a direct server value wins over every derived route", () => {
  runtime.state.marketItemValues["/items/task_token"] = { 0: 999 };
  runtime.api.invalidateAssetValueCache();
  assert.equal(runtime.api.getAssetValue("/items/task_token"), 999);
  delete runtime.state.marketItemValues["/items/task_token"];
  runtime.api.invalidateAssetValueCache();
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
