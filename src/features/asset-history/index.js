import { runtime } from "../../core/runtime.js";
import {
  getLatestAssetSnapshot,
  onAssetSnapshot,
  refreshAssetSnapshot,
  scheduleAssetSnapshotRefresh,
} from "./00-snapshot.js";
import { assetHistoryStore, getUtc8DayKey } from "./10-store.js";
import { createAssetHistoryUi } from "./30-panel.js";

function detectRoleName() {
  if (runtime.state.currentCharacterName) {
    return String(runtime.state.currentCharacterName).trim();
  }
  const candidate = [
    ".CharacterName_name__1amXp span",
    '[class*="CharacterName_name"] span',
    '[data-testid="character-name"]',
  ]
    .map((selector) => document.querySelector(selector))
    .find(Boolean);
  return String(candidate?.textContent ?? "").trim();
}

function currentScopeKey() {
  return assetHistoryStore.scopeKey(runtime.state.currentCharacterId);
}

const assetHistoryApi = {
  storageKey: "MWITools_asset_history_v1",
  record(snapshot = getLatestAssetSnapshot(), scopeKey = currentScopeKey()) {
    return assetHistoryStore.record(snapshot, scopeKey);
  },
  getHistory(scopeKey = currentScopeKey()) {
    return assetHistoryStore.list(scopeKey);
  },
  getComparison(dayKey = getUtc8DayKey(), scopeKey = currentScopeKey()) {
    return assetHistoryStore.comparison(dayKey, scopeKey);
  },
  getSevenDayAverage(dayKey = getUtc8DayKey(), scopeKey = currentScopeKey()) {
    return assetHistoryStore.sevenDayAverage(dayKey, scopeKey);
  },
  updateDay(dayKey, values, scopeKey = currentScopeKey()) {
    return assetHistoryStore.updateDay(dayKey, values, scopeKey);
  },
  deleteDay(dayKey, scopeKey = currentScopeKey()) {
    return assetHistoryStore.deleteDay(dayKey, scopeKey);
  },
  cleanup(scopeKey = currentScopeKey()) {
    return assetHistoryStore.cleanupInvalid(scopeKey);
  },
  detectAnomalies(scopeKey = currentScopeKey()) {
    return assetHistoryStore.detectAnomalies(scopeKey);
  },
  exportBackup() {
    return assetHistoryStore.exportBackup();
  },
  importBackup(backup, options = {}) {
    return assetHistoryStore.importBackup(backup, {
      scopeKey: currentScopeKey(),
      ...options,
    });
  },
  migrateLegacy(options = {}) {
    return assetHistoryStore.migrateLegacy({
      scopeKey: currentScopeKey(),
      roleName: detectRoleName(),
      ...options,
    });
  },
  refresh: refreshAssetSnapshot,
  scheduleRefresh: scheduleAssetSnapshotRefresh,
};

runtime.api.assetHistory = assetHistoryApi;

runtime.features.register({
  id: "assetHistory",
  setting: "assetHistory",
  scope: "character",
  initialize({ scope, characterId }) {
    const scopeKey = assetHistoryStore.scopeKey(characterId);
    assetHistoryStore.migrateLegacy({
      scopeKey,
      roleName: detectRoleName(),
    });
    const ui = createAssetHistoryUi({
      scope,
      store: assetHistoryStore,
      scopeKey,
    });
    const consume = (snapshot) => {
      if (String(snapshot?.characterId ?? "") !== String(characterId)) return;
      assetHistoryStore.record(snapshot, scopeKey);
      ui.update(snapshot);
    };
    scope.add(onAssetSnapshot(consume));
    const latest = getLatestAssetSnapshot();
    if (latest) consume(latest);
    void refreshAssetSnapshot();
    return () => ui.destroy();
  },
});
