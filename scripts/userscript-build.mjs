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

export async function getDevelopmentBanner() {
  return (await getProductionBanner())
    .replace(/^\/\/ @name\s+MWITools$/m, "// @name         MWITools (dev)")
    .replace(
      /^\/\/ @namespace\s+.*$/m,
      "// @namespace    https://fishingidle.com/mwitools-dev",
    );
}

export async function buildUserscript({ banner, outfile, minify = false }) {
  await build({
    absWorkingDir: projectRoot,
    entryPoints: ["src/main.js"],
    outfile,
    bundle: true,
    format: "iife",
    target: ["chrome100"],
    charset: "utf8",
    minify,
    keepNames: minify,
    sourcemap: false,
    legalComments: "inline",
    treeShaking: false,
    loader: { ".png": "dataurl" },
    banner: { js: banner },
  });
}
