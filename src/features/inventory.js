import { runtime } from "../core/runtime.js";

/* 计算Networth */
async function calculateNetworth() {
  const marketAPIJson = await runtime.api.fetchMarketJSON();
  if (!marketAPIJson) {
    console.error("calculateNetworth marketAPIJson is null");
    return;
  }

  let networthAsk = 0;
  let networthBid = 0;
  let marketListingsNetworthAsk = 0;
  let marketListingsNetworthBid = 0;
  let equippedNetworthAsk = 0;
  let equippedNetworthBid = 0;
  let inventoryNetworthAsk = 0;
  let inventoryNetworthBid = 0;

  for (const item of runtime.state.initData_characterItems) {
    const enhanceLevel = item.enhancementLevel;
    const marketPrices = marketAPIJson.marketData[item.itemHrid];

    if (enhanceLevel && enhanceLevel > 1) {
      runtime.state.input_data.item_hrid = item.itemHrid;
      runtime.state.input_data.stop_at = enhanceLevel;
      const best = await runtime.api.findBestEnhanceStratWithPhiMirror(
        runtime.state.input_data,
      );
      let totalCost = best?.totalCost;
      totalCost = totalCost ? Math.round(totalCost) : 0;
      if (item.itemLocationHrid !== "/item_locations/inventory") {
        equippedNetworthAsk += item.count * (totalCost > 0 ? totalCost : 0);
        equippedNetworthBid += item.count * (totalCost > 0 ? totalCost : 0);
      } else {
        inventoryNetworthAsk += item.count * (totalCost > 0 ? totalCost : 0);
        inventoryNetworthBid += item.count * (totalCost > 0 ? totalCost : 0);
      }
    } else if (marketPrices && marketPrices[0]) {
      if (item.itemLocationHrid !== "/item_locations/inventory") {
        equippedNetworthAsk +=
          item.count * (marketPrices[0].a > 0 ? marketPrices[0].a : 0);
        equippedNetworthBid +=
          item.count * (marketPrices[0].b > 0 ? marketPrices[0].b : 0);
      } else {
        inventoryNetworthAsk +=
          item.count * (marketPrices[0].a > 0 ? marketPrices[0].a : 0);
        inventoryNetworthBid +=
          item.count * (marketPrices[0].b > 0 ? marketPrices[0].b : 0);
      }
    } else {
      console.log("calculateNetworth cannot find price of " + item.itemHrid);
    }
  }

  for (const item of runtime.state.initData_myMarketListings) {
    const quantity = item.orderQuantity - item.filledQuantity;
    const enhancementLevel = item.enhancementLevel;
    const marketPrices = marketAPIJson.marketData[item.itemHrid];
    if (!marketPrices) {
      console.log(
        "calculateNetworth cannot get marketPrices of " + item.itemHrid,
      );
      continue;
    }
    let askPrice = marketPrices[0]?.a ?? 0;
    let bidPrice = marketPrices[0]?.b ?? 0;
    if (item.isSell) {
      if (item.itemHrid === "/items/bag_of_10_cowbells") {
        askPrice *= 1 - 18 / 100;
        bidPrice *= 1 - 18 / 100;
      } else {
        askPrice *= 1 - 2 / 100;
        bidPrice *= 1 - 2 / 100;
      }
      if (!enhancementLevel || enhancementLevel <= 1) {
        marketListingsNetworthAsk += quantity * (askPrice > 0 ? askPrice : 0);
        marketListingsNetworthBid += quantity * (bidPrice > 0 ? bidPrice : 0);
      } else {
        runtime.state.input_data.item_hrid = item.itemHrid;
        runtime.state.input_data.stop_at = enhancementLevel;
        const best = await runtime.api.findBestEnhanceStratWithPhiMirror(
          runtime.state.input_data,
        );
        let totalCost = best?.totalCost;
        totalCost = totalCost ? Math.round(totalCost) : 0;
        marketListingsNetworthAsk += quantity * (totalCost > 0 ? totalCost : 0);
        marketListingsNetworthBid += quantity * (totalCost > 0 ? totalCost : 0);
      }
      marketListingsNetworthAsk += item.unclaimedCoinCount;
      marketListingsNetworthBid += item.unclaimedCoinCount;
    } else {
      marketListingsNetworthAsk += quantity * item.price;
      marketListingsNetworthBid += quantity * item.price;
      marketListingsNetworthAsk +=
        item.unclaimedItemCount * (askPrice > 0 ? askPrice : 0);
      marketListingsNetworthBid +=
        item.unclaimedItemCount * (bidPrice > 0 ? bidPrice : 0);
    }
  }

  networthAsk =
    equippedNetworthAsk + inventoryNetworthAsk + marketListingsNetworthAsk;
  networthBid =
    equippedNetworthBid + inventoryNetworthBid + marketListingsNetworthBid;

  /* 仓库搜索栏下方显示人物总结 */
  // Some code of networth summery is by Stella.
  const addInventorySummery = async (invElem) => {
    const [
      battleHouseScore,
      nonBattleHouseScore,
      abilityScore,
      allAbilityScore,
      equipmentScore,
    ] = await runtime.api.getSelfBuildScores(
      equippedNetworthAsk * 0.5 + equippedNetworthBid * 0.5,
    );
    const totalScore = battleHouseScore + abilityScore + equipmentScore;
    const totalHouseScore = battleHouseScore + nonBattleHouseScore;
    const totalNetworth =
      networthAsk * 0.5 +
      networthBid * 0.5 +
      (totalHouseScore + allAbilityScore) * 1000000;

    invElem.insertAdjacentHTML(
      "beforebegin",
      `<div style="text-align: left; color: ${runtime.config.SCRIPT_COLOR_MAIN}; font-size: 0.875rem;">
                <!-- 战力打造分 -->
                <div style="cursor: pointer; font-weight: bold" id="toggleScores">${
                  runtime.config.isZH
                    ? "+ 战力打造分: "
                    : "+ Character Build Score: "
                }${totalScore.toFixed(1)}</div>
                <div id="buildScores" style="display: none; margin-left: 20px;">
                        <div>${runtime.config.isZH ? "房子分：" : "House score: "}${battleHouseScore.toFixed(1)}</div>
                        <div>${runtime.config.isZH ? "技能分：" : "Ability score: "}${abilityScore.toFixed(1)}</div>
                        <div>${runtime.config.isZH ? "装备分：" : "Equipment score: "}${equipmentScore.toFixed(1)}</div>
                </div>

                <!-- 总NetWorth -->
                <div style="cursor: pointer; font-weight: bold;" id="toggleNetWorth">
                    ${runtime.config.isZH ? "+ 总NetWorth：" : "+ Total NetWorth: "}${runtime.api.numberFormatter(totalNetworth)}
                </div>

                <div id="netWorthDetails" style="display: none; margin-left: 20px;">
                    <!-- 流动资产 -->
                    <div style="cursor: pointer;" id="toggleCurrentAssets">
                        ${runtime.config.isZH ? "+ 流动资产价值" : "+ Current assets value"}
                    </div>
                    <div id="currentAssets" style="display: none; margin-left: 20px;">
                        <div>${runtime.config.isZH ? "装备价值：" : "Equipment value: "}${runtime.api.numberFormatter(equippedNetworthAsk)}</div>
                        <div>${runtime.config.isZH ? "库存价值：" : "Inventory value: "}${runtime.api.numberFormatter(inventoryNetworthAsk)}</div>
                        <div>${runtime.config.isZH ? "订单价值：" : "Market listing value: "}${runtime.api.numberFormatter(marketListingsNetworthAsk)}</div>
                    </div>

                    <!-- 非流动资产 -->
                    <div style="cursor: pointer;" id="toggleNonCurrentAssets">
                        ${runtime.config.isZH ? "+ 非流动资产价值" : "+ Fixed assets value"}
                    </div>
                    <div id="nonCurrentAssets" style="display: none; margin-left: 20px;">
                        <div>${runtime.config.isZH ? "房子价值：" : "Houses value: "}${runtime.api.numberFormatter(totalHouseScore * 1000000)}</div>
                        <div>${runtime.config.isZH ? "技能价值：" : "Abilities value: "}${runtime.api.numberFormatter(allAbilityScore * 1000000)}</div>
                    </div>
                </div>
            </div>`,
    );

    // 监听点击事件，控制折叠和展开
    const toggleScores = document.getElementById("toggleScores");
    const ScoreDetails = document.getElementById("buildScores");
    const toggleButton = document.getElementById("toggleNetWorth");
    const netWorthDetails = document.getElementById("netWorthDetails");
    const toggleCurrentAssets = document.getElementById("toggleCurrentAssets");
    const currentAssets = document.getElementById("currentAssets");
    const toggleNonCurrentAssets = document.getElementById(
      "toggleNonCurrentAssets",
    );
    const nonCurrentAssets = document.getElementById("nonCurrentAssets");

    toggleScores.addEventListener("click", () => {
      const isCollapsed = ScoreDetails.style.display === "none";
      ScoreDetails.style.display = isCollapsed ? "block" : "none";
      toggleScores.textContent =
        (isCollapsed ? "↓ " : "+ ") +
        (runtime.config.isZH ? "战力打造分: " : "Character Build Score: ") +
        totalScore.toFixed(1);
    });

    toggleButton.addEventListener("click", () => {
      const isCollapsed = netWorthDetails.style.display === "none";
      netWorthDetails.style.display = isCollapsed ? "block" : "none";
      toggleButton.textContent =
        (isCollapsed ? "↓ " : "+ ") +
        (runtime.config.isZH ? "总NetWorth：" : "Total NetWorth: ") +
        runtime.api.numberFormatter(totalNetworth);
      currentAssets.style.display = isCollapsed ? "block" : "none";
      toggleCurrentAssets.textContent =
        (isCollapsed ? "↓ " : "+ ") +
        (runtime.config.isZH ? "流动资产价值" : "Current assets value");
      nonCurrentAssets.style.display = isCollapsed ? "block" : "none";
      toggleNonCurrentAssets.textContent =
        (isCollapsed ? "↓ " : "+ ") +
        (runtime.config.isZH ? "非流动资产价值" : "Fixed assets value");
    });

    toggleCurrentAssets.addEventListener("click", () => {
      const isCollapsed = currentAssets.style.display === "none";
      currentAssets.style.display = isCollapsed ? "block" : "none";
      toggleCurrentAssets.textContent =
        (isCollapsed ? "↓ " : "+ ") +
        (runtime.config.isZH ? "流动资产价值" : "Current assets value");
    });

    toggleNonCurrentAssets.addEventListener("click", () => {
      const isCollapsed = nonCurrentAssets.style.display === "none";
      nonCurrentAssets.style.display = isCollapsed ? "block" : "none";
      toggleNonCurrentAssets.textContent =
        (isCollapsed ? "↓ " : "+ ") +
        (runtime.config.isZH ? "非流动资产价值" : "Fixed assets value");
    });
  };

  const waitForHeader = () => {
    const targetNode = document.querySelector("div.Header_totalLevel__8LY3Q");
    if (targetNode) {
      targetNode.insertAdjacentHTML(
        "afterend",
        `<div style="font-size: 0.875rem; font-weight: 500; color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-wrap: nowrap;">Current Assets: ${runtime.api.numberFormatter(
          networthAsk,
        )} / ${runtime.api.numberFormatter(networthBid)}${`<div id="script_api_fail_alert" style="color: ${runtime.config.SCRIPT_COLOR_ALERT};">${
          runtime.config.isZH
            ? "无法从API更新市场数据"
            : "Can't update market prices"
        }</div>`}</div>`,
      );

      const alertDiv = document.querySelector("div#script_api_fail_alert");
      if (alertDiv) {
        alertDiv.style.cursor = "pointer";
        alertDiv.addEventListener("click", () => {
          showApiFailAlertPopup();
        });

        if (
          runtime.state.isUsingExpiredMarketJson &&
          runtime.settings.settingsMap.networkAlert.isTrue
        ) {
          alertDiv.style.display = "block";
        } else {
          alertDiv.style.display = "none";
        }
      }

      document.body.insertAdjacentHTML(
        "beforeend",
        `<div id="script_api_fail_popout" style="display: none; position: absolute; top: 50px; left: 0; padding: 10px; background: white; border: 1px solid black; box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2); border-radius: 8px; white-space: pre-wrap;"></div>`,
      );

      const popout = document.querySelector("#script_api_fail_popout");
      if (popout) {
        popout.addEventListener("click", function () {
          const popout = document.querySelector("#script_api_fail_popout");
          popout.style.display =
            popout.style.display === "block" ? "none" : "block";
        });
      }
    } else {
      setTimeout(waitForHeader, 200);
    }
  };
  waitForHeader();

  function showApiFailAlertPopup() {
    console.log(runtime.state.reasonForUsingExpiredMarketJson);
    const popout = document.querySelector("#script_api_fail_popout");
    if (popout) {
      popout.textContent = runtime.state.reasonForUsingExpiredMarketJson;
      popout.style.display = "block";
    }
  }

  const waitForInv = () => {
    const targetNodes = document.querySelectorAll("div.Inventory_items__6SXv0");
    for (const node of targetNodes) {
      if (runtime.settings.settingsMap.invWorth.isTrue) {
        if (!node.classList.contains("script_buildScore_added")) {
          node.classList.add("script_buildScore_added");
          addInventorySummery(node);
        }
      }
      if (runtime.settings.settingsMap.invSort.isTrue) {
        if (!node.classList.contains("script_invSort_added")) {
          node.classList.add("script_invSort_added");
          addInvSortButton(node);
        }
      }
    }
    setTimeout(waitForInv, 1000);
  };
  waitForInv();

  const waitGuildCreditConversionsSelect = () => {
    if (runtime.settings.settingsMap.guildCreditConversionsSort.isTrue)
      addGuildCreditConversionsSortButton();

    setTimeout(waitGuildCreditConversionsSelect, 1000);
  };
  waitGuildCreditConversionsSelect();
}

/* 仓库物品排序 */
// by daluo, bot7420
async function addInvSortButton(invElem) {
  const price_data = await runtime.api.fetchMarketJSON();
  if (!price_data || !price_data.marketData) {
    console.error("addInvSortButton fetchMarketJSON null");
    return;
  }

  const askButton = `<button
        id="script_sortByAsk_btn"
        style="border-radius: 3px; background-color: ${runtime.config.SCRIPT_COLOR_MAIN}; color: black;">
        ${runtime.config.isZH ? "出售价" : "Ask"}
        </button>`;
  const bidButton = `<button
        id="script_sortByBid_btn"
        style="border-radius: 3px; background-color: ${runtime.config.SCRIPT_COLOR_MAIN}; color: black;">
        ${runtime.config.isZH ? "收购价" : "Bid"}
        </button>`;
  const noneButton = `<button
        id="script_sortByNone_btn"
        style="border-radius: 3px; background-color: ${runtime.config.SCRIPT_COLOR_MAIN}; color: black;">
        ${runtime.config.isZH ? "无" : "None"}
        </button>`;
  const buttonsDiv = `<div style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; font-size: 0.875rem; text-align: left; ">${
    runtime.config.isZH ? "物品排序：" : "Sort items by: "
  }${askButton} ${bidButton} ${noneButton}</div>`;
  invElem.insertAdjacentHTML("beforebegin", buttonsDiv);

  invElem.parentElement
    .querySelector("button#script_sortByAsk_btn")
    .addEventListener("click", function (e) {
      sortItemsBy("ask");
    });
  invElem.parentElement
    .querySelector("button#script_sortByBid_btn")
    .addEventListener("click", function (e) {
      sortItemsBy("bid");
    });
  invElem.parentElement
    .querySelector("button#script_sortByNone_btn")
    .addEventListener("click", function (e) {
      sortItemsBy("none");
    });

  const sortItemsBy = (order) => {
    for (const typeDiv of invElem.children) {
      const typeName = runtime.api.getOriTextFromElement(
        typeDiv.getElementsByClassName("Inventory_categoryButton__35s1x")[0],
      );
      const notNeedSortTypes = ["Loots", "Currencies", "Equipment"];
      if (notNeedSortTypes.includes(typeName)) {
        continue;
      }

      typeDiv.querySelector(".Inventory_label__XEOAx").style.order =
        Number.MIN_SAFE_INTEGER;

      const itemElems = typeDiv.querySelectorAll(".Item_itemContainer__x7kH1");
      for (const itemElem of itemElems) {
        let itemName =
          itemElem.querySelector("svg").attributes["aria-label"].value;
        if (runtime.config.isZHInGameSetting) {
          itemName = runtime.api.getItemEnNameFromZhName(itemName);
        }
        const itemHrid = runtime.state.itemEnNameToHridMap[itemName];
        let itemCount = itemElem.querySelector(".Item_count__1HVvv").innerText;
        itemCount = Number(
          itemCount
            .toLowerCase()
            .replaceAll("k", "000")
            .replaceAll("m", "000000"),
        );
        let askPrice = 0;
        if (
          price_data.marketData[itemHrid] &&
          price_data.marketData[itemHrid][0]
        )
          askPrice = price_data.marketData[itemHrid][0].a;
        let bidPrice = 0;
        if (
          price_data.marketData[itemHrid] &&
          price_data.marketData[itemHrid][0]
        )
          bidPrice = price_data.marketData[itemHrid][0].b;
        const itemAskmWorth = askPrice * itemCount;
        const itemBidWorth = bidPrice * itemCount;

        // 价格角标
        if (!itemElem.querySelector("#script_stack_price")) {
          itemElem.style.position = "relative";
          const priceElemHTML = `<div
                        id="script_stack_price"
                        style="z-index: 1; position: absolute; top: 2px; left: 2px; text-align: left;">
                    </div>`;
          itemElem
            .querySelector(".Item_item__2De2O.Item_clickable__3viV6")
            .insertAdjacentHTML("beforeend", priceElemHTML);
        }
        const priceElem = itemElem.querySelector("#script_stack_price");

        // 排序
        if (order === "ask") {
          itemElem.style.order = -itemAskmWorth;
          priceElem.textContent = runtime.api.numberFormatter(itemAskmWorth);
        } else if (order === "bid") {
          itemElem.style.order = -itemBidWorth;
          priceElem.textContent = runtime.api.numberFormatter(itemBidWorth);
        } else if (order === "none") {
          itemElem.style.order = 0;
          priceElem.textContent = "";
        }
      }
    }
  };
}

/* 公会信用兑换选择弹窗排序 */
async function addGuildCreditConversionsSortButton() {
  const selectorContainer = document.querySelector(".ItemSelector_menu__12sEM");
  if (!selectorContainer) {
    return;
  }

  if (selectorContainer.querySelector("#script_itemSelector_sort_div")) {
    return;
  }

  const price_data = await runtime.api.fetchMarketJSON();
  if (!price_data || !price_data.marketData) {
    return;
  }

  // 预计算所有信用点类型的最佳兑换物品
  const bestCreditConversionMap = {};
  for (const itemHrid in runtime.state.initData_itemDetailMap) {
    if (
      runtime.state.initData_itemDetailMap[itemHrid]?.guildCreditConversions
    ) {
      const conversions =
        runtime.state.initData_itemDetailMap[itemHrid].guildCreditConversions;
      for (const conversion of conversions) {
        const creditHrid = conversion.creditItemHrid;
        let askPrice = 0;
        if (
          price_data.marketData[itemHrid] &&
          price_data.marketData[itemHrid][0]
        )
          askPrice = price_data.marketData[itemHrid][0].a;
        let bidPrice = 0;
        if (
          price_data.marketData[itemHrid] &&
          price_data.marketData[itemHrid][0]
        )
          bidPrice = price_data.marketData[itemHrid][0].b;
        if (askPrice === 0 && bidPrice === 0) continue;
        const creditAskPrice =
          (askPrice * conversion.itemCount) / conversion.creditCount;
        const creditBidPrice =
          (bidPrice * conversion.itemCount) / conversion.creditCount;
        const enName = runtime.state.initData_itemDetailMap[itemHrid].name;
        const zhName = runtime.data.ZHItemNames[itemHrid];
        const displayName = runtime.config.isZHInGameSetting
          ? zhName || enName
          : enName;
        if (!bestCreditConversionMap[creditHrid]) {
          bestCreditConversionMap[creditHrid] = { ask: null, bid: null };
        }
        if (
          askPrice > 0 &&
          (!bestCreditConversionMap[creditHrid].ask ||
            creditAskPrice < bestCreditConversionMap[creditHrid].ask.price)
        ) {
          bestCreditConversionMap[creditHrid].ask = {
            name: displayName,
            price: creditAskPrice,
          };
        }
        if (
          bidPrice > 0 &&
          (!bestCreditConversionMap[creditHrid].bid ||
            creditBidPrice < bestCreditConversionMap[creditHrid].bid.price)
        ) {
          bestCreditConversionMap[creditHrid].bid = {
            name: displayName,
            price: creditBidPrice,
          };
        }
      }
    }
  }

  const inputContainer = selectorContainer.querySelector(
    ".Input_inputContainer__22GnD",
  );
  if (!inputContainer) {
    return;
  }

  const askButton = `<button
        id="script_itemSelector_sortByAsk_btn"
        style="border-radius: 3px; background-color: ${runtime.config.SCRIPT_COLOR_MAIN}; color: black; font-size: 0.875rem; padding: 2px 6px;">
        ${runtime.config.isZH ? "出售价" : "Ask"}
        </button>`;
  const bidButton = `<button
        id="script_itemSelector_sortByBid_btn"
        style="border-radius: 3px; background-color: ${runtime.config.SCRIPT_COLOR_MAIN}; color: black; font-size: 0.875rem; padding: 2px 6px;">
        ${runtime.config.isZH ? "收购价" : "Bid"}
        </button>`;
  const noneButton = `<button
        id="script_itemSelector_sortByNone_btn"
        style="border-radius: 3px; background-color: ${runtime.config.SCRIPT_COLOR_MAIN}; color: black; font-size: 0.875rem; padding: 2px 6px;">
        ${runtime.config.isZH ? "无" : "None"}
        </button>`;
  const buttonsDiv = `<div id="script_itemSelector_sort_div" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; font-size: 0.875rem; text-align: left; margin-left: 8px; display: inline;">${
    runtime.config.isZH ? "排序：" : "Sort: "
  }${askButton} ${bidButton} ${noneButton}</div>`;
  inputContainer.insertAdjacentHTML("afterend", buttonsDiv);

  const itemList = selectorContainer.querySelector(
    ".ItemSelector_itemList__Qa5lq",
  );
  if (!itemList) {
    return;
  }

  const sortItemsBy = (order) => {
    const itemContainers = itemList.querySelectorAll(
      ".ItemSelector_itemContainer__3olqe",
    );

    let targetCreditHrid = "";
    let targetCreditName = "";
    const exchangeModal = document.querySelector(
      ".GuildPanel_exchangeModalContent__aQqyL",
    );
    if (exchangeModal) {
      const creditIcon = exchangeModal.querySelector(
        ".GuildPanel_arrow__1v2a0 + .Item_itemContainer__x7kH1 svg",
      );
      if (creditIcon) {
        let creditAriaLabel = creditIcon.attributes["aria-label"]?.value;
        if (creditAriaLabel) {
          if (runtime.config.isZHInGameSetting) {
            creditAriaLabel =
              runtime.api.getItemEnNameFromZhName(creditAriaLabel);
          }
          targetCreditHrid = runtime.state.itemEnNameToHridMap[creditAriaLabel];
          targetCreditName = creditAriaLabel;
        }
      }
    }

    const priceList = [];

    itemContainers.forEach((itemContainer) => {
      const itemElem = itemContainer.querySelector(
        ".Item_itemContainer__x7kH1",
      );
      if (!itemElem) return;

      let itemName =
        itemElem.querySelector("svg")?.attributes["aria-label"]?.value;
      if (!itemName) {
        itemElem.style.order = 0;
        const priceElem = itemElem.querySelector("#script_itemSelector_price");
        if (priceElem) priceElem.remove();
        return;
      }

      if (runtime.config.isZHInGameSetting) {
        itemName = runtime.api.getItemEnNameFromZhName(itemName);
      }
      const itemHrid = runtime.state.itemEnNameToHridMap[itemName];
      let itemCount = itemElem.querySelector(".Item_count__1HVvv")?.innerText;
      if (!itemCount) {
        itemElem.style.order = 0;
        const priceElem = itemElem.querySelector("#script_itemSelector_price");
        if (priceElem) priceElem.remove();
        return;
      }
      itemCount = Number(
        itemCount
          .toLowerCase()
          .replaceAll("k", "000")
          .replaceAll("m", "000000"),
      );
      let askPrice = 0;
      if (price_data.marketData[itemHrid] && price_data.marketData[itemHrid][0])
        askPrice = price_data.marketData[itemHrid][0].a;
      let bidPrice = 0;
      if (price_data.marketData[itemHrid] && price_data.marketData[itemHrid][0])
        bidPrice = price_data.marketData[itemHrid][0].b;

      let creditValue = 0;
      let creditAskPrice = 0;
      let creditBidPrice = 0;
      if (
        targetCreditHrid &&
        runtime.state.initData_itemDetailMap[itemHrid]?.guildCreditConversions
      ) {
        const conversions =
          runtime.state.initData_itemDetailMap[itemHrid].guildCreditConversions;
        const matchedConversion = conversions.find(
          (c) => c.creditItemHrid === targetCreditHrid,
        );
        if (matchedConversion) {
          creditValue =
            (itemCount / matchedConversion.itemCount) *
            matchedConversion.creditCount;
          creditAskPrice = (askPrice * itemCount) / creditValue;
          creditBidPrice = (bidPrice * itemCount) / creditValue;
        }
      }

      if (targetCreditHrid && creditAskPrice > 0) {
        priceList.push({
          name: itemName,
          ask: creditAskPrice,
          bid: creditBidPrice,
        });
      }

      if (!itemElem.querySelector("#script_itemSelector_price")) {
        itemElem.style.position = "relative";
        const priceElemHTML = `<div
                    id="script_itemSelector_price"
                    style="z-index: 1; position: absolute; top: 2px; left: 2px; text-align: left; font-size: 10px;">
                </div>`;
        itemElem
          .querySelector(".Item_item__2De2O.Item_clickable__3viV6")
          .insertAdjacentHTML("beforeend", priceElemHTML);
      }
      const priceElem = itemElem.querySelector("#script_itemSelector_price");

      if (!itemElem.querySelector("#script_itemSelector_credit")) {
        const creditElemHTML = `<div
                    id="script_itemSelector_credit"
                    style="z-index: 1; position: absolute; bottom: 2px; left: 2px; text-align: left; font-size: 10px;">
                </div>`;
        itemElem
          .querySelector(".Item_item__2De2O.Item_clickable__3viV6")
          .insertAdjacentHTML("beforeend", creditElemHTML);
      }
      const creditElem = itemElem.querySelector("#script_itemSelector_credit");

      if (order === "ask") {
        const sortValue =
          creditAskPrice > 0 ? creditAskPrice : askPrice * itemCount;
        itemContainer.style.order = Math.round(sortValue);
        priceElem.textContent = runtime.api.numberFormatter(
          creditValue > 0 ? creditValue : askPrice * itemCount,
        );
        creditElem.textContent = runtime.api.numberFormatter(sortValue);
      } else if (order === "bid") {
        const sortValue =
          creditBidPrice > 0 ? creditBidPrice : bidPrice * itemCount;
        itemContainer.style.order = Math.round(sortValue);
        priceElem.textContent = runtime.api.numberFormatter(
          creditValue > 0 ? creditValue : bidPrice * itemCount,
        );
        creditElem.textContent = runtime.api.numberFormatter(sortValue);
      } else if (order === "none") {
        itemContainer.style.order = 0;
        priceElem.textContent = "";
        creditElem.textContent = "";
      }
    });

    const bestItemSpan = selectorContainer.querySelector("#script_best_item");
    if (
      order !== "none" &&
      targetCreditHrid &&
      bestCreditConversionMap[targetCreditHrid]
    ) {
      const best = bestCreditConversionMap[targetCreditHrid][order];
      if (best) {
        if (bestItemSpan) {
          bestItemSpan.textContent = `${best.name} ${runtime.api.numberFormatter(best.price)}`;
        } else {
          const span = `<span id="script_best_item" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; font-size: 0.875rem; margin-left: 8px;">${best.name} ${runtime.api.numberFormatter(best.price)}</span>`;
          selectorContainer
            .querySelector("#script_itemSelector_sort_div")
            .insertAdjacentHTML("beforeend", span);
        }
      } else if (bestItemSpan) {
        bestItemSpan.remove();
      }
    } else if (bestItemSpan) {
      bestItemSpan.remove();
    }
  };

  selectorContainer
    .querySelector("button#script_itemSelector_sortByAsk_btn")
    .addEventListener("click", function (e) {
      sortItemsBy("ask");
    });
  selectorContainer
    .querySelector("button#script_itemSelector_sortByBid_btn")
    .addEventListener("click", function (e) {
      sortItemsBy("bid");
    });
  selectorContainer
    .querySelector("button#script_itemSelector_sortByNone_btn")
    .addEventListener("click", function (e) {
      sortItemsBy("none");
    });
}

Object.assign(runtime.api, {
  calculateNetworth,
  addInvSortButton,
  addGuildCreditConversionsSortButton,
});
