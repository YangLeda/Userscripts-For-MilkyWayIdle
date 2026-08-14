import { runtime } from "./runtime.js";

const SPRITE_PATTERN =
  /((?:https?:\/\/[^/]+)?[^?#]*\/(abilities|actions|avatars|combat_monsters|items|misc|skills)_sprite(?:\.[^/#?]+)?\.svg(?:\?[^#]*)?)/i;
const spriteBases = new Map();
let lastScanAt = Number.NEGATIVE_INFINITY;

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

export function registerGameSpriteSource(rawValue) {
  const value = String(rawValue ?? "").split("#")[0];
  const match = value.match(SPRITE_PATTERN);
  if (!match) return false;
  spriteBases.set(normalizeKind(match[2]), match[1]);
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
      registerGameSpriteSource(entry?.name);
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
      );
    }
  } catch {
    // DOM discovery is best effort until the game surface has rendered.
  }
  return spriteBases.size;
}

export function getGameSpriteBase(kind) {
  scanGameSpriteSources();
  return spriteBases.get(normalizeKind(kind)) ?? "";
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
}

Object.assign(runtime.api, {
  getGameSpriteBase,
  getGameSpriteHref,
  registerGameSpriteSource,
  scanGameSpriteSources,
});
