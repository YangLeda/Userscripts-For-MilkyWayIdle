import { runtime } from "./core/runtime.js";
import { startupDiagnostics } from "./core/startup-diagnostics.js";
import { scheduleSharedMigration } from "./core/shared-storage.js";
import "./core/game-data.js";
import "./core/game-assets.js";
import "./core/config.js";
import "./core/state.js";
import "./core/game-localization.js";
import "./core/localization.js";
import "./core/market.js";
import "./core/action-projection.js";
import "./core/procurement.js";
import "./core/planning.js";
import "./core/train-planning.js";
import "./core/xp-history.js";
import "./core/asset-values.js";
import "./core/message-state.js";
import "./core/messages.js";
import "./features/build-score.js";
import "./features/duplicate-script-warning.js";
import "./features/mobile-viewport-fix.js";
import "./features/asset-history/index.js";
import "./features/planning.js";
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
import "./features/inventory-loot-double-click.js";
import "./features/inventory-market-double-click.js";
import "./features/opinion-center/index.js";
import "./features/guild-xp.js";
import "./features/game-widgets.js";
import "./features/navigation-action-queue.js";
import "./features/enhancement-tooltip.js";
import "./features/settings-and-notifications.js";
import "./features/performance-onboarding.js";
import "./features/update-banner.js";
import "./features/dps/index.js";
import "./features/external-tools.js";
import "./features/legacy-lifecycle.js";
import "./features/message-effects.js";

async function startGame() {
  startupDiagnostics.mark("client-data:read");
  const clientDataLoaded = runtime.api.refreshGameClientData();
  if (!clientDataLoaded) {
    runtime.features.register({
      id: "clientDataCache",
      initialize({ scope }) {
        const interval = scope.interval(() => {
          if (runtime.api.refreshGameClientData()) clearInterval(interval);
        }, 250);
      },
    });
  }
  startupDiagnostics.mark("market-cache:read");
  runtime.api.loadMarketItemValuesFromStorage();
  startupDiagnostics.mark("socket:hook");
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
  startupDiagnostics.mark("performance-setup:wait");
  try {
    await runtime.api.runPerformanceOnboardingIfNeeded();
  } catch (error) {
    console.error(
      runtime.config.isZH
        ? "[MWITools] 性能引导启动失败，将继续使用当前设置。"
        : "[MWITools] Performance setup failed; continuing with current settings.",
      error,
    );
  }
  startupDiagnostics.mark("features:start");
  await runtime.start();
  startupDiagnostics.mark("features:ready");
  scheduleSharedMigration();
}

export async function startApp() {
  startupDiagnostics.attachRuntime(runtime);
  runtime.features.pauseInitialization();
  startupDiagnostics.mark("settings:read");
  runtime.api.readSettings();
  startupDiagnostics.mark("settings:ready");

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
  await startGame();
}
