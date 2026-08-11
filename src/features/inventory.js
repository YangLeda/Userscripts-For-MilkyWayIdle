import { runtime } from "../core/runtime.js";

let inventoryRefreshTimer = null;
let inventoryDisplayVersion = 0;
const frozenInventoryDisplays = new Map();
const INVENTORY_SUMMARY_STYLE_ID = "mwitools-inventory-summary-style";

function addInventorySummaryStyles() {
  if (document.getElementById(INVENTORY_SUMMARY_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = INVENTORY_SUMMARY_STYLE_ID;
  style.textContent = `
    #script_inventory_summary {
      --mwi-inventory-heading-font-size: .875rem;
      --mwi-inventory-heading-line-height: 1.2;
      margin: .0625rem 0;
      color: var(--color-text-primary, #f3f5f7);
      font-size: var(--mwi-inventory-heading-font-size);
      line-height: var(--mwi-inventory-heading-line-height);
      text-align: left;
    }
    .mwi-inventory-summary-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: .0625rem;
    }
    .mwi-summary-card {
      --mwi-summary-accent: 120, 174, 255;
      min-width: 0;
      overflow: visible;
      border: 1px solid rgba(255, 255, 255, .08);
      border-left: 2px solid rgba(var(--mwi-summary-accent), .58);
      border-radius: .25rem;
      background: rgba(17, 20, 27, .72);
    }
    .mwi-summary-card--combat { --mwi-summary-accent: 238, 115, 103; }
    .mwi-summary-card--skilling { --mwi-summary-accent: 90, 200, 149; }
    .mwi-summary-card--assets { --mwi-summary-accent: 230, 181, 79; }
    .mwi-summary-toggle {
      display: flex;
      width: 100%;
      height: 1.125rem;
      min-height: 0;
      box-sizing: border-box;
      align-items: center;
      gap: .1875rem;
      padding: 0 .25rem;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: none;
    }
    .mwi-summary-toggle:hover { background: rgba(var(--mwi-summary-accent), .075); }
    .mwi-summary-toggle:focus-visible {
      outline: 2px solid rgba(var(--mwi-summary-accent), .72);
      outline-offset: -3px;
    }
    .mwi-summary-heading {
      display: flex;
      min-width: 0;
      flex: 1;
      align-items: baseline;
      gap: .1875rem;
    }
    .mwi-summary-label {
      flex: 0 0 auto;
      color: var(--color-text-secondary, #aeb5c0);
      font-size: inherit;
      font-weight: 600;
      white-space: nowrap;
    }
    .mwi-summary-value {
      min-width: 0;
      color: rgb(var(--mwi-summary-accent));
      font-size: inherit;
      font-weight: 750;
      line-height: inherit;
      overflow-wrap: anywhere;
    }
    .mwi-summary-chevron {
      width: .375rem;
      height: .375rem;
      margin: 0 .0625rem 0 0;
      flex: 0 0 .375rem;
      border-right: 1.5px solid rgba(255, 255, 255, .65);
      border-bottom: 1.5px solid rgba(255, 255, 255, .65);
      transform: rotate(45deg) translate(-2px, 2px);
      transition: transform .18s ease;
    }
    .mwi-summary-toggle[aria-expanded="true"] .mwi-summary-chevron {
      transform: rotate(225deg) translate(-2px, 2px);
    }
    .mwi-summary-details {
      margin: 0 .25rem 0 .5rem;
      animation: mwi-summary-reveal .16s ease-out;
    }
    .mwi-summary-stats {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
      padding: 0 0 0 .5rem;
    }
    .mwi-summary-stats::before {
      position: absolute;
      top: 0;
      bottom: .5em;
      left: 0;
      width: 1px;
      background: rgba(var(--mwi-summary-accent), .34);
      content: "";
    }
    .mwi-summary-stat {
      position: relative;
      display: flex;
      min-width: 0;
      align-items: baseline;
      justify-content: space-between;
      gap: .5rem;
      padding: 0 .25rem;
      font-size: inherit;
      line-height: inherit;
    }
    .mwi-summary-stat::before {
      position: absolute;
      top: 50%;
      left: -.5rem;
      width: .5rem;
      border-top: 1px solid rgba(var(--mwi-summary-accent), .34);
      content: "";
    }
    .mwi-summary-stat::after {
      position: absolute;
      top: calc(50% - 2px);
      left: calc(-.5rem - 2px);
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: rgb(var(--mwi-summary-accent));
      content: "";
    }
    .mwi-summary-stat-label {
      overflow: hidden;
      color: var(--color-text-secondary, #9da6b2);
      font-size: inherit;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mwi-summary-stat-value { color: #f3f5f7; font-size: inherit; font-weight: 650; }
    .mwi-asset-groups {
      display: grid;
      gap: 0;
      padding: 0 0 0 .5rem;
    }
    .mwi-asset-group {
      position: relative;
      overflow: visible;
    }
    .mwi-asset-group:not(:last-child)::after {
      position: absolute;
      top: .6em;
      bottom: -.6em;
      left: -.5rem;
      border-left: 1px solid rgba(var(--mwi-summary-accent), .34);
      content: "";
    }
    .mwi-asset-toggle {
      position: relative;
      display: flex;
      width: 100%;
      min-height: 0;
      align-items: center;
      gap: .25rem;
      padding: 0 .25rem;
      border: 0;
      background: transparent;
      color: var(--color-text-primary, #e8ebef);
      font: inherit;
      font-size: inherit;
      font-weight: 600;
      line-height: inherit;
      text-align: left;
      cursor: pointer;
    }
    .mwi-asset-toggle::before {
      position: absolute;
      top: 50%;
      left: -.5rem;
      width: .5rem;
      border-top: 1px solid rgba(var(--mwi-summary-accent), .34);
      content: "";
    }
    .mwi-asset-toggle:hover { background: rgba(255, 255, 255, .04); }
    .mwi-asset-toggle:focus-visible { outline: 1px solid rgb(var(--mwi-summary-accent)); outline-offset: -2px; }
    .mwi-asset-toggle .mwi-summary-chevron { margin: 0 2px 0 0; }
    .mwi-asset-subtotal {
      min-width: 0;
      margin-left: auto;
      color: rgb(var(--mwi-summary-accent));
      font-size: inherit;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      overflow-wrap: anywhere;
    }
    .mwi-asset-rows {
      position: relative;
      display: grid;
      gap: 0;
      margin-left: .25rem;
      padding: 0 .25rem 0 .5rem;
    }
    .mwi-asset-rows::before {
      position: absolute;
      top: 0;
      bottom: .5em;
      left: 0;
      width: 1px;
      background: rgba(var(--mwi-summary-accent), .25);
      content: "";
    }
    .mwi-asset-row {
      position: relative;
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: .5rem;
      padding: 0;
      color: var(--color-text-secondary, #aeb5c0);
      font-size: inherit;
      line-height: inherit;
    }
    .mwi-asset-row::before {
      position: absolute;
      top: 50%;
      left: -.5rem;
      width: .5rem;
      border-top: 1px solid rgba(var(--mwi-summary-accent), .25);
      content: "";
    }
    .mwi-asset-row .mwi-number, .mwi-asset-row > span:last-child { color: #f3f5f7; font-weight: 600; }
    .mwi-inventory-category-heading {
      display: flex !important;
      min-width: 0;
      align-items: center;
      gap: 8px;
    }
    .mwi-inventory-category-value {
      display: inline-flex;
      max-width: min(48%, 150px);
      align-items: center;
      overflow: hidden;
      padding: 2px 7px;
      border: 1px solid rgba(230, 181, 79, .22);
      border-radius: 999px;
      background: rgba(230, 181, 79, .09);
      color: #e6c778;
      font-size: .68rem;
      font-weight: 650;
      line-height: 1.25;
      letter-spacing: .015em;
      pointer-events: none;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    @keyframes mwi-summary-reveal {
      from { opacity: 0; transform: translateY(-3px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function numberHtml(value) {
  return `<span class="mwi-number" title="${runtime.api.formatExactNumber(value)}">${runtime.api.numberFormatter(value)}</span>`;
}

function syncInventorySummaryTypography(invElem, summary) {
  const categoryTitle = invElem.querySelector(
    '[class*="Inventory_categoryButton"]',
  );
  const computed = categoryTitle
    ? categoryTitle.ownerDocument?.defaultView?.getComputedStyle(categoryTitle)
    : null;
  const fontSize =
    Number.parseFloat(computed?.fontSize) > 0 ? computed.fontSize : ".875rem";
  const lineHeight =
    computed?.lineHeight && computed.lineHeight !== "normal"
      ? computed.lineHeight
      : "1.2";
  summary.style.setProperty("--mwi-inventory-heading-font-size", fontSize);
  summary.style.setProperty("--mwi-inventory-heading-line-height", lineHeight);
}

function scheduleNetworthRefresh() {
  if (!Array.isArray(runtime.state.initData_characterItems)) return;
  clearTimeout(inventoryRefreshTimer);
  inventoryRefreshTimer = setTimeout(() => calculateNetworth(), 100);
}

function inventoryDisplayKey() {
  const characterId = String(runtime.state.currentCharacterId ?? "").trim();
  if (!characterId) return "";
  return `${runtime.api.getMarketEnvironment?.() ?? "production"}:${characterId}`;
}

const INVENTORY_CATEGORY_ALIASES = {
  "/item_categories/currency": ["currency", "currencies", "货币"],
  "/item_categories/loot": ["loot", "loots", "战利品"],
  "/item_categories/scroll": ["scroll", "scrolls", "卷轴"],
  "/item_categories/labyrinth": ["labyrinth", "迷宫"],
  "/item_categories/dungeon_key": ["dungeon key", "dungeon keys", "地下城钥匙"],
  "/item_categories/food": ["food", "foods", "食物"],
  "/item_categories/drink": ["drink", "drinks", "饮料"],
  "/item_categories/ability_book": ["ability book", "ability books", "技能书"],
  "/item_categories/equipment": ["equipment", "装备"],
  "/item_categories/resource": ["resource", "resources", "资源"],
};

function normalizeCategoryLabel(value) {
  return String(value ?? "")
    .replace(/^[+−-]\s*/, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim()
    .toLowerCase();
}

function resolveInventoryCategoryHrid(grid, heading) {
  const itemName = grid
    .querySelector('div[class*="Item_itemContainer"] svg[aria-label]')
    ?.getAttribute("aria-label")
    ?.trim();
  if (itemName) {
    const englishName = runtime.config.isZHInGameSetting
      ? (runtime.api.getItemEnNameFromZhName?.(itemName) ?? itemName)
      : itemName;
    const itemHrid = runtime.state.itemEnNameToHridMap?.[englishName];
    const categoryHrid =
      runtime.state.initData_itemDetailMap?.[itemHrid]?.categoryHrid;
    if (categoryHrid) return categoryHrid;
  }

  const labels = [
    runtime.api.getOriTextFromElement?.(heading),
    heading.textContent,
  ].map(normalizeCategoryLabel);
  return Object.entries(INVENTORY_CATEGORY_ALIASES).find(([, aliases]) =>
    labels.some((label) => aliases.includes(label)),
  )?.[0];
}

function calculateInventoryCategoryValues() {
  const categoryValues = new Map();
  for (const item of runtime.state.initData_characterItems ?? []) {
    if (item?.itemLocationHrid !== "/item_locations/inventory") continue;
    if (
      item.itemHrid === "/items/cowbell" &&
      !runtime.api.shouldIncludeCowbellsInAssets()
    ) {
      continue;
    }
    const categoryHrid =
      runtime.state.initData_itemDetailMap?.[item.itemHrid]?.categoryHrid;
    if (!categoryHrid) continue;
    const value =
      Math.max(0, Number(item.count) || 0) *
      runtime.api.getAssetValue(item.itemHrid, item.enhancementLevel, {
        itemLocationHrid: item.itemLocationHrid,
      });
    categoryValues.set(
      categoryHrid,
      (categoryValues.get(categoryHrid) ?? 0) + value,
    );
  }

  return categoryValues;
}

function addInventoryCategoryValues(
  invElem,
  categoryValues = calculateInventoryCategoryValues(),
) {
  for (const category of invElem.children) {
    const grid = category.matches?.('[class*="Inventory_itemGrid"]')
      ? category
      : (category.querySelector(':scope > [class*="Inventory_itemGrid"]') ??
        category);
    const heading = grid.querySelector(
      ':scope > [class*="Inventory_label"],:scope > button[class*="Inventory_categoryButton"]',
    );
    if (!heading) continue;
    const categoryHrid = resolveInventoryCategoryHrid(grid, heading);
    if (!categoryHrid) continue;
    const total = categoryValues.get(categoryHrid) ?? 0;
    grid.dataset.mwitoolsInventoryCategory = "true";
    heading.classList.add("mwi-inventory-category-heading");
    heading.querySelector(":scope > .mwi-inventory-category-value")?.remove();

    const value = document.createElement("span");
    value.className = "mwi-inventory-category-value";
    value.title = `${runtime.config.isZH ? "分类价值" : "Category value"}: ${runtime.api.formatExactNumber(total)}`;
    value.textContent = `${runtime.config.isZH ? "价值" : "Value"} ${runtime.api.numberFormatter(total)}`;
    heading.appendChild(value);
  }
}

async function getFrozenInventoryDisplay(force = false) {
  const key = inventoryDisplayKey();
  if (!key) return null;
  if (!force && frozenInventoryDisplays.has(key)) {
    return frozenInventoryDisplays.get(key);
  }
  const snapshot = await runtime.api.refreshAssetSnapshot();
  if (!snapshot) return frozenInventoryDisplays.get(key) ?? null;
  const display = {
    snapshot,
    categoryValues: calculateInventoryCategoryValues(),
    version: ++inventoryDisplayVersion,
  };
  frozenInventoryDisplays.set(key, display);
  return display;
}

async function calculateNetworth(options = {}) {
  if (!Array.isArray(runtime.state.initData_characterItems)) return;
  const targetNodes = document.querySelectorAll(
    'div[class*="Inventory_items"]',
  );
  if (!targetNodes.length) return;

  const showWorth = runtime.settings.settingsMap.invWorth.isTrue;
  const showSort = runtime.settings.settingsMap.invSort.isTrue;
  const display = showWorth
    ? await getFrozenInventoryDisplay(options.force === true)
    : null;
  if (showWorth && !display) return;
  const snapshot = display?.snapshot;
  addInventorySummaryStyles();

  const addInventorySummary = (invElem) => {
    const { scores, values } = snapshot;

    const previousSummary = invElem.parentElement?.querySelector(
      "#script_inventory_summary",
    );
    const wasCombatScoreOpen =
      previousSummary?.querySelector("#buildScores")?.style.display === "block";
    const wasSkillingScoreOpen =
      previousSummary?.querySelector("#skillingScores")?.style.display ===
      "block";
    const wasNetworthOpen =
      previousSummary?.querySelector("#netWorthDetails")?.style.display ===
      "block";
    previousSummary?.remove();

    invElem.insertAdjacentHTML(
      "beforebegin",
      `<div id="script_inventory_summary">
        <div class="mwi-inventory-summary-grid">
          <section class="mwi-summary-card mwi-summary-card--combat">
            <button type="button" class="mwi-summary-toggle" id="toggleScores" aria-expanded="false" aria-controls="buildScores">
              <span class="mwi-summary-chevron" aria-hidden="true"></span>
              <span class="mwi-summary-heading">
                <span class="mwi-summary-label">${runtime.config.isZH ? "战斗着装评分：" : "Combat Gear Score: "}</span>
                <span class="mwi-summary-value">${runtime.api.formatScore(scores.battle.total)}</span>
              </span>
            </button>
            <div class="mwi-summary-details" id="buildScores" style="display: none;" hidden>
              <div class="mwi-summary-stats">
                <div class="mwi-summary-stat"><span class="mwi-summary-stat-label">${runtime.config.isZH ? "房屋：" : "House: "}</span><span class="mwi-summary-stat-value">${runtime.api.formatScore(scores.battle.house)}</span></div>
                <div class="mwi-summary-stat"><span class="mwi-summary-stat-label">${runtime.config.isZH ? "技能：" : "Abilities: "}</span><span class="mwi-summary-stat-value">${runtime.api.formatScore(scores.battle.abilities)}</span></div>
                <div class="mwi-summary-stat"><span class="mwi-summary-stat-label">${runtime.config.isZH ? "装备：" : "Equipment: "}</span><span class="mwi-summary-stat-value">${runtime.api.formatScore(scores.battle.equipment)}</span></div>
              </div>
            </div>
          </section>

          <section class="mwi-summary-card mwi-summary-card--skilling">
            <button type="button" class="mwi-summary-toggle" id="toggleSkillingScores" aria-expanded="false" aria-controls="skillingScores">
              <span class="mwi-summary-chevron" aria-hidden="true"></span>
              <span class="mwi-summary-heading">
                <span class="mwi-summary-label">${runtime.config.isZH ? "生活着装评分：" : "Skilling Gear Score: "}</span>
                <span class="mwi-summary-value">${runtime.api.formatScore(scores.skilling.total)}</span>
              </span>
            </button>
            <div class="mwi-summary-details" id="skillingScores" style="display: none;" hidden>
              <div class="mwi-summary-stats">
                <div class="mwi-summary-stat"><span class="mwi-summary-stat-label">${runtime.config.isZH ? "房屋：" : "House: "}</span><span class="mwi-summary-stat-value">${runtime.api.formatScore(scores.skilling.house)}</span></div>
                <div class="mwi-summary-stat"><span class="mwi-summary-stat-label">${runtime.config.isZH ? "工具：" : "Tools: "}</span><span class="mwi-summary-stat-value">${runtime.api.formatScore(scores.skilling.tools)}</span></div>
                <div class="mwi-summary-stat"><span class="mwi-summary-stat-label">${runtime.config.isZH ? "装备：" : "Equipment: "}</span><span class="mwi-summary-stat-value">${runtime.api.formatScore(scores.skilling.equipment)}</span></div>
              </div>
            </div>
          </section>

          <section class="mwi-summary-card mwi-summary-card--assets">
            <button type="button" class="mwi-summary-toggle" id="toggleNetWorth" aria-expanded="false" aria-controls="netWorthDetails">
              <span class="mwi-summary-chevron" aria-hidden="true"></span>
              <span class="mwi-summary-heading">
                <span class="mwi-summary-label">${runtime.config.isZH ? "总资产：" : "Total assets: "}</span>
                <span class="mwi-summary-value">${numberHtml(values.total)}</span>
              </span>
            </button>
            <div class="mwi-summary-details" id="netWorthDetails" style="display: none;" hidden>
              <div class="mwi-asset-groups">
                <section class="mwi-asset-group">
                  <button type="button" class="mwi-asset-toggle" id="toggleCurrentAssets" aria-expanded="false" aria-controls="currentAssets"><span class="mwi-summary-chevron" aria-hidden="true"></span><span>${runtime.config.isZH ? "流动资产" : "Liquid assets"}</span><span class="mwi-asset-subtotal">${numberHtml(values.liquid)}</span></button>
                  <div class="mwi-asset-rows" id="currentAssets" style="display: none;" hidden>
                    <div class="mwi-asset-row"><span>${runtime.config.isZH ? "装备：" : "Equipment: "}</span>${numberHtml(values.equipment)}</div>
                    <div class="mwi-asset-row"><span>${runtime.config.isZH ? "库存：" : "Inventory: "}</span>${numberHtml(values.inventory)}</div>
                    <div class="mwi-asset-row"><span>${runtime.config.isZH ? "市场订单：" : "Market orders: "}</span>${numberHtml(values.marketListings)}</div>
                  </div>
                </section>
                <section class="mwi-asset-group">
                  <button type="button" class="mwi-asset-toggle" id="toggleNonCurrentAssets" aria-expanded="false" aria-controls="nonCurrentAssets"><span class="mwi-summary-chevron" aria-hidden="true"></span><span>${runtime.config.isZH ? "非流动资产" : "Non-current assets"}</span><span class="mwi-asset-subtotal">${numberHtml(values.fixed)}</span></button>
                  <div class="mwi-asset-rows" id="nonCurrentAssets" style="display: none;" hidden>
                    <div class="mwi-asset-row"><span>${runtime.config.isZH ? "房屋：" : "Houses: "}</span>${numberHtml(values.houses)}</div>
                    <div class="mwi-asset-row"><span>${runtime.config.isZH ? "技能：" : "Abilities: "}</span>${numberHtml(values.abilities)}</div>
                    <div class="mwi-asset-row"><span>${runtime.config.isZH ? "不可交易代币：" : "Non-tradable tokens: "}</span>${numberHtml(values.nonTradableTokens)}</div>
                    <div class="mwi-asset-row"><span>${runtime.config.isZH ? "神龛：" : "Shrine: "}</span><span>${values.shrine === null ? "—" : numberHtml(values.shrine)}</span></div>
                  </div>
                </section>
              </div>
            </div>
          </section>
        </div>
      </div>`,
    );

    // 监听点击事件，控制折叠和展开
    const summary = invElem.parentElement.querySelector(
      "#script_inventory_summary",
    );
    syncInventorySummaryTypography(invElem, summary);
    const toggleScores = summary.querySelector("#toggleScores");
    const ScoreDetails = summary.querySelector("#buildScores");
    const toggleSkillingScores = summary.querySelector("#toggleSkillingScores");
    const skillingScoreDetails = summary.querySelector("#skillingScores");
    const toggleButton = summary.querySelector("#toggleNetWorth");
    const netWorthDetails = summary.querySelector("#netWorthDetails");
    const toggleCurrentAssets = summary.querySelector("#toggleCurrentAssets");
    const currentAssets = summary.querySelector("#currentAssets");
    const toggleNonCurrentAssets = summary.querySelector(
      "#toggleNonCurrentAssets",
    );
    const nonCurrentAssets = summary.querySelector("#nonCurrentAssets");

    const setExpanded = (button, panel, expanded) => {
      button.setAttribute("aria-expanded", String(expanded));
      panel.hidden = !expanded;
      panel.style.display = expanded ? "block" : "none";
    };

    if (wasNetworthOpen) {
      setExpanded(toggleButton, netWorthDetails, true);
      setExpanded(toggleCurrentAssets, currentAssets, true);
      setExpanded(toggleNonCurrentAssets, nonCurrentAssets, true);
    }
    if (wasCombatScoreOpen) {
      setExpanded(toggleScores, ScoreDetails, true);
    }
    if (wasSkillingScoreOpen) {
      setExpanded(toggleSkillingScores, skillingScoreDetails, true);
    }

    toggleScores.addEventListener("click", () => {
      const isCollapsed = ScoreDetails.style.display === "none";
      setExpanded(toggleScores, ScoreDetails, isCollapsed);
    });

    toggleSkillingScores.addEventListener("click", () => {
      const isCollapsed = skillingScoreDetails.style.display === "none";
      setExpanded(toggleSkillingScores, skillingScoreDetails, isCollapsed);
    });

    toggleButton.addEventListener("click", () => {
      const isCollapsed = netWorthDetails.style.display === "none";
      setExpanded(toggleButton, netWorthDetails, isCollapsed);
      setExpanded(toggleCurrentAssets, currentAssets, isCollapsed);
      setExpanded(toggleNonCurrentAssets, nonCurrentAssets, isCollapsed);
    });

    toggleCurrentAssets.addEventListener("click", () => {
      const isCollapsed = currentAssets.style.display === "none";
      setExpanded(toggleCurrentAssets, currentAssets, isCollapsed);
    });

    toggleNonCurrentAssets.addEventListener("click", () => {
      const isCollapsed = nonCurrentAssets.style.display === "none";
      setExpanded(toggleNonCurrentAssets, nonCurrentAssets, isCollapsed);
    });
  };

  const renderInventoryPanels = () => {
    for (const node of targetNodes) {
      if (showWorth) {
        node.classList.add("script_buildScore_added");
        const renderVersion = `${display.version}:${runtime.config.isZH ? "zh" : "en"}`;
        if (node.dataset.mwitoolsInventoryDisplayVersion !== renderVersion) {
          addInventorySummary(node);
          addInventoryCategoryValues(node, display.categoryValues);
          node.dataset.mwitoolsInventoryDisplayVersion = renderVersion;
        }
      }
      if (showSort || showWorth) {
        if (!node.classList.contains("script_invSort_added")) {
          node.classList.add("script_invSort_added");
          addInvSortButton(node);
        }
      }
    }
  };
  renderInventoryPanels();
}

/* 仓库物品排序 */
// by daluo, bot7420
function getInventorySortUnitValue(
  itemHrid,
  enhancementLevel = 0,
  order = "fair",
) {
  const derivedValue =
    Number(runtime.api.getAssetValue?.(itemHrid, enhancementLevel)) ||
    Number(runtime.api.getFairValue?.(itemHrid, enhancementLevel)) ||
    0;
  if (order === "ask") {
    return (
      Number(runtime.api.getAskPrice?.(itemHrid, enhancementLevel)) ||
      derivedValue
    );
  }
  if (order === "bid") {
    return (
      Number(runtime.api.getBidPrice?.(itemHrid, enhancementLevel)) ||
      derivedValue
    );
  }
  return derivedValue;
}

function getInventoryItemEnhancementLevel(itemElem) {
  const levelText =
    itemElem?.querySelector?.('[class*="Item_enhancementLevel"]')
      ?.textContent ?? "";
  return Number.parseInt(levelText.replace(/\D/g, ""), 10) || 0;
}

function isSortableInventoryCategory(typeName) {
  return typeName !== "Equipment";
}

async function addInvSortButton(invElem) {
  const showSort = runtime.settings.settingsMap.invSort.isTrue;
  const showWorth = runtime.settings.settingsMap.invWorth.isTrue;
  if (showSort) {
    const priceData = await runtime.api.fetchMarketJSON();
    if (!priceData?.marketData) {
      console.error("addInvSortButton fetchMarketJSON null");
      return;
    }
  }

  const fairButton = `<button
        id="script_sortByFair_btn"
        style="border-radius: 3px; background-color: ${runtime.config.SCRIPT_COLOR_MAIN}; color: black;">
        ${runtime.config.isZH ? "市场价值" : "Market Value"}
        </button>`;
  const askButton = `<button
        id="script_sortByAsk_btn"
        style="border-radius: 3px; background-color: ${runtime.config.SCRIPT_COLOR_MAIN}; color: black;">
        ${runtime.config.isZH ? "出售价" : "Ask"}
        </button>`;
  const bidButton = `<button
        id="script_sortByBid_btn"
        style="border-radius: 3px; background-color: ${runtime.config.SCRIPT_COLOR_MAIN}; color: black;">
        ${runtime.config.isZH ? "收购价" : "Bid"}
        </button>`;
  const noneButton = `<button
        id="script_sortByNone_btn"
        style="border-radius: 3px; background-color: ${runtime.config.SCRIPT_COLOR_MAIN}; color: black;">
        ${runtime.config.isZH ? "无" : "None"}
        </button>`;
  const refreshButton = `<button
        id="script_refresh_inventory_btn"
        style="border-radius: 3px; background-color: ${runtime.config.SCRIPT_COLOR_MAIN}; color: black;">
        ${runtime.config.isZH ? "刷新" : "Refresh"}
        </button>`;
  const buttonsDiv = `<div id="script_inv_sort_controls" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; font-size: 0.875rem; text-align: left; ">${
    showSort ? (runtime.config.isZH ? "物品排序：" : "Sort items by: ") : ""
  }${showSort ? `${fairButton} ${askButton} ${bidButton} ${noneButton}` : ""}${
    showWorth ? ` ${refreshButton}` : ""
  }</div>`;
  if (!invElem.isConnected || !invElem.parentElement) return;
  invElem.insertAdjacentHTML("beforebegin", buttonsDiv);

  const sortItemsBy = (order) => {
    for (const typeDiv of invElem.children) {
      const categoryButton = typeDiv.querySelector(
        '[class*="Inventory_categoryButton"]',
      );
      const typeName =
        runtime.api.getOriTextFromElement?.(categoryButton) ??
        categoryButton?.textContent ??
        "";
      if (!isSortableInventoryCategory(typeName)) {
        continue;
      }

      const label = typeDiv.querySelector('[class*="Inventory_label"]');
      if (label) label.style.order = Number.MIN_SAFE_INTEGER;

      const itemElems = [
        ...typeDiv.querySelectorAll('[class*="Item_itemContainer"]'),
      ];
      const sortableItems = itemElems.map((itemElem, originalIndex) => {
        let itemName =
          itemElem
            .querySelector("svg[aria-label]")
            ?.getAttribute("aria-label") ?? "";
        if (
          runtime.config.isZHInGameSetting &&
          typeof runtime.api.getItemEnNameFromZhName === "function"
        ) {
          itemName = runtime.api.getItemEnNameFromZhName(itemName);
        }
        const itemHrid = runtime.state.itemEnNameToHridMap[itemName];
        const enhancementLevel = getInventoryItemEnhancementLevel(itemElem);
        const countText =
          itemElem.querySelector('[class*="Item_count"]')?.textContent ?? "1";
        const parsedCount =
          runtime.api.parseCompactNumber?.(countText) ?? Number(countText);
        const itemCount = Number.isFinite(Number(parsedCount))
          ? Number(parsedCount)
          : 1;
        const values = {
          ask:
            getInventorySortUnitValue(itemHrid, enhancementLevel, "ask") *
            itemCount,
          bid:
            getInventorySortUnitValue(itemHrid, enhancementLevel, "bid") *
            itemCount,
          fair:
            getInventorySortUnitValue(itemHrid, enhancementLevel, "fair") *
            itemCount,
        };

        // 价格角标
        if (!itemElem.querySelector("#script_stack_price")) {
          itemElem.style.position = "relative";
          const priceElemHTML = `<div
                        id="script_stack_price"
                        style="z-index: 1; position: absolute; top: 2px; left: 2px; text-align: left;">
                    </div>`;
          const priceHost =
            itemElem.querySelector(
              '[class*="Item_item"][class*="Item_clickable"]',
            ) ?? itemElem;
          priceHost.insertAdjacentHTML("beforeend", priceElemHTML);
        }
        const priceElem = itemElem.querySelector("#script_stack_price");
        return { itemElem, originalIndex, priceElem, values };
      });

      if (order === "none") {
        for (const { itemElem, priceElem } of sortableItems) {
          itemElem.style.order = 0;
          priceElem.textContent = "";
        }
        continue;
      }

      sortableItems.sort(
        (left, right) =>
          right.values[order] - left.values[order] ||
          left.originalIndex - right.originalIndex,
      );
      for (const [
        rank,
        { itemElem, priceElem, values },
      ] of sortableItems.entries()) {
        // CSS order only accepts integers. Assigning -stackValue broke sorting
        // whenever a market value contained decimals or exceeded CSS limits.
        itemElem.style.order = rank;
        priceElem.textContent = runtime.api.numberFormatter(values[order]);
      }
    }
  };

  if (showSort) {
    invElem.parentElement
      .querySelector("button#script_sortByFair_btn")
      ?.addEventListener("click", () => sortItemsBy("fair"));
    invElem.parentElement
      .querySelector("button#script_sortByAsk_btn")
      ?.addEventListener("click", () => sortItemsBy("ask"));
    invElem.parentElement
      .querySelector("button#script_sortByBid_btn")
      ?.addEventListener("click", () => sortItemsBy("bid"));
    invElem.parentElement
      .querySelector("button#script_sortByNone_btn")
      ?.addEventListener("click", () => sortItemsBy("none"));
  }

  const refreshButtonElement = invElem.parentElement.querySelector(
    "button#script_refresh_inventory_btn",
  );
  refreshButtonElement?.addEventListener("click", async () => {
    const idleText = runtime.config.isZH ? "刷新" : "Refresh";
    refreshButtonElement.disabled = true;
    refreshButtonElement.textContent = runtime.config.isZH
      ? "刷新中…"
      : "Refreshing…";
    try {
      await calculateNetworth({ force: true });
    } finally {
      if (refreshButtonElement.isConnected) {
        refreshButtonElement.disabled = false;
        refreshButtonElement.textContent = idleText;
      }
    }
  });
}

/* 公会信用兑换选择弹窗排序 */
async function addGuildCreditConversionsSortButton() {
  const selectorContainer = document.querySelector(".ItemSelector_menu__12sEM");
  if (!selectorContainer) {
    return;
  }

  if (selectorContainer.querySelector("#script_itemSelector_sort_div")) {
    return;
  }

  const price_data = await runtime.api.fetchMarketJSON();
  if (!price_data || !price_data.marketData) {
    return;
  }

  // 预计算所有信用点类型的最佳兑换物品
  const bestCreditConversionMap = {};
  for (const itemHrid in runtime.state.initData_itemDetailMap) {
    if (
      runtime.state.initData_itemDetailMap[itemHrid]?.guildCreditConversions
    ) {
      const conversions =
        runtime.state.initData_itemDetailMap[itemHrid].guildCreditConversions;
      for (const conversion of conversions) {
        const creditHrid = conversion.creditItemHrid;
        let askPrice = 0;
        if (
          price_data.marketData[itemHrid] &&
          price_data.marketData[itemHrid][0]
        )
          askPrice = price_data.marketData[itemHrid][0].a;
        let bidPrice = 0;
        if (
          price_data.marketData[itemHrid] &&
          price_data.marketData[itemHrid][0]
        )
          bidPrice = price_data.marketData[itemHrid][0].b;
        if (askPrice === 0 && bidPrice === 0) continue;
        const creditAskPrice =
          (askPrice * conversion.itemCount) / conversion.creditCount;
        const creditBidPrice =
          (bidPrice * conversion.itemCount) / conversion.creditCount;
        const enName = runtime.state.initData_itemDetailMap[itemHrid].name;
        const zhName = runtime.data.ZHItemNames[itemHrid];
        const displayName = runtime.config.isZHInGameSetting
          ? zhName || enName
          : enName;
        if (!bestCreditConversionMap[creditHrid]) {
          bestCreditConversionMap[creditHrid] = { ask: null, bid: null };
        }
        if (
          askPrice > 0 &&
          (!bestCreditConversionMap[creditHrid].ask ||
            creditAskPrice < bestCreditConversionMap[creditHrid].ask.price)
        ) {
          bestCreditConversionMap[creditHrid].ask = {
            name: displayName,
            price: creditAskPrice,
          };
        }
        if (
          bidPrice > 0 &&
          (!bestCreditConversionMap[creditHrid].bid ||
            creditBidPrice < bestCreditConversionMap[creditHrid].bid.price)
        ) {
          bestCreditConversionMap[creditHrid].bid = {
            name: displayName,
            price: creditBidPrice,
          };
        }
      }
    }
  }

  const inputContainer = selectorContainer.querySelector(
    ".Input_inputContainer__22GnD",
  );
  if (!inputContainer) {
    return;
  }

  const askButton = `<button
        id="script_itemSelector_sortByAsk_btn"
        style="border-radius: 3px; background-color: ${runtime.config.SCRIPT_COLOR_MAIN}; color: black; font-size: 0.875rem; padding: 2px 6px;">
        ${runtime.config.isZH ? "出售价" : "Ask"}
        </button>`;
  const bidButton = `<button
        id="script_itemSelector_sortByBid_btn"
        style="border-radius: 3px; background-color: ${runtime.config.SCRIPT_COLOR_MAIN}; color: black; font-size: 0.875rem; padding: 2px 6px;">
        ${runtime.config.isZH ? "收购价" : "Bid"}
        </button>`;
  const noneButton = `<button
        id="script_itemSelector_sortByNone_btn"
        style="border-radius: 3px; background-color: ${runtime.config.SCRIPT_COLOR_MAIN}; color: black; font-size: 0.875rem; padding: 2px 6px;">
        ${runtime.config.isZH ? "无" : "None"}
        </button>`;
  const buttonsDiv = `<div id="script_itemSelector_sort_div" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; font-size: 0.875rem; text-align: left; margin-left: 8px; display: inline;">${
    runtime.config.isZH ? "排序：" : "Sort: "
  }${askButton} ${bidButton} ${noneButton}</div>`;
  inputContainer.insertAdjacentHTML("afterend", buttonsDiv);

  const itemList = selectorContainer.querySelector(
    ".ItemSelector_itemList__Qa5lq",
  );
  if (!itemList) {
    return;
  }

  const sortItemsBy = (order) => {
    const itemContainers = itemList.querySelectorAll(
      ".ItemSelector_itemContainer__3olqe",
    );

    let targetCreditHrid = "";
    let targetCreditName = "";
    const exchangeModal = document.querySelector(
      ".GuildPanel_exchangeModalContent__aQqyL",
    );
    if (exchangeModal) {
      const creditIcon = exchangeModal.querySelector(
        ".GuildPanel_arrow__1v2a0 + .Item_itemContainer__x7kH1 svg",
      );
      if (creditIcon) {
        let creditAriaLabel = creditIcon.attributes["aria-label"]?.value;
        if (creditAriaLabel) {
          if (runtime.config.isZHInGameSetting) {
            creditAriaLabel =
              runtime.api.getItemEnNameFromZhName(creditAriaLabel);
          }
          targetCreditHrid = runtime.state.itemEnNameToHridMap[creditAriaLabel];
          targetCreditName = creditAriaLabel;
        }
      }
    }

    const priceList = [];

    itemContainers.forEach((itemContainer) => {
      const itemElem = itemContainer.querySelector(
        ".Item_itemContainer__x7kH1",
      );
      if (!itemElem) return;

      let itemName =
        itemElem.querySelector("svg")?.attributes["aria-label"]?.value;
      if (!itemName) {
        itemElem.style.order = 0;
        const priceElem = itemElem.querySelector("#script_itemSelector_price");
        if (priceElem) priceElem.remove();
        return;
      }

      if (runtime.config.isZHInGameSetting) {
        itemName = runtime.api.getItemEnNameFromZhName(itemName);
      }
      const itemHrid = runtime.state.itemEnNameToHridMap[itemName];
      let itemCount = itemElem.querySelector(".Item_count__1HVvv")?.innerText;
      if (!itemCount) {
        itemElem.style.order = 0;
        const priceElem = itemElem.querySelector("#script_itemSelector_price");
        if (priceElem) priceElem.remove();
        return;
      }
      itemCount = runtime.api.parseCompactNumber(itemCount);
      let askPrice = 0;
      if (price_data.marketData[itemHrid] && price_data.marketData[itemHrid][0])
        askPrice = price_data.marketData[itemHrid][0].a;
      let bidPrice = 0;
      if (price_data.marketData[itemHrid] && price_data.marketData[itemHrid][0])
        bidPrice = price_data.marketData[itemHrid][0].b;

      let creditValue = 0;
      let creditAskPrice = 0;
      let creditBidPrice = 0;
      if (
        targetCreditHrid &&
        runtime.state.initData_itemDetailMap[itemHrid]?.guildCreditConversions
      ) {
        const conversions =
          runtime.state.initData_itemDetailMap[itemHrid].guildCreditConversions;
        const matchedConversion = conversions.find(
          (c) => c.creditItemHrid === targetCreditHrid,
        );
        if (matchedConversion) {
          creditValue =
            (itemCount / matchedConversion.itemCount) *
            matchedConversion.creditCount;
          creditAskPrice = (askPrice * itemCount) / creditValue;
          creditBidPrice = (bidPrice * itemCount) / creditValue;
        }
      }

      if (targetCreditHrid && creditAskPrice > 0) {
        priceList.push({
          name: itemName,
          ask: creditAskPrice,
          bid: creditBidPrice,
        });
      }

      if (!itemElem.querySelector("#script_itemSelector_price")) {
        itemElem.style.position = "relative";
        const priceElemHTML = `<div
                    id="script_itemSelector_price"
                    style="z-index: 1; position: absolute; top: 2px; left: 2px; text-align: left; font-size: 10px;">
                </div>`;
        itemElem
          .querySelector(".Item_item__2De2O.Item_clickable__3viV6")
          .insertAdjacentHTML("beforeend", priceElemHTML);
      }
      const priceElem = itemElem.querySelector("#script_itemSelector_price");

      if (!itemElem.querySelector("#script_itemSelector_credit")) {
        const creditElemHTML = `<div
                    id="script_itemSelector_credit"
                    style="z-index: 1; position: absolute; bottom: 2px; left: 2px; text-align: left; font-size: 10px;">
                </div>`;
        itemElem
          .querySelector(".Item_item__2De2O.Item_clickable__3viV6")
          .insertAdjacentHTML("beforeend", creditElemHTML);
      }
      const creditElem = itemElem.querySelector("#script_itemSelector_credit");

      if (order === "ask") {
        const sortValue =
          creditAskPrice > 0 ? creditAskPrice : askPrice * itemCount;
        itemContainer.style.order = Math.round(sortValue);
        priceElem.textContent = runtime.api.numberFormatter(
          creditValue > 0 ? creditValue : askPrice * itemCount,
        );
        creditElem.textContent = runtime.api.numberFormatter(sortValue);
      } else if (order === "bid") {
        const sortValue =
          creditBidPrice > 0 ? creditBidPrice : bidPrice * itemCount;
        itemContainer.style.order = Math.round(sortValue);
        priceElem.textContent = runtime.api.numberFormatter(
          creditValue > 0 ? creditValue : bidPrice * itemCount,
        );
        creditElem.textContent = runtime.api.numberFormatter(sortValue);
      } else if (order === "none") {
        itemContainer.style.order = 0;
        priceElem.textContent = "";
        creditElem.textContent = "";
      }
    });

    const bestItemSpan = selectorContainer.querySelector("#script_best_item");
    if (
      order !== "none" &&
      targetCreditHrid &&
      bestCreditConversionMap[targetCreditHrid]
    ) {
      const best = bestCreditConversionMap[targetCreditHrid][order];
      if (best) {
        if (bestItemSpan) {
          bestItemSpan.textContent = `${best.name} ${runtime.api.numberFormatter(best.price)}`;
        } else {
          const span = `<span id="script_best_item" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; font-size: 0.875rem; margin-left: 8px;">${best.name} ${runtime.api.numberFormatter(best.price)}</span>`;
          selectorContainer
            .querySelector("#script_itemSelector_sort_div")
            .insertAdjacentHTML("beforeend", span);
        }
      } else if (bestItemSpan) {
        bestItemSpan.remove();
      }
    } else if (bestItemSpan) {
      bestItemSpan.remove();
    }
  };

  selectorContainer
    .querySelector("button#script_itemSelector_sortByAsk_btn")
    .addEventListener("click", function (e) {
      sortItemsBy("ask");
    });
  selectorContainer
    .querySelector("button#script_itemSelector_sortByBid_btn")
    .addEventListener("click", function (e) {
      sortItemsBy("bid");
    });
  selectorContainer
    .querySelector("button#script_itemSelector_sortByNone_btn")
    .addEventListener("click", function (e) {
      sortItemsBy("none");
    });
}

Object.assign(runtime.api, {
  calculateNetworth,
  scheduleNetworthRefresh,
  addInventoryCategoryValues,
  getInventorySortUnitValue,
  getInventoryItemEnhancementLevel,
  isSortableInventoryCategory,
  addInvSortButton,
  addGuildCreditConversionsSortButton,
});
