import { startupDiagnostics } from "./startup-diagnostics.js";

// These names belonged exclusively to the removed guild XP sampler.
// Match logical store boundaries, never a generic "guild" or "xp" substring.
export function isRetiredGuildStorageKey(key) {
  return (
    key === "MWITools_xp_history_v1" ||
    /^(MWITools_xp_history_v2:|MWITools_xp_migrated:|MWITools_xp_object_migrated_v2:)/.test(
      key,
    )
  );
}

export function isRetiredGuildStorageName(name) {
  if (isRetiredGuildStorageKey(name)) return true;
  const match = String(name).match(
    /^MWITools_shared_v1:(live|test):(record|revision|migration|recovery):(.*)$/,
  );
  if (!match) return false;
  const [, , kind, remainder] = match;
  try {
    if (kind === "record" || kind === "revision") {
      const split = remainder.indexOf(":");
      if (kind === "record" && split < 0) return false;
      const encoded = kind === "record" ? remainder.slice(0, split) : remainder;
      return isRetiredGuildStorageKey(decodeURIComponent(encoded));
    }
    if (kind === "recovery")
      return isRetiredGuildStorageName(decodeURIComponent(remainder));
    // Migration markers contain the origin followed by the unencoded logical key.
    return /:MWITools_xp_history_v1$|:(MWITools_xp_history_v2|MWITools_xp_migrated|MWITools_xp_object_migrated_v2):/.test(
      remainder,
    );
  } catch {
    return false;
  }
}

export async function cleanupRetiredGuildStorage(
  host = globalThis,
  diagnostics = startupDiagnostics,
) {
  const counts = { local: 0, shared: 0, failed: 0, database: "unavailable" };
  const langText = (zh, en) =>
    /^zh/i.test(host.navigator?.language ?? "en") ? zh : en;
  const yieldTask = () => new Promise((resolve) => host.setTimeout(resolve, 0));
  const failure = (phase, error) => {
    counts.failed += 1;
    diagnostics.error(`storage:guild-cleanup:${phase}:failed`, error);
    host.console?.warn?.(
      "[MWITools] Retired guild storage cleanup failed; retrying on next startup",
      phase,
      error,
    );
  };
  diagnostics.mark("storage:guild-cleanup:begin", null, true);
  // Start asynchronous database deletion without reading or opening its records.
  const database = new Promise((resolve) => {
    if (!host.indexedDB?.deleteDatabase) return resolve();
    let timer;
    const finish = (status) => {
      host.clearTimeout(timer);
      counts.database = status;
      resolve();
    };
    try {
      const request = host.indexedDB.deleteDatabase("MWIToolsHistory");
      timer = host.setTimeout(() => finish("pending"), 500);
      request.onsuccess = () => {
        finish("deleted");
        diagnostics.mark("storage:guild-cleanup:database-deleted", null, true);
      };
      request.onerror = () => {
        failure("database", request.error);
        finish("failed");
      };
      request.onblocked = () => {
        diagnostics.mark(
          "storage:guild-cleanup:database-blocked",
          "Close older game tabs to release the database",
          true,
        );
        host.console?.warn?.(
          "[MWITools] Guild history database deletion blocked by an older tab; close that tab and reload",
        );
        finish("blocked");
      };
    } catch (error) {
      failure("database", error);
      finish("failed");
    }
  });
  try {
    const storage = host.localStorage;
    const names = Array.from({ length: storage?.length ?? 0 }, (_, index) =>
      storage.key(index),
    ).filter(isRetiredGuildStorageName);
    for (let index = 0; index < names.length; index += 32) {
      await yieldTask();
      for (const name of names.slice(index, index + 32)) {
        storage.removeItem(name);
        counts.local += 1;
      }
    }
  } catch (error) {
    failure("local", error);
  }
  try {
    if (typeof host.GM_listValues === "function") {
      const names = host.GM_listValues().filter(isRetiredGuildStorageName);
      const bulk = typeof host.GM_deleteValues === "function";
      if (names.length && !bulk && typeof host.GM_deleteValue !== "function")
        throw new Error(
          langText(
            "脚本管理器的存储删除接口不可用",
            "Userscript storage deletion API unavailable",
          ),
        );
      const size = bulk ? 128 : 32;
      for (let index = 0; index < names.length; index += size) {
        await yieldTask();
        const batch = names.slice(index, index + size);
        if (bulk) await host.GM_deleteValues(batch);
        else for (const name of batch) await host.GM_deleteValue(name);
        counts.shared += batch.length;
        diagnostics.mark(
          "storage:guild-cleanup:progress",
          `${counts.shared}/${names.length} shared keys`,
        );
      }
      if (names.length && host.GM_listValues().some(isRetiredGuildStorageName))
        throw new Error(
          langText(
            "旧公会经验存储仍存在，将在下次启动重试清理",
            "Retired guild keys remain; cleanup will retry on next startup",
          ),
        );
    }
  } catch (error) {
    failure("shared", error);
  }
  await database;
  diagnostics.mark(
    "storage:guild-cleanup:finished",
    JSON.stringify(counts),
    true,
  );
  if (counts.local || counts.shared)
    host.console?.info?.("[MWITools] Removed retired guild XP storage", {
      ...counts,
    });
  return counts;
}
