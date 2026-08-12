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
const { AssetCenter } =
  await import("../src/features/asset-history/25-center.js");
const {
  ASSET_SHARE_TEMPLATE_COUNT,
  buildAssetShareMessage,
  createAssetHistoryUi,
  pasteAssetShareToChat,
} = await import("../src/features/asset-history/30-panel.js");

function gameShell(labels = ["库存", "装备", "技能", "房屋", "配装"]) {
  const shell = document.createElement("main");
  shell.className = "CharacterManagement_characterManagement__test";
  shell.innerHTML = `
    <nav class="MuiTabs-flexContainer"><button role="tab" type="button" class="NavigationTabs_selected__test" aria-selected="true" data-active="true">${labels[0]}</button><button role="tab" type="button" aria-selected="false">${labels[1]}</button><button role="tab" type="button" aria-selected="false">${labels[2]}</button><button role="tab" type="button" id="house" aria-selected="false">${labels[3]}</button><button role="tab" type="button" id="loadout" aria-selected="false">${labels[4]} <span>0</span></button></nav>
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

test("P/L mounts beside character tabs in non-English game languages", () => {
  document.body.replaceChildren();
  intervals.clear();
  const shell = gameShell([
    "Inventario",
    "Equipo",
    "Habilidades",
    "Casa",
    "Configuraciones",
  ]);
  const scope = runtime.createCleanupScope();
  const ui = createAssetHistoryUi({
    scope,
    store: new AssetHistoryStore(localStorage),
    scopeKey: "production:7",
  });

  const tab = document.querySelector("#mwitools-asset-history-tab");
  assert.ok(tab);
  assert.equal(tab.previousElementSibling, shell.querySelector("#loadout"));
  assert.equal(tab.parentElement, shell.querySelector("nav"));

  ui.destroy();
  scope.cleanup();
});

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
  const assetStyles = document.querySelector(
    "#mwitools-asset-history-style",
  ).textContent;
  assert.match(assetStyles, /color:#00c6ff!important; font-weight:700/);
  assert.doesNotMatch(
    assetStyles,
    /#mwitools-asset-history-tab\[data-active="true"\][^}]*background/,
  );
  assert.match(
    assetStyles,
    /--mwi-asset-idle-background,rgba\(255,255,255,\.08\)/,
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
  assert.equal(tab.classList.contains("Mui-selected"), true);
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
  tab.click();
  assert.equal(tab.getAttribute("aria-selected"), "false");
  assert.equal(tab.classList.contains("Mui-selected"), false);
  assert.equal(nativeContent.hidden, false);
  tab.click();
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

  tab.click();
  houseTab.setAttribute("aria-selected", "false");
  inventoryTab.setAttribute("aria-selected", "true");
  for (const callback of intervals.values()) callback();
  assert.equal(tab.dataset.active, "false");
  assert.equal(nativeContent.hidden, false);

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

test("mobile remounts P/L when a different character-management panel becomes visible", () => {
  document.body.replaceChildren();
  intervals.clear();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 390,
  });
  const hiddenDesktopShell = gameShell();
  const scope = runtime.createCleanupScope();
  const ui = createAssetHistoryUi({
    scope,
    store: new AssetHistoryStore(localStorage),
    scopeKey: "production:7",
  });

  assert.equal(
    document.querySelector("#mwitools-asset-history-tab").parentElement,
    hiddenDesktopShell.querySelector("nav"),
  );

  const visibleMobileShell = gameShell();
  visibleMobileShell.querySelector("nav").getBoundingClientRect = () => ({
    width: 356,
    height: 24,
  });
  for (const callback of intervals.values()) callback();

  const tab = document.querySelector("#mwitools-asset-history-tab");
  assert.equal(tab.parentElement, visibleMobileShell.querySelector("nav"));
  assert.equal(
    tab.previousElementSibling,
    visibleMobileShell.querySelector("#loadout"),
  );
  assert.equal(
    hiddenDesktopShell.querySelector("#mwitools-asset-history-tab"),
    null,
  );
  assert.equal(
    document.querySelectorAll("#mwitools-asset-history-tab").length,
    1,
  );

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
  assert.equal(typeof runtime.api.assetHistory.insertDay, "function");
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

test("asset center opens from the native P/L tab and cleans up its modal", () => {
  document.body.replaceChildren();
  intervals.clear();
  const shell = gameShell();
  const scope = runtime.createCleanupScope();
  const store = new AssetHistoryStore(localStorage);
  store.setPreferences({ windowSize: { w: 980, h: 700 } });
  const ui = createAssetHistoryUi({ scope, store, scopeKey: "production:7" });

  document.querySelector("#mwitools-asset-history-tab").click();
  const openButton = document.querySelector("#mwi-asset-open-center");
  assert.equal(openButton.textContent, "打开资产中心");
  openButton.focus();
  openButton.click();
  let modal = document.querySelector("#mwitools-asset-center-modal");
  assert.equal(modal.hidden, false);
  assert.equal(document.body.dataset.mwitoolsAssetCenterOpen, "true");
  assert.equal(modal.querySelector(".ep-shell").style.width, "980px");
  assert.equal(modal.querySelector(".ep-shell").style.height, "700px");
  assert.ok(modal.querySelector('[data-route="analysis"]'));
  assert.ok(modal.querySelector('[data-route="achievements"]'));

  modal.querySelector('[data-route="stats"]').click();
  assert.match(modal.querySelector(".ep-top-title").textContent, /统计报表/);
  modal.querySelector('[data-report-mode="week"]').click();
  assert.equal(
    modal
      .querySelector('[data-report-mode="week"]')
      .classList.contains("active"),
    true,
  );
  modal.querySelector('[data-route="settings"]').click();
  const theme = modal.querySelector('[data-setting="themeMode"]');
  theme.value = "light";
  theme.dispatchEvent(new window.Event("change"));
  assert.equal(modal.classList.contains("ep-light"), true);

  modal.querySelector("[data-language]").click();
  modal = document.querySelector("#mwitools-asset-center-modal");
  assert.equal(
    document.querySelectorAll("#mwitools-asset-center-modal").length,
    1,
  );
  document.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape" }),
  );
  assert.equal(modal.hidden, true);
  assert.equal(document.body.dataset.mwitoolsAssetCenterOpen, undefined);
  assert.equal(document.activeElement, openButton);

  ui.destroy();
  scope.cleanup();
  assert.equal(document.querySelector("#mwitools-asset-center-modal"), null);
  shell.remove();
});

test("asset center keeps hidden component lines through live refreshes until close", () => {
  document.body.replaceChildren();
  localStorage.clear();
  const previousChart = globalThis.Chart;
  const canvasPrototype = window.HTMLCanvasElement.prototype;
  const previousGetContext = canvasPrototype.getContext;
  const chartInstances = [];
  canvasPrototype.getContext = () => ({});
  globalThis.Chart = class {
    constructor(_context, config) {
      this.data = config.data;
      this.options = config.options;
      this.visibility = config.data.datasets.map(
        (dataset) => dataset.hidden !== true,
      );
      chartInstances.push(this);
    }
    destroy() {}
    update() {}
    resetZoom() {}
    isDatasetVisible(index) {
      return this.visibility[index] ?? true;
    }
    setDatasetVisibility(index, visible) {
      this.visibility[index] = visible;
      this.data.datasets[index].hidden = !visible;
    }
  };

  const store = new AssetHistoryStore(localStorage);
  const scopeKey = "production:7";
  const values = (equipment) => ({
    equipment,
    inventory: 200,
    marketListings: 300,
    houses: 400,
    abilities: 500,
    nonTradableTokens: 600,
    shrine: 700,
  });
  store.updateDay("2026-08-12", values(1_200), scopeKey);
  store.updateDay("2026-08-13", values(800), scopeKey);
  const center = new AssetCenter({ store, scopeKey });

  try {
    center.open();
    center.chartMode = "breakdown";
    center.drawCenterChart();
    let activeChart = chartInstances.at(-1);
    activeChart.options.plugins.legend.onClick(
      null,
      { datasetIndex: 0 },
      { chart: activeChart },
    );
    assert.equal(activeChart.isDatasetVisible(0), false);

    center.update({ values: { ...values(750), total: 3_450 } });
    activeChart = chartInstances.at(-1);
    assert.equal(activeChart.data.datasets[0].hidden, true);

    center.close();
    center.open();
    activeChart = chartInstances.at(-1);
    assert.equal(activeChart.data.datasets[0].hidden, false);
  } finally {
    center.destroy();
    canvasPrototype.getContext = previousGetContext;
    if (previousChart === undefined) delete globalThis.Chart;
    else globalThis.Chart = previousChart;
  }
});

test("asset center inserts one editable record into a historical date gap", () => {
  document.body.replaceChildren();
  localStorage.clear();
  intervals.clear();
  const shell = gameShell();
  const scope = runtime.createCleanupScope();
  const store = new AssetHistoryStore(localStorage);
  const scopeKey = "production:7";
  const values = (equipment) => ({
    equipment,
    inventory: 200,
    marketListings: 300,
    houses: 400,
    abilities: 500,
    nonTradableTokens: 600,
    shrine: 700,
  });
  store.updateDay("2026-08-01", values(100), scopeKey);
  store.updateDay("2026-08-05", values(500), scopeKey);
  const ui = createAssetHistoryUi({ scope, store, scopeKey });

  document.querySelector("#mwitools-asset-history-tab").click();
  document.querySelector("#mwi-asset-open-center").click();
  const modal = document.querySelector("#mwitools-asset-center-modal");
  modal.querySelector('[data-route="data"]').click();
  let insertButtons = modal.querySelectorAll("[data-insert-after]");
  assert.equal(insertButtons.length, 1);
  assert.equal(insertButtons[0].dataset.insertAfter, "2026-08-01");
  assert.equal(insertButtons[0].dataset.insertBefore, "2026-08-05");
  assert.ok(insertButtons[0].nextElementSibling.matches("[data-edit-day]"));

  const dialog = modal.querySelector("[data-edit-dialog]");
  dialog.showModal = () => dialog.setAttribute("open", "");
  dialog.close = () => dialog.removeAttribute("open");
  insertButtons[0].click();
  const dateWrap = dialog.querySelector("[data-insert-date-wrap]");
  const dateInput = dialog.querySelector("[data-insert-date]");
  assert.equal(dateWrap.hidden, false);
  assert.equal(dateInput.min, "2026-08-02");
  assert.equal(dateInput.max, "2026-08-04");
  assert.equal(dateInput.value, "2026-08-02");
  assert.equal(
    dialog.querySelector('[data-edit-component="equipment"]').value,
    "100",
  );

  const alerts = [];
  const previousAlert = globalThis.alert;
  globalThis.alert = (message) => alerts.push(message);
  dateInput.value = "2026-08-05";
  dialog.querySelector("[data-edit-save]").click();
  assert.equal(store.getRole(scopeKey).days["2026-08-05"].inserted, undefined);
  assert.equal(dialog.hasAttribute("open"), true);
  assert.match(alerts.at(-1), /缺失日期/);

  dateInput.value = "2026-08-03";
  dialog.querySelector('[data-edit-component="equipment"]').value = "150";
  dialog.querySelector("[data-edit-save]").click();
  const inserted = store.getRole(scopeKey).days["2026-08-03"];
  assert.equal(inserted.values.equipment, 150);
  assert.equal(inserted.values.total, 2_850);
  assert.equal(inserted.inserted, true);
  insertButtons = modal.querySelectorAll("[data-insert-after]");
  assert.equal(insertButtons.length, 2);

  modal.querySelector('[data-edit-day="2026-08-03"]').click();
  assert.equal(dialog.dataset.mode, "edit");
  assert.equal(dateWrap.hidden, true);
  globalThis.alert = previousAlert;

  ui.destroy();
  scope.cleanup();
  shell.remove();
});
