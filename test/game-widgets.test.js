import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<!doctype html><html><body>
    <div id="battle-summary"><div class="BattlePanel_gainedExp__3SaCa"></div></div>
    <div class="BattlePanel_combatInfo__sHGCe">Combat Duration: 1h 0s Battles: 11 Deaths: 0</div>
  </body></html>`,
  { url: "https://www.milkywayidle.com/" },
);
Object.assign(globalThis, {
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  location: dom.window.location,
  window: dom.window,
});

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/core/state.js");
const { parseLocalizedBattleInfo } =
  await import("../src/features/game-widgets.js");
const { registerGameLocaleResources } =
  await import("../src/core/game-localization.js");

runtime.config.isZH = false;
runtime.config.SCRIPT_COLOR_MAIN = "green";
runtime.api.numberFormatter = (value) => String(Math.round(value));
let marketFetches = 0;
runtime.api.fetchMarketJSON = async () => {
  marketFetches += 1;
  return {
    marketData: {
      "/items/coin": [{ a: 1 }],
      "/items/loot": [{ a: 10 }],
    },
  };
};
runtime.api.getNetSellPrice = (itemHrid) =>
  itemHrid === "/items/loot" ? 9 : 1;

const message = {
  unit: {
    totalLootMap: {
      coin: { itemHrid: "/items/coin", count: 100 },
      loot: { itemHrid: "/items/loot", count: 2 },
    },
    totalSkillExperienceMap: { "/skills/attack": 3_600 },
  },
};

test("battle summary keeps encounters and XP while hiding iron-cow revenue", async () => {
  runtime.state.currentCharacterGameMode = "standard";
  runtime.settings.settingsMap.adaptIronCowMarketFeatures.isTrue = true;
  await runtime.api.handleBattleSummary(message);
  const summary = document.querySelector("#battle-summary");
  assert.match(summary.textContent, /Encounters\/hour/);
  assert.match(summary.textContent, /Total revenue/);
  assert.match(summary.textContent, /Total exp/);
  assert.equal(marketFetches, 1);

  runtime.state.currentCharacterGameMode = "legacy_ironcow";
  await runtime.api.handleBattleSummary(message);
  assert.match(summary.textContent, /Encounters\/hour/);
  assert.match(summary.textContent, /Total exp/);
  assert.doesNotMatch(summary.textContent, /revenue|Raw coins/i);
  assert.equal(marketFetches, 1, "iron mode must not request market data");
});

test("battle summaries parse official non-English templates", async () => {
  registerGameLocaleResources("es", {
    battlePanel: {
      combatDuration: "Duración del combate: {{duration}}",
      battles: "Batallas: {{battleId}}",
      deaths: "Muertes: {{deathCount}}",
    },
    itemNames: { "/items/coin": "Moneda" },
    actionNames: { "/actions/milking/cow": "Vaca" },
    monsterNames: { "/monsters/rat": "Rata" },
    abilityNames: { "/abilities/strike": "Golpe" },
  });
  localStorage.setItem("i18nextLng", "es");
  const info = document.querySelector(".BattlePanel_combatInfo__sHGCe");
  info.textContent = "Duración del combate: 1h 30m 0s Batallas: 10 Muertes: 2";
  assert.deepEqual(parseLocalizedBattleInfo(info.textContent), {
    battleDurationSec: 5_400,
    battleCount: 10,
    deathCount: 2,
  });

  runtime.state.currentCharacterGameMode = "standard";
  runtime.settings.settingsMap.adaptIronCowMarketFeatures.isTrue = false;
  await runtime.api.handleBattleSummary(message);
  const summary = document.querySelector("#battle-summary");
  assert.match(summary.textContent, /Encounters\/hour/);
  assert.match(summary.textContent, /Revenue\/hour/);
  assert.match(summary.textContent, /Total exp\/hour/);

  localStorage.setItem("i18nextLng", "en");
  info.textContent = "Combat Duration: 1h 0s Battles: 11 Deaths: 0";
});
