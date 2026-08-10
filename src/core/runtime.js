/**
 * Shared userscript context. Feature modules expose only the state and functions
 * that other modules need, while their implementation details stay private.
 */

function resolveCharacterId(payload) {
  return String(
    payload?.character?.id ??
      payload?.character?.characterID ??
      payload?.characterID ??
      payload?.characterSkills?.[0]?.characterID ??
      "",
  );
}

function createCleanupScope() {
  const callbacks = new Set();
  let cleaned = false;

  const add = (callback) => {
    if (typeof callback !== "function") return callback;
    if (cleaned) callback();
    else callbacks.add(callback);
    return callback;
  };

  return {
    add,
    event(target, type, listener, options) {
      target?.addEventListener?.(type, listener, options);
      add(() => target?.removeEventListener?.(type, listener, options));
      return listener;
    },
    observer(observer, target, options) {
      observer.observe(target, options);
      add(() => observer.disconnect());
      return observer;
    },
    interval(callback, delay) {
      const id = setInterval(callback, delay);
      add(() => clearInterval(id));
      return id;
    },
    timeout(callback, delay) {
      const id = setTimeout(() => {
        callbacks.delete(cancel);
        callback();
      }, delay);
      const cancel = () => clearTimeout(id);
      add(cancel);
      return id;
    },
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      for (const callback of [...callbacks].reverse()) {
        try {
          callback();
        } catch (error) {
          console.error("[MWITools] Feature cleanup failed", error);
        }
      }
      callbacks.clear();
    },
  };
}

const featureDefinitions = new Map();
const featureStates = new Map();
const featureStatusListeners = new Set();
let runtimeStarted = false;
let activeCharacterId = "";

function emitFeatureStatus(id) {
  const snapshot = runtime.features.getStatus(id);
  for (const listener of featureStatusListeners) {
    try {
      listener(id, snapshot);
    } catch (error) {
      console.error("[MWITools] Feature status listener failed", error);
    }
  }
}

function setFeatureStatus(id, status, error = null) {
  const previous = featureStates.get(id) ?? {};
  featureStates.set(id, { ...previous, status, error });
  emitFeatureStatus(id);
}

function isFeatureEnabled(definition) {
  if (!definition.setting) return definition.defaultEnabled !== false;
  const configured = runtime.settings.get?.(definition.setting);
  return configured ?? definition.defaultEnabled !== false;
}

async function initializeFeature(id) {
  const definition = featureDefinitions.get(id);
  if (!definition) return false;
  const current = featureStates.get(id);
  if (current?.status === "active" || current?.status === "initializing") {
    return true;
  }
  if (!isFeatureEnabled(definition)) {
    setFeatureStatus(id, "disabled");
    return false;
  }
  if (definition.scope === "character" && !activeCharacterId) {
    setFeatureStatus(id, "waiting");
    return false;
  }

  for (const dependencyId of definition.dependsOn ?? []) {
    const dependencyReady = await initializeFeature(dependencyId);
    if (!dependencyReady) {
      setFeatureStatus(id, "waiting");
      return false;
    }
  }

  setFeatureStatus(id, "initializing");
  const scope = createCleanupScope();
  featureStates.set(id, {
    ...featureStates.get(id),
    status: "initializing",
    scope,
    instanceCleanup: null,
  });

  try {
    const instanceCleanup = await definition.initialize?.({
      runtime,
      scope,
      characterId: activeCharacterId || null,
    });
    const state = featureStates.get(id) ?? {};
    featureStates.set(id, {
      ...state,
      status: "active",
      error: null,
      scope,
      instanceCleanup:
        typeof instanceCleanup === "function" ? instanceCleanup : null,
    });
    emitFeatureStatus(id);
    return true;
  } catch (error) {
    scope.cleanup();
    featureStates.set(id, {
      status: "failed",
      error,
      scope: null,
      instanceCleanup: null,
    });
    console.error(`[MWITools] Failed to initialize feature ${id}`, error);
    emitFeatureStatus(id);
    return false;
  }
}

async function disableFeature(id) {
  for (const [dependentId, dependent] of featureDefinitions) {
    if (dependent.dependsOn?.includes(id)) await disableFeature(dependentId);
  }
  const definition = featureDefinitions.get(id);
  const state = featureStates.get(id);
  if (state?.status === "active" || state?.status === "failed") {
    try {
      await state.instanceCleanup?.();
      await definition?.cleanup?.({ runtime, characterId: activeCharacterId });
    } catch (error) {
      console.error(`[MWITools] Failed to clean up feature ${id}`, error);
    }
    state.scope?.cleanup();
  }
  featureStates.set(id, {
    status: "disabled",
    error: null,
    scope: null,
    instanceCleanup: null,
  });
  emitFeatureStatus(id);
  return true;
}

export const runtime = {
  api: {},
  config: {},
  settings: {},
  data: {},
  state: {},
  starts: [],
  messageHandlers: new Map(),
  createCleanupScope,
  registerStart(name, start) {
    this.starts.push({ name, start });
  },
  start() {
    for (const feature of this.starts) {
      try {
        const result = feature.start();
        result?.catch?.((error) =>
          console.error(
            `[MWITools] Startup hook failed: ${feature.name}`,
            error,
          ),
        );
      } catch (error) {
        console.error(`[MWITools] Startup hook failed: ${feature.name}`, error);
      }
    }
    runtimeStarted = true;
    return this.features.initializeAll();
  },
  onMessage(type, handler) {
    const handlers = this.messageHandlers.get(type) ?? [];
    handlers.push(handler);
    this.messageHandlers.set(type, handlers);
    return () => {
      const current = this.messageHandlers.get(type) ?? [];
      this.messageHandlers.set(
        type,
        current.filter((candidate) => candidate !== handler),
      );
    };
  },
  dispatchMessage(payload, rawMessage) {
    const handlers = [
      ...(this.messageHandlers.get(payload.type) ?? []),
      ...(this.messageHandlers.get("*") ?? []),
    ];
    for (const handler of handlers) {
      try {
        handler(payload, rawMessage);
      } catch (error) {
        console.error(
          `[MWITools] Message handler failed for ${payload.type}`,
          error,
        );
      }
    }
  },
  features: {
    register(definition) {
      if (!definition?.id || typeof definition.initialize !== "function") {
        throw new TypeError("Feature definitions need an id and initialize()");
      }
      featureDefinitions.set(definition.id, {
        scope: "global",
        defaultEnabled: true,
        ...definition,
      });
      if (!featureStates.has(definition.id)) {
        featureStates.set(definition.id, {
          status: definition.scope === "character" ? "waiting" : "disabled",
          error: null,
        });
      }
      if (runtimeStarted) void initializeFeature(definition.id);
      return definition.id;
    },
    async initializeAll(scope = null) {
      for (const [id, definition] of featureDefinitions) {
        if (scope && definition.scope !== scope) continue;
        await initializeFeature(id);
      }
    },
    enable: initializeFeature,
    disable: disableFeature,
    async restart(id) {
      await disableFeature(id);
      return initializeFeature(id);
    },
    async syncSetting(settingId) {
      const touched = [];
      for (const [id, definition] of featureDefinitions) {
        if (definition.setting !== settingId) continue;
        touched.push(id);
        if (isFeatureEnabled(definition)) await initializeFeature(id);
        else await disableFeature(id);
      }
      for (const parentId of touched) {
        for (const [id, definition] of featureDefinitions) {
          if (!definition.dependsOn?.includes(parentId)) continue;
          if (isFeatureEnabled(definition)) await initializeFeature(id);
          else await disableFeature(id);
        }
      }
    },
    async handleCharacterData(payload) {
      const nextCharacterId = resolveCharacterId(payload);
      if (!nextCharacterId) return;
      if (activeCharacterId && activeCharacterId !== nextCharacterId) {
        for (const [id, definition] of featureDefinitions) {
          if (definition.scope === "character") await disableFeature(id);
        }
      }
      const changed = activeCharacterId !== nextCharacterId;
      activeCharacterId = nextCharacterId;
      if (changed) await this.initializeAll("character");
    },
    getStatus(id) {
      const state = featureStates.get(id) ?? {
        status: "unregistered",
        error: null,
      };
      return {
        id,
        status: state.status,
        error: state.error?.message ?? null,
      };
    },
    list() {
      return [...featureDefinitions.keys()].map((id) => this.getStatus(id));
    },
    onStatusChange(listener) {
      featureStatusListeners.add(listener);
      return () => featureStatusListeners.delete(listener);
    },
  },
};
