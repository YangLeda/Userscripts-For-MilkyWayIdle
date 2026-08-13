import { runtime } from "./runtime.js";
import { itemName } from "./localization.js";

const MAX_DEPTH = 40;
const EPSILON = 1e-9;
const POLICIES = new Set(["chain", "single", "buy"]);
const procurement = runtime.api.procurement;

let calculationRevision = 0;
let calculationCount = 0;
let cachedRevision = -1;
let cachedResult = null;
let lastResult = null;
let lastCalculatedAt = null;
let decisionResult = null;
let decisionCalculatedAt = null;
let recipeCache = new Map();

function positiveInteger(value, fallback = 1) {
  const number = Math.ceil(Number(value) || 0);
  return number > 0 ? number : fallback;
}

function normalizePolicy(value, fallback = "chain") {
  if (value === "produce") return "chain";
  if (value === "acquire") return "buy";
  return POLICIES.has(value) ? value : fallback;
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
    policy: normalizePolicy(value?.policy),
    enabled: value?.enabled !== false,
    createdAt: value?.createdAt ?? new Date().toISOString(),
    updatedAt: value?.updatedAt ?? new Date().toISOString(),
  };
}

function normalizeOverrides(value) {
  const result = {};
  for (const [goalId, entries] of Object.entries(value ?? {})) {
    if (!entries || typeof entries !== "object") continue;
    const normalized = {};
    for (const [itemHrid, policy] of Object.entries(entries)) {
      const item = procurement.normalizeItemHrid(itemHrid);
      if (item) normalized[item] = normalizePolicy(policy);
    }
    if (Object.keys(normalized).length) result[goalId] = normalized;
  }
  return result;
}

function getState() {
  const value = procurement.getPlanningData();
  return {
    goals: (value.goals ?? []).map(normalizeGoal).filter(Boolean),
    overrides: normalizeOverrides(value.overrides),
    defaults: {
      item: normalizePolicy(value.defaults?.item),
      house: normalizePolicy(value.defaults?.house),
    },
  };
}

function invalidate() {
  calculationRevision += 1;
  cachedResult = null;
  recipeCache = new Map();
}

function clearDecisionResult() {
  decisionResult = null;
  decisionCalculatedAt = null;
}

function saveState(state, reason) {
  invalidate();
  if (reason === "goal") clearDecisionResult();
  return procurement.setPlanningData(state, reason);
}

function getGoals() {
  return getState().goals;
}

function upsertGoal(value) {
  const state = getState();
  const goal = normalizeGoal({
    ...value,
    policy:
      value?.policy ??
      state.defaults[value?.kind === "house" ? "house" : "item"],
  });
  if (!goal) return null;
  const index = state.goals.findIndex(
    (entry) => entry.kind === goal.kind && entry.targetHrid === goal.targetHrid,
  );
  if (index >= 0) {
    goal.id = state.goals[index].id;
    goal.createdAt = state.goals[index].createdAt;
    state.goals[index] = goal;
    delete state.overrides[goal.id];
  } else {
    state.goals.push(goal);
  }
  saveState(state, "goal");
  return goal;
}

function updateGoal(id, patch) {
  const state = getState();
  const index = state.goals.findIndex((goal) => goal.id === id);
  if (index < 0) return false;
  const previous = state.goals[index];
  const next = normalizeGoal({
    ...previous,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  });
  if (!next) return false;
  state.goals[index] = next;
  if (Object.hasOwn(patch ?? {}, "policy")) {
    delete state.overrides[id];
  }
  saveState(state, "goal");
  return true;
}

function removeGoal(id) {
  const state = getState();
  const next = state.goals.filter((goal) => goal.id !== id);
  if (next.length === state.goals.length) return false;
  state.goals = next;
  delete state.overrides[id];
  saveState(state, "goal");
  return true;
}

function getDefaultPolicy(kind) {
  return getState().defaults[kind === "house" ? "house" : "item"];
}

function setDefaultPolicy(kind, policy) {
  const normalizedKind = kind === "house" ? "house" : "item";
  const state = getState();
  state.defaults[normalizedKind] = normalizePolicy(policy);
  saveState(state, "default-policy");
  return true;
}

function getGoalPolicy(goalId) {
  return getState().goals.find((goal) => goal.id === goalId)?.policy ?? "chain";
}

function setGoalPolicy(goalId, policy) {
  return updateGoal(goalId, { policy: normalizePolicy(policy) });
}

function getNodePolicy(goalId, itemHrid) {
  const state = getState();
  const item = procurement.normalizeItemHrid(itemHrid);
  return (
    state.overrides[goalId]?.[item] ??
    state.goals.find((goal) => goal.id === goalId)?.policy ??
    "chain"
  );
}

function setNodePolicy(goalId, itemHrid, policy) {
  const item = procurement.normalizeItemHrid(itemHrid);
  const state = getState();
  if (!item || !state.goals.some((goal) => goal.id === goalId)) return false;
  state.overrides[goalId] = { ...(state.overrides[goalId] ?? {}) };
  if (policy == null || policy === "inherit") {
    delete state.overrides[goalId][item];
    if (!Object.keys(state.overrides[goalId]).length) {
      delete state.overrides[goalId];
    }
  } else {
    state.overrides[goalId][item] = normalizePolicy(policy);
  }
  saveState(state, "node-policy");
  updateDecisionPolicy(goalId, item, getNodePolicy(goalId, item));
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
  if (outputCount <= 0) return null;
  const requirements = procurement.calculateRequirements(actionHrid, 1);
  return requirements.materials?.length
    ? {
        kind: "production",
        id: actionHrid,
        outputCount,
        profile,
      }
    : null;
}

function recipeFor(itemHrid) {
  const item = procurement.normalizeItemHrid(itemHrid);
  if (!recipeCache.has(item)) {
    recipeCache.set(item, findProductionRecipe(item) ?? findShopRecipe(item));
  }
  return recipeCache.get(item) ?? null;
}

function isCraftableItem(itemHrid) {
  return Boolean(findProductionRecipe(procurement.normalizeItemHrid(itemHrid)));
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

function allocateProportionally(entries, available, field) {
  const total = entries.reduce((sum, entry) => sum + entry.remaining, 0);
  const used = Math.min(Math.max(0, available), total);
  if (used <= EPSILON || total <= EPSILON) return 0;
  let distributed = 0;
  entries.forEach((entry, index) => {
    const share =
      index === entries.length - 1
        ? used - distributed
        : Math.min(entry.remaining, (used * entry.remaining) / total);
    const applied = Math.max(0, Math.min(entry.remaining, share));
    entry[field] += applied;
    entry.remaining -= applied;
    distributed += applied;
  });
  return distributed;
}

function allocatePool(entries, available, field) {
  const buy = entries.filter(
    (entry) => entry.policy === "buy" && entry.remaining > EPSILON,
  );
  const other = entries.filter(
    (entry) => entry.policy !== "buy" && entry.remaining > EPSILON,
  );
  const buyUsed = allocateProportionally(buy, available, field);
  const otherUsed = allocateProportionally(other, available - buyUsed, field);
  return buyUsed + otherUsed;
}

function calculateFresh() {
  calculationCount += 1;
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
  const decisions = new Map();
  const steps = new Map();
  const materials = new Map();
  const warnings = [];
  let pending = [];

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

  const addPending = ({
    itemHrid,
    amount,
    goalId,
    inheritedPolicy,
    lineage,
    depth,
  }) => {
    const item = procurement.normalizeItemHrid(itemHrid);
    const count = Math.max(0, Number(amount) || 0);
    if (!item || count <= EPSILON) return;
    pending.push({
      itemHrid: item,
      amount: count,
      goalId,
      inheritedPolicy: normalizePolicy(inheritedPolicy),
      lineage: [...(lineage ?? [])],
      depth: Math.max(0, Number(depth) || 0),
    });
  };

  const recordDecision = (entry, recipe) => {
    if (!recipe) return;
    const decision = decisions.get(entry.itemHrid) ?? {
      itemHrid: entry.itemHrid,
      outputCount: recipe.outputCount,
      policies: new Set(),
      branches: new Map(),
    };
    const branchKey = `${entry.goalId}\u0000${entry.policy}`;
    const branch = decision.branches.get(branchKey) ?? {
      goalId: entry.goalId,
      policy: entry.policy,
      requiredOutput: 0,
      inventoryUsed: 0,
      virtualUsed: 0,
      remaining: 0,
    };
    branch.requiredOutput += entry.amount;
    branch.inventoryUsed += entry.inventoryUsed;
    branch.virtualUsed += entry.virtualUsed;
    branch.remaining += entry.remaining;
    decision.policies.add(entry.policy);
    decision.branches.set(branchKey, branch);
    decisions.set(entry.itemHrid, decision);
  };

  const recordLeaf = (entry, reason) => {
    const material = materials.get(entry.itemHrid) ?? {
      itemHrid: entry.itemHrid,
      required: 0,
      inventoryUsed: 0,
      virtualUsed: 0,
      sourceIds: new Set(),
      lineages: new Set(),
      reasons: new Set(),
      branches: new Map(),
    };
    material.required += entry.amount;
    material.inventoryUsed += entry.inventoryUsed;
    material.virtualUsed += entry.virtualUsed;
    material.sourceIds.add(entry.goalId);
    material.lineages.add([...entry.lineage, entry.itemHrid].join(" > "));
    material.reasons.add(reason);
    const branch = material.branches.get(entry.goalId) ?? {
      goalId: entry.goalId,
      required: 0,
      inventoryUsed: 0,
      virtualUsed: 0,
      requiredAfterSupply: 0,
      policies: new Set(),
    };
    branch.required += entry.amount;
    branch.inventoryUsed += entry.inventoryUsed;
    branch.virtualUsed += entry.virtualUsed;
    branch.requiredAfterSupply += entry.remaining;
    branch.policies.add(entry.policy);
    material.branches.set(entry.goalId, branch);
    materials.set(entry.itemHrid, material);
  };

  const addStep = (recipe, itemHrid, amount, actionCount, entries) => {
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
    entries.forEach((entry) => step.sourceIds.add(entry.goalId));
    steps.set(key, step);
  };

  for (const goal of goals) {
    if (goal.kind === "item") {
      addPending({
        itemHrid: goal.targetHrid,
        amount: goal.target,
        goalId: goal.id,
        inheritedPolicy: goal.policy,
        lineage: [],
        depth: 0,
      });
      continue;
    }
    const detail = runtime.state.initData_houseRoomDetailMap?.[goal.targetHrid];
    const current = currentHouseLevel(goal.targetHrid);
    for (let level = current + 1; level <= goal.target; level += 1) {
      for (const cost of rows(detail?.upgradeCostsMap?.[level])) {
        addPending({
          itemHrid: cost.itemHrid,
          amount: cost.count,
          goalId: goal.id,
          inheritedPolicy: goal.policy,
          lineage: [goal.targetHrid],
          depth: 0,
        });
      }
    }
  }

  while (pending.length) {
    const grouped = new Map();
    for (const entry of pending) {
      const entries = grouped.get(entry.itemHrid) ?? [];
      entries.push(entry);
      grouped.set(entry.itemHrid, entries);
    }
    pending = [];
    for (const itemHrid of [...grouped.keys()].sort()) {
      const entries = grouped.get(itemHrid);
      for (const entry of entries) {
        entry.policy = normalizePolicy(
          state.overrides[entry.goalId]?.[itemHrid] ?? entry.inheritedPolicy,
        );
        entry.remaining = entry.amount;
        entry.inventoryUsed = 0;
        entry.virtualUsed = 0;
        entry.forcedLeaf =
          entry.depth >= MAX_DEPTH || entry.lineage.includes(itemHrid);
        if (entry.forcedLeaf) {
          warnings.push({
            type: entry.depth >= MAX_DEPTH ? "truncated" : "cycle",
            itemHrid,
            goalId: entry.goalId,
            lineage: [...entry.lineage, itemHrid],
          });
        }
      }
      const key = procurement.itemKey(itemHrid, 0);
      const inventoryUsed = allocatePool(
        entries,
        inventoryFor(itemHrid),
        "inventoryUsed",
      );
      inventoryPool.set(
        key,
        Math.max(0, inventoryFor(itemHrid) - inventoryUsed),
      );
      const virtualUsed = allocatePool(
        entries,
        Math.max(0, virtualPool.get(itemHrid) ?? 0),
        "virtualUsed",
      );
      virtualPool.set(
        itemHrid,
        Math.max(0, (virtualPool.get(itemHrid) ?? 0) - virtualUsed),
      );

      const recipe = recipeFor(itemHrid);
      entries.forEach((entry) => recordDecision(entry, recipe));
      const produced = entries.filter(
        (entry) =>
          !entry.forcedLeaf &&
          entry.policy !== "buy" &&
          recipe &&
          entry.remaining > EPSILON,
      );
      for (const entry of entries) {
        if (entry.forcedLeaf) recordLeaf(entry, "cycle");
        else if (entry.policy === "buy") recordLeaf(entry, "buy");
        else if (!recipe) recordLeaf(entry, "leaf");
      }
      if (!produced.length) continue;
      const totalRemaining = produced.reduce(
        (sum, entry) => sum + entry.remaining,
        0,
      );
      const actionCount = Math.max(
        1,
        Math.ceil(totalRemaining / recipe.outputCount - EPSILON),
      );
      addStep(recipe, itemHrid, totalRemaining, actionCount, produced);
      const producedTarget = actionCount * recipe.outputCount;
      virtualPool.set(
        itemHrid,
        (virtualPool.get(itemHrid) ?? 0) +
          Math.max(0, producedTarget - totalRemaining),
      );
      const requirements =
        recipe.kind === "exchange"
          ? recipe.costs.map((cost) => ({
              itemHrid: cost.itemHrid,
              suggested: cost.count * actionCount,
            }))
          : procurement.calculateRequirements(recipe.id, actionCount).materials;
      if (recipe.kind === "production") {
        for (const output of recipe.profile.outputs ?? []) {
          const outputHrid = procurement.normalizeItemHrid(output.itemHrid);
          if (!outputHrid || outputHrid === itemHrid) continue;
          virtualPool.set(
            outputHrid,
            (virtualPool.get(outputHrid) ?? 0) +
              Math.max(0, Number(output.count) || 0) * actionCount,
          );
        }
      }
      for (const material of requirements ?? []) {
        for (const entry of produced) {
          addPending({
            itemHrid: material.itemHrid,
            amount:
              Math.max(0, Number(material.suggested) || 0) *
              (entry.remaining / totalRemaining),
            goalId: entry.goalId,
            inheritedPolicy: entry.policy === "single" ? "buy" : "chain",
            lineage: [...entry.lineage, itemHrid],
            depth: entry.depth + 1,
          });
        }
      }
    }
  }

  const resultSteps = [...steps.values()]
    .map((step) => ({ ...step, sourceIds: [...step.sourceIds] }))
    .sort((left, right) => left.itemHrid.localeCompare(right.itemHrid));
  const actionsByItem = new Map();
  for (const step of resultSteps) {
    actionsByItem.set(
      step.itemHrid,
      (actionsByItem.get(step.itemHrid) ?? 0) + step.actionCount,
    );
  }
  const nodes = [...decisions.values()]
    .map((decision) => {
      const branches = [...decision.branches.values()]
        .map((branch) => ({
          ...branch,
          policies: [branch.policy],
        }))
        .sort(
          (left, right) =>
            left.goalId.localeCompare(right.goalId) ||
            left.policy.localeCompare(right.policy),
        );
      return {
        itemHrid: decision.itemHrid,
        name: itemName(decision.itemHrid),
        requiredOutput: branches.reduce(
          (sum, branch) => sum + branch.requiredOutput,
          0,
        ),
        outputCount: decision.outputCount,
        actionCount: actionsByItem.get(decision.itemHrid) ?? null,
        sourceIds: branches.map((branch) => branch.goalId),
        policies: [...decision.policies],
        policy:
          decision.policies.size === 1 ? [...decision.policies][0] : "mixed",
        branches,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const resultMaterials = [...materials.values()]
    .map((entry) => {
      const owned = procurement.getInventoryCount(entry.itemHrid, 0);
      const projectInventory = procurement.getProjectReservedInventory(
        entry.itemHrid,
        0,
      );
      const cart = procurement.getCartAllocationSummary(entry.itemHrid, 0);
      const branches = [...entry.branches.values()]
        .map((branch) => ({
          ...branch,
          policies: [...branch.policies],
          policy:
            branch.policies.size === 1 ? [...branch.policies][0] : "mixed",
        }))
        .sort((left, right) => left.goalId.localeCompare(right.goalId));
      const requiredAfterSupply = branches.reduce(
        (sum, branch) => sum + branch.requiredAfterSupply,
        0,
      );
      const addableShortage = Math.max(
        0,
        Math.ceil(requiredAfterSupply - cart.planning - EPSILON),
      );
      const detail = runtime.state.initData_itemDetailMap?.[entry.itemHrid];
      return {
        ...entry,
        sourceIds: [...entry.sourceIds],
        lineages: [...entry.lineages].filter(Boolean),
        reasons: [...entry.reasons],
        branches,
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
  return {
    status: goals.length ? "complete" : "empty",
    goals,
    nodes,
    steps: resultSteps,
    materials: resultMaterials,
    warnings,
  };
}

function calculate() {
  if (cachedResult && cachedRevision === calculationRevision) {
    return cachedResult;
  }
  cachedResult = calculateFresh();
  cachedRevision = calculationRevision;
  lastResult = cachedResult;
  lastCalculatedAt = new Date().toISOString();
  return cachedResult;
}

function calculateDecisions() {
  decisionResult = calculateFresh();
  decisionCalculatedAt = new Date().toISOString();
  return decisionResult;
}

function getDecisionResult() {
  return decisionResult;
}

function updateDecisionPolicy(goalId, itemHrid, policy) {
  const node = decisionResult?.nodes?.find(
    (entry) => entry.itemHrid === itemHrid,
  );
  if (!node) return;
  const merged = new Map();
  for (const branch of node.branches) {
    const next =
      branch.goalId === goalId
        ? { ...branch, policy, policies: [policy] }
        : branch;
    const key = `${next.goalId}\u0000${next.policy}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...next });
      continue;
    }
    for (const field of [
      "requiredOutput",
      "inventoryUsed",
      "virtualUsed",
      "remaining",
    ]) {
      current[field] += next[field];
    }
  }
  node.branches = [...merged.values()].sort(
    (left, right) =>
      left.goalId.localeCompare(right.goalId) ||
      left.policy.localeCompare(right.policy),
  );
  node.policies = [...new Set(node.branches.map((branch) => branch.policy))];
  node.policy = node.policies.length === 1 ? node.policies[0] : "mixed";
}

function getPolicy(itemHrid) {
  const item = procurement.normalizeItemHrid(itemHrid);
  const state = getState();
  return state.goals.length > 0 &&
    state.goals.every(
      (goal) => (state.overrides[goal.id]?.[item] ?? goal.policy) === "buy",
    )
    ? "acquire"
    : "produce";
}

function setPolicy(itemHrid, policy) {
  const item = procurement.normalizeItemHrid(itemHrid);
  const state = getState();
  if (!item || !state.goals.length) return false;
  const mapped = normalizePolicy(policy);
  for (const goal of state.goals) {
    state.overrides[goal.id] = { ...(state.overrides[goal.id] ?? {}) };
    state.overrides[goal.id][item] = mapped;
  }
  saveState(state, "legacy-policy");
  for (const goal of state.goals) {
    updateDecisionPolicy(goal.id, item, mapped);
  }
  return true;
}

function reconcilePlanningCart(result = lastResult) {
  if (!result) return null;
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

function refreshResultCartState(result) {
  if (!result) return result;
  for (const material of result.materials) {
    const cart = procurement.getCartAllocationSummary(material.itemHrid, 0);
    material.cart = cart;
    material.addableShortage = Math.max(
      0,
      Math.ceil(material.requiredAfterSupply - cart.planning - EPSILON),
    );
  }
  return result;
}

function recalculate() {
  const result = calculate();
  reconcilePlanningCart(result);
  refreshResultCartState(result);
  cachedResult = result;
  lastResult = result;
  cachedRevision = calculationRevision;
  return result;
}

function calculateMaterials() {
  cachedResult = null;
  return recalculate();
}

function getResult() {
  return lastResult;
}

function isDirty() {
  return !lastResult || cachedRevision !== calculationRevision;
}

function addShortagesToCart(materials = lastResult?.materials ?? []) {
  return procurement.addToCart(
    materials
      .map((material) => {
        const cart = procurement.getCartAllocationSummary(material.itemHrid, 0);
        return {
          ...material,
          currentShortage: Math.max(
            0,
            Math.ceil(material.requiredAfterSupply - cart.planning - EPSILON),
          ),
        };
      })
      .filter(
        (material) => material.purchasable && material.currentShortage > 0,
      )
      .map((material) => ({
        itemHrid: material.itemHrid,
        enhancementLevel: 0,
        name: material.name,
        quantity: material.currentShortage,
        source: "planning",
        allocation: { kind: "planning" },
      })),
  );
}

procurement.on("planning:change", (event) => {
  invalidate();
  if (event?.reason === "goal" || event?.reason === "load") {
    clearDecisionResult();
  }
});
procurement.on("cart:change", invalidate);
for (const eventName of [
  "plan:change",
  "inventory:change",
  "settings:change",
]) {
  procurement.on(eventName, () => {
    invalidate();
    clearDecisionResult();
  });
}
procurement.on("character:change", () => {
  invalidate();
  clearDecisionResult();
  lastResult = null;
  lastCalculatedAt = null;
});
for (const messageType of [
  "house_rooms_updated",
  "community_buffs_updated",
  "consumable_buffs_updated",
  "action_type_consumable_slots_updated",
  "equipment_buffs_updated",
  "personal_buffs_updated",
  "guild_buffs_updated",
  "init_character_data",
]) {
  runtime.onMessage(messageType, () => {
    invalidate();
    clearDecisionResult();
  });
}

runtime.api.planning = {
  getGoals,
  upsertGoal,
  updateGoal,
  removeGoal,
  getDefaultPolicy,
  setDefaultPolicy,
  getGoalPolicy,
  setGoalPolicy,
  getNodePolicy,
  setNodePolicy,
  getPolicy,
  setPolicy,
  isCraftableItem,
  calculateDecisions,
  getDecisionResult,
  calculateMaterials,
  calculate,
  recalculate,
  getResult,
  isDirty,
  invalidate,
  getDiagnostics: () => ({
    revision: calculationRevision,
    calculationCount,
    dirty: isDirty(),
    lastCalculatedAt,
    decisionCalculatedAt,
  }),
  reconcilePlanningCart,
  addShortagesToCart,
  on(listener) {
    return procurement.on("planning:change", listener);
  },
};
