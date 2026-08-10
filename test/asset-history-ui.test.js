import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><head></head><body></body>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.window = dom.window;
const intervals = new Map();
let nextInterval = 1;
globalThis.setInterval = (callback) => {
  const id = nextInterval++;
  intervals.set(id, callback);
  return id;
};
globalThis.clearInterval = (id) => intervals.delete(id);

const { runtime } = await import("../src/core/runtime.js");
runtime.config.isZH = true;
runtime.api.numberFormatter = (value) => {
  const number = Number(value);
  if (Math.abs(number) >= 1_000_000)
    return `${Number((number / 1_000_000).toFixed(2))}M`;
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2,
  }).format(number);
};
runtime.api.formatExactNumber = (value) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 20 }).format(value);
runtime.api.getLatestAssetSnapshot = () => null;
const { AssetHistoryStore } =
  await import("../src/features/asset-history/10-store.js");
const { createAssetHistoryUi } =
  await import("../src/features/asset-history/30-panel.js");

function gameShell() {
  const shell = document.createElement("main");
  shell.innerHTML = `
    <nav><button type="button">库存</button><button type="button" id="loadout">配装</button></nav>
    <section class="Inventory_panel__test"><input placeholder="物品搜索"></section>
  `;
  document.body.appendChild(shell);
  return shell;
}

test("盈亏 is a singleton native sibling and restores game content on tab switches", () => {
  document.body.replaceChildren();
  intervals.clear();
  const shell = gameShell();
  const nativeContent = shell.querySelector("section");
  const scope = runtime.createCleanupScope();
  const store = new AssetHistoryStore(localStorage);
  const ui = createAssetHistoryUi({
    scope,
    store,
    scopeKey: "production:7",
  });

  const tab = document.querySelector("#mwitools-asset-history-tab");
  assert.ok(tab);
  assert.equal(tab.previousElementSibling.id, "loadout");
  assert.equal(
    document.querySelectorAll("#mwitools-asset-history-tab").length,
    1,
  );
  assert.equal(
    document.querySelectorAll("#mwitools-asset-history-panel").length,
    1,
  );
  assert.match(
    document.querySelector("#mwitools-asset-history-style").textContent,
    /#00c6ff/,
  );
  assert.match(
    document.querySelector("#mwitools-asset-history-style").textContent,
    /overflow-y:auto/,
  );
  assert.doesNotMatch(
    document.querySelector("#mwitools-asset-history-style").textContent,
    /min-width:470px/,
  );

  tab.click();
  assert.equal(nativeContent.hidden, true);
  assert.equal(
    document.querySelector("#mwitools-asset-history-panel").hidden,
    false,
  );
  ui.update({
    values: {
      total: 1_234_567,
      equipment: 1_000_000,
      inventory: 234_567,
    },
  });
  const currentTotal = document.querySelector("#mwi-asset-current-total");
  assert.equal(currentTotal.textContent, "1.23M");
  assert.equal(currentTotal.title, "1,234,567");
  shell.querySelector("nav button").click();
  assert.equal(nativeContent.hidden, false);
  assert.equal(
    document.querySelector("#mwitools-asset-history-panel").hidden,
    true,
  );

  ui.destroy();
  scope.cleanup();
  assert.equal(document.querySelector("#mwitools-asset-history-tab"), null);
  assert.equal(document.querySelector("#mwitools-asset-history-panel"), null);
});

test("DOM rebuilds and repeated mounts never leave duplicate asset-history UI", () => {
  document.body.replaceChildren();
  intervals.clear();
  let shell = gameShell();
  const scope = runtime.createCleanupScope();
  const ui = createAssetHistoryUi({
    scope,
    store: new AssetHistoryStore(localStorage),
    scopeKey: "production:7",
  });
  shell.remove();
  shell = gameShell();
  for (const callback of intervals.values()) callback();
  assert.equal(
    document.querySelectorAll("#mwitools-asset-history-tab").length,
    1,
  );
  assert.equal(
    document.querySelectorAll("#mwitools-asset-history-panel").length,
    1,
  );
  assert.equal(
    document.querySelector("#mwitools-asset-history-tab")
      .previousElementSibling,
    shell.querySelector("#loadout"),
  );
  ui.destroy();
  scope.cleanup();
});

test("assetHistory feature survives repeated character-scoped enable and disable", async () => {
  document.body.replaceChildren();
  intervals.clear();
  gameShell();
  runtime.settings.get = (id) => id === "assetHistory";
  await import("../src/features/asset-history/index.js");
  await runtime.features.handleCharacterData({ character: { id: "7" } });
  assert.equal(runtime.features.getStatus("assetHistory").status, "active");
  assert.equal(
    document.querySelectorAll("#mwitools-asset-history-tab").length,
    1,
  );

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await runtime.features.disable("assetHistory");
    assert.equal(document.querySelector("#mwitools-asset-history-tab"), null);
    assert.equal(document.querySelector("#mwitools-asset-history-panel"), null);
    await runtime.features.enable("assetHistory");
    assert.equal(
      document.querySelectorAll("#mwitools-asset-history-tab").length,
      1,
    );
    assert.equal(
      document.querySelectorAll("#mwitools-asset-history-panel").length,
      1,
    );
  }
  await runtime.features.disable("assetHistory");
});
