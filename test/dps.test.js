import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { Buffer } from "node:buffer";

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  {
    url: "https://www.milkywayidle.com/",
  },
);
const browserGlobals = {
  Blob: dom.window.Blob,
  CustomEvent: dom.window.CustomEvent,
  Event: dom.window.Event,
  EventTarget: dom.window.EventTarget,
  MutationObserver: dom.window.MutationObserver,
  Option: dom.window.Option,
  document: dom.window.document,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  localStorage: dom.window.localStorage,
  navigator: dom.window.navigator,
  unsafeWindow: dom.window,
  window: dom.window,
};
for (const [name, value] of Object.entries(browserGlobals)) {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}
if (!globalThis.CSS) globalThis.CSS = { escape: (value) => String(value) };

const bundled = await build({
  bundle: true,
  entryPoints: ["test-support/dps-entry.js"],
  format: "esm",
  loader: { ".png": "dataurl" },
  platform: "node",
  write: false,
});
const moduleUrl =
  "data:text/javascript;base64," +
  Buffer.from(bundled.outputFiles[0].text).toString("base64");
const {
  CombatIdentity,
  GameAssets,
  Settings,
  combatEventMatchesSession,
  formatDamage,
  formatRate,
  isSelectedGuildProgressTabBar,
  isSelectedTrialTabBar,
  ClassDebug,
  ClassProbe,
  ClassSystem,
  DamageSources,
  TakenSources,
  Diagnostics,
  Session,
  HistoryStore,
  SegmentSelection,
  ViewData,
  SocketHook,
} = await import(moduleUrl);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(
  formatDamage(999) === "999" &&
    formatDamage(1000) === "1.0K" &&
    formatDamage(1_250_000) === "1.3M",
  "总量没有按原值/K/M自动格式化为一位小数",
);
assert(
  formatRate(999) === "999.0" && formatRate(1250) === "1.3K",
  "DPS/HPS没有按自动格式显示",
);
Settings.setLanguage("zh");
assert(
  DamageSources.label("/abilities/firestorm") === "烈焰风暴",
  "中文来源名称未生效",
);
assert(
  DamageSources.label("dot:/abilities/firestorm") === "持续伤害（烈焰风暴）",
  "单一持续伤害技能没有显示具体技能名",
);
Settings.setLanguage("en");
assert(
  DamageSources.label("/abilities/firestorm") === "Firestorm",
  "英文来源名称未生效或仍同时显示双语",
);
assert(
  DamageSources.label("dot:/abilities/firestorm") ===
    "Damage Over Time (Firestorm)",
  "英文持续伤害技能名不正确",
);
assert(
  String(DamageSources.icon("/abilities/firestorm")).endsWith(
    "/abilities_sprite.fdd1b4de.svg#firestorm",
  ),
  "技能没有直接引用游戏 ability Sprite",
);
assert(
  DamageSources.icon("dot:/abilities/firestorm") ===
    DamageSources.icon("/abilities/firestorm"),
  "具体 DoT 没有使用对应技能图标",
);
const supplementalAbilityHrids = [
  "retribution",
  "revive",
  "scratch",
  "shield_bash",
  "silencing_shot",
  "smack",
  "smoke_burst",
  "speed_aura",
  "spike_shell",
  "steady_shot",
  "stunning_blow",
  "sweep",
  "taunt",
  "toughness",
  "toxic_pollen",
  "water_strike",
].map((name) => "/abilities/" + name);
const genericCombatIcon = DamageSources.icon("auto");
for (const abilityHrid of supplementalAbilityHrids) {
  assert(
    String(DamageSources.icon(abilityHrid)).endsWith(
      "/abilities_sprite.fdd1b4de.svg#" + abilityHrid.split("/").pop(),
    ),
    abilityHrid + " 没有引用游戏技能图标",
  );
  assert(
    DamageSources.icon(abilityHrid) !== genericCombatIcon,
    abilityHrid + " 仍回退成通用攻击图标",
  );
}
assert(
  genericCombatIcon.endsWith("/skills_sprite.3bb4d936.svg#attack"),
  "普通攻击没有直接引用游戏 skill Sprite",
);
assert(
  GameAssets.misc("loot_tracker").endsWith(
    "/misc_sprite.6560b17a.svg#loot_tracker",
  ) &&
    GameAssets.misc("settings").endsWith("/misc_sprite.6560b17a.svg#settings"),
  "历史或设置没有直接引用游戏 misc Sprite",
);
for (const [classId, definition] of Object.entries(ClassSystem.definitions)) {
  assert(
    !String(definition.icon).startsWith("data:image/"),
    classId + " 职业仍在脚本中内嵌游戏图标",
  );
  assert(
    String(definition.icon).includes(
      classId === "unknown" ? "/skills_sprite." : "/items_sprite.",
    ),
    classId + " 职业没有引用正确的游戏 Sprite",
  );
}
Settings.setLanguage("zh");
assert(
  DamageSources.label("/abilities/sweep") === "横扫" &&
    DamageSources.label("/abilities/stunning_blow") === "眩晕重击",
  "新版技能的中文名称没有进入统一来源映射",
);
assert(
  DamageSources.label("combined:%2Fitems%2Fsundering_crossbow|auto") ===
    "普通攻击（含裂空弩特效）",
  "裂空弩的直接武器附伤没有显示为“攻击（含武器特效）”",
);
assert(
  DamageSources.canonical(
    "combined:%2Fitems%2Fblazing_trident|%2Fabilities%2Ffireball",
  ) === "/abilities/fireball",
  "同一直接技能的三叉戟合并来源没有收敛到技能本体",
);
assert(
  DamageSources.icon(
    "combined:%2Fitems%2Fblazing_trident|%2Fabilities%2Ffireball",
  ) === DamageSources.icon("/abilities/fireball"),
  "含三叉戟特效的技能没有继续使用对应技能图标",
);
assert(
  DamageSources.canonical(
    "combined:%2Fitems%2Fblazing_trident|%2Fabilities%2Fmystic_aura",
  ) === "/items/blazing_trident",
  "辅助技能触发的三叉戟伤害没有归到武器特效",
);
assert(
  DamageSources.isSupport("/abilities/elemental_affinity") &&
    DamageSources.isSupport("/abilities/mystic_aura"),
  "元素亲和或神秘光环没有被识别为纯辅助技能",
);
assert(Settings.getPanelOpacity() === 100, "面板不透明度默认值不是100%");
Settings.setPanelOpacity(5);
assert(Settings.getPanelOpacity() === 10, "面板不透明度没有限制最低10%");
Settings.setPanelOpacity(105);
assert(Settings.getPanelOpacity() === 100, "面板不透明度没有限制最高100%");
Settings.setPanelOpacity(70);
Settings.setDebugMode(false);
assert(Settings.getDebugMode() === false, "Debug 默认设置状态不正确");

const selectedTrialBar = (label) => ({
  querySelector: (selector) =>
    selector === '[role="tab"][aria-selected="true"]'
      ? { textContent: label }
      : null,
});
assert(
  isSelectedTrialTabBar(selectedTrialBar("试炼1")) &&
    isSelectedTrialTabBar(selectedTrialBar("試煉 2")) &&
    isSelectedTrialTabBar(selectedTrialBar("Trials 3")) &&
    !isSelectedTrialTabBar(selectedTrialBar("概览")),
  "测试服带角标的已选试炼标签无法识别，或非试炼标签被误判",
);
const selectedProgressBar = (label, context, parentContext = "") => ({
  textContent: context,
  querySelector: (selector) =>
    selector === '[role="tab"][aria-selected="true"]'
      ? { textContent: label }
      : null,
  parentElement: parentContext
    ? { textContent: parentContext, parentElement: null }
    : null,
});
assert(
  isSelectedGuildProgressTabBar(selectedProgressBar("进行中", "试炼 进行中")) &&
    isSelectedGuildProgressTabBar(
      selectedProgressBar("In Progress", "Overview Members Trials In Progress"),
    ) &&
    isSelectedGuildProgressTabBar(
      selectedProgressBar("進行中", "進行中", "公會"),
    ) &&
    !isSelectedGuildProgressTabBar(
      selectedProgressBar("进行中", "订单 进行中"),
    ),
  "公会进行中标签无法识别，或其他页面的进行中标签被误判",
);

const sameDayMorning = new Date(2026, 7, 3, 8, 0, 0),
  sameDayNight = new Date(2026, 7, 3, 23, 30, 0),
  nextDay = new Date(2026, 7, 4, 0, 1, 0);
const trialStage1 = CombatIdentity.resolve(
  { combatKey: "stage-1" },
  "trial",
  "角色A",
  sameDayMorning,
);
const trialStage2 = CombatIdentity.resolve(
  { combatKey: "stage-2" },
  "trial",
  "角色A",
  sameDayNight,
);
const trialTomorrow = CombatIdentity.resolve(
  { combatKey: "stage-3" },
  "trial",
  "角色A",
  nextDay,
);
assert(
  trialStage1.key === trialStage2.key,
  "同角色同日公会试炼换关后没有保持同一战斗标识",
);
assert(trialStage1.key !== trialTomorrow.key, "跨天公会试炼没有创建新战斗标识");
assert(
  CombatIdentity.resolve(
    { combatKey: "normal-1" },
    "combat",
    "角色A",
    sameDayMorning,
  ).key === "normal-1" &&
    CombatIdentity.resolve(
      { combatKey: "normal-2" },
      "combat",
      "角色A",
      sameDayNight,
    ).key === "normal-2",
  "同日合并规则错误地影响了普通战斗",
);
assert(
  CombatIdentity.resolve(
    { combatKey: "maze-1" },
    "labyrinth",
    "角色A",
    sameDayMorning,
  ).key === "maze-1",
  "同日合并规则错误地影响了迷宫",
);
assert(
  combatEventMatchesSession({ battleType: "trial" }, { type: "trial" }) &&
    !combatEventMatchesSession({ battleType: "combat" }, { type: "trial" }) &&
    !combatEventMatchesSession({ battleType: "trial" }, { type: "combat" }),
  "不同战斗通道的伤害事件仍可写入同一个 Session",
);
assert(
  CombatIdentity.matches(
    {
      combatKey: "旧battleId",
      characterId: "角色A",
      type: "trial",
      startedAt: sameDayMorning.toISOString(),
    },
    trialStage2,
    "trial",
    "角色A",
  ),
  "1.0.3 当天活动试炼缓存无法迁移到同日累计规则",
);
assert(
  !CombatIdentity.matches(
    {
      combatKey: "旧battleId-manual-1",
      characterId: "角色A",
      type: "trial",
      startedAt: sameDayMorning.toISOString(),
      manualReset: true,
    },
    trialStage2,
    "trial",
    "角色A",
  ),
  "手动新建记录仍被错误合并回当天试炼",
);

const player = (
  name,
  style,
  damageType = "physical",
  primary = "melee",
  interval = 0,
) => ({
  name,
  currentManapoints: 100,
  currentHitpoints: 100,
  combatDetails: {
    combatStats: {
      combatStyleHrids: [`/combat_styles/${style}`],
      damageType: `/damage_types/${damageType}`,
      primaryTraining: `/skills/${primary}`,
      attackInterval: interval,
    },
  },
});

const classCases = [
  [player("火", "magic", "fire", "magic", 3500000000), "fire"],
  [player("自然", "magic", "nature", "magic", 3500000000), "nature"],
  [player("水", "magic", "water", "magic", 3500000000), "water"],
  [player("剑", "slash"), "sword"],
  [player("锤", "smash", "physical", "melee"), "mace"],
  [player("枪", "stab", "physical", "attack"), "spear"],
  [player("弓", "ranged", "physical", "ranged", 3200000000), "bow"],
  [player("弩", "ranged", "physical", "ranged", 3600000000), "crossbow"],
  [player("盾", "smash", "physical", "defense", 3600000000), "shield"],
];
for (const [p, expected] of classCases)
  assert(ClassSystem.identify(p) === expected, `职业识别失败：${expected}`);

const profileWeaponCases = [
  ["火档", "/items/blazing_trident_refined", "fire"],
  ["自然档", "/items/blooming_trident_refined", "nature"],
  ["水档", "/items/rippling_trident_refined", "water"],
  ["剑档", "/items/regal_sword_refined", "sword"],
  ["锤档", "/items/chaotic_flail_refined", "mace"],
  ["枪档", "/items/furious_spear_refined", "spear"],
  ["弓档", "/items/cursed_bow_refined", "bow"],
  ["弩档", "/items/sundering_crossbow_refined", "crossbow"],
  ["盾档", "/items/griffin_bulwark_refined", "shield"],
];
for (const [name, weapon, classId] of profileWeaponCases) {
  const learned = ClassSystem.learnProfile({
    profile: {
      sharableCharacter: { name },
      wearableItemMap: { "/item_locations/two_hand": { itemHrid: weapon } },
    },
  });
  assert(
    learned.classId === classId && ClassSystem.classFor(name) === classId,
    `profile_shared 武器识别失败：${classId}`,
  );
}
ClassSystem.setDetected("保留职业", "water");
ClassSystem.learnProfile({
  profile: {
    sharableCharacter: { name: "保留职业" },
    wearableItemMap: {
      "/item_locations/main_hand": { itemHrid: "/items/unknown_weapon" },
    },
  },
});
assert(
  ClassSystem.classFor("保留职业") === "water",
  "未知资料错误覆盖了已有职业缓存",
);
ClassSystem.cacheItemDetails({
  "/items/custom_crossbow": {
    equipmentDetail: {
      combatStats: {
        combatStyleHrids: ["/combat_styles/ranged"],
        damageType: "/damage_types/physical",
        primaryTraining: "/skills/ranged",
        attackInterval: 3600000000,
      },
    },
  },
});
assert(
  ClassSystem.classFromWeapon("/items/custom_crossbow") === "crossbow",
  "客户端物品表无法识别非代表武器",
);
const ordinaryWeapons = [
  ["/items/wooden_fire_staff", "fire"],
  ["/items/birch_nature_staff", "nature"],
  ["/items/cedar_water_staff", "water"],
  ["/items/crimson_sword", "sword"],
  ["/items/azure_mace", "mace"],
  ["/items/holy_spear", "spear"],
  ["/items/wooden_bow", "bow"],
  ["/items/wooden_crossbow", "crossbow"],
  ["/items/verdant_bulwark", "shield"],
  ["/items/gobo_boomstick", "fire"],
  ["/items/jackalope_staff", "nature"],
  ["/items/frost_staff", "water"],
  ["/items/gobo_slasher", "sword"],
  ["/items/granite_bludgeon", "mace"],
  ["/items/gobo_stabber", "spear"],
  ["/items/gobo_shooter", "bow"],
  ["/items/soul_hunter_crossbow", "crossbow"],
  ["/items/knights_aegis", "shield"],
];
for (const [weapon, classId] of ordinaryWeapons) {
  assert(
    ClassSystem.classFromWeapon(weapon) === classId,
    `任意等级/特殊武器识别失败：${weapon}`,
  );
}
ClassSystem.cacheItemDetails({
  "/items/unlabelled_magic_weapon": {
    hrid: "/items/unlabelled_magic_weapon",
    equipmentDetail: {
      combatStats: {
        combatStyleHrids: ["/combat_styles/magic"],
        damageType: "/damage_types/nature",
        primaryTraining: "/skills/magic",
        attackInterval: 3500000000,
      },
    },
  },
});
assert(
  ClassSystem.classFromWeapon("/items/unlabelled_magic_weapon") === "nature",
  "未按客户端物品属性识别无规律名称的武器",
);
const listedProfile = ClassSystem.learnProfile({
  profile: {
    sharableCharacter: { name: "列表装备" },
    wearableItemMap: {
      slot7: {
        itemLocationHrid: "/item_locations/two_hand",
        itemHrid: "/items/wooden_crossbow",
      },
    },
  },
});
assert(
  listedProfile.classId === "crossbow",
  "未识别按 itemLocationHrid 存放的主手/双手装备",
);
ClassSystem.registerPlayers([
  player("列表装备", "ranged", "physical", "ranged", 3200000000),
]);
assert(
  ClassSystem.classFor("列表装备") === "crossbow",
  "装备确认的弩职业被修正后攻速重新覆盖为弓",
);
ClassSystem.setDetected("Ting", "spear");
const swordEvidence = ClassSystem.learnAbility("Ting", "/abilities/maim");
assert(
  swordEvidence.updated && ClassSystem.classFor("Ting") === "sword",
  "剑系专属技能没有纠正上一层遗留的枪职业缓存",
);
ClassSystem.learnAbility("Ting", "/abilities/rain_of_arrows");
assert(
  ClassSystem.classFor("Ting") === "sword",
  "非唯一职业技能错误覆盖了已识别职业",
);

const emitted = [];
const typedTeamDamage = [];
const takenEvents = [];
SocketHook.bus.addEventListener("playerDamage", (e) =>
  emitted.push(["damage", e.detail.name, e.detail.amount, e.detail.source]),
);
SocketHook.bus.addEventListener("kill", (e) =>
  emitted.push(["kill", e.detail.name, 1]),
);
SocketHook.bus.addEventListener("damage", (e) =>
  typedTeamDamage.push({ ...e.detail }),
);
SocketHook.bus.addEventListener("playerDamageTaken", (e) =>
  takenEvents.push({ ...e.detail }),
);
const send = (o) => SocketHook.testHandleMessage(JSON.stringify(o));
const newBattle = (key) =>
  send({
    type: "new_battle",
    combatStartTime: key,
    players: [
      player("甲", "magic", "fire", "magic", 3500000000),
      player("乙", "slash"),
    ],
    monsters: [{ currentHitpoints: 100, enrageTimerDuration: 180000000000 }],
  });

emitted.length = 0;
newBattle("unique");
send({
  type: "battle_updated",
  pMap: { 0: { cMP: 80, cHP: 100 }, 1: { cMP: 100, cHP: 100 } },
  mMap: { 0: { cHP: 70 } },
});
assert(
  emitted.some((x) => x[0] === "damage" && x[1] === "甲" && x[2] === 30),
  "两人仅一人降 MP 时没有获得全部伤害",
);

emitted.length = 0;
typedTeamDamage.length = 0;
newBattle("both");
send({
  type: "battle_updated",
  pMap: { 0: { cMP: 80, cHP: 100 }, 1: { cMP: 80, cHP: 100 } },
  mMap: { 0: { cHP: 60 } },
});
assert(
  !emitted.some((x) => x[0] === "damage") &&
    typedTeamDamage.some((x) => x.amount === 40),
  "多人同时降 MP 且无唯一行动者时仍错误均分，或团队伤害被丢弃",
);

emitted.length = 0;
typedTeamDamage.length = 0;
newBattle("none");
send({
  type: "battle_updated",
  pMap: { 0: { cMP: 100, cHP: 100 }, 1: { cMP: 100, cHP: 100 } },
  mMap: { 0: { cHP: 60 } },
});
assert(
  !emitted.some((x) => x[0] === "damage") &&
    typedTeamDamage.some((x) => x.amount === 40),
  "无人降 MP 且无唯一行动者时仍错误均分，或团队伤害被丢弃",
);

emitted.length = 0;
const counterA = player("计数甲", "slash"),
  counterB = player("计数乙", "magic", "fire", "magic", 3500000000);
counterA.attackAttemptCounter = 10;
counterB.attackAttemptCounter = 20;
send({
  type: "new_battle",
  combatStartTime: "counter-beats-mp",
  players: [counterA, counterB],
  monsters: [{ currentHitpoints: 100, enrageTimerDuration: 180000000000 }],
});
send({
  type: "battle_updated",
  pMap: {
    0: { cMP: 100, cHP: 100, atkCounter: 11 },
    1: { cMP: 75, cHP: 100, atkCounter: 20 },
  },
  mMap: { 0: { cHP: 70 } },
});
assert(
  emitted.some((x) => x[0] === "damage" && x[1] === "计数甲" && x[2] === 30) &&
    !emitted.some((x) => x[0] === "damage" && x[1] === "计数乙"),
  "唯一 atkCounter 增量没有优先于误导性的唯一 MP 下降者",
);

emitted.length = 0;
const autoA = player("普攻甲", "slash"),
  autoB = player("旁观乙", "magic", "water", "magic", 3500000000);
autoA.attackAttemptCounter = 50;
autoB.attackAttemptCounter = 80;
send({
  type: "new_battle",
  combatStartTime: "counter-no-mp",
  players: [autoA, autoB],
  monsters: [{ currentHitpoints: 100, enrageTimerDuration: 180000000000 }],
});
send({
  type: "battle_updated",
  pMap: {
    0: { cMP: 100, cHP: 100, atkCounter: 51, isAutoAtk: true },
    1: { cMP: 100, cHP: 100, atkCounter: 80 },
  },
  mMap: { 0: { cHP: 65 } },
});
assert(
  emitted.some(
    (x) =>
      x[0] === "damage" && x[1] === "普攻甲" && x[2] === 35 && x[3] === "auto",
  ),
  "不消耗 MP 的普通攻击没有通过 atkCounter 正确归属",
);

emitted.length = 0;
const abilityA = player("技能甲", "magic", "fire", "magic", 3500000000);
abilityA.attackAttemptCounter = 0;
abilityA.preparingAbilityHrid = "/abilities/fireball";
send({
  type: "new_battle",
  combatStartTime: "ability-source",
  players: [abilityA],
  monsters: [{ currentHitpoints: 100, enrageTimerDuration: 180000000000 }],
});
send({
  type: "battle_updated",
  pMap: {
    0: {
      cMP: 80,
      cHP: 100,
      atkCounter: 1,
      abilityHrid: "/abilities/flame_blast",
    },
  },
  mMap: { 0: { cHP: 60 } },
});
assert(
  emitted.some(
    (x) =>
      x[0] === "damage" &&
      x[1] === "技能甲" &&
      x[2] === 40 &&
      x[3] === "/abilities/fireball",
  ),
  "技能伤害没有使用上一条准备动作记录具体技能来源",
);

// mayhem / pierce / blaze 都是直接造成 HP 下降的武器特效；只记录这三类，
// 不把 curse、weaken 等状态型词条拆成伤害来源。
send({
  type: "init_client_data",
  abilityDetailMap: {
    "/abilities/heal": {
      hrid: "/abilities/heal",
      abilityEffects: [{ effectType: "/ability_effect_types/heal" }],
    },
  },
});
emitted.length = 0;
const flailUser = player("连枷甲", "smash", "physical", "melee");
flailUser.attackAttemptCounter = 0;
flailUser.isPreparingAutoAttack = true;
flailUser.combatDetails.combatStats.mayhem = 0.25;
send({
  type: "new_battle",
  combatStartTime: "flail-proc",
  players: [flailUser],
  monsters: [{ currentHitpoints: 100 }],
});
send({
  type: "battle_updated",
  pMap: { 0: { cMP: 100, cHP: 100, atkCounter: 1, isAutoAtk: true } },
  mMap: { 0: { cHP: 84 } },
});
const flailDamage = emitted.find(
  (x) => x[0] === "damage" && x[1] === "连枷甲" && x[2] === 16,
);
assert(
  flailDamage && flailDamage[3] === "auto",
  "连枷 mayhem 无法逐次确认时仍被错误地单独归类为武器特效",
);

emitted.length = 0;
const crossbowUser = player(
  "裂空弩甲",
  "ranged",
  "physical",
  "ranged",
  3600000000,
);
crossbowUser.attackAttemptCounter = 0;
crossbowUser.isPreparingAutoAttack = true;
crossbowUser.combatDetails.combatStats.pierce = 0.3;
send({
  type: "new_battle",
  combatStartTime: "crossbow-proc",
  players: [crossbowUser],
  monsters: [{ currentHitpoints: 100 }, { currentHitpoints: 100 }],
});
send({
  type: "battle_updated",
  pMap: { 0: { cMP: 100, cHP: 100, atkCounter: 1, isAutoAtk: true } },
  mMap: { 0: { cHP: 80 }, 1: { cHP: 92 } },
});
assert(
  emitted.some(
    (x) =>
      x[0] === "damage" &&
      x[1] === "裂空弩甲" &&
      x[2] === 20 &&
      x[3] === "auto",
  ) &&
    emitted.some(
      (x) =>
        x[0] === "damage" &&
        x[1] === "裂空弩甲" &&
        x[2] === 8 &&
        x[3] === "/items/sundering_crossbow",
    ),
  "裂空弩没有把主目标普通攻击与额外目标 pierce 伤害精确拆开",
);

takenEvents.length = 0;
const tank = player("承伤甲", "smash", "physical", "defense");
send({
  type: "new_battle",
  combatStartTime: "taken-source",
  players: [tank],
  monsters: [
    {
      name: "试炼萤火虫",
      hrid: "/monsters/trial_firefly",
      currentHitpoints: 100,
      attackAttemptCounter: 0,
      preparingAbilityHrid: "/abilities/firestorm",
    },
  ],
});
send({
  type: "battle_updated",
  pMap: { 0: { cMP: 100, cHP: 76, atkCounter: 0 } },
  mMap: { 0: { cHP: 100, atkCounter: 1, abilityHrid: "/abilities/fireball" } },
});
const taken = takenEvents.find(
  (event) => event.name === "承伤甲" && event.amount === 24,
);
assert(
  taken && TakenSources.label(taken.source) === "试炼萤火虫 · 烈焰风暴",
  "普通战斗承伤没有按怪物上一条准备技能记录“怪物 · 技能”来源",
);

// 游戏初始化表是技能分类的权威来源：治疗者行动与 Firestorm 跳伤同包时，
// 伤害仍归原 DoT 施放者，并显示“持续伤害（烈焰风暴）”对应的技能图标。
send({
  type: "init_client_data",
  abilityDetailMap: {
    "/abilities/firestorm": {
      hrid: "/abilities/firestorm",
      abilityEffects: [
        {
          effectType: "/ability_effect_types/damage",
          damageOverTimeRatio: 1,
          damageOverTimeDuration: 6_000_000_000,
        },
      ],
    },
    "/abilities/heal": {
      hrid: "/abilities/heal",
      abilityEffects: [{ effectType: "/ability_effect_types/heal" }],
    },
  },
});
emitted.length = 0;
const dotCaster = player("持续甲", "magic", "fire", "magic", 3500000000);
dotCaster.attackAttemptCounter = 0;
dotCaster.preparingAbilityHrid = "/abilities/firestorm";
dotCaster.combatAbilities = [{ abilityHrid: "/abilities/firestorm" }];
const healer = player("治疗乙", "magic", "nature", "magic", 3500000000);
healer.attackAttemptCounter = 0;
healer.preparingAbilityHrid = "/abilities/heal";
healer.combatAbilities = [{ abilityHrid: "/abilities/heal" }];
send({
  type: "new_battle",
  combatStartTime: "heal-with-dot",
  players: [dotCaster, healer],
  monsters: [{ currentHitpoints: 100, enrageTimerDuration: 180000000000 }],
});
send({
  type: "battle_updated",
  pMap: {
    0: { cMP: 80, cHP: 100, atkCounter: 1, abilityHrid: "/abilities/fireball" },
    1: { cMP: 100, cHP: 100, atkCounter: 0, abilityHrid: "/abilities/heal" },
  },
  mMap: { 0: { cHP: 90 } },
});
emitted.length = 0;
send({
  type: "battle_updated",
  pMap: {
    0: { cMP: 80, cHP: 100, atkCounter: 1, abilityHrid: "/abilities/fireball" },
    1: { cMP: 80, cHP: 100, atkCounter: 1, abilityHrid: "/abilities/heal" },
  },
  mMap: { 0: { cHP: 80 } },
});
assert(
  emitted.some(
    (x) =>
      x[0] === "damage" &&
      x[1] === "持续甲" &&
      x[2] === 10 &&
      x[3] === "dot:/abilities/firestorm",
  ) && !emitted.some((x) => x[0] === "damage" && x[1] === "治疗乙"),
  "与治疗同时结算的 DoT 仍被算到治疗者，或唯一 DoT 技能未被具体标注",
);

emitted.length = 0;
newBattle("single");
send({
  type: "battle_updated",
  pMap: { 1: { cMP: 100, cHP: 100 } },
  mMap: { 0: { cHP: 55 } },
});
assert(
  emitted.some((x) => x[0] === "damage" && x[1] === "乙" && x[2] === 45),
  "单人消息没有获得全部伤害",
);

emitted.length = 0;
newBattle("kill");
send({
  type: "battle_updated",
  pMap: { 0: { cMP: 70, cHP: 100 }, 1: { cMP: 100, cHP: 100 } },
  mMap: { 0: { cHP: 0 } },
});
assert(
  emitted.some((x) => x[0] === "kill" && x[1] === "甲"),
  "唯一降 MP 玩家没有获得击杀",
);

emitted.length = 0;
const snapshotLocal = player("快照甲", "magic", "water", "magic", 3500000000);
snapshotLocal.character = { id: 98148, name: "快照甲" };
send({
  type: "init_character_data",
  data: {
    character: { id: 98148, name: "快照甲" },
    guildCombatBattle: {
      battleId: 1,
      battleWave: 1,
      combatStartTime: "2026-08-03T10:00:00Z",
      tier: 5,
      players: [
        snapshotLocal,
        {
          character: { id: 2113, name: "快照乙" },
          name: "快照乙",
          currentHitpoints: 120,
          currentManapoints: 100,
          maxHitpoints: 120,
          maxManapoints: 100,
          isActive: true,
        },
      ],
      monsters: [
        { currentHitpoints: 150, maxHitpoints: 200, damageSplatCounter: 0 },
        { currentHitpoints: 200, maxHitpoints: 200, damageSplatCounter: 0 },
      ],
    },
  },
});
send({
  type: "guild_battle_updated",
  battleId: 1,
  tier: 5,
  pMap: { 1: { cMP: 80, cHP: 120, atkCounter: 1 } },
  mMap: { 1: { cHP: 170, mHP: 200, dmgCounter: 1 } },
});
assert(
  emitted.some((x) => x[0] === "damage" && x[1] === "快照乙" && x[2] === 30),
  "client_data 的 guildCombatBattle 没有建立准确槽位姓名或怪物血量基线",
);
assert(
  !emitted.some((x) => x[0] === "damage" && /^Joueur/.test(x[1])),
  "已有 guildCombatBattle 权威名单时仍错误使用了 DOM 占位名",
);

emitted.length = 0;
send({
  type: "new_guild_battle",
  battleId: "guild-two",
  tier: 1,
  players: [
    player("公会甲", "magic", "water", "magic", 3500000000),
    player("公会乙", "slash"),
  ],
  monsters: [
    { currentHitpoints: 100, maxHitpoints: 100, damageSplatCounter: 0 },
  ],
});
send({
  type: "guild_battle_updated",
  battleId: "guild-two",
  tier: 1,
  pMap: {
    0: { cMP: 75, cHP: 100, atkCounter: 1 },
    1: { cMP: 80, cHP: 100, atkCounter: 0 },
  },
  mMap: { 0: { cHP: 65, mHP: 100, dmgCounter: 1 } },
});
assert(
  emitted.some((x) => x[0] === "damage" && x[1] === "公会甲" && x[2] === 35) &&
    !emitted.some((x) => x[1] === "公会乙"),
  "公会双人消息没有按唯一 atkCounter 增长者归属，或仍受 MP 变化干扰",
);

emitted.length = 0;
typedTeamDamage.length = 0;
send({
  type: "guild_battle_updated",
  battleId: "guild-two",
  tier: 1,
  pMap: { 0: { cMP: 75, cHP: 100, atkCounter: 1 } },
  mMap: { 0: { cHP: 55, mHP: 100, dmgCounter: 2 } },
});
assert(
  emitted.some(
    (x) =>
      x[0] === "damage" && x[1] === "公会甲" && x[2] === 10 && x[3] === "dot",
  ),
  "DoT/单人盾反消息没有通过唯一 pMap 来源正确归属",
);

emitted.length = 0;
typedTeamDamage.length = 0;
send({
  type: "guild_battle_updated",
  battleId: "guild-two",
  tier: 1,
  pMap: {
    0: { cMP: 75, cHP: 100, atkCounter: 1 },
    1: { cMP: 80, cHP: 100, atkCounter: 0 },
  },
  mMap: { 0: { cHP: 45, mHP: 100, dmgCounter: 4 } },
});
assert(
  !emitted.some((x) => x[0] === "damage") &&
    typedTeamDamage.some((x) => x.amount === 10),
  "多人反伤等无唯一行动者的消息仍被虚假均分，或团队伤害丢失",
);

emitted.length = 0;
typedTeamDamage.length = 0;
send({
  type: "guild_battle_updated",
  battleId: "guild-two",
  tier: 1,
  pMap: { 0: { cMP: 75, cHP: 100, atkCounter: 2 } },
  mMap: { 0: { cHP: 40, mHP: 100, dmgCounter: 4 } },
});
assert(
  !emitted.some((x) => x[0] === "damage") &&
    !typedTeamDamage.some((x) => x.amount === 5),
  "怪物 dmgCounter 未增长时仍把 HP 变化当作有效伤害",
);

// 点击人物得到的 combatBuffMap 可立即校准反伤状态；Boss 行动造成多人
// 受击并同时被反伤时，只在当时有效的反伤玩家中分配。
emitted.length = 0;
typedTeamDamage.length = 0;
send({
  type: "battle_unit_fetched",
  isGuildBattle: true,
  unit: {
    name: "公会乙",
    character: { name: "公会乙" },
    combatBuffMap: {
      "/buff_uniques/spike_shell_physical_thorns": {
        uniqueHrid: "/buff_uniques/spike_shell_physical_thorns",
        typeHrid: "/buff_types/physical_thorns",
        flatBoost: 0.15,
        startTime: new Date().toISOString(),
        duration: 30_000_000_000,
      },
    },
    combatDetails: {
      combatStats: {
        combatStyleHrids: ["/combat_styles/smash"],
        damageType: "/damage_types/physical",
        primaryTraining: "/skills/defense",
      },
    },
  },
});
send({
  type: "guild_battle_updated",
  battleId: "guild-two",
  tier: 1,
  pMap: {
    0: { cMP: 75, cHP: 90, atkCounter: 2, dmgCounter: 1 },
    1: { cMP: 80, cHP: 90, atkCounter: 0, dmgCounter: 1 },
  },
  mMap: {
    0: {
      cHP: 30,
      mHP: 100,
      dmgCounter: 5,
      atkCounter: 1,
      abilityHrid: "/abilities/water_strike",
    },
  },
});
assert(
  emitted.some(
    (x) =>
      x[0] === "damage" &&
      x[1] === "公会乙" &&
      x[2] === 10 &&
      x[3] === "/abilities/spike_shell",
  ) && !emitted.some((x) => x[1] === "公会甲"),
  "Boss 多人攻击产生的反伤没有只归给当时处于反伤状态且确实受击的玩家",
);

emitted.length = 0;
typedTeamDamage.length = 0;
send({
  type: "init_client_data",
  abilityDetailMap: {
    "/abilities/test_mirror": {
      abilityHrid: "/abilities/test_mirror",
      effects: [
        {
          buff: {
            typeHrid: "/buff_types/retaliation",
            duration: 20_000_000_000,
          },
        },
      ],
    },
  },
});
const mirrorPlayer = player("规则反伤甲", "smash", "physical", "defense");
mirrorPlayer.attackAttemptCounter = 0;
mirrorPlayer.preparingAbilityHrid = "/abilities/test_mirror";
send({
  type: "new_guild_battle",
  battleId: "dynamic-reflect",
  tier: 1,
  players: [mirrorPlayer, player("规则旁观乙", "slash")],
  monsters: [
    {
      currentHitpoints: 100,
      maxHitpoints: 100,
      damageSplatCounter: 0,
      attackAttemptCounter: 0,
    },
  ],
});
send({
  type: "guild_battle_updated",
  battleId: "dynamic-reflect",
  tier: 1,
  pMap: {
    0: { cHP: 100, cMP: 100, atkCounter: 1, dmgCounter: 0, isAutoAtk: true },
  },
  mMap: {
    0: { cHP: 100, mHP: 100, dmgCounter: 0, atkCounter: 0, isAutoAtk: true },
  },
});
// 录制回放中的人物详情仍带录制当天的绝对时间，旧版会用这个过期快照
// 删除上一条技能动作刚建立的反伤窗口，从而漏记随后同消息内的反伤。
send({
  type: "battle_unit_fetched",
  isGuildBattle: true,
  unit: {
    name: "规则反伤甲",
    character: { name: "规则反伤甲" },
    combatBuffMap: {
      "/buff_uniques/test_mirror": {
        uniqueHrid: "/buff_uniques/test_mirror",
        typeHrid: "/buff_types/retaliation",
        flatBoost: 0.2,
        startTime: "2020-01-01T00:00:00.000Z",
        duration: 20_000_000_000,
      },
    },
    combatDetails: {
      combatStats: {
        combatStyleHrids: ["/combat_styles/smash"],
        damageType: "/damage_types/physical",
        primaryTraining: "/skills/defense",
      },
    },
  },
});
send({
  type: "guild_battle_updated",
  battleId: "dynamic-reflect",
  tier: 1,
  pMap: {
    0: { cHP: 90, cMP: 100, atkCounter: 1, dmgCounter: 1, isAutoAtk: true },
    1: { cHP: 90, cMP: 100, atkCounter: 0, dmgCounter: 1, isAutoAtk: true },
  },
  mMap: {
    0: { cHP: 92, mHP: 100, dmgCounter: 1, atkCounter: 1, isAutoAtk: true },
  },
});
assert(
  emitted.some(
    (x) =>
      x[0] === "damage" &&
      x[1] === "规则反伤甲" &&
      x[2] === 8 &&
      x[3] === "/abilities/test_mirror",
  ),
  "没有从能力表学习反伤技能，或过期人物快照错误删除了实时识别的反伤窗口",
);
emitted.length = 0;
typedTeamDamage.length = 0;
send({
  type: "guild_battle_updated",
  battleId: "dynamic-reflect",
  tier: 1,
  pMap: {
    0: { cHP: 90, cMP: 100, atkCounter: 1, dmgCounter: 1, isAutoAtk: true },
    1: { cHP: 90, cMP: 100, atkCounter: 0, dmgCounter: 1, isAutoAtk: true },
  },
  mMap: {
    0: { cHP: 87, mHP: 100, dmgCounter: 2, atkCounter: 2, isAutoAtk: true },
  },
});
assert(
  emitted.some((x) => x[0] === "damage" && x[1] === "规则反伤甲" && x[2] === 5),
  "Boss 攻击未命中但惩戒仍触发时，因玩家 dmgCounter 未增长而漏记反伤",
);

emitted.length = 0;
typedTeamDamage.length = 0;
send({
  type: "new_guild_battle",
  battleId: "rotating-roster",
  tier: 1,
  players: [
    player("Stella", "magic", "fire", "magic", 3500000000),
    player("Ting", "stab"),
  ],
  monsters: [
    {
      currentHitpoints: 100,
      maxHitpoints: 100,
      damageSplatCounter: 0,
      attackAttemptCounter: 0,
    },
  ],
});
send({
  type: "guild_battle_updated",
  battleId: "rotating-roster",
  tier: 1,
  pMap: {
    1: {
      cHP: 100,
      cMP: 90,
      atkCounter: 1,
      dmgCounter: 0,
      abilityHrid: "/abilities/puncture",
    },
  },
  mMap: { 0: { cHP: 90, mHP: 100, dmgCounter: 1, atkCounter: 0 } },
});
send({
  type: "new_guild_battle",
  battleId: "rotating-roster",
  tier: 2,
  players: [
    player("Ting", "slash"),
    player("Stella", "magic", "fire", "magic", 3500000000),
  ],
  monsters: [
    {
      currentHitpoints: 100,
      maxHitpoints: 100,
      damageSplatCounter: 0,
      attackAttemptCounter: 0,
    },
  ],
});
send({
  type: "guild_battle_updated",
  battleId: "rotating-roster",
  tier: 2,
  pMap: {
    0: {
      cHP: 100,
      cMP: 80,
      atkCounter: 1,
      dmgCounter: 0,
      abilityHrid: "/abilities/maim",
    },
  },
  mMap: { 0: { cHP: 80, mHP: 100, dmgCounter: 1, atkCounter: 0 } },
});
assert(
  emitted
    .filter((x) => x[0] === "damage" && x[1] === "Ting")
    .reduce((sum, x) => sum + x[2], 0) === 30 &&
    !emitted.some((x) => x[0] === "damage" && x[1] === "Stella"),
  "换层 slot 轮换后没有按新层权威名册继续归属到同一个玩家名",
);

emitted.length = 0;
let parallelBattleDetail = null;
SocketHook.bus.addEventListener("newBattle", (event) => {
  parallelBattleDetail = event.detail;
});
send({
  type: "new_guild_battle",
  battleId: "guild-stage-keep",
  tier: 1,
  players: [player("试炼甲", "magic", "water", "magic", 3500000000)],
  monsters: [
    { currentHitpoints: 100, maxHitpoints: 100, damageSplatCounter: 0 },
  ],
});
const guildKeyBeforeParallel = SocketHook.getCombatKey();
send({
  type: "new_battle",
  combatStartTime: "parallel-normal-stage",
  players: [player("并行普通队友", "slash")],
  monsters: [{ currentHitpoints: 80, enrageTimerDuration: 180000000000 }],
});
send({
  type: "guild_battle_updated",
  battleId: "guild-stage-keep",
  tier: 1,
  pMap: { 0: { cMP: 90, cHP: 100, atkCounter: 1 } },
  mMap: { 0: { cHP: 60, mHP: 100, dmgCounter: 1 } },
});
assert(
  parallelBattleDetail && parallelBattleDetail.parallelGuildBattle === true,
  "公会试炼期间的普通 new_battle 未被标记为并行战斗",
);
assert(
  SocketHook.getCombatKey() === guildKeyBeforeParallel,
  "并行普通战斗错误覆盖了公会试炼战斗标识",
);
assert(
  emitted.some((x) => x[0] === "damage" && x[1] === "试炼甲" && x[2] === 40),
  "并行普通战斗错误清空了公会试炼伤害基线",
);

// 复现旧版串账顺序：普通战斗先累计，随后在缺少 new_guild_battle 的情况下
// 首次收到 guild_battle_updated。试炼检测必须携带稳定身份，且两类伤害带有
// 不同通道标签，供上层在切换 Session 时拒绝交叉写入。
let fallbackTrialDetail = null,
  consumableTrialDetail = null;
SocketHook.bus.addEventListener("guildBattleDetected", (event) => {
  if (event.detail && event.detail.source === "guild_battle_updated")
    fallbackTrialDetail = event.detail;
  if (
    event.detail &&
    event.detail.source === "battle_consumable_ability_updated"
  )
    consumableTrialDetail = event.detail;
});
send({
  type: "init_character_data",
  data: { character: { id: 4242, name: "竞态角色" } },
});
typedTeamDamage.length = 0;
send({
  type: "new_battle",
  combatStartTime: "ordinary-before-trial",
  players: [player("竞态角色", "slash")],
  monsters: [{ currentHitpoints: 100, enrageTimerDuration: 180000000000 }],
});
send({
  type: "battle_updated",
  pMap: { 0: { cMP: 100, cHP: 100 } },
  mMap: { 0: { cHP: 80 } },
});
send({
  type: "guild_battle_updated",
  battleId: 7,
  tier: 1,
  pMap: { 0: { cMP: 100, cHP: 100, atkCounter: 3 } },
  mMap: { 0: { cHP: 100, mHP: 100, dmgCounter: 4 } },
});
send({
  type: "guild_battle_updated",
  battleId: 7,
  tier: 1,
  pMap: { 0: { cMP: 90, cHP: 100, atkCounter: 4 } },
  mMap: { 0: { cHP: 60, mHP: 100, dmgCounter: 5 } },
});
assert(
  fallbackTrialDetail &&
    fallbackTrialDetail.combatKey === "7" &&
    fallbackTrialDetail.characterId === "4242",
  "缺少 new_guild_battle 时没有为试炼生成稳定身份",
);
assert(
  typedTeamDamage.some(
    (detail) => detail.amount === 20 && detail.battleType === "combat",
  ) &&
    typedTeamDamage.some(
      (detail) => detail.amount === 40 && detail.battleType === "trial",
    ),
  "普通与试炼伤害事件没有携带彼此独立的通道标签",
);

send({
  type: "init_character_data",
  data: { character: { id: 4242, name: "竞态角色" } },
});
send({
  type: "battle_consumable_ability_updated",
  isGuildBattle: true,
  battleId: 8,
});
assert(
  consumableTrialDetail && consumableTrialDetail.combatKey === "8",
  "消耗品试炼信号只切换了标志，仍未先建立试炼 Session 身份",
);

ClassDebug.clear();
SocketHook.testHandleMessage(
  JSON.stringify({
    type: "new_guild_battle",
    battleId: "debug-case",
    players: [
      player("调试水法", "magic", "water", "magic", 3500000000),
      {
        name: "嵌套结构",
        combatUnit: {
          combatDetails: {
            combatStats: {
              combatStyleHrids: ["/combat_styles/ranged"],
              damageType: "/damage_types/physical",
              primaryTraining: "/skills/ranged",
              attackInterval: 3600000000,
            },
          },
        },
      },
    ],
  }),
);
const debugEvents = ClassDebug.get(),
  debugReport = ClassDebug.report();
assert(
  debugEvents.length === 1 && debugEvents[0].players.length === 2,
  "职业调试模式没有记录战斗玩家",
);
assert(
  debugReport.includes("combatDetails.combatStats") &&
    debugReport.includes("combatUnit.combatDetails.combatStats") &&
    debugReport.includes("调试水法"),
  "职业调试报告缺少原始识别路径或玩家",
);

ClassProbe.clear();
ClassProbe.start();
send({
  type: "init_client_data",
  abilityDetailMap: {
    "/abilities/frost_surge": {
      hrid: "/abilities/frost_surge",
      abilityEffects: [
        {
          combatStyleHrid: "/combat_styles/magic",
          damageType: "/damage_types/water",
        },
      ],
    },
  },
});
send({
  type: "new_guild_battle",
  battleId: "probe",
  players: [
    { name: "探针甲", currentManapoints: 100, currentHitpoints: 100 },
    { name: "探针乙", currentManapoints: 100, currentHitpoints: 100 },
  ],
});
send({
  type: "guild_battle_updated",
  pMap: {
    0: { cMP: 100, cHP: 100, abilityHrid: "/abilities/frost_surge" },
    1: { cMP: 100, cHP: 100, isAutoAtk: true },
  },
  mMap: {},
});
send({
  type: "new_battle",
  combatStartTime: "probe-normal",
  players: [
    { name: "普通探针丙", currentManapoints: 100, currentHitpoints: 100 },
  ],
  monsters: [],
});
send({
  type: "battle_updated",
  pMap: { 0: { cMP: 90, cHP: 100, abilityHrid: "/abilities/slash" } },
  mMap: {},
});
send({
  type: "guild_battle_updated",
  pMap: {
    0: { cMP: 80, cHP: 100, abilityHrid: "/abilities/frost_surge" },
    1: { cMP: 100, cHP: 100, isAutoAtk: true },
  },
  mMap: {},
});
send({
  type: "new_guild_battle",
  battleId: "probe",
  tier: 2,
  players: [
    { name: "探针乙", currentManapoints: 100, currentHitpoints: 100 },
    { name: "探针甲", currentManapoints: 100, currentHitpoints: 100 },
  ],
});
send({
  type: "guild_battle_updated",
  tier: 2,
  pMap: {
    0: { cMP: 90, cHP: 100, abilityHrid: "/abilities/maim" },
    1: { cMP: 90, cHP: 100, abilityHrid: "/abilities/frost_surge" },
  },
  mMap: {},
});
send({
  type: "battle_unit_fetched",
  isGuildBattle: true,
  unit: player("手动点击水法", "magic", "water", "magic", 3500000000),
});
SocketHook.testHandleMessage("server-non-json-ping");
ClassProbe.stop("自动化测试");
const probeReport = ClassProbe.report(),
  probeState = ClassProbe.get();
const probePlayers = Object.values(probeState.players);
const trialProbeA = probePlayers.find(
  (player) =>
    player.channel === "trial" &&
    player.name === "探针甲" &&
    player.updateCount === 2,
);
const trialProbeB = probePlayers.find(
  (player) =>
    player.channel === "trial" &&
    player.name === "探针乙" &&
    player.autoAttackCount === 2,
);
const rotatedProbeB = probePlayers.find(
  (player) =>
    player.channel === "trial" &&
    player.name === "探针乙" &&
    player.abilities.includes("/abilities/maim"),
);
const normalProbe = probePlayers.find(
  (player) => player.channel === "combat" && player.name === "普通探针丙",
);
assert(
  probeState.messageCounts.guild_battle_updated === 3 &&
    trialProbeA &&
    trialProbeA.mpDropCount === 1 &&
    trialProbeB &&
    rotatedProbeB &&
    normalProbe,
  "手动全量探针没有汇总实时玩家行为",
);
assert(
  !normalProbe.abilities.includes("/abilities/frost_surge") &&
    probeReport.includes("[试炼 ") &&
    probeReport.includes("[普通 "),
  "普通战斗和试炼同号 slot 被探针混写，或换层阵容没有单独保存",
);
assert(
  probeReport.includes("/abilities/frost_surge") &&
    probeReport.includes("/damage_types/water") &&
    probeReport.includes("abilityHrid"),
  "手动全量探针报告缺少技能定义或 pMap 字段",
);
assert(
  probeState.fullMessages.length >= 5 &&
    probeState.fullMessages.some(
      (message) => message.type === "battle_unit_fetched",
    ) &&
    probeReport.includes("全部入站消息（按接收顺序）"),
  "全量消息探针没有完整记录人物点击返回消息",
);
assert(
  probeState.messageCounts.__non_json_message__ === 1 &&
    probeState.fullMessages.some(
      (message) => message.type === "__non_json_message__",
    ),
  "非 JSON WebSocket 入站消息仍被解析失败分支静默丢弃",
);
assert(
  ClassSystem.classFor("手动点击水法") === "water",
  "battle_unit_fetched 没有即时更新被点击玩家职业",
);

Session.reset({ combatKey: "resume", characterId: "A" });
Session.addTeamDamage(10, performance.now());
Session.addPlayerDamage("甲", 10, "auto");
Session.pause("断线");
const cached = Session.serialize();
Session.restore(cached);
Session.resume("续传");
Session.addTeamDamage(20, performance.now());
Session.addPlayerDamage("甲", 20, "/abilities/fireball");
const resumed = Session.serialize();
assert(resumed.teamDamage === 30, "续传后总伤害未合并");
assert(resumed.fragments.length === 2, "续传没有保留两个片段");
assert(
  resumed.players.sources.甲.auto === 10 &&
    resumed.players.sources.甲["/abilities/fireball"] === 20,
  "断线缓存没有保存普通攻击和技能伤害构成",
);
const sourceView = ViewData.get().players.find(
  (player) => player.name === "甲",
);
assert(
  sourceView &&
    sourceView.breakdown.length === 2 &&
    sourceView.breakdown.reduce((sum, item) => sum + item.value, 0) === 30,
  "实时排行没有生成带总量、DPS 和百分比的伤害构成",
);

Session.reset({ combatKey: "trial-day", characterId: "A", type: "trial" });
Session.addTeamDamage(12, performance.now());
Session.addPlayerDamage("甲", 12);
Session.freeze("公会试炼阶段结束");
Session.resumeTrialTier("进入下一层");
Session.addTeamDamage(18, performance.now());
Session.addPlayerDamage("甲", 18);
const tierContinued = Session.serialize();
assert(
  tierContinued.teamDamage === 30 &&
    tierContinued.fragments.length === 1 &&
    tierContinued.fragments[0].teamDamage === 30,
  "同日试炼 tier 升级没有继续原累计，或错误新增了重连片段",
);

HistoryStore.clear();
HistoryStore.push({
  id: "favorite-old",
  type: "combat",
  date: new Date(0).toISOString(),
});
assert(HistoryStore.setFavorite("favorite-old", true), "历史收藏失败");
for (let i = 0; i < 11; i++)
  HistoryStore.push({
    id: `combat-${i}`,
    type: "combat",
    date: new Date(i + 1).toISOString(),
  });
for (let i = 0; i < 11; i++)
  HistoryStore.push({
    id: `maze-${i}`,
    type: "labyrinth",
    date: new Date(i + 1).toISOString(),
  });
for (let i = 0; i < 11; i++)
  HistoryStore.push({
    id: `trial-${i}`,
    type: "trial",
    date: new Date(i + 1).toISOString(),
  });
const combatHistory = HistoryStore.getAll("combat");
assert(
  combatHistory.length === 11 &&
    combatHistory.some((x) => x.id === "favorite-old" && x.favorite === true),
  "收藏记录错误计入每类 10 条上限",
);
assert(
  combatHistory.filter((x) => !x.favorite).length === 10 &&
    !combatHistory.some((x) => x.id === "combat-0"),
  "普通战斗没有按最近 10 条裁剪",
);
assert(
  HistoryStore.getAll("labyrinth").length === 10 &&
    !HistoryStore.getAll("labyrinth").some((x) => x.id === "maze-0"),
  "迷宫没有独立按最近 10 条裁剪",
);
assert(
  HistoryStore.getAll("trial").length === 10 &&
    !HistoryStore.getAll("trial").some((x) => x.id === "trial-0"),
  "公会试炼没有独立按最近 10 条裁剪",
);
assert(
  HistoryStore.remove("favorite-old") &&
    !HistoryStore.getAll().some((x) => x.id === "favorite-old"),
  "悬停菜单所依赖的历史删除接口失败",
);
HistoryStore.push({
  id: "named-maze",
  type: "labyrinth",
  date: new Date(2026, 7, 3, 20, 15).toISOString(),
  players: [{ name: "单人" }],
});
let namedMaze = SegmentSelection.options().find(
  (option) => option.entry && option.entry.id === "named-maze",
);
assert(
  namedMaze && namedMaze.label === "迷宫 1人 8月3日20:15",
  "历史记录名称没有按“类型 人数 月日时间”显示",
);
HistoryStore.setFavorite("named-maze", true);
const favoriteRecords = SegmentSelection.options().filter(
  (option) => option.group === "favorite" && !option.fragment,
);
assert(
  favoriteRecords[0].entry.id === "named-maze" &&
    favoriteRecords[0].label.startsWith("★ ") &&
    !SegmentSelection.options().some(
      (option) =>
        option.group === "labyrinth" &&
        option.entry &&
        option.entry.id === "named-maze",
    ),
  "收藏记录没有移动到独立收藏分类并显示星号",
);
assert(HistoryStore.rename("named-maze", "晚间迷宫队"), "收藏记录改名失败");
namedMaze = SegmentSelection.options().find(
  (option) =>
    option.entry && option.entry.id === "named-maze" && !option.fragment,
);
assert(
  namedMaze.label === "★ 晚间迷宫队" &&
    namedMaze.entry.customName === "晚间迷宫队",
  "收藏自定义名称没有保存或显示",
);

HistoryStore.push({
  id: "segment-view",
  type: "trial",
  date: new Date().toISOString(),
  durationMs: 10000,
  teamDamage: 100,
  classes: { 甲: "fire", 乙: "sword" },
  players: [
    {
      name: "甲",
      classId: "fire",
      damage: 70,
      dps: 7,
      kills: 1,
      healing: 0,
      hps: 0,
      taken: 4,
    },
    {
      name: "乙",
      classId: "sword",
      damage: 30,
      dps: 3,
      kills: 0,
      healing: 0,
      hps: 0,
      taken: 6,
    },
  ],
  fragments: [
    {
      durationMs: 4000,
      teamDamage: 40,
      players: {
        damage: { 甲: 40 },
        healing: {},
        taken: { 甲: 2 },
        kills: { 甲: 1 },
      },
    },
    {
      durationMs: 6000,
      teamDamage: 60,
      players: {
        damage: { 甲: 30, 乙: 30 },
        healing: {},
        taken: { 甲: 2, 乙: 6 },
        kills: {},
      },
    },
  ],
});
const segmentOptions = SegmentSelection.options();
assert(
  segmentOptions.some((x) => x.group === "combat") &&
    segmentOptions.some((x) => x.group === "labyrinth") &&
    segmentOptions.some((x) => x.group === "trial"),
  "片段选择器没有按普通、迷宫、试炼分类",
);
const archivedOption = segmentOptions.find(
  (x) => x.entry && x.entry.id === "segment-view" && !x.fragment,
);
SegmentSelection.select(archivedOption.key);
let selectedView = ViewData.get();
assert(
  !selectedView.current &&
    selectedView.type === "trial" &&
    selectedView.teamDamage === 100 &&
    selectedView.players[0].damage === 70,
  "历史片段没有替换当前排行数据或试炼标记丢失",
);
const reconnectOption = segmentOptions.find(
  (x) => x.entry && x.entry.id === "segment-view" && x.fragmentIndex === 1,
);
SegmentSelection.select(reconnectOption.key);
selectedView = ViewData.get();
assert(
  selectedView.teamDamage === 60 &&
    selectedView.players.some((x) => x.name === "乙" && x.dps === 5),
  "断线子片段 DPS 排行计算错误",
);
SegmentSelection.select("current");
assert(ViewData.get().current, "无法切回当前战斗");

console.log(
  "银河奶牛DPS统计 tests: classes, attribution, reconnect, history, and Details segment selection passed.",
);
