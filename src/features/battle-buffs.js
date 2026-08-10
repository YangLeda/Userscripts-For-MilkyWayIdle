import { runtime } from "../core/runtime.js";

/*
 * Battle buff/debuff overlay. Ported from the standalone "牛牛战斗Buff显示"
 * userscript (400BadRequest, MIT). Instead of installing its own WebSocket
 * proxy, this feature listens to MWITools' shared message dispatcher and draws
 * ability icons with a countdown ring below each combat unit.
 */

const STYLE_ID = "mwi-buff-style";
const FALLBACK_SPRITE_URL = "/static/media/abilities_sprite.fdd1b4de.svg";

// Ability hrid -> approximate buff duration in seconds.
const BUFFS = new Map([
  ["/abilities/mana_spring", 10],
  ["/abilities/taunt", 65],
  ["/abilities/provoke", 65],
  ["/abilities/toughness", 20],
  ["/abilities/elusiveness", 20],
  ["/abilities/precision", 20],
  ["/abilities/berserk", 20],
  ["/abilities/elemental_affinity", 20],
  ["/abilities/frenzy", 20],
  ["/abilities/spike_shell", 30],
  ["/abilities/retribution", 30],
  ["/abilities/vampirism", 20],
  ["/abilities/insanity", 12],
  ["/abilities/invincible", 12],
  ["/abilities/fierce_aura", 120],
  ["/abilities/guardian_aura", 120],
  ["/abilities/mystic_aura", 120],
  ["/abilities/speed_aura", 120],
  ["/abilities/critical_aura", 120],
]);
const DEBUFFS = new Map([
  ["/abilities/puncture", 10],
  ["/abilities/maim", 12],
  ["/abilities/crippling_slash", 12],
  ["/abilities/fracturing_impact", 12],
  ["/abilities/pestilent_shot", 12],
  ["/abilities/ice_spear", 8],
  ["/abilities/frost_surge", 9],
  ["/abilities/toxic_pollen", 10],
  ["/abilities/smoke_burst", 8],
]);
const SINGLE_TARGET_DEBUFFS = new Set([
  "/abilities/puncture",
  "/abilities/maim",
  "/abilities/pestilent_shot",
  "/abilities/smoke_burst",
]);
const TEAM_BUFFS = new Set([
  "/abilities/mana_spring",
  "/abilities/fierce_aura",
  "/abilities/guardian_aura",
  "/abilities/mystic_aura",
  "/abilities/speed_aura",
  "/abilities/critical_aura",
]);

function abilityId(hrid) {
  const parts = hrid.split("/");
  return parts[parts.length - 1] || hrid;
}

function ensureBuffStyles(scope) {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.mwi-has-buffbar{height:auto!important;min-height:0;overflow:visible!important}
.mwi-buffbar{width:100%;box-sizing:border-box;display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;align-items:center;justify-content:center}
.mwi-chip{font:11px/1.2 "Trebuchet MS", Verdana, Arial, sans-serif;padding:2px 6px;border-radius:10px;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;position:relative}
.mwi-icon-wrap{position:relative;width:15px;height:15px;display:inline-block}
.mwi-icon{width:15px;height:15px;display:block}
.mwi-progress-ring{position:absolute;inset:-3px;border-radius:14px;pointer-events:none;mask:linear-gradient(#000 0 0);-webkit-mask:linear-gradient(#000 0 0)}
.mwi-progress-ring::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:3px;background:conic-gradient(var(--mwi-ring-color) 0deg var(--mwi-ring-deg), transparent var(--mwi-ring-deg) 360deg);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.mwi-buff{background:#e7f4e4;color:#1e4d1a;border:1px solid #7fbf7a}
.mwi-debuff{background:#fbe3e3;color:#6b1a1a;border:1px solid #d17b7b}
`;
  (document.head || document.documentElement).appendChild(style);
  scope.add(() => style.remove());
}

/**
 * Tracks buffs/debuffs for the current battle and renders them below combat
 * units. All mutable state lives inside this closure so the feature can be
 * cleanly enabled and disabled at runtime.
 */
function createBuffTracker(scope) {
  const UNIT_STATE = new WeakMap();
  const BATTLE_STATE = { players: new Map(), monsters: new Map() };
  const PENDING_BUFFS = [];
  const PENDING_DEBUFFS = [];
  let abilitySpriteBase = null;

  function getAbilitySpriteBase() {
    if (abilitySpriteBase) return abilitySpriteBase;
    const selectors = [
      'use[href*="abilities_sprite"]',
      'use[xlink\\:href*="abilities_sprite"]',
      'img[src*="abilities_sprite"]',
      'link[href*="abilities_sprite"]',
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const href =
        node.getAttribute("href") ||
        node.getAttribute("xlink:href") ||
        node.getAttribute("src");
      if (typeof href === "string" && href.includes("abilities_sprite")) {
        abilitySpriteBase = href.split("#")[0];
        return abilitySpriteBase;
      }
    }
    abilitySpriteBase = FALLBACK_SPRITE_URL;
    return abilitySpriteBase;
  }

  function getUnitElements(areaClass) {
    const area = document.querySelector(`[class*="${areaClass}"]`);
    if (!area) return [];
    const grid = area.querySelector('[class*="BattlePanel_combatUnitGrid"]');
    if (!grid) return [];
    return Array.from(
      grid.querySelectorAll('[class*="CombatUnit_combatUnit"]'),
    );
  }

  function getBattleUnits() {
    return {
      players: getUnitElements("BattlePanel_playersArea"),
      monsters: getUnitElements("BattlePanel_monstersArea"),
    };
  }

  function ensureBuffBar(unitEl) {
    let bar = unitEl.querySelector(".mwi-buffbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "mwi-buffbar";
      // Nest the bar inside the unit's status column. It stays in flow (so it
      // never overlaps neighbouring units) and wraps to multiple rows when the
      // icons exceed the fixed status width, keeping every buff visible.
      const statusHost =
        unitEl.querySelector('[class*="CombatUnit_status"]') ?? unitEl;
      // The game gives the status column a fixed height, which would clip the
      // wrapped rows. Flag only this host so it grows to fit the bar without
      // touching any other status column's layout.
      statusHost.classList.add("mwi-has-buffbar");
      statusHost.appendChild(bar);
    }
    return bar;
  }

  function getState(unitEl) {
    let state = UNIT_STATE.get(unitEl);
    if (!state) {
      state = { effects: new Map() };
      UNIT_STATE.set(unitEl, state);
    }
    return state;
  }

  function getActionKey(state) {
    if (!state || typeof state !== "object") return null;
    if (typeof state.abilityHrid === "string" && state.abilityHrid.length > 0)
      return state.abilityHrid;
    if (state.isAutoAtk === true) return "auto";
    return null;
  }

  function seedStateFromCombatant(list, stateMap) {
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i += 1) {
      const entry = list[i];
      if (!entry || typeof entry !== "object") continue;
      const state = stateMap.get(String(i)) || {};
      const preparing =
        typeof entry.preparingAbilityHrid === "string"
          ? entry.preparingAbilityHrid
          : "";
      if (preparing) {
        state.abilityHrid = preparing;
        delete state.isAutoAtk;
      } else if (
        entry.isPreparingAutoAttack === true ||
        entry.isAutoAtk === true
      ) {
        state.isAutoAtk = true;
        delete state.abilityHrid;
      }
      if (typeof entry.currentHitpoints === "number")
        state.cHP = entry.currentHitpoints;
      if (typeof entry.currentManapoints === "number")
        state.cMP = entry.currentManapoints;
      stateMap.set(String(i), state);
    }
  }

  function clearMonsterBuffs() {
    const units = getBattleUnits().monsters;
    for (const unitEl of units) {
      if (!unitEl) continue;
      const state = UNIT_STATE.get(unitEl);
      if (state) state.effects.clear();
      const bar = unitEl.querySelector(".mwi-buffbar");
      if (bar) bar.innerHTML = "";
    }
  }

  function resetForNewBattle() {
    BATTLE_STATE.monsters.clear();
    PENDING_BUFFS.length = 0;
    PENDING_DEBUFFS.length = 0;
  }

  function handleNewBattle(signal) {
    resetForNewBattle();
    clearMonsterBuffs();
    seedStateFromCombatant(signal.players, BATTLE_STATE.players);
    seedStateFromCombatant(signal.monsters, BATTLE_STATE.monsters);
  }

  function mergeState(stateMap, patchMap, mapName) {
    const actionChanges = [];
    const hpChanges = [];
    if (!patchMap || typeof patchMap !== "object")
      return { actionChanges, hpChanges };

    const keys = Object.keys(patchMap);
    for (let idx = 0; idx < keys.length; idx += 1) {
      const key = keys[idx];
      const patch = patchMap[key];
      if (!patch || typeof patch !== "object") continue;
      const prev = stateMap.get(key) || {};
      const next = { ...prev, ...patch };
      // A combat unit is either preparing an ability or auto-attacking, never
      // both. Object-spread keeps stale keys, so normalize the mutually
      // exclusive action fields based on what this patch actually declared;
      // otherwise a leftover abilityHrid masks a switch to auto-attack and the
      // action change (which is what reveals a resolved cast) is never seen.
      const patchPreparing =
        typeof patch.preparingAbilityHrid === "string"
          ? patch.preparingAbilityHrid
          : typeof patch.abilityHrid === "string"
            ? patch.abilityHrid
            : "";
      const patchAuto =
        patch.isPreparingAutoAttack === true ||
        patch.isAutoAtk === true ||
        patch.isAutoAttack === true;
      if (patchPreparing) {
        next.abilityHrid = patchPreparing;
        delete next.isAutoAtk;
      } else if (patchAuto) {
        next.isAutoAtk = true;
        delete next.abilityHrid;
      }
      const prevAction = getActionKey(prev);
      const nextAction = getActionKey(next);
      if (prevAction && nextAction && prevAction !== nextAction) {
        actionChanges.push({ mapName, key, prevAction, nextAction });
      }
      if (
        typeof prev.cHP === "number" &&
        typeof next.cHP === "number" &&
        prev.cHP !== next.cHP
      ) {
        hpChanges.push({
          mapName,
          key,
          prevHP: prev.cHP,
          newHP: next.cHP,
          delta: next.cHP - prev.cHP,
        });
      }
      stateMap.set(key, next);
    }
    return { actionChanges, hpChanges };
  }

  function updateBattleState(payload) {
    if (!payload || typeof payload !== "object") return;
    const playerResult = mergeState(BATTLE_STATE.players, payload.pMap, "pMap");
    const monsterResult = mergeState(
      BATTLE_STATE.monsters,
      payload.mMap,
      "mMap",
    );

    const monsterHits = monsterResult.hpChanges
      .filter((h) => h.delta < 0)
      .map((h) => Number(h.key));
    for (const change of playerResult.actionChanges) {
      if (BUFFS.has(change.prevAction)) {
        const casterIndex = Number(change.key);
        if (Number.isInteger(casterIndex))
          PENDING_BUFFS.push({
            mapName: "pMap",
            casterIndex,
            abilityHrid: change.prevAction,
          });
      }
      if (!DEBUFFS.has(change.prevAction)) continue;
      if (monsterHits.length === 0) continue;
      const casterIndex = Number(change.key);
      if (!Number.isInteger(casterIndex)) continue;
      PENDING_DEBUFFS.push({
        casterMap: "pMap",
        casterIndex,
        abilityHrid: change.prevAction,
        targetSide: "monsters",
        targets: monsterHits,
      });
    }

    const playerHits = playerResult.hpChanges
      .filter((h) => h.delta < 0)
      .map((h) => Number(h.key));
    for (const change of monsterResult.actionChanges) {
      if (BUFFS.has(change.prevAction)) {
        const casterIndex = Number(change.key);
        if (Number.isInteger(casterIndex))
          PENDING_BUFFS.push({
            mapName: "mMap",
            casterIndex,
            abilityHrid: change.prevAction,
          });
      }
      if (!DEBUFFS.has(change.prevAction)) continue;
      if (playerHits.length === 0) continue;
      const casterIndex = Number(change.key);
      if (!Number.isInteger(casterIndex)) continue;
      PENDING_DEBUFFS.push({
        casterMap: "mMap",
        casterIndex,
        abilityHrid: change.prevAction,
        targetSide: "players",
        targets: playerHits,
      });
    }
  }

  function renderUnit(unitEl) {
    const state = getState(unitEl);
    const bar = ensureBuffBar(unitEl);
    const now = Date.now();
    const entries = Array.from(state.effects.values()).filter(
      (effect) => effect.expiresAt > now,
    );
    state.effects = new Map(
      entries.map((effect) => [effect.abilityHrid, effect]),
    );

    bar.innerHTML = "";
    for (const effect of entries.sort((a, b) => a.expiresAt - b.expiresAt)) {
      const chip = document.createElement("span");
      chip.className = `mwi-chip ${effect.kind === "buff" ? "mwi-buff" : "mwi-debuff"}`;
      const iconWrap = document.createElement("span");
      iconWrap.className = "mwi-icon-wrap";
      const icon = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      icon.setAttribute("role", "img");
      icon.setAttribute("aria-label", "技能");
      icon.setAttribute("class", "Icon_icon__2LtL_ mwi-icon");
      icon.setAttribute("width", "100%");
      icon.setAttribute("height", "100%");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      const spriteBase = getAbilitySpriteBase();
      const spriteRef = `${spriteBase}#${abilityId(effect.abilityHrid)}`;
      use.setAttribute("href", spriteRef);
      use.setAttribute("xlink:href", spriteRef);
      icon.appendChild(use);
      const total = Math.max(1, effect.durationSec);
      const elapsed = Math.max(
        0,
        Math.min(total, (now - effect.startedAt) / 1000),
      );
      const progress = Math.min(1, Math.max(0, elapsed / total));
      const degrees = progress * 360;
      iconWrap.appendChild(icon);
      chip.appendChild(iconWrap);
      const ring = document.createElement("span");
      ring.className = "mwi-progress-ring";
      ring.style.setProperty("--mwi-ring-deg", `${degrees}deg`);
      ring.style.setProperty(
        "--mwi-ring-color",
        effect.kind === "buff" ? "rgba(60,140,60,0.7)" : "rgba(180,60,60,0.7)",
      );
      chip.appendChild(ring);
      bar.appendChild(chip);
    }
  }

  function updateUnitEffect(unitEl, kind, abilityHrid, durationSec) {
    const state = getState(unitEl);
    const now = Date.now();
    state.effects.set(abilityHrid, {
      abilityHrid,
      kind,
      durationSec,
      startedAt: now,
      expiresAt: now + durationSec * 1000,
    });
    renderUnit(unitEl);
  }

  function applyBattleUpdated(payload) {
    const pMap = payload?.pMap;
    const mMap = payload?.mMap;
    const units = getBattleUnits();
    if (units.players.length === 0 && units.monsters.length === 0) return;
    ensureBuffStyles(scope);
    updateBattleState(payload);

    if (PENDING_BUFFS.length > 0) {
      const pending = PENDING_BUFFS.splice(0, PENDING_BUFFS.length);
      for (const item of pending) {
        if (!BUFFS.has(item.abilityHrid)) continue;
        const duration = BUFFS.get(item.abilityHrid);
        const isTeamBuff = TEAM_BUFFS.has(item.abilityHrid);
        const unitList =
          item.mapName === "pMap" ? units.players : units.monsters;
        if (isTeamBuff) {
          for (const unitEl of unitList) {
            if (unitEl)
              updateUnitEffect(unitEl, "buff", item.abilityHrid, duration);
          }
        } else {
          const unitEl = unitList[item.casterIndex];
          if (unitEl)
            updateUnitEffect(unitEl, "buff", item.abilityHrid, duration);
        }
      }
    }

    if (PENDING_DEBUFFS.length > 0) {
      const pending = PENDING_DEBUFFS.splice(0, PENDING_DEBUFFS.length);
      for (const item of pending) {
        if (!DEBUFFS.has(item.abilityHrid)) continue;
        const duration = DEBUFFS.get(item.abilityHrid);
        const applyList =
          item.targetSide === "monsters" ? units.monsters : units.players;
        // Single-target debuffs land on the first confirmed hit; others mark
        // every target that took damage this frame.
        const targets = SINGLE_TARGET_DEBUFFS.has(item.abilityHrid)
          ? item.targets.slice(0, 1)
          : item.targets;
        for (const target of targets) {
          const unitEl = applyList[target];
          if (unitEl)
            updateUnitEffect(unitEl, "debuff", item.abilityHrid, duration);
        }
      }
    }

    // Buffs sit on the caster (or the whole friendly team) and can be shown as
    // soon as the ability appears. Debuffs are handled exclusively by the
    // PENDING_DEBUFFS path above, which waits for the cast to resolve and for
    // the opposing side to actually take damage — showing them here from a
    // "preparing" ability would mislead, because a queued cast has not landed.
    const applyBuffsFromMap = (map, mapName) => {
      if (!map || typeof map !== "object") return;
      const unitList = mapName === "pMap" ? units.players : units.monsters;
      const keys = Object.keys(map);
      for (let idx = 0; idx < keys.length; idx += 1) {
        const key = keys[idx];
        const entity = map[key];
        if (!entity || typeof entity !== "object") continue;

        const abilityHrid = entity.abilityHrid;
        if (typeof abilityHrid !== "string" || abilityHrid.length === 0)
          continue;
        if (!BUFFS.has(abilityHrid)) continue;

        const duration = BUFFS.get(abilityHrid);
        const keyIndex = Number.isInteger(Number(key)) ? Number(key) : idx;

        if (TEAM_BUFFS.has(abilityHrid)) {
          for (const unitEl of unitList) {
            if (unitEl) updateUnitEffect(unitEl, "buff", abilityHrid, duration);
          }
        } else {
          const unitEl = unitList[keyIndex];
          if (unitEl) updateUnitEffect(unitEl, "buff", abilityHrid, duration);
        }
      }
    };

    applyBuffsFromMap(pMap, "pMap");
    applyBuffsFromMap(mMap, "mMap");
  }

  function tickCountdowns() {
    const units = getBattleUnits();
    for (const unitEl of [...units.players, ...units.monsters]) {
      if (UNIT_STATE.has(unitEl)) renderUnit(unitEl);
    }
  }

  function removeAllBuffBars() {
    const units = getBattleUnits();
    for (const unitEl of [...units.players, ...units.monsters]) {
      const bar = unitEl?.querySelector(".mwi-buffbar");
      if (bar) {
        bar.closest(".mwi-has-buffbar")?.classList.remove("mwi-has-buffbar");
        bar.remove();
      }
    }
  }

  return {
    handleNewBattle,
    applyBattleUpdated,
    tickCountdowns,
    removeAllBuffBars,
  };
}

runtime.features.register({
  id: "battleBuffs",
  setting: "battleBuffs",
  initialize({ scope }) {
    const tracker = createBuffTracker(scope);

    scope.interval(() => tracker.tickCountdowns(), 1000);

    scope.add(
      runtime.onMessage("new_battle", (payload) => {
        tracker.handleNewBattle(payload);
      }),
    );
    scope.add(
      runtime.onMessage("battle_updated", (payload) => {
        tracker.applyBattleUpdated(payload);
      }),
    );

    scope.add(() => tracker.removeAllBuffBars());
  },
});

// Exposed for tests and diagnostics.
Object.assign(runtime.api, {
  battleBuffs: { BUFFS, DEBUFFS, TEAM_BUFFS, SINGLE_TARGET_DEBUFFS },
});
