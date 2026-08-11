import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<!doctype html><html><head></head><body>
    <div class="GuildPanel_exchangeModalContent__test">
      <svg aria-label="Green Guild Credit"><use href="/items.svg#green_guild_credit"></use></svg>
      <svg aria-label="Cheese"><use href="/items.svg#cheese"></use></svg>
      <input type="number" value="2">
    </div>
  </body></html>`,
  { url: "https://test.milkywayidle.com/" },
);
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.location = dom.window.location;
globalThis.localStorage = dom.window.localStorage;
localStorage.setItem("i18nextLng", "zh-CN");

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/data/translations.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
const {
  collectGuildCreditConversions,
  evaluateGuildCreditConversion,
  quoteGuildCreditAsk,
  readGuildExchangeContext,
  renderGuildCreditAdvisor,
} = await import("../src/features/guild-credit-advisor.js");

runtime.state.initData_itemDetailMap = {
  "/items/green_guild_credit": { name: "Green Guild Credit" },
  "/items/milk": {
    name: "Milk",
    guildCreditConversions: [
      {
        creditItemHrid: "/items/green_guild_credit",
        itemCount: 10,
        creditCount: 2,
      },
    ],
  },
  "/items/cheese": {
    name: "Cheese",
    guildCreditConversions: [
      {
        creditItemHrid: "/items/green_guild_credit",
        itemCount: 4,
        creditCount: 2,
      },
    ],
  },
};
Object.assign(runtime.state.itemEnNameToHridMap, {
  "Green Guild Credit": "/items/green_guild_credit",
  Milk: "/items/milk",
  Cheese: "/items/cheese",
});
runtime.state.marketApiJson = {
  timestamp: 1,
  marketData: {
    "/items/milk": { 0: { a: 100, b: 90 } },
    "/items/cheese": { 0: { a: 300, b: 250 } },
  },
};
runtime.api.ensureMarketValueSource = async () => true;

test("guild exchange context resolves the credit, selected item and batches", () => {
  assert.deepEqual(
    readGuildExchangeContext(
      document.querySelector('[class*="GuildPanel_exchangeModalContent"]'),
    ),
    {
      creditItemHrid: "/items/green_guild_credit",
      selectedItemHrid: "/items/cheese",
      batchCount: 2,
    },
  );
  assert.equal(
    collectGuildCreditConversions("/items/green_guild_credit").length,
    2,
  );
});

test("guild conversion quotes consume order-book depth and round batches", () => {
  runtime.state.marketOrderBooks["/items/milk"] = {
    0: { asks: [{ price: 100, quantity: 15 }] },
  };
  const milk = collectGuildCreditConversions("/items/green_guild_credit").find(
    ({ itemHrid }) => itemHrid === "/items/milk",
  );
  const result = evaluateGuildCreditConversion(milk, 3);
  assert.equal(result.batches, 2);
  assert.equal(result.requiredItems, 20);
  assert.equal(result.available, false);

  runtime.state.marketOrderBooks["/items/milk"][0].asks[0].quantity = 20;
  const available = evaluateGuildCreditConversion(milk, 3);
  assert.equal(available.totalCost, 2_000);
  assert.equal(available.producedCredits, 4);
  assert.equal(available.costPerCredit, 500);

  delete runtime.state.marketOrderBooks["/items/cheese"];
  assert.deepEqual(quoteGuildCreditAsk("/items/cheese", 4), {
    available: true,
    totalCost: 1_200,
    estimated: true,
  });
});

test("guild advisor shows the cheapest ask conversion and selected premium", async () => {
  runtime.state.marketOrderBooks["/items/milk"] = {
    0: { asks: [{ price: 100, quantity: 100 }] },
  };
  const card = await renderGuildCreditAdvisor();
  assert.ok(card);
  assert.match(card.textContent, /最优：牛奶/);
  assert.match(card.textContent, /当前：奶酪/);
  assert.match(card.textContent, /20\.0%/);
  assert.equal(
    document.querySelectorAll("#mwitools-guild-credit-advisor").length,
    1,
  );
});
