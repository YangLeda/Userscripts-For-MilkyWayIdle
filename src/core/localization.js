import { runtime } from "./runtime.js";
import { getLocalizedEntityName } from "./game-localization.js";

export function localize(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function tailLabel(hrid) {
  return (
    String(hrid ?? "")
      .split("/")
      .at(-1)
      ?.replaceAll("_", " ") ?? ""
  );
}

/**
 * Resolve official game entity names while preserving feature-specific fallback
 * labels for data that the game does not publish.
 */
export function entityName(
  kind,
  hrid,
  { fallbackZh = "", fallbackEn = "", detail = null, fallback = "" } = {},
) {
  const official = getLocalizedEntityName(kind, hrid);
  const detailName = String(detail?.name ?? "").trim();
  const diagnostic = fallback || tailLabel(hrid) || "—";
  return (
    official ||
    (runtime.config.isZH ? fallbackZh : fallbackEn) ||
    detailName ||
    (runtime.config.isZH ? fallbackEn : fallbackZh) ||
    diagnostic
  );
}

export const itemName = (hrid, options) => entityName("item", hrid, options);
export const actionName = (hrid, options) =>
  entityName("action", hrid, options);
export const abilityName = (hrid, options) =>
  entityName("ability", hrid, options);
export const monsterName = (hrid, options) =>
  entityName("monster", hrid, options);
