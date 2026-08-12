import { runtime } from "../core/runtime.js";
import {
  resolveTaskCards,
  taskCardTaskId,
} from "../core/task-card-resolution.js";

const STYLE_ID = "mwitools-task-new-style";
const TASK_SELECTOR =
  'div[class*="RandomTask_randomTask"]:not([data-mwitools-task-mirror="true"])';
const liveTaskNewStates = new Map();

export function questId(quest) {
  return taskCardTaskId(quest);
}

function isRemoved(quest) {
  return Boolean(
    quest?.isClaimed ||
    quest?.claimed ||
    quest?.isDeleted ||
    quest?.deleted ||
    String(quest?.status ?? "")
      .toLowerCase()
      .includes("claimed"),
  );
}

function isCompleted(quest) {
  if (isRemoved(quest)) return true;
  const target = Number(
    quest?.targetCount ?? quest?.requiredCount ?? quest?.goalCount,
  );
  const current = Number(
    quest?.currentCount ?? quest?.completedCount ?? quest?.progressCount,
  );
  return Number.isFinite(target) && target > 0 && Number.isFinite(current)
    ? current >= target
    : Boolean(quest?.isCompleted || quest?.completed);
}

export function taskNewStorageKey(
  characterId,
  server = globalThis.location?.hostname ?? "unknown",
) {
  return `MWITools_task_new_v1:${server}:${String(characterId ?? "")}`;
}

export function readTaskNewState(storageKey) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "null");
    return {
      known: new Set(Array.isArray(value?.known) ? value.known : []),
      fresh: new Set(Array.isArray(value?.fresh) ? value.fresh : []),
      initialized:
        value?.initialized === true ||
        (Array.isArray(value?.known) && value.known.length > 0),
    };
  } catch {
    return { known: new Set(), fresh: new Set(), initialized: false };
  }
}

export function writeTaskNewState(storageKey, state) {
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      initialized: state.initialized === true,
      known: [...state.known],
      fresh: [...state.fresh],
    }),
  );
}

export function initializeQuestState(state, quests) {
  const firstBaseline = state.initialized !== true;
  const currentIds = new Set((quests ?? []).map(questId).filter(Boolean));
  for (const id of currentIds) {
    if (!firstBaseline && !state.known.has(id)) state.fresh.add(id);
    state.known.add(id);
  }
  for (const id of [...state.fresh]) {
    if (!currentIds.has(id)) state.fresh.delete(id);
  }
  state.initialized = true;
  return state;
}

export function applyQuestUpdates(state, updates) {
  for (const update of updates ?? []) {
    const id = questId(update);
    if (!id) continue;
    if (isRemoved(update) || isCompleted(update)) {
      state.fresh.delete(id);
      state.known.delete(id);
      continue;
    }
    if (!state.known.has(id)) state.fresh.add(id);
    state.known.add(id);
  }
  return state;
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    ${TASK_SELECTOR}.mwi-task-is-new{position:relative}
    .mwi-task-new-badge{position:absolute;z-index:5;right:5px;top:5px;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:auto!important;min-width:18px!important;max-width:max-content!important;height:18px!important;min-height:18px!important;margin:0!important;padding:0 4px!important;flex:0 0 auto!important;border:1px solid rgba(255,220,128,.72);border-radius:4px;background:#f0aa2e;color:#221704;font-size:9px;font-weight:800;line-height:16px;letter-spacing:0;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.32);pointer-events:none}
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function cleanupDom() {
  document
    .querySelectorAll(".mwi-task-new-badge")
    .forEach((node) => node.remove());
  document.querySelectorAll(".mwi-task-is-new").forEach((node) => {
    node.classList.remove("mwi-task-is-new");
    delete node.dataset.mwitoolsTaskNewWired;
  });
  document.getElementById(STYLE_ID)?.remove();
}

runtime.features.register({
  id: "taskNewBadge",
  setting: "taskNewBadge",
  scope: "character",
  dependsOn: ["taskInsights"],
  initialize({ scope, characterId }) {
    addStyles();
    const storageKey = taskNewStorageKey(characterId);
    const state = readTaskNewState(storageKey);
    liveTaskNewStates.set(storageKey, state);
    const initial = runtime.state.characterQuests ?? [];
    // Only the first-ever snapshot is a baseline. On later page loads, tasks
    // absent from the persisted baseline are new even if they were received
    // while the task page (or the whole game page) was closed.
    initializeQuestState(state, initial);
    writeTaskNewState(storageKey, state);

    const render = () => {
      const quests = runtime.state.characterQuests ?? [];
      const activeIds = new Set(quests.map(questId).filter(Boolean));
      let changed = false;
      for (const id of [...state.fresh]) {
        if (!activeIds.has(id)) {
          state.fresh.delete(id);
          state.known.delete(id);
          changed = true;
        }
      }
      if (changed) writeTaskNewState(storageKey, state);
      const cards = [...document.querySelectorAll(TASK_SELECTOR)];
      const resolvedCards = resolveTaskCards(cards, quests, {
        taskActionHrid: (task) => runtime.api.taskActionHrid?.(task),
        taskRemaining: (task) => runtime.api.taskRemaining?.(task) ?? 0,
      });
      resolvedCards.forEach(({ card, task }) => {
        const id = questId(task);
        const fresh = Boolean(
          id && runtime.state.mwitoolsPageNewTaskIds?.has?.(id),
        );
        card.classList.toggle("mwi-task-is-new", Boolean(fresh));
        let badge = card.querySelector(":scope > .mwi-task-new-badge");
        if (fresh && !badge) {
          badge = document.createElement("span");
          badge.className = "mwi-task-new-badge";
          badge.textContent = runtime.config.isZH ? "新" : "NEW";
          card.appendChild(badge);
        } else if (!fresh) {
          badge?.remove();
        }
      });
    };

    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      (globalThis.requestAnimationFrame ?? globalThis.setTimeout)(() => {
        pending = false;
        render();
      });
    };

    scope.add(
      runtime.onMessage("quests_updated", (payload) => {
        const updates =
          payload.endCharacterQuests ?? payload.characterQuests ?? [];
        applyQuestUpdates(state, updates);
        const liveIds = new Set(
          (runtime.state.characterQuests ?? []).map(questId),
        );
        for (const id of [...state.fresh]) {
          if (!liveIds.has(id)) state.fresh.delete(id);
        }
        writeTaskNewState(storageKey, state);
        schedule();
      }),
    );
    // Task cards only (re)appear on navigation to the tasks panel (a click) or
    // on quests_updated (handled above). Instead of a body-wide observer that
    // wakes on every combat DOM mutation, schedule a render on click plus short
    // trailing passes to catch React's asynchronous re-render of the freshly
    // opened panel. render() no-ops when no task cards are present.
    let trailing = [];
    const onInteraction = () => {
      schedule();
      for (const id of trailing) clearTimeout(id);
      trailing = [250, 700].map((delay) => setTimeout(schedule, delay));
    };
    scope.event(document, "click", onInteraction, true);
    scope.add(() => {
      for (const id of trailing) clearTimeout(id);
    });
    render();
    scope.add(() => {
      pending = false;
      if (liveTaskNewStates.get(storageKey) === state) {
        liveTaskNewStates.delete(storageKey);
      }
      cleanupDom();
    });
  },
});

Object.assign(runtime.api, {
  getNewTaskIds() {
    const key = taskNewStorageKey(runtime.state.currentCharacterId);
    const state = liveTaskNewStates.get(key) ?? readTaskNewState(key);
    initializeQuestState(state, runtime.state.characterQuests ?? []);
    writeTaskNewState(key, state);
    return [...state.fresh];
  },
  acknowledgeNewTaskIds(ids) {
    const key = taskNewStorageKey(runtime.state.currentCharacterId);
    const state = liveTaskNewStates.get(key) ?? readTaskNewState(key);
    for (const id of ids ?? []) state.fresh.delete(String(id));
    writeTaskNewState(key, state);
  },
});
