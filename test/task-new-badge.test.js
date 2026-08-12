import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://test.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.location = dom.window.location;
globalThis.localStorage = dom.window.localStorage;

const {
  applyQuestUpdates,
  initializeQuestState,
  questId,
  readTaskNewState,
  taskNewStorageKey,
  writeTaskNewState,
} = await import("../src/features/task-new-badge.js");

test("task IDs normalize and newly received tasks persist by server and character", () => {
  assert.equal(questId({ characterQuestID: 12 }), "12");
  const keyA = taskNewStorageKey("one", "test.example");
  const keyB = taskNewStorageKey("two", "test.example");
  const state = { known: new Set(["baseline"]), fresh: new Set() };
  applyQuestUpdates(state, [
    { id: "baseline", currentCount: 1, targetCount: 10 },
    { id: "new-one", currentCount: 0, targetCount: 10 },
  ]);
  assert.deepEqual([...state.fresh], ["new-one"]);
  writeTaskNewState(keyA, state);
  assert.deepEqual([...readTaskNewState(keyA).fresh], ["new-one"]);
  assert.deepEqual([...readTaskNewState(keyB).fresh], []);
});

test("only the first snapshot is a baseline and later offline tasks stay new", () => {
  const state = {
    initialized: false,
    known: new Set(),
    fresh: new Set(),
  };
  initializeQuestState(state, [{ id: "existing" }]);
  assert.deepEqual([...state.fresh], []);
  initializeQuestState(state, [{ id: "existing" }, { questID: "offline-new" }]);
  assert.deepEqual([...state.fresh], ["offline-new"]);

  const key = taskNewStorageKey("offline", "test.example");
  writeTaskNewState(key, state);
  const restored = readTaskNewState(key);
  assert.equal(restored.initialized, true);
  assert.deepEqual([...restored.fresh], ["offline-new"]);
});

test("completed, claimed, and deleted tasks clear their new marker", () => {
  const state = {
    known: new Set(["done", "claimed", "deleted"]),
    fresh: new Set(["done", "claimed", "deleted"]),
  };
  applyQuestUpdates(state, [
    { id: "done", currentCount: 10, targetCount: 10 },
    { id: "claimed", isClaimed: true },
    { id: "deleted", deleted: true },
  ]);
  assert.equal(state.fresh.size, 0);
  assert.equal(state.known.size, 0);
});
