import assert from "node:assert/strict";
import test from "node:test";

const { runtime } = await import("../src/core/runtime.js");

test("feature lifecycle isolates failure and cleans repeated enable/disable", async () => {
  runtime.settings.get = () => true;
  let activeResources = 0;
  runtime.features.register({
    id: "test-cleanup-feature",
    initialize({ scope }) {
      activeResources += 1;
      scope.add(() => {
        activeResources -= 1;
      });
    },
  });
  runtime.features.register({
    id: "test-failing-feature",
    initialize() {
      throw new Error("expected failure");
    },
  });

  await runtime.features.enable("test-cleanup-feature");
  await runtime.features.enable("test-cleanup-feature");
  assert.equal(activeResources, 1);
  await runtime.features.enable("test-failing-feature");
  assert.equal(
    runtime.features.getStatus("test-failing-feature").status,
    "failed",
  );
  assert.equal(
    runtime.features.getStatus("test-cleanup-feature").status,
    "active",
  );
  await runtime.features.disable("test-cleanup-feature");
  await runtime.features.disable("test-cleanup-feature");
  assert.equal(activeResources, 0);
});

test("performance onboarding can hold character features until initialization resumes", async () => {
  runtime.settings.get = () => true;
  let initializeCount = 0;
  runtime.features.pauseInitialization();
  runtime.features.register({
    id: "test-onboarding-gated-feature",
    scope: "character",
    initialize() {
      initializeCount += 1;
    },
  });

  await runtime.features.handleCharacterData({ character: { id: "guide" } });
  assert.equal(initializeCount, 0);
  assert.equal(
    runtime.features.getStatus("test-onboarding-gated-feature").status,
    "waiting",
  );

  runtime.features.resumeInitialization();
  await runtime.features.enable("test-onboarding-gated-feature");
  assert.equal(initializeCount, 1);
  assert.equal(
    runtime.features.getStatus("test-onboarding-gated-feature").status,
    "active",
  );
  await runtime.features.disable("test-onboarding-gated-feature");
});
