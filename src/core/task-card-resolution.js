import { runtime } from "./runtime.js";
import { getLocalizedEntityName } from "./game-localization.js";

const NAME_SELECTOR = '[class*="RandomTask_name"]';

function normalize(value) {
  return String(value ?? "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export function taskCardTaskId(task) {
  const value =
    task?.id ??
    task?.characterQuestID ??
    task?.characterQuestId ??
    task?.questID ??
    task?.questId ??
    task?.characterTaskID ??
    task?.characterTaskId;
  return value === null || value === undefined ? "" : String(value);
}

function fiberQuest(card) {
  const key = Object.getOwnPropertyNames(card ?? {}).find(
    (name) =>
      name.startsWith("__reactFiber$") ||
      name.startsWith("__reactInternalInstance$"),
  );
  let fiber = key ? card[key] : null;
  for (let depth = 0; fiber && depth < 24; depth += 1) {
    for (const props of [
      fiber.memoizedProps,
      fiber.pendingProps,
      fiber.stateNode?.props,
    ]) {
      const quest = props?.characterQuest ?? props?.quest ?? props?.task;
      if (quest && typeof quest === "object") return quest;
    }
    fiber = fiber.return;
  }
  return null;
}

function cardActionLabel(card) {
  const title = String(card?.querySelector(NAME_SELECTOR)?.textContent ?? "");
  return normalize(title.split(/\s[-–]\s/).at(-1));
}

function cardRemaining(card) {
  const text = String(card?.textContent ?? "");
  const match = text.match(
    /(?:进度|progress)\s*:?\s*([\d,.]+)\s*\/\s*([\d,.]+)/i,
  );
  if (!match) return null;
  const current = Number(match[1].replaceAll(",", ""));
  const target = Number(match[2].replaceAll(",", ""));
  return Number.isFinite(current) && Number.isFinite(target)
    ? Math.max(0, target - current)
    : null;
}

function actionLabels(actionHrid) {
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  return new Set(
    [
      detail?.name,
      runtime.data.ZHActionNames?.[actionHrid],
      getLocalizedEntityName("action", actionHrid),
      String(actionHrid ?? "")
        .split("/")
        .at(-1)
        ?.replaceAll("_", " "),
    ]
      .map(normalize)
      .filter(Boolean),
  );
}

function semanticCandidates(card, quests, taskActionHrid, taskRemaining) {
  const label = cardActionLabel(card);
  const remaining = cardRemaining(card);
  let candidates = quests
    .map((task, taskIndex) => ({
      task,
      taskIndex,
      taskId: taskCardTaskId(task),
      actionHrid: taskActionHrid(task),
    }))
    .filter(({ actionHrid }) =>
      label ? actionLabels(actionHrid).has(label) : false,
    );
  if (remaining !== null) {
    const progressMatches = candidates.filter(
      ({ task }) => Number(taskRemaining(task)) === remaining,
    );
    if (progressMatches.length) candidates = progressMatches;
  }
  return candidates;
}

/**
 * Resolve native task cards to quests without assuming React's DOM order is
 * identical to the characterQuests array order.
 */
export function resolveTaskCards(
  cards,
  quests,
  { taskActionHrid, taskRemaining },
) {
  const questList = Array.isArray(quests) ? quests : [];
  const byId = new Map(
    questList
      .map((task, taskIndex) => [taskCardTaskId(task), { task, taskIndex }])
      .filter(([id]) => id),
  );
  const used = new Set();
  const rows = [...cards].map((card, originalIndex) => {
    let resolved = null;
    const fiberTask = fiberQuest(card);
    const fiberId = taskCardTaskId(fiberTask);
    if (fiberId && byId.has(fiberId)) resolved = byId.get(fiberId);
    else if (fiberTask) {
      const taskIndex = questList.indexOf(fiberTask);
      if (taskIndex >= 0) resolved = { task: fiberTask, taskIndex };
    }

    if (Number.isInteger(resolved?.taskIndex)) used.add(resolved.taskIndex);
    return {
      card,
      originalIndex,
      resolved,
    };
  });

  for (const row of rows) {
    if (row.resolved) continue;
    const candidates = semanticCandidates(
      row.card,
      questList,
      taskActionHrid,
      taskRemaining,
    ).filter(({ taskIndex }) => !used.has(taskIndex));
    if (!candidates.length) continue;
    const priorId = String(row.card.dataset.mwitoolsTaskId ?? "");
    row.resolved =
      candidates.find(({ taskId }) => taskId && taskId === priorId) ??
      candidates[0];
    used.add(row.resolved.taskIndex);
  }

  for (const row of rows) {
    if (row.resolved) continue;
    const unused = questList
      .map((task, taskIndex) => ({ task, taskIndex }))
      .filter(({ taskIndex }) => !used.has(taskIndex));
    const positional = unused.find(
      ({ taskIndex }) =>
        questList.length === rows.length && taskIndex === row.originalIndex,
    );
    row.resolved = positional ?? (unused.length === 1 ? unused[0] : null);
    if (row.resolved) used.add(row.resolved.taskIndex);
  }

  return rows.map(({ card, originalIndex, resolved }) => {
    const task = resolved?.task ?? {};
    const taskIndex = Number.isInteger(resolved?.taskIndex)
      ? resolved.taskIndex
      : -1;
    return {
      card,
      task,
      taskId: taskCardTaskId(task),
      taskIndex,
      originalIndex,
      actionHrid: taskActionHrid(task),
    };
  });
}
