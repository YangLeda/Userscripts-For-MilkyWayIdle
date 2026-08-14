import path from "node:path";

import {
  buildUserscript,
  getDevelopmentBanner,
  projectRoot,
} from "./userscript-build.mjs";

await buildUserscript({
  banner: await getDevelopmentBanner(),
  outfile: path.join(projectRoot, "MWITools.dev.user.js"),
});
