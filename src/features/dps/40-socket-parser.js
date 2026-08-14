import { CombatIdentity, Settings, el } from "./00-bootstrap.js";
import {
  ClassDebug,
  ClassProbe,
  ClassSystem,
  DamageSources,
  TakenSources,
} from "./10-combat-sources.js";
import { Capture, Diagnostics, Session } from "./20-session.js";

// ─── SocketHook v3 ────────────────────────────────────────────────────────────
// Moteur d'attribution réécrit sur la méthode MWITools / Combat Suite
// (rétro-ingénierie du 16/07/2026, validée à ±0.1% contre vérité terrain).
//
// 普通 battle_updated 每条对应一个战斗事件，但 pMap 表示该事件中所有被
// 修改或触及的玩家，并不等于“共同造成伤害的玩家”。群体恢复、回蓝、反击
// 和触发效果都可能把非攻击者带入 pMap。因此多人消息优先比较完整更新中的
// atkCounter；只有计数器无法确定行动者时，才退回唯一 MP 下降信号。
//
// BASELINE : monstersHP initialisé depuis new_battle.monsters[].currentHitpoints
// → les PV perdus avant le premier message ne sont jamais comptés
//   (fini le bug "cold monster" qui créditait +16304 fantômes).
//
// 消息由 MWITools 核心 WebSocket 入口统一转发；本模块只负责解析与归属。
const SocketHook = (() => {
  const bus = new EventTarget();

  // État de bataille (réinitialisé à chaque new_battle)
  let monstersHP = []; // baseline PV par index monstre
  let monstersAlive = []; // pour détecter les kills (cHP>0 → 0)
  let monsterNames = [],
    monsterHrids = [];
  let monstersAtkCounter = [],
    monsterCurrentAction = [],
    monsterKnownDotAbilities = {},
    monsterDotUntil = {};
  let playersMP = []; // baseline MP par index joueur (signal castPlayer)
  let playersAtkCounter = []; // 普通战斗攻击尝试计数器基线（完整更新才有）
  let playersDmgCounter = []; // 玩家作为受击者的跳字计数器（用于识别反伤）
  let playersHP = []; // PV joueurs (détection heal)
  let playerKnownDotAbilities = {}; // 玩家槽位 → 本场已确认的持续伤害技能
  let playerDotUntil = {}; // 玩家槽位 → Map(技能 → 预计最后一跳时间)
  let playerDotCasts = []; // 已确认施法的逐目标 DoT 时间轴，仅作无法归属时的兜底
  let playerKnownReflectionAbilities = {}; // 玩家槽位 → 本场装备/观察到的反伤技能
  let playerReflectUntil = {}; // 玩家槽位 → performance.now() 时间轴上的反伤到期点
  let playerReflectSource = {}; // 玩家槽位 → 反伤技能 Hrid
  let currentAction = []; // ability courante par joueur, décalée d'un message :
  // les dégâts d'un cast à temps d'incantation sont
  // crédités au sort N-1 (breakdown par sort futur).
  const keyToName = new Map();
  let haveBattle = false; // battle_updated ignoré tant que new_battle pas vu
  // (mi-combat : la vague suivante ~10s re-synchronise)
  let lastCombatStartTime = null; // identifiant d'instance de combat : identique
  // pour toutes les vagues/battleId d'une même
  // instance, change quand on relance un combat.
  let currentCharacterId = null;
  let currentCombatKey = null;
  let testNow = null;

  function clockNow() {
    return testNow === null ? performance.now() : testNow;
  }

  // ── Mode Trial de Guilde ───────────────────────────────────────────────────
  // guild_battle_updated : message dédié au Trial, parallèle à battle_updated.
  //   • pMap : indices de slots 0–N, sans noms → résolution via DOM.
  //   • mMap : boss partagé (Trial Badger / Swarm, mHP 445 000+).
  //   • new_battle n'a QUE le joueur local (slot 0) ; les autres sont hors WS.
  // Résolution des noms : la grille de personnages dans le DOM liste les joueurs
  // dans l'ordre des slots. On scanne les nœuds texte sous chaque cellule.
  let guildSlotNames = new Map(); // slot_index (string) → nom
  // Slots dont le nom réel a été confirmé une première fois — verrouillés
  // pour ne plus jamais être réécrits (évite les doublons si la grille du
  // jeu réordonne ses éléments entre deux résolutions successives).
  const guildSlotLocked = new Set();
  let guildMonstersHP = {};
  let guildMonstersMHP = {}; // PV max par monstre, pour détecter un respawn (changement de mHP)
  let guildMonstersDmgCounter = {}; // 新协议：怪物受击跳字计数器
  let guildPlayersHP = {};
  let guildPlayersMP = {};
  let guildPlayersAtkCounter = {}; // 新协议：所有试炼玩家的攻击尝试计数器
  let guildPlayersDmgCounter = {}; // 玩家作为受击者的跳字计数器
  let guildCurrentAction = {}; // atkCounter 增长时，上一项才是刚结算的技能
  let guildReflectUntil = {}; // slot → performance.now() 时间轴上的反伤到期点
  let guildReflectSource = {}; // slot → 反伤技能或武器 Hrid，用于伤害构成图标
  let guildKnownDotAbilities = {}; // slot → 本层装备/观察到的持续伤害技能
  let guildDotUntil = {}; // slot → Map(技能 → 预计最后一跳时间)
  let guildKnownReflectionAbilities = {}; // slot → 本层装备/观察到的反伤技能
  let guildMonstersAtkCounter = {};
  let guildMonsterCurrentAction = {};
  let guildMonsterNames = {},
    guildMonsterHrids = {},
    guildMonsterKnownDotAbilities = {},
    guildMonsterDotUntil = {};
  let currentGuildTier = null;
  let currentGuildStageSignature = "";
  let isGuildBattle = false;
  let isInLabyrinth = false; // suivi via labyrinth_updated.labyrinth.isActive
  let guildMaxSlot = 0; // nombre de slots distincts vus dans pMap (plafond réel)
  let guildCombatWasActive = false; // a-t-on déjà vu combat.status==='in_progress' ?
  let guildTrialEnded = false; // Trial terminé détecté (budget épuisé / toutes les vagues "done")
  let lastGuildSnapshotSignature = "";

  // Mots/motifs de l'UI du jeu qui ressemblent à des pseudos courts mais n'en
  // sont pas (bug corrigé le 20/07 : le fallback précédent scannait TOUTE la
  // page et aspirait la sidebar de compétences — "Enhancing", "125", "Lv.20"…
  // se sont retrouvés listés comme joueurs jusqu'à "Joueur50" sur 35 réels).
  const GUILD_NAME_NOISE = new Set([
    "milking",
    "foraging",
    "woodcutting",
    "cheesesmithing",
    "crafting",
    "tailoring",
    "cooking",
    "brewing",
    "alchemy",
    "enhancing",
    "combat",
    "stamina",
    "intelligence",
    "attack",
    "defense",
    "melee",
    "ranged",
    "magic",
    "stealth",
    "power",
    "marketplace",
    "tasks",
    "task",
    "labyrinth",
    "shop",
    "loot",
    "abilities",
    "equipment",
    "inventory",
    "house",
    "loadouts",
    "statistics",
    "buildings",
    "overview",
    "members",
    "trials",
    "application",
    "guild",
    "overview",
    "dispatch",
    "findparty",
    "myparty",
    "combatzones",
  ]);
  function looksLikeNoise(t) {
    const low = t.toLowerCase();
    if (GUILD_NAME_NOISE.has(low)) return true;
    if (/^lv\.?\d+$/i.test(t)) return true; // "Lv.20"
    if (/^\d+%?$/.test(t)) return true; // "125", "13.3%"
    if (/^[\d.,]+[km]?$/i.test(t)) return true; // "0.08m", "554"
    return false;
  }

  function resolveGuildNames(expectedSlots) {
    // La grille Trial liste les personnages dans l'ordre des slots. On ne
    // cherche QUE dans des conteneurs explicitement liés au combat de guilde —
    // jamais un scan de toute la page (cause du bug précédent).
    // Sélecteur confirmé le 20/07 via scanGuildNamesByEllipsis() :
    // MiniUnit_name__* — nom d'utilisateur dans la grille compacte des membres
    // (component "MiniUnit", distinct de "CombatUnit" qui lui ne concerne que
    // le panneau perso + les portraits de boss, 3 occurrences seulement).
    // CombatUnit_name gardé en repli si MiniUnit_name venait à disparaître.
    const SCOPED_SELECTORS = [
      '[class*="MiniUnit_name"]',
      '[class*="CombatUnit_name"]',
      ".GuildBattle__members .Character__name",
      '[class*="GuildBattle"] [class*="name"]',
      '[class*="guildBattle"] [class*="name"]',
      '[class*="GuildMember"] [class*="name"]',
      '[class*="TrialBattle"] [class*="name"]',
    ];
    let candidates = [];
    for (const sel of SCOPED_SELECTORS) {
      try {
        candidates = [...document.querySelectorAll(sel)];
      } catch (e) {
        candidates = [];
      }
      if (candidates.length > 0) break;
    }
    // Les noms de boss de Trial suivent le motif "Trial X" (Trial Badger,
    // Trial Swarm…) — à exclure, ce ne sont pas des joueurs.
    const names = candidates
      .map((el) => el.textContent.trim())
      .filter((t) => t && !looksLikeNoise(t) && !/^trial\s/i.test(t));

    // Alignement des slots : confirmé le 20/07 sur une capture réelle (34
    // MiniUnit + roster de 35) que le JOUEUR LOCAL n'apparaît PAS dans la
    // grille MiniUnit — il a son propre panneau perso séparé (barre de vie
    // à gauche). pMap slot '0' est toujours le joueur local (établi depuis
    // new_battle). Si son nom est absent de la liste DOM, les N candidats
    // correspondent donc aux slots 1..N, PAS 0..N-1.
    //
    // BUG CORRIGÉ le 24/07 : sur le serveur TEST (pas de combat perso en
    // parallèle), aucun new_battle classique n'arrive jamais → keyToName
    // reste vide → localName est undefined → l'ancienne condition
    // `(localName && !localInList) ? 1 : 0` retombait sur offset=0 par
    // défaut (undefined est falsy), et le SLOT 0 (le joueur local) se
    // faisait recouvrir par le premier nom DOM trouvé — vol d'identité
    // silencieux (observé : "ZhutestIC" absent, remplacé par un autre nom).
    // Fix : si localName est inconnu, on applique quand même offset=1 par
    // défaut (pattern confirmé sur serveur live) plutôt que de deviner 0.
    // Slot 0 reste alors un placeholder "Joueur1" tant qu'on ne sait pas
    // qui occupe réellement ce slot — mieux vaut un placeholder honnête
    // qu'un nom volé à quelqu'un d'autre.
    const localName = [...keyToName.values()][0];
    const localInList = localName && names.includes(localName);
    const offset = !localName || !localInList ? 1 : 0;

    const resolved = new Map(); // slot → nom, pour cette passe de résolution
    if (offset === 1 && localName) resolved.set("0", localName);
    names
      .slice(0, expectedSlots ? expectedSlots - offset : names.length)
      .forEach((t, i) => {
        resolved.set(String(i + offset), t);
      });

    // Verrouillage : la grille du jeu peut réordonner ses éléments entre deux
    // appels de résolveGuildNames (ex: tri par DPS en direct). Sans garde,
    // un même slot recevrait un nom différent d'un appel à l'autre, et les
    // dégâts déjà attribués sous l'ANCIEN label resteraient orphelins →
    // duplication (observé : 54 lignes pour 35 joueurs réels le 20/07).
    // Une fois un slot résolu à un nom réel, il est verrouillé à vie pour la
    // session ; toute résolution ultérieure du même slot est ignorée, mais
    // on émet un événement de RENOMMAGE pour fusionner les stats déjà
    // accumulées sous l'ancien label (fallback "JoueurN") vers le vrai nom.
    for (const [slot, name] of resolved) {
      if (guildSlotLocked.has(slot)) continue; // déjà verrouillé, on ignore
      const oldLabel = guildSlotLabel(slot); // fallback "JoueurN" ou ancien nom non verrouillé
      guildSlotNames.set(slot, name);
      guildSlotLocked.add(slot);
      if (oldLabel !== name) {
        bus.dispatchEvent(
          new CustomEvent("guildSlotRenamed", {
            detail: { oldName: oldLabel, newName: name },
          }),
        );
      }
    }

    if (guildSlotNames.size === 0 && Settings.getDebugMode()) {
      console.warn(
        "[KikiMeter][Guild] 玩家姓名解析失败，页面选择器可能已经变化。" +
          "请在试炼中运行 window.__MWI_DPS.scanGuildNames() 查看诊断。",
      );
    }
  }

  // Outil de diagnostic exposé publiquement : liste les conteneurs DOM candidats
  // pendant un Trial pour identifier le bon sélecteur, sans jamais l'utiliser
  // automatiquement (évite de reproduire le bug du scan global).
  // v2 (20/07) : le filtre par nom de classe (Guild/Trial/Battle) ratait le vrai
  // conteneur (il n'a pas ces mots dans sa classe). On cible maintenant TOUT
  // conteneur dont le nombre d'enfants est proche du roster réel (guildMaxSlot),
  // ce qui est un signal beaucoup plus fiable que le nom de classe.
  // Un élément (ou un de ses ancêtres) appartient-il à l'UI de KikiMeter ?
  // Évite que le scan se retrouve lui-même (le Recount peut avoir ~35 lignes
  // une fois le roster complet — collision exacte avec la taille cherchée).
  function isOwnUI(el) {
    return !!(
      el.closest("#kikimeter-panel") || el.closest('[data-kikimeter="true"]')
    );
  }

  // Recherche CIBLÉE : on connaît un nom garanti présent dans le DOM pendant
  // le Trial — le joueur local (ex: "ZhuLiMoon", vu dans new_battle). Plutôt
  // que deviner par nombre d'enfants (échoué : la grille est probablement
  // découpée en plusieurs rangées, pas un seul conteneur à 35 enfants),
  // on cherche le texte exact et on remonte l'arbre pour voir la structure
  // réelle (classe de chaque 层级 + nombre de frères/enfants).
  function scanGuildNamesByLocalName() {
    const localName = [...keyToName.values()][0];
    if (!localName) {
      console.warn(
        "[KikiMeter] 尚不知道本地玩家姓名。" +
          "请在公会试炼进行中再次运行此命令。",
      );
      return [];
    }
    console.log(`[KikiMeter] 正在精确搜索文本 "${localName}" （页面 DOM）…`);
    const matches = [];
    document.querySelectorAll("*").forEach((el) => {
      if (isOwnUI(el)) return;
      // Élément "feuille" (peu ou pas d'enfants) dont le texte est EXACTEMENT
      // le nom — évite de matcher un ancêtre qui contient aussi d'autres texte.
      if (el.children.length <= 1 && el.textContent.trim() === localName) {
        matches.push(el);
      }
    });
    console.log(`[KikiMeter] ${matches.length} 个完全匹配项。`);
    console.log("=====================================================");
    matches.forEach((el, i) => {
      console.log(`--- 匹配项 #${i} ---`);
      let cur = el,
        depth = 0;
      while (cur && depth < 6) {
        const cls = (cur.className || "") + "" || "(无类名)";
        const siblingsTexts = cur.parentElement
          ? [...cur.parentElement.children]
              .slice(0, 8)
              .map((s) => s.textContent.trim().slice(0, 16))
          : [];
        console.log(
          `  层级 ${depth} | <${cur.tagName}> 类名="${cls}" | 子元素=${cur.children.length} | ` +
            `同级元素=${cur.parentElement ? cur.parentElement.children.length : 0} | 同级示例: [${siblingsTexts.join(" ¦ ")}]`,
        );
        cur = cur.parentElement;
        depth++;
      }
      console.log("  ---");
    });
    console.log("=====================================================");
    return matches;
  }

  function scanGuildNames() {
    const target = guildMaxSlot || 35;
    const lo = Math.max(2, target - 5),
      hi = target + 10;
    const out = [];
    document.querySelectorAll("div, ul, section").forEach((el) => {
      if (isOwnUI(el)) return; // exclut le panneau KikiMeter/Recount lui-même
      const n = el.children.length;
      if (n >= lo && n <= hi) {
        const texts = [...el.children]
          .slice(0, 6)
          .map((c) => c.textContent.trim().slice(0, 20));
        if (texts.some((t) => t.length > 0)) {
          out.push({
            selector: (el.className || el.tagName) + "",
            tag: el.tagName,
            childCount: n,
            sample: texts,
          });
        }
      }
    });
    // Impression 100% texte plat, une ligne par candidat, RIEN à déplier —
    // les versions précédentes (console.table / objets imbriqués) ne se
    // copiaient pas correctement depuis la console Chrome.
    console.log(
      `[KikiMeter] 预计玩家数：约 ${target} 名；${out.length} 个候选容器：`,
    );
    console.log("=====================================================");
    out.forEach((c, i) => {
      console.log(
        `#${i} | 类名="${c.selector}" | 子元素=${c.childCount} | 示例: [${c.sample.join(" ¦ ")}]`,
      );
    });
    console.log("=====================================================");
    if (out.length === 0) {
      console.warn(
        "[KikiMeter] 没有找到子元素数量完全匹配的容器。" +
          "请运行 window.__MWI_DPS.scanGuildNamesLoose() 执行宽松搜索。",
      );
    }
    return out;
  }

  // Variante permissive : la grille de joueurs peut être un conteneur PARENT
  // avec des sous-groupes (ex : groupes de guilde de 5), donc pas exactement
  // 35 enfants directs. On élargit largement la fourchette et on capture
  // aussi les petits-enfants texte, dédupliqués par valeur.
  function scanGuildNamesLoose() {
    const out = [];
    document.querySelectorAll("div, ul, section").forEach((el) => {
      if (isOwnUI(el)) return; // exclut le panneau KikiMeter/Recount lui-même
      const n = el.children.length;
      if (n >= 10 && n <= 200) {
        // Compte combien d'enfants directs ou petits-enfants ont un texte court
        // qui NE matche PAS le bruit connu (compétences, chiffres…) : signal
        // qu'il s'agit potentiellement d'une grille de pseudos.
        let nameLikeCount = 0;
        const texts = [];
        el.querySelectorAll(":scope > * ").forEach((c) => {
          const t = c.textContent.trim();
          if (t.length >= 2 && t.length <= 20 && !looksLikeNoise(t)) {
            nameLikeCount++;
            texts.push(t.slice(0, 20));
          }
        });
        if (nameLikeCount >= 10) {
          out.push({
            selector: (el.className || el.tagName) + "",
            tag: el.tagName,
            childCount: n,
            nameLikeCount,
            sample: texts.slice(0, 8),
          });
        }
      }
    });
    out.sort((a, b) => b.nameLikeCount - a.nameLikeCount);
    const top = out.slice(0, 15);
    console.log(
      `[KikiMeter] 宽松搜索：${out.length} 个候选容器，显示前 15 个：`,
    );
    console.log("=====================================================");
    top.forEach((c, i) => {
      console.log(
        `#${i} | 类名="${c.selector}" | 子元素=${c.childCount} | 疑似姓名=${c.nameLikeCount} | 示例: [${c.sample.join(" ¦ ")}]`,
      );
    });
    console.log("=====================================================");
    return out;
  }

  // Variante : cherche les noms dans les attributs title/aria-label/alt plutôt
  // que dans le texte visible (cas des tooltips au survol des avatars).
  function scanGuildNamesAttrs() {
    const out = [];
    document
      .querySelectorAll("[title], [aria-label], img[alt]")
      .forEach((el) => {
        const v =
          el.getAttribute("title") ||
          el.getAttribute("aria-label") ||
          el.getAttribute("alt");
        if (v && v.length >= 2 && v.length <= 20 && !looksLikeNoise(v)) {
          out.push({
            tag: el.tagName,
            attr: el.getAttribute("title")
              ? "title"
              : el.getAttribute("aria-label")
                ? "aria-label"
                : "alt",
            value: v,
            class: (el.className || "") + "",
          });
        }
      });
    console.log(`[KikiMeter] ${out.length} 个候选属性：`);
    console.table(out.slice(0, 60));
    return out;
  }

  function guildSlotLabel(k) {
    return (
      guildSlotNames.get(k) ||
      (k === "0" ? [...keyToName.values()][0] || "Slot0" : "Joueur" + (+k + 1))
    );
  }

  // 即使服务器没有先发送 new_guild_battle，也必须给试炼检测事件一个稳定
  // 身份。否则上层只会把正在进行的普通 Session 改标为 trial，普通伤害便会
  // 被带进试炼累计。试炼最终仍由 CombatIdentity 合并为“同角色同一天”。
  function fallbackGuildDetail(payload = {}, source = "guild_fallback") {
    const fallbackDay = CombatIdentity.dayStamp(new Date());
    const rawKey =
      payload.combatStartTime ||
      payload.guildBattleId ||
      payload.battleId ||
      payload.combatId ||
      "guild-fallback-" + fallbackDay;
    return {
      combatKey: String(rawKey),
      stageId: String(rawKey),
      characterId: currentCharacterId || "unknown",
      classes: {},
      fallback: true,
      source,
    };
  }

  function finiteCounter(value) {
    const number = Number(value);
    return value !== undefined && value !== null && Number.isFinite(number)
      ? number
      : undefined;
  }
  function playerAttackCounter(unit = {}) {
    return finiteCounter(
      unit.attackAttemptCounter !== undefined
        ? unit.attackAttemptCounter
        : unit.atkCounter,
    );
  }
  function monsterDamageCounter(unit = {}) {
    return finiteCounter(
      unit.damageSplatCounter !== undefined
        ? unit.damageSplatCounter
        : unit.dmgCounter,
    );
  }
  const REFLECTION_TYPES = new Set([
    "/buff_types/physical_thorns",
    "/buff_types/elemental_thorns",
    "/buff_types/retaliation",
  ]);
  const reflectionAbilityRules = new Map([
    ["/abilities/spike_shell", 30000],
    ["/abilities/retribution", 30000],
  ]);
  // initClientData 中 effectType=damage 表示技能本次结算能直接造成伤害；
  // damageOverTimeRatio + damageOverTimeDuration 才表示真正的持续伤害。
  // 固定回退值让初始化表尚未来得及到达时，火焰风暴/血刃斩仍可识别。
  const abilityDamageRules = new Map([
    [
      "/abilities/firestorm",
      { direct: true, dotDuration: 6000, dotInterval: 3000 },
    ],
    ["/abilities/maim", { direct: true, dotDuration: 9000, dotInterval: 3000 }],
  ]);
  const DOT_DEFAULT_INTERVAL_MS = 3000;
  const DOT_MATCH_TOLERANCE_MS = 500;
  const DOT_TARGET_BIND_WINDOW_MS = 2000;
  const DOT_CAST_RETENTION_MS = 30000;
  const reflectionBuffSources = new Map(); // buff uniqueHrid → 对应反伤技能
  const reflectionTypeSources = new Map(); // buff typeHrid → Set(反伤技能)
  const reflectionItemHrids = new Set();
  function normalizedReflectType(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("physical_thorns")) return "/buff_types/physical_thorns";
    if (text.includes("elemental_thorns"))
      return "/buff_types/elemental_thorns";
    if (text.includes("retaliation")) return "/buff_types/retaliation";
    return "";
  }
  function containsReflection(value, depth = 0) {
    if (depth > 8 || value === null || value === undefined) return false;
    if (typeof value === "string") return !!normalizedReflectType(value);
    if (typeof value !== "object") return false;
    return Object.entries(value).some(
      ([key, child]) =>
        !!normalizedReflectType(key) || containsReflection(child, depth + 1),
    );
  }
  function durationToMs(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    if (number > 86_400_000) return number / 1_000_000; // 游戏初始化表通常使用纳秒
    if (number < 1000) return number * 1000; // 兼容以秒表示的规则表
    return number; // 毫秒
  }
  function reflectionDuration(detail) {
    const candidates = [];
    const walk = (value, depth = 0) => {
      if (depth > 8 || !value || typeof value !== "object") return;
      Object.entries(value).forEach(([key, child]) => {
        if (/duration/i.test(key) && typeof child === "number") {
          const ms = durationToMs(child);
          if (ms >= 100 && ms <= 3_600_000) candidates.push(ms);
        }
        if (child && typeof child === "object") walk(child, depth + 1);
      });
    };
    walk(detail);
    return candidates.length ? Math.max(...candidates) : 30000;
  }
  function abilityEffects(detail = {}) {
    const list =
      detail.abilityEffects ||
      detail.effects ||
      (detail.abilityDetail && detail.abilityDetail.abilityEffects) ||
      [];
    return Array.isArray(list) ? list : [];
  }
  function reflectionBuffs(value, depth = 0, out = []) {
    if (depth > 8 || !value || typeof value !== "object") return out;
    if (normalizedReflectType(value.typeHrid || value.uniqueHrid))
      out.push(value);
    Object.values(value).forEach((child) => {
      if (child && typeof child === "object")
        reflectionBuffs(child, depth + 1, out);
    });
    return out;
  }
  function cacheAbilityRule(hrid, detail = {}) {
    const effects = abilityEffects(detail);
    const damageEffects = effects.filter((effect) =>
      String((effect && effect.effectType) || "").includes(
        "/ability_effect_types/damage",
      ),
    );
    const dotDuration = damageEffects.reduce((max, effect) => {
      if (
        !(Number(effect.damageOverTimeRatio) > 0) ||
        !(Number(effect.damageOverTimeDuration) > 0)
      )
        return max;
      return Math.max(max, durationToMs(effect.damageOverTimeDuration));
    }, 0);
    const dotInterval = damageEffects.reduce((minimum, effect) => {
      if (!(Number(effect.damageOverTimeRatio) > 0)) return minimum;
      const raw =
        effect.damageOverTimeInterval ??
        effect.damageOverTimeTickInterval ??
        effect.tickInterval;
      const interval = durationToMs(raw);
      if (!(interval > 0)) return minimum;
      return minimum > 0 ? Math.min(minimum, interval) : interval;
    }, 0);
    const targetTypes = [
      ...new Set(
        damageEffects
          .map((effect) => String(effect.targetType || ""))
          .filter(Boolean),
      ),
    ];
    if (effects.length || damageEffects.length || dotDuration) {
      abilityDamageRules.set(hrid, {
        direct: damageEffects.length > 0,
        dotDuration,
        dotInterval: dotDuration ? dotInterval || DOT_DEFAULT_INTERVAL_MS : 0,
        targetTypes,
      });
    }
    const reflectBuffs = reflectionBuffs(detail);
    if (reflectBuffs.length) {
      reflectionAbilityRules.set(hrid, reflectionDuration(detail));
      reflectBuffs.forEach((buff) => {
        const unique = String(buff.uniqueHrid || "");
        if (unique) reflectionBuffSources.set(unique, hrid);
        const type = normalizedReflectType(buff.typeHrid || buff.uniqueHrid);
        if (type) {
          if (!reflectionTypeSources.has(type))
            reflectionTypeSources.set(type, new Set());
          reflectionTypeSources.get(type).add(hrid);
        }
      });
    }
  }
  // 从游戏原本下发的 init_game_data / init_client_data 自动学习伤害与反伤
  // 规则。只读取现有入站消息，不主动向游戏服务器请求任何数据。
  function cacheReflectionDefinitions(payload = {}) {
    const sources = [
      payload,
      payload.data,
      payload.initGameData,
      payload.init_game_data,
      payload.initClientData,
      payload.init_client_data,
      payload.clientData,
      payload.client_data,
    ].filter((value) => value && typeof value === "object");
    for (const source of sources) {
      const map = source.abilityDetailMap || source.gameAbilityDetailMap;
      if (map && typeof map === "object") {
        const entries =
          map instanceof Map ? [...map.entries()] : Object.entries(map);
        for (const [key, detail] of entries) {
          const hrid = String(
            (detail && detail.hrid) || (detail && detail.abilityHrid) || key,
          );
          if (hrid) cacheAbilityRule(hrid, detail || {});
        }
      }
      const itemMap = source.itemDetailMap || source.gameItemDetailMap;
      if (itemMap && typeof itemMap === "object") {
        const entries =
          itemMap instanceof Map
            ? [...itemMap.entries()]
            : Object.entries(itemMap);
        for (const [key, detail] of entries) {
          if (!containsReflection(detail)) continue;
          const hrid = String(
            (detail && detail.hrid) || (detail && detail.itemHrid) || key,
          );
          if (hrid) reflectionItemHrids.add(hrid);
        }
      }
    }
  }

  function hasReflectionDefinitions(payload = {}) {
    const sources = [
      payload,
      payload.data,
      payload.initGameData,
      payload.init_game_data,
      payload.initClientData,
      payload.init_client_data,
      payload.clientData,
      payload.client_data,
    ].filter((value) => value && typeof value === "object");
    return sources.some(
      (source) =>
        source.abilityDetailMap ||
        source.gameAbilityDetailMap ||
        source.itemDetailMap ||
        source.gameItemDetailMap,
    );
  }
  function abilityHridsFrom(value, depth = 0, out = new Set()) {
    if (depth > 7 || value === null || value === undefined) return out;
    if (typeof value === "string") {
      if (value.startsWith("/abilities/")) out.add(value);
      return out;
    }
    if (typeof value !== "object") return out;
    Object.entries(value).forEach(([key, child]) => {
      if (typeof child === "string" && child.startsWith("/abilities/"))
        out.add(child);
      else if (child && typeof child === "object")
        abilityHridsFrom(child, depth + 1, out);
    });
    return out;
  }
  function ensureSet(container, key) {
    return container[key] || (container[key] = new Set());
  }
  function rememberAbilityKnowledge(
    dotContainer,
    reflectContainer,
    key,
    value,
  ) {
    abilityHridsFrom(value).forEach((hrid) => {
      const rule = abilityDamageRules.get(hrid);
      if (rule && rule.dotDuration > 0) ensureSet(dotContainer, key).add(hrid);
      if (reflectContainer && reflectionAbilityRules.has(hrid))
        ensureSet(reflectContainer, key).add(hrid);
    });
  }
  function actionDamageKind(action) {
    const value = String(action || "");
    if (value === "auto") return "direct";
    if (DamageSources.isSupport(value)) return "support";
    const rule = abilityDamageRules.get(value);
    if (!rule) return "unknown";
    return rule.direct ? "direct" : "support";
  }
  function targetsAllEnemies(action) {
    const rule = abilityDamageRules.get(String(action || ""));
    return !!(
      rule &&
      Array.isArray(rule.targetTypes) &&
      rule.targetTypes.some((type) => /allEnemies|all_enemies/i.test(type))
    );
  }
  function accuracyTargets(action, hits, aliveKeys, names, hrids) {
    const hitKeys = new Set((hits || []).map((hit) => String(hit.key))),
      living = [...new Set((aliveKeys || []).map(String))];
    let keys;
    if (targetsAllEnemies(action)) keys = living;
    else if (hitKeys.size) keys = [...hitKeys];
    else keys = living.length === 1 ? living : [];
    return keys.map((key) => {
      const monsterHrid = String((hrids && hrids[key]) || ""),
        fallback = monsterHrid.split("/").pop().replace(/_/g, " "),
        monsterName = String(
          (names && names[key]) || fallback || "怪物" + (+key + 1),
        );
      return {
        monsterName,
        monsterHrid,
        hit: hitKeys.has(key),
      };
    });
  }
  function activateDot(
    activeContainer,
    dotContainer,
    key,
    abilityHrid,
    ts,
    timeline = null,
  ) {
    const hrid = String(abilityHrid || ""),
      rule = abilityDamageRules.get(hrid);
    if (!rule || !(rule.dotDuration > 0)) return;
    ensureSet(dotContainer, key).add(hrid);
    const active = activeContainer[key] || (activeContainer[key] = new Map());
    active.set(hrid, Math.max(active.get(hrid) || 0, ts + rule.dotDuration));
    if (timeline) scheduleDotCast(timeline, key, hrid, ts);
  }

  function pruneDotCasts(timeline, ts) {
    for (let index = timeline.length - 1; index >= 0; index -= 1) {
      if (timeline[index].expiresAt + DOT_CAST_RETENTION_MS < ts) {
        timeline.splice(index, 1);
      }
    }
  }

  function dotTickSchedule(startedAt, rule) {
    const interval = rule.dotInterval || DOT_DEFAULT_INTERVAL_MS;
    const schedule = [];
    for (
      let elapsed = interval;
      elapsed <= rule.dotDuration;
      elapsed += interval
    ) {
      schedule.push({ dueAt: startedAt + elapsed, consumed: false });
    }
    return schedule;
  }

  function scheduleDotCast(timeline, key, abilityHrid, ts) {
    const rule = abilityDamageRules.get(abilityHrid);
    if (!rule || !(rule.dotDuration > 0)) return;
    pruneDotCasts(timeline, ts);
    timeline.push({
      key: String(key),
      abilityHrid,
      startedAt: ts,
      landedAt: null,
      expiresAt: ts + rule.dotDuration,
      targets: new Map(),
    });
  }

  function bindDotTargets(timeline, key, abilityHrid, hits, ts) {
    if (!Array.isArray(hits) || !hits.length) return;
    pruneDotCasts(timeline, ts);
    const cast = timeline
      .slice()
      .reverse()
      .find(
        (candidate) =>
          candidate.key === String(key) &&
          candidate.abilityHrid === abilityHrid &&
          ts - candidate.startedAt >= 0 &&
          ts - candidate.startedAt <= DOT_TARGET_BIND_WINDOW_MS,
      );
    if (!cast) return;
    if (cast.landedAt === null) {
      cast.landedAt = ts;
      const rule = abilityDamageRules.get(abilityHrid);
      cast.expiresAt = ts + (rule?.dotDuration || 0);
    }
    const rule = abilityDamageRules.get(abilityHrid);
    if (!rule) return;
    for (const hit of hits) {
      const targetKey = String(hit.key);
      if (!cast.targets.has(targetKey)) {
        cast.targets.set(targetKey, dotTickSchedule(cast.landedAt, rule));
      }
    }
  }

  function scheduledDotCandidate(
    timeline,
    targetKey,
    ts,
    { key = null, abilityHrid = "" } = {},
  ) {
    pruneDotCasts(timeline, ts);
    const candidates = [];
    for (const cast of timeline) {
      if (key !== null && cast.key !== String(key)) continue;
      if (abilityHrid && cast.abilityHrid !== abilityHrid) continue;
      for (const tick of cast.targets.get(String(targetKey)) || []) {
        if (tick.consumed) continue;
        const lateness = ts - tick.dueAt;
        if (lateness >= 0 && lateness <= DOT_MATCH_TOLERANCE_MS) {
          candidates.push({ cast, tick, distance: lateness });
        }
      }
    }
    candidates.sort(
      (left, right) =>
        left.distance - right.distance ||
        left.tick.dueAt - right.tick.dueAt ||
        left.cast.startedAt - right.cast.startedAt,
    );
    if (!candidates.length) return null;
    if (
      candidates.length > 1 &&
      Math.abs(candidates[0].distance - candidates[1].distance) < 1
    ) {
      return { ambiguous: true };
    }
    return candidates[0];
  }

  function consumeScheduledDotHits(
    timeline,
    hits,
    ts,
    { key = null, abilityHrid = "" } = {},
  ) {
    const matched = [];
    const unmatched = [];
    let ambiguous = false;
    for (const hit of hits || []) {
      const candidate = scheduledDotCandidate(timeline, hit.key, ts, {
        key,
        abilityHrid,
      });
      if (!candidate || candidate.ambiguous) {
        ambiguous ||= Boolean(candidate?.ambiguous);
        unmatched.push(hit);
        continue;
      }
      candidate.tick.consumed = true;
      matched.push({ hit, cast: candidate.cast });
    }
    return { matched, unmatched, ambiguous };
  }

  function scheduledDotDamage(timeline, hits, ts) {
    pruneDotCasts(timeline, ts);
    const targetKeys = new Set((hits || []).map((hit) => String(hit.key)));
    const hasPendingTargetSchedule = timeline.some((cast) =>
      [...targetKeys].some((targetKey) =>
        (cast.targets.get(targetKey) || []).some((tick) => !tick.consumed),
      ),
    );
    const { matched, unmatched, ambiguous } = consumeScheduledDotHits(
      timeline,
      hits,
      ts,
    );
    const groups = new Map();
    for (const { hit, cast } of matched) {
      const groupKey = `${cast.key}\u0000${cast.abilityHrid}`;
      const group = groups.get(groupKey) || {
        key: cast.key,
        abilityHrid: cast.abilityHrid,
        amount: 0,
      };
      group.amount += Number(hit.amount) || 0;
      groups.set(groupKey, group);
    }
    return {
      groups: [...groups.values()],
      unmatchedAmount: unmatched.reduce(
        (sum, hit) => sum + (Number(hit.amount) || 0),
        0,
      ),
      ambiguous,
      hasPendingTargetSchedule,
    };
  }

  function dotAbilityFromSource(source) {
    const value = String(source || "");
    if (value.startsWith("dot:/abilities/")) return value.slice(4);
    return abilityDamageRules.get(value)?.dotDuration > 0 ? value : "";
  }

  function recordDotAttribution(timeline, key, source, hits, ts) {
    const value = String(source || ""),
      abilityHrid = dotAbilityFromSource(value);
    if (abilityHrid && !value.startsWith("dot:")) {
      bindDotTargets(timeline, key, abilityHrid, hits, ts);
      return;
    }
    if (value === "dot" || value.startsWith("dot:")) {
      consumeScheduledDotHits(timeline, hits, ts, { key, abilityHrid });
    }
  }

  function activeDotCandidates(keys, activeContainer, ts) {
    return keys.filter((key) =>
      [...(activeContainer[key] || new Map()).values()].some(
        (until) => until > ts,
      ),
    );
  }

  function uniqueActiveDotCandidate(keys, activeContainer, ts) {
    const candidates = activeDotCandidates(keys, activeContainer, ts);
    return candidates.length === 1 ? candidates[0] : null;
  }

  function activeDotSourceFor(activeContainer, key, ts) {
    const abilities = [...(activeContainer[key] || new Map()).entries()]
      .filter(([, until]) => until > ts)
      .map(([hrid]) => hrid);
    return abilities.length === 1 ? `dot:${abilities[0]}` : "dot";
  }
  function dotAbilitiesFor(dotContainer, activeContainer, key, ts) {
    const known = [...(dotContainer[key] || [])];
    const active = [...(activeContainer[key] || new Map()).entries()]
      .filter(([, until]) => until > ts)
      .map(([hrid]) => hrid);
    if (known.length === 1) return known;
    if (active.length === 1) return active;
    return active.length ? active : known;
  }
  function dotSourceFor(dotContainer, activeContainer, key, ts) {
    const abilities = dotAbilitiesFor(dotContainer, activeContainer, key, ts);
    return abilities.length === 1 ? "dot:" + abilities[0] : "dot";
  }
  function uniqueDotCandidate(keys, dotContainer, activeContainer, ts) {
    const candidates = keys.filter(
      (key) =>
        dotAbilitiesFor(dotContainer, activeContainer, key, ts).length > 0,
    );
    return candidates.length === 1 ? candidates[0] : null;
  }
  const DIRECT_WEAPON_EFFECTS = [
    "blazing_trident",
    "chaotic_flail",
    "sundering_crossbow",
  ];
  function directWeaponEffectFor(playerName) {
    const weapon = String(ClassSystem.getWeapon(playerName) || "");
    return DIRECT_WEAPON_EFFECTS.some((name) => weapon.includes(name))
      ? weapon
      : "";
  }
  function combinedWeaponSource(weapon, action) {
    return (
      "combined:" +
      encodeURIComponent(weapon) +
      "|" +
      encodeURIComponent(DamageSources.normalize(action))
    );
  }
  function sourceWithWeaponEffect(playerName, action, damagedTargetCount) {
    const weapon = directWeaponEffectFor(playerName);
    if (!weapon) return action;
    if (DamageSources.normalize(action) === DamageSources.normalize(weapon))
      return weapon;
    const kind = actionDamageKind(action),
      rule = abilityDamageRules.get(String(action || ""));
    // 只有炽焰三叉戟能由施放技能触发；mayhem 与 pierce 只属于普通攻击。
    if (kind === "support")
      return weapon.includes("blazing_trident") ? weapon : action;
    // mayhem 与同一目标的普攻被服务器合并成一个 HP 差；无法验证本次
    // 是否触发及其数值，因此连枷伤害保持为普通攻击，不再单独分类。
    if (weapon.includes("chaotic_flail") && action === "auto") return action;
    // pierce 的额外目标会在调用处按怪物槽位拆分，这里保留普通攻击来源。
    if (weapon.includes("sundering_crossbow") && action === "auto")
      return action;
    // 三叉戟与直接技能在同一消息中只有合计 HP 差，保留“含特效”标记；
    // 展示层会把它与同技能普通伤害合为一行，并继续使用技能图标。
    const singleTarget =
      action === "auto" ||
      !rule ||
      !(
        Array.isArray(rule.targetTypes) &&
        rule.targetTypes.some((type) => /allEnemies|all_enemies/i.test(type))
      );
    if (
      weapon.includes("blazing_trident") &&
      singleTarget &&
      damagedTargetCount > 1
    )
      return combinedWeaponSource(weapon, action);
    return action;
  }
  function splitCrossbowPierce(playerName, action, hits, primaryKey) {
    const weapon = directWeaponEffectFor(playerName);
    if (
      action !== "auto" ||
      !weapon.includes("sundering_crossbow") ||
      !Array.isArray(hits) ||
      hits.length < 2
    )
      return null;
    const primary = hits.find((hit) => String(hit.key) === String(primaryKey));
    if (!primary) return null;
    const effect = hits
      .filter((hit) => String(hit.key) !== String(primaryKey))
      .reduce((sum, hit) => sum + (Number(hit.amount) || 0), 0);
    return effect > 0
      ? { base: Number(primary.amount) || 0, effect, weapon }
      : null;
  }
  function monsterIdentity(names, hrids, key) {
    const baseName = names[key] || "怪物" + (+key + 1),
      hrid = hrids[key] || "";
    const duplicateCount = Object.keys(names || {}).filter(
      (candidate) =>
        names[candidate] === baseName && (hrids[candidate] || "") === hrid,
    ).length;
    // 同种怪物同时出现时，名称和 Hrid 完全相同；用战斗内稳定槽位加编号，
    // 避免它们的承伤技能明细被错误合并成同一个来源。
    return {
      name: duplicateCount > 1 ? baseName + " #" + (+key + 1) : baseName,
      hrid,
    };
  }
  function takenSource(names, hrids, key, action) {
    const monster = monsterIdentity(names, hrids, key);
    return TakenSources.encode(monster.name, monster.hrid, action);
  }
  function actionFromUpdate(unit = {}, fallback = "") {
    return (
      unit.abilityHrid ||
      (unit.isAutoAtk || unit.isAutoAttack ? "auto" : fallback)
    );
  }
  function activateReflection(
    activeContainer,
    sourceContainer,
    slot,
    abilityHrid,
    ts,
  ) {
    const duration = reflectionAbilityRules.get(String(abilityHrid || ""));
    if (duration) {
      activeContainer[slot] = Math.max(
        activeContainer[slot] || 0,
        ts + duration,
      );
      sourceContainer[slot] = String(abilityHrid);
    }
  }
  function activateGuildReflection(slot, abilityHrid, ts) {
    activateReflection(
      guildReflectUntil,
      guildReflectSource,
      slot,
      abilityHrid,
      ts,
    );
  }
  function isGuildReflecting(slot, ts) {
    return Number(guildReflectUntil[slot]) > ts;
  }
  function activatePlayerReflection(slot, abilityHrid, ts) {
    activateReflection(
      playerReflectUntil,
      playerReflectSource,
      slot,
      abilityHrid,
      ts,
    );
  }
  function isPlayerReflecting(slot, ts) {
    return Number(playerReflectUntil[slot]) > ts;
  }
  function learnPlayerReflectionState(slot, unit = {}) {
    rememberAbilityKnowledge(
      playerKnownDotAbilities,
      playerKnownReflectionAbilities,
      slot,
      unit,
    );
    const nowWall = Date.now(),
      nowPerf = clockNow();
    let remaining = 0,
      foundBuff = false;
    Object.values(unit.combatBuffMap || {}).forEach((buff) => {
      const type = normalizedReflectType(
        (buff && buff.typeHrid) || (buff && buff.uniqueHrid),
      );
      if (!REFLECTION_TYPES.has(type)) return;
      foundBuff = true;
      const duration = durationToMs(buff.duration);
      const started = Date.parse(buff.startTime || "");
      const expires = Number.isFinite(started)
        ? started + duration
        : nowWall + duration;
      remaining = Math.max(
        remaining,
        duration === 0 ? Infinity : expires - nowWall,
      );
      const unique = String((buff && buff.uniqueHrid) || ""),
        byUnique = reflectionBuffSources.get(unique),
        byType = [...(reflectionTypeSources.get(type) || [])],
        known = [...(playerKnownReflectionAbilities[slot] || [])],
        evidence = unique.toLowerCase();
      const exact =
        byUnique ||
        (byType.length === 1 ? byType[0] : "") ||
        (known.length === 1 ? known[0] : "") ||
        (evidence.includes("spike_shell")
          ? "/abilities/spike_shell"
          : evidence.includes("retribution")
            ? "/abilities/retribution"
            : "");
      if (exact) playerReflectSource[slot] = exact;
    });
    const stats = (unit.combatDetails && unit.combatDetails.combatStats) || {};
    const permanent =
      !foundBuff &&
      (Number(stats.physicalThorns) ||
        Number(stats.elementalThorns) ||
        Number(stats.retaliation));
    if (permanent) playerReflectUntil[slot] = Infinity;
    else if (remaining > 0)
      playerReflectUntil[slot] = Math.max(
        playerReflectUntil[slot] || 0,
        nowPerf + remaining,
      );
    if (!playerReflectSource[slot]) {
      const known = [...(playerKnownReflectionAbilities[slot] || [])];
      if (known.length === 1) playerReflectSource[slot] = known[0];
    }
  }
  function learnPlayerReflectionUnit(unit = {}) {
    const name = unit.name || (unit.character && unit.character.name);
    if (!name) return;
    for (const [slot, slotName] of keyToName) {
      if (slotName === name) learnPlayerReflectionState(slot, unit);
    }
  }
  function learnGuildReflectionState(unit = {}) {
    const name = unit.name || (unit.character && unit.character.name);
    if (!name) return;
    const slots = [...guildSlotNames.entries()]
      .filter(([, slotName]) => slotName === name)
      .map(([slot]) => slot);
    if (!slots.length) return;
    slots.forEach((slot) =>
      rememberAbilityKnowledge(
        guildKnownDotAbilities,
        guildKnownReflectionAbilities,
        slot,
        unit,
      ),
    );
    const nowWall = Date.now(),
      nowPerf = clockNow();
    let remaining = 0,
      foundBuff = false;
    Object.values(unit.combatBuffMap || {}).forEach((buff) => {
      const type = normalizedReflectType(
        (buff && buff.typeHrid) || (buff && buff.uniqueHrid),
      );
      if (!REFLECTION_TYPES.has(type)) return;
      foundBuff = true;
      const duration = durationToMs(buff.duration);
      const started = Date.parse(buff.startTime || "");
      const expires = Number.isFinite(started)
        ? started + duration
        : nowWall + duration;
      remaining = Math.max(
        remaining,
        duration === 0 ? Infinity : expires - nowWall,
      );
      const unique = String((buff && buff.uniqueHrid) || "");
      const byUnique = reflectionBuffSources.get(unique);
      const byType = [...(reflectionTypeSources.get(type) || [])];
      const evidence = unique.toLowerCase();
      slots.forEach((slot) => {
        const known = [...(guildKnownReflectionAbilities[slot] || [])];
        const exact =
          byUnique ||
          (byType.length === 1 ? byType[0] : "") ||
          (known.length === 1 ? known[0] : "") ||
          (evidence.includes("spike_shell")
            ? "/abilities/spike_shell"
            : evidence.includes("retribution")
              ? "/abilities/retribution"
              : "");
        if (exact) guildReflectSource[slot] = exact;
      });
    });
    const stats = (unit.combatDetails && unit.combatDetails.combatStats) || {};
    const permanent =
      !foundBuff &&
      (Number(stats.physicalThorns) ||
        Number(stats.elementalThorns) ||
        Number(stats.retaliation));
    slots.forEach((slot) => {
      if (permanent) guildReflectUntil[slot] = Infinity;
      else if (remaining > 0)
        guildReflectUntil[slot] = Math.max(
          guildReflectUntil[slot] || 0,
          nowPerf + remaining,
        );
      if (!guildReflectSource[slot]) {
        const known = [...(guildKnownReflectionAbilities[slot] || [])];
        if (known.length === 1) guildReflectSource[slot] = known[0];
      }
      // 人物详情中的 buff 使用服务器绝对时间；录制回放、客户端时钟偏差或
      // 延迟快照都可能让它看起来已经过期。过期快照只能不再延长状态，不能
      // 删除由实时 atkCounter/技能动作刚确认的反伤窗口。
    });
  }
  function learnProfileReflectionEquipment(payload = {}) {
    const profile =
      payload.profile || (payload.data && payload.data.profile) || payload;
    const shared = profile.sharableCharacter || profile.character || profile;
    const name = shared.name || profile.name;
    if (!name) return;
    const wearable = profile.wearableItemMap || shared.wearableItemMap || {};
    const equipped = new Set();
    const walk = (value, depth = 0) => {
      if (depth > 5 || value === null || value === undefined) return;
      if (typeof value === "string") {
        if (value.startsWith("/items/")) equipped.add(value);
        return;
      }
      if (typeof value === "object")
        Object.values(value).forEach((child) => walk(child, depth + 1));
    };
    walk(wearable);
    const reflectionItem = [...equipped].find((hrid) =>
      reflectionItemHrids.has(hrid),
    );
    if (!reflectionItem) return;
    [...guildSlotNames.entries()]
      .filter(([, slotName]) => slotName === name)
      .forEach(([slot]) => {
        guildReflectUntil[slot] = Infinity;
        guildReflectSource[slot] = reflectionItem;
      });
  }
  function guildStageSignature(payload = {}) {
    const base = String(
      payload.combatStartTime ||
        payload.guildBattleId ||
        payload.battleId ||
        payload.combatId ||
        "guild-" + CombatIdentity.dayStamp(new Date()),
    );
    const tier = payload.tier !== undefined ? String(payload.tier) : "unknown";
    return { base, signature: base + "|tier:" + tier, tier };
  }

  // ── new_guild_battle：权威名册与每层基线 ────────────────────────────────
  // Équivalent du new_battle classique mais pour le Trial : contient le vrai
  // players[] complet (nom, id, ordre) — exactement ce que le bricolage DOM
  // (MiniUnit_name, offset heuristique, verrouillage anti-doublon, détection
  // d'outlier CSS) tentait de deviner de façon fragile et parfois FAUSSE.
  //
  // CORRIGÉ le 26/07 : ce message peut arriver PLUSIEURS FOIS dans une même
  // session (observé : 3 occurrences), et le players[] tourne circulairement
  // à chaque fois (même 23 noms, ordre décalé) — battleId ne change pourtant
  // pas. Ça reflète très probablement un ré-appariement des sous-combats
  // partagés (plusieurs instances du même boss). CONSÉQUENCE CRITIQUE : le
  // mapping slot→nom n'est PAS stable sur toute la session, il change à
  // chaque occurrence. L'ancien code verrouillait au premier succès et
  // ignorait les occurrences suivantes → tout ce qui se passait après la
  // 2e/3e rotation était attribué au MAUVAIS nom (des joueurs derniers au
  // classement se retrouvaient premiers après un simple refresh de capture).
  //
  // Fix : cette source AUTORITAIRE écrase TOUJOURS le mapping, à chaque
  // occurrence, sans jamais respecter le verrouillage (celui-ci ne protège
  // que contre le bricolage DOM, moins fiable). Pas de fusion de stats ici :
  // une rotation signifie un changement RÉEL d'identité de slot, donc les
  // dégâts déjà attribués avant la rotation restent corrects pour la période
  // où ils ont eu lieu — les fusionner vers le nouveau nom serait FAUX.
  function processNewGuildBattle(p) {
    const players = p.players || [];
    if (players.length === 0) return;
    const stage = guildStageSignature(p);
    const wasGuildBattle = isGuildBattle;
    isGuildBattle = true;
    const stageChanged =
      wasGuildBattle &&
      currentGuildStageSignature &&
      stage.signature !== currentGuildStageSignature;
    if (stageChanged) {
      // tier 升级只更新实时差值基线。上层同日试炼 Session 不清零、不分片。
      guildTrialEnded = false;
      guildCombatWasActive = false;
    }
    currentGuildStageSignature = stage.signature;
    currentGuildTier = stage.tier;
    currentCombatKey = stage.base;
    const classes = ClassSystem.registerPlayers(players);
    guildMaxSlot = Math.max(guildMaxSlot, players.length);
    guildPlayersHP = {};
    guildPlayersMP = {};
    guildPlayersAtkCounter = {};
    guildPlayersDmgCounter = {};
    guildCurrentAction = {};
    guildReflectUntil = {};
    guildReflectSource = {};
    guildKnownDotAbilities = {};
    guildDotUntil = {};
    guildKnownReflectionAbilities = {};
    guildMonstersHP = {};
    guildMonstersMHP = {};
    guildMonstersDmgCounter = {};
    guildMonstersAtkCounter = {};
    guildMonsterCurrentAction = {};
    guildMonsterNames = {};
    guildMonsterHrids = {};
    guildMonsterKnownDotAbilities = {};
    guildMonsterDotUntil = {};
    players.forEach((pl, i) => {
      const slot = String(i);
      const name = pl.name || (pl.character && pl.character.name);
      if (pl.currentHitpoints !== undefined)
        guildPlayersHP[slot] = Number(pl.currentHitpoints) || 0;
      if (pl.currentManapoints !== undefined)
        guildPlayersMP[slot] = Number(pl.currentManapoints) || 0;
      // 新层所有单位的计数器从初始值开始。队友在 new_guild_battle 中仍可能
      // 是精简对象；用 0 作为首个行动前基线，首条完整更新即可参与归属。
      guildPlayersAtkCounter[slot] = playerAttackCounter(pl) ?? 0;
      guildPlayersDmgCounter[slot] = monsterDamageCounter(pl) ?? 0;
      guildCurrentAction[slot] = actionFromUpdate(
        {
          abilityHrid: pl.preparingAbilityHrid,
          isAutoAtk: pl.isPreparingAutoAttack,
        },
        "",
      );
      rememberAbilityKnowledge(
        guildKnownDotAbilities,
        guildKnownReflectionAbilities,
        slot,
        pl,
      );
      if (!name) return;
      // Distinction cruciale : slot jamais résolu avant (fallback "JoueurN"
      // affiché faute de mieux) → PREMIÈRE résolution, on fusionne les stats
      // déjà accumulées sous le fallback vers le vrai nom. Slot DÉJÀ résolu
      // avec un vrai nom différent → ROTATION légitime (nouvelle sous-bataille),
      // on ne fusionne PAS : les dégâts passés restaient corrects pour la
      // période où ils ont eu lieu, les fusionner effacerait à tort l'identité
      // du joueur précédent.
      const wasNeverResolved = !guildSlotNames.has(slot);
      const oldLabel = guildSlotLabel(slot);
      guildSlotNames.set(slot, name);
      guildSlotLocked.add(slot);
      if (wasNeverResolved && oldLabel !== name) {
        bus.dispatchEvent(
          new CustomEvent("guildSlotRenamed", {
            detail: { oldName: oldLabel, newName: name },
          }),
        );
      }
    });
    (p.monsters || []).forEach((monster, index) => {
      const key = String(index);
      guildMonstersHP[key] =
        Number(
          monster.currentHitpoints !== undefined
            ? monster.currentHitpoints
            : monster.cHP,
        ) || 0;
      guildMonstersMHP[key] =
        Number(
          monster.maxHitpoints !== undefined
            ? monster.maxHitpoints
            : monster.mHP,
        ) || 0;
      const counter = monsterDamageCounter(monster);
      if (counter !== undefined) guildMonstersDmgCounter[key] = counter;
      guildMonstersAtkCounter[key] = playerAttackCounter(monster) ?? 0;
      guildMonsterCurrentAction[key] = actionFromUpdate(
        {
          abilityHrid: monster.preparingAbilityHrid,
          isAutoAtk: monster.isPreparingAutoAttack,
        },
        "",
      );
      guildMonsterNames[key] =
        monster.name ||
        String(monster.hrid || "")
          .split("/")
          .pop()
          .replace(/_/g, " ") ||
        "怪物" + (index + 1);
      guildMonsterHrids[key] = monster.hrid || "";
      rememberAbilityKnowledge(
        guildMonsterKnownDotAbilities,
        null,
        key,
        monster,
      );
    });
    players.forEach(learnGuildReflectionState);
    bus.dispatchEvent(
      new CustomEvent("guildBattleDetected", {
        detail: {
          combatKey: currentCombatKey,
          stageId: stage.signature,
          tier: stage.tier,
          stageChanged,
          characterId: currentCharacterId,
          classes,
        },
      }),
    );
  }

  // client_data / init_character_data 中的 guildCombatBattle 是当前试炼的
  // 权威快照：玩家数组按 pMap 槽位排列，并直接给出姓名、当前血蓝；怪物
  // 数组也包含当前/最大血量。优先用它建立映射与差值基线，刷新或与其他
  // WebSocket 包装脚本共存时无需等待 new_guild_battle，也不用从 DOM 猜名。
  function processGuildCombatSnapshot(battle) {
    if (
      !battle ||
      !Array.isArray(battle.players) ||
      battle.players.length === 0
    )
      return false;
    const players = battle.players,
      monsters = Array.isArray(battle.monsters) ? battle.monsters : [];
    const signature = [
      battle.combatStartTime || "",
      battle.battleId ?? "",
      battle.battleWave ?? "",
      battle.tier ?? "",
      players.length,
      monsters.length,
    ].join("|");
    if (signature === lastGuildSnapshotSignature && isGuildBattle) return false;
    lastGuildSnapshotSignature = signature;
    if (
      (!currentCharacterId || currentCharacterId === "unknown") &&
      players[0] &&
      players[0].character &&
      players[0].character.id
    ) {
      currentCharacterId = String(players[0].character.id);
    }
    processNewGuildBattle(battle);
    guildCombatWasActive = true;
    guildTrialEnded = false;
    return true;
  }

  function guildCombatSnapshotFromMessage(obj) {
    const sources = [
      obj,
      obj && obj.data,
      obj && obj.clientData,
      obj && obj.client_data,
      obj && obj.initCharacterData,
    ].filter((source) => source && typeof source === "object");
    for (const source of sources) {
      if (
        source.guildCombatBattle &&
        typeof source.guildCombatBattle === "object"
      )
        return source.guildCombatBattle;
    }
    return null;
  }

  // ── guild_updated : détection de fin de Trial ──────────────────────────────
  // Le Trial de guilde dure jusqu'à 1h (ou moins si toutes les vagues sont
  // tuées avant). Sans détection de fin, KikiMeter continue de diviser les
  // dégâts (figés, plus aucun n'arrive) par un temps qui continue de croître
  // → le DPS affiché décroît artificiellement après la fin du Trial.
  // guild.currentTrialsData (chaîne JSON) contient guild.combat.status
  // ('' → 'in_progress' → autre chose à la fin) et, par sous-combat
  // (badger/swarm/…), un flag `done` + `budgetRemainingMs` (décompte depuis
  // 3 600 000 ms = 1h pile). On détecte la fin par la première des deux :
  // status qui quitte 'in_progress' après l'avoir été, OU tous les
  // sous-combats connus passés à done:true.
  function processGuildUpdated(p) {
    if (!isGuildBattle || guildTrialEnded) return;
    const raw = p.guild && p.guild.currentTrialsData;
    if (!raw) return;
    let trials;
    try {
      trials = JSON.parse(raw);
    } catch (e) {
      return;
    }
    const combat = trials && trials.combat;
    if (!combat) return;

    if (combat.status === "in_progress") guildCombatWasActive = true;

    const parties = combat.parties;
    const allDone =
      parties &&
      Object.keys(parties).length > 0 &&
      Object.values(parties).every((party) => party && party.done === true);

    const statusLeftProgress =
      guildCombatWasActive && combat.status !== "in_progress";

    if (guildCombatWasActive && (allDone || statusLeftProgress)) {
      guildTrialEnded = true;
      bus.dispatchEvent(new CustomEvent("guildTrialEnded"));
    }
  }

  function processGuildBattleUpdated(p) {
    if (!isGuildBattle) return;
    const mMap = p.mMap || {},
      pMap = p.pMap || {};
    const idx = Object.keys(pMap);
    const ts = clockNow();

    for (const k of idx) guildMaxSlot = Math.max(guildMaxSlot, +k + 1);

    // 中途安装、刷新，或极端情况下新 tier 的首条 update 先于完整快照时，
    // 第一条只建立基线，避免把此前累计的 Boss 损血算作一条新伤害。
    const incomingTier =
      p.tier !== undefined ? String(p.tier) : currentGuildTier;
    if (
      currentGuildTier === null ||
      (incomingTier !== null &&
        String(currentGuildTier) !== String(incomingTier))
    ) {
      currentGuildTier = incomingTier;
      currentGuildStageSignature =
        String(p.battleId || currentCombatKey || "guild") +
        "|tier:" +
        String(incomingTier || "unknown");
      guildPlayersHP = {};
      guildPlayersMP = {};
      guildPlayersAtkCounter = {};
      guildPlayersDmgCounter = {};
      guildCurrentAction = {};
      guildReflectUntil = {};
      guildReflectSource = {};
      guildKnownDotAbilities = {};
      guildDotUntil = {};
      guildKnownReflectionAbilities = {};
      guildMonstersHP = {};
      guildMonstersMHP = {};
      guildMonstersDmgCounter = {};
      guildMonstersAtkCounter = {};
      guildMonsterCurrentAction = {};
      guildMonsterNames = {};
      guildMonsterHrids = {};
      guildMonsterKnownDotAbilities = {};
      guildMonsterDotUntil = {};
      for (const k of idx) {
        const unit = pMap[k],
          counter = playerAttackCounter(unit);
        guildPlayersHP[k] = Number(unit.cHP) || 0;
        guildPlayersMP[k] = Number(unit.cMP) || 0;
        if (counter !== undefined) guildPlayersAtkCounter[k] = counter;
        const damageCounter = monsterDamageCounter(unit);
        if (damageCounter !== undefined)
          guildPlayersDmgCounter[k] = damageCounter;
        guildCurrentAction[k] = actionFromUpdate(unit, "");
        rememberAbilityKnowledge(
          guildKnownDotAbilities,
          guildKnownReflectionAbilities,
          k,
          unit,
        );
      }
      for (const mk in mMap) {
        const unit = mMap[mk],
          counter = monsterDamageCounter(unit);
        guildMonstersHP[mk] = Number(unit.cHP) || 0;
        guildMonstersMHP[mk] = Number(unit.mHP) || 0;
        if (counter !== undefined) guildMonstersDmgCounter[mk] = counter;
        guildMonstersAtkCounter[mk] = playerAttackCounter(unit) ?? 0;
        guildMonsterCurrentAction[mk] = actionFromUpdate(unit, "");
        guildMonsterNames[mk] =
          unit.name ||
          String(unit.hrid || "")
            .split("/")
            .pop()
            .replace(/_/g, " ") ||
          "怪物" + (+mk + 1);
        guildMonsterHrids[mk] = unit.hrid || "";
        rememberAbilityKnowledge(guildMonsterKnownDotAbilities, null, mk, unit);
      }
      guildTrialEnded = false;
      guildCombatWasActive = true;
      return;
    }

    // 新版测试服为所有玩家提供完整 atkCounter；唯一增长者就是刚完成动作
    // 的玩家。公会试炼不再查看 MP，也不再按 pMap 人数平均分配。
    const counterActors = [],
      counterDeltas = {},
      completedActions = {},
      hitPlayers = new Set();
    for (const k of idx) {
      const unit = pMap[k],
        counter = playerAttackCounter(unit),
        previous = guildPlayersAtkCounter[k];
      rememberAbilityKnowledge(
        guildKnownDotAbilities,
        guildKnownReflectionAbilities,
        k,
        unit,
      );
      if (unit.abilityHrid)
        ClassSystem.learnAbility(guildSlotLabel(k), unit.abilityHrid);
      guildPlayersMP[k] = Number(unit.cMP) || 0;
      if (counter !== undefined) {
        if (previous !== undefined && counter > previous) {
          const completed =
            guildCurrentAction[k] ||
            (unit.isAutoAtk || unit.isAutoAttack ? "auto" : "unknown");
          counterActors.push(k);
          counterDeltas[k] = counter - previous;
          completedActions[k] = completed;
          activateGuildReflection(k, completed, ts);
          activateDot(guildDotUntil, guildKnownDotAbilities, k, completed, ts);
        }
        guildPlayersAtkCounter[k] = counter;
      }
      const damageCounter = monsterDamageCounter(unit),
        previousDamage = guildPlayersDmgCounter[k];
      if (damageCounter !== undefined) {
        if (previousDamage !== undefined && damageCounter > previousDamage)
          hitPlayers.add(k);
        guildPlayersDmgCounter[k] = damageCounter;
      }
      guildCurrentAction[k] = actionFromUpdate(unit, guildCurrentAction[k]);
    }

    // Boss 的 atkCounter 增长说明本条消息由 Boss 攻击触发；若同时 Boss
    // 自己掉血，则该部分属于玩家荆棘/反击，而不是普通玩家主动攻击。
    const monsterActors = [],
      monsterCompletedActions = {};
    for (const mk in mMap) {
      const unit = mMap[mk],
        counter = playerAttackCounter(unit),
        previous = guildMonstersAtkCounter[mk];
      rememberAbilityKnowledge(guildMonsterKnownDotAbilities, null, mk, unit);
      if (counter !== undefined) {
        if (previous !== undefined && counter > previous) {
          const completed =
            guildMonsterCurrentAction[mk] || actionFromUpdate(unit, "unknown");
          monsterActors.push(mk);
          monsterCompletedActions[mk] = completed;
          activateDot(
            guildMonsterDotUntil,
            guildMonsterKnownDotAbilities,
            mk,
            completed,
            ts,
          );
        }
        guildMonstersAtkCounter[mk] = counter;
      }
      guildMonsterCurrentAction[mk] = actionFromUpdate(
        unit,
        guildMonsterCurrentAction[mk],
      );
    }
    // 仅在一条完整怪物快照中，单一玩家的已知直伤动作恰好结算
    // 一次时记录命中率；同帧多人、计数跳变和 Boss 行动全部排除。
    const soleAccuracyActor =
        counterActors.length === 1 &&
        counterDeltas[counterActors[0]] === 1 &&
        monsterActors.length === 0 &&
        Object.keys(mMap).length > 0 &&
        actionDamageKind(completedActions[counterActors[0]]) === "direct"
          ? counterActors[0]
          : null,
      accuracyAction =
        soleAccuracyActor === null
          ? ""
          : completedActions[soleAccuracyActor] || "",
      accuracyAliveMonsterKeys = Object.keys(guildMonstersHP).filter(
        (key) => mMap[key] && Number(guildMonstersHP[key]) > 0,
      );

    let incomingTakenSource = TakenSources.encode("未知怪物", "", "unknown");
    if (monsterActors.length === 1) {
      const mk = monsterActors[0];
      incomingTakenSource = takenSource(
        guildMonsterNames,
        guildMonsterHrids,
        mk,
        monsterCompletedActions[mk] || "unknown",
      );
    } else if (monsterActors.length === 0) {
      const monsterKeys = Object.keys(mMap),
        dotMonster = uniqueDotCandidate(
          monsterKeys,
          guildMonsterKnownDotAbilities,
          guildMonsterDotUntil,
          ts,
        );
      if (dotMonster !== null)
        incomingTakenSource = takenSource(
          guildMonsterNames,
          guildMonsterHrids,
          dotMonster,
          dotSourceFor(
            guildMonsterKnownDotAbilities,
            guildMonsterDotUntil,
            dotMonster,
            ts,
          ),
        );
      else if (monsterKeys.length === 1)
        incomingTakenSource = takenSource(
          guildMonsterNames,
          guildMonsterHrids,
          monsterKeys[0],
          "unknown",
        );
    }

    for (const k of idx) {
      const hp = pMap[k].cHP || 0;
      if (guildPlayersHP[k] !== undefined) {
        const name = guildSlotLabel(k);
        const diff = guildPlayersHP[k] - hp;
        if (diff > 0)
          bus.dispatchEvent(
            new CustomEvent("playerDamageTaken", {
              detail: {
                name,
                amount: diff,
                source: incomingTakenSource,
                battleType: "trial",
              },
            }),
          );
        else if (hp > guildPlayersHP[k])
          bus.dispatchEvent(
            new CustomEvent("healing", {
              detail: {
                name,
                amount: hp - guildPlayersHP[k],
                battleType: "trial",
              },
            }),
          );
      }
      guildPlayersHP[k] = pMap[k].cHP || 0;
    }

    // dmgCounter 位于受击者。只有怪物 HP 下降且其 dmgCounter 同时增长，
    // 才是有效伤害；换层、重生、最大生命变化和乱序快照都只更新基线。
    const primaryGuildMonsterKey = Object.keys(guildMonstersHP)
      .sort((a, b) => +a - +b)
      .find((key) => Number(guildMonstersHP[key]) > 0);
    const guildMonsterHits = [];
    let tickDmg = 0,
      damagedTargetCount = 0;
    for (const mk in mMap) {
      const mv = mMap[mk];
      if (
        guildMonstersHP[mk] === undefined ||
        guildMonstersMHP[mk] !== mv.mHP
      ) {
        guildMonstersHP[mk] = mv.cHP || 0;
        guildMonstersMHP[mk] = mv.mHP;
        const initialCounter = monsterDamageCounter(mv);
        if (initialCounter !== undefined)
          guildMonstersDmgCounter[mk] = initialCounter;
        continue;
      }
      const previousHP = guildMonstersHP[mk],
        previousCounter = guildMonstersDmgCounter[mk];
      const nextCounter = monsterDamageCounter(mv),
        d = previousHP - (mv.cHP || 0);
      if (
        d > 0 &&
        nextCounter !== undefined &&
        previousCounter !== undefined &&
        nextCounter > previousCounter
      ) {
        tickDmg += d;
        damagedTargetCount++;
        guildMonsterHits.push({ key: mk, amount: d });
      }
      guildMonstersHP[mk] = mv.cHP || 0;
      if (nextCounter !== undefined) guildMonstersDmgCounter[mk] = nextCounter;
    }

    if (tickDmg > 0) {
      bus.dispatchEvent(
        new CustomEvent("damage", {
          detail: { amount: tickDmg, ts, battleType: "trial" },
        }),
      );
      // 支援/治疗动作和 DoT 跳伤可能在同一消息内结算。若唯一 atkCounter
      // 增长者的已完成技能不能造成伤害，就从 pMap 中寻找唯一的 DoT 施放者，
      // 不能把怪物掉血错误记到治疗者名下。
      let attributedKey = null,
        source = "unknown";
      const soleCounter = counterActors.length === 1 ? counterActors[0] : null;
      if (monsterActors.length === 1) {
        const hitReflectors = idx.filter(
          (k) => hitPlayers.has(k) && isGuildReflecting(k, ts),
        );
        const reflectors = hitReflectors.length
          ? hitReflectors
          : idx.filter((k) => isGuildReflecting(k, ts));
        if (reflectors.length === 1) {
          attributedKey = reflectors[0];
          source = guildReflectSource[attributedKey] || "reflect";
        }
      }
      if (attributedKey === null && soleCounter !== null) {
        const completed = completedActions[soleCounter] || "unknown",
          kind = actionDamageKind(completed);
        const actorName = guildSlotLabel(soleCounter),
          weapon = directWeaponEffectFor(actorName);
        if (kind !== "support") {
          attributedKey = soleCounter;
          source = completed;
        } else if (weapon.includes("blazing_trident")) {
          attributedKey = soleCounter;
          source = weapon;
        } else {
          const dotKey = uniqueDotCandidate(
            idx,
            guildKnownDotAbilities,
            guildDotUntil,
            ts,
          );
          if (dotKey !== null) {
            attributedKey = dotKey;
            source = dotSourceFor(
              guildKnownDotAbilities,
              guildDotUntil,
              dotKey,
              ts,
            );
          }
        }
      }
      if (attributedKey === null && monsterActors.length === 0) {
        const dotKey = uniqueDotCandidate(
          idx,
          guildKnownDotAbilities,
          guildDotUntil,
          ts,
        );
        if (dotKey !== null) {
          attributedKey = dotKey;
          source = dotSourceFor(
            guildKnownDotAbilities,
            guildDotUntil,
            dotKey,
            ts,
          );
        } else if (idx.length === 1) {
          attributedKey = idx[0];
          source = dotSourceFor(
            guildKnownDotAbilities,
            guildDotUntil,
            idx[0],
            ts,
          );
        }
      }
      if (attributedKey !== null) {
        const name = guildSlotLabel(attributedKey);
        const pierce = splitCrossbowPierce(
          name,
          source,
          guildMonsterHits,
          primaryGuildMonsterKey,
        );
        if (pierce) {
          if (pierce.base > 0)
            bus.dispatchEvent(
              new CustomEvent("playerDamage", {
                detail: {
                  name,
                  amount: pierce.base,
                  source: "auto",
                  ts,
                  battleType: "trial",
                },
              }),
            );
          bus.dispatchEvent(
            new CustomEvent("playerDamage", {
              detail: {
                name,
                amount: pierce.effect,
                source: pierce.weapon,
                ts,
                battleType: "trial",
              },
            }),
          );
        } else {
          source = sourceWithWeaponEffect(name, source, damagedTargetCount);
          bus.dispatchEvent(
            new CustomEvent("playerDamage", {
              detail: {
                name,
                amount: tickDmg,
                source,
                ts,
                battleType: "trial",
              },
            }),
          );
        }
        Diagnostics.recordNominal();
      } else if (monsterActors.length === 1) {
        // 命中的反伤者优先。惩戒类效果也可能在 Boss 攻击未命中时触发，
        // 此时玩家 dmgCounter 不增长；若没有命中候选，则回退到本条 pMap
        // 中仍处于反伤状态的玩家。多人只能看到合计值，继续按人数平分。
        const hitReflectors = idx.filter(
          (k) => hitPlayers.has(k) && isGuildReflecting(k, ts),
        );
        const reflectors = hitReflectors.length
          ? hitReflectors
          : idx.filter((k) => isGuildReflecting(k, ts));
        if (reflectors.length) {
          const share = tickDmg / reflectors.length;
          reflectors.forEach((k) =>
            bus.dispatchEvent(
              new CustomEvent("playerDamage", {
                detail: {
                  name: guildSlotLabel(k),
                  amount: share,
                  source: guildReflectSource[k] || "reflect",
                  ts,
                  battleType: "trial",
                },
              }),
            ),
          );
          Diagnostics.recordNominal();
        } else Diagnostics.recordOrphan(tickDmg);
      } else {
        // Boss AoE 同时触发多人盾反时只能看到合计 HP 差，无法恢复每人的
        // 单独反伤；保留团队总量并明确记为未归属，比虚假均分更准确。
        Diagnostics.recordOrphan(tickDmg);
      }
    }
    if (soleAccuracyActor !== null) {
      bus.dispatchEvent(
        new CustomEvent("attackResolved", {
          detail: {
            name: guildSlotLabel(soleAccuracyActor),
            hit: guildMonsterHits.length > 0,
            targets: accuracyTargets(
              accuracyAction,
              guildMonsterHits,
              accuracyAliveMonsterKeys,
              guildMonsterNames,
              guildMonsterHrids,
            ),
            battleType: "trial",
          },
        }),
      );
    }
  }

  function resetBattleState() {
    monstersHP = [];
    monstersAlive = [];
    monsterNames = [];
    monsterHrids = [];
    monstersAtkCounter = [];
    monsterCurrentAction = [];
    monsterKnownDotAbilities = {};
    monsterDotUntil = {};
    playersMP = [];
    playersAtkCounter = [];
    playersDmgCounter = [];
    playersHP = [];
    playerKnownDotAbilities = {};
    playerDotUntil = {};
    playerDotCasts = [];
    playerKnownReflectionAbilities = {};
    playerReflectUntil = {};
    playerReflectSource = {};
    currentAction = [];
    keyToName.clear();
    haveBattle = false;
    lastCombatStartTime = null;
    isGuildBattle = false;
    guildMonstersHP = {};
    guildMonstersMHP = {};
    guildMonstersDmgCounter = {};
    guildMonstersAtkCounter = {};
    guildMonsterCurrentAction = {};
    guildMonsterNames = {};
    guildMonsterHrids = {};
    guildMonsterKnownDotAbilities = {};
    guildMonsterDotUntil = {};
    guildPlayersHP = {};
    guildPlayersMP = {};
    guildPlayersAtkCounter = {};
    guildPlayersDmgCounter = {};
    guildCurrentAction = {};
    guildReflectUntil = {};
    guildReflectSource = {};
    guildMaxSlot = 0;
    guildKnownDotAbilities = {};
    guildDotUntil = {};
    guildKnownReflectionAbilities = {};
    currentGuildTier = null;
    currentGuildStageSignature = "";
    guildSlotNames.clear();
    guildSlotLocked.clear();
    guildCombatWasActive = false;
    guildTrialEnded = false;
    lastGuildSnapshotSignature = "";
  }

  function processNewBattle(p) {
    // 公会试炼与普通战斗可以同时进行。试炼模式已经确认后收到的 new_battle
    // 属于并行普通战斗，不能改写试炼标识、清空试炼怪物基线或重置 Session。
    const parallelGuildBattle = isGuildBattle;
    // Détection de NOUVELLE INSTANCE de combat (≠ nouvelle vague) :
    // combatStartTime est constant sur toutes les vagues d'une instance
    // (validé sur 8 captures, y compris 12 battleId de farming = 1 seul
    // combatStartTime) et change uniquement quand le joueur relance.
    // → émis AVANT newBattle pour que le reset précède les nouveaux noms.
    const incomingCombatKey = p.combatStartTime || p.battleId || p.combatId;
    if (incomingCombatKey && !parallelGuildBattle) {
      if (
        lastCombatStartTime !== null &&
        incomingCombatKey !== lastCombatStartTime
      ) {
        bus.dispatchEvent(new CustomEvent("newCombatInstance"));
      }
      lastCombatStartTime = incomingCombatKey;
      currentCombatKey = String(incomingCombatKey);
    }
    // Détection Trial de guilde : new_battle avec isGuildBattle ou un seul joueur
    // ET guild_battle_updated déjà reçus. On détecte via battle_consumable_ability_updated
    // (isGuildBattle=true) ou en attente du premier guild_battle_updated.
    // Reset propre de l'état guild.
    if (!parallelGuildBattle) {
      guildMonstersHP = {};
      guildMonstersMHP = {};
      guildMonstersDmgCounter = {};
      guildMonstersAtkCounter = {};
      guildMonsterCurrentAction = {};
      guildMonsterNames = {};
      guildMonsterHrids = {};
      guildMonsterKnownDotAbilities = {};
      guildMonsterDotUntil = {};
      guildPlayersHP = {};
      guildPlayersMP = {};
      guildPlayersAtkCounter = {};
      guildPlayersDmgCounter = {};
      guildCurrentAction = {};
      guildReflectUntil = {};
      guildReflectSource = {};
      guildKnownDotAbilities = {};
      guildDotUntil = {};
      guildKnownReflectionAbilities = {};
    }
    // isGuildBattle sera confirmé au premier guild_battle_updated.
    monstersHP = (p.monsters || []).map((m) =>
      m.currentHitpoints !== undefined ? m.currentHitpoints : m.cHP || 0,
    );
    monstersAlive = monstersHP.map((hp) => hp > 0);
    monsterNames = (p.monsters || []).map(
      (monster, index) =>
        monster.name ||
        String(monster.hrid || "")
          .split("/")
          .pop()
          .replace(/_/g, " ") ||
        "怪物" + (index + 1),
    );
    monsterHrids = (p.monsters || []).map((monster) => monster.hrid || "");
    monstersAtkCounter = (p.monsters || []).map(
      (monster) => playerAttackCounter(monster) ?? 0,
    );
    monsterCurrentAction = (p.monsters || []).map((monster) =>
      monster.preparingAbilityHrid
        ? monster.preparingAbilityHrid
        : monster.isPreparingAutoAttack
          ? "auto"
          : "",
    );
    monsterKnownDotAbilities = {};
    monsterDotUntil = {};
    (p.monsters || []).forEach((monster, index) =>
      rememberAbilityKnowledge(
        monsterKnownDotAbilities,
        null,
        String(index),
        monster,
      ),
    );
    playersMP = (p.players || []).map((pl) =>
      pl.currentManapoints !== undefined ? pl.currentManapoints : pl.cMP || 0,
    );
    playersAtkCounter = (p.players || []).map((pl) => {
      const value =
        pl.attackAttemptCounter !== undefined
          ? pl.attackAttemptCounter
          : pl.atkCounter;
      const number = Number(value);
      return value !== undefined && Number.isFinite(number)
        ? number
        : undefined;
    });
    playersDmgCounter = (p.players || []).map((pl) => monsterDamageCounter(pl));
    playersHP = (p.players || []).map((pl) =>
      pl.currentHitpoints !== undefined ? pl.currentHitpoints : pl.cHP || 0,
    );
    playerKnownDotAbilities = {};
    playerDotUntil = {};
    playerDotCasts = [];
    playerKnownReflectionAbilities = {};
    playerReflectUntil = {};
    playerReflectSource = {};
    keyToName.clear();
    const names = [];
    const classes = ClassSystem.registerPlayers(p.players || []);
    (p.players || []).forEach((pl, i) => {
      const n = (pl.character && pl.character.name) || pl.name;
      if (n) {
        names.push(n);
        keyToName.set(String(i), n);
      }
      learnPlayerReflectionState(String(i), pl);
    });
    // preparingAbilityHrid : l'intention de cast au début de vague — le sort
    // en incantation dont les dégâts atterriront dans les premiers messages.
    currentAction = (p.players || []).map((pl) =>
      pl.preparingAbilityHrid
        ? pl.preparingAbilityHrid
        : pl.isPreparingAutoAttack
          ? "auto"
          : "idle",
    );
    haveBattle = true;

    // Les monstres normaux ont enrageTimerDuration = 180_000_000_000 ns (3 min).
    // Les boss ont plus (ex : Crystal Colossus = 600s). Seul signal boss fiable.
    const NORMAL_ENRAGE_NS = 180_000_000_000;
    const isBoss = (p.monsters || []).some(
      (m) => (m.enrageTimerDuration || 0) > NORMAL_ENRAGE_NS,
    );
    bus.dispatchEvent(
      new CustomEvent("newBattle", {
        detail: {
          names,
          isBoss,
          classes,
          combatKey: parallelGuildBattle
            ? String(incomingCombatKey || "")
            : currentCombatKey || String(p.battleId || ""),
          characterId: currentCharacterId,
          parallelGuildBattle,
        },
      }),
    );
  }

  function processBattleUpdated(p) {
    if (!haveBattle) return;
    // En Guild Trial, battle_updated = combat PERSONNEL en parallèle (ex : Golem Cave).
    // On ne l'attribue pas au DPS Trial pour ne pas mélanger les deux sessions.
    // Les dégâts Guild sont dans guild_battle_updated (processGuildBattleUpdated).
    if (isGuildBattle) return;
    const mMap = p.mMap || {},
      pMap = p.pMap || {};
    const idx = Object.keys(pMap);
    const ts = clockNow();
    const battleType = isInLabyrinth ? "labyrinth" : "combat";

    // 1. 真正行动者：普通战斗的完整 CombatUnitUpdate 会携带 atkCounter。
    //    一条事件可能触及多人，但通常只有发起攻击或施法者的计数器递增。
    //    MP 变化仅作为后备信号，因为普攻不耗蓝，而辅助技能也会耗蓝。
    const counterActors = [],
      counterDeltas = {},
      mpDroppers = [],
      completedActions = {},
      hitPlayers = new Set();
    for (const k of idx) {
      const i = +k,
        mp = pMap[k].cMP || 0;
      rememberAbilityKnowledge(
        playerKnownDotAbilities,
        playerKnownReflectionAbilities,
        k,
        pMap[k],
      );
      const playerName = keyToName.get(k);
      if (playerName && pMap[k].abilityHrid)
        ClassSystem.learnAbility(playerName, pMap[k].abilityHrid);
      if (playersMP[i] !== undefined && mp < playersMP[i]) mpDroppers.push(k);
      playersMP[i] = mp;
      const rawCounter =
        pMap[k].atkCounter !== undefined
          ? pMap[k].atkCounter
          : pMap[k].attackAttemptCounter;
      const nextCounter = Number(rawCounter),
        previousCounter = playersAtkCounter[i];
      if (rawCounter !== undefined && Number.isFinite(nextCounter)) {
        if (previousCounter !== undefined && nextCounter > previousCounter) {
          const completed =
            currentAction[i] ||
            (pMap[k].isAutoAtk || pMap[k].isAutoAttack ? "auto" : "unknown");
          counterActors.push(k);
          counterDeltas[k] = nextCounter - previousCounter;
          completedActions[k] = completed;
          activatePlayerReflection(k, completed, ts);
          activateDot(
            playerDotUntil,
            playerKnownDotAbilities,
            k,
            completed,
            ts,
            playerDotCasts,
          );
        }
        playersAtkCounter[i] = nextCounter;
      }
      const damageCounter = monsterDamageCounter(pMap[k]),
        previousDamage = playersDmgCounter[i];
      if (damageCounter !== undefined) {
        if (previousDamage !== undefined && damageCounter > previousDamage)
          hitPlayers.add(k);
        playersDmgCounter[i] = damageCounter;
      }
      const nextHP = Number(pMap[k].cHP);
      if (
        Number.isFinite(nextHP) &&
        playersHP[i] !== undefined &&
        nextHP < playersHP[i]
      )
        hitPlayers.add(k);
    }
    const counterActor = counterActors.length === 1 ? counterActors[0] : null;
    const castPlayer = mpDroppers.length === 1 ? mpDroppers[0] : null;

    // 怪物也使用“上一条准备动作 + 本条 atkCounter 增长”识别刚完成的
    // 技能。该来源会同时服务承伤总榜和“怪物 · 技能”明细。
    const monsterActors = [],
      monsterCompletedActions = {};
    for (const mk of Object.keys(mMap)) {
      const unit = mMap[mk],
        i = +mk,
        counter = playerAttackCounter(unit),
        previous = monstersAtkCounter[i];
      rememberAbilityKnowledge(monsterKnownDotAbilities, null, mk, unit);
      if (counter !== undefined) {
        if (previous !== undefined && counter > previous) {
          const completed =
            monsterCurrentAction[i] || actionFromUpdate(unit, "unknown");
          monsterActors.push(mk);
          monsterCompletedActions[mk] = completed;
          activateDot(
            monsterDotUntil,
            monsterKnownDotAbilities,
            mk,
            completed,
            ts,
          );
        }
        monstersAtkCounter[i] = counter;
      }
    }
    // 与试炼使用同一严格口径，避免把 MP 后备归属、DoT 或反伤
    // 恰好落在攻击帧的伤害误当成可靠命中。
    const soleAccuracyActor =
        counterActors.length === 1 &&
        counterDeltas[counterActors[0]] === 1 &&
        monsterActors.length === 0 &&
        Object.keys(mMap).length > 0 &&
        actionDamageKind(completedActions[counterActors[0]]) === "direct"
          ? counterActors[0]
          : null,
      accuracyAction =
        soleAccuracyActor === null
          ? ""
          : completedActions[soleAccuracyActor] || "",
      accuracyAliveMonsterKeys = monstersAlive
        .map((alive, index) => (alive ? String(index) : null))
        .filter((key) => key !== null && mMap[key]);
    let incomingTakenSource = TakenSources.encode("未知怪物", "", "unknown");
    if (monsterActors.length === 1) {
      const mk = monsterActors[0];
      incomingTakenSource = takenSource(
        monsterNames,
        monsterHrids,
        mk,
        monsterCompletedActions[mk] || "unknown",
      );
    } else if (monsterActors.length === 0) {
      const monsterKeys = Object.keys(mMap),
        dotMonster = uniqueDotCandidate(
          monsterKeys,
          monsterKnownDotAbilities,
          monsterDotUntil,
          ts,
        );
      if (dotMonster !== null)
        incomingTakenSource = takenSource(
          monsterNames,
          monsterHrids,
          dotMonster,
          dotSourceFor(
            monsterKnownDotAbilities,
            monsterDotUntil,
            dotMonster,
            ts,
          ),
        );
      else if (monsterKeys.length === 1)
        incomingTakenSource = takenSource(
          monsterNames,
          monsterHrids,
          monsterKeys[0],
          "unknown",
        );
    }

    // 2. Healing / dégâts reçus : delta de cHP d'un joueur présent dans pMap.
    //    cHP↑ = soin reçu ; cHP↓ = dégâts encaissés (attaque de monstre).
    for (const k of idx) {
      const i = +k,
        hp = pMap[k].cHP || 0;
      if (playersHP[i] !== undefined) {
        const name = keyToName.get(k);
        if (name && hp > playersHP[i]) {
          bus.dispatchEvent(
            new CustomEvent("healing", {
              detail: { name, amount: hp - playersHP[i], battleType },
            }),
          );
        } else if (name && hp < playersHP[i]) {
          bus.dispatchEvent(
            new CustomEvent("playerDamageTaken", {
              detail: {
                name,
                amount: playersHP[i] - hp,
                source: incomingTakenSource,
                battleType,
              },
            }),
          );
        }
      }
      playersHP[i] = hp;
    }

    // 3. 归属优先级：唯一 atkCounter 增量 → 唯一 MP 下降 → 已确认的
    // DoT 时间轴。治疗/辅助技能若与 DoT 同时结算，不把掉血记到治疗者。
    let attributedKey = null,
      attributedSource = "unknown";
    const hitReflectors = idx.filter(
        (k) => hitPlayers.has(k) && isPlayerReflecting(k, ts),
      ),
      reflectors =
        monsterActors.length === 1
          ? hitReflectors.length
            ? hitReflectors
            : idx.filter((k) => isPlayerReflecting(k, ts))
          : [];
    const actionActor = counterActor !== null ? counterActor : castPlayer;
    if (reflectors.length === 1) {
      attributedKey = reflectors[0];
      attributedSource = playerReflectSource[attributedKey] || "reflect";
    } else if (actionActor !== null) {
      const action =
        completedActions[actionActor] ||
        currentAction[+actionActor] ||
        "unknown";
      const actorName = keyToName.get(actionActor),
        weapon = directWeaponEffectFor(actorName);
      if (actionDamageKind(action) !== "support") {
        attributedKey = actionActor;
        attributedSource =
          action && action !== "idle"
            ? action
            : pMap[actionActor].isAutoAtk
              ? "auto"
              : "unknown";
      } else if (weapon.includes("blazing_trident")) {
        attributedKey = actionActor;
        attributedSource = weapon;
      }
    }

    const primaryMonsterIndex = monstersAlive.findIndex(Boolean),
      monsterHits = [];
    let tickDmg = 0,
      killed = 0,
      damagedTargetCount = 0;
    for (const mk in mMap) {
      const i = +mk,
        mv = mMap[mk];
      if (monstersHP[i] === undefined) continue; // hors baseline (ne devrait pas arriver)
      const hpDiff = monstersHP[i] - (mv.cHP || 0);
      monstersHP[i] = mv.cHP || 0;
      if (hpDiff > 0) {
        tickDmg += hpDiff;
        damagedTargetCount++;
        monsterHits.push({ key: mk, amount: hpDiff });
      }
      if (monstersAlive[i] && (mv.cHP || 0) <= 0) {
        monstersAlive[i] = false;
        killed++;
      }
    }

    let killAttributionKey = attributedKey;
    if (tickDmg > 0) {
      bus.dispatchEvent(
        new CustomEvent("damage", {
          detail: { amount: tickDmg, ts, battleType },
        }),
      );
      let scheduledDot = null;
      if (
        attributedKey === null &&
        reflectors.length === 0 &&
        monsterActors.length === 0
      ) {
        const playerKeys = [...keyToName.keys()],
          activeKeys = activeDotCandidates(playerKeys, playerDotUntil, ts);
        scheduledDot = scheduledDotDamage(playerDotCasts, monsterHits, ts);
        if (scheduledDot.groups.length) {
          if (
            scheduledDot.groups.length === 1 &&
            scheduledDot.unmatchedAmount === 0
          ) {
            killAttributionKey = scheduledDot.groups[0].key;
          }
        } else if (
          !scheduledDot.ambiguous &&
          !scheduledDot.hasPendingTargetSchedule &&
          activeKeys.length === 1
        ) {
          const activeKey = uniqueActiveDotCandidate(
            playerKeys,
            playerDotUntil,
            ts,
          );
          attributedKey = activeKey;
          attributedSource = activeDotSourceFor(playerDotUntil, activeKey, ts);
          killAttributionKey = activeKey;
        } else if (
          !scheduledDot.ambiguous &&
          !scheduledDot.hasPendingTargetSchedule &&
          activeKeys.length === 0 &&
          idx.length === 1
        ) {
          attributedKey = idx[0];
          killAttributionKey = attributedKey;
          const action = currentAction[+attributedKey];
          attributedSource =
            action === "auto" || pMap[attributedKey].isAutoAtk
              ? "auto"
              : "unknown";
        }
      }
      if (attributedKey !== null) {
        const name = keyToName.get(attributedKey);
        if (name) {
          recordDotAttribution(
            playerDotCasts,
            attributedKey,
            attributedSource,
            monsterHits,
            ts,
          );
          const pierce = splitCrossbowPierce(
            name,
            attributedSource,
            monsterHits,
            primaryMonsterIndex,
          );
          if (pierce) {
            if (pierce.base > 0)
              bus.dispatchEvent(
                new CustomEvent("playerDamage", {
                  detail: {
                    name,
                    amount: pierce.base,
                    source: "auto",
                    ts,
                    battleType,
                  },
                }),
              );
            bus.dispatchEvent(
              new CustomEvent("playerDamage", {
                detail: {
                  name,
                  amount: pierce.effect,
                  source: pierce.weapon,
                  ts,
                  battleType,
                },
              }),
            );
          } else {
            attributedSource = sourceWithWeaponEffect(
              name,
              attributedSource,
              damagedTargetCount,
            );
            bus.dispatchEvent(
              new CustomEvent("playerDamage", {
                detail: {
                  name,
                  amount: tickDmg,
                  source: attributedSource,
                  ts,
                  battleType,
                },
              }),
            );
          }
          Diagnostics.recordNominal();
        }
      } else if (scheduledDot?.groups.length) {
        for (const group of scheduledDot.groups) {
          const name = keyToName.get(group.key);
          if (!name || !(group.amount > 0)) continue;
          bus.dispatchEvent(
            new CustomEvent("playerDamage", {
              detail: {
                name,
                amount: group.amount,
                source: `dot:${group.abilityHrid}`,
                ts,
                battleType,
              },
            }),
          );
        }
        if (scheduledDot.unmatchedAmount > 0) {
          Diagnostics.recordOrphan(scheduledDot.unmatchedAmount);
        } else {
          Diagnostics.recordNominal();
        }
      } else if (reflectors.length > 1) {
        const share = tickDmg / reflectors.length;
        reflectors.forEach((key) => {
          const name = keyToName.get(key);
          if (!name) return;
          bus.dispatchEvent(
            new CustomEvent("playerDamage", {
              detail: {
                name,
                amount: share,
                source: playerReflectSource[key] || "reflect",
                ts,
                battleType,
              },
            }),
          );
        });
        Diagnostics.recordNominal();
      } else {
        Diagnostics.recordOrphan(tickDmg);
      }
    }

    if (killed > 0 && killAttributionKey !== null) {
      const name = keyToName.get(killAttributionKey);
      if (name)
        for (let n = 0; n < killed; n++)
          bus.dispatchEvent(
            new CustomEvent("kill", { detail: { name, battleType } }),
          );
    }

    if (soleAccuracyActor !== null) {
      const name = keyToName.get(soleAccuracyActor);
      if (name)
        bus.dispatchEvent(
          new CustomEvent("attackResolved", {
            detail: {
              name,
              hit: monsterHits.length > 0,
              targets: accuracyTargets(
                accuracyAction,
                monsterHits,
                accuracyAliveMonsterKeys,
                monsterNames,
                monsterHrids,
              ),
              battleType,
            },
          }),
        );
    }

    // 4. currentAction mis à jour APRÈS l'attribution — décalage d'un message,
    //    exactement comme MWITools (résout "l'abilityHrid a déjà avancé").
    for (const k of idx) {
      const i = +k,
        pv = pMap[k];
      currentAction[i] = pv.abilityHrid
        ? pv.abilityHrid
        : pv.isAutoAtk
          ? "auto"
          : "idle";
    }
    for (const mk of Object.keys(mMap)) {
      const i = +mk;
      monsterCurrentAction[i] = actionFromUpdate(
        mMap[mk],
        monsterCurrentAction[i],
      );
    }
  }

  function handleMessage(message) {
    let obj = message;
    if (typeof message === "string") {
      try {
        obj = JSON.parse(message);
      } catch (e) {
        ClassProbe.recordUnparsed(message);
        return;
      }
    }
    if (!obj || typeof obj !== "object" || !obj.type) return;
    const messageData =
      obj.data && typeof obj.data === "object" ? obj.data : obj;
    // 国际服、国服及测试服把客户端物品表放在不同消息/层级中；只要本次
    // 被动收到物品表就缓存，不向游戏服务器额外发出任何请求。
    const receivedItemDetails =
      messageData.itemDetailMap ||
      messageData.gameItemDetailMap ||
      obj.itemDetailMap ||
      obj.gameItemDetailMap;
    if (receivedItemDetails) ClassSystem.cacheItemDetails(receivedItemDetails);
    if (receivedItemDetails || hasReflectionDefinitions(obj)) {
      cacheReflectionDefinitions(obj);
    }
    Capture.record(obj.type, obj);
    ClassDebug.record(obj.type, obj);
    ClassProbe.record(obj.type, obj);
    // 角色初始化先清理旧角色状态，再导入同一消息中的完整试炼快照。
    // 否则若先导入再 reset，刚读到的玩家映射与血蓝基线会立即丢失。
    if (obj.type === "init_character_data") {
      const ch =
        messageData.character ||
        (obj.initCharacterData && obj.initCharacterData.character) ||
        {};
      const nextCharacterId = String(
        ch.id ||
          ch.characterID ||
          messageData.characterId ||
          obj.characterId ||
          "unknown",
      );
      const previousCharacterId = currentCharacterId;
      currentCharacterId = nextCharacterId;
      resetBattleState();
      currentCharacterId = nextCharacterId;
      bus.dispatchEvent(
        new CustomEvent("socketReconnected", {
          detail: { characterId: nextCharacterId, previousCharacterId },
        }),
      );
    }
    const guildSnapshot =
      obj.type === "init_character_data" ||
      obj.type === "new_guild_battle" ||
      obj.type === "guild_battle_updated"
        ? guildCombatSnapshotFromMessage(obj)
        : null;
    if (guildSnapshot) processGuildCombatSnapshot(guildSnapshot);
    if (obj.type === "battle_unit_fetched" || obj.type === "profile_shared") {
      const learned =
        obj.type === "profile_shared"
          ? ClassSystem.learnProfile(obj)
          : ClassSystem.learnBattleUnit(obj);
      if (obj.type === "battle_unit_fetched") {
        learnPlayerReflectionUnit(obj.unit || messageData.unit || {});
        learnGuildReflectionState(obj.unit || messageData.unit || {});
      } else learnProfileReflectionEquipment(obj);
      if (learned && learned.name && learned.classId !== "unknown") {
        bus.dispatchEvent(new CustomEvent("classLearned", { detail: learned }));
      }
    }
    if (obj.type === "new_battle") processNewBattle(obj);
    else if (obj.type === "battle_updated") processBattleUpdated(obj);
    else if (obj.type === "new_guild_battle") processNewGuildBattle(obj);
    else if (obj.type === "guild_battle_updated") {
      if (!isGuildBattle) {
        // Première réception sans new_guild_battle préalable (capture démarrée
        // en cours de Trial, ou variante serveur) : résolution DOM de secours,
        // moins fiable mais mieux que rien. Si new_guild_battle arrive plus
        // tard ou est déjà passé, il prime (verrouillage protège des deux sens).
        isGuildBattle = true;
        setTimeout(() => resolveGuildNames(guildMaxSlot), 300);
        setTimeout(() => resolveGuildNames(guildMaxSlot), 2000);
        setTimeout(() => resolveGuildNames(guildMaxSlot), 5000);
        bus.dispatchEvent(
          new CustomEvent("guildBattleDetected", {
            detail: fallbackGuildDetail(obj, "guild_battle_updated"),
          }),
        );
      }
      processGuildBattleUpdated(obj);
    } else if (
      obj.type === "battle_consumable_ability_updated" &&
      obj.isGuildBattle
    ) {
      if (!isGuildBattle) {
        isGuildBattle = true;
        bus.dispatchEvent(
          new CustomEvent("guildBattleDetected", {
            detail: fallbackGuildDetail(
              obj,
              "battle_consumable_ability_updated",
            ),
          }),
        );
      }
    } else if (obj.type === "guild_updated") processGuildUpdated(obj);
    else if (obj.type === "labyrinth_updated") {
      // Signal indépendant du combat lui-même (new_battle/battle_updated sont
      // identiques en Labyrinthe et en monde ouvert) — sert uniquement à
      // taguer correctement les sessions dans l'historique ('labyrinth' vs
      // 'combat'), pas à l'attribution des dégâts qui n'en a pas besoin.
      const lab = obj.labyrinth;
      if (lab) isInLabyrinth = !!lab.isActive;
    }
  }

  // Prévisualisation manuelle : relance resolveGuildNames() immédiatement et
  // affiche le résultat en texte plat, pour tester/ajuster le sélecteur sans
  // attendre le prochain combat. Utile pour vérifier qu'aucun nom de monstre
  // (combat perso en parallèle, ex: Golem Cave) ne s'est glissé dans la liste.
  function previewGuildNames() {
    resolveGuildNames(guildMaxSlot);
    console.log(
      `[KikiMeter] ${guildSlotNames.size} 个姓名已解析（预计人数约 ${guildMaxSlot}) :`,
    );
    console.log("=====================================================");
    [...guildSlotNames.entries()].forEach(([slot, name]) => {
      console.log(`  slot ${slot} → "${name}"`);
    });
    console.log("=====================================================");
    if (guildSlotNames.size !== guildMaxSlot) {
      console.warn(
        `[KikiMeter] 注意：${guildSlotNames.size} 个姓名已解析，但预计有 ${guildMaxSlot} ` +
          ` 个位置，映射可能发生偏移。` +
          `请确认位置 0 对应本地角色且顺序正确。`,
      );
    }
    return Object.fromEntries(guildSlotNames);
  }

  // Diagnostic brut : liste TOUT ce que matche [class*="CombatUnit_name"],
  // sans filtre anti-bruit, pour comprendre pourquoi previewGuildNames()
  // peut ne rien trouver (grille démontée du DOM ? éléments vides ? autre
  // classe cette session ?).
  function debugCombatUnitNames() {
    const els = [...document.querySelectorAll('[class*="CombatUnit_name"]')];
    console.log(
      `[KikiMeter] ${els.length} 个元素 [class*="CombatUnit_name"]（原始、未过滤）：`,
    );
    console.log("=====================================================");
    els.forEach((el, i) => {
      console.log(
        `  #${i} | 类名="${el.className}" | 文本="${el.textContent.trim()}" | ` +
          `可见=${el.offsetParent !== null}`,
      );
    });
    console.log("=====================================================");
    if (els.length === 0) {
      console.warn(
        "[KikiMeter] 没有找到元素：可能已离开试炼页面，或者游戏 CSS 类名已变化。" +
          "请停留在试炼进行中页面并再次运行命令。",
      );
    }
    return els;
  }

  // Diagnostic ciblé : CombatUnit_name (3 occurrences confirmées le 20/07 =
  // panneau perso + 2x portrait de boss Trial) n'est PAS la grille compacte
  // des 35 名；Cette grille tronque les pseudos avec "…" (ex: "LaBaga…",
  // "Lazaru…") — signal visible et fiable indépendant du nom de classe CSS.
  function scanGuildNamesByEllipsis() {
    const out = [];
    document.querySelectorAll("*").forEach((el) => {
      if (isOwnUI(el)) return;
      if (el.children.length > 1) return; // élément feuille uniquement
      const t = el.textContent.trim();
      if (!t || t.length < 2 || t.length > 40) return;
      // Cas 1 : points de suspension littéraux dans le texte.
      const literalEllipsis = /(\.\.\.|…)$/.test(t);
      // Cas 2 : troncature visuelle via CSS (text-overflow:ellipsis) — le
      // textContent contient alors le NOM COMPLET, pas de "..." littéral.
      // On détecte via le style calculé + le fait que le texte semble être
      // un pseudo (court, sans espace, pas de bruit connu).
      let cssEllipsis = false;
      if (
        !literalEllipsis &&
        t.length <= 20 &&
        !t.includes(" ") &&
        !looksLikeNoise(t)
      ) {
        try {
          const cs = getComputedStyle(el);
          cssEllipsis =
            cs.textOverflow === "ellipsis" && cs.overflow !== "visible";
        } catch (e) {}
      }
      if (literalEllipsis || cssEllipsis) {
        out.push({ el, mode: literalEllipsis ? "文本" : "CSS" });
      }
    });
    console.log(
      `[KikiMeter] ${out.length} 个被省略显示的元素（文本省略号或 CSS ellipsis）：`,
    );
    console.log("=====================================================");
    out.forEach(({ el, mode }, i) => {
      const parent = el.parentElement;
      console.log(
        `  #${i} [${mode}] | 文本="${el.textContent.trim()}" | 类名="${el.className}" | ` +
          `父级类名="${parent ? parent.className : "?"}" | 父级子元素=${parent ? parent.children.length : 0} | ` +
          `父级同级元素=${parent && parent.parentElement ? parent.parentElement.children.length : 0}`,
      );
    });
    console.log("=====================================================");
    return out;
  }

  // Vérification directe du sélecteur confirmé (MiniUnit_name) : liste tous
  // les noms trouvés dans l'ordre du DOM, en texte plat. Sert à valider avant
  // mise en prod, et à repérer un futur changement de classe si le jeu update.
  function countMiniUnitNames() {
    const els = [...document.querySelectorAll('[class*="MiniUnit_name"]')];
    console.log(
      `[KikiMeter] ${els.length} 个元素 [class*="MiniUnit_name"]（预计人数约 ${guildMaxSlot || "?"}) :`,
    );
    console.log("=====================================================");
    els.forEach((el, i) => {
      console.log(`  #${i} | 文本="${el.textContent.trim()}"`);
    });
    console.log("=====================================================");
    return els.map((el) => el.textContent.trim());
  }

  // Détection du joueur LOCAL par anomalie de classe CSS, sans dépendre de
  // new_battle (qui n'existe pas sur le serveur test — cause confirmée du bug
  // "Joueur20" du 24/07 : sans combat personnel en parallèle, aucun signal
  // n'identifiait le joueur local, et son slot 0 se faisait recouvrir par le
  // premier nom DOM venu). Principe : dans une grille de N cellules quasi
  // identiques, celle du joueur local a presque toujours une classe CSS EN
  // PLUS (bordure de sélection, surbrillance) — on cherche la cellule dont le
  // jeu de classes diffère de la majorité, peu importe le nom de cette classe.
  function scanForOutlierMiniUnit() {
    const nameEls = [...document.querySelectorAll('[class*="MiniUnit_name"]')];
    if (nameEls.length === 0) {
      console.warn(
        "[KikiMeter] 没有找到 MiniUnit 单元，请确认公会试炼正在进行。",
      );
      return [];
    }
    // Remonte au conteneur de la cellule complète (parent du nom).
    const cells = nameEls.map(
      (el) => el.closest('[class*="MiniUnit_miniUnit"]') || el.parentElement,
    );
    const classSets = cells.map((c) => (c.className || "") + "");
    // Classe la plus fréquente = état "normal" ; tout le reste = anomalie.
    const counts = {};
    classSets.forEach((c) => {
      counts[c] = (counts[c] || 0) + 1;
    });
    const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const outliers = [];
    cells.forEach((c, i) => {
      if (classSets[i] !== majority) {
        outliers.push({
          index: i,
          name: nameEls[i].textContent.trim(),
          classes: classSets[i],
        });
      }
    });
    console.log(
      `[KikiMeter] 主流类名（${counts[majority]}/${cells.length} 个单元） : "${majority}"`,
    );
    console.log(
      `[KikiMeter] ${outliers.length} 个异常单元（可能是本地玩家）：`,
    );
    console.log("=====================================================");
    outliers.forEach((o) => {
      console.log(`  #${o.index} | 姓名="${o.name}" | 类名="${o.classes}"`);
    });
    console.log("=====================================================");
    if (outliers.length === 0) {
      console.warn(
        "[KikiMeter] 未发现异常单元；当前服务器可能没有本地玩家高亮，" +
          "或者所有单元的样式完全相同。请观察角色单元是否存在边框或高亮。",
      );
    } else if (outliers.length > 1) {
      console.warn(
        "[KikiMeter] 发现多个异常单元，仅凭类名无法确定本地玩家，请与页面显示进行比对。",
      );
    }
    return outliers;
  }

  return {
    handleMessage,
    bus,
    isGuildBattle: () => isGuildBattle,
    isGuildBattleActive: () => isGuildBattle && !guildTrialEnded,
    isInLabyrinth: () => isInLabyrinth,
    getCharacterId: () => currentCharacterId,
    getCombatKey: () => currentCombatKey,
    testHandleMessage: handleMessage,
    testSetNow(value) {
      testNow = Number.isFinite(value) ? Number(value) : null;
    },
    scanGuildNames,
    scanGuildNamesAttrs,
    scanGuildNamesLoose,
    scanGuildNamesByLocalName,
    previewGuildNames,
    debugCombatUnitNames,
    scanGuildNamesByEllipsis,
    countMiniUnitNames,
    scanForOutlierMiniUnit,
  };
})();

export { SocketHook };
