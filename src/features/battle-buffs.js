import { runtime } from "../core/runtime.js";
import { getGameSpriteHref } from "../core/game-assets.js";

/*
 * Battle buff/debuff overlay. Ported from the standalone "牛牛战斗Buff显示"
 * userscript (400BadRequest, MIT). Instead of installing its own WebSocket
 * proxy, this feature listens to MWITools' shared message dispatcher and draws
 * ability icons with a countdown ring below each combat unit.
 */

const STYLE_ID = "mwi-buff-style";
const EXPANSION_STORAGE_KEY = "MWITools_battle_buff_expansion_v1";
const COLLAPSED_CAPACITY = 3;
const EXPANDED_CAPACITY = 6;
let abilityEffectIndexSource = null;
let abilityEffectIndex = null;

function buildAbilityEffectIndex() {
  const source = runtime.state.initData_abilityDetailMap ?? {};
  if (source === abilityEffectIndexSource && abilityEffectIndex) {
    return abilityEffectIndex;
  }
  const index = {
    buffs: new Map(),
    debuffs: new Map(),
    teamBuffs: new Set(),
    singleTargetDebuffs: new Set(),
  };
  const entries =
    source instanceof Map ? source.entries() : Object.entries(source);
  for (const [abilityHrid, detail] of entries) {
    for (const effect of detail?.abilityEffects ?? []) {
      const durations = (effect?.buffs ?? [])
        .map((buff) => Number(buff?.duration) / 1e9)
        .filter((duration) => Number.isFinite(duration) && duration > 0);
      if (!durations.length) continue;
      const duration = Math.max(...durations);
      const targetType = String(effect?.targetType ?? "")
        .toLowerCase()
        .replaceAll(/[^a-z]/g, "");
      const targetsEnemy = targetType.includes("enemy");
      const durationsByAbility = targetsEnemy ? index.debuffs : index.buffs;
      durationsByAbility.set(
        abilityHrid,
        Math.max(duration, durationsByAbility.get(abilityHrid) ?? 0),
      );
      if (!targetsEnemy && targetType.includes("allallies")) {
        index.teamBuffs.add(abilityHrid);
      }
      if (targetsEnemy && !targetType.includes("allenemies")) {
        index.singleTargetDebuffs.add(abilityHrid);
      }
    }
  }
  abilityEffectIndexSource = source;
  abilityEffectIndex = index;
  return index;
}

function dynamicCollection(key) {
  return Object.freeze({
    has(value) {
      return buildAbilityEffectIndex()[key].has(value);
    },
    get(value) {
      return buildAbilityEffectIndex()[key].get(value);
    },
    [Symbol.iterator]() {
      return buildAbilityEffectIndex()[key][Symbol.iterator]();
    },
  });
}

const BUFFS = dynamicCollection("buffs");
const DEBUFFS = dynamicCollection("debuffs");
const TEAM_BUFFS = dynamicCollection("teamBuffs");
const SINGLE_TARGET_DEBUFFS = dynamicCollection("singleTargetDebuffs");

function ensureBuffStyles(scope) {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.mwi-has-buffbar{height:auto!important;min-height:0;overflow:visible!important}
.mwi-buff-shell{width:100%;box-sizing:border-box;display:grid;grid-template-rows:21px 18px;margin-top:4px}
.mwi-buff-shell[data-expanded="true"]{grid-template-rows:46px 18px}
.mwi-buffbar{width:100%;height:21px;max-height:21px;box-sizing:border-box;display:flex;flex-wrap:wrap;gap:4px;overflow:hidden;align-content:flex-start;align-items:center;justify-content:center}
.mwi-buff-shell[data-expanded="true"] .mwi-buffbar{height:46px;max-height:46px;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
.mwi-buff-toggle{width:100%;height:18px;box-sizing:border-box;padding:0;border:0;background:transparent;color:inherit;font:700 10px/18px "Trebuchet MS",Verdana,Arial,sans-serif;cursor:pointer;opacity:.7;text-align:center}
.mwi-buff-toggle:hover,.mwi-buff-toggle:focus-visible{opacity:1;background:rgba(127,127,127,.12);outline:none}
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
  const expandedUnitKeys = (() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(EXPANSION_STORAGE_KEY) || "[]",
      );
      return new Set(
        Array.isArray(stored)
          ? stored.filter((value) => typeof value === "string" && value)
          : [],
      );
    } catch {
      return new Set();
    }
  })();

  function persistExpandedUnitKeys() {
    try {
      localStorage.setItem(
        EXPANSION_STORAGE_KEY,
        JSON.stringify([...expandedUnitKeys].sort()),
      );
    } catch {
      // Persistence is optional when browser storage is unavailable.
    }
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

  function unitStorageKeys(side, units) {
    const occurrences = new Map();
    return units.map((unitEl, index) => {
      const name = String(
        unitEl.querySelector('[class*="CombatUnit_name"]')?.textContent ?? "",
      )
        .replaceAll(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase();
      if (!name) return `${side}:slot:${index}`;
      const occurrence = occurrences.get(name) ?? 0;
      occurrences.set(name, occurrence + 1);
      return `${side}:name:${name}:${occurrence}`;
    });
  }

  function updateBuffToggle(shell, effectCount) {
    const expanded = shell.dataset.expanded === "true";
    const capacity = expanded ? EXPANDED_CAPACITY : COLLAPSED_CAPACITY;
    const hiddenCount = Math.max(0, effectCount - capacity);
    const toggle = shell.querySelector(".mwi-buff-toggle");
    if (!toggle) return;
    toggle.setAttribute("aria-expanded", String(expanded));
    const direction = expanded ? "▴" : "▾";
    toggle.textContent = hiddenCount
      ? `+${hiddenCount} ${direction}`
      : direction;
    const action = expanded
      ? runtime.config.isZH
        ? "折叠 Buff"
        : "Collapse buffs"
      : runtime.config.isZH
        ? "展开 Buff"
        : "Expand buffs";
    const overflow = hiddenCount
      ? runtime.config.isZH
        ? `，另有 ${hiddenCount} 个`
        : `, ${hiddenCount} more`
      : "";
    toggle.setAttribute("aria-label", `${action}${overflow}`);
    toggle.title = `${action}${overflow}`;
  }

  function setBuffShellExpanded(shell, expanded, { persist = false } = {}) {
    shell.dataset.expanded = String(expanded);
    const bar = shell.querySelector(".mwi-buffbar");
    if (!expanded && bar) bar.scrollTop = 0;
    updateBuffToggle(shell, bar?.childElementCount ?? 0);
    if (!persist) return;
    const storageKey = shell.dataset.storageKey;
    if (!storageKey) return;
    if (expanded) expandedUnitKeys.add(storageKey);
    else expandedUnitKeys.delete(storageKey);
    persistExpandedUnitKeys();
  }

  function ensureBuffBar(unitEl, storageKey = "") {
    let shell = unitEl.querySelector(".mwi-buff-shell");
    let bar = shell?.querySelector(".mwi-buffbar");
    if (!shell || !bar) {
      shell = document.createElement("div");
      shell.className = "mwi-buff-shell";
      bar = document.createElement("div");
      bar.className = "mwi-buffbar";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "mwi-buff-toggle";
      toggle.addEventListener("click", () => {
        setBuffShellExpanded(shell, shell.dataset.expanded !== "true", {
          persist: true,
        });
      });
      shell.append(bar, toggle);
      // Nest the shell inside the unit's status column. It stays in flow (so it
      // never overlaps neighbouring units) while its fixed viewport clips or
      // scrolls overflow without changing the card height.
      const statusHost =
        unitEl.querySelector('[class*="CombatUnit_status"]') ?? unitEl;
      // The game gives the status column a fixed height, which would clip the
      // wrapped rows. Flag only this host so it grows to fit the bar without
      // touching any other status column's layout.
      statusHost.classList.add("mwi-has-buffbar");
      statusHost.appendChild(shell);
    }
    const resolvedStorageKey =
      storageKey || unitEl.dataset.mwiBuffStorageKey || "";
    if (resolvedStorageKey) {
      unitEl.dataset.mwiBuffStorageKey = resolvedStorageKey;
      if (shell.dataset.storageKey !== resolvedStorageKey) {
        shell.dataset.storageKey = resolvedStorageKey;
        setBuffShellExpanded(shell, expandedUnitKeys.has(resolvedStorageKey));
      }
    } else if (!shell.hasAttribute("data-expanded")) {
      setBuffShellExpanded(shell, false);
    }
    return bar;
  }

  function ensureBattleBuffBars(units = getBattleUnits()) {
    for (const [side, unitList] of Object.entries(units)) {
      const storageKeys = unitStorageKeys(side, unitList);
      unitList.forEach((unitEl, index) => {
        if (unitEl) ensureBuffBar(unitEl, storageKeys[index]);
      });
    }
    return units;
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
      if (bar) {
        bar.replaceChildren();
        const shell = bar.closest(".mwi-buff-shell");
        if (shell) updateBuffToggle(shell, 0);
      }
    }
  }

  function resetForNewBattle() {
    BATTLE_STATE.monsters.clear();
    PENDING_BUFFS.length = 0;
    PENDING_DEBUFFS.length = 0;
  }

  function handleNewBattle(signal) {
    resetForNewBattle();
    ensureBattleBuffBars();
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

    const scrollTop = bar.scrollTop;
    bar.replaceChildren();
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
      icon.setAttribute("aria-label", runtime.config.isZH ? "技能" : "Ability");
      icon.setAttribute("class", "Icon_icon__2LtL_ mwi-icon");
      icon.setAttribute("width", "100%");
      icon.setAttribute("height", "100%");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      const spriteRef = getGameSpriteHref("abilities", effect.abilityHrid);
      if (spriteRef) {
        use.setAttribute("href", spriteRef);
        use.setAttribute("xlink:href", spriteRef);
        icon.appendChild(use);
        iconWrap.appendChild(icon);
      } else {
        iconWrap.textContent = "?";
      }
      const total = Math.max(1, effect.durationSec);
      const elapsed = Math.max(
        0,
        Math.min(total, (now - effect.startedAt) / 1000),
      );
      const progress = Math.min(1, Math.max(0, elapsed / total));
      const degrees = progress * 360;
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
    if (bar.closest(".mwi-buff-shell")?.dataset.expanded === "true") {
      bar.scrollTop = scrollTop;
    }
    const shell = bar.closest(".mwi-buff-shell");
    if (shell) updateBuffToggle(shell, entries.length);
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
    const units = ensureBattleBuffBars();
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
    let active = false;
    for (const unitEl of [...units.players, ...units.monsters]) {
      if (!UNIT_STATE.has(unitEl)) continue;
      renderUnit(unitEl);
      if (UNIT_STATE.get(unitEl)?.effects?.size) active = true;
    }
    return active;
  }

  function hasActiveEffects() {
    const now = Date.now();
    const units = getBattleUnits();
    return [...units.players, ...units.monsters].some((unitEl) =>
      [...(UNIT_STATE.get(unitEl)?.effects?.values?.() ?? [])].some(
        (effect) => effect.expiresAt > now,
      ),
    );
  }

  function removeAllBuffBars() {
    const units = getBattleUnits();
    for (const unitEl of [...units.players, ...units.monsters]) {
      const shell = unitEl?.querySelector(".mwi-buff-shell");
      const bar = unitEl?.querySelector(".mwi-buffbar");
      if (shell || bar) {
        (shell ?? bar)
          .closest(".mwi-has-buffbar")
          ?.classList.remove("mwi-has-buffbar");
        (shell ?? bar).remove();
        delete unitEl.dataset.mwiBuffStorageKey;
      }
    }
  }

  return {
    handleNewBattle,
    applyBattleUpdated,
    hasActiveEffects,
    mountBuffBars: ensureBattleBuffBars,
    tickCountdowns,
    removeAllBuffBars,
  };
}

runtime.features.register({
  id: "battleBuffs",
  setting: "battleBuffs",
  initialize({ scope }) {
    const tracker = createBuffTracker(scope);
    ensureBuffStyles(scope);
    tracker.mountBuffBars();
    let countdownTimer = null;
    const tick = () => {
      countdownTimer = null;
      if (tracker.tickCountdowns()) {
        countdownTimer = setTimeout(tick, 1000);
      }
    };
    const ensureCountdown = () => {
      if (countdownTimer === null && tracker.hasActiveEffects()) {
        countdownTimer = setTimeout(tick, 1000);
      }
    };

    scope.add(
      runtime.onMessage("new_battle", (payload) => {
        tracker.handleNewBattle(payload);
        ensureCountdown();
      }),
    );
    scope.add(
      runtime.onMessage("battle_updated", (payload) => {
        tracker.applyBattleUpdated(payload);
        ensureCountdown();
      }),
    );

    scope.add(() => {
      if (countdownTimer !== null) clearTimeout(countdownTimer);
      tracker.removeAllBuffBars();
    });
  },
});

// Exposed for tests and diagnostics.
Object.assign(runtime.api, {
  battleBuffs: { BUFFS, DEBUFFS, TEAM_BUFFS, SINGLE_TARGET_DEBUFFS },
});
