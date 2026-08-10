import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const output = await readFile(
  new URL("../MWITools.js", import.meta.url),
  "utf8",
);
const testOutput = await readFile(
  new URL("../MWITools-test.user.js", import.meta.url),
  "utf8",
);

test("generated userscript has a single valid metadata block", () => {
  assert.equal(output.indexOf("// ==UserScript=="), 0);
  assert.equal(output.match(/\/\/ ==UserScript==/g)?.length, 1);
  assert.equal(output.match(/\/\/ ==\/UserScript==/g)?.length, 1);
  assert.match(output, /^\/\/ @version\s+26\.2$/m);

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
    "// @require      https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.2/math.js",
    "// @require      https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js",
    "// @require      https://cdn.jsdelivr.net/npm/hammerjs@2.0.8/hammer.min.js",
    "// @require      https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js",
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
  assert.match(output, /VERSION = "1\.0\.50"/);
  assert.match(output, /__MWI_DPS/);
});

test("generated userscript is standalone JavaScript", () => {
  assert.doesNotMatch(output, /sourceMappingURL=/);
  assert.doesNotThrow(() => new vm.Script(output));
});

test("test userscript is independently installable and test-only", () => {
  assert.equal(testOutput.indexOf("// ==UserScript=="), 0);
  assert.equal(testOutput.match(/\/\/ ==UserScript==/g)?.length, 1);
  assert.equal(testOutput.match(/\/\/ ==\/UserScript==/g)?.length, 1);
  assert.match(testOutput, /^\/\/ @name\s+MWITools 测试版$/m);
  assert.match(
    testOutput,
    /^\/\/ @namespace\s+https:\/\/fishingidle\.com\/mwitools-test$/m,
  );
  assert.match(testOutput, /^\/\/ @version\s+26\.2\.4$/m);
  assert.match(testOutput, /^\/\/ @grant\s+unsafeWindow$/m);
  assert.match(
    testOutput,
    /^\/\/ @match\s+https:\/\/test\.milkywayidle\.com\/\*$/m,
  );
  assert.doesNotMatch(testOutput, /^\/\/ @match\s+https:\/\/www\./m);
  assert.match(
    testOutput,
    /^\/\/ @updateURL\s+https:\/\/milk\.43\.167\.210\.211\.sslip\.io\/scripts\/mwitools-test\.user\.js$/m,
  );
  assert.match(
    testOutput,
    /^\/\/ @downloadURL\s+https:\/\/milk\.43\.167\.210\.211\.sslip\.io\/scripts\/mwitools-test\.user\.js$/m,
  );
  assert.doesNotMatch(testOutput, /sourceMappingURL=/);
  assert.doesNotThrow(() => new vm.Script(testOutput));
});
