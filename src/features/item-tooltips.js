import { runtime } from "../core/runtime.js";

const TOUCH_PROFIT_LONG_PRESS_MS = 800;
const TOUCH_PROFIT_MOVE_TOLERANCE = 12;

let profitHoverContext = null;
let profitShortcutHeld = false;
let touchProfitPress = null;
let touchProfitAuthorizedUntil = 0;

function isEditableTarget(target) {
  return Boolean(
    target?.closest?.('input,textarea,select,[contenteditable="true"]'),
  );
}

function requiresProfitShortcut() {
  return Boolean(
    runtime.settings.settingsMap.itemTooltip_profitRequireKey?.isTrue,
  );
}

function canShowTooltipProfit() {
  return Boolean(
    runtime.settings.settingsMap.itemTooltip_profit?.isTrue &&
    !runtime.api.shouldSuppressMarketFeatures?.(),
  );
}

function showProfitContext(context = profitHoverContext, options = {}) {
  if (!context?.anchor?.isConnected || !canShowTooltipProfit()) {
    runtime.api.dismissHoverPanel?.();
    return null;
  }
  return runtime.api.showProductionProfitPanel?.(
    context.anchor,
    context.itemHrid ?? null,
    {
      actionHrid: context.actionHrid,
      sticky: Boolean(options.sticky),
    },
  );
}

function setProfitHoverContext(context) {
  profitHoverContext = context;
  if (!canShowTooltipProfit()) {
    runtime.api.dismissHoverPanel?.();
    return;
  }
  if (!requiresProfitShortcut() || profitShortcutHeld) {
    showProfitContext(context);
    return;
  }
  if (Date.now() <= touchProfitAuthorizedUntil) {
    touchProfitAuthorizedUntil = 0;
    showProfitContext(context, { sticky: true });
    return;
  }
  if (touchProfitPress?.authorized) {
    touchProfitPress.triggered = true;
    showProfitContext(context, { sticky: true });
    return;
  }
  runtime.api.dismissHoverPanel?.();
}

function clearProfitHoverContext(anchor = null) {
  if (anchor && profitHoverContext?.anchor !== anchor) return;
  clearTimeout(touchProfitPress?.timer);
  touchProfitPress = null;
  touchProfitAuthorizedUntil = 0;
  profitHoverContext = null;
  runtime.api.dismissHoverPanel?.();
}

function removeSuppressedTooltipContent() {
  document
    .querySelectorAll('[data-mwitools-tooltip-market="true"]')
    .forEach((row) => row.remove());
}

/* 显示当前动作总时间 */
const showTotalActionTime = () => {
  const targetNode = document.querySelector("div.Header_actionName__31-L2");
  if (targetNode) {
    console.log(
      runtime.config.isZH
        ? "[MWITools] 开始监听行动进度栏。"
        : "[MWITools] Started observing the action progress bar.",
    );
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
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const normalized = Math.round(sec);
  if (normalized >= 86_400) {
    const days = Math.floor(normalized / 86_400);
    const hours = Math.floor((normalized % 86_400) / 3_600);
    const minutes = Math.floor((normalized % 3_600) / 60);
    const parts = [runtime.config.isZH ? `${days}天` : `${days}d`];
    if (hours > 0) {
      parts.push(runtime.config.isZH ? `${hours}小时` : `${hours}h`);
    }
    if (minutes > 0) {
      parts.push(runtime.config.isZH ? `${minutes}分` : `${minutes}m`);
    }
    return parts.join(runtime.config.isZH ? "" : " ");
  }
  const d = new Date(normalized * 1000);
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
      if (
        added?.nodeType === 1 &&
        added.classList.contains("MuiTooltip-popper")
      ) {
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
        } else if (runtime.settings.settingsMap.itemTooltip_profit.isTrue) {
          const actionHrid = resolveGatheringActionFromElement(added);
          if (actionHrid) {
            setProfitHoverContext({ anchor: added, actionHrid });
          }
        }
      }
    }
  }
});

const GATHERING_ACTION_TYPES = new Set([
  "/action_types/foraging",
  "/action_types/milking",
  "/action_types/woodcutting",
]);
const GATHERING_CARD_SELECTOR = [
  '[data-action-hrid^="/actions/"]',
  '[class*="SkillAction_skillAction"]',
  '[class*="GatheringProductionSkillPanel_action"]',
].join(",");

function reactFiberKey(element) {
  return Object.keys(element ?? {}).find(
    (key) =>
      key.startsWith("__reactFiber$") ||
      key.startsWith("__reactInternalInstance$"),
  );
}

function gatheringActionHrid(value) {
  const hrid = String(value ?? "");
  const detail = runtime.state.initData_actionDetailMap?.[hrid];
  return GATHERING_ACTION_TYPES.has(detail?.type) ? hrid : "";
}

function actionHridFromReactValue(value, depth = 0, seen = new Set()) {
  if (!value || depth > 3 || typeof value !== "object" || seen.has(value)) {
    return "";
  }
  seen.add(value);
  for (const key of ["actionHrid", "hrid"]) {
    const actionHrid = gatheringActionHrid(value[key]);
    if (actionHrid) return actionHrid;
  }
  for (const key of [
    "actionDetail",
    "action",
    "detail",
    "selectedAction",
    "children",
    "props",
  ]) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      for (const entry of nested) {
        const actionHrid = actionHridFromReactValue(entry, depth + 1, seen);
        if (actionHrid) return actionHrid;
      }
      continue;
    }
    const actionHrid = actionHridFromReactValue(nested, depth + 1, seen);
    if (actionHrid) return actionHrid;
  }
  return "";
}

export function resolveGatheringActionFromElement(element) {
  for (let current = element; current; current = current.parentElement) {
    const direct = gatheringActionHrid(
      current.dataset?.actionHrid ?? current.getAttribute?.("data-action-hrid"),
    );
    if (direct) return direct;
    const key = reactFiberKey(current);
    let fiber = key ? current[key] : null;
    for (let depth = 0; fiber && depth < 8; depth += 1) {
      for (const value of [
        fiber.memoizedProps,
        fiber.pendingProps,
        fiber.memoizedState,
        fiber.stateNode?.props,
        fiber.stateNode?.state,
      ]) {
        const fromFiber = actionHridFromReactValue(value);
        if (fromFiber) return fromFiber;
      }
      fiber = fiber.return;
    }
    if (current.classList?.contains("MuiTooltip-popper")) break;
  }

  const texts = [
    runtime.api.getOriTextFromElement?.(element),
    element?.textContent,
    ...[...(element?.querySelectorAll?.("div,span") ?? [])]
      .filter((node) => String(node.textContent ?? "").trim().length <= 80)
      .map(
        (node) => runtime.api.getOriTextFromElement?.(node) ?? node.textContent,
      ),
  ]
    .map((text) =>
      String(text ?? "")
        .replaceAll(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  const matches = Object.values(runtime.state.initData_actionDetailMap ?? {})
    .filter((detail) => GATHERING_ACTION_TYPES.has(detail?.type))
    .filter((detail) => {
      const names = [detail.name, runtime.data.ZHActionNames?.[detail.hrid]]
        .map((name) => String(name ?? "").trim())
        .filter(Boolean);
      return texts.some((text) => names.includes(text));
    })
    .sort(
      (left, right) =>
        Number(left.sortIndex ?? 0) - Number(right.sortIndex ?? 0) ||
        String(left.hrid).localeCompare(String(right.hrid)),
    );
  return matches[0]?.hrid ?? "";
}

function gatheringCardFromEventTarget(target) {
  return target?.closest?.(GATHERING_CARD_SELECTOR) ?? null;
}

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
    clearProfitHoverContext();
    runtime.api.dismissHoverPanel?.();
    runtime.api.handleItemTooltipWithEnhancementLevel(tooltip);
    return;
  }

  runtime.api.hideEnhancementCostPanel?.();

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
  const suppressMarket = Boolean(runtime.api.shouldSuppressMarketFeatures?.());
  if (
    runtime.settings.settingsMap.itemTooltip_prices.isTrue &&
    !suppressMarket
  ) {
    marketJson = await fetchMarketJSON();
    if (!marketJson || !marketJson.marketData) {
      console.error(
        runtime.config.isZH
          ? "[MWITools] 物品悬浮窗无法取得市场数据。"
          : "[MWITools] Item tooltip market data is unavailable.",
      );
    }

    ask = marketJson?.marketData[itemHrid]?.[0]?.a ?? 0;
    bid = marketJson?.marketData[itemHrid]?.[0]?.b ?? 0;
    fairValue = runtime.api.getFairValue(itemHrid, 0);
    appendHTMLStr += `
    <div data-mwitools-tooltip-market="true" style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP};">${runtime.config.isZH ? "市场价值：" : "Market value: "}${fairValue > 0 ? numberFormatter(fairValue) : "-"}${fairValue > 0 && amount > 0 ? ` (${numberFormatter(fairValue * amount)})` : ""}</div>
    <div data-mwitools-tooltip-market="true" style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP};">${runtime.config.isZH ? "价格: " : "Price: "}${numberFormatter(ask)} / ${numberFormatter(bid)} (${
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
      const pricePer100Hp = !suppressMarket && ask ? ask / (hp / 100) : null;
      const usePerday = (24 * 60 * 60) / (cd / 1000000000);
      appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">${
        pricePer100Hp
          ? `<span data-mwitools-tooltip-market="true">${
              pricePer100Hp.toFixed(0) +
              (runtime.config.isZH ? "金/100血, " : "coins/100hp, ")
            }</span>`
          : ""
      }${hpPerMiniute.toFixed(0) + (runtime.config.isZH ? "血/分" : "hp/min")}, ${usePerday.toFixed(0)}${runtime.config.isZH ? "个/天" : "/day"}</div>`;
    } else if (mp && cd) {
      const mpPerMiniute = (60 / (cd / 1000000000)) * mp;
      const pricePer100Mp = !suppressMarket && ask ? ask / (mp / 100) : null;
      const usePerday = (24 * 60 * 60) / (cd / 1000000000);
      appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">${
        pricePer100Mp
          ? `<span data-mwitools-tooltip-market="true">${
              pricePer100Mp.toFixed(0) +
              (runtime.config.isZH ? "金/100蓝, " : "coins/100mp, ")
            }</span>`
          : ""
      }${mpPerMiniute.toFixed(0) + (runtime.config.isZH ? "蓝/分" : "mp/min")}, ${usePerday.toFixed(0)}${runtime.config.isZH ? "个/天" : "/day"}</div>`;
    } else if (cd) {
      const usePerday = (24 * 60 * 60) / (cd / 1000000000);
      appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}">${usePerday.toFixed(0)}${runtime.config.isZH ? "个/天" : "/day"}</div>`;
    }
  }

  insertAfterElem.insertAdjacentHTML("afterend", appendHTMLStr);

  const dropMap = runtime.state.initData_openableLootDropMap;
  const isOpenable = Boolean(
    dropMap instanceof Map ? dropMap.get(itemHrid) : dropMap?.[itemHrid],
  );
  if (isOpenable && runtime.settings.settingsMap.lootChestEstimate?.isTrue) {
    clearProfitHoverContext();
    runtime.api.showLootChestPanel?.(tooltip, itemHrid);
  } else if (
    !isOpenable &&
    runtime.settings.settingsMap.itemTooltip_profit.isTrue
  ) {
    setProfitHoverContext({ anchor: tooltip, itemHrid });
  } else {
    clearProfitHoverContext();
    runtime.api.dismissHoverPanel?.();
  }

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
      runtime.config.isZH
        ? `[MWITools] 无法按物品名称查找行动：行动数据尚未加载（${name}）。`
        : `[MWITools] Cannot find an action by item name because action data is not loaded (${name}).`,
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
  clearTooltipProfitHoverContext: clearProfitHoverContext,
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

runtime.features.register({
  id: "itemTooltip_prices",
  setting: "itemTooltip_prices",
  initialize({ scope }) {
    const styles = [
      GM_addStyle(`div.Header_actionName__31-L2 {
        overflow: visible !important;
        white-space: normal !important;
        height: auto !important;
      }`),
      GM_addStyle(`span.NavigationBar_label__1uH-y {
        width: 10px !important;
      }`),
    ];
    let observing = false;
    const attach = () => {
      if (observing || !document.body) return;
      tooltipObserver.observe(document.body, {
        attributes: false,
        childList: true,
        characterData: false,
      });
      observing = true;
    };
    attach();
    scope.interval(attach, 250);
    scope.event(
      document,
      "dblclick",
      (event) => {
        if (event.button && event.button !== 0) return;
        if (!runtime.api.pinActiveLootChestPanel?.()) return;
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );
    scope.add(() => {
      tooltipObserver.disconnect();
      for (const style of styles) style?.remove?.();
    });
  },
});

for (const id of ["itemTooltip_profit", "showConsumTips"]) {
  runtime.features.register({
    id,
    setting: id,
    dependsOn: ["itemTooltip_prices"],
    initialize({ scope }) {
      if (id !== "itemTooltip_profit") return;
      scope.event(document, "mouseover", (event) => {
        const card = gatheringCardFromEventTarget(event.target);
        if (!card || card.contains(event.relatedTarget)) return;
        const actionHrid = resolveGatheringActionFromElement(card);
        if (!actionHrid) return;
        setProfitHoverContext({ anchor: card, actionHrid });
      });
      scope.event(document, "mouseout", (event) => {
        const card = gatheringCardFromEventTarget(event.target);
        if (!card || card.contains(event.relatedTarget)) return;
        clearProfitHoverContext(card);
      });
      scope.event(
        window,
        "keydown",
        (event) => {
          if (
            event.repeat ||
            isEditableTarget(event.target) ||
            !runtime.api.matchesTooltipProfitShortcut?.(event)
          ) {
            return;
          }
          profitShortcutHeld = true;
          if (requiresProfitShortcut()) showProfitContext();
        },
        true,
      );
      scope.event(
        window,
        "keyup",
        (event) => {
          if (!runtime.api.matchesTooltipProfitShortcut?.(event)) return;
          profitShortcutHeld = false;
          if (requiresProfitShortcut()) runtime.api.dismissHoverPanel?.();
        },
        true,
      );
      scope.event(window, "blur", () => {
        profitShortcutHeld = false;
        runtime.api.dismissHoverPanel?.();
      });
      scope.event(
        document,
        "pointerdown",
        (event) => {
          if (
            event.pointerType !== "touch" ||
            !requiresProfitShortcut() ||
            !canShowTooltipProfit()
          ) {
            return;
          }
          clearTimeout(touchProfitPress?.timer);
          touchProfitAuthorizedUntil = 0;
          const press = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            authorized: false,
            triggered: false,
            timer: null,
          };
          press.timer = setTimeout(() => {
            if (touchProfitPress !== press) return;
            press.authorized = true;
            if (profitHoverContext?.anchor?.isConnected) {
              press.triggered = true;
              showProfitContext(profitHoverContext, { sticky: true });
            }
          }, TOUCH_PROFIT_LONG_PRESS_MS);
          touchProfitPress = press;
        },
        true,
      );
      scope.event(
        document,
        "pointermove",
        (event) => {
          const press = touchProfitPress;
          if (!press || press.pointerId !== event.pointerId) return;
          if (
            Math.hypot(event.clientX - press.x, event.clientY - press.y) <=
            TOUCH_PROFIT_MOVE_TOLERANCE
          ) {
            return;
          }
          clearTimeout(press.timer);
          touchProfitPress = null;
          touchProfitAuthorizedUntil = 0;
        },
        true,
      );
      const finishTouchPress = (event) => {
        const press = touchProfitPress;
        if (!press || press.pointerId !== event.pointerId) return;
        clearTimeout(press.timer);
        if (press.authorized && !press.triggered) {
          touchProfitAuthorizedUntil = Date.now() + 500;
        }
        touchProfitPress = null;
      };
      scope.event(document, "pointerup", finishTouchPress, true);
      scope.event(
        document,
        "pointercancel",
        (event) => {
          if (touchProfitPress?.pointerId !== event.pointerId) return;
          clearTimeout(touchProfitPress.timer);
          touchProfitPress = null;
          touchProfitAuthorizedUntil = 0;
        },
        true,
      );
      const stopRequireKey = runtime.settings.onChange(
        "itemTooltip_profitRequireKey",
        (required) => {
          if (!required) showProfitContext();
          else if (!profitShortcutHeld) runtime.api.dismissHoverPanel?.();
        },
      );
      const stopIronCow = runtime.settings.onChange(
        "adaptIronCowMarketFeatures",
        () => {
          if (runtime.api.shouldSuppressMarketFeatures?.()) {
            clearProfitHoverContext();
            removeSuppressedTooltipContent();
          }
        },
      );
      scope.add(() => {
        stopRequireKey?.();
        stopIronCow?.();
        clearTimeout(touchProfitPress?.timer);
        touchProfitPress = null;
        profitShortcutHeld = false;
        clearProfitHoverContext();
      });
    },
  });
}

runtime.onMessage("init_character_data", () => {
  if (!runtime.api.shouldSuppressMarketFeatures?.()) return;
  clearProfitHoverContext();
  removeSuppressedTooltipContent();
});
