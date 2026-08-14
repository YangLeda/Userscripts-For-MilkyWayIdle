import assert from "node:assert/strict";
import test from "node:test";

import { subscribeMutationChannel } from "../src/core/mutation-channel.js";
import { runtime } from "../src/core/runtime.js";

class FakeMutationObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    this.disconnectCalls = 0;
    this.observeCalls = [];
    FakeMutationObserver.instances.push(this);
  }

  observe(target, options) {
    this.observeCalls.push({ target, options });
  }

  disconnect() {
    this.disconnectCalls += 1;
  }

  emit(records = []) {
    this.callback(records, this);
  }
}

const originalMutationObserver = globalThis.MutationObserver;

test.beforeEach(() => {
  FakeMutationObserver.instances = [];
  globalThis.MutationObserver = FakeMutationObserver;
});

test.afterEach(() => {
  if (originalMutationObserver === undefined) {
    delete globalThis.MutationObserver;
  } else {
    globalThis.MutationObserver = originalMutationObserver;
  }
});

test("named mutation channels share one observer until the last scope exits", () => {
  const target = {};
  const firstScope = runtime.createCleanupScope();
  const secondScope = runtime.createCleanupScope();
  const calls = [];
  const options = { childList: true, subtree: true };

  subscribeMutationChannel(
    { name: "test-shared", target, options, scope: firstScope },
    () => calls.push("first"),
  );
  subscribeMutationChannel(
    { name: "test-shared", target, options, scope: secondScope },
    () => calls.push("second"),
  );

  assert.equal(FakeMutationObserver.instances.length, 1);
  assert.deepEqual(FakeMutationObserver.instances[0].observeCalls, [
    { target, options },
  ]);
  FakeMutationObserver.instances[0].emit([{}]);
  assert.deepEqual(calls, ["first", "second"]);

  firstScope.cleanup();
  assert.equal(FakeMutationObserver.instances[0].disconnectCalls, 0);
  FakeMutationObserver.instances[0].emit([{}]);
  assert.deepEqual(calls, ["first", "second", "second"]);

  secondScope.cleanup();
  secondScope.cleanup();
  assert.equal(FakeMutationObserver.instances[0].disconnectCalls, 1);
});

test("mutation channel errors are isolated and incompatible reuse is rejected", () => {
  const target = {};
  const scope = runtime.createCleanupScope();
  const calls = [];
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    subscribeMutationChannel(
      {
        name: "test-isolation",
        target,
        options: { childList: true, subtree: true },
        scope,
      },
      () => {
        throw new Error("subscriber failed");
      },
    );
    subscribeMutationChannel(
      {
        name: "test-isolation",
        target,
        options: { subtree: true, childList: true },
        scope,
      },
      () => calls.push("healthy"),
    );
    assert.throws(
      () =>
        subscribeMutationChannel(
          {
            name: "test-isolation",
            target: {},
            options: { childList: true, subtree: true },
            scope,
          },
          () => {},
        ),
      /different target or options/,
    );
    assert.throws(
      () =>
        subscribeMutationChannel(
          {
            name: "test-isolation",
            target,
            options: { childList: true },
            scope,
          },
          () => {},
        ),
      /different target or options/,
    );

    FakeMutationObserver.instances[0].emit([{}]);
    assert.deepEqual(calls, ["healthy"]);
    assert.equal(errors.length, 1);
  } finally {
    console.error = originalError;
    scope.cleanup();
  }
});

test("a cleaned channel can be recreated for a new character scope", () => {
  const target = {};
  const firstScope = runtime.createCleanupScope();
  subscribeMutationChannel(
    {
      name: "test-character",
      target,
      options: { childList: true, subtree: true },
      scope: firstScope,
    },
    () => {},
  );
  firstScope.cleanup();

  const secondScope = runtime.createCleanupScope();
  subscribeMutationChannel(
    {
      name: "test-character",
      target,
      options: { childList: true, subtree: true },
      scope: secondScope,
    },
    () => {},
  );

  assert.equal(FakeMutationObserver.instances.length, 2);
  assert.equal(FakeMutationObserver.instances[0].disconnectCalls, 1);
  secondScope.cleanup();
  assert.equal(FakeMutationObserver.instances[1].disconnectCalls, 1);
});
