import {
  ACCENT,
  SKILL_MODE_ICONS,
  Settings,
  TAB_CONTAINER_CLASS,
  TOOLBAR_ICONS,
  VERSION,
  el,
  formatDamage,
  formatDuration,
  formatRate,
  iconElement,
  isSelectedGuildProgressTabBar,
  isSelectedTrialTabBar,
} from "./00-bootstrap.js";
import { ClassDebug, ClassProbe, ClassSystem } from "./10-combat-sources.js";
import {
  HistoryStore,
  ViewData,
  buildSegmentPicker,
  refreshSegmentSelect,
} from "./30-history.js";
import {
  DamageBreakdownTooltip,
  buildDetailsGraph,
  renderDetailsRows,
} from "./50-graph-components.js";

// ─── KikiMeter Panel ─────────────────────────────────────────────────────────
const KikiMeter = (() => {
  const langText = (zh, en) => (Settings.getLanguage() === "en" ? en : zh);
  const localizeReason = (reason) => {
    const labels = {
      旧版记录: "Legacy record",
      归档: "Archived",
      断线续传: "Reconnect continuation",
      进入下一层: "Entered next tier",
      继续战斗: "Combat continued",
      开始另一场战斗: "Another combat started",
      手动结束: "Ended manually",
      公会试炼阶段结束: "Guild Trial stage ended",
      切换角色: "Character switched",
      连接中断: "Connection interrupted",
      页面关闭: "Page closed",
      页面恢复: "Page resumed",
      战斗: "Combat",
    };
    return Settings.getLanguage() === "en"
      ? labels[reason] || reason || "Combat"
      : reason || "战斗";
  };
  const PANEL_LAYOUT_VERSION = 2,
    DEFAULT_PANEL_HEIGHT = 212,
    MIN_PANEL_HEIGHT = 180;
  let panelOpen = false,
    tabBtn = null,
    panel = null;
  let reinjector = null,
    throttleTimer = null,
    viewportHandler = null;
  let historyFilter = "combat";
  let titleEl,
    playersListEl,
    segmentSelect,
    dpsTab,
    hpsTab,
    takenTab,
    debugTab,
    graphTab,
    settingsTab,
    settingsMenu,
    langTab,
    resetTab,
    copyTab,
    closeTab,
    trialClassNotice;
  let mainGraphObj = null,
    mainGraphWrap = null;
  let mainMode = Settings.getMainMode();
  if (mainMode === "debug" && !Settings.getDebugMode()) mainMode = "dps";
  let callbacks = {};

  const isMobileViewport = () =>
    Boolean(
      window.matchMedia &&
      window.matchMedia("(max-width:700px), (pointer:coarse)").matches,
    );
  const viewportBounds = () => {
    const visualViewport = window.visualViewport;
    const left = Number(visualViewport?.offsetLeft) || 0;
    const top = Number(visualViewport?.offsetTop) || 0;
    const width =
      Number(visualViewport?.width) || Number(window.innerWidth) || 0;
    const height =
      Number(visualViewport?.height) || Number(window.innerHeight) || 0;
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    };
  };
  const communityBuffRect = () =>
    document
      .querySelector('div[class*="Header_communityBuffs"]')
      ?.getBoundingClientRect?.() ?? null;
  const isStoredPosition = (value) =>
    value &&
    Number.isFinite(Number(value.left)) &&
    Number.isFinite(Number(value.top));
  function readResponsivePosition(value, mode) {
    if (!value) return null;
    if (value.mobile || value.desktop) return value[mode] ?? null;
    return mode === "desktop" && isStoredPosition(value) ? value : null;
  }
  function writeResponsivePosition(value, mode, position) {
    const responsive = value?.mobile || value?.desktop ? { ...value } : {};
    if (isStoredPosition(value) && !responsive.desktop)
      responsive.desktop = value;
    responsive[mode] = position;
    return responsive;
  }
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

  function refreshModeTabs() {
    [
      [dpsTab, "dps"],
      [hpsTab, "hps"],
      [takenTab, "taken"],
      [debugTab, "debug"],
    ].forEach(([button, mode]) => {
      if (!button) return;
      const active = mainMode === mode;
      Object.assign(button.style, {
        color: active ? ACCENT : "rgba(255,255,255,.52)",
        background: active ? "rgba(212,175,55,.12)" : "transparent",
        borderColor: active ? "rgba(212,175,55,.38)" : "transparent",
      });
    });
    if (graphTab) {
      const active = Settings.getShowGraph();
      Object.assign(graphTab.style, {
        color: active ? ACCENT : "rgba(255,255,255,.52)",
        background: active ? "rgba(212,175,55,.12)" : "transparent",
        borderColor: active ? "rgba(212,175,55,.38)" : "transparent",
      });
      graphTab.setAttribute("aria-pressed", active ? "true" : "false");
    }
    if (debugTab)
      debugTab.style.display = Settings.getDebugMode() ? "" : "none";
  }
  function setMainMode(mode) {
    mainMode = ["dps", "hps", "taken", "debug"].includes(mode) ? mode : "dps";
    if (mainMode === "debug" && !Settings.getDebugMode()) mainMode = "dps";
    Settings.setMainMode(mainMode);
    refreshModeTabs();
    renderView(ViewData.get());
  }
  function toggleMainGraph() {
    const shouldShowGraph = mainGraphWrap
      ? mainGraphWrap.hidden
      : !Settings.getShowGraph();
    Settings.setShowGraph(shouldShowGraph);
    if (mainGraphWrap) {
      mainGraphWrap.hidden = !shouldShowGraph;
      if (shouldShowGraph && mainGraphObj)
        mainGraphObj.render(ViewData.get().graphPoints || []);
    }
    if (graphTab)
      graphTab.setAttribute("aria-pressed", shouldShowGraph ? "true" : "false");
    refreshModeTabs();
  }
  function refreshLanguageSwitch() {
    if (!langTab) return;
    const english = Settings.getLanguage() === "en";
    langTab.setAttribute("aria-checked", english ? "true" : "false");
    langTab.title = english ? "Switch to Chinese" : "切换为英文";
    if (langTab._knob)
      langTab._knob.style.transform = english
        ? "translateX(19px)"
        : "translateX(0)";
    if (langTab._label) langTab._label.textContent = english ? "EN" : "中";
  }
  function refreshToolbarLanguage() {
    const english = Settings.getLanguage() === "en";
    [
      [dpsTab, "伤害输出（DPS）", "Damage Done (DPS)"],
      [hpsTab, "恢复量（HPS）", "Healing (HPS)"],
      [takenTab, "承受伤害（DTPS）", "Damage Taken (DTPS)"],
      [graphTab, "显示或隐藏 DPS 趋势", "Show or hide DPS trend"],
      [debugTab, "职业调试", "Class Debug"],
      [settingsTab, "设置", "Settings"],
      [resetTab, "结束并新建记录", "End fight and start a new record"],
      [copyTab, "复制统计", "Copy statistics"],
      [closeTab, "隐藏面板", "Hide panel"],
    ].forEach(([button, zh, en]) => {
      if (button) button.title = english ? en : zh;
    });
    refreshSegmentSelect(segmentSelect);
    if (trialClassNotice)
      trialClassNotice.textContent = english
        ? "Click each combat unit to identify its class accurately and cache it permanently."
        : "点击战斗界面中的人物，可准确识别职业并永久缓存。";
  }
  function toggleLanguage() {
    DamageBreakdownTooltip.close();
    closeSettingsMenu();
    Settings.setLanguage(Settings.getLanguage() === "zh" ? "en" : "zh");
    refreshLanguageSwitch();
    refreshToolbarLanguage();
    renderView(ViewData.get());
  }
  function applyPanelOpacity() {
    if (!panel) return;
    const alpha = Settings.getPanelOpacity() / 100;
    panel.style.background = `linear-gradient(180deg,rgba(24,24,24,${alpha}),rgba(8,8,8,${alpha}))`;
  }
  function buildLanguageSwitch() {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.compactAction = "true";
    button.setAttribute("role", "switch");
    Object.assign(button.style, {
      position: "relative",
      width: "43px",
      height: "23px",
      padding: "0 4px",
      cursor: "pointer",
      background: "rgba(255,255,255,.12)",
      border: "1px solid rgba(255,255,255,.22)",
      borderRadius: "12px",
      color: "#fff",
      fontSize: "9px",
      overflow: "hidden",
    });
    const knob = el("span", {
      position: "absolute",
      left: "2px",
      top: "2px",
      width: "17px",
      height: "17px",
      borderRadius: "50%",
      background: ACCENT,
      boxShadow: "0 1px 4px rgba(0,0,0,.8)",
      transition: "transform .16s",
    });
    const label = el("span", {
      position: "relative",
      zIndex: "1",
      fontWeight: "700",
      textShadow: "0 1px 2px #000",
    });
    button._knob = knob;
    button._label = label;
    button.append(knob, label);
    button.addEventListener("mousedown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleLanguage();
    });
    langTab = button;
    refreshLanguageSwitch();
    return button;
  }
  function closeSettingsMenu() {
    if (settingsMenu) {
      settingsMenu.remove();
      settingsMenu = null;
    }
  }
  function toggleSettingsMenu(anchor) {
    if (settingsMenu) {
      closeSettingsMenu();
      return;
    }
    const english = Settings.getLanguage() === "en";
    const menu = el("div", {
      position: "fixed",
      zIndex: "10005",
      width: "230px",
      padding: "10px",
      boxSizing: "border-box",
      background: "rgba(18,18,18,.98)",
      border: "1px solid rgba(212,175,55,.65)",
      borderRadius: "5px",
      boxShadow: "0 8px 26px rgba(0,0,0,.85)",
      color: "#f3f3f3",
      fontSize: "11px",
    });
    menu.dataset.kikimeter = "true";
    const heading = el("div", {
      fontWeight: "700",
      fontSize: "12px",
      marginBottom: "9px",
      paddingBottom: "6px",
      borderBottom: "1px solid rgba(255,255,255,.12)",
    });
    heading.textContent = english ? "Settings" : "设置";
    const opacityRow = el("div", {
      display: "flex",
      alignItems: "center",
      gap: "7px",
      marginBottom: "10px",
    });
    const opacityLabel = el("span", { minWidth: "62px" });
    opacityLabel.textContent = english ? "Opacity" : "不透明度";
    const range = document.createElement("input");
    range.type = "range";
    range.min = "10";
    range.max = "100";
    range.step = "5";
    range.value = String(Settings.getPanelOpacity());
    Object.assign(range.style, {
      flex: "1",
      accentColor: ACCENT,
      minWidth: "80px",
    });
    const value = el("span", {
      width: "34px",
      textAlign: "right",
      fontVariantNumeric: "tabular-nums",
    });
    value.textContent = range.value + "%";
    range.addEventListener("input", () => {
      Settings.setPanelOpacity(range.value);
      value.textContent = Settings.getPanelOpacity() + "%";
      applyPanelOpacity();
    });
    opacityRow.append(opacityLabel, range, value);
    const debugRow = el("label", {
      display: "flex",
      alignItems: "center",
      gap: "7px",
      cursor: "pointer",
    });
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Settings.getDebugMode();
    checkbox.style.accentColor = ACCENT;
    const debugLabel = el("span");
    debugLabel.textContent = english ? "Enable Debug mode" : "启用 Debug 模式";
    checkbox.addEventListener("change", () => {
      Settings.setDebugMode(checkbox.checked);
      refreshModeTabs();
      if (!checkbox.checked && mainMode === "debug") setMainMode("dps");
    });
    debugRow.append(checkbox, debugLabel);
    menu.append(heading, opacityRow, debugRow);
    document.body.appendChild(menu);
    settingsMenu = menu;
    const rect = anchor.getBoundingClientRect(),
      width = menu.offsetWidth || 230,
      height = menu.offsetHeight || 120;
    const left = Math.max(
      5,
      Math.min(rect.right - width, window.innerWidth - width - 5),
    );
    const top =
      rect.bottom + 4 + height <= window.innerHeight
        ? rect.bottom + 4
        : Math.max(5, rect.top - height - 4);
    Object.assign(menu.style, { left: left + "px", top: top + "px" });
    setTimeout(
      () =>
        document.addEventListener("pointerdown", function outside(event) {
          if (!settingsMenu) {
            document.removeEventListener("pointerdown", outside);
            return;
          }
          if (
            !settingsMenu.contains(event.target) &&
            event.target !== settingsTab
          ) {
            closeSettingsMenu();
            document.removeEventListener("pointerdown", outside);
          }
        }),
      0,
    );
  }

  function buildPanel() {
    const p = document.createElement("div");
    p.id = "kikimeter-panel";
    p.dataset.kikimeter = "true";
    let savedSize = Settings.getRecountSize() || {};
    if (Settings.getPanelLayoutVersion() < PANEL_LAYOUT_VERSION) {
      savedSize = { ...savedSize, height: DEFAULT_PANEL_HEIGHT };
      Settings.setRecountSize(savedSize);
      Settings.setShowGraph(false);
      Settings.setPanelLayoutVersion(PANEL_LAYOUT_VERSION);
    }
    const initialWidth = Math.max(
      0,
      Math.min(
        Math.max(280, Number(savedSize.width) || 330),
        viewportBounds().width - 8,
      ),
    );
    const initialHeight = Math.max(
      0,
      Math.min(
        Math.max(
          MIN_PANEL_HEIGHT,
          Number(savedSize.height) || DEFAULT_PANEL_HEIGHT,
        ),
        viewportBounds().height - 8,
      ),
    );
    const panelAlpha = Settings.getPanelOpacity() / 100;
    Object.assign(p.style, {
      display: "none",
      position: "fixed",
      zIndex: "9999",
      width: initialWidth + "px",
      height: initialHeight + "px",
      minWidth: "min(280px, calc(100vw - 8px))",
      minHeight: `min(${MIN_PANEL_HEIGHT}px, calc(100vh - 8px))`,
      maxWidth: "calc(100vw - 8px)",
      maxHeight: "calc(100vh - 8px)",
      boxSizing: "border-box",
      flexDirection: "column",
      overflow: "hidden",
      background: `linear-gradient(180deg,rgba(24,24,24,${panelAlpha}),rgba(8,8,8,${panelAlpha}))`,
      color: "#f2f2f2",
      borderRadius: "5px",
      padding: "8px",
      boxShadow: "0 6px 24px rgba(0,0,0,.85)",
      fontSize: "12px",
      lineHeight: "1.35",
      border: "1px solid rgba(212,175,55,.58)",
    });

    // Details 风格标题栏：左侧只显示当前页面名，右侧全部使用紧凑图标。
    const titleRow = el("div", {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "7px",
      cursor: "move",
      touchAction: "none",
      userSelect: "none",
      flexShrink: "0",
      paddingBottom: "5px",
      borderBottom: "1px solid rgba(255,255,255,.1)",
    });
    titleEl = el("div", {
      fontWeight: "bold",
      fontSize: "13px",
      color: "#e8e8e8",
      letterSpacing: ".2px",
      flex: "1",
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    titleEl.textContent =
      Settings.getLanguage() === "en"
        ? mainMode === "hps"
          ? "Healing"
          : mainMode === "taken"
            ? "Damage Taken"
            : mainMode === "debug"
              ? "Class Debug"
              : "Damage Done"
        : mainMode === "hps"
          ? "恢复量"
          : mainMode === "taken"
            ? "承受伤害"
            : mainMode === "debug"
              ? "职业调试"
              : "伤害输出";
    const titleTools = el("div", {
      display: "flex",
      alignItems: "center",
      gap: "1px",
      flexShrink: "0",
    });
    const iconButton = (content, title, handler) => {
      const button = document.createElement("button");
      button.type = "button";
      button.title = title;
      button.dataset.compactAction = "true";
      Object.assign(button.style, {
        width: "23px",
        height: "23px",
        padding: "0",
        cursor: "pointer",
        background: "transparent",
        color: "rgba(255,255,255,.52)",
        border: "1px solid transparent",
        borderRadius: "3px",
        fontSize: "12px",
        lineHeight: "20px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      });
      if (
        String(content || "").startsWith("data:image/") ||
        String(content || "").includes("/static/media/")
      ) {
        const icon = iconElement(content, "");
        Object.assign(icon.style, {
          width: "17px",
          height: "17px",
          objectFit: "contain",
          pointerEvents: "none",
        });
        button._icon = icon;
        button.appendChild(icon);
      } else button.textContent = content;
      button.addEventListener("mousedown", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        handler();
      });
      return button;
    };
    segmentSelect = buildSegmentPicker(() => {
      if (callbacks.onSegmentChange) callbacks.onSegmentChange();
    }, true);
    dpsTab = iconButton(SKILL_MODE_ICONS.attack, "伤害输出（DPS）", () =>
      setMainMode("dps"),
    );
    hpsTab = iconButton(SKILL_MODE_ICONS.stamina, "恢复量（HPS）", () =>
      setMainMode("hps"),
    );
    takenTab = iconButton(SKILL_MODE_ICONS.defense, "承受伤害（DTPS）", () =>
      setMainMode("taken"),
    );
    graphTab = iconButton(
      TOOLBAR_ICONS.trend,
      "显示或隐藏 DPS 趋势",
      toggleMainGraph,
    );
    debugTab = iconButton(TOOLBAR_ICONS.debug, "Debug", () =>
      setMainMode("debug"),
    );
    settingsTab = iconButton(TOOLBAR_ICONS.settings, "设置", () =>
      toggleSettingsMenu(settingsTab),
    );
    buildLanguageSwitch();
    resetTab = iconButton(TOOLBAR_ICONS.reset, "结束并新建记录", () => {
      if (callbacks.onReset) callbacks.onReset();
    });
    copyTab = iconButton(TOOLBAR_ICONS.copy, "复制统计", () => {
      if (callbacks.onCopy) callbacks.onCopy(copyTab);
    });
    closeTab = iconButton(TOOLBAR_ICONS.close, "隐藏面板", close);
    titleTools.append(
      segmentSelect,
      dpsTab,
      hpsTab,
      takenTab,
      graphTab,
      debugTab,
      settingsTab,
      resetTab,
      copyTab,
      langTab,
      closeTab,
    );
    titleRow.append(titleEl, titleTools);
    p.appendChild(titleRow);
    refreshModeTabs();
    refreshToolbarLanguage();

    trialClassNotice = el("div", {
      display: "none",
      margin: "0 0 7px",
      padding: "5px 7px",
      border: "1px solid rgba(63,199,235,.35)",
      borderRadius: "3px",
      background: "rgba(63,199,235,.08)",
      color: "#9bddf3",
      fontSize: "10px",
      lineHeight: "1.45",
    });
    trialClassNotice.textContent =
      "点击战斗界面中的人物，可准确识别职业并永久缓存。";
    p.appendChild(trialClassNotice);

    // Zone joueurs
    playersListEl = el("div", {
      marginBottom: "8px",
      paddingBottom: "8px",
      borderBottom: "1px solid rgba(255,255,255,.1)",
      flex: "1 1 auto",
      minHeight: "50px",
      overflowY: "auto",
    });
    p.appendChild(playersListEl);

    // 主面板唯一保留的 DPS 趋势图，固定在窗口最下方。
    mainGraphObj = buildDetailsGraph();
    mainGraphWrap = el("div", {
      flexShrink: "0",
      paddingTop: "6px",
      borderTop: "1px solid rgba(255,255,255,.1)",
    });
    mainGraphWrap.hidden = !Settings.getShowGraph();
    mainGraphWrap.append(mainGraphObj.canvas);
    p.appendChild(mainGraphWrap);

    installWindowControls(p, titleRow);

    document.body.appendChild(p);
    return p;
  }

  function installWindowControls(root, titleRow) {
    let drag = null,
      resize = null;
    const mode = () => (isMobileViewport() ? "mobile" : "desktop");
    const storeWindowState = () => {
      const currentPosition = Settings.getRecountPos();
      Settings.setRecountPos(
        writeResponsivePosition(currentPosition, mode(), {
          left: Number.parseFloat(root.style.left) || 0,
          top: Number.parseFloat(root.style.top) || 0,
        }),
      );
      Settings.setRecountSize({
        width: root.offsetWidth,
        height: root.offsetHeight,
      });
    };
    titleRow.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button,input,select"))
        return;
      const rect = root.getBoundingClientRect();
      Object.assign(root.style, {
        left: rect.left + "px",
        top: rect.top + "px",
        right: "auto",
      });
      drag = {
        id: event.pointerId,
        dx: event.clientX - rect.left,
        dy: event.clientY - rect.top,
      };
      if (titleRow.setPointerCapture)
        try {
          titleRow.setPointerCapture(event.pointerId);
        } catch (ignore) {}
      event.preventDefault();
    });
    const handles = {
      nw: ["0", "auto", "auto", "0", "nwse-resize"],
      ne: ["0", "0", "auto", "auto", "nesw-resize"],
      sw: ["auto", "auto", "0", "0", "nesw-resize"],
      se: ["auto", "0", "0", "auto", "nwse-resize"],
    };
    Object.entries(handles).forEach(
      ([direction, [top, right, bottom, left, cursor]]) => {
        const handle = el("div", {
          position: "absolute",
          top,
          right,
          bottom,
          left,
          width: "16px",
          height: "16px",
          zIndex: "4",
          cursor,
          touchAction: "none",
        });
        handle.dataset.resizeCorner = direction;
        handle.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          const rect = root.getBoundingClientRect();
          resize = {
            id: event.pointerId,
            direction,
            sx: event.clientX,
            sy: event.clientY,
            rect,
          };
          if (handle.setPointerCapture)
            try {
              handle.setPointerCapture(event.pointerId);
            } catch (ignore) {}
          event.preventDefault();
          event.stopPropagation();
        });
        root.appendChild(handle);
      },
    );
    window.addEventListener("pointermove", (event) => {
      const bounds = viewportBounds();
      if (drag && drag.id === event.pointerId) {
        const left = clamp(
          event.clientX - drag.dx,
          bounds.left,
          Math.max(bounds.left, bounds.right - root.offsetWidth),
        );
        const top = clamp(
          event.clientY - drag.dy,
          bounds.top,
          Math.max(bounds.top, bounds.bottom - root.offsetHeight),
        );
        root.style.left = left + "px";
        root.style.top = top + "px";
        event.preventDefault();
        return;
      }
      if (!resize || resize.id !== event.pointerId) return;
      const dx = event.clientX - resize.sx,
        dy = event.clientY - resize.sy,
        r = resize.rect,
        d = resize.direction;
      const maxWidth = Math.max(0, bounds.width - 8),
        maxHeight = Math.max(0, bounds.height - 8),
        minWidth = Math.min(280, maxWidth),
        minHeight = Math.min(MIN_PANEL_HEIGHT, maxHeight);
      let width = d.includes("w") ? r.width - dx : r.width + dx;
      let height = d.includes("n") ? r.height - dy : r.height + dy;
      width = clamp(width, minWidth, maxWidth);
      height = clamp(height, minHeight, maxHeight);
      let left = d.includes("w") ? r.right - width : r.left,
        top = d.includes("n") ? r.bottom - height : r.top;
      left = clamp(
        left,
        bounds.left,
        Math.max(bounds.left, bounds.right - width),
      );
      top = clamp(
        top,
        bounds.top,
        Math.max(bounds.top, bounds.bottom - height),
      );
      Object.assign(root.style, {
        left: left + "px",
        top: top + "px",
        right: "auto",
        width: width + "px",
        height: height + "px",
      });
      event.preventDefault();
    });
    const finishPointerAction = (event) => {
      const matchesDrag = drag && drag.id === event.pointerId;
      const matchesResize = resize && resize.id === event.pointerId;
      if (!matchesDrag && !matchesResize) return;
      storeWindowState();
      drag = null;
      resize = null;
    };
    window.addEventListener("pointerup", finishPointerAction);
    window.addEventListener("pointercancel", finishPointerAction);
  }

  function close() {
    panelOpen = false;
    closeSettingsMenu();
    DamageBreakdownTooltip.close();
    if (panel) panel.style.display = "none";
    if (tabBtn) tabBtn.style.filter = "none";
  }

  function placePanel() {
    if (!panel || !panelOpen) return;
    const bounds = viewportBounds();
    const rect = panel.getBoundingClientRect();
    const width =
      rect.width ||
      panel.offsetWidth ||
      Number.parseFloat(panel.style.width) ||
      280;
    const height =
      rect.height ||
      panel.offsetHeight ||
      Number.parseFloat(panel.style.height) ||
      MIN_PANEL_HEIGHT;
    const mode = isMobileViewport() ? "mobile" : "desktop";
    const saved = readResponsivePosition(Settings.getRecountPos(), mode);
    let left;
    let top;
    if (isStoredPosition(saved)) {
      left = Number(saved.left);
      top = Number(saved.top);
    } else if (mode === "mobile" && communityBuffRect()) {
      const anchorRect = communityBuffRect();
      left = anchorRect.right + 6;
      top = anchorRect.top;
    } else {
      left = bounds.right - width - 12;
      top = bounds.bottom - height - 12;
    }
    left = clamp(
      left,
      bounds.left + 4,
      Math.max(bounds.left + 4, bounds.right - width - 4),
    );
    top = clamp(
      top,
      bounds.top + 4,
      Math.max(bounds.top + 4, bounds.bottom - height - 4),
    );
    Object.assign(panel.style, {
      display: "flex",
      left: left + "px",
      top: top + "px",
      right: "auto",
    });
  }

  function toggle(v, anchor) {
    const currentlyOpen = !!panel && panel.style.display !== "none";
    const next = v === undefined ? !currentlyOpen : !!v;
    if (!next) {
      close();
      return false;
    }
    panelOpen = true;
    panel.style.display = "flex";
    placePanel();
    if (tabBtn) tabBtn.style.filter = "brightness(1.15)";
    return true;
  }

  function buildToggle(label, initial, onChange) {
    const row = el("div", {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      marginBottom: "3px",
    });
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = initial;
    cb.style.accentColor = ACCENT;
    cb.addEventListener("change", () => onChange(cb.checked));
    const lbl = el("span", { fontSize: "12px" });
    lbl.textContent = label;
    row.append(cb, lbl);
    return row;
  }

  // Bouton onglet — réplique le style "pastille pleine" des autres onglets du jeu
  // (fond coloré + coins arrondis), pas un soulignement. Fermé = fond ACCENT plein,
  // comme les onglets natifs (Combat Sim, Dispatch, Loot...) qui sont tous des
  // boutons pleins colorés, jamais transparents.
  function buildTabBtn() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "kikimeter-tab-btn";
    btn.dataset.kikimeter = "true";
    btn.dataset.kikimeterBound = VERSION;
    btn.textContent = "DPS";
    Object.assign(btn.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      position: "fixed",
      zIndex: "9998",
      cursor: "pointer",
      background: ACCENT,
      color: "#fff",
      border: "none",
      borderRadius: "4px",
      width: "54px",
      height: "28px",
      padding: "0",
      margin: "0",
      fontWeight: "600",
      fontSize: "13px",
      fontFamily: "inherit",
      whiteSpace: "nowrap",
      transition: "filter .12s,left .16s ease",
      touchAction: "none",
      boxShadow: "0 2px 9px rgba(0,0,0,.58)",
      outline: "none",
      flexShrink: "0",
      letterSpacing: ".2px",
    });
    let drag = null,
      moved = false,
      edgeHideTimer = null;
    const mode = () => (isMobileViewport() ? "mobile" : "desktop");
    const defaultPos = (width = 54, height = 28) => {
      const bounds = viewportBounds();
      if (mode() === "mobile") {
        const anchorRect = communityBuffRect();
        if (anchorRect)
          return {
            left: anchorRect.right + 6,
            top: anchorRect.top + Math.max(0, (anchorRect.height - height) / 2),
            edge: "",
          };
        return { left: bounds.left + 8, top: bounds.top + 8, edge: "" };
      }
      return { left: bounds.left + 130, top: bounds.top + 80, edge: "" };
    };
    const savedPos = (width, height) =>
      readResponsivePosition(Settings.getLauncherPos(), mode()) ||
      defaultPos(width, height);
    const place = (reveal = false) => {
      const width = btn.offsetWidth || 54,
        height = btn.offsetHeight || 28,
        saved = savedPos(width, height),
        bounds = viewportBounds();
      let left = Number(saved.left),
        top = Number(saved.top);
      if (!Number.isFinite(left)) left = defaultPos(width, height).left;
      if (!Number.isFinite(top)) top = defaultPos(width, height).top;
      top = clamp(
        top,
        bounds.top,
        Math.max(bounds.top, bounds.bottom - height),
      );
      if (mode() === "mobile")
        left = clamp(
          left,
          bounds.left,
          Math.max(bounds.left, bounds.right - width),
        );
      else if (saved.edge === "left")
        left = reveal ? bounds.left : bounds.left - (width - 14);
      else if (saved.edge === "right")
        left = reveal
          ? Math.max(bounds.left, bounds.right - width)
          : Math.max(bounds.left, bounds.right - 14);
      else
        left = clamp(
          left,
          bounds.left,
          Math.max(bounds.left, bounds.right - width),
        );
      Object.assign(btn.style, { left: left + "px", top: top + "px" });
    };
    const hideAtEdge = () => {
      if (mode() === "mobile") return;
      if (edgeHideTimer !== null) clearTimeout(edgeHideTimer);
      edgeHideTimer = setTimeout(() => place(false), 350);
    };
    btn._placeLauncher = place;
    btn.addEventListener("mouseenter", () => {
      if (edgeHideTimer !== null) clearTimeout(edgeHideTimer);
      btn.style.filter = "brightness(1.15)";
      place(true);
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.filter = panelOpen ? "brightness(1.15)" : "none";
      if (savedPos().edge) hideAtEdge();
    });
    btn.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      event.stopPropagation();
      if (edgeHideTimer !== null) clearTimeout(edgeHideTimer);
      place(true);
      const rect = btn.getBoundingClientRect();
      drag = {
        id: event.pointerId,
        dx: event.clientX - rect.left,
        dy: event.clientY - rect.top,
        startX: event.clientX,
        startY: event.clientY,
      };
      moved = false;
      if (btn.setPointerCapture)
        try {
          btn.setPointerCapture(event.pointerId);
        } catch (ignore) {}
    });
    btn.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      if (
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4
      )
        moved = true;
      if (!moved) return;
      const width = btn.offsetWidth || 54,
        height = btn.offsetHeight || 28,
        bounds = viewportBounds();
      const left = clamp(
        event.clientX - drag.dx,
        bounds.left,
        Math.max(bounds.left, bounds.right - width),
      );
      const top = clamp(
        event.clientY - drag.dy,
        bounds.top,
        Math.max(bounds.top, bounds.bottom - height),
      );
      btn.style.transition = "none";
      Object.assign(btn.style, { left: left + "px", top: top + "px" });
      event.preventDefault();
    });
    const finishDrag = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const width = btn.offsetWidth || 54,
        rect = btn.getBoundingClientRect(),
        bounds = viewportBounds();
      let edge = "";
      if (mode() !== "mobile") {
        if (rect.left <= bounds.left + 24) edge = "left";
        else if (rect.right >= bounds.right - 24) edge = "right";
      }
      Settings.setLauncherPos(
        writeResponsivePosition(Settings.getLauncherPos(), mode(), {
          left: clamp(
            rect.left,
            bounds.left,
            Math.max(bounds.left, bounds.right - width),
          ),
          top: clamp(
            rect.top,
            bounds.top,
            Math.max(bounds.top, bounds.bottom - (btn.offsetHeight || 28)),
          ),
          edge,
        }),
      );
      drag = null;
      btn.style.transition = "filter .12s,left .16s ease";
      if (edge) hideAtEdge();
    };
    btn.addEventListener("pointerup", finishDrag);
    btn.addEventListener("pointercancel", finishDrag);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (moved) {
        moved = false;
        return;
      }
      toggle(undefined, btn);
    });
    setTimeout(() => place(false), 0);
    return btn;
  }

  // Garantit qu'il n'existe jamais plus d'un bouton KikiMeter dans tout le
  // document, peu importe combien de fois inject() a été appelé. On retrouve
  // l'instance existante par id plutôt que par référence JS, ce qui survit
  // même si la variable tabBtn a été perdue/désynchronisée entre deux appels.
  // C'est ce mécanisme, à lui seul, qui empêche les doublons — peu importe
  // quel conteneur d'onglets est ciblé à un instant donné.
  function dedupeAndGetButton() {
    const all = document.querySelectorAll("#kikimeter-tab-btn");
    all.forEach((b, i) => {
      if (i > 0) b.remove();
    });
    return all[0] || null;
  }

  // Cherche la barre d'onglets de la section Combat OU celle du Labyrinthe.
  // Confirmé par console le 02/07/2026 : "Combat Zones" est présent dans Container 0
  // aussi bien en navigation qu'en combat actif ("Battle #XXXX"). Il est absent de
  // tous les autres containers (Marketplace, Inventory, Chat...). C'est le marqueur
  // natif le plus fiable — indépendant de tout autre script installé.
  // Ajouté le 30/07 : le Labyrinthe utilise le MÊME protocole de combat
  // (new_battle/battle_updated, vérifié par capture) — même bouton, même
  // panneau, juste une deuxième barre d'onglets cible ("Labyrinth"+"Room"+
  // "Automation", combo propre à cette page, absente ailleurs).
  function findCombatTabBar() {
    const containers = [
      ...new Set([
        ...document.querySelectorAll("div." + TAB_CONTAINER_CLASS),
        ...document.querySelectorAll(
          'div[class*="TabsComponent_tabsContainer"]',
        ),
      ]),
    ];
    for (const c of containers) {
      const t = c.textContent;
      if (
        t.includes("Combat Zones") ||
        t.includes("战斗区域") ||
        t.includes("戰鬥區域")
      )
        return c;
      if (
        (t.includes("Labyrinth") &&
          t.includes("Room") &&
          t.includes("Automation")) ||
        (t.includes("迷宫") && (t.includes("房间") || t.includes("自动化"))) ||
        (t.includes("迷宮") && (t.includes("房間") || t.includes("自動化")))
      )
        return c;
      // 公会试炼是非战斗页隐藏规则的唯一例外：只要用户当前选中了试炼
      // 标签便显示入口，方便在报名或排期阶段提前打开面板和消息探针。
      if (isSelectedTrialTabBar(c)) return c;
      // 试炼开始后部分界面会把选中项改为“进行中”；此时入口也必须保留。
      if (isSelectedGuildProgressTabBar(c)) return c;
    }
    return null;
  }

  function setTabButtonStyle(btn) {
    btn.title =
      Settings.getLanguage() === "en" ? "Open DPS meter" : "打开 DPS 统计";
    if (btn._placeLauncher) btn._placeLauncher(false);
  }

  // Injecte (ou déplace) le bouton dans la barre d'onglets combat.
  // Si aucune barre combat n'est trouvée (autre page du jeu), masque le bouton
  // sans le détruire — il réapparaît automatiquement au retour sur Combat.
  function inject() {
    let existing = dedupeAndGetButton();

    // 升级脚本或其他脚本重绘标签栏时，DOM 中可能残留同 ID、但没有本版本
    // 点击监听器的按钮。直接替换该节点，确保“DPS”始终能显示/隐藏面板。
    if (existing && existing.dataset.kikimeterBound !== VERSION) {
      const replacement = buildTabBtn();
      existing.replaceWith(replacement);
      existing = replacement;
    }

    if (existing) {
      existing.style.display = "inline-flex";
      setTabButtonStyle(existing);
      if (existing.parentElement !== document.body)
        document.body.appendChild(existing);
      tabBtn = existing;
      return true;
    }
    tabBtn = buildTabBtn();
    setTabButtonStyle(tabBtn);
    document.body.appendChild(tabBtn);
    return true;
  }

  function init(cb) {
    callbacks = cb;
    if (!panel) panel = buildPanel();
    else if (!panel.isConnected) document.body.appendChild(panel);
    tabBtn = null;
    inject();

    if (reinjector) reinjector.disconnect();
    reinjector = new MutationObserver(() => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        inject();
      }, 200);
    });
    reinjector.observe(document.body, { childList: true, subtree: true });
    if (viewportHandler) {
      window.removeEventListener("resize", viewportHandler);
      window.visualViewport?.removeEventListener("resize", viewportHandler);
    }
    viewportHandler = () => {
      tabBtn?._placeLauncher?.(false);
      placePanel();
    };
    window.addEventListener("resize", viewportHandler);
    window.visualViewport?.addEventListener("resize", viewportHandler);
  }

  function destroy() {
    close();
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    if (reinjector) {
      reinjector.disconnect();
      reinjector = null;
    }
    if (viewportHandler) {
      window.removeEventListener("resize", viewportHandler);
      window.visualViewport?.removeEventListener("resize", viewportHandler);
      viewportHandler = null;
    }
    document
      .querySelectorAll("#kikimeter-tab-btn")
      .forEach((button) => button.remove());
    document.querySelector("#kikimeter-segment-menu")?.remove();
    document.querySelector("#kikimeter-class-picker")?.remove();
    if (panel) panel.remove();
    tabBtn = null;
  }

  // Rendu de la liste des joueurs dans le panneau.
  // Ne reconstruit le DOM que si la liste change (évite le clignotement des swatches).
  function renderPlayers(
    names,
    getDps,
    getDmg,
    getHps,
    getKills,
    getSharePct,
    getColor,
  ) {
    if (!playersListEl) return;
    const rows = names
      .map((name) => ({
        name,
        value: getDmg(name),
        ps: getDps(name),
        pct: getSharePct(name),
        rateLabel: "DPS",
      }))
      .sort((a, b) => b.value - a.value);
    renderDetailsRows(playersListEl, rows, () =>
      renderPlayers(
        names,
        getDps,
        getDmg,
        getHps,
        getKills,
        getSharePct,
        getColor,
      ),
    );
  }

  function renderView(view) {
    refreshSegmentSelect(segmentSelect);
    refreshModeTabs();
    refreshToolbarLanguage();
    if (titleEl)
      titleEl.textContent =
        Settings.getLanguage() === "en"
          ? mainMode === "hps"
            ? "Healing"
            : mainMode === "taken"
              ? "Damage Taken"
              : mainMode === "debug"
                ? "Class Debug"
                : "Damage Done"
          : mainMode === "hps"
            ? "恢复量"
            : mainMode === "taken"
              ? "承受伤害"
              : mainMode === "debug"
                ? "职业调试"
                : "伤害输出";
    if (mainGraphObj) mainGraphObj.render(view.graphPoints || []);
    if (trialClassNotice)
      trialClassNotice.style.display =
        mainMode !== "debug" && view.type === "trial" ? "block" : "none";
    if (mainMode === "debug") {
      playersListEl.innerHTML = "";
      const hint = el("div", {
        fontSize: "11px",
        lineHeight: "1.55",
        color: "rgba(255,255,255,.76)",
        marginBottom: "7px",
      });
      hint.textContent = langText(
        "全量探针会从点击开始持续被动记录全部游戏入站消息，直到你手动结束；不会主动发送任何请求。聊天正文和凭证字段会脱敏，结束后请在刷新页面前下载。",
        "The full probe passively records all incoming game messages after you start it until you stop it manually. It sends no requests. Chat content and credential fields are redacted; download the capture before refreshing the page.",
      );
      const probeStatus = ClassProbe.status();
      const probeButtons = el("div", {
        display: "flex",
        gap: "5px",
        marginBottom: "7px",
      });
      const startProbe = document.createElement("button");
      startProbe.textContent = probeStatus.active
        ? langText("全量采集中…", "Capturing…")
        : langText("开始全量采集", "Start full capture");
      startProbe.disabled = probeStatus.active;
      const stopProbe = document.createElement("button");
      stopProbe.textContent = langText("结束采集", "Stop capture");
      stopProbe.disabled = !probeStatus.active;
      const downloadProbe = document.createElement("button");
      downloadProbe.textContent = langText(
        "⬇ 下载全量 MSG",
        "⬇ Download full messages",
      );
      downloadProbe.disabled = probeStatus.active || !probeStatus.startedAt;
      [startProbe, stopProbe, downloadProbe].forEach((button) =>
        Object.assign(button.style, {
          flex: "1",
          cursor: button.disabled ? "default" : "pointer",
          padding: "5px 2px",
          fontSize: "9px",
          borderRadius: "3px",
          border: "1px solid rgba(255,255,255,.18)",
          background: "rgba(255,255,255,.07)",
          color: "#e8eaf6",
          opacity: button.disabled ? ".45" : "1",
        }),
      );
      // Debug 页面会随实时统计频繁重绘；mousedown 在节点被下一次渲染替换前
      // 立即触发，避免普通 click 因按下和松开之间按钮被替换而偶发失效。
      startProbe.addEventListener("mousedown", (event) => {
        event.preventDefault();
        if (!startProbe.disabled) ClassProbe.start();
      });
      stopProbe.addEventListener("mousedown", (event) => {
        event.preventDefault();
        if (!stopProbe.disabled) ClassProbe.stop();
      });
      downloadProbe.addEventListener("mousedown", (event) => {
        event.preventDefault();
        if (downloadProbe.disabled) return;
        if (ClassProbe.download()) {
          downloadProbe.textContent = langText("✓ 已下载", "✓ Downloaded");
          setTimeout(
            () =>
              (downloadProbe.textContent = langText(
                "⬇ 下载全量 MSG",
                "⬇ Download full messages",
              )),
            1500,
          );
        }
      });
      probeButtons.append(startProbe, stopProbe, downloadProbe);
      const report = el("pre", {
        margin: "0 0 7px",
        padding: "7px",
        maxHeight: "210px",
        overflow: "auto",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        background: "rgba(0,0,0,.35)",
        border: "1px solid rgba(255,255,255,.12)",
        borderRadius: "3px",
        fontSize: "9px",
        lineHeight: "1.45",
      });
      report.textContent = probeStatus.active
        ? langText(
            `全量探针正在采集，已记录 ${probeStatus.messageCount} 条消息，正文约 ${(probeStatus.captureChars / 1024 / 1024).toFixed(2)} MB；点击“结束采集”才会停止。`,
            `The full probe is capturing. ${probeStatus.messageCount} messages recorded (${(probeStatus.captureChars / 1024 / 1024).toFixed(2)} MB). Click “Stop capture” to stop it.`,
          )
        : probeStatus.startedAt
          ? ClassProbe.report().slice(0, 6000)
          : ClassDebug.report();
      const buttons = el("div", { display: "flex", gap: "6px" });
      const copy = document.createElement("button");
      copy.textContent = langText(
        "📋 复制完整探针报告",
        "📋 Copy full probe report",
      );
      const clear = document.createElement("button");
      clear.textContent = langText("清空报告", "Clear report");
      [copy, clear].forEach((button) =>
        Object.assign(button.style, {
          flex: "1",
          cursor: "pointer",
          padding: "5px",
          fontSize: "10px",
          borderRadius: "3px",
          border: "1px solid rgba(255,255,255,.18)",
          background: "rgba(255,255,255,.07)",
          color: "#e8eaf6",
        }),
      );
      copy.addEventListener("click", () =>
        navigator.clipboard
          .writeText(ClassProbe.report())
          .then(() => {
            copy.textContent = langText("✓ 已复制", "✓ Copied");
            setTimeout(
              () =>
                (copy.textContent = langText(
                  "📋 复制完整探针报告",
                  "📋 Copy full probe report",
                )),
              1500,
            );
          })
          .catch(() => {}),
      );
      clear.addEventListener("click", () => {
        ClassDebug.clear();
        ClassProbe.clear();
        renderView(ViewData.get());
      });
      buttons.append(copy, clear);
      playersListEl.append(hint, probeButtons, report, buttons);
      return;
    }
    const total =
      mainMode === "hps"
        ? (view.players || []).reduce(
            (sum, p) => sum + (Number(p.healing) || 0),
            0,
          )
        : mainMode === "taken"
          ? (view.players || []).reduce(
              (sum, p) => sum + (Number(p.taken) || 0),
              0,
            )
          : view.teamDamage;
    const rows = (view.players || [])
      .map((p) => ({
        name: p.name,
        synthetic: p.synthetic,
        value:
          mainMode === "hps"
            ? Number(p.healing) || 0
            : mainMode === "taken"
              ? Number(p.taken) || 0
              : Number(p.damage) || 0,
        ps:
          mainMode === "hps"
            ? Number(p.hps) || 0
            : mainMode === "taken"
              ? Number(p.takenPs) || 0
              : Number(p.dps) || 0,
        pct:
          total > 0
            ? ((mainMode === "hps"
                ? Number(p.healing) || 0
                : mainMode === "taken"
                  ? Number(p.taken) || 0
                  : Number(p.damage) || 0) *
                100) /
              total
            : 0,
        rateLabel:
          mainMode === "hps" ? "HPS" : mainMode === "taken" ? "DTPS" : "DPS",
        breakdown:
          mainMode === "dps"
            ? p.breakdown
            : mainMode === "taken"
              ? p.takenBreakdown
              : null,
        breakdownTitle:
          mainMode === "taken"
            ? Settings.getLanguage() === "en"
              ? "Damage Taken Sources"
              : "承伤来源"
            : undefined,
        breakdownRateLabel: mainMode === "taken" ? "DTPS" : "DPS",
        breakdownHover:
          mainMode === "taken"
            ? Settings.getLanguage() === "en"
              ? "Hover to view monster and skill sources"
              : "悬停查看怪物与技能来源"
            : undefined,
        breakdownEmpty:
          mainMode === "taken"
            ? Settings.getLanguage() === "en"
              ? "No damage-taken sources"
              : "暂无承伤来源"
            : undefined,
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
    renderDetailsRows(playersListEl, rows, () => renderView(ViewData.get()));
  }

  // Formate une entrée d'historique comme texte lisible pour le presse-papier.
  function entryToText(entry) {
    const d = new Date(entry.date);
    const dateStr =
      d.toLocaleDateString() +
      " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const dur = formatDuration(entry.durationSeconds);
    const total = entry.teamDamage;
    let out = langText(
      `=== KikiMeter 战斗记录｜${dateStr}｜${dur} ===\n`,
      `=== KikiMeter Combat Record | ${dateStr} | ${dur} ===\n`,
    );
    out += langText(
      `团队：${formatRate(entry.teamDps || 0)} DPS｜总伤害 ${formatDamage(total || 0)}`,
      `Team: ${formatRate(entry.teamDps || 0)} DPS | Total damage ${formatDamage(total || 0)}`,
    );
    if (entry.teamKills > 0)
      out += langText(
        `｜击杀 ${entry.teamKills}`,
        ` | Kills ${entry.teamKills}`,
      );
    out += "\n";
    (entry.players || []).forEach((p) => {
      const pct = total > 0 ? ((p.damage / total) * 100).toFixed(0) : "0";
      const name = p.name.padEnd(12).slice(0, 12);
      out +=
        name +
        langText("：", ": ") +
        formatRate(p.dps || 0).padStart(6) +
        langText(" DPS｜", " DPS | ");
      out += formatDamage(p.damage).padStart(7) + " (" + pct + "%)";
      if (p.kills > 0)
        out += langText(`｜击杀 ${p.kills}`, ` | Kills ${p.kills}`);
      if (p.hps > 0.1)
        out += langText(
          `｜HPS ${formatRate(p.hps)}`,
          ` | HPS ${formatRate(p.hps)}`,
        );
      out += "\n";
    });
    return out;
  }

  // Rendu de la liste d'historique dans le conteneur dépliable.
  function renderHistory(container) {
    container.innerHTML = "";

    // Sélecteur de type — pastilles façon onglet, cohérent avec le reste
    // de l'UI. Labyrinth branché le 30/07 : même protocole de combat que
    // le monde ouvert (new_battle/battle_updated identiques), distingué
    // via labyrinth_updated.isActive pour le tag d'historique uniquement.
    const TYPES = [
      { id: "combat", label: langText("普通战斗", "Combat") },
      { id: "trial", label: langText("公会试炼", "Guild Trial") },
      { id: "labyrinth", label: langText("迷宫", "Labyrinth") },
    ];
    const filterRow = el("div", {
      display: "flex",
      gap: "4px",
      marginBottom: "8px",
    });
    TYPES.forEach((t) => {
      const btn = document.createElement("button");
      btn.textContent = t.label;
      const active = historyFilter === t.id;
      Object.assign(btn.style, {
        flex: "1",
        cursor: "pointer",
        fontSize: "11px",
        padding: "4px 0",
        borderRadius: "4px",
        border: "none",
        fontWeight: active ? "700" : "400",
        background: active ? ACCENT : "rgba(255,255,255,.08)",
        color: active ? "#fff" : "rgba(255,255,255,.65)",
        transition: "background .12s",
      });
      btn.addEventListener("click", () => {
        historyFilter = t.id;
        renderHistory(container);
      });
      filterRow.appendChild(btn);
    });
    container.appendChild(filterRow);

    const entries = HistoryStore.getAll(historyFilter);
    if (!entries.length) {
      const empty = el("div", {
        opacity: ".5",
        fontSize: "11px",
        padding: "6px 0",
      });
      empty.textContent = langText(
        "还没有保存的战斗记录。",
        "No saved combat records yet.",
      );
      container.appendChild(empty);
      return;
    }
    entries.forEach((entry, idx) => {
      const d = new Date(entry.date || entry.startedAt);
      const dateStr =
        d.toLocaleDateString() +
        " " +
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      const block = el("div", {
        marginBottom: "8px",
        paddingBottom: "8px",
        borderBottom:
          idx < entries.length - 1 ? "1px solid rgba(255,255,255,.07)" : "none",
      });

      // En-tête : date + durée + bouton copie
      const header = el("div", {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "2px",
      });
      const dateEl = el("span", {
        fontSize: "11px",
        color: "#a5b4fc",
        fontWeight: "bold",
      });
      dateEl.textContent =
        dateStr +
        " · " +
        formatDuration(entry.durationSeconds || entry.durationMs / 1000 || 0);
      const copyEntryBtn = el("button", {
        fontSize: "10px",
        cursor: "pointer",
        background: "transparent",
        color: "#93c5fd",
        border: "none",
        padding: "0 2px",
      });
      copyEntryBtn.textContent = "📋";
      copyEntryBtn.title = langText("复制这场战斗", "Copy this combat record");
      copyEntryBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(entryToText(entry)).catch(() => {});
        copyEntryBtn.textContent = "✓";
        setTimeout(() => {
          copyEntryBtn.textContent = "📋";
        }, 1500);
      });
      header.append(dateEl, copyEntryBtn);
      block.appendChild(header);

      // Résumé équipe
      const teamLine = el("div", {
        fontSize: "11px",
        opacity: ".75",
        marginBottom: "3px",
      });
      teamLine.textContent = langText(
        `团队：${formatRate(entry.teamDps || 0)} DPS · ${formatDamage(entry.teamDamage || 0)}${entry.teamKills > 0 ? ` · ${entry.teamKills} 次击杀` : ""} · ${(entry.fragments || []).length || 1} 个片段`,
        `Team: ${formatRate(entry.teamDps || 0)} DPS · ${formatDamage(entry.teamDamage || 0)}${entry.teamKills > 0 ? ` · ${entry.teamKills} kills` : ""} · ${(entry.fragments || []).length || 1} fragments`,
      );
      block.appendChild(teamLine);

      if ((entry.fragments || []).length > 1) {
        const details = document.createElement("details");
        details.dataset.kikimeter = "true";
        const summary = document.createElement("summary");
        summary.textContent = langText(
          "查看断线续传片段",
          "View reconnect fragments",
        );
        summary.style.cursor = "pointer";
        details.appendChild(summary);
        entry.fragments.forEach((f, i) => {
          const line = el("div", {
            fontSize: "10px",
            opacity: ".65",
            paddingLeft: "9px",
          });
          line.textContent = langText(
            `片段 ${i + 1}｜${f.reason || "战斗"}｜${formatDuration((f.durationMs || 0) / 1000)}｜伤害 ${formatDamage(f.teamDamage || 0)}`,
            `Fragment ${i + 1} | ${localizeReason(f.reason)} | ${formatDuration((f.durationMs || 0) / 1000)} | Damage ${formatDamage(f.teamDamage || 0)}`,
          );
          details.appendChild(line);
        });
        block.appendChild(details);
      }

      // Joueurs
      (entry.players || []).forEach((p) => {
        if (p.classId) ClassSystem.setDetected(p.name, p.classId);
        const pct =
          entry.teamDamage > 0
            ? ((p.damage / entry.teamDamage) * 100).toFixed(0)
            : "0";
        const pLine = el("div", {
          fontSize: "11px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        });
        const icon = iconElement(
          ClassSystem.get(p.name).icon,
          ClassSystem.get(p.name).label,
        );
        Object.assign(icon.style, {
          width: "15px",
          height: "15px",
          objectFit: "contain",
        });
        const nameEl = el("span", { color: "#e8eaf6" });
        nameEl.textContent = p.name;
        const statsEl = el("span", { opacity: ".7", marginLeft: "auto" });
        statsEl.textContent =
          formatRate(p.dps || 0) +
          langText("/秒 · ", "/s · ") +
          formatDamage(p.damage || 0) +
          " (" +
          pct +
          "%)";
        pLine.append(icon, nameEl, statsEl);
        block.appendChild(pLine);
      });

      container.appendChild(block);
    });

    // Bouton vider l'historique — ne touche QUE le type actuellement affiché,
    // pas les autres catégories.
    const clearBtn = document.createElement("button");
    clearBtn.textContent = langText(
      `清空${(TYPES.find((t) => t.id === historyFilter) || {}).label}记录`,
      `Clear ${(TYPES.find((t) => t.id === historyFilter) || {}).label} records`,
    );
    Object.assign(clearBtn.style, {
      width: "100%",
      cursor: "pointer",
      background: "transparent",
      color: "rgba(255,255,255,.3)",
      border: "1px solid rgba(255,255,255,.15)",
      borderRadius: "4px",
      padding: "4px",
      fontSize: "11px",
      marginTop: "4px",
    });
    clearBtn.addEventListener("click", () => {
      HistoryStore.clear(historyFilter);
      renderHistory(container);
    });
    container.appendChild(clearBtn);
  }

  return {
    init,
    destroy,
    toggle,
    close,
    isOpen: () => panelOpen,
    renderPlayers,
    renderView,
    refreshSegments: () => refreshSegmentSelect(segmentSelect),
  };
})();

export { KikiMeter };
