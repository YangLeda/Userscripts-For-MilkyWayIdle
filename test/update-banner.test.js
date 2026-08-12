import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.window = dom.window;

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/features/update-banner.js");

const manifest = {
  importantVersion: "26.1",
  title: { zh: "重要更新", en: "Important update" },
  message: { zh: "请更新", en: "Please update" },
  url: "https://greasyfork.org/zh-CN/scripts/494467-mwitools",
};

test("version comparison distinguishes newer important releases", () => {
  assert.equal(runtime.api.compareVersions("26.0", "26.1"), -1);
  assert.equal(runtime.api.compareVersions("26.1", "26.1.0"), 0);
  assert.equal(runtime.api.compareVersions("26.2", "26.1"), 1);
  assert.equal(runtime.api.shouldShowImportantUpdate(manifest, "26.0"), true);
  assert.equal(runtime.api.shouldShowImportantUpdate(manifest, "26.1"), false);
});

test("important update banner links to Greasy Fork and remembers dismissal", () => {
  globalThis.GM_info = { script: { version: "26.0" } };
  assert.equal(runtime.api.renderImportantUpdateBanner(manifest), true);
  const banner = document.querySelector("#mwitools-important-update-banner");
  assert.equal(
    banner.querySelector("a").href,
    "https://greasyfork.org/zh-CN/scripts/494467-mwitools",
  );
  banner.querySelector("button").click();
  assert.equal(
    document.querySelector("#mwitools-important-update-banner"),
    null,
  );
  assert.equal(runtime.api.shouldShowImportantUpdate(manifest, "26.0"), false);
  delete globalThis.GM_info;
});
