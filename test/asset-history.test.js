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
  ASSET_HISTORY_SCHEMA_VERSION,
  getUtc8DayKey,
  normalizeAssetValues,
} = await import("../src/features/asset-history/10-store.js");
const {
  buildHeatmap,
  calculateAchievements,
  componentAnalysis,
  periodStatistics,
  simulateNetWorth,
} = await import("../src/features/asset-history/15-analytics.js");
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

test("historical insertion validates dates, never overwrites, and stays role-scoped", () => {
  localStorage.clear();
  const store = new AssetHistoryStore(localStorage);
  const a = "production:7";
  const b = "china:7";
  store.updateDay("2026-08-01", completeValues(), a);
  store.updateDay("2026-08-05", completeValues(400), a);
  store.updateDay("2026-08-03", completeValues(), b);

  const inserted = store.insertDay("2026-08-03", completeValues(100), a);
  assert.equal(inserted.equipment, 200);
  assert.equal(inserted.total, 2_900);
  assert.equal(store.getRole(a).days["2026-08-03"].inserted, true);
  assert.equal(store.getRole(a).days["2026-08-03"].edited, true);
  assert.equal(
    store.getRole(a).days["2026-08-03"].recordedAt,
    "2026-08-03T15:59:59.999Z",
  );
  assert.deepEqual(
    store.list(a).map(([date]) => date),
    ["2026-08-01", "2026-08-03", "2026-08-05"],
  );
  assert.equal(store.list(b).length, 1);
  assert.equal(periodStatistics(store.list(a)).changes.length, 2);
  assert.ok(buildHeatmap(store.list(a))["2026-08-03"]);

  assert.throws(
    () => store.insertDay("2026-08-03", completeValues(999), a),
    /already contains/,
  );
  assert.equal(store.getRole(a).days["2026-08-03"].values.equipment, 200);
  assert.throws(
    () => store.insertDay("2026-02-30", completeValues(), a),
    /valid day key/,
  );
  assert.throws(
    () => store.insertDay("2026-08-04", { ...completeValues(), shrine: -1 }, a),
    /non-negative/,
  );
  assert.throws(
    () =>
      store.insertDay(
        "2026-08-04",
        { ...completeValues(), shrine: undefined },
        a,
      ),
    /non-negative/,
  );
  assert.equal(store.getRole(a).days["2026-08-04"], undefined);
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

test("guild and dungeon token switch changes current and historical asset categories together", async () => {
  const optionalTokens = [
    "/items/guild_token",
    "/items/chimerical_token",
    "/items/sinister_token",
    "/items/enchanted_token",
    "/items/pirate_token",
  ];
  const originals = {
    asset: runtime.api.getAssetValue,
    ask: runtime.api.getAskPrice,
    bid: runtime.api.getBidPrice,
    nonTradable: runtime.api.isNonTradableTokenAsset,
    optional: runtime.api.isOptionalTokenAsset,
    include: runtime.api.shouldIncludeGuildDungeonTokensInAssets,
  };
  let includeOptional = true;
  runtime.state.initData_characterItems = [
    ...optionalTokens.map((itemHrid) => ({
      itemHrid,
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 1,
    })),
    {
      itemHrid: "/items/task_token",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 1,
    },
  ];
  runtime.state.initData_myMarketListings = [];
  runtime.api.getAssetValue = () => 10;
  runtime.api.getAskPrice = () => 0;
  runtime.api.getBidPrice = () => 0;
  runtime.api.isOptionalTokenAsset = (itemHrid) =>
    optionalTokens.includes(itemHrid);
  runtime.api.shouldIncludeGuildDungeonTokensInAssets = () => includeOptional;
  runtime.api.isNonTradableTokenAsset = (itemHrid) =>
    includeOptional && optionalTokens.includes(itemHrid);
  runtime.api.getSelfBuildScores = async () => ({
    assets: { allHouses: 0, allAbilities: 0 },
  });
  runtime.api.getGuildShrineValue = () => 0;

  let result = await getAssetSnapshot();
  assert.equal(result.values.nonTradableTokens, 50);
  assert.equal(result.values.inventory, 10);
  assert.equal(result.values.total, 60);

  includeOptional = false;
  result = await getAssetSnapshot();
  assert.equal(result.values.nonTradableTokens, 0);
  assert.equal(result.values.inventory, 10);
  assert.equal(result.values.total, 10);

  Object.assign(runtime.api, {
    getAssetValue: originals.asset,
    getAskPrice: originals.ask,
    getBidPrice: originals.bid,
    isNonTradableTokenAsset: originals.nonTradable,
    isOptionalTokenAsset: originals.optional,
    shouldIncludeGuildDungeonTokensInAssets: originals.include,
  });
});

test("market listings prefer direct market value over protected equipment value", () => {
  const originals = {
    fair: runtime.api.getFairValue,
    asset: runtime.api.getAssetValue,
    ask: runtime.api.getAskPrice,
    bid: runtime.api.getBidPrice,
    tax: runtime.api.getMarketTaxRate,
  };
  runtime.api.getFairValue = () => 100;
  runtime.api.getAssetValue = () => 500;
  runtime.api.getAskPrice = () => 120;
  runtime.api.getBidPrice = () => 80;
  runtime.api.getMarketTaxRate = () => 0;

  assert.deepEqual(
    calculateMarketListingValues([
      {
        itemHrid: "/items/enhanced_equipment",
        enhancementLevel: 10,
        isSell: true,
        orderQuantity: 3,
        filledQuantity: 0,
        unclaimedItemCount: 2,
      },
    ]),
    { fair: 500, ask: 600, bid: 400 },
  );

  Object.assign(runtime.api, {
    getFairValue: originals.fair,
    getAssetValue: originals.asset,
    getAskPrice: originals.ask,
    getBidPrice: originals.bid,
    getMarketTaxRate: originals.tax,
  });
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
  assert.equal(options.options.responsive, false);
});

test("history charts size connected canvases without Chart.js DOM observers", () => {
  let created = 0;
  let received;
  globalThis.Chart = class {
    constructor(context, options) {
      created += 1;
      received = { context, options };
    }
    destroy() {}
  };
  const context = {};
  const canvas = {
    hidden: false,
    isConnected: true,
    style: {},
    width: 300,
    height: 150,
    getBoundingClientRect: () => ({ width: 640, height: 280 }),
    getContext: () => context,
  };
  const chart = new AssetHistoryChart(canvas, {
    hidden: true,
    textContent: "",
  });

  assert.equal(chart.render([], { mode: "total" }), true);
  assert.equal(created, 1);
  assert.equal(received.context, context);
  assert.equal(received.options.options.responsive, false);
  assert.equal(canvas.width, 640);
  assert.equal(canvas.height, 280);
  assert.equal(canvas.style.width, "100%");
  assert.equal(canvas.style.height, "100%");

  canvas.isConnected = false;
  assert.equal(chart.render([], { mode: "total" }), false);
  assert.equal(created, 1);
});

test("component charts use absolute holdings, compact tooltips, and persistent legend toggles", () => {
  let options;
  globalThis.Chart = class {
    constructor(_context, value) {
      options = value;
    }
    destroy() {}
  };
  runtime.config.isZH = false;
  runtime.api.numberFormatter = (value) => `${value / 1_000}K`;
  const chart = new AssetHistoryChart(
    { hidden: false, getContext: () => ({}) },
    { hidden: true, textContent: "" },
  );
  const entries = [
    ["2026-08-01", { values: { ...completeValues(), equipment: 1_200 } }],
    ["2026-08-02", { values: { ...completeValues(), equipment: 800 } }],
  ];

  chart.render(entries, { mode: "breakdown", range: null });
  assert.deepEqual(options.data.datasets[0].data, [1_200, 800]);
  assert.equal(options.options.plugins.title.text, "Component assets");
  assert.equal(
    options.options.plugins.tooltip.callbacks.label({
      raw: 1_200,
      dataset: { label: "Equipment" },
    }),
    "Equipment: 1.2K",
  );

  let visible = true;
  const legendChart = {
    data: options.data,
    isDatasetVisible: () => visible,
    setDatasetVisibility(_index, next) {
      visible = next;
    },
    update() {},
  };
  options.options.plugins.legend.onClick(
    null,
    { datasetIndex: 0 },
    { chart: legendChart },
  );
  assert.equal(visible, false);
  chart.render(entries, { mode: "breakdown", range: 7 });
  assert.equal(options.data.datasets[0].hidden, true);

  const secondLegendChart = {
    data: options.data,
    isDatasetVisible: () => false,
    setDatasetVisibility(_index, next) {
      visible = next;
    },
    update() {},
  };
  options.options.plugins.legend.onClick(
    null,
    { datasetIndex: 0 },
    { chart: secondLegendChart },
  );
  chart.render(entries, { mode: "breakdown", range: null });
  assert.equal(options.data.datasets[0].hidden, false);

  chart.render(
    [
      ["2026-08-01", { values: { ...completeValues(), total: 1_200 } }],
      ["2026-08-02", { values: { ...completeValues(), total: 800 } }],
    ],
    { mode: "profit", range: null },
  );
  assert.deepEqual(options.data.datasets[0].data, [null, -400]);
});

test("schema two migrates complete Everyday Profit state without deleting legacy keys", () => {
  localStorage.clear();
  localStorage.setItem(
    "kbd_calc_data",
    JSON.stringify({ Stella: { "2026-08-01": 100, "2026-08-02": 150 } }),
  );
  localStorage.setItem(
    "kbd_calc_breakdown_data",
    JSON.stringify({
      Stella: {
        "2026-08-02": {
          equip: 10,
          inventory: 20,
          orders: 30,
          house: 40,
          skill: 50,
        },
      },
    }),
  );
  localStorage.setItem(
    "kbd_calc_tags",
    JSON.stringify({
      Stella: {
        "2026-08-02": [{ id: "tag-1", text: "强化成功", type: "enhance" }],
      },
    }),
  );
  localStorage.setItem(
    "ep_achievements_data",
    JSON.stringify({
      Stella: { nw_1m: { unlocked: true, date: "2026-08-02" } },
    }),
  );
  localStorage.setItem("ep_goal_target", JSON.stringify({ Stella: 999 }));
  localStorage.setItem("ep_theme_mode", "light");
  localStorage.setItem("ep_chart_settings", JSON.stringify({ maWindow: 14 }));

  const store = new AssetHistoryStore(localStorage);
  assert.equal(store.data.version, ASSET_HISTORY_SCHEMA_VERSION);
  assert.equal(
    store.migrateLegacy({ scopeKey: "production:7", roleName: "Stella" }),
    2,
  );
  assert.equal(store.listTags("production:7")[0].text, "强化成功");
  assert.equal(store.getGoalTarget("production:7"), 999);
  assert.equal(store.getAchievements("production:7").nw_1m.unlocked, true);
  assert.equal(store.getPreferences().themeMode, "light");
  assert.equal(store.getPreferences().chart.maWindow, 14);
  assert.ok(localStorage.getItem("kbd_calc_tags"));
});

test("legacy role buckets migrate once in stable order and EP backup settings are restored", () => {
  localStorage.clear();
  localStorage.setItem(
    "kbd_calc_data",
    JSON.stringify({
      Alice: { "2026-08-01": 100 },
      Bob: { "2026-08-01": 200 },
    }),
  );
  const store = new AssetHistoryStore(localStorage);
  store.migrateLegacy({ scopeKey: "production:7" });
  store.migrateLegacy({ scopeKey: "production:8" });
  assert.equal(store.list("production:7")[0][1].values.total, 100);
  assert.equal(store.list("production:8")[0][1].values.total, 200);

  store.importBackup(
    {
      __everyday_profit_backup__: true,
      payload: {
        kbd_calc_data: { Bob: { "2026-08-02": 250 } },
      },
      settings: {
        ep_theme_mode: "light",
        ep_window_size: { w: 920, h: 680 },
        ep_chart_settings: { defaultView: "profit", maWindow: 14 },
      },
    },
    { mode: "merge", scopeKey: "production:8" },
  );
  assert.equal(store.getPreferences().themeMode, "light");
  assert.deepEqual(store.getPreferences().windowSize, { w: 920, h: 680 });
  assert.equal(store.getPreferences().chart.defaultView, "profit");
});

test("tags, preferences, and full schema two backups round-trip", () => {
  localStorage.clear();
  const store = new AssetHistoryStore(localStorage);
  const scope = "production:7";
  store.record(snapshot("2026-08-01T12:00:00Z"), scope);
  const tag = store.addTag("2026-08-01", " first   milestone ", "life", scope);
  assert.equal(tag.text, "first milestone");
  assert.equal(
    store.updateTag(tag.id, { text: "updated" }, scope).text,
    "updated",
  );
  store.setGoalTarget(5_000, scope);
  store.setPreferences({ themeMode: "light", chart: { maWindow: 21 } });
  const backup = store.exportBackup();
  assert.equal(backup.schema, ASSET_HISTORY_SCHEMA_VERSION);

  const restored = new AssetHistoryStore(dom.window.sessionStorage);
  assert.equal(
    restored.importBackup(backup, { mode: "full", scopeKey: scope }),
    1,
  );
  assert.equal(restored.listTags(scope)[0].text, "updated");
  assert.equal(restored.getGoalTarget(scope), 5_000);
  assert.equal(restored.getPreferences().chart.maWindow, 21);
  assert.equal(restored.deleteTag(tag.id, scope), true);
});

function analyticsEntry(date, total, componentOffset = 0) {
  const values = completeValues(componentOffset);
  values.total = total;
  return [date, { values }];
}

test("reports, heatmaps, components, and achievements use structured history", () => {
  const entries = [
    analyticsEntry("2026-08-01", 1_000),
    analyticsEntry("2026-08-04", 1_300, 300),
    analyticsEntry("2026-08-05", 1_200, 200),
    analyticsEntry("2026-08-06", 2_100, 1_100),
  ];
  const report = periodStatistics(entries);
  assert.equal(report.totalProfit, 1_100);
  assert.equal(report.averagePerDay, 220);
  assert.equal(report.profitDays, 2);
  assert.equal(report.lossDays, 1);
  assert.equal(buildHeatmap(entries)["2026-08-04"].gapDays, 3);
  const analysis = componentAnalysis(entries, null);
  assert.equal(analysis.gapDays, 5);
  assert.equal(analysis.components.length, 7);
  const achievements = calculateAchievements(entries);
  assert.equal(achievements.find(({ id }) => id === "growth_5").unlocked, true);
  assert.equal(achievements.find(({ id }) => id === "comeback").unlocked, true);
  for (const id of [
    "bd_equip_1b",
    "bd_inv_1b",
    "bd_order_1b",
    "bd_house_1b",
    "bd_skill_1b",
    "bd_tokens_1b",
    "bd_shrine_1b",
  ]) {
    assert.ok(achievements.some((achievement) => achievement.id === id));
  }
});

test("Monte Carlo is deterministic with an injected random source", () => {
  const entries = Array.from({ length: 20 }, (_, index) =>
    analyticsEntry(
      `2026-08-${String(index + 1).padStart(2, "0")}`,
      1_000 * 1.01 ** index,
      index,
    ),
  );
  let state = 123456789;
  const random = () => {
    state = (1103515245 * state + 12345) % 2147483648;
    return state / 2147483648;
  };
  const result = simulateNetWorth(entries, {
    days: 30,
    runs: 200,
    target: 2_000,
    random,
  });
  assert.equal(result.status, "complete");
  assert.equal(result.method, "block-bootstrap");
  assert.equal(result.series.p50.length, 31);
  assert.ok(result.series.p10[30] <= result.series.p50[30]);
  assert.ok(result.series.p50[30] <= result.series.p90[30]);
  assert.ok(result.probabilities[30] >= 0 && result.probabilities[30] <= 100);
});
