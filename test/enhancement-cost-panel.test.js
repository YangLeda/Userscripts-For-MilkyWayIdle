import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<!doctype html><html><head></head><body><div id="portal"><div id="native-tooltip" class="MuiTooltip-popper"><div>Native tooltip</div></div></div></body></html>`,
  { url: "https://www.milkywayidle.com/" },
);
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.requestAnimationFrame = (callback) => {
  callback();
  return 1;
};
globalThis.innerWidth = 1_200;
globalThis.innerHeight = 800;

const { runtime } = await import("../src/core/runtime.js");
runtime.config.isZH = true;
runtime.api.numberFormatter = (value) =>
  Number(value) >= 1_000_000
    ? `${(Number(value) / 1_000_000).toFixed(1)}M`
    : String(value);
runtime.api.formatExactNumber = (value) =>
  Number(value).toLocaleString("en-US");
runtime.api.timeReadable = (seconds) => `${Math.round(seconds)}秒`;

const {
  hideEnhancementCostPanel,
  positionEnhancementCostPanel,
  showEnhancementCostPanel,
} = await import("../src/features/enhancement-cost-panel.js");

function anchor() {
  return document.querySelector("#native-tooltip");
}

function completePlan() {
  return {
    status: "complete",
    totalCost: 12_345_678,
    totalSeconds: 456,
    normalProtectStart: 6,
    expectedProtectionCount: 7.25,
    philosopherStart: 10,
    aLevel: 10,
    aCount: 5.5,
    bLevel: 9,
    bCount: 3.25,
  };
}

test("enhancement UI is a separate seven-row sibling", () => {
  const tooltip = anchor();
  const original = tooltip.innerHTML;
  const panel = showEnhancementCostPanel(tooltip, completePlan());

  assert.equal(tooltip.innerHTML, original);
  assert.equal(panel.parentElement, tooltip.parentElement);
  assert.equal(tooltip.nextElementSibling, panel);
  assert.equal(panel.querySelectorAll(".mwi-enhancement-metric").length, 7);
  assert.match(panel.textContent, /总成本/);
  assert.match(panel.textContent, /开始保护\+6/);
  assert.match(panel.textContent, /开始贤者保护\+10/);
  assert.match(panel.textContent, /A（\+10）5\.5/);
  assert.match(panel.textContent, /B（\+9）3\.3/);

  showEnhancementCostPanel(tooltip, completePlan());
  assert.equal(
    document.querySelectorAll("#mwitools-enhancement-cost-panel").length,
    1,
  );
});

test("unavailable and normal-only plans keep the same compact fields", () => {
  let panel = showEnhancementCostPanel(anchor(), null);
  assert.equal(panel.dataset.status, "unavailable");
  assert.equal(panel.querySelectorAll(".mwi-enhancement-value").length, 7);
  assert.ok(
    [...panel.querySelectorAll(".mwi-enhancement-value")].every(
      (value) => value.textContent === "—",
    ),
  );

  panel = showEnhancementCostPanel(anchor(), {
    ...completePlan(),
    normalProtectStart: null,
    philosopherStart: null,
    aLevel: null,
    aCount: 0,
    bLevel: null,
    bCount: 0,
  });
  assert.match(panel.textContent, /开始保护不用/);
  assert.match(panel.textContent, /开始贤者保护不用/);
});

test("panel chooses an available side and stays inside the viewport", () => {
  const tooltip = anchor();
  tooltip.getBoundingClientRect = () => ({
    bottom: 300,
    height: 200,
    left: 100,
    right: 260,
    top: 100,
    width: 160,
  });
  const panel = showEnhancementCostPanel(tooltip, completePlan());
  panel.getBoundingClientRect = () => ({
    bottom: 289,
    height: 189,
    left: 0,
    right: 252,
    top: 0,
    width: 252,
  });
  positionEnhancementCostPanel();
  assert.equal(panel.dataset.placement, "right");
  assert.equal(panel.style.left, "268px");

  globalThis.innerWidth = 900;
  tooltip.getBoundingClientRect = () => ({
    bottom: 300,
    height: 200,
    left: 700,
    right: 860,
    top: 100,
    width: 160,
  });
  positionEnhancementCostPanel();
  assert.equal(panel.dataset.placement, "left");
  assert.equal(panel.style.left, "440px");
  globalThis.innerWidth = 1_200;
});

test("English labels are synchronized", () => {
  runtime.config.isZH = false;
  const panel = showEnhancementCostPanel(anchor(), completePlan());
  assert.match(panel.textContent, /Total cost/);
  assert.match(panel.textContent, /Protect from/);
  assert.match(panel.textContent, /Protection uses/);
  assert.match(panel.textContent, /Philosopher's Mirror from/);
  runtime.config.isZH = true;
});

test("panel is removed with its native tooltip", async () => {
  showEnhancementCostPanel(anchor(), completePlan());
  anchor().remove();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    document.querySelector("#mwitools-enhancement-cost-panel"),
    null,
  );
  hideEnhancementCostPanel();
});
