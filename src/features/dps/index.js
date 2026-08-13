import { runtime } from "../../core/runtime.js";
import { MWI } from "./00-bootstrap.js";
import { SocketHook } from "./40-socket-parser.js";
import { createDpsApplication } from "./90-application.js";

MWI.enabled = false;

runtime.features.register({
  id: "dps",
  setting: "showDamage",
  initialize({ scope }) {
    let cleanupApplication = null;

    const activate = () => {
      if (cleanupApplication) return;
      cleanupApplication = createDpsApplication(scope);
      scope.add(
        runtime.onMessage("*", (payload) => {
          SocketHook.handleMessage(payload);
        }),
      );
    };

    if (document.readyState === "loading") {
      scope.event(document, "DOMContentLoaded", activate, { once: true });
    } else {
      activate();
    }

    return () => cleanupApplication?.();
  },
});

Object.assign(runtime.api, {
  dps: MWI,
});
