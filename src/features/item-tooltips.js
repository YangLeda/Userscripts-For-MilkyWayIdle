import { runtime } from "../core/runtime.js";
import {
  getLocalizedEntityName,
  resolveEntityFromElement,
  resolveLocalizedEntity,
} from "../core/game-localization.js";

const TOUCH_PROFIT_LONG_PRESS_MS = 800;
const TOUCH_PROFIT_MOVE_TOLERANCE = 12;

let hoverPanelContext = null;
let hoverPanelShortcutHeld = false;
let touchHoverPanelPress = null;
let touchHoverPanelAuthorizedUntil = 0;

function isEditableTarget(target) {
  return Boolean(
    target?.closest?.('input,textarea,select,[contenteditable="true"]'),
  );
}

function isModifierShortcutEvent(event) {
  return ["Control", "Shift", "Alt", "Meta"].includes(event?.key);
}

function requiresHoverPanelShortcut() {
  return Boolean(
    runtime.settings.settingsMap.itemTooltip_profitRequireKey?.isTrue,
  );
}

function canShowHoverPanel(context = hoverPanelContext) {
  if (context?.kind === "enhancement") {
    return Boolean(runtime.settings.settingsMap.enhanceSim?.isTrue);
  }
  if (context?.kind === "loot") {
    return Boolean(runtime.settings.settingsMap.lootChestEstimate?.isTrue);
  }
  return Boolean(
    context?.kind === "profit" &&
    runtime.settings.settingsMap.itemTooltip_profit?.isTrue &&
    !runtime.api.shouldSuppressMarketFeatures?.(),
  );
}

function hasEnabledHoverPanelFeature() {
  return Boolean(
    runtime.settings.settingsMap.enhanceSim?.isTrue ||
    runtime.settings.settingsMap.lootChestEstimate?.isTrue ||
    (runtime.settings.settingsMap.itemTooltip_profit?.isTrue &&
      !runtime.api.shouldSuppressMarketFeatures?.()),
  );
}

function dismissHoverPanelContext(context = hoverPanelContext) {
  if (context?.kind === "enhancement") {
    runtime.api.hideEnhancementCostPanel?.();
  } else {
    runtime.api.dismissHoverPanel?.();
  }
}

function showHoverPanelContext(context = hoverPanelContext, options = {}) {
  if (!context?.anchor?.isConnected || !canShowHoverPanel(context)) {
    dismissHoverPanelContext(context);
    return null;
  }
  if (context.kind === "enhancement") {
    return runtime.api.showEnhancementCostPanel?.(
      context.anchor,
      context.plan ?? null,
      { sticky: Boolean(options.sticky) },
    );
  }
  if (context.kind === "loot") {
    return runtime.api.showLootChestPanel?.(context.anchor, context.itemHrid, {
      sticky: Boolean(options.sticky),
    });
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

function setHoverPanelContext(context) {
  if (
    hoverPanelContext &&
    (hoverPanelContext.kind !== context?.kind ||
      hoverPanelContext.anchor !== context?.anchor)
  ) {
    dismissHoverPanelContext(hoverPanelContext);
  }
  hoverPanelContext = context;
  if (!canShowHoverPanel(context)) {
    dismissHoverPanelContext(context);
    return;
  }
  if (!requiresHoverPanelShortcut() || hoverPanelShortcutHeld) {
    showHoverPanelContext(context);
    return;
  }
  if (Date.now() <= touchHoverPanelAuthorizedUntil) {
    touchHoverPanelAuthorizedUntil = 0;
    showHoverPanelContext(context, { sticky: true });
    return;
  }
  if (touchHoverPanelPress?.authorized) {
    touchHoverPanelPress.triggered = true;
    showHoverPanelContext(context, { sticky: true });
    return;
  }
  dismissHoverPanelContext(context);
}

function clearHoverPanelContext(
  anchor = null,
  kind = null,
  { preserveTouchPress = false } = {},
) {
  if (anchor && hoverPanelContext?.anchor !== anchor) return;
  if (kind && hoverPanelContext?.kind !== kind) return;
  if (!preserveTouchPress) {
    clearTimeout(touchHoverPanelPress?.timer);
    touchHoverPanelPress = null;
    touchHoverPanelAuthorizedUntil = 0;
  }
  const previous = hoverPanelContext;
  hoverPanelContext = null;
  dismissHoverPanelContext(previous);
}

export function setEnhancementHoverPanelContext(anchor, plan = null) {
  setHoverPanelContext({ kind: "enhancement", anchor, plan });
}

export function clearEnhancementHoverPanelContext(anchor = null) {
  clearHoverPanelContext(anchor, "enhancement");
}

function removeSuppressedTooltipContent() {
  document
    .querySelectorAll('[data-mwitools-tooltip-market="true"]')
    .forEach((row) => row.remove());
}

function productionCostTooltipRows(itemHrid) {
  if (!runtime.settings.settingsMap.itemTooltip_profit?.isTrue) return "";
  const actionHrid = runtime.api.resolveProductionActionByItemHrid?.(itemHrid);
  const label = runtime.config.isZH
    ? "生产总成本/动作（效率 / 贪心）："
    : "Production cost/action (Efficiency / Greedy): ";
  let costText = runtime.config.isZH ? "无配方" : "No recipe";
  if (actionHrid) {
    const projection = runtime.api.projectAction?.(actionHrid, 1);
    const costs = ["conservative", "aggressive"].map((mode) => {
      const valuation = projection?.valuations?.[mode];
      return valuation?.costComplete
        ? (Number(valuation.materialCostPerAction) || 0) +
            (Number(valuation.teaCostPerAction) || 0)
        : null;
    });
    costText = costs
      .map((cost) =>
        cost === null
          ? runtime.config.isZH
            ? "缺价"
            : "Missing price"
          : numberFormatter(cost),
      )
      .join(" / ");
  }
  const shortcut = runtime.api.getTooltipProfitShortcut?.().display ?? "Ctrl";
  const hint = runtime.config.isZH
    ? `按住 ${shortcut} 显示详情；移动端长按显示详情`
    : `Hold ${shortcut} for details; long-press on mobile`;
  return `
    <div data-mwitools-tooltip-market="true" style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP};">${label}${costText}</div>
    <div data-mwitools-tooltip-market="true" style="color: var(--color-text-secondary,#777); font-size: calc(.6875rem * var(--mwi-ui-font-scale,1));">${hint}</div>
  `;
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
    for (const removed of mutation.removedNodes) {
      if (
        removed?.nodeType === 1 &&
        (removed.matches?.(".MuiTooltip-popper") ||
          removed.querySelector?.(".MuiTooltip-popper"))
      ) {
        runtime.api.disconnectActionQueueObserver?.(removed);
      }
    }
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
            setHoverPanelContext({
              kind: "profit",
              anchor: added,
              actionHrid,
            });
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
      const names = [detail.name, getLocalizedEntityName("action", detail.hrid)]
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
    clearHoverPanelContext(null, null, { preserveTouchPress: true });
    runtime.api.dismissHoverPanel?.();
    runtime.api.handleItemTooltipWithEnhancementLevel(tooltip);
    return;
  }

  runtime.api.hideEnhancementCostPanel?.();

  const itemNameElem = itemNameElems[0];
  const itemName = runtime.api.getOriTextFromElement(itemNameElem);
  const itemHrid =
    resolveEntityFromElement("item", tooltip) ||
    resolveLocalizedEntity("item", itemName);

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
  if (!suppressMarket) appendHTMLStr += productionCostTooltipRows(itemHrid);

  insertAfterElem.insertAdjacentHTML("afterend", appendHTMLStr);

  const dropMap = runtime.state.initData_openableLootDropMap;
  const isOpenable = Boolean(
    dropMap instanceof Map ? dropMap.get(itemHrid) : dropMap?.[itemHrid],
  );
  if (isOpenable && runtime.settings.settingsMap.lootChestEstimate?.isTrue) {
    setHoverPanelContext({ kind: "loot", anchor: tooltip, itemHrid });
  } else if (
    !isOpenable &&
    runtime.settings.settingsMap.itemTooltip_profit.isTrue
  ) {
    setHoverPanelContext({ kind: "profit", anchor: tooltip, itemHrid });
  } else {
    clearHoverPanelContext();
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
  timeReadable,
  getToolsSpeedBuffByActionHrid,
  getItemEffiBuffByActionHrid,
  getHousesEffBuffByActionHrid,
  getTeaBuffsByActionHrid,
  handleTooltipItem,
  getProductionCostTooltipRows: productionCostTooltipRows,
  getActionHridFromItemName,
  clearTooltipProfitHoverContext: clearHoverPanelContext,
  setEnhancementHoverPanelContext,
  clearEnhancementHoverPanelContext,
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
    const attach = () => {
      if (!document.body) return false;
      tooltipObserver.observe(document.body, {
        attributes: false,
        childList: true,
        characterData: false,
      });
      return true;
    };
    if (!attach()) {
      scope.event(document, "DOMContentLoaded", attach, { once: true });
    }
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
    scope.event(
      window,
      "keydown",
      (event) => {
        if (
          event.repeat ||
          (isEditableTarget(event.target) && !isModifierShortcutEvent(event)) ||
          !runtime.api.matchesTooltipProfitShortcut?.(event)
        ) {
          return;
        }
        hoverPanelShortcutHeld = true;
        if (requiresHoverPanelShortcut()) showHoverPanelContext();
      },
      true,
    );
    scope.event(
      window,
      "keyup",
      (event) => {
        if (!runtime.api.matchesTooltipProfitShortcut?.(event)) return;
        hoverPanelShortcutHeld = false;
        if (requiresHoverPanelShortcut()) dismissHoverPanelContext();
      },
      true,
    );
    scope.event(window, "blur", () => {
      hoverPanelShortcutHeld = false;
      dismissHoverPanelContext();
    });
    scope.event(
      document,
      "pointerdown",
      (event) => {
        if (
          event.pointerType !== "touch" ||
          !requiresHoverPanelShortcut() ||
          !hasEnabledHoverPanelFeature()
        ) {
          return;
        }
        clearTimeout(touchHoverPanelPress?.timer);
        touchHoverPanelAuthorizedUntil = 0;
        const press = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          authorized: false,
          triggered: false,
          timer: null,
        };
        press.timer = setTimeout(() => {
          if (touchHoverPanelPress !== press) return;
          press.authorized = true;
          if (hoverPanelContext?.anchor?.isConnected) {
            press.triggered = true;
            showHoverPanelContext(hoverPanelContext, { sticky: true });
          }
        }, TOUCH_PROFIT_LONG_PRESS_MS);
        touchHoverPanelPress = press;
      },
      true,
    );
    scope.event(
      document,
      "pointermove",
      (event) => {
        const press = touchHoverPanelPress;
        if (!press || press.pointerId !== event.pointerId) return;
        if (
          Math.hypot(event.clientX - press.x, event.clientY - press.y) <=
          TOUCH_PROFIT_MOVE_TOLERANCE
        ) {
          return;
        }
        clearTimeout(press.timer);
        touchHoverPanelPress = null;
        touchHoverPanelAuthorizedUntil = 0;
      },
      true,
    );
    const finishTouchPress = (event) => {
      const press = touchHoverPanelPress;
      if (!press || press.pointerId !== event.pointerId) return;
      clearTimeout(press.timer);
      if (press.authorized && !press.triggered) {
        touchHoverPanelAuthorizedUntil = Date.now() + 500;
      }
      touchHoverPanelPress = null;
    };
    scope.event(document, "pointerup", finishTouchPress, true);
    scope.event(
      document,
      "pointercancel",
      (event) => {
        if (touchHoverPanelPress?.pointerId !== event.pointerId) return;
        clearTimeout(touchHoverPanelPress.timer);
        touchHoverPanelPress = null;
        touchHoverPanelAuthorizedUntil = 0;
      },
      true,
    );
    const stopRequireKey = runtime.settings.onChange(
      "itemTooltip_profitRequireKey",
      (required) => {
        if (!required) showHoverPanelContext();
        else if (!hoverPanelShortcutHeld) dismissHoverPanelContext();
      },
    );
    const stopIronCow = runtime.settings.onChange(
      "adaptIronCowMarketFeatures",
      () => {
        if (!runtime.api.shouldSuppressMarketFeatures?.()) return;
        clearHoverPanelContext(null, "profit");
        removeSuppressedTooltipContent();
      },
    );
    const stopLootEstimate = runtime.settings.onChange(
      "lootChestEstimate",
      (enabled) => {
        if (!enabled) {
          clearHoverPanelContext(null, "loot");
          runtime.api.hideProductionProfitPanel?.("loot");
        }
      },
    );
    const stopEnhanceSim = runtime.settings.onChange(
      "enhanceSim",
      (enabled) => {
        if (!enabled) {
          clearHoverPanelContext(null, "enhancement");
          runtime.api.hideEnhancementCostPanel?.();
        }
      },
    );
    scope.add(() => {
      stopRequireKey?.();
      stopIronCow?.();
      stopLootEstimate?.();
      stopEnhanceSim?.();
      tooltipObserver.disconnect();
      for (const style of styles) style?.remove?.();
      clearTimeout(touchHoverPanelPress?.timer);
      touchHoverPanelPress = null;
      hoverPanelShortcutHeld = false;
      clearHoverPanelContext();
      runtime.api.hideProductionProfitPanel?.();
      runtime.api.hideEnhancementCostPanel?.();
    });
  },
});

runtime.features.register({
  id: "itemTooltip_profit",
  setting: "itemTooltip_profit",
  dependsOn: ["itemTooltip_prices"],
  initialize({ scope }) {
    scope.event(document, "mouseover", (event) => {
      const card = gatheringCardFromEventTarget(event.target);
      if (!card || card.contains(event.relatedTarget)) return;
      const actionHrid = resolveGatheringActionFromElement(card);
      if (!actionHrid) return;
      setHoverPanelContext({ kind: "profit", anchor: card, actionHrid });
    });
    scope.event(document, "mouseout", (event) => {
      const card = gatheringCardFromEventTarget(event.target);
      if (!card || card.contains(event.relatedTarget)) return;
      clearHoverPanelContext(card, "profit");
    });
    scope.add(() => {
      clearHoverPanelContext(null, "profit");
      runtime.api.hideProductionProfitPanel?.("profit");
    });
  },
});

runtime.onMessage("init_character_data", () => {
  clearHoverPanelContext();
  runtime.api.hideProductionProfitPanel?.();
  runtime.api.hideEnhancementCostPanel?.();
  if (runtime.api.shouldSuppressMarketFeatures?.()) {
    removeSuppressedTooltipContent();
  }
});
