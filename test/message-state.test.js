import assert from "node:assert/strict";
import test from "node:test";

import { runtime } from "../src/core/runtime.js";
import "../src/data/translations.js";
import "../src/core/state.js";
import "../src/core/market.js";
import "../src/core/asset-values.js";
import "../src/core/message-state.js";
import "../src/core/messages.js";

test("wildcard message consumers receive each typed or non-JSON frame once", () => {
  const received = [];
  const unsubscribe = runtime.onMessage("*", (payload, rawMessage) => {
    received.push([payload.type, rawMessage]);
  });

  runtime.api.handleMessage(JSON.stringify({ type: "dps_test_message" }));
  runtime.api.handleMessage("server-non-json-ping");
  unsubscribe();
  runtime.api.handleMessage(JSON.stringify({ type: "dps_after_unsubscribe" }));

  assert.deepEqual(received, [
    ["dps_test_message", '{"type":"dps_test_message"}'],
    ["__non_json_message__", "server-non-json-ping"],
  ]);
});

test("the websocket hook accepts a cross-realm socket-shaped wrapper", () => {
  const rawMessage = JSON.stringify({ type: "bridged_socket_message" });
  let deliveries = 0;
  const unsubscribe = runtime.onMessage("bridged_socket_message", () => {
    deliveries += 1;
  });
  runtime.api.hookWS();
  const event = new MessageEvent("message", { data: rawMessage });
  Object.defineProperty(event, "currentTarget", {
    value: {
      url: "wss://api.milkywayidle.com/ws?characterId=1",
      send() {},
      addEventListener() {},
    },
  });

  assert.equal(event.data, rawMessage);
  assert.equal(deliveries, 1);
  unsubscribe();
});

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
    endCharacterItems: [
      {
        itemHrid: "/items/coin",
        itemLocationHrid: "/item_locations/inventory",
        count: 9,
      },
    ],
  });
  assert.equal(runtime.state.currentActionsHridList[0].currentCount, 7);
  assert.equal(
    runtime.state.initData_characterItems.find(
      ({ itemHrid }) => itemHrid === "/items/coin",
    ).count,
    9,
    "embedded action-completion inventory updates must reach canonical state",
  );

  runtime.api.applyGameMessage({
    type: "action_completed",
    endCharacterAction: { id: "2", currentCount: 8 },
  });
  assert.equal(
    runtime.state.currentActionsHridList[0].currentCount,
    8,
    "an omitted isDone flag must not reset the remaining-action estimate",
  );

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

test("action updates merge by string id, deduplicate, and follow ordinal order", () => {
  runtime.api.applyGameMessage({
    type: "init_character_data",
    characterID: "queue-order-character",
    characterSkills: [],
    characterItems: [],
    characterActions: [
      { id: 1, actionHrid: "/actions/first", ordinal: 1, currentCount: 0 },
      { id: "2", actionHrid: "/actions/second", ordinal: 2 },
      { id: 1, currentCount: 3 },
    ],
  });
  assert.equal(runtime.state.currentActionsHridList.length, 2);
  assert.equal(runtime.state.currentActionsHridList[0].currentCount, 3);

  runtime.api.applyGameMessage({
    type: "actions_updated",
    endCharacterActions: [
      { id: "1", ordinal: 3, currentCount: 4 },
      { id: 2, ordinal: 1, currentCount: 2 },
    ],
  });
  assert.deepEqual(
    runtime.state.currentActionsHridList.map(
      ({ id, ordinal, currentCount }) => [String(id), ordinal, currentCount],
    ),
    [
      ["2", 1, 2],
      ["1", 3, 4],
    ],
  );

  runtime.api.applyGameMessage({
    type: "actions_updated",
    endCharacterActions: [{ id: "2", isDone: true }],
  });
  assert.deepEqual(
    runtime.state.currentActionsHridList.map(({ id }) => String(id)),
    ["1"],
  );
});

test("character game mode and labyrinth activity follow authoritative messages", () => {
  runtime.api.applyGameMessage({
    type: "init_character_data",
    character: { id: "iron-1", gameMode: "ironcow" },
    characterSkills: [],
    characterItems: [],
    characterActions: [],
    labyrinth: { isActive: true },
  });
  assert.equal(runtime.state.currentCharacterGameMode, "ironcow");
  assert.equal(runtime.state.labyrinthActive, true);

  runtime.api.applyGameMessage({
    type: "labyrinth_updated",
    labyrinth: { isActive: false },
  });
  assert.equal(runtime.state.labyrinthActive, false);

  runtime.api.applyGameMessage({
    type: "init_character_data",
    character: { id: "iron-2", gameMode: "legacy_ironcow" },
    characterSkills: [],
    characterItems: [],
    characterActions: [],
  });
  assert.equal(runtime.state.currentCharacterGameMode, "legacy_ironcow");
  assert.equal(runtime.state.labyrinthActive, false);
});

test("authoritative action buffs and skill levels stay current", () => {
  runtime.api.applyGameMessage({
    type: "init_character_data",
    characterSkills: [
      { skillHrid: "/skills/crafting", level: 100, experience: 1_000 },
    ],
    characterItems: [],
    characterActions: [],
    characterQuests: [],
    actionTypeDrinkSlotsMap: {
      "/action_types/crafting": [{ itemHrid: "/items/old_tea" }],
    },
    communityActionTypeBuffsMap: {
      "/action_types/crafting": [
        { typeHrid: "/buff_types/efficiency", flatBoost: 0.1 },
      ],
    },
    equipmentActionTypeBuffsMap: {
      "/action_types/crafting": [
        { typeHrid: "/buff_types/efficiency", flatBoost: 0.2 },
      ],
    },
    equipmentTaskActionBuffs: [
      { typeHrid: "/buff_types/task_action_speed", flatBoost: 0.3 },
    ],
  });

  runtime.api.applyGameMessage({
    type: "community_buffs_updated",
    communityActionTypeBuffsMap: {
      "/action_types/crafting": [
        { typeHrid: "/buff_types/efficiency", flatBoost: 0.15 },
      ],
    },
  });
  runtime.api.applyGameMessage({
    type: "action_type_consumable_slots_updated",
    actionTypeDrinkSlotsMap: {
      "/action_types/crafting": [{ itemHrid: "/items/new_tea" }],
    },
    consumableActionTypeBuffsMap: {},
  });
  runtime.api.applyGameMessage({
    type: "equipment_buffs_updated",
    equipmentActionTypeBuffsMap:
      runtime.state.actionTypeBuffSources.equipmentActionTypeBuffsMap,
  });
  runtime.api.applyGameMessage({
    type: "skills_updated",
    endCharacterSkills: [
      { skillHrid: "/skills/crafting", level: 101, experience: 2_000 },
    ],
  });

  assert.equal(
    runtime.state.actionTypeBuffSources.communityActionTypeBuffsMap[
      "/action_types/crafting"
    ][0].flatBoost,
    0.15,
  );
  assert.equal(
    runtime.state.actionTypeBuffSources.equipmentActionTypeBuffsMap[
      "/action_types/crafting"
    ][0].flatBoost,
    0.2,
  );
  assert.equal(runtime.state.equipmentTaskActionBuffs[0].flatBoost, 0.3);
  assert.equal(runtime.state.initData_characterSkills[0].level, 101);
  assert.deepEqual(
    runtime.state.initData_actionTypeDrinkSlotsMap["/action_types/crafting"],
    [{ itemHrid: "/items/new_tea" }],
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

test("quest updates merge in place and claimed quests are removed", () => {
  runtime.api.applyGameMessage({
    type: "init_character_data",
    characterID: "character-1",
    characterSkills: [],
    characterItems: [],
    characterActions: [],
    characterQuests: [
      { id: "q1", currentCount: 1 },
      { id: "q2", currentCount: 2 },
    ],
  });
  runtime.api.applyGameMessage({
    type: "quests_updated",
    endCharacterQuests: [
      { id: "q1", currentCount: 4 },
      { id: "q2", isClaimed: true },
      { id: "q3", currentCount: 0 },
    ],
  });
  assert.deepEqual(
    runtime.state.characterQuests.map(({ id, currentCount }) => ({
      id,
      currentCount,
    })),
    [
      { id: "q1", currentCount: 4 },
      { id: "q3", currentCount: 0 },
    ],
  );
});

test("guild members and guild leaderboard use normalized state only for guild rows", () => {
  runtime.api.applyGameMessage({
    type: "guild_characters_updated",
    guildCharacters: [{ id: "member-1", guildExperience: 100 }],
  });
  assert.equal(runtime.state.guildCharacters[0].id, "member-1");

  runtime.api.applyGameMessage({
    type: "leaderboard_updated",
    category: "guild",
    entries: [{ id: "guild-1", guildExperience: 1_000 }],
  });
  assert.equal(runtime.state.guildLeaderboard[0].id, "guild-1");
  runtime.api.applyGameMessage({
    type: "leaderboard_updated",
    category: "skills",
    entries: [{ id: "player-1" }],
  });
  assert.equal(runtime.state.guildLeaderboard[0].id, "guild-1");
});

test("guild member normalization preserves the sharable activity status", () => {
  runtime.api.applyGameMessage({
    type: "guild_characters_updated",
    guildCharacterMap: {
      42: { characterID: 42, guildExperience: 1234 },
    },
    guildSharableCharacterMap: {
      42: {
        name: "Working Member",
        isOnline: true,
        hideOnlineStatus: false,
        actionType: "/action_types/crafting",
      },
    },
  });

  assert.deepEqual(runtime.state.guildCharacters, [
    {
      characterID: 42,
      guildExperience: 1234,
      name: "Working Member",
      isOnline: true,
      hideOnlineStatus: false,
      actionType: "/action_types/crafting",
    },
  ]);
});
