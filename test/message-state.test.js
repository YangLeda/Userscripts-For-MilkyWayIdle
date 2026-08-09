import assert from "node:assert/strict";
import test from "node:test";

import { runtime } from "../src/core/runtime.js";
import "../src/data/translations.js";
import "../src/core/state.js";
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
      actionCategoryDetailMap: {},
      abilityDetailMap: {},
    }),
  );

  assert.equal(observedName, "Coin");
  assert.equal(runtime.state.itemEnNameToHridMap.Coin, "/items/coin");
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
