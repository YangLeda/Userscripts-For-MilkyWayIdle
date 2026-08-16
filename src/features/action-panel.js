import { runtime } from "../core/runtime.js";
import { createFrameScheduler } from "../core/frame-scheduler.js";

const ACTION_PANEL_STYLE_ID = "mwitools-action-panel-style";
const EFFICIENCY_BUFF_TYPE = "/buff_types/efficiency";
const ACTION_LEVEL_BUFF_TYPE = "/buff_types/action_level";
const ACTION_PANEL_SELECTOR =
  'div[class*="SkillActionDetail_regularComponent"],div[class*="SkillActionDetail_skillActionDetail"]';
const ACTION_PANEL_RETRY_DELAYS = [0, 100, 300, 1000];
const actionPanelRetryStates = new Map();
const targetLevelSelections = new Map();

function addActionPanelStyles() {
  if (document.getElementById(ACTION_PANEL_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = ACTION_PANEL_STYLE_ID;
  style.textContent = `
    .mwi-level-progress { width:100%; max-width:100%; min-width:0; box-sizing:border-box; contain:inline-size; margin-top:6px; padding:6px 8px; border:1px solid rgba(255,255,255,.12); border-radius:5px; background:rgba(255,255,255,.025); color:var(--color-text-primary,#eee); font-size:calc(.6875rem * var(--mwi-ui-font-scale,1)); line-height:1.35; }
    .mwi-level-progress-row { display:flex; align-items:center; gap:6px; min-width:0; }
    .mwi-level-progress-label { flex:0 0 auto; color:var(--color-text-secondary,#aaa); }
    .mwi-target-level-input { width:48px!important; min-width:48px!important; height:23px!important; padding:1px 4px!important; border-radius:3px!important; font:inherit!important; text-align:center; }
    .mwi-level-progress-result { min-width:0; margin-left:auto; text-align:right; font-weight:600; overflow-wrap:anywhere; }
    .mwi-level-meta { margin-top:3px; color:var(--color-text-secondary,#aaa); font-size:calc(.6875rem * var(--mwi-ui-font-scale,1)); }
    .mwi-native-level-stat { font:inherit; }
    @media(max-width:520px){.mwi-level-progress-row{align-items:flex-start;flex-wrap:wrap}.mwi-level-progress-result{width:100%;text-align:left}}
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

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

  const activeContext = runtime.api.resolveActiveProductionPanelContext?.();
  if (activeContext?.panel && activeContext.panel !== panel) return false;
  const actionHrid =
    activeContext?.panel === panel
      ? activeContext.actionHrid
      : runtime.api.resolveProductionAction?.(panel);
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
    tillLevelInput.min = String(currentLevel + 1);
    tillLevelInput.max = String(maxLevel);
    const savedTargetLevel = Number(targetLevelSelections.get(actionHrid));
    const initialTargetLevel =
      Number.isSafeInteger(savedTargetLevel) &&
      savedTargetLevel > currentLevel &&
      savedTargetLevel <= maxLevel
        ? savedTargetLevel
        : currentLevel + 1;
    tillLevelInput.value = String(initialTargetLevel);
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

    if (runtime.api.mountProductionModule) {
      runtime.api.mountProductionModule(panel, levelCard, "targetLevel");
    } else {
      const anchor =
        panel.querySelector(
          'div[class*="SkillActionDetail_actionContainer"]',
        ) ?? inputElem.parentElement;
      anchor.insertAdjacentElement("afterend", levelCard);
    }

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
      const targetLevel = Number(tillLevelInput.value);
      if (
        Number.isSafeInteger(targetLevel) &&
        targetLevel > currentLevel &&
        targetLevel <= maxLevel
      ) {
        targetLevelSelections.set(actionHrid, targetLevel);
      }
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
    const projection = runtime.api.projectAction?.(actionHrid, 1);
    const profitPerHour = projection?.valuations?.conservative?.profitPerHour;
    if (!Number.isFinite(profitPerHour)) return true;
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

function refreshProductionActionPanel(panel) {
  if (
    !runtime.settings.settingsMap.actionPanel_totalTime.isTrue ||
    !panel?.isConnected
  ) {
    return false;
  }
  if (
    !panel.querySelector("#mwi-level-progress") ||
    panel.querySelectorAll(".mwi-native-level-stat").length !== 4
  ) {
    delete panel.dataset.mwitoolsActionPanel;
  }
  scheduleActionPanel(panel);
  return true;
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
  handleActionPanel,
  refreshProductionActionPanel,
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
    const render = () => {
      removeInsertedDivs();
      waitForProgressBar();
    };
    const scheduler = createFrameScheduler(render);
    const observer = new MutationObserver((records) => {
      const relevant = records.some((record) => {
        const target =
          record.target?.nodeType === 1
            ? record.target
            : record.target?.parentElement;
        if (target?.closest?.(".insertedSpan")) return false;
        return Boolean(
          target?.matches?.(".NavigationBar_currentExperience__3GDeX") ||
          target?.closest?.(".NavigationBar_currentExperience__3GDeX") ||
          [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              node?.nodeType === 1 &&
              (node.matches?.(".NavigationBar_currentExperience__3GDeX") ||
                node.querySelector?.(
                  ".NavigationBar_currentExperience__3GDeX",
                )),
          ),
        );
      });
      if (relevant) scheduler.schedule();
    });
    scope.observer(observer, document.body, {
      attributes: true,
      attributeFilter: ["style"],
      childList: true,
      subtree: true,
    });
    scope.add(() => scheduler.cancel());
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
    targetLevelSelections.clear();
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
    scope.observer(observer, document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    document
      .querySelectorAll(ACTION_PANEL_SELECTOR)
      .forEach(scheduleActionPanel);
    const refreshPanels = () => {
      document.querySelectorAll(ACTION_PANEL_SELECTOR).forEach((panel) => {
        delete panel.dataset.mwitoolsActionPanel;
        scheduleActionPanel(panel);
      });
    };
    for (const messageType of [
      "items_updated",
      "skills_updated",
      "house_rooms_updated",
      "achievement_buffs_updated",
      "moo_pass_buffs_updated",
      "community_buffs_updated",
      "consumable_buffs_updated",
      "action_type_consumable_slots_updated",
      "equipment_buffs_updated",
      "personal_buffs_updated",
      "guild_buffs_updated",
      "abilities_updated",
      "character_abilities_updated",
    ]) {
      scope.add(
        runtime.onMessage(messageType, () => {
          refreshPanels();
          if (
            messageType === "abilities_updated" ||
            messageType === "character_abilities_updated"
          ) {
            scope.timeout(refreshPanels, 100);
            scope.timeout(refreshPanels, 300);
          }
        }),
      );
    }
    scope.add(() => {
      clearActionPanelRetries();
      targetLevelSelections.clear();
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
