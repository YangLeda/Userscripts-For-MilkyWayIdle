import { runtime } from "../core/runtime.js";

const STYLE_ID = "mwitools-semi-auto-train-style";
const CONTROL_CLASS = "mwi-train-controls";
const DETAIL_CLASS = "mwi-train-detail-modal";
const INPUT_SELECTOR =
  'div[class*="SkillActionDetail_maxActionCountInput"] input';
const PANEL_SELECTOR =
  'div[class*="SkillActionDetail_regularComponent"],div[class*="SkillActionDetail_skillActionDetail"]';
const LOADOUT_SELECTOR = '[class*="SkillActionDetail_loadoutDropdown"]';
const BUTTONS_SELECTOR = '[class*="SkillActionDetail_buttonsContainer"]';
const TRAIN_TIMEOUT_MS = 60_000;
const ACTION_NAVIGATION_HANDLERS = [
  "handleGoToActionTypeDetail",
  "handleClickActionTypeDetail",
  "handleGoToActionType",
  "handleSelectActionType",
  "handleGoToActionDetail",
  "handleSelectAction",
  "handleClickAction",
  "handleGoToAction",
];

let activeTrain = null;
let scanPending = false;
let navigationRequestId = 0;

function raf(callback) {
  return (globalThis.requestAnimationFrame ?? globalThis.setTimeout)(callback);
}

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function visible(element) {
  if (!element?.isConnected || element.hidden) return false;
  const style = globalThis.getComputedStyle?.(element);
  return style?.display !== "none" && style?.visibility !== "hidden";
}

function showToast(message) {
  document
    .querySelectorAll(".mwi-train-toast")
    .forEach((node) => node.remove());
  const toast = document.createElement("div");
  toast.className = "mwi-train-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${CONTROL_CLASS}{display:flex;align-items:center;gap:4px;margin-left:auto}
    .mwi-train-button{height:24px;padding:0 8px;border:1px solid rgba(144,166,235,.55);border-radius:4px;background:#282844;color:#e8e8ef;font:600 11px/1 Roboto,Arial,sans-serif;cursor:pointer;white-space:nowrap}
    .mwi-train-button:hover{filter:brightness(1.16)}
    .mwi-train-button:disabled{cursor:default;filter:none;opacity:.58}
    .mwi-train-button[data-kind="cancel"]{border-color:rgba(235,144,144,.55);background:#5c2a2a}
    .mwi-train-button[data-kind="cart"]{border-color:rgba(245,180,70,.65);background:#43351f}
    .${DETAIL_CLASS}{position:fixed;inset:0;z-index:2147483100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.58)}
    .${DETAIL_CLASS}>section{box-sizing:border-box;width:min(470px,calc(100vw - 24px));max-height:80vh;overflow:auto;padding:16px 20px;border:1px solid #90a6eb;border-radius:8px;background:#1c1c2c;color:#e8e8ef;box-shadow:0 5px 20px rgba(0,0,0,.55);font-size:13px}
    .mwi-train-detail-title{margin-bottom:9px;padding-bottom:6px;border-bottom:1px solid #444;font-size:15px;font-weight:700}
    .mwi-train-detail-row{display:flex;align-items:center;gap:7px;padding:4px 0}.mwi-train-detail-row[data-current="true"]{color:#ffe27a}.mwi-train-detail-row>span:first-child{min-width:0;flex:1}.mwi-train-detail-count{flex:0 0 auto;color:#9fd9ff}.mwi-train-detail-terminal{color:#80df91}
    .mwi-train-detail-close{margin-top:12px}
    .mwi-train-toast{position:fixed;right:14px;top:14px;z-index:2147483200;max-width:min(380px,calc(100vw - 28px));padding:8px 11px;border:1px solid rgba(245,158,11,.55);border-radius:5px;background:rgba(15,18,28,.97);color:#eee;font-size:.75rem;box-shadow:0 8px 22px rgba(0,0,0,.4)}
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function panelContext() {
  for (const input of document.querySelectorAll(INPUT_SELECTOR)) {
    if (!visible(input)) continue;
    const panel = input.closest(PANEL_SELECTOR) ?? input.parentElement;
    const actionHrid = runtime.api.resolveProductionAction?.(panel);
    if (!panel || !actionHrid) continue;
    return { panel, input, actionHrid };
  }
  return null;
}

function outputForAction(actionHrid) {
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  return runtime.api.getExpectedOutputs?.(detail)?.[0]?.itemHrid ?? "";
}

function localizedItem(itemHrid) {
  return runtime.api.procurement?.resolveItemName?.(itemHrid) ?? itemHrid;
}

function localizeStep(step, index) {
  const output = localizedItem(step.outputHrid);
  if (step.kind === "shop") {
    return `${index + 1}. ${t("商店购买", "Buy from shop")}「${output}」`;
  }
  if (step.kind === "craft") {
    return `${index + 1}. ${t("制造", "Craft")}「${output}」`;
  }
  return `${index + 1}. ${t("升级", "Upgrade")}「${localizedItem(step.inputHrid)}」→「${output}」`;
}

function createButton(text, kind, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mwi-train-button";
  button.dataset.kind = kind;
  button.textContent = text;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handler(event);
  });
  return button;
}

function closeDetail() {
  document.querySelector(`.${DETAIL_CLASS}`)?.remove();
}

export function showTrainDetail(plan, currentIndex = null) {
  closeDetail();
  const modal = document.createElement("div");
  modal.className = DETAIL_CLASS;
  const box = document.createElement("section");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  const title = document.createElement("div");
  title.className = "mwi-train-detail-title";
  title.textContent = t("🚂 火车详情", "🚂 Train details");
  box.appendChild(title);
  plan.steps.forEach((step, index) => {
    const row = document.createElement("div");
    row.className = "mwi-train-detail-row";
    row.dataset.current = String(index === currentIndex);
    const label = document.createElement("span");
    label.textContent = `${index === currentIndex ? "▶ " : "　"}${localizeStep(step, index)}`;
    const count = document.createElement("span");
    count.className = "mwi-train-detail-count";
    count.textContent = Number.isFinite(step.count)
      ? `× ${runtime.api.formatExactNumber?.(step.count) ?? step.count}`
      : t("保持当前次数", "Keep current count");
    row.append(label, count);
    if (index === plan.steps.length - 1) {
      const terminal = document.createElement("span");
      terminal.className = "mwi-train-detail-terminal";
      terminal.textContent = t("终点", "Final");
      row.appendChild(terminal);
    }
    box.appendChild(row);
  });
  const close = createButton(t("关闭", "Close"), "detail", closeDetail);
  close.classList.add("mwi-train-detail-close");
  box.appendChild(close);
  modal.appendChild(box);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeDetail();
  });
  document.body.appendChild(modal);
  return modal;
}

function fiberKey(element) {
  return Object.getOwnPropertyNames(element ?? {}).find(
    (key) =>
      key.startsWith("__reactFiber$") ||
      key.startsWith("__reactInternalInstance$"),
  );
}

function gameInstances() {
  const pageGlobal = globalThis.unsafeWindow ?? globalThis;
  const instances = [];
  if (pageGlobal.mwi?.game) instances.push(pageGlobal.mwi.game);
  const fibers = [];
  const rootElement = document.getElementById("root");
  for (const root of [
    rootElement?._reactRootContainer?.current,
    rootElement?._reactRootContainer?._internalRoot?.current,
  ]) {
    if (root) fibers.push(root);
  }
  for (const element of [
    rootElement,
    document.querySelector('[class*="GamePage_gamePage"]'),
    document.body,
  ]) {
    for (const key of Object.getOwnPropertyNames(element ?? {})) {
      if (
        key.startsWith("__reactContainer$") ||
        key.startsWith("__reactFiber$") ||
        key.startsWith("__reactInternalInstance$")
      ) {
        fibers.push(element[key]?.current ?? element[key]);
      }
    }
  }
  const visited = new Set();
  while (fibers.length && visited.size < 50_000) {
    const fiber = fibers.pop();
    if (!fiber || visited.has(fiber)) continue;
    visited.add(fiber);
    const instance = fiber.stateNode;
    if (
      instance &&
      (typeof instance.setState === "function" ||
        ACTION_NAVIGATION_HANDLERS.some(
          (handler) => typeof instance[handler] === "function",
        )) &&
      !instances.includes(instance)
    ) {
      instances.push(instance);
    }
    if (fiber.return) fibers.push(fiber.return);
    if (fiber.child) fibers.push(fiber.child);
    if (fiber.sibling) fibers.push(fiber.sibling);
  }
  return instances;
}

function nativeNavigationLink(fragment, labelPattern) {
  return [
    ...document.querySelectorAll('[class*="NavigationBar_navigationLink"]'),
  ]
    .filter((candidate) =>
      [...candidate.classList].some((name) =>
        name.startsWith("NavigationBar_navigationLink__"),
      ),
    )
    .find((candidate) => {
      const hrefs = [...candidate.querySelectorAll("use")]
        .map(
          (use) =>
            use.getAttribute("href") ?? use.getAttribute("xlink:href") ?? "",
        )
        .join(" ")
        .toLowerCase();
      return (
        (fragment && hrefs.includes(`#${fragment.toLowerCase()}`)) ||
        labelPattern?.test(candidate.textContent ?? "")
      );
    });
}

function clickActionCard(actionHrid) {
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  const outputHrid = runtime.api.getExpectedOutputs?.(detail)?.[0]?.itemHrid;
  const bare = String(outputHrid ?? "")
    .split("/")
    .at(-1);
  const names = new Set(
    [
      detail?.name,
      runtime.config.isZH ? runtime.data.ZHActionNames?.[actionHrid] : null,
    ]
      .filter(Boolean)
      .map((name) => String(name).replaceAll(/\s+/g, " ").trim()),
  );
  const card = [
    ...document.querySelectorAll('[class*="SkillAction_skillAction"]'),
  ]
    .filter(visible)
    .find((candidate) => {
      const hrefs = [...candidate.querySelectorAll("use")].map(
        (use) =>
          use.getAttribute("href") ?? use.getAttribute("xlink:href") ?? "",
      );
      const name = String(
        candidate.querySelector('[class*="SkillAction_name"]')?.textContent ??
          "",
      )
        .replaceAll(/\s+/g, " ")
        .trim();
      return (
        (bare && hrefs.some((href) => href.endsWith(`#${bare}`))) ||
        names.has(name)
      );
    });
  card?.click();
  return Boolean(card);
}

export function navigateToTrainAction(actionHrid) {
  const requestId = ++navigationRequestId;
  const invoke = () => {
    for (const game of gameInstances()) {
      for (const name of ACTION_NAVIGATION_HANDLERS) {
        if (typeof game[name] !== "function") continue;
        try {
          game[name](actionHrid);
          return true;
        } catch {
          // Try the next compatible game handler or React instance.
        }
      }
    }
    return false;
  };
  const skill = String(actionHrid).match(/^\/actions\/([^/]+)\//)?.[1];
  if (clickActionCard(actionHrid)) return true;
  const navigation = [
    ...document.querySelectorAll(
      '[class*="NavigationBar_navigationLink"],button,a,[data-target]',
    ),
  ].find((candidate) => {
    const identity = [
      candidate.getAttribute("data-target"),
      candidate.getAttribute("href"),
      candidate.getAttribute("aria-label"),
      candidate.id,
      ...[...(candidate.querySelectorAll?.("use") ?? [])].map(
        (use) =>
          use.getAttribute("href") ?? use.getAttribute("xlink:href") ?? "",
      ),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return skill && identity.includes(skill);
  });
  if (navigation) {
    navigation.click();
    const startedTrain = activeTrain;
    const deadline = Date.now() + TRAIN_TIMEOUT_MS;
    const open = () => {
      if (requestId !== navigationRequestId) return;
      if (startedTrain && activeTrain !== startedTrain) return;
      if (clickActionCard(actionHrid)) return;
      if (invoke()) return;
      if (Date.now() < deadline) setTimeout(open, 100);
    };
    setTimeout(open, 150);
    // Opening the skill page is a valid first navigation stage. Arrival is
    // verified from the mounted action panel by the normal train scanner.
    return true;
  }
  return invoke();
}

export function navigateToTrainShop(step) {
  const requestId = ++navigationRequestId;
  const game = gameInstances().find(
    (instance) =>
      typeof instance.setState === "function" &&
      instance.state?.navTarget !== undefined,
  );
  if (!step?.shopHrid) return false;
  let navigationAccepted = false;
  if (game) {
    try {
      if (game.state?.navTarget !== "shop")
        game.setState({ navTarget: "shop" });
      navigationAccepted = true;
    } catch {
      // Fall back to the native shop navigation below.
    }
  }
  if (!navigationAccepted) {
    const navigation = nativeNavigationLink("shop", /^(商店|shop)$/i);
    if (!navigation) return false;
    navigation.click();
    navigationAccepted = true;
  }
  const deadline = Date.now() + TRAIN_TIMEOUT_MS;
  const open = () => {
    if (requestId !== navigationRequestId) return;
    if (!activeTrain || Date.now() >= deadline) return;
    const panel = [
      ...document.querySelectorAll('[class*="ShopPanel_shopPanel"]'),
    ].find(visible);
    if (!panel) {
      setTimeout(open, 100);
      return;
    }
    const key = fiberKey(panel);
    let fiber = key ? panel[key] : null;
    let instance = null;
    while (fiber) {
      if (fiber.stateNode?.state?.shopItemHrid !== undefined) {
        instance = fiber.stateNode;
        break;
      }
      fiber = fiber.return;
    }
    const quantity = Math.max(1, Math.ceil(Number(step.count) || 1));
    if (instance) {
      try {
        instance.setState({
          shopItemHrid: step.shopHrid,
          shopItemQuantity: quantity,
          shopItemQuantityError: null,
        });
        return;
      } catch {
        // Use the visible shop card and native quantity input instead.
      }
    }
    const bare = String(step.outputHrid ?? "")
      .split("/")
      .at(-1);
    const itemName = localizedItem(step.outputHrid);
    const shopItem = [
      ...panel.querySelectorAll('[class*="ShopPanel_shopItem"]'),
    ]
      .filter(visible)
      .find((candidate) => {
        const hrefs = [...candidate.querySelectorAll("use")].map(
          (use) =>
            use.getAttribute("href") ?? use.getAttribute("xlink:href") ?? "",
        );
        const name = String(
          candidate.querySelector('[class*="ShopPanel_name"]')?.textContent ??
            "",
        ).trim();
        return (
          (bare && hrefs.some((href) => href.endsWith(`#${bare}`))) ||
          name === itemName
        );
      });
    if (!shopItem) {
      setTimeout(open, 100);
      return;
    }
    shopItem.click();
    const fill = () => {
      if (requestId !== navigationRequestId) return;
      if (!activeTrain || Date.now() >= deadline) return;
      const input = [
        ...document.querySelectorAll(
          '[class*="ShopPanel"] input[type="number"],[class*="Modal_modal"] input[type="number"]',
        ),
      ].find(visible);
      if (input) {
        setInput(input, quantity);
        return;
      }
      setTimeout(fill, 100);
    };
    raf(fill);
  };
  raf(open);
  return navigationAccepted;
}

function setInput(input, value) {
  if (!input || !Number.isFinite(value) || value <= 0) return false;
  if (runtime.api.reactInputTriggerHack) {
    runtime.api.reactInputTriggerHack(input, String(value));
    return true;
  }
  const previous = input.value;
  input.value = String(value);
  input._valueTracker?.setValue(previous);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function clearTrainListeners() {
  if (!activeTrain) return;
  if (activeTrain.queueButton && activeTrain.queueListener) {
    activeTrain.queueButton.removeEventListener(
      "click",
      activeTrain.queueListener,
      true,
    );
  }
  activeTrain.queueButton = null;
  activeTrain.queueListener = null;
  activeTrain.inventoryUnsubscribe?.();
  activeTrain.inventoryUnsubscribe = null;
}

function resetTrainTimeout() {
  if (!activeTrain) return;
  clearTimeout(activeTrain.timeout);
  if (activeTrain.index >= activeTrain.steps.length - 1) {
    activeTrain.timeout = null;
    return;
  }
  activeTrain.timeout = setTimeout(
    () =>
      cancelTrain(t("等待下一站超时", "Timed out waiting for the next stop")),
    TRAIN_TIMEOUT_MS,
  );
}

function queueButton(panel) {
  return [...panel.querySelectorAll(`${BUTTONS_SELECTOR} button,button`)].find(
    (button) => /添加到队列|add to queue/i.test(button.textContent ?? ""),
  );
}

function activeStepCount(context) {
  const step = activeTrain?.steps?.[activeTrain.index];
  if (!step) return null;
  const entered = runtime.api.trainPlanning.parseTrainCount(
    context?.input?.value,
  );
  if (entered) step.count = entered;
  return Number.isFinite(step.count) && step.count > 0 ? step.count : null;
}

function hasPlannedProducer(itemHrid) {
  return activeTrain?.allOutputHrids?.has(itemHrid) ?? false;
}

export function addCurrentTrainStepToCart(context = panelContext()) {
  if (!activeTrain) return { ok: false, added: 0, skipped: 0 };
  const currentIndex = activeTrain.index;
  const current = activeTrain.steps[currentIndex];
  if (current.kind === "shop") {
    showToast(
      t("商店站点无需加入市场购物车", "Shop stops do not use the market cart"),
    );
    return { ok: false, added: 0, skipped: 0 };
  }
  if (!activeStepCount(context)) {
    showToast(t("请先填写本步次数", "Enter the action count first"));
    return { ok: false, added: 0, skipped: 0 };
  }
  activeTrain.cartStepIndexes.add(currentIndex);
  const groups = [...activeTrain.cartStepIndexes].map((index) => {
    const step = activeTrain.steps[index];
    const requirements = runtime.api.procurement.calculateRequirements(
      step.actionHrid,
      step.count,
      { excludeActionHrids: new Set() },
    );
    return requirements.materials.filter(
      (material) =>
        !(
          material.itemHrid === step.inputHrid &&
          hasPlannedProducer(step.inputHrid)
        ),
    );
  });
  const materials = runtime.api.procurement.aggregateRequirements(groups);
  const result = runtime.api.procurement.addRequirementsToCart(
    materials,
    "train",
  );
  showToast(
    result.added
      ? t(
          `本步缺料已加入购物车（${result.added} 种）`,
          `Added this stop's shortages (${result.added})`,
        )
      : t("本步没有新的缺料", "No new shortages for this stop"),
  );
  scheduleScan();
  return result;
}

function advanceTrain() {
  if (!activeTrain) return;
  clearTrainListeners();
  if (activeTrain.index >= activeTrain.steps.length - 1) {
    finishTrain();
    return;
  }
  activeTrain.index += 1;
  activeTrain.readyActionHrid = "";
  goToCurrentStep();
}

export function notifyCurrentTrainStepQueued(context = panelContext()) {
  if (!activeTrain) return false;
  activeStepCount(context);
  setTimeout(advanceTrain, 0);
  return true;
}

function wirePanel(context) {
  if (!activeTrain) return;
  const step = activeTrain.steps[activeTrain.index];
  if (step.kind === "shop" || context.actionHrid !== step.actionHrid) return;
  if (activeTrain.readyActionHrid !== step.actionHrid) {
    activeTrain.readyActionHrid = step.actionHrid;
    if (Number.isFinite(step.count) && step.count > 0) {
      setTimeout(() => {
        if (activeTrain?.steps?.[activeTrain.index] !== step) return;
        const latest = panelContext();
        if (latest?.actionHrid === step.actionHrid)
          setInput(latest.input, step.count);
      }, 100);
    }
    if (
      activeTrain.index === activeTrain.steps.length - 1 &&
      !activeTrain.arrivalShown
    ) {
      activeTrain.arrivalShown = true;
      showToast(
        t(
          "火车已到终点，请手动加入队列",
          "Final stop reached; add it to the queue manually",
        ),
      );
    }
  }
  const button = queueButton(context.panel);
  if (button && button !== activeTrain.queueButton) {
    clearTrainListeners();
    activeTrain.queueButton = button;
    activeTrain.queueListener = () => notifyCurrentTrainStepQueued(context);
    button.addEventListener("click", activeTrain.queueListener, true);
  }
  resetTrainTimeout();
}

function watchShopStep(step) {
  if (!activeTrain || activeTrain.inventoryUnsubscribe) return;
  const owned = runtime.api.procurement.getInventoryCount(step.outputHrid, 0);
  const target = owned + Math.max(0, Number(step.count) || 0);
  if (target <= owned) {
    advanceTrain();
    return;
  }
  activeTrain.inventoryUnsubscribe = runtime.api.procurement.on(
    "inventory:change",
    () => {
      if (!activeTrain) return;
      if (
        runtime.api.procurement.getInventoryCount(step.outputHrid, 0) < target
      ) {
        return;
      }
      advanceTrain();
    },
  );
  showToast(
    t(
      `购买 ${step.count} 个「${localizedItem(step.outputHrid)}」后自动续站`,
      `Buy ${step.count} ${localizedItem(step.outputHrid)} to continue automatically`,
    ),
  );
  resetTrainTimeout();
}

function goToCurrentStep() {
  if (!activeTrain) return;
  const step = activeTrain.steps[activeTrain.index];
  const navigated =
    step.kind === "shop"
      ? (activeTrain.navigateShop ?? navigateToTrainShop)(step)
      : (activeTrain.navigateAction ?? navigateToTrainAction)(step.actionHrid);
  if (!navigated) {
    cancelTrain(t("无法打开下一站", "Could not open the next stop"));
    return;
  }
  if (step.kind === "shop") watchShopStep(step);
  resetTrainTimeout();
  scheduleScan();
}

export function startTrain(plan, options = {}) {
  cancelTrain("");
  if (plan?.cycle || plan?.truncated) {
    showToast(
      plan.cycle
        ? t(
            "升级链存在循环，无法启动火车",
            "The upgrade chain contains a cycle",
          )
        : t(
            "升级链过长，无法安全启动火车",
            "The upgrade chain is too long to start safely",
          ),
    );
    return false;
  }
  const allSteps = (plan?.steps ?? []).map((step) => ({ ...step }));
  const hasPlannedCounts = allSteps.some((step) => Number.isFinite(step.count));
  const firstNeeded = allSteps.findIndex(
    (step) => !Number.isFinite(step.count) || step.count > 0,
  );
  const steps = hasPlannedCounts
    ? allSteps.slice(firstNeeded < 0 ? allSteps.length : firstNeeded)
    : allSteps;
  if (!steps.length) {
    showToast(
      t("库存已经足够，无需开火车", "Inventory already covers this train"),
    );
    return false;
  }
  activeTrain = {
    ...plan,
    steps,
    index: 0,
    cartStepIndexes: new Set(),
    allOutputHrids: new Set(allSteps.map((step) => step.outputHrid)),
    queueButton: null,
    queueListener: null,
    inventoryUnsubscribe: null,
    timeout: null,
    readyActionHrid: "",
    arrivalShown: false,
    navigateAction: options.navigateAction,
    navigateShop: options.navigateShop,
  };
  goToCurrentStep();
  return true;
}

export function cancelTrain(reason = "") {
  if (!activeTrain) return false;
  navigationRequestId += 1;
  clearTrainListeners();
  clearTimeout(activeTrain.timeout);
  activeTrain = null;
  closeDetail();
  scheduleScan();
  if (reason) showToast(`${t("火车已停止：", "Train stopped: ")}${reason}`);
  return true;
}

export function finishTrain() {
  if (!activeTrain) return false;
  navigationRequestId += 1;
  clearTrainListeners();
  clearTimeout(activeTrain.timeout);
  activeTrain = null;
  closeDetail();
  scheduleScan();
  showToast(t("火车已完成", "Train completed"));
  return true;
}

export function getTrainState() {
  if (!activeTrain) return null;
  return {
    index: activeTrain.index,
    steps: activeTrain.steps.map((step) => ({ ...step })),
    cartStepIndexes: [...activeTrain.cartStepIndexes],
  };
}

function idlePlan(context) {
  const outputHrid = outputForAction(context.actionHrid);
  if (!outputHrid) return null;
  const count = runtime.api.trainPlanning.parseTrainCount(context.input.value);
  if (count) {
    return runtime.api.trainPlanning.createTrainPlan(outputHrid, {
      [outputHrid]: count,
    });
  }
  const chain = runtime.api.trainPlanning.buildTrainChain(outputHrid);
  return {
    ...chain,
    steps: chain.steps.map((step) => ({ ...step, count: null })),
  };
}

function controlsHost(context) {
  return (
    context.panel.querySelector(LOADOUT_SELECTOR) ??
    context.panel.querySelector(BUTTONS_SELECTOR) ??
    context.input.parentElement
  );
}

function renderControls(context) {
  const host = controlsHost(context);
  if (!host) return;
  const runningStep = activeTrain?.steps?.[activeTrain.index];
  const relevantRunningPanel =
    activeTrain &&
    (runningStep?.kind === "shop" ||
      context.actionHrid === runningStep?.actionHrid);
  const plan = activeTrain ?? idlePlan(context);
  const shouldShow =
    relevantRunningPanel || (!activeTrain && plan?.steps?.length >= 2);
  let controls = host.querySelector(`:scope > .${CONTROL_CLASS}`);
  if (!shouldShow) {
    controls?.remove();
    return;
  }
  const signature = JSON.stringify([
    Boolean(activeTrain),
    activeTrain?.index ?? -1,
    plan.steps.length,
    runningStep?.kind ?? "",
    context.actionHrid,
    runtime.config.isZH,
  ]);
  if (controls?.dataset.signature === signature) return;
  controls?.remove();
  controls = document.createElement("span");
  controls.className = CONTROL_CLASS;
  controls.dataset.signature = signature;
  controls.appendChild(
    createButton(t("📋 详情", "📋 Details"), "detail", () =>
      showTrainDetail(plan, activeTrain?.index ?? null),
    ),
  );
  if (activeTrain) {
    const cart = createButton(
      runningStep.kind === "shop"
        ? t("本步无需加购", "No cart items")
        : t("🛒 本步加购", "🛒 Add step shortages"),
      "cart",
      () => addCurrentTrainStepToCart(context),
    );
    cart.disabled = runningStep.kind === "shop";
    controls.appendChild(cart);
    controls.appendChild(
      createButton(
        `🛑 ${t("取消火车", "Cancel train")} (${activeTrain.index + 1}/${activeTrain.steps.length})`,
        "cancel",
        () => cancelTrain(t("用户取消", "Cancelled by user")),
      ),
    );
  } else {
    controls.appendChild(
      createButton(
        `🚂 ${t("开始火车", "Start train")} (${plan.steps.length}${t("步", " stops")})`,
        "start",
        () => startTrain(idlePlan(context)),
      ),
    );
  }
  host.appendChild(controls);
}

function scan() {
  scanPending = false;
  const context = panelContext();
  document.querySelectorAll(`.${CONTROL_CLASS}`).forEach((controls) => {
    if (!context?.panel.contains(controls)) controls.remove();
  });
  if (!context) return;
  if (activeTrain) wirePanel(context);
  renderControls(context);
}

function scheduleScan() {
  if (scanPending) return;
  scanPending = true;
  raf(scan);
}

function cleanup() {
  cancelTrain("");
  document
    .querySelectorAll(`.${CONTROL_CLASS}`)
    .forEach((node) => node.remove());
  document
    .querySelectorAll(".mwi-train-toast")
    .forEach((node) => node.remove());
  document.getElementById(STYLE_ID)?.remove();
  closeDetail();
  scanPending = false;
}

runtime.features.register({
  id: "semiAutoTrain",
  setting: "semiAutoTrain",
  scope: "character",
  dependsOn: ["procurementAssistant"],
  initialize({ scope }) {
    addStyles();
    scan();
    const observer = new MutationObserver(scheduleScan);
    scope.observer(observer, document.body, { childList: true, subtree: true });
    scope.interval(scan, 500);
    scope.add(cleanup);
  },
});

Object.assign(runtime.api, {
  semiAutoTrain: {
    start: startTrain,
    cancel: cancelTrain,
    finish: finishTrain,
    getState: getTrainState,
    addCurrentStepToCart: addCurrentTrainStepToCart,
    notifyQueued: notifyCurrentTrainStepQueued,
    navigateToAction: navigateToTrainAction,
    navigateToShop: navigateToTrainShop,
  },
});
