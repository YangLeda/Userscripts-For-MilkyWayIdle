import { runtime } from "../core/runtime.js";
import {
  resolveEntityFromElement,
  resolveLocalizedEntity,
} from "../core/game-localization.js";
import { calculateEnhancementPlan } from "./enhancement-planner.js";
import {
  hideEnhancementCostPanel,
  showEnhancementCostPanel,
} from "./enhancement-cost-panel.js";

function appendMarketRows(tooltipContent, itemHrid, enhancementLevel) {
  tooltipContent
    .querySelector('[data-mwitools-enhancement-market="true"]')
    ?.remove();
  if (
    !runtime.settings.settingsMap.itemTooltip_prices.isTrue ||
    runtime.api.shouldSuppressMarketFeatures?.()
  ) {
    return;
  }
  const wrapper = document.createElement("div");
  wrapper.dataset.mwitoolsEnhancementMarket = "true";
  wrapper.style.color = runtime.config.SCRIPT_COLOR_TOOLTIP;
  const fairValue = runtime.api.getFairValue(itemHrid, enhancementLevel);
  const ask = runtime.api.getAskPrice(itemHrid, enhancementLevel);
  const bid = runtime.api.getBidPrice(itemHrid, enhancementLevel);
  const valueRow = document.createElement("div");
  valueRow.textContent = `${runtime.config.isZH ? "市场价值: " : "Market value: "}${fairValue > 0 ? runtime.api.numberFormatter(fairValue) : "-"}`;
  const priceRow = document.createElement("div");
  priceRow.textContent = `${runtime.config.isZH ? "价格: " : "Price: "}${runtime.api.numberFormatter(ask)} / ${runtime.api.numberFormatter(bid)}`;
  wrapper.append(valueRow, priceRow);
  tooltipContent.append(wrapper);
}

export function getTooltipEnhancementPlanOptions(itemHrid) {
  const forceProtectionMirror = Boolean(
    runtime.api.isBackEquipment?.(itemHrid),
  );
  return {
    forcedProtectionItemHrid: forceProtectionMirror
      ? "/items/mirror_of_protection"
      : null,
    allowPhilosopherMirror: !forceProtectionMirror,
    getFairValue: (hrid, level = 0) =>
      runtime.api.getAssetValue?.(hrid, level, {
        forceAcquisitionValue: true,
      }) ||
      runtime.api.getFairValue(hrid, level) ||
      0,
    getMarketValue: (hrid, level = 0) =>
      runtime.api.getFairValue(hrid, level) || 0,
  };
}

export function readEnhancedTooltipItem(tooltip) {
  const itemNameElements = [
    ...(tooltip?.querySelectorAll("div.ItemTooltipText_name__2JAHA span") ??
      []),
  ];
  const enhancementText = itemNameElements.find((element) =>
    /\+\s*\d+/.test(element.textContent ?? ""),
  )?.textContent;
  const enhancementLevel = Math.max(
    0,
    Math.floor(Number(enhancementText?.match(/\+\s*(\d+)/)?.[1]) || 0),
  );
  const iconHrid = resolveEntityFromElement("item", tooltip);
  if (iconHrid) return { itemHrid: iconHrid, enhancementLevel };

  const itemName = runtime.api.getOriTextFromElement?.(itemNameElements[0]);
  return {
    itemHrid: resolveLocalizedEntity("item", itemName),
    enhancementLevel,
  };
}

export async function handleEnhancedItemTooltip(tooltip) {
  const tooltipContent = tooltip?.querySelector(
    ".ItemTooltipText_itemTooltipText__zFq3A",
  );
  if (!tooltipContent) {
    hideEnhancementCostPanel();
    return;
  }
  const { itemHrid, enhancementLevel } = readEnhancedTooltipItem(tooltip);
  if (!itemHrid || !runtime.state.initData_itemDetailMap?.[itemHrid]) {
    hideEnhancementCostPanel();
    return;
  }

  if (runtime.settings.settingsMap.enhanceSim.isTrue) {
    showEnhancementCostPanel(tooltip, null);
  } else {
    hideEnhancementCostPanel();
  }

  if (!runtime.api.shouldSuppressMarketFeatures?.()) {
    await runtime.api.fetchMarketJSON();
    if (!tooltip.isConnected) return;
    appendMarketRows(tooltipContent, itemHrid, enhancementLevel);
  } else {
    appendMarketRows(tooltipContent, itemHrid, enhancementLevel);
  }
  if (!runtime.settings.settingsMap.enhanceSim.isTrue) return;

  const plan = calculateEnhancementPlan({
    itemHrid,
    targetLevel: enhancementLevel,
    ...getTooltipEnhancementPlanOptions(itemHrid),
  });
  if (tooltip.isConnected) showEnhancementCostPanel(tooltip, plan);
}

runtime.api.handleItemTooltipWithEnhancementLevel = handleEnhancedItemTooltip;

runtime.onMessage("init_character_data", () => {
  if (!runtime.api.shouldSuppressMarketFeatures?.()) return;
  document
    .querySelectorAll('[data-mwitools-enhancement-market="true"]')
    .forEach((row) => row.remove());
});

runtime.settings.onChange?.("adaptIronCowMarketFeatures", () => {
  if (!runtime.api.shouldSuppressMarketFeatures?.()) return;
  document
    .querySelectorAll('[data-mwitools-enhancement-market="true"]')
    .forEach((row) => row.remove());
});
