import assert from "node:assert/strict";
import test from "node:test";

import { runtime } from "../src/core/runtime.js";
import "../src/data/translations.js";
import "../src/core/state.js";
import "../src/core/market.js";
import "../src/core/asset-values.js";
import "../src/core/message-state.js";
import "../src/core/messages.js";

test("client data is available before message effects run", () => {
  let observedName = null;
  runtime.onMessage("init_client_data", () => {
    observedName = runtime.state.initData_itemDetailMap["/items/coin"].name;
  });

  runtime.api.handleMessage(
    JSON.stringify({
      type: "init_client_data",
      actionDetailMap: {},
      levelExperienceTable: [0, 100],
      itemDetailMap: { "/items/coin": { name: "Coin" } },
      itemLocationDetailMap: {
        "/item_locations/inventory": { isTool: false },
      },
      houseRoomDetailMap: {
        "/house_rooms/dojo": {
          usableInActionTypeMap: { "/action_types/combat": true },
        },
      },
      actionCategoryDetailMap: {},
      abilityDetailMap: {},
    }),
  );

  assert.equal(observedName, "Coin");
  assert.equal(runtime.state.itemEnNameToHridMap.Coin, "/items/coin");
  assert.equal(
    runtime.state.initData_itemLocationDetailMap["/item_locations/inventory"]
      .isTool,
    false,
  );
  assert.equal(
    runtime.state.initData_houseRoomDetailMap["/house_rooms/dojo"]
      .usableInActionTypeMap["/action_types/combat"],
    true,
  );
});

test("market state is updated before feature effects run", () => {
  let observedValue = null;
  runtime.onMessage("market_item_values_updated", () => {
    observedValue = runtime.api.getFairValue("/items/milk", 0);
  });

  runtime.api.handleMessage(
    JSON.stringify({
      type: "market_item_values_updated",
      marketValuesVersion: "v2",
      marketItemValues: { "/items/milk": { 0: 1015 } },
    }),
  );

  assert.equal(runtime.state.marketValuesVersion, "v2");
  assert.equal(observedValue, 1015);
});

test("orderbook bands and pegged listings update canonical state", () => {
  runtime.api.applyGameMessage({
    type: "market_item_order_books_updated",
    itemHrid: "/items/milk",
    orderBooks: { 0: { asks: [], bids: [] } },
    priceBandMins: { 0: 900 },
    priceBandMaxs: { 0: 1100 },
  });
  assert.deepEqual(runtime.api.getPriceBand("/items/milk", 0), {
    minimum: 900,
    maximum: 1100,
  });

  runtime.api.applyGameMessage({
    type: "market_listings_updated",
    marketListings: [
      {
        id: 1,
        itemHrid: "/items/milk",
        price: 1200,
        workingPrice: 1100,
      },
    ],
  });
  assert.equal(runtime.state.initData_myMarketListings[0].workingPrice, 1100);
});

test("character, action and equipment messages update canonical state", () => {
  runtime.api.applyGameMessage({
    type: "init_character_data",
    characterSkills: [{ skillHrid: "/skills/milking" }],
    characterItems: [
      {
        itemHrid: "/items/sword",
        itemLocationHrid: "/item_locations/main_hand",
        count: 1,
      },
      {
        itemHrid: "/items/coin",
        itemLocationHrid: "/item_locations/inventory",
        count: 10,
      },
    ],
    characterHouseRoomMap: {},
    actionTypeDrinkSlotsMap: {},
    characterAbilities: [],
    myMarketListings: [],
    combatUnit: { combatAbilities: [] },
    characterActions: [
      { id: 1, actionHrid: "/actions/milking/cow", currentCount: 1 },
    ],
  });

  assert.equal(
    runtime.state.currentEquipmentMap["/item_locations/main_hand"].itemHrid,
    "/items/sword",
  );
  assert.equal(runtime.state.currentActionsHridList.length, 1);

  runtime.api.applyGameMessage({
    type: "actions_updated",
    endCharacterActions: [
      { id: 1, isDone: true },
      { id: 2, isDone: false, actionHrid: "/actions/combat/forest" },
    ],
  });
  assert.deepEqual(
    runtime.state.currentActionsHridList.map(({ id }) => id),
    [2],
  );

  runtime.api.applyGameMessage({
    type: "action_completed",
    endCharacterAction: { id: 2, isDone: false, currentCount: 7 },
  });
  assert.equal(runtime.state.currentActionsHridList[0].currentCount, 7);

  runtime.api.applyGameMessage({
    type: "items_updated",
    endCharacterItems: [
      {
        itemHrid: "/items/sword",
        itemLocationHrid: "/item_locations/main_hand",
        count: 0,
      },
    ],
  });
  assert.equal(
    runtime.state.currentEquipmentMap["/item_locations/main_hand"],
    null,
  );
});

test("guild buff levels update canonical state before feature effects", () => {
  let observedLevel = null;
  runtime.onMessage("guild_updated", () => {
    observedLevel = runtime.state.guildBuffLevels["/guild_buffs/force_combat"];
  });

  runtime.api.handleMessage(
    JSON.stringify({
      type: "guild_updated",
      guild: {
        characterGuildBuffLevelMap: {
          "/guild_buffs/force_combat": { level: 7 },
        },
      },
    }),
  );

  assert.deepEqual(observedLevel, { level: 7 });
  assert.equal(runtime.state.guildDataLoaded, true);
});
