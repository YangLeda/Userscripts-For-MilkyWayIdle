import { runtime } from "../core/runtime.js";
import { resolveEntityFromElement } from "../core/game-localization.js";

const INVENTORY_SELECTOR = 'div[class*="Inventory_items"]';
const ITEM_SELECTOR = 'div[class*="Item_itemContainer"]';
export function inventoryItemTarget(target) {
  const item = target?.closest?.(ITEM_SELECTOR);
  if (!item?.closest(INVENTORY_SELECTOR)) return null;
  const category = item.closest(
    'div:has(> button[class*="Inventory_categoryButton"],> div[class*="Inventory_label"])',
  );
  const categoryButton = category?.querySelector(
    'button[class*="Inventory_categoryButton"]',
  );
  const categoryName = String(
    runtime.api.getOriTextFromElement?.(categoryButton) ??
      categoryButton?.textContent ??
      "",
  ).trim();
  const itemHrid = resolveEntityFromElement("item", item);
  const itemDetail = runtime.state.initData_itemDetailMap?.[itemHrid];
  if (!itemHrid || itemDetail?.isTradable !== true) return null;
  const levelText =
    item.querySelector('[class*="Item_enhancementLevel"]')?.textContent ?? "";
  const enhancementLevel =
    Number.parseInt(levelText.replace(/\D/g, ""), 10) || 0;
  return { itemHrid, enhancementLevel, categoryName };
}

runtime.features.register({
  id: "inventoryMarketDoubleClick",
  setting: "inventoryMarketDoubleClick",
  scope: "character",
  initialize({ scope }) {
    scope.event(
      document,
      "dblclick",
      (event) => {
        if (event.button && event.button !== 0) return;
        const target = inventoryItemTarget(event.target);
        if (!target) return;
        const open = runtime.api.openProcurementMarketplace;
        if (typeof open !== "function") return;
        event.preventDefault();
        event.stopPropagation();
        open(target.itemHrid, target.enhancementLevel);
      },
      true,
    );
  },
});
