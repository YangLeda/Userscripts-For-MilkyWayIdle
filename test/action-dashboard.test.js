import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<!doctype html><html><head></head><body>
    <div class="Header_currentAction__test">
      <div class="Header_actionName__test"></div>
      <div class="ProgressBar_progressBar__test" style="--duration:10">
        <div class="ProgressBar_innerBar__test ProgressBar_active__test" style="transform:matrix(0.7, 0, 0, 1, 0, 0)"></div>
        <div class="ProgressBar_text__test">10.00s</div>
      </div>
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
await import("../src/features/action-dashboard.js");

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

test("Chinese crafting dialogs render the production summary below the action controls", () => {
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
