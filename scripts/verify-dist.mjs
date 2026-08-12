import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildUserscript,
  getProductionBanner,
  projectRoot,
} from "./userscript-build.mjs";

const tempDir = await mkdtemp(path.join(tmpdir(), "mwitools-dist-"));

try {
  for (const distribution of [
    {
      banner: await getProductionBanner(),
      filename: "MWITools.js",
      command: "npm run build",
    },
  ]) {
    const tempOutput = path.join(tempDir, distribution.filename);
    await buildUserscript({
      banner: distribution.banner,
      outfile: tempOutput,
      minify: true,
    });

    const [committed, generated] = await Promise.all([
      readFile(path.join(projectRoot, distribution.filename)),
      readFile(tempOutput),
    ]);

    if (!committed.equals(generated)) {
      throw new Error(
        `${distribution.filename} is stale. Run \`${distribution.command}\` and commit the result.`,
      );
    }
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
