import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { JSDOM } from "jsdom";

import {
  buildUserscript,
  getDevelopmentBanner,
} from "../scripts/userscript-build.mjs";

const tempDir = await mkdtemp(path.join(tmpdir(), "mwitools-smoke-"));
const developmentOutput = path.join(tempDir, "MWITools.dev.user.js");
await buildUserscript({
  banner: await getDevelopmentBanner(),
  outfile: developmentOutput,
});

const userscripts = new Map([
  [
    "production",
    await readFile(new URL("../MWITools.js", import.meta.url), "utf8"),
  ],
  ["development", await readFile(developmentOutput, "utf8")],
]);

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function createUserscriptWindow(url) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body></body></html>",
    {
      url,
      runScripts: "outside-only",
    },
  );
  const { window } = dom;
  const calls = {
    intervals: 0,
    intervalDelays: [],
    mutationObservers: 0,
    activeMutationObservers: 0,
    styles: 0,
    requests: 0,
  };

  window.console = { ...console, log() {}, error() {} };
  window.setInterval = (_callback, delay) => {
    calls.intervals += 1;
    calls.intervalDelays.push(Number(delay));
    return calls.intervals;
  };
  window.clearInterval = () => {};
  window.setTimeout = () => 0;
  window.MutationObserver = class {
    constructor() {
      this.active = false;
      calls.mutationObservers += 1;
    }
    observe() {
      if (this.active) return;
      this.active = true;
      calls.activeMutationObservers += 1;
    }
    disconnect() {
      if (!this.active) return;
      this.active = false;
      calls.activeMutationObservers -= 1;
    }
  };
  window.GM_addStyle = () => (calls.styles += 1);
  window.GM_getValue = (_key, fallback) => fallback;
  window.GM_setValue = () => {};
  window.GM_notification = () => {};
  window.GM_xmlhttpRequest = () => new Promise(() => {});
  window.GM = {
    xmlHttpRequest() {
      calls.requests += 1;
      return new Promise(() => {});
    },
  };
  window.localStorage.setItem("initClientData", "cached");
  window.localStorage.setItem(
    "MWITools_performance_profile_v1",
    JSON.stringify({
      version: 1,
      completed: true,
      usage: "balanced",
      tier: "standard",
    }),
  );
  window.localStorageUtil = {
    getInitClientData: () => ({ actionDetailMap: {}, itemDetailMap: {} }),
  };
  window.math = {};
  window.structuredClone = globalThis.structuredClone;

  return { calls, dom, window };
}

for (const [buildName, userscript] of userscripts) {
  test(`${buildName} game route starts without synchronous errors`, async () => {
    const { calls, dom, window } = createUserscriptWindow(
      "https://www.milkywayidle.com/",
    );
    assert.doesNotThrow(() => window.eval(userscript));
    for (let index = 0; index < 30; index += 1) await Promise.resolve();
    assert.equal(calls.requests, 2);
    assert.equal(calls.styles, 2);
    assert.ok(calls.intervals >= 2);
    const idleCallbacksPerSecond = calls.intervalDelays.reduce(
      (total, delay) => total + (delay > 0 ? 1000 / delay : 0),
      0,
    );
    assert.ok(
      idleCallbacksPerSecond <= 2,
      `idle callbacks must stay at or below 2/s, got ${idleCallbacksPerSecond}`,
    );
    dom.window.close();
  });

  test(`${buildName} external route stays isolated`, () => {
    const { calls, dom, window } = createUserscriptWindow(
      "https://mooneycalc.netlify.app/",
    );
    assert.doesNotThrow(() => window.eval(userscript));
    assert.equal(calls.requests, 0);
    assert.equal(calls.styles, 0);
    assert.equal(calls.intervals, 1);
    dom.window.close();
  });

  test(`${buildName} default character features stay within the observer budget`, async () => {
    const { calls, dom, window } = createUserscriptWindow(
      "https://www.milkywayidle.com/",
    );
    window.eval(userscript);
    for (let index = 0; index < 100; index += 1) await Promise.resolve();
    const event = new window.MessageEvent("message", {
      data: JSON.stringify({
        type: "init_character_data",
        character: { id: 1, name: "Observer Budget" },
        characterItems: [],
        characterSkills: [],
        characterAbilities: [],
        characterQuests: [],
        characterActions: [],
      }),
    });
    Object.defineProperty(event, "currentTarget", {
      value: {
        url: "wss://api.milkywayidle.com/ws",
        send() {},
        addEventListener() {},
      },
    });
    void event.data;
    for (let index = 0; index < 300; index += 1) await Promise.resolve();

    assert.ok(
      calls.activeMutationObservers <= 18,
      `active MutationObserver budget exceeded: ${calls.activeMutationObservers}`,
    );
    assert.ok(
      calls.mutationObservers <= 18,
      `created MutationObserver budget exceeded: ${calls.mutationObservers}`,
    );
    dom.window.close();
  });
}
