import { runtime } from "../core/runtime.js";
import { matchesGameTranslations } from "../core/game-localization.js";
import {
  resolveTaskCards,
  taskCardTaskId,
} from "../core/task-card-resolution.js";

const TASK_SELECTOR =
  '[class*="RandomTask_randomTask"]:not([data-mwitools-task-mirror="true"])';
const TASK_LIST_SELECTOR = '[class*="TasksPanel_taskList"]';
const ACTION_DETAIL_SELECTOR =
  '[class*="SkillActionDetail_regularComponent"],[class*="SkillActionDetail_skillActionDetail"],[class*="ActionDetail_actionDetail"],[class*="SkillActionDetail_modalContent"],[class*="ActionDetail_modalContent"]';
const RETURN_TTL_MS = 30_000;

export function taskIdentity(task) {
  return taskCardTaskId(task);
}

function scrollContainerFor(element, { fallbackToDocument = true } = {}) {
  for (let current = element; current; current = current.parentElement) {
    const style = globalThis.getComputedStyle?.(current);
    if (
      current.scrollHeight > current.clientHeight &&
      /auto|scroll/.test(`${style?.overflowY ?? ""} ${style?.overflow ?? ""}`)
    ) {
      return current;
    }
  }
  return fallbackToDocument
    ? (document.scrollingElement ?? document.documentElement)
    : null;
}

function clampScrollTop(scroller, value) {
  const maximum = Math.max(
    0,
    Number(scroller?.scrollHeight || 0) - Number(scroller?.clientHeight || 0),
  );
  return Math.min(maximum, Math.max(0, Number(value) || 0));
}

function centerCardInScroller(card, scroller) {
  const cardRect = card.getBoundingClientRect?.();
  const scrollerRect = scroller.getBoundingClientRect?.();
  if (!cardRect || !scrollerRect) return;
  const target =
    Number(scroller.scrollTop || 0) +
    cardRect.top -
    scrollerRect.top -
    (Number(scroller.clientHeight || 0) - cardRect.height) / 2;
  scroller.scrollTop = clampScrollTop(scroller, target);
}

function taskLayoutSignature(card, list, scroller) {
  const cardRect = card?.getBoundingClientRect?.();
  return [
    card?.dataset.mwitoolsTaskId ?? "",
    list?.children.length ?? 0,
    Math.round(cardRect?.top ?? 0),
    Math.round(cardRect?.height ?? 0),
    Math.round(scroller?.scrollTop ?? 0),
    Math.round(scroller?.scrollHeight ?? 0),
  ].join(":");
}

export function captureTaskReturnContext(card, quests, now = Date.now()) {
  if (!card) return null;
  const cards = [...document.querySelectorAll(TASK_SELECTOR)];
  const resolved = resolveTaskCards(cards, quests, {
    taskActionHrid: (task) => runtime.api.taskActionHrid?.(task),
    taskRemaining: (task) => runtime.api.taskRemaining?.(task) ?? 0,
  }).find((entry) => entry.card === card);
  const originalIndex = Number(card.dataset.mwitoolsOriginalIndex);
  const taskIndex =
    Number.isInteger(resolved?.taskIndex) && resolved.taskIndex >= 0
      ? resolved.taskIndex
      : Number.isInteger(originalIndex)
        ? originalIndex
        : cards.indexOf(card);
  const originalSlot = Number.isInteger(originalIndex)
    ? originalIndex
    : cards.indexOf(card);
  const task = resolved?.task ?? quests?.[taskIndex];
  const scroller = scrollContainerFor(card);
  return {
    taskId: taskIdentity(task),
    originalIndex: originalSlot,
    profession:
      card.dataset.mwitoolsProfession ??
      card.closest("[data-profession]")?.dataset.profession ??
      "",
    scrollTop: Number(scroller?.scrollTop) || 0,
    expiresAt: now + RETURN_TTL_MS,
    sawAction: false,
  };
}

function buttonText(button) {
  return String(
    runtime.api.getOriTextFromElement?.(button) ?? button?.textContent ?? "",
  )
    .replaceAll(/\s+/g, " ")
    .trim();
}

function isGoButton(button) {
  return matchesGameTranslations(
    ["randomTask.go", "questModal.go"],
    buttonText(button),
    { fallbackPatterns: [/^(?:前往|go)$/i] },
  );
}

function isCommitButton(button) {
  return matchesGameTranslations(
    [
      "skillActionDetail.buttons.start",
      "skillActionDetail.buttons.startNow",
      "skillActionDetail.buttons.addToQueue",
    ],
    buttonText(button),
    {
      fallbackPatterns: [
        /^(?:添加任务|添加到队列|加入队列|立即开始|开始任务|开始动作|添加|开始|队列|add task|add to (?:action )?queue|start task|start action|start now|start immediately|add|start|queue)(?:\s*#\d+)?$/i,
      ],
    },
  );
}

function findGameHost() {
  const roots = [];
  const push = (value) => {
    const root = value?.current ?? value;
    if (root && typeof root === "object" && !roots.includes(root))
      roots.push(root);
  };
  const rootElement = document.getElementById("root");
  push(rootElement?._reactRootContainer?.current);
  push(rootElement?._reactRootContainer?._internalRoot?.current);
  for (const element of [rootElement, document.body]) {
    for (const key of Object.getOwnPropertyNames(element ?? {})) {
      if (
        key.startsWith("__reactContainer") ||
        key.startsWith("__reactFiber") ||
        key.startsWith("__reactInternalInstance")
      ) {
        push(element[key]);
      }
    }
  }
  const seen = new Set();
  while (roots.length && seen.size < 50_000) {
    const fiber = roots.pop();
    if (!fiber || seen.has(fiber)) continue;
    seen.add(fiber);
    const host = fiber.stateNode;
    if (
      typeof host?.handleChangeNavTarget === "function" &&
      typeof host?.setState === "function"
    ) {
      return host;
    }
    if (fiber.child) roots.push(fiber.child);
    if (fiber.sibling) roots.push(fiber.sibling);
  }
  return null;
}

function openTasksPage() {
  const host = findGameHost();
  if (host) {
    host.handleChangeNavTarget("tasks");
    return true;
  }
  const buttons = document.querySelectorAll(
    'nav button,[class*="Nav"] button,[class*="nav"] button',
  );
  const taskButton = [...buttons].find((button) =>
    matchesGameTranslations("navigationBar.tasks", buttonText(button), {
      fallbackPatterns: [/^(?:任务|tasks)$/i],
    }),
  );
  taskButton?.click();
  return Boolean(taskButton);
}

function findTaskCard(context) {
  const cards = [...document.querySelectorAll(TASK_SELECTOR)];
  if (context.taskId) {
    const matched =
      cards.find((card) => card.dataset.mwitoolsTaskId === context.taskId) ??
      resolveTaskCards(cards, runtime.state.characterQuests ?? [], {
        taskActionHrid: (task) => runtime.api.taskActionHrid?.(task),
        taskRemaining: (task) => runtime.api.taskRemaining?.(task) ?? 0,
      }).find(({ task }) => taskIdentity(task) === context.taskId)?.card;
    if (matched) return matched;
    return null;
  }
  return cards[context.originalIndex] ?? null;
}

function restoreTaskPosition(context) {
  const card = findTaskCard(context);
  if (card) {
    const list = card.closest(TASK_LIST_SELECTOR);
    const scroller = scrollContainerFor(card, { fallbackToDocument: false });
    if (scroller) centerCardInScroller(card, scroller);
    return {
      restored: true,
      signature: taskLayoutSignature(card, list, scroller),
    };
  }
  const list = document.querySelector(TASK_LIST_SELECTOR);
  const scroller = scrollContainerFor(list, { fallbackToDocument: false });
  if (list && scroller) {
    scroller.scrollTop = clampScrollTop(scroller, context.scrollTop);
    return {
      restored: true,
      signature: taskLayoutSignature(null, list, scroller),
    };
  }
  return { restored: false, signature: "" };
}

runtime.features.register({
  id: "taskAutoReturn",
  setting: "taskAutoReturn",
  scope: "character",
  initialize({ scope }) {
    let pending = null;
    let expiryTimer = null;
    let returnTimer = null;
    let restoreTimer = null;
    const clearTimers = () => {
      if (expiryTimer !== null) clearTimeout(expiryTimer);
      if (returnTimer !== null) clearTimeout(returnTimer);
      if (restoreTimer !== null) clearTimeout(restoreTimer);
      expiryTimer = returnTimer = restoreTimer = null;
    };
    const clearPending = ({ cancelTaskReturn = true } = {}) => {
      clearTimers();
      pending = null;
      if (cancelTaskReturn) runtime.api.cancelTemporaryTaskReturn?.();
    };
    const armExpiry = () => {
      if (expiryTimer !== null) clearTimeout(expiryTimer);
      expiryTimer = setTimeout(clearPending, RETURN_TTL_MS);
    };
    const returnToOrigin = () => {
      if (!pending || pending.expiresAt <= Date.now()) {
        clearPending();
        return;
      }
      const context = pending;
      clearPending({ cancelTaskReturn: false });
      runtime.api.resumeTemporaryTaskReturn?.();
      if (!openTasksPage()) {
        runtime.api.cancelTemporaryTaskReturn?.();
        return;
      }
      let attempts = 0;
      let previousSignature = "";
      let stableSamples = 0;
      const restore = () => {
        restoreTimer = null;
        const result = restoreTaskPosition(context);
        if (result.restored) {
          stableSamples =
            result.signature === previousSignature ? stableSamples + 1 : 1;
          previousSignature = result.signature;
          if (stableSamples >= 2) return;
        } else {
          stableSamples = 0;
          previousSignature = "";
        }
        if (attempts >= 40) return;
        attempts += 1;
        restoreTimer = setTimeout(restore, 50);
      };
      restoreTimer = setTimeout(restore, 0);
    };
    const scheduleReturn = (delay = 0) => {
      if (!pending) return;
      if (returnTimer !== null) clearTimeout(returnTimer);
      returnTimer = setTimeout(() => {
        returnTimer = null;
        returnToOrigin();
      }, delay);
    };
    const observeAction = () => {
      if (!pending) return;
      const action = document.querySelector(ACTION_DETAIL_SELECTOR);
      if (action) pending.sawAction = true;
      else if (pending.sawAction) scheduleReturn();
    };
    scope.event(
      document,
      "click",
      (event) => {
        const button = event.target?.closest?.("button");
        if (!button) return;
        const card = button.closest(TASK_SELECTOR);
        if (card && isGoButton(button)) {
          pending = captureTaskReturnContext(
            card,
            runtime.state.characterQuests ?? [],
          );
          if (pending) {
            runtime.api.armTemporaryTaskReturn?.(pending.expiresAt);
            armExpiry();
          }
          return;
        }
        if (
          pending &&
          button.closest(ACTION_DETAIL_SELECTOR) &&
          isCommitButton(button)
        ) {
          scheduleReturn(500);
        }
      },
      true,
    );
    const observer = new MutationObserver(observeAction);
    scope.observer(observer, document.body, { childList: true, subtree: true });
    scope.add(clearPending);
  },
});
