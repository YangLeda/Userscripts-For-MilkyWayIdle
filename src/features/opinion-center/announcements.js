const STORAGE_KEY = "MWITools_opinion_center_seen_announcements_v1";

export const ANNOUNCEMENTS = Object.freeze([
  Object.freeze({
    id: "26.4.9",
    version: "26.4.9",
    publishedAt: "2026-08-13",
    title: Object.freeze({
      zh: "26.4.9 更新公告",
      en: "Version 26.4.9 update",
    }),
    body: Object.freeze({
      zh: Object.freeze([
        "排行榜徽章新增总等级、迷宫深度、智力、耐力和任务积分，并使用游戏原生图标；徽章名次不再显示 # 前缀，个人主页会在姓名下方完整展示全部徽章，其他位置只保留名次最靠前的三个，好友列表则保持在姓名右侧，所有榜单前五名的彩色徽章会低频扫过一道缓慢白光，并在右上角短暂闪亮。",
        "修复切换到技能页再返回库存后，战斗与生活着装评分、总资产可能不再显示；即使游戏复用了旧库存节点，摘要也会自动恢复。",
        "库存中的战斗着装评分、生活着装评分和总资产现在会在本次页面会话首次计算后保持不变；技能、装备、资产或市场数据变化只会恢复原有显示，刷新网页后才会重新计算。",
        "修复生产面板重建、存在嵌套容器或更换战斗技能后，目标等级和生产次数快捷输入不显示；插件现在会识别实际弹窗表单，并在技能数据与面板先后更新时稳定恢复整组生产扩展。",
      ]),
      en: Object.freeze([
        "Leaderboard badges now include Total Level, Labyrinth Depth, Intelligence, Stamina, and Task Points with native game icons. Badge ranks no longer show a # prefix, profiles show every badge on a second row below the name, other locations keep only the three best ranks, friend-list badges stay beside the name, and top-five rainbow badges now receive a slow, low-frequency white sweep followed by a brief upper-right glint.",
        "Fixed combat and skilling gear scores and total assets sometimes disappearing after switching to a skill and returning to Inventory. The summary now restores itself even when the game reuses the previous inventory node.",
        "Combat gear score, skilling gear score, and total assets in Inventory now stay fixed after their first calculation in the current page session. Ability, equipment, asset, and market updates only restore the existing display; reloading the page recalculates it.",
        "Fixed target-level controls and production count shortcuts not appearing after production-panel rebuilds, nested containers, or combat ability changes. MWITools now identifies the actual modal form and reliably restores the full extension group when ability data and the panel update at different times.",
      ]),
    }),
  }),
  Object.freeze({
    id: "26.4.8",
    version: "26.4.8",
    publishedAt: "2026-08-13",
    title: Object.freeze({
      zh: "26.4.8 更新公告",
      en: "Version 26.4.8 update",
    }),
    body: Object.freeze({
      zh: Object.freeze([
        "生产面板改用稳定挂载区：切换配装或游戏重建面板后，次数快捷输入、本次生产摘要、缺料提示和目标等级会自动恢复且不再重复；未填写数量与材料充足时也保持稳定占位，且不会再让弹窗持续变高，可在设置中隐藏仅材料充足的提示。",
        "本次生产摘要默认折叠，并可改为始终展开或关闭；新增三档 MWITools 字号，仅调整插件界面，改善生产、采购、库存价值、设置与利润详情中的小字阅读。",
        "总资产默认计入公会代币与奇幻、阴森、秘法、海盗地下城代币，并统一归入不可交易代币；设置中可关闭，当前资产、库存分类和后续历史快照会使用相同口径。",
        "普通物品悬浮窗新增效率与贪心两档生产总成本（含材料与茶饮），订单簿缺价时使用市场价值兜底，并提示自定义按键与移动端长按查看完整详情。",
        "装备分类恢复市场价值、出售价和收购价排序，并按强化等级与整堆数量显示价值角标；效率茶继续读取游戏 Buff 数据，回归验证基础效果为 +10%，数字 5 仅代表持续 5 分钟。",
        "降低手机端空闲、生产、市场和战斗统计的后台轮询与重复计算，修复反复打开行动队列后的内存占用增长，减少长时间挂机时的发热、耗电和卡顿。",
        "任务自动返回现在只恢复任务列表内部的滚动位置，并会等待列表布局稳定；新任务同时进入队列时不再把整个页面滚到空白区域。顶部当前动作时间也改为跟随游戏原生字号，并在可用空间不足时隐藏预计完成时间以保持紧凑。",
        "手机端长按打开生产收益、宝箱估值或强化成本后，松手及原生物品提示消失时详情会继续显示；点击详情内部可滚动或操作，只有点击窗口外才会关闭。",
        "制造和指定次数强化的多材料余缺提示改为固定四列逐行对齐，不再横向撑宽；物品价格会下移避开强化等级，同时保留原有文字样式。",
        "技能书计算器新增“加入购物车”，会自动扣除当前库存和购物车已有数量，只加入达到目标等级所需的净缺口。",
        "公会信用兑换推荐默认显示 3 个方案，并可在设置中通过下拉菜单自由选择显示 1–8 个；修改后已打开的推荐会立即更新。",
        "移动端意见中心压缩了表单和公告的空白，输入框会按内容与屏幕高度自适应；标题与三个页签保持可见，公告和表单改为弹窗正文内独立滚动。",
        "任务筛选移除不会出现的炼金与强化类型；桌面端会尽量将生活技能和战斗筛选排在同一行，空间不足时五个战斗按钮会整组换行，同时通过缓存任务解析与战斗索引降低大量任务时的卡顿。",
        "排行榜徽章改用游戏原生技能与名望图标，不再从 MWITools 排行榜服务器加载图标文件。",
        "公会成员与好友列表的排行榜徽章改为在名字下方紧凑排列，不再挤压或截断角色名；名字颜色设置中的角色预览也会显示对应徽章。",
        "修复重置任务后卡片被原地复用时，“前往”仍按旧任务计算合并数量；现在会根据当前卡片和最新任务数据重新汇总。",
        "战斗模拟器重新从最近一场战斗读取队友实际携带的食物和咖啡；尚未取得对应战斗数据时，组队导入也不再中断。",
        "修复中英文下顶部当前动作时间在窄窗口中与动作名称或排队按钮重叠；可用空间不足时会自动精简显示。",
        "修复刷新任务或页面时任务图标串位、被替换后消失，以及火车提示漂移并撑出横向滚动条；普通任务不再显示“无需火车”。",
        "修复开启任务战斗地图序号后，任务统计、筛选和背景图标整组不显示；任务身份匹配现在会忽略插件自身的“图N”标记，并能按目标怪物识别战斗任务。",
        "生产、全链条与火车现在统一读取当前茶饮、社区等行动增益和暴饮之囊；换茶后会即时重算，链条按实际产量规划，采集利润与队列耗时不再漏算社区速度。",
      ]),
      en: Object.freeze([
        "Production panels now use a stable mount area. Quick counts, production summary, shortage hints, and target level automatically return once a loadout switch or game render replaces the panel, without duplicates. Waiting and ready states keep their space stable without making the dialog grow continuously, with an option to hide only the ready hint.",
        "Production summary is collapsed by default and can be set to always expanded or off. Three MWITools font-size levels improve small text in production, procurement, inventory values, settings, and profit details without changing the game's native UI.",
        "Total assets now include Guild, Chimerical, Sinister, Enchanted, and Pirate Tokens by default under non-tradable tokens. The setting applies the same inclusion rule to current assets, inventory categories, and future history snapshots.",
        "Regular item tooltips now show Efficiency and Greedy total production costs including materials and drinks, fall back to market value when an order-book side is missing, and explain the custom-key or mobile long-press gesture for full details.",
        "Equipment categories once again support market-value, ask, and bid sorting with value badges based on enhancement and full stack count. Efficiency Tea remains driven by game Buff data, with regression coverage confirming +10% base effect while 5 only means five minutes of duration.",
        "Reduced background polling and repeated work across idle, production, market, and combat-stat views on mobile, and fixed memory growth after repeatedly opening the action queue to reduce heat, battery drain, and long-session stutter.",
        "Task auto-return now restores only the task list's internal scroll position and waits for its layout to settle, so a newly queued task no longer scrolls the whole page into a blank area. The top current-action time also follows the game's native font size and hides the finish time when space is tight to stay compact.",
        "On mobile, production profit, loot valuation, and enhancement cost details opened by a long press now remain visible after release or after the native item tooltip disappears. Taps and scrolling inside remain interactive, and only a tap outside closes the detail window.",
        "Multi-material shortage indicators in production and fixed-count enhancing now stay aligned in four explicit columns without widening the panel. Item prices move below enhancement levels while keeping their existing text style.",
        "The ability-book calculator now includes Add to cart and subtracts both current inventory and quantities already in the cart, adding only the net shortage needed for the target level.",
        "Guild Credit Exchange shows three recommendations by default, with a settings dropdown for choosing one through eight. Open recommendations update immediately when the value changes.",
        "The mobile Feedback Center now removes excess form and announcement spacing, and text boxes adapt to their content and screen height. The title and all three tabs stay visible while announcements and forms scroll independently inside the modal body.",
        "Task filters no longer include the unavailable Alchemy and Enhancing types. Desktop layouts keep profession and combat filters on one row when possible, move all five combat buttons together when space is tight, and reduce large-task-list lag through cached task parsing and combat indexes.",
        "Leaderboard badges now use the game's native skill and Fame icons instead of loading icon files from the MWITools leaderboard server.",
        "Leaderboard badges in guild member and friend lists now use a compact row below the name instead of squeezing or truncating it, and character previews in the name-color setting now show their badges too.",
        "Fixed Go still using stale merged counts when a rerolled task reused the same card. Merge totals are now recalculated from the current card and latest task data.",
        "Combat simulators once again read teammates' actual food and coffee from the latest battle. Group imports also no longer stop when matching battle data has not been captured yet.",
        "Fixed the top current-action timing overlapping the action name or queued-actions button in narrow windows in both Chinese and English. The summary now simplifies itself when space is limited.",
        'Fixed task icons moving to the wrong card or disappearing after task and page refreshes, along with train labels drifting and causing horizontal overflow. Ordinary tasks no longer show "No train needed."',
        'Fixed task statistics, filters, and background icons all disappearing when task combat-map numbers were enabled. Task identity matching now ignores MWITools\' own "Map N" labels and recognizes combat tasks by their target monsters.',
        "Production, full-chain planning, and trains now share the current drinks, community and other action buffs, and Guzzling Pouch effects. Drink changes recalculate immediately, chains use effective output, and gathering profit and queue timing no longer miss community speed.",
      ]),
    }),
  }),
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
        "生产购物清单现在默认补齐上一层成品与当前步骤材料，也可通过“所选链条”开关按勾选阶段补齐；有限次数的总产出、耗时和利润不再被当前库存截断，无限次数且无库存时会明确显示为 0。",
        "任务页在当前页面刷新出新任务时，会立即将所有新任务置顶，再按专业和战斗分类排序；普通进度刷新继续保持卡片位置稳定。",
        "修复不同缩放比例或窄窗口下任务页礼物、未读提示和普通任务卡宽度不一致、列边界错位及横向溢出。",
        "修复聊天框或数量输入框仍有焦点时，按住 Ctrl 等修饰键不显示生产利润、宝箱估算和强化成本面板；自定义字母键仍会在输入时避免误触。",
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
        "Production shopping lists now default to the direct predecessor and current-step materials, with a “Selected chain” switch for the checked stages. Finite totals are no longer capped by current inventory, while infinite production with no stock now clearly shows zero.",
        "When new tasks arrive on the current task page, all new tasks now move to the top before profession and combat sorting. Ordinary progress refreshes continue to keep card positions stable.",
        "Fixed mismatched widths, misaligned column edges, and horizontal overflow between gift, unread-notice, and regular task cards at different zoom levels or in narrow windows.",
        "Fixed production profit, loot estimate, and enhancement cost panels not appearing while Ctrl or another modifier key was held with focus still in chat or a quantity input. Custom letter shortcuts remain suppressed while typing.",
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
