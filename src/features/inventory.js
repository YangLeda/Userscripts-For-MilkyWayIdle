import { runtime } from "../core/runtime.js";

let networthWatcherStarted = false;
let guildCreditWatcherStarted = false;
let networthRefreshTimer = null;

function numberHtml(value) {
  return `<span class="mwi-number" title="${runtime.api.formatExactNumber(value)}">${runtime.api.numberFormatter(value)}</span>`;
}

function isTerminalMarketListing(listing) {
  if (
    listing?.isDone ||
    listing?.isCancelled ||
    listing?.isCanceled ||
    listing?.isExpired
  ) {
    return true;
  }
  return /(cancel|complete|expire|closed|done)/i.test(
    String(listing?.status ?? ""),
  );
}

function calculateMarketListingValues(listings) {
  const totals = { fair: 0, ask: 0, bid: 0 };
  for (const listing of listings ?? []) {
    const enhancementLevel = listing.enhancementLevel ?? 0;
    const assetValue = runtime.api.getAssetValue(
      listing.itemHrid,
      enhancementLevel,
    );
    const askPrice = runtime.api.getAskPrice(
      listing.itemHrid,
      enhancementLevel,
    );
    const bidPrice = runtime.api.getBidPrice(
      listing.itemHrid,
      enhancementLevel,
    );
    const availableCoins = Math.max(0, Number(listing.coinsAvailable ?? 0));
    const unclaimedCoins = Math.max(0, Number(listing.unclaimedCoinCount ?? 0));
    const explicitCoins = availableCoins + unclaimedCoins;
    totals.fair += explicitCoins;
    totals.ask += explicitCoins;
    totals.bid += explicitCoins;

    const unclaimedItems = Math.max(0, Number(listing.unclaimedItemCount ?? 0));
    totals.fair += unclaimedItems * assetValue;
    totals.ask += unclaimedItems * askPrice;
    totals.bid += unclaimedItems * bidPrice;

    if (!listing.isSell || isTerminalMarketListing(listing)) continue;
    const remainingQuantity = Math.max(
      0,
      Number(listing.orderQuantity ?? 0) - Number(listing.filledQuantity ?? 0),
    );
    const taxMultiplier = 1 - runtime.api.getMarketTaxRate(listing.itemHrid);
    totals.fair += remainingQuantity * assetValue;
    totals.ask += remainingQuantity * askPrice * taxMultiplier;
    totals.bid += remainingQuantity * bidPrice * taxMultiplier;
  }
  return totals;
}

function scheduleNetworthRefresh() {
  if (!Array.isArray(runtime.state.initData_characterItems)) return;
  clearTimeout(networthRefreshTimer);
  networthRefreshTimer = setTimeout(() => calculateNetworth(), 100);
}

/* 计算Networth */
async function calculateNetworth() {
  if (!Array.isArray(runtime.state.initData_characterItems)) return;
  const marketAPIJson = await runtime.api.fetchMarketJSON();
  if (!marketAPIJson && !Object.keys(runtime.state.marketItemValues).length) {
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
  let marketListingsFairValue = 0;
  let equippedFairValue = 0;
  let inventoryFairValue = 0;
  let nonTradableTokenValue = 0;

  for (const item of runtime.state.initData_characterItems) {
    const enhanceLevel = item.enhancementLevel;
    const askPrice = runtime.api.getAskPrice(item.itemHrid, enhanceLevel);
    const bidPrice = runtime.api.getBidPrice(item.itemHrid, enhanceLevel);
    const fairValue = runtime.api.getAssetValue(item.itemHrid, enhanceLevel);
    if (item.itemLocationHrid !== "/item_locations/inventory") {
      equippedNetworthAsk += item.count * askPrice;
      equippedNetworthBid += item.count * bidPrice;
      equippedFairValue += item.count * fairValue;
    } else {
      inventoryNetworthAsk += item.count * askPrice;
      inventoryNetworthBid += item.count * bidPrice;
      if (runtime.api.isNonTradableTokenAsset(item.itemHrid)) {
        nonTradableTokenValue += item.count * fairValue;
      } else {
        inventoryFairValue += item.count * fairValue;
      }
    }
  }

  const listingValues = calculateMarketListingValues(
    runtime.state.initData_myMarketListings,
  );
  marketListingsFairValue = listingValues.fair;
  marketListingsNetworthAsk = listingValues.ask;
  marketListingsNetworthBid = listingValues.bid;

  networthAsk =
    equippedNetworthAsk + inventoryNetworthAsk + marketListingsNetworthAsk;
  networthBid =
    equippedNetworthBid + inventoryNetworthBid + marketListingsNetworthBid;
  const currentAssetsFairValue =
    equippedFairValue + inventoryFairValue + marketListingsFairValue;

  /* 仓库搜索栏下方显示人物总结 */
  // Some code of networth summery is by Stella.
  const addInventorySummery = async (invElem) => {
    const scores = await runtime.api.getSelfBuildScores();
    const guildShrineValue = runtime.api.getGuildShrineValue();
    const totalNetworth =
      currentAssetsFairValue +
      (scores.assets.allHouses + scores.assets.allAbilities) * 1000000 +
      nonTradableTokenValue +
      (guildShrineValue ?? 0);

    const previousSummary = invElem.parentElement?.querySelector(
      "#script_inventory_summary",
    );
    const wasCombatScoreOpen =
      previousSummary?.querySelector("#buildScores")?.style.display === "block";
    const wasSkillingScoreOpen =
      previousSummary?.querySelector("#skillingScores")?.style.display ===
      "block";
    const wasNetworthOpen =
      previousSummary?.querySelector("#netWorthDetails")?.style.display ===
      "block";
    previousSummary?.remove();

    invElem.insertAdjacentHTML(
      "beforebegin",
      `<div id="script_inventory_summary" style="text-align: left; color: ${runtime.config.SCRIPT_COLOR_MAIN}; font-size: 0.875rem;">
                <!-- 战斗着装评分 -->
                <div style="cursor: pointer; font-weight: bold" id="toggleScores">${
                  runtime.config.isZH
                    ? "+ 战斗着装评分："
                    : "+ Combat Gear Score: "
                }${runtime.api.formatScore(scores.battle.total)}</div>
                <div id="buildScores" style="display: none; margin-left: 20px;">
                        <div>${runtime.config.isZH ? "房屋：" : "House: "}${runtime.api.formatScore(scores.battle.house)}</div>
                        <div>${runtime.config.isZH ? "技能：" : "Abilities: "}${runtime.api.formatScore(scores.battle.abilities)}</div>
                        <div>${runtime.config.isZH ? "装备：" : "Equipment: "}${runtime.api.formatScore(scores.battle.equipment)}</div>
                </div>

                <!-- 生活着装评分 -->
                <div style="cursor: pointer; font-weight: bold" id="toggleSkillingScores">${
                  runtime.config.isZH
                    ? "+ 生活着装评分："
                    : "+ Skilling Gear Score: "
                }${runtime.api.formatScore(scores.skilling.total)}</div>
                <div id="skillingScores" style="display: none; margin-left: 20px;">
                        <div>${runtime.config.isZH ? "房屋：" : "House: "}${runtime.api.formatScore(scores.skilling.house)}</div>
                        <div>${runtime.config.isZH ? "工具：" : "Tools: "}${runtime.api.formatScore(scores.skilling.tools)}</div>
                        <div>${runtime.config.isZH ? "装备：" : "Equipment: "}${runtime.api.formatScore(scores.skilling.equipment)}</div>
                </div>

                <!-- 总资产价值 -->
                <div style="cursor: pointer; font-weight: bold;" id="toggleNetWorth">
                    ${runtime.config.isZH ? "+ 总资产价值：" : "+ Total Asset Value: "}${numberHtml(totalNetworth)}
                </div>

                <div id="netWorthDetails" style="display: none; margin-left: 20px;">
                    <!-- 流动资产 -->
                    <div style="cursor: pointer;" id="toggleCurrentAssets">
                        ${runtime.config.isZH ? "+ 流动资产价值" : "+ Current assets value"}
                    </div>
                    <div id="currentAssets" style="display: none; margin-left: 20px;">
                        <div>${runtime.config.isZH ? "装备价值：" : "Equipment value: "}${numberHtml(equippedFairValue)}</div>
                        <div>${runtime.config.isZH ? "库存价值：" : "Inventory value: "}${numberHtml(inventoryFairValue)}</div>
                        <div>${runtime.config.isZH ? "订单价值：" : "Market listing value: "}${numberHtml(marketListingsFairValue)}</div>
                    </div>

                    <!-- 非流动资产 -->
                    <div style="cursor: pointer;" id="toggleNonCurrentAssets">
                        ${runtime.config.isZH ? "+ 非流动资产价值" : "+ Fixed assets value"}
                    </div>
                    <div id="nonCurrentAssets" style="display: none; margin-left: 20px;">
                        <div>${runtime.config.isZH ? "房子价值：" : "Houses value: "}${numberHtml(scores.assets.allHouses * 1000000)}</div>
                        <div>${runtime.config.isZH ? "技能价值：" : "Abilities value: "}${numberHtml(scores.assets.allAbilities * 1000000)}</div>
                        <div>${runtime.config.isZH ? "不可交易代币：" : "Non-tradable Tokens: "}${numberHtml(nonTradableTokenValue)}</div>
                        <div>${runtime.config.isZH ? "神龛：" : "Shrine: "}${guildShrineValue === null ? "—" : numberHtml(guildShrineValue)}</div>
                    </div>
                </div>
            </div>`,
    );

    // 监听点击事件，控制折叠和展开
    const summary = invElem.parentElement.querySelector(
      "#script_inventory_summary",
    );
    const toggleScores = summary.querySelector("#toggleScores");
    const ScoreDetails = summary.querySelector("#buildScores");
    const toggleSkillingScores = summary.querySelector("#toggleSkillingScores");
    const skillingScoreDetails = summary.querySelector("#skillingScores");
    const toggleButton = summary.querySelector("#toggleNetWorth");
    const netWorthDetails = summary.querySelector("#netWorthDetails");
    const toggleCurrentAssets = summary.querySelector("#toggleCurrentAssets");
    const currentAssets = summary.querySelector("#currentAssets");
    const toggleNonCurrentAssets = summary.querySelector(
      "#toggleNonCurrentAssets",
    );
    const nonCurrentAssets = summary.querySelector("#nonCurrentAssets");

    if (wasNetworthOpen) {
      netWorthDetails.style.display = "block";
      currentAssets.style.display = "block";
      nonCurrentAssets.style.display = "block";
    }
    if (wasCombatScoreOpen) {
      ScoreDetails.style.display = "block";
      toggleScores.textContent =
        "↓ " +
        (runtime.config.isZH ? "战斗着装评分：" : "Combat Gear Score: ") +
        runtime.api.formatScore(scores.battle.total);
    }
    if (wasSkillingScoreOpen) {
      skillingScoreDetails.style.display = "block";
      toggleSkillingScores.textContent =
        "↓ " +
        (runtime.config.isZH ? "生活着装评分：" : "Skilling Gear Score: ") +
        runtime.api.formatScore(scores.skilling.total);
    }

    toggleScores.addEventListener("click", () => {
      const isCollapsed = ScoreDetails.style.display === "none";
      ScoreDetails.style.display = isCollapsed ? "block" : "none";
      toggleScores.textContent =
        (isCollapsed ? "↓ " : "+ ") +
        (runtime.config.isZH ? "战斗着装评分：" : "Combat Gear Score: ") +
        runtime.api.formatScore(scores.battle.total);
    });

    toggleSkillingScores.addEventListener("click", () => {
      const isCollapsed = skillingScoreDetails.style.display === "none";
      skillingScoreDetails.style.display = isCollapsed ? "block" : "none";
      toggleSkillingScores.textContent =
        (isCollapsed ? "↓ " : "+ ") +
        (runtime.config.isZH ? "生活着装评分：" : "Skilling Gear Score: ") +
        runtime.api.formatScore(scores.skilling.total);
    });

    toggleButton.addEventListener("click", () => {
      const isCollapsed = netWorthDetails.style.display === "none";
      netWorthDetails.style.display = isCollapsed ? "block" : "none";
      toggleButton.innerHTML = `${isCollapsed ? "↓ " : "+ "}${
        runtime.config.isZH ? "总资产价值：" : "Total Asset Value: "
      }${numberHtml(totalNetworth)}`;
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
      const headerHTML = `<div id="script_current_assets" style="font-size: 0.875rem; font-weight: 500; color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-wrap: nowrap;">Current Assets: ${numberHtml(
        currentAssetsFairValue,
      )} (Ask/Bid: ${numberHtml(networthAsk)} / ${numberHtml(networthBid)})${`<div id="script_api_fail_alert" style="color: ${runtime.config.SCRIPT_COLOR_ALERT};">${
        runtime.config.isZH
          ? "无法从API更新市场数据"
          : "Can't update market prices"
      }</div>`}</div>`;
      const currentHeader = document.querySelector("#script_current_assets");
      if (currentHeader) currentHeader.outerHTML = headerHTML;
      else targetNode.insertAdjacentHTML("afterend", headerHTML);

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

      if (!document.querySelector("#script_api_fail_popout")) {
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="script_api_fail_popout" style="display: none; position: absolute; top: 50px; left: 0; padding: 10px; background: white; border: 1px solid black; box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2); border-radius: 8px; white-space: pre-wrap;"></div>`,
        );
      }

      const popout = document.querySelector("#script_api_fail_popout");
      if (popout) {
        popout.onclick = function () {
          const popout = document.querySelector("#script_api_fail_popout");
          popout.style.display =
            popout.style.display === "block" ? "none" : "block";
        };
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

  const renderInventoryPanels = () => {
    const targetNodes = document.querySelectorAll("div.Inventory_items__6SXv0");
    for (const node of targetNodes) {
      if (runtime.settings.settingsMap.invWorth.isTrue) {
        node.classList.add("script_buildScore_added");
        addInventorySummery(node);
      }
      if (runtime.settings.settingsMap.invSort.isTrue) {
        if (!node.classList.contains("script_invSort_added")) {
          node.classList.add("script_invSort_added");
          addInvSortButton(node);
        }
      }
    }
  };
  renderInventoryPanels();

  if (!networthWatcherStarted) {
    networthWatcherStarted = true;
    const waitForInv = () => {
      const hasNewPanel = [
        ...document.querySelectorAll("div.Inventory_items__6SXv0"),
      ].some((node) => !node.classList.contains("script_buildScore_added"));
      if (hasNewPanel) scheduleNetworthRefresh();
      setTimeout(waitForInv, 1000);
    };
    waitForInv();
  }

  const waitGuildCreditConversionsSelect = () => {
    if (runtime.settings.settingsMap.guildCreditConversionsSort.isTrue)
      addGuildCreditConversionsSortButton();

    setTimeout(waitGuildCreditConversionsSelect, 1000);
  };
  if (!guildCreditWatcherStarted) {
    guildCreditWatcherStarted = true;
    waitGuildCreditConversionsSelect();
  }
}

/* 仓库物品排序 */
// by daluo, bot7420
async function addInvSortButton(invElem) {
  const price_data = await runtime.api.fetchMarketJSON();
  if (!price_data || !price_data.marketData) {
    console.error("addInvSortButton fetchMarketJSON null");
    return;
  }

  const fairButton = `<button
        id="script_sortByFair_btn"
        style="border-radius: 3px; background-color: ${runtime.config.SCRIPT_COLOR_MAIN}; color: black;">
        ${runtime.config.isZH ? "市场价值" : "Market Value"}
        </button>`;
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
  }${fairButton} ${askButton} ${bidButton} ${noneButton}</div>`;
  invElem.insertAdjacentHTML("beforebegin", buttonsDiv);

  invElem.parentElement
    .querySelector("button#script_sortByFair_btn")
    .addEventListener("click", function () {
      sortItemsBy("fair");
    });
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
        itemCount = runtime.api.parseCompactNumber(itemCount);
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
        const itemFairWorth = runtime.api.getFairValue(itemHrid, 0) * itemCount;

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
        if (order === "fair") {
          itemElem.style.order = -itemFairWorth;
          priceElem.textContent = runtime.api.numberFormatter(itemFairWorth);
        } else if (order === "ask") {
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
      itemCount = runtime.api.parseCompactNumber(itemCount);
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
  calculateMarketListingValues,
  scheduleNetworthRefresh,
  addInvSortButton,
  addGuildCreditConversionsSortButton,
});
