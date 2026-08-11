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
