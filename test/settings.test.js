import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.window = dom.window;

localStorage.setItem(
  "script_settingsMap",
  JSON.stringify({
    legacyOrange: { id: "useOrangeAsMainColor", isTrue: true },
    legacyChinese: { id: "forceMWIToolsDisplayZH", isTrue: true },
    removedOption: { id: "removed_option", isTrue: true },
  }),
);

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/features/settings-and-notifications.js");

test("legacy settings merge into current defaults", () => {
  assert.doesNotThrow(() => runtime.api.readSettings());
  assert.equal(runtime.settings.settingsMap.useOrangeAsMainColor.isTrue, true);
  assert.equal(
    runtime.settings.settingsMap.forceMWIToolsDisplayZH.isTrue,
    true,
  );
  assert.equal(runtime.config.isZH, true);
  assert.equal(runtime.config.SCRIPT_COLOR_MAIN, "orange");
  assert.equal(runtime.config.SCRIPT_COLOR_TOOLTIP, "#804600");
  assert.equal(runtime.settings.settingsMap.totalActionTime.isTrue, true);
});
