const STORAGE_KEY = "MWITools_opinion_center_seen_announcements_v1";

export const ANNOUNCEMENTS = Object.freeze([
  Object.freeze({
    id: "26.4.7",
    version: "26.4.7",
    publishedAt: "2026-08-13",
    title: Object.freeze({
      zh: "26.4.7 更新公告",
      en: "Version 26.4.7 update",
    }),
    body: Object.freeze({
      zh: Object.freeze([
        "修复移动浏览器工具栏变化后页面底部偶尔出现白条并整体上移；Sunny 强化倍数按钮现在可再次把对应期望次数的净缺料加入购物车。",
        "资产中心图例在实时资产刷新后继续保持隐藏或显示状态。",
        "修复九种官方语言下库存评分与总资产、当前行动倒计时、任务合并与自动返回、战斗每小时统计不显示或未生效的问题；装备分类也不再因语言不同参与库存排序。",
        "精炼背部装备加入购物清单时不再包含不可交易的原始背部物品；生产时长快捷按钮现在结合当前综合效率向上换算，避免队列早于所选时长结束。",
        "修复任务页重复出现多个规划火车、资产中心日期选择器被实时刷新关闭，以及强化当前行动条的剩余次数与预计完成时间偶尔不显示。",
        "意见审理台现在显示反馈者使用的 MWITools 版本；重大更新清单支持 GitHub 失败后从反馈服务器读取，并明确显示最新版本且每个版本最多提醒一次。",
        "移动端生产摘要改为紧凑双列，顶部行动条只保留剩余次数和时间并随内容收缩；桌面端继续显示预计完成时间。意见中心入口统一精简为单行 MWITools。",
        "DPS 面板改为每秒刷新一次，伤害、治疗和击杀仍按战斗消息实时累计；长时间离线或挂起后会直接快进时间桶，不再逐个循环补齐。",
        "任务卡的语义匹配与火车升级链改用索引，任务附属控件按需刷新，并取消功能关闭后尚未执行的帧回调，降低乱序任务和战斗期间的后台开销。",
        "物品等级、市场筛选和地图编号改为按交互与数据消息刷新；DPS 启动器及收益、强化浮窗缩小观察范围，并移除高 GPU 占用的背景模糊。",
        "强化成本现在与生产收益和宝箱估算共用同一个自定义快捷键；桌面端按住触发，移动端长按触发。",
        "版本公告恢复按版本独立保存，26.4.6 的历史内容不再混入本版公告。",
      ]),
      en: Object.freeze([
        "Fixed an occasional bottom white strip and upward-shifted game layout after mobile browser toolbar changes. Sunny's enhancement multiplier buttons can again add the net shortages for their expected action counts to the shopping cart.",
        "Asset Center legend visibility now persists through live asset refreshes.",
        "Fixed inventory scores and total assets, the current-action countdown, task merging and auto-return, and hourly battle statistics not appearing or activating across all nine official game languages. Equipment also stays excluded from inventory sorting in every language.",
        "Refined back equipment no longer adds its untradeable base item to the shopping list. Production duration shortcuts now round up using current total efficiency so queues do not finish before the selected duration.",
        "Fixed duplicate train-planning controls on tasks, live asset refreshes closing date pickers, and remaining counts and completion estimates intermittently missing from the current-action bar while enhancing.",
        "The feedback review console now shows each reporter's MWITools version. Important-update manifests fall back to the feedback server when GitHub fails, show the latest version explicitly, and appear at most once per version.",
        "Mobile production summaries now use a compact two-column layout, and the mobile current-action bar keeps only the remaining count and time while shrinking to its content. Desktop keeps the finish-time estimate. The Feedback Center launcher is shortened to a single-line MWITools label.",
        "The DPS panel now refreshes once per second while damage, healing, and kills remain event-driven. Long suspended gaps fast-forward graph buckets instead of replaying every missing interval.",
        "Task semantic matching and train upgrade lookups now use indexes, task decorations refresh on demand, and queued frames are cancelled on feature cleanup to reduce shuffled-task and combat overhead.",
        "Item levels, market filters, and map indexes now refresh on interactions and data messages. DPS launcher and estimate-panel observers are narrower, and expensive backdrop blur was removed.",
        "Enhancement costs now share the same custom shortcut as production profit and loot chest estimates: hold the key on desktop or long-press on touch devices.",
        "Release announcements are stored separately by version again, so the 26.4.6 history is no longer mixed into this release.",
      ]),
    }),
  }),
  Object.freeze({
    id: "26.4.6",
    version: "26.4.6",
    publishedAt: "2026-08-12",
    title: Object.freeze({
      zh: "26.4.6 更新公告",
      en: "Version 26.4.6 update",
    }),
    emphasizedBodyIndexes: Object.freeze([6]),
    body: Object.freeze({
      zh: Object.freeze([
        "意见反馈升级为意见中心，新增版本公告，并统一使用红点提醒反馈回复和新公告。",
        "任务页改为平铺布局，支持新任务、已完成任务、生活专业、战斗和四个副本的排序与图标筛选，并提供手动重新排序。",
        "资产中心支持在历史记录缺失日期之间补录七项资产；同一轮资产估值固定使用一份行情快照，避免实时价格变化造成统计口径不一致。",
        "公会经验统计改为近 6 小时、24 小时和成员本周平均速率；七日趋势使用 6 小时滚动平均，并修正升级经验与预计升级时间计算。",
        "新增铁牛模式适配开关，自动识别铁牛和旧铁牛角色；开启后隐藏不可用的市场价格、利润与市场采购操作，同时保留资产和宝箱估值。",
        "修复点金、分解、转化和解精炼的完成时间：现在会结合所选物品批量、催化剂、金币、完成次数和当前周期计算，缺少选择时不再显示无穷大。",
        "生产利润和宝箱估算悬浮默认需要同时按住 Ctrl，可在设置中改成任意单键；移动端均需 800 毫秒长按，并支持滑动取消与点外关闭。",
        "迷宫活动期间暂停所有生活装备提醒，离开迷宫后自动恢复。",
        "购物车升级链新增“从上一步开始”，可直接购买上一层成品与当前步骤材料，不再继续拆解上一层装备。",
        "资产与吃书经验不再显示浮点尾数；宝箱碎片自制钥匙会计入工匠减耗、浓缩倍率和泡饮成本，并可选择忽略所有牛铃价值。",
        "购物车新增默认关闭的“加购后自动展开”，开启后任意入口成功加购都会直接打开购物清单。",
        "兼容游戏全部九种内置语言；库存、悬浮窗、任务、行动、市场和 DPS 等功能现在会直接使用游戏当前语言的官方词表，不再因繁体中文或其他语言名称不同而失效。",
        "移除作用有限的消耗品回复速度、单位回复成本和理论每日用量显示。",
        "修复购物车数量加减按钮长按后可能无法停止，现在松手、清空、删除、收起或切换页签都会立即结束连续加减。",
        "数字解析和显示现在跟随游戏内语言，修复逗号作为小数点、句点或空格作为千分位时，生产材料、房屋数量、任务进度和行动时间计算错误，并稳定公会经验速率条宽度。",
        "修复中文以外的游戏语言下火车点击加入队列后不续站，以及角色管理页不显示盈亏标签的问题。",
        "修复全服技能与公会排行榜可能被经验速率排序或当前角色置顶改变顺序；经验速率继续作为只读信息显示。",
        "资产中心的分项图表改为显示各日期的实际资产持有值，图例可点击隐藏或恢复曲线，悬浮数值使用 K/M/B/T 单位。",
        "修复精炼生活披风等背部装备提示没有新缺料的问题；强化缺料加购移至右侧信息列，单阶段与多阶段升级链均可正确加入购物车。",
        "关闭产出与库存摘要后不再重新出现本次生产摘要；同时减少任务页重复的多语言匹配和插件自身刷新，改善英文界面卡顿。",
      ]),
      en: Object.freeze([
        "Feedback is now the Feedback Center, with release announcements and one red-dot notification for replies and new announcements.",
        "Tasks now use a flat layout with sorting and icon filters for new, completed, profession, combat, and four dungeon categories, plus manual re-sorting.",
        "The Asset Center can insert seven-component records into missing historical dates. One market snapshot is used per valuation session to keep totals consistent while live prices change.",
        "Guild XP now shows 6-hour, 24-hour, and member this-week average rates. The seven-day trend uses a 6-hour rolling average, with corrected level requirements and ETA calculations.",
        "Added an Iron Cow adaptation switch that recognizes both Iron Cow modes. When enabled, unavailable market prices, profits, and marketplace purchasing actions are hidden while asset and loot chest valuations remain available.",
        "Fixed completion times for Coinify, Decompose, Transmute, and Unrefine by accounting for the selected stack, bulk size, catalyst, coins, completed count, and current cycle. Missing selections no longer appear as infinite.",
        "Production profit and loot chest estimate tooltips now require holding Ctrl by default, with any single key configurable in settings. Both use an 800 ms long press on touch devices with movement cancellation and outside-tap dismissal.",
        "All skilling equipment reminders pause during an active Labyrinth run and resume automatically after leaving it.",
        "Upgrade chains now offer “Start from previous” to buy the direct predecessor and current-step materials without breaking the predecessor down further.",
        "Asset and ability-book XP displays no longer show floating-point tails. Fragment-crafted key estimates now include Artisan reduction, concentration, and drink costs, with an option to ignore all Cowbell value.",
        "The cart adds an off-by-default “Expand after adding” option that opens the shopping list after any successful addition.",
        "Added compatibility with all nine built-in game languages. Inventory, tooltips, tasks, actions, marketplace tools, DPS, and related features now use the official dictionary for the active game language instead of failing on Traditional Chinese or other localized names.",
        "Removed the low-value consumable recovery-rate, cost-per-recovery, and theoretical daily-use display.",
        "Fixed shopping-cart quantity buttons sometimes continuing forever after a long press. Releasing, clearing, deleting, collapsing, or changing tabs now stops repeat adjustments immediately.",
        "Number parsing and display now follow the in-game language, fixing production materials, house quantities, task progress, and action timing when commas are decimals and periods or spaces are grouping separators, while stabilizing guild XP rate-bar widths.",
        "Fixed trains not advancing after queue submission and the P/L tab missing from Character Management when the game uses a non-Chinese language.",
        "Fixed standard skill and guild leaderboard order being changed by XP-rate sorting or current-character pinning; XP rates remain available as read-only information.",
        "Asset component charts now show actual holdings for each date, legends can hide and restore lines, and hover values use K/M/B/T units.",
        "Fixed refined skilling capes and other back equipment reporting no new shortages. Enhancement shopping now sits in the right-hand information column, and both single- and multi-stage upgrade chains add materials correctly.",
        "Disabling the output and inventory summary now keeps the production summary hidden. Repeated multilingual task matching and MWITools-owned refreshes were also reduced to improve English task-page performance.",
      ]),
    }),
  }),
]);

function defaultGetValue(key, fallback) {
  try {
    return typeof GM_getValue === "function"
      ? GM_getValue(key, fallback)
      : fallback;
  } catch {
    return fallback;
  }
}

function defaultSetValue(key, value) {
  try {
    if (typeof GM_setValue === "function") GM_setValue(key, value);
  } catch {
    // A storage failure must not prevent the center from opening.
  }
}

function parseSeenIds(value) {
  const parsed = typeof value === "string" ? JSON.parse(value || "[]") : value;
  return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
}

export class AnnouncementStore {
  constructor({
    announcements = ANNOUNCEMENTS,
    getValue = defaultGetValue,
    setValue = defaultSetValue,
  } = {}) {
    this.announcements = [...announcements].sort(
      (left, right) =>
        String(right.publishedAt).localeCompare(String(left.publishedAt)) ||
        String(right.version).localeCompare(String(left.version), undefined, {
          numeric: true,
        }),
    );
    this.getValue = getValue;
    this.setValue = setValue;
    try {
      this.seenIds = parseSeenIds(this.getValue(STORAGE_KEY, []));
    } catch {
      this.seenIds = new Set();
    }
  }

  list() {
    return [...this.announcements];
  }

  unread() {
    return this.announcements.filter((item) => !this.seenIds.has(item.id));
  }

  markAllRead() {
    const unread = this.unread();
    if (!unread.length) return 0;
    for (const item of unread) this.seenIds.add(item.id);
    this.setValue(STORAGE_KEY, [...this.seenIds]);
    return unread.length;
  }
}

export const announcementStorageKey = STORAGE_KEY;
