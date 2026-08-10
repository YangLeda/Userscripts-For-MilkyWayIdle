import path from "node:path";

import {
  buildUserscript,
  getTestBanner,
  projectRoot,
  writeMetadataFile,
} from "./userscript-build.mjs";

const banner = await getTestBanner();
await buildUserscript({
  banner,
  outfile: path.join(projectRoot, "MWITools-test.user.js"),
});
await writeMetadataFile(
  banner,
  path.join(projectRoot, "MWITools-test.meta.js"),
);
