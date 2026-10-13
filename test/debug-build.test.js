import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const output = await readFile(
  new URL("../MWITools-debug.user.js", import.meta.url),
  "utf8",
);

test("debug artifact replaces the production identity and enables console logging", async () => {
  assert.match(output, /^\/\/ @name\s+MWITools$/m);
  assert.match(output, /^\/\/ @namespace\s+http:\/\/tampermonkey.net\/$/m);
  assert.match(output, /^\/\/ @version\s+26\.4\.21-debug\.2$/m);
  assert.doesNotMatch(output, /^\/\/ @(?:updateURL|downloadURL)\s/m);
  assert.doesNotThrow(() => new vm.Script(output));
  assert.match(output, /module:begin/);
  assert.match(output, /module:ready/);
  const production = await readFile(
    new URL("../MWITools.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(production, /module:begin/);
  const dom = new JSDOM("", {
    url: "https://www.milkywayidle.com/game?mwitoolsSafe=1",
    runScripts: "outside-only",
  });
  const logs = [];
  dom.window.console.info = (...args) => logs.push(args);
  try {
    dom.window.eval(output);
    const report = dom.window.__MWITOOLS_STARTUP_DEBUG__.snapshot();
    assert.equal(report.current.lastPhase, "bootstrap:safe-bypass");
    assert.equal(report.current.features.length, 0);
    assert.ok(dom.window.document.querySelector("#mwitools-startup-debug"));
    assert.ok(
      logs.some(
        ([prefix, phase]) =>
          prefix === "[MWITools Debug]" &&
          phase.includes("bootstrap:safe-bypass"),
      ),
    );
  } finally {
    dom.window.close();
  }
});
