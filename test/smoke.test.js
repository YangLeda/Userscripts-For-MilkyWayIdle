import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { JSDOM } from "jsdom";

const userscript = await readFile(
  new URL("../MWITools.js", import.meta.url),
  "utf8",
);

function createUserscriptWindow(url) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body></body></html>",
    {
      url,
      runScripts: "outside-only",
    },
  );
  const { window } = dom;
  const calls = { intervals: 0, styles: 0, requests: 0 };

  window.console = { ...console, log() {}, error() {} };
  window.setInterval = () => (calls.intervals += 1);
  window.clearInterval = () => {};
  window.setTimeout = () => 0;
  window.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  window.GM_addStyle = () => (calls.styles += 1);
  window.GM_getValue = (_key, fallback) => fallback;
  window.GM_setValue = () => {};
  window.GM_notification = () => {};
  window.GM_xmlhttpRequest = () => new Promise(() => {});
  window.GM = {
    xmlHttpRequest() {
      calls.requests += 1;
      return new Promise(() => {});
    },
  };
  window.localStorageUtil = { getInitClientData: () => ({}) };
  window.math = {};

  return { calls, dom, window };
}

test("game route starts the bundled userscript without synchronous errors", async () => {
  const { calls, dom, window } = createUserscriptWindow(
    "https://www.milkywayidle.com/",
  );
  assert.doesNotThrow(() => window.eval(userscript));
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
  assert.equal(calls.requests, 1);
  assert.equal(calls.styles, 2);
  assert.ok(calls.intervals >= 2);
  dom.window.close();
});

test("external tool route does not start game observers or market requests", () => {
  const { calls, dom, window } = createUserscriptWindow(
    "https://mooneycalc.netlify.app/",
  );
  assert.doesNotThrow(() => window.eval(userscript));
  assert.equal(calls.requests, 0);
  assert.equal(calls.styles, 0);
  assert.equal(calls.intervals, 1);
  dom.window.close();
});
