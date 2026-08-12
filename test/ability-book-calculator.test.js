import assert from "node:assert/strict";
import test, { after } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  { url: "https://test.milkywayidle.com/" },
);
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.location = dom.window.location;
globalThis.localStorage = dom.window.localStorage;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.getComputedStyle = dom.window.getComputedStyle;

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/data/translations.js");
await import("../src/core/state.js");
await import("../src/core/market.js");
const {
  calculateAbilityBookRequirement,
  maxAbilityLevel,
  resolveAbilityBookItem,
} = await import("../src/features/ability-book-calculator.js");

runtime.config.isZH = true;
runtime.state.initData_levelExperienceTable = [0, 0, 100, 300, null];
runtime.state.initData_itemDetailMap = {
  "/items/fireball_book": {
    name: "Fireball Book",
    abilityBookDetail: {
      abilityHrid: "/abilities/fireball_book",
      experienceGain: 30.4,
    },
  },
};
runtime.state.itemEnNameToHridMap["Fireball Book"] = "/items/fireball_book";
runtime.state.marketApiJson = {
  marketData: { "/items/fireball_book": [{ a: 125, b: 100 }] },
};
runtime.state.initData_characterAbilities = [];
await runtime.features.handleCharacterData({ character: { id: "books" } });

after(async () => {
  await runtime.features.disable("skillbook");
  dom.window.close();
});

function settle(delay = 90) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

test("ability-book requirements are integer and include the unlock book", () => {
  assert.equal(maxAbilityLevel([0, 0, 100, 300, null]), 3);
  assert.deepEqual(
    calculateAbilityBookRequirement({
      isLearned: true,
      currentLevel: 1,
      currentExperience: 20,
      targetLevel: 2,
      experienceGain: 30,
      levelExperienceTable: [0, 0, 100, 300],
    }),
    {
      status: "ready",
      maximumLevel: 3,
      targetExperience: 100,
      unlockBooks: 0,
      levelingBooks: 3,
      totalBooks: 3,
    },
  );
  assert.equal(
    calculateAbilityBookRequirement({
      isLearned: false,
      currentLevel: 0,
      currentExperience: 0,
      targetLevel: 3,
      experienceGain: 100,
      levelExperienceTable: [0, 0, 100, 300],
    }).totalBooks,
    4,
  );
});

test("reached and invalid targets are reported explicitly", () => {
  assert.equal(
    calculateAbilityBookRequirement({
      isLearned: true,
      currentLevel: 2,
      currentExperience: 100,
      targetLevel: 2,
      experienceGain: 30,
      levelExperienceTable: [0, 0, 100, 300],
    }).status,
    "reached",
  );
  assert.equal(
    calculateAbilityBookRequirement({
      isLearned: true,
      currentLevel: 2,
      currentExperience: 100,
      targetLevel: 4,
      experienceGain: 30,
      levelExperienceTable: [0, 0, 100, 300],
    }).status,
    "invalid",
  );
});

test("only the dictionary keeps one live bilingual calculator", async () => {
  document.body.innerHTML = `
    <div class="MarketplacePanel_marketplacePanel__test">
      <div class="MarketplacePanel_currentItem__test">
        <svg><use href="#fireball_book"></use></svg>
      </div>
    </div>
    <div class="ItemDictionary_modalContent__test">
      <h1 class="ItemDictionary_title__test">Fireball Book</h1>
    </div>`;
  assert.equal(
    resolveAbilityBookItem(document.querySelector("[class*=MarketplacePanel]")),
    "/items/fireball_book",
  );
  await runtime.features.enable("skillbook");
  await settle();
  assert.equal(
    document.querySelectorAll(".mwi-ability-book-calculator").length,
    1,
  );
  assert.equal(
    document.querySelector(
      '[class*="MarketplacePanel"] .mwi-ability-book-calculator',
    ),
    null,
  );

  const dictionary = document.querySelector('[data-surface="dictionary"]');
  const target = dictionary.querySelector("input");
  target.value = "2";
  target.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  assert.match(dictionary.textContent, /解锁 1 \+ 升级 4 = 合计 5 本/);
  assert.match(dictionary.textContent, /参考购买成本：625/);

  runtime.state.marketApiJson = {
    marketData: { "/items/fireball_book": [{ a: 200, b: 180 }] },
  };
  runtime.dispatchMessage({ type: "market_item_values_updated" });
  await settle();
  assert.match(dictionary.textContent, /参考购买成本：1K/);

  runtime.state.initData_characterAbilities = [
    {
      abilityHrid: "/abilities/fireball_book",
      level: 1,
      experience: 40.6,
    },
  ];
  runtime.dispatchMessage({ type: "abilities_updated" });
  await settle();
  assert.match(dictionary.textContent, /当前 Lv\.1 · 总经验 41/);
  assert.match(dictionary.textContent, /每本增加 30 经验/);
  assert.match(dictionary.textContent, /升级还需 2 本/);

  runtime.config.isZH = false;
  runtime.dispatchMessage({ type: "action_completed" });
  await settle();
  assert.match(dictionary.textContent, /Ability book calculator/);
  assert.match(dictionary.textContent, /2 books needed to level/);

  await runtime.features.disable("skillbook");
  assert.equal(
    document.querySelectorAll(".mwi-ability-book-calculator").length,
    0,
  );
  assert.equal(
    document.getElementById("mwitools-ability-book-calculator-style"),
    null,
  );
});

test("missing character data waits and missing prices do not hide book counts", async () => {
  runtime.config.isZH = true;
  runtime.state.initData_characterAbilities = null;
  runtime.state.marketApiJson = { marketData: {} };
  document.body.innerHTML = `
    <div class="ItemDictionary_modalContent__test">
      <h1 class="ItemDictionary_title__test">Fireball Book</h1>
    </div>`;
  await runtime.features.enable("skillbook");
  await settle();
  const dictionary = document.querySelector('[data-surface="dictionary"]');
  assert.match(dictionary.textContent, /等待角色与技能书数据/);

  runtime.state.initData_characterAbilities = [];
  runtime.dispatchMessage({ type: "character_abilities_updated" });
  await settle();
  assert.match(dictionary.textContent, /解锁 1 \+ 升级 0 = 合计 1 本/);
  assert.match(dictionary.textContent, /参考购买成本：暂无出售价/);
  await runtime.features.disable("skillbook");
});
