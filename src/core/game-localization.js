import { runtime } from "./runtime.js";

export const SUPPORTED_GAME_LOCALES = Object.freeze([
  "en",
  "es",
  "fr",
  "pt",
  "zh",
  "zh-TW",
  "ja",
  "ko",
  "ru",
]);

const LOCALE_SET = new Set(SUPPORTED_GAME_LOCALES);
const LOCALE_CACHE_SCHEMA = 1;
const LOCALE_CACHE_PREFIX = "MWITools_game_locale_v1";
const ENTITY_TYPES = Object.freeze({
  item: {
    resourceKey: "itemNames",
    clientDataKey: "itemDetailMap",
    stateKey: "initData_itemDetailMap",
    prefix: "/items/",
    sprite: "items_sprite",
  },
  action: {
    resourceKey: "actionNames",
    clientDataKey: "actionDetailMap",
    stateKey: "initData_actionDetailMap",
    prefix: "/actions/",
    sprite: "actions_sprite",
  },
  monster: {
    resourceKey: "monsterNames",
    clientDataKey: "combatMonsterDetailMap",
    stateKey: "initData_combatMonsterDetailMap",
    prefix: "/monsters/",
    sprite: "combat_monsters_sprite",
  },
  ability: {
    resourceKey: "abilityNames",
    clientDataKey: "abilityDetailMap",
    stateKey: "initData_abilityDetailMap",
    prefix: "/abilities/",
    sprite: "abilities_sprite",
  },
  skill: {
    resourceKey: "skillNames",
    clientDataKey: "skillDetailMap",
    stateKey: "initData_skillDetailMap",
    prefix: "/skills/",
    sprite: "skills_sprite",
  },
  houseRoom: {
    resourceKey: "houseRoomNames",
    clientDataKey: "houseRoomDetailMap",
    stateKey: "initData_houseRoomDetailMap",
    prefix: "/house_rooms/",
  },
  buffType: {
    resourceKey: "buffTypeNames",
    clientDataKey: "buffTypeDetailMap",
    stateKey: "initData_buffTypeDetailMap",
    prefix: "/buff_types/",
  },
  itemCategory: {
    resourceKey: "itemCategoryNames",
    clientDataKey: "itemCategoryDetailMap",
    stateKey: "initData_itemCategoryDetailMap",
    prefix: "/item_categories/",
  },
  actionCategory: {
    resourceKey: "actionCategoryNames",
    clientDataKey: "actionCategoryDetailMap",
    stateKey: "initData_actionCategoryDetailMap",
    prefix: "/action_categories/",
  },
  shopCategory: {
    resourceKey: "shopCategoryNames",
    clientDataKey: "shopCategoryDetailMap",
    stateKey: "initData_shopCategoryDetailMap",
    prefix: "/shop_categories/",
  },
  achievement: {
    resourceKey: "achievementNames",
    clientDataKey: "achievementDetailMap",
    stateKey: "initData_achievementDetailMap",
    prefix: "/achievements/",
  },
});
const TYPE_ALIASES = Object.freeze({
  items: "item",
  actions: "action",
  monsters: "monster",
  abilities: "ability",
  skills: "skill",
  houseRooms: "houseRoom",
  buffTypes: "buffType",
  itemCategories: "itemCategory",
  actionCategories: "actionCategory",
  shopCategories: "shopCategory",
  achievements: "achievement",
});
const localeResources = new Map();
const reverseIndexes = new WeakMap();
const warnedLocales = new Set();

function localizedText(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function pageGlobal() {
  return globalThis.unsafeWindow ?? globalThis.window ?? globalThis;
}

export function normalizeGameLocale(value) {
  const raw = String(value ?? "")
    .trim()
    .replaceAll("_", "-");
  if (!raw) return "en";
  const lower = raw.toLowerCase();
  if (
    lower === "zh-tw" ||
    lower === "zh-hant" ||
    lower.startsWith("zh-hant-") ||
    lower === "zh-hk" ||
    lower === "zh-mo"
  ) {
    return "zh-TW";
  }
  if (lower === "zh" || lower.startsWith("zh-")) return "zh";
  const base = lower.split("-")[0];
  return LOCALE_SET.has(base) ? base : "en";
}

export function getGameLocale() {
  return normalizeGameLocale(
    runtime.config.gameLanguage ??
      globalThis.localStorage?.getItem?.("i18nextLng") ??
      globalThis.document?.documentElement?.lang ??
      globalThis.navigator?.language,
  );
}

function webpackQueues(target = pageGlobal()) {
  const queues = [];
  for (const key of Object.getOwnPropertyNames(target ?? {})) {
    if (!/^webpack(?:Jsonp|Chunk)/i.test(key)) continue;
    try {
      if (Array.isArray(target[key])) queues.push(target[key]);
    } catch {
      // Cross-realm properties may throw while the page is navigating.
    }
  }
  return queues;
}

function chunkEntries(target) {
  return webpackQueues(target).flatMap((queue) =>
    queue.filter((entry) => entry?.[1] && typeof entry[1] === "object"),
  );
}

function localeModuleMap(entries) {
  const result = new Map();
  const pattern =
    /["']\.\/([^"'\\]+)\/index\.js["']\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/g;
  for (const entry of entries) {
    for (const factory of Object.values(entry[1])) {
      if (typeof factory !== "function") continue;
      const source = Function.prototype.toString.call(factory);
      if (!source.includes("./zh-TW/index.js")) continue;
      for (const match of source.matchAll(pattern)) {
        result.set(normalizeGameLocale(match[1]), String(match[2]));
      }
    }
  }
  return result;
}

function runLocaleFactory(factory) {
  const module = { exports: {} };
  const exports = module.exports;
  const webpackRequire = () => {
    throw new Error();
  };
  webpackRequire.r = (target) => {
    Object.defineProperty(target, "__esModule", { value: true });
  };
  webpackRequire.d = (target, nameOrDefinition, getter) => {
    const definition =
      typeof nameOrDefinition === "object"
        ? nameOrDefinition
        : { [nameOrDefinition]: getter };
    for (const [name, get] of Object.entries(definition)) {
      if (typeof get !== "function" || Object.hasOwn(target, name)) continue;
      Object.defineProperty(target, name, { enumerable: true, get });
    }
  };
  factory.call(exports, module, exports, webpackRequire);
  return module.exports?.default ?? exports.default ?? module.exports;
}

function validResourceMap(value, prefix) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).some((key) => key.startsWith(prefix));
}

export function validateGameLocaleResources(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    validResourceMap(value.itemNames, "/items/") &&
    validResourceMap(value.actionNames, "/actions/") &&
    validResourceMap(value.monsterNames, "/monsters/") &&
    validResourceMap(value.abilityNames, "/abilities/"),
  );
}

export function extractGameLocaleResources(
  locale = getGameLocale(),
  target = pageGlobal(),
) {
  const normalizedLocale = normalizeGameLocale(locale);
  const entries = chunkEntries(target);
  const expectedModuleId = localeModuleMap(entries).get(normalizedLocale);
  if (!expectedModuleId) return null;
  const candidates = [];
  for (const entry of entries) {
    for (const [moduleId, factory] of Object.entries(entry[1])) {
      if (typeof factory !== "function") continue;
      if (moduleId !== expectedModuleId) continue;
      candidates.push(factory);
    }
  }
  for (const factory of candidates) {
    try {
      const resources = runLocaleFactory(factory);
      if (validateGameLocaleResources(resources)) return resources;
    } catch {
      // Future locale chunks may import shared modules; React remains primary.
    }
  }
  return null;
}

function i18nFromFiber(element) {
  const fiberKey = Reflect.ownKeys(element ?? {}).find((key) =>
    String(key).startsWith("__reactFiber$"),
  );
  for (
    let fiber = fiberKey ? element[fiberKey] : null, depth = 0;
    fiber && depth < 80;
    fiber = fiber.return, depth += 1
  ) {
    for (const candidate of [
      fiber.memoizedProps?.i18n,
      fiber.pendingProps?.i18n,
      fiber.stateNode?.props?.i18n,
      fiber.stateNode?.i18n,
    ]) {
      if (candidate?.options?.resources) return candidate;
    }
  }
  return null;
}

function translationForLocale(i18n, locale) {
  const normalized = normalizeGameLocale(locale);
  const match = Object.entries(i18n?.options?.resources ?? {}).find(
    ([key]) => normalizeGameLocale(key) === normalized,
  );
  return match?.[1]?.translation ?? null;
}

export function extractReactGameLocaleResources(
  locale = getGameLocale(),
  documentTarget = globalThis.document,
) {
  if (!documentTarget?.querySelector) return null;
  const candidates = new Set([
    documentTarget.querySelector("#root"),
    documentTarget.querySelector('[class^="GamePage"]'),
    documentTarget.body,
  ]);
  if (![...candidates].some((element) => i18nFromFiber(element))) {
    let inspected = 0;
    for (const element of documentTarget.querySelectorAll("*")) {
      if (inspected >= 300) break;
      if (
        Reflect.ownKeys(element).some((key) =>
          String(key).startsWith("__reactFiber$"),
        )
      ) {
        candidates.add(element);
        inspected += 1;
      }
    }
  }
  for (const element of candidates) {
    const resources = translationForLocale(i18nFromFiber(element), locale);
    if (validateGameLocaleResources(resources)) return resources;
  }
  return null;
}

function clientData() {
  return runtime.state.clientData ?? runtime.api.getGameClientData?.() ?? null;
}

function englishResourceMap(type) {
  const definition = ENTITY_TYPES[type];
  const details =
    clientData()?.[definition.clientDataKey] ??
    runtime.state[definition.stateKey] ??
    (type === "monster" ? runtime.state.initData_monsterDetailMap : null);
  const result = Object.fromEntries(
    Object.entries(details ?? {})
      .map(([hrid, detail]) => [hrid, String(detail?.name ?? "").trim()])
      .filter(([, name]) => name),
  );
  if (type === "item") {
    for (const [name, hrid] of Object.entries(
      runtime.state.itemEnNameToHridMap ?? {},
    )) {
      if (!result[hrid] && name) result[hrid] = name;
    }
  }
  return result;
}

function englishResources() {
  return Object.fromEntries(
    Object.entries(ENTITY_TYPES).map(([type, definition]) => [
      definition.resourceKey,
      englishResourceMap(type),
    ]),
  );
}

function gameVersionKey() {
  const data = clientData();
  return String(data?.versionTimestamp ?? data?.gameVersion ?? "").trim();
}

function localeCacheKey(locale) {
  const version = gameVersionKey();
  return version
    ? `${LOCALE_CACHE_PREFIX}:${encodeURIComponent(version)}:${normalizeGameLocale(locale)}`
    : "";
}

function readCachedResources(locale) {
  const key = localeCacheKey(locale);
  if (!key) return null;
  try {
    const cached = JSON.parse(
      globalThis.localStorage?.getItem?.(key) || "null",
    );
    return cached?.schemaVersion === LOCALE_CACHE_SCHEMA &&
      validateGameLocaleResources(cached.resources)
      ? cached.resources
      : null;
  } catch {
    return null;
  }
}

function writeCachedResources(locale, resources) {
  const key = localeCacheKey(locale);
  if (!key || !validateGameLocaleResources(resources)) return;
  try {
    globalThis.localStorage?.setItem?.(
      key,
      JSON.stringify({ schemaVersion: LOCALE_CACHE_SCHEMA, resources }),
    );
  } catch {
    // Locale caching is optional; memory resources stay available.
  }
}

export function getGameLocaleResources(locale = getGameLocale()) {
  const normalizedLocale = normalizeGameLocale(locale);
  if (localeResources.has(normalizedLocale)) {
    return localeResources.get(normalizedLocale);
  }
  const official =
    extractReactGameLocaleResources(normalizedLocale) ??
    extractGameLocaleResources(normalizedLocale) ??
    readCachedResources(normalizedLocale);
  if (official) {
    localeResources.set(normalizedLocale, official);
    writeCachedResources(normalizedLocale, official);
    return official;
  }
  if (normalizedLocale === "en") return englishResources();
  if (!warnedLocales.has(normalizedLocale)) {
    warnedLocales.add(normalizedLocale);
    console.warn(
      localizedText(
        `[MWITools] 官方 ${normalizedLocale} 语言资源尚未就绪，将暂时使用英文名称。`,
        `[MWITools] Official ${normalizedLocale} resources are not ready; English names will be used temporarily.`,
      ),
    );
  }
  return null;
}

export function registerGameLocaleResources(locale, resources) {
  const normalizedLocale = normalizeGameLocale(locale);
  if (!validateGameLocaleResources(resources)) return false;
  localeResources.set(normalizedLocale, resources);
  writeCachedResources(normalizedLocale, resources);
  return true;
}

export function refreshGameLocaleResources(locale = getGameLocale()) {
  const normalizedLocale = normalizeGameLocale(locale);
  localeResources.delete(normalizedLocale);
  warnedLocales.delete(normalizedLocale);
  return getGameLocaleResources(normalizedLocale);
}

function entityType(kind) {
  const normalized = TYPE_ALIASES[kind] ?? kind;
  return ENTITY_TYPES[normalized] ? normalized : null;
}

function normalizedName(value, type = "") {
  let result = String(value ?? "")
    .normalize("NFKC")
    .replaceAll(/\s+/g, " ")
    .trim();
  if (type === "item") result = result.replace(/\s+\+\d+\s*$/, "").trim();
  return result;
}

function reverseIndex(resources, type) {
  let indexes = reverseIndexes.get(resources);
  if (!indexes) {
    indexes = new Map();
    reverseIndexes.set(resources, indexes);
  }
  if (indexes.has(type)) return indexes.get(type);
  const definition = ENTITY_TYPES[type];
  const index = new Map();
  for (const [hrid, name] of Object.entries(
    resources?.[definition.resourceKey] ?? {},
  )) {
    const key = normalizedName(name, type);
    if (!key) continue;
    if (index.has(key) && index.get(key) !== hrid) index.set(key, null);
    else index.set(key, hrid);
  }
  indexes.set(type, index);
  return index;
}

function directHrid(type, value) {
  const candidate = String(value ?? "").trim();
  return candidate.startsWith(ENTITY_TYPES[type].prefix) ? candidate : "";
}

export function resolveLocalizedEntity(
  kind,
  name,
  { locale = getGameLocale() } = {},
) {
  const type = entityType(kind);
  if (!type) return "";
  const direct = directHrid(type, name);
  if (direct) return direct;
  const key = normalizedName(name, type);
  if (!key) return "";
  for (const resources of [
    getGameLocaleResources(locale),
    englishResources(),
  ]) {
    if (!resources) continue;
    const match = reverseIndex(resources, type).get(key);
    if (match) return match;
  }
  if (type === "item") {
    for (const [englishName, hrid] of Object.entries(
      runtime.state.itemEnNameToHridMap ?? {},
    )) {
      if (normalizedName(englishName, type) === key) return hrid;
    }
  }
  return "";
}

export function getLocalizedEntityName(
  kind,
  hrid,
  { locale = getGameLocale(), fallback = "" } = {},
) {
  const type = entityType(kind);
  if (!type) return fallback;
  const definition = ENTITY_TYPES[type];
  return (
    getGameLocaleResources(locale)?.[definition.resourceKey]?.[hrid] ??
    englishResources()[definition.resourceKey]?.[hrid] ??
    fallback
  );
}

function elementCandidates(element) {
  const result = [];
  for (let current = element; current && result.length < 24;) {
    result.push(current);
    current = current.parentElement;
  }
  for (const child of element?.querySelectorAll?.("[data-hrid],svg,use") ??
    []) {
    if (!result.includes(child)) result.push(child);
  }
  return result;
}

function datasetHrid(type, element) {
  const names = [
    `${type}Hrid`,
    "hrid",
    "itemHrid",
    "actionHrid",
    "monsterHrid",
    "abilityHrid",
    "skillHrid",
  ];
  for (const name of names) {
    const value = element?.dataset?.[name];
    const direct = directHrid(type, value);
    if (direct) return direct;
  }
  return "";
}

function spriteHrid(type, element) {
  const definition = ENTITY_TYPES[type];
  if (!definition.sprite) return "";
  const href = String(
    element?.getAttribute?.("href") ??
      element?.getAttribute?.("xlink:href") ??
      element?.querySelector?.("use")?.getAttribute?.("href") ??
      "",
  );
  const [base, fragment = ""] = href.split("#");
  return fragment && base.includes(definition.sprite)
    ? `${definition.prefix}${fragment}`
    : "";
}

export function resolveEntityFromElement(
  kind,
  element,
  { locale = getGameLocale() } = {},
) {
  const type = entityType(kind);
  if (!type || !element) return "";
  const candidates = elementCandidates(element);
  for (const candidate of candidates) {
    const hrid = datasetHrid(type, candidate) || spriteHrid(type, candidate);
    if (hrid) return hrid;
  }
  for (const candidate of candidates) {
    for (const value of [
      candidate?.getAttribute?.("aria-label"),
      candidate?.getAttribute?.("title"),
      candidate?.textContent,
    ]) {
      const hrid = resolveLocalizedEntity(type, value, { locale });
      if (hrid) return hrid;
    }
  }
  return "";
}

export function getGameTranslation(path, { locale = getGameLocale() } = {}) {
  let value = getGameLocaleResources(locale);
  for (const key of String(path ?? "")
    .replace(/^translation\./, "")
    .split(".")) {
    if (!key || !value || typeof value !== "object") return "";
    value = value[key];
  }
  return typeof value === "string" ? value : "";
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesGameTranslation(
  path,
  text,
  { locale = getGameLocale() } = {},
) {
  const template = getGameTranslation(path, { locale });
  if (!template) return false;
  const parts = template.split(/(<[^>]+\/>|{{[^}]+}}|\$t\([^)]*\))/g);
  const pattern = parts
    .map((part, index) =>
      index % 2 ? ".*?" : escapeRegularExpression(part).replace(/\s+/g, "\\s+"),
    )
    .join("");
  return new RegExp(`^${pattern}$`, "iu").test(String(text ?? "").trim());
}

export function matchesGameTranslations(
  paths,
  text,
  { locale = getGameLocale(), fallbackPatterns = [] } = {},
) {
  const value = String(text ?? "").trim();
  if (
    [...(Array.isArray(paths) ? paths : [paths])].some((path) =>
      matchesGameTranslation(path, value, { locale }),
    )
  ) {
    return true;
  }
  return fallbackPatterns.some((pattern) =>
    pattern instanceof RegExp
      ? pattern.test(value)
      : String(pattern ?? "")
          .trim()
          .toLocaleLowerCase() === value.toLocaleLowerCase(),
  );
}

export function resetGameLocalizationCache() {
  localeResources.clear();
  warnedLocales.clear();
}

Object.assign(runtime.api, {
  getGameLocale,
  getGameLocaleResources,
  registerGameLocaleResources,
  refreshGameLocaleResources,
  resetGameLocalizationCache,
  getGameTranslation,
  matchesGameTranslation,
  resolveLocalizedEntity,
  resolveEntityFromElement,
  getLocalizedEntityName,
});
