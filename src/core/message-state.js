import { runtime } from "./runtime.js";

function applyClientData(payload) {
  runtime.state.initData_actionDetailMap = payload.actionDetailMap;
  runtime.state.initData_levelExperienceTable = payload.levelExperienceTable;
  runtime.state.initData_itemDetailMap = payload.itemDetailMap;
  runtime.state.initData_actionCategoryDetailMap =
    payload.actionCategoryDetailMap;
  runtime.state.initData_abilityDetailMap = payload.abilityDetailMap;

  for (const [key, value] of Object.entries(
    runtime.state.initData_itemDetailMap,
  )) {
    runtime.state.itemEnNameToHridMap[value.name] = key;
  }
}

function applyCharacterData(payload) {
  runtime.state.initData_characterSkills = payload.characterSkills;
  runtime.state.initData_characterItems = payload.characterItems;
  runtime.state.initData_characterHouseRoomMap = payload.characterHouseRoomMap;
  runtime.state.initData_actionTypeDrinkSlotsMap =
    payload.actionTypeDrinkSlotsMap;
  runtime.state.initData_characterAbilities = payload.characterAbilities;
  runtime.state.initData_myMarketListings = payload.myMarketListings;
  runtime.state.initData_combatAbilities = payload.combatUnit.combatAbilities;
  runtime.state.currentActionsHridList = [...payload.characterActions];
  for (const item of payload.characterItems) {
    if (item.itemLocationHrid !== "/item_locations/inventory") {
      runtime.state.currentEquipmentMap[item.itemLocationHrid] = item;
    }
  }
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
  }
}

Object.assign(runtime.api, { applyGameMessage });
