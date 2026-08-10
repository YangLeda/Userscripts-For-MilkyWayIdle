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
globalThis.URL = dom.window.URL;

const { runtime } = await import("../src/core/runtime.js");
const { FeedbackPanel } = await import("../src/features/feedback/panel.js");
const { normalizeImageLinks } =
  await import("../src/features/feedback/client.js");

test("feedback image links only accept up to three HTTP(S) URLs", () => {
  assert.deepEqual(
    normalizeImageLinks(
      " https://img.example/a.png\n\nhttp://img.example/b.webp ",
    ),
    ["https://img.example/a.png", "http://img.example/b.webp"],
  );
  assert.throws(
    () => normalizeImageLinks("https://a\nhttps://b\nhttps://c\nhttps://d"),
    /3 个/,
  );
  assert.throws(() => normalizeImageLinks("javascript:alert(1)"), /HTTP/);
  assert.throws(() => normalizeImageLinks("not a url"), /格式/);
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
  assert.ok(document.querySelector('textarea[name="imageLinks"]'));
  assert.equal(
    document.querySelector(".mwi-feedback-image-help").href,
    "https://tupian.li/",
  );
  assert.equal(document.querySelector('input[type="file"]'), null);
  scope.cleanup();
  assert.equal(document.querySelector("#mwitools-feedback-button"), null);
  assert.equal(document.querySelector("#mwitools-feedback-root"), null);
});
