import { runtime } from "./runtime.js";

function applyClientData(payload) {
  runtime.state.initData_actionDetailMap = payload.actionDetailMap;
  runtime.state.initData_levelExperienceTable = payload.levelExperienceTable;
  runtime.state.initData_enhancementLevelSuccessRateTable =
    payload.enhancementLevelSuccessRateTable;
  runtime.state.initData_enhancementLevelTotalBonusMultiplierTable =
    payload.enhancementLevelTotalBonusMultiplierTable;
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

const ACTION_TYPE_BUFF_SOURCE_KEYS = [
  "mooPassActionTypeBuffsMap",
  "communityActionTypeBuffsMap",
  "houseActionTypeBuffsMap",
  "guildActionTypeBuffsMap",
  "achievementActionTypeBuffsMap",
  "consumableActionTypeBuffsMap",
  "equipmentActionTypeBuffsMap",
  "personalActionTypeBuffsMap",
];

function applyActionTypeBuffs(payload, reset = false) {
  const nextSources = reset
    ? {}
    : { ...(runtime.state.actionTypeBuffSources ?? {}) };
  let receivedSource = false;
  for (const key of ACTION_TYPE_BUFF_SOURCE_KEYS) {
    if (!Object.hasOwn(payload, key)) continue;
    nextSources[key] = payload[key] ?? {};
    receivedSource = true;
  }

  if (reset) {
    runtime.state.actionTypeBuffSources = receivedSource ? nextSources : null;
  } else if (receivedSource) {
    runtime.state.actionTypeBuffSources = nextSources;
  }

  if (Object.hasOwn(payload, "equipmentTaskActionBuffs")) {
    runtime.state.equipmentTaskActionBuffs =
      payload.equipmentTaskActionBuffs ?? [];
  } else if (reset) {
    runtime.state.equipmentTaskActionBuffs = [];
  }

  if (Object.hasOwn(payload, "actionTypeDrinkSlotsMap")) {
    runtime.state.initData_actionTypeDrinkSlotsMap =
      payload.actionTypeDrinkSlotsMap ?? {};
  }
}

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
  runtime.state.currentCharacterId =
    payload.character?.id ??
    payload.character?.characterID ??
    payload.characterID ??
    payload.characterSkills?.[0]?.characterID ??
    "";
  runtime.state.currentCharacterName =
    payload.character?.name ??
    payload.characterName ??
    payload.sharableCharacter?.name ??
    payload.combatUnit?.name ??
    "";
  runtime.state.currentCharacterGameMode =
    payload.character?.gameMode ??
    payload.combatUnit?.character?.gameMode ??
    payload.sharableCharacter?.gameMode ??
    "standard";
  runtime.state.labyrinthActive = Boolean(payload.labyrinth?.isActive);
  runtime.state.initData_characterSkills = payload.characterSkills;
  runtime.state.initData_characterItems = payload.characterItems ?? [];
  runtime.state.initData_characterHouseRoomMap = payload.characterHouseRoomMap;
  runtime.state.initData_actionTypeDrinkSlotsMap =
    payload.actionTypeDrinkSlotsMap;
  runtime.state.initData_characterAbilities = payload.characterAbilities;
  runtime.state.initData_myMarketListings = payload.myMarketListings ?? [];
  runtime.state.initData_combatAbilities =
    payload.combatUnit?.combatAbilities ?? [];
  runtime.state.currentActionsHridList = normalizeActionList(
    payload.characterActions ?? [],
  );
  runtime.state.characterQuests = (payload.characterQuests ?? []).map(
    (quest, index) => ({ ...quest, _mwitoolsOriginalIndex: index }),
  );
  applyActionTypeBuffs(payload, true);
  runtime.state.currentEquipmentMap = {};
  for (const item of payload.characterItems ?? []) {
    if (item.itemLocationHrid !== "/item_locations/inventory") {
      runtime.state.currentEquipmentMap[item.itemLocationHrid] = item;
    }
  }
  applyGuildData(payload);
  applyGuildSnapshot(payload);
  applyGuildCharacters(payload);
}

function applySkillsUpdated(payload) {
  const updates = payload.endCharacterSkills ?? payload.characterSkills ?? [];
  if (!Array.isArray(updates) || !updates.length) return;
  const skills = [...(runtime.state.initData_characterSkills ?? [])];
  for (const update of updates) {
    const index = skills.findIndex(
      (skill) => skill.skillHrid === update.skillHrid,
    );
    if (index >= 0) skills[index] = { ...skills[index], ...update };
    else skills.push(update);
  }
  runtime.state.initData_characterSkills = skills;
}

function getQuestId(quest) {
  return quest?.id ?? quest?.characterQuestID ?? quest?.characterQuestId;
}

function applyQuestsUpdated(payload) {
  const updates = payload.endCharacterQuests ?? payload.characterQuests ?? [];
  if (!Array.isArray(updates)) return;
  const quests = [...runtime.state.characterQuests];
  for (const update of updates) {
    const id = getQuestId(update);
    const index = quests.findIndex((quest) => getQuestId(quest) === id);
    const removed =
      update.isClaimed ||
      update.claimed ||
      update.isDeleted ||
      update.deleted ||
      String(update.status ?? "").includes("claimed");
    if (removed) {
      if (index >= 0) quests.splice(index, 1);
      continue;
    }
    if (index >= 0) {
      quests[index] = {
        ...quests[index],
        ...update,
        _mwitoolsOriginalIndex: quests[index]._mwitoolsOriginalIndex,
      };
    } else {
      quests.push({ ...update, _mwitoolsOriginalIndex: quests.length });
    }
  }
  runtime.state.characterQuests = quests;
}

function findArray(payload, keys) {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  for (const value of Object.values(payload ?? {})) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const key of keys) {
      if (Array.isArray(value[key])) return value[key];
    }
  }
  return [];
}

function applyGuildSnapshot(payload) {
  const guild = payload.guild ?? payload.endGuild ?? payload.guildData;
  if (guild) runtime.state.guild = { ...(runtime.state.guild ?? {}), ...guild };
  runtime.state.guildStateUpdatedAt = Date.now();
}

function applyGuildCharacters(payload) {
  let characters = findArray(payload, [
    "guildCharacters",
    "endGuildCharacters",
    "characters",
    "members",
  ]);
  const characterMap =
    payload.guildCharacterMap ?? payload.endGuildCharacterMap ?? null;
  const sharableMap =
    payload.guildSharableCharacterMap ??
    payload.endGuildSharableCharacterMap ??
    {};
  if (!characters.length && characterMap && typeof characterMap === "object") {
    characters = Object.entries(characterMap).map(([id, character]) => ({
      ...sharableMap[id],
      ...character,
      characterID: character.characterID ?? Number(id),
    }));
  }
  if (characters.length) runtime.state.guildCharacters = characters;
  runtime.state.guildStateUpdatedAt = Date.now();
}

function applyLeaderboard(payload) {
  const category = String(
    payload.category ?? payload.leaderboardCategory ?? payload.typeHrid ?? "",
  ).toLowerCase();
  if (!category.includes("guild")) return;
  const rows = findArray(payload, [
    "leaderboard",
    "leaderboardEntries",
    "entries",
    "rankings",
    "guilds",
  ]);
  if (rows.length) runtime.state.guildLeaderboard = rows;
}

function normalizeActionList(actions) {
  const keyed = new Map();
  const idless = [];
  for (const [index, action] of (Array.isArray(actions)
    ? actions
    : []
  ).entries()) {
    if (!action) continue;
    const id = action.id;
    if (id === null || id === undefined) {
      idless.push({ action, index });
      continue;
    }
    const key = String(id);
    const previous = keyed.get(key);
    keyed.set(key, {
      action: previous ? { ...previous.action, ...action } : action,
      index: previous?.index ?? index,
    });
  }
  return [...keyed.values(), ...idless]
    .sort((left, right) => {
      const leftOrdinal = Number(left.action?.ordinal);
      const rightOrdinal = Number(right.action?.ordinal);
      const leftOrder = Number.isFinite(leftOrdinal)
        ? leftOrdinal
        : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(rightOrdinal)
        ? rightOrdinal
        : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.index - right.index;
    })
    .map(({ action }) => action);
}

function applyActionsUpdated(payload) {
  const updates = payload.endCharacterActions;
  if (!Array.isArray(updates)) return;
  let current = normalizeActionList(runtime.state.currentActionsHridList);
  for (const update of updates) {
    if (!update) continue;
    const id = update.id;
    if (id === null || id === undefined) {
      if (update.isDone !== true) current.push(update);
      continue;
    }
    const key = String(id);
    const index = current.findIndex(
      (action) =>
        action?.id !== null &&
        action?.id !== undefined &&
        String(action.id) === key,
    );
    if (update.isDone === true) {
      if (index >= 0) current.splice(index, 1);
    } else if (index >= 0) {
      current[index] = { ...current[index], ...update };
    } else {
      current.push(update);
    }
  }
  runtime.state.currentActionsHridList = normalizeActionList(current);
}

function applyActionCompleted(payload) {
  const action = payload.endCharacterAction;
  if (!action || action.isDone === true) return;
  const currentAction = runtime.state.currentActionsHridList.find(
    ({ id }) => String(id) === String(action.id),
  );
  if (!currentAction) return;
  const currentCount = Number(
    action.currentCount ?? action.completedCount ?? action.progressCount,
  );
  if (Number.isFinite(currentCount)) {
    currentAction.currentCount = currentCount;
  }
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

function applyCharacterAbilitiesUpdated(payload) {
  const updates =
    payload.endCharacterAbilities ??
    payload.characterAbilities ??
    payload.abilities;
  if (!Array.isArray(updates)) return;
  const current = [...(runtime.state.initData_characterAbilities ?? [])];
  for (const update of updates) {
    const id = update.id ?? update.characterAbilityID ?? update.abilityHrid;
    const index = current.findIndex(
      (ability) =>
        (ability.id ?? ability.characterAbilityID ?? ability.abilityHrid) ===
        id,
    );
    if (update.isDeleted || update.deleted) {
      if (index >= 0) current.splice(index, 1);
    } else if (index >= 0) current[index] = { ...current[index], ...update };
    else current.push(update);
  }
  runtime.state.initData_characterAbilities = current;
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
      applyItemsUpdated(payload);
      applySkillsUpdated(payload);
      applyQuestsUpdated(payload);
      applyCharacterAbilitiesUpdated(payload);
      break;
    case "items_updated":
      applyItemsUpdated(payload);
      break;
    case "skills_updated":
      applySkillsUpdated(payload);
      break;
    case "quests_updated":
      applyQuestsUpdated(payload);
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
      applyGuildSnapshot(payload);
      break;
    case "house_rooms_updated":
      runtime.state.initData_characterHouseRoomMap =
        payload.characterHouseRoomMap ??
        runtime.state.initData_characterHouseRoomMap;
      applyActionTypeBuffs(payload);
      break;
    case "abilities_updated":
    case "character_abilities_updated":
      applyCharacterAbilitiesUpdated(payload);
      break;
    case "achievement_buffs_updated":
    case "moo_pass_buffs_updated":
    case "community_buffs_updated":
    case "consumable_buffs_updated":
    case "action_type_consumable_slots_updated":
    case "equipment_buffs_updated":
    case "personal_buffs_updated":
    case "guild_buffs_updated":
      applyActionTypeBuffs(payload);
      break;
    case "guild_characters_updated":
      applyGuildCharacters(payload);
      break;
    case "leaderboard_updated":
      applyLeaderboard(payload);
      break;
    case "labyrinth_updated":
      if (Object.hasOwn(payload, "labyrinth")) {
        runtime.state.labyrinthActive = Boolean(payload.labyrinth?.isActive);
      } else if (Object.hasOwn(payload, "isActive")) {
        runtime.state.labyrinthActive = Boolean(payload.isActive);
      }
      break;
  }
}

Object.assign(runtime.api, {
  applyGameMessage,
  applyGuildData,
  applyQuestsUpdated,
  applyGuildCharacters,
  applyLeaderboard,
  applyActionTypeBuffs,
  applySkillsUpdated,
});
