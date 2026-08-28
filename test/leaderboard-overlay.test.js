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
after(async () => {
  await runtime.features.disable("leaderboardOverlay");
  await runtime.features.disable("leaderboardXpRate");
});

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

async function waitFor(getValue, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = getValue();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for leaderboard overlay state");
}

function rowNames() {
  return [...document.querySelectorAll("tbody tr")].map((row) =>
    row
      .querySelector('[class*="CharacterName_name"][data-name]')
      ?.getAttribute("data-name"),
  );
}

test("exports the standalone overlay API and formatting helpers", () => {
  assert.equal(dom.window.MWILeaderboardOverlay.VERSION, "1.4.1");
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
    <div class="SettingsPanel_nameColor__test">
      <div class="CharacterName_characterName__test">
        <span class="CharacterName_name__test" data-name="Cara">Cara</span>
      </div>
    </div>
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
    crafting: { rows: [{ characterName: "Cara", rank: 14 }] },
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
    ["4", "25"],
  );
  assert.equal(
    aliceBadges.querySelector("img").src,
    "https://example.test/icons/magic.png",
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
  const settingsBadges = document.querySelector(
    ".SettingsPanel_nameColor__test [data-mwi-leaderboard-badges]",
  );
  assert.equal(settingsBadges.textContent, "14");
  assert.equal(settingsBadges.dataset.mwiLeaderboardPlacement, "settings");
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

test("places guild badges below names and friend badges beside names", async () => {
  document.body.innerHTML = `
    <svg><use href="/static/media/skills_sprite.current.svg#milking"></use></svg>
    <div class="GuildPanel_characterName__test">
      <div>
        <span>
          <div class="CharacterName_characterName__test">
            <span class="CharacterName_name__test" data-name="LongGuildName">LongGuildName</span>
          </div>
        </span>
      </div>
    </div>
    <div class="SocialPanel_characterName__test">
      <div>
        <span>
          <div class="CharacterName_characterName__test">
            <span class="CharacterName_name__test" data-name="LongGuildName">LongGuildName</span>
          </div>
        </span>
      </div>
    </div>`;
  const overlay = create({ document });
  overlay.setRankings({
    milking: { rows: [{ characterName: "LongGuildName", rank: 6 }] },
    crafting: { rows: [{ characterName: "LongGuildName", rank: 7 }] },
    cooking: { rows: [{ characterName: "LongGuildName", rank: 14 }] },
    magic: { rows: [{ characterName: "LongGuildName", rank: 18 }] },
  });
  await settle();

  const guildBlock = document.querySelector(".GuildPanel_characterName__test");
  const guildBadges = guildBlock.querySelector(
    ":scope > [data-mwi-leaderboard-badges]",
  );
  assert.ok(guildBadges);
  assert.equal(guildBadges.dataset.mwiLeaderboardPlacement, "list");
  assert.equal(
    guildBadges.previousElementSibling,
    guildBlock.firstElementChild,
  );
  assert.equal(
    guildBlock.querySelector(
      ".CharacterName_characterName__test > [data-mwi-leaderboard-badges]",
    ),
    null,
  );

  const friendName = document.querySelector(
    ".SocialPanel_characterName__test .CharacterName_characterName__test",
  );
  const friendBadges = friendName.querySelector(
    ":scope > [data-mwi-leaderboard-badges]",
  );
  assert.ok(friendBadges);
  assert.equal(friendBadges.dataset.mwiLeaderboardPlacement, "friend");
  assert.equal(
    friendBadges.previousElementSibling.dataset.name,
    "LongGuildName",
  );
  assert.equal(
    document.querySelector(
      ".SocialPanel_characterName__test > [data-mwi-leaderboard-badges]",
    ),
    null,
  );

  for (const badges of [guildBadges, friendBadges]) {
    assert.deepEqual(
      [...badges.querySelectorAll(".mwi-lb-badge")].map(
        (badge) => badge.textContent,
      ),
      ["6", "7", "14"],
    );
  }
  assert.match(
    document.getElementById("mwi-leaderboard-overlay-style").textContent,
    /placement="list"[^}]*justify-content:center/,
  );

  overlay.destroy();
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
  assert.equal(badge.textContent, "8");
  assert.equal(
    badge.querySelector("use").getAttribute("href"),
    "/static/media/misc_sprite.current.svg#experience",
  );
  overlay.destroy();
});

test("Iron Cow badges reuse standard styling and identify their leaderboard", async () => {
  document.body.innerHTML = `
    <svg><use href="/static/media/skills_sprite.current.svg#foraging"></use></svg>
    <span class="CharacterName_name__test" data-name="IronAlice">IronAlice</span>`;
  const overlay = create({ document });
  overlay.setRankings({
    standard: {},
    ironcow: {
      total_level: {
        rows: [{ characterName: "IronAlice", rank: 12 }],
      },
    },
  });
  await settle();
  const badge = document.querySelector(".mwi-lb-badge--rainbow");
  assert.equal(badge.textContent, "12");
  assert.match(badge.title, /铁牛排行榜/);
  overlay.destroy();
});

test("default ranking badges use the game's native skill sprite", async () => {
  document.body.innerHTML = `
    <svg><use href="/static/media/skills_sprite.current.svg#foraging"></use></svg>
    <span class="CharacterName_name__test" data-name="Alice">Alice</span>`;
  const querySelectorAll = document.querySelectorAll.bind(document);
  let directUseScans = 0;
  document.querySelectorAll = (selector) => {
    if (selector === "use") directUseScans += 1;
    return querySelectorAll(selector);
  };
  try {
    const overlay = create({ document });
    overlay.setRankings({
      milking: { rows: [{ characterName: "Alice", rank: 12 }] },
    });
    await settle();
    const badge = document.querySelector(".mwi-lb-badge--rainbow");
    assert.equal(badge.querySelector("img"), null);
    assert.equal(
      badge.querySelector("use").getAttribute("href"),
      "/static/media/skills_sprite.current.svg#milking",
    );
    assert.equal(directUseScans, 0);
    overlay.destroy();
  } finally {
    document.querySelectorAll = querySelectorAll;
  }
});

test("unrelated DOM mutations do not rescan character names", async () => {
  document.body.innerHTML = `
    <span class="CharacterName_name__test" data-name="Alice">Alice</span>`;
  const querySelectorAll = document.querySelectorAll.bind(document);
  let nameScans = 0;
  document.querySelectorAll = (selector) => {
    if (selector === '[class*="CharacterName_name"][data-name]') nameScans += 1;
    return querySelectorAll(selector);
  };
  try {
    const overlay = create({ document });
    overlay.setRankings({
      milking: { rows: [{ characterName: "Alice", rank: 4 }] },
    });
    await settle();
    const settledScans = nameScans;
    const unrelated = document.createElement("div");
    unrelated.className = "ActionProgress_animation__test";
    document.body.append(unrelated);
    await settle();
    assert.equal(nameScans, settledScans);

    const host = document.createElement("div");
    host.innerHTML =
      '<span class="CharacterName_name__test" data-name="Alice">Alice</span>';
    document.body.append(host);
    await settle();
    assert.ok(nameScans > settledScans);
    assert.ok(host.querySelector(".mwi-lb-badge"));
    overlay.destroy();
  } finally {
    document.querySelectorAll = querySelectorAll;
  }
});

test("new aggregate rankings use the matching native game icons", async () => {
  document.body.innerHTML = `
    <svg><use href="/static/media/misc_sprite.current.svg#coins"></use></svg>
    <svg><use href="/static/media/skills_sprite.current.svg#foraging"></use></svg>
    <span class="CharacterName_name__test" data-name="Alice">Alice</span>`;
  const overlay = create({ document });
  overlay.setRankings({
    total_level: { rows: [{ characterName: "Alice", rank: 1 }] },
    labyrinth_depth: { rows: [{ characterName: "Alice", rank: 2 }] },
    task_points: { rows: [{ characterName: "Alice", rank: 3 }] },
    stamina: { rows: [{ characterName: "Alice", rank: 4 }] },
    intelligence: { rows: [{ characterName: "Alice", rank: 5 }] },
  });
  await settle();

  assert.deepEqual(
    [...document.querySelectorAll(".mwi-lb-badge use")].map((use) =>
      use.getAttribute("href"),
    ),
    [
      "/static/media/misc_sprite.current.svg#leaderboard",
      "/static/media/misc_sprite.current.svg#labyrinth",
      "/static/media/misc_sprite.current.svg#tasks",
    ],
  );
  overlay.destroy();
});

test("all non-profile names show only the three best-ranked badges", async () => {
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
    ["1", "2", "4"],
  );
  assert.deepEqual(
    [...containers[1].querySelectorAll(".mwi-lb-badge")].map(
      (badge) => badge.textContent,
    ),
    ["1", "2", "4"],
  );
  overlay.destroy();
});

test("profile names show every badge on an independent second row", async () => {
  document.body.innerHTML = `
    <section class="CharacterProfile_panel__test" data-mwi-leaderboard-profile>
      <div class="Profile_nameRow__test">
        <div class="CharacterName_characterName__test">
          <span class="CharacterName_name__test" data-name="Alice">Alice</span>
        </div>
      </div>
    </section>`;
  const overlay = create({ document });
  overlay.setRankings({
    total_level: { rows: [{ characterName: "Alice", rank: 1 }] },
    task_points: { rows: [{ characterName: "Alice", rank: 2 }] },
    stamina: { rows: [{ characterName: "Alice", rank: 3 }] },
    intelligence: { rows: [{ characterName: "Alice", rank: 4 }] },
    labyrinth_depth: { rows: [{ characterName: "Alice", rank: 5 }] },
  });
  await settle();

  const nameRow = document.querySelector(".Profile_nameRow__test");
  const badges = nameRow.querySelector(
    ":scope > [data-mwi-leaderboard-badges]",
  );
  assert.ok(badges);
  assert.equal(badges.dataset.mwiLeaderboardPlacement, "profile");
  assert.equal(
    badges.previousElementSibling,
    nameRow.querySelector(".CharacterName_characterName__test"),
  );
  assert.deepEqual(
    [...badges.querySelectorAll(".mwi-lb-badge")].map(
      (badge) => badge.textContent,
    ),
    ["1", "2", "3", "4", "5"],
  );
  overlay.destroy();
});

test("top-five rainbow badges sweep for one second, glint for one, then pause", async () => {
  document.body.innerHTML = `
    <span class="CharacterName_name__test" data-name="Alice">Alice</span>`;
  const overlay = create({ document, showEffects: true });
  overlay.setRankings({
    total_level: { rows: [{ characterName: "Alice", rank: 5 }] },
    stamina: { rows: [{ characterName: "Alice", rank: 6 }] },
  });
  await settle();

  const badges = document.querySelectorAll(".mwi-lb-badge");
  assert.equal(badges[0].classList.contains("mwi-lb-badge--top-five"), true);
  assert.equal(badges[1].classList.contains("mwi-lb-badge--top-five"), false);
  const styles = document.getElementById(
    "mwi-leaderboard-overlay-style",
  ).textContent;
  assert.match(styles, /::before[^}]*mwi-lb-badge-light-sweep 5s/);
  assert.match(styles, /::after[^}]*mwi-lb-badge-corner-glint 5s/);
  assert.match(styles, /18%\{left:128%;opacity:\.96\}20%,100%/);
  assert.match(styles, /0%,20%,40%,100%\{opacity:0/);
  assert.match(styles, /30%\{opacity:1;transform:scale\(1\.15\)\}/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  overlay.destroy();
});

test("standalone top-five badge effects default to off and can be toggled", async () => {
  const isolatedDom = new JSDOM(
    `<span class="CharacterName_name__test" data-name="Alice">Alice</span>`,
    { url: "https://test.milkywayidle.com/" },
  );
  const isolatedDocument = isolatedDom.window.document;
  const overlay = create({ document: isolatedDocument });
  try {
    overlay.setRankings({
      total_level: { rows: [{ characterName: "Alice", rank: 1 }] },
    });
    const badge = await waitFor(() =>
      isolatedDocument.querySelector(".mwi-lb-badge"),
    );
    assert.equal(badge.classList.contains("mwi-lb-badge--top-five"), false);

    overlay.setDisplay({ effects: true });
    await waitFor(() =>
      isolatedDocument.querySelector(".mwi-lb-badge.mwi-lb-badge--top-five"),
    );
  } finally {
    overlay.destroy();
    isolatedDom.window.close();
  }
});

test("adds a read-only experience-rate column without changing row order", async () => {
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
  assert.equal(header.getAttribute("aria-sort"), null);
  assert.equal(header.title, "");
  assert.equal(header.tabIndex, -1);
  assert.deepEqual(
    [...document.querySelectorAll("[data-mwi-leaderboard-rate-cell]")].map(
      (cell) => cell.textContent,
    ),
    ["—", "100K", "250K"],
  );
  assert.deepEqual(rowNames(), ["Charlie", "Alice", "Bob"]);

  header.click();
  header.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Enter" }),
  );
  await settle();
  assert.deepEqual(rowNames(), ["Charlie", "Alice", "Bob"]);

  overlay.enhanceLeaderboard({
    category: "magic",
    rows: [
      { characterName: "Alice", rank: 1, xpPerHour: 300_000 },
      { characterName: "Bob", rank: 2, xpPerHour: 50_000 },
      { characterName: "Charlie", rank: 50, xpPerHour: 200_000 },
    ],
  });
  await settle();
  assert.deepEqual(rowNames(), ["Charlie", "Alice", "Bob"]);
  assert.deepEqual(
    [...document.querySelectorAll("[data-mwi-leaderboard-rate-cell]")].map(
      (cell) => cell.textContent,
    ),
    ["200K", "300K", "50K"],
  );

  overlay.clearLeaderboard();
  assert.deepEqual(rowNames(), ["Charlie", "Alice", "Bob"]);
  assert.equal(
    document.querySelector("[data-mwi-leaderboard-rate-header]"),
    null,
  );

  overlay.destroy();
  assert.deepEqual(rowNames(), ["Charlie", "Alice", "Bob"]);
  runtime.state.currentCharacterName = "";
});

test("aggregate leaderboard tabs clear stale XP rates without moving rows", async () => {
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
  assert.deepEqual(rowNames(), ["Alice", "Bob"]);

  for (const category of ["total_level", "task_points", "labyrinth_depth"]) {
    assert.equal(
      overlay.enhanceLeaderboard({
        category,
        rows: [{ characterName: "Alice", rank: 1, xpPerHour: 999 }],
      }),
      false,
    );
    assert.equal(
      document.querySelector("[data-mwi-leaderboard-rate-header]"),
      null,
    );
    assert.equal(
      document.querySelector("[data-mwi-leaderboard-rate-cell]"),
      null,
    );
    assert.deepEqual(rowNames(), ["Alice", "Bob"]);
  }
  overlay.destroy();
});

test("the feature anonymously loads, caches, and applies leaderboard data", async () => {
  await runtime.settings.set("leaderboardOverlay", false, { persist: false });
  await runtime.settings.set("leaderboardXpRate", false, { persist: false });
  localStorage.removeItem("MWITools_leaderboard_overlay_cache_v3");
  localStorage.removeItem("MWITools_leaderboard_overlay_cache_v2");
  document.body.innerHTML = `
    <div><span class="CharacterName_name__test" data-name="Alice">Alice</span></div>
    <table class="LeaderboardPanel_leaderboardTable__test">
      <thead><tr><th>Character</th></tr></thead>
      <tbody><tr><td><span class="CharacterName_name__test" data-name="Alice">Alice</span></td></tr></tbody>
    </table>`;
  const requestOptions = [];
  leaderboardRequest = (options) => {
    requestOptions.push(options);
    const leaderboardType = new URL(options.url).searchParams.get(
      "leaderboardType",
    );
    globalThis.queueMicrotask(() =>
      options.onload({
        status: 200,
        responseText: JSON.stringify({
          schemaVersion: 1,
          leaderboardType,
          categories: {
            milking: {
              receivedAt: "2026-08-11T00:00:00Z",
              rows: [
                {
                  characterId: leaderboardType === "ironcow" ? 2 : 1,
                  characterName:
                    leaderboardType === "ironcow" ? "IronAlice" : "Alice",
                  rank: leaderboardType === "ironcow" ? 8 : 7,
                  xpPerHour: leaderboardType === "ironcow" ? 8_000 : 123_400,
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
  assert.deepEqual(
    requestOptions.map((options) =>
      new URL(options.url).searchParams.get("leaderboardType"),
    ),
    ["standard", "ironcow"],
  );
  assert.equal(
    requestOptions.every((options) => !options.headers),
    true,
  );
  assert.equal(document.querySelector(".mwi-lb-badge").textContent, "7");
  const cached = JSON.parse(
    localStorage.getItem("MWITools_leaderboard_overlay_cache_v3"),
  );
  assert.equal(cached.schemaVersion, 2);
  assert.equal(cached.leaderboards.standard.milking.rows[0].rank, 7);
  assert.equal(cached.leaderboards.ironcow.milking.rows[0].rank, 8);

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
  assert.equal(document.querySelector(".mwi-lb-badge").textContent, "7");
  await runtime.settings.set("leaderboardXpRate", true, { persist: false });
});

test("leaderboard copy follows the MWITools language", async () => {
  await runtime.settings.set("leaderboardOverlay", false, { persist: false });
  await runtime.settings.set("leaderboardXpRate", false, { persist: false });
  localStorage.removeItem("MWITools_leaderboard_overlay_cache_v2");
  runtime.config.isZH = false;
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
  assert.match(document.querySelector(".mwi-lb-badge").title, /rank 3/);
  assert.doesNotMatch(
    document.querySelector(".mwi-lb-badge").title,
    /\d{4}-\d{2}-\d{2}/,
  );
  overlay.destroy();
  await runtime.settings.set("leaderboardOverlay", false, { persist: false });
  runtime.config.isZH = true;
});
