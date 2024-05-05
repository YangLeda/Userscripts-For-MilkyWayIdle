// ==UserScript==
// @name         MWITools
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Tools for MilkyWayIdle.
// @author       bot7420
// @match        https://www.milkywayidle.com/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(() => {
    "use strict";

    let initData_characterSkills = null;
    let initData_actionDetailMap = null;
    let initData_levelExperienceTable = null;
    let initData_itemDetailMap = null;
    hookWS();

    fetchMarketJSON(true);

    function hookWS() {
        const dataProperty = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data");
        const oriGet = dataProperty.get;

        dataProperty.get = hookedGet;
        Object.defineProperty(MessageEvent.prototype, "data", dataProperty);

        function hookedGet() {
            const socket = this.currentTarget;
            if (!(socket instanceof WebSocket)) {
                return oriGet.call(this);
            }
            if (socket.url.indexOf("api.milkywayidle.com/ws") <= -1) {
                return oriGet.call(this);
            }

            const message = oriGet.call(this);
            Object.defineProperty(this, "data", { value: message }); // Anti-loop

            return handleMessage(message);
        }
    }

    function handleMessage(message) {
        let obj = JSON.parse(message);
        if (obj && obj.type === "init_character_data") {
            console.log(obj.characterSkills);
            initData_characterSkills = obj.characterSkills;
        } else if (obj && obj.type === "init_client_data") {
            console.log(obj.actionDetailMap);
            initData_actionDetailMap = obj.actionDetailMap;
            initData_levelExperienceTable = obj.levelExperienceTable;
            initData_itemDetailMap = obj.itemDetailMap;
        }
        return message;
    }

    /* 显示当前动作总时间 */
    const showTotalActionTime = () => {
        const targetNode = document.querySelector("div.Header_actionName__31-L2 > div.Header_actionName__31-L2");
        if (targetNode) {
            calculateTotalTime(targetNode);
            new MutationObserver((mutationsList) =>
                mutationsList.forEach((mutation) => {
                    if (mutation.type === "characterData") {
                        calculateTotalTime();
                    }
                })
            ).observe(targetNode, { characterData: true, subtree: true });
        } else {
            setTimeout(showTotalActionTime, 200);
        }
    };
    showTotalActionTime();

    function calculateTotalTime() {
        const targetNode = document.querySelector("div.Header_actionName__31-L2 > div.Header_actionName__31-L2");
        const textNode = [...targetNode.childNodes]
            .filter((child) => child.nodeType === Node.TEXT_NODE)
            .filter((child) => child.textContent.trim())
            .map((textNode) => textNode)[0];
        if (textNode.textContent.includes("[")) {
            return;
        }

        let totalTimeStr = "Error";
        if (targetNode.childNodes.length === 1) {
            totalTimeStr = " [" + timeReadable(0) + "]";
        } else if (targetNode.childNodes.length === 2) {
            const content = targetNode.innerText;
            const match = content.match(/\((\d+)\)/);
            if (match) {
                const NumOfTimes = +match[1];
                const TimePerActionSec = +document.querySelector(".ProgressBar_text__102Yn").textContent.match(/[\d\.]+/)[0];
                totalTimeStr = " [" + timeReadable(NumOfTimes * TimePerActionSec) + "]";
            } else {
                totalTimeStr = " [∞]";
            }
        }
        textNode.textContent += totalTimeStr;
    }

    function timeReadable(sec) {
        if (sec >= 86400) {
            return Number(sec / 86400).toFixed(1) + " 天";
        }
        const d = new Date(Math.round(sec * 1000));
        function pad(i) {
            return ("0" + i).slice(-2);
        }
        let str = d.getUTCHours() + "h " + pad(d.getUTCMinutes()) + "m " + pad(d.getUTCSeconds()) + "s";
        return str;
    }

    /* 物品 ToolTips */
    const tooltipObserver = new MutationObserver(async function (mutations) {
        for (const mutation of mutations) {
            for (const added of mutation.addedNodes) {
                if (added.classList.contains("MuiTooltip-popper")) {
                    if (added.querySelector("div.ItemTooltipText_name__2JAHA")) {
                        await handleTooltipItem(added);
                    }
                }
            }
        }
    });
    tooltipObserver.observe(document.body, { attributes: false, childList: true, characterData: false });

    async function handleTooltipItem(tooltip) {
        const itemName = tooltip.querySelector("div.ItemTooltipText_name__2JAHA").textContent;
        const amountSpan = tooltip.querySelectorAll("span")[1];
        const amount = +amountSpan.textContent.split(": ")[1].replaceAll(",", "");

        const jsonObj = await fetchMarketJSON();
        if (!jsonObj) {
            amountSpan.parentNode.insertAdjacentHTML(
                "afterend",
                `
                <div style="color: DarkGreen;"">获取市场API失败</div>
                `
            );
            return;
        }
        if (!jsonObj.market) {
            amountSpan.parentNode.insertAdjacentHTML(
                "afterend",
                `
                <div style="color: DarkGreen;"">市场API格式错误</div>
                `
            );
            return;
        }

        let appendHTMLStr = "";

        // 市场价格
        const ask = jsonObj?.market[itemName]?.ask;
        const bid = jsonObj?.market[itemName]?.bid;
        appendHTMLStr += `<div style="color: DarkGreen;"">----------</div>`;
        appendHTMLStr += `
        <div style="color: DarkGreen;"">日均卖单价: ${numberFormatter(ask)} ${ask && ask > 0 ? "(" + numberFormatter(ask * amount) + ")" : ""}</div>
        <div style="color: DarkGreen;"">日均买单价: ${numberFormatter(bid)} ${bid && bid > 0 ? "(" + numberFormatter(bid * amount) + ")" : ""}</div>
        `;

        if (
            getActionHridFromItemName(itemName) &&
            initData_actionDetailMap[getActionHridFromItemName(itemName)].inputItems &&
            initData_actionDetailMap[getActionHridFromItemName(itemName)].inputItems.length > 0 &&
            initData_actionDetailMap &&
            initData_itemDetailMap
        ) {
            // 制造
            const inputItems = JSON.parse(JSON.stringify(initData_actionDetailMap[getActionHridFromItemName(itemName)].inputItems));
            let totalAskPrice = 0;
            let totalBidPrice = 0;
            for (let item of inputItems) {
                item.name = initData_itemDetailMap[item.itemHrid].name;
                item.perAskPrice = jsonObj?.market[item.name]?.ask;
                item.perBidPrice = jsonObj?.market[item.name]?.bid;
                totalAskPrice += item.perAskPrice * item.count;
                totalBidPrice += item.perBidPrice * item.count;
            }

            appendHTMLStr += `<div style="color: DarkGreen;"">----------</div>`;
            appendHTMLStr += `<div style="color: DarkGreen;"">原料卖单价：</div>`;
            for (const item of inputItems) {
                appendHTMLStr += `
                <div style="color: DarkGreen;""> [${item.name} x ${item.count}]: ${numberFormatter(item.perAskPrice)} (${numberFormatter(item.perAskPrice * item.count)})</div>
                `;
            }
            appendHTMLStr += `<div style="color: DarkGreen;"">[总价]: ${numberFormatter(totalAskPrice)}</div>`;
            appendHTMLStr += `<div style="color: DarkGreen;"">原料买单价：</div>`;
            for (const item of inputItems) {
                appendHTMLStr += `
                <div style="color: DarkGreen;""> [${item.name} x ${item.count}]: ${numberFormatter(item.perBidPrice)} (${numberFormatter(item.perBidPrice * item.count)})</div>
                `;
            }
            appendHTMLStr += `<div style="color: DarkGreen;"">[总价]: ${numberFormatter(totalBidPrice)}</div>`;

            let produceItemPerHour = 3600000 / (initData_actionDetailMap[getActionHridFromItemName(itemName)].baseTimeCost / 1000000);
            appendHTMLStr += `<div style="color: DarkGreen;"">----------</div>`;
            appendHTMLStr += `<div style="color: DarkGreen;"">生产利润(不包含任何加成；卖单价进、买单价出)：</div>`;
            appendHTMLStr += `<div style="color: DarkGreen;"">每个: ${numberFormatter(bid - totalAskPrice)}</div>`;
            appendHTMLStr += `<div style="color: DarkGreen;"">每小时: ${numberFormatter(produceItemPerHour * (bid - totalAskPrice))}</div>`;
            appendHTMLStr += `<div style="color: DarkGreen;"">每天: ${numberFormatter(24 * produceItemPerHour * (bid - totalAskPrice))}</div>`;
        } else if (getActionHridFromItemName(itemName) && initData_actionDetailMap[getActionHridFromItemName(itemName)].inputItems === null && initData_actionDetailMap && initData_itemDetailMap) {
            // 采集
            let produceItemPerHour = 3600000 / (initData_actionDetailMap[getActionHridFromItemName(itemName)].baseTimeCost / 1000000);
            appendHTMLStr += `<div style="color: DarkGreen;"">----------</div>`;
            appendHTMLStr += `<div style="color: DarkGreen;"">生产利润(不包含任何加成；卖单价进、买单价出)：</div>`;
            appendHTMLStr += `<div style="color: DarkGreen;"">每个: ${numberFormatter(bid)}</div>`;
            appendHTMLStr += `<div style="color: DarkGreen;"">每小时: ${numberFormatter(produceItemPerHour * bid)}</div>`;
            appendHTMLStr += `<div style="color: DarkGreen;"">每天: ${numberFormatter(24 * produceItemPerHour * bid)}</div>`;
        }

        appendHTMLStr += `<div style="color: DarkGreen;"">----------</div>`;
        amountSpan.parentNode.insertAdjacentHTML("afterend", appendHTMLStr);
    }

    async function fetchMarketJSON(forceFetch = false) {
        if (!forceFetch && localStorage.getItem("MWITools_marketAPI_timestamp") && Date.now() - localStorage.getItem("MWITools_marketAPI_timestamp") < 900000) {
            return JSON.parse(localStorage.getItem("MWITools_marketAPI_json"));
        }

        const jsonStr = await new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                url: `https://raw.githubusercontent.com/holychikenz/MWIApi/main/medianmarket.json`,
                method: "GET",
                synchronous: true,
                onload: async (response) => {
                    if (response.status == 200) {
                        resolve(response.responseText);
                    } else {
                        console.error("MWITools: fetchMarketJSON onload with HTTP status " + response.status);
                        resolve("");
                    }
                },
                onabort: () => {
                    console.error("MWITools: fetchMarketJSON onabort");
                    resolve("");
                },
                onerror: () => {
                    console.error("MWITools: fetchMarketJSON onerror");
                    resolve("");
                },
                ontimeout: () => {
                    console.error("MWITools: fetchMarketJSON ontimeout");
                    resolve("");
                },
            });
        });

        const jsonObj = JSON.parse(jsonStr);
        if (jsonObj && jsonObj.time && jsonObj.market) {
            jsonObj.market.Coin.ask = 1;
            jsonObj.market.Coin.bid = 1;
            console.log(jsonObj);
            localStorage.setItem("MWITools_marketAPI_timestamp", Date.now());
            localStorage.setItem("MWITools_marketAPI_json", JSON.stringify(jsonObj));
            return jsonObj;
        }
        localStorage.setItem("MWITools_marketAPI_timestamp", 0);
        localStorage.setItem("MWITools_marketAPI_json", "");
        return null;
    }

    function numberFormatter(num, digits = 1) {
        if (num === null || num === undefined) {
            return null;
        }
        if (num < 0) {
            return "-" + numberFormatter(-num);
        }
        const lookup = [
            { value: 1, symbol: "" },
            { value: 1e3, symbol: "k" },
            { value: 1e6, symbol: "M" },
            { value: 1e9, symbol: "B" },
        ];
        const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
        var item = lookup
            .slice()
            .reverse()
            .find(function (item) {
                return num >= item.value;
            });
        return item ? (num / item.value).toFixed(digits).replace(rx, "$1") + item.symbol : "0";
    }

    function getActionHridFromItemName(name) {
        let newName = name.replace("Milk", "Cow");
        newName = newName.replace("Log", "Tree");
        newName = newName.replace("Cowing", "Milking");
        if (!initData_actionDetailMap) {
            console.error("getActionHridFromItemName no initData_actionDetailMap: " + name);
            return null;
        }
        for (const action of Object.values(initData_actionDetailMap)) {
            if (action.name === newName) {
                return action.hrid;
            }
        }
        console.error("getActionHridFromItemName not found: " + name);
        return null;
    }

    /* 动作面板 */
    const waitForActionPanelParent = () => {
        const targetNode = document.querySelector("div.GamePage_mainPanel__2njyb");
        if (targetNode) {
            const actionPanelObserver = new MutationObserver(async function (mutations) {
                for (const mutation of mutations) {
                    for (const added of mutation.addedNodes) {
                        if (added && added.classList && added.classList.contains("Modal_modalContainer__3B80m") && added.querySelector("div.SkillActionDetail_nonenhancingComponent__1Y-ZY")) {
                            handleActionPanel(added.querySelector("div.SkillActionDetail_nonenhancingComponent__1Y-ZY"));
                        }
                    }
                }
            });
            actionPanelObserver.observe(targetNode, { attributes: false, childList: true, subtree: true });
        } else {
            setTimeout(waitForActionPanelParent, 200);
        }
    };
    waitForActionPanelParent();

    function handleActionPanel(panel) {
        const actionName = panel.querySelector("div.SkillActionDetail_name__3erHV").textContent;
        const exp = Number(panel.querySelector("div.SkillActionDetail_expGain__F5xHu").textContent);
        const duration = Number(panel.querySelectorAll("div.SkillActionDetail_value__dQjYH")[4].textContent.replace("s", ""));
        const inputElem = panel.querySelector("div.SkillActionDetail_maxActionCountInput__1C0Pw input");

        // 显示总时间
        let hTMLStr = `<div id="showTotalTime" style="color: Green; text-align: left;">${getTotalTimeStr(inputElem.value, duration)}</div>`;
        inputElem.parentNode.insertAdjacentHTML("afterend", hTMLStr);
        const showTotalTimeDiv = panel.querySelector("div#showTotalTime");

        panel.addEventListener("click", function (evt) {
            setTimeout(() => {
                showTotalTimeDiv.textContent = getTotalTimeStr(inputElem.value, duration);
            }, 50);
        });
        inputElem.addEventListener("keyup", function (evt) {
            showTotalTimeDiv.textContent = getTotalTimeStr(inputElem.value, duration);
        });

        // 显示快捷按钮
        hTMLStr = `<div id="quickInputButtons" style="color: Green; text-align: left;">做 </div>`;
        showTotalTimeDiv.insertAdjacentHTML("afterend", hTMLStr);
        const quickInputButtonsDiv = panel.querySelector("div#quickInputButtons");

        const presetHours = [0.5, 1, 2, 3, 4, 5, 6, 10, 12, 24];
        for (const value of presetHours) {
            const btn = document.createElement("button");
            btn.innerText = value === 0.5 ? 0.5 : numberFormatter(value);
            btn.style.backgroundColor = "green";
            btn.onclick = () => {
                reactInputTriggerHack(inputElem, Math.round((value * 60 * 60) / duration));
            };
            quickInputButtonsDiv.append(btn);
        }
        quickInputButtonsDiv.append(document.createTextNode(" 小时"));

        quickInputButtonsDiv.append(document.createElement("div"));
        quickInputButtonsDiv.append(document.createTextNode("做 "));
        const presetTimes = [10, 20, 50, 100, 200, 500, 1000, 2000];
        for (const value of presetTimes) {
            const btn = document.createElement("button");
            btn.innerText = numberFormatter(value);
            btn.style.backgroundColor = "green";
            btn.onclick = () => {
                reactInputTriggerHack(inputElem, value);
            };
            quickInputButtonsDiv.append(btn);
        }
        quickInputButtonsDiv.append(document.createTextNode(" 次"));

        // 还有多久到多少技能等级
        const skillHrid = initData_actionDetailMap[getActionHridFromItemName(actionName)].experienceGain.skillHrid;
        let currentExp = null;
        let currentLevel = null;
        for (const skill of initData_characterSkills) {
            if (skill.skillHrid === skillHrid) {
                currentExp = skill.experience;
                currentLevel = skill.level;
                break;
            }
        }
        if (currentExp && currentLevel) {
            let targetLevel = currentLevel + 1;
            let needExp = initData_levelExperienceTable[targetLevel] - currentExp;
            let needNumOfActions = Math.round(needExp / exp);
            let needTime = timeReadable(needNumOfActions * duration);

            hTMLStr = `<div id="tillLevel" style="color: Green; text-align: left;">到 <input id="tillLevelInput" type="number" style="background-color: Green;" value="${targetLevel}" min="${targetLevel}" max="200"> 级还需做 <span id="tillLevelNumber">${needNumOfActions} 次[${needTime}] (刷新网页更新当前等级)</span></div>`;
            quickInputButtonsDiv.insertAdjacentHTML("afterend", hTMLStr);
            const tillLevelInput = panel.querySelector("input#tillLevelInput");
            const tillLevelNumber = panel.querySelector("span#tillLevelNumber");
            tillLevelInput.onchange = () => {
                let targetLevel = Number(tillLevelInput.value);
                if (targetLevel > currentLevel && targetLevel <= 200) {
                    let needExp = initData_levelExperienceTable[targetLevel] - currentExp;
                    let needNumOfActions = Math.round(needExp / exp);
                    let needTime = timeReadable(needNumOfActions * duration);
                    tillLevelNumber.textContent = `${needNumOfActions} 次 [${needTime}] (刷新网页更新当前等级)`;
                } else {
                    tillLevelNumber.textContent = "Error";
                }
            };
            tillLevelInput.addEventListener("keyup", function (evt) {
                let targetLevel = Number(tillLevelInput.value);
                if (targetLevel > currentLevel && targetLevel <= 200) {
                    let needExp = initData_levelExperienceTable[targetLevel] - currentExp;
                    let needNumOfActions = Math.round(needExp / exp);
                    let needTime = timeReadable(needNumOfActions * duration);
                    tillLevelNumber.textContent = `${needNumOfActions} 次 [${needTime}] (刷新网页更新当前等级)`;
                } else {
                    tillLevelNumber.textContent = "Error";
                }
            });
        }
    }

    function getTotalTimeStr(input, duration) {
        if (input === "unlimited") {
            return "[∞]";
        } else if (isNaN(input)) {
            return "Error";
        }
        return "[" + timeReadable(input * duration) + "]";
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
        const elements = document.querySelectorAll(".NavigationBar_currentExperience__3GDeX");
        if (elements.length) {
            removeInsertedDivs();
            elements.forEach((element) => {
                let text = element.style.width;
                text = Number(text.replace("%", "")).toFixed(2) + "%";

                const span = document.createElement("span");
                span.textContent = text;
                span.classList.add("insertedSpan");
                span.style.fontSize = "13px";
                span.style.color = "green";

                element.parentNode.parentNode.querySelector("span.NavigationBar_level__3C7eR").style.width = "auto";

                const insertParent = element.parentNode.parentNode.children[0];
                insertParent.insertBefore(span, insertParent.children[1]);
            });
        } else {
            setTimeout(waitForProgressBar, 200);
        }
    };

    const removeInsertedDivs = () => document.querySelectorAll("span.insertedSpan").forEach((div) => div.parentNode.removeChild(div));

    window.setInterval(() => {
        removeInsertedDivs();
        waitForProgressBar();
    }, 1000);
})();