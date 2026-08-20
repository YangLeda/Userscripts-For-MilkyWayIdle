import { Settings, el } from "./00-bootstrap.js";
import { ClassSystem, DamageSources } from "./10-combat-sources.js";

// ─── Session ──────────────────────────────────────────────────────────────────
// DPS = dégâts cumulés / temps écoulé depuis le dernier reset.
// Kills attribués au joueur acteur du message où le monstre atteint cHP=0.
const Session = (() => {
  let startTs = performance.now();
  let elapsedOffset = 0;
  let teamDamage = 0;
  let frozenAt = null; // si non-null : elapsed() renvoie cette valeur figée
  // (Trial de guilde terminé — dégâts ET durée figés,
  // au lieu de laisser le DPS décroître artificiellement
  // en continuant à diviser par un temps qui s'allonge
  // alors que plus aucun dégât n'arrive).
  let meta = {};
  let fragments = [];
  let fragmentStart = Date.now();
  let fragmentReason = "开始战斗";
  let fragmentBase = {
    teamDamage: 0,
    damage: {},
    sources: {},
    healing: {},
    taken: {},
    takenSources: {},
    kills: {},
    accuracy: {},
  };
  let fragmentPrefix = null; // tier 续接时合并上一段，且不把换层等待计入时长
  const playerDamage = new Map();
  const playerDamageSources = new Map();
  const playerHealing = new Map();
  const playerKills = new Map();
  const playerTaken = new Map(); // dégâts reçus par joueur (mode Recount)
  const playerTakenSources = new Map(); // 玩家 → Map(怪物＋技能来源 → 承伤)
  const playerAccuracy = new Map(); // 玩家 → { attempts, hits, monsters: Map }

  // Buffer circulaire pour le graph DPS (panneau principal) : 150 points de
  // 2s = 5 min glissantes. Adapté au combat classique (sessions courtes,
  // souvent réinitialisées).
  // bossBuckets[] mémorise pour chaque bucket si le combat en cours était un boss,
  // ce qui permet au render de colorier chaque segment teal (normal) ou rouge (boss).
  const BUCKETS = 150,
    BUCKET_MS = 2000;
  const dmgBuckets = new Array(BUCKETS).fill(0);
  const bossBuckets = new Array(BUCKETS).fill(false);
  let curBucket = 0,
    bucketTs = performance.now();
  let _isBoss = false;

  // Second historique, NON rebouclé, pour le graphe du Recount (Trial de
  // guilde) : grandit tout du long au lieu d'être limité à 5 minutes.
  // Plafonné à 1h (= durée max connue d'un Trial, 3 600 000ms observés dans
  // budgetRemainingMs) + marge, largement suffisant en mémoire (quelques Ko).
  const FULL_MAX_BUCKETS = 1900; // 1900×2s ≈ 63min, marge au-delà de 1h pile
  const fullDmgBuckets = [0];
  const fullBossBuckets = [false];
  let fullBucketTs = performance.now();

  const mapObject = (m) => Object.fromEntries(m);
  const restoreMap = (target, obj) => {
    target.clear();
    Object.entries(obj || {}).forEach(([k, v]) =>
      target.set(k, Number(v) || 0),
    );
  };
  const nestedMapObject = (map) =>
    Object.fromEntries(
      Array.from(map, ([name, sources]) => [name, Object.fromEntries(sources)]),
    );
  const restoreNestedMap = (target, obj) => {
    target.clear();
    Object.entries(obj || {}).forEach(([name, sources]) => {
      const map = new Map();
      Object.entries(sources || {}).forEach(([source, value]) =>
        map.set(source, Number(value) || 0),
      );
      target.set(name, map);
    });
  };
  const accuracyObject = (map) =>
    Object.fromEntries(
      Array.from(map, ([name, value]) => [
        name,
        {
          attempts: Number(value.attempts) || 0,
          hits: Number(value.hits) || 0,
          monsters: Object.fromEntries(value.monsters || []),
        },
      ]),
    );
  const restoreAccuracy = (target, raw) => {
    target.clear();
    Object.entries(raw || {}).forEach(([name, value]) => {
      const monsters = new Map();
      Object.entries((value && value.monsters) || {}).forEach(
        ([key, monster]) => {
          const attempts = Number(monster && monster.attempts) || 0;
          if (!(attempts > 0)) return;
          monsters.set(key, {
            monsterName: String((monster && monster.monsterName) || ""),
            monsterHrid: String((monster && monster.monsterHrid) || ""),
            attempts,
            hits: Math.max(
              0,
              Math.min(attempts, Number(monster && monster.hits) || 0),
            ),
          });
        },
      );
      const attempts = Number(value && value.attempts) || 0;
      if (!(attempts > 0) && !monsters.size) return;
      target.set(name, {
        attempts,
        hits: Math.max(0, Math.min(attempts, Number(value && value.hits) || 0)),
        monsters,
      });
    });
  };
  const accuracyDelta = (map, base = {}) =>
    Object.fromEntries(
      Array.from(map, ([name, value]) => {
        const previous = base[name] || {},
          previousMonsters = previous.monsters || {};
        const monsters = Object.fromEntries(
          Array.from(value.monsters || [], ([key, monster]) => {
            const old = previousMonsters[key] || {},
              attempts =
                (Number(monster.attempts) || 0) - (Number(old.attempts) || 0),
              hits = (Number(monster.hits) || 0) - (Number(old.hits) || 0);
            return [
              key,
              {
                monsterName: monster.monsterName || old.monsterName || "",
                monsterHrid: monster.monsterHrid || old.monsterHrid || "",
                attempts,
                hits,
              },
            ];
          }).filter(([, monster]) => monster.attempts > 0),
        );
        const attempts =
            (Number(value.attempts) || 0) - (Number(previous.attempts) || 0),
          hits = (Number(value.hits) || 0) - (Number(previous.hits) || 0);
        return [name, { attempts, hits, monsters }];
      }).filter(
        ([, value]) => value.attempts > 0 || Object.keys(value.monsters).length,
      ),
    );
  const accuracyBaseFromDelta = (map, delta = {}) => {
    const base = accuracyObject(map);
    Object.entries(delta || {}).forEach(([name, value]) => {
      if (!base[name]) return;
      base[name].attempts = Math.max(
        0,
        (Number(base[name].attempts) || 0) -
          (Number(value && value.attempts) || 0),
      );
      base[name].hits = Math.max(
        0,
        (Number(base[name].hits) || 0) - (Number(value && value.hits) || 0),
      );
      Object.entries((value && value.monsters) || {}).forEach(
        ([key, monster]) => {
          if (!base[name].monsters[key]) return;
          base[name].monsters[key].attempts = Math.max(
            0,
            (Number(base[name].monsters[key].attempts) || 0) -
              (Number(monster && monster.attempts) || 0),
          );
          base[name].monsters[key].hits = Math.max(
            0,
            (Number(base[name].monsters[key].hits) || 0) -
              (Number(monster && monster.hits) || 0),
          );
          if (!(base[name].monsters[key].attempts > 0))
            delete base[name].monsters[key];
        },
      );
      if (
        !(base[name].attempts > 0) &&
        !Object.keys(base[name].monsters).length
      )
        delete base[name];
    });
    return base;
  };
  const nestedDelta = (map, base = {}) =>
    Object.fromEntries(
      Array.from(map, ([name, sources]) => {
        const previous = base[name] || {};
        const values = Object.fromEntries(
          Array.from(sources, ([source, value]) => [
            source,
            value - (Number(previous[source]) || 0),
          ]).filter(([, value]) => value !== 0),
        );
        return [name, values];
      }).filter(([, values]) => Object.keys(values).length),
    );
  const mapDelta = (map, base) =>
    Object.fromEntries(
      Array.from(map, ([k, v]) => [k, v - (base[k] || 0)]).filter(
        ([, v]) => v !== 0,
      ),
    );
  function elapsed() {
    return frozenAt !== null
      ? frozenAt
      : elapsedOffset + (performance.now() - startTs) / 1000;
  }
  function currentFragment(endAt = Date.now()) {
    if (fragmentStart === null) return null;
    const activeDuration = Math.max(0, endAt - fragmentStart);
    return {
      startedAt:
        (fragmentPrefix && fragmentPrefix.startedAt) ||
        new Date(fragmentStart).toISOString(),
      endedAt: new Date(endAt).toISOString(),
      reason: fragmentReason,
      durationMs:
        ((fragmentPrefix && fragmentPrefix.durationMs) || 0) + activeDuration,
      teamDamage: teamDamage - fragmentBase.teamDamage,
      players: {
        damage: mapDelta(playerDamage, fragmentBase.damage),
        sources: nestedDelta(playerDamageSources, fragmentBase.sources),
        healing: mapDelta(playerHealing, fragmentBase.healing),
        taken: mapDelta(playerTaken, fragmentBase.taken),
        takenSources: nestedDelta(
          playerTakenSources,
          fragmentBase.takenSources,
        ),
        kills: mapDelta(playerKills, fragmentBase.kills),
        accuracy: accuracyDelta(playerAccuracy, fragmentBase.accuracy),
      },
    };
  }
  function beginFragment(reason) {
    fragmentStart = Date.now();
    fragmentReason = reason || "断线续传";
    fragmentBase = {
      teamDamage,
      damage: mapObject(playerDamage),
      sources: nestedMapObject(playerDamageSources),
      healing: mapObject(playerHealing),
      taken: mapObject(playerTaken),
      takenSources: nestedMapObject(playerTakenSources),
      kills: mapObject(playerKills),
      accuracy: accuracyObject(playerAccuracy),
    };
    fragmentPrefix = null;
  }
  function closeFragment(reason) {
    const part = currentFragment();
    if (part) {
      if (reason) part.endReason = reason;
      fragments.push(part);
    }
    fragmentStart = null;
    fragmentBase = null;
    fragmentPrefix = null;
  }

  function tickBuckets(ts) {
    const steps = Math.floor((ts - bucketTs) / BUCKET_MS);
    if (steps <= 0) return;
    if (steps >= BUCKETS) {
      dmgBuckets.fill(0);
      bossBuckets.fill(_isBoss);
      curBucket = (curBucket + steps) % BUCKETS;
      bucketTs += steps * BUCKET_MS;
      return;
    }
    for (let step = 0; step < steps; step += 1) {
      curBucket = (curBucket + 1) % BUCKETS;
      dmgBuckets[curBucket] = 0;
      bossBuckets[curBucket] = _isBoss;
    }
    bucketTs += steps * BUCKET_MS;
  }

  // Avance l'historique complet (non rebouclé) : pousse un nouveau bucket à
  // 0 à chaque tick au lieu d'écraser un ancien. S'arrête de grandir au-delà
  // de FULL_MAX_BUCKETS (garde-fou mémoire, jamais atteint en pratique).
  function tickFullBuckets(ts) {
    const steps = Math.floor((ts - fullBucketTs) / BUCKET_MS);
    if (steps <= 0) return;
    const appendCount = Math.min(
      steps,
      FULL_MAX_BUCKETS - fullDmgBuckets.length,
    );
    if (appendCount > 0) {
      fullDmgBuckets.push(...new Array(appendCount).fill(0));
      fullBossBuckets.push(...new Array(appendCount).fill(_isBoss));
    }
    fullBucketTs += steps * BUCKET_MS;
  }

  return {
    reset(nextMeta = {}) {
      startTs = performance.now();
      elapsedOffset = 0;
      teamDamage = 0;
      frozenAt = null;
      meta = { ...nextMeta };
      playerDamage.clear();
      playerDamageSources.clear();
      playerHealing.clear();
      playerKills.clear();
      playerTaken.clear();
      playerTakenSources.clear();
      playerAccuracy.clear();
      dmgBuckets.fill(0);
      bossBuckets.fill(false);
      curBucket = 0;
      bucketTs = performance.now();
      _isBoss = false;
      fullDmgBuckets.length = 0;
      fullBossBuckets.length = 0;
      fullDmgBuckets.push(0);
      fullBossBuckets.push(false);
      fullBucketTs = performance.now();
      fragments = [];
      fragmentStart = Date.now();
      fragmentReason = "开始战斗";
      fragmentBase = {
        teamDamage: 0,
        damage: {},
        sources: {},
        healing: {},
        taken: {},
        takenSources: {},
        kills: {},
        accuracy: {},
      };
      fragmentPrefix = null;
    },
    // Fige durée ET donc DPS au moment de l'appel — les dégâts/kills restent
    // affichés mais n'évoluent plus, le temps écoulé ne progresse plus non
    // plus. Idempotent (rappeler ne change rien si déjà figé).
    freeze(reason = "战斗结束") {
      if (frozenAt === null) {
        frozenAt = elapsed();
        closeFragment(reason);
      }
    },
    unfreeze(reason = "断线续传") {
      if (frozenAt !== null) {
        elapsedOffset = frozenAt;
        startTs = performance.now();
        frozenAt = null;
        beginFragment(reason);
      }
    },
    pause(reason = "连接中断") {
      this.freeze(reason);
    },
    resume(reason = "断线续传") {
      this.unfreeze(reason);
    },
    // 同日试炼升 tier 不是断线，不新增片段。若层间结束信号曾短暂冻结，
    // 将刚关闭的母片段重新接回，并排除等待下一层的空档时间。
    resumeTrialTier(reason = "进入下一层") {
      if (frozenAt === null) return;
      elapsedOffset = frozenAt;
      startTs = performance.now();
      frozenAt = null;
      const previous = fragments.length ? fragments.pop() : null;
      if (!previous) {
        beginFragment(reason);
        return;
      }
      const deltas = previous.players || {};
      const baseFrom = (map, delta) =>
        Object.fromEntries(
          Array.from(map, ([name, value]) => [
            name,
            value - (Number(delta && delta[name]) || 0),
          ]),
        );
      const sourceBase = nestedMapObject(playerDamageSources);
      Object.entries(deltas.sources || {}).forEach(([name, sources]) =>
        Object.entries(sources || {}).forEach(([source, value]) => {
          if (sourceBase[name])
            sourceBase[name][source] =
              (Number(sourceBase[name][source]) || 0) - (Number(value) || 0);
        }),
      );
      const takenSourceBase = nestedMapObject(playerTakenSources);
      Object.entries(deltas.takenSources || {}).forEach(([name, sources]) =>
        Object.entries(sources || {}).forEach(([source, value]) => {
          if (takenSourceBase[name])
            takenSourceBase[name][source] =
              (Number(takenSourceBase[name][source]) || 0) -
              (Number(value) || 0);
        }),
      );
      fragmentStart = Date.now();
      fragmentReason = previous.reason || "开始战斗";
      fragmentBase = {
        teamDamage: teamDamage - (Number(previous.teamDamage) || 0),
        damage: baseFrom(playerDamage, deltas.damage),
        sources: sourceBase,
        healing: baseFrom(playerHealing, deltas.healing),
        taken: baseFrom(playerTaken, deltas.taken),
        takenSources: takenSourceBase,
        kills: baseFrom(playerKills, deltas.kills),
        accuracy: accuracyBaseFromDelta(playerAccuracy, deltas.accuracy),
      };
      fragmentPrefix = {
        startedAt: previous.startedAt,
        durationMs: Number(previous.durationMs) || 0,
      };
    },
    splitFragment(reason = "进入下一关") {
      if (fragmentStart !== null) {
        closeFragment(reason);
        beginFragment(reason);
      }
    },
    isFrozen() {
      return frozenAt !== null;
    },
    setMeta(v) {
      meta = { ...meta, ...v };
    },
    getMeta() {
      return { ...meta };
    },
    serialize() {
      const open = currentFragment();
      return {
        schemaVersion: 2,
        meta: { ...meta },
        savedAt: new Date().toISOString(),
        durationMs: Math.round(elapsed() * 1000),
        teamDamage,
        players: {
          damage: mapObject(playerDamage),
          sources: nestedMapObject(playerDamageSources),
          healing: mapObject(playerHealing),
          taken: mapObject(playerTaken),
          takenSources: nestedMapObject(playerTakenSources),
          kills: mapObject(playerKills),
          accuracy: accuracyObject(playerAccuracy),
        },
        classes: Object.fromEntries(
          this.getAllPlayerNames().map((n) => [n, ClassSystem.classFor(n)]),
        ),
        fragments: open ? [...fragments, open] : [...fragments],
        isBoss: _isBoss,
        frozen: frozenAt !== null,
        graph: { damage: [...fullDmgBuckets], boss: [...fullBossBuckets] },
      };
    },
    restore(s) {
      if (!s || s.schemaVersion !== 2) {
        throw new Error(
          Settings.getLanguage() === "en"
            ? "Unsupported combat cache format"
            : "不支持的战斗缓存格式",
        );
      }
      meta = { ...(s.meta || {}) };
      teamDamage = Number(s.teamDamage) || 0;
      elapsedOffset = (Number(s.durationMs) || 0) / 1000;
      startTs = performance.now();
      frozenAt = elapsedOffset;
      restoreMap(playerDamage, s.players && s.players.damage);
      restoreMap(playerHealing, s.players && s.players.healing);
      restoreNestedMap(playerDamageSources, s.players && s.players.sources);
      restoreMap(playerTaken, s.players && s.players.taken);
      restoreNestedMap(playerTakenSources, s.players && s.players.takenSources);
      restoreMap(playerKills, s.players && s.players.kills);
      restoreAccuracy(playerAccuracy, s.players && s.players.accuracy);
      ClassSystem.applyClasses(s.classes);
      fragments = Array.isArray(s.fragments) ? s.fragments : [];
      fragmentStart = null;
      fragmentBase = null;
      fragmentPrefix = null;
      _isBoss = !!s.isBoss;
      fullDmgBuckets.length = 0;
      fullBossBuckets.length = 0;
      ((s.graph && s.graph.damage) || [0])
        .slice(-FULL_MAX_BUCKETS)
        .forEach((v) => fullDmgBuckets.push(Number(v) || 0));
      ((s.graph && s.graph.boss) || [false])
        .slice(-FULL_MAX_BUCKETS)
        .forEach((v) => fullBossBuckets.push(!!v));
      if (!fullDmgBuckets.length) fullDmgBuckets.push(0);
      while (fullBossBuckets.length < fullDmgBuckets.length)
        fullBossBuckets.push(false);
      dmgBuckets.fill(0);
      bossBuckets.fill(false);
      const td = fullDmgBuckets.slice(-BUCKETS),
        tb = fullBossBuckets.slice(-BUCKETS);
      td.forEach((v, i) => {
        dmgBuckets[i] = v;
        bossBuckets[i] = !!tb[i];
      });
      curBucket = BUCKETS - 1;
      bucketTs = fullBucketTs = performance.now();
    },
    getFragments() {
      const open = currentFragment();
      return open ? [...fragments, open] : [...fragments];
    },
    setBoss(v) {
      _isBoss = v;
      bossBuckets[curBucket] = v;
      if (fullBossBuckets.length)
        fullBossBuckets[fullBossBuckets.length - 1] = v;
    },
    addTeamDamage(a, ts) {
      teamDamage += a;
      tickBuckets(ts);
      dmgBuckets[curBucket] += a;
      bossBuckets[curBucket] = _isBoss;
      tickFullBuckets(ts);
      if (fullDmgBuckets.length) fullDmgBuckets[fullDmgBuckets.length - 1] += a;
    },
    addPlayerDamage(n, a, source = "unknown") {
      playerDamage.set(n, (playerDamage.get(n) || 0) + a);
      const key = DamageSources.normalize(source),
        sources = playerDamageSources.get(n) || new Map();
      sources.set(key, (sources.get(key) || 0) + a);
      playerDamageSources.set(n, sources);
    },
    addPlayerHealing(n, a) {
      playerHealing.set(n, (playerHealing.get(n) || 0) + a);
    },
    addPlayerTaken(n, a, source = "unknown") {
      playerTaken.set(n, (playerTaken.get(n) || 0) + a);
      const key = String(source || "unknown"),
        sources = playerTakenSources.get(n) || new Map();
      sources.set(key, (sources.get(key) || 0) + a);
      playerTakenSources.set(n, sources);
    },
    addPlayerKill(n) {
      playerKills.set(n, (playerKills.get(n) || 0) + 1);
    },
    addPlayerAccuracy(n, hit, targets = []) {
      if (!n) return;
      const value = playerAccuracy.get(n) || {
        attempts: 0,
        hits: 0,
        monsters: new Map(),
      };
      value.attempts++;
      if (hit) value.hits++;
      const seen = new Set();
      (Array.isArray(targets) ? targets : []).forEach((target) => {
        const monsterName = String((target && target.monsterName) || ""),
          monsterHrid = String((target && target.monsterHrid) || ""),
          key = monsterHrid || "name:" + monsterName;
        if (!key || key === "name:" || seen.has(key)) return;
        seen.add(key);
        const monster = value.monsters.get(key) || {
          monsterName,
          monsterHrid,
          attempts: 0,
          hits: 0,
        };
        monster.monsterName = monster.monsterName || monsterName;
        monster.monsterHrid = monster.monsterHrid || monsterHrid;
        monster.attempts++;
        if (target.hit) monster.hits++;
        value.monsters.set(key, monster);
      });
      playerAccuracy.set(n, value);
    },
    // Fusionne les stats d'un ancien label (ex: fallback "Joueur6") vers le
    // nom réel confirmé, au lieu de laisser deux lignes distinctes pour la
    // même personne. Utilisé quand la résolution de noms du Trial de guilde
    // identifie enfin le vrai pseudo d'un slot déjà en cours de tracking.
    renamePlayer(oldName, newName) {
      if (!oldName || !newName || oldName === newName) return;
      const merge = (map) => {
        if (!map.has(oldName)) return;
        map.set(newName, (map.get(newName) || 0) + map.get(oldName));
        map.delete(oldName);
      };
      merge(playerDamage);
      merge(playerHealing);
      merge(playerKills);
      merge(playerTaken);
      if (playerDamageSources.has(oldName)) {
        const target = playerDamageSources.get(newName) || new Map();
        playerDamageSources
          .get(oldName)
          .forEach((value, source) =>
            target.set(source, (target.get(source) || 0) + value),
          );
        playerDamageSources.set(newName, target);
        playerDamageSources.delete(oldName);
      }
      if (playerTakenSources.has(oldName)) {
        const target = playerTakenSources.get(newName) || new Map();
        playerTakenSources
          .get(oldName)
          .forEach((value, source) =>
            target.set(source, (target.get(source) || 0) + value),
          );
        playerTakenSources.set(newName, target);
        playerTakenSources.delete(oldName);
      }
      if (playerAccuracy.has(oldName)) {
        const source = playerAccuracy.get(oldName),
          target = playerAccuracy.get(newName) || {
            attempts: 0,
            hits: 0,
            monsters: new Map(),
          };
        target.attempts += Number(source.attempts) || 0;
        target.hits += Number(source.hits) || 0;
        source.monsters.forEach((monster, key) => {
          const current = target.monsters.get(key) || {
            monsterName: monster.monsterName || "",
            monsterHrid: monster.monsterHrid || "",
            attempts: 0,
            hits: 0,
          };
          current.attempts += Number(monster.attempts) || 0;
          current.hits += Number(monster.hits) || 0;
          target.monsters.set(key, current);
        });
        playerAccuracy.set(newName, target);
        playerAccuracy.delete(oldName);
      }
    },
    getTeamDps() {
      const e = elapsed();
      return e < 1 ? 0 : teamDamage / e;
    },
    getTeamDamage() {
      return teamDamage;
    },
    getTeamKills() {
      let t = 0;
      playerKills.forEach((v) => (t += v));
      return t;
    },
    getPlayerDps(n) {
      const e = elapsed();
      return e < 1 ? 0 : (playerDamage.get(n) || 0) / e;
    },
    getPlayerDamage(n) {
      return playerDamage.get(n) || 0;
    },
    getPlayerDamageSources(n) {
      return Object.fromEntries(playerDamageSources.get(n) || []);
    },
    getPlayerHps(n) {
      const e = elapsed();
      return e < 1 ? 0 : (playerHealing.get(n) || 0) / e;
    },
    getPlayerHealing(n) {
      return playerHealing.get(n) || 0;
    },
    getPlayerTaken(n) {
      return playerTaken.get(n) || 0;
    },
    getPlayerTakenSources(n) {
      return Object.fromEntries(playerTakenSources.get(n) || []);
    },
    getPlayerTakenPs(n) {
      const e = elapsed();
      return e < 1 ? 0 : (playerTaken.get(n) || 0) / e;
    },
    getPlayerKills(n) {
      return playerKills.get(n) || 0;
    },
    getPlayerAccuracy(n) {
      const value = playerAccuracy.get(n);
      if (!value) return null;
      return {
        attempts: Number(value.attempts) || 0,
        hits: Number(value.hits) || 0,
        monsters: Object.fromEntries(value.monsters || []),
      };
    },
    getElapsedSeconds() {
      return elapsed();
    },
    getAllPlayerNames() {
      return Array.from(
        new Set([
          ...playerDamage.keys(),
          ...playerKills.keys(),
          ...playerHealing.keys(),
          ...playerTaken.keys(),
          ...playerAccuracy.keys(),
          ...Object.keys(meta.accuracyProfiles || {}),
        ]),
      );
    },
    // Avance les buckets au temps actuel — appelé à chaque render tick (1s).
    // Sans ça, curBucket ne s'avance qu'à la réception de dégâts. En idle (entre
    // deux vagues), le bucket courant garde sa valeur accumulée et s'affiche comme
    // le point "now" pendant toute la pause → pic artificiel dans le graphe.
    advanceBuckets() {
      tickBuckets(performance.now());
      tickFullBuckets(performance.now());
    },
    getGraphPoints() {
      // Retourne {dps, isBoss} par bucket, du plus ancien au plus récent.
      const pts = [];
      for (let i = 1; i <= BUCKETS; i++) {
        const idx = (curBucket + i) % BUCKETS;
        pts.push({
          dps: dmgBuckets[idx] / (BUCKET_MS / 1000),
          isBoss: bossBuckets[idx],
        });
      }
      return pts;
    },
    // Historique COMPLET (non plafonné à 5 min) pour le graphe du Recount —
    // grandit sur toute la durée du Trial au lieu de perdre les points les
    // plus anciens comme le fait le buffer circulaire du panneau principal.
    getFullGraphPoints() {
      const pts = [];
      for (let i = 0; i < fullDmgBuckets.length; i++) {
        pts.push({
          dps: fullDmgBuckets[i] / (BUCKET_MS / 1000),
          isBoss: fullBossBuckets[i],
        });
      }
      return pts;
    },
  };
})();

// ─── Diagnostics ──────────────────────────────────────────────────────────────
const Diagnostics = (() => {
  let nominal = 0,
    coldPlayer = 0,
    coldMonsterAmbig = 0,
    coldMonsterAmbigDmg = 0;
  let collision = 0,
    collisionSingleHit = 0;
  let orphan = 0,
    orphanDmg = 0;
  const MAX = 5;
  let orphLog = 0;
  const w = (cnt, msg) => {
    if (cnt < MAX) {
      console.warn("[MWI DPS Tracker] " + msg);
      return cnt + 1;
    }
    return cnt;
  };
  return {
    recordNominal() {
      nominal++;
    },
    recordColdPlayer() {
      coldPlayer++;
    },
    recordColdMonsterAmbig(a) {
      coldMonsterAmbig++;
      coldMonsterAmbigDmg += a;
    },
    recordCollision(n) {
      collision++;
    },
    recordCollisionSingleHit(n, a) {
      collisionSingleHit++;
    },
    recordOrphan(a) {
      orphan++;
      orphanDmg += a;
      orphLog = w(orphLog, "未归属伤害 " + a + "，序号 " + orphan);
    },
    summary() {
      return {
        nominal,
        coldPlayer,
        coldMonsterAmbig,
        coldMonsterAmbigDmg,
        collision,
        collisionSingleHit,
        orphan,
        orphanDmg,
      };
    },
  };
})();

// ─── Capture ──────────────────────────────────────────────────────────────────
const Capture = (() => {
  let active = false,
    log = [],
    counts = {};
  return {
    start() {
      active = true;
      log = [];
      counts = {};
      console.info("[MWI DPS Tracker] 已开始抓取战斗消息。");
    },
    stop() {
      active = false;
      console.info(
        "[MWI DPS Tracker] 已停止抓取，共 " + log.length + " 条消息。",
      );
    },
    record(type, payload) {
      if (!active) return;
      counts[type] = (counts[type] || 0) + 1;
      log.push({ t: Date.now(), payload });
    },
    download(fn) {
      const blob = new Blob(
        [JSON.stringify({ typeCounts: counts, combatLog: log })],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: fn || "mwi-capture-" + Date.now() + ".json",
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    size() {
      return log.length;
    },
  };
})();

export { Capture, Diagnostics, Session };
