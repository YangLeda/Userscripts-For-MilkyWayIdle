import {
  ACCENT,
  Settings,
  el,
  formatDamage,
  formatRate,
  iconElement,
} from "./00-bootstrap.js";
import { ClassSystem, DamageSources } from "./10-combat-sources.js";
import { Session } from "./20-session.js";

// ─── DPS Graph ────────────────────────────────────────────────────────────────
const BOSS_COLOR = "#FF3F34";
const langText = (zh, en) => (Settings.getLanguage() === "en" ? en : zh);

function buildGraph() {
  // Durée d'un bucket — DOIT correspondre à Session.BUCKET_MS (2000ms).
  // Constante locale car buildGraph() est un module séparé de Session et n'a
  // pas accès à sa constante interne (bug corrigé le 31/07 : référence à
  // BUCKET_MS non définie dans cette portée → ReferenceError à chaque appel
  // de render(), plantant toute la boucle de rendu — graphe ET badges KO).
  const GRAPH_BUCKET_MS = 2000;
  const canvas = document.createElement("canvas");
  // Dimensions augmentées pour accueillir les axes.
  // Coordonnées internes doublées pour rendu net sur écrans haute densité.
  const CW = 440,
    CH = 160;
  canvas.width = CW;
  canvas.height = CH;
  Object.assign(canvas.style, {
    width: "100%",
    height: "80px",
    display: "block",
    borderRadius: "4px",
    background: "rgba(0,0,0,0.3)",
  });

  // Marges internes (en pixels canvas, soit 2× les pixels CSS)
  const PAD = { top: 14, right: 8, bottom: 22, left: 50 };
  const DW = CW - PAD.left - PAD.right; // largeur zone de dessin
  const DH = CH - PAD.top - PAD.bottom; // hauteur zone de dessin

  // Calcule un intervalle "joli" pour les graduations Y.
  function niceInterval(maxVal, targetTicks) {
    if (maxVal <= 0) return 100;
    const raw = maxVal / targetTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const frac = raw / mag;
    let nice;
    if (frac < 1.5) nice = 1;
    else if (frac < 3.5) nice = 2;
    else if (frac < 7.5) nice = 5;
    else nice = 10;
    return nice * mag;
  }

  function render(points) {
    canvas.style.display = "block";
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, CW, CH);

    // Lissage sur ~16 secondes (BUCKET_MS=2s → fenêtre de 8 buckets glissants).
    // Réduit l'effet "pic" visible lors des bursts courts tout en restant réactif.
    const SMOOTH = 8;
    const smoothed = points.map((p, i) => {
      let sum = 0,
        count = 0;
      for (let k = Math.max(0, i - SMOOTH + 1); k <= i; k++) {
        sum += points[k].dps;
        count++;
      }
      return { dps: sum / count, isBoss: p.isBoss };
    });

    const N = smoothed.length;
    const max = Math.max(...smoothed.map((p) => p.dps), 1);

    // Intervalle Y et nombre de lignes
    const yInterval = niceInterval(max, 4);
    const yMax = Math.ceil(max / yInterval) * yInterval;

    function xOf(i) {
      return PAD.left + (i / (N - 1)) * DW;
    }
    function yOf(v) {
      return PAD.top + DH * (1 - v / yMax);
    }

    // Grille Y + labels
    ctx.font = "18px monospace";
    ctx.textAlign = "right";
    for (let v = 0; v <= yMax; v += yInterval) {
      const y = yOf(v);
      // Ligne de grille
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + DW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Label
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      const label =
        v >= 1000
          ? (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + "k"
          : String(Math.round(v));
      ctx.fillText(label, PAD.left - 4, y + 6);
    }

    // Grille X — intervalle ADAPTATIF selon la durée totale affichée :
    // 1 min pour le panneau principal (5 min fixes, comportement inchangé),
    // jusqu'à 10 min pour le graphe Trial (jusqu'à ~1h, non plafonné à 5 min
    // depuis la v3.11.1) — sinon soit illisible (trop de labels sur 1h),
    // soit les 3/4 de la courbe resteraient sans aucune graduation.
    // La grille X est tracée de droite à gauche (le point le plus récent = droite).
    const totalMinutes = (N * GRAPH_BUCKET_MS) / 60000;
    let stepMin;
    if (totalMinutes <= 6) stepMin = 1;
    else if (totalMinutes <= 15) stepMin = 2;
    else if (totalMinutes <= 30) stepMin = 5;
    else stepMin = 10;
    const bucketsPerStep = Math.round((stepMin * 60000) / GRAPH_BUCKET_MS);
    ctx.font = "17px monospace";
    ctx.textAlign = "center";
    for (let step = 1; ; step++) {
      const bucketIdx = N - 1 - step * bucketsPerStep;
      if (bucketIdx < 0) break;
      const x = xOf(bucketIdx);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + DH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillText("-" + step * stepMin + "m", x, CH - 4);
    }
    // Label "now" à droite
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillText("now", CW - 2, CH - 4);

    // Courbe — segments colorés par type de combat (teal normal / rouge boss)
    let segColor = null;
    const coords = smoothed.map((p, i) => ({
      x: xOf(i),
      y: yOf(p.dps),
      isBoss: p.isBoss,
    }));
    coords.forEach((pt, i) => {
      const color = pt.isBoss ? BOSS_COLOR : ACCENT;
      if (color !== segColor) {
        if (segColor !== null) ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        if (i > 0) ctx.moveTo(coords[i - 1].x, coords[i - 1].y);
        else ctx.moveTo(pt.x, pt.y);
        segColor = color;
      }
      ctx.lineTo(pt.x, pt.y);
    });
    if (segColor !== null) ctx.stroke();

    // Remplissage sous la courbe
    [false, true].forEach((bossFlag) => {
      ctx.fillStyle = bossFlag
        ? "rgba(255,63,52,0.12)"
        : "rgba(0,116,116,0.12)";
      ctx.beginPath();
      let started = false;
      coords.forEach((pt, i) => {
        if (pt.isBoss !== bossFlag) {
          if (started) {
            ctx.lineTo(pt.x, PAD.top + DH);
            ctx.closePath();
            ctx.fill();
            started = false;
          }
          return;
        }
        if (!started) {
          ctx.beginPath();
          ctx.moveTo(pt.x, PAD.top + DH);
          started = true;
        }
        ctx.lineTo(pt.x, pt.y);
      });
      if (started) {
        ctx.lineTo(coords[N - 1].x, PAD.top + DH);
        ctx.closePath();
        ctx.fill();
      }
    });

    // Bordure gauche et basse de la zone de dessin
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.moveTo(PAD.left, PAD.top);
    ctx.lineTo(PAD.left, PAD.top + DH);
    ctx.lineTo(PAD.left + DW, PAD.top + DH);
    ctx.stroke();
  }

  return { canvas, render };
}

// Details 风格团队 DPS 趋势：响应面板宽度并按设备像素比绘制，保留
// Boss 红色区段，同时用金色渐变、峰值与当前值替代旧版潦草折线。
function buildDetailsGraph() {
  const GRAPH_BUCKET_MS = 2000,
    CSS_HEIGHT = 112,
    canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    width: "100%",
    height: CSS_HEIGHT + "px",
    display: "block",
    borderRadius: "5px",
    boxSizing: "border-box",
    background: "linear-gradient(180deg,rgba(18,22,28,.94),rgba(6,8,12,.94))",
    border: "1px solid rgba(212,175,55,.24)",
  });
  function niceInterval(maxValue, targetTicks = 3) {
    if (maxValue <= 0) return 1;
    const raw = maxValue / targetTicks,
      mag = 10 ** Math.floor(Math.log10(raw)),
      fraction = raw / mag;
    return (
      (fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10) * mag
    );
  }
  function traceSmooth(ctx, coords) {
    if (!coords.length) return;
    ctx.moveTo(coords[0].x, coords[0].y);
    for (let index = 1; index < coords.length; index++) {
      const previous = coords[index - 1],
        point = coords[index],
        middle = (previous.x + point.x) / 2;
      ctx.bezierCurveTo(middle, previous.y, middle, point.y, point.x, point.y);
    }
  }
  function durationLabel(seconds, english) {
    if (seconds >= 60)
      return "-" + Math.round(seconds / 60) + (english ? "m" : "分");
    return "-" + Math.round(seconds) + (english ? "s" : "秒");
  }
  function render(rawPoints) {
    const points = Array.isArray(rawPoints) ? rawPoints : [],
      english = Settings.getLanguage() === "en";
    const width = Math.max(
        240,
        Math.round(canvas.getBoundingClientRect().width || 320),
      ),
      height = CSS_HEIGHT;
    const ratio = Math.max(
      1,
      Math.min(Number(window.devicePixelRatio) || 1, 2),
    );
    if (
      canvas.width !== Math.round(width * ratio) ||
      canvas.height !== Math.round(height * ratio)
    ) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    canvas.title = english
      ? "Smoothed total team DPS trend; red areas indicate boss combat."
      : "平滑后的团队总 DPS 趋势；红色区段表示 Boss 战斗。";
    const padding = { top: 27, right: 10, bottom: 19, left: 39 },
      drawWidth = width - padding.left - padding.right,
      drawHeight = height - padding.top - padding.bottom;
    ctx.font = "600 9px 'Microsoft YaHei','Noto Sans SC',sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.textAlign = "left";
    ctx.fillText(english ? "TEAM DPS TREND" : "团队 DPS 趋势", 10, 13);
    if (!points.length) {
      ctx.fillStyle = "rgba(255,255,255,.34)";
      ctx.textAlign = "center";
      ctx.font = "10px 'Microsoft YaHei','Noto Sans SC',sans-serif";
      ctx.fillText(
        english ? "Waiting for combat data" : "等待战斗数据",
        width / 2,
        62,
      );
      return;
    }
    const smoothWindow = Math.max(
      2,
      Math.min(6, Math.round(points.length / 20) || 2),
    );
    const smoothed = points.map((point, index) => {
      let weighted = 0,
        weightTotal = 0;
      for (let i = Math.max(0, index - smoothWindow + 1); i <= index; i++) {
        const weight = i - (index - smoothWindow);
        weighted += (Number(points[i].dps) || 0) * weight;
        weightTotal += weight;
      }
      return {
        dps: weightTotal ? weighted / weightTotal : 0,
        isBoss: !!point.isBoss,
      };
    });
    const count = smoothed.length,
      peakValue = Math.max(...smoothed.map((point) => point.dps), 0),
      scalePeak = Math.max(peakValue, 1);
    const interval = niceInterval(scalePeak),
      yMax = Math.max(interval, Math.ceil(scalePeak / interval) * interval);
    const xOf = (index) =>
      count <= 1
        ? padding.left + drawWidth
        : padding.left + (index / (count - 1)) * drawWidth;
    const yOf = (value) =>
      padding.top + drawHeight * (1 - Math.max(0, value) / yMax);
    ctx.font = "8px 'Microsoft YaHei','Noto Sans SC',sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let value = 0; value <= yMax + 0.0001; value += interval) {
      const y = yOf(value);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,.075)";
      ctx.lineWidth = 1;
      ctx.moveTo(padding.left, y + 0.5);
      ctx.lineTo(width - padding.right, y + 0.5);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.38)";
      ctx.fillText(formatDamage(value), padding.left - 5, y);
    }
    const totalSeconds = Math.max(0, ((count - 1) * GRAPH_BUCKET_MS) / 1000);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(255,255,255,.32)";
    [0, 0.5, 1].forEach((fraction) => {
      const x = padding.left + drawWidth * fraction;
      if (fraction > 0 && fraction < 1) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,.045)";
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + drawHeight);
        ctx.stroke();
      }
      const ago = totalSeconds * (1 - fraction),
        label =
          fraction === 1
            ? english
              ? "NOW"
              : "现在"
            : durationLabel(ago, english);
      ctx.fillText(label, x, height - 3);
    });
    let bossStart = -1;
    for (let index = 0; index <= count; index++) {
      const boss = index < count && smoothed[index].isBoss;
      if (boss && bossStart < 0) bossStart = index;
      if (!boss && bossStart >= 0) {
        const half = count > 1 ? drawWidth / (count - 1) / 2 : 0,
          from = Math.max(padding.left, xOf(bossStart) - half),
          to = Math.min(width - padding.right, xOf(index - 1) + half);
        ctx.fillStyle = "rgba(255,63,52,.07)";
        ctx.fillRect(from, padding.top, to - from, drawHeight);
        bossStart = -1;
      }
    }
    const coords = smoothed.map((point, index) => ({
      x: xOf(index),
      y: yOf(point.dps),
      isBoss: point.isBoss,
      value: point.dps,
    }));
    const area = ctx.createLinearGradient(
      0,
      padding.top,
      0,
      padding.top + drawHeight,
    );
    area.addColorStop(0, "rgba(212,175,55,.30)");
    area.addColorStop(1, "rgba(212,175,55,.015)");
    ctx.beginPath();
    traceSmooth(ctx, coords);
    ctx.lineTo(coords[count - 1].x, padding.top + drawHeight);
    ctx.lineTo(coords[0].x, padding.top + drawHeight);
    ctx.closePath();
    ctx.fillStyle = area;
    ctx.fill();
    ctx.save();
    ctx.shadowColor = "rgba(212,175,55,.45)";
    ctx.shadowBlur = 5;
    ctx.beginPath();
    traceSmooth(ctx, coords);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();
    for (let index = 1; index < count; index++)
      if (coords[index].isBoss) {
        ctx.beginPath();
        ctx.moveTo(coords[index - 1].x, coords[index - 1].y);
        ctx.lineTo(coords[index].x, coords[index].y);
        ctx.strokeStyle = BOSS_COLOR;
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    const peakIndex = smoothed.findIndex((point) => point.dps === peakValue),
      peakPoint = coords[Math.max(0, peakIndex)],
      latest = coords[count - 1];
    ctx.beginPath();
    ctx.arc(peakPoint.x, peakPoint.y, 2.3, 0, Math.PI * 2);
    ctx.fillStyle = "#fff0a8";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(latest.x, latest.y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = latest.isBoss ? BOSS_COLOR : ACCENT;
    ctx.fill();
    ctx.strokeStyle = "#17130a";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "700 10px 'Microsoft YaHei','Noto Sans SC',sans-serif";
    ctx.fillStyle = latest.isBoss ? "#ff817a" : "#f5d568";
    ctx.fillText(formatRate(smoothed[count - 1].dps) + " DPS", width - 9, 13);
  }
  return { canvas, render };
}

// Details 风格的通用排行条，主面板和浮动窗共享同一渲染器。
function openClassPicker(name, anchor, rerender) {
  const old = document.getElementById("kikimeter-class-picker");
  if (old) old.remove();
  const select = document.createElement("select");
  select.id = "kikimeter-class-picker";
  select.dataset.kikimeter = "true";
  select.append(new Option(langText("自动识别", "Auto-detect"), "auto"));
  Object.entries(ClassSystem.definitions)
    .filter(([id]) => id !== "unknown")
    .forEach(([id, d]) => select.append(new Option(d.label, id)));
  select.value = Settings.getClassOverride(name) || "auto";
  const r = anchor.getBoundingClientRect();
  Object.assign(select.style, {
    position: "fixed",
    zIndex: "10002",
    left: r.left + "px",
    top: r.bottom + "px",
    background: "#171717",
    color: "#fff",
    border: "1px solid #d4af37",
    borderRadius: "3px",
    padding: "3px",
  });
  const finish = () => setTimeout(() => select.remove(), 0);
  select.addEventListener("change", () => {
    ClassSystem.setOverride(name, select.value);
    finish();
    rerender();
  });
  select.addEventListener("blur", finish);
  document.body.appendChild(select);
  select.focus();
}

const DamageBreakdownTooltip = (() => {
  let popup = null,
    container = null,
    playerName = "",
    closeTimer = null,
    lastAnchor = null;
  const langText = (zh, en) => (Settings.getLanguage() === "en" ? en : zh);
  function cancelClose() {
    if (closeTimer !== null) clearTimeout(closeTimer);
    closeTimer = null;
  }
  function close() {
    cancelClose();
    if (popup) popup.remove();
    popup = null;
    container = null;
    playerName = "";
    lastAnchor = null;
  }
  function scheduleClose() {
    cancelClose();
    closeTimer = setTimeout(close, 140);
  }
  function position(anchor) {
    if (!popup || !anchor) return;
    const rect = anchor.getBoundingClientRect(),
      width = Math.min(340, window.innerWidth - 12);
    const left =
      rect.right + 6 + width <= window.innerWidth
        ? rect.right + 6
        : Math.max(6, rect.left - width - 6);
    const height = popup.offsetHeight || 180,
      top = Math.max(6, Math.min(rect.top, window.innerHeight - height - 6));
    Object.assign(popup.style, {
      width: width + "px",
      left: left + "px",
      top: top + "px",
    });
  }
  function render(row) {
    if (!popup || !row) return;
    const scrollTop = popup.scrollTop;
    popup.innerHTML = "";
    const cls = ClassSystem.get(row.name),
      header = el("div", {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 8px",
        fontWeight: "700",
        borderBottom: "1px solid rgba(255,255,255,.13)",
        color: "#fff",
      });
    const classIcon = iconElement(cls.icon, cls.label);
    Object.assign(classIcon.style, {
      width: "20px",
      height: "20px",
      objectFit: "contain",
    });
    const headerText = el("span", {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    headerText.textContent =
      row.name +
      " · " +
      (row.breakdownTitle || langText("伤害构成", "Damage Breakdown"));
    header.append(classIcon, headerText);
    popup.appendChild(header);
    const items = Array.isArray(row.breakdown) ? row.breakdown : [];
    const max = items.length
      ? Math.max(...items.map((item) => Number(item.value) || 0), 1)
      : 1;
    items.forEach((item, index) => {
      const line = el("div", {
        position: "relative",
        height: "27px",
        margin: "3px 5px",
        overflow: "hidden",
        borderRadius: "2px",
        background: "rgba(0,0,0,.46)",
        border: "1px solid rgba(255,255,255,.06)",
      });
      const bar = el("div", {
        position: "absolute",
        inset: "0 auto 0 0",
        width: ((100 * (Number(item.value) || 0)) / max).toFixed(2) + "%",
        background: `linear-gradient(90deg,${cls.color}c9,${cls.color}55)`,
      });
      const content = el("div", {
        position: "absolute",
        inset: "0",
        display: "flex",
        alignItems: "center",
        gap: "5px",
        padding: "1px 5px",
        textShadow: "0 1px 2px #000",
      });
      const rank = el("span", {
        width: "15px",
        textAlign: "right",
        fontSize: "10px",
        opacity: ".8",
      });
      rank.textContent = String(index + 1) + ".";
      const itemLabel = item.label || DamageSources.label(item.source);
      const icon = iconElement(
        item.icon || DamageSources.icon(item.source, row.name),
        itemLabel,
      );
      Object.assign(icon.style, {
        width: "20px",
        height: "20px",
        objectFit: "contain",
        flexShrink: "0",
        filter: "drop-shadow(0 1px 1px #000)",
      });
      const label = el("span", {
        flex: "1",
        minWidth: "40px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontWeight: "600",
      });
      label.textContent = itemLabel;
      label.title = label.textContent;
      const stats = el("span", {
        fontSize: "10px",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      });
      stats.textContent =
        formatDamage(item.value) +
        "（" +
        formatRate(item.ps) +
        " " +
        (row.breakdownRateLabel || "DPS") +
        "，" +
        (Number(item.pct) || 0).toFixed(1) +
        "%）";
      content.append(rank, icon, label, stats);
      line.append(bar, content);
      popup.appendChild(line);
    });
    if (!items.length) {
      const empty = el("div", {
        padding: "14px",
        textAlign: "center",
        opacity: ".55",
      });
      empty.textContent =
        row.breakdownEmpty || langText("暂无伤害来源", "No damage sources");
      popup.appendChild(empty);
    }
    position(lastAnchor);
    popup.scrollTop = scrollTop;
  }
  function show(anchor, row, owner) {
    cancelClose();
    lastAnchor = anchor;
    container = owner;
    playerName = row.name;
    if (!popup) {
      popup = el("div", {
        position: "fixed",
        zIndex: "10004",
        maxHeight: "min(420px,calc(100vh - 12px))",
        overflowY: "auto",
        boxSizing: "border-box",
        background:
          "linear-gradient(180deg,rgba(25,25,25,.99),rgba(7,7,7,.99))",
        border: "1px solid rgba(212,175,55,.72)",
        borderRadius: "5px",
        boxShadow: "0 8px 30px rgba(0,0,0,.9)",
        color: "#f2f2f2",
        fontSize: "11px",
      });
      popup.dataset.kikimeter = "true";
      popup.addEventListener("mouseenter", cancelClose);
      popup.addEventListener("mouseleave", scheduleClose);
      document.body.appendChild(popup);
    }
    render(row);
  }
  function update(rows) {
    if (!popup) return false;
    const row = (rows || []).find((item) => item.name === playerName);
    if (row && Array.isArray(row.breakdown)) render(row);
    else close();
    return !!popup;
  }
  function isOpenFor(owner) {
    return !!popup && container === owner;
  }
  return { show, update, isOpenFor, scheduleClose, cancelClose, close };
})();

const AccuracyBreakdownTooltip = (() => {
  let popup = null,
    closeTimer = null,
    container = null,
    playerName = "",
    lastAnchor = null;
  function cancelClose() {
    if (closeTimer !== null) clearTimeout(closeTimer);
    closeTimer = null;
  }
  function close() {
    cancelClose();
    popup?.remove();
    popup = null;
    container = null;
    playerName = "";
    lastAnchor = null;
  }
  function scheduleClose() {
    cancelClose();
    closeTimer = setTimeout(close, 140);
  }
  function position(anchor) {
    if (!popup || !anchor) return;
    const rect = anchor.getBoundingClientRect(),
      width = Math.min(340, window.innerWidth - 12),
      left =
        rect.right + 6 + width <= window.innerWidth
          ? rect.right + 6
          : Math.max(6, rect.left - width - 6),
      height = popup.offsetHeight || 180,
      top = Math.max(6, Math.min(rect.top, window.innerHeight - height - 6));
    Object.assign(popup.style, {
      width: width + "px",
      left: left + "px",
      top: top + "px",
    });
  }
  function render(row) {
    if (!popup || !row) return;
    const scrollTop = popup.scrollTop,
      cls = ClassSystem.get(row.name),
      header = el("div", {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 8px",
        fontWeight: "700",
        borderBottom: "1px solid rgba(255,255,255,.13)",
      });
    popup.replaceChildren();
    const classIcon = iconElement(cls.icon, cls.label);
    Object.assign(classIcon.style, {
      width: "20px",
      height: "20px",
      objectFit: "contain",
    });
    const title = document.createElement("span");
    title.textContent = `${row.name} · ${langText("对怪物命中率", "Accuracy by monster")}`;
    header.append(classIcon, title);
    popup.appendChild(header);
    const monsters = Array.isArray(row.monsters) ? row.monsters : [];
    monsters.forEach((monster) => {
      const line = el("div", {
          position: "relative",
          height: "27px",
          margin: "3px 5px",
          overflow: "hidden",
          borderRadius: "2px",
          background: "rgba(0,0,0,.46)",
          border: "1px solid rgba(255,255,255,.06)",
        }),
        bar = el("div", {
          position: "absolute",
          inset: "0 auto 0 0",
          width: Math.max(0, Math.min(100, Number(monster.pct) || 0)) + "%",
          background: `linear-gradient(90deg,${cls.color}c9,${cls.color}55)`,
        }),
        content = el("div", {
          position: "absolute",
          inset: "0",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "1px 6px",
          textShadow: "0 1px 2px #000",
        }),
        label = el("span", {
          flex: "1",
          minWidth: "40px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: "600",
        }),
        stats = el("span", {
          fontSize: "10px",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        });
      label.textContent = monster.monsterName;
      label.title = monster.monsterName;
      stats.textContent = `${(Number(monster.pct) || 0).toFixed(1)}% (${Number(monster.hits) || 0}/${Number(monster.attempts) || 0})`;
      content.append(label, stats);
      line.append(bar, content);
      popup.appendChild(line);
    });
    if (!monsters.length) {
      const empty = el("div", {
        padding: "12px 10px 7px",
        textAlign: "center",
        opacity: ".58",
      });
      empty.textContent = langText(
        "暂无可判定的怪物目标",
        "No resolved monster targets",
      );
      popup.appendChild(empty);
    }
    const note = el("div", {
      padding: "5px 8px 7px",
      borderTop: "1px solid rgba(255,255,255,.08)",
      color: "rgba(255,255,255,.58)",
      fontSize: "9px",
      lineHeight: "1.4",
    });
    note.textContent = langText(
      "仅包含可判定目标；多怪物时无法确定目标的未命中不会硬性分配。",
      "Resolved targets only; ambiguous misses with multiple monsters are not assigned.",
    );
    popup.appendChild(note);
    position(lastAnchor);
    popup.scrollTop = scrollTop;
  }
  function show(anchor, row, owner) {
    cancelClose();
    lastAnchor = anchor;
    container = owner;
    playerName = row.name;
    if (!popup) {
      popup = el("div", {
        position: "fixed",
        zIndex: "10004",
        maxHeight: "min(420px,calc(100vh - 12px))",
        overflowY: "auto",
        boxSizing: "border-box",
        background:
          "linear-gradient(180deg,rgba(25,25,25,.99),rgba(7,7,7,.99))",
        border: "1px solid rgba(212,175,55,.72)",
        borderRadius: "5px",
        boxShadow: "0 8px 30px rgba(0,0,0,.9)",
        color: "#f2f2f2",
        fontSize: "11px",
      });
      popup.dataset.kikimeter = "true";
      popup.dataset.kikimeterAccuracyTooltip = "true";
      popup.addEventListener("mouseenter", cancelClose);
      popup.addEventListener("mouseleave", scheduleClose);
      document.body.appendChild(popup);
    }
    render(row);
  }
  function update(rows) {
    if (!popup) return false;
    const row = (rows || []).find((item) => item.name === playerName);
    if (row) render(row);
    else close();
    return !!popup;
  }
  function isOpenFor(owner) {
    return !!popup && container === owner;
  }
  return { show, update, isOpenFor, scheduleClose, cancelClose, close };
})();

function renderAccuracyRows(container, rows, rerender, emptyText) {
  if (AccuracyBreakdownTooltip.isOpenFor(container)) {
    AccuracyBreakdownTooltip.update(rows);
    const existing = new Map(
      [...container.querySelectorAll("[data-kikimeter-accuracy-row]")].map(
        (line) => [line.dataset.player, line],
      ),
    );
    if (
      existing.size === rows.length &&
      rows.every((row) => existing.has(row.name))
    ) {
      rows.forEach((row, index) => {
        const line = existing.get(row.name);
        line._accuracyRow = row;
        line._accuracyRank.textContent = String(index + 1) + ".";
        line._accuracyBar.style.width =
          Math.max(0, Math.min(100, Number(row.pct) || 0)) + "%";
        line._accuracyStats.textContent = `${(Number(row.pct) || 0).toFixed(1)}% (${Number(row.hits) || 0}/${Number(row.attempts) || 0})`;
      });
      rows.forEach((row) => container.appendChild(existing.get(row.name)));
      return;
    }
    AccuracyBreakdownTooltip.close();
  }
  container.replaceChildren();
  rows.forEach((row, index) => {
    const cls = ClassSystem.get(row.name),
      line = el("div", {
        position: "relative",
        height: "24px",
        margin: "2px 0",
        overflow: "hidden",
        minHeight: "24px",
        flexShrink: "0",
        boxSizing: "border-box",
        borderRadius: "2px",
        background: "rgba(0,0,0,.42)",
        border: "1px solid rgba(255,255,255,.06)",
        color: "#fff",
      }),
      bar = el("div", {
        position: "absolute",
        inset: "0 auto 0 0",
        width: Math.max(0, Math.min(100, Number(row.pct) || 0)) + "%",
        background: `linear-gradient(90deg,${cls.color}d9,${cls.color}70)`,
        boxShadow: `inset 0 0 5px ${cls.color}`,
      }),
      content = el("div", {
        position: "absolute",
        inset: "0",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "1px 5px",
        whiteSpace: "nowrap",
        textShadow: "0 1px 2px #000",
      }),
      rank = el("span", {
        width: "18px",
        textAlign: "right",
        opacity: ".85",
        fontSize: "11px",
      }),
      icon = iconElement(cls.icon, cls.label),
      name = el("span", {
        fontWeight: "600",
        overflow: "hidden",
        textOverflow: "ellipsis",
        flex: "1",
        minWidth: "30px",
      }),
      stats = el("span", {
        fontSize: "11px",
        fontVariantNumeric: "tabular-nums",
        textAlign: "right",
      });
    line.dataset.kikimeterAccuracyRow = "true";
    line.dataset.player = row.name;
    line._accuracyRow = row;
    line._accuracyRank = rank;
    line._accuracyBar = bar;
    line._accuracyStats = stats;
    rank.textContent = String(index + 1) + ".";
    Object.assign(icon.style, {
      width: "19px",
      height: "19px",
      objectFit: "contain",
      flexShrink: "0",
      cursor: "pointer",
      filter: "drop-shadow(0 1px 1px #000)",
    });
    icon.title = `${cls.label}${langText("｜点击选择职业", " | Click to choose class")}`;
    icon.addEventListener("click", (event) => {
      event.stopPropagation();
      openClassPicker(row.name, icon, rerender);
    });
    name.textContent = row.name;
    stats.textContent = `${(Number(row.pct) || 0).toFixed(1)}% (${Number(row.hits) || 0}/${Number(row.attempts) || 0})`;
    line.title = langText(
      "悬停查看对各怪物的命中率",
      "Hover to view accuracy by monster",
    );
    line.addEventListener("mouseenter", () =>
      AccuracyBreakdownTooltip.show(line, line._accuracyRow, container),
    );
    line.addEventListener("mouseleave", AccuracyBreakdownTooltip.scheduleClose);
    content.append(rank, icon, name, stats);
    line.append(bar, content);
    container.appendChild(line);
  });
  if (!rows.length) {
    const empty = el("div", {
      padding: "14px",
      textAlign: "center",
      opacity: ".5",
    });
    empty.textContent =
      emptyText || langText("暂无命中率数据", "No accuracy data");
    container.appendChild(empty);
  }
}

function renderDetailsRows(container, rows, rerender) {
  if (
    DamageBreakdownTooltip.isOpenFor(container) &&
    DamageBreakdownTooltip.update(rows)
  )
    return;
  container.innerHTML = "";
  const max = rows.length ? Math.max(...rows.map((r) => r.value), 1) : 1;
  rows.forEach((r, i) => {
    const synthetic = r.synthetic === "unattributed-damage",
      cls = synthetic
        ? ClassSystem.definitions.unknown
        : ClassSystem.get(r.name),
      line = el("div", {
        position: "relative",
        height: "24px",
        margin: "2px 0",
        overflow: "hidden",
        minHeight: "24px",
        flexShrink: "0",
        boxSizing: "border-box",
        borderRadius: "2px",
        background: "rgba(0,0,0,.42)",
        border: "1px solid rgba(255,255,255,.06)",
        color: "#fff",
      });
    line.dataset.player = r.name;
    const bar = el("div", {
      position: "absolute",
      left: "0",
      top: "0",
      bottom: "0",
      width: ((100 * r.value) / max).toFixed(2) + "%",
      background: `linear-gradient(90deg,${cls.color}d9,${cls.color}70)`,
      boxShadow: `inset 0 0 5px ${cls.color}`,
    });
    const content = el("div", {
      position: "absolute",
      inset: "0",
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "1px 5px",
      whiteSpace: "nowrap",
      textShadow: "0 1px 2px #000",
    });
    const rank = el("span", {
      width: "18px",
      textAlign: "right",
      opacity: ".85",
      fontSize: "11px",
    });
    rank.textContent = String(i + 1) + ".";
    const icon = iconElement(cls.icon, cls.label);
    icon.title = synthetic
      ? r.name
      : `${cls.label}${langText("｜点击选择职业", " | Click to choose class")}`;
    Object.assign(icon.style, {
      width: "19px",
      height: "19px",
      objectFit: "contain",
      flexShrink: "0",
      cursor: synthetic ? "default" : "pointer",
      filter: "drop-shadow(0 1px 1px #000)",
    });
    if (!synthetic)
      icon.addEventListener("click", (e) => {
        e.stopPropagation();
        openClassPicker(r.name, icon, rerender);
      });
    const name = el("span", {
      fontWeight: "600",
      overflow: "hidden",
      textOverflow: "ellipsis",
      flex: "1",
      minWidth: "30px",
    });
    name.textContent = r.name;
    const stats = el("span", {
      fontSize: "11px",
      fontVariantNumeric: "tabular-nums",
      textAlign: "right",
    });
    stats.textContent = langText(
      `${formatDamage(r.value)}（${formatRate(r.ps)} ${r.rateLabel || "DPS"}，${r.pct.toFixed(1)}%）`,
      `${formatDamage(r.value)} (${formatRate(r.ps)} ${r.rateLabel || "DPS"}, ${r.pct.toFixed(1)}%)`,
    );
    if (Array.isArray(r.breakdown)) {
      line.title =
        r.breakdownHover ||
        (Settings.getLanguage() === "en"
          ? "Hover to view damage breakdown"
          : "悬停查看伤害构成");
      line.addEventListener("mouseenter", () =>
        DamageBreakdownTooltip.show(line, r, container),
      );
      line.addEventListener("mouseleave", DamageBreakdownTooltip.scheduleClose);
    }
    content.append(rank, icon, name, stats);
    line.append(bar, content);
    container.appendChild(line);
  });
  if (!rows.length) {
    const empty = el("div", {
      padding: "14px",
      textAlign: "center",
      opacity: ".5",
    });
    empty.textContent = langText("暂无战斗数据", "No combat data");
    container.appendChild(empty);
  }
}

export {
  AccuracyBreakdownTooltip,
  BOSS_COLOR,
  DamageBreakdownTooltip,
  buildDetailsGraph,
  buildGraph,
  openClassPicker,
  renderAccuracyRows,
  renderDetailsRows,
};
