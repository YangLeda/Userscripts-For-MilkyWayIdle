import { runtime } from "../core/runtime.js";

/* 为 https://amvoidguy.github.io/MWICombatSimulatorTest/ 添加导入按钮 */
// Parts of code regarding group export are by Ratatatata (https://greasyfork.org/en/scripts/507255).
function addImportButtonForAmvoidguy() {
  const checkElem = () => {
    const selectedElement = document.querySelector(`button#buttonImportExport`);
    if (selectedElement) {
      clearInterval(timer);
      let button = document.createElement("button");
      selectedElement.parentNode.parentElement.parentElement.insertBefore(
        button,
        selectedElement.parentElement.parentElement.nextSibling,
      );
      button.textContent = runtime.config.isZH
        ? "单人/组队导入(刷新游戏网页更新人物数据)"
        : "Import solo/group (Refresh game page to update character set)";
      button.style.backgroundColor = runtime.config.SCRIPT_COLOR_MAIN;
      button.style.padding = "5px";
      button.onclick = function () {
        console.log(
          runtime.config.isZH
            ? "[MWITools] 已点击战斗模拟器导入按钮。"
            : "[MWITools] Combat simulator import button clicked.",
        );
        const getPriceButton = document.querySelector(`button#buttonGetPrices`);
        if (getPriceButton) {
          console.log(
            runtime.config.isZH
              ? "[MWITools] 正在刷新战斗模拟器价格。"
              : "[MWITools] Refreshing combat simulator prices.",
          );
          getPriceButton.click();
        }
        importDataForAmvoidguy(button);
        return false;
      };
    }
  };
  let timer = setInterval(checkElem, 200);
}

async function importDataForAmvoidguy(button) {
  const [
    exportObj,
    playerIDs,
    importedPlayerPositions,
    zone,
    difficultyTier,
    isZoneDungeon,
    isParty,
  ] = constructGroupExportObj();
  console.log(exportObj);
  console.log(playerIDs);

  document.querySelector(`a#group-combat-tab`).click();
  const importInputElem = document.querySelector(
    `input#inputSetGroupCombatAll`,
  );
  importInputElem.value = JSON.stringify(exportObj);
  document.querySelector(`button#buttonImportSet`).click();

  document.querySelector(`a#player1-tab`).textContent = playerIDs[0];
  document.querySelector(`a#player2-tab`).textContent = playerIDs[1];
  document.querySelector(`a#player3-tab`).textContent = playerIDs[2];
  document.querySelector(`a#player4-tab`).textContent = playerIDs[3];
  document.querySelector(`a#player5-tab`).textContent = playerIDs[4];

  // Select zone or dungeon
  if (zone) {
    if (isZoneDungeon) {
      document.querySelector(`input#simDungeonToggle`).checked = true;
      document
        .querySelector(`input#simDungeonToggle`)
        .dispatchEvent(new Event("change"));
      const selectDungeon = document.querySelector(`select#selectDungeon`);
      for (let i = 0; i < selectDungeon.options.length; i++) {
        if (selectDungeon.options[i].value === zone) {
          selectDungeon.options[i].selected = true;
          break;
        }
      }
    } else {
      document.querySelector(`input#simDungeonToggle`).checked = false;
      document
        .querySelector(`input#simDungeonToggle`)
        .dispatchEvent(new Event("change"));
      const selectZone = document.querySelector(`select#selectZone`);
      for (let i = 0; i < selectZone.options.length; i++) {
        if (selectZone.options[i].value === zone) {
          selectZone.options[i].selected = true;
          break;
        }
      }
    }

    if (difficultyTier) {
      const selectDifficulty = document.querySelector(
        `select#selectDifficulty`,
      );
      for (let i = 0; i < selectDifficulty.options.length; i++) {
        if (Number(selectDifficulty.options[i].value) === difficultyTier) {
          selectDifficulty.options[i].selected = true;
          break;
        }
      }
    }
  }

  // Select sim players
  for (let i = 0; i < 5; i++) {
    if (importedPlayerPositions[i]) {
      if (
        document.querySelector(
          `input#player${i + 1}.form-check-input.player-checkbox`,
        )
      ) {
        document.querySelector(
          `input#player${i + 1}.form-check-input.player-checkbox`,
        ).checked = true;
        document
          .querySelector(
            `input#player${i + 1}.form-check-input.player-checkbox`,
          )
          .dispatchEvent(new Event("change"));
      }
    } else {
      if (
        document.querySelector(
          `input#player${i + 1}.form-check-input.player-checkbox`,
        )
      ) {
        document.querySelector(
          `input#player${i + 1}.form-check-input.player-checkbox`,
        ).checked = false;
        document
          .querySelector(
            `input#player${i + 1}.form-check-input.player-checkbox`,
          )
          .dispatchEvent(new Event("change"));
      }
    }
  }

  // Input simulation time
  document.querySelector(`input#inputSimulationTime`).value = 24;

  button.textContent = runtime.config.isZH ? "已导入" : "Imported";
  if (!isParty) {
    setTimeout(() => {
      document.querySelector(`button#buttonStartSimulation`).click();
    }, 500);
  }
}

function constructGroupExportObj() {
  const characterObj = JSON.parse(GM_getValue("init_character_data", ""));
  const clientObj = JSON.parse(GM_getValue("init_client_data", ""));
  let battleObj = null;
  if (GM_getValue("new_battle", "")) {
    battleObj = JSON.parse(GM_getValue("new_battle", ""));
  }
  // console.log(battleObj);
  const storedProfileList = JSON.parse(
    GM_getValue("profile_export_list", "[]"),
  );
  // console.log(storedProfileList);

  const BLANK_PLAYER_JSON = `{\"player\":{\"attackLevel\":1,\"magicLevel\":1,\"meleeLevel\":1,\"rangedLevel\":1,\"defenseLevel\":1,\"staminaLevel\":1,\"intelligenceLevel\":1,\"equipment\":[]},\"food\":{\"/action_types/combat\":[{\"itemHrid\":\"\"},{\"itemHrid\":\"\"},{\"itemHrid\":\"\"}]},\"drinks\":{\"/action_types/combat\":[{\"itemHrid\":\"\"},{\"itemHrid\":\"\"},{\"itemHrid\":\"\"}]},\"abilities\":[{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"},{\"abilityHrid\":\"\",\"level\":\"1\"}],\"triggerMap\":{},\"zone\":\"/actions/combat/fly\",\"simulationTime\":\"100\",\"houseRooms\":{\"/house_rooms/dairy_barn\":0,\"/house_rooms/garden\":0,\"/house_rooms/log_shed\":0,\"/house_rooms/forge\":0,\"/house_rooms/workshop\":0,\"/house_rooms/sewing_parlor\":0,\"/house_rooms/kitchen\":0,\"/house_rooms/brewery\":0,\"/house_rooms/laboratory\":0,\"/house_rooms/observatory\":0,\"/house_rooms/dining_room\":0,\"/house_rooms/library\":0,\"/house_rooms/dojo\":0,\"/house_rooms/gym\":0,\"/house_rooms/armory\":0,\"/house_rooms/archery_range\":0,\"/house_rooms/mystical_study\":0}}`;

  const exportObj = {};
  exportObj[1] = BLANK_PLAYER_JSON;
  exportObj[2] = BLANK_PLAYER_JSON;
  exportObj[3] = BLANK_PLAYER_JSON;
  exportObj[4] = BLANK_PLAYER_JSON;
  exportObj[5] = BLANK_PLAYER_JSON;

  let isParty = false;
  const playerIDs = [
    "Player 1",
    "Player 2",
    "Player 3",
    "Player 4",
    "Player 5",
  ];
  const importedPlayerPositions = [false, false, false, false, false];
  let zone = "/actions/combat/fly";
  let isZoneDungeon = false;
  let difficultyTier = 0;

  if (!characterObj?.partyInfo?.partySlotMap) {
    exportObj[1] = JSON.stringify(
      constructSelfPlayerExportObjFromInitCharacterData(
        characterObj,
        clientObj,
      ),
    );
    playerIDs[0] = characterObj.character.name;
    importedPlayerPositions[0] = true;
    // Zone
    for (const action of characterObj.characterActions) {
      if (action && action.actionHrid.includes("/actions/combat/")) {
        zone = action.actionHrid;
        difficultyTier = action.difficultyTier;
        isZoneDungeon =
          clientObj.actionDetailMap[action.actionHrid]?.combatZoneInfo
            ?.isDungeon;
        break;
      }
    }
  } else {
    isParty = true;
    let i = 1;
    for (const member of Object.values(characterObj.partyInfo.partySlotMap)) {
      if (member.characterID) {
        if (member.characterID === characterObj.character.id) {
          exportObj[i] = JSON.stringify(
            constructSelfPlayerExportObjFromInitCharacterData(
              characterObj,
              clientObj,
            ),
          );
          playerIDs[i - 1] = characterObj.character.name;
          importedPlayerPositions[i - 1] = true;
        } else {
          const profileList = storedProfileList.filter(
            (item) => item.characterID === member.characterID,
          );
          if (profileList.length !== 1) {
            console.log(
              runtime.config.isZH
                ? `[MWITools] 找不到角色 ${member.characterID} 的已保存资料。`
                : `[MWITools] Cannot find a saved profile for character ${member.characterID}.`,
            );
            playerIDs[i - 1] = runtime.config.isZH
              ? "需要点开资料"
              : "Open profile in game";
            i++;
            continue;
          }
          const profile = profileList[0];

          const battlePlayers = Array.isArray(battleObj?.players)
            ? battleObj.players
            : [];
          const battlePlayer =
            battlePlayers.find(
              (item) => item.character?.id === member.characterID,
            ) ?? null;

          exportObj[i] = JSON.stringify(
            constructPlayerExportObjFromStoredProfile(
              profile,
              clientObj,
              battlePlayer,
            ),
          );
          playerIDs[i - 1] = profile.characterName;
          importedPlayerPositions[i - 1] = true;
        }
      }
      i++;
    }

    // Zone
    zone = characterObj.partyInfo?.party?.actionHrid;
    difficultyTier = characterObj.partyInfo?.party?.difficultyTier;
    isZoneDungeon = clientObj.actionDetailMap[zone]?.combatZoneInfo?.isDungeon;
  }

  return [
    exportObj,
    playerIDs,
    importedPlayerPositions,
    zone,
    difficultyTier,
    isZoneDungeon,
    isParty,
  ];
}

function constructSelfPlayerExportObjFromInitCharacterData(
  characterObj,
  clientObj,
) {
  const playerObj = {};
  playerObj.player = {};

  // Levels
  for (const skill of characterObj.characterSkills) {
    if (skill.skillHrid.includes("stamina")) {
      playerObj.player.staminaLevel = skill.level;
    } else if (skill.skillHrid.includes("intelligence")) {
      playerObj.player.intelligenceLevel = skill.level;
    } else if (skill.skillHrid.includes("attack")) {
      playerObj.player.attackLevel = skill.level;
    } else if (skill.skillHrid.includes("melee")) {
      playerObj.player.meleeLevel = skill.level;
    } else if (skill.skillHrid.includes("defense")) {
      playerObj.player.defenseLevel = skill.level;
    } else if (skill.skillHrid.includes("ranged")) {
      playerObj.player.rangedLevel = skill.level;
    } else if (skill.skillHrid.includes("magic")) {
      playerObj.player.magicLevel = skill.level;
    }
  }

  // Items
  playerObj.player.equipment = [];
  for (const item of characterObj.characterItems) {
    if (!item.itemLocationHrid.includes("/item_locations/inventory")) {
      playerObj.player.equipment.push({
        itemLocationHrid: item.itemLocationHrid,
        itemHrid: item.itemHrid,
        enhancementLevel: item.enhancementLevel,
      });
    }
  }

  // Food
  playerObj.food = {};
  playerObj.food["/action_types/combat"] = [];
  for (const food of characterObj.actionTypeFoodSlotsMap[
    "/action_types/combat"
  ]) {
    if (food) {
      playerObj.food["/action_types/combat"].push({
        itemHrid: food.itemHrid,
      });
    } else {
      playerObj.food["/action_types/combat"].push({
        itemHrid: "",
      });
    }
  }

  // Drinks
  playerObj.drinks = {};
  playerObj.drinks["/action_types/combat"] = [];
  for (const drink of characterObj.actionTypeDrinkSlotsMap[
    "/action_types/combat"
  ]) {
    if (drink) {
      playerObj.drinks["/action_types/combat"].push({
        itemHrid: drink.itemHrid,
      });
    } else {
      playerObj.drinks["/action_types/combat"].push({
        itemHrid: "",
      });
    }
  }

  // Abilities
  playerObj.abilities = [
    {
      abilityHrid: "",
      level: "1",
    },
    {
      abilityHrid: "",
      level: "1",
    },
    {
      abilityHrid: "",
      level: "1",
    },
    {
      abilityHrid: "",
      level: "1",
    },
    {
      abilityHrid: "",
      level: "1",
    },
  ];
  let normalAbillityIndex = 1;
  for (const ability of characterObj.combatUnit.combatAbilities) {
    if (
      ability &&
      clientObj.abilityDetailMap[ability.abilityHrid].isSpecialAbility
    ) {
      playerObj.abilities[0] = {
        abilityHrid: ability.abilityHrid,
        level: ability.level,
      };
    } else if (ability) {
      playerObj.abilities[normalAbillityIndex++] = {
        abilityHrid: ability.abilityHrid,
        level: ability.level,
      };
    }
  }

  // TriggerMap
  playerObj.triggerMap = {
    ...characterObj.abilityCombatTriggersMap,
    ...characterObj.consumableCombatTriggersMap,
  };

  // HouseRooms
  playerObj.houseRooms = {};
  for (const house of Object.values(characterObj.characterHouseRoomMap)) {
    playerObj.houseRooms[house.houseRoomHrid] = house.level;
  }

  // Achievements
  playerObj.achievements = {};
  for (const achievement of Object.values(characterObj.characterAchievements)) {
    playerObj.achievements[achievement.achievementHrid] =
      achievement.isCompleted;
  }

  return playerObj;
}

function constructPlayerExportObjFromStoredProfile(
  profile,
  clientObj,
  battlePlayer,
) {
  const playerObj = {};
  playerObj.player = {};

  // Levels
  for (const skill of profile.profile.characterSkills) {
    if (skill.skillHrid.includes("stamina")) {
      playerObj.player.staminaLevel = skill.level;
    } else if (skill.skillHrid.includes("intelligence")) {
      playerObj.player.intelligenceLevel = skill.level;
    } else if (skill.skillHrid.includes("attack")) {
      playerObj.player.attackLevel = skill.level;
    } else if (skill.skillHrid.includes("melee")) {
      playerObj.player.meleeLevel = skill.level;
    } else if (skill.skillHrid.includes("defense")) {
      playerObj.player.defenseLevel = skill.level;
    } else if (skill.skillHrid.includes("ranged")) {
      playerObj.player.rangedLevel = skill.level;
    } else if (skill.skillHrid.includes("magic")) {
      playerObj.player.magicLevel = skill.level;
    }
  }

  // Items
  playerObj.player.equipment = [];
  if (profile.profile.wearableItemMap) {
    for (const key in profile.profile.wearableItemMap) {
      const item = profile.profile.wearableItemMap[key];
      playerObj.player.equipment.push({
        itemLocationHrid: item.itemLocationHrid,
        itemHrid: item.itemHrid,
        enhancementLevel: item.enhancementLevel,
      });
    }
  }

  // Food and drinks
  playerObj.food = {};
  playerObj.food["/action_types/combat"] = [];
  playerObj.drinks = {};
  playerObj.drinks["/action_types/combat"] = [];

  if (battlePlayer?.combatConsumables) {
    for (const foodOrDrink of battlePlayer.combatConsumables) {
      if (foodOrDrink.itemHrid.includes("coffee")) {
        playerObj.drinks["/action_types/combat"].push({
          itemHrid: foodOrDrink.itemHrid,
        });
      } else {
        playerObj.food["/action_types/combat"].push({
          itemHrid: foodOrDrink.itemHrid,
        });
      }
    }
  } else {
    // Assume food and drinks based on equipped weapon
    const weapon =
      profile.profile.wearableItemMap &&
      (profile.profile.wearableItemMap["/item_locations/main_hand"]?.itemHrid ||
        profile.profile.wearableItemMap["/item_locations/two_hand"]?.itemHrid);
    if (weapon) {
      if (weapon.includes("shooter") || weapon.includes("bow")) {
        // 远程
        // xp,超远,暴击
        playerObj.drinks["/action_types/combat"].push({
          itemHrid: "/items/wisdom_coffee",
        });
        playerObj.drinks["/action_types/combat"].push({
          itemHrid: "/items/super_ranged_coffee",
        });
        playerObj.drinks["/action_types/combat"].push({
          itemHrid: "/items/critical_coffee",
        });
        // 2红1蓝
        playerObj.food["/action_types/combat"].push({
          itemHrid: "/items/spaceberry_donut",
        });
        playerObj.food["/action_types/combat"].push({
          itemHrid: "/items/spaceberry_cake",
        });
        playerObj.food["/action_types/combat"].push({
          itemHrid: "/items/star_fruit_yogurt",
        });
      } else if (
        weapon.includes("boomstick") ||
        weapon.includes("staff") ||
        weapon.includes("trident")
      ) {
        // 法师
        // xp,超魔,吟唱
        playerObj.drinks["/action_types/combat"].push({
          itemHrid: "/items/wisdom_coffee",
        });
        playerObj.drinks["/action_types/combat"].push({
          itemHrid: "/items/super_magic_coffee",
        });
        playerObj.drinks["/action_types/combat"].push({
          itemHrid: "/items/channeling_coffee",
        });
        // 1红2蓝
        playerObj.food["/action_types/combat"].push({
          itemHrid: "/items/spaceberry_cake",
        });
        playerObj.food["/action_types/combat"].push({
          itemHrid: "/items/star_fruit_gummy",
        });
        playerObj.food["/action_types/combat"].push({
          itemHrid: "/items/star_fruit_yogurt",
        });
      } else if (weapon.includes("bulwark")) {
        // 双手盾 精暮光
        // xp,超防,超耐
        playerObj.drinks["/action_types/combat"].push({
          itemHrid: "/items/wisdom_coffee",
        });
        playerObj.drinks["/action_types/combat"].push({
          itemHrid: "/items/super_defense_coffee",
        });
        playerObj.drinks["/action_types/combat"].push({
          itemHrid: "/items/super_stamina_coffee",
        });
        // 2红1蓝
        playerObj.food["/action_types/combat"].push({
          itemHrid: "/items/spaceberry_donut",
        });
        playerObj.food["/action_types/combat"].push({
          itemHrid: "/items/spaceberry_cake",
        });
        playerObj.food["/action_types/combat"].push({
          itemHrid: "/items/star_fruit_yogurt",
        });
      } else {
        // 战士
        // xp,超力,迅捷
        playerObj.drinks["/action_types/combat"].push({
          itemHrid: "/items/wisdom_coffee",
        });
        playerObj.drinks["/action_types/combat"].push({
          itemHrid: "/items/super_melee_coffee",
        });
        playerObj.drinks["/action_types/combat"].push({
          itemHrid: "/items/swiftness_coffee",
        });
        // 2红1蓝
        playerObj.food["/action_types/combat"].push({
          itemHrid: "/items/spaceberry_donut",
        });
        playerObj.food["/action_types/combat"].push({
          itemHrid: "/items/spaceberry_cake",
        });
        playerObj.food["/action_types/combat"].push({
          itemHrid: "/items/star_fruit_yogurt",
        });
      }
    }
  }

  // Abilities
  playerObj.abilities = [
    {
      abilityHrid: "",
      level: "1",
    },
    {
      abilityHrid: "",
      level: "1",
    },
    {
      abilityHrid: "",
      level: "1",
    },
    {
      abilityHrid: "",
      level: "1",
    },
    {
      abilityHrid: "",
      level: "1",
    },
  ];
  if (profile.profile.equippedAbilities) {
    let normalAbillityIndex = 1;
    for (const ability of profile.profile.equippedAbilities) {
      if (
        ability &&
        clientObj.abilityDetailMap[ability.abilityHrid].isSpecialAbility
      ) {
        playerObj.abilities[0] = {
          abilityHrid: ability.abilityHrid,
          level: ability.level,
        };
      } else if (ability) {
        playerObj.abilities[normalAbillityIndex++] = {
          abilityHrid: ability.abilityHrid,
          level: ability.level,
        };
      }
    }
  }

  // TriggerMap
  if (
    profile.profile.abilityCombatTriggersMap &&
    profile.profile.consumableCombatTriggersMap
  ) {
    playerObj.triggerMap = {
      ...profile.profile.abilityCombatTriggersMap,
      ...profile.profile.consumableCombatTriggersMap,
    };
  }

  // HouseRooms
  playerObj.houseRooms = {};
  for (const house of Object.values(profile.profile.characterHouseRoomMap)) {
    playerObj.houseRooms[house.houseRoomHrid] = house.level;
  }

  // Achievements
  playerObj.achievements = {};
  for (const achievement of Object.values(
    profile.profile.characterAchievements,
  )) {
    playerObj.achievements[achievement.achievementHrid] =
      achievement.isCompleted;
  }

  return playerObj;
}

async function observeResultsForAmvoidguy() {
  let resultDiv = document
    .querySelector(`div.row`)
    ?.querySelectorAll(`div.col-md-5`)?.[2]
    ?.querySelector(`div.row > div.col-md-5`);
  while (!resultDiv) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    resultDiv = document
      .querySelector(`div.row`)
      ?.querySelectorAll(`div.col-md-5`)?.[2]
      ?.querySelector(`div.row > div.col-md-5`);
  }

  const deathDiv = document.querySelector(`div#simulationResultPlayerDeaths`);
  const expDiv = document.querySelector(`div#simulationResultExperienceGain`);
  const consumeDiv = document.querySelector(
    `div#simulationResultConsumablesUsed`,
  );
  deathDiv.style.backgroundColor = "#FFEAE9";
  deathDiv.style.color = "black";
  expDiv.style.backgroundColor = "#CDFFDD";
  expDiv.style.color = "black";
  consumeDiv.style.backgroundColor = "#F0F8FF";
  consumeDiv.style.color = "black";

  let div = document.createElement("div");
  div.id = "tillLevel";
  div.style.backgroundColor = "#FFFFE0";
  div.style.color = "black";
  div.textContent = "";
  resultDiv.append(div);

  new MutationObserver((mutationsList) => {
    mutationsList.forEach((mutation) => {
      if (mutation.addedNodes.length >= 3) {
        handleResultForAmvoidguy(mutation.addedNodes, div);
      }
    });
  }).observe(expDiv, { childList: true, subtree: true });
}

function handleResultForAmvoidguy(expNodes, parentDiv) {
  const isZHIn3rdPartyWebsites = localStorage
    .getItem("i18nextLng")
    ?.toLowerCase()
    ?.startsWith("zh");

  let perHourGainExp = {
    stamina: 0,
    intelligence: 0,
    attack: 0,
    melee: 0,
    defense: 0,
    ranged: 0,
    magic: 0,
  };

  expNodes.forEach((expNode) => {
    if (
      runtime.api
        .getOriTextFromElement(expNode.children[0])
        .includes("Stamina") ||
      runtime.api.getOriTextFromElement(expNode.children[0]).includes("耐力")
    ) {
      perHourGainExp.stamina = Number(expNode.children[1].textContent);
    } else if (
      runtime.api
        .getOriTextFromElement(expNode.children[0])
        .includes("Intelligence") ||
      runtime.api.getOriTextFromElement(expNode.children[0]).includes("智力")
    ) {
      perHourGainExp.intelligence = Number(expNode.children[1].textContent);
    } else if (
      runtime.api
        .getOriTextFromElement(expNode.children[0])
        .includes("Attack") ||
      runtime.api.getOriTextFromElement(expNode.children[0]).includes("攻击")
    ) {
      perHourGainExp.attack = Number(expNode.children[1].textContent);
    } else if (
      runtime.api
        .getOriTextFromElement(expNode.children[0])
        .includes("Melee") ||
      runtime.api.getOriTextFromElement(expNode.children[0]).includes("近战")
    ) {
      perHourGainExp.melee = Number(expNode.children[1].textContent);
    } else if (
      runtime.api
        .getOriTextFromElement(expNode.children[0])
        .includes("Defense") ||
      runtime.api.getOriTextFromElement(expNode.children[0]).includes("防御")
    ) {
      perHourGainExp.defense = Number(expNode.children[1].textContent);
    } else if (
      runtime.api
        .getOriTextFromElement(expNode.children[0])
        .includes("Ranged") ||
      runtime.api.getOriTextFromElement(expNode.children[0]).includes("远程")
    ) {
      perHourGainExp.ranged = Number(expNode.children[1].textContent);
    } else if (
      runtime.api
        .getOriTextFromElement(expNode.children[0])
        .includes("Magic") ||
      runtime.api.getOriTextFromElement(expNode.children[0]).includes("魔法")
    ) {
      perHourGainExp.magic = Number(expNode.children[1].textContent);
    }
  });

  let data = GM_getValue("init_character_data", null);
  let obj = JSON.parse(data);
  if (!obj || !obj.characterSkills || !obj.currentTimestamp) {
    console.error(
      runtime.config.isZH
        ? "[MWITools] 无法导出：本地没有角色数据。"
        : "[MWITools] Export failed because no character data is stored locally.",
    );
    return;
  }

  let skillLevels = {};
  for (const skill of obj.characterSkills) {
    if (skill.skillHrid.includes("stamina")) {
      skillLevels.stamina = {};
      skillLevels.stamina.skillName = "Stamina";
      skillLevels.stamina.skillZhName = "耐力";
      skillLevels.stamina.currentLevel = skill.level;
      skillLevels.stamina.currentExp = skill.experience;
    } else if (skill.skillHrid.includes("intelligence")) {
      skillLevels.intelligence = {};
      skillLevels.intelligence.skillName = "Intelligence";
      skillLevels.intelligence.skillZhName = "智力";
      skillLevels.intelligence.currentLevel = skill.level;
      skillLevels.intelligence.currentExp = skill.experience;
    } else if (skill.skillHrid.includes("attack")) {
      skillLevels.attack = {};
      skillLevels.attack.skillName = "Attack";
      skillLevels.attack.skillZhName = "攻击";
      skillLevels.attack.currentLevel = skill.level;
      skillLevels.attack.currentExp = skill.experience;
    } else if (skill.skillHrid.includes("melee")) {
      skillLevels.melee = {};
      skillLevels.melee.skillName = "Melee";
      skillLevels.melee.skillZhName = "近战";
      skillLevels.melee.currentLevel = skill.level;
      skillLevels.melee.currentExp = skill.experience;
    } else if (skill.skillHrid.includes("defense")) {
      skillLevels.defense = {};
      skillLevels.defense.skillName = "Defense";
      skillLevels.defense.skillZhName = "防御";
      skillLevels.defense.currentLevel = skill.level;
      skillLevels.defense.currentExp = skill.experience;
    } else if (skill.skillHrid.includes("ranged")) {
      skillLevels.ranged = {};
      skillLevels.ranged.skillName = "Ranged";
      skillLevels.ranged.skillZhName = "远程";
      skillLevels.ranged.currentLevel = skill.level;
      skillLevels.ranged.currentExp = skill.experience;
    } else if (skill.skillHrid.includes("magic")) {
      skillLevels.magic = {};
      skillLevels.magic.skillName = "Magic";
      skillLevels.magic.skillZhName = "魔法";
      skillLevels.magic.currentLevel = skill.level;
      skillLevels.magic.currentExp = skill.experience;
    }
  }

  const skillNamesInOrder = [
    "stamina",
    "intelligence",
    "attack",
    "melee",
    "defense",
    "ranged",
    "magic",
  ];
  let hTMLStr = "";
  for (const skill of skillNamesInOrder) {
    hTMLStr += `<div id="${"inputDiv_" + skill}" style="display: flex; justify-content: flex-end">${
      isZHIn3rdPartyWebsites
        ? skillLevels[skill].skillZhName
        : skillLevels[skill].skillName
    }${isZHIn3rdPartyWebsites ? "到" : " to level "}<input id="${"input_" + skill}" type="number" value="${
      skillLevels[skill].currentLevel + 1
    }" min="${skillLevels[skill].currentLevel + 1}" max="200">${isZHIn3rdPartyWebsites ? "级" : ""}</div>`;
  }

  hTMLStr += `<div id="script_afterDays" style="display: flex; justify-content: flex-end"><input id="script_afterDays_input" type="number" value="1" min="0" max="200">${
    isZHIn3rdPartyWebsites ? "天后" : "days after"
  }</div>`;

  hTMLStr += `<div id="needDiv"></div>`;
  hTMLStr += `<div id="needListDiv"></div>`;
  parentDiv.innerHTML = hTMLStr;

  for (const skill of skillNamesInOrder) {
    const skillDiv = parentDiv.querySelector(`div#${"inputDiv_" + skill}`);
    const skillInput = parentDiv.querySelector(`input#${"input_" + skill}`);
    skillInput.onchange = () => {
      calculateTill(
        skill,
        skillInput,
        skillLevels,
        parentDiv,
        perHourGainExp,
        isZHIn3rdPartyWebsites,
      );
    };
    skillInput.addEventListener("keyup", function (evt) {
      calculateTill(
        skill,
        skillInput,
        skillLevels,
        parentDiv,
        perHourGainExp,
        isZHIn3rdPartyWebsites,
      );
    });
    skillDiv.onclick = () => {
      calculateTill(
        skill,
        skillInput,
        skillLevels,
        parentDiv,
        perHourGainExp,
        isZHIn3rdPartyWebsites,
      );
    };
  }

  const daysAfterDiv = parentDiv.querySelector(`div#script_afterDays`);
  const daysAfterInput = parentDiv.querySelector(
    `input#script_afterDays_input`,
  );
  daysAfterInput.onchange = () => {
    calculateAfterDays(
      daysAfterInput,
      skillLevels,
      parentDiv,
      perHourGainExp,
      skillNamesInOrder,
      isZHIn3rdPartyWebsites,
    );
  };
  daysAfterInput.addEventListener("keyup", function (evt) {
    calculateAfterDays(
      daysAfterInput,
      skillLevels,
      parentDiv,
      perHourGainExp,
      skillNamesInOrder,
      isZHIn3rdPartyWebsites,
    );
  });
  daysAfterDiv.onclick = () => {
    calculateAfterDays(
      daysAfterInput,
      skillLevels,
      parentDiv,
      perHourGainExp,
      skillNamesInOrder,
      isZHIn3rdPartyWebsites,
    );
  };

  // 提取成本和收益
  const expensesSpan = document.querySelector(`span#expensesSpan`);
  const revenueSpan = document.querySelector(`span#revenueSpan`);
  const profitSpan = document.querySelector(`span#profitPreview`);
  const expenseDiv = document.querySelector(`div#script_expense`);
  const revenueDiv = document.querySelector(`div#script_revenue`);
  if (expenseDiv && expenseDiv) {
    expenseDiv.textContent = expensesSpan.parentNode.textContent;
    revenueDiv.textContent = revenueSpan.parentNode.textContent;
  } else {
    profitSpan.parentNode.insertAdjacentHTML(
      "beforeend",
      `<div id="script_expense" style="background-color: #DCDCDC; color: black;">${expensesSpan.parentNode.textContent}</div><div id="script_revenue" style="background-color: #DCDCDC; color: black;">${revenueSpan.parentNode.textContent}</div>`,
    );
  }
}

function calculateAfterDays(
  daysAfterInput,
  skillLevels,
  parentDiv,
  perHourGainExp,
  skillNamesInOrder,
  isZHIn3rdPartyWebsites,
) {
  const initData_levelExperienceTable = JSON.parse(
    GM_getValue("init_client_data", null),
  ).levelExperienceTable;
  const days = Number(daysAfterInput.value);
  parentDiv.querySelector(`div#needDiv`).textContent =
    `${isZHIn3rdPartyWebsites ? "" : "After"} ${days} ${
      isZHIn3rdPartyWebsites ? "天后：" : "days: "
    }`;
  const listDiv = parentDiv.querySelector(`div#needListDiv`);

  let html = "";
  let resultLevels = {};
  for (const skillName of skillNamesInOrder) {
    for (const skill of Object.values(skillLevels)) {
      if (skill.skillName.toLowerCase() === skillName.toLowerCase()) {
        const exp =
          skill.currentExp +
          perHourGainExp[skill.skillName.toLowerCase()] * days * 24;
        let level = 1;
        while (initData_levelExperienceTable[level] < exp) {
          level++;
        }
        level--;
        const minExpAtLevel = initData_levelExperienceTable[level];
        const maxExpAtLevel = initData_levelExperienceTable[level + 1] - 1;
        const expSpanInLevel = maxExpAtLevel - minExpAtLevel;
        const levelPercentage = Number(
          ((exp - minExpAtLevel) / expSpanInLevel) * 100,
        ).toFixed(1);
        resultLevels[skillName.toLowerCase()] = level;
        html += `<div>${isZHIn3rdPartyWebsites ? skill.skillZhName : skill.skillName} ${isZHIn3rdPartyWebsites ? "" : "level"} ${level} ${
          isZHIn3rdPartyWebsites ? "级" : ""
        } ${levelPercentage}%</div>`;
        break;
      }
    }
  }
  const combatLevel =
    0.1 *
      (resultLevels.stamina +
        resultLevels.intelligence +
        resultLevels.defense +
        resultLevels.attack +
        Math.max(resultLevels.melee, resultLevels.ranged, resultLevels.magic)) +
    0.5 *
      Math.max(
        resultLevels.attack,
        resultLevels.defense,
        resultLevels.melee,
        resultLevels.ranged,
        resultLevels.magic,
      );
  html += `<div>${isZHIn3rdPartyWebsites ? "战斗等级：" : "Combat level: "} ${combatLevel.toFixed(1)}</div>`;
  listDiv.innerHTML = html;
}

function calculateTill(
  skillName,
  skillInputElem,
  skillLevels,
  parentDiv,
  perHourGainExp,
  isZHIn3rdPartyWebsites,
) {
  const initData_levelExperienceTable = JSON.parse(
    GM_getValue("init_client_data", null),
  ).levelExperienceTable;
  const targetLevel = Number(skillInputElem.value);
  parentDiv.querySelector(`div#needDiv`).textContent = `${
    isZHIn3rdPartyWebsites
      ? skillLevels[skillName].skillZhName
      : skillLevels[skillName].skillName
  } ${isZHIn3rdPartyWebsites ? "到" : "to level"} ${targetLevel} ${isZHIn3rdPartyWebsites ? "级 还需：" : " takes: "}`;
  const listDiv = parentDiv.querySelector(`div#needListDiv`);

  const currentLevel = Number(skillLevels[skillName].currentLevel);
  const currentExp = Number(skillLevels[skillName].currentExp);
  if (targetLevel > currentLevel && targetLevel <= 200) {
    if (perHourGainExp[skillName] === 0) {
      listDiv.innerHTML = isZHIn3rdPartyWebsites ? "永远" : "Forever";
    } else {
      let needExp = initData_levelExperienceTable[targetLevel] - currentExp;
      let needHours = needExp / perHourGainExp[skillName];
      let html = "";
      html += `<div>[${hoursToReadableString(needHours)}]</div>`;

      const consumeDivs = document.querySelectorAll(
        `div#simulationResultConsumablesUsed div.row`,
      );
      for (const elem of consumeDivs) {
        const conName = elem.children[0].textContent;
        const conPerHour = Number(elem.children[1].textContent);
        html += `<div>${conName} ${Number(conPerHour * needHours).toFixed(0)}</div>`;
      }

      listDiv.innerHTML = html;
    }
  } else {
    listDiv.innerHTML = isZHIn3rdPartyWebsites ? "输入错误" : "Input error";
  }
}

function addImportButtonForMooneycalc() {
  const checkElem = () => {
    const selectedElement = document.querySelector(`div[role="tablist"]`);
    if (selectedElement) {
      clearInterval(timer);
      const button = document.createElement("button");
      selectedElement.parentNode.insertBefore(
        button,
        selectedElement.nextSibling,
      );
      button.textContent = runtime.config.isZH
        ? "导入人物数据 (刷新游戏网页更新人物数据)"
        : "Import character settings (Refresh game page to update character settings)";
      button.style.backgroundColor = runtime.config.SCRIPT_COLOR_MAIN;
      button.style.color = "black";
      button.style.padding = "5px";
      button.onclick = function () {
        console.log(
          runtime.config.isZH
            ? "[MWITools] 已点击 Mooneycalc 导入按钮。"
            : "[MWITools] Mooneycalc import button clicked.",
        );
        importDataForMooneycalc(button);
        return false;
      };
    }
  };
  let timer = setInterval(checkElem, 200);
}

async function importDataForMooneycalc(button) {
  const characterData = JSON.parse(GM_getValue("init_character_data", ""));
  console.log(characterData);
  if (
    !characterData ||
    !characterData.characterSkills ||
    !characterData.currentTimestamp
  ) {
    button.textContent = runtime.config.isZH
      ? "错误：没有人物数据"
      : "Error: no character settings found";
    return;
  }

  const ls = constructMooneycalcLocalStorage(characterData);
  localStorage.setItem("settings", ls);

  button.textContent = runtime.config.isZH ? "已导入" : "Imported";
  await new Promise((r) => setTimeout(r, 500));
  location.reload();
}

function constructMooneycalcLocalStorage(characterData) {
  const ls = localStorage.getItem("settings");
  let lsObj = JSON.parse(ls);

  // 人物技能等级
  lsObj.state.settings.levels = {};
  for (const skill of characterData.characterSkills) {
    lsObj.state.settings.levels[skill.skillHrid] = skill.level;
  }

  // 社区全局buff
  lsObj.state.settings.communityBuffs = {};
  for (const buff of characterData.communityBuffs) {
    lsObj.state.settings.communityBuffs[buff.hrid] = buff.level;
  }

  // 装备 & 装备强化等级
  lsObj.state.settings.equipment = {};
  lsObj.state.settings.equipmentLevels = {};
  for (const item of characterData.characterItems) {
    if (item.itemLocationHrid !== "/item_locations/inventory") {
      lsObj.state.settings.equipment[
        item.itemLocationHrid.replace("item_locations", "equipment_types")
      ] = item.itemHrid;
      lsObj.state.settings.equipmentLevels[
        item.itemLocationHrid.replace("item_locations", "equipment_types")
      ] = item.enhancementLevel;
    }
  }

  // 房子
  lsObj.state.settings.houseRooms = {};
  for (const house of Object.values(characterData.characterHouseRoomMap)) {
    lsObj.state.settings.houseRooms[house.houseRoomHrid] = house.level;
  }

  return JSON.stringify(lsObj);
}

function hoursToReadableString(hours) {
  const sec = hours * 60 * 60;
  return runtime.api.timeReadable?.(sec) ?? `${Math.round(hours)}h`;
}

function addExportButton(obj) {
  const checkElem = () => {
    const selectedElement = document.querySelector(
      `div.SharableProfile_overviewTab__W4dCV`,
    );
    if (selectedElement) {
      clearInterval(timer);

      const button = document.createElement("button");
      selectedElement.appendChild(button);
      button.textContent = runtime.config.isZH
        ? "导出人物到剪贴板"
        : "Export to clipboard";
      button.style.borderRadius = "5px";
      button.style.height = "30px";
      button.style.backgroundColor = runtime.config.SCRIPT_COLOR_MAIN;
      button.style.color = "black";
      button.style.boxShadow = "none";
      button.style.border = "0px";
      button.onclick = function () {
        let exportString = "";
        const playerID = obj.profile.characterSkills[0].characterID;
        const clientObj = JSON.parse(GM_getValue("init_client_data", ""));
        const characterObj = JSON.parse(GM_getValue("init_character_data", ""));

        if (playerID === characterObj.character.id) {
          exportString = JSON.stringify(
            constructSelfPlayerExportObjFromInitCharacterData(
              characterObj,
              clientObj,
            ),
          );
        } else {
          const storedProfileList = JSON.parse(
            GM_getValue("profile_export_list", "[]"),
          );
          const profileList = storedProfileList.filter(
            (item) => item.characterID === playerID,
          );
          let profile = null;
          if (profileList.length !== 1) {
            console.log(
              runtime.config.isZH
                ? `[MWITools] 找不到角色 ${playerID} 的已保存资料。`
                : `[MWITools] Cannot find a saved profile for character ${playerID}.`,
            );
            return;
          }
          profile = profileList[0];

          let battlePlayer = null;
          if (GM_getValue("new_battle", "")) {
            const battleObj = JSON.parse(GM_getValue("new_battle", ""));
            const battlePlayerList = battleObj.players.filter(
              (item) => item.character.id === playerID,
            );
            if (battlePlayerList.length === 1) {
              battlePlayer = battlePlayerList[0];
            }
          }

          exportString = JSON.stringify(
            constructPlayerExportObjFromStoredProfile(
              profile,
              clientObj,
              battlePlayer,
            ),
          );
        }

        console.log(exportString);
        navigator.clipboard.writeText(exportString);
        button.textContent = runtime.config.isZH ? "已复制" : "Copied";
        return false;
      };
      return false;
    }
  };
  let timer = setInterval(checkElem, 200);
}

// The legacy router retained a mwisim branch but no separate implementation;
// both simulators use the same import-button flow.
const addImportButtonFor9Battles = addImportButtonForAmvoidguy;

Object.assign(runtime.api, {
  addImportButtonFor9Battles,
  addImportButtonForAmvoidguy,
  importDataForAmvoidguy,
  constructGroupExportObj,
  constructSelfPlayerExportObjFromInitCharacterData,
  constructPlayerExportObjFromStoredProfile,
  observeResultsForAmvoidguy,
  handleResultForAmvoidguy,
  calculateAfterDays,
  calculateTill,
  addImportButtonForMooneycalc,
  importDataForMooneycalc,
  constructMooneycalcLocalStorage,
  hoursToReadableString,
  addExportButton,
});
