import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("DPS UI refreshes once per second while socket calculations stay event-driven", async () => {
  const source = await readFile(
    new URL("../src/features/dps/90-application.js", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /Session\.advanceBuckets\(\);[\s\S]*?if \(KikiMeter\.isOpen\(\)\) renderSelectedPanels\(\);\s*}, 1000\);/,
  );
  assert.match(source, /Session\.addTeamDamage\(/);
  assert.match(source, /Session\.addPlayerDamage\(/);
});
