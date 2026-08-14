import { runtime } from "../core/runtime.js";
import { matchesGameTranslations } from "../core/game-localization.js";
import { resolveTaskCards } from "../core/task-card-resolution.js";
import { createFrameScheduler } from "../core/frame-scheduler.js";

const STYLE_ID = "mwitools-task-train-planner-style";
const CONTROL_CLASS = "mwi-task-train-planner";
const TASK_SELECTOR =
  'div[class*="RandomTask_randomTask"]:not([data-mwitools-task-mirror="true"])';
const OWNED_TASK_SELECTOR =
  '.mwi-task-train-planner,.mwi-task-insight,.mwi-task-toolbar,.mwi-task-profession-group,.mwi-task-combat-location,.mwi-task-combat-mode,.mwi-task-bg,.mwi-task-merged-note,.mwi-task-merge-toast,.mwi-task-new-badge,[data-mwitools-task-mirror="true"]';

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${CONTROL_CLASS}{flex:0 1 auto;min-width:0;max-width:100%;box-sizing:border-box;margin-right:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    button.${CONTROL_CLASS}{height:28px;padding:0 8px;border:1px solid rgba(144,166,235,.55);border-radius:4px;background:#282844;color:#e8e8ef;font:600 11px/1 Roboto,Arial,sans-serif;cursor:pointer}
    button.${CONTROL_CLASS}:hover{filter:brightness(1.16)}
    span.${CONTROL_CLASS}{padding:0 8px;color:#8f96ad;font:italic 11px/28px Roboto,Arial,sans-serif;user-select:none}
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function primaryOutput(actionHrid) {
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  return runtime.api.getExpectedOutputs?.(detail)?.[0]?.itemHrid ?? "";
}

function taskActionHrid(task) {
  return runtime.api.taskActionHrid?.(task) ?? null;
}

function taskRemaining(task) {
  return runtime.api.taskRemaining?.(task) ?? 0;
}

export function collectTaskTrainGroups(quests = []) {
  const groups = new Map();
  const entries = quests.map((task, index) => {
    const actionHrid = taskActionHrid(task);
    const remaining = taskRemaining(task);
    const outputHrid = actionHrid ? primaryOutput(actionHrid) : "";
    const depth = outputHrid
      ? runtime.api.trainPlanning.trainChainDepth(outputHrid)
      : -1;
    const root =
      depth >= 0 ? runtime.api.trainPlanning.trainChainRoot(outputHrid) : "";
    const entry = {
      index,
      task,
      actionHrid,
      outputHrid,
      remaining,
      depth,
      root,
      state: remaining <= 0 ? "done" : depth < 0 ? "isolated" : "planned",
    };
    if (entry.state === "planned") {
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(entry);
    }
    return entry;
  });

  for (const group of groups.values()) {
    group.sort(
      (left, right) => right.depth - left.depth || left.index - right.index,
    );
    const chain = runtime.api.trainPlanning.buildTrainChain(
      group[0].outputHrid,
    );
    if (!chain.steps.length || chain.cycle || chain.truncated) {
      for (const entry of group) entry.state = "isolated";
      groups.delete(group[0].root);
    } else {
      group[0].state = "top";
    }
  }
  return { entries, groups };
}

export function createTaskTrainPlan(
  root,
  quests = runtime.state.characterQuests ?? [],
) {
  const { groups } = collectTaskTrainGroups(quests);
  const group = groups.get(root);
  if (!group?.length) return null;
  const taskCounts = {};
  for (const entry of group) {
    taskCounts[entry.outputHrid] =
      (taskCounts[entry.outputHrid] ?? 0) + entry.remaining;
  }
  return runtime.api.trainPlanning.createTrainPlan(
    group[0].outputHrid,
    taskCounts,
  );
}

function findTaskNavigation(card) {
  return [...card.querySelectorAll("button")].find((button) =>
    matchesGameTranslations(
      ["randomTask.go", "questModal.go"],
      button.textContent,
      { fallbackPatterns: [/^(?:前往|go)$/i] },
    ),
  );
}

export function insertBeforeTaskNavigation(card, control) {
  const navigation = findTaskNavigation(card);
  if (navigation?.parentElement) {
    navigation.parentElement.insertBefore(control, navigation);
    return true;
  }
  return false;
}

function plannerButton(entry, signature) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = CONTROL_CLASS;
  button.dataset.signature = signature;
  button.textContent = t("🚂 规划火车", "🚂 Plan train");
  button.title = t(
    "合并同一升级链全部未完成任务并按最新库存重新规划",
    "Combine all unfinished tasks in this upgrade chain and recalculate from current inventory",
  );
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const plan = createTaskTrainPlan(entry.root);
    if (!plan?.steps?.length) return;
    runtime.api.semiAutoTrain?.start(plan);
  });
  return button;
}

function plannerLabel(text, title, signature) {
  const label = document.createElement("span");
  label.className = CONTROL_CLASS;
  label.dataset.signature = signature;
  label.textContent = text;
  label.title = title;
  return label;
}

export function renderTaskTrainPlanner(
  cards = [...document.querySelectorAll(TASK_SELECTOR)],
  quests = runtime.state.characterQuests ?? [],
) {
  if (!cards.length) return true;
  const { entries } = collectTaskTrainGroups(quests);
  const resolvedCards = resolveTaskCards(cards, quests, {
    taskActionHrid,
    taskRemaining,
  });
  let settled = true;
  for (const { card, resolved, taskIndex } of resolvedCards) {
    if (!resolved) {
      settled = false;
      continue;
    }
    const entry = entries[taskIndex];
    const signature = entry
      ? [entry.state, entry.root, entry.remaining, runtime.config.isZH].join(
          ":",
        )
      : "none";
    const existingControls = [...card.querySelectorAll(`.${CONTROL_CLASS}`)];
    if (!entry || entry.state === "done" || entry.state === "isolated") {
      existingControls.forEach((node) => node.remove());
      continue;
    }
    const navigation = findTaskNavigation(card);
    if (!navigation?.parentElement) {
      settled = false;
      continue;
    }
    if (
      existingControls.length === 1 &&
      existingControls[0].dataset.signature === signature &&
      existingControls[0].parentElement === navigation.parentElement &&
      existingControls[0].nextElementSibling === navigation
    ) {
      continue;
    }
    existingControls.forEach((node) => node.remove());
    if (entry.state === "top") {
      insertBeforeTaskNavigation(card, plannerButton(entry, signature));
    } else if (entry.state === "planned") {
      insertBeforeTaskNavigation(
        card,
        plannerLabel(
          t("已被规划", "Included in plan"),
          t(
            "已由同一升级链的最高级任务统一规划",
            "Included by the highest-level task in this upgrade chain",
          ),
          signature,
        ),
      );
    }
  }
  return settled;
}

function cleanup() {
  document
    .querySelectorAll(`.${CONTROL_CLASS}`)
    .forEach((node) => node.remove());
  document.getElementById(STYLE_ID)?.remove();
}

export function shouldRenderTaskTrainMutations(records) {
  const removedControl = records.some((record) => {
    const target =
      record.target?.nodeType === 1
        ? record.target
        : record.target?.parentElement;
    return (
      target?.isConnected &&
      target?.closest?.(TASK_SELECTOR) &&
      [...(record.removedNodes ?? [])].some(
        (node) => node?.nodeType === 1 && node.matches?.(`.${CONTROL_CLASS}`),
      )
    );
  });
  const addedControl = records.some((record) =>
    [...(record.addedNodes ?? [])].some(
      (node) => node?.nodeType === 1 && node.matches?.(`.${CONTROL_CLASS}`),
    ),
  );
  if (removedControl && !addedControl) return true;
  return records.some((record) => {
    const target =
      record.target?.nodeType === 1
        ? record.target
        : record.target?.parentElement;
    if (target?.closest?.(OWNED_TASK_SELECTOR)) return false;
    const changedNodes = [
      ...(record.addedNodes ?? []),
      ...(record.removedNodes ?? []),
    ].filter((node) => node?.nodeType === 1);
    if (
      changedNodes.length &&
      changedNodes.every(
        (node) =>
          node.matches?.(OWNED_TASK_SELECTOR) ||
          node.closest?.(OWNED_TASK_SELECTOR),
      )
    ) {
      return false;
    }
    if (target?.closest?.(TASK_SELECTOR)) return true;
    return changedNodes.some(
      (node) =>
        node.matches?.(TASK_SELECTOR) || node.querySelector?.(TASK_SELECTOR),
    );
  });
}

runtime.features.register({
  id: "taskTrainPlanner",
  setting: "taskTrainPlanner",
  scope: "character",
  dependsOn: ["semiAutoTrain"],
  initialize({ scope }) {
    addStyles();
    let settleRetries = 0;
    let renderScheduler = null;
    const render = () => {
      const cards = [...document.querySelectorAll(TASK_SELECTOR)];
      const quests = runtime.state.characterQuests ?? [];
      const settled = renderTaskTrainPlanner(cards, quests);
      if (!settled && settleRetries < 3) {
        settleRetries += 1;
        renderScheduler.schedule();
      } else {
        settleRetries = 0;
      }
    };
    renderScheduler = createFrameScheduler(render);
    const schedule = () => renderScheduler.schedule();
    render();
    const observer = new MutationObserver((records) => {
      if (shouldRenderTaskTrainMutations(records)) schedule();
    });
    scope.observer(observer, document.body, {
      childList: true,
      subtree: true,
    });
    scope.add(runtime.onMessage("quests_updated", schedule));
    scope.add(() => {
      renderScheduler.cancel();
      cleanup();
    });
  },
});

Object.assign(runtime.api, {
  collectTaskTrainGroups,
  createTaskTrainPlan,
});
