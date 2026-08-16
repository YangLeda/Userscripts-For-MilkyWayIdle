import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://www.milkywayidle.com/",
});
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.unsafeWindow = dom.window;
globalThis.localStorage = dom.window.localStorage;

const {
  createDuplicateWarningMonitor,
  detectDuplicateScripts,
  readMutedDuplicateScriptIds,
  showDuplicateWarning,
} = await import("../src/features/duplicate-script-warning.js");

test("detects only active standalone integrations", () => {
  const target = {
    MWIMM: { ready: true },
    kbd_calculateTotalNetworth() {},
  };
  assert.deepEqual(
    detectDuplicateScripts({
      pageWindow: target,
      documentRef: document,
      dpsWasPresent: true,
    }),
    [
      "MWI 市场伴侣 / MWI Market Mate",
      "银河奶牛 DPS 统计 / Galaxy Cow DPS",
      "Everyday Profit Plus Fixed",
    ],
  );
  assert.deepEqual(
    detectDuplicateScripts({
      pageWindow: {},
      documentRef: document,
      dpsWasPresent: false,
    }),
    [],
  );
});

test("warning is bilingual and remains until manually closed", () => {
  let scheduled = false;
  const warning = showDuplicateWarning(["Everyday Profit Plus Fixed"], {
    documentRef: document,
    isZH: true,
    schedule: () => {
      scheduled = true;
    },
  });
  assert.equal(scheduled, false);
  assert.match(warning.textContent, /建议在脚本管理器中停用或删除/);
  warning.querySelector("button").click();
  assert.equal(document.getElementById(warning.id), null);

  const capped = showDuplicateWarning(["MWI Market Mate"], {
    documentRef: document,
    isZH: false,
  });
  assert.match(capped.textContent, /Disable or remove/);
  capped.remove();
});

test("detects the current Everyday Profit Plus Fixed DOM markers", () => {
  const chart = document.createElement("script");
  chart.id = "everyday-profit-chartjs";
  document.body.appendChild(chart);
  assert.deepEqual(
    detectDuplicateScripts({
      pageWindow: {},
      documentRef: document,
      dpsWasPresent: false,
    }),
    ["Everyday Profit Plus Fixed"],
  );
  chart.remove();
});

test("detects TaskManager only from its dedicated marker combination", () => {
  const taskSort = document.createElement("div");
  taskSort.id = "TaskSort";
  document.body.append(taskSort);
  assert.doesNotMatch(
    detectDuplicateScripts({
      pageWindow: {},
      documentRef: document,
      dpsWasPresent: false,
    }).join(" "),
    /TaskManager/,
  );

  const actionIcon = document.createElement("div");
  actionIcon.id = "ActionIcon";
  document.body.append(actionIcon);
  assert.match(
    detectDuplicateScripts({
      pageWindow: {},
      documentRef: document,
      dpsWasPresent: false,
    }).join(" "),
    /MWI TaskManager/,
  );
  assert.doesNotMatch(
    detectDuplicateScripts({
      pageWindow: {},
      documentRef: document,
      dpsWasPresent: false,
      taskInsightsEnabled: false,
    }).join(" "),
    /TaskManager/,
  );
  taskSort.remove();
  actionIcon.remove();
});

test("per-script mute persists and suppresses later warnings", () => {
  localStorage.removeItem("MWITools_muted_duplicate_scripts_v1");
  let renderOptions;
  class FakeObserver {
    observe() {}
    disconnect() {}
  }
  const monitor = createDuplicateWarningMonitor({
    documentRef: document,
    detect: () => ["MWI TaskManager"],
    render: (_duplicates, options) => {
      renderOptions = options;
    },
    storage: localStorage,
    setIntervalRef: () => undefined,
    MutationObserverRef: FakeObserver,
  });
  renderOptions.onMute();
  assert.deepEqual(
    [...readMutedDuplicateScriptIds(localStorage)],
    ["mwi-task-manager"],
  );
  renderOptions = null;
  monitor.scan();
  assert.equal(renderOptions, null);
  localStorage.removeItem("MWITools_muted_duplicate_scripts_v1");
  monitor.scan();
  assert.ok(renderOptions);
  monitor.destroy();
  localStorage.removeItem("MWITools_muted_duplicate_scripts_v1");
});

test("duplicate monitor coalesces mutations and ignores its own warning", () => {
  document.body.replaceChildren();
  let duplicates = ["Everyday Profit Plus Fixed"];
  const scheduled = [];
  let intervalCallback;
  let intervalCleared = false;
  let observerCallback;
  let observerDisconnected = false;
  class FakeObserver {
    constructor(callback) {
      observerCallback = callback;
    }
    observe() {}
    disconnect() {
      observerDisconnected = true;
    }
  }
  const monitor = createDuplicateWarningMonitor({
    documentRef: document,
    detect: () => duplicates,
    isZH: true,
    scheduleTask: (callback) => scheduled.push(callback),
    setIntervalRef: (callback) => {
      intervalCallback = callback;
      return 17;
    },
    clearIntervalRef: (id) => {
      assert.equal(id, 17);
      intervalCleared = true;
    },
    MutationObserverRef: FakeObserver,
  });
  const warning = document.getElementById("mwitools-duplicate-script-warning");
  const content = warning.lastElementChild;
  const initialText = content.textContent;

  observerCallback([{ target: content }]);
  assert.equal(scheduled.length, 0);

  observerCallback([{ target: document.body }]);
  observerCallback([{ target: document.body }]);
  intervalCallback();
  assert.equal(scheduled.length, 1);
  scheduled.shift()();
  assert.equal(content.textContent, initialText);

  duplicates = [...duplicates, "MWI 市场伴侣 / MWI Market Mate"];
  observerCallback([{ target: document.body }]);
  scheduled.shift()();
  assert.match(content.textContent, /MWI 市场伴侣/);

  warning.querySelector("button").click();
  monitor.schedule();
  assert.equal(scheduled.length, 0);
  assert.equal(document.getElementById(warning.id), null);

  monitor.destroy();
  assert.equal(observerDisconnected, true);
  assert.equal(intervalCleared, true);
});
