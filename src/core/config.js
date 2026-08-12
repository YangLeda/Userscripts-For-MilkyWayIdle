import { runtime } from "./runtime.js";

function getGameLanguage() {
  const storedLanguage = localStorage.getItem("i18nextLng")?.trim();
  if (storedLanguage) return storedLanguage;
  return (
    globalThis.document?.documentElement?.lang ||
    globalThis.navigator?.language ||
    "en-US"
  );
}

function getGameNumberLocale() {
  const candidate = getGameLanguage().replaceAll("_", "-");
  try {
    return Intl.NumberFormat.supportedLocalesOf([candidate])[0] ?? "en-US";
  } catch {
    return "en-US";
  }
}

function getGameNumberSeparators() {
  const parts = new Intl.NumberFormat(getGameNumberLocale()).formatToParts(
    1_111.1,
  );
  return {
    thousand: parts.find((part) => part.type === "group")?.value ?? "",
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
  };
}

function isGameLanguageZH() {
  return getGameLanguage().toLowerCase().startsWith("zh");
}

// i18nextLng is the language selected in the game. Read it dynamically so
// action dialogs keep working after the player changes the game language.
let isZH = isGameLanguageZH();
// MWITools 本身显示的语言默认由游戏内设置语言决定

/* 自定义插件字体颜色 */
/* 找颜色自行网上搜索"CSS颜色" */
/* 可以是颜色名称，比如"red"；也可以是颜色Hex，比如"#ED694D" */
// Customization
let SCRIPT_COLOR_MAIN = "green";
// 脚本主要字体颜色
let SCRIPT_COLOR_TOOLTIP = "darkgreen";
// 物品悬浮窗的字体颜色

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
      ? "大数统一使用 M，不显示 B 或 T"
      : "Keep large values in millions instead of using B or T.",
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
      ? "动作面板显示：目标等级所需次数、预计耗时和每小时经验"
      : "Action panel: Actions and time needed for a target level, plus XP/hour.",
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
  assetHistory: {
    id: "assetHistory",
    desc: isZH
      ? "库存页签显示：每日资产盈亏、历史图表和数据管理"
      : "Inventory tabs: Daily asset P/L, history charts, and data management.",
    isTrue: true,
  },
  feedback: {
    id: "feedback",
    desc: isZH
      ? "总等级下方显示意见中心入口"
      : "Show the Feedback Center below total level.",
    isTrue: true,
  },
  invWorth: {
    id: "invWorth",
    desc: isZH
      ? "库存搜索栏下方显示：库存和着装评分总结"
      : "Below inventory search bar: Inventory and gear score summary.",
    isTrue: true,
  },
  includeCowbellsInAssets: {
    id: "includeCowbellsInAssets",
    desc: isZH ? "总资产计入牛铃" : "Include cowbells in total assets.",
    isTrue: false,
  },
  valueBackEquipmentWithProtectionMirror: {
    id: "valueBackEquipmentWithProtectionMirror",
    desc: isZH
      ? "普通未强化背部装备按保护之镜价值估值"
      : "Value ordinary unenhanced back equipment using Mirrors of Protection.",
    isTrue: false,
  },
  invSort: {
    id: "invSort",
    desc: isZH ? "库存显示：库存物品排序" : "Inventory: Sort inventory items.",
    isTrue: true,
  },
  guildCreditConversionsSort: {
    id: "guildCreditConversionsSort",
    desc: isZH
      ? "公会信用兑换：显示性价比推荐"
      : "Guild Credit Exchange: Show value recommendations.",
    isTrue: true,
  },
  profileBuildScore: {
    id: "profileBuildScore",
    desc: isZH
      ? "人物面板显示：战斗和生活着装评分"
      : "Profile panel: Combat and skilling gear scores.",
    isTrue: true,
  },
  itemTooltip_prices: {
    id: "itemTooltip_prices",
    desc: isZH
      ? "物品悬浮窗显示：市场价值和订单簿价格"
      : "Item tooltip: Market value and order book prices.",
    isTrue: true,
  },
  itemTooltip_profit: {
    id: "itemTooltip_profit",
    desc: isZH
      ? "物品悬浮窗显示：生产成本和利润计算 [依赖上一项]"
      : "Item tooltip: Production cost and profit. [Depends on the previous selection]",
    isTrue: true,
  },
  itemTooltip_profitRequireKey: {
    id: "itemTooltip_profitRequireKey",
    desc: isZH
      ? "生产利润和宝箱估算需要同时按住自定义按键"
      : "Require a shared custom held key for production profit and loot chest estimates.",
    isTrue: true,
  },
  lootChestEstimate: {
    id: "lootChestEstimate",
    desc: isZH
      ? "战利品宝箱悬浮窗显示开箱期望价值"
      : "Show expected opening value for loot chests.",
    isTrue: true,
  },
  lootSellAtAsk: {
    id: "lootSellAtAsk",
    desc: isZH
      ? "宝箱产物按卖单挂单价格估值；关闭则按买单立即卖出"
      : "Value chest drops at ask; off values immediate sales at bid.",
    isTrue: false,
  },
  lootBuyAtAsk: {
    id: "lootBuyAtAsk",
    desc: isZH
      ? "钥匙和碎片按卖单立即买入；关闭则按买单挂单买入"
      : "Buy keys and fragments at ask; off values bid buy orders.",
    isTrue: true,
  },
  lootKeyFromFragments: {
    id: "lootKeyFromFragments",
    desc: isZH
      ? "钥匙按碎片自制成本计算；关闭则按成品钥匙买入价"
      : "Use fragment crafting cost for keys; off buys finished keys.",
    isTrue: false,
  },
  lootIgnoreCowbells: {
    id: "lootIgnoreCowbells",
    desc: isZH
      ? "宝箱估值忽略牛铃及牛铃袋的价值"
      : "Ignore Cowbell and Cowbell Bag value in loot estimates.",
    isTrue: false,
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
      ? "在物品词典显示实时技能书升级需求"
      : "Show live ability-book requirements in the item dictionary.",
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
      ? "页面上方显示：战斗时穿了生产装备，或者生产时没有穿对应的生产装备而库存里有，红字警告"
      : "Top: Alert when fighting with production equipment equipped, or producing while matching equipment is unequipped in inventory.",
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
      : "Automatically adjust to the smallest price increase or decrease when posting marketplace orders.",
    isTrue: true,
  },
  showDamage: {
    id: "showDamage",
    desc: isZH
      ? "启用新版 DPS、HPS、承伤、战斗片段与历史统计"
      : "Enable DPS, HPS, damage-taken, segment, and combat history tracking.",
    isTrue: true,
  },
  battleBuffs: {
    id: "battleBuffs",
    desc: isZH
      ? "在战斗单位下方显示 Buff / Debuff 图标和倒计时"
      : "Show buff and debuff icons with countdowns below combat units.",
    isTrue: true,
  },
  actionBarProfit: {
    id: "actionBarProfit",
    desc: isZH ? "动作栏显示净利润" : "Show net profit in the action bar.",
    isTrue: true,
  },
  productionSummary: {
    id: "productionSummary",
    desc: isZH
      ? "生产面板显示产出、库存和最大可做次数"
      : "Show output, inventory, and maximum craftable count.",
    isTrue: true,
  },
  productionProfit: {
    id: "productionProfit",
    desc: isZH ? "生产面板显示净利润" : "Show net profit in production panels.",
    isTrue: true,
  },
  procurementAssistant: {
    id: "procurementAssistant",
    desc: isZH
      ? "启用购物车、采购计划和生产缺料加购"
      : "Enable the shopping cart, procurement plans, and production shortage actions.",
    isTrue: true,
  },
  taskInsights: {
    id: "taskInsights",
    desc: isZH
      ? "启用平铺任务布局、排序和筛选"
      : "Enable the flat task layout, sorting, and filters.",
    isTrue: true,
  },
  semiAutoTrain: {
    id: "semiAutoTrain",
    desc: isZH
      ? "生产升级链显示半自动火车、逐站预填和本步加购"
      : "Show semi-automatic train navigation, step prefilling, and step shopping.",
    isTrue: true,
  },
  taskTrainPlanner: {
    id: "taskTrainPlanner",
    desc: isZH
      ? "任务页按升级链合并任务并规划火车（依赖半自动火车）"
      : "Plan task upgrade trains by chain (requires the semi-automatic train).",
    isTrue: true,
  },
  taskNewBadge: {
    id: "taskNewBadge",
    desc: isZH
      ? "新领取任务置顶并显示高亮和新角标"
      : "Pin and highlight newly received tasks.",
    isTrue: true,
  },
  taskAutoReturn: {
    id: "taskAutoReturn",
    desc: isZH
      ? "从任务前往动作后自动返回原任务位置"
      : "Return to the originating task after leaving its action.",
    isTrue: true,
  },
  inventoryMarketDoubleClick: {
    id: "inventoryMarketDoubleClick",
    desc: isZH
      ? "双击库存物品打开对应市场窗口（货币、战利品除外）"
      : "Double-click inventory items to open the market (except currencies and loot).",
    isTrue: true,
  },
  taskMaterials: {
    id: "taskMaterials",
    desc: isZH
      ? "任务显示现有材料可完成数量"
      : "Show how much of a task your materials can complete.",
    isTrue: true,
  },
  taskQueueProgress: {
    id: "taskQueueProgress",
    desc: isZH ? "任务显示队列进度" : "Show queued task progress.",
    isTrue: true,
  },
  taskAutoSort: {
    id: "taskAutoSort",
    desc: isZH ? "自动整理任务顺序" : "Automatically organize tasks.",
    isTrue: true,
  },
  taskIcons: {
    id: "taskIcons",
    desc: isZH ? "任务卡显示物品或怪物图标" : "Show item or monster task art.",
    isTrue: true,
  },
  taskStatistics: {
    id: "taskStatistics",
    desc: isZH
      ? "任务页显示专业、战斗和副本统计筛选栏"
      : "Show profession, combat, and dungeon task filters.",
    isTrue: true,
  },
  taskClaimCollector: {
    id: "taskClaimCollector",
    desc: isZH ? "集中显示可领取奖励" : "Collect claim buttons at the top.",
    isTrue: true,
  },
  taskMergeActions: {
    id: "taskMergeActions",
    desc: isZH ? "合并相同动作任务数量" : "Merge matching task quantities.",
    isTrue: true,
  },
  guildXpTracking: {
    id: "guildXpTracking",
    desc: isZH ? "在本机记录公会经验" : "Track guild XP locally.",
    isTrue: true,
  },
  guildOverview: {
    id: "guildOverview",
    desc: isZH ? "公会总览显示经验趋势" : "Show guild XP trends.",
    isTrue: true,
  },
  guildMemberXp: {
    id: "guildMemberXp",
    desc: isZH ? "成员表显示每小时经验" : "Show XP rates for guild members.",
    isTrue: true,
  },
  guildLeaderboardXp: {
    id: "guildLeaderboardXp",
    desc: isZH
      ? "公会榜显示每小时经验"
      : "Show XP rates on the guild leaderboard.",
    isTrue: true,
  },
  guildIdleMembers: {
    id: "guildIdleMembers",
    desc: isZH ? "公会总览显示闲置成员" : "Show idle guild members.",
    isTrue: true,
  },
  leaderboardOverlay: {
    id: "leaderboardOverlay",
    desc: isZH
      ? "角色名字旁显示排行榜名次徽章"
      : "Show leaderboard rank badges beside character names.",
    isTrue: true,
  },
  leaderboardXpRate: {
    id: "leaderboardXpRate",
    desc: isZH
      ? "排行榜显示每小时经验速率"
      : "Show XP rates on standard leaderboards.",
    isTrue: true,
  },
  forceMWIToolsDisplayZH: {
    id: "forceMWIToolsDisplayZH",
    desc: isZH ? "MWITools 强制显示中文" : "Always display MWITools in Chinese",
    isTrue: false,
  },
  adaptIronCowMarketFeatures: {
    id: "adaptIronCowMarketFeatures",
    desc: isZH
      ? "铁牛角色隐藏不可用的市场与利润功能"
      : "Hide unavailable marketplace and profit features for Iron Cow characters.",
    isTrue: false,
  },
};

const settingsGroups = {
  general: {
    title: { zh: "通用", en: "General" },
    summary: {
      zh: "控制 MWITools 的语言、外观、通知和常用入口。",
      en: "Control MWITools language, appearance, notifications, and shortcuts.",
    },
  },
  actionBar: {
    title: { zh: "动作栏", en: "Action Bar" },
    summary: {
      zh: "在顶部查看当前动作还剩多少次、还需多久以及预计完成时间。",
      en: "See the current action's remaining count, time left, and estimated finish time.",
    },
  },
  production: {
    title: { zh: "生产面板", en: "Production Panel" },
    summary: {
      zh: "输入次数后立即查看耗时、产出、库存上限和利润。",
      en: "Preview time, output, inventory limits, and profit as you enter a quantity.",
    },
  },
  inventory: {
    title: { zh: "库存与资产", en: "Inventory & Assets" },
    summary: {
      zh: "整理库存，并按统一价格口径查看装备和总资产。",
      en: "Organize inventory and value gear and assets with consistent pricing.",
    },
  },
  market: {
    title: { zh: "市场", en: "Marketplace" },
    summary: {
      zh: "显示市场价格、筛选装备，并减少重复下单操作。",
      en: "Show market prices, filter equipment, and streamline order entry.",
    },
  },
  tasks: {
    title: { zh: "任务", en: "Tasks" },
    summary: {
      zh: "按专业整理任务；已完成任务置顶，战斗任务再按地图和地牢归类。",
      en: "Group tasks by profession, pin completed tasks, and organize combat by zone or dungeon.",
    },
  },
  combat: {
    title: { zh: "战斗", en: "Combat" },
    summary: {
      zh: "查看战斗收益、实时伤害、地图编号和装备提醒。",
      en: "Review combat rewards, live damage, zone numbers, and equipment warnings.",
    },
  },
  guild: {
    title: { zh: "公会", en: "Guild" },
    summary: {
      zh: "只在本机记录经验快照，展示公会进度和成员速率。",
      en: "Store XP snapshots locally to show guild progress and member rates.",
    },
  },
  leaderboard: {
    title: { zh: "排行榜与排名", en: "Leaderboards & Rankings" },
    summary: {
      zh: "在角色名字旁展示技能排名，并增强排行榜数据。",
      en: "Show skill ranks beside character names and enhance leaderboard data.",
    },
  },
  tools: {
    title: { zh: "外部工具", en: "External Tools" },
    summary: {
      zh: "连接战斗模拟器、计算器和第三方数据页面。",
      en: "Connect combat simulators, calculators, and third-party data tools.",
    },
  },
};

const catalogRows = [
  [
    "feedback",
    "general",
    "意见中心",
    "Feedback Center",
    "查看版本公告、提交意见，并通过红点关注反馈回复。",
    "Read release announcements, submit feedback, and follow replies with a notification dot.",
  ],
  [
    "forceMWIToolsDisplayZH",
    "general",
    "强制使用中文",
    "Always use Chinese",
    "无论游戏语言如何，都用中文显示 MWITools。",
    "Display MWITools in Chinese regardless of the game language.",
  ],
  [
    "useOrangeAsMainColor",
    "general",
    "使用橙色强调色",
    "Use orange accents",
    "让辅助信息更贴近游戏的暖色主题。",
    "Use a warm accent color for MWITools information.",
  ],
  [
    "displayCapMM",
    "general",
    "大数只显示 M",
    "Show large values in M",
    "开启后，十亿和万亿数值继续换算为 M，例如 1.2B 显示为 1,200M；关闭时正常使用 K/M/B/T。",
    "When enabled, billions and trillions stay in millions; for example, 1.2B is shown as 1,200M. When disabled, K/M/B/T are used normally.",
  ],
  [
    "notifiEmptyAction",
    "general",
    "空闲提醒",
    "Idle notification",
    "动作队列清空时发送浏览器通知；游戏页面需要保持打开。",
    "Send a browser notification when the action queue becomes empty while the game is open.",
  ],
  [
    "adaptIronCowMarketFeatures",
    "general",
    "铁牛模式适配",
    "Iron Cow mode adaptation",
    "铁牛角色隐藏市场价格、交易利润和市场采购操作；资产与宝箱估值仍保留。",
    "Hide marketplace prices, trading profit, and marketplace procurement for Iron Cow characters while retaining asset and loot valuations.",
  ],
  [
    "expPercentage",
    "general",
    "技能经验百分比",
    "Skill XP percentage",
    "在左侧技能进度条上显示当前等级的经验百分比。",
    "Show progress through the current level on skill bars.",
  ],
  [
    "totalActionTime",
    "actionBar",
    "当前动作时间",
    "Current action timing",
    "在顶部显示剩余次数、剩余时间和预计完成时刻。",
    "Show remaining count, time remaining, and estimated completion time.",
  ],
  [
    "actionBarProfit",
    "actionBar",
    "当前动作利润",
    "Current action profit",
    "在顶部动作栏显示当前生产动作的市价净利润。",
    "Show market-value net profit for the current production action in the action bar.",
  ],
  [
    "actionQueue",
    "actionBar",
    "完整队列时间",
    "Full queue timing",
    "计算队列中每项动作的耗时、累计完成时刻和最终结束时间。",
    "Calculate each queued action, cumulative completion times, and the final queue end time.",
  ],
  [
    "actionPanel_totalTime",
    "production",
    "目标等级与经验",
    "Target level & XP",
    "输入目标等级，查看还需多少次、预计耗时和每小时经验。",
    "Enter a target level to see required actions, estimated time, and XP/hour.",
  ],
  [
    "actionPanel_totalTime_quickInputs",
    "production",
    "生产次数快捷输入",
    "Production quick inputs",
    "在生产次数输入框旁提供常用次数和时长快捷按钮；依赖目标等级与经验功能。",
    "Add common count and duration shortcuts beside the production input; depends on Target level & XP.",
  ],
  [
    "productionSummary",
    "production",
    "产出与库存摘要",
    "Output & inventory summary",
    "实时显示总产出、当前拥有数量和按直接材料计算的最大可做次数。",
    "Show total output, owned quantity, and the maximum craftable count from direct materials.",
  ],
  [
    "productionProfit",
    "production",
    "生产净利润",
    "Production net profit",
    "同时显示市价、效率（高买低卖）和贪心（低买高卖）三种税后收入、成本与净利润。",
    "Show after-tax revenue, costs, and net profit for market, efficiency (buy high/sell low), and greedy (buy low/sell high) valuations.",
  ],
  [
    "procurementAssistant",
    "production",
    "购物车与采购",
    "Shopping cart & procurement",
    "控制购物车入口、采购计划、生产缺料提示和市场采购导航；关闭后相关界面会立即移除，已有清单数据仍保留。",
    "Control the shopping cart, procurement plans, production shortage hints, and marketplace navigation. Turning it off removes the related UI while preserving saved cart data.",
  ],
  [
    "actionPanel_foragingTotal",
    "production",
    "多产物采集收益",
    "Multi-output gathering value",
    "把同一采集动作的多个可能产物合并成期望收益。",
    "Combine multiple possible gathering outputs into an expected value.",
  ],
  [
    "assetHistory",
    "inventory",
    "每日资产盈亏",
    "Daily asset P/L",
    "在配装右侧显示资产摘要、分项变化、历史图表和数据管理。",
    "Show asset summary, component changes, history charts, and data management beside Loadouts.",
  ],
  [
    "inventoryMarketDoubleClick",
    "inventory",
    "双击打开市场",
    "Double-click to market",
    "双击库存物品打开对应市场窗口；货币和战利品不响应。",
    "Double-click an inventory item to open it in the marketplace; currencies and loot are excluded.",
  ],
  [
    "invWorth",
    "inventory",
    "总资产与着装评分",
    "Assets & gear scores",
    "在库存上方显示战斗评分、生活评分以及流动和固定资产明细。",
    "Show combat and skilling scores plus current and fixed asset details above inventory.",
  ],
  [
    "includeCowbellsInAssets",
    "inventory",
    "牛铃计入总资产",
    "Include cowbells in assets",
    "开启后，牛铃按市场折算价值计入不可交易代币和总资产；默认关闭。",
    "Include cowbells at their market-derived value under non-tradable tokens and total assets. Off by default.",
  ],
  [
    "valueBackEquipmentWithProtectionMirror",
    "inventory",
    "普通背部装备按保护之镜估值",
    "Value ordinary back equipment by protection mirrors",
    "开启后，未强化、未精炼的普通背部装备（包括披风、箭袋等）按保护之镜的当前价值估值；默认关闭。所有强化背部装备（包括精炼后的背部装备）在计算强化成本时始终使用保护之镜，不受此开关影响。",
    "When enabled, ordinary unenhanced and unrefined back-slot equipment, including capes and quivers, uses the current value of a Mirror of Protection. Off by default. All enhanced back equipment, including refined back equipment, always uses Mirrors of Protection for enhancement costs regardless of this option.",
  ],
  [
    "invSort",
    "inventory",
    "按价值整理库存",
    "Sort inventory by value",
    "可按市场价值、出售价或收购价整理库存，并显示整堆价值。",
    "Sort inventory by server value, ask, or bid and show each stack value.",
  ],
  [
    "profileBuildScore",
    "inventory",
    "人物着装评分",
    "Profile gear scores",
    "查看自己或他人的战斗与生活着装评分。",
    "Show combat and skilling gear scores on character profiles.",
  ],
  [
    "itemIconLevel",
    "inventory",
    "装备等级角标",
    "Equipment level badges",
    "在装备图标角落显示物品等级。",
    "Show item level on equipment icons.",
  ],
  [
    "showsKeyInfoInIcon",
    "inventory",
    "钥匙地图编号",
    "Key zone numbers",
    "在钥匙和碎片图标上显示对应战斗地图编号。",
    "Show the related combat zone number on keys and fragments.",
  ],
  [
    "itemTooltip_prices",
    "market",
    "悬浮价格",
    "Tooltip prices",
    "在物品悬浮窗显示市场价值和当前出售价、收购价。",
    "Show server value and current ask and bid prices in item tooltips.",
  ],
  [
    "itemTooltip_profit",
    "market",
    "悬浮生产利润",
    "Tooltip production profit",
    "在可生产物品的悬浮窗显示材料成本和预计利润。",
    "Show material cost and estimated profit for craftable items.",
  ],
  [
    "itemTooltip_profitRequireKey",
    "market",
    "悬浮扩展面板需要按键",
    "Require key for tooltip panels",
    "生产利润和宝箱估算在桌面端共用一个自定义单键；移动端均需长按。",
    "Use one shared custom held key for production profit and loot chest estimates on desktop; use a long press on touch devices.",
  ],
  [
    "lootChestEstimate",
    "market",
    "宝箱价值估算",
    "Loot chest estimate",
    "在战利品宝箱悬浮窗显示概率加权的开箱期望，并可固定面板调整估值方式。",
    "Show probability-weighted opening value for loot chests and pin the panel to adjust valuation.",
  ],
  [
    "lootSellAtAsk",
    "market",
    "宝箱产物挂单卖出",
    "List chest drops at ask",
    "开启：按卖单挂单价估值；关闭：按买单立即卖出价估值。",
    "On: value drops at ask; off: value immediate sales at bid.",
  ],
  [
    "lootBuyAtAsk",
    "market",
    "钥匙材料立即买入",
    "Buy key materials immediately",
    "开启：按卖单立即买入钥匙或碎片；关闭：按买单挂单买入。",
    "On: buy keys or fragments at ask; off: place buy orders at bid.",
  ],
  [
    "lootKeyFromFragments",
    "market",
    "钥匙碎片自制",
    "Craft keys from fragments",
    "开启：按实际配方、工匠减耗、浓缩倍率和泡饮成本自制钥匙；关闭：购买成品钥匙。",
    "On: craft keys using the recipe, Artisan reduction, concentration, and drink costs; off: buy finished keys.",
  ],
  [
    "lootIgnoreCowbells",
    "market",
    "宝箱估值忽略牛铃",
    "Ignore Cowbells in loot",
    "开启后，所有直接或嵌套宝箱中的牛铃和牛铃袋均保留掉落显示，但价值按零计算。",
    "Keep Cowbell and Cowbell Bag drops visible but value them at zero in direct and nested loot estimates.",
  ],
  [
    "marketFilter",
    "market",
    "装备筛选",
    "Equipment filters",
    "在市场按等级、战斗职业和装备部位筛选物品。",
    "Filter marketplace equipment by level, combat class, and slot.",
  ],
  [
    "fillMarketOrderPrice",
    "market",
    "自动填写订单价格",
    "Auto-fill order prices",
    "创建订单时按最小有效档位匹配或压过当前最优价格。",
    "Fill the smallest valid price step that matches or improves the current best order.",
  ],
  [
    "taskInsights",
    "tasks",
    "平铺任务布局",
    "Flat task layout",
    "按新任务、已完成、普通任务和专业顺序平铺显示；战斗任务统一置底并按地图排序。",
    "Show a flat list ordered by new, completed, and normal tasks, with combat last and sorted by zone.",
  ],
  [
    "semiAutoTrain",
    "tasks",
    "半自动火车",
    "Semi-automatic train",
    "沿制造与升级链逐站跳转、预填次数；点击游戏原生加入队列后前往下一站，并可把本步净缺料加入购物车。",
    "Navigate production and upgrade chains, prefill counts, advance after the native queue action, and add each stop's net shortages to the cart.",
  ],
  [
    "taskTrainPlanner",
    "tasks",
    "任务火车规划",
    "Task train planning",
    "聚合同一升级链的未完成任务，在最高级任务卡生成火车计划；依赖半自动火车。",
    "Combine unfinished tasks from the same upgrade chain and start the plan from its highest-level task; requires the semi-automatic train.",
  ],
  [
    "taskNewBadge",
    "tasks",
    "新任务置顶与标记",
    "New task group and badges",
    "本次进入任务页期间，将新领取任务置于最顶部的新任务分类并显示黄色角标；再次进入任务页时恢复正常分类。",
    "Place newly received tasks in a highlighted top group for the current task-page visit, then restore their normal groups on the next visit.",
  ],
  [
    "taskAutoReturn",
    "tasks",
    "任务自动返回",
    "Task auto-return",
    "从任务卡前往动作后，在提交或关闭动作时返回原任务分类和位置。",
    "Return to the originating task group and position after submitting or closing its action.",
  ],
  [
    "taskMaterials",
    "tasks",
    "任务材料完成量",
    "Task material capacity",
    "根据库存中的直接材料显示每项任务当前可完成的数量。",
    "Show how much of each task can be completed from current direct-material inventory.",
  ],
  [
    "taskQueueProgress",
    "tasks",
    "任务队列进度",
    "Task queue progress",
    "在任务卡上显示已经进入动作队列的数量和进度。",
    "Show the quantity and progress already placed in the action queue on task cards.",
  ],
  [
    "taskAutoSort",
    "tasks",
    "自动整理任务",
    "Automatically organize tasks",
    "在每个专业分组内部按等级和生产链整理任务。",
    "Sort tasks within each profession by level and production chain.",
  ],
  [
    "taskIcons",
    "tasks",
    "任务背景图标",
    "Task artwork",
    "用低透明度原生图标标识任务物品、怪物和副本。",
    "Use subtle native item, monster, and dungeon artwork on task cards.",
  ],
  [
    "taskStatistics",
    "tasks",
    "任务统计筛选栏",
    "Task statistics filters",
    "显示全部任务、十个生活专业、战斗和四个副本的数量，并可按图标筛选。",
    "Show counts for all tasks, ten professions, combat, and four dungeons, with icon filters.",
  ],
  [
    "taskClaimCollector",
    "tasks",
    "集中领取任务奖励",
    "Collect task rewards",
    "把当前可领取任务集中显示在任务页顶部，减少逐项查找。",
    "Collect currently claimable tasks at the top of the task page for faster claiming.",
  ],
  [
    "taskMergeActions",
    "tasks",
    "合并相同任务动作",
    "Merge matching task actions",
    "打开动作时自动把多个相同任务的剩余数量合并到输入框。",
    "Pre-fill the combined remaining quantity for matching active tasks.",
  ],
  [
    "taskMapIndex",
    "tasks",
    "战斗任务地图编号",
    "Combat task zone number",
    "在战斗任务标题旁显示目标怪物所在地图编号。",
    "Show the target monster's zone number on combat tasks.",
  ],
  [
    "battlePanel",
    "combat",
    "战斗总结",
    "Combat summary",
    "战斗结束后查看遭遇次数、收益和经验速率。",
    "Review encounter, revenue, and XP rates after combat.",
  ],
  [
    "showDamage",
    "combat",
    "DPS / HPS / 承伤统计",
    "DPS / HPS / Damage Taken",
    "记录实时伤害、治疗、承伤、战斗片段和历史；详细显示选项在 DPS 面板内设置。",
    "Track damage, healing, damage taken, segments, and history; configure display details in the DPS panel.",
  ],
  [
    "battleBuffs",
    "combat",
    "战斗 Buff 显示",
    "Battle buff display",
    "在每个战斗单位下方显示增益和减益图标，带剩余时间倒计时环。",
    "Show buff and debuff icons with countdown rings below each combat unit.",
  ],
  [
    "mapIndex",
    "combat",
    "战斗地图编号",
    "Combat zone numbers",
    "在战斗地图选择页显示连续编号。",
    "Show sequential numbers in the combat zone selector.",
  ],
  [
    "checkEquipment",
    "combat",
    "错装提醒",
    "Equipment warning",
    "战斗穿生产装或生产漏穿库存中的对应装备时发出提醒。",
    "Warn about skilling gear in combat or useful unequipped gear while skilling.",
  ],
  [
    "enhanceSim",
    "combat",
    "强化模拟",
    "Enhancement simulator",
    "在强化装备悬浮窗中估算成功次数、保护策略和总成本。",
    "Estimate attempts, protection strategy, and total cost for enhanced equipment.",
  ],
  [
    "guildXpTracking",
    "guild",
    "本地记录公会经验",
    "Local guild XP tracking",
    "被动保存服务器发来的经验快照；数据只留在本机，保留 30 天。",
    "Passively store server XP snapshots on this device for 30 days.",
  ],
  [
    "guildOverview",
    "guild",
    "公会经验总览",
    "Guild XP overview",
    "显示 24 小时速率、升级时间与 6 小时滚动平均的 7 天趋势。",
    "Show the 24-hour rate, time to level, and a seven-day trend using a 6-hour rolling average.",
  ],
  [
    "guildMemberXp",
    "guild",
    "成员经验速率",
    "Member XP rates",
    "在成员表增加近 6 小时、24 小时和本周平均 XP/h。",
    "Add 6-hour, 24-hour, and this-week average XP/h columns to the member table.",
  ],
  [
    "guildLeaderboardXp",
    "guild",
    "公会榜经验速率",
    "Guild leaderboard XP rates",
    "在全服公会榜显示本机采样得到的近 6 小时和 24 小时 XP/h。",
    "Show locally sampled 6-hour and 24-hour XP/h on the guild leaderboard.",
  ],
  [
    "guildIdleMembers",
    "guild",
    "闲置成员",
    "Idle members",
    "在公会总览常显当前未进行动作的可见成员。",
    "Always show visible guild members who are not currently performing an action.",
  ],
  [
    "leaderboardOverlay",
    "leaderboard",
    "排行榜名次徽章",
    "Leaderboard rank badges",
    "在角色名字旁显示信息采集助手提供的技能与名望排行榜名次徽章。",
    "Show skill and fame leaderboard rank badges supplied by the data collector beside character names.",
  ],
  [
    "leaderboardXpRate",
    "leaderboard",
    "排行榜经验速率",
    "Leaderboard XP rates",
    "在全服技能排行榜增加可排序的经验/小时列；此开关不影响名次徽章。",
    "Add a sortable XP/hour column to standard skill leaderboards without affecting rank badges.",
  ],
  [
    "guildCreditConversionsSort",
    "guild",
    "公会信用兑换性价比推荐",
    "Guild credit exchange recommendations",
    "按市场出售价计算兑换相同信用点的真实材料成本，并比较当前方案与最优方案。",
    "Compare the selected conversion with the cheapest way to obtain the same credits using market asks.",
  ],
  [
    "ThirdPartyLinks",
    "tools",
    "第三方工具入口",
    "External tool shortcuts",
    "在左侧菜单提供模拟器、计算器和脚本设置入口。",
    "Add sidebar shortcuts for simulators, calculators, and MWITools settings.",
  ],
  [
    "skillbook",
    "tools",
    "技能书计算器",
    "Ability book calculator",
    "在物品词典实时计算技能书解锁、升级所需本数与参考购买成本。",
    "Calculate live ability-book unlock, leveling, and reference purchase requirements in the item dictionary.",
  ],
];

const settingsCatalog = Object.fromEntries(
  catalogRows.map(([id, group, zhTitle, enTitle, zhSummary, enSummary]) => [
    id,
    {
      id,
      group,
      title: { zh: zhTitle, en: enTitle },
      summary: { zh: zhSummary, en: enSummary },
      details: { zh: zhSummary, en: enSummary },
    },
  ]),
);

const settingParents = {
  actionBarProfit: "totalActionTime",
  actionQueue: "totalActionTime",
  actionPanel_foragingTotal: "actionPanel_totalTime",
  productionSummary: "actionPanel_totalTime",
  productionProfit: "actionPanel_totalTime",
  showsKeyInfoInIcon: "itemIconLevel",
  itemTooltip_profit: "itemTooltip_prices",
  itemTooltip_profitRequireKey: "itemTooltip_prices",
  lootChestEstimate: "itemTooltip_prices",
  lootSellAtAsk: "lootChestEstimate",
  lootBuyAtAsk: "lootChestEstimate",
  lootKeyFromFragments: "lootChestEstimate",
  lootIgnoreCowbells: "lootChestEstimate",
  taskMaterials: "taskInsights",
  taskQueueProgress: "taskInsights",
  taskAutoSort: "taskInsights",
  taskIcons: "taskInsights",
  taskStatistics: "taskInsights",
  taskClaimCollector: "taskInsights",
  taskMergeActions: "taskInsights",
  taskNewBadge: "taskInsights",
  taskTrainPlanner: "semiAutoTrain",
  guildOverview: "guildXpTracking",
  guildMemberXp: "guildXpTracking",
  guildLeaderboardXp: "guildXpTracking",
  guildIdleMembers: "guildOverview",
};

for (const [id, parent] of Object.entries(settingParents)) {
  if (settingsCatalog[id]) settingsCatalog[id].parent = parent;
}

const settingListeners = new Map();

function getSetting(id) {
  return settingsMap[id]?.isTrue;
}

function isIronCowCharacter() {
  return ["ironcow", "legacy_ironcow"].includes(
    String(runtime.state.currentCharacterGameMode ?? "").toLowerCase(),
  );
}

function shouldSuppressMarketFeatures() {
  return Boolean(
    settingsMap.adaptIronCowMarketFeatures?.isTrue && isIronCowCharacter(),
  );
}

async function setSetting(id, value, options = {}) {
  if (!settingsMap[id]) return false;
  const normalized = Boolean(value);
  const previous = settingsMap[id].isTrue;
  settingsMap[id].isTrue = normalized;
  if (previous === normalized && !options.force) return true;

  if (options.persist !== false) runtime.api.persistSettings?.();
  for (const listener of settingListeners.get(id) ?? []) {
    try {
      listener(normalized, previous);
    } catch (error) {
      console.error(
        isZH
          ? `[MWITools] 设置 ${id} 的监听器执行失败`
          : `[MWITools] Setting listener failed for ${id}`,
        error,
      );
    }
  }
  await runtime.features.syncSetting(id);
  return true;
}

function onSettingChange(id, listener) {
  const listeners = settingListeners.get(id) ?? new Set();
  listeners.add(listener);
  settingListeners.set(id, listeners);
  return () => listeners.delete(listener);
}

Object.defineProperties(runtime.config, {
  THOUSAND_SEPERATOR: {
    enumerable: true,
    get() {
      return getGameNumberSeparators().thousand;
    },
  },
  DECIMAL_SEPERATOR: {
    enumerable: true,
    get() {
      return getGameNumberSeparators().decimal;
    },
  },
  NUMBER_LOCALE: {
    enumerable: true,
    get() {
      return getGameNumberLocale();
    },
  },
  isZHInGameSetting: {
    enumerable: true,
    get() {
      return isGameLanguageZH();
    },
  },
  gameLanguage: {
    enumerable: true,
    get() {
      return getGameLanguage();
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
  groups: {
    enumerable: true,
    get() {
      return settingsGroups;
    },
  },
  catalog: {
    enumerable: true,
    get() {
      return settingsCatalog;
    },
  },
});

Object.assign(runtime.settings, {
  get: getSetting,
  set: setSetting,
  onChange: onSettingChange,
});

Object.assign(runtime.api, {
  isIronCowCharacter,
  shouldSuppressMarketFeatures,
});

runtime.registerStart("core/config.js", () => {
  // 警告字体颜色

  console.log(window.location.href);
});
