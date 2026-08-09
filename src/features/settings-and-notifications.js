import { runtime } from "../core/runtime.js";

/* 脚本设置面板 */
const waitForSetttins = () => {
  const targetNode = document.querySelector(
    "div.SettingsPanel_profileTab__214Bj",
  );
  if (targetNode) {
    if (!targetNode.querySelector("#script_settings")) {
      targetNode.insertAdjacentHTML(
        "beforeend",
        `<div id="script_settings"></div>`,
      );
      const insertElem = targetNode.querySelector("div#script_settings");
      insertElem.insertAdjacentHTML(
        "beforeend",
        `<div style="float: left; color: ${runtime.config.SCRIPT_COLOR_MAIN}">${
          runtime.config.isZH
            ? "MWITools 设置 （刷新生效）："
            : "MWITools Settings (refresh page to apply): "
        }</div></br>`,
      );

      for (const setting of Object.values(runtime.settings.settingsMap)) {
        insertElem.insertAdjacentHTML(
          "beforeend",
          `<div style="float: left;"><input type="checkbox" id="${setting.id}" ${setting.isTrue ? "checked" : ""}></input>${
            setting.desc
          }</div></br>`,
        );
      }

      insertElem.insertAdjacentHTML(
        "beforeend",
        `<div style="float: left;">${
          runtime.config.isZH
            ? "代码里搜索“自定义”可以手动修改字体颜色、强化模拟默认参数"
            : `Search "Customization" in code to customize font colors and default enhancement simulation parameters.`
        }</div></br>`,
      );
      insertElem.addEventListener("change", saveSettings);
    }
  }
  setTimeout(waitForSetttins, 500);
};

function saveSettings() {
  for (const checkbox of document.querySelectorAll(
    "div#script_settings input",
  )) {
    runtime.settings.settingsMap[checkbox.id].isTrue = checkbox.checked;
    localStorage.setItem(
      "script_settingsMap",
      JSON.stringify(runtime.settings.settingsMap),
    );
  }
}

function readSettings() {
  const ls = localStorage.getItem("script_settingsMap");
  if (ls) {
    const lsObj = JSON.parse(ls);
    for (const option of Object.values(lsObj)) {
      if (runtime.settings.settingsMap.hasOwnProperty(option.id)) {
        runtime.settings.settingsMap[option.id].isTrue = option.isTrue;
      }
    }
  }

  if (runtime.settings.settingsMap.forceMWIToolsDisplayZH.isTrue) {
    runtime.config.isZH = true; // For Traditional Chinese users.
  }

  if (
    runtime.settings.settingsMap.useOrangeAsMainColor.isTrue &&
    runtime.config.SCRIPT_COLOR_MAIN === "green"
  ) {
    runtime.config.SCRIPT_COLOR_MAIN = "orange";
  }
  if (
    runtime.settings.settingsMap.useOrangeAsMainColor.isTrue &&
    runtime.config.SCRIPT_COLOR_TOOLTIP === "darkgreen"
  ) {
    runtime.config.SCRIPT_COLOR_TOOLTIP = "#804600";
  }
}

/* 检查是否穿错生产/战斗装备 */
function checkEquipment() {
  if (runtime.state.currentActionsHridList.length === 0) {
    return;
  }
  const currentActionHrid = runtime.state.currentActionsHridList[0].actionHrid;
  const hasHat =
    runtime.state.currentEquipmentMap["/item_locations/head"]?.itemHrid ===
    "/items/red_chefs_hat"
      ? true
      : false; // Cooking, Brewing
  const hasOffHand =
    runtime.state.currentEquipmentMap["/item_locations/off_hand"]?.itemHrid ===
    "/items/eye_watch"
      ? true
      : false; // Cheesesmithing, Crafting, Tailoring
  const hasBoot =
    runtime.state.currentEquipmentMap["/item_locations/feet"]?.itemHrid ===
    "/items/collectors_boots"
      ? true
      : false; // Milking, Foraging, Woodcutting
  const hasGlove =
    runtime.state.currentEquipmentMap["/item_locations/hands"]?.itemHrid ===
    "/items/enchanted_gloves"
      ? true
      : false; // Enhancing

  let warningStr = null;
  if (currentActionHrid.includes("/actions/combat/")) {
    if (hasHat || hasOffHand || hasBoot || hasGlove) {
      warningStr = runtime.config.isZH
        ? "正穿着生产装备"
        : "Production equipment equipted";
    }
  } else if (
    currentActionHrid.includes("/actions/cooking/") ||
    currentActionHrid.includes("/actions/brewing/")
  ) {
    if (!hasHat && hasItemHridInInv("/items/red_chefs_hat")) {
      warningStr = runtime.config.isZH
        ? "没穿生产帽"
        : "Not wearing production hat";
    }
  } else if (
    currentActionHrid.includes("/actions/cheesesmithing/") ||
    currentActionHrid.includes("/actions/crafting/") ||
    currentActionHrid.includes("/actions/tailoring/")
  ) {
    if (!hasOffHand && hasItemHridInInv("/items/eye_watch")) {
      warningStr = runtime.config.isZH
        ? "没穿生产副手"
        : "Not wearing production off-hand";
    }
  } else if (
    currentActionHrid.includes("/actions/milking/") ||
    currentActionHrid.includes("/actions/foraging/") ||
    currentActionHrid.includes("/actions/woodcutting/")
  ) {
    if (!hasBoot && hasItemHridInInv("/items/collectors_boots")) {
      warningStr = runtime.config.isZH
        ? "没穿生产鞋"
        : "Not wearing production boots";
    }
  } else if (currentActionHrid.includes("/actions/enhancing")) {
    if (!hasGlove && hasItemHridInInv("/items/enchanted_gloves")) {
      warningStr = runtime.config.isZH
        ? "没穿强化手套"
        : "Not wearing enhancing gloves";
    }
  }

  document.body.querySelector("#script_item_warning")?.remove();
  if (warningStr) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="script_item_warning" style="position: fixed; top: 1%; left: 30%; color: ${runtime.config.SCRIPT_COLOR_ALERT}; font-size: 1rem;">${warningStr}</div>`,
    );
  }
}

function hasItemHridInInv(hrid) {
  let result = null;
  for (const item of runtime.state.initData_characterItems) {
    if (
      item.itemHrid === hrid &&
      item.itemLocationHrid === "/item_locations/inventory"
    ) {
      result = item;
    }
  }
  return result ? true : false;
}

/* 空闲时弹窗通知 */
function notificate() {
  if (typeof GM_notification === "undefined" || !GM_notification) {
    console.error("notificate null GM_notification");
    return;
  }
  if (runtime.state.currentActionsHridList.length > 0) {
    return;
  }
  console.log("notificate empty action");
  GM_notification({
    text: runtime.config.isZH ? "动作队列为空" : "Action queue is empty.",
    title: "MWITools",
  });
}

/* 市场价格自动输入最小压价 */
const waitForMarketOrders = () => {
  const element = document.querySelector(
    ".MarketplacePanel_marketListings__1GCyQ",
  );
  if (element) {
    console.log("start observe market order");
    new MutationObserver((mutationsList) => {
      mutationsList.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.classList.contains("Modal_modalContainer__3B80m")) {
            handleMarketNewOrder(node);
          }
        });
      });
    }).observe(element, {
      characterData: false,
      subtree: false,
      childList: true,
    });
  } else {
    setTimeout(waitForMarketOrders, 500);
  }
};

function handleMarketNewOrder(node) {
  const title = runtime.api.getOriTextFromElement(
    node.querySelector(".MarketplacePanel_header__yahJo"),
  );
  if (!title || title.includes(" Now") || title.includes("立即")) {
    return;
  }
  const label = node.querySelector("span.MarketplacePanel_bestPrice__3bgKp");
  const inputDiv = node.querySelector(
    ".MarketplacePanel_inputContainer__3xmB2 .MarketplacePanel_priceInputs__3iWxy",
  );
  if (!label || !inputDiv) {
    console.error("handleMarketNewOrder can not find elements");
    return;
  }

  label.click();

  const clickAdjustmentButton = (direction) => {
    const buttons = [...inputDiv.querySelectorAll("button")];
    const target = buttons.find((button) => {
      const label =
        `${button.textContent} ${button.getAttribute("aria-label") ?? ""} ${button.title ?? ""}`
          .trim()
          .toLowerCase();
      if (direction === "increase") {
        return label === "+" || label.includes("increase");
      }
      return label === "-" || label === "−" || label.includes("decrease");
    });
    target?.click();
    return Boolean(target);
  };

  if (
    runtime.api
      .getOriTextFromElement(label.parentElement)
      .toLowerCase()
      .includes("best buy") ||
    label.parentElement.textContent.includes("购买")
  ) {
    if (!clickAdjustmentButton("increase")) {
      console.error("handleMarketNewOrder cannot find increase price button");
    }
  } else if (
    runtime.api
      .getOriTextFromElement(label.parentElement)
      .toLowerCase()
      .includes("best sell") ||
    label.parentElement.textContent.includes("出售")
  ) {
    if (!clickAdjustmentButton("decrease")) {
      console.error("handleMarketNewOrder cannot find decrease price button");
    }
  }
}

/* 伤害统计 */

Object.assign(runtime.api, {
  waitForSetttins,
  saveSettings,
  readSettings,
  checkEquipment,
  hasItemHridInInv,
  notificate,
  waitForMarketOrders,
  handleMarketNewOrder,
});

runtime.registerStart("features/settings-and-notifications.js", () => {
  waitForSetttins();
});
