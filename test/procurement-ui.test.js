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

// The shopping module follows the MWITools-wide language flag.
runtime.config.isZH = false;

runtime.state.initData_itemDetailMap = {
  "/items/nail": { name: "Nail" },
  "/items/board": { name: "Board" },
  "/items/astral_enhancer": { name: "Astral Enhancer" },
  "/items/protection_mirror": { name: "Protection Mirror" },
  "/items/coin": { name: "Coin" },
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
  assert.match(host.shadowRoot.textContent, /Expand after adding/);
  host.shadowRoot.querySelector('.tab[data-tab="cart"]').click();
  assert.equal(
    Object.values(runtime.settings.catalog).some((setting) =>
      setting.id?.toLowerCase().includes("procurement"),
    ),
    true,
  );
});

test("the global shopping-cart switch removes and restores every procurement entry", async () => {
  assert.ok(document.querySelector("#mwitools-procurement-host"));
  await runtime.settings.set("procurementAssistant", false);
  assert.equal(document.querySelector("#mwitools-procurement-host"), null);
  assert.equal(
    document.querySelector("#mwitools-procurement-production"),
    null,
  );
  assert.equal(
    document.querySelector("#mwitools-procurement-market-nav"),
    null,
  );
  assert.equal(
    runtime.features.getStatus("procurementAssistant").status,
    "disabled",
  );

  await runtime.settings.set("procurementAssistant", true);
  assert.ok(document.querySelector("#mwitools-procurement-host"));
  assert.equal(
    runtime.features.getStatus("procurementAssistant").status,
    "active",
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

test("optional auto-expand opens the cart only after successful additions", () => {
  const host = document.querySelector("#mwitools-procurement-host");
  const drawer = host.shadowRoot.querySelector(".drawer");
  const close = host.shadowRoot.querySelector(".close");
  runtime.api.procurement.clearCart({ includeStarred: true });

  assert.equal(
    runtime.api.procurement.getSettings().autoExpandOnAddEnabled,
    false,
  );
  runtime.api.procurement.addToCart({
    itemHrid: "/items/nail",
    quantity: 1,
  });
  assert.equal(drawer.dataset.open, "false");
  runtime.api.procurement.removeFromCart("/items/nail");

  runtime.api.procurement.setSetting("autoExpandOnAddEnabled", true);
  runtime.api.procurement.addToCart({
    itemHrid: "/items/coin",
    quantity: 1,
  });
  assert.equal(drawer.dataset.open, "false");

  runtime.api.procurement.addToCart([
    { itemHrid: "/items/nail", quantity: 2 },
    { itemHrid: "/items/board", quantity: 1 },
  ]);
  assert.equal(drawer.dataset.open, "true");
  assert.equal(
    host.shadowRoot.querySelector('.tab[data-tab="cart"]').dataset.active,
    "true",
  );

  close.click();
  runtime.api.procurement.setCartItemQuantity("/items/nail", 3);
  assert.equal(drawer.dataset.open, "false");
  runtime.api.procurement.removeFromCart("/items/nail");
  assert.equal(drawer.dataset.open, "false");

  runtime.api.procurement.removeFromCart("/items/board");
  runtime.api.procurement.setSetting("autoExpandOnAddEnabled", false);
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

test("enhancing procurement uses the visible panel, live count, and net shortages", async () => {
  const productionPanel = document.querySelector(
    '[class*="SkillActionDetail_regularComponent"]',
  );
  productionPanel.hidden = true;
  runtime.api.procurement.clearCart({ includeStarred: true });
  runtime.state.initData_characterItems = [
    {
      itemHrid: "/items/protection_mirror",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 3,
    },
    {
      itemHrid: "/items/coin",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 1_000,
    },
  ];
  runtime.api.procurement.loadCharacterData("ui-character");
  runtime.state.initData_actionDetailMap["/actions/crafting/reserve"] = {
    hrid: "/actions/crafting/reserve",
    name: "Reserve fixture",
    inputItems: [],
    outputItems: [],
  };
  const reservePlan = runtime.api.procurement.createPlan(
    "/actions/crafting/reserve",
    1,
    [
      {
        itemHrid: "/items/protection_mirror",
        enhancementLevel: 0,
        suggested: 1,
        purchasable: true,
      },
    ],
  );
  runtime.api.procurement.addToCart({
    itemHrid: "/items/protection_mirror",
    name: "Protection Mirror",
    quantity: 1,
    source: "manual",
  });

  const wrapper = document.createElement("section");
  wrapper.className = "EnhancingPanel_panel__fixture";
  wrapper.innerHTML = `
    <div class="SkillActionDetail_skillActionDetail__fixture">
      <div class="SkillActionDetail_itemRequirements__fixture">
        <div class="Item_itemContainer__fixture"><svg><use href="/static/items.svg#protection_mirror"></use></svg></div>
        <div class="Item_itemContainer__fixture"><svg><use href="/static/items.svg#astral_enhancer"></use></svg></div>
        <div class="Item_itemContainer__fixture"><svg><use href="/static/items.svg#coin"></use></svg></div>
        <span class="SkillActionDetail_inputCount__fixture">3 / 2</span>
        <span class="SkillActionDetail_inputCount__fixture">0 / 1</span>
        <span class="SkillActionDetail_inputCount__fixture">1000 / 100</span>
      </div>
      <div class="SkillActionDetail_maxActionCountInput__fixture"><input value="3"></div>
      <div class="SkillActionDetail_actionContainer__fixture"></div>
    </div>`;
  const panel = wrapper.firstElementChild;
  Object.defineProperty(panel, "__reactFiber$fixture", {
    value: {
      memoizedProps: {
        actionDetail: {
          hrid: "/actions/enhancing/enhance",
          function: "/action_functions/enhancing",
        },
      },
    },
  });
  document.body.append(wrapper);

  runtime.api.renderProductionProcurement();
  let summary = panel.querySelector("#mwitools-procurement-production");
  assert.ok(summary, "the summary must be mounted on the visible panel");
  assert.equal(
    productionPanel.querySelector("#mwitools-procurement-production"),
    null,
  );
  assert.match(summary.textContent, /Missing 2 materials/);

  summary.querySelector("button").click();
  await Promise.resolve();
  assert.equal(
    runtime.api.procurement.getCartItem("/items/protection_mirror").quantity,
    4,
    "6 required - (3 owned - 1 locked) - 1 already listed = 3 newly added",
  );
  assert.equal(
    runtime.api.procurement.getCartItem("/items/protection_mirror").source,
    "enhancing",
  );
  assert.equal(
    runtime.api.procurement.getCartItem("/items/astral_enhancer").quantity,
    3,
  );
  assert.equal(runtime.api.procurement.getCartItem("/items/coin"), null);

  summary = panel.querySelector("#mwitools-procurement-production");
  assert.equal(summary.querySelector("button").disabled, true);
  assert.match(summary.querySelector("button").textContent, /Already listed/);
  summary.querySelector("button").click();
  assert.equal(
    runtime.api.procurement.getCartItem("/items/protection_mirror").quantity,
    4,
  );

  summary.remove();
  runtime.api.renderProductionProcurement();
  assert.ok(
    panel.querySelector("#mwitools-procurement-production"),
    "the enhancement summary must be restored after a panel redraw",
  );

  runtime.config.isZH = true;
  runtime.api.renderProductionProcurement();
  assert.match(
    panel.querySelector("#mwitools-procurement-production").textContent,
    /已在清单中/,
  );
  runtime.config.isZH = false;

  panel.querySelector('[class*="SkillActionDetail_inputCount"]').remove();
  runtime.api.renderProductionProcurement();
  assert.equal(panel.querySelector("#mwitools-procurement-production"), null);

  wrapper.remove();
  productionPanel.hidden = false;
  runtime.api.procurement.removePlan(reservePlan.id);
  runtime.api.procurement.clearCart({ includeStarred: true });
});

test("house materials use DOM requirements and add only net shortages", async () => {
  document
    .querySelector('[class*="SkillActionDetail_regularComponent"]')
    ?.remove();
  runtime.api.procurement.removeFromCart("/items/board");
  runtime.state.initData_characterItems = [
    {
      itemHrid: "/items/board",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 3,
    },
  ];
  runtime.api.procurement.loadCharacterData("ui-character");
  runtime.state.initData_actionDetailMap["/actions/crafting/house_lock"] = {
    hrid: "/actions/crafting/house_lock",
    name: "House lock fixture",
    inputItems: [],
    outputItems: [],
  };
  const lockPlan = runtime.api.procurement.createPlan(
    "/actions/crafting/house_lock",
    1,
    [
      {
        itemHrid: "/items/board",
        enhancementLevel: 0,
        suggested: 2,
        purchasable: true,
      },
    ],
  );

  const createHouse = () => {
    const modal = document.createElement("section");
    modal.className = "HousePanel_modalContent__fixture";
    modal.innerHTML = `
      <div class="HousePanel_itemRequirements__fixture">
        <div class="Item_itemContainer__fixture"><svg><use href="/static/items.svg#board"></use></svg></div>
        <div class="Item_itemContainer__fixture"><svg><use href="/static/items.svg#coin"></use></svg></div>
        <span class="HousePanel_inventoryCount__fixture">3</span>
        <span class="HousePanel_inventoryCount__fixture">999</span>
        <span class="HousePanel_inputCount__fixture">10</span>
        <span class="HousePanel_inputCount__fixture">500</span>
      </div>
      <button class="HousePanel_upgradeButton__fixture">Upgrade</button>`;
    modal.getClientRects = () => [{}];
    document.body.append(modal);
    return modal;
  };

  let modal = createHouse();
  runtime.api.renderProductionProcurement();
  let summary = modal.querySelector("#mwitools-procurement-production");
  assert.match(summary.textContent, /Missing 1 material/);
  assert.equal(summary.querySelector("button").disabled, false);
  assert.equal(
    summary.nextElementSibling.matches('[class*="HousePanel_upgradeButton"]'),
    true,
  );

  summary.querySelector("button").click();
  await Promise.resolve();
  assert.equal(runtime.api.procurement.getCartItem("/items/board").quantity, 9);
  assert.equal(
    runtime.api.procurement.getCartItem("/items/board").source,
    "housing",
  );
  assert.equal(runtime.api.procurement.getCartItem("/items/coin"), null);
  summary = modal.querySelector("#mwitools-procurement-production");
  assert.equal(summary.querySelector("button").disabled, true);
  assert.match(summary.querySelector("button").textContent, /Already listed/);
  runtime.api.renderProductionProcurement();
  assert.equal(
    modal.querySelectorAll("#mwitools-procurement-production").length,
    1,
  );

  modal.remove();
  modal = createHouse();
  runtime.api.renderProductionProcurement();
  assert.ok(modal.querySelector("#mwitools-procurement-production"));

  runtime.config.isZH = true;
  runtime.api.renderProductionProcurement();
  assert.match(
    modal.querySelector("#mwitools-procurement-production").textContent,
    /房屋升级缺少 1 种材料/,
  );
  runtime.config.isZH = false;

  runtime.api.procurement.removePlan(lockPlan.id);
  runtime.api.procurement.removeFromCart("/items/board");
  runtime.state.initData_characterItems = [
    {
      itemHrid: "/items/board",
      itemLocationHrid: "/item_locations/inventory",
      enhancementLevel: 0,
      count: 10,
    },
  ];
  runtime.api.procurement.loadCharacterData("ui-character");
  runtime.api.renderProductionProcurement();
  summary = modal.querySelector("#mwitools-procurement-production");
  assert.match(summary.textContent, /House materials ready/);
  assert.equal(summary.querySelector("button").disabled, true);
  modal.remove();
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

test("shopping data follows the MWITools language at render time", () => {
  localStorage.setItem("i18nextLng", "en-US");
  runtime.config.isZH = true;
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
  runtime.config.isZH = false;
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

test("iron-cow adaptation keeps shortages while suppressing market shopping UI", async () => {
  runtime.api.procurement.clearCart({ includeStarred: true });
  runtime.api.procurement.addToCart({
    itemHrid: "/items/board",
    name: "Board",
    quantity: 4,
  });
  runtime.state.currentCharacterGameMode = "ironcow";
  await runtime.settings.set("adaptIronCowMarketFeatures", true);
  runtime.api.renderProcurementShell();

  const host = document.querySelector("#mwitools-procurement-host");
  host.shadowRoot.querySelector('.tab[data-tab="cart"]').click();
  assert.match(
    host.shadowRoot.querySelector(".item-name").textContent,
    /Board/,
  );
  assert.equal(host.shadowRoot.querySelector(".price"), null);
  assert.equal(host.shadowRoot.querySelector(".footer-total"), null);
  assert.equal(host.shadowRoot.querySelector(".item-name").disabled, true);
  assert.equal(
    runtime.api.openProcurementMarketplace("/items/board", 0),
    false,
  );

  runtime.state.currentCharacterGameMode = "standard";
  await runtime.settings.set("adaptIronCowMarketFeatures", false);
  runtime.api.procurement.clearCart({ includeStarred: true });
});

test("upgrade chains can start from the direct predecessor without expanding it", () => {
  const panel = document.createElement("div");
  panel.className = "SkillActionDetail_regularComponent__chain-fixture";
  panel.innerHTML = `
    <div class="SkillActionDetail_maxActionCountInput__fixture"><input value="2"></div>
    <div class="SkillActionDetail_actionContainer__fixture"></div>
    <section id="mwi-production-summary"></section>`;
  document.body.append(panel);
  const previousResolver = runtime.api.resolveProductionAction;
  const previousCreatePlans =
    runtime.api.procurement.getSettings().createPlansByDefault;
  runtime.api.procurement.clearCart({ includeStarred: true });
  runtime.api.procurement.setSetting("createPlansByDefault", false);
  Object.assign(runtime.state.initData_itemDetailMap, {
    "/items/shadow_pants": { name: "Shadow Pants" },
    "/items/beast_pants": { name: "Beast Pants" },
    "/items/shadow_leather": { name: "Shadow Leather" },
    "/items/beast_leather": { name: "Beast Leather" },
  });
  Object.assign(runtime.state.initData_actionDetailMap, {
    "/actions/tailoring/shadow_pants": {
      hrid: "/actions/tailoring/shadow_pants",
      name: "Shadow Pants",
      type: "/action_types/tailoring",
      upgradeItemHrid: "/items/beast_pants",
      inputItems: [
        { itemHrid: "/items/beast_pants", count: 1 },
        { itemHrid: "/items/shadow_leather", count: 2 },
      ],
      outputItems: [{ itemHrid: "/items/shadow_pants", count: 1 }],
    },
    "/actions/tailoring/beast_pants": {
      hrid: "/actions/tailoring/beast_pants",
      name: "Beast Pants",
      type: "/action_types/tailoring",
      inputItems: [{ itemHrid: "/items/beast_leather", count: 3 }],
      outputItems: [{ itemHrid: "/items/beast_pants", count: 1 }],
    },
  });
  runtime.api.resolveProductionAction = () => "/actions/tailoring/shadow_pants";
  panel.querySelector('input[type="text"],input').value = "2";

  runtime.api.renderProductionProcurement();
  const root = document.querySelector("#mwitools-procurement-production");
  const previousButton = root.querySelectorAll(
    ".mwi-procurement-chain-preset",
  )[1];
  const allButton = root.querySelector(".mwi-procurement-chain-preset");
  const checkedState = () =>
    [...root.querySelectorAll(".mwi-procurement-chain-stage input")].map(
      (input) => input.checked,
    );
  assert.deepEqual(checkedState(), [true, true]);
  previousButton.click();
  assert.deepEqual(checkedState(), [true, false]);
  assert.equal(previousButton.getAttribute("aria-pressed"), "true");
  allButton.click();
  assert.deepEqual(checkedState(), [true, true]);
  previousButton.click();
  root.querySelector(".mwi-procurement-inline-button").click();

  const itemHrids = runtime.api.procurement
    .getCartItems()
    .map((item) => item.itemHrid);
  assert.equal(itemHrids.includes("/items/beast_pants"), true);
  assert.equal(itemHrids.includes("/items/shadow_leather"), true);
  assert.equal(itemHrids.includes("/items/beast_leather"), false);

  runtime.api.resolveProductionAction = previousResolver;
  runtime.api.procurement.setSetting(
    "createPlansByDefault",
    previousCreatePlans,
  );
  runtime.api.procurement.clearCart({ includeStarred: true });
  runtime.api.renderProductionProcurement();
  panel.remove();
});
