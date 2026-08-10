import { runtime } from "./runtime.js";

const GAME_SOCKET_HOSTS = [
  "api.milkywayidle.com/ws",
  "api-test.milkywayidle.com/ws",
  "api.milkywayidlecn.com/ws",
  "api-test.milkywayidlecn.com/ws",
];

/** Installs the existing MessageEvent hook without changing the websocket payload. */
function hookWS() {
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
    Object.defineProperty(this, "data", { value: message });
    return handleMessage(message);
  };

  Object.defineProperty(MessageEvent.prototype, "data", dataProperty);
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
    void runtime.features.handleCharacterData(payload);
  }
  runtime.dispatchMessage(payload, message);
  return message;
}

Object.assign(runtime.api, { hookWS, handleMessage });
