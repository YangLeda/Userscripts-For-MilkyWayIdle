import { runtime } from "../../core/runtime.js";
import { ASSET_COMPONENT_KEYS } from "./00-snapshot.js";
import { getUtc8DayKey } from "./10-store.js";
import { AssetHistoryChart } from "./20-chart.js";

const TAB_ID = "mwitools-asset-history-tab";
const PANEL_ID = "mwitools-asset-history-panel";
const STYLE_ID = "mwitools-asset-history-style";

const ROWS = [
  ["total", "总计", "Total"],
  ["equipment", "装备", "Equipment"],
  ["inventory", "库存", "Inventory"],
  ["marketListings", "订单", "Market listings"],
  ["houses", "房屋", "Houses"],
  ["abilities", "技能", "Abilities"],
  ["nonTradableTokens", "不可交易代币", "Non-tradable tokens"],
  ["shrine", "神龛", "Shrine"],
];

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function formatNumber(value, signed = false) {
  if (!Number.isFinite(value)) return "—";
  const formatted = runtime.api.numberFormatter?.(Math.abs(value)) ?? value;
  if (!signed || value === 0) return String(formatted);
  return `${value > 0 ? "+" : "−"}${formatted}`;
}

function formatPercent(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0)
    return "—";
  const value = ((current - previous) / previous) * 100;
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function valueClass(value) {
  if (!Number.isFinite(value) || value === 0) return "is-neutral";
  return value > 0 ? "is-positive" : "is-negative";
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${TAB_ID}[data-active="true"] { background:#00c6ff!important; color:#0b1522!important; box-shadow:0 0 10px rgba(0,198,255,.45); }
    #${PANEL_ID} { box-sizing:border-box; width:100%; min-width:0; padding:12px 16px 24px; color:var(--color-text-primary,#eee); background:#111b2b; }
    .mwi-asset-disclaimer { margin:0 0 10px; color:var(--color-text-secondary,#aaa); font-size:.72rem; line-height:1.4; }
    .mwi-asset-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin-bottom:12px; }
    .mwi-asset-card { min-width:0; padding:10px 12px; border:1px solid rgba(255,255,255,.08); border-radius:8px; background:rgba(255,255,255,.06); }
    .mwi-asset-card-label { color:#9fb4d1; font-size:.68rem; }
    .mwi-asset-card-value { overflow:hidden; margin-top:4px; font-size:1rem; font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
    .mwi-asset-card-meta { margin-top:3px; color:var(--color-text-secondary,#999); font-size:.63rem; }
    .is-positive { color:#65d394!important; } .is-negative { color:#ff7b75!important; } .is-neutral { color:inherit; }
    .mwi-asset-section { margin-top:10px; border:1px solid rgba(255,255,255,.08); border-radius:8px; background:#0c141f; overflow:hidden; }
    .mwi-asset-section-title { padding:9px 11px; border-bottom:1px solid rgba(255,255,255,.08); font-size:.84rem; font-weight:700; }
    .mwi-asset-table-wrap { overflow-x:auto; }
    .mwi-asset-table { width:100%; min-width:470px; border-collapse:collapse; font-size:.74rem; }
    .mwi-asset-table th,.mwi-asset-table td { padding:7px 10px; border-bottom:1px solid rgba(255,255,255,.065); text-align:right; }
    .mwi-asset-table th:first-child,.mwi-asset-table td:first-child { text-align:left; }
    .mwi-asset-table tr:last-child td { border-bottom:0; }
    .mwi-asset-table tr[data-key="total"] { font-weight:700; background:rgba(255,255,255,.035); }
    .mwi-asset-chart-controls { display:flex; flex-wrap:wrap; gap:6px; padding:9px 10px 0; }
    .mwi-asset-chart-controls button,.mwi-asset-action { border:1px solid rgba(255,255,255,.13); border-radius:5px; background:rgba(255,255,255,.07); color:inherit; padding:5px 9px; cursor:pointer; font:inherit; }
    .mwi-asset-chart-controls button:hover,.mwi-asset-action:hover { background:#3f4655; transform:translateY(-1px); }
    .mwi-asset-chart-controls button[data-active="true"] { border-color:transparent; background:#00c6ff; color:#0b1522; box-shadow:0 0 10px rgba(0,198,255,.45); }
    .mwi-asset-chart-box { position:relative; height:330px; padding:8px 10px 12px; }
    .mwi-asset-chart-fallback { display:grid; height:100%; place-items:center; color:var(--color-text-secondary,#aaa); font-size:.75rem; text-align:center; }
    .mwi-asset-manager { padding:9px 11px 12px; }
    .mwi-asset-manager summary { cursor:pointer; font-size:.8rem; font-weight:700; }
    .mwi-asset-manager-actions { display:flex; flex-wrap:wrap; gap:6px; margin:9px 0; }
    .mwi-asset-action.is-danger { color:#ff938c; }
    .mwi-asset-history-table button { padding:3px 7px; font-size:.68rem; }
    .mwi-asset-edit-dialog { width:min(520px,calc(100vw - 24px)); border:1px solid rgba(255,255,255,.16); border-radius:8px; background:#182033; color:#eee; }
    .mwi-asset-edit-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 12px; }
    .mwi-asset-edit-grid label { display:grid; gap:3px; color:#bbb; font-size:.7rem; }
    .mwi-asset-edit-grid input { box-sizing:border-box; width:100%; border:1px solid rgba(255,255,255,.18); border-radius:4px; background:#101728; color:#eee; padding:6px; }
    .mwi-asset-edit-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
    @media(max-width:760px){
      .mwi-asset-summary { grid-template-columns:repeat(2,minmax(0,1fr)); }
      #${PANEL_ID} { padding:10px 8px 20px; }
      .mwi-asset-chart-box { height:280px; }
      .mwi-asset-edit-grid { grid-template-columns:1fr; }
    }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function buttonLabel(button) {
  return String(
    runtime.api.getOriTextFromElement?.(button) ?? button?.textContent ?? "",
  )
    .trim()
    .toLowerCase();
}

function findLoadoutTab() {
  return [...document.querySelectorAll("button")].find((button) =>
    /^(配装|loadouts?)$/i.test(buttonLabel(button)),
  );
}

function looksLikeContent(node) {
  if (!(node instanceof Element)) return false;
  const className = String(node.className ?? "");
  return Boolean(
    node.querySelector("input,canvas") ||
    /(Inventory|Equipment|Ability|Abilities|House|Loadout|Panel)_/i.test(
      className,
    ) ||
    node.querySelector(
      '[class*="Inventory_"],[class*="Equipment_"],[class*="Ability"],[class*="House_"],[class*="Loadout"]',
    ),
  );
}

function findPanelShell(tab) {
  let navigationBranch = tab.parentElement;
  for (
    let depth = 0;
    navigationBranch?.parentElement && depth < 8;
    depth += 1
  ) {
    const shell = navigationBranch.parentElement;
    const siblings = [...shell.children].filter(
      (node) => node !== navigationBranch && node.id !== PANEL_ID,
    );
    if (siblings.some(looksLikeContent)) {
      return { shell, navigationBranch };
    }
    navigationBranch = shell;
  }
  return null;
}

function createCard(label, valueId, metaId = "") {
  return `<div class="mwi-asset-card"><div class="mwi-asset-card-label">${label}</div><div class="mwi-asset-card-value" id="${valueId}">—</div>${metaId ? `<div class="mwi-asset-card-meta" id="${metaId}"></div>` : ""}</div>`;
}

function downloadBackup(backup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `MWITools-asset-history-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

class AssetHistoryPanel {
  constructor(host, store, scopeKey) {
    this.host = host;
    this.store = store;
    this.scopeKey = scopeKey;
    this.snapshot = null;
    this.mode = "total";
    this.range = 30;
    this.build();
  }

  build() {
    this.host.innerHTML = `
      <p class="mwi-asset-disclaimer">${t("盈亏按资产估值变化计算，包含市场价格波动，并非已实现交易利润。", "P/L is based on asset valuation changes, including market price movement; it is not realized trading profit.")}</p>
      <div class="mwi-asset-summary">
        ${createCard(t("当前总资产", "Current total assets"), "mwi-asset-current-total")}
        ${createCard(t("总盈亏", "Total P/L"), "mwi-asset-total-change", "mwi-asset-compare-date")}
        ${createCard(t("盈亏比例", "P/L percentage"), "mwi-asset-total-percent")}
        ${createCard(t("近 7 日平均", "7-day average"), "mwi-asset-seven-average")}
      </div>
      <section class="mwi-asset-section">
        <div class="mwi-asset-section-title">${t("分项资产变化", "Asset changes by component")}</div>
        <div class="mwi-asset-table-wrap"><table class="mwi-asset-table"><thead><tr><th>${t("项目", "Component")}</th><th>${t("当前", "Current")}</th><th id="mwi-asset-change-heading">${t("变化", "Change")}</th><th>${t("比例", "Percentage")}</th></tr></thead><tbody id="mwi-asset-breakdown"></tbody></table></div>
      </section>
      <section class="mwi-asset-section">
        <div class="mwi-asset-chart-controls">
          <button type="button" data-mode="total">${t("总资产", "Total assets")}</button>
          <button type="button" data-mode="profit">${t("每日盈亏", "Daily P/L")}</button>
          <button type="button" data-mode="breakdown">${t("分项变化", "Components")}</button>
          <span style="flex:1"></span>
          <button type="button" data-range="7">7${t("天", "d")}</button>
          <button type="button" data-range="15">15${t("天", "d")}</button>
          <button type="button" data-range="30">30${t("天", "d")}</button>
          <button type="button" data-range="all">${t("全部", "All")}</button>
          <button type="button" id="mwi-asset-reset-zoom">${t("重置缩放", "Reset zoom")}</button>
        </div>
        <div class="mwi-asset-chart-box"><canvas id="mwi-asset-chart"></canvas><div class="mwi-asset-chart-fallback" hidden></div></div>
      </section>
      <section class="mwi-asset-section"><details class="mwi-asset-manager"><summary>${t("数据管理与备份", "Data management & backup")}</summary>
        <div class="mwi-asset-manager-actions">
          <button type="button" class="mwi-asset-action" id="mwi-asset-export">${t("导出备份", "Export backup")}</button>
          <button type="button" class="mwi-asset-action" id="mwi-asset-import">${t("导入备份", "Import backup")}</button>
          <button type="button" class="mwi-asset-action is-danger" id="mwi-asset-cleanup">${t("清理无效记录", "Clean invalid records")}</button>
          <button type="button" class="mwi-asset-action is-danger" id="mwi-asset-anomalies">${t("检测并删除异常", "Detect & delete anomalies")}</button>
          <input type="file" id="mwi-asset-import-file" accept="application/json" hidden>
        </div>
        <div class="mwi-asset-table-wrap"><table class="mwi-asset-table mwi-asset-history-table"><thead><tr><th>${t("日期", "Date")}</th><th>${t("总资产", "Total")}</th><th>${t("操作", "Actions")}</th></tr></thead><tbody id="mwi-asset-history-rows"></tbody></table></div>
      </details></section>
      <dialog class="mwi-asset-edit-dialog" id="mwi-asset-edit-dialog"><h3>${t("编辑分项资产", "Edit asset components")}</h3><div class="mwi-asset-edit-grid">${ASSET_COMPONENT_KEYS.map(
        (key) => {
          const row = ROWS.find(([candidate]) => candidate === key);
          return `<label>${t(row[1], row[2])}<input type="number" min="0" step="any" data-component="${key}"></label>`;
        },
      ).join(
        "",
      )}</div><div class="mwi-asset-edit-actions"><button type="button" class="mwi-asset-action" data-edit-cancel>${t("取消", "Cancel")}</button><button type="button" class="mwi-asset-action" data-edit-save>${t("保存", "Save")}</button></div></dialog>
    `;
    this.chart = new AssetHistoryChart(
      this.host.querySelector("#mwi-asset-chart"),
      this.host.querySelector(".mwi-asset-chart-fallback"),
    );
    this.bind();
  }

  bind() {
    this.host.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        this.mode = button.dataset.mode;
        this.renderChart();
      });
    });
    this.host.querySelectorAll("[data-range]").forEach((button) => {
      button.addEventListener("click", () => {
        this.range =
          button.dataset.range === "all" ? null : Number(button.dataset.range);
        this.renderChart();
      });
    });
    this.host
      .querySelector("#mwi-asset-reset-zoom")
      .addEventListener("click", () => this.chart.resetZoom());
    this.host
      .querySelector("#mwi-asset-export")
      .addEventListener("click", () =>
        downloadBackup(this.store.exportBackup()),
      );
    const fileInput = this.host.querySelector("#mwi-asset-import-file");
    this.host
      .querySelector("#mwi-asset-import")
      .addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const backup = JSON.parse(await file.text());
        const replace = globalThis.confirm?.(
          t(
            "确定：替换当前角色历史；取消：合并导入。",
            "OK: replace this character's history; Cancel: merge it.",
          ),
        );
        this.store.importBackup(backup, {
          mode: replace ? "replace" : "merge",
          scopeKey: this.scopeKey,
        });
        this.update(this.snapshot);
      } catch (error) {
        globalThis.alert?.(
          `${t("导入失败", "Import failed")}: ${error.message}`,
        );
      } finally {
        fileInput.value = "";
      }
    });
    this.host
      .querySelector("#mwi-asset-cleanup")
      .addEventListener("click", () => {
        const removed = this.store.cleanupInvalid(this.scopeKey);
        globalThis.alert?.(
          t(
            `已删除 ${removed} 条无效记录。`,
            `Removed ${removed} invalid records.`,
          ),
        );
        this.update(this.snapshot);
      });
    this.host
      .querySelector("#mwi-asset-anomalies")
      .addEventListener("click", () => {
        const anomalies = this.store.detectAnomalies(this.scopeKey);
        if (!anomalies.length) {
          globalThis.alert?.(
            t("未发现明显异常。", "No clear anomalies found."),
          );
          return;
        }
        const preview = anomalies
          .map(({ date, zScore }) => `${date} (Z=${zScore.toFixed(1)})`)
          .join("\n");
        if (
          !globalThis.confirm?.(
            t(
              `确认删除以下异常日期？\n${preview}`,
              `Delete these anomalous dates?\n${preview}`,
            ),
          )
        ) {
          return;
        }
        anomalies.forEach(({ date }) =>
          this.store.deleteDay(date, this.scopeKey),
        );
        this.update(this.snapshot);
      });
    this.host
      .querySelector("[data-edit-cancel]")
      .addEventListener("click", () => this.closeEditor());
    this.host
      .querySelector("[data-edit-save]")
      .addEventListener("click", () => this.saveEditor());
  }

  openEditor(dayKey) {
    const record = this.store.getRole(this.scopeKey).days[dayKey];
    const dialog = this.host.querySelector("#mwi-asset-edit-dialog");
    dialog.dataset.dayKey = dayKey;
    for (const input of dialog.querySelectorAll("[data-component]")) {
      const value = record?.values?.[input.dataset.component];
      input.value = Number.isFinite(value) ? value : "";
    }
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  closeEditor() {
    const dialog = this.host.querySelector("#mwi-asset-edit-dialog");
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  saveEditor() {
    const dialog = this.host.querySelector("#mwi-asset-edit-dialog");
    const values = Object.fromEntries(
      [...dialog.querySelectorAll("[data-component]")].map((input) => [
        input.dataset.component,
        Number(input.value),
      ]),
    );
    if (
      !ASSET_COMPONENT_KEYS.every(
        (key) => Number.isFinite(values[key]) && values[key] >= 0,
      )
    ) {
      globalThis.alert?.(
        t(
          "请为全部七个分项填写不小于零的数字。",
          "Enter a non-negative number for all seven components.",
        ),
      );
      return;
    }
    this.store.updateDay(dialog.dataset.dayKey, values, this.scopeKey);
    this.closeEditor();
    this.update(this.snapshot);
  }

  update(snapshot) {
    this.snapshot = snapshot ?? this.snapshot;
    const dayKey = getUtc8DayKey();
    const todayRecord = this.store.getRole(this.scopeKey).days[dayKey];
    const current = this.snapshot?.values ?? todayRecord?.values ?? {};
    const comparison = this.store.comparison(dayKey, this.scopeKey);
    const previous = comparison?.record?.values ?? {};
    const totalChange =
      Number.isFinite(current.total) && Number.isFinite(previous.total)
        ? current.total - previous.total
        : null;
    const compareText = comparison
      ? comparison.gapDays === 1
        ? t(`较昨日（${comparison.date}）`, `vs yesterday (${comparison.date})`)
        : t(
            `较 ${comparison.gapDays} 天前（${comparison.date}）`,
            `vs ${comparison.gapDays} days ago (${comparison.date})`,
          )
      : t("暂无历史对比", "No prior record");
    const setText = (selector, value, className = "") => {
      const node = this.host.querySelector(selector);
      node.textContent = value;
      node.className = `mwi-asset-card-value ${className}`.trim();
    };
    setText("#mwi-asset-current-total", formatNumber(current.total));
    setText(
      "#mwi-asset-total-change",
      formatNumber(totalChange, true),
      valueClass(totalChange),
    );
    this.host.querySelector("#mwi-asset-compare-date").textContent =
      compareText;
    setText(
      "#mwi-asset-total-percent",
      formatPercent(current.total, previous.total),
      valueClass(totalChange),
    );
    const average = this.store.sevenDayAverage(dayKey, this.scopeKey);
    setText(
      "#mwi-asset-seven-average",
      formatNumber(average, true),
      valueClass(average),
    );
    this.host.querySelector("#mwi-asset-change-heading").textContent =
      comparison
        ? t(`变化（较 ${comparison.date}）`, `Change (vs ${comparison.date})`)
        : t("变化", "Change");

    const body = this.host.querySelector("#mwi-asset-breakdown");
    body.replaceChildren(
      ...ROWS.map(([key, zh, en]) => {
        const row = document.createElement("tr");
        row.dataset.key = key;
        const currentValue = current[key];
        const previousValue = previous[key];
        const change =
          Number.isFinite(currentValue) && Number.isFinite(previousValue)
            ? currentValue - previousValue
            : null;
        row.innerHTML = `<td>${t(zh, en)}</td><td title="${Number.isFinite(currentValue) ? runtime.api.formatExactNumber(currentValue) : ""}">${formatNumber(currentValue)}</td><td class="${valueClass(change)}">${formatNumber(change, true)}</td><td class="${valueClass(change)}">${formatPercent(currentValue, previousValue)}</td>`;
        return row;
      }),
    );
    this.renderHistoryRows();
    this.renderChart();
  }

  renderHistoryRows() {
    const body = this.host.querySelector("#mwi-asset-history-rows");
    const entries = this.store.list(this.scopeKey).slice().reverse();
    body.replaceChildren(
      ...entries.map(([dayKey, record]) => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${dayKey}</td><td>${formatNumber(record?.values?.total)}</td><td><button type="button" class="mwi-asset-action" data-edit>${t("编辑", "Edit")}</button> <button type="button" class="mwi-asset-action is-danger" data-delete>${t("删除", "Delete")}</button></td>`;
        row
          .querySelector("[data-edit]")
          .addEventListener("click", () => this.openEditor(dayKey));
        row.querySelector("[data-delete]").addEventListener("click", () => {
          if (
            globalThis.confirm?.(t(`确认删除 ${dayKey}？`, `Delete ${dayKey}?`))
          ) {
            this.store.deleteDay(dayKey, this.scopeKey);
            this.update(this.snapshot);
          }
        });
        return row;
      }),
    );
  }

  renderChart() {
    this.host.querySelectorAll("[data-mode]").forEach((button) => {
      button.dataset.active = String(button.dataset.mode === this.mode);
    });
    this.host.querySelectorAll("[data-range]").forEach((button) => {
      const range =
        button.dataset.range === "all" ? null : Number(button.dataset.range);
      button.dataset.active = String(range === this.range);
    });
    this.chart.render(this.store.list(this.scopeKey), {
      mode: this.mode,
      range: this.range,
    });
  }

  destroy() {
    this.chart.destroy();
  }
}

export function createAssetHistoryUi({ scope, store, scopeKey }) {
  let active = false;
  let tab = null;
  let host = null;
  let panel = null;
  let shell = null;
  let navigationBranch = null;
  const hiddenNodes = new Map();

  const restoreNative = () => {
    for (const [node, state] of hiddenNodes) {
      node.hidden = state.hidden;
      if (state.styleDisplay === null) node.style.removeProperty("display");
      else node.style.display = state.styleDisplay;
    }
    hiddenNodes.clear();
  };

  const setActive = (next) => {
    active = Boolean(next);
    if (tab) {
      tab.dataset.active = String(active);
      tab.setAttribute("aria-selected", String(active));
    }
    if (host) host.hidden = !active;
    if (!active) {
      restoreNative();
      return;
    }
    for (const node of [...(shell?.children ?? [])]) {
      if (
        node === navigationBranch ||
        node === host ||
        node.tagName === "STYLE"
      )
        continue;
      if (!hiddenNodes.has(node)) {
        hiddenNodes.set(node, {
          hidden: node.hidden,
          styleDisplay: node.style.display || null,
        });
      }
      node.hidden = true;
      node.style.display = "none";
    }
    panel?.update(runtime.api.getLatestAssetSnapshot?.());
  };

  const teardownMount = () => {
    setActive(false);
    panel?.destroy();
    panel = null;
    tab?.remove();
    host?.remove();
    tab = null;
    host = null;
    shell = null;
    navigationBranch = null;
  };

  const ensureMounted = () => {
    if (tab?.isConnected && host?.isConnected) {
      if (active) setActive(true);
      return;
    }
    teardownMount();
    const loadout = findLoadoutTab();
    const found = loadout && findPanelShell(loadout);
    if (!loadout || !found) return;
    ({ shell, navigationBranch } = found);
    tab = loadout.cloneNode(false);
    tab.id = TAB_ID;
    tab.type = "button";
    tab.textContent = t("盈亏", "P/L");
    tab.dataset.active = "false";
    tab.setAttribute("aria-selected", "false");
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActive(true);
    });
    loadout.insertAdjacentElement("afterend", tab);
    host = document.createElement("section");
    host.id = PANEL_ID;
    host.hidden = true;
    shell.appendChild(host);
    panel = new AssetHistoryPanel(host, store, scopeKey);
    panel.update(runtime.api.getLatestAssetSnapshot?.());
  };

  addStyles();
  ensureMounted();
  scope.interval(ensureMounted, 500);
  scope.event(
    document,
    "click",
    (event) => {
      if (!active || event.target.closest(`#${TAB_ID}`)) return;
      const nativeButton = event.target.closest("button");
      if (nativeButton && tab?.parentElement?.contains(nativeButton)) {
        setActive(false);
      }
    },
    true,
  );

  return {
    update(snapshot) {
      panel?.update(snapshot);
    },
    destroy() {
      teardownMount();
      document.getElementById(STYLE_ID)?.remove();
    },
  };
}
