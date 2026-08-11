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
const {
  ASSET_SHARE_TEMPLATE_COUNT,
  buildAssetShareMessage,
  createAssetHistoryUi,
  pasteAssetShareToChat,
} = await import("../src/features/asset-history/30-panel.js");

function gameShell() {
  const shell = document.createElement("main");
  shell.className = "CharacterManagement_characterManagement__test";
  shell.innerHTML = `
    <nav class="MuiTabs-flexContainer"><button role="tab" type="button" class="NavigationTabs_selected__test" aria-selected="true" data-active="true">库存</button><button role="tab" type="button" aria-selected="false">装备</button><button role="tab" type="button" aria-selected="false">技能</button><button role="tab" type="button" id="house" aria-selected="false">房屋</button><button role="tab" type="button" id="loadout" aria-selected="false">配装 <span>0</span></button></nav>
    <section class="Inventory_panel__test"><input placeholder="物品搜索"></section>
  `;
  const nativeTabs = [...shell.querySelectorAll('button[role="tab"]')];
  for (const button of nativeTabs) {
    button.addEventListener("click", () => {
      for (const candidate of nativeTabs) {
        const selected = candidate === button;
        candidate.setAttribute("aria-selected", String(selected));
        candidate.dataset.active = String(selected);
        candidate.classList.toggle("NavigationTabs_selected__test", selected);
      }
    });
  }
  document.body.appendChild(shell);
  return shell;
}

test("asset sharing provides separate Chinese and English profit/loss phrases", () => {
  assert.ok(ASSET_SHARE_TEMPLATE_COUNT >= 10);
  const pools = [];
  for (const isZH of [true, false]) {
    runtime.config.isZH = isZH;
    const profitMessages = new Set(
      Array.from({ length: ASSET_SHARE_TEMPLATE_COUNT }, (_, index) =>
        buildAssetShareMessage(
          { change: 234_567, percent: 12.5, gapDays: 1 },
          index,
        ),
      ),
    );
    const lossMessages = new Set(
      Array.from({ length: ASSET_SHARE_TEMPLATE_COUNT }, (_, index) =>
        buildAssetShareMessage(
          { change: -234_567, percent: -12.5, gapDays: 1 },
          index,
        ),
      ),
    );
    assert.equal(profitMessages.size, ASSET_SHARE_TEMPLATE_COUNT);
    assert.equal(lossMessages.size, ASSET_SHARE_TEMPLATE_COUNT);
    assert.equal(
      [...profitMessages].some((message) => lossMessages.has(message)),
      false,
    );
    for (const message of [...profitMessages, ...lossMessages]) {
      assert.match(message, /234,567/);
      assert.match(message, /12\.50%/);
    }
    pools.push(profitMessages);
  }
  runtime.config.isZH = true;

  document.body.replaceChildren();
  const input = document.createElement("input");
  input.className = "Chat_chatInput__test";
  input.value = "old draft";
  document.body.append(input);
  const observedValues = [];
  input.addEventListener("input", () => observedValues.push(input.value));
  const message = [...pools[0]][0];
  assert.equal(pasteAssetShareToChat(message), input);
  assert.deepEqual(observedValues, ["", message]);
  assert.equal(input.value, message);
  assert.equal(document.activeElement, input);
});

test("盈亏 visually suppresses native selection without mutating React tab state", () => {
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
  assert.equal(
    document.querySelector("#mwi-asset-share-chat").textContent,
    "炫耀",
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
  const inventoryTab = shell.querySelector("nav button");
  assert.equal(tab.getAttribute("aria-selected"), "true");
  assert.equal(inventoryTab.getAttribute("aria-selected"), "true");
  assert.equal(inventoryTab.dataset.active, "true");
  assert.equal(
    inventoryTab.classList.contains("NavigationTabs_selected__test"),
    true,
  );
  assert.equal(shell.querySelector("nav").dataset.mwitoolsAssetActive, "true");
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
  const houseTab = shell.querySelector("#house");
  houseTab.click();
  assert.equal(houseTab.getAttribute("aria-selected"), "true");
  assert.equal(inventoryTab.getAttribute("aria-selected"), "false");
  assert.equal(
    houseTab.classList.contains("NavigationTabs_selected__test"),
    true,
  );
  assert.equal(
    shell.querySelector("nav").dataset.mwitoolsAssetActive,
    undefined,
  );
  assert.equal(tab.dataset.active, "false");
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

test("mobile mounts P/L beside the visible character-management tabs", () => {
  document.body.replaceChildren();
  intervals.clear();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 390,
  });
  const decoy = document.createElement("div");
  decoy.innerHTML = `<nav><button role="tab">库存</button><button role="tab">装备</button><button role="tab">技能</button><button role="tab">房屋</button><button role="tab" id="decoy-loadout">配装</button></nav><section class="Loadout_panel__test"></section>`;
  document.body.appendChild(decoy);
  const shell = gameShell();
  const scope = runtime.createCleanupScope();
  const ui = createAssetHistoryUi({
    scope,
    store: new AssetHistoryStore(localStorage),
    scopeKey: "production:7",
  });

  const tab = document.querySelector("#mwitools-asset-history-tab");
  const panel = document.querySelector("#mwitools-asset-history-panel");
  assert.ok(tab);
  assert.equal(tab.parentElement, shell.querySelector("nav"));
  assert.equal(tab.previousElementSibling, shell.querySelector("#loadout"));
  assert.notEqual(
    tab.previousElementSibling,
    decoy.querySelector("#decoy-loadout"),
  );
  assert.equal(
    document.querySelector("#mwitools-asset-history-mobile-button"),
    null,
  );
  assert.equal(panel.hidden, true);

  tab.click();
  assert.equal(panel.hidden, false);
  assert.match(panel.style.height, /100dvh/);
  assert.match(
    document.querySelector("#mwitools-asset-history-style").textContent,
    /touch-action:pan-y/,
  );
  document.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape" }),
  );
  assert.equal(panel.hidden, true);

  ui.destroy();
  scope.cleanup();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1024,
  });
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
