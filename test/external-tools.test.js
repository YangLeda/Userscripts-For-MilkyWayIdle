import assert from "node:assert/strict";
import test from "node:test";

const storage = new Map();

globalThis.GM_getValue = (key, fallback) =>
  storage.has(key) ? storage.get(key) : fallback;
globalThis.GM_setValue = (key, value) => {
  storage.set(key, value);
};

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/message-state.js");
await import("../src/core/messages.js");
await import("../src/features/external-tools.js");
await import("../src/features/message-effects.js");

function setGroupFixtures(battle) {
  const character = {
    character: { id: "self", name: "Self" },
    characterSkills: [],
    characterItems: [],
    characterActions: [],
    actionTypeFoodSlotsMap: { "/action_types/combat": [] },
    actionTypeDrinkSlotsMap: { "/action_types/combat": [] },
    combatUnit: { combatAbilities: [] },
    abilityCombatTriggersMap: {},
    consumableCombatTriggersMap: {},
    characterHouseRoomMap: {},
    characterAchievements: {},
    partyInfo: {
      partySlotMap: {
        1: { characterID: "self" },
        2: { characterID: "ally" },
      },
      party: {
        actionHrid: "/actions/combat/fly",
        difficultyTier: 0,
      },
    },
  };
  const client = {
    actionDetailMap: {
      "/actions/combat/fly": { combatZoneInfo: { isDungeon: false } },
    },
    abilityDetailMap: {},
  };
  const profile = {
    characterID: "ally",
    characterName: "Ally",
    profile: {
      characterSkills: [],
      wearableItemMap: {
        "/item_locations/main_hand": {
          itemLocationHrid: "/item_locations/main_hand",
          itemHrid: "/items/enchanted_bow",
          enhancementLevel: 8,
        },
      },
      equippedAbilities: [],
      abilityCombatTriggersMap: {},
      consumableCombatTriggersMap: {},
      characterHouseRoomMap: {},
      characterAchievements: {},
    },
  };

  storage.set("init_character_data", JSON.stringify(character));
  storage.set("init_client_data", JSON.stringify(client));
  storage.set("profile_export_list", JSON.stringify([profile]));
  if (battle) storage.set("new_battle", JSON.stringify(battle));
  else storage.delete("new_battle");
}

function exportedAlly() {
  const [players] = runtime.api.constructGroupExportObj();
  return JSON.parse(players[2]);
}

test("new battle persistence replaces the previous raw snapshot", () => {
  storage.clear();
  const first = JSON.stringify({
    type: "new_battle",
    players: [{ character: { id: "first" } }],
  });
  const second = JSON.stringify({
    type: "new_battle",
    players: [{ character: { id: "second" } }],
  });

  runtime.api.handleMessage(first);
  runtime.api.handleMessage(second);

  assert.equal(storage.size, 1);
  assert.equal(storage.get("new_battle"), second);
});

test("group export uses teammate food and coffee from the latest battle", () => {
  storage.clear();
  setGroupFixtures({
    type: "new_battle",
    players: [
      {
        character: { id: "ally" },
        combatConsumables: [
          { itemHrid: "/items/channeling_coffee" },
          { itemHrid: "/items/star_fruit_yogurt" },
        ],
      },
    ],
  });

  const ally = exportedAlly();

  assert.deepEqual(ally.drinks["/action_types/combat"], [
    { itemHrid: "/items/channeling_coffee" },
  ]);
  assert.deepEqual(ally.food["/action_types/combat"], [
    { itemHrid: "/items/star_fruit_yogurt" },
  ]);
});

for (const [name, battle] of [
  ["no battle snapshot", null],
  [
    "a snapshot without the teammate",
    {
      type: "new_battle",
      players: [{ character: { id: "self" }, combatConsumables: [] }],
    },
  ],
]) {
  test(`group export falls back safely with ${name}`, () => {
    storage.clear();
    setGroupFixtures(battle);

    let ally;
    assert.doesNotThrow(() => {
      ally = exportedAlly();
    });

    assert.deepEqual(ally.drinks["/action_types/combat"], [
      { itemHrid: "/items/wisdom_coffee" },
      { itemHrid: "/items/super_ranged_coffee" },
      { itemHrid: "/items/critical_coffee" },
    ]);
  });
}
