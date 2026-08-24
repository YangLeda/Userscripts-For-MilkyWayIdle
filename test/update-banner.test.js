import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.window = dom.window;

const { runtime } = await import("../src/core/runtime.js");
await import("../src/core/config.js");
await import("../src/features/update-banner.js");

const manifest = {
  version: 1,
  latestVersion: "26.2",
  importantVersion: "26.1",
  title: { zh: "重要更新", en: "Important update" },
  message: { zh: "请更新", en: "Please update" },
  url: "https://malicious.example/update.user.js",
};

test("version comparison distinguishes newer important releases", () => {
  assert.equal(runtime.api.compareVersions("26.0", "26.1"), -1);
  assert.equal(runtime.api.compareVersions("26.1", "26.1.0"), 0);
  assert.equal(runtime.api.compareVersions("26.2", "26.1"), 1);
  assert.equal(runtime.api.shouldShowImportantUpdate(manifest, "26.0"), true);
  assert.equal(runtime.api.shouldShowImportantUpdate(manifest, "26.1"), false);
});

test("important update banner shows the latest version and appears only once", () => {
  localStorage.clear();
  globalThis.GM_info = {
    script: {
      version: "26.0",
      downloadURL:
        "https://update.greasyfork.org/scripts/494467/MWITools.user.js",
    },
  };
  assert.equal(runtime.api.renderImportantUpdateBanner(manifest), true);
  const banner = document.querySelector("#mwitools-important-update-banner");
  assert.equal(
    banner.querySelector("a").href,
    "https://update.greasyfork.org/scripts/494467/MWITools.user.js",
  );
  assert.match(banner.textContent, /(?:最新版本|Latest version) 26\.2/);
  banner.querySelector("button").click();
  assert.equal(
    document.querySelector("#mwitools-important-update-banner"),
    null,
  );
  assert.equal(runtime.api.renderImportantUpdateBanner(manifest), false);
  delete globalThis.GM_info;
});

test("manifest checks GitHub first and only falls back once after failure", async () => {
  const primaryCalls = [];
  const primary = await runtime.api.fetchImportantUpdateManifest({
    urls: ["github", "server"],
    request: async (url) => {
      primaryCalls.push(url);
      return manifest;
    },
  });
  assert.equal(primary, manifest);
  assert.deepEqual(primaryCalls, ["github"]);

  const fallbackCalls = [];
  const fallback = await runtime.api.fetchImportantUpdateManifest({
    urls: ["github", "server"],
    request: async (url) => {
      fallbackCalls.push(url);
      if (url === "github") throw new Error("offline");
      return manifest;
    },
  });
  assert.equal(fallback, manifest);
  assert.deepEqual(fallbackCalls, ["github", "server"]);

  const failedCalls = [];
  await assert.rejects(
    runtime.api.fetchImportantUpdateManifest({
      urls: ["github", "server"],
      request: async (url) => {
        failedCalls.push(url);
        throw new Error("offline");
      },
    }),
  );
  assert.deepEqual(failedCalls, ["github", "server"]);
});

test("latest version alone does not trigger an important update", () => {
  localStorage.clear();
  assert.equal(
    runtime.api.shouldShowImportantUpdate(
      { ...manifest, latestVersion: "99.0", importantVersion: "26.1" },
      "26.1",
    ),
    false,
  );
});

test("release 26.4.16 is the important-update threshold", () => {
  const releaseManifest = JSON.parse(
    readFileSync(new URL("../release-manifest.json", import.meta.url), "utf8"),
  );
  assert.equal(releaseManifest.latestVersion, "26.4.16");
  assert.equal(releaseManifest.importantVersion, "26.4.16");
  assert.match(releaseManifest.title.zh, /26\.4\.16 重要更新/);
  assert.match(releaseManifest.title.en, /Important MWITools 26\.4\.16 update/);
  assert.match(releaseManifest.message.zh, /铁牛排行榜.*任务刷新图片.*Debuff/);
  assert.match(
    releaseManifest.message.en,
    /Iron Cow rankings.*rerolled task artwork.*Debuffs on affected targets/i,
  );
  for (const version of [
    "26.4.5",
    "26.4.6",
    "26.4.7",
    "26.4.8",
    "26.4.9",
    "26.4.10",
    "26.4.11",
    "26.4.12",
    "26.4.13",
    "26.4.14",
    "26.4.15",
  ]) {
    assert.equal(
      runtime.api.shouldShowImportantUpdate(releaseManifest, version),
      true,
      `${version} must see the 26.4.16 important-update banner`,
    );
  }
  assert.equal(
    runtime.api.shouldShowImportantUpdate(releaseManifest, "26.4.16"),
    false,
  );
});
