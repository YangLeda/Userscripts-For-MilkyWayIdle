import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const output = await readFile(
  new URL("../MWITools.js", import.meta.url),
  "utf8",
);
test("generated userscript has a single valid metadata block", () => {
  assert.equal(output.indexOf("// ==UserScript=="), 0);
  assert.equal(output.match(/\/\/ ==UserScript==/g)?.length, 1);
  assert.equal(output.match(/\/\/ ==\/UserScript==/g)?.length, 1);
  assert.match(output, /^\/\/ @version\s+26\.2$/m);
  assert.match(
    output,
    /^\/\/ @updateURL\s+https:\/\/update\.greasyfork\.org\/scripts\/494467\/MWITools\.meta\.js$/m,
  );
  assert.match(
    output,
    /^\/\/ @downloadURL\s+https:\/\/update\.greasyfork\.org\/scripts\/494467\/MWITools\.user\.js$/m,
  );

  for (const directive of [
    "// @match        https://www.milkywayidle.com/*",
    "// @match        https://test.milkywayidle.com/*",
    "// @match        https://www.milkywayidlecn.com/*",
    "// @match        https://amvoidguy.github.io/MWICombatSimulatorTest/*",
    "// @match        https://shykai.github.io/MWICombatSimulatorTest/dist/*",
    "// @match        https://mooneycalc.netlify.app/*",
    "// @grant        GM_addStyle",
    "// @grant        GM.xmlHttpRequest",
    "// @grant        GM_xmlhttpRequest",
    "// @grant        GM_notification",
    "// @grant        GM_getValue",
    "// @grant        GM_setValue",
    "// @connect      feedback.43.167.210.211.sslip.io",
    "// @require      https://milk.43.167.210.211.sslip.io/scripts/vendor/mathjs-12.4.2.min.js",
    "// @require      https://milk.43.167.210.211.sslip.io/scripts/vendor/chart.js-4.4.3.umd.min.js",
    "// @require      https://milk.43.167.210.211.sslip.io/scripts/vendor/hammerjs-2.0.8.min.js",
    "// @require      https://milk.43.167.210.211.sslip.io/scripts/vendor/chartjs-plugin-zoom-2.0.1.min.js",
  ]) {
    assert.ok(
      output.includes(directive),
      `missing metadata directive: ${directive}`,
    );
  }
  assert.doesNotMatch(
    output,
    /ChartDataLabels|chartjs-plugin-crosshair|dragscroll/,
  );
  assert.doesNotMatch(
    output,
    /script_current_assets|script_api_fail_alert|script_api_fail_popout/,
  );
  assert.match(output, /VERSION = "1\.0\.51"/);
  assert.match(output, /__MWI_DPS/);
});

test("generated userscript is standalone JavaScript", () => {
  assert.doesNotMatch(output, /sourceMappingURL=/);
  assert.doesNotThrow(() => new vm.Script(output));
});
