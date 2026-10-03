import path from "node:path";
import {
  buildUserscript,
  getProductionBanner,
  projectRoot,
} from "./userscript-build.mjs";
// Same name and namespace: install as a replacement, preserving manager storage.
const banner =
  (await getProductionBanner())
    .replace(/^\/\/ @(?:updateURL|downloadURL).*\n/gm, "")
    .replace(/^(\/\/ @version\s+)(\S+)$/m, "$1$2-debug.1") +
  "\n\nglobalThis.__MWITOOLS_DEBUG_BUILD__ = true;";
await buildUserscript({
  banner,
  outfile: path.join(projectRoot, "MWITools-debug.user.js"),
});
