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
    now: () => 1,
    getEntriesByType: () => [
      {
        name: "https://cdn.example.test/assets/abilities_sprite.live.svg",
      },
    ],
  },
});

const {
  getGameSpriteHref,
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
