import { runtime } from "../core/runtime.js";

const WARNING_ID = "mwitools-duplicate-script-warning";
const pageWindow = globalThis.unsafeWindow ?? globalThis.window ?? globalThis;
const dpsWasPresentAtLoad = Boolean(pageWindow.__MWI_DPS);

function detectDuplicateScripts(options = {}) {
  const target = options.pageWindow ?? pageWindow;
  const documentRef = options.documentRef ?? globalThis.document;
  const duplicates = [];
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
  return duplicates;
}

function showDuplicateWarning(
  duplicates,
  {
    documentRef = globalThis.document,
    isZH = runtime.config.isZH,
    onDismiss = null,
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
      onDismiss?.();
      warning.remove();
    });
    warning.append(close, documentRef.createElement("div"));
    documentRef.body.append(warning);
  }
  const content = warning.lastElementChild;
  const names = duplicates.join(isZH ? "、" : ", ");
  const message = isZH
    ? `检测到与新版 MWITools 功能重复的脚本：${names}。为避免重复监听、面板冲突和重复计算，建议在脚本管理器中停用或删除。`
    : `Scripts overlapping with the new MWITools were detected: ${names}. Disable or remove them in your userscript manager to avoid duplicate listeners, panels, and calculations.`;
  if (content.textContent !== message) content.textContent = message;
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
  const intervalMs = options.intervalMs ?? 1_000;
  const detected = new Set();
  let lastSignature = "";
  let dismissed = false;
  let pending = false;
  let destroyed = false;

  const scan = () => {
    pending = false;
    if (destroyed || dismissed) return;
    for (const name of detect()) detected.add(name);
    if (!detected.size) return;
    const duplicates = [...detected].sort();
    const signature = duplicateSignature(duplicates);
    if (signature === lastSignature) return;
    lastSignature = signature;
    render(duplicates, {
      documentRef,
      isZH: options.isZH ?? runtime.config.isZH,
      onDismiss() {
        dismissed = true;
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
    scope.add(() => monitor.destroy());
  },
});

export {
  createDuplicateWarningMonitor,
  detectDuplicateScripts,
  duplicateSignature,
  showDuplicateWarning,
};
