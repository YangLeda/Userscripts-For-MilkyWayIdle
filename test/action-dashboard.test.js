import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<!doctype html><html><head></head><body>
    <svg aria-hidden="true"><use href="/assets/items_sprite.test.svg#coin"></use></svg>
    <div class="Header_actionInfo__test">
      <div class="Header_myActions__test">
        <div class="Header_currentAction__test">
          <div class="Header_actionName__test"><span>木板</span></div>
          <div class="ProgressBar_progressBar__test" style="--duration:10">
            <div class="ProgressBar_innerBar__test ProgressBar_active__test" style="transform:matrix(0.7, 0, 0, 1, 0, 0)"></div>
            <div class="ProgressBar_text__test">10.00s</div>
          </div>
        </div>
      </div>
      <div class="Header_communityBuffs__test"></div>
    </div>
    <div class="Modal_modalContainer__test">
      <div class="SkillActionDetail_regularComponent__test">
        <div class="SkillActionDetail_name__test">木板</div>
        <div class="SkillActionDetail_actionContainer__test">
          <div class="SkillActionDetail_maxActionCountInput__test">
            <div><input value="5"></div>
          </div>
          <button type="button" class="SkillActionDetail_infiniteButton__test">∞</button>
        </div>
      </div>
    </div>
  </body></html>`,
  { url: "https://test.milkywayidle.com/" },
);
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.window = dom.window;
localStorage.setItem("i18nextLng", "zh-CN");

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/core/game-data.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
await import("../src/core/action-projection.js");
await import("../src/core/message-state.js");
await import("../src/features/action-dashboard.js");
await import("../src/features/settings-and-notifications.js");
const { registerGameLocaleResources } =
  await import("../src/core/game-localization.js");
const { resetGameSpriteSources, scanGameSpriteSources } =
  await import("../src/core/game-assets.js");

const zhGameResources = {
  itemNames: {
    "/items/log": "原木",
    "/items/lumber": "木板",
    "/items/milk": "牛奶",
    "/items/cheese": "奶酪",
    "/items/apple": "苹果",
    "/items/orange": "橙子",
    "/items/plum": "李子",
  },
  actionNames: {
    "/actions/crafting/lumber": "木板",
    "/actions/milking/cow": "奶牛",
    "/actions/foraging/mixed": "混合果园",
    "/actions/combat/hell_pit": "地狱深渊",
    "/actions/combat/chimerical_den": "奇幻洞穴",
  },
  monsterNames: { "/monsters/rat": "老鼠" },
  abilityNames: { "/abilities/strike": "猛击" },
};
registerGameLocaleResources("zh", zhGameResources);

runtime.state.initData_actionDetailMap = {
  "/actions/crafting/lumber": {
    hrid: "/actions/crafting/lumber",
    name: "Lumber",
    type: "/action_types/crafting",
    baseTimeCost: 6_000_000_000,
    inputItems: [{ itemHrid: "/items/log", count: 2 }],
    outputItems: [{ itemHrid: "/items/lumber", count: 1 }],
  },
};
runtime.state.initData_itemDetailMap = {
  "/items/log": { hrid: "/items/log", name: "Log" },
  "/items/lumber": { hrid: "/items/lumber", name: "Lumber" },
};
registerGameLocaleResources("es", {
  itemNames: { "/items/lumber": "Madera" },
  actionNames: { "/actions/crafting/lumber": "Madera" },
  monsterNames: { "/monsters/rat": "Rata" },
  abilityNames: { "/abilities/strike": "Golpe" },
});
runtime.state.initData_characterItems = [
  {
    itemHrid: "/items/log",
    itemLocationHrid: "/item_locations/inventory",
    count: 20,
  },
  {
    itemHrid: "/items/lumber",
    itemLocationHrid: "/item_locations/inventory",
    count: 3,
  },
];
runtime.state.initData_characterSkills = [];
runtime.state.initData_actionTypeDrinkSlotsMap = {};
runtime.state.currentEquipmentMap = {};
runtime.state.actionTypeBuffSources = {};
runtime.api.getOriTextFromElement = (element) => element?.textContent ?? "";
runtime.api.getToolsSpeedBuffByActionHrid = () => 0;
runtime.api.getTotalEffiPercentage = () => 0;
runtime.api.getTeaBuffsByActionHrid = () => ({});
runtime.api.getAskPrice = (itemHrid) => (itemHrid === "/items/log" ? 10 : 0);
runtime.api.getNetSellPrice = (itemHrid) =>
  itemHrid === "/items/lumber" ? 100 : 0;
runtime.api.getBidPrice = (itemHrid) => (itemHrid === "/items/log" ? 8 : 0);
runtime.api.getNetSellPriceAtAsk = (itemHrid) =>
  itemHrid === "/items/lumber" ? 114 : 0;
runtime.api.getFairValue = (itemHrid) => {
  const ask = runtime.api.getAskPrice(itemHrid);
  if (ask > 0) return ask;
  const netSell = runtime.api.getNetSellPrice(itemHrid);
  return netSell > 0 ? netSell / 0.95 : 0;
};

test("production duration accepts either decimal separator and mixed grouping", () => {
  assert.equal(runtime.api.parseProductionDurationSeconds("13.68s"), 13.68);
  assert.equal(runtime.api.parseProductionDurationSeconds("13,68s"), 13.68);
  assert.equal(
    runtime.api.parseProductionDurationSeconds("1.234,56 s"),
    1234.56,
  );
  assert.equal(
    runtime.api.parseProductionDurationSeconds("1,234.56 s"),
    1234.56,
  );
  assert.equal(
    runtime.api.parseProductionDurationSeconds("1\u202f234,5s"),
    1234.5,
  );
});

test("production quick presets deduplicate valid values and fall back as a group", () => {
  assert.deepEqual(
    runtime.api.parseProductionQuickPresets("0.5, 1 2,2 bad"),
    [0.5, 1, 2],
  );
  assert.deepEqual(
    runtime.api.parseProductionQuickPresets("10, 20.5, 10 nope", {
      integer: true,
      fallback: [100],
    }),
    [10],
  );
  assert.deepEqual(
    runtime.api.parseProductionQuickPresets("bad, -1", { fallback: [1, 2] }),
    [1, 2],
  );
});

test("Chinese crafting dialogs keep the market-value profit", () => {
  const nativeDrop = document.createElement("div");
  nativeDrop.className = "SkillActionDetail_dropTable__native";
  nativeDrop.innerHTML = `<div class="Item_itemContainer__native"><div><div class="Item_item__native Item_clickable__native Item_inline__native"><div class="Item_iconContainer__native"><svg aria-label="木板"><use href="/assets/items_sprite.test.svg#lumber"></use></svg></div><div class="Item_name__native">木板</div></div></div></div>`;
  document
    .querySelector('div[class*="SkillActionDetail_regularComponent"]')
    .append(nativeDrop);
  runtime.api.renderProductionPanel();

  const card = document.querySelector("#mwi-production-summary");
  const controls = document.querySelector(
    'div[class*="SkillActionDetail_actionContainer"]',
  );
  assert.ok(card);
  assert.equal(
    controls.nextElementSibling.classList.contains("mwi-production-extensions"),
    true,
  );
  assert.equal(
    card.closest(".mwi-production-extensions"),
    controls.nextElementSibling,
  );
  assert.match(card.textContent, /本次生产摘要/);
  assert.match(
    document.querySelector("#mwitools-action-dashboard-style").textContent,
    /grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,110px\),1fr\)\)/,
  );
  assert.match(
    document.querySelector("#mwitools-action-dashboard-style").textContent,
    /@media\(max-width:520px\).*mwi-production-metrics,.mwi-production-output-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
  );
  const output = card.querySelector(".mwi-production-output-item");
  assert.ok(output);
  assert.match(
    card.querySelector(".mwi-production-output-metric").textContent,
    /木板/,
  );
  const nativeItem = output.querySelector(".mwi-production-native-item");
  assert.equal(
    nativeItem.querySelector('[class*="Item_name"]').textContent,
    "木板",
  );
  assert.equal(
    [...nativeItem.classList].some((className) =>
      className.includes("Item_clickable"),
    ),
    false,
  );
  assert.match(output.title, /木板 ×5/);
  assert.equal(
    output.querySelector("use").getAttribute("href"),
    "/assets/items_sprite.test.svg#lumber",
  );
  assert.match(
    output.querySelector(".mwi-production-output-count").textContent,
    /×5/,
  );
  assert.match(card.textContent, /库存最多可做10/);
  assert.doesNotMatch(card.textContent, /本次总耗时|Duration/);
  assert.match(
    document.querySelector(".mwi-production-duration-inline").textContent,
    /耗时 30s/,
  );
  assert.match(card.textContent, /本次总净利润400/);

  runtime.api.renderProductionPanel();
  assert.match(card.textContent, /本次总净利润400/);
  assert.doesNotMatch(card.textContent, /~/);

  const extension = document.createElement("section");
  extension.dataset.mwitoolsProductionExtension = "true";
  extension.textContent = "shopping materials";
  runtime.api.mountProductionModule(
    card.closest("[class*=SkillActionDetail]") ?? card.parentElement,
    extension,
    "shortage",
  );
  document.querySelector(
    'div[class*="SkillActionDetail_maxActionCountInput"] input',
  ).value = "15000";
  runtime.api.renderProductionPanel();
  assert.match(
    card.querySelector(".mwi-production-output-item").title,
    /木板 ×15,000/,
  );
  assert.match(card.textContent, /库存最多可做10/);
  assert.match(
    document.querySelector(".mwi-production-duration-inline").textContent,
    /耗时 1天1小时/,
  );
  assert.equal(
    card.parentElement.querySelector(
      '[data-mwitools-production-extension="true"]:not(.mwi-production-extensions)',
    ),
    extension,
    "production refreshes must preserve extension DOM without collapsing it",
  );
  document.querySelector(
    'div[class*="SkillActionDetail_maxActionCountInput"] input',
  ).value = "5";
  nativeDrop.remove();
});

test("production outputs use a neutral fallback when the item sprite is unavailable", () => {
  const spriteHost = document
    .querySelector('use[href*="items_sprite"]')
    .closest("svg");
  spriteHost.remove();
  resetGameSpriteSources();
  document.querySelector("#mwi-production-summary").remove();
  runtime.api.renderProductionPanel();
  const output = document.querySelector(".mwi-production-output-item");
  assert.equal(
    output.querySelector(".mwi-production-output-fallback")?.textContent,
    "?",
  );
  assert.equal(output.textContent.includes("木板"), true);
  document.body.prepend(spriteHost);
  resetGameSpriteSources();
  scanGameSpriteSources({ force: true });
  runtime.api.renderProductionPanel();
});

test("iron-cow adaptation keeps production timing but removes market profit", () => {
  runtime.settings.settingsMap.adaptIronCowMarketFeatures.isTrue = true;
  runtime.state.currentCharacterGameMode = "ironcow";
  runtime.api.renderProductionPanel();

  const card = document.querySelector("#mwi-production-summary");
  assert.match(
    document.querySelector(".mwi-production-duration-inline").textContent,
    /耗时/,
  );
  assert.doesNotMatch(card.textContent, /净利润|市场价格缺失/);

  runtime.state.currentCharacterGameMode = "standard";
  runtime.settings.settingsMap.adaptIronCowMarketFeatures.isTrue = false;
  runtime.api.renderProductionPanel();
});

test("infinite production summaries use inventory capacity and expose a native-style max button", () => {
  const input = document.querySelector(
    'div[class*="SkillActionDetail_maxActionCountInput"] input',
  );
  input.value = "∞";
  runtime.api.renderProductionPanel();

  const card = document.querySelector("#mwi-production-summary");
  const maxButton = document.querySelector(".mwi-max-action-button");
  const infinityButton = document.querySelector(
    'button[class*="SkillActionDetail_infiniteButton"]',
  );
  assert.match(card.textContent, /预期总产出.*木板.*×10/s);
  assert.match(
    document.querySelector(".mwi-production-duration-inline").textContent,
    /耗时 60s/,
  );
  assert.match(card.textContent, /本次总净利润800/);
  assert.ok(maxButton);
  assert.equal(maxButton.textContent, "最大");
  assert.equal(maxButton.classList.contains(infinityButton.classList[0]), true);
  maxButton.click();
  assert.equal(input.value, "10");

  const logItem = runtime.state.initData_characterItems.find(
    ({ itemHrid }) => itemHrid === "/items/log",
  );
  logItem.count = 0;
  input.value = "∞";
  runtime.api.renderProductionPanel();
  assert.match(card.textContent, /预期总产出.*木板.*×0/s);
  assert.match(
    document.querySelector(".mwi-production-duration-inline").textContent,
    /耗时 0s/,
  );
  assert.match(card.textContent, /本次总净利润0/);
  assert.equal(maxButton.disabled, true);
  logItem.count = 20;
  input.value = "5";
});

test("disabled production summaries cannot be recreated by direct or quick-count renders", () => {
  const input = document.querySelector(
    'div[class*="SkillActionDetail_maxActionCountInput"] input',
  );
  input.value = "∞";
  runtime.settings.settingsMap.productionSummary.isTrue = true;
  runtime.api.renderProductionPanel();
  assert.ok(document.querySelector("#mwi-production-summary"));
  assert.ok(document.querySelector(".mwi-max-action-button"));

  runtime.settings.settingsMap.productionSummary.isTrue = false;
  runtime.api.renderProductionPanel();
  assert.equal(document.querySelector("#mwi-production-summary"), null);
  assert.equal(document.querySelector(".mwi-max-action-button"), null);

  runtime.api.renderProductionQuickInputs();
  document
    .querySelector('#quickInputCountButtons [data-quick-value="10"]')
    .click();
  assert.equal(document.querySelector("#mwi-production-summary"), null);
  assert.equal(document.querySelector(".mwi-max-action-button"), null);

  runtime.settings.settingsMap.productionSummary.isTrue = true;
  runtime.api.renderProductionPanel();
  assert.ok(document.querySelector("#mwi-production-summary"));
});

test("production summary modes collapse, preserve expansion, expand, and turn off", async () => {
  const input = document.querySelector(
    'div[class*="SkillActionDetail_maxActionCountInput"] input',
  );
  input.value = "5";
  await runtime.settings.setPreference("productionSummaryMode", "collapsed", {
    persist: false,
  });
  runtime.settings.settingsMap.productionSummary.isTrue = true;
  runtime.api.renderProductionPanel();
  let card = document.querySelector("#mwi-production-summary");
  assert.equal(card.dataset.expanded, "false");
  assert.equal(card.querySelector(".mwi-production-card-body").hidden, true);
  card.querySelector(".mwi-production-card-title").click();
  assert.equal(card.dataset.expanded, "true");
  input.value = "10";
  runtime.api.renderProductionPanel();
  assert.equal(card.dataset.expanded, "true");

  await runtime.settings.setPreference("productionSummaryMode", "expanded", {
    persist: false,
  });
  runtime.api.renderProductionPanel();
  card = document.querySelector("#mwi-production-summary");
  assert.equal(card.dataset.expanded, "true");
  assert.equal(card.querySelector(".mwi-production-card-body").hidden, false);

  await runtime.settings.setPreference("productionSummaryMode", "off", {
    persist: false,
  });
  runtime.settings.settingsMap.productionSummary.isTrue = false;
  runtime.api.renderProductionPanel();
  assert.equal(document.querySelector("#mwi-production-summary"), null);

  await runtime.settings.setPreference("productionSummaryMode", "collapsed", {
    persist: false,
  });
  runtime.settings.settingsMap.productionSummary.isTrue = true;
  input.value = "5";
  runtime.api.renderProductionPanel();
});

test("replacing a loadout panel restores one stable set of production modules", () => {
  const oldPanel = document.querySelector(
    'div[class*="SkillActionDetail_regularComponent"]',
  );
  runtime.api.renderProductionQuickInputs();
  runtime.api.renderProductionPanel();
  oldPanel.hidden = true;
  const panel = document.createElement("div");
  panel.className = "SkillActionDetail_regularComponent__replacement";
  panel.innerHTML = `
    <div class="SkillActionDetail_name__test">木板</div>
    <div class="SkillActionDetail_actionContainer__test">
      <div class="SkillActionDetail_maxActionCountInput__test"><input value=""></div>
      <button class="SkillActionDetail_infiniteButton__test">∞</button>
    </div>`;
  oldPanel.parentElement.append(panel);

  runtime.api.renderProductionQuickInputs();
  runtime.api.renderProductionPanel();
  const context = runtime.api.resolveActiveProductionPanelContext();
  assert.equal(context.panel, panel);
  assert.equal(context.count, null);
  assert.equal(panel.querySelectorAll(".mwi-production-extensions").length, 1);
  assert.equal(
    panel.querySelectorAll(".mwi-production-quick-inputs").length,
    1,
  );
  assert.equal(panel.querySelectorAll("#mwi-production-summary").length, 1);
  assert.equal(oldPanel.querySelector("#mwi-production-summary"), null);
  assert.equal(oldPanel.querySelector(".mwi-production-quick-inputs"), null);
  const mount = panel.querySelector(".mwi-production-extensions");
  const styles = document.querySelector(
    "#mwitools-action-dashboard-style",
  ).textContent;
  assert.match(
    styles,
    /\.mwi-production-extensions \{ display:contents!important; \}/,
    "the logical mount must not become a stretchable layout box",
  );
  assert.match(
    styles,
    /\.mwi-production-extensions > \* \{ flex:0 0 auto!important;[^}]*height:auto!important; \}/,
    "production modules must keep intrinsic height across repeated renders",
  );
  assert.equal(dom.window.getComputedStyle(mount).display, "contents");

  panel.remove();
  oldPanel.hidden = false;
  runtime.api.renderProductionQuickInputs();
  runtime.api.renderProductionPanel();
});

test("opening a loadout dropdown restores production modules behind MUI aria hiding", () => {
  const panel = document.querySelector(
    'div[class*="SkillActionDetail_regularComponent"]',
  );
  const modal = panel.closest('[class*="Modal_modalContainer"]');
  runtime.api.renderProductionQuickInputs();
  runtime.api.renderProductionPanel();
  assert.equal(panel.querySelectorAll("#mwi-production-summary").length, 1);

  modal.setAttribute("aria-hidden", "true");
  panel.querySelector(":scope > .mwi-production-extensions").remove();
  const dropdown = document.createElement("div");
  dropdown.setAttribute("role", "listbox");
  dropdown.textContent = "Loadout";
  document.body.append(dropdown);

  runtime.api.renderProductionQuickInputs();
  runtime.api.renderProductionPanel();

  assert.equal(runtime.api.resolveActiveProductionPanelContext().panel, panel);
  assert.equal(panel.querySelectorAll(".mwi-production-extensions").length, 1);
  assert.equal(
    panel.querySelectorAll(".mwi-production-quick-inputs").length,
    1,
  );
  assert.equal(panel.querySelectorAll("#mwi-production-summary").length, 1);

  dropdown.remove();
  modal.removeAttribute("aria-hidden");
});

test("production durations over one day use whole days, hours, and minutes", () => {
  const input = document.querySelector(
    'div[class*="SkillActionDetail_maxActionCountInput"] input',
  );
  const logItem = runtime.state.initData_characterItems.find(
    ({ itemHrid }) => itemHrid === "/items/log",
  );
  logItem.count = 50_000;
  input.value = "20000";
  runtime.api.renderProductionPanel();
  assert.match(
    document.querySelector(".mwi-production-duration-inline").textContent,
    /耗时 1天9小时20分/,
  );
  assert.doesNotMatch(
    document.querySelector(".mwi-production-duration-inline").textContent,
    /1\.4天/,
  );
  logItem.count = 20;
  input.value = "5";
});

test("gathering dialogs without a count input still render expected outputs", () => {
  const originalPanel = document.querySelector(
    'div[class*="SkillActionDetail_regularComponent"]',
  );
  const modal = originalPanel.closest('div[class*="Modal_modalContainer"]');
  const hiddenOldPanel = document.createElement("div");
  hiddenOldPanel.style.display = "none";
  hiddenOldPanel.append(originalPanel);
  modal.append(hiddenOldPanel);
  const panel = document.createElement("div");
  panel.className = "SkillActionDetail_skillActionDetail__gathering";
  panel.innerHTML = `
    <div class="SkillActionDetail_name__test">奶牛</div>
    <div class="SkillActionDetail_actionContainer__test"></div>
  `;
  modal.append(panel);
  runtime.state.initData_actionDetailMap["/actions/milking/cow"] = {
    hrid: "/actions/milking/cow",
    name: "Cow",
    type: "/action_types/milking",
    baseTimeCost: 10_000_000_000,
    dropTable: [
      { itemHrid: "/items/milk", dropRate: 1, minCount: 1, maxCount: 3 },
    ],
  };
  runtime.state.initData_itemDetailMap["/items/milk"] = {
    hrid: "/items/milk",
    name: "Milk",
  };
  runtime.state.initData_itemDetailMap["/items/cheese"] = {
    hrid: "/items/cheese",
    name: "Cheese",
  };
  runtime.state.initData_itemDetailMap["/items/processing_tea"] = {
    hrid: "/items/processing_tea",
    name: "Processing Tea",
    consumableDetail: {
      buffs: [{ typeHrid: "/buff_types/processing", flatBoost: 0.15 }],
    },
  };
  runtime.state.initData_actionDetailMap["/actions/cheesesmithing/cheese"] = {
    hrid: "/actions/cheesesmithing/cheese",
    type: "/action_types/cheesesmithing",
    inputItems: [{ itemHrid: "/items/milk", count: 2 }],
    outputItems: [{ itemHrid: "/items/cheese", count: 1 }],
  };
  zhGameResources.actionNames["/actions/milking/cow"] = "奶牛";
  zhGameResources.itemNames["/items/milk"] = "牛奶";
  zhGameResources.itemNames["/items/cheese"] = "奶酪";
  const previousNetSell = runtime.api.getNetSellPrice;
  runtime.api.getNetSellPrice = (itemHrid) =>
    ({ "/items/milk": 50, "/items/cheese": 120 })[itemHrid] ??
    previousNetSell(itemHrid);

  runtime.api.renderProductionPanel();

  const card = document.querySelector("#mwi-production-summary");
  assert.ok(card);
  assert.match(card.textContent, /预期单次产出.*牛奶.*×2/s);
  assert.match(
    card.querySelector(".mwi-production-output-item").title,
    /牛奶 ×2/,
  );
  assert.match(
    panel.querySelector(".mwi-production-duration-inline").textContent,
    /耗时 ∞/,
  );
  assert.match(card.textContent, /每小时净利润/);
  assert.equal(panel.contains(card), true);
  assert.equal(hiddenOldPanel.querySelector("#mwi-production-summary"), null);
  assert.equal(document.querySelector(".mwi-max-action-button"), null);

  runtime.api.applyGameMessage({
    type: "action_type_consumable_slots_updated",
    actionTypeDrinkSlotsMap: {
      "/action_types/milking": [{ itemHrid: "/items/processing_tea" }],
    },
  });
  runtime.api.renderProductionPanel();

  assert.deepEqual(
    [...card.querySelectorAll(".mwi-production-output-item")].map(
      (item) => item.title,
    ),
    ["牛奶 ×1.7", "奶酪 ×0.15"],
  );
  assert.match(card.textContent, /预期单次产出.*牛奶.*奶酪/s);

  runtime.api.getNetSellPrice = previousNetSell;
  runtime.api.applyGameMessage({
    type: "action_type_consumable_slots_updated",
    actionTypeDrinkSlotsMap: {},
  });
  delete runtime.state.initData_itemDetailMap["/items/cheese"];
  delete runtime.state.initData_itemDetailMap["/items/processing_tea"];
  delete runtime.state.initData_actionDetailMap[
    "/actions/cheesesmithing/cheese"
  ];
  panel.remove();
  modal.append(originalPanel);
  hiddenOldPanel.remove();
});

test("mixed gathering outputs use a two-column icon grid", () => {
  const originalPanel = document.querySelector(
    'div[class*="SkillActionDetail_regularComponent"]',
  );
  const modal = originalPanel.closest('div[class*="Modal_modalContainer"]');
  const hiddenOldPanel = document.createElement("div");
  hiddenOldPanel.style.display = "none";
  hiddenOldPanel.append(originalPanel);
  modal.append(hiddenOldPanel);
  const panel = document.createElement("div");
  panel.className = "SkillActionDetail_skillActionDetail__mixed";
  panel.innerHTML = `
    <div class="SkillActionDetail_name__test">混合果园</div>
    <div class="SkillActionDetail_actionContainer__test"></div>
  `;
  modal.append(panel);
  runtime.state.initData_actionDetailMap["/actions/foraging/mixed"] = {
    hrid: "/actions/foraging/mixed",
    name: "Mixed Orchard",
    type: "/action_types/foraging",
    baseTimeCost: 10_000_000_000,
    dropTable: [
      { itemHrid: "/items/apple", dropRate: 0.5, count: 1 },
      { itemHrid: "/items/orange", dropRate: 0.25, count: 2 },
      { itemHrid: "/items/plum", dropRate: 0.1, count: 3 },
    ],
  };
  Object.assign(runtime.state.initData_itemDetailMap, {
    "/items/apple": { hrid: "/items/apple", name: "Apple" },
    "/items/orange": { hrid: "/items/orange", name: "Orange" },
    "/items/plum": { hrid: "/items/plum", name: "Plum" },
  });
  Object.assign(zhGameResources.itemNames, {
    "/items/apple": "苹果",
    "/items/orange": "橙子",
    "/items/plum": "李子",
  });
  zhGameResources.actionNames["/actions/foraging/mixed"] = "混合果园";
  const previousNetSell = runtime.api.getNetSellPrice;
  runtime.api.getNetSellPrice = (itemHrid) =>
    ["/items/apple", "/items/orange", "/items/plum"].includes(itemHrid)
      ? 10
      : previousNetSell(itemHrid);

  runtime.api.renderProductionPanel();

  const grid = document.querySelector(".mwi-production-output-grid");
  assert.equal(grid.dataset.count, "3");
  assert.equal(grid.querySelectorAll(".mwi-production-output-item").length, 3);
  assert.match(grid.textContent, /苹果/);
  assert.match(grid.textContent, /橙子/);
  assert.match(grid.textContent, /李子/);
  assert.deepEqual(
    [...grid.querySelectorAll(".mwi-production-output-item")].map(
      (item) => item.title,
    ),
    ["苹果 ×0.5", "橙子 ×0.5", "李子 ×0.3"],
  );

  runtime.api.getNetSellPrice = previousNetSell;
  panel.remove();
  modal.append(originalPanel);
  hiddenOldPanel.remove();
});

test("combat dialogs never render the production summary", () => {
  runtime.state.initData_actionDetailMap["/actions/combat/hell_pit"] = {
    hrid: "/actions/combat/hell_pit",
    name: "Hell Pit",
    type: "/action_types/combat",
    baseTimeCost: 3_000_000_000,
    dropTable: [{ itemHrid: "/items/log", count: 1 }],
  };
  zhGameResources.actionNames["/actions/combat/hell_pit"] = "地狱深渊";
  document.querySelector('div[class*="SkillActionDetail_name"]').textContent =
    "地狱深渊";

  runtime.api.renderProductionPanel();

  assert.equal(document.querySelector("#mwi-production-summary"), null);
});

test("nameless action panels are ignored without reading a missing element", () => {
  const original = runtime.api.getOriTextFromElement;
  let sawMissing = false;
  runtime.api.getOriTextFromElement = (element) => {
    if (!element) sawMissing = true;
    return element?.textContent ?? "";
  };
  try {
    const panel = document.createElement("div");
    panel.className = "SkillActionDetail_regularComponent__test";
    assert.equal(runtime.api.resolveProductionAction(panel), null);
    assert.equal(runtime.api.resolveProductionAction(null), null);
    assert.equal(sawMissing, false);
  } finally {
    runtime.api.getOriTextFromElement = original;
  }
});

test("the top action bar shows only duration and a 24-hour finish time", () => {
  const originalNow = Date.now;
  Date.now = () => new Date(2026, 7, 13, 12, 0, 0).getTime();
  runtime.state.currentActionsHridList = [
    {
      actionHrid: "/actions/crafting/lumber",
      hasMaxCount: true,
      maxCount: 6,
      currentCount: 0,
    },
    {
      actionHrid: "/actions/crafting/lumber",
      hasMaxCount: true,
      maxCount: 999,
      currentCount: 0,
    },
  ];
  try {
    runtime.api.renderActionDashboard();

    const dashboard = document.querySelector("#mwi-action-dashboard");
    assert.ok(dashboard);
    assert.equal(dashboard.textContent, "53秒（12:00:53）");
    assert.doesNotMatch(
      dashboard.textContent,
      /剩余|还需|预计完成|利润|全部完成|999/,
    );
    assert.equal(
      dashboard.querySelector(".mwi-action-time")?.tagName,
      "STRONG",
    );
    assert.equal(dashboard.querySelector(".mwi-action-eta"), null);
    assert.equal(dashboard.children.length, 1);
    assert.equal(
      document
        .querySelector('[class*="Header_actionName"]')
        .classList.contains("mwi-action-dashboard-host"),
      true,
    );
    assert.equal(dom.window.getComputedStyle(dashboard).position, "absolute");
    const dashboardStyle = document.querySelector(
      "#mwitools-action-dashboard-style",
    ).textContent;
    assert.match(dashboardStyle, /flex-wrap:nowrap/);
    assert.match(
      dashboardStyle,
      /\.mwi-action-dashboard \{[^}]*font-size:inherit/,
    );
    assert.match(
      dashboardStyle,
      /\.mwi-action-dashboard\[data-compact="true"\][^}]*width:max-content[^}]*padding-inline:4px/,
    );
    assert.match(
      dashboardStyle,
      /\.mwi-action-time \{[^}]*font-variant-numeric:tabular-nums/,
    );
    assert.match(
      dashboardStyle,
      /\.mwi-action-dashboard \{[^}]*overflow:hidden/,
    );
    assert.doesNotMatch(
      dashboardStyle,
      /mwi-action-eta|mwi-action-time[^}]*display:none/,
    );
  } finally {
    Date.now = originalNow;
  }
});

test("the top action bar marks one-day and multi-day calendar offsets", () => {
  const originalNow = Date.now;
  const logItem = runtime.state.initData_characterItems.find(
    ({ itemHrid }) => itemHrid === "/items/log",
  );
  const originalLogCount = logItem.count;
  Date.now = () => new Date(2026, 7, 13, 23, 59, 30).getTime();
  try {
    logItem.count = 50_000;
    runtime.state.currentActionsHridList = [
      {
        actionHrid: "/actions/crafting/lumber",
        hasMaxCount: true,
        maxCount: 6,
        currentCount: 0,
      },
    ];
    runtime.api.renderActionDashboard();
    assert.equal(
      document.querySelector("#mwi-action-dashboard").textContent,
      "53秒（00:00:23）（+1天）",
    );

    runtime.state.currentActionsHridList[0].maxCount = 9_000;
    runtime.api.renderActionDashboard();
    assert.equal(
      document.querySelector("#mwi-action-dashboard").textContent,
      "1天59分53秒（00:59:23）（+2天）",
    );
  } finally {
    Date.now = originalNow;
    logItem.count = originalLogCount;
  }
});

test("the top action bar keeps its full timing summary in narrow header space", () => {
  const host = document.querySelector('div[class*="Header_actionName"]');
  const nativeLabel = host.querySelector("span");
  host.getBoundingClientRect = () => ({
    left: 0,
    right: 360,
    width: 360,
  });
  nativeLabel.getBoundingClientRect = () => ({ right: 80 });
  runtime.state.currentActionsHridList = [
    {
      actionHrid: "/actions/crafting/lumber",
      hasMaxCount: true,
      maxCount: 6,
      currentCount: 0,
    },
  ];

  runtime.api.renderActionDashboard();

  const dashboard = document.querySelector("#mwi-action-dashboard");
  assert.equal(dashboard.dataset.compact, "true");
  assert.match(dashboard.textContent, /^53秒（\d{2}:\d{2}:\d{2}）/);
  assert.doesNotMatch(dashboard.textContent, /剩余|还需|预计完成/);
  assert.equal(
    dom.window.getComputedStyle(dashboard.querySelector(".mwi-action-time"))
      .display,
    "inline",
  );
});

test("a zero-width action-name box uses the current-action and queue boundaries", () => {
  const host = document.querySelector('div[class*="Header_actionName"]');
  const currentAction = host.closest('div[class*="Header_currentAction"]');
  const actionsHost = currentAction.parentElement;
  const nativeLabel = host.querySelector("span");
  const queuedActions = document.createElement("button");
  queuedActions.textContent = "+5 Queued Actions";
  actionsHost.append(queuedActions);
  Object.defineProperty(dom.window, "innerWidth", {
    configurable: true,
    value: 532,
  });
  host.getBoundingClientRect = () => ({ left: 21, right: 21, width: 0 });
  currentAction.getBoundingClientRect = () => ({
    left: 21,
    right: 500,
    width: 479,
  });
  nativeLabel.getBoundingClientRect = () => ({ right: 174, width: 153 });
  queuedActions.getBoundingClientRect = () => ({
    left: 430,
    right: 497,
    width: 67,
  });
  runtime.config.isZH = false;
  nativeLabel.textContent = "Lumber";
  try {
    runtime.api.renderActionDashboard();

    const dashboard = document.querySelector("#mwi-action-dashboard");
    assert.match(dashboard.textContent, /^53s \(\d{2}:\d{2}:\d{2}\)/);
    assert.doesNotMatch(
      dashboard.textContent,
      /Remaining|Time left|Finishes at|AM|PM/,
    );
    assert.equal(dashboard.dataset.compact, "true");
    assert.equal(dashboard.dataset.tight, "false");
    assert.equal(dashboard.style.left, "160px");
    assert.equal(
      dashboard.style.getPropertyValue("--mwi-action-dashboard-max-width"),
      "243px",
    );
    assert.equal(dashboard.querySelector(".mwi-action-eta"), null);
  } finally {
    runtime.config.isZH = true;
    nativeLabel.textContent = "木板";
    queuedActions.remove();
  }
});

test("an extremely narrow action header keeps the timing summary visible", () => {
  const host = document.querySelector('div[class*="Header_actionName"]');
  const currentAction = host.closest('div[class*="Header_currentAction"]');
  const nativeLabel = host.querySelector("span");
  host.getBoundingClientRect = () => ({ left: 0, right: 0, width: 0 });
  currentAction.getBoundingClientRect = () => ({
    left: 0,
    right: 230,
    width: 230,
  });
  nativeLabel.getBoundingClientRect = () => ({ right: 80, width: 80 });

  runtime.api.renderActionDashboard();

  const dashboard = document.querySelector("#mwi-action-dashboard");
  assert.equal(dashboard.dataset.tight, "true");
  assert.equal(
    dom.window.getComputedStyle(dashboard.querySelector(".mwi-action-time"))
      .display,
    "inline",
  );
});

test("the top action bar follows ordinal order and hides on header mismatch or combat", () => {
  const host = document.querySelector('div[class*="Header_actionName"]');
  host.replaceChildren(
    Object.assign(document.createElement("span"), {
      textContent: "木板",
    }),
  );
  runtime.state.currentActionsHridList = [
    {
      ordinal: 2,
      actionHrid: "/actions/crafting/lumber",
      hasMaxCount: true,
      maxCount: 99,
      currentCount: 0,
    },
    {
      ordinal: 1,
      actionHrid: "/actions/crafting/lumber",
      hasMaxCount: true,
      maxCount: 6,
      currentCount: 0,
    },
  ];
  runtime.api.renderActionDashboard();
  assert.match(
    document.querySelector("#mwi-action-dashboard").textContent,
    /^53秒/,
  );

  host.firstElementChild.textContent = "奇幻洞穴";
  runtime.api.renderActionDashboard();
  assert.equal(document.querySelector("#mwi-action-dashboard"), null);
  assert.equal(host.classList.contains("mwi-action-dashboard-host"), false);

  runtime.state.initData_actionDetailMap["/actions/combat/chimerical_den"] = {
    hrid: "/actions/combat/chimerical_den",
    name: "Chimerical Den",
    type: "/action_types/combat",
  };
  zhGameResources.actionNames["/actions/combat/chimerical_den"] = "奇幻洞穴";
  runtime.state.currentActionsHridList = [
    {
      ordinal: 1,
      actionHrid: "/actions/combat/chimerical_den",
      hasMaxCount: false,
    },
  ];
  runtime.api.renderActionDashboard();
  assert.equal(document.querySelector("#mwi-action-dashboard"), null);

  host.firstElementChild.textContent = "木板";
  runtime.state.currentActionsHridList = [
    {
      ordinal: 1,
      actionHrid: "/actions/crafting/lumber",
      hasMaxCount: true,
      maxCount: 6,
      currentCount: 0,
    },
  ];
  runtime.api.renderActionDashboard();
  assert.ok(document.querySelector("#mwi-action-dashboard"));
});

test("the top action estimate keeps the completed-cycle progress after the bar restarts", () => {
  runtime.state.currentActionsHridList = [
    {
      id: 42,
      actionHrid: "/actions/crafting/lumber",
      hasMaxCount: true,
      maxCount: 6,
      currentCount: 0,
    },
  ];
  const active = document.querySelector('[class*="ProgressBar_active"]');
  active.style.transform = "matrix(0.7, 0, 0, 1, 0, 0)";
  runtime.api.renderActionDashboard();
  assert.match(
    document.querySelector("#mwi-action-dashboard").textContent,
    /^53秒（/,
  );

  runtime.api.applyGameMessage({
    type: "action_completed",
    endCharacterAction: { id: 42, currentCount: 1 },
  });
  active.style.transform = "matrix(0, 0, 0, 1, 0, 0)";
  runtime.api.renderActionDashboard();

  const text = document.querySelector("#mwi-action-dashboard").textContent;
  assert.match(text, /^50秒（/);
  assert.doesNotMatch(text, /剩余|还需|预计完成|1分/);
  active.style.transform = "matrix(0.7, 0, 0, 1, 0, 0)";
});

test("material-limited infinite production shows a finite live remainder", () => {
  const logItem = runtime.state.initData_characterItems.find(
    ({ itemHrid }) => itemHrid === "/items/log",
  );
  logItem.count = 20;
  runtime.state.currentActionsHridList = [
    {
      id: 51,
      actionHrid: "/actions/crafting/lumber",
      hasMaxCount: false,
      maxCount: 0,
      currentCount: 100,
    },
  ];
  runtime.api.renderActionDashboard();

  const dashboard = document.querySelector("#mwi-action-dashboard");
  assert.match(dashboard.textContent, /^1分33秒（/);
  assert.doesNotMatch(dashboard.textContent, /剩余|还需|预计完成/);
  assert.doesNotMatch(dashboard.textContent, /∞/);
  assert.match(dashboard.querySelector(".mwi-action-time").title, /当前库存/);

  runtime.api.applyGameMessage({
    type: "action_completed",
    endCharacterAction: { id: 51, currentCount: 101 },
    endCharacterItems: [
      {
        itemHrid: "/items/log",
        itemLocationHrid: "/item_locations/inventory",
        count: 18,
      },
    ],
  });
  const active = document.querySelector('[class*="ProgressBar_active"]');
  active.style.transform = "matrix(0, 0, 0, 1, 0, 0)";
  runtime.api.renderActionDashboard();

  assert.match(dashboard.textContent, /^1分30秒（/);
  assert.doesNotMatch(dashboard.textContent, /剩余|还需|预计完成|1分40秒/);
  runtime.state.initData_characterItems.find(
    ({ itemHrid }) => itemHrid === "/items/log",
  ).count = 20;
  active.style.transform = "matrix(0.7, 0, 0, 1, 0, 0)";
});

test("enhancement actions use the finite amount shown in the native header", () => {
  const host = document.querySelector('div[class*="Header_actionName"]');
  host.replaceChildren();
  const nativeName = document.createElement("span");
  nativeName.textContent = "骑士盾 +3 (2937)";
  host.append(nativeName);
  runtime.state.initData_actionDetailMap["/actions/enhancing"] = {
    hrid: "/actions/enhancing",
    name: "Enhancing",
    type: "/action_types/enhancing",
    baseTimeCost: 6_000_000_000,
  };
  runtime.state.currentActionsHridList = [
    {
      actionHrid: "/actions/enhancing",
      hasMaxCount: false,
      maxCount: 0,
    },
  ];

  runtime.api.renderActionDashboard();

  const dashboard = document.querySelector("#mwi-action-dashboard");
  assert.match(dashboard.textContent, /^8小时9分23秒（/);
  assert.doesNotMatch(dashboard.textContent, /∞|剩余|还需|预计完成|2\.94K/);
  assert.match(dashboard.querySelector(".mwi-action-time").title, /强化栏/);
});

test("enhancement countdown reuses its node when native count text flickers", () => {
  const host = document.querySelector('div[class*="Header_actionName"]');
  const nativeName = host.querySelector("span");
  const dashboard = document.querySelector("#mwi-action-dashboard");
  const time = dashboard.querySelector(".mwi-action-time");
  const before = time.textContent;

  nativeName.textContent = "骑士盾 +3";
  runtime.api.renderActionDashboard();

  assert.equal(document.querySelector("#mwi-action-dashboard"), dashboard);
  assert.equal(document.querySelector(".mwi-action-time"), time);
  assert.doesNotMatch(time.textContent, /∞/);
  assert.equal(time.textContent, before);
});

test("unenhanced items and trailing warnings keep enhancement estimates visible", () => {
  const host = document.querySelector('div[class*="Header_actionName"]');
  host.replaceChildren();
  const nativeName = document.createElement("span");
  nativeName.textContent = "骑士盾（2937）";
  const warning = document.createElement("span");
  warning.id = "script_item_warning";
  warning.textContent = "缺少强化手套";
  host.append(nativeName, warning);
  runtime.state.currentActionsHridList = [
    {
      actionHrid: "/actions/enhancing",
      hasMaxCount: false,
      maxCount: 0,
    },
  ];

  runtime.api.renderActionDashboard();

  const dashboard = document.querySelector("#mwi-action-dashboard");
  assert.ok(dashboard);
  assert.match(dashboard.textContent, /^8小时9分23秒（/);
  assert.doesNotMatch(dashboard.textContent, /∞|剩余|还需|预计完成|2\.94K/);
});

test("equipment warnings float below community buffs without moving action content", () => {
  const host = document.querySelector('div[class*="Header_actionName"]');
  document.querySelector("#mwi-action-dashboard")?.remove();
  host.replaceChildren();
  const nativeName = document.createElement("span");
  nativeName.className = "native-action-name";
  nativeName.textContent = "木板";
  host.append(nativeName);
  const nativeMarkup = nativeName.outerHTML;

  runtime.state.currentActionsHridList = [
    {
      actionHrid: "/actions/crafting/lumber",
      hasMaxCount: true,
      maxCount: 6,
      currentCount: 0,
    },
  ];
  runtime.state.initData_characterItems.push({
    itemHrid: "/items/eye_watch",
    itemLocationHrid: "/item_locations/inventory",
    count: 1,
  });
  runtime.state.currentEquipmentMap = {};
  runtime.api.renderActionDashboard();
  runtime.api.checkEquipment();

  const warning = document.querySelector("#script_item_warning");
  assert.ok(warning);
  const warningHost = document.querySelector('div[class*="Header_actionInfo"]');
  const communityBuffs = document.querySelector(
    'div[class*="Header_communityBuffs"]',
  );
  assert.equal(warning.parentElement, warningHost);
  assert.match(warning.textContent, /未装备生活副手/);
  assert.equal(warning.title, "未装备生活副手");
  assert.equal(dom.window.getComputedStyle(warning).position, "absolute");
  assert.equal(
    dom.window.getComputedStyle(warning).color,
    "rgb(255, 244, 244)",
  );
  assert.equal(
    dom.window.getComputedStyle(warning).borderTopColor,
    "rgb(255, 91, 91)",
  );
  assert.equal(warning.previousElementSibling, communityBuffs);
  assert.equal(nativeName.outerHTML, nativeMarkup);
  assert.equal(host.firstElementChild, nativeName);

  const dashboardLeft = document.querySelector("#mwi-action-dashboard").style
    .left;
  for (let index = 0; index < 5; index += 1) {
    runtime.api.checkEquipment();
    runtime.api.renderActionDashboard();
  }
  assert.equal(
    document.querySelector("#mwi-action-dashboard").style.left,
    dashboardLeft,
    "the warning must never become the dashboard's next positioning anchor",
  );

  runtime.api.checkEquipment();
  assert.equal(document.querySelectorAll("#script_item_warning").length, 1);
  assert.equal(document.querySelector("#script_item_warning"), warning);

  runtime.state.labyrinthActive = true;
  runtime.api.checkEquipment();
  assert.equal(document.querySelector("#script_item_warning"), null);
  assert.equal(runtime.api.getEquipmentWarning(), null);
  runtime.state.labyrinthActive = false;
  runtime.api.checkEquipment();
  assert.ok(document.querySelector("#script_item_warning"));

  runtime.state.currentEquipmentMap = {
    "/item_locations/off_hand": { itemHrid: "/items/eye_watch", count: 1 },
  };
  runtime.api.checkEquipment();
  assert.equal(document.querySelector("#script_item_warning"), null);
  assert.equal(nativeName.outerHTML, nativeMarkup);
});

test("every skilling equipment reminder uses the current game item HRID", () => {
  const previousItems = runtime.state.initData_characterItems;
  const previousActions = runtime.state.currentActionsHridList;
  const previousEquipment = runtime.state.currentEquipmentMap;
  const cases = [
    {
      actionHrid: "/actions/cooking/test",
      itemHrid: "/items/red_culinary_hat",
      locationHrid: "/item_locations/head",
    },
    {
      actionHrid: "/actions/crafting/test",
      itemHrid: "/items/eye_watch",
      locationHrid: "/item_locations/off_hand",
    },
    {
      actionHrid: "/actions/woodcutting/test",
      itemHrid: "/items/collectors_boots",
      locationHrid: "/item_locations/feet",
    },
    {
      actionHrid: "/actions/enhancing",
      itemHrid: "/items/enchanted_gloves",
      locationHrid: "/item_locations/hands",
    },
  ];

  try {
    runtime.state.labyrinthActive = false;
    for (const { actionHrid, itemHrid, locationHrid } of cases) {
      runtime.state.currentActionsHridList = [{ actionHrid }];
      runtime.state.initData_characterItems = [
        {
          itemHrid,
          itemLocationHrid: "/item_locations/inventory",
          count: 1,
        },
      ];
      runtime.state.currentEquipmentMap = {};
      assert.equal(runtime.api.getEquipmentWarning()?.itemHrid, itemHrid);

      runtime.state.currentEquipmentMap = {
        [locationHrid]: { itemHrid, itemLocationHrid: locationHrid, count: 1 },
      };
      assert.equal(runtime.api.getEquipmentWarning(), null);
    }
  } finally {
    runtime.state.initData_characterItems = previousItems;
    runtime.state.currentActionsHridList = previousActions;
    runtime.state.currentEquipmentMap = previousEquipment;
  }
});

test("every loaded official skilling action resolves to its canonical action HRID", () => {
  const skillingPrefixes = [
    "/actions/milking/",
    "/actions/foraging/",
    "/actions/woodcutting/",
    "/actions/cheesesmithing/",
    "/actions/crafting/",
    "/actions/tailoring/",
    "/actions/cooking/",
    "/actions/brewing/",
    "/actions/alchemy/",
    "/actions/enhancing/",
  ];
  const actions = Object.entries(zhGameResources.actionNames).filter(([hrid]) =>
    skillingPrefixes.some((prefix) => hrid.startsWith(prefix)),
  );
  assert.ok(actions.length > 0, "expected loaded official skilling actions");

  for (const [actionHrid, localizedName] of actions) {
    const panel = document.createElement("div");
    panel.innerHTML = `<div class="SkillActionDetail_name__test"></div>`;
    panel.firstElementChild.textContent = localizedName;
    assert.equal(
      runtime.api.resolveProductionAction(panel),
      actionHrid,
      `${localizedName} should resolve to ${actionHrid}`,
    );
  }
});

test("action resolution follows the game's i18nextLng setting", () => {
  const panelName = document.querySelector(
    'div[class*="SkillActionDetail_name"]',
  );

  localStorage.setItem("i18nextLng", "en-US");
  panelName.textContent = "Lumber";
  assert.equal(runtime.config.gameLanguage, "en-US");
  assert.equal(runtime.config.isZHInGameSetting, false);
  assert.equal(
    runtime.api.resolveProductionAction(panelName.parentElement),
    "/actions/crafting/lumber",
  );

  localStorage.setItem("i18nextLng", "zh-CN");
  panelName.textContent = "木板";
  assert.equal(runtime.config.gameLanguage, "zh-CN");
  assert.equal(runtime.config.isZHInGameSetting, true);
  assert.equal(
    runtime.api.resolveProductionAction(panelName.parentElement),
    "/actions/crafting/lumber",
  );

  localStorage.setItem("i18nextLng", "es");
  panelName.textContent = "Madera";
  assert.equal(
    runtime.api.resolveProductionAction(panelName.parentElement),
    "/actions/crafting/lumber",
  );

  localStorage.setItem("i18nextLng", "zh-CN");
});

test("the top action dashboard recognizes the current localized action name", () => {
  const host = document.querySelector('div[class*="Header_actionName"]');
  host.replaceChildren(
    Object.assign(document.createElement("span"), { textContent: "Madera" }),
  );
  runtime.state.currentActionsHridList = [
    {
      ordinal: 1,
      actionHrid: "/actions/crafting/lumber",
      hasMaxCount: true,
      maxCount: 6,
      currentCount: 0,
    },
  ];
  localStorage.setItem("i18nextLng", "es");
  runtime.api.renderActionDashboard();
  assert.ok(document.querySelector("#mwi-action-dashboard"));
  localStorage.setItem("i18nextLng", "zh-CN");
});

test("unchanged production summaries reuse their DOM without mutations", () => {
  runtime.settings.settingsMap.productionSummary.isTrue = true;
  localStorage.setItem("i18nextLng", "zh-CN");
  document.querySelector('div[class*="SkillActionDetail_name"]').textContent =
    "木板";
  const input = document.querySelector(
    'div[class*="SkillActionDetail_maxActionCountInput"] input',
  );
  input.value = "5";
  runtime.api.renderProductionPanel();
  const card = document.querySelector("#mwi-production-summary");
  const firstChild = card.firstElementChild;
  const observer = new dom.window.MutationObserver(() => {});
  observer.observe(card, { attributes: true, childList: true, subtree: true });

  runtime.api.renderProductionPanel();

  assert.equal(card.firstElementChild, firstChild);
  assert.equal(observer.takeRecords().length, 0);
  observer.disconnect();
});
