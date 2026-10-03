import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createStartupDiagnostics } from "../src/core/startup-diagnostics.js";

test("safe startup bypasses all app imports while preserving saved data", async () => {
  const dom = new JSDOM("", {
    url: "https://www.milkywayidle.com/game?mwitoolsSafe=1",
  });
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

test("diagnostics attribute slow state and handler work without changing return values", async () => {
  const dom = new JSDOM("", {
    url: "https://www.milkywayidle.com/game?mwitoolsDebug=1",
  });
  let clock = 0;
  dom.window.performance.now = () => clock;
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
