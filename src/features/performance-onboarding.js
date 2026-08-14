import { runtime } from "../core/runtime.js";
import {
  applyPerformanceProfile,
  completePerformanceOnboardingWithoutChanges,
  getProfileState,
  initializePerformancePolicy,
  recommendPerformanceTier,
  resolvePresetChoices,
  shouldRunPerformanceOnboarding,
} from "../core/performance-profile.js";

export const PERFORMANCE_ONBOARDING_ID = "mwitools-performance-onboarding";
const PERFORMANCE_STYLE_ID = "mwitools-performance-onboarding-style";

const TEXT = Object.freeze({
  usage: {
    life: { zh: "生活", en: "Skilling" },
    combat: { zh: "战斗", en: "Combat" },
    balanced: { zh: "平衡", en: "Balanced" },
  },
  tier: {
    smooth: { zh: "流畅优先", en: "Smooth" },
    standard: { zh: "标准", en: "Standard" },
    full: { zh: "完整功能", en: "Full features" },
    custom: { zh: "自定义", en: "Custom" },
  },
});

const CUSTOM_GROUPS = Object.freeze([
  {
    id: "combat",
    title: { zh: "战斗与刷新", en: "Combat & refresh" },
    fields: ["dps", "battleBuffs", "dpsGraph", "refreshIntervalMs"],
  },
  {
    id: "tasks-assets",
    title: { zh: "任务与资产", en: "Tasks & assets" },
    fields: [
      "taskEnhancements",
      "taskArt",
      "assetHistory",
      "totalAssetsAndSort",
    ],
  },
  {
    id: "production",
    title: { zh: "生产与悬浮计算", en: "Production & tooltip calculations" },
    fields: ["productionSummary", "complexCalculations"],
  },
  {
    id: "guild-visual",
    title: { zh: "公会与视觉", en: "Guild & visuals" },
    fields: ["guildEnhancements", "decorativeAnimations"],
  },
]);

const FIELD_TEXT = Object.freeze({
  dps: {
    title: { zh: "DPS / HPS / 承伤", en: "DPS / HPS / damage taken" },
    summary: {
      zh: "记录实时战斗、片段和历史统计。",
      en: "Track live combat, segments, and history.",
    },
  },
  battleBuffs: {
    title: { zh: "战斗 Buff 倒计时", en: "Combat buff countdowns" },
    summary: {
      zh: "在战斗单位下显示增益、减益与剩余时间。",
      en: "Show buffs, debuffs, and remaining time below combat units.",
    },
  },
  taskEnhancements: {
    title: { zh: "任务增强布局", en: "Enhanced task layout" },
    summary: {
      zh: "启用任务平铺、整理、筛选与相关增强。",
      en: "Enable flat tasks, organization, filters, and related enhancements.",
    },
  },
  taskArt: {
    title: { zh: "任务背景图", en: "Task artwork" },
    summary: {
      zh: "显示任务物品、怪物与副本的原生图标。",
      en: "Show native item, monster, and dungeon artwork.",
    },
  },
  assetHistory: {
    title: { zh: "资产历史图表", en: "Asset history charts" },
    summary: {
      zh: "保存每日资产快照并显示盈亏趋势。",
      en: "Store daily asset snapshots and show P/L trends.",
    },
  },
  totalAssetsAndSort: {
    title: { zh: "总资产与库存排序", en: "Total assets & inventory sorting" },
    summary: {
      zh: "计算着装评分、总资产并按价值整理库存。",
      en: "Calculate gear scores and assets and sort inventory by value.",
    },
  },
  productionSummary: {
    title: { zh: "生产摘要", en: "Production summary" },
    summary: {
      zh: "开启时默认折叠显示产出、库存与最大次数。",
      en: "Show output, inventory, and maximum count collapsed by default.",
    },
  },
  complexCalculations: {
    title: {
      zh: "利润与复杂悬浮计算",
      en: "Profit & detailed tooltip calculations",
    },
    summary: {
      zh: "开启后仍需按键或移动端长按才显示复杂详情。",
      en: "Detailed calculations still require a held key or mobile long press.",
    },
  },
  guildEnhancements: {
    title: {
      zh: "公会趋势与排行榜增强",
      en: "Guild trends & leaderboard enhancements",
    },
    summary: {
      zh: "显示公会经验趋势、成员速率、名次徽章与排行榜速率。",
      en: "Show guild trends, member rates, rank badges, and leaderboard rates.",
    },
  },
  decorativeAnimations: {
    title: { zh: "持续装饰动画", en: "Continuous decorative motion" },
    summary: {
      zh: "控制徽章扫光、提示脉冲等持续动画。",
      en: "Control badge glints, notification pulses, and similar motion.",
    },
  },
  dpsGraph: {
    title: { zh: "DPS 趋势图默认显示", en: "Show DPS trend by default" },
    summary: {
      zh: "同时控制新版和兼容面板的趋势图初始状态。",
      en: "Set the initial graph state in both modern and compatible panels.",
    },
  },
  refreshIntervalMs: {
    title: { zh: "可见面板刷新间隔", en: "Visible panel refresh interval" },
    summary: {
      zh: "只调整定时刷新的 MWITools 面板；事件驱动功能保持即时。",
      en: "Adjust timed MWITools panels; event-driven features stay immediate.",
    },
  },
});

function isZH() {
  return Boolean(runtime.config.isZH);
}

function t(value) {
  if (typeof value === "string") return value;
  return value?.[isZH() ? "zh" : "en"] ?? "";
}

function addStyles() {
  if (document.getElementById(PERFORMANCE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PERFORMANCE_STYLE_ID;
  style.textContent = `
    #${PERFORMANCE_ONBOARDING_ID}{position:fixed;inset:0;z-index:2147483400;display:grid;grid-template:1fr/1fr;opacity:0;transition:opacity .3s linear;color:var(--color-neutral-100,#e7e7e7);font:14px/1.5 Roboto,Helvetica,Arial,sans-serif}
    #${PERFORMANCE_ONBOARDING_ID}.mwi-performance-open{opacity:1}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-backdrop{grid-area:1/1;background:var(--color-midnight-800-opacity-80,rgba(25,26,36,.82))}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-dialog{grid-area:1/1;place-self:center;display:flex;align-items:flex-end;max-width:calc(100vw - 24px);transform:translate(50vw,-50vh) scale(0);transition:transform .3s linear}
    #${PERFORMANCE_ONBOARDING_ID}.mwi-performance-open .mwi-performance-dialog{transform:none}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-mascot{position:relative;z-index:1;width:130px;flex:0 0 130px;margin:0 -20px 0 -40px;text-align:center}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-mascot svg{display:block;width:130px;height:100px}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-mascot-name{margin:0 10px;padding:1px 7px;border-radius:4px;background:var(--color-space-600,#394064);font-size:14px;font-weight:600;white-space:nowrap}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-card{position:relative;display:grid;width:min(560px,calc(100vw - 24px));max-height:min(760px,calc(100vh - 32px));overflow:hidden;border:1px solid var(--color-neutral-200,#d0d0d0);border-radius:4px;background:var(--color-midnight-900,#131419);box-shadow:rgba(208,208,208,.28) 0 0 4px 4px;grid-template-rows:auto minmax(0,1fr) auto}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-head{position:relative;min-height:38px;padding:14px 150px 8px;text-align:center}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-title{font-size:17px;font-weight:700}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-progress{position:absolute;left:14px;top:10px;width:120px;color:var(--color-neutral-400,#999);font-size:10px;text-align:left}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-progress-label{display:flex;justify-content:space-between;gap:6px;margin-bottom:3px}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-progress-track{height:5px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.13)}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-progress-fill{display:block;height:100%;border-radius:inherit;background:var(--color-primary,#ee9a1d);transition:width .2s ease}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-close{position:absolute;z-index:2;right:8px;top:7px;display:flex;width:30px;height:30px;align-items:center;justify-content:center;border:0;background:transparent;color:#fff;font-size:25px;line-height:1;cursor:pointer}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-body{min-height:180px;overflow:auto;overscroll-behavior:contain;padding:10px 18px 16px}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-copy{margin:0 auto 14px;max-width:470px;color:var(--color-neutral-200,#d0d0d0);text-align:center}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-note{margin:10px 0 0;padding:8px 10px;border-radius:4px;background:var(--color-midnight-700,#292d3e);color:var(--color-neutral-300,#b7b7b7);font-size:12px}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-option{position:relative;min-height:82px;padding:11px;border:1px solid rgba(208,208,208,.24);border-radius:4px;background:var(--color-midnight-700,#292d3e);color:inherit;text-align:left;cursor:pointer}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-option:hover{border-color:rgba(238,154,29,.7)}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-option[aria-checked="true"]{border-color:var(--color-primary,#ee9a1d);box-shadow:inset 0 0 0 1px var(--color-primary,#ee9a1d);background:rgba(238,154,29,.12)}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-option-title{font-size:14px;font-weight:700}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-option-copy{margin-top:4px;color:var(--color-neutral-300,#b7b7b7);font-size:11px;line-height:1.4}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-recommended{position:absolute;right:7px;top:7px;padding:1px 5px;border-radius:999px;background:var(--color-primary,#ee9a1d);color:#111;font-size:9px;font-weight:800}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-fields{display:flex;flex-direction:column;gap:7px}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-field{display:grid;min-height:56px;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px 10px;border-radius:4px;background:var(--color-midnight-700,#292d3e)}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-field-title{font-weight:650}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-field-copy{margin-top:2px;color:var(--color-neutral-400,#999);font-size:10.5px;line-height:1.35}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-switch{position:relative;width:42px;height:23px;cursor:pointer}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-switch input{position:absolute;opacity:0}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-switch span{position:absolute;inset:0;border-radius:99px;background:#555}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-switch span::after{content:"";position:absolute;left:3px;top:3px;width:17px;height:17px;border-radius:50%;background:#fff;opacity:.65;transition:transform .15s}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-switch input:checked+span{background:#29c274}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-switch input:checked+span::after{transform:translateX(19px);opacity:1}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-select{min-width:100px;border:1px solid rgba(255,255,255,.2);border-radius:4px;padding:6px 24px 6px 8px;background:var(--color-midnight-900,#131419);color:inherit}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-review{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-review-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;border-radius:4px;background:var(--color-midnight-700,#292d3e);font-size:11px}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-review-row b{color:#8ed9a6;font-weight:700;text-align:right}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-footer{display:flex;justify-content:flex-end;gap:8px;padding:10px 16px 14px;border-top:1px solid rgba(255,255,255,.09)}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-button{display:flex;min-height:36px;align-items:center;justify-content:center;border:0;border-radius:4px;padding:0 14px;font:600 14px/1 Roboto,Arial,sans-serif;cursor:pointer}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-button:disabled{cursor:wait;opacity:.55}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-button-secondary{background:var(--color-midnight-600,#39405a);color:#eee}
    #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-button-primary{background:var(--color-primary,#ee9a1d);color:#111}
    html[data-mwitools-decorative-motion="off"] .mwi-lb-badge--top-five::before,
    html[data-mwitools-decorative-motion="off"] .mwi-lb-badge--top-five::after,
    html[data-mwitools-decorative-motion="off"] #script_item_warning,
    html[data-mwitools-decorative-motion="off"] .mwi-train-shop-target,
    html[data-mwitools-decorative-motion="off"] .handle-badge::after,
    html[data-mwitools-decorative-motion="off"] #mwitools-feedback-button[data-unread="true"]{animation:none!important}
    @media(max-width:700px){
      #${PERFORMANCE_ONBOARDING_ID}{align-items:end}
      #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-dialog{width:calc(100vw - 16px);max-width:none;max-height:calc(100vh - 12px);flex-direction:column;align-items:flex-start;place-self:end center}
      #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-mascot{display:flex;width:auto;height:58px;flex:0 0 58px;align-items:flex-end;margin:0 0 -12px 9px}
      #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-mascot svg{width:76px;height:58px}
      #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-mascot-name{margin:0 0 12px -8px;font-size:11px}
      #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-card{width:100%;max-height:calc(100vh - 70px);max-height:calc(100dvh - 70px)}
      #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-head{min-height:32px;padding:42px 40px 8px 12px}
      #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-progress{left:12px;right:44px;top:9px;width:auto}
      #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-body{padding:8px 12px 12px}
      #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-options,#${PERFORMANCE_ONBOARDING_ID} .mwi-performance-review{grid-template-columns:1fr}
      #${PERFORMANCE_ONBOARDING_ID} .mwi-performance-option{min-height:68px}
    }
    @media(prefers-reduced-motion:reduce){#${PERFORMANCE_ONBOARDING_ID},#${PERFORMANCE_ONBOARDING_ID} .mwi-performance-dialog{transition:none}}
  `;
  (document.head ?? document.documentElement).append(style);
}

function findPurpleCowSprite() {
  const direct = document
    .querySelector('svg[aria-label="Purple Cow"] use')
    ?.getAttribute("href");
  if (direct) return direct.replace(/#.*$/, "#purple_cow_hello");
  const existing = document.querySelector(
    'use[href*="misc_sprite"],use[xlink\\:href*="misc_sprite"]',
  );
  const existingHref =
    existing?.getAttribute("href") ?? existing?.getAttribute("xlink:href");
  if (existingHref) {
    return existingHref.replace(/#.*$/, "#purple_cow_hello");
  }
  for (const entry of globalThis.performance?.getEntriesByType?.("resource") ??
    []) {
    if (/\/misc_sprite\.[^/]+\.svg(?:$|\?)/.test(entry.name)) {
      return `${entry.name.split("?")[0]}#purple_cow_hello`;
    }
  }
  return "";
}

function createMascot() {
  const host = document.createElement("div");
  host.className = "mwi-performance-mascot";
  const href = findPurpleCowSprite();
  if (href) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", isZH() ? "小紫牛" : "Purple Cow");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", href);
    svg.append(use);
    host.append(svg);
  } else {
    host.dataset.mascotMissing = "true";
  }
  const name = document.createElement("div");
  name.className = "mwi-performance-mascot-name";
  name.textContent = isZH() ? "MWITools 小紫牛" : "MWITools Purple";
  host.append(name);
  return host;
}

function optionCopy(kind, id) {
  const copies = {
    usage: {
      life: {
        zh: "优先生活技能与日常生产；流畅档会关闭实时战斗统计。",
        en: "Prioritize skilling and production; Smooth disables live combat stats.",
      },
      combat: {
        zh: "保留实时战斗统计；按设备性能调整战斗显示。",
        en: "Keep live combat stats and scale combat visuals to the device.",
      },
      balanced: {
        zh: "兼顾生活与战斗；当前战斗条件与战斗模式相同。",
        en: "Cover both skilling and combat; combat conditions currently match Combat.",
      },
    },
    tier: {
      smooth: {
        zh: "低性能或旧款手机推荐：2 秒刷新，关闭资产历史与持续动画。",
        en: "For slower phones: 2-second refresh, no asset history or continuous motion.",
      },
      standard: {
        zh: "大多数设备推荐：1 秒刷新，开启常用功能。",
        en: "Recommended for most devices: 1-second refresh and common features.",
      },
      full: {
        zh: "高性能设备：开启全部显示，并默认展示 DPS 趋势图。",
        en: "For fast devices: all visuals and DPS trends enabled by default.",
      },
      custom: {
        zh: "按功能组逐步选择，每项都由你决定。",
        en: "Choose each feature group step by step.",
      },
    },
  };
  return t(copies[kind][id]);
}

function choiceStatus(field, value) {
  if (field === "refreshIntervalMs") {
    return `${Number(value) / 1000} ${isZH() ? "秒" : "sec"}`;
  }
  if (field === "productionSummary" && value) {
    return isZH() ? "折叠显示" : "Collapsed";
  }
  if (field === "complexCalculations" && value) {
    return isZH() ? "按键 / 长按" : "Key / long press";
  }
  return value ? (isZH() ? "开启" : "On") : isZH() ? "关闭" : "Off";
}

class PerformanceOnboarding {
  constructor({ firstRun = false } = {}) {
    this.firstRun = firstRun;
    const current = getProfileState();
    this.usage = current.completed ? current.usage : "balanced";
    this.tier = current.completed ? current.tier : recommendPerformanceTier();
    this.choices = current.completed
      ? { ...current.choices }
      : resolvePresetChoices(this.usage, this.tier);
    this.stage = "welcome";
    this.history = [];
    this.previousBodyOverflow = "";
    this.trigger = document.activeElement;
    this.resolve = null;
    this.closing = false;
    this.promise = new Promise((resolve) => {
      this.resolve = resolve;
    });
    this.handleKeydown = this.handleKeydown.bind(this);
  }

  open() {
    addStyles();
    document.getElementById(PERFORMANCE_ONBOARDING_ID)?.remove();
    this.root = document.createElement("div");
    this.root.id = PERFORMANCE_ONBOARDING_ID;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute(
      "aria-label",
      isZH() ? "MWITools 性能引导" : "MWITools performance guide",
    );
    const backdrop = document.createElement("div");
    backdrop.className = "mwi-performance-backdrop";
    backdrop.addEventListener("click", () => void this.cancel());
    this.dialog = document.createElement("div");
    this.dialog.className = "mwi-performance-dialog";
    const card = document.createElement("section");
    card.className = "mwi-performance-card";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "mwi-performance-close";
    close.setAttribute("aria-label", isZH() ? "关闭引导" : "Close guide");
    close.textContent = "×";
    close.addEventListener("click", () => void this.cancel());
    this.head = document.createElement("header");
    this.head.className = "mwi-performance-head";
    this.body = document.createElement("div");
    this.body.className = "mwi-performance-body";
    this.footer = document.createElement("footer");
    this.footer.className = "mwi-performance-footer";
    card.append(close, this.head, this.body, this.footer);
    this.dialog.append(createMascot(), card);
    this.root.append(backdrop, this.dialog);
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.append(this.root);
    document.addEventListener("keydown", this.handleKeydown, true);
    this.render();
    setTimeout(() => {
      this.root?.classList.add("mwi-performance-open");
      this.root?.querySelector(".mwi-performance-button-primary")?.focus();
    }, 0);
    return this.promise;
  }

  handleKeydown(event) {
    if (!this.root) return;
    if (event.key === "Escape") {
      event.preventDefault();
      void this.cancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...this.root.querySelectorAll(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
      ),
    ];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  stageInfo() {
    if (this.stage === "welcome") {
      return {
        title: isZH() ? "欢迎使用 MWITools" : "Welcome to MWITools",
      };
    }
    if (this.stage === "usage") {
      return {
        title: isZH() ? "你主要怎么玩？" : "How do you usually play?",
      };
    }
    if (this.stage === "tier") {
      return {
        title: isZH() ? "选择设备性能档位" : "Choose a performance tier",
      };
    }
    if (this.stage.startsWith("custom:")) {
      const index = Number(this.stage.split(":")[1]);
      return {
        title: t(CUSTOM_GROUPS[index].title),
      };
    }
    return {
      title: isZH() ? "确认性能设置" : "Confirm performance settings",
    };
  }

  overallProgress() {
    const custom = this.tier === "custom";
    const total = custom ? CUSTOM_GROUPS.length + 3 : 3;
    if (this.stage === "welcome") return { current: 0, total };
    if (this.stage === "usage") return { current: 1, total };
    if (this.stage === "tier") return { current: 2, total };
    if (this.stage.startsWith("custom:")) {
      return {
        current: Number(this.stage.split(":")[1]) + 3,
        total,
      };
    }
    return { current: total, total };
  }

  render() {
    const info = this.stageInfo();
    const overall = this.overallProgress();
    this.head.replaceChildren();
    const title = document.createElement("div");
    title.className = "mwi-performance-title";
    title.textContent = info.title;
    const progress = document.createElement("div");
    progress.className = "mwi-performance-progress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", String(overall.total));
    progress.setAttribute("aria-valuenow", String(overall.current));
    const progressLabel = document.createElement("div");
    progressLabel.className = "mwi-performance-progress-label";
    const progressTitle = document.createElement("span");
    progressTitle.textContent = isZH() ? "总进度" : "Overall";
    const progressValue = document.createElement("span");
    progressValue.textContent = `${overall.current} / ${overall.total}`;
    progressLabel.append(progressTitle, progressValue);
    const progressTrack = document.createElement("div");
    progressTrack.className = "mwi-performance-progress-track";
    const progressFill = document.createElement("span");
    progressFill.className = "mwi-performance-progress-fill";
    progressFill.style.width = `${(overall.current / overall.total) * 100}%`;
    progressTrack.append(progressFill);
    progress.append(progressLabel, progressTrack);
    this.head.append(title, progress);
    this.body.replaceChildren();
    this.footer.replaceChildren();
    if (this.stage === "welcome") this.renderWelcome();
    else if (this.stage === "usage") this.renderOptions("usage");
    else if (this.stage === "tier") this.renderOptions("tier");
    else if (this.stage.startsWith("custom:")) this.renderCustom();
    else this.renderReview();
    this.renderFooter();
  }

  renderWelcome() {
    const copy = document.createElement("p");
    copy.className = "mwi-performance-copy";
    copy.textContent = isZH()
      ? "根据你的玩法和设备选择合适配置，可以减少设备长时间挂机时的发热、耗电和卡顿。所有选项之后都能在设置中重新调整。"
      : "Choose a setup for your play style and device to reduce heat, power use, and stutter during long unattended sessions. You can restart this guide from Settings at any time.";
    const note = document.createElement("div");
    note.className = "mwi-performance-note";
    note.textContent = isZH()
      ? "只会调整性能相关功能，不会修改语言、估值口径、通知或已保存的数据。"
      : "Only performance-related features change. Language, valuation rules, notifications, and saved data stay untouched.";
    this.body.append(copy, note);
  }

  renderOptions(kind) {
    const selected = kind === "usage" ? this.usage : this.tier;
    const ids =
      kind === "usage"
        ? ["life", "combat", "balanced"]
        : ["smooth", "standard", "full", "custom"];
    const recommended = kind === "tier" ? recommendPerformanceTier() : null;
    const options = document.createElement("div");
    options.className = "mwi-performance-options";
    options.setAttribute("role", "radiogroup");
    for (const id of ids) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mwi-performance-option";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(selected === id));
      button.dataset.value = id;
      const heading = document.createElement("div");
      heading.className = "mwi-performance-option-title";
      heading.textContent = t(TEXT[kind][id]);
      const copy = document.createElement("div");
      copy.className = "mwi-performance-option-copy";
      copy.textContent = optionCopy(kind, id);
      button.append(heading, copy);
      if (recommended === id) {
        const badge = document.createElement("span");
        badge.className = "mwi-performance-recommended";
        badge.textContent = isZH() ? "推荐" : "Recommended";
        button.append(badge);
      }
      button.addEventListener("click", () => {
        if (kind === "usage") this.usage = id;
        else {
          this.tier = id;
          this.choices =
            id === "custom"
              ? { ...getProfileState().choices }
              : resolvePresetChoices(this.usage, id);
        }
        this.render();
      });
      options.append(button);
    }
    this.body.append(options);
  }

  renderCustom() {
    const index = Number(this.stage.split(":")[1]);
    const group = CUSTOM_GROUPS[index];
    const fields = document.createElement("div");
    fields.className = "mwi-performance-fields";
    for (const field of group.fields) {
      const row = document.createElement("div");
      row.className = "mwi-performance-field";
      const copy = document.createElement("div");
      const heading = document.createElement("div");
      heading.className = "mwi-performance-field-title";
      heading.textContent = t(FIELD_TEXT[field].title);
      const summary = document.createElement("div");
      summary.className = "mwi-performance-field-copy";
      summary.textContent = t(FIELD_TEXT[field].summary);
      copy.append(heading, summary);
      if (field === "refreshIntervalMs") {
        const select = document.createElement("select");
        select.className = "mwi-performance-select";
        select.setAttribute("aria-label", heading.textContent);
        for (const value of [1000, 2000]) {
          const option = document.createElement("option");
          option.value = String(value);
          option.textContent = `${value / 1000} ${isZH() ? "秒" : "sec"}`;
          select.append(option);
        }
        select.value = String(this.choices[field]);
        select.addEventListener("change", () => {
          this.choices[field] = Number(select.value);
        });
        row.append(copy, select);
      } else {
        const toggle = document.createElement("label");
        toggle.className = "mwi-performance-switch";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = Boolean(this.choices[field]);
        input.setAttribute("aria-label", heading.textContent);
        const track = document.createElement("span");
        input.addEventListener("change", () => {
          this.choices[field] = input.checked;
        });
        toggle.append(input, track);
        row.append(copy, toggle);
      }
      fields.append(row);
    }
    this.body.append(fields);
  }

  renderReview() {
    const copy = document.createElement("p");
    copy.className = "mwi-performance-copy";
    copy.textContent = `${t(TEXT.usage[this.usage])} · ${t(TEXT.tier[this.tier])}`;
    const review = document.createElement("div");
    review.className = "mwi-performance-review";
    for (const field of Object.keys(FIELD_TEXT)) {
      const row = document.createElement("div");
      row.className = "mwi-performance-review-row";
      const label = document.createElement("span");
      label.textContent = t(FIELD_TEXT[field].title);
      const status = document.createElement("b");
      status.textContent = choiceStatus(field, this.choices[field]);
      row.append(label, status);
      review.append(row);
    }
    this.body.append(copy, review);
  }

  renderFooter() {
    if (this.stage !== "welcome") {
      const back = document.createElement("button");
      back.type = "button";
      back.className =
        "mwi-performance-button mwi-performance-button-secondary";
      back.textContent = isZH() ? "返回" : "Back";
      back.addEventListener("click", () => this.goBack());
      this.footer.append(back);
    }
    const next = document.createElement("button");
    next.type = "button";
    next.className = "mwi-performance-button mwi-performance-button-primary";
    next.textContent =
      this.stage === "review"
        ? isZH()
          ? "应用并进入游戏"
          : "Apply and enter game"
        : isZH()
          ? "下一步"
          : "Next";
    next.addEventListener("click", async () => {
      if (this.stage === "review") {
        if (this.closing) return;
        this.closing = true;
        next.disabled = true;
        try {
          await applyPerformanceProfile({
            usage: this.usage,
            tier: this.tier,
            choices: this.tier === "custom" ? this.choices : null,
          });
          this.finish("applied");
          this.reloadPage();
        } catch (error) {
          this.closing = false;
          next.disabled = false;
          const note = document.createElement("div");
          note.className = "mwi-performance-note";
          note.setAttribute("role", "alert");
          note.textContent = isZH()
            ? "设置保存失败，请重试。"
            : "Could not save these settings. Please try again.";
          this.body.prepend(note);
          console.error(
            "[MWITools] Failed to apply performance profile",
            error,
          );
        }
        return;
      }
      this.goNext();
    });
    this.footer.append(next);
  }

  reloadPage() {
    try {
      if (typeof runtime.api.reloadPage === "function") {
        runtime.api.reloadPage();
        return;
      }
      globalThis.location?.reload?.();
    } catch (error) {
      console.error(
        isZH()
          ? "[MWITools] 应用性能设置后刷新页面失败"
          : "[MWITools] Failed to reload after applying performance settings",
        error,
      );
    }
  }

  goNext() {
    this.history.push(this.stage);
    if (this.stage === "welcome") this.stage = "usage";
    else if (this.stage === "usage") this.stage = "tier";
    else if (this.stage === "tier") {
      this.choices =
        this.tier === "custom"
          ? { ...this.choices }
          : resolvePresetChoices(this.usage, this.tier);
      this.stage = this.tier === "custom" ? "custom:0" : "review";
    } else if (this.stage.startsWith("custom:")) {
      const index = Number(this.stage.split(":")[1]);
      this.stage =
        index + 1 < CUSTOM_GROUPS.length ? `custom:${index + 1}` : "review";
    }
    this.render();
    this.body.scrollTop = 0;
  }

  goBack() {
    this.stage = this.history.pop() ?? "welcome";
    this.render();
    this.body.scrollTop = 0;
  }

  async cancel() {
    if (this.closing) return;
    this.closing = true;
    try {
      if (this.firstRun) await completePerformanceOnboardingWithoutChanges();
    } finally {
      this.finish("cancelled");
    }
  }

  finish(result) {
    if (!this.root) return;
    const root = this.root;
    this.root = null;
    document.removeEventListener("keydown", this.handleKeydown, true);
    document.body.style.overflow = this.previousBodyOverflow;
    root.classList.remove("mwi-performance-open");
    setTimeout(() => root.remove(), 300);
    this.trigger?.focus?.();
    this.resolve?.({ result, profile: getProfileState() });
    this.resolve = null;
    activeOnboarding = null;
  }
}

let activeOnboarding = null;

export async function openPerformanceOnboarding(options = {}) {
  if (activeOnboarding) return activeOnboarding.promise;
  if (!document.body) {
    await new Promise((resolve) =>
      document.addEventListener("DOMContentLoaded", resolve, { once: true }),
    );
  }
  activeOnboarding = new PerformanceOnboarding(options);
  return activeOnboarding.open();
}

export async function runPerformanceOnboardingIfNeeded() {
  initializePerformancePolicy();
  if (!shouldRunPerformanceOnboarding()) return getProfileState();
  const result = await openPerformanceOnboarding({ firstRun: true });
  return result.profile;
}

Object.assign(runtime.api, {
  openPerformanceOnboarding,
  runPerformanceOnboardingIfNeeded,
});
