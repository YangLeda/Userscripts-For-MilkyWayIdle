import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";
import LZString from "lz-string";

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://test.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.window = dom.window;

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/core/state.js");
await import("../src/core/market.js");

test("unified numbers use K/M/B/T, promote rounded boundaries and keep exact titles", () => {
  assert.equal(runtime.api.numberFormatter(null), "—");
  assert.equal(runtime.api.numberFormatter(999), "999");
  assert.equal(runtime.api.numberFormatter(1_000), "1K");
  assert.equal(runtime.api.numberFormatter(12_345_678_901), "12.35B");
  assert.equal(runtime.api.numberFormatter(999_999_999), "1B");
  assert.equal(runtime.api.numberFormatter(-1_250_000), "-1.25M");
  assert.equal(runtime.api.numberFormatter(1_250_000_000_000_000), "1,250T");
  assert.equal(runtime.api.formatExactNumber(12_345_678_901), "12,345,678,901");
  assert.equal(runtime.api.formatExactNumber(599.999999999, 0), "600");
  assert.equal(runtime.api.formatExactNumber(1.49, 0), "1");
  assert.equal(runtime.api.formatExactNumber(1.5, 0), "2");
  assert.equal(runtime.api.formatExactNumber(-1.5, 0), "-2");
  assert.equal(runtime.api.formatExactNumber(0.5), "0.5");
  const element = runtime.api.createFormattedNumber(12_345_678_901);
  assert.equal(element.textContent, "12.35B");
  assert.equal(element.title, "12,345,678,901");
});

test("number parsing and formatting follow the game locale instead of the system locale", () => {
  localStorage.setItem("i18nextLng", "pt");
  assert.equal(runtime.config.THOUSAND_SEPERATOR, ".");
  assert.equal(runtime.config.DECIMAL_SEPERATOR, ",");
  assert.equal(runtime.api.parseCompactNumber("14,2"), 14.2);
  assert.equal(runtime.api.parseCompactNumber("1.234,5K"), 1_234_500);
  assert.equal(runtime.api.numberFormatter(1_530), "1,53K");
  assert.equal(runtime.api.formatExactNumber(1_234.5), "1.234,5");

  localStorage.setItem("i18nextLng", "fr");
  const groupedFrench = new Intl.NumberFormat("fr").format(1_234.5);
  assert.equal(runtime.api.parseCompactNumber(groupedFrench), 1_234.5);

  localStorage.setItem("i18nextLng", "en-US");
});

test("optional million cap keeps billion and trillion values in M", () => {
  runtime.settings.settingsMap.displayCapMM.isTrue = true;
  assert.equal(runtime.api.numberFormatter(1_200_000_000), "1,200M");
  assert.equal(runtime.api.numberFormatter(1_250_000_000_000), "1,250,000M");
  assert.equal(runtime.api.numberFormatter(12_500_000), "12.5M");
  assert.equal(runtime.api.numberFormatter(12_500), "12.5K");
  runtime.settings.settingsMap.displayCapMM.isTrue = false;
  assert.equal(runtime.api.numberFormatter(1_200_000_000), "1.2B");
});

test("market endpoints and refresh intervals follow the current server", () => {
  assert.equal(
    runtime.api.getMarketApiUrl("test.milkywayidle.com"),
    "https://test.milkywayidle.com/game_data/marketplace.json",
  );
  assert.equal(
    runtime.api.getMarketApiUrl("www.milkywayidle.com"),
    "https://www.milkywayidle.com/game_data/marketplace.json",
  );
  assert.equal(
    runtime.api.getMarketApiUrl("www.milkywayidlecn.com"),
    "https://www.milkywayidlecn.com/game_data/marketplace.json",
  );
  assert.equal(
    runtime.api.getMarketRefreshInterval("test.milkywayidle.com"),
    10 * 60 * 1000,
  );
  assert.equal(
    runtime.api.getMarketRefreshInterval("www.milkywayidle.com"),
    6 * 60 * 60 * 1000,
  );
});

test("server values use exact enhancement levels and orderbook fallbacks", () => {
  runtime.api.validateMarketJsonFetch({
    timestamp: 1,
    marketData: {
      "/items/test": {
        0: { a: 120, b: 80 },
        2: { a: 500, b: -1 },
      },
      "/items/bid_only": { 0: { a: -1, b: 75 } },
    },
  });
  runtime.state.marketItemValues = { "/items/test": { 2: 450 } };

  assert.equal(runtime.api.getFairValue("/items/test", 2), 450);
  assert.equal(runtime.api.getFairValue("/items/test", 0), 100);
  assert.equal(runtime.api.getFairValue("/items/bid_only", 0), 75);
  assert.equal(runtime.api.getAskPrice("/items/test", 2), 500);
  assert.equal(runtime.api.getBidPrice("/items/test", 2), 0);
});

test("asset valuation prices stay frozen while live orderbook values update", () => {
  runtime.api.resetAssetValuationMarketSnapshot();
  runtime.state.marketItemValues = {
    "/items/already_seen": { 0: 100 },
    "/items/not_seen_yet": { 0: 200 },
  };

  assert.equal(runtime.api.getAssetFairValue("/items/already_seen", 0), 100);

  runtime.api.applyMarketOrderBooks({
    itemHrid: "/items/already_seen",
    orderBooks: {},
    marketValues: { 0: 150 },
  });
  runtime.api.applyMarketOrderBooks({
    itemHrid: "/items/not_seen_yet",
    orderBooks: {},
    marketValues: { 0: 250 },
  });

  assert.equal(runtime.api.getFairValue("/items/already_seen", 0), 150);
  assert.equal(runtime.api.getFairValue("/items/not_seen_yet", 0), 250);
  assert.equal(runtime.api.getAssetFairValue("/items/already_seen", 0), 100);
  assert.equal(runtime.api.getAssetFairValue("/items/not_seen_yet", 0), 200);
  assert.equal(runtime.api.isAssetValuationMarketDirty(), true);

  runtime.api.resetAssetValuationMarketSnapshot();
  assert.equal(runtime.api.getAssetFairValue("/items/already_seen", 0), 150);
  assert.equal(runtime.api.getAssetFairValue("/items/not_seen_yet", 0), 250);
  assert.equal(runtime.api.isAssetValuationMarketDirty(), false);
});

test("compressed game market values are restored at startup", () => {
  const cached = {
    marketValuesVersion: "test-version",
    marketItemValues: { "/items/milk": { 0: 1015 } },
  };
  localStorage.setItem(
    "marketItemValues",
    LZString.compressToUTF16(JSON.stringify(cached)),
  );

  assert.equal(runtime.api.loadMarketItemValuesFromStorage(), true);
  assert.equal(runtime.state.marketValuesVersion, "test-version");
  assert.equal(runtime.api.getFairValue("/items/milk", 0), 1015);
});

test("taxes, compact numbers and new price increments are supported", () => {
  assert.equal(runtime.api.getMarketTaxRate("/items/milk"), 0.05);
  assert.equal(runtime.api.getMarketTaxRate("/items/bag_of_10_cowbells"), 0.18);
  assert.equal(runtime.api.parseCompactNumber("1.25t"), 1.25e12);
  assert.equal(runtime.api.parseCompactNumber("2.5B"), 2.5e9);
  assert.equal(runtime.api.numberFormatter(1.2e12), "1.2T");
  assert.equal(runtime.api.getMarketPriceIncrement(1_000), 5);
  assert.equal(runtime.api.getMarketPriceIncrement(3_000), 10);
  assert.equal(runtime.api.getMarketPriceIncrement(5_000), 20);
  assert.equal(runtime.api.normalizeMarketPrice(1_234_567), 1_235_000);
  assert.equal(runtime.api.normalizeMarketPrice(2e12), 1e12);
});

test("price bands and pegged listing prices retain server semantics", () => {
  runtime.state.marketItemValues = { "/items/test": { 0: 100 } };
  assert.deepEqual(runtime.api.getPriceBand("/items/test", 0), {
    minimum: 90,
    maximum: 110,
  });
  assert.equal(
    runtime.api.getListingWorkingPrice({ price: 200, workingPrice: 110 }),
    110,
  );
  assert.equal(runtime.api.getListingWorkingPrice({ price: 95 }), 95);
});
