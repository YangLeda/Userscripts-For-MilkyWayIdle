import { runtime } from "../core/runtime.js";

/* 动作面板 */
const waitForActionPanelParent = () => {
  const targetNode = document.querySelector("div.GamePage_mainPanel__2njyb");
  if (targetNode) {
    console.log("start observe action panel");
    const actionPanelObserver = new MutationObserver(async function (
      mutations,
    ) {
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          if (
            added?.classList?.contains("Modal_modalContainer__3B80m") &&
            added.querySelector("div.SkillActionDetail_regularComponent__3oCgr")
          ) {
            handleActionPanel(
              added.querySelector(
                "div.SkillActionDetail_regularComponent__3oCgr",
              ),
            );
          }
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
  if (!runtime.settings.settingsMap.actionPanel_totalTime.isTrue) {
    return;
  }

  if (!panel.querySelector("div.SkillActionDetail_expGain__F5xHu")) {
    return; // 不处理战斗ActionPanel
  }
  let actionName = runtime.api.getOriTextFromElement(
    panel.querySelector("div.SkillActionDetail_name__3erHV"),
  );
  if (runtime.config.isZHInGameSetting) {
    actionName = runtime.api.getActionEnNameFromZhName(actionName);
  }

  const exp = Number(
    runtime.api
      .getOriTextFromElement(
        panel.querySelector("div.SkillActionDetail_expGain__F5xHu"),
      )
      .replaceAll(runtime.config.THOUSAND_SEPERATOR, "")
      .replaceAll(runtime.config.DECIMAL_SEPERATOR, "."),
  );

  const elems = panel.querySelectorAll("div.SkillActionDetail_value__dQjYH");
  const duration = Number(
    runtime.api
      .getOriTextFromElement(elems[elems.length - 2])
      .replaceAll(runtime.config.THOUSAND_SEPERATOR, "")
      .replaceAll(runtime.config.DECIMAL_SEPERATOR, ".")
      .replace("s", ""),
  );
  const inputElem = panel.querySelector(
    "div.SkillActionDetail_maxActionCountInput__1C0Pw input",
  );

  const actionHrid =
    runtime.state.initData_actionDetailMap[
      runtime.api.getActionHridFromItemName(actionName)
    ].hrid;
  const effBuff = 1 + getTotalEffiPercentage(actionHrid, false) / 100;

  // 显示总时间
  let hTMLStr = `<div id="showTotalTime" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-align: left;">${getTotalTimeStr(
    inputElem.value,
    duration,
    effBuff,
  )}</div>`;
  const gatherDiv = inputElem.parentNode.parentNode.parentNode;
  gatherDiv.insertAdjacentHTML("afterend", hTMLStr);
  const showTotalTimeDiv = panel.querySelector("div#showTotalTime");

  panel.addEventListener("click", function (evt) {
    setTimeout(() => {
      showTotalTimeDiv.textContent = getTotalTimeStr(
        inputElem.value,
        duration,
        effBuff,
      );
    }, 50);
  });
  inputElem.addEventListener("keyup", function (evt) {
    if (
      inputElem.value.toLowerCase().includes("k") ||
      inputElem.value.toLowerCase().includes("m")
    ) {
      reactInputTriggerHack(
        inputElem,
        inputElem.value
          .toLowerCase()
          .replaceAll("k", "000")
          .replaceAll("m", "000000"),
      );
    }
    showTotalTimeDiv.textContent = getTotalTimeStr(
      inputElem.value,
      duration,
      effBuff,
    );
  });

  let appendAfterElem = showTotalTimeDiv;

  // 显示快捷按钮
  if (runtime.settings.settingsMap.actionPanel_totalTime_quickInputs.isTrue) {
    hTMLStr = `<div id="quickInputHourButtons" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-align: left; display:flex;">${runtime.config.isZH ? "做 " : "Do "}</div>`;
    showTotalTimeDiv.insertAdjacentHTML("afterend", hTMLStr);
    const quickInputHourButtonsDiv = panel.querySelector(
      "div#quickInputHourButtons",
    );

    const presetHours = [0.5, 1, 2, 3, 4, 5, 6, 10, 12, 24];
    for (const value of presetHours) {
      const btn = document.createElement("button");
      btn.className = "Button_button__1Fe9z Button_small__3fqC7";
      btn.style.backgroundColor = "white";
      btn.style.color = "black";
      btn.style.padding = "1px 6px 1px 6px";
      btn.style.margin = "1px";
      btn.innerText = value === 0.5 ? 0.5 : runtime.api.numberFormatter(value);
      btn.onclick = () => {
        reactInputTriggerHack(
          inputElem,
          Math.round((value * 60 * 60 * effBuff) / duration),
        );
      };
      quickInputHourButtonsDiv.append(btn);
    }
    quickInputHourButtonsDiv.append(
      document.createTextNode(runtime.config.isZH ? " 小时" : " hours"),
    );

    hTMLStr = `<div id="quickInputCountButtons" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-align: left; display:flex;">${runtime.config.isZH ? "做 " : "Do "}</div>`;
    quickInputHourButtonsDiv.insertAdjacentHTML("afterend", hTMLStr);
    const quickInputCountButtonsDiv = panel.querySelector(
      "div#quickInputCountButtons",
    );
    const presetTimes = [10, 100, 300, 500, 1000, 2000];
    for (const value of presetTimes) {
      const btn = document.createElement("button");
      btn.className = "Button_button__1Fe9z Button_small__3fqC7";
      btn.style.backgroundColor = "white";
      btn.style.color = "black";
      btn.style.padding = "1px 6px 1px 6px";
      btn.style.margin = "1px";
      btn.innerText = runtime.api.numberFormatter(value);
      btn.onclick = () => {
        reactInputTriggerHack(inputElem, value);
      };
      quickInputCountButtonsDiv.append(btn);
    }
    quickInputCountButtonsDiv.append(
      document.createTextNode(runtime.config.isZH ? " 次" : " times"),
    );

    appendAfterElem = quickInputCountButtonsDiv;
  }

  // 还有多久到多少技能等级
  const skillHrid =
    runtime.state.initData_actionDetailMap[
      runtime.api.getActionHridFromItemName(actionName)
    ].experienceGain.skillHrid;
  let currentExp = null;
  let currentLevel = null;
  for (const skill of runtime.state.initData_characterSkills) {
    if (skill.skillHrid === skillHrid) {
      currentExp = skill.experience;
      currentLevel = skill.level;
      break;
    }
  }
  if (currentExp && currentLevel) {
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
        if (level === currentLevel) {
          needExpToNextLevel =
            runtime.state.initData_levelExperienceTable[level + 1] - currentExp;
        } else {
          needExpToNextLevel =
            runtime.state.initData_levelExperienceTable[level + 1] -
            runtime.state.initData_levelExperienceTable[level];
        }
        const extraLevelEffBuff = (level - currentLevel) * 0.01; // 升级过程中，每升一级，额外多1%效率
        const needNumOfActionsToNextLevel = Math.round(
          needExpToNextLevel / exp,
        );
        needTotalNumOfActions += needNumOfActionsToNextLevel;
        needTotalTimeSec +=
          (needNumOfActionsToNextLevel / (effBuff + extraLevelEffBuff)) *
          duration;
      }
      return { numOfActions: needTotalNumOfActions, timeSec: needTotalTimeSec };
    };

    const need = calculateNeedToLevel(
      currentLevel,
      currentLevel + 1,
      effBuff,
      duration,
      exp,
    );
    hTMLStr = `<div id="tillLevel" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-align: left;">${
      runtime.config.isZH ? "到 " : "To reach level "
    }<input id="tillLevelInput" type="number" value="${currentLevel + 1}" min="${currentLevel + 1}" max="200">${
      runtime.config.isZH ? " 级还需做 " : ", need to do "
    }<span id="tillLevelNumber">${need.numOfActions}${runtime.config.isZH ? " 次" : " times "}[${runtime.api.timeReadable(need.timeSec)}]${
      runtime.config.isZH
        ? " (刷新网页更新当前等级)"
        : " (Refresh page to update current level)"
    }</span></div>`;

    appendAfterElem.insertAdjacentHTML("afterend", hTMLStr);
    const tillLevelInput = panel.querySelector("input#tillLevelInput");
    const tillLevelNumber = panel.querySelector("span#tillLevelNumber");
    tillLevelInput.onchange = () => {
      const targetLevel = Number(tillLevelInput.value);
      if (targetLevel > currentLevel && targetLevel <= 200) {
        const need = calculateNeedToLevel(
          currentLevel,
          targetLevel,
          effBuff,
          duration,
          exp,
        );
        tillLevelNumber.textContent = `${need.numOfActions}${runtime.config.isZH ? " 次" : " times "}[${runtime.api.timeReadable(need.timeSec)}]${
          runtime.config.isZH
            ? " (刷新网页更新当前等级)"
            : " (Refresh page to update current level)"
        }`;
      } else {
        tillLevelNumber.textContent = "Error";
      }
    };
    tillLevelInput.addEventListener("keyup", function (evt) {
      const targetLevel = Number(tillLevelInput.value);
      if (targetLevel > currentLevel && targetLevel <= 200) {
        const need = calculateNeedToLevel(
          currentLevel,
          targetLevel,
          effBuff,
          duration,
          exp,
        );
        tillLevelNumber.textContent = `${need.numOfActions}${runtime.config.isZH ? " 次" : " times "}[${runtime.api.timeReadable(need.timeSec)}]${
          runtime.config.isZH
            ? " (刷新网页更新当前等级)"
            : " (Refresh page to update current level)"
        }`;
      } else {
        tillLevelNumber.textContent = "Error";
      }
    });
  }

  // 显示每小时经验
  panel
    .querySelector("div#tillLevel")
    .insertAdjacentHTML(
      "afterend",
      `<div id="expPerHour" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-align: left;">${runtime.config.isZH ? "每小时经验: " : "Exp/hour: "}${runtime.api.numberFormatter(
        Math.round((3600 / duration) * exp * effBuff),
      )} (+${Number((effBuff - 1) * 100).toFixed(1)}%${runtime.config.isZH ? "效率" : " eff"})</div>`,
    );

  // 显示Foraging最后一个图综合收益
  if (
    panel.querySelector("div.SkillActionDetail_dropTable__3ViVp").children
      .length > 1 &&
    runtime.settings.settingsMap.actionPanel_foragingTotal.isTrue
  ) {
    const marketJson = await runtime.api.fetchMarketJSON();
    const actionHrid =
      "/actions/foraging/" + actionName.toLowerCase().replaceAll(" ", "_");

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
        (marketJson?.marketData[drink.itemHrid]?.[0].a ?? 0) * 12;
      drinksConsumedPerHourBidPrice +=
        (marketJson?.marketData[drink.itemHrid]?.[0].b ?? 0) * 12;
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
      const bid = marketJson?.marketData[drop.itemHrid]?.[0].b;
      const amount = drop.dropRate * ((drop.minCount + drop.maxCount) / 2);
      virtualItemNetBid +=
        bid * amount * (1 - runtime.api.getMarketTaxRate(drop.itemHrid));
    }
    let droprate = 1;
    let itemPerHour = actionPerHour * droprate;

    // 等级碾压提高效率（人物等级不及最低要求等级时，按最低要求等级计算）
    const requiredLevel =
      runtime.state.initData_actionDetailMap[actionHrid].levelRequirement.level;
    let currentLevel = requiredLevel;
    for (const skill of runtime.state.initData_characterSkills) {
      if (
        skill.skillHrid ===
        runtime.state.initData_actionDetailMap[actionHrid].levelRequirement
          .skillHrid
      ) {
        currentLevel = skill.level;
        break;
      }
    }
    const levelEffBuff =
      currentLevel - requiredLevel > 0 ? currentLevel - requiredLevel : 0;

    // 房子效率
    const houseEffBuff = runtime.api.getHousesEffBuffByActionHrid(actionHrid);

    // 特殊装备效率
    const itemEffiBuff = Number(
      runtime.api.getItemEffiBuffByActionHrid(actionHrid),
    );

    // 总效率影响动作数/生产物品数
    actionPerHour *=
      1 +
      (levelEffBuff + houseEffBuff + teaBuffs.efficiency + itemEffiBuff) / 100;
    itemPerHour *=
      1 +
      (levelEffBuff + houseEffBuff + teaBuffs.efficiency + itemEffiBuff) / 100;

    // 茶额外产品数量（不消耗原料）
    const extraFreeItemPerHour = (itemPerHour * teaBuffs.quantity) / 100;

    // 出售市场税
    const bidAfterTax = virtualItemNetBid;

    // 每小时利润
    const profitPerHour =
      itemPerHour * bidAfterTax +
      extraFreeItemPerHour * bidAfterTax -
      drinksConsumedPerHourAskPrice;

    let htmlStr = `<div id="totalProfit"  style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-align: left;">${
      runtime.config.isZH ? "综合利润: " : "Overall profit: "
    }${runtime.api.numberFormatter(profitPerHour)}${runtime.config.isZH ? "/小时" : "/hour"}, ${runtime.api.numberFormatter(24 * profitPerHour)}${runtime.config.isZH ? "/天" : "/day"}</div>`;
    panel
      .querySelector("div#expPerHour")
      .insertAdjacentHTML("afterend", htmlStr);
  }
}

function getTotalEffiPercentage(actionHrid, debug = false) {
  if (debug) {
    console.log("----- getTotalEffiPercentage " + actionHrid);
  }
  // 等级碾压效率
  const requiredLevel =
    runtime.state.initData_actionDetailMap[actionHrid].levelRequirement.level;
  let currentLevel = requiredLevel;
  for (const skill of runtime.state.initData_characterSkills) {
    if (
      skill.skillHrid ===
      runtime.state.initData_actionDetailMap[actionHrid].levelRequirement
        .skillHrid
    ) {
      currentLevel = skill.level;
      break;
    }
  }
  const levelEffBuff =
    currentLevel - requiredLevel > 0 ? currentLevel - requiredLevel : 0;
  if (debug) {
    console.log("等级碾压 " + levelEffBuff);
  }
  // 房子效率
  const houseEffBuff = runtime.api.getHousesEffBuffByActionHrid(actionHrid);
  if (debug) {
    console.log("房子 " + houseEffBuff);
  }
  // 茶
  const teaBuffs = runtime.api.getTeaBuffsByActionHrid(actionHrid);
  if (debug) {
    console.log("茶 " + teaBuffs.efficiency);
  }
  // 特殊装备
  const itemEffiBuff = runtime.api.getItemEffiBuffByActionHrid(actionHrid);
  if (debug) {
    console.log("特殊装备 " + itemEffiBuff);
  }
  // 总效率
  const total =
    levelEffBuff + houseEffBuff + teaBuffs.efficiency + Number(itemEffiBuff);
  if (debug) {
    console.log("总计 " + total);
  }
  return total;
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
  let lastValue = inputElem.value;
  inputElem.value = value;
  let event = new Event("input", { bubbles: true });
  event.simulated = true;
  let tracker = inputElem._valueTracker;
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
  } else {
    setTimeout(waitForProgressBar, 200);
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
  getTotalTimeStr,
  reactInputTriggerHack,
  waitForProgressBar,
  removeInsertedDivs,
});

runtime.registerStart("features/action-panel.js", () => {
  if (runtime.settings.settingsMap.expPercentage.isTrue) {
    window.setInterval(() => {
      removeInsertedDivs();
      waitForProgressBar();
    }, 1000);
  }
});
