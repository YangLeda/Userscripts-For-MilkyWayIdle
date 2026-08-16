import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://test.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.unsafeWindow = dom.window;

const { runtime } = await import("../src/core/runtime.js");

let snapshotListener = null;
let latestSnapshot = null;
runtime.api.onAssetSnapshot = (listener) => {
  snapshotListener = listener;
  return () => {
    snapshotListener = null;
  };
};
runtime.api.getLatestAssetSnapshot = () => latestSnapshot;
runtime.api.refreshAssetSnapshot = async () => {
  snapshotListener?.(latestSnapshot);
  return latestSnapshot;
};

await import("../src/features/public-api.js");

function scoreSnapshot(overrides = {}) {
  return {
    recordedAt: "2026-08-10T09:00:00.000Z",
    server: "test",
    characterId: "11923",
    scores: {
      battle: {
        total: 123,
        house: 10,
        abilities: 20,
        equipment: 90,
        shrine: 3,
      },
      skilling: {
        total: 67,
        house: 5,
        tools: 30,
        equipment: 28,
        shrine: 4,
        available: true,
      },
    },
    ...overrides,
  };
}

test("public API exposes copied score snapshots and update events", () => {
  const api = dom.window.MWIToolsAPI;
  assert.equal(api.apiVersion, 1);
  assert.equal(api.scores, null);

  let eventDetail = null;
  dom.window.addEventListener(api.events.scoresUpdated, (event) => {
    eventDetail = event.detail;
  });
  latestSnapshot = scoreSnapshot();
  snapshotListener(latestSnapshot);

  const scores = api.getScores();
  assert.equal(scores.schemaVersion, 2);
  assert.equal(scores.unit, "million_coins");
  assert.equal(scores.battle.total, 123);
  assert.equal(scores.battle.shrine, 3);
  assert.equal(scores.skilling.total, 67);
  assert.equal(scores.skilling.shrine, 4);
  assert.equal(eventDetail.characterId, "11923");

  scores.battle.total = -1;
  assert.equal(api.scores.battle.total, 123);
});

test("public API can request the first or a refreshed calculation", async () => {
  latestSnapshot = scoreSnapshot({
    recordedAt: "2026-08-10T09:01:00.000Z",
    scores: {
      battle: {
        total: 200,
        house: 20,
        abilities: 30,
        equipment: 140,
        shrine: 10,
      },
      skilling: {
        total: 80,
        house: 10,
        tools: 30,
        equipment: 35,
        shrine: null,
        available: true,
      },
    },
  });

  const scores = await dom.window.MWIToolsAPI.refreshScores();
  assert.equal(scores.battle.total, 200);
  assert.equal(scores.battle.shrine, 10);
  assert.equal(scores.skilling.total, 80);
  assert.equal(scores.skilling.shrine, null);
});
