import assert from "node:assert/strict";
import test, { after } from "node:test";
import { JSDOM } from "jsdom";
const dom = new JSDOM(
  '<div class="Inventory_items__test"><div class="Item_itemContainer__test"><svg><use href="/items_sprite.svg#chest"></use></svg></div></div>',
  { url: "https://www.milkywayidle.com" },
);
Object.assign(globalThis, {
  document: dom.window.document,
  window: dom.window,
  localStorage: dom.window.localStorage,
});
const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
const { lootOpenCount } =
  await import("../src/features/inventory-loot-double-click.js");
const items = [
  {
    itemHrid: "/items/chest",
    count: 12,
    itemLocationHrid: "/item_locations/inventory",
  },
  {
    itemHrid: "/items/key",
    count: 5,
    itemLocationHrid: "/item_locations/inventory",
  },
];
test("loot respects current inventory, native count and key availability", () => {
  assert.equal(runtime.settings.get("inventoryLootDoubleClick"), false);
  assert.equal(
    lootOpenCount({ itemHrid: "/items/chest", count: 50 }, {}, items),
    12,
  );
  assert.equal(
    lootOpenCount(
      { itemHrid: "/items/chest", count: 50, openLootKeyCount: 9 },
      { openKeyItemHrid: "/items/key" },
      items,
    ),
    5,
  );
  assert.equal(
    lootOpenCount({ itemHrid: "/items/chest", count: 3 }, {}, items),
    3,
  );
});
test("right clicks submit once until a receipt and suppress native single opening", async () => {
  runtime.state.currentCharacterId = "loot-test";
  runtime.state.initData_characterItems = items;
  runtime.state.initData_itemDetailMap = {
    "/items/chest": { categoryHrid: "/item_categories/loot", isTradable: true },
  };
  const calls = [];
  const item = document.querySelector('[class*="Item_itemContainer"]');
  item.__reactFiber$test = {
    memoizedProps: {
      itemHrid: "/items/chest",
      count: 12,
      hash: "chest-hash",
      openLootHandler: (...args) => calls.push(args),
    },
  };
  await runtime.settings.set("inventoryLootDoubleClick", true);
  await runtime.features.handleCharacterData({
    character: { id: "loot-test" },
  });
  let propagated = 0;
  const listener = () => {
    propagated++;
  };
  document.addEventListener("contextmenu", listener);
  const click = () =>
    item.dispatchEvent(
      new dom.window.MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
      }),
    );
  click();
  click();
  assert.deepEqual(calls, [["chest-hash", 12]]);
  assert.equal(propagated, 0);
  runtime.dispatchMessage({
    type: "loot_opened",
    openedItem: { itemHrid: "/items/chest", count: 12 },
  });
  await runtime.settings.set("inventoryLootDoubleClick", false);
  click();
  assert.equal(propagated, 1);
  document.removeEventListener("contextmenu", listener);
});
after(() => dom.window.close());

test("loot batches require both receipt and fresh stock, and stop on failure", async () => {
  const item = document.querySelector('[class*="Item_itemContainer"]');
  const calls = [];
  Object.defineProperty(item, "__reactFiber$test", {
    configurable: true,
    enumerable: false,
    value: {
      memoizedProps: {
        itemHrid: "/items/chest",
        count: 3,
        hash: "chest-hash",
        openLootHandler: (hash, count) => calls.push(count),
      },
    },
  });
  const stock = {
    itemHrid: "/items/chest",
    count: 8,
    itemLocationHrid: "/item_locations/inventory",
  };
  runtime.state.initData_characterItems = [stock];
  await runtime.settings.set("inventoryLootDoubleClick", true);
  item.dispatchEvent(
    new dom.window.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
    }),
  );
  assert.deepEqual(calls, [3]);
  runtime.dispatchMessage({
    type: "loot_opened",
    openedItem: { itemHrid: "/items/chest", count: 3 },
  });
  assert.deepEqual(calls, [3]);
  stock.count = 5;
  runtime.dispatchMessage({ type: "items_updated" });
  assert.deepEqual(calls, [3, 3]);
  runtime.dispatchMessage({ type: "error" });
  stock.count = 2;
  runtime.dispatchMessage({ type: "items_updated" });
  runtime.dispatchMessage({
    type: "loot_opened",
    openedItem: { itemHrid: "/items/chest", count: 3 },
  });
  assert.deepEqual(calls, [3, 3]);
  await runtime.settings.set("inventoryLootDoubleClick", false);
});

test("right click uses native item identity and ignores menus, non-loot and other areas", async () => {
  const item = document.querySelector('[class*="Item_itemContainer"]');
  const calls = [];
  item.__reactFiber$test = {
    stateNode: {
      props: {
        itemHrid: "/items/chest",
        count: 8,
        hash: "chest-hash",
        openLootHandler: (...args) => calls.push(args),
      },
      canOpen: () => true,
    },
  };
  // A badge can precede the item's sprite; native identity is authoritative.
  item.innerHTML =
    '<svg><use href="/items_sprite.svg#coin"></use></svg><div class="Item_actionMenu__test"><button>Open</button></div>';
  runtime.state.initData_characterItems = [{ ...items[0], count: 8 }];
  await runtime.settings.set("inventoryLootDoubleClick", true);
  const rightClick = (target, button = 2) => {
    const event = new dom.window.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button,
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assert.equal(rightClick(item.querySelector("button")), false);
  assert.equal(rightClick(item, 0), false);
  item.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
  assert.equal(calls.length, 0);
  assert.equal(rightClick(item.querySelector("use")), true);
  assert.deepEqual(calls, [["chest-hash", 8]]);
  await runtime.settings.set("inventoryLootDoubleClick", false);
  assert.equal(rightClick(item), false);
  await runtime.settings.set("inventoryLootDoubleClick", true);
  runtime.state.initData_itemDetailMap["/items/chest"].categoryHrid =
    "/item_categories/resource";
  assert.equal(rightClick(item), false);
  runtime.state.initData_itemDetailMap["/items/chest"].categoryHrid =
    "/item_categories/loot";
  const outside = item.cloneNode(true);
  outside.__reactFiber$test = item.__reactFiber$test;
  document.body.append(outside);
  assert.equal(rightClick(outside), false);
  outside.remove();
  assert.equal(calls.length, 1);
  await runtime.settings.set("inventoryLootDoubleClick", false);
});

test("no-key loot is suppressed safely and disabling stops queued batches", async () => {
  const item = document.querySelector('[class*="Item_itemContainer"]');
  const calls = [];
  item.__reactFiber$test = {
    memoizedProps: {
      itemHrid: "/items/chest",
      hash: "chest-hash",
      count: 3,
      openLootKeyCount: 0,
      openLootHandler: (hash, count) => calls.push(count),
    },
  };
  runtime.state.initData_itemDetailMap["/items/chest"].openKeyItemHrid =
    "/items/key";
  const stock = { ...items[0], count: 8 };
  runtime.state.initData_characterItems = [stock];
  await runtime.settings.set("inventoryLootDoubleClick", true);
  const click = () =>
    item.dispatchEvent(
      new dom.window.MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
      }),
    );
  click();
  assert.deepEqual(calls, []);
  delete runtime.state.initData_itemDetailMap["/items/chest"].openKeyItemHrid;
  click();
  assert.deepEqual(calls, [3]);
  await runtime.settings.set("inventoryLootDoubleClick", false);
  stock.count = 5;
  runtime.dispatchMessage({
    type: "loot_opened",
    openedItem: { itemHrid: "/items/chest", count: 3 },
  });
  runtime.dispatchMessage({ type: "items_updated" });
  assert.deepEqual(calls, [3]);
});
