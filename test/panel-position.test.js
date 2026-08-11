import assert from "node:assert/strict";
import test from "node:test";

import { computeAnchoredPanelPosition } from "../src/core/panel-position.js";

const VIEWPORT = { viewportWidth: 1000, viewportHeight: 800 };
const PANEL = { width: 200, height: 300 };
const OPTS = { gap: 10, margin: 12, ...VIEWPORT };

function rect(left, top, width, height) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

test("prefers the right side when there is room", () => {
  const result = computeAnchoredPanelPosition(
    rect(400, 100, 50, 40),
    PANEL,
    OPTS,
  );
  assert.equal(result.placement, "right");
  assert.equal(result.left, 460); // anchor.right + gap
  assert.equal(result.top, 100);
});

test("falls back to the left side when the right is too tight", () => {
  const result = computeAnchoredPanelPosition(
    rect(850, 100, 50, 40),
    PANEL,
    OPTS,
  );
  assert.equal(result.placement, "left");
  assert.equal(result.left, 640); // anchor.left - panel.width - gap
});

test("drops below when neither side fits and there is room underneath", () => {
  // Anchor spans nearly the full width so left/right both lack room.
  const result = computeAnchoredPanelPosition(
    rect(120, 100, 760, 40),
    PANEL,
    OPTS,
  );
  assert.equal(result.placement, "bottom");
  assert.equal(result.top, 150); // anchor.bottom + gap
});

test("drops above when neither side nor the space below fits", () => {
  const result = computeAnchoredPanelPosition(
    rect(120, 600, 760, 40),
    PANEL,
    OPTS,
  );
  assert.equal(result.placement, "top");
  assert.equal(result.top, 290); // anchor.top - panel.height - gap
});

test("clamps the panel inside the viewport margins", () => {
  // Anchor near the bottom edge would push the panel off-screen; it clamps.
  const result = computeAnchoredPanelPosition(
    rect(400, 780, 50, 40),
    PANEL,
    OPTS,
  );
  assert.ok(result.top + PANEL.height <= VIEWPORT.viewportHeight - 12);
  assert.ok(result.top >= 12);
});
