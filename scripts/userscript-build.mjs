import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { build } from "esbuild";

export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export async function getProductionBanner() {
  return (
    await readFile(path.join(projectRoot, "src/userscript-banner.txt"), "utf8")
  ).trimEnd();
}

export async function getTestBanner() {
  const productionBanner = await getProductionBanner();
  const lines = productionBanner.split("\n");
  const testLines = [];
  let insertedTestMatch = false;

  for (const line of lines) {
    if (line.startsWith("// @name         ")) {
      testLines.push("// @name         MWITools 测试版");
      continue;
    }
    if (line.startsWith("// @namespace    ")) {
      testLines.push("// @namespace    https://fishingidle.com/mwitools-test");
      continue;
    }
    if (line.startsWith("// @version      ")) {
      testLines.push("// @version      26.2.0");
      continue;
    }
    if (line.startsWith("// @description  ")) {
      testLines.push(
        line.replace("// @description  ", "// @description  [测试版] "),
      );
      continue;
    }
    if (line.startsWith("// @match        ")) {
      if (!insertedTestMatch) {
        testLines.push("// @match        https://test.milkywayidle.com/*");
        testLines.push(
          "// @updateURL    https://milk.43.167.210.211.sslip.io/scripts/mwitools-test.user.js",
        );
        testLines.push(
          "// @downloadURL  https://milk.43.167.210.211.sslip.io/scripts/mwitools-test.user.js",
        );
        insertedTestMatch = true;
      }
      continue;
    }
    testLines.push(line);
  }

  return testLines.join("\n");
}

export async function buildUserscript({ banner, outfile }) {
  await build({
    absWorkingDir: projectRoot,
    entryPoints: ["src/main.js"],
    outfile,
    bundle: true,
    format: "iife",
    target: ["chrome100"],
    charset: "utf8",
    minify: false,
    sourcemap: false,
    legalComments: "inline",
    treeShaking: false,
    loader: { ".png": "dataurl" },
    banner: { js: banner },
  });
}
