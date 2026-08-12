import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://test.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.location = dom.window.location;
globalThis.localStorage = dom.window.localStorage;

const { runtime } = await import("../src/core/runtime.js");
const { inventoryItemTarget } =
  await import("../src/features/inventory-market-double-click.js");
runtime.api.getOriTextFromElement = (element) => element?.textContent;
localStorage.setItem("i18nextLng", "en-US");
runtime.state.itemEnNameToHridMap = {
  Milk: "/items/milk",
  Coin: "/items/coin",
  Chest: "/items/chest",
  Scroll: "/items/scroll",
  "Cowbell Bag": "/items/cowbell_bag",
};
runtime.state.initData_itemDetailMap = {
  "/items/milk": { isTradable: true },
  "/items/coin": {},
  "/items/chest": { isOpenable: true },
  "/items/scroll": { scrollDetail: {} },
  "/items/cowbell_bag": { isTradable: true, isOpenable: true },
};

function inventory(category, item) {
  document.body.innerHTML = `<div class="Inventory_items__test"><div class="Inventory_category__test"><button class="Inventory_categoryButton__test">${category}</button><div class="Item_itemContainer__test"><svg aria-label="${item}"></svg><span class="Item_enhancementLevel__test">+7</span></div></div></div>`;
  return document.querySelector("svg");
}

test("regular inventory items resolve their market target and enhancement", () => {
  assert.deepEqual(inventoryItemTarget(inventory("Materials", "Milk")), {
    itemHrid: "/items/milk",
    enhancementLevel: 7,
    categoryName: "Materials",
  });
});

test("non-tradable currency, loot, and scrolls never resolve a market target", () => {
  assert.equal(inventoryItemTarget(inventory("Currencies", "Coin")), null);
  assert.equal(inventoryItemTarget(inventory("Loots", "Chest")), null);
  assert.equal(inventoryItemTarget(inventory("Scrolls", "Scroll")), null);
});

test("a tradable loot item still opens its real market", () => {
  assert.deepEqual(inventoryItemTarget(inventory("Loots", "Cowbell Bag")), {
    itemHrid: "/items/cowbell_bag",
    enhancementLevel: 7,
    categoryName: "Loots",
  });
});
