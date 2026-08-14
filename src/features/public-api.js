import { runtime } from "../core/runtime.js";

const PUBLIC_API_VERSION = 1;
const SCORE_SCHEMA_VERSION = 1;
const SCORES_UPDATED_EVENT = "mwitools:scores-updated";

const pageGlobal = globalThis.unsafeWindow ?? globalThis.window ?? globalThis;
let latestScores = null;

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cloneForConsumer(value) {
  if (value === null || value === undefined) return value ?? null;
  const serialized = JSON.stringify(value);
  return pageGlobal.JSON?.parse?.(serialized) ?? JSON.parse(serialized);
}

function createPublicScoreSnapshot(assetSnapshot) {
  const scores = assetSnapshot?.scores;
  if (!scores?.battle || !scores?.skilling) return null;

  return {
    schemaVersion: SCORE_SCHEMA_VERSION,
    unit: "million_coins",
    server: String(assetSnapshot.server ?? "production"),
    characterId: String(assetSnapshot.characterId ?? ""),
    calculatedAt: String(assetSnapshot.recordedAt ?? new Date().toISOString()),
    battle: {
      total: finiteOrNull(scores.battle.total),
      house: finiteOrNull(scores.battle.house),
      abilities: finiteOrNull(scores.battle.abilities),
      equipment: finiteOrNull(scores.battle.equipment),
    },
    skilling: {
      total: finiteOrNull(scores.skilling.total),
      house: finiteOrNull(scores.skilling.house),
      tools: finiteOrNull(scores.skilling.tools),
      equipment: finiteOrNull(scores.skilling.equipment),
      available: scores.skilling.available !== false,
    },
  };
}

function dispatchScoresUpdated() {
  if (!latestScores || typeof pageGlobal.dispatchEvent !== "function") return;
  const EventConstructor = pageGlobal.CustomEvent ?? globalThis.CustomEvent;
  if (typeof EventConstructor !== "function") return;
  pageGlobal.dispatchEvent(
    new EventConstructor(SCORES_UPDATED_EVENT, {
      detail: cloneForConsumer(latestScores),
    }),
  );
}

function publishScoreSnapshot(assetSnapshot) {
  const next = createPublicScoreSnapshot(assetSnapshot);
  if (!next) return null;
  latestScores = next;
  dispatchScoresUpdated();
  return cloneForConsumer(latestScores);
}

function getScores() {
  return cloneForConsumer(latestScores);
}

async function refreshScores() {
  const snapshot = await runtime.api.refreshAssetSnapshot?.();
  if (!snapshot) return null;
  if (
    !latestScores ||
    latestScores.calculatedAt !== String(snapshot.recordedAt ?? "")
  ) {
    publishScoreSnapshot(snapshot);
  }
  return getScores();
}

const publicApi = {
  name: "MWITools",
  apiVersion: PUBLIC_API_VERSION,
  events: Object.freeze({ scoresUpdated: SCORES_UPDATED_EVENT }),
  get scores() {
    return getScores();
  },
  getScores,
  refreshScores,
};

try {
  Object.defineProperty(pageGlobal, "MWIToolsAPI", {
    configurable: true,
    enumerable: true,
    value: publicApi,
  });
} catch {
  pageGlobal.MWIToolsAPI = publicApi;
}

runtime.api.onAssetSnapshot?.(publishScoreSnapshot);
const existingSnapshot = runtime.api.getLatestAssetSnapshot?.();
if (existingSnapshot) publishScoreSnapshot(existingSnapshot);

Object.assign(runtime.api, {
  createPublicScoreSnapshot,
  getPublishedScores: getScores,
  publishScoreSnapshot,
});
