import { runtime } from "../core/runtime.js";
import { resolveLocalizedEntity } from "../core/game-localization.js";

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

let lastBattleSummaryMessage = null;

/* 战斗总结 */
async function handleBattleSummary(message) {
  lastBattleSummaryMessage = message;
  const suppressMarket = runtime.api.shouldSuppressMarketFeatures?.() ?? false;
  const marketJson = suppressMarket
    ? null
    : await runtime.api.fetchMarketJSON();
  if (!suppressMarket && !marketJson) {
    console.error(
      runtime.config.isZH
        ? "[MWITools] 市场数据不可用，战斗总结将不显示市场收益。"
        : "[MWITools] Market data is unavailable; market revenue is omitted from the battle summary.",
    );
  }
  let totalPriceAsk = 0;
  let totalPriceAskBid = 0;
  let totalRawCoins = 0;

  if (marketJson && message.unit.totalLootMap) {
    for (const loot of Object.values(message.unit.totalLootMap)) {
      const itemCount = loot.count;
      if (loot.itemHrid === "/items/coin") {
        totalRawCoins += itemCount;
      }
      if (marketJson.marketData?.[loot.itemHrid]) {
        totalPriceAsk += marketJson.marketData[loot.itemHrid][0].a * itemCount;
        totalPriceAskBid +=
          runtime.api.getNetSellPrice(loot.itemHrid, 0) * itemCount;
      } else {
        console.log(
          runtime.config.isZH
            ? `[MWITools] 无法读取战利品价格：${loot.itemHrid}`
            : `[MWITools] Could not read the loot price: ${loot.itemHrid}`,
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
      elem
        .querySelectorAll(
          '[data-mwitools-battle-summary="true"],#script_battleNumbers,#script_totalIncome,#script_averageIncome,#script_totalIncomeDay,#script_avgRawCoinHour,#script_totalSkillsExp,#script_averageSkillsExp',
        )
        .forEach((node) => node.remove());
      const appendSummary = (id, html) => {
        const row = document.createElement("div");
        row.id = id;
        row.dataset.mwitoolsBattleSummary = "true";
        row.style.color = runtime.config.SCRIPT_COLOR_MAIN;
        row.innerHTML = html;
        elem.append(row);
        return row;
      };
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
          const efficiencyPerHour = battleDurationSec
            ? ((battles / battleDurationSec) * 3600).toFixed(1)
            : "—";
          appendSummary(
            "script_battleNumbers",
            `${runtime.config.isZH ? "每小时战斗: " : "Encounters/hour: "}${efficiencyPerHour}${runtime.config.isZH ? " 次" : ""}`,
          );
        }
      }
      if (!suppressMarket && marketJson) {
        appendSummary(
          "script_totalIncome",
          `${runtime.config.isZH ? "总收获: " : "Total revenue: "}${runtime.api.numberFormatter(totalPriceAsk)} / ${runtime.api.numberFormatter(totalPriceAskBid)}`,
        );
        if (battleDurationSec) {
          const hours = battleDurationSec / 3600;
          appendSummary(
            "script_averageIncome",
            `${runtime.config.isZH ? "每小时收获: " : "Revenue/hour: "}${runtime.api.numberFormatter(totalPriceAsk / hours)} / ${runtime.api.numberFormatter(totalPriceAskBid / hours)}`,
          );
          appendSummary(
            "script_totalIncomeDay",
            `${runtime.config.isZH ? "每天收获: " : "Revenue/day: "}${runtime.api.numberFormatter((totalPriceAsk / hours) * 24)} / ${runtime.api.numberFormatter((totalPriceAskBid / hours) * 24)}`,
          );
          appendSummary(
            "script_avgRawCoinHour",
            `${runtime.config.isZH ? "每小时仅金币收获: " : "Raw coins/hour: "}${runtime.api.numberFormatter(totalRawCoins / hours)}`,
          );
        }
      }
      // 总经验
      appendSummary(
        "script_totalSkillsExp",
        `${runtime.config.isZH ? "总经验: " : "Total exp: "}${runtime.api.numberFormatter(totalSkillsExp)}`,
      );
      // 平均经验
      if (battleDurationSec) {
        const hours = battleDurationSec / 3600;
        appendSummary(
          "script_averageSkillsExp",
          `${runtime.config.isZH ? "每小时总经验: " : "Total exp/hour: "}${runtime.api.numberFormatter(totalSkillsExp / hours)}`,
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
            message.unit.totalSkillExperienceMap?.[skill.skillHrid];
          if (expGained) {
            appendSummary(
              `script_${skill.skillHrid.split("/").at(-1)}ExpHour`,
              `${runtime.config.isZH ? "每小时" : ""}${runtime.config.isZH ? skill.zhName : skill.enName}${runtime.config.isZH ? "经验: " : " exp/hour: "}${runtime.api.numberFormatter(expGained / hours)}`,
            );
          }
        });
      } else {
        console.error(
          runtime.config.isZH
            ? "[MWITools] 战斗时长无效，无法显示平均经验。"
            : "[MWITools] Battle duration is invalid; average XP cannot be displayed.",
        );
      }
    } else if (tryTimes <= 10) {
      setTimeout(findElem, 200);
    } else {
      console.error(
        runtime.config.isZH
          ? "[MWITools] 重试 10 次后仍未找到战斗总结。"
          : "[MWITools] Battle summary was not found after 10 attempts.",
      );
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
            <option value="1">${t("全部", "All")}</option>
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
            <option value="1000">${t("全部", "All")}</option>
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
                <option value="all">${t("全部", "All")}</option>
                <option value="attack">${t("攻击", "Attack")}</option>
                <option value="melee">${t("近战", "Melee")}</option>
                <option value="defense">${t("防御", "Defense")}</option>
                <option value="ranged">${t("远程", "Ranged")}</option>
                <option value="magic">${t("魔法", "Magic")}</option>
                <option value="others">${t("其他", "Others")}</option>
            </select>&emsp;</span>`,
    );
    filters.insertAdjacentHTML(
      "beforeend",
      `<span id="script_filter_location" style="float: left; color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "部位: " : "Slot: "}
            <select name="script_filter_location_select" id="script_filter_location_select">
                <option value="all">${t("全部", "All")}</option>
                <option value="main_hand">${t("主手", "Main Hand")}</option>
                <option value="off_hand">${t("副手", "Off Hand")}</option>
                <option value="two_hand">${t("双手", "Two Hand")}</option>
                <option value="head">${t("头部", "Head")}</option>
                <option value="body">${t("身体", "Body")}</option>
                <option value="hands">${t("手部", "Hands")}</option>
                <option value="legs">${t("腿部", "Legs")}</option>
                <option value="feet">${t("脚部", "Feet")}</option>
                <option value="neck">${t("项链", "Neck")}</option>
                <option value="earrings">${t("耳饰", "Earrings")}</option>
                <option value="ring">${t("戒指", "Ring")}</option>
                <option value="pouch">${t("袋子", "Pouch")}</option>
                <option value="back">${t("背部", "Back")}</option>
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
    const monsterName = taskStr
      .split(/\s[-–]\s/)
      .slice(1)
      .join(" - ")
      .trim();
    const actionHrid = (
      resolveLocalizedEntity("monster", monsterName) ||
      resolveLocalizedEntity("action", monsterName)
    ).replaceAll("/monsters/", "/actions/combat/");
    if (!actionHrid) continue;

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

Object.assign(runtime.api, {
  handleBattleSummary,
  addItemLevels,
  addMarketFilterButtons,
  handleMarketItemFilter,
  handleTaskCard,
  addIndexToMaps,
});

const refreshVisibleBattleSummary = () => {
  if (
    lastBattleSummaryMessage &&
    document.querySelector(".BattlePanel_gainedExp__3SaCa")
  ) {
    void handleBattleSummary(lastBattleSummaryMessage);
  }
};
runtime.settings.onChange?.(
  "adaptIronCowMarketFeatures",
  refreshVisibleBattleSummary,
);
runtime.onMessage("init_character_data", refreshVisibleBattleSummary);

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
