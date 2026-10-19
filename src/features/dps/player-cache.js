export const PLAYER_CACHE_LIMIT = 256;
const KEY = "kikimeter:player-cache:v1";

export function createPlayerCache(storage = globalThis.localStorage) {
  const entries = new Map();
  const trim = () => {
    while (entries.size > PLAYER_CACHE_LIMIT)
      entries.delete(entries.keys().next().value);
  };
  const save = () => {
    try {
      storage?.setItem(KEY, JSON.stringify([...entries]));
    } catch {}
  };
  try {
    const raw = storage?.getItem(KEY) || "[]";
    const loaded = raw.length <= 512_000 ? JSON.parse(raw) : [];
    if (Array.isArray(loaded))
      for (const item of loaded) {
        if (!Array.isArray(item) || item.length !== 2) continue;
        const [name, value] = item;
        if (typeof name !== "string" || !value || typeof value !== "object")
          continue;
        const normalized = {};
        for (const field of ["classId", "weaponHrid"])
          if (typeof value[field] === "string")
            normalized[field] = value[field].slice(0, 256);
        entries.set(name.slice(0, 160), normalized);
        trim();
      }
    trim();
    if (Array.isArray(loaded) && loaded.length > entries.size) save();
  } catch {}
  return {
    get(name, field) {
      const value = entries.get(name);
      if (!value) return undefined;
      entries.delete(name);
      entries.set(name, value);
      return value[field];
    },
    set(name, field, value) {
      if (typeof name !== "string" || !name || name.length > 160) return;
      const previous = entries.get(name),
        next = { ...previous };
      if (value) next[field] = String(value).slice(0, 256);
      else delete next[field];
      entries.delete(name);
      if (Object.keys(next).length) entries.set(name, next);
      trim();
      if (JSON.stringify(previous) !== JSON.stringify(next)) save();
    },
  };
}
