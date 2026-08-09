import marketBackup from "../data/market-backup.json" with { type: "json" };
import { runtime } from "./runtime.js";

const MARKET_JSON_LOCAL_BACKUP = JSON.stringify(marketBackup);

let isUsingExpiredMarketJson = false;

let reasonForUsingExpiredMarketJson = "";

let initData_characterSkills = null;

let initData_characterItems = null;

let initData_combatAbilities = null;

let initData_characterHouseRoomMap = null;

let initData_actionTypeDrinkSlotsMap = null;

let initData_actionDetailMap = null;

let initData_levelExperienceTable = null;

let initData_itemDetailMap = null;

let initData_itemLocationDetailMap = null;

let initData_houseRoomDetailMap = null;

let initData_actionCategoryDetailMap = null;

let initData_abilityDetailMap = null;

let initData_shopItemDetailMap = null;

let initData_taskShopItemDetailMap = null;

let initData_labyrinthShopItemDetailMap = null;

let initData_openableLootDropMap = null;

let initData_guildBuffDetailMap = null;

let initData_characterAbilities = null;

let initData_myMarketListings = null;

let marketApiJson = null;

let marketValuesVersion = null;

let marketItemValues = {};

const marketOrderBooks = {};

const marketPriceBands = {};

let currentActionsHridList = [];

let currentEquipmentMap = {};

let guildBuffLevels = {};

let guildDataLoaded = false;

Object.defineProperties(runtime.data, {
  MARKET_JSON_LOCAL_BACKUP: {
    enumerable: true,
    get() {
      return MARKET_JSON_LOCAL_BACKUP;
    },
  },
});

Object.defineProperties(runtime.state, {
  isUsingExpiredMarketJson: {
    enumerable: true,
    get() {
      return isUsingExpiredMarketJson;
    },
    set(value) {
      isUsingExpiredMarketJson = value;
    },
  },
  reasonForUsingExpiredMarketJson: {
    enumerable: true,
    get() {
      return reasonForUsingExpiredMarketJson;
    },
    set(value) {
      reasonForUsingExpiredMarketJson = value;
    },
  },
  initData_characterSkills: {
    enumerable: true,
    get() {
      return initData_characterSkills;
    },
    set(value) {
      initData_characterSkills = value;
    },
  },
  initData_characterItems: {
    enumerable: true,
    get() {
      return initData_characterItems;
    },
    set(value) {
      initData_characterItems = value;
    },
  },
  initData_combatAbilities: {
    enumerable: true,
    get() {
      return initData_combatAbilities;
    },
    set(value) {
      initData_combatAbilities = value;
    },
  },
  initData_characterHouseRoomMap: {
    enumerable: true,
    get() {
      return initData_characterHouseRoomMap;
    },
    set(value) {
      initData_characterHouseRoomMap = value;
    },
  },
  initData_actionTypeDrinkSlotsMap: {
    enumerable: true,
    get() {
      return initData_actionTypeDrinkSlotsMap;
    },
    set(value) {
      initData_actionTypeDrinkSlotsMap = value;
    },
  },
  initData_actionDetailMap: {
    enumerable: true,
    get() {
      return initData_actionDetailMap;
    },
    set(value) {
      initData_actionDetailMap = value;
    },
  },
  initData_levelExperienceTable: {
    enumerable: true,
    get() {
      return initData_levelExperienceTable;
    },
    set(value) {
      initData_levelExperienceTable = value;
    },
  },
  initData_itemDetailMap: {
    enumerable: true,
    get() {
      return initData_itemDetailMap;
    },
    set(value) {
      initData_itemDetailMap = value;
    },
  },
  initData_itemLocationDetailMap: {
    enumerable: true,
    get() {
      return initData_itemLocationDetailMap;
    },
    set(value) {
      initData_itemLocationDetailMap = value;
    },
  },
  initData_houseRoomDetailMap: {
    enumerable: true,
    get() {
      return initData_houseRoomDetailMap;
    },
    set(value) {
      initData_houseRoomDetailMap = value;
    },
  },
  initData_actionCategoryDetailMap: {
    enumerable: true,
    get() {
      return initData_actionCategoryDetailMap;
    },
    set(value) {
      initData_actionCategoryDetailMap = value;
    },
  },
  initData_abilityDetailMap: {
    enumerable: true,
    get() {
      return initData_abilityDetailMap;
    },
    set(value) {
      initData_abilityDetailMap = value;
    },
  },
  initData_shopItemDetailMap: {
    enumerable: true,
    get() {
      return initData_shopItemDetailMap;
    },
    set(value) {
      initData_shopItemDetailMap = value;
    },
  },
  initData_taskShopItemDetailMap: {
    enumerable: true,
    get() {
      return initData_taskShopItemDetailMap;
    },
    set(value) {
      initData_taskShopItemDetailMap = value;
    },
  },
  initData_labyrinthShopItemDetailMap: {
    enumerable: true,
    get() {
      return initData_labyrinthShopItemDetailMap;
    },
    set(value) {
      initData_labyrinthShopItemDetailMap = value;
    },
  },
  initData_openableLootDropMap: {
    enumerable: true,
    get() {
      return initData_openableLootDropMap;
    },
    set(value) {
      initData_openableLootDropMap = value;
    },
  },
  initData_guildBuffDetailMap: {
    enumerable: true,
    get() {
      return initData_guildBuffDetailMap;
    },
    set(value) {
      initData_guildBuffDetailMap = value;
    },
  },
  initData_characterAbilities: {
    enumerable: true,
    get() {
      return initData_characterAbilities;
    },
    set(value) {
      initData_characterAbilities = value;
    },
  },
  initData_myMarketListings: {
    enumerable: true,
    get() {
      return initData_myMarketListings;
    },
    set(value) {
      initData_myMarketListings = value;
    },
  },
  marketApiJson: {
    enumerable: true,
    get() {
      return marketApiJson;
    },
    set(value) {
      marketApiJson = value;
    },
  },
  marketValuesVersion: {
    enumerable: true,
    get() {
      return marketValuesVersion;
    },
    set(value) {
      marketValuesVersion = value;
    },
  },
  marketItemValues: {
    enumerable: true,
    get() {
      return marketItemValues;
    },
    set(value) {
      marketItemValues = value ?? {};
    },
  },
  marketOrderBooks: {
    enumerable: true,
    get() {
      return marketOrderBooks;
    },
  },
  marketPriceBands: {
    enumerable: true,
    get() {
      return marketPriceBands;
    },
  },
  currentActionsHridList: {
    enumerable: true,
    get() {
      return currentActionsHridList;
    },
    set(value) {
      currentActionsHridList = value;
    },
  },
  currentEquipmentMap: {
    enumerable: true,
    get() {
      return currentEquipmentMap;
    },
    set(value) {
      currentEquipmentMap = value;
    },
  },
  guildBuffLevels: {
    enumerable: true,
    get() {
      return guildBuffLevels;
    },
    set(value) {
      guildBuffLevels = value ?? {};
    },
  },
  guildDataLoaded: {
    enumerable: true,
    get() {
      return guildDataLoaded;
    },
    set(value) {
      guildDataLoaded = Boolean(value);
    },
  },
});
