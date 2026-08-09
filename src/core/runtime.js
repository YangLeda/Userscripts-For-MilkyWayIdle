/**
 * Shared userscript context. Feature modules expose only the state and functions
 * that other modules need, while their implementation details stay private.
 */
export const runtime = {
  api: {},
  config: {},
  settings: {},
  data: {},
  state: {},
  starts: [],
  messageHandlers: new Map(),
  registerStart(name, start) {
    this.starts.push({ name, start });
  },
  start() {
    for (const feature of this.starts) feature.start();
  },
  onMessage(type, handler) {
    const handlers = this.messageHandlers.get(type) ?? [];
    handlers.push(handler);
    this.messageHandlers.set(type, handlers);
  },
  dispatchMessage(payload, rawMessage) {
    for (const handler of this.messageHandlers.get(payload.type) ?? []) {
      handler(payload, rawMessage);
    }
  },
};
