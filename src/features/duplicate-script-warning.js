import { runtime } from "../core/runtime.js";

const WARNING_ID = "mwitools-duplicate-script-warning";
const pageWindow = globalThis.unsafeWindow ?? globalThis.window ?? globalThis;
const dpsWasPresentAtLoad = Boolean(pageWindow.__MWI_DPS);
let warningShown = false;
let warningDismissed = false;

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
  { documentRef = globalThis.document, isZH = runtime.config.isZH } = {},
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
      warningDismissed = true;
      warning.remove();
    });
    warning.append(close, documentRef.createElement("div"));
    documentRef.body.append(warning);
  }
  const content = warning.lastElementChild;
  const names = duplicates.join(isZH ? "、" : ", ");
  content.textContent = isZH
    ? `检测到与新版 MWITools 功能重复的脚本：${names}。为避免重复监听、面板冲突和重复计算，建议在脚本管理器中停用或删除。`
    : `Scripts overlapping with the new MWITools were detected: ${names}. Disable or remove them in your userscript manager to avoid duplicate listeners, panels, and calculations.`;
  return warning;
}

runtime.features.register({
  id: "duplicateScriptWarning",
  initialize({ scope }) {
    if (warningShown) return;
    const detected = new Set();
    const scan = () => {
      if (warningDismissed) return;
      for (const name of detectDuplicateScripts()) detected.add(name);
      if (!detected.size) return;
      warningShown = true;
      showDuplicateWarning([...detected]);
    };
    scan();
    scope.interval(scan, 1_000);
    const observer = new MutationObserver(scan);
    scope.observer(observer, document.body, { childList: true, subtree: true });
    scope.add(() => document.getElementById(WARNING_ID)?.remove());
  },
});

export { detectDuplicateScripts, showDuplicateWarning };
