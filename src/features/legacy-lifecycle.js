import { runtime } from "../core/runtime.js";

function removeAll(selector) {
  document.querySelectorAll(selector).forEach((node) => node.remove());
}

const adapters = {
  networth: {
    scope: "character",
    initialize() {
      runtime.api.calculateNetworth?.();
    },
    cleanup() {
      removeAll(
        "#script_current_assets,#script_inventory_summary,#script_api_fail_popout",
      );
    },
  },
  invWorth: {
    scope: "character",
    dependsOn: ["networth"],
    initialize() {
      runtime.api.scheduleNetworthRefresh?.();
    },
    cleanup() {
      removeAll("#script_inventory_summary");
    },
  },
  invSort: {
    scope: "character",
    dependsOn: ["networth"],
    initialize() {
      runtime.api.scheduleNetworthRefresh?.();
    },
    cleanup() {
      removeAll(
        "#script_sortByFair_btn,#script_sortByAsk_btn,#script_sortByBid_btn,#script_sortByNone_btn,#script_stack_price",
      );
    },
  },
  actionQueue: {
    scope: "character",
    cleanup() {
      removeAll(".script_actionTime,#script_queueTotalTime");
    },
  },
  checkEquipment: {
    scope: "character",
    initialize() {
      runtime.api.checkEquipment?.();
    },
    cleanup() {
      removeAll("#script_item_warning");
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
  "guildCreditConversionsSort",
  "profileBuildScore",
  "networkAlert",
  "battlePanel",
  "enhanceSim",
  "forceMWIToolsDisplayZH",
]) {
  adapters[id] = {};
}

adapters.skillbook = {
  scope: "character",
  initialize() {
    runtime.api.waitForItemDict?.();
  },
};
adapters.ThirdPartyLinks = {
  initialize() {
    runtime.api.add3rdPartyLinks?.();
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
