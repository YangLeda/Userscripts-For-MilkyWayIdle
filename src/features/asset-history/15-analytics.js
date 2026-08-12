import { ASSET_COMPONENT_KEYS } from "./00-snapshot.js";
import { dayGap } from "./10-store.js";

export const ASSET_COMPONENT_META = Object.freeze({
  equipment: { zh: "装备", en: "Equipment", color: "#38bdf8" },
  inventory: { zh: "库存", en: "Inventory", color: "#fbbf24" },
  marketListings: { zh: "订单", en: "Listings", color: "#94a3b8" },
  houses: { zh: "房屋", en: "Houses", color: "#ec4899" },
  abilities: { zh: "技能", en: "Abilities", color: "#a855f7" },
  nonTradableTokens: { zh: "代币", en: "Tokens", color: "#4ade80" },
  shrine: { zh: "神龛", en: "Shrine", color: "#fb923c" },
});

function finiteEntries(entries, key = "total") {
  return (entries ?? []).filter(([, record]) =>
    Number.isFinite(record?.values?.[key]),
  );
}

export function normalizedDailyChanges(entries, key = "total") {
  const result = [];
  for (let index = 1; index < (entries?.length ?? 0); index += 1) {
    const [previousDate, previousRecord] = entries[index - 1];
    const [date, record] = entries[index];
    const previous = previousRecord?.values?.[key];
    const current = record?.values?.[key];
    if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
    const gapDays = Math.max(1, dayGap(previousDate, date));
    result.push({
      date,
      previousDate,
      gapDays,
      totalChange: current - previous,
      value: (current - previous) / gapDays,
      previous,
      current,
    });
  }
  return result;
}

export function calendarMovingAverage(entries, key = "total", windowDays = 7) {
  const changes = normalizedDailyChanges(entries, key);
  return changes.map((change, index) => {
    const startDate = new Date(`${change.date}T00:00:00Z`);
    startDate.setUTCDate(startDate.getUTCDate() - Math.max(1, windowDays) + 1);
    const startKey = startDate.toISOString().slice(0, 10);
    const window = changes
      .slice(0, index + 1)
      .filter(({ date }) => date >= startKey);
    const weightedDays = window.reduce(
      (total, item) => total + item.gapDays,
      0,
    );
    const total = window.reduce((sum, item) => sum + item.totalChange, 0);
    return {
      date: change.date,
      value: weightedDays > 0 ? total / weightedDays : null,
    };
  });
}

export function periodStatistics(entries, { start = null, end = null } = {}) {
  const values = finiteEntries(entries);
  const selected = values.filter(
    ([date]) => (!start || date >= start) && (!end || date <= end),
  );
  if (!selected.length) return null;
  const firstDate = selected[0][0];
  const baseline = [...values].reverse().find(([date]) => date < firstDate);
  const calculationEntries = baseline ? [baseline, ...selected] : selected;
  const changes = normalizedDailyChanges(calculationEntries);
  const profits = changes.filter(({ totalChange }) => totalChange > 0);
  const losses = changes.filter(({ totalChange }) => totalChange < 0);
  const totalProfit = changes.reduce(
    (total, item) => total + item.totalChange,
    0,
  );
  const elapsedDays = changes.reduce((total, item) => total + item.gapDays, 0);
  const best = changes.reduce(
    (candidate, item) =>
      !candidate || item.totalChange > candidate.totalChange ? item : candidate,
    null,
  );
  const worst = changes.reduce(
    (candidate, item) =>
      !candidate || item.totalChange < candidate.totalChange ? item : candidate,
    null,
  );
  const startValue = selected[0][1].values.total;
  const endValue = selected.at(-1)[1].values.total;
  return {
    start: firstDate,
    end: selected.at(-1)[0],
    startValue,
    endValue,
    totalProfit,
    growthPercent: startValue
      ? ((endValue - startValue) / startValue) * 100
      : null,
    averagePerDay: elapsedDays > 0 ? totalProfit / elapsedDays : 0,
    profitDays: profits.length,
    lossDays: losses.length,
    flatDays: changes.length - profits.length - losses.length,
    winRate: changes.length ? (profits.length / changes.length) * 100 : 0,
    best,
    worst,
    changes,
  };
}

export function buildHeatmap(entries) {
  return Object.fromEntries(
    normalizedDailyChanges(finiteEntries(entries)).map((item) => [
      item.date,
      item,
    ]),
  );
}

export function componentAnalysis(entries, rangeDays = null) {
  const selected = !Number.isFinite(rangeDays)
    ? entries
    : entries.slice(-(Math.max(1, rangeDays) + 1));
  const first = selected?.[0];
  const last = selected?.at(-1);
  if (!first || !last) return null;
  const gapDays = Math.max(1, dayGap(first[0], last[0]));
  const components = ASSET_COMPONENT_KEYS.map((key) => {
    const start = first[1]?.values?.[key];
    const end = last[1]?.values?.[key];
    const known = Number.isFinite(start) && Number.isFinite(end);
    const change = known ? end - start : null;
    return {
      key,
      ...ASSET_COMPONENT_META[key],
      start,
      end,
      change,
      averagePerDay: known ? change / gapDays : null,
      share:
        Number.isFinite(end) && Number(last[1]?.values?.total) > 0
          ? (end / last[1].values.total) * 100
          : null,
    };
  }).sort(
    (left, right) => (right.change ?? -Infinity) - (left.change ?? -Infinity),
  );
  const trackedChange = components.reduce(
    (total, item) => total + (Number.isFinite(item.change) ? item.change : 0),
    0,
  );
  const totalChange = last[1].values.total - first[1].values.total;
  return {
    startDate: first[0],
    endDate: last[0],
    gapDays,
    components,
    trackedChange,
    totalChange,
    untrackedChange: totalChange - trackedChange,
  };
}

const ACHIEVEMENT_DEFINITIONS = [
  [
    "nw_1m",
    "💰",
    "初有积蓄",
    "First Million",
    "净资产达到 1M",
    "Reach 1M net worth",
    "networth",
    1e6,
  ],
  [
    "nw_10m",
    "💎",
    "千万身家",
    "Ten Million",
    "净资产达到 10M",
    "Reach 10M net worth",
    "networth",
    1e7,
  ],
  [
    "nw_100m",
    "🏦",
    "亿万富翁",
    "Hundred Million",
    "净资产达到 100M",
    "Reach 100M net worth",
    "networth",
    1e8,
  ],
  [
    "nw_1b",
    "👑",
    "十亿俱乐部",
    "Billion Club",
    "净资产达到 1B",
    "Reach 1B net worth",
    "networth",
    1e9,
  ],
  [
    "nw_10b",
    "🌌",
    "银河财阀",
    "Galactic Fortune",
    "净资产达到 10B",
    "Reach 10B net worth",
    "networth",
    1e10,
  ],
  [
    "day_1m",
    "📈",
    "日进斗金",
    "Million Day",
    "单次记录盈利达到 1M",
    "Gain 1M between records",
    "profit",
    1e6,
  ],
  [
    "day_10m",
    "🚀",
    "一日千万",
    "Ten Million Day",
    "单次记录盈利达到 10M",
    "Gain 10M between records",
    "profit",
    1e7,
  ],
  [
    "day_100m",
    "🔥",
    "一日破亿",
    "Hundred Million Day",
    "单次记录盈利达到 100M",
    "Gain 100M between records",
    "profit",
    1e8,
  ],
  [
    "day_1b",
    "🌟",
    "日赚十亿",
    "Billion Day",
    "单次记录盈利达到 1B",
    "Gain 1B between records",
    "profit",
    1e9,
  ],
  [
    "growth_1",
    "🌱",
    "稳步成长",
    "One Percent",
    "单次增长达到 1%",
    "Grow 1% between records",
    "growth",
    1,
  ],
  [
    "growth_3",
    "🌳",
    "快速成长",
    "Three Percent",
    "单次增长达到 3%",
    "Grow 3% between records",
    "growth",
    3,
  ],
  [
    "growth_5",
    "💥",
    "财富爆发",
    "Five Percent",
    "单次增长达到 5%",
    "Grow 5% between records",
    "growth",
    5,
  ],
  [
    "streak_3",
    "🥉",
    "三连胜",
    "Three-day Streak",
    "连续 3 次盈利",
    "3 profitable records in a row",
    "streak",
    3,
  ],
  [
    "streak_7",
    "🥇",
    "七连胜",
    "Seven-day Streak",
    "连续 7 次盈利",
    "7 profitable records in a row",
    "streak",
    7,
  ],
  [
    "streak_30",
    "🏆",
    "月度不败",
    "Thirty-day Streak",
    "连续 30 次非亏损",
    "30 non-loss records in a row",
    "streak",
    30,
  ],
  [
    "veteran_30",
    "📅",
    "坚持一月",
    "One Month",
    "历史跨度达到 30 天",
    "Track assets for 30 days",
    "age",
    30,
  ],
  [
    "veteran_90",
    "🗓️",
    "季度老兵",
    "Quarter Veteran",
    "历史跨度达到 90 天",
    "Track assets for 90 days",
    "age",
    90,
  ],
  [
    "veteran_180",
    "🧭",
    "半年征程",
    "Half-year Journey",
    "历史跨度达到 180 天",
    "Track assets for 180 days",
    "age",
    180,
  ],
  [
    "comeback",
    "🔄",
    "绝地反击",
    "Comeback",
    "亏损后下一次盈利",
    "Profit after a loss",
    "comeback",
    1,
  ],
  [
    "double",
    "🎯",
    "首次翻倍",
    "First Double",
    "净资产较最初记录翻倍",
    "Double initial net worth",
    "double",
    2,
  ],
  [
    "break_even",
    "🎰",
    "零和博弈",
    "Break Even",
    "某次盈亏恰好为 0",
    "A record change equals zero",
    "flat",
    0,
  ],
  ...ASSET_COMPONENT_KEYS.map((key) => {
    const ids = {
      equipment: "bd_equip_1b",
      inventory: "bd_inv_1b",
      marketListings: "bd_order_1b",
      houses: "bd_house_1b",
      abilities: "bd_skill_1b",
      nonTradableTokens: "bd_tokens_1b",
      shrine: "bd_shrine_1b",
    };
    const meta = ASSET_COMPONENT_META[key];
    return [
      ids[key],
      "🧩",
      `${meta.zh}大亨`,
      `${meta.en} Billionaire`,
      `${meta.zh}价值达到 1B`,
      `${meta.en} value reaches 1B`,
      "component",
      { key, value: 1e9 },
    ];
  }),
  [
    "bd_order_500m",
    "💰",
    "订单高手",
    "Listing Master",
    "订单价值达到 500M",
    "Listings reach 500M",
    "component",
    { key: "marketListings", value: 5e8 },
  ],
  [
    "bd_equip_5b",
    "⚔️",
    "装备至上",
    "Equipment Supreme",
    "装备价值达到 5B",
    "Equipment reaches 5B",
    "component",
    { key: "equipment", value: 5e9 },
  ],
  [
    "bd_balanced",
    "⚖️",
    "均衡发展",
    "Balanced Portfolio",
    "七项中至少四项有值且无一项超过 40%",
    "At least four components, none above 40%",
    "componentBalanced",
    0.4,
  ],
  [
    "bd_specialist",
    "🎯",
    "专精路线",
    "Specialist",
    "某一分项占比超过 60%",
    "One component exceeds 60%",
    "componentSpecialist",
    0.6,
  ],
  [
    "bd_all_up",
    "📈",
    "全面提升",
    "All Components Up",
    "某日七项资产全部增长",
    "All seven components rise on one day",
    "componentAllUp",
    7,
  ],
];

export function calculateAchievements(entries, persisted = {}) {
  const values = finiteEntries(entries);
  const changes = normalizedDailyChanges(values);
  let streak = 0;
  let maximumStreak = 0;
  for (const change of changes) {
    streak = change.totalChange >= 0 ? streak + 1 : 0;
    maximumStreak = Math.max(maximumStreak, streak);
  }
  const firstValue = values[0]?.[1]?.values?.total;
  const latestValue = values.at(-1)?.[1]?.values?.total;
  const age = values.length > 1 ? dayGap(values[0][0], values.at(-1)[0]) : 0;
  return ACHIEVEMENT_DEFINITIONS.map(
    ([
      id,
      icon,
      zhName,
      enName,
      zhDescription,
      enDescription,
      kind,
      target,
    ]) => {
      let match = null;
      if (kind === "networth") {
        match = values.find(([, record]) => record.values.total >= target);
      } else if (kind === "profit") {
        match = changes.find((change) => change.totalChange >= target);
      } else if (kind === "growth") {
        match = changes.find(
          (change) =>
            change.previous > 0 &&
            (change.totalChange / change.previous) * 100 >= target,
        );
      } else if (kind === "streak" && maximumStreak >= target) {
        let running = 0;
        match = changes.find((change) => {
          running = change.totalChange >= 0 ? running + 1 : 0;
          return running >= target;
        });
      } else if (kind === "age" && age >= target) {
        match = values.find(([date]) => dayGap(values[0][0], date) >= target);
      } else if (kind === "comeback") {
        match = changes.find(
          (change, index) =>
            index > 0 &&
            changes[index - 1].totalChange < 0 &&
            change.totalChange > 0,
        );
      } else if (kind === "double" && latestValue >= firstValue * target) {
        match = values.find(
          ([, record]) => record.values.total >= firstValue * target,
        );
      } else if (kind === "flat") {
        match = changes.find((change) => change.totalChange === 0);
      } else if (kind === "component") {
        match = values.find(([, record]) => {
          const value = record.values[target.key];
          return Number.isFinite(value) && value >= target.value;
        });
      } else if (
        kind === "componentBalanced" ||
        kind === "componentSpecialist"
      ) {
        match = values.find(([, record]) => {
          const components = ASSET_COMPONENT_KEYS.map(
            (key) => record.values[key],
          ).filter((value) => Number.isFinite(value) && value > 0);
          const total = components.reduce((sum, value) => sum + value, 0);
          if (!(total > 0)) return false;
          const maximumShare = Math.max(...components) / total;
          return kind === "componentBalanced"
            ? components.length >= 4 && maximumShare < target
            : maximumShare > target;
        });
      } else if (kind === "componentAllUp") {
        match = values.slice(1).find(([, record], index) =>
          ASSET_COMPONENT_KEYS.every((key) => {
            const previousValue = values[index][1].values[key];
            const currentValue = record.values[key];
            return (
              Number.isFinite(previousValue) &&
              Number.isFinite(currentValue) &&
              currentValue > previousValue
            );
          }),
        );
      }
      const saved = persisted[id];
      const unlocked = Boolean(match || saved?.unlocked);
      return {
        id,
        icon,
        zhName,
        enName,
        zhDescription,
        enDescription,
        unlocked,
        date: match?.date ?? match?.[0] ?? saved?.date ?? null,
      };
    },
  );
}

function percentile(sorted, percent) {
  return sorted[
    Math.min(sorted.length - 1, Math.floor(sorted.length * percent))
  ];
}

export function simulateNetWorth(
  entries,
  {
    days = 90,
    windowSize = 60,
    runs = 2_000,
    target = null,
    random = Math.random,
  } = {},
) {
  const values = finiteEntries(entries);
  if (values.length < 7) return { status: "insufficient", required: 7 };
  const source = windowSize > 0 ? values.slice(-windowSize - 1) : values;
  const returns = [];
  for (let index = 1; index < source.length; index += 1) {
    const previous = source[index - 1][1].values.total;
    const current = source[index][1].values.total;
    if (!(previous > 0) || !(current > 0)) continue;
    const gap = Math.max(1, dayGap(source[index - 1][0], source[index][0]));
    returns.push(Math.log(current / previous) / gap);
  }
  if (returns.length < 3) return { status: "insufficient", required: 4 };
  const horizon = Math.min(365, Math.max(1, Math.floor(days)));
  const count = Math.min(10_000, Math.max(100, Math.floor(runs)));
  const current = values.at(-1)[1].values.total;
  const mu = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mu) ** 2, 0) /
    Math.max(1, returns.length - 1);
  const sigma = Math.sqrt(variance);
  let ewmaVariance = returns[0] ** 2;
  for (let index = 1; index < returns.length; index += 1) {
    ewmaVariance = 0.94 * ewmaVariance + 0.06 * returns[index] ** 2;
  }
  const useBootstrap = returns.length >= 15;
  const paths = Array.from(
    { length: count },
    () => new Float64Array(horizon + 1),
  );
  const randomNormal = () => {
    let left = random();
    let right = random();
    if (left <= 0) left = Number.EPSILON;
    if (right <= 0) right = Number.EPSILON;
    return Math.sqrt(-2 * Math.log(left)) * Math.cos(2 * Math.PI * right);
  };
  for (let run = 0; run < count; run += 1) {
    paths[run][0] = current;
    if (useBootstrap) {
      let day = 1;
      while (day <= horizon) {
        const start = Math.floor(random() * returns.length);
        for (let block = 0; block < 5 && day <= horizon; block += 1) {
          paths[run][day] =
            paths[run][day - 1] *
            Math.exp(returns[(start + block) % returns.length]);
          day += 1;
        }
      }
    } else {
      for (let day = 1; day <= horizon; day += 1) {
        paths[run][day] =
          paths[run][day - 1] *
          Math.exp(mu - 0.5 * variance + sigma * randomNormal());
      }
    }
  }
  const series = { p10: [], p25: [], p50: [], p75: [], p90: [] };
  for (let day = 0; day <= horizon; day += 1) {
    const column = paths.map((path) => path[day]).sort((a, b) => a - b);
    series.p10.push(percentile(column, 0.1));
    series.p25.push(percentile(column, 0.25));
    series.p50.push(percentile(column, 0.5));
    series.p75.push(percentile(column, 0.75));
    series.p90.push(percentile(column, 0.9));
  }
  const resolvedTarget = Number(target) > 0 ? Number(target) : null;
  const probabilities = {};
  if (resolvedTarget) {
    for (const checkpoint of [30, 60, 90].filter((day) => day <= horizon)) {
      probabilities[checkpoint] =
        (paths.filter((path) => path[checkpoint] >= resolvedTarget).length /
          count) *
        100;
    }
  }
  return {
    status: "complete",
    method: useBootstrap ? "block-bootstrap" : "gbm",
    current,
    days: horizon,
    runs: count,
    target: resolvedTarget,
    dailyGrowthPercent: (Math.exp(mu) - 1) * 100,
    dailyVolatilityPercent: (Math.exp(Math.sqrt(ewmaVariance)) - 1) * 100,
    doublingDays: mu > 0 ? Math.ceil(Math.LN2 / mu) : null,
    series,
    probabilities,
  };
}
