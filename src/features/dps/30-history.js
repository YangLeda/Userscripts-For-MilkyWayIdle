import {
  ACCENT,
  Settings,
  TOOLBAR_ICONS,
  el,
  formatDuration,
  iconElement,
} from "./00-bootstrap.js";
import {
  ClassSystem,
  DamageSources,
  TakenSources,
} from "./10-combat-sources.js";
import { Session } from "./20-session.js";

const langText = (zh, en) => (Settings.getLanguage() === "en" ? en : zh);

// ─── 战斗历史与活动缓存 ───────────────────────────────────────────────────────
const HistoryStore = (() => {
  const KEY = "kikimeter:history:v2",
    LEGACY_KEY = "kikimeter:history:v1",
    ACTIVE_KEY = "kikimeter:active:v2";
  const MAX_PER_TYPE = 10;
  let revision = 0;
  function validArray(raw) {
    try {
      const v = JSON.parse(raw || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }
  function migrateLegacy() {
    if (localStorage.getItem(KEY) !== null) return;
    const migrated = validArray(localStorage.getItem(LEGACY_KEY)).map(
      (e, i) => ({
        ...e,
        schemaVersion: 2,
        id: "legacy-" + (e.date || i),
        type: e.type || "combat",
        characterId: "legacy",
        combatKey: "legacy-" + i,
        startedAt: e.date,
        endedAt: e.date,
        durationMs: (e.durationSeconds || 0) * 1000,
        fragments: [
          {
            reason: "旧版记录",
            startedAt: e.date,
            endedAt: e.date,
            durationMs: (e.durationSeconds || 0) * 1000,
            teamDamage: e.teamDamage || 0,
          },
        ],
      }),
    );
    try {
      localStorage.setItem(KEY, JSON.stringify(migrated));
    } catch (e) {}
  }
  function entryKey(entry, index = 0) {
    return String(
      (entry &&
        (entry.id || entry.combatKey || entry.date || entry.startedAt)) ||
        "history-" + index,
    );
  }
  function trim(entries) {
    const counts = { combat: 0, labyrinth: 0, trial: 0 };
    return entries.filter((entry) => {
      if (entry && entry.favorite === true) return true;
      const type = (entry && entry.type) || "combat";
      counts[type] = (counts[type] || 0) + 1;
      return counts[type] <= MAX_PER_TYPE;
    });
  }
  function load() {
    migrateLegacy();
    const raw = validArray(localStorage.getItem(KEY)),
      data = trim(raw);
    if (data.length !== raw.length) {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch (e) {}
    }
    return data;
  }
  function writeWithQuotaRetry(entries) {
    let data = trim(entries);
    while (data.length >= 0) {
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        const idx = [...data]
          .reverse()
          .findIndex((x) => x && x.favorite !== true);
        if (idx < 0) return false;
        data.splice(data.length - 1 - idx, 1);
      }
    }
    return false;
  }
  function save(entry) {
    const type = entry.type || "combat";
    entry.type = type;
    const all = load(),
      key = entryKey(entry),
      previous = all.find((item, index) => entryKey(item, index) === key);
    if (previous && previous.favorite === true && entry.favorite !== false)
      entry.favorite = true;
    const h = all.filter((item, index) => entryKey(item, index) !== key);
    h.unshift(entry);
    writeWithQuotaRetry(h);
    revision++;
  }
  function updateEntry(id, updater) {
    const all = load(),
      index = all.findIndex((entry, i) => entryKey(entry, i) === String(id));
    if (index < 0) return false;
    const next = updater({ ...all[index] });
    if (next === null) all.splice(index, 1);
    else all[index] = next;
    const ok = writeWithQuotaRetry(all);
    if (ok) revision++;
    return ok;
  }
  return {
    push(entry) {
      save(entry);
    },
    getAll(type) {
      const all = load();
      if (!type) return all;
      return all.filter((e) => (e.type || "combat") === type);
    },
    clear(type) {
      if (!type) {
        try {
          localStorage.removeItem(KEY);
        } catch (e) {}
        revision++;
        return;
      }
      const remaining = load().filter((e) => (e.type || "combat") !== type);
      try {
        localStorage.setItem(KEY, JSON.stringify(remaining));
      } catch (e) {}
      revision++;
    },
    setFavorite(id, value) {
      return updateEntry(id, (entry) => ({
        ...entry,
        favorite: !!value,
        favoritedAt: value ? new Date().toISOString() : undefined,
      }));
    },
    rename(id, name) {
      return updateEntry(id, (entry) => {
        const customName = String(name || "")
          .trim()
          .slice(0, 40);
        return { ...entry, customName: customName || undefined };
      });
    },
    remove(id) {
      return updateEntry(id, () => null);
    },
    entryKey,
    saveActive(snapshot) {
      try {
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(snapshot));
        return true;
      } catch (e) {
        return false;
      }
    },
    loadActive() {
      try {
        const v = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null");
        return v && v.schemaVersion === 2 ? v : null;
      } catch (e) {
        return null;
      }
    },
    clearActive() {
      try {
        localStorage.removeItem(ACTIVE_KEY);
      } catch (e) {}
    },
    getRevision: () => revision,
    keys: { history: KEY, active: ACTIVE_KEY },
  };
})();

// Details 式片段选择：收藏独立成组，其余历史按普通、迷宫和试炼显示。
const SegmentSelection = (() => {
  let selectedKey = "current";
  let cachedRevision = -1,
    cachedLanguage = "",
    cachedOptions = [];
  const bus = new EventTarget();
  const fightKey = (id) => "fight:" + encodeURIComponent(String(id));
  const fragmentKey = (id, index) =>
    "fragment:" + encodeURIComponent(String(id)) + ":" + index;
  function entryId(entry, index) {
    return entry.id || entry.combatKey || entry.date || "history-" + index;
  }
  function dateLabel(entry) {
    const d = new Date(entry.date || entry.startedAt || Date.now());
    const pad = (value) => String(value).padStart(2, "0");
    const type = entry.type || "combat";
    const typeLabel =
      Settings.getLanguage() === "en"
        ? { combat: "Combat", labyrinth: "Labyrinth", trial: "Trial" }[type] ||
          "Combat"
        : { combat: "普通", labyrinth: "迷宫", trial: "试炼" }[type] || "普通";
    const count = (entry.players || []).length;
    return Settings.getLanguage() === "en"
      ? `${typeLabel} ${count} players ${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
      : `${typeLabel} ${count}人 ${d.getMonth() + 1}月${d.getDate()}日${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function options() {
    const revision = HistoryStore.getRevision(),
      language = Settings.getLanguage();
    if (revision === cachedRevision && language === cachedLanguage)
      return cachedOptions;
    const out = [
      {
        key: "current",
        label: langText("当前战斗", "Current combat"),
        current: true,
      },
    ];
    const ordered = HistoryStore.getAll()
      .map((entry, index) => ({ entry, index }))
      .sort((left, right) => {
        const favoriteDiff =
          Number(right.entry.favorite === true) -
          Number(left.entry.favorite === true);
        if (favoriteDiff) return favoriteDiff;
        if (left.entry.favorite === true && right.entry.favorite === true) {
          const timeDiff =
            new Date(right.entry.favoritedAt || right.entry.date || 0) -
            new Date(left.entry.favoritedAt || left.entry.date || 0);
          if (timeDiff) return timeDiff;
        }
        const typeOrder = { combat: 0, labyrinth: 1, trial: 2 };
        const typeDiff =
          (typeOrder[left.entry.type || "combat"] ?? 9) -
          (typeOrder[right.entry.type || "combat"] ?? 9);
        if (typeDiff) return typeDiff;
        return left.index - right.index;
      });
    ordered.forEach(({ entry, index: entryIndex }) => {
      const id = entryId(entry, entryIndex);
      const favorite = entry.favorite === true,
        group = favorite ? "favorite" : entry.type || "combat";
      const displayName =
        favorite && entry.customName ? entry.customName : dateLabel(entry);
      out.push({
        key: fightKey(id),
        label: (favorite ? "★ " : "") + displayName,
        entry,
        group,
        favorite,
      });
      const parts = Array.isArray(entry.fragments) ? entry.fragments : [];
      if (parts.length > 1)
        parts.forEach((fragment, index) =>
          out.push({
            key: fragmentKey(id, index),
            label:
              langText("↳ 重连片段 ", "↳ Reconnect fragment ") +
              (index + 1) +
              " · " +
              formatDuration((Number(fragment.durationMs) || 0) / 1000),
            entry,
            fragment,
            fragmentIndex: index,
            group,
            favorite,
          }),
        );
    });
    cachedRevision = revision;
    cachedLanguage = language;
    cachedOptions = out;
    return cachedOptions;
  }
  function resolve() {
    const all = options();
    const found = all.find((x) => x.key === selectedKey);
    if (found) return found;
    selectedKey = "current";
    return all[0];
  }
  function select(key) {
    const next = options().some((x) => x.key === key) ? key : "current";
    if (next === selectedKey) return resolve();
    selectedKey = next;
    const selected = resolve();
    bus.dispatchEvent(new CustomEvent("change", { detail: selected }));
    return selected;
  }
  return {
    bus,
    options,
    resolve,
    select,
    getKey: () => selectedKey,
    isCurrent: () => selectedKey === "current",
  };
})();

function closeSegmentPicker(picker) {
  if (picker && picker._menu) {
    picker._menu.remove();
    picker._menu = null;
  }
  if (picker && Array.isArray(picker._sideMenus)) {
    picker._sideMenus.forEach((side) => side.remove());
    picker._sideMenus = [];
  }
  if (picker && picker._button)
    picker._button.style.borderColor = "rgba(212,175,55,.45)";
}

function buildSegmentMenu(picker) {
  closeSegmentPicker(picker);
  if (!(picker._collapsedGroups instanceof Set))
    picker._collapsedGroups = new Set();
  if (!(picker._expandedEntries instanceof Set))
    picker._expandedEntries = new Set();
  const menu = el("div", {
    position: "fixed",
    zIndex: "10003",
    width: "300px",
    maxHeight: "min(390px,72vh)",
    overflowY: "auto",
    padding: "4px",
    boxSizing: "border-box",
    background: "rgba(14,14,14,.995)",
    border: "1px solid rgba(212,175,55,.55)",
    borderRadius: "4px",
    boxShadow: "0 7px 24px rgba(0,0,0,.85)",
    color: "#f2f2f2",
    fontSize: "11px",
  });
  menu.id = "kikimeter-segment-menu";
  menu.dataset.kikimeter = "true";
  picker._menu = menu;
  const notify = () => {
    refreshSegmentSelect(picker);
    if (picker._onChanged) picker._onChanged();
  };
  const options = SegmentSelection.options();
  const addRecord = (item, fragment = false) => {
    const row = el("div", {
      display: "flex",
      alignItems: "center",
      minHeight: "28px",
      padding: fragment ? "4px 6px 4px 18px" : "4px 6px",
      boxSizing: "border-box",
      borderRadius: "3px",
      cursor: "pointer",
      whiteSpace: "nowrap",
    });
    row.dataset.segmentKey = item.key;
    const id = item.entry ? HistoryStore.entryKey(item.entry) : "";
    const fragments =
      !fragment && item.entry
        ? options.filter(
            (candidate) => candidate.fragment && candidate.entry === item.entry,
          )
        : [];
    if (fragments.length) {
      const expanded = picker._expandedEntries.has(id),
        disclosure = el("button", {
          width: "18px",
          height: "20px",
          padding: "0",
          marginRight: "2px",
          flexShrink: "0",
          cursor: "pointer",
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,.62)",
          fontSize: "11px",
        });
      disclosure.type = "button";
      disclosure.textContent = expanded ? "▾" : "▸";
      disclosure.title = expanded
        ? langText("收起重连片段", "Collapse reconnect fragments")
        : langText("展开重连片段", "Expand reconnect fragments");
      disclosure.addEventListener("click", (event) => {
        event.stopPropagation();
        expanded
          ? picker._expandedEntries.delete(id)
          : picker._expandedEntries.add(id);
        buildSegmentMenu(picker);
      });
      row.appendChild(disclosure);
    }
    const label = el("span", {
      overflow: "hidden",
      textOverflow: "ellipsis",
      flex: "1",
    });
    label.textContent = item.label;
    row.appendChild(label);
    row.addEventListener("mouseenter", () => {
      row.style.background = "rgba(212,175,55,.13)";
    });
    row.addEventListener("mouseleave", () => {
      row.style.background = "transparent";
    });
    row.addEventListener("click", () => {
      SegmentSelection.select(item.key);
      closeSegmentPicker(picker);
      notify();
    });
    if (item.entry && !fragment) {
      const miniButton = (text, title, color, handler) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.title = title;
        Object.assign(button.style, {
          width: "23px",
          height: "22px",
          padding: "0",
          marginLeft: "2px",
          cursor: "pointer",
          background: "transparent",
          border: "none",
          borderRadius: "3px",
          color,
          fontSize: "14px",
          lineHeight: "20px",
          flexShrink: "0",
        });
        button.addEventListener(
          "mouseenter",
          () => (button.style.background = "rgba(255,255,255,.12)"),
        );
        button.addEventListener(
          "mouseleave",
          () => (button.style.background = "transparent"),
        );
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          if (handler(event) !== false) {
            notify();
            buildSegmentMenu(picker);
          }
        });
        return button;
      };
      const star = miniButton(
        item.entry.favorite === true ? "★" : "☆",
        item.entry.favorite === true
          ? langText("取消收藏", "Remove favorite")
          : langText("收藏", "Favorite"),
        "#facc15",
        () => HistoryStore.setFavorite(id, item.entry.favorite !== true),
      );
      const rename =
        item.entry.favorite === true
          ? miniButton(
              "✎",
              langText("修改收藏名称", "Rename favorite"),
              "#93c5fd",
              () => {
                const defaultName =
                  item.entry.customName ||
                  String(item.label || "").replace(/^★\s*/, "");
                const input = document.createElement("input");
                input.type = "text";
                input.value = defaultName;
                input.maxLength = 40;
                Object.assign(input.style, {
                  minWidth: "0",
                  height: "22px",
                  flex: "1",
                  boxSizing: "border-box",
                  padding: "2px 5px",
                  background: "#090909",
                  border: "1px solid #93c5fd",
                  borderRadius: "3px",
                  outline: "none",
                  color: "#fff",
                  font: "inherit",
                });
                let finished = false;
                const finish = (save) => {
                  if (finished) return;
                  finished = true;
                  if (save) HistoryStore.rename(id, input.value);
                  notify();
                  buildSegmentMenu(picker);
                };
                input.addEventListener("mousedown", (event) =>
                  event.stopPropagation(),
                );
                input.addEventListener("click", (event) =>
                  event.stopPropagation(),
                );
                input.addEventListener("keydown", (event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    finish(true);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    finish(false);
                  }
                });
                input.addEventListener("blur", () => finish(true), {
                  once: true,
                });
                label.replaceWith(input);
                input.focus();
                input.select();
                return false;
              },
            )
          : null;
      const remove = miniButton(
        "✕",
        langText("删除记录", "Delete record"),
        "#f87171",
        () => {
          const selected = SegmentSelection.resolve();
          if (selected.entry && HistoryStore.entryKey(selected.entry) === id)
            SegmentSelection.select("current");
          HistoryStore.remove(id);
        },
      );
      if (rename) row.append(rename);
      row.append(star, remove);
    }
    menu.appendChild(row);
  };
  const current = options.find((item) => item.current);
  if (current) addRecord(current);
  [
    ["favorite", langText("收藏", "Favorites")],
    ["combat", langText("普通", "Combat")],
    ["labyrinth", langText("迷宫", "Labyrinth")],
    ["trial", langText("试炼", "Trial")],
  ].forEach(([group, title]) => {
    const records = options.filter(
      (item) => !item.current && item.group === group,
    );
    if (!records.length) return;
    const count = records.filter((item) => !item.fragment).length,
      collapsed = picker._collapsedGroups.has(group);
    const heading = el("div", {
      display: "flex",
      alignItems: "center",
      gap: "5px",
      padding: "7px 7px 4px",
      color: ACCENT,
      fontSize: "10px",
      fontWeight: "700",
      borderTop: "1px solid rgba(255,255,255,.08)",
      cursor: "pointer",
      userSelect: "none",
    });
    heading.textContent =
      (collapsed ? "▸ " : "▾ ") + title + "（" + count + "）";
    heading.title = collapsed
      ? langText(`展开${title}`, `Expand ${title}`)
      : langText(`折叠${title}`, `Collapse ${title}`);
    heading.addEventListener("click", (event) => {
      event.stopPropagation();
      collapsed
        ? picker._collapsedGroups.delete(group)
        : picker._collapsedGroups.add(group);
      buildSegmentMenu(picker);
    });
    menu.appendChild(heading);
    if (!collapsed)
      records
        .filter((item) => !item.fragment)
        .forEach((item) => {
          addRecord(item);
          if (picker._expandedEntries.has(HistoryStore.entryKey(item.entry)))
            records
              .filter(
                (fragment) =>
                  fragment.fragment && fragment.entry === item.entry,
              )
              .forEach((fragment) => addRecord(fragment, true));
        });
  });
  document.body.appendChild(menu);
  const rect = picker.getBoundingClientRect(),
    menuHeight = menu.offsetHeight || 300;
  const top =
    rect.bottom + 3 + menuHeight <= window.innerHeight
      ? rect.bottom + 3
      : Math.max(4, rect.top - menuHeight - 3);
  const left = Math.max(4, Math.min(rect.right - 300, window.innerWidth - 304));
  Object.assign(menu.style, { left: left + "px", top: top + "px" });
  picker._button.style.borderColor = ACCENT;
}
function buildSegmentPicker(onChanged, compact = false) {
  const picker = el("div", {
    position: "relative",
    minWidth: "0",
    flex: compact ? "none" : "1",
  });
  picker.dataset.kikimeter = "true";
  picker.dataset.segmentPicker = "true";
  picker._compact = compact;
  const button = document.createElement("button");
  button.type = "button";
  Object.assign(button.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "6px",
    width: "100%",
    minWidth: "0",
    background: "#121212",
    color: "#f2f2f2",
    border: "1px solid rgba(212,175,55,.45)",
    borderRadius: "3px",
    padding: "4px 6px",
    fontSize: "11px",
    cursor: "pointer",
  });
  const textEl = el("span", {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    }),
    arrow = el("span", { opacity: ".65" });
  arrow.textContent = "▾";
  if (compact) {
    Object.assign(button.style, {
      width: "25px",
      height: "23px",
      padding: "0",
      justifyContent: "center",
      background: "transparent",
      borderColor: "transparent",
    });
    const historyIcon = iconElement(TOOLBAR_ICONS.history, "");
    Object.assign(historyIcon.style, {
      width: "17px",
      height: "17px",
      objectFit: "contain",
      pointerEvents: "none",
    });
    textEl.appendChild(historyIcon);
    button.appendChild(textEl);
  } else button.append(textEl, arrow);
  picker.appendChild(button);
  picker._button = button;
  picker._text = textEl;
  picker._onChanged = onChanged;
  button.addEventListener("mousedown", (event) => event.stopPropagation());
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    picker._menu ? closeSegmentPicker(picker) : buildSegmentMenu(picker);
  });
  document.addEventListener("pointerdown", (event) => {
    if (
      picker._menu &&
      !picker.contains(event.target) &&
      !picker._menu.contains(event.target)
    )
      closeSegmentPicker(picker);
  });
  refreshSegmentSelect(picker);
  return picker;
}

function refreshSegmentSelect(picker) {
  if (!picker || !picker._text) return;
  const selected = SegmentSelection.resolve();
  picker.value = selected.key;
  if (!picker._compact) picker._text.textContent = selected.label;
  const english = Settings.getLanguage() === "en";
  picker.title =
    (selected.current
      ? english
        ? "Select combat record"
        : "选择战斗记录"
      : (english ? "Viewing: " : "正在查看：") + selected.label) +
    (picker._compact
      ? english
        ? " | Open combat history"
        : "｜点击展开历史"
      : "");
}
// 把实时 Session 或选中的历史/断线片段整理成同一份排行数据。
const ViewData = (() => {
  function graphPoints(graph) {
    const damage = graph && Array.isArray(graph.damage) ? graph.damage : [];
    const boss = graph && Array.isArray(graph.boss) ? graph.boss : [];
    return damage.map((value, index) => ({
      dps: (Number(value) || 0) / 2,
      isBoss: !!boss[index],
    }));
  }
  function damageBreakdown(raw, total, elapsed, playerName = "") {
    const merged = new Map();
    Object.entries(raw || {}).forEach(([source, value]) => {
      const canonical = DamageSources.canonical(source, playerName),
        amount = Number(value) || 0;
      if (amount <= 0) return;
      const item = merged.get(canonical) || {
        value: 0,
        displaySource: canonical,
      };
      item.value += amount;
      // 普通版与“含特效版”合计为一行；只要任一笔包含特效，就保留
      // 该说明，但排行、总量和百分比都按合并后的技能计算。
      if (DamageSources.isCombined(source)) item.displaySource = source;
      merged.set(canonical, item);
    });
    const sources = [...merged].map(([source, item]) => ({
      source: item.displaySource,
      label: DamageSources.label(item.displaySource),
      value: item.value,
    }));
    const recorded = sources.reduce((sum, item) => sum + item.value, 0),
      missing = Math.max(0, (Number(total) || 0) - recorded);
    if (missing > 0.0001)
      sources.push({
        source: "legacy",
        label: DamageSources.label("legacy"),
        value: missing,
      });
    return sources
      .sort((a, b) => b.value - a.value)
      .map((item) => ({
        ...item,
        ps: elapsed > 0 ? item.value / elapsed : 0,
        pct: total > 0 ? (item.value * 100) / total : 0,
      }));
  }
  function takenBreakdown(raw, total, elapsed) {
    const sources = Object.entries(raw || {})
      .map(([source, value]) => ({
        source,
        label: TakenSources.label(source),
        icon: TakenSources.icon(source),
        value: Number(value) || 0,
      }))
      .filter((item) => item.value > 0);
    const recorded = sources.reduce((sum, item) => sum + item.value, 0),
      missing = Math.max(0, (Number(total) || 0) - recorded);
    if (missing > 0.0001)
      sources.push({
        source: "",
        label:
          Settings.getLanguage() === "en"
            ? "Legacy / Unknown Source"
            : "旧记录／未知来源",
        icon: DamageSources.icon("unknown"),
        value: missing,
      });
    return sources
      .sort((a, b) => b.value - a.value)
      .map((item) => ({
        ...item,
        ps: elapsed > 0 ? item.value / elapsed : 0,
        pct: total > 0 ? (item.value * 100) / total : 0,
      }));
  }
  function current() {
    const elapsed = Session.getElapsedSeconds(),
      names = Session.getAllPlayerNames();
    return {
      key: "current",
      label: langText("当前战斗", "Current combat"),
      current: true,
      type: Session.getMeta().type || "combat",
      elapsed,
      teamDamage: Session.getTeamDamage(),
      teamDps: Session.getTeamDps(),
      teamKills: Session.getTeamKills(),
      fragmentCount: Session.getFragments().length,
      graphPoints: Session.getFullGraphPoints(),
      players: names.map((name) => ({
        name,
        classId: ClassSystem.classFor(name),
        damage: Session.getPlayerDamage(name),
        dps: Session.getPlayerDps(name),
        healing: Session.getPlayerHealing(name),
        hps: Session.getPlayerHps(name),
        taken: Session.getPlayerTaken(name),
        takenPs: Session.getPlayerTakenPs(name),
        kills: Session.getPlayerKills(name),
        breakdown: damageBreakdown(
          Session.getPlayerDamageSources(name),
          Session.getPlayerDamage(name),
          elapsed,
          name,
        ),
        takenBreakdown: takenBreakdown(
          Session.getPlayerTakenSources(name),
          Session.getPlayerTaken(name),
          elapsed,
        ),
      })),
    };
  }
  function historical(selected) {
    const entry = selected.entry || {},
      fragment = selected.fragment;
    const elapsed = fragment
      ? (Number(fragment.durationMs) || 0) / 1000
      : Number(entry.durationSeconds) || (Number(entry.durationMs) || 0) / 1000;
    let players;
    if (fragment) {
      const maps = fragment.players || {},
        damage = maps.damage || {},
        healing = maps.healing || {},
        taken = maps.taken || {},
        kills = maps.kills || {};
      const names = [
        ...new Set([
          ...Object.keys(damage),
          ...Object.keys(healing),
          ...Object.keys(taken),
          ...Object.keys(kills),
        ]),
      ];
      const sources = maps.sources || {},
        takenSources = maps.takenSources || {};
      players = names.map((name) => ({
        name,
        classId: (entry.classes || {})[name],
        damage: Number(damage[name]) || 0,
        healing: Number(healing[name]) || 0,
        taken: Number(taken[name]) || 0,
        kills: Number(kills[name]) || 0,
        dps: elapsed > 0 ? (Number(damage[name]) || 0) / elapsed : 0,
        hps: elapsed > 0 ? (Number(healing[name]) || 0) / elapsed : 0,
        takenPs: elapsed > 0 ? (Number(taken[name]) || 0) / elapsed : 0,
        breakdown: damageBreakdown(
          sources[name],
          Number(damage[name]) || 0,
          elapsed,
          name,
        ),
        takenBreakdown: takenBreakdown(
          takenSources[name],
          Number(taken[name]) || 0,
          elapsed,
        ),
      }));
    } else {
      players = (entry.players || []).map((p) => ({
        ...p,
        takenPs: elapsed > 0 ? (Number(p.taken) || 0) / elapsed : 0,
        breakdown: damageBreakdown(
          p.sources,
          Number(p.damage) || 0,
          elapsed,
          p.name,
        ),
        takenBreakdown: takenBreakdown(
          p.takenSources,
          Number(p.taken) || 0,
          elapsed,
        ),
      }));
    }
    players.forEach((p) => {
      if (p.classId) ClassSystem.setDetected(p.name, p.classId);
    });
    const teamDamage = fragment
      ? Number(fragment.teamDamage) ||
        players.reduce((s, p) => s + (Number(p.damage) || 0), 0)
      : Number(entry.teamDamage) || 0;
    const teamKills = players.reduce((s, p) => s + (Number(p.kills) || 0), 0);
    return {
      key: selected.key,
      label: selected.label,
      current: false,
      type: entry.type || "combat",
      elapsed,
      teamDamage,
      teamDps: elapsed > 0 ? teamDamage / elapsed : 0,
      teamKills,
      fragmentCount: fragment ? 1 : (entry.fragments || []).length || 1,
      graphPoints: fragment ? [] : graphPoints(entry.graph),
      players,
    };
  }
  function get() {
    const selected = SegmentSelection.resolve();
    return selected.current ? current() : historical(selected);
  }
  return { get };
})();

export {
  HistoryStore,
  SegmentSelection,
  ViewData,
  buildSegmentMenu,
  buildSegmentPicker,
  closeSegmentPicker,
  refreshSegmentSelect,
};
