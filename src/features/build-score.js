import { runtime } from "../core/runtime.js";

/* 计算打造分 */
// BuildScore algorithm by Ratatatata (https://greasyfork.org/zh-CN/scripts/511240)
async function getSelfBuildScores(equippedNetworth) {
  // 房子分：战斗相关房子升级所需总金币
  const battleHouses = [
    "dining_room",
    "library",
    "dojo",
    "gym",
    "armory",
    "archery_range",
    "mystical_study",
  ];
  let battleHouseScore = 0;
  let nonBattleHouseScore = 0;
  for (const key in runtime.state.initData_characterHouseRoomMap) {
    if (
      battleHouses.some((house) =>
        runtime.state.initData_characterHouseRoomMap[
          key
        ].houseRoomHrid.includes(house),
      )
    ) {
      battleHouseScore +=
        (await getHouseFullBuildPrice(
          runtime.state.initData_characterHouseRoomMap[key],
        )) / 1000000;
    } else {
      nonBattleHouseScore +=
        (await getHouseFullBuildPrice(
          runtime.state.initData_characterHouseRoomMap[key],
        )) / 1000000;
    }
  }

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

  // 装备分：当前身上装备总价，单位M
  let equipmentScore = equippedNetworth / 1000000;
  // console.log("equipmentScore " + equipmentScore);

  return [
    battleHouseScore,
    nonBattleHouseScore,
    abilityScore,
    allAbilityScore,
    equipmentScore,
  ];
}

// 计算单个房子完整造价
async function getHouseFullBuildPrice(house) {
  const marketAPIJson = await runtime.api.fetchMarketJSON();
  if (!marketAPIJson && !Object.keys(runtime.state.marketItemValues).length) {
    return 0;
  }
  const clientObj = JSON.parse(GM_getValue("init_client_data", ""));

  const upgradeCostsMap =
    clientObj.houseRoomDetailMap[house.houseRoomHrid].upgradeCostsMap;
  const level = house.level;

  let cost = 0;
  for (let i = 1; i <= level; i++) {
    for (const item of upgradeCostsMap[i]) {
      const fairValue = runtime.api.getFairValue(item.itemHrid, 0);
      if (fairValue > 0) {
        cost += item.count * fairValue;
      } else {
        console.log(
          "getHouseFullBuildPrice cannot find price of " + item.itemHrid,
        );
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
  const marketAPIJson = await runtime.api.fetchMarketJSON();
  if (!marketAPIJson && !Object.keys(runtime.state.marketItemValues).length) {
    return 0;
  }
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
  const abilities = isAll
    ? runtime.state.initData_characterAbilities
    : runtime.state.initData_combatAbilities;
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
    } else {
      console.log("calculateAbilityScore cannot find price of " + itemHrid);
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
  const [battleHouseScore, abilityScore, equipmentScore] =
    await getBuildScoreByProfile(profile_shared_obj);
  const totalBuildScore = battleHouseScore + abilityScore + equipmentScore;
  const isEquipmentHiddenText =
    abilityScore + equipmentScore <= 0
      ? runtime.config.isZH
        ? " (装备隐藏)"
        : " (Equipment hidden)"
      : " ";

  const panel = await getInfoPanel();
  panel.style.height = "auto";
  panel.insertAdjacentHTML(
    "beforeend",
    `<div style="text-align: left; color: ${runtime.config.SCRIPT_COLOR_MAIN}; font-size: 0.875rem;">
            <div style="cursor: pointer; font-weight: bold" id="toggleScores_profile">${
              runtime.config.isZH
                ? "+ 战力打造分: "
                : "+ Character Build Score: "
            }${totalBuildScore.toFixed(1)}${isEquipmentHiddenText}</div>
            <div id="buildScores_profile" style="display: none; margin-left: 20px;">
                    <div>${runtime.config.isZH ? "房子分：" : "House score: "}${battleHouseScore.toFixed(1)}</div>
                    <div>${runtime.config.isZH ? "技能分：" : "Ability score: "}${abilityScore.toFixed(1)}</div>
                    <div>${runtime.config.isZH ? "装备分：" : "Equipment score: "}${equipmentScore.toFixed(1)}</div>
            </div>
        </div>`,
  );
  // 监听点击事件，控制折叠和展开
  const toggleScores = document.getElementById("toggleScores_profile");
  const ScoreDetails = document.getElementById("buildScores_profile");
  toggleScores.addEventListener("click", () => {
    const isCollapsed = ScoreDetails.style.display === "none";
    ScoreDetails.style.display = isCollapsed ? "block" : "none";
    toggleScores.textContent =
      (isCollapsed ? "↓ " : "+ ") +
      (runtime.config.isZH ? "战力打造分: " : "Character Build Score: ") +
      totalBuildScore.toFixed(1) +
      isEquipmentHiddenText;
  });
}

// 计算打造分
async function getBuildScoreByProfile(profile_shared_obj) {
  // 房子分：战斗相关房子升级所需总金币
  const battleHouses = [
    "dining_room",
    "library",
    "dojo",
    "gym",
    "armory",
    "archery_range",
    "mystical_study",
  ];
  let battleHouseScore = 0;
  for (const key in profile_shared_obj.profile.characterHouseRoomMap) {
    if (
      battleHouses.some((house) =>
        profile_shared_obj.profile.characterHouseRoomMap[
          key
        ].houseRoomHrid.includes(house),
      )
    ) {
      battleHouseScore +=
        (await getHouseFullBuildPrice(
          profile_shared_obj.profile.characterHouseRoomMap[key],
        )) / 1000000;
    }
  }
  // console.log("房屋分：" + battleHouseScore);
  if (profile_shared_obj.profile.hideWearableItems) {
    // 对方未展示装备
    return [battleHouseScore, 0, 0];
  }

  // 技能分：当前使用的战斗技能所需技能书总价，单位M
  let abilityScore = 0;
  try {
    abilityScore = await calculateSkill(profile_shared_obj);
    // console.log("技能分：" + abilityScore);
  } catch (error) {
    console.error("Error in calculate skill:", error);
  }

  // 装备分：当前身上装备总价，单位M
  let equipmentScore = 0;
  try {
    equipmentScore = await calculateEquipment(profile_shared_obj);
    // console.log("装备分：" + equipmentScore);
  } catch (error) {
    console.error("Error in calculateEquipmen:", error);
  }

  return [battleHouseScore, abilityScore, equipmentScore];
}

// 技能价格计算
async function calculateSkill(profile_shared_obj) {
  const marketAPIJson = await runtime.api.fetchMarketJSON();
  if (!marketAPIJson && !Object.keys(runtime.state.marketItemValues).length) {
    return 0;
  }
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
    } else {
      console.log("calculateSkill cannot find price of " + itemHrid);
    }
    // console.log(`技能:${itemHrid},价值${numBooks * (marketPrices[0].b > 0 ? marketPrices[0].b : 0)}`)
  });

  return (price /= 1000000);
}

// 装备价格计算
async function calculateEquipment(profile_shared_obj) {
  const marketAPIJson = await runtime.api.fetchMarketJSON();
  if (!marketAPIJson && !Object.keys(runtime.state.marketItemValues).length) {
    return 0;
  }
  let obj = profile_shared_obj.profile;
  // 装备净值
  let networth = 0;
  for (const key in obj.wearableItemMap) {
    const item = obj.wearableItemMap[key];
    const enhanceLevel = obj.wearableItemMap[key].enhancementLevel;
    const itemHrid = obj.wearableItemMap[key].itemHrid;
    const fairValue = runtime.api.getFairValue(itemHrid, enhanceLevel);
    if (fairValue > 0) {
      networth += item.count * fairValue;
    } else {
      console.log("calculateEquipment cannot find price of " + itemHrid);
    }
  }

  return networth / 1000000;
}

Object.assign(runtime.api, {
  getSelfBuildScores,
  getHouseFullBuildPrice,
  getWeightedMarketPrice,
  calculateAbilityScore,
  getInfoPanel,
  showBuildScoreOnProfile,
  getBuildScoreByProfile,
  calculateSkill,
  calculateEquipment,
});
