import { runtime } from "../core/runtime.js";
import { createFrameScheduler } from "../core/frame-scheduler.js";
import { subscribeMutationChannel } from "../core/mutation-channel.js";

function removeAll(selector) {
  document.querySelectorAll(selector).forEach((node) => node.remove());
}

function observeRelevantDom(scope, selector, callback) {
  const scheduler = createFrameScheduler(callback);
  subscribeMutationChannel(
    {
      name: "legacy-dom",
      target: document.body,
      options: { childList: true, subtree: true },
      scope,
    },
    (records) => {
      const relevant = records.some((record) => {
        const target =
          record.target?.nodeType === 1
            ? record.target
            : record.target?.parentElement;
        if (target?.closest?.(selector)) return true;
        return [...record.addedNodes, ...record.removedNodes].some(
          (node) =>
            node?.nodeType === 1 &&
            (node.matches?.(selector) || node.querySelector?.(selector)),
        );
      });
      if (relevant) scheduler.schedule();
    },
  );
  scope.add(() => scheduler.cancel());
  return scheduler;
}

function refreshInventoryIfNeeded(className, outputSelector) {
  const needsRender = [
    ...document.querySelectorAll('div[class*="Inventory_items"]'),
  ].some(
    (node) =>
      !node.classList.contains(className) ||
      (outputSelector && !node.parentElement?.querySelector(outputSelector)),
  );
  if (needsRender) runtime.api.scheduleNetworthRefresh?.();
}

const adapters = {
  invWorth: {
    scope: "character",
    initialize({ scope }) {
      runtime.api.scheduleNetworthRefresh?.();
      observeRelevantDom(
        scope,
        'div[class*="Inventory_items"],#script_inventory_summary',
        () =>
          refreshInventoryIfNeeded(
            "script_buildScore_added",
            "#script_inventory_summary",
          ),
      );
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
      observeRelevantDom(scope, 'div[class*="Inventory_items"]', () =>
        refreshInventoryIfNeeded(
          "script_invSort_added",
          "#script_inv_sort_controls",
        ),
      );
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
      observeRelevantDom(scope, 'div[class*="Header_actionInfo"]', () =>
        runtime.api.checkEquipment?.(),
      );
    },
    cleanup() {
      removeAll("#script_item_warning");
      removeAll("#mwitools-equipment-warning-style");
      document
        .querySelectorAll(".mwi-equipment-warning-host")
        .forEach((host) => host.classList.remove("mwi-equipment-warning-host"));
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
    observeRelevantDom(
      scope,
      'div[class*="NavigationBar_minorNavigationLinks"]',
      () => runtime.api.add3rdPartyLinks?.(),
    );
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
    let listingObserver = null;
    const attach = () => {
      const target = document.querySelector(
        ".MarketplacePanel_marketListings__1GCyQ",
      );
      if (!target || target === observed) return;
      listingObserver?.disconnect();
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
      observer.observe(target, { childList: true });
      listingObserver = observer;
    };
    attach();
    observeRelevantDom(
      scope,
      ".MarketplacePanel_marketListings__1GCyQ",
      attach,
    );
    scope.add(() => {
      listingObserver?.disconnect();
      listingObserver = null;
      observed = null;
    });
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
