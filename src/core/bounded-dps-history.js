import { compactCombatFragments } from "./combat-fragments.js";

export const DPS_HISTORY_KEY = "kikimeter:history:v2";
export const MAX_DPS_HISTORY_BYTES = 1_000_000;

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const id = (entry) =>
  String(
    entry?.id || entry?.combatKey || entry?.date || entry?.startedAt || "",
  );
const timestamp = (entry) => {
  const value = Date.parse(
    entry?.endedAt ?? entry?.date ?? entry?.startedAt ?? "",
  );
  return Number.isFinite(value) ? value : 0;
};

export function boundDpsHistory(entries) {
  if (!Array.isArray(entries)) throw new TypeError("Invalid DPS history");
  const counts = new Map(),
    seen = new Set(),
    result = [];
  let bytes = 2;
  const size = (raw) =>
    typeof globalThis.TextEncoder === "function"
      ? new globalThis.TextEncoder().encode(raw).length
      : new Blob([raw]).size;
  for (const entry of [...entries].sort(
    (a, b) => timestamp(b) - timestamp(a),
  )) {
    const key = id(entry);
    if (!entry || typeof entry !== "object" || !key || seen.has(key)) continue;
    seen.add(key);
    const type = entry.type || "combat",
      count = counts.get(type) || 0;
    if (entry.favorite !== true && count >= 10) continue;
    const boundedEntry = Array.isArray(entry.fragments)
      ? { ...entry, fragments: compactCombatFragments(entry.fragments) }
      : entry;
    const cost = size(JSON.stringify(boundedEntry)) + (result.length ? 1 : 0);
    if (bytes + cost > MAX_DPS_HISTORY_BYTES) continue;
    bytes += cost;
    if (entry.favorite !== true) counts.set(type, count + 1);
    result.push(boundedEntry);
  }
  return result;
}

// Apply only this tab's edits. Missing current IDs were removed elsewhere and
// must not be revived by an old tab renaming or re-saving its stale snapshot.
export function mergeDpsHistory(current, before, incoming, removedThrough = 0) {
  const base = new Map(before.map((entry) => [id(entry), entry]));
  const next = new Map(incoming.map((entry) => [id(entry), entry]));
  const merged = new Map(current.map((entry) => [id(entry), entry]));
  for (const key of base.keys()) if (!next.has(key)) merged.delete(key);
  for (const [key, entry] of next) {
    if (!base.has(key)) {
      if (
        removedThrough > 0 &&
        !merged.has(key) &&
        timestamp(entry) <= removedThrough
      )
        continue;
      merged.set(key, entry);
      continue;
    }
    if (!merged.has(key)) continue;
    const previous = base.get(key),
      value = { ...merged.get(key) };
    for (const field of new Set([
      ...Object.keys(previous),
      ...Object.keys(entry),
    ])) {
      if (equal(previous[field], entry[field])) continue;
      if (Object.hasOwn(entry, field))
        Object.defineProperty(value, field, {
          value: entry[field],
          enumerable: true,
          configurable: true,
          writable: true,
        });
      else delete value[field];
    }
    merged.set(key, value);
  }
  return boundDpsHistory(
    [...merged.values()].sort((a, b) => timestamp(b) - timestamp(a)),
  );
}
