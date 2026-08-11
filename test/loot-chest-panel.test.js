import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<!doctype html><html><head></head><body><div id="anchor" class="MuiTooltip-popper">Chest tooltip</div></body></html>`,
  { url: "https://www.milkywayidle.com/" },
);
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.window = dom.window;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.requestAnimationFrame = (callback) => {
  callback();
  return 1;
};
globalThis.innerWidth = 1_200;
globalThis.innerHeight = 800;
localStorage.setItem("i18nextLng", "zh-CN");

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/data/translations.js");
await import("../src/core/state.js");
await import("../src/core/asset-values.js");
await import("../src/features/production-profit-panel.js");

runtime.state.initData_itemDetailMap = {
  "/items/small_treasure_chest": { name: "Small Treasure Chest" },
  "/items/coin": { name: "Coin" },
  "/items/gem": { name: "Gem" },
  "/items/junk": { name: "Junk" },
  "/items/locked_chest": {
    name: "Locked Chest",
    openKeyItemHrid: "/items/key",
  },
  "/items/key": { name: "Key" },
  "/items/key_fragment": { name: "Key Fragment" },
  "/items/prize": { name: "Prize" },
};
runtime.state.initData_openableLootDropMap = {
  "/items/small_treasure_chest": [
    { itemHrid: "/items/coin", dropRate: 1, minCount: 10, maxCount: 20 },
    { itemHrid: "/items/gem", dropRate: 0.1, minCount: 1, maxCount: 1 },
    { itemHrid: "/items/junk", dropRate: 0.5, minCount: 1, maxCount: 1 },
  ],
  "/items/locked_chest": [
    { itemHrid: "/items/prize", dropRate: 1, minCount: 1, maxCount: 1 },
  ],
};
// A key is crafted from 5 fragments.
runtime.state.initData_actionDetailMap = {
  "/actions/crafting/key": {
    hrid: "/actions/crafting/key",
    outputItems: [{ itemHrid: "/items/key", count: 1 }],
    inputItems: [{ itemHrid: "/items/key_fragment", count: 5 }],
  },
};

// fair/base prices. bid = ×0.8, ask = ×1.2, tax = 0.
const PRICES = {
  "/items/coin": 1,
  "/items/gem": 1000,
  "/items/prize": 500,
  "/items/key": 200,
  "/items/key_fragment": 30,
};
runtime.api.getFairValue = (itemHrid) => PRICES[itemHrid] ?? 0;
runtime.api.getMarketTaxRate = () => 0;
runtime.api.getBidPrice = (itemHrid) => (PRICES[itemHrid] ?? 0) * 0.8;
runtime.api.getAskPrice = (itemHrid) => (PRICES[itemHrid] ?? 0) * 1.2;

function setLoot({ sell, buy, fragments }) {
  runtime.settings.settingsMap.lootSellAtAsk.isTrue = sell === "ask";
  runtime.settings.settingsMap.lootBuyAtAsk.isTrue = buy === "ask";
  runtime.settings.settingsMap.lootKeyFromFragments.isTrue = Boolean(fragments);
}

test("drops are weighted by chance and expected count, sold on the chosen side", () => {
  // Sell at bid: coin 1*15*0.8=12; gem 0.1*1*(1000*0.8)=80; junk unpriced=0.
  setLoot({ sell: "bid", buy: "ask", fragments: false });
  const chest = runtime.api.projectLootChest("/items/small_treasure_chest");
  assert.ok(chest);
  assert.equal(chest.grossValue, 92);
  assert.equal(chest.keyItemHrid, null);
  assert.equal(chest.netValue, 92);
  assert.deepEqual(
    chest.drops.map((drop) => drop.itemHrid),
    ["/items/gem", "/items/coin", "/items/junk"],
  );
  assert.deepEqual(chest.missing, ["/items/junk"]);

  // Sell at ask lifts every priced drop: coin 15*1.2=18; gem 1200*0.1=120.
  setLoot({ sell: "ask", buy: "ask", fragments: false });
  const askChest = runtime.api.projectLootChest("/items/small_treasure_chest");
  assert.equal(askChest.grossValue, 138);
});

test("finished-key cost follows the buy side", () => {
  // Buy key at ask 240: net = prize@bid(400) - 240 = 160.
  setLoot({ sell: "bid", buy: "ask", fragments: false });
  const askKey = runtime.api.projectLootChest("/items/locked_chest");
  assert.equal(askKey.grossValue, 400);
  assert.equal(askKey.keyCost, 240);
  assert.equal(askKey.netValue, 160);

  // Buy key at bid 160: net = 400 - 160 = 240.
  setLoot({ sell: "bid", buy: "bid", fragments: false });
  const bidKey = runtime.api.projectLootChest("/items/locked_chest");
  assert.equal(bidKey.keyCost, 160);
  assert.equal(bidKey.netValue, 240);
});

test("fragment crafting values the key from its fragment inputs", () => {
  // 5 fragments at ask (30*1.2=36) = 180 per key.
  setLoot({ sell: "bid", buy: "ask", fragments: true });
  const chest = runtime.api.projectLootChest("/items/locked_chest");
  assert.equal(chest.keyCost, 180);
  assert.equal(chest.netValue, 400 - 180);

  // 5 fragments at bid (30*0.8=24) = 120 per key.
  setLoot({ sell: "bid", buy: "bid", fragments: true });
  const bidChest = runtime.api.projectLootChest("/items/locked_chest");
  assert.equal(bidChest.keyCost, 120);
});

test("projectLootChest returns null for non-openable items", () => {
  assert.equal(runtime.api.projectLootChest("/items/coin"), null);
});

test("showLootChestPanel renders a single config-driven row beside the anchor", () => {
  setLoot({ sell: "bid", buy: "ask", fragments: false });
  const anchor = document.querySelector("#anchor");
  const panel = runtime.api.showLootChestPanel(anchor, "/items/locked_chest");
  assert.ok(panel);
  assert.equal(anchor.nextElementSibling, panel);
  assert.match(panel.textContent, /Locked Chest/);
  assert.match(panel.textContent, /毛期望价值/);
  assert.match(panel.textContent, /净期望价值/);
  assert.match(panel.textContent, /钥匙成本/);
  // Only one valuation row is shown now (config-driven, not three modes).
  assert.equal(panel.querySelectorAll(".mwi-profit-valuation-row").length, 1);
  runtime.api.hideProductionProfitPanel();
  assert.equal(anchor.nextElementSibling, null);
});
