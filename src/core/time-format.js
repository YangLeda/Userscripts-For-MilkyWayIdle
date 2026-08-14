export function formatRemainingDuration(seconds, isZH = true) {
  if (seconds === Infinity) return "∞";
  if (!Number.isFinite(seconds)) return "—";
  const normalized = Math.max(0, Math.round(seconds));
  const units = [
    [86_400, "天", "d"],
    [3_600, "小时", "h"],
    [60, "分", "m"],
    [1, "秒", "s"],
  ];
  let remainder = normalized;
  const parts = [];
  for (const [size, zh, en] of units) {
    const value = Math.floor(remainder / size);
    remainder %= size;
    if (value > 0 || (size === 1 && parts.length === 0)) {
      parts.push(`${value}${isZH ? zh : en}`);
    }
  }
  return parts.join(isZH ? "" : " ");
}

export function format24HourClock(timestamp, isZH = true) {
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat(isZH ? "zh-CN" : "en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

export function calendarDayOffset(fromTimestamp, toTimestamp) {
  const from = new Date(fromTimestamp);
  const to = new Date(toTimestamp);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  const fromDay = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toDay - fromDay) / 86_400_000);
}

export function formatRemainingTiming(
  totalSeconds,
  finishAt,
  { isZH = true, now = Date.now() } = {},
) {
  const duration = formatRemainingDuration(totalSeconds, isZH);
  if (!Number.isFinite(finishAt)) return duration;
  const clock = format24HourClock(finishAt, isZH);
  const dayOffset = Math.max(0, calendarDayOffset(now, finishAt));
  const finish = isZH ? `（${clock}）` : ` (${clock})`;
  if (dayOffset === 0) return `${duration}${finish}`;
  const offset = isZH
    ? `（+${dayOffset}天）`
    : ` (+${dayOffset} ${dayOffset === 1 ? "day" : "days"})`;
  return `${duration}${finish}${offset}`;
}
