import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM(
  `<!doctype html><html lang="zh-CN"><head></head><body><header><div id="identity"><div class="Header_totalLevel__test">总等级: 2178</div></div></header></body></html>`,
  { url: "https://test.milkywayidle.com/" },
);
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.location = dom.window.location;
globalThis.localStorage = dom.window.localStorage;
globalThis.FormData = dom.window.FormData;
globalThis.File = dom.window.File;
globalThis.URL = dom.window.URL;

const { runtime } = await import("../src/core/runtime.js");
const { FeedbackPanel } = await import("../src/features/feedback/panel.js");
const { MAX_IMAGE_BYTES, validateImageFiles } =
  await import("../src/features/feedback/client.js");

test("feedback screenshots enforce type, count, and the 1MB limit", () => {
  assert.equal(
    validateImageFiles([
      { type: "image/png", size: MAX_IMAGE_BYTES, name: "valid.png" },
    ]).length,
    1,
  );
  assert.throws(
    () =>
      validateImageFiles([
        {
          type: "image/png",
          size: MAX_IMAGE_BYTES + 1,
          name: "large.png",
        },
      ]),
    /1MB/,
  );
  assert.throws(
    () => validateImageFiles([{ type: "image/gif", size: 10 }]),
    /PNG、JPEG 和 WebP/,
  );
  assert.throws(
    () => validateImageFiles([{ type: "image/png", size: 10 }], 3),
    /3 张/,
  );
});

test("feedback button sits below total level and UI remains a singleton", () => {
  const client = {
    list: async () => ({
      items: [],
      unread: 0,
      quota: { limit: 2, remaining: 2 },
    }),
  };
  const scope = runtime.createCleanupScope();
  const panel = new FeedbackPanel({ client, scope });
  const first = panel.ensureButton();
  const second = panel.ensureButton();
  assert.equal(first, second);
  assert.equal(first.previousElementSibling.textContent, "总等级: 2178");
  assert.equal(
    document.querySelectorAll("#mwitools-feedback-button").length,
    1,
  );
  assert.equal(document.querySelectorAll("#mwitools-feedback-root").length, 1);
  scope.cleanup();
  assert.equal(document.querySelector("#mwitools-feedback-button"), null);
  assert.equal(document.querySelector("#mwitools-feedback-root"), null);
});
