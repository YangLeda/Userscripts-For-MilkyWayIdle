import path from "node:path";

import {
  buildUserscript,
  getProductionBanner,
  projectRoot,
} from "./userscript-build.mjs";

await buildUserscript({
  banner: await getProductionBanner(),
  outfile: path.join(projectRoot, "MWITools.js"),
  minify: true,
});
