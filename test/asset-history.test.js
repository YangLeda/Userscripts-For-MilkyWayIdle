import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.window = dom.window;

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/state.js");
const {
  AssetHistoryStore,
  ASSET_HISTORY_BACKUP_MARKER,
  getUtc8DayKey,
  normalizeAssetValues,
} = await import("../src/features/asset-history/10-store.js");
const { calculateMarketListingValues, getAssetSnapshot } =
  await import("../src/features/asset-history/00-snapshot.js");
const { AssetHistoryChart } =
  await import("../src/features/asset-history/20-chart.js");

function completeValues(totalOffset = 0) {
  return {
    equipment: 100 + totalOffset,
    inventory: 200,
    marketListings: 300,
    houses: 400,
    abilities: 500,
    nonTradableTokens: 600,
    shrine: 700,
  };
}

function snapshot(recordedAt, values = completeValues(), characterId = "7") {
  return {
    complete: true,
    recordedAt,
    server: "production",
    characterId,
    values,
  };
}

test("UTC+8 days overwrite in place and compare yesterday before older history", () => {
  localStorage.clear();
  const store = new AssetHistoryStore(localStorage);
  const scope = "production:7";

  assert.equal(getUtc8DayKey(new Date("2026-08-01T15:59:59Z")), "2026-08-01");
  assert.equal(getUtc8DayKey(new Date("2026-08-01T16:00:00Z")), "2026-08-02");

  store.record(snapshot("2026-08-01T12:00:00Z"), scope);
  store.record(snapshot("2026-08-02T12:00:00Z", completeValues(100)), scope);
  store.record(snapshot("2026-08-02T15:00:00Z", completeValues(200)), scope);
  assert.equal(store.list(scope).length, 2);
  assert.equal(store.getRole(scope).days["2026-08-02"].values.equipment, 300);

  const exact = store.comparison("2026-08-03", scope);
  assert.equal(exact.date, "2026-08-02");
  assert.equal(exact.gapDays, 1);

  const fallback = store.comparison("2026-08-06", scope);
  assert.equal(fallback.date, "2026-08-02");
  assert.equal(fallback.gapDays, 4);
});

test("calendar-normalized averages, role isolation, and edits recompute totals", () => {
  localStorage.clear();
  const store = new AssetHistoryStore(localStorage);
  const a = "production:7";
  const b = "china:7";
  store.record(snapshot("2026-08-01T16:00:00Z", completeValues(), "7"), a);
  store.record(snapshot("2026-08-08T16:00:00Z", completeValues(700), "7"), a);
  store.record(snapshot("2026-08-08T16:00:00Z", completeValues(), "7"), b);

  assert.equal(store.sevenDayAverage("2026-08-09", a), 100);
  assert.equal(store.list(a).length, 2);
  assert.equal(store.list(b).length, 1);

  const edited = store.updateDay("2026-08-09", completeValues(5), a);
  assert.equal(edited.liquid, 605);
  assert.equal(edited.fixed, 2200);
  assert.equal(edited.total, 2805);
  assert.equal(store.deleteDay("2026-08-09", a), true);
});

test("legacy Everyday Profit data and both backup schemas remain compatible", () => {
  localStorage.clear();
  localStorage.setItem(
    "kbd_calc_data",
    JSON.stringify({ Stella: { "2026-08-01": 12345 } }),
  );
  localStorage.setItem(
    "kbd_calc_breakdown_data",
    JSON.stringify({
      Stella: {
        "2026-08-01": {
          equip: 1,
          inventory: 2,
          orders: 3,
          house: 4,
          skill: 5,
        },
      },
    }),
  );
  localStorage.setItem("kbd_calc_tags", JSON.stringify({ keep: "legacy" }));
  const store = new AssetHistoryStore(localStorage);
  const scope = "production:7";
  assert.equal(store.migrateLegacy({ scopeKey: scope, roleName: "Stella" }), 1);
  const migrated = store.getRole(scope).days["2026-08-01"].values;
  assert.equal(migrated.total, 12345);
  assert.equal(migrated.nonTradableTokens, null);
  assert.equal(migrated.shrine, null);
  assert.ok(localStorage.getItem("kbd_calc_data"));

  const backup = store.exportBackup();
  assert.equal(backup[ASSET_HISTORY_BACKUP_MARKER], true);
  const restored = new AssetHistoryStore(dom.window.sessionStorage);
  assert.equal(restored.importBackup(backup, { scopeKey: scope }), 1);

  const oldBackup = {
    __everyday_profit_backup__: true,
    schema: 2,
    payload: {
      kbd_calc_data: { 7: { "2026-08-02": 99 } },
      kbd_calc_breakdown_data: {
        7: {
          "2026-08-02": {
            equip: 10,
            inventory: 20,
            orders: 30,
            house: 40,
            skill: 50,
          },
        },
      },
      kbd_calc_tags: { preserved: true },
    },
  };
  assert.equal(
    restored.importBackup(oldBackup, { scopeKey: scope, mode: "merge" }),
    1,
  );
  assert.equal(restored.list(scope).length, 2);
});

test("snapshot service calculates seven categories, totals, and taxed listings", async () => {
  runtime.state.currentCharacterId = "7";
  runtime.state.initData_characterItems = [
    {
      itemHrid: "/items/equipment",
      itemLocationHrid: "/item_locations/head",
      enhancementLevel: 0,
      count: 2,
    },
    {
      itemHrid: "/items/inventory",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 3,
    },
    {
      itemHrid: "/items/token",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 4,
    },
  ];
  runtime.state.initData_myMarketListings = [
    {
      isSell: true,
      itemHrid: "/items/inventory",
      orderQuantity: 10,
      filledQuantity: 2,
      coinsAvailable: 50,
      unclaimedItemCount: 1,
    },
  ];
  const prices = {
    "/items/equipment": { fair: 10, ask: 12, bid: 8 },
    "/items/inventory": { fair: 20, ask: 22, bid: 18 },
    "/items/token": { fair: 30, ask: 0, bid: 0 },
  };
  runtime.api.fetchMarketJSON = async () => ({ marketData: {} });
  runtime.api.ensureMarketValueSource = async () => true;
  runtime.api.getAssetValue = (item) => prices[item].fair;
  runtime.api.getAskPrice = (item) => prices[item].ask;
  runtime.api.getBidPrice = (item) => prices[item].bid;
  runtime.api.getMarketTaxRate = () => 0.05;
  runtime.api.isNonTradableTokenAsset = (item) => item === "/items/token";
  runtime.api.getSelfBuildScores = async () => ({
    assets: { allHouses: 2, allAbilities: 3 },
  });
  runtime.api.getGuildShrineValue = () => 400;
  runtime.api.getMarketEnvironment = () => "production";

  const listings = calculateMarketListingValues(
    runtime.state.initData_myMarketListings,
  );
  assert.equal(listings.fair, 222);
  assert.equal(listings.ask, 239.2);
  assert.ok(Math.abs(listings.bid - 204.8) < 1e-9);
  const result = await getAssetSnapshot();
  assert.deepEqual(result.values, {
    equipment: 20,
    inventory: 60,
    marketListings: 222,
    houses: 2_000_000,
    abilities: 3_000_000,
    nonTradableTokens: 120,
    shrine: 400,
    liquid: 302,
    fixed: 5_000_520,
    total: 5_000_822,
  });
  assert.equal(result.complete, true);
});

test("a refined back item is included in equipped assets with its location", async () => {
  runtime.state.initData_characterItems = [
    {
      itemHrid: "/items/artificer_cape_refined",
      itemLocationHrid: "/item_locations/back",
      enhancementLevel: 8,
      count: 1,
    },
  ];
  runtime.state.initData_myMarketListings = [];
  let received;
  runtime.api.getAssetValue = (itemHrid, enhancementLevel, options) => {
    received = { itemHrid, enhancementLevel, options };
    return 777;
  };
  runtime.api.getAskPrice = () => 0;
  runtime.api.getBidPrice = () => 0;
  runtime.api.getSelfBuildScores = async () => ({
    assets: { allHouses: 0, allAbilities: 0 },
  });
  runtime.api.getGuildShrineValue = () => 0;

  const result = await getAssetSnapshot();
  assert.equal(result.values.equipment, 777);
  assert.deepEqual(received, {
    itemHrid: "/items/artificer_cape_refined",
    enhancementLevel: 8,
    options: { itemLocationHrid: "/item_locations/back" },
  });
});

test("warehouse assets include every refined and enhanced cape state", async () => {
  const values = new Map([
    ["/items/chance_cape:0", 100],
    ["/items/chance_cape:5", 200],
    ["/items/chance_cape_refined:0", 300],
    ["/items/chance_cape_refined:5", 400],
  ]);
  runtime.state.initData_characterItems = [...values.keys()].map((key) => {
    const [itemHrid, enhancementLevel] = key.split(":");
    return {
      itemHrid,
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: Number(enhancementLevel),
      count: 1,
    };
  });
  runtime.state.initData_myMarketListings = [];
  runtime.api.getAssetValue = (itemHrid, enhancementLevel) =>
    values.get(`${itemHrid}:${enhancementLevel}`) ?? 0;
  runtime.api.getAskPrice = () => 0;
  runtime.api.getBidPrice = () => 0;
  runtime.api.isNonTradableTokenAsset = () => false;
  runtime.api.getSelfBuildScores = async () => ({
    assets: { allHouses: 0, allAbilities: 0 },
  });
  runtime.api.getGuildShrineValue = () => 0;

  const result = await getAssetSnapshot();
  assert.equal(result.values.equipment, 0);
  assert.equal(result.values.inventory, 1_000);
  assert.equal(result.values.total, 1_000);
});

test("unknown legacy components never become fake zero-valued percentages", () => {
  const values = normalizeAssetValues(
    { equipment: 1, inventory: 2, marketListings: 3, total: 99 },
    { preserveTotal: true },
  );
  assert.equal(values.nonTradableTokens, null);
  assert.equal(values.shrine, null);
  assert.equal(values.fixed, null);
  assert.equal(values.total, 99);
});

test("history charts retain zoom gestures and calendar-normalized 7-day averages", () => {
  let options;
  globalThis.Chart = class {
    constructor(_context, value) {
      options = value;
    }
    destroy() {}
  };
  runtime.config.isZH = true;
  runtime.api.formatExactNumber = String;
  runtime.api.numberFormatter = String;
  const chart = new AssetHistoryChart(
    { hidden: false, getContext: () => ({}) },
    { hidden: true, textContent: "" },
  );
  const values = (total) => ({ ...completeValues(), total });
  chart.render(
    [
      ["2026-08-01", { values: values(100) }],
      ["2026-08-03", { values: values(160) }],
      ["2026-08-10", { values: values(300) }],
    ],
    { mode: "profit", range: null },
  );
  assert.deepEqual(options.data.datasets[0].data, [null, 30, 20]);
  assert.deepEqual(options.data.datasets[1].data, [null, 30, 20]);
  assert.equal(options.options.plugins.zoom.zoom.wheel.enabled, true);
  assert.equal(options.options.plugins.zoom.zoom.pinch.enabled, true);
  assert.equal(options.options.plugins.zoom.pan.enabled, true);
});
