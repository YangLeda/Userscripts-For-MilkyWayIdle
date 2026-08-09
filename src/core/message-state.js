import { runtime } from "./runtime.js";

function applyClientData(payload) {
  runtime.state.initData_actionDetailMap = payload.actionDetailMap;
  runtime.state.initData_levelExperienceTable = payload.levelExperienceTable;
  runtime.state.initData_itemDetailMap = payload.itemDetailMap;
  runtime.state.initData_itemLocationDetailMap = payload.itemLocationDetailMap;
  runtime.state.initData_houseRoomDetailMap = payload.houseRoomDetailMap;
  runtime.state.initData_actionCategoryDetailMap =
    payload.actionCategoryDetailMap;
  runtime.state.initData_abilityDetailMap = payload.abilityDetailMap;
  runtime.state.initData_shopItemDetailMap = payload.shopItemDetailMap;
  runtime.state.initData_taskShopItemDetailMap = payload.taskShopItemDetailMap;
  runtime.state.initData_labyrinthShopItemDetailMap =
    payload.labyrinthShopItemDetailMap;
  runtime.state.initData_openableLootDropMap = payload.openableLootDropMap;
  runtime.state.initData_guildBuffDetailMap = payload.guildBuffDetailMap;
  runtime.api.invalidateAssetValueCache?.();

  for (const [key, value] of Object.entries(
    runtime.state.initData_itemDetailMap,
  )) {
    runtime.state.itemEnNameToHridMap[value.name] = key;
  }
}

const CHARACTER_GUILD_BUFF_KEYS = [
  "characterGuildBuffMap",
  "characterGuildBuffDict",
  "characterGuildBuffs",
  "characterGuildBuffLevelMap",
  "characterGuildBuffLevelDict",
];

const FALLBACK_GUILD_BUFF_KEYS = [
  "guildBuffLevelMap",
  "guildBuffLevelDict",
  "guildBuffLevels",
  "guildBuffMap",
  "guildBuffDict",
];

function normalizeGuildBuffLevels(candidate) {
  if (!candidate || typeof candidate !== "object") return {};
  const entries = Array.isArray(candidate)
    ? candidate.map((record, index) => [
        record?.guildBuffHrid ?? record?.hrid ?? String(index),
        record,
      ])
    : Object.entries(candidate);
  return Object.fromEntries(entries.filter(([guildBuffHrid]) => guildBuffHrid));
}

function applyGuildData(payload, markLoaded = false) {
  const preferredCandidates = [];
  const fallbackCandidates = [];
  const pending = [{ value: payload, depth: 0 }];
  const visited = new Set();
  let scanned = 0;
  while (pending.length && scanned < 400) {
    const { value, depth } = pending.pop();
    if (
      !value ||
      typeof value !== "object" ||
      visited.has(value) ||
      depth > 6
    ) {
      continue;
    }
    visited.add(value);
    scanned += 1;
    for (const key of CHARACTER_GUILD_BUFF_KEYS) {
      if (value[key] && typeof value[key] === "object")
        preferredCandidates.push(value[key]);
    }
    for (const key of FALLBACK_GUILD_BUFF_KEYS) {
      if (value[key] && typeof value[key] === "object")
        fallbackCandidates.push(value[key]);
    }
    for (const child of Object.values(value)) {
      if (child && typeof child === "object")
        pending.push({ value: child, depth: depth + 1 });
    }
  }

  const candidates = [...fallbackCandidates, ...preferredCandidates];
  if (candidates.length) {
    runtime.state.guildBuffLevels = candidates.reduce(
      (levels, candidate) => ({
        ...levels,
        ...normalizeGuildBuffLevels(candidate),
      }),
      runtime.state.guildBuffLevels ?? {},
    );
    runtime.state.guildDataLoaded = true;
  } else if (markLoaded) {
    runtime.state.guildDataLoaded = true;
  }
}

function applyCharacterData(payload) {
  runtime.state.initData_characterSkills = payload.characterSkills;
  runtime.state.initData_characterItems = payload.characterItems ?? [];
  runtime.state.initData_characterHouseRoomMap = payload.characterHouseRoomMap;
  runtime.state.initData_actionTypeDrinkSlotsMap =
    payload.actionTypeDrinkSlotsMap;
  runtime.state.initData_characterAbilities = payload.characterAbilities;
  runtime.state.initData_myMarketListings = payload.myMarketListings ?? [];
  runtime.state.initData_combatAbilities =
    payload.combatUnit?.combatAbilities ?? [];
  runtime.state.currentActionsHridList = [...(payload.characterActions ?? [])];
  runtime.state.currentEquipmentMap = {};
  for (const item of payload.characterItems ?? []) {
    if (item.itemLocationHrid !== "/item_locations/inventory") {
      runtime.state.currentEquipmentMap[item.itemLocationHrid] = item;
    }
  }
  applyGuildData(payload);
}

function applyActionsUpdated(payload) {
  for (const action of payload.endCharacterActions) {
    if (action.isDone === false)
      runtime.state.currentActionsHridList.push(action);
    else
      runtime.state.currentActionsHridList =
        runtime.state.currentActionsHridList.filter(
          ({ id }) => id !== action.id,
        );
  }
}

function applyActionCompleted(payload) {
  const action = payload.endCharacterAction;
  if (action.isDone !== false) return;
  const currentAction = runtime.state.currentActionsHridList.find(
    ({ id }) => id === action.id,
  );
  if (currentAction) currentAction.currentCount = action.currentCount;
}

function applyItemsUpdated(payload) {
  if (!payload.endCharacterItems) return;
  for (const item of payload.endCharacterItems) {
    const existingIndex = runtime.state.initData_characterItems?.findIndex(
      (current) =>
        (item.id != null && current.id === item.id) ||
        (item.id == null &&
          current.itemHrid === item.itemHrid &&
          current.itemLocationHrid === item.itemLocationHrid &&
          current.enhancementLevel === item.enhancementLevel),
    );
    if (existingIndex >= 0) {
      if (item.count === 0)
        runtime.state.initData_characterItems.splice(existingIndex, 1);
      else runtime.state.initData_characterItems[existingIndex] = item;
    } else if (item.count > 0) {
      runtime.state.initData_characterItems?.push(item);
    }
    if (item.itemLocationHrid === "/item_locations/inventory") continue;
    runtime.state.currentEquipmentMap[item.itemLocationHrid] =
      item.count === 0 ? null : item;
  }
}

/** Apply only shared game state; UI and persistence are feature effects. */
function applyGameMessage(payload) {
  switch (payload.type) {
    case "init_client_data":
      applyClientData(payload);
      break;
    case "init_character_data":
      applyCharacterData(payload);
      break;
    case "actions_updated":
      applyActionsUpdated(payload);
      break;
    case "action_completed":
      applyActionCompleted(payload);
      break;
    case "items_updated":
      applyItemsUpdated(payload);
      break;
    case "market_item_values_updated":
      runtime.api.applyMarketItemValues(payload);
      break;
    case "market_item_order_books_updated":
      runtime.api.applyMarketOrderBooks(payload);
      break;
    case "market_listings_updated":
      runtime.api.applyMarketListings(payload);
      break;
    case "guild_updated":
      applyGuildData(payload, true);
      break;
  }
}

Object.assign(runtime.api, { applyGameMessage, applyGuildData });
