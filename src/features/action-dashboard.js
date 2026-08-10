import { runtime } from "../core/runtime.js";

const STYLE_ID = "mwitools-action-dashboard-style";

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function formatDuration(seconds) {
  if (seconds === Infinity) return "∞";
  if (!Number.isFinite(seconds)) return "—";
  return runtime.api.timeReadable?.(Math.max(0, seconds)) ?? `${seconds}s`;
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
    .mwi-action-dashboard { position:absolute; top:50%; z-index:5; max-width:calc(100% - var(--mwi-action-dashboard-left,0px)); margin:0; padding:2px 6px; transform:translateY(-50%); border:1px solid rgba(255,255,255,.1); border-radius:4px; background:rgba(0,0,0,.18); font:inherit; font-size:.6875rem; line-height:1.25; white-space:nowrap; overflow:hidden; pointer-events:none; }
    .mwi-action-line { display:flex; align-items:center; flex-wrap:nowrap; gap:5px 10px; color:#ffa500; }
    .mwi-action-line strong { color:inherit; font-weight:650; }
    .mwi-production-card { width:100%; max-width:100%; min-width:0; box-sizing:border-box; contain:inline-size; margin-top:6px; padding:6px; border:1px solid rgba(255,255,255,.12); border-radius:5px; background:rgba(255,255,255,.025); color:var(--color-text-primary,#eee); font-size:.6875rem; }
    .mwi-production-card-title { padding:0 2px 4px; font-size:.72rem; font-weight:600; }
    .mwi-production-metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; }
    .mwi-production-metric { min-width:0; padding:4px 3px; border-radius:3px; background:rgba(0,0,0,.14); text-align:center; }
    .mwi-production-label { min-height:1.45em; color:var(--color-text-secondary,#aaa); font-size:.6rem; line-height:1.2; }
    .mwi-production-value { margin-top:1px; font-size:.7rem; line-height:1.25; font-weight:600; overflow-wrap:anywhere; }
    .mwi-production-warning { margin:4px 2px 0; color:#d7bb67; font-size:.6rem; line-height:1.25; }
    @media(max-width:520px){.mwi-production-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.mwi-action-line{gap:3px 8px}}
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
  const projection = runtime.api.projectAction(current, undefined, {
    durationPerAction: timing.durationPerAction,
    currentCycleRemainingSeconds: timing.currentCycleRemaining,
  });
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
  const input = document.querySelector(
    'div[class*="SkillActionDetail_maxActionCountInput"] input',
  );
  return (
    input?.closest('div[class*="SkillActionDetail_regularComponent"]') ??
    input
      ?.closest('div[class*="Modal_modalContainer"]')
      ?.querySelector('div[class*="SkillActionDetail_regularComponent"]') ??
    input?.parentElement
  );
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
  const input = document.querySelector(
    'div[class*="SkillActionDetail_maxActionCountInput"] input',
  );
  const panel = findActionPanel();
  if (!input || !panel) return;
  const actionHrid = resolvePanelAction(panel);
  if (!actionHrid) return;
  const count = runtime.api.parseCompactNumber(input.value);
  const projection = runtime.api.projectAction(actionHrid, count, {
    durationPerAction: getProductionPanelDuration(panel),
  });
  let card = panel.querySelector("#mwi-production-summary");
  if (!card) {
    card = document.createElement("section");
    card.id = "mwi-production-summary";
    card.className = "mwi-production-card";
    const anchor =
      panel.querySelector('div[class*="SkillActionDetail_actionContainer"]') ??
      input.parentElement;
    anchor.insertAdjacentElement("afterend", card);
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
    metric(t("预期总产出", "Output"), outputs),
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
      metric(t("本次总净利润", "Total profit"), number(projection.totalProfit)),
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
