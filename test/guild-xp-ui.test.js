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
globalThis.location = dom.window.location;
globalThis.window = dom.window;

const { runtime } = await import("../src/core/runtime.js");
runtime.config.isZH = true;
runtime.config.SCRIPT_COLOR_MAIN = "orange";
runtime.settings.get = () => false;
runtime.api.createFormattedNumber = (value) => {
  const span = document.createElement("span");
  span.textContent = String(value ?? "—");
  return span;
};
runtime.api.numberFormatter = (value) => String(value ?? "—");
runtime.api.timeReadable = (value) => `${value}s`;
runtime.api.recordXpSnapshot = async () => {};
runtime.api.getXpHistory = async () => [];
runtime.api.calculateXpRates = () => ({
  recent: 10,
  hour: 10,
  day: 10,
  lastSampleAt: Date.now(),
  points: [],
});

await import("../src/features/guild-xp.js");

function guildMarkup() {
  document.body.innerHTML = `
    <div class="GuildPanel_guildPanel__test">
      <div role="tablist">
        <button role="tab" aria-selected="true" tabindex="0" class="Mui-selected">概览</button>
        <button role="tab" aria-selected="false" tabindex="-1">成员</button>
      </div>
      <div class="TabPanel_tabPanel__test">
        <div class="GuildPanel_overviewTab__test"></div>
      </div>
      <div class="TabPanel_tabPanel__test TabPanel_hidden__test" hidden>
        <div class="GuildPanel_membersTab__test"></div>
      </div>
    </div>`;
}

test("guild overview exists only once and only while Overview is selected", async () => {
  guildMarkup();
  runtime.state.guild = { id: "guild-overview", guildExperience: 1234 };

  await runtime.api.renderGuildOverview();
  await runtime.api.renderGuildOverview();
  assert.equal(document.querySelectorAll(".mwi-guild-xp-card").length, 1);
  assert.equal(
    document.querySelector(".mwi-guild-trend-label").textContent,
    "最近 7 天经验获取速度（6 小时滚动平均）",
  );
  assert.deepEqual(
    [...document.querySelectorAll(".mwi-guild-xp-metric small")].map(
      (node) => node.textContent,
    ),
    ["预计升级", "24 小时平均"],
  );
  assert.ok(
    document
      .querySelector(".GuildPanel_overviewTab__test")
      .contains(document.querySelector(".mwi-guild-xp-card")),
  );

  const [overviewTab, memberTab] = document.querySelectorAll('[role="tab"]');
  overviewTab.setAttribute("aria-selected", "false");
  overviewTab.setAttribute("tabindex", "-1");
  overviewTab.classList.remove("Mui-selected");
  memberTab.setAttribute("aria-selected", "true");
  memberTab.setAttribute("tabindex", "0");
  memberTab.classList.add("Mui-selected");
  document
    .querySelector(".GuildPanel_overviewTab__test")
    .closest('[class*="TabPanel_tabPanel"]')
    .classList.add("TabPanel_hidden__test");

  await runtime.api.renderGuildOverview();
  assert.equal(document.querySelectorAll(".mwi-guild-xp-card").length, 0);
});

test("an async overview render cannot insert after the user leaves the tab", async () => {
  guildMarkup();
  runtime.state.guild = { id: "guild-race", guildExperience: 2345 };
  let release;
  runtime.api.getXpHistory = () =>
    new Promise((resolve) => {
      release = resolve;
    });

  const rendering = runtime.api.renderGuildOverview();
  await Promise.resolve();
  const [overviewTab, memberTab] = document.querySelectorAll('[role="tab"]');
  overviewTab.setAttribute("aria-selected", "false");
  overviewTab.classList.remove("Mui-selected");
  memberTab.setAttribute("aria-selected", "true");
  release([]);
  await rendering;

  assert.equal(document.querySelectorAll(".mwi-guild-xp-card").length, 0);
  runtime.api.getXpHistory = async () => [];
});

test("guild overview calculates level ETA from the cumulative level table", async () => {
  guildMarkup();
  runtime.state.guild = {
    id: "guild-eta",
    level: 2,
    experience: 200,
  };
  runtime.state.initData_levelExperienceTable = [0, 0, 100, 500];
  runtime.api.calculateXpRates = () => ({
    recent: 10,
    hour: 10,
    day: 10,
    lastSampleAt: Date.now(),
    points: [],
  });

  await runtime.api.renderGuildOverview();

  const eta = [...document.querySelectorAll(".mwi-guild-xp-metric")].find(
    (node) => node.querySelector("small")?.textContent === "预计升级",
  );
  assert.equal(eta.querySelector("strong").textContent, "108000s");
});

test("guild overview falls back to the recent XP rate when the 24-hour rate is unavailable", async () => {
  guildMarkup();
  runtime.state.guild = {
    id: "guild-eta-recent-rate",
    level: 2,
    experience: 200,
  };
  runtime.state.initData_levelExperienceTable = [0, 0, 100, 500];
  runtime.api.calculateXpRates = () => ({
    recent: 20,
    hour: null,
    day: null,
    lastSampleAt: Date.now(),
    points: [],
  });

  await runtime.api.renderGuildOverview();

  const eta = [...document.querySelectorAll(".mwi-guild-xp-metric")].find(
    (node) => node.querySelector("small")?.textContent === "预计升级",
  );
  assert.equal(eta.querySelector("strong").textContent, "54000s");
});

test("guild overview never renders a zero ETA for incomplete data", async () => {
  const cases = [
    {
      id: "guild-eta-no-table",
      guild: { level: 2, experience: 200 },
      table: null,
      day: 10,
    },
    {
      id: "guild-eta-max-level",
      guild: { level: 2, experience: 100 },
      table: [0, 0, 100],
      day: 10,
    },
    {
      id: "guild-eta-no-rate",
      guild: { level: 2, experience: 200 },
      table: [0, 0, 100, 500],
      day: null,
    },
  ];

  for (const scenario of cases) {
    guildMarkup();
    runtime.state.guild = { id: scenario.id, ...scenario.guild };
    runtime.state.initData_levelExperienceTable = scenario.table;
    runtime.api.calculateXpRates = () => ({
      recent: null,
      hour: null,
      day: scenario.day,
      lastSampleAt: Date.now(),
      points: [],
    });

    await runtime.api.renderGuildOverview();

    const eta = [...document.querySelectorAll(".mwi-guild-xp-metric")].find(
      (node) => node.querySelector("small")?.textContent === "预计升级",
    );
    assert.equal(eta.querySelector("strong").textContent, "样本不足");
  }
});

test("weekly guild experience is normalized to this-week XP per hour", () => {
  const now = Date.parse("2026-08-12T12:00:00Z");
  const rate = runtime.api.getGuildWeeklyXpRate(
    {
      weeklyGuildExperience: 12_000,
      weeklyGuildExperienceWeekStartAt: "2026-08-07T12:00:00Z",
    },
    now,
  );

  assert.equal(rate, 100);
  assert.equal(
    runtime.api.getGuildWeeklyXpRate({ weeklyGuildExperience: 12_000 }, now),
    null,
  );
});

test("guild XP columns draw relative bars and sort in both directions", async () => {
  document.body.innerHTML = `
    <div class="GuildPanel_guildPanel__test">
      <div class="GuildPanel_membersTab__test">
        <table>
          <thead><tr><th>成员</th></tr></thead>
          <tbody><tr><td>Alice</td></tr><tr><td>Bob</td></tr><tr><td>Charlie</td></tr></tbody>
        </table>
      </div>
      <div class="GuildPanel_applicationsTab__test">
        <table id="application-table">
          <thead><tr><th>申请</th><th>决定</th></tr></thead>
          <tbody><tr><td>Applicant</td><td>—</td></tr></tbody>
        </table>
      </div>
    </div>`;
  const weekStart = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  runtime.state.guild = { id: "guild-table", guildExperience: 5000 };
  runtime.state.guildCharacters = [
    {
      id: "alice",
      name: "Alice",
      guildExperience: 100,
      weeklyGuildExperience: 600,
      weeklyGuildExperienceWeekStartAt: weekStart,
    },
    {
      id: "bob",
      name: "Bob",
      guildExperience: 200,
      weeklyGuildExperience: 2_400,
      weeklyGuildExperienceWeekStartAt: weekStart,
    },
    { id: "charlie", name: "Charlie", guildExperience: 300 },
  ];
  runtime.state.guildLeaderboard = [];
  runtime.settings.get = (id) => id === "guildMemberXp";
  runtime.api.getXpHistory = async (key) => [{ key }];
  runtime.api.calculateXpRates = ([record]) => {
    if (record.key.includes("charlie")) {
      return { recent: null, day: null, lastSampleAt: null, points: [] };
    }
    const value = record.key.includes("alice") ? 50 : 100;
    return {
      recent: value,
      day: value * 2,
      lastSampleAt: Date.now(),
      points: [],
    };
  };

  await runtime.api.sampleGuildState(false);
  runtime.api.renderGuildTables();

  const table = document.querySelector(".GuildPanel_membersTab__test table");
  assert.ok(
    document
      .querySelector(".GuildPanel_membersTab__test")
      .classList.contains("mwi-guild-members-wide"),
  );
  assert.ok(
    table.parentElement.classList.contains("mwi-guild-member-table-wrap"),
  );
  assert.equal(table.rows[0].cells.length, table.rows[1].cells.length);
  assert.deepEqual(
    [...table.querySelectorAll("thead th")].map((cell) =>
      cell.textContent.replace("↕", ""),
    ),
    ["成员", "24 小时 XP/h"],
  );
  assert.equal(table.querySelectorAll(".mwi-guild-rate-cell").length, 3);
  assert.equal(
    document.querySelectorAll(
      "#application-table .mwi-guild-rate-cell,#application-table .mwi-guild-recent-head,#application-table .mwi-guild-day-head,#application-table .mwi-guild-week-head",
    ).length,
    0,
  );
  assert.equal(
    document.querySelector("#application-table").rows[0].cells.length,
    2,
  );
  assert.deepEqual(
    [...table.querySelectorAll("tbody tr")].map((row) =>
      [...row.querySelectorAll(".mwi-guild-rate-fill")].map(
        (fill) => fill.style.width,
      ),
    ),
    [["50%"], ["100%"], []],
  );

  const trialHeader = document.createElement("th");
  trialHeader.textContent = "试炼层数";
  table.tHead.rows[0].append(trialHeader);
  [...table.tBodies[0].rows].forEach((row, index) => {
    row
      .querySelectorAll(".mwi-guild-rate-cell")
      .forEach((cell) => cell.remove());
    const trialCell = document.createElement("td");
    trialCell.textContent = String(142 - index * 5);
    row.append(trialCell);
  });
  runtime.api.renderGuildTables();

  assert.deepEqual(
    [...table.querySelectorAll("thead th")].map((cell) =>
      cell.textContent.replace("↕", ""),
    ),
    ["成员", "试炼层数", "24 小时 XP/h"],
  );
  assert.ok(
    [...table.tBodies[0].rows].every(
      (row) =>
        row.cells.length === table.tHead.rows[0].cells.length &&
        /^\d+$/.test(row.cells[1].textContent),
    ),
  );

  const dayHeader = table.querySelector(".mwi-guild-day-head");
  dayHeader.click();
  assert.deepEqual(
    [...table.querySelectorAll("tbody tr")].map(
      (row) => row.cells[0].textContent,
    ),
    ["Bob", "Alice", "Charlie"],
  );
  dayHeader.click();
  assert.deepEqual(
    [...table.querySelectorAll("tbody tr")].map(
      (row) => row.cells[0].textContent,
    ),
    ["Alice", "Bob", "Charlie"],
  );
});

test("guild leaderboard XP columns never change leaderboard row order", async () => {
  document.body.innerHTML = `
    <div class="LeaderboardPanel_leaderboard__test">
      <table>
        <thead><tr><th>公会</th></tr></thead>
        <tbody><tr><td>Charlie</td></tr><tr><td>Alice</td></tr><tr><td>Bob</td></tr></tbody>
      </table>
    </div>`;
  runtime.state.guildCharacters = [];
  runtime.state.guildLeaderboard = [
    { id: "charlie", name: "Charlie", guildExperience: 300 },
    { id: "alice", name: "Alice", guildExperience: 100 },
    { id: "bob", name: "Bob", guildExperience: 200 },
  ];
  runtime.settings.get = (id) => id === "guildLeaderboardXp";
  runtime.api.getXpHistory = async (key) => [{ key }];
  runtime.api.calculateXpRates = ([record]) => {
    const value = record.key.includes("bob")
      ? 100
      : record.key.includes("charlie")
        ? 75
        : 50;
    return {
      recent: value,
      day: value * 2,
      lastSampleAt: Date.now(),
      points: [],
    };
  };

  await runtime.api.sampleGuildState(true);
  runtime.api.renderGuildTables();

  const table = document.querySelector("table");
  const rowOrder = () =>
    [...table.querySelectorAll("tbody tr")].map(
      (row) => row.cells[0].textContent,
    );
  const rateHeaders = [
    ...table.querySelectorAll(".mwi-guild-recent-head,.mwi-guild-day-head"),
  ];
  assert.deepEqual(rowOrder(), ["Charlie", "Alice", "Bob"]);
  assert.equal(table.querySelector(".mwi-guild-rate-sort"), null);
  assert.ok(
    rateHeaders.every(
      (header) =>
        header.tabIndex === -1 &&
        header.title === "" &&
        header.getAttribute("aria-sort") === null,
    ),
  );

  for (const header of rateHeaders) {
    header.click();
    header.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Enter" }),
    );
  }
  runtime.api.renderGuildTables();
  assert.deepEqual(rowOrder(), ["Charlie", "Alice", "Bob"]);
});

test("guild idle status requires an explicit empty activity type", async () => {
  guildMarkup();
  runtime.state.guild = { id: "guild-idle", guildExperience: 3456 };
  runtime.state.guildCharacters = [
    { name: "Working", isOnline: true, actionType: "/action_types/crafting" },
    { name: "Idle", isOnline: true, actionType: "" },
    { name: "Nested Idle", sharable: { actionType: "" } },
    {
      name: "Nested Working",
      sharable: { actionType: "/action_types/combat" },
    },
    { name: "Unknown", isOnline: true },
    {
      name: "Hidden",
      isOnline: true,
      hideOnlineStatus: true,
      actionType: "",
    },
    { name: "Offline", isOnline: false, actionType: "" },
  ];
  runtime.settings.get = (id) => id === "guildIdleMembers";

  await runtime.api.renderGuildOverview();

  const idleRow = document.querySelector(".mwi-guild-idle");
  assert.match(idleRow.textContent, /当前闲置 \(2\)/);
  assert.deepEqual(
    [...idleRow.querySelectorAll("span")].map((node) => node.textContent),
    ["Idle", "Nested Idle"],
  );
});

test("guild trend converts cumulative XP samples into rolling XP-per-hour points", () => {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const points = runtime.api.getGuildXpRatePoints(
    [
      { at: now - 3 * hour, xp: 100 },
      { at: now - 2 * hour, xp: 250 },
      { at: now - hour, xp: 650 },
    ],
    now,
  );

  assert.deepEqual(
    points.map((point) => point.rate),
    [150, 275],
  );
});

test("guild trend smooths a very short XP burst over at least one hour", () => {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const points = runtime.api.getGuildXpRatePoints(
    [
      { at: now - 2 * hour, xp: 0 },
      { at: now - hour, xp: 600 },
      { at: now - hour + 1_000, xp: 700 },
    ],
    now,
  );

  assert.equal(points.length, 2);
  assert.ok(points.at(-1).rate < 1_000);
});

test("guild trend renders axes, readable ticks, grid lines, and bounded data", async () => {
  guildMarkup();
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  runtime.state.guild = { id: "guild-chart", guildExperience: 10_000 };
  runtime.api.getXpHistory = async () => [
    { at: now - 3 * hour, xp: 100 },
    { at: now - 2 * hour, xp: 250 },
    { at: now - hour, xp: 650 },
  ];
  runtime.api.calculateXpRates = (points) => ({
    recent: 400,
    hour: 400,
    day: 300,
    lastSampleAt: now,
    points,
  });

  await runtime.api.renderGuildOverview();

  const svg = document.querySelector(".mwi-guild-trend");
  assert.equal(svg.getAttribute("viewBox"), "0 0 520 180");
  assert.equal(svg.getAttribute("preserveAspectRatio"), "xMidYMid meet");
  assert.ok(svg.querySelector(".mwi-guild-axis-x"));
  assert.ok(svg.querySelector(".mwi-guild-axis-y"));
  assert.equal(svg.querySelectorAll(".mwi-guild-y-tick").length, 5);
  assert.equal(svg.querySelectorAll(".mwi-guild-x-tick").length, 4);
  assert.equal(svg.querySelectorAll(".mwi-guild-trend-grid").length, 5);
  assert.ok(
    [...svg.querySelectorAll(".mwi-guild-x-tick")].every((tick) =>
      tick.textContent.includes(":"),
    ),
  );
  const coordinates = svg
    .querySelector("polyline")
    .getAttribute("points")
    .split(" ")
    .map((point) => point.split(",").map(Number));
  assert.ok(
    coordinates.every(([x, y]) => x >= 58 && x <= 508 && y >= 10 && y <= 150),
  );
});

test("guild trend switches long time spans to month-day ticks", async () => {
  guildMarkup();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  runtime.state.guild = { id: "guild-chart-long", guildExperience: 10_000 };
  runtime.api.getXpHistory = async () => [
    { at: now - 4 * day, xp: 100 },
    { at: now - 2 * day, xp: 500 },
    { at: now, xp: 1_300 },
  ];
  runtime.api.calculateXpRates = (points) => ({
    recent: 20,
    hour: 20,
    day: 20,
    lastSampleAt: now,
    points,
  });

  await runtime.api.renderGuildOverview();

  assert.ok(
    [...document.querySelectorAll(".mwi-guild-x-tick")].every(
      (tick) =>
        tick.textContent.includes("/") && !tick.textContent.includes(":"),
    ),
  );
});

test("guild trend shows an explicit sparse-sample message without axes", async () => {
  guildMarkup();
  runtime.state.guild = { id: "guild-chart-sparse", guildExperience: 10_000 };
  runtime.api.getXpHistory = async () => [{ at: Date.now(), xp: 100 }];
  runtime.api.calculateXpRates = (points) => ({
    recent: null,
    hour: null,
    day: null,
    lastSampleAt: Date.now(),
    points,
  });

  await runtime.api.renderGuildOverview();

  const svg = document.querySelector(".mwi-guild-trend");
  assert.equal(
    svg.querySelector(".mwi-guild-trend-empty").textContent,
    "样本不足",
  );
  assert.equal(svg.querySelector("polyline"), null);
  assert.equal(svg.querySelector(".mwi-guild-axis-x"), null);
  assert.equal(svg.querySelector(".mwi-guild-axis-y"), null);
});
