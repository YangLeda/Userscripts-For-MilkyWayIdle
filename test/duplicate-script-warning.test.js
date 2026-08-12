import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.unsafeWindow = dom.window;
globalThis.localStorage = dom.window.localStorage;

const { detectDuplicateScripts, showDuplicateWarning } =
  await import("../src/features/duplicate-script-warning.js");

test("detects only active standalone integrations", () => {
  const target = {
    MWIMM: { ready: true },
    kbd_calculateTotalNetworth() {},
  };
  assert.deepEqual(
    detectDuplicateScripts({
      pageWindow: target,
      documentRef: document,
      dpsWasPresent: true,
    }),
    [
      "MWI 市场伴侣 / MWI Market Mate",
      "银河奶牛 DPS 统计 / Galaxy Cow DPS",
      "Everyday Profit Plus Fixed",
    ],
  );
  assert.deepEqual(
    detectDuplicateScripts({
      pageWindow: {},
      documentRef: document,
      dpsWasPresent: false,
    }),
    [],
  );
});

test("warning is bilingual and remains until manually closed", () => {
  let scheduled = false;
  const warning = showDuplicateWarning(["Everyday Profit Plus Fixed"], {
    documentRef: document,
    isZH: true,
    schedule: () => {
      scheduled = true;
    },
  });
  assert.equal(scheduled, false);
  assert.match(warning.textContent, /建议在脚本管理器中停用或删除/);
  warning.querySelector("button").click();
  assert.equal(document.getElementById(warning.id), null);

  const capped = showDuplicateWarning(["MWI Market Mate"], {
    documentRef: document,
    isZH: false,
  });
  assert.match(capped.textContent, /Disable or remove/);
  capped.remove();
});

test("detects the current Everyday Profit Plus Fixed DOM markers", () => {
  const chart = document.createElement("script");
  chart.id = "everyday-profit-chartjs";
  document.body.appendChild(chart);
  assert.deepEqual(
    detectDuplicateScripts({
      pageWindow: {},
      documentRef: document,
      dpsWasPresent: false,
    }),
    ["Everyday Profit Plus Fixed"],
  );
  chart.remove();
});
