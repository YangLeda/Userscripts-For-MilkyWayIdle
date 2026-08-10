import { runtime } from "../core/runtime.js";

const SETTINGS_V2_KEY = "MWITools_settings_v2";
const SETTINGS_STYLE_ID = "mwitools-settings-style";
const EQUIPMENT_WARNING_STYLE_ID = "mwitools-equipment-warning-style";

function persistSettings() {
  const values = Object.fromEntries(
    Object.entries(runtime.settings.settingsMap).map(([id, setting]) => [
      id,
      Boolean(setting.isTrue),
    ]),
  );
  localStorage.setItem(SETTINGS_V2_KEY, JSON.stringify({ version: 2, values }));

  // Keep the legacy shape current so users can safely roll back MWITools.
  localStorage.setItem(
    "script_settingsMap",
    JSON.stringify(runtime.settings.settingsMap),
  );
}

function applyVisualSettings() {
  runtime.config.isZH =
    runtime.settings.settingsMap.forceMWIToolsDisplayZH.isTrue ||
    runtime.config.isZHInGameSetting;
  runtime.config.SCRIPT_COLOR_MAIN = runtime.settings.settingsMap
    .useOrangeAsMainColor.isTrue
    ? "orange"
    : "green";
  runtime.config.SCRIPT_COLOR_TOOLTIP = runtime.settings.settingsMap
    .useOrangeAsMainColor.isTrue
    ? "#804600"
    : "darkgreen";
}

function readSettings() {
  let loadedV2 = false;
  try {
    const storedV2 = JSON.parse(
      localStorage.getItem(SETTINGS_V2_KEY) || "null",
    );
    if (storedV2?.version === 2 && storedV2.values) {
      for (const [id, value] of Object.entries(storedV2.values)) {
        if (runtime.settings.settingsMap[id]) {
          runtime.settings.settingsMap[id].isTrue = Boolean(value);
        }
      }
      loadedV2 = true;
    }
  } catch (error) {
    console.warn("[MWITools] Could not read v2 settings", error);
  }

  if (!loadedV2) {
    try {
      const legacy = JSON.parse(
        localStorage.getItem("script_settingsMap") || "null",
      );
      for (const option of Object.values(legacy ?? {})) {
        if (runtime.settings.settingsMap[option?.id]) {
          runtime.settings.settingsMap[option.id].isTrue = Boolean(
            option.isTrue,
          );
        }
      }
    } catch (error) {
      console.warn("[MWITools] Could not migrate legacy settings", error);
    }
  }

  // The old cap-at-M option conflicts with the unified K/M/B/T formatter.
  runtime.settings.settingsMap.displayCapMM.isTrue = false;
  applyVisualSettings();
  persistSettings();
}

function addSettingsStyles() {
  if (document.getElementById(SETTINGS_STYLE_ID)) return;
  const styleHost = document.head ?? document.documentElement;
  if (!styleHost) return;
  const style = document.createElement("style");
  style.id = SETTINGS_STYLE_ID;
  style.textContent = `
    #script_settings { width:100%; margin-top:14px; color:var(--color-text-primary,#eee); }
    .mwi-settings-hero { display:flex; justify-content:space-between; gap:14px; align-items:end; margin-bottom:11px; }
    .mwi-settings-title { font-size:1.2rem; font-weight:700; letter-spacing:.01em; }
    .mwi-settings-subtitle { color:var(--color-text-secondary,#aaa); margin-top:3px; font-size:.78rem; line-height:1.35; }
    .mwi-settings-search { width:min(320px,100%); box-sizing:border-box; border:1px solid rgba(255,255,255,.16); border-radius:5px; background:rgba(0,0,0,.2); color:inherit; padding:7px 9px; }
    .mwi-settings-group { margin:0 0 10px; border:1px solid rgba(255,255,255,.12); border-radius:7px; background:rgba(0,0,0,.13); overflow:hidden; }
    .mwi-settings-group-head { padding:10px 13px 8px; border-bottom:1px solid rgba(255,255,255,.08); }
    .mwi-settings-group-title { font-size:1rem; font-weight:700; }
    .mwi-settings-group-summary { color:var(--color-text-secondary,#aaa); font-size:.75rem; margin-top:2px; line-height:1.35; }
    .mwi-settings-grid { display:flex; flex-direction:column; padding:0 10px; }
    .mwi-setting-card { min-width:0; padding:7px 4px; border-bottom:1px solid rgba(255,255,255,.075); transition:background .15s; }
    .mwi-setting-card:last-child { border-bottom:0; }
    .mwi-setting-card:hover { background:rgba(255,255,255,.025); }
    .mwi-setting-card.mwi-setting-child { margin-top:5px; padding:6px 8px; border:1px solid rgba(255,255,255,.075); border-radius:5px; background:rgba(0,0,0,.12); }
    .mwi-setting-card.mwi-setting-child:has(input:disabled) { opacity:.52; }
    .mwi-setting-row { display:grid; min-height:42px; grid-template-columns:minmax(170px,.72fr) minmax(260px,1.5fr) auto 40px; align-items:center; gap:8px 14px; }
    .mwi-setting-copy { display:contents; }
    .mwi-setting-title-line { display:flex; min-width:0; grid-column:1; grid-row:1; align-items:center; gap:7px; text-align:left; }
    .mwi-setting-title { min-width:0; font-size:.84rem; font-weight:650; line-height:1.25; }
    .mwi-setting-summary { overflow:hidden; grid-column:2; grid-row:1; color:var(--color-text-secondary,#aaa); font-size:.71rem; line-height:1.3; text-align:left; text-overflow:ellipsis; white-space:nowrap; }
    .mwi-setting-status { display:inline-flex; flex:0 0 auto; padding:1px 6px; border-radius:999px; font-size:.61rem; color:#aaa; background:rgba(255,255,255,.07); }
    .mwi-setting-status[data-status="active"] { color:#87d7a0; background:rgba(70,170,100,.13); }
    .mwi-setting-status[data-status="failed"] { color:#ff9a90; background:rgba(210,70,60,.14); }
    .mwi-setting-status[data-status="waiting"] { color:#e3c56d; background:rgba(210,170,60,.13); }
    .mwi-setting-toggle { position:relative; width:36px; height:20px; grid-column:4; grid-row:1; justify-self:end; }
    .mwi-setting-toggle input { position:absolute; opacity:0; }
    .mwi-setting-toggle span { position:absolute; inset:0; border-radius:999px; cursor:pointer; background:#555; transition:.16s; }
    .mwi-setting-toggle span::after { content:""; position:absolute; width:16px; height:16px; left:2px; top:2px; border-radius:50%; background:#fff; transition:.16s; }
    .mwi-setting-toggle input:checked + span { background:var(--color-primary,${runtime.config.SCRIPT_COLOR_MAIN}); }
    .mwi-setting-toggle input:checked + span::after { transform:translateX(16px); }
    .mwi-setting-more { grid-column:3; grid-row:1; margin:0; font-size:.68rem; color:var(--color-text-secondary,#aaa); text-align:left; white-space:nowrap; }
    .mwi-setting-more summary { display:inline-block; cursor:pointer; color:var(--color-primary,${runtime.config.SCRIPT_COLOR_MAIN}); list-style-position:inside; }
    .mwi-setting-more[open] { grid-column:1 / 4; grid-row:2; margin:0; padding-top:5px; border-top:1px solid rgba(255,255,255,.06); white-space:normal; }
    .mwi-setting-more p { margin:4px 0 1px; line-height:1.4; }
    .mwi-setting-retry { margin-left:8px; border:0; border-radius:4px; padding:2px 6px; cursor:pointer; color:inherit; background:rgba(255,255,255,.1); }
    @media (max-width:700px) { .mwi-settings-hero { align-items:stretch; flex-direction:column; } .mwi-settings-search { width:100%; } .mwi-setting-row { grid-template-columns:minmax(0,1fr) 40px; gap:3px 10px; padding:3px 0; } .mwi-setting-title-line { grid-column:1;grid-row:1; } .mwi-setting-summary { grid-column:1;grid-row:2;white-space:normal; } .mwi-setting-more { grid-column:1;grid-row:3; } .mwi-setting-more[open] { grid-column:1 / 3;grid-row:3; } .mwi-setting-toggle { grid-column:2;grid-row:1 / 4; } }
  `;
  styleHost.appendChild(style);
}

function localizedText(value) {
  return value?.[runtime.config.isZH ? "zh" : "en"] ?? "";
}

function featureStatusForSetting(id) {
  const featureStatus = runtime.features.getStatus(id);
  if (featureStatus.status !== "unregistered") return featureStatus;
  return {
    id,
    status: runtime.settings.get(id) ? "active" : "disabled",
    error: null,
  };
}

function statusLabel(status) {
  const labels = runtime.config.isZH
    ? {
        active: "已启用",
        disabled: "已关闭",
        initializing: "正在启动",
        waiting: "等待游戏数据",
        failed: "启动失败",
      }
    : {
        active: "Enabled",
        disabled: "Disabled",
        initializing: "Starting",
        waiting: "Waiting for game data",
        failed: "Failed to start",
      };
  return labels[status] ?? labels.disabled;
}

function getSettingDescendants(id) {
  return Object.values(runtime.settings.catalog).filter((candidate) => {
    let parent = candidate.parent;
    while (parent) {
      if (parent === id) return true;
      parent = runtime.settings.catalog[parent]?.parent;
    }
    return false;
  });
}

function areSettingParentsEnabled(definition) {
  let parent = definition.parent;
  while (parent) {
    if (!runtime.settings.get(parent)) return false;
    parent = runtime.settings.catalog[parent]?.parent;
  }
  return true;
}

function createSettingCard(definition, options = {}) {
  const setting = runtime.settings.settingsMap[definition.id];
  const children = Object.values(runtime.settings.catalog).filter(
    (candidate) => candidate.parent === definition.id,
  );
  const descendants = getSettingDescendants(definition.id);
  const card = document.createElement("article");
  card.className = "mwi-setting-card";
  if (options.child) card.classList.add("mwi-setting-child");
  card.dataset.search = [
    definition.title?.zh,
    definition.title?.en,
    definition.summary?.zh,
    definition.summary?.en,
    ...descendants.flatMap((child) => [
      child.title?.zh,
      child.title?.en,
      child.summary?.zh,
      child.summary?.en,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const row = document.createElement("div");
  row.className = "mwi-setting-row";
  const copy = document.createElement("div");
  copy.className = "mwi-setting-copy";
  const title = document.createElement("div");
  title.className = "mwi-setting-title";
  title.textContent = localizedText(definition.title);
  const summary = document.createElement("div");
  summary.className = "mwi-setting-summary";
  summary.textContent = localizedText(definition.summary);
  const status = document.createElement("span");
  status.className = "mwi-setting-status";
  const setStatus = () => {
    const current = featureStatusForSetting(definition.id);
    status.dataset.status = current.status;
    status.textContent = statusLabel(current.status);
    if (current.error) status.title = current.error;
    if (current.status === "failed") {
      const retry = document.createElement("button");
      retry.className = "mwi-setting-retry";
      retry.type = "button";
      retry.textContent = runtime.config.isZH ? "重试" : "Retry";
      retry.addEventListener("click", () =>
        runtime.features.restart(definition.id),
      );
      status.appendChild(retry);
    }
  };
  setStatus();
  const titleLine = document.createElement("div");
  titleLine.className = "mwi-setting-title-line";
  titleLine.append(title, status);
  copy.append(titleLine, summary);

  const toggle = document.createElement("label");
  toggle.className = "mwi-setting-toggle";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = Boolean(setting.isTrue);
  if (definition.parent) {
    checkbox.disabled = !areSettingParentsEnabled(definition);
  }
  checkbox.setAttribute("aria-label", localizedText(definition.title));
  const track = document.createElement("span");
  toggle.append(checkbox, track);
  if (definition.details || children.length) {
    const details = document.createElement("details");
    details.className = "mwi-setting-more";
    const detailsSummary = document.createElement("summary");
    detailsSummary.textContent = runtime.config.isZH
      ? children.length
        ? "详细说明与更多设置"
        : "详细说明"
      : children.length
        ? "Details and more settings"
        : "Details";
    details.append(detailsSummary);
    if (definition.details) {
      const detailsCopy = document.createElement("p");
      detailsCopy.textContent = localizedText(definition.details);
      details.append(detailsCopy);
    }
    for (const child of children) {
      details.append(createSettingCard(child, { child: true }));
    }
    copy.append(details);
  }
  row.append(copy, toggle);
  card.append(row);

  checkbox.addEventListener("change", async () => {
    await runtime.settings.set(definition.id, checkbox.checked);
    if (
      definition.id === "forceMWIToolsDisplayZH" ||
      definition.id === "useOrangeAsMainColor" ||
      children.length
    ) {
      applyVisualSettings();
      renderSettings(document.querySelector("#script_settings"));
      return;
    }
    setStatus();
  });

  const stopStatusListener = runtime.features.onStatusChange((id) => {
    if (id === definition.id) setStatus();
  });
  card._mwitoolsCleanup = stopStatusListener;
  return card;
}

function renderSettings(root) {
  if (!root) return;
  for (const card of root.querySelectorAll(".mwi-setting-card")) {
    card._mwitoolsCleanup?.();
  }
  root.replaceChildren();

  const hero = document.createElement("div");
  hero.className = "mwi-settings-hero";
  const heroCopy = document.createElement("div");
  const heading = document.createElement("div");
  heading.className = "mwi-settings-title";
  heading.textContent = "MWITools";
  const subtitle = document.createElement("div");
  subtitle.className = "mwi-settings-subtitle";
  subtitle.textContent = runtime.config.isZH
    ? "所有开关会立即生效。功能数据与公会经验只保存在当前设备。"
    : "Changes apply immediately. Feature data and guild XP stay on this device.";
  heroCopy.append(heading, subtitle);
  const search = document.createElement("input");
  search.className = "mwi-settings-search";
  search.type = "search";
  search.placeholder = runtime.config.isZH
    ? "搜索功能或说明"
    : "Search settings";
  hero.append(heroCopy, search);
  root.append(hero);

  for (const [groupId, group] of Object.entries(runtime.settings.groups)) {
    const definitions = Object.values(runtime.settings.catalog).filter(
      (definition) =>
        definition.group === groupId &&
        !definition.parent &&
        !definition.hidden &&
        runtime.settings.settingsMap[definition.id],
    );
    if (!definitions.length) continue;
    const section = document.createElement("section");
    section.className = "mwi-settings-group";
    const head = document.createElement("header");
    head.className = "mwi-settings-group-head";
    const groupTitle = document.createElement("div");
    groupTitle.className = "mwi-settings-group-title";
    groupTitle.textContent = localizedText(group.title);
    const groupSummary = document.createElement("div");
    groupSummary.className = "mwi-settings-group-summary";
    groupSummary.textContent = localizedText(group.summary);
    head.append(groupTitle, groupSummary);
    const grid = document.createElement("div");
    grid.className = "mwi-settings-grid";
    for (const definition of definitions) {
      grid.appendChild(createSettingCard(definition));
    }
    section.append(head, grid);
    root.append(section);
  }

  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    for (const card of root.querySelectorAll(".mwi-setting-card")) {
      card.hidden = Boolean(query) && !card.dataset.search.includes(query);
    }
    for (const group of root.querySelectorAll(".mwi-settings-group")) {
      group.hidden = ![...group.querySelectorAll(".mwi-setting-card")].some(
        (card) => !card.hidden,
      );
    }
  });
}

function ensureSettingsPanel() {
  const target = document.querySelector(
    'div[class*="SettingsPanel_profileTab"]',
  );
  if (!target) return;
  let root = target.querySelector("#script_settings");
  if (root?.dataset.mwitoolsVersion === "2") return;
  if (!root) {
    root = document.createElement("div");
    root.id = "script_settings";
    target.appendChild(root);
  }
  root.dataset.mwitoolsVersion = "2";
  renderSettings(root);
}

function getEquipmentWarning() {
  const currentActionHrid =
    runtime.state.currentActionsHridList?.[0]?.actionHrid;
  if (!currentActionHrid) return null;
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

  if (currentActionHrid.includes("/actions/combat/")) {
    if (hasHat || hasOffHand || hasBoot || hasGlove) {
      return {
        code: "skilling-gear-in-combat",
        text: runtime.config.isZH
          ? "正在穿着生活装备"
          : "Skilling gear equipped in combat",
      };
    }
  } else if (
    currentActionHrid.includes("/actions/cooking/") ||
    currentActionHrid.includes("/actions/brewing/")
  ) {
    if (!hasHat && hasItemHridInInv("/items/red_chefs_hat")) {
      return {
        code: "missing-production-hat",
        itemHrid: "/items/red_chefs_hat",
        text: runtime.config.isZH
          ? "未装备生活帽"
          : "Skilling hat not equipped",
      };
    }
  } else if (
    currentActionHrid.includes("/actions/cheesesmithing/") ||
    currentActionHrid.includes("/actions/crafting/") ||
    currentActionHrid.includes("/actions/tailoring/")
  ) {
    if (!hasOffHand && hasItemHridInInv("/items/eye_watch")) {
      return {
        code: "missing-production-off-hand",
        itemHrid: "/items/eye_watch",
        text: runtime.config.isZH
          ? "未装备生活副手"
          : "Skilling off-hand not equipped",
      };
    }
  } else if (
    currentActionHrid.includes("/actions/milking/") ||
    currentActionHrid.includes("/actions/foraging/") ||
    currentActionHrid.includes("/actions/woodcutting/")
  ) {
    if (!hasBoot && hasItemHridInInv("/items/collectors_boots")) {
      return {
        code: "missing-production-boots",
        itemHrid: "/items/collectors_boots",
        text: runtime.config.isZH
          ? "未装备生活鞋"
          : "Skilling boots not equipped",
      };
    }
  } else if (currentActionHrid.includes("/actions/enhancing")) {
    if (!hasGlove && hasItemHridInInv("/items/enchanted_gloves")) {
      return {
        code: "missing-enhancing-gloves",
        itemHrid: "/items/enchanted_gloves",
        text: runtime.config.isZH
          ? "未装备强化手套"
          : "Enhancing gloves not equipped",
      };
    }
  }
  return null;
}

function addEquipmentWarningStyles() {
  if (document.getElementById(EQUIPMENT_WARNING_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = EQUIPMENT_WARNING_STYLE_ID;
  style.textContent = `
    .mwi-equipment-warning-host { position:relative!important; }
    @keyframes mwi-equipment-warning-pulse { 0%,100% { box-shadow:0 0 0 2px rgba(255,75,75,.38),0 2px 10px rgba(0,0,0,.42); } 50% { box-shadow:0 0 0 4px rgba(255,75,75,.16),0 2px 12px rgba(0,0,0,.5); } }
    #script_item_warning { position:absolute; z-index:7; display:flex; box-sizing:border-box; min-width:28px; max-width:var(--mwi-equipment-warning-space,216px); height:22px; align-items:center; gap:5px; padding:1px 7px; border:2px solid #ff5b5b; outline:1px solid rgba(255,194,194,.72); outline-offset:2px; border-radius:999px; background:rgba(91,14,22,.96); color:#fff4f4; box-shadow:0 0 0 2px rgba(255,75,75,.38),0 2px 10px rgba(0,0,0,.42); text-shadow:0 1px 1px rgba(0,0,0,.9); font:inherit; font-size:.64rem; font-weight:750; line-height:1; white-space:nowrap; overflow:hidden; pointer-events:none; animation:mwi-equipment-warning-pulse 1.8s ease-in-out infinite; }
    .mwi-equipment-warning-icon { flex:0 0 auto; color:#ffb7b7; font-size:.78rem; }
    .mwi-equipment-warning-text { min-width:0; overflow:hidden; text-overflow:ellipsis; }
    @media(prefers-reduced-motion:reduce) { #script_item_warning { animation:none; } }
    @media(max-width:680px) { #script_item_warning { width:28px; max-width:28px; justify-content:center; padding:2px; } .mwi-equipment-warning-text { display:none; } }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function removeEquipmentWarning() {
  document.querySelector("#script_item_warning")?.remove();
  document
    .querySelectorAll(".mwi-equipment-warning-host")
    .forEach((host) => host.classList.remove("mwi-equipment-warning-host"));
}

function positionEquipmentWarning(warning, host, communityBuffs) {
  const hostRect = host.getBoundingClientRect();
  const anchorRect = communityBuffs.getBoundingClientRect();
  const left = Math.max(0, anchorRect.left - hostRect.left);
  const top = Math.max(0, anchorRect.bottom - hostRect.top + 4);
  const viewportWidth = host.ownerDocument?.defaultView?.innerWidth ?? 0;
  const availableInViewport = viewportWidth
    ? Math.max(26, viewportWidth - hostRect.left - left - 12)
    : anchorRect.width;
  warning.style.left = `${left}px`;
  warning.style.top = `${top}px`;
  warning.style.setProperty(
    "--mwi-equipment-warning-space",
    `${Math.min(216, anchorRect.width || 216, availableInViewport)}px`,
  );
}

/* 检查是否穿错生产/战斗装备 */
function checkEquipment() {
  const warningState = getEquipmentWarning();
  const host = document.querySelector('div[class*="Header_actionInfo"]');
  const communityBuffs = host?.querySelector(
    'div[class*="Header_communityBuffs"]',
  );
  if (!warningState || !host || !communityBuffs) {
    removeEquipmentWarning();
    return warningState;
  }

  addEquipmentWarningStyles();
  document
    .querySelectorAll(".mwi-equipment-warning-host")
    .forEach((element) => {
      if (element !== host)
        element.classList.remove("mwi-equipment-warning-host");
    });
  host.classList.add("mwi-equipment-warning-host");
  let warning = document.querySelector("#script_item_warning");
  if (!warning) {
    warning = document.createElement("div");
    warning.id = "script_item_warning";
    warning.setAttribute("role", "status");
    const icon = document.createElement("span");
    icon.className = "mwi-equipment-warning-icon";
    icon.textContent = "⚠";
    const text = document.createElement("span");
    text.className = "mwi-equipment-warning-text";
    warning.append(icon, text);
  }
  if (warning.parentElement !== host) host.appendChild(warning);
  warning.dataset.code = warningState.code;
  warning.querySelector(".mwi-equipment-warning-text").textContent =
    warningState.text;
  warning.title = warningState.text;
  positionEquipmentWarning(warning, host, communityBuffs);
  return warningState;
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
  persistSettings,
  readSettings,
  getEquipmentWarning,
  checkEquipment,
  hasItemHridInInv,
  notificate,
  waitForMarketOrders,
  handleMarketNewOrder,
});

runtime.features.register({
  id: "settingsUi",
  scope: "global",
  initialize({ scope }) {
    addSettingsStyles();
    ensureSettingsPanel();
    scope.interval(() => {
      addSettingsStyles();
      ensureSettingsPanel();
    }, 500);
    scope.add(() => {
      const root = document.querySelector("#script_settings");
      for (const card of root?.querySelectorAll(".mwi-setting-card") ?? []) {
        card._mwitoolsCleanup?.();
      }
      root?.remove();
      document.getElementById(SETTINGS_STYLE_ID)?.remove();
    });
  },
});
