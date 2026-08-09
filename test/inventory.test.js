import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<!doctype html><body>
    <div class="Header_totalLevel__8LY3Q"></div>
    <section id="inventory-parent"><div class="Inventory_items__6SXv0"></div></section>
  </body>`,
  { url: "https://test.milkywayidle.com/" },
);
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.window = dom.window;
globalThis.setTimeout = () => 0;
globalThis.clearTimeout = () => {};
localStorage.setItem("i18nextLng", "zh-CN");

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
await import("../src/features/inventory.js");

runtime.state.initData_characterItems = [
  {
    id: 1,
    itemHrid: "/items/milk",
    itemLocationHrid: "/item_locations/inventory",
    enhancementLevel: 0,
    count: 10,
  },
];
runtime.state.initData_myMarketListings = [];
runtime.state.marketItemValues = { "/items/milk": { 0: 1000 } };
runtime.state.marketApiJson = {
  timestamp: 1,
  marketData: { "/items/milk": { 0: { a: 1100, b: 900 } } },
};
runtime.api.fetchMarketJSON = async () => runtime.state.marketApiJson;
runtime.api.getSelfBuildScores = async () => ({
  battle: { house: 1, abilities: 2, equipment: 3, total: 6 },
  skilling: { tools: 4, equipment: 5, total: 9, available: true },
  assets: { allHouses: 10, allAbilities: 20 },
  equipmentHidden: false,
});

test("networth rerenders update existing UI instead of duplicating it", async () => {
  await runtime.api.calculateNetworth();
  await Promise.resolve();
  await runtime.api.calculateNetworth();
  await Promise.resolve();

  assert.equal(document.querySelectorAll("#script_current_assets").length, 1);
  assert.equal(
    document.querySelectorAll("#script_inventory_summary").length,
    1,
  );
  assert.equal(document.querySelectorAll("#script_api_fail_popout").length, 1);
  assert.match(
    document.querySelector("#script_current_assets").textContent,
    /10k/,
  );
  assert.match(
    document.querySelector("#toggleScores").textContent,
    /战斗着装评分：6\.0/,
  );
  assert.match(
    document.querySelector("#toggleSkillingScores").textContent,
    /生活着装评分：9\.0/,
  );
  assert.match(
    document.querySelector("#buildScores").textContent,
    /房屋：1\.0/,
  );
  assert.match(
    document.querySelector("#skillingScores").textContent,
    /工具：4\.0/,
  );
  assert.match(
    document.querySelector("#nonCurrentAssets").textContent,
    /房子价值：10M/,
  );
  assert.match(
    document.querySelector("#nonCurrentAssets").textContent,
    /技能价值：20M/,
  );
  assert.doesNotMatch(document.body.textContent, /战力打造分/);
});
