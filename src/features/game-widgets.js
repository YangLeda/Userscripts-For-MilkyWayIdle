import { runtime } from "../core/runtime.js";

/* 战斗总结 */
async function handleBattleSummary(message) {
  const marketJson = await runtime.api.fetchMarketJSON();
  let hasMarketJson = true;
  if (!marketJson) {
    console.error("handleBattleSummary null marketAPI");
    hasMarketJson = false;
  }
  let totalPriceAsk = 0;
  let totalPriceAskBid = 0;
  let totalRawCoins = 0; // For IC

  if (hasMarketJson && message.unit.totalLootMap) {
    for (const loot of Object.values(message.unit.totalLootMap)) {
      const itemCount = loot.count;
      if (loot.itemHrid === "/items/coin") {
        totalRawCoins += itemCount;
      }
      if (marketJson.marketData[loot.itemHrid]) {
        totalPriceAsk += marketJson.marketData[loot.itemHrid][0].a * itemCount;
        totalPriceAskBid +=
          runtime.api.getNetSellPrice(loot.itemHrid, 0) * itemCount;
      } else {
        console.log(
          "handleBattleSummary failed to read price of " + loot.itemHrid,
        );
      }
    }
  }

  let totalSkillsExp = 0;
  if (message.unit.totalSkillExperienceMap) {
    for (const exp of Object.values(message.unit.totalSkillExperienceMap)) {
      totalSkillsExp += exp;
    }
  }

  let tryTimes = 0;
  findElem();
  function findElem() {
    tryTimes++;
    let elem = document.querySelector(
      ".BattlePanel_gainedExp__3SaCa",
    )?.parentElement;
    if (elem) {
      // 战斗时长和次数
      let battleDurationSec = null;
      const combatInfoElement = document.querySelector(
        ".BattlePanel_combatInfo__sHGCe",
      );
      if (combatInfoElement) {
        let matches = combatInfoElement.innerHTML.match(
          /(战斗时间|战斗时长|Combat Duration): (?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s).*?(交战|战斗|Battles): (\d+).*?(战败|死亡次数|Deaths): (\d+)/,
        );
        if (matches) {
          let days = parseInt(matches[2], 10) || 0;
          let hours = parseInt(matches[3], 10) || 0;
          let minutes = parseInt(matches[4], 10) || 0;
          let seconds = parseInt(matches[5], 10) || 0;
          let battles = parseInt(matches[7], 10) - 1; // 排除当前战斗
          battleDurationSec =
            days * 86400 + hours * 3600 + minutes * 60 + seconds;
          let efficiencyPerHour = (
            (battles / battleDurationSec) *
            3600
          ).toFixed(1);
          elem.insertAdjacentHTML(
            "beforeend",
            `<div id="script_battleNumbers" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${
              runtime.config.isZH ? "每小时战斗: " : "Encounters/hour: "
            }${efficiencyPerHour}${runtime.config.isZH ? " 次" : ""}</div>`,
          );
        }
      }
      // 总收入
      document
        .querySelector("div#script_battleNumbers")
        .insertAdjacentHTML(
          "afterend",
          `<div id="script_totalIncome" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "总收获: " : "Total revenue: "}${runtime.api.numberFormatter(
            totalPriceAsk,
          )} / ${runtime.api.numberFormatter(totalPriceAskBid)}</div>`,
        );
      // 平均收入
      if (battleDurationSec) {
        document
          .querySelector("div#script_totalIncome")
          .insertAdjacentHTML(
            "afterend",
            `<div id="script_averageIncome" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${
              runtime.config.isZH ? "每小时收获: " : "Revenue/hour: "
            }${runtime.api.numberFormatter(totalPriceAsk / (battleDurationSec / 60 / 60))} / ${runtime.api.numberFormatter(
              totalPriceAskBid / (battleDurationSec / 60 / 60),
            )}</div>`,
          );
        document
          .querySelector("div#script_averageIncome")
          .insertAdjacentHTML(
            "afterend",
            `<div id="script_totalIncomeDay" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${
              runtime.config.isZH ? "每天收获: " : "Revenue/day: "
            }${runtime.api.numberFormatter((totalPriceAsk / (battleDurationSec / 60 / 60)) * 24)} / ${runtime.api.numberFormatter(
              (totalPriceAskBid / (battleDurationSec / 60 / 60)) * 24,
            )}</div>`,
          );
        document
          .querySelector("div#script_totalIncomeDay")
          .insertAdjacentHTML(
            "afterend",
            `<div id="script_avgRawCoinHour" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${
              runtime.config.isZH ? "每小时仅金币收获: " : "Raw coins/hour: "
            }${runtime.api.numberFormatter(totalRawCoins / (battleDurationSec / 60 / 60))}</div>`,
          );
      }
      // 总经验
      document
        .querySelector("div#script_avgRawCoinHour")
        .insertAdjacentHTML(
          "afterend",
          `<div id="script_totalSkillsExp" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "总经验: " : "Total exp: "}${runtime.api.numberFormatter(
            totalSkillsExp,
          )}</div>`,
        );
      // 平均经验
      if (battleDurationSec) {
        document
          .querySelector("div#script_totalSkillsExp")
          .insertAdjacentHTML(
            "afterend",
            `<div id="script_averageSkillsExp" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${
              runtime.config.isZH ? "每小时总经验: " : "Total exp/hour: "
            }${runtime.api.numberFormatter(totalSkillsExp / (battleDurationSec / 60 / 60))}</div>`,
          );

        [
          { skillHrid: "/skills/magic", zhName: "魔法", enName: "Magic" },
          { skillHrid: "/skills/ranged", zhName: "远程", enName: "Ranged" },
          { skillHrid: "/skills/defense", zhName: "防御", enName: "Defense" },
          { skillHrid: "/skills/melee", zhName: "近战", enName: "Melee" },
          { skillHrid: "/skills/attack", zhName: "攻击", enName: "Attack" },
          {
            skillHrid: "/skills/intelligence",
            zhName: "智力",
            enName: "Intelligence",
          },
          { skillHrid: "/skills/stamina", zhName: "耐力", enName: "Stamina" },
        ].forEach((skill) => {
          const expGained =
            message.unit.totalSkillExperienceMap[skill.skillHrid];
          if (expGained) {
            document
              .querySelector("div#script_totalSkillsExp")
              .insertAdjacentHTML(
                "afterend",
                `<div style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "每小时" : ""}${runtime.config.isZH ? skill.zhName : skill.enName}${
                  runtime.config.isZH ? "经验: " : " exp/hour: "
                }${runtime.api.numberFormatter(expGained / (battleDurationSec / 60 / 60))}</div>`,
              );
          }
        });
      } else {
        console.error(
          "handleBattleSummary unable to display average exp due to null battleDurationSec",
        );
      }
    } else if (tryTimes <= 10) {
      setTimeout(findElem, 200);
    } else {
      console.error("handleBattleSummary: Elem not found after 10 tries.");
    }
  }
}

/* 图标上显示装备等级 */
function addItemLevels() {
  const itemDetailMap = runtime.state.initData_itemDetailMap;
  if (!itemDetailMap) return;
  const iconDivs = document.querySelectorAll(
    "div.Item_itemContainer__x7kH1 div.Item_item__2De2O.Item_clickable__3viV6",
  );
  for (const div of iconDivs) {
    if (div.querySelector("div.Item_name__2C42x")) {
      continue;
    }
    const href = div.querySelector("use")?.getAttribute("href");
    if (!href?.includes("#")) continue;
    const hrefName = href.split("#")[1];
    const itemHrid = "/items/" + hrefName;
    let itemDetail;
    try {
      itemDetail = itemDetailMap[itemHrid];
    } catch {
      return;
    }
    const itemLevel = itemDetail?.itemLevel;
    const itemAbilityLevel =
      itemDetail?.abilityBookDetail?.levelRequirements?.[0]?.level;

    if (itemDetail?.equipmentDetail && itemLevel && itemLevel > 0) {
      if (!div.querySelector("div.script_itemLevel")) {
        div.style.position = "relative";
        div.insertAdjacentHTML(
          "beforeend",
          `<div class="script_itemLevel" style="z-index: 1; position: absolute; top: 2px; right: 2px; text-align: right; color: ${runtime.config.SCRIPT_COLOR_MAIN};">${itemLevel}</div>`,
        );
      }
      if (
        !itemDetail?.equipmentDetail?.type?.includes("_tool") &&
        div.parentElement.parentElement.parentElement.parentElement.className.includes(
          "MarketplacePanel_marketItems__D4k7e",
        )
      ) {
        handleMarketItemFilter(div, itemDetail);
      }
    } else if (itemAbilityLevel && itemAbilityLevel > 0) {
      if (!div.querySelector("div.script_itemLevel")) {
        div.style.position = "relative";
        div.insertAdjacentHTML(
          "beforeend",
          `<div class="script_itemLevel" style="z-index: 1; position: absolute; top: 2px; right: 2px; text-align: right; color: ${runtime.config.SCRIPT_COLOR_MAIN};">${itemAbilityLevel}</div>`,
        );
      }
    } else if (
      runtime.settings.settingsMap.showsKeyInfoInIcon.isTrue &&
      (itemHrid.includes("_key_fragment") || itemHrid.includes("_key"))
    ) {
      const map = new Map();
      map.set("/items/blue_key_fragment", runtime.config.isZH ? "图3" : "Z3");
      map.set("/items/green_key_fragment", runtime.config.isZH ? "图4" : "Z4");
      map.set("/items/purple_key_fragment", runtime.config.isZH ? "图5" : "Z5");
      map.set("/items/white_key_fragment", runtime.config.isZH ? "图6" : "Z6");
      map.set("/items/orange_key_fragment", runtime.config.isZH ? "图7" : "Z7");
      map.set("/items/brown_key_fragment", runtime.config.isZH ? "图8" : "Z8");
      map.set("/items/stone_key_fragment", runtime.config.isZH ? "图9" : "Z9");
      map.set("/items/dark_key_fragment", runtime.config.isZH ? "图10" : "Z10");
      map.set(
        "/items/burning_key_fragment",
        runtime.config.isZH ? "图11" : "Z11",
      );

      map.set(
        "/items/chimerical_entry_key",
        runtime.config.isZH ? "牢1" : "D1",
      );
      map.set("/items/sinister_entry_key", runtime.config.isZH ? "牢2" : "D2");
      map.set("/items/enchanted_entry_key", runtime.config.isZH ? "牢3" : "D3");
      map.set("/items/pirate_entry_key", runtime.config.isZH ? "牢4" : "D4");

      map.set("/items/chimerical_chest_key", "3.4.5.6");
      map.set("/items/sinister_chest_key", "5.7.8.10");
      map.set("/items/enchanted_chest_key", "7.8.9.11");
      map.set("/items/pirate_chest_key", "6.9.10.11");

      if (!div.querySelector("div.script_key")) {
        div.style.position = "relative";
        div.insertAdjacentHTML(
          "beforeend",
          `<div class="script_key" style="z-index: 1; position: absolute; top: 2px; right: 2px; text-align: right; color: ${runtime.config.SCRIPT_COLOR_MAIN};">${map.get(
            itemHrid,
          )}</div>`,
        );
      }
    }
  }
}

/* 市场物品筛选 */
let onlyShowItemsAboveLevel = 1;

let onlyShowItemsBelowLevel = 1000;

let onlyShowItemsType = "all";

let onlyShowItemsSkillReq = "all";

function addMarketFilterButtons() {
  const oriFilter = document.querySelector(
    ".MarketplacePanel_itemFilterContainer__3F3td",
  );
  let filters = document.querySelector("#script_filters");
  if (oriFilter && !filters) {
    oriFilter.insertAdjacentHTML(
      "afterend",
      `<div id="script_filters" style="float: left; color: ${runtime.config.SCRIPT_COLOR_MAIN};"></div>`,
    );
    filters = document.querySelector("#script_filters");
    filters.insertAdjacentHTML(
      "beforeend",
      `<span id="script_filter_level" style="float: left; color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "等级: 大于等于 " : "Equipment level: >= "}
            <select name="script_filter_level_select" id="script_filter_level_select">
            <option value="1">All</option>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="30">30</option>
            <option value="40">40</option>
            <option value="50">50</option>
            <option value="60">60</option>
            <option value="65">65</option>
            <option value="70">70</option>
            <option value="75">75</option>
            <option value="80">80</option>
            <option value="85">85</option>
            <option value="90">90</option>
            <option value="95">95</option>
            <option value="100">100</option>
        </select>&nbsp;</span>`,
    );
    filters.insertAdjacentHTML(
      "beforeend",
      `<span id="script_filter_level_to" style="float: left; color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "小于 " : "< "}
            <select name="script_filter_level_select_to" id="script_filter_level_select_to">
            <option value="1000">All</option>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="30">30</option>
            <option value="40">40</option>
            <option value="50">50</option>
            <option value="60">60</option>
            <option value="65">65</option>
            <option value="70">70</option>
            <option value="75">75</option>
            <option value="80">80</option>
            <option value="85">85</option>
            <option value="90">90</option>
            <option value="95">95</option>
            <option value="100">100</option>
        </select>&emsp;</span>`,
    );
    filters.insertAdjacentHTML(
      "beforeend",
      `<span id="script_filter_skill" style="float: left; color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "职业: " : "Class: "}
            <select name="script_filter_skill_select" id="script_filter_skill_select">
                <option value="all">All</option>
                <option value="attack">Attack</option>
                <option value="melee">Melee</option>
                <option value="defense">Defense</option>
                <option value="ranged">Ranged</option>
                <option value="magic">Magic</option>
                <option value="others">Others</option>
            </select>&emsp;</span>`,
    );
    filters.insertAdjacentHTML(
      "beforeend",
      `<span id="script_filter_location" style="float: left; color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "部位: " : "Slot: "}
            <select name="script_filter_location_select" id="script_filter_location_select">
                <option value="all">All</option>
                <option value="main_hand">Main Hand</option>
                <option value="off_hand">Off Hand</option>
                <option value="two_hand">Two Hand</option>
                <option value="head">Head</option>
                <option value="body">Body</option>
                <option value="hands">Hands</option>
                <option value="legs">Legs</option>
                <option value="feet">Feet</option>
                <option value="neck">Neck</option>
                <option value="earrings">Earrings</option>
                <option value="ring">Ring</option>
                <option value="pouch">Pouch</option>
                <option value="back">Back</option>
            </select>&emsp;</span>`,
    );

    const levelFilter = document.querySelector("#script_filter_level_select");
    levelFilter.addEventListener("change", function () {
      if (levelFilter.value && !isNaN(levelFilter.value)) {
        onlyShowItemsAboveLevel = Number(levelFilter.value);
      }
    });
    const levelToFilter = document.querySelector(
      "#script_filter_level_select_to",
    );
    levelToFilter.addEventListener("change", function () {
      if (levelToFilter.value && !isNaN(levelToFilter.value)) {
        onlyShowItemsBelowLevel = Number(levelToFilter.value);
      }
    });
    const skillFilter = document.querySelector("#script_filter_skill_select");
    skillFilter.addEventListener("change", function () {
      if (skillFilter.value) {
        onlyShowItemsSkillReq = skillFilter.value;
      }
    });
    const locationFilter = document.querySelector(
      "#script_filter_location_select",
    );
    locationFilter.addEventListener("change", function () {
      if (locationFilter.value) {
        onlyShowItemsType = locationFilter.value;
      }
    });
  }
}

function handleMarketItemFilter(div, itemDetal) {
  if (!itemDetal.equipmentDetail) {
    return;
  }

  const itemLevel = itemDetal.itemLevel;
  const type = itemDetal.equipmentDetail.type;
  const levelRequirements = itemDetal.equipmentDetail.levelRequirements;

  let isType = false;
  isType = type && type.includes(onlyShowItemsType);
  if (onlyShowItemsType === "all") {
    isType = true;
  }

  let isRequired = false;
  for (const requirement of levelRequirements) {
    if (requirement.skillHrid.includes(onlyShowItemsSkillReq)) {
      isRequired = true;
    }
  }
  if (onlyShowItemsSkillReq === "others") {
    const combatTypes = ["attack", "melee", "defense", "ranged", "magic"];
    isRequired = !combatTypes.some((type) => {
      for (const requirement of levelRequirements) {
        if (requirement.skillHrid.includes(type)) {
          return true;
        }
      }
    });
  }
  if (onlyShowItemsSkillReq === "all") {
    isRequired = true;
  }

  if (
    itemLevel >= onlyShowItemsAboveLevel &&
    itemLevel < onlyShowItemsBelowLevel &&
    isType &&
    isRequired
  ) {
    div.style.display = "block";
  } else {
    div.style.display = "none";
  }
}

/* 任务卡片显示战斗地图序号 */
function handleTaskCard() {
  const taskNameDivs = document.querySelectorAll(
    "div.RandomTask_randomTask__3B9fA div.RandomTask_name__1hl1b",
  );
  for (const div of taskNameDivs) {
    if (div.querySelector("span.script_taskMapIndex")) {
      continue;
    }

    const taskStr = runtime.api.getOriTextFromElement(div);
    if (!taskStr.startsWith("Defeat - ") && !taskStr.startsWith("击败 - ")) {
      continue;
    }

    let monsterName = taskStr.replace("Defeat - ", "").replace("击败 - ", "");
    let actionHrid = null;
    if (runtime.config.isZHInGameSetting) {
      actionHrid = (
        runtime.api.getOthersFromZhName(monsterName)
          ? runtime.api.getOthersFromZhName(monsterName)
          : runtime.api.getActionEnNameFromZhName(monsterName)
      )?.replaceAll("/monsters/", "/actions/combat/");
    }

    let actionObj = null;
    for (const action of Object.values(
      runtime.state.initData_actionDetailMap,
    )) {
      if (action.hrid.includes("/combat/")) {
        if (
          action.hrid === actionHrid ||
          action.name.toLowerCase() === monsterName.toLowerCase()
        ) {
          actionObj = action;
          break;
        } else if (action.combatZoneInfo.fightInfo.battlesPerBoss === 10) {
          if (
            actionHrid?.replaceAll("/actions/combat/", "/monsters/") ===
              action.combatZoneInfo.fightInfo.bossSpawns[0].combatMonsterHrid ||
            "/monsters/" + monsterName.toLowerCase().replaceAll(" ", "_") ===
              action.combatZoneInfo.fightInfo.bossSpawns[0].combatMonsterHrid
          ) {
            actionObj = action;
            break;
          }
        }
      }
    }
    const actionCategoryHrid = actionObj?.category;
    const index =
      runtime.state.initData_actionCategoryDetailMap?.[actionCategoryHrid]
        ?.sortIndex;
    if (index) {
      div.insertAdjacentHTML(
        "beforeend",
        `<span class="script_taskMapIndex" style="text-align: right; color: ${runtime.config.SCRIPT_COLOR_MAIN};"> ${runtime.config.isZH ? "图" : "Z"}${index}</span>`,
      );
    }
  }
}

/* 显示战斗地图序号 */
function addIndexToMaps() {
  const buttons = document.querySelectorAll(
    "div.MainPanel_subPanelContainer__1i-H9 div.CombatPanel_tabsComponentContainer__GsQlg div.MuiTabs-root.MuiTabs-vertical.css-6x4ics button.MuiButtonBase-root.MuiTab-root.MuiTab-textColorPrimary.css-1q2h7u5 span.MuiBadge-root.TabsComponent_badge__1Du26.css-1rzb3uu",
  );
  let index = 1;
  for (const button of buttons) {
    if (!button.querySelector("span.script_mapIndex")) {
      button.insertAdjacentHTML(
        "afterbegin",
        `<span class="script_mapIndex" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${index++}. </span>`,
      );
    }
  }
}

/* 物品词典窗口显示还需多少技能书到X级 */
const waitForItemDict = () => {
  const targetNode = document.querySelector("div.GamePage_gamePage__ixiPl");
  if (targetNode) {
    console.log("start observe item dict");
    const itemDictPanelObserver = new MutationObserver(async function (
      mutations,
    ) {
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          if (
            added?.classList?.contains("ItemDictionary_modalWrapper__1Ywn2") &&
            added.querySelector("div.ItemDictionary_modalContent__WvEBY")
          ) {
            handleItemDict(
              added.querySelector("div.ItemDictionary_modalContent__WvEBY"),
            );
          }
        }
      }
    });
    itemDictPanelObserver.observe(targetNode, {
      attributes: false,
      childList: true,
      subtree: true,
    });
  } else {
    setTimeout(waitForItemDict, 200);
  }
};

async function handleItemDict(panel) {
  let abilityHrid = null;
  if (runtime.config.isZHInGameSetting) {
    abilityHrid = runtime.api.getOthersFromZhName(
      panel.querySelector("h1.ItemDictionary_title__27cTd").textContent,
    );
  } else {
    const itemName = runtime.api
      .getOriTextFromElement(
        panel.querySelector("h1.ItemDictionary_title__27cTd"),
      )
      .toLowerCase()
      .replaceAll(" ", "_")
      .replaceAll("'", "");
    for (const skillHrid of Object.keys(
      runtime.state.initData_abilityDetailMap,
    )) {
      if (skillHrid.includes("/" + itemName)) {
        abilityHrid = skillHrid;
      }
    }
  }
  if (!abilityHrid) {
    return;
  }

  const itemHrid = abilityHrid.replace("/abilities/", "/items/");
  const abilityPerBookExp =
    runtime.state.initData_itemDetailMap[itemHrid]?.abilityBookDetail
      ?.experienceGain;

  let currentLevel = 0;
  let currentExp = 0;
  for (const a of Object.values(runtime.state.initData_characterAbilities)) {
    if (a.abilityHrid === abilityHrid) {
      currentLevel = a.level;
      currentExp = a.experience;
    }
  }

  const getNeedBooksToLevel = (
    currentLevel,
    currentExp,
    targetLevel,
    abilityPerBookExp,
  ) => {
    const needExp =
      runtime.state.initData_levelExperienceTable[targetLevel] - currentExp;
    let needBooks = needExp / abilityPerBookExp;
    if (currentLevel === 0) {
      needBooks += 1;
    }
    return (Math.ceil(needBooks * 10) / 10).toFixed(1);
  };

  let numBooks = getNeedBooksToLevel(
    currentLevel,
    currentExp,
    currentLevel + 1,
    abilityPerBookExp,
  );

  const marketAPIJson = await runtime.api.fetchMarketJSON();
  const ask = marketAPIJson.marketData[itemHrid][0].a || 0;
  const bid = marketAPIJson.marketData[itemHrid][0].b || 0;

  let hTMLStr = `<div id="tillLevel" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-align: left;">${
    runtime.config.isZH ? "到 " : "To "
  }<input id="tillLevelInput" type="number" value="${currentLevel + 1}" min="${currentLevel + 1}" max="200">${
    runtime.config.isZH ? " 级还需 " : " level need "
  }
    <span id="tillLevelNumber">${numBooks} (${runtime.api.numberFormatter(numBooks * ask)} / ${runtime.api.numberFormatter(numBooks * bid)})</span>
    <div>${runtime.config.isZH ? " 本书 (刷新网页更新当前等级)" : " books (Refresh page to update current level.)"}</div>
    </div>`;
  panel.insertAdjacentHTML("beforeend", hTMLStr);

  const tillLevelInput = panel.querySelector("input#tillLevelInput");
  const tillLevelNumber = panel.querySelector("span#tillLevelNumber");
  tillLevelInput.onchange = () => {
    const targetLevel = Number(tillLevelInput.value);
    if (targetLevel > currentLevel && targetLevel <= 200) {
      let numBooks = getNeedBooksToLevel(
        currentLevel,
        currentExp,
        targetLevel,
        abilityPerBookExp,
      );
      tillLevelNumber.textContent = `${numBooks} (${runtime.api.numberFormatter(numBooks * ask)} / ${runtime.api.numberFormatter(numBooks * bid)})`;
    } else {
      tillLevelNumber.textContent = "Error";
    }
  };
  tillLevelInput.addEventListener("keyup", function (evt) {
    const targetLevel = Number(tillLevelInput.value);
    if (targetLevel > currentLevel && targetLevel <= 200) {
      let numBooks = getNeedBooksToLevel(
        currentLevel,
        currentExp,
        targetLevel,
        abilityPerBookExp,
      );
      tillLevelNumber.textContent = `${numBooks} (${runtime.api.numberFormatter(numBooks * ask)} / ${runtime.api.numberFormatter(numBooks * bid)})`;
    } else {
      tillLevelNumber.textContent = "Error";
    }
  });
}

Object.assign(runtime.api, {
  handleBattleSummary,
  addItemLevels,
  addMarketFilterButtons,
  handleMarketItemFilter,
  handleTaskCard,
  addIndexToMaps,
  waitForItemDict,
  handleItemDict,
});

Object.defineProperties(runtime.state, {
  onlyShowItemsAboveLevel: {
    enumerable: true,
    get() {
      return onlyShowItemsAboveLevel;
    },
    set(value) {
      onlyShowItemsAboveLevel = value;
    },
  },
  onlyShowItemsBelowLevel: {
    enumerable: true,
    get() {
      return onlyShowItemsBelowLevel;
    },
    set(value) {
      onlyShowItemsBelowLevel = value;
    },
  },
  onlyShowItemsType: {
    enumerable: true,
    get() {
      return onlyShowItemsType;
    },
    set(value) {
      onlyShowItemsType = value;
    },
  },
  onlyShowItemsSkillReq: {
    enumerable: true,
    get() {
      return onlyShowItemsSkillReq;
    },
    set(value) {
      onlyShowItemsSkillReq = value;
    },
  },
});

runtime.features.register({
  id: "itemIconLevel",
  setting: "itemIconLevel",
  initialize({ scope }) {
    addItemLevels();
    scope.interval(addItemLevels, 500);
    scope.add(() =>
      document
        .querySelectorAll(".script_itemLevel,.script_key")
        .forEach((node) => node.remove()),
    );
  },
});

runtime.features.register({
  id: "showsKeyInfoInIcon",
  setting: "showsKeyInfoInIcon",
  dependsOn: ["itemIconLevel"],
  initialize() {
    addItemLevels();
    return () =>
      document.querySelectorAll(".script_key").forEach((node) => node.remove());
  },
});

runtime.features.register({
  id: "marketFilter",
  setting: "marketFilter",
  initialize({ scope }) {
    addMarketFilterButtons();
    scope.interval(addMarketFilterButtons, 500);
    scope.add(() => document.querySelector("#script_filters")?.remove());
  },
});

runtime.features.register({
  id: "taskMapIndex",
  setting: "taskMapIndex",
  scope: "character",
  initialize({ scope }) {
    handleTaskCard();
    scope.interval(handleTaskCard, 500);
    scope.add(() =>
      document
        .querySelectorAll(".script_taskMapIndex")
        .forEach((node) => node.remove()),
    );
  },
});

runtime.features.register({
  id: "mapIndex",
  setting: "mapIndex",
  initialize({ scope }) {
    addIndexToMaps();
    scope.interval(addIndexToMaps, 500);
    scope.add(() =>
      document
        .querySelectorAll(".script_mapIndex")
        .forEach((node) => node.remove()),
    );
  },
});
