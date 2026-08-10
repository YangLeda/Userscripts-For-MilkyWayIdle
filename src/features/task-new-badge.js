import { runtime } from "../core/runtime.js";

const STYLE_ID = "mwitools-task-new-style";
const TASK_SELECTOR = 'div[class*="RandomTask_randomTask"]';

export function questId(quest) {
  return String(
    quest?.id ?? quest?.characterQuestID ?? quest?.characterQuestId ?? "",
  );
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
    };
  } catch {
    return { known: new Set(), fresh: new Set() };
  }
}

export function writeTaskNewState(storageKey, state) {
  localStorage.setItem(
    storageKey,
    JSON.stringify({ known: [...state.known], fresh: [...state.fresh] }),
  );
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
    ${TASK_SELECTOR}.mwi-task-is-new{position:relative;box-shadow:inset 0 0 0 2px rgba(250,190,55,.78),0 0 13px rgba(247,174,35,.2)!important;background-color:rgba(245,170,35,.075)!important}
    .mwi-task-new-badge{position:absolute;z-index:5;right:6px;top:6px;padding:2px 7px;border-radius:999px;background:#f0aa2e;color:#221704;font-size:10px;font-weight:800;line-height:16px;box-shadow:0 2px 7px rgba(0,0,0,.35);pointer-events:none}
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
    const initial = runtime.state.characterQuests ?? [];
    const currentIds = new Set(initial.map(questId).filter(Boolean));
    // First install/character initialization is only a baseline. Persisted new
    // markers are retained so a task received while the page was closed remains visible.
    for (const id of currentIds) state.known.add(id);
    for (const id of [...state.fresh]) {
      if (!currentIds.has(id)) state.fresh.delete(id);
    }
    writeTaskNewState(storageKey, state);

    const markRead = (id) => {
      if (!state.fresh.delete(id)) return;
      writeTaskNewState(storageKey, state);
      render();
    };
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
      cards.forEach((card, index) => {
        const task =
          quests[Number(card.dataset.mwitoolsOriginalIndex ?? index)] ?? {};
        const id = questId(task);
        const fresh = id && state.fresh.has(id) && !isCompleted(task);
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
        render();
      }),
    );
    scope.event(
      document,
      "click",
      (event) => {
        const card = event.target?.closest?.(TASK_SELECTOR);
        if (!card) return;
        const fallbackIndex = [
          ...document.querySelectorAll(TASK_SELECTOR),
        ].indexOf(card);
        const liveIndex = Number(
          card.dataset.mwitoolsOriginalIndex ?? fallbackIndex,
        );
        markRead(questId((runtime.state.characterQuests ?? [])[liveIndex]));
      },
      true,
    );
    render();
    scope.interval(render, 350);
    scope.add(cleanupDom);
  },
});

Object.assign(runtime.api, {
  getNewTaskIds() {
    const key = taskNewStorageKey(runtime.state.currentCharacterId);
    return [...readTaskNewState(key).fresh];
  },
});
