import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const banner = (
  await readFile(path.join(projectRoot, "src/userscript-banner.txt"), "utf8")
).trimEnd();
const tempDir = await mkdtemp(path.join(tmpdir(), "mwitools-dist-"));
const tempOutput = path.join(tempDir, "MWITools.js");

try {
  await build({
    absWorkingDir: projectRoot,
    entryPoints: ["src/main.js"],
    outfile: tempOutput,
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

  const [committed, generated] = await Promise.all([
    readFile(path.join(projectRoot, "MWITools.js")),
    readFile(tempOutput),
  ]);

  if (!committed.equals(generated)) {
    throw new Error(
      "MWITools.js is stale. Run `npm run build` and commit the result.",
    );
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
