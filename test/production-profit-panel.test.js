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
await import("../src/core/action-projection.js");
await import("../src/features/production-profit-panel.js");

runtime.state.initData_actionDetailMap = {
  "/actions/crafting/panel-output": {
    hrid: "/actions/crafting/panel-output",
    name: "Panel Output",
    type: "/action_types/crafting",
    baseTimeCost: 10_000_000_000,
    inputItems: [{ itemHrid: "/items/input", count: 2 }],
    outputItems: [{ itemHrid: "/items/panel-output", count: 1 }],
  },
};
runtime.state.initData_itemDetailMap = {
  "/items/input": { name: "Input" },
  "/items/panel-output": { name: "Panel Output" },
};
runtime.state.initData_characterSkills = [];
runtime.state.initData_characterItems = [];
runtime.state.initData_actionTypeDrinkSlotsMap = {
  "/action_types/crafting": [],
};
runtime.state.currentEquipmentMap = {};
runtime.state.actionTypeBuffSources = {};
runtime.api.getAskPrice = (itemHrid) => (itemHrid === "/items/input" ? 10 : 0);
runtime.api.getNetSellPrice = (itemHrid) =>
  itemHrid === "/items/panel-output" ? 100 : 0;
runtime.api.getTotalEffiPercentage = () => 0;
runtime.api.numberFormatter = (value) => String(Number(value).toFixed(1));

function nativeTooltip() {
  return document.querySelector("#native-tooltip");
}

test("profit UI is a separate sibling and leaves the native tooltip untouched", () => {
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
