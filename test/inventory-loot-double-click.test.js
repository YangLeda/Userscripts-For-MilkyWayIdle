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
test("double clicks submit once until a receipt and suppress market navigation", async () => {
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
  document.addEventListener("dblclick", listener);
  const click = () =>
    item.dispatchEvent(
      new dom.window.MouseEvent("dblclick", { bubbles: true }),
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
  document.removeEventListener("dblclick", listener);
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
  item.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
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
