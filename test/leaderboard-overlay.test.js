import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  {
    url: "https://test.milkywayidle.com/",
  },
);
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.window = dom.window;
globalThis.unsafeWindow = dom.window;

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
const { badgeTier, compareRateRows, create, formatExperienceRate } =
  await import("../src/features/leaderboard-overlay.js");
await runtime.features.enable("leaderboardOverlay");

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

function rowNames() {
  return [...document.querySelectorAll("tbody tr")].map((row) =>
    row
      .querySelector('[class*="CharacterName_name"][data-name]')
      ?.getAttribute("data-name"),
  );
}

test("exports the standalone overlay API and formatting helpers", () => {
  assert.equal(dom.window.MWILeaderboardOverlay.VERSION, "1.1.0");
  assert.equal(dom.window.MWILeaderboardOverlay.create, create);
  assert.equal(badgeTier(1), "rainbow");
  assert.equal(badgeTier(35), "gold");
  assert.equal(badgeTier(70), "silver");
  assert.equal(badgeTier(100), "bronze");
  assert.equal(badgeTier(101), null);
  assert.equal(formatExperienceRate(12_340), "12.3K");
  assert.equal(formatExperienceRate(1_250_000), "1.3M");
  assert.equal(formatExperienceRate(null), "—");
  assert.ok(
    compareRateRows(
      { rank: 2, xpPerHour: 200 },
      { rank: 1, xpPerHour: 100 },
      "descending",
    ) < 0,
  );
});

test("renders top-100 ranking badges beside matching character names", async () => {
  document.body.innerHTML = `
    <div><span class="CharacterName_name__test" data-name="Alice">Alice</span></div>
    <div class="CharacterProfile_panel__test">
      <span class="CharacterName_name__test" data-name="Bob">Bob</span>
    </div>
    <div><span class="CharacterName_name__test" data-name="Outside">Outside</span></div>
    <div class="LeaderboardPanel_row__test">
      <span class="CharacterName_name__test" data-name="Alice">Alice</span>
    </div>`;
  const overlay = create({
    document,
    iconBaseUrl: "https://example.test/icons",
  });

  overlay.setRankings({
    milking: {
      receivedAt: "2026-08-11T00:00:00Z",
      rows: [
        { characterName: " Alice ", rank: 4 },
        { characterName: "Bob", rank: 51 },
        { characterName: "Outside", rank: 101 },
      ],
    },
    magic: { rows: [{ characterName: "ALICE", rank: 25 }] },
  });
  await settle();

  const alice = document.querySelector('[data-name="Alice"]');
  const aliceBadges = alice.parentElement.querySelector(
    "[data-mwi-leaderboard-badges]",
  );
  assert.deepEqual(
    [...aliceBadges.querySelectorAll(".mwi-lb-badge")].map(
      (badge) => badge.textContent,
    ),
    ["#4", "#25"],
  );
  assert.equal(
    aliceBadges.querySelector("img").src,
    "https://example.test/icons/milking.png",
  );
  const bobBadges = document
    .querySelector('[data-name="Bob"]')
    .parentElement.querySelector("[data-mwi-leaderboard-badges]");
  assert.equal(bobBadges.dataset.mwiLeaderboardPlacement, "profile");
  assert.equal(bobBadges.previousElementSibling.dataset.name, "Bob");
  assert.equal(
    document
      .querySelector('[data-name="Outside"]')
      .parentElement.querySelector("[data-mwi-leaderboard-badges]"),
    null,
  );
  assert.equal(
    document
      .querySelector(".LeaderboardPanel_row__test")
      .querySelector("[data-mwi-leaderboard-badges]"),
    null,
  );

  overlay.destroy();
  assert.equal(document.querySelector("[data-mwi-leaderboard-badges]"), null);
  assert.equal(document.getElementById("mwi-leaderboard-overlay-style"), null);
});

test("adds a sortable experience-rate column and restores official order", async () => {
  document.body.innerHTML = `
    <table class="LeaderboardPanel_leaderboardTable__test">
      <thead><tr><th>角色</th></tr></thead>
      <tbody>
        <tr><td><span class="CharacterName_name__test" data-name="Alice">Alice</span></td></tr>
        <tr><td><span class="CharacterName_name__test" data-name="Bob">Bob</span></td></tr>
        <tr><td><span class="CharacterName_name__test" data-name="Charlie">Charlie</span></td></tr>
      </tbody>
    </table>`;
  const overlay = create({ document });
  assert.equal(
    overlay.enhanceLeaderboard({
      category: "milking",
      rows: [
        { characterName: "Alice", rank: 1, xpPerHour: 100_000 },
        { characterName: "Bob", rank: 2, xpPerHour: 250_000 },
        { characterName: "Charlie", rank: 3, xpPerHour: null },
      ],
    }),
    true,
  );
  await settle();

  const header = document.querySelector("[data-mwi-leaderboard-rate-header]");
  assert.equal(header.textContent, "经验/小时");
  assert.deepEqual(
    [...document.querySelectorAll("[data-mwi-leaderboard-rate-cell]")].map(
      (cell) => cell.textContent,
    ),
    ["100K", "250K", "—"],
  );

  header.click();
  await settle();
  assert.deepEqual(rowNames(), ["Bob", "Alice", "Charlie"]);
  assert.equal(header.getAttribute("aria-sort"), "descending");

  header.click();
  await settle();
  assert.deepEqual(rowNames(), ["Alice", "Bob", "Charlie"]);
  assert.equal(header.getAttribute("aria-sort"), "ascending");

  header.click();
  await settle();
  assert.deepEqual(rowNames(), ["Alice", "Bob", "Charlie"]);
  assert.equal(header.getAttribute("aria-sort"), "none");

  overlay.destroy();
  assert.equal(
    document.querySelector("[data-mwi-leaderboard-rate-header]"),
    null,
  );
  assert.equal(
    document.querySelector("[data-mwi-leaderboard-rate-cell]"),
    null,
  );
  assert.deepEqual(rowNames(), ["Alice", "Bob", "Charlie"]);
});

test("the project setting removes and restores overlays", async () => {
  document.body.innerHTML = `
    <div><span class="CharacterName_name__test" data-name="Alice">Alice</span></div>`;
  const overlay = create({ document });
  overlay.setRankings({
    milking: { rows: [{ characterName: "Alice", rank: 8 }] },
  });
  await settle();
  assert.equal(overlay.enabled, true);
  assert.equal(document.querySelector(".mwi-lb-badge").textContent, "#8");

  await runtime.settings.set("leaderboardOverlay", false, { persist: false });
  await settle();
  assert.equal(dom.window.MWILeaderboardOverlay.enabled, false);
  assert.equal(document.querySelector(".mwi-lb-badge"), null);

  await runtime.settings.set("leaderboardOverlay", true, { persist: false });
  await settle();
  assert.equal(overlay.enabled, true);
  assert.equal(document.querySelector(".mwi-lb-badge").textContent, "#8");

  overlay.destroy();
});
