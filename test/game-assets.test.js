import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<!doctype html><html><body>
    <svg><use href="/static/media/items_sprite.dom.svg#coin"></use></svg>
  </body></html>`,
  { url: "https://www.milkywayidle.com/" },
);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
let fetchCalls = 0;
globalThis.fetch = () => {
  fetchCalls += 1;
  throw new Error("sprite discovery must not fetch");
};
Object.defineProperty(globalThis, "performance", {
  configurable: true,
  value: {
    now: () => currentTime,
    getEntriesByType: () => [
      {
        name: "https://cdn.example.test/assets/abilities_sprite.live.svg",
      },
    ],
  },
});

let currentTime = 1;

const {
  getGameSpriteHref,
  loadGameSpriteManifest,
  registerGameSpriteSource,
  resetGameSpriteSources,
  scanGameSpriteSources,
} = await import("../src/core/game-assets.js");

test("sprite registry discovers DOM and resource entries without network requests", () => {
  resetGameSpriteSources();
  assert.equal(scanGameSpriteSources({ force: true }), 2);
  assert.equal(
    getGameSpriteHref("item", "/items/coin"),
    "/static/media/items_sprite.dom.svg#coin",
  );
  assert.equal(
    getGameSpriteHref("ability", "/abilities/puncture"),
    "https://cdn.example.test/assets/abilities_sprite.live.svg#puncture",
  );
  assert.equal(fetchCalls, 0);
});

test("known sprite kinds do not rescan the full document after the throttle expires", () => {
  resetGameSpriteSources();
  currentTime = 1;
  scanGameSpriteSources({ force: true });
  const originalQuerySelectorAll = document.querySelectorAll.bind(document);
  let scans = 0;
  document.querySelectorAll = (...args) => {
    scans += 1;
    return originalQuerySelectorAll(...args);
  };
  try {
    currentTime = 5_000;
    assert.equal(
      getGameSpriteHref("item", "/items/coin"),
      "/static/media/items_sprite.dom.svg#coin",
    );
    assert.equal(scans, 0);
  } finally {
    document.querySelectorAll = originalQuerySelectorAll;
  }
});

test("missing sprite kinds stay empty and accept later runtime discovery", () => {
  resetGameSpriteSources();
  assert.equal(getGameSpriteHref("skills", "/skills/attack"), "");
  assert.equal(
    registerGameSpriteSource("/static/media/skills_sprite.svg#defense"),
    true,
  );
  assert.equal(
    getGameSpriteHref("skills", "/skills/attack"),
    "/static/media/skills_sprite.svg#attack",
  );
  assert.equal(fetchCalls, 0);
});

test("asset manifest restores sprite kinds not loaded by the current page", async () => {
  resetGameSpriteSources();
  const previousFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(url);
    return {
      ok: true,
      json: async () => ({
        files: {
          "actions.svg": "/static/media/actions_sprite.manifest.svg",
          "skills.svg": "/static/media/skills_sprite.manifest.svg",
        },
      }),
    };
  };
  try {
    await loadGameSpriteManifest();
    await loadGameSpriteManifest();
    assert.deepEqual(requested, [
      "https://www.milkywayidle.com/asset-manifest.json",
    ]);
    assert.equal(
      getGameSpriteHref("actions", "/actions/combat/chimerical_den"),
      "/static/media/actions_sprite.manifest.svg#chimerical_den",
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
