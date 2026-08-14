import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { build } from "esbuild";
import LZString from "lz-string";

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

export function compressMarketBackup(source) {
  const normalized = JSON.stringify(JSON.parse(source));
  const compressed = LZString.compressToBase64(normalized);
  if (!compressed) throw new Error("Failed to compress the market backup");
  return compressed;
}

function compressedMarketBackupPlugin() {
  return {
    name: "compressed-market-backup",
    setup(buildContext) {
      buildContext.onLoad(
        { filter: /[\\/]market-backup\.json$/ },
        async ({ path: filePath }) => ({
          contents: `export default ${JSON.stringify(
            compressMarketBackup(await readFile(filePath, "utf8")),
          )};`,
          loader: "js",
        }),
      );
    },
  };
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
    keepNames: false,
    sourcemap: false,
    legalComments: "inline",
    treeShaking: false,
    plugins: [compressedMarketBackupPlugin()],
    loader: { ".png": "dataurl" },
    banner: { js: banner },
  });
}
