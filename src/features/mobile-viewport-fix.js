import { runtime } from "../core/runtime.js";

const STYLE_ID = "mwitools-mobile-viewport-style";
const ACTIVE_ATTRIBUTE = "data-mwitools-mobile-viewport";
const HEIGHT_PROPERTY = "--mwitools-visual-viewport-height";

export function resolveVisualViewportHeight(
  windowRef = globalThis.window ?? globalThis,
  documentRef = globalThis.document,
) {
  const candidates = [
    windowRef?.visualViewport?.height,
    windowRef?.innerHeight,
    documentRef?.documentElement?.clientHeight,
  ];
  for (const candidate of candidates) {
    const height = Number(candidate);
    if (Number.isFinite(height) && height > 0) return height;
  }
  return 0;
}

export function syncMobileViewportHeight(
  windowRef = globalThis.window ?? globalThis,
  documentRef = globalThis.document,
) {
  const root = documentRef?.documentElement;
  const height = resolveVisualViewportHeight(windowRef, documentRef);
  if (!root || !height) return false;
  root.setAttribute(ACTIVE_ATTRIBUTE, "true");
  root.style.setProperty(
    HEIGHT_PROPERTY,
    `${Math.round(height * 100) / 100}px`,
  );
  return true;
}

function addStyles(documentRef = document) {
  if (documentRef.getElementById(STYLE_ID)) return;
  const style = documentRef.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @media (max-width:760px), (any-pointer:coarse) {
      html[${ACTIVE_ATTRIBUTE}="true"],
      html[${ACTIVE_ATTRIBUTE}="true"] body,
      html[${ACTIVE_ATTRIBUTE}="true"] #root {
        height:var(${HEIGHT_PROPERTY},100dvh)!important;
      }
      html[${ACTIVE_ATTRIBUTE}="true"] body {
        background-color:var(--color-background-game,#131419)!important;
      }
    }
  `;
  (documentRef.head ?? documentRef.documentElement).append(style);
}

function createViewportScheduler(windowRef, documentRef) {
  let frame = null;
  const run = () => {
    frame = null;
    syncMobileViewportHeight(windowRef, documentRef);
  };
  const schedule = () => {
    if (frame !== null) return;
    if (typeof windowRef.requestAnimationFrame === "function") {
      frame = windowRef.requestAnimationFrame(run);
    } else {
      frame = windowRef.setTimeout(run, 0);
    }
  };
  const cancel = () => {
    if (frame === null) return;
    if (typeof windowRef.cancelAnimationFrame === "function") {
      windowRef.cancelAnimationFrame(frame);
    } else {
      windowRef.clearTimeout(frame);
    }
    frame = null;
  };
  return { schedule, cancel };
}

runtime.features.register({
  id: "mobileViewportFix",
  scope: "global",
  initialize({ scope }) {
    addStyles();
    const scheduler = createViewportScheduler(window, document);
    const schedule = scheduler.schedule;
    syncMobileViewportHeight(window, document);
    scope.event(window, "resize", schedule, { passive: true });
    scope.event(window, "orientationchange", schedule, { passive: true });
    scope.event(window, "pageshow", schedule, { passive: true });
    scope.event(window.visualViewport, "resize", schedule, { passive: true });
    scope.event(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") schedule();
    });
    scope.add(() => {
      scheduler.cancel();
      const root = document.documentElement;
      root.removeAttribute(ACTIVE_ATTRIBUTE);
      root.style.removeProperty(HEIGHT_PROPERTY);
      document.getElementById(STYLE_ID)?.remove();
    });
  },
});
