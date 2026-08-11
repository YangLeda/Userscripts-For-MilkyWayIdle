import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  '<!doctype html><body><div class="SharableProfile_overviewTab__W4dCV"></div></body>',
  { url: "https://test.milkywayidle.com/" },
);
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.window = dom.window;
globalThis.setTimeout = () => 0;
globalThis.GM_getValue = (_key, fallback) => fallback;

localStorage.setItem("i18nextLng", "zh-CN");

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
await import("../src/features/build-score.js");

const combatHouseHrids = Array.from(
  { length: 7 },
  (_, index) => `/house_rooms/combat_${index}`,
);
const skillingHouseHrids = Array.from(
  { length: 10 },
  (_, index) => `/house_rooms/skilling_${index}`,
);
const allHouseHrids = [...combatHouseHrids, ...skillingHouseHrids];

runtime.state.initData_itemLocationDetailMap = {
  "/item_locations/main_hand": { isTool: false },
  "/item_locations/body": { isTool: false },
  "/item_locations/back": { isTool: false },
  "/item_locations/ring": { isTool: false },
  "/item_locations/alchemy_tool": { isTool: true },
  "/item_locations/inventory": { isTool: false },
};
runtime.state.initData_itemDetailMap = {
  "/items/combat_sword": {
    equipmentDetail: {
      combatStats: { slashDamage: 1 },
      noncombatStats: {},
      combatEnhancementBonuses: {},
      noncombatEnhancementBonuses: {},
    },
  },
  "/items/skilling_apron": {
    equipmentDetail: {
      combatStats: {},
      noncombatStats: { cookingEfficiency: 1 },
      combatEnhancementBonuses: {},
      noncombatEnhancementBonuses: {},
    },
  },
  "/items/hybrid_ring": {
    equipmentDetail: {
      combatStats: { combatRareFind: 1 },
      noncombatStats: { skillingRareFind: 1 },
      combatEnhancementBonuses: {},
      noncombatEnhancementBonuses: {},
    },
  },
  "/items/future_combat_tool": {
    equipmentDetail: {
      combatStats: { attackSpeed: 1 },
      noncombatStats: { alchemySpeed: 1 },
      combatEnhancementBonuses: { attackSpeed: 1 },
      noncombatEnhancementBonuses: {},
    },
  },
  "/items/unknown_equipment": { equipmentDetail: {} },
  "/items/artificer_cape_refined": {
    equipmentDetail: {
      type: "/equipment_types/back",
      combatStats: {},
      noncombatStats: { craftingSpeed: 0.058 },
      combatEnhancementBonuses: {},
      noncombatEnhancementBonuses: { craftingSpeed: 0.0058 },
    },
  },
};
runtime.state.initData_houseRoomDetailMap = Object.fromEntries(
  allHouseHrids.map((houseHrid) => [
    houseHrid,
    {
      usableInActionTypeMap: {
        "/action_types/combat": combatHouseHrids.includes(houseHrid),
        "/action_types/crafting": skillingHouseHrids.includes(houseHrid),
      },
      upgradeCostsMap: {
        1: [{ itemHrid: "/items/coin", count: 1 }],
      },
    },
  ]),
);
runtime.state.initData_characterHouseRoomMap = Object.fromEntries(
  allHouseHrids.map((houseRoomHrid) => [
    houseRoomHrid,
    { houseRoomHrid, level: 1 },
  ]),
);
runtime.state.initData_characterItems = [
  {
    itemHrid: "/items/combat_sword",
    itemLocationHrid: "/item_locations/main_hand",
    enhancementLevel: 1,
    count: 1,
  },
  {
    itemHrid: "/items/skilling_apron",
    itemLocationHrid: "/item_locations/body",
    enhancementLevel: 2,
    count: 1,
  },
  {
    itemHrid: "/items/hybrid_ring",
    itemLocationHrid: "/item_locations/ring",
    enhancementLevel: 3,
    count: 1,
  },
  {
    itemHrid: "/items/future_combat_tool",
    itemLocationHrid: "/item_locations/alchemy_tool",
    enhancementLevel: 4,
    count: 1,
  },
  {
    itemHrid: "/items/unknown_equipment",
    itemLocationHrid: "/item_locations/back",
    enhancementLevel: 0,
    count: 1,
  },
];
runtime.state.initData_combatAbilities = [];
runtime.state.initData_characterAbilities = [];
runtime.state.initData_levelExperienceTable = [0];
runtime.state.marketItemValues = {
  "/items/coin": { 0: 1_000_000 },
  "/items/combat_sword": { 1: 10_000_000 },
  "/items/skilling_apron": { 2: 20_000_000 },
  "/items/hybrid_ring": { 3: 30_000_000 },
  "/items/future_combat_tool": { 4: 40_000_000 },
  "/items/unknown_equipment": { 0: 50_000_000 },
  "/items/artificer_cape_refined": { 6: 12_000_000 },
};
const additionalToolTypes = [
  "milking",
  "foraging",
  "woodcutting",
  "cheesesmithing",
  "crafting",
  "tailoring",
  "cooking",
  "brewing",
  "enhancing",
];
for (const toolType of additionalToolTypes) {
  const itemLocationHrid = `/item_locations/${toolType}_tool`;
  const itemHrid = `/items/${toolType}_tool`;
  runtime.state.initData_itemLocationDetailMap[itemLocationHrid] = {
    isTool: true,
  };
  runtime.state.initData_itemDetailMap[itemHrid] = {
    equipmentDetail: {
      combatStats: {},
      noncombatStats: { [`${toolType}Speed`]: 1 },
      combatEnhancementBonuses: {},
      noncombatEnhancementBonuses: {},
    },
  };
  runtime.state.marketItemValues[itemHrid] = { 0: 1_000_000 };
  runtime.state.initData_characterItems.push({
    itemHrid,
    itemLocationHrid,
    enhancementLevel: 0,
    count: 1,
  });
}
runtime.api.fetchMarketJSON = async () => ({ marketData: {} });

test("equipment data separates combat, skilling, tools and dual-use gear", () => {
  const scores = runtime.api.calculateGearScores(
    runtime.state.initData_characterItems,
  );

  assert.deepEqual(scores, {
    combatEquipment: 40,
    skillingTools: 49,
    skillingEquipment: 50,
  });
  assert.deepEqual(
    runtime.api.classifyEquippedItem(runtime.state.initData_characterItems[2]),
    { isTool: false, isCombat: true, isSkilling: true },
  );
  assert.deepEqual(
    runtime.api.classifyEquippedItem(runtime.state.initData_characterItems[3]),
    { isTool: true, isCombat: false, isSkilling: true },
  );
});

test("refined back equipment contributes its enhanced value to gear score", () => {
  assert.deepEqual(
    runtime.api.calculateGearScores([
      {
        itemHrid: "/items/artificer_cape_refined",
        itemLocationHrid: "/item_locations/back",
        enhancementLevel: 6,
        count: 1,
      },
    ]),
    {
      combatEquipment: 0,
      skillingTools: 0,
      skillingEquipment: 12,
    },
  );
});

test("combat and skilling houses are dynamic while all houses remain fixed assets", async () => {
  const houseScores = await runtime.api.calculateHouseScores(
    runtime.state.initData_characterHouseRoomMap,
  );
  assert.deepEqual(houseScores, { combat: 7, skilling: 10, all: 17 });

  const scores = await runtime.api.getSelfBuildScores();
  assert.deepEqual(scores.battle, {
    house: 7,
    abilities: 0,
    equipment: 40,
    total: 47,
  });
  assert.deepEqual(scores.skilling, {
    house: 10,
    tools: 49,
    equipment: 50,
    available: true,
    total: 109,
  });
  assert.deepEqual(scores.assets, { allHouses: 17, allAbilities: 0 });
});

test("profile scores include tools and show unavailable values when hidden", async () => {
  const publicProfile = {
    profile: {
      hideWearableItems: false,
      characterHouseRoomMap: runtime.state.initData_characterHouseRoomMap,
      wearableItemMap: Object.fromEntries(
        runtime.state.initData_characterItems.map((item) => [
          item.itemLocationHrid,
          item,
        ]),
      ),
      equippedAbilities: [],
    },
  };
  const publicScores = await runtime.api.getBuildScoreByProfile(publicProfile);
  assert.equal(publicScores.battle.total, 47);
  assert.equal(publicScores.skilling.total, 109);

  await runtime.api.showBuildScoreOnProfile(publicProfile);
  assert.match(document.body.textContent, /战斗着装评分：47\.0/);
  assert.match(document.body.textContent, /生活着装评分：109/);
  assert.match(
    document.querySelector("#skillingScores_profile").textContent,
    /房屋：10\.0/,
  );
  assert.match(document.body.textContent, /工具：49\.0/);

  const hiddenProfile = {
    profile: {
      ...publicProfile.profile,
      hideWearableItems: true,
      wearableItemMap: {},
      equippedAbilities: [],
    },
  };
  await runtime.api.showBuildScoreOnProfile(hiddenProfile);
  assert.equal(
    document.querySelectorAll("#script_profile_gear_scores").length,
    1,
  );
  assert.match(document.body.textContent, /战斗着装评分：7\.0（装备隐藏）/);
  assert.match(document.body.textContent, /生活着装评分：-（装备隐藏）/);
  assert.match(
    document.querySelector("#buildScores_profile").textContent,
    /技能：-/,
  );
  assert.match(
    document.querySelector("#skillingScores_profile").textContent,
    /工具：-/,
  );
  assert.match(
    document.querySelector("#skillingScores_profile").textContent,
    /房屋：10\.0/,
  );
  assert.doesNotMatch(document.body.textContent, /战力打造分/);

  runtime.config.isZH = false;
  await runtime.api.showBuildScoreOnProfile(publicProfile);
  assert.match(document.body.textContent, /Combat Gear Score: 47\.0/);
  assert.match(document.body.textContent, /Skilling Gear Score: 109/);
  assert.match(document.body.textContent, /House: 7\.0/);
  assert.match(document.body.textContent, /Abilities: 0\.0/);
});

test("score formatting keeps one decimal through 100 and groups larger integers", () => {
  assert.equal(runtime.api.formatScore(99.94), "99.9");
  assert.equal(runtime.api.formatScore(100), "100.0");
  assert.equal(runtime.api.formatScore(100.5), "101");
  assert.equal(runtime.api.formatScore(5_190_829_858_634), "5,190,829,858,634");
});
