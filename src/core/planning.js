import { runtime } from "./runtime.js";
import { itemName } from "./localization.js";

const MAX_DEPTH = 40;
const procurement = runtime.api.procurement;

function positiveInteger(value, fallback = 1) {
  const number = Math.ceil(Number(value) || 0);
  return number > 0 ? number : fallback;
}

function maxHouseLevel(houseRoomHrid) {
  const levels = Object.keys(
    runtime.state.initData_houseRoomDetailMap?.[houseRoomHrid]
      ?.upgradeCostsMap ?? {},
  )
    .map(Number)
    .filter((level) => Number.isFinite(level));
  return levels.length ? Math.max(...levels) : 0;
}

function normalizeGoal(value) {
  const kind = value?.kind === "house" ? "house" : "item";
  const targetHrid = String(value?.targetHrid ?? value?.hrid ?? "").trim();
  if (!targetHrid) return null;
  const maximum = kind === "house" ? maxHouseLevel(targetHrid) : Infinity;
  if (kind === "house" && maximum <= 0) return null;
  return {
    id: value?.id ?? `${kind}:${targetHrid}`,
    kind,
    targetHrid,
    target: Math.min(positiveInteger(value?.target), maximum),
    enabled: value?.enabled !== false,
    createdAt: value?.createdAt ?? new Date().toISOString(),
    updatedAt: value?.updatedAt ?? new Date().toISOString(),
  };
}

function getState() {
  const value = procurement.getPlanningData();
  return {
    goals: (value.goals ?? []).map(normalizeGoal).filter(Boolean),
    policies: { ...(value.policies ?? {}) },
  };
}

function saveState(state, reason) {
  return procurement.setPlanningData(state, reason);
}

function getGoals() {
  return getState().goals;
}

function upsertGoal(value) {
  const goal = normalizeGoal(value);
  if (!goal) return null;
  const state = getState();
  const index = state.goals.findIndex(
    (entry) => entry.kind === goal.kind && entry.targetHrid === goal.targetHrid,
  );
  if (index >= 0) {
    goal.id = state.goals[index].id;
    goal.createdAt = state.goals[index].createdAt;
    state.goals[index] = goal;
  } else {
    state.goals.push(goal);
  }
  saveState(state, "goal");
  reconcilePlanningCart();
  return goal;
}

function updateGoal(id, patch) {
  const state = getState();
  const index = state.goals.findIndex((goal) => goal.id === id);
  if (index < 0) return false;
  const next = normalizeGoal({
    ...state.goals[index],
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  });
  if (!next) return false;
  state.goals[index] = next;
  saveState(state, "goal");
  reconcilePlanningCart();
  return true;
}

function removeGoal(id) {
  const state = getState();
  const next = state.goals.filter((goal) => goal.id !== id);
  if (next.length === state.goals.length) return false;
  state.goals = next;
  saveState(state, "goal");
  reconcilePlanningCart();
  return true;
}

function getPolicy(itemHrid) {
  return (
    getState().policies[procurement.normalizeItemHrid(itemHrid)] ?? "produce"
  );
}

function setPolicy(itemHrid, policy) {
  const normalized = procurement.normalizeItemHrid(itemHrid);
  if (!normalized) return false;
  const state = getState();
  if (policy === "acquire") state.policies[normalized] = "acquire";
  else delete state.policies[normalized];
  saveState(state, "policy");
  reconcilePlanningCart();
  return true;
}

function rows(value) {
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
  if (explicit) return rows(explicit);
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

function findShopRecipe(itemHrid) {
  const target = procurement.normalizeItemHrid(itemHrid);
  const matches = [];
  for (const [fallbackHrid, detail] of Object.entries(
    runtime.state.initData_shopItemDetailMap ?? {},
  )) {
    const outputCount = shopRewards(detail).reduce((sum, reward) => {
      const hrid = procurement.normalizeItemHrid(
        reward?.itemHrid ?? reward?.hrid,
      );
      return hrid === target
        ? sum + Math.max(0, Number(reward?.count) || 0)
        : sum;
    }, 0);
    const costs = rows(detail?.costs ?? detail?.costItems ?? detail?.cost)
      .map((cost) => ({
        itemHrid: procurement.normalizeItemHrid(cost?.itemHrid ?? cost?.hrid),
        count: Math.max(0, Number(cost?.count) || 0),
      }))
      .filter((cost) => cost.itemHrid && cost.count > 0);
    if (outputCount > 0 && costs.length) {
      matches.push({
        kind: "exchange",
        id: detail?.hrid ?? detail?.shopItemHrid ?? fallbackHrid,
        outputCount,
        costs,
      });
    }
  }
  matches.sort((left, right) => left.id.localeCompare(right.id));
  return matches[0] ?? null;
}

function findProductionRecipe(itemHrid) {
  const actionHrid = runtime.api.resolveProductionActionByItemHrid?.(itemHrid);
  if (!actionHrid) return null;
  const profile = runtime.api.getActionProductionProfile?.(actionHrid);
  if (profile?.status !== "complete") return null;
  const target = procurement.normalizeItemHrid(itemHrid);
  const outputCount = (profile.outputs ?? []).reduce(
    (sum, output) =>
      procurement.normalizeItemHrid(output?.itemHrid) === target
        ? sum + Math.max(0, Number(output?.count) || 0)
        : sum,
    0,
  );
  return outputCount > 0
    ? { kind: "production", id: actionHrid, outputCount, profile }
    : null;
}

function currentHouseLevel(houseRoomHrid) {
  const map = runtime.state.initData_characterHouseRoomMap ?? {};
  const direct = map[houseRoomHrid];
  if (direct) return Math.max(0, Number(direct.level) || 0);
  return Math.max(
    0,
    Number(
      Object.values(map).find((house) => house?.houseRoomHrid === houseRoomHrid)
        ?.level,
    ) || 0,
  );
}

function calculate() {
  const state = getState();
  const goals = state.goals
    .filter((goal) => goal.enabled)
    .sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.targetHrid.localeCompare(right.targetHrid),
    );
  const inventoryPool = new Map();
  const virtualPool = new Map();
  const steps = new Map();
  const materials = new Map();
  const warnings = [];

  const inventoryFor = (itemHrid) => {
    const key = procurement.itemKey(itemHrid, 0);
    if (!inventoryPool.has(key)) {
      inventoryPool.set(
        key,
        Math.max(
          0,
          procurement.getInventoryCount(itemHrid, 0) -
            procurement.getProjectReservedInventory(itemHrid, 0),
        ),
      );
    }
    return inventoryPool.get(key) ?? 0;
  };

  const consumeSupply = (itemHrid, amount) => {
    const key = procurement.itemKey(itemHrid, 0);
    const inventory = Math.min(amount, inventoryFor(itemHrid));
    inventoryPool.set(key, inventoryFor(itemHrid) - inventory);
    const afterInventory = amount - inventory;
    const virtual = Math.min(
      afterInventory,
      Math.max(0, virtualPool.get(itemHrid) ?? 0),
    );
    virtualPool.set(
      itemHrid,
      Math.max(0, (virtualPool.get(itemHrid) ?? 0) - virtual),
    );
    return { remaining: afterInventory - virtual, inventory, virtual };
  };

  const recordLeaf = (itemHrid, amount, supply, sourceIds, lineage, reason) => {
    const normalized = procurement.normalizeItemHrid(itemHrid);
    const entry = materials.get(normalized) ?? {
      itemHrid: normalized,
      required: 0,
      inventoryUsed: 0,
      virtualUsed: 0,
      sourceIds: new Set(),
      lineages: new Set(),
      reasons: new Set(),
    };
    entry.required += amount;
    entry.inventoryUsed += supply.inventory;
    entry.virtualUsed += supply.virtual;
    for (const id of sourceIds) entry.sourceIds.add(id);
    entry.lineages.add(lineage.join(" > "));
    entry.reasons.add(reason);
    materials.set(normalized, entry);
    return supply.remaining;
  };

  const addLeaf = (itemHrid, amount, sourceIds, lineage, reason) => {
    const normalized = procurement.normalizeItemHrid(itemHrid);
    return recordLeaf(
      normalized,
      amount,
      consumeSupply(normalized, amount),
      sourceIds,
      lineage,
      reason,
    );
  };

  const addStep = (recipe, itemHrid, amount, actionCount, sourceIds) => {
    const key = `${recipe.kind}:${recipe.id}`;
    const step = steps.get(key) ?? {
      key,
      kind: recipe.kind,
      id: recipe.id,
      itemHrid,
      requiredOutput: 0,
      actionCount: 0,
      outputCount: recipe.outputCount,
      sourceIds: new Set(),
    };
    step.requiredOutput += amount;
    step.actionCount += actionCount;
    for (const id of sourceIds) step.sourceIds.add(id);
    steps.set(key, step);
  };

  const expand = (
    rawItemHrid,
    rawAmount,
    sourceIds,
    lineage = [],
    depth = 0,
  ) => {
    const itemHrid = procurement.normalizeItemHrid(rawItemHrid);
    const amount = Math.max(0, Number(rawAmount) || 0);
    if (!itemHrid || amount <= 0) return;
    if (depth >= MAX_DEPTH || lineage.includes(itemHrid)) {
      warnings.push({
        type: depth >= MAX_DEPTH ? "truncated" : "cycle",
        itemHrid,
        lineage: [...lineage, itemHrid],
      });
      addLeaf(itemHrid, amount, sourceIds, lineage, "cycle");
      return;
    }
    const supply = consumeSupply(itemHrid, amount);
    if (supply.remaining <= 1e-9) return;
    const policy = state.policies[itemHrid] ?? "produce";
    const recipe =
      policy === "acquire"
        ? null
        : (findProductionRecipe(itemHrid) ?? findShopRecipe(itemHrid));
    if (!recipe) {
      recordLeaf(
        itemHrid,
        amount,
        supply,
        sourceIds,
        [...lineage, itemHrid],
        policy === "acquire" ? "acquire" : "leaf",
      );
      return;
    }
    const actionCount = Math.max(
      1,
      Math.ceil(supply.remaining / recipe.outputCount - 1e-9),
    );
    addStep(recipe, itemHrid, supply.remaining, actionCount, sourceIds);
    const producedTarget = actionCount * recipe.outputCount;
    virtualPool.set(
      itemHrid,
      (virtualPool.get(itemHrid) ?? 0) +
        Math.max(0, producedTarget - supply.remaining),
    );
    const nextLineage = [...lineage, itemHrid];
    if (recipe.kind === "exchange") {
      for (const cost of recipe.costs) {
        expand(
          cost.itemHrid,
          cost.count * actionCount,
          sourceIds,
          nextLineage,
          depth + 1,
        );
      }
      return;
    }
    const profile = recipe.profile;
    for (const output of profile.outputs ?? []) {
      const outputHrid = procurement.normalizeItemHrid(output.itemHrid);
      if (!outputHrid || outputHrid === itemHrid) continue;
      virtualPool.set(
        outputHrid,
        (virtualPool.get(outputHrid) ?? 0) +
          Math.max(0, Number(output.count) || 0) * actionCount,
      );
    }
    const requirements = procurement.calculateRequirements(
      recipe.id,
      actionCount,
    );
    if (!requirements.materials?.length) {
      recordLeaf(itemHrid, amount, supply, sourceIds, lineage, "gathering");
      return;
    }
    for (const material of requirements.materials) {
      expand(
        material.itemHrid,
        material.suggested,
        sourceIds,
        nextLineage,
        depth + 1,
      );
    }
  };

  for (const goal of goals) {
    const sources = new Set([goal.id]);
    if (goal.kind === "item") {
      expand(goal.targetHrid, goal.target, sources);
      continue;
    }
    const detail = runtime.state.initData_houseRoomDetailMap?.[goal.targetHrid];
    const current = currentHouseLevel(goal.targetHrid);
    for (let level = current + 1; level <= goal.target; level += 1) {
      for (const cost of rows(detail?.upgradeCostsMap?.[level])) {
        expand(cost.itemHrid, cost.count, sources, [goal.targetHrid]);
      }
    }
  }

  const resultMaterials = [...materials.values()]
    .map((entry) => {
      const owned = procurement.getInventoryCount(entry.itemHrid, 0);
      const projectInventory = procurement.getProjectReservedInventory(
        entry.itemHrid,
        0,
      );
      const cart = procurement.getCartAllocationSummary(entry.itemHrid, 0);
      const requiredAfterSupply = Math.max(
        0,
        entry.required - entry.inventoryUsed - entry.virtualUsed,
      );
      const addableShortage = Math.max(
        0,
        Math.ceil(requiredAfterSupply - cart.planning - 1e-9),
      );
      const detail = runtime.state.initData_itemDetailMap?.[entry.itemHrid];
      return {
        ...entry,
        sourceIds: [...entry.sourceIds],
        lineages: [...entry.lineages].filter(Boolean),
        reasons: [...entry.reasons],
        name: itemName(entry.itemHrid),
        owned,
        projectInventory,
        availableInventory: Math.max(0, owned - projectInventory),
        requiredAfterSupply,
        cart,
        addableShortage,
        purchasable:
          detail?.isTradable === true && entry.itemHrid !== "/items/coin",
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const resultSteps = [...steps.values()]
    .map((step) => ({ ...step, sourceIds: [...step.sourceIds] }))
    .sort((left, right) => left.itemHrid.localeCompare(right.itemHrid));
  return {
    status: goals.length ? "complete" : "empty",
    goals,
    steps: resultSteps,
    materials: resultMaterials,
    warnings,
  };
}

function reconcilePlanningCart() {
  const result = calculate();
  const allowed = new Map(
    result.materials.map((material) => [
      procurement.itemKey(material.itemHrid, 0),
      Math.ceil(material.requiredAfterSupply),
    ]),
  );
  for (const row of procurement.getCartItems()) {
    const summary = procurement.getCartAllocationSummary(
      row.itemHrid,
      row.enhancementLevel,
    );
    if (!summary.planning) continue;
    const excess = Math.max(
      0,
      summary.planning -
        (allowed.get(procurement.itemKey(row.itemHrid, row.enhancementLevel)) ??
          0),
    );
    if (excess > 0) {
      procurement.moveCartAllocationToManual(
        row.itemHrid,
        row.enhancementLevel,
        { kind: "planning" },
        excess,
      );
    }
  }
  return result;
}

function addShortagesToCart(materials = calculate().materials) {
  return procurement.addToCart(
    materials
      .filter(
        (material) => material.purchasable && material.addableShortage > 0,
      )
      .map((material) => ({
        itemHrid: material.itemHrid,
        enhancementLevel: 0,
        name: material.name,
        quantity: material.addableShortage,
        source: "planning",
        allocation: { kind: "planning" },
      })),
  );
}

runtime.api.planning = {
  getGoals,
  upsertGoal,
  updateGoal,
  removeGoal,
  getPolicy,
  setPolicy,
  calculate,
  reconcilePlanningCart,
  addShortagesToCart,
  on(listener) {
    return procurement.on("planning:change", listener);
  },
};
