import { runtime } from "./runtime.js";

const MAX_TRAIN_DEPTH = 50;

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeItemHrid(value) {
  return (
    runtime.api.procurement?.normalizeItemHrid?.(value) ?? String(value ?? "")
  );
}

function primaryOutput(detail) {
  const output = runtime.api.getExpectedOutputs?.(detail)?.[0];
  const itemHrid = normalizeItemHrid(output?.itemHrid);
  return itemHrid
    ? { itemHrid, count: positiveNumber(output?.count) || 1 }
    : null;
}

function actionEntries() {
  return Object.entries(runtime.state.initData_actionDetailMap ?? {});
}

export function findUpgradeActionToItem(itemHrid) {
  const target = normalizeItemHrid(itemHrid);
  for (const [fallbackHrid, detail] of actionEntries()) {
    if (!detail?.upgradeItemHrid) continue;
    const output = primaryOutput(detail);
    if (output?.itemHrid !== target) continue;
    return {
      actionHrid: detail.hrid ?? fallbackHrid,
      detail,
      output,
      inputHrid: normalizeItemHrid(detail.upgradeItemHrid),
    };
  }
  return null;
}

export function findBaseActionForItem(itemHrid) {
  const target = normalizeItemHrid(itemHrid);
  for (const [fallbackHrid, detail] of actionEntries()) {
    if (detail?.upgradeItemHrid) continue;
    const output = primaryOutput(detail);
    if (output?.itemHrid !== target) continue;
    return {
      actionHrid: detail.hrid ?? fallbackHrid,
      detail,
      output,
    };
  }
  return null;
}

function inputCountFor(detail, itemHrid) {
  const target = normalizeItemHrid(itemHrid);
  return (runtime.api.getDirectInputs?.(detail) ?? []).reduce(
    (total, input) =>
      normalizeItemHrid(input?.itemHrid) === target
        ? total + positiveNumber(input?.count)
        : total,
    0,
  );
}

function normalizeRows(value) {
  if (Array.isArray(value)) return value;
  if (value?.itemHrid || value?.hrid) return [value];
  return Object.entries(value ?? {}).map(([itemHrid, count]) => ({
    itemHrid,
    count: count?.count ?? count,
  }));
}

function shopRewards(detail) {
  const explicit =
    detail?.itemRewards ?? detail?.rewards ?? detail?.rewardItems;
  if (explicit) return normalizeRows(explicit);
  const itemHrid =
    detail?.itemHrid ?? detail?.rewardItemHrid ?? detail?.item?.itemHrid;
  return itemHrid
    ? [
        {
          itemHrid,
          count:
            detail?.outputCount ??
            detail?.itemCount ??
            detail?.rewardCount ??
            1,
        },
      ]
    : [];
}

export function findCoinShopOffer(itemHrid) {
  const target = normalizeItemHrid(itemHrid);
  let best = null;
  for (const [fallbackHrid, detail] of Object.entries(
    runtime.state.initData_shopItemDetailMap ?? {},
  )) {
    const rewardCount = shopRewards(detail).reduce(
      (total, reward) =>
        normalizeItemHrid(reward?.itemHrid ?? reward?.hrid) === target
          ? total + positiveNumber(reward?.count ?? 1)
          : total,
      0,
    );
    if (!rewardCount) continue;
    const costs = normalizeRows(
      detail?.costs ?? detail?.costItems ?? detail?.cost,
    ).filter((cost) => positiveNumber(cost?.count) > 0);
    if (
      !costs.length ||
      costs.some(
        (cost) =>
          normalizeItemHrid(cost?.itemHrid ?? cost?.hrid) !== "/items/coin",
      )
    ) {
      continue;
    }
    const coinCost = costs.reduce(
      (total, cost) => total + positiveNumber(cost?.count),
      0,
    );
    const unitPrice = coinCost / rewardCount;
    if (!unitPrice || (best && best.unitPrice <= unitPrice)) continue;
    best = {
      shopHrid: detail?.hrid ?? detail?.shopItemHrid ?? fallbackHrid,
      itemHrid: target,
      rewardCount,
      unitPrice,
      detail,
    };
  }
  return best;
}

export function buildTrainChain(topItemHrid) {
  const steps = [];
  const visited = new Set();
  let current = normalizeItemHrid(topItemHrid);
  let cycle = false;
  let truncated = false;
  while (current) {
    if (visited.has(current)) {
      cycle = true;
      break;
    }
    if (steps.length >= MAX_TRAIN_DEPTH) {
      truncated = true;
      break;
    }
    visited.add(current);
    const upgrade = findUpgradeActionToItem(current);
    if (!upgrade) break;
    steps.unshift({
      kind: "upgrade",
      actionHrid: upgrade.actionHrid,
      outputHrid: current,
      outputCount: upgrade.output.count,
      inputHrid: upgrade.inputHrid,
      inputCount: inputCountFor(upgrade.detail, upgrade.inputHrid) || 1,
      detail: upgrade.detail,
    });
    current = upgrade.inputHrid;
  }

  if (current && steps.length) {
    const base = findBaseActionForItem(current);
    if (base) {
      steps.unshift({
        kind: "craft",
        actionHrid: base.actionHrid,
        outputHrid: current,
        outputCount: base.output.count,
        inputHrid: null,
        inputCount: 0,
        detail: base.detail,
      });
    } else {
      const offer = findCoinShopOffer(current);
      if (offer) {
        steps.unshift({
          kind: "shop",
          actionHrid: null,
          outputHrid: current,
          outputCount: 1,
          inputHrid: null,
          inputCount: 0,
          shopHrid: offer.shopHrid,
          shopOffer: offer,
          detail: null,
        });
      }
    }
  }
  return { steps, cycle, truncated };
}

function demandCount(taskCounts, itemHrid) {
  if (taskCounts instanceof Map)
    return positiveNumber(taskCounts.get(itemHrid));
  return positiveNumber(taskCounts?.[itemHrid]);
}

export function planTrainCounts(chain, taskCounts = {}) {
  const procurement = runtime.api.procurement;
  const planned = chain.steps.map((step) => ({ ...step, count: 0 }));
  let requiredByAbove = 0;
  for (let index = planned.length - 1; index >= 0; index -= 1) {
    const step = planned[index];
    const inventory = positiveNumber(
      procurement?.getInventoryCount?.(step.outputHrid, 0),
    );
    const shortageUnits = Math.max(0, requiredByAbove - inventory);
    const ownActions = Math.ceil(demandCount(taskCounts, step.outputHrid));
    step.requiredByAbove = requiredByAbove;
    step.inventory = inventory;
    step.shortageUnits = shortageUnits;
    step.count =
      step.kind === "shop"
        ? Math.max(ownActions, Math.ceil(shortageUnits))
        : Math.max(
            ownActions,
            Math.ceil(shortageUnits / (positiveNumber(step.outputCount) || 1)),
          );
    step.plannedOutput = step.count * (positiveNumber(step.outputCount) || 1);
    requiredByAbove = step.inputHrid
      ? step.count * (positiveNumber(step.inputCount) || 1)
      : 0;
  }
  return { ...chain, steps: planned };
}

export function applyShopPreference(plan, taskCounts = {}) {
  const root = plan.steps[0];
  if (
    root?.kind !== "craft" ||
    demandCount(taskCounts, root.outputHrid) > 0 ||
    root.count <= 0
  ) {
    return plan;
  }
  const offer = findCoinShopOffer(root.outputHrid);
  if (!offer) return plan;
  const askPrice = positiveNumber(
    runtime.api.getAskPrice?.(root.outputHrid, 0),
  );
  if (askPrice && offer.unitPrice > askPrice) return plan;
  return {
    ...plan,
    steps: [
      {
        ...root,
        kind: "shop",
        actionHrid: null,
        outputCount: 1,
        count: Math.ceil(root.shortageUnits),
        plannedOutput: Math.ceil(root.shortageUnits),
        shopHrid: offer.shopHrid,
        shopOffer: offer,
        detail: null,
      },
      ...plan.steps.slice(1),
    ],
  };
}

export function createTrainPlan(topItemHrid, taskCounts = {}, options = {}) {
  const chain = buildTrainChain(topItemHrid);
  const planned = planTrainCounts(chain, taskCounts);
  return options.preferShop === false
    ? planned
    : applyShopPreference(planned, taskCounts);
}

export function trainChainRoot(itemHrid) {
  let current = normalizeItemHrid(itemHrid);
  const visited = new Set();
  while (current && !visited.has(current)) {
    visited.add(current);
    const upgrade = findUpgradeActionToItem(current);
    if (!upgrade) break;
    current = upgrade.inputHrid;
  }
  return current;
}

export function trainChainDepth(itemHrid) {
  let current = normalizeItemHrid(itemHrid);
  const visited = new Set();
  let depth = 0;
  while (current && !visited.has(current)) {
    visited.add(current);
    const upgrade = findUpgradeActionToItem(current);
    if (!upgrade) break;
    current = upgrade.inputHrid;
    depth += 1;
  }
  if (depth) return depth;
  return actionEntries().some(
    ([, detail]) => normalizeItemHrid(detail?.upgradeItemHrid) === current,
  )
    ? 0
    : -1;
}

export function parseTrainCount(raw) {
  const match = String(raw ?? "")
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)([kmb])?$/);
  if (!match) return null;
  const multiplier = { k: 1e3, m: 1e6, b: 1e9 }[match[2]] ?? 1;
  const count = Math.floor(Number(match[1]) * multiplier);
  return Number.isFinite(count) && count > 0 ? count : null;
}

const trainPlanning = {
  findUpgradeActionToItem,
  findBaseActionForItem,
  findCoinShopOffer,
  buildTrainChain,
  planTrainCounts,
  applyShopPreference,
  createTrainPlan,
  trainChainRoot,
  trainChainDepth,
  parseTrainCount,
};

runtime.api.trainPlanning = trainPlanning;
