import { runtime } from "../core/runtime.js";
import { getGameSpriteHref } from "../core/game-assets.js";

/*
 * Battle buff/debuff overlay. Ported from the standalone "牛牛战斗Buff显示"
 * userscript (400BadRequest, MIT). Instead of installing its own WebSocket
 * proxy, this feature listens to MWITools' shared message dispatcher and draws
 * ability icons with a countdown ring below each combat unit.
 */

const STYLE_ID = "mwi-buff-style";
const STATIC_EFFECT_CAPACITY = 3;
const MARQUEE_SPEED_PX_PER_SECOND = 24;
let abilityEffectIndexSource = null;
let abilityEffectIndex = null;

function normalizedEffectToken(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll(/[^a-z]/g, "");
}

function targetsEnemy(targetType) {
  return /enem(?:y|ies)/.test(targetType);
}

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
    allTargetDebuffs: new Set(),
    buffSources: new Map(),
  };
  const entries =
    source instanceof Map ? source.entries() : Object.entries(source);
  for (const [abilityHrid, detail] of entries) {
    const effects = detail?.abilityEffects ?? [];
    const inheritedEnemyTarget = effects
      .map((effect) => normalizedEffectToken(effect?.targetType))
      .find(targetsEnemy);
    for (const effect of effects) {
      const durations = (effect?.buffs ?? [])
        .map((buff) => Number(buff?.duration) / 1e9)
        .filter((duration) => Number.isFinite(duration) && duration > 0);
      if (!durations.length) continue;
      const duration = Math.max(...durations);
      const effectType = normalizedEffectToken(effect?.effectType);
      const explicitDebuff = effectType.includes("debuff");
      const explicitBuff = !explicitDebuff && effectType.includes("buff");
      let targetType = normalizedEffectToken(effect?.targetType);
      const inferredDebuff = !explicitBuff && targetsEnemy(targetType);
      const kind = explicitDebuff || inferredDebuff ? "debuff" : "buff";
      if (!targetType && kind === "debuff") {
        targetType = inheritedEnemyTarget || "enemy";
      }
      const durationsByAbility =
        kind === "debuff" ? index.debuffs : index.buffs;
      durationsByAbility.set(
        abilityHrid,
        Math.max(duration, durationsByAbility.get(abilityHrid) ?? 0),
      );
      if (kind === "buff" && targetType.includes("allallies")) {
        index.teamBuffs.add(abilityHrid);
      }
      if (kind === "debuff") {
        if (targetType.includes("allenemies")) {
          index.allTargetDebuffs.add(abilityHrid);
        } else {
          index.singleTargetDebuffs.add(abilityHrid);
        }
      }
      for (const buff of effect?.buffs ?? []) {
        const uniqueHrid = String(buff?.uniqueHrid ?? "");
        if (!uniqueHrid) continue;
        index.buffSources.set(uniqueHrid, {
          abilityHrid,
          duration,
          kind,
        });
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
const ALL_TARGET_DEBUFFS = dynamicCollection("allTargetDebuffs");

function ensureBuffStyles(scope) {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
	.mwi-has-buffbar{height:auto!important;min-height:0;overflow:visible!important}
	.mwi-buff-shell{width:100%;height:21px;box-sizing:border-box;margin-top:4px}
	.mwi-buffbar{position:relative;width:100%;height:21px;box-sizing:border-box;overflow:hidden}
	.mwi-buff-track{width:100%;height:21px;display:flex;align-items:center}
	.mwi-buff-sequence{width:100%;height:21px;display:flex;flex:none;gap:4px;align-items:center;justify-content:center}
	.mwi-buffbar[data-scrolling="true"] .mwi-buff-track{width:max-content;animation:mwi-buff-marquee var(--mwi-marquee-duration,8s) linear infinite;will-change:transform}
	.mwi-buffbar[data-scrolling="true"] .mwi-buff-sequence{width:max-content;justify-content:flex-start}
	.mwi-chip{font:11px/1.2 "Trebuchet MS", Verdana, Arial, sans-serif;padding:2px 6px;border-radius:10px;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;position:relative}
.mwi-icon-wrap{position:relative;width:15px;height:15px;display:inline-block}
.mwi-icon{width:15px;height:15px;display:block}
.mwi-progress-ring{position:absolute;inset:-3px;border-radius:14px;pointer-events:none;mask:linear-gradient(#000 0 0);-webkit-mask:linear-gradient(#000 0 0)}
.mwi-progress-ring::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:3px;background:conic-gradient(var(--mwi-ring-color) 0deg var(--mwi-ring-deg), transparent var(--mwi-ring-deg) 360deg);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
	.mwi-buff{background:#e7f4e4;color:#1e4d1a;border:1px solid #7fbf7a}
	.mwi-debuff{background:#fbe3e3;color:#6b1a1a;border:1px solid #d17b7b}
	@keyframes mwi-buff-marquee{to{transform:translate3d(calc(-1 * var(--mwi-marquee-distance,0px)),0,0)}}
	@media (prefers-reduced-motion:reduce){.mwi-buffbar[data-scrolling="true"]{overflow-x:auto}.mwi-buffbar[data-scrolling="true"] .mwi-buff-track{animation:none;will-change:auto}.mwi-buffbar[data-scrolling="true"] .mwi-buff-sequence[aria-hidden="true"]{display:none}}
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
    let shell = unitEl.querySelector(".mwi-buff-shell");
    let bar = shell?.querySelector(".mwi-buffbar");
    if (!shell || !bar) {
      shell = document.createElement("div");
      shell.className = "mwi-buff-shell";
      bar = document.createElement("div");
      bar.className = "mwi-buffbar";
      shell.append(bar);
      // Nest the fixed single-row viewport inside the unit's status column so
      // it stays in flow and never overlaps neighbouring units.
      const statusHost =
        unitEl.querySelector('[class*="CombatUnit_status"]') ?? unitEl;
      statusHost.classList.add("mwi-has-buffbar");
      statusHost.appendChild(shell);
    }
    return bar;
  }

  function ensureBattleBuffBars(units = getBattleUnits()) {
    for (const unitList of Object.values(units)) {
      unitList.forEach((unitEl) => {
        if (unitEl) ensureBuffBar(unitEl);
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
        delete bar.dataset.scrolling;
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
      const casterIndex = Number(change.key);
      if (!Number.isInteger(casterIndex)) continue;
      const livingTargets = [...BATTLE_STATE.monsters.entries()]
        .filter(([, state]) => Number(state?.cHP) > 0)
        .map(([key]) => Number(key))
        .filter(Number.isInteger);
      const targets = monsterHits.length
        ? monsterHits
        : buildAbilityEffectIndex().allTargetDebuffs.has(change.prevAction)
          ? livingTargets
          : livingTargets.length === 1
            ? livingTargets
            : [];
      if (!targets.length) continue;
      PENDING_DEBUFFS.push({
        casterMap: "pMap",
        casterIndex,
        abilityHrid: change.prevAction,
        targetSide: "monsters",
        targets,
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
      const casterIndex = Number(change.key);
      if (!Number.isInteger(casterIndex)) continue;
      const livingTargets = [...BATTLE_STATE.players.entries()]
        .filter(([, state]) => Number(state?.cHP) > 0)
        .map(([key]) => Number(key))
        .filter(Number.isInteger);
      const targets = playerHits.length
        ? playerHits
        : buildAbilityEffectIndex().allTargetDebuffs.has(change.prevAction)
          ? livingTargets
          : livingTargets.length === 1
            ? livingTargets
            : [];
      if (!targets.length) continue;
      PENDING_DEBUFFS.push({
        casterMap: "mMap",
        casterIndex,
        abilityHrid: change.prevAction,
        targetSide: "players",
        targets,
      });
    }
  }

  function durationSeconds(value, fallback) {
    const duration = Number(value);
    if (!Number.isFinite(duration) || duration <= 0) return fallback;
    if (duration > 86_400_000) return duration / 1e9;
    if (duration > 1_000) return duration / 1_000;
    return duration;
  }

  function applyAuthoritativeCombatBuffMaps(payload, units) {
    const authoritativeEffects = new Set();
    const effectKey = (mapName, unitIndex, kind, abilityHrid) =>
      `${mapName}:${unitIndex}:${kind}:${abilityHrid}`;
    for (const [mapName, unitList] of [
      ["pMap", units.players],
      ["mMap", units.monsters],
    ]) {
      const map = payload?.[mapName];
      if (!map || typeof map !== "object") continue;
      for (const [key, entity] of Object.entries(map)) {
        if (
          !entity?.combatBuffMap ||
          typeof entity.combatBuffMap !== "object"
        ) {
          continue;
        }
        const unitEl = unitList[Number(key)];
        if (!unitEl) continue;
        for (const buff of Object.values(entity.combatBuffMap)) {
          if (!buff || typeof buff !== "object") continue;
          const uniqueHrid = String(buff.uniqueHrid ?? "");
          const source = buildAbilityEffectIndex().buffSources.get(uniqueHrid);
          const abilityHrid = String(
            buff.sourceAbilityHrid ??
              buff.abilityHrid ??
              source?.abilityHrid ??
              "",
          );
          if (!abilityHrid) continue;
          const kind =
            source?.kind ?? (DEBUFFS.has(abilityHrid) ? "debuff" : "buff");
          const durationSec = durationSeconds(
            buff.duration,
            source?.duration ??
              (kind === "debuff"
                ? DEBUFFS.get(abilityHrid)
                : BUFFS.get(abilityHrid)) ??
              1,
          );
          const parsedStart = Date.parse(String(buff.startTime ?? ""));
          const startedAt = Number.isFinite(parsedStart)
            ? parsedStart
            : Date.now();
          const expiresAt = startedAt + durationSec * 1000;
          if (expiresAt <= Date.now()) continue;
          authoritativeEffects.add(
            effectKey(mapName, Number(key), kind, abilityHrid),
          );
          updateUnitEffect(unitEl, kind, abilityHrid, durationSec, {
            startedAt,
            expiresAt,
          });
        }
      }
    }
    return {
      has(mapName, unitIndex, kind, abilityHrid) {
        return authoritativeEffects.has(
          effectKey(mapName, unitIndex, kind, abilityHrid),
        );
      },
    };
  }

  function effectKey(kind, abilityHrid) {
    return `${kind}\u001f${abilityHrid}`;
  }

  function createEffectChip(effect) {
    const chip = document.createElement("span");
    chip.className = `mwi-chip ${effect.kind === "buff" ? "mwi-buff" : "mwi-debuff"}`;
    chip.dataset.effectKey = effectKey(effect.kind, effect.abilityHrid);
    const iconWrap = document.createElement("span");
    iconWrap.className = "mwi-icon-wrap";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
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
    const ring = document.createElement("span");
    ring.className = "mwi-progress-ring";
    ring.style.setProperty(
      "--mwi-ring-color",
      effect.kind === "buff" ? "rgba(60,140,60,0.7)" : "rgba(180,60,60,0.7)",
    );
    chip.append(iconWrap, ring);
    return chip;
  }

  function updateMarqueeMetrics(bar, effectCount) {
    if (effectCount <= STATIC_EFFECT_CAPACITY) return;
    const sequence = bar.querySelector(
      '.mwi-buff-sequence:not([aria-hidden="true"])',
    );
    if (!sequence) return;
    const distance = Math.max(sequence.scrollWidth || effectCount * 31, 1) + 4;
    const duration = Math.max(4, distance / MARQUEE_SPEED_PX_PER_SECOND);
    const distanceValue = `${distance}px`;
    const durationValue = `${duration}s`;
    if (
      bar.style.getPropertyValue("--mwi-marquee-distance") !== distanceValue
    ) {
      bar.style.setProperty("--mwi-marquee-distance", distanceValue);
    }
    if (
      bar.style.getPropertyValue("--mwi-marquee-duration") !== durationValue
    ) {
      bar.style.setProperty("--mwi-marquee-duration", durationValue);
    }
  }

  function rebuildEffectTrack(bar, entries) {
    const track = document.createElement("div");
    track.className = "mwi-buff-track";
    const sequence = document.createElement("div");
    sequence.className = "mwi-buff-sequence";
    for (const effect of entries) sequence.append(createEffectChip(effect));
    track.append(sequence);
    if (entries.length > STATIC_EFFECT_CAPACITY) {
      const duplicate = sequence.cloneNode(true);
      duplicate.setAttribute("aria-hidden", "true");
      track.append(duplicate);
      bar.dataset.scrolling = "true";
    } else {
      delete bar.dataset.scrolling;
      bar.style.removeProperty("--mwi-marquee-distance");
      bar.style.removeProperty("--mwi-marquee-duration");
    }
    bar.replaceChildren(track);
    updateMarqueeMetrics(bar, entries.length);
  }

  function updateCountdownRings(bar, entries, now) {
    for (const effect of entries) {
      const total = Math.max(1, effect.durationSec);
      const elapsed = Math.max(
        0,
        Math.min(total, (now - effect.startedAt) / 1000),
      );
      const degrees = Math.min(1, Math.max(0, elapsed / total)) * 360;
      const key = effectKey(effect.kind, effect.abilityHrid);
      for (const chip of bar.querySelectorAll(".mwi-chip")) {
        if (chip.dataset.effectKey !== key) continue;
        chip
          .querySelector(".mwi-progress-ring")
          ?.style.setProperty("--mwi-ring-deg", `${degrees}deg`);
      }
    }
  }

  function renderUnit(unitEl) {
    const state = getState(unitEl);
    const bar = ensureBuffBar(unitEl);
    const now = Date.now();
    const entries = Array.from(state.effects.values())
      .filter((effect) => effect.expiresAt > now)
      .sort((a, b) => a.expiresAt - b.expiresAt);
    state.effects = new Map(
      entries.map((effect) => [
        effectKey(effect.kind, effect.abilityHrid),
        effect,
      ]),
    );
    const signature = entries
      .map((effect) => effectKey(effect.kind, effect.abilityHrid))
      .join("\u001e");
    if (state.renderSignature !== signature) {
      rebuildEffectTrack(bar, entries);
      state.renderSignature = signature;
    } else {
      updateMarqueeMetrics(bar, entries.length);
    }
    updateCountdownRings(bar, entries, now);
  }

  function updateUnitEffect(
    unitEl,
    kind,
    abilityHrid,
    durationSec,
    timing = {},
  ) {
    const state = getState(unitEl);
    const now = Date.now();
    const startedAt = Number(timing.startedAt) || now;
    const expiresAt = Number(timing.expiresAt) || now + durationSec * 1000;
    state.effects.set(effectKey(kind, abilityHrid), {
      abilityHrid,
      kind,
      durationSec,
      startedAt,
      expiresAt,
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
    const authoritativeEffects = applyAuthoritativeCombatBuffMaps(
      payload,
      units,
    );

    if (PENDING_BUFFS.length > 0) {
      const pending = PENDING_BUFFS.splice(0, PENDING_BUFFS.length);
      for (const item of pending) {
        if (!BUFFS.has(item.abilityHrid)) continue;
        const duration = BUFFS.get(item.abilityHrid);
        const isTeamBuff = TEAM_BUFFS.has(item.abilityHrid);
        const unitList =
          item.mapName === "pMap" ? units.players : units.monsters;
        if (isTeamBuff) {
          for (let unitIndex = 0; unitIndex < unitList.length; unitIndex += 1) {
            const unitEl = unitList[unitIndex];
            if (
              unitEl &&
              !authoritativeEffects.has(
                item.mapName,
                unitIndex,
                "buff",
                item.abilityHrid,
              )
            ) {
              updateUnitEffect(unitEl, "buff", item.abilityHrid, duration);
            }
          }
        } else {
          const unitEl = unitList[item.casterIndex];
          if (
            unitEl &&
            !authoritativeEffects.has(
              item.mapName,
              item.casterIndex,
              "buff",
              item.abilityHrid,
            )
          ) {
            updateUnitEffect(unitEl, "buff", item.abilityHrid, duration);
          }
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
        const targetMapName = item.targetSide === "monsters" ? "mMap" : "pMap";
        // Single-target debuffs land on the first confirmed hit; others mark
        // every target that took damage this frame.
        const targets = SINGLE_TARGET_DEBUFFS.has(item.abilityHrid)
          ? item.targets.slice(0, 1)
          : item.targets;
        for (const target of targets) {
          const unitEl = applyList[target];
          if (
            unitEl &&
            !authoritativeEffects.has(
              targetMapName,
              target,
              "debuff",
              item.abilityHrid,
            )
          ) {
            updateUnitEffect(unitEl, "debuff", item.abilityHrid, duration);
          }
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
          for (let unitIndex = 0; unitIndex < unitList.length; unitIndex += 1) {
            const unitEl = unitList[unitIndex];
            if (
              unitEl &&
              !authoritativeEffects.has(mapName, unitIndex, "buff", abilityHrid)
            ) {
              updateUnitEffect(unitEl, "buff", abilityHrid, duration);
            }
          }
        } else {
          const unitEl = unitList[keyIndex];
          if (
            unitEl &&
            !authoritativeEffects.has(mapName, keyIndex, "buff", abilityHrid)
          ) {
            updateUnitEffect(unitEl, "buff", abilityHrid, duration);
          }
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
  battleBuffs: {
    BUFFS,
    DEBUFFS,
    TEAM_BUFFS,
    SINGLE_TARGET_DEBUFFS,
    ALL_TARGET_DEBUFFS,
  },
});
