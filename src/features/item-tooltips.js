import { runtime } from "../core/runtime.js";

/* 显示当前动作总时间 */
const showTotalActionTime = () => {
  const targetNode = document.querySelector("div.Header_actionName__31-L2");
  if (targetNode) {
    console.log("start observe action progress bar");
    calculateTotalTime(targetNode);
    new MutationObserver((mutationsList) =>
      mutationsList.forEach((mutation) => {
        calculateTotalTime();
      }),
    ).observe(targetNode, {
      characterData: true,
      subtree: true,
      childList: true,
    });
  } else {
    setTimeout(showTotalActionTime, 200);
  }
};

function calculateTotalTime() {
  const targetNode = document.querySelector(
    "div.Header_actionName__31-L2 > div.Header_displayName__1hN09",
  );
  if (targetNode.textContent.includes("[")) {
    return;
  }

  let totalTimeStr = "Error";
  const content = targetNode.innerText;
  const match = content.match(/\((\d+)\)/);
  if (match) {
    const numOfTimes = +match[1];
    const timePerActionSec = +runtime.api
      .getOriTextFromElement(document.querySelector(".ProgressBar_text__102Yn"))
      .match(/[\d\.]+/)[0];
    const actionHrid = runtime.state.currentActionsHridList[0].actionHrid;
    let effBuff = 1 + runtime.api.getTotalEffiPercentage(actionHrid) / 100;
    if (actionHrid.includes("enhanc")) {
      effBuff = 1;
    }
    const actualNumberOfTimes = Math.round(numOfTimes / effBuff);
    const totalTimeSeconds = actualNumberOfTimes * timePerActionSec;
    totalTimeStr = " [" + timeReadable(totalTimeSeconds) + "]";

    const currentTime = new Date();
    currentTime.setSeconds(currentTime.getSeconds() + totalTimeSeconds);
    totalTimeStr += ` ${String(currentTime.getHours()).padStart(2, "0")}:${String(currentTime.getMinutes()).padStart(2, "0")}:${String(
      currentTime.getSeconds(),
    ).padStart(2, "0")}`;
  } else {
    totalTimeStr = " [∞]";
  }

  targetNode.textContent += totalTimeStr;
}

function timeReadable(sec) {
  if (sec >= 86400) {
    return (
      Number(sec / 86400).toFixed(1) + (runtime.config.isZH ? " 天" : " days")
    );
  }
  const d = new Date(Math.round(sec * 1000));
  function pad(i) {
    return ("0" + i).slice(-2);
  }
  let str =
    d.getUTCHours() +
    "h " +
    pad(d.getUTCMinutes()) +
    "m " +
    pad(d.getUTCSeconds()) +
    "s";
  return str;
}

/* 物品 ToolTips */
const tooltipObserver = new MutationObserver(async function (mutations) {
  for (const mutation of mutations) {
    for (const added of mutation.addedNodes) {
      if (added.classList.contains("MuiTooltip-popper")) {
        if (added.querySelector("div.ItemTooltipText_name__2JAHA")) {
          await handleTooltipItem(added);
        } else if (
          added.querySelector("div.QueuedActions_queuedActionsEditMenu__3OoQH")
        ) {
          runtime.api.handleActionQueueMenue(
            added.querySelector(
              "div.QueuedActions_queuedActionsEditMenu__3OoQH",
            ),
          );
        }
      }
    }
  }
});

const actionHridToToolsSpeedBuffNamesMap = {
  "/action_types/brewing": "brewingSpeed",
  "/action_types/cheesesmithing": "cheesesmithingSpeed",
  "/action_types/cooking": "cookingSpeed",
  "/action_types/crafting": "craftingSpeed",
  "/action_types/foraging": "foragingSpeed",
  "/action_types/milking": "milkingSpeed",
  "/action_types/tailoring": "tailoringSpeed",
  "/action_types/woodcutting": "woodcuttingSpeed",
  "/action_types/alchemy": "alchemySpeed",
};

const actionHridToHouseNamesMap = {
  "/action_types/brewing": "/house_rooms/brewery",
  "/action_types/cheesesmithing": "/house_rooms/forge",
  "/action_types/cooking": "/house_rooms/kitchen",
  "/action_types/crafting": "/house_rooms/workshop",
  "/action_types/foraging": "/house_rooms/garden",
  "/action_types/milking": "/house_rooms/dairy_barn",
  "/action_types/tailoring": "/house_rooms/sewing_parlor",
  "/action_types/woodcutting": "/house_rooms/log_shed",
  "/action_types/alchemy": "/house_rooms/laboratory",
};

const itemEnhanceLevelToBuffBonusMap = {
  0: 0,
  1: 2,
  2: 4.2,
  3: 6.6,
  4: 9.2,
  5: 12,
  6: 15,
  7: 18.2,
  8: 21.6,
  9: 25.2,
  10: 29,
  11: 33.4,
  12: 38.4,
  13: 44,
  14: 50.2,
  15: 57,
  16: 64.4,
  17: 72.4,
  18: 81,
  19: 90.2,
  20: 100,
};

function getToolsSpeedBuffByActionHrid(actionHrid) {
  let totalBuff = 0;
  for (const item of runtime.state.initData_characterItems) {
    if (item.itemLocationHrid.includes("_tool")) {
      const buffName =
        actionHridToToolsSpeedBuffNamesMap[
          runtime.state.initData_actionDetailMap[actionHrid].type
        ];
      const enhanceBonus =
        1 + itemEnhanceLevelToBuffBonusMap[item.enhancementLevel] / 100;
      const buff =
        runtime.state.initData_itemDetailMap[item.itemHrid].equipmentDetail
          .noncombatStats[buffName] || 0;
      totalBuff += buff * enhanceBonus;
    }
  }
  return Number(totalBuff * 100).toFixed(1);
}

function getItemEffiBuffByActionHrid(actionHrid) {
  let buff = 0;
  const propertyName =
    runtime.state.initData_actionDetailMap[actionHrid].type.replace(
      "/action_types/",
      "",
    ) + "Efficiency";
  for (const item of runtime.state.initData_characterItems) {
    if (item.itemLocationHrid === "/item_locations/inventory") {
      continue;
    }
    const itemDetail = runtime.state.initData_itemDetailMap[item.itemHrid];

    const specificStat =
      itemDetail?.equipmentDetail?.noncombatStats[propertyName];
    if (specificStat && specificStat > 0) {
      let enhanceBonus = 1;
      if (
        item.itemLocationHrid.includes("earrings") ||
        item.itemLocationHrid.includes("ring") ||
        item.itemLocationHrid.includes("neck")
      ) {
        enhanceBonus =
          1 + (itemEnhanceLevelToBuffBonusMap[item.enhancementLevel] * 5) / 100;
      } else {
        enhanceBonus =
          1 + itemEnhanceLevelToBuffBonusMap[item.enhancementLevel] / 100;
      }
      buff += specificStat * enhanceBonus;
    }

    const skillingStat =
      itemDetail?.equipmentDetail?.noncombatStats["skillingEfficiency"];
    if (skillingStat && skillingStat > 0) {
      let enhanceBonus = 1;
      if (
        item.itemLocationHrid.includes("earrings") ||
        item.itemLocationHrid.includes("ring") ||
        item.itemLocationHrid.includes("neck")
      ) {
        enhanceBonus =
          1 + (itemEnhanceLevelToBuffBonusMap[item.enhancementLevel] * 5) / 100;
      } else {
        enhanceBonus =
          1 + itemEnhanceLevelToBuffBonusMap[item.enhancementLevel] / 100;
      }
      buff += skillingStat * enhanceBonus;
    }
  }
  return Number(buff * 100).toFixed(1);
}

function getHousesEffBuffByActionHrid(actionHrid) {
  const houseName =
    actionHridToHouseNamesMap[
      runtime.state.initData_actionDetailMap[actionHrid].type
    ];
  if (!houseName) {
    return 0;
  }
  const house = runtime.state.initData_characterHouseRoomMap[houseName];
  if (!house) {
    return 0;
  }
  return house.level * 1.5;
}

function getTeaBuffsByActionHrid(actionHrid) {
  const teaBuffs = {
    efficiency: 0, // Efficiency tea, specific teas, -Artisan tea.
    quantity: 0, // Gathering tea, Gourmet tea.
    lessResource: 0, // Artisan tea.
    extraExp: 0, // Wisdom tea. Not used.
    upgradedProduct: 0, // Processing tea. Not used.
  };

  const actionTypeId = runtime.state.initData_actionDetailMap[actionHrid].type;
  const teaList = runtime.state.initData_actionTypeDrinkSlotsMap[actionTypeId];
  for (const tea of teaList) {
    if (!tea || !tea.itemHrid) {
      continue;
    }

    for (const buff of runtime.state.initData_itemDetailMap[tea.itemHrid]
      .consumableDetail.buffs) {
      if (buff.typeHrid === "/buff_types/artisan") {
        teaBuffs.lessResource += buff.flatBoost * 100;
      } else if (buff.typeHrid === "/buff_types/action_level") {
        teaBuffs.efficiency -= buff.flatBoost;
      } else if (buff.typeHrid === "/buff_types/gathering") {
        teaBuffs.quantity += buff.flatBoost * 100;
      } else if (buff.typeHrid === "/buff_types/gourmet") {
        teaBuffs.quantity += buff.flatBoost * 100;
      } else if (buff.typeHrid === "/buff_types/wisdom") {
        teaBuffs.extraExp += buff.flatBoost * 100;
      } else if (buff.typeHrid === "/buff_types/processing") {
        teaBuffs.upgradedProduct += buff.flatBoost * 100;
      } else if (buff.typeHrid === "/buff_types/efficiency") {
        teaBuffs.efficiency += buff.flatBoost * 100;
      } else if (
        buff.typeHrid ===
        `/buff_types/${actionTypeId.replace("/action_types/", "")}_level`
      ) {
        teaBuffs.efficiency += buff.flatBoost;
      }
    }
  }

  return teaBuffs;
}

async function handleTooltipItem(tooltip) {
  const itemNameElems = tooltip.querySelectorAll(
    "div.ItemTooltipText_name__2JAHA span",
  );

  // 带强化等级的物品单独处理
  if (itemNameElems.length > 1) {
    runtime.api.handleItemTooltipWithEnhancementLevel(tooltip);
    return;
  }

  const itemNameElem = itemNameElems[0];
  let itemName = runtime.api.getOriTextFromElement(itemNameElem);
  if (runtime.config.isZHInGameSetting) {
    itemName = runtime.api.getItemEnNameFromZhName(itemName);
  }
  const itemHrid = runtime.state.itemEnNameToHridMap[itemName];

  let amount = 0;
  let insertAfterElem = null;
  const amountSpan = tooltip.querySelectorAll("span")[1];
  if (amountSpan) {
    amount = runtime.api.parseCompactNumber(
      runtime.api.getOriTextFromElement(amountSpan).split(": ")[1],
    );
    insertAfterElem = amountSpan.parentNode.nextSibling;
  } else {
    insertAfterElem =
      tooltip.querySelectorAll("span")[0].parentNode.nextSibling;
  }

  let appendHTMLStr = "";
  let marketJson = null;
  let ask = null;
  let bid = null;
  let fairValue = null;

  // 物品市场价格
  if (runtime.settings.settingsMap.itemTooltip_prices.isTrue) {
    marketJson = await fetchMarketJSON();
    if (!marketJson || !marketJson.marketData) {
      console.error("jsonObj null");
    }

    ask = marketJson?.marketData[itemHrid]?.[0]?.a ?? 0;
    bid = marketJson?.marketData[itemHrid]?.[0]?.b ?? 0;
    fairValue = runtime.api.getFairValue(itemHrid, 0);
    appendHTMLStr += `
    <div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP};">${runtime.config.isZH ? "服务器市场价值: " : "Server market value: "}${fairValue > 0 ? numberFormatter(fairValue) : "-"}${fairValue > 0 && amount > 0 ? ` (${numberFormatter(fairValue * amount)})` : ""}</div>
    <div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP};">${runtime.config.isZH ? "价格: " : "Price: "}${numberFormatter(ask)} / ${numberFormatter(bid)} (${
      ask && ask > 0 ? numberFormatter(ask * amount) : ""
    } / ${bid && bid > 0 ? numberFormatter(bid * amount) : ""})</div>
    `;
  }

  // 消耗品回复计算
  if (runtime.settings.settingsMap.showConsumTips.isTrue) {
    let itemDetail = runtime.state.initData_itemDetailMap[itemHrid];
    const hp = itemDetail?.consumableDetail?.hitpointRestore;
    const mp = itemDetail?.consumableDetail?.manapointRestore;
    const cd = itemDetail?.consumableDetail?.cooldownDuration;
    if (hp && cd) {
      const hpPerMiniute = (60 / (cd / 1000000000)) * hp;
      const pricePer100Hp = ask ? ask / (hp / 100) : null;
      const usePerday = (24 * 60 * 60) / (cd / 1000000000);
      appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">${
        pricePer100Hp
          ? pricePer100Hp.toFixed(0) +
            (runtime.config.isZH ? "金/100血, " : "coins/100hp, ")
          : ""
      }${hpPerMiniute.toFixed(0) + (runtime.config.isZH ? "血/分" : "hp/min")}, ${usePerday.toFixed(0)}${runtime.config.isZH ? "个/天" : "/day"}</div>`;
    } else if (mp && cd) {
      const mpPerMiniute = (60 / (cd / 1000000000)) * mp;
      const pricePer100Mp = ask ? ask / (mp / 100) : null;
      const usePerday = (24 * 60 * 60) / (cd / 1000000000);
      appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">${
        pricePer100Mp
          ? pricePer100Mp.toFixed(0) +
            (runtime.config.isZH ? "金/100蓝, " : "coins/100hp, ")
          : ""
      }${mpPerMiniute.toFixed(0) + (runtime.config.isZH ? "蓝/分" : "hp/min")}, ${usePerday.toFixed(0)}${runtime.config.isZH ? "个/天" : "/day"}</div>`;
    } else if (cd) {
      const usePerday = (24 * 60 * 60) / (cd / 1000000000);
      appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}">${usePerday.toFixed(0)}${runtime.config.isZH ? "个/天" : "/day"}</div>`;
    }
  }

  // 生产利润计算
  if (
    runtime.settings.settingsMap.itemTooltip_profit.isTrue &&
    marketJson &&
    getActionHridFromItemName(itemName) &&
    runtime.state.initData_actionDetailMap &&
    runtime.state.initData_itemDetailMap
  ) {
    // 区分生产类动作和采集类动作
    const isProduction =
      runtime.state.initData_actionDetailMap[
        getActionHridFromItemName(itemName)
      ].inputItems &&
      runtime.state.initData_actionDetailMap[
        getActionHridFromItemName(itemName)
      ].inputItems.length > 0;

    const actionHrid = getActionHridFromItemName(itemName);
    // 茶效率
    const teaBuffs = getTeaBuffsByActionHrid(actionHrid);

    // 原料信息
    let inputItems = [];
    let totalResourcesAskPricePerAction = 0;
    let totalResourcesBidPricePerAction = 0;

    if (isProduction) {
      inputItems = JSON.parse(
        JSON.stringify(
          runtime.state.initData_actionDetailMap[actionHrid].inputItems,
        ),
      );
      for (const item of inputItems) {
        item.name = runtime.state.initData_itemDetailMap[item.itemHrid].name;
        item.zhName = runtime.data.ZHItemNames[item.itemHrid];
        item.perAskPrice = marketJson?.marketData[item.itemHrid]?.[0]?.a ?? 0;
        item.perBidPrice = marketJson?.marketData[item.itemHrid]?.[0]?.b ?? 0;
        totalResourcesAskPricePerAction += item.perAskPrice * item.count;
        totalResourcesBidPricePerAction += item.perBidPrice * item.count;
      }

      // 茶减少原料消耗（对于升级物品，不影响上一级物品消耗）
      const lessResourceBuff = teaBuffs.lessResource;
      totalResourcesAskPricePerAction *= 1 - lessResourceBuff / 100;
      totalResourcesBidPricePerAction *= 1 - lessResourceBuff / 100;

      // 上级物品作为原料
      const upgradedFromItemHrid =
        runtime.state.initData_actionDetailMap[actionHrid]?.upgradeItemHrid;
      let upgradedFromItemName = null;
      let upgradedFromItemZhName = null;
      let upgradedFromItemAsk = null;
      let upgradedFromItemBid = null;
      if (upgradedFromItemHrid) {
        upgradedFromItemName =
          runtime.state.initData_itemDetailMap[upgradedFromItemHrid].name;
        upgradedFromItemZhName = runtime.data.ZHItemNames[upgradedFromItemHrid];
        upgradedFromItemAsk +=
          marketJson?.marketData[upgradedFromItemHrid]?.[0]?.a ?? 0;
        upgradedFromItemBid +=
          marketJson?.marketData[upgradedFromItemHrid]?.[0]?.b ?? 0;
        totalResourcesAskPricePerAction += upgradedFromItemAsk;
        totalResourcesBidPricePerAction += upgradedFromItemBid;
      }

      // 使用表格显示原料信息
      appendHTMLStr += `
                            <div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">
                                <table style="width:100%; border-collapse: collapse;">
                                    <tr style="border-bottom: 1px solid ${runtime.config.SCRIPT_COLOR_TOOLTIP};">
                                        <th style="text-align: left;">${runtime.config.isZH ? "原料" : "Material"}</th>
                                        <th style="text-align: center;">${runtime.config.isZH ? "数量" : "Count"}</th>
                                        <th style="text-align: right;">${runtime.config.isZH ? "出售价" : "Ask"}</th>
                                        <th style="text-align: right;">${runtime.config.isZH ? "收购价" : "Bid"}</th>
                                    </tr>
                                    <tr style="border-bottom: 1px solid ${runtime.config.SCRIPT_COLOR_TOOLTIP};">
                                        <td style="text-align: left;"><b>${runtime.config.isZH ? "合计" : "Total"}</b></td>
                                        <td style="text-align: center;"><b>${inputItems.reduce((sum, item) => sum + item.count, 0)}</b></td>
                                        <td style="text-align: right;"><b>${numberFormatter(totalResourcesAskPricePerAction)}</b></td>
                                        <td style="text-align: right;"><b>${numberFormatter(totalResourcesBidPricePerAction)}</b></td>
                                    </tr>`;

      for (const item of inputItems) {
        appendHTMLStr += `
                                    <tr>
                                        <td style="text-align: left;">${runtime.config.isZH ? item.zhName : item.name}</td>
                                        <td style="text-align: center;">${item.count}</td>
                                        <td style="text-align: right;">${numberFormatter(item.perAskPrice)}</td>
                                        <td style="text-align: right;">${numberFormatter(item.perBidPrice)}</td>
                                    </tr>`;
      }
      appendHTMLStr += `</table></div>`;

      if (upgradedFromItemHrid) {
        appendHTMLStr += `
                <div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;"> ${
                  runtime.config.isZH
                    ? upgradedFromItemZhName
                    : upgradedFromItemName
                }: ${numberFormatter(upgradedFromItemAsk)} / ${numberFormatter(upgradedFromItemBid)}</div>
                `;
      }
    }

    // 消耗饮料
    let drinksConsumedPerHourAskPrice = 0;
    let drinksConsumedPerHourBidPrice = 0;

    const drinksList =
      runtime.state.initData_actionTypeDrinkSlotsMap[
        runtime.state.initData_actionDetailMap[actionHrid].type
      ];
    for (const drink of drinksList) {
      if (!drink || !drink.itemHrid) {
        continue;
      }
      drinksConsumedPerHourAskPrice +=
        (marketJson?.marketData[drink.itemHrid]?.[0].a ?? 0) * 12;
      drinksConsumedPerHourBidPrice +=
        (marketJson?.marketData[drink.itemHrid]?.[0].b ?? 0) * 12;
    }

    // 每小时动作数（包含工具缩减动作时间）
    const baseTimePerActionSec =
      runtime.state.initData_actionDetailMap[actionHrid].baseTimeCost /
      1000000000;
    const toolPercent = getToolsSpeedBuffByActionHrid(actionHrid);
    const actualTimePerActionSec =
      baseTimePerActionSec / (1 + toolPercent / 100);

    let actionPerHour = 3600 / actualTimePerActionSec;

    // 每小时产品数
    let droprate = null;
    if (isProduction) {
      droprate =
        runtime.state.initData_actionDetailMap[actionHrid].outputItems[0].count;
    } else {
      droprate =
        (runtime.state.initData_actionDetailMap[actionHrid].dropTable[0]
          .minCount +
          runtime.state.initData_actionDetailMap[actionHrid].dropTable[0]
            .maxCount) /
        2;
    }
    let itemPerHour = actionPerHour * droprate;

    // 等级碾压提高效率（人物等级不及最低要求等级时，按最低要求等级计算）
    const requiredLevel =
      runtime.state.initData_actionDetailMap[actionHrid].levelRequirement.level;
    let currentLevel = requiredLevel;
    for (const skill of runtime.state.initData_characterSkills) {
      if (
        skill.skillHrid ===
        runtime.state.initData_actionDetailMap[actionHrid].levelRequirement
          .skillHrid
      ) {
        currentLevel = skill.level;
        break;
      }
    }
    const levelEffBuff =
      currentLevel - requiredLevel > 0 ? currentLevel - requiredLevel : 0;

    // 房子效率
    const houseEffBuff = getHousesEffBuffByActionHrid(actionHrid);

    // 特殊装备效率
    const itemEffiBuff = Number(getItemEffiBuffByActionHrid(actionHrid));

    // 总效率影响动作数/生产物品数
    actionPerHour *=
      1 +
      (levelEffBuff + houseEffBuff + teaBuffs.efficiency + itemEffiBuff) / 100;
    itemPerHour *=
      1 +
      (levelEffBuff + houseEffBuff + teaBuffs.efficiency + itemEffiBuff) / 100;

    // 茶额外产品数量（不消耗原料）
    const extraFreeItemPerHour = (itemPerHour * teaBuffs.quantity) / 100;

    // 出售市场税
    const bidAfterTax = runtime.api.getNetSellPrice(itemHrid, 0);

    // 每小时利润
    const profitPerHour =
      itemPerHour * (bidAfterTax - totalResourcesAskPricePerAction / droprate) +
      extraFreeItemPerHour * bidAfterTax -
      drinksConsumedPerHourAskPrice;

    appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">${
      runtime.config.isZH
        ? "生产利润(卖单价进、买单价出，包含销售税；不包括加工茶、社区增益、稀有掉落、袋子饮食增益；刷新网页更新人物数据)："
        : "Production profit(Sell price in, bid price out, including sales tax; Not including processing tea, comm buffs, rare drops, pouch consumables buffs; Refresh page to update player data): "
    }</div>`;

    appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">${baseTimePerActionSec.toFixed(2)}s ${
      runtime.config.isZH ? "基础速度" : "base speed,"
    } x${droprate} ${runtime.config.isZH ? "基础掉率" : "base drop rate,"} +${toolPercent}%${runtime.config.isZH ? "工具速度" : " tool speed,"} +${levelEffBuff}%${
      runtime.config.isZH ? "等级效率" : " level eff,"
    } +${houseEffBuff}%${runtime.config.isZH ? "房子效率" : " house eff,"} +${teaBuffs.efficiency}%${runtime.config.isZH ? "茶效率" : " tea eff,"} +${itemEffiBuff}%${
      runtime.config.isZH ? "装备效率" : " equipment eff,"
    } +${teaBuffs.quantity}%${runtime.config.isZH ? "茶额外数量" : " tea extra outcome,"} +${teaBuffs.lessResource}%${
      runtime.config.isZH ? "茶减少消耗" : " tea lower resource"
    }</div>`;

    appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">${
      runtime.config.isZH ? "每小时饮料消耗: " : "Drinks consumed per hour: "
    }${numberFormatter(drinksConsumedPerHourAskPrice)}  / ${numberFormatter(drinksConsumedPerHourBidPrice)}</div>`;

    appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">${runtime.config.isZH ? "每小时动作" : "Actions per hour"} ${Number(
      actionPerHour,
    ).toFixed(
      1,
    )}${runtime.config.isZH ? " 次" : " times"}, ${runtime.config.isZH ? "每小时生产" : "Production per hour"} ${Number(
      itemPerHour + extraFreeItemPerHour,
    ).toFixed(1)}${runtime.config.isZH ? " 个" : " items"}</div>`;

    appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP};">${runtime.config.isZH ? "利润: " : "Profit: "}${numberFormatter(
      profitPerHour / actionPerHour,
    )}${runtime.config.isZH ? "/动作" : "/action"}, ${numberFormatter(profitPerHour)}${runtime.config.isZH ? "/小时" : "/hour"}, ${numberFormatter(24 * profitPerHour)}${
      runtime.config.isZH ? "/天" : "/day"
    }</div>`;
  }

  insertAfterElem.insertAdjacentHTML("afterend", appendHTMLStr);

  // Make sure the tooltip is fully visible in the viewport
  const tootip = insertAfterElem.closest(".MuiTooltip-popper");
  const fixOverflow = (tootip) => {
    if (!tootip.isConnected) {
      return;
    }
    const bBox = tootip.getBoundingClientRect();
    if (bBox.top < 0 || bBox.bottom > window.innerHeight) {
      const transformString = tootip.style.transform.split(/\w+\(|\);?/);
      const transformValues = transformString[1]
        .split(/,\s?/g)
        .map((numStr) => parseInt(numStr));
      tootip.style.transform = `translate3d(${transformValues[0]}px, 0px, ${transformValues[2]}px)`;
    }
  };
  setTimeout(fixOverflow, 100, tootip); // A delay is added because the game seems to reset the style if applied immediately.
}

async function fetchMarketJSON(forceFetch = false) {
  return runtime.api.fetchMarketJSON(forceFetch);
}

function numberFormatter(num, digits = 1) {
  return runtime.api.numberFormatter(num, digits);
}

function getActionHridFromItemName(name) {
  let newName = name.replace("Milk", "Cow");
  newName = newName.replace("Log", "Tree");
  newName = newName.replace("Cowing", "Milking");
  newName = newName.replace("Rainbow Cow", "Unicow");
  newName = newName.replace("Collector's Boots", "Collectors Boots");
  newName = newName.replace("Knight's Aegis", "Knights Aegis");
  if (!runtime.state.initData_actionDetailMap) {
    console.error(
      "getActionHridFromItemName no initData_actionDetailMap: " + name,
    );
    return null;
  }
  for (const action of Object.values(runtime.state.initData_actionDetailMap)) {
    if (action.name === newName) {
      return action.hrid;
    }
  }
  return null;
}

Object.assign(runtime.api, {
  showTotalActionTime,
  calculateTotalTime,
  timeReadable,
  getToolsSpeedBuffByActionHrid,
  getItemEffiBuffByActionHrid,
  getHousesEffBuffByActionHrid,
  getTeaBuffsByActionHrid,
  handleTooltipItem,
  getActionHridFromItemName,
});

Object.defineProperties(runtime.state, {
  tooltipObserver: {
    enumerable: true,
    get() {
      return tooltipObserver;
    },
  },
});

Object.defineProperties(runtime.data, {
  actionHridToToolsSpeedBuffNamesMap: {
    enumerable: true,
    get() {
      return actionHridToToolsSpeedBuffNamesMap;
    },
  },
  actionHridToHouseNamesMap: {
    enumerable: true,
    get() {
      return actionHridToHouseNamesMap;
    },
  },
  itemEnhanceLevelToBuffBonusMap: {
    enumerable: true,
    get() {
      return itemEnhanceLevelToBuffBonusMap;
    },
  },
});

runtime.registerStart("features/item-tooltips.js", () => {
  GM_addStyle(`div.Header_actionName__31-L2 {
    overflow: visible !important;
    white-space: normal !important;
    height: auto !important;
  }`);

  GM_addStyle(`span.NavigationBar_label__1uH-y {
    width: 10px !important;
  }`);

  tooltipObserver.observe(document.body, {
    attributes: false,
    childList: true,
    characterData: false,
  });
});
