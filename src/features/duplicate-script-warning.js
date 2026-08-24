import { runtime } from "../core/runtime.js";

const WARNING_ID = "mwitools-duplicate-script-warning";
const MUTED_DUPLICATES_KEY = "MWITools_muted_duplicate_scripts_v1";
const DUPLICATE_IDS = Object.freeze({
  "MWI 市场伴侣 / MWI Market Mate": "market-mate",
  "银河奶牛 DPS 统计 / Galaxy Cow DPS": "galaxy-cow-dps",
  "Everyday Profit Plus Fixed": "everyday-profit-plus",
  "MWI TaskManager": "mwi-task-manager",
});
let activeDuplicateWarningMonitor = null;
const pageWindow = globalThis.unsafeWindow ?? globalThis.window ?? globalThis;
const dpsWasPresentAtLoad = Boolean(pageWindow.__MWI_DPS);

function detectDuplicateScripts(options = {}) {
  const target = options.pageWindow ?? pageWindow;
  const documentRef = options.documentRef ?? globalThis.document;
  const duplicates = [];
  const taskInsightsEnabled =
    options.taskInsightsEnabled ??
    runtime.settings.get?.("taskInsights") ??
    true;
  if (target.MWIMM || documentRef?.getElementById("mwi-mm2-host")) {
    duplicates.push("MWI 市场伴侣 / MWI Market Mate");
  }
  if (options.dpsWasPresent ?? dpsWasPresentAtLoad) {
    duplicates.push("银河奶牛 DPS 统计 / Galaxy Cow DPS");
  }
  if (
    target.kbd_calculateTotalNetworth ||
    target.__everyday_profit_plus_interval__ ||
    documentRef?.querySelector(
      ".deltaNetworthDiv,#deltaNetworthChartModal,#refreshNetworthIcon,.epPrecisionHintActions,#everyday-profit-chartjs,#everyday-profit-zoom,#everyday-profit-crosshair",
    )
  ) {
    duplicates.push("Everyday Profit Plus Fixed");
  }
  if (
    taskInsightsEnabled &&
    documentRef?.querySelector("#TaskSort") &&
    documentRef?.querySelector(
      "#taskChekerInCoin,#ActionIcon,#BattleIcon,#DungeonIcon",
    )
  ) {
    duplicates.push("MWI TaskManager");
  }
  return duplicates;
}

function duplicateScriptId(name) {
  return (
    DUPLICATE_IDS[name] ??
    String(name ?? "")
      .trim()
      .toLowerCase()
  );
}

function readMutedDuplicateScriptIds(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(MUTED_DUPLICATES_KEY) || "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeMutedDuplicateScriptIds(ids, storage = globalThis.localStorage) {
  const value = [...new Set(ids ?? [])].map(String).filter(Boolean).sort();
  storage?.setItem(MUTED_DUPLICATES_KEY, JSON.stringify(value));
  return value;
}

function clearMutedDuplicateScriptIds(storage = globalThis.localStorage) {
  storage?.removeItem(MUTED_DUPLICATES_KEY);
  activeDuplicateWarningMonitor?.schedule();
}

function showDuplicateWarning(
  duplicates,
  {
    documentRef = globalThis.document,
    isZH = runtime.config.isZH,
    onDismiss = null,
    onMute = null,
  } = {},
) {
  if (!duplicates.length || !documentRef?.body) return null;
  let warning = documentRef.getElementById(WARNING_ID);
  if (!warning) {
    warning = documentRef.createElement("aside");
    warning.id = WARNING_ID;
    warning.setAttribute("role", "status");
    warning.setAttribute("aria-live", "polite");
    warning.style.cssText =
      "position:fixed;z-index:2147483646;top:14px;right:14px;width:min(380px,calc(100vw - 28px));box-sizing:border-box;padding:12px 38px 12px 14px;border:1px solid rgba(245,158,11,.6);border-radius:9px;background:rgba(24,27,35,.97);box-shadow:0 8px 28px rgba(0,0,0,.42);color:#f5f5f5;font:13px/1.55 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
    const close = documentRef.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", isZH ? "关闭提醒" : "Close warning");
    close.style.cssText =
      "position:absolute;top:5px;right:7px;width:26px;height:26px;border:0;background:transparent;color:#bbb;font:20px/26px sans-serif;cursor:pointer";
    close.addEventListener("click", () => {
      warning._mwitoolsOnDismiss?.();
      warning.remove();
    });
    const content = documentRef.createElement("div");
    const message = documentRef.createElement("div");
    const mute = documentRef.createElement("button");
    mute.type = "button";
    mute.dataset.mwitoolsDuplicateMute = "";
    mute.style.cssText =
      "margin-top:8px;border:1px solid rgba(245,158,11,.55);border-radius:5px;padding:4px 9px;background:rgba(245,158,11,.12);color:#ffd58a;font:inherit;cursor:pointer";
    mute.addEventListener("click", () => {
      warning._mwitoolsOnMute?.();
      warning.remove();
    });
    content.append(message, mute);
    warning.append(close, content);
    documentRef.body.append(warning);
  }
  warning._mwitoolsOnDismiss = onDismiss;
  warning._mwitoolsOnMute = onMute;
  const content = warning.lastElementChild;
  const names = duplicates.join(isZH ? "、" : ", ");
  const message = isZH
    ? `检测到与新版 MWITools 功能重复的脚本：${names}。为避免重复监听、面板冲突和重复计算，建议在脚本管理器中停用或删除。`
    : `Scripts overlapping with the new MWITools were detected: ${names}. Disable or remove them in your userscript manager to avoid duplicate listeners, panels, and calculations.`;
  const messageNode = content.firstElementChild;
  if (messageNode.textContent !== message) messageNode.textContent = message;
  const mute = content.querySelector("[data-mwitools-duplicate-mute]");
  mute.textContent = isZH ? "不再提示这些脚本" : "Don't remind me again";
  return warning;
}

function duplicateSignature(duplicates) {
  return [...new Set(duplicates)].sort().join("\u0000");
}

function createDuplicateWarningMonitor(options = {}) {
  const documentRef = options.documentRef ?? globalThis.document;
  const detect = options.detect ?? (() => detectDuplicateScripts(options));
  const render = options.render ?? showDuplicateWarning;
  const scheduleTask = options.scheduleTask ?? globalThis.queueMicrotask;
  const setIntervalRef = options.setIntervalRef ?? globalThis.setInterval;
  const clearIntervalRef = options.clearIntervalRef ?? globalThis.clearInterval;
  const Observer = options.MutationObserverRef ?? globalThis.MutationObserver;
  const intervalMs = options.intervalMs ?? 10_000;
  const detected = new Set();
  const usesStoredMuted = !options.muted;
  const muted = options.muted ?? readMutedDuplicateScriptIds(options.storage);
  const isDuplicateEnabled =
    options.isDuplicateEnabled ??
    ((name) =>
      duplicateScriptId(name) !== "mwi-task-manager" ||
      (runtime.settings.get?.("taskInsights") ?? true));
  let lastSignature = "";
  let dismissed = false;
  let pending = false;
  let destroyed = false;

  const scan = () => {
    pending = false;
    if (destroyed || dismissed) return;
    if (usesStoredMuted) {
      muted.clear();
      for (const id of readMutedDuplicateScriptIds(options.storage)) {
        muted.add(id);
      }
    }
    const current = detect();
    if (
      !current.some((name) => duplicateScriptId(name) === "mwi-task-manager")
    ) {
      for (const name of detected) {
        if (duplicateScriptId(name) === "mwi-task-manager")
          detected.delete(name);
      }
    }
    for (const name of current) detected.add(name);
    const duplicates = [...detected]
      .filter((name) => isDuplicateEnabled(name))
      .filter((name) => !muted.has(duplicateScriptId(name)))
      .sort();
    if (!duplicates.length) {
      documentRef?.getElementById(WARNING_ID)?.remove();
      lastSignature = "";
      return;
    }
    const signature = duplicateSignature(duplicates);
    if (signature === lastSignature) return;
    lastSignature = signature;
    render(duplicates, {
      documentRef,
      isZH: options.isZH ?? runtime.config.isZH,
      onDismiss() {
        dismissed = true;
      },
      onMute() {
        for (const name of duplicates) muted.add(duplicateScriptId(name));
        writeMutedDuplicateScriptIds(muted, options.storage);
        lastSignature = "";
      },
    });
  };

  const schedule = () => {
    if (destroyed || dismissed || pending) return;
    pending = true;
    scheduleTask(() => {
      if (destroyed) return;
      scan();
    });
  };

  scan();
  const intervalId = setIntervalRef?.(schedule, intervalMs);
  const observer =
    typeof Observer === "function"
      ? new Observer((records) => {
          const warning = documentRef?.getElementById(WARNING_ID);
          if (
            warning &&
            records?.length &&
            records.every(
              (record) =>
                record.target === warning || warning.contains(record.target),
            )
          ) {
            return;
          }
          schedule();
        })
      : null;
  observer?.observe(documentRef.body, { childList: true, subtree: true });

  return {
    scan,
    schedule,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      pending = false;
      observer?.disconnect();
      if (intervalId !== undefined) clearIntervalRef?.(intervalId);
      documentRef?.getElementById(WARNING_ID)?.remove();
    },
  };
}

runtime.features.register({
  id: "duplicateScriptWarning",
  initialize({ scope }) {
    const monitor = createDuplicateWarningMonitor();
    activeDuplicateWarningMonitor = monitor;
    scope.add(() => {
      monitor.destroy();
      if (activeDuplicateWarningMonitor === monitor) {
        activeDuplicateWarningMonitor = null;
      }
    });
    scope.add(
      runtime.settings.onChange?.("taskInsights", () => monitor.schedule()),
    );
  },
});

Object.assign(runtime.api, {
  clearMutedDuplicateScriptIds,
  getMutedDuplicateScriptIds: () => [...readMutedDuplicateScriptIds()],
});

export {
  clearMutedDuplicateScriptIds,
  createDuplicateWarningMonitor,
  detectDuplicateScripts,
  duplicateScriptId,
  duplicateSignature,
  readMutedDuplicateScriptIds,
  showDuplicateWarning,
  writeMutedDuplicateScriptIds,
};
