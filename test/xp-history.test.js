import assert from "node:assert/strict";
import test from "node:test";

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/xp-history.js");

test("XP rates enforce five-minute and coverage thresholds", () => {
  const hour = 60 * 60 * 1000;
  const now = 10 * 24 * hour;
  const short = runtime.api.calculateXpRates(
    [
      { at: now - 4 * 60 * 1000, xp: 100 },
      { at: now, xp: 200 },
    ],
    now,
  );
  assert.equal(short.recent, null);

  const covered = runtime.api.calculateXpRates(
    [
      { at: now - 13 * hour, xp: 1_000 },
      { at: now - hour, xp: 2_200 },
      { at: now - 30 * 60 * 1000, xp: 2_250 },
      { at: now, xp: 2_300 },
    ],
    now,
  );
  assert.equal(Math.round(covered.recent), 100);
  assert.equal(Math.round(covered.hour), 100);
  assert.equal(Math.round(covered.day), 100);
});

test("old XP samples are retained hourly while recent samples stay detailed", () => {
  const hour = 60 * 60 * 1000;
  const now = 40 * 24 * hour;
  const records = [
    { at: now - 31 * 24 * hour, xp: 1 },
    { at: now - 2 * 24 * hour, xp: 10 },
    { at: now - 2 * 24 * hour + 10, xp: 11 },
    { at: now - hour, xp: 20 },
    { at: now - hour + 10, xp: 21 },
  ];
  const compacted = runtime.api.compactXpHistory(records, now);
  assert.deepEqual(
    compacted.map(({ xp }) => xp),
    [11, 20, 21],
  );
});
