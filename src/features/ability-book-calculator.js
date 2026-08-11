import { runtime } from "../core/runtime.js";

const STYLE_ID = "mwitools-ability-book-calculator-style";
const PANEL_CLASS = "mwi-ability-book-calculator";
const DICTIONARY_SELECTOR = '[class*="ItemDictionary_modalContent"]';

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function maxAbilityLevel(levelExperienceTable) {
  if (!Array.isArray(levelExperienceTable)) return 0;
  for (let index = levelExperienceTable.length - 1; index >= 1; index -= 1) {
    if (finite(levelExperienceTable[index]) !== null) return index;
  }
  return 0;
}

export function calculateAbilityBookRequirement({
  isLearned,
  currentLevel,
  currentExperience,
  targetLevel,
  experienceGain,
  levelExperienceTable,
}) {
  const maximumLevel = maxAbilityLevel(levelExperienceTable);
  const target = Number(targetLevel);
  const level = finite(currentLevel);
  const experience = finite(currentExperience);
  const perBook = finite(experienceGain);
  if (
    !Number.isInteger(target) ||
    target < 1 ||
    target > maximumLevel ||
    level === null ||
    experience === null ||
    perBook === null ||
    perBook <= 0
  ) {
    return { status: "invalid", maximumLevel };
  }
  const targetExperience = finite(levelExperienceTable[target]);
  if (targetExperience === null) return { status: "invalid", maximumLevel };
  if (isLearned && (level >= target || experience >= targetExperience)) {
    return {
      status: "reached",
      maximumLevel,
      targetExperience,
      unlockBooks: 0,
      levelingBooks: 0,
      totalBooks: 0,
    };
  }
  const unlockBooks = isLearned ? 0 : 1;
  const levelingBooks = Math.ceil(
    Math.max(0, targetExperience - experience) / perBook,
  );
  return {
    status: "ready",
    maximumLevel,
    targetExperience,
    unlockBooks,
    levelingBooks,
    totalBooks: unlockBooks + levelingBooks,
  };
}

function normalizeItemHrid(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.startsWith("/items/") ? raw : `/items/${raw.split("/").at(-1)}`;
}

function itemHridFromIcon(root) {
  const preferred = root?.querySelectorAll?.(
    '[class*="MarketplacePanel_currentItem"] svg use,[class*="MarketplacePanel_itemContainer"] svg use,[class*="ItemDictionary_item"] svg use',
  );
  const icons = preferred?.length
    ? preferred
    : (root?.querySelectorAll?.("svg use") ?? []);
  for (const use of icons) {
    const href =
      use.getAttribute("href") ?? use.getAttribute("xlink:href") ?? "";
    const fragment = href.split("#").at(-1);
    const itemHrid = normalizeItemHrid(fragment);
    if (runtime.state.initData_itemDetailMap?.[itemHrid]) return itemHrid;
  }
  return "";
}

function itemHridFromTitle(root) {
  const title = root?.querySelector?.('[class*="ItemDictionary_title"],h1,h2');
  const name = String(
    runtime.api.getOriTextFromElement?.(title) ?? title?.textContent ?? "",
  ).trim();
  if (!name) return "";
  const mapped = runtime.state.itemEnNameToHridMap?.[name];
  if (mapped) return mapped;
  const translatedItem = runtime.data.ZHToItemHridMap?.[name];
  if (translatedItem) return translatedItem;
  const translated = runtime.api.getOthersFromZhName?.(name);
  if (String(translated ?? "").startsWith("/abilities/")) {
    return String(translated).replace("/abilities/", "/items/");
  }
  return normalizeItemHrid(translated);
}

export function resolveAbilityBookItem(root) {
  const itemHrid = itemHridFromIcon(root) || itemHridFromTitle(root);
  return runtime.state.initData_itemDetailMap?.[itemHrid]?.abilityBookDetail
    ? itemHrid
    : "";
}

function abilityRecord(abilityHrid) {
  const source = runtime.state.initData_characterAbilities;
  if (source === null || source === undefined) return { ready: false };
  const records = Array.isArray(source) ? source : Object.values(source);
  const record = records.find(
    (candidate) => (candidate?.abilityHrid ?? candidate?.hrid) === abilityHrid,
  );
  if (!record) {
    return { ready: true, isLearned: false, level: 0, experience: 0 };
  }
  const experience = finite(
    record.experience ?? record.totalExperience ?? record.experiencePoints,
  );
  if (experience === null) return { ready: false };
  let level = finite(record.level);
  if (level === null) {
    level = 0;
    const table = runtime.state.initData_levelExperienceTable ?? [];
    for (let index = 1; index < table.length; index += 1) {
      if (finite(table[index]) !== null && experience >= Number(table[index])) {
        level = index;
      }
    }
  }
  return { ready: true, isLearned: true, level, experience };
}

function calculatorData(itemHrid) {
  const item = runtime.state.initData_itemDetailMap?.[itemHrid];
  const detail = item?.abilityBookDetail;
  const table = runtime.state.initData_levelExperienceTable;
  if (!detail || !Array.isArray(table)) return { ready: false };
  const abilityHrid =
    detail.abilityHrid ?? itemHrid.replace("/items/", "/abilities/");
  const characterAbility = abilityRecord(abilityHrid);
  if (!characterAbility.ready) return { ready: false };
  return {
    ready: true,
    itemHrid,
    experienceGain: finite(detail.experienceGain),
    maximumLevel: maxAbilityLevel(table),
    levelExperienceTable: table,
    ...characterAbility,
  };
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${PANEL_CLASS}{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 10px;margin:8px 0;padding:8px 10px;border:1px solid rgba(255,255,255,.13);border-radius:6px;background:rgba(0,0,0,.16);color:var(--color-text-primary,#eee);font-size:.72rem;line-height:1.35}
    .${PANEL_CLASS} .mwi-book-title{grid-column:1/-1;font-size:.78rem;font-weight:700;color:var(--color-primary,#e0bc42)}
    .${PANEL_CLASS} .mwi-book-target{display:flex;align-items:center;gap:6px}
    .${PANEL_CLASS} input{width:68px;box-sizing:border-box;border:1px solid rgba(255,255,255,.2);border-radius:4px;background:rgba(0,0,0,.25);color:inherit;padding:3px 5px}
    .${PANEL_CLASS} .mwi-book-result,.${PANEL_CLASS} .mwi-book-cost,.${PANEL_CLASS} .mwi-book-state{grid-column:1/-1}
    .${PANEL_CLASS} .mwi-book-result{font-weight:650;color:#9fd7ab}
    .${PANEL_CLASS}[data-status="invalid"] .mwi-book-result{color:#ff9c8f}
    .${PANEL_CLASS} .mwi-book-muted{color:var(--color-text-secondary,#aaa)}
    @media(max-width:700px){.${PANEL_CLASS}{grid-template-columns:1fr;gap:4px}.${PANEL_CLASS}>*{grid-column:1!important}}
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function createPanel(onTargetChange) {
  const panel = document.createElement("section");
  panel.className = PANEL_CLASS;
  panel.dataset.surface = "dictionary";
  const title = document.createElement("div");
  title.className = "mwi-book-title";
  const state = document.createElement("div");
  state.className = "mwi-book-state";
  const perBook = document.createElement("div");
  perBook.className = "mwi-book-muted mwi-book-per-book";
  const target = document.createElement("label");
  target.className = "mwi-book-target";
  const targetText = document.createElement("span");
  const input = document.createElement("input");
  input.type = "number";
  input.step = "1";
  input.addEventListener("input", () => onTargetChange(panel, input.value));
  target.append(targetText, input);
  const result = document.createElement("div");
  result.className = "mwi-book-result";
  result.setAttribute("aria-live", "polite");
  const cost = document.createElement("div");
  cost.className = "mwi-book-cost mwi-book-muted";
  panel.append(title, state, perBook, target, result, cost);
  return panel;
}

function setPanelText(panel, selector, value) {
  const element = panel.querySelector(selector);
  if (element && element.textContent !== value) element.textContent = value;
}

function updatePanel(panel, itemHrid, targetValues) {
  panel.dataset.itemHrid = itemHrid;
  setPanelText(
    panel,
    ".mwi-book-title",
    t("技能书计算器", "Ability book calculator"),
  );
  const data = calculatorData(itemHrid);
  const input = panel.querySelector("input");
  const targetLabel = panel.querySelector(".mwi-book-target span");
  targetLabel.textContent = t("目标等级", "Target level");
  input.setAttribute("aria-label", targetLabel.textContent);
  if (!data.ready || !data.experienceGain || !data.maximumLevel) {
    panel.dataset.status = "waiting";
    input.disabled = true;
    setPanelText(
      panel,
      ".mwi-book-state",
      t("等待角色与技能书数据", "Waiting for character and ability-book data"),
    );
    setPanelText(panel, ".mwi-book-per-book", "");
    setPanelText(panel, ".mwi-book-result", "—");
    setPanelText(panel, ".mwi-book-cost", "");
    return;
  }
  input.disabled = false;
  input.min = "1";
  input.max = String(data.maximumLevel);
  const defaultTarget = Math.min(
    data.maximumLevel,
    Math.max(1, Number(data.level) + 1),
  );
  let target = Number(targetValues.get(itemHrid) ?? defaultTarget);
  if (!Number.isInteger(target)) target = defaultTarget;
  if (String(input.value) !== String(target)) input.value = String(target);
  targetValues.set(itemHrid, target);
  const exact = runtime.api.formatExactNumber ?? ((value) => String(value));
  setPanelText(
    panel,
    ".mwi-book-state",
    data.isLearned
      ? t(
          `当前 Lv.${data.level} · 总经验 ${exact(data.experience)}`,
          `Current Lv.${data.level} · total XP ${exact(data.experience)}`,
        )
      : t("当前：未学习", "Current: not learned"),
  );
  setPanelText(
    panel,
    ".mwi-book-per-book",
    t(
      `每本增加 ${exact(data.experienceGain)} 经验`,
      `${exact(data.experienceGain)} XP per book`,
    ),
  );
  const requirement = calculateAbilityBookRequirement({
    isLearned: data.isLearned,
    currentLevel: data.level,
    currentExperience: data.experience,
    targetLevel: target,
    experienceGain: data.experienceGain,
    levelExperienceTable: data.levelExperienceTable,
  });
  panel.dataset.status = requirement.status;
  let resultText;
  if (requirement.status === "invalid") {
    resultText = t(
      `目标等级必须为 1–${data.maximumLevel} 的整数`,
      `Target level must be an integer from 1 to ${data.maximumLevel}`,
    );
  } else if (requirement.status === "reached") {
    resultText = t("已达到目标 · 还需 0 本", "Target reached · 0 books needed");
  } else if (requirement.unlockBooks) {
    resultText = t(
      `解锁 1 + 升级 ${requirement.levelingBooks} = 合计 ${requirement.totalBooks} 本`,
      `Unlock 1 + level ${requirement.levelingBooks} = ${requirement.totalBooks} books total`,
    );
  } else {
    resultText = t(
      `升级还需 ${requirement.totalBooks} 本`,
      `${requirement.totalBooks} books needed to level`,
    );
  }
  setPanelText(panel, ".mwi-book-result", resultText);
  const books = requirement.totalBooks;
  const ask = runtime.api.getAskPrice?.(itemHrid, 0) ?? 0;
  let costText = "";
  if (requirement.status !== "invalid") {
    costText =
      books === 0
        ? t("参考购买成本：0", "Reference purchase cost: 0")
        : ask > 0
          ? t(
              `参考购买成本：${runtime.api.numberFormatter(books * ask)}（最低卖价 ${runtime.api.numberFormatter(ask)}/本）`,
              `Reference purchase cost: ${runtime.api.numberFormatter(books * ask)} (best ask ${runtime.api.numberFormatter(ask)}/book)`,
            )
          : t(
              "参考购买成本：暂无卖价",
              "Reference purchase cost: no ask price",
            );
  }
  setPanelText(panel, ".mwi-book-cost", costText);
}

function visiblePanels(selector) {
  const panels = [...document.querySelectorAll(selector)];
  const visible = panels.filter((panel) => panel.getClientRects().length);
  return visible.length ? visible : panels;
}

runtime.features.register({
  id: "skillbook",
  setting: "skillbook",
  scope: "character",
  initialize({ scope }) {
    addStyles();
    const targetValues = new Map();
    let refreshTimer = null;
    const updateSurface = (container, itemHrid) => {
      let panel = container.querySelector(
        `.${PANEL_CLASS}[data-surface="dictionary"]`,
      );
      if (!panel) {
        panel = createPanel((changedPanel, value) => {
          targetValues.set(changedPanel.dataset.itemHrid, Number(value));
          updatePanel(
            changedPanel,
            changedPanel.dataset.itemHrid,
            targetValues,
          );
        });
        container.appendChild(panel);
      }
      updatePanel(panel, itemHrid, targetValues);
    };
    const refresh = () => {
      for (const panel of visiblePanels(DICTIONARY_SELECTOR)) {
        const itemHrid = resolveAbilityBookItem(panel);
        const existing = panel.querySelector(
          `.${PANEL_CLASS}[data-surface="dictionary"]`,
        );
        if (itemHrid) updateSurface(panel, itemHrid);
        else existing?.remove();
      }
    };
    const schedule = () => {
      if (refreshTimer !== null) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refresh();
      }, 50);
    };
    const observer = new MutationObserver(schedule);
    scope.observer(observer, document.body, { childList: true, subtree: true });
    for (const type of [
      "init_client_data",
      "init_character_data",
      "abilities_updated",
      "character_abilities_updated",
      "action_completed",
      "market_item_values_updated",
      "market_item_order_books_updated",
    ]) {
      scope.add(runtime.onMessage(type, schedule));
    }
    scope.add(() => {
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      document
        .querySelectorAll(`.${PANEL_CLASS}`)
        .forEach((panel) => panel.remove());
      document.getElementById(STYLE_ID)?.remove();
    });
    refresh();
  },
});
