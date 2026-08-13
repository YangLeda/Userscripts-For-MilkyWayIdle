import { runtime } from "../../core/runtime.js";
import { createFrameScheduler } from "../../core/frame-scheduler.js";
import { AnnouncementStore } from "./announcements.js";
import { FeedbackClient } from "./client.js";
import { OpinionCenterPanel } from "./panel.js";

let activeClient = null;

runtime.features.register({
  id: "feedback",
  setting: "feedback",
  scope: "character",
  initialize({ scope, characterId }) {
    const client = new FeedbackClient({
      characterId,
      characterName: runtime.state.currentCharacterName,
    });
    activeClient = client;
    const panel = new OpinionCenterPanel({
      client,
      scope,
      announcements: new AnnouncementStore(),
    });
    let disposed = false;
    let failures = 0;
    let timer = null;

    const schedule = (delay) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (disposed) return;
        const ok = await panel.refresh();
        failures = ok ? 0 : Math.min(failures + 1, 6);
        schedule(ok ? 60_000 : Math.min(15 * 60_000, 60_000 * 2 ** failures));
      }, delay);
    };
    const ensure = () => panel.ensureButton();
    ensure();
    const ensureScheduler = createFrameScheduler(ensure);
    const MutationObserverRef =
      globalThis.MutationObserver ?? document.defaultView?.MutationObserver;
    const observer = new MutationObserverRef((records) => {
      const relevant = records.some((record) =>
        [...record.addedNodes, ...record.removedNodes].some(
          (node) =>
            node?.nodeType === 1 &&
            !node.matches?.(
              "#mwitools-feedback-root,#mwitools-feedback-button",
            ) &&
            (node.matches?.(
              '[class*="Header_totalLevel"],[class*="totalLevel"]',
            ) ||
              node.querySelector?.(
                '[class*="Header_totalLevel"],[class*="totalLevel"]',
              )),
        ),
      );
      if (relevant) ensureScheduler.schedule();
    });
    scope.observer(observer, document.body, {
      childList: true,
      subtree: true,
    });
    schedule(1_500);
    scope.add(() => {
      ensureScheduler.cancel();
      disposed = true;
      clearTimeout(timer);
      if (activeClient === client) activeClient = null;
    });
  },
});

runtime.api.feedback = {
  submit: (...args) => activeClient?.submit(...args),
  list: (...args) => activeClient?.list(...args),
  detail: (...args) => activeClient?.detail(...args),
  edit: (...args) => activeClient?.edit(...args),
  reply: (...args) => activeClient?.reply(...args),
  markRead: (...args) => activeClient?.markRead(...args),
  quota: (...args) => activeClient?.quota(...args),
};

export { FeedbackClient } from "./client.js";
export { AnnouncementStore } from "./announcements.js";
export { FeedbackPanel, OpinionCenterPanel } from "./panel.js";
