import assert from "node:assert/strict";
import test from "node:test";

import { createFrameScheduler } from "../src/core/frame-scheduler.js";

test("frame scheduler coalesces repeated work and becomes inert after cleanup", () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const frames = new Map();
  let nextId = 1;
  globalThis.requestAnimationFrame = (callback) => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  try {
    let calls = 0;
    const scheduler = createFrameScheduler(() => {
      calls += 1;
    });
    assert.equal(scheduler.schedule(), true);
    assert.equal(scheduler.schedule(), false);
    assert.equal(frames.size, 1);
    const callback = frames.values().next().value;
    frames.clear();
    callback();
    assert.equal(calls, 1);

    scheduler.schedule();
    const staleCallback = frames.values().next().value;
    scheduler.cancel();
    assert.equal(frames.size, 0);
    staleCallback();
    assert.equal(calls, 1);
    assert.equal(scheduler.schedule(), false);
  } finally {
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});
