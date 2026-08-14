/**
 * Coalesce repeated work into one animation frame and make the queued callback
 * inert after feature cleanup. The timeout fallback keeps tests and older
 * userscript environments working without requestAnimationFrame.
 */
export function createFrameScheduler(callback) {
  let active = true;
  let pending = false;
  let cancelPending = null;

  const run = () => {
    pending = false;
    cancelPending = null;
    if (active) callback();
  };

  return {
    schedule() {
      if (!active || pending) return false;
      pending = true;
      if (typeof globalThis.requestAnimationFrame === "function") {
        const id = globalThis.requestAnimationFrame(run);
        cancelPending = () => globalThis.cancelAnimationFrame?.(id);
      } else {
        const id = globalThis.setTimeout(run, 0);
        cancelPending = () => globalThis.clearTimeout(id);
      }
      return true;
    },
    cancel() {
      if (!active) return;
      active = false;
      cancelPending?.();
      cancelPending = null;
      pending = false;
    },
  };
}
