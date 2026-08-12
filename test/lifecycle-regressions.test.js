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
await import("../src/features/navigation-action-queue.js");
await import("../src/features/legacy-lifecycle.js");
await import("../src/features/item-tooltips.js");

after(async () => {
  for (const { id } of runtime.features.list()) {
    await runtime.features.disable(id);
  }
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

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
