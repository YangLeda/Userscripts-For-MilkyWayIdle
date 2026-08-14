import {
  CombatIdentity,
  MWI,
  Settings,
  combatEventMatchesSession,
  formatDamage,
  formatDuration,
  formatRate,
} from "./00-bootstrap.js";
import {
  ClassDebug,
  ClassProbe,
  ClassSystem,
  installThemeFont,
} from "./10-combat-sources.js";
import { Capture, Diagnostics, Session } from "./20-session.js";
import { HistoryStore, SegmentSelection, ViewData } from "./30-history.js";
import { SocketHook } from "./40-socket-parser.js";
import { DamageBreakdownTooltip } from "./50-graph-components.js";
import { KikiMeter } from "./60-main-panel.js";
import "./70-recount-compat.js";

const langText = (zh, en) => (Settings.getLanguage() === "en" ? en : zh);

function start(scope) {
  installThemeFont();
  let currentPlayerNames = [];
  let currentIsBoss = false;
  let hasConfirmedCombat = false;
  let pendingReconnect = false;
  let lastActiveSave = 0;

  const cached = HistoryStore.loadActive();
  if (cached) {
    try {
      Session.restore(cached);
      currentPlayerNames = Session.getAllPlayerNames();
      pendingReconnect = true;
      hasConfirmedCombat = true;
    } catch (e) {
      HistoryStore.clearActive();
      console.warn("[KikiMeter] 已忽略损坏的活动战斗缓存。");
    }
  }

  function buildHistoryEntry() {
    const snap = Session.serialize(),
      m = snap.meta || {};
    if (!hasConfirmedCombat && !m.combatKey) return null;
    const names = currentPlayerNames.length
      ? currentPlayerNames
      : Session.getAllPlayerNames();
    const type = SocketHook.isGuildBattle()
      ? "trial"
      : SocketHook.isInLabyrinth()
        ? "labyrinth"
        : m.type || "combat";
    return {
      schemaVersion: 2,
      id:
        m.id ||
        "fight-" +
          (m.characterId || "unknown") +
          "-" +
          (m.combatKey || Date.now()),
      type,
      characterId: m.characterId || "unknown",
      combatKey: m.combatKey || "",
      startedAt: m.startedAt || snap.savedAt,
      endedAt: snap.savedAt,
      date: m.startedAt || snap.savedAt,
      durationMs: snap.durationMs,
      durationSeconds: Math.floor(snap.durationMs / 1000),
      teamDps:
        snap.durationMs > 0 ? snap.teamDamage / (snap.durationMs / 1000) : 0,
      teamDamage: snap.teamDamage,
      teamKills: Session.getTeamKills(),
      classes: snap.classes,
      fragments: snap.fragments,
      graph: snap.graph,
      players: names.map((n) => ({
        name: n,
        classId: ClassSystem.classFor(n),
        damage: Session.getPlayerDamage(n),
        dps: Session.getPlayerDps(n),
        kills: Session.getPlayerKills(n),
        hps: Session.getPlayerHps(n),
        healing: Session.getPlayerHealing(n),
        taken: Session.getPlayerTaken(n),
        sources: Session.getPlayerDamageSources(n),
        takenSources: Session.getPlayerTakenSources(n),
        accuracy: Session.getPlayerAccuracy(n),
      })),
    };
  }

  function saveCurrentSession(reason = "归档") {
    const entry = buildHistoryEntry();
    if (!entry) return null;
    entry.endReason = reason;
    HistoryStore.push(entry);
    return entry;
  }
  function persistActive(force = false) {
    if (!hasConfirmedCombat) return false;
    const now = Date.now();
    if (!force && now - lastActiveSave < 2000) return false;
    lastActiveSave = now;
    return HistoryStore.saveActive(Session.serialize());
  }
  function beginEncounter(detail, typeHint) {
    const characterId = String(
      detail.characterId || SocketHook.getCharacterId() || "unknown",
    );
    const identity = CombatIdentity.resolve(detail, typeHint, characterId),
      key = identity.key;
    const old = Session.getMeta();
    const sameEncounter =
      old.combatKey &&
      CombatIdentity.matches(old, identity, typeHint, characterId);
    const oldStages = Array.isArray(old.trialStageIds) ? old.trialStageIds : [];
    const stageId =
      typeHint === "trial"
        ? String(detail.stageId || identity.rawKey || "")
        : "";
    const isNewStage = stageId && !oldStages.includes(stageId);
    if (sameEncounter) {
      if (Session.isFrozen()) {
        if (pendingReconnect) Session.resume("断线续传");
        else if (typeHint === "trial" && isNewStage)
          Session.resumeTrialTier("进入下一层");
        else Session.resume("继续战斗");
      }
      // tier 升级沿用当前母片段；只记录已见 stageId，不调用 splitFragment。
      if (typeHint === "trial")
        Session.setMeta({
          id: "fight-" + characterId + "-" + key,
          combatKey: key,
          type: "trial",
          trialDay: identity.day,
          trialStageIds: isNewStage ? [...oldStages, stageId] : oldStages,
          manualReset: false,
        });
    } else {
      if (old.combatKey) {
        Session.freeze("开始另一场战斗");
        saveCurrentSession("开始另一场战斗");
      }
      const startedAt = new Date().toISOString();
      Session.reset({
        id: "fight-" + characterId + "-" + (key || Date.now()),
        combatKey: key,
        characterId,
        startedAt,
        type: typeHint || "combat",
      });
      if (typeHint === "trial")
        Session.setMeta({
          trialDay: identity.day,
          trialStageIds: stageId ? [stageId] : [],
          manualReset: false,
        });
    }
    ClassSystem.applyClasses(detail.classes);
    hasConfirmedCombat = true;
    pendingReconnect = false;
    persistActive(true);
  }

  function resetSession(reason) {
    const old = Session.getMeta();
    Session.freeze(reason);
    saveCurrentSession(reason);
    HistoryStore.clearActive();
    const now = Date.now();
    Session.reset({
      id: "fight-" + (old.characterId || "unknown") + "-manual-" + now,
      combatKey: (old.combatKey || "manual") + "-manual-" + now,
      characterId: old.characterId || SocketHook.getCharacterId() || "unknown",
      startedAt: new Date(now).toISOString(),
      type: old.type || "combat",
      manualReset: true,
    });
    hasConfirmedCombat = true;
    currentPlayerNames = Session.getAllPlayerNames();
    persistActive(true);
    console.info("[KikiMeter] 已结束当前记录并新建记录：" + reason);
  }

  function buildClipboardText() {
    const view = ViewData.get(),
      total = view.teamDamage;
    const d = new Date();
    const dateStr =
      d.toLocaleDateString() +
      " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    let out = langText(
      `=== 银河奶牛 DPS 统计｜${view.label}｜${dateStr}｜${formatDuration(view.elapsed)} ===\n`,
      `=== MWI DPS Meter | ${view.label} | ${dateStr} | ${formatDuration(view.elapsed)} ===\n`,
    );
    out += langText(
      `团队：${formatRate(view.teamDps)} DPS｜总伤害 ${formatDamage(total)}`,
      `Team: ${formatRate(view.teamDps)} DPS | Total damage ${formatDamage(total)}`,
    );
    if (view.teamKills > 0)
      out += langText(`｜击杀 ${view.teamKills}`, ` | Kills ${view.teamKills}`);
    out += "\n";
    view.players.forEach((p) => {
      const pct =
        total > 0 ? (((Number(p.damage) || 0) / total) * 100).toFixed(0) : "0";
      const name = p.name.padEnd(12).slice(0, 12);
      out +=
        name +
        langText("：", ": ") +
        formatRate(p.dps || 0).padStart(6) +
        langText(" DPS｜", " DPS | ");
      out +=
        formatDamage(Number(p.damage) || 0).padStart(7) + " (" + pct + "%)";
      if (Number(p.kills) > 0)
        out += langText(`｜击杀 ${p.kills}`, ` | Kills ${p.kills}`);
      if (Settings.getShowHealing() && Number(p.hps) > 0.1)
        out += langText(
          `｜HPS ${formatRate(p.hps)}`,
          ` | HPS ${formatRate(p.hps)}`,
        );
      out += "\n";
    });
    return out;
  }

  function renderSelectedPanels() {
    const view = ViewData.get();
    KikiMeter.renderView(view);
  }

  KikiMeter.init({
    onReset: () => resetSession("手动结束"),
    onSegmentChange: renderSelectedPanels,
    onCopy: (btn) => {
      const compact = btn && btn.dataset.compactAction === "true",
        original = btn && btn.textContent;
      navigator.clipboard
        .writeText(buildClipboardText())
        .then(() => {
          btn.textContent = compact ? "✓" : langText("✓ 已复制", "✓ Copied");
          setTimeout(() => {
            btn.textContent =
              original || langText("复制统计", "Copy statistics");
          }, 2000);
        })
        .catch(() => {
          btn.textContent = compact
            ? "!"
            : langText("✗ 复制失败", "✗ Copy failed");
          setTimeout(() => {
            btn.textContent =
              original || langText("复制统计", "Copy statistics");
          }, 2000);
        });
    },
  });

  scope.event(SocketHook.bus, "guildBattleDetected", (ev) => {
    const detail = { ...(ev.detail || {}) };
    if (!detail.combatKey)
      detail.combatKey =
        "guild-fallback-" + CombatIdentity.dayStamp(new Date());
    if (!detail.stageId) detail.stageId = String(detail.combatKey);
    beginEncounter(detail, "trial");
  });
  scope.event(SocketHook.bus, "guildTrialEnded", () => {
    Session.freeze("公会试炼阶段结束");
    saveCurrentSession("公会试炼阶段结束");
    persistActive(true);
    hasConfirmedCombat = true;
    console.info(
      "[KikiMeter] 公会试炼阶段已结束；当天进入下一关时将继续累计。",
    );
  });
  scope.event(SocketHook.bus, "guildSlotRenamed", (ev) => {
    Session.renamePlayer(ev.detail.oldName, ev.detail.newName);
  });
  scope.event(SocketHook.bus, "newBattle", (ev) => {
    // 公会试炼期间的普通战斗只用于被动学习队友职业，不参与当前 Session。
    // 否则它的 combatStartTime 会把同日试炼累计错误地重置为普通战斗。
    if (ev.detail && ev.detail.parallelGuildBattle) return;
    beginEncounter(
      ev.detail,
      SocketHook.isInLabyrinth() ? "labyrinth" : "combat",
    );
    currentPlayerNames = ev.detail.names;
    currentIsBoss = ev.detail.isBoss;
    Session.setBoss(ev.detail.isBoss);
  });
  function acceptsCombatEvent(detail = {}) {
    return combatEventMatchesSession(detail, Session.getMeta());
  }
  scope.event(SocketHook.bus, "damage", (ev) => {
    if (!acceptsCombatEvent(ev.detail)) return;
    Session.addTeamDamage(ev.detail.amount, ev.detail.ts);
    persistActive();
  });
  scope.event(SocketHook.bus, "playerDamage", (ev) => {
    if (acceptsCombatEvent(ev.detail))
      Session.addPlayerDamage(
        ev.detail.name,
        ev.detail.amount,
        ev.detail.source,
      );
  });
  scope.event(SocketHook.bus, "attackResolved", (ev) => {
    if (acceptsCombatEvent(ev.detail))
      Session.addPlayerAccuracy(
        ev.detail.name,
        ev.detail.hit,
        ev.detail.targets,
      );
  });
  scope.event(SocketHook.bus, "healing", (ev) => {
    if (acceptsCombatEvent(ev.detail))
      Session.addPlayerHealing(ev.detail.name, ev.detail.amount);
  });
  scope.event(SocketHook.bus, "playerDamageTaken", (ev) => {
    if (acceptsCombatEvent(ev.detail))
      Session.addPlayerTaken(
        ev.detail.name,
        ev.detail.amount,
        ev.detail.source,
      );
  });
  scope.event(SocketHook.bus, "kill", (ev) => {
    if (acceptsCombatEvent(ev.detail) && ev.detail.name)
      Session.addPlayerKill(ev.detail.name);
  });
  scope.event(SocketHook.bus, "socketReconnected", (ev) => {
    const next = String((ev.detail && ev.detail.characterId) || "unknown"),
      old = Session.getMeta();
    if (
      old.characterId &&
      old.characterId !== "unknown" &&
      next !== "unknown" &&
      String(old.characterId) !== next
    ) {
      Session.freeze("切换角色");
      saveCurrentSession("切换角色");
      HistoryStore.clearActive();
      Session.reset();
      hasConfirmedCombat = false;
      currentPlayerNames = [];
    } else if (hasConfirmedCombat) {
      Session.pause("连接中断");
      persistActive(true);
      pendingReconnect = true;
    }
  });
  scope.event(ClassDebug.bus, "change", () => {
    if (Settings.getMainMode() === "debug") renderSelectedPanels();
  });
  scope.event(ClassProbe.bus, "change", () => {
    if (Settings.getMainMode() === "debug") renderSelectedPanels();
  });
  scope.event(ClassSystem.bus, "change", () => {
    renderSelectedPanels();
    persistActive();
  });
  // 新实例会在紧随其后的 newBattle 中依据 combatStartTime 完成分段。
  scope.event(SocketHook.bus, "newCombatInstance", () => {});

  scope.event(document, "visibilitychange", () => {
    if (document.hidden) persistActive(true);
  });
  scope.event(window, "pagehide", () => {
    if (hasConfirmedCombat) {
      Session.pause("页面关闭");
      persistActive(true);
    }
  });
  scope.event(window, "pageshow", (ev) => {
    if (ev.persisted && hasConfirmedCombat && Session.isFrozen()) {
      Session.resume("页面恢复");
      persistActive(true);
    }
  });

  let refreshTimer = null;
  const refresh = () => {
    refreshTimer = null;
    Session.advanceBuckets();
    persistActive();
    if (KikiMeter.isOpen()) renderSelectedPanels();
    refreshTimer = setTimeout(refresh, Settings.getRefreshInterval());
  };
  refreshTimer = setTimeout(refresh, Settings.getRefreshInterval());
  scope.add(() => {
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    refreshTimer = null;
  });

  Object.assign(MWI, {
    enabled: true,
    bus: SocketHook.bus,
    getSessionDps: Session.getTeamDps,
    getSessionDamage: Session.getTeamDamage,
    getTeamKills: Session.getTeamKills,
    getPlayerDps: Session.getPlayerDps,
    getPlayerDamage: Session.getPlayerDamage,
    getPlayerDamageSources: Session.getPlayerDamageSources,
    getPlayerTakenSources: Session.getPlayerTakenSources,
    getPlayerTaken: Session.getPlayerTaken,
    getPlayerHps: Session.getPlayerHps,
    getPlayerKills: Session.getPlayerKills,
    getCurrentBattle: () => Session.serialize(),
    getBattleHistory: (type) => HistoryStore.getAll(type),
    getDisplayedSegment: () => ViewData.get(),
    listSegments: () =>
      SegmentSelection.options().map((x) => ({
        key: x.key,
        label: x.label,
        current: !!x.current,
      })),
    selectSegment: (key) => {
      SegmentSelection.select(key);
      renderSelectedPanels();
      return ViewData.get();
    },
    getClassDiagnostics: ClassSystem.diagnostics,
    getClassDebugEvents: ClassDebug.get,
    getClassDebugReport: ClassDebug.report,
    clearClassDebugReport: ClassDebug.clear,
    startClassProbe: ClassProbe.start,
    stopClassProbe: ClassProbe.stop,
    getClassProbeStatus: ClassProbe.status,
    getClassProbeReport: ClassProbe.report,
    downloadClassProbeReport: ClassProbe.download,
    clearClassProbe: ClassProbe.clear,
    setPlayerClass: (name, classId) => {
      ClassSystem.setOverride(name, classId);
      renderSelectedPanels();
    },
    getLanguage: Settings.getLanguage,
    setLanguage: (language) => {
      Settings.setLanguage(language);
      DamageBreakdownTooltip.close();
      renderSelectedPanels();
      return Settings.getLanguage();
    },
    forceSave: () => persistActive(true),
    resetSession: () => resetSession("控制台调用"),
    diagnostics: Diagnostics.summary,
    captureStart: Capture.start,
    captureStop: Capture.stop,
    captureDownload: Capture.download,
    captureSize: Capture.size,
    scanGuildNames: SocketHook.scanGuildNames,
    scanGuildNamesAttrs: SocketHook.scanGuildNamesAttrs,
    scanGuildNamesLoose: SocketHook.scanGuildNamesLoose,
    scanGuildNamesByLocalName: SocketHook.scanGuildNamesByLocalName,
    previewGuildNames: SocketHook.previewGuildNames,
    debugCombatUnitNames: SocketHook.debugCombatUnitNames,
    scanGuildNamesByEllipsis: SocketHook.scanGuildNamesByEllipsis,
    countMiniUnitNames: SocketHook.countMiniUnitNames,
    scanForOutlierMiniUnit: SocketHook.scanForOutlierMiniUnit,
  });

  return () => {
    persistActive(true);
    ClassProbe.stop();
    DamageBreakdownTooltip.close();
    KikiMeter.destroy();
    document.getElementById("kikimeter-zh-theme")?.remove();
    MWI.enabled = false;
  };
}

export { start as createDpsApplication };
