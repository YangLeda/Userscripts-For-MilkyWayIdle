const STORAGE_KEY = "MWITools_opinion_center_seen_announcements_v1";

export const ANNOUNCEMENTS = Object.freeze([
  Object.freeze({
    id: "26.4.6",
    version: "26.4.6",
    publishedAt: "2026-08-12",
    title: Object.freeze({
      zh: "26.4.6 更新公告",
      en: "Version 26.4.6 update",
    }),
    body: Object.freeze({
      zh: Object.freeze([
        "意见反馈升级为意见中心，新增版本公告，并统一使用红点提醒反馈回复和新公告。",
        "任务页改为平铺布局，支持新任务、已完成任务、生活专业、战斗和四个副本的排序与图标筛选，并提供手动重新排序。",
        "资产中心支持在历史记录缺失日期之间补录七项资产；同一轮资产估值固定使用一份行情快照，避免实时价格变化造成统计口径不一致。",
        "公会经验统计改为近 6 小时、24 小时和成员本周平均速率；七日趋势使用 6 小时滚动平均，并修正升级经验与预计升级时间计算。",
        "新增铁牛模式适配开关，自动识别铁牛和旧铁牛角色；开启后隐藏不可用的市场价格、利润与市场采购操作，同时保留资产和宝箱估值。",
        "修复点金、分解、转化和解精炼的完成时间：现在会结合所选物品批量、催化剂、金币、完成次数和当前周期计算，缺少选择时不再显示无穷大。",
        "生产利润悬浮默认需要同时按住 Ctrl，可在设置中改成任意单键；移动端改为 800 毫秒长按，并支持滑动取消与点外关闭。",
        "迷宫活动期间暂停所有生活装备提醒，离开迷宫后自动恢复。",
        "购物车升级链新增“从上一步开始”，可直接购买上一层成品与当前步骤材料，不再继续拆解上一层装备。",
      ]),
      en: Object.freeze([
        "Feedback is now the Feedback Center, with release announcements and one red-dot notification for replies and new announcements.",
        "Tasks now use a flat layout with sorting and icon filters for new, completed, profession, combat, and four dungeon categories, plus manual re-sorting.",
        "The Asset Center can insert seven-component records into missing historical dates. One market snapshot is used per valuation session to keep totals consistent while live prices change.",
        "Guild XP now shows 6-hour, 24-hour, and member this-week average rates. The seven-day trend uses a 6-hour rolling average, with corrected level requirements and ETA calculations.",
        "Added an Iron Cow adaptation switch that recognizes both Iron Cow modes. When enabled, unavailable market prices, profits, and marketplace purchasing actions are hidden while asset and loot chest valuations remain available.",
        "Fixed completion times for Coinify, Decompose, Transmute, and Unrefine by accounting for the selected stack, bulk size, catalyst, coins, completed count, and current cycle. Missing selections no longer appear as infinite.",
        "Production profit tooltips now require holding Ctrl by default, with any single key configurable in settings. Touch devices use an 800 ms long press with movement cancellation and outside-tap dismissal.",
        "All skilling equipment reminders pause during an active Labyrinth run and resume automatically after leaving it.",
        "Upgrade chains now offer “Start from previous” to buy the direct predecessor and current-step materials without breaking the predecessor down further.",
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
