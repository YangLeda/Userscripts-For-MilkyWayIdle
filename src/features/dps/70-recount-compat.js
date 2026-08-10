import { Settings } from "./00-bootstrap.js";
import {
  ViewData,
  buildSegmentPicker,
  refreshSegmentSelect,
} from "./30-history.js";
import {
  buildDetailsGraph,
  buildGraph,
  renderDetailsRows,
} from "./50-graph-components.js";
import { KikiMeter } from "./60-main-panel.js";

// ─── Wiring ───────────────────────────────────────────────────────────────────

// ─── RecountPanel : classement compact style Recount (WoW) ───────────────────
// Pensé pour les Guild Trials (40+ joueurs) où le panneau principal et les
// badges par personnage ne suffisent plus. Fenêtre déplaçable, liste scrollable,
// barres proportionnelles au leader, tri Damage Done / Healing / Damage Taken.
// S'ouvre automatiquement quand une vague arrive avec plus de 10 joueurs,
// toggle manuel via le bouton 📊 du panneau principal.
const RecountPanel = (() => {
  const MODES = [
    { id: "dmg", label: "造成伤害", value: "damage", perSecond: "dps" },
    { id: "heal", label: "恢复量", value: "healing", perSecond: "hps" },
    { id: "taken", label: "承受伤害", value: "taken", perSecond: "takenPs" },
  ];
  let root = null,
    listEl = null,
    titleEl = null,
    segmentSelect = null,
    modeIdx = 0,
    open = false,
    graphObj = null,
    graphWrap = null;
  // Noms mis en gras par clic sur leur ligne (persiste entre les rendus,
  // remis à zéro seulement si le module est reconstruit — cf. build()).
  const highlighted = new Set();

  function modeById(id) {
    const i = MODES.findIndex((m) => m.id === id);
    return i >= 0 ? i : 0;
  }

  function toggleGraph() {
    const show = !Settings.getRecountShowGraph();
    Settings.setRecountShowGraph(show);
    if (graphWrap) graphWrap.style.display = show ? "block" : "none";
  }

  function build() {
    if (root) return;
    modeIdx = modeById(Settings.getRecountMode());
    root = document.createElement("div");
    root.dataset.kikimeter = "true"; // exclusion des scans DOM (scanGuildNames…)
    Object.assign(root.style, {
      position: "fixed",
      zIndex: "9999",
      background: "linear-gradient(180deg,rgba(24,24,24,.98),rgba(8,8,8,.98))",
      border: "1px solid rgba(212,175,55,.58)",
      borderRadius: "5px",
      fontSize: "11px",
      color: "#f2f2f2",
      boxShadow: "0 4px 16px rgba(0,0,0,.6)",
      userSelect: "none",
    });
    const pos = Settings.getRecountPos();
    const size = Settings.getRecountSize() || { width: 270, height: 430 };
    const initialWidth = Math.max(
      120,
      Math.min(size.width, window.innerWidth - 16),
    );
    const initialLeft = pos && pos.left != null ? pos.left : 12;
    root.style.left =
      Math.max(0, Math.min(initialLeft, window.innerWidth - initialWidth)) +
      "px";
    root.style.top = pos && pos.top != null ? pos.top + "px" : "90px";
    root.style.width = initialWidth + "px";
    root.style.maxWidth = "calc(100vw - 8px)";
    root.style.boxSizing = "border-box";

    // ── Header : titre du mode + boutons de tri + fermer ; sert de poignée drag.
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "4px 6px",
      cursor: "move",
      background: "rgba(255,255,255,.07)",
      borderRadius: "6px 6px 0 0",
      fontWeight: "bold",
    });
    titleEl = document.createElement("span");
    const btns = document.createElement("span");
    const mkBtn = (txt, tip, fn) => {
      const b = document.createElement("button");
      b.textContent = txt;
      b.title = tip;
      Object.assign(b.style, {
        cursor: "pointer",
        background: "transparent",
        color: "rgba(255,255,255,.6)",
        border: "none",
        font: "12px monospace",
        padding: "0 3px",
      });
      b.addEventListener("mouseenter", () => (b.style.color = "#fff"));
      b.addEventListener(
        "mouseleave",
        () => (b.style.color = "rgba(255,255,255,.6)"),
      );
      b.addEventListener("mousedown", (e) => e.stopPropagation()); // ne pas drag
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        fn();
      });
      return b;
    };
    btns.appendChild(mkBtn("⚔", "造成伤害", () => setMode(0)));
    btns.appendChild(mkBtn("✚", "恢复量", () => setMode(1)));
    btns.appendChild(mkBtn("🛡", "承受伤害", () => setMode(2)));
    const graphBtn = mkBtn("📈", "显示或隐藏趋势图", () => toggleGraph());
    btns.appendChild(graphBtn);
    btns.appendChild(mkBtn("✕", "关闭", () => toggle(false)));
    header.append(titleEl, btns);
    root.appendChild(header);

    segmentSelect = buildSegmentPicker(() => {
      KikiMeter.refreshSegments();
      render();
    });
    Object.assign(segmentSelect.style, {
      display: "block",
      width: "calc(100% - 8px)",
      margin: "4px",
      boxSizing: "border-box",
      flex: "none",
    });
    root.appendChild(segmentSelect);

    // ── Liste scrollable (40+ joueurs).
    listEl = document.createElement("div");
    Object.assign(listEl.style, {
      maxHeight: size.height + "px",
      overflowY: "auto",
      padding: "3px",
    });
    root.appendChild(listEl);

    // ── Courbe de dégâts totaux, APRÈS la liste (demandé) — mêmes données/
    // rendu que le panneau principal, réutilise buildGraph() telle quelle.
    // Visibilité indépendante du réglage global "Show DPS graph" : bouton
    // 📈 dédié dans l'en-tête, état persisté (Settings.getRecountShowGraph).
    graphObj = buildDetailsGraph();
    graphWrap = document.createElement("div");
    Object.assign(graphWrap.style, { padding: "4px 6px 6px 6px" });
    graphWrap.appendChild(graphObj.canvas);
    graphWrap.style.display = Settings.getRecountShowGraph() ? "block" : "none";
    root.appendChild(graphWrap);

    // ── Poignée de redimensionnement (coin bas-droit), taille persistée.
    const resizer = document.createElement("div");
    Object.assign(resizer.style, {
      position: "absolute",
      right: "0",
      bottom: "0",
      width: "14px",
      height: "14px",
      cursor: "nwse-resize",
      background: "transparent",
    });
    // Petit triangle visuel pour indiquer la poignée.
    resizer.innerHTML =
      '<svg width="10" height="10" style="position:absolute;right:2px;bottom:2px;opacity:.4">' +
      '<path d="M10 0 L10 10 L0 10 Z" fill="currentColor"/></svg>';
    root.appendChild(resizer);
    let resize = null;
    const MIN_W = 180,
      MAX_W = 520,
      MIN_H = 100,
      MAX_H = 800;
    resizer.addEventListener("mousedown", (e) => {
      resize = {
        sx: e.clientX,
        sy: e.clientY,
        sw: root.offsetWidth,
        sh: listEl.offsetHeight,
      };
      e.preventDefault();
      e.stopPropagation();
    });
    window.addEventListener("mousemove", (e) => {
      if (!resize) return;
      const maxWidth = Math.max(120, Math.min(MAX_W, window.innerWidth - 8));
      const w = Math.min(
        maxWidth,
        Math.max(
          Math.min(MIN_W, maxWidth),
          resize.sw + (e.clientX - resize.sx),
        ),
      );
      const h = Math.min(
        MAX_H,
        Math.max(MIN_H, resize.sh + (e.clientY - resize.sy)),
      );
      root.style.width = w + "px";
      listEl.style.maxHeight = h + "px";
    });
    window.addEventListener("mouseup", () => {
      if (!resize) return;
      resize = null;
      Settings.setRecountSize({
        width: root.offsetWidth,
        height: listEl.offsetHeight,
      });
    });

    // ── Drag via le header, position persistée.
    let drag = null;
    header.addEventListener("mousedown", (e) => {
      drag = {
        dx: e.clientX - root.offsetLeft,
        dy: e.clientY - root.offsetTop,
      };
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!drag) return;
      root.style.left =
        Math.max(
          0,
          Math.min(e.clientX - drag.dx, window.innerWidth - root.offsetWidth),
        ) + "px";
      root.style.top = Math.max(0, e.clientY - drag.dy) + "px";
    });
    window.addEventListener("mouseup", () => {
      if (!drag) return;
      drag = null;
      Settings.setRecountPos({ left: root.offsetLeft, top: root.offsetTop });
    });

    document.body.appendChild(root);
    root.style.display = "none";
  }

  function setMode(i) {
    modeIdx = i;
    Settings.setRecountMode(MODES[i].id);
    render();
  }

  function toggle(v) {
    build();
    open = v === undefined ? !open : v;
    if (open) KikiMeter.close();
    root.style.display = open ? "block" : "none";
    if (open) render();
    return open;
  }

  function render(view = ViewData.get()) {
    if (!open || !root) return;
    refreshSegmentSelect(segmentSelect);
    if (graphObj && Settings.getRecountShowGraph())
      graphObj.render(view.graphPoints || []);
    const mode = MODES[modeIdx];
    titleEl.textContent = mode.label;
    const rows = (view.players || [])
      .map((p) => ({
        n: p.name,
        v: Number(p[mode.value]) || 0,
        ps: Number(p[mode.perSecond]) || 0,
        breakdown:
          mode.id === "dmg"
            ? p.breakdown
            : mode.id === "taken"
              ? p.takenBreakdown
              : null,
      }))
      .filter((r) => r.v > 0)
      .sort((a, b) => b.v - a.v);
    const total = rows.reduce((s, r) => s + r.v, 0) || 1;
    const max = rows.length ? rows[0].v : 1;

    renderDetailsRows(
      listEl,
      rows.map((r) => ({
        name: r.n,
        value: r.v,
        ps: r.ps,
        pct: (100 * r.v) / total,
        breakdown: r.breakdown,
        rateLabel:
          mode.id === "heal" ? "HPS" : mode.id === "taken" ? "DTPS" : "DPS",
        breakdownTitle:
          mode.id === "taken"
            ? Settings.getLanguage() === "en"
              ? "Damage Taken Sources"
              : "承伤来源"
            : undefined,
        breakdownRateLabel: mode.id === "taken" ? "DTPS" : "DPS",
      })),
      render,
    );
  }

  return { toggle, render, isOpen: () => open };
})();

export { RecountPanel };
