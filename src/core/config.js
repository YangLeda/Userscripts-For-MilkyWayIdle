import { runtime } from "./runtime.js";

const THOUSAND_SEPERATOR =
  new Intl.NumberFormat().format(1111).replaceAll("1", "").at(0) || "";

const DECIMAL_SEPERATOR = new Intl.NumberFormat()
  .format(1.1)
  .replaceAll("1", "")
  .at(0);

function getGameLanguage() {
  const storedLanguage = localStorage.getItem("i18nextLng")?.trim();
  if (storedLanguage) return storedLanguage;
  return (
    globalThis.document?.documentElement?.lang ||
    globalThis.navigator?.language ||
    "en-US"
  );
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
      ? "总等级下方显示意见反馈入口"
      : "Show the feedback entry below total level.",
    isTrue: true,
  },
  invWorth: {
    id: "invWorth",
    desc: isZH
      ? "仓库搜索栏下方显示：仓库和着装评分总结"
      : "Below inventory search bar: Inventory and gear score summary.",
    isTrue: true,
  },
  invSort: {
    id: "invSort",
    desc: isZH ? "仓库显示：仓库物品排序" : "Inventory: Sort inventory items.",
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
    desc: isZH
      ? "人物面板显示：战斗和生活着装评分"
      : "Profile panel: Combat and skilling gear scores.",
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
      ? "启用新版 DPS、HPS、承伤、战斗片段与历史统计"
      : "Enable DPS, HPS, damage-taken, segment, and combat history tracking.",
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
  taskInsights: {
    id: "taskInsights",
    desc: isZH ? "任务显示利润和耗时" : "Show task profit and duration.",
    isTrue: true,
  },
  taskNewBadge: {
    id: "taskNewBadge",
    desc: isZH
      ? "新领取任务显示高亮和新角标"
      : "Highlight newly received tasks.",
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
    desc: isZH ? "任务页显示统计抽屉" : "Show the task summary drawer.",
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
  forceMWIToolsDisplayZH: {
    id: "forceMWIToolsDisplayZH",
    desc: isZH
      ? "MWITools本身强制显示中文 MWITools always in Chinese"
      : "MWITools本身强制显示中文 MWITools always in Chinese",
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
    title: { zh: "公会与排行榜", en: "Guild & Leaderboard" },
    summary: {
      zh: "只在本机记录经验快照，展示公会进度和成员速率。",
      en: "Store XP snapshots locally to show guild progress and member rates.",
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
    "意见反馈",
    "Feedback",
    "在总等级下方提交意见、截图并查看处理状态；每张截图最大 1MB。",
    "Submit feedback and screenshots below total level and follow its status; images are limited to 1MB.",
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
    "notifiEmptyAction",
    "general",
    "空闲提醒",
    "Idle notification",
    "动作队列清空时发送浏览器通知；游戏页面需要保持打开。",
    "Send a browser notification when the action queue becomes empty while the game is open.",
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
    "显示每次、每小时、每天和本次输入数量对应的税后净利润。",
    "Show after-tax net profit per action, hour, day, and entered quantity.",
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
    "invSort",
    "inventory",
    "按价值整理库存",
    "Sort inventory by value",
    "可按服务器价值、卖价或买价整理库存，并显示整堆价值。",
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
    "在物品悬浮窗显示服务器价值和当前买卖价格。",
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
    "showConsumTips",
    "market",
    "消耗品性价比",
    "Consumable efficiency",
    "显示回血回魔速度、单位回复成本和每天最多用量。",
    "Show recovery rate, cost per recovery, and maximum daily use.",
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
    "按专业分组任务",
    "Group tasks by profession",
    "按左侧专业顺序显示可折叠分组；已完成任务置顶，战斗任务按地图和地牢细分。",
    "Show collapsible profession groups, pin completed tasks, and split combat by zone or dungeon.",
  ],
  [
    "taskNewBadge",
    "tasks",
    "新任务标记",
    "New task badges",
    "新领取任务显示黄色角标和高亮，点击任务卡后标记为已读。",
    "Show a yellow badge and highlight on newly received tasks until the task card is clicked.",
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
    "战斗穿生产装或生产漏穿仓库中的对应装备时发出提醒。",
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
    "显示最近、1 小时和 24 小时速率、升级时间与 7 天趋势。",
    "Show recent, hourly, and daily XP rates, time to level, and a seven-day trend.",
  ],
  [
    "guildMemberXp",
    "guild",
    "成员经验速率",
    "Member XP rates",
    "在成员表增加最近和 24 小时 XP/h 两列。",
    "Add recent and 24-hour XP/h columns to the member table.",
  ],
  [
    "guildLeaderboardXp",
    "guild",
    "公会榜经验速率",
    "Guild leaderboard XP rates",
    "在全服公会榜显示本机采样得到的最近和 24 小时 XP/h。",
    "Show locally sampled recent and 24-hour XP/h on the guild leaderboard.",
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
    "guildCreditConversionsSort",
    "guild",
    "公会信用兑换排序",
    "Guild credit exchange sorting",
    "按材料市场价值整理公会信用兑换选项。",
    "Sort guild credit exchange options by material market value.",
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
    "技能书需求",
    "Ability book requirements",
    "在技能书词典中计算升到目标等级还需要多少本。",
    "Calculate books needed to reach a target ability level in the item dictionary.",
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
  showConsumTips: "itemTooltip_prices",
  taskMaterials: "taskInsights",
  taskQueueProgress: "taskInsights",
  taskAutoSort: "taskInsights",
  taskIcons: "taskInsights",
  taskStatistics: "taskInsights",
  taskClaimCollector: "taskInsights",
  taskMergeActions: "taskInsights",
  taskNewBadge: "taskInsights",
  guildOverview: "guildXpTracking",
  guildMemberXp: "guildXpTracking",
  guildLeaderboardXp: "guildXpTracking",
  guildIdleMembers: "guildOverview",
};

for (const [id, parent] of Object.entries(settingParents)) {
  if (settingsCatalog[id]) settingsCatalog[id].parent = parent;
}

settingsCatalog.displayCapMM = { id: "displayCapMM", hidden: true };

const settingListeners = new Map();

function getSetting(id) {
  return settingsMap[id]?.isTrue;
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
      console.error(`[MWITools] Setting listener failed for ${id}`, error);
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

runtime.registerStart("core/config.js", () => {
  // 警告字体颜色

  console.log(window.location.href);
});
