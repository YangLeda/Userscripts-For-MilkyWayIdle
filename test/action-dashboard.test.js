import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<!doctype html><html><head></head><body>
    <div class="Header_actionInfo__test">
      <div class="Header_myActions__test">
        <div class="Header_currentAction__test">
          <div class="Header_actionName__test"></div>
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
await import("../src/data/translations.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
await import("../src/core/action-projection.js");
await import("../src/core/message-state.js");
await import("../src/features/action-dashboard.js");
await import("../src/features/settings-and-notifications.js");

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

test("Chinese crafting dialogs render the selected profit valuation", async () => {
  runtime.api.renderProductionPanel();

  const card = document.querySelector("#mwi-production-summary");
  const controls = document.querySelector(
    'div[class*="SkillActionDetail_actionContainer"]',
  );
  assert.ok(card);
  assert.equal(controls.nextElementSibling, card);
  assert.match(card.textContent, /本次生产摘要/);
  assert.match(card.textContent, /木板 5/);
  assert.match(card.textContent, /库存最多可做10/);
  assert.match(card.textContent, /本次总耗时30s/);
  assert.match(card.textContent, /本次总净利润400/);

  await runtime.settings.set("profitValuationMode", "aggressive", {
    persist: false,
  });
  runtime.api.renderProductionPanel();
  assert.match(card.textContent, /本次总净利润490/);
  assert.doesNotMatch(card.textContent, /~/);
  await runtime.settings.set("profitValuationMode", "fair", {
    persist: false,
  });

  const extension = document.createElement("section");
  extension.dataset.mwitoolsProductionExtension = "true";
  extension.textContent = "shopping materials";
  card.append(extension);
  document.querySelector(
    'div[class*="SkillActionDetail_maxActionCountInput"] input',
  ).value = "15000";
  runtime.api.renderProductionPanel();
  assert.equal(
    card.querySelector('[data-mwitools-production-extension="true"]'),
    extension,
    "production refreshes must preserve extension DOM without collapsing it",
  );
});

test("combat dialogs never render the production summary", () => {
  runtime.state.initData_actionDetailMap["/actions/combat/hell_pit"] = {
    hrid: "/actions/combat/hell_pit",
    name: "Hell Pit",
    type: "/action_types/combat",
    baseTimeCost: 3_000_000_000,
    dropTable: [{ itemHrid: "/items/log", count: 1 }],
  };
  runtime.data.ZHActionNames["/actions/combat/hell_pit"] = "地狱深渊";
  document.querySelector('div[class*="SkillActionDetail_name"]').textContent =
    "地狱深渊";

  runtime.api.renderProductionPanel();

  assert.equal(document.querySelector("#mwi-production-summary"), null);
});

test("the top action bar shows only current-action count, time left, and finish time", () => {
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
  runtime.api.renderActionDashboard();

  const dashboard = document.querySelector("#mwi-action-dashboard");
  assert.ok(dashboard);
  assert.match(dashboard.textContent, /剩余 6/);
  assert.match(dashboard.textContent, /还需 53s/);
  assert.match(dashboard.textContent, /预计完成/);
  assert.doesNotMatch(dashboard.textContent, /利润|全部完成|999/);
  assert.equal(dashboard.children.length, 1);
  assert.equal(
    document
      .querySelector('[class*="Header_actionName"]')
      .classList.contains("mwi-action-dashboard-host"),
    true,
  );
  assert.equal(dom.window.getComputedStyle(dashboard).position, "absolute");
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
    /还需 53s/,
  );

  runtime.api.applyGameMessage({
    type: "action_completed",
    endCharacterAction: { id: 42, currentCount: 1 },
  });
  active.style.transform = "matrix(0, 0, 0, 1, 0, 0)";
  runtime.api.renderActionDashboard();

  const text = document.querySelector("#mwi-action-dashboard").textContent;
  assert.match(text, /剩余 5/);
  assert.match(text, /还需 50s/);
  assert.doesNotMatch(text, /还需 1m/);
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
  assert.match(dashboard.textContent, /剩余 10/);
  assert.match(dashboard.textContent, /还需 93s/);
  assert.doesNotMatch(dashboard.textContent, /∞/);
  assert.match(dashboard.querySelector("span").title, /当前库存/);

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

  assert.match(dashboard.textContent, /剩余 9/);
  assert.match(dashboard.textContent, /还需 90s/);
  assert.doesNotMatch(dashboard.textContent, /还需 100s/);
  runtime.state.initData_characterItems.find(
    ({ itemHrid }) => itemHrid === "/items/log",
  ).count = 20;
  active.style.transform = "matrix(0.7, 0, 0, 1, 0, 0)";
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

  runtime.state.currentEquipmentMap = {
    "/item_locations/off_hand": { itemHrid: "/items/eye_watch", count: 1 },
  };
  runtime.api.checkEquipment();
  assert.equal(document.querySelector("#script_item_warning"), null);
  assert.equal(nativeName.outerHTML, nativeMarkup);
});

test("every localized skilling action resolves to its canonical action HRID", () => {
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
  const actions = Object.entries(runtime.data.ZHActionNames).filter(([hrid]) =>
    skillingPrefixes.some((prefix) => hrid.startsWith(prefix)),
  );
  assert.ok(actions.length > 100, "expected the complete skilling catalog");

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
});
