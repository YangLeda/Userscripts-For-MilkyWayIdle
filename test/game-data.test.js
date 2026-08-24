import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

let reads = 0;
let availableData = null;
globalThis.unsafeWindow = {
  localStorageUtil: {
    getInitClientData() {
      reads += 1;
      return availableData;
    },
  },
};
const storedValues = [];
globalThis.GM_setValue = (key, value) => storedValues.push([key, value]);

const { runtime } = await import("../src/core/runtime.js");
const { getGameClientData, refreshGameClientData, whenGameClientDataReady } =
  await import("../src/core/game-data.js");

test("client data waits for the game cache, then publishes the complete official object", async () => {
  assert.equal(refreshGameClientData(), null);
  assert.equal(reads, 1);

  const ready = whenGameClientDataReady();
  const pending = await Promise.race([
    ready.then(() => "ready"),
    Promise.resolve("pending"),
  ]);
  assert.equal(pending, "pending");

  availableData = {
    versionTimestamp: "2026-08-14T00:00:00Z",
    actionDetailMap: {
      "/actions/milking/cow": { name: "Cow" },
    },
    itemDetailMap: { "/items/milk": { name: "Milk" } },
    combatMonsterDetailMap: {
      "/monsters/fly": { name: "Fly" },
    },
    abilityDetailMap: { "/abilities/strike": { name: "Strike" } },
    extraFutureMap: { preserved: true },
  };

  assert.equal(refreshGameClientData(), availableData);
  assert.equal(await ready, availableData);
  assert.equal(getGameClientData(), availableData);
  assert.equal(runtime.state.clientData, availableData);
  assert.equal(runtime.state.clientData.extraFutureMap.preserved, true);
  assert.equal(
    runtime.state.initData_combatMonsterDetailMap,
    availableData.combatMonsterDetailMap,
  );
  assert.equal(
    runtime.state.initData_monsterDetailMap,
    availableData.combatMonsterDetailMap,
  );
  assert.equal(runtime.state.itemEnNameToHridMap.Milk, "/items/milk");
  assert.deepEqual(storedValues, [
    ["init_client_data", JSON.stringify(availableData)],
  ]);
  assert.equal(reads, 2, "only explicit readiness attempts read game storage");
});
