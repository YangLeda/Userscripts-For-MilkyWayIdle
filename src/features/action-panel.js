import { runtime } from "../core/runtime.js";

const ACTION_PANEL_STYLE_ID = "mwitools-action-panel-style";
const EFFICIENCY_BUFF_TYPE = "/buff_types/efficiency";
const ACTION_LEVEL_BUFF_TYPE = "/buff_types/action_level";
const MAIN_PANEL_SELECTOR = 'div[class*="GamePage_mainPanel"]';
const ACTION_PANEL_SELECTOR =
  'div[class*="SkillActionDetail_regularComponent"]';
const ACTION_PANEL_RETRY_DELAYS = [0, 100, 300, 1000];
const actionPanelRetryStates = new Map();

function addActionPanelStyles() {
  if (document.getElementById(ACTION_PANEL_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = ACTION_PANEL_STYLE_ID;
  style.textContent = `
    .mwi-level-progress { width:100%; max-width:100%; min-width:0; box-sizing:border-box; contain:inline-size; margin-top:6px; padding:6px 8px; border:1px solid rgba(255,255,255,.12); border-radius:5px; background:rgba(255,255,255,.025); color:var(--color-text-primary,#eee); font-size:.6875rem; line-height:1.35; }
    .mwi-level-progress-row { display:flex; align-items:center; gap:6px; min-width:0; }
    .mwi-level-progress-label { flex:0 0 auto; color:var(--color-text-secondary,#aaa); }
    .mwi-target-level-input { width:48px!important; min-width:48px!important; height:23px!important; padding:1px 4px!important; border-radius:3px!important; font:inherit!important; text-align:center; }
    .mwi-level-progress-result { min-width:0; margin-left:auto; text-align:right; font-weight:600; overflow-wrap:anywhere; }
    .mwi-level-meta { margin-top:3px; color:var(--color-text-secondary,#aaa); font-size:.625rem; }
    .mwi-native-level-stat { font:inherit; }
    @media(max-width:520px){.mwi-level-progress-row{align-items:flex-start;flex-wrap:wrap}.mwi-level-progress-result{width:100%;text-align:left}}
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

/* 动作面板 */
const waitForActionPanelParent = () => {
  const targetNode = document.querySelector(MAIN_PANEL_SELECTOR);
  if (targetNode) {
    console.log(
      runtime.config.isZH
        ? "[MWITools] 开始监听行动面板。"
        : "[MWITools] Started observing the action panel.",
    );
    const actionPanelObserver = new MutationObserver(async function (
      mutations,
    ) {
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          const panel = added?.matches?.(ACTION_PANEL_SELECTOR)
            ? added
            : added?.querySelector?.(ACTION_PANEL_SELECTOR);
          if (panel) scheduleActionPanel(panel);
        }
      }
    });
    actionPanelObserver.observe(targetNode, {
      attributes: false,
      childList: true,
      subtree: true,
    });
  } else {
    setTimeout(waitForActionPanelParent, 200);
  }
};

async function handleActionPanel(panel) {
  if (!runtime.settings.settingsMap.actionPanel_totalTime.isTrue) return false;
  if (
    panel.dataset.mwitoolsActionPanel === "true" &&
    panel.querySelector("#mwi-level-progress") &&
    panel.querySelectorAll(".mwi-native-level-stat").length === 4
  )
    return true;

  const expElement = panel.querySelector(
    'div[class*="SkillActionDetail_expGain"]',
  );
  const inputElem = panel.querySelector(
    'div[class*="SkillActionDetail_maxActionCountInput"] input',
  );
  if (!expElement || !inputElem) return false; // 不处理战斗 ActionPanel

  const actionHrid = runtime.api.resolveProductionAction?.(panel);
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  const duration = runtime.api.getProductionPanelDuration?.(panel);
  if (!detail || !Number.isFinite(duration) || duration <= 0) return false;

  const exp = Number(
    String(runtime.api.getOriTextFromElement(expElement) ?? "")
      .replaceAll(runtime.config.THOUSAND_SEPERATOR, "")
      .replaceAll(runtime.config.DECIMAL_SEPERATOR, "."),
  );
  if (!Number.isFinite(exp) || exp <= 0) return false;

  const efficiencyDetails = getActionEfficiencyDetails(actionHrid);
  const effBuff = 1 + efficiencyDetails.total / 100;
  const skillHrid = detail.experienceGain?.skillHrid;
  let currentExp = null;
  let currentLevel = null;
  for (const skill of runtime.state.initData_characterSkills) {
    if (skill.skillHrid === skillHrid) {
      currentExp = skill.experience;
      currentLevel = skill.level;
      break;
    }
  }
  const infoContainer = panel.querySelector(
    'div[class*="SkillActionDetail_info"]',
  );
  const nativeLabel = infoContainer?.querySelector(
    'div[class*="SkillActionDetail_label"]',
  );
  const nativeValue = infoContainer?.querySelector(
    'div[class*="SkillActionDetail_value"]',
  );
  if (
    currentExp === null ||
    currentLevel === null ||
    !infoContainer ||
    !nativeLabel ||
    !nativeValue
  ) {
    return false;
  }

  panel.querySelector("#mwi-level-progress")?.remove();
  panel
    .querySelectorAll(".mwi-native-level-stat")
    .forEach((element) => element.remove());
  delete panel.dataset.mwitoolsActionPanel;
  addActionPanelStyles();

  if (currentExp !== null && currentLevel !== null) {
    const calculateNeedToLevel = (
      currentLevel,
      targetLevel,
      effBuff,
      duration,
      exp,
    ) => {
      let needTotalTimeSec = 0;
      let needTotalNumOfActions = 0;
      for (let level = currentLevel; level < targetLevel; level++) {
        let needExpToNextLevel = null;
        if (
          !Number.isFinite(
            runtime.state.initData_levelExperienceTable?.[level + 1],
          )
        ) {
          return null;
        }
        if (level === currentLevel) {
          needExpToNextLevel =
            runtime.state.initData_levelExperienceTable[level + 1] - currentExp;
        } else {
          needExpToNextLevel =
            runtime.state.initData_levelExperienceTable[level + 1] -
            runtime.state.initData_levelExperienceTable[level];
        }
        const extraLevelEffBuff =
          (level - currentLevel) *
          (1 + Number(efficiencyDetails.skillLevelRatio || 0)) *
          0.01;
        const needNumOfActionsToNextLevel = Math.ceil(needExpToNextLevel / exp);
        needTotalNumOfActions += needNumOfActionsToNextLevel;
        needTotalTimeSec +=
          (needNumOfActionsToNextLevel / (effBuff + extraLevelEffBuff)) *
          duration;
      }
      return { numOfActions: needTotalNumOfActions, timeSec: needTotalTimeSec };
    };

    const maxLevel = Math.min(
      200,
      (runtime.state.initData_levelExperienceTable?.length ?? 201) - 1,
    );
    const levelCard = document.createElement("section");
    levelCard.id = "mwi-level-progress";
    levelCard.className = "mwi-level-progress";
    const row = document.createElement("div");
    row.className = "mwi-level-progress-row";
    const label = document.createElement("span");
    label.className = "mwi-level-progress-label";
    label.textContent = runtime.config.isZH ? "目标等级" : "Target level";
    const tillLevelInput = document.createElement("input");
    tillLevelInput.id = "tillLevelInput";
    tillLevelInput.type = "number";
    tillLevelInput.value = String(currentLevel + 1);
    tillLevelInput.min = String(currentLevel + 1);
    tillLevelInput.max = String(maxLevel);
    tillLevelInput.className = `${inputElem.className} mwi-target-level-input`;
    const tillLevelNumber = document.createElement("span");
    tillLevelNumber.id = "tillLevelNumber";
    tillLevelNumber.className = "mwi-level-progress-result";
    row.append(label, tillLevelInput, tillLevelNumber);
    levelCard.append(row);

    const addNativeStat = (id, labelText, valueText) => {
      const statLabel = document.createElement("div");
      statLabel.className = `${nativeLabel.className} mwi-native-level-stat`;
      statLabel.textContent = labelText;
      const statValue = document.createElement("div");
      statValue.id = id;
      statValue.className = `${nativeValue.className} mwi-native-level-stat`;
      statValue.textContent = valueText;
      infoContainer.append(statLabel, statValue);
    };
    addNativeStat(
      "expPerHour",
      runtime.config.isZH ? "经验/小时" : "XP/hour",
      runtime.api.numberFormatter(
        Math.round((3600 / duration) * exp * effBuff),
      ),
    );
    addNativeStat(
      "currentEfficiency",
      runtime.config.isZH ? "当前效率" : "Efficiency",
      `+${Number((effBuff - 1) * 100).toFixed(1)}%`,
    );

    const anchor =
      panel.querySelector("#mwi-production-summary") ??
      panel.querySelector('div[class*="SkillActionDetail_actionContainer"]') ??
      inputElem.parentElement;
    anchor.insertAdjacentElement("afterend", levelCard);

    let targetLevelEdited = false;
    const updateTargetLevel = () => {
      const targetLevel = Number(tillLevelInput.value);
      if (targetLevel > currentLevel && targetLevel <= maxLevel) {
        const need = calculateNeedToLevel(
          currentLevel,
          targetLevel,
          effBuff,
          duration,
          exp,
        );
        if (need) {
          tillLevelNumber.textContent = runtime.config.isZH
            ? `还需 ${runtime.api.numberFormatter(need.numOfActions)} 次 · 预计 ${runtime.api.timeReadable(need.timeSec)}`
            : `${runtime.api.numberFormatter(need.numOfActions)} actions · ${runtime.api.timeReadable(need.timeSec)}`;
          if (targetLevelEdited) {
            reactInputTriggerHack(inputElem, String(need.numOfActions));
          }
        }
      } else {
        tillLevelNumber.textContent = runtime.config.isZH
          ? `请输入 ${currentLevel + 1}–${maxLevel}`
          : `Enter ${currentLevel + 1}–${maxLevel}`;
      }
    };
    tillLevelInput.addEventListener("input", () => {
      targetLevelEdited = true;
      updateTargetLevel();
    });
    updateTargetLevel();
  }

  panel.dataset.mwitoolsActionPanel = "true";

  // 显示Foraging最后一个图综合收益
  if (
    (panel.querySelector('div[class*="SkillActionDetail_dropTable"]')?.children
      .length ?? 0) > 1 &&
    runtime.settings.settingsMap.actionPanel_foragingTotal.isTrue &&
    !runtime.api.shouldSuppressMarketFeatures?.()
  ) {
    const marketJson = await runtime.api.fetchMarketJSON();

    // 茶效率
    const teaBuffs = runtime.api.getTeaBuffsByActionHrid(actionHrid);

    // 消耗饮料
    let drinksConsumedPerHourAskPrice = 0;
    let drinksConsumedPerHourBidPrice = 0;

    const drinksList =
      runtime.state.initData_actionTypeDrinkSlotsMap[
        runtime.state.initData_actionDetailMap[actionHrid].type
      ];
    for (const drink of drinksList) {
      if (!drink || !drink.itemHrid) {
        continue;
      }
      drinksConsumedPerHourAskPrice +=
        (marketJson?.marketData[drink.itemHrid]?.[0]?.a ?? 0) * 12;
      drinksConsumedPerHourBidPrice +=
        (marketJson?.marketData[drink.itemHrid]?.[0]?.b ?? 0) * 12;
    }

    // 每小时动作数（包含工具缩减动作时间）
    const baseTimePerActionSec =
      runtime.state.initData_actionDetailMap[actionHrid].baseTimeCost /
      1000000000;
    const toolPercent = runtime.api.getToolsSpeedBuffByActionHrid(actionHrid);
    const actualTimePerActionSec =
      baseTimePerActionSec / (1 + toolPercent / 100);
    let actionPerHour = 3600 / actualTimePerActionSec;

    // 将掉落表看作每次动作掉落一件虚拟物品
    const dropTable =
      runtime.state.initData_actionDetailMap[actionHrid].dropTable;
    let virtualItemNetBid = 0;
    for (const drop of dropTable) {
      const bid = marketJson?.marketData[drop.itemHrid]?.[0]?.b ?? 0;
      const amount = drop.dropRate * ((drop.minCount + drop.maxCount) / 2);
      virtualItemNetBid +=
        bid * amount * (1 - runtime.api.getMarketTaxRate(drop.itemHrid));
    }
    let droprate = 1;
    let itemPerHour = actionPerHour * droprate;

    const totalEffiBuff = getTotalEffiPercentage(actionHrid);

    // 总效率影响动作数/生产物品数
    actionPerHour *= 1 + totalEffiBuff / 100;
    itemPerHour *= 1 + totalEffiBuff / 100;

    // 茶额外产品数量（不消耗原料）
    const extraFreeItemPerHour = (itemPerHour * teaBuffs.quantity) / 100;

    // 出售市场税
    const bidAfterTax = virtualItemNetBid;

    // 每小时利润
    const profitPerHour =
      itemPerHour * bidAfterTax +
      extraFreeItemPerHour * bidAfterTax -
      drinksConsumedPerHourAskPrice;
    const profitPerDay = 24 * profitPerHour;

    const htmlStr = `<div id="totalProfit" class="mwi-level-meta">${
      runtime.config.isZH ? "综合利润: " : "Overall profit: "
    }<span class="mwi-number" title="${runtime.api.formatExactNumber(profitPerHour)}">${runtime.api.numberFormatter(profitPerHour)}</span>${runtime.config.isZH ? "/小时" : "/hour"}, <span class="mwi-number" title="${runtime.api.formatExactNumber(profitPerDay)}">${runtime.api.numberFormatter(profitPerDay)}</span>${runtime.config.isZH ? "/天" : "/day"}</div>`;
    panel
      .querySelector("#mwi-level-progress")
      ?.insertAdjacentHTML("beforeend", htmlStr);
  }
  return true;
}

function scheduleActionPanel(panel) {
  if (!panel?.isConnected || actionPanelRetryStates.has(panel)) return;
  const state = { attempt: 0, timer: null };
  actionPanelRetryStates.set(panel, state);
  const run = async () => {
    state.timer = null;
    if (!panel.isConnected) {
      actionPanelRetryStates.delete(panel);
      return;
    }
    let ready = false;
    try {
      ready = await handleActionPanel(panel);
    } catch (error) {
      console.info("[MWITools] Action panel enhancement unavailable", error);
    }
    if (ready || state.attempt >= ACTION_PANEL_RETRY_DELAYS.length - 1) {
      actionPanelRetryStates.delete(panel);
      return;
    }
    state.attempt += 1;
    state.timer = setTimeout(run, ACTION_PANEL_RETRY_DELAYS[state.attempt]);
  };
  state.timer = setTimeout(run, ACTION_PANEL_RETRY_DELAYS[0]);
}

function clearActionPanelRetries() {
  for (const state of actionPanelRetryStates.values()) {
    if (state.timer !== null) clearTimeout(state.timer);
  }
  actionPanelRetryStates.clear();
}

function sumBuffValue(buffs, typeHrid) {
  return (buffs ?? []).reduce(
    (total, buff) => {
      if (buff?.typeHrid !== typeHrid) return total;
      total.ratioBoost += Number(buff.ratioBoost) || 0;
      total.flatBoost += Number(buff.flatBoost) || 0;
      return total;
    },
    { ratioBoost: 0, flatBoost: 0 },
  );
}

function isTaskAction(actionHrid) {
  return (runtime.state.characterQuests ?? []).some((quest) => {
    if (quest?.actionHrid !== actionHrid) return false;
    const status = String(quest.status ?? "").toLowerCase();
    return !(
      quest.isClaimed ||
      quest.claimed ||
      status.includes("claimed") ||
      status.includes("completed")
    );
  });
}

function getAuthoritativeActionBuffs(actionHrid) {
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  const sources = runtime.state.actionTypeBuffSources;
  if (!detail || !sources) return null;
  const buffs = [];
  for (const sourceMap of Object.values(sources)) {
    const actionTypeBuffs = sourceMap?.[detail.type];
    if (Array.isArray(actionTypeBuffs)) buffs.push(...actionTypeBuffs);
  }
  if (isTaskAction(actionHrid)) {
    buffs.push(...(runtime.state.equipmentTaskActionBuffs ?? []));
  }
  return buffs;
}

function supportsLevelEfficiency(detail) {
  const actionFunction = String(detail?.function ?? "").toLowerCase();
  if (actionFunction) {
    return (
      actionFunction.includes("gathering") ||
      actionFunction.includes("production")
    );
  }
  return Boolean(
    detail?.levelRequirement && (detail?.dropTable || detail?.outputItems),
  );
}

function getAuthoritativeEfficiency(actionHrid, buffs) {
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  const directEfficiency =
    sumBuffValue(buffs, EFFICIENCY_BUFF_TYPE).flatBoost * 100;
  let levelEfficiency = 0;
  let boostedSkillLevel = null;
  let requiredLevel = null;
  let skillLevelRatio = 0;

  if (supportsLevelEfficiency(detail) && detail?.levelRequirement) {
    const skillHrid = detail.levelRequirement.skillHrid;
    const skill = (runtime.state.initData_characterSkills ?? []).find(
      (candidate) => candidate.skillHrid === skillHrid,
    );
    const baseSkillLevel = Number(skill?.level);
    if (Number.isFinite(baseSkillLevel)) {
      const skillName = String(skillHrid).split("/").pop();
      const levelBuff = sumBuffValue(buffs, `/buff_types/${skillName}_level`);
      skillLevelRatio = levelBuff.ratioBoost;
      boostedSkillLevel =
        (1 + levelBuff.ratioBoost) * baseSkillLevel + levelBuff.flatBoost;
      requiredLevel =
        Number(detail.levelRequirement.level || 0) +
        sumBuffValue(buffs, ACTION_LEVEL_BUFF_TYPE).flatBoost;
      levelEfficiency = Math.max(0, boostedSkillLevel - requiredLevel);
    }
  }

  return {
    source: "game",
    total: directEfficiency + levelEfficiency,
    directEfficiency,
    levelEfficiency,
    boostedSkillLevel,
    requiredLevel,
    skillLevelRatio,
  };
}

function getLegacyEfficiency(actionHrid) {
  const detail = runtime.state.initData_actionDetailMap?.[actionHrid];
  if (!detail?.levelRequirement) {
    return { source: "legacy", total: 0, levelEfficiency: 0 };
  }
  const requiredLevel = Number(detail.levelRequirement.level) || 0;
  const currentLevel = Number(
    (runtime.state.initData_characterSkills ?? []).find(
      (skill) => skill.skillHrid === detail.levelRequirement.skillHrid,
    )?.level ?? requiredLevel,
  );
  const levelEfficiency = Math.max(0, currentLevel - requiredLevel);
  const houseEfficiency =
    Number(runtime.api.getHousesEffBuffByActionHrid?.(actionHrid)) || 0;
  const teaEfficiency =
    Number(runtime.api.getTeaBuffsByActionHrid?.(actionHrid)?.efficiency) || 0;
  const equipmentEfficiency =
    Number(runtime.api.getItemEffiBuffByActionHrid?.(actionHrid)) || 0;
  return {
    source: "legacy",
    total:
      levelEfficiency + houseEfficiency + teaEfficiency + equipmentEfficiency,
    levelEfficiency,
    houseEfficiency,
    teaEfficiency,
    equipmentEfficiency,
  };
}

function getActionEfficiencyDetails(actionHrid) {
  const buffs = getAuthoritativeActionBuffs(actionHrid);
  return buffs
    ? getAuthoritativeEfficiency(actionHrid, buffs)
    : getLegacyEfficiency(actionHrid);
}

function getTotalEffiPercentage(actionHrid, debug = false) {
  const details = getActionEfficiencyDetails(actionHrid);
  if (debug) {
    console.log(
      runtime.config.isZH
        ? "[MWITools] 行动总效率明细"
        : "[MWITools] Total action efficiency details",
      actionHrid,
      details,
    );
  }
  return Number.isFinite(details.total) ? details.total : 0;
}

function getTotalTimeStr(input, duration, effBuff) {
  if (input === "∞") {
    return "[∞]";
  } else if (isNaN(input)) {
    return "Error";
  }
  return (
    "[" + runtime.api.timeReadable(Math.round(input / effBuff) * duration) + "]"
  );
}

function reactInputTriggerHack(inputElem, value) {
  const lastValue = inputElem.value;
  inputElem.value = value;
  const EventConstructor = inputElem.ownerDocument?.defaultView?.Event ?? Event;
  const event = new EventConstructor("input", { bubbles: true });
  event.simulated = true;
  const tracker = inputElem._valueTracker;
  if (tracker) {
    tracker.setValue(lastValue);
  }
  inputElem.dispatchEvent(event);
}

/* 左侧栏显示技能百分比 */
const waitForProgressBar = () => {
  const elements = document.querySelectorAll(
    ".NavigationBar_currentExperience__3GDeX",
  );
  if (elements.length) {
    removeInsertedDivs();
    elements.forEach((element) => {
      let text = element.style.width;
      text = Number(text.replace("%", "")).toFixed(2) + "%";

      const span = document.createElement("span");
      span.textContent = text;
      span.classList.add("insertedSpan");
      span.style.fontSize = "0.875rem";
      span.style.color = runtime.config.SCRIPT_COLOR_MAIN;

      element.parentNode.parentNode.querySelector(
        "span.NavigationBar_level__3C7eR",
      ).style.width = "auto";

      const insertParent = element.parentNode.parentNode.children[0];
      insertParent.insertBefore(span, insertParent.children[1]);
    });
  }
};

const removeInsertedDivs = () =>
  document
    .querySelectorAll("span.insertedSpan")
    .forEach((div) => div.parentNode.removeChild(div));

Object.assign(runtime.api, {
  waitForActionPanelParent,
  handleActionPanel,
  getTotalEffiPercentage,
  getActionEfficiencyDetails,
  getTotalTimeStr,
  reactInputTriggerHack,
  waitForProgressBar,
  removeInsertedDivs,
});

runtime.features.register({
  id: "expPercentage",
  setting: "expPercentage",
  initialize({ scope }) {
    waitForProgressBar();
    scope.interval(() => {
      removeInsertedDivs();
      waitForProgressBar();
    }, 1000);
    scope.add(removeInsertedDivs);
  },
});

runtime.settings.onChange?.("adaptIronCowMarketFeatures", () => {
  for (const panel of document.querySelectorAll(
    'div[class*="SkillActionDetail_regularComponent"]',
  )) {
    delete panel.dataset.mwitoolsActionPanel;
    void handleActionPanel(panel);
  }
});

runtime.features.register({
  id: "actionPanel_totalTime",
  setting: "actionPanel_totalTime",
  scope: "character",
  initialize({ scope }) {
    let observed = null;
    const attach = () => {
      const target = document.querySelector(MAIN_PANEL_SELECTOR);
      if (!target || observed === target) return;
      observed = target;
      const observer = new MutationObserver((mutations) => {
        const panels = new Set();
        for (const mutation of mutations) {
          const mutationTarget =
            mutation.target?.nodeType === 1
              ? mutation.target
              : mutation.target?.parentElement;
          const containingPanel = mutationTarget?.closest?.(
            ACTION_PANEL_SELECTOR,
          );
          if (containingPanel) panels.add(containingPanel);
          for (const added of mutation.addedNodes) {
            if (added?.matches?.(ACTION_PANEL_SELECTOR)) panels.add(added);
            added
              ?.querySelectorAll?.(ACTION_PANEL_SELECTOR)
              .forEach((panel) => panels.add(panel));
          }
        }
        panels.forEach(scheduleActionPanel);
      });
      scope.observer(observer, target, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      target
        .querySelectorAll(ACTION_PANEL_SELECTOR)
        .forEach(scheduleActionPanel);
    };
    attach();
    scope.interval(attach, 500);
    scope.add(() => {
      clearActionPanelRetries();
      document
        .querySelectorAll(
          "#showTotalTime,#quickInputHourButtons,#quickInputCountButtons,#mwi-level-progress,#tillLevel,#expPerHour,#currentEfficiency,#totalProfit,.mwi-native-level-stat",
        )
        .forEach((node) => node.remove());
      document
        .querySelectorAll('[data-mwitools-action-panel="true"]')
        .forEach((panel) => delete panel.dataset.mwitoolsActionPanel);
    });
  },
});
