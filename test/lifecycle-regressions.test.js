import assert from "node:assert/strict";
import test, { after } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  {
    url: "https://www.milkywayidle.com/",
  },
);
Object.assign(globalThis, {
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  location: dom.window.location,
  MutationObserver: dom.window.MutationObserver,
  window: dom.window,
});
globalThis.GM_addStyle = (css) => {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  return style;
};

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/core/state.js");
await import("../src/features/settings-and-notifications.js");
await import("../src/features/navigation-action-queue.js");
await import("../src/features/legacy-lifecycle.js");
await import("../src/features/item-tooltips.js");

after(async () => {
  for (const { id } of runtime.features.list()) {
    await runtime.features.disable(id);
  }
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 40));
runtime.state.initData_characterItems = [];

test("disabling queue timing disconnects observers that could recreate output", async () => {
  runtime.state.initData_actionDetailMap = {
    "/actions/crafting/current": { baseTimeCost: 10_000_000_000 },
    "/actions/crafting/queued": { baseTimeCost: 10_000_000_000 },
  };
  runtime.state.currentActionsHridList = [
    {
      actionHrid: "/actions/crafting/current",
      maxCount: 2,
      currentCount: 1,
    },
    {
      actionHrid: "/actions/crafting/queued",
      maxCount: 3,
      currentCount: 0,
    },
  ];
  runtime.api.getTotalEffiPercentage = () => 0;
  runtime.api.getToolsSpeedBuffByActionHrid = () => 0;
  runtime.api.timeReadable = () => "30s";
  await runtime.features.handleCharacterData({ character: { id: 1 } });
  await runtime.settings.set("actionQueue", true, {
    persist: false,
    force: true,
  });

  document.body.innerHTML = `
    <div id="host">
      <div class="QueuedActions_queuedActionsEditMenu__3OoQH">
        <div class="QueuedActions_actions__2Lur6">
          <div class="QueuedActions_action__r3HlD"><div></div></div>
        </div>
      </div>
    </div>`;
  const menu = document.querySelector(
    ".QueuedActions_queuedActionsEditMenu__3OoQH",
  );
  const list = menu.querySelector(".QueuedActions_actions__2Lur6");
  runtime.api.handleActionQueueMenue(menu);
  assert.ok(document.querySelector(".script_actionTime"));
  assert.ok(document.querySelector("#script_queueTotalTime"));

  await runtime.settings.set("actionQueue", false, { persist: false });
  assert.equal(document.querySelector(".script_actionTime"), null);
  assert.equal(document.querySelector("#script_queueTotalTime"), null);
  list.append(document.createElement("span"));
  await settle();
  assert.equal(document.querySelector(".script_actionTime"), null);
  assert.equal(document.querySelector("#script_queueTotalTime"), null);
});

test("tooltip observer ignores text nodes added to the page", async () => {
  const errors = [];
  const onError = (event) => {
    errors.push(event.error ?? event.message);
    event.preventDefault();
  };
  window.addEventListener("error", onError);
  await runtime.features.enable("itemTooltip_prices");
  document.body.append(document.createTextNode("plain text mutation"));
  await settle();
  await runtime.features.disable("itemTooltip_prices");
  window.removeEventListener("error", onError);
  assert.deepEqual(errors, []);
});

test("profit tooltips require the configured key in either hover order", async () => {
  const calls = [];
  const originalShow = runtime.api.showProductionProfitPanel;
  const originalDismiss = runtime.api.dismissHoverPanel;
  runtime.api.showProductionProfitPanel = (anchor, itemHrid, options) => {
    calls.push({ type: "show", anchor, itemHrid, options });
    return {};
  };
  runtime.api.dismissHoverPanel = () => calls.push({ type: "dismiss" });
  runtime.api.setTooltipProfitShortcut({ code: "Control", display: "Ctrl" });
  runtime.settings.settingsMap.itemTooltip_profitRequireKey.isTrue = true;
  runtime.settings.settingsMap.itemTooltip_profit.isTrue = true;
  runtime.state.initData_actionDetailMap = {
    "/actions/foraging/key-test": {
      hrid: "/actions/foraging/key-test",
      type: "/action_types/foraging",
    },
  };
  const card = document.createElement("div");
  card.className = "SkillAction_skillAction__fixture";
  card.__reactFiber$keyTest = {
    memoizedProps: {
      actionDetail:
        runtime.state.initData_actionDetailMap["/actions/foraging/key-test"],
    },
  };
  const input = document.createElement("input");
  document.body.replaceChildren(card, input);
  await runtime.features.enable("itemTooltip_profit");

  card.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true }));
  assert.equal(
    calls.some((call) => call.type === "show"),
    false,
  );
  window.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key: "Control",
      code: "ControlLeft",
      bubbles: true,
    }),
  );
  assert.equal(calls.filter((call) => call.type === "show").length, 1);
  window.dispatchEvent(
    new dom.window.KeyboardEvent("keyup", {
      key: "Control",
      code: "ControlLeft",
      bubbles: true,
    }),
  );

  card.dispatchEvent(new dom.window.MouseEvent("mouseout", { bubbles: true }));
  calls.length = 0;
  window.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key: "Control",
      code: "ControlLeft",
      bubbles: true,
    }),
  );
  card.dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true }));
  assert.equal(calls.filter((call) => call.type === "show").length, 1);
  window.dispatchEvent(
    new dom.window.KeyboardEvent("keyup", {
      key: "Control",
      code: "ControlLeft",
      bubbles: true,
    }),
  );

  calls.length = 0;
  input.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key: "Control",
      code: "ControlLeft",
      bubbles: true,
    }),
  );
  assert.equal(
    calls.some((call) => call.type === "show"),
    false,
  );

  const touchEvent = (type, x, y) => {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
    });
    Object.defineProperties(event, {
      pointerType: { value: "touch" },
      pointerId: { value: 7 },
    });
    return event;
  };
  calls.length = 0;
  card.dispatchEvent(touchEvent("pointerdown", 10, 10));
  await new Promise((resolve) => setTimeout(resolve, 820));
  assert.equal(calls.filter((call) => call.type === "show").length, 1);
  assert.equal(calls.find((call) => call.type === "show").options.sticky, true);
  card.dispatchEvent(touchEvent("pointerup", 10, 10));
  assert.equal(
    calls.some((call) => call.type === "dismiss"),
    false,
  );

  calls.length = 0;
  card.dispatchEvent(touchEvent("pointerdown", 10, 10));
  card.dispatchEvent(touchEvent("pointermove", 40, 40));
  await new Promise((resolve) => setTimeout(resolve, 820));
  assert.equal(
    calls.some((call) => call.type === "show"),
    false,
  );

  await runtime.features.disable("itemTooltip_profit");
  runtime.api.showProductionProfitPanel = originalShow;
  runtime.api.dismissHoverPanel = originalDismiss;
});
