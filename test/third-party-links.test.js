import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><head></head><body></body>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
globalThis.window = dom.window;

const { runtime } = await import("../src/core/runtime.js");
runtime.config.isZH = true;
runtime.settings.get = (id) => id === "ThirdPartyLinks";

const { THIRD_PARTY_LINKS } =
  await import("../src/features/navigation-action-queue.js");

test("third-party navigation links use the requested sites and order", () => {
  document.body.innerHTML = `
    <div class="NavigationBar_minorNavigationLinks__dbxh7">
      <div data-native-link="true">原生链接</div>
    </div>
    <button class="NavigationBar_navigationLink__3eAHA">库存</button>
    <button class="NavigationBar_navigationLink__3eAHA">设置</button>
  `;
  const opened = [];
  window.open = (...args) => opened.push(args);

  runtime.api.add3rdPartyLinks();

  const links = [
    ...document.querySelectorAll('[data-mwitools-external-link="true"]'),
  ];
  assert.deepEqual(
    links.map((link) => link.textContent),
    [
      "插件合集 Q7",
      "利润网 Polokikiki",
      "战斗模拟 shykai",
      "新战斗模拟 Stella",
      "战斗榜 socko",
      "人才市场 Shiin",
      "牛牛手册",
      "插件设置",
    ],
  );
  assert.doesNotMatch(
    links.map((link) => link.textContent).join(" "),
    /强化模拟|Mooneycalc|Milkonomy|Cowculator/,
  );
  assert.deepEqual(
    THIRD_PARTY_LINKS.map(({ url }) => url),
    [
      "https://js.nainai.eu.org/",
      "https://polokikiki.github.io/Milkonomy/#/dashboard",
      "https://shykai.github.io/MWICombatSimulatorTest/dist/",
      "https://mwisim.org/combat/setup",
      "https://sockosnewcombattracker.pages.dev/",
      "https://greasyfork.org/zh-CN/scripts/559347-mwi-talent-market",
    ],
  );

  links.slice(0, 6).forEach((link) => link.click());
  assert.deepEqual(
    opened,
    THIRD_PARTY_LINKS.map(({ url }) => [url, "_blank"]),
  );

  runtime.api.add3rdPartyLinks();
  assert.equal(
    document.querySelectorAll('[data-mwitools-external-link="true"]').length,
    links.length,
  );
});
