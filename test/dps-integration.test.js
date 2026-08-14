import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { build } from "esbuild";
import { JSDOM } from "jsdom";

function installBrowserGlobals(dom) {
  const canvasContext = new Proxy(
    {},
    {
      get(target, property) {
        if (property === "createLinearGradient") {
          return () => ({ addColorStop() {} });
        }
        if (!(property in target)) target[property] = () => {};
        return target[property];
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      },
    },
  );
  dom.window.HTMLCanvasElement.prototype.getContext = () => canvasContext;
  Object.defineProperty(dom.window.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => {} },
  });
  const globals = {
    Blob: dom.window.Blob,
    CustomEvent: dom.window.CustomEvent,
    Event: dom.window.Event,
    EventTarget: dom.window.EventTarget,
    MutationObserver: dom.window.MutationObserver,
    Option: dom.window.Option,
    document: dom.window.document,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    localStorage: dom.window.localStorage,
    navigator: dom.window.navigator,
    unsafeWindow: dom.window,
    window: dom.window,
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  if (!globalThis.CSS) globalThis.CSS = { escape: (value) => String(value) };
}

test("DPS feature reuses settings and cleans repeated enable-disable cycles", async (t) => {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><div class="Header_communityBuffs__test"></div><svg><use href="/static/media/abilities_sprite.test.svg#steady_shot"></use></svg><svg><use href="/static/media/combat_monsters_sprite.test.svg#training_rat"></use></svg></body></html>',
    {
      url: "https://www.milkywayidle.com/",
    },
  );
  installBrowserGlobals(dom);
  const originalFetch = globalThis.fetch;
  t.after(() => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: originalFetch,
    });
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: async () => ({
      ok: true,
      json: async () => ({
        files: {
          skills:
            "https://cdn.example.test/assets/skills_sprite.runtime.svg?v=1",
          misc: "https://cdn.example.test/assets/misc_sprite.runtime.svg?v=1",
        },
      }),
    }),
  });
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: 390 },
    innerHeight: { configurable: true, value: 844 },
    matchMedia: {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      }),
    },
  });
  const communityBuffs = document.querySelector(
    'div[class*="Header_communityBuffs"]',
  );
  communityBuffs.getBoundingClientRect = () => ({
    left: 8,
    right: 96,
    top: 10,
    bottom: 38,
    width: 88,
    height: 28,
  });
  localStorage.setItem(
    "kikimeter:settings:v4",
    JSON.stringify({ language: "en", panelOpacity: 70 }),
  );

  const bundled = await build({
    bundle: true,
    entryPoints: ["test-support/dps-integration-entry.js"],
    format: "esm",
    loader: { ".png": "dataurl" },
    platform: "node",
    write: false,
  });
  const moduleUrl =
    "data:text/javascript;base64," +
    Buffer.from(bundled.outputFiles[0].text).toString("base64");
  const { runtime } = await import(moduleUrl);

  await runtime.start();
  document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  assert.equal(runtime.features.getStatus("dps").status, "active");
  assert.equal(window.__MWI_DPS.enabled, true);
  assert.equal(window.__MWI_DPS.getLanguage(), "en");
  assert.equal(document.querySelectorAll("#kikimeter-panel").length, 1);
  assert.equal(document.querySelectorAll("#kikimeter-tab-btn").length, 1);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const dpsPanel = document.querySelector("#kikimeter-panel");
  const expectedToolbarIcons = [
    ["Damage Done (DPS)", "attack"],
    ["Healing (HPS)", "stamina"],
    ["Damage Taken (DTPS)", "defense"],
    ["Live Accuracy", "steady_shot"],
    ["Settings", "settings"],
  ];
  for (const [title, symbol] of expectedToolbarIcons) {
    const button = dpsPanel.querySelector(`button[title="${title}"]`);
    assert.ok(button, `${title} toolbar button must exist`);
    assert.match(
      button.querySelector("use")?.getAttribute("href") || "",
      new RegExp(`#${symbol}$`),
      `${title} must recover its official icon after the sprite manifest loads`,
    );
  }
  assert.match(
    dpsPanel.querySelector("[data-segment-picker] use")?.getAttribute("href") ||
      "",
    /#loot_tracker$/,
  );

  const originalParse = JSON.parse;
  let parseCount = 0;
  JSON.parse = (...args) => {
    parseCount += 1;
    return originalParse(...args);
  };
  try {
    runtime.api.handleMessage(JSON.stringify({ type: "performance_probe" }));
  } finally {
    JSON.parse = originalParse;
  }
  assert.equal(parseCount, 1, "core-dispatched messages must be parsed once");

  const installBoxMetrics = (element, width, height) => {
    Object.defineProperties(element, {
      offsetWidth: { configurable: true, get: () => width },
      offsetHeight: { configurable: true, get: () => height },
    });
    element.getBoundingClientRect = () => {
      const left = Number.parseFloat(element.style.left) || 0;
      const top = Number.parseFloat(element.style.top) || 0;
      return {
        left,
        right: left + width,
        top,
        bottom: top + height,
        width,
        height,
      };
    };
  };
  const pointerEvent = (type, options) => {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: options.clientX,
      clientY: options.clientY,
    });
    Object.defineProperty(event, "pointerId", { value: 1 });
    return event;
  };
  const launcher = document.querySelector("#kikimeter-tab-btn");
  installBoxMetrics(launcher, 54, 28);
  assert.equal(launcher.style.left, "102px");
  assert.equal(launcher.style.top, "10px");

  installBoxMetrics(dpsPanel, 330, 212);
  let hiddenPanelMutations = 0;
  const hiddenPanelObserver = new dom.window.MutationObserver(
    (records) => (hiddenPanelMutations += records.length),
  );
  hiddenPanelObserver.observe(dpsPanel, {
    attributes: true,
    childList: true,
    subtree: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 320));
  hiddenPanelObserver.disconnect();
  assert.equal(
    hiddenPanelMutations,
    0,
    "closed DPS panels must not be rebuilt by the 250ms timer",
  );
  launcher.click();
  assert.equal(dpsPanel.style.display, "flex");
  assert.ok(Number.parseFloat(dpsPanel.style.left) >= 4);
  assert.ok(Number.parseFloat(dpsPanel.style.left) + 330 <= 386);

  const titleRow = dpsPanel.firstElementChild;
  const originalTop = Number.parseFloat(dpsPanel.style.top);
  titleRow.dispatchEvent(
    pointerEvent("pointerdown", {
      clientX: Number.parseFloat(dpsPanel.style.left) + 20,
      clientY: originalTop + 10,
    }),
  );
  window.dispatchEvent(
    pointerEvent("pointermove", { clientX: 100, clientY: 160 }),
  );
  window.dispatchEvent(
    pointerEvent("pointerup", { clientX: 100, clientY: 160 }),
  );
  assert.ok(Number.parseFloat(dpsPanel.style.top) > originalTop);
  assert.ok(Number.parseFloat(dpsPanel.style.top) + 212 <= 844);

  const player = {
    name: "集成甲",
    currentManapoints: 100,
    currentHitpoints: 100,
    attackAttemptCounter: 0,
    isPreparingAutoAttack: true,
    combatDetails: {
      combatStats: {
        combatStyleHrids: ["/combat_styles/magic"],
        damageType: "/damage_types/fire",
        primaryTraining: "/skills/magic",
        attackInterval: 3_500_000_000,
      },
    },
  };
  for (const payload of [
    {
      type: "new_battle",
      combatStartTime: "integration",
      players: [player],
      monsters: [
        {
          name: "Training Rat",
          hrid: "/monsters/training_rat",
          currentHitpoints: 100,
        },
      ],
    },
    {
      type: "battle_updated",
      pMap: { 0: { cMP: 80, cHP: 100, atkCounter: 1, isAutoAtk: true } },
      mMap: { 0: { cHP: 72 } },
    },
  ]) {
    runtime.dispatchMessage(payload, JSON.stringify(payload));
  }
  assert.equal(window.__MWI_DPS.getSessionDamage(), 28);
  window.__MWI_DPS.selectSegment("current");
  const accuracyButton = dpsPanel.querySelector(
    'button[title="Live Accuracy"]',
  );
  assert.ok(accuracyButton, "the main DPS toolbar must expose live accuracy");
  assert.match(
    accuracyButton.querySelector("use")?.getAttribute("href") || "",
    /#steady_shot$/,
  );
  accuracyButton.click();
  let accuracyRow = dpsPanel.querySelector("[data-kikimeter-accuracy-row]");
  assert.ok(accuracyRow);
  assert.match(accuracyRow.textContent, /100\.0% \(1\/1\)/);
  accuracyRow.dispatchEvent(new dom.window.MouseEvent("mouseenter"));
  let accuracyTooltip = document.querySelector(
    "[data-kikimeter-accuracy-tooltip]",
  );
  assert.ok(accuracyTooltip);
  assert.match(accuracyTooltip.textContent, /Training Rat/);
  assert.match(accuracyTooltip.textContent, /100\.0% \(1\/1\)/);
  const monsterLine = accuracyTooltip.querySelector(
    '[data-monster-hrid="/monsters/training_rat"]',
  );
  assert.ok(monsterLine, "accuracy details must keep the monster identity");
  assert.match(
    monsterLine.querySelector("svg use")?.getAttribute("href") || "",
    /combat_monsters_sprite\.test\.svg#training_rat$/,
  );

  const missPayload = {
    type: "battle_updated",
    pMap: { 0: { cMP: 80, cHP: 100, atkCounter: 2, isAutoAtk: true } },
    mMap: { 0: { cHP: 72 } },
  };
  runtime.dispatchMessage(missPayload, JSON.stringify(missPayload));
  window.__MWI_DPS.selectSegment("current");
  accuracyRow = dpsPanel.querySelector("[data-kikimeter-accuracy-row]");
  assert.match(accuracyRow.textContent, /50\.0% \(1\/2\)/);
  accuracyTooltip = document.querySelector("[data-kikimeter-accuracy-tooltip]");
  assert.match(accuracyTooltip.textContent, /50\.0% \(1\/2\)/);

  await runtime.features.disable("dps");
  assert.equal(window.__MWI_DPS.enabled, false);
  assert.equal(document.querySelector("#kikimeter-panel"), null);
  assert.equal(document.querySelector("#kikimeter-tab-btn"), null);

  await runtime.features.enable("dps");
  await runtime.features.restart("dps");
  assert.equal(window.__MWI_DPS.enabled, true);
  assert.equal(document.querySelectorAll("#kikimeter-panel").length, 1);
  assert.equal(document.querySelectorAll("#kikimeter-tab-btn").length, 1);

  await runtime.features.disable("dps");
});
