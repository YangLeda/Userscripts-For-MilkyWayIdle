import { runtime } from "../../core/runtime.js";

export const ASSET_COMPONENT_KEYS = [
  "equipment",
  "inventory",
  "marketListings",
  "houses",
  "abilities",
  "nonTradableTokens",
  "shrine",
];

const snapshotListeners = new Set();
let latestSnapshot = null;
let refreshPromise = null;
let refreshTimer = null;

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sumKnown(values) {
  return values.reduce(
    (total, value) => total + (Number.isFinite(value) ? value : 0),
    0,
  );
}

function isTerminalMarketListing(listing) {
  if (
    listing?.isDone ||
    listing?.isCancelled ||
    listing?.isCanceled ||
    listing?.isExpired
  ) {
    return true;
  }
  return /(cancel|complete|expire|closed|done)/i.test(
    String(listing?.status ?? ""),
  );
}

export function calculateMarketListingValues(listings) {
  const totals = { fair: 0, ask: 0, bid: 0 };
  for (const listing of listings ?? []) {
    const enhancementLevel = listing.enhancementLevel ?? 0;
    const assetValue = runtime.api.getAssetValue(
      listing.itemHrid,
      enhancementLevel,
    );
    const askPrice = runtime.api.getAskPrice(
      listing.itemHrid,
      enhancementLevel,
    );
    const bidPrice = runtime.api.getBidPrice(
      listing.itemHrid,
      enhancementLevel,
    );
    const availableCoins = Math.max(0, Number(listing.coinsAvailable ?? 0));
    const unclaimedCoins = Math.max(0, Number(listing.unclaimedCoinCount ?? 0));
    const explicitCoins = availableCoins + unclaimedCoins;
    totals.fair += explicitCoins;
    totals.ask += explicitCoins;
    totals.bid += explicitCoins;

    const unclaimedItems = Math.max(0, Number(listing.unclaimedItemCount ?? 0));
    totals.fair += unclaimedItems * assetValue;
    totals.ask += unclaimedItems * askPrice;
    totals.bid += unclaimedItems * bidPrice;

    if (!listing.isSell || isTerminalMarketListing(listing)) continue;
    const remainingQuantity = Math.max(
      0,
      Number(listing.orderQuantity ?? 0) - Number(listing.filledQuantity ?? 0),
    );
    const taxMultiplier = 1 - runtime.api.getMarketTaxRate(listing.itemHrid);
    totals.fair += remainingQuantity * assetValue * taxMultiplier;
    totals.ask += remainingQuantity * askPrice * taxMultiplier;
    totals.bid += remainingQuantity * bidPrice * taxMultiplier;
  }
  return totals;
}

export async function getAssetSnapshot() {
  if (!Array.isArray(runtime.state.initData_characterItems)) return null;
  if (!(await runtime.api.ensureMarketValueSource())) return null;

  let equipment = 0;
  let inventory = 0;
  let nonTradableTokens = 0;
  let equipmentAsk = 0;
  let equipmentBid = 0;
  let inventoryAsk = 0;
  let inventoryBid = 0;

  for (const item of runtime.state.initData_characterItems) {
    if (
      item.itemHrid === "/items/cowbell" &&
      !runtime.api.shouldIncludeCowbellsInAssets()
    ) {
      continue;
    }
    const count = Math.max(0, Number(item.count ?? 0));
    const enhancementLevel = item.enhancementLevel ?? 0;
    const fairValue = runtime.api.getAssetValue(
      item.itemHrid,
      enhancementLevel,
      { itemLocationHrid: item.itemLocationHrid },
    );
    const askPrice = runtime.api.getAskPrice(item.itemHrid, enhancementLevel);
    const bidPrice = runtime.api.getBidPrice(item.itemHrid, enhancementLevel);
    if (item.itemLocationHrid !== "/item_locations/inventory") {
      equipment += count * fairValue;
      equipmentAsk += count * askPrice;
      equipmentBid += count * bidPrice;
    } else if (runtime.api.isNonTradableTokenAsset(item.itemHrid)) {
      nonTradableTokens += count * fairValue;
    } else {
      inventory += count * fairValue;
      inventoryAsk += count * askPrice;
      inventoryBid += count * bidPrice;
    }
  }

  const listingValues = calculateMarketListingValues(
    runtime.state.initData_myMarketListings,
  );
  const scores = await runtime.api.getSelfBuildScores();
  const shrine = finiteOrNull(runtime.api.getGuildShrineValue());
  const values = {
    equipment,
    inventory,
    marketListings: listingValues.fair,
    houses: finiteOrNull(scores?.assets?.allHouses * 1_000_000),
    abilities: finiteOrNull(scores?.assets?.allAbilities * 1_000_000),
    nonTradableTokens,
    shrine,
  };
  values.liquid = sumKnown([
    values.equipment,
    values.inventory,
    values.marketListings,
  ]);
  values.fixed = sumKnown([
    values.houses,
    values.abilities,
    values.nonTradableTokens,
    values.shrine,
  ]);
  values.total = values.liquid + values.fixed;

  return {
    schema: 1,
    recordedAt: new Date().toISOString(),
    server: runtime.api.getMarketEnvironment?.() ?? "production",
    characterId: String(runtime.state.currentCharacterId ?? ""),
    complete: ASSET_COMPONENT_KEYS.every((key) => Number.isFinite(values[key])),
    values,
    liquidation: {
      ask: equipmentAsk + inventoryAsk + listingValues.ask,
      bid: equipmentBid + inventoryBid + listingValues.bid,
    },
    scores,
  };
}

export function getLatestAssetSnapshot() {
  return latestSnapshot;
}

export function onAssetSnapshot(listener) {
  snapshotListeners.add(listener);
  return () => snapshotListeners.delete(listener);
}

export async function refreshAssetSnapshot() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = getAssetSnapshot()
    .then((snapshot) => {
      if (!snapshot) return null;
      latestSnapshot = snapshot;
      for (const listener of snapshotListeners) {
        try {
          listener(snapshot);
        } catch (error) {
          console.error("[MWITools] Asset snapshot listener failed", error);
        }
      }
      return snapshot;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export function scheduleAssetSnapshotRefresh(delay = 120) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refreshAssetSnapshot(), delay);
}

Object.assign(runtime.api, {
  ASSET_COMPONENT_KEYS,
  calculateMarketListingValues,
  getAssetSnapshot,
  getLatestAssetSnapshot,
  onAssetSnapshot,
  refreshAssetSnapshot,
  scheduleAssetSnapshotRefresh,
});
