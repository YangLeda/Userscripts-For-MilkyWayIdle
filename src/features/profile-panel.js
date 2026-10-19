const pendingPanels = new WeakMap();
const PROFILE_PANEL_SELECTOR = "div.SharableProfile_overviewTab__W4dCV";
const MAX_WAIT_MS = 5000;
const POLL_MS = 100;

// Both profile enhancements share one bounded wait. Reusing the same Promise
// avoids retaining an ever-growing adoption chain after the dialog is closed.
export function waitForProfilePanel() {
  const documentRef = globalThis.document;
  if (!documentRef) return Promise.resolve(null);
  const panel = documentRef.querySelector(PROFILE_PANEL_SELECTOR);
  if (panel) return Promise.resolve(panel);
  if (pendingPanels.has(documentRef)) return pendingPanels.get(documentRef);
  const started = Date.now();
  let attempts = 0;
  const pending = new Promise((resolve) => {
    const poll = () => {
      const current = documentRef.querySelector(PROFILE_PANEL_SELECTOR);
      if (current) return resolve(current);
      if (
        Date.now() - started >= MAX_WAIT_MS ||
        ++attempts > MAX_WAIT_MS / POLL_MS
      )
        return resolve(null);
      setTimeout(poll, POLL_MS);
    };
    poll();
  }).finally(() => pendingPanels.delete(documentRef));
  pendingPanels.set(documentRef, pending);
  return pending;
}
