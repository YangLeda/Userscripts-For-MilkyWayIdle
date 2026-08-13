import { createFrameScheduler } from "../core/frame-scheduler.js";
import { itemName } from "../core/localization.js";
import { runtime } from "../core/runtime.js";
import {
  findCharacterManagementLoadoutTab,
  findPanelShell,
} from "./asset-history/30-panel.js";

const TAB_ID = "mwitools-planning-tab";
const PANEL_ID = "mwitools-planning-panel";
const STYLE_ID = "mwitools-planning-style";
const ASSET_TAB_ID = "mwitools-asset-history-tab";
const procurement = runtime.api.procurement;
const planning = runtime.api.planning;
const spriteBaseCache = new Map();

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function number(value) {
  return runtime.api.numberFormatter?.(value) ?? String(value ?? "—");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function tail(value) {
  return (
    String(value ?? "")
      .split("/")
      .at(-1)
      ?.replaceAll("_", " ") ?? "—"
  );
}

function houseName(hrid) {
  const chinese = runtime.data?.ZHOthersDic?.[hrid];
  const english = runtime.state.initData_houseRoomDetailMap?.[hrid]?.name;
  return runtime.config.isZH
    ? chinese || english || tail(hrid)
    : english || chinese || tail(hrid);
}

function currentHouseLevel(hrid) {
  const map = runtime.state.initData_characterHouseRoomMap ?? {};
  return Math.max(
    0,
    Number(
      map[hrid]?.level ??
        Object.values(map).find((house) => house?.houseRoomHrid === hrid)
          ?.level,
    ) || 0,
  );
}

function maxHouseLevel(hrid) {
  const levels = Object.keys(
    runtime.state.initData_houseRoomDetailMap?.[hrid]?.upgradeCostsMap ?? {},
  )
    .map(Number)
    .filter((level) => Number.isFinite(level));
  return levels.length ? Math.max(...levels) : 0;
}

function goalLabel(goal) {
  return goal.kind === "house"
    ? houseName(goal.targetHrid)
    : itemName(goal.targetHrid);
}

function itemCandidates() {
  return Object.entries(runtime.state.initData_itemDetailMap ?? {})
    .filter(
      ([hrid]) => hrid.startsWith("/items/") && planning.isCraftableItem(hrid),
    )
    .map(([hrid, detail]) => ({
      hrid,
      name: itemName(hrid),
      english: String(detail?.name ?? ""),
      sortIndex: Number(detail?.sortIndex) || Number.MAX_SAFE_INTEGER,
    }))
    .sort(
      (left, right) =>
        left.sortIndex - right.sortIndex || left.name.localeCompare(right.name),
    );
}

function houseCandidates() {
  return Object.entries(runtime.state.initData_houseRoomDetailMap ?? {})
    .filter(([hrid]) => maxHouseLevel(hrid) > 0)
    .map(([hrid, detail]) => ({
      hrid,
      name: houseName(hrid),
      skillHrid: detail?.skillHrid,
      sortIndex: Number(detail?.sortIndex) || Number.MAX_SAFE_INTEGER,
    }))
    .sort(
      (left, right) =>
        left.sortIndex - right.sortIndex || left.name.localeCompare(right.name),
    );
}

function catalogSignature() {
  return JSON.stringify([
    Object.keys(runtime.state.initData_itemDetailMap ?? {}),
    Object.keys(runtime.state.initData_actionDetailMap ?? {}),
    Object.entries(runtime.state.initData_houseRoomDetailMap ?? {}).map(
      ([hrid, detail]) => [hrid, detail?.skillHrid, detail?.upgradeCostsMap],
    ),
  ]);
}

function resolveItemInput(value, candidates) {
  const query = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!query) return null;
  const normalized = procurement.normalizeItemHrid(query);
  return (
    candidates.find(
      (candidate) =>
        candidate.hrid.toLowerCase() === query ||
        candidate.hrid === normalized ||
        candidate.name.toLowerCase() === query ||
        candidate.english.toLowerCase() === query,
    ) ?? null
  );
}

function findSpriteBase(kind) {
  const cached = spriteBaseCache.get(kind);
  if (cached) return cached;
  const needle = `${kind}_sprite`;
  for (const entry of globalThis.performance?.getEntriesByType?.("resource") ??
    []) {
    if (!entry.name?.includes(needle) || !entry.name.endsWith(".svg")) continue;
    try {
      const pathname = new URL(entry.name).pathname;
      spriteBaseCache.set(kind, pathname);
      return pathname;
    } catch {
      spriteBaseCache.set(kind, entry.name);
      return entry.name;
    }
  }
  const use = document.querySelector(
    `svg use[href*="${needle}"],svg use[xlink\\:href*="${needle}"]`,
  );
  const href =
    use?.getAttribute("href") ?? use?.getAttribute("xlink:href") ?? "";
  const base = href.includes("#") ? href.split("#")[0] : "";
  if (base) spriteBaseCache.set(kind, base);
  return base;
}

function iconMarkup(kind, hrid, label) {
  const bare = String(hrid ?? "")
    .split("/")
    .at(-1);
  const sprite = findSpriteBase(kind);
  if (!bare || !sprite) {
    return `<span class="planning-icon-fallback">${escapeHtml(
      String(label || "?")
        .trim()
        .charAt(0) || "?",
    )}</span>`;
  }
  const href = `${sprite}#${bare}`;
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><use href="${escapeHtml(href)}" xlink:href="${escapeHtml(href)}"></use></svg>`;
}

function itemIcon(itemHrid, label = itemName(itemHrid)) {
  return iconMarkup("items", itemHrid, label);
}

function houseIcon(candidate) {
  return iconMarkup("skills", candidate?.skillHrid, candidate?.name);
}

function goalIcon(goal) {
  if (goal.kind === "item") return itemIcon(goal.targetHrid, goalLabel(goal));
  const candidate = houseCandidates().find(
    (house) => house.hrid === goal.targetHrid,
  );
  return houseIcon(candidate);
}

function goalSources(ids, goals) {
  const byId = new Map(goals.map((goal) => [goal.id, goalLabel(goal)]));
  return ids.map((id) => byId.get(id) ?? id).join(t("、", ", "));
}

const POLICY_OPTIONS = Object.freeze([
  ["chain", "全链条制作", "Full chain"],
  ["single", "单步制作", "One step"],
  ["buy", "直接购买", "Buy directly"],
]);

function policyLabel(policy) {
  if (policy === "mixed") return t("混合", "Mixed");
  const option = POLICY_OPTIONS.find(([value]) => value === policy);
  return option ? t(option[1], option[2]) : t("全链条制作", "Full chain");
}

function createPolicyControl(value, onChange, { disabled = false } = {}) {
  if (value === "mixed") {
    const mixed = document.createElement("span");
    mixed.className = "planning-policy-mixed";
    mixed.textContent = policyLabel("mixed");
    mixed.title = t(
      "来源目标策略不同，请展开后分别调整。",
      "Source goals use different policies; expand to edit them separately.",
    );
    return mixed;
  }
  const control = document.createElement("span");
  control.className = "planning-policy-switch";
  control.setAttribute("role", "group");
  let current = value;
  const sync = () => {
    for (const button of control.querySelectorAll("button")) {
      const active = button.dataset.policy === current;
      button.dataset.active = String(active);
      button.setAttribute("aria-pressed", String(active));
    }
  };
  for (const [policy, zh, en] of POLICY_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.policy = policy;
    button.textContent = t(zh, en);
    button.disabled = disabled;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (current === policy) return;
      current = policy;
      sync();
      onChange?.(policy);
    });
    control.append(button);
  }
  sync();
  return control;
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${TAB_ID}[data-active="true"]{color:#7dd3fc!important;font-weight:700}
    [data-mwitools-planning-active="true"] button:not(#${TAB_ID}){border-color:var(--mwi-planning-idle-border,rgba(255,255,255,.16))!important;background:var(--mwi-planning-idle-background,rgba(255,255,255,.08))!important;box-shadow:var(--mwi-planning-idle-shadow,none)!important;color:var(--mwi-planning-idle-color,var(--color-text-secondary,#aeb5c0))!important;filter:none!important}
    #${PANEL_ID}{box-sizing:border-box;width:100%;max-width:100%;min-width:0;max-height:calc(100% - 34px);overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:12px 12px 28px;color:var(--color-text-primary,#eee);background:#111b2b;font-family:"PingFang SC","Microsoft YaHei",Roboto,system-ui,sans-serif}
    #${PANEL_ID} *{box-sizing:border-box}#${PANEL_ID} button,#${PANEL_ID} input,#${PANEL_ID} select{font:inherit}
    .planning-intro{margin:0 0 10px;color:var(--color-text-secondary,#aeb5c0);font-size:.72rem;line-height:1.5}
    .planning-subtabs{display:flex;gap:4px;margin:0 0 10px;padding:3px;border:1px solid rgba(255,255,255,.09);border-radius:7px;background:#0c141f}.planning-subtabs button{flex:1;min-height:34px;border:0;border-radius:5px;background:transparent;color:#94a3b8;font-weight:700;cursor:pointer}.planning-subtabs button[data-active="true"]{background:#287fb4;color:#fff}.planning-page[hidden],.planning-stage[hidden]{display:none!important}.planning-stage-title{margin:0 0 10px;color:#dce8f5;font-size:.9rem}.planning-calculate-bar{display:flex;align-items:center;gap:10px;margin:10px 0;padding:9px 10px;border:1px solid rgba(56,189,248,.2);border-radius:8px;background:rgba(40,127,180,.08)}.planning-calculate-bar .planning-primary{margin-left:auto}.planning-dirty{color:#ffad62;font-size:.68rem}.planning-clean{color:#43d17f;font-size:.68rem}
    .planning-editor-grid{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:12px}
    .planning-add-card,.planning-section{position:relative;min-width:0;border:1px solid rgba(255,255,255,.09);border-radius:8px;background:#0c141f}
    .planning-add-title,.planning-section>h3,.planning-section-heading{min-height:38px;padding:9px 11px;border-bottom:1px solid rgba(255,255,255,.08);font-size:.82rem;font-weight:700}.planning-add-title{display:flex;align-items:center;gap:8px}.planning-add-title>span:first-child{min-width:max-content;flex:1}.planning-add-title .planning-policy-switch{width:min(100%,204px);min-width:192px}
    .planning-add-body{display:flex;align-items:stretch;gap:7px;padding:9px;position:relative}
    .planning-search-wrap,.planning-house-wrap{position:relative;min-width:0;flex:1}
    .planning-search-input,.planning-count-input,.planning-level-select,.planning-picker-button{width:100%;height:34px;border:1px solid rgba(255,255,255,.16);border-radius:5px;outline:0;background:#18243a;color:#eef2f7;padding:5px 8px}
    .planning-search-input:focus,.planning-count-input:focus,.planning-level-select:focus,.planning-picker-button:focus{border-color:#38bdf8;box-shadow:0 0 0 2px rgba(56,189,248,.16)}
    .planning-count-input{width:82px;flex:0 0 82px;text-align:center}.planning-level-select{width:92px;flex:0 0 92px}
    .planning-primary{min-height:34px;border:0;border-radius:5px;background:#287fb4;color:#fff;padding:6px 12px;font-weight:700;white-space:nowrap;cursor:pointer}.planning-primary:hover{background:#3299d1}.planning-primary:disabled{opacity:.45;cursor:default}
    .planning-results{position:absolute;left:0;right:0;top:39px;z-index:20;display:none;max-height:min(390px,55vh);overflow:auto;padding:4px;border:1px solid rgba(125,211,252,.36);border-radius:6px;background:#182236;box-shadow:0 12px 28px rgba(0,0,0,.48)}.planning-results[data-open="true"]{display:block}
    .planning-option{display:flex;width:100%;min-width:0;align-items:center;gap:8px;border:0;border-bottom:1px solid rgba(152,167,233,.22);border-radius:4px;background:transparent;color:#eef2f7;padding:6px 7px;text-align:left;cursor:pointer}.planning-option:last-child{border-bottom:0}.planning-option:hover,.planning-option[data-active="true"]{background:#35425f}.planning-option-icon,.planning-picker-icon,.planning-goal-icon{display:grid;width:32px;height:32px;flex:0 0 32px;place-items:center;border-radius:5px;background:rgba(255,255,255,.05)}.planning-option-icon svg,.planning-picker-icon svg,.planning-goal-icon svg{width:28px;height:28px}.planning-icon-fallback{color:#aebbd2;font-size:.75rem;font-weight:700}.planning-option-copy{min-width:0;flex:1}.planning-option-copy strong,.planning-option-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.planning-option-copy strong{font-size:.76rem}.planning-option-copy small{margin-top:2px;color:#94a3b8;font-size:.61rem}
    .planning-picker-button{display:flex;align-items:center;gap:7px;text-align:left;cursor:pointer}.planning-picker-icon{width:28px;height:28px;flex-basis:28px}.planning-picker-icon svg{width:25px;height:25px}.planning-picker-copy{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.planning-picker-arrow{color:#94a3b8}
    .planning-content-grid,.planning-results-column{display:grid;grid-template-columns:1fr;gap:10px;min-width:0}.planning-section{overflow:visible}.planning-section-heading{display:flex;align-items:center;justify-content:space-between}.planning-section-heading h3{margin:0;font-size:.82rem}.planning-empty{padding:18px 11px;color:#94a3b8;font-size:.72rem;text-align:center}
    .planning-goal{display:grid;grid-template-columns:18px 34px minmax(150px,1fr) minmax(216px,280px) 28px;align-items:center;gap:7px;padding:8px 9px;border-bottom:1px solid rgba(255,255,255,.065);font-size:.72rem;content-visibility:auto;contain-intrinsic-size:48px}.planning-goal:last-child{border-bottom:0}.planning-goal[data-enabled="false"]{opacity:.5}.planning-goal-values{display:flex;min-width:0;align-items:center;justify-content:center;gap:5px;color:#94a3b8;white-space:nowrap}.planning-goal-arrow{color:#64748b}.planning-goal input[type="number"]{width:70px;height:30px;border:1px solid rgba(255,255,255,.14);border-radius:5px;background:#18243a;color:#eef2f7;padding:4px 6px;text-align:center}.planning-remove{width:28px;height:28px;border:0;border-radius:5px;background:transparent;color:#ff8d96;font-size:1.05rem;cursor:pointer}.planning-remove:hover{background:rgba(224,90,100,.16)}
    .planning-policy-switch{display:inline-grid;grid-template-columns:repeat(3,minmax(0,1fr));width:100%;min-width:216px;padding:2px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:#111b2b}.planning-policy-switch button{min-width:0;min-height:26px;overflow:hidden;border:0;border-radius:4px;background:transparent;color:#94a3b8;padding:3px 4px;font-size:clamp(.52rem,.72vw,.61rem);line-height:1.15;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.planning-policy-switch button[data-active="true"]{background:#287fb4;color:#fff}.planning-policy-mixed{display:inline-flex;width:100%;min-width:216px;min-height:30px;align-items:center;justify-content:center;border:1px dashed rgba(255,255,255,.18);border-radius:6px;color:#ffad62;font-size:.65rem}.planning-step,.planning-material{border-bottom:1px solid rgba(255,255,255,.065);content-visibility:auto;contain-intrinsic-size:54px}.planning-step:last-child,.planning-material:last-child{border-bottom:0}.planning-step summary{display:grid;grid-template-columns:30px minmax(130px,1fr) minmax(92px,.4fr) minmax(216px,.85fr);align-items:center;gap:8px;padding:8px 9px;cursor:pointer;font-size:.72rem}.planning-material summary{display:flex;align-items:center;gap:8px;padding:8px 9px;cursor:pointer;font-size:.72rem}.planning-row-icon{display:grid;width:30px;height:30px;flex:0 0 30px;place-items:center;border-radius:5px;background:rgba(255,255,255,.05)}.planning-row-icon svg{width:27px;height:27px}.planning-step-name,.planning-material-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}.planning-step-count{color:#94a3b8;white-space:nowrap}.planning-source-list{display:grid;gap:5px;padding:0 9px 9px 47px}.planning-source-row{display:grid;grid-template-columns:minmax(140px,1fr) minmax(92px,.4fr) minmax(216px,.85fr);align-items:center;gap:8px;padding:6px;border-radius:5px;background:rgba(255,255,255,.035);color:#94a3b8;font-size:.64rem}.planning-source-copy{display:flex;min-width:0;align-items:center;gap:7px}.planning-source-copy strong{overflow:hidden;color:#d8e0ec;text-overflow:ellipsis;white-space:nowrap}.planning-source-icon{display:grid;width:26px;height:26px;flex:0 0 26px;place-items:center}.planning-source-icon svg{width:24px;height:24px}.planning-material-actions button{border:0;border-radius:5px;background:rgba(255,255,255,.08);color:#b8c2d3;padding:5px 8px;font-size:.66rem;font-weight:700;cursor:pointer}.planning-material[data-missing="true"] summary strong{color:#ffad62}.planning-material[data-missing="false"] summary strong{color:#43d17f}.planning-material summary strong{font-size:.67rem;white-space:nowrap}
    .planning-material-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;padding:0 9px 8px}.planning-material-grid>div{min-width:0;padding:6px;border-radius:5px;background:rgba(255,255,255,.045)}.planning-material-grid span,.planning-material-grid small{display:block;overflow:hidden;color:#94a3b8;font-size:.58rem;text-overflow:ellipsis;white-space:nowrap}.planning-material-grid b{display:block;margin:2px 0;color:#e8c87f;font-size:.78rem}.planning-material-actions{display:flex;align-items:center;gap:6px;padding:0 9px 9px}.planning-material-actions span{min-width:0;flex:1;overflow:hidden;color:#94a3b8;font-size:.61rem;text-align:right;text-overflow:ellipsis;white-space:nowrap}.planning-material-actions button:disabled{opacity:.45;cursor:default}.planning-warning{margin:8px;padding:8px;border:1px solid rgba(255,173,98,.35);border-radius:6px;color:#ffad62;font-size:.67rem}.planning-footer{margin-top:10px;color:#94a3b8;font-size:.67rem;text-align:right}
    @media(max-width:900px){.planning-editor-grid,.planning-content-grid{grid-template-columns:1fr}.planning-editor-grid{gap:8px}.planning-add-body{flex-wrap:wrap}.planning-search-wrap,.planning-house-wrap{flex:1 1 calc(100% - 180px)}.planning-material-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.planning-goal{grid-template-columns:18px 34px minmax(130px,1fr) minmax(210px,260px) 28px}.planning-step summary{grid-template-columns:30px minmax(0,1fr) auto}.planning-step summary>.planning-policy-switch,.planning-step summary>.planning-policy-mixed{grid-column:2/4}.planning-source-row{grid-template-columns:minmax(0,1fr) auto}.planning-source-row>.planning-policy-switch{grid-column:1/3;min-width:0}}
    @media(max-width:760px){#${PANEL_ID}{min-height:0;padding:10px 8px calc(22px + env(safe-area-inset-bottom,0px));overflow-y:auto;-webkit-overflow-scrolling:touch}.planning-add-title .planning-policy-switch{width:min(100%,192px);min-width:180px}.planning-count-input{width:70px;flex-basis:70px}.planning-level-select{width:84px;flex-basis:84px}.planning-goal{grid-template-columns:18px 34px minmax(0,1fr) 28px}.planning-goal>.planning-policy-switch,.planning-goal>.planning-policy-mixed{grid-column:2/5;min-width:0}.planning-goal-values{justify-content:flex-start}.planning-policy-switch button{font-size:.54rem}}
    @media(max-width:420px){.planning-add-title{display:grid;grid-template-columns:1fr}.planning-add-title .planning-policy-switch{width:100%;min-width:0}}
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function createOption(candidate, kind, onSelect) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "planning-option";
  const icon =
    kind === "item"
      ? itemIcon(candidate.hrid, candidate.name)
      : houseIcon(candidate);
  const meta =
    kind === "item"
      ? candidate.hrid
      : `${t("当前", "Current")} ${currentHouseLevel(candidate.hrid)} · ${t("最高", "Max")} ${maxHouseLevel(candidate.hrid)}`;
  const iconHost = document.createElement("span");
  iconHost.className = "planning-option-icon";
  iconHost.innerHTML = icon;
  const copy = document.createElement("span");
  copy.className = "planning-option-copy";
  const name = document.createElement("strong");
  name.textContent = candidate.name;
  const detail = document.createElement("small");
  detail.textContent = meta;
  copy.append(name, detail);
  button.append(iconHost, copy);
  button.addEventListener("pointerdown", (event) => event.preventDefault());
  button.addEventListener("click", () => onSelect(candidate));
  return button;
}

function createItemPicker(host, onSelect, cleanup) {
  const candidates = itemCandidates();
  const input = document.createElement("input");
  input.type = "search";
  input.className = "planning-search-input";
  input.placeholder = t("搜索物品名称、英文名或 HRID", "Search name or HRID");
  input.setAttribute("aria-label", t("选择规划物品", "Choose planning item"));
  const results = document.createElement("div");
  results.className = "planning-results";
  let selected = null;
  let shown = [];
  let activeIndex = 0;

  const close = () => {
    results.dataset.open = "false";
  };
  const choose = (candidate) => {
    if (!candidate) return;
    selected = candidate;
    input.value = candidate.name;
    close();
    onSelect(candidate);
  };
  const render = () => {
    const query = input.value.trim().toLowerCase();
    shown = candidates
      .filter(
        (candidate) =>
          !query ||
          candidate.name.toLowerCase().includes(query) ||
          candidate.english.toLowerCase().includes(query) ||
          candidate.hrid.toLowerCase().includes(query),
      )
      .slice(0, 80);
    activeIndex = Math.min(activeIndex, Math.max(0, shown.length - 1));
    results.replaceChildren(
      ...shown.map((candidate, index) => {
        const option = createOption(candidate, "item", choose);
        option.dataset.active = String(index === activeIndex);
        return option;
      }),
    );
    results.dataset.open = String(shown.length > 0);
  };
  const syncActive = () => {
    [...results.children].forEach((option, index) => {
      option.dataset.active = String(index === activeIndex);
    });
    results.children[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  };
  input.addEventListener("focus", render);
  input.addEventListener("input", () => {
    selected = null;
    activeIndex = 0;
    render();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.dataset.open !== "true") render();
      activeIndex = Math.max(
        0,
        Math.min(
          shown.length - 1,
          activeIndex + (event.key === "ArrowDown" ? 1 : -1),
        ),
      );
      syncActive();
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(shown[activeIndex] ?? resolveItemInput(input.value, candidates));
    } else if (event.key === "Escape") {
      close();
    }
  });
  const outside = (event) => {
    if (!host.contains(event.target)) close();
  };
  document.addEventListener("pointerdown", outside, true);
  cleanup.push(() =>
    document.removeEventListener("pointerdown", outside, true),
  );
  host.append(input, results);
  return {
    input,
    getSelected: () => selected ?? resolveItemInput(input.value, candidates),
    clear() {
      selected = null;
      input.value = "";
      close();
    },
  };
}

function createHousePicker(host, onSelect, cleanup) {
  const candidates = houseCandidates();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "planning-picker-button";
  button.setAttribute("aria-label", t("选择房屋", "Choose house"));
  const results = document.createElement("div");
  results.className = "planning-results";
  let selected = candidates[0] ?? null;

  const paintButton = () => {
    button.replaceChildren();
    const copy = document.createElement("span");
    copy.className = "planning-picker-copy";
    if (!selected) {
      copy.textContent = t("暂无房屋", "No houses");
      button.append(copy);
      return;
    }
    const icon = document.createElement("span");
    icon.className = "planning-picker-icon";
    icon.innerHTML = houseIcon(selected);
    copy.textContent = selected.name;
    const arrow = document.createElement("span");
    arrow.className = "planning-picker-arrow";
    arrow.textContent = "▾";
    button.append(icon, copy, arrow);
  };
  const close = () => {
    results.dataset.open = "false";
  };
  const choose = (candidate) => {
    selected = candidate;
    paintButton();
    close();
    onSelect(candidate);
  };
  const renderOptions = () => {
    results.replaceChildren(
      ...candidates.map((candidate) =>
        createOption(candidate, "house", choose),
      ),
    );
  };
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const opening = results.dataset.open !== "true";
    if (opening) renderOptions();
    results.dataset.open = String(opening);
  });
  const outside = (event) => {
    if (!host.contains(event.target)) close();
  };
  document.addEventListener("pointerdown", outside, true);
  cleanup.push(() =>
    document.removeEventListener("pointerdown", outside, true),
  );
  paintButton();
  host.append(button, results);
  return {
    getSelected: () => selected,
    refresh() {
      paintButton();
      results
        .querySelectorAll(".planning-option-copy small")
        .forEach((meta, index) => {
          const candidate = candidates[index];
          meta.textContent = `${t("当前", "Current")} ${currentHouseLevel(candidate.hrid)} · ${t("最高", "Max")} ${maxHouseLevel(candidate.hrid)}`;
        });
    },
  };
}

function createPlanningEditor(host, cleanup) {
  const grid = document.createElement("div");
  grid.className = "planning-editor-grid";

  const title = (zh, en, kind) => {
    const heading = document.createElement("div");
    heading.className = "planning-add-title";
    const copy = document.createElement("span");
    copy.textContent = t(zh, en);
    let defaultPolicy = planning.getDefaultPolicy(kind);
    const policy = createPolicyControl(defaultPolicy, (next) => {
      defaultPolicy = next;
      planning.setDefaultPolicy(kind, next);
    });
    heading.append(copy, policy);
    return { heading, getPolicy: () => defaultPolicy };
  };

  const itemCard = document.createElement("section");
  itemCard.className = "planning-add-card";
  const itemTitle = title("添加物品目标", "Add item target", "item");
  itemCard.append(itemTitle.heading);
  const itemBody = document.createElement("div");
  itemBody.className = "planning-add-body";
  const itemSearch = document.createElement("div");
  itemSearch.className = "planning-search-wrap";
  let chosenItem = null;
  const itemPicker = createItemPicker(
    itemSearch,
    (candidate) => {
      chosenItem = candidate;
    },
    cleanup,
  );
  const itemCount = document.createElement("input");
  itemCount.type = "number";
  itemCount.min = "1";
  itemCount.step = "1";
  itemCount.value = "1";
  itemCount.className = "planning-count-input";
  itemCount.setAttribute("aria-label", t("最终持有量", "Final quantity"));
  const itemAdd = document.createElement("button");
  itemAdd.type = "button";
  itemAdd.className = "planning-primary";
  itemAdd.textContent = t("添加", "Add");
  const submitItem = () => {
    const candidate = chosenItem ?? itemPicker.getSelected();
    if (!candidate) {
      itemPicker.input.setCustomValidity?.(
        t("请先选择有效物品", "Choose a valid item"),
      );
      itemPicker.input.reportValidity?.();
      return;
    }
    itemPicker.input.setCustomValidity?.("");
    planning.upsertGoal({
      kind: "item",
      targetHrid: candidate.hrid,
      target: itemCount.value,
      policy: itemTitle.getPolicy(),
    });
    chosenItem = null;
    itemPicker.clear();
    itemCount.value = "1";
  };
  itemAdd.addEventListener("click", submitItem);
  itemCount.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitItem();
  });
  itemBody.append(itemSearch, itemCount, itemAdd);
  itemCard.append(itemBody);

  const houseCard = document.createElement("section");
  houseCard.className = "planning-add-card";
  const houseTitle = title("添加房屋目标", "Add house target", "house");
  houseCard.append(houseTitle.heading);
  const houseBody = document.createElement("div");
  houseBody.className = "planning-add-body";
  const houseWrap = document.createElement("div");
  houseWrap.className = "planning-house-wrap";
  const level = document.createElement("select");
  level.className = "planning-level-select";
  level.setAttribute("aria-label", t("房屋目标等级", "House target level"));
  let levelSignature = "";
  let levelHouseHrid = "";
  const refreshLevels = (candidate) => {
    const signature = candidate
      ? `${candidate.hrid}:${currentHouseLevel(candidate.hrid)}:${maxHouseLevel(candidate.hrid)}`
      : "none";
    if (signature === levelSignature) return;
    const previous =
      candidate?.hrid === levelHouseHrid ? String(level.value ?? "") : "";
    levelSignature = signature;
    levelHouseHrid = candidate?.hrid ?? "";
    level.replaceChildren();
    if (!candidate) {
      level.disabled = true;
      return;
    }
    const current = currentHouseLevel(candidate.hrid);
    for (
      let targetLevel = current + 1;
      targetLevel <= maxHouseLevel(candidate.hrid);
      targetLevel += 1
    ) {
      const option = document.createElement("option");
      option.value = String(targetLevel);
      option.textContent = `${t("等级", "Level")} ${targetLevel}`;
      level.append(option);
    }
    level.disabled = level.options.length === 0;
    if ([...level.options].some((option) => option.value === previous)) {
      level.value = previous;
    }
  };
  const housePicker = createHousePicker(houseWrap, refreshLevels, cleanup);
  refreshLevels(housePicker.getSelected());
  const houseAdd = document.createElement("button");
  houseAdd.type = "button";
  houseAdd.className = "planning-primary";
  houseAdd.textContent = t("添加", "Add");
  houseAdd.addEventListener("click", () => {
    const candidate = housePicker.getSelected();
    if (!candidate || !level.value) return;
    planning.upsertGoal({
      kind: "house",
      targetHrid: candidate.hrid,
      target: level.value,
      policy: houseTitle.getPolicy(),
    });
  });
  houseBody.append(houseWrap, level, houseAdd);
  houseCard.append(houseBody);
  grid.append(itemCard, houseCard);
  host.append(grid);
  return {
    refresh() {
      housePicker.refresh();
      refreshLevels(housePicker.getSelected());
    },
  };
}

function renderGoals(host, goals) {
  host.replaceChildren();
  const section = document.createElement("section");
  section.className = "planning-section";
  const heading = document.createElement("h3");
  heading.textContent = `${t("规划目标", "Planning goals")} · ${goals.length}`;
  section.append(heading);
  if (!goals.length) {
    const empty = document.createElement("div");
    empty.className = "planning-empty";
    empty.textContent = t(
      "从上方选择物品或房屋开始规划。",
      "Choose an item or house above to begin.",
    );
    section.append(empty);
  }
  for (const goal of goals) {
    const row = document.createElement("article");
    row.className = "planning-goal";
    row.dataset.enabled = String(goal.enabled);
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = goal.enabled;
    toggle.title = t("启用目标", "Enable goal");
    toggle.addEventListener("change", () => {
      planning.updateGoal(goal.id, { enabled: toggle.checked });
    });
    const icon = document.createElement("span");
    icon.className = "planning-goal-icon";
    icon.innerHTML = goalIcon(goal);
    icon.title = goalLabel(goal);
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", goalLabel(goal));
    const values = document.createElement("div");
    values.className = "planning-goal-values";
    const current = document.createElement("span");
    current.className = "planning-goal-current";
    current.dataset.goalId = goal.id;
    current.textContent = `${t("当前", "Current")} ${number(goal.kind === "house" ? currentHouseLevel(goal.targetHrid) : procurement.getInventoryCount(goal.targetHrid, 0))}`;
    const arrow = document.createElement("span");
    arrow.className = "planning-goal-arrow";
    arrow.textContent = "→";
    const target = document.createElement("input");
    target.type = "number";
    target.min = "1";
    target.max =
      goal.kind === "house" ? String(maxHouseLevel(goal.targetHrid)) : "";
    target.step = "1";
    target.value = String(goal.target);
    target.title =
      goal.kind === "house"
        ? t("目标等级", "Target level")
        : t("最终持有量", "Final quantity");
    target.addEventListener("change", () => {
      planning.updateGoal(goal.id, { target: target.value });
    });
    values.append(current, arrow, target);
    const policy = createPolicyControl(goal.policy, (next) => {
      planning.setGoalPolicy(goal.id, next);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "planning-remove";
    remove.textContent = "×";
    remove.title = t("删除", "Remove");
    remove.addEventListener("click", () => planning.removeGoal(goal.id));
    row.append(toggle, icon, values, policy, remove);
    section.append(row);
  }
  host.append(section);
}

function updateGoalCurrentValues(host, goals) {
  const nodes = new Map(
    [...host.querySelectorAll(".planning-goal-current")].map((node) => [
      node.dataset.goalId,
      node,
    ]),
  );
  for (const goal of goals) {
    const node = nodes.get(goal.id);
    if (!node) continue;
    const current =
      goal.kind === "house"
        ? currentHouseLevel(goal.targetHrid)
        : procurement.getInventoryCount(goal.targetHrid, 0);
    node.textContent = `${t("当前", "Current")} ${number(current)}`;
  }
}

function renderSteps(host, result) {
  host.replaceChildren();
  const section = document.createElement("section");
  section.className = "planning-section";
  const heading = document.createElement("h3");
  heading.textContent = `${t("第 2 步：选择制作方式", "Step 2: Choose production methods")} · ${result.nodes.length}`;
  section.append(heading);
  if (!result.nodes.length) {
    const empty = document.createElement("div");
    empty.className = "planning-empty";
    empty.textContent = t("当前没有需要制作的物品。", "Nothing to produce.");
    section.append(empty);
  }
  for (const node of result.nodes) {
    const row = document.createElement("details");
    row.className = "planning-step";
    const summary = document.createElement("summary");
    const icon = document.createElement("span");
    icon.className = "planning-row-icon";
    icon.innerHTML = itemIcon(node.itemHrid);
    const label = document.createElement("span");
    label.className = "planning-step-name";
    label.textContent = node.name;
    const required = document.createElement("span");
    required.className = "planning-step-count";
    required.textContent = `${t("所需", "Required")} ${number(node.requiredOutput)}`;
    const policy = createPolicyControl(node.policy, (next) => {
      for (const goalId of new Set(
        node.branches.map((branch) => branch.goalId),
      )) {
        planning.setNodePolicy(goalId, node.itemHrid, next);
      }
    });
    summary.append(icon, label, required, policy);
    const sources = document.createElement("div");
    sources.className = "planning-source-list";
    const goals = new Map(result.goals.map((goal) => [goal.id, goal]));
    for (const branch of node.branches) {
      const source = document.createElement("div");
      source.className = "planning-source-row";
      const sourceCopy = document.createElement("span");
      sourceCopy.className = "planning-source-copy";
      const sourceIcon = document.createElement("span");
      sourceIcon.className = "planning-source-icon";
      const goal = goals.get(branch.goalId);
      if (goal) sourceIcon.innerHTML = goalIcon(goal);
      const name = document.createElement("strong");
      name.textContent = goal ? goalLabel(goal) : branch.goalId;
      name.title = name.textContent;
      sourceCopy.append(sourceIcon, name);
      const count = document.createElement("span");
      count.textContent = `${t("所需", "Required")} ${number(branch.requiredOutput)}`;
      const branchPolicy = createPolicyControl(branch.policy, (next) => {
        planning.setNodePolicy(branch.goalId, node.itemHrid, next);
      });
      source.append(sourceCopy, count, branchPolicy);
      sources.append(source);
    }
    row.append(summary, sources);
    section.append(row);
  }
  host.append(section);
}

function renderMaterials(host, result) {
  host.replaceChildren();
  const section = document.createElement("section");
  section.className = "planning-section";
  const heading = document.createElement("div");
  heading.className = "planning-section-heading";
  const title = document.createElement("h3");
  title.textContent = `${t("基础材料", "Base materials")} · ${result.materials.length}`;
  const addAll = document.createElement("button");
  addAll.type = "button";
  addAll.className = "planning-primary";
  addAll.textContent = t("一键补齐", "Add all");
  addAll.disabled = !result.materials.some(
    (material) => material.purchasable && material.addableShortage > 0,
  );
  addAll.addEventListener("click", () => {
    planning.addShortagesToCart(result.materials);
  });
  heading.append(title, addAll);
  section.append(heading);
  if (!result.materials.length) {
    const empty = document.createElement("div");
    empty.className = "planning-empty";
    empty.textContent = t(
      "当前没有基础材料需求。",
      "No base materials needed.",
    );
    section.append(empty);
  }
  for (const material of result.materials) {
    const row = document.createElement("details");
    row.className = "planning-material";
    row.dataset.missing = String(material.addableShortage > 0);
    const summary = document.createElement("summary");
    const icon = document.createElement("span");
    icon.className = "planning-row-icon";
    icon.innerHTML = itemIcon(material.itemHrid, material.name);
    const name = document.createElement("span");
    name.className = "planning-material-name";
    name.textContent = material.name;
    name.title = material.itemHrid;
    const missing = document.createElement("strong");
    missing.textContent = material.addableShortage
      ? `${t("还需", "Need")} ${number(material.addableShortage)}`
      : t("已覆盖", "Covered");
    summary.append(icon, name, missing);
    const grid = document.createElement("div");
    grid.className = "planning-material-grid";
    const metric = (label, value, sub = "") => {
      const cell = document.createElement("div");
      cell.innerHTML = `<span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ""}`;
      return cell;
    };
    grid.append(
      metric(t("规划需求", "Required"), number(material.required)),
      metric(
        t("库存", "Inventory"),
        number(material.owned),
        `${t("项目占用", "Project")} ${number(material.projectInventory)} · ${t("规划使用", "Planning")} ${number(material.inventoryUsed)}`,
      ),
      metric(
        t("购物车", "Cart"),
        number(material.cart.total),
        `${t("项目", "Project")} ${number(material.cart.project)} · ${t("规划", "Planning")} ${number(material.cart.planning)} · ${t("手工", "Manual")} ${number(material.cart.manual)}`,
      ),
      metric(t("仍需购买", "To buy"), number(material.addableShortage)),
    );
    const actions = document.createElement("div");
    actions.className = "planning-material-actions";
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = material.purchasable
      ? t("加入购物车", "Add to cart")
      : t("不可购买", "Not tradable");
    add.disabled = !material.purchasable || !material.addableShortage;
    add.addEventListener("click", () =>
      planning.addShortagesToCart([material]),
    );
    const source = document.createElement("span");
    source.textContent = `${t("来源", "Sources")}: ${goalSources(material.sourceIds, result.goals)}`;
    actions.append(add, source);
    row.append(summary, grid, actions);
    section.append(row);
  }
  host.append(section);
}

export class PlanningPanel {
  constructor(host) {
    this.host = host;
    this.cleanup = [];
    this.signatures = {};
    this.route = "targets";
    this.result = planning.getResult();
    this.decisionResult = planning.getDecisionResult();
    this.catalogDirty = false;
    this.houseDirty = false;
    this.updatePending = false;
    this.updateCount = 0;
    this.build();
    this.catalogSignature = catalogSignature();
    this.unsubscribe = [
      procurement.on("planning:change", () => this.scheduleUpdate()),
      procurement.on("cart:change", () => this.scheduleUpdate()),
      procurement.on("plan:change", () => this.scheduleUpdate()),
      procurement.on("inventory:change", () => this.scheduleUpdate()),
    ];
    this.updateScheduler = createFrameScheduler(() => this.update());
    this.update();
  }

  build() {
    this.host.replaceChildren();
    const tabs = document.createElement("nav");
    tabs.className = "planning-subtabs";
    const targetTab = document.createElement("button");
    targetTab.type = "button";
    targetTab.dataset.route = "targets";
    targetTab.textContent = t("目标", "Targets");
    const listTab = document.createElement("button");
    listTab.type = "button";
    listTab.dataset.route = "list";
    listTab.textContent = t("清单", "List");
    targetTab.addEventListener("click", () => this.setRoute("targets"));
    listTab.addEventListener("click", () => this.setRoute("list"));
    tabs.append(targetTab, listTab);

    this.targetPage = document.createElement("div");
    this.targetPage.className = "planning-page";
    this.targetPage.dataset.page = "targets";
    const stageOneTitle = document.createElement("h2");
    stageOneTitle.className = "planning-stage-title";
    stageOneTitle.textContent = t(
      "第 1 步：选择目标",
      "Step 1: Choose targets",
    );
    const intro = document.createElement("p");
    intro.className = "planning-intro";
    intro.textContent = t(
      "设置目标不会自动重算。房屋成本固定；计算第 2 步时，制作链才会读取当前茶饮、装备、社区 Buff、暴饮之囊、库存和安全余量。",
      "Editing targets does not recalculate automatically. House costs stay fixed; calculating Step 2 reads current buffs, inventory, and safety margins.",
    );
    const calculateBar = document.createElement("div");
    calculateBar.className = "planning-calculate-bar";
    this.targetStatus = document.createElement("span");
    this.targetCalculate = document.createElement("button");
    this.targetCalculate.type = "button";
    this.targetCalculate.className = "planning-primary";
    this.targetCalculate.textContent = t("计算第 2 步", "Calculate Step 2");
    this.targetCalculate.addEventListener("click", () =>
      this.calculateDecisions(),
    );
    calculateBar.append(this.targetStatus, this.targetCalculate);
    this.editorHost = document.createElement("div");
    this.goalsHost = document.createElement("div");
    this.decisionStage = document.createElement("div");
    this.decisionStage.className = "planning-stage";
    this.stepsHost = document.createElement("div");
    const stageTwoBar = document.createElement("div");
    stageTwoBar.className = "planning-calculate-bar";
    this.decisionStatus = document.createElement("span");
    this.materialCalculate = document.createElement("button");
    this.materialCalculate.type = "button";
    this.materialCalculate.className = "planning-primary";
    this.materialCalculate.textContent = t("计算第 3 步", "Calculate Step 3");
    this.materialCalculate.addEventListener("click", () =>
      this.calculateMaterials(),
    );
    stageTwoBar.append(this.decisionStatus, this.materialCalculate);
    this.decisionStage.append(this.stepsHost, stageTwoBar);
    this.targetPage.append(
      stageOneTitle,
      intro,
      this.editorHost,
      this.goalsHost,
      calculateBar,
      this.decisionStage,
    );

    this.listPage = document.createElement("div");
    this.listPage.className = "planning-page planning-results-column";
    this.listPage.dataset.page = "list";
    const listBar = document.createElement("div");
    listBar.className = "planning-calculate-bar";
    const stageThreeTitle = document.createElement("strong");
    stageThreeTitle.textContent = t(
      "第 3 步：基础材料清单",
      "Step 3: Base-material list",
    );
    this.listStatus = document.createElement("span");
    listBar.append(stageThreeTitle, this.listStatus);
    this.materialsHost = document.createElement("div");
    this.warningHost = document.createElement("div");
    this.footer = document.createElement("div");
    this.footer.className = "planning-footer";
    this.listPage.append(
      listBar,
      this.materialsHost,
      this.warningHost,
      this.footer,
    );
    this.host.append(tabs, this.targetPage, this.listPage);
    this.editor = createPlanningEditor(this.editorHost, this.cleanup);
    this.setRoute(this.route);
    this.renderDecision(true);
    this.renderResult(true);
  }

  setRoute(route) {
    this.route = route === "list" ? "list" : "targets";
    for (const button of this.host.querySelectorAll(
      ".planning-subtabs button",
    )) {
      button.dataset.active = String(button.dataset.route === this.route);
    }
    this.targetPage.hidden = this.route !== "targets";
    this.listPage.hidden = this.route !== "list";
  }

  calculateDecisions() {
    this.decisionResult = planning.calculateDecisions();
    this.signatures.decisions = null;
    this.renderDecision(true);
    this.updateStatus();
    globalThis.requestAnimationFrame?.(() =>
      this.decisionStage?.scrollIntoView?.({ block: "start" }),
    );
  }

  calculateMaterials() {
    this.result = planning.calculateMaterials();
    this.signatures.materials = null;
    this.renderResult(true);
    this.updateStatus();
    this.setRoute("list");
  }

  scheduleUpdate({ catalog = false, house = false } = {}) {
    this.catalogDirty ||= catalog;
    this.houseDirty ||= house;
    if (this.host.hidden) {
      this.updatePending = true;
      return;
    }
    this.updateScheduler?.schedule();
  }

  update() {
    if (!this.host?.isConnected) return;
    this.updatePending = false;
    this.updateCount += 1;
    if (this.catalogDirty) {
      const nextCatalogSignature = catalogSignature();
      this.catalogDirty = false;
      if (this.catalogSignature !== nextCatalogSignature) {
        const route = this.route;
        const result = this.result;
        const decisionResult = this.decisionResult;
        this.cleanup.forEach((dispose) => dispose());
        this.cleanup = [];
        this.signatures = {};
        this.route = route;
        this.result = result;
        this.decisionResult = decisionResult;
        this.build();
        this.catalogSignature = nextCatalogSignature;
      }
    }
    if (this.houseDirty) {
      this.houseDirty = false;
      this.editor?.refresh();
    }
    const goals = planning.getGoals();
    const goalsSignature = JSON.stringify(goals);
    if (this.signatures.goals !== goalsSignature) {
      renderGoals(this.goalsHost, goals);
      this.signatures.goals = goalsSignature;
    } else {
      updateGoalCurrentValues(this.goalsHost, goals);
    }
    const currentDecision = planning.getDecisionResult();
    if (currentDecision !== this.decisionResult) {
      this.decisionResult = currentDecision;
      this.renderDecision(true);
    } else if (currentDecision) {
      this.renderDecision();
    }
    this.updateStatus();
  }

  updateStatus() {
    const dirty = planning.isDirty();
    const diagnostics = planning.getDiagnostics();
    const listCopy = dirty
      ? t("目标已更改，等待计算", "Targets changed; calculation pending")
      : diagnostics.lastCalculatedAt
        ? t("当前清单已计算", "List is up to date")
        : t("尚未计算", "Not calculated yet");
    this.listStatus.className = dirty ? "planning-dirty" : "planning-clean";
    this.listStatus.textContent = listCopy;
    const decisionReady = Boolean(this.decisionResult);
    this.targetStatus.className = decisionReady
      ? "planning-clean"
      : "planning-dirty";
    this.targetStatus.textContent = decisionReady
      ? t("第 2 步已生成", "Step 2 is ready")
      : t("等待计算第 2 步", "Step 2 is pending");
    this.decisionStatus.className = "planning-dirty";
    this.decisionStatus.textContent = t(
      "调整策略不会自动计算材料",
      "Policy edits do not calculate materials automatically",
    );
  }

  renderDecision(force = false) {
    const result = this.decisionResult;
    this.decisionStage.hidden = !result;
    if (!result) {
      this.stepsHost.replaceChildren();
      this.signatures.decisions = null;
      return;
    }
    const signature = JSON.stringify(result.nodes);
    if (force || this.signatures.decisions !== signature) {
      renderSteps(this.stepsHost, result);
      this.signatures.decisions = signature;
    }
  }

  renderResult(force = false) {
    const result = this.result;
    if (!result) {
      if (!force && this.signatures.empty) return;
      this.materialsHost.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "planning-empty planning-section";
      empty.textContent = t(
        "请在“目标”页点击开始计算。",
        "Choose Start calculation on the Targets tab.",
      );
      this.materialsHost.append(empty);
      this.warningHost.replaceChildren();
      this.footer.textContent = "";
      this.signatures.empty = true;
      return;
    }
    this.signatures.empty = false;
    const materialsSignature = JSON.stringify(result.materials);
    if (force || this.signatures.materials !== materialsSignature) {
      renderMaterials(this.materialsHost, result);
      this.signatures.materials = materialsSignature;
    }
    this.warningHost.replaceChildren();
    if (result.warnings.length) {
      const warning = document.createElement("div");
      warning.className = "planning-warning";
      warning.textContent = t(
        `有 ${result.warnings.length} 条链路出现循环或超过深度限制，已作为基础材料显示。`,
        `${result.warnings.length} paths contained a cycle or exceeded the depth limit and were shown as base materials.`,
      );
      this.warningHost.append(warning);
    }
    this.footer.textContent = t(
      `规划 ${result.goals.length} 项 · 基础材料 ${result.materials.length} 种`,
      `${result.goals.length} goals · ${result.materials.length} base materials`,
    );
  }

  refreshCatalog() {
    this.scheduleUpdate({ catalog: true, house: true });
  }

  refreshHouses() {
    this.scheduleUpdate({ house: true });
  }

  destroy() {
    this.updateScheduler?.cancel();
    this.unsubscribe?.forEach((unsubscribe) => unsubscribe?.());
    this.cleanup.forEach((dispose) => dispose());
    this.cleanup = [];
  }
}

function isCompactViewport() {
  return (
    window.matchMedia?.("(max-width:760px)")?.matches ??
    Number(window.innerWidth) <= 760
  );
}

export function createPlanningUi({ scope }) {
  let active = false;
  let tab = null;
  let host = null;
  let panel = null;
  let shell = null;
  let navigationBranch = null;
  let lastActiveNativeTab = null;
  const hiddenNodes = new Map();

  const restoreNative = () => {
    for (const [node, state] of hiddenNodes) {
      node.hidden = state.hidden;
      if (state.styleDisplay === null) node.style.removeProperty("display");
      else node.style.display = state.styleDisplay;
    }
    hiddenNodes.clear();
  };
  const clearTabOverride = () => {
    if (!navigationBranch) return;
    delete navigationBranch.dataset.mwitoolsPlanningActive;
    for (const property of [
      "--mwi-planning-idle-background",
      "--mwi-planning-idle-border",
      "--mwi-planning-idle-color",
      "--mwi-planning-idle-shadow",
    ]) {
      navigationBranch.style.removeProperty(property);
    }
  };
  const captureIdleStyle = () => {
    if (!navigationBranch || typeof getComputedStyle !== "function") return;
    const idle = navigationBranch.querySelector(
      `button:not(#${TAB_ID}):not([aria-selected="true"]):not(.Mui-selected)`,
    );
    if (!idle) return;
    const style = getComputedStyle(idle);
    const background = style.background || style.backgroundColor;
    if (background && background !== "transparent") {
      navigationBranch.style.setProperty(
        "--mwi-planning-idle-background",
        background,
      );
    }
    if (style.borderColor) {
      navigationBranch.style.setProperty(
        "--mwi-planning-idle-border",
        style.borderColor,
      );
    }
    if (style.color) {
      navigationBranch.style.setProperty(
        "--mwi-planning-idle-color",
        style.color,
      );
    }
    if (style.boxShadow && style.boxShadow !== "none") {
      navigationBranch.style.setProperty(
        "--mwi-planning-idle-shadow",
        style.boxShadow,
      );
    }
  };
  const syncViewport = () => {
    if (!host) return;
    if (!isCompactViewport() || !active) {
      host.style.removeProperty("height");
      host.style.removeProperty("max-height");
      return;
    }
    const top = Math.max(0, Math.round(host.getBoundingClientRect().top));
    const available = `calc(100dvh - ${top}px - env(safe-area-inset-bottom,0px))`;
    host.style.height = available;
    host.style.maxHeight = available;
  };
  const setActive = (next) => {
    const nextActive = Boolean(next);
    const activating = nextActive && !active;
    if (nextActive && !active) captureIdleStyle();
    active = nextActive;
    if (tab) {
      tab.dataset.active = String(active);
      tab.setAttribute("aria-selected", String(active));
      tab.classList.toggle("Mui-selected", active);
      if (tab.hasAttribute("data-selected")) {
        tab.dataset.selected = String(active);
      }
      if (tab.hasAttribute("data-state")) {
        tab.dataset.state = active ? "active" : "inactive";
      }
      if (!active) tab.blur();
    }
    if (navigationBranch && active) {
      const selected = navigationBranch.querySelector(
        `button[aria-selected="true"]:not(#${TAB_ID}):not(#${ASSET_TAB_ID}),button.Mui-selected:not(#${TAB_ID}):not(#${ASSET_TAB_ID})`,
      );
      if (selected) lastActiveNativeTab = selected;
    }
    if (host) host.hidden = !active;
    if (!active) {
      restoreNative();
      clearTabOverride();
      syncViewport();
      return;
    }
    navigationBranch.dataset.mwitoolsPlanningActive = "true";
    for (const node of [...(shell?.children ?? [])]) {
      if (
        node === navigationBranch ||
        node === host ||
        node.tagName === "STYLE"
      ) {
        continue;
      }
      if (!hiddenNodes.has(node)) {
        hiddenNodes.set(node, {
          hidden: node.hidden,
          styleDisplay: node.style.display || null,
        });
      }
      node.hidden = true;
      node.style.display = "none";
    }
    syncViewport();
    if (activating || panel?.updatePending) panel?.update();
  };
  const teardown = () => {
    setActive(false);
    panel?.destroy();
    panel = null;
    tab?.remove();
    host?.remove();
    tab = null;
    host = null;
    shell = null;
    navigationBranch = null;
    lastActiveNativeTab = null;
  };
  const mount = (anchor, found) => {
    ({ shell, navigationBranch } = found);
    tab = anchor.cloneNode(true);
    tab.id = TAB_ID;
    tab.dataset.mwitoolsCharacterTab = "true";
    tab.type = "button";
    const badge = tab.querySelector(
      ".TabsComponent_badge__1Du26,.MuiBadge-root",
    );
    if (badge) badge.textContent = t("规划", "Planning");
    else tab.textContent = t("规划", "Planning");
    for (const className of [...tab.classList]) {
      if (/(?:^|[_-])(?:active|selected)(?:[_-]|$)/i.test(className)) {
        tab.classList.remove(className);
      }
    }
    tab.dataset.active = "false";
    tab.setAttribute("aria-selected", "false");
    tab.setAttribute("tabindex", "-1");
    if (tab.hasAttribute("data-selected")) tab.dataset.selected = "false";
    if (tab.hasAttribute("data-state")) tab.dataset.state = "inactive";
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActive(!active);
    });
    anchor.insertAdjacentElement("afterend", tab);
    host = document.createElement("section");
    host.id = PANEL_ID;
    host.hidden = true;
    shell.appendChild(host);
    panel = new PlanningPanel(host);
  };
  const ensureMounted = () => {
    const loadout = findCharacterManagementLoadoutTab();
    const assetTab = document.getElementById(ASSET_TAB_ID);
    const anchor =
      assetTab?.parentElement === loadout?.parentElement ? assetTab : loadout;
    const found = anchor && findPanelShell(anchor);
    if (!anchor || !found) {
      if (tab || host) teardown();
      return;
    }
    const correctlyMounted =
      tab?.previousElementSibling === anchor &&
      tab?.parentElement === anchor.parentElement &&
      host?.parentElement === found.shell;
    if (tab?.isConnected && host?.isConnected && correctlyMounted) {
      const otherSelected = navigationBranch?.querySelector(
        `button[aria-selected="true"]:not(#${TAB_ID}):not(#${ASSET_TAB_ID}),button.Mui-selected:not(#${TAB_ID}):not(#${ASSET_TAB_ID})`,
      );
      if (
        (otherSelected && otherSelected !== lastActiveNativeTab) ||
        tab.getAttribute("aria-selected") !== "true"
      ) {
        if (active) setActive(false);
      } else if (active) {
        syncViewport();
      }
      return;
    }
    teardown();
    mount(anchor, found);
  };

  addStyles();
  ensureMounted();
  const mountScheduler = createFrameScheduler(ensureMounted);
  const MutationObserverRef =
    globalThis.MutationObserver ?? document.defaultView?.MutationObserver;
  const observer = new MutationObserverRef((records) => {
    const relevant = records.some((record) => {
      const target =
        record.target?.nodeType === 1
          ? record.target
          : record.target?.parentElement;
      if (target?.closest?.(`#${TAB_ID},#${PANEL_ID}`)) return false;
      if (record.type === "attributes") {
        const management = target?.closest?.(
          '[class*="CharacterManagement_characterManagement"]',
        );
        return Boolean(
          management &&
          (target === management ||
            target === navigationBranch ||
            target?.parentElement === navigationBranch),
        );
      }
      return [...record.addedNodes, ...record.removedNodes].some(
        (node) =>
          node?.nodeType === 1 &&
          !(
            node.matches?.(`#${TAB_ID},#${PANEL_ID}`) ||
            node.closest?.(`#${TAB_ID},#${PANEL_ID}`)
          ) &&
          (node.matches?.(
            '[class*="CharacterManagement_characterManagement"]',
          ) ||
            node.querySelector?.(
              '[class*="CharacterManagement_characterManagement"]',
            )),
      );
    });
    if (relevant) mountScheduler.schedule();
  });
  scope.observer(observer, document.body, {
    attributes: true,
    attributeFilter: ["aria-selected", "class", "data-active", "hidden"],
    childList: true,
    subtree: true,
  });
  const closeFromOtherTab = (event) => {
    if (
      active &&
      !event.target.closest(`#${TAB_ID}`) &&
      !event.target.closest(`#${PANEL_ID}`) &&
      navigationBranch?.contains(event.target)
    ) {
      setActive(false);
    }
  };
  scope.event(document, "pointerdown", closeFromOtherTab, true);
  scope.event(document, "click", closeFromOtherTab, true);
  scope.event(window, "resize", syncViewport);
  scope.event(document, "keydown", (event) => {
    if (active && isCompactViewport() && event.key === "Escape") {
      setActive(false);
    }
  });
  for (const messageType of [
    "community_buffs_updated",
    "consumable_buffs_updated",
    "equipment_buffs_updated",
    "personal_buffs_updated",
    "guild_buffs_updated",
  ]) {
    scope.add(runtime.onMessage(messageType, () => panel?.scheduleUpdate()));
  }
  scope.add(
    runtime.onMessage("house_rooms_updated", () => panel?.refreshHouses()),
  );
  scope.add(
    runtime.onMessage("init_character_data", () => panel?.refreshCatalog()),
  );
  scope.add(() => mountScheduler.cancel());
  return {
    update() {
      panel?.scheduleUpdate();
    },
    destroy() {
      teardown();
      document.getElementById(STYLE_ID)?.remove();
    },
    getDiagnostics() {
      return { updateCount: panel?.updateCount ?? 0 };
    },
  };
}

runtime.features.register({
  id: "planningPage",
  setting: "procurementAssistant",
  scope: "character",
  initialize({ scope }) {
    const ui = createPlanningUi({ scope });
    return () => ui.destroy();
  },
});
