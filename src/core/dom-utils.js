// Shared DOM/markup helpers used across feature modules. Kept dependency-free
// so any feature can import individual utilities without pulling in runtime.

// Escape a value for safe interpolation into an HTML string.
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Resolve the base URL of the game's items sprite sheet. Prefers a loaded
// resource entry (survives before any sprite is in the DOM) and falls back to
// an existing <use> reference on the page. Returns "" when nothing is found.
export function findItemsSpriteBase() {
  for (const entry of globalThis.performance?.getEntriesByType?.("resource") ??
    []) {
    if (entry.name?.includes("items_sprite") && entry.name.endsWith(".svg")) {
      try {
        return new URL(entry.name).pathname;
      } catch {
        return entry.name;
      }
    }
  }
  const use = document.querySelector(
    'svg use[href*="items_sprite"],svg use[xlink\\:href*="items_sprite"]',
  );
  const href = spriteUseHref(use);
  return href.includes("#") ? href.split("#")[0] : "";
}

// Read the sprite reference from an SVG <use> (or icon) element, preferring the
// modern `href` and falling back to the legacy `xlink:href`. Pass includeSrc to
// also accept an <img>-style `src`. Returns "" when the element is missing or
// carries none of them.
export function spriteUseHref(element, { includeSrc = false } = {}) {
  return (
    element?.getAttribute("href") ??
    element?.getAttribute("xlink:href") ??
    (includeSrc ? element?.getAttribute("src") : null) ??
    ""
  );
}

// Find the property key React attaches to a DOM node (`__reactFiber$...`, or
// the legacy `__reactInternalInstance$...`). Pass includeContainer to also
// match the `__reactContainer$...` key present on React root elements. The
// prefix match is intentionally loose (no trailing "$") so it covers every
// existing call site's behavior.
export function reactFiberKey(element, { includeContainer = false } = {}) {
  return Object.getOwnPropertyNames(element ?? {}).find(
    (key) =>
      key.startsWith("__reactFiber") ||
      key.startsWith("__reactInternalInstance") ||
      (includeContainer && key.startsWith("__reactContainer")),
  );
}

// Return the React fiber attached to a DOM node, or null when absent.
export function findReactFiber(element, options) {
  if (!element) return null;
  const key = reactFiberKey(element, options);
  return key ? element[key] : null;
}
