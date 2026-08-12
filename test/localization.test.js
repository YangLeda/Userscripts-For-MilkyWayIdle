import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://test.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.window = dom.window;
localStorage.setItem("i18nextLng", "zh-CN");

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/data/translations.js");
await import("../src/core/state.js");
const { abilityName, actionName, entityName, itemName, localize, monsterName } =
  await import("../src/core/localization.js");

test("the localization entry switches static copy with the MWITools language", () => {
  const original = runtime.config.isZH;
  runtime.config.isZH = true;
  assert.equal(localize("库存", "Inventory"), "库存");
  runtime.config.isZH = false;
  assert.equal(localize("库存", "Inventory"), "Inventory");
  runtime.config.isZH = original;
});

test("official entity dictionaries take priority over plug-in fallbacks", () => {
  const originalLanguage = runtime.config.isZH;
  const originalItems = runtime.state.initData_itemDetailMap;
  const originalActions = runtime.state.initData_actionDetailMap;
  const originalAbilities = runtime.state.initData_abilityDetailMap;
  runtime.state.initData_itemDetailMap = {
    "/items/coin": { name: "Coin" },
  };
  runtime.state.initData_actionDetailMap = {
    "/actions/milking/cow": { name: "Cow" },
  };
  runtime.state.initData_abilityDetailMap = {
    "/abilities/firestorm": { name: "Firestorm" },
  };

  runtime.config.isZH = true;
  assert.equal(itemName("/items/coin", { fallbackZh: "插件金币" }), "金币");
  assert.equal(
    actionName("/actions/milking/cow", { fallbackZh: "插件奶牛" }),
    runtime.data.ZHActionNames["/actions/milking/cow"],
  );
  assert.equal(
    abilityName("/abilities/firestorm", { fallbackZh: "插件火雨" }),
    "火焰风暴",
  );
  assert.equal(
    monsterName("/monsters/abyssal_imp", { fallbackZh: "插件小鬼" }),
    "深渊小鬼",
  );

  runtime.config.isZH = false;
  assert.equal(itemName("/items/coin", { fallbackEn: "Plug-in Coin" }), "Coin");
  assert.equal(
    actionName("/actions/milking/cow", { fallbackEn: "Plug-in Cow" }),
    "Cow",
  );
  assert.equal(
    abilityName("/abilities/firestorm", { fallbackEn: "Plug-in Storm" }),
    "Firestorm",
  );

  runtime.config.isZH = originalLanguage;
  runtime.state.initData_itemDetailMap = originalItems;
  runtime.state.initData_actionDetailMap = originalActions;
  runtime.state.initData_abilityDetailMap = originalAbilities;
});

test("missing official words retain the existing custom translation before diagnostics", () => {
  const original = runtime.config.isZH;
  runtime.config.isZH = true;
  assert.equal(
    entityName("item", "/items/future_item", {
      fallbackZh: "未来物品",
      fallbackEn: "Future Item",
    }),
    "未来物品",
  );
  runtime.config.isZH = false;
  assert.equal(
    entityName("item", "/items/future_item", {
      fallbackZh: "未来物品",
      fallbackEn: "Future Item",
    }),
    "Future Item",
  );
  assert.equal(entityName("item", "/items/no_name"), "no name");
  runtime.config.isZH = original;
});
