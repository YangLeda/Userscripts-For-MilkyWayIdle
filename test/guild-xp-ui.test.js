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

test("guild XP columns draw relative bars and sort in both directions", async () => {
  document.body.innerHTML = `
    <div class="GuildPanel_guildPanel__test">
      <table>
        <thead><tr><th>成员</th></tr></thead>
        <tbody><tr><td>Alice</td></tr><tr><td>Bob</td></tr><tr><td>Charlie</td></tr></tbody>
      </table>
    </div>`;
  runtime.state.guild = { id: "guild-table", guildExperience: 5000 };
  runtime.state.guildCharacters = [
    { id: "alice", name: "Alice", guildExperience: 100 },
    { id: "bob", name: "Bob", guildExperience: 200 },
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

  const table = document.querySelector("table");
  assert.equal(table.querySelectorAll(".mwi-guild-rate-cell").length, 6);
  assert.deepEqual(
    [...table.querySelectorAll("tbody tr")].map((row) =>
      [...row.querySelectorAll(".mwi-guild-rate-fill")].map(
        (fill) => fill.style.width,
      ),
    ),
    [["50%", "50%"], ["100%", "100%"], []],
  );

  const recentHeader = table.querySelector(".mwi-guild-recent-head");
  recentHeader.click();
  assert.deepEqual(
    [...table.querySelectorAll("tbody tr")].map(
      (row) => row.cells[0].textContent,
    ),
    ["Bob", "Alice", "Charlie"],
  );
  recentHeader.click();
  assert.deepEqual(
    [...table.querySelectorAll("tbody tr")].map(
      (row) => row.cells[0].textContent,
    ),
    ["Alice", "Bob", "Charlie"],
  );
});
