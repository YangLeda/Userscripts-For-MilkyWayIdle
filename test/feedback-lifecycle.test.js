import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { runtime } from "../src/core/runtime.js";

test("a feedback refresh finishing after cleanup cannot retain the old panel in a new polling timer", async () => {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "https://www.milkywayidle.com",
  });
  Object.assign(globalThis, {
    document: dom.window.document,
    window: dom.window,
    location: dom.window.location,
    localStorage: dom.window.localStorage,
    MutationObserver: dom.window.MutationObserver,
  });
  let initialize;
  const originalRegister = runtime.features.register;
  runtime.features.register = (definition) => {
    initialize = definition.initialize;
  };
  try {
    await import("../src/features/opinion-center/index.js");
  } finally {
    runtime.features.register = originalRegister;
  }
  const { OpinionCenterPanel } =
    await import("../src/features/opinion-center/panel.js");
  const originalRefresh = OpinionCenterPanel.prototype.refresh;
  let resolveRefresh;
  OpinionCenterPanel.prototype.refresh = () =>
    new Promise((resolve) => {
      resolveRefresh = resolve;
    });
  const timers = new Map(),
    originalTimeout = globalThis.setTimeout,
    originalClear = globalThis.clearTimeout;
  let nextTimer = 0;
  globalThis.setTimeout = (callback, delay) => {
    const id = ++nextTimer;
    timers.set(id, { callback, delay });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  const scope = runtime.createCleanupScope();
  try {
    initialize({ scope, characterId: "1" });
    const [id, timer] = [...timers].find(([, value]) => value.delay === 1500);
    timers.delete(id);
    const inFlight = timer.callback();
    assert.equal(typeof resolveRefresh, "function");
    scope.cleanup();
    resolveRefresh(true);
    await inFlight;
    assert.equal(timers.size, 0);
    assert.equal(document.getElementById("mwitools-feedback-root"), null);
  } finally {
    scope.cleanup();
    globalThis.setTimeout = originalTimeout;
    globalThis.clearTimeout = originalClear;
    OpinionCenterPanel.prototype.refresh = originalRefresh;
    dom.window.close();
  }
});

test("a late response cannot repopulate a destroyed panel or change a new character's launcher", async () => {
  const dom = new JSDOM(
    '<!doctype html><body><div class="Header_totalLevel__test"></div></body>',
    { url: "https://www.milkywayidle.com" },
  );
  Object.assign(globalThis, {
    document: dom.window.document,
    window: dom.window,
    location: dom.window.location,
    localStorage: dom.window.localStorage,
    MutationObserver: dom.window.MutationObserver,
  });
  const { OpinionCenterPanel } =
    await import("../src/features/opinion-center/panel.js");
  let resolve;
  const scope = runtime.createCleanupScope();
  const panel = new OpinionCenterPanel({
    scope,
    client: {
      list: () =>
        new Promise((done) => {
          resolve = done;
        }),
    },
  });
  panel.ensureButton();
  const pending = panel.open();
  scope.cleanup();
  const replacement = document.createElement("button");
  replacement.id = "mwitools-feedback-button";
  replacement.dataset.unread = "true";
  document.body.append(replacement);
  resolve({ items: [{ id: "old", unread: true }], quota: {} });
  await pending;
  assert.deepEqual(panel.items, []);
  assert.equal(replacement.dataset.unread, "true");
  assert.equal(panel.ensureButton(), null);
  panel.destroy();
  assert.equal(replacement.isConnected, true);
  dom.window.close();
});
