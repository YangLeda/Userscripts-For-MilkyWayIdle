import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Regenerates src/data/market-backup.js from src/data/market-backup.json.
//
// The bundled fallback snapshot is consumed only as a JSON string (state.js
// hands it straight to the market loader). Importing the .json turns it into a
// JS object that esbuild inlines as a ~14k-line object literal, so the source
// indentation ends up in the bundle. Storing it as one compact string constant
// keeps the data out of that inlined form and shrinks the bundle by ~120 KB
// without minifying any actual code.

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const jsonPath = path.join(projectRoot, "src/data/market-backup.json");
const outPath = path.join(projectRoot, "src/data/market-backup.js");

const raw = await readFile(jsonPath, "utf8");
// Round-trip through JSON to drop the pretty-print whitespace.
const compact = JSON.stringify(JSON.parse(raw));

const banner = `// Generated from market-backup.json by scripts/build-market-backup.mjs.
// The bundled fallback market snapshot, stored as a compact JSON string so the
// bundler keeps it as a single string constant instead of inlining a large
// object literal. To refresh: edit market-backup.json, then run
// \`node scripts/build-market-backup.mjs\`.
`;

await writeFile(
  outPath,
  `${banner}export default ${JSON.stringify(compact)};\n`,
);
console.log(
  `Wrote ${path.relative(projectRoot, outPath)} (${Math.round(compact.length / 1024)} KB of JSON)`,
);
