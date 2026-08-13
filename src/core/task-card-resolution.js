import { runtime } from "./runtime.js";
import { getGameLocale, getLocalizedEntityName } from "./game-localization.js";
import { parseCompactNumber } from "./market.js";

const NAME_SELECTOR = '[class*="RandomTask_name"]';
let cachedActionMap = null;
let cachedZhActionNames = null;
let cachedLocale = "";
let cachedActionLabels = new Map();

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
    /(?:进度|progress)\s*:?\s*([\d,.\s\u00a0\u202f]+)\s*\/\s*([\d,.\s\u00a0\u202f]+)/i,
  );
  if (!match) return null;
  const current = parseCompactNumber(match[1]);
  const target = parseCompactNumber(match[2]);
  return Number.isFinite(current) && Number.isFinite(target)
    ? Math.max(0, target - current)
    : null;
}

function actionLabels(actionHrid) {
  const actionMap = runtime.state.initData_actionDetailMap;
  const zhActionNames = runtime.data.ZHActionNames;
  const locale = getGameLocale();
  if (
    actionMap !== cachedActionMap ||
    zhActionNames !== cachedZhActionNames ||
    locale !== cachedLocale
  ) {
    cachedActionMap = actionMap;
    cachedZhActionNames = zhActionNames;
    cachedLocale = locale;
    cachedActionLabels = new Map();
  }
  if (cachedActionLabels.has(actionHrid)) {
    return cachedActionLabels.get(actionHrid);
  }
  const detail = actionMap?.[actionHrid];
  const labels = new Set(
    [
      detail?.name,
      zhActionNames?.[actionHrid],
      getLocalizedEntityName("action", actionHrid, { locale }),
      String(actionHrid ?? "")
        .split("/")
        .at(-1)
        ?.replaceAll("_", " "),
    ]
      .map(normalize)
      .filter(Boolean),
  );
  cachedActionLabels.set(actionHrid, labels);
  return labels;
}

function candidateMatches(candidate, label, remaining) {
  if (!label || !actionLabels(candidate.actionHrid).has(label)) return false;
  return (
    remaining === null || Number(candidate.remaining) === Number(remaining)
  );
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
  const questMetadata = questList.map((task, taskIndex) => ({
    task,
    taskIndex,
    taskId: taskCardTaskId(task),
    actionHrid: taskActionHrid(task),
    remaining: taskRemaining(task),
  }));
  const byId = new Map(
    questMetadata
      .map((candidate) => [candidate.taskId, candidate])
      .filter(([id]) => id),
  );
  const semanticIndex = new Map();
  for (const candidate of questMetadata) {
    for (const label of actionLabels(candidate.actionHrid)) {
      let entry = semanticIndex.get(label);
      if (!entry) {
        entry = { all: [], byRemaining: new Map() };
        semanticIndex.set(label, entry);
      }
      entry.all.push(candidate);
      const remainingKey = String(Number(candidate.remaining));
      if (!entry.byRemaining.has(remainingKey)) {
        entry.byRemaining.set(remainingKey, []);
      }
      entry.byRemaining.get(remainingKey).push(candidate);
    }
  }
  const used = new Set();
  const rows = [...cards].map((card, originalIndex) => {
    let resolved = null;
    const label = cardActionLabel(card);
    const remaining = cardRemaining(card);
    const fiberTask = fiberQuest(card);
    const fiberId = taskCardTaskId(fiberTask);
    if (fiberId && byId.has(fiberId)) resolved = byId.get(fiberId);
    else if (fiberTask) {
      const taskIndex = questList.indexOf(fiberTask);
      if (taskIndex >= 0) resolved = questMetadata[taskIndex];
    }
    const priorId = String(card.dataset.mwitoolsTaskId ?? "");
    const prior = priorId ? byId.get(priorId) : null;
    if (
      !resolved &&
      prior &&
      !used.has(prior.taskIndex) &&
      candidateMatches(prior, label, remaining)
    ) {
      resolved = prior;
    }

    if (Number.isInteger(resolved?.taskIndex)) used.add(resolved.taskIndex);
    return {
      card,
      originalIndex,
      resolved,
      label,
      remaining,
    };
  });

  const candidateCursors = new Map();
  const firstUnused = (candidates) => {
    let index = candidateCursors.get(candidates) ?? 0;
    while (index < candidates.length && used.has(candidates[index].taskIndex)) {
      index += 1;
    }
    candidateCursors.set(candidates, index + 1);
    return candidates[index] ?? null;
  };
  for (const row of rows) {
    if (row.resolved) continue;
    const entry = semanticIndex.get(row.label);
    if (!entry) continue;
    const progressCandidates =
      row.remaining === null
        ? null
        : entry.byRemaining.get(String(Number(row.remaining)));
    row.resolved = firstUnused(
      progressCandidates?.length ? progressCandidates : entry.all,
    );
    if (!row.resolved) continue;
    used.add(row.resolved.taskIndex);
  }

  for (const row of rows) {
    if (row.resolved) continue;
    const positional =
      questList.length === rows.length && !used.has(row.originalIndex)
        ? questMetadata[row.originalIndex]
        : null;
    const onlyUnused =
      questList.length - used.size === 1
        ? questMetadata.find(({ taskIndex }) => !used.has(taskIndex))
        : null;
    row.resolved = positional ?? onlyUnused;
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
      actionHrid: resolved?.actionHrid ?? taskActionHrid(task),
    };
  });
}
