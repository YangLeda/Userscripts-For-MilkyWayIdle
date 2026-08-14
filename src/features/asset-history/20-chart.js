import { runtime } from "../../core/runtime.js";
import { ASSET_COMPONENT_KEYS } from "./00-snapshot.js";
import { dayGap } from "./10-store.js";

const COLORS = {
  equipment: "#5bc0eb",
  inventory: "#ffd166",
  marketListings: "#8ecae6",
  houses: "#ff6384",
  abilities: "#a78bfa",
  nonTradableTokens: "#80ed99",
  shrine: "#f4a261",
};

const LABELS = {
  equipment: ["装备", "Equipment"],
  inventory: ["库存", "Inventory"],
  marketListings: ["订单", "Market listings"],
  houses: ["房屋", "Houses"],
  abilities: ["技能", "Abilities"],
  nonTradableTokens: ["不可交易代币", "Non-tradable tokens"],
  shrine: ["神龛", "Shrine"],
};

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function filterEntries(entries, range) {
  if (!Number.isFinite(range) || !entries.length) return entries;
  const lastDate = entries.at(-1)[0];
  return entries.filter(([date]) => dayGap(date, lastDate) < range);
}

function normalizedChanges(entries, key) {
  return entries.map(([date, record], index) => {
    if (!index) return null;
    const previous = entries[index - 1];
    const currentValue = record?.values?.[key];
    const previousValue = previous[1]?.values?.[key];
    if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) {
      return null;
    }
    return (
      (currentValue - previousValue) / Math.max(1, dayGap(previous[0], date))
    );
  });
}

function calendarAverage(entries, key, windowDays = 7) {
  return entries.map(([date, record], index) => {
    if (!index || !Number.isFinite(record?.values?.[key])) return null;
    let baseline = entries[index - 1];
    for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
      baseline = entries[candidate];
      if (dayGap(baseline[0], date) >= windowDays) break;
    }
    const gap = dayGap(baseline[0], date);
    const baselineValue = baseline[1]?.values?.[key];
    if (!(gap > 0) || !Number.isFinite(baselineValue)) return null;
    return (record.values[key] - baselineValue) / gap;
  });
}

function formatTooltip(value) {
  return runtime.api.numberFormatter?.(value) ?? String(value);
}

export class AssetHistoryChart {
  constructor(canvas, fallback, { hiddenDatasets = null } = {}) {
    this.canvas = canvas;
    this.fallback = fallback;
    this.instance = null;
    this.hiddenDatasets = hiddenDatasets ?? new Set();
  }

  destroy() {
    this.instance?.destroy?.();
    this.instance = null;
  }

  resetZoom() {
    this.instance?.resetZoom?.();
  }

  prepareCanvas() {
    if (!this.canvas || this.canvas.isConnected === false) return null;
    if (this.canvas.style) {
      this.canvas.style.display = "block";
      this.canvas.style.width = "100%";
      this.canvas.style.height = "100%";
    }
    const bounds = this.canvas.getBoundingClientRect?.() ?? {};
    const width = Math.max(
      1,
      Math.round(
        Number(bounds.width) ||
          Number(this.canvas.clientWidth) ||
          Number(this.canvas.width) ||
          300,
      ),
    );
    const height = Math.max(
      1,
      Math.round(
        Number(bounds.height) ||
          Number(this.canvas.clientHeight) ||
          Number(this.canvas.height) ||
          150,
      ),
    );
    this.canvas.width = width;
    this.canvas.height = height;
    return this.canvas.getContext?.("2d") ?? null;
  }

  render(entries, { mode = "total", range = null } = {}) {
    return this.renderWithOptions(entries, { mode, range });
  }

  renderWithOptions(
    entries,
    {
      mode = "total",
      range = null,
      maWindow = 7,
      lineTension = 0.25,
      tags = [],
    } = {},
  ) {
    const Chart = globalThis.Chart;
    if (typeof Chart !== "function") {
      this.destroy();
      this.canvas.hidden = true;
      this.fallback.hidden = false;
      this.fallback.textContent = t(
        "图表依赖未加载；资产数据与明细仍可正常使用。",
        "Chart dependencies did not load; asset data is still available.",
      );
      return false;
    }

    const filtered = filterEntries(entries, range);
    const labels = filtered.map(([date]) => date);
    let datasets;
    let title;
    if (mode === "profit") {
      const profit = normalizedChanges(filtered, "total");
      datasets = [
        {
          type: "bar",
          label: t("每日盈亏", "Daily P/L"),
          data: profit,
          backgroundColor: profit.map((value) =>
            value >= 0 ? "rgba(65,190,115,.58)" : "rgba(235,90,90,.58)",
          ),
          borderRadius: 3,
        },
        {
          type: "line",
          label: t(`${maWindow} 日均线`, `${maWindow}-day average`),
          data: calendarAverage(filtered, "total", maWindow),
          borderColor: "#ffd369",
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 0,
          tension: lineTension,
          spanGaps: true,
        },
      ];
      title = t("每日资产盈亏", "Daily asset P/L");
    } else if (mode === "breakdown") {
      datasets = ASSET_COMPONENT_KEYS.map((key) => ({
        type: "line",
        label: t(...LABELS[key]),
        data: filtered.map(([, record]) => record?.values?.[key] ?? null),
        mwitoolsVisibilityKey: key,
        borderColor: COLORS[key],
        backgroundColor: COLORS[key],
        borderWidth: 2,
        pointRadius: 2,
        tension: lineTension,
        spanGaps: true,
      }));
      title = t("分项资产", "Component assets");
    } else {
      datasets = [
        {
          type: "line",
          label: t("总资产", "Total assets"),
          data: filtered.map(([, record]) => record?.values?.total ?? null),
          borderColor: "#4cc9f0",
          backgroundColor: "rgba(76,201,240,.14)",
          fill: true,
          borderWidth: 2,
          pointRadius: 2,
          tension: lineTension,
          spanGaps: true,
        },
      ];
      title = t("总资产历史", "Total asset history");
    }

    for (const dataset of datasets) {
      const key = `${mode}:${dataset.mwitoolsVisibilityKey ?? dataset.label}`;
      dataset.hidden = this.hiddenDatasets.has(key);
    }

    this.destroy();
    const context = this.prepareCanvas();
    if (!context) return false;
    this.canvas.hidden = false;
    this.fallback.hidden = true;
    const crosshairPlugin = {
      id: "mwitoolsAssetCrosshair",
      afterDraw(chart) {
        const active = chart.tooltip?.getActiveElements?.()?.[0];
        if (!active) return;
        const { ctx, chartArea } = chart;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(active.element.x, chartArea.top);
        ctx.lineTo(active.element.x, chartArea.bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,.22)";
        ctx.stroke();
        ctx.restore();
      },
    };
    const tagPlugin = {
      id: "mwitoolsAssetTags",
      afterDatasetsDraw(chart) {
        if (!tags.length) return;
        const visibleTags = tags.filter((tag) => labels.includes(tag.date));
        if (!visibleTags.length) return;
        const { ctx, chartArea, scales } = chart;
        ctx.save();
        ctx.font = "11px system-ui";
        ctx.textBaseline = "top";
        for (const tag of visibleTags) {
          const index = labels.indexOf(tag.date);
          const x = scales.x.getPixelForValue(index);
          ctx.strokeStyle = tag.color ?? "rgba(251,191,36,.4)";
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top + 18);
          ctx.lineTo(x, chartArea.bottom);
          ctx.stroke();
          ctx.setLineDash([]);
          const text = String(tag.text ?? "").slice(0, 18);
          const width = Math.min(150, ctx.measureText(text).width + 12);
          ctx.fillStyle = "rgba(30,32,44,.94)";
          ctx.fillRect(
            Math.min(chartArea.right - width, Math.max(chartArea.left, x + 4)),
            chartArea.top + 2,
            width,
            16,
          );
          ctx.fillStyle = tag.color ?? "#f8d477";
          ctx.fillText(
            text,
            Math.min(
              chartArea.right - width + 6,
              Math.max(chartArea.left + 6, x + 10),
            ),
            chartArea.top + 4,
          );
        }
        ctx.restore();
      },
    };
    this.instance = new Chart(context, {
      data: { labels, datasets },
      plugins: [crosshairPlugin, tagPlugin],
      options: {
        // Chart.js responsive mode observes DOM attachment with Node.contains().
        // Firefox userscript sandboxes can reject that cross-context access when
        // the game replaces a React subtree, so MWITools sizes the canvas above.
        responsive: false,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        animation: false,
        plugins: {
          title: { display: true, text: title, color: "#eee" },
          legend: {
            labels: { color: "#ddd", usePointStyle: true },
            onClick: (_event, legendItem, legend) => {
              const index = legendItem?.datasetIndex;
              const chart = legend?.chart;
              if (!Number.isInteger(index) || !chart) return;
              const dataset = chart.data.datasets[index];
              const key = `${mode}:${dataset.mwitoolsVisibilityKey ?? dataset.label}`;
              const visible = chart.isDatasetVisible(index);
              if (visible) this.hiddenDatasets.add(key);
              else this.hiddenDatasets.delete(key);
              chart.setDatasetVisibility(index, !visible);
              chart.update();
            },
          },
          tooltip: {
            callbacks: {
              label(context) {
                const value = context.raw;
                return `${context.dataset.label}: ${Number.isFinite(value) ? formatTooltip(value) : "—"}`;
              },
            },
          },
          zoom: {
            pan: { enabled: true, mode: "x" },
            zoom: {
              wheel: { enabled: true },
              pinch: { enabled: true },
              drag: { enabled: true, modifierKey: "shift" },
              mode: "x",
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: "#bbb",
              maxRotation: 0,
              autoSkip: true,
              callback(value) {
                return String(labels[value] ?? "").slice(5);
              },
            },
            grid: { color: "rgba(255,255,255,.06)" },
          },
          y: {
            ticks: {
              color: "#bbb",
              callback(value) {
                return runtime.api.numberFormatter?.(value) ?? value;
              },
            },
            grid: { color: "rgba(255,255,255,.08)" },
          },
        },
      },
    });
    return true;
  }
}
