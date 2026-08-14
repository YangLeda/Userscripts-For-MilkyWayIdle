import { runtime } from "./runtime.js";

const CLIENT_DATA_STATE_FIELDS = Object.freeze({
  actionDetailMap: "initData_actionDetailMap",
  levelExperienceTable: "initData_levelExperienceTable",
  enhancementLevelSuccessRateTable: "initData_enhancementLevelSuccessRateTable",
  enhancementLevelTotalBonusMultiplierTable:
    "initData_enhancementLevelTotalBonusMultiplierTable",
  itemDetailMap: "initData_itemDetailMap",
  itemLocationDetailMap: "initData_itemLocationDetailMap",
  houseRoomDetailMap: "initData_houseRoomDetailMap",
  actionCategoryDetailMap: "initData_actionCategoryDetailMap",
  abilityDetailMap: "initData_abilityDetailMap",
  shopItemDetailMap: "initData_shopItemDetailMap",
  taskShopItemDetailMap: "initData_taskShopItemDetailMap",
  labyrinthShopItemDetailMap: "initData_labyrinthShopItemDetailMap",
  openableLootDropMap: "initData_openableLootDropMap",
  guildBuffDetailMap: "initData_guildBuffDetailMap",
  skillDetailMap: "initData_skillDetailMap",
  buffTypeDetailMap: "initData_buffTypeDetailMap",
  combatMonsterDetailMap: "initData_combatMonsterDetailMap",
});

let clientData = null;
let readyResolve;
let warnedReadFailure = false;
runtime.state.itemEnNameToHridMap ??= {};
const readyPromise = new Promise((resolve) => {
  readyResolve = resolve;
});

function pageGlobal() {
  return globalThis.unsafeWindow ?? globalThis.window ?? globalThis;
}

function validClientData(value) {
  return Boolean(value?.actionDetailMap && value?.itemDetailMap);
}

function rebuildEnglishItemIndex(data) {
  const index = {};
  for (const [hrid, detail] of Object.entries(data?.itemDetailMap ?? {})) {
    const name = String(detail?.name ?? "").trim();
    if (name) index[name] = hrid;
  }
  runtime.state.itemEnNameToHridMap = index;
}

function publishClientData(data) {
  clientData = data;
  runtime.state.clientData = data;
  for (const [sourceKey, stateKey] of Object.entries(
    CLIENT_DATA_STATE_FIELDS,
  )) {
    runtime.state[stateKey] = data[sourceKey] ?? null;
  }
  // Compatibility for the historical name consumed by localization code.
  runtime.state.initData_monsterDetailMap = data.combatMonsterDetailMap ?? null;
  rebuildEnglishItemIndex(data);
  runtime.api.invalidateAssetValueCache?.();
  runtime.api.resetGameLocalizationCache?.();
  if (typeof globalThis.GM_setValue === "function") {
    globalThis.GM_setValue("init_client_data", JSON.stringify(data));
  }
  readyResolve?.(data);
  readyResolve = null;
  return data;
}

export function refreshGameClientData() {
  const localStorageUtil = pageGlobal().localStorageUtil;
  if (typeof localStorageUtil?.getInitClientData !== "function") {
    return null;
  }
  let next;
  try {
    next = localStorageUtil.getInitClientData();
  } catch (error) {
    if (!warnedReadFailure) {
      warnedReadFailure = true;
      console.warn(
        "[MWITools] Could not read the game's client data cache.",
        error,
      );
    }
    return null;
  }
  return validClientData(next) ? publishClientData(next) : null;
}

export function getGameClientData() {
  return clientData;
}

export function whenGameClientDataReady() {
  return clientData ? Promise.resolve(clientData) : readyPromise;
}

Object.assign(runtime.api, {
  getGameClientData,
  refreshGameClientData,
  whenGameClientDataReady,
});
