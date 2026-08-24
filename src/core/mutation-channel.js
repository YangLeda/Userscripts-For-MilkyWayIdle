import { runtime } from "./runtime.js";

const channels = new Map();

export const TASK_SURFACE_MUTATION_OPTIONS = Object.freeze({
  childList: true,
  characterData: true,
  subtree: true,
});

const OPTION_KEYS = [
  "attributes",
  "attributeOldValue",
  "characterData",
  "characterDataOldValue",
  "childList",
  "subtree",
];

function optionSignature(options = {}) {
  const normalized = Object.fromEntries(
    OPTION_KEYS.map((key) => [key, Boolean(options[key])]),
  );
  normalized.attributeFilter = [...(options.attributeFilter ?? [])].sort();
  return JSON.stringify(normalized);
}

function observerConstructor(target) {
  return (
    globalThis.MutationObserver ??
    target?.ownerDocument?.defaultView?.MutationObserver ??
    globalThis.document?.defaultView?.MutationObserver
  );
}

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function reportSubscriberError(name, error) {
  console.error(
    `[MWITools] Mutation channel subscriber failed (${name})`,
    error,
  );
}

/**
 * Shares one physical MutationObserver between feature subscribers that have
 * deliberately chosen the same named channel, root, and observer options.
 */
export function subscribeMutationChannel(
  { name, target, options, scope },
  callback,
) {
  if (!name || !target || typeof callback !== "function") {
    throw new TypeError(
      "Mutation channel subscriptions need a name, target, and callback",
    );
  }
  const signature = optionSignature(options);
  let channel = channels.get(name);
  if (channel) {
    if (channel.target !== target || channel.signature !== signature) {
      throw new Error(
        t(
          `页面观察通道 ${name} 使用了不同的根节点或配置`,
          `Mutation channel ${name} was reused with a different target or options`,
        ),
      );
    }
  } else {
    const Observer = observerConstructor(target);
    if (typeof Observer !== "function") {
      throw new Error(
        t(
          `页面观察通道 ${name} 无法使用 MutationObserver`,
          `MutationObserver is unavailable for channel ${name}`,
        ),
      );
    }
    const subscribers = new Set();
    const observer = new Observer((records, source) => {
      for (const subscriber of [...subscribers]) {
        try {
          subscriber(records, source);
        } catch (error) {
          reportSubscriberError(name, error);
        }
      }
    });
    channel = { name, observer, signature, subscribers, target };
    observer.observe(target, options);
    channels.set(name, channel);
  }

  channel.subscribers.add(callback);
  let active = true;
  const unsubscribe = () => {
    if (!active) return;
    active = false;
    channel.subscribers.delete(callback);
    if (channel.subscribers.size) return;
    channel.observer.disconnect();
    if (channels.get(name) === channel) channels.delete(name);
  };
  scope?.add?.(unsubscribe);
  return unsubscribe;
}

export function subscribeTaskSurfaceMutations(
  { scope, target = globalThis.document?.body } = {},
  callback,
) {
  return subscribeMutationChannel(
    {
      name: "task-surface",
      target,
      options: TASK_SURFACE_MUTATION_OPTIONS,
      scope,
    },
    callback,
  );
}
