import { GameAssets, Settings, VERSION } from "./00-bootstrap.js";
import { runtime } from "../../core/runtime.js";
import { getLocalizedEntityName } from "../../core/game-localization.js";

// ─── 职业识别、颜色与图标 ───────────────────────────────────────────────────
const ClassSystem = (() => {
  const UNKNOWN = "unknown";
  const bus = new EventTarget();
  const definitions = {
    fire: {
      get label() {
        return Settings.getLanguage() === "en" ? "Fire Mage" : "火法";
      },
      color: "#C41E3A",
      get icon() {
        return GameAssets.item("blazing_trident");
      },
    },
    nature: {
      get label() {
        return Settings.getLanguage() === "en" ? "Nature Mage" : "自然法";
      },
      color: "#00FF98",
      get icon() {
        return GameAssets.item("blooming_trident");
      },
    },
    water: {
      get label() {
        return Settings.getLanguage() === "en" ? "Water Mage" : "水法";
      },
      color: "#3FC7EB",
      get icon() {
        return GameAssets.item("rippling_trident");
      },
    },
    sword: {
      get label() {
        return Settings.getLanguage() === "en" ? "Sword" : "剑";
      },
      color: "#C69B6D",
      get icon() {
        return GameAssets.item("regal_sword");
      },
    },
    mace: {
      get label() {
        return Settings.getLanguage() === "en" ? "Mace" : "锤";
      },
      color: "#A330C9",
      get icon() {
        return GameAssets.item("chaotic_flail");
      },
    },
    spear: {
      get label() {
        return Settings.getLanguage() === "en" ? "Spear" : "枪";
      },
      color: "#FFF468",
      get icon() {
        return GameAssets.item("furious_spear");
      },
    },
    bow: {
      get label() {
        return Settings.getLanguage() === "en" ? "Bow" : "弓";
      },
      color: "#AAD372",
      get icon() {
        return GameAssets.item("cursed_bow");
      },
    },
    crossbow: {
      get label() {
        return Settings.getLanguage() === "en" ? "Crossbow" : "弩";
      },
      color: "#0070DD",
      get icon() {
        return GameAssets.item("sundering_crossbow");
      },
    },
    shield: {
      get label() {
        return Settings.getLanguage() === "en" ? "Shield" : "盾";
      },
      color: "#F48CBA",
      get icon() {
        return GameAssets.item("griffin_bulwark");
      },
    },
    unknown: {
      get label() {
        return Settings.getLanguage() === "en" ? "Unknown" : "未知";
      },
      color: "#7f8c8d",
      get icon() {
        return GameAssets.skill("attack");
      },
    },
  };
  const detected = new Map();
  let itemDetailMap = {};
  const representativeWeapons = {
    blazing_trident: "fire",
    blooming_trident: "nature",
    rippling_trident: "water",
    regal_sword: "sword",
    chaotic_flail: "mace",
    furious_spear: "spear",
    cursed_bow: "bow",
    sundering_crossbow: "crossbow",
    griffin_bulwark: "shield",
  };

  function tail(v) {
    return String(v || "")
      .split("/")
      .pop()
      .toLowerCase();
  }
  function normalizeWeapon(v) {
    return tail(v).replace(/_refined$/, "");
  }
  function identifyStats(stats, fallbackInterval = 0) {
    stats = stats && typeof stats === "object" ? stats : {};
    const styles = (
      Array.isArray(stats.combatStyleHrids)
        ? stats.combatStyleHrids
        : stats.combatStyleHrid
          ? [stats.combatStyleHrid]
          : []
    ).map(tail);
    const style = styles[0] || "";
    const damageType = tail(stats.damageType);
    const primary = tail(stats.primaryTraining);
    const interval = Number(stats.attackInterval || fallbackInterval || 0);
    if (style === "magic") {
      if (damageType === "fire") return "fire";
      if (damageType === "nature") return "nature";
      if (damageType === "water") return "water";
    }
    if (style === "slash") return "sword";
    if (style === "stab") return "spear";
    if (style === "smash") return primary === "defense" ? "shield" : "mace";
    if (style === "ranged") {
      if (interval > 0)
        return Math.abs(interval - 3_200_000_000) <=
          Math.abs(interval - 3_600_000_000)
          ? "bow"
          : "crossbow";
      return UNKNOWN;
    }
    return UNKNOWN;
  }
  function itemDetailFor(weaponHrid) {
    const exact = String(weaponHrid || ""),
      short = tail(exact),
      base = normalizeWeapon(exact);
    const keys = [exact, short, "/items/" + short, base, "/items/" + base];
    for (const key of keys) {
      const value =
        itemDetailMap instanceof Map
          ? itemDetailMap.get(key)
          : itemDetailMap && itemDetailMap[key];
      if (value && typeof value === "object") return value;
    }
    const values =
      itemDetailMap instanceof Map
        ? [...itemDetailMap.values()]
        : Object.values(itemDetailMap || {});
    return (
      values.find((value) => {
        const hrid =
          value &&
          (value.hrid ||
            value.itemHrid ||
            (value.item && value.item.hrid) ||
            (value.itemDetail && value.itemDetail.hrid));
        return hrid && normalizeWeapon(hrid) === base;
      }) || {}
    );
  }
  function statsFromItemDetail(detail) {
    return (
      (detail &&
        ((detail.equipmentDetail && detail.equipmentDetail.combatStats) ||
          (detail.item &&
            detail.item.equipmentDetail &&
            detail.item.equipmentDetail.combatStats) ||
          (detail.itemDetail &&
            detail.itemDetail.equipmentDetail &&
            detail.itemDetail.equipmentDetail.combatStats) ||
          detail.combatStats)) ||
      null
    );
  }
  function namedWeaponClass(weaponHrid) {
    const weapon = normalizeWeapon(weaponHrid);
    for (const [needle, classId] of Object.entries(representativeWeapons))
      if (weapon.includes(needle)) return classId;
    // 弓和弩必须先看物品种类；玩家攻速会被装备、食物等加速修正，不能用
    // 修正后的 3.2/3.6 秒作为最高优先级，否则弩会被误判成弓。
    if (/(^|_)(crossbow|xbow)(_|$)/.test(weapon) || weapon.includes("crossbow"))
      return "crossbow";
    if (/(^|_)bow(_|$)/.test(weapon) || weapon === "gobo_shooter") return "bow";
    if (
      weapon.includes("_fire_staff") ||
      weapon === "infernal_battlestaff" ||
      weapon === "gobo_boomstick"
    )
      return "fire";
    if (weapon.includes("_nature_staff") || weapon === "jackalope_staff")
      return "nature";
    if (weapon.includes("_water_staff") || weapon === "frost_staff")
      return "water";
    if (/(^|_)(sword|slasher|dirk)(_|$)/.test(weapon)) return "sword";
    if (/(^|_)(mace|flail|bludgeon|smasher)(_|$)/.test(weapon)) return "mace";
    if (/(^|_)(spear|stabber)(_|$)/.test(weapon)) return "spear";
    if (/(^|_)(bulwark|shield|aegis)(_|$)/.test(weapon)) return "shield";
    return UNKNOWN;
  }
  function weaponHridFromWearable(wearable) {
    if (!wearable || typeof wearable !== "object") return "";
    const entries =
      wearable instanceof Map
        ? [...wearable.entries()]
        : Array.isArray(wearable)
          ? wearable.map((value, index) => [String(index), value])
          : Object.entries(wearable);
    const atSlot = (...slots) => {
      for (const slot of slots) {
        const direct =
          wearable instanceof Map ? wearable.get(slot) : wearable[slot];
        if (direct) return direct;
        const found = entries.find(
          ([key, value]) =>
            key === slot ||
            (value &&
              (value.itemLocationHrid === slot ||
                value.equipmentTypeHrid === slot ||
                value.locationHrid === slot)),
        );
        if (found) return found[1];
      }
      return null;
    };
    const weapon =
      atSlot(
        "/item_locations/main_hand",
        "/equipment_types/main_hand",
        "main_hand",
        "mainHand",
      ) ||
      atSlot(
        "/item_locations/two_hand",
        "/equipment_types/two_hand",
        "two_hand",
        "twoHand",
      );
    return typeof weapon === "string"
      ? weapon
      : (weapon &&
          (weapon.itemHrid ||
            weapon.hrid ||
            (weapon.item && weapon.item.hrid))) ||
          "";
  }
  function weaponHridFromPlayer(player) {
    if (!player || typeof player !== "object") return "";
    const direct =
      player.weaponHrid ||
      player.mainHandItemHrid ||
      player.twoHandItemHrid ||
      (player.combatDetails && player.combatDetails.weaponHrid);
    if (direct) return direct;
    const wearable =
      player.wearableItemMap ||
      player.equipmentMap ||
      player.equippedItems ||
      player.equipment ||
      {};
    const equipped = weaponHridFromWearable(wearable);
    if (equipped) return equipped;
    // 完整战斗单位有时不带装备表，但会直接下发三种武器专属战斗属性。
    // 这些字段只用于识别“会造成伤害的武器特效”，不把 curse/weaken 等
    // 状态型特效拆成虚假的伤害来源。
    const stats =
      (player.combatDetails && player.combatDetails.combatStats) ||
      player.combatStats ||
      {};
    if (Number(stats.blaze) > 0) return "/items/blazing_trident";
    if (Number(stats.mayhem) > 0) return "/items/chaotic_flail";
    if (Number(stats.pierce) > 0) return "/items/sundering_crossbow";
    return "";
  }
  function identify(player) {
    const weaponHrid = weaponHridFromPlayer(player);
    if (weaponHrid) {
      const fromWeapon = classFromWeapon(weaponHrid);
      if (fromWeapon !== UNKNOWN) return fromWeapon;
    }
    const stats =
      (player && player.combatDetails && player.combatDetails.combatStats) ||
      (player && player.combatStats) ||
      {};
    return identifyStats(stats, player && player.attackInterval);
  }
  function syncWeaponCache(name, player) {
    if (!name) return "";
    const weaponHrid = weaponHridFromPlayer(player);
    if (weaponHrid) {
      Settings.setCachedWeapon(name, weaponHrid);
      return weaponHrid;
    }
    const stats =
      (player && player.combatDetails && player.combatDetails.combatStats) ||
      (player && player.combatStats);
    if (
      stats &&
      ["blaze", "mayhem", "pierce"].some((key) =>
        Object.prototype.hasOwnProperty.call(stats, key),
      )
    )
      Settings.setCachedWeapon(name, "");
    return "";
  }
  function setDetected(name, classId, source = "被动战斗数据") {
    if (!name || !definitions[classId] || classId === UNKNOWN) return false;
    const changed =
      (detected.get(name) || Settings.getCachedClass(name)) !== classId;
    detected.set(name, classId);
    if (Settings.getCachedClass(name) !== classId)
      Settings.setCachedClass(name, classId);
    if (changed)
      bus.dispatchEvent(
        new CustomEvent("change", { detail: { name, classId, source } }),
      );
    return true;
  }
  function classFor(name) {
    return (
      Settings.getClassOverride(name) ||
      detected.get(name) ||
      Settings.getCachedClass(name) ||
      UNKNOWN
    );
  }
  function get(name) {
    return definitions[classFor(name)] || definitions.unknown;
  }
  function setOverride(name, classId) {
    Settings.setClassOverride(name, classId === "auto" ? null : classId);
  }
  function resolveBattleClass(name, player, source) {
    const override = name ? Settings.getClassOverride(name) : null;
    if (override) return override;
    const known = name
      ? detected.get(name) || Settings.getCachedClass(name) || UNKNOWN
      : UNKNOWN;
    const live = identify(player);
    if (live === UNKNOWN) return known;
    const ranged = new Set(["bow", "crossbow"]);
    const onlyRangedIntervalChanged =
      !weaponHridFromPlayer(player) && ranged.has(known) && ranged.has(live);
    const classId = onlyRangedIntervalChanged ? known : live;
    if (name && classId !== known) setDetected(name, classId, source);
    return classId;
  }
  function registerPlayers(players) {
    const out = {};
    (players || []).forEach((p) => {
      const name = (p.character && p.character.name) || p.name;
      syncWeaponCache(name, p);
      const classId = resolveBattleClass(name, p, "本场战斗人物属性");
      if (name) out[name] = classId;
    });
    return out;
  }
  function learnBattleUnit(payload) {
    const unit =
      (payload && (payload.unit || payload.battleUnit || payload.combatUnit)) ||
      payload;
    if (!unit || typeof unit !== "object") return null;
    const name =
      (unit.character && unit.character.name) ||
      unit.characterName ||
      unit.name ||
      (payload && payload.characterName) ||
      "";
    syncWeaponCache(name, unit);
    const known = name ? classFor(name) : UNKNOWN;
    const classId = resolveBattleClass(name, unit, "战斗人物属性");
    if (!name || classId === UNKNOWN) return { name, classId, updated: false };
    return {
      name,
      classId,
      updated: known !== classId,
      source: "combatDetails.combatStats",
    };
  }
  function cacheItemDetails(map) {
    if (map && typeof map === "object") itemDetailMap = map;
  }
  function classFromWeapon(weaponHrid) {
    if (!weaponHrid) return UNKNOWN;
    // 名称中的明确武器种类优先，尤其是弓/弩；任意等级都使用相同后缀。
    const named = namedWeaponClass(weaponHrid);
    if (named !== UNKNOWN) return named;
    const detail = itemDetailFor(weaponHrid);
    const stats = statsFromItemDetail(detail);
    if (stats) {
      const classId = identifyStats(stats);
      if (classId !== UNKNOWN) return classId;
    }
    return UNKNOWN;
  }
  function learnProfile(payload) {
    const profile =
      (payload &&
        (payload.profile ||
          payload.profileSharedData ||
          payload.profileData)) ||
      payload;
    if (!profile || typeof profile !== "object") return null;
    const sharable = profile.sharableCharacter || {};
    const name = sharable.name || profile.characterName || profile.name || "";
    const wearable =
      profile.wearableItemMap ||
      profile.equipmentMap ||
      profile.equippedItems ||
      {};
    const weaponHrid = weaponHridFromWearable(wearable);
    if (name && weaponHrid) Settings.setCachedWeapon(name, weaponHrid);
    const classId = classFromWeapon(weaponHrid);
    if (!name || classId === UNKNOWN)
      return {
        name,
        classId,
        weaponHrid,
        updated: false,
        source: "profile_shared.wearableItemMap",
      };
    return {
      name,
      classId,
      weaponHrid,
      updated: setDetected(name, classId, "手动点击人物装备"),
      source: "profile_shared.wearableItemMap",
    };
  }
  // 只有能唯一指向某一武器系的技能才用于纠正旧缓存。通用技能、弓弩
  // 共用技能和防御技能不能安全反推主手，避免再次产生错误职业覆盖。
  function classFromAbility(abilityHrid) {
    const ability = String(abilityHrid || "").toLowerCase();
    if (
      ability === "/abilities/maim" ||
      ability === "/abilities/crippling_slash"
    )
      return "sword";
    return UNKNOWN;
  }
  function learnAbility(name, abilityHrid) {
    const classId = classFromAbility(abilityHrid);
    if (!name || classId === UNKNOWN)
      return { name, classId, abilityHrid, updated: false };
    // 手动指定职业始终优先；这里只更新自动识别缓存。
    if (Settings.getClassOverride(name))
      return {
        name,
        classId: classFor(name),
        abilityHrid,
        updated: false,
        source: "手动职业覆盖",
      };
    return {
      name,
      classId,
      abilityHrid,
      updated: setDetected(name, classId, "武器专属技能"),
      source: "abilityHrid",
    };
  }
  function applyClasses(map) {
    Object.entries(map || {}).forEach(([name, c]) => setDetected(name, c));
  }
  function getWeapon(name) {
    return Settings.getCachedWeapon(name);
  }
  function diagnostics() {
    return Object.fromEntries(
      Array.from(detected, ([name, c]) => [
        name,
        { classId: classFor(name), detected: c, ...get(name) },
      ]),
    );
  }
  return {
    bus,
    definitions,
    identify,
    registerPlayers,
    learnBattleUnit,
    learnProfile,
    learnAbility,
    classFromAbility,
    classFromWeapon,
    cacheItemDetails,
    applyClasses,
    setDetected,
    setOverride,
    classFor,
    get,
    getWeapon,
    diagnostics,
  };
})();

// ─── 职业调试模式 ───────────────────────────────────────────────────────────
// 只保留职业识别有关的少量字段，不保存完整 WebSocket 数据。报告可以在任意
// 安装本脚本的电脑上生成，用于定位不同服务器/战斗类型的玩家结构差异。
const ClassDebug = (() => {
  const KEY = "kikimeter:class-debug:v1",
    MAX_EVENTS = 12;
  const bus = new EventTarget();
  let events = [];
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(saved)) events = saved.slice(0, MAX_EVENTS);
  } catch (e) {}

  function tail(v) {
    return String(v || "")
      .split("/")
      .pop()
      .toLowerCase();
  }
  function candidateStats(player) {
    return [
      [
        "combatDetails.combatStats",
        player && player.combatDetails && player.combatDetails.combatStats,
      ],
      [
        "combatUnit.combatDetails.combatStats",
        player &&
          player.combatUnit &&
          player.combatUnit.combatDetails &&
          player.combatUnit.combatDetails.combatStats,
      ],
      [
        "character.combatDetails.combatStats",
        player &&
          player.character &&
          player.character.combatDetails &&
          player.character.combatDetails.combatStats,
      ],
      ["combatStats", player && player.combatStats],
    ]
      .filter(([, value]) => value && typeof value === "object")
      .map(([path, stats]) => ({
        path,
        combatStyleHrids: Array.isArray(stats.combatStyleHrids)
          ? stats.combatStyleHrids.slice(0, 8)
          : stats.combatStyleHrids,
        combatStyleHrid: stats.combatStyleHrid,
        damageType: stats.damageType,
        primaryTraining: stats.primaryTraining,
        attackInterval: stats.attackInterval,
      }));
  }
  function summarizePlayer(player, index) {
    const name =
      (player && player.character && player.character.name) ||
      (player && player.name) ||
      "玩家槽位" + index;
    const candidates = candidateStats(player);
    const primary = candidates[0] || {};
    const detectedClass = ClassSystem.identify(player);
    return {
      index,
      name,
      detectedClass,
      detectedLabel: (
        ClassSystem.definitions[detectedClass] ||
        ClassSystem.definitions.unknown
      ).label,
      selectedPath: primary.path || "未找到",
      topLevelKeys:
        player && typeof player === "object" ? Object.keys(player).sort() : [],
      candidates,
      normalized: {
        style: tail(
          Array.isArray(primary.combatStyleHrids)
            ? primary.combatStyleHrids[0]
            : primary.combatStyleHrid,
        ),
        damageType: tail(primary.damageType),
        primaryTraining: tail(primary.primaryTraining),
        attackInterval: Number(
          primary.attackInterval || (player && player.attackInterval) || 0,
        ),
      },
    };
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(events));
    } catch (e) {}
  }
  function record(type, payload) {
    if (type !== "new_battle" && type !== "new_guild_battle") return;
    const players = Array.isArray(payload && payload.players)
      ? payload.players
      : [];
    events.unshift({
      time: new Date().toISOString(),
      type,
      battleKey: String(
        (payload &&
          (payload.battleId ||
            payload.guildBattleId ||
            payload.combatStartTime ||
            payload.combatId)) ||
          "",
      ),
      playerCount: players.length,
      players: players.map(summarizePlayer),
    });
    events = events.slice(0, MAX_EVENTS);
    save();
    bus.dispatchEvent(new Event("change"));
  }
  function clear() {
    events = [];
    save();
    bus.dispatchEvent(new Event("change"));
  }
  function get() {
    return JSON.parse(JSON.stringify(events));
  }
  function report() {
    if (Settings.getLanguage() === "en") {
      const output = events.map((event) => ({
        ...event,
        players: event.players.map((player) => ({
          ...player,
          detectedLabel: (
            ClassSystem.definitions[player.detectedClass] ||
            ClassSystem.definitions.unknown
          ).label,
        })),
      }));
      return [
        `=== MWI DPS Meter | Class Diagnostics | ${VERSION} ===`,
        `Generated at: ${new Date().toLocaleString()}`,
        "Note: icons represent each class's signature weapon. The data below contains only class-identification fields.",
        `Recorded events: ${events.length}`,
        "",
        JSON.stringify(output, null, 2),
      ].join("\n");
    }
    const lines = [
      `=== 银河奶牛DPS统计｜职业调试报告｜${VERSION} ===`,
      "生成时间：" + new Date().toLocaleString(),
      "说明：图标为职业代表武器；以下内容仅包含职业识别字段。",
      "记录事件数：" + events.length,
      "",
    ];
    events.forEach((event, eventIndex) => {
      lines.push(
        "#" +
          (eventIndex + 1) +
          " " +
          event.type +
          "｜" +
          event.time +
          "｜战斗标识 " +
          (event.battleKey || "无") +
          "｜玩家 " +
          event.playerCount,
      );
      event.players.forEach((p) => {
        lines.push(
          "  [" +
            p.index +
            "] " +
            p.name +
            " → " +
            p.detectedClass +
            "（" +
            p.detectedLabel +
            "）｜读取路径 " +
            p.selectedPath,
        );
        lines.push(
          "      规范化：style=" +
            (p.normalized.style || "空") +
            "，damageType=" +
            (p.normalized.damageType || "空") +
            "，primaryTraining=" +
            (p.normalized.primaryTraining || "空") +
            "，attackInterval=" +
            (p.normalized.attackInterval || 0),
        );
        if (p.candidates.length) {
          p.candidates.forEach((c) =>
            lines.push("      候选 " + c.path + "：" + JSON.stringify(c)),
          );
        } else
          lines.push(
            "      未找到 combatStats；顶层字段：" + p.topLevelKeys.join(", "),
          );
      });
      lines.push("");
    });
    return lines.join("\n");
  }
  return { bus, record, clear, get, report, size: () => events.length };
})();

// ─── 手动全量战斗消息与人物点击探针 ──────────────────────────────────────────
// 探针只监听游戏原本收到的消息与用户亲自点击后生成的页面内容，不调用
// fetch/XHR/WebSocket.send，也不主动打开人物面板。为了找出服务器实际返回的
// 未知事件，采样期间会保存全部入站消息；聊天正文和凭证类字段会被脱敏。
const ClassProbe = (() => {
  const KEY = "kikimeter:class-probe:v4",
    MAX_VALUES = 16,
    MAX_SAMPLES = 5;
  const MAX_DOM_SNAPSHOTS = 36,
    MAX_DOM_HTML = 120_000;
  const bus = new EventTarget();
  let abilityCatalog = {},
    ticker = null,
    active = false,
    captureChars = 0;
  let clickHandler = null,
    domObserver = null,
    domTimer = null,
    state = load() || emptyState();

  function emptyState() {
    return {
      schemaVersion: 4,
      startedAt: null,
      endedAt: null,
      durationMs: 0,
      stopReason: "",
      messageCounts: {},
      roster: {},
      currentRoster: { trial: {}, combat: {} },
      rosterGeneration: { trial: -1, combat: -1 },
      rosterSignature: { trial: "", combat: "" },
      players: {},
      messageShapes: {},
      relatedMessages: {},
      fullMessages: [],
      domSnapshots: [],
      clicks: [],
      learnedClasses: [],
    };
  }
  function load() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "null");
      return value && value.schemaVersion === 4 ? value : null;
    } catch (e) {
      return null;
    }
  }
  function save() {
    // 全量正文可能达到数百 MB，不写入 localStorage，避免停止采集时因
    // JSON 序列化和存储配额导致页面卡死。正文保留在当前页面内存中，
    // 摘要跨刷新保留；用户应在刷新或关闭页面前下载 TXT。
    try {
      state.storageNotice =
        "全量消息正文仅保留在当前页面内存中，请在刷新或关闭页面前下载";
      const summary = { ...state, fullMessages: [] };
      localStorage.setItem(KEY, JSON.stringify(summary));
    } catch (ignore) {}
  }
  function addUnique(array, value, limit = MAX_VALUES) {
    if (value === undefined || value === null) return;
    const normalized =
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
        ? value
        : JSON.stringify(value);
    if (!array.some((item) => item === normalized) && array.length < limit)
      array.push(normalized);
  }
  function safeValue(value) {
    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    )
      return value;
    if (Array.isArray(value)) return value.slice(0, 8).map(safeValue);
    return "[对象]";
  }
  function sanitize(
    value,
    type = "",
    key = "",
    depth = 0,
    seen = new WeakSet(),
  ) {
    if (
      value === null ||
      value === undefined ||
      typeof value === "number" ||
      typeof value === "boolean"
    )
      return value;
    if (typeof value === "string") {
      if (
        /password|token|authorization|cookie|secret|credential|email/i.test(key)
      )
        return "[已脱敏]";
      if (/chat|whisper|mail/i.test(type) && /message|text|content/i.test(key))
        return "[聊天正文已脱敏]";
      return value;
    }
    if (typeof value !== "object") return String(value);
    if (seen.has(value)) return "[循环引用]";
    seen.add(value);
    if (Array.isArray(value))
      return value.map((item) => sanitize(item, type, key, depth + 1, seen));
    const out = {};
    Object.entries(value).forEach(([childKey, child]) => {
      out[childKey] = sanitize(child, type, childKey, depth + 1, seen);
    });
    return out;
  }
  function recordFullMessage(type, payload) {
    let text = "";
    try {
      text = JSON.stringify(sanitize(payload, type));
    } catch (e) {
      text = JSON.stringify({ type, error: "消息序列化失败：" + String(e) });
    }
    const entryChars = text.length + type.length + 80;
    captureChars += entryChars;
    state.fullMessages.push({
      offsetMs: state.startedAt
        ? Math.max(0, Date.now() - new Date(state.startedAt).getTime())
        : 0,
      type,
      payloadText: text,
    });
  }
  function recordUnparsed(payload) {
    if (!active) return;
    const value =
      typeof payload === "string"
        ? payload
        : {
            dataType: Object.prototype.toString.call(payload),
            size:
              Number(
                (payload && payload.size) || (payload && payload.byteLength),
              ) || 0,
          };
    const type = "__non_json_message__";
    state.messageCounts[type] = (state.messageCounts[type] || 0) + 1;
    recordFullMessage(type, { raw: value });
    bus.dispatchEvent(new Event("change"));
  }
  function elementSnapshot(element) {
    if (!element) return null;
    let html = "";
    try {
      html = String(element.outerHTML || "").slice(0, MAX_DOM_HTML);
    } catch (e) {}
    const attrs = {};
    try {
      Array.from(element.attributes || []).forEach((attr) => {
        if (!/style/i.test(attr.name)) attrs[attr.name] = attr.value;
      });
    } catch (e) {}
    return {
      tag: String(element.tagName || ""),
      className: String(element.className || ""),
      attributes: attrs,
      text: String(element.textContent || "")
        .trim()
        .slice(0, 30_000),
      html,
    };
  }
  function isVisible(element) {
    if (!element) return false;
    try {
      const style = getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0"
      );
    } catch (e) {
      return true;
    }
  }
  function captureDom(reason) {
    if (
      !active ||
      state.domSnapshots.length >= MAX_DOM_SNAPSHOTS ||
      !document.querySelectorAll
    )
      return;
    const selectors = [
      '[role="dialog"]',
      '[class*="BattleUnit"]',
      '[class*="CombatUnitStatsText"]',
      '[class*="Modal_modal"]',
      '[class*="modalContent"]',
    ];
    const elements = [];
    selectors.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((element) => {
          if (element.closest && element.closest('[data-kikimeter="true"]'))
            return;
          if (isVisible(element) && !elements.includes(element))
            elements.push(element);
        });
      } catch (e) {}
    });
    if (!elements.length) return;
    const views = elements.slice(0, 20).map(elementSnapshot).filter(Boolean);
    const signature = views
      .map((view) => view.className + "|" + view.text)
      .join("\n")
      .slice(0, 200_000);
    const previous = state.domSnapshots[state.domSnapshots.length - 1];
    if (previous && previous.signature === signature) return;
    state.domSnapshots.push({
      offsetMs: Math.max(0, Date.now() - new Date(state.startedAt).getTime()),
      reason,
      signature,
      views,
    });
  }
  function scheduleDomCapture(reason) {
    if (!active) return;
    if (domTimer !== null) clearTimeout(domTimer);
    domTimer = setTimeout(() => {
      domTimer = null;
      captureDom(reason);
    }, 120);
  }
  function attachInteractionObservers() {
    if (!document.addEventListener) return;
    clickHandler = (event) => {
      if (!active) return;
      const target = event.target;
      const unit =
        target && target.closest
          ? target.closest('[class*="CombatUnit"],[class*="MiniUnit"]')
          : null;
      state.clicks.push({
        offsetMs: Math.max(0, Date.now() - new Date(state.startedAt).getTime()),
        target: elementSnapshot(target),
        unit: elementSnapshot(unit),
      });
      scheduleDomCapture("点击后页面变化");
      setTimeout(() => captureDom("点击后500毫秒"), 500);
    };
    document.addEventListener("click", clickHandler, true);
    if (typeof MutationObserver !== "undefined" && document.documentElement) {
      domObserver = new MutationObserver(() =>
        scheduleDomCapture("人物面板DOM变化"),
      );
      domObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "role", "aria-hidden"],
      });
    }
  }
  function detachInteractionObservers() {
    if (clickHandler && document.removeEventListener)
      document.removeEventListener("click", clickHandler, true);
    clickHandler = null;
    if (domObserver) domObserver.disconnect();
    domObserver = null;
    if (domTimer !== null) clearTimeout(domTimer);
    domTimer = null;
  }
  function scanRelevant(
    value,
    path = "",
    depth = 0,
    out = { paths: [], values: {}, hrids: [] },
  ) {
    if (depth > 5 || value === null || value === undefined) return out;
    if (typeof value === "string") {
      if (value.startsWith("/")) addUnique(out.hrids, value, 40);
      return out;
    }
    if (typeof value !== "object") return out;
    const entries = Array.isArray(value)
      ? value.slice(0, 12).map((item, index) => [String(index), item])
      : Object.entries(value).slice(0, 80);
    entries.forEach(([key, child]) => {
      const childPath = path ? path + "." + key : key;
      addUnique(out.paths, childPath, 120);
      if (
        /ability|combat|style|damage|type|training|attack|interval|weapon|equipment|item|hrid|auto/i.test(
          key,
        )
      ) {
        if (child === null || typeof child !== "object") {
          if (!out.values[childPath]) out.values[childPath] = [];
          addUnique(out.values[childPath], safeValue(child));
        } else if (
          Array.isArray(child) &&
          child.every((item) => item === null || typeof item !== "object")
        ) {
          if (!out.values[childPath]) out.values[childPath] = [];
          child
            .slice(0, 12)
            .forEach((item) =>
              addUnique(out.values[childPath], safeValue(item)),
            );
        }
      }
      if (typeof child === "string" && child.startsWith("/"))
        addUnique(out.hrids, child, 40);
      if (child && typeof child === "object")
        scanRelevant(child, childPath, depth + 1, out);
    });
    return out;
  }
  function mergeScan(target, scan) {
    scan.paths.forEach((path) => addUnique(target.paths, path, 120));
    scan.hrids.forEach((hrid) => addUnique(target.hrids, hrid, 40));
    Object.entries(scan.values).forEach(([path, values]) => {
      if (!target.values[path]) target.values[path] = [];
      values.forEach((value) => addUnique(target.values[path], value));
    });
  }
  function cacheClientData(payload) {
    if (
      payload &&
      payload.abilityDetailMap &&
      typeof payload.abilityDetailMap === "object"
    )
      abilityCatalog = payload.abilityDetailMap;
  }
  function channelLabel(channel) {
    return channel === "trial" ? "试炼" : "普通";
  }
  function registerRoster(players, channel) {
    if (!Array.isArray(players) || !players.length) return;
    const entries = players.map((player, index) => ({
      slot: String(index),
      name:
        (player.character && player.character.name) ||
        player.name ||
        "玩家槽位" + index,
      player,
    }));
    const signature = entries
      .map((entry) => entry.slot + "=" + entry.name)
      .join("|");
    if (signature !== state.rosterSignature[channel]) {
      const previous = Number(state.rosterGeneration[channel]);
      state.rosterGeneration[channel] =
        (Number.isFinite(previous) ? previous : -1) + 1;
      state.rosterSignature[channel] = signature;
      state.currentRoster[channel] = {};
    }
    const generation = Math.max(
      0,
      Number(state.rosterGeneration[channel]) || 0,
    );
    entries.forEach(({ slot, name, player }) => {
      const key = channel + ":" + generation + ":" + slot;
      state.currentRoster[channel][slot] = key;
      state.roster[key] = {
        channel,
        generation,
        slot,
        name,
        initialClass: ClassSystem.identify(player),
        initialPath:
          player.combatDetails && player.combatDetails.combatStats
            ? "combatDetails.combatStats"
            : "未找到",
      };
      if (state.players[key]) state.players[key].name = name;
    });
  }
  function seedRoster() {
    const latest = ClassDebug.get()[0];
    if (!latest || !Array.isArray(latest.players)) return;
    const channel = latest.type === "new_guild_battle" ? "trial" : "combat";
    registerRoster(
      latest.players.map((player) => ({
        name: player.name,
        combatDetails: player.selectedStats
          ? { combatStats: player.selectedStats }
          : undefined,
      })),
      channel,
    );
  }
  function ensurePlayer(slot, channel) {
    const key =
      (state.currentRoster[channel] && state.currentRoster[channel][slot]) ||
      channel + ":unknown:" + slot;
    const roster = state.roster[key];
    if (!state.players[key])
      state.players[key] = {
        key,
        channel,
        generation: roster ? roster.generation : -1,
        slot,
        name: (roster && roster.name) || "玩家槽位" + slot,
        updateCount: 0,
        fieldKeys: [],
        paths: [],
        values: {},
        hrids: [],
        abilities: [],
        autoAttackCount: 0,
        mpDropCount: 0,
        mpDropValues: [],
        lastMP: null,
        samples: [],
      };
    return state.players[key];
  }
  function recordRoster(payload, channel) {
    registerRoster(payload.players || [], channel);
  }
  function recordPlayerMap(payload, channel) {
    const pMap =
      payload && payload.pMap && typeof payload.pMap === "object"
        ? payload.pMap
        : {};
    Object.entries(pMap).forEach(([slot, update]) => {
      if (!update || typeof update !== "object") return;
      const player = ensurePlayer(slot, channel);
      player.updateCount++;
      Object.keys(update).forEach((key) =>
        addUnique(player.fieldKeys, key, 80),
      );
      const scan = scanRelevant(update);
      mergeScan(player, scan);
      scan.hrids
        .filter((value) => String(value).startsWith("/abilities/"))
        .forEach((value) => addUnique(player.abilities, value, 30));
      Object.entries(scan.values).forEach(([path, values]) => {
        if (/ability.*hrid/i.test(path))
          values.forEach(
            (value) =>
              typeof value === "string" &&
              addUnique(player.abilities, value, 30),
          );
      });
      if (update.isAutoAtk === true || update.isAutoAttack === true)
        player.autoAttackCount++;
      const mp = Number(
        update.cMP !== undefined ? update.cMP : update.currentManapoints,
      );
      if (Number.isFinite(mp)) {
        if (player.lastMP !== null && mp < player.lastMP) {
          player.mpDropCount++;
          addUnique(player.mpDropValues, player.lastMP - mp, 20);
        }
        player.lastMP = mp;
      }
      const sample = JSON.stringify(update);
      addUnique(player.samples, sample, MAX_SAMPLES);
    });
  }
  function recordRelated(type, payload) {
    if (!/(battle|combat|ability|equipment|character_stats)/i.test(type))
      return;
    const scan = scanRelevant(payload);
    if (!state.relatedMessages[type])
      state.relatedMessages[type] = {
        count: 0,
        paths: [],
        values: {},
        hrids: [],
      };
    const target = state.relatedMessages[type];
    target.count++;
    mergeScan(target, scan);
  }
  function record(type, payload) {
    if (type === "init_client_data") cacheClientData(payload);
    if (!active) return;
    state.messageCounts[type] = (state.messageCounts[type] || 0) + 1;
    if (!state.messageShapes[type]) state.messageShapes[type] = [];
    Object.keys(payload || {}).forEach((key) =>
      addUnique(state.messageShapes[type], key, 80),
    );
    recordFullMessage(type, payload);
    if (type === "new_guild_battle") recordRoster(payload, "trial");
    if (type === "new_battle") recordRoster(payload, "combat");
    if (type === "guild_battle_updated") recordPlayerMap(payload, "trial");
    if (type === "battle_updated") recordPlayerMap(payload, "combat");
    if (type === "battle_unit_fetched" || type === "profile_shared") {
      const learned =
        type === "profile_shared"
          ? ClassSystem.learnProfile(payload)
          : ClassSystem.learnBattleUnit(payload);
      if (learned) addUnique(state.learnedClasses, JSON.stringify(learned), 80);
      scheduleDomCapture("收到 " + type);
    }
    recordRelated(type, payload);
  }
  function start() {
    if (active) return status();
    state = emptyState();
    state.startedAt = new Date().toISOString();
    active = true;
    captureChars = 0;
    seedRoster();
    attachInteractionObservers();
    ticker = setInterval(() => bus.dispatchEvent(new Event("change")), 1000);
    save();
    bus.dispatchEvent(new Event("change"));
    console.info(
      "[KikiMeter] 全量入站消息采集已开始；点击“结束采集”才会停止。",
    );
    return status();
  }
  function stop(reason = "手动停止") {
    if (!active) return status();
    active = false;
    if (ticker !== null) clearInterval(ticker);
    ticker = null;
    detachInteractionObservers();
    state.endedAt = new Date().toISOString();
    state.durationMs = Math.max(
      0,
      new Date(state.endedAt) - new Date(state.startedAt),
    );
    state.stopReason = reason;
    save();
    bus.dispatchEvent(new Event("change"));
    console.info(
      "[KikiMeter] 全量入站消息采集已结束，共 " +
        state.fullMessages.length +
        " 条消息。",
    );
    return status();
  }
  function clear() {
    if (active) stop("清空前停止");
    state = emptyState();
    captureChars = 0;
    save();
    bus.dispatchEvent(new Event("change"));
  }
  function status() {
    const elapsed =
      active && state.startedAt
        ? Date.now() - new Date(state.startedAt).getTime()
        : state.durationMs || 0;
    return {
      active,
      elapsedMs: elapsed,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      captureChars,
      playerCount: Object.keys(state.players).length,
      messageCount: Object.values(state.messageCounts).reduce(
        (sum, count) => sum + count,
        0,
      ),
      fullMessageCount: state.fullMessages.length,
      domSnapshotCount: state.domSnapshots.length,
    };
  }
  function abilityEvidence(abilityHrid) {
    const detail = abilityCatalog && abilityCatalog[abilityHrid];
    return detail ? scanRelevant(detail) : null;
  }
  function report() {
    if (Settings.getLanguage() === "en") {
      const exportedState = JSON.parse(JSON.stringify(state));
      if (exportedState.storageNotice) {
        exportedState.storageNotice =
          "Full message bodies are kept only in this page's memory. Download them before refreshing or closing the page.";
      }
      return [
        `=== MWI DPS Meter | Manual Full Incoming-Message Probe | ${VERSION} ===`,
        `Generated at: ${new Date().toLocaleString()}`,
        `Capture started: ${state.startedAt || "Not started"}`,
        `Capture ended: ${state.endedAt || (active ? "In progress" : "None")}`,
        `Effective capture: ${(status().elapsedMs / 1000).toFixed(1)} seconds`,
        "Network policy: this probe does not call fetch, XHR, or WebSocket.send. It only reads data the game already received.",
        "Scope: all incoming game WebSocket messages, user-selected targets, and character-panel DOM between start and stop. Chat bodies and credential fields are redacted.",
        `Messages: ${state.fullMessages.length} | Message bodies: ${(captureChars / 1024 / 1024).toFixed(2)} MB | DOM snapshots: ${state.domSnapshots.length}`,
        "",
        JSON.stringify(exportedState, null, 2),
        "",
        "--- Initial-message class report ---",
        ClassDebug.report(),
      ].join("\n");
    }
    const lines = [
      `=== 银河奶牛DPS统计｜手动全量入站消息探针｜${VERSION} ===`,
      "生成时间：" + new Date().toLocaleString(),
      "采样开始：" + (state.startedAt || "未开始"),
      "采样结束：" + (state.endedAt || (active ? "进行中" : "无")),
      "有效采样：" +
        (status().elapsedMs / 1000).toFixed(1) +
        " 秒｜" +
        (state.stopReason || "尚未完成"),
      "网络原则：本探针没有调用 fetch、XHR 或 WebSocket.send，只被动读取游戏原本收到的数据。",
      "采集范围：从点击开始到点击结束期间的全部游戏 WebSocket 入站消息、用户点击目标、人物面板 DOM；聊天正文及凭证类字段已脱敏。",
      "完整消息：" +
        state.fullMessages.length +
        " 条｜消息正文：" +
        (captureChars / 1024 / 1024).toFixed(2) +
        " MB｜DOM快照：" +
        state.domSnapshots.length +
        " 份",
      "",
      "消息计数：" + JSON.stringify(state.messageCounts),
      "消息顶层字段：" + JSON.stringify(state.messageShapes),
      "",
    ];
    if (state.storageNotice) lines.push("存储提示：" + state.storageNotice, "");
    if (state.learnedClasses.length)
      lines.push(
        "人物点击即时职业识别：" + state.learnedClasses.join(" | "),
        "",
      );
    const rosterValues = Object.values(state.roster),
      uniqueRoster = new Map();
    rosterValues.forEach((player) =>
      uniqueRoster.set(player.channel + "|" + player.name, player),
    );
    const uniqueValues = [...uniqueRoster.values()],
      withStats = uniqueValues.filter(
        (player) => player.initialClass && player.initialClass !== "unknown",
      ).length;
    lines.push(
      "名册人数：" +
        uniqueValues.length +
        "｜初始化可识别：" +
        withStats +
        "｜初始化无职业字段：" +
        Math.max(0, uniqueValues.length - withStats),
      "",
    );
    Object.values(state.players)
      .sort(
        (a, b) =>
          a.channel.localeCompare(b.channel) ||
          a.generation - b.generation ||
          Number(a.slot) - Number(b.slot),
      )
      .forEach((player) => {
        const formation =
          player.generation >= 0
            ? "第" + (player.generation + 1) + "阵容"
            : "未知阵容";
        lines.push(
          "[" +
            channelLabel(player.channel) +
            " " +
            formation +
            " slot " +
            player.slot +
            "] " +
            player.name +
            "｜更新 " +
            player.updateCount +
            "｜MP下降 " +
            player.mpDropCount +
            "｜自动攻击 " +
            player.autoAttackCount,
        );
        lines.push("  pMap字段：" + (player.fieldKeys.join(", ") || "无"));
        lines.push("  技能：" + (player.abilities.join(", ") || "未出现"));
        lines.push("  MP消耗：" + (player.mpDropValues.join(", ") || "未出现"));
        lines.push("  Hrid：" + (player.hrids.join(", ") || "无"));
        lines.push("  相关值：" + JSON.stringify(player.values));
        lines.push("  原始样本：" + (player.samples.join(" || ") || "无"));
        player.abilities.forEach((ability) => {
          const evidence = abilityEvidence(ability);
          lines.push(
            "  技能定义 " +
              ability +
              "：" +
              (evidence
                ? JSON.stringify({
                    values: evidence.values,
                    hrids: evidence.hrids,
                  })
                : "客户端能力表中未找到"),
          );
        });
        lines.push("");
      });
    lines.push("其他相关消息摘要：" + JSON.stringify(state.relatedMessages));
    lines.push("", "--- 用户点击记录 ---");
    if (!state.clicks.length) lines.push("采样期间没有捕获到页面点击。");
    state.clicks.forEach((click, index) =>
      lines.push(
        "#" +
          (index + 1) +
          " +" +
          click.offsetMs +
          "ms\n" +
          JSON.stringify(click),
      ),
    );
    lines.push("", "--- 人物面板 DOM 快照 ---");
    if (!state.domSnapshots.length)
      lines.push(
        "没有捕获到可见的人物面板；如需分析人物详情，请在采集期间点开战斗中的人物。",
      );
    state.domSnapshots.forEach((snapshot, index) => {
      const output = { ...snapshot };
      delete output.signature;
      lines.push(
        "#" +
          (index + 1) +
          " +" +
          snapshot.offsetMs +
          "ms｜" +
          snapshot.reason +
          "\n" +
          JSON.stringify(output),
      );
    });
    lines.push("", "--- 全部入站消息（按接收顺序） ---");
    if (!state.fullMessages.length) lines.push("没有记录到入站消息。");
    state.fullMessages.forEach((message, index) => {
      lines.push(
        "#" +
          (index + 1) +
          " +" +
          message.offsetMs +
          "ms｜" +
          message.type +
          "\n" +
          message.payloadText,
      );
    });
    lines.push("", "--- 初始化消息职业报告 ---", ClassDebug.report());
    return lines.join("\n");
  }
  function download() {
    if (!state.startedAt) {
      console.warn("[KikiMeter] 尚未开始全量消息采集，已取消空报告下载。");
      return null;
    }
    if (active) {
      console.warn("[KikiMeter] 请先点击“结束采集”，再下载全量 MSG。");
      return null;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const blob = new Blob(["\uFEFF" + report()], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), {
      href: url,
      download: "mwi-full-msg-capture-" + stamp + ".txt",
    });
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return link.download;
  }
  return {
    bus,
    record,
    recordUnparsed,
    start,
    stop,
    clear,
    status,
    report,
    download,
    get: () => JSON.parse(JSON.stringify(state)),
  };
})();

function installThemeFont() {
  if (document.getElementById("kikimeter-zh-theme")) return;
  const style = document.createElement("style");
  style.id = "kikimeter-zh-theme";
  style.textContent = `[data-kikimeter="true"]{font-family:'Microsoft YaHei','微软雅黑','Noto Sans SC',sans-serif!important}`;
  (document.head || document.documentElement).appendChild(style);
}

// 伤害来源保持原始 abilityHrid 存储，显示时再翻译。协议没有在每一次
// DoT 跳伤中附带具体技能，因此无法安全细分时明确归入“持续伤害”。
const DamageSources = (() => {
  const combatIcon = () => GameAssets.skill("attack");
  const labels = {
    auto: ["普通攻击", "Auto Attack"],
    reflect: ["反伤", "Reflection"],
    dot: ["持续伤害", "Damage Over Time"],
    unknown: ["未识别来源", "Unknown Source"],
    legacy: ["旧版本未记录来源", "Legacy Untracked"],
  };
  const itemLabels = {
    "/items/blazing_trident": ["炽焰三叉戟特效", "Blazing Trident Effect"],
    "/items/blazing_trident_refined": [
      "炽焰三叉戟★特效",
      "Blazing Trident ★ Effect",
    ],
    "/items/chaotic_flail": ["混沌连枷特效", "Chaotic Flail Effect"],
    "/items/chaotic_flail_refined": ["混沌连枷★特效", "Chaotic Flail ★ Effect"],
    "/items/sundering_crossbow": ["裂空弩特效", "Sundering Crossbow Effect"],
    "/items/sundering_crossbow_refined": [
      "裂空弩★特效",
      "Sundering Crossbow ★ Effect",
    ],
  };
  // 这些技能本身不造成伤害。它们施放时若怪物同时掉血，只可能来自
  // 炽焰三叉戟触发或已存在的持续伤害，不能把数值记到辅助技能名下。
  const supportAbilities = new Set([
    "/abilities/aqua_aura",
    "/abilities/berserk",
    "/abilities/critical_aura",
    "/abilities/elemental_affinity",
    "/abilities/elusiveness",
    "/abilities/fierce_aura",
    "/abilities/flame_aura",
    "/abilities/frenzy",
    "/abilities/guardian_aura",
    "/abilities/heal",
    "/abilities/insanity",
    "/abilities/invincible",
    "/abilities/minor_heal",
    "/abilities/mystic_aura",
    "/abilities/precision",
    "/abilities/provoke",
    "/abilities/quick_aid",
    "/abilities/rejuvenate",
    "/abilities/revive",
    "/abilities/speed_aura",
    "/abilities/sylvan_aura",
    "/abilities/taunt",
    "/abilities/toughness",
    "/abilities/vampirism",
  ]);
  function normalize(source) {
    const value = String(source || "").trim();
    if (!value || value === "idle") return "unknown";
    return value;
  }
  function decodeCombined(value) {
    const parts = String(value || "")
      .slice(9)
      .split("|");
    const decode = (part) => {
      try {
        return decodeURIComponent(part || "");
      } catch (ignore) {
        return part || "";
      }
    };
    return { weapon: decode(parts[0]), action: decode(parts[1]) };
  }
  function isCombined(source) {
    return normalize(source).startsWith("combined:");
  }
  function isSupport(source) {
    return supportAbilities.has(normalize(source));
  }
  function clientAbilityName(value) {
    const map = runtime.state.initData_abilityDetailMap;
    const detail = map instanceof Map ? map.get(value) : map?.[value];
    return String(detail?.name || "").trim();
  }
  function abilityLabel(value, english) {
    if (english)
      return (
        clientAbilityName(value) ||
        (value === "/abilities/natures_veil" ? "Nature's Veil" : "") ||
        value
          .split("/")
          .pop()
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase())
      );
    return (
      getLocalizedEntityName("ability", value) ||
      clientAbilityName(value) ||
      value
        .split("/")
        .pop()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
    );
  }
  // 展示层统一来源：服务器把技能本体与三叉戟触发合成一个 HP 差，无法
  // 准确拆数，因此并回触发技能；辅助技能触发的数值则只属于三叉戟。
  // 该转换也作用于旧历史，避免升级后旧记录继续显示重复行。
  function canonical(source, playerName = "") {
    const value = normalize(source);
    if (value.startsWith("combined:")) {
      const { weapon, action } = decodeCombined(value);
      return isSupport(action) ? normalize(weapon) : normalize(action);
    }
    if (isSupport(value)) {
      const weapon = String(ClassSystem.getWeapon(playerName) || "");
      if (weapon.includes("blazing_trident")) return weapon;
    }
    return value;
  }
  function label(source) {
    const value = normalize(source),
      english = Settings.getLanguage() === "en";
    if (value.startsWith("/abilities/")) return abilityLabel(value, english);
    if (labels[value]) return labels[value][english ? 1 : 0];
    if (value.startsWith("dot:")) {
      const ability = value.slice(4),
        abilityName = ability.startsWith("/abilities/")
          ? abilityLabel(ability, english)
          : labels[ability]?.[english ? 1 : 0] ||
            ability
              .split("/")
              .pop()
              .replace(/_/g, " ")
              .replace(/\b\w/g, (char) => char.toUpperCase());
      return english
        ? "Damage Over Time (" + abilityName + ")"
        : "持续伤害（" + abilityName + "）";
    }
    if (value.startsWith("combined:")) {
      const { weapon, action } = decodeCombined(value);
      const weaponName = label(weapon);
      return (
        label(action) +
        "（" +
        (english ? "includes " : "含") +
        (english
          ? weaponName
          : weaponName.startsWith("武器特效：")
            ? weaponName.slice(5) + "特效"
            : weaponName) +
        "）"
      );
    }
    if (value.startsWith("/items/")) {
      const itemDetailMap = runtime.state.initData_itemDetailMap;
      const itemDetail =
        itemDetailMap instanceof Map
          ? itemDetailMap.get(value)
          : itemDetailMap?.[value];
      const englishName =
        String(itemDetail?.name || "").trim() ||
        itemLabels[value]?.[1] ||
        value
          .split("/")
          .pop()
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase());
      const localizedName =
        getLocalizedEntityName("item", value) ||
        itemLabels[value]?.[0] ||
        englishName;
      return english ? englishName + " Effect" : "武器特效：" + localizedName;
    }
    const tail = value
      .split("/")
      .pop()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
    return tail || labels.unknown[english ? 1 : 0];
  }
  function icon(source, playerName = "") {
    const value = normalize(source);
    if (value.startsWith("dot:")) {
      const ability = value.slice(4);
      return ability.startsWith("/abilities/")
        ? GameAssets.ability(ability)
        : combatIcon();
    }
    if (value.startsWith("combined:")) {
      const { action } = decodeCombined(value);
      // “技能（含武器特效）”仍属于该次技能施放，使用技能图标；只有
      // 单独的 /items/... 武器特效来源才显示武器图标。
      if (action.startsWith("/abilities/")) return GameAssets.ability(action);
      return combatIcon();
    }
    if (value.startsWith("/abilities/")) return GameAssets.ability(value);
    if (value.startsWith("/items/")) {
      const classId = ClassSystem.classFromWeapon(value),
        definition = ClassSystem.definitions[classId];
      if (definition && definition.icon) return definition.icon;
    }
    if (value.startsWith("weapon:"))
      return ClassSystem.get(playerName).icon || combatIcon();
    return combatIcon();
  }
  return { normalize, canonical, isCombined, isSupport, label, icon };
})();

// 承伤来源编码包含“怪物名称＋怪物 Hrid＋刚完成的技能”。历史记录只保存
// 这个稳定字符串；显示时再根据当前语言翻译技能名并选取技能图标。
const TakenSources = (() => {
  function encode(monsterName, monsterHrid, ability) {
    return (
      "taken:" +
      [monsterName || "", monsterHrid || "", DamageSources.normalize(ability)]
        .map(encodeURIComponent)
        .join("|")
    );
  }
  function decode(source) {
    const raw = String(source || "");
    if (!raw.startsWith("taken:"))
      return { monsterName: "", monsterHrid: "", ability: "unknown" };
    const parts = raw
      .slice(6)
      .split("|")
      .map((part) => {
        try {
          return decodeURIComponent(part);
        } catch (ignore) {
          return part;
        }
      });
    return {
      monsterName: parts[0] || "",
      monsterHrid: parts[1] || "",
      ability: parts[2] || "unknown",
    };
  }
  function monsterLabel(detail) {
    if (Settings.getLanguage() !== "en") {
      const officialName = getLocalizedEntityName(
        "monster",
        detail.monsterHrid,
      );
      if (officialName) return officialName;
    }
    if (detail.monsterName) return detail.monsterName;
    const tail = String(detail.monsterHrid || "")
      .split("/")
      .pop()
      .replace(/_/g, " ");
    return tail
      ? tail.replace(/\b\w/g, (char) => char.toUpperCase())
      : Settings.getLanguage() === "en"
        ? "Unknown Monster"
        : "未知怪物";
  }
  function label(source) {
    const detail = decode(source);
    return monsterLabel(detail) + " · " + DamageSources.label(detail.ability);
  }
  function icon(source) {
    return DamageSources.icon(decode(source).ability);
  }
  return { encode, decode, label, icon };
})();

export {
  ClassDebug,
  ClassProbe,
  ClassSystem,
  DamageSources,
  TakenSources,
  installThemeFont,
};
