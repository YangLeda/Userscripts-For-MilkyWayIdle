import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { format } from "prettier";
import {
  compressMarketBackup,
  getProductionBanner,
  projectRoot,
} from "./userscript-build.mjs";
// Same name and namespace: install as a replacement, preserving manager storage.
const banner =
  (await getProductionBanner())
    .replace(/^\/\/ @(?:updateURL|downloadURL).*\n/gm, "")
    .replace(/^(\/\/ @version\s+)(\S+)$/m, "$1$2-debug.2") +
  "\n\nglobalThis.__MWITOOLS_DEBUG_BUILD__ = true;";
const outfile = path.join(projectRoot, "MWITools-debug.user.js");
await build({
  absWorkingDir: projectRoot,
  entryPoints: ["src/main.js"],
  outfile,
  bundle: true,
  format: "iife",
  target: ["chrome100"],
  charset: "utf8",
  minify: false,
  minifySyntax: true,
  keepNames: false,
  sourcemap: false,
  legalComments: "inline",
  treeShaking: true,
  loader: { ".png": "dataurl" },
  banner: { js: banner },
  plugins: [
    debugModuleTracePlugin(),
    {
      name: "debug-market-backup",
      setup(context) {
        context.onLoad(
          { filter: /[\\/]market-backup\.json$/ },
          async ({ path: filePath }) => ({
            contents: `export default ${JSON.stringify(compressMarketBackup(await readFile(filePath, "utf8")))};`,
            loader: "js",
          }),
        );
      },
    },
  ],
});
await writeFile(
  outfile,
  await format(await readFile(outfile, "utf8"), {
    parser: "babel",
    useTabs: true,
    printWidth: 120,
  }),
);

function debugModuleTracePlugin() {
  return {
    name: "debug-module-trace",
    setup(buildContext) {
      buildContext.onLoad(
        { filter: /[\\/]src[\\/].*\.js$/ },
        async ({ path: filePath }) => {
          const name = path
            .relative(projectRoot, filePath)
            .split(path.sep)
            .join("/");
          const log = (phase) =>
            `try { console.info("[MWITools Debug]", ${JSON.stringify(`module:${phase}`)}, ${JSON.stringify(name)}); } catch {}\n`;
          return {
            contents:
              log("begin") +
              (await readFile(filePath, "utf8")) +
              "\n" +
              log("ready"),
            loader: "js",
            resolveDir: path.dirname(filePath),
          };
        },
      );
    },
  };
}
