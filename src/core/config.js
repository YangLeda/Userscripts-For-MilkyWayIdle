import { runtime } from "./runtime.js";

const THOUSAND_SEPERATOR =
  new Intl.NumberFormat().format(1111).replaceAll("1", "").at(0) || "";

const DECIMAL_SEPERATOR = new Intl.NumberFormat()
  .format(1.1)
  .replaceAll("1", "")
  .at(0);

const isZHInGameSetting = localStorage
  .getItem("i18nextLng")
  ?.toLowerCase()
  ?.startsWith("zh");
// 获取游戏内设置语言
let isZH = isZHInGameSetting;
// MWITools 本身显示的语言默认由游戏内设置语言决定

/* 自定义插件字体颜色 */
/* 找颜色自行网上搜索"CSS颜色" */
/* 可以是颜色名称，比如"red"；也可以是颜色Hex，比如"#ED694D" */
// Customization
let SCRIPT_COLOR_MAIN = "green";
// 脚本主要字体颜色
let SCRIPT_COLOR_TOOLTIP = "darkgreen";
// 物品悬浮窗的字体颜色
const SCRIPT_COLOR_ALERT = "red";

let settingsMap = {
  useOrangeAsMainColor: {
    id: "useOrangeAsMainColor",
    desc: isZH
      ? "使用橙色字体"
      : "Use orange as the main color for the script.",
    isTrue: true,
  },
  displayCapMM: {
    id: "displayCapMM",
    desc: isZH
      ? "限制最高支持M量级（之前最高B量级）"
      : "Values are capped at the million level, which used to be billion.",
    isTrue: false,
  },
  totalActionTime: {
    id: "totalActionTime",
    desc: isZH
      ? "左上角显示：当前动作预计总耗时、预计何时完成"
      : "Top left: Estimated total time of the current action, estimated complete time.",
    isTrue: true,
  },
  actionPanel_totalTime: {
    id: "actionPanel_totalTime",
    desc: isZH
      ? "动作面板显示：动作预计总耗时、到多少级还需做多少次、每小时经验"
      : "Action panel: Estimated total time of the action, times needed to reach a target skill level, exp/hour.",
    isTrue: true,
  },
  actionPanel_totalTime_quickInputs: {
    id: "actionPanel_totalTime_quickInputs",
    desc: isZH
      ? "动作面板显示：快速输入次数 [依赖上一项]"
      : "Action panel: Quick input numbers. [Depends on the previous selection]",
    isTrue: true,
  },
  actionPanel_foragingTotal: {
    id: "actionPanel_foragingTotal",
    desc: isZH
      ? "动作面板显示：采摘综合图显示综合收益 [依赖上一项]"
      : "Action panel: Overall profit of the foraging maps with multiple outcomes. [Depends on the previous selection]",
    isTrue: true,
  },
  networth: {
    id: "networth",
    desc: isZH
      ? "右上角显示：按服务器市场价值计算的流动资产"
      : "Top right: Current assets valued with server market values.",
    isTrue: true,
  },
  invWorth: {
    id: "invWorth",
    desc: isZH
      ? "仓库搜索栏下方显示：仓库和战力总结 [依赖上一项]"
      : "Below inventory search bar: Inventory and character summery. [Depends on the previous selection]",
    isTrue: true,
  },
  invSort: {
    id: "invSort",
    desc: isZH
      ? "仓库显示：仓库物品排序 [依赖上一项]"
      : "Inventory: Sort inventory items. [Depends on the previous selection]",
    isTrue: true,
  },
  guildCreditConversionsSort: {
    id: "guildCreditConversionsSort",
    desc: isZH
      ? "工会信用兑换：公会信用兑换选择排序"
      : "Guild Credit Exchange: Sort Guild Credit Exchange Options.",
    isTrue: true,
  },
  profileBuildScore: {
    id: "profileBuildScore",
    desc: isZH ? "人物面板显示：战力分" : "Profile panel: Build score.",
    isTrue: true,
  },
  itemTooltip_prices: {
    id: "itemTooltip_prices",
    desc: isZH
      ? "物品悬浮窗显示：服务器市场价值和订单簿价格"
      : "Item tooltip: Server market value and orderbook prices.",
    isTrue: true,
  },
  itemTooltip_profit: {
    id: "itemTooltip_profit",
    desc: isZH
      ? "物品悬浮窗显示：生产成本和利润计算 [依赖上一项]"
      : "Item tooltip: Production cost and profit. [Depends on the previous selection]",
    isTrue: true,
  },
  showConsumTips: {
    id: "showConsumTips",
    desc: isZH
      ? "物品悬浮窗显示：消耗品回血回魔速度、回复性价比、每天最多消耗数量"
      : "Item tooltip: HP/MP consumables restore speed, cost performance, max cost per day.",
    isTrue: true,
  },
  networkAlert: {
    id: "networkAlert",
    desc: isZH
      ? "右上角显示：无法联网更新市场数据时，红字警告"
      : "Top right: Alert message when market price data can not be fetched.",
    isTrue: true,
  },
  expPercentage: {
    id: "expPercentage",
    desc: isZH
      ? "左侧栏显示：技能经验百分比"
      : "Left sidebar: Percentages of exp of the skill levels.",
    isTrue: true,
  },
  battlePanel: {
    id: "battlePanel",
    desc: isZH
      ? "战斗总结面板（战斗时点击玩家头像）显示：平均每小时战斗次数、收入、经验"
      : "Battle info panel(click on player avatar during combat): Encounters/hour, revenue, exp.",
    isTrue: true,
  },
  itemIconLevel: {
    id: "itemIconLevel",
    desc: isZH
      ? "装备图标右上角显示：装备等级"
      : "Top right corner of equipment icons: Equipment level.",
    isTrue: true,
  },
  showsKeyInfoInIcon: {
    id: "showsKeyInfoInIcon",
    desc: isZH
      ? "钥匙和钥匙碎片图标右上角显示：对应的地图序号 [依赖上一项]"
      : "Top right corner of key/fragment icons: Corresponding combat zone index number. [Depends on the previous selection]",
    isTrue: true,
  },
  marketFilter: {
    id: "marketFilter",
    desc: isZH
      ? "市场页面显示：装备按等级、职业、部位筛选"
      : "Marketplace: Filter by equipment level, class, slot.",
    isTrue: true,
  },
  taskMapIndex: {
    id: "taskMapIndex",
    desc: isZH
      ? "任务页面显示：目标战斗地图序号"
      : "Tasks page: Combat zone index number.",
    isTrue: true,
  },
  mapIndex: {
    id: "mapIndex",
    desc: isZH
      ? "战斗地图选择页面显示：地图序号"
      : "Combat zones page: Combat zone index number.",
    isTrue: true,
  },
  skillbook: {
    id: "skillbook",
    desc: isZH
      ? "技能书的物品词典面板显示：到多少级还需要多少本技能书"
      : "Item dictionary of skill books: Number of books needed to reach target skill level.",
    isTrue: true,
  },
  ThirdPartyLinks: {
    id: "ThirdPartyLinks",
    desc: isZH
      ? "左侧菜单栏显示：第三方工具网站链接、脚本设置链接"
      : "Left sidebar: Links to 3rd-party websites, script settings.",
    isTrue: true,
  },
  actionQueue: {
    id: "actionQueue",
    desc: isZH
      ? "上方动作队列菜单显示：队列中每个动作预计总时间、到何时完成"
      : "Queued actions panel at the top: Estimated total time and complete time of each queued action.",
    isTrue: true,
  },
  enhanceSim: {
    id: "enhanceSim",
    desc: isZH
      ? "带强化等级的装备的悬浮菜单显示：强化模拟计算"
      : "Tooltip of equipment with enhancement level: Enhancing simulator calculations.",
    isTrue: true,
  },
  checkEquipment: {
    id: "checkEquipment",
    desc: isZH
      ? "页面上方显示：战斗时穿了生产装备，或者生产时没有穿对应的生产装备而仓库里有，红字警告"
      : "Top: Alert message when combating with production equipments equipted, or producing when there are unequipted corresponding production equipment in the inventory.",
    isTrue: true,
  },
  notifiEmptyAction: {
    id: "notifiEmptyAction",
    desc: isZH
      ? "弹窗通知：正在空闲（游戏网页打开时才有效）"
      : "Browser notification: Action queue is empty. (Works only when the game page is open.)",
    isTrue: false,
  },
  fillMarketOrderPrice: {
    id: "fillMarketOrderPrice",
    desc: isZH
      ? "发布市场订单时自动填写为最小压价"
      : "Automatically input price with the smallest increasement/decreasement when posting marketplace bid/sell orders.",
    isTrue: true,
  },
  showDamage: {
    id: "showDamage",
    desc: isZH
      ? "战斗时，人物头像下方显示：伤害统计数字"
      : "Bottom of player avatar during combat: DPS.",
    isTrue: true,
  },
  showDamageGraph: {
    id: "showDamageGraph",
    desc: isZH
      ? "战斗时，悬浮窗显示：伤害统计图表 [依赖上一项]"
      : "Floating window during combat: DPS chart. [Depends on the previous selection]",
    isTrue: true,
  },
  damageGraphTransparentBackground: {
    id: "damageGraphTransparentBackground",
    desc: isZH
      ? "伤害统计图表背景透明 [依赖上一项]"
      : "DPS chart transparent and blur background. [Depends on the previous selection]",
    isTrue: true,
  },
  forceMWIToolsDisplayZH: {
    id: "forceMWIToolsDisplayZH",
    desc: isZH
      ? "MWITools本身强制显示中文 MWITools always in Chinese"
      : "MWITools本身强制显示中文 MWITools always in Chinese",
    isTrue: false,
  },
};

Object.defineProperties(runtime.config, {
  THOUSAND_SEPERATOR: {
    enumerable: true,
    get() {
      return THOUSAND_SEPERATOR;
    },
  },
  DECIMAL_SEPERATOR: {
    enumerable: true,
    get() {
      return DECIMAL_SEPERATOR;
    },
  },
  isZHInGameSetting: {
    enumerable: true,
    get() {
      return isZHInGameSetting;
    },
  },
  isZH: {
    enumerable: true,
    get() {
      return isZH;
    },
    set(value) {
      isZH = value;
    },
  },
  SCRIPT_COLOR_MAIN: {
    enumerable: true,
    get() {
      return SCRIPT_COLOR_MAIN;
    },
    set(value) {
      SCRIPT_COLOR_MAIN = value;
    },
  },
  SCRIPT_COLOR_TOOLTIP: {
    enumerable: true,
    get() {
      return SCRIPT_COLOR_TOOLTIP;
    },
    set(value) {
      SCRIPT_COLOR_TOOLTIP = value;
    },
  },
  SCRIPT_COLOR_ALERT: {
    enumerable: true,
    get() {
      return SCRIPT_COLOR_ALERT;
    },
  },
  MARKET_API_URL: {
    enumerable: true,
    get() {
      return runtime.api.getMarketApiUrl?.() ?? "";
    },
  },
});

Object.defineProperties(runtime.settings, {
  settingsMap: {
    enumerable: true,
    get() {
      return settingsMap;
    },
    set(value) {
      settingsMap = value;
    },
  },
});

runtime.registerStart("core/config.js", () => {
  // 警告字体颜色

  console.log(window.location.href);
});
