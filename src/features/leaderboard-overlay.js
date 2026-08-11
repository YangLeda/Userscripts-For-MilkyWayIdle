import { runtime } from "../core/runtime.js";

const OVERLAY_VERSION = "1.2.0";
const LEADERBOARD_API_URL =
  "https://mwi-guild.43.167.210.211.sslip.io/api/v1/leaderboards?categories=16";
const LEADERBOARD_CACHE_KEY = "MWITools_leaderboard_overlay_cache_v2";
const LEADERBOARD_REFRESH_INTERVAL = 15 * 60 * 1000;
const DEFAULT_ICON_BASE_URL =
  "https://mwi-guild.43.167.210.211.sslip.io/dist/icons/skills";
const STYLE_ID = "mwi-leaderboard-overlay-style";
const BADGE_CONTAINER_ATTRIBUTE = "data-mwi-leaderboard-badges";
const RATE_HEADER_ATTRIBUTE = "data-mwi-leaderboard-rate-header";
const RATE_CELL_ATTRIBUTE = "data-mwi-leaderboard-rate-cell";
const LEADERBOARD_TABLE_SELECTOR =
  'table[class*="LeaderboardPanel_leaderboardTable"]';
const DEFAULT_CATEGORIES = [
  ["milking", { zh: "挤奶", en: "Milking" }],
  ["foraging", { zh: "采摘", en: "Foraging" }],
  ["woodcutting", { zh: "伐木", en: "Woodcutting" }],
  ["cheesesmithing", { zh: "奶酪锻造", en: "Cheesesmithing" }],
  ["crafting", { zh: "制作", en: "Crafting" }],
  ["tailoring", { zh: "缝纫", en: "Tailoring" }],
  ["cooking", { zh: "烹饪", en: "Cooking" }],
  ["brewing", { zh: "冲泡", en: "Brewing" }],
  ["alchemy", { zh: "炼金", en: "Alchemy" }],
  ["enhancing", { zh: "强化", en: "Enhancing" }],
  ["attack", { zh: "攻击", en: "Attack" }],
  ["defense", { zh: "防御", en: "Defense" }],
  ["melee", { zh: "近战", en: "Melee" }],
  ["ranged", { zh: "远程", en: "Ranged" }],
  ["magic", { zh: "魔法", en: "Magic" }],
  ["fame_points", { zh: "名望", en: "Fame" }],
];

let activeInstances = 0;
let featureEnabled = false;
const controllers = new Set();

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function categoryLabel(value, fallback) {
  if (value && typeof value === "object") {
    return value[runtime.config.isZH ? "zh" : "en"] ?? fallback;
  }
  return String(value || fallback);
}

function normalizedName(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase();
}

function badgeTier(rank) {
  const value = Number(rank);
  if (!Number.isInteger(value) || value < 1 || value > 100) return null;
  if (value <= 20) return "diamond";
  if (value <= 50) return "gold";
  if (value <= 80) return "silver";
  return "bronze";
}

function roundedCompact(value, divisor, suffix) {
  const rounded = Math.round((value / divisor) * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}${suffix}`;
}

function validExperienceRate(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function formatExperienceRate(value) {
  const number = validExperienceRate(value);
  if (number == null) return "—";
  if (number >= 1_000_000) return roundedCompact(number, 1_000_000, "M");
  return roundedCompact(number, 1_000, "K");
}

function compareRateRows(left, right, mode) {
  const leftRate = validExperienceRate(left?.xpPerHour);
  const rightRate = validExperienceRate(right?.xpPerHour);
  const leftValid = leftRate != null;
  const rightValid = rightRate != null;
  const leftRank = Number(left?.rank) || Number.MAX_SAFE_INTEGER;
  const rightRank = Number(right?.rank) || Number.MAX_SAFE_INTEGER;
  if (mode === "official") return leftRank - rightRank;
  if (leftValid !== rightValid) return leftValid ? -1 : 1;
  if (!leftValid) return leftRank - rightRank;
  const rateDifference =
    mode === "ascending" ? leftRate - rightRate : rightRate - leftRate;
  return rateDifference || leftRank - rightRank;
}

function ensureStyles(documentRef) {
  if (documentRef.getElementById(STYLE_ID)) return;
  const mount = documentRef.head || documentRef.documentElement;
  if (!mount) {
    documentRef.addEventListener(
      "readystatechange",
      () => ensureStyles(documentRef),
      { once: true },
    );
    return;
  }
  const style = documentRef.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [${BADGE_CONTAINER_ATTRIBUTE}]{display:inline-flex;align-items:center;flex-wrap:wrap;gap:2px;margin-inline-start:4px;vertical-align:middle}
    [${BADGE_CONTAINER_ATTRIBUTE}][data-mwi-leaderboard-placement="profile"]{display:flex;flex-basis:100%;width:100%;margin-block-start:4px;margin-inline-start:0}
    .mwi-lb-badge{box-sizing:border-box;display:inline-flex;align-items:center;gap:1px;height:15px;min-height:15px;padding:0 3px 0 1px;border:1px solid;border-radius:999px;background:rgba(12,16,28,.78);color:#eef2ff;font:600 9px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.24);vertical-align:middle}
    .mwi-lb-badge-icon{display:block;flex:none;width:11px;height:11px;object-fit:contain}
    .mwi-lb-badge--diamond{border-color:transparent;color:#f4fbff;background:linear-gradient(rgba(10,17,30,.92),rgba(10,17,30,.92)) padding-box,conic-gradient(from 35deg,#fff 0 8%,#78d9ff 16%,#c6b7ff 29%,#f8ffff 43%,#66bdf4 57%,#e9fcff 72%,#93e9ff 86%,#fff) border-box;box-shadow:0 0 6px rgba(116,213,255,.5),inset 0 0 3px rgba(255,255,255,.16)}
    .mwi-lb-badge--gold{border-color:#d9aa38;color:#ffe8a3;box-shadow:0 0 5px rgba(217,170,56,.24)}
    .mwi-lb-badge--silver{border-color:#d8dee9;color:#f8fafc;box-shadow:0 0 4px rgba(226,232,240,.24)}
    .mwi-lb-badge--bronze{border-color:#b87333;color:#f2c49b;box-shadow:0 0 4px rgba(184,115,51,.24)}
    [${RATE_HEADER_ATTRIBUTE}]{cursor:pointer;user-select:none;white-space:nowrap}
    [${RATE_HEADER_ATTRIBUTE}]:hover{filter:brightness(1.18)}
    [${RATE_CELL_ATTRIBUTE}]{font-variant-numeric:tabular-nums;white-space:nowrap}
  `;
  mount.append(style);
}

function createBadgeIcon(documentRef, category, iconBaseUrl) {
  if (category !== "fame_points") {
    const icon = documentRef.createElement("img");
    icon.className = "mwi-lb-badge-icon";
    icon.src = `${iconBaseUrl}/${encodeURIComponent(category)}.png`;
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  const icon = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.classList.add("mwi-lb-badge-icon");
  icon.setAttribute("viewBox", "0 0 40 40");
  icon.setAttribute("aria-hidden", "true");
  const use = documentRef.createElementNS("http://www.w3.org/2000/svg", "use");
  const miscSprite =
    [...documentRef.querySelectorAll("use")]
      .map((element) => element.getAttribute("href") || "")
      .find((href) => href.includes("misc_sprite"))
      ?.split("#")[0] || "/static/media/misc_sprite.cfad291b.svg";
  use.setAttribute("href", `${miscSprite}#experience`);
  icon.append(use);
  return icon;
}

function createOverlay(options = {}) {
  const documentRef =
    options.document ?? (typeof document !== "undefined" ? document : null);
  if (!documentRef) {
    throw new Error("MWILeaderboardOverlay requires a document");
  }
  const categoryEntries =
    Array.isArray(options.categories) && options.categories.length
      ? options.categories
      : DEFAULT_CATEGORIES;
  const categoryOrder = categoryEntries.map(([category]) => category);
  const categoryLabels = Object.fromEntries(categoryEntries);
  const iconBaseUrl = String(
    options.iconBaseUrl || DEFAULT_ICON_BASE_URL,
  ).replace(/\/+$/, "");
  const state = {
    categories: {},
    nameIndex: new Map(),
    currentLeaderboard: null,
    sortMode: "official",
    refreshPending: false,
    destroyed: false,
    showBadges: options.showBadges !== false,
    showRates: options.showRates !== false,
  };

  ensureStyles(documentRef);

  function rebuildNameIndex() {
    const index = new Map();
    for (const category of categoryOrder) {
      const snapshot = state.categories?.[category];
      for (const row of Array.isArray(snapshot?.rows) ? snapshot.rows : []) {
        const name = normalizedName(row.characterName || row.name);
        const rank = Number(row.rank);
        const tier = badgeTier(rank);
        if (!name || !tier) continue;
        if (!index.has(name)) index.set(name, []);
        index.get(name).push({
          category,
          label: categoryLabels[category],
          rank,
          tier,
          capturedAt: snapshot.receivedAt || snapshot.capturedAt || null,
        });
      }
    }
    const categoryIndex = new Map(
      categoryOrder.map((category, position) => [category, position]),
    );
    for (const badges of index.values()) {
      badges.sort(
        (left, right) =>
          left.rank - right.rank ||
          (categoryIndex.get(left.category) ?? Number.MAX_SAFE_INTEGER) -
            (categoryIndex.get(right.category) ?? Number.MAX_SAFE_INTEGER),
      );
    }
    state.nameIndex = index;
  }

  function badgeSignature(badges) {
    return badges
      .map((item) => `${item.category}:${item.rank}:${item.capturedAt || ""}`)
      .join("|");
  }

  function renderNameBadges() {
    if (!state.showBadges) return;
    const nameElements = documentRef.querySelectorAll(
      '[class*="CharacterName_name"][data-name]',
    );
    for (const nameElement of nameElements) {
      const host = nameElement.parentElement;
      if (!host) continue;
      const profileRoot = nameElement.closest(
        '[class*="Header_characterInfo"],[class*="CharacterProfile_"],[class*="PlayerProfile_"],[class*="ProfilePage_"],[class*="ProfilePanel_"],[data-mwi-leaderboard-profile]',
      );
      const profileNameBlock = profileRoot
        ? nameElement.closest('[class*="Header_name"]')
        : null;
      const badgeMount = profileNameBlock || host;
      let container =
        badgeMount.querySelector(`:scope > [${BADGE_CONTAINER_ATTRIBUTE}]`) ||
        (badgeMount === host
          ? null
          : host.querySelector(`:scope > [${BADGE_CONTAINER_ATTRIBUTE}]`));
      if (nameElement.closest('[class*="LeaderboardPanel_"]')) {
        container?.remove();
        continue;
      }
      const badges =
        state.nameIndex.get(
          normalizedName(nameElement.getAttribute("data-name")),
        ) || [];
      const visibleBadges = nameElement.closest('[class*="ChatMessage_name"]')
        ? badges.slice(0, 3)
        : badges;
      if (!visibleBadges.length) {
        container?.remove();
        continue;
      }
      const profilePlacement = Boolean(profileRoot);
      const placement = profilePlacement ? "profile" : "inline";
      const signature = badgeSignature(visibleBadges);
      const previousPlacement =
        container?.dataset.mwiLeaderboardPlacement || "";
      if (!container) {
        container = documentRef.createElement("span");
        container.setAttribute(BADGE_CONTAINER_ATTRIBUTE, "");
      }
      container.dataset.mwiLeaderboardPlacement = placement;
      if (profilePlacement) {
        const profileName = profileNameBlock
          ? nameElement.closest('[class*="CharacterName_characterName"]') ||
            nameElement
          : nameElement;
        if (
          container.parentElement !== badgeMount ||
          container.previousElementSibling !== profileName
        ) {
          profileName.insertAdjacentElement("afterend", container);
        }
      } else if (!container.isConnected || previousPlacement === "profile") {
        host.append(container);
      }
      if (container.dataset.mwiLeaderboardSignature === signature) continue;
      container.dataset.mwiLeaderboardSignature = signature;
      container.replaceChildren(
        ...visibleBadges.map((item) => {
          const badge = documentRef.createElement("span");
          badge.className = `mwi-lb-badge mwi-lb-badge--${item.tier}`;
          const icon = createBadgeIcon(documentRef, item.category, iconBaseUrl);
          badge.append(icon, documentRef.createTextNode(`#${item.rank}`));
          const label = categoryLabel(item.label, item.category);
          badge.title = runtime.config.isZH
            ? `${label}排行榜第 ${item.rank} 名${item.capturedAt ? ` · ${item.capturedAt}` : ""}`
            : `${label} leaderboard rank #${item.rank}${item.capturedAt ? ` · ${item.capturedAt}` : ""}`;
          return badge;
        }),
      );
    }
  }

  function currentRowsByName() {
    return new Map(
      (state.currentLeaderboard?.rows || []).map((row) => [
        normalizedName(row.characterName || row.name),
        row,
      ]),
    );
  }

  function updateHeaderCopy(header) {
    const arrow =
      state.sortMode === "descending"
        ? " ↓"
        : state.sortMode === "ascending"
          ? " ↑"
          : "";
    const copy = `${t("经验/小时", "XP/hour")}${arrow}`;
    if (header.textContent !== copy) header.textContent = copy;
    header.title = t(
      "点击排序：降序 → 升序 → 官方原排名",
      "Click to sort: descending → ascending → official rank",
    );
    header.setAttribute(
      "aria-sort",
      state.sortMode === "descending"
        ? "descending"
        : state.sortMode === "ascending"
          ? "ascending"
          : "none",
    );
  }

  function applyTableSort(table, rowsByName) {
    const tbody = table.tBodies?.[0];
    if (!tbody) return;
    const rows = [...tbody.rows];
    rows.sort((left, right) => {
      const leftName = left
        .querySelector('[class*="CharacterName_name"][data-name]')
        ?.getAttribute("data-name");
      const rightName = right
        .querySelector('[class*="CharacterName_name"][data-name]')
        ?.getAttribute("data-name");
      return compareRateRows(
        rowsByName.get(normalizedName(leftName)),
        rowsByName.get(normalizedName(rightName)),
        state.sortMode,
      );
    });
    if (rows.some((row, index) => tbody.rows[index] !== row)) {
      rows.forEach((row) => tbody.append(row));
    }
  }

  function renderLeaderboardRateColumn() {
    if (!state.showRates) return;
    const current = state.currentLeaderboard;
    if (!current) return;
    const table = documentRef.querySelector(LEADERBOARD_TABLE_SELECTOR);
    if (!table) return;
    const headingRow = table.tHead?.rows?.[0];
    const tbody = table.tBodies?.[0];
    if (!headingRow || !tbody) return;
    let header = headingRow.querySelector(`[${RATE_HEADER_ATTRIBUTE}]`);
    if (!header) {
      header = documentRef.createElement("th");
      header.setAttribute(RATE_HEADER_ATTRIBUTE, "");
      header.addEventListener("click", () => {
        state.sortMode =
          state.sortMode === "official"
            ? "descending"
            : state.sortMode === "descending"
              ? "ascending"
              : "official";
        scheduleRefresh();
      });
      headingRow.append(header);
    }
    updateHeaderCopy(header);
    const rowsByName = currentRowsByName();
    for (const rowElement of tbody.rows) {
      const name = rowElement
        .querySelector('[class*="CharacterName_name"][data-name]')
        ?.getAttribute("data-name");
      const model = rowsByName.get(normalizedName(name));
      let cell = rowElement.querySelector(`[${RATE_CELL_ATTRIBUTE}]`);
      if (!cell) {
        cell = documentRef.createElement("td");
        cell.setAttribute(RATE_CELL_ATTRIBUTE, "");
        rowElement.append(cell);
      }
      const copy = formatExperienceRate(model?.xpPerHour);
      const rate = validExperienceRate(model?.xpPerHour);
      const title =
        rate != null
          ? `${Math.round(rate).toLocaleString()} ${t("经验/小时", "XP/hour")}`
          : t("缺少可比较的历史快照", "No comparable historical snapshot");
      if (cell.textContent !== copy) cell.textContent = copy;
      if (cell.title !== title) cell.title = title;
    }
    applyTableSort(table, rowsByName);
  }

  function refresh() {
    if (state.destroyed) return;
    if (state.showBadges) renderNameBadges();
    if (state.showRates) renderLeaderboardRateColumn();
  }

  function removeBadges() {
    documentRef
      .querySelectorAll(`[${BADGE_CONTAINER_ATTRIBUTE}]`)
      .forEach((element) => element.remove());
  }

  function removeRateColumn() {
    const table = documentRef.querySelector(LEADERBOARD_TABLE_SELECTOR);
    if (table && state.currentLeaderboard) {
      state.sortMode = "official";
      applyTableSort(table, currentRowsByName());
    }
    documentRef
      .querySelectorAll(`[${RATE_HEADER_ATTRIBUTE}],[${RATE_CELL_ATTRIBUTE}]`)
      .forEach((element) => element.remove());
  }

  function scheduleRefresh() {
    if (state.destroyed || state.refreshPending) return;
    state.refreshPending = true;
    const schedule =
      documentRef.defaultView?.requestAnimationFrame ||
      ((callback) => setTimeout(callback, 25));
    schedule(() => {
      state.refreshPending = false;
      refresh();
    });
  }

  const Observer =
    documentRef.defaultView?.MutationObserver ||
    (typeof MutationObserver !== "undefined" ? MutationObserver : null);
  if (!Observer) {
    throw new Error("MWILeaderboardOverlay requires MutationObserver");
  }
  const observer = new Observer(() => scheduleRefresh());
  const observe = () => {
    if (state.destroyed || !documentRef.documentElement) return;
    observer.observe(documentRef.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-name"],
    });
    scheduleRefresh();
  };
  if (documentRef.documentElement) observe();
  else
    documentRef.addEventListener("readystatechange", observe, { once: true });

  activeInstances += 1;
  return {
    setRankings(categories) {
      state.categories =
        categories && typeof categories === "object" ? categories : {};
      rebuildNameIndex();
      scheduleRefresh();
    },
    enhanceLeaderboard({ category, rows }) {
      if (!categoryOrder.includes(category)) return false;
      state.currentLeaderboard = {
        category,
        rows: Array.isArray(rows) ? rows : [],
      };
      state.sortMode = "official";
      scheduleRefresh();
      return true;
    },
    setDisplay({ badges = state.showBadges, rates = state.showRates } = {}) {
      const nextBadges = Boolean(badges);
      const nextRates = Boolean(rates);
      if (state.showBadges && !nextBadges) removeBadges();
      if (state.showRates && !nextRates) removeRateColumn();
      state.showBadges = nextBadges;
      state.showRates = nextRates;
      scheduleRefresh();
    },
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      observer.disconnect();
      removeBadges();
      removeRateColumn();
      activeInstances = Math.max(0, activeInstances - 1);
      if (activeInstances === 0) documentRef.getElementById(STYLE_ID)?.remove();
    },
  };
}

function create(options = {}) {
  let instance = null;
  let destroyed = false;
  let rankings = null;
  let leaderboard = null;
  let display = {
    badges: options.showBadges !== false,
    rates: options.showRates !== false,
  };
  const allowedCategories = new Set(
    (Array.isArray(options.categories) && options.categories.length
      ? options.categories
      : DEFAULT_CATEGORIES
    ).map(([category]) => category),
  );

  const mount = () => {
    if (destroyed || instance || !featureEnabled) return;
    instance = createOverlay({
      ...options,
      showBadges: display.badges,
      showRates: display.rates,
    });
    if (rankings) instance.setRankings(rankings);
    if (leaderboard) instance.enhanceLeaderboard(leaderboard);
  };

  const unmount = () => {
    instance?.destroy();
    instance = null;
  };

  const controller = {
    setRankings(categories) {
      rankings = categories && typeof categories === "object" ? categories : {};
      instance?.setRankings(rankings);
    },
    enhanceLeaderboard(payload = {}) {
      if (!allowedCategories.has(payload.category)) return false;
      leaderboard = {
        category: payload.category,
        rows: Array.isArray(payload.rows) ? payload.rows : [],
      };
      instance?.enhanceLeaderboard(leaderboard);
      return true;
    },
    setDisplay(next = {}) {
      display = {
        badges: next.badges ?? display.badges,
        rates: next.rates ?? display.rates,
      };
      instance?.setDisplay(display);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unmount();
      controllers.delete(controller);
    },
  };

  Object.defineProperties(controller, {
    enabled: {
      enumerable: true,
      get() {
        return featureEnabled && !destroyed;
      },
    },
    _mount: { value: mount },
    _unmount: { value: unmount },
  });
  controllers.add(controller);
  mount();
  return controller;
}

const leaderboardOverlayApi = {
  VERSION: OVERLAY_VERSION,
  create,
  formatExperienceRate,
  badgeTier,
  compareRateRows,
  get enabled() {
    return featureEnabled;
  },
};

function normalizeLeaderboardPayload(payload) {
  if (
    payload?.type !== "leaderboard_updated" ||
    payload?.leaderboardType !== "standard"
  ) {
    return null;
  }
  const leaderboard = payload.leaderboard;
  const category = String(
    payload.leaderboardCategory ?? leaderboard?.category ?? "",
  );
  if (
    leaderboard?.type !== "standard" ||
    leaderboard?.category !== category ||
    !DEFAULT_CATEGORIES.some(([key]) => key === category) ||
    !Array.isArray(leaderboard?.rows)
  ) {
    return null;
  }
  const rows = leaderboard.rows
    .map((row) => {
      const fame = category === "fame_points";
      return {
        characterId: Number(row?.characterId ?? row?.id),
        characterName: String(row?.characterName ?? row?.name ?? "").trim(),
        rank: Number(row?.rank),
        level: fame ? 0 : Number(row?.level ?? row?.value1),
        experience: Number(
          row?.experience ?? (fame ? row?.value1 : row?.value2),
        ),
        xpPerHour: validExperienceRate(row?.xpPerHour),
      };
    })
    .filter(
      (row) =>
        row.characterName &&
        Number.isInteger(row.rank) &&
        row.rank >= 1 &&
        row.rank <= 100,
    );
  return rows.length ? { category, rows } : null;
}

function normalizeCategories(value) {
  const allowed = new Set(DEFAULT_CATEGORIES.map(([category]) => category));
  return Object.fromEntries(
    Object.entries(value ?? {}).flatMap(([category, snapshot]) => {
      if (!allowed.has(category) || !Array.isArray(snapshot?.rows)) return [];
      const rows = snapshot.rows.filter(
        (row) =>
          String(row?.characterName ?? row?.name ?? "").trim() &&
          Number.isInteger(Number(row?.rank)) &&
          Number(row.rank) >= 1 &&
          Number(row.rank) <= 100,
      );
      return rows.length ? [[category, { ...snapshot, rows }]] : [];
    }),
  );
}

function loadCachedCategories() {
  try {
    const cached = JSON.parse(
      globalThis.localStorage?.getItem(LEADERBOARD_CACHE_KEY) || "null",
    );
    return cached?.schemaVersion === 1
      ? normalizeCategories(cached.categories)
      : {};
  } catch {
    return {};
  }
}

function saveCachedCategories(categories) {
  try {
    globalThis.localStorage?.setItem(
      LEADERBOARD_CACHE_KEY,
      JSON.stringify({ schemaVersion: 1, cachedAt: Date.now(), categories }),
    );
  } catch (error) {
    console.warn("[MWITools] Unable to cache leaderboard rankings", error);
  }
}

function requestLeaderboardCategories(onRequest) {
  const requestFn =
    typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
      ? GM.xmlHttpRequest
      : typeof GM_xmlhttpRequest === "function"
        ? GM_xmlhttpRequest
        : null;
  if (!requestFn) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    let watchdog;
    const finish = (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      if (Number(response?.status) < 200 || Number(response?.status) >= 300) {
        resolve(null);
        return;
      }
      try {
        const raw = response.responseText || response.response;
        const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
        resolve(
          payload?.schemaVersion === 1 &&
            payload?.leaderboardType === "standard"
            ? normalizeCategories(payload.categories)
            : null,
        );
      } catch {
        resolve(null);
      }
    };
    watchdog = setTimeout(() => finish(null), 10_500);
    try {
      const request = requestFn({
        method: "GET",
        url: LEADERBOARD_API_URL,
        timeout: 10_000,
        onload: finish,
        onabort: () => finish(null),
        onerror: () => finish(null),
        ontimeout: () => finish(null),
      });
      onRequest?.(request);
      if (request?.then) request.then(finish).catch(() => finish(null));
    } catch {
      finish(null);
    }
  });
}

const pageGlobal = globalThis.unsafeWindow ?? globalThis.window ?? globalThis;
try {
  Object.defineProperty(pageGlobal, "MWILeaderboardOverlay", {
    configurable: true,
    enumerable: true,
    value: leaderboardOverlayApi,
  });
} catch {
  pageGlobal.MWILeaderboardOverlay = leaderboardOverlayApi;
}

const integratedModes = new Set();
let integratedService = null;

function integratedDisplay() {
  return {
    badges: integratedModes.has("badges"),
    rates: integratedModes.has("rates"),
  };
}

function startIntegratedService() {
  const initialDisplay = integratedDisplay();
  const controller = create({
    showBadges: initialDisplay.badges,
    showRates: initialDisplay.rates,
  });
  let categories = loadCachedCategories();
  let currentLeaderboard = null;
  let active = true;
  let activeRequest = null;
  controller.setRankings(categories);

  const applyCurrentLeaderboard = () => {
    if (!currentLeaderboard) return;
    controller.enhanceLeaderboard({
      category: currentLeaderboard.category,
      rows:
        categories[currentLeaderboard.category]?.rows ??
        currentLeaderboard.rows,
    });
  };
  const refreshRankings = async () => {
    const response = await requestLeaderboardCategories((request) => {
      activeRequest = request;
    });
    activeRequest = null;
    if (!active || !response) return;
    categories = response;
    saveCachedCategories(categories);
    controller.setRankings(categories);
    applyCurrentLeaderboard();
  };
  const stopMessages = runtime.onMessage("leaderboard_updated", (payload) => {
    const normalized = normalizeLeaderboardPayload(payload);
    if (!normalized) return;
    currentLeaderboard = normalized;
    if (!categories[normalized.category]) {
      categories = {
        ...categories,
        [normalized.category]: {
          receivedAt: new Date().toISOString(),
          rows: normalized.rows,
        },
      };
      controller.setRankings(categories);
    }
    applyCurrentLeaderboard();
  });
  const interval = setInterval(
    () => void refreshRankings(),
    LEADERBOARD_REFRESH_INTERVAL,
  );
  void refreshRankings();

  return {
    controller,
    stop() {
      active = false;
      clearInterval(interval);
      stopMessages();
      activeRequest?.abort?.();
      controller.destroy();
    },
  };
}

function activateIntegratedMode(mode) {
  integratedModes.add(mode);
  if (!featureEnabled) {
    featureEnabled = true;
    for (const controller of controllers) controller._mount();
  }
  if (!integratedService) integratedService = startIntegratedService();
  else integratedService.controller.setDisplay(integratedDisplay());

  return () => {
    integratedModes.delete(mode);
    if (integratedModes.size) {
      integratedService?.controller.setDisplay(integratedDisplay());
      return;
    }
    integratedService?.stop();
    integratedService = null;
    featureEnabled = false;
    for (const controller of controllers) controller._unmount();
  };
}

runtime.features.register({
  id: "leaderboardOverlay",
  setting: "leaderboardOverlay",
  initialize() {
    return activateIntegratedMode("badges");
  },
});

runtime.features.register({
  id: "leaderboardXpRate",
  setting: "leaderboardXpRate",
  initialize() {
    return activateIntegratedMode("rates");
  },
});

export {
  OVERLAY_VERSION,
  badgeTier,
  compareRateRows,
  create,
  formatExperienceRate,
  leaderboardOverlayApi,
  normalizeLeaderboardPayload,
};
