// Bounded, local-only startup diagnostics. Never record game payloads or storage values.
const REPORT_KEY = "MWITools_startup_debug_v1";
const RESCUE_KEY = "MWITools_startup_rescue_v1";
const LIMIT = 120;
const clean = (value) =>
  String(value ?? "")
    .replace(/https?:\/\/[^\s)]+/g, (url) => url.split(/[?#]/)[0])
    .slice(0, 800);

export function createStartupDiagnostics(host = globalThis) {
  const langText = (zh, en) => {
    let language = host.navigator?.language ?? "en";
    try {
      language = host.localStorage?.getItem("i18nextLng") || language;
    } catch {}
    return /^zh/i.test(language) ? zh : en;
  };
  let enabled = false,
    safe = false,
    runtime = null,
    previous = null;
  let report = null,
    flushTimer = null,
    heartbeat = null,
    stopTimer = null;
  let panel = null,
    statusNode = null;
  const sockets = new WeakSet();
  const now = () => host.performance?.now?.() ?? Date.now();
  const read = (key) => {
    try {
      return host.sessionStorage?.getItem(key);
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      host.sessionStorage?.setItem(key, value);
    } catch {}
  };
  const flush = () => {
    flushTimer = null;
    if (enabled && report) write(REPORT_KEY, JSON.stringify(report));
  };
  const mark = (phase, detail = null, immediate = false) => {
    if (!enabled || !report) return;
    report.events.push({
      ms: Math.round(now() - report.started),
      phase: clean(phase),
      ...(detail === null ? {} : { detail: clean(detail) }),
    });
    if (report.events.length > LIMIT) report.events.shift();
    report.lastPhase = clean(phase);
    if (statusNode)
      statusNode.textContent = `${langText("当前阶段", "Current phase")}: ${report.lastPhase}`;
    if (immediate) flush();
    else if (flushTimer === null) flushTimer = host.setTimeout(flush, 500);
  };
  const error = (phase, failure) =>
    mark(phase, failure?.stack ?? failure?.message ?? failure, true);
  const snapshot = () => ({
    schema: 1,
    current: report
      ? {
          ...report,
          events: [...report.events],
          features: (runtime?.features.list() ?? []).map(
            ({ id, status, error }) => ({
              id,
              status,
              error: error ? clean(error) : null,
            }),
          ),
          game: {
            documentReady: host.document?.readyState,
            navigationVisible: !!host.document?.querySelector(
              '[class*="NavigationBar_nav__"]',
            ),
          },
        }
      : null,
    previous,
  });
  const download = () => {
    const url = host.URL.createObjectURL(
      new host.Blob([JSON.stringify(snapshot(), null, 2)], {
        type: "application/json",
      }),
    );
    const link = host.document.createElement("a");
    link.href = url;
    link.download = "MWITools-startup-debug.json";
    link.click();
    host.setTimeout(() => host.URL.revokeObjectURL(url), 1000);
  };
  const rescue = (value) => {
    write(RESCUE_KEY, value ? "1" : "0");
    const url = new host.URL(host.location.href);
    url.searchParams.delete("mwitoolsSafe");
    url.searchParams.set("mwitoolsDebug", "1");
    host.location.href = url.href;
  };
  const show = () => {
    if (!host.document?.body) {
      host.document?.addEventListener("DOMContentLoaded", show, { once: true });
      return;
    }
    if (panel?.isConnected) {
      panel.hidden = false;
      return;
    }
    panel = host.document.createElement("section");
    panel.id = "mwitools-startup-debug";
    panel.style.cssText =
      "position:fixed;z-index:2147483647;right:12px;top:12px;width:340px;max-width:calc(100vw - 24px);max-height:80vh;overflow:auto;padding:14px;background:#15202d;color:#e6edf3;border:1px solid #52657a;border-radius:10px;font:13px/1.6 system-ui;box-sizing:border-box;box-shadow:0 4px 20px #0008";
    const title = host.document.createElement("strong");
    title.textContent = langText("MWITools 启动诊断", "MWITools startup debug");
    const help = host.document.createElement("p");
    help.textContent = safe
      ? langText(
          "安全启动：本页未加载 MWITools 功能，设置和历史数据保留。",
          "Safe start: features bypassed; saved data preserved.",
        )
      : langText(
          "日志仅保存在本标签页，记录启动阶段、错误与卡顿，不记录游戏消息内容。",
          "Logs stay in this tab and record startup phases, errors and stalls without game payloads.",
        );
    panel.append(title, help);
    const status = host.document.createElement("p");
    statusNode = status;
    status.textContent = enabled
      ? `${langText("诊断已开启", "Debug enabled")} · ${report?.lastPhase ?? "boot"}`
      : langText(
          "开启诊断后刷新，才能记录完整启动过程。",
          "Reload with debug enabled to capture startup.",
        );
    panel.append(status);
    for (const [label, action] of [
      [langText("下载诊断报告", "Download report"), download],
      [langText("正常加载并记录", "Start with debug"), () => rescue(false)],
      [langText("安全启动（暂停插件）", "Safe start"), () => rescue(true)],
      [
        langText("收起", "Close"),
        () => {
          panel.hidden = true;
        },
      ],
    ]) {
      const button = host.document.createElement("button");
      button.textContent = label;
      button.style.cssText =
        "display:block;width:100%;margin-top:8px;padding:6px;background:#26394e;color:inherit;border:1px solid #52657a;border-radius:5px;cursor:pointer";
      button.addEventListener("click", action);
      panel.append(button);
    }
    host.document.body.append(panel);
  };
  const stop = () => {
    host.clearInterval(heartbeat);
    host.clearTimeout(stopTimer);
    host.clearTimeout(flushTimer);
    heartbeat = stopTimer = flushTimer = null;
    flush();
  };
  return {
    mark,
    error,
    snapshot,
    show,
    stop,
    attachRuntime(value) {
      runtime = value;
    },
    get enabled() {
      return enabled;
    },
    measure(phase, operation) {
      if (!enabled) return operation();
      if (phase.includes(":init_")) mark(`${phase}:begin`, null, true);
      const started = now();
      try {
        return operation();
      } finally {
        const elapsed = now() - started;
        if (elapsed >= 50)
          mark(`${phase}:slow`, `${Math.round(elapsed)} ms`, true);
      }
    },
    watchSocket(socket) {
      if (!enabled || sockets.has(socket)) return;
      sockets.add(socket);
      mark("socket:first-frame", null, true);
      socket.addEventListener?.(
        "close",
        (event) =>
          mark(
            "socket:closed",
            `code=${Number(event.code)} clean=${!!event.wasClean}`,
            true,
          ),
        { once: true },
      );
      socket.addEventListener?.(
        "error",
        () => mark("socket:error", null, true),
        { once: true },
      );
    },
    async boot(load) {
      const params = new host.URL(host.location?.href ?? "https://localhost")
        .searchParams;
      safe = params.get("mwitoolsSafe") === "1" || read(RESCUE_KEY) === "1";
      enabled =
        safe ||
        params.get("mwitoolsDebug") === "1" ||
        host.__MWITOOLS_DEBUG_BUILD__ === true;
      if (enabled) {
        try {
          previous = JSON.parse(read(REPORT_KEY) || "null");
        } catch {}
        report = {
          started: now(),
          at: new Date().toISOString(),
          version: host.GM_info?.script?.version ?? "unknown",
          host: host.location?.hostname,
          userAgent: clean(host.navigator?.userAgent),
          safe,
          events: [],
        };
        mark("bootstrap:ready", null, true);
        host.addEventListener?.("error", (event) =>
          error("page:error", event.error ?? event.message),
        );
        host.addEventListener?.("unhandledrejection", (event) =>
          error("page:rejection", event.reason),
        );
        host.addEventListener?.("pagehide", stop, { once: true });
        let last = now();
        heartbeat = host.setInterval(() => {
          const gap = now() - last;
          last = now();
          if (!host.document?.hidden && gap > 1500)
            mark("main-thread:delay", `${Math.round(gap)} ms`);
        }, 1000);
        stopTimer = host.setTimeout(stop, 90000);
        show();
      }
      try {
        host.GM_registerMenuCommand?.(
          "MWITools 启动诊断 / Startup debug",
          show,
        );
      } catch {}
      if (safe) {
        mark("bootstrap:safe-bypass", null, true);
        return;
      }
      mark("modules:load", null, true);
      try {
        await load();
        mark("startup:ready", null, true);
      } catch (failure) {
        enabled = true;
        report ??= { started: now(), events: [] };
        error("startup:failed", failure);
        show();
      }
    },
  };
}
export const startupDiagnostics = createStartupDiagnostics();
