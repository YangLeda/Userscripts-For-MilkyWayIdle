const sumStats = (left, right) => {
  if (typeof left === "number" || typeof right === "number")
    return (Number(left) || 0) + (Number(right) || 0);
  if (
    (left && typeof left === "object") ||
    (right && typeof right === "object")
  )
    return Object.fromEntries(
      [
        ...new Set([...Object.keys(left || {}), ...Object.keys(right || {})]),
      ].map((key) => [key, sumStats(left?.[key], right?.[key])]),
    );
  return right || left;
};

export function compactCombatFragments(parts, limit = 100) {
  if (!Array.isArray(parts)) return [];
  const valid = parts.filter((part) => part && typeof part === "object");
  if (valid.length <= limit) return valid;
  const count = valid.length - limit + 1;
  const combined = valid.slice(0, count).reduce((left, right) => ({
    startedAt: left.startedAt || right.startedAt,
    endedAt: right.endedAt,
    reason: "较早重连片段（合并） / Earlier reconnect fragments (combined)",
    durationMs:
      (Number(left.durationMs) || 0) + (Number(right.durationMs) || 0),
    teamDamage:
      (Number(left.teamDamage) || 0) + (Number(right.teamDamage) || 0),
    players: sumStats(left.players, right.players),
    combinedFragments:
      (left.combinedFragments || 1) + (right.combinedFragments || 1),
  }));
  return [combined, ...valid.slice(count)];
}
