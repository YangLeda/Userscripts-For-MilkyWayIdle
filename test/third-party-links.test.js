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

const { THIRD_PARTY_LINKS } = await import("../src/features/enhancement.js");

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
      "新战斗模拟 Stella",
      "利润网 Polokikiki",
      "人才市场 Shiin",
      "插件合集 Q7",
      "战斗模拟 shykai",
      "战斗榜 socko",
      "牛牛手册",
      "插件设置",
    ],
  );
  assert.equal(
    links.findIndex((link) => link.textContent === "插件合集 Q7") + 1,
    links.findIndex((link) => link.textContent === "战斗模拟 shykai"),
  );
  assert.doesNotMatch(
    links.map((link) => link.textContent).join(" "),
    /强化模拟|Mooneycalc|Milkonomy|Cowculator/,
  );
  assert.deepEqual(
    THIRD_PARTY_LINKS.map(({ url }) => url),
    [
      "https://mwisim.org/combat/setup",
      "https://polokikiki.github.io/Milkonomy/#/dashboard",
      "https://greasyfork.org/zh-CN/scripts/559347-mwi-talent-market",
      "https://js.nainai.eu.org/",
      "https://shykai.github.io/MWICombatSimulatorTest/dist/",
      "https://sockosnewcombattracker.pages.dev/",
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
