import assert from "node:assert/strict";
import test, { after } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  {
    url: "https://www.milkywayidle.com/",
    pretendToBeVisual: true,
  },
);
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.window = dom.window;
globalThis.Event = dom.window.Event;
localStorage.setItem("i18nextLng", "en-US");

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/data/translations.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
await import("../src/core/action-projection.js");
await import("../src/core/procurement.js");
await import("../src/features/procurement.js");

// The shopping module follows the game's i18nextLng even if the legacy
// MWITools-wide language flag is forced to Chinese.
runtime.config.isZH = true;

runtime.state.initData_itemDetailMap = {
  "/items/nail": { name: "Nail" },
  "/items/board": { name: "Board" },
};
runtime.state.initData_actionDetailMap = {
  "/actions/crafting/board": {
    hrid: "/actions/crafting/board",
    name: "Board",
    type: "/action_types/crafting",
    inputItems: [{ itemHrid: "/items/nail", count: 2 }],
    outputItems: [{ itemHrid: "/items/board", count: 1 }],
  },
};
runtime.state.initData_characterItems = [];
runtime.api.getTeaBuffsByActionHrid = () => ({ lessResource: 0 });
runtime.api.resolveProductionAction = () => "/actions/crafting/board";
runtime.api.procurement.loadCharacterData("ui-character");

after(async () => {
  await runtime.features.disable("procurementAssistant");
});

test("procurement owns a standalone three-tab shell outside global settings", async () => {
  await runtime.features.handleCharacterData({ characterID: "ui-character" });
  const host = document.querySelector("#mwitools-procurement-host");
  assert.ok(host?.shadowRoot);
  assert.deepEqual(
    [...host.shadowRoot.querySelectorAll(".tab")].map((tab) => tab.dataset.tab),
    ["cart", "plans", "settings"],
  );
  assert.ok(host.shadowRoot.querySelector(".handle svg"));
  assert.equal(host.shadowRoot.querySelector(".handle").textContent.trim(), "");
  assert.equal(
    host.shadowRoot.querySelector(".title").textContent,
    "Shopping Cart",
  );
  host.shadowRoot.querySelector('.tab[data-tab="settings"]').click();
  assert.doesNotMatch(host.shadowRoot.textContent, /[\u3400-\u9fff]/);
  host.shadowRoot.querySelector('.tab[data-tab="cart"]').click();
  assert.equal(
    Object.values(runtime.settings.catalog).some((setting) =>
      setting.id?.toLowerCase().includes("procurement"),
    ),
    false,
  );
});

test("shopping drawer opens only from an explicit cart-handle click", () => {
  const host = document.querySelector("#mwitools-procurement-host");
  const handle = host.shadowRoot.querySelector(".handle");
  const drawer = host.shadowRoot.querySelector(".drawer");

  document.dispatchEvent(
    new dom.window.MouseEvent("pointermove", {
      bubbles: true,
      clientX: window.innerWidth,
    }),
  );
  assert.equal(drawer.dataset.open, "false");

  handle.dispatchEvent(
    new dom.window.MouseEvent("pointerdown", { bubbles: true, clientY: 180 }),
  );
  handle.dispatchEvent(
    new dom.window.MouseEvent("pointerup", { bubbles: true, clientY: 180 }),
  );
  assert.equal(drawer.dataset.open, "true");

  host.shadowRoot.querySelector(".close").click();
  assert.equal(drawer.dataset.open, "false");
});

test("production procurement augments the existing summary instead of creating another card", () => {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="SkillActionDetail_regularComponent__fixture">
      <div class="SkillActionDetail_itemRequirements__fixture">
        <div class="Item_itemContainer__fixture"><svg><use href="#nail"></use></svg></div>
      </div>
      <div class="SkillActionDetail_maxActionCountInput__fixture"><input value="3"></div>
      <div class="SkillActionDetail_actionContainer__fixture"></div>
      <section id="mwi-production-summary"></section>
    </div>`,
  );
  runtime.api.renderProductionProcurement();
  const existingSummary = document.querySelector("#mwi-production-summary");
  assert.ok(existingSummary.querySelector("#mwitools-procurement-production"));
  assert.equal(document.querySelectorAll("#mwi-production-summary").length, 1);
  const badge = document.querySelector(".mwi-procurement-badge");
  const material = document.querySelector('[class*="Item_itemContainer"]');
  assert.ok(badge);
  assert.equal(material.contains(badge), false);
  assert.equal(material.nextElementSibling, badge);
  assert.equal(
    material.parentElement.classList.contains(
      "mwi-procurement-requirement-row",
    ),
    true,
  );
  assert.equal(
    material
      .closest('[class*="SkillActionDetail_regularComponent"]')
      .classList.contains("mwi-procurement-panel"),
    true,
  );
  assert.match(badge.textContent, /^(缺|Need) /);
});

test("sufficient materials keep their remaining quantity", () => {
  runtime.state.initData_characterItems = [
    {
      itemHrid: "/items/nail",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 100,
    },
  ];
  runtime.api.procurement.loadCharacterData("ui-character");
  document.querySelector(
    'div[class*="SkillActionDetail_maxActionCountInput"] input',
  ).value = "3";
  runtime.api.renderProductionProcurement();
  const badge = document.querySelector(".mwi-procurement-badge");
  assert.equal(badge.dataset.state, "ready");
  assert.match(badge.textContent, /^(余|Spare) /);
});

test("a manually opened marketplace does not show the shopping navigation bar", () => {
  runtime.api.procurement.addToCart({
    itemHrid: "/items/nail",
    name: "Nail",
    quantity: 2,
  });
  const panel = document.createElement("section");
  panel.className = "MarketplacePanel_marketplacePanel__fixture";
  panel.getClientRects = () => [{}];
  document.body.append(panel);

  runtime.api.updateProcurementMarketUi();
  assert.equal(
    document.querySelector("#mwitools-procurement-market-nav"),
    null,
  );

  panel.remove();
  runtime.api.procurement.removeFromCart("/items/nail");
});

test("shopping item clicks resolve the game's legacy React root", () => {
  const calls = [];
  const gameRoot = document.createElement("div");
  gameRoot.id = "root";
  gameRoot._reactRootContainer = {
    current: {
      stateNode: null,
      child: {
        stateNode: {
          handleGoToMarketplace(...args) {
            calls.push(args);
          },
        },
      },
    },
  };
  document.body.append(gameRoot);
  assert.equal(runtime.api.openProcurementMarketplace("/items/nail", 2), true);
  assert.deepEqual(calls, [["/items/nail", 2]]);
  gameRoot.remove();
});

test("shopping item clicks prefer and force the game's floating market modal", () => {
  const stateUpdates = [];
  let misleadingCalls = 0;
  const modalHost = {
    state: { navTarget: "marketplace" },
    handleGoToMarketplace() {},
    handleCloseMarketplaceModal() {},
    setState(update, callback) {
      stateUpdates.push(update);
      Object.assign(this.state, update);
      callback?.();
    },
  };
  const gameRoot = document.createElement("div");
  gameRoot.id = "root";
  gameRoot._reactRootContainer = {
    current: {
      stateNode: modalHost,
      child: {
        stateNode: {
          openMarketplace() {
            misleadingCalls += 1;
          },
        },
      },
    },
  };
  document.body.append(gameRoot);

  assert.equal(runtime.api.openProcurementMarketplace("/items/board", 3), true);
  assert.deepEqual(stateUpdates, [
    {
      navTarget: "milking",
      showMarketplaceModal: false,
    },
    {
      showMarketplaceModal: true,
      marketViewOverrideData: {
        itemHrid: "/items/board",
        enhancementLevel: 3,
      },
    },
  ]);
  assert.equal(misleadingCalls, 0);
  gameRoot.remove();
});

test("shopping data is localized from the current game language at render time", () => {
  localStorage.setItem("i18nextLng", "zh-CN");
  runtime.state.initData_itemDetailMap["/items/cotton"] = { name: "Cotton" };
  runtime.state.initData_actionDetailMap["/actions/tailoring/cotton_fabric"] = {
    hrid: "/actions/tailoring/cotton_fabric",
    name: "Cotton Fabric",
    type: "/action_types/tailoring",
    inputItems: [{ itemHrid: "/items/cotton", count: 2 }],
    outputItems: [{ itemHrid: "/items/cotton_fabric", count: 1 }],
  };
  runtime.api.procurement.addToCart({
    itemHrid: "/items/cotton",
    name: "Cotton",
    quantity: 3,
  });
  const plan = runtime.api.procurement.createPlan(
    "/actions/tailoring/cotton_fabric",
    2,
  );

  assert.equal(
    runtime.api.procurement.getCartItem("/items/cotton").name,
    "棉花",
  );
  assert.equal(
    runtime.api.procurement.getPlans().find((entry) => entry.id === plan.id)
      .name,
    "棉花布料",
  );

  runtime.api.renderProcurementShell();
  const host = document.querySelector("#mwitools-procurement-host");
  host.shadowRoot.querySelector('.tab[data-tab="cart"]').click();
  assert.equal(host.shadowRoot.querySelector(".item-name").textContent, "棉花");
  host.shadowRoot.querySelector('.tab[data-tab="plans"]').click();
  assert.equal(
    host.shadowRoot.querySelector(".plan-title").textContent,
    "棉花布料",
  );

  runtime.api.procurement.removePlan(plan.id);
  runtime.api.procurement.removeFromCart("/items/cotton");
  localStorage.setItem("i18nextLng", "en-US");
});

test("market shopping navigation renders item icons instead of name pills", () => {
  runtime.api.procurement.addToCart({
    itemHrid: "/items/cotton",
    name: "Cotton",
    quantity: 12,
  });
  const modal = document.createElement("div");
  modal.className = "MainPanel_marketplaceModal__fixture";
  const panel = document.createElement("section");
  panel.className = "MarketplacePanel_marketplacePanel__fixture";
  panel.innerHTML = `<div class="MarketplacePanel_currentItem__fixture"><svg><use href="/static/media/items_sprite.test.svg#cotton"></use></svg></div>`;
  panel.getClientRects = () => [{}];
  panel.getBoundingClientRect = () => ({
    left: 20,
    right: 420,
    top: 40,
    bottom: 500,
    width: 400,
    height: 460,
  });
  modal.append(panel);
  document.body.append(modal);

  runtime.api.updateProcurementMarketUi();
  const chip = document.querySelector(
    "#mwitools-procurement-market-nav .mwi-procurement-nav-chip",
  );
  assert.ok(chip.querySelector(".mwi-procurement-nav-icon svg use"));
  assert.match(chip.querySelector("svg use").getAttribute("href"), /#cotton$/);
  assert.doesNotMatch(chip.textContent, /Cotton|棉花/);
  assert.match(chip.title, /Cotton/);

  modal.remove();
  const realNow = Date.now;
  Date.now = () => realNow() + 3_000;
  runtime.api.updateProcurementMarketUi();
  Date.now = realNow;
  assert.equal(
    document.querySelector("#mwitools-procurement-market-nav"),
    null,
  );
  runtime.api.procurement.removeFromCart("/items/cotton");
});
