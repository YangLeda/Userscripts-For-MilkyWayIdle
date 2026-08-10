import { runtime } from "../core/runtime.js";

runtime.onMessage("init_client_data", (payload, message) => {
  console.log(payload);
  GM_setValue("init_client_data", message);
});

runtime.onMessage("init_character_data", (payload, message) => {
  console.log(payload);
  GM_setValue("init_character_data", message);
  const settings = runtime.settings.settingsMap;
  if (settings.networth.isTrue) runtime.api.calculateNetworth();
  if (settings.checkEquipment.isTrue) runtime.api.checkEquipment();
});

runtime.onMessage("actions_updated", () => {
  const settings = runtime.settings.settingsMap;
  if (settings.checkEquipment.isTrue) runtime.api.checkEquipment();
  if (settings.notifiEmptyAction.isTrue)
    setTimeout(runtime.api.notificate, 1000);
});

runtime.onMessage("battle_unit_fetched", (payload) => {
  if (runtime.settings.settingsMap.battlePanel.isTrue)
    runtime.api.handleBattleSummary(payload);
});

runtime.onMessage("items_updated", () => {
  if (runtime.settings.settingsMap.checkEquipment.isTrue)
    runtime.api.checkEquipment();
  if (runtime.settings.settingsMap.networth.isTrue)
    runtime.api.scheduleNetworthRefresh();
});

for (const messageType of [
  "market_item_values_updated",
  "market_item_order_books_updated",
  "market_listings_updated",
  "guild_updated",
]) {
  runtime.onMessage(messageType, () => {
    if (runtime.settings.settingsMap.networth.isTrue)
      runtime.api.scheduleNetworthRefresh();
  });
}

runtime.onMessage("profile_shared", (payload) => {
  let stored = GM_getValue("profile_export_list", null);
  if (stored) {
    const parsed = JSON.parse(stored);
    if (!parsed?.filter) {
      console.error(
        "Found invalid profileExportList in store. profileExportList cleared.",
      );
      GM_setValue("profile_export_list", JSON.stringify([]));
    }
  } else {
    GM_setValue("profile_export_list", JSON.stringify([]));
  }

  payload.characterID = payload.profile.characterSkills[0].characterID;
  payload.characterName = payload.profile.sharableCharacter.name;
  payload.timestamp = Date.now();

  stored = GM_getValue("profile_export_list", null) || JSON.stringify([]);
  const profiles = JSON.parse(stored).filter(
    (item) => item.characterID !== payload.characterID,
  );
  profiles.unshift(payload);
  if (profiles.length > 20) profiles.pop();
  GM_setValue("profile_export_list", JSON.stringify(profiles));

  runtime.api.addExportButton(payload);
  if (runtime.settings.settingsMap.profileBuildScore.isTrue)
    runtime.api.showBuildScoreOnProfile(payload);
});
