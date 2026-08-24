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
await import("../src/core/action-projection.js");
await import("../src/core/message-state.js");
await import("../src/core/messages.js");
await import("../src/features/settings-and-notifications.js");
await import("../src/features/navigation-action-queue.js");
await import("../src/features/legacy-lifecycle.js");
const { clearEnhancementHoverPanelContext, setEnhancementHoverPanelContext } =
  await import("../src/features/item-tooltips.js");

after(async () => {
  for (const { id } of runtime.features.list()) {
    await runtime.features.disable(id);
  }
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 40));
runtime.state.initData_characterItems = [];

test("inventory lifecycle restores a summary removed beside a reused inventory node", async () => {
  const originalSchedule = runtime.api.scheduleNetworthRefresh;
  let refreshes = 0;
  runtime.api.scheduleNetworthRefresh = () => {
    refreshes += 1;
  };
  runtime.settings.settingsMap.invWorth.isTrue = true;
  await runtime.features.handleCharacterData({ character: { id: 1 } });
  await runtime.features.restart("invWorth");

  document.body.innerHTML = `
    <section>
      <div id="script_inventory_summary"></div>
      <div class="Inventory_items__fixture script_buildScore_added">
        <div class="Inventory_itemGrid__fixture"></div>
      </div>
    </section>`;
  refreshes = 0;
  document.querySelector("#script_inventory_summary").remove();
  await settle();

  assert.ok(refreshes >= 1);
  await runtime.features.disable("invWorth");
  runtime.api.scheduleNetworthRefresh = originalSchedule;
});

test("disabling queue timing disconnects observers that could recreate output", async () => {
  runtime.state.initData_characterSkills = [];
  runtime.state.initData_actionTypeDrinkSlotsMap = {
    "/action_types/crafting": [],
  };
  runtime.state.initData_actionDetailMap = {
    "/actions/crafting/current": {
      type: "/action_types/crafting",
      baseTimeCost: 10_000_000_000,
      outputItems: [],
      inputItems: [],
    },
    "/actions/crafting/queued": {
      type: "/action_types/crafting",
      baseTimeCost: 10_000_000_000,
      outputItems: [],
      inputItems: [],
    },
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

test("queue timing mounts while hover prices are disabled", async () => {
  await runtime.settings.set("itemTooltip_prices", false, {
    persist: false,
    force: true,
  });
  await runtime.settings.set("actionQueue", true, {
    persist: false,
    force: true,
  });
  document.body.replaceChildren();
  const popper = document.createElement("div");
  popper.className = "MuiTooltip-popper";
  popper.innerHTML = `
    <div class="QueuedActions_queuedActionsEditMenu__3OoQH">
      <div class="QueuedActions_actions__2Lur6">
        <div class="QueuedActions_action__r3HlD"><div></div></div>
      </div>
    </div>`;
  document.body.append(popper);
  await settle();
  assert.ok(document.querySelector(".script_actionTime"));
  assert.ok(document.querySelector("#script_queueTotalTime"));
  await runtime.settings.set("actionQueue", false, { persist: false });
  await runtime.settings.set("itemTooltip_prices", true, { persist: false });
});

test("queued action timing uses community speed and total efficiency", () => {
  const originalLanguage = runtime.config.isZH;
  runtime.config.isZH = true;
  runtime.settings.settingsMap.actionQueue.isTrue = true;
  runtime.state.initData_characterSkills = [];
  runtime.state.initData_actionTypeDrinkSlotsMap = {
    "/action_types/crafting": [],
  };
  runtime.state.currentEquipmentMap = {};
  runtime.state.actionTypeBuffSources = {
    communityActionTypeBuffsMap: {
      "/action_types/crafting": [
        { typeHrid: "/buff_types/action_speed", flatBoost: 0.25 },
      ],
    },
  };
  runtime.state.initData_actionDetailMap = {
    "/actions/crafting/current": {
      type: "/action_types/crafting",
      baseTimeCost: 10_000_000_000,
      outputItems: [],
    },
    "/actions/crafting/queued": {
      type: "/action_types/crafting",
      baseTimeCost: 10_000_000_000,
      outputItems: [],
    },
  };
  runtime.state.currentActionsHridList = [
    {
      actionHrid: "/actions/crafting/current",
      maxCount: 1,
      currentCount: 0,
    },
    {
      actionHrid: "/actions/crafting/queued",
      maxCount: 4,
      currentCount: 0,
    },
  ];
  runtime.api.getTotalEffiPercentage = () => 100;
  runtime.api.timeReadable = (seconds) => `${seconds}s`;
  document.body.innerHTML = `<div class="QueuedActions_queuedActionsEditMenu__3OoQH"><div class="QueuedActions_actions__2Lur6"><div class="QueuedActions_action__r3HlD"><div></div></div></div></div>`;

  const menu = document.querySelector(
    ".QueuedActions_queuedActionsEditMenu__3OoQH",
  );
  try {
    runtime.api.handleActionQueueMenueCalculateTime(menu);
    assert.match(
      document.querySelector(".script_actionTime").textContent,
      /^16秒（\d{2}:\d{2}:\d{2}）$/,
    );
    assert.match(
      document.querySelector("#script_queueTotalTime").textContent,
      /^总时间：20秒（\d{2}:\d{2}:\d{2}）$/,
    );
  } finally {
    runtime.config.isZH = originalLanguage;
    runtime.api.disconnectActionQueueObserver();
  }
});

test("queue totals keep the finite prefix and stop at the first infinity", () => {
  runtime.config.isZH = true;
  runtime.settings.settingsMap.actionQueue.isTrue = true;
  runtime.state.initData_characterSkills = [];
  runtime.state.initData_characterItems = [];
  runtime.state.initData_actionTypeDrinkSlotsMap = {
    "/action_types/crafting": [],
  };
  runtime.state.actionTypeBuffSources = {};
  runtime.api.getTotalEffiPercentage = () => 0;
  runtime.api.getToolsSpeedBuffByActionHrid = () => 0;
  runtime.state.initData_actionDetailMap = Object.fromEntries(
    ["current", "queued", "infinite", "unreachable"].map((name) => [
      `/actions/crafting/${name}`,
      {
        type: "/action_types/crafting",
        baseTimeCost: 60_000_000_000,
        outputItems: [],
      },
    ]),
  );
  runtime.state.currentActionsHridList = [
    {
      id: "current",
      ordinal: 0,
      actionHrid: "/actions/crafting/current",
      maxCount: 90,
      currentCount: 0,
    },
    {
      id: "queued",
      ordinal: 1,
      actionHrid: "/actions/crafting/queued",
      maxCount: 10,
      currentCount: 0,
    },
    {
      id: "infinite",
      ordinal: 2,
      actionHrid: "/actions/crafting/infinite",
      maxCount: 0,
      currentCount: 0,
    },
    {
      id: "unreachable",
      ordinal: 3,
      actionHrid: "/actions/crafting/unreachable",
      maxCount: 5,
      currentCount: 0,
    },
  ];
  document.body.innerHTML = `<div><div class="QueuedActions_queuedActionsEditMenu__3OoQH"><div class="QueuedActions_actions__2Lur6">${'<div class="QueuedActions_action__r3HlD"><div></div></div>'.repeat(3)}</div></div></div>`;
  const menu = document.querySelector(
    ".QueuedActions_queuedActionsEditMenu__3OoQH",
  );
  const rows = menu.querySelectorAll(".QueuedActions_action__r3HlD");
  const stale = document.createElement("div");
  stale.className = "script_actionTime";
  stale.textContent = "stale";
  rows[2].firstElementChild.append(stale);

  runtime.api.handleActionQueueMenueCalculateTime(menu);

  assert.equal(
    document.querySelector("#script_queueTotalTime").textContent,
    "总时间：1小时40分 + ∞",
  );
  assert.match(
    rows[0].querySelector(".script_actionTime").textContent,
    /^10分/,
  );
  assert.equal(rows[1].querySelector(".script_actionTime").textContent, "∞");
  assert.match(
    rows[2].querySelector(".script_actionTime").textContent,
    /前序动作无限|After an infinite action/,
  );

  runtime.state.currentActionsHridList = [
    {
      id: "infinite",
      ordinal: 0,
      actionHrid: "/actions/crafting/infinite",
      maxCount: 0,
      currentCount: 0,
    },
    {
      id: "queued",
      ordinal: 1,
      actionHrid: "/actions/crafting/queued",
      maxCount: 10,
      currentCount: 0,
    },
  ];
  rows[2].remove();
  rows[1].remove();
  runtime.api.handleActionQueueMenueCalculateTime(menu);
  assert.equal(
    document.querySelector("#script_queueTotalTime").textContent,
    "总时间：∞",
  );
  assert.match(
    rows[0].querySelector(".script_actionTime").textContent,
    /前序动作无限|After an infinite action/,
  );
});

test("a progressed infinite action stays infinite after a finite action moves ahead", () => {
  runtime.config.isZH = true;
  runtime.state.currentActionsHridList = [
    {
      id: "infinite",
      ordinal: 1,
      actionHrid: "/actions/crafting/infinite",
      hasMaxCount: false,
      maxCount: 0,
      currentCount: 5,
    },
    {
      id: "finite",
      actionHrid: "/actions/crafting/queued",
      hasMaxCount: true,
      maxCount: 10,
      currentCount: 0,
    },
  ];
  document.body.innerHTML = `<div><div class="QueuedActions_queuedActionsEditMenu__3OoQH"><div class="QueuedActions_actions__2Lur6"><div class="QueuedActions_action__r3HlD"><div></div></div></div></div></div>`;
  const menu = document.querySelector(
    ".QueuedActions_queuedActionsEditMenu__3OoQH",
  );

  runtime.api.handleActionQueueMenueCalculateTime(menu);

  assert.equal(menu.querySelector(".script_actionTime").textContent, "∞");
  assert.equal(
    document.querySelector("#script_queueTotalTime").textContent,
    "总时间：10分 + ∞",
  );
});

test("open queue timing refreshes after an actions_updated reorder", async () => {
  runtime.settings.settingsMap.actionQueue.isTrue = true;
  runtime.state.currentActionsHridList = [
    {
      id: 1,
      ordinal: 0,
      actionHrid: "/actions/crafting/current",
      maxCount: 1,
      currentCount: 0,
    },
    {
      id: 2,
      ordinal: 1,
      actionHrid: "/actions/crafting/queued",
      maxCount: 2,
      currentCount: 0,
    },
    {
      id: 3,
      ordinal: 2,
      actionHrid: "/actions/crafting/unreachable",
      maxCount: 3,
      currentCount: 0,
    },
  ];
  document.body.innerHTML = `<div><div class="QueuedActions_queuedActionsEditMenu__3OoQH"><div class="QueuedActions_actions__2Lur6"><div class="QueuedActions_action__r3HlD"><div></div></div><div class="QueuedActions_action__r3HlD"><div></div></div></div></div></div>`;
  const menu = document.querySelector(
    ".QueuedActions_queuedActionsEditMenu__3OoQH",
  );
  const list = menu.querySelector(".QueuedActions_actions__2Lur6");
  runtime.api.handleActionQueueMenue(menu);
  assert.match(list.children[0].textContent, /^2分/);

  list.insertBefore(list.children[1], list.children[0]);
  runtime.api.handleMessage(
    JSON.stringify({
      type: "actions_updated",
      endCharacterActions: [
        { id: "2", ordinal: 2 },
        { id: "3", ordinal: 1 },
      ],
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 130));

  assert.match(list.children[0].textContent, /^3分/);
  assert.match(list.children[1].textContent, /^2分/);
  assert.equal(runtime.state.currentActionsHridList.length, 3);
  runtime.api.disconnectActionQueueObserver();
});

test("queued action timing marks multi-day finishes with the shared format", () => {
  const originalNow = Date.now;
  const originalLanguage = runtime.config.isZH;
  const originalEfficiency = runtime.api.getTotalEffiPercentage;
  const originalSpeed = runtime.api.getToolsSpeedBuffByActionHrid;
  Date.now = () => new Date(2026, 7, 13, 23, 30, 0).getTime();
  runtime.config.isZH = true;
  runtime.state.actionTypeBuffSources = {};
  runtime.state.initData_actionDetailMap = {
    "/actions/crafting/current": {
      type: "/action_types/crafting",
      baseTimeCost: 3_600_000_000_000,
      outputItems: [],
    },
    "/actions/crafting/queued": {
      type: "/action_types/crafting",
      baseTimeCost: 3_600_000_000_000,
      outputItems: [],
    },
  };
  runtime.state.currentActionsHridList = [
    {
      actionHrid: "/actions/crafting/current",
      maxCount: 1,
      currentCount: 0,
    },
    {
      actionHrid: "/actions/crafting/queued",
      maxCount: 26,
      currentCount: 0,
    },
  ];
  runtime.api.getTotalEffiPercentage = () => 0;
  runtime.api.getToolsSpeedBuffByActionHrid = () => 0;
  document.body.innerHTML = `<div class="QueuedActions_queuedActionsEditMenu__3OoQH"><div class="QueuedActions_actions__2Lur6"><div class="QueuedActions_action__r3HlD"><div></div></div></div></div>`;
  try {
    runtime.api.handleActionQueueMenueCalculateTime(
      document.body.firstElementChild,
    );
    assert.equal(
      document.querySelector(".script_actionTime").textContent,
      "1天2小时（02:30:00）（+2天）",
    );
    assert.equal(
      document.querySelector("#script_queueTotalTime").textContent,
      "总时间：1天3小时（02:30:00）（+2天）",
    );
  } finally {
    Date.now = originalNow;
    runtime.config.isZH = originalLanguage;
    runtime.api.getTotalEffiPercentage = originalEfficiency;
    runtime.api.getToolsSpeedBuffByActionHrid = originalSpeed;
  }
});

test("replacing one hundred queue menus retains only the active observer", () => {
  runtime.settings.settingsMap.actionQueue.isTrue = true;
  for (let index = 0; index < 100; index += 1) {
    const root = document.createElement("div");
    root.innerHTML = `<div class="QueuedActions_queuedActionsEditMenu__3OoQH"><div class="QueuedActions_actions__2Lur6"><div class="QueuedActions_action__r3HlD"><div></div></div></div></div>`;
    document.body.append(root);
    const menu = root.firstElementChild;
    runtime.api.handleActionQueueMenue(menu);
    assert.equal(runtime.api.getActiveActionQueueObserverCount(), 1);
    root.remove();
    runtime.api.disconnectActionQueueObserver(root);
    assert.equal(runtime.api.getActiveActionQueueObserverCount(), 0);
  }
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
  await runtime.features.enable("itemTooltip_prices");
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
  assert.equal(calls.filter((call) => call.type === "show").length, 1);
  input.dispatchEvent(
    new dom.window.KeyboardEvent("keyup", {
      key: "Control",
      code: "ControlLeft",
      bubbles: true,
    }),
  );

  calls.length = 0;
  runtime.api.setTooltipProfitShortcut({ code: "KeyK", display: "K" });
  input.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      bubbles: true,
    }),
  );
  assert.equal(
    calls.some((call) => call.type === "show"),
    false,
  );
  runtime.api.setTooltipProfitShortcut({ code: "Control", display: "Ctrl" });

  const touchEvent = (type, x, y, pointerId = 7) => {
    const event = new dom.window.MouseEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
    });
    Object.defineProperties(event, {
      pointerType: { value: "touch" },
      pointerId: { value: pointerId },
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

  const secondCard = document.createElement("div");
  secondCard.className = "SkillAction_skillAction__fixture";
  secondCard.__reactFiber$keyTest = card.__reactFiber$keyTest;
  document.body.append(secondCard);
  calls.length = 0;
  secondCard.dispatchEvent(touchEvent("pointerdown", 15, 15, 8));
  runtime.api.clearTooltipProfitHoverContext(card, null, {
    preserveTouchPress: true,
  });
  secondCard.dispatchEvent(
    new dom.window.MouseEvent("mouseover", { bubbles: true }),
  );
  await new Promise((resolve) => setTimeout(resolve, 820));
  assert.equal(calls.filter((call) => call.type === "show").length, 1);
  assert.equal(calls.find((call) => call.type === "show").anchor, secondCard);
  assert.equal(calls.find((call) => call.type === "show").options.sticky, true);
  secondCard.dispatchEvent(touchEvent("pointerup", 15, 15, 8));

  await runtime.features.disable("itemTooltip_profit");
  await runtime.features.disable("itemTooltip_prices");
  runtime.api.showProductionProfitPanel = originalShow;
  runtime.api.dismissHoverPanel = originalDismiss;
});

test("enhancement costs share the tooltip key and touch long press", async () => {
  const originalShow = runtime.api.showEnhancementCostPanel;
  const originalHide = runtime.api.hideEnhancementCostPanel;
  const calls = [];
  runtime.api.showEnhancementCostPanel = (anchor, plan, options) => {
    calls.push({ type: "show", anchor, plan, options });
    return {};
  };
  runtime.api.hideEnhancementCostPanel = () => calls.push({ type: "hide" });
  runtime.api.setTooltipProfitShortcut({ code: "Control", display: "Ctrl" });
  runtime.settings.settingsMap.itemTooltip_profitRequireKey.isTrue = true;
  runtime.settings.settingsMap.enhanceSim.isTrue = true;
  const anchor = document.createElement("div");
  document.body.replaceChildren(anchor);
  await runtime.features.enable("itemTooltip_prices");

  setEnhancementHoverPanelContext(anchor, { status: "complete" });
  assert.equal(calls.filter((call) => call.type === "show").length, 0);
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
  assert.equal(calls.at(-1).type, "hide");

  calls.length = 0;
  const touch = new dom.window.MouseEvent("pointerdown", {
    bubbles: true,
    clientX: 10,
    clientY: 10,
  });
  Object.defineProperties(touch, {
    pointerType: { value: "touch" },
    pointerId: { value: 19 },
  });
  anchor.dispatchEvent(touch);
  await new Promise((resolve) => setTimeout(resolve, 820));
  assert.equal(calls.filter((call) => call.type === "show").length, 1);
  assert.equal(calls.find((call) => call.type === "show").options.sticky, true);
  const touchEnd = new dom.window.MouseEvent("pointerup", {
    bubbles: true,
    clientX: 10,
    clientY: 10,
  });
  Object.defineProperties(touchEnd, {
    pointerType: { value: "touch" },
    pointerId: { value: 19 },
  });
  anchor.dispatchEvent(touchEnd);
  assert.equal(
    calls.some((call) => call.type === "hide"),
    false,
  );

  await runtime.settings.set("enhanceSim", false, { persist: false });
  assert.equal(calls.at(-1).type, "hide");
  await runtime.settings.set("enhanceSim", true, { persist: false });
  clearEnhancementHoverPanelContext(anchor);
  await runtime.features.disable("itemTooltip_prices");
  runtime.api.showEnhancementCostPanel = originalShow;
  runtime.api.hideEnhancementCostPanel = originalHide;
});
