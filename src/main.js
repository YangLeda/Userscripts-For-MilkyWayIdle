import { runtime } from "./core/runtime.js";
import "./core/config.js";
import "./data/translations.js";
import "./core/state.js";
import "./core/market.js";
import "./core/message-state.js";
import "./core/messages.js";
import "./features/inventory.js";
import "./features/build-score.js";
import "./features/item-tooltips.js";
import "./features/action-panel.js";
import "./features/game-widgets.js";
import "./features/enhancement.js";
import "./features/settings-and-notifications.js";
import "./features/combat.js";
import "./features/external-tools.js";
import "./features/message-effects.js";

function loadCachedClientData() {
  if (!localStorage.getItem("initClientData")) return;
  const clientData = localStorageUtil.getInitClientData();
  console.log(clientData);
  GM_setValue("init_client_data", JSON.stringify(clientData));
  runtime.state.initData_actionDetailMap = clientData.actionDetailMap;
  runtime.state.initData_levelExperienceTable = clientData.levelExperienceTable;
  runtime.state.initData_itemDetailMap = clientData.itemDetailMap;
  runtime.state.initData_actionCategoryDetailMap =
    clientData.actionCategoryDetailMap;
  runtime.state.initData_abilityDetailMap = clientData.abilityDetailMap;
  for (const [key, value] of Object.entries(
    runtime.state.initData_itemDetailMap,
  )) {
    runtime.state.itemEnNameToHridMap[value.name] = key;
  }
}

function startGame() {
  loadCachedClientData();
  runtime.api.loadMarketItemValuesFromStorage();
  runtime.api.hookWS();

  const currentApiVersion = 3;
  const storedApiVersion = localStorage.getItem(
    "MWITools_marketAPI_ApiVersion",
  );
  if (!storedApiVersion || parseInt(storedApiVersion) < currentApiVersion) {
    console.log("Clearing API cache due to ApiVersion update");
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
  if (document.URL.includes("shykai.github.io/mwisim")) {
    runtime.api.addImportButtonFor9Battles();
    runtime.api.observeResultsForAmvoidguy();
    return;
  }
  if (document.URL.includes("mooneycalc.netlify.app")) {
    runtime.api.addImportButtonForMooneycalc();
    return;
  }
  startGame();
}

main();
