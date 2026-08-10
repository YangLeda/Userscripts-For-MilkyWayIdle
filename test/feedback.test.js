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
runtime.config.isZH = true;

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
  assert.match(first.textContent, /MWITools 意见反馈/);
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
  assert.equal(
    document.querySelector(".mwi-feedback-head h2").textContent,
    "MWITools 意见反馈",
  );
  runtime.config.isZH = false;
  panel.items = [
    {
      id: "english-status",
      status: "pending",
      title: "English status",
      updatedAt: "2026-08-10T00:00:00.000Z",
    },
  ];
  panel.renderList();
  assert.equal(
    document.querySelector(".mwi-feedback-status").textContent,
    "Pending",
  );
  runtime.config.isZH = true;
  scope.cleanup();
  assert.equal(document.querySelector("#mwitools-feedback-button"), null);
  assert.equal(document.querySelector("#mwitools-feedback-root"), null);
});

test("feedback quota failures replace the loading state with a visible error", async () => {
  const scope = runtime.createCleanupScope();
  const panel = new FeedbackPanel({
    client: {
      list: async () => {
        throw new Error("network unavailable");
      },
    },
    scope,
  });

  assert.equal(await panel.refresh(), false);
  assert.match(
    panel.root.querySelector(".mwi-feedback-quota").textContent,
    /额度查询失败.*network unavailable/,
  );
  scope.cleanup();
});

test("successful feedback submission updates quota without waiting for list refresh", async () => {
  const scope = runtime.createCleanupScope();
  const never = new Promise(() => {});
  const panel = new FeedbackPanel({
    client: {
      submit: async (value) => ({
        id: "saved-feedback",
        status: "pending",
        title: value.title,
        updatedAt: "2026-08-10T00:00:00.000Z",
      }),
      list: () => never,
    },
    scope,
  });
  panel.quota = { limit: 2, remaining: 2 };
  panel.form.elements.title.value = "Saved quickly";
  panel.form.elements.detail.value = "Details";

  await panel.submit({ preventDefault() {} });

  assert.match(panel.root.textContent, /Saved quickly/);
  assert.match(
    panel.root.querySelector(".mwi-feedback-quota").textContent,
    /1\/2/,
  );
  assert.equal(
    panel.form.querySelector(".mwi-feedback-submit").disabled,
    false,
  );
  scope.cleanup();
});
