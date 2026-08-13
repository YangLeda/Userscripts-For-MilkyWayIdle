export const HEADER_TOOLS_ID = "mwitools-header-tools";

export function findHeaderTotalLevel(documentRef = document) {
  const direct = documentRef.querySelector(
    '[class*="Header_totalLevel"],[class*="totalLevel"]',
  );
  if (direct) return direct;
  return [
    ...documentRef.querySelectorAll(
      'header div,header span,[class*="Header"] div',
    ),
  ].find((node) => {
    const text = node.textContent?.trim() ?? "";
    return text.length < 80 && /^(总等级|Total Level)\s*[:：]/i.test(text);
  });
}

export function ensureHeaderToolsHost(documentRef = document) {
  const totalLevel = findHeaderTotalLevel(documentRef);
  if (!totalLevel?.parentElement) return null;
  let host = documentRef.getElementById(HEADER_TOOLS_ID);
  if (!host) {
    host = documentRef.createElement("div");
    host.id = HEADER_TOOLS_ID;
  }
  if (
    host.parentElement !== totalLevel.parentElement ||
    host.previousElementSibling !== totalLevel
  ) {
    totalLevel.insertAdjacentElement("afterend", host);
  }
  return host;
}

export function removeHeaderToolsHostIfEmpty(documentRef = document) {
  const host = documentRef.getElementById(HEADER_TOOLS_ID);
  if (host && !host.childElementCount) host.remove();
}
