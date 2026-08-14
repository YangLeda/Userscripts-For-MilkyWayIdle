import { runtime } from "../core/runtime.js";
import {
  formatRemainingDuration,
  formatRemainingTiming,
} from "../core/time-format.js";

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

let activeActionQueueObserver = null;

function disconnectActionQueueObserver(root = null) {
  if (!activeActionQueueObserver) return false;
  if (
    root &&
    activeActionQueueObserver.menu !== root &&
    !root.contains?.(activeActionQueueObserver.menu)
  ) {
    return false;
  }
  if (activeActionQueueObserver.frameId !== null) {
    (globalThis.cancelAnimationFrame ?? clearTimeout)(
      activeActionQueueObserver.frameId,
    );
  }
  clearTimeout(activeActionQueueObserver.retryId);
  activeActionQueueObserver.observer.disconnect();
  activeActionQueueObserver = null;
  return true;
}

function scheduleActionQueueRefresh(added, { retry = true } = {}) {
  const active = activeActionQueueObserver;
  if (!active || active.menu !== added) return;
  if (active.frameId !== null) {
    (globalThis.cancelAnimationFrame ?? clearTimeout)(active.frameId);
  }
  clearTimeout(active.retryId);
  const requestFrame =
    globalThis.requestAnimationFrame ?? ((callback) => setTimeout(callback, 0));
  active.frameId = requestFrame(() => {
    if (activeActionQueueObserver !== active) return;
    active.frameId = null;
    if (!runtime.settings.get("actionQueue") || !added.isConnected) {
      disconnectActionQueueObserver(added);
      return;
    }
    handleActionQueueMenueCalculateTime(added);
    if (retry) {
      active.retryId = setTimeout(() => {
        if (activeActionQueueObserver === active && added.isConnected) {
          handleActionQueueMenueCalculateTime(added);
        }
      }, 100);
    }
  });
}

function disconnectActionQueueObservers() {
  disconnectActionQueueObserver();
}

function handleActionQueueMenue(added) {
  if (!runtime.settings.get("actionQueue")) return;
  const listDiv = added.querySelector(".QueuedActions_actions__2Lur6");
  if (!listDiv) return;
  if (activeActionQueueObserver?.menu === added) {
    scheduleActionQueueRefresh(added);
    return;
  }
  disconnectActionQueueObserver();
  const observer = new MutationObserver(() => {
    if (!runtime.settings.get("actionQueue") || !added.isConnected) {
      disconnectActionQueueObserver(added);
      return;
    }
    scheduleActionQueueRefresh(added);
  });
  activeActionQueueObserver = {
    menu: added,
    observer,
    frameId: null,
    retryId: null,
  };
  observer.observe(listDiv, {
    characterData: false,
    subtree: false,
    childList: true,
  });
  handleActionQueueMenueCalculateTime(added);
}

function handleActionQueueMenueCalculateTime(added) {
  const actionDivList = added.querySelectorAll(
    "div.QueuedActions_action__r3HlD",
  );
  const actions = [...(runtime.state.currentActionsHridList ?? [])].sort(
    (left, right) => Number(left?.ordinal ?? 0) - Number(right?.ordinal ?? 0),
  );
  if (!actionDivList.length && actions.length > 1) return false;
  if (actionDivList.length !== Math.max(0, actions.length - 1)) {
    console.error(
      runtime.config.isZH
        ? "[MWITools] 行动队列提示中的行动数量不一致。"
        : "[MWITools] Action count mismatch in the action queue tooltip.",
    );
    return false;
  }

  let finitePrefixSeconds = 0;
  let reachedInfinite = false;
  const now = Date.now();
  for (const [index, actionObj] of actions.entries()) {
    const queuedRow = index > 0 ? actionDivList[index - 1] : null;
    const target = queuedRow?.querySelector("div");
    const current = target?.querySelector("div.script_actionTime");
    if (reachedInfinite) {
      current?.remove();
      continue;
    }
    const actionHrid = String(actionObj.actionHrid ?? "");
    const count = actionObj.maxCount - actionObj.currentCount;
    const isInfinite = count === 0 || actionHrid.includes("/combat/");
    const detail = runtime.state.initData_actionDetailMap[actionHrid];
    const timing = detail
      ? runtime.api.projectActionTiming?.(
          actionHrid,
          isInfinite ? Infinity : count,
        )
      : null;
    const totalTimeSec = timing?.totalSeconds;
    const unavailable = !Number.isFinite(totalTimeSec);
    const boundary = isInfinite || unavailable;
    if (boundary) reachedInfinite = true;
    else finitePrefixSeconds += totalTimeSec;

    if (queuedRow) {
      const output = current ?? document.createElement("div");
      output.className = "script_actionTime";
      output.style.color = runtime.config.SCRIPT_COLOR_MAIN;
      output.textContent = formatRemainingTiming(
        boundary ? Infinity : totalTimeSec,
        boundary ? null : now + finitePrefixSeconds * 1000,
        { isZH: runtime.config.isZH, now },
      );
      if (!current) target?.append(output);
    }
  }

  const currentTotal = added.parentElement?.querySelector(
    ":scope > div#script_queueTotalTime",
  );
  const total = currentTotal ?? document.createElement("div");
  total.id = "script_queueTotalTime";
  total.style.color = runtime.config.SCRIPT_COLOR_MAIN;
  const totalText = reachedInfinite
    ? finitePrefixSeconds > 0
      ? `${formatRemainingDuration(finitePrefixSeconds, runtime.config.isZH)} + ∞`
      : "∞"
    : formatRemainingTiming(
        finitePrefixSeconds,
        now + finitePrefixSeconds * 1000,
        { isZH: runtime.config.isZH, now },
      );
  total.textContent = `${runtime.config.isZH ? "总时间：" : "Total time: "}${totalText}`;
  if (!currentTotal) added.insertAdjacentElement("afterend", total);
  return true;
}

runtime.onMessage("actions_updated", () => {
  if (activeActionQueueObserver) {
    scheduleActionQueueRefresh(activeActionQueueObserver.menu);
  }
});

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
  disconnectActionQueueObserver,
  disconnectActionQueueObservers,
  getActiveActionQueueObserverCount: () =>
    activeActionQueueObserver === null ? 0 : 1,
  getOriTextFromElement,
  handleActionQueueMenue,
  handleActionQueueMenueCalculateTime,
});
