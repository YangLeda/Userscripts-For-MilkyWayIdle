import { runtime } from "../../core/runtime.js";
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
    scope.interval(ensure, 750);
    schedule(1_500);
    scope.add(() => {
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
