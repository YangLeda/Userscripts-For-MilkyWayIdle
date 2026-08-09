import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { build } from "esbuild";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const banner = (
  await readFile(path.join(projectRoot, "src/userscript-banner.txt"), "utf8")
).trimEnd();

await build({
  absWorkingDir: projectRoot,
  entryPoints: ["src/main.js"],
  outfile: "MWITools.js",
  bundle: true,
  format: "iife",
  target: ["chrome100"],
  charset: "utf8",
  minify: false,
  sourcemap: false,
  legalComments: "inline",
  treeShaking: false,
  banner: { js: banner },
});
