import { runtime } from "../core/runtime.js";

function removeAll(selector) {
  document.querySelectorAll(selector).forEach((node) => node.remove());
}

const adapters = {
  invWorth: {
    scope: "character",
    initialize({ scope }) {
      runtime.api.scheduleNetworthRefresh?.();
      scope.interval(() => {
        const needsRender = [
          ...document.querySelectorAll('div[class*="Inventory_items"]'),
        ].some((node) => !node.classList.contains("script_buildScore_added"));
        if (needsRender) runtime.api.scheduleNetworthRefresh?.();
      }, 500);
    },
    cleanup() {
      removeAll("#script_inventory_summary");
      document.querySelectorAll(".script_buildScore_added").forEach((node) => {
        node.classList.remove("script_buildScore_added");
        delete node.dataset.mwitoolsInventoryDisplayVersion;
      });
      removeAll(".mwi-inventory-category-value");
      removeAll("#script_inv_sort_controls");
      document
        .querySelectorAll(".script_invSort_added")
        .forEach((node) => node.classList.remove("script_invSort_added"));
      runtime.api.scheduleNetworthRefresh?.();
    },
  },
  invSort: {
    scope: "character",
    initialize({ scope }) {
      runtime.api.scheduleNetworthRefresh?.();
      scope.interval(() => {
        const needsRender = [
          ...document.querySelectorAll('div[class*="Inventory_items"]'),
        ].some((node) => !node.classList.contains("script_invSort_added"));
        if (needsRender) runtime.api.scheduleNetworthRefresh?.();
      }, 500);
    },
    cleanup() {
      removeAll("#script_inv_sort_controls,#script_stack_price");
      document
        .querySelectorAll(".script_invSort_added")
        .forEach((node) => node.classList.remove("script_invSort_added"));
      runtime.api.scheduleNetworthRefresh?.();
    },
  },
  actionQueue: {
    scope: "character",
    cleanup() {
      runtime.api.disconnectActionQueueObservers?.();
      removeAll(".script_actionTime,#script_queueTotalTime");
    },
  },
  checkEquipment: {
    scope: "character",
    initialize({ scope }) {
      runtime.api.checkEquipment?.();
      scope.interval(() => runtime.api.checkEquipment?.(), 500);
    },
    cleanup() {
      removeAll("#script_item_warning");
      removeAll("#mwitools-equipment-warning-style");
      document
        .querySelectorAll(".mwi-equipment-warning-host")
        .forEach((host) => host.classList.remove("mwi-equipment-warning-host"));
    },
  },
  actionPanel_totalTime_quickInputs: {
    scope: "character",
    dependsOn: ["actionPanel_totalTime"],
    cleanup() {
      removeAll("#quickInputHourButtons,#quickInputCountButtons");
    },
  },
  actionPanel_foragingTotal: {
    scope: "character",
    dependsOn: ["actionPanel_totalTime"],
    cleanup() {
      removeAll("#totalProfit");
    },
  },
};

for (const id of [
  "useOrangeAsMainColor",
  "profileBuildScore",
  "battlePanel",
  "enhanceSim",
  "forceMWIToolsDisplayZH",
]) {
  adapters[id] = {};
}

adapters.ThirdPartyLinks = {
  initialize({ scope }) {
    runtime.api.add3rdPartyLinks?.();
    scope.interval(() => runtime.api.add3rdPartyLinks?.(), 500);
  },
  cleanup() {
    removeAll('[data-mwitools-external-link="true"]');
  },
};
adapters.notifiEmptyAction = {
  scope: "character",
  initialize() {
    runtime.api.notificate?.();
  },
};

adapters.fillMarketOrderPrice = {
  scope: "character",
  initialize({ scope }) {
    let observed = null;
    const attach = () => {
      const target = document.querySelector(
        ".MarketplacePanel_marketListings__1GCyQ",
      );
      if (!target || target === observed) return;
      observed = target;
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node?.classList?.contains("Modal_modalContainer__3B80m")) {
              runtime.api.handleMarketNewOrder?.(node);
            }
          }
        }
      });
      scope.observer(observer, target, { childList: true });
    };
    attach();
    scope.interval(attach, 500);
  },
};

for (const [id, adapter] of Object.entries(adapters)) {
  if (runtime.features.getStatus(id).status !== "unregistered") continue;
  runtime.features.register({
    id,
    setting: id,
    scope: adapter.scope ?? "global",
    dependsOn: adapter.dependsOn,
    initialize(context) {
      adapter.initialize?.(context);
    },
    cleanup() {
      adapter.cleanup?.();
    },
  });
}
