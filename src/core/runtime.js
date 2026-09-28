/**
 * Shared userscript context. Feature modules expose only the state and functions
 * that other modules need, while their implementation details stay private.
 */

const routeCharacterRequested = /[?&]characterId=/.test(
  globalThis.location?.search ?? "",
);

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
          console.error(
            runtime.config.isZH
              ? "[MWITools] 功能清理失败"
              : "[MWITools] Feature cleanup failed",
            error,
          );
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
let featureInitializationPaused = false;
let activeCharacterId = "";

function emitFeatureStatus(id) {
  const snapshot = runtime.features.getStatus(id);
  for (const listener of featureStatusListeners) {
    try {
      listener(id, snapshot);
    } catch (error) {
      console.error(
        runtime.config.isZH
          ? "[MWITools] 功能状态监听器执行失败"
          : "[MWITools] Feature status listener failed",
        error,
      );
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
    setFeatureStatus(
      id,
      "waiting",
      new Error(
        runtime.config.isZH
          ? runtime.state.currentCharacterId || routeCharacterRequested
            ? "角色数据尚未收到：请等待连接完成；若页面已断线，请重连后重试。"
            : "尚未进入角色：请选择角色并等待角色数据到达。"
          : runtime.state.currentCharacterId || routeCharacterRequested
            ? "Character data has not arrived: wait for connection, or reconnect and retry if disconnected."
            : "No character selected: select a character and wait for its data.",
      ),
    );
    return false;
  }

  for (const dependencyId of definition.dependsOn ?? []) {
    const dependencyReady = await initializeFeature(dependencyId);
    if (!dependencyReady) {
      setFeatureStatus(
        id,
        "waiting",
        new Error(
          runtime.config.isZH
            ? `依赖 ${dependencyId} 未就绪（${featureStates.get(dependencyId)?.status ?? "missing"}）：请启用或重试该功能。`
            : `Dependency ${dependencyId} is not ready (${featureStates.get(dependencyId)?.status ?? "missing"}); enable or retry it.`,
        ),
      );
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
    if (state.scope !== scope || !isFeatureEnabled(definition)) {
      scope.cleanup();
      if (typeof instanceCleanup === "function") await instanceCleanup();
      return false;
    }
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
    console.error(
      runtime.config.isZH
        ? `[MWITools] 功能 ${id} 启动失败`
        : `[MWITools] Failed to initialize feature ${id}`,
      error,
    );
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
  if (["active", "failed", "initializing"].includes(state?.status)) {
    try {
      await state.instanceCleanup?.();
      await definition?.cleanup?.({ runtime, characterId: activeCharacterId });
    } catch (error) {
      console.error(
        runtime.config.isZH
          ? `[MWITools] 功能 ${id} 清理失败`
          : `[MWITools] Failed to clean up feature ${id}`,
        error,
      );
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
    featureInitializationPaused = false;
    for (const feature of this.starts) {
      try {
        const result = feature.start();
        result?.catch?.((error) =>
          console.error(
            runtime.config.isZH
              ? `[MWITools] 启动钩子执行失败：${feature.name}`
              : `[MWITools] Startup hook failed: ${feature.name}`,
            error,
          ),
        );
      } catch (error) {
        console.error(
          runtime.config.isZH
            ? `[MWITools] 启动钩子执行失败：${feature.name}`
            : `[MWITools] Startup hook failed: ${feature.name}`,
          error,
        );
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
          runtime.config.isZH
            ? `[MWITools] 消息 ${payload.type} 的处理器执行失败`
            : `[MWITools] Message handler failed for ${payload.type}`,
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
      if (runtimeStarted && !featureInitializationPaused) {
        void initializeFeature(definition.id);
      }
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
      return this.syncSettings([settingId]);
    },
    async syncSettings(settingIds) {
      const changed = new Set(settingIds ?? []);
      const affected = new Set();
      for (const [id, definition] of featureDefinitions) {
        if (changed.has(definition.setting)) affected.add(id);
      }
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const [id, definition] of featureDefinitions) {
          if (
            !affected.has(id) &&
            definition.dependsOn?.some((dependencyId) =>
              affected.has(dependencyId),
            )
          ) {
            affected.add(id);
            expanded = true;
          }
        }
      }
      if (featureInitializationPaused) return [...affected];
      for (const [id, definition] of [...featureDefinitions].reverse()) {
        if (!affected.has(id) || isFeatureEnabled(definition)) continue;
        await disableFeature(id);
      }
      for (const [id, definition] of featureDefinitions) {
        if (!affected.has(id) || !isFeatureEnabled(definition)) continue;
        await initializeFeature(id);
      }
      return [...affected];
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
      if (changed && !featureInitializationPaused) {
        await this.initializeAll("character");
      }
    },
    pauseInitialization() {
      featureInitializationPaused = true;
    },
    resumeInitialization() {
      featureInitializationPaused = false;
    },
    getStatus(id) {
      const state = featureStates.get(id) ?? {
        status: "unregistered",
        error: null,
      };
      const staticDataMissing =
        state.status === "initializing" &&
        (!runtime.state.initData_itemDetailMap ||
          !runtime.state.initData_actionDetailMap);
      return {
        id,
        status: staticDataMissing ? "waiting" : state.status,
        error:
          state.error?.message ??
          (staticDataMissing
            ? runtime.config.isZH
              ? "静态游戏数据尚未就绪（物品／行动表）：请等待加载完成；若长时间不变，请刷新游戏后重试。"
              : "Static game data is unavailable (items/actions): wait for loading, or refresh the game and retry if it persists."
            : null),
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
