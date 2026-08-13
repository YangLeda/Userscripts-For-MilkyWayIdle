import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<!doctype html><html><head></head><body><div id="portal"><div id="native-tooltip" class="MuiTooltip-popper"><div class="native-content">Native tooltip</div></div></div></body></html>`,
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
await import("../src/core/market.js");
await import("../src/core/action-projection.js");
await import("../src/features/production-profit-panel.js");
const { resolveGatheringActionFromElement } =
  await import("../src/features/item-tooltips.js");

runtime.state.initData_actionDetailMap = {
  "/actions/crafting/panel-output": {
    hrid: "/actions/crafting/panel-output",
    name: "Panel Output",
    type: "/action_types/crafting",
    baseTimeCost: 10_000_000_000,
    inputItems: [{ itemHrid: "/items/input", count: 2 }],
    outputItems: [{ itemHrid: "/items/panel-output", count: 1 }],
  },
  "/actions/milking/rainbow-cow": {
    hrid: "/actions/milking/rainbow-cow",
    name: "Rainbow Cow",
    type: "/action_types/milking",
    baseTimeCost: 10_000_000_000,
    dropTable: [
      {
        itemHrid: "/items/rainbow_milk",
        dropRate: 0.5,
        minCount: 2,
        maxCount: 4,
      },
    ],
  },
};
runtime.state.initData_itemDetailMap = {
  "/items/input": { name: "Input" },
  "/items/panel-output": { name: "Panel Output" },
  "/items/rainbow_milk": { name: "Rainbow Milk" },
};
runtime.state.initData_characterSkills = [];
runtime.state.initData_characterItems = [];
runtime.state.initData_actionTypeDrinkSlotsMap = {
  "/action_types/crafting": [],
  "/action_types/milking": [],
};
runtime.state.currentEquipmentMap = {};
runtime.state.actionTypeBuffSources = {};
runtime.api.getAskPrice = (itemHrid) => (itemHrid === "/items/input" ? 10 : 0);
runtime.api.getNetSellPrice = (itemHrid) =>
  itemHrid === "/items/panel-output"
    ? 100
    : itemHrid === "/items/rainbow_milk"
      ? 200
      : 0;
runtime.api.getBidPrice = (itemHrid) => (itemHrid === "/items/input" ? 8 : 0);
runtime.api.getNetSellPriceAtAsk = (itemHrid) =>
  itemHrid === "/items/panel-output"
    ? 114
    : itemHrid === "/items/rainbow_milk"
      ? 220
      : 0;
runtime.api.getFairValue = (itemHrid) => {
  const ask = runtime.api.getAskPrice(itemHrid);
  if (ask > 0) return ask;
  const netSell = runtime.api.getNetSellPrice(itemHrid);
  return netSell > 0 ? netSell / 0.95 : 0;
};
runtime.api.getTotalEffiPercentage = () => 0;

function nativeTooltip() {
  return document.querySelector("#native-tooltip");
}

test("shared duration formatting uses integer day-hour-minute units", () => {
  runtime.config.isZH = true;
  assert.equal(
    runtime.api.timeReadable(2 * 86_400 + 6 * 3_600 + 15 * 60),
    "2天6小时15分",
  );
  runtime.config.isZH = false;
  assert.equal(
    runtime.api.timeReadable(2 * 86_400 + 6 * 3_600 + 15 * 60),
    "2d 6h 15m",
  );
  assert.equal(runtime.api.timeReadable(3_661), "1h 01m 01s");
  assert.equal(runtime.api.timeReadable(Number.NaN), "—");
  runtime.config.isZH = true;
});

test("profit UI displays three valuation rows with revenue, costs, and profit", () => {
  const anchor = nativeTooltip();
  const original = anchor.innerHTML;
  const panel = runtime.api.showProductionProfitPanel(
    anchor,
    "/items/panel-output",
  );

  assert.ok(panel);
  assert.equal(anchor.innerHTML, original);
  assert.equal(panel.parentElement, anchor.parentElement);
  assert.equal(anchor.nextElementSibling, panel);
  assert.match(panel.textContent, /投入/);
  assert.match(panel.textContent, /当前玩家/);
  assert.match(panel.textContent, /产出/);
  assert.match(panel.textContent, /未使用茶饮/);
  const rows = [...panel.querySelectorAll(".mwi-profit-valuation-row")];
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => row.dataset.mode),
    ["fair", "conservative", "aggressive"],
  );
  assert.match(rows[0].textContent, /市价/);
  assert.match(rows[1].textContent, /效率（高买低卖）/);
  assert.match(rows[2].textContent, /贪心（低买高卖）/);
  for (const row of rows) {
    assert.match(row.textContent, /税后收入\/动作/);
    assert.match(row.textContent, /材料成本\/动作/);
    assert.match(row.textContent, /茶饮成本\/动作/);
    assert.match(row.textContent, /总成本\/动作/);
    assert.match(row.textContent, /净利润\/动作/);
    assert.match(row.textContent, /净利润\/天/);
  }
  const profitValue = (mode, label) =>
    [
      ...panel
        .querySelector(`[data-mode="${mode}"]`)
        .querySelectorAll(".mwi-profit-valuation-metric"),
    ]
      .find((metric) => metric.textContent.includes(label))
      .querySelector(".mwi-profit-valuation-value");
  assert.equal(profitValue("fair", "净利润/动作").textContent, "80");
  assert.equal(profitValue("fair", "净利润/天").textContent, "691.2K");
  assert.equal(profitValue("fair", "净利润/天").title, "691,200");
  assert.equal(profitValue("conservative", "净利润/动作").textContent, "80");
  assert.equal(profitValue("aggressive", "净利润/动作").textContent, "98");
  assert.equal(profitValue("aggressive", "净利润/天").textContent, "846.7K");
  assert.equal(panel.querySelector(".mwi-profit-summary"), null);
  assert.equal(runtime.settings.settingsMap.profitValuationMode, undefined);
  assert.equal(
    document.querySelectorAll("#mwitools-production-profit-panel").length,
    1,
  );

  runtime.api.showProductionProfitPanel(anchor, "/items/panel-output");
  assert.equal(
    document.querySelectorAll("#mwitools-production-profit-panel").length,
    1,
  );
});

test("compact tooltip rows show dual production costs, missing prices, recipe state, and shortcut hint", () => {
  runtime.settings.settingsMap.itemTooltip_profit.isTrue = true;
  runtime.api.getTooltipProfitShortcut = () => ({ code: "KeyK", display: "K" });
  let html = runtime.api.getProductionCostTooltipRows("/items/panel-output");
  assert.match(html, /生产总成本\/动作（效率 \/ 贪心）/);
  assert.match(html, /20 \/ 16/);
  assert.match(html, /按住 K 显示详情；移动端长按显示详情/);

  html = runtime.api.getProductionCostTooltipRows("/items/no-recipe");
  assert.match(html, /无配方/);

  const originalAsk = runtime.api.getAskPrice;
  const originalBid = runtime.api.getBidPrice;
  const originalFair = runtime.api.getFairValue;
  runtime.api.getAskPrice = () => 0;
  runtime.api.getBidPrice = () => 0;
  runtime.api.getFairValue = () => 0;
  html = runtime.api.getProductionCostTooltipRows("/items/panel-output");
  assert.match(html, /缺价 \/ 缺价/);
  runtime.api.getAskPrice = originalAsk;
  runtime.api.getBidPrice = originalBid;
  runtime.api.getFairValue = originalFair;
});

test("open profit UI refreshes when equipped drinks change", () => {
  const panel = runtime.api.showProductionProfitPanel(
    nativeTooltip(),
    "/items/panel-output",
  );
  runtime.state.initData_itemDetailMap["/items/artisan_tea"] = {
    name: "Artisan Tea",
    consumableDetail: {
      buffs: [{ typeHrid: "/buff_types/artisan", flatBoost: 0.1 }],
    },
  };
  runtime.state.initData_actionTypeDrinkSlotsMap["/action_types/crafting"] = [
    { itemHrid: "/items/artisan_tea" },
  ];
  runtime.dispatchMessage({ type: "consumable_buffs_updated" });
  assert.match(panel.textContent, /工匠.*10%/);

  runtime.state.initData_actionTypeDrinkSlotsMap["/action_types/crafting"] = [];
  delete runtime.state.initData_itemDetailMap["/items/artisan_tea"];
  runtime.dispatchMessage({ type: "consumable_buffs_updated" });
});

test("gathering drop-table products open the same profit panel", () => {
  const panel = runtime.api.showProductionProfitPanel(
    nativeTooltip(),
    "/items/rainbow_milk",
  );
  assert.ok(panel);
  assert.match(panel.textContent, /彩虹牛奶/);
  assert.match(panel.textContent, /Rainbow Cow/);
  assert.match(panel.textContent, /1\.5/);
  assert.match(panel.textContent, /产出/);
});

test("direct gathering actions show every probability-weighted map output", () => {
  const actionHrid = "/actions/foraging/mixed_garden";
  runtime.state.initData_actionDetailMap[actionHrid] = {
    hrid: actionHrid,
    name: "Mixed Garden",
    type: "/action_types/foraging",
    baseTimeCost: 10_000_000_000,
    dropTable: [
      { itemHrid: "/items/berry", dropRate: 0.5, minCount: 1, maxCount: 3 },
      { itemHrid: "/items/flower", dropRate: 0.25, minCount: 2, maxCount: 2 },
      { itemHrid: "/items/herb", dropRate: 1, minCount: 1, maxCount: 1 },
      { itemHrid: "/items/rare_seed", dropRate: 0.1, minCount: 1, maxCount: 1 },
    ],
  };
  runtime.data.ZHActionNames[actionHrid] = "混合花园";
  for (const [itemHrid, name] of [
    ["/items/berry", "Berry"],
    ["/items/flower", "Flower"],
    ["/items/herb", "Herb"],
    ["/items/rare_seed", "Rare Seed"],
  ]) {
    runtime.state.initData_itemDetailMap[itemHrid] = { name };
    runtime.data.ZHItemNames[itemHrid] = name;
  }
  runtime.state.initData_actionTypeDrinkSlotsMap["/action_types/foraging"] = [];
  const oldNetSell = runtime.api.getNetSellPrice;
  const oldNetSellAtAsk = runtime.api.getNetSellPriceAtAsk;
  const oldBid = runtime.api.getBidPrice;
  runtime.api.getNetSellPrice = (itemHrid) =>
    itemHrid.startsWith("/items/") ? 100 : oldNetSell(itemHrid);
  runtime.api.getNetSellPriceAtAsk = (itemHrid) =>
    itemHrid.startsWith("/items/") ? 114 : oldNetSellAtAsk(itemHrid);
  runtime.api.getBidPrice = (itemHrid) =>
    itemHrid.startsWith("/items/") ? 95 : oldBid(itemHrid);

  const panel = runtime.api.showProductionProfitPanel(nativeTooltip(), null, {
    actionHrid,
  });
  assert.ok(panel);
  assert.match(panel.textContent, /混合花园/);
  assert.match(panel.textContent, /全部期望产物/);
  const quantities = Object.fromEntries(
    [...panel.querySelectorAll(".mwi-profit-item[data-item-hrid]")].map(
      (row) => [
        row.dataset.itemHrid,
        row.querySelector(".mwi-profit-item-meta").textContent,
      ],
    ),
  );
  assert.match(quantities["/items/berry"], /^1\s/);
  assert.match(quantities["/items/flower"], /^0\.5\s/);
  assert.match(quantities["/items/herb"], /^1\s/);
  assert.match(quantities["/items/rare_seed"], /^0\.1\s/);

  const actionCard = document.createElement("div");
  actionCard.className = "SkillAction_skillAction__test";
  actionCard.__reactFiber$gathering = {
    memoizedProps: {
      actionDetail: runtime.state.initData_actionDetailMap[actionHrid],
    },
    return: null,
  };
  document.body.append(actionCard);
  assert.equal(resolveGatheringActionFromElement(actionCard), actionHrid);
  actionCard.remove();

  runtime.api.getNetSellPrice = oldNetSell;
  runtime.api.getNetSellPriceAtAsk = oldNetSellAtAsk;
  runtime.api.getBidPrice = oldBid;
});

test("English valuation labels use Tea cost", () => {
  runtime.config.isZH = false;
  const panel = runtime.api.showProductionProfitPanel(
    nativeTooltip(),
    "/items/panel-output",
  );
  assert.match(panel.textContent, /Tea cost\/action/);
  assert.match(panel.textContent, /Tea cost\/hour/);
  assert.doesNotMatch(panel.textContent, /Drinks\//);
  runtime.config.isZH = true;
});

test("missing order-book prices use market-value fallback and appear in the bottom warning", () => {
  const getBidPrice = runtime.api.getBidPrice;
  runtime.api.getBidPrice = () => 0;

  const panel = runtime.api.showProductionProfitPanel(
    nativeTooltip(),
    "/items/panel-output",
  );
  const aggressiveRow = panel.querySelector('[data-mode="aggressive"]');
  const warning = panel.querySelector(".mwi-profit-warning");

  assert.equal(aggressiveRow.classList.contains("incomplete"), false);
  assert.doesNotMatch(aggressiveRow.textContent, /缺价|Input/);
  assert.match(aggressiveRow.textContent, /买单买入 · 卖单卖出/);
  assert.ok(warning);
  assert.match(warning.textContent, /市场价值兜底.*Input/);

  runtime.api.getBidPrice = getBidPrice;
  runtime.api.showProductionProfitPanel(nativeTooltip(), "/items/panel-output");
});

test("panel placement chooses the available side and stays inside the viewport", () => {
  const anchor = nativeTooltip();
  anchor.getBoundingClientRect = () => ({
    bottom: 300,
    height: 200,
    left: 100,
    right: 260,
    top: 100,
    width: 160,
  });
  const panel = runtime.api.showProductionProfitPanel(
    anchor,
    "/items/panel-output",
  );
  panel.getBoundingClientRect = () => ({
    bottom: 500,
    height: 400,
    left: 0,
    right: 620,
    top: 0,
    width: 620,
  });
  runtime.api.positionProductionProfitPanel();
  assert.equal(panel.dataset.placement, "right");
  assert.equal(panel.style.left, "270px");
  assert.equal(panel.style.top, "100px");

  globalThis.innerWidth = 900;
  anchor.getBoundingClientRect = () => ({
    bottom: 300,
    height: 200,
    left: 700,
    right: 860,
    top: 100,
    width: 160,
  });
  runtime.api.positionProductionProfitPanel();
  assert.equal(panel.dataset.placement, "left");
  assert.equal(panel.style.left, "70px");
  globalThis.innerWidth = 1_200;
});

test("missing character data shows a waiting state without defaults", () => {
  const skills = runtime.state.initData_characterSkills;
  runtime.state.initData_characterSkills = null;
  const panel = runtime.api.showProductionProfitPanel(
    nativeTooltip(),
    "/items/panel-output",
  );
  assert.equal(panel.dataset.status, "waiting");
  assert.match(panel.textContent, /玩家数据未就绪/);
  assert.match(panel.textContent, /未使用任何默认配置/);
  runtime.state.initData_characterSkills = skills;
});

test("sticky profit panels survive their native tooltip and close only outside", async () => {
  const anchor = document.createElement("div");
  anchor.id = "sticky-profit-anchor";
  document.querySelector("#portal").append(anchor);
  const panel = runtime.api.showProductionProfitPanel(
    anchor,
    "/items/panel-output",
    { sticky: true },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(panel.parentElement, document.body);
  anchor.remove();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(document.querySelector("#mwitools-production-profit-panel"));

  panel.dispatchEvent(
    new dom.window.MouseEvent("pointerdown", { bubbles: true }),
  );
  assert.ok(document.querySelector("#mwitools-production-profit-panel"));
  panel.dispatchEvent(new dom.window.Event("scroll", { bubbles: true }));
  assert.ok(document.querySelector("#mwitools-production-profit-panel"));
  document.body.dispatchEvent(
    new dom.window.MouseEvent("pointerdown", { bubbles: true }),
  );
  assert.equal(
    document.querySelector("#mwitools-production-profit-panel"),
    null,
  );
});

test("panel is removed when its native tooltip disappears", async () => {
  const anchor = nativeTooltip();
  runtime.api.showProductionProfitPanel(anchor, "/items/panel-output");
  anchor.remove();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    document.querySelector("#mwitools-production-profit-panel"),
    null,
  );
});
