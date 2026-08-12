import { runtime } from "./core/runtime.js";
import "./core/config.js";
import "./data/translations.js";
import "./core/state.js";
import "./core/localization.js";
import "./core/market.js";
import "./core/action-projection.js";
import "./core/procurement.js";
import "./core/train-planning.js";
import "./core/xp-history.js";
import "./core/asset-values.js";
import "./core/message-state.js";
import "./core/messages.js";
import "./features/build-score.js";
import "./features/duplicate-script-warning.js";
import "./features/asset-history/index.js";
import "./features/public-api.js";
import "./features/leaderboard-overlay.js";
import "./features/battle-buffs.js";
import "./features/inventory.js";
import "./features/guild-credit-advisor.js";
import "./features/production-profit-panel.js";
import "./features/item-tooltips.js";
import "./features/action-panel.js";
import "./features/action-dashboard.js";
import "./features/procurement.js";
import "./features/semi-auto-train.js";
import "./features/tasks.js";
import "./features/task-train-planner.js";
import "./features/task-new-badge.js";
import "./features/task-auto-return.js";
import "./features/ability-book-calculator.js";
import "./features/inventory-market-double-click.js";
import "./features/opinion-center/index.js";
import "./features/guild-xp.js";
import "./features/game-widgets.js";
import "./features/navigation-action-queue.js";
import "./features/enhancement-tooltip.js";
import "./features/settings-and-notifications.js";
import "./features/update-banner.js";
import "./features/dps/index.js";
import "./features/external-tools.js";
import "./features/legacy-lifecycle.js";
import "./features/message-effects.js";

function loadCachedClientData() {
  const pageGlobal = globalThis.unsafeWindow ?? globalThis;
  const localStorageUtil = pageGlobal.localStorageUtil;
  if (
    !localStorage.getItem("initClientData") ||
    typeof localStorageUtil?.getInitClientData !== "function"
  ) {
    return false;
  }
  const clientData = localStorageUtil.getInitClientData();
  if (!clientData?.actionDetailMap || !clientData?.itemDetailMap) return false;
  GM_setValue("init_client_data", JSON.stringify(clientData));
  runtime.state.initData_actionDetailMap = clientData.actionDetailMap;
  runtime.state.initData_levelExperienceTable = clientData.levelExperienceTable;
  runtime.state.initData_enhancementLevelSuccessRateTable =
    clientData.enhancementLevelSuccessRateTable;
  runtime.state.initData_enhancementLevelTotalBonusMultiplierTable =
    clientData.enhancementLevelTotalBonusMultiplierTable;
  runtime.state.initData_itemDetailMap = clientData.itemDetailMap;
  runtime.state.initData_itemLocationDetailMap =
    clientData.itemLocationDetailMap;
  runtime.state.initData_houseRoomDetailMap = clientData.houseRoomDetailMap;
  runtime.state.initData_actionCategoryDetailMap =
    clientData.actionCategoryDetailMap;
  runtime.state.initData_abilityDetailMap = clientData.abilityDetailMap;
  runtime.state.initData_shopItemDetailMap = clientData.shopItemDetailMap;
  runtime.state.initData_taskShopItemDetailMap =
    clientData.taskShopItemDetailMap;
  runtime.state.initData_labyrinthShopItemDetailMap =
    clientData.labyrinthShopItemDetailMap;
  runtime.state.initData_openableLootDropMap = clientData.openableLootDropMap;
  runtime.state.initData_guildBuffDetailMap = clientData.guildBuffDetailMap;
  runtime.api.invalidateAssetValueCache();
  for (const [key, value] of Object.entries(
    runtime.state.initData_itemDetailMap,
  )) {
    runtime.state.itemEnNameToHridMap[value.name] = key;
  }
  return true;
}

function startGame() {
  const clientDataLoaded = loadCachedClientData();
  if (!clientDataLoaded) {
    runtime.features.register({
      id: "clientDataCache",
      initialize({ scope }) {
        const interval = scope.interval(() => {
          if (loadCachedClientData()) clearInterval(interval);
        }, 250);
      },
    });
  }
  runtime.api.loadMarketItemValuesFromStorage();
  runtime.api.hookWS();

  const currentApiVersion = 3;
  const storedApiVersion = localStorage.getItem(
    "MWITools_marketAPI_ApiVersion",
  );
  if (!storedApiVersion || parseInt(storedApiVersion) < currentApiVersion) {
    console.log(
      runtime.config.isZH
        ? "[MWITools] 市场 API 版本已更新，正在清理旧缓存。"
        : "[MWITools] Market API version changed; clearing the old cache.",
    );
    localStorage.setItem("MWITools_marketAPI_timestamp", JSON.stringify(0));
    localStorage.setItem("MWITools_marketAPI_json", JSON.stringify(null));
    localStorage.setItem(
      "MWITools_marketAPI_ApiVersion",
      JSON.stringify(currentApiVersion),
    );
  }
  runtime.api.fetchMarketJSON(true);
  runtime.start();
}

function main() {
  runtime.api.readSettings();

  if (
    document.URL.includes("amvoidguy.github.io") ||
    document.URL.includes("shykai.github.io/MWICombatSimulatorTest/")
  ) {
    runtime.api.addImportButtonForAmvoidguy();
    runtime.api.observeResultsForAmvoidguy();
    return;
  }
  if (
    document.URL.includes("mooneycalc.netlify.app") ||
    document.URL.includes("mooneycalc.vercel.app")
  ) {
    runtime.api.addImportButtonForMooneycalc();
    return;
  }
  startGame();
}

main();
