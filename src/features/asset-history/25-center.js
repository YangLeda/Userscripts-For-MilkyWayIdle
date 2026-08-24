/*!
 * Asset-center interface adapted from Everyday Profit Pro (MIT License).
 * Copyright (c) 2025 VictoryWinWinWin, PaperCat, SuXingX
 * Copyright (c) 2026 ColaCola
 * Permission is hereby granted, free of charge, to use, copy, modify, merge,
 * publish, distribute, sublicense, and/or sell copies, provided that this
 * copyright and permission notice is included in substantial copies.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { runtime } from "../../core/runtime.js";
import { ASSET_COMPONENT_KEYS } from "./00-snapshot.js";
import {
  ASSET_COMPONENT_META,
  buildHeatmap,
  calculateAchievements,
  componentAnalysis,
  periodStatistics,
  simulateNetWorth,
} from "./15-analytics.js";
import { AssetHistoryChart } from "./20-chart.js";

const ROOT_ID = "mwitools-asset-center-modal";
const STYLE_ID = "mwitools-asset-center-style";
const EP_MIT_LICENSE = `MIT License

Copyright (c) 2025 VictoryWinWinWin, PaperCat, SuXingX
Copyright (c) 2026 ColaCola

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
const TAG_TYPES = [
  ["equip", "装备", "Equipment", "#00c6ff"],
  ["skill", "技能", "Skills", "#a78bfa"],
  ["alchemy", "炼金", "Alchemy", "#ff9800"],
  ["enhance", "强化", "Enhancement", "#ef5350"],
  ["combat", "战斗", "Combat", "#f472b6"],
  ["life", "生活", "Life", "#4ade80"],
];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function monthRange(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const end = new Date(year, month + 1, 0);
  return {
    start,
    end: `${year}-${String(month + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
    year,
    month,
  };
}

function weekRange(date) {
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = current.getDay() || 7;
  current.setDate(current.getDate() - day + 1);
  const end = new Date(current);
  end.setDate(end.getDate() + 6);
  return {
    start: current.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    year: date.getFullYear(),
    month: date.getMonth(),
  };
}

function shiftDayKey(dayKey, amount) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID}{--ep-bg:222 18% 10%;--ep-panel:222 17% 13%;--ep-card:222 16% 16%;--ep-card2:222 15% 19%;--ep-fg:210 20% 96%;--ep-muted:215 12% 66%;--ep-border:215 14% 25%;--ep-accent:191 100% 50%;position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(3,7,18,.72);font:13px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:hsl(var(--ep-fg))}
    #${ROOT_ID}[hidden]{display:none!important}#${ROOT_ID}.ep-light{--ep-bg:var(--ep-light-h,38) var(--ep-light-s,44%) 94%;--ep-panel:var(--ep-light-h,38) 35% 97%;--ep-card:0 0% 100%;--ep-card2:var(--ep-light-h,38) 25% 95%;--ep-fg:220 18% 18%;--ep-muted:220 9% 43%;--ep-border:220 12% 82%;background:rgba(15,23,42,.55)}#${ROOT_ID}.ep-glass-heart .neg{color:#f59e9e!important}
    #${ROOT_ID} *{box-sizing:border-box}#${ROOT_ID} button,#${ROOT_ID} input,#${ROOT_ID} select{font:inherit}#${ROOT_ID} button{color:inherit}
    #${ROOT_ID} .ep-shell{position:relative;display:grid;grid-template-columns:220px minmax(0,1fr);width:min(1180px,94vw);height:min(820px,92vh);min-width:720px;min-height:520px;overflow:hidden;border:1px solid hsl(var(--ep-border));border-radius:14px;background:hsl(var(--ep-bg));box-shadow:0 30px 90px rgba(0,0,0,.55);resize:both}
    #${ROOT_ID} .ep-sidebar{display:flex;min-width:0;flex-direction:column;border-right:1px solid hsl(var(--ep-border));background:linear-gradient(180deg,hsl(var(--ep-panel)),hsl(var(--ep-bg)));padding:16px 12px}
    #${ROOT_ID} .ep-brand{padding:3px 8px 17px;border-bottom:1px solid hsl(var(--ep-border));margin-bottom:14px}#${ROOT_ID} .ep-brand strong{display:block;font-size:17px;letter-spacing:.2px}#${ROOT_ID} .ep-brand small{color:hsl(var(--ep-muted))}
    #${ROOT_ID} .ep-nav-label{margin:11px 8px 5px;color:hsl(var(--ep-muted));font-size:9px;font-weight:800;letter-spacing:1.5px}#${ROOT_ID} .ep-nav-item{display:flex;width:100%;align-items:center;gap:9px;padding:8px 10px;border:0;border-radius:7px;background:transparent;text-align:left;cursor:pointer}#${ROOT_ID} .ep-nav-item:hover{background:hsl(var(--ep-card))}#${ROOT_ID} .ep-nav-item.active{background:linear-gradient(90deg,hsl(var(--ep-accent)/.2),transparent);color:hsl(var(--ep-accent));box-shadow:inset 2px 0 hsl(var(--ep-accent))}#${ROOT_ID} .ep-nav-icon{width:18px;text-align:center}
    #${ROOT_ID} .ep-nav-footer{margin-top:auto;padding-top:12px;border-top:1px solid hsl(var(--ep-border))}#${ROOT_ID} .ep-main{display:flex;min-width:0;min-height:0;flex-direction:column}#${ROOT_ID} .ep-top{display:flex;min-height:66px;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid hsl(var(--ep-border));background:hsl(var(--ep-panel)/.85)}#${ROOT_ID} .ep-top-main{min-width:0;flex:1}#${ROOT_ID} .ep-top-title{font-size:18px;font-weight:800}#${ROOT_ID} .ep-top-sub{overflow:hidden;color:hsl(var(--ep-muted));font-size:11px;text-overflow:ellipsis;white-space:nowrap}#${ROOT_ID} .ep-close{width:34px;height:34px;border:1px solid hsl(var(--ep-border));border-radius:8px;background:hsl(var(--ep-card));cursor:pointer}
    #${ROOT_ID} .ep-page{min-height:0;flex:1;overflow:auto;padding:18px 20px 32px;scrollbar-gutter:stable}#${ROOT_ID} .ep-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}#${ROOT_ID} .ep-card{min-width:0;border:1px solid hsl(var(--ep-border));border-radius:10px;background:hsl(var(--ep-card));box-shadow:0 8px 22px rgba(0,0,0,.12)}#${ROOT_ID} .ep-metric{padding:13px 14px}#${ROOT_ID} .ep-metric span{display:block;color:hsl(var(--ep-muted));font-size:10px}#${ROOT_ID} .ep-metric strong{display:block;margin-top:4px;overflow:hidden;font:700 17px/1.25 ui-monospace,SFMono-Regular,Consolas,monospace;text-overflow:ellipsis;white-space:nowrap}#${ROOT_ID} .pos{color:#4ade80!important}#${ROOT_ID} .neg{color:#fb7185!important}
    #${ROOT_ID} .ep-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:10px}#${ROOT_ID} .ep-btn{padding:6px 10px;border:1px solid hsl(var(--ep-border));border-radius:6px;background:hsl(var(--ep-card2));cursor:pointer}#${ROOT_ID} .ep-btn:hover,#${ROOT_ID} .ep-btn.active{border-color:hsl(var(--ep-accent)/.65);background:hsl(var(--ep-accent)/.15)}#${ROOT_ID} .ep-btn.danger{color:#fb7185}#${ROOT_ID} .ep-spacer{flex:1}
    #${ROOT_ID} .ep-chart{height:360px;padding:4px 12px 12px}#${ROOT_ID} .ep-section{margin-top:12px}#${ROOT_ID} .ep-section-title{display:flex;align-items:center;gap:8px;padding:11px 13px;border-bottom:1px solid hsl(var(--ep-border));font-weight:800}#${ROOT_ID} .ep-section-body{padding:13px}
    #${ROOT_ID} table{width:100%;border-collapse:collapse}#${ROOT_ID} th,#${ROOT_ID} td{padding:8px 9px;border-bottom:1px solid hsl(var(--ep-border));text-align:left}#${ROOT_ID} th{color:hsl(var(--ep-muted));font-size:10px;text-transform:uppercase}#${ROOT_ID} td.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
    #${ROOT_ID} .ep-analysis-list{display:grid;gap:8px}#${ROOT_ID} .ep-analysis-row{display:grid;grid-template-columns:110px 1fr 120px 90px;align-items:center;gap:10px}#${ROOT_ID} .ep-bar{height:9px;overflow:hidden;border-radius:99px;background:hsl(var(--ep-border))}#${ROOT_ID} .ep-bar i{display:block;height:100%;border-radius:inherit}
    #${ROOT_ID} .ep-heatmap{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}#${ROOT_ID} .ep-day{position:relative;min-height:58px;padding:5px;border:1px solid hsl(var(--ep-border));border-radius:6px;background:hsl(var(--ep-card2));font-size:10px}#${ROOT_ID} .ep-day.in-period{outline:1px solid hsl(var(--ep-accent)/.55);outline-offset:-2px}#${ROOT_ID} .ep-day.empty{visibility:hidden}#${ROOT_ID} .ep-day strong{display:block;margin-top:9px;font:700 10px ui-monospace,monospace}
    #${ROOT_ID} .ep-tags,#${ROOT_ID} .ep-achievements{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}#${ROOT_ID} .ep-tag-row,#${ROOT_ID} .ep-achievement{display:flex;min-width:0;align-items:center;gap:10px;padding:10px;border:1px solid hsl(var(--ep-border));border-radius:8px;background:hsl(var(--ep-card))}#${ROOT_ID} .ep-achievement.locked{filter:grayscale(1);opacity:.45}#${ROOT_ID} .ep-achievement-icon{font-size:23px}#${ROOT_ID} .ep-grow{min-width:0;flex:1}#${ROOT_ID} .ep-grow small{display:block;color:hsl(var(--ep-muted))}
    #${ROOT_ID} .ep-form{display:flex;align-items:end;flex-wrap:wrap;gap:8px}#${ROOT_ID} label{display:grid;gap:4px;color:hsl(var(--ep-muted));font-size:10px}#${ROOT_ID} input,#${ROOT_ID} select{min-height:33px;border:1px solid hsl(var(--ep-border));border-radius:6px;background:hsl(var(--ep-card2));padding:5px 8px;color:hsl(var(--ep-fg))}#${ROOT_ID} .ep-setting{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid hsl(var(--ep-border))}#${ROOT_ID} .ep-setting>div{flex:1}#${ROOT_ID} .ep-setting small{display:block;color:hsl(var(--ep-muted))}
    #${ROOT_ID} .ep-sim-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}#${ROOT_ID} .ep-prob{padding:10px;border-radius:8px;background:hsl(var(--ep-card2));text-align:center}#${ROOT_ID} .ep-sim-band{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px}#${ROOT_ID} .ep-sim-band div{padding:7px;border:1px solid hsl(var(--ep-border));border-radius:6px;text-align:center}#${ROOT_ID} .ep-sim-band small{display:block;color:hsl(var(--ep-muted))}#${ROOT_ID} .ep-disclaimer{margin-top:10px;color:hsl(var(--ep-muted));font-size:10px}
    #${ROOT_ID} dialog{width:min(620px,90vw);border:1px solid hsl(var(--ep-border));border-radius:10px;background:hsl(var(--ep-panel));color:hsl(var(--ep-fg))}#${ROOT_ID} dialog::backdrop{background:rgba(0,0,0,.55)}#${ROOT_ID} .ep-edit-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
    @media(max-width:820px){#${ROOT_ID}{align-items:stretch}#${ROOT_ID} .ep-shell{grid-template-columns:64px 1fr!important;width:100vw!important;height:100dvh!important;min-width:0;min-height:0;border:0;border-radius:0;resize:none}#${ROOT_ID} .ep-sidebar{padding:10px 6px}#${ROOT_ID} .ep-brand strong,#${ROOT_ID} .ep-brand small,#${ROOT_ID} .ep-nav-label,#${ROOT_ID} .ep-nav-text{display:none}#${ROOT_ID} .ep-nav-item{justify-content:center;padding:10px 4px}#${ROOT_ID} .ep-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#${ROOT_ID} .ep-page{padding:12px}#${ROOT_ID} .ep-analysis-row{grid-template-columns:80px 1fr 90px}#${ROOT_ID} .ep-analysis-row>:last-child{display:none}#${ROOT_ID} .ep-tags,#${ROOT_ID} .ep-achievements{grid-template-columns:1fr}#${ROOT_ID} .ep-sim-band{grid-template-columns:repeat(2,1fr)}}
  `;
  document.head.append(style);
}

export class AssetCenter {
  constructor({ store, scopeKey, onChange = null, onVisibilityChange = null }) {
    this.store = store;
    this.scopeKey = scopeKey;
    this.onChange = onChange;
    this.onVisibilityChange = onVisibilityChange;
    this.route = "chart";
    this.chartMode = this.store.getPreferences().chart.defaultView;
    if (this.chartMode === "statsReport") this.chartMode = "networth";
    this.chartRange = this.store.getPreferences().chart.defaultRange;
    this.analysisRange = 30;
    this.reportMode = "month";
    this.reportDate = new Date();
    this.chart = null;
    this.hiddenChartDatasets = new Set();
    this.previousFocus = null;
    this.snapshot = null;
    addStyles();
    this.build();
  }

  isZH() {
    const language = this.store.getPreferences().language;
    return language ? language === "zh" : runtime.config.isZH;
  }

  t(zh, en) {
    return this.isZH() ? zh : en;
  }

  format(value, signed = false) {
    if (!Number.isFinite(value)) return "—";
    const text =
      runtime.api.numberFormatter?.(Math.abs(value)) ?? String(value);
    return signed && value !== 0 ? `${value > 0 ? "+" : "−"}${text}` : text;
  }

  tagColor(type) {
    const fallback = TAG_TYPES.find(([key]) => key === type)?.[3] ?? "#888888";
    return this.store.getPreferences().tagColors?.[type] ?? fallback;
  }

  build() {
    if (this.keydown) document.removeEventListener("keydown", this.keydown);
    this.resizeObserver?.disconnect();
    document.getElementById(ROOT_ID)?.remove();
    this.root = document.createElement("div");
    this.root.id = ROOT_ID;
    this.root.hidden = true;
    this.root.innerHTML = `<div class="ep-shell" role="dialog" aria-modal="true" aria-label="MWITools Asset Center">
      <aside class="ep-sidebar"><div class="ep-brand"><strong>MWITools</strong><small>${this.t("资产中心", "Asset Center")}</small></div>
        <div class="ep-nav-label">${this.t("分析", "ANALYSIS")}</div>
        ${this.nav("chart", "▥", this.t("图表总览", "Chart Overview"))}
        ${this.nav("analysis", "◔", this.t("分项分析", "Analysis"))}
        ${this.nav("stats", "▦", this.t("统计报表", "Statistics"))}
        <div class="ep-nav-label">${this.t("记录", "RECORD")}</div>
        ${this.nav("achievements", "♕", this.t("成就", "Achievements"))}
        <div class="ep-nav-label">${this.t("管理", "MANAGE")}</div>
        ${this.nav("data", "◫", this.t("数据管理", "Data"))}
        ${this.nav("tags", "◇", this.t("管理标签", "Tags"))}
        <div class="ep-nav-footer">${this.nav("settings", "⚙", this.t("设置/存档", "Settings"))}<button class="ep-nav-item" data-language><span class="ep-nav-icon">文</span><span class="ep-nav-text">${this.isZH() ? "EN" : "中文"}</span></button></div>
      </aside><main class="ep-main"><header class="ep-top"><div class="ep-top-main"><div class="ep-top-title"></div><div class="ep-top-sub"></div></div><button class="ep-close" data-close aria-label="${this.t("关闭", "Close")}">✕</button></header><div class="ep-page"></div></main>
      <input type="file" data-import-file accept="application/json" hidden>
      <dialog data-edit-dialog><h3 data-editor-title>${this.t("编辑分项资产", "Edit components")}</h3><label data-insert-date-wrap hidden>${this.t("插入日期", "Insert date")}<input type="date" data-insert-date></label><div class="ep-edit-grid ep-section">${ASSET_COMPONENT_KEYS.map((key) => `<label>${this.t(ASSET_COMPONENT_META[key].zh, ASSET_COMPONENT_META[key].en)}<input type="number" min="0" step="any" data-edit-component="${key}"></label>`).join("")}</div><div class="ep-toolbar"><span class="ep-spacer"></span><button class="ep-btn" data-edit-cancel>${this.t("取消", "Cancel")}</button><button class="ep-btn" data-edit-save>${this.t("保存", "Save")}</button></div></dialog>
    </div>`;
    document.body.append(this.root);
    const windowSize = this.store.getPreferences().windowSize;
    const shell = this.root.querySelector(".ep-shell");
    if (windowSize?.w && windowSize?.h) {
      shell.style.width = `${windowSize.w}px`;
      shell.style.height = `${windowSize.h}px`;
    }
    if (typeof globalThis.ResizeObserver === "function") {
      this.resizeObserver = new globalThis.ResizeObserver(() => {
        if (this.root.hidden || globalThis.innerWidth <= 820) return;
        const rect = shell.getBoundingClientRect();
        this.pendingWindowSize = {
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        };
      });
      this.resizeObserver.observe(shell);
    }
    this.bind();
    this.applyTheme();
  }

  nav(route, icon, label) {
    return `<button class="ep-nav-item" data-route="${route}"><span class="ep-nav-icon">${icon}</span><span class="ep-nav-text">${label}</span></button>`;
  }

  bind() {
    this.root.addEventListener("click", (event) => {
      if (event.target === this.root) this.close();
      const route = event.target.closest("[data-route]")?.dataset.route;
      if (route) {
        this.route = route;
        this.render();
      }
      if (event.target.closest("[data-close]")) this.close();
      if (event.target.closest("[data-language]")) {
        const previousFocus = this.previousFocus;
        this.store.setPreferences({ language: this.isZH() ? "en" : "zh" });
        this.build();
        this.previousFocus = previousFocus;
        this.open(true);
      }
    });
    this.keydown = (event) => {
      if (event.key === "Escape" && !this.root.hidden) this.close();
    };
    document.addEventListener("keydown", this.keydown);
    this.root
      .querySelector("[data-edit-cancel]")
      .addEventListener("click", () =>
        this.root.querySelector("[data-edit-dialog]").close(),
      );
    this.root
      .querySelector("[data-edit-save]")
      .addEventListener("click", () => this.saveEditor());
  }

  open(preserveFocus = false) {
    if (!preserveFocus) this.previousFocus = document.activeElement;
    this.root.hidden = false;
    document.body.dataset.mwitoolsAssetCenterOpen = "true";
    document.body.style.overflow = "hidden";
    this.onVisibilityChange?.(true);
    this.root.querySelector("[data-close]").focus();
    this.render();
  }

  close() {
    const wasOpen = !this.root.hidden;
    this.root.hidden = true;
    delete document.body.dataset.mwitoolsAssetCenterOpen;
    document.body.style.overflow = "";
    this.chart?.destroy();
    this.chart = null;
    this.hiddenChartDatasets.clear();
    if (this.pendingWindowSize) {
      this.store.setPreferences({ windowSize: this.pendingWindowSize });
      this.pendingWindowSize = null;
    }
    this.previousFocus?.focus?.();
    if (wasOpen) this.onVisibilityChange?.(false);
  }

  isOpen() {
    return !this.root.hidden;
  }

  update(snapshot) {
    this.snapshot = snapshot ?? this.snapshot;
    if (!this.root.hidden && this.route === "chart") this.updateChartSummary();
  }

  applyTheme() {
    const prefs = this.store.getPreferences();
    this.root.classList.toggle("ep-light", prefs.themeMode === "light");
    this.root.classList.toggle("ep-glass-heart", prefs.glassHeartMode);
    this.root.style.setProperty("--ep-light-h", String(prefs.lightBg.h));
    this.root.style.setProperty("--ep-light-s", `${prefs.lightBg.s}%`);
  }

  routeCopy() {
    return {
      chart: [
        this.t("图表总览", "Chart Overview"),
        this.t("净资产历史 · 盈亏分析 · 目标预测", "Net worth · P/L · goals"),
      ],
      analysis: [
        this.t("分项分析", "Component Analysis"),
        this.t("占比 · 贡献 · 排名", "Allocation · contribution · ranking"),
      ],
      stats: [
        this.t("统计报表", "Statistics"),
        this.t("周期统计 · 盈亏日历", "Period metrics · P/L calendar"),
      ],
      achievements: [
        this.t("成就 & 里程碑", "Achievements"),
        this.t("历史进度与特殊记录", "Historical milestones"),
      ],
      data: [
        this.t("数据管理", "Data Management"),
        this.t("编辑 · 清理 · 备份", "Edit · cleanup · backup"),
      ],
      tags: [
        this.t("管理标签", "Tags"),
        this.t("为重要日期添加事件", "Annotate important dates"),
      ],
      settings: [
        this.t("设置/存档", "Settings"),
        this.t("外观 · 图表 · 关于", "Appearance · charts · about"),
      ],
    }[this.route];
  }

  render() {
    if (!this.root?.isConnected) return;
    this.chart?.destroy();
    this.chart = null;
    this.root
      .querySelectorAll("[data-route]")
      .forEach((button) =>
        button.classList.toggle("active", button.dataset.route === this.route),
      );
    const [title, subtitle] = this.routeCopy();
    this.root.querySelector(".ep-top-title").textContent = title;
    this.root.querySelector(".ep-top-sub").textContent = subtitle;
    const page = this.root.querySelector(".ep-page");
    if (this.route === "chart") this.renderChartPage(page);
    else if (this.route === "analysis") this.renderAnalysisPage(page);
    else if (this.route === "stats") this.renderStatsPage(page);
    else if (this.route === "achievements") this.renderAchievementsPage(page);
    else if (this.route === "data") this.renderDataPage(page);
    else if (this.route === "tags") this.renderTagsPage(page);
    else this.renderSettingsPage(page);
  }

  summaryValues() {
    const entries = this.store.list(this.scopeKey);
    const current = this.snapshot?.values ?? entries.at(-1)?.[1]?.values ?? {};
    const previous =
      entries.length > 1 ? (entries.at(-2)?.[1]?.values ?? {}) : {};
    const change =
      Number.isFinite(current.total) && Number.isFinite(previous.total)
        ? current.total - previous.total
        : null;
    return { entries, current, previous, change };
  }

  metric(label, value, className = "", liveKey = "") {
    return `<div class="ep-card ep-metric"><span>${label}</span><strong class="${className}"${liveKey ? ` data-live-metric="${liveKey}"` : ""} title="${Number.isFinite(value) ? escapeHtml(runtime.api.formatExactNumber?.(value, 0) ?? value) : ""}">${this.format(value, className !== "")}</strong></div>`;
  }

  chartSummaryValues() {
    const { current, previous, change } = this.summaryValues();
    return [
      ["current", current.total, ""],
      ["change", change, change >= 0 ? "pos" : "neg"],
      ["percent", previous.total ? (change / previous.total) * 100 : null, ""],
      ["average", this.store.sevenDayAverage(undefined, this.scopeKey), "pos"],
    ];
  }

  updateChartSummary() {
    for (const [key, value, className] of this.chartSummaryValues()) {
      const metric = this.root.querySelector(`[data-live-metric="${key}"]`);
      if (!metric) continue;
      metric.classList.toggle("pos", className === "pos");
      metric.classList.toggle("neg", className === "neg");
      const title = Number.isFinite(value)
        ? String(runtime.api.formatExactNumber?.(value, 0) ?? value)
        : "";
      const text = this.format(value, className !== "");
      if (metric.title !== title) metric.title = title;
      if (metric.textContent !== text) metric.textContent = text;
    }
  }

  renderChartPage(page) {
    const { entries } = this.summaryValues();
    const [current, change, percent, average] = this.chartSummaryValues();
    const prefs = this.store.getPreferences();
    const target = this.store.getGoalTarget(this.scopeKey);
    page.innerHTML = `<div class="ep-grid">${this.metric(this.t("当前净资产", "Current net worth"), current[1], current[2], current[0])}${this.metric(this.t("本期盈亏", "Current P/L"), change[1], change[2], change[0])}${this.metric(this.t("盈亏比例", "P/L percentage"), percent[1], percent[2], percent[0])}${this.metric(this.t("近 7 日平均", "7-day average"), average[1], average[2], average[0])}</div>
      <section class="ep-card ep-section"><div class="ep-toolbar"><button class="ep-btn" data-chart-mode="total">${this.t("净资产", "Net worth")}</button><button class="ep-btn" data-chart-mode="profit">${this.t("盈亏", "P/L")}</button><button class="ep-btn" data-chart-mode="breakdown">${this.t("分项资产", "Components")}</button><span class="ep-spacer"></span>${[7, 15, 30].map((range) => `<button class="ep-btn" data-chart-range="${range}">${range}${this.t("天", "d")}</button>`).join("")}<button class="ep-btn" data-chart-range="all">${this.t("全部", "All")}</button><button class="ep-btn" data-reset-zoom>${this.t("重置缩放", "Reset zoom")}</button></div><div class="ep-chart"><canvas data-center-chart></canvas><div data-chart-fallback></div></div></section>
      <section class="ep-card ep-section"><div class="ep-section-title">🎯 ${this.t("目标追踪与蒙特卡洛", "Goal & Monte Carlo")}</div><div class="ep-section-body"><div class="ep-form"><label>${this.t("目标净资产", "Target net worth")}<input data-goal type="number" min="1" value="${target ?? ""}"></label><button class="ep-btn" data-save-goal>${this.t("保存目标", "Save target")}</button><button class="ep-btn" data-simulate>${this.t("运行 90 日模拟", "Run 90-day simulation")}</button></div><div data-simulation></div></div></section>
      <p class="ep-disclaimer">${this.t("盈亏按资产估值变化计算，包含市场波动，并非已实现交易利润；预测仅供参考和娱乐。", "P/L includes valuation changes and is not realized profit. Forecasts are for reference and entertainment only.")}</p>`;
    page.querySelectorAll("[data-chart-mode]").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.chartMode === this.chartMode,
      );
      button.addEventListener("click", () => {
        this.chartMode = button.dataset.chartMode;
        this.drawCenterChart();
      });
    });
    page.querySelectorAll("[data-chart-range]").forEach((button) => {
      const range =
        button.dataset.chartRange === "all"
          ? null
          : Number(button.dataset.chartRange);
      button.classList.toggle("active", range === this.chartRange);
      button.addEventListener("click", () => {
        this.chartRange = range;
        this.drawCenterChart();
      });
    });
    page
      .querySelector("[data-reset-zoom]")
      .addEventListener("click", () => this.chart?.resetZoom());
    page.querySelector("[data-save-goal]").addEventListener("click", () => {
      this.store.setGoalTarget(
        page.querySelector("[data-goal]").value,
        this.scopeKey,
      );
      this.render();
    });
    page.querySelector("[data-simulate]").addEventListener("click", () => {
      const result = simulateNetWorth(entries, {
        target: this.store.getGoalTarget(this.scopeKey),
      });
      this.renderSimulation(page.querySelector("[data-simulation]"), result);
    });
    this.chart = new AssetHistoryChart(
      page.querySelector("[data-center-chart]"),
      page.querySelector("[data-chart-fallback]"),
      { hiddenDatasets: this.hiddenChartDatasets },
    );
    this.drawCenterChart();
  }

  drawCenterChart() {
    const prefs = this.store.getPreferences();
    this.root
      .querySelectorAll("[data-chart-mode]")
      .forEach((button) =>
        button.classList.toggle(
          "active",
          button.dataset.chartMode === this.chartMode,
        ),
      );
    this.root.querySelectorAll("[data-chart-range]").forEach((button) => {
      const range =
        button.dataset.chartRange === "all"
          ? null
          : Number(button.dataset.chartRange);
      button.classList.toggle("active", range === this.chartRange);
    });
    this.chart?.renderWithOptions(this.store.list(this.scopeKey), {
      mode: this.chartMode,
      range: this.chartRange,
      maWindow: prefs.chart.maWindow,
      lineTension: prefs.chart.lineTension,
      tags: this.store.getRole(this.scopeKey).tagVisibility
        ? this.store
            .listTags(this.scopeKey)
            .map((tag) => ({ ...tag, color: this.tagColor(tag.type) }))
        : [],
    });
  }

  renderSimulation(host, result) {
    if (result.status !== "complete") {
      host.innerHTML = `<p>${this.t("数据不足，至少需要 7 条有效记录。", "At least 7 valid records are required.")}</p>`;
      return;
    }
    const finalBands = ["p10", "p25", "p50", "p75", "p90"];
    host.innerHTML = `<div class="ep-sim-grid ep-section">${this.metric(this.t("日均增长率 %", "Daily growth %"), result.dailyGrowthPercent, result.dailyGrowthPercent >= 0 ? "pos" : "neg")}${this.metric(this.t("日波动率 %", "Daily volatility %"), result.dailyVolatilityPercent)}${this.metric(this.t("翻倍天数", "Doubling days"), result.doublingDays)}${this.metric(this.t("90 日中位数", "90d median"), result.series.p50.at(-1))}</div><div class="ep-sim-band">${finalBands.map((band) => `<div><small>${band.toUpperCase()}</small><strong>${this.format(result.series[band].at(-1))}</strong></div>`).join("")}</div>${
      result.target
        ? `<div class="ep-toolbar">${Object.entries(result.probabilities)
            .map(
              ([day, probability]) =>
                `<div class="ep-prob"><strong>${probability.toFixed(1)}%</strong><small>${day}${this.t(" 天达成", "d target")}</small></div>`,
            )
            .join("")}</div>`
        : ""
    }`;
  }

  renderAnalysisPage(page) {
    const analysis = componentAnalysis(
      this.store.list(this.scopeKey),
      this.analysisRange,
    );
    page.innerHTML = `<section class="ep-card"><div class="ep-toolbar">${[7, 30].map((range) => `<button class="ep-btn ${this.analysisRange === range ? "active" : ""}" data-analysis-range="${range}">${range}${this.t("天", "d")}</button>`).join("")}<button class="ep-btn ${this.analysisRange === null ? "active" : ""}" data-analysis-range="all">${this.t("全部", "All")}</button></div><div class="ep-section-body">${analysis ? `<div class="ep-analysis-list">${analysis.components.map((item) => `<div class="ep-analysis-row"><strong>${this.t(item.zh, item.en)}</strong><div class="ep-bar"><i style="width:${Math.max(2, Math.min(100, Math.abs(item.share ?? 0)))}%;background:${item.color}"></i></div><span class="${item.change >= 0 ? "pos" : "neg"}">${this.format(item.change, true)}</span><small>${Number.isFinite(item.share) ? item.share.toFixed(1) + "%" : "—"}</small></div>`).join("")}</div><div class="ep-grid ep-section">${this.metric(this.t("总变动", "Total change"), analysis.totalChange, analysis.totalChange >= 0 ? "pos" : "neg")}${this.metric(this.t("已追踪分项", "Tracked"), analysis.trackedChange, analysis.trackedChange >= 0 ? "pos" : "neg")}${this.metric(this.t("其他/未追踪", "Other/untracked"), analysis.untrackedChange, analysis.untrackedChange >= 0 ? "pos" : "neg")}${this.metric(this.t("跨度天数", "Calendar days"), analysis.gapDays)}</div>` : `<p>${this.t("至少需要两条记录。", "At least two records are required.")}</p>`}</div></section>`;
    page.querySelectorAll("[data-analysis-range]").forEach((button) =>
      button.addEventListener("click", () => {
        this.analysisRange =
          button.dataset.analysisRange === "all"
            ? null
            : Number(button.dataset.analysisRange);
        this.render();
      }),
    );
  }

  renderStatsPage(page) {
    const range =
      this.reportMode === "week"
        ? weekRange(this.reportDate)
        : monthRange(this.reportDate);
    const entries = this.store.list(this.scopeKey);
    const stats = periodStatistics(entries, range);
    const heatmap = buildHeatmap(entries);
    const firstDay = new Date(range.year, range.month, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const count = new Date(range.year, range.month + 1, 0).getDate();
    const changes = Object.values(heatmap).filter(
      ({ date }) => date >= range.start && date <= range.end,
    );
    const max = Math.max(
      1,
      ...changes.map(({ totalChange }) => Math.abs(totalChange)),
    );
    const cells = Array.from(
      { length: offset },
      () => `<div class="ep-day empty"></div>`,
    );
    for (let day = 1; day <= count; day += 1) {
      const date = `${range.year}-${String(range.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const change = heatmap[date];
      const strength = change ? Math.abs(change.totalChange) / max : 0;
      const style = this.store.getPreferences().heatmapStyle;
      const alpha =
        style === "A"
          ? 0.28
          : style === "D"
            ? 0.18 + 0.7 * strength
            : 0.12 + 0.5 * strength;
      const positive =
        style === "C"
          ? [34, 197, 94]
          : style === "D"
            ? [14, 165, 233]
            : [16, 185, 129];
      const negative =
        style === "C"
          ? [239, 68, 68]
          : style === "D"
            ? [168, 85, 247]
            : [244, 63, 94];
      const rgb = change?.totalChange >= 0 ? positive : negative;
      const color = `rgba(${rgb.join(",")},${alpha})`;
      cells.push(
        `<div class="ep-day ${date >= range.start && date <= range.end ? "in-period" : ""}" style="${change ? `background:${color}` : ""}"><span>${day}</span><strong class="${change?.totalChange >= 0 ? "pos" : "neg"}">${change ? this.format(change.totalChange, true) : ""}</strong></div>`,
      );
    }
    const rangeLabel =
      this.reportMode === "week"
        ? `${range.start} — ${range.end}`
        : `${range.year}-${String(range.month + 1).padStart(2, "0")}`;
    page.innerHTML = `<div class="ep-toolbar"><button class="ep-btn ${this.reportMode === "week" ? "active" : ""}" data-report-mode="week">${this.t("周报", "Weekly")}</button><button class="ep-btn ${this.reportMode === "month" ? "active" : ""}" data-report-mode="month">${this.t("月报", "Monthly")}</button><span class="ep-spacer"></span><button class="ep-btn" data-period-shift="-1">‹</button><strong>${rangeLabel}</strong><button class="ep-btn" data-period-shift="1">›</button></div>${stats ? `<div class="ep-grid">${this.metric(this.t("总盈亏", "Total P/L"), stats.totalProfit, stats.totalProfit >= 0 ? "pos" : "neg")}${this.metric(this.t("日均盈亏", "Average/day"), stats.averagePerDay, stats.averagePerDay >= 0 ? "pos" : "neg")}${this.metric(this.t("胜率 %", "Win rate %"), stats.winRate)}${this.metric(this.t("增长率 %", "Growth %"), stats.growthPercent, stats.growthPercent >= 0 ? "pos" : "neg")}</div>` : ""}<section class="ep-card ep-section"><div class="ep-section-title">${this.t("盈亏日历", "P/L Calendar")}</div><div class="ep-section-body"><div class="ep-heatmap">${cells.join("")}</div></div></section>${stats ? `<section class="ep-card ep-section"><div class="ep-section-title">${this.t("每日明细", "Daily details")}</div><div class="ep-section-body"><table><thead><tr><th>${this.t("日期", "Date")}</th><th>${this.t("盈亏", "P/L")}</th><th>${this.t("跨度", "Gap")}</th></tr></thead><tbody>${stats.changes.map((item) => `<tr><td>${item.date}</td><td class="${item.totalChange >= 0 ? "pos" : "neg"}">${this.format(item.totalChange, true)}</td><td>${item.gapDays}</td></tr>`).join("")}</tbody></table></div></section>` : `<p>${this.t("所选周期暂无数据。", "No data for this period.")}</p>`}`;
    page.querySelectorAll("[data-report-mode]").forEach((button) =>
      button.addEventListener("click", () => {
        this.reportMode = button.dataset.reportMode;
        this.render();
      }),
    );
    page.querySelectorAll("[data-period-shift]").forEach((button) =>
      button.addEventListener("click", () => {
        const direction = Number(button.dataset.periodShift);
        if (this.reportMode === "week") {
          this.reportDate = new Date(this.reportDate);
          this.reportDate.setDate(this.reportDate.getDate() + direction * 7);
        } else {
          this.reportDate = new Date(
            this.reportDate.getFullYear(),
            this.reportDate.getMonth() + direction,
            1,
          );
        }
        this.render();
      }),
    );
  }

  renderAchievementsPage(page) {
    const persisted = this.store.getAchievements(this.scopeKey);
    const achievements = calculateAchievements(
      this.store.list(this.scopeKey),
      persisted,
    );
    this.store.syncAchievements(achievements, this.scopeKey);
    const unlocked = achievements.filter((item) => item.unlocked).length;
    page.innerHTML = `<div class="ep-grid">${this.metric(this.t("已解锁", "Unlocked"), unlocked)}${this.metric(this.t("全部成就", "All achievements"), achievements.length)}${this.metric(this.t("完成度 %", "Completion %"), achievements.length ? (unlocked / achievements.length) * 100 : 0)}${this.metric(this.t("历史天数", "History days"), this.store.list(this.scopeKey).length)}</div><div class="ep-achievements ep-section">${achievements.map((item) => `<article class="ep-achievement ${item.unlocked ? "" : "locked"}"><span class="ep-achievement-icon">${item.icon}</span><div class="ep-grow"><strong>${this.isZH() ? item.zhName : item.enName}</strong><small>${this.isZH() ? item.zhDescription : item.enDescription}</small>${item.date ? `<small>${item.date}</small>` : ""}</div><span>${item.unlocked ? "✓" : "🔒"}</span></article>`).join("")}</div>`;
  }

  renderDataPage(page) {
    const chronological = this.store.list(this.scopeKey);
    const entries = chronological
      .map((entry, index) => ({ entry, previous: chronological[index - 1] }))
      .reverse();
    page.innerHTML = `<section class="ep-card"><div class="ep-toolbar"><button class="ep-btn" data-export>📤 ${this.t("导出备份", "Export")}</button><button class="ep-btn" data-import>📥 ${this.t("导入备份", "Import")}</button><select data-import-mode><option value="merge">${this.t("合并当前角色", "Merge current role")}</option><option value="replace">${this.t("替换当前角色", "Replace current role")}</option><option value="full">${this.t("完整恢复", "Full restore")}</option></select><span class="ep-spacer"></span><button class="ep-btn danger" data-clean>${this.t("清理无效", "Clean invalid")}</button><button class="ep-btn danger" data-anomalies>${this.t("删除反转异常", "Remove anomalies")}</button></div><div class="ep-section-body"><table><thead><tr><th>${this.t("日期", "Date")}</th><th>${this.t("总资产", "Total")}</th><th>${this.t("操作", "Actions")}</th></tr></thead><tbody>${entries
      .map(({ entry: [date, record], previous }) => {
        const insertButton =
          previous && shiftDayKey(previous[0], 1) < date
            ? `<button class="ep-btn" data-insert-after="${previous[0]}" data-insert-before="${date}">${this.t("插入", "Insert")}</button> `
            : "";
        return `<tr><td>${date}</td><td class="mono">${this.format(record.values.total)}</td><td>${insertButton}<button class="ep-btn" data-edit-day="${date}">${this.t("编辑", "Edit")}</button> <button class="ep-btn danger" data-delete-day="${date}">${this.t("删除", "Delete")}</button></td></tr>`;
      })
      .join("")}</tbody></table></div></section>`;
    page
      .querySelector("[data-export]")
      .addEventListener("click", () => this.downloadBackup());
    page.querySelector("[data-import]").addEventListener("click", () => {
      this.pendingImportMode = page.querySelector("[data-import-mode]").value;
      this.root.querySelector("[data-import-file]").click();
    });
    this.root.querySelector("[data-import-file]").onchange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        this.store.importBackup(JSON.parse(await file.text()), {
          mode: this.pendingImportMode,
          scopeKey: this.scopeKey,
        });
        this.changed();
      } catch (error) {
        globalThis.alert?.(
          `${this.t("导入失败", "Import failed")}: ${error.message}`,
        );
      }
      event.target.value = "";
    };
    page.querySelector("[data-clean]").addEventListener("click", () => {
      this.store.cleanupInvalid(this.scopeKey);
      this.changed();
    });
    page.querySelector("[data-anomalies]").addEventListener("click", () => {
      const values = this.store.detectAnomalies(this.scopeKey);
      if (!values.length)
        return globalThis.alert?.(
          this.t("未发现反转异常。", "No reversal anomalies found."),
        );
      if (
        globalThis.confirm?.(
          `${this.t("删除以下异常日期？", "Delete these dates?")}\n${values.map((item) => item.date).join("\n")}`,
        )
      ) {
        values.forEach((item) =>
          this.store.deleteDay(item.date, this.scopeKey),
        );
        this.changed();
      }
    });
    page
      .querySelectorAll("[data-insert-after]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.openInsertEditor(
            button.dataset.insertAfter,
            button.dataset.insertBefore,
          ),
        ),
      );
    page
      .querySelectorAll("[data-edit-day]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.openEditor(button.dataset.editDay),
        ),
      );
    page.querySelectorAll("[data-delete-day]").forEach((button) =>
      button.addEventListener("click", () => {
        if (
          globalThis.confirm?.(
            `${this.t("删除", "Delete")} ${button.dataset.deleteDay}?`,
          )
        ) {
          this.store.deleteDay(button.dataset.deleteDay, this.scopeKey);
          this.changed();
        }
      }),
    );
  }

  openEditor(date) {
    const dialog = this.root.querySelector("[data-edit-dialog]");
    dialog.dataset.mode = "edit";
    dialog.dataset.date = date;
    delete dialog.dataset.olderDate;
    delete dialog.dataset.newerDate;
    dialog.querySelector("[data-editor-title]").textContent = this.t(
      "编辑分项资产",
      "Edit components",
    );
    dialog.querySelector("[data-insert-date-wrap]").hidden = true;
    const values = this.store.getRole(this.scopeKey).days[date]?.values ?? {};
    dialog.querySelectorAll("[data-edit-component]").forEach((input) => {
      input.value = Number.isFinite(values[input.dataset.editComponent])
        ? values[input.dataset.editComponent]
        : "";
    });
    dialog.showModal();
  }

  openInsertEditor(olderDate, newerDate) {
    const dialog = this.root.querySelector("[data-edit-dialog]");
    const dateInput = dialog.querySelector("[data-insert-date]");
    const minimum = shiftDayKey(olderDate, 1);
    const maximum = shiftDayKey(newerDate, -1);
    dialog.dataset.mode = "insert";
    dialog.dataset.olderDate = olderDate;
    dialog.dataset.newerDate = newerDate;
    delete dialog.dataset.date;
    dialog.querySelector("[data-editor-title]").textContent = this.t(
      "插入历史资产",
      "Insert historical assets",
    );
    dialog.querySelector("[data-insert-date-wrap]").hidden = false;
    dateInput.min = minimum;
    dateInput.max = maximum;
    dateInput.value = minimum;
    const values =
      this.store.getRole(this.scopeKey).days[olderDate]?.values ?? {};
    dialog.querySelectorAll("[data-edit-component]").forEach((input) => {
      input.value = Number.isFinite(values[input.dataset.editComponent])
        ? values[input.dataset.editComponent]
        : "";
    });
    dialog.showModal();
  }

  saveEditor() {
    const dialog = this.root.querySelector("[data-edit-dialog]");
    const values = Object.fromEntries(
      [...dialog.querySelectorAll("[data-edit-component]")].map((input) => [
        input.dataset.editComponent,
        input.value.trim() === "" ? null : Number(input.value),
      ]),
    );
    if (
      !ASSET_COMPONENT_KEYS.every(
        (key) => Number.isFinite(values[key]) && values[key] >= 0,
      )
    )
      return globalThis.alert?.(
        this.t("请填写全部七个分项。", "Enter all seven components."),
      );
    if (dialog.dataset.mode === "insert") {
      const dateInput = dialog.querySelector("[data-insert-date]");
      const dayKey = dateInput.value;
      if (!dayKey || dayKey < dateInput.min || dayKey > dateInput.max) {
        return globalThis.alert?.(
          this.t(
            "请选择两条记录之间的缺失日期。",
            "Choose a missing date between the two records.",
          ),
        );
      }
      try {
        this.store.insertDay(dayKey, values, this.scopeKey);
      } catch (error) {
        return globalThis.alert?.(
          error instanceof RangeError || error instanceof TypeError
            ? this.t(
                "无法插入：日期已存在或数据无效。",
                "Could not insert: the date already exists or the data is invalid.",
              )
            : this.t(
                "资产记录保存失败，请检查浏览器存储空间后重试。",
                "Could not save the asset record. Check browser storage and try again.",
              ),
        );
      }
    } else {
      try {
        this.store.updateDay(dialog.dataset.date, values, this.scopeKey);
      } catch {
        return globalThis.alert?.(
          this.t(
            "资产记录保存失败，请检查浏览器存储空间后重试。",
            "Could not save the asset record. Check browser storage and try again.",
          ),
        );
      }
    }
    dialog.close();
    this.changed();
  }

  renderTagsPage(page) {
    const tags = this.store.listTags(this.scopeKey).slice().reverse();
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    page.innerHTML = `<section class="ep-card"><div class="ep-section-body"><div class="ep-form"><label>${this.t("日期", "Date")}<input type="date" data-tag-date value="${today}"></label><label>${this.t("分类", "Category")}<select data-tag-type><option value="">${this.t("无分类", "None")}</option>${TAG_TYPES.map(([key, zh, en]) => `<option value="${key}">${this.t(zh, en)}</option>`).join("")}</select></label><label class="ep-grow">${this.t("标签内容", "Tag text")}<input data-tag-text maxlength="60"></label><button class="ep-btn" data-add-tag>${this.t("添加标签", "Add tag")}</button><label><input type="checkbox" data-tag-visible ${this.store.getRole(this.scopeKey).tagVisibility ? "checked" : ""}>${this.t("图表显示标签", "Show on charts")}</label></div></div></section><div class="ep-tags ep-section">${
      tags
        .map((tag) => {
          const meta = TAG_TYPES.find(([key]) => key === tag.type);
          return `<article class="ep-tag-row"><i style="width:8px;height:8px;border-radius:50%;background:${this.tagColor(tag.type)}"></i><div class="ep-grow"><strong>${escapeHtml(tag.text)}</strong><small>${tag.date} · ${meta ? this.t(meta[1], meta[2]) : this.t("无分类", "None")}</small></div><button class="ep-btn" data-edit-tag="${escapeHtml(tag.id)}">✎</button><button class="ep-btn danger" data-delete-tag="${escapeHtml(tag.id)}">×</button></article>`;
        })
        .join("") || `<p>${this.t("暂无标签。", "No tags yet.")}</p>`
    }</div>`;
    page.querySelector("[data-add-tag]").addEventListener("click", () => {
      const date = page.querySelector("[data-tag-date]").value;
      const text = page.querySelector("[data-tag-text]").value;
      const type = page.querySelector("[data-tag-type]").value;
      if (this.store.addTag(date, text, type, this.scopeKey)) this.changed();
    });
    page
      .querySelector("[data-tag-visible]")
      .addEventListener("change", (event) => {
        this.store.setTagVisibility(event.target.checked, this.scopeKey);
      });
    page.querySelectorAll("[data-edit-tag]").forEach((button) =>
      button.addEventListener("click", () => {
        const current = tags.find((tag) => tag.id === button.dataset.editTag);
        const text = globalThis.prompt?.(
          this.t("修改标签", "Edit tag"),
          current?.text,
        );
        if (
          text &&
          this.store.updateTag(button.dataset.editTag, { text }, this.scopeKey)
        )
          this.changed();
      }),
    );
    page.querySelectorAll("[data-delete-tag]").forEach((button) =>
      button.addEventListener("click", () => {
        this.store.deleteTag(button.dataset.deleteTag, this.scopeKey);
        this.changed();
      }),
    );
  }

  renderSettingsPage(page) {
    const prefs = this.store.getPreferences();
    page.innerHTML = `<section class="ep-card"><div class="ep-section-title">🎨 ${this.t("外观", "Appearance")}</div><div class="ep-section-body"><div class="ep-setting"><div><strong>${this.t("主题模式", "Theme")}</strong><small>${this.t("切换深色/浅色资产中心", "Dark or light asset center")}</small></div><select data-setting="themeMode"><option value="dark" ${prefs.themeMode === "dark" ? "selected" : ""}>${this.t("深色", "Dark")}</option><option value="light" ${prefs.themeMode === "light" ? "selected" : ""}>${this.t("浅色", "Light")}</option></select></div><div class="ep-setting"><div><strong>${this.t("玻璃心模式", "Glass-heart mode")}</strong><small>${this.t("亏损使用柔和色彩", "Use softer loss colors")}</small></div><input type="checkbox" data-setting="glassHeartMode" ${prefs.glassHeartMode ? "checked" : ""}></div><div class="ep-setting"><div><strong>${this.t("热力图样式", "Heatmap style")}</strong></div><select data-setting="heatmapStyle">${["A", "B", "C", "D"].map((value) => `<option ${prefs.heatmapStyle === value ? "selected" : ""}>${value}</option>`).join("")}</select></div><div class="ep-setting"><div><strong>${this.t("浅色主题色相", "Light-theme hue")}</strong></div><input type="range" min="0" max="359" data-light-setting="h" value="${prefs.lightBg.h}"></div><div class="ep-setting"><div><strong>${this.t("浅色主题饱和度", "Light-theme saturation")}</strong></div><input type="range" min="0" max="100" data-light-setting="s" value="${prefs.lightBg.s}"></div></div></section><section class="ep-card ep-section"><div class="ep-section-title">📊 ${this.t("图表自定义", "Chart settings")}</div><div class="ep-section-body"><div class="ep-setting"><div><strong>${this.t("默认图表", "Default chart")}</strong></div><select data-chart-setting="defaultView"><option value="networth" ${prefs.chart.defaultView === "networth" ? "selected" : ""}>${this.t("净资产", "Net worth")}</option><option value="profit" ${prefs.chart.defaultView === "profit" ? "selected" : ""}>${this.t("盈亏", "P/L")}</option><option value="breakdown" ${prefs.chart.defaultView === "breakdown" ? "selected" : ""}>${this.t("分项", "Components")}</option></select></div><div class="ep-setting"><div><strong>${this.t("盈亏均线天数", "Moving-average days")}</strong></div><input type="number" min="2" max="90" data-chart-setting="maWindow" value="${prefs.chart.maWindow}"></div><div class="ep-setting"><div><strong>${this.t("默认时间范围", "Default range")}</strong></div><select data-chart-setting="defaultRange"><option value="7" ${prefs.chart.defaultRange === 7 ? "selected" : ""}>7</option><option value="15" ${prefs.chart.defaultRange === 15 ? "selected" : ""}>15</option><option value="30" ${prefs.chart.defaultRange === 30 ? "selected" : ""}>30</option><option value="all" ${prefs.chart.defaultRange === null ? "selected" : ""}>${this.t("全部", "All")}</option></select></div><div class="ep-setting"><div><strong>${this.t("曲线平滑度", "Line tension")}</strong></div><select data-chart-setting="lineTension">${[0, 0.15, 0.25, 0.4].map((value) => `<option value="${value}" ${prefs.chart.lineTension === value ? "selected" : ""}>${value}</option>`).join("")}</select></div></div></section><section class="ep-card ep-section"><div class="ep-section-title">ℹ️ ${this.t("关于与许可", "About & License")}</div><div class="ep-section-body"><p>MWITools ${this.t("资产中心界面基于 Everyday Profit Pro 合并改造。", "Asset Center UI is adapted from Everyday Profit Pro.")}</p><p>Copyright © 2025 VictoryWinWinWin, PaperCat, SuXingX<br>Copyright © 2026 ColaCola</p><p>MIT License — Permission is granted to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies with the copyright and permission notice retained.</p><button class="ep-btn danger" data-reset-settings>${this.t("恢复默认设置", "Reset settings")}</button></div></section>`;
    page
      .querySelectorAll(".ep-section-body")
      .item(2)
      ?.insertAdjacentHTML(
        "beforeend",
        `<details class="ep-section"><summary>${this.t("完整 MIT 许可", "Full MIT License")}</summary><pre style="white-space:pre-wrap;font-size:10px;color:hsl(var(--ep-muted))">${escapeHtml(EP_MIT_LICENSE)}</pre></details>`,
      );
    page
      .querySelector(".ep-section-body")
      .insertAdjacentHTML(
        "beforeend",
        `<div class="ep-setting"><div><strong>${this.t("标签颜色", "Tag colors")}</strong><small>${this.t("同时用于图表日期标注", "Also used for chart annotations")}</small></div><div class="ep-form">${TAG_TYPES.map(([key, zh, en, color]) => `<label>${this.t(zh, en)}<input type="color" data-tag-color="${key}" value="${prefs.tagColors[key] ?? color}"></label>`).join("")}</div></div>`,
      );
    page.querySelectorAll("[data-setting]").forEach((input) =>
      input.addEventListener("change", () => {
        const key = input.dataset.setting;
        const value = input.type === "checkbox" ? input.checked : input.value;
        this.store.setPreferences({ [key]: value });
        this.applyTheme();
        this.render();
      }),
    );
    page.querySelectorAll("[data-chart-setting]").forEach((input) =>
      input.addEventListener("change", () => {
        let value = input.value;
        if (input.dataset.chartSetting === "defaultRange")
          value = value === "all" ? null : Number(value);
        else if (input.dataset.chartSetting !== "defaultView")
          value = Number(value);
        this.store.setPreferences({
          chart: { [input.dataset.chartSetting]: value },
        });
        this.render();
      }),
    );
    page.querySelectorAll("[data-light-setting]").forEach((input) =>
      input.addEventListener("change", () => {
        this.store.setPreferences({
          lightBg: { [input.dataset.lightSetting]: Number(input.value) },
        });
        this.applyTheme();
      }),
    );
    page.querySelectorAll("[data-tag-color]").forEach((input) =>
      input.addEventListener("change", () => {
        this.store.setPreferences({
          tagColors: {
            ...this.store.getPreferences().tagColors,
            [input.dataset.tagColor]: input.value,
          },
        });
      }),
    );
    page
      .querySelector("[data-reset-settings]")
      .addEventListener("click", () => {
        if (
          globalThis.confirm?.(
            this.t(
              "恢复全部资产中心设置？历史数据不受影响。",
              "Reset all asset-center settings? History is preserved.",
            ),
          )
        ) {
          this.store.resetPreferences();
          this.applyTheme();
          this.render();
        }
      });
  }

  downloadBackup() {
    const blob = new Blob(
      [JSON.stringify(this.store.exportBackup(), null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `MWITools_asset_center_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  changed() {
    this.onChange?.();
    this.render();
  }

  destroy() {
    this.close();
    document.removeEventListener("keydown", this.keydown);
    this.resizeObserver?.disconnect();
    this.root?.remove();
  }
}

export function createAssetCenter(options) {
  return new AssetCenter(options);
}
