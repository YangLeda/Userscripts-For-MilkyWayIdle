import path from "node:path";

import {
  buildUserscript,
  getTestBanner,
  projectRoot,
} from "./userscript-build.mjs";

await buildUserscript({
  banner: await getTestBanner(),
  outfile: path.join(projectRoot, "MWITools-test.user.js"),
});
