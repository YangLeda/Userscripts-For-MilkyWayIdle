import { runtime } from "./runtime.js";

const SPRITE_PATTERN =
  /((?:https?:\/\/[^/]+)?[^?#]*\/(abilities|actions|avatars|combat_monsters|items|misc|skills)_sprite(?:\.[^/#?]+)?\.svg(?:\?[^#]*)?)/i;
const SPRITE_SOURCE_PRIORITY = Object.freeze({
  dom: 1,
  resource: 2,
  manifest: 3,
});
const spriteBases = new Map();
let lastScanAt = Number.NEGATIVE_INFINITY;
let spriteManifestPromise = null;

function normalizeKind(kind) {
  const value = String(kind ?? "").toLowerCase();
  if (value === "ability") return "abilities";
  if (value === "action") return "actions";
  if (value === "avatar") return "avatars";
  if (value === "monster" || value === "monsters") return "combat_monsters";
  if (value === "item") return "items";
  if (value === "skill") return "skills";
  return value;
}

export function registerGameSpriteSource(rawValue, options = {}) {
  const value = String(rawValue ?? "").split("#")[0];
  const match = value.match(SPRITE_PATTERN);
  if (!match) return false;
  const kind = normalizeKind(match[2]);
  const source = String(options.source ?? "dom");
  const priority = SPRITE_SOURCE_PRIORITY[source] ?? SPRITE_SOURCE_PRIORITY.dom;
  const existing = spriteBases.get(kind);
  if (
    !existing ||
    priority > existing.priority ||
    (priority === existing.priority && options.replaceSamePriority === true)
  ) {
    spriteBases.set(kind, { base: match[1], priority });
  }
  return true;
}

export function scanGameSpriteSources({ force = false } = {}) {
  const now = globalThis.performance?.now?.() ?? Date.now();
  if (!force && now - lastScanAt < 2_000) return spriteBases.size;
  lastScanAt = now;
  try {
    for (const entry of globalThis.performance?.getEntriesByType?.(
      "resource",
    ) ?? []) {
      registerGameSpriteSource(entry?.name, {
        source: "resource",
        replaceSamePriority: true,
      });
    }
  } catch {
    // Resource timing is optional in hardened browsers and unit tests.
  }
  try {
    for (const node of globalThis.document?.querySelectorAll?.(
      "svg use,img[src],link[href]",
    ) ?? []) {
      registerGameSpriteSource(
        node.getAttribute?.("href") ??
          node.getAttribute?.("xlink:href") ??
          node.getAttribute?.("src") ??
          node.currentSrc ??
          node.src,
        { source: "dom" },
      );
    }
  } catch {
    // DOM discovery is best effort until the game surface has rendered.
  }
  return spriteBases.size;
}

export function loadGameSpriteManifest() {
  if (spriteManifestPromise) return spriteManifestPromise;
  spriteManifestPromise = (async () => {
    scanGameSpriteSources({ force: true });
    try {
      const origin =
        globalThis.location?.origin ??
        globalThis.document?.location?.origin ??
        "";
      if (!origin || typeof globalThis.fetch !== "function") {
        return spriteBases.size;
      }
      const response = await globalThis.fetch(
        new URL("/asset-manifest.json", origin).href,
      );
      if (!response.ok) return spriteBases.size;
      const manifest = await response.json();
      for (const value of Object.values(manifest?.files ?? {})) {
        registerGameSpriteSource(value, {
          source: "manifest",
          replaceSamePriority: true,
        });
      }
    } catch {
      // Already loaded DOM and performance entries remain usable as fallbacks.
    }
    return spriteBases.size;
  })();
  return spriteManifestPromise;
}

export function getGameSpriteBase(kind) {
  const normalizedKind = normalizeKind(kind);
  if (!spriteBases.has(normalizedKind)) scanGameSpriteSources();
  return spriteBases.get(normalizedKind)?.base ?? "";
}

export function getGameSpriteHref(kind, hrid) {
  const base = getGameSpriteBase(kind);
  const symbol = String(hrid ?? "")
    .split("/")
    .at(-1);
  return base && symbol ? `${base}#${symbol}` : "";
}

export function resetGameSpriteSources() {
  spriteBases.clear();
  lastScanAt = Number.NEGATIVE_INFINITY;
  spriteManifestPromise = null;
}

Object.assign(runtime.api, {
  getGameSpriteBase,
  getGameSpriteHref,
  registerGameSpriteSource,
  scanGameSpriteSources,
});
