import { runtime } from "./runtime.js";
import { actionName, itemName } from "./localization.js";

const DATA_VERSION = 3;
const SETTINGS_KEY = "MWITools_procurement_settings_v1";
const DATA_PREFIX = "MWITools_procurement_v1";
const MANUAL_OVERRIDE_MS = 5 * 60 * 1000;
const PURCHASE_SUPPRESSION_MS = 30 * 1000;
const MAX_CHAIN_DEPTH = 25;

const DEFAULT_SETTINGS = Object.freeze({
  badgesEnabled: true,
  upgradeChainEnabled: true,
  createPlansByDefault: true,
  inventorySyncEnabled: true,
  autoCollapseEnabled: true,
  autoExpandOnAddEnabled: false,
  locateEnabled: true,
  autoPrefillEnabled: true,
  purchaseNavEnabled: true,
  pricesEnabled: true,
  cartTotalEnabled: true,
  autoRestockEnabled: true,
  safetyLevel: "95",
  safetyThreshold: 10,
  guzzlingPouchLevel: -1,
  nextItemShortcut: null,
  edgeZoneWidth: 10,
  handleY: 180,
  drawerWidth: 360,
});

const Z_SCORES = Object.freeze({
  off: 0,
  95: 1.645,
  99: 2.326,
  99.9: 3.09,
});

const listeners = new Map();
const cart = new Map();
const plans = new Map();
const inventoryEntries = new Map();
const purchaseSuppressions = new Map();
let planningData = {
  goals: [],
  overrides: {},
  defaults: { item: "chain", house: "chain" },
};
let activeCharacterId = "";
let activeStorageKey = "";
let ready = false;
let settings = loadSettings();
let producerActionSource = null;
let producerActionIndex = null;

function clone(value) {
  return value == null ? value : globalThis.structuredClone(value);
}

function emit(type, detail = {}) {
  for (const listener of listeners.get(type) ?? []) {
    try {
      listener(clone(detail));
    } catch (error) {
      console.error(
        runtime.config.isZH
          ? `[MWITools] 采购事件 ${type} 的监听器执行失败`
          : `[MWITools] Procurement ${type} listener failed`,
        error,
      );
    }
  }
}

function on(type, listener) {
  const registered = listeners.get(type) ?? new Set();
  registered.add(listener);
  listeners.set(type, registered);
  if (type === "ready" && ready) {
    globalThis.queueMicrotask(() =>
      listener({ characterId: activeCharacterId }),
    );
  }
  return () => registered.delete(listener);
}

function off(type, listener) {
  listeners.get(type)?.delete(listener);
}

function normalizeItemHrid(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const bare = raw.replace(/^#/, "").replace(/^\/items\//, "");
  return bare ? `/items/${bare}` : "";
}

function normalizeEnhancementLevel(value) {
  const numeric = Math.floor(Number(value) || 0);
  return Math.max(0, numeric);
}

function itemKey(itemHrid, enhancementLevel = 0) {
  const normalized = normalizeItemHrid(itemHrid);
  return normalized
    ? `${normalized}#${normalizeEnhancementLevel(enhancementLevel)}`
    : "";
}

function parseItemKey(key) {
  const index = String(key).lastIndexOf("#");
  return {
    itemHrid: index >= 0 ? key.slice(0, index) : normalizeItemHrid(key),
    enhancementLevel:
      index >= 0 ? normalizeEnhancementLevel(key.slice(index + 1)) : 0,
  };
}

function emptyAllocations() {
  return { manual: 0, planning: 0, projects: {} };
}

function normalizeAllocations(value, fallbackQuantity = 0) {
  const projects = Object.fromEntries(
    Object.entries(value?.projects ?? {})
      .map(([id, quantity]) => [
        id,
        Math.max(0, Math.ceil(Number(quantity) || 0)),
      ])
      .filter(([, quantity]) => quantity > 0),
  );
  const normalized = {
    manual: Math.max(0, Math.ceil(Number(value?.manual) || 0)),
    planning: Math.max(0, Math.ceil(Number(value?.planning) || 0)),
    projects,
  };
  const allocated = allocationTotal(normalized);
  const fallback = Math.max(0, Math.ceil(Number(fallbackQuantity) || 0));
  if (allocated < fallback) normalized.manual += fallback - allocated;
  return normalized;
}

function allocationTotal(allocations) {
  return (
    Math.max(0, Number(allocations?.manual) || 0) +
    Math.max(0, Number(allocations?.planning) || 0) +
    Object.values(allocations?.projects ?? {}).reduce(
      (sum, quantity) => sum + Math.max(0, Number(quantity) || 0),
      0,
    )
  );
}

function allocationOwner(value = {}) {
  if (value?.allocation?.kind === "planning" || value?.source === "planning") {
    return { kind: "planning", id: "planning" };
  }
  const projectId = value?.allocation?.projectId ?? value?.projectId;
  if (value?.allocation?.kind === "project" && projectId) {
    return { kind: "project", id: String(projectId) };
  }
  return { kind: "manual", id: "manual" };
}

function getAllocationQuantity(row, owner) {
  const allocations = row?.allocations ?? emptyAllocations();
  if (owner?.kind === "planning") return allocations.planning ?? 0;
  if (owner?.kind === "project") {
    return allocations.projects?.[owner.id] ?? 0;
  }
  return allocations.manual ?? 0;
}

function changeAllocation(row, owner, delta) {
  row.allocations = normalizeAllocations(row.allocations);
  if (owner.kind === "planning") {
    row.allocations.planning = Math.max(
      0,
      (row.allocations.planning ?? 0) + delta,
    );
  } else if (owner.kind === "project") {
    const next = Math.max(
      0,
      (row.allocations.projects?.[owner.id] ?? 0) + delta,
    );
    if (next) row.allocations.projects[owner.id] = next;
    else delete row.allocations.projects[owner.id];
  } else {
    row.allocations.manual = Math.max(0, (row.allocations.manual ?? 0) + delta);
  }
  row.quantity = allocationTotal(row.allocations);
}

function getEnvironment() {
  return runtime.api.getMarketEnvironment?.() ?? "production";
}

function getCharacterStorageKey(characterId = activeCharacterId) {
  return `${DATA_PREFIX}:${getEnvironment()}:${characterId}`;
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    return { ...DEFAULT_SETTINGS, ...(stored?.values ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ version: DATA_VERSION, values: settings }),
  );
}

function normalizeSettings(next) {
  const normalized = { ...DEFAULT_SETTINGS, ...next };
  normalized.safetyLevel = Object.hasOwn(Z_SCORES, normalized.safetyLevel)
    ? normalized.safetyLevel
    : "95";
  normalized.safetyThreshold = Math.max(
    0,
    Math.floor(Number(normalized.safetyThreshold) || 0),
  );
  normalized.guzzlingPouchLevel = Math.min(
    20,
    Math.max(-1, Math.floor(Number(normalized.guzzlingPouchLevel) || 0)),
  );
  normalized.edgeZoneWidth = Math.min(
    32,
    Math.max(0, Math.floor(Number(normalized.edgeZoneWidth) || 0)),
  );
  normalized.handleY = Math.max(8, Number(normalized.handleY) || 180);
  normalized.drawerWidth = Math.min(
    560,
    Math.max(300, Number(normalized.drawerWidth) || 360),
  );
  return normalized;
}

function getSettings() {
  return clone(settings);
}

function setSetting(id, value) {
  if (!Object.hasOwn(DEFAULT_SETTINGS, id)) return false;
  const previous = settings[id];
  settings = normalizeSettings({ ...settings, [id]: value });
  saveSettings();
  emit("settings:change", { id, value: settings[id], previous });
  return true;
}

function serializeData() {
  return {
    version: DATA_VERSION,
    cart: [...cart.values()],
    plans: [...plans.values()],
    planning: planningData,
  };
}

function persistData() {
  if (!activeStorageKey) return;
  localStorage.setItem(activeStorageKey, JSON.stringify(serializeData()));
}

function normalizePlanningData(next) {
  return {
    goals: Array.isArray(next?.goals) ? clone(next.goals) : [],
    overrides:
      next?.overrides && typeof next.overrides === "object"
        ? clone(next.overrides)
        : {},
    defaults: {
      item: String(next?.defaults?.item ?? "chain"),
      house: String(next?.defaults?.house ?? "chain"),
    },
  };
}

function migratePlanningData(value) {
  const migrated = normalizePlanningData(value);
  const legacyPolicies =
    value?.policies && typeof value.policies === "object" ? value.policies : {};
  migrated.goals = migrated.goals.map((goal) => ({
    ...goal,
    policy: String(goal?.policy ?? "chain"),
  }));
  for (const goal of migrated.goals) {
    const goalId = String(
      goal?.id ??
        `${goal?.kind === "house" ? "house" : "item"}:${goal?.targetHrid ?? goal?.hrid ?? ""}`,
    );
    if (!goalId) continue;
    const overrides = { ...(migrated.overrides[goalId] ?? {}) };
    for (const [itemHrid, policy] of Object.entries(legacyPolicies)) {
      if (policy === "acquire") overrides[itemHrid] = "buy";
    }
    if (Object.keys(overrides).length) migrated.overrides[goalId] = overrides;
  }
  return migrated;
}

function loadCharacterData(characterId) {
  activeCharacterId = String(characterId ?? "");
  activeStorageKey = activeCharacterId
    ? getCharacterStorageKey(activeCharacterId)
    : "";
  cart.clear();
  plans.clear();
  planningData = normalizePlanningData(null);
  let storedVersion = 0;
  if (activeStorageKey) {
    try {
      const stored = JSON.parse(
        localStorage.getItem(activeStorageKey) || "null",
      );
      storedVersion = Math.max(0, Number(stored?.version) || 0);
      for (const row of stored?.cart ?? []) {
        const key = itemKey(row.itemHrid ?? row.itemId, row.enhancementLevel);
        if (!key) continue;
        cart.set(key, {
          ...row,
          itemHrid: parseItemKey(key).itemHrid,
          enhancementLevel: parseItemKey(key).enhancementLevel,
          quantity: Math.max(0, Math.ceil(Number(row.quantity) || 0)),
          allocations: normalizeAllocations(row.allocations, row.quantity),
        });
      }
      for (const plan of stored?.plans ?? []) {
        if (plan?.id) plans.set(plan.id, plan);
      }
      planningData =
        storedVersion < 3
          ? migratePlanningData(stored?.planning)
          : normalizePlanningData(stored?.planning);
    } catch (error) {
      console.warn(
        runtime.config.isZH
          ? "[MWITools] 无法加载采购数据"
          : "[MWITools] Could not load procurement data",
        error,
      );
    }
  }
  rebuildInventorySnapshot(runtime.state.initData_characterItems ?? []);
  if (storedVersion < 3) {
    if (storedVersion < 2) migrateLegacyCartAllocations();
    persistData();
  }
  refreshPlanProgress();
  ready = Boolean(activeCharacterId);
  emit("character:change", { characterId: activeCharacterId });
  emit("cart:change", { reason: "load", added: 0, items: getCartItems() });
  emit("plan:change", { plans: getPlans() });
  emit("planning:change", { planning: getPlanningData() });
  if (ready) emit("ready", { characterId: activeCharacterId });
}

function migrateLegacyCartAllocations() {
  const availableInventory = inventoryCounts();
  const orderedPlans = [...plans.values()]
    .filter((plan) => plan.status !== "completed")
    .sort(
      (left, right) =>
        String(left.createdAt ?? "").localeCompare(
          String(right.createdAt ?? ""),
        ) || String(left.id).localeCompare(String(right.id)),
    );
  for (const plan of orderedPlans) {
    for (const [key, rawQuantity] of Object.entries(plan.materials ?? {})) {
      const demand = Math.max(0, Math.ceil(Number(rawQuantity) || 0));
      const inventory = Math.min(
        demand,
        Math.max(0, availableInventory.get(key) ?? 0),
      );
      availableInventory.set(
        key,
        Math.max(0, (availableInventory.get(key) ?? 0) - inventory),
      );
      const row = cart.get(key);
      if (!row) continue;
      const claim = Math.min(
        Math.max(0, demand - inventory),
        Math.max(0, row.allocations?.manual ?? 0),
      );
      if (!claim) continue;
      changeAllocation(row, { kind: "manual" }, -claim);
      changeAllocation(row, { kind: "project", id: String(plan.id) }, claim);
    }
  }
}

function getPlanningData() {
  return clone(planningData);
}

function setPlanningData(next, reason = "update") {
  planningData = normalizePlanningData(next);
  persistData();
  emit("planning:change", { reason, planning: getPlanningData() });
  return getPlanningData();
}

function resolveItemName(rawItemHrid) {
  const itemHrid = normalizeItemHrid(rawItemHrid);
  return itemName(itemHrid, { fallback: itemHrid });
}

function resolveActionName(actionHrid) {
  const normalized = String(actionHrid ?? "").trim();
  if (!normalized) return "";
  return actionName(normalized, { fallback: normalized });
}

function inventoryEntryKey(item) {
  return String(
    item?.hash ??
      item?.id ??
      `${item?.itemLocationHrid ?? ""}:${itemKey(item?.itemHrid, item?.enhancementLevel)}`,
  );
}

function sameInventorySlot(left, right) {
  return (
    normalizeItemHrid(left?.itemHrid) === normalizeItemHrid(right?.itemHrid) &&
    String(left?.itemLocationHrid ?? "") ===
      String(right?.itemLocationHrid ?? "") &&
    normalizeEnhancementLevel(left?.enhancementLevel) ===
      normalizeEnhancementLevel(right?.enhancementLevel)
  );
}

function rebuildInventorySnapshot(items) {
  inventoryEntries.clear();
  for (const item of items ?? []) {
    if (!item?.itemHrid) continue;
    inventoryEntries.set(inventoryEntryKey(item), { ...item });
  }
}

function inventoryCounts() {
  const counts = new Map();
  for (const item of inventoryEntries.values()) {
    if (
      item.itemLocationHrid &&
      item.itemLocationHrid !== "/item_locations/inventory"
    ) {
      continue;
    }
    const key = itemKey(item.itemHrid, item.enhancementLevel);
    counts.set(
      key,
      (counts.get(key) ?? 0) + Math.max(0, Number(item.count) || 0),
    );
  }
  return counts;
}

function getInventoryCount(itemHrid, enhancementLevel = 0) {
  return inventoryCounts().get(itemKey(itemHrid, enhancementLevel)) ?? 0;
}

function getLockedDetails(
  itemHrid,
  enhancementLevel = 0,
  excludePlanId = null,
  excludeActionHrids = null,
) {
  const key = itemKey(itemHrid, enhancementLevel);
  const byPlan = [];
  let total = 0;
  for (const plan of plans.values()) {
    if (
      plan.id === excludePlanId ||
      plan.status === "completed" ||
      excludeActionHrids?.has?.(plan.actionHrid)
    ) {
      continue;
    }
    const quantity = Math.max(0, Number(plan.materials?.[key]) || 0);
    if (!quantity) continue;
    total += quantity;
    byPlan.push({
      id: plan.id,
      name: resolveActionName(plan.actionHrid) || plan.name,
      quantity,
    });
  }
  return { total, byPlan };
}

function getEffectiveInventory(
  itemHrid,
  enhancementLevel = 0,
  excludePlanId = null,
) {
  const owned = getInventoryCount(itemHrid, enhancementLevel);
  return Math.max(
    0,
    owned - getLockedDetails(itemHrid, enhancementLevel, excludePlanId).total,
  );
}

function getProjectReservedInventory(itemHrid, enhancementLevel = 0) {
  const owned = getInventoryCount(itemHrid, enhancementLevel);
  return Math.min(owned, getLockedDetails(itemHrid, enhancementLevel).total);
}

function getInventoryAllocationSnapshot() {
  const snapshot = new Map();
  for (const [key, owned] of inventoryCounts()) {
    const { itemHrid, enhancementLevel } = parseItemKey(key);
    snapshot.set(key, {
      owned,
      projectInventory: Math.min(
        owned,
        getLockedDetails(itemHrid, enhancementLevel).total,
      ),
    });
  }
  return snapshot;
}

function isCoin(itemHrid) {
  return normalizeItemHrid(itemHrid) === "/items/coin";
}

function getSafetyScore() {
  return Z_SCORES[settings.safetyLevel] ?? 0;
}

function suggestedMaterialCount(
  baseCount,
  actionCount,
  savingsProbability,
  options = {},
) {
  const base = Math.max(0, Number(baseCount) || 0);
  const actions = Math.max(0, Math.ceil(Number(actionCount) || 0));
  const raw = base * actions;
  const probability = Math.min(1, Math.max(0, Number(savingsProbability) || 0));
  const adjustedPerAction = base * (1 - probability);
  const expected = adjustedPerAction * actions;
  const threshold = options.threshold ?? settings.safetyThreshold;
  const score =
    actions > threshold && options.bufferable !== false ? getSafetyScore() : 0;
  const fractional = adjustedPerAction - Math.floor(adjustedPerAction);
  const deviation = Math.sqrt(actions * fractional * (1 - fractional));
  const cap = actions * Math.ceil(adjustedPerAction);
  const suggested = Math.min(
    raw,
    cap,
    Math.ceil(expected + score * deviation - 1e-9),
  );
  return {
    raw,
    expected,
    buffer: score * deviation,
    suggested,
  };
}

function getGuzzlingPouchLevel() {
  if (settings.guzzlingPouchLevel >= 0) return settings.guzzlingPouchLevel;
  let level = -1;
  for (const item of inventoryEntries.values()) {
    if (normalizeItemHrid(item.itemHrid) !== "/items/guzzling_pouch") continue;
    if (item.itemLocationHrid === "/item_locations/inventory") continue;
    level = Math.max(level, normalizeEnhancementLevel(item.enhancementLevel));
  }
  return level;
}

function getProductionProfile(actionHrid) {
  const level = getGuzzlingPouchLevel();
  return runtime.api.getActionProductionProfile?.(
    actionHrid,
    level >= 0 ? { guzzlingPouchLevel: level } : {},
  );
}

function getTeaSavings(actionHrid) {
  const profile = getProductionProfile(actionHrid);
  if (profile?.status === "complete") {
    return Math.min(
      1,
      Math.max(0, Number(profile.teaEffects?.lessResource) || 0),
    );
  }
  const buffs = runtime.api.getTeaBuffsByActionHrid?.(actionHrid) ?? {};
  const level = getGuzzlingPouchLevel();
  const concentration =
    runtime.api.getDrinkConcentrationMultiplier?.(
      level >= 0 ? { guzzlingPouchLevel: level } : {},
    ) ?? 1;
  return Math.min(
    1,
    (Math.max(0, Number(buffs.lessResource) || 0) / 100) * concentration,
  );
}

function isBackEquipmentForProcurement(itemHrid) {
  const detail =
    runtime.state.initData_itemDetailMap?.[normalizeItemHrid(itemHrid)];
  const equipment = detail?.equipmentDetail;
  return [
    detail?.itemLocationHrid,
    detail?.equipmentSlotHrid,
    detail?.slotHrid,
    equipment?.itemLocationHrid,
    equipment?.equipmentSlotHrid,
    equipment?.slotHrid,
    equipment?.equipmentTypeHrid,
    equipment?.typeHrid,
    equipment?.type,
  ].some((value) => /(?:^|[/_])back(?:$|[/_])/.test(String(value ?? "")));
}

function isRefinedBackUpgrade(detail) {
  if (!normalizeItemHrid(detail?.upgradeItemHrid)) return false;
  return (runtime.api.getExpectedOutputs?.(detail) ?? []).some((output) => {
    const outputHrid = normalizeItemHrid(output?.itemHrid);
    return (
      outputHrid.endsWith("_refined") &&
      isBackEquipmentForProcurement(outputHrid)
    );
  });
}

function materialRequirement(input, actionHrid, actionCount, options = {}) {
  const itemHrid = normalizeItemHrid(input.itemHrid);
  const enhancementLevel = normalizeEnhancementLevel(input.enhancementLevel);
  const baseCount = Math.max(0, Number(input.count) || 0);
  const protectedCount = options.isUpgradeItem
    ? Math.min(baseCount, Math.max(0, Number(input.upgradeItemCount) || 1))
    : 0;
  const reducibleCount = Math.max(0, baseCount - protectedCount);
  const bufferable =
    !isCoin(itemHrid) && reducibleCount > 0 && options.bufferable !== false;
  const protectedCalculation = suggestedMaterialCount(
    protectedCount,
    actionCount,
    0,
    { bufferable: false },
  );
  const reducibleCalculation = suggestedMaterialCount(
    reducibleCount,
    actionCount,
    bufferable ? getTeaSavings(actionHrid) : 0,
    { bufferable },
  );
  const calculated = Object.fromEntries(
    ["raw", "expected", "buffer", "suggested"].map((key) => [
      key,
      protectedCalculation[key] + reducibleCalculation[key],
    ]),
  );
  const owned = getInventoryCount(itemHrid, enhancementLevel);
  const locked = getLockedDetails(
    itemHrid,
    enhancementLevel,
    options.excludePlanId,
    options.excludeActionHrids,
  );
  const effectiveOwned = Math.max(0, owned - locked.total);
  const cartRow = cart.get(itemKey(itemHrid, enhancementLevel));
  const cartQuantity = getAllocationQuantity(
    cartRow,
    options.cartOwner ?? { kind: "manual" },
  );
  return {
    itemHrid,
    enhancementLevel,
    name: resolveItemName(itemHrid),
    ...calculated,
    owned,
    locked: locked.total,
    lockedByPlans: locked.byPlan,
    effectiveOwned,
    cartQuantity,
    shortage: Math.max(0, calculated.suggested - effectiveOwned),
    addableShortage: Math.max(
      0,
      calculated.suggested - effectiveOwned - cartQuantity,
    ),
    purchasable: options.purchasable !== false && !isCoin(itemHrid),
  };
}

function calculateRequirements(actionHrid, count, options = {}) {
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  const actionCount = Math.max(0, Math.ceil(Number(count) || 0));
  if (!detail || !actionCount) {
    return { status: "waiting", actionHrid, count: actionCount, materials: [] };
  }
  const inputs = runtime.api.getDirectInputs?.(detail) ?? [];
  const calculationOptions = {
    ...options,
  };
  const excludedUpgradeHrid = isRefinedBackUpgrade(detail)
    ? normalizeItemHrid(detail.upgradeItemHrid)
    : "";
  const materials = inputs.map((input) =>
    materialRequirement(input, actionHrid, actionCount, {
      ...calculationOptions,
      isUpgradeItem:
        normalizeItemHrid(input.itemHrid) ===
        normalizeItemHrid(detail.upgradeItemHrid),
      purchasable: normalizeItemHrid(input.itemHrid) !== excludedUpgradeHrid,
    }),
  );
  return {
    status: "complete",
    actionHrid,
    count: actionCount,
    detail,
    materials,
    missingTypes: materials.filter(
      (material) => material.purchasable && material.shortage > 0,
    ).length,
    missingQuantity: materials.reduce(
      (sum, material) => sum + (material.purchasable ? material.shortage : 0),
      0,
    ),
  };
}

function getProducerAction(itemHrid) {
  const target = normalizeItemHrid(itemHrid);
  const actionDetails = runtime.state.initData_actionDetailMap ?? {};
  if (producerActionSource !== actionDetails || !producerActionIndex) {
    producerActionSource = actionDetails;
    producerActionIndex = new Map();
    for (const [actionHrid, detail] of Object.entries(actionDetails)) {
      for (const output of runtime.api.getExpectedOutputs?.(detail) ?? []) {
        const outputHrid = normalizeItemHrid(output.itemHrid);
        if (!outputHrid || producerActionIndex.has(outputHrid)) continue;
        producerActionIndex.set(outputHrid, {
          actionHrid,
          detail,
          outputCount: Number(output.count) || 1,
        });
      }
    }
  }
  return producerActionIndex.get(target) ?? null;
}

function getEffectiveProducerOutput(producer, itemHrid) {
  const profile = getProductionProfile(producer?.actionHrid);
  if (profile?.status !== "complete") {
    return {
      known: false,
      count: Math.max(0, Number(producer?.outputCount) || 0),
    };
  }
  const target = normalizeItemHrid(itemHrid);
  return {
    known: true,
    count: (profile.outputs ?? []).reduce(
      (total, output) =>
        normalizeItemHrid(output?.itemHrid) === target
          ? total + Math.max(0, Number(output?.count) || 0)
          : total,
      0,
    ),
  };
}

function mergeMaterial(target, material) {
  const key = itemKey(material.itemHrid, material.enhancementLevel);
  const existing = target.get(key);
  if (!existing) {
    target.set(key, { ...material });
    return;
  }
  const suggested = existing.suggested + material.suggested;
  const owned = existing.owned;
  const locked = existing.locked;
  const effectiveOwned = Math.max(0, owned - locked);
  target.set(key, {
    ...existing,
    raw: existing.raw + material.raw,
    expected: existing.expected + material.expected,
    buffer: existing.buffer + material.buffer,
    suggested,
    shortage: Math.max(0, suggested - effectiveOwned),
    addableShortage: Math.max(
      0,
      suggested - effectiveOwned - existing.cartQuantity,
    ),
  });
}

function calculateUpgradeChain(actionHrid, count, options = {}) {
  const stages = [];
  const leaves = new Map();
  const visited = new Set();
  let cycle = false;
  let truncated = false;
  const unavailableOutputs = new Set();
  const calculationOptions = {
    ...options,
  };

  const visit = (currentHrid, currentCount, depth) => {
    if (depth >= MAX_CHAIN_DEPTH) {
      truncated = true;
      return;
    }
    if (visited.has(currentHrid)) {
      cycle = true;
      return;
    }
    const detail = runtime.state.initData_actionDetailMap?.[currentHrid];
    if (!detail) return;
    visited.add(currentHrid);
    const projection = calculateRequirements(
      currentHrid,
      currentCount,
      calculationOptions,
    );
    const stage = {
      actionHrid: currentHrid,
      name: resolveActionName(currentHrid),
      count: currentCount,
      depth,
      materials: projection.materials,
    };
    stages.push(stage);
    const upgradeHrid = normalizeItemHrid(detail.upgradeItemHrid);
    for (const material of projection.materials) {
      if (upgradeHrid && material.itemHrid === upgradeHrid) continue;
      mergeMaterial(leaves, material);
    }
    if (upgradeHrid) {
      const producer = getProducerAction(upgradeHrid);
      const upgradeMaterial = projection.materials.find(
        (material) => material.itemHrid === upgradeHrid,
      );
      if (upgradeMaterial?.purchasable !== false) {
        if (producer) {
          const effectiveOutput = getEffectiveProducerOutput(
            producer,
            upgradeHrid,
          );
          if (!effectiveOutput.known || effectiveOutput.count > 0) {
            visit(
              producer.actionHrid,
              Math.ceil(
                Math.max(0, Number(upgradeMaterial?.suggested) || 0) /
                  effectiveOutput.count,
              ),
              depth + 1,
            );
          } else {
            unavailableOutputs.add(upgradeHrid);
            mergeMaterial(leaves, upgradeMaterial);
          }
        } else if (upgradeMaterial) {
          mergeMaterial(leaves, upgradeMaterial);
        }
      }
    }
    visited.delete(currentHrid);
  };

  visit(actionHrid, Math.max(0, Math.ceil(Number(count) || 0)), 0);
  return {
    status: stages.length ? "complete" : "waiting",
    stages,
    leaves: [...leaves.values()],
    cycle,
    truncated,
    unavailableOutputs: [...unavailableOutputs],
  };
}

function selectUpgradeChainMaterials(chain, selectedActionHrids) {
  const selected = new Set(selectedActionHrids ?? []);
  const materials = new Map();
  for (const stage of chain?.stages ?? []) {
    if (!selected.has(stage.actionHrid)) continue;
    const detail = runtime.state.initData_actionDetailMap?.[stage.actionHrid];
    const upgradeHrid = normalizeItemHrid(detail?.upgradeItemHrid);
    const producer = upgradeHrid ? getProducerAction(upgradeHrid) : null;
    for (const material of stage.materials ?? []) {
      if (
        upgradeHrid &&
        material.itemHrid === upgradeHrid &&
        producer &&
        selected.has(producer.actionHrid)
      ) {
        continue;
      }
      mergeMaterial(materials, material);
    }
  }
  return [...materials.values()];
}

function getCartItems() {
  return clone(
    [...cart.values()].map((item) => ({
      ...item,
      name: resolveItemName(item.itemHrid) || item.name,
    })),
  );
}

function getCartItem(itemHrid, enhancementLevel = 0) {
  const item = cart.get(itemKey(itemHrid, enhancementLevel));
  return clone(
    item
      ? { ...item, name: resolveItemName(item.itemHrid) || item.name }
      : null,
  );
}

function setCartOrder(keys) {
  if (!Array.isArray(keys)) return false;
  const orderedKeys = [];
  const seen = new Set();
  for (const value of keys) {
    const key = String(value ?? "");
    if (!key || seen.has(key) || !cart.has(key)) continue;
    seen.add(key);
    orderedKeys.push(key);
  }
  for (const key of cart.keys()) {
    if (seen.has(key)) continue;
    seen.add(key);
    orderedKeys.push(key);
  }
  const currentKeys = [...cart.keys()];
  if (
    currentKeys.length === orderedKeys.length &&
    currentKeys.every((key, index) => key === orderedKeys[index])
  ) {
    return false;
  }
  const reordered = orderedKeys.map((key) => [key, cart.get(key)]);
  cart.clear();
  for (const [key, item] of reordered) cart.set(key, item);
  saveCartAndEmit({ reason: "reorder" });
  return true;
}

function saveCartAndEmit({ reason = "update", added = 0 } = {}) {
  persistData();
  emit("cart:change", { reason, added, items: getCartItems() });
}

function resizeCartAllocations(row, quantity) {
  const target = Math.max(0, Math.ceil(Number(quantity) || 0));
  row.allocations = normalizeAllocations(row.allocations, row.quantity);
  let delta = target - allocationTotal(row.allocations);
  if (delta > 0) {
    changeAllocation(row, { kind: "manual" }, delta);
    return;
  }
  let remove = -delta;
  const take = (owner) => {
    if (remove <= 0) return;
    const amount = Math.min(remove, getAllocationQuantity(row, owner));
    if (!amount) return;
    changeAllocation(row, owner, -amount);
    remove -= amount;
  };
  take({ kind: "manual" });
  take({ kind: "planning" });
  const newestProjects = [...plans.values()]
    .sort(
      (left, right) =>
        String(right.createdAt ?? "").localeCompare(
          String(left.createdAt ?? ""),
        ) || String(right.id).localeCompare(String(left.id)),
    )
    .map((plan) => String(plan.id));
  for (const id of newestProjects) take({ kind: "project", id });
  for (const id of Object.keys(row.allocations.projects ?? {})) {
    take({ kind: "project", id });
  }
  row.quantity = allocationTotal(row.allocations);
}

function consumeCartAllocations(row, quantity) {
  let remaining = Math.max(0, Math.floor(Number(quantity) || 0));
  const take = (owner) => {
    if (remaining <= 0) return;
    const amount = Math.min(remaining, getAllocationQuantity(row, owner));
    if (!amount) return;
    changeAllocation(row, owner, -amount);
    remaining -= amount;
  };
  const oldestProjects = [...plans.values()]
    .sort(
      (left, right) =>
        String(left.createdAt ?? "").localeCompare(
          String(right.createdAt ?? ""),
        ) || String(left.id).localeCompare(String(right.id)),
    )
    .map((plan) => String(plan.id));
  for (const id of oldestProjects) take({ kind: "project", id });
  take({ kind: "planning" });
  take({ kind: "manual" });
  for (const id of Object.keys(row.allocations.projects ?? {})) {
    take({ kind: "project", id });
  }
  row.quantity = allocationTotal(row.allocations);
}

function getCartAllocationSummary(itemHrid, enhancementLevel = 0) {
  const row = cart.get(itemKey(itemHrid, enhancementLevel));
  const allocations = normalizeAllocations(row?.allocations, row?.quantity);
  return clone({
    total: allocationTotal(allocations),
    manual: allocations.manual,
    planning: allocations.planning,
    project: Object.values(allocations.projects).reduce(
      (sum, quantity) => sum + quantity,
      0,
    ),
    projects: allocations.projects,
  });
}

function projectIdsFromCartRow(row) {
  return Object.keys(row?.allocations?.projects ?? {});
}

function deleteProjectsWithoutCartAllocations(candidateIds) {
  let changed = false;
  for (const id of new Set(candidateIds ?? [])) {
    const stillListed = [...cart.values()].some(
      (row) => Number(row.allocations?.projects?.[id]) > 0,
    );
    if (!stillListed && plans.delete(id)) changed = true;
  }
  if (changed) savePlansAndEmit();
  return changed;
}

function releaseCartAllocation(owner, itemHrid = null, enhancementLevel = 0) {
  let changed = false;
  const rows = itemHrid
    ? [cart.get(itemKey(itemHrid, enhancementLevel))].filter(Boolean)
    : [...cart.values()];
  for (const row of rows) {
    const quantity = getAllocationQuantity(row, owner);
    if (!quantity) continue;
    changeAllocation(row, owner, -quantity);
    changeAllocation(row, { kind: "manual" }, quantity);
    changed = true;
  }
  if (changed) saveCartAndEmit({ reason: "allocation" });
  return changed;
}

function moveCartAllocationToManual(
  itemHrid,
  enhancementLevel,
  owner,
  quantity,
) {
  const row = cart.get(itemKey(itemHrid, enhancementLevel));
  if (!row) return 0;
  const moved = Math.min(
    Math.max(0, Math.ceil(Number(quantity) || 0)),
    getAllocationQuantity(row, owner),
  );
  if (!moved) return 0;
  changeAllocation(row, owner, -moved);
  changeAllocation(row, { kind: "manual" }, moved);
  saveCartAndEmit({ reason: "allocation" });
  return moved;
}

function addToCart(input) {
  const rows = Array.isArray(input) ? input : [input];
  let added = 0;
  let skipped = 0;
  for (const value of rows) {
    const itemHrid = normalizeItemHrid(value?.itemHrid ?? value?.itemId);
    const enhancementLevel = normalizeEnhancementLevel(value?.enhancementLevel);
    const quantity = Math.ceil(Number(value?.quantity) || 0);
    if (!itemHrid || quantity <= 0 || isCoin(itemHrid)) {
      skipped += 1;
      continue;
    }
    const key = itemKey(itemHrid, enhancementLevel);
    const existing = cart.get(key);
    const owner = allocationOwner(value);
    const row = {
      itemHrid,
      enhancementLevel,
      name: value.name || existing?.name || resolveItemName(itemHrid),
      quantity: existing?.quantity ?? 0,
      allocations: normalizeAllocations(
        existing?.allocations,
        existing?.quantity,
      ),
      starred: Boolean(existing?.starred ?? value.starred),
      threshold: existing?.threshold ?? value.threshold ?? null,
      baselineStock: getInventoryCount(itemHrid, enhancementLevel),
      source: value.source ?? existing?.source ?? "manual",
      updatedAt: new Date().toISOString(),
      manualOverrideUntil: existing?.manualOverrideUntil ?? 0,
    };
    changeAllocation(row, owner, quantity);
    cart.set(key, row);
    added += 1;
  }
  if (added) saveCartAndEmit({ reason: "add", added });
  return { ok: added > 0, added, skipped };
}

function addRequirementsToCart(
  materials,
  source = "material",
  allocation = null,
) {
  return addToCart(
    (materials ?? [])
      .filter(
        (material) => material.purchasable && material.addableShortage > 0,
      )
      .map((material) => ({
        itemHrid: material.itemHrid,
        enhancementLevel: material.enhancementLevel,
        name: material.name,
        quantity: material.addableShortage,
        source,
        allocation,
      })),
  );
}

function aggregateRequirements(requirementGroups) {
  const materials = new Map();
  for (const group of requirementGroups ?? []) {
    for (const material of group ?? []) mergeMaterial(materials, material);
  }
  return [...materials.values()];
}

function setCartItemQuantity(itemHrid, quantity, enhancementLevel = 0) {
  const key = itemKey(itemHrid, enhancementLevel);
  const row = cart.get(key);
  if (!row) return { ok: false };
  const affectedProjects = projectIdsFromCartRow(row);
  const normalized = Math.max(0, Math.ceil(Number(quantity) || 0));
  if (!normalized && !row.starred) cart.delete(key);
  else {
    resizeCartAllocations(row, normalized);
    row.baselineStock = getInventoryCount(row.itemHrid, row.enhancementLevel);
    row.manualOverrideUntil = Date.now() + MANUAL_OVERRIDE_MS;
    row.updatedAt = new Date().toISOString();
  }
  saveCartAndEmit();
  deleteProjectsWithoutCartAllocations(affectedProjects);
  return { ok: true };
}

function updateCartItem(itemHrid, enhancementLevel, patch) {
  const row = cart.get(itemKey(itemHrid, enhancementLevel));
  if (!row) return false;
  const affectedProjects = projectIdsFromCartRow(row);
  Object.assign(row, patch, { updatedAt: new Date().toISOString() });
  if (Object.hasOwn(patch, "quantity")) {
    resizeCartAllocations(row, patch.quantity);
    row.manualOverrideUntil = Date.now() + MANUAL_OVERRIDE_MS;
  }
  if (Object.hasOwn(patch, "threshold")) {
    row.threshold =
      patch.threshold == null
        ? null
        : Math.max(0, Math.ceil(Number(patch.threshold) || 0));
  }
  saveCartAndEmit();
  deleteProjectsWithoutCartAllocations(affectedProjects);
  return true;
}

function removeFromCart(itemHrid, enhancementLevel = 0) {
  const key = itemKey(itemHrid, enhancementLevel);
  const affectedProjects = projectIdsFromCartRow(cart.get(key));
  const removed = cart.delete(key);
  if (removed) {
    saveCartAndEmit();
    deleteProjectsWithoutCartAllocations(affectedProjects);
  }
  return { ok: removed };
}

function clearCart({ includeStarred = false } = {}) {
  const affectedProjects = new Set();
  for (const [key, row] of cart) {
    if (includeStarred || !row.starred) {
      projectIdsFromCartRow(row).forEach((id) => affectedProjects.add(id));
      cart.delete(key);
    }
  }
  saveCartAndEmit();
  deleteProjectsWithoutCartAllocations(affectedProjects);
  return { ok: true };
}

function applyAcquisition(itemHrid, enhancementLevel, quantity, options = {}) {
  const key = itemKey(itemHrid, enhancementLevel);
  const row = cart.get(key);
  const acquired = Math.max(0, Math.floor(Number(quantity) || 0));
  if (!row || !acquired || !settings.inventorySyncEnabled) return false;
  const before = row.quantity;
  const affectedProjects = projectIdsFromCartRow(row);
  consumeCartAllocations(row, acquired);
  row.baselineStock = getInventoryCount(row.itemHrid, row.enhancementLevel);
  row.updatedAt = new Date().toISOString();
  let fulfilled = false;
  if (row.quantity <= 0) {
    fulfilled = true;
    if (row.starred) row.quantity = 0;
    else cart.delete(key);
  }
  saveCartAndEmit();
  deleteProjectsWithoutCartAllocations(affectedProjects);
  if (fulfilled) {
    emit("item:fulfilled", { item: clone(row), source: options.source });
    if (![...cart.values()].some((candidate) => candidate.quantity > 0)) {
      emit("all:fulfilled", {});
    }
  }
  return row.quantity !== before || fulfilled;
}

function confirmMarketPurchase(itemHrid, quantity, enhancementLevel = 0) {
  const key = itemKey(itemHrid, enhancementLevel);
  const acquired = Math.max(0, Math.floor(Number(quantity) || 0));
  if (!acquired) return false;
  const applied = applyAcquisition(itemHrid, enhancementLevel, acquired, {
    source: "market-confirmation",
  });
  if (applied) {
    purchaseSuppressions.set(key, {
      quantity: acquired,
      expiresAt: Date.now() + PURCHASE_SUPPRESSION_MS,
    });
  }
  return applied;
}

function consumePurchaseSuppression(key, delta) {
  const suppression = purchaseSuppressions.get(key);
  if (!suppression || Date.now() > suppression.expiresAt) {
    purchaseSuppressions.delete(key);
    return delta;
  }
  const remaining = Math.max(0, delta - suppression.quantity);
  suppression.quantity = Math.max(0, suppression.quantity - delta);
  if (!suppression.quantity) purchaseSuppressions.delete(key);
  return remaining;
}

function applyInventoryUpdates(items) {
  const before = inventoryCounts();
  for (const item of items ?? []) {
    if (!item?.itemHrid) continue;
    const key = inventoryEntryKey(item);
    const lacksStableId = item.hash == null && item.id == null;
    const matchingKeys = [...inventoryEntries]
      .filter(
        ([currentKey, current]) =>
          currentKey === key ||
          ((Number(item.count) <= 0 || lacksStableId) &&
            sameInventorySlot(current, item)),
      )
      .map(([currentKey]) => currentKey);
    for (const currentKey of matchingKeys) inventoryEntries.delete(currentKey);
    if (Number(item.count) > 0) inventoryEntries.set(key, { ...item });
  }
  const after = inventoryCounts();
  const keys = new Set([...before.keys(), ...after.keys()]);
  const changes = [...keys]
    .map((key) => ({
      key,
      ...parseItemKey(key),
      before: before.get(key) ?? 0,
      after: after.get(key) ?? 0,
      delta: (after.get(key) ?? 0) - (before.get(key) ?? 0),
    }))
    .filter((change) => change.delta !== 0);
  if (!changes.length) return;
  for (const key of keys) {
    const delta = (after.get(key) ?? 0) - (before.get(key) ?? 0);
    const row = cart.get(key);
    if (row) row.baselineStock = after.get(key) ?? 0;
    if (delta > 0) {
      const unsuppressed = consumePurchaseSuppression(key, delta);
      if (unsuppressed > 0) {
        const parsed = parseItemKey(key);
        applyAcquisition(
          parsed.itemHrid,
          parsed.enhancementLevel,
          unsuppressed,
          {
            source: "inventory",
          },
        );
      }
    }
  }
  applyRestockThresholds();
  refreshPlanProgress();
  persistData();
  emit("inventory:change", {
    changes: changes.map(({ key: _key, ...change }) => change),
  });
}

function applyRestockThresholds() {
  if (!settings.autoRestockEnabled) return;
  const now = Date.now();
  let changed = false;
  let added = 0;
  for (const row of cart.values()) {
    if (!row.starred || !row.threshold || row.manualOverrideUntil > now)
      continue;
    const owned = getInventoryCount(row.itemHrid, row.enhancementLevel);
    const required = Math.max(0, row.threshold - owned);
    if (required !== row.quantity) {
      if (required > row.quantity) added += 1;
      resizeCartAllocations(row, required);
      row.baselineStock = owned;
      changed = true;
    }
  }
  if (changed) {
    saveCartAndEmit({
      reason: added ? "add" : "update",
      added,
    });
  }
}

function getPlans() {
  refreshPlanProgress();
  return clone(
    [...plans.values()].map((plan) => ({
      ...plan,
      name: resolveActionName(plan.actionHrid) || plan.name,
    })),
  );
}

function savePlansAndEmit() {
  persistData();
  emit("plan:change", { plans: getPlans() });
}

function createPlan(actionHrid, count, materials = null) {
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  if (!detail) return null;
  const targetCount = Math.max(1, Math.ceil(Number(count) || 1));
  const calculated =
    materials ??
    (settings.upgradeChainEnabled
      ? calculateUpgradeChain(actionHrid, targetCount).leaves
      : calculateRequirements(actionHrid, targetCount).materials);
  const lockedMaterials = Object.fromEntries(
    calculated
      .filter((material) => material.purchasable)
      .map((material) => [
        itemKey(material.itemHrid, material.enhancementLevel),
        material.suggested,
      ]),
  );
  const matching = [...plans.values()].find(
    (plan) =>
      plan.status !== "completed" &&
      plan.actionHrid === actionHrid &&
      plan.targetCount === targetCount &&
      JSON.stringify(plan.materials ?? {}) === JSON.stringify(lockedMaterials),
  );
  if (matching) return clone({ ...matching, reused: true });
  const output = runtime.api.getExpectedOutputs?.(detail)?.[0] ?? null;
  const id =
    globalThis.crypto?.randomUUID?.() ?? `plan-${Date.now()}-${Math.random()}`;
  const plan = {
    id,
    actionHrid,
    name: detail.name ?? actionHrid.split("/").at(-1),
    targetCount,
    materials: lockedMaterials,
    outputItemHrid: output?.itemHrid ?? null,
    outputPerAction: Number(output?.count) || 0,
    baselineOutput: output ? getInventoryCount(output.itemHrid, 0) : 0,
    onlineProgress: 0,
    progress: 0,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  plans.set(id, plan);
  savePlansAndEmit();
  return clone(plan);
}

function addProjectRequirementsToCart(planId) {
  const plan = plans.get(planId);
  if (!plan || plan.status === "completed") {
    return { ok: false, added: 0, skipped: 0 };
  }
  const demandByKey = new Map();
  for (const candidate of plans.values()) {
    if (candidate.status === "completed") continue;
    for (const [key, quantity] of Object.entries(candidate.materials ?? {})) {
      demandByKey.set(
        key,
        (demandByKey.get(key) ?? 0) +
          Math.max(0, Math.ceil(Number(quantity) || 0)),
      );
    }
  }
  const rows = [];
  for (const [key, demand] of demandByKey) {
    const parsed = parseItemKey(key);
    const desired = Math.max(
      0,
      demand - getInventoryCount(parsed.itemHrid, parsed.enhancementLevel),
    );
    const summary = getCartAllocationSummary(
      parsed.itemHrid,
      parsed.enhancementLevel,
    );
    const addable = Math.max(0, desired - summary.project);
    if (!addable || isCoin(parsed.itemHrid)) continue;
    rows.push({
      itemHrid: parsed.itemHrid,
      enhancementLevel: parsed.enhancementLevel,
      name: resolveItemName(parsed.itemHrid),
      quantity: addable,
      source: "project",
      allocation: { kind: "project", projectId: String(planId) },
    });
  }
  return addToCart(rows);
}

function releaseExcessProjectAllocations(plan) {
  let changed = false;
  for (const row of cart.values()) {
    const owner = { kind: "project", id: String(plan.id) };
    const allocated = getAllocationQuantity(row, owner);
    const allowed = Math.max(
      0,
      Math.ceil(
        Number(plan.materials?.[itemKey(row.itemHrid, row.enhancementLevel)]) ||
          0,
      ),
    );
    const excess = Math.max(0, allocated - allowed);
    if (!excess) continue;
    changeAllocation(row, owner, -excess);
    changeAllocation(row, { kind: "manual" }, excess);
    changed = true;
  }
  if (changed) saveCartAndEmit({ reason: "allocation" });
}

function refreshPlanProgress() {
  for (const plan of plans.values()) {
    if (plan.status === "completed") continue;
    const inventoryProgress =
      plan.outputItemHrid && plan.outputPerAction > 0
        ? Math.floor(
            Math.max(
              0,
              getInventoryCount(plan.outputItemHrid, 0) - plan.baselineOutput,
            ) / plan.outputPerAction,
          )
        : 0;
    plan.progress = Math.min(
      plan.targetCount,
      Math.max(plan.progress ?? 0, plan.onlineProgress ?? 0, inventoryProgress),
    );
  }
}

function recordActionCompletion(payload) {
  const action =
    payload?.endCharacterAction ?? payload?.characterAction ?? payload;
  const actionHrid =
    action?.actionHrid ??
    action?.hrid ??
    runtime.state.currentActionsHridList?.find(
      (candidate) => candidate.id === action?.id,
    )?.actionHrid;
  if (!actionHrid) return;
  let changed = false;
  for (const plan of plans.values()) {
    if (plan.status === "completed" || plan.actionHrid !== actionHrid) continue;
    plan.onlineProgress = Math.min(
      plan.targetCount,
      (plan.onlineProgress ?? 0) + 1,
    );
    plan.progress = Math.max(plan.progress ?? 0, plan.onlineProgress);
    plan.updatedAt = new Date().toISOString();
    changed = true;
  }
  if (changed) savePlansAndEmit();
}

function updatePlan(id, patch) {
  const plan = plans.get(id);
  if (!plan) return false;
  if (Object.hasOwn(patch, "targetCount")) {
    plan.targetCount = Math.max(1, Math.ceil(Number(patch.targetCount) || 1));
    const chain = settings.upgradeChainEnabled
      ? calculateUpgradeChain(plan.actionHrid, plan.targetCount).leaves
      : calculateRequirements(plan.actionHrid, plan.targetCount).materials;
    plan.materials = Object.fromEntries(
      chain
        .filter((material) => material.purchasable)
        .map((material) => [
          itemKey(material.itemHrid, material.enhancementLevel),
          material.suggested,
        ]),
    );
    releaseExcessProjectAllocations(plan);
  }
  if (patch.status === "completed" || patch.status === "active") {
    if (patch.status === "completed" && plan.status !== "completed") {
      releaseCartAllocation({ kind: "project", id: String(plan.id) });
    }
    plan.status = patch.status;
  }
  plan.updatedAt = new Date().toISOString();
  savePlansAndEmit();
  runtime.api.planning?.reconcilePlanningCart?.();
  return true;
}

function removePlan(id) {
  releaseCartAllocation({ kind: "project", id: String(id) });
  const removed = plans.delete(id);
  if (removed) {
    savePlansAndEmit();
    runtime.api.planning?.reconcilePlanningCart?.();
  }
  return removed;
}

function parsePurchaseConfirmation(payload) {
  if (
    payload?.type !== "info" ||
    payload?.message !== "infoNotification.buyOrderCompleted"
  ) {
    return null;
  }
  const variables = new Map(
    (Array.isArray(payload.variables) ? payload.variables : [])
      .filter((entry) => entry?.name)
      .map((entry) => [entry.name, entry.data]),
  );
  return {
    itemHrid: normalizeItemHrid(variables.get("itemHrid")),
    quantity: Math.max(0, Math.floor(Number(variables.get("count")) || 0)),
    enhancementLevel: normalizeEnhancementLevel(
      variables.get("enhancementLevel"),
    ),
  };
}

function installMessageHandlers() {
  runtime.onMessage("init_character_data", () => {
    loadCharacterData(runtime.state.currentCharacterId);
  });
  runtime.onMessage("items_updated", (payload) => {
    applyInventoryUpdates(payload.endCharacterItems ?? []);
  });
  runtime.onMessage("action_completed", recordActionCompletion);
  runtime.onMessage("info", (payload) => {
    const purchase = parsePurchaseConfirmation(payload);
    if (purchase?.itemHrid && purchase.quantity) {
      confirmMarketPurchase(
        purchase.itemHrid,
        purchase.quantity,
        purchase.enhancementLevel,
      );
    }
  });
}

function exposePublicApi() {
  const pageWindow = globalThis.unsafeWindow ?? globalThis.window ?? globalThis;
  const root = pageWindow.MWITools ?? {};
  const publicApi = {
    version: "1.0.0",
    apiVersion: 1,
    get ready() {
      return ready;
    },
    getCartItems,
    getCartItem,
    hasCartItem: (itemHrid, enhancementLevel = 0) =>
      cart.has(itemKey(itemHrid, enhancementLevel)),
    getCartCount: () => cart.size,
    addToCart,
    setCartItemQuantity,
    removeFromCart,
    clearCart,
    resolveItemName,
    resolveActionName,
    normalizeItemId: (value) => normalizeItemHrid(value).replace("/items/", ""),
    openMarketplace: (itemHrid, enhancementLevel = 0) =>
      runtime.api.openProcurementMarketplace?.(itemHrid, enhancementLevel) ??
      false,
    on,
    off,
  };
  root.shopping = publicApi;
  pageWindow.MWITools = root;
  return publicApi;
}

installMessageHandlers();
const publicApi = exposePublicApi();

Object.assign(runtime.api, {
  procurement: {
    defaults: DEFAULT_SETTINGS,
    on,
    off,
    emit,
    get ready() {
      return ready;
    },
    get activeCharacterId() {
      return activeCharacterId;
    },
    normalizeItemHrid,
    itemKey,
    parseItemKey,
    resolveItemName,
    resolveActionName,
    getSettings,
    setSetting,
    loadCharacterData,
    getInventoryCount,
    getEffectiveInventory,
    getLockedDetails,
    getProjectReservedInventory,
    getInventoryAllocationSnapshot,
    suggestedMaterialCount,
    calculateRequirements,
    getProducerAction,
    calculateUpgradeChain,
    selectUpgradeChainMaterials,
    aggregateRequirements,
    getCartItems,
    getCartItem,
    setCartOrder,
    getCartAllocationSummary,
    addToCart,
    addRequirementsToCart,
    releaseCartAllocation,
    moveCartAllocationToManual,
    setCartItemQuantity,
    updateCartItem,
    removeFromCart,
    clearCart,
    getPlans,
    createPlan,
    addProjectRequirementsToCart,
    updatePlan,
    removePlan,
    getPlanningData,
    setPlanningData,
    confirmMarketPurchase,
    applyInventoryUpdates,
    applyRestockThresholds,
    recordActionCompletion,
    parsePurchaseConfirmation,
    publicApi,
  },
});
