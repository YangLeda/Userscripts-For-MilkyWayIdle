import path from "node:path";

import {
  buildUserscript,
  getMinifiedBanner,
  projectRoot,
} from "./userscript-build.mjs";

await buildUserscript({
  banner: await getMinifiedBanner(),
  outfile: path.join(projectRoot, "MWITools.min.user.js"),
  minify: true,
});
