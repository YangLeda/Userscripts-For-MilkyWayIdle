import path from "node:path";

import {
  buildUserscript,
  getProductionBanner,
  projectRoot,
} from "./userscript-build.mjs";

await buildUserscript({
  banner: await getProductionBanner(),
  outfile: path.join(projectRoot, "MWITools.js"),
});

// Keep the installable diagnostic artifact in sync with every production build.
await import("./build-debug.mjs");
