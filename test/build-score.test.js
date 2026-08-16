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
  "/items/chance_cape": {
    equipmentDetail: {
      type: "/equipment_types/back",
      combatStats: {},
      noncombatStats: { alchemySpeed: 0.05 },
      combatEnhancementBonuses: {},
      noncombatEnhancementBonuses: { alchemySpeed: 0.005 },
    },
  },
  "/items/chance_cape_refined": {
    equipmentDetail: {
      type: "/equipment_types/back",
      combatStats: {},
      noncombatStats: { alchemySpeed: 0.058 },
      combatEnhancementBonuses: {},
      noncombatEnhancementBonuses: { alchemySpeed: 0.0058 },
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
runtime.state.guild = { id: 1 };
runtime.state.guildDataLoaded = true;
runtime.state.guildBuffLevels = {
  "/guild_buffs/force_combat": 2,
  "/guild_buffs/force_skilling": 3,
};
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
const profileGuildBuffLevels = {
  "/guild_buffs/force_combat": 4,
  "/guild_buffs/force_skilling": 5,
};
runtime.api.getGuildShrineValues = (guildBuffLevels) => {
  if (guildBuffLevels === profileGuildBuffLevels) {
    return { battle: 4_000_000, skilling: 5_000_000, total: 9_000_000 };
  }
  return { battle: 2_000_000, skilling: 3_000_000, total: 5_000_000 };
};

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

test("all refined and non-refined cape states contribute to equipped score", () => {
  const originalGetAssetValue = runtime.api.getAssetValue;
  const values = new Map([
    ["/items/chance_cape:0", 10_000_000],
    ["/items/chance_cape:5", 20_000_000],
    ["/items/chance_cape_refined:0", 30_000_000],
    ["/items/chance_cape_refined:5", 40_000_000],
  ]);
  runtime.api.getAssetValue = (itemHrid, enhancementLevel) =>
    values.get(`${itemHrid}:${enhancementLevel}`) ?? 0;

  assert.deepEqual(
    runtime.api.calculateGearScores(
      [...values.keys()].map((key) => {
        const [itemHrid, enhancementLevel] = key.split(":");
        return {
          itemHrid,
          itemLocationHrid: "/item_locations/back",
          enhancementLevel: Number(enhancementLevel),
          count: 1,
        };
      }),
    ),
    {
      combatEquipment: 0,
      skillingTools: 0,
      skillingEquipment: 100,
    },
  );

  runtime.api.getAssetValue = originalGetAssetValue;
});

test("all equipment reminder items contribute to skilling equipment score", () => {
  const reminderItems = [
    [
      "/items/red_culinary_hat",
      "/item_locations/head",
      { cookingEfficiency: 0.1, brewingEfficiency: 0.1 },
      10_000_000,
    ],
    [
      "/items/eye_watch",
      "/item_locations/off_hand",
      { craftingEfficiency: 0.1 },
      20_000_000,
    ],
    [
      "/items/collectors_boots",
      "/item_locations/feet",
      { woodcuttingEfficiency: 0.1 },
      30_000_000,
    ],
    [
      "/items/enchanted_gloves",
      "/item_locations/hands",
      { enhancingSpeed: 0.1 },
      40_000_000,
    ],
  ];

  for (const [itemHrid, , noncombatStats, fairValue] of reminderItems) {
    runtime.state.initData_itemDetailMap[itemHrid] = {
      equipmentDetail: {
        combatStats: {},
        noncombatStats,
        combatEnhancementBonuses: {},
        noncombatEnhancementBonuses: {},
      },
    };
    runtime.state.marketItemValues[itemHrid] = { 0: fairValue };
  }

  try {
    const items = reminderItems.map(([itemHrid, itemLocationHrid]) => ({
      itemHrid,
      itemLocationHrid,
      enhancementLevel: 0,
      count: 1,
    }));
    assert.deepEqual(runtime.api.calculateGearScores(items), {
      combatEquipment: 0,
      skillingTools: 0,
      skillingEquipment: 100,
    });
    for (const item of items) {
      assert.deepEqual(runtime.api.classifyEquippedItem(item), {
        isTool: false,
        isCombat: false,
        isSkilling: true,
      });
    }
  } finally {
    for (const [itemHrid] of reminderItems) {
      delete runtime.state.initData_itemDetailMap[itemHrid];
      delete runtime.state.marketItemValues[itemHrid];
    }
  }
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
    shrine: 2,
    total: 49,
  });
  assert.deepEqual(scores.skilling, {
    house: 10,
    tools: 49,
    equipment: 50,
    shrine: 3,
    available: true,
    total: 112,
  });
  assert.deepEqual(scores.assets, { allHouses: 17, allAbilities: 0 });
});

test("profile scores include tools and show unavailable values when hidden", async () => {
  const publicProfile = {
    profile: {
      guildId: 2,
      guildBuffLevelMap: profileGuildBuffLevels,
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
  assert.equal(publicScores.battle.shrine, 4);
  assert.equal(publicScores.skilling.shrine, 5);
  assert.equal(publicScores.battle.total, 51);
  assert.equal(publicScores.skilling.total, 114);

  const unguildedScores = await runtime.api.getBuildScoreByProfile({
    profile: { ...publicProfile.profile, guildId: null },
  });
  assert.equal(unguildedScores.battle.shrine, null);
  assert.equal(unguildedScores.skilling.shrine, null);
  assert.equal(unguildedScores.battle.total, 47);
  assert.equal(unguildedScores.skilling.total, 109);

  const missingProfileShrines = await runtime.api.getBuildScoreByProfile({
    profile: {
      ...publicProfile.profile,
      guildBuffLevelMap: undefined,
    },
  });
  assert.equal(missingProfileShrines.battle.shrine, null);
  assert.equal(missingProfileShrines.skilling.shrine, null);
  assert.equal(missingProfileShrines.battle.total, 47);
  assert.equal(missingProfileShrines.skilling.total, 109);

  await runtime.api.showBuildScoreOnProfile(publicProfile);
  const profileScores = document.querySelector("#script_profile_gear_scores");
  assert.equal(profileScores.tagName, "SECTION");
  assert.match(profileScores.getAttribute("style"), /width: fit-content/);
  assert.match(profileScores.getAttribute("style"), /border-left: 2px solid/);
  assert.match(document.body.textContent, /战斗着装评分：\s*51\.0/);
  assert.match(document.body.textContent, /生活着装评分：\s*114/);
  assert.match(
    document.querySelector("#skillingScores_profile").textContent,
    /房屋：\s*10\.0/,
  );
  assert.match(document.body.textContent, /工具：\s*49\.0/);
  assert.match(document.body.textContent, /战斗神龛：\s*4\.0/);
  assert.match(document.body.textContent, /生活神龛：\s*5\.0/);
  const battleToggle = document.querySelector("#toggleScores_profile");
  const battleDetails = document.querySelector("#buildScores_profile");
  const battleIcon = battleToggle.querySelector(".mwi-profile-toggle-icon");
  const battleText = battleToggle.textContent;
  assert.equal(battleIcon.textContent.trim(), "+");
  battleToggle.click();
  assert.equal(battleDetails.style.display, "block");
  assert.equal(battleIcon.textContent, "↓");
  assert.equal(battleToggle.textContent.replace("↓", "+"), battleText);
  battleToggle.click();
  assert.equal(battleDetails.style.display, "none");
  assert.equal(battleIcon.textContent, "+");

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
  assert.match(document.body.textContent, /战斗着装评分：\s*11\.0（装备隐藏）/);
  assert.match(document.body.textContent, /生活着装评分：\s*-（装备隐藏）/);
  assert.match(
    document.querySelector("#buildScores_profile").textContent,
    /技能：\s*-/,
  );
  assert.match(
    document.querySelector("#skillingScores_profile").textContent,
    /工具：\s*-/,
  );
  assert.match(
    document.querySelector("#skillingScores_profile").textContent,
    /房屋：\s*10\.0/,
  );
  assert.match(document.body.textContent, /战斗神龛：\s*4\.0/);
  assert.match(document.body.textContent, /生活神龛：\s*5\.0/);
  assert.doesNotMatch(document.body.textContent, /战力打造分/);

  runtime.config.isZH = false;
  await runtime.api.showBuildScoreOnProfile(publicProfile);
  assert.match(document.body.textContent, /Combat Gear Score:\s*51\.0/);
  assert.match(document.body.textContent, /Skilling Gear Score:\s*114/);
  assert.match(document.body.textContent, /House:\s*7\.0/);
  assert.match(document.body.textContent, /Abilities:\s*0\.0/);
  assert.match(document.body.textContent, /Combat shrine:\s*4\.0/);
  assert.match(document.body.textContent, /Skilling shrine:\s*5\.0/);
});

test("score formatting keeps one decimal through 100 and groups larger integers", () => {
  assert.equal(runtime.api.formatScore(99.94), "99.9");
  assert.equal(runtime.api.formatScore(100), "100.0");
  assert.equal(runtime.api.formatScore(100.5), "101");
  assert.equal(runtime.api.formatScore(5_190_829_858_634), "5,190,829,858,634");
});
