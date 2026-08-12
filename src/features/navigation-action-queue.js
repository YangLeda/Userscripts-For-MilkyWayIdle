import { runtime } from "../core/runtime.js";

export const THIRD_PARTY_LINKS = [
  {
    zh: "插件合集 Q7",
    en: "Plugin collection Q7",
    url: "https://js.nainai.eu.org/",
  },
  {
    zh: "利润网 Polokikiki",
    en: "Profit site Polokikiki",
    url: "https://polokikiki.github.io/Milkonomy/#/dashboard",
  },
  {
    zh: "战斗模拟 shykai",
    en: "Combat sim shykai",
    url: "https://shykai.github.io/MWICombatSimulatorTest/dist/",
  },
  {
    zh: "新战斗模拟 Stella",
    en: "New combat sim Stella",
    url: "https://mwisim.org/combat/setup",
  },
  {
    zh: "战斗榜 socko",
    en: "Combat Tracker socko",
    url: "https://sockosnewcombattracker.pages.dev/",
  },
  {
    zh: "人才市场 Shiin",
    en: "Talent market Shiin",
    url: "https://greasyfork.org/zh-CN/scripts/559347-mwi-talent-market",
  },
];

function createMinorNavigationLink(label, onClick) {
  const div = document.createElement("div");
  div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
  div.dataset.mwitoolsExternalLink = "true";
  div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
  div.textContent = label;
  div.addEventListener("click", onClick);
  return div;
}

function add3rdPartyLinks() {
  if (!runtime.settings.get("ThirdPartyLinks")) return;
  const targetNode = document.querySelector(
    "div.NavigationBar_minorNavigationLinks__dbxh7",
  );
  if (
    !targetNode ||
    targetNode.querySelector('[data-mwitools-external-link="true"]')
  ) {
    return;
  }
  const links = THIRD_PARTY_LINKS.map((link) =>
    createMinorNavigationLink(runtime.config.isZH ? link.zh : link.en, () =>
      window.open(link.url, "_blank"),
    ),
  );
  if (runtime.config.isZH) {
    links.push(
      createMinorNavigationLink("牛牛手册", () => {
        window.open(
          "https://test-ctmd6jnzo6t9.feishu.cn/docx/KG9ddER6Eo2uPoxJFkicsvbEnCe",
          "_blank",
        );
      }),
    );
  }
  links.push(
    createMinorNavigationLink(
      runtime.config.isZH ? "插件设置" : "Script settings",
      () => {
        const array = document.querySelectorAll(
          ".NavigationBar_navigationLink__3eAHA",
        );
        array[array.length - 1]?.click();
      },
    ),
  );
  const fragment = document.createDocumentFragment();
  links.forEach((link) => fragment.append(link));
  targetNode.insertBefore(fragment, targetNode.firstChild);
}

const actionQueueObservers = new Map();

function disconnectActionQueueObservers() {
  for (const observer of actionQueueObservers.values()) observer.disconnect();
  actionQueueObservers.clear();
}

function handleActionQueueMenue(added) {
  if (!runtime.settings.get("actionQueue")) return;
  handleActionQueueMenueCalculateTime(added);

  const listDiv = added.querySelector(".QueuedActions_actions__2Lur6");
  if (!listDiv || actionQueueObservers.has(added)) return;
  const observer = new MutationObserver(() => {
    if (!runtime.settings.get("actionQueue")) {
      observer.disconnect();
      actionQueueObservers.delete(added);
      return;
    }
    handleActionQueueMenueCalculateTime(added);
  });
  actionQueueObservers.set(added, observer);
  observer.observe(listDiv, {
    characterData: false,
    subtree: false,
    childList: true,
  });
}

function handleActionQueueMenueCalculateTime(added) {
  const actionDivList = added.querySelectorAll(
    "div.QueuedActions_action__r3HlD",
  );
  if (!actionDivList.length) return;
  if (
    actionDivList.length !==
    runtime.state.currentActionsHridList.length - 1
  ) {
    console.error(
      runtime.config.isZH
        ? "[MWITools] 行动队列提示中的行动数量不一致。"
        : "[MWITools] Action count mismatch in the action queue tooltip.",
    );
    return;
  }

  let actionDivListIndex = 0;
  let hasSkippedFirstAction = false;
  let accumulatedTimeSec = 0;
  let isAccumulatedTimeInfinite = false;
  for (const actionObj of runtime.state.currentActionsHridList) {
    const actionHrid = actionObj.actionHrid;
    const count = actionObj.maxCount - actionObj.currentCount;
    const isInfinite = count === 0 || actionHrid.includes("/combat/");
    if (isInfinite) isAccumulatedTimeInfinite = true;

    const detail = runtime.state.initData_actionDetailMap[actionHrid];
    if (!detail) continue;
    const baseTimePerActionSec = detail.baseTimeCost / 1_000_000_000;
    const totalEffBuff = runtime.api.getTotalEffiPercentage(actionHrid);
    const toolSpeedBuff = runtime.api.getToolsSpeedBuffByActionHrid(actionHrid);
    let timePerActionSec = baseTimePerActionSec / (1 + toolSpeedBuff / 100);
    timePerActionSec /= 1 + totalEffBuff / 100;
    const totalTimeSec = count * timePerActionSec;

    let completion = runtime.config.isZH ? "到 ∞ " : "Complete at ∞ ";
    if (!isAccumulatedTimeInfinite) {
      accumulatedTimeSec += totalTimeSec;
      const currentTime = new Date();
      currentTime.setSeconds(currentTime.getSeconds() + accumulatedTimeSec);
      completion = `${runtime.config.isZH ? "到 " : "Complete at "}${String(currentTime.getHours()).padStart(2, "0")}:${String(currentTime.getMinutes()).padStart(2, "0")}:${String(currentTime.getSeconds()).padStart(2, "0")}`;
    }

    if (hasSkippedFirstAction) {
      const html = `<div class="script_actionTime" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${
        isInfinite ? "[ ∞ ] " : `[${runtime.api.timeReadable(totalTimeSec)}]`
      } ${completion}</div>`;
      const target = actionDivList[actionDivListIndex]?.querySelector("div");
      const current = target?.querySelector("div.script_actionTime");
      if (current) current.outerHTML = html;
      else target?.insertAdjacentHTML("beforeend", html);
      actionDivListIndex += 1;
    }
    hasSkippedFirstAction = true;
  }

  const html = `<div id="script_queueTotalTime" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "总时间：" : "Total time: "}${
    isAccumulatedTimeInfinite
      ? "[ ∞ ] "
      : `[${runtime.api.timeReadable(accumulatedTimeSec)}]`
  }</div>`;
  const currentTotal = document.querySelector("div#script_queueTotalTime");
  if (currentTotal) currentTotal.outerHTML = html;
  else added.insertAdjacentHTML("afterend", html);
}

function getOriTextFromElement(element) {
  if (!element) {
    console.error(
      runtime.config.isZH
        ? "[MWITools] 无法读取空元素的文字。"
        : "[MWITools] Cannot read text from a missing element.",
    );
    return "";
  }
  return element.getAttribute("script_translatedfrom") || element.textContent;
}

Object.assign(runtime.api, {
  add3rdPartyLinks,
  disconnectActionQueueObservers,
  getOriTextFromElement,
  handleActionQueueMenue,
  handleActionQueueMenueCalculateTime,
});
