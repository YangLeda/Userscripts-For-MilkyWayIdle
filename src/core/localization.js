import { runtime } from "./runtime.js";

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

function detailFrom(map, hrid, explicitDetail) {
  if (explicitDetail) return explicitDetail;
  return map instanceof Map ? map.get(hrid) : map?.[hrid];
}

const ENTITY_SOURCES = {
  item: {
    zh: () => runtime.data.ZHItemNames,
    en: () => runtime.state.initData_itemDetailMap,
  },
  action: {
    zh: () => runtime.data.ZHActionNames,
    en: () => runtime.state.initData_actionDetailMap,
  },
  ability: {
    zh: () => runtime.data.ZHOthersDic,
    en: () => runtime.state.initData_abilityDetailMap,
  },
  monster: {
    zh: () => runtime.data.ZHOthersDic,
    en: () => null,
  },
};

/**
 * Resolve game entity names without letting a plug-in translation override the
 * official client dictionaries. Existing plug-in translations remain the
 * fallback for client entries that have not been localized yet.
 */
export function entityName(
  kind,
  hrid,
  { fallbackZh = "", fallbackEn = "", detail = null, fallback = "" } = {},
) {
  const source = ENTITY_SOURCES[kind];
  const officialZh = source?.zh?.()?.[hrid];
  const englishDetail = detailFrom(source?.en?.(), hrid, detail);
  const officialEn = String(englishDetail?.name ?? "").trim();
  const diagnostic = fallback || tailLabel(hrid) || "—";
  return runtime.config.isZH
    ? officialZh || fallbackZh || officialEn || fallbackEn || diagnostic
    : officialEn || fallbackEn || fallbackZh || officialZh || diagnostic;
}

export const itemName = (hrid, options) => entityName("item", hrid, options);
export const actionName = (hrid, options) =>
  entityName("action", hrid, options);
export const abilityName = (hrid, options) =>
  entityName("ability", hrid, options);
export const monsterName = (hrid, options) =>
  entityName("monster", hrid, options);
