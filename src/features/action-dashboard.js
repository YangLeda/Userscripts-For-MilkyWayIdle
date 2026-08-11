import { runtime } from "../core/runtime.js";

const STYLE_ID = "mwitools-action-dashboard-style";

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function formatDuration(seconds) {
  if (seconds === Infinity) return "∞";
  if (!Number.isFinite(seconds)) return "—";
  const normalized = Math.max(0, Math.round(seconds));
  if (normalized < 86_400) {
    return runtime.api.timeReadable?.(normalized) ?? `${normalized}s`;
  }
  const days = Math.floor(normalized / 86_400);
  const hours = Math.floor((normalized % 86_400) / 3_600);
  const minutes = Math.floor((normalized % 3_600) / 60);
  const parts = [t(`${days}天`, `${days}d`)];
  if (hours > 0) parts.push(t(`${hours}小时`, `${hours}h`));
  if (minutes > 0) parts.push(t(`${minutes}分`, `${minutes}m`));
  return parts.join(" ");
}

function formatClock(timestamp) {
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat(runtime.config.isZH ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function number(value) {
  return runtime.api.createFormattedNumber(value);
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .mwi-action-dashboard-host { position:relative!important; }
    .mwi-action-dashboard { position:absolute; top:50%; right:0; z-index:5; box-sizing:border-box; max-width:calc(100% - var(--mwi-action-dashboard-left,0px)); margin:0; padding:2px 6px; transform:translateY(-50%); border:1px solid rgba(255,255,255,.1); border-radius:4px; background:rgba(0,0,0,.18); font:inherit; font-size:.6875rem; line-height:1.25; white-space:normal; overflow:visible; pointer-events:none; }
    .mwi-action-line { display:flex; align-items:center; flex-wrap:wrap; gap:3px 10px; max-width:100%; color:#ffa500; }
    .mwi-action-line > * { min-width:0; white-space:nowrap; }
    .mwi-action-line strong { color:inherit; font-weight:650; }
    .mwi-production-card { width:100%; max-width:100%; min-width:0; box-sizing:border-box; contain:inline-size; margin-top:6px; padding:6px; border:1px solid rgba(255,255,255,.12); border-radius:5px; background:rgba(255,255,255,.025); color:var(--color-text-primary,#eee); font-size:.6875rem; }
    .mwi-production-card-title { padding:0 2px 4px; font-size:.72rem; font-weight:600; }
    .mwi-production-metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; }
    .mwi-production-metric { min-width:0; padding:4px 3px; border-radius:3px; background:rgba(0,0,0,.14); text-align:center; }
    .mwi-production-label { min-height:1.45em; color:var(--color-text-secondary,#aaa); font-size:.6rem; line-height:1.2; }
    .mwi-production-value { margin-top:1px; font-size:.7rem; line-height:1.25; font-weight:600; overflow-wrap:anywhere; }
    .mwi-production-warning { margin:4px 2px 0; color:#d7bb67; font-size:.6rem; line-height:1.25; }
    .mwi-max-action-button { margin-inline-start:4px; }
    @media(max-width:520px){.mwi-production-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.mwi-action-line{gap:2px 8px}}
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function getLiveActionTiming(host) {
  const currentAction =
    host?.closest?.('[class*="Header_currentAction"]') ?? host?.parentElement;
  const bar = currentAction?.querySelector?.(
    '[class*="ProgressBar_progressBar"]',
  );
  if (!bar) return { durationPerAction: null, currentCycleRemaining: null };

  let durationPerAction = Number(bar.style?.getPropertyValue?.("--duration"));
  if (!Number.isFinite(durationPerAction) || durationPerAction <= 0) {
    const text = runtime.api.getOriTextFromElement?.(
      bar.querySelector('[class*="ProgressBar_text"]'),
    );
    const match = String(text ?? "")
      .replace(",", ".")
      .match(/[\d.]+/);
    durationPerAction = match ? Number(match[0]) : null;
  }
  if (!Number.isFinite(durationPerAction) || durationPerAction <= 0) {
    return { durationPerAction: null, currentCycleRemaining: null };
  }

  const active = bar.querySelector('[class*="ProgressBar_active"]');
  const transform = active
    ? (active.ownerDocument?.defaultView?.getComputedStyle(active).transform ??
      active.style?.transform)
    : null;
  const match = String(transform ?? "").match(/^matrix(?:3d)?\(\s*(-?[\d.]+)/);
  const progress = match ? Number(match[1]) : null;
  const currentCycleRemaining = Number.isFinite(progress)
    ? durationPerAction * (1 - Math.min(1, Math.max(0, progress)))
    : durationPerAction;
  return { durationPerAction, currentCycleRemaining };
}

function getNativeEnhancementCount(host, action) {
  if (!String(action?.actionHrid ?? "").includes("/enhancing")) return null;
  const nativeText = [...(host?.childNodes ?? [])]
    .filter((node) => node.nodeType !== 1 || node.id !== "mwi-action-dashboard")
    .map((node) => node.textContent ?? "")
    .join(" ")
    .trim();
  const match = nativeText.match(/\(([\d\s.,]+)\)\s*$/);
  if (!match) return null;
  const count = Number(match[1].replace(/\D/g, ""));
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function getProductionPanelDuration(panel) {
  for (const value of panel?.querySelectorAll(
    'div[class*="SkillActionDetail_value"]',
  ) ?? []) {
    const text = String(runtime.api.getOriTextFromElement?.(value) ?? "")
      .trim()
      .replaceAll(runtime.config.THOUSAND_SEPERATOR, "")
      .replace(runtime.config.DECIMAL_SEPERATOR, ".");
    const match = text.match(/^([\d.]+)\s*s$/i);
    if (match && Number(match[1]) > 0) return Number(match[1]);
  }
  return null;
}

function renderActionDashboard() {
  addStyles();
  const host = document.querySelector('div[class*="Header_actionName"]');
  const actions = runtime.state.currentActionsHridList ?? [];
  if (!host || !actions.length) {
    document.querySelector("#mwi-action-dashboard")?.remove();
    document
      .querySelectorAll(".mwi-action-dashboard-host")
      .forEach((element) =>
        element.classList.remove("mwi-action-dashboard-host"),
      );
    return;
  }
  const current = actions[0];
  const timing = getLiveActionTiming(host);
  const enhancementCount = getNativeEnhancementCount(host, current);
  const projection = runtime.api.projectAction(
    current,
    enhancementCount ?? undefined,
    {
      durationPerAction: timing.durationPerAction,
      currentCycleRemainingSeconds: timing.currentCycleRemaining,
    },
  );
  let root = host.querySelector("#mwi-action-dashboard");
  if (!root) {
    root = document.createElement("div");
    root.id = "mwi-action-dashboard";
    root.className = "mwi-action-dashboard";
    host.appendChild(root);
  }
  host.classList.add("mwi-action-dashboard-host");
  root.style.position = "absolute";
  const lastNativeChild = [...host.children]
    .filter(
      (element) => element !== root && element.id !== "script_item_warning",
    )
    .at(-1);
  const hostRect = host.getBoundingClientRect();
  const childRect = lastNativeChild?.getBoundingClientRect();
  const left = Math.max(
    0,
    (childRect?.right ?? hostRect.left) - hostRect.left + 7,
  );
  root.style.left = `${left}px`;
  root.style.setProperty("--mwi-action-dashboard-left", `${left}px`);
  root.replaceChildren();
  root.removeAttribute("title");

  const primary = document.createElement("div");
  primary.className = "mwi-action-line";
  const remaining = document.createElement("span");
  const effectivelyInfinite =
    projection.effectivelyInfinite ?? projection.infinite;
  const effectiveCount = projection.effectiveCount ?? projection.count;
  remaining.append(
    `${t("剩余", "Remaining")} `,
    effectivelyInfinite ? "∞" : number(effectiveCount),
  );
  if (projection.materialLimited) {
    remaining.title = t(
      "已按当前库存中的可用原料计算",
      "Limited by materials currently in inventory",
    );
  } else if (enhancementCount !== null) {
    remaining.title = t(
      "已按强化栏当前可处理数量计算",
      "Based on the amount currently available for enhancement",
    );
  }
  const currentTime = document.createElement("span");
  currentTime.textContent = `${t("还需", "Time left")} ${formatDuration(
    projection.totalSeconds,
  )}`;
  const eta = document.createElement("strong");
  eta.textContent = projection.finishAt
    ? `${t("预计完成", "Finishes at")} ${formatClock(projection.finishAt)}`
    : `${t("预计完成", "Finishes at")} —`;
  primary.append(remaining, currentTime, eta);
  root.append(primary);
}

function findActionPanel() {
  const candidates = [
    ...document.querySelectorAll(
      'div[class*="SkillActionDetail_regularComponent"],div[class*="SkillActionDetail_skillActionDetail"]',
    ),
  ];
  const visible = candidates.filter((candidate) => {
    for (let current = candidate; current; current = current.parentElement) {
      if (current.hidden || current.getAttribute("aria-hidden") === "true") {
        return false;
      }
      const style =
        current.ownerDocument?.defaultView?.getComputedStyle(current);
      if (style?.display === "none" || style?.visibility === "hidden") {
        return false;
      }
    }
    return true;
  });
  return (
    visible.find((candidate) =>
      String(candidate.className).includes("regularComponent"),
    ) ??
    visible.at(-1) ??
    null
  );
}

function getCountInput(panel) {
  return panel?.querySelector(
    'div[class*="SkillActionDetail_maxActionCountInput"] input',
  );
}

function findInfinityButton(panel, input) {
  const container =
    input?.closest('div[class*="SkillActionDetail_actionContainer"]') ?? panel;
  return [...(container?.querySelectorAll("button") ?? [])].find((button) => {
    if (button.classList.contains("mwi-max-action-button")) return false;
    const text = String(
      runtime.api.getOriTextFromElement?.(button) ?? button.textContent ?? "",
    ).trim();
    return text === "∞" || /infinite|unlimited/i.test(button.title ?? "");
  });
}

function setReactInputValue(input, value) {
  if (typeof runtime.api.reactInputTriggerHack === "function") {
    runtime.api.reactInputTriggerHack(input, value);
    return;
  }
  const view = input.ownerDocument?.defaultView ?? window;
  const previous = input.value;
  const setter = Object.getOwnPropertyDescriptor(
    view.HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input._valueTracker?.setValue(previous);
  input.dispatchEvent(new view.Event("input", { bubbles: true }));
}

function syncMaxButton(panel, input, maxCraftable) {
  let button = panel?.querySelector(".mwi-max-action-button");
  const infinityButton = findInfinityButton(panel, input);
  if (!input || !infinityButton) {
    button?.remove();
    return;
  }
  if (!button) {
    button = infinityButton.cloneNode(false);
    button.type = "button";
    button.classList.add("mwi-max-action-button");
    button.textContent = t("最大", "Max");
    button.addEventListener("click", () => {
      const count = Number(button.dataset.maxCraftable);
      if (!Number.isSafeInteger(count) || count <= 0) return;
      const livePanel = button.closest(
        'div[class*="SkillActionDetail_regularComponent"],div[class*="SkillActionDetail_skillActionDetail"]',
      );
      const liveInput = getCountInput(livePanel) ?? input;
      setReactInputValue(liveInput, String(count));
      liveInput.dispatchEvent(
        new (liveInput.ownerDocument?.defaultView?.Event ?? Event)("change", {
          bubbles: true,
        }),
      );
      renderProductionPanel();
    });
    infinityButton.insertAdjacentElement("afterend", button);
  }
  const enabled = Number.isSafeInteger(maxCraftable) && maxCraftable > 0;
  button.disabled = !enabled;
  button.dataset.maxCraftable = enabled ? String(maxCraftable) : "";
  button.title = enabled
    ? t(
        `填入库存最多可做 ${maxCraftable} 次`,
        `Use inventory maximum: ${maxCraftable}`,
      )
    : t("当前没有有限的可生产次数", "No finite production maximum");
}

function resolvePanelAction(panel) {
  const name = runtime.api
    .getOriTextFromElement?.(
      panel?.querySelector('div[class*="SkillActionDetail_name"]'),
    )
    ?.trim();
  if (!name) return null;

  const gameUsesChinese = runtime.config.isZHInGameSetting;
  if (gameUsesChinese) {
    const localizedAction = Object.entries(
      runtime.data.ZHActionNames ?? {},
    ).find(([, localizedName]) => localizedName === name);
    if (localizedAction) return localizedAction[0];
  }

  const actionMap = runtime.state.initData_actionDetailMap;
  if (!actionMap) return null;

  const candidateNames = new Set([name]);
  if (gameUsesChinese) {
    const translatedName = runtime.api.getActionEnNameFromZhName?.(name);
    if (translatedName) candidateNames.add(translatedName);
  }
  for (const [actionHrid, detail] of Object.entries(actionMap)) {
    if (candidateNames.has(detail?.name)) return actionHrid;
  }

  const localizedItem = gameUsesChinese
    ? Object.entries(runtime.data.ZHItemNames ?? {}).find(
        ([, localizedName]) => localizedName === name,
      )
    : null;
  if (localizedItem) {
    const [itemHrid] = localizedItem;
    const outputAction = Object.entries(actionMap).find(([, detail]) =>
      runtime.api
        .getExpectedOutputs?.(detail)
        .some((output) => output.itemHrid === itemHrid),
    );
    if (outputAction) return outputAction[0];
  }

  return runtime.api.getActionHridFromItemName?.(name) ?? null;
}

function isProductionAction(actionHrid) {
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  if (!detail) return false;
  const actionType = String(detail.type ?? "");
  if (actionType.includes("combat")) return false;
  return Boolean(runtime.api.getExpectedOutputs?.(detail)?.length);
}

function metric(label, value) {
  const box = document.createElement("div");
  box.className = "mwi-production-metric";
  const caption = document.createElement("div");
  caption.className = "mwi-production-label";
  caption.textContent = label;
  const content = document.createElement("div");
  content.className = "mwi-production-value";
  if (value?.nodeType) content.append(value);
  else content.textContent = value;
  box.append(caption, content);
  return box;
}

function renderProductionPanel() {
  addStyles();
  const panel = findActionPanel();
  const input = getCountInput(panel);
  const existingCards = [
    ...document.querySelectorAll("#mwi-production-summary"),
  ];
  if (!panel) {
    existingCards.forEach((card) => card.remove());
    document
      .querySelectorAll(".mwi-max-action-button")
      .forEach((button) => button.remove());
    return;
  }
  existingCards
    .filter((card) => !panel.contains(card))
    .forEach((card) => card.remove());
  document.querySelectorAll(".mwi-max-action-button").forEach((button) => {
    if (!panel.contains(button)) button.remove();
  });
  const existingCard = panel.querySelector("#mwi-production-summary");
  const actionHrid = resolvePanelAction(panel);
  if (!actionHrid || !isProductionAction(actionHrid)) {
    existingCard?.remove();
    panel.querySelector(".mwi-max-action-button")?.remove();
    return;
  }
  const count = input
    ? runtime.api.parseCompactNumber(input.value)
    : Number.POSITIVE_INFINITY;
  const projection = runtime.api.projectAction(actionHrid, count, {
    durationPerAction: getProductionPanelDuration(panel),
    respectInventoryLimit: true,
  });
  syncMaxButton(panel, input, projection.maxCraftable);
  let card = panel.querySelector("#mwi-production-summary");
  if (!card) {
    card = document.createElement("section");
    card.id = "mwi-production-summary";
    card.className = "mwi-production-card";
    const anchor =
      panel.querySelector('div[class*="SkillActionDetail_actionContainer"]') ??
      input?.parentElement ??
      panel.querySelector('div[class*="SkillActionDetail_name"]');
    if (anchor) anchor.insertAdjacentElement("afterend", card);
    else panel.appendChild(card);
  }
  const extensions = [
    ...card.querySelectorAll('[data-mwitools-production-extension="true"]'),
  ];
  card.replaceChildren();
  const title = document.createElement("div");
  title.className = "mwi-production-card-title";
  title.textContent = t("本次生产摘要", "Production summary");
  const grid = document.createElement("div");
  grid.className = "mwi-production-metrics";

  const outputs = document.createElement("span");
  projection.outputs?.forEach((output, index) => {
    if (index) outputs.append(" · ");
    const name =
      (runtime.config.isZH
        ? runtime.data.ZHItemNames?.[output.itemHrid]
        : runtime.state.initData_itemDetailMap?.[output.itemHrid]?.name) ??
      output.itemHrid.split("/").pop();
    outputs.append(`${name} `, number(output.expectedCount));
  });
  grid.append(
    metric(
      projection.effectivelyInfinite
        ? t("预期单次产出", "Output per action")
        : t("预期总产出", "Total output"),
      outputs,
    ),
    metric(
      t("当前拥有", "Owned"),
      projection.outputs?.length
        ? projection.outputs
            .map((output) => runtime.api.numberFormatter(output.owned))
            .join(" · ")
        : "—",
    ),
    metric(
      t("库存最多可做", "Max craftable"),
      projection.maxCraftable === Infinity
        ? "∞"
        : number(projection.maxCraftable),
    ),
    metric(
      t("本次总耗时", "Duration"),
      formatDuration(projection.totalSeconds),
    ),
  );
  if (runtime.settings.get("productionProfit")) {
    grid.append(
      metric(
        t("每次净利润", "Per action"),
        number(projection.netProfitPerAction),
      ),
      metric(t("每小时净利润", "Per hour"), number(projection.profitPerHour)),
      metric(
        t("每天净利润", "Per day"),
        number(
          projection.profitPerHour === null
            ? null
            : projection.profitPerHour * 24,
        ),
      ),
      metric(
        t("本次总净利润", "Total profit"),
        projection.netProfitPerAction === null
          ? number(null)
          : projection.effectivelyInfinite
            ? "∞"
            : number(projection.totalProfit),
      ),
    );
  }
  card.append(title, grid);
  if (projection.status === "incomplete") {
    const warning = document.createElement("div");
    warning.className = "mwi-production-warning";
    warning.textContent = t(
      "部分市场价格缺失，利润暂不显示为 0。",
      "Some market prices are missing; profit is not treated as zero.",
    );
    card.append(warning);
  }
  card.append(...extensions);
}

function removeActionUi() {
  document.querySelector("#mwi-action-dashboard")?.remove();
  document
    .querySelectorAll(".mwi-action-dashboard-host")
    .forEach((element) =>
      element.classList.remove("mwi-action-dashboard-host"),
    );
  document.querySelector("#mwi-production-summary")?.remove();
  document.querySelector(".mwi-max-action-button")?.remove();
}

runtime.features.register({
  id: "totalActionTime",
  setting: "totalActionTime",
  scope: "character",
  initialize({ scope }) {
    addStyles();
    renderActionDashboard();
    scope.interval(renderActionDashboard, 500);
    scope.add(() => {
      document.querySelector("#mwi-action-dashboard")?.remove();
      document
        .querySelectorAll(".mwi-action-dashboard-host")
        .forEach((element) =>
          element.classList.remove("mwi-action-dashboard-host"),
        );
    });
  },
});

runtime.features.register({
  id: "actionBarProfit",
  setting: "actionBarProfit",
  scope: "character",
  dependsOn: ["totalActionTime"],
  initialize() {
    renderActionDashboard();
    return renderActionDashboard;
  },
});

runtime.features.register({
  id: "productionSummary",
  setting: "productionSummary",
  scope: "character",
  initialize({ scope }) {
    renderProductionPanel();
    scope.interval(renderProductionPanel, 350);
    scope.add(() =>
      document.querySelector("#mwi-production-summary")?.remove(),
    );
  },
});

runtime.features.register({
  id: "productionProfit",
  setting: "productionProfit",
  scope: "character",
  dependsOn: ["productionSummary"],
  initialize() {
    renderProductionPanel();
    return renderProductionPanel;
  },
});

Object.assign(runtime.api, {
  renderActionDashboard,
  renderProductionPanel,
  getProductionPanelDuration,
  getLiveActionTiming,
  resolveProductionAction: resolvePanelAction,
  removeActionUi,
});
