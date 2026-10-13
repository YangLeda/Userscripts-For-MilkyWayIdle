import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createStartupDiagnostics } from "../src/core/startup-diagnostics.js";

test("safe startup bypasses all app imports while preserving saved data", async () => {
  const dom = new JSDOM("", {
    url: "https://www.milkywayidle.com/game?mwitoolsSafe=1",
  });
  dom.window.console = { info() {}, warn() {}, error() {} };
  const diagnostics = createStartupDiagnostics(dom.window);
  dom.window.localStorage.setItem("script_settingsMap", "keep-settings");
  let loaded = false;
  await diagnostics.boot(() => {
    loaded = true;
  });
  assert.equal(loaded, false);
  assert.equal(
    dom.window.localStorage.getItem("script_settingsMap"),
    "keep-settings",
  );
  assert.equal(
    diagnostics.snapshot().current.lastPhase,
    "bootstrap:safe-bypass",
  );
  assert.ok(dom.window.document.querySelector("#mwitools-startup-debug"));
  diagnostics.stop();
  dom.window.close();
});

test("diagnostics survive failed module evaluation, retain the previous run and bound logs", async () => {
  const dom = new JSDOM("", {
    url: "https://www.milkywayidle.com/game?mwitoolsDebug=1",
  });
  dom.window.sessionStorage.setItem(
    "MWITools_startup_debug_v1",
    JSON.stringify({ lastPhase: "settings:read" }),
  );
  dom.window.console = { info() {}, warn() {}, error() {} };
  const diagnostics = createStartupDiagnostics(dom.window);
  await diagnostics.boot(() => {
    throw new Error(
      "simulated module failure https://example.com/path?token=secret",
    );
  });
  const failed = diagnostics.snapshot();
  assert.equal(failed.previous.lastPhase, "settings:read");
  assert.equal(failed.current.lastPhase, "startup:failed");
  assert.match(failed.current.events.at(-1).detail, /simulated module failure/);
  assert.doesNotMatch(JSON.stringify(failed), /token=secret/);
  for (let n = 0; n < 200; n++) diagnostics.mark(`test:${n}`);
  assert.equal(diagnostics.snapshot().current.events.length, 120);
  diagnostics.stop();
  assert.equal(
    JSON.parse(dom.window.sessionStorage.getItem("MWITools_startup_debug_v1"))
      .events.length,
    120,
  );
  dom.window.close();
});

test("normal startup does not poll or persist debug logs", async () => {
  const dom = new JSDOM("", { url: "https://www.milkywayidle.com/game" });
  dom.window.console = { info() {}, warn() {}, error() {} };
  const diagnostics = createStartupDiagnostics(dom.window);
  let loaded = false;
  dom.window.setInterval = () => {
    throw new Error("Unexpected diagnostic polling");
  };
  await diagnostics.boot(() => {
    loaded = true;
  });
  diagnostics.mark("test");
  assert.equal(loaded, true);
  assert.equal(
    dom.window.sessionStorage.getItem("MWITools_startup_debug_v1"),
    null,
  );
  assert.equal(
    dom.window.document.querySelector("#mwitools-startup-debug"),
    null,
  );
  dom.window.close();
});

test("console diagnostics identify phases, failures, backlog and replaced getters", async () => {
  const dom = new JSDOM("", {
    url: "https://www.milkywayidle.com/game?mwitoolsDebug=1",
  });
  const logs = [];
  dom.window.console = Object.fromEntries(
    ["info", "warn", "error"].map((level) => [
      level,
      (...args) => logs.push([level, ...args]),
    ]),
  );
  let tick;
  dom.window.setInterval = (callback) => {
    tick = callback;
    return 1;
  };
  const diagnostics = createStartupDiagnostics(dom.window);
  await diagnostics.boot(() => {
    throw new Error("module initialization broke");
  });
  assert.ok(
    logs.some(
      ([level, prefix, phase, detail]) =>
        level === "error" &&
        prefix === "[MWITools Debug]" &&
        phase.includes("startup:failed") &&
        detail.includes("module initialization broke"),
    ),
  );
  assert.ok(
    logs.some(
      ([, , phase]) =>
        typeof phase === "string" && phase.includes("modules:load"),
    ),
  );
  const getter = Object.getOwnPropertyDescriptor(
    dom.window.MessageEvent.prototype,
    "data",
  ).get;
  diagnostics.socketHookInstalled(getter);
  diagnostics.socketProgress("received", 3);
  diagnostics.socketProgress("processed", 2);
  diagnostics.socketProgress("failed", 1);
  Object.defineProperty(dom.window.MessageEvent.prototype, "data", {
    configurable: true,
    get() {
      return "other hook";
    },
  });
  for (let i = 0; i < 10; i++) tick();
  const report = diagnostics.snapshot();
  assert.equal(report.current.socket.received, 1);
  assert.equal(report.current.socket.processed, 1);
  assert.equal(report.current.socket.failed, 1);
  assert.equal(report.current.socket.maxPending, 3);
  assert.equal(report.current.socket.pending, 1);
  assert.equal(report.current.socket.current.stillInstalled, false);
  assert.equal(
    report.current.events.filter(
      ({ phase }) => phase === "socket:hook-replaced",
    ).length,
    1,
  );
  assert.ok(logs.some(([, , phase]) => phase === "Heartbeat"));
  assert.equal(
    dom.window.__MWITOOLS_STARTUP_DEBUG__.snapshot().current.socket.pending,
    1,
  );
  diagnostics.stop();
  dom.window.close();
});

test("comparison mode enables logging and leaves the original message descriptor intact", async () => {
  const dom = new JSDOM("", {
    url: "https://www.milkywayidle.com/game?mwitoolsNoSocket=1",
  });
  dom.window.console = { info() {}, warn() {}, error() {} };
  const before = Object.getOwnPropertyDescriptor(
    dom.window.MessageEvent.prototype,
    "data",
  );
  const diagnostics = createStartupDiagnostics(dom.window);
  let loaded = false;
  await diagnostics.boot(() => {
    loaded = true;
  });
  assert.equal(loaded, true);
  assert.equal(diagnostics.enabled, true);
  assert.equal(diagnostics.skipSocket, true);
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(dom.window.MessageEvent.prototype, "data"),
    before,
  );
  assert.match(
    dom.window.document.querySelector("#mwitools-startup-debug").textContent,
    /Comparison start/,
  );
  diagnostics.stop();
  dom.window.close();
});

test("diagnostics attribute slow state and handler work without changing return values", async () => {
  const dom = new JSDOM("", {
    url: "https://www.milkywayidle.com/game?mwitoolsDebug=1",
  });
  let clock = 0;
  dom.window.performance.now = () => clock;
  dom.window.console = { info() {}, warn() {}, error() {} };
  const diagnostics = createStartupDiagnostics(dom.window);
  await diagnostics.boot(() => {});
  assert.equal(
    diagnostics.measure("handler:test:0", () => {
      clock += 80;
      return 123;
    }),
    123,
  );
  assert.equal(
    diagnostics.snapshot().current.events.at(-1).phase,
    "handler:test:0:slow",
  );
  assert.equal(diagnostics.snapshot().current.events.at(-1).detail, "80 ms");
  assert.throws(
    () =>
      diagnostics.measure("state:test", () => {
        throw new Error("kept failure");
      }),
    /kept failure/,
  );
  diagnostics.stop();
  dom.window.close();
});
