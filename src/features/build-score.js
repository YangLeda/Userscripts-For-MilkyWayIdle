import { runtime } from "../core/runtime.js";

const SCORE_UNIT = 1000000;

function hasStats(stats) {
  return Boolean(stats && Object.keys(stats).length);
}

function classifyEquippedItem(item) {
  const locationDetail =
    runtime.state.initData_itemLocationDetailMap?.[item.itemLocationHrid];
  const equipmentDetail =
    runtime.state.initData_itemDetailMap?.[item.itemHrid]?.equipmentDetail;
  const isTool = locationDetail?.isTool === true;

  return {
    isTool,
    isCombat:
      !isTool &&
      (hasStats(equipmentDetail?.combatStats) ||
        hasStats(equipmentDetail?.combatEnhancementBonuses)),
    isSkilling:
      isTool ||
      hasStats(equipmentDetail?.noncombatStats) ||
      hasStats(equipmentDetail?.noncombatEnhancementBonuses),
  };
}

function isCombatHouse(house) {
  return Boolean(
    runtime.state.initData_houseRoomDetailMap?.[house.houseRoomHrid]
      ?.usableInActionTypeMap?.["/action_types/combat"],
  );
}

function isSkillingHouse(house) {
  const usableInActionTypeMap =
    runtime.state.initData_houseRoomDetailMap?.[house.houseRoomHrid]
      ?.usableInActionTypeMap;
  return Object.entries(usableInActionTypeMap ?? {}).some(
    ([actionTypeHrid, isUsable]) =>
      actionTypeHrid !== "/action_types/combat" && Boolean(isUsable),
  );
}

function createEmptyGearScores() {
  return {
    combatEquipment: 0,
    skillingTools: 0,
    skillingEquipment: 0,
  };
}

function calculateGearScores(items) {
  const scores = createEmptyGearScores();

  for (const item of items ?? []) {
    if (item.itemLocationHrid === "/item_locations/inventory") continue;

    const classification = classifyEquippedItem(item);
    if (
      !classification.isTool &&
      !classification.isCombat &&
      !classification.isSkilling
    ) {
      continue;
    }

    const fairValue = runtime.api.getAssetValue
      ? runtime.api.getAssetValue(item.itemHrid, item.enhancementLevel, {
          itemLocationHrid: item.itemLocationHrid,
        })
      : runtime.api.getFairValue(item.itemHrid, item.enhancementLevel);
    if (!(fairValue > 0)) {
      continue;
    }

    const value = Number(item.count ?? 1) * fairValue;
    if (classification.isCombat) scores.combatEquipment += value;
    if (classification.isTool) scores.skillingTools += value;
    else if (classification.isSkilling) scores.skillingEquipment += value;
  }

  for (const key of Object.keys(scores)) scores[key] /= SCORE_UNIT;
  return scores;
}

async function calculateHouseScores(characterHouseRoomMap) {
  let combat = 0;
  let skilling = 0;
  let all = 0;

  for (const house of Object.values(characterHouseRoomMap ?? {})) {
    const value = (await getHouseFullBuildPrice(house)) / SCORE_UNIT;
    all += value;
    if (isCombatHouse(house)) combat += value;
    if (isSkillingHouse(house)) skilling += value;
  }

  return { combat, skilling, all };
}

function createScoreResult({
  houseScores,
  abilityScore,
  allAbilityScore,
  gearScores,
  equipmentHidden = false,
}) {
  const battle = {
    house: houseScores.combat,
    abilities: abilityScore,
    equipment: gearScores.combatEquipment,
  };
  battle.total = battle.house + battle.abilities + battle.equipment;

  const skilling = {
    house: houseScores.skilling,
    tools: gearScores.skillingTools,
    equipment: gearScores.skillingEquipment,
    available: !equipmentHidden,
  };
  skilling.total = skilling.house + skilling.tools + skilling.equipment;

  return {
    battle,
    skilling,
    assets: {
      allHouses: houseScores.all,
      allAbilities: allAbilityScore,
    },
    equipmentHidden,
  };
}

/* 计算着装评分 */
// BuildScore algorithm by Ratatatata (https://greasyfork.org/zh-CN/scripts/511240)
async function getSelfBuildScores() {
  const houseScores = await calculateHouseScores(
    runtime.state.initData_characterHouseRoomMap,
  );
  const gearScores = calculateGearScores(runtime.state.initData_characterItems);

  // 技能分：当前使用的战斗技能所需技能书总价，单位M
  let abilityScore = 0;
  try {
    abilityScore = await calculateAbilityScore();
  } catch (error) {
    console.error("Error in calculateAbilityScore()", error);
  }
  // console.log("abilityScore " + abilityScore);

  // 总技能分：全部已学技能所需技能书总价，单位M
  let allAbilityScore = 0;
  try {
    allAbilityScore = await calculateAbilityScore(true);
  } catch (error) {
    console.error("Error in calculateAbilityScore(true)", error);
  }
  // console.log("allAbilityScore " + allAbilityScore);

  return createScoreResult({
    houseScores,
    abilityScore,
    allAbilityScore,
    gearScores,
  });
}

// 计算单个房子完整造价
async function getHouseFullBuildPrice(house) {
  if (!(await runtime.api.ensureMarketValueSource())) return 0;
  let houseDetail =
    runtime.state.initData_houseRoomDetailMap?.[house.houseRoomHrid];
  if (!houseDetail) {
    try {
      houseDetail = JSON.parse(GM_getValue("init_client_data", "{}"))
        .houseRoomDetailMap?.[house.houseRoomHrid];
    } catch {
      return 0;
    }
  }
  const upgradeCostsMap = houseDetail?.upgradeCostsMap;
  if (!upgradeCostsMap) return 0;
  const level = house.level;

  let cost = 0;
  for (let i = 1; i <= level; i++) {
    for (const item of upgradeCostsMap[i] ?? []) {
      const fairValue = runtime.api.getFairValue(item.itemHrid, 0);
      if (fairValue > 0) {
        cost += item.count * fairValue;
      }
    }
  }
  return cost;
}

function getWeightedMarketPrice(marketPrices, ratio = 0.5) {
  let ask = marketPrices[0].a;
  let bid = marketPrices[0].b;
  if (ask > 0 && bid < 0) {
    bid = ask;
  }
  if (bid > 0 && ask < 0) {
    ask = bid;
  }
  const weightedPrice = ask * ratio + bid * (1 - ratio);
  return weightedPrice;
}

// 技能价格计算
async function calculateAbilityScore(isAll = false) {
  const levelExperienceTable = runtime.state.initData_levelExperienceTable;
  const abilities = isAll
    ? runtime.state.initData_characterAbilities
    : runtime.state.initData_combatAbilities;
  if (!levelExperienceTable || !Array.isArray(abilities)) return 0;

  if (!(await runtime.api.ensureMarketValueSource())) return 0;
  let exp_50_skill = [
    "poke",
    "scratch",
    "smack",
    "quick_shot",
    "water_strike",
    "fireball",
    "entangle",
    "minor_heal",
  ];
  const getNeedBooksToLevel = (targetLevel, abilityPerBookExp) => {
    const needExp = levelExperienceTable[targetLevel];
    if (!Number.isFinite(needExp)) return 0;
    let needBooks = needExp / abilityPerBookExp;
    needBooks += 1;
    return needBooks.toFixed(1);
  };
  // 技能净值
  let price = 0;
  abilities.forEach((item) => {
    let numBooks = 0;
    if (exp_50_skill.some((skill) => item.abilityHrid.includes(skill))) {
      numBooks = getNeedBooksToLevel(item.level, 50);
    } else {
      numBooks = getNeedBooksToLevel(item.level, 500);
    }
    const itemHrid = item.abilityHrid.replace("/abilities/", "/items/");
    const fairValue = runtime.api.getFairValue(itemHrid, 0);
    if (fairValue > 0) {
      price += numBooks * fairValue;
    }
    // console.log(`技能:${itemHrid},价值${numBooks * (marketPrices[0].b > 0 ? marketPrices[0].b : 0)}`)
  });

  return (price /= 1000000);
}

/* 查看人物面板显示打造分 */
// by Ratatatata (https://greasyfork.org/zh-CN/scripts/511240)
function getInfoPanel() {
  const selectedElement = document.querySelector(
    `div.SharableProfile_overviewTab__W4dCV`,
  );
  if (selectedElement) {
    return selectedElement;
  } else {
    return new Promise((resolve) => {
      setTimeout(() => resolve(getInfoPanel()), 500);
    });
  }
}

async function showBuildScoreOnProfile(profile_shared_obj) {
  const scores = await getBuildScoreByProfile(profile_shared_obj);
  const hiddenText = scores.equipmentHidden
    ? runtime.config.isZH
      ? "（装备隐藏）"
      : " (Equipment hidden)"
    : "";
  const hiddenValue = scores.equipmentHidden ? "-" : null;

  const panel = await getInfoPanel();
  panel.style.height = "auto";
  panel.querySelector("#script_profile_gear_scores")?.remove();
  panel.insertAdjacentHTML(
    "beforeend",
    `<div id="script_profile_gear_scores" style="text-align: left; color: ${runtime.config.SCRIPT_COLOR_MAIN}; font-size: 0.875rem;">
            <div style="cursor: pointer; font-weight: bold" id="toggleScores_profile">${
              runtime.config.isZH ? "+ 战斗着装评分：" : "+ Combat Gear Score: "
            }${runtime.api.formatScore(scores.battle.total)}${hiddenText}</div>
            <div id="buildScores_profile" style="display: none; margin-left: 20px;">
                    <div>${runtime.config.isZH ? "房屋：" : "House: "}${runtime.api.formatScore(scores.battle.house)}</div>
                    <div>${runtime.config.isZH ? "技能：" : "Abilities: "}${hiddenValue ?? runtime.api.formatScore(scores.battle.abilities)}</div>
                    <div>${runtime.config.isZH ? "装备：" : "Equipment: "}${hiddenValue ?? runtime.api.formatScore(scores.battle.equipment)}</div>
            </div>
            <div style="cursor: pointer; font-weight: bold" id="toggleSkillingScores_profile">${
              runtime.config.isZH
                ? "+ 生活着装评分："
                : "+ Skilling Gear Score: "
            }${hiddenValue ?? runtime.api.formatScore(scores.skilling.total)}${hiddenText}</div>
            <div id="skillingScores_profile" style="display: none; margin-left: 20px;">
                    <div>${runtime.config.isZH ? "房屋：" : "House: "}${runtime.api.formatScore(scores.skilling.house)}</div>
                    <div>${runtime.config.isZH ? "工具：" : "Tools: "}${hiddenValue ?? runtime.api.formatScore(scores.skilling.tools)}</div>
                    <div>${runtime.config.isZH ? "装备：" : "Equipment: "}${hiddenValue ?? runtime.api.formatScore(scores.skilling.equipment)}</div>
            </div>
        </div>`,
  );

  const bindToggle = (toggleId, detailsId, label, value) => {
    const toggle = document.getElementById(toggleId);
    const details = document.getElementById(detailsId);
    toggle.addEventListener("click", () => {
      const isCollapsed = details.style.display === "none";
      details.style.display = isCollapsed ? "block" : "none";
      toggle.textContent =
        (isCollapsed ? "↓ " : "+ ") + label + value + hiddenText;
    });
  };
  bindToggle(
    "toggleScores_profile",
    "buildScores_profile",
    runtime.config.isZH ? "战斗着装评分：" : "Combat Gear Score: ",
    runtime.api.formatScore(scores.battle.total),
  );
  bindToggle(
    "toggleSkillingScores_profile",
    "skillingScores_profile",
    runtime.config.isZH ? "生活着装评分：" : "Skilling Gear Score: ",
    hiddenValue ?? runtime.api.formatScore(scores.skilling.total),
  );
}

// 计算他人资料着装评分
async function getBuildScoreByProfile(profile_shared_obj) {
  const profile = profile_shared_obj.profile;
  const houseScores = await calculateHouseScores(profile.characterHouseRoomMap);
  const equipmentHidden = profile.hideWearableItems === true;
  const emptyGearScores = createEmptyGearScores();
  if (equipmentHidden) {
    return createScoreResult({
      houseScores,
      abilityScore: 0,
      allAbilityScore: 0,
      gearScores: emptyGearScores,
      equipmentHidden: true,
    });
  }

  let abilityScore = 0;
  try {
    abilityScore = await calculateSkill(profile_shared_obj);
  } catch (error) {
    console.error("Error in calculate skill:", error);
  }

  let gearScores = emptyGearScores;
  try {
    gearScores = await calculateEquipment(profile_shared_obj);
  } catch (error) {
    console.error("Error in calculateEquipment:", error);
  }

  return createScoreResult({
    houseScores,
    abilityScore,
    allAbilityScore: 0,
    gearScores,
  });
}

// 技能价格计算
async function calculateSkill(profile_shared_obj) {
  if (!(await runtime.api.ensureMarketValueSource())) return 0;
  let obj = profile_shared_obj.profile;
  let exp_50_skill = [
    "poke",
    "scratch",
    "smack",
    "quick_shot",
    "water_strike",
    "fireball",
    "entangle",
    "minor_heal",
  ];
  const getNeedBooksToLevel = (targetLevel, abilityPerBookExp) => {
    const needExp = runtime.state.initData_levelExperienceTable[targetLevel];
    let needBooks = needExp / abilityPerBookExp;
    needBooks += 1;
    return needBooks.toFixed(1);
  };
  // 技能净值
  let price = 0;
  obj.equippedAbilities.forEach((item) => {
    let numBooks = 0;
    if (exp_50_skill.some((skill) => item.abilityHrid.includes(skill))) {
      numBooks = getNeedBooksToLevel(item.level, 50);
    } else {
      numBooks = getNeedBooksToLevel(item.level, 500);
    }
    const itemHrid = item.abilityHrid.replace("/abilities/", "/items/");
    const fairValue = runtime.api.getFairValue(itemHrid, 0);
    if (fairValue > 0) {
      price += numBooks * fairValue;
    }
    // console.log(`技能:${itemHrid},价值${numBooks * (marketPrices[0].b > 0 ? marketPrices[0].b : 0)}`)
  });

  return (price /= 1000000);
}

// 装备价格和战斗/生活分类计算
async function calculateEquipment(profile_shared_obj) {
  if (!(await runtime.api.ensureMarketValueSource()))
    return createEmptyGearScores();
  return calculateGearScores(
    Object.values(profile_shared_obj.profile.wearableItemMap ?? {}),
  );
}

Object.assign(runtime.api, {
  getSelfBuildScores,
  getHouseFullBuildPrice,
  getWeightedMarketPrice,
  classifyEquippedItem,
  isCombatHouse,
  isSkillingHouse,
  calculateGearScores,
  calculateHouseScores,
  calculateAbilityScore,
  getInfoPanel,
  showBuildScoreOnProfile,
  getBuildScoreByProfile,
  calculateSkill,
  calculateEquipment,
});
