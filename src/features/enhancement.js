import { runtime } from "../core/runtime.js";

/* 添加第三方网站链接 */
function add3rdPartyLinks() {
  const waitForNavi = () => {
    const targetNode = document.querySelector(
      "div.NavigationBar_minorNavigationLinks__dbxh7",
    );
    if (targetNode) {
      let div = document.createElement("div");
      div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
      div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
      div.innerHTML = runtime.config.isZH ? "插件设置" : "Script settings";
      div.addEventListener("click", () => {
        const array = document.querySelectorAll(
          ".NavigationBar_navigationLink__3eAHA",
        );
        array[array.length - 1]?.click();
      });
      targetNode.insertAdjacentElement("afterbegin", div);

      if (runtime.config.isZH) {
        div = document.createElement("div");
        div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
        div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
        div.innerHTML = runtime.config.isZH ? "牛牛手册" : "牛牛手册";
        div.addEventListener("click", () => {
          window.open(
            "https://test-ctmd6jnzo6t9.feishu.cn/docx/KG9ddER6Eo2uPoxJFkicsvbEnCe",
            "_blank",
          );
        });
        targetNode.insertAdjacentElement("afterbegin", div);
      }

      div = document.createElement("div");
      div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
      div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
      div.innerHTML = runtime.config.isZH
        ? "利润计算 Mooneycalc"
        : "Profit calc Mooneycalc";
      div.addEventListener("click", () => {
        window.open("https://mooneycalc.netlify.app/", "_blank");
      });
      targetNode.insertAdjacentElement("afterbegin", div);

      div = document.createElement("div");
      div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
      div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
      div.innerHTML = runtime.config.isZH
        ? "利润计算 Milkonomy"
        : "Profit calc Milkonomy";
      div.addEventListener("click", () => {
        window.open("https://milkonomy.pages.dev/", "_blank");
      });
      targetNode.insertAdjacentElement("afterbegin", div);

      div = document.createElement("div");
      div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
      div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
      div.innerHTML = runtime.config.isZH
        ? "利润计算 Cowculator"
        : "Profit calc Cowculator";
      div.addEventListener("click", () => {
        window.open("https://danthegoodman.github.io/cowculator/", "_blank");
      });
      targetNode.insertAdjacentElement("afterbegin", div);

      div = document.createElement("div");
      div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
      div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
      div.innerHTML = runtime.config.isZH
        ? "强化模拟 Enhancelator"
        : "Enhancement sim Enhancelator";
      div.addEventListener("click", () => {
        window.open("https://doh-nuts.github.io/Enhancelator/", "_blank");
      });
      targetNode.insertAdjacentElement("afterbegin", div);

      div = document.createElement("div");
      div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
      div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
      div.innerHTML = runtime.config.isZH
        ? "战斗榜 socko"
        : "Combat Tracker socko";
      div.addEventListener("click", () => {
        window.open("https://sockosnewcombattracker.pages.dev/", "_blank");
      });
      targetNode.insertAdjacentElement("afterbegin", div);

      div = document.createElement("div");
      div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
      div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
      div.innerHTML = runtime.config.isZH
        ? "战斗模拟 shykai"
        : "Combat sim shykai";
      div.addEventListener("click", () => {
        window.open(
          "https://shykai.github.io/MWICombatSimulatorTest/dist/",
          "_blank",
        );
      });
      targetNode.insertAdjacentElement("afterbegin", div);
    } else {
      setTimeout(add3rdPartyLinks, 200);
    }
  };
  waitForNavi();
}

/* 动作列表菜单计算时间 */
function handleActionQueueMenue(added) {
  if (!runtime.settings.settingsMap.actionQueue.isTrue) {
    return;
  }

  handleActionQueueMenueCalculateTime(added);

  const listDiv = added.querySelector(".QueuedActions_actions__2Lur6");
  new MutationObserver((mutationsList) => {
    handleActionQueueMenueCalculateTime(added);
  }).observe(listDiv, {
    characterData: false,
    subtree: false,
    childList: true,
  });
}

function handleActionQueueMenueCalculateTime(added) {
  const actionDivList = added.querySelectorAll(
    "div.QueuedActions_action__r3HlD",
  );
  if (!actionDivList || actionDivList.length === 0) {
    return;
  }
  if (
    actionDivList.length !==
    runtime.state.currentActionsHridList.length - 1
  ) {
    console.error("handleActionQueueTooltip action queue length inconsistency");
    return;
  }

  let actionDivListIndex = 0;
  let hasSkippedfirstActionObj = false;
  let accumulatedTimeSec = 0;
  let isAccumulatedTimeInfinite = false;
  for (const actionObj of runtime.state.currentActionsHridList) {
    const actionHrid = actionObj.actionHrid;
    const count = actionObj.maxCount - actionObj.currentCount;
    let isInfinit = false;
    if (count === 0 || actionHrid.includes("/combat/")) {
      isInfinit = true;
      isAccumulatedTimeInfinite = true;
    }

    const baseTimePerActionSec =
      runtime.state.initData_actionDetailMap[actionHrid].baseTimeCost /
      1000000000;
    const totalEffBuff = runtime.api.getTotalEffiPercentage(actionHrid);
    const toolSpeedBuff = runtime.api.getToolsSpeedBuffByActionHrid(actionHrid);

    let timePerActionSec = baseTimePerActionSec / (1 + toolSpeedBuff / 100);
    timePerActionSec /= 1 + totalEffBuff / 100;
    let totalTimeSec = count * timePerActionSec;

    let str = runtime.config.isZH ? "到 ∞ " : "Complete at ∞ ";
    if (!isAccumulatedTimeInfinite) {
      accumulatedTimeSec += totalTimeSec;
      const currentTime = new Date();
      currentTime.setSeconds(currentTime.getSeconds() + accumulatedTimeSec);
      str = `${runtime.config.isZH ? "到 " : "Complete at "}${String(currentTime.getHours()).padStart(2, "0")}:${String(
        currentTime.getMinutes(),
      ).padStart(2, "0")}:${String(currentTime.getSeconds()).padStart(2, "0")}`;
    }

    if (hasSkippedfirstActionObj) {
      const html = `<div class="script_actionTime" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${
        isInfinit ? "[ ∞ ] " : `[${runtime.api.timeReadable(totalTimeSec)}]`
      } ${str}</div>`;
      if (
        actionDivList[actionDivListIndex].querySelector(
          "div div.script_actionTime",
        )
      ) {
        actionDivList[actionDivListIndex].querySelector(
          "div div.script_actionTime",
        ).innerHTML = html;
      } else {
        actionDivList[actionDivListIndex]
          .querySelector("div")
          .insertAdjacentHTML("beforeend", html);
      }
      actionDivListIndex++;
    }
    hasSkippedfirstActionObj = true;
  }
  const html = `<div id="script_queueTotalTime" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "总时间：" : "Total time: "}${
    isAccumulatedTimeInfinite
      ? "[ ∞ ] "
      : `[${runtime.api.timeReadable(accumulatedTimeSec)}]`
  }</div>`;
  if (document.querySelector("div#script_queueTotalTime")) {
    document.querySelector("div#script_queueTotalTime").innerHTML = html;
  } else {
    document
      .querySelector("div.QueuedActions_queuedActionsEditMenu__3OoQH")
      .insertAdjacentHTML("afterend", html);
  }
}

/* 支持修改版汉化插件 */
function getOriTextFromElement(elem) {
  if (!elem) {
    console.error("getTextFromElement null elem");
    return "";
  }
  const translatedfrom = elem.getAttribute("script_translatedfrom");
  if (translatedfrom) {
    return translatedfrom;
  }
  return elem.textContent;
}

/* 强化模拟器 */
async function handleItemTooltipWithEnhancementLevel(tooltip) {
  if (!runtime.settings.settingsMap.enhanceSim.isTrue) {
    return;
  }

  if (typeof math === "undefined") {
    console.error(`handleItemTooltipWithEnhancementLevel no math lib`);
    tooltip
      .querySelector(".ItemTooltipText_itemTooltipText__zFq3A")
      .insertAdjacentHTML(
        "beforeend",
        `<div style="color: ${runtime.config.SCRIPT_COLOR_ALERT};">${
          runtime.config.isZH
            ? "由于网络问题无法强化模拟: 1. 手机可能不支持脚本联网；2. 请尝试科学网络；"
            : "Enhancement sim Internet error"
        }</div>`,
      );
    return;
  }

  const itemNameElems = tooltip.querySelectorAll(
    "div.ItemTooltipText_name__2JAHA span",
  );
  let itemName = getOriTextFromElement(itemNameElems[0]);
  if (runtime.config.isZHInGameSetting) {
    itemName = runtime.api.getItemEnNameFromZhName(itemName);
  }
  const enhancementLevel = Number(
    itemNameElems[1].textContent.replace("+", ""),
  );

  let itemHrid = runtime.state.itemEnNameToHridMap[itemName];
  if (!itemHrid || !runtime.state.initData_itemDetailMap[itemHrid]) {
    console.error(
      `handleItemTooltipWithEnhancementLevel invalid itemHrid ${itemName} ${itemHrid}`,
    );
    return;
  }

  input_data.item_hrid = itemHrid;
  input_data.stop_at = enhancementLevel;
  const best = await findBestEnhanceStratWithPhiMirror(input_data);

  let appendHTMLStr = `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP};">${
    runtime.config.isZH
      ? "不支持模拟+1装备"
      : "Enhancement sim of +1 equipments not supported"
  }</div>`;
  if (best) {
    let needMatStr = "";
    if (best.costs.needMap) {
      for (const [key, value] of Object.entries(best.costs.needMap)) {
        needMatStr += `<div>${runtime.config.isZH ? runtime.data.ZHItemNames[runtime.state.initData_itemDetailMap[key].hrid] : runtime.state.initData_itemDetailMap[key].name} ${runtime.config.isZH ? "单价: " : "price per item: "}${runtime.api.numberFormatter(value)}<div>`;
      }
    }
    appendHTMLStr = `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP};"><div>${
      runtime.config.isZH
        ? "强化模拟（默认125级强化，6级房子，10级星空工具，10级手套，究极茶，幸运茶，卖单价收货，不包括工时费，不包括市场税）："
        : "Enhancement simulator: Default level 12 enhancing, level 6 house, level 10 celestial tool, level 10 gloves, ultra tea, blessed tea, sell order price in, no player time fee, no market tax: "
    }</div><div>${runtime.config.isZH ? "总成本 " : "Total cost "}${runtime.api.numberFormatter(best.totalCost.toFixed(0))}</div>
        <div>${runtime.config.isZH ? "耗时 " : "Time spend "}${best.simResult.totalActionTimeStr}</div>
        ${
          best.protect_count > 0
            ? `<div>${runtime.config.isZH ? "从 " : "Use protection from level "}` +
              best.protect_at +
              `${runtime.config.isZH ? " 级开始保护" : ""}</div>`
            : `<div>${runtime.config.isZH ? "不需要保护" : "No protection use"}</div>`
        }
        <div>${runtime.config.isZH ? "保护 " : "Protection "}${best.protect_count.toFixed(1)}${runtime.config.isZH ? " 次" : " times"}</div>
        ${
          best.costs.inputCount
            ? `<div>+${best.protect_at}${runtime.config.isZH ? "底子价格: " : " Base item Price: "}${runtime.api.numberFormatter(best.costs.baseCost)}</div>` +
              `<div>+${best.protect_at}${runtime.config.isZH ? "底子数量: " : " Base item Count: "}${runtime.api.numberFormatter(best.costs.baseCount)}</div>` +
              `<div>+${best.protect_at - 1}${runtime.config.isZH ? "材料价格: " : " Base item Price: "}${runtime.api.numberFormatter(best.costs.inputCost)}</div>` +
              `<div>+${best.protect_at - 1}${runtime.config.isZH ? "材料数量: " : " Base item Count: "}${runtime.api.numberFormatter(best.costs.inputCount)}</div>`
            : `<div>${runtime.config.isZH ? "+0底子价格: " : "+0 Base item Price: "}${runtime.api.numberFormatter(best.costs.baseCost)}</div>`
        }
        <div>${
          best.protect_count > 0
            ? (runtime.config.isZH ? "保护单价: " : "Price per protection: ") +
              (runtime.config.isZH
                ? runtime.data.ZHItemNames[
                    runtime.state.initData_itemDetailMap[
                      best.costs.choiceOfProtection
                    ].hrid
                  ]
                : runtime.state.initData_itemDetailMap[
                    best.costs.choiceOfProtection
                  ].name) +
              " " +
              runtime.api.numberFormatter(best.costs.minProtectionCost)
            : ""
        }
         </div>${needMatStr}</div>`;
  }

  tooltip
    .querySelector(".ItemTooltipText_itemTooltipText__zFq3A")
    .insertAdjacentHTML("beforeend", appendHTMLStr);
}

async function findBestEnhanceStratWithPhiMirror(input_data) {
  const price_data = await runtime.api.fetchMarketJSON();
  if (!price_data || !price_data.marketData) {
    console.error("findBestEnhanceStrat fetchMarketJSON null");
    return null;
  }

  let best = await findBestEnhanceStrat(input_data);
  if (!best) {
    return best;
  }

  const pMirrorHrid = "/items/philosophers_mirror";
  const pMirrorCost = getItemMarketPrice(pMirrorHrid, price_data);
  if (pMirrorCost <= 0) {
    return best;
  }

  const enhancementLevel = input_data.stop_at;
  if (enhancementLevel <= 3) {
    return best;
  }

  const keyRefined = "_refined";
  const refinedHrid = input_data.item_hrid;
  const isRefined = input_data.item_hrid.includes(keyRefined);

  input_data.item_hrid = isRefined
    ? input_data.item_hrid.replace(keyRefined, "")
    : input_data.item_hrid;

  const lowerBest = {};
  const lowestAt = 9; // from 9 begin
  for (let i = lowestAt; i < enhancementLevel; i++) {
    input_data.stop_at = i;
    lowerBest[i] = await findBestEnhanceStrat(input_data);
  }

  const refinedNeedMap = {};
  let refinedCost = 0;
  if (isRefined) {
    const actionHrid = runtime.api.getActionHridFromItemName(
      runtime.state.initData_itemDetailMap[refinedHrid].name,
    );
    if (
      actionHrid &&
      runtime.state.initData_actionDetailMap[actionHrid].inputItems &&
      runtime.state.initData_actionDetailMap[actionHrid].inputItems.length > 0
    ) {
      const inputItems = JSON.parse(
        JSON.stringify(
          runtime.state.initData_actionDetailMap[actionHrid].inputItems,
        ),
      );
      for (const item of inputItems) {
        refinedNeedMap[item.itemHrid] = getItemMarketPrice(
          item.itemHrid,
          price_data,
        );
        refinedCost +=
          getItemMarketPrice(item.itemHrid, price_data) * item.count;
      }
    }
  }

  const allResults = [];
  for (
    let protect_at = lowestAt + 1;
    protect_at < enhancementLevel;
    protect_at++
  ) {
    const fibonacci = [
      0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597,
      2584, 4181,
    ];

    const baseCount = fibonacci[enhancementLevel - protect_at + 1];
    const inputCount = fibonacci[enhancementLevel - protect_at];
    const protectCount = baseCount + inputCount - 1;

    const totalCost =
      baseCount * lowerBest[protect_at].totalCost +
      inputCount * lowerBest[protect_at - 1].totalCost +
      pMirrorCost * protectCount +
      refinedCost;

    const cost = {
      minProtectionCost: pMirrorCost,
      choiceOfProtection: pMirrorHrid,
      baseCost: lowerBest[protect_at].totalCost,
      baseCount: baseCount,
      inputCost: lowerBest[protect_at - 1].totalCost,
      inputCount: inputCount,
      needMap: refinedNeedMap,
    };

    const itemLevel =
      runtime.state.initData_itemDetailMap[input_data.item_hrid].itemLevel;
    const effective_level =
      input_data.enhancing_level +
      (input_data.tea_enhancing ? 3 : 0) +
      (input_data.tea_super_enhancing ? 6 : 0) +
      (input_data.tea_ultra_enhancing ? 8 : 0);
    const perActionTimeSec = (
      12 /
      (1 +
        (input_data.enhancing_level > itemLevel
          ? (effective_level +
              input_data.laboratory_level -
              itemLevel +
              input_data.glove_bonus) /
            100
          : (input_data.laboratory_level + input_data.glove_bonus) / 100))
    ).toFixed(2);
    const totalActionTimeSec = protectCount * perActionTimeSec;
    const simResult = {
      totalActionTimeStr: runtime.api.timeReadable(totalActionTimeSec),
    };

    const r = {};
    r.protect_at = protect_at;
    r.protect_count = protectCount;
    r.intput_count = inputCount;
    r.simResult = simResult;
    r.costs = cost;
    r.totalCost = totalCost;
    allResults.push(r);
  }

  for (const r of allResults) {
    if (r.totalCost < best.totalCost) {
      best = r;
    }
  }
  return best;
}

async function findBestEnhanceStrat(input_data) {
  const price_data = await runtime.api.fetchMarketJSON();
  if (!price_data || !price_data.marketData) {
    console.error("findBestEnhanceStrat fetchMarketJSON null");
    return [];
  }

  const allResults = [];
  for (let protect_at = 2; protect_at <= input_data.stop_at; protect_at++) {
    const simResult = Enhancelate(input_data, protect_at);
    const costs = getCosts(input_data.item_hrid, price_data);
    const totalCost =
      costs.baseCost +
      costs.minProtectionCost * simResult.protect_count +
      costs.perActionCost * simResult.actions;
    const r = {};
    r.protect_at = protect_at;
    r.protect_count = simResult.protect_count;
    r.simResult = simResult;
    r.costs = costs;
    r.totalCost = totalCost;
    allResults.push(r);
  }

  let best = null;
  for (const r of allResults) {
    if (best === null || r.totalCost < best.totalCost) {
      best = r;
    }
  }
  return best;
}

// Source: https://doh-nuts.github.io/Enhancelator/
function Enhancelate(input_data, protect_at) {
  const success_rate = [
    50, //+1
    45, //+2
    45, //+3
    40, //+4
    40, //+5
    40, //+6
    35, //+7
    35, //+8
    35, //+9
    35, //+10
    30, //+11
    30, //+12
    30, //+13
    30, //+14
    30, //+15
    30, //+16
    30, //+17
    30, //+18
    30, //+19
    30, //+20
  ];

  // 物品等级
  const itemLevel =
    runtime.state.initData_itemDetailMap[input_data.item_hrid].itemLevel;

  // 总强化buff
  let total_bonus = null;
  const effective_level =
    input_data.enhancing_level +
    (input_data.tea_enhancing ? 3 : 0) +
    (input_data.tea_super_enhancing ? 6 : 0) +
    (input_data.tea_ultra_enhancing ? 8 : 0);
  if (effective_level >= itemLevel) {
    total_bonus =
      1 +
      (0.05 * (effective_level + input_data.laboratory_level - itemLevel) +
        input_data.enhancer_bonus) /
        100;
  } else {
    total_bonus =
      1 -
      0.5 * (1 - effective_level / itemLevel) +
      (0.05 * input_data.laboratory_level + input_data.enhancer_bonus) / 100;
  }

  // 模拟
  let markov = math.zeros(20, 20);
  for (let i = 0; i < input_data.stop_at; i++) {
    const success_chance = (success_rate[i] / 100.0) * total_bonus;
    const destination = i >= protect_at ? i - 1 : 0;
    if (input_data.tea_blessed) {
      markov.set([i, i + 2], success_chance * 0.01);
      markov.set([i, i + 1], success_chance * 0.99);
      markov.set([i, destination], 1 - success_chance);
    } else {
      markov.set([i, i + 1], success_chance);
      markov.set([i, destination], 1.0 - success_chance);
    }
  }
  markov.set([input_data.stop_at, input_data.stop_at], 1.0);
  let Q = markov.subset(
    math.index(
      math.range(0, input_data.stop_at),
      math.range(0, input_data.stop_at),
    ),
  );
  const M = math.inv(math.subtract(math.identity(input_data.stop_at), Q));
  const attemptsArray = M.subset(
    math.index(math.range(0, 1), math.range(0, input_data.stop_at)),
  );
  const attempts = math
    .flatten(math.row(attemptsArray, 0).valueOf())
    .reduce((a, b) => a + b, 0);
  const protectAttempts = M.subset(
    math.index(math.range(0, 1), math.range(protect_at, input_data.stop_at)),
  );
  const protectAttemptsArray =
    typeof protectAttempts === "number"
      ? [protectAttempts]
      : math.flatten(math.row(protectAttempts, 0).valueOf());
  const protects = protectAttemptsArray
    .map((a, i) => a * markov.get([i + protect_at, i + protect_at - 1]))
    .reduce((a, b) => a + b, 0);

  // 动作时间
  const perActionTimeSec = (
    12 /
    (1 +
      (input_data.enhancing_level > itemLevel
        ? (effective_level +
            input_data.laboratory_level -
            itemLevel +
            input_data.glove_bonus) /
          100
        : (input_data.laboratory_level + input_data.glove_bonus) / 100))
  ).toFixed(2);

  const result = {};
  result.actions = attempts;
  result.protect_count = protects;
  result.totalActionTimeSec = perActionTimeSec * attempts;
  result.totalActionTimeStr = runtime.api.timeReadable(
    result.totalActionTimeSec,
  );
  return result;
}

// 自定义强化模拟输入参数
// Customization
let input_data = {
  item_hrid: null,
  stop_at: null,

  enhancing_level: 125, // 人物 Enhancing 技能等级
  laboratory_level: 6, // 房子等级
  enhancer_bonus: 5.42, // 工具提高成功率，10级星空强化工具
  glove_bonus: 12.9, // 手套提高强化速度，0级=10，5级=11.2，10级=12.9

  tea_enhancing: false, // 强化茶
  tea_super_enhancing: false, // 超级强化茶
  tea_ultra_enhancing: true,
  tea_blessed: true, // 祝福茶

  priceAskBidRatio: 1, // 取市场卖单价买单价比例，1=只用卖单价，0=只用买单价
};

function getCosts(hrid, price_data) {
  const itemDetailObj = runtime.state.initData_itemDetailMap[hrid];

  // +0本体成本
  const baseCost = getRealisticBaseItemPrice(hrid, price_data);

  // 保护成本
  let minProtectionPrice = null;
  let minProtectionHrid = null;
  let protect_item_hrids =
    itemDetailObj.protectionItemHrids == null
      ? [hrid, "/items/mirror_of_protection"]
      : [hrid, "/items/mirror_of_protection"].concat(
          itemDetailObj.protectionItemHrids,
        );
  protect_item_hrids.forEach((protection_hrid, i) => {
    const this_cost = getRealisticBaseItemPrice(protection_hrid, price_data);
    if (i === 0) {
      minProtectionPrice = this_cost;
      minProtectionHrid = protection_hrid;
    } else {
      if (
        this_cost > 0 &&
        (minProtectionPrice < 0 || this_cost < minProtectionPrice)
      ) {
        minProtectionPrice = this_cost;
        minProtectionHrid = protection_hrid;
      }
    }
  });

  // 强化材料成本
  const needMap = {};
  let totalNeedPrice = 0;
  for (const need of itemDetailObj.enhancementCosts) {
    const price = need.itemHrid.startsWith("/items/trainee_")
      ? 250000
      : getItemMarketPrice(need.itemHrid, price_data); // Trainee charms have a fixed price of 250k
    totalNeedPrice += price * need.count;
    if (!need.itemHrid.includes("/coin")) {
      needMap[need.itemHrid] = price;
    }
  }

  return {
    baseCost: baseCost,
    minProtectionCost: minProtectionPrice,
    perActionCost: totalNeedPrice,
    choiceOfProtection: minProtectionHrid,
    needMap: needMap,
  };
}

function getRealisticBaseItemPrice(hrid, price_data) {
  const itemDetailObj = runtime.state.initData_itemDetailMap[hrid];
  const productionCost = getBaseItemProductionCost(
    itemDetailObj.name,
    price_data,
  ); // Inacuracy warning: productionCost is unreliable, it may be low or 0 due to missing market data.

  const item_price_data = price_data.marketData[hrid];
  const ask = item_price_data?.[0]?.a;
  const bid = item_price_data?.[0]?.b;

  let result = 0;

  if (ask && ask > 0) {
    if (bid && bid > 0) {
      // Both ask and bid.
      if (ask / bid > 1.3) {
        result = Math.max(bid, productionCost);
      } else {
        result = ask;
      }
    } else {
      // Only ask.
      if (ask / productionCost > 1.3) {
        result = productionCost;
      } else {
        result = Math.max(ask, productionCost);
      }
    }
  } else {
    if (bid && bid > 0) {
      // Only bid.
      result = Math.max(bid, productionCost);
    } else {
      // Neither ask nor bid.
      result = productionCost;
    }
  }

  return result;
}

function getItemMarketPrice(hrid, price_data) {
  const item_price_data = price_data.marketData[hrid];

  // Return 0 if the item does not have neither ask nor bid prices for enhancement level 0.
  if (
    !item_price_data ||
    !item_price_data[0] ||
    (item_price_data[0].a < 0 && item_price_data[0].b < 0)
  ) {
    return 0;
  }

  // Return the other price if the item does not have ask or bid price.
  let ask = item_price_data[0]?.a;
  let bid = item_price_data[0]?.b;
  if (ask > 0 && bid < 0) {
    return ask;
  }
  if (bid > 0 && ask < 0) {
    return bid;
  }

  let final_cost =
    ask * input_data.priceAskBidRatio + bid * (1 - input_data.priceAskBidRatio);
  return final_cost;
}

// +0底子制作成本，仅单层制作，考虑茶减少消耗
function getBaseItemProductionCost(itemName, price_data) {
  const actionHrid = runtime.api.getActionHridFromItemName(itemName);
  if (!actionHrid || !runtime.state.initData_actionDetailMap[actionHrid]) {
    return -1;
  }

  let totalPrice = 0;

  const inputItems = JSON.parse(
    JSON.stringify(
      runtime.state.initData_actionDetailMap[actionHrid].inputItems,
    ),
  );
  for (let item of inputItems) {
    totalPrice += getItemMarketPrice(item.itemHrid, price_data) * item.count;
  }
  totalPrice *= 0.9; // 茶减少消耗

  const upgradedFromItemHrid =
    runtime.state.initData_actionDetailMap[actionHrid]?.upgradeItemHrid;
  if (upgradedFromItemHrid) {
    totalPrice += getItemMarketPrice(upgradedFromItemHrid, price_data) * 1;
  }

  return totalPrice;
}

Object.assign(runtime.api, {
  add3rdPartyLinks,
  handleActionQueueMenue,
  handleActionQueueMenueCalculateTime,
  getOriTextFromElement,
  handleItemTooltipWithEnhancementLevel,
  findBestEnhanceStratWithPhiMirror,
  findBestEnhanceStrat,
  Enhancelate,
  getCosts,
  getRealisticBaseItemPrice,
  getItemMarketPrice,
  getBaseItemProductionCost,
});

Object.defineProperties(runtime.state, {
  input_data: {
    enumerable: true,
    get() {
      return input_data;
    },
    set(value) {
      input_data = value;
    },
  },
});
