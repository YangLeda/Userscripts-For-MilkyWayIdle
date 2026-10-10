// XP samples are immutable identities. Keep their merge metadata in compressed
// pages instead of a GM key for every sample and every expired deletion.
import LZString from "lz-string";

export const isPackedHistory = (key) =>
  /^MWITools_xp_history_v[12](?::|$)/.test(key);
const PAGE_SIZE = 128 * 1024;
const localize = (zh, en) =>
  (globalThis.localStorage?.getItem("i18nextLng") ?? "").startsWith("zh")
    ? zh
    : en;
const RETENTION = 30 * 24 * 60 * 60 * 1000;
const manifestKey = (prefix) => `${prefix}packed`;
const pageKey = (prefix, generation, index) =>
  `${prefix}page:${generation}:${index}`;

function generations(prefix) {
  const names = globalThis
    .GM_listValues()
    .filter(
      (name) =>
        name === manifestKey(prefix) || name.startsWith(`${prefix}commit:`),
    );
  return names
    .map((name) => [name, globalThis.GM_getValue(name, null)])
    .filter(([, manifest]) => manifest);
}
function readGeneration(prefix, manifest) {
  if (
    manifest.version !== 1 ||
    !Number.isInteger(manifest.pages) ||
    manifest.pages < 1 ||
    manifest.pages > 1024
  )
    throw new Error(
      localize("经验存储索引无效", "Invalid XP storage manifest"),
    );
  let data = "";
  for (let index = 0; index < manifest.pages; index++) {
    const page = globalThis.GM_getValue(
      pageKey(prefix, manifest.generation, index),
      null,
    );
    if (typeof page !== "string")
      throw new Error(
        localize("经验存储缺少数据页", "Missing XP storage page"),
      );
    data += page;
  }
  if (data.length !== manifest.length)
    throw new Error(localize("经验存储数据不完整", "Incomplete XP storage"));
  const entries = JSON.parse(LZString.decompressFromBase64(data));
  if (!Array.isArray(entries))
    throw new Error(localize("经验存储数据无效", "Invalid XP storage data"));
  return new Map(entries);
}
function mergeEntries(target, source, preferSource = false) {
  const targetFloor = target.get("[]")?.xpFloor ?? 0;
  const sourceFloor = source.get("[]")?.xpFloor ?? 0;
  const floor = Math.max(targetFloor, sourceFloor);
  if (sourceFloor > targetFloor) {
    for (const path of target.keys())
      if (expiredHistoryPath(path, floor) && !source.has(path))
        target.delete(path);
  }
  for (const [path, value] of source) {
    const previous = target.get(path);
    if (
      expiredHistoryPath(path, floor) &&
      !previous &&
      (value.deleted || sourceFloor < floor)
    )
      continue;
    if (
      !previous ||
      (value.updatedAt ?? 0) > (previous.updatedAt ?? 0) ||
      ((value.updatedAt ?? 0) === (previous.updatedAt ?? 0) &&
        (value.deleted || preferSource))
    )
      target.set(path, value);
  }
  if (target.has("[]") && floor)
    target.set("[]", { ...target.get("[]"), xpFloor: floor });
  return target;
}
export function readPackedHistory(prefix) {
  const commits = generations(prefix);
  if (!commits.length) return null;
  const entries = new Map();
  for (const [, manifest] of commits)
    mergeEntries(entries, readGeneration(prefix, manifest));
  return entries;
}

export function deleteStorageNames(names) {
  for (let index = 0; index < names.length; index += 4096) {
    const batch = names.slice(index, index + 4096);
    if (typeof globalThis.GM_deleteValues === "function")
      globalThis.GM_deleteValues(batch);
    else if (typeof globalThis.GM_deleteValue === "function")
      batch.forEach((name) => globalThis.GM_deleteValue(name));
  }
}

export function writePackedHistory(prefix, entries) {
  const previous = generations(prefix);
  // Independent commits survive simultaneous writers. Fold every generation we
  // retire into this one; a generation published after this read stays untouched.
  const merged = new Map();
  for (const [, manifest] of previous)
    mergeEntries(merged, readGeneration(prefix, manifest));
  mergeEntries(merged, entries, true);
  const floor = entries.get("[]")?.xpFloor ?? 0;
  for (const [path, value] of merged)
    if (
      expiredHistoryPath(path, floor) &&
      (value.deleted || !entries.has(path))
    )
      merged.delete(path);
  entries.clear();
  merged.forEach((value, path) => entries.set(path, value));
  const generation = `${Date.now()}-${Math.random()}`;
  const data = LZString.compressToBase64(JSON.stringify([...entries]));
  const pages = Math.ceil(data.length / PAGE_SIZE);
  const written = [];
  try {
    for (let index = 0; index < pages; index++) {
      const name = pageKey(prefix, generation, index);
      const value = data.slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE);
      written.push(name);
      globalThis.GM_setValue(name, value);
      if (globalThis.GM_getValue(name, null) !== value)
        throw new Error(
          localize("经验存储校验失败", "XP storage verification failed"),
        );
    }
  } catch (error) {
    deleteStorageNames(written);
    throw error;
  }
  // Publish only fully verified pages. The old generation stays recoverable if
  // any write fails; no legacy key is deleted before this commit succeeds.
  const manifest = { version: 1, generation, pages, length: data.length };
  const commitKey = `${prefix}commit:${generation}`;
  try {
    globalThis.GM_setValue(commitKey, manifest);
    if (
      JSON.stringify(globalThis.GM_getValue(commitKey)) !==
      JSON.stringify(manifest)
    )
      throw new Error(
        localize("经验存储索引校验失败", "XP manifest verification failed"),
      );
  } catch (error) {
    deleteStorageNames([commitKey, ...written]);
    throw error;
  }
  for (const [name, manifest] of previous)
    deleteStorageNames([
      name,
      ...Array.from({ length: manifest.pages }, (_, index) =>
        pageKey(prefix, manifest.generation, index),
      ),
    ]);
}

export function compactHistoryEntries(entries, inflate, perObject) {
  const result = new Map(entries);
  const root = result.get("[]");
  const floor = perObject
    ? Math.max(root?.xpFloor ?? 0, Date.now() - RETENTION)
    : 0;
  const children = new Map();
  const timestamps = new Map();
  for (const [path, entry] of entries) {
    const parts = JSON.parse(path);
    if (!parts.length) continue;
    const parent = JSON.stringify(parts.slice(0, -1));
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(parts.at(-1));
    timestamps.set(
      parts[0],
      Math.max(timestamps.get(parts[0]) ?? 0, entry?.updatedAt ?? 0),
    );
  }
  // Build the child index once; rebuilding it for each legacy sample is quadratic.
  // Collapse the old per-field schema without losing its record timestamp.
  for (const [path, entry] of entries) {
    const parts = JSON.parse(path);
    if (parts.length !== 1 || !parts[0].startsWith("xp:")) continue;
    const at = Number(parts[0].slice(parts[0].lastIndexOf(":") + 1));
    if (entry.deleted && at < floor) result.delete(path);
    else if (!entry.deleted && entry.type === "object") {
      const value = inflate(entries, parts, children);
      result.set(path, {
        ...entry,
        updatedAt: timestamps.get(parts[0]),
        type: "value",
        value,
      });
    }
  }
  for (const path of result.keys()) {
    const parts = JSON.parse(path);
    if (parts.length > 1 && parts[0].startsWith("xp:")) result.delete(path);
  }
  if (root)
    result.set("[]", { ...root, ...(perObject ? { xpFloor: floor } : {}) });
  return result;
}

export function expiredHistoryPath(path, floor) {
  const parts = JSON.parse(path);
  return (
    parts.length > 0 &&
    parts[0].startsWith("xp:") &&
    Number(parts[0].slice(parts[0].lastIndexOf(":") + 1)) < floor
  );
}
