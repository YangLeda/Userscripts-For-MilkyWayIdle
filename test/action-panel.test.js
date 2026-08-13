import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<!doctype html><html><head></head><body>
    <div class="SkillActionDetail_regularComponent__test">
      <div class="SkillActionDetail_name__test">木板</div>
      <div class="SkillActionDetail_expGain__test">8.5</div>
      <div class="SkillActionDetail_info__test">
        <div class="SkillActionDetail_label__test">持续时间</div>
        <div class="SkillActionDetail_value__test">6.11s</div>
      </div>
      <div class="SkillActionDetail_actionContainer__test">
        <div class="SkillActionDetail_maxActionCountInput__test">
          <input class="Input_input__native" value="300">
          <button class="Button_button__native Button_small__native">∞</button>
        </div>
      </div>
      <div class="SkillActionDetail_dropTable__test"></div>
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
await import("../src/features/action-panel.js");

runtime.state.initData_actionDetailMap = {
  "/actions/crafting/lumber": {
    hrid: "/actions/crafting/lumber",
    name: "Lumber",
    type: "/action_types/crafting",
    baseTimeCost: 10_000_000_000,
    levelRequirement: { skillHrid: "/skills/crafting", level: 1 },
    experienceGain: { skillHrid: "/skills/crafting" },
    inputItems: [],
    outputItems: [{ itemHrid: "/items/lumber", count: 1 }],
  },
};
runtime.state.initData_characterSkills = [
  { skillHrid: "/skills/crafting", level: 100, experience: 1_000 },
];
runtime.state.initData_characterItems = [];
runtime.state.initData_actionTypeDrinkSlotsMap = {};
runtime.state.initData_levelExperienceTable = Array.from(
  { length: 201 },
  (_, level) => level * 1_000,
);
runtime.api.getOriTextFromElement = (element) => element?.textContent ?? "";
runtime.api.getHousesEffBuffByActionHrid = () => 0;
runtime.api.getTeaBuffsByActionHrid = () => ({ efficiency: 0 });
runtime.api.getItemEffiBuffByActionHrid = () => 0;
runtime.api.timeReadable = (seconds) => `${Math.round(seconds)}s`;

test("production details add target-level and working quick-input controls", async () => {
  const panel = document.querySelector(
    'div[class*="SkillActionDetail_regularComponent"]',
  );
  await runtime.api.handleActionPanel(panel);
  await runtime.api.handleActionPanel(panel);
  runtime.api.renderProductionQuickInputs();
  runtime.api.renderProductionQuickInputs();

  assert.equal(document.querySelectorAll("#mwi-level-progress").length, 1);
  assert.equal(document.querySelector("#showTotalTime"), null);
  assert.equal(document.querySelectorAll("#quickInputHourButtons").length, 1);
  assert.equal(document.querySelectorAll("#quickInputCountButtons").length, 1);
  assert.equal(
    document.querySelectorAll("#quickInputHourButtons button").length,
    10,
  );
  assert.equal(
    document.querySelectorAll("#quickInputCountButtons button").length,
    6,
  );
  const quickInputs = document.querySelector(".mwi-production-quick-inputs");
  const actionContainer = document.querySelector(
    'div[class*="SkillActionDetail_actionContainer"]',
  );
  assert.equal(quickInputs.parentElement, panel);
  assert.equal(quickInputs.previousElementSibling, actionContainer);

  const levelInput = document.querySelector("#tillLevelInput");
  assert.ok(levelInput.classList.contains("Input_input__native"));
  assert.match(
    document.querySelector("#mwi-level-progress").textContent,
    /目标等级.*还需.*预计/s,
  );
  assert.equal(document.querySelectorAll(".mwi-native-level-stat").length, 4);
  assert.equal(document.querySelector("#expPerHour").textContent, "9.97K");
  assert.equal(
    document.querySelector("#currentEfficiency").textContent,
    "+99.0%",
  );

  assert.equal(
    document.querySelector(
      'div[class*="SkillActionDetail_maxActionCountInput"] input',
    ).value,
    "300",
  );

  document
    .querySelector('#quickInputHourButtons button[data-quick-value="0.5"]')
    .click();
  assert.equal(
    document.querySelector(
      'div[class*="SkillActionDetail_maxActionCountInput"] input',
    ).value,
    "587",
  );
  const durationButton = document.querySelector(
    '#quickInputHourButtons button[data-quick-value="24"]',
  );
  assert.match(durationButton.title, /99\.0%.*不少于/);
  durationButton.click();
  const durationCount = Number(
    document.querySelector(
      'div[class*="SkillActionDetail_maxActionCountInput"] input',
    ).value,
  );
  assert.equal(durationCount, 28140);
  const durationProjection = runtime.api.projectAction(
    "/actions/crafting/lumber",
    durationCount,
    { durationPerAction: 6.11 },
  );
  assert.ok(durationProjection.totalSeconds >= 24 * 3_600);
  assert.ok(durationProjection.totalSeconds < 24 * 3_600 + 6.11);

  const getTotalEfficiency = runtime.api.getTotalEffiPercentage;
  runtime.api.getTotalEffiPercentage = () => Number.NaN;
  runtime.api.renderProductionQuickInputs();
  document
    .querySelector('#quickInputHourButtons button[data-quick-value="0.5"]')
    .click();
  assert.equal(
    document.querySelector(
      'div[class*="SkillActionDetail_maxActionCountInput"] input',
    ).value,
    "295",
  );
  runtime.api.getTotalEffiPercentage = getTotalEfficiency;

  const durationValue = panel.querySelector(
    'div[class*="SkillActionDetail_value"]',
  );
  durationValue.textContent = "—";
  runtime.api.renderProductionQuickInputs();
  assert.equal(
    [...document.querySelectorAll("#quickInputHourButtons button")].every(
      (button) => button.disabled,
    ),
    true,
  );
  durationValue.textContent = "6.11s";
  runtime.api.renderProductionQuickInputs();
  document
    .querySelector('#quickInputCountButtons button[data-quick-value="1000"]')
    .click();
  assert.equal(
    document.querySelector(
      'div[class*="SkillActionDetail_maxActionCountInput"] input',
    ).value,
    "1000",
  );
  runtime.api.removeProductionQuickInputs();
  assert.equal(document.querySelector(".mwi-production-quick-inputs"), null);
  levelInput.value = "102";
  levelInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  assert.equal(
    document.querySelector(
      'div[class*="SkillActionDetail_maxActionCountInput"] input',
    ).value,
    "11883",
  );

  document.querySelector("#mwi-level-progress").remove();
  document
    .querySelectorAll(".mwi-native-level-stat")
    .forEach((element) => element.remove());
  await runtime.api.handleActionPanel(panel);
  assert.equal(document.querySelectorAll("#mwi-level-progress").length, 1);
  assert.equal(document.querySelectorAll(".mwi-native-level-stat").length, 4);

  panel
    .querySelector('div[class*="SkillActionDetail_maxActionCountInput"]')
    .remove();
  runtime.api.renderProductionQuickInputs();
  assert.equal(document.querySelector(".mwi-production-quick-inputs"), null);
});

test("target-level estimate retries cleanly after a partially mounted panel", async () => {
  const panel = document.querySelector(
    'div[class*="SkillActionDetail_regularComponent"]',
  );
  panel.innerHTML = `<div class="SkillActionDetail_name__test">木板</div>
    <div class="SkillActionDetail_expGain__test">8.5</div>`;
  delete panel.dataset.mwitoolsActionPanel;

  assert.equal(await runtime.api.handleActionPanel(panel), false);
  assert.equal(panel.dataset.mwitoolsActionPanel, undefined);
  assert.equal(panel.querySelector("#mwi-level-progress"), null);

  panel.insertAdjacentHTML(
    "beforeend",
    `<div class="SkillActionDetail_info__test">
      <div class="SkillActionDetail_label__test">持续时间</div>
      <div class="SkillActionDetail_value__test">6.11s</div>
    </div>
    <div class="SkillActionDetail_actionContainer__test">
      <div class="SkillActionDetail_maxActionCountInput__test">
        <input class="Input_input__native" value="300">
      </div>
    </div>
    <div class="SkillActionDetail_dropTable__test"></div>`,
  );

  assert.equal(await runtime.api.handleActionPanel(panel), true);
  assert.equal(await runtime.api.handleActionPanel(panel), true);
  assert.equal(panel.dataset.mwitoolsActionPanel, "true");
  assert.equal(panel.querySelectorAll("#mwi-level-progress").length, 1);
  assert.equal(panel.querySelectorAll(".mwi-native-level-stat").length, 4);
  assert.match(
    panel.querySelector("#mwi-level-progress").textContent,
    /还需.*预计/,
  );
});

test("efficiency follows the game's authoritative buff maps", () => {
  runtime.state.initData_characterSkills = [
    { skillHrid: "/skills/crafting", level: 136, experience: 1_000 },
  ];
  runtime.state.actionTypeBuffSources = {
    communityActionTypeBuffsMap: {
      "/action_types/crafting": [
        { typeHrid: "/buff_types/efficiency", flatBoost: 0.167 },
      ],
    },
    houseActionTypeBuffsMap: {
      "/action_types/crafting": [
        { typeHrid: "/buff_types/efficiency", flatBoost: 0.075 },
      ],
    },
    guildActionTypeBuffsMap: {
      "/action_types/crafting": [
        { typeHrid: "/buff_types/efficiency", flatBoost: 0.01 },
      ],
    },
    achievementActionTypeBuffsMap: {
      "/action_types/crafting": [
        { typeHrid: "/buff_types/efficiency", flatBoost: 0.02 },
      ],
    },
    consumableActionTypeBuffsMap: {
      "/action_types/crafting": [
        { typeHrid: "/buff_types/efficiency", flatBoost: 0.1129 },
        { typeHrid: "/buff_types/action_level", flatBoost: 5.645 },
      ],
    },
    equipmentActionTypeBuffsMap: {
      "/action_types/crafting": [
        { typeHrid: "/buff_types/efficiency", flatBoost: 0.178 },
        { typeHrid: "/buff_types/crafting_level", flatBoost: 3.6 },
      ],
    },
  };

  const details = runtime.api.getActionEfficiencyDetails(
    "/actions/crafting/lumber",
  );
  assert.equal(details.source, "game");
  assert.equal(Number(details.directEfficiency.toFixed(2)), 56.29);
  assert.equal(Number(details.levelEfficiency.toFixed(3)), 132.955);
  assert.equal(
    Number(
      runtime.api.getTotalEffiPercentage("/actions/crafting/lumber").toFixed(3),
    ),
    189.245,
  );
});
