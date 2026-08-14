import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<!doctype html><html><head></head><body>
    <div id="guild-shop" class="GuildPanel_shopTab__test"></div>
    <div class="Modal_modalContainer__test">
      <div class="GuildPanel_exchangeModalContent__test">
        <svg aria-label="Green Guild Credit"><use href="/items.svg#green_guild_credit"></use></svg>
        <svg class="selected-item" aria-label="Cheese"><use href="/items.svg#cheese"></use></svg>
        <input type="number" value="2">
      </div>
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
await import("../src/core/game-data.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
const {
  collectGuildCreditConversions,
  evaluateGuildCreditConversion,
  evaluateGuildCreditReplacement,
  findVisibleItemSelector,
  positionGuildCreditAdvisor,
  quoteGuildCreditAsk,
  quoteGuildCreditBid,
  readGuildExchangeContext,
  renderGuildCreditAdvisor,
  renderGuildCreditRecommendations,
} = await import("../src/features/guild-credit-advisor.js");
const { registerGameLocaleResources } =
  await import("../src/core/game-localization.js");

registerGameLocaleResources("zh", {
  itemNames: {
    "/items/green_guild_credit": "绿色公会信用",
    "/items/milk": "牛奶",
    "/items/cheese": "奶酪",
    "/items/yogurt": "酸奶",
    "/items/flour": "面粉",
  },
  actionNames: { "/actions/milking/cow": "奶牛" },
  monsterNames: { "/monsters/rat": "老鼠" },
  abilityNames: { "/abilities/strike": "猛击" },
});

const creditHrid = "/items/green_guild_credit";
runtime.state.initData_itemDetailMap = {
  [creditHrid]: { name: "Green Guild Credit" },
  "/items/milk": {
    name: "Milk",
    guildCreditConversions: [
      { creditItemHrid: creditHrid, itemCount: 10, creditCount: 2 },
    ],
  },
  "/items/cheese": {
    name: "Cheese",
    guildCreditConversions: [
      { creditItemHrid: creditHrid, itemCount: 4, creditCount: 2 },
    ],
  },
  "/items/yogurt": {
    name: "Yogurt",
    guildCreditConversions: [
      { creditItemHrid: creditHrid, itemCount: 5, creditCount: 2 },
    ],
  },
  "/items/flour": {
    name: "Flour",
    guildCreditConversions: [
      { creditItemHrid: creditHrid, itemCount: 5, creditCount: 2 },
    ],
  },
};
Object.assign(runtime.state.itemEnNameToHridMap, {
  "Green Guild Credit": creditHrid,
  Milk: "/items/milk",
  Cheese: "/items/cheese",
  Yogurt: "/items/yogurt",
  Flour: "/items/flour",
});
runtime.state.marketApiJson = {
  timestamp: 1,
  marketData: {
    "/items/milk": { 0: { a: 100, b: 90 } },
    "/items/cheese": { 0: { a: 300, b: 500 } },
    "/items/yogurt": { 0: { a: 300, b: 260 } },
    "/items/flour": { 0: { a: 400, b: 350 } },
  },
};
runtime.api.ensureMarketValueSource = async () => true;

function setOrderBooks() {
  const books = runtime.state.marketOrderBooks;
  for (const key of Object.keys(books)) delete books[key];
  Object.assign(books, {
    "/items/milk": {
      0: {
        asks: [{ price: 100, quantity: 100 }],
        bids: [{ price: 90, quantity: 100 }],
      },
    },
    "/items/cheese": {
      0: {
        asks: [{ price: 300, quantity: 100 }],
        bids: [{ price: 500, quantity: 100 }],
      },
    },
    "/items/yogurt": {
      0: {
        asks: [{ price: 300, quantity: 100 }],
        bids: [{ price: 260, quantity: 100 }],
      },
    },
    "/items/flour": {
      0: {
        asks: [{ price: 400, quantity: 100 }],
        bids: [{ price: 350, quantity: 100 }],
      },
    },
  });
}

function modal() {
  return document.querySelector(MODAL_SELECTOR);
}

const MODAL_SELECTOR = '[class*="GuildPanel_exchangeModalContent"]';

function selectItem(itemHrid, name) {
  const icon = modal().querySelector(".selected-item");
  icon.setAttribute("aria-label", name);
  icon.querySelector("use").setAttribute("href", `/items.svg#${itemHrid}`);
}

function shadowText(host) {
  return host?.shadowRoot?.textContent?.replaceAll(/\s+/g, " ").trim() ?? "";
}

function shadow(host, selector) {
  return host.shadowRoot.querySelector(selector);
}

test("guild exchange context resolves the credit, selected item and batches", () => {
  assert.deepEqual(readGuildExchangeContext(modal()), {
    creditItemHrid: creditHrid,
    selectedItemHrid: "/items/cheese",
    batchCount: 2,
  });
  assert.equal(collectGuildCreditConversions(creditHrid).length, 4);
});

test("guild conversion quotes consume asks and bids with loaded-depth semantics", () => {
  setOrderBooks();
  runtime.state.marketOrderBooks["/items/milk"][0].asks = [
    { price: 90, quantity: 5 },
    { price: 100, quantity: 15 },
  ];
  const milk = collectGuildCreditConversions(creditHrid).find(
    ({ itemHrid }) => itemHrid === "/items/milk",
  );
  const available = evaluateGuildCreditConversion(milk, 3);
  assert.equal(available.batches, 2);
  assert.equal(available.requiredItems, 20);
  assert.equal(available.totalCost, 1_950);
  assert.equal(available.costPerCredit, 487.5);

  runtime.state.marketOrderBooks["/items/milk"][0].asks[1].quantity = 14;
  assert.equal(evaluateGuildCreditConversion(milk, 3).available, false);
  assert.deepEqual(quoteGuildCreditBid("/items/cheese", 8), {
    available: true,
    grossValue: 4_000,
    estimated: false,
  });

  delete runtime.state.marketOrderBooks["/items/flour"];
  assert.deepEqual(quoteGuildCreditAsk("/items/flour", 5), {
    available: true,
    totalCost: 2_000,
    estimated: true,
  });
});

test("sell-and-rebuy consumes bid depth, tax and whole exchange batches", () => {
  setOrderBooks();
  const conversions = collectGuildCreditConversions(creditHrid);
  const selected = conversions.find(
    ({ itemHrid }) => itemHrid === "/items/cheese",
  );
  const best = conversions.find(({ itemHrid }) => itemHrid === "/items/milk");
  const result = evaluateGuildCreditReplacement(selected, 2, best);
  assert.equal(result.status, "ok");
  assert.equal(result.directCredits, 4);
  assert.equal(result.saleQuantity, 8);
  assert.equal(result.netSaleValue, 3_800);
  assert.equal(result.replacement.requiredItems, 30);
  assert.equal(result.replacement.producedCredits, 6);
  assert.equal(result.difference, 2);

  runtime.state.marketOrderBooks["/items/cheese"][0].bids[0].quantity = 7;
  assert.equal(
    evaluateGuildCreditReplacement(selected, 2, best).status,
    "no_sell_quote",
  );
  assert.equal(
    evaluateGuildCreditReplacement(best, 2, best).status,
    "already_optimal",
  );
});

test("advisor is a Shadow DOM external panel with a compact top three", async () => {
  setOrderBooks();
  selectItem("cheese", "Cheese");
  const host = await renderGuildCreditAdvisor();
  assert.ok(host?.shadowRoot);
  assert.equal(host.parentElement, document.body);
  assert.equal(modal().contains(host), false);
  assert.equal(
    shadow(host, ".ranking").querySelectorAll(".rank-row").length,
    3,
  );
  assert.deepEqual(
    [...host.shadowRoot.querySelectorAll(".ranking .name")].map(
      (node) => node.textContent,
    ),
    ["牛奶", "奶酪", "酸奶"],
  );
  assert.equal(
    shadow(host, ".ranking .rank-row:nth-child(2) .tag").textContent,
    "当前",
  );
  assert.equal(host.shadowRoot.querySelector(".meta"), null);
  assert.match(
    host.shadowRoot.querySelector("style").textContent,
    /\.rank-row\{[^}]*min-height:34px/,
  );
  assert.match(
    host.shadowRoot.querySelector("style").textContent,
    /\.price\{display:flex/,
  );
  assert.match(
    host.shadowRoot.querySelector("style").textContent,
    /max-height:min\(38dvh,300px\)/,
  );
  assert.equal(shadow(host, ".current-row"), null);
  assert.match(shadowText(host), /可多兑换 2 点信用/);
  assert.equal(document.querySelectorAll(`#${host.id}`).length, 1);
});

test("advisor respects the configured recommendation count from one through eight", async (t) => {
  setOrderBooks();
  selectItem("cheese", "Cheese");
  const previousGetter = runtime.api.getGuildCreditRecommendationCount;
  t.after(() => {
    if (previousGetter)
      runtime.api.getGuildCreditRecommendationCount = previousGetter;
    else delete runtime.api.getGuildCreditRecommendationCount;
  });

  runtime.api.getGuildCreditRecommendationCount = () => 1;
  let host = await renderGuildCreditAdvisor();
  assert.equal(
    shadow(host, ".ranking").querySelectorAll(".rank-row").length,
    1,
  );

  runtime.api.getGuildCreditRecommendationCount = () => 8;
  host = await renderGuildCreditAdvisor();
  assert.equal(
    shadow(host, ".ranking").querySelectorAll(".rank-row").length,
    4,
  );
});

test("a selected option outside the top three gets a separate current row", async () => {
  setOrderBooks();
  selectItem("flour", "Flour");
  const host = await renderGuildCreditAdvisor();
  assert.deepEqual(
    [...host.shadowRoot.querySelectorAll(".ranking .name")].map(
      (node) => node.textContent,
    ),
    ["牛奶", "奶酪", "酸奶"],
  );
  assert.equal(shadow(host, ".current-row .name").textContent, "面粉");
  assert.equal(shadow(host, ".current-row .tag").textContent, "当前");
});

test("the selected best option is tagged and reported as already optimal", async () => {
  setOrderBooks();
  selectItem("milk", "Milk");
  const host = await renderGuildCreditAdvisor();
  assert.equal(
    shadow(host, ".ranking .rank-row:first-child .tag").textContent,
    "当前",
  );
  assert.match(shadowText(host), /当前方案已是单位信用成本最优/);
});

test("the advisor stays visible without pushing the exchange modal down", async () => {
  setOrderBooks();
  const selector = document.createElement("section");
  selector.className = "ItemSelector_menu__test";
  selector.innerHTML = '<input placeholder="物品搜索">';
  document.body.append(selector);
  const shell = document.querySelector('[class*="Modal_modalContainer"]');
  selector.getBoundingClientRect = () => ({
    left: 40,
    right: 396,
    top: 197,
    bottom: 650,
    width: 356,
    height: 453,
  });
  shell.getBoundingClientRect = () => ({
    left: 67,
    right: 465,
    top: 56,
    bottom: 390,
    width: 398,
    height: 334,
  });
  globalThis.innerWidth = 542;
  globalThis.innerHeight = 650;
  assert.equal(findVisibleItemSelector(), selector);
  const host = await renderGuildCreditAdvisor();
  host.getBoundingClientRect = () => ({ width: 400, height: 340 });
  assert.equal(positionGuildCreditAdvisor(), true);
  assert.equal(host.dataset.placement, "overlay");
  assert.equal(host.style.top, "12px");
  assert.equal(host.style.maxHeight, "247px");
  assert.equal(shell.style.getPropertyValue("translate"), "");
  assert.equal(document.querySelector("#mwitools-guild-credit-advisor"), host);

  selector.hidden = true;
  assert.equal(findVisibleItemSelector(), undefined);
  assert.equal(await renderGuildCreditAdvisor(), host);
  assert.equal(shell.style.getPropertyValue("translate"), "");
  selector.remove();
});

test("advisor placement tries right, left, top and overlay without using bottom", async () => {
  setOrderBooks();
  const host = await renderGuildCreditAdvisor();
  const shell = document.querySelector('[class*="Modal_modalContainer"]');
  host.getBoundingClientRect = () => ({ width: 260, height: 220 });
  shell.getBoundingClientRect = () => ({
    left: 100,
    right: 500,
    top: 80,
    bottom: 420,
    width: 400,
    height: 340,
  });
  globalThis.innerWidth = 1_200;
  globalThis.innerHeight = 800;
  assert.equal(positionGuildCreditAdvisor(), true);
  assert.equal(host.dataset.placement, "right");
  assert.equal(host.style.left, "512px");
  assert.equal(shell.style.getPropertyValue("translate"), "");

  shell.getBoundingClientRect = () => ({
    left: 300,
    right: 700,
    top: 80,
    bottom: 420,
    width: 400,
    height: 340,
  });
  globalThis.innerWidth = 800;
  assert.equal(positionGuildCreditAdvisor(), true);
  assert.equal(host.dataset.placement, "left");
  assert.equal(host.style.left, "28px");

  shell.getBoundingClientRect = () => ({
    left: 100,
    right: 500,
    top: 250,
    bottom: 450,
    width: 400,
    height: 200,
  });
  globalThis.innerHeight = 500;
  globalThis.innerWidth = 600;
  assert.equal(positionGuildCreditAdvisor(), true);
  assert.equal(host.dataset.placement, "top");
  assert.equal(host.style.top, "48px");

  shell.getBoundingClientRect = () => ({
    left: 100,
    right: 500,
    top: 100,
    bottom: 450,
    width: 400,
    height: 350,
  });
  assert.equal(positionGuildCreditAdvisor(), true);
  assert.equal(host.dataset.placement, "top-compressed");
  assert.equal(host.style.top, "12px");
  assert.equal(host.style.maxHeight, "76px");
  assert.equal(shell.style.getPropertyValue("translate"), "");
});

test("a clipped exchange modal only moves upward so its confirmation stays reachable", async () => {
  setOrderBooks();
  const host = await renderGuildCreditAdvisor();
  const shell = document.querySelector('[class*="Modal_modalContainer"]');
  host.getBoundingClientRect = () => ({ width: 360, height: 240 });
  shell.getBoundingClientRect = () => ({
    left: 20,
    right: 380,
    top: 420,
    bottom: 920,
    width: 360,
    height: 500,
  });
  globalThis.innerWidth = 400;
  globalThis.innerHeight = 800;
  assert.equal(positionGuildCreditAdvisor(), true);
  assert.equal(shell.style.getPropertyValue("translate"), "0 -132px");
  assert.equal(host.dataset.placement, "top");
  assert.equal(host.style.maxHeight, "264px");
});

test("main guild shop never receives recommendation summaries", async () => {
  setOrderBooks();
  const rendered = await renderGuildCreditRecommendations();
  assert.deepEqual(rendered.summaries, []);
  assert.ok(rendered.advisor?.shadowRoot);
  assert.equal(
    document.querySelectorAll(".mwi-guild-credit-recommendation").length,
    0,
  );
  assert.equal(document.querySelector("#guild-shop").children.length, 0);
});

test("closing the exchange modal removes the external advisor", async () => {
  const shell = document.querySelector('[class*="Modal_modalContainer"]');
  shell.remove();
  assert.equal(await renderGuildCreditRecommendations(), null);
  document.body.append(shell);
  shell.style.setProperty("translate", "3px 4px");
  await renderGuildCreditAdvisor();
  assert.notEqual(shell.style.getPropertyValue("translate"), "3px 4px");
  shell.remove();
  assert.equal(await renderGuildCreditRecommendations(), null);
  assert.equal(document.querySelector("#mwitools-guild-credit-advisor"), null);
  assert.equal(shell.style.getPropertyValue("translate"), "3px 4px");
  document.body.append(shell);
});
