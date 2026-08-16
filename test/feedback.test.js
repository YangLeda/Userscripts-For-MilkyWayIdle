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
const { ensureHeaderToolsHost, removeHeaderToolsHostIfEmpty } =
  await import("../src/features/header-tools.js");
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

test("feedback button shares the header tools row after settings and remains a singleton", async () => {
  const client = {
    list: async () => ({
      items: [],
      unread: 0,
      quota: { limit: 2, remaining: 2 },
    }),
  };
  const scope = runtime.createCleanupScope();
  const host = ensureHeaderToolsHost();
  const settingsButton = document.createElement("button");
  settingsButton.id = "mwitools-settings-button";
  host.append(settingsButton);
  const panel = new FeedbackPanel({ client, scope });
  const first = panel.ensureButton();
  const second = panel.ensureButton();
  assert.equal(first, second);
  assert.equal(host.previousElementSibling.textContent, "总等级: 2178");
  assert.deepEqual(
    [...host.children].map((element) => element.id),
    ["mwitools-settings-button", "mwitools-feedback-button"],
  );
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
  settingsButton.remove();
  removeHeaderToolsHostIfEmpty();
  assert.equal(document.querySelector("#mwitools-feedback-button"), null);
  assert.equal(document.querySelector("#mwitools-feedback-root"), null);
  assert.equal(document.querySelector("#mwitools-header-tools"), null);
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

test("announcement history preserves each release separately through 26.4.14", () => {
  const latest = ANNOUNCEMENTS[0];
  const newest = ANNOUNCEMENTS[1];
  const current = ANNOUNCEMENTS[2];
  const previous = ANNOUNCEMENTS[3];
  const prior = ANNOUNCEMENTS[4];
  const older = ANNOUNCEMENTS[5];
  const oldest = ANNOUNCEMENTS[6];
  const earliest = ANNOUNCEMENTS[7];
  assert.deepEqual(
    ANNOUNCEMENTS.map(({ version }) => version),
    [
      "26.4.14",
      "26.4.13",
      "26.4.12",
      "26.4.11",
      "26.4.9",
      "26.4.8",
      "26.4.7",
      "26.4.6",
    ],
  );
  assert.equal(latest.version, "26.4.14");
  assert.equal(latest.publishedAt, "2026-08-16");
  assert.match(latest.title.zh, /26\.4\.14 更新公告/);
  assert.match(latest.title.en, /Version 26\.4\.14 update/);
  assert.equal(latest.body.zh.length, latest.body.en.length);
  assert.equal(latest.body.zh.length, 8);
  assert.match(
    latest.body.zh.join("\n"),
    /地牢宝箱.*精炼宝箱.*库存估值.*开箱期望.*宝箱开启钥匙.*地牢门票钥匙.*分别展示.*普通无门票宝箱.*不受影响/,
  );
  assert.match(
    latest.body.zh.join("\n"),
    /披风.*背部装备.*贤者之镜.*精炼 \+14.*保护之镜.*总成本更低/,
  );
  assert.match(
    latest.body.zh.join("\n"),
    /完整队列.*悬浮价格.*目标怪物合并.*真正新增的任务/,
  );
  assert.match(
    latest.body.zh.join("\n"),
    /流动资产.*非流动资产.*今日盈亏.*公会贡献表.*试炼层数.*闲置人数/,
  );
  assert.match(
    latest.body.zh.join("\n"),
    /打开配装下拉.*切换配装.*制造链.*生产摘要.*快捷小时.*逗号小数/,
  );
  assert.match(
    latest.body.zh.join("\n"),
    /购物清单.*滚动位置.*商品弹窗.*直接切换.*删除当前项.*下一项/,
  );
  assert.match(
    latest.body.zh.join("\n"),
    /中国服.*无 www.*TaskManager.*永久静默.*恢复提醒/,
  );
  assert.equal(newest.version, "26.4.13");
  assert.equal(newest.publishedAt, "2026-08-15");
  assert.match(newest.title.zh, /26\.4\.13 更新公告/);
  assert.match(newest.title.en, /Version 26\.4\.13 update/);
  assert.equal(newest.body.zh.length, newest.body.en.length);
  assert.equal(newest.body.zh.length, 1);
  assert.match(
    newest.body.zh.join("\n"),
    /制作界面.*升级耗时.*自动填写生产次数.*界面刷新.*当前等级 \+1.*130 级.*135 级.*继续保留 135 级/,
  );
  assert.equal(current.version, "26.4.12");
  assert.equal(current.publishedAt, "2026-08-15");
  assert.match(current.title.zh, /26\.4\.12 更新公告/);
  assert.match(current.title.en, /Version 26\.4\.12 update/);
  assert.equal(previous.version, "26.4.11");
  assert.equal(previous.publishedAt, "2026-08-14");
  assert.match(previous.title.zh, /26\.4\.11 重要更新公告/);
  assert.match(previous.title.en, /Important version 26\.4\.11 update/);
  assert.equal(prior.version, "26.4.9");
  assert.equal(prior.publishedAt, "2026-08-13");
  assert.equal(older.version, "26.4.8");
  assert.equal(oldest.version, "26.4.7");
  assert.equal(earliest.version, "26.4.6");
  assert.equal(earliest.publishedAt, "2026-08-12");
  assert.equal(current.body.zh.length, current.body.en.length);
  assert.equal(current.body.zh.length, 8);
  assert.match(
    current.body.zh.join("\n"),
    /Ranged Way Idle.*购物车.*图标.*无法点击.*保持原节点/,
  );
  assert.match(
    current.body.zh.join("\n"),
    /更新仓库.*游戏当前仓库.*项目采购缺口.*手工购物数量保持不变.*项目占用.*旧余量.*弹窗边框内.*不会下推页面.*悬浮定位.*没有自带定位基准.*正确显示.*持续重绘.*保留.*定位基准.*页面右上角.*来回切换闪烁.*仅在生产与强化详情.*战斗怪物面板.*不会再误显示/,
  );
  assert.match(
    current.body.zh.join("\n"),
    /自托管更新文件.*已经上传.*CDN 缓存刷新.*误报失败.*不再依赖.*状态读取权限/,
  );
  assert.equal(previous.body.zh.length, previous.body.en.length);
  assert.equal(previous.body.zh.length, 24);
  assert.match(
    previous.body.zh.join("\n"),
    /自托管更新源.*校验脚本、元数据、版本和更新地址.*CDN 缓存刷新/,
  );
  assert.match(
    previous.body.zh.join("\n"),
    /稳定射击.*实时命中率排行.*各怪物的命中率.*排除辅助、持续伤害、反伤/,
  );
  assert.match(
    previous.body.zh.join("\n"),
    /DPS 标题栏.*永久缺失大部分图标.*资源就绪后自动补回.*图集路径/,
  );
  assert.match(
    previous.body.zh.join("\n"),
    /恢复任务页地牢筛选按钮的官方图标.*菱形占位符.*所有匹配地牢的同尺寸图标/,
  );
  assert.match(
    current.body.zh.join("\n"),
    /眼球怪、灵魂猎手.*多个地牢.*全部匹配地牢.*自身地牢/,
  );
  assert.match(
    current.body.zh.join("\n"),
    /金币未计入库存价值.*固定按 1:1.*货币分类.*总资产.*市场行情快照.*月神之蝶.*星球 BOSS 怪物.*BOSS 刷新数据.*每 10 场.*40 次.*普通怪物与地牢任务.*原数量/,
  );
  assert.match(
    current.body.zh.join("\n"),
    /固定 Buff 区域.*卡片跳动.*独立展开为两行.*框内滚动.*跨战斗与刷新保留/,
  );
  assert.match(
    current.body.zh.join("\n"),
    /右上角快捷设置.*滚动位置.*重新打开或刷新页面.*原处继续查看/,
  );
  assert.match(
    current.body.zh.join("\n"),
    /购物车有商品.*“设置”切回“清单”.*设置内容下方.*正确移除上一页内容.*稳定显示/,
  );
  assert.match(
    previous.body.zh.join("\n"),
    /盈亏.*单核 CPU.*共享重复的页面观察/,
  );
  assert.match(previous.body.zh.join("\n"), /悬浮窗口字号.*标准、较大和最大/);
  assert.match(previous.body.zh.join("\n"), /角色初始化或重新连接.*旧库存/);
  assert.match(
    previous.body.zh.join("\n"),
    /压缩内置备用行情数据.*不增加外部 CDN/,
  );
  assert.match(
    previous.body.zh.join("\n"),
    /全部九种游戏语言.*不会新增游戏数据网络请求/,
  );
  assert.match(previous.body.zh.join("\n"), /contains 权限错误.*界面重建/);
  assert.match(
    previous.body.zh.join("\n"),
    /恢复食物与饮品的回复性价比.*回复 100 血或蓝所需金币/,
  );
  assert.match(
    previous.body.zh.join("\n"),
    /优化任务页打开速度.*复用.*避免每张任务卡重复扫描/,
  );
  assert.match(
    previous.body.zh.join("\n"),
    /DPS 命中率悬浮明细.*官方怪物图标.*快速区分/,
  );
  assert.equal(earliest.body.zh.length, 20);
  assert.equal(earliest.body.en.length, 20);
  assert.match(earliest.body.zh.join("\n"), /任务页改为平铺布局/);
  assert.doesNotMatch(current.body.zh.join("\n"), /任务页改为平铺布局/);
  assert.match(oldest.body.zh.join("\n"), /版本公告恢复按版本独立保存/);
  assert.match(older.body.zh.join("\n"), /炼金与强化/);
  assert.match(
    prior.body.zh.join("\n"),
    /切换到技能页再返回库存.*晚到回调再次写入隐藏状态也会保持可见/,
  );
  assert.match(
    prior.body.zh.join("\n"),
    /评分和总资产现在会在本次页面会话首次计算后保持不变.*单独移除摘要时也会自动补回/,
  );
  assert.match(
    prior.body.zh.join("\n"),
    /更换战斗技能后，目标等级和生产次数快捷输入不显示/,
  );
  assert.match(
    previous.body.zh.join("\n"),
    /小紫牛风格的性能初始化引导.*流畅优先.*重新开始/,
  );
  assert.match(
    previous.body.en.join("\n"),
    /Purple Cow-style performance setup.*Smooth.*restart the guide/,
  );
  assert.match(
    previous.body.zh.join("\n"),
    /左上角总进度.*应用配置后自动刷新页面/,
  );
  assert.match(
    previous.body.en.join("\n"),
    /overall progress bar.*refreshes the page automatically/,
  );
  assert.match(previous.body.zh.join("\n"), /自动开启铁牛模式适配/);
  assert.match(previous.body.zh.join("\n"), /刷新价值.*鼠标和触屏拖动排序/);
  assert.match(previous.body.zh.join("\n"), /有限时长 \+ ∞/);
  assert.match(previous.body.en.join("\n"), /MWI TaskManager/);
  assert.doesNotMatch(prior.body.zh.join("\n"), /小紫牛风格|自动开启铁牛/);
});

test("the current announcement covers task reroll and navigation compatibility", () => {
  const current = ANNOUNCEMENTS.find(({ version }) => version === "26.4.14");
  assert.match(
    current.body.zh.join("\n"),
    /利润网.*强化模拟.*插件设置.*任务图片.*Ranged Way Idle.*刷新选项/,
  );
  assert.match(
    current.body.en.join("\n"),
    /profit-site.*enhancement simulator.*script-settings.*Task artwork/i,
  );
  assert.match(current.body.en.join("\n"), /reroll options.*Ranged Way Idle/i);
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
