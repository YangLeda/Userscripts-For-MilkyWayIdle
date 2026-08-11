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
const {
  badgeTier,
  compareRateRows,
  create,
  formatExperienceRate,
  normalizeLeaderboardPayload,
} = await import("../src/features/leaderboard-overlay.js");
await runtime.features.enable("leaderboardOverlay");
await runtime.features.enable("leaderboardXpRate");

after(async () => {
  await runtime.features.disable("leaderboardOverlay");
  await runtime.features.disable("leaderboardXpRate");
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
  assert.equal(dom.window.MWILeaderboardOverlay.VERSION, "1.2.0");
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
    <svg><use href="/static/media/skills_sprite.current.svg#milking"></use></svg>
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
  const overlay = create({ document });

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
  // Skill badges reuse the game's own skills sprite; no remote PNG is loaded.
  assert.equal(aliceBadges.querySelector("img"), null);
  assert.equal(
    aliceBadges.querySelector("use").getAttribute("href"),
    "/static/media/skills_sprite.current.svg#magic",
  );
  const bobName = document.querySelector('[data-name="Bob"]');
  const bobBadges = document.querySelector(
    ".Header_name__test > [data-mwi-leaderboard-badges]",
  );
  assert.equal(bobBadges, null);
  assert.equal(
    bobName.parentElement.querySelector("[data-mwi-leaderboard-badges]"),
    null,
  );
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

test("renders fame with the game XP-buff icon and reads value1", async () => {
  document.body.innerHTML = `
    <svg><use href="/static/media/misc_sprite.current.svg#coins"></use></svg>
    <span class="CharacterName_name__test" data-name="Alice">Alice</span>`;
  const normalized = normalizeLeaderboardPayload({
    type: "leaderboard_updated",
    leaderboardType: "standard",
    leaderboardCategory: "fame_points",
    leaderboard: {
      type: "standard",
      category: "fame_points",
      rows: [{ id: 1, name: "Alice", rank: 8, value1: 987_654, value2: 0 }],
    },
  });
  assert.equal(normalized.rows[0].level, 0);
  assert.equal(normalized.rows[0].experience, 987_654);

  const overlay = create({ document });
  overlay.setRankings({ fame_points: { rows: normalized.rows } });
  await settle();
  const badge = document.querySelector(".mwi-lb-badge--rainbow");
  assert.equal(badge.textContent, "#8");
  assert.equal(
    badge.querySelector("use").getAttribute("href"),
    "/static/media/misc_sprite.current.svg#experience",
  );
  overlay.destroy();
});

test("chat names show only the three best-ranked badges", async () => {
  document.body.innerHTML = `
    <span class="ChatMessage_name__test">
      <span class="CharacterName_name__test" data-name="Alice">Alice</span>
    </span>
    <div>
      <span class="CharacterName_name__test" data-name="Alice">Alice</span>
    </div>`;
  const overlay = create({ document });
  overlay.setRankings({
    milking: { rows: [{ characterName: "Alice", rank: 25 }] },
    crafting: { rows: [{ characterName: "Alice", rank: 6 }] },
    attack: { rows: [{ characterName: "Alice", rank: 2 }] },
    magic: { rows: [{ characterName: "Alice", rank: 4 }] },
    fame_points: { rows: [{ characterName: "Alice", rank: 1 }] },
  });
  await settle();

  const containers = document.querySelectorAll("[data-mwi-leaderboard-badges]");
  assert.deepEqual(
    [...containers[0].querySelectorAll(".mwi-lb-badge")].map(
      (badge) => badge.textContent,
    ),
    ["#1", "#2", "#4"],
  );
  assert.deepEqual(
    [...containers[1].querySelectorAll(".mwi-lb-badge")].map(
      (badge) => badge.textContent,
    ),
    ["#1", "#2", "#4", "#6", "#25"],
  );
  overlay.destroy();
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

test("keeps the current character pinned while sorting every leaderboard mode", async () => {
  runtime.state.currentCharacterName = "Charlie";
  document.body.innerHTML = `
    <table class="LeaderboardPanel_leaderboardTable__test">
      <thead><tr><th>角色</th></tr></thead>
      <tbody>
        <tr><td><span class="CharacterName_name__test" data-name="Charlie">Charlie</span></td></tr>
        <tr><td><span class="CharacterName_name__test" data-name="Alice">Alice</span></td></tr>
        <tr><td><span class="CharacterName_name__test" data-name="Bob">Bob</span></td></tr>
      </tbody>
    </table>`;
  const overlay = create({ document });
  overlay.enhanceLeaderboard({
    category: "milking",
    rows: [
      { characterName: "Alice", rank: 1, xpPerHour: 100 },
      { characterName: "Bob", rank: 2, xpPerHour: 200 },
      { characterName: "Charlie", rank: 50, xpPerHour: 150 },
    ],
  });
  await settle();
  const header = document.querySelector("[data-mwi-leaderboard-rate-header]");

  assert.deepEqual(rowNames(), ["Charlie", "Alice", "Bob"]);
  header.click();
  await settle();
  assert.deepEqual(rowNames(), ["Charlie", "Bob", "Alice"]);
  header.click();
  await settle();
  assert.deepEqual(rowNames(), ["Charlie", "Alice", "Bob"]);
  header.click();
  await settle();
  assert.deepEqual(rowNames(), ["Charlie", "Alice", "Bob"]);

  overlay.destroy();
  runtime.state.currentCharacterName = "";
});

test("unsupported total-leaderboard tabs clear stale XP rates and sorting", async () => {
  document.body.innerHTML = `
    <table class="LeaderboardPanel_leaderboardTable__test">
      <thead><tr><th>角色</th></tr></thead>
      <tbody>
        <tr><td><span class="CharacterName_name__test" data-name="Alice">Alice</span></td></tr>
        <tr><td><span class="CharacterName_name__test" data-name="Bob">Bob</span></td></tr>
      </tbody>
    </table>`;
  const overlay = create({ document });
  overlay.enhanceLeaderboard({
    category: "milking",
    rows: [
      { characterName: "Alice", rank: 1, xpPerHour: 100 },
      { characterName: "Bob", rank: 2, xpPerHour: 200 },
    ],
  });
  await settle();
  document.querySelector("[data-mwi-leaderboard-rate-header]").click();
  await settle();
  assert.deepEqual(rowNames(), ["Bob", "Alice"]);

  overlay.clearLeaderboard();
  assert.equal(
    document.querySelector("[data-mwi-leaderboard-rate-header]"),
    null,
  );
  assert.equal(
    document.querySelector("[data-mwi-leaderboard-rate-cell]"),
    null,
  );
  assert.deepEqual(rowNames(), ["Alice", "Bob"]);
  overlay.destroy();
});

test("the feature anonymously loads, caches, and applies leaderboard data", async () => {
  await runtime.settings.set("leaderboardOverlay", false, { persist: false });
  await runtime.settings.set("leaderboardXpRate", false, { persist: false });
  localStorage.removeItem("MWITools_leaderboard_overlay_cache_v2");
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
  await runtime.settings.set("leaderboardXpRate", true, { persist: false });
  await settle();
  assert.equal(
    requestOptions.url.endsWith("/api/v1/leaderboards?categories=16"),
    true,
  );
  assert.equal(requestOptions.headers, undefined);
  assert.equal(document.querySelector(".mwi-lb-badge").textContent, "#7");
  assert.ok(localStorage.getItem("MWITools_leaderboard_overlay_cache_v2"));

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

  runtime.dispatchMessage({
    type: "leaderboard_updated",
    leaderboardType: "standard",
    leaderboardCategory: "task_points",
    leaderboard: {
      type: "standard",
      category: "task_points",
      rows: [{ id: 2, name: "Bob", rank: 1, value1: 999 }],
    },
  });
  await settle();
  assert.equal(
    document.querySelector("[data-mwi-leaderboard-rate-cell]"),
    null,
  );
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

  await runtime.settings.set("leaderboardOverlay", false, { persist: false });
  assert.equal(document.querySelector(".mwi-lb-badge"), null);
  assert.ok(document.querySelector("[data-mwi-leaderboard-rate-cell]"));
  await runtime.settings.set("leaderboardOverlay", true, { persist: false });
  await runtime.settings.set("leaderboardXpRate", false, { persist: false });
  await settle();
  assert.ok(document.querySelector(".mwi-lb-badge"));
  assert.equal(
    document.querySelector("[data-mwi-leaderboard-rate-cell]"),
    null,
  );

  await runtime.settings.set("leaderboardOverlay", false, { persist: false });
  leaderboardRequest = (options) => {
    globalThis.queueMicrotask(() => options.onerror?.());
    return { abort() {} };
  };
  await runtime.settings.set("leaderboardOverlay", true, { persist: false });
  await settle();
  assert.equal(document.querySelector(".mwi-lb-badge").textContent, "#7");
  await runtime.settings.set("leaderboardXpRate", true, { persist: false });
});

test("leaderboard copy follows the MWITools language", async () => {
  await runtime.settings.set("leaderboardOverlay", false, { persist: false });
  await runtime.settings.set("leaderboardXpRate", false, { persist: false });
  localStorage.removeItem("MWITools_leaderboard_overlay_cache_v2");
  runtime.config.isZH = false;
  await runtime.settings.set("leaderboardOverlay", true, { persist: false });
  document.body.innerHTML = `
    <div><span class="CharacterName_name__test" data-name="Alice">Alice</span></div>`;
  const overlay = create({ document });
  overlay.setRankings({
    milking: {
      receivedAt: "2026-08-11T12:34:56.000Z",
      rows: [{ characterName: "Alice", rank: 3 }],
    },
  });
  await settle();
  assert.match(document.querySelector(".mwi-lb-badge").title, /Milking/);
  assert.match(document.querySelector(".mwi-lb-badge").title, /rank #3/);
  assert.doesNotMatch(
    document.querySelector(".mwi-lb-badge").title,
    /\d{4}-\d{2}-\d{2}/,
  );
  overlay.destroy();
  await runtime.settings.set("leaderboardOverlay", false, { persist: false });
  runtime.config.isZH = true;
});
