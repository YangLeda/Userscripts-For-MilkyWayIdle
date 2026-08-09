import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.window = dom.window;

localStorage.setItem(
  "script_settingsMap",
  JSON.stringify({
    legacyOrange: { id: "useOrangeAsMainColor", isTrue: true },
    legacyChinese: { id: "forceMWIToolsDisplayZH", isTrue: true },
    removedOption: { id: "removed_option", isTrue: true },
  }),
);

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/features/settings-and-notifications.js");

test("legacy settings merge into current defaults", () => {
  assert.doesNotThrow(() => runtime.api.readSettings());
  assert.equal(runtime.settings.settingsMap.useOrangeAsMainColor.isTrue, true);
  assert.equal(
    runtime.settings.settingsMap.forceMWIToolsDisplayZH.isTrue,
    true,
  );
  assert.equal(runtime.config.isZH, true);
  assert.equal(runtime.config.SCRIPT_COLOR_MAIN, "orange");
  assert.equal(runtime.config.SCRIPT_COLOR_TOOLTIP, "#804600");
  assert.equal(runtime.settings.settingsMap.totalActionTime.isTrue, true);
});

test("market autofill selects semantic plus and minus buttons", () => {
  runtime.api.getOriTextFromElement = (element) => element?.textContent ?? "";
  document.body.innerHTML = `
    <div id="market-order">
      <div class="MarketplacePanel_header__yahJo">Limit Order</div>
      <div id="best-label">Best Buy <span class="MarketplacePanel_bestPrice__3bgKp">Best</span></div>
      <div class="MarketplacePanel_inputContainer__3xmB2">
        <div class="MarketplacePanel_priceInputs__3iWxy">
          <div class="MarketplacePanel_buttonContainer__vJQud"><button>Min</button></div>
          <div class="MarketplacePanel_buttonContainer__vJQud"><button id="minus">−</button></div>
          <div class="MarketplacePanel_buttonContainer__vJQud"><button id="plus">+</button></div>
          <div class="MarketplacePanel_buttonContainer__vJQud"><button>Max</button></div>
        </div>
      </div>
    </div>`;
  const order = document.querySelector("#market-order");
  let plusClicks = 0;
  let minusClicks = 0;
  document.querySelector("#plus").addEventListener("click", () => plusClicks++);
  document
    .querySelector("#minus")
    .addEventListener("click", () => minusClicks++);

  runtime.api.handleMarketNewOrder(order);
  document.querySelector("#best-label").firstChild.textContent = "Best Sell ";
  runtime.api.handleMarketNewOrder(order);

  assert.equal(plusClicks, 1);
  assert.equal(minusClicks, 1);
});
