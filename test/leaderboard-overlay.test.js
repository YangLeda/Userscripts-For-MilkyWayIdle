import assert from "node:assert/strict";
import test, { after } from "node:test";

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
let leaderboardRequest = (options) => {
  globalThis.queueMicrotask(() => options.onerror?.());
  return { abort() {} };
};
globalThis.GM = {
  xmlHttpRequest(options) {
    return leaderboardRequest(options);
  },
};

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
runtime.config.isZH = true;
const { badgeTier, compareRateRows, create, formatExperienceRate } =
  await import("../src/features/leaderboard-overlay.js");
await runtime.features.enable("leaderboardOverlay");

after(async () => {
  await runtime.features.disable("leaderboardOverlay");
});

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
    <div class="Header_characterInfo__test">
      <div class="Header_info__test">
        <div class="Header_name__test">
          <div class="CharacterName_characterName__test">
            <span class="CharacterName_name__test" data-name="Bob">Bob</span>
          </div>
        </div>
      </div>
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
        { characterName: " Alice ", rank: 25 },
        { characterName: "Bob", rank: 51 },
        { characterName: "Outside", rank: 101 },
      ],
    },
    magic: { rows: [{ characterName: "ALICE", rank: 4 }] },
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
    "https://example.test/icons/magic.png",
  );
  const bobName = document.querySelector('[data-name="Bob"]');
  const bobBadges = document.querySelector(
    ".Header_name__test > [data-mwi-leaderboard-badges]",
  );
  assert.equal(bobBadges.dataset.mwiLeaderboardPlacement, "profile");
  assert.equal(bobBadges.previousElementSibling, bobName.parentElement);
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

test("the feature anonymously loads, caches, and applies leaderboard data", async () => {
  await runtime.settings.set("leaderboardOverlay", false, { persist: false });
  localStorage.removeItem("MWITools_leaderboard_overlay_cache_v1");
  document.body.innerHTML = `
    <div><span class="CharacterName_name__test" data-name="Alice">Alice</span></div>
    <table class="LeaderboardPanel_leaderboardTable__test">
      <thead><tr><th>Character</th></tr></thead>
      <tbody><tr><td><span class="CharacterName_name__test" data-name="Alice">Alice</span></td></tr></tbody>
    </table>`;
  let requestOptions = null;
  leaderboardRequest = (options) => {
    requestOptions = options;
    globalThis.queueMicrotask(() =>
      options.onload({
        status: 200,
        responseText: JSON.stringify({
          schemaVersion: 1,
          leaderboardType: "standard",
          categories: {
            milking: {
              receivedAt: "2026-08-11T00:00:00Z",
              rows: [
                {
                  characterId: 1,
                  characterName: "Alice",
                  rank: 7,
                  xpPerHour: 123_400,
                },
              ],
            },
          },
        }),
      }),
    );
    return { abort() {} };
  };
  await runtime.settings.set("leaderboardOverlay", true, { persist: false });
  await settle();
  assert.equal(requestOptions.url.endsWith("/api/v1/leaderboards"), true);
  assert.equal(requestOptions.headers, undefined);
  assert.equal(document.querySelector(".mwi-lb-badge").textContent, "#7");
  assert.ok(localStorage.getItem("MWITools_leaderboard_overlay_cache_v1"));

  runtime.dispatchMessage({
    type: "leaderboard_updated",
    leaderboardType: "standard",
    leaderboardCategory: "milking",
    leaderboard: {
      type: "standard",
      category: "milking",
      rows: [{ id: 1, name: "Alice", rank: 7, value1: 100, value2: 1000 }],
    },
  });
  await settle();
  assert.equal(
    document.querySelector("[data-mwi-leaderboard-rate-cell]").textContent,
    "123.4K",
  );

  await runtime.settings.set("leaderboardOverlay", false, { persist: false });
  assert.equal(document.querySelector(".mwi-lb-badge"), null);
  leaderboardRequest = (options) => {
    globalThis.queueMicrotask(() => options.onerror?.());
    return { abort() {} };
  };
  await runtime.settings.set("leaderboardOverlay", true, { persist: false });
  await settle();
  assert.equal(document.querySelector(".mwi-lb-badge").textContent, "#7");
});

test("leaderboard copy follows the MWITools language", async () => {
  await runtime.settings.set("leaderboardOverlay", false, { persist: false });
  runtime.config.isZH = false;
  await runtime.settings.set("leaderboardOverlay", true, { persist: false });
  document.body.innerHTML = `
    <div><span class="CharacterName_name__test" data-name="Alice">Alice</span></div>`;
  const overlay = create({ document });
  overlay.setRankings({
    milking: { rows: [{ characterName: "Alice", rank: 3 }] },
  });
  await settle();
  assert.match(document.querySelector(".mwi-lb-badge").title, /Milking/);
  assert.match(document.querySelector(".mwi-lb-badge").title, /rank #3/);
  overlay.destroy();
  await runtime.settings.set("leaderboardOverlay", false, { persist: false });
  runtime.config.isZH = true;
  await runtime.settings.set("leaderboardOverlay", true, { persist: false });
});
