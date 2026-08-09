import { runtime } from "../core/runtime.js";

// 此功能基于以下作者的代码：
// 伤害统计 by ponchain
// 图表 by Stella
// 头像下方显示数字 by Truth_Light
const lang = {
  toggleButtonHide: runtime.config.isZH ? "收起" : "Hide",
  toggleButtonShow: runtime.config.isZH ? "展开" : "Show",
  players: runtime.config.isZH ? "玩家" : "Players",
  dpsTextDPS: runtime.config.isZH ? "DPS" : "DPS",
  dpsTextTotalDamage: runtime.config.isZH ? "总伤害" : "Total Damage",
  totalRuntime: runtime.config.isZH ? "运行时间" : "Runtime",
  totalTeamDPS: runtime.config.isZH ? "团队DPS" : "Total Team DPS",
  totalTeamDamage: runtime.config.isZH ? "团队总伤害" : "Total Team Damage",
  damagePercentage: runtime.config.isZH ? "伤害占比" : "Damage %",
  monstername: runtime.config.isZH ? "怪物" : "Monster",
  encountertimes: runtime.config.isZH ? "遭遇数" : "Encounter",
  hitChance: runtime.config.isZH ? "命中率" : "Hit Chance",
  aura: runtime.config.isZH ? "光环" : "Aura",
};

let totalDamage = [];

let totalDuration = 0;

let startTime = null;

let endTime = null;

let monstersHP = [];

let playersMP = [];

let players = [];

let monsters = [];

let dragging = false;

let chart = null;

let monsterCounts = {};
// Object to store monster counts
let monsterEvasion = {};
// Object to store monster evasion ratings by combat style
let monsterHrids = {};

const calculateHitChance = (accuracy, evasion) => {
  const hitChance =
    (Math.pow(accuracy, 1.4) /
      (Math.pow(accuracy, 1.4) + Math.pow(evasion, 1.4))) *
    100;
  return hitChance;
};

const getStatisticsDom = () => {
  const numPlayers = players.length;
  const chartHeight = numPlayers * 35 + 20;

  if (!document.querySelector(".script_dps_panel")) {
    let panel = document.createElement("div");
    panel.style.position = "fixed";
    panel.style.top = "50px";
    panel.style.left = "50px";
    panel.style.zIndex = "9999";
    panel.style.fontSize = "0.875rem";
    panel.style.padding = "10px";
    panel.style.borderRadius = "16px";
    panel.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.3)";
    panel.style.overflow = "auto";
    panel.style.width = "auto";
    panel.style.height = "auto";
    panel.style.backdropFilter = "blur(8px)";
    if (runtime.settings.settingsMap.damageGraphTransparentBackground.isTrue) {
      panel.style.background = "rgba(0, 0, 0, 0.5)";
      panel.style.border = "1px solid rgba(255, 255, 255, 0.2)";
      panel.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.3)";
      panel.style.backdropFilter = "blur(8px)";
    } else {
      panel.style.background = "rgba(0, 0, 0)";
      panel.style.border = "1px solid rgba(255, 255, 255)";
      panel.style.boxShadow = "0 4px 12px rgba(0, 0, 0)";
    }

    panel.innerHTML = `
        <div id="panelHeader" style="display: flex; justify-content: space-between; align-items: center; cursor: move; width: auto; height: auto;">
            <span style="font-weight: bold; font-size: 1rem; color: #0078d4;">DPS</span>
            <button id="script_toggleButton" style="background-color: #0078d4; color: white; border: none; padding: 5px 10px; margin-left: 10px; border-radius: 8px; cursor: pointer;">${lang.toggleButtonHide}</button>
        </div>
        <div id="script_panelContent">
            <div id="script_dpsChart_div" style="width: 400px; height: ${chartHeight}px;">
                <canvas id="script_dpsChart"></canvas></div>
            <div id="script_dpsText"></div>
            <div id="script_hitChanceTable" style="margin-top: 10px;"></div>
        </div>`;
    panel.className = "script_dps_panel";

    let offsetX, offsetY;
    let dragging = false;

    const panelHeader = panel.querySelector("#panelHeader");

    // 鼠标拖动面板
    panelHeader.addEventListener("mousedown", function (e) {
      const rect = panel.getBoundingClientRect();
      const isResizing =
        e.clientX > rect.right - 10 || e.clientY > rect.bottom - 10;
      if (isResizing || e.target.id === "script_toggleButton") return;
      dragging = true;
      offsetX = e.clientX - panel.offsetLeft;
      offsetY = e.clientY - panel.offsetTop;
      e.preventDefault(); // 阻止默认行为，防止选择文本
    });

    let dragStartTime = 0;

    document.addEventListener("mousemove", function (e) {
      if (dragging) {
        const now = Date.now();
        if (now - dragStartTime < 16) return; // 限制每16毫秒更新一次
        dragStartTime = now;

        var newX = e.clientX - offsetX;
        var newY = e.clientY - offsetY;
        panel.style.left = newX + "px";
        panel.style.top = newY + "px";
      }
    });

    document.addEventListener("mouseup", function () {
      dragging = false;
    });

    panel.addEventListener("touchstart", function (e) {
      const rect = panel.getBoundingClientRect();
      const isResizing =
        e.clientX > rect.right - 10 || e.clientY > rect.bottom - 10;
      if (isResizing || e.target.id === "script_toggleButton") return;
      dragging = true;
      let touch = e.touches[0];
      offsetX = touch.clientX - panel.offsetLeft;
      offsetY = touch.clientY - panel.offsetTop;
      e.preventDefault();
    });

    document.addEventListener("touchmove", function (e) {
      if (dragging) {
        const now = Date.now();
        if (now - dragStartTime < 16) return; // 限制每16毫秒更新一次
        dragStartTime = now;

        let touch = e.touches[0];
        var newX = touch.clientX - offsetX;
        var newY = touch.clientY - offsetY;
        panel.style.left = newX + "px";
        panel.style.top = newY + "px";
      }
    });

    document.addEventListener("touchend", function () {
      dragging = false;
    });

    document.body.appendChild(panel);

    // Toggle button functionality
    if (!localStorage.getItem("script_dpsPanel_isExpanded")) {
      localStorage.setItem("script_dpsPanel_isExpanded", true);
    }
    if (localStorage.getItem("script_dpsPanel_isExpanded") !== "true") {
      document.getElementById("script_panelContent").style.display = "none";
      document.getElementById("script_toggleButton").textContent =
        lang.toggleButtonShow;
    }

    document
      .getElementById("script_toggleButton")
      .addEventListener("click", function () {
        let isExpanded =
          localStorage.getItem("script_dpsPanel_isExpanded") === "true";
        isExpanded = !isExpanded;
        localStorage.setItem(
          "script_dpsPanel_isExpanded",
          isExpanded ? true : false,
        );
        this.textContent = isExpanded
          ? lang.toggleButtonHide
          : lang.toggleButtonShow;
        const panelContent = document.getElementById("script_panelContent");
        if (isExpanded) {
          panelContent.style.display = "block";
          this.textContent = lang.toggleButtonHide;
        } else {
          panelContent.style.display = "none";
          this.textContent = lang.toggleButtonShow;
        }
      });

    // Create chart
    const ctx = document.getElementById("script_dpsChart").getContext("2d");
    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            backgroundColor: [
              "rgba(255, 99, 132, 0.6)", // 浅粉色
              "rgba(54, 162, 235, 0.6)", // 浅蓝色
              "rgba(255, 206, 86, 0.6)", // 浅黄色
              "rgba(75, 192, 192, 0.6)", // 浅绿色
              "rgba(153, 102, 255, 0.6)", // 浅紫色
              "rgba(255, 159, 64, 0.6)", // 浅橙色
            ],
            borderColor: [
              "rgba(255, 99, 132, 1)", // 浅粉色边框
              "rgba(54, 162, 235, 1)", // 浅蓝色边框
              "rgba(255, 206, 86, 1)", // 浅黄色边框
              "rgba(75, 192, 192, 1)", // 浅绿色边框
              "rgba(153, 102, 255, 1)", // 浅紫色边框
              "rgba(255, 159, 64, 1)", // 浅橙色边框
            ],
            borderWidth: 1,
            barPercentage: 0.9,
            categoryPercentage: 1.0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        scales: {
          x: {
            beginAtZero: true,
            grace: "20%",
            display: false,
            grid: {
              display: false,
            },
          },
          y: {
            grid: {
              display: false,
            },
            ticks: {
              font: {
                size: 12, // 字体大小
                weight: "bold", // 加粗字体
              },
              color: "rgba(255, 255, 255, 0.7)", // 浅色字体（你可以根据背景调整颜色）
            },
          },
        },
        layout: {
          padding: {
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            enabled: false,
          },
          datalabels: {
            anchor: "end",
            align: "right",
            color: function (context) {
              const value = context.dataset.data[context.dataIndex];
              return value > 0 ? "white" : "transparent";
            },
            font: {
              weight: "bold",
              size: 12,
            },
            formatter: function (value) {
              return `${value.toLocaleString()}`;
            },
            clip: false,
            display: true,
          },
        },
      },

      plugins: [ChartDataLabels],
    });
  } else if (document.getElementById("script_dpsChart_div")) {
    document.getElementById("script_dpsChart_div").style.height =
      `${chartHeight}px`;
  }
  return document.querySelector(".script_dps_panel");
};

const updateStatisticsPanel = () => {
  const totalTime = totalDuration + (endTime - startTime) / 1000;
  const dps = totalDamage.map((damage) =>
    totalTime ? Math.round(damage / totalTime) : 0,
  );
  const totalTeamDamage = totalDamage.reduce((acc, damage) => acc + damage, 0);
  const totalTeamDPS = totalTime ? Math.round(totalTeamDamage / totalTime) : 0;

  // 人物头像下方显示数字
  const playersContainer = document.querySelector(
    ".BattlePanel_combatUnitGrid__2hTAM",
  );
  if (playersContainer) {
    players.forEach((player, index) => {
      const playerElement = playersContainer.children[index];
      if (playerElement) {
        const statusElement = playerElement.querySelector(
          ".CombatUnit_status__3bH7W",
        );
        if (statusElement) {
          let dpsElement = statusElement.querySelector(".dps-info");
          if (!dpsElement) {
            dpsElement = document.createElement("div");
            dpsElement.className = "dps-info";
            statusElement.appendChild(dpsElement);
          }
          dpsElement.textContent = `DPS: ${dps[index].toLocaleString()} (${runtime.api.numberFormatter(totalDamage[index])})`;
        }
      }
    });
  }

  // 显示图表
  if (runtime.settings.settingsMap.showDamageGraph.isTrue && !dragging) {
    const panel = getStatisticsDom();
    chart.data.labels = players.map((player) => player?.name);
    chart.data.datasets[0].data = dps;
    chart.update();

    // Update text information
    const days = Math.floor(totalTime / (24 * 3600));
    const hours = Math.floor((totalTime % (24 * 3600)) / 3600);
    const minutes = Math.floor((totalTime % 3600) / 60);
    const seconds = Math.floor(totalTime % 60);
    const formattedTime = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    const dpsText = document.getElementById("script_dpsText");
    const playerRows = players
      .map((player, index) => {
        const dpsFormatted = dps[index].toLocaleString();
        const totalDamageFormatted = totalDamage[index].toLocaleString();
        const damagePercentage = totalTeamDamage
          ? ((totalDamage[index] / totalTeamDamage) * 100).toFixed(2)
          : 0;

        // Get auraskill for the current player
        let auraskill = "N/A";
        let auraskillHrid = null;
        if (player.combatAbilities && Array.isArray(player.combatAbilities)) {
          const firstAbility = player.combatAbilities[0];
          if (firstAbility && firstAbility.abilityHrid) {
            auraskillHrid = firstAbility.abilityHrid;
            auraskill = firstAbility.abilityHrid
              .split("/")
              .pop()
              .replace(/_/g, " ");
            const validSkills = [
              "revive",
              "insanity",
              "invincible",
              "fierce aura",
              "aqua aura",
              "sylvan aura",
              "flame aura",
              "speed aura",
              "critical aura",
            ];
            if (!validSkills.includes(auraskill)) {
              auraskill = "N/A";
            }
          }
        }

        // Capitalize the first letter of each word in aura skill
        auraskill = auraskill
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");

        // Highlight the player with the highest DPS
        const isHighestDPS = dps[index] === Math.max(...dps);
        const dpsPrefix = isHighestDPS ? "🔥" : "";

        return `
        <tr style="color: white;">
            <td style="font-weight: bold;">${dpsPrefix} ${player.name}</td>
            <td>${runtime.config.isZH ? (auraskillHrid ? runtime.data.ZHOthersDic[auraskillHrid] : "无") : auraskill}</td>
            <td>${dpsFormatted}</td>
            <td>${totalDamageFormatted}</td>
            <td>${damagePercentage}%</td>
        </tr>`;
      })
      .join("");

    dpsText.innerHTML = `
<table style="width: 100%; border-collapse: collapse; font-size: smaller;">
    <thead>
        <tr style="text-align: left; color: white;">
            <th style="font-weight: bold;">${lang.players}</th>
            <th style="font-weight: bold;">${lang.aura}</th>
            <th style="font-weight: bold;">${lang.dpsTextDPS}</th>
            <th style="font-weight: bold;">${lang.dpsTextTotalDamage}</th>
            <th style="font-weight: bold;">${lang.damagePercentage}</th>
        </tr>
    </thead>
    <tbody>
        ${playerRows}
    </tbody>
    <tbody>
        <tr style="border-top: 2px solid white; font-weight: bold; text-align: left; color: white;">
            <td>${formattedTime}</td>
            <td></td>
            <td>${totalTeamDPS.toLocaleString()}</td>
            <td>${totalTeamDamage.toLocaleString()}</td>
            <td>100%</td>
        </tr>
    </tbody>
</table>`;

    // Update hit chance table
    const hitChanceTable = document.getElementById("script_hitChanceTable");
    const hitChanceRows = players
      .map((player) => {
        const playerName = player.name;
        const playerHitChances = Object.entries(monsterCounts)
          .map(([monsterName, count]) => {
            const combatStyle =
              player.combatDetails.combatStats.combatStyleHrids[0]
                .split("/")
                .pop(); // Assuming only one combat style for simplicity
            const evasionRating =
              monsterEvasion[monsterName][`${player.name}-${combatStyle}`];
            const accuracy =
              player.combatDetails[`${combatStyle}AccuracyRating`];
            const hitChance = calculateHitChance(accuracy, evasionRating);
            return `<td style="color: white;">${hitChance.toFixed(0)}%</td>`;
          })
          .join("");
        return `<tr><td style="color: white;">${playerName}</td>${playerHitChances}</tr>`;
      })
      .join("");

    hitChanceTable.innerHTML = `
<table style="width: 100%; border-collapse: collapse; font-size: smaller;">
    <thead>
        <tr>
            <th style="font-size: smaller; white-space: normal; text-align: left; color: white;">${lang.hitChance}</th>
            ${Object.entries(monsterCounts)
              .map(
                ([monsterName, count]) =>
                  `<th style="font-size: smaller; white-space: normal; text-align: left; color: white;">${
                    runtime.config.isZH
                      ? runtime.data.ZHOthersDic[monsterHrids[monsterName]]
                      : monsterName
                  } (${count})</th>`,
              )
              .join("")}
        </tr>
    </thead>
    <tbody>
        ${hitChanceRows}
    </tbody>
</table>`;
  }
};

function resetCombatState() {
  runtime.state.players = [];
  runtime.state.monsters = [];
  runtime.state.monstersHP = [];
  runtime.state.playersMP = [];
  runtime.state.startTime = null;
  runtime.state.endTime = null;
  runtime.state.totalDuration = 0;
  runtime.state.totalDamage = [];
  runtime.state.monsterCounts = {};
  runtime.state.monsterEvasion = {};
  runtime.state.monsterHrids = {};
}

function handleNewBattle(payload) {
  if (runtime.state.startTime && runtime.state.endTime) {
    runtime.state.totalDuration +=
      (runtime.state.endTime - runtime.state.startTime) / 1000;
  }
  runtime.state.startTime = Date.now();
  runtime.state.endTime = null;
  runtime.state.monstersHP = payload.monsters.map(
    (monster) => monster.currentHitpoints,
  );
  runtime.state.playersMP = payload.players.map(
    (player) => player.currentManapoints,
  );
  if (!runtime.state.players?.length) runtime.state.players = payload.players;

  for (const player of runtime.state.players) {
    player.currentAction = player.preparingAbilityHrid
      ? player.preparingAbilityHrid
      : player.isPreparingAutoAttack
        ? "auto"
        : "idle";
  }
  runtime.state.monsters = payload.monsters;
  if (!runtime.state.totalDamage.length)
    runtime.state.totalDamage = new Array(runtime.state.players.length).fill(0);

  for (const monster of payload.monsters) {
    const name = monster.name;
    runtime.state.monsterHrids[name] = monster.hrid;
    runtime.state.monsterCounts[name] =
      (runtime.state.monsterCounts[name] || 0) + 1;
    runtime.state.monsterEvasion[name] ??= {};
    for (const player of runtime.state.players) {
      for (const styleHrid of player.combatDetails?.combatStats
        ?.combatStyleHrids ?? []) {
        const style = styleHrid.split("/").pop();
        runtime.state.monsterEvasion[name][`${player.name}-${style}`] =
          monster.combatDetails[`${style}EvasionRating`];
      }
    }
  }
}

function handleBattleUpdated(payload) {
  const playerIndices = Object.keys(payload.pMap);
  let castPlayer = -1;
  for (const userIndex of playerIndices) {
    if (payload.pMap[userIndex].cMP < runtime.state.playersMP[userIndex])
      castPlayer = userIndex;
    runtime.state.playersMP[userIndex] = payload.pMap[userIndex].cMP;
  }

  runtime.state.monstersHP.forEach((previousHP, monsterIndex) => {
    const monster = payload.mMap[monsterIndex];
    if (!monster) return;
    const damage = previousHP - monster.cHP;
    runtime.state.monstersHP[monsterIndex] = monster.cHP;
    if (damage <= 0) return;

    const damageOwner =
      playerIndices.length > 1 ? String(castPlayer) : playerIndices[0];
    if (!playerIndices.includes(damageOwner)) return;
    const player = runtime.state.players[damageOwner];
    player.damageMap ??= new Map();
    player.damageMap.set(
      player.currentAction,
      (player.damageMap.get(player.currentAction) ?? 0) + damage,
    );
    runtime.state.totalDamage[damageOwner] += damage;
  });

  for (const userIndex of playerIndices) {
    const update = payload.pMap[userIndex];
    runtime.state.players[userIndex].currentAction = update.abilityHrid
      ? update.abilityHrid
      : update.isAutoAtk
        ? "auto"
        : "idle";
  }
  runtime.state.endTime = Date.now();
  updateStatisticsPanel();
}

Object.assign(runtime.api, {
  calculateHitChance,
  getStatisticsDom,
  updateStatisticsPanel,
  resetCombatState,
  handleNewBattle,
  handleBattleUpdated,
});

Object.defineProperties(runtime.data, {
  lang: {
    enumerable: true,
    get() {
      return lang;
    },
  },
});

Object.defineProperties(runtime.state, {
  totalDamage: {
    enumerable: true,
    get() {
      return totalDamage;
    },
    set(value) {
      totalDamage = value;
    },
  },
  totalDuration: {
    enumerable: true,
    get() {
      return totalDuration;
    },
    set(value) {
      totalDuration = value;
    },
  },
  startTime: {
    enumerable: true,
    get() {
      return startTime;
    },
    set(value) {
      startTime = value;
    },
  },
  endTime: {
    enumerable: true,
    get() {
      return endTime;
    },
    set(value) {
      endTime = value;
    },
  },
  monstersHP: {
    enumerable: true,
    get() {
      return monstersHP;
    },
    set(value) {
      monstersHP = value;
    },
  },
  playersMP: {
    enumerable: true,
    get() {
      return playersMP;
    },
    set(value) {
      playersMP = value;
    },
  },
  players: {
    enumerable: true,
    get() {
      return players;
    },
    set(value) {
      players = value;
    },
  },
  monsters: {
    enumerable: true,
    get() {
      return monsters;
    },
    set(value) {
      monsters = value;
    },
  },
  dragging: {
    enumerable: true,
    get() {
      return dragging;
    },
    set(value) {
      dragging = value;
    },
  },
  chart: {
    enumerable: true,
    get() {
      return chart;
    },
    set(value) {
      chart = value;
    },
  },
  monsterCounts: {
    enumerable: true,
    get() {
      return monsterCounts;
    },
    set(value) {
      monsterCounts = value;
    },
  },
  monsterEvasion: {
    enumerable: true,
    get() {
      return monsterEvasion;
    },
    set(value) {
      monsterEvasion = value;
    },
  },
  monsterHrids: {
    enumerable: true,
    get() {
      return monsterHrids;
    },
    set(value) {
      monsterHrids = value;
    },
  },
});
