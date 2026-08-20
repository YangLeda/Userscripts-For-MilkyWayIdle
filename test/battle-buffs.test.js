import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  {
    url: "https://www.milkywayidle.com/",
  },
);
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.window = dom.window;

const { runtime } = await import("../src/core/runtime.js");
const EXPANSION_STORAGE_KEY = "MWITools_battle_buff_expansion_v1";
runtime.config.isZH = true;
let battleBuffsEnabled = false;
runtime.settings.get = (id) =>
  id === "battleBuffs" ? battleBuffsEnabled : false;
runtime.state.initData_abilityDetailMap = {
  "/abilities/berserk": {
    abilityEffects: [
      { targetType: "self", buffs: [{ duration: 8_000_000_000 }] },
    ],
  },
  "/abilities/fierce_aura": {
    abilityEffects: [
      { targetType: "all_allies", buffs: [{ duration: 10_000_000_000 }] },
    ],
  },
  "/abilities/maim": {
    abilityEffects: [
      { targetType: "enemy", buffs: [{ duration: 9_000_000_000 }] },
    ],
  },
  "/abilities/puncture": {
    abilityEffects: [
      { targetType: "enemy", buffs: [{ duration: 12_000_000_000 }] },
    ],
  },
  "/abilities/toughness": {
    abilityEffects: [
      { targetType: "self", buffs: [{ duration: 20_000_000_000 }] },
    ],
  },
  "/abilities/elusiveness": {
    abilityEffects: [
      { targetType: "self", buffs: [{ duration: 20_000_000_000 }] },
    ],
  },
  "/abilities/precision": {
    abilityEffects: [
      { targetType: "self", buffs: [{ duration: 20_000_000_000 }] },
    ],
  },
  "/abilities/frenzy": {
    abilityEffects: [
      { targetType: "self", buffs: [{ duration: 20_000_000_000 }] },
    ],
  },
  "/abilities/elemental_affinity": {
    abilityEffects: [
      { targetType: "self", buffs: [{ duration: 20_000_000_000 }] },
    ],
  },
  "/abilities/spike_shell": {
    abilityEffects: [
      { targetType: "self", buffs: [{ duration: 30_000_000_000 }] },
    ],
  },
  "/abilities/withering_field": {
    abilityEffects: [
      {
        effectType: "/ability_effect_types/damage",
        targetType: "allEnemies",
      },
      {
        effectType: "/ability_effect_types/debuff",
        buffs: [{ duration: 11_000_000_000 }],
      },
    ],
  },
  "/abilities/hybrid_ward": {
    abilityEffects: [
      {
        effectType: "/ability_effect_types/buff",
        targetType: "self",
        buffs: [{ duration: 15_000_000_000 }],
      },
      {
        effectType: "/ability_effect_types/debuff",
        targetType: "enemy",
        buffs: [{ duration: 7_000_000_000 }],
      },
    ],
  },
  "/abilities/monster_hex": {
    abilityEffects: [
      {
        effectType: "/ability_effect_types/debuff",
        targetType: "enemy",
        buffs: [{ duration: 6_000_000_000 }],
      },
    ],
  },
  "/abilities/marked_hex": {
    abilityEffects: [
      {
        effectType: "/ability_effect_types/debuff",
        targetType: "enemy",
        buffs: [
          {
            uniqueHrid: "/buff_uniques/marked_hex",
            duration: 13_000_000_000,
          },
        ],
      },
    ],
  },
};

await import("../src/features/battle-buffs.js");

function battleMarkup(playerCount, monsterCount) {
  const units = (count) =>
    Array.from(
      { length: count },
      () =>
        '<div class="CombatUnit_combatUnit__1m3XT">' +
        '<div class="CombatUnit_name__x">u</div>' +
        '<div class="CombatUnit_status__3bH7W"></div>' +
        "</div>",
    ).join("");
  document.body.innerHTML = `
    <svg hidden><use href="/static/media/abilities_sprite.test.svg#berserk"></use></svg>
    <div class="BattlePanel_playersArea__vvwlB">
      <div class="BattlePanel_combatUnitGrid__2hTAM">${units(playerCount)}</div>
    </div>
    <div class="BattlePanel_monstersArea__2dzrY">
      <div class="BattlePanel_combatUnitGrid__2hTAM">${units(monsterCount)}</div>
    </div>`;
}

function playerUnits() {
  return document.querySelectorAll(
    ".BattlePanel_playersArea__vvwlB .CombatUnit_combatUnit__1m3XT",
  );
}
function monsterUnits() {
  return document.querySelectorAll(
    ".BattlePanel_monstersArea__2dzrY .CombatUnit_combatUnit__1m3XT",
  );
}

test("battle buff catalog stays consistent", () => {
  const {
    BUFFS,
    DEBUFFS,
    TEAM_BUFFS,
    SINGLE_TARGET_DEBUFFS,
    ALL_TARGET_DEBUFFS,
  } = runtime.api.battleBuffs;
  // Team buffs and single-target debuffs must reference known abilities.
  for (const hrid of TEAM_BUFFS) assert.ok(BUFFS.has(hrid), hrid);
  for (const hrid of SINGLE_TARGET_DEBUFFS) assert.ok(DEBUFFS.has(hrid), hrid);
  assert.equal(DEBUFFS.get("/abilities/puncture"), 12);
  assert.ok(DEBUFFS.has("/abilities/withering_field"));
  assert.ok(ALL_TARGET_DEBUFFS.has("/abilities/withering_field"));
  assert.equal(SINGLE_TARGET_DEBUFFS.has("/abilities/withering_field"), false);
});

test("a cast buff renders an icon chip below the caster", async () => {
  battleBuffsEnabled = true;
  battleMarkup(2, 1);
  await runtime.features.enable("battleBuffs");

  // A single-target self buff comes from pMap[0] carrying the ability hrid.
  runtime.dispatchMessage({
    type: "battle_updated",
    pMap: { 0: { abilityHrid: "/abilities/berserk" } },
    mMap: {},
  });

  const casterBar = playerUnits()[0].querySelector(".mwi-buffbar");
  assert.ok(casterBar, "buff bar exists on the caster");
  // The bar stays inside the status column, so it never overlaps neighbouring
  // units.
  assert.ok(
    casterBar.closest('[class*="CombatUnit_status"]'),
    "buff bar is nested inside the status container",
  );
  assert.equal(casterBar.querySelectorAll(".mwi-chip.mwi-buff").length, 1);
  // The icon references the game's ability sprite by hrid tail.
  const use = casterBar.querySelector("use");
  assert.match(use.getAttribute("href"), /#berserk$/);
  // The other player has no buff.
  assert.equal(playerUnits()[1].querySelectorAll(".mwi-chip").length, 0);

  await runtime.features.disable("battleBuffs");
  battleBuffsEnabled = false;
});

test("status bars stay single-row and marquee after the third icon", async () => {
  localStorage.setItem(EXPANSION_STORAGE_KEY, JSON.stringify(["legacy"]));
  battleBuffsEnabled = true;
  battleMarkup(2, 1);
  await runtime.features.enable("battleBuffs");

  const firstShell = playerUnits()[0].querySelector(".mwi-buff-shell");
  const secondShell = playerUnits()[1].querySelector(".mwi-buff-shell");
  assert.ok(firstShell, "empty cards reserve their buff space immediately");
  assert.ok(secondShell, "every visible unit receives an independent shell");
  assert.equal(firstShell.querySelector(".mwi-buff-toggle"), null);
  assert.equal(secondShell.querySelector(".mwi-buff-toggle"), null);

  const styles = document.querySelector("#mwi-buff-style").textContent;
  assert.match(styles, /mwi-buff-shell\{[^}]*height:21px/);
  assert.match(styles, /@keyframes mwi-buff-marquee/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(styles, /data-expanded|mwi-buff-toggle/);

  const abilities = [
    "/abilities/berserk",
    "/abilities/toughness",
    "/abilities/elusiveness",
    "/abilities/precision",
    "/abilities/frenzy",
    "/abilities/elemental_affinity",
    "/abilities/spike_shell",
  ];
  const applyBuff = (abilityHrid) => {
    runtime.dispatchMessage({
      type: "battle_updated",
      pMap: { 0: { abilityHrid } },
      mMap: {},
    });
  };

  const firstBar = firstShell.querySelector(".mwi-buffbar");
  abilities.slice(0, 3).forEach(applyBuff);
  assert.equal(firstBar.querySelectorAll(".mwi-chip").length, 3);
  assert.equal(firstBar.dataset.scrolling, undefined);
  assert.equal(firstBar.querySelectorAll(".mwi-buff-sequence").length, 1);
  applyBuff(abilities[3]);
  assert.equal(firstBar.dataset.scrolling, "true");
  assert.equal(firstBar.querySelectorAll(".mwi-buff-sequence").length, 2);
  assert.equal(firstBar.querySelectorAll(".mwi-chip").length, 8);
  assert.equal(
    firstBar
      .querySelector('.mwi-buff-sequence[aria-hidden="true"]')
      ?.getAttribute("aria-hidden"),
    "true",
  );
  assert.match(
    firstBar.style.getPropertyValue("--mwi-marquee-distance"),
    /px$/,
  );
  assert.match(firstBar.style.getPropertyValue("--mwi-marquee-duration"), /s$/);
  assert.equal(secondShell.querySelectorAll(".mwi-chip").length, 0);

  const stableTrack = firstBar.querySelector(".mwi-buff-track");
  runtime.dispatchMessage({
    type: "battle_updated",
    pMap: { 0: { abilityHrid: abilities[3] } },
    mMap: {},
  });
  assert.equal(
    firstBar.querySelector(".mwi-buff-track"),
    stableTrack,
    "countdown and repeated effects update in place without restarting marquee",
  );
  assert.equal(
    localStorage.getItem(EXPANSION_STORAGE_KEY),
    JSON.stringify(["legacy"]),
    "the retired expansion preference is ignored without deleting user storage",
  );

  await runtime.features.disable("battleBuffs");
  battleBuffsEnabled = false;
  localStorage.removeItem(EXPANSION_STORAGE_KEY);
});

test("a team buff applies to every friendly unit", async () => {
  battleBuffsEnabled = true;
  battleMarkup(3, 2);
  await runtime.features.enable("battleBuffs");

  runtime.dispatchMessage({
    type: "battle_updated",
    pMap: { 1: { abilityHrid: "/abilities/fierce_aura" } },
    mMap: {},
  });

  for (const unit of playerUnits()) {
    assert.equal(unit.querySelectorAll(".mwi-chip.mwi-buff").length, 1);
  }
  // Monsters are unaffected by a player team buff.
  for (const unit of monsterUnits()) {
    assert.equal(unit.querySelectorAll(".mwi-chip").length, 0);
  }

  await runtime.features.disable("battleBuffs");
  battleBuffsEnabled = false;
});

test("a cast debuff lands on the damaged monster the following frame", async () => {
  battleBuffsEnabled = true;
  battleMarkup(1, 2);
  await runtime.features.enable("battleBuffs");

  // Frame 1: the player is preparing a single-target debuff.
  runtime.dispatchMessage({
    type: "battle_updated",
    pMap: { 0: { abilityHrid: "/abilities/maim", cHP: 100 } },
    mMap: { 0: { cHP: 100 }, 1: { cHP: 100 } },
  });
  // No debuff icon yet — the cast has not resolved.
  assert.equal(
    document.querySelectorAll(".mwi-chip.mwi-debuff").length,
    0,
    "debuff is not shown before the cast resolves",
  );

  // Frame 2: the player switches to auto-attack and monster 0 takes damage.
  runtime.dispatchMessage({
    type: "battle_updated",
    pMap: { 0: { isAutoAtk: true } },
    mMap: { 0: { cHP: 80 } },
  });

  // The single-target debuff should appear on the monster that lost HP.
  const hitBar = monsterUnits()[0].querySelector(".mwi-buffbar");
  assert.ok(hitBar, "damaged monster has a buff bar");
  assert.equal(hitBar.querySelectorAll(".mwi-chip.mwi-debuff").length, 1);
  assert.match(hitBar.querySelector("use").getAttribute("href"), /#maim$/);
  // The untouched monster stays clean for a single-target debuff.
  assert.equal(
    monsterUnits()[1].querySelectorAll(".mwi-chip").length,
    0,
    "single-target debuff does not spread to unhit monsters",
  );

  await runtime.features.disable("battleBuffs");
  battleBuffsEnabled = false;
});

test("explicit and hybrid debuffs stay on affected targets", async () => {
  battleBuffsEnabled = true;
  battleMarkup(2, 2);
  await runtime.features.enable("battleBuffs");

  runtime.dispatchMessage({
    type: "battle_updated",
    pMap: {
      0: { abilityHrid: "/abilities/withering_field", cHP: 100 },
      1: { cHP: 100 },
    },
    mMap: { 0: { cHP: 100 }, 1: { cHP: 100 } },
  });
  assert.equal(
    playerUnits()[0].querySelectorAll(".mwi-chip.mwi-debuff").length,
    0,
    "a debuff without its own targetType is never downgraded to a caster buff",
  );
  runtime.dispatchMessage({
    type: "battle_updated",
    pMap: { 0: { isAutoAtk: true } },
    mMap: {},
  });
  for (const monster of monsterUnits()) {
    assert.equal(monster.querySelectorAll(".mwi-chip.mwi-debuff").length, 1);
  }

  runtime.dispatchMessage({
    type: "battle_updated",
    pMap: { 1: { abilityHrid: "/abilities/hybrid_ward" } },
    mMap: {},
  });
  assert.equal(
    playerUnits()[1].querySelectorAll(".mwi-chip.mwi-buff").length,
    1,
    "the friendly half of a hybrid skill remains on its caster",
  );
  runtime.dispatchMessage({
    type: "battle_updated",
    pMap: { 1: { isAutoAtk: true } },
    mMap: { 1: { cHP: 80 } },
  });
  assert.match(
    monsterUnits()[1]
      .querySelector("use[href$='#hybrid_ward']")
      ?.getAttribute("href") ?? "",
    /#hybrid_ward$/,
  );
  assert.equal(
    playerUnits()[1].querySelectorAll(".mwi-chip.mwi-debuff").length,
    0,
  );

  runtime.dispatchMessage({
    type: "battle_updated",
    pMap: {},
    mMap: { 0: { abilityHrid: "/abilities/monster_hex" } },
  });
  runtime.dispatchMessage({
    type: "battle_updated",
    pMap: { 1: { cHP: 70 } },
    mMap: { 0: { isAutoAtk: true } },
  });
  assert.match(
    playerUnits()[1]
      .querySelector("use[href$='#monster_hex']")
      ?.getAttribute("href") ?? "",
    /#monster_hex$/,
    "monster debuffs land on the damaged player",
  );
  assert.equal(
    monsterUnits()[0].querySelector("use[href$='#monster_hex']"),
    null,
  );

  await runtime.features.disable("battleBuffs");
  battleBuffsEnabled = false;
});

test("combatBuffMap authoritatively places a status on its owning unit", async () => {
  battleBuffsEnabled = true;
  battleMarkup(1, 2);
  await runtime.features.enable("battleBuffs");

  runtime.dispatchMessage({
    type: "battle_updated",
    pMap: { 0: { abilityHrid: "/abilities/marked_hex", cHP: 100 } },
    mMap: {
      0: { cHP: 100 },
      1: {
        cHP: 100,
        combatBuffMap: {
          "/buff_uniques/marked_hex": {
            uniqueHrid: "/buff_uniques/marked_hex",
            startTime: new Date().toISOString(),
            duration: 13_000_000_000,
          },
        },
      },
    },
  });

  assert.equal(monsterUnits()[0].querySelectorAll(".mwi-chip").length, 0);
  assert.match(
    monsterUnits()[1].querySelector("use")?.getAttribute("href") ?? "",
    /#marked_hex$/,
  );
  assert.equal(playerUnits()[0].querySelectorAll(".mwi-chip").length, 0);

  await runtime.features.disable("battleBuffs");
  battleBuffsEnabled = false;
});

test("disabling the feature removes all buff bars", async () => {
  battleBuffsEnabled = true;
  battleMarkup(1, 1);
  await runtime.features.enable("battleBuffs");
  runtime.dispatchMessage({
    type: "battle_updated",
    pMap: { 0: { abilityHrid: "/abilities/berserk" } },
    mMap: {},
  });
  assert.ok(playerUnits()[0].querySelector(".mwi-buffbar"));
  assert.ok(playerUnits()[0].querySelector(".mwi-buff-shell"));
  assert.equal(playerUnits()[0].querySelector(".mwi-buff-toggle"), null);
  assert.ok(playerUnits()[0].querySelector(".mwi-has-buffbar"));
  assert.ok(document.querySelector("#mwi-buff-style"));

  await runtime.features.disable("battleBuffs");
  battleBuffsEnabled = false;

  assert.equal(playerUnits()[0].querySelector(".mwi-buffbar"), null);
  assert.equal(playerUnits()[0].querySelector(".mwi-buff-shell"), null);
  assert.equal(playerUnits()[0].querySelector(".mwi-buff-toggle"), null);
  // The height override flag is cleared so the status column returns to normal.
  assert.equal(playerUnits()[0].querySelector(".mwi-has-buffbar"), null);
  assert.equal(document.querySelector("#mwi-buff-style"), null);
});
