import { runtime } from "../core/runtime.js";

const STYLE_ID = "mwitools-guild-xp-style";
const rateCache = new Map();
const HOUR_MS = 60 * 60 * 1000;
const TREND_WINDOW_MS = 7 * 24 * HOUR_MS;
const TREND_RATE_WINDOW_MS = 6 * HOUR_MS;
const TREND_MINIMUM_COVERAGE_MS = HOUR_MS;

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function findField(object, keys, maxDepth = 4) {
  const pending = [{ value: object, depth: 0 }];
  const visited = new Set();
  while (pending.length) {
    const { value, depth } = pending.shift();
    if (
      !value ||
      typeof value !== "object" ||
      visited.has(value) ||
      depth > maxDepth
    )
      continue;
    visited.add(value);
    for (const key of keys) {
      if (value[key] !== undefined && value[key] !== null) return value[key];
    }
    for (const child of Object.values(value)) {
      if (child && typeof child === "object")
        pending.push({ value: child, depth: depth + 1 });
    }
  }
  return null;
}

function findOwnField(object, keys) {
  if (!object || typeof object !== "object") {
    return { found: false, value: undefined };
  }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      return { found: true, value: object[key] };
    }
  }
  return { found: false, value: undefined };
}

function isGuildMemberIdle(member) {
  const hidden = findOwnField(member, [
    "hideOnlineStatus",
    "isOnlineHidden",
    "onlineStatusHidden",
  ]).value;
  const online = findOwnField(member, ["isOnline", "online"]).value;
  if (Boolean(hidden) || online !== true) return false;

  // The current guild payload exposes the member's activity as `actionType`.
  // Missing activity data is unknown (for example, a private or older payload),
  // not proof that the member is idle.
  const action = findOwnField(member, [
    "actionType",
    "currentActionType",
    "currentActionHrid",
    "actionHrid",
    "currentAction",
  ]);
  if (!action.found) return false;
  if (action.value === null || action.value === false) return true;
  if (typeof action.value === "string") {
    const value = action.value.trim();
    return value === "" || /(?:^|\/)idle$/i.test(value);
  }
  return false;
}

function entityId(entity) {
  return String(
    findField(entity, [
      "id",
      "characterID",
      "characterId",
      "guildID",
      "guildId",
      "name",
    ]) ?? "",
  );
}

function entityName(entity) {
  return String(
    findField(entity, ["name", "guildName", "characterName"]) ?? "—",
  );
}

function entityXp(entity) {
  const value = findField(entity, [
    "guildExperience",
    "totalGuildExperience",
    "cumulativeGuildExperience",
    "experience",
    "totalExperience",
    "xp",
  ]);
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function entityWeeklyXpRate(entity, now = Date.now()) {
  const weeklyValue = findField(entity, ["weeklyGuildExperience"]);
  const weeklyXp = weeklyValue === null ? NaN : Number(weeklyValue);
  const weekStartedAt = Date.parse(
    findField(entity, ["weeklyGuildExperienceWeekStartAt"]) ?? "",
  );
  const elapsed = now - weekStartedAt;
  if (
    !Number.isFinite(weeklyXp) ||
    weeklyXp < 0 ||
    !Number.isFinite(weekStartedAt) ||
    elapsed <= 0
  ) {
    return null;
  }
  return (weeklyXp / elapsed) * HOUR_MS;
}

function objectKey(kind, entity, parentId = "") {
  const id = entityId(entity);
  return id ? `${kind}:${parentId ? `${parentId}:` : ""}${id}` : "";
}

async function refreshRate(key) {
  if (!key) return null;
  const history = await runtime.api.getXpHistory(key);
  const rates = runtime.api.calculateXpRates(history);
  rateCache.set(key, rates);
  return rates;
}

async function sampleEntity(kind, entity, parentId = "", at = Date.now()) {
  const key = objectKey(kind, entity, parentId);
  const xp = entityXp(entity);
  if (!key || xp === null) return null;
  await runtime.api.recordXpSnapshot(key, xp, at);
  return refreshRate(key);
}

async function sampleGuildState(includeLeaderboard = false) {
  const now = Date.now();
  const guild = runtime.state.guild;
  const guildId = entityId(guild);
  if (guild) await sampleEntity("guild", guild, "", now);
  await Promise.all(
    (runtime.state.guildCharacters ?? []).map((member) =>
      sampleEntity("member", member, guildId, now),
    ),
  );
  if (includeLeaderboard) {
    await Promise.all(
      (runtime.state.guildLeaderboard ?? []).map((row) =>
        sampleEntity("leaderboard", row, "", now),
      ),
    );
  }
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .mwi-guild-xp-card { margin:10px 0; padding:11px 12px; border:1px solid rgba(255,255,255,.13); border-radius:8px; background:linear-gradient(135deg,rgba(255,255,255,.05),rgba(0,0,0,.17)); color:var(--color-text-primary,#eee); }
    .mwi-guild-xp-head { display:flex; justify-content:space-between; gap:12px; align-items:baseline; }
    .mwi-guild-xp-title { font-weight:700; font-size:.95rem; }
    .mwi-guild-xp-sampled { color:var(--color-text-secondary,#999); font-size:.66rem; }
    .mwi-guild-xp-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(125px,1fr)); gap:7px; margin-top:8px; }
    .mwi-guild-xp-metric { padding:7px 8px; border-radius:5px; background:rgba(0,0,0,.18); }
    .mwi-guild-xp-metric small { display:block; color:var(--color-text-secondary,#aaa); }
    .mwi-guild-xp-metric strong { display:block; margin-top:2px; color:#ffa500; }
    .mwi-guild-trend-label { margin-top:8px; color:var(--color-text-secondary,#aaa); font-size:.68rem; }
    .mwi-guild-trend { width:100%; height:180px; margin-top:8px; overflow:visible; }
    .mwi-guild-trend-axis { stroke:rgba(255,255,255,.38); stroke-width:1; vector-effect:non-scaling-stroke; }
    .mwi-guild-trend-grid { stroke:rgba(255,255,255,.1); stroke-width:1; vector-effect:non-scaling-stroke; }
    .mwi-guild-trend-tick { fill:var(--color-text-secondary,#aaa); font-size:10px; }
    .mwi-guild-trend-empty { fill:var(--color-text-secondary,#aaa); font-size:13px; text-anchor:middle; }
    .mwi-guild-trend polyline { fill:none; stroke:#ffa500; stroke-width:2; vector-effect:non-scaling-stroke; }
    .mwi-guild-idle { display:flex; flex-wrap:wrap; gap:5px; align-items:center; margin-top:8px; }
    .mwi-guild-idle span { padding:2px 7px; border-radius:999px; background:rgba(255,255,255,.07); font-size:.68rem; }
    .mwi-guild-members-wide { width:100% !important; max-width:980px !important; }
    .mwi-guild-members-wide .mwi-guild-member-table { width:100%; }
    .mwi-guild-member-table > thead > tr > th { white-space:nowrap; word-break:keep-all; }
    .mwi-guild-member-table > tbody > tr > td:not(:first-child) { white-space:nowrap; word-break:keep-all; }
    .mwi-guild-member-table > thead > tr > th:nth-child(2),
    .mwi-guild-member-table > thead > tr > th:nth-child(3),
    .mwi-guild-member-table > thead > tr > th:nth-child(4),
    .mwi-guild-member-table > tbody > tr > td:nth-child(2),
    .mwi-guild-member-table > tbody > tr > td:nth-child(3),
    .mwi-guild-member-table > tbody > tr > td:nth-child(4) { min-width:38px; }
    .mwi-guild-member-table > thead > tr > th:nth-child(5),
    .mwi-guild-member-table > tbody > tr > td:nth-child(5) { min-width:96px; }
    .mwi-guild-rate-cell { color:#ffa500; white-space:nowrap; min-width:105px; }
    .mwi-guild-rate-content { display:flex; align-items:center; gap:5px; }
    .mwi-guild-rate-value { flex:0 0 auto; }
    .mwi-guild-rate-track { display:block; flex:1 1 42px; min-width:24px; max-width:68px; height:5px; overflow:hidden; border-radius:999px; background:rgba(255,255,255,.08); }
    .mwi-guild-rate-fill { display:block; height:100%; min-width:2px; border-radius:inherit; background:rgba(91,134,255,.58); }
    .mwi-guild-rate-sort { margin-left:4px; color:var(--color-text-secondary,#aaa); font-size:.62rem; }
    .mwi-guild-div-rate-head,.mwi-guild-div-rates { display:grid; grid-template-columns:repeat(2,minmax(92px,1fr)); gap:8px; margin-left:auto; text-align:right; }
    .mwi-guild-div-rate-head { padding:5px 8px; color:var(--color-text-secondary,#aaa); font-size:.68rem; }
    .mwi-guild-div-rates { padding-left:10px; color:#ffa500; font-size:.7rem; }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function rateText(value, waiting = false) {
  if (!Number.isFinite(value))
    return waiting
      ? t("待再次采样", "Awaiting another sample")
      : t("样本不足", "Not enough data");
  return `${runtime.api.numberFormatter(value)}/h`;
}

function metric(label, value, title = "") {
  const box = document.createElement("div");
  box.className = "mwi-guild-xp-metric";
  const caption = document.createElement("small");
  caption.textContent = label;
  const strong = document.createElement("strong");
  if (value?.nodeType) strong.append(value);
  else strong.textContent = value;
  strong.title = title;
  box.append(caption, strong);
  return box;
}

function guildXpRatePoints(points, now = Date.now()) {
  const cutoff = now - TREND_WINDOW_MS;
  const sorted = [...points]
    .map((point) => ({ at: Number(point?.at), xp: Number(point?.xp) }))
    .filter((point) => Number.isFinite(point.at) && Number.isFinite(point.xp))
    .sort((left, right) => left.at - right.at);
  const rates = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (current.at < cutoff) continue;
    let baselineIndex = index - 1;
    while (
      baselineIndex > 0 &&
      current.at - sorted[baselineIndex - 1].at <= TREND_RATE_WINDOW_MS
    ) {
      baselineIndex -= 1;
    }
    let baseline = sorted[baselineIndex];
    if (current.at - baseline.at < TREND_MINIMUM_COVERAGE_MS) {
      baseline = [...sorted.slice(0, baselineIndex)]
        .reverse()
        .find((point) => current.at - point.at >= TREND_MINIMUM_COVERAGE_MS);
    }
    if (!baseline) continue;
    const elapsed = current.at - baseline.at;
    const gained = current.xp - baseline.xp;
    if (elapsed <= 0 || gained < 0) continue;
    rates.push({ at: current.at, rate: (gained / elapsed) * HOUR_MS });
  }
  return rates;
}

function svgElement(name, className = "") {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  if (className) element.setAttribute("class", className);
  return element;
}

function niceRateCeiling(value) {
  if (!(value > 0)) return 1;
  const rawStep = value / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude * 4;
}

function trendTimeLabel(timestamp, longSpan) {
  return new Intl.DateTimeFormat(runtime.config.isZH ? "zh-CN" : "en-US", {
    ...(longSpan
      ? { month: "numeric", day: "numeric" }
      : { hour: "2-digit", minute: "2-digit", hour12: false }),
  }).format(new Date(timestamp));
}

function trendSvg(points) {
  const width = 520;
  const height = 180;
  const plot = { left: 58, right: 12, top: 10, bottom: 30 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const svg = svgElement("svg");
  svg.classList.add("mwi-guild-trend");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const label = t(
    "公会经验获取速度（6 小时滚动平均，XP/小时）",
    "Guild XP gain rate (6-hour rolling average, XP/hour)",
  );
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  const title = svgElement("title");
  title.textContent = label;
  svg.append(title);
  const recent = guildXpRatePoints(points);
  if (recent.length < 2) {
    const empty = svgElement("text", "mwi-guild-trend-empty");
    empty.setAttribute("x", String(width / 2));
    empty.setAttribute("y", String(height / 2));
    empty.textContent = t("样本不足", "Not enough data");
    svg.append(empty);
    return svg;
  }
  const yMax = niceRateCeiling(Math.max(...recent.map((point) => point.rate)));
  const minAt = recent[0].at;
  const maxAt = recent.at(-1).at;
  const yAxis = svgElement("line", "mwi-guild-trend-axis mwi-guild-axis-y");
  yAxis.setAttribute("x1", String(plot.left));
  yAxis.setAttribute("x2", String(plot.left));
  yAxis.setAttribute("y1", String(plot.top));
  yAxis.setAttribute("y2", String(plot.top + plotHeight));
  const xAxis = svgElement("line", "mwi-guild-trend-axis mwi-guild-axis-x");
  xAxis.setAttribute("x1", String(plot.left));
  xAxis.setAttribute("x2", String(plot.left + plotWidth));
  xAxis.setAttribute("y1", String(plot.top + plotHeight));
  xAxis.setAttribute("y2", String(plot.top + plotHeight));

  for (let index = 0; index < 5; index += 1) {
    const ratio = index / 4;
    const y = plot.top + plotHeight - ratio * plotHeight;
    const grid = svgElement("line", "mwi-guild-trend-grid");
    grid.setAttribute("x1", String(plot.left));
    grid.setAttribute("x2", String(plot.left + plotWidth));
    grid.setAttribute("y1", String(y));
    grid.setAttribute("y2", String(y));
    const tick = svgElement("text", "mwi-guild-trend-tick mwi-guild-y-tick");
    tick.setAttribute("x", String(plot.left - 7));
    tick.setAttribute("y", String(y + 3));
    tick.setAttribute("text-anchor", "end");
    tick.textContent = runtime.api.numberFormatter(yMax * ratio);
    svg.append(grid, tick);
  }

  const longSpan = maxAt - minAt > 24 * HOUR_MS;
  for (let index = 0; index < 4; index += 1) {
    const ratio = index / 3;
    const x = plot.left + ratio * plotWidth;
    const tick = svgElement("text", "mwi-guild-trend-tick mwi-guild-x-tick");
    tick.setAttribute("x", String(x));
    tick.setAttribute("y", String(plot.top + plotHeight + 19));
    tick.setAttribute(
      "text-anchor",
      index === 0 ? "start" : index === 3 ? "end" : "middle",
    );
    tick.textContent = trendTimeLabel(
      minAt + ratio * (maxAt - minAt),
      longSpan,
    );
    svg.append(tick);
  }

  svg.append(yAxis, xAxis);
  const polyline = svgElement("polyline");
  polyline.setAttribute(
    "points",
    recent
      .map((point) => {
        const x =
          plot.left +
          ((point.at - minAt) / Math.max(1, maxAt - minAt)) * plotWidth;
        const y = plot.top + plotHeight - (point.rate / yMax) * plotHeight;
        return `${x},${y}`;
      })
      .join(" "),
  );
  svg.append(polyline);
  return svg;
}

function removeGuildOverviewCards(keep = null) {
  document.querySelectorAll(".mwi-guild-xp-card").forEach((card) => {
    if (card !== keep) card.remove();
  });
}

function findGuildOverviewHost() {
  const guildPanel = document.querySelector(
    'div[class*="GuildPanel_guildPanel"]',
  );
  if (!guildPanel) return null;

  const tabList = guildPanel.querySelector('[role="tablist"]');
  const tabs = [...(tabList?.querySelectorAll('[role="tab"]') ?? [])];
  const overviewTab =
    tabs.find((tab) =>
      /^(概览|overview)$/i.test(tab.textContent?.trim() ?? ""),
    ) ?? tabs[0];
  const ariaSelected = overviewTab?.getAttribute("aria-selected");
  const overviewSelected =
    ariaSelected !== null && ariaSelected !== undefined
      ? ariaSelected === "true"
      : overviewTab?.classList.contains("Mui-selected") ||
        overviewTab?.getAttribute("tabindex") === "0";
  if (!overviewSelected) return null;

  const host = guildPanel.querySelector('[class*="GuildPanel_overviewTab"]');
  const tabPanel = host?.closest('[class*="TabPanel_tabPanel"]');
  if (
    !host ||
    tabPanel?.hidden ||
    tabPanel?.className.includes("TabPanel_hidden")
  ) {
    return null;
  }
  return host;
}

async function renderGuildOverview() {
  let host = findGuildOverviewHost();
  const guild = runtime.state.guild;
  if (!host || !guild) {
    removeGuildOverviewCards();
    return;
  }
  const key = objectKey("guild", guild);
  const rates = rateCache.get(key) ?? (await refreshRate(key));
  const currentHost = findGuildOverviewHost();
  if (!currentHost || currentHost !== host) {
    removeGuildOverviewCards();
    return;
  }
  host = currentHost;
  let card = host.querySelector(":scope > .mwi-guild-xp-card");
  removeGuildOverviewCards(card);
  if (!card) {
    card = document.createElement("section");
    card.className = "mwi-guild-xp-card";
    host.prepend(card);
  }
  card.replaceChildren();
  const head = document.createElement("div");
  head.className = "mwi-guild-xp-head";
  const title = document.createElement("div");
  title.className = "mwi-guild-xp-title";
  title.textContent = t("公会经验进度", "Guild XP progress");
  const sampled = document.createElement("div");
  sampled.className = "mwi-guild-xp-sampled";
  sampled.textContent = rates?.lastSampleAt
    ? `${t("最后采样", "Last sample")} ${new Date(rates.lastSampleAt).toLocaleString()}`
    : t("待采样", "Awaiting samples");
  head.append(title, sampled);

  const grid = document.createElement("div");
  grid.className = "mwi-guild-xp-grid";
  const xp = entityXp(guild);
  const level = Number(findField(guild, ["level", "guildLevel"]));
  const nextXp = Number.isInteger(level)
    ? Number(runtime.state.initData_levelExperienceTable?.[level + 1])
    : NaN;
  const remaining =
    Number.isFinite(nextXp) && xp !== null && nextXp > xp ? nextXp - xp : null;
  const dayRate = Number(rates?.day);
  const recentRate = Number(rates?.recent);
  const estimateRate =
    Number.isFinite(dayRate) && dayRate > 0
      ? dayRate
      : Number.isFinite(recentRate) && recentRate > 0
        ? recentRate
        : null;
  const etaHours =
    remaining !== null && estimateRate !== null
      ? remaining / estimateRate
      : null;
  grid.append(
    metric(
      t("预计升级", "Level ETA"),
      Number.isFinite(etaHours)
        ? runtime.api.timeReadable(etaHours * 3600)
        : t("样本不足", "Not enough data"),
    ),
    metric(t("24 小时平均", "24-hour average"), rateText(rates?.day)),
  );
  const trendLabel = document.createElement("div");
  trendLabel.className = "mwi-guild-trend-label";
  trendLabel.textContent = t(
    "最近 7 天经验获取速度（6 小时滚动平均）",
    "XP gain rate over the last 7 days (6-hour rolling average)",
  );
  card.append(head, grid, trendLabel, trendSvg(rates?.points ?? []));

  if (runtime.settings.get("guildIdleMembers")) {
    const idle = (runtime.state.guildCharacters ?? []).filter(
      isGuildMemberIdle,
    );
    const idleRow = document.createElement("div");
    idleRow.className = "mwi-guild-idle";
    const label = document.createElement("b");
    label.textContent = `${t("当前闲置", "Idle now")} (${idle.length}) · ${t(
      "状态更新",
      "Updated",
    )} ${new Date(runtime.state.guildStateUpdatedAt).toLocaleTimeString()}`;
    idleRow.append(label);
    for (const member of idle) {
      const tag = document.createElement("span");
      tag.textContent = entityName(member);
      idleRow.append(tag);
    }
    card.append(idleRow);
  }
}

function appendRateColumns(table, rows, kind, parentId = "") {
  if (!table?.tHead?.rows?.[0] || !rows.length) return;
  table.classList.add(`mwi-guild-${kind}-table`);
  if (kind === "member") {
    table
      .closest('[class*="GuildPanel_membersTab__"]')
      ?.classList.add("mwi-guild-members-wide");
  }
  const header = table.tHead.rows[0];
  if (!header.querySelector(".mwi-guild-recent-head")) {
    const columns = [
      ["mwi-guild-recent-head", t("近 6 小时 XP/h", "6h XP/h")],
      ["mwi-guild-day-head", t("24 小时 XP/h", "24h XP/h")],
      ...(kind === "member"
        ? [["mwi-guild-week-head", t("本周平均 XP/h", "This-week avg XP/h")]]
        : []),
    ];
    for (const [rateIndex, [className, label]] of columns.entries()) {
      const cell = document.createElement("th");
      cell.className = className;
      const labelNode = document.createElement("span");
      labelNode.textContent = label;
      const sortIndicator = document.createElement("span");
      sortIndicator.className = "mwi-guild-rate-sort";
      sortIndicator.textContent = "↕";
      cell.append(labelNode, sortIndicator);
      cell.tabIndex = 0;
      cell.style.cursor = "pointer";
      cell.title = t("点击按经验速率排序", "Click to sort by XP rate");
      const sortRows = () => {
        const body = table.tBodies[0];
        if (!body) return;
        const direction = cell.dataset.direction === "desc" ? 1 : -1;
        cell.dataset.direction = direction === -1 ? "desc" : "asc";
        header
          .querySelectorAll(
            ".mwi-guild-recent-head,.mwi-guild-day-head,.mwi-guild-week-head",
          )
          .forEach((head) => {
            if (head !== cell) {
              delete head.dataset.direction;
              head.setAttribute("aria-sort", "none");
              const indicator = head.querySelector(".mwi-guild-rate-sort");
              if (indicator) indicator.textContent = "↕";
            }
          });
        cell.setAttribute(
          "aria-sort",
          direction === -1 ? "descending" : "ascending",
        );
        sortIndicator.textContent = direction === -1 ? "▼" : "▲";
        const tableRows = [...body.rows];
        tableRows.sort((left, right) => {
          const leftCell = left.querySelectorAll(".mwi-guild-rate-cell")[
            rateIndex
          ];
          const rightCell = right.querySelectorAll(".mwi-guild-rate-cell")[
            rateIndex
          ];
          const leftValue = Number(leftCell?.dataset.sortValue ?? -1);
          const rightValue = Number(rightCell?.dataset.sortValue ?? -1);
          if (leftValue < 0 && rightValue < 0) return 0;
          if (leftValue < 0) return 1;
          if (rightValue < 0) return -1;
          return direction === -1
            ? rightValue - leftValue
            : leftValue - rightValue;
        });
        tableRows.forEach((row) => body.append(row));
      };
      cell.addEventListener("click", sortRows);
      cell.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        sortRows();
      });
      header.append(cell);
    }
  }

  const sourceByKey = new Map(
    rows.map((source) => [objectKey(kind, source, parentId), source]),
  );
  const rowEntries = [...(table.tBodies[0]?.rows ?? [])].map((row, index) => {
    let key = row.dataset.mwiGuildEntityKey ?? "";
    let source = sourceByKey.get(key);
    if (!source) {
      source = rows[index];
      key = objectKey(kind, source, parentId);
      if (key) row.dataset.mwiGuildEntityKey = key;
    }
    const rates = rateCache.get(key);
    return {
      row,
      key,
      rates,
      values: [
        rates?.recent,
        rates?.day,
        ...(kind === "member" ? [entityWeeklyXpRate(source)] : []),
      ],
    };
  });
  const maxima = Array.from({ length: kind === "member" ? 3 : 2 }, (_, index) =>
    Math.max(
      0,
      ...rowEntries.map(({ values }) =>
        Number.isFinite(values[index]) ? values[index] : 0,
      ),
    ),
  );

  rowEntries.forEach(({ row, rates, values }) => {
    row
      .querySelectorAll(".mwi-guild-rate-cell")
      .forEach((cell) => cell.remove());
    for (const [rateIndex, value] of values.entries()) {
      const cell = document.createElement("td");
      cell.className = "mwi-guild-rate-cell";
      cell.dataset.sortValue = Number.isFinite(value) ? String(value) : "-1";
      const content = document.createElement("div");
      content.className = "mwi-guild-rate-content";
      const valueNode = document.createElement("span");
      valueNode.className = "mwi-guild-rate-value";
      valueNode.textContent = rateText(value, !rates?.lastSampleAt);
      content.append(valueNode);
      if (Number.isFinite(value) && maxima[rateIndex] > 0) {
        const track = document.createElement("span");
        track.className = "mwi-guild-rate-track";
        track.setAttribute("aria-hidden", "true");
        const fill = document.createElement("span");
        fill.className = "mwi-guild-rate-fill";
        const percentage = Math.max(
          0,
          Math.min(100, (value / maxima[rateIndex]) * 100),
        );
        fill.style.width = `${Math.round(percentage * 1_000) / 1_000}%`;
        track.append(fill);
        content.append(track);
      }
      cell.append(content);
      row.append(cell);
    }
  });
}

function appendLeaderboardDivRates(rows) {
  const leaderboard = document.querySelector(
    'div[class*="LeaderboardPanel_leaderboardTable"]',
  );
  if (!leaderboard || !rows.length) return;
  let head = leaderboard.parentElement.querySelector(
    ":scope > .mwi-guild-div-rate-head",
  );
  if (!head) {
    head = document.createElement("div");
    head.className = "mwi-guild-div-rate-head";
    head.append(
      Object.assign(document.createElement("span"), {
        textContent: t("近 6 小时 XP/h", "6h XP/h"),
      }),
      Object.assign(document.createElement("span"), {
        textContent: t("24 小时 XP/h", "24h XP/h"),
      }),
    );
    leaderboard.before(head);
  }
  const guildNames = [
    ...leaderboard.querySelectorAll('[class*="LeaderboardPanel_guildName"]'),
  ];
  guildNames.forEach((name, index) => {
    let row = name;
    while (row.parentElement && row.parentElement !== leaderboard) {
      row = row.parentElement;
    }
    row.querySelector(":scope > .mwi-guild-div-rates")?.remove();
    const rates = rateCache.get(objectKey("leaderboard", rows[index]));
    const cells = document.createElement("div");
    cells.className = "mwi-guild-div-rates";
    for (const value of [rates?.recent, rates?.day]) {
      const cell = document.createElement("span");
      cell.dataset.sortValue = Number.isFinite(value) ? String(value) : "-1";
      cell.textContent = rateText(value, !rates?.lastSampleAt);
      cells.append(cell);
    }
    row.append(cells);
  });
}

function renderGuildTables() {
  if (runtime.settings.get("guildMemberXp")) {
    const memberTable = document.querySelector(
      'div[class*="GuildPanel_membersTab"] table',
    );
    appendRateColumns(
      memberTable,
      runtime.state.guildCharacters,
      "member",
      entityId(runtime.state.guild),
    );
  }
  if (runtime.settings.get("guildLeaderboardXp")) {
    const leaderboardTable = document.querySelector(
      'div[class*="Leaderboard"] table',
    );
    appendRateColumns(
      leaderboardTable,
      runtime.state.guildLeaderboard,
      "leaderboard",
    );
    if (!leaderboardTable) {
      appendLeaderboardDivRates(runtime.state.guildLeaderboard);
    }
  }
}

runtime.features.register({
  id: "guildXpTracking",
  setting: "guildXpTracking",
  scope: "character",
  initialize({ scope }) {
    sampleGuildState(false);
    scope.add(
      runtime.onMessage("guild_updated", () => sampleGuildState(false)),
    );
    scope.add(
      runtime.onMessage("guild_characters_updated", () =>
        sampleGuildState(false),
      ),
    );
    scope.add(
      runtime.onMessage("leaderboard_updated", () => sampleGuildState(true)),
    );
  },
});

runtime.features.register({
  id: "guildOverview",
  setting: "guildOverview",
  scope: "character",
  dependsOn: ["guildXpTracking"],
  initialize({ scope }) {
    addStyles();
    renderGuildOverview();
    scope.interval(renderGuildOverview, 1500);
    scope.add(() =>
      document
        .querySelectorAll(".mwi-guild-xp-card")
        .forEach((node) => node.remove()),
    );
  },
});

for (const id of ["guildMemberXp", "guildLeaderboardXp", "guildIdleMembers"]) {
  runtime.features.register({
    id,
    setting: id,
    scope: "character",
    dependsOn:
      id === "guildIdleMembers"
        ? ["guildXpTracking", "guildOverview"]
        : ["guildXpTracking"],
    initialize({ scope }) {
      addStyles();
      renderGuildTables();
      if (id === "guildIdleMembers") renderGuildOverview();
      if (id !== "guildIdleMembers") scope.interval(renderGuildTables, 1500);
      scope.add(() => {
        if (id === "guildIdleMembers") {
          document
            .querySelectorAll(".mwi-guild-idle")
            .forEach((node) => node.remove());
          return;
        }
        const kind = id === "guildMemberXp" ? "member" : "leaderboard";
        document
          .querySelectorAll(`table.mwi-guild-${kind}-table`)
          .forEach((table) => {
            if (kind === "member") {
              table
                .closest(".mwi-guild-members-wide")
                ?.classList.remove("mwi-guild-members-wide");
            }
            table
              .querySelectorAll(
                ".mwi-guild-rate-cell,.mwi-guild-recent-head,.mwi-guild-day-head,.mwi-guild-week-head",
              )
              .forEach((node) => node.remove());
            table.classList.remove(`mwi-guild-${kind}-table`);
          });
        if (kind === "leaderboard") {
          document
            .querySelectorAll(".mwi-guild-div-rate-head,.mwi-guild-div-rates")
            .forEach((node) => node.remove());
        }
      });
    },
  });
}

Object.assign(runtime.api, {
  sampleGuildState,
  renderGuildOverview,
  renderGuildTables,
  getGuildEntityXp: entityXp,
  getGuildWeeklyXpRate: entityWeeklyXpRate,
  getGuildXpRatePoints: guildXpRatePoints,
  isGuildMemberIdle,
});
