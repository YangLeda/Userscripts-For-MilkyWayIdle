import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  '<!doctype html><html><head></head><body><div id="anchor">Chest</div></body></html>',
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
await import("../src/core/asset-values.js");
await import("../src/features/production-profit-panel.js");
await import("../src/features/item-tooltips.js");

const ITEM = {
  chest: "/items/test_dungeon_chest",
  unkeyed: "/items/unkeyed_chest",
  key: "/items/test_key",
  fragment: "/items/test_key_fragment",
  chimera: "/items/chimerical_token",
  task: "/items/task_token",
  labyrinth: "/items/labyrinth_token",
  rich: "/items/rich_reward",
  cheap: "/items/cheap_reward",
  shared: "/items/shared_reward",
  outside: "/items/outside_reward",
  junk: "/items/junk",
  inner: "/items/inner_chest",
  outer: "/items/outer_chest",
  loop: "/items/loop_chest",
  gift: "/items/self_gift",
  coin: "/items/coin",
};

runtime.state.initData_itemDetailMap = Object.fromEntries(
  Object.entries(ITEM).map(([name, itemHrid]) => [
    itemHrid,
    { hrid: itemHrid, name: name.replaceAll("_", " ") },
  ]),
);
runtime.state.initData_itemDetailMap[ITEM.chest].openKeyItemHrid = ITEM.key;
runtime.state.initData_openableLootDropMap = {
  [ITEM.chest]: [
    { itemHrid: ITEM.chimera, dropRate: 1, count: 10 },
    { itemHrid: ITEM.task, dropRate: 1, count: 5 },
    { itemHrid: ITEM.labyrinth, dropRate: 1, count: 2 },
    { itemHrid: ITEM.rich, dropRate: 0.1, count: 1 },
    { itemHrid: ITEM.cheap, dropRate: 0.2, count: 1 },
    { itemHrid: ITEM.shared, dropRate: 0.05, count: 1 },
    { itemHrid: ITEM.junk, dropRate: 0.5, count: 1 },
  ],
  [ITEM.unkeyed]: [{ itemHrid: ITEM.coin, dropRate: 1, count: 10 }],
  [ITEM.inner]: [{ itemHrid: ITEM.coin, dropRate: 1, count: 100 }],
  [ITEM.outer]: [{ itemHrid: ITEM.inner, dropRate: 0.5, count: 1 }],
  [ITEM.loop]: [
    { itemHrid: ITEM.loop, dropRate: 1, count: 1 },
    { itemHrid: ITEM.coin, dropRate: 1, count: 10 },
  ],
  [ITEM.gift]: [
    { itemHrid: ITEM.gift, dropRate: 0.2, count: 1 },
    { itemHrid: ITEM.coin, dropRate: 1, count: 10 },
  ],
};
runtime.state.initData_actionDetailMap = {
  key_recipe: {
    outputItems: [{ itemHrid: ITEM.key, count: 2 }],
    inputItems: [
      { itemHrid: ITEM.fragment, count: 5 },
      { itemHrid: ITEM.coin, count: 100 },
    ],
  },
};
runtime.state.initData_shopItemDetailMap = {
  rich: {
    itemHrid: ITEM.rich,
    cost: { itemHrid: ITEM.chimera, count: 4 },
  },
  cheap: {
    itemHrid: ITEM.cheap,
    costs: [{ itemHrid: ITEM.chimera, count: 1 }],
  },
  outside: {
    itemHrid: ITEM.outside,
    cost: { itemHrid: ITEM.chimera, count: 1 },
  },
};
runtime.state.initData_taskShopItemDetailMap = {
  shared: {
    itemHrid: ITEM.shared,
    cost: { itemHrid: ITEM.task, count: 2 },
  },
};
runtime.state.initData_labyrinthShopItemDetailMap = {
  shared: {
    itemHrid: ITEM.shared,
    cost: { itemHrid: ITEM.labyrinth, count: 5 },
  },
};

const askPrices = new Map([
  [ITEM.key, 300],
  [ITEM.fragment, 20],
  [ITEM.rich, 2_000],
  [ITEM.cheap, 450],
  [ITEM.shared, 900],
  [ITEM.outside, 20_000],
  [ITEM.inner, 1],
]);
const bidPrices = new Map([
  [ITEM.key, 240],
  [ITEM.fragment, 10],
  [ITEM.rich, 1_000],
  [ITEM.cheap, 400],
  [ITEM.shared, 600],
  [ITEM.outside, 10_000],
  [ITEM.inner, 1],
]);
runtime.api.getAskPrice = (itemHrid) => askPrices.get(itemHrid) ?? 0;
runtime.api.getBidPrice = (itemHrid) => bidPrices.get(itemHrid) ?? 0;
runtime.api.getMarketTaxRate = (itemHrid) =>
  [ITEM.rich, ITEM.cheap, ITEM.shared, ITEM.outside].includes(itemHrid)
    ? 0.1
    : 0;

function setLootSettings({ sellAtAsk, buyAtAsk, fromFragments }) {
  runtime.settings.settingsMap.lootSellAtAsk.isTrue = Boolean(sellAtAsk);
  runtime.settings.settingsMap.lootBuyAtAsk.isTrue = Boolean(buyAtAsk);
  runtime.settings.settingsMap.lootKeyFromFragments.isTrue =
    Boolean(fromFragments);
}

function ensureAnchor() {
  let anchor = document.querySelector("#anchor");
  if (!anchor) {
    anchor = document.createElement("div");
    anchor.id = "anchor";
    document.body.append(anchor);
  }
  return anchor;
}

test("loot projection weights drops and includes best token redemptions", () => {
  setLootSettings({
    sellAtAsk: false,
    buyAtAsk: true,
    fromFragments: false,
  });
  const chest = runtime.api.projectLootChest(ITEM.chest);
  assert.ok(chest);
  assert.equal(chest.redemptions.length, 3);
  const chimera = chest.redemptions.find(
    (route) => route.tokenItemHrid === ITEM.chimera,
  );
  assert.equal(chimera.rewardItemHrid, ITEM.cheap);
  assert.equal(chimera.valuePerToken, 360);
  const tokenDrop = chest.drops.find((drop) => drop.itemHrid === ITEM.chimera);
  assert.equal(tokenDrop.valueSource, "redemption");
  assert.equal(tokenDrop.unitValue, 360);
  const shared = chest.drops.find((drop) => drop.itemHrid === ITEM.shared);
  assert.equal(shared.redemptions.length, 2);
  assert.equal(chest.grossValue, 5_355);
  assert.equal(chest.keyCost, 300);
  assert.equal(chest.netValue, 5_055);
  assert.deepEqual(chest.missing, [ITEM.junk]);
});

test("sell-side changes can select a different best redemption", () => {
  setLootSettings({
    sellAtAsk: true,
    buyAtAsk: true,
    fromFragments: false,
  });
  const chest = runtime.api.projectLootChest(ITEM.chest);
  const chimera = chest.redemptions.find(
    (route) => route.tokenItemHrid === ITEM.chimera,
  );
  assert.equal(chimera.rewardItemHrid, ITEM.rich);
  assert.equal(chimera.valuePerToken, 450);
  assert.equal(chest.grossValue, 7_150.5);
  assert.equal(
    chest.drops.find((drop) => drop.itemHrid === ITEM.rich).redemptions.length,
    1,
  );
  assert.equal(
    chest.drops.find((drop) => drop.itemHrid === ITEM.outside),
    undefined,
  );
});

test("fragment crafting uses the actual recipe and never falls back silently", () => {
  setLootSettings({
    sellAtAsk: false,
    buyAtAsk: true,
    fromFragments: true,
  });
  const crafted = runtime.api.projectLootChest(ITEM.chest);
  assert.equal(crafted.keySource, "fragments");
  assert.equal(crafted.keyCost, 100);
  assert.equal(crafted.keyComplete, true);

  setLootSettings({
    sellAtAsk: false,
    buyAtAsk: false,
    fromFragments: true,
  });
  const craftedAtBid = runtime.api.projectLootChest(ITEM.chest);
  assert.equal(craftedAtBid.keyCost, 75);
  setLootSettings({
    sellAtAsk: false,
    buyAtAsk: true,
    fromFragments: true,
  });

  askPrices.delete(ITEM.fragment);
  const missing = runtime.api.projectLootChest(ITEM.chest);
  assert.equal(missing.keyComplete, false);
  assert.equal(missing.netValue, null);
  assert.ok(missing.missing.includes(ITEM.fragment));
  askPrices.set(ITEM.fragment, 20);
});

test("nested chests recurse while self-references terminate", () => {
  setLootSettings({
    sellAtAsk: false,
    buyAtAsk: true,
    fromFragments: false,
  });
  const outer = runtime.api.projectLootChest(ITEM.outer);
  assert.equal(outer.grossValue, 50);
  assert.equal(outer.netValue, 50);
  assert.equal(outer.drops[0].nested, true);

  const loop = runtime.api.projectLootChest(ITEM.loop);
  assert.equal(loop.grossValue, 10);
  assert.equal(loop.complete, false);
  assert.ok(loop.missing.includes(ITEM.loop));

  const gift = runtime.api.projectLootChest(ITEM.gift);
  assert.equal(gift.grossValue, 12.5);
  assert.equal(gift.netValue, 12.5);
  assert.equal(gift.complete, true);
  const repeatedGift = gift.drops.find((drop) => drop.itemHrid === ITEM.gift);
  assert.equal(repeatedGift.nested, true);
  assert.equal(repeatedGift.unitValue, 12.5);
});

test("hover is read-only and pinned panels expose synchronized switches", async () => {
  setLootSettings({
    sellAtAsk: false,
    buyAtAsk: true,
    fromFragments: false,
  });
  const anchor = ensureAnchor();
  const hover = runtime.api.showLootChestPanel(anchor, ITEM.chest);
  assert.ok(hover);
  assert.equal(hover.querySelectorAll(".mwi-loot-switch").length, 0);
  assert.equal(hover.querySelectorAll(".mwi-loot-best-badge").length, 2);

  assert.equal(runtime.api.pinActiveLootChestPanel(), true);
  let panel = document.querySelector("#mwitools-production-profit-panel");
  assert.ok(panel.classList.contains("mwi-profit-pinned"));
  assert.equal(panel.querySelectorAll(".mwi-loot-switch").length, 3);
  assert.ok(panel.querySelector(".mwi-loot-controls.has-key"));
  assert.equal(panel.parentElement, document.body);

  const sellToggle = panel.querySelector(
    'input[data-mwi-loot-setting="lootSellAtAsk"]',
  );
  sellToggle.checked = true;
  sellToggle.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await Promise.resolve();
  panel = document.querySelector("#mwitools-production-profit-panel");
  assert.equal(runtime.settings.settingsMap.lootSellAtAsk.isTrue, true);
  assert.ok(
    panel
      .querySelector(`[data-item-hrid="${ITEM.rich}"]`)
      .classList.contains("best-redemption"),
  );

  anchor.remove();
  assert.ok(document.querySelector("#mwitools-production-profit-panel"));
  panel
    .querySelector("[data-mwi-loot-close]")
    .dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  assert.equal(
    document.querySelector("#mwitools-production-profit-panel"),
    null,
  );
});

test("pinned panels close on outside clicks and when the main setting is disabled", async () => {
  setLootSettings({
    sellAtAsk: false,
    buyAtAsk: true,
    fromFragments: false,
  });
  runtime.api.showLootChestPanel(ensureAnchor(), ITEM.chest, { pinned: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  document.body.dispatchEvent(
    new dom.window.MouseEvent("mousedown", { bubbles: true }),
  );
  assert.equal(
    document.querySelector("#mwitools-production-profit-panel"),
    null,
  );

  runtime.api.showLootChestPanel(ensureAnchor(), ITEM.chest, { pinned: true });
  await runtime.settings.set("lootChestEstimate", false);
  assert.equal(
    document.querySelector("#mwitools-production-profit-panel"),
    null,
  );
  await runtime.settings.set("lootChestEstimate", true);
});

test("unkeyed pinned panels hide irrelevant key switches", () => {
  setLootSettings({
    sellAtAsk: false,
    buyAtAsk: true,
    fromFragments: false,
  });
  const panel = runtime.api.showLootChestPanel(ensureAnchor(), ITEM.unkeyed, {
    pinned: true,
  });
  assert.equal(panel.querySelectorAll(".mwi-loot-switch").length, 1);
  assert.match(panel.textContent, /无需钥匙/);
  runtime.api.hideProductionProfitPanel();
});

test("openable item tooltips route to the loot panel", async () => {
  runtime.api.hideProductionProfitPanel();
  localStorage.setItem("i18nextLng", "en");
  runtime.config.isZH = false;
  runtime.state.itemEnNameToHridMap["test dungeon chest"] = ITEM.chest;
  runtime.api.getOriTextFromElement = (element) => element?.textContent ?? "";
  runtime.settings.settingsMap.itemTooltip_prices.isTrue = false;
  runtime.settings.settingsMap.itemTooltip_profit.isTrue = true;
  runtime.settings.settingsMap.showConsumTips.isTrue = false;
  runtime.settings.settingsMap.lootChestEstimate.isTrue = true;

  const tooltip = document.createElement("div");
  tooltip.className = "MuiTooltip-popper";
  tooltip.style.transform = "translate3d(0px, 0px, 0px)";
  tooltip.innerHTML =
    '<div class="ItemTooltipText_name__2JAHA"><span>test dungeon chest</span></div><div class="separator"></div>';
  document.body.append(tooltip);
  await runtime.api.handleTooltipItem(tooltip);
  const panel = document.querySelector("#mwitools-production-profit-panel");
  assert.ok(panel);
  assert.equal(panel.previousElementSibling, tooltip);
  assert.match(panel.textContent, /Opening estimate/);

  runtime.api.hideProductionProfitPanel();
  tooltip.remove();
  localStorage.setItem("i18nextLng", "zh-CN");
  runtime.config.isZH = true;
  runtime.settings.settingsMap.itemTooltip_prices.isTrue = true;
  runtime.settings.settingsMap.showConsumTips.isTrue = true;
});
