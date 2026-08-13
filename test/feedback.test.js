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
const { FeedbackPanel } =
  await import("../src/features/opinion-center/panel.js");
const { normalizeImageLinks } =
  await import("../src/features/opinion-center/client.js");
const { ANNOUNCEMENTS, AnnouncementStore } =
  await import("../src/features/opinion-center/announcements.js");
runtime.config.isZH = true;

function announcementStore({ seen = [], announcements } = {}) {
  let saved = [...seen];
  return new AnnouncementStore({
    announcements,
    getValue: () => saved,
    setValue: (_key, value) => {
      saved = value;
    },
  });
}

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

test("feedback button sits below total level and UI remains a singleton", async () => {
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
  assert.equal(first.textContent, "✉MWITools");
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
    "MWITools 意见中心",
  );
  const launcherStyle = document.querySelector(
    "#mwitools-feedback-style",
  ).textContent;
  assert.match(launcherStyle, /font-size:10px/);
  assert.match(launcherStyle, /white-space:nowrap/);
  assert.match(
    launcherStyle,
    /@media\(max-width:620px\)\{#mwitools-feedback-button\{font-size:9px\}/,
  );
  assert.match(
    launcherStyle,
    /\.mwi-feedback-body\{min-height:0;flex:1 1 auto;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain/,
  );
  assert.match(
    launcherStyle,
    /\.mwi-feedback-field textarea\{min-height:105px;max-height:38vh;max-height:38dvh;field-sizing:content/,
  );
  assert.match(
    launcherStyle,
    /@media\(max-width:620px\).*\.mwi-feedback-modal\{max-height:calc\(100vh - 12px\);max-height:calc\(100dvh - 12px\)\}.*\.mwi-feedback-tabs\{flex:0 0 auto\}/,
  );
  document.body.style.overflow = "auto";
  await panel.open();
  assert.equal(document.body.style.overflow, "hidden");
  panel.showTab("announcements");
  const body = panel.root.querySelector(".mwi-feedback-body");
  body.scrollTop = 120;
  panel.renderAnnouncements();
  assert.equal(body.scrollTop, 120);
  panel.close();
  assert.equal(document.body.style.overflow, "auto");
  runtime.config.isZH = false;
  panel.ensureButton();
  assert.equal(
    first.querySelector(".mwi-opinion-label").textContent,
    "MWITools",
  );
  assert.match(first.getAttribute("aria-label"), /MWITools Feedback Center/);
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

test("opinion center combines feedback and announcement unread states into one dot", async () => {
  const cases = [
    { feedback: 0, announcementSeen: true, unread: false },
    { feedback: 1, announcementSeen: true, unread: true },
    { feedback: 0, announcementSeen: false, unread: true },
    { feedback: 1, announcementSeen: false, unread: true },
  ];
  for (const item of cases) {
    const scope = runtime.createCleanupScope();
    const panel = new FeedbackPanel({
      client: {
        list: async () => ({
          items: item.feedback
            ? [{ id: "reply", unread: true, status: "processing" }]
            : [],
          unread: item.feedback,
          quota: { limit: 2, remaining: 2 },
        }),
      },
      scope,
      announcements: announcementStore({
        seen: item.announcementSeen ? ANNOUNCEMENTS.map(({ id }) => id) : [],
      }),
    });
    const button = panel.ensureButton();
    await panel.refresh();
    assert.equal(button.dataset.unread, String(item.unread));
    assert.equal(button.querySelector(".mwi-opinion-dot").hidden, !item.unread);
    scope.cleanup();
  }
});

test("opening the center prioritizes announcements and clears every unread source", async () => {
  const marked = [];
  const announcements = announcementStore();
  const scope = runtime.createCleanupScope();
  const panel = new FeedbackPanel({
    client: {
      list: async () => ({
        items: [
          {
            id: "admin-reply",
            unread: true,
            status: "processing",
            title: "Reply",
            updatedAt: "2026-08-12T00:00:00.000Z",
          },
        ],
        unread: 1,
        quota: { limit: 2, remaining: 2 },
      }),
      markRead: async (id) => marked.push(id),
    },
    scope,
    announcements,
  });
  const button = panel.ensureButton();
  await panel.refresh();
  await panel.open();
  await Promise.resolve();

  assert.equal(button.dataset.unread, "false");
  assert.equal(announcements.unread().length, 0);
  assert.deepEqual(marked, ["admin-reply"]);
  assert.equal(
    panel.root.querySelector('[data-tab="announcements"]').dataset.active,
    "true",
  );
  scope.cleanup();
});

test("opening feedback-only activity lands on My feedback", async () => {
  const scope = runtime.createCleanupScope();
  const panel = new FeedbackPanel({
    client: {
      list: async () => ({
        items: [
          {
            id: "feedback-only",
            unread: true,
            status: "processing",
            title: "Reply",
            updatedAt: "2026-08-12T00:00:00.000Z",
          },
        ],
        unread: 1,
        quota: { limit: 2, remaining: 2 },
      }),
      markRead: async () => {},
    },
    scope,
    announcements: announcementStore({
      seen: ANNOUNCEMENTS.map(({ id }) => id),
    }),
  });
  panel.ensureButton();
  await panel.refresh();
  await panel.open();
  assert.equal(
    panel.root.querySelector('[data-tab="mine"]').dataset.active,
    "true",
  );
  scope.cleanup();
});

test("failed feedback acknowledgements stay suppressed and retry on polling", async () => {
  let attempts = 0;
  const scope = runtime.createCleanupScope();
  const panel = new FeedbackPanel({
    client: {
      list: async () => ({
        items: [
          {
            id: "retry-reply",
            unread: true,
            status: "processing",
            title: "Retry",
            updatedAt: "2026-08-12T00:00:00.000Z",
          },
        ],
        unread: 1,
        quota: { limit: 2, remaining: 2 },
      }),
      markRead: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary failure");
      },
    },
    scope,
    announcements: announcementStore({ seen: ["26.4.7"] }),
  });
  const button = panel.ensureButton();
  await panel.refresh();
  await panel.open();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(attempts, 1);
  assert.equal(button.dataset.unread, "false");

  await panel.refresh();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(attempts, 2);
  assert.equal(panel.pendingReadIds.size, 0);
  assert.equal(button.dataset.unread, "false");
  scope.cleanup();
});

test("announcements remain usable when the feedback service is unavailable", async () => {
  const announcements = announcementStore();
  const scope = runtime.createCleanupScope();
  const panel = new FeedbackPanel({
    client: {
      list: async () => {
        throw new Error("network unavailable");
      },
    },
    scope,
    announcements,
  });
  const button = panel.ensureButton();
  assert.equal(button.dataset.unread, "true");
  await panel.open();
  assert.equal(button.dataset.unread, "false");
  assert.equal(announcements.unread().length, 0);
  assert.match(panel.root.textContent, /26\.4\.7 更新公告/);
  scope.cleanup();
});

test("announcement store sorts releases newest first and persists all seen IDs", () => {
  let saved = [];
  const store = new AnnouncementStore({
    announcements: [
      {
        id: "1",
        version: "1.0",
        publishedAt: "2026-01-01",
        title: { zh: "旧", en: "Old" },
        body: { zh: [], en: [] },
      },
      {
        id: "2",
        version: "2.0",
        publishedAt: "2026-02-01",
        title: { zh: "新", en: "New" },
        body: { zh: [], en: [] },
      },
    ],
    getValue: () => saved,
    setValue: (_key, value) => {
      saved = value;
    },
  });
  assert.deepEqual(
    store.list().map((item) => item.id),
    ["2", "1"],
  );
  assert.equal(store.markAllRead(), 2);
  assert.deepEqual(saved.sort(), ["1", "2"]);
  assert.equal(store.markAllRead(), 0);
  const reloaded = new AnnouncementStore({
    announcements: store.list(),
    getValue: () => saved,
    setValue: () => {},
  });
  assert.equal(reloaded.unread().length, 0);
});

test("announcement copy follows the MWITools language", () => {
  const scope = runtime.createCleanupScope();
  const panel = new FeedbackPanel({
    client: { list: async () => ({ items: [] }) },
    scope,
    announcements: announcementStore({ seen: ["26.4.7"] }),
  });
  runtime.config.isZH = false;
  panel.showTab("announcements");
  assert.match(panel.root.textContent, /Version 26\.4\.7 update/);
  assert.match(panel.root.textContent, /Tasks now use a flat layout/);
  runtime.config.isZH = true;
  scope.cleanup();
});

test("the shared Ctrl tooltip announcement is red, bold, and underlined", () => {
  const scope = runtime.createCleanupScope();
  const panel = new FeedbackPanel({
    client: { list: async () => ({ items: [] }) },
    scope,
    announcements: announcementStore({ seen: ["26.4.7"] }),
  });

  const emphasized = panel.root.querySelector(
    ".mwi-announcement-card li strong u",
  );
  assert.match(emphasized?.textContent ?? "", /按住 Ctrl/);
  assert.match(emphasized?.textContent ?? "", /宝箱估算/);
  assert.equal(
    panel.root.querySelectorAll(".mwi-announcement-card li strong u").length,
    1,
  );
  assert.match(
    document.querySelector("#mwitools-feedback-style").textContent,
    /\.mwi-announcement-card li strong\{color:#ff5f66\}/,
  );
  scope.cleanup();
});

test("announcement history preserves each release separately through 26.4.9", () => {
  const current = ANNOUNCEMENTS[0];
  const previous = ANNOUNCEMENTS[1];
  const older = ANNOUNCEMENTS[2];
  const oldest = ANNOUNCEMENTS[3];
  assert.deepEqual(
    ANNOUNCEMENTS.map(({ version }) => version),
    ["26.4.9", "26.4.8", "26.4.7", "26.4.6"],
  );
  assert.equal(current.version, "26.4.9");
  assert.equal(previous.version, "26.4.8");
  assert.equal(older.version, "26.4.7");
  assert.equal(oldest.version, "26.4.6");
  assert.equal(oldest.publishedAt, "2026-08-12");
  assert.equal(current.body.zh.length, current.body.en.length);
  assert.equal(oldest.body.zh.length, 20);
  assert.equal(oldest.body.en.length, 20);
  assert.match(oldest.body.zh.join("\n"), /任务页改为平铺布局/);
  assert.doesNotMatch(current.body.zh.join("\n"), /任务页改为平铺布局/);
  assert.match(older.body.zh.join("\n"), /版本公告恢复按版本独立保存/);
  assert.match(previous.body.zh.join("\n"), /炼金与强化/);
  assert.match(current.body.zh.join("\n"), /切换到技能页再返回库存/);
  assert.match(
    current.body.zh.join("\n"),
    /评分和总资产现在会在本次页面会话首次计算后保持不变/,
  );
  assert.match(
    current.body.zh.join("\n"),
    /更换战斗技能后，目标等级和生产次数快捷输入不显示/,
  );
});

test("the announcement history covers every player-facing update bilingually", () => {
  const allZh = ANNOUNCEMENTS.flatMap(({ body }) => body.zh).join("\n");
  const allEn = ANNOUNCEMENTS.flatMap(({ body }) => body.en).join("\n");
  for (const pattern of [
    /铁牛模式适配/,
    /点金、分解、转化和解精炼/,
    /按住 Ctrl/,
    /迷宫活动期间/,
    /从上一步开始/,
    /移除作用有限的消耗品/,
    /购物车数量加减按钮/,
    /数字解析和显示现在跟随游戏内语言/,
    /中文以外的游戏语言下火车点击加入队列后不续站/,
    /分项图表改为显示各日期的实际资产持有值/,
    /实时资产刷新后继续保持隐藏或显示状态/,
    /精炼生活披风等背部装备提示没有新缺料/,
    /改善英文界面卡顿/,
    /九种官方语言下库存评分与总资产/,
    /移动浏览器工具栏变化后页面底部偶尔出现白条/,
    /Sunny 强化倍数按钮/,
  ]) {
    assert.match(allZh, pattern);
  }
  for (const pattern of [
    /Iron Cow adaptation/,
    /Coinify, Decompose, Transmute, and Unrefine/,
    /holding Ctrl/,
    /Labyrinth run/,
    /Start from previous/,
    /Removed the low-value consumable/,
    /shopping-cart quantity buttons/,
    /Number parsing and display now follow the in-game language/,
    /trains not advancing after queue submission/,
    /component charts now show actual holdings/,
    /visibility now persists through live asset refreshes/,
    /refined skilling capes and other back equipment/,
    /improve English task-page performance/,
    /all nine official game languages/,
    /mobile browser toolbar changes/,
    /Sunny's enhancement multiplier buttons/,
  ]) {
    assert.match(allEn, pattern);
  }
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
