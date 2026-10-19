import { runtime } from "./runtime.js";

let hooked = false;
const queue = [];
let scheduled = false;
function drainMessages() {
  // Preserve frame order after the native listener returns. Microtasks keep
  // draining when background tabs throttle timers while sockets still deliver.
  const batch = queue.splice(0, 4);
  for (const message of batch) {
    try {
      handleMessage(message);
    } catch (error) {
      console.error("[MWITools] Game message processing failed", error);
    }
  }
  if (queue.length) globalThis.queueMicrotask(drainMessages);
  else scheduled = false;
}

const GAME_SOCKET_HOSTS = [
  "api.milkywayidle.com/ws",
  "api-test.milkywayidle.com/ws",
  "api.milkywayidlecn.com/ws",
  "api-test.milkywayidlecn.com/ws",
];

/** Installs the existing MessageEvent hook without changing the websocket payload. */
function hookWS() {
  if (hooked) return;

  const dataProperty = Object.getOwnPropertyDescriptor(
    MessageEvent.prototype,
    "data",
  );
  const originalGet = dataProperty.get;

  dataProperty.get = function hookedGet() {
    const socket = this.currentTarget;
    if (
      !socket ||
      (typeof socket.send !== "function" &&
        typeof socket.addEventListener !== "function") ||
      !GAME_SOCKET_HOSTS.some((host) => String(socket.url ?? "").includes(host))
    ) {
      return originalGet.call(this);
    }

    const message = originalGet.call(this);
    // The game's getter must always return its original payload, even when a
    // plugin handler fails. Plugin work runs after the native listener finishes.
    try {
      Object.defineProperty(this, "data", { value: message });
      queue.push(message);

      if (!scheduled) {
        scheduled = true;
        globalThis.queueMicrotask(drainMessages);
      }
    } catch (error) {
      console.error("[MWITools] Message hook failed", error);
    }
    return message;
  };

  Object.defineProperty(MessageEvent.prototype, "data", dataProperty);
  hooked = true;
}

/**
 * Updates canonical state first, then invokes feature effects in registration
 * order. Returning the original payload is required by the websocket hook.
 */
function handleMessage(message) {
  let payload;
  try {
    payload = JSON.parse(message);
  } catch {
    runtime.dispatchMessage({ type: "__non_json_message__" }, message);
    return message;
  }
  if (!payload?.type) return message;

  runtime.api.applyGameMessage(payload);
  if (payload.type === "init_character_data") {
    void runtime.features
      .handleCharacterData(payload)
      .catch((error) =>
        console.error("[MWITools] Character initialization failed", error),
      );
  }
  runtime.dispatchMessage(payload, message);
  return message;
}

Object.assign(runtime.api, { hookWS, handleMessage });
