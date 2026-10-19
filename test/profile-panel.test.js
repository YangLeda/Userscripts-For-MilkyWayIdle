import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { waitForProfilePanel } from "../src/features/profile-panel.js";

function fixture(t) {
  const dom = new JSDOM("", { url: "https://www.milkywayidle.com" });
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  let now = 0;
  const timers = [];
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    timers.push({ callback, delay });
    return timers.length;
  });
  t.after(() => {
    globalThis.document = previous;
    dom.window.close();
  });
  return {
    document: dom.window.document,
    timers,
    tick() {
      const timer = timers.shift();
      if (!timer) return false;
      now += timer.delay;
      timer.callback();
      return true;
    },
  };
}

test("missing profile panels share one wait and stop polling after five seconds", async (t) => {
  const { timers, tick } = fixture(t);
  const pending = waitForProfilePanel();
  for (let i = 0; i < 1000; i++) assert.equal(waitForProfilePanel(), pending);
  let polls = 0;
  while (tick()) {
    assert.equal(timers.length <= 1, true);
    assert.ok(
      ++polls <= 50,
      "missing panels must not create an endless promise chain",
    );
  }
  assert.equal(await pending, null);
  assert.equal(timers.length, 0);
  const next = waitForProfilePanel();
  assert.notEqual(
    next,
    pending,
    "a later profile may start a fresh bounded wait",
  );
  while (tick()) {
    /* finish the second bounded attempt */
  }
  assert.equal(await next, null);
});

test("late profile panels resolve the shared wait and leave no recurring timer", async (t) => {
  const { document, timers, tick } = fixture(t);
  const first = waitForProfilePanel();
  const second = waitForProfilePanel();
  tick();
  const panel = document.createElement("div");
  panel.className = "SharableProfile_overviewTab__W4dCV";
  document.body.append(panel);
  tick();
  assert.equal(await first, panel);
  assert.equal(await second, panel);
  assert.equal(timers.length, 0);
  assert.equal(await waitForProfilePanel(), panel);
});
