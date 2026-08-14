import assert from "node:assert/strict";
import test, { after } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
  {
    url: "https://www.milkywayidle.com/game",
    pretendToBeVisual: true,
  },
);
globalThis.document = dom.window.document;
globalThis.window = dom.window;

const visualViewport = new dom.window.EventTarget();
visualViewport.height = 640;
Object.defineProperty(window, "visualViewport", {
  configurable: true,
  writable: true,
  value: visualViewport,
});
Object.defineProperty(window, "innerHeight", {
  configurable: true,
  writable: true,
  value: 900,
});

const { runtime } = await import("../src/core/runtime.js");
const { resolveVisualViewportHeight, syncMobileViewportHeight } =
  await import("../src/features/mobile-viewport-fix.js");

after(async () => {
  await runtime.features.disable("mobileViewportFix");
});

function waitForFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

test("mobile viewport height follows visualViewport, falls back, and cleans up", async () => {
  assert.equal(resolveVisualViewportHeight(window, document), 640);
  assert.equal(syncMobileViewportHeight(window, document), true);
  assert.equal(
    document.documentElement.style.getPropertyValue(
      "--mwitools-visual-viewport-height",
    ),
    "640px",
  );

  await runtime.features.enable("mobileViewportFix");
  const style = document.querySelector("#mwitools-mobile-viewport-style");
  assert.ok(style);
  assert.match(style.textContent, /\(any-pointer:coarse\)/);
  assert.match(style.textContent, /#root/);
  assert.match(
    style.textContent,
    /background-color:var\(--color-background-game/,
  );
  assert.equal(
    document.documentElement.getAttribute("data-mwitools-mobile-viewport"),
    "true",
  );

  visualViewport.height = 712.5;
  visualViewport.dispatchEvent(new dom.window.Event("resize"));
  await waitForFrame();
  assert.equal(
    document.documentElement.style.getPropertyValue(
      "--mwitools-visual-viewport-height",
    ),
    "712.5px",
  );

  await runtime.features.disable("mobileViewportFix");
  assert.equal(document.querySelector("#mwitools-mobile-viewport-style"), null);
  assert.equal(
    document.documentElement.hasAttribute("data-mwitools-mobile-viewport"),
    false,
  );
  assert.equal(
    document.documentElement.style.getPropertyValue(
      "--mwitools-visual-viewport-height",
    ),
    "",
  );

  window.visualViewport = undefined;
  window.innerHeight = 555;
  assert.equal(resolveVisualViewportHeight(window, document), 555);
  await runtime.features.enable("mobileViewportFix");
  assert.equal(
    document.documentElement.style.getPropertyValue(
      "--mwitools-visual-viewport-height",
    ),
    "555px",
  );

  await runtime.features.disable("mobileViewportFix");
  window.innerHeight = 777;
  window.dispatchEvent(new dom.window.Event("resize"));
  await waitForFrame();
  assert.equal(
    document.documentElement.style.getPropertyValue(
      "--mwitools-visual-viewport-height",
    ),
    "",
  );
});
