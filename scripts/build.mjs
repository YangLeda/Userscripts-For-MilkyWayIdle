import path from "node:path";

import {
  buildUserscript,
  getMinifiedBanner,
  getProductionBanner,
  projectRoot,
} from "./userscript-build.mjs";

// The readable production script is the canonical GreasyFork distribution; the
// minified build is generated alongside it so the two never drift apart.
await buildUserscript({
  banner: await getProductionBanner(),
  outfile: path.join(projectRoot, "MWITools.js"),
});
await buildUserscript({
  banner: await getMinifiedBanner(),
  outfile: path.join(projectRoot, "MWITools.min.user.js"),
  minify: true,
});
