// ==UserScript==
// @name         MWITools
// @namespace    http://tampermonkey.net/
// @version      25.15
// @description  Tools for MilkyWayIdle. Shows total action time. Shows market prices. Shows action number quick inputs. Shows how many actions are needed to reach certain skill level. Shows skill exp percentages. Shows total networth. Shows combat summary. Shows combat maps index. Shows item level on item icons. Shows how many ability books are needed to reach certain level. Shows market equipment filters.
// @author       bot7420, shykai
// @license      CC-BY-NC-SA-4.0
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://amvoidguy.github.io/MWICombatSimulatorTest/*
// @match        https://shykai.github.io/MWICombatSimulatorTest/dist/*
// @match        https://mooneycalc.netlify.app/*
// @grant        GM_addStyle
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
// @require      https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.2/math.js
// @require      https://cdn.jsdelivr.net/npm/chart.js@3.7.0/dist/chart.min.js
// @require      https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0/dist/chartjs-plugin-datalabels.min.js
// ==/UserScript==

/*
    Steam客户端玩家还需要额外安装兼容插件。

    MilkyWayIdle Steam game client players should also install this script:
    https://raw.githubusercontent.com/YangLeda/Userscripts-For-MilkyWayIdle/refs/heads/main/MWITools%20addon%20for%20Steam%20version.js
*/

/*
    【遇到MWITools插件有问题时的解决方法】

    请先务必排查以下问题：
    1. 你的MWITools插件已更新至最新版（greasyfork网站有可能被墙，请开梯子更新；或者到QQ群文件里下载后手动导入或复制粘贴代码）；
    2. 你没有重复安装插件（有的人装了新版本插件，但还有个旧版本的没有删除，在同时运行；或者有的人在同一个浏览器里装了两个油猴类浏览器插件）；
    3. 安装或更新完插件后，以及在游戏设置里切换过语言后，必须刷新游戏网页；
    4. 请在电脑上、使用最新版本Chrome浏览器、使用最新版本TamperMonkey（油猴）插件尝试（作者精力有限，做不到逐个适配各种环境、为每个人定位环境问题，
       遇到问题时请优先使用上述主流环境。如果你一定要使用旧版本或其它品牌的浏览器或油猴插件，遇到问题请优先自行摸索如何解决，作者很可能无法解决你的问题。
       手机使用问题很多，作者不定位手机上问题。问问群友用什么浏览器好使，多换几个浏览器试试。苹果手机建议尝试focus浏览器。）。

    如果仍有问题，请私聊作者具体问题是什么、复现问题的具体步骤、最好附带截图；
    与网络有关的问题，右上角红字显示无法从API更新市场数据时，点击红字查看错误信息，截图发给作者；
    报错日志是定位问题的快速甚至唯一方法，请打开浏览器开发者工具查看终端，刷新游戏网页，复现遇到的问题，截图发给作者。
*/
(() => {
  // src/core/runtime.js
  var runtime = {
    api: {},
    config: {},
    settings: {},
    data: {},
    state: {},
    starts: [],
    messageHandlers: /* @__PURE__ */ new Map(),
    registerStart(name, start) {
      this.starts.push({ name, start });
    },
    start() {
      for (const feature of this.starts) feature.start();
    },
    onMessage(type, handler) {
      const handlers = this.messageHandlers.get(type) ?? [];
      handlers.push(handler);
      this.messageHandlers.set(type, handlers);
    },
    dispatchMessage(payload, rawMessage) {
      for (const handler of this.messageHandlers.get(payload.type) ?? []) {
        handler(payload, rawMessage);
      }
    }
  };

  // src/core/config.js
  var THOUSAND_SEPERATOR = new Intl.NumberFormat().format(1111).replaceAll("1", "").at(0) || "";
  var DECIMAL_SEPERATOR = new Intl.NumberFormat().format(1.1).replaceAll("1", "").at(0);
  var isZHInGameSetting = localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith("zh");
  var isZH = isZHInGameSetting;
  var SCRIPT_COLOR_MAIN = "green";
  var SCRIPT_COLOR_TOOLTIP = "darkgreen";
  var SCRIPT_COLOR_ALERT = "red";
  var MARKET_API_URL = window.location.href.includes("milkywayidle.com") ? "https://www.milkywayidle.com/game_data/marketplace.json" : "https://www.milkywayidlecn.com/game_data/marketplace.json";
  var settingsMap = {
    useOrangeAsMainColor: {
      id: "useOrangeAsMainColor",
      desc: isZH ? "使用橙色字体" : "Use orange as the main color for the script.",
      isTrue: true
    },
    displayCapMM: {
      id: "displayCapMM",
      desc: isZH ? "限制最高支持M量级（之前最高B量级）" : "Values are capped at the million level, which used to be billion.",
      isTrue: false
    },
    totalActionTime: {
      id: "totalActionTime",
      desc: isZH ? "左上角显示：当前动作预计总耗时、预计何时完成" : "Top left: Estimated total time of the current action, estimated complete time.",
      isTrue: true
    },
    actionPanel_totalTime: {
      id: "actionPanel_totalTime",
      desc: isZH ? "动作面板显示：动作预计总耗时、到多少级还需做多少次、每小时经验" : "Action panel: Estimated total time of the action, times needed to reach a target skill level, exp/hour.",
      isTrue: true
    },
    actionPanel_totalTime_quickInputs: {
      id: "actionPanel_totalTime_quickInputs",
      desc: isZH ? "动作面板显示：快速输入次数 [依赖上一项]" : "Action panel: Quick input numbers. [Depends on the previous selection]",
      isTrue: true
    },
    actionPanel_foragingTotal: {
      id: "actionPanel_foragingTotal",
      desc: isZH ? "动作面板显示：采摘综合图显示综合收益 [依赖上一项]" : "Action panel: Overall profit of the foraging maps with multiple outcomes. [Depends on the previous selection]",
      isTrue: true
    },
    networth: {
      id: "networth",
      desc: isZH ? "右上角显示：流动资产(+2及以上物品按强化模拟成本计算)" : "Top right: Current assets (Items with at least 2 enhancement levels are valued by enchancing simulator).",
      isTrue: true
    },
    invWorth: {
      id: "invWorth",
      desc: isZH ? "仓库搜索栏下方显示：仓库和战力总结 [依赖上一项]" : "Below inventory search bar: Inventory and character summery. [Depends on the previous selection]",
      isTrue: true
    },
    invSort: {
      id: "invSort",
      desc: isZH ? "仓库显示：仓库物品排序 [依赖上一项]" : "Inventory: Sort inventory items. [Depends on the previous selection]",
      isTrue: true
    },
    guildCreditConversionsSort: {
      id: "guildCreditConversionsSort",
      desc: isZH ? "工会信用兑换：公会信用兑换选择排序" : "Guild Credit Exchange: Sort Guild Credit Exchange Options.",
      isTrue: true
    },
    profileBuildScore: {
      id: "profileBuildScore",
      desc: isZH ? "人物面板显示：战力分" : "Profile panel: Build score.",
      isTrue: true
    },
    itemTooltip_prices: {
      id: "itemTooltip_prices",
      desc: isZH ? "物品悬浮窗显示：24小时市场均价" : "Item tooltip: 24 hours average market price.",
      isTrue: true
    },
    itemTooltip_profit: {
      id: "itemTooltip_profit",
      desc: isZH ? "物品悬浮窗显示：生产成本和利润计算 [依赖上一项]" : "Item tooltip: Production cost and profit. [Depends on the previous selection]",
      isTrue: true
    },
    showConsumTips: {
      id: "showConsumTips",
      desc: isZH ? "物品悬浮窗显示：消耗品回血回魔速度、回复性价比、每天最多消耗数量" : "Item tooltip: HP/MP consumables restore speed, cost performance, max cost per day.",
      isTrue: true
    },
    networkAlert: {
      id: "networkAlert",
      desc: isZH ? "右上角显示：无法联网更新市场数据时，红字警告" : "Top right: Alert message when market price data can not be fetched.",
      isTrue: true
    },
    expPercentage: {
      id: "expPercentage",
      desc: isZH ? "左侧栏显示：技能经验百分比" : "Left sidebar: Percentages of exp of the skill levels.",
      isTrue: true
    },
    battlePanel: {
      id: "battlePanel",
      desc: isZH ? "战斗总结面板（战斗时点击玩家头像）显示：平均每小时战斗次数、收入、经验" : "Battle info panel(click on player avatar during combat): Encounters/hour, revenue, exp.",
      isTrue: true
    },
    itemIconLevel: {
      id: "itemIconLevel",
      desc: isZH ? "装备图标右上角显示：装备等级" : "Top right corner of equipment icons: Equipment level.",
      isTrue: true
    },
    showsKeyInfoInIcon: {
      id: "showsKeyInfoInIcon",
      desc: isZH ? "钥匙和钥匙碎片图标右上角显示：对应的地图序号 [依赖上一项]" : "Top right corner of key/fragment icons: Corresponding combat zone index number. [Depends on the previous selection]",
      isTrue: true
    },
    marketFilter: {
      id: "marketFilter",
      desc: isZH ? "市场页面显示：装备按等级、职业、部位筛选" : "Marketplace: Filter by equipment level, class, slot.",
      isTrue: true
    },
    taskMapIndex: {
      id: "taskMapIndex",
      desc: isZH ? "任务页面显示：目标战斗地图序号" : "Tasks page: Combat zone index number.",
      isTrue: true
    },
    mapIndex: {
      id: "mapIndex",
      desc: isZH ? "战斗地图选择页面显示：地图序号" : "Combat zones page: Combat zone index number.",
      isTrue: true
    },
    skillbook: {
      id: "skillbook",
      desc: isZH ? "技能书的物品词典面板显示：到多少级还需要多少本技能书" : "Item dictionary of skill books: Number of books needed to reach target skill level.",
      isTrue: true
    },
    ThirdPartyLinks: {
      id: "ThirdPartyLinks",
      desc: isZH ? "左侧菜单栏显示：第三方工具网站链接、脚本设置链接" : "Left sidebar: Links to 3rd-party websites, script settings.",
      isTrue: true
    },
    actionQueue: {
      id: "actionQueue",
      desc: isZH ? "上方动作队列菜单显示：队列中每个动作预计总时间、到何时完成" : "Queued actions panel at the top: Estimated total time and complete time of each queued action.",
      isTrue: true
    },
    enhanceSim: {
      id: "enhanceSim",
      desc: isZH ? "带强化等级的装备的悬浮菜单显示：强化模拟计算" : "Tooltip of equipment with enhancement level: Enhancing simulator calculations.",
      isTrue: true
    },
    checkEquipment: {
      id: "checkEquipment",
      desc: isZH ? "页面上方显示：战斗时穿了生产装备，或者生产时没有穿对应的生产装备而仓库里有，红字警告" : "Top: Alert message when combating with production equipments equipted, or producing when there are unequipted corresponding production equipment in the inventory.",
      isTrue: true
    },
    notifiEmptyAction: {
      id: "notifiEmptyAction",
      desc: isZH ? "弹窗通知：正在空闲（游戏网页打开时才有效）" : "Browser notification: Action queue is empty. (Works only when the game page is open.)",
      isTrue: false
    },
    fillMarketOrderPrice: {
      id: "fillMarketOrderPrice",
      desc: isZH ? "发布市场订单时自动填写为最小压价" : "Automatically input price with the smallest increasement/decreasement when posting marketplace bid/sell orders.",
      isTrue: true
    },
    showDamage: {
      id: "showDamage",
      desc: isZH ? "战斗时，人物头像下方显示：伤害统计数字" : "Bottom of player avatar during combat: DPS.",
      isTrue: true
    },
    showDamageGraph: {
      id: "showDamageGraph",
      desc: isZH ? "战斗时，悬浮窗显示：伤害统计图表 [依赖上一项]" : "Floating window during combat: DPS chart. [Depends on the previous selection]",
      isTrue: true
    },
    damageGraphTransparentBackground: {
      id: "damageGraphTransparentBackground",
      desc: isZH ? "伤害统计图表背景透明 [依赖上一项]" : "DPS chart transparent and blur background. [Depends on the previous selection]",
      isTrue: true
    },
    forceMWIToolsDisplayZH: {
      id: "forceMWIToolsDisplayZH",
      desc: isZH ? "MWITools本身强制显示中文 MWITools always in Chinese" : "MWITools本身强制显示中文 MWITools always in Chinese",
      isTrue: false
    }
  };
  Object.defineProperties(runtime.config, {
    THOUSAND_SEPERATOR: {
      enumerable: true,
      get() {
        return THOUSAND_SEPERATOR;
      }
    },
    DECIMAL_SEPERATOR: {
      enumerable: true,
      get() {
        return DECIMAL_SEPERATOR;
      }
    },
    isZHInGameSetting: {
      enumerable: true,
      get() {
        return isZHInGameSetting;
      }
    },
    isZH: {
      enumerable: true,
      get() {
        return isZH;
      },
      set(value) {
        isZH = value;
      }
    },
    SCRIPT_COLOR_MAIN: {
      enumerable: true,
      get() {
        return SCRIPT_COLOR_MAIN;
      },
      set(value) {
        SCRIPT_COLOR_MAIN = value;
      }
    },
    SCRIPT_COLOR_TOOLTIP: {
      enumerable: true,
      get() {
        return SCRIPT_COLOR_TOOLTIP;
      },
      set(value) {
        SCRIPT_COLOR_TOOLTIP = value;
      }
    },
    SCRIPT_COLOR_ALERT: {
      enumerable: true,
      get() {
        return SCRIPT_COLOR_ALERT;
      }
    },
    MARKET_API_URL: {
      enumerable: true,
      get() {
        return MARKET_API_URL;
      }
    }
  });
  Object.defineProperties(runtime.settings, {
    settingsMap: {
      enumerable: true,
      get() {
        return settingsMap;
      },
      set(value) {
        settingsMap = value;
      }
    }
  });
  runtime.registerStart("core/config.js", () => {
    console.log(window.location.href);
  });

  // src/data/translations.js
  var ZHItemNames = {
    "/items/coin": "金币",
    "/items/task_token": "任务代币",
    "/items/labyrinth_token": "迷宫代币",
    "/items/chimerical_token": "奇幻代币",
    "/items/sinister_token": "阴森代币",
    "/items/enchanted_token": "秘法代币",
    "/items/pirate_token": "海盗代币",
    "/items/guild_token": "公会代币",
    "/items/green_guild_credit": "绿色公会信用点",
    "/items/brown_guild_credit": "棕色公会信用点",
    "/items/white_guild_credit": "白色公会信用点",
    "/items/blue_guild_credit": "蓝色公会信用点",
    "/items/purple_guild_credit": "紫色公会信用点",
    "/items/red_guild_credit": "红色公会信用点",
    "/items/silver_guild_credit": "银色公会信用点",
    "/items/gold_guild_credit": "金色公会信用点",
    "/items/cowbell": "牛铃",
    "/items/bag_of_10_cowbells": "牛铃袋 (10个)",
    "/items/purples_gift": "小紫牛的礼物",
    "/items/small_meteorite_cache": "小陨石舱",
    "/items/medium_meteorite_cache": "中陨石舱",
    "/items/large_meteorite_cache": "大陨石舱",
    "/items/small_artisans_crate": "小工匠匣",
    "/items/medium_artisans_crate": "中工匠匣",
    "/items/large_artisans_crate": "大工匠匣",
    "/items/small_treasure_chest": "小宝箱",
    "/items/medium_treasure_chest": "中宝箱",
    "/items/large_treasure_chest": "大宝箱",
    "/items/chimerical_chest": "奇幻宝箱",
    "/items/chimerical_refinement_chest": "奇幻精炼宝箱",
    "/items/sinister_chest": "阴森宝箱",
    "/items/sinister_refinement_chest": "阴森精炼宝箱",
    "/items/enchanted_chest": "秘法宝箱",
    "/items/enchanted_refinement_chest": "秘法精炼宝箱",
    "/items/pirate_chest": "海盗宝箱",
    "/items/pirate_refinement_chest": "海盗精炼宝箱",
    "/items/purdoras_box_skilling": "紫多拉之盒（生活）",
    "/items/purdoras_box_combat": "紫多拉之盒（战斗）",
    "/items/labyrinth_refinement_chest": "迷宫精炼宝箱",
    "/items/seal_of_gathering": "采集卷轴",
    "/items/seal_of_gourmet": "美食卷轴",
    "/items/seal_of_processing": "加工卷轴",
    "/items/seal_of_efficiency": "效率卷轴",
    "/items/seal_of_action_speed": "行动速度卷轴",
    "/items/seal_of_combat_drop": "战斗掉落卷轴",
    "/items/seal_of_attack_speed": "攻击速度卷轴",
    "/items/seal_of_cast_speed": "施法速度卷轴",
    "/items/seal_of_damage": "伤害卷轴",
    "/items/seal_of_critical_rate": "暴击率卷轴",
    "/items/seal_of_wisdom": "经验卷轴",
    "/items/seal_of_rare_find": "稀有发现卷轴",
    "/items/blue_key_fragment": "蓝色钥匙碎片",
    "/items/green_key_fragment": "绿色钥匙碎片",
    "/items/purple_key_fragment": "紫色钥匙碎片",
    "/items/white_key_fragment": "白色钥匙碎片",
    "/items/orange_key_fragment": "橙色钥匙碎片",
    "/items/brown_key_fragment": "棕色钥匙碎片",
    "/items/stone_key_fragment": "石头钥匙碎片",
    "/items/dark_key_fragment": "黑暗钥匙碎片",
    "/items/burning_key_fragment": "燃烧钥匙碎片",
    "/items/chimerical_entry_key": "奇幻钥匙",
    "/items/chimerical_chest_key": "奇幻宝箱钥匙",
    "/items/sinister_entry_key": "阴森钥匙",
    "/items/sinister_chest_key": "阴森宝箱钥匙",
    "/items/enchanted_entry_key": "秘法钥匙",
    "/items/enchanted_chest_key": "秘法宝箱钥匙",
    "/items/pirate_entry_key": "海盗钥匙",
    "/items/pirate_chest_key": "海盗宝箱钥匙",
    "/items/donut": "甜甜圈",
    "/items/blueberry_donut": "蓝莓甜甜圈",
    "/items/blackberry_donut": "黑莓甜甜圈",
    "/items/strawberry_donut": "草莓甜甜圈",
    "/items/mooberry_donut": "哞莓甜甜圈",
    "/items/marsberry_donut": "火星莓甜甜圈",
    "/items/spaceberry_donut": "太空莓甜甜圈",
    "/items/cupcake": "纸杯蛋糕",
    "/items/blueberry_cake": "蓝莓蛋糕",
    "/items/blackberry_cake": "黑莓蛋糕",
    "/items/strawberry_cake": "草莓蛋糕",
    "/items/mooberry_cake": "哞莓蛋糕",
    "/items/marsberry_cake": "火星莓蛋糕",
    "/items/spaceberry_cake": "太空莓蛋糕",
    "/items/gummy": "软糖",
    "/items/apple_gummy": "苹果软糖",
    "/items/orange_gummy": "橙子软糖",
    "/items/plum_gummy": "李子软糖",
    "/items/peach_gummy": "桃子软糖",
    "/items/dragon_fruit_gummy": "火龙果软糖",
    "/items/star_fruit_gummy": "杨桃软糖",
    "/items/yogurt": "酸奶",
    "/items/apple_yogurt": "苹果酸奶",
    "/items/orange_yogurt": "橙子酸奶",
    "/items/plum_yogurt": "李子酸奶",
    "/items/peach_yogurt": "桃子酸奶",
    "/items/dragon_fruit_yogurt": "火龙果酸奶",
    "/items/star_fruit_yogurt": "杨桃酸奶",
    "/items/milking_tea": "挤奶茶",
    "/items/foraging_tea": "采摘茶",
    "/items/woodcutting_tea": "伐木茶",
    "/items/cooking_tea": "烹饪茶",
    "/items/brewing_tea": "冲泡茶",
    "/items/alchemy_tea": "炼金茶",
    "/items/enhancing_tea": "强化茶",
    "/items/cheesesmithing_tea": "奶酪锻造茶",
    "/items/crafting_tea": "制作茶",
    "/items/tailoring_tea": "缝纫茶",
    "/items/super_milking_tea": "超级挤奶茶",
    "/items/super_foraging_tea": "超级采摘茶",
    "/items/super_woodcutting_tea": "超级伐木茶",
    "/items/super_cooking_tea": "超级烹饪茶",
    "/items/super_brewing_tea": "超级冲泡茶",
    "/items/super_alchemy_tea": "超级炼金茶",
    "/items/super_enhancing_tea": "超级强化茶",
    "/items/super_cheesesmithing_tea": "超级奶酪锻造茶",
    "/items/super_crafting_tea": "超级制作茶",
    "/items/super_tailoring_tea": "超级缝纫茶",
    "/items/ultra_milking_tea": "究极挤奶茶",
    "/items/ultra_foraging_tea": "究极采摘茶",
    "/items/ultra_woodcutting_tea": "究极伐木茶",
    "/items/ultra_cooking_tea": "究极烹饪茶",
    "/items/ultra_brewing_tea": "究极冲泡茶",
    "/items/ultra_alchemy_tea": "究极炼金茶",
    "/items/ultra_enhancing_tea": "究极强化茶",
    "/items/ultra_cheesesmithing_tea": "究极奶酪锻造茶",
    "/items/ultra_crafting_tea": "究极制作茶",
    "/items/ultra_tailoring_tea": "究极缝纫茶",
    "/items/gathering_tea": "采集茶",
    "/items/gourmet_tea": "美食茶",
    "/items/wisdom_tea": "经验茶",
    "/items/processing_tea": "加工茶",
    "/items/efficiency_tea": "效率茶",
    "/items/artisan_tea": "工匠茶",
    "/items/catalytic_tea": "催化茶",
    "/items/blessed_tea": "福气茶",
    "/items/stamina_coffee": "耐力咖啡",
    "/items/intelligence_coffee": "智力咖啡",
    "/items/defense_coffee": "防御咖啡",
    "/items/attack_coffee": "攻击咖啡",
    "/items/melee_coffee": "近战咖啡",
    "/items/ranged_coffee": "远程咖啡",
    "/items/magic_coffee": "魔法咖啡",
    "/items/super_stamina_coffee": "超级耐力咖啡",
    "/items/super_intelligence_coffee": "超级智力咖啡",
    "/items/super_defense_coffee": "超级防御咖啡",
    "/items/super_attack_coffee": "超级攻击咖啡",
    "/items/super_melee_coffee": "超级近战咖啡",
    "/items/super_ranged_coffee": "超级远程咖啡",
    "/items/super_magic_coffee": "超级魔法咖啡",
    "/items/ultra_stamina_coffee": "究极耐力咖啡",
    "/items/ultra_intelligence_coffee": "究极智力咖啡",
    "/items/ultra_defense_coffee": "究极防御咖啡",
    "/items/ultra_attack_coffee": "究极攻击咖啡",
    "/items/ultra_melee_coffee": "究极近战咖啡",
    "/items/ultra_ranged_coffee": "究极远程咖啡",
    "/items/ultra_magic_coffee": "究极魔法咖啡",
    "/items/wisdom_coffee": "经验咖啡",
    "/items/lucky_coffee": "幸运咖啡",
    "/items/swiftness_coffee": "迅捷咖啡",
    "/items/channeling_coffee": "吟唱咖啡",
    "/items/critical_coffee": "暴击咖啡",
    "/items/poke": "破胆之刺",
    "/items/impale": "透骨之刺",
    "/items/puncture": "破甲之刺",
    "/items/penetrating_strike": "贯心之刺",
    "/items/scratch": "爪影斩",
    "/items/cleave": "分裂斩",
    "/items/maim": "血刃斩",
    "/items/crippling_slash": "致残斩",
    "/items/smack": "重碾",
    "/items/sweep": "重扫",
    "/items/stunning_blow": "重锤",
    "/items/fracturing_impact": "碎裂冲击",
    "/items/shield_bash": "盾击",
    "/items/quick_shot": "快速射击",
    "/items/aqua_arrow": "流水箭",
    "/items/flame_arrow": "烈焰箭",
    "/items/rain_of_arrows": "箭雨",
    "/items/silencing_shot": "沉默之箭",
    "/items/steady_shot": "稳定射击",
    "/items/pestilent_shot": "疫病射击",
    "/items/penetrating_shot": "贯穿射击",
    "/items/water_strike": "流水冲击",
    "/items/ice_spear": "冰枪术",
    "/items/frost_surge": "冰霜爆裂",
    "/items/mana_spring": "法力喷泉",
    "/items/entangle": "缠绕",
    "/items/toxic_pollen": "剧毒粉尘",
    "/items/natures_veil": "自然菌幕",
    "/items/life_drain": "生命吸取",
    "/items/fireball": "火球",
    "/items/flame_blast": "熔岩爆裂",
    "/items/firestorm": "火焰风暴",
    "/items/smoke_burst": "烟爆灭影",
    "/items/minor_heal": "初级自愈术",
    "/items/heal": "自愈术",
    "/items/quick_aid": "快速治疗术",
    "/items/rejuvenate": "群体治疗术",
    "/items/taunt": "嘲讽",
    "/items/provoke": "挑衅",
    "/items/toughness": "坚韧",
    "/items/elusiveness": "闪避",
    "/items/precision": "精确",
    "/items/berserk": "狂暴",
    "/items/elemental_affinity": "元素增幅",
    "/items/frenzy": "狂速",
    "/items/spike_shell": "尖刺防护",
    "/items/retribution": "惩戒",
    "/items/vampirism": "吸血",
    "/items/revive": "复活",
    "/items/insanity": "疯狂",
    "/items/invincible": "无敌",
    "/items/speed_aura": "速度光环",
    "/items/guardian_aura": "守护光环",
    "/items/fierce_aura": "物理光环",
    "/items/critical_aura": "暴击光环",
    "/items/mystic_aura": "元素光环",
    "/items/gobo_stabber": "哥布林长剑",
    "/items/gobo_slasher": "哥布林关刀",
    "/items/gobo_smasher": "哥布林狼牙棒",
    "/items/spiked_bulwark": "尖刺重盾",
    "/items/werewolf_slasher": "狼人关刀",
    "/items/griffin_bulwark": "狮鹫重盾",
    "/items/griffin_bulwark_refined": "狮鹫重盾 ★",
    "/items/gobo_shooter": "哥布林弹弓",
    "/items/vampiric_bow": "吸血弓",
    "/items/cursed_bow": "咒怨之弓",
    "/items/cursed_bow_refined": "咒怨之弓 ★",
    "/items/gobo_boomstick": "哥布林火棍",
    "/items/cheese_bulwark": "奶酪重盾",
    "/items/verdant_bulwark": "翠绿重盾",
    "/items/azure_bulwark": "蔚蓝重盾",
    "/items/burble_bulwark": "深紫重盾",
    "/items/crimson_bulwark": "绛红重盾",
    "/items/rainbow_bulwark": "彩虹重盾",
    "/items/holy_bulwark": "神圣重盾",
    "/items/wooden_bow": "木弓",
    "/items/birch_bow": "桦木弓",
    "/items/cedar_bow": "雪松弓",
    "/items/purpleheart_bow": "紫心弓",
    "/items/ginkgo_bow": "银杏弓",
    "/items/redwood_bow": "红杉弓",
    "/items/arcane_bow": "神秘弓",
    "/items/stalactite_spear": "石钟长枪",
    "/items/granite_bludgeon": "花岗岩大棒",
    "/items/furious_spear": "狂怒长枪",
    "/items/furious_spear_refined": "狂怒长枪 ★",
    "/items/regal_sword": "君王之剑",
    "/items/regal_sword_refined": "君王之剑 ★",
    "/items/chaotic_flail": "混沌连枷",
    "/items/chaotic_flail_refined": "混沌连枷 ★",
    "/items/soul_hunter_crossbow": "灵魂猎手弩",
    "/items/sundering_crossbow": "裂空之弩",
    "/items/sundering_crossbow_refined": "裂空之弩 ★",
    "/items/frost_staff": "冰霜法杖",
    "/items/infernal_battlestaff": "炼狱法杖",
    "/items/jackalope_staff": "鹿角兔之杖",
    "/items/rippling_trident": "涟漪三叉戟",
    "/items/rippling_trident_refined": "涟漪三叉戟 ★",
    "/items/blooming_trident": "绽放三叉戟",
    "/items/blooming_trident_refined": "绽放三叉戟 ★",
    "/items/blazing_trident": "炽焰三叉戟",
    "/items/blazing_trident_refined": "炽焰三叉戟 ★",
    "/items/cheese_sword": "奶酪剑",
    "/items/verdant_sword": "翠绿剑",
    "/items/azure_sword": "蔚蓝剑",
    "/items/burble_sword": "深紫剑",
    "/items/crimson_sword": "绛红剑",
    "/items/rainbow_sword": "彩虹剑",
    "/items/holy_sword": "神圣剑",
    "/items/cheese_spear": "奶酪长枪",
    "/items/verdant_spear": "翠绿长枪",
    "/items/azure_spear": "蔚蓝长枪",
    "/items/burble_spear": "深紫长枪",
    "/items/crimson_spear": "绛红长枪",
    "/items/rainbow_spear": "彩虹长枪",
    "/items/holy_spear": "神圣长枪",
    "/items/cheese_mace": "奶酪钉头锤",
    "/items/verdant_mace": "翠绿钉头锤",
    "/items/azure_mace": "蔚蓝钉头锤",
    "/items/burble_mace": "深紫钉头锤",
    "/items/crimson_mace": "绛红钉头锤",
    "/items/rainbow_mace": "彩虹钉头锤",
    "/items/holy_mace": "神圣钉头锤",
    "/items/wooden_crossbow": "木弩",
    "/items/birch_crossbow": "桦木弩",
    "/items/cedar_crossbow": "雪松弩",
    "/items/purpleheart_crossbow": "紫心弩",
    "/items/ginkgo_crossbow": "银杏弩",
    "/items/redwood_crossbow": "红杉弩",
    "/items/arcane_crossbow": "神秘弩",
    "/items/wooden_water_staff": "木制水法杖",
    "/items/birch_water_staff": "桦木水法杖",
    "/items/cedar_water_staff": "雪松水法杖",
    "/items/purpleheart_water_staff": "紫心水法杖",
    "/items/ginkgo_water_staff": "银杏水法杖",
    "/items/redwood_water_staff": "红杉水法杖",
    "/items/arcane_water_staff": "神秘水法杖",
    "/items/wooden_nature_staff": "木制自然法杖",
    "/items/birch_nature_staff": "桦木自然法杖",
    "/items/cedar_nature_staff": "雪松自然法杖",
    "/items/purpleheart_nature_staff": "紫心自然法杖",
    "/items/ginkgo_nature_staff": "银杏自然法杖",
    "/items/redwood_nature_staff": "红杉自然法杖",
    "/items/arcane_nature_staff": "神秘自然法杖",
    "/items/wooden_fire_staff": "木制火法杖",
    "/items/birch_fire_staff": "桦木火法杖",
    "/items/cedar_fire_staff": "雪松火法杖",
    "/items/purpleheart_fire_staff": "紫心火法杖",
    "/items/ginkgo_fire_staff": "银杏火法杖",
    "/items/redwood_fire_staff": "红杉火法杖",
    "/items/arcane_fire_staff": "神秘火法杖",
    "/items/eye_watch": "掌上监工",
    "/items/snake_fang_dirk": "蛇牙短剑",
    "/items/vision_shield": "视觉盾",
    "/items/gobo_defender": "哥布林防御者",
    "/items/vampire_fang_dirk": "吸血鬼短剑",
    "/items/knights_aegis": "骑士盾",
    "/items/knights_aegis_refined": "骑士盾 ★",
    "/items/treant_shield": "树人盾",
    "/items/manticore_shield": "蝎狮盾",
    "/items/tome_of_healing": "治疗之书",
    "/items/tome_of_the_elements": "元素之书",
    "/items/watchful_relic": "警戒遗物",
    "/items/bishops_codex": "主教法典",
    "/items/bishops_codex_refined": "主教法典 ★",
    "/items/cheese_buckler": "奶酪圆盾",
    "/items/verdant_buckler": "翠绿圆盾",
    "/items/azure_buckler": "蔚蓝圆盾",
    "/items/burble_buckler": "深紫圆盾",
    "/items/crimson_buckler": "绛红圆盾",
    "/items/rainbow_buckler": "彩虹圆盾",
    "/items/holy_buckler": "神圣圆盾",
    "/items/wooden_shield": "木盾",
    "/items/birch_shield": "桦木盾",
    "/items/cedar_shield": "雪松盾",
    "/items/purpleheart_shield": "紫心盾",
    "/items/ginkgo_shield": "银杏盾",
    "/items/redwood_shield": "红杉盾",
    "/items/arcane_shield": "神秘盾",
    "/items/gatherer_cape": "采集者披风",
    "/items/gatherer_cape_refined": "采集者披风 ★",
    "/items/artificer_cape": "工匠披风",
    "/items/artificer_cape_refined": "工匠披风 ★",
    "/items/culinary_cape": "厨师披风",
    "/items/culinary_cape_refined": "厨师披风 ★",
    "/items/chance_cape": "机缘披风",
    "/items/chance_cape_refined": "机缘披风 ★",
    "/items/sinister_cape": "阴森披风",
    "/items/sinister_cape_refined": "阴森披风 ★",
    "/items/chimerical_quiver": "奇幻箭袋",
    "/items/chimerical_quiver_refined": "奇幻箭袋 ★",
    "/items/enchanted_cloak": "秘法披风",
    "/items/enchanted_cloak_refined": "秘法披风 ★",
    "/items/red_culinary_hat": "红色厨师帽",
    "/items/snail_shell_helmet": "蜗牛壳头盔",
    "/items/vision_helmet": "视觉头盔",
    "/items/fluffy_red_hat": "蓬松红帽子",
    "/items/corsair_helmet": "掠夺者头盔",
    "/items/corsair_helmet_refined": "掠夺者头盔 ★",
    "/items/acrobatic_hood": "杂技师兜帽",
    "/items/acrobatic_hood_refined": "杂技师兜帽 ★",
    "/items/magicians_hat": "魔术师帽",
    "/items/magicians_hat_refined": "魔术师帽 ★",
    "/items/cheese_helmet": "奶酪头盔",
    "/items/verdant_helmet": "翠绿头盔",
    "/items/azure_helmet": "蔚蓝头盔",
    "/items/burble_helmet": "深紫头盔",
    "/items/crimson_helmet": "绛红头盔",
    "/items/rainbow_helmet": "彩虹头盔",
    "/items/holy_helmet": "神圣头盔",
    "/items/rough_hood": "粗糙兜帽",
    "/items/reptile_hood": "爬行动物兜帽",
    "/items/gobo_hood": "哥布林兜帽",
    "/items/beast_hood": "野兽兜帽",
    "/items/umbral_hood": "暗影兜帽",
    "/items/cotton_hat": "棉帽",
    "/items/linen_hat": "亚麻帽",
    "/items/bamboo_hat": "竹帽",
    "/items/silk_hat": "丝帽",
    "/items/radiant_hat": "光辉帽",
    "/items/dairyhands_top": "挤奶工上衣",
    "/items/foragers_top": "采摘者上衣",
    "/items/lumberjacks_top": "伐木工上衣",
    "/items/cheesemakers_top": "奶酪师上衣",
    "/items/crafters_top": "工匠上衣",
    "/items/tailors_top": "裁缝上衣",
    "/items/chefs_top": "厨师上衣",
    "/items/brewers_top": "饮品师上衣",
    "/items/alchemists_top": "炼金师上衣",
    "/items/enhancers_top": "强化师上衣",
    "/items/gator_vest": "鳄鱼马甲",
    "/items/turtle_shell_body": "龟壳胸甲",
    "/items/colossus_plate_body": "巨像胸甲",
    "/items/demonic_plate_body": "恶魔胸甲",
    "/items/anchorbound_plate_body": "锚定胸甲",
    "/items/anchorbound_plate_body_refined": "锚定胸甲 ★",
    "/items/maelstrom_plate_body": "怒涛胸甲",
    "/items/maelstrom_plate_body_refined": "怒涛胸甲 ★",
    "/items/marine_tunic": "海洋皮衣",
    "/items/revenant_tunic": "亡灵皮衣",
    "/items/griffin_tunic": "狮鹫皮衣",
    "/items/kraken_tunic": "克拉肯皮衣",
    "/items/kraken_tunic_refined": "克拉肯皮衣 ★",
    "/items/icy_robe_top": "冰霜袍服",
    "/items/flaming_robe_top": "烈焰袍服",
    "/items/luna_robe_top": "月神袍服",
    "/items/royal_water_robe_top": "皇家水系袍服",
    "/items/royal_water_robe_top_refined": "皇家水系袍服 ★",
    "/items/royal_nature_robe_top": "皇家自然系袍服",
    "/items/royal_nature_robe_top_refined": "皇家自然系袍服 ★",
    "/items/royal_fire_robe_top": "皇家火系袍服",
    "/items/royal_fire_robe_top_refined": "皇家火系袍服 ★",
    "/items/cheese_plate_body": "奶酪胸甲",
    "/items/verdant_plate_body": "翠绿胸甲",
    "/items/azure_plate_body": "蔚蓝胸甲",
    "/items/burble_plate_body": "深紫胸甲",
    "/items/crimson_plate_body": "绛红胸甲",
    "/items/rainbow_plate_body": "彩虹胸甲",
    "/items/holy_plate_body": "神圣胸甲",
    "/items/rough_tunic": "粗糙皮衣",
    "/items/reptile_tunic": "爬行动物皮衣",
    "/items/gobo_tunic": "哥布林皮衣",
    "/items/beast_tunic": "野兽皮衣",
    "/items/umbral_tunic": "暗影皮衣",
    "/items/cotton_robe_top": "棉袍服",
    "/items/linen_robe_top": "亚麻袍服",
    "/items/bamboo_robe_top": "竹袍服",
    "/items/silk_robe_top": "丝绸袍服",
    "/items/radiant_robe_top": "光辉袍服",
    "/items/dairyhands_bottoms": "挤奶工下装",
    "/items/foragers_bottoms": "采摘者下装",
    "/items/lumberjacks_bottoms": "伐木工下装",
    "/items/cheesemakers_bottoms": "奶酪师下装",
    "/items/crafters_bottoms": "工匠下装",
    "/items/tailors_bottoms": "裁缝下装",
    "/items/chefs_bottoms": "厨师下装",
    "/items/brewers_bottoms": "饮品师下装",
    "/items/alchemists_bottoms": "炼金师下装",
    "/items/enhancers_bottoms": "强化师下装",
    "/items/turtle_shell_legs": "龟壳腿甲",
    "/items/colossus_plate_legs": "巨像腿甲",
    "/items/demonic_plate_legs": "恶魔腿甲",
    "/items/anchorbound_plate_legs": "锚定腿甲",
    "/items/anchorbound_plate_legs_refined": "锚定腿甲 ★",
    "/items/maelstrom_plate_legs": "怒涛腿甲",
    "/items/maelstrom_plate_legs_refined": "怒涛腿甲 ★",
    "/items/marine_chaps": "航海皮裤",
    "/items/revenant_chaps": "亡灵皮裤",
    "/items/griffin_chaps": "狮鹫皮裤",
    "/items/kraken_chaps": "克拉肯皮裤",
    "/items/kraken_chaps_refined": "克拉肯皮裤 ★",
    "/items/icy_robe_bottoms": "冰霜袍裙",
    "/items/flaming_robe_bottoms": "烈焰袍裙",
    "/items/luna_robe_bottoms": "月神袍裙",
    "/items/royal_water_robe_bottoms": "皇家水系袍裙",
    "/items/royal_water_robe_bottoms_refined": "皇家水系袍裙 ★",
    "/items/royal_nature_robe_bottoms": "皇家自然系袍裙",
    "/items/royal_nature_robe_bottoms_refined": "皇家自然系袍裙 ★",
    "/items/royal_fire_robe_bottoms": "皇家火系袍裙",
    "/items/royal_fire_robe_bottoms_refined": "皇家火系袍裙 ★",
    "/items/cheese_plate_legs": "奶酪腿甲",
    "/items/verdant_plate_legs": "翠绿腿甲",
    "/items/azure_plate_legs": "蔚蓝腿甲",
    "/items/burble_plate_legs": "深紫腿甲",
    "/items/crimson_plate_legs": "绛红腿甲",
    "/items/rainbow_plate_legs": "彩虹腿甲",
    "/items/holy_plate_legs": "神圣腿甲",
    "/items/rough_chaps": "粗糙皮裤",
    "/items/reptile_chaps": "爬行动物皮裤",
    "/items/gobo_chaps": "哥布林皮裤",
    "/items/beast_chaps": "野兽皮裤",
    "/items/umbral_chaps": "暗影皮裤",
    "/items/cotton_robe_bottoms": "棉袍裙",
    "/items/linen_robe_bottoms": "亚麻袍裙",
    "/items/bamboo_robe_bottoms": "竹袍裙",
    "/items/silk_robe_bottoms": "丝绸袍裙",
    "/items/radiant_robe_bottoms": "光辉袍裙",
    "/items/enchanted_gloves": "附魔手套",
    "/items/pincer_gloves": "蟹钳手套",
    "/items/panda_gloves": "熊猫手套",
    "/items/magnetic_gloves": "磁力手套",
    "/items/dodocamel_gauntlets": "渡渡驼护手",
    "/items/dodocamel_gauntlets_refined": "渡渡驼护手 ★",
    "/items/sighted_bracers": "瞄准护腕",
    "/items/marksman_bracers": "神射护腕",
    "/items/marksman_bracers_refined": "神射护腕 ★",
    "/items/chrono_gloves": "时空手套",
    "/items/cheese_gauntlets": "奶酪护手",
    "/items/verdant_gauntlets": "翠绿护手",
    "/items/azure_gauntlets": "蔚蓝护手",
    "/items/burble_gauntlets": "深紫护手",
    "/items/crimson_gauntlets": "绛红护手",
    "/items/rainbow_gauntlets": "彩虹护手",
    "/items/holy_gauntlets": "神圣护手",
    "/items/rough_bracers": "粗糙护腕",
    "/items/reptile_bracers": "爬行动物护腕",
    "/items/gobo_bracers": "哥布林护腕",
    "/items/beast_bracers": "野兽护腕",
    "/items/umbral_bracers": "暗影护腕",
    "/items/cotton_gloves": "棉手套",
    "/items/linen_gloves": "亚麻手套",
    "/items/bamboo_gloves": "竹手套",
    "/items/silk_gloves": "丝手套",
    "/items/radiant_gloves": "光辉手套",
    "/items/collectors_boots": "收藏家靴",
    "/items/shoebill_shoes": "鲸头鹳鞋",
    "/items/black_bear_shoes": "黑熊鞋",
    "/items/grizzly_bear_shoes": "棕熊鞋",
    "/items/polar_bear_shoes": "北极熊鞋",
    "/items/pathbreaker_boots": "开路者靴",
    "/items/pathbreaker_boots_refined": "开路者靴 ★",
    "/items/centaur_boots": "半人马靴",
    "/items/pathfinder_boots": "探路者靴",
    "/items/pathfinder_boots_refined": "探路者靴 ★",
    "/items/sorcerer_boots": "巫师靴",
    "/items/pathseeker_boots": "寻路者靴",
    "/items/pathseeker_boots_refined": "寻路者靴 ★",
    "/items/cheese_boots": "奶酪靴",
    "/items/verdant_boots": "翠绿靴",
    "/items/azure_boots": "蔚蓝靴",
    "/items/burble_boots": "深紫靴",
    "/items/crimson_boots": "绛红靴",
    "/items/rainbow_boots": "彩虹靴",
    "/items/holy_boots": "神圣靴",
    "/items/rough_boots": "粗糙靴",
    "/items/reptile_boots": "爬行动物靴",
    "/items/gobo_boots": "哥布林靴",
    "/items/beast_boots": "野兽靴",
    "/items/umbral_boots": "暗影靴",
    "/items/cotton_boots": "棉靴",
    "/items/linen_boots": "亚麻靴",
    "/items/bamboo_boots": "竹靴",
    "/items/silk_boots": "丝靴",
    "/items/radiant_boots": "光辉靴",
    "/items/small_pouch": "小袋子",
    "/items/medium_pouch": "中袋子",
    "/items/large_pouch": "大袋子",
    "/items/giant_pouch": "巨大袋子",
    "/items/gluttonous_pouch": "贪食之袋",
    "/items/guzzling_pouch": "暴饮之囊",
    "/items/necklace_of_efficiency": "效率项链",
    "/items/fighter_necklace": "战士项链",
    "/items/ranger_necklace": "射手项链",
    "/items/wizard_necklace": "巫师项链",
    "/items/necklace_of_wisdom": "经验项链",
    "/items/necklace_of_speed": "速度项链",
    "/items/philosophers_necklace": "贤者项链",
    "/items/earrings_of_gathering": "采集耳环",
    "/items/earrings_of_essence_find": "精华发现耳环",
    "/items/earrings_of_armor": "护甲耳环",
    "/items/earrings_of_regeneration": "恢复耳环",
    "/items/earrings_of_resistance": "抗性耳环",
    "/items/earrings_of_rare_find": "稀有发现耳环",
    "/items/earrings_of_critical_strike": "暴击耳环",
    "/items/philosophers_earrings": "贤者耳环",
    "/items/ring_of_gathering": "采集戒指",
    "/items/ring_of_essence_find": "精华发现戒指",
    "/items/ring_of_armor": "护甲戒指",
    "/items/ring_of_regeneration": "恢复戒指",
    "/items/ring_of_resistance": "抗性戒指",
    "/items/ring_of_rare_find": "稀有发现戒指",
    "/items/ring_of_critical_strike": "暴击戒指",
    "/items/philosophers_ring": "贤者戒指",
    "/items/trainee_milking_charm": "实习挤奶护符",
    "/items/basic_milking_charm": "基础挤奶护符",
    "/items/advanced_milking_charm": "高级挤奶护符",
    "/items/expert_milking_charm": "专家挤奶护符",
    "/items/master_milking_charm": "大师挤奶护符",
    "/items/grandmaster_milking_charm": "宗师挤奶护符",
    "/items/trainee_foraging_charm": "实习采摘护符",
    "/items/basic_foraging_charm": "基础采摘护符",
    "/items/advanced_foraging_charm": "高级采摘护符",
    "/items/expert_foraging_charm": "专家采摘护符",
    "/items/master_foraging_charm": "大师采摘护符",
    "/items/grandmaster_foraging_charm": "宗师采摘护符",
    "/items/trainee_woodcutting_charm": "实习伐木护符",
    "/items/basic_woodcutting_charm": "基础伐木护符",
    "/items/advanced_woodcutting_charm": "高级伐木护符",
    "/items/expert_woodcutting_charm": "专家伐木护符",
    "/items/master_woodcutting_charm": "大师伐木护符",
    "/items/grandmaster_woodcutting_charm": "宗师伐木护符",
    "/items/trainee_cheesesmithing_charm": "实习奶酪锻造护符",
    "/items/basic_cheesesmithing_charm": "基础奶酪锻造护符",
    "/items/advanced_cheesesmithing_charm": "高级奶酪锻造护符",
    "/items/expert_cheesesmithing_charm": "专家奶酪锻造护符",
    "/items/master_cheesesmithing_charm": "大师奶酪锻造护符",
    "/items/grandmaster_cheesesmithing_charm": "宗师奶酪锻造护符",
    "/items/trainee_crafting_charm": "实习制作护符",
    "/items/basic_crafting_charm": "基础制作护符",
    "/items/advanced_crafting_charm": "高级制作护符",
    "/items/expert_crafting_charm": "专家制作护符",
    "/items/master_crafting_charm": "大师制作护符",
    "/items/grandmaster_crafting_charm": "宗师制作护符",
    "/items/trainee_tailoring_charm": "实习缝纫护符",
    "/items/basic_tailoring_charm": "基础缝纫护符",
    "/items/advanced_tailoring_charm": "高级缝纫护符",
    "/items/expert_tailoring_charm": "专家缝纫护符",
    "/items/master_tailoring_charm": "大师缝纫护符",
    "/items/grandmaster_tailoring_charm": "宗师缝纫护符",
    "/items/trainee_cooking_charm": "实习烹饪护符",
    "/items/basic_cooking_charm": "基础烹饪护符",
    "/items/advanced_cooking_charm": "高级烹饪护符",
    "/items/expert_cooking_charm": "专家烹饪护符",
    "/items/master_cooking_charm": "大师烹饪护符",
    "/items/grandmaster_cooking_charm": "宗师烹饪护符",
    "/items/trainee_brewing_charm": "实习冲泡护符",
    "/items/basic_brewing_charm": "基础冲泡护符",
    "/items/advanced_brewing_charm": "高级冲泡护符",
    "/items/expert_brewing_charm": "专家冲泡护符",
    "/items/master_brewing_charm": "大师冲泡护符",
    "/items/grandmaster_brewing_charm": "宗师冲泡护符",
    "/items/trainee_alchemy_charm": "实习炼金护符",
    "/items/basic_alchemy_charm": "基础炼金护符",
    "/items/advanced_alchemy_charm": "高级炼金护符",
    "/items/expert_alchemy_charm": "专家炼金护符",
    "/items/master_alchemy_charm": "大师炼金护符",
    "/items/grandmaster_alchemy_charm": "宗师炼金护符",
    "/items/trainee_enhancing_charm": "实习强化护符",
    "/items/basic_enhancing_charm": "基础强化护符",
    "/items/advanced_enhancing_charm": "高级强化护符",
    "/items/expert_enhancing_charm": "专家强化护符",
    "/items/master_enhancing_charm": "大师强化护符",
    "/items/grandmaster_enhancing_charm": "宗师强化护符",
    "/items/trainee_stamina_charm": "实习耐力护符",
    "/items/basic_stamina_charm": "基础耐力护符",
    "/items/advanced_stamina_charm": "高级耐力护符",
    "/items/expert_stamina_charm": "专家耐力护符",
    "/items/master_stamina_charm": "大师耐力护符",
    "/items/grandmaster_stamina_charm": "宗师耐力护符",
    "/items/trainee_intelligence_charm": "实习智力护符",
    "/items/basic_intelligence_charm": "基础智力护符",
    "/items/advanced_intelligence_charm": "高级智力护符",
    "/items/expert_intelligence_charm": "专家智力护符",
    "/items/master_intelligence_charm": "大师智力护符",
    "/items/grandmaster_intelligence_charm": "宗师智力护符",
    "/items/trainee_attack_charm": "实习攻击护符",
    "/items/basic_attack_charm": "基础攻击护符",
    "/items/advanced_attack_charm": "高级攻击护符",
    "/items/expert_attack_charm": "专家攻击护符",
    "/items/master_attack_charm": "大师攻击护符",
    "/items/grandmaster_attack_charm": "宗师攻击护符",
    "/items/trainee_defense_charm": "实习防御护符",
    "/items/basic_defense_charm": "基础防御护符",
    "/items/advanced_defense_charm": "高级防御护符",
    "/items/expert_defense_charm": "专家防御护符",
    "/items/master_defense_charm": "大师防御护符",
    "/items/grandmaster_defense_charm": "宗师防御护符",
    "/items/trainee_melee_charm": "实习近战护符",
    "/items/basic_melee_charm": "基础近战护符",
    "/items/advanced_melee_charm": "高级近战护符",
    "/items/expert_melee_charm": "专家近战护符",
    "/items/master_melee_charm": "大师近战护符",
    "/items/grandmaster_melee_charm": "宗师近战护符",
    "/items/trainee_ranged_charm": "实习远程护符",
    "/items/basic_ranged_charm": "基础远程护符",
    "/items/advanced_ranged_charm": "高级远程护符",
    "/items/expert_ranged_charm": "专家远程护符",
    "/items/master_ranged_charm": "大师远程护符",
    "/items/grandmaster_ranged_charm": "宗师远程护符",
    "/items/trainee_magic_charm": "实习魔法护符",
    "/items/basic_magic_charm": "基础魔法护符",
    "/items/advanced_magic_charm": "高级魔法护符",
    "/items/expert_magic_charm": "专家魔法护符",
    "/items/master_magic_charm": "大师魔法护符",
    "/items/grandmaster_magic_charm": "宗师魔法护符",
    "/items/basic_task_badge": "基础任务徽章",
    "/items/advanced_task_badge": "高级任务徽章",
    "/items/expert_task_badge": "专家任务徽章",
    "/items/celestial_brush": "星空刷子",
    "/items/cheese_brush": "奶酪刷子",
    "/items/verdant_brush": "翠绿刷子",
    "/items/azure_brush": "蔚蓝刷子",
    "/items/burble_brush": "深紫刷子",
    "/items/crimson_brush": "绛红刷子",
    "/items/rainbow_brush": "彩虹刷子",
    "/items/holy_brush": "神圣刷子",
    "/items/celestial_shears": "星空剪刀",
    "/items/cheese_shears": "奶酪剪刀",
    "/items/verdant_shears": "翠绿剪刀",
    "/items/azure_shears": "蔚蓝剪刀",
    "/items/burble_shears": "深紫剪刀",
    "/items/crimson_shears": "绛红剪刀",
    "/items/rainbow_shears": "彩虹剪刀",
    "/items/holy_shears": "神圣剪刀",
    "/items/celestial_hatchet": "星空斧头",
    "/items/cheese_hatchet": "奶酪斧头",
    "/items/verdant_hatchet": "翠绿斧头",
    "/items/azure_hatchet": "蔚蓝斧头",
    "/items/burble_hatchet": "深紫斧头",
    "/items/crimson_hatchet": "绛红斧头",
    "/items/rainbow_hatchet": "彩虹斧头",
    "/items/holy_hatchet": "神圣斧头",
    "/items/celestial_hammer": "星空锤子",
    "/items/cheese_hammer": "奶酪锤子",
    "/items/verdant_hammer": "翠绿锤子",
    "/items/azure_hammer": "蔚蓝锤子",
    "/items/burble_hammer": "深紫锤子",
    "/items/crimson_hammer": "绛红锤子",
    "/items/rainbow_hammer": "彩虹锤子",
    "/items/holy_hammer": "神圣锤子",
    "/items/celestial_chisel": "星空凿子",
    "/items/cheese_chisel": "奶酪凿子",
    "/items/verdant_chisel": "翠绿凿子",
    "/items/azure_chisel": "蔚蓝凿子",
    "/items/burble_chisel": "深紫凿子",
    "/items/crimson_chisel": "绛红凿子",
    "/items/rainbow_chisel": "彩虹凿子",
    "/items/holy_chisel": "神圣凿子",
    "/items/celestial_needle": "星空针",
    "/items/cheese_needle": "奶酪针",
    "/items/verdant_needle": "翠绿针",
    "/items/azure_needle": "蔚蓝针",
    "/items/burble_needle": "深紫针",
    "/items/crimson_needle": "绛红针",
    "/items/rainbow_needle": "彩虹针",
    "/items/holy_needle": "神圣针",
    "/items/celestial_spatula": "星空锅铲",
    "/items/cheese_spatula": "奶酪锅铲",
    "/items/verdant_spatula": "翠绿锅铲",
    "/items/azure_spatula": "蔚蓝锅铲",
    "/items/burble_spatula": "深紫锅铲",
    "/items/crimson_spatula": "绛红锅铲",
    "/items/rainbow_spatula": "彩虹锅铲",
    "/items/holy_spatula": "神圣锅铲",
    "/items/celestial_pot": "星空壶",
    "/items/cheese_pot": "奶酪壶",
    "/items/verdant_pot": "翠绿壶",
    "/items/azure_pot": "蔚蓝壶",
    "/items/burble_pot": "深紫壶",
    "/items/crimson_pot": "绛红壶",
    "/items/rainbow_pot": "彩虹壶",
    "/items/holy_pot": "神圣壶",
    "/items/celestial_alembic": "星空蒸馏器",
    "/items/cheese_alembic": "奶酪蒸馏器",
    "/items/verdant_alembic": "翠绿蒸馏器",
    "/items/azure_alembic": "蔚蓝蒸馏器",
    "/items/burble_alembic": "深紫蒸馏器",
    "/items/crimson_alembic": "绛红蒸馏器",
    "/items/rainbow_alembic": "彩虹蒸馏器",
    "/items/holy_alembic": "神圣蒸馏器",
    "/items/celestial_enhancer": "星空强化器",
    "/items/cheese_enhancer": "奶酪强化器",
    "/items/verdant_enhancer": "翠绿强化器",
    "/items/azure_enhancer": "蔚蓝强化器",
    "/items/burble_enhancer": "深紫强化器",
    "/items/crimson_enhancer": "绛红强化器",
    "/items/rainbow_enhancer": "彩虹强化器",
    "/items/holy_enhancer": "神圣强化器",
    "/items/milk": "牛奶",
    "/items/verdant_milk": "翠绿牛奶",
    "/items/azure_milk": "蔚蓝牛奶",
    "/items/burble_milk": "深紫牛奶",
    "/items/crimson_milk": "绛红牛奶",
    "/items/rainbow_milk": "彩虹牛奶",
    "/items/holy_milk": "神圣牛奶",
    "/items/cheese": "奶酪",
    "/items/verdant_cheese": "翠绿奶酪",
    "/items/azure_cheese": "蔚蓝奶酪",
    "/items/burble_cheese": "深紫奶酪",
    "/items/crimson_cheese": "绛红奶酪",
    "/items/rainbow_cheese": "彩虹奶酪",
    "/items/holy_cheese": "神圣奶酪",
    "/items/log": "原木",
    "/items/birch_log": "白桦原木",
    "/items/cedar_log": "雪松原木",
    "/items/purpleheart_log": "紫心原木",
    "/items/ginkgo_log": "银杏原木",
    "/items/redwood_log": "红杉原木",
    "/items/arcane_log": "神秘原木",
    "/items/lumber": "木板",
    "/items/birch_lumber": "白桦木板",
    "/items/cedar_lumber": "雪松木板",
    "/items/purpleheart_lumber": "紫心木板",
    "/items/ginkgo_lumber": "银杏木板",
    "/items/redwood_lumber": "红杉木板",
    "/items/arcane_lumber": "神秘木板",
    "/items/rough_hide": "粗糙兽皮",
    "/items/reptile_hide": "爬行动物皮",
    "/items/gobo_hide": "哥布林皮",
    "/items/beast_hide": "野兽皮",
    "/items/umbral_hide": "暗影皮",
    "/items/rough_leather": "粗糙皮革",
    "/items/reptile_leather": "爬行动物皮革",
    "/items/gobo_leather": "哥布林皮革",
    "/items/beast_leather": "野兽皮革",
    "/items/umbral_leather": "暗影皮革",
    "/items/cotton": "棉花",
    "/items/flax": "亚麻",
    "/items/bamboo_branch": "竹子",
    "/items/cocoon": "蚕茧",
    "/items/radiant_fiber": "光辉纤维",
    "/items/cotton_fabric": "棉花布料",
    "/items/linen_fabric": "亚麻布料",
    "/items/bamboo_fabric": "竹子布料",
    "/items/silk_fabric": "丝绸",
    "/items/radiant_fabric": "光辉布料",
    "/items/egg": "鸡蛋",
    "/items/wheat": "小麦",
    "/items/sugar": "糖",
    "/items/blueberry": "蓝莓",
    "/items/blackberry": "黑莓",
    "/items/strawberry": "草莓",
    "/items/mooberry": "哞莓",
    "/items/marsberry": "火星莓",
    "/items/spaceberry": "太空莓",
    "/items/apple": "苹果",
    "/items/orange": "橙子",
    "/items/plum": "李子",
    "/items/peach": "桃子",
    "/items/dragon_fruit": "火龙果",
    "/items/star_fruit": "杨桃",
    "/items/arabica_coffee_bean": "低级咖啡豆",
    "/items/robusta_coffee_bean": "中级咖啡豆",
    "/items/liberica_coffee_bean": "高级咖啡豆",
    "/items/excelsa_coffee_bean": "特级咖啡豆",
    "/items/fieriosa_coffee_bean": "火山咖啡豆",
    "/items/spacia_coffee_bean": "太空咖啡豆",
    "/items/green_tea_leaf": "绿茶叶",
    "/items/black_tea_leaf": "黑茶叶",
    "/items/burble_tea_leaf": "紫茶叶",
    "/items/moolong_tea_leaf": "哞龙茶叶",
    "/items/red_tea_leaf": "红茶叶",
    "/items/emp_tea_leaf": "虚空茶叶",
    "/items/catalyst_of_coinification": "点金催化剂",
    "/items/catalyst_of_decomposition": "分解催化剂",
    "/items/catalyst_of_transmutation": "转化催化剂",
    "/items/prime_catalyst": "至高催化剂",
    "/items/snake_fang": "蛇牙",
    "/items/shoebill_feather": "鲸头鹳羽毛",
    "/items/snail_shell": "蜗牛壳",
    "/items/crab_pincer": "蟹钳",
    "/items/turtle_shell": "乌龟壳",
    "/items/marine_scale": "海洋鳞片",
    "/items/treant_bark": "树皮",
    "/items/centaur_hoof": "半人马蹄",
    "/items/luna_wing": "月神翼",
    "/items/gobo_rag": "哥布林抹布",
    "/items/goggles": "护目镜",
    "/items/magnifying_glass": "放大镜",
    "/items/eye_of_the_watcher": "观察者之眼",
    "/items/icy_cloth": "冰霜织物",
    "/items/flaming_cloth": "烈焰织物",
    "/items/sorcerers_sole": "魔法师鞋底",
    "/items/chrono_sphere": "时空球",
    "/items/frost_sphere": "冰霜球",
    "/items/panda_fluff": "熊猫绒",
    "/items/black_bear_fluff": "黑熊绒",
    "/items/grizzly_bear_fluff": "棕熊绒",
    "/items/polar_bear_fluff": "北极熊绒",
    "/items/red_panda_fluff": "小熊猫绒",
    "/items/magnet": "磁铁",
    "/items/stalactite_shard": "钟乳石碎片",
    "/items/living_granite": "花岗岩",
    "/items/colossus_core": "巨像核心",
    "/items/vampire_fang": "吸血鬼之牙",
    "/items/werewolf_claw": "狼人之爪",
    "/items/revenant_anima": "亡者之魂",
    "/items/soul_fragment": "灵魂碎片",
    "/items/infernal_ember": "地狱余烬",
    "/items/demonic_core": "恶魔核心",
    "/items/griffin_leather": "狮鹫之皮",
    "/items/manticore_sting": "蝎狮之刺",
    "/items/jackalope_antler": "鹿角兔之角",
    "/items/dodocamel_plume": "渡渡驼之翎",
    "/items/griffin_talon": "狮鹫之爪",
    "/items/chimerical_refinement_shard": "奇幻精炼碎片",
    "/items/acrobats_ribbon": "杂技师彩带",
    "/items/magicians_cloth": "魔术师织物",
    "/items/chaotic_chain": "混沌锁链",
    "/items/cursed_ball": "诅咒之球",
    "/items/sinister_refinement_shard": "阴森精炼碎片",
    "/items/royal_cloth": "皇家织物",
    "/items/knights_ingot": "骑士之锭",
    "/items/bishops_scroll": "主教卷轴",
    "/items/regal_jewel": "君王宝石",
    "/items/sundering_jewel": "裂空宝石",
    "/items/enchanted_refinement_shard": "秘法精炼碎片",
    "/items/marksman_brooch": "神射胸针",
    "/items/corsair_crest": "掠夺者徽章",
    "/items/damaged_anchor": "破损船锚",
    "/items/maelstrom_plating": "怒涛甲片",
    "/items/kraken_leather": "克拉肯皮革",
    "/items/kraken_fang": "克拉肯之牙",
    "/items/pirate_refinement_shard": "海盗精炼碎片",
    "/items/pathbreaker_lodestone": "开路者磁石",
    "/items/pathfinder_lodestone": "探路者磁石",
    "/items/pathseeker_lodestone": "寻路者磁石",
    "/items/labyrinth_refinement_shard": "迷宫精炼碎片",
    "/items/butter_of_proficiency": "精通之油",
    "/items/thread_of_expertise": "专精之线",
    "/items/branch_of_insight": "洞察之枝",
    "/items/gluttonous_energy": "贪食能量",
    "/items/guzzling_energy": "暴饮能量",
    "/items/milking_essence": "挤奶精华",
    "/items/foraging_essence": "采摘精华",
    "/items/woodcutting_essence": "伐木精华",
    "/items/cheesesmithing_essence": "奶酪锻造精华",
    "/items/crafting_essence": "制作精华",
    "/items/tailoring_essence": "缝纫精华",
    "/items/cooking_essence": "烹饪精华",
    "/items/brewing_essence": "冲泡精华",
    "/items/alchemy_essence": "炼金精华",
    "/items/enhancing_essence": "强化精华",
    "/items/swamp_essence": "沼泽精华",
    "/items/aqua_essence": "海洋精华",
    "/items/jungle_essence": "丛林精华",
    "/items/gobo_essence": "哥布林精华",
    "/items/eyessence": "眼精华",
    "/items/sorcerer_essence": "法师精华",
    "/items/bear_essence": "熊熊精华",
    "/items/golem_essence": "魔像精华",
    "/items/twilight_essence": "暮光精华",
    "/items/abyssal_essence": "地狱精华",
    "/items/chimerical_essence": "奇幻精华",
    "/items/sinister_essence": "阴森精华",
    "/items/enchanted_essence": "秘法精华",
    "/items/pirate_essence": "海盗精华",
    "/items/labyrinth_essence": "迷宫精华",
    "/items/task_crystal": "任务水晶",
    "/items/star_fragment": "星光碎片",
    "/items/pearl": "珍珠",
    "/items/amber": "琥珀",
    "/items/garnet": "石榴石",
    "/items/jade": "翡翠",
    "/items/amethyst": "紫水晶",
    "/items/moonstone": "月亮石",
    "/items/sunstone": "太阳石",
    "/items/philosophers_stone": "贤者之石",
    "/items/crushed_pearl": "珍珠碎片",
    "/items/crushed_amber": "琥珀碎片",
    "/items/crushed_garnet": "石榴石碎片",
    "/items/crushed_jade": "翡翠碎片",
    "/items/crushed_amethyst": "紫水晶碎片",
    "/items/crushed_moonstone": "月亮石碎片",
    "/items/crushed_sunstone": "太阳石碎片",
    "/items/crushed_philosophers_stone": "贤者之石碎片",
    "/items/shard_of_protection": "保护碎片",
    "/items/mirror_of_protection": "保护之镜",
    "/items/philosophers_mirror": "贤者之镜",
    "/items/basic_torch": "基础火把",
    "/items/advanced_torch": "进阶火把",
    "/items/expert_torch": "专家火把",
    "/items/basic_shroud": "基础斗篷",
    "/items/advanced_shroud": "进阶斗篷",
    "/items/expert_shroud": "专家斗篷",
    "/items/basic_beacon": "基础探照灯",
    "/items/advanced_beacon": "进阶探照灯",
    "/items/expert_beacon": "专家探照灯",
    "/items/basic_food_crate": "基础食物箱",
    "/items/advanced_food_crate": "进阶食物箱",
    "/items/expert_food_crate": "专家食物箱",
    "/items/basic_tea_crate": "基础茶叶箱",
    "/items/advanced_tea_crate": "进阶茶叶箱",
    "/items/expert_tea_crate": "专家茶叶箱",
    "/items/basic_coffee_crate": "基础咖啡箱",
    "/items/advanced_coffee_crate": "进阶咖啡箱",
    "/items/expert_coffee_crate": "专家咖啡箱"
  };
  var ZHActionNames = {
    "/actions/milking/cow": "奶牛",
    "/actions/milking/verdant_cow": "翠绿奶牛",
    "/actions/milking/azure_cow": "蔚蓝奶牛",
    "/actions/milking/burble_cow": "深紫奶牛",
    "/actions/milking/crimson_cow": "绛红奶牛",
    "/actions/milking/unicow": "彩虹奶牛",
    "/actions/milking/holy_cow": "神圣奶牛",
    "/actions/foraging/egg": "鸡蛋",
    "/actions/foraging/wheat": "小麦",
    "/actions/foraging/sugar": "糖",
    "/actions/foraging/cotton": "棉花",
    "/actions/foraging/farmland": "翠野农场",
    "/actions/foraging/blueberry": "蓝莓",
    "/actions/foraging/apple": "苹果",
    "/actions/foraging/arabica_coffee_bean": "低级咖啡豆",
    "/actions/foraging/flax": "亚麻",
    "/actions/foraging/shimmering_lake": "波光湖泊",
    "/actions/foraging/blackberry": "黑莓",
    "/actions/foraging/orange": "橙子",
    "/actions/foraging/robusta_coffee_bean": "中级咖啡豆",
    "/actions/foraging/misty_forest": "迷雾森林",
    "/actions/foraging/strawberry": "草莓",
    "/actions/foraging/plum": "李子",
    "/actions/foraging/liberica_coffee_bean": "高级咖啡豆",
    "/actions/foraging/bamboo_branch": "竹子",
    "/actions/foraging/burble_beach": "深紫沙滩",
    "/actions/foraging/mooberry": "哞莓",
    "/actions/foraging/peach": "桃子",
    "/actions/foraging/excelsa_coffee_bean": "特级咖啡豆",
    "/actions/foraging/cocoon": "蚕茧",
    "/actions/foraging/silly_cow_valley": "傻牛山谷",
    "/actions/foraging/marsberry": "火星莓",
    "/actions/foraging/dragon_fruit": "火龙果",
    "/actions/foraging/fieriosa_coffee_bean": "火山咖啡豆",
    "/actions/foraging/olympus_mons": "奥林匹斯山",
    "/actions/foraging/spaceberry": "太空莓",
    "/actions/foraging/star_fruit": "杨桃",
    "/actions/foraging/spacia_coffee_bean": "太空咖啡豆",
    "/actions/foraging/radiant_fiber": "光辉纤维",
    "/actions/foraging/asteroid_belt": "小行星带",
    "/actions/woodcutting/tree": "树",
    "/actions/woodcutting/birch_tree": "桦树",
    "/actions/woodcutting/cedar_tree": "雪松树",
    "/actions/woodcutting/purpleheart_tree": "紫心树",
    "/actions/woodcutting/ginkgo_tree": "银杏树",
    "/actions/woodcutting/redwood_tree": "红杉树",
    "/actions/woodcutting/arcane_tree": "奥秘树",
    "/actions/cheesesmithing/cheese": "奶酪",
    "/actions/cheesesmithing/cheese_boots": "奶酪靴",
    "/actions/cheesesmithing/cheese_gauntlets": "奶酪护手",
    "/actions/cheesesmithing/cheese_sword": "奶酪剑",
    "/actions/cheesesmithing/cheese_brush": "奶酪刷子",
    "/actions/cheesesmithing/cheese_shears": "奶酪剪刀",
    "/actions/cheesesmithing/cheese_hatchet": "奶酪斧头",
    "/actions/cheesesmithing/cheese_spear": "奶酪长枪",
    "/actions/cheesesmithing/cheese_hammer": "奶酪锤子",
    "/actions/cheesesmithing/cheese_chisel": "奶酪凿子",
    "/actions/cheesesmithing/cheese_needle": "奶酪针",
    "/actions/cheesesmithing/cheese_spatula": "奶酪锅铲",
    "/actions/cheesesmithing/cheese_pot": "奶酪壶",
    "/actions/cheesesmithing/cheese_mace": "奶酪钉头锤",
    "/actions/cheesesmithing/cheese_alembic": "奶酪蒸馏器",
    "/actions/cheesesmithing/cheese_enhancer": "奶酪强化器",
    "/actions/cheesesmithing/cheese_helmet": "奶酪头盔",
    "/actions/cheesesmithing/cheese_buckler": "奶酪圆盾",
    "/actions/cheesesmithing/cheese_bulwark": "奶酪重盾",
    "/actions/cheesesmithing/cheese_plate_legs": "奶酪腿甲",
    "/actions/cheesesmithing/cheese_plate_body": "奶酪胸甲",
    "/actions/cheesesmithing/verdant_cheese": "翠绿奶酪",
    "/actions/cheesesmithing/verdant_boots": "翠绿靴",
    "/actions/cheesesmithing/verdant_gauntlets": "翠绿护手",
    "/actions/cheesesmithing/verdant_sword": "翠绿剑",
    "/actions/cheesesmithing/verdant_brush": "翠绿刷子",
    "/actions/cheesesmithing/verdant_shears": "翠绿剪刀",
    "/actions/cheesesmithing/verdant_hatchet": "翠绿斧头",
    "/actions/cheesesmithing/verdant_spear": "翠绿长枪",
    "/actions/cheesesmithing/verdant_hammer": "翠绿锤子",
    "/actions/cheesesmithing/verdant_chisel": "翠绿凿子",
    "/actions/cheesesmithing/verdant_needle": "翠绿针",
    "/actions/cheesesmithing/verdant_spatula": "翠绿锅铲",
    "/actions/cheesesmithing/verdant_pot": "翠绿壶",
    "/actions/cheesesmithing/verdant_mace": "翠绿钉头锤",
    "/actions/cheesesmithing/snake_fang_dirk": "蛇牙短剑",
    "/actions/cheesesmithing/verdant_alembic": "翠绿蒸馏器",
    "/actions/cheesesmithing/verdant_enhancer": "翠绿强化器",
    "/actions/cheesesmithing/verdant_helmet": "翠绿头盔",
    "/actions/cheesesmithing/verdant_buckler": "翠绿圆盾",
    "/actions/cheesesmithing/verdant_bulwark": "翠绿重盾",
    "/actions/cheesesmithing/verdant_plate_legs": "翠绿腿甲",
    "/actions/cheesesmithing/verdant_plate_body": "翠绿胸甲",
    "/actions/cheesesmithing/azure_cheese": "蔚蓝奶酪",
    "/actions/cheesesmithing/azure_boots": "蔚蓝靴",
    "/actions/cheesesmithing/basic_beacon": "基础探照灯",
    "/actions/cheesesmithing/azure_gauntlets": "蔚蓝护手",
    "/actions/cheesesmithing/azure_sword": "蔚蓝剑",
    "/actions/cheesesmithing/azure_brush": "蔚蓝刷子",
    "/actions/cheesesmithing/azure_shears": "蔚蓝剪刀",
    "/actions/cheesesmithing/azure_hatchet": "蔚蓝斧头",
    "/actions/cheesesmithing/azure_spear": "蔚蓝长枪",
    "/actions/cheesesmithing/azure_hammer": "蔚蓝锤子",
    "/actions/cheesesmithing/azure_chisel": "蔚蓝凿子",
    "/actions/cheesesmithing/azure_needle": "蔚蓝针",
    "/actions/cheesesmithing/azure_spatula": "蔚蓝锅铲",
    "/actions/cheesesmithing/azure_pot": "蔚蓝壶",
    "/actions/cheesesmithing/azure_mace": "蔚蓝钉头锤",
    "/actions/cheesesmithing/pincer_gloves": "蟹钳手套",
    "/actions/cheesesmithing/azure_alembic": "蔚蓝蒸馏器",
    "/actions/cheesesmithing/azure_enhancer": "蔚蓝强化器",
    "/actions/cheesesmithing/azure_helmet": "蔚蓝头盔",
    "/actions/cheesesmithing/azure_buckler": "蔚蓝圆盾",
    "/actions/cheesesmithing/azure_bulwark": "蔚蓝重盾",
    "/actions/cheesesmithing/azure_plate_legs": "蔚蓝腿甲",
    "/actions/cheesesmithing/snail_shell_helmet": "蜗牛壳头盔",
    "/actions/cheesesmithing/azure_plate_body": "蔚蓝胸甲",
    "/actions/cheesesmithing/turtle_shell_legs": "龟壳腿甲",
    "/actions/cheesesmithing/turtle_shell_body": "龟壳胸甲",
    "/actions/cheesesmithing/burble_cheese": "深紫奶酪",
    "/actions/cheesesmithing/burble_boots": "深紫靴",
    "/actions/cheesesmithing/burble_gauntlets": "深紫护手",
    "/actions/cheesesmithing/burble_sword": "深紫剑",
    "/actions/cheesesmithing/burble_brush": "深紫刷子",
    "/actions/cheesesmithing/burble_shears": "深紫剪刀",
    "/actions/cheesesmithing/burble_hatchet": "深紫斧头",
    "/actions/cheesesmithing/burble_spear": "深紫长枪",
    "/actions/cheesesmithing/burble_hammer": "深紫锤子",
    "/actions/cheesesmithing/burble_chisel": "深紫凿子",
    "/actions/cheesesmithing/burble_needle": "深紫针",
    "/actions/cheesesmithing/burble_spatula": "深紫锅铲",
    "/actions/cheesesmithing/burble_pot": "深紫壶",
    "/actions/cheesesmithing/burble_mace": "深紫钉头锤",
    "/actions/cheesesmithing/burble_alembic": "深紫蒸馏器",
    "/actions/cheesesmithing/burble_enhancer": "深紫强化器",
    "/actions/cheesesmithing/burble_helmet": "深紫头盔",
    "/actions/cheesesmithing/burble_buckler": "深紫圆盾",
    "/actions/cheesesmithing/burble_bulwark": "深紫重盾",
    "/actions/cheesesmithing/burble_plate_legs": "深紫腿甲",
    "/actions/cheesesmithing/burble_plate_body": "深紫胸甲",
    "/actions/cheesesmithing/crimson_cheese": "绛红奶酪",
    "/actions/cheesesmithing/crimson_boots": "绛红靴",
    "/actions/cheesesmithing/advanced_beacon": "进阶探照灯",
    "/actions/cheesesmithing/crimson_gauntlets": "绛红护手",
    "/actions/cheesesmithing/crimson_sword": "绛红剑",
    "/actions/cheesesmithing/crimson_brush": "绛红刷子",
    "/actions/cheesesmithing/crimson_shears": "绛红剪刀",
    "/actions/cheesesmithing/crimson_hatchet": "绛红斧头",
    "/actions/cheesesmithing/crimson_spear": "绛红长枪",
    "/actions/cheesesmithing/crimson_hammer": "绛红锤子",
    "/actions/cheesesmithing/crimson_chisel": "绛红凿子",
    "/actions/cheesesmithing/crimson_needle": "绛红针",
    "/actions/cheesesmithing/crimson_spatula": "绛红锅铲",
    "/actions/cheesesmithing/crimson_pot": "绛红壶",
    "/actions/cheesesmithing/crimson_mace": "绛红钉头锤",
    "/actions/cheesesmithing/crimson_alembic": "绛红蒸馏器",
    "/actions/cheesesmithing/crimson_enhancer": "绛红强化器",
    "/actions/cheesesmithing/crimson_helmet": "绛红头盔",
    "/actions/cheesesmithing/crimson_buckler": "绛红圆盾",
    "/actions/cheesesmithing/crimson_bulwark": "绛红重盾",
    "/actions/cheesesmithing/crimson_plate_legs": "绛红腿甲",
    "/actions/cheesesmithing/vision_helmet": "视觉头盔",
    "/actions/cheesesmithing/vision_shield": "视觉盾",
    "/actions/cheesesmithing/crimson_plate_body": "绛红胸甲",
    "/actions/cheesesmithing/rainbow_cheese": "彩虹奶酪",
    "/actions/cheesesmithing/rainbow_boots": "彩虹靴",
    "/actions/cheesesmithing/black_bear_shoes": "黑熊鞋",
    "/actions/cheesesmithing/grizzly_bear_shoes": "棕熊鞋",
    "/actions/cheesesmithing/polar_bear_shoes": "北极熊鞋",
    "/actions/cheesesmithing/rainbow_gauntlets": "彩虹护手",
    "/actions/cheesesmithing/rainbow_sword": "彩虹剑",
    "/actions/cheesesmithing/panda_gloves": "熊猫手套",
    "/actions/cheesesmithing/rainbow_brush": "彩虹刷子",
    "/actions/cheesesmithing/rainbow_shears": "彩虹剪刀",
    "/actions/cheesesmithing/rainbow_hatchet": "彩虹斧头",
    "/actions/cheesesmithing/rainbow_spear": "彩虹长枪",
    "/actions/cheesesmithing/rainbow_hammer": "彩虹锤子",
    "/actions/cheesesmithing/rainbow_chisel": "彩虹凿子",
    "/actions/cheesesmithing/rainbow_needle": "彩虹针",
    "/actions/cheesesmithing/rainbow_spatula": "彩虹锅铲",
    "/actions/cheesesmithing/rainbow_pot": "彩虹壶",
    "/actions/cheesesmithing/rainbow_mace": "彩虹钉头锤",
    "/actions/cheesesmithing/rainbow_alembic": "彩虹蒸馏器",
    "/actions/cheesesmithing/rainbow_enhancer": "彩虹强化器",
    "/actions/cheesesmithing/rainbow_helmet": "彩虹头盔",
    "/actions/cheesesmithing/rainbow_buckler": "彩虹圆盾",
    "/actions/cheesesmithing/rainbow_bulwark": "彩虹重盾",
    "/actions/cheesesmithing/rainbow_plate_legs": "彩虹腿甲",
    "/actions/cheesesmithing/rainbow_plate_body": "彩虹胸甲",
    "/actions/cheesesmithing/holy_cheese": "神圣奶酪",
    "/actions/cheesesmithing/holy_boots": "神圣靴",
    "/actions/cheesesmithing/expert_beacon": "专家探照灯",
    "/actions/cheesesmithing/holy_gauntlets": "神圣护手",
    "/actions/cheesesmithing/holy_sword": "神圣剑",
    "/actions/cheesesmithing/holy_brush": "神圣刷子",
    "/actions/cheesesmithing/holy_shears": "神圣剪刀",
    "/actions/cheesesmithing/holy_hatchet": "神圣斧头",
    "/actions/cheesesmithing/holy_spear": "神圣长枪",
    "/actions/cheesesmithing/holy_hammer": "神圣锤子",
    "/actions/cheesesmithing/holy_chisel": "神圣凿子",
    "/actions/cheesesmithing/holy_needle": "神圣针",
    "/actions/cheesesmithing/holy_spatula": "神圣锅铲",
    "/actions/cheesesmithing/holy_pot": "神圣壶",
    "/actions/cheesesmithing/holy_mace": "神圣钉头锤",
    "/actions/cheesesmithing/magnetic_gloves": "磁力手套",
    "/actions/cheesesmithing/stalactite_spear": "石钟长枪",
    "/actions/cheesesmithing/granite_bludgeon": "花岗岩大棒",
    "/actions/cheesesmithing/vampire_fang_dirk": "吸血鬼短剑",
    "/actions/cheesesmithing/werewolf_slasher": "狼人关刀",
    "/actions/cheesesmithing/holy_alembic": "神圣蒸馏器",
    "/actions/cheesesmithing/holy_enhancer": "神圣强化器",
    "/actions/cheesesmithing/holy_helmet": "神圣头盔",
    "/actions/cheesesmithing/holy_buckler": "神圣圆盾",
    "/actions/cheesesmithing/holy_bulwark": "神圣重盾",
    "/actions/cheesesmithing/holy_plate_legs": "神圣腿甲",
    "/actions/cheesesmithing/holy_plate_body": "神圣胸甲",
    "/actions/cheesesmithing/celestial_brush": "星空刷子",
    "/actions/cheesesmithing/celestial_shears": "星空剪刀",
    "/actions/cheesesmithing/celestial_hatchet": "星空斧头",
    "/actions/cheesesmithing/celestial_hammer": "星空锤子",
    "/actions/cheesesmithing/celestial_chisel": "星空凿子",
    "/actions/cheesesmithing/celestial_needle": "星空针",
    "/actions/cheesesmithing/celestial_spatula": "星空锅铲",
    "/actions/cheesesmithing/celestial_pot": "星空壶",
    "/actions/cheesesmithing/celestial_alembic": "星空蒸馏器",
    "/actions/cheesesmithing/celestial_enhancer": "星空强化器",
    "/actions/cheesesmithing/colossus_plate_body": "巨像胸甲",
    "/actions/cheesesmithing/colossus_plate_legs": "巨像腿甲",
    "/actions/cheesesmithing/demonic_plate_body": "恶魔胸甲",
    "/actions/cheesesmithing/demonic_plate_legs": "恶魔腿甲",
    "/actions/cheesesmithing/spiked_bulwark": "尖刺重盾",
    "/actions/cheesesmithing/pathbreaker_boots": "开路者靴",
    "/actions/cheesesmithing/dodocamel_gauntlets": "渡渡驼护手",
    "/actions/cheesesmithing/corsair_helmet": "掠夺者头盔",
    "/actions/cheesesmithing/knights_aegis": "骑士盾",
    "/actions/cheesesmithing/anchorbound_plate_legs": "锚定腿甲",
    "/actions/cheesesmithing/maelstrom_plate_legs": "怒涛腿甲",
    "/actions/cheesesmithing/griffin_bulwark": "狮鹫重盾",
    "/actions/cheesesmithing/furious_spear": "狂怒长枪",
    "/actions/cheesesmithing/chaotic_flail": "混沌连枷",
    "/actions/cheesesmithing/regal_sword": "君王之剑",
    "/actions/cheesesmithing/anchorbound_plate_body": "锚定胸甲",
    "/actions/cheesesmithing/maelstrom_plate_body": "怒涛胸甲",
    "/actions/cheesesmithing/pathbreaker_boots_refined": "开路者靴 ★",
    "/actions/cheesesmithing/dodocamel_gauntlets_refined": "渡渡驼护手 ★",
    "/actions/cheesesmithing/corsair_helmet_refined": "掠夺者头盔 ★",
    "/actions/cheesesmithing/knights_aegis_refined": "骑士盾 ★",
    "/actions/cheesesmithing/anchorbound_plate_legs_refined": "锚定腿甲 ★",
    "/actions/cheesesmithing/maelstrom_plate_legs_refined": "怒涛腿甲 ★",
    "/actions/cheesesmithing/griffin_bulwark_refined": "狮鹫重盾 ★",
    "/actions/cheesesmithing/furious_spear_refined": "狂怒长枪 ★",
    "/actions/cheesesmithing/chaotic_flail_refined": "混沌连枷 ★",
    "/actions/cheesesmithing/regal_sword_refined": "君王之剑 ★",
    "/actions/cheesesmithing/anchorbound_plate_body_refined": "锚定胸甲 ★",
    "/actions/cheesesmithing/maelstrom_plate_body_refined": "怒涛胸甲 ★",
    "/actions/crafting/lumber": "木板",
    "/actions/crafting/wooden_crossbow": "木弩",
    "/actions/crafting/wooden_water_staff": "木制水法杖",
    "/actions/crafting/basic_task_badge": "基础任务徽章",
    "/actions/crafting/advanced_task_badge": "高级任务徽章",
    "/actions/crafting/expert_task_badge": "专家任务徽章",
    "/actions/crafting/wooden_shield": "木盾",
    "/actions/crafting/wooden_nature_staff": "木制自然法杖",
    "/actions/crafting/wooden_bow": "木弓",
    "/actions/crafting/wooden_fire_staff": "木制火法杖",
    "/actions/crafting/birch_lumber": "白桦木板",
    "/actions/crafting/birch_crossbow": "桦木弩",
    "/actions/crafting/birch_water_staff": "桦木水法杖",
    "/actions/crafting/crushed_pearl": "珍珠碎片",
    "/actions/crafting/birch_shield": "桦木盾",
    "/actions/crafting/birch_nature_staff": "桦木自然法杖",
    "/actions/crafting/birch_bow": "桦木弓",
    "/actions/crafting/ring_of_gathering": "采集戒指",
    "/actions/crafting/birch_fire_staff": "桦木火法杖",
    "/actions/crafting/earrings_of_gathering": "采集耳环",
    "/actions/crafting/cedar_lumber": "雪松木板",
    "/actions/crafting/cedar_crossbow": "雪松弩",
    "/actions/crafting/cedar_water_staff": "雪松水法杖",
    "/actions/crafting/basic_milking_charm": "基础挤奶护符",
    "/actions/crafting/basic_foraging_charm": "基础采摘护符",
    "/actions/crafting/basic_woodcutting_charm": "基础伐木护符",
    "/actions/crafting/basic_cheesesmithing_charm": "基础奶酪锻造护符",
    "/actions/crafting/basic_crafting_charm": "基础制作护符",
    "/actions/crafting/basic_tailoring_charm": "基础缝纫护符",
    "/actions/crafting/basic_cooking_charm": "基础烹饪护符",
    "/actions/crafting/basic_brewing_charm": "基础冲泡护符",
    "/actions/crafting/basic_alchemy_charm": "基础炼金护符",
    "/actions/crafting/basic_enhancing_charm": "基础强化护符",
    "/actions/crafting/basic_torch": "基础火把",
    "/actions/crafting/cedar_shield": "雪松盾",
    "/actions/crafting/cedar_nature_staff": "雪松自然法杖",
    "/actions/crafting/cedar_bow": "雪松弓",
    "/actions/crafting/crushed_amber": "琥珀碎片",
    "/actions/crafting/cedar_fire_staff": "雪松火法杖",
    "/actions/crafting/ring_of_essence_find": "精华发现戒指",
    "/actions/crafting/earrings_of_essence_find": "精华发现耳环",
    "/actions/crafting/necklace_of_efficiency": "效率项链",
    "/actions/crafting/purpleheart_lumber": "紫心木板",
    "/actions/crafting/purpleheart_crossbow": "紫心弩",
    "/actions/crafting/purpleheart_water_staff": "紫心水法杖",
    "/actions/crafting/purpleheart_shield": "紫心盾",
    "/actions/crafting/purpleheart_nature_staff": "紫心自然法杖",
    "/actions/crafting/purpleheart_bow": "紫心弓",
    "/actions/crafting/advanced_milking_charm": "高级挤奶护符",
    "/actions/crafting/advanced_foraging_charm": "高级采摘护符",
    "/actions/crafting/advanced_woodcutting_charm": "高级伐木护符",
    "/actions/crafting/advanced_cheesesmithing_charm": "高级奶酪锻造护符",
    "/actions/crafting/advanced_crafting_charm": "高级制作护符",
    "/actions/crafting/advanced_tailoring_charm": "高级缝纫护符",
    "/actions/crafting/advanced_cooking_charm": "高级烹饪护符",
    "/actions/crafting/advanced_brewing_charm": "高级冲泡护符",
    "/actions/crafting/advanced_alchemy_charm": "高级炼金护符",
    "/actions/crafting/advanced_enhancing_charm": "高级强化护符",
    "/actions/crafting/advanced_stamina_charm": "高级耐力护符",
    "/actions/crafting/advanced_intelligence_charm": "高级智力护符",
    "/actions/crafting/advanced_attack_charm": "高级攻击护符",
    "/actions/crafting/advanced_defense_charm": "高级防御护符",
    "/actions/crafting/advanced_melee_charm": "高级近战护符",
    "/actions/crafting/advanced_ranged_charm": "高级远程护符",
    "/actions/crafting/advanced_magic_charm": "高级魔法护符",
    "/actions/crafting/crushed_garnet": "石榴石碎片",
    "/actions/crafting/crushed_jade": "翡翠碎片",
    "/actions/crafting/crushed_amethyst": "紫水晶碎片",
    "/actions/crafting/catalyst_of_coinification": "点金催化剂",
    "/actions/crafting/treant_shield": "树人盾",
    "/actions/crafting/purpleheart_fire_staff": "紫心火法杖",
    "/actions/crafting/ring_of_regeneration": "恢复戒指",
    "/actions/crafting/earrings_of_regeneration": "恢复耳环",
    "/actions/crafting/fighter_necklace": "战士项链",
    "/actions/crafting/ginkgo_lumber": "银杏木板",
    "/actions/crafting/ginkgo_crossbow": "银杏弩",
    "/actions/crafting/ginkgo_water_staff": "银杏水法杖",
    "/actions/crafting/ring_of_armor": "护甲戒指",
    "/actions/crafting/catalyst_of_decomposition": "分解催化剂",
    "/actions/crafting/advanced_torch": "进阶火把",
    "/actions/crafting/ginkgo_shield": "银杏盾",
    "/actions/crafting/earrings_of_armor": "护甲耳环",
    "/actions/crafting/ginkgo_nature_staff": "银杏自然法杖",
    "/actions/crafting/ranger_necklace": "射手项链",
    "/actions/crafting/ginkgo_bow": "银杏弓",
    "/actions/crafting/ring_of_resistance": "抗性戒指",
    "/actions/crafting/crushed_moonstone": "月亮石碎片",
    "/actions/crafting/ginkgo_fire_staff": "银杏火法杖",
    "/actions/crafting/earrings_of_resistance": "抗性耳环",
    "/actions/crafting/wizard_necklace": "巫师项链",
    "/actions/crafting/ring_of_rare_find": "稀有发现戒指",
    "/actions/crafting/expert_milking_charm": "专家挤奶护符",
    "/actions/crafting/expert_foraging_charm": "专家采摘护符",
    "/actions/crafting/expert_woodcutting_charm": "专家伐木护符",
    "/actions/crafting/expert_cheesesmithing_charm": "专家奶酪锻造护符",
    "/actions/crafting/expert_crafting_charm": "专家制作护符",
    "/actions/crafting/expert_tailoring_charm": "专家缝纫护符",
    "/actions/crafting/expert_cooking_charm": "专家烹饪护符",
    "/actions/crafting/expert_brewing_charm": "专家冲泡护符",
    "/actions/crafting/expert_alchemy_charm": "专家炼金护符",
    "/actions/crafting/expert_enhancing_charm": "专家强化护符",
    "/actions/crafting/expert_stamina_charm": "专家耐力护符",
    "/actions/crafting/expert_intelligence_charm": "专家智力护符",
    "/actions/crafting/expert_attack_charm": "专家攻击护符",
    "/actions/crafting/expert_defense_charm": "专家防御护符",
    "/actions/crafting/expert_melee_charm": "专家近战护符",
    "/actions/crafting/expert_ranged_charm": "专家远程护符",
    "/actions/crafting/expert_magic_charm": "专家魔法护符",
    "/actions/crafting/catalyst_of_transmutation": "转化催化剂",
    "/actions/crafting/earrings_of_rare_find": "稀有发现耳环",
    "/actions/crafting/necklace_of_wisdom": "经验项链",
    "/actions/crafting/redwood_lumber": "红杉木板",
    "/actions/crafting/redwood_crossbow": "红杉弩",
    "/actions/crafting/redwood_water_staff": "红杉水法杖",
    "/actions/crafting/redwood_shield": "红杉盾",
    "/actions/crafting/redwood_nature_staff": "红杉自然法杖",
    "/actions/crafting/redwood_bow": "红杉弓",
    "/actions/crafting/crushed_sunstone": "太阳石碎片",
    "/actions/crafting/chimerical_entry_key": "奇幻钥匙",
    "/actions/crafting/chimerical_chest_key": "奇幻宝箱钥匙",
    "/actions/crafting/eye_watch": "掌上监工",
    "/actions/crafting/watchful_relic": "警戒遗物",
    "/actions/crafting/redwood_fire_staff": "红杉火法杖",
    "/actions/crafting/ring_of_critical_strike": "暴击戒指",
    "/actions/crafting/mirror_of_protection": "保护之镜",
    "/actions/crafting/earrings_of_critical_strike": "暴击耳环",
    "/actions/crafting/necklace_of_speed": "速度项链",
    "/actions/crafting/arcane_lumber": "神秘木板",
    "/actions/crafting/arcane_crossbow": "神秘弩",
    "/actions/crafting/arcane_water_staff": "神秘水法杖",
    "/actions/crafting/master_milking_charm": "大师挤奶护符",
    "/actions/crafting/master_foraging_charm": "大师采摘护符",
    "/actions/crafting/master_woodcutting_charm": "大师伐木护符",
    "/actions/crafting/master_cheesesmithing_charm": "大师奶酪锻造护符",
    "/actions/crafting/master_crafting_charm": "大师制作护符",
    "/actions/crafting/master_tailoring_charm": "大师缝纫护符",
    "/actions/crafting/master_cooking_charm": "大师烹饪护符",
    "/actions/crafting/master_brewing_charm": "大师冲泡护符",
    "/actions/crafting/master_alchemy_charm": "大师炼金护符",
    "/actions/crafting/master_enhancing_charm": "大师强化护符",
    "/actions/crafting/master_stamina_charm": "大师耐力护符",
    "/actions/crafting/master_intelligence_charm": "大师智力护符",
    "/actions/crafting/master_attack_charm": "大师攻击护符",
    "/actions/crafting/master_defense_charm": "大师防御护符",
    "/actions/crafting/master_melee_charm": "大师近战护符",
    "/actions/crafting/master_ranged_charm": "大师远程护符",
    "/actions/crafting/master_magic_charm": "大师魔法护符",
    "/actions/crafting/sinister_entry_key": "阴森钥匙",
    "/actions/crafting/sinister_chest_key": "阴森宝箱钥匙",
    "/actions/crafting/expert_torch": "专家火把",
    "/actions/crafting/arcane_shield": "神秘盾",
    "/actions/crafting/arcane_nature_staff": "神秘自然法杖",
    "/actions/crafting/manticore_shield": "蝎狮盾",
    "/actions/crafting/arcane_bow": "神秘弓",
    "/actions/crafting/enchanted_entry_key": "秘法钥匙",
    "/actions/crafting/enchanted_chest_key": "秘法宝箱钥匙",
    "/actions/crafting/pirate_entry_key": "海盗钥匙",
    "/actions/crafting/pirate_chest_key": "海盗宝箱钥匙",
    "/actions/crafting/arcane_fire_staff": "神秘火法杖",
    "/actions/crafting/vampiric_bow": "吸血弓",
    "/actions/crafting/soul_hunter_crossbow": "灵魂猎手弩",
    "/actions/crafting/frost_staff": "冰霜法杖",
    "/actions/crafting/infernal_battlestaff": "炼狱法杖",
    "/actions/crafting/jackalope_staff": "鹿角兔之杖",
    "/actions/crafting/philosophers_ring": "贤者戒指",
    "/actions/crafting/crushed_philosophers_stone": "贤者之石碎片",
    "/actions/crafting/philosophers_earrings": "贤者耳环",
    "/actions/crafting/philosophers_necklace": "贤者项链",
    "/actions/crafting/bishops_codex": "主教法典",
    "/actions/crafting/cursed_bow": "咒怨之弓",
    "/actions/crafting/sundering_crossbow": "裂空之弩",
    "/actions/crafting/rippling_trident": "涟漪三叉戟",
    "/actions/crafting/blooming_trident": "绽放三叉戟",
    "/actions/crafting/blazing_trident": "炽焰三叉戟",
    "/actions/crafting/grandmaster_milking_charm": "宗师挤奶护符",
    "/actions/crafting/grandmaster_foraging_charm": "宗师采摘护符",
    "/actions/crafting/grandmaster_woodcutting_charm": "宗师伐木护符",
    "/actions/crafting/grandmaster_cheesesmithing_charm": "宗师奶酪锻造护符",
    "/actions/crafting/grandmaster_crafting_charm": "宗师制作护符",
    "/actions/crafting/grandmaster_tailoring_charm": "宗师缝纫护符",
    "/actions/crafting/grandmaster_cooking_charm": "宗师烹饪护符",
    "/actions/crafting/grandmaster_brewing_charm": "宗师冲泡护符",
    "/actions/crafting/grandmaster_alchemy_charm": "宗师炼金护符",
    "/actions/crafting/grandmaster_enhancing_charm": "宗师强化护符",
    "/actions/crafting/grandmaster_stamina_charm": "宗师耐力护符",
    "/actions/crafting/grandmaster_intelligence_charm": "宗师智力护符",
    "/actions/crafting/grandmaster_attack_charm": "宗师攻击护符",
    "/actions/crafting/grandmaster_defense_charm": "宗师防御护符",
    "/actions/crafting/grandmaster_melee_charm": "宗师近战护符",
    "/actions/crafting/grandmaster_ranged_charm": "宗师远程护符",
    "/actions/crafting/grandmaster_magic_charm": "宗师魔法护符",
    "/actions/crafting/philosophers_mirror": "贤者之镜",
    "/actions/crafting/bishops_codex_refined": "主教法典 ★",
    "/actions/crafting/cursed_bow_refined": "咒怨之弓 ★",
    "/actions/crafting/sundering_crossbow_refined": "裂空之弩 ★",
    "/actions/crafting/rippling_trident_refined": "涟漪三叉戟 ★",
    "/actions/crafting/blooming_trident_refined": "绽放三叉戟 ★",
    "/actions/crafting/blazing_trident_refined": "炽焰三叉戟 ★",
    "/actions/tailoring/rough_leather": "粗糙皮革",
    "/actions/tailoring/cotton_fabric": "棉花布料",
    "/actions/tailoring/rough_boots": "粗糙靴",
    "/actions/tailoring/cotton_boots": "棉靴",
    "/actions/tailoring/rough_bracers": "粗糙护腕",
    "/actions/tailoring/cotton_gloves": "棉手套",
    "/actions/tailoring/small_pouch": "小袋子",
    "/actions/tailoring/rough_hood": "粗糙兜帽",
    "/actions/tailoring/cotton_hat": "棉帽",
    "/actions/tailoring/rough_chaps": "粗糙皮裤",
    "/actions/tailoring/cotton_robe_bottoms": "棉袍裙",
    "/actions/tailoring/rough_tunic": "粗糙皮衣",
    "/actions/tailoring/cotton_robe_top": "棉袍服",
    "/actions/tailoring/reptile_leather": "爬行动物皮革",
    "/actions/tailoring/linen_fabric": "亚麻布料",
    "/actions/tailoring/reptile_boots": "爬行动物靴",
    "/actions/tailoring/linen_boots": "亚麻靴",
    "/actions/tailoring/reptile_bracers": "爬行动物护腕",
    "/actions/tailoring/linen_gloves": "亚麻手套",
    "/actions/tailoring/basic_shroud": "基础斗篷",
    "/actions/tailoring/reptile_hood": "爬行动物兜帽",
    "/actions/tailoring/linen_hat": "亚麻帽",
    "/actions/tailoring/reptile_chaps": "爬行动物皮裤",
    "/actions/tailoring/linen_robe_bottoms": "亚麻袍裙",
    "/actions/tailoring/medium_pouch": "中袋子",
    "/actions/tailoring/reptile_tunic": "爬行动物皮衣",
    "/actions/tailoring/linen_robe_top": "亚麻袍服",
    "/actions/tailoring/shoebill_shoes": "鲸头鹳鞋",
    "/actions/tailoring/gobo_leather": "哥布林皮革",
    "/actions/tailoring/bamboo_fabric": "竹子布料",
    "/actions/tailoring/gobo_boots": "哥布林靴",
    "/actions/tailoring/bamboo_boots": "竹靴",
    "/actions/tailoring/gobo_bracers": "哥布林护腕",
    "/actions/tailoring/bamboo_gloves": "竹手套",
    "/actions/tailoring/gobo_hood": "哥布林兜帽",
    "/actions/tailoring/bamboo_hat": "竹帽",
    "/actions/tailoring/gobo_chaps": "哥布林皮裤",
    "/actions/tailoring/bamboo_robe_bottoms": "竹袍裙",
    "/actions/tailoring/large_pouch": "大袋子",
    "/actions/tailoring/gobo_tunic": "哥布林皮衣",
    "/actions/tailoring/bamboo_robe_top": "竹袍服",
    "/actions/tailoring/marine_tunic": "海洋皮衣",
    "/actions/tailoring/marine_chaps": "航海皮裤",
    "/actions/tailoring/icy_robe_top": "冰霜袍服",
    "/actions/tailoring/icy_robe_bottoms": "冰霜袍裙",
    "/actions/tailoring/flaming_robe_top": "烈焰袍服",
    "/actions/tailoring/flaming_robe_bottoms": "烈焰袍裙",
    "/actions/tailoring/advanced_shroud": "进阶斗篷",
    "/actions/tailoring/beast_leather": "野兽皮革",
    "/actions/tailoring/silk_fabric": "丝绸",
    "/actions/tailoring/beast_boots": "野兽靴",
    "/actions/tailoring/silk_boots": "丝靴",
    "/actions/tailoring/beast_bracers": "野兽护腕",
    "/actions/tailoring/silk_gloves": "丝手套",
    "/actions/tailoring/collectors_boots": "收藏家靴",
    "/actions/tailoring/sighted_bracers": "瞄准护腕",
    "/actions/tailoring/beast_hood": "野兽兜帽",
    "/actions/tailoring/silk_hat": "丝帽",
    "/actions/tailoring/beast_chaps": "野兽皮裤",
    "/actions/tailoring/silk_robe_bottoms": "丝绸袍裙",
    "/actions/tailoring/centaur_boots": "半人马靴",
    "/actions/tailoring/sorcerer_boots": "巫师靴",
    "/actions/tailoring/giant_pouch": "巨大袋子",
    "/actions/tailoring/beast_tunic": "野兽皮衣",
    "/actions/tailoring/silk_robe_top": "丝绸袍服",
    "/actions/tailoring/red_culinary_hat": "红色厨师帽",
    "/actions/tailoring/luna_robe_top": "月神袍服",
    "/actions/tailoring/luna_robe_bottoms": "月神袍裙",
    "/actions/tailoring/umbral_leather": "暗影皮革",
    "/actions/tailoring/radiant_fabric": "光辉布料",
    "/actions/tailoring/umbral_boots": "暗影靴",
    "/actions/tailoring/radiant_boots": "光辉靴",
    "/actions/tailoring/umbral_bracers": "暗影护腕",
    "/actions/tailoring/radiant_gloves": "光辉手套",
    "/actions/tailoring/enchanted_gloves": "附魔手套",
    "/actions/tailoring/fluffy_red_hat": "蓬松红帽子",
    "/actions/tailoring/chrono_gloves": "时空手套",
    "/actions/tailoring/expert_shroud": "专家斗篷",
    "/actions/tailoring/umbral_hood": "暗影兜帽",
    "/actions/tailoring/radiant_hat": "光辉帽",
    "/actions/tailoring/umbral_chaps": "暗影皮裤",
    "/actions/tailoring/radiant_robe_bottoms": "光辉袍裙",
    "/actions/tailoring/umbral_tunic": "暗影皮衣",
    "/actions/tailoring/radiant_robe_top": "光辉袍服",
    "/actions/tailoring/revenant_chaps": "亡灵皮裤",
    "/actions/tailoring/griffin_chaps": "狮鹫皮裤",
    "/actions/tailoring/dairyhands_top": "挤奶工上衣",
    "/actions/tailoring/dairyhands_bottoms": "挤奶工下装",
    "/actions/tailoring/foragers_top": "采摘者上衣",
    "/actions/tailoring/foragers_bottoms": "采摘者下装",
    "/actions/tailoring/lumberjacks_top": "伐木工上衣",
    "/actions/tailoring/lumberjacks_bottoms": "伐木工下装",
    "/actions/tailoring/cheesemakers_top": "奶酪师上衣",
    "/actions/tailoring/cheesemakers_bottoms": "奶酪师下装",
    "/actions/tailoring/crafters_top": "工匠上衣",
    "/actions/tailoring/crafters_bottoms": "工匠下装",
    "/actions/tailoring/tailors_top": "裁缝上衣",
    "/actions/tailoring/tailors_bottoms": "裁缝下装",
    "/actions/tailoring/chefs_top": "厨师上衣",
    "/actions/tailoring/chefs_bottoms": "厨师下装",
    "/actions/tailoring/brewers_top": "饮品师上衣",
    "/actions/tailoring/brewers_bottoms": "饮品师下装",
    "/actions/tailoring/alchemists_top": "炼金师上衣",
    "/actions/tailoring/alchemists_bottoms": "炼金师下装",
    "/actions/tailoring/enhancers_top": "强化师上衣",
    "/actions/tailoring/enhancers_bottoms": "强化师下装",
    "/actions/tailoring/revenant_tunic": "亡灵皮衣",
    "/actions/tailoring/griffin_tunic": "狮鹫皮衣",
    "/actions/tailoring/gluttonous_pouch": "贪食之袋",
    "/actions/tailoring/guzzling_pouch": "暴饮之囊",
    "/actions/tailoring/pathfinder_boots": "探路者靴",
    "/actions/tailoring/pathseeker_boots": "寻路者靴",
    "/actions/tailoring/marksman_bracers": "神射护腕",
    "/actions/tailoring/acrobatic_hood": "杂技师兜帽",
    "/actions/tailoring/magicians_hat": "魔术师帽",
    "/actions/tailoring/kraken_chaps": "克拉肯皮裤",
    "/actions/tailoring/royal_water_robe_bottoms": "皇家水系袍裙",
    "/actions/tailoring/royal_nature_robe_bottoms": "皇家自然系袍裙",
    "/actions/tailoring/royal_fire_robe_bottoms": "皇家火系袍裙",
    "/actions/tailoring/kraken_tunic": "克拉肯皮衣",
    "/actions/tailoring/royal_water_robe_top": "皇家水系袍服",
    "/actions/tailoring/royal_nature_robe_top": "皇家自然系袍服",
    "/actions/tailoring/royal_fire_robe_top": "皇家火系袍服",
    "/actions/tailoring/gatherer_cape_refined": "采集者披风 ★",
    "/actions/tailoring/artificer_cape_refined": "工匠披风 ★",
    "/actions/tailoring/culinary_cape_refined": "厨师披风 ★",
    "/actions/tailoring/chance_cape_refined": "机缘披风 ★",
    "/actions/tailoring/chimerical_quiver_refined": "奇幻箭袋 ★",
    "/actions/tailoring/sinister_cape_refined": "阴森披风 ★",
    "/actions/tailoring/enchanted_cloak_refined": "秘法披风 ★",
    "/actions/tailoring/pathfinder_boots_refined": "探路者靴 ★",
    "/actions/tailoring/pathseeker_boots_refined": "寻路者靴 ★",
    "/actions/tailoring/marksman_bracers_refined": "神射护腕 ★",
    "/actions/tailoring/acrobatic_hood_refined": "杂技师兜帽 ★",
    "/actions/tailoring/magicians_hat_refined": "魔术师帽 ★",
    "/actions/tailoring/kraken_chaps_refined": "克拉肯皮裤 ★",
    "/actions/tailoring/royal_water_robe_bottoms_refined": "皇家水系袍裙 ★",
    "/actions/tailoring/royal_nature_robe_bottoms_refined": "皇家自然系袍裙 ★",
    "/actions/tailoring/royal_fire_robe_bottoms_refined": "皇家火系袍裙 ★",
    "/actions/tailoring/kraken_tunic_refined": "克拉肯皮衣 ★",
    "/actions/tailoring/royal_water_robe_top_refined": "皇家水系袍服 ★",
    "/actions/tailoring/royal_nature_robe_top_refined": "皇家自然系袍服 ★",
    "/actions/tailoring/royal_fire_robe_top_refined": "皇家火系袍服 ★",
    "/actions/cooking/donut": "甜甜圈",
    "/actions/cooking/cupcake": "纸杯蛋糕",
    "/actions/cooking/gummy": "软糖",
    "/actions/cooking/yogurt": "酸奶",
    "/actions/cooking/blueberry_donut": "蓝莓甜甜圈",
    "/actions/cooking/blueberry_cake": "蓝莓蛋糕",
    "/actions/cooking/apple_gummy": "苹果软糖",
    "/actions/cooking/apple_yogurt": "苹果酸奶",
    "/actions/cooking/blackberry_donut": "黑莓甜甜圈",
    "/actions/cooking/blackberry_cake": "黑莓蛋糕",
    "/actions/cooking/orange_gummy": "橙子软糖",
    "/actions/cooking/orange_yogurt": "橙子酸奶",
    "/actions/cooking/basic_food_crate": "基础食物箱",
    "/actions/cooking/strawberry_donut": "草莓甜甜圈",
    "/actions/cooking/strawberry_cake": "草莓蛋糕",
    "/actions/cooking/plum_gummy": "李子软糖",
    "/actions/cooking/plum_yogurt": "李子酸奶",
    "/actions/cooking/mooberry_donut": "哞莓甜甜圈",
    "/actions/cooking/mooberry_cake": "哞莓蛋糕",
    "/actions/cooking/peach_gummy": "桃子软糖",
    "/actions/cooking/peach_yogurt": "桃子酸奶",
    "/actions/cooking/advanced_food_crate": "进阶食物箱",
    "/actions/cooking/marsberry_donut": "火星莓甜甜圈",
    "/actions/cooking/marsberry_cake": "火星莓蛋糕",
    "/actions/cooking/dragon_fruit_gummy": "火龙果软糖",
    "/actions/cooking/dragon_fruit_yogurt": "火龙果酸奶",
    "/actions/cooking/spaceberry_donut": "太空莓甜甜圈",
    "/actions/cooking/spaceberry_cake": "太空莓蛋糕",
    "/actions/cooking/star_fruit_gummy": "杨桃软糖",
    "/actions/cooking/star_fruit_yogurt": "杨桃酸奶",
    "/actions/cooking/expert_food_crate": "专家食物箱",
    "/actions/brewing/milking_tea": "挤奶茶",
    "/actions/brewing/stamina_coffee": "耐力咖啡",
    "/actions/brewing/foraging_tea": "采摘茶",
    "/actions/brewing/intelligence_coffee": "智力咖啡",
    "/actions/brewing/gathering_tea": "采集茶",
    "/actions/brewing/woodcutting_tea": "伐木茶",
    "/actions/brewing/cooking_tea": "烹饪茶",
    "/actions/brewing/defense_coffee": "防御咖啡",
    "/actions/brewing/brewing_tea": "冲泡茶",
    "/actions/brewing/attack_coffee": "攻击咖啡",
    "/actions/brewing/gourmet_tea": "美食茶",
    "/actions/brewing/alchemy_tea": "炼金茶",
    "/actions/brewing/enhancing_tea": "强化茶",
    "/actions/brewing/cheesesmithing_tea": "奶酪锻造茶",
    "/actions/brewing/melee_coffee": "近战咖啡",
    "/actions/brewing/basic_tea_crate": "基础茶叶箱",
    "/actions/brewing/basic_coffee_crate": "基础咖啡箱",
    "/actions/brewing/crafting_tea": "制作茶",
    "/actions/brewing/ranged_coffee": "远程咖啡",
    "/actions/brewing/wisdom_tea": "经验茶",
    "/actions/brewing/wisdom_coffee": "经验咖啡",
    "/actions/brewing/tailoring_tea": "缝纫茶",
    "/actions/brewing/magic_coffee": "魔法咖啡",
    "/actions/brewing/super_milking_tea": "超级挤奶茶",
    "/actions/brewing/super_stamina_coffee": "超级耐力咖啡",
    "/actions/brewing/super_foraging_tea": "超级采摘茶",
    "/actions/brewing/super_intelligence_coffee": "超级智力咖啡",
    "/actions/brewing/processing_tea": "加工茶",
    "/actions/brewing/lucky_coffee": "幸运咖啡",
    "/actions/brewing/super_woodcutting_tea": "超级伐木茶",
    "/actions/brewing/super_cooking_tea": "超级烹饪茶",
    "/actions/brewing/super_defense_coffee": "超级防御咖啡",
    "/actions/brewing/advanced_tea_crate": "进阶茶叶箱",
    "/actions/brewing/advanced_coffee_crate": "进阶咖啡箱",
    "/actions/brewing/super_brewing_tea": "超级冲泡茶",
    "/actions/brewing/ultra_milking_tea": "究极挤奶茶",
    "/actions/brewing/super_attack_coffee": "超级攻击咖啡",
    "/actions/brewing/ultra_stamina_coffee": "究极耐力咖啡",
    "/actions/brewing/efficiency_tea": "效率茶",
    "/actions/brewing/swiftness_coffee": "迅捷咖啡",
    "/actions/brewing/super_alchemy_tea": "超级炼金茶",
    "/actions/brewing/super_enhancing_tea": "超级强化茶",
    "/actions/brewing/ultra_foraging_tea": "究极采摘茶",
    "/actions/brewing/ultra_intelligence_coffee": "究极智力咖啡",
    "/actions/brewing/channeling_coffee": "吟唱咖啡",
    "/actions/brewing/super_cheesesmithing_tea": "超级奶酪锻造茶",
    "/actions/brewing/ultra_woodcutting_tea": "究极伐木茶",
    "/actions/brewing/super_melee_coffee": "超级近战咖啡",
    "/actions/brewing/artisan_tea": "工匠茶",
    "/actions/brewing/super_crafting_tea": "超级制作茶",
    "/actions/brewing/ultra_cooking_tea": "究极烹饪茶",
    "/actions/brewing/super_ranged_coffee": "超级远程咖啡",
    "/actions/brewing/ultra_defense_coffee": "究极防御咖啡",
    "/actions/brewing/catalytic_tea": "催化茶",
    "/actions/brewing/critical_coffee": "暴击咖啡",
    "/actions/brewing/super_tailoring_tea": "超级缝纫茶",
    "/actions/brewing/ultra_brewing_tea": "究极冲泡茶",
    "/actions/brewing/super_magic_coffee": "超级魔法咖啡",
    "/actions/brewing/ultra_attack_coffee": "究极攻击咖啡",
    "/actions/brewing/blessed_tea": "福气茶",
    "/actions/brewing/ultra_alchemy_tea": "究极炼金茶",
    "/actions/brewing/ultra_enhancing_tea": "究极强化茶",
    "/actions/brewing/expert_tea_crate": "专家茶叶箱",
    "/actions/brewing/expert_coffee_crate": "专家咖啡箱",
    "/actions/brewing/ultra_cheesesmithing_tea": "究极奶酪锻造茶",
    "/actions/brewing/ultra_melee_coffee": "究极近战咖啡",
    "/actions/brewing/ultra_crafting_tea": "究极制作茶",
    "/actions/brewing/ultra_ranged_coffee": "究极远程咖啡",
    "/actions/brewing/ultra_tailoring_tea": "究极缝纫茶",
    "/actions/brewing/ultra_magic_coffee": "究极魔法咖啡",
    "/actions/alchemy/coinify": "点金",
    "/actions/alchemy/transmute": "转化",
    "/actions/alchemy/decompose": "分解",
    "/actions/alchemy/unrefine": "解精炼",
    "/actions/enhancing/enhance": "强化",
    "/actions/combat/fly": "苍蝇",
    "/actions/combat/rat": "杰瑞",
    "/actions/combat/skunk": "臭鼬",
    "/actions/combat/porcupine": "豪猪",
    "/actions/combat/slimy": "史莱姆",
    "/actions/combat/smelly_planet": "臭臭星球",
    "/actions/combat/frog": "青蛙",
    "/actions/combat/snake": "蛇",
    "/actions/combat/swampy": "沼泽虫",
    "/actions/combat/alligator": "夏洛克",
    "/actions/combat/swamp_planet": "沼泽星球",
    "/actions/combat/sea_snail": "蜗牛",
    "/actions/combat/crab": "螃蟹",
    "/actions/combat/aquahorse": "水马",
    "/actions/combat/nom_nom": "咬咬鱼",
    "/actions/combat/turtle": "忍者龟",
    "/actions/combat/aqua_planet": "海洋星球",
    "/actions/combat/jungle_sprite": "丛林精灵",
    "/actions/combat/myconid": "蘑菇人",
    "/actions/combat/treant": "树人",
    "/actions/combat/centaur_archer": "半人马弓箭手",
    "/actions/combat/jungle_planet": "丛林星球",
    "/actions/combat/gobo_stabby": "刺刺",
    "/actions/combat/gobo_slashy": "砍砍",
    "/actions/combat/gobo_smashy": "锤锤",
    "/actions/combat/gobo_shooty": "咻咻",
    "/actions/combat/gobo_boomy": "轰轰",
    "/actions/combat/gobo_planet": "哥布林星球",
    "/actions/combat/eye": "独眼",
    "/actions/combat/eyes": "叠眼",
    "/actions/combat/veyes": "复眼",
    "/actions/combat/planet_of_the_eyes": "眼球星球",
    "/actions/combat/novice_sorcerer": "新手巫师",
    "/actions/combat/ice_sorcerer": "冰霜巫师",
    "/actions/combat/flame_sorcerer": "火焰巫师",
    "/actions/combat/elementalist": "元素法师",
    "/actions/combat/sorcerers_tower": "巫师之塔",
    "/actions/combat/gummy_bear": "软糖熊",
    "/actions/combat/panda": "熊猫",
    "/actions/combat/black_bear": "黑熊",
    "/actions/combat/grizzly_bear": "棕熊",
    "/actions/combat/polar_bear": "北极熊",
    "/actions/combat/bear_with_it": "熊熊星球",
    "/actions/combat/magnetic_golem": "磁力魔像",
    "/actions/combat/stalactite_golem": "钟乳石魔像",
    "/actions/combat/granite_golem": "花岗岩魔像",
    "/actions/combat/golem_cave": "魔像洞穴",
    "/actions/combat/zombie": "僵尸",
    "/actions/combat/vampire": "吸血鬼",
    "/actions/combat/werewolf": "狼人",
    "/actions/combat/twilight_zone": "暮光之地",
    "/actions/combat/abyssal_imp": "深渊小鬼",
    "/actions/combat/soul_hunter": "灵魂猎手",
    "/actions/combat/infernal_warlock": "地狱术士",
    "/actions/combat/infernal_abyss": "地狱深渊",
    "/actions/combat/chimerical_den": "奇幻洞穴",
    "/actions/combat/sinister_circus": "阴森马戏团",
    "/actions/combat/enchanted_fortress": "秘法要塞",
    "/actions/combat/pirate_cove": "海盗基地",
    "/actions/labyrinth/explore": "探索迷宫",
    "/actions/special/party_ready": "队伍准备就绪"
  };
  var ZHOthersDic = {
    // monsterNames
    "/monsters/abyssal_imp": "深渊小鬼",
    "/monsters/acrobat": "杂技师",
    "/monsters/trial_hedgehog": "试炼刺猬",
    "/monsters/anchor_shark": "持锚鲨",
    "/monsters/aquahorse": "水马",
    "/monsters/trial_jellyfish": "试炼水母",
    "/monsters/black_bear": "黑熊",
    "/monsters/gobo_boomy": "轰轰",
    "/monsters/brine_marksman": "海盐射手",
    "/monsters/butterjerry": "蝶鼠",
    "/monsters/captain_fishhook": "鱼钩船长",
    "/monsters/centaur_archer": "半人马弓箭手",
    "/monsters/cyclops": "独眼巨人",
    "/monsters/chronofrost_sorcerer": "霜时巫师",
    "/monsters/dryad": "树精",
    "/monsters/crystal_colossus": "水晶巨像",
    "/monsters/frost_sniper": "霜冻狙击手",
    "/monsters/demonic_overlord": "恶魔霸主",
    "/monsters/deranged_jester": "小丑皇",
    "/monsters/dodocamel": "渡渡驼",
    "/monsters/dusk_revenant": "黄昏亡灵",
    "/monsters/trial_chameleon": "试炼变色龙",
    "/monsters/elementalist": "元素法师",
    "/monsters/enchanted_bishop": "秘法主教",
    "/monsters/enchanted_king": "秘法国王",
    "/monsters/enchanted_knight": "秘法骑士",
    "/monsters/enchanted_pawn": "秘法士兵",
    "/monsters/enchanted_queen": "秘法王后",
    "/monsters/enchanted_rook": "秘法堡垒",
    "/monsters/eye": "独眼",
    "/monsters/eyes": "叠眼",
    "/monsters/flame_sorcerer": "火焰巫师",
    "/monsters/fly": "苍蝇",
    "/monsters/trial_beetle": "试炼甲虫",
    "/monsters/trial_dragonfly": "试炼蜻蜓",
    "/monsters/trial_wasp": "试炼黄蜂",
    "/monsters/trial_firefly": "试炼萤火虫",
    "/monsters/frog": "青蛙",
    "/monsters/sea_snail": "蜗牛",
    "/monsters/giant_shoebill": "鲸头鹳",
    "/monsters/gobo_chieftain": "哥布林酋长",
    "/monsters/granite_golem": "花岗魔像",
    "/monsters/griffin": "狮鹫",
    "/monsters/grizzly_bear": "棕熊",
    "/monsters/gummy_bear": "软糖熊",
    "/monsters/crab": "螃蟹",
    "/monsters/ice_sorcerer": "冰霜巫师",
    "/monsters/infernal_warlock": "地狱术士",
    "/monsters/trial_badger": "试炼獾",
    "/monsters/jackalope": "鹿角兔",
    "/monsters/rat": "杰瑞",
    "/monsters/juggler": "杂耍者",
    "/monsters/jungle_sprite": "丛林精灵",
    "/monsters/giant_mantis": "巨螳螂",
    "/monsters/luna_empress": "月神之蝶",
    "/monsters/magician": "魔术师",
    "/monsters/magnetic_golem": "磁力魔像",
    "/monsters/manticore": "狮蝎兽",
    "/monsters/marine_huntress": "海洋猎手",
    "/monsters/giant_scorpion": "巨蝎",
    "/monsters/mimic": "宝箱怪",
    "/monsters/myconid": "蘑菇人",
    "/monsters/nom_nom": "咬咬鱼",
    "/monsters/novice_sorcerer": "新手巫师",
    "/monsters/panda": "熊猫",
    "/monsters/polar_bear": "北极熊",
    "/monsters/porcupine": "豪猪",
    "/monsters/rabid_rabbit": "疯魔兔",
    "/monsters/red_panda": "小熊猫",
    "/monsters/alligator": "夏洛克",
    "/monsters/gobo_shooty": "咻咻",
    "/monsters/skunk": "臭鼬",
    "/monsters/gobo_slashy": "砍砍",
    "/monsters/slimy": "史莱姆",
    "/monsters/gobo_smashy": "锤锤",
    "/monsters/soul_hunter": "灵魂猎手",
    "/monsters/squawker": "鹦鹉",
    "/monsters/gobo_stabby": "刺刺",
    "/monsters/stalactite_golem": "钟乳石魔像",
    "/monsters/pyre_hunter": "火焰猎手",
    "/monsters/swampy": "沼泽虫",
    "/monsters/the_kraken": "克拉肯",
    "/monsters/the_watcher": "观察者",
    "/monsters/snake": "蛇",
    "/monsters/tidal_conjuror": "潮汐召唤师",
    "/monsters/salamander": "火蜥蜴",
    "/monsters/shadow_archer": "暗影弓手",
    "/monsters/treant": "树人",
    "/monsters/turtle": "忍者龟",
    "/monsters/vampire": "吸血鬼",
    "/monsters/veyes": "复眼",
    "/monsters/siren": "海妖",
    "/monsters/werewolf": "狼人",
    "/monsters/zombie": "僵尸",
    "/monsters/zombie_bear": "僵尸熊",
    // abilityNames
    "/abilities/poke": "破胆之刺",
    "/abilities/impale": "透骨之刺",
    "/abilities/puncture": "破甲之刺",
    "/abilities/penetrating_strike": "贯心之刺",
    "/abilities/scratch": "爪影斩",
    "/abilities/cleave": "分裂斩",
    "/abilities/maim": "血刃斩",
    "/abilities/crippling_slash": "致残斩",
    "/abilities/smack": "重碾",
    "/abilities/sweep": "重扫",
    "/abilities/stunning_blow": "重锤",
    "/abilities/fracturing_impact": "碎裂冲击",
    "/abilities/shield_bash": "盾击",
    "/abilities/quick_shot": "快速射击",
    "/abilities/aqua_arrow": "流水箭",
    "/abilities/flame_arrow": "烈焰箭",
    "/abilities/rain_of_arrows": "箭雨",
    "/abilities/silencing_shot": "沉默之箭",
    "/abilities/steady_shot": "稳定射击",
    "/abilities/pestilent_shot": "疫病射击",
    "/abilities/penetrating_shot": "贯穿射击",
    "/abilities/water_strike": "流水冲击",
    "/abilities/ice_spear": "冰枪术",
    "/abilities/frost_surge": "冰霜爆裂",
    "/abilities/mana_spring": "法力喷泉",
    "/abilities/entangle": "缠绕",
    "/abilities/toxic_pollen": "剧毒粉尘",
    "/abilities/natures_veil": "自然菌幕",
    "/abilities/life_drain": "生命吸取",
    "/abilities/fireball": "火球",
    "/abilities/flame_blast": "熔岩爆裂",
    "/abilities/firestorm": "火焰风暴",
    "/abilities/smoke_burst": "烟爆灭影",
    "/abilities/minor_heal": "初级自愈术",
    "/abilities/heal": "自愈术",
    "/abilities/quick_aid": "快速治疗术",
    "/abilities/rejuvenate": "群体治疗术",
    "/abilities/taunt": "嘲讽",
    "/abilities/provoke": "挑衅",
    "/abilities/toughness": "坚韧",
    "/abilities/elusiveness": "闪避",
    "/abilities/precision": "精确",
    "/abilities/berserk": "狂暴",
    "/abilities/frenzy": "狂速",
    "/abilities/elemental_affinity": "元素增幅",
    "/abilities/spike_shell": "尖刺防护",
    "/abilities/retribution": "惩戒",
    "/abilities/vampirism": "吸血",
    "/abilities/revive": "复活",
    "/abilities/insanity": "疯狂",
    "/abilities/invincible": "无敌",
    "/abilities/speed_aura": "速度光环",
    "/abilities/guardian_aura": "守护光环",
    "/abilities/fierce_aura": "物理光环",
    "/abilities/critical_aura": "暴击光环",
    "/abilities/mystic_aura": "元素光环",
    "/abilities/promote": "晋升"
  };
  function inverseKV(obj) {
    const retobj = {};
    for (const key in obj) {
      retobj[obj[key]] = key;
    }
    return retobj;
  }
  var ZHToItemHridMap = inverseKV(ZHItemNames);
  var ZHToActionHridMap = inverseKV(ZHActionNames);
  var ZHToOthersMap = inverseKV(ZHOthersDic);
  function getItemEnNameFromZhName(zhName) {
    const itemHrid = ZHToItemHridMap[zhName];
    if (!itemHrid) {
      console.log("Can not find EN name for item " + zhName);
      return "";
    }
    const enName = runtime.state.initData_itemDetailMap[itemHrid]?.name;
    if (!enName) {
      console.log("Can not find EN name for itemHrid " + itemHrid);
      return "";
    }
    return enName;
  }
  function getActionEnNameFromZhName(zhName) {
    const actionHrid = ZHToActionHridMap[zhName];
    if (!actionHrid) {
      console.log("Can not find EN name for action " + zhName);
      return "";
    }
    const enName = runtime.state.initData_actionDetailMap[actionHrid]?.name;
    if (!enName) {
      console.log("Can not find EN name for actionHrid " + actionHrid);
      return "";
    }
    return enName;
  }
  function getOthersFromZhName(zhName) {
    const key = ZHToOthersMap[zhName];
    if (!key) {
      return "";
    }
    return key;
  }
  var itemEnNameToHridMap = {};
  Object.assign(runtime.api, {
    inverseKV,
    getItemEnNameFromZhName,
    getActionEnNameFromZhName,
    getOthersFromZhName
  });
  Object.defineProperties(runtime.data, {
    ZHItemNames: {
      enumerable: true,
      get() {
        return ZHItemNames;
      }
    },
    ZHActionNames: {
      enumerable: true,
      get() {
        return ZHActionNames;
      }
    },
    ZHOthersDic: {
      enumerable: true,
      get() {
        return ZHOthersDic;
      }
    },
    ZHToItemHridMap: {
      enumerable: true,
      get() {
        return ZHToItemHridMap;
      }
    },
    ZHToActionHridMap: {
      enumerable: true,
      get() {
        return ZHToActionHridMap;
      }
    },
    ZHToOthersMap: {
      enumerable: true,
      get() {
        return ZHToOthersMap;
      }
    }
  });
  Object.defineProperties(runtime.state, {
    itemEnNameToHridMap: {
      enumerable: true,
      get() {
        return itemEnNameToHridMap;
      }
    }
  });

  // src/data/market-backup.json
  var market_backup_default = {
    marketData: {
      "/items/abyssal_essence": {
        "0": {
          a: 260,
          b: 255
        }
      },
      "/items/acrobatic_hood": {
        "0": {
          a: 7e7,
          b: 68e6
        },
        "2": {
          a: -1,
          b: 58e6
        },
        "3": {
          a: -1,
          b: 58e6
        },
        "4": {
          a: -1,
          b: 58e6
        },
        "5": {
          a: 74e6,
          b: 66e6
        },
        "6": {
          a: -1,
          b: 56e6
        },
        "7": {
          a: 9e7,
          b: 84e6
        },
        "8": {
          a: 145e6,
          b: 11e7
        },
        "9": {
          a: -1,
          b: 15e7
        },
        "10": {
          a: 28e7,
          b: 275e6
        },
        "11": {
          a: -1,
          b: 34e7
        },
        "12": {
          a: -1,
          b: 96e7
        }
      },
      "/items/acrobatic_hood_refined": {
        "5": {
          a: -1,
          b: 36e5
        },
        "10": {
          a: 58e7,
          b: 54e7
        },
        "11": {
          a: -1,
          b: 36e5
        }
      },
      "/items/acrobats_ribbon": {
        "0": {
          a: 68e5,
          b: 66e5
        }
      },
      "/items/advanced_alchemy_charm": {
        "0": {
          a: 39e6,
          b: -1
        },
        "1": {
          a: 48e6,
          b: -1
        },
        "2": {
          a: 54e6,
          b: -1
        },
        "3": {
          a: 52e6,
          b: 31e6
        },
        "4": {
          a: 74e6,
          b: -1
        },
        "5": {
          a: 12e7,
          b: -1
        }
      },
      "/items/advanced_attack_charm": {
        "0": {
          a: 74e5,
          b: 64e5
        },
        "1": {
          a: 11e6,
          b: 7e6
        },
        "2": {
          a: 16e6,
          b: 98e5
        },
        "3": {
          a: 195e5,
          b: 18e6
        },
        "4": {
          a: 39e6,
          b: -1
        },
        "5": {
          a: 56e6,
          b: 46e6
        }
      },
      "/items/advanced_brewing_charm": {
        "0": {
          a: 16e6,
          b: 14e6
        },
        "2": {
          a: 255e5,
          b: -1
        },
        "3": {
          a: 31e6,
          b: -1
        },
        "4": {
          a: 66e6,
          b: 38e6
        },
        "5": {
          a: 105e6,
          b: -1
        }
      },
      "/items/advanced_cheesesmithing_charm": {
        "0": {
          a: 235e5,
          b: 125e5
        },
        "3": {
          a: 42e6,
          b: -1
        },
        "4": {
          a: 6e7,
          b: -1
        },
        "5": {
          a: 8e7,
          b: 52e6
        }
      },
      "/items/advanced_cooking_charm": {
        "0": {
          a: -1,
          b: 205e5
        },
        "1": {
          a: 3e7,
          b: -1
        },
        "2": {
          a: 39e6,
          b: -1
        },
        "3": {
          a: 38e6,
          b: -1
        },
        "5": {
          a: 82e6,
          b: 74e6
        }
      },
      "/items/advanced_crafting_charm": {
        "0": {
          a: 275e5,
          b: 24e6
        },
        "1": {
          a: 295e5,
          b: -1
        },
        "2": {
          a: 36e6,
          b: 19e6
        },
        "3": {
          a: 46e6,
          b: -1
        },
        "4": {
          a: 88e6,
          b: -1
        }
      },
      "/items/advanced_defense_charm": {
        "0": {
          a: 7e6,
          b: 66e5
        },
        "1": {
          a: 11e6,
          b: 92e5
        },
        "2": {
          a: -1,
          b: 82e5
        },
        "3": {
          a: 195e5,
          b: 185e5
        },
        "5": {
          a: 82e6,
          b: 68e6
        }
      },
      "/items/advanced_enhancing_charm": {
        "0": {
          a: 58e6,
          b: 32e6
        },
        "1": {
          a: 74e6,
          b: -1
        },
        "3": {
          a: 96e6,
          b: -1
        },
        "5": {
          a: 15e7,
          b: 1e8
        }
      },
      "/items/advanced_foraging_charm": {
        "0": {
          a: 21e6,
          b: 185e5
        },
        "1": {
          a: 28e6,
          b: -1
        },
        "3": {
          a: 38e6,
          b: -1
        },
        "4": {
          a: 62e6,
          b: -1
        },
        "5": {
          a: 115e6,
          b: 8e7
        },
        "7": {
          a: -1,
          b: 16e5
        }
      },
      "/items/advanced_intelligence_charm": {
        "0": {
          a: 74e5,
          b: 64e5
        },
        "1": {
          a: 13e6,
          b: 7e6
        },
        "3": {
          a: 215e5,
          b: 185e5
        },
        "4": {
          a: -1,
          b: 37e6
        },
        "5": {
          a: 78e6,
          b: 62e6
        }
      },
      "/items/advanced_magic_charm": {
        "0": {
          a: 115e5,
          b: 1e7
        },
        "1": {
          a: 15e6,
          b: 115e5
        },
        "3": {
          a: 22e6,
          b: 19e6
        },
        "4": {
          a: 42e6,
          b: 35e6
        },
        "5": {
          a: -1,
          b: 68e6
        }
      },
      "/items/advanced_melee_charm": {
        "0": {
          a: 68e5,
          b: 66e5
        },
        "1": {
          a: 9e6,
          b: 54e5
        },
        "2": {
          a: 135e5,
          b: 82e5
        },
        "3": {
          a: 185e5,
          b: 175e5
        },
        "4": {
          a: 49e6,
          b: 29e6
        },
        "5": {
          a: 58e6,
          b: 5e7
        }
      },
      "/items/advanced_milking_charm": {
        "0": {
          a: 255e5,
          b: 205e5
        },
        "1": {
          a: 28e6,
          b: -1
        },
        "2": {
          a: 28e6,
          b: -1
        },
        "3": {
          a: 33e6,
          b: -1
        },
        "4": {
          a: 66e6,
          b: 5e7
        },
        "5": {
          a: 98e6,
          b: -1
        }
      },
      "/items/advanced_ranged_charm": {
        "0": {
          a: 68e5,
          b: 64e5
        },
        "1": {
          a: 1e7,
          b: -1
        },
        "2": {
          a: 13e6,
          b: 8e6
        },
        "3": {
          a: 2e7,
          b: 165e5
        },
        "4": {
          a: 39e6,
          b: 36e6
        },
        "5": {
          a: 74e6,
          b: 33e6
        }
      },
      "/items/advanced_stamina_charm": {
        "0": {
          a: 145e5,
          b: 14e6
        },
        "1": {
          a: -1,
          b: 12e6
        },
        "2": {
          a: 195e5,
          b: 125e5
        },
        "3": {
          a: 3e7,
          b: 265e5
        },
        "4": {
          a: 56e6,
          b: 44e6
        },
        "5": {
          a: 82e6,
          b: 64e6
        }
      },
      "/items/advanced_tailoring_charm": {
        "0": {
          a: 21e6,
          b: 15e6
        },
        "1": {
          a: 28e6,
          b: -1
        },
        "2": {
          a: 38e6,
          b: -1
        },
        "3": {
          a: 4e7,
          b: 29e6
        },
        "4": {
          a: 68e6,
          b: -1
        },
        "5": {
          a: 96e6,
          b: 64e6
        }
      },
      "/items/advanced_woodcutting_charm": {
        "0": {
          a: 22e6,
          b: 15e6
        },
        "1": {
          a: 38e6,
          b: -1
        },
        "3": {
          a: 4e7,
          b: -1
        }
      },
      "/items/alchemists_bottoms": {
        "0": {
          a: -1,
          b: 15e7
        },
        "5": {
          a: 255e6,
          b: 225e6
        },
        "6": {
          a: 5e8,
          b: -1
        },
        "7": {
          a: 265e6,
          b: 25e7
        },
        "8": {
          a: 31e7,
          b: 27e7
        },
        "10": {
          a: 48e7,
          b: 44e7
        }
      },
      "/items/alchemists_top": {
        "0": {
          a: -1,
          b: 15e7
        },
        "1": {
          a: -1,
          b: 38e5
        },
        "3": {
          a: -1,
          b: 35e5
        },
        "5": {
          a: 21e7,
          b: 18e7
        },
        "6": {
          a: 23e7,
          b: 8e7
        },
        "7": {
          a: 24e7,
          b: 21e7
        },
        "8": {
          a: 27e7,
          b: 24e7
        },
        "10": {
          a: 44e7,
          b: 38e7
        }
      },
      "/items/alchemy_essence": {
        "0": {
          a: 400,
          b: 390
        }
      },
      "/items/alchemy_tea": {
        "0": {
          a: 860,
          b: 820
        }
      },
      "/items/amber": {
        "0": {
          a: 21500,
          b: 21e3
        }
      },
      "/items/amethyst": {
        "0": {
          a: 34e3,
          b: 33e3
        }
      },
      "/items/anchorbound_plate_body": {
        "0": {
          a: 96e6,
          b: 92e6
        },
        "1": {
          a: -1,
          b: 84e6
        },
        "2": {
          a: -1,
          b: 84e6
        },
        "3": {
          a: -1,
          b: 84e6
        },
        "4": {
          a: -1,
          b: 86e6
        },
        "5": {
          a: 11e7,
          b: 1e8
        },
        "6": {
          a: -1,
          b: 9e7
        },
        "7": {
          a: 125e6,
          b: 12e7
        },
        "8": {
          a: 17e7,
          b: 145e6
        },
        "9": {
          a: -1,
          b: 18e7
        },
        "10": {
          a: 41e7,
          b: 39e7
        },
        "12": {
          a: 13e8,
          b: 96e7
        }
      },
      "/items/anchorbound_plate_body_refined": {
        "10": {
          a: -1,
          b: 45e5
        }
      },
      "/items/anchorbound_plate_legs": {
        "0": {
          a: 76e6,
          b: 72e6
        },
        "1": {
          a: -1,
          b: 68e6
        },
        "2": {
          a: -1,
          b: 7e7
        },
        "4": {
          a: -1,
          b: 66e6
        },
        "5": {
          a: 94e6,
          b: 84e6
        },
        "6": {
          a: -1,
          b: 72e6
        },
        "7": {
          a: 105e6,
          b: 98e6
        },
        "8": {
          a: 15e7,
          b: 12e7
        },
        "10": {
          a: 37e7,
          b: -1
        }
      },
      "/items/anchorbound_plate_legs_refined": {},
      "/items/apple": {
        "0": {
          a: 23,
          b: 21
        }
      },
      "/items/apple_gummy": {
        "0": {
          a: 19,
          b: 17
        }
      },
      "/items/apple_yogurt": {
        "0": {
          a: 500,
          b: 440
        }
      },
      "/items/aqua_arrow": {
        "0": {
          a: 33e3,
          b: 32e3
        }
      },
      "/items/aqua_essence": {
        "0": {
          a: 30,
          b: 25
        }
      },
      "/items/arabica_coffee_bean": {
        "0": {
          a: 320,
          b: 310
        }
      },
      "/items/arcane_bow": {
        "0": {
          a: 1e6,
          b: 98e4
        },
        "1": {
          a: 125e4,
          b: -1
        },
        "2": {
          a: 14e5,
          b: -1
        },
        "3": {
          a: 13e5,
          b: -1
        },
        "4": {
          a: 155e4,
          b: -1
        },
        "5": {
          a: 165e4,
          b: 25e4
        },
        "6": {
          a: 13e6,
          b: -1
        },
        "7": {
          a: 15e6,
          b: -1
        }
      },
      "/items/arcane_crossbow": {
        "0": {
          a: 76e4,
          b: 74e4
        },
        "1": {
          a: 8e5,
          b: -1
        },
        "2": {
          a: 82e4,
          b: 39e4
        },
        "3": {
          a: 84e4,
          b: 4e5
        },
        "4": {
          a: 1e6,
          b: 42e4
        },
        "5": {
          a: 145e4,
          b: 46e4
        },
        "6": {
          a: 47e5,
          b: 46e4
        },
        "7": {
          a: 1e7,
          b: -1
        },
        "10": {
          a: 72e6,
          b: -1
        }
      },
      "/items/arcane_fire_staff": {
        "0": {
          a: 76e4,
          b: 74e4
        },
        "1": {
          a: -1,
          b: 36e4
        },
        "2": {
          a: 12e5,
          b: -1
        },
        "3": {
          a: 8e5,
          b: 35e4
        },
        "4": {
          a: 84e4,
          b: 49e4
        },
        "5": {
          a: 92e4,
          b: 44e4
        }
      },
      "/items/arcane_log": {
        "0": {
          a: 430,
          b: 410
        }
      },
      "/items/arcane_lumber": {
        "0": {
          a: 2200,
          b: 2150
        }
      },
      "/items/arcane_nature_staff": {
        "0": {
          a: 78e4,
          b: 76e4
        },
        "1": {
          a: 88e4,
          b: 45e4
        },
        "2": {
          a: 88e4,
          b: -1
        },
        "3": {
          a: 88e4,
          b: -1
        },
        "4": {
          a: 1e6,
          b: 46e4
        },
        "5": {
          a: 135e4,
          b: 1e6
        },
        "7": {
          a: 86e5,
          b: 86e4
        },
        "9": {
          a: 9e6,
          b: 9e5
        }
      },
      "/items/arcane_shield": {
        "0": {
          a: 52e4,
          b: 49e4
        },
        "3": {
          a: 1e6,
          b: -1
        },
        "4": {
          a: 98e4,
          b: -1
        },
        "5": {
          a: 285e4,
          b: 82e4
        },
        "6": {
          a: -1,
          b: 54e4
        }
      },
      "/items/arcane_water_staff": {
        "0": {
          a: 78e4,
          b: 76e4
        },
        "1": {
          a: 82e4,
          b: -1
        },
        "2": {
          a: 76e4,
          b: -1
        },
        "3": {
          a: 88e4,
          b: -1
        },
        "5": {
          a: 165e4,
          b: 5e5
        }
      },
      "/items/artisan_tea": {
        "0": {
          a: 1750,
          b: 1700
        }
      },
      "/items/attack_coffee": {
        "0": {
          a: 900,
          b: 880
        }
      },
      "/items/azure_alembic": {
        "0": {
          a: 54e3,
          b: 44e3
        },
        "1": {
          a: 115e6,
          b: -1
        },
        "3": {
          a: 23e4,
          b: -1
        }
      },
      "/items/azure_boots": {
        "0": {
          a: 28500,
          b: 26e3
        },
        "1": {
          a: 36e3,
          b: -1
        },
        "4": {
          a: 195e3,
          b: -1
        }
      },
      "/items/azure_brush": {
        "0": {
          a: 41e3,
          b: 31e3
        },
        "1": {
          a: 64e3,
          b: 2250
        },
        "2": {
          a: 8e4,
          b: 2250
        },
        "3": {
          a: 1e5,
          b: -1
        },
        "9": {
          a: 72e4,
          b: -1
        }
      },
      "/items/azure_buckler": {
        "0": {
          a: 39e3,
          b: 32e3
        },
        "1": {
          a: 7e4,
          b: -1
        },
        "2": {
          a: 86e3,
          b: -1
        },
        "3": {
          a: 11e4,
          b: -1
        },
        "5": {
          a: 15e4,
          b: -1
        }
      },
      "/items/azure_bulwark": {
        "0": {
          a: 5e4,
          b: 45e3
        },
        "5": {
          a: 5e5,
          b: -1
        }
      },
      "/items/azure_cheese": {
        "0": {
          a: 940,
          b: 920
        }
      },
      "/items/azure_chisel": {
        "0": {
          a: 56e3,
          b: 32e3
        },
        "1": {
          a: 115e3,
          b: -1
        },
        "2": {
          a: 12e4,
          b: -1
        },
        "3": {
          a: 235e3,
          b: -1
        }
      },
      "/items/azure_enhancer": {
        "0": {
          a: 68e3,
          b: 39e3
        },
        "3": {
          a: 9e4,
          b: -1
        },
        "4": {
          a: 125e3,
          b: -1
        }
      },
      "/items/azure_gauntlets": {
        "0": {
          a: 26500,
          b: 23e3
        },
        "1": {
          a: 47e3,
          b: -1
        },
        "2": {
          a: -1,
          b: 2350
        },
        "3": {
          a: 205e3,
          b: -1
        },
        "4": {
          a: 25e4,
          b: -1
        }
      },
      "/items/azure_hammer": {
        "0": {
          a: 54e3,
          b: 37e3
        },
        "1": {
          a: 25e4,
          b: 2050
        },
        "2": {
          a: -1,
          b: 2050
        },
        "3": {
          a: 4e5,
          b: 2050
        },
        "7": {
          a: 5e5,
          b: -1
        }
      },
      "/items/azure_hatchet": {
        "0": {
          a: 48e3,
          b: 36e3
        },
        "3": {
          a: 39e4,
          b: -1
        },
        "5": {
          a: 38e4,
          b: -1
        }
      },
      "/items/azure_helmet": {
        "0": {
          a: 35e3,
          b: 32e3
        },
        "1": {
          a: 45e3,
          b: -1
        },
        "2": {
          a: -1,
          b: 2900
        }
      },
      "/items/azure_mace": {
        "0": {
          a: 54e3,
          b: 49e3
        },
        "1": {
          a: 115e3,
          b: -1
        },
        "3": {
          a: 12e4,
          b: -1
        }
      },
      "/items/azure_milk": {
        "0": {
          a: 195,
          b: 185
        }
      },
      "/items/azure_needle": {
        "0": {
          a: 45e3,
          b: 41e3
        },
        "1": {
          a: 98e3,
          b: -1
        },
        "3": {
          a: 235e3,
          b: -1
        },
        "5": {
          a: 33e4,
          b: -1
        }
      },
      "/items/azure_plate_body": {
        "0": {
          a: 54e3,
          b: 47e3
        },
        "1": {
          a: 54e3,
          b: -1
        },
        "2": {
          a: 105e3,
          b: 78e3
        },
        "4": {
          a: 2e5,
          b: -1
        },
        "5": {
          a: 275e3,
          b: -1
        }
      },
      "/items/azure_plate_legs": {
        "0": {
          a: 46e3,
          b: 44e3
        },
        "1": {
          a: 2e5,
          b: -1
        },
        "4": {
          a: 3e5,
          b: -1
        },
        "5": {
          a: 43e4,
          b: -1
        }
      },
      "/items/azure_pot": {
        "0": {
          a: 94e3,
          b: 43e3
        },
        "1": {
          a: 265e3,
          b: -1
        },
        "2": {
          a: 175e3,
          b: -1
        },
        "3": {
          a: 25e4,
          b: -1
        }
      },
      "/items/azure_shears": {
        "0": {
          a: 46e3,
          b: 42e3
        },
        "1": {
          a: 32e6,
          b: -1
        },
        "2": {
          a: 42e4,
          b: -1
        },
        "3": {
          a: 78e3,
          b: -1
        }
      },
      "/items/azure_spatula": {
        "0": {
          a: 54e3,
          b: 45e3
        },
        "2": {
          a: 15e4,
          b: -1
        },
        "3": {
          a: 235e3,
          b: 2050
        },
        "4": {
          a: -1,
          b: 2050
        },
        "6": {
          a: -1,
          b: 2050
        }
      },
      "/items/azure_spear": {
        "0": {
          a: 52e3,
          b: 5e4
        },
        "1": {
          a: 1e7,
          b: -1
        },
        "2": {
          a: 1e7,
          b: -1
        }
      },
      "/items/azure_sword": {
        "0": {
          a: 56e3,
          b: 52e3
        },
        "1": {
          a: 17e6,
          b: -1
        },
        "2": {
          a: 2e5,
          b: -1
        },
        "4": {
          a: 3e5,
          b: -1
        },
        "5": {
          a: 175e3,
          b: -1
        }
      },
      "/items/bag_of_10_cowbells": {
        "0": {
          a: 54e4,
          b: 5e5
        }
      },
      "/items/bamboo_boots": {
        "0": {
          a: 25500,
          b: 20500
        },
        "1": {
          a: 46e3,
          b: -1
        },
        "2": {
          a: 66e3,
          b: -1
        },
        "3": {
          a: 16e4,
          b: -1
        },
        "4": {
          a: 115e3,
          b: -1
        },
        "5": {
          a: 92e3,
          b: -1
        },
        "6": {
          a: 68e4,
          b: -1
        },
        "7": {
          a: 7e5,
          b: -1
        },
        "8": {
          a: 12e5,
          b: -1
        }
      },
      "/items/bamboo_branch": {
        "0": {
          a: 25,
          b: 24
        }
      },
      "/items/bamboo_fabric": {
        "0": {
          a: 320,
          b: 290
        }
      },
      "/items/bamboo_gloves": {
        "0": {
          a: 24e3,
          b: 18500
        },
        "1": {
          a: 6e4,
          b: -1
        },
        "2": {
          a: 86e3,
          b: -1
        },
        "3": {
          a: 19e4,
          b: -1
        },
        "4": {
          a: 12e4,
          b: -1
        },
        "5": {
          a: 38e4,
          b: -1
        },
        "6": {
          a: 64e4,
          b: -1
        }
      },
      "/items/bamboo_hat": {
        "0": {
          a: 3e4,
          b: 24500
        },
        "1": {
          a: 1e5,
          b: -1
        },
        "2": {
          a: 135e3,
          b: -1
        },
        "3": {
          a: 31e4,
          b: -1
        }
      },
      "/items/bamboo_robe_bottoms": {
        "0": {
          a: 37e3,
          b: 34e3
        },
        "2": {
          a: 16e4,
          b: -1
        },
        "3": {
          a: 3e5,
          b: -1
        }
      },
      "/items/bamboo_robe_top": {
        "0": {
          a: 44e3,
          b: 42e3
        },
        "2": {
          a: 16e4,
          b: -1
        },
        "3": {
          a: 22e4,
          b: -1
        }
      },
      "/items/basic_alchemy_charm": {
        "0": {
          a: 4e6,
          b: 34e5
        },
        "1": {
          a: 125e5,
          b: -1
        }
      },
      "/items/basic_attack_charm": {
        "0": {
          a: 84e4,
          b: 82e4
        },
        "1": {
          a: 96e4,
          b: -1
        },
        "2": {
          a: 49e5,
          b: -1
        },
        "3": {
          a: 74e5,
          b: -1
        },
        "5": {
          a: 285e5,
          b: -1
        }
      },
      "/items/basic_brewing_charm": {
        "0": {
          a: 18e5,
          b: 165e4
        },
        "2": {
          a: 78e5,
          b: -1
        }
      },
      "/items/basic_cheesesmithing_charm": {
        "0": {
          a: 285e4,
          b: 265e4
        }
      },
      "/items/basic_cooking_charm": {
        "0": {
          a: 3e6,
          b: 26e5
        },
        "2": {
          a: 15e6,
          b: -1
        }
      },
      "/items/basic_crafting_charm": {
        "0": {
          a: 34e5,
          b: -1
        }
      },
      "/items/basic_defense_charm": {
        "0": {
          a: 86e4,
          b: 84e4
        },
        "1": {
          a: 125e5,
          b: -1
        }
      },
      "/items/basic_enhancing_charm": {
        "0": {
          a: 82e5,
          b: 72e5
        },
        "1": {
          a: 96e5,
          b: -1
        },
        "3": {
          a: 23e6,
          b: -1
        }
      },
      "/items/basic_foraging_charm": {
        "0": {
          a: 28e5,
          b: 23e5
        }
      },
      "/items/basic_intelligence_charm": {
        "0": {
          a: 84e4,
          b: 82e4
        }
      },
      "/items/basic_magic_charm": {
        "0": {
          a: 13e5,
          b: 125e4
        },
        "2": {
          a: 98e5,
          b: -1
        },
        "3": {
          a: 94e5,
          b: -1
        }
      },
      "/items/basic_melee_charm": {
        "0": {
          a: 84e4,
          b: 82e4
        },
        "1": {
          a: 155e4,
          b: -1
        },
        "3": {
          a: 6e8,
          b: -1
        }
      },
      "/items/basic_milking_charm": {
        "0": {
          a: 245e4,
          b: 18e5
        },
        "1": {
          a: 185e5,
          b: -1
        }
      },
      "/items/basic_ranged_charm": {
        "0": {
          a: 84e4,
          b: 82e4
        },
        "1": {
          a: 38e5,
          b: -1
        },
        "2": {
          a: 74e5,
          b: -1
        },
        "3": {
          a: 7e6,
          b: -1
        }
      },
      "/items/basic_stamina_charm": {
        "0": {
          a: 15e5,
          b: 14e5
        },
        "2": {
          a: 78e5,
          b: -1
        }
      },
      "/items/basic_tailoring_charm": {
        "0": {
          a: 255e4,
          b: 175e4
        },
        "1": {
          a: 285e4,
          b: -1
        }
      },
      "/items/basic_woodcutting_charm": {
        "0": {
          a: 25e5,
          b: 175e4
        },
        "1": {
          a: 32e5,
          b: -1
        }
      },
      "/items/bear_essence": {
        "0": {
          a: 88,
          b: 86
        }
      },
      "/items/beast_boots": {
        "0": {
          a: 66e3,
          b: 62e3
        },
        "3": {
          a: 26e4,
          b: -1
        },
        "5": {
          a: 28e4,
          b: -1
        },
        "7": {
          a: 12e5,
          b: -1
        },
        "8": {
          a: 195e4,
          b: -1
        }
      },
      "/items/beast_bracers": {
        "0": {
          a: 96e3,
          b: 92e3
        },
        "1": {
          a: 24e4,
          b: -1
        },
        "2": {
          a: 175e3,
          b: -1
        },
        "3": {
          a: 22e4,
          b: -1
        },
        "4": {
          a: 25e4,
          b: -1
        },
        "5": {
          a: 47e4,
          b: 1e5
        },
        "6": {
          a: 8e5,
          b: -1
        },
        "7": {
          a: 155e5,
          b: -1
        }
      },
      "/items/beast_chaps": {
        "0": {
          a: 145e3,
          b: 14e4
        },
        "1": {
          a: 165e3,
          b: -1
        },
        "2": {
          a: 165e3,
          b: -1
        },
        "3": {
          a: 22e4,
          b: -1
        },
        "5": {
          a: 42e4,
          b: 1e5
        }
      },
      "/items/beast_hide": {
        "0": {
          a: 22,
          b: 20
        }
      },
      "/items/beast_hood": {
        "0": {
          a: 72e3,
          b: 68e3
        },
        "2": {
          a: 78e3,
          b: -1
        },
        "3": {
          a: 125e3,
          b: -1
        },
        "4": {
          a: 29e4,
          b: -1
        },
        "5": {
          a: 48e4,
          b: 1e5
        }
      },
      "/items/beast_leather": {
        "0": {
          a: 1150,
          b: 1100
        }
      },
      "/items/beast_tunic": {
        "0": {
          a: 18e4,
          b: 175e3
        },
        "2": {
          a: 3e5,
          b: -1
        },
        "3": {
          a: 19e4,
          b: -1
        },
        "4": {
          a: 31e4,
          b: -1
        },
        "5": {
          a: 38e4,
          b: 1e5
        },
        "10": {
          a: -1,
          b: 3e6
        }
      },
      "/items/berserk": {
        "0": {
          a: 195e3,
          b: 19e4
        }
      },
      "/items/birch_bow": {
        "0": {
          a: 23500,
          b: 18e3
        },
        "2": {
          a: 145e3,
          b: -1
        },
        "5": {
          a: 4e5,
          b: -1
        },
        "6": {
          a: 7e5,
          b: -1
        }
      },
      "/items/birch_crossbow": {
        "0": {
          a: 34e3,
          b: 13e3
        },
        "1": {
          a: 56e5,
          b: -1
        },
        "3": {
          a: 145e3,
          b: -1
        },
        "4": {
          a: 2e5,
          b: -1
        },
        "6": {
          a: 14e5,
          b: -1
        }
      },
      "/items/birch_fire_staff": {
        "0": {
          a: 19e3,
          b: 17500
        },
        "1": {
          a: 49e3,
          b: -1
        },
        "2": {
          a: 49e3,
          b: -1
        },
        "3": {
          a: 145e3,
          b: -1
        },
        "5": {
          a: 7e5,
          b: -1
        }
      },
      "/items/birch_log": {
        "0": {
          a: 70,
          b: 68
        }
      },
      "/items/birch_lumber": {
        "0": {
          a: 560,
          b: 540
        }
      },
      "/items/birch_nature_staff": {
        "0": {
          a: 26e3,
          b: 18500
        },
        "2": {
          a: 56e3,
          b: -1
        },
        "8": {
          a: 115e4,
          b: -1
        },
        "10": {
          a: 22e6,
          b: -1
        }
      },
      "/items/birch_shield": {
        "0": {
          a: 13e3,
          b: 4100
        }
      },
      "/items/birch_water_staff": {
        "0": {
          a: 21e3,
          b: 17500
        },
        "1": {
          a: 47e3,
          b: -1
        },
        "2": {
          a: 28e4,
          b: -1
        },
        "3": {
          a: 34e4,
          b: -1
        }
      },
      "/items/bishops_codex": {
        "0": {
          a: 98e6,
          b: 96e6
        },
        "1": {
          a: -1,
          b: 8e7
        },
        "2": {
          a: -1,
          b: 8e7
        },
        "3": {
          a: -1,
          b: 8e7
        },
        "4": {
          a: -1,
          b: 8e7
        },
        "5": {
          a: 1e8,
          b: 96e6
        },
        "6": {
          a: -1,
          b: 9e7
        },
        "7": {
          a: 125e6,
          b: 115e6
        },
        "8": {
          a: 16e7,
          b: 14e7
        },
        "9": {
          a: -1,
          b: 18e7
        },
        "10": {
          a: 36e7,
          b: 35e7
        },
        "11": {
          a: -1,
          b: 44e7
        },
        "12": {
          a: 12e8,
          b: 105e7
        },
        "13": {
          a: 2e9,
          b: 19e8
        }
      },
      "/items/bishops_codex_refined": {
        "10": {
          a: 7e8,
          b: 68e7
        }
      },
      "/items/bishops_scroll": {
        "0": {
          a: 8e6,
          b: 78e5
        }
      },
      "/items/black_bear_fluff": {
        "0": {
          a: 125e3,
          b: 12e4
        }
      },
      "/items/black_bear_shoes": {
        "0": {
          a: 72e4,
          b: 7e5
        },
        "2": {
          a: 74e4,
          b: -1
        },
        "3": {
          a: 94e4,
          b: -1
        },
        "5": {
          a: 12e5,
          b: -1
        },
        "6": {
          a: 17e5,
          b: -1
        },
        "7": {
          a: 32e5,
          b: -1
        },
        "8": {
          a: 45e5,
          b: -1
        },
        "9": {
          a: 9e6,
          b: -1
        },
        "10": {
          a: 13e6,
          b: 125e5
        },
        "11": {
          a: 24e6,
          b: -1
        },
        "12": {
          a: 47e6,
          b: 43e6
        },
        "13": {
          a: 9e7,
          b: -1
        },
        "14": {
          a: 165e6,
          b: 155e6
        },
        "15": {
          a: 32e7,
          b: -1
        },
        "16": {
          a: 62e7,
          b: -1
        }
      },
      "/items/black_tea_leaf": {
        "0": {
          a: 17,
          b: 16
        }
      },
      "/items/blackberry": {
        "0": {
          a: 98,
          b: 96
        }
      },
      "/items/blackberry_cake": {
        "0": {
          a: 800,
          b: 780
        }
      },
      "/items/blackberry_donut": {
        "0": {
          a: 700,
          b: 680
        }
      },
      "/items/blazing_trident": {
        "0": {
          a: 25e7,
          b: 24e7
        },
        "1": {
          a: -1,
          b: 205e6
        },
        "2": {
          a: -1,
          b: 205e6
        },
        "3": {
          a: -1,
          b: 195e6
        },
        "4": {
          a: -1,
          b: 21e7
        },
        "5": {
          a: 25e7,
          b: 21e7
        },
        "6": {
          a: -1,
          b: 21e7
        },
        "7": {
          a: 28e7,
          b: 265e6
        },
        "8": {
          a: 38e7,
          b: 31e7
        },
        "9": {
          a: -1,
          b: 36e7
        },
        "10": {
          a: 62e7,
          b: 6e8
        },
        "11": {
          a: 115e7,
          b: 86e7
        },
        "12": {
          a: 175e7,
          b: 155e7
        },
        "14": {
          a: -1,
          b: 4e9
        }
      },
      "/items/blazing_trident_refined": {
        "0": {
          a: -1,
          b: 5e6
        },
        "10": {
          a: 17e8,
          b: 16e8
        },
        "12": {
          a: -1,
          b: 11e7
        },
        "14": {
          a: 86e8,
          b: -1
        }
      },
      "/items/blessed_tea": {
        "0": {
          a: 1750,
          b: 1650
        }
      },
      "/items/blooming_trident": {
        "0": {
          a: 27e7,
          b: 265e6
        },
        "1": {
          a: -1,
          b: 205e6
        },
        "2": {
          a: -1,
          b: 205e6
        },
        "3": {
          a: -1,
          b: 205e6
        },
        "4": {
          a: -1,
          b: 21e7
        },
        "5": {
          a: -1,
          b: 25e7
        },
        "6": {
          a: -1,
          b: 255e6
        },
        "7": {
          a: 295e6,
          b: 285e6
        },
        "8": {
          a: -1,
          b: 34e7
        },
        "9": {
          a: -1,
          b: 35e7
        },
        "10": {
          a: 66e7,
          b: 62e7
        },
        "11": {
          a: -1,
          b: 68e7
        },
        "12": {
          a: 185e7,
          b: 175e7
        },
        "13": {
          a: 31e8,
          b: -1
        },
        "14": {
          a: 64e8,
          b: -1
        }
      },
      "/items/blooming_trident_refined": {
        "10": {
          a: -1,
          b: 105e7
        },
        "14": {
          a: 72e8,
          b: -1
        }
      },
      "/items/blue_key_fragment": {
        "0": {
          a: 74e4,
          b: 72e4
        }
      },
      "/items/blueberry": {
        "0": {
          a: 72,
          b: 70
        }
      },
      "/items/blueberry_cake": {
        "0": {
          a: 720,
          b: 660
        }
      },
      "/items/blueberry_donut": {
        "0": {
          a: 620,
          b: 600
        }
      },
      "/items/branch_of_insight": {
        "0": {
          a: 21e6,
          b: 205e5
        }
      },
      "/items/brewers_bottoms": {
        "0": {
          a: -1,
          b: 33e6
        },
        "5": {
          a: 22e7,
          b: -1
        },
        "7": {
          a: 24e7,
          b: 22e7
        },
        "8": {
          a: 275e6,
          b: 25e7
        },
        "9": {
          a: -1,
          b: 235e6
        },
        "10": {
          a: 41e7,
          b: 39e7
        },
        "12": {
          a: -1,
          b: 6e8
        }
      },
      "/items/brewers_top": {
        "0": {
          a: 28e7,
          b: -1
        },
        "5": {
          a: 185e6,
          b: 155e6
        },
        "6": {
          a: 19e7,
          b: 165e6
        },
        "7": {
          a: 23e7,
          b: 19e7
        },
        "8": {
          a: 235e6,
          b: 64e6
        },
        "9": {
          a: -1,
          b: 235e6
        },
        "10": {
          a: 38e7,
          b: 37e7
        },
        "12": {
          a: 115e7,
          b: -1
        }
      },
      "/items/brewing_essence": {
        "0": {
          a: 200,
          b: 195
        }
      },
      "/items/brewing_tea": {
        "0": {
          a: 520,
          b: 470
        }
      },
      "/items/brown_key_fragment": {
        "0": {
          a: 96e4,
          b: 94e4
        }
      },
      "/items/burble_alembic": {
        "0": {
          a: 98e3,
          b: 94e3
        },
        "3": {
          a: 39e4,
          b: -1
        },
        "5": {
          a: -1,
          b: 4e5
        }
      },
      "/items/burble_boots": {
        "0": {
          a: 62e3,
          b: 52e3
        },
        "1": {
          a: 62e3,
          b: -1
        },
        "2": {
          a: 28e4,
          b: -1
        },
        "3": {
          a: 32e4,
          b: -1
        }
      },
      "/items/burble_brush": {
        "0": {
          a: 98e3,
          b: 9e4
        },
        "1": {
          a: 145e3,
          b: -1
        },
        "2": {
          a: 2e5,
          b: -1
        },
        "3": {
          a: 35e4,
          b: -1
        },
        "5": {
          a: 5e5,
          b: -1
        },
        "20": {
          a: -1,
          b: 88e3
        }
      },
      "/items/burble_buckler": {
        "0": {
          a: 76e3,
          b: 6e4
        },
        "1": {
          a: 14e4,
          b: -1
        },
        "7": {
          a: 5e8,
          b: -1
        }
      },
      "/items/burble_bulwark": {
        "0": {
          a: 125e3,
          b: 11e4
        },
        "2": {
          a: 44e5,
          b: -1
        },
        "5": {
          a: 3e5,
          b: -1
        }
      },
      "/items/burble_cheese": {
        "0": {
          a: 1250,
          b: 1200
        }
      },
      "/items/burble_chisel": {
        "0": {
          a: 96e3,
          b: 8e4
        },
        "1": {
          a: 185e3,
          b: 5200
        },
        "2": {
          a: -1,
          b: 5200
        },
        "3": {
          a: 37e4,
          b: 5200
        }
      },
      "/items/burble_enhancer": {
        "0": {
          a: 98e3,
          b: 86e3
        },
        "1": {
          a: 11e4,
          b: -1
        },
        "2": {
          a: 12e4,
          b: -1
        },
        "3": {
          a: 145e3,
          b: -1
        },
        "4": {
          a: 175e3,
          b: -1
        },
        "5": {
          a: 16e4,
          b: -1
        },
        "6": {
          a: 115e4,
          b: -1
        },
        "7": {
          a: 62e5,
          b: -1
        }
      },
      "/items/burble_gauntlets": {
        "0": {
          a: 62e3,
          b: 58e3
        },
        "1": {
          a: 9e4,
          b: 2900
        },
        "2": {
          a: 16e4,
          b: 2900
        },
        "3": {
          a: 3e5,
          b: 2900
        },
        "4": {
          a: -1,
          b: 2900
        },
        "5": {
          a: 5e5,
          b: -1
        },
        "6": {
          a: 7e5,
          b: 2900
        }
      },
      "/items/burble_hammer": {
        "0": {
          a: 11e4,
          b: 92e3
        },
        "1": {
          a: 125e3,
          b: -1
        },
        "2": {
          a: 3e5,
          b: -1
        },
        "3": {
          a: 39e4,
          b: -1
        }
      },
      "/items/burble_hatchet": {
        "0": {
          a: 98e3,
          b: 86e3
        },
        "1": {
          a: 145e3,
          b: -1
        },
        "2": {
          a: 17e4,
          b: -1
        },
        "3": {
          a: 34e4,
          b: -1
        },
        "8": {
          a: 25e5,
          b: -1
        },
        "20": {
          a: -1,
          b: 34e4
        }
      },
      "/items/burble_helmet": {
        "0": {
          a: 74e3,
          b: 7e4
        },
        "1": {
          a: 115e3,
          b: -1
        }
      },
      "/items/burble_mace": {
        "0": {
          a: 12e4,
          b: 11e4
        },
        "3": {
          a: 34e4,
          b: -1
        },
        "5": {
          a: 5e5,
          b: -1
        },
        "6": {
          a: 72e4,
          b: -1
        }
      },
      "/items/burble_milk": {
        "0": {
          a: 255,
          b: 240
        }
      },
      "/items/burble_needle": {
        "0": {
          a: 98e3,
          b: 92e3
        },
        "2": {
          a: 245e4,
          b: -1
        },
        "3": {
          a: 39e4,
          b: -1
        }
      },
      "/items/burble_plate_body": {
        "0": {
          a: 11e4,
          b: 105e3
        },
        "1": {
          a: 11e4,
          b: -1
        },
        "3": {
          a: 3e5,
          b: -1
        },
        "5": {
          a: 94e4,
          b: -1
        }
      },
      "/items/burble_plate_legs": {
        "0": {
          a: 96e3,
          b: 94e3
        },
        "1": {
          a: 185e3,
          b: -1
        },
        "3": {
          a: 32e4,
          b: -1
        },
        "5": {
          a: 54e4,
          b: -1
        },
        "10": {
          a: 76e5,
          b: -1
        }
      },
      "/items/burble_pot": {
        "0": {
          a: 105e3,
          b: 84e3
        },
        "1": {
          a: 1e5,
          b: -1
        },
        "2": {
          a: 24e4,
          b: -1
        },
        "3": {
          a: 38e4,
          b: -1
        }
      },
      "/items/burble_shears": {
        "0": {
          a: 96e3,
          b: 9e4
        },
        "1": {
          a: 33e4,
          b: -1
        },
        "2": {
          a: 49e4,
          b: -1
        },
        "3": {
          a: 38e4,
          b: -1
        },
        "4": {
          a: 76e4,
          b: -1
        },
        "5": {
          a: -1,
          b: 64e4
        }
      },
      "/items/burble_spatula": {
        "0": {
          a: 12e4,
          b: 98e3
        },
        "2": {
          a: 23e4,
          b: -1
        },
        "3": {
          a: 38e4,
          b: -1
        }
      },
      "/items/burble_spear": {
        "0": {
          a: 115e3,
          b: 11e4
        },
        "3": {
          a: 2e5,
          b: -1
        },
        "5": {
          a: 295e3,
          b: -1
        },
        "6": {
          a: 56e4,
          b: -1
        }
      },
      "/items/burble_sword": {
        "0": {
          a: 12e4,
          b: 115e3
        },
        "1": {
          a: 12e4,
          b: 6600
        },
        "2": {
          a: 12e4,
          b: 6600
        },
        "3": {
          a: 18e4,
          b: 6600
        },
        "5": {
          a: 4e5,
          b: -1
        },
        "6": {
          a: 56e4,
          b: -1
        }
      },
      "/items/burble_tea_leaf": {
        "0": {
          a: 26,
          b: 24
        }
      },
      "/items/burning_key_fragment": {
        "0": {
          a: 205e4,
          b: 2e6
        }
      },
      "/items/butter_of_proficiency": {
        "0": {
          a: 13e6,
          b: 125e5
        }
      },
      "/items/catalyst_of_coinification": {
        "0": {
          a: 4200,
          b: 4100
        }
      },
      "/items/catalyst_of_decomposition": {
        "0": {
          a: 4600,
          b: 4500
        }
      },
      "/items/catalyst_of_transmutation": {
        "0": {
          a: 8200,
          b: 8e3
        }
      },
      "/items/catalytic_tea": {
        "0": {
          a: 1650,
          b: 1600
        }
      },
      "/items/cedar_bow": {
        "0": {
          a: 66e3,
          b: 52e3
        },
        "3": {
          a: 5e5,
          b: -1
        },
        "5": {
          a: 33e5,
          b: -1
        }
      },
      "/items/cedar_crossbow": {
        "0": {
          a: 72e3,
          b: 52e3
        },
        "2": {
          a: 8e4,
          b: -1
        },
        "3": {
          a: 98e3,
          b: -1
        },
        "5": {
          a: 35e4,
          b: -1
        },
        "7": {
          a: 46e5,
          b: -1
        }
      },
      "/items/cedar_fire_staff": {
        "0": {
          a: 54e3,
          b: 48e3
        },
        "1": {
          a: 82e3,
          b: -1
        },
        "2": {
          a: 13e4,
          b: -1
        },
        "4": {
          a: 49e4,
          b: -1
        },
        "5": {
          a: 3e5,
          b: -1
        }
      },
      "/items/cedar_log": {
        "0": {
          a: 200,
          b: 190
        }
      },
      "/items/cedar_lumber": {
        "0": {
          a: 1050,
          b: 1e3
        }
      },
      "/items/cedar_nature_staff": {
        "0": {
          a: 58e3,
          b: 56e3
        },
        "1": {
          a: 98e3,
          b: -1
        },
        "2": {
          a: 98e3,
          b: -1
        },
        "4": {
          a: 49e4,
          b: -1
        },
        "7": {
          a: 6e5,
          b: -1
        }
      },
      "/items/cedar_shield": {
        "0": {
          a: 4e4,
          b: 31e3
        },
        "1": {
          a: 5e4,
          b: -1
        },
        "2": {
          a: 145e3,
          b: -1
        },
        "3": {
          a: 56e3,
          b: -1
        },
        "4": {
          a: 52e4,
          b: -1
        }
      },
      "/items/cedar_water_staff": {
        "0": {
          a: 58e3,
          b: 5e4
        },
        "1": {
          a: 14e4,
          b: -1
        },
        "2": {
          a: 16e4,
          b: -1
        },
        "5": {
          a: 35e4,
          b: -1
        },
        "7": {
          a: 5e5,
          b: -1
        }
      },
      "/items/celestial_alembic": {
        "0": {
          a: -1,
          b: 22e6
        },
        "6": {
          a: -1,
          b: 76e5
        },
        "7": {
          a: 44e7,
          b: 41e7
        },
        "8": {
          a: 52e7,
          b: 47e7
        },
        "10": {
          a: 82e7,
          b: 8e8
        },
        "20": {
          a: -1,
          b: 5e6
        }
      },
      "/items/celestial_brush": {
        "0": {
          a: 35e7,
          b: 23e7
        },
        "5": {
          a: -1,
          b: 22e7
        },
        "6": {
          a: -1,
          b: 225e6
        },
        "7": {
          a: 41e7,
          b: 38e7
        },
        "8": {
          a: 47e7,
          b: 42e7
        },
        "10": {
          a: 74e7,
          b: 7e8
        },
        "12": {
          a: -1,
          b: 12e8
        },
        "14": {
          a: -1,
          b: 25e8
        },
        "20": {
          a: -1,
          b: 15e7
        }
      },
      "/items/celestial_chisel": {
        "0": {
          a: -1,
          b: 115e6
        },
        "5": {
          a: -1,
          b: 36e7
        },
        "7": {
          a: 42e7,
          b: 37e7
        },
        "8": {
          a: 49e7,
          b: 47e7
        },
        "10": {
          a: 74e7,
          b: 72e7
        }
      },
      "/items/celestial_enhancer": {
        "0": {
          a: 45e7,
          b: 4e8
        },
        "10": {
          a: 1e9,
          b: 9e8
        },
        "11": {
          a: 15e8,
          b: -1
        },
        "12": {
          a: 25e8,
          b: -1
        },
        "13": {
          a: 47e8,
          b: -1
        },
        "14": {
          a: 92e8,
          b: 215e5
        },
        "15": {
          a: -1,
          b: 5e9
        }
      },
      "/items/celestial_hammer": {
        "0": {
          a: -1,
          b: 175e6
        },
        "1": {
          a: -1,
          b: 255e5
        },
        "2": {
          a: -1,
          b: 175e5
        },
        "5": {
          a: -1,
          b: 24e7
        },
        "6": {
          a: -1,
          b: 3e8
        },
        "7": {
          a: 43e7,
          b: 37e7
        },
        "8": {
          a: 49e7,
          b: 38e7
        },
        "10": {
          a: 76e7,
          b: 41e7
        }
      },
      "/items/celestial_hatchet": {
        "0": {
          a: -1,
          b: 22e7
        },
        "5": {
          a: -1,
          b: 255e6
        },
        "7": {
          a: 4e8,
          b: 39e7
        },
        "8": {
          a: -1,
          b: 4e8
        },
        "9": {
          a: 62e7,
          b: 14e7
        },
        "10": {
          a: 74e7,
          b: 7e8
        }
      },
      "/items/celestial_needle": {
        "0": {
          a: 41e7,
          b: 7e7
        },
        "1": {
          a: -1,
          b: 275e5
        },
        "5": {
          a: -1,
          b: 2e8
        },
        "6": {
          a: -1,
          b: 34e7
        },
        "7": {
          a: 4e8,
          b: 37e7
        },
        "8": {
          a: 47e7,
          b: 4e8
        },
        "10": {
          a: 72e7,
          b: 68e7
        },
        "20": {
          a: -1,
          b: 52e5
        }
      },
      "/items/celestial_pot": {
        "0": {
          a: -1,
          b: 58e5
        },
        "6": {
          a: 36e7,
          b: 3e8
        },
        "7": {
          a: 4e8,
          b: 35e7
        },
        "8": {
          a: 46e7,
          b: 43e7
        },
        "10": {
          a: 72e7,
          b: 66e7
        },
        "12": {
          a: -1,
          b: 44e7
        }
      },
      "/items/celestial_shears": {
        "0": {
          a: -1,
          b: 27e7
        },
        "1": {
          a: -1,
          b: 15e6
        },
        "2": {
          a: -1,
          b: 2e8
        },
        "3": {
          a: 39e7,
          b: -1
        },
        "5": {
          a: -1,
          b: 35e7
        },
        "7": {
          a: 41e7,
          b: 37e7
        },
        "8": {
          a: 46e7,
          b: 4e8
        },
        "10": {
          a: 74e7,
          b: 68e7
        },
        "11": {
          a: 12e8,
          b: 58e7
        },
        "12": {
          a: -1,
          b: 13e8
        },
        "20": {
          a: -1,
          b: 5e6
        }
      },
      "/items/celestial_spatula": {
        "0": {
          a: -1,
          b: 14e7
        },
        "4": {
          a: -1,
          b: 82e5
        },
        "5": {
          a: -1,
          b: 34e7
        },
        "6": {
          a: 4e8,
          b: 36e7
        },
        "7": {
          a: 42e7,
          b: 38e7
        },
        "8": {
          a: 48e7,
          b: 4e8
        },
        "10": {
          a: 74e7,
          b: 72e7
        },
        "14": {
          a: -1,
          b: 62e8
        }
      },
      "/items/centaur_boots": {
        "0": {
          a: 9e5,
          b: 86e4
        },
        "1": {
          a: -1,
          b: 7e5
        },
        "2": {
          a: 9e5,
          b: 7e5
        },
        "5": {
          a: 12e5,
          b: 115e4
        },
        "6": {
          a: 16e5,
          b: 15e5
        },
        "7": {
          a: 26e5,
          b: 25e5
        },
        "8": {
          a: 88e5,
          b: 4e6
        },
        "9": {
          a: 8e6,
          b: -1
        },
        "10": {
          a: 135e5,
          b: 13e6
        },
        "11": {
          a: 24e6,
          b: 14e6
        },
        "12": {
          a: 45e6,
          b: 42e6
        },
        "13": {
          a: 88e6,
          b: 8e7
        },
        "14": {
          a: 18e7,
          b: 17e7
        },
        "15": {
          a: 34e7,
          b: -1
        },
        "16": {
          a: 9e8,
          b: 88e4
        }
      },
      "/items/centaur_hoof": {
        "0": {
          a: 18e4,
          b: 175e3
        }
      },
      "/items/channeling_coffee": {
        "0": {
          a: 3100,
          b: 3e3
        }
      },
      "/items/chaotic_chain": {
        "0": {
          a: 98e5,
          b: 96e5
        }
      },
      "/items/chaotic_flail": {
        "0": {
          a: 23e7,
          b: 22e7
        },
        "1": {
          a: -1,
          b: 16e7
        },
        "2": {
          a: -1,
          b: 165e6
        },
        "3": {
          a: -1,
          b: 165e6
        },
        "4": {
          a: -1,
          b: 16e7
        },
        "5": {
          a: 255e6,
          b: 225e6
        },
        "6": {
          a: -1,
          b: 17e7
        },
        "7": {
          a: 265e6,
          b: 255e6
        },
        "8": {
          a: 31e7,
          b: 275e6
        },
        "9": {
          a: -1,
          b: 3e8
        },
        "10": {
          a: 58e7,
          b: 54e7
        },
        "12": {
          a: 165e7,
          b: 155e7
        }
      },
      "/items/chaotic_flail_refined": {
        "0": {
          a: -1,
          b: 54e5
        },
        "10": {
          a: -1,
          b: 11e8
        },
        "12": {
          a: -1,
          b: 7e8
        },
        "14": {
          a: -1,
          b: 64e8
        }
      },
      "/items/cheese": {
        "0": {
          a: 440,
          b: 430
        }
      },
      "/items/cheese_alembic": {
        "0": {
          a: 5e3,
          b: 4300
        },
        "1": {
          a: 9200,
          b: -1
        },
        "2": {
          a: 9e7,
          b: -1
        },
        "3": {
          a: 14e3,
          b: -1
        },
        "6": {
          a: 42e4,
          b: -1
        },
        "8": {
          a: 6e5,
          b: -1
        }
      },
      "/items/cheese_boots": {
        "0": {
          a: 3700,
          b: 3600
        },
        "1": {
          a: 175e4,
          b: -1
        },
        "2": {
          a: 15e5,
          b: -1
        },
        "4": {
          a: 38e4,
          b: -1
        },
        "10": {
          a: 4e6,
          b: -1
        },
        "12": {
          a: 45e5,
          b: -1
        },
        "13": {
          a: 1e7,
          b: -1
        }
      },
      "/items/cheese_brush": {
        "0": {
          a: 4e3,
          b: 3800
        },
        "1": {
          a: 5800,
          b: -1
        },
        "2": {
          a: 5e3,
          b: -1
        },
        "3": {
          a: 6600,
          b: -1
        },
        "4": {
          a: 8200,
          b: -1
        },
        "5": {
          a: 8800,
          b: -1
        },
        "6": {
          a: 13e4,
          b: -1
        },
        "10": {
          a: 245e4,
          b: -1
        }
      },
      "/items/cheese_buckler": {
        "0": {
          a: 4300,
          b: 3800
        },
        "1": {
          a: 46e3,
          b: -1
        },
        "2": {
          a: 78e3,
          b: -1
        },
        "5": {
          a: 1e6,
          b: -1
        },
        "7": {
          a: 28e4,
          b: -1
        },
        "8": {
          a: 25e5,
          b: -1
        },
        "9": {
          a: 3e6,
          b: -1
        }
      },
      "/items/cheese_bulwark": {
        "0": {
          a: 6400,
          b: 4800
        },
        "1": {
          a: 9e4,
          b: -1
        },
        "2": {
          a: 35e3,
          b: -1
        },
        "4": {
          a: 86e3,
          b: -1
        },
        "5": {
          a: 88e3,
          b: -1
        },
        "12": {
          a: 38e6,
          b: -1
        }
      },
      "/items/cheese_chisel": {
        "0": {
          a: 5e3,
          b: 4800
        },
        "5": {
          a: 22e4,
          b: -1
        }
      },
      "/items/cheese_enhancer": {
        "0": {
          a: 5200,
          b: 4800
        },
        "1": {
          a: 3e4,
          b: -1
        },
        "5": {
          a: 6e4,
          b: -1
        },
        "7": {
          a: 6e5,
          b: -1
        },
        "10": {
          a: 15e5,
          b: -1
        }
      },
      "/items/cheese_gauntlets": {
        "0": {
          a: 3700,
          b: 3600
        },
        "1": {
          a: 25e3,
          b: -1
        },
        "2": {
          a: 49e3,
          b: -1
        },
        "4": {
          a: 52e3,
          b: -1
        },
        "5": {
          a: 64e3,
          b: -1
        },
        "6": {
          a: 1e5,
          b: -1
        },
        "9": {
          a: 16e6,
          b: -1
        },
        "12": {
          a: 4e6,
          b: -1
        },
        "13": {
          a: 82e5,
          b: 48e5
        }
      },
      "/items/cheese_hammer": {
        "0": {
          a: 5200,
          b: 4600
        },
        "1": {
          a: 5e3,
          b: -1
        },
        "2": {
          a: 14e3,
          b: -1
        }
      },
      "/items/cheese_hatchet": {
        "0": {
          a: 4600,
          b: 4100
        },
        "1": {
          a: 5e7,
          b: -1
        },
        "2": {
          a: 7e3,
          b: -1
        },
        "10": {
          a: 45e5,
          b: -1
        }
      },
      "/items/cheese_helmet": {
        "0": {
          a: 4600,
          b: 4300
        },
        "1": {
          a: 1e5,
          b: -1
        },
        "3": {
          a: 115e3,
          b: -1
        }
      },
      "/items/cheese_mace": {
        "0": {
          a: 5e3,
          b: 4200
        },
        "1": {
          a: 48e5,
          b: -1
        },
        "2": {
          a: 1e5,
          b: -1
        },
        "5": {
          a: 1e5,
          b: -1
        }
      },
      "/items/cheese_needle": {
        "0": {
          a: 5e3,
          b: 4500
        },
        "1": {
          a: 245e3,
          b: -1
        },
        "5": {
          a: 7e5,
          b: -1
        }
      },
      "/items/cheese_plate_body": {
        "0": {
          a: 6600,
          b: 4800
        },
        "1": {
          a: 11e3,
          b: -1
        },
        "5": {
          a: 1e6,
          b: -1
        },
        "10": {
          a: 6e6,
          b: -1
        }
      },
      "/items/cheese_plate_legs": {
        "0": {
          a: 6e3,
          b: 4900
        }
      },
      "/items/cheese_pot": {
        "0": {
          a: 4800,
          b: 4600
        },
        "1": {
          a: 3e4,
          b: -1
        },
        "5": {
          a: 11e4,
          b: -1
        }
      },
      "/items/cheese_shears": {
        "0": {
          a: 4900,
          b: 4100
        },
        "1": {
          a: 5600,
          b: -1
        },
        "3": {
          a: 12e3,
          b: -1
        },
        "5": {
          a: 98e3,
          b: -1
        }
      },
      "/items/cheese_spatula": {
        "0": {
          a: 7200,
          b: 4500
        },
        "2": {
          a: 5e4,
          b: -1
        }
      },
      "/items/cheese_spear": {
        "0": {
          a: 5200,
          b: 5e3
        },
        "1": {
          a: 5e3,
          b: -1
        },
        "3": {
          a: 2e5,
          b: -1
        }
      },
      "/items/cheese_sword": {
        "0": {
          a: 5200,
          b: 4800
        },
        "1": {
          a: 5e3,
          b: -1
        },
        "3": {
          a: 43e3,
          b: -1
        },
        "4": {
          a: 9e4,
          b: -1
        },
        "5": {
          a: 9e4,
          b: -1
        },
        "7": {
          a: 1e6,
          b: -1
        },
        "8": {
          a: 37e5,
          b: -1
        },
        "10": {
          a: 35e6,
          b: -1
        },
        "12": {
          a: 98e5,
          b: -1
        },
        "15": {
          a: 45e6,
          b: -1
        }
      },
      "/items/cheesemakers_bottoms": {
        "0": {
          a: -1,
          b: 145e6
        },
        "5": {
          a: 23e7,
          b: -1
        },
        "7": {
          a: 255e6,
          b: 21e7
        },
        "8": {
          a: 295e6,
          b: -1
        },
        "10": {
          a: 47e7,
          b: 4e8
        }
      },
      "/items/cheesemakers_top": {
        "0": {
          a: -1,
          b: 8e7
        },
        "5": {
          a: 2e8,
          b: 105e6
        },
        "6": {
          a: 21e7,
          b: 13e7
        },
        "7": {
          a: 21e7,
          b: -1
        },
        "8": {
          a: 25e7,
          b: 84e5
        },
        "10": {
          a: 43e7,
          b: -1
        }
      },
      "/items/cheesesmithing_essence": {
        "0": {
          a: 340,
          b: 330
        }
      },
      "/items/cheesesmithing_tea": {
        "0": {
          a: 740,
          b: 640
        }
      },
      "/items/chefs_bottoms": {
        "0": {
          a: -1,
          b: 14e7
        },
        "5": {
          a: 24e7,
          b: 19e7
        },
        "6": {
          a: -1,
          b: 12e7
        },
        "7": {
          a: 245e6,
          b: 21e7
        },
        "8": {
          a: 285e6,
          b: 26e7
        },
        "10": {
          a: 46e7,
          b: 39e7
        }
      },
      "/items/chefs_top": {
        "0": {
          a: -1,
          b: 3e7
        },
        "5": {
          a: 195e6,
          b: -1
        },
        "6": {
          a: 1e11,
          b: 35e5
        },
        "7": {
          a: 21e7,
          b: -1
        },
        "8": {
          a: 25e7,
          b: 205e6
        },
        "10": {
          a: 42e7,
          b: 39e7
        }
      },
      "/items/chimerical_chest_key": {
        "0": {
          a: 28e5,
          b: 275e4
        }
      },
      "/items/chimerical_entry_key": {
        "0": {
          a: 38e4,
          b: 36e4
        }
      },
      "/items/chimerical_essence": {
        "0": {
          a: 840,
          b: 820
        }
      },
      "/items/chimerical_refinement_shard": {
        "0": {
          a: 2e6,
          b: 185e4
        }
      },
      "/items/chrono_gloves": {
        "0": {
          a: 68e5,
          b: 64e5
        },
        "3": {
          a: -1,
          b: 36e5
        },
        "4": {
          a: -1,
          b: 37e5
        },
        "5": {
          a: 88e5,
          b: 76e5
        },
        "6": {
          a: 98e5,
          b: 94e5
        },
        "7": {
          a: 15e6,
          b: 12e6
        },
        "8": {
          a: 205e5,
          b: 2e7
        },
        "9": {
          a: -1,
          b: 27e6
        },
        "10": {
          a: 56e6,
          b: 54e6
        },
        "11": {
          a: -1,
          b: 105e6
        },
        "12": {
          a: 21e7,
          b: 205e6
        },
        "13": {
          a: 44e7,
          b: -1
        },
        "14": {
          a: 88e7,
          b: 8e8
        },
        "15": {
          a: 175e7,
          b: -1
        },
        "16": {
          a: 34e8,
          b: -1
        }
      },
      "/items/chrono_sphere": {
        "0": {
          a: 82e4,
          b: 8e5
        }
      },
      "/items/cleave": {
        "0": {
          a: 34e3,
          b: 32e3
        }
      },
      "/items/cocoon": {
        "0": {
          a: 320,
          b: 300
        }
      },
      "/items/collectors_boots": {
        "0": {
          a: 38e5,
          b: 35e5
        },
        "2": {
          a: -1,
          b: 295e4
        },
        "3": {
          a: 44e5,
          b: 34e5
        },
        "4": {
          a: -1,
          b: 38e5
        },
        "5": {
          a: 54e5,
          b: 47e5
        },
        "6": {
          a: 72e5,
          b: 2e5
        },
        "7": {
          a: 96e5,
          b: -1
        },
        "8": {
          a: 16e6,
          b: 9e6
        },
        "9": {
          a: 28e6,
          b: -1
        },
        "10": {
          a: 39e6,
          b: 36e6
        },
        "12": {
          a: 125e6,
          b: 105e6
        },
        "13": {
          a: -1,
          b: 205e6
        },
        "15": {
          a: -1,
          b: 31e7
        },
        "20": {
          a: -1,
          b: 44e7
        }
      },
      "/items/colossus_core": {
        "0": {
          a: 92e4,
          b: 9e5
        }
      },
      "/items/colossus_plate_body": {
        "0": {
          a: 92e5,
          b: 84e5
        },
        "1": {
          a: -1,
          b: 8e6
        },
        "2": {
          a: 9e6,
          b: 8e6
        },
        "3": {
          a: -1,
          b: 8e6
        },
        "5": {
          a: 96e5,
          b: 82e5
        },
        "6": {
          a: 125e5,
          b: -1
        },
        "7": {
          a: 195e5,
          b: 175e5
        },
        "8": {
          a: 295e5,
          b: -1
        },
        "9": {
          a: 38e6,
          b: -1
        },
        "10": {
          a: 6e7,
          b: 41e6
        },
        "12": {
          a: 31e7,
          b: 1e7
        }
      },
      "/items/colossus_plate_legs": {
        "0": {
          a: 74e5,
          b: 64e5
        },
        "5": {
          a: 76e5,
          b: 6e6
        },
        "6": {
          a: 12e6,
          b: -1
        },
        "7": {
          a: 18e6,
          b: 145e5
        },
        "8": {
          a: 3e7,
          b: 12e6
        },
        "10": {
          a: 52e6,
          b: 32e6
        },
        "12": {
          a: -1,
          b: 1e7
        }
      },
      "/items/cooking_essence": {
        "0": {
          a: 290,
          b: 285
        }
      },
      "/items/cooking_tea": {
        "0": {
          a: 740,
          b: 620
        }
      },
      "/items/corsair_crest": {
        "0": {
          a: 84e5,
          b: 82e5
        }
      },
      "/items/corsair_helmet": {
        "0": {
          a: 96e6,
          b: 94e6
        },
        "3": {
          a: 13e7,
          b: 43e5
        },
        "5": {
          a: 105e6,
          b: 96e6
        },
        "6": {
          a: 11e7,
          b: 88e6
        },
        "7": {
          a: 12e7,
          b: 115e6
        },
        "8": {
          a: 16e7,
          b: 145e6
        },
        "9": {
          a: 22e7,
          b: 21e7
        },
        "10": {
          a: 37e7,
          b: 36e7
        },
        "11": {
          a: 64e7,
          b: 5e8
        },
        "12": {
          a: 12e8,
          b: 11e8
        }
      },
      "/items/corsair_helmet_refined": {
        "10": {
          a: 72e7,
          b: 68e7
        },
        "12": {
          a: -1,
          b: 15e8
        },
        "14": {
          a: -1,
          b: 35e5
        }
      },
      "/items/cotton": {
        "0": {
          a: 70,
          b: 64
        }
      },
      "/items/cotton_boots": {
        "0": {
          a: 3600,
          b: 3500
        },
        "1": {
          a: 54e3,
          b: -1
        },
        "2": {
          a: 3e5,
          b: -1
        },
        "10": {
          a: 14e5,
          b: -1
        },
        "11": {
          a: 41e5,
          b: -1
        },
        "12": {
          a: 76e5,
          b: -1
        },
        "20": {
          a: -1,
          b: 64
        }
      },
      "/items/cotton_fabric": {
        "0": {
          a: 420,
          b: 410
        }
      },
      "/items/cotton_gloves": {
        "0": {
          a: 3900,
          b: 2200
        },
        "12": {
          a: -1,
          b: 27e5
        },
        "20": {
          a: -1,
          b: 3800
        }
      },
      "/items/cotton_hat": {
        "0": {
          a: 3800,
          b: 3300
        },
        "3": {
          a: 48e4,
          b: -1
        },
        "20": {
          a: -1,
          b: 80
        }
      },
      "/items/cotton_robe_bottoms": {
        "0": {
          a: 5e3,
          b: 4700
        },
        "2": {
          a: 82e3,
          b: -1
        },
        "3": {
          a: 88e3,
          b: -1
        },
        "5": {
          a: 58e4,
          b: -1
        },
        "20": {
          a: -1,
          b: 115
        }
      },
      "/items/cotton_robe_top": {
        "0": {
          a: 6200,
          b: 5400
        },
        "5": {
          a: 35e4,
          b: -1
        },
        "10": {
          a: 1e7,
          b: -1
        },
        "20": {
          a: -1,
          b: 130
        }
      },
      "/items/crab_pincer": {
        "0": {
          a: 9200,
          b: 8800
        }
      },
      "/items/crafters_bottoms": {
        "0": {
          a: 35e7,
          b: 265e5
        },
        "5": {
          a: 24e7,
          b: 205e6
        },
        "7": {
          a: 255e6,
          b: 235e6
        },
        "8": {
          a: 3e8,
          b: 265e6
        },
        "10": {
          a: 46e7,
          b: 41e7
        }
      },
      "/items/crafters_top": {
        "5": {
          a: 195e6,
          b: 17e7
        },
        "6": {
          a: 245e6,
          b: 84e5
        },
        "7": {
          a: 215e6,
          b: 2e8
        },
        "8": {
          a: 255e6,
          b: 2e8
        },
        "10": {
          a: 42e7,
          b: 36e7
        }
      },
      "/items/crafting_essence": {
        "0": {
          a: 330,
          b: 320
        }
      },
      "/items/crafting_tea": {
        "0": {
          a: 780,
          b: 640
        }
      },
      "/items/crimson_alembic": {
        "0": {
          a: 18e4,
          b: 17e4
        },
        "1": {
          a: 285e3,
          b: -1
        },
        "2": {
          a: 39e4,
          b: -1
        },
        "3": {
          a: 32e4,
          b: -1
        },
        "5": {
          a: 82e4,
          b: 21e4
        }
      },
      "/items/crimson_boots": {
        "0": {
          a: 115e3,
          b: 98e3
        },
        "1": {
          a: 14e4,
          b: -1
        },
        "2": {
          a: 15e4,
          b: -1
        },
        "3": {
          a: 17e4,
          b: -1
        },
        "5": {
          a: 35e4,
          b: -1
        },
        "6": {
          a: 62e4,
          b: -1
        },
        "8": {
          a: 3e6,
          b: -1
        }
      },
      "/items/crimson_brush": {
        "0": {
          a: 14e4,
          b: 125e3
        },
        "2": {
          a: 26e4,
          b: -1
        },
        "3": {
          a: 45e4,
          b: -1
        },
        "4": {
          a: 12e5,
          b: -1
        },
        "5": {
          a: 165e4,
          b: 7e5
        },
        "8": {
          a: 56e5,
          b: -1
        }
      },
      "/items/crimson_buckler": {
        "0": {
          a: 145e3,
          b: 14e4
        },
        "1": {
          a: 17e4,
          b: -1
        },
        "2": {
          a: 17e4,
          b: -1
        },
        "3": {
          a: 19e4,
          b: -1
        },
        "5": {
          a: 155e4,
          b: -1
        }
      },
      "/items/crimson_bulwark": {
        "0": {
          a: 195e3,
          b: 17e4
        },
        "1": {
          a: 22e4,
          b: -1
        },
        "3": {
          a: 33e4,
          b: -1
        },
        "4": {
          a: 7e5,
          b: -1
        }
      },
      "/items/crimson_cheese": {
        "0": {
          a: 1250,
          b: 1200
        }
      },
      "/items/crimson_chisel": {
        "0": {
          a: 14e4,
          b: 135e3
        },
        "2": {
          a: 33e4,
          b: -1
        },
        "3": {
          a: 43e4,
          b: -1
        },
        "4": {
          a: 82e4,
          b: -1
        },
        "5": {
          a: 19e5,
          b: 27e4
        },
        "6": {
          a: -1,
          b: 205e3
        }
      },
      "/items/crimson_enhancer": {
        "0": {
          a: 175e3,
          b: 16e4
        },
        "1": {
          a: 18e4,
          b: -1
        },
        "2": {
          a: 22e4,
          b: -1
        },
        "3": {
          a: 275e3,
          b: -1
        },
        "4": {
          a: 62e4,
          b: -1
        },
        "5": {
          a: 88e4,
          b: 295e3
        },
        "6": {
          a: 28e5,
          b: 68e4
        },
        "7": {
          a: 58e5,
          b: -1
        },
        "10": {
          a: 68e5,
          b: -1
        }
      },
      "/items/crimson_gauntlets": {
        "0": {
          a: 1e5,
          b: 96e3
        },
        "2": {
          a: 33e4,
          b: -1
        },
        "3": {
          a: 34e4,
          b: -1
        },
        "4": {
          a: 5e5,
          b: -1
        },
        "5": {
          a: 5e5,
          b: -1
        }
      },
      "/items/crimson_hammer": {
        "0": {
          a: 21e4,
          b: 145e3
        },
        "1": {
          a: 3e5,
          b: -1
        },
        "2": {
          a: 35e4,
          b: -1
        },
        "3": {
          a: 43e4,
          b: -1
        },
        "4": {
          a: 1e7,
          b: -1
        },
        "5": {
          a: 155e4,
          b: 3e5
        },
        "6": {
          a: -1,
          b: 42e4
        }
      },
      "/items/crimson_hatchet": {
        "0": {
          a: 16e4,
          b: 135e3
        },
        "1": {
          a: 185e3,
          b: -1
        },
        "3": {
          a: 4e6,
          b: -1
        },
        "5": {
          a: 9e6,
          b: 7e5
        },
        "6": {
          a: 11e6,
          b: -1
        },
        "10": {
          a: 52e6,
          b: -1
        }
      },
      "/items/crimson_helmet": {
        "0": {
          a: 13e4,
          b: 12e4
        },
        "2": {
          a: 185e3,
          b: -1
        },
        "3": {
          a: 33e4,
          b: -1
        },
        "5": {
          a: 19e5,
          b: -1
        },
        "8": {
          a: 6e7,
          b: -1
        }
      },
      "/items/crimson_mace": {
        "0": {
          a: 2e5,
          b: 195e3
        },
        "3": {
          a: 35e4,
          b: -1
        }
      },
      "/items/crimson_milk": {
        "0": {
          a: 350,
          b: 340
        }
      },
      "/items/crimson_needle": {
        "0": {
          a: 175e3,
          b: 14e4
        },
        "1": {
          a: 27e4,
          b: -1
        },
        "2": {
          a: 42e4,
          b: -1
        },
        "3": {
          a: 6e5,
          b: -1
        },
        "4": {
          a: 82e4,
          b: -1
        },
        "5": {
          a: 105e4,
          b: -1
        },
        "10": {
          a: -1,
          b: 13e5
        }
      },
      "/items/crimson_plate_body": {
        "0": {
          a: 19e4,
          b: 185e3
        },
        "1": {
          a: 29e4,
          b: -1
        },
        "4": {
          a: 35e4,
          b: -1
        },
        "5": {
          a: 4e5,
          b: 1e5
        }
      },
      "/items/crimson_plate_legs": {
        "0": {
          a: 175e3,
          b: 17e4
        }
      },
      "/items/crimson_pot": {
        "0": {
          a: 15e4,
          b: 145e3
        },
        "1": {
          a: 18e4,
          b: -1
        },
        "2": {
          a: 23e4,
          b: -1
        },
        "3": {
          a: 42e4,
          b: -1
        },
        "5": {
          a: -1,
          b: 26e4
        }
      },
      "/items/crimson_shears": {
        "0": {
          a: 16e4,
          b: 15e4
        },
        "1": {
          a: 32e4,
          b: -1
        },
        "2": {
          a: -1,
          b: 11e3
        },
        "3": {
          a: 7e5,
          b: 11e3
        },
        "5": {
          a: 26e5,
          b: 235e3
        },
        "6": {
          a: -1,
          b: 54e4
        }
      },
      "/items/crimson_spatula": {
        "0": {
          a: 17e4,
          b: 135e3
        },
        "1": {
          a: 45e5,
          b: -1
        },
        "5": {
          a: 14e5,
          b: 285e3
        }
      },
      "/items/crimson_spear": {
        "0": {
          a: 2e5,
          b: 195e3
        },
        "1": {
          a: 245e3,
          b: -1
        },
        "2": {
          a: 4e5,
          b: -1
        },
        "3": {
          a: 88e4,
          b: 76e4
        },
        "6": {
          a: 1e6,
          b: -1
        }
      },
      "/items/crimson_sword": {
        "0": {
          a: 215e3,
          b: 2e5
        },
        "1": {
          a: 22e4,
          b: -1
        },
        "2": {
          a: 23e4,
          b: 14e3
        },
        "3": {
          a: 35e4,
          b: -1
        },
        "4": {
          a: 86e4,
          b: -1
        },
        "5": {
          a: 1e6,
          b: -1
        },
        "8": {
          a: 66e5,
          b: -1
        }
      },
      "/items/crippling_slash": {
        "0": {
          a: 48e3,
          b: 47e3
        }
      },
      "/items/critical_aura": {
        "0": {
          a: 2e6,
          b: 195e4
        }
      },
      "/items/critical_coffee": {
        "0": {
          a: 3700,
          b: 3600
        }
      },
      "/items/crushed_amber": {
        "0": {
          a: 1350,
          b: 1300
        }
      },
      "/items/crushed_amethyst": {
        "0": {
          a: 2150,
          b: 2100
        }
      },
      "/items/crushed_garnet": {
        "0": {
          a: 2150,
          b: 2100
        }
      },
      "/items/crushed_jade": {
        "0": {
          a: 2150,
          b: 2100
        }
      },
      "/items/crushed_moonstone": {
        "0": {
          a: 3100,
          b: 3e3
        }
      },
      "/items/crushed_pearl": {
        "0": {
          a: 860,
          b: 840
        }
      },
      "/items/crushed_philosophers_stone": {
        "0": {
          a: 21e5,
          b: 205e4
        }
      },
      "/items/crushed_sunstone": {
        "0": {
          a: 7600,
          b: 7400
        }
      },
      "/items/cupcake": {
        "0": {
          a: 200,
          b: 155
        }
      },
      "/items/cursed_ball": {
        "0": {
          a: 76e5,
          b: 74e5
        }
      },
      "/items/cursed_bow": {
        "0": {
          a: 185e6,
          b: 175e6
        },
        "1": {
          a: -1,
          b: 16e7
        },
        "2": {
          a: -1,
          b: 165e6
        },
        "3": {
          a: -1,
          b: 165e6
        },
        "4": {
          a: -1,
          b: 16e7
        },
        "5": {
          a: -1,
          b: 17e7
        },
        "6": {
          a: 205e6,
          b: 17e7
        },
        "7": {
          a: 23e7,
          b: 195e6
        },
        "8": {
          a: 34e7,
          b: 205e6
        },
        "9": {
          a: -1,
          b: 255e6
        },
        "10": {
          a: 54e7,
          b: 42e7
        },
        "12": {
          a: 155e7,
          b: 11e8
        }
      },
      "/items/cursed_bow_refined": {
        "0": {
          a: -1,
          b: 4e7
        },
        "10": {
          a: 125e7,
          b: 6e6
        }
      },
      "/items/dairyhands_bottoms": {
        "0": {
          a: -1,
          b: 1e8
        },
        "1": {
          a: -1,
          b: 6e7
        },
        "3": {
          a: -1,
          b: 41e5
        },
        "5": {
          a: 23e7,
          b: 2e8
        },
        "7": {
          a: 245e6,
          b: 205e6
        },
        "8": {
          a: 285e6,
          b: 245e6
        },
        "10": {
          a: 45e7,
          b: 4e8
        },
        "12": {
          a: -1,
          b: 7e8
        }
      },
      "/items/dairyhands_top": {
        "0": {
          a: -1,
          b: 13e7
        },
        "5": {
          a: 19e7,
          b: 155e6
        },
        "6": {
          a: 195e6,
          b: 125e6
        },
        "7": {
          a: 205e6,
          b: 19e7
        },
        "8": {
          a: 24e7,
          b: 2e8
        },
        "10": {
          a: 41e7,
          b: 38e7
        }
      },
      "/items/damaged_anchor": {
        "0": {
          a: 8e6,
          b: 78e5
        }
      },
      "/items/dark_key_fragment": {
        "0": {
          a: 175e4,
          b: 17e5
        }
      },
      "/items/defense_coffee": {
        "0": {
          a: 880,
          b: 840
        }
      },
      "/items/demonic_core": {
        "0": {
          a: 92e4,
          b: 9e5
        }
      },
      "/items/demonic_plate_body": {
        "0": {
          a: 88e5,
          b: 78e5
        },
        "3": {
          a: 96e5,
          b: 4e6
        },
        "4": {
          a: -1,
          b: 42e5
        },
        "5": {
          a: 12e6,
          b: 86e5
        },
        "6": {
          a: 145e5,
          b: 94e5
        },
        "7": {
          a: 2e7,
          b: 165e5
        },
        "8": {
          a: -1,
          b: 2e7
        },
        "10": {
          a: -1,
          b: 72e6
        }
      },
      "/items/demonic_plate_legs": {
        "0": {
          a: 68e5,
          b: 6e6
        },
        "4": {
          a: -1,
          b: 4e6
        },
        "5": {
          a: 58e5,
          b: 49e5
        },
        "6": {
          a: 1e7,
          b: 52e5
        },
        "7": {
          a: 16e6,
          b: 14e6
        },
        "8": {
          a: 255e5,
          b: 155e5
        },
        "10": {
          a: 8e7,
          b: 64e6
        },
        "13": {
          a: 25e7,
          b: -1
        }
      },
      "/items/dodocamel_gauntlets": {
        "0": {
          a: 5e7,
          b: 46e6
        },
        "4": {
          a: -1,
          b: 82e5
        },
        "5": {
          a: 52e6,
          b: 48e6
        },
        "6": {
          a: 6e7,
          b: -1
        },
        "7": {
          a: -1,
          b: 6e7
        },
        "8": {
          a: 9e7,
          b: 84e6
        },
        "9": {
          a: -1,
          b: 1e8
        },
        "10": {
          a: 24e7,
          b: 235e6
        },
        "12": {
          a: 92e7,
          b: 88e7
        }
      },
      "/items/dodocamel_gauntlets_refined": {
        "10": {
          a: 43e7,
          b: 41e7
        },
        "12": {
          a: 115e7,
          b: 11e8
        },
        "14": {
          a: -1,
          b: 3e6
        }
      },
      "/items/dodocamel_plume": {
        "0": {
          a: 7e6,
          b: 68e5
        }
      },
      "/items/donut": {
        "0": {
          a: 165,
          b: 145
        }
      },
      "/items/dragon_fruit": {
        "0": {
          a: 390,
          b: 380
        }
      },
      "/items/dragon_fruit_gummy": {
        "0": {
          a: 1050,
          b: 1e3
        }
      },
      "/items/dragon_fruit_yogurt": {
        "0": {
          a: 1400,
          b: 1350
        }
      },
      "/items/earrings_of_armor": {
        "0": {
          a: 66e5,
          b: 64e5
        },
        "1": {
          a: 9e6,
          b: -1
        },
        "2": {
          a: 105e5,
          b: -1
        },
        "3": {
          a: 11e6,
          b: -1
        },
        "4": {
          a: 29e6,
          b: -1
        },
        "6": {
          a: 12e7,
          b: -1
        }
      },
      "/items/earrings_of_critical_strike": {
        "0": {
          a: 1e7,
          b: 82e5
        },
        "1": {
          a: -1,
          b: 78e5
        },
        "2": {
          a: -1,
          b: 1e7
        },
        "3": {
          a: 205e5,
          b: 18e6
        },
        "4": {
          a: 4e7,
          b: 31e6
        },
        "5": {
          a: 74e6,
          b: 72e6
        },
        "6": {
          a: -1,
          b: 76e6
        }
      },
      "/items/earrings_of_essence_find": {
        "0": {
          a: 66e5,
          b: 64e5
        },
        "7": {
          a: 175e6,
          b: -1
        }
      },
      "/items/earrings_of_gathering": {
        "0": {
          a: 7e6,
          b: 66e5
        },
        "2": {
          a: 145e5,
          b: -1
        },
        "3": {
          a: 2e7,
          b: -1
        },
        "5": {
          a: -1,
          b: 58e6
        },
        "10": {
          a: -1,
          b: 4e8
        }
      },
      "/items/earrings_of_rare_find": {
        "0": {
          a: 76e5,
          b: 7e6
        },
        "1": {
          a: 96e5,
          b: -1
        },
        "2": {
          a: -1,
          b: 9e6
        },
        "3": {
          a: 205e5,
          b: 18e6
        },
        "4": {
          a: 34e6,
          b: 32e6
        },
        "5": {
          a: 66e6,
          b: 64e6
        },
        "6": {
          a: 14e7,
          b: -1
        },
        "10": {
          a: -1,
          b: 9e7
        }
      },
      "/items/earrings_of_regeneration": {
        "0": {
          a: 66e5,
          b: 6e6
        },
        "1": {
          a: 72e5,
          b: 6e6
        },
        "2": {
          a: 1e7,
          b: 76e5
        },
        "3": {
          a: 16e6,
          b: 14e6
        },
        "4": {
          a: 3e7,
          b: 265e5
        },
        "5": {
          a: 6e7,
          b: 54e6
        },
        "6": {
          a: 11e7,
          b: 7e7
        },
        "7": {
          a: 175e6,
          b: 165e6
        },
        "8": {
          a: 39e7,
          b: -1
        }
      },
      "/items/earrings_of_resistance": {
        "0": {
          a: 68e5,
          b: 66e5
        },
        "2": {
          a: 98e5,
          b: -1
        },
        "3": {
          a: 98e5,
          b: -1
        },
        "4": {
          a: 215e5,
          b: -1
        },
        "5": {
          a: 47e6,
          b: -1
        }
      },
      "/items/efficiency_tea": {
        "0": {
          a: 1500,
          b: 1450
        }
      },
      "/items/egg": {
        "0": {
          a: 58,
          b: 56
        }
      },
      "/items/elemental_affinity": {
        "0": {
          a: 18e4,
          b: 175e3
        }
      },
      "/items/elusiveness": {
        "0": {
          a: 68e3,
          b: 66e3
        }
      },
      "/items/emp_tea_leaf": {
        "0": {
          a: 105,
          b: 100
        }
      },
      "/items/enchanted_chest_key": {
        "0": {
          a: 52e5,
          b: 5e6
        }
      },
      "/items/enchanted_entry_key": {
        "0": {
          a: 64e4,
          b: 62e4
        }
      },
      "/items/enchanted_essence": {
        "0": {
          a: 1650,
          b: 1600
        }
      },
      "/items/enchanted_gloves": {
        "0": {
          a: 86e5,
          b: 8e6
        },
        "2": {
          a: -1,
          b: 36e5
        },
        "5": {
          a: 98e5,
          b: 84e5
        },
        "6": {
          a: 125e5,
          b: 8e6
        },
        "7": {
          a: 185e5,
          b: 12e6
        },
        "8": {
          a: 27e6,
          b: 195e5
        },
        "9": {
          a: -1,
          b: 105e5
        },
        "10": {
          a: 72e6,
          b: 64e6
        },
        "12": {
          a: 245e6,
          b: 21e7
        }
      },
      "/items/enchanted_refinement_shard": {
        "0": {
          a: 36e5,
          b: 35e5
        }
      },
      "/items/enhancers_bottoms": {
        "0": {
          a: -1,
          b: 25e6
        },
        "5": {
          a: 35e7,
          b: 25e6
        },
        "7": {
          a: 34e7,
          b: 265e6
        },
        "8": {
          a: 4e8,
          b: 28e7
        },
        "10": {
          a: 58e7,
          b: 56e7
        }
      },
      "/items/enhancers_top": {
        "5": {
          a: 34e7,
          b: 2e8
        },
        "6": {
          a: 265e6,
          b: -1
        },
        "7": {
          a: 295e6,
          b: 205e6
        },
        "8": {
          a: 33e7,
          b: 25e7
        },
        "10": {
          a: 52e7,
          b: 5e8
        },
        "12": {
          a: -1,
          b: 14e8
        }
      },
      "/items/enhancing_essence": {
        "0": {
          a: 880,
          b: 860
        }
      },
      "/items/enhancing_tea": {
        "0": {
          a: 1150,
          b: 1100
        }
      },
      "/items/entangle": {
        "0": {
          a: 23500,
          b: 23e3
        }
      },
      "/items/excelsa_coffee_bean": {
        "0": {
          a: 820,
          b: 800
        }
      },
      "/items/expert_alchemy_charm": {
        "3": {
          a: 28e7,
          b: -1
        },
        "5": {
          a: 34e7,
          b: 25e7
        }
      },
      "/items/expert_attack_charm": {
        "0": {
          a: 47e6,
          b: 43e6
        },
        "2": {
          a: -1,
          b: 4e7
        },
        "3": {
          a: 8e7,
          b: 72e6
        },
        "4": {
          a: 135e6,
          b: -1
        },
        "5": {
          a: 185e6,
          b: 17e7
        },
        "6": {
          a: 31e7,
          b: -1
        }
      },
      "/items/expert_brewing_charm": {
        "0": {
          a: 105e6,
          b: -1
        },
        "4": {
          a: 24e7,
          b: -1
        },
        "5": {
          a: 24e7,
          b: 19e7
        }
      },
      "/items/expert_cheesesmithing_charm": {
        "0": {
          a: 245e6,
          b: 3e6
        },
        "5": {
          a: 295e6,
          b: -1
        }
      },
      "/items/expert_cooking_charm": {
        "3": {
          a: 16e7,
          b: -1
        },
        "5": {
          a: 285e6,
          b: -1
        }
      },
      "/items/expert_crafting_charm": {
        "0": {
          a: 165e6,
          b: 42e6
        },
        "1": {
          a: 19e7,
          b: -1
        },
        "3": {
          a: 24e7,
          b: -1
        },
        "5": {
          a: 31e7,
          b: -1
        }
      },
      "/items/expert_defense_charm": {
        "0": {
          a: 48e6,
          b: 31e6
        },
        "1": {
          a: 78e6,
          b: -1
        },
        "2": {
          a: -1,
          b: 54e6
        },
        "3": {
          a: 76e6,
          b: 68e6
        },
        "4": {
          a: 14e7,
          b: 1e8
        },
        "5": {
          a: 195e6,
          b: 175e6
        }
      },
      "/items/expert_enhancing_charm": {
        "0": {
          a: 39e7,
          b: -1
        },
        "5": {
          a: 52e7,
          b: -1
        }
      },
      "/items/expert_foraging_charm": {
        "0": {
          a: 165e6,
          b: 33e5
        },
        "3": {
          a: 22e7,
          b: -1
        },
        "5": {
          a: 275e6,
          b: 265e6
        },
        "7": {
          a: -1,
          b: 56e5
        }
      },
      "/items/expert_intelligence_charm": {
        "0": {
          a: 5e7,
          b: 31e6
        },
        "2": {
          a: -1,
          b: 44e6
        },
        "3": {
          a: -1,
          b: 68e6
        },
        "4": {
          a: -1,
          b: 1e8
        },
        "5": {
          a: -1,
          b: 17e7
        }
      },
      "/items/expert_magic_charm": {
        "0": {
          a: 76e6,
          b: 6e7
        },
        "1": {
          a: 84e6,
          b: -1
        },
        "2": {
          a: 88e6,
          b: -1
        },
        "3": {
          a: 98e6,
          b: 94e6
        },
        "4": {
          a: -1,
          b: 14e7
        },
        "5": {
          a: 21e7,
          b: 2e8
        },
        "6": {
          a: 34e7,
          b: 285e6
        }
      },
      "/items/expert_melee_charm": {
        "0": {
          a: 48e6,
          b: 43e6
        },
        "3": {
          a: 78e6,
          b: 7e7
        },
        "5": {
          a: 185e6,
          b: 17e7
        }
      },
      "/items/expert_milking_charm": {
        "0": {
          a: 16e7,
          b: -1
        },
        "1": {
          a: 16e7,
          b: -1
        },
        "3": {
          a: 195e6,
          b: -1
        },
        "5": {
          a: 275e6,
          b: -1
        },
        "10": {
          a: -1,
          b: 82e7
        }
      },
      "/items/expert_ranged_charm": {
        "0": {
          a: 46e6,
          b: 4e7
        },
        "1": {
          a: 66e6,
          b: -1
        },
        "3": {
          a: 72e6,
          b: 68e6
        },
        "4": {
          a: 13e7,
          b: 1e8
        },
        "5": {
          a: 18e7,
          b: 17e7
        },
        "7": {
          a: 4e8,
          b: -1
        }
      },
      "/items/expert_stamina_charm": {
        "0": {
          a: -1,
          b: 66e6
        },
        "1": {
          a: 8e7,
          b: -1
        },
        "2": {
          a: 96e6,
          b: 74e6
        },
        "3": {
          a: 12e7,
          b: -1
        },
        "5": {
          a: 255e6,
          b: 205e6
        }
      },
      "/items/expert_tailoring_charm": {
        "0": {
          a: -1,
          b: 52e6
        },
        "5": {
          a: 25e7,
          b: -1
        }
      },
      "/items/expert_woodcutting_charm": {
        "0": {
          a: 125e6,
          b: -1
        },
        "3": {
          a: 23e7,
          b: 1e7
        },
        "5": {
          a: 275e6,
          b: -1
        }
      },
      "/items/eye_of_the_watcher": {
        "0": {
          a: 78e4,
          b: 76e4
        }
      },
      "/items/eye_watch": {
        "0": {
          a: 74e5,
          b: 7e6
        },
        "1": {
          a: -1,
          b: 31e5
        },
        "2": {
          a: 96e5,
          b: 31e5
        },
        "3": {
          a: 9e6,
          b: 6e6
        },
        "4": {
          a: 92e5,
          b: 58e5
        },
        "5": {
          a: 96e5,
          b: 88e5
        },
        "6": {
          a: 125e5,
          b: 6e6
        },
        "7": {
          a: 16e6,
          b: 125e5
        },
        "8": {
          a: 27e6,
          b: 2e7
        },
        "9": {
          a: 46e6,
          b: 36e6
        },
        "10": {
          a: 7e7,
          b: 68e6
        },
        "12": {
          a: -1,
          b: 38e5
        },
        "13": {
          a: -1,
          b: 1e8
        }
      },
      "/items/eyessence": {
        "0": {
          a: 37,
          b: 36
        }
      },
      "/items/fierce_aura": {
        "0": {
          a: 22e5,
          b: 215e4
        }
      },
      "/items/fieriosa_coffee_bean": {
        "0": {
          a: 940,
          b: 920
        }
      },
      "/items/fighter_necklace": {
        "0": {
          a: 14e6,
          b: 115e5
        },
        "1": {
          a: -1,
          b: 8e6
        },
        "2": {
          a: -1,
          b: 14e6
        },
        "3": {
          a: 265e5,
          b: 205e5
        },
        "5": {
          a: -1,
          b: 26e6
        }
      },
      "/items/fireball": {
        "0": {
          a: 6600,
          b: 6400
        }
      },
      "/items/firestorm": {
        "0": {
          a: 18e4,
          b: 175e3
        }
      },
      "/items/flame_arrow": {
        "0": {
          a: 33e3,
          b: 32e3
        }
      },
      "/items/flame_blast": {
        "0": {
          a: 33e3,
          b: 32e3
        }
      },
      "/items/flaming_cloth": {
        "0": {
          a: 62e3,
          b: 58e3
        }
      },
      "/items/flaming_robe_bottoms": {
        "0": {
          a: 21e4,
          b: 2e5
        },
        "2": {
          a: 26e4,
          b: -1
        },
        "3": {
          a: 2e5,
          b: -1
        },
        "5": {
          a: 27e4,
          b: -1
        },
        "6": {
          a: 8e5,
          b: -1
        },
        "7": {
          a: 105e4,
          b: 52e4
        },
        "8": {
          a: 19e5,
          b: -1
        },
        "9": {
          a: 25e5,
          b: 6e5
        },
        "10": {
          a: 3e6,
          b: 23e5
        },
        "12": {
          a: 24e6,
          b: -1
        }
      },
      "/items/flaming_robe_top": {
        "0": {
          a: 26e4,
          b: 255e3
        },
        "1": {
          a: 275e3,
          b: -1
        },
        "2": {
          a: 3e5,
          b: 21e4
        },
        "3": {
          a: 275e3,
          b: -1
        },
        "4": {
          a: 35e4,
          b: -1
        },
        "5": {
          a: 42e4,
          b: 24e4
        },
        "6": {
          a: 7e5,
          b: -1
        },
        "7": {
          a: 78e4,
          b: 56e4
        },
        "8": {
          a: 175e4,
          b: 58e4
        },
        "9": {
          a: 35e5,
          b: 6e5
        },
        "10": {
          a: 46e5,
          b: 31e5
        }
      },
      "/items/flax": {
        "0": {
          a: 84,
          b: 78
        }
      },
      "/items/fluffy_red_hat": {
        "0": {
          a: 54e5,
          b: 52e5
        },
        "5": {
          a: 56e5,
          b: 52e5
        },
        "6": {
          a: 66e5,
          b: 66e4
        },
        "7": {
          a: 1e7,
          b: 84e5
        },
        "8": {
          a: 155e5,
          b: 11e6
        },
        "9": {
          a: 28e6,
          b: 155e5
        },
        "10": {
          a: 42e6,
          b: 4e7
        }
      },
      "/items/foragers_bottoms": {
        "0": {
          a: -1,
          b: 2e8
        },
        "5": {
          a: 23e7,
          b: 21e7
        },
        "6": {
          a: 235e6,
          b: -1
        },
        "7": {
          a: 25e7,
          b: 245e6
        },
        "8": {
          a: 29e7,
          b: 255e6
        },
        "10": {
          a: 45e7,
          b: 39e7
        },
        "11": {
          a: -1,
          b: 26e7
        }
      },
      "/items/foragers_top": {
        "0": {
          a: 185e6,
          b: 1e8
        },
        "1": {
          a: -1,
          b: 3e7
        },
        "5": {
          a: 19e7,
          b: 155e6
        },
        "6": {
          a: 21e7,
          b: -1
        },
        "7": {
          a: 21e7,
          b: 19e7
        },
        "8": {
          a: 245e6,
          b: 22e7
        },
        "10": {
          a: 41e7,
          b: 38e7
        }
      },
      "/items/foraging_essence": {
        "0": {
          a: 290,
          b: 285
        }
      },
      "/items/foraging_tea": {
        "0": {
          a: 640,
          b: 620
        }
      },
      "/items/fracturing_impact": {
        "0": {
          a: 54e3,
          b: 52e3
        }
      },
      "/items/frenzy": {
        "0": {
          a: 36e4,
          b: 35e4
        }
      },
      "/items/frost_sphere": {
        "0": {
          a: 56e4,
          b: 54e4
        }
      },
      "/items/frost_staff": {
        "0": {
          a: 11e6,
          b: 105e5
        },
        "5": {
          a: 11e6,
          b: 105e5
        },
        "6": {
          a: 14e6,
          b: -1
        },
        "7": {
          a: 145e5,
          b: 94e5
        },
        "8": {
          a: 16e6,
          b: -1
        },
        "9": {
          a: 235e5,
          b: 14e6
        },
        "10": {
          a: 44e6,
          b: 3e7
        }
      },
      "/items/frost_surge": {
        "0": {
          a: 32e4,
          b: 31e4
        }
      },
      "/items/furious_spear": {
        "0": {
          a: 235e6,
          b: 23e7
        },
        "1": {
          a: -1,
          b: 19e7
        },
        "2": {
          a: -1,
          b: 185e6
        },
        "3": {
          a: -1,
          b: 175e6
        },
        "4": {
          a: -1,
          b: 18e7
        },
        "5": {
          a: 255e6,
          b: 225e6
        },
        "6": {
          a: -1,
          b: 2e8
        },
        "7": {
          a: 295e6,
          b: 27e7
        },
        "8": {
          a: -1,
          b: 31e7
        },
        "10": {
          a: 62e7,
          b: 58e7
        },
        "12": {
          a: -1,
          b: 155e7
        },
        "14": {
          a: -1,
          b: 66e5
        }
      },
      "/items/furious_spear_refined": {
        "10": {
          a: -1,
          b: 56e5
        },
        "15": {
          a: -1,
          b: 5e6
        }
      },
      "/items/garnet": {
        "0": {
          a: 35e3,
          b: 34e3
        }
      },
      "/items/gathering_tea": {
        "0": {
          a: 680,
          b: 600
        }
      },
      "/items/gator_vest": {
        "0": {
          a: 18e3,
          b: 17500
        },
        "1": {
          a: 27500,
          b: 16e3
        },
        "2": {
          a: 26e3,
          b: 16e3
        },
        "3": {
          a: 32e3,
          b: 16e3
        },
        "4": {
          a: 47e3,
          b: 16e3
        },
        "5": {
          a: 34e3,
          b: 32e3
        },
        "6": {
          a: 76e3,
          b: 56e3
        },
        "7": {
          a: 135e3,
          b: 105e3
        },
        "8": {
          a: 31e4,
          b: 25e4
        },
        "9": {
          a: 9e5,
          b: 5e5
        },
        "10": {
          a: 1e6,
          b: 98e4
        }
      },
      "/items/giant_pouch": {
        "0": {
          a: 66e5,
          b: 64e5
        },
        "1": {
          a: 72e5,
          b: 64e5
        },
        "2": {
          a: 72e5,
          b: 64e5
        },
        "3": {
          a: 76e5,
          b: 64e5
        },
        "4": {
          a: 9e6,
          b: 82e5
        },
        "5": {
          a: 11e6,
          b: 1e7
        },
        "6": {
          a: 205e5,
          b: 135e5
        },
        "7": {
          a: -1,
          b: 145e5
        },
        "10": {
          a: -1,
          b: 11e5
        }
      },
      "/items/ginkgo_bow": {
        "0": {
          a: 31e4,
          b: 3e5
        },
        "3": {
          a: 56e4,
          b: -1
        },
        "5": {
          a: 68e4,
          b: -1
        },
        "6": {
          a: 155e4,
          b: -1
        }
      },
      "/items/ginkgo_crossbow": {
        "0": {
          a: 22e4,
          b: 195e3
        },
        "1": {
          a: 39e4,
          b: -1
        },
        "5": {
          a: 14e5,
          b: -1
        },
        "6": {
          a: 43e7,
          b: -1
        }
      },
      "/items/ginkgo_fire_staff": {
        "0": {
          a: 25e4,
          b: 22e4
        },
        "2": {
          a: 275e3,
          b: -1
        },
        "3": {
          a: 31e4,
          b: -1
        },
        "5": {
          a: 48e4,
          b: -1
        },
        "6": {
          a: 88e4,
          b: -1
        },
        "7": {
          a: 41e5,
          b: -1
        }
      },
      "/items/ginkgo_log": {
        "0": {
          a: 230,
          b: 210
        }
      },
      "/items/ginkgo_lumber": {
        "0": {
          a: 1600,
          b: 1550
        }
      },
      "/items/ginkgo_nature_staff": {
        "0": {
          a: 3e5,
          b: 225e3
        },
        "3": {
          a: 44e4,
          b: -1
        }
      },
      "/items/ginkgo_shield": {
        "0": {
          a: 14e4,
          b: 135e3
        },
        "3": {
          a: 11e4,
          b: -1
        },
        "4": {
          a: 195e3,
          b: -1
        },
        "5": {
          a: 35e4,
          b: -1
        },
        "6": {
          a: 66e4,
          b: -1
        }
      },
      "/items/ginkgo_water_staff": {
        "0": {
          a: 34e4,
          b: 22e4
        },
        "4": {
          a: 45e5,
          b: -1
        },
        "5": {
          a: 5e6,
          b: -1
        }
      },
      "/items/gluttonous_energy": {
        "0": {
          a: 165e5,
          b: 145e5
        }
      },
      "/items/gluttonous_pouch": {
        "0": {
          a: 215e6,
          b: 205e5
        },
        "5": {
          a: 265e6,
          b: 245e6
        }
      },
      "/items/gobo_boomstick": {
        "0": {
          a: 8e4,
          b: 78e3
        },
        "1": {
          a: 88e3,
          b: -1
        },
        "2": {
          a: 98e3,
          b: -1
        },
        "5": {
          a: 11e4,
          b: 28e3
        },
        "6": {
          a: 225e3,
          b: -1
        },
        "7": {
          a: 52e4,
          b: -1
        },
        "8": {
          a: 115e4,
          b: -1
        },
        "10": {
          a: 45e5,
          b: -1
        }
      },
      "/items/gobo_boots": {
        "0": {
          a: 38e3,
          b: 24e3
        },
        "1": {
          a: 295e3,
          b: -1
        },
        "5": {
          a: 11e5,
          b: -1
        }
      },
      "/items/gobo_bracers": {
        "0": {
          a: 43e3,
          b: 37e3
        },
        "2": {
          a: 46e4,
          b: -1
        },
        "3": {
          a: 47e4,
          b: -1
        },
        "5": {
          a: 33e4,
          b: -1
        }
      },
      "/items/gobo_chaps": {
        "0": {
          a: 64e3,
          b: 6e4
        },
        "1": {
          a: 1e5,
          b: -1
        },
        "2": {
          a: 11e4,
          b: -1
        },
        "3": {
          a: 225e3,
          b: -1
        },
        "5": {
          a: 1e6,
          b: -1
        },
        "6": {
          a: 12e5,
          b: -1
        }
      },
      "/items/gobo_defender": {
        "0": {
          a: 42e4,
          b: 41e4
        },
        "1": {
          a: -1,
          b: 33e4
        },
        "2": {
          a: 43e4,
          b: 32e4
        },
        "3": {
          a: 43e4,
          b: 31e4
        },
        "4": {
          a: -1,
          b: 4e5
        },
        "5": {
          a: 46e4,
          b: 41e4
        },
        "6": {
          a: 54e4,
          b: 41e4
        },
        "7": {
          a: 68e4,
          b: 5e5
        },
        "8": {
          a: 11e5,
          b: 9e5
        },
        "10": {
          a: 39e5,
          b: 255e4
        },
        "13": {
          a: -1,
          b: 66e5
        }
      },
      "/items/gobo_essence": {
        "0": {
          a: 90,
          b: 88
        }
      },
      "/items/gobo_hide": {
        "0": {
          a: 19,
          b: 17
        }
      },
      "/items/gobo_hood": {
        "0": {
          a: 45e3,
          b: 38e3
        },
        "1": {
          a: 1e5,
          b: -1
        },
        "2": {
          a: 29e4,
          b: -1
        },
        "3": {
          a: 25e4,
          b: -1
        },
        "4": {
          a: 3e5,
          b: -1
        }
      },
      "/items/gobo_leather": {
        "0": {
          a: 840,
          b: 800
        }
      },
      "/items/gobo_rag": {
        "0": {
          a: 36e4,
          b: 35e4
        }
      },
      "/items/gobo_shooter": {
        "0": {
          a: 8e4,
          b: 78e3
        },
        "1": {
          a: 82e3,
          b: -1
        },
        "2": {
          a: 96e3,
          b: -1
        },
        "3": {
          a: 96e3,
          b: -1
        },
        "5": {
          a: 92e3,
          b: 28e3
        },
        "6": {
          a: 145e3,
          b: -1
        },
        "7": {
          a: 34e4,
          b: -1
        },
        "8": {
          a: 66e4,
          b: -1
        },
        "10": {
          a: 35e5,
          b: -1
        }
      },
      "/items/gobo_slasher": {
        "0": {
          a: 8e4,
          b: 78e3
        },
        "1": {
          a: 8e4,
          b: -1
        },
        "2": {
          a: 92e3,
          b: -1
        },
        "3": {
          a: 94e3,
          b: -1
        },
        "4": {
          a: 1e5,
          b: -1
        },
        "5": {
          a: 12e4,
          b: 1e5
        },
        "6": {
          a: 4e5,
          b: 2e5
        },
        "7": {
          a: 62e4,
          b: -1
        },
        "8": {
          a: 2e6,
          b: 11e5
        },
        "10": {
          a: 45e5,
          b: 4e6
        },
        "11": {
          a: 1e7,
          b: 52e5
        }
      },
      "/items/gobo_smasher": {
        "0": {
          a: 8e4,
          b: 78e3
        },
        "1": {
          a: 27e4,
          b: -1
        },
        "2": {
          a: 41e5,
          b: -1
        },
        "3": {
          a: 1e5,
          b: -1
        },
        "5": {
          a: 125e3,
          b: 28e3
        },
        "6": {
          a: 9e5,
          b: -1
        },
        "7": {
          a: 1e6,
          b: -1
        },
        "8": {
          a: 66e5,
          b: -1
        },
        "10": {
          a: 68e5,
          b: -1
        },
        "14": {
          a: 16e7,
          b: -1
        }
      },
      "/items/gobo_stabber": {
        "0": {
          a: 8e4,
          b: 78e3
        },
        "1": {
          a: 84e3,
          b: -1
        },
        "2": {
          a: 1e5,
          b: -1
        },
        "3": {
          a: 98e3,
          b: -1
        },
        "4": {
          a: 49e4,
          b: -1
        },
        "5": {
          a: 1e5,
          b: -1
        },
        "6": {
          a: 22e4,
          b: -1
        },
        "7": {
          a: 5e5,
          b: -1
        },
        "8": {
          a: 195e4,
          b: -1
        },
        "10": {
          a: 49e5,
          b: -1
        },
        "12": {
          a: 2e7,
          b: -1
        }
      },
      "/items/gobo_tunic": {
        "0": {
          a: 7e4,
          b: 64e3
        },
        "1": {
          a: 105e3,
          b: -1
        },
        "2": {
          a: 62e4,
          b: -1
        },
        "3": {
          a: 64e4,
          b: -1
        },
        "4": {
          a: 125e4,
          b: -1
        },
        "5": {
          a: 6e5,
          b: -1
        }
      },
      "/items/goggles": {
        "0": {
          a: 52e4,
          b: 5e5
        }
      },
      "/items/golem_essence": {
        "0": {
          a: 260,
          b: 255
        }
      },
      "/items/gourmet_tea": {
        "0": {
          a: 720,
          b: 680
        }
      },
      "/items/grandmaster_alchemy_charm": {},
      "/items/grandmaster_attack_charm": {
        "5": {
          a: -1,
          b: 7e8
        },
        "8": {
          a: -1,
          b: 25e8
        }
      },
      "/items/grandmaster_brewing_charm": {},
      "/items/grandmaster_cheesesmithing_charm": {},
      "/items/grandmaster_cooking_charm": {
        "0": {
          a: -1,
          b: 62e6
        }
      },
      "/items/grandmaster_crafting_charm": {},
      "/items/grandmaster_defense_charm": {
        "5": {
          a: 96e7,
          b: -1
        }
      },
      "/items/grandmaster_enhancing_charm": {},
      "/items/grandmaster_foraging_charm": {
        "0": {
          a: -1,
          b: 145e5
        },
        "5": {
          a: -1,
          b: 16e6
        },
        "7": {
          a: -1,
          b: 1e7
        },
        "8": {
          a: -1,
          b: 19e8
        },
        "10": {
          a: -1,
          b: 3e9
        },
        "20": {
          a: -1,
          b: 145e5
        }
      },
      "/items/grandmaster_intelligence_charm": {},
      "/items/grandmaster_magic_charm": {
        "0": {
          a: 11e8,
          b: -1
        },
        "7": {
          a: 24e8,
          b: -1
        },
        "10": {
          a: -1,
          b: 6e9
        }
      },
      "/items/grandmaster_melee_charm": {
        "0": {
          a: -1,
          b: 16e7
        },
        "5": {
          a: -1,
          b: 1e9
        }
      },
      "/items/grandmaster_milking_charm": {},
      "/items/grandmaster_ranged_charm": {
        "0": {
          a: -1,
          b: 24e7
        },
        "5": {
          a: -1,
          b: 225e6
        },
        "20": {
          a: -1,
          b: 4e7
        }
      },
      "/items/grandmaster_stamina_charm": {},
      "/items/grandmaster_tailoring_charm": {
        "0": {
          a: -1,
          b: 11e6
        },
        "5": {
          a: -1,
          b: 1e9
        }
      },
      "/items/grandmaster_woodcutting_charm": {
        "0": {
          a: -1,
          b: 1e7
        },
        "5": {
          a: -1,
          b: 1e8
        }
      },
      "/items/granite_bludgeon": {
        "0": {
          a: 165e5,
          b: 98e5
        },
        "5": {
          a: 13e6,
          b: -1
        },
        "6": {
          a: 15e6,
          b: -1
        },
        "7": {
          a: 2e7,
          b: 12e6
        },
        "8": {
          a: 28e6,
          b: 18e6
        },
        "10": {
          a: 62e6,
          b: 49e6
        },
        "12": {
          a: 22e7,
          b: 215e5
        },
        "14": {
          a: 58e7,
          b: 56e4
        }
      },
      "/items/green_key_fragment": {
        "0": {
          a: 58e4,
          b: 56e4
        }
      },
      "/items/green_tea_leaf": {
        "0": {
          a: 14,
          b: 13
        }
      },
      "/items/griffin_bulwark": {
        "0": {
          a: 185e6,
          b: 17e7
        },
        "5": {
          a: -1,
          b: 18e7
        },
        "6": {
          a: -1,
          b: 19e7
        },
        "7": {
          a: 25e7,
          b: 215e6
        },
        "8": {
          a: -1,
          b: 245e6
        },
        "10": {
          a: 48e7,
          b: 47e7
        },
        "11": {
          a: 82e7,
          b: 68e5
        },
        "12": {
          a: 13e8,
          b: -1
        },
        "14": {
          a: -1,
          b: 5e9
        }
      },
      "/items/griffin_bulwark_refined": {
        "10": {
          a: -1,
          b: 115e6
        },
        "12": {
          a: 195e7,
          b: 5e6
        }
      },
      "/items/griffin_chaps": {
        "0": {
          a: 76e5,
          b: 7e6
        },
        "5": {
          a: 98e5,
          b: 82e5
        },
        "6": {
          a: 13e6,
          b: -1
        },
        "7": {
          a: 135e5,
          b: -1
        },
        "8": {
          a: 15e6,
          b: -1
        },
        "10": {
          a: 38e6,
          b: 2e7
        },
        "12": {
          a: 12e7,
          b: -1
        }
      },
      "/items/griffin_leather": {
        "0": {
          a: 11e5,
          b: 105e4
        }
      },
      "/items/griffin_talon": {
        "0": {
          a: 66e5,
          b: 64e5
        }
      },
      "/items/griffin_tunic": {
        "0": {
          a: 105e5,
          b: 1e7
        },
        "1": {
          a: -1,
          b: 84e5
        },
        "2": {
          a: -1,
          b: 84e5
        },
        "3": {
          a: -1,
          b: 84e5
        },
        "5": {
          a: 12e6,
          b: 82e5
        },
        "6": {
          a: 14e6,
          b: -1
        },
        "7": {
          a: 16e6,
          b: -1
        },
        "8": {
          a: 245e5,
          b: -1
        },
        "10": {
          a: 33e6,
          b: -1
        },
        "12": {
          a: 12e7,
          b: -1
        }
      },
      "/items/grizzly_bear_fluff": {
        "0": {
          a: 92e3,
          b: 9e4
        }
      },
      "/items/grizzly_bear_shoes": {
        "0": {
          a: 52e4,
          b: 49e4
        },
        "1": {
          a: 58e4,
          b: -1
        },
        "4": {
          a: 8e5,
          b: -1
        },
        "5": {
          a: 12e5,
          b: 8e5
        },
        "6": {
          a: 2e6,
          b: 12e5
        },
        "7": {
          a: 235e4,
          b: 19e5
        },
        "8": {
          a: 4e6,
          b: 33e5
        },
        "10": {
          a: 115e5,
          b: 105e5
        },
        "11": {
          a: -1,
          b: 12e6
        },
        "12": {
          a: 44e6,
          b: 35e6
        },
        "13": {
          a: 78e6,
          b: -1
        },
        "14": {
          a: 15e7,
          b: -1
        },
        "15": {
          a: 29e7,
          b: 27e7
        },
        "16": {
          a: 6e8,
          b: -1
        }
      },
      "/items/guardian_aura": {
        "0": {
          a: 11e5,
          b: 105e4
        }
      },
      "/items/gummy": {
        "0": {
          a: 130,
          b: 115
        }
      },
      "/items/guzzling_energy": {
        "0": {
          a: 215e5,
          b: 21e6
        }
      },
      "/items/guzzling_pouch": {
        "0": {
          a: 27e7,
          b: 26e7
        },
        "1": {
          a: -1,
          b: 16e6
        },
        "2": {
          a: -1,
          b: 265e6
        },
        "3": {
          a: -1,
          b: 265e6
        },
        "4": {
          a: -1,
          b: 23e7
        },
        "5": {
          a: 29e7,
          b: 27e7
        },
        "6": {
          a: 32e7,
          b: 31e7
        },
        "7": {
          a: 38e7,
          b: 37e7
        },
        "8": {
          a: 52e7,
          b: 5e8
        },
        "9": {
          a: -1,
          b: 66e7
        },
        "10": {
          a: 105e7,
          b: 1e9
        },
        "12": {
          a: 3e9,
          b: 265e5
        }
      },
      "/items/heal": {
        "0": {
          a: 33e3,
          b: 32e3
        }
      },
      "/items/holy_alembic": {
        "0": {
          a: 52e4,
          b: 5e5
        },
        "1": {
          a: 54e4,
          b: 21e4
        },
        "2": {
          a: 76e4,
          b: 22e4
        },
        "3": {
          a: 8e5,
          b: 265e3
        },
        "4": {
          a: 15e5,
          b: 52e4
        },
        "5": {
          a: 2e6,
          b: 19e5
        },
        "6": {
          a: 48e5,
          b: -1
        },
        "7": {
          a: 8e6,
          b: 66e5
        },
        "8": {
          a: 175e5,
          b: 12e6
        },
        "10": {
          a: 47e6,
          b: 43e6
        },
        "12": {
          a: 165e6,
          b: -1
        }
      },
      "/items/holy_boots": {
        "0": {
          a: 24e4,
          b: 225e3
        },
        "1": {
          a: 255e3,
          b: -1
        },
        "2": {
          a: 31e4,
          b: -1
        },
        "3": {
          a: 37e4,
          b: -1
        },
        "4": {
          a: 62e4,
          b: -1
        },
        "5": {
          a: 92e4,
          b: 25e4
        },
        "6": {
          a: 48e5,
          b: 48e4
        }
      },
      "/items/holy_brush": {
        "0": {
          a: 52e4,
          b: 5e5
        },
        "1": {
          a: 52e4,
          b: 1e5
        },
        "2": {
          a: 7e5,
          b: 1e5
        },
        "3": {
          a: 105e4,
          b: -1
        },
        "4": {
          a: 135e4,
          b: -1
        },
        "5": {
          a: 2e6,
          b: 195e4
        },
        "6": {
          a: 43e5,
          b: 3e6
        },
        "7": {
          a: 78e5,
          b: 66e5
        },
        "8": {
          a: 15e6,
          b: 13e6
        },
        "9": {
          a: 27e6,
          b: -1
        },
        "10": {
          a: 49e6,
          b: 42e6
        },
        "12": {
          a: -1,
          b: 48e6
        }
      },
      "/items/holy_buckler": {
        "0": {
          a: 5e5,
          b: 49e4
        },
        "1": {
          a: 47e4,
          b: -1
        },
        "2": {
          a: 56e4,
          b: -1
        },
        "3": {
          a: 45e4,
          b: -1
        },
        "5": {
          a: 11e5,
          b: 2e5
        },
        "6": {
          a: 39e5,
          b: -1
        }
      },
      "/items/holy_bulwark": {
        "0": {
          a: 9e5,
          b: 8e5
        },
        "1": {
          a: 84e4,
          b: -1
        },
        "2": {
          a: 1e6,
          b: -1
        },
        "3": {
          a: 14e5,
          b: 14e4
        },
        "4": {
          a: 19e5,
          b: 19e4
        },
        "5": {
          a: 17e5,
          b: 175e3
        },
        "6": {
          a: 48e5,
          b: 48e4
        }
      },
      "/items/holy_cheese": {
        "0": {
          a: 2200,
          b: 2150
        }
      },
      "/items/holy_chisel": {
        "0": {
          a: 52e4,
          b: 5e5
        },
        "1": {
          a: 5e5,
          b: 235e3
        },
        "2": {
          a: 8e5,
          b: 245e3
        },
        "3": {
          a: 1e6,
          b: 24e4
        },
        "4": {
          a: 125e4,
          b: -1
        },
        "5": {
          a: 23e5,
          b: 18e5
        },
        "6": {
          a: 42e5,
          b: 29e5
        },
        "7": {
          a: 82e5,
          b: 6e6
        },
        "8": {
          a: 145e5,
          b: 13e6
        },
        "9": {
          a: 27e6,
          b: -1
        },
        "10": {
          a: 49e6,
          b: 47e6
        }
      },
      "/items/holy_enhancer": {
        "0": {
          a: 54e4,
          b: 5e5
        },
        "1": {
          a: 56e4,
          b: -1
        },
        "2": {
          a: 7e5,
          b: -1
        },
        "3": {
          a: 82e4,
          b: -1
        },
        "4": {
          a: 12e5,
          b: -1
        },
        "5": {
          a: 195e4,
          b: 19e5
        },
        "6": {
          a: 39e5,
          b: 19e5
        },
        "7": {
          a: 78e5,
          b: 68e5
        },
        "8": {
          a: 16e6,
          b: 135e5
        },
        "9": {
          a: 29e6,
          b: -1
        },
        "10": {
          a: 47e6,
          b: 45e6
        },
        "11": {
          a: 84e6,
          b: 43e6
        },
        "12": {
          a: 185e6,
          b: 165e6
        }
      },
      "/items/holy_gauntlets": {
        "0": {
          a: 3e5,
          b: 2e5
        },
        "1": {
          a: 56e4,
          b: -1
        },
        "2": {
          a: 56e4,
          b: -1
        },
        "3": {
          a: 46e4,
          b: -1
        },
        "4": {
          a: 88e4,
          b: -1
        },
        "5": {
          a: 15e5,
          b: 3e5
        },
        "6": {
          a: 44e5,
          b: 225e4
        },
        "10": {
          a: -1,
          b: 1e6
        }
      },
      "/items/holy_hammer": {
        "0": {
          a: 52e4,
          b: 5e5
        },
        "1": {
          a: 64e4,
          b: 225e3
        },
        "2": {
          a: 74e4,
          b: 225e3
        },
        "3": {
          a: 78e4,
          b: 245e3
        },
        "4": {
          a: 14e5,
          b: 255e3
        },
        "5": {
          a: 2e6,
          b: 19e5
        },
        "6": {
          a: 42e5,
          b: 2e6
        },
        "7": {
          a: 8e6,
          b: 66e5
        },
        "8": {
          a: 15e6,
          b: 13e6
        },
        "9": {
          a: 275e5,
          b: -1
        },
        "10": {
          a: 49e6,
          b: 46e6
        },
        "12": {
          a: 1e8,
          b: -1
        }
      },
      "/items/holy_hatchet": {
        "0": {
          a: 52e4,
          b: 5e5
        },
        "1": {
          a: 54e4,
          b: 2e5
        },
        "2": {
          a: 76e4,
          b: 265e3
        },
        "3": {
          a: 86e4,
          b: 34e4
        },
        "5": {
          a: 19e5,
          b: 185e4
        },
        "6": {
          a: 47e5,
          b: 285e4
        },
        "7": {
          a: 78e5,
          b: 72e5
        },
        "8": {
          a: 15e6,
          b: 135e5
        },
        "9": {
          a: -1,
          b: 2e7
        },
        "10": {
          a: 48e6,
          b: 47e6
        }
      },
      "/items/holy_helmet": {
        "0": {
          a: 43e4,
          b: 42e4
        },
        "2": {
          a: 43e4,
          b: -1
        },
        "3": {
          a: 47e4,
          b: -1
        },
        "4": {
          a: 6e5,
          b: -1
        },
        "5": {
          a: 54e4,
          b: -1
        },
        "6": {
          a: 42e5,
          b: 42e4
        }
      },
      "/items/holy_mace": {
        "0": {
          a: 86e4,
          b: 72e4
        },
        "1": {
          a: 78e4,
          b: 3e5
        },
        "2": {
          a: -1,
          b: 23e4
        },
        "3": {
          a: 68e4,
          b: -1
        },
        "4": {
          a: 9e5,
          b: -1
        },
        "5": {
          a: 125e4,
          b: -1
        },
        "6": {
          a: 2e6,
          b: 2e5
        }
      },
      "/items/holy_milk": {
        "0": {
          a: 460,
          b: 450
        }
      },
      "/items/holy_needle": {
        "0": {
          a: 5e5,
          b: 46e4
        },
        "1": {
          a: 62e4,
          b: -1
        },
        "3": {
          a: 105e4,
          b: 72e4
        },
        "4": {
          a: 125e4,
          b: -1
        },
        "5": {
          a: 2e6,
          b: 18e5
        },
        "6": {
          a: 42e5,
          b: -1
        },
        "7": {
          a: 76e5,
          b: 6e6
        },
        "8": {
          a: 145e5,
          b: -1
        },
        "9": {
          a: 275e5,
          b: 225e5
        },
        "10": {
          a: 44e6,
          b: 4e7
        },
        "12": {
          a: 1e8,
          b: -1
        }
      },
      "/items/holy_plate_body": {
        "0": {
          a: 66e4,
          b: 64e4
        },
        "1": {
          a: 84e4,
          b: -1
        },
        "2": {
          a: 8e5,
          b: -1
        },
        "3": {
          a: 82e4,
          b: 32e4
        },
        "4": {
          a: 86e4,
          b: -1
        },
        "5": {
          a: 15e5,
          b: 6e5
        },
        "6": {
          a: 45e5,
          b: 45e4
        }
      },
      "/items/holy_plate_legs": {
        "0": {
          a: 58e4,
          b: 56e4
        },
        "1": {
          a: 44e4,
          b: -1
        },
        "2": {
          a: 64e4,
          b: -1
        },
        "3": {
          a: 52e4,
          b: 295e3
        },
        "4": {
          a: 1e6,
          b: 18e4
        },
        "5": {
          a: 155e4,
          b: 35e4
        },
        "6": {
          a: 47e5,
          b: 47e4
        }
      },
      "/items/holy_pot": {
        "0": {
          a: 52e4,
          b: 49e4
        },
        "1": {
          a: 58e4,
          b: -1
        },
        "3": {
          a: 94e4,
          b: 28e4
        },
        "4": {
          a: 135e4,
          b: 27e4
        },
        "5": {
          a: 2e6,
          b: 195e4
        },
        "6": {
          a: 45e5,
          b: 3e6
        },
        "7": {
          a: 82e5,
          b: 62e5
        },
        "8": {
          a: 165e5,
          b: 13e6
        },
        "9": {
          a: -1,
          b: 2e7
        },
        "10": {
          a: 48e6,
          b: 46e6
        },
        "11": {
          a: 96e6,
          b: 31e6
        }
      },
      "/items/holy_shears": {
        "0": {
          a: 54e4,
          b: 52e4
        },
        "1": {
          a: 56e4,
          b: 23e4
        },
        "2": {
          a: 88e4,
          b: 23e4
        },
        "3": {
          a: 125e4,
          b: 25e4
        },
        "4": {
          a: 145e4,
          b: -1
        },
        "5": {
          a: 2e6,
          b: 195e4
        },
        "6": {
          a: 48e5,
          b: 3e6
        },
        "7": {
          a: 78e5,
          b: 68e5
        },
        "8": {
          a: 15e6,
          b: 135e5
        },
        "9": {
          a: 27e6,
          b: -1
        },
        "10": {
          a: 52e6,
          b: 48e6
        },
        "12": {
          a: -1,
          b: 9e7
        }
      },
      "/items/holy_spatula": {
        "0": {
          a: 54e4,
          b: 52e4
        },
        "1": {
          a: 56e4,
          b: 155e3
        },
        "2": {
          a: 68e4,
          b: 275e3
        },
        "3": {
          a: 84e4,
          b: 215e3
        },
        "5": {
          a: 2e6,
          b: 19e5
        },
        "6": {
          a: 44e5,
          b: 3e6
        },
        "7": {
          a: 84e5,
          b: 72e5
        },
        "8": {
          a: 15e6,
          b: 13e6
        },
        "9": {
          a: 38e6,
          b: 62e3
        },
        "10": {
          a: 47e6,
          b: 43e6
        }
      },
      "/items/holy_spear": {
        "0": {
          a: 72e4,
          b: 7e5
        },
        "1": {
          a: 7e5,
          b: -1
        },
        "2": {
          a: 76e4,
          b: -1
        },
        "3": {
          a: 74e4,
          b: 33e4
        },
        "4": {
          a: 11e5,
          b: -1
        },
        "5": {
          a: 145e4,
          b: 92e4
        },
        "6": {
          a: 5e6,
          b: 5e5
        },
        "10": {
          a: -1,
          b: 2e7
        }
      },
      "/items/holy_sword": {
        "0": {
          a: 54e4,
          b: 46e4
        },
        "1": {
          a: 56e4,
          b: -1
        },
        "2": {
          a: 98e4,
          b: 44e4
        },
        "3": {
          a: 7e5,
          b: -1
        },
        "4": {
          a: 165e4,
          b: 41e4
        },
        "5": {
          a: 145e4,
          b: 56e4
        },
        "6": {
          a: 42e5,
          b: 56e4
        },
        "7": {
          a: -1,
          b: 1e6
        },
        "10": {
          a: -1,
          b: 7e5
        }
      },
      "/items/ice_spear": {
        "0": {
          a: 33e3,
          b: 32e3
        }
      },
      "/items/icy_cloth": {
        "0": {
          a: 58e3,
          b: 56e3
        }
      },
      "/items/icy_robe_bottoms": {
        "0": {
          a: 21e4,
          b: 19e4
        },
        "1": {
          a: 2e5,
          b: 11e4
        },
        "2": {
          a: -1,
          b: 11e4
        },
        "4": {
          a: 35e4,
          b: -1
        },
        "5": {
          a: 46e4,
          b: -1
        },
        "6": {
          a: 49e4,
          b: -1
        },
        "7": {
          a: 92e4,
          b: 1e5
        },
        "8": {
          a: 14e5,
          b: -1
        },
        "10": {
          a: 4e6,
          b: 165e4
        }
      },
      "/items/icy_robe_top": {
        "0": {
          a: 265e3,
          b: 255e3
        },
        "1": {
          a: 64e5,
          b: 1e5
        },
        "3": {
          a: 3e5,
          b: 1e5
        },
        "4": {
          a: 35e4,
          b: -1
        },
        "5": {
          a: 38e4,
          b: 295e3
        },
        "6": {
          a: 74e4,
          b: 33e4
        },
        "7": {
          a: 115e4,
          b: 37e4
        },
        "8": {
          a: 19e5,
          b: -1
        },
        "10": {
          a: 5e6,
          b: 23e5
        }
      },
      "/items/impale": {
        "0": {
          a: 33e3,
          b: 32e3
        }
      },
      "/items/infernal_battlestaff": {
        "0": {
          a: 11e6,
          b: 105e5
        },
        "4": {
          a: 115e5,
          b: -1
        },
        "5": {
          a: 11e6,
          b: 105e5
        },
        "6": {
          a: 12e6,
          b: 1e7
        },
        "7": {
          a: 13e6,
          b: 115e5
        },
        "8": {
          a: 17e6,
          b: 12e6
        },
        "10": {
          a: 39e6,
          b: 36e6
        },
        "12": {
          a: 17e7,
          b: -1
        }
      },
      "/items/infernal_ember": {
        "0": {
          a: 54e4,
          b: 52e4
        }
      },
      "/items/insanity": {
        "0": {
          a: 84e4,
          b: 82e4
        }
      },
      "/items/intelligence_coffee": {
        "0": {
          a: 740,
          b: 700
        }
      },
      "/items/invincible": {
        "0": {
          a: 82e4,
          b: 8e5
        }
      },
      "/items/jackalope_antler": {
        "0": {
          a: 21e5,
          b: 205e4
        }
      },
      "/items/jackalope_staff": {
        "0": {
          a: 4e7,
          b: 34e6
        },
        "5": {
          a: 4e7,
          b: 34e6
        },
        "6": {
          a: 42e6,
          b: 35e6
        },
        "7": {
          a: 52e6,
          b: 44e6
        },
        "10": {
          a: 12e7,
          b: 88e6
        }
      },
      "/items/jade": {
        "0": {
          a: 35e3,
          b: 34e3
        }
      },
      "/items/jungle_essence": {
        "0": {
          a: 27,
          b: 26
        }
      },
      "/items/knights_aegis": {
        "0": {
          a: 98e6,
          b: 96e6
        },
        "1": {
          a: -1,
          b: 8e7
        },
        "3": {
          a: -1,
          b: 8e7
        },
        "5": {
          a: 1e8,
          b: 96e6
        },
        "6": {
          a: -1,
          b: 9e7
        },
        "7": {
          a: 125e6,
          b: 12e7
        },
        "8": {
          a: 155e6,
          b: 135e6
        },
        "9": {
          a: -1,
          b: 155e6
        },
        "10": {
          a: 36e7,
          b: 34e7
        },
        "11": {
          a: -1,
          b: 4e8
        },
        "12": {
          a: 125e7,
          b: 1e7
        },
        "20": {
          a: -1,
          b: 6e6
        }
      },
      "/items/knights_aegis_refined": {
        "10": {
          a: 68e7,
          b: 7e7
        },
        "14": {
          a: -1,
          b: 4e6
        }
      },
      "/items/knights_ingot": {
        "0": {
          a: 78e5,
          b: 76e5
        }
      },
      "/items/kraken_chaps": {
        "0": {
          a: 78e6,
          b: 74e6
        },
        "1": {
          a: -1,
          b: 68e6
        },
        "2": {
          a: 14e7,
          b: 7e7
        },
        "3": {
          a: -1,
          b: 68e6
        },
        "4": {
          a: -1,
          b: 66e6
        },
        "5": {
          a: 82e6,
          b: 68e6
        },
        "7": {
          a: 11e7,
          b: 1e8
        },
        "8": {
          a: 15e7,
          b: 125e6
        },
        "9": {
          a: -1,
          b: 14e7
        },
        "10": {
          a: 37e7,
          b: 36e7
        },
        "11": {
          a: -1,
          b: 42e7
        },
        "12": {
          a: -1,
          b: 115e7
        }
      },
      "/items/kraken_chaps_refined": {
        "10": {
          a: -1,
          b: 5e8
        },
        "12": {
          a: -1,
          b: 16e8
        },
        "15": {
          a: -1,
          b: 5e8
        }
      },
      "/items/kraken_fang": {
        "0": {
          a: 11e6,
          b: 105e5
        }
      },
      "/items/kraken_leather": {
        "0": {
          a: 84e5,
          b: 82e5
        }
      },
      "/items/kraken_tunic": {
        "0": {
          a: 98e6,
          b: 94e6
        },
        "1": {
          a: -1,
          b: 76e6
        },
        "2": {
          a: 165e6,
          b: 84e6
        },
        "3": {
          a: -1,
          b: 84e6
        },
        "4": {
          a: -1,
          b: 84e6
        },
        "5": {
          a: 98e6,
          b: 88e6
        },
        "6": {
          a: 11e7,
          b: 92e6
        },
        "7": {
          a: 125e6,
          b: 115e6
        },
        "8": {
          a: 17e7,
          b: 15e7
        },
        "9": {
          a: 3e8,
          b: 175e6
        },
        "10": {
          a: 4e8,
          b: 39e7
        },
        "11": {
          a: 68e7,
          b: 56e7
        },
        "12": {
          a: 135e7,
          b: 13e8
        }
      },
      "/items/kraken_tunic_refined": {
        "10": {
          a: 72e7,
          b: 66e7
        },
        "12": {
          a: -1,
          b: 45e5
        },
        "15": {
          a: -1,
          b: 52e5
        }
      },
      "/items/large_pouch": {
        "0": {
          a: 78e4,
          b: 74e4
        },
        "1": {
          a: 1e6,
          b: -1
        },
        "2": {
          a: 13e5,
          b: 54e4
        },
        "3": {
          a: 14e5,
          b: -1
        },
        "4": {
          a: 165e4,
          b: -1
        },
        "5": {
          a: 275e4,
          b: 145e4
        }
      },
      "/items/liberica_coffee_bean": {
        "0": {
          a: 640,
          b: 620
        }
      },
      "/items/life_drain": {
        "0": {
          a: 52e3,
          b: 49e3
        }
      },
      "/items/linen_boots": {
        "0": {
          a: 16500,
          b: 10500
        },
        "3": {
          a: 88e3,
          b: -1
        }
      },
      "/items/linen_fabric": {
        "0": {
          a: 640,
          b: 620
        }
      },
      "/items/linen_gloves": {
        "0": {
          a: 17500,
          b: 13e3
        },
        "1": {
          a: 94e3,
          b: -1
        },
        "2": {
          a: 11e4,
          b: -1
        },
        "5": {
          a: 44e4,
          b: -1
        }
      },
      "/items/linen_hat": {
        "0": {
          a: 18500,
          b: 16500
        },
        "1": {
          a: 86e3,
          b: -1
        },
        "2": {
          a: 16e5,
          b: -1
        },
        "5": {
          a: 35e4,
          b: -1
        }
      },
      "/items/linen_robe_bottoms": {
        "0": {
          a: 24e3,
          b: 22e3
        },
        "6": {
          a: 72e5,
          b: -1
        }
      },
      "/items/linen_robe_top": {
        "0": {
          a: 28e3,
          b: 23e3
        },
        "2": {
          a: 115e3,
          b: -1
        },
        "3": {
          a: 13e5,
          b: -1
        },
        "5": {
          a: 7e5,
          b: -1
        },
        "10": {
          a: -1,
          b: 1e6
        }
      },
      "/items/living_granite": {
        "0": {
          a: 58e4,
          b: 56e4
        }
      },
      "/items/log": {
        "0": {
          a: 28,
          b: 26
        }
      },
      "/items/lucky_coffee": {
        "0": {
          a: 2500,
          b: 2450
        }
      },
      "/items/lumber": {
        "0": {
          a: 320,
          b: 300
        }
      },
      "/items/lumberjacks_bottoms": {
        "0": {
          a: 235e6,
          b: -1
        },
        "5": {
          a: 23e7,
          b: 19e7
        },
        "7": {
          a: 24e7,
          b: 2e8
        },
        "8": {
          a: 27e7,
          b: 24e7
        },
        "10": {
          a: 45e7,
          b: 4e8
        }
      },
      "/items/lumberjacks_top": {
        "5": {
          a: 19e7,
          b: 18e7
        },
        "6": {
          a: 195e6,
          b: -1
        },
        "7": {
          a: 2e8,
          b: 175e6
        },
        "8": {
          a: 24e7,
          b: -1
        },
        "10": {
          a: 41e7,
          b: 37e7
        }
      },
      "/items/luna_robe_bottoms": {
        "0": {
          a: 22e5,
          b: 19e5
        },
        "1": {
          a: 215e4,
          b: -1
        },
        "2": {
          a: 22e5,
          b: -1
        },
        "4": {
          a: 31e5,
          b: -1
        },
        "5": {
          a: 36e5,
          b: 26e5
        },
        "6": {
          a: 4e6,
          b: -1
        },
        "7": {
          a: 62e5,
          b: 5e6
        },
        "8": {
          a: 105e5,
          b: 8e6
        },
        "9": {
          a: 195e5,
          b: 115e5
        },
        "10": {
          a: 27e6,
          b: 26e6
        },
        "12": {
          a: 98e6,
          b: -1
        }
      },
      "/items/luna_robe_top": {
        "0": {
          a: 26e5,
          b: 23e5
        },
        "2": {
          a: 3e6,
          b: -1
        },
        "3": {
          a: 295e4,
          b: -1
        },
        "4": {
          a: 34e5,
          b: -1
        },
        "5": {
          a: 49e5,
          b: 34e5
        },
        "6": {
          a: 54e5,
          b: -1
        },
        "7": {
          a: 7e6,
          b: -1
        },
        "8": {
          a: 11e6,
          b: 78e5
        },
        "9": {
          a: 18e6,
          b: 52e4
        },
        "10": {
          a: 29e6,
          b: 285e5
        },
        "11": {
          a: -1,
          b: 43e6
        },
        "12": {
          a: 105e6,
          b: 86e6
        }
      },
      "/items/luna_wing": {
        "0": {
          a: 285e3,
          b: 28e4
        }
      },
      "/items/maelstrom_plate_body": {
        "0": {
          a: 105e6,
          b: 98e6
        },
        "1": {
          a: -1,
          b: 86e6
        },
        "2": {
          a: -1,
          b: 86e6
        },
        "3": {
          a: -1,
          b: 86e6
        },
        "4": {
          a: -1,
          b: 88e6
        },
        "5": {
          a: 125e6,
          b: 1e8
        },
        "6": {
          a: -1,
          b: 86e6
        },
        "7": {
          a: 125e6,
          b: 12e7
        },
        "8": {
          a: 175e6,
          b: 145e6
        },
        "9": {
          a: -1,
          b: 18e7
        },
        "10": {
          a: 42e7,
          b: 4e8
        },
        "12": {
          a: 135e7,
          b: 12e8
        }
      },
      "/items/maelstrom_plate_body_refined": {
        "1": {
          a: -1,
          b: 48e5
        },
        "10": {
          a: 78e7,
          b: 7e8
        },
        "12": {
          a: -1,
          b: 125e7
        },
        "14": {
          a: -1,
          b: 45e5
        }
      },
      "/items/maelstrom_plate_legs": {
        "0": {
          a: 84e6,
          b: 76e6
        },
        "1": {
          a: -1,
          b: 72e6
        },
        "2": {
          a: -1,
          b: 72e6
        },
        "3": {
          a: -1,
          b: 72e6
        },
        "4": {
          a: -1,
          b: 7e7
        },
        "5": {
          a: 92e6,
          b: 78e6
        },
        "6": {
          a: 98e6,
          b: 74e6
        },
        "7": {
          a: 11e7,
          b: 105e6
        },
        "8": {
          a: 15e7,
          b: 13e7
        },
        "9": {
          a: -1,
          b: 17e7
        },
        "10": {
          a: 38e7,
          b: 37e7
        },
        "12": {
          a: 12e8,
          b: 11e8
        },
        "13": {
          a: 24e8,
          b: -1
        }
      },
      "/items/maelstrom_plate_legs_refined": {
        "10": {
          a: 76e7,
          b: 7e8
        },
        "12": {
          a: -1,
          b: 4e6
        },
        "14": {
          a: -1,
          b: 4e6
        }
      },
      "/items/maelstrom_plating": {
        "0": {
          a: 84e5,
          b: 82e5
        }
      },
      "/items/magic_coffee": {
        "0": {
          a: 1200,
          b: 1150
        }
      },
      "/items/magicians_cloth": {
        "0": {
          a: 68e5,
          b: 66e5
        }
      },
      "/items/magicians_hat": {
        "0": {
          a: 74e6,
          b: 72e6
        },
        "1": {
          a: -1,
          b: 58e6
        },
        "2": {
          a: -1,
          b: 58e6
        },
        "3": {
          a: -1,
          b: 56e6
        },
        "4": {
          a: -1,
          b: 58e6
        },
        "5": {
          a: 76e6,
          b: 64e6
        },
        "6": {
          a: -1,
          b: 68e6
        },
        "7": {
          a: 9e7,
          b: 86e6
        },
        "8": {
          a: 12e7,
          b: 1e8
        },
        "9": {
          a: 19e7,
          b: 17e7
        },
        "10": {
          a: 3e8,
          b: 295e6
        },
        "11": {
          a: -1,
          b: 48e7
        },
        "12": {
          a: 11e8,
          b: 88e7
        },
        "14": {
          a: 42e8,
          b: 35e5
        }
      },
      "/items/magicians_hat_refined": {
        "10": {
          a: 6e8,
          b: 56e7
        },
        "12": {
          a: 135e7,
          b: 125e7
        }
      },
      "/items/magnet": {
        "0": {
          a: 27e4,
          b: 265e3
        }
      },
      "/items/magnetic_gloves": {
        "0": {
          a: 26e5,
          b: 22e5
        },
        "1": {
          a: 29e5,
          b: -1
        },
        "3": {
          a: -1,
          b: 105e4
        },
        "5": {
          a: 31e5,
          b: 28e5
        },
        "6": {
          a: 45e5,
          b: -1
        },
        "7": {
          a: 7e6,
          b: 62e5
        },
        "8": {
          a: 135e5,
          b: 84e5
        },
        "9": {
          a: 205e5,
          b: -1
        },
        "10": {
          a: 32e6,
          b: 275e5
        },
        "12": {
          a: 115e6,
          b: -1
        }
      },
      "/items/magnifying_glass": {
        "0": {
          a: 18e5,
          b: 175e4
        }
      },
      "/items/maim": {
        "0": {
          a: 96e3,
          b: 94e3
        }
      },
      "/items/mana_spring": {
        "0": {
          a: 74e3,
          b: 72e3
        }
      },
      "/items/manticore_shield": {
        "0": {
          a: 21e6,
          b: 205e5
        },
        "2": {
          a: -1,
          b: 11e6
        },
        "3": {
          a: -1,
          b: 105e5
        },
        "5": {
          a: 23e6,
          b: 21e6
        },
        "6": {
          a: 275e5,
          b: 2e7
        },
        "7": {
          a: 31e6,
          b: 295e5
        },
        "8": {
          a: 58e6,
          b: 3e7
        },
        "9": {
          a: 88e6,
          b: 5e7
        },
        "10": {
          a: 13e7,
          b: 12e7
        },
        "12": {
          a: 44e7,
          b: 41e7
        }
      },
      "/items/manticore_sting": {
        "0": {
          a: 23e5,
          b: 225e4
        }
      },
      "/items/marine_chaps": {
        "0": {
          a: 44e4,
          b: 4e5
        },
        "2": {
          a: 68e4,
          b: -1
        },
        "8": {
          a: 2e6,
          b: 2e5
        }
      },
      "/items/marine_scale": {
        "0": {
          a: 64e3,
          b: 62e3
        }
      },
      "/items/marine_tunic": {
        "0": {
          a: 52e4,
          b: 5e5
        },
        "3": {
          a: 62e4,
          b: -1
        },
        "4": {
          a: 76e4,
          b: -1
        }
      },
      "/items/marksman_bracers": {
        "0": {
          a: 98e6,
          b: 94e6
        },
        "5": {
          a: 1e8,
          b: 82e6
        },
        "6": {
          a: -1,
          b: 94e6
        },
        "7": {
          a: 115e6,
          b: 11e7
        },
        "8": {
          a: 15e7,
          b: 13e7
        },
        "9": {
          a: -1,
          b: 16e7
        },
        "10": {
          a: 32e7,
          b: 31e7
        },
        "12": {
          a: -1,
          b: 1e9
        }
      },
      "/items/marksman_bracers_refined": {
        "10": {
          a: 68e7,
          b: 64e7
        },
        "11": {
          a: -1,
          b: 31e5
        },
        "12": {
          a: -1,
          b: 125e7
        },
        "15": {
          a: -1,
          b: 52e5
        }
      },
      "/items/marksman_brooch": {
        "0": {
          a: 84e5,
          b: 82e5
        }
      },
      "/items/marsberry": {
        "0": {
          a: 135,
          b: 125
        }
      },
      "/items/marsberry_cake": {
        "0": {
          a: 1350,
          b: 1300
        }
      },
      "/items/marsberry_donut": {
        "0": {
          a: 1e3,
          b: 980
        }
      },
      "/items/master_alchemy_charm": {
        "5": {
          a: -1,
          b: 1e9
        }
      },
      "/items/master_attack_charm": {
        "0": {
          a: 255e6,
          b: 165e6
        },
        "5": {
          a: 45e7,
          b: 42e7
        },
        "6": {
          a: -1,
          b: 86e6
        }
      },
      "/items/master_brewing_charm": {},
      "/items/master_cheesesmithing_charm": {
        "0": {
          a: 1e9,
          b: -1
        }
      },
      "/items/master_cooking_charm": {},
      "/items/master_crafting_charm": {
        "0": {
          a: -1,
          b: 105e6
        }
      },
      "/items/master_defense_charm": {
        "5": {
          a: 45e7,
          b: -1
        }
      },
      "/items/master_enhancing_charm": {
        "0": {
          a: 17e8,
          b: -1
        }
      },
      "/items/master_foraging_charm": {
        "5": {
          a: -1,
          b: 46e7
        },
        "6": {
          a: -1,
          b: 52e7
        },
        "7": {
          a: -1,
          b: 6e6
        }
      },
      "/items/master_intelligence_charm": {
        "5": {
          a: 58e7,
          b: -1
        }
      },
      "/items/master_magic_charm": {
        "5": {
          a: 58e7,
          b: 39e7
        },
        "6": {
          a: 74e7,
          b: 56e7
        }
      },
      "/items/master_melee_charm": {
        "0": {
          a: -1,
          b: 13e7
        },
        "5": {
          a: 45e7,
          b: 4e8
        }
      },
      "/items/master_milking_charm": {
        "0": {
          a: -1,
          b: 155e6
        },
        "10": {
          a: -1,
          b: 2e9
        }
      },
      "/items/master_ranged_charm": {
        "0": {
          a: 29e7,
          b: 165e6
        },
        "1": {
          a: 32e7,
          b: -1
        },
        "5": {
          a: 43e7,
          b: 4e8
        }
      },
      "/items/master_stamina_charm": {
        "5": {
          a: 6e8,
          b: 4e8
        }
      },
      "/items/master_tailoring_charm": {
        "0": {
          a: -1,
          b: 12e6
        }
      },
      "/items/master_woodcutting_charm": {
        "0": {
          a: -1,
          b: 62e5
        },
        "1": {
          a: -1,
          b: 1e7
        }
      },
      "/items/medium_pouch": {
        "0": {
          a: 155e3,
          b: 14e4
        },
        "2": {
          a: 34e4,
          b: -1
        },
        "3": {
          a: 58e4,
          b: -1
        }
      },
      "/items/melee_coffee": {
        "0": {
          a: 1150,
          b: 1100
        }
      },
      "/items/milk": {
        "0": {
          a: 96,
          b: 92
        }
      },
      "/items/milking_essence": {
        "0": {
          a: 265,
          b: 260
        }
      },
      "/items/milking_tea": {
        "0": {
          a: 540,
          b: 440
        }
      },
      "/items/minor_heal": {
        "0": {
          a: 2900,
          b: 2750
        }
      },
      "/items/mirror_of_protection": {
        "0": {
          a: 11e6,
          b: 105e5
        }
      },
      "/items/mooberry": {
        "0": {
          a: 180,
          b: 175
        }
      },
      "/items/mooberry_cake": {
        "0": {
          a: 1350,
          b: 1200
        }
      },
      "/items/mooberry_donut": {
        "0": {
          a: 880,
          b: 860
        }
      },
      "/items/moolong_tea_leaf": {
        "0": {
          a: 34,
          b: 32
        }
      },
      "/items/moonstone": {
        "0": {
          a: 52e3,
          b: 5e4
        }
      },
      "/items/mystic_aura": {
        "0": {
          a: 9e5,
          b: 88e4
        }
      },
      "/items/natures_veil": {
        "0": {
          a: 54e4,
          b: 52e4
        }
      },
      "/items/necklace_of_efficiency": {
        "0": {
          a: 12e6,
          b: 11e6
        },
        "1": {
          a: 2e7,
          b: -1
        },
        "3": {
          a: -1,
          b: 21e6
        },
        "6": {
          a: -1,
          b: 1e8
        }
      },
      "/items/necklace_of_speed": {
        "0": {
          a: 145e5,
          b: 135e5
        },
        "1": {
          a: 17e6,
          b: 135e5
        },
        "2": {
          a: 23e6,
          b: 175e5
        },
        "3": {
          a: 33e6,
          b: 31e6
        },
        "4": {
          a: 64e6,
          b: 52e6
        },
        "5": {
          a: 115e6,
          b: 11e7
        },
        "6": {
          a: 2e8,
          b: 15e7
        },
        "7": {
          a: -1,
          b: 175e6
        }
      },
      "/items/necklace_of_wisdom": {
        "0": {
          a: 11e6,
          b: 1e7
        },
        "1": {
          a: 14e6,
          b: 1e7
        },
        "2": {
          a: 19e6,
          b: 14e6
        },
        "3": {
          a: 31e6,
          b: 275e5
        },
        "4": {
          a: 58e6,
          b: 5e7
        },
        "5": {
          a: 105e6,
          b: 98e6
        },
        "6": {
          a: -1,
          b: 92e6
        },
        "7": {
          a: -1,
          b: 17e7
        },
        "9": {
          a: 54e7,
          b: 3e8
        },
        "10": {
          a: -1,
          b: 34e7
        }
      },
      "/items/orange": {
        "0": {
          a: 18,
          b: 17
        }
      },
      "/items/orange_gummy": {
        "0": {
          a: 86,
          b: 82
        }
      },
      "/items/orange_key_fragment": {
        "0": {
          a: 105e4,
          b: 1e6
        }
      },
      "/items/orange_yogurt": {
        "0": {
          a: 560,
          b: 540
        }
      },
      "/items/panda_fluff": {
        "0": {
          a: 62e3,
          b: 6e4
        }
      },
      "/items/panda_gloves": {
        "0": {
          a: 47e4,
          b: 36e4
        },
        "2": {
          a: 43e4,
          b: -1
        },
        "3": {
          a: 45e4,
          b: -1
        },
        "4": {
          a: 48e4,
          b: -1
        },
        "5": {
          a: 58e4,
          b: 4e5
        },
        "6": {
          a: 12e5,
          b: 15e4
        },
        "7": {
          a: 165e4,
          b: 115e4
        },
        "8": {
          a: 4e6,
          b: 45e4
        },
        "9": {
          a: -1,
          b: 36e4
        },
        "10": {
          a: 56e5,
          b: 42e5
        },
        "11": {
          a: 17e6,
          b: -1
        },
        "12": {
          a: 35e6,
          b: -1
        }
      },
      "/items/peach": {
        "0": {
          a: 195,
          b: 190
        }
      },
      "/items/peach_gummy": {
        "0": {
          a: 740,
          b: 700
        }
      },
      "/items/peach_yogurt": {
        "0": {
          a: 1050,
          b: 1e3
        }
      },
      "/items/pearl": {
        "0": {
          a: 14e3,
          b: 13500
        }
      },
      "/items/penetrating_shot": {
        "0": {
          a: 3e5,
          b: 295e3
        }
      },
      "/items/penetrating_strike": {
        "0": {
          a: 19e4,
          b: 185e3
        }
      },
      "/items/pestilent_shot": {
        "0": {
          a: 49e3,
          b: 47e3
        }
      },
      "/items/philosophers_earrings": {
        "0": {
          a: 66e7,
          b: 6e8
        },
        "1": {
          a: -1,
          b: 56e7
        },
        "2": {
          a: -1,
          b: 6e8
        },
        "3": {
          a: 76e7,
          b: 72e7
        },
        "4": {
          a: -1,
          b: 68e7
        },
        "5": {
          a: 98e7,
          b: 96e7
        },
        "6": {
          a: -1,
          b: 11e8
        },
        "7": {
          a: 16e8,
          b: 155e7
        },
        "8": {
          a: 215e7,
          b: 16e8
        },
        "10": {
          a: -1,
          b: 38e8
        }
      },
      "/items/philosophers_necklace": {
        "0": {
          a: 68e7,
          b: 64e7
        },
        "1": {
          a: -1,
          b: 58e7
        },
        "2": {
          a: -1,
          b: 62e7
        },
        "3": {
          a: 82e7,
          b: 78e7
        },
        "4": {
          a: -1,
          b: 78e7
        },
        "5": {
          a: 11e8,
          b: 105e7
        },
        "6": {
          a: -1,
          b: 115e7
        },
        "7": {
          a: 185e7,
          b: 18e8
        },
        "8": {
          a: -1,
          b: 19e8
        },
        "10": {
          a: 6e9,
          b: 58e8
        },
        "20": {
          a: -1,
          b: 12e6
        }
      },
      "/items/philosophers_ring": {
        "0": {
          a: 66e7,
          b: 6e8
        },
        "1": {
          a: -1,
          b: 54e7
        },
        "2": {
          a: -1,
          b: 58e7
        },
        "3": {
          a: 76e7,
          b: 72e7
        },
        "4": {
          a: -1,
          b: 78e7
        },
        "5": {
          a: 98e7,
          b: 96e7
        },
        "6": {
          a: 125e7,
          b: 11e8
        },
        "7": {
          a: 16e8,
          b: 155e7
        },
        "8": {
          a: 215e7,
          b: 18e8
        },
        "10": {
          a: -1,
          b: 38e8
        }
      },
      "/items/philosophers_stone": {
        "0": {
          a: 6e8,
          b: 58e7
        }
      },
      "/items/pincer_gloves": {
        "0": {
          a: 27e3,
          b: 24500
        },
        "1": {
          a: 4e4,
          b: -1
        },
        "2": {
          a: 44e3,
          b: -1
        },
        "3": {
          a: 5e4,
          b: -1
        },
        "4": {
          a: 86e3,
          b: -1
        },
        "5": {
          a: 125e3,
          b: -1
        },
        "6": {
          a: 34e4,
          b: -1
        },
        "8": {
          a: 5e5,
          b: -1
        },
        "10": {
          a: 37e5,
          b: 13e5
        },
        "11": {
          a: 58e5,
          b: -1
        },
        "12": {
          a: 155e5,
          b: 10500
        }
      },
      "/items/pirate_chest_key": {
        "0": {
          a: 58e5,
          b: 56e5
        }
      },
      "/items/pirate_entry_key": {
        "0": {
          a: 64e4,
          b: 62e4
        }
      },
      "/items/pirate_essence": {
        "0": {
          a: 1950,
          b: 1900
        }
      },
      "/items/pirate_refinement_shard": {
        "0": {
          a: 36e5,
          b: 35e5
        }
      },
      "/items/plum": {
        "0": {
          a: 52,
          b: 50
        }
      },
      "/items/plum_gummy": {
        "0": {
          a: 390,
          b: 370
        }
      },
      "/items/plum_yogurt": {
        "0": {
          a: 740,
          b: 700
        }
      },
      "/items/poke": {
        "0": {
          a: 2950,
          b: 2900
        }
      },
      "/items/polar_bear_fluff": {
        "0": {
          a: 12e4,
          b: 115e3
        }
      },
      "/items/polar_bear_shoes": {
        "0": {
          a: 82e4,
          b: 76e4
        },
        "1": {
          a: 98e4,
          b: -1
        },
        "3": {
          a: 125e4,
          b: -1
        },
        "5": {
          a: -1,
          b: 12e5
        },
        "6": {
          a: -1,
          b: 14e5
        },
        "7": {
          a: 3e6,
          b: 245e4
        },
        "8": {
          a: 5e6,
          b: -1
        },
        "9": {
          a: 88e5,
          b: 76e5
        },
        "10": {
          a: 135e5,
          b: 13e6
        },
        "11": {
          a: 295e5,
          b: -1
        },
        "12": {
          a: 46e6,
          b: 43e6
        },
        "13": {
          a: 92e6,
          b: 8e7
        },
        "14": {
          a: 2e8,
          b: 18e7
        },
        "15": {
          a: 44e7,
          b: -1
        }
      },
      "/items/precision": {
        "0": {
          a: 56e3,
          b: 54e3
        }
      },
      "/items/prime_catalyst": {
        "0": {
          a: 17e4,
          b: 16e4
        }
      },
      "/items/processing_tea": {
        "0": {
          a: 2450,
          b: 2400
        }
      },
      "/items/provoke": {
        "0": {
          a: 68e3,
          b: 66e3
        }
      },
      "/items/puncture": {
        "0": {
          a: 96e3,
          b: 94e3
        }
      },
      "/items/purple_key_fragment": {
        "0": {
          a: 74e4,
          b: 72e4
        }
      },
      "/items/purpleheart_bow": {
        "0": {
          a: 165e3,
          b: 135e3
        },
        "5": {
          a: 56e5,
          b: -1
        }
      },
      "/items/purpleheart_crossbow": {
        "0": {
          a: 15e4,
          b: 105e3
        },
        "1": {
          a: 155e3,
          b: -1
        },
        "2": {
          a: 145e3,
          b: -1
        },
        "3": {
          a: 225e3,
          b: -1
        },
        "4": {
          a: 14e6,
          b: -1
        },
        "5": {
          a: 2e6,
          b: -1
        },
        "7": {
          a: 86e5,
          b: -1
        }
      },
      "/items/purpleheart_fire_staff": {
        "0": {
          a: 13e4,
          b: 115e3
        },
        "2": {
          a: 15e4,
          b: -1
        },
        "3": {
          a: 2e5,
          b: -1
        },
        "5": {
          a: 1e6,
          b: -1
        },
        "7": {
          a: 12e5,
          b: -1
        }
      },
      "/items/purpleheart_log": {
        "0": {
          a: 265,
          b: 260
        }
      },
      "/items/purpleheart_lumber": {
        "0": {
          a: 1350,
          b: 1300
        }
      },
      "/items/purpleheart_nature_staff": {
        "0": {
          a: 145e3,
          b: 12e4
        },
        "1": {
          a: 35e4,
          b: -1
        },
        "2": {
          a: 26e4,
          b: -1
        },
        "5": {
          a: 49e4,
          b: -1
        }
      },
      "/items/purpleheart_shield": {
        "0": {
          a: 125e3,
          b: 88e3
        },
        "1": {
          a: 12e4,
          b: -1
        },
        "3": {
          a: 19e4,
          b: -1
        },
        "4": {
          a: 44e4,
          b: -1
        },
        "5": {
          a: 39e4,
          b: -1
        },
        "6": {
          a: 62e4,
          b: -1
        }
      },
      "/items/purpleheart_water_staff": {
        "0": {
          a: 13e4,
          b: 115e3
        },
        "1": {
          a: 2e5,
          b: -1
        },
        "2": {
          a: 8e6,
          b: -1
        },
        "4": {
          a: 22e5,
          b: -1
        },
        "5": {
          a: 49e5,
          b: -1
        },
        "8": {
          a: 7e6,
          b: -1
        }
      },
      "/items/quick_aid": {
        "0": {
          a: 12e4,
          b: 115e3
        }
      },
      "/items/quick_shot": {
        "0": {
          a: 2800,
          b: 2750
        }
      },
      "/items/radiant_boots": {
        "0": {
          a: 18e4,
          b: 175e3
        },
        "2": {
          a: 245e3,
          b: -1
        },
        "3": {
          a: 25e4,
          b: -1
        },
        "4": {
          a: 56e4,
          b: -1
        },
        "5": {
          a: 135e4,
          b: 7e5
        },
        "6": {
          a: 28e5,
          b: 28e4
        },
        "10": {
          a: -1,
          b: 2e7
        }
      },
      "/items/radiant_fabric": {
        "0": {
          a: 2750,
          b: 2700
        }
      },
      "/items/radiant_fiber": {
        "0": {
          a: 580,
          b: 560
        }
      },
      "/items/radiant_gloves": {
        "0": {
          a: 185e3,
          b: 175e3
        },
        "1": {
          a: 18e4,
          b: -1
        },
        "2": {
          a: 2e5,
          b: -1
        },
        "3": {
          a: 3e5,
          b: -1
        },
        "5": {
          a: 92e4,
          b: 56e4
        },
        "6": {
          a: 295e4,
          b: 295e3
        }
      },
      "/items/radiant_hat": {
        "0": {
          a: 295e3,
          b: 29e4
        },
        "1": {
          a: 37e4,
          b: 215e3
        },
        "3": {
          a: 41e4,
          b: -1
        },
        "5": {
          a: 62e4,
          b: 5e5
        },
        "6": {
          a: 28e5,
          b: 1e6
        },
        "7": {
          a: -1,
          b: 3e6
        },
        "10": {
          a: 3e7,
          b: 255e5
        }
      },
      "/items/radiant_robe_bottoms": {
        "0": {
          a: 52e4,
          b: 5e5
        },
        "1": {
          a: 66e4,
          b: -1
        },
        "2": {
          a: 62e4,
          b: -1
        },
        "3": {
          a: 62e4,
          b: -1
        },
        "4": {
          a: 98e4,
          b: -1
        },
        "5": {
          a: 22e5,
          b: -1
        },
        "7": {
          a: 88e5,
          b: -1
        }
      },
      "/items/radiant_robe_top": {
        "0": {
          a: 58e4,
          b: 56e4
        },
        "1": {
          a: 62e4,
          b: -1
        },
        "2": {
          a: 7e5,
          b: -1
        },
        "3": {
          a: 78e4,
          b: -1
        },
        "4": {
          a: 9e5,
          b: -1
        },
        "5": {
          a: 11e5,
          b: 82e4
        },
        "6": {
          a: 43e5,
          b: 43e4
        }
      },
      "/items/rain_of_arrows": {
        "0": {
          a: 195e3,
          b: 19e4
        }
      },
      "/items/rainbow_alembic": {
        "0": {
          a: 3e5,
          b: 26e4
        },
        "1": {
          a: 52e4,
          b: -1
        },
        "2": {
          a: 42e4,
          b: -1
        },
        "3": {
          a: 7e5,
          b: 1e5
        },
        "4": {
          a: 86e4,
          b: -1
        },
        "5": {
          a: 94e4,
          b: -1
        },
        "6": {
          a: -1,
          b: 54e4
        }
      },
      "/items/rainbow_boots": {
        "0": {
          a: 195e3,
          b: 19e4
        },
        "1": {
          a: 225e3,
          b: -1
        },
        "4": {
          a: 39e4,
          b: -1
        },
        "5": {
          a: 36e4,
          b: -1
        }
      },
      "/items/rainbow_brush": {
        "0": {
          a: 25e4,
          b: 21e4
        },
        "1": {
          a: 45e4,
          b: -1
        },
        "2": {
          a: 46e4,
          b: -1
        },
        "3": {
          a: 6e5,
          b: 1e5
        },
        "4": {
          a: 92e4,
          b: -1
        },
        "5": {
          a: 82e4,
          b: 27e4
        },
        "6": {
          a: 52e5,
          b: 11e5
        },
        "7": {
          a: 1e7,
          b: -1
        }
      },
      "/items/rainbow_buckler": {
        "0": {
          a: 255e3,
          b: 215e3
        },
        "1": {
          a: 33e4,
          b: -1
        },
        "2": {
          a: 29e4,
          b: -1
        },
        "4": {
          a: 62e4,
          b: -1
        },
        "5": {
          a: 94e4,
          b: -1
        },
        "6": {
          a: 115e4,
          b: -1
        }
      },
      "/items/rainbow_bulwark": {
        "0": {
          a: 35e4,
          b: 34e4
        },
        "1": {
          a: 31e4,
          b: -1
        },
        "2": {
          a: 58e4,
          b: -1
        },
        "3": {
          a: 54e4,
          b: -1
        },
        "4": {
          a: 1e6,
          b: -1
        },
        "5": {
          a: 14e5,
          b: -1
        }
      },
      "/items/rainbow_cheese": {
        "0": {
          a: 1800,
          b: 1700
        }
      },
      "/items/rainbow_chisel": {
        "0": {
          a: 24e4,
          b: 225e3
        },
        "1": {
          a: -1,
          b: 13e4
        },
        "2": {
          a: 255e3,
          b: 135e3
        },
        "3": {
          a: -1,
          b: 1e5
        },
        "4": {
          a: 7e5,
          b: -1
        },
        "5": {
          a: 115e4,
          b: -1
        },
        "6": {
          a: 2e6,
          b: 125e4
        }
      },
      "/items/rainbow_enhancer": {
        "0": {
          a: 31e4,
          b: 24e4
        },
        "1": {
          a: 49e4,
          b: -1
        },
        "2": {
          a: 52e4,
          b: -1
        },
        "3": {
          a: -1,
          b: 1e5
        },
        "4": {
          a: 84e4,
          b: -1
        },
        "5": {
          a: 96e4,
          b: 32e4
        },
        "6": {
          a: 175e4,
          b: 13e5
        },
        "7": {
          a: 5e6,
          b: -1
        }
      },
      "/items/rainbow_gauntlets": {
        "0": {
          a: 195e3,
          b: 145e3
        },
        "1": {
          a: 23e4,
          b: -1
        },
        "2": {
          a: 2e5,
          b: -1
        },
        "3": {
          a: 35e4,
          b: -1
        },
        "5": {
          a: 92e4,
          b: -1
        },
        "6": {
          a: 25e5,
          b: -1
        }
      },
      "/items/rainbow_hammer": {
        "0": {
          a: 265e3,
          b: 245e3
        },
        "1": {
          a: 39e4,
          b: -1
        },
        "2": {
          a: 35e4,
          b: -1
        },
        "3": {
          a: 76e4,
          b: 1e5
        },
        "5": {
          a: 12e5,
          b: 8e5
        },
        "6": {
          a: 54e5,
          b: 115e4
        },
        "7": {
          a: -1,
          b: 13e5
        }
      },
      "/items/rainbow_hatchet": {
        "0": {
          a: 295e3,
          b: 26e4
        },
        "1": {
          a: 32e4,
          b: -1
        },
        "2": {
          a: 45e4,
          b: -1
        },
        "3": {
          a: 68e4,
          b: 1e5
        },
        "4": {
          a: 1e6,
          b: -1
        },
        "5": {
          a: 15e5,
          b: 8e5
        },
        "6": {
          a: 6e6,
          b: 13e5
        },
        "7": {
          a: 11e6,
          b: -1
        }
      },
      "/items/rainbow_helmet": {
        "0": {
          a: 235e3,
          b: 22e4
        },
        "1": {
          a: 25e4,
          b: -1
        },
        "3": {
          a: 37e4,
          b: -1
        },
        "4": {
          a: 44e4,
          b: -1
        },
        "5": {
          a: 7e5,
          b: -1
        }
      },
      "/items/rainbow_mace": {
        "0": {
          a: 46e4,
          b: 38e4
        },
        "1": {
          a: 35e4,
          b: -1
        },
        "3": {
          a: 47e4,
          b: -1
        },
        "4": {
          a: 54e4,
          b: -1
        }
      },
      "/items/rainbow_milk": {
        "0": {
          a: 370,
          b: 360
        }
      },
      "/items/rainbow_needle": {
        "0": {
          a: 25e4,
          b: 24e4
        },
        "3": {
          a: -1,
          b: 1e5
        },
        "4": {
          a: 5e5,
          b: -1
        },
        "5": {
          a: 115e4,
          b: -1
        },
        "6": {
          a: -1,
          b: 14e5
        }
      },
      "/items/rainbow_plate_body": {
        "0": {
          a: 34e4,
          b: 33e4
        },
        "1": {
          a: 39e4,
          b: -1
        },
        "2": {
          a: 52e4,
          b: -1
        },
        "3": {
          a: 6e5,
          b: -1
        },
        "4": {
          a: 98e4,
          b: -1
        },
        "5": {
          a: 175e4,
          b: 29500
        }
      },
      "/items/rainbow_plate_legs": {
        "0": {
          a: 295e3,
          b: 17e4
        },
        "3": {
          a: 56e4,
          b: -1
        },
        "4": {
          a: 45e5,
          b: -1
        },
        "5": {
          a: 45e5,
          b: -1
        },
        "6": {
          a: 68e5,
          b: -1
        }
      },
      "/items/rainbow_pot": {
        "0": {
          a: 285e3,
          b: 27e4
        },
        "1": {
          a: 32e4,
          b: -1
        },
        "2": {
          a: 42e4,
          b: -1
        },
        "3": {
          a: 6e5,
          b: 35e4
        },
        "5": {
          a: 14e5,
          b: 78e4
        },
        "6": {
          a: 54e5,
          b: 13e5
        },
        "7": {
          a: 5e6,
          b: -1
        },
        "8": {
          a: 6e6,
          b: -1
        }
      },
      "/items/rainbow_shears": {
        "0": {
          a: 3e5,
          b: 29e4
        },
        "1": {
          a: 4e5,
          b: -1
        },
        "2": {
          a: 46e4,
          b: -1
        },
        "3": {
          a: 9e5,
          b: 1e5
        },
        "4": {
          a: 135e4,
          b: -1
        },
        "5": {
          a: 11e5,
          b: -1
        },
        "6": {
          a: 52e5,
          b: 145e4
        },
        "7": {
          a: 175e5,
          b: 125e4
        },
        "8": {
          a: 13e6,
          b: -1
        }
      },
      "/items/rainbow_spatula": {
        "0": {
          a: 43e4,
          b: 28e4
        },
        "1": {
          a: 38e4,
          b: -1
        },
        "2": {
          a: 39e4,
          b: -1
        },
        "3": {
          a: 56e4,
          b: 1e5
        },
        "4": {
          a: 86e4,
          b: -1
        },
        "5": {
          a: 115e4,
          b: -1
        },
        "6": {
          a: 48e5,
          b: 64e4
        }
      },
      "/items/rainbow_spear": {
        "0": {
          a: 39e4,
          b: 38e4
        },
        "1": {
          a: 7e5,
          b: -1
        },
        "2": {
          a: 7e5,
          b: -1
        },
        "3": {
          a: 105e4,
          b: -1
        },
        "5": {
          a: -1,
          b: 74e4
        }
      },
      "/items/rainbow_sword": {
        "0": {
          a: 42e4,
          b: 39e4
        },
        "2": {
          a: 38e4,
          b: -1
        },
        "3": {
          a: 43e4,
          b: -1
        },
        "6": {
          a: 64e4,
          b: -1
        },
        "7": {
          a: 82e4,
          b: -1
        }
      },
      "/items/ranged_coffee": {
        "0": {
          a: 1200,
          b: 1100
        }
      },
      "/items/ranger_necklace": {
        "0": {
          a: 12e6,
          b: 115e5
        },
        "1": {
          a: 15e6,
          b: 8e6
        },
        "2": {
          a: 17e6,
          b: 1e7
        },
        "3": {
          a: 245e5,
          b: 16e6
        },
        "7": {
          a: -1,
          b: 12e7
        }
      },
      "/items/red_culinary_hat": {
        "0": {
          a: 54e5,
          b: 52e5
        },
        "2": {
          a: 82e5,
          b: 86e4
        },
        "4": {
          a: -1,
          b: 155e4
        },
        "5": {
          a: 9e6,
          b: 68e5
        },
        "6": {
          a: 105e5,
          b: -1
        },
        "7": {
          a: 13e6,
          b: 88e5
        },
        "8": {
          a: 2e7,
          b: 18e6
        },
        "9": {
          a: -1,
          b: 88e5
        },
        "10": {
          a: 5e7,
          b: 48e6
        },
        "12": {
          a: 19e7,
          b: 15e7
        },
        "15": {
          a: 15e8,
          b: 1e8
        }
      },
      "/items/red_panda_fluff": {
        "0": {
          a: 54e4,
          b: 52e4
        }
      },
      "/items/red_tea_leaf": {
        "0": {
          a: 50,
          b: 48
        }
      },
      "/items/redwood_bow": {
        "0": {
          a: 56e4,
          b: 54e4
        },
        "3": {
          a: 12e5,
          b: -1
        },
        "5": {
          a: 68e4,
          b: -1
        },
        "6": {
          a: 27e5,
          b: -1
        }
      },
      "/items/redwood_crossbow": {
        "0": {
          a: 46e4,
          b: 41e4
        },
        "1": {
          a: 4e5,
          b: -1
        },
        "2": {
          a: 5e5,
          b: -1
        },
        "3": {
          a: 56e4,
          b: -1
        },
        "5": {
          a: 66e4,
          b: -1
        },
        "6": {
          a: 25e5,
          b: -1
        },
        "7": {
          a: 64e5,
          b: 3e6
        },
        "8": {
          a: 14e6,
          b: -1
        },
        "10": {
          a: 205e5,
          b: -1
        }
      },
      "/items/redwood_fire_staff": {
        "0": {
          a: 4e5,
          b: 39e4
        },
        "2": {
          a: 9e5,
          b: -1
        },
        "3": {
          a: 9e5,
          b: -1
        },
        "4": {
          a: 12e5,
          b: -1
        },
        "5": {
          a: 14e5,
          b: -1
        },
        "8": {
          a: 6e6,
          b: -1
        }
      },
      "/items/redwood_log": {
        "0": {
          a: 380,
          b: 370
        }
      },
      "/items/redwood_lumber": {
        "0": {
          a: 1850,
          b: 1800
        }
      },
      "/items/redwood_nature_staff": {
        "0": {
          a: 44e4,
          b: 4e5
        },
        "1": {
          a: 52e4,
          b: -1
        },
        "2": {
          a: 76e4,
          b: -1
        },
        "3": {
          a: 8e5,
          b: -1
        },
        "5": {
          a: 145e4,
          b: -1
        }
      },
      "/items/redwood_shield": {
        "0": {
          a: 265e3,
          b: 25e4
        },
        "1": {
          a: 27e4,
          b: -1
        },
        "2": {
          a: 27e4,
          b: -1
        },
        "3": {
          a: 46e4,
          b: -1
        },
        "5": {
          a: 8e5,
          b: -1
        },
        "6": {
          a: 92e4,
          b: -1
        },
        "10": {
          a: 21e6,
          b: -1
        }
      },
      "/items/redwood_water_staff": {
        "0": {
          a: 54e4,
          b: 39e4
        },
        "1": {
          a: 54e4,
          b: -1
        },
        "2": {
          a: 52e4,
          b: -1
        },
        "3": {
          a: 86e4,
          b: -1
        },
        "4": {
          a: 6e5,
          b: -1
        },
        "5": {
          a: 11e5,
          b: -1
        },
        "7": {
          a: 2e6,
          b: -1
        },
        "10": {
          a: 1e7,
          b: -1
        }
      },
      "/items/regal_jewel": {
        "0": {
          a: 105e5,
          b: 1e7
        }
      },
      "/items/regal_sword": {
        "0": {
          a: 22e7,
          b: 18e7
        },
        "4": {
          a: 22e7,
          b: -1
        },
        "5": {
          a: 225e6,
          b: 215e6
        },
        "7": {
          a: 265e6,
          b: 245e6
        },
        "8": {
          a: 33e7,
          b: 29e7
        },
        "9": {
          a: 44e7,
          b: -1
        },
        "10": {
          a: 6e8,
          b: 56e7
        },
        "12": {
          a: 175e7,
          b: -1
        }
      },
      "/items/regal_sword_refined": {
        "0": {
          a: -1,
          b: 52e5
        },
        "1": {
          a: -1,
          b: 56e5
        },
        "2": {
          a: -1,
          b: 62e5
        },
        "3": {
          a: -1,
          b: 62e5
        },
        "10": {
          a: 165e7,
          b: 56e5
        },
        "12": {
          a: 275e7,
          b: 58e5
        }
      },
      "/items/rejuvenate": {
        "0": {
          a: 12e4,
          b: 115e3
        }
      },
      "/items/reptile_boots": {
        "0": {
          a: 18e3,
          b: 11e3
        },
        "1": {
          a: 29500,
          b: -1
        }
      },
      "/items/reptile_bracers": {
        "0": {
          a: 14500,
          b: 1e4
        },
        "1": {
          a: 6e4,
          b: -1
        },
        "2": {
          a: 86e3,
          b: -1
        },
        "3": {
          a: 96e3,
          b: -1
        }
      },
      "/items/reptile_chaps": {
        "0": {
          a: 23e3,
          b: 21e3
        },
        "2": {
          a: 25e4,
          b: -1
        }
      },
      "/items/reptile_hide": {
        "0": {
          a: 24,
          b: 23
        }
      },
      "/items/reptile_hood": {
        "0": {
          a: 16e3,
          b: 12e3
        }
      },
      "/items/reptile_leather": {
        "0": {
          a: 580,
          b: 560
        }
      },
      "/items/reptile_tunic": {
        "0": {
          a: 25500,
          b: 23e3
        },
        "1": {
          a: 8e4,
          b: -1
        },
        "2": {
          a: 17e4,
          b: -1
        }
      },
      "/items/retribution": {
        "0": {
          a: 52e3,
          b: 5e4
        }
      },
      "/items/revenant_anima": {
        "0": {
          a: 92e4,
          b: 9e5
        }
      },
      "/items/revenant_chaps": {
        "0": {
          a: 72e5,
          b: 66e5
        },
        "5": {
          a: 72e5,
          b: 66e5
        },
        "6": {
          a: 1e7,
          b: -1
        },
        "7": {
          a: 155e5,
          b: 14e6
        },
        "8": {
          a: 225e5,
          b: 15e6
        },
        "9": {
          a: 5e7,
          b: -1
        },
        "10": {
          a: 7e7,
          b: 43e6
        }
      },
      "/items/revenant_tunic": {
        "0": {
          a: 86e5,
          b: 82e5
        },
        "3": {
          a: -1,
          b: 32e5
        },
        "5": {
          a: 96e5,
          b: 92e5
        },
        "6": {
          a: 12e6,
          b: 11e6
        },
        "7": {
          a: 16e6,
          b: 14e6
        },
        "8": {
          a: 235e5,
          b: 15e6
        },
        "9": {
          a: 45e6,
          b: -1
        },
        "10": {
          a: 66e6,
          b: 37e6
        }
      },
      "/items/revive": {
        "0": {
          a: 82e4,
          b: 8e5
        }
      },
      "/items/ring_of_armor": {
        "0": {
          a: 62e5,
          b: 56e5
        },
        "1": {
          a: 64e5,
          b: -1
        },
        "2": {
          a: 98e5,
          b: -1
        },
        "3": {
          a: 11e6,
          b: -1
        },
        "4": {
          a: 3e7,
          b: -1
        }
      },
      "/items/ring_of_critical_strike": {
        "0": {
          a: 96e5,
          b: 82e5
        },
        "1": {
          a: -1,
          b: 78e5
        },
        "2": {
          a: -1,
          b: 1e7
        },
        "3": {
          a: 205e5,
          b: 18e6
        },
        "4": {
          a: 4e7,
          b: 32e6
        },
        "5": {
          a: 74e6,
          b: 7e7
        },
        "6": {
          a: 11e7,
          b: 74e6
        }
      },
      "/items/ring_of_essence_find": {
        "0": {
          a: 74e5,
          b: 64e5
        }
      },
      "/items/ring_of_gathering": {
        "0": {
          a: 62e5,
          b: 58e5
        },
        "1": {
          a: 11e6,
          b: -1
        }
      },
      "/items/ring_of_rare_find": {
        "0": {
          a: 74e5,
          b: 7e6
        },
        "1": {
          a: 9e6,
          b: 7e6
        },
        "2": {
          a: -1,
          b: 94e5
        },
        "3": {
          a: 2e7,
          b: 17e6
        },
        "4": {
          a: 4e7,
          b: 295e5
        },
        "5": {
          a: 7e7,
          b: 66e6
        },
        "6": {
          a: 14e7,
          b: -1
        },
        "7": {
          a: -1,
          b: 72e5
        }
      },
      "/items/ring_of_regeneration": {
        "0": {
          a: 66e5,
          b: 6e6
        },
        "1": {
          a: 72e5,
          b: 64e5
        },
        "2": {
          a: 12e6,
          b: 84e5
        },
        "3": {
          a: 16e6,
          b: 145e5
        },
        "4": {
          a: 3e7,
          b: 27e6
        },
        "5": {
          a: 66e6,
          b: 6e7
        },
        "6": {
          a: 11e7,
          b: 7e7
        },
        "7": {
          a: 19e7,
          b: 145e6
        },
        "10": {
          a: 9e8,
          b: -1
        }
      },
      "/items/ring_of_resistance": {
        "0": {
          a: 58e5,
          b: 56e5
        },
        "1": {
          a: 9e6,
          b: -1
        },
        "3": {
          a: 13e6,
          b: -1
        },
        "5": {
          a: 49e6,
          b: -1
        }
      },
      "/items/rippling_trident": {
        "0": {
          a: 23e7,
          b: 22e7
        },
        "1": {
          a: -1,
          b: 2e8
        },
        "2": {
          a: -1,
          b: 2e8
        },
        "3": {
          a: -1,
          b: 205e6
        },
        "4": {
          a: -1,
          b: 19e7
        },
        "5": {
          a: 3e8,
          b: 22e7
        },
        "6": {
          a: -1,
          b: 22e7
        },
        "7": {
          a: 26e7,
          b: 245e6
        },
        "8": {
          a: 33e7,
          b: 285e6
        },
        "9": {
          a: -1,
          b: 32e7
        },
        "10": {
          a: 62e7,
          b: 58e7
        },
        "12": {
          a: 17e8,
          b: 145e7
        },
        "14": {
          a: 66e8,
          b: -1
        }
      },
      "/items/rippling_trident_refined": {
        "10": {
          a: 17e8,
          b: 125e7
        },
        "12": {
          a: 285e7,
          b: -1
        },
        "14": {
          a: 7e9,
          b: 6e9
        }
      },
      "/items/robusta_coffee_bean": {
        "0": {
          a: 440,
          b: 420
        }
      },
      "/items/rough_boots": {
        "0": {
          a: 2950,
          b: 2150
        },
        "2": {
          a: 16e3,
          b: -1
        }
      },
      "/items/rough_bracers": {
        "0": {
          a: 3600,
          b: 2700
        },
        "1": {
          a: 14e3,
          b: -1
        },
        "2": {
          a: 18e3,
          b: -1
        }
      },
      "/items/rough_chaps": {
        "0": {
          a: 6e3,
          b: 4900
        },
        "3": {
          a: 28e3,
          b: -1
        }
      },
      "/items/rough_hide": {
        "0": {
          a: 76,
          b: 64
        }
      },
      "/items/rough_hood": {
        "0": {
          a: 4900,
          b: 3400
        },
        "2": {
          a: 2e4,
          b: -1
        },
        "5": {
          a: -1,
          b: 290
        },
        "10": {
          a: -1,
          b: 290
        }
      },
      "/items/rough_leather": {
        "0": {
          a: 450,
          b: 440
        }
      },
      "/items/rough_tunic": {
        "0": {
          a: 7e3,
          b: 5400
        },
        "2": {
          a: 38e3,
          b: -1
        },
        "3": {
          a: 76e3,
          b: -1
        }
      },
      "/items/royal_cloth": {
        "0": {
          a: 8e6,
          b: 78e5
        }
      },
      "/items/royal_fire_robe_bottoms": {
        "0": {
          a: 76e6,
          b: 66e6
        },
        "5": {
          a: 78e6,
          b: 68e6
        },
        "7": {
          a: 96e6,
          b: 9e7
        },
        "8": {
          a: 16e7,
          b: 11e7
        },
        "9": {
          a: -1,
          b: 175e6
        },
        "10": {
          a: 37e7,
          b: 35e7
        },
        "12": {
          a: 125e7,
          b: 115e7
        }
      },
      "/items/royal_fire_robe_bottoms_refined": {
        "10": {
          a: 7e8,
          b: 8e7
        }
      },
      "/items/royal_fire_robe_top": {
        "0": {
          a: 88e6,
          b: 82e6
        },
        "3": {
          a: -1,
          b: 8e7
        },
        "5": {
          a: -1,
          b: 84e6
        },
        "6": {
          a: 105e6,
          b: 9e7
        },
        "7": {
          a: 115e6,
          b: 11e7
        },
        "8": {
          a: 165e6,
          b: 14e7
        },
        "9": {
          a: -1,
          b: 19e7
        },
        "10": {
          a: 4e8,
          b: 38e7
        },
        "12": {
          a: 135e7,
          b: 12e8
        }
      },
      "/items/royal_fire_robe_top_refined": {
        "10": {
          a: -1,
          b: 72e7
        }
      },
      "/items/royal_nature_robe_bottoms": {
        "0": {
          a: 78e6,
          b: 68e6
        },
        "5": {
          a: 78e6,
          b: 7e7
        },
        "7": {
          a: 96e6,
          b: 92e6
        },
        "8": {
          a: 145e6,
          b: 115e6
        },
        "10": {
          a: 37e7,
          b: 36e7
        },
        "12": {
          a: -1,
          b: 115e7
        }
      },
      "/items/royal_nature_robe_bottoms_refined": {
        "10": {
          a: 7e8,
          b: 66e7
        },
        "12": {
          a: -1,
          b: 145e7
        }
      },
      "/items/royal_nature_robe_top": {
        "0": {
          a: 9e7,
          b: 88e6
        },
        "5": {
          a: 94e6,
          b: 88e6
        },
        "6": {
          a: 1e8,
          b: 86e6
        },
        "7": {
          a: 115e6,
          b: 11e7
        },
        "8": {
          a: 16e7,
          b: 135e6
        },
        "9": {
          a: 255e6,
          b: 2e8
        },
        "10": {
          a: 41e7,
          b: 39e7
        },
        "12": {
          a: 13e8,
          b: 11e8
        }
      },
      "/items/royal_nature_robe_top_refined": {
        "10": {
          a: 76e7,
          b: 68e7
        },
        "12": {
          a: -1,
          b: 155e7
        }
      },
      "/items/royal_water_robe_bottoms": {
        "0": {
          a: 76e6,
          b: 68e6
        },
        "5": {
          a: 7e7,
          b: 64e6
        },
        "6": {
          a: 105e6,
          b: 64e6
        },
        "7": {
          a: 94e6,
          b: 92e6
        },
        "8": {
          a: 14e7,
          b: 11e7
        },
        "9": {
          a: -1,
          b: 155e6
        },
        "10": {
          a: 37e7,
          b: 36e7
        }
      },
      "/items/royal_water_robe_bottoms_refined": {},
      "/items/royal_water_robe_top": {
        "0": {
          a: 9e7,
          b: 84e6
        },
        "5": {
          a: 96e6,
          b: 82e6
        },
        "6": {
          a: 105e6,
          b: 84e6
        },
        "7": {
          a: -1,
          b: 11e7
        },
        "8": {
          a: 16e7,
          b: 14e7
        },
        "9": {
          a: -1,
          b: 2e8
        },
        "10": {
          a: 4e8,
          b: 38e7
        },
        "12": {
          a: 14e8,
          b: -1
        }
      },
      "/items/royal_water_robe_top_refined": {
        "10": {
          a: -1,
          b: 7e8
        },
        "12": {
          a: -1,
          b: 16e8
        }
      },
      "/items/scratch": {
        "0": {
          a: 3300,
          b: 3200
        }
      },
      "/items/shard_of_protection": {
        "0": {
          a: 6e4,
          b: 58e3
        }
      },
      "/items/shield_bash": {
        "0": {
          a: 48e3,
          b: 47e3
        }
      },
      "/items/shoebill_feather": {
        "0": {
          a: 11e4,
          b: 105e3
        }
      },
      "/items/shoebill_shoes": {
        "0": {
          a: 92e4,
          b: 9e5
        },
        "1": {
          a: 11e5,
          b: 11e4
        },
        "3": {
          a: 98e4,
          b: 105e3
        },
        "4": {
          a: 165e4,
          b: 17e4
        },
        "5": {
          a: 135e4,
          b: 12e5
        },
        "6": {
          a: -1,
          b: 14e5
        },
        "7": {
          a: 275e4,
          b: 23e5
        },
        "8": {
          a: 8e6,
          b: 35e5
        },
        "9": {
          a: 86e5,
          b: 86e4
        },
        "10": {
          a: 12e6,
          b: 1e7
        },
        "11": {
          a: -1,
          b: 15e6
        },
        "12": {
          a: 39e6,
          b: 31e6
        },
        "14": {
          a: 15e7,
          b: 13e7
        },
        "15": {
          a: -1,
          b: 49e4
        }
      },
      "/items/sighted_bracers": {
        "0": {
          a: 18e5,
          b: 17e5
        },
        "1": {
          a: -1,
          b: 105e3
        },
        "2": {
          a: 18e5,
          b: 105e3
        },
        "3": {
          a: -1,
          b: 105e3
        },
        "4": {
          a: 2e6,
          b: 105e3
        },
        "5": {
          a: 175e4,
          b: 1e6
        },
        "6": {
          a: 185e4,
          b: 105e3
        },
        "7": {
          a: 235e4,
          b: 225e3
        },
        "8": {
          a: 26e5,
          b: 225e3
        },
        "9": {
          a: 49e5,
          b: 52e4
        },
        "10": {
          a: 56e5,
          b: 54e5
        },
        "11": {
          a: 14e6,
          b: 8e6
        },
        "12": {
          a: 31e6,
          b: -1
        }
      },
      "/items/silencing_shot": {
        "0": {
          a: 96e3,
          b: 94e3
        }
      },
      "/items/silk_boots": {
        "0": {
          a: 76e3,
          b: 5e4
        },
        "1": {
          a: 84e3,
          b: -1
        },
        "2": {
          a: 125e3,
          b: -1
        },
        "5": {
          a: 5e5,
          b: 1e5
        },
        "6": {
          a: 48e4,
          b: -1
        }
      },
      "/items/silk_fabric": {
        "0": {
          a: 1800,
          b: 1750
        }
      },
      "/items/silk_gloves": {
        "0": {
          a: 68e3,
          b: 66e3
        },
        "1": {
          a: 96e3,
          b: -1
        },
        "2": {
          a: 13e4,
          b: -1
        },
        "3": {
          a: 22e4,
          b: -1
        },
        "5": {
          a: 34e4,
          b: 12e4
        },
        "6": {
          a: 56e4,
          b: 8e3
        },
        "7": {
          a: 2e6,
          b: -1
        }
      },
      "/items/silk_hat": {
        "0": {
          a: 1e5,
          b: 8e4
        },
        "1": {
          a: 12e4,
          b: -1
        },
        "2": {
          a: 125e3,
          b: -1
        },
        "3": {
          a: 135e3,
          b: -1
        },
        "4": {
          a: 2e5,
          b: -1
        },
        "5": {
          a: 35e4,
          b: 1e5
        }
      },
      "/items/silk_robe_bottoms": {
        "0": {
          a: 2e5,
          b: 185e3
        },
        "3": {
          a: 34e4,
          b: -1
        },
        "5": {
          a: 5e5,
          b: 17e4
        }
      },
      "/items/silk_robe_top": {
        "0": {
          a: 21e4,
          b: 2e5
        },
        "2": {
          a: 26e4,
          b: -1
        },
        "3": {
          a: 27e4,
          b: -1
        },
        "5": {
          a: 5e5,
          b: 23e4
        },
        "6": {
          a: 265e4,
          b: -1
        },
        "7": {
          a: 66e5,
          b: -1
        }
      },
      "/items/sinister_chest_key": {
        "0": {
          a: 41e5,
          b: 4e6
        }
      },
      "/items/sinister_entry_key": {
        "0": {
          a: 5e5,
          b: 49e4
        }
      },
      "/items/sinister_essence": {
        "0": {
          a: 1200,
          b: 1150
        }
      },
      "/items/sinister_refinement_shard": {
        "0": {
          a: 285e4,
          b: 28e5
        }
      },
      "/items/smack": {
        "0": {
          a: 2800,
          b: 2700
        }
      },
      "/items/small_pouch": {
        "0": {
          a: 25e3,
          b: 17500
        },
        "1": {
          a: 33e3,
          b: -1
        }
      },
      "/items/smoke_burst": {
        "0": {
          a: 76e3,
          b: 74e3
        }
      },
      "/items/snail_shell": {
        "0": {
          a: 9600,
          b: 9200
        }
      },
      "/items/snail_shell_helmet": {
        "0": {
          a: 32e3,
          b: 29e3
        },
        "1": {
          a: 62e3,
          b: -1
        },
        "2": {
          a: 96e3,
          b: -1
        },
        "3": {
          a: 145e3,
          b: -1
        },
        "4": {
          a: 96e4,
          b: -1
        },
        "5": {
          a: 135e4,
          b: -1
        },
        "6": {
          a: 29e5,
          b: -1
        },
        "7": {
          a: 2e6,
          b: -1
        }
      },
      "/items/snake_fang": {
        "0": {
          a: 5600,
          b: 5400
        }
      },
      "/items/snake_fang_dirk": {
        "0": {
          a: 38e3,
          b: 27e3
        },
        "1": {
          a: 44e3,
          b: 16500
        },
        "2": {
          a: 38e3,
          b: 6400
        },
        "3": {
          a: 45e3,
          b: 6600
        },
        "4": {
          a: 74e3,
          b: 26500
        },
        "5": {
          a: 125e3,
          b: 28e3
        },
        "6": {
          a: 31e4,
          b: 31e3
        },
        "7": {
          a: 66e4,
          b: 26500
        },
        "8": {
          a: 115e4,
          b: 68e3
        },
        "9": {
          a: 14e5,
          b: 125e3
        },
        "10": {
          a: 14e5,
          b: 2e5
        },
        "11": {
          a: 7e6,
          b: 1e6
        },
        "12": {
          a: 135e5,
          b: 12e5
        },
        "13": {
          a: 215e5,
          b: -1
        },
        "14": {
          a: 32e6,
          b: 2e6
        },
        "15": {
          a: 5e7,
          b: 8e6
        }
      },
      "/items/sorcerer_boots": {
        "0": {
          a: 8e5,
          b: 78e4
        },
        "1": {
          a: -1,
          b: 78e4
        },
        "2": {
          a: -1,
          b: 78e4
        },
        "3": {
          a: -1,
          b: 78e4
        },
        "4": {
          a: 105e4,
          b: 78e4
        },
        "5": {
          a: 135e4,
          b: 13e5
        },
        "6": {
          a: 19e5,
          b: 18e5
        },
        "7": {
          a: 33e5,
          b: 32e5
        },
        "8": {
          a: 58e5,
          b: 5e6
        },
        "9": {
          a: 98e5,
          b: 82e5
        },
        "10": {
          a: 165e5,
          b: 15e6
        },
        "11": {
          a: 32e6,
          b: 23e6
        },
        "12": {
          a: 54e6,
          b: 52e6
        },
        "13": {
          a: 11e7,
          b: 8e7
        },
        "14": {
          a: 21e7,
          b: 205e6
        },
        "15": {
          a: 45e7,
          b: 38e7
        },
        "16": {
          a: 88e7,
          b: -1
        }
      },
      "/items/sorcerer_essence": {
        "0": {
          a: 125,
          b: 120
        }
      },
      "/items/sorcerers_sole": {
        "0": {
          a: 17e4,
          b: 165e3
        }
      },
      "/items/soul_fragment": {
        "0": {
          a: 54e4,
          b: 52e4
        }
      },
      "/items/soul_hunter_crossbow": {
        "0": {
          a: 12e6,
          b: 98e5
        },
        "3": {
          a: 11e6,
          b: -1
        },
        "5": {
          a: 12e6,
          b: 1e7
        },
        "6": {
          a: 135e5,
          b: -1
        },
        "7": {
          a: 155e5,
          b: 145e5
        },
        "8": {
          a: 205e5,
          b: -1
        },
        "10": {
          a: 43e6,
          b: 4e7
        }
      },
      "/items/spaceberry": {
        "0": {
          a: 240,
          b: 235
        }
      },
      "/items/spaceberry_cake": {
        "0": {
          a: 1800,
          b: 1750
        }
      },
      "/items/spaceberry_donut": {
        "0": {
          a: 1400,
          b: 1350
        }
      },
      "/items/spacia_coffee_bean": {
        "0": {
          a: 1100,
          b: 1050
        }
      },
      "/items/speed_aura": {
        "0": {
          a: 25e5,
          b: 24e5
        }
      },
      "/items/spike_shell": {
        "0": {
          a: 7e4,
          b: 68e3
        }
      },
      "/items/spiked_bulwark": {
        "0": {
          a: 115e5,
          b: 98e5
        },
        "1": {
          a: -1,
          b: 8e6
        },
        "2": {
          a: -1,
          b: 8e6
        },
        "3": {
          a: -1,
          b: 8e6
        },
        "5": {
          a: 145e5,
          b: 1e7
        },
        "6": {
          a: -1,
          b: 84e5
        },
        "7": {
          a: 25e6,
          b: 195e5
        },
        "8": {
          a: 245e5,
          b: 21e6
        },
        "10": {
          a: -1,
          b: 42e6
        }
      },
      "/items/stalactite_shard": {
        "0": {
          a: 56e4,
          b: 54e4
        }
      },
      "/items/stalactite_spear": {
        "0": {
          a: 13e6,
          b: 98e5
        },
        "1": {
          a: 12e6,
          b: -1
        },
        "3": {
          a: 15e6,
          b: -1
        },
        "5": {
          a: 14e6,
          b: 12e6
        },
        "6": {
          a: -1,
          b: 13e6
        },
        "7": {
          a: 195e5,
          b: 18e6
        },
        "8": {
          a: 28e6,
          b: 18e6
        },
        "10": {
          a: 74e6,
          b: 6e7
        },
        "14": {
          a: -1,
          b: 5e5
        }
      },
      "/items/stamina_coffee": {
        "0": {
          a: 680,
          b: 620
        }
      },
      "/items/star_fragment": {
        "0": {
          a: 13e3,
          b: 12500
        }
      },
      "/items/star_fruit": {
        "0": {
          a: 540,
          b: 520
        }
      },
      "/items/star_fruit_gummy": {
        "0": {
          a: 1300,
          b: 1250
        }
      },
      "/items/star_fruit_yogurt": {
        "0": {
          a: 1750,
          b: 1700
        }
      },
      "/items/steady_shot": {
        "0": {
          a: 96e3,
          b: 94e3
        }
      },
      "/items/stone_key_fragment": {
        "0": {
          a: 16e5,
          b: 155e4
        }
      },
      "/items/strawberry": {
        "0": {
          a: 140,
          b: 135
        }
      },
      "/items/strawberry_cake": {
        "0": {
          a: 1100,
          b: 1e3
        }
      },
      "/items/strawberry_donut": {
        "0": {
          a: 740,
          b: 720
        }
      },
      "/items/stunning_blow": {
        "0": {
          a: 96e3,
          b: 94e3
        }
      },
      "/items/sugar": {
        "0": {
          a: 12,
          b: 11
        }
      },
      "/items/sundering_crossbow": {
        "0": {
          a: 24e7,
          b: 225e6
        },
        "1": {
          a: -1,
          b: 18e7
        },
        "2": {
          a: -1,
          b: 185e6
        },
        "3": {
          a: -1,
          b: 18e7
        },
        "4": {
          a: -1,
          b: 18e7
        },
        "5": {
          a: 255e6,
          b: 235e6
        },
        "6": {
          a: -1,
          b: 225e6
        },
        "7": {
          a: 295e6,
          b: 265e6
        },
        "8": {
          a: -1,
          b: 3e8
        },
        "9": {
          a: -1,
          b: 36e7
        },
        "10": {
          a: 62e7,
          b: 6e8
        },
        "11": {
          a: -1,
          b: 76e7
        },
        "12": {
          a: 18e8,
          b: 13e8
        },
        "14": {
          a: -1,
          b: 3e9
        },
        "15": {
          a: -1,
          b: 5e6
        }
      },
      "/items/sundering_crossbow_refined": {
        "0": {
          a: -1,
          b: 52e5
        },
        "8": {
          a: -1,
          b: 5e7
        },
        "10": {
          a: -1,
          b: 15e8
        },
        "12": {
          a: -1,
          b: 115e7
        },
        "13": {
          a: -1,
          b: 56e5
        },
        "14": {
          a: -1,
          b: 6e6
        },
        "15": {
          a: -1,
          b: 58e5
        },
        "16": {
          a: -1,
          b: 56e5
        },
        "20": {
          a: -1,
          b: 54e5
        }
      },
      "/items/sundering_jewel": {
        "0": {
          a: 105e5,
          b: 1e7
        }
      },
      "/items/sunstone": {
        "0": {
          a: 52e4,
          b: 5e5
        }
      },
      "/items/super_alchemy_tea": {
        "0": {
          a: 4e3,
          b: 3900
        }
      },
      "/items/super_attack_coffee": {
        "0": {
          a: 3700,
          b: 3600
        }
      },
      "/items/super_brewing_tea": {
        "0": {
          a: 3300,
          b: 3100
        }
      },
      "/items/super_cheesesmithing_tea": {
        "0": {
          a: 4100,
          b: 3900
        }
      },
      "/items/super_cooking_tea": {
        "0": {
          a: 3200,
          b: 2950
        }
      },
      "/items/super_crafting_tea": {
        "0": {
          a: 4400,
          b: 4e3
        }
      },
      "/items/super_defense_coffee": {
        "0": {
          a: 3700,
          b: 3600
        }
      },
      "/items/super_enhancing_tea": {
        "0": {
          a: 4800,
          b: 4700
        }
      },
      "/items/super_foraging_tea": {
        "0": {
          a: 7600,
          b: 2650
        }
      },
      "/items/super_intelligence_coffee": {
        "0": {
          a: 2800,
          b: 2750
        }
      },
      "/items/super_magic_coffee": {
        "0": {
          a: 5e3,
          b: 4900
        }
      },
      "/items/super_melee_coffee": {
        "0": {
          a: 4900,
          b: 4800
        }
      },
      "/items/super_milking_tea": {
        "0": {
          a: 2250,
          b: 1850
        }
      },
      "/items/super_ranged_coffee": {
        "0": {
          a: 4900,
          b: 4800
        }
      },
      "/items/super_stamina_coffee": {
        "0": {
          a: 2750,
          b: 2700
        }
      },
      "/items/super_tailoring_tea": {
        "0": {
          a: 4400,
          b: 4200
        }
      },
      "/items/super_woodcutting_tea": {
        "0": {
          a: 2700,
          b: 2500
        }
      },
      "/items/swamp_essence": {
        "0": {
          a: 50,
          b: 47
        }
      },
      "/items/sweep": {
        "0": {
          a: 33e3,
          b: 32e3
        }
      },
      "/items/swiftness_coffee": {
        "0": {
          a: 3e3,
          b: 2950
        }
      },
      "/items/tailoring_essence": {
        "0": {
          a: 225,
          b: 215
        }
      },
      "/items/tailoring_tea": {
        "0": {
          a: 740,
          b: 700
        }
      },
      "/items/tailors_bottoms": {
        "0": {
          a: 2e8,
          b: 25e6
        },
        "5": {
          a: 235e6,
          b: 16e7
        },
        "7": {
          a: 24e7,
          b: 17e7
        },
        "8": {
          a: 275e6,
          b: 24e7
        },
        "10": {
          a: 42e7,
          b: 36e7
        },
        "12": {
          a: -1,
          b: 66e7
        }
      },
      "/items/tailors_top": {
        "0": {
          a: -1,
          b: 35e5
        },
        "3": {
          a: 175e6,
          b: -1
        },
        "5": {
          a: 19e7,
          b: 16e7
        },
        "7": {
          a: 205e6,
          b: 18e7
        },
        "8": {
          a: 25e7,
          b: 8e6
        },
        "10": {
          a: 4e8,
          b: 33e7
        }
      },
      "/items/taunt": {
        "0": {
          a: 56e3,
          b: 54e3
        }
      },
      "/items/thread_of_expertise": {
        "0": {
          a: 105e5,
          b: 1e7
        }
      },
      "/items/tome_of_healing": {
        "0": {
          a: 38e3,
          b: 37e3
        },
        "1": {
          a: 39e3,
          b: 24e3
        },
        "2": {
          a: 4e4,
          b: 24e3
        },
        "3": {
          a: 41e3,
          b: 25e3
        },
        "4": {
          a: 43e3,
          b: 29e3
        },
        "5": {
          a: 56e3,
          b: 48e3
        },
        "6": {
          a: 84e3,
          b: 68e3
        },
        "7": {
          a: 17e4,
          b: 15e4
        },
        "8": {
          a: 38e4,
          b: 33e4
        },
        "10": {
          a: 14e5,
          b: -1
        },
        "11": {
          a: 47e5,
          b: -1
        },
        "12": {
          a: 8e6,
          b: -1
        },
        "15": {
          a: 8e7,
          b: -1
        },
        "19": {
          a: 2e9,
          b: -1
        }
      },
      "/items/tome_of_the_elements": {
        "0": {
          a: 215e4,
          b: 21e5
        },
        "1": {
          a: -1,
          b: 145e4
        },
        "2": {
          a: 22e5,
          b: 185e4
        },
        "3": {
          a: 25e5,
          b: 18e5
        },
        "4": {
          a: -1,
          b: 165e4
        },
        "5": {
          a: 215e4,
          b: 105e4
        },
        "6": {
          a: 225e4,
          b: 18e5
        },
        "7": {
          a: 23e5,
          b: 195e4
        },
        "8": {
          a: 27e5,
          b: 16e5
        },
        "9": {
          a: 33e5,
          b: 175e4
        },
        "10": {
          a: 56e5,
          b: 48e5
        },
        "11": {
          a: 11e6,
          b: 105e4
        },
        "12": {
          a: 25e6,
          b: 11e5
        },
        "15": {
          a: 3e8,
          b: 125e4
        }
      },
      "/items/toughness": {
        "0": {
          a: 56e3,
          b: 54e3
        }
      },
      "/items/toxic_pollen": {
        "0": {
          a: 22e4,
          b: 215e3
        }
      },
      "/items/treant_bark": {
        "0": {
          a: 3e4,
          b: 29500
        }
      },
      "/items/treant_shield": {
        "0": {
          a: 14e4,
          b: 135e3
        },
        "3": {
          a: 21e4,
          b: -1
        },
        "4": {
          a: 17e4,
          b: -1
        },
        "5": {
          a: 19e4,
          b: 16e4
        },
        "6": {
          a: -1,
          b: 15e4
        },
        "7": {
          a: 105e4,
          b: -1
        },
        "10": {
          a: 74e5,
          b: -1
        }
      },
      "/items/turtle_shell": {
        "0": {
          a: 21500,
          b: 19e3
        }
      },
      "/items/turtle_shell_body": {
        "0": {
          a: 8e4,
          b: 78e3
        },
        "2": {
          a: 1e5,
          b: -1
        },
        "3": {
          a: 215e3,
          b: -1
        },
        "4": {
          a: 22e4,
          b: -1
        },
        "5": {
          a: 16e4,
          b: -1
        }
      },
      "/items/turtle_shell_legs": {
        "0": {
          a: 62e3,
          b: 5e4
        },
        "3": {
          a: 49e4,
          b: -1
        },
        "5": {
          a: 82e4,
          b: -1
        }
      },
      "/items/twilight_essence": {
        "0": {
          a: 265,
          b: 260
        }
      },
      "/items/ultra_alchemy_tea": {
        "0": {
          a: 7400,
          b: 7e3
        }
      },
      "/items/ultra_attack_coffee": {
        "0": {
          a: 10500,
          b: 1e4
        }
      },
      "/items/ultra_brewing_tea": {
        "0": {
          a: 7e3,
          b: 6800
        }
      },
      "/items/ultra_cheesesmithing_tea": {
        "0": {
          a: 8400,
          b: 8e3
        }
      },
      "/items/ultra_cooking_tea": {
        "0": {
          a: 7600,
          b: 7e3
        }
      },
      "/items/ultra_crafting_tea": {
        "0": {
          a: 8400,
          b: 8200
        }
      },
      "/items/ultra_defense_coffee": {
        "0": {
          a: 10500,
          b: 1e4
        }
      },
      "/items/ultra_enhancing_tea": {
        "0": {
          a: 11e3,
          b: 10500
        }
      },
      "/items/ultra_foraging_tea": {
        "0": {
          a: 6600,
          b: 6200
        }
      },
      "/items/ultra_intelligence_coffee": {
        "0": {
          a: 9e3,
          b: 7200
        }
      },
      "/items/ultra_magic_coffee": {
        "0": {
          a: 12e3,
          b: 11500
        }
      },
      "/items/ultra_melee_coffee": {
        "0": {
          a: 12e3,
          b: 11500
        }
      },
      "/items/ultra_milking_tea": {
        "0": {
          a: 6200,
          b: 6e3
        }
      },
      "/items/ultra_ranged_coffee": {
        "0": {
          a: 12e3,
          b: 11500
        }
      },
      "/items/ultra_stamina_coffee": {
        "0": {
          a: 9400,
          b: 9200
        }
      },
      "/items/ultra_tailoring_tea": {
        "0": {
          a: 8200,
          b: 8e3
        }
      },
      "/items/ultra_woodcutting_tea": {
        "0": {
          a: 6200,
          b: 5800
        }
      },
      "/items/umbral_boots": {
        "0": {
          a: 145e3,
          b: 13e4
        },
        "1": {
          a: 135e3,
          b: -1
        },
        "2": {
          a: 18e4,
          b: -1
        },
        "3": {
          a: 21e4,
          b: -1
        },
        "5": {
          a: 47e5,
          b: 32e4
        },
        "7": {
          a: 5e7,
          b: -1
        },
        "8": {
          a: 68e6,
          b: -1
        }
      },
      "/items/umbral_bracers": {
        "0": {
          a: 24e4,
          b: 235e3
        },
        "1": {
          a: 3e5,
          b: -1
        },
        "2": {
          a: 3e5,
          b: -1
        },
        "3": {
          a: 38e4,
          b: -1
        },
        "4": {
          a: 105e4,
          b: -1
        },
        "5": {
          a: 88e5,
          b: -1
        },
        "10": {
          a: 25e6,
          b: 15e6
        }
      },
      "/items/umbral_chaps": {
        "0": {
          a: 4e5,
          b: 38e4
        },
        "1": {
          a: 7e5,
          b: -1
        },
        "2": {
          a: 12e5,
          b: -1
        },
        "3": {
          a: 195e4,
          b: -1
        },
        "4": {
          a: 25e5,
          b: -1
        },
        "5": {
          a: 38e5,
          b: -1
        },
        "6": {
          a: 62e5,
          b: -1
        }
      },
      "/items/umbral_hide": {
        "0": {
          a: 240,
          b: 235
        }
      },
      "/items/umbral_hood": {
        "0": {
          a: 18e4,
          b: 175e3
        },
        "2": {
          a: 29e4,
          b: -1
        },
        "3": {
          a: 33e4,
          b: -1
        },
        "4": {
          a: 6e5,
          b: -1
        },
        "5": {
          a: 82e4,
          b: 205e3
        },
        "6": {
          a: 58e5,
          b: -1
        }
      },
      "/items/umbral_leather": {
        "0": {
          a: 2050,
          b: 2e3
        }
      },
      "/items/umbral_tunic": {
        "0": {
          a: 46e4,
          b: 45e4
        },
        "2": {
          a: 9e4,
          b: -1
        },
        "3": {
          a: 96e4,
          b: -1
        },
        "5": {
          a: 4e6,
          b: 7e5
        }
      },
      "/items/vampire_fang": {
        "0": {
          a: 56e4,
          b: 54e4
        }
      },
      "/items/vampire_fang_dirk": {
        "0": {
          a: 12e6,
          b: 98e5
        },
        "5": {
          a: 125e5,
          b: 105e5
        },
        "6": {
          a: 16e6,
          b: -1
        },
        "7": {
          a: 18e6,
          b: 16e6
        },
        "8": {
          a: 295e5,
          b: 22e6
        },
        "9": {
          a: -1,
          b: 2e7
        },
        "10": {
          a: 58e6,
          b: 48e6
        }
      },
      "/items/vampiric_bow": {
        "0": {
          a: 13e6,
          b: 1e7
        },
        "2": {
          a: 165e5,
          b: -1
        },
        "3": {
          a: 215e5,
          b: -1
        },
        "4": {
          a: 205e5,
          b: -1
        },
        "5": {
          a: 26e6,
          b: -1
        },
        "8": {
          a: 24e6,
          b: -1
        },
        "10": {
          a: 8e7,
          b: -1
        }
      },
      "/items/vampirism": {
        "0": {
          a: 68e3,
          b: 66e3
        }
      },
      "/items/verdant_alembic": {
        "0": {
          a: 2e4,
          b: 15500
        },
        "2": {
          a: 38e3,
          b: -1
        }
      },
      "/items/verdant_boots": {
        "0": {
          a: 12e3,
          b: 11500
        },
        "1": {
          a: 68e3,
          b: -1
        }
      },
      "/items/verdant_brush": {
        "0": {
          a: 18500,
          b: 9800
        },
        "1": {
          a: 35e3,
          b: -1
        },
        "2": {
          a: 66e3,
          b: -1
        },
        "3": {
          a: 68e3,
          b: -1
        },
        "4": {
          a: 74e3,
          b: -1
        }
      },
      "/items/verdant_buckler": {
        "0": {
          a: 28e3,
          b: 8600
        },
        "1": {
          a: 22500,
          b: -1
        },
        "3": {
          a: 1e5,
          b: -1
        },
        "4": {
          a: 12e4,
          b: -1
        },
        "5": {
          a: 39e4,
          b: -1
        },
        "6": {
          a: 64e4,
          b: -1
        },
        "7": {
          a: 78e4,
          b: -1
        }
      },
      "/items/verdant_bulwark": {
        "0": {
          a: 23500,
          b: 18500
        },
        "2": {
          a: 2e4,
          b: -1
        },
        "3": {
          a: 1e7,
          b: -1
        }
      },
      "/items/verdant_cheese": {
        "0": {
          a: 660,
          b: 640
        }
      },
      "/items/verdant_chisel": {
        "0": {
          a: 18500,
          b: 14500
        }
      },
      "/items/verdant_enhancer": {
        "0": {
          a: 19e3,
          b: 16e3
        },
        "2": {
          a: 25500,
          b: -1
        },
        "4": {
          a: 68e3,
          b: -1
        },
        "5": {
          a: 135e3,
          b: -1
        }
      },
      "/items/verdant_gauntlets": {
        "0": {
          a: 12e3,
          b: 11500
        },
        "1": {
          a: 98e3,
          b: -1
        },
        "2": {
          a: 2e4,
          b: -1
        },
        "5": {
          a: 8e4,
          b: -1
        }
      },
      "/items/verdant_hammer": {
        "0": {
          a: 19500,
          b: 15500
        }
      },
      "/items/verdant_hatchet": {
        "0": {
          a: 17500,
          b: 9800
        },
        "4": {
          a: 7e4,
          b: -1
        }
      },
      "/items/verdant_helmet": {
        "0": {
          a: 15500,
          b: 14e3
        },
        "2": {
          a: 1e5,
          b: -1
        }
      },
      "/items/verdant_mace": {
        "0": {
          a: 20500,
          b: 19500
        },
        "1": {
          a: -1,
          b: 740
        },
        "4": {
          a: 17e3,
          b: 720
        },
        "5": {
          a: 3e5,
          b: -1
        }
      },
      "/items/verdant_milk": {
        "0": {
          a: 135,
          b: 130
        }
      },
      "/items/verdant_needle": {
        "0": {
          a: 18e3,
          b: 16500
        }
      },
      "/items/verdant_plate_body": {
        "0": {
          a: 23500,
          b: 21500
        }
      },
      "/items/verdant_plate_legs": {
        "0": {
          a: 19500,
          b: 18500
        },
        "2": {
          a: 25e6,
          b: -1
        },
        "5": {
          a: 11e5,
          b: -1
        }
      },
      "/items/verdant_pot": {
        "0": {
          a: 2e4,
          b: 18e3
        },
        "1": {
          a: 16e4,
          b: -1
        },
        "2": {
          a: 3e5,
          b: -1
        }
      },
      "/items/verdant_shears": {
        "0": {
          a: 20500,
          b: 16500
        },
        "1": {
          a: 58e3,
          b: -1
        }
      },
      "/items/verdant_spatula": {
        "0": {
          a: 2e4,
          b: 1e4
        },
        "3": {
          a: 56e4,
          b: 560
        }
      },
      "/items/verdant_spear": {
        "0": {
          a: 20500,
          b: 19500
        },
        "1": {
          a: 5e4,
          b: -1
        },
        "2": {
          a: 5e4,
          b: -1
        },
        "3": {
          a: 17e4,
          b: -1
        },
        "5": {
          a: 125e3,
          b: -1
        }
      },
      "/items/verdant_sword": {
        "0": {
          a: 20500,
          b: 19e3
        },
        "1": {
          a: 56e5,
          b: -1
        },
        "2": {
          a: 4e4,
          b: -1
        },
        "3": {
          a: 3e5,
          b: -1
        },
        "4": {
          a: 2e5,
          b: -1
        },
        "5": {
          a: 1e5,
          b: -1
        }
      },
      "/items/vision_helmet": {
        "0": {
          a: 52e4,
          b: 5e5
        },
        "1": {
          a: 6e5,
          b: -1
        },
        "3": {
          a: 64e4,
          b: -1
        },
        "4": {
          a: 105e4,
          b: 105e3
        },
        "5": {
          a: 125e4,
          b: 16e4
        },
        "6": {
          a: 15e5,
          b: 3e5
        },
        "7": {
          a: 3e6,
          b: 42e4
        },
        "8": {
          a: 7e6,
          b: 155e4
        },
        "9": {
          a: -1,
          b: 25e5
        }
      },
      "/items/vision_shield": {
        "0": {
          a: 17e5,
          b: 16e5
        },
        "2": {
          a: -1,
          b: 16e5
        },
        "4": {
          a: -1,
          b: 1e5
        },
        "5": {
          a: 3e6,
          b: 1e5
        },
        "6": {
          a: -1,
          b: 1e5
        },
        "7": {
          a: -1,
          b: 1e5
        },
        "8": {
          a: 78e5,
          b: 1e5
        }
      },
      "/items/watchful_relic": {
        "0": {
          a: 76e5,
          b: 72e5
        },
        "3": {
          a: -1,
          b: 31e5
        },
        "5": {
          a: 1e7,
          b: -1
        },
        "7": {
          a: 12e6,
          b: 1e6
        },
        "8": {
          a: 16e6,
          b: 12e6
        },
        "9": {
          a: -1,
          b: 5e5
        },
        "10": {
          a: -1,
          b: 1e6
        }
      },
      "/items/water_strike": {
        "0": {
          a: 7600,
          b: 7400
        }
      },
      "/items/werewolf_claw": {
        "0": {
          a: 56e4,
          b: 54e4
        }
      },
      "/items/werewolf_slasher": {
        "0": {
          a: 155e5,
          b: 1e7
        },
        "5": {
          a: 135e5,
          b: 11e6
        },
        "6": {
          a: 2e7,
          b: 11e6
        },
        "7": {
          a: 22e6,
          b: 16e6
        },
        "8": {
          a: 3e7,
          b: 25e6
        },
        "9": {
          a: -1,
          b: 1e7
        },
        "10": {
          a: 7e7,
          b: 5e7
        },
        "15": {
          a: -1,
          b: 64e7
        }
      },
      "/items/wheat": {
        "0": {
          a: 62,
          b: 60
        }
      },
      "/items/white_key_fragment": {
        "0": {
          a: 98e4,
          b: 96e4
        }
      },
      "/items/wisdom_coffee": {
        "0": {
          a: 1800,
          b: 1750
        }
      },
      "/items/wisdom_tea": {
        "0": {
          a: 980,
          b: 960
        }
      },
      "/items/wizard_necklace": {
        "0": {
          a: 125e5,
          b: 105e5
        },
        "1": {
          a: 15e6,
          b: -1
        },
        "2": {
          a: 215e5,
          b: 15e6
        },
        "3": {
          a: 26e6,
          b: 235e5
        },
        "4": {
          a: 54e6,
          b: 47e6
        },
        "5": {
          a: 105e6,
          b: 92e6
        },
        "10": {
          a: -1,
          b: 28e7
        }
      },
      "/items/woodcutting_essence": {
        "0": {
          a: 260,
          b: 255
        }
      },
      "/items/woodcutting_tea": {
        "0": {
          a: 720,
          b: 560
        }
      },
      "/items/wooden_bow": {
        "0": {
          a: 5e3,
          b: 4900
        },
        "1": {
          a: 88e3,
          b: -1
        },
        "2": {
          a: 15e4,
          b: -1
        },
        "3": {
          a: 1e5,
          b: -1
        },
        "4": {
          a: 68e3,
          b: -1
        },
        "5": {
          a: 25e4,
          b: -1
        },
        "6": {
          a: 5e8,
          b: -1
        },
        "20": {
          a: -1,
          b: 5e3
        }
      },
      "/items/wooden_crossbow": {
        "0": {
          a: 4900,
          b: 4100
        },
        "1": {
          a: 9200,
          b: 5e3
        },
        "2": {
          a: 2e4,
          b: 9400
        },
        "4": {
          a: 58e4,
          b: -1
        },
        "5": {
          a: 16e4,
          b: -1
        }
      },
      "/items/wooden_fire_staff": {
        "0": {
          a: 5200,
          b: 4700
        },
        "2": {
          a: 4e4,
          b: -1
        },
        "4": {
          a: 145e5,
          b: -1
        }
      },
      "/items/wooden_nature_staff": {
        "0": {
          a: 5200,
          b: 4600
        },
        "1": {
          a: 3e4,
          b: -1
        },
        "2": {
          a: 84e3,
          b: -1
        },
        "3": {
          a: 98e3,
          b: -1
        },
        "20": {
          a: -1,
          b: 145
        }
      },
      "/items/wooden_shield": {
        "0": {
          a: 3900,
          b: 3400
        },
        "1": {
          a: 105e5,
          b: -1
        },
        "2": {
          a: 92e6,
          b: -1
        },
        "7": {
          a: 88e4,
          b: -1
        },
        "10": {
          a: -1,
          b: 3100
        }
      },
      "/items/wooden_water_staff": {
        "0": {
          a: 6800,
          b: 4700
        },
        "1": {
          a: 215e3,
          b: -1
        },
        "4": {
          a: 28e4,
          b: -1
        }
      },
      "/items/yogurt": {
        "0": {
          a: 350,
          b: 270
        }
      }
    },
    timestamp: 1760432846
  };

  // src/core/state.js
  var MARKET_JSON_LOCAL_BACKUP = JSON.stringify(market_backup_default);
  var isUsingExpiredMarketJson = false;
  var reasonForUsingExpiredMarketJson = "";
  var initData_characterSkills = null;
  var initData_characterItems = null;
  var initData_combatAbilities = null;
  var initData_characterHouseRoomMap = null;
  var initData_actionTypeDrinkSlotsMap = null;
  var initData_actionDetailMap = null;
  var initData_levelExperienceTable = null;
  var initData_itemDetailMap = null;
  var initData_actionCategoryDetailMap = null;
  var initData_abilityDetailMap = null;
  var initData_characterAbilities = null;
  var initData_myMarketListings = null;
  var currentActionsHridList = [];
  var currentEquipmentMap = {};
  Object.defineProperties(runtime.data, {
    MARKET_JSON_LOCAL_BACKUP: {
      enumerable: true,
      get() {
        return MARKET_JSON_LOCAL_BACKUP;
      }
    }
  });
  Object.defineProperties(runtime.state, {
    isUsingExpiredMarketJson: {
      enumerable: true,
      get() {
        return isUsingExpiredMarketJson;
      },
      set(value) {
        isUsingExpiredMarketJson = value;
      }
    },
    reasonForUsingExpiredMarketJson: {
      enumerable: true,
      get() {
        return reasonForUsingExpiredMarketJson;
      },
      set(value) {
        reasonForUsingExpiredMarketJson = value;
      }
    },
    initData_characterSkills: {
      enumerable: true,
      get() {
        return initData_characterSkills;
      },
      set(value) {
        initData_characterSkills = value;
      }
    },
    initData_characterItems: {
      enumerable: true,
      get() {
        return initData_characterItems;
      },
      set(value) {
        initData_characterItems = value;
      }
    },
    initData_combatAbilities: {
      enumerable: true,
      get() {
        return initData_combatAbilities;
      },
      set(value) {
        initData_combatAbilities = value;
      }
    },
    initData_characterHouseRoomMap: {
      enumerable: true,
      get() {
        return initData_characterHouseRoomMap;
      },
      set(value) {
        initData_characterHouseRoomMap = value;
      }
    },
    initData_actionTypeDrinkSlotsMap: {
      enumerable: true,
      get() {
        return initData_actionTypeDrinkSlotsMap;
      },
      set(value) {
        initData_actionTypeDrinkSlotsMap = value;
      }
    },
    initData_actionDetailMap: {
      enumerable: true,
      get() {
        return initData_actionDetailMap;
      },
      set(value) {
        initData_actionDetailMap = value;
      }
    },
    initData_levelExperienceTable: {
      enumerable: true,
      get() {
        return initData_levelExperienceTable;
      },
      set(value) {
        initData_levelExperienceTable = value;
      }
    },
    initData_itemDetailMap: {
      enumerable: true,
      get() {
        return initData_itemDetailMap;
      },
      set(value) {
        initData_itemDetailMap = value;
      }
    },
    initData_actionCategoryDetailMap: {
      enumerable: true,
      get() {
        return initData_actionCategoryDetailMap;
      },
      set(value) {
        initData_actionCategoryDetailMap = value;
      }
    },
    initData_abilityDetailMap: {
      enumerable: true,
      get() {
        return initData_abilityDetailMap;
      },
      set(value) {
        initData_abilityDetailMap = value;
      }
    },
    initData_characterAbilities: {
      enumerable: true,
      get() {
        return initData_characterAbilities;
      },
      set(value) {
        initData_characterAbilities = value;
      }
    },
    initData_myMarketListings: {
      enumerable: true,
      get() {
        return initData_myMarketListings;
      },
      set(value) {
        initData_myMarketListings = value;
      }
    },
    currentActionsHridList: {
      enumerable: true,
      get() {
        return currentActionsHridList;
      },
      set(value) {
        currentActionsHridList = value;
      }
    },
    currentEquipmentMap: {
      enumerable: true,
      get() {
        return currentEquipmentMap;
      },
      set(value) {
        currentEquipmentMap = value;
      }
    }
  });

  // src/core/message-state.js
  function applyClientData(payload) {
    runtime.state.initData_actionDetailMap = payload.actionDetailMap;
    runtime.state.initData_levelExperienceTable = payload.levelExperienceTable;
    runtime.state.initData_itemDetailMap = payload.itemDetailMap;
    runtime.state.initData_actionCategoryDetailMap = payload.actionCategoryDetailMap;
    runtime.state.initData_abilityDetailMap = payload.abilityDetailMap;
    for (const [key, value] of Object.entries(
      runtime.state.initData_itemDetailMap
    )) {
      runtime.state.itemEnNameToHridMap[value.name] = key;
    }
  }
  function applyCharacterData(payload) {
    runtime.state.initData_characterSkills = payload.characterSkills;
    runtime.state.initData_characterItems = payload.characterItems;
    runtime.state.initData_characterHouseRoomMap = payload.characterHouseRoomMap;
    runtime.state.initData_actionTypeDrinkSlotsMap = payload.actionTypeDrinkSlotsMap;
    runtime.state.initData_characterAbilities = payload.characterAbilities;
    runtime.state.initData_myMarketListings = payload.myMarketListings;
    runtime.state.initData_combatAbilities = payload.combatUnit.combatAbilities;
    runtime.state.currentActionsHridList = [...payload.characterActions];
    for (const item of payload.characterItems) {
      if (item.itemLocationHrid !== "/item_locations/inventory") {
        runtime.state.currentEquipmentMap[item.itemLocationHrid] = item;
      }
    }
  }
  function applyActionsUpdated(payload) {
    for (const action of payload.endCharacterActions) {
      if (action.isDone === false)
        runtime.state.currentActionsHridList.push(action);
      else
        runtime.state.currentActionsHridList = runtime.state.currentActionsHridList.filter(
          ({ id }) => id !== action.id
        );
    }
  }
  function applyActionCompleted(payload) {
    const action = payload.endCharacterAction;
    if (action.isDone !== false) return;
    const currentAction = runtime.state.currentActionsHridList.find(
      ({ id }) => id === action.id
    );
    if (currentAction) currentAction.currentCount = action.currentCount;
  }
  function applyItemsUpdated(payload) {
    if (!payload.endCharacterItems) return;
    for (const item of payload.endCharacterItems) {
      if (item.itemLocationHrid === "/item_locations/inventory") continue;
      runtime.state.currentEquipmentMap[item.itemLocationHrid] = item.count === 0 ? null : item;
    }
  }
  function applyGameMessage(payload) {
    switch (payload.type) {
      case "init_client_data":
        applyClientData(payload);
        break;
      case "init_character_data":
        applyCharacterData(payload);
        break;
      case "actions_updated":
        applyActionsUpdated(payload);
        break;
      case "action_completed":
        applyActionCompleted(payload);
        break;
      case "items_updated":
        applyItemsUpdated(payload);
        break;
    }
  }
  Object.assign(runtime.api, { applyGameMessage });

  // src/core/messages.js
  var GAME_SOCKET_HOSTS = [
    "api.milkywayidle.com/ws",
    "api-test.milkywayidle.com/ws",
    "api.milkywayidlecn.com/ws",
    "api-test.milkywayidlecn.com/ws"
  ];
  function hookWS() {
    const dataProperty = Object.getOwnPropertyDescriptor(
      MessageEvent.prototype,
      "data"
    );
    const originalGet = dataProperty.get;
    dataProperty.get = function hookedGet() {
      const socket = this.currentTarget;
      if (!(socket instanceof WebSocket) || !GAME_SOCKET_HOSTS.some((host) => socket.url.includes(host))) {
        return originalGet.call(this);
      }
      const message = originalGet.call(this);
      Object.defineProperty(this, "data", { value: message });
      return handleMessage(message);
    };
    Object.defineProperty(MessageEvent.prototype, "data", dataProperty);
  }
  function handleMessage(message) {
    const payload = JSON.parse(message);
    if (!payload?.type) return message;
    runtime.api.applyGameMessage(payload);
    runtime.dispatchMessage(payload, message);
    return message;
  }
  Object.assign(runtime.api, { hookWS, handleMessage });

  // src/features/inventory.js
  async function calculateNetworth() {
    const marketAPIJson = await runtime.api.fetchMarketJSON();
    if (!marketAPIJson) {
      console.error("calculateNetworth marketAPIJson is null");
      return;
    }
    let networthAsk = 0;
    let networthBid = 0;
    let marketListingsNetworthAsk = 0;
    let marketListingsNetworthBid = 0;
    let equippedNetworthAsk = 0;
    let equippedNetworthBid = 0;
    let inventoryNetworthAsk = 0;
    let inventoryNetworthBid = 0;
    for (const item of runtime.state.initData_characterItems) {
      const enhanceLevel = item.enhancementLevel;
      const marketPrices = marketAPIJson.marketData[item.itemHrid];
      if (enhanceLevel && enhanceLevel > 1) {
        runtime.state.input_data.item_hrid = item.itemHrid;
        runtime.state.input_data.stop_at = enhanceLevel;
        const best = await runtime.api.findBestEnhanceStratWithPhiMirror(
          runtime.state.input_data
        );
        let totalCost = best?.totalCost;
        totalCost = totalCost ? Math.round(totalCost) : 0;
        if (item.itemLocationHrid !== "/item_locations/inventory") {
          equippedNetworthAsk += item.count * (totalCost > 0 ? totalCost : 0);
          equippedNetworthBid += item.count * (totalCost > 0 ? totalCost : 0);
        } else {
          inventoryNetworthAsk += item.count * (totalCost > 0 ? totalCost : 0);
          inventoryNetworthBid += item.count * (totalCost > 0 ? totalCost : 0);
        }
      } else if (marketPrices && marketPrices[0]) {
        if (item.itemLocationHrid !== "/item_locations/inventory") {
          equippedNetworthAsk += item.count * (marketPrices[0].a > 0 ? marketPrices[0].a : 0);
          equippedNetworthBid += item.count * (marketPrices[0].b > 0 ? marketPrices[0].b : 0);
        } else {
          inventoryNetworthAsk += item.count * (marketPrices[0].a > 0 ? marketPrices[0].a : 0);
          inventoryNetworthBid += item.count * (marketPrices[0].b > 0 ? marketPrices[0].b : 0);
        }
      } else {
        console.log("calculateNetworth cannot find price of " + item.itemHrid);
      }
    }
    for (const item of runtime.state.initData_myMarketListings) {
      const quantity = item.orderQuantity - item.filledQuantity;
      const enhancementLevel = item.enhancementLevel;
      const marketPrices = marketAPIJson.marketData[item.itemHrid];
      if (!marketPrices) {
        console.log(
          "calculateNetworth cannot get marketPrices of " + item.itemHrid
        );
        continue;
      }
      let askPrice = marketPrices[0]?.a ?? 0;
      let bidPrice = marketPrices[0]?.b ?? 0;
      if (item.isSell) {
        if (item.itemHrid === "/items/bag_of_10_cowbells") {
          askPrice *= 1 - 18 / 100;
          bidPrice *= 1 - 18 / 100;
        } else {
          askPrice *= 1 - 2 / 100;
          bidPrice *= 1 - 2 / 100;
        }
        if (!enhancementLevel || enhancementLevel <= 1) {
          marketListingsNetworthAsk += quantity * (askPrice > 0 ? askPrice : 0);
          marketListingsNetworthBid += quantity * (bidPrice > 0 ? bidPrice : 0);
        } else {
          runtime.state.input_data.item_hrid = item.itemHrid;
          runtime.state.input_data.stop_at = enhancementLevel;
          const best = await runtime.api.findBestEnhanceStratWithPhiMirror(
            runtime.state.input_data
          );
          let totalCost = best?.totalCost;
          totalCost = totalCost ? Math.round(totalCost) : 0;
          marketListingsNetworthAsk += quantity * (totalCost > 0 ? totalCost : 0);
          marketListingsNetworthBid += quantity * (totalCost > 0 ? totalCost : 0);
        }
        marketListingsNetworthAsk += item.unclaimedCoinCount;
        marketListingsNetworthBid += item.unclaimedCoinCount;
      } else {
        marketListingsNetworthAsk += quantity * item.price;
        marketListingsNetworthBid += quantity * item.price;
        marketListingsNetworthAsk += item.unclaimedItemCount * (askPrice > 0 ? askPrice : 0);
        marketListingsNetworthBid += item.unclaimedItemCount * (bidPrice > 0 ? bidPrice : 0);
      }
    }
    networthAsk = equippedNetworthAsk + inventoryNetworthAsk + marketListingsNetworthAsk;
    networthBid = equippedNetworthBid + inventoryNetworthBid + marketListingsNetworthBid;
    const addInventorySummery = async (invElem) => {
      const [
        battleHouseScore,
        nonBattleHouseScore,
        abilityScore,
        allAbilityScore,
        equipmentScore
      ] = await runtime.api.getSelfBuildScores(
        equippedNetworthAsk * 0.5 + equippedNetworthBid * 0.5
      );
      const totalScore = battleHouseScore + abilityScore + equipmentScore;
      const totalHouseScore = battleHouseScore + nonBattleHouseScore;
      const totalNetworth = networthAsk * 0.5 + networthBid * 0.5 + (totalHouseScore + allAbilityScore) * 1e6;
      invElem.insertAdjacentHTML(
        "beforebegin",
        `<div style="text-align: left; color: ${runtime.config.SCRIPT_COLOR_MAIN}; font-size: 0.875rem;">
                <!-- 战力打造分 -->
                <div style="cursor: pointer; font-weight: bold" id="toggleScores">${runtime.config.isZH ? "+ 战力打造分: " : "+ Character Build Score: "}${totalScore.toFixed(1)}</div>
                <div id="buildScores" style="display: none; margin-left: 20px;">
                        <div>${runtime.config.isZH ? "房子分：" : "House score: "}${battleHouseScore.toFixed(1)}</div>
                        <div>${runtime.config.isZH ? "技能分：" : "Ability score: "}${abilityScore.toFixed(1)}</div>
                        <div>${runtime.config.isZH ? "装备分：" : "Equipment score: "}${equipmentScore.toFixed(1)}</div>
                </div>

                <!-- 总NetWorth -->
                <div style="cursor: pointer; font-weight: bold;" id="toggleNetWorth">
                    ${runtime.config.isZH ? "+ 总NetWorth：" : "+ Total NetWorth: "}${runtime.api.numberFormatter(totalNetworth)}
                </div>

                <div id="netWorthDetails" style="display: none; margin-left: 20px;">
                    <!-- 流动资产 -->
                    <div style="cursor: pointer;" id="toggleCurrentAssets">
                        ${runtime.config.isZH ? "+ 流动资产价值" : "+ Current assets value"}
                    </div>
                    <div id="currentAssets" style="display: none; margin-left: 20px;">
                        <div>${runtime.config.isZH ? "装备价值：" : "Equipment value: "}${runtime.api.numberFormatter(equippedNetworthAsk)}</div>
                        <div>${runtime.config.isZH ? "库存价值：" : "Inventory value: "}${runtime.api.numberFormatter(inventoryNetworthAsk)}</div>
                        <div>${runtime.config.isZH ? "订单价值：" : "Market listing value: "}${runtime.api.numberFormatter(marketListingsNetworthAsk)}</div>
                    </div>

                    <!-- 非流动资产 -->
                    <div style="cursor: pointer;" id="toggleNonCurrentAssets">
                        ${runtime.config.isZH ? "+ 非流动资产价值" : "+ Fixed assets value"}
                    </div>
                    <div id="nonCurrentAssets" style="display: none; margin-left: 20px;">
                        <div>${runtime.config.isZH ? "房子价值：" : "Houses value: "}${runtime.api.numberFormatter(totalHouseScore * 1e6)}</div>
                        <div>${runtime.config.isZH ? "技能价值：" : "Abilities value: "}${runtime.api.numberFormatter(allAbilityScore * 1e6)}</div>
                    </div>
                </div>
            </div>`
      );
      const toggleScores = document.getElementById("toggleScores");
      const ScoreDetails = document.getElementById("buildScores");
      const toggleButton = document.getElementById("toggleNetWorth");
      const netWorthDetails = document.getElementById("netWorthDetails");
      const toggleCurrentAssets = document.getElementById("toggleCurrentAssets");
      const currentAssets = document.getElementById("currentAssets");
      const toggleNonCurrentAssets = document.getElementById(
        "toggleNonCurrentAssets"
      );
      const nonCurrentAssets = document.getElementById("nonCurrentAssets");
      toggleScores.addEventListener("click", () => {
        const isCollapsed = ScoreDetails.style.display === "none";
        ScoreDetails.style.display = isCollapsed ? "block" : "none";
        toggleScores.textContent = (isCollapsed ? "↓ " : "+ ") + (runtime.config.isZH ? "战力打造分: " : "Character Build Score: ") + totalScore.toFixed(1);
      });
      toggleButton.addEventListener("click", () => {
        const isCollapsed = netWorthDetails.style.display === "none";
        netWorthDetails.style.display = isCollapsed ? "block" : "none";
        toggleButton.textContent = (isCollapsed ? "↓ " : "+ ") + (runtime.config.isZH ? "总NetWorth：" : "Total NetWorth: ") + runtime.api.numberFormatter(totalNetworth);
        currentAssets.style.display = isCollapsed ? "block" : "none";
        toggleCurrentAssets.textContent = (isCollapsed ? "↓ " : "+ ") + (runtime.config.isZH ? "流动资产价值" : "Current assets value");
        nonCurrentAssets.style.display = isCollapsed ? "block" : "none";
        toggleNonCurrentAssets.textContent = (isCollapsed ? "↓ " : "+ ") + (runtime.config.isZH ? "非流动资产价值" : "Fixed assets value");
      });
      toggleCurrentAssets.addEventListener("click", () => {
        const isCollapsed = currentAssets.style.display === "none";
        currentAssets.style.display = isCollapsed ? "block" : "none";
        toggleCurrentAssets.textContent = (isCollapsed ? "↓ " : "+ ") + (runtime.config.isZH ? "流动资产价值" : "Current assets value");
      });
      toggleNonCurrentAssets.addEventListener("click", () => {
        const isCollapsed = nonCurrentAssets.style.display === "none";
        nonCurrentAssets.style.display = isCollapsed ? "block" : "none";
        toggleNonCurrentAssets.textContent = (isCollapsed ? "↓ " : "+ ") + (runtime.config.isZH ? "非流动资产价值" : "Fixed assets value");
      });
    };
    const waitForHeader = () => {
      const targetNode = document.querySelector("div.Header_totalLevel__8LY3Q");
      if (targetNode) {
        targetNode.insertAdjacentHTML(
          "afterend",
          `<div style="font-size: 0.875rem; font-weight: 500; color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-wrap: nowrap;">Current Assets: ${runtime.api.numberFormatter(
            networthAsk
          )} / ${runtime.api.numberFormatter(networthBid)}${`<div id="script_api_fail_alert" style="color: ${runtime.config.SCRIPT_COLOR_ALERT};">${runtime.config.isZH ? "无法从API更新市场数据" : "Can't update market prices"}</div>`}</div>`
        );
        const alertDiv = document.querySelector("div#script_api_fail_alert");
        if (alertDiv) {
          alertDiv.style.cursor = "pointer";
          alertDiv.addEventListener("click", () => {
            showApiFailAlertPopup();
          });
          if (runtime.state.isUsingExpiredMarketJson && runtime.settings.settingsMap.networkAlert.isTrue) {
            alertDiv.style.display = "block";
          } else {
            alertDiv.style.display = "none";
          }
        }
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="script_api_fail_popout" style="display: none; position: absolute; top: 50px; left: 0; padding: 10px; background: white; border: 1px solid black; box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2); border-radius: 8px; white-space: pre-wrap;"></div>`
        );
        const popout = document.querySelector("#script_api_fail_popout");
        if (popout) {
          popout.addEventListener("click", function() {
            const popout2 = document.querySelector("#script_api_fail_popout");
            popout2.style.display = popout2.style.display === "block" ? "none" : "block";
          });
        }
      } else {
        setTimeout(waitForHeader, 200);
      }
    };
    waitForHeader();
    function showApiFailAlertPopup() {
      console.log(runtime.state.reasonForUsingExpiredMarketJson);
      const popout = document.querySelector("#script_api_fail_popout");
      if (popout) {
        popout.textContent = runtime.state.reasonForUsingExpiredMarketJson;
        popout.style.display = "block";
      }
    }
    const waitForInv = () => {
      const targetNodes = document.querySelectorAll("div.Inventory_items__6SXv0");
      for (const node of targetNodes) {
        if (runtime.settings.settingsMap.invWorth.isTrue) {
          if (!node.classList.contains("script_buildScore_added")) {
            node.classList.add("script_buildScore_added");
            addInventorySummery(node);
          }
        }
        if (runtime.settings.settingsMap.invSort.isTrue) {
          if (!node.classList.contains("script_invSort_added")) {
            node.classList.add("script_invSort_added");
            addInvSortButton(node);
          }
        }
      }
      setTimeout(waitForInv, 1e3);
    };
    waitForInv();
    const waitGuildCreditConversionsSelect = () => {
      if (runtime.settings.settingsMap.guildCreditConversionsSort.isTrue)
        addGuildCreditConversionsSortButton();
      setTimeout(waitGuildCreditConversionsSelect, 1e3);
    };
    waitGuildCreditConversionsSelect();
  }
  async function addInvSortButton(invElem) {
    const price_data = await runtime.api.fetchMarketJSON();
    if (!price_data || !price_data.marketData) {
      console.error("addInvSortButton fetchMarketJSON null");
      return;
    }
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
    const buttonsDiv = `<div style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; font-size: 0.875rem; text-align: left; ">${runtime.config.isZH ? "物品排序：" : "Sort items by: "}${askButton} ${bidButton} ${noneButton}</div>`;
    invElem.insertAdjacentHTML("beforebegin", buttonsDiv);
    invElem.parentElement.querySelector("button#script_sortByAsk_btn").addEventListener("click", function(e) {
      sortItemsBy("ask");
    });
    invElem.parentElement.querySelector("button#script_sortByBid_btn").addEventListener("click", function(e) {
      sortItemsBy("bid");
    });
    invElem.parentElement.querySelector("button#script_sortByNone_btn").addEventListener("click", function(e) {
      sortItemsBy("none");
    });
    const sortItemsBy = (order) => {
      for (const typeDiv of invElem.children) {
        const typeName = runtime.api.getOriTextFromElement(
          typeDiv.getElementsByClassName("Inventory_categoryButton__35s1x")[0]
        );
        const notNeedSortTypes = ["Loots", "Currencies", "Equipment"];
        if (notNeedSortTypes.includes(typeName)) {
          continue;
        }
        typeDiv.querySelector(".Inventory_label__XEOAx").style.order = Number.MIN_SAFE_INTEGER;
        const itemElems = typeDiv.querySelectorAll(".Item_itemContainer__x7kH1");
        for (const itemElem of itemElems) {
          let itemName = itemElem.querySelector("svg").attributes["aria-label"].value;
          if (runtime.config.isZHInGameSetting) {
            itemName = runtime.api.getItemEnNameFromZhName(itemName);
          }
          const itemHrid = runtime.state.itemEnNameToHridMap[itemName];
          let itemCount = itemElem.querySelector(".Item_count__1HVvv").innerText;
          itemCount = Number(
            itemCount.toLowerCase().replaceAll("k", "000").replaceAll("m", "000000")
          );
          let askPrice = 0;
          if (price_data.marketData[itemHrid] && price_data.marketData[itemHrid][0])
            askPrice = price_data.marketData[itemHrid][0].a;
          let bidPrice = 0;
          if (price_data.marketData[itemHrid] && price_data.marketData[itemHrid][0])
            bidPrice = price_data.marketData[itemHrid][0].b;
          const itemAskmWorth = askPrice * itemCount;
          const itemBidWorth = bidPrice * itemCount;
          if (!itemElem.querySelector("#script_stack_price")) {
            itemElem.style.position = "relative";
            const priceElemHTML = `<div
                        id="script_stack_price"
                        style="z-index: 1; position: absolute; top: 2px; left: 2px; text-align: left;">
                    </div>`;
            itemElem.querySelector(".Item_item__2De2O.Item_clickable__3viV6").insertAdjacentHTML("beforeend", priceElemHTML);
          }
          const priceElem = itemElem.querySelector("#script_stack_price");
          if (order === "ask") {
            itemElem.style.order = -itemAskmWorth;
            priceElem.textContent = runtime.api.numberFormatter(itemAskmWorth);
          } else if (order === "bid") {
            itemElem.style.order = -itemBidWorth;
            priceElem.textContent = runtime.api.numberFormatter(itemBidWorth);
          } else if (order === "none") {
            itemElem.style.order = 0;
            priceElem.textContent = "";
          }
        }
      }
    };
  }
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
    const bestCreditConversionMap = {};
    for (const itemHrid in runtime.state.initData_itemDetailMap) {
      if (runtime.state.initData_itemDetailMap[itemHrid]?.guildCreditConversions) {
        const conversions = runtime.state.initData_itemDetailMap[itemHrid].guildCreditConversions;
        for (const conversion of conversions) {
          const creditHrid = conversion.creditItemHrid;
          let askPrice = 0;
          if (price_data.marketData[itemHrid] && price_data.marketData[itemHrid][0])
            askPrice = price_data.marketData[itemHrid][0].a;
          let bidPrice = 0;
          if (price_data.marketData[itemHrid] && price_data.marketData[itemHrid][0])
            bidPrice = price_data.marketData[itemHrid][0].b;
          if (askPrice === 0 && bidPrice === 0) continue;
          const creditAskPrice = askPrice * conversion.itemCount / conversion.creditCount;
          const creditBidPrice = bidPrice * conversion.itemCount / conversion.creditCount;
          const enName = runtime.state.initData_itemDetailMap[itemHrid].name;
          const zhName = runtime.data.ZHItemNames[itemHrid];
          const displayName = runtime.config.isZHInGameSetting ? zhName || enName : enName;
          if (!bestCreditConversionMap[creditHrid]) {
            bestCreditConversionMap[creditHrid] = { ask: null, bid: null };
          }
          if (askPrice > 0 && (!bestCreditConversionMap[creditHrid].ask || creditAskPrice < bestCreditConversionMap[creditHrid].ask.price)) {
            bestCreditConversionMap[creditHrid].ask = {
              name: displayName,
              price: creditAskPrice
            };
          }
          if (bidPrice > 0 && (!bestCreditConversionMap[creditHrid].bid || creditBidPrice < bestCreditConversionMap[creditHrid].bid.price)) {
            bestCreditConversionMap[creditHrid].bid = {
              name: displayName,
              price: creditBidPrice
            };
          }
        }
      }
    }
    const inputContainer = selectorContainer.querySelector(
      ".Input_inputContainer__22GnD"
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
    const buttonsDiv = `<div id="script_itemSelector_sort_div" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; font-size: 0.875rem; text-align: left; margin-left: 8px; display: inline;">${runtime.config.isZH ? "排序：" : "Sort: "}${askButton} ${bidButton} ${noneButton}</div>`;
    inputContainer.insertAdjacentHTML("afterend", buttonsDiv);
    const itemList = selectorContainer.querySelector(
      ".ItemSelector_itemList__Qa5lq"
    );
    if (!itemList) {
      return;
    }
    const sortItemsBy = (order) => {
      const itemContainers = itemList.querySelectorAll(
        ".ItemSelector_itemContainer__3olqe"
      );
      let targetCreditHrid = "";
      let targetCreditName = "";
      const exchangeModal = document.querySelector(
        ".GuildPanel_exchangeModalContent__aQqyL"
      );
      if (exchangeModal) {
        const creditIcon = exchangeModal.querySelector(
          ".GuildPanel_arrow__1v2a0 + .Item_itemContainer__x7kH1 svg"
        );
        if (creditIcon) {
          let creditAriaLabel = creditIcon.attributes["aria-label"]?.value;
          if (creditAriaLabel) {
            if (runtime.config.isZHInGameSetting) {
              creditAriaLabel = runtime.api.getItemEnNameFromZhName(creditAriaLabel);
            }
            targetCreditHrid = runtime.state.itemEnNameToHridMap[creditAriaLabel];
            targetCreditName = creditAriaLabel;
          }
        }
      }
      const priceList = [];
      itemContainers.forEach((itemContainer) => {
        const itemElem = itemContainer.querySelector(
          ".Item_itemContainer__x7kH1"
        );
        if (!itemElem) return;
        let itemName = itemElem.querySelector("svg")?.attributes["aria-label"]?.value;
        if (!itemName) {
          itemElem.style.order = 0;
          const priceElem2 = itemElem.querySelector("#script_itemSelector_price");
          if (priceElem2) priceElem2.remove();
          return;
        }
        if (runtime.config.isZHInGameSetting) {
          itemName = runtime.api.getItemEnNameFromZhName(itemName);
        }
        const itemHrid = runtime.state.itemEnNameToHridMap[itemName];
        let itemCount = itemElem.querySelector(".Item_count__1HVvv")?.innerText;
        if (!itemCount) {
          itemElem.style.order = 0;
          const priceElem2 = itemElem.querySelector("#script_itemSelector_price");
          if (priceElem2) priceElem2.remove();
          return;
        }
        itemCount = Number(
          itemCount.toLowerCase().replaceAll("k", "000").replaceAll("m", "000000")
        );
        let askPrice = 0;
        if (price_data.marketData[itemHrid] && price_data.marketData[itemHrid][0])
          askPrice = price_data.marketData[itemHrid][0].a;
        let bidPrice = 0;
        if (price_data.marketData[itemHrid] && price_data.marketData[itemHrid][0])
          bidPrice = price_data.marketData[itemHrid][0].b;
        let creditValue = 0;
        let creditAskPrice = 0;
        let creditBidPrice = 0;
        if (targetCreditHrid && runtime.state.initData_itemDetailMap[itemHrid]?.guildCreditConversions) {
          const conversions = runtime.state.initData_itemDetailMap[itemHrid].guildCreditConversions;
          const matchedConversion = conversions.find(
            (c) => c.creditItemHrid === targetCreditHrid
          );
          if (matchedConversion) {
            creditValue = itemCount / matchedConversion.itemCount * matchedConversion.creditCount;
            creditAskPrice = askPrice * itemCount / creditValue;
            creditBidPrice = bidPrice * itemCount / creditValue;
          }
        }
        if (targetCreditHrid && creditAskPrice > 0) {
          priceList.push({
            name: itemName,
            ask: creditAskPrice,
            bid: creditBidPrice
          });
        }
        if (!itemElem.querySelector("#script_itemSelector_price")) {
          itemElem.style.position = "relative";
          const priceElemHTML = `<div
                    id="script_itemSelector_price"
                    style="z-index: 1; position: absolute; top: 2px; left: 2px; text-align: left; font-size: 10px;">
                </div>`;
          itemElem.querySelector(".Item_item__2De2O.Item_clickable__3viV6").insertAdjacentHTML("beforeend", priceElemHTML);
        }
        const priceElem = itemElem.querySelector("#script_itemSelector_price");
        if (!itemElem.querySelector("#script_itemSelector_credit")) {
          const creditElemHTML = `<div
                    id="script_itemSelector_credit"
                    style="z-index: 1; position: absolute; bottom: 2px; left: 2px; text-align: left; font-size: 10px;">
                </div>`;
          itemElem.querySelector(".Item_item__2De2O.Item_clickable__3viV6").insertAdjacentHTML("beforeend", creditElemHTML);
        }
        const creditElem = itemElem.querySelector("#script_itemSelector_credit");
        if (order === "ask") {
          const sortValue = creditAskPrice > 0 ? creditAskPrice : askPrice * itemCount;
          itemContainer.style.order = Math.round(sortValue);
          priceElem.textContent = runtime.api.numberFormatter(
            creditValue > 0 ? creditValue : askPrice * itemCount
          );
          creditElem.textContent = runtime.api.numberFormatter(sortValue);
        } else if (order === "bid") {
          const sortValue = creditBidPrice > 0 ? creditBidPrice : bidPrice * itemCount;
          itemContainer.style.order = Math.round(sortValue);
          priceElem.textContent = runtime.api.numberFormatter(
            creditValue > 0 ? creditValue : bidPrice * itemCount
          );
          creditElem.textContent = runtime.api.numberFormatter(sortValue);
        } else if (order === "none") {
          itemContainer.style.order = 0;
          priceElem.textContent = "";
          creditElem.textContent = "";
        }
      });
      const bestItemSpan = selectorContainer.querySelector("#script_best_item");
      if (order !== "none" && targetCreditHrid && bestCreditConversionMap[targetCreditHrid]) {
        const best = bestCreditConversionMap[targetCreditHrid][order];
        if (best) {
          if (bestItemSpan) {
            bestItemSpan.textContent = `${best.name} ${runtime.api.numberFormatter(best.price)}`;
          } else {
            const span = `<span id="script_best_item" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; font-size: 0.875rem; margin-left: 8px;">${best.name} ${runtime.api.numberFormatter(best.price)}</span>`;
            selectorContainer.querySelector("#script_itemSelector_sort_div").insertAdjacentHTML("beforeend", span);
          }
        } else if (bestItemSpan) {
          bestItemSpan.remove();
        }
      } else if (bestItemSpan) {
        bestItemSpan.remove();
      }
    };
    selectorContainer.querySelector("button#script_itemSelector_sortByAsk_btn").addEventListener("click", function(e) {
      sortItemsBy("ask");
    });
    selectorContainer.querySelector("button#script_itemSelector_sortByBid_btn").addEventListener("click", function(e) {
      sortItemsBy("bid");
    });
    selectorContainer.querySelector("button#script_itemSelector_sortByNone_btn").addEventListener("click", function(e) {
      sortItemsBy("none");
    });
  }
  Object.assign(runtime.api, {
    calculateNetworth,
    addInvSortButton,
    addGuildCreditConversionsSortButton
  });

  // src/features/build-score.js
  async function getSelfBuildScores(equippedNetworth) {
    const battleHouses = [
      "dining_room",
      "library",
      "dojo",
      "gym",
      "armory",
      "archery_range",
      "mystical_study"
    ];
    let battleHouseScore = 0;
    let nonBattleHouseScore = 0;
    for (const key in runtime.state.initData_characterHouseRoomMap) {
      if (battleHouses.some(
        (house) => runtime.state.initData_characterHouseRoomMap[key].houseRoomHrid.includes(house)
      )) {
        battleHouseScore += await getHouseFullBuildPrice(
          runtime.state.initData_characterHouseRoomMap[key]
        ) / 1e6;
      } else {
        nonBattleHouseScore += await getHouseFullBuildPrice(
          runtime.state.initData_characterHouseRoomMap[key]
        ) / 1e6;
      }
    }
    let abilityScore = 0;
    try {
      abilityScore = await calculateAbilityScore();
    } catch (error) {
      console.error("Error in calculateAbilityScore()", error);
    }
    let allAbilityScore = 0;
    try {
      allAbilityScore = await calculateAbilityScore(true);
    } catch (error) {
      console.error("Error in calculateAbilityScore(true)", error);
    }
    let equipmentScore = equippedNetworth / 1e6;
    return [
      battleHouseScore,
      nonBattleHouseScore,
      abilityScore,
      allAbilityScore,
      equipmentScore
    ];
  }
  async function getHouseFullBuildPrice(house) {
    const marketAPIJson = await runtime.api.fetchMarketJSON();
    if (!marketAPIJson) {
      return 0;
    }
    const clientObj = JSON.parse(GM_getValue("init_client_data", ""));
    const upgradeCostsMap = clientObj.houseRoomDetailMap[house.houseRoomHrid].upgradeCostsMap;
    const level = house.level;
    let cost = 0;
    for (let i = 1; i <= level; i++) {
      for (const item of upgradeCostsMap[i]) {
        const marketPrices = marketAPIJson.marketData[item.itemHrid];
        if (marketPrices && marketPrices[0]) {
          cost += item.count * getWeightedMarketPrice(marketPrices);
        } else {
          console.log(
            "getHouseFullBuildPrice cannot find price of " + item.itemHrid
          );
        }
      }
    }
    return cost;
  }
  function getWeightedMarketPrice(marketPrices, ratio = 0.5) {
    let ask = marketPrices[0].a;
    let bid = marketPrices[0].b;
    if (ask > 0 && bid < 0) {
      bid = ask;
    }
    if (bid > 0 && ask < 0) {
      ask = bid;
    }
    const weightedPrice = ask * ratio + bid * (1 - ratio);
    return weightedPrice;
  }
  async function calculateAbilityScore(isAll = false) {
    const marketAPIJson = await runtime.api.fetchMarketJSON();
    if (!marketAPIJson) {
      return 0;
    }
    let exp_50_skill = [
      "poke",
      "scratch",
      "smack",
      "quick_shot",
      "water_strike",
      "fireball",
      "entangle",
      "minor_heal"
    ];
    const getNeedBooksToLevel = (targetLevel, abilityPerBookExp) => {
      const needExp = runtime.state.initData_levelExperienceTable[targetLevel];
      let needBooks = needExp / abilityPerBookExp;
      needBooks += 1;
      return needBooks.toFixed(1);
    };
    let price = 0;
    const abilities = isAll ? runtime.state.initData_characterAbilities : runtime.state.initData_combatAbilities;
    abilities.forEach((item) => {
      let numBooks = 0;
      if (exp_50_skill.some((skill) => item.abilityHrid.includes(skill))) {
        numBooks = getNeedBooksToLevel(item.level, 50);
      } else {
        numBooks = getNeedBooksToLevel(item.level, 500);
      }
      const itemHrid = item.abilityHrid.replace("/abilities/", "/items/");
      const marketPrices = marketAPIJson.marketData[itemHrid];
      if (marketPrices && marketPrices[0]) {
        price += numBooks * getWeightedMarketPrice(marketPrices);
      } else {
        console.log("calculateAbilityScore cannot find price of " + itemHrid);
      }
    });
    return price /= 1e6;
  }
  function getInfoPanel() {
    const selectedElement = document.querySelector(
      `div.SharableProfile_overviewTab__W4dCV`
    );
    if (selectedElement) {
      return selectedElement;
    } else {
      return new Promise((resolve) => {
        setTimeout(() => resolve(getInfoPanel()), 500);
      });
    }
  }
  async function showBuildScoreOnProfile(profile_shared_obj) {
    const [battleHouseScore, abilityScore, equipmentScore] = await getBuildScoreByProfile(profile_shared_obj);
    const totalBuildScore = battleHouseScore + abilityScore + equipmentScore;
    const isEquipmentHiddenText = abilityScore + equipmentScore <= 0 ? runtime.config.isZH ? " (装备隐藏)" : " (Equipment hidden)" : " ";
    const panel = await getInfoPanel();
    panel.style.height = "auto";
    panel.insertAdjacentHTML(
      "beforeend",
      `<div style="text-align: left; color: ${runtime.config.SCRIPT_COLOR_MAIN}; font-size: 0.875rem;">
            <div style="cursor: pointer; font-weight: bold" id="toggleScores_profile">${runtime.config.isZH ? "+ 战力打造分: " : "+ Character Build Score: "}${totalBuildScore.toFixed(1)}${isEquipmentHiddenText}</div>
            <div id="buildScores_profile" style="display: none; margin-left: 20px;">
                    <div>${runtime.config.isZH ? "房子分：" : "House score: "}${battleHouseScore.toFixed(1)}</div>
                    <div>${runtime.config.isZH ? "技能分：" : "Ability score: "}${abilityScore.toFixed(1)}</div>
                    <div>${runtime.config.isZH ? "装备分：" : "Equipment score: "}${equipmentScore.toFixed(1)}</div>
            </div>
        </div>`
    );
    const toggleScores = document.getElementById("toggleScores_profile");
    const ScoreDetails = document.getElementById("buildScores_profile");
    toggleScores.addEventListener("click", () => {
      const isCollapsed = ScoreDetails.style.display === "none";
      ScoreDetails.style.display = isCollapsed ? "block" : "none";
      toggleScores.textContent = (isCollapsed ? "↓ " : "+ ") + (runtime.config.isZH ? "战力打造分: " : "Character Build Score: ") + totalBuildScore.toFixed(1) + isEquipmentHiddenText;
    });
  }
  async function getBuildScoreByProfile(profile_shared_obj) {
    const battleHouses = [
      "dining_room",
      "library",
      "dojo",
      "gym",
      "armory",
      "archery_range",
      "mystical_study"
    ];
    let battleHouseScore = 0;
    for (const key in profile_shared_obj.profile.characterHouseRoomMap) {
      if (battleHouses.some(
        (house) => profile_shared_obj.profile.characterHouseRoomMap[key].houseRoomHrid.includes(house)
      )) {
        battleHouseScore += await getHouseFullBuildPrice(
          profile_shared_obj.profile.characterHouseRoomMap[key]
        ) / 1e6;
      }
    }
    if (profile_shared_obj.profile.hideWearableItems) {
      return [battleHouseScore, 0, 0];
    }
    let abilityScore = 0;
    try {
      abilityScore = await calculateSkill(profile_shared_obj);
    } catch (error) {
      console.error("Error in calculate skill:", error);
    }
    let equipmentScore = 0;
    try {
      equipmentScore = await calculateEquipment(profile_shared_obj);
    } catch (error) {
      console.error("Error in calculateEquipmen:", error);
    }
    return [battleHouseScore, abilityScore, equipmentScore];
  }
  async function calculateSkill(profile_shared_obj) {
    const marketAPIJson = await runtime.api.fetchMarketJSON();
    if (!marketAPIJson) {
      return 0;
    }
    let obj = profile_shared_obj.profile;
    let exp_50_skill = [
      "poke",
      "scratch",
      "smack",
      "quick_shot",
      "water_strike",
      "fireball",
      "entangle",
      "minor_heal"
    ];
    const getNeedBooksToLevel = (targetLevel, abilityPerBookExp) => {
      const needExp = runtime.state.initData_levelExperienceTable[targetLevel];
      let needBooks = needExp / abilityPerBookExp;
      needBooks += 1;
      return needBooks.toFixed(1);
    };
    let price = 0;
    obj.equippedAbilities.forEach((item) => {
      let numBooks = 0;
      if (exp_50_skill.some((skill) => item.abilityHrid.includes(skill))) {
        numBooks = getNeedBooksToLevel(item.level, 50);
      } else {
        numBooks = getNeedBooksToLevel(item.level, 500);
      }
      const itemHrid = item.abilityHrid.replace("/abilities/", "/items/");
      const marketPrices = marketAPIJson.marketData[itemHrid];
      if (marketPrices && marketPrices[0]) {
        price += numBooks * getWeightedMarketPrice(marketPrices);
      } else {
        console.log("calculateSkill cannot find price of " + itemHrid);
      }
    });
    return price /= 1e6;
  }
  async function calculateEquipment(profile_shared_obj) {
    const marketAPIJson = await runtime.api.fetchMarketJSON();
    if (!marketAPIJson) {
      return 0;
    }
    let obj = profile_shared_obj.profile;
    let networthAsk = 0;
    let networthBid = 0;
    for (const key in obj.wearableItemMap) {
      let item = obj.wearableItemMap[key];
      const enhanceLevel = obj.wearableItemMap[key].enhancementLevel;
      const itemHrid = obj.wearableItemMap[key].itemHrid;
      const marketPrices = marketAPIJson.marketData[itemHrid];
      if (enhanceLevel && enhanceLevel > 1) {
        runtime.state.input_data.item_hrid = item.itemHrid;
        runtime.state.input_data.stop_at = enhanceLevel;
        const best = await runtime.api.findBestEnhanceStratWithPhiMirror(
          runtime.state.input_data
        );
        let totalCost = best?.totalCost;
        totalCost = totalCost ? Math.round(totalCost) : 0;
        networthAsk += item.count * (totalCost > 0 ? totalCost : 0);
        networthBid += item.count * (totalCost > 0 ? totalCost : 0);
      } else if (marketPrices && marketPrices[0]) {
        networthAsk += item.count * (marketPrices[0].a > 0 ? marketPrices[0].a : 0);
        networthBid += item.count * (marketPrices[0].b > 0 ? marketPrices[0].b : 0);
      } else {
        console.log("calculateEquipment cannot find price of " + itemHrid);
      }
    }
    return (networthAsk * 0.5 + networthBid * 0.5) / 1e6;
  }
  Object.assign(runtime.api, {
    getSelfBuildScores,
    getHouseFullBuildPrice,
    getWeightedMarketPrice,
    calculateAbilityScore,
    getInfoPanel,
    showBuildScoreOnProfile,
    getBuildScoreByProfile,
    calculateSkill,
    calculateEquipment
  });

  // src/features/item-tooltips.js
  var showTotalActionTime = () => {
    const targetNode = document.querySelector("div.Header_actionName__31-L2");
    if (targetNode) {
      console.log("start observe action progress bar");
      calculateTotalTime(targetNode);
      new MutationObserver(
        (mutationsList) => mutationsList.forEach((mutation) => {
          calculateTotalTime();
        })
      ).observe(targetNode, {
        characterData: true,
        subtree: true,
        childList: true
      });
    } else {
      setTimeout(showTotalActionTime, 200);
    }
  };
  function calculateTotalTime() {
    const targetNode = document.querySelector(
      "div.Header_actionName__31-L2 > div.Header_displayName__1hN09"
    );
    if (targetNode.textContent.includes("[")) {
      return;
    }
    let totalTimeStr = "Error";
    const content = targetNode.innerText;
    const match = content.match(/\((\d+)\)/);
    if (match) {
      const numOfTimes = +match[1];
      const timePerActionSec = +runtime.api.getOriTextFromElement(document.querySelector(".ProgressBar_text__102Yn")).match(/[\d\.]+/)[0];
      const actionHrid = runtime.state.currentActionsHridList[0].actionHrid;
      let effBuff = 1 + runtime.api.getTotalEffiPercentage(actionHrid) / 100;
      if (actionHrid.includes("enhanc")) {
        effBuff = 1;
      }
      const actualNumberOfTimes = Math.round(numOfTimes / effBuff);
      const totalTimeSeconds = actualNumberOfTimes * timePerActionSec;
      totalTimeStr = " [" + timeReadable(totalTimeSeconds) + "]";
      const currentTime = /* @__PURE__ */ new Date();
      currentTime.setSeconds(currentTime.getSeconds() + totalTimeSeconds);
      totalTimeStr += ` ${String(currentTime.getHours()).padStart(2, "0")}:${String(currentTime.getMinutes()).padStart(2, "0")}:${String(
        currentTime.getSeconds()
      ).padStart(2, "0")}`;
    } else {
      totalTimeStr = " [∞]";
    }
    targetNode.textContent += totalTimeStr;
  }
  function timeReadable(sec) {
    if (sec >= 86400) {
      return Number(sec / 86400).toFixed(1) + (runtime.config.isZH ? " 天" : " days");
    }
    const d = new Date(Math.round(sec * 1e3));
    function pad(i) {
      return ("0" + i).slice(-2);
    }
    let str = d.getUTCHours() + "h " + pad(d.getUTCMinutes()) + "m " + pad(d.getUTCSeconds()) + "s";
    return str;
  }
  var tooltipObserver = new MutationObserver(async function(mutations) {
    for (const mutation of mutations) {
      for (const added of mutation.addedNodes) {
        if (added.classList.contains("MuiTooltip-popper")) {
          if (added.querySelector("div.ItemTooltipText_name__2JAHA")) {
            await handleTooltipItem(added);
          } else if (added.querySelector("div.QueuedActions_queuedActionsEditMenu__3OoQH")) {
            runtime.api.handleActionQueueMenue(
              added.querySelector(
                "div.QueuedActions_queuedActionsEditMenu__3OoQH"
              )
            );
          }
        }
      }
    }
  });
  var actionHridToToolsSpeedBuffNamesMap = {
    "/action_types/brewing": "brewingSpeed",
    "/action_types/cheesesmithing": "cheesesmithingSpeed",
    "/action_types/cooking": "cookingSpeed",
    "/action_types/crafting": "craftingSpeed",
    "/action_types/foraging": "foragingSpeed",
    "/action_types/milking": "milkingSpeed",
    "/action_types/tailoring": "tailoringSpeed",
    "/action_types/woodcutting": "woodcuttingSpeed",
    "/action_types/alchemy": "alchemySpeed"
  };
  var actionHridToHouseNamesMap = {
    "/action_types/brewing": "/house_rooms/brewery",
    "/action_types/cheesesmithing": "/house_rooms/forge",
    "/action_types/cooking": "/house_rooms/kitchen",
    "/action_types/crafting": "/house_rooms/workshop",
    "/action_types/foraging": "/house_rooms/garden",
    "/action_types/milking": "/house_rooms/dairy_barn",
    "/action_types/tailoring": "/house_rooms/sewing_parlor",
    "/action_types/woodcutting": "/house_rooms/log_shed",
    "/action_types/alchemy": "/house_rooms/laboratory"
  };
  var itemEnhanceLevelToBuffBonusMap = {
    0: 0,
    1: 2,
    2: 4.2,
    3: 6.6,
    4: 9.2,
    5: 12,
    6: 15,
    7: 18.2,
    8: 21.6,
    9: 25.2,
    10: 29,
    11: 33.4,
    12: 38.4,
    13: 44,
    14: 50.2,
    15: 57,
    16: 64.4,
    17: 72.4,
    18: 81,
    19: 90.2,
    20: 100
  };
  function getToolsSpeedBuffByActionHrid(actionHrid) {
    let totalBuff = 0;
    for (const item of runtime.state.initData_characterItems) {
      if (item.itemLocationHrid.includes("_tool")) {
        const buffName = actionHridToToolsSpeedBuffNamesMap[runtime.state.initData_actionDetailMap[actionHrid].type];
        const enhanceBonus = 1 + itemEnhanceLevelToBuffBonusMap[item.enhancementLevel] / 100;
        const buff = runtime.state.initData_itemDetailMap[item.itemHrid].equipmentDetail.noncombatStats[buffName] || 0;
        totalBuff += buff * enhanceBonus;
      }
    }
    return Number(totalBuff * 100).toFixed(1);
  }
  function getItemEffiBuffByActionHrid(actionHrid) {
    let buff = 0;
    const propertyName = runtime.state.initData_actionDetailMap[actionHrid].type.replace(
      "/action_types/",
      ""
    ) + "Efficiency";
    for (const item of runtime.state.initData_characterItems) {
      if (item.itemLocationHrid === "/item_locations/inventory") {
        continue;
      }
      const itemDetail = runtime.state.initData_itemDetailMap[item.itemHrid];
      const specificStat = itemDetail?.equipmentDetail?.noncombatStats[propertyName];
      if (specificStat && specificStat > 0) {
        let enhanceBonus = 1;
        if (item.itemLocationHrid.includes("earrings") || item.itemLocationHrid.includes("ring") || item.itemLocationHrid.includes("neck")) {
          enhanceBonus = 1 + itemEnhanceLevelToBuffBonusMap[item.enhancementLevel] * 5 / 100;
        } else {
          enhanceBonus = 1 + itemEnhanceLevelToBuffBonusMap[item.enhancementLevel] / 100;
        }
        buff += specificStat * enhanceBonus;
      }
      const skillingStat = itemDetail?.equipmentDetail?.noncombatStats["skillingEfficiency"];
      if (skillingStat && skillingStat > 0) {
        let enhanceBonus = 1;
        if (item.itemLocationHrid.includes("earrings") || item.itemLocationHrid.includes("ring") || item.itemLocationHrid.includes("neck")) {
          enhanceBonus = 1 + itemEnhanceLevelToBuffBonusMap[item.enhancementLevel] * 5 / 100;
        } else {
          enhanceBonus = 1 + itemEnhanceLevelToBuffBonusMap[item.enhancementLevel] / 100;
        }
        buff += skillingStat * enhanceBonus;
      }
    }
    return Number(buff * 100).toFixed(1);
  }
  function getHousesEffBuffByActionHrid(actionHrid) {
    const houseName = actionHridToHouseNamesMap[runtime.state.initData_actionDetailMap[actionHrid].type];
    if (!houseName) {
      return 0;
    }
    const house = runtime.state.initData_characterHouseRoomMap[houseName];
    if (!house) {
      return 0;
    }
    return house.level * 1.5;
  }
  function getTeaBuffsByActionHrid(actionHrid) {
    const teaBuffs = {
      efficiency: 0,
      // Efficiency tea, specific teas, -Artisan tea.
      quantity: 0,
      // Gathering tea, Gourmet tea.
      lessResource: 0,
      // Artisan tea.
      extraExp: 0,
      // Wisdom tea. Not used.
      upgradedProduct: 0
      // Processing tea. Not used.
    };
    const actionTypeId = runtime.state.initData_actionDetailMap[actionHrid].type;
    const teaList = runtime.state.initData_actionTypeDrinkSlotsMap[actionTypeId];
    for (const tea of teaList) {
      if (!tea || !tea.itemHrid) {
        continue;
      }
      for (const buff of runtime.state.initData_itemDetailMap[tea.itemHrid].consumableDetail.buffs) {
        if (buff.typeHrid === "/buff_types/artisan") {
          teaBuffs.lessResource += buff.flatBoost * 100;
        } else if (buff.typeHrid === "/buff_types/action_level") {
          teaBuffs.efficiency -= buff.flatBoost;
        } else if (buff.typeHrid === "/buff_types/gathering") {
          teaBuffs.quantity += buff.flatBoost * 100;
        } else if (buff.typeHrid === "/buff_types/gourmet") {
          teaBuffs.quantity += buff.flatBoost * 100;
        } else if (buff.typeHrid === "/buff_types/wisdom") {
          teaBuffs.extraExp += buff.flatBoost * 100;
        } else if (buff.typeHrid === "/buff_types/processing") {
          teaBuffs.upgradedProduct += buff.flatBoost * 100;
        } else if (buff.typeHrid === "/buff_types/efficiency") {
          teaBuffs.efficiency += buff.flatBoost * 100;
        } else if (buff.typeHrid === `/buff_types/${actionTypeId.replace("/action_types/", "")}_level`) {
          teaBuffs.efficiency += buff.flatBoost;
        }
      }
    }
    return teaBuffs;
  }
  async function handleTooltipItem(tooltip) {
    const itemNameElems = tooltip.querySelectorAll(
      "div.ItemTooltipText_name__2JAHA span"
    );
    if (itemNameElems.length > 1) {
      runtime.api.handleItemTooltipWithEnhancementLevel(tooltip);
      return;
    }
    const itemNameElem = itemNameElems[0];
    let itemName = runtime.api.getOriTextFromElement(itemNameElem);
    if (runtime.config.isZHInGameSetting) {
      itemName = runtime.api.getItemEnNameFromZhName(itemName);
    }
    const itemHrid = runtime.state.itemEnNameToHridMap[itemName];
    let amount = 0;
    let insertAfterElem = null;
    const amountSpan = tooltip.querySelectorAll("span")[1];
    if (amountSpan) {
      amount = +runtime.api.getOriTextFromElement(amountSpan).split(": ")[1].replaceAll(runtime.config.THOUSAND_SEPERATOR, "");
      insertAfterElem = amountSpan.parentNode.nextSibling;
    } else {
      insertAfterElem = tooltip.querySelectorAll("span")[0].parentNode.nextSibling;
    }
    let appendHTMLStr = "";
    let marketJson = null;
    let ask = null;
    let bid = null;
    if (runtime.settings.settingsMap.itemTooltip_prices.isTrue) {
      marketJson = await fetchMarketJSON();
      if (!marketJson || !marketJson.marketData) {
        console.error("jsonObj null");
      }
      ask = marketJson?.marketData[itemHrid]?.[0]?.a ?? 0;
      bid = marketJson?.marketData[itemHrid]?.[0]?.b ?? 0;
      appendHTMLStr += `
    <div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP};">${runtime.config.isZH ? "价格: " : "Price: "}${numberFormatter(ask)} / ${numberFormatter(bid)} (${ask && ask > 0 ? numberFormatter(ask * amount) : ""} / ${bid && bid > 0 ? numberFormatter(bid * amount) : ""})</div>
    `;
    }
    if (runtime.settings.settingsMap.showConsumTips.isTrue) {
      let itemDetail = runtime.state.initData_itemDetailMap[itemHrid];
      const hp = itemDetail?.consumableDetail?.hitpointRestore;
      const mp = itemDetail?.consumableDetail?.manapointRestore;
      const cd = itemDetail?.consumableDetail?.cooldownDuration;
      if (hp && cd) {
        const hpPerMiniute = 60 / (cd / 1e9) * hp;
        const pricePer100Hp = ask ? ask / (hp / 100) : null;
        const usePerday = 24 * 60 * 60 / (cd / 1e9);
        appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">${pricePer100Hp ? pricePer100Hp.toFixed(0) + (runtime.config.isZH ? "金/100血, " : "coins/100hp, ") : ""}${hpPerMiniute.toFixed(0) + (runtime.config.isZH ? "血/分" : "hp/min")}, ${usePerday.toFixed(0)}${runtime.config.isZH ? "个/天" : "/day"}</div>`;
      } else if (mp && cd) {
        const mpPerMiniute = 60 / (cd / 1e9) * mp;
        const pricePer100Mp = ask ? ask / (mp / 100) : null;
        const usePerday = 24 * 60 * 60 / (cd / 1e9);
        appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">${pricePer100Mp ? pricePer100Mp.toFixed(0) + (runtime.config.isZH ? "金/100蓝, " : "coins/100hp, ") : ""}${mpPerMiniute.toFixed(0) + (runtime.config.isZH ? "蓝/分" : "hp/min")}, ${usePerday.toFixed(0)}${runtime.config.isZH ? "个/天" : "/day"}</div>`;
      } else if (cd) {
        const usePerday = 24 * 60 * 60 / (cd / 1e9);
        appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}">${usePerday.toFixed(0)}${runtime.config.isZH ? "个/天" : "/day"}</div>`;
      }
    }
    if (runtime.settings.settingsMap.itemTooltip_profit.isTrue && marketJson && getActionHridFromItemName(itemName) && runtime.state.initData_actionDetailMap && runtime.state.initData_itemDetailMap) {
      const isProduction = runtime.state.initData_actionDetailMap[getActionHridFromItemName(itemName)].inputItems && runtime.state.initData_actionDetailMap[getActionHridFromItemName(itemName)].inputItems.length > 0;
      const actionHrid = getActionHridFromItemName(itemName);
      const teaBuffs = getTeaBuffsByActionHrid(actionHrid);
      let inputItems = [];
      let totalResourcesAskPricePerAction = 0;
      let totalResourcesBidPricePerAction = 0;
      if (isProduction) {
        inputItems = JSON.parse(
          JSON.stringify(
            runtime.state.initData_actionDetailMap[actionHrid].inputItems
          )
        );
        for (const item of inputItems) {
          item.name = runtime.state.initData_itemDetailMap[item.itemHrid].name;
          item.zhName = runtime.data.ZHItemNames[item.itemHrid];
          item.perAskPrice = marketJson?.marketData[item.itemHrid]?.[0]?.a ?? 0;
          item.perBidPrice = marketJson?.marketData[item.itemHrid]?.[0]?.b ?? 0;
          totalResourcesAskPricePerAction += item.perAskPrice * item.count;
          totalResourcesBidPricePerAction += item.perBidPrice * item.count;
        }
        const lessResourceBuff = teaBuffs.lessResource;
        totalResourcesAskPricePerAction *= 1 - lessResourceBuff / 100;
        totalResourcesBidPricePerAction *= 1 - lessResourceBuff / 100;
        const upgradedFromItemHrid = runtime.state.initData_actionDetailMap[actionHrid]?.upgradeItemHrid;
        let upgradedFromItemName = null;
        let upgradedFromItemZhName = null;
        let upgradedFromItemAsk = null;
        let upgradedFromItemBid = null;
        if (upgradedFromItemHrid) {
          upgradedFromItemName = runtime.state.initData_itemDetailMap[upgradedFromItemHrid].name;
          upgradedFromItemZhName = runtime.data.ZHItemNames[upgradedFromItemHrid];
          upgradedFromItemAsk += marketJson?.marketData[upgradedFromItemHrid]?.[0]?.a ?? 0;
          upgradedFromItemBid += marketJson?.marketData[upgradedFromItemHrid]?.[0]?.b ?? 0;
          totalResourcesAskPricePerAction += upgradedFromItemAsk;
          totalResourcesBidPricePerAction += upgradedFromItemBid;
        }
        appendHTMLStr += `
                            <div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">
                                <table style="width:100%; border-collapse: collapse;">
                                    <tr style="border-bottom: 1px solid ${runtime.config.SCRIPT_COLOR_TOOLTIP};">
                                        <th style="text-align: left;">${runtime.config.isZH ? "原料" : "Material"}</th>
                                        <th style="text-align: center;">${runtime.config.isZH ? "数量" : "Count"}</th>
                                        <th style="text-align: right;">${runtime.config.isZH ? "出售价" : "Ask"}</th>
                                        <th style="text-align: right;">${runtime.config.isZH ? "收购价" : "Bid"}</th>
                                    </tr>
                                    <tr style="border-bottom: 1px solid ${runtime.config.SCRIPT_COLOR_TOOLTIP};">
                                        <td style="text-align: left;"><b>${runtime.config.isZH ? "合计" : "Total"}</b></td>
                                        <td style="text-align: center;"><b>${inputItems.reduce((sum, item) => sum + item.count, 0)}</b></td>
                                        <td style="text-align: right;"><b>${numberFormatter(totalResourcesAskPricePerAction)}</b></td>
                                        <td style="text-align: right;"><b>${numberFormatter(totalResourcesBidPricePerAction)}</b></td>
                                    </tr>`;
        for (const item of inputItems) {
          appendHTMLStr += `
                                    <tr>
                                        <td style="text-align: left;">${runtime.config.isZH ? item.zhName : item.name}</td>
                                        <td style="text-align: center;">${item.count}</td>
                                        <td style="text-align: right;">${numberFormatter(item.perAskPrice)}</td>
                                        <td style="text-align: right;">${numberFormatter(item.perBidPrice)}</td>
                                    </tr>`;
        }
        appendHTMLStr += `</table></div>`;
        if (upgradedFromItemHrid) {
          appendHTMLStr += `
                <div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;"> ${runtime.config.isZH ? upgradedFromItemZhName : upgradedFromItemName}: ${numberFormatter(upgradedFromItemAsk)} / ${numberFormatter(upgradedFromItemBid)}</div>
                `;
        }
      }
      let drinksConsumedPerHourAskPrice = 0;
      let drinksConsumedPerHourBidPrice = 0;
      const drinksList = runtime.state.initData_actionTypeDrinkSlotsMap[runtime.state.initData_actionDetailMap[actionHrid].type];
      for (const drink of drinksList) {
        if (!drink || !drink.itemHrid) {
          continue;
        }
        drinksConsumedPerHourAskPrice += (marketJson?.marketData[drink.itemHrid]?.[0].a ?? 0) * 12;
        drinksConsumedPerHourBidPrice += (marketJson?.marketData[drink.itemHrid]?.[0].b ?? 0) * 12;
      }
      const baseTimePerActionSec = runtime.state.initData_actionDetailMap[actionHrid].baseTimeCost / 1e9;
      const toolPercent = getToolsSpeedBuffByActionHrid(actionHrid);
      const actualTimePerActionSec = baseTimePerActionSec / (1 + toolPercent / 100);
      let actionPerHour = 3600 / actualTimePerActionSec;
      let droprate = null;
      if (isProduction) {
        droprate = runtime.state.initData_actionDetailMap[actionHrid].outputItems[0].count;
      } else {
        droprate = (runtime.state.initData_actionDetailMap[actionHrid].dropTable[0].minCount + runtime.state.initData_actionDetailMap[actionHrid].dropTable[0].maxCount) / 2;
      }
      let itemPerHour = actionPerHour * droprate;
      const requiredLevel = runtime.state.initData_actionDetailMap[actionHrid].levelRequirement.level;
      let currentLevel = requiredLevel;
      for (const skill of runtime.state.initData_characterSkills) {
        if (skill.skillHrid === runtime.state.initData_actionDetailMap[actionHrid].levelRequirement.skillHrid) {
          currentLevel = skill.level;
          break;
        }
      }
      const levelEffBuff = currentLevel - requiredLevel > 0 ? currentLevel - requiredLevel : 0;
      const houseEffBuff = getHousesEffBuffByActionHrid(actionHrid);
      const itemEffiBuff = Number(getItemEffiBuffByActionHrid(actionHrid));
      actionPerHour *= 1 + (levelEffBuff + houseEffBuff + teaBuffs.efficiency + itemEffiBuff) / 100;
      itemPerHour *= 1 + (levelEffBuff + houseEffBuff + teaBuffs.efficiency + itemEffiBuff) / 100;
      const extraFreeItemPerHour = itemPerHour * teaBuffs.quantity / 100;
      const bidAfterTax = bid * 0.98;
      const profitPerHour = itemPerHour * (bidAfterTax - totalResourcesAskPricePerAction / droprate) + extraFreeItemPerHour * bidAfterTax - drinksConsumedPerHourAskPrice;
      appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">${runtime.config.isZH ? "生产利润(卖单价进、买单价出，包含销售税；不包括加工茶、社区增益、稀有掉落、袋子饮食增益；刷新网页更新人物数据)：" : "Production profit(Sell price in, bid price out, including sales tax; Not including processing tea, comm buffs, rare drops, pouch consumables buffs; Refresh page to update player data): "}</div>`;
      appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">${baseTimePerActionSec.toFixed(2)}s ${runtime.config.isZH ? "基础速度" : "base speed,"} x${droprate} ${runtime.config.isZH ? "基础掉率" : "base drop rate,"} +${toolPercent}%${runtime.config.isZH ? "工具速度" : " tool speed,"} +${levelEffBuff}%${runtime.config.isZH ? "等级效率" : " level eff,"} +${houseEffBuff}%${runtime.config.isZH ? "房子效率" : " house eff,"} +${teaBuffs.efficiency}%${runtime.config.isZH ? "茶效率" : " tea eff,"} +${itemEffiBuff}%${runtime.config.isZH ? "装备效率" : " equipment eff,"} +${teaBuffs.quantity}%${runtime.config.isZH ? "茶额外数量" : " tea extra outcome,"} +${teaBuffs.lessResource}%${runtime.config.isZH ? "茶减少消耗" : " tea lower resource"}</div>`;
      appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">${runtime.config.isZH ? "每小时饮料消耗: " : "Drinks consumed per hour: "}${numberFormatter(drinksConsumedPerHourAskPrice)}  / ${numberFormatter(drinksConsumedPerHourBidPrice)}</div>`;
      appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP}; font-size: 0.625rem;">${runtime.config.isZH ? "每小时动作" : "Actions per hour"} ${Number(
        actionPerHour
      ).toFixed(
        1
      )}${runtime.config.isZH ? " 次" : " times"}, ${runtime.config.isZH ? "每小时生产" : "Production per hour"} ${Number(
        itemPerHour + extraFreeItemPerHour
      ).toFixed(1)}${runtime.config.isZH ? " 个" : " items"}</div>`;
      appendHTMLStr += `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP};">${runtime.config.isZH ? "利润: " : "Profit: "}${numberFormatter(
        profitPerHour / actionPerHour
      )}${runtime.config.isZH ? "/动作" : "/action"}, ${numberFormatter(profitPerHour)}${runtime.config.isZH ? "/小时" : "/hour"}, ${numberFormatter(24 * profitPerHour)}${runtime.config.isZH ? "/天" : "/day"}</div>`;
    }
    insertAfterElem.insertAdjacentHTML("afterend", appendHTMLStr);
    const tootip = insertAfterElem.closest(".MuiTooltip-popper");
    const fixOverflow = (tootip2) => {
      if (!tootip2.isConnected) {
        return;
      }
      const bBox = tootip2.getBoundingClientRect();
      if (bBox.top < 0 || bBox.bottom > window.innerHeight) {
        const transformString = tootip2.style.transform.split(/\w+\(|\);?/);
        const transformValues = transformString[1].split(/,\s?/g).map((numStr) => parseInt(numStr));
        tootip2.style.transform = `translate3d(${transformValues[0]}px, 0px, ${transformValues[2]}px)`;
      }
    };
    setTimeout(fixOverflow, 100, tootip);
  }
  function validateMarketJsonFetch(jsonStr, isSave) {
    if (!jsonStr) {
      console.error("validateMarketJson jsonStr is null");
      return null;
    }
    let jsonObj = null;
    try {
      jsonObj = JSON.parse(jsonStr);
    } catch (error) {
      console.error("validateMarketJson failed to parse JSON:", error.message);
    }
    if (jsonObj && jsonObj.timestamp && jsonObj.marketData) {
      jsonObj.marketData["/items/coin"] = { 0: { a: 1, b: 1 } };
      jsonObj.marketData["/items/task_token"] = { 0: { a: 0, b: 0 } };
      jsonObj.marketData["/items/cowbell"] = { 0: { a: 0, b: 0 } };
      jsonObj.marketData["/items/small_treasure_chest"] = { 0: { a: 0, b: 0 } };
      jsonObj.marketData["/items/medium_treasure_chest"] = { 0: { a: 0, b: 0 } };
      jsonObj.marketData["/items/large_treasure_chest"] = { 0: { a: 0, b: 0 } };
      jsonObj.marketData["/items/basic_task_badge"] = { 0: { a: 0, b: 0 } };
      jsonObj.marketData["/items/advanced_task_badge"] = { 0: { a: 0, b: 0 } };
      jsonObj.marketData["/items/expert_task_badge"] = { 0: { a: 0, b: 0 } };
      if (isSave) {
        console.log(jsonObj);
        localStorage.setItem("MWITools_marketAPI_timestamp", Date.now());
        localStorage.setItem("MWITools_marketAPI_json", JSON.stringify(jsonObj));
      }
      return jsonObj;
    } else {
      console.error("validateMarketJson invalid json structure");
      return null;
    }
  }
  async function fetchMarketJSON(forceFetch = false) {
    if (!forceFetch && localStorage.getItem("MWITools_marketAPI_timestamp") && Date.now() - localStorage.getItem("MWITools_marketAPI_timestamp") < 36e5) {
      return JSON.parse(localStorage.getItem("MWITools_marketAPI_json"));
    }
    const sendRequest = typeof GM.xmlHttpRequest === "function" ? GM.xmlHttpRequest : typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null;
    if (typeof sendRequest != "function") {
      console.error("fetchMarketJSON null GM xmlHttpRequest function");
      if (!runtime.state.isUsingExpiredMarketJson) {
        runtime.state.reasonForUsingExpiredMarketJson += (/* @__PURE__ */ new Date()).toUTCString() + " Setting isUsingExpiredMarketJson to true:\n";
        runtime.state.reasonForUsingExpiredMarketJson += "GM_xmlhttpRequest " + typeof GM_xmlhttpRequest + "\n";
        runtime.state.reasonForUsingExpiredMarketJson += "GM.xmlHttpRequest " + typeof GM.xmlHttpRequest + "\n";
      }
      runtime.state.isUsingExpiredMarketJson = true;
      const alertDiv2 = document.querySelector("div#script_api_fail_alert");
      if (alertDiv2) {
        alertDiv2.style.display = "block";
      }
      runtime.state.reasonForUsingExpiredMarketJson += "\nusing hard-coded backup version\n";
      const jsonStr2 = runtime.data.MARKET_JSON_LOCAL_BACKUP;
      return validateMarketJsonFetch(jsonStr2, false);
    }
    console.log("fetchMarketJSON fetch start");
    runtime.state.reasonForUsingExpiredMarketJson += (/* @__PURE__ */ new Date()).toUTCString() + " fetch start \n";
    const response = await sendRequest({
      url: runtime.config.MARKET_API_URL,
      method: "GET",
      synchronous: true,
      timeout: 5e3,
      onload: (response2) => {
        if (response2.status == 200) {
          console.log("fetchMarketJSON fetch success 200");
          runtime.state.reasonForUsingExpiredMarketJson += (/* @__PURE__ */ new Date()).toUTCString() + " fetch onload 200 \n";
        } else {
          console.error(
            "fetchMarketJSON fetch onload with HTTP status failure " + response2.status
          );
          runtime.state.reasonForUsingExpiredMarketJson += (/* @__PURE__ */ new Date()).toUTCString() + " fetch onload NOT 200 \n";
        }
      },
      onabort: () => {
        console.error("fetchMarketJSON fetch onabort");
        runtime.state.reasonForUsingExpiredMarketJson += (/* @__PURE__ */ new Date()).toUTCString() + " fetch onabort \n";
      },
      onerror: () => {
        console.error("fetchMarketJSON fetch onerror");
        runtime.state.reasonForUsingExpiredMarketJson += (/* @__PURE__ */ new Date()).toUTCString() + " fetch onerror \n";
      },
      ontimeout: () => {
        console.error("fetchMarketJSON fetch ontimeout");
        runtime.state.reasonForUsingExpiredMarketJson += (/* @__PURE__ */ new Date()).toUTCString() + " fetch ontimeout \n";
      }
    });
    console.log(
      "fetchMarketJSON fetch end with response status: " + response?.status
    );
    runtime.state.reasonForUsingExpiredMarketJson += (/* @__PURE__ */ new Date()).toUTCString() + " fetch end with response status " + response?.status + "\n";
    let jsonStr = response?.status === 200 ? response.responseText : null;
    let jsonObj = validateMarketJsonFetch(jsonStr, true);
    if (jsonObj) {
      runtime.state.isUsingExpiredMarketJson = false;
      runtime.state.reasonForUsingExpiredMarketJson = "";
      const alertDiv2 = document.querySelector("div#script_api_fail_alert");
      if (alertDiv2) {
        alertDiv2.style.display = "none";
      }
      return jsonObj;
    }
    runtime.state.isUsingExpiredMarketJson = true;
    runtime.state.reasonForUsingExpiredMarketJson += (/* @__PURE__ */ new Date()).toUTCString() + " Setting isUsingExpiredMarketJson to true:\n";
    runtime.state.reasonForUsingExpiredMarketJson += "Failed fetch";
    const alertDiv = document.querySelector("div#script_api_fail_alert");
    if (alertDiv) {
      alertDiv.style.display = "block";
    }
    if (localStorage.getItem("MWITools_marketAPI_json") && localStorage.getItem("MWITools_marketAPI_timestamp") && JSON.parse(runtime.data.MARKET_JSON_LOCAL_BACKUP).timestamp * 1e3 < localStorage.getItem("MWITools_marketAPI_timestamp")) {
      console.error(
        "fetchMarketJSON network error, using previously fetched version"
      );
      const jsonStr2 = localStorage.getItem("MWITools_marketAPI_json");
      const jsonObj2 = validateMarketJsonFetch(jsonStr2, false);
      if (jsonObj2) {
        runtime.state.reasonForUsingExpiredMarketJson += "\nusing previously fetched version\n";
        return jsonObj2;
      }
    }
    runtime.state.reasonForUsingExpiredMarketJson += "\nusing hard-coded backup version\n";
    return validateMarketJsonFetch(runtime.data.MARKET_JSON_LOCAL_BACKUP, false);
  }
  function numberFormatter(num, digits = 1) {
    if (num === null || num === void 0) {
      return null;
    }
    if (num < 0) {
      return "-" + numberFormatter(-num);
    }
    const lookup = [
      { value: 1, symbol: "" },
      { value: 1e3, symbol: "k" },
      { value: 1e6, symbol: "M" }
    ];
    if (!runtime.settings.settingsMap.displayCapMM.isTrue) {
      lookup.push({ value: 1e9, symbol: "B" });
    }
    const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    var item = lookup.slice().reverse().find(function(item2) {
      return num >= item2.value;
    });
    return item ? (num / item.value).toFixed(digits).replace(rx, "$1") + item.symbol : "0";
  }
  function getActionHridFromItemName(name) {
    let newName = name.replace("Milk", "Cow");
    newName = newName.replace("Log", "Tree");
    newName = newName.replace("Cowing", "Milking");
    newName = newName.replace("Rainbow Cow", "Unicow");
    newName = newName.replace("Collector's Boots", "Collectors Boots");
    newName = newName.replace("Knight's Aegis", "Knights Aegis");
    if (!runtime.state.initData_actionDetailMap) {
      console.error(
        "getActionHridFromItemName no initData_actionDetailMap: " + name
      );
      return null;
    }
    for (const action of Object.values(runtime.state.initData_actionDetailMap)) {
      if (action.name === newName) {
        return action.hrid;
      }
    }
    return null;
  }
  Object.assign(runtime.api, {
    showTotalActionTime,
    calculateTotalTime,
    timeReadable,
    getToolsSpeedBuffByActionHrid,
    getItemEffiBuffByActionHrid,
    getHousesEffBuffByActionHrid,
    getTeaBuffsByActionHrid,
    handleTooltipItem,
    validateMarketJsonFetch,
    fetchMarketJSON,
    numberFormatter,
    getActionHridFromItemName
  });
  Object.defineProperties(runtime.state, {
    tooltipObserver: {
      enumerable: true,
      get() {
        return tooltipObserver;
      }
    }
  });
  Object.defineProperties(runtime.data, {
    actionHridToToolsSpeedBuffNamesMap: {
      enumerable: true,
      get() {
        return actionHridToToolsSpeedBuffNamesMap;
      }
    },
    actionHridToHouseNamesMap: {
      enumerable: true,
      get() {
        return actionHridToHouseNamesMap;
      }
    },
    itemEnhanceLevelToBuffBonusMap: {
      enumerable: true,
      get() {
        return itemEnhanceLevelToBuffBonusMap;
      }
    }
  });
  runtime.registerStart("features/item-tooltips.js", () => {
    GM_addStyle(`div.Header_actionName__31-L2 {
    overflow: visible !important;
    white-space: normal !important;
    height: auto !important;
  }`);
    GM_addStyle(`span.NavigationBar_label__1uH-y {
    width: 10px !important;
  }`);
    tooltipObserver.observe(document.body, {
      attributes: false,
      childList: true,
      characterData: false
    });
  });

  // src/features/action-panel.js
  var waitForActionPanelParent = () => {
    const targetNode = document.querySelector("div.GamePage_mainPanel__2njyb");
    if (targetNode) {
      console.log("start observe action panel");
      const actionPanelObserver = new MutationObserver(async function(mutations) {
        for (const mutation of mutations) {
          for (const added of mutation.addedNodes) {
            if (added?.classList?.contains("Modal_modalContainer__3B80m") && added.querySelector("div.SkillActionDetail_regularComponent__3oCgr")) {
              handleActionPanel(
                added.querySelector(
                  "div.SkillActionDetail_regularComponent__3oCgr"
                )
              );
            }
          }
        }
      });
      actionPanelObserver.observe(targetNode, {
        attributes: false,
        childList: true,
        subtree: true
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
      return;
    }
    let actionName = runtime.api.getOriTextFromElement(
      panel.querySelector("div.SkillActionDetail_name__3erHV")
    );
    if (runtime.config.isZHInGameSetting) {
      actionName = runtime.api.getActionEnNameFromZhName(actionName);
    }
    const exp = Number(
      runtime.api.getOriTextFromElement(
        panel.querySelector("div.SkillActionDetail_expGain__F5xHu")
      ).replaceAll(runtime.config.THOUSAND_SEPERATOR, "").replaceAll(runtime.config.DECIMAL_SEPERATOR, ".")
    );
    const elems = panel.querySelectorAll("div.SkillActionDetail_value__dQjYH");
    const duration = Number(
      runtime.api.getOriTextFromElement(elems[elems.length - 2]).replaceAll(runtime.config.THOUSAND_SEPERATOR, "").replaceAll(runtime.config.DECIMAL_SEPERATOR, ".").replace("s", "")
    );
    const inputElem = panel.querySelector(
      "div.SkillActionDetail_maxActionCountInput__1C0Pw input"
    );
    const actionHrid = runtime.state.initData_actionDetailMap[runtime.api.getActionHridFromItemName(actionName)].hrid;
    const effBuff = 1 + getTotalEffiPercentage(actionHrid, false) / 100;
    let hTMLStr = `<div id="showTotalTime" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-align: left;">${getTotalTimeStr(
      inputElem.value,
      duration,
      effBuff
    )}</div>`;
    const gatherDiv = inputElem.parentNode.parentNode.parentNode;
    gatherDiv.insertAdjacentHTML("afterend", hTMLStr);
    const showTotalTimeDiv = panel.querySelector("div#showTotalTime");
    panel.addEventListener("click", function(evt) {
      setTimeout(() => {
        showTotalTimeDiv.textContent = getTotalTimeStr(
          inputElem.value,
          duration,
          effBuff
        );
      }, 50);
    });
    inputElem.addEventListener("keyup", function(evt) {
      if (inputElem.value.toLowerCase().includes("k") || inputElem.value.toLowerCase().includes("m")) {
        reactInputTriggerHack(
          inputElem,
          inputElem.value.toLowerCase().replaceAll("k", "000").replaceAll("m", "000000")
        );
      }
      showTotalTimeDiv.textContent = getTotalTimeStr(
        inputElem.value,
        duration,
        effBuff
      );
    });
    let appendAfterElem = showTotalTimeDiv;
    if (runtime.settings.settingsMap.actionPanel_totalTime_quickInputs.isTrue) {
      hTMLStr = `<div id="quickInputHourButtons" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-align: left; display:flex;">${runtime.config.isZH ? "做 " : "Do "}</div>`;
      showTotalTimeDiv.insertAdjacentHTML("afterend", hTMLStr);
      const quickInputHourButtonsDiv = panel.querySelector(
        "div#quickInputHourButtons"
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
            Math.round(value * 60 * 60 * effBuff / duration)
          );
        };
        quickInputHourButtonsDiv.append(btn);
      }
      quickInputHourButtonsDiv.append(
        document.createTextNode(runtime.config.isZH ? " 小时" : " hours")
      );
      hTMLStr = `<div id="quickInputCountButtons" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-align: left; display:flex;">${runtime.config.isZH ? "做 " : "Do "}</div>`;
      quickInputHourButtonsDiv.insertAdjacentHTML("afterend", hTMLStr);
      const quickInputCountButtonsDiv = panel.querySelector(
        "div#quickInputCountButtons"
      );
      const presetTimes = [10, 100, 300, 500, 1e3, 2e3];
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
        document.createTextNode(runtime.config.isZH ? " 次" : " times")
      );
      appendAfterElem = quickInputCountButtonsDiv;
    }
    const skillHrid = runtime.state.initData_actionDetailMap[runtime.api.getActionHridFromItemName(actionName)].experienceGain.skillHrid;
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
      const calculateNeedToLevel = (currentLevel2, targetLevel, effBuff2, duration2, exp2) => {
        let needTotalTimeSec = 0;
        let needTotalNumOfActions = 0;
        for (let level = currentLevel2; level < targetLevel; level++) {
          let needExpToNextLevel = null;
          if (level === currentLevel2) {
            needExpToNextLevel = runtime.state.initData_levelExperienceTable[level + 1] - currentExp;
          } else {
            needExpToNextLevel = runtime.state.initData_levelExperienceTable[level + 1] - runtime.state.initData_levelExperienceTable[level];
          }
          const extraLevelEffBuff = (level - currentLevel2) * 0.01;
          const needNumOfActionsToNextLevel = Math.round(
            needExpToNextLevel / exp2
          );
          needTotalNumOfActions += needNumOfActionsToNextLevel;
          needTotalTimeSec += needNumOfActionsToNextLevel / (effBuff2 + extraLevelEffBuff) * duration2;
        }
        return { numOfActions: needTotalNumOfActions, timeSec: needTotalTimeSec };
      };
      const need = calculateNeedToLevel(
        currentLevel,
        currentLevel + 1,
        effBuff,
        duration,
        exp
      );
      hTMLStr = `<div id="tillLevel" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-align: left;">${runtime.config.isZH ? "到 " : "To reach level "}<input id="tillLevelInput" type="number" value="${currentLevel + 1}" min="${currentLevel + 1}" max="200">${runtime.config.isZH ? " 级还需做 " : ", need to do "}<span id="tillLevelNumber">${need.numOfActions}${runtime.config.isZH ? " 次" : " times "}[${runtime.api.timeReadable(need.timeSec)}]${runtime.config.isZH ? " (刷新网页更新当前等级)" : " (Refresh page to update current level)"}</span></div>`;
      appendAfterElem.insertAdjacentHTML("afterend", hTMLStr);
      const tillLevelInput = panel.querySelector("input#tillLevelInput");
      const tillLevelNumber = panel.querySelector("span#tillLevelNumber");
      tillLevelInput.onchange = () => {
        const targetLevel = Number(tillLevelInput.value);
        if (targetLevel > currentLevel && targetLevel <= 200) {
          const need2 = calculateNeedToLevel(
            currentLevel,
            targetLevel,
            effBuff,
            duration,
            exp
          );
          tillLevelNumber.textContent = `${need2.numOfActions}${runtime.config.isZH ? " 次" : " times "}[${runtime.api.timeReadable(need2.timeSec)}]${runtime.config.isZH ? " (刷新网页更新当前等级)" : " (Refresh page to update current level)"}`;
        } else {
          tillLevelNumber.textContent = "Error";
        }
      };
      tillLevelInput.addEventListener("keyup", function(evt) {
        const targetLevel = Number(tillLevelInput.value);
        if (targetLevel > currentLevel && targetLevel <= 200) {
          const need2 = calculateNeedToLevel(
            currentLevel,
            targetLevel,
            effBuff,
            duration,
            exp
          );
          tillLevelNumber.textContent = `${need2.numOfActions}${runtime.config.isZH ? " 次" : " times "}[${runtime.api.timeReadable(need2.timeSec)}]${runtime.config.isZH ? " (刷新网页更新当前等级)" : " (Refresh page to update current level)"}`;
        } else {
          tillLevelNumber.textContent = "Error";
        }
      });
    }
    panel.querySelector("div#tillLevel").insertAdjacentHTML(
      "afterend",
      `<div id="expPerHour" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-align: left;">${runtime.config.isZH ? "每小时经验: " : "Exp/hour: "}${runtime.api.numberFormatter(
        Math.round(3600 / duration * exp * effBuff)
      )} (+${Number((effBuff - 1) * 100).toFixed(1)}%${runtime.config.isZH ? "效率" : " eff"})</div>`
    );
    if (panel.querySelector("div.SkillActionDetail_dropTable__3ViVp").children.length > 1 && runtime.settings.settingsMap.actionPanel_foragingTotal.isTrue) {
      const marketJson = await runtime.api.fetchMarketJSON();
      const actionHrid2 = "/actions/foraging/" + actionName.toLowerCase().replaceAll(" ", "_");
      const teaBuffs = runtime.api.getTeaBuffsByActionHrid(actionHrid2);
      let drinksConsumedPerHourAskPrice = 0;
      let drinksConsumedPerHourBidPrice = 0;
      const drinksList = runtime.state.initData_actionTypeDrinkSlotsMap[runtime.state.initData_actionDetailMap[actionHrid2].type];
      for (const drink of drinksList) {
        if (!drink || !drink.itemHrid) {
          continue;
        }
        drinksConsumedPerHourAskPrice += (marketJson?.marketData[drink.itemHrid]?.[0].a ?? 0) * 12;
        drinksConsumedPerHourBidPrice += (marketJson?.marketData[drink.itemHrid]?.[0].b ?? 0) * 12;
      }
      const baseTimePerActionSec = runtime.state.initData_actionDetailMap[actionHrid2].baseTimeCost / 1e9;
      const toolPercent = runtime.api.getToolsSpeedBuffByActionHrid(actionHrid2);
      const actualTimePerActionSec = baseTimePerActionSec / (1 + toolPercent / 100);
      let actionPerHour = 3600 / actualTimePerActionSec;
      const dropTable = runtime.state.initData_actionDetailMap[actionHrid2].dropTable;
      let virtualItemBid = 0;
      for (const drop of dropTable) {
        const bid = marketJson?.marketData[drop.itemHrid]?.[0].b;
        const amount = drop.dropRate * ((drop.minCount + drop.maxCount) / 2);
        virtualItemBid += bid * amount;
      }
      let droprate = 1;
      let itemPerHour = actionPerHour * droprate;
      const requiredLevel = runtime.state.initData_actionDetailMap[actionHrid2].levelRequirement.level;
      let currentLevel2 = requiredLevel;
      for (const skill of runtime.state.initData_characterSkills) {
        if (skill.skillHrid === runtime.state.initData_actionDetailMap[actionHrid2].levelRequirement.skillHrid) {
          currentLevel2 = skill.level;
          break;
        }
      }
      const levelEffBuff = currentLevel2 - requiredLevel > 0 ? currentLevel2 - requiredLevel : 0;
      const houseEffBuff = runtime.api.getHousesEffBuffByActionHrid(actionHrid2);
      const itemEffiBuff = Number(
        runtime.api.getItemEffiBuffByActionHrid(actionHrid2)
      );
      actionPerHour *= 1 + (levelEffBuff + houseEffBuff + teaBuffs.efficiency + itemEffiBuff) / 100;
      itemPerHour *= 1 + (levelEffBuff + houseEffBuff + teaBuffs.efficiency + itemEffiBuff) / 100;
      const extraFreeItemPerHour = itemPerHour * teaBuffs.quantity / 100;
      const bidAfterTax = virtualItemBid * 0.98;
      const profitPerHour = itemPerHour * bidAfterTax + extraFreeItemPerHour * bidAfterTax - drinksConsumedPerHourAskPrice;
      let htmlStr = `<div id="totalProfit"  style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-align: left;">${runtime.config.isZH ? "综合利润: " : "Overall profit: "}${runtime.api.numberFormatter(profitPerHour)}${runtime.config.isZH ? "/小时" : "/hour"}, ${runtime.api.numberFormatter(24 * profitPerHour)}${runtime.config.isZH ? "/天" : "/day"}</div>`;
      panel.querySelector("div#expPerHour").insertAdjacentHTML("afterend", htmlStr);
    }
  }
  function getTotalEffiPercentage(actionHrid, debug = false) {
    if (debug) {
      console.log("----- getTotalEffiPercentage " + actionHrid);
    }
    const requiredLevel = runtime.state.initData_actionDetailMap[actionHrid].levelRequirement.level;
    let currentLevel = requiredLevel;
    for (const skill of runtime.state.initData_characterSkills) {
      if (skill.skillHrid === runtime.state.initData_actionDetailMap[actionHrid].levelRequirement.skillHrid) {
        currentLevel = skill.level;
        break;
      }
    }
    const levelEffBuff = currentLevel - requiredLevel > 0 ? currentLevel - requiredLevel : 0;
    if (debug) {
      console.log("等级碾压 " + levelEffBuff);
    }
    const houseEffBuff = runtime.api.getHousesEffBuffByActionHrid(actionHrid);
    if (debug) {
      console.log("房子 " + houseEffBuff);
    }
    const teaBuffs = runtime.api.getTeaBuffsByActionHrid(actionHrid);
    if (debug) {
      console.log("茶 " + teaBuffs.efficiency);
    }
    const itemEffiBuff = runtime.api.getItemEffiBuffByActionHrid(actionHrid);
    if (debug) {
      console.log("特殊装备 " + itemEffiBuff);
    }
    const total = levelEffBuff + houseEffBuff + teaBuffs.efficiency + Number(itemEffiBuff);
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
    return "[" + runtime.api.timeReadable(Math.round(input / effBuff) * duration) + "]";
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
  var waitForProgressBar = () => {
    const elements = document.querySelectorAll(
      ".NavigationBar_currentExperience__3GDeX"
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
          "span.NavigationBar_level__3C7eR"
        ).style.width = "auto";
        const insertParent = element.parentNode.parentNode.children[0];
        insertParent.insertBefore(span, insertParent.children[1]);
      });
    } else {
      setTimeout(waitForProgressBar, 200);
    }
  };
  var removeInsertedDivs = () => document.querySelectorAll("span.insertedSpan").forEach((div) => div.parentNode.removeChild(div));
  Object.assign(runtime.api, {
    waitForActionPanelParent,
    handleActionPanel,
    getTotalEffiPercentage,
    getTotalTimeStr,
    reactInputTriggerHack,
    waitForProgressBar,
    removeInsertedDivs
  });
  runtime.registerStart("features/action-panel.js", () => {
    if (runtime.settings.settingsMap.expPercentage.isTrue) {
      window.setInterval(() => {
        removeInsertedDivs();
        waitForProgressBar();
      }, 1e3);
    }
  });

  // src/features/game-widgets.js
  async function handleBattleSummary(message) {
    const marketJson = await runtime.api.fetchMarketJSON();
    let hasMarketJson = true;
    if (!marketJson) {
      console.error("handleBattleSummary null marketAPI");
      hasMarketJson = false;
    }
    let totalPriceAsk = 0;
    let totalPriceAskBid = 0;
    let totalRawCoins = 0;
    if (hasMarketJson && message.unit.totalLootMap) {
      for (const loot of Object.values(message.unit.totalLootMap)) {
        const itemCount = loot.count;
        if (loot.itemHrid === "/items/coin") {
          totalRawCoins += itemCount;
        }
        if (marketJson.marketData[loot.itemHrid]) {
          totalPriceAsk += marketJson.marketData[loot.itemHrid][0].a * itemCount;
          totalPriceAskBid += marketJson.marketData[loot.itemHrid][0].b * itemCount;
        } else {
          console.log(
            "handleBattleSummary failed to read price of " + loot.itemHrid
          );
        }
      }
    }
    let totalSkillsExp = 0;
    if (message.unit.totalSkillExperienceMap) {
      for (const exp of Object.values(message.unit.totalSkillExperienceMap)) {
        totalSkillsExp += exp;
      }
    }
    let tryTimes = 0;
    findElem();
    function findElem() {
      tryTimes++;
      let elem = document.querySelector(
        ".BattlePanel_gainedExp__3SaCa"
      )?.parentElement;
      if (elem) {
        let battleDurationSec = null;
        const combatInfoElement = document.querySelector(
          ".BattlePanel_combatInfo__sHGCe"
        );
        if (combatInfoElement) {
          let matches = combatInfoElement.innerHTML.match(
            /(战斗时间|战斗时长|Combat Duration): (?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s).*?(交战|战斗|Battles): (\d+).*?(战败|死亡次数|Deaths): (\d+)/
          );
          if (matches) {
            let days = parseInt(matches[2], 10) || 0;
            let hours = parseInt(matches[3], 10) || 0;
            let minutes = parseInt(matches[4], 10) || 0;
            let seconds = parseInt(matches[5], 10) || 0;
            let battles = parseInt(matches[7], 10) - 1;
            battleDurationSec = days * 86400 + hours * 3600 + minutes * 60 + seconds;
            let efficiencyPerHour = (battles / battleDurationSec * 3600).toFixed(1);
            elem.insertAdjacentHTML(
              "beforeend",
              `<div id="script_battleNumbers" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "每小时战斗: " : "Encounters/hour: "}${efficiencyPerHour}${runtime.config.isZH ? " 次" : ""}</div>`
            );
          }
        }
        document.querySelector("div#script_battleNumbers").insertAdjacentHTML(
          "afterend",
          `<div id="script_totalIncome" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "总收获: " : "Total revenue: "}${runtime.api.numberFormatter(
            totalPriceAsk
          )} / ${runtime.api.numberFormatter(totalPriceAskBid)}</div>`
        );
        if (battleDurationSec) {
          document.querySelector("div#script_totalIncome").insertAdjacentHTML(
            "afterend",
            `<div id="script_averageIncome" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "每小时收获: " : "Revenue/hour: "}${runtime.api.numberFormatter(totalPriceAsk / (battleDurationSec / 60 / 60))} / ${runtime.api.numberFormatter(
              totalPriceAskBid / (battleDurationSec / 60 / 60)
            )}</div>`
          );
          document.querySelector("div#script_averageIncome").insertAdjacentHTML(
            "afterend",
            `<div id="script_totalIncomeDay" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "每天收获: " : "Revenue/day: "}${runtime.api.numberFormatter(totalPriceAsk / (battleDurationSec / 60 / 60) * 24)} / ${runtime.api.numberFormatter(
              totalPriceAskBid / (battleDurationSec / 60 / 60) * 24
            )}</div>`
          );
          document.querySelector("div#script_totalIncomeDay").insertAdjacentHTML(
            "afterend",
            `<div id="script_avgRawCoinHour" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "每小时仅金币收获: " : "Raw coins/hour: "}${runtime.api.numberFormatter(totalRawCoins / (battleDurationSec / 60 / 60))}</div>`
          );
        }
        document.querySelector("div#script_avgRawCoinHour").insertAdjacentHTML(
          "afterend",
          `<div id="script_totalSkillsExp" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "总经验: " : "Total exp: "}${runtime.api.numberFormatter(
            totalSkillsExp
          )}</div>`
        );
        if (battleDurationSec) {
          document.querySelector("div#script_totalSkillsExp").insertAdjacentHTML(
            "afterend",
            `<div id="script_averageSkillsExp" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "每小时总经验: " : "Total exp/hour: "}${runtime.api.numberFormatter(totalSkillsExp / (battleDurationSec / 60 / 60))}</div>`
          );
          [
            { skillHrid: "/skills/magic", zhName: "魔法", enName: "Magic" },
            { skillHrid: "/skills/ranged", zhName: "远程", enName: "Ranged" },
            { skillHrid: "/skills/defense", zhName: "防御", enName: "Defense" },
            { skillHrid: "/skills/melee", zhName: "近战", enName: "Melee" },
            { skillHrid: "/skills/attack", zhName: "攻击", enName: "Attack" },
            {
              skillHrid: "/skills/intelligence",
              zhName: "智力",
              enName: "Intelligence"
            },
            { skillHrid: "/skills/stamina", zhName: "耐力", enName: "Stamina" }
          ].forEach((skill) => {
            const expGained = message.unit.totalSkillExperienceMap[skill.skillHrid];
            if (expGained) {
              document.querySelector("div#script_totalSkillsExp").insertAdjacentHTML(
                "afterend",
                `<div style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "每小时" : ""}${runtime.config.isZH ? skill.zhName : skill.enName}${runtime.config.isZH ? "经验: " : " exp/hour: "}${runtime.api.numberFormatter(expGained / (battleDurationSec / 60 / 60))}</div>`
              );
            }
          });
        } else {
          console.error(
            "handleBattleSummary unable to display average exp due to null battleDurationSec"
          );
        }
      } else if (tryTimes <= 10) {
        setTimeout(findElem, 200);
      } else {
        console.error("handleBattleSummary: Elem not found after 10 tries.");
      }
    }
  }
  function addItemLevels() {
    const iconDivs = document.querySelectorAll(
      "div.Item_itemContainer__x7kH1 div.Item_item__2De2O.Item_clickable__3viV6"
    );
    for (const div of iconDivs) {
      if (div.querySelector("div.Item_name__2C42x")) {
        continue;
      }
      const href = div.querySelector("use").getAttribute("href");
      const hrefName = href.split("#")[1];
      const itemHrid = "/items/" + hrefName;
      const itemLevel = runtime.state.initData_itemDetailMap[itemHrid]?.itemLevel;
      const itemAbilityLevel = runtime.state.initData_itemDetailMap[itemHrid]?.abilityBookDetail?.levelRequirements?.[0]?.level;
      if (runtime.state.initData_itemDetailMap[itemHrid]?.equipmentDetail && itemLevel && itemLevel > 0) {
        if (!div.querySelector("div.script_itemLevel")) {
          div.style.position = "relative";
          div.insertAdjacentHTML(
            "beforeend",
            `<div class="script_itemLevel" style="z-index: 1; position: absolute; top: 2px; right: 2px; text-align: right; color: ${runtime.config.SCRIPT_COLOR_MAIN};">${itemLevel}</div>`
          );
        }
        if (!runtime.state.initData_itemDetailMap[itemHrid]?.equipmentDetail?.type?.includes("_tool") && div.parentElement.parentElement.parentElement.parentElement.className.includes(
          "MarketplacePanel_marketItems__D4k7e"
        )) {
          handleMarketItemFilter(
            div,
            runtime.state.initData_itemDetailMap[itemHrid]
          );
        }
      } else if (itemAbilityLevel && itemAbilityLevel > 0) {
        if (!div.querySelector("div.script_itemLevel")) {
          div.style.position = "relative";
          div.insertAdjacentHTML(
            "beforeend",
            `<div class="script_itemLevel" style="z-index: 1; position: absolute; top: 2px; right: 2px; text-align: right; color: ${runtime.config.SCRIPT_COLOR_MAIN};">${itemAbilityLevel}</div>`
          );
        }
      } else if (runtime.settings.settingsMap.showsKeyInfoInIcon.isTrue && (itemHrid.includes("_key_fragment") || itemHrid.includes("_key"))) {
        const map = /* @__PURE__ */ new Map();
        map.set("/items/blue_key_fragment", runtime.config.isZH ? "图3" : "Z3");
        map.set("/items/green_key_fragment", runtime.config.isZH ? "图4" : "Z4");
        map.set("/items/purple_key_fragment", runtime.config.isZH ? "图5" : "Z5");
        map.set("/items/white_key_fragment", runtime.config.isZH ? "图6" : "Z6");
        map.set("/items/orange_key_fragment", runtime.config.isZH ? "图7" : "Z7");
        map.set("/items/brown_key_fragment", runtime.config.isZH ? "图8" : "Z8");
        map.set("/items/stone_key_fragment", runtime.config.isZH ? "图9" : "Z9");
        map.set("/items/dark_key_fragment", runtime.config.isZH ? "图10" : "Z10");
        map.set(
          "/items/burning_key_fragment",
          runtime.config.isZH ? "图11" : "Z11"
        );
        map.set(
          "/items/chimerical_entry_key",
          runtime.config.isZH ? "牢1" : "D1"
        );
        map.set("/items/sinister_entry_key", runtime.config.isZH ? "牢2" : "D2");
        map.set("/items/enchanted_entry_key", runtime.config.isZH ? "牢3" : "D3");
        map.set("/items/pirate_entry_key", runtime.config.isZH ? "牢4" : "D4");
        map.set("/items/chimerical_chest_key", "3.4.5.6");
        map.set("/items/sinister_chest_key", "5.7.8.10");
        map.set("/items/enchanted_chest_key", "7.8.9.11");
        map.set("/items/pirate_chest_key", "6.9.10.11");
        if (!div.querySelector("div.script_key")) {
          div.style.position = "relative";
          div.insertAdjacentHTML(
            "beforeend",
            `<div class="script_key" style="z-index: 1; position: absolute; top: 2px; right: 2px; text-align: right; color: ${runtime.config.SCRIPT_COLOR_MAIN};">${map.get(
              itemHrid
            )}</div>`
          );
        }
      }
    }
  }
  var onlyShowItemsAboveLevel = 1;
  var onlyShowItemsBelowLevel = 1e3;
  var onlyShowItemsType = "all";
  var onlyShowItemsSkillReq = "all";
  function addMarketFilterButtons() {
    const oriFilter = document.querySelector(
      ".MarketplacePanel_itemFilterContainer__3F3td"
    );
    let filters = document.querySelector("#script_filters");
    if (oriFilter && !filters) {
      oriFilter.insertAdjacentHTML(
        "afterend",
        `<div id="script_filters" style="float: left; color: ${runtime.config.SCRIPT_COLOR_MAIN};"></div>`
      );
      filters = document.querySelector("#script_filters");
      filters.insertAdjacentHTML(
        "beforeend",
        `<span id="script_filter_level" style="float: left; color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "等级: 大于等于 " : "Equipment level: >= "}
            <select name="script_filter_level_select" id="script_filter_level_select">
            <option value="1">All</option>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="30">30</option>
            <option value="40">40</option>
            <option value="50">50</option>
            <option value="60">60</option>
            <option value="65">65</option>
            <option value="70">70</option>
            <option value="75">75</option>
            <option value="80">80</option>
            <option value="85">85</option>
            <option value="90">90</option>
            <option value="95">95</option>
            <option value="100">100</option>
        </select>&nbsp;</span>`
      );
      filters.insertAdjacentHTML(
        "beforeend",
        `<span id="script_filter_level_to" style="float: left; color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "小于 " : "< "}
            <select name="script_filter_level_select_to" id="script_filter_level_select_to">
            <option value="1000">All</option>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="30">30</option>
            <option value="40">40</option>
            <option value="50">50</option>
            <option value="60">60</option>
            <option value="65">65</option>
            <option value="70">70</option>
            <option value="75">75</option>
            <option value="80">80</option>
            <option value="85">85</option>
            <option value="90">90</option>
            <option value="95">95</option>
            <option value="100">100</option>
        </select>&emsp;</span>`
      );
      filters.insertAdjacentHTML(
        "beforeend",
        `<span id="script_filter_skill" style="float: left; color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "职业: " : "Class: "}
            <select name="script_filter_skill_select" id="script_filter_skill_select">
                <option value="all">All</option>
                <option value="attack">Attack</option>
                <option value="melee">Melee</option>
                <option value="defense">Defense</option>
                <option value="ranged">Ranged</option>
                <option value="magic">Magic</option>
                <option value="others">Others</option>
            </select>&emsp;</span>`
      );
      filters.insertAdjacentHTML(
        "beforeend",
        `<span id="script_filter_location" style="float: left; color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "部位: " : "Slot: "}
            <select name="script_filter_location_select" id="script_filter_location_select">
                <option value="all">All</option>
                <option value="main_hand">Main Hand</option>
                <option value="off_hand">Off Hand</option>
                <option value="two_hand">Two Hand</option>
                <option value="head">Head</option>
                <option value="body">Body</option>
                <option value="hands">Hands</option>
                <option value="legs">Legs</option>
                <option value="feet">Feet</option>
                <option value="neck">Neck</option>
                <option value="earrings">Earrings</option>
                <option value="ring">Ring</option>
                <option value="pouch">Pouch</option>
                <option value="back">Back</option>
            </select>&emsp;</span>`
      );
      const levelFilter = document.querySelector("#script_filter_level_select");
      levelFilter.addEventListener("change", function() {
        if (levelFilter.value && !isNaN(levelFilter.value)) {
          onlyShowItemsAboveLevel = Number(levelFilter.value);
        }
      });
      const levelToFilter = document.querySelector(
        "#script_filter_level_select_to"
      );
      levelToFilter.addEventListener("change", function() {
        if (levelToFilter.value && !isNaN(levelToFilter.value)) {
          onlyShowItemsBelowLevel = Number(levelToFilter.value);
        }
      });
      const skillFilter = document.querySelector("#script_filter_skill_select");
      skillFilter.addEventListener("change", function() {
        if (skillFilter.value) {
          onlyShowItemsSkillReq = skillFilter.value;
        }
      });
      const locationFilter = document.querySelector(
        "#script_filter_location_select"
      );
      locationFilter.addEventListener("change", function() {
        if (locationFilter.value) {
          onlyShowItemsType = locationFilter.value;
        }
      });
    }
  }
  function handleMarketItemFilter(div, itemDetal) {
    if (!itemDetal.equipmentDetail) {
      return;
    }
    const itemLevel = itemDetal.itemLevel;
    const type = itemDetal.equipmentDetail.type;
    const levelRequirements = itemDetal.equipmentDetail.levelRequirements;
    let isType = false;
    isType = type && type.includes(onlyShowItemsType);
    if (onlyShowItemsType === "all") {
      isType = true;
    }
    let isRequired = false;
    for (const requirement of levelRequirements) {
      if (requirement.skillHrid.includes(onlyShowItemsSkillReq)) {
        isRequired = true;
      }
    }
    if (onlyShowItemsSkillReq === "others") {
      const combatTypes = ["attack", "melee", "defense", "ranged", "magic"];
      isRequired = !combatTypes.some((type2) => {
        for (const requirement of levelRequirements) {
          if (requirement.skillHrid.includes(type2)) {
            return true;
          }
        }
      });
    }
    if (onlyShowItemsSkillReq === "all") {
      isRequired = true;
    }
    if (itemLevel >= onlyShowItemsAboveLevel && itemLevel < onlyShowItemsBelowLevel && isType && isRequired) {
      div.style.display = "block";
    } else {
      div.style.display = "none";
    }
  }
  function handleTaskCard() {
    const taskNameDivs = document.querySelectorAll(
      "div.RandomTask_randomTask__3B9fA div.RandomTask_name__1hl1b"
    );
    for (const div of taskNameDivs) {
      if (div.querySelector("span.script_taskMapIndex")) {
        continue;
      }
      const taskStr = runtime.api.getOriTextFromElement(div);
      if (!taskStr.startsWith("Defeat - ") && !taskStr.startsWith("击败 - ")) {
        continue;
      }
      let monsterName = taskStr.replace("Defeat - ", "").replace("击败 - ", "");
      let actionHrid = null;
      if (runtime.config.isZHInGameSetting) {
        actionHrid = (runtime.api.getOthersFromZhName(monsterName) ? runtime.api.getOthersFromZhName(monsterName) : runtime.api.getActionEnNameFromZhName(monsterName))?.replaceAll("/monsters/", "/actions/combat/");
      }
      let actionObj = null;
      for (const action of Object.values(
        runtime.state.initData_actionDetailMap
      )) {
        if (action.hrid.includes("/combat/")) {
          if (action.hrid === actionHrid || action.name.toLowerCase() === monsterName.toLowerCase()) {
            actionObj = action;
            break;
          } else if (action.combatZoneInfo.fightInfo.battlesPerBoss === 10) {
            if (actionHrid?.replaceAll("/actions/combat/", "/monsters/") === action.combatZoneInfo.fightInfo.bossSpawns[0].combatMonsterHrid || "/monsters/" + monsterName.toLowerCase().replaceAll(" ", "_") === action.combatZoneInfo.fightInfo.bossSpawns[0].combatMonsterHrid) {
              actionObj = action;
              break;
            }
          }
        }
      }
      const actionCategoryHrid = actionObj?.category;
      const index = runtime.state.initData_actionCategoryDetailMap?.[actionCategoryHrid]?.sortIndex;
      if (index) {
        div.insertAdjacentHTML(
          "beforeend",
          `<span class="script_taskMapIndex" style="text-align: right; color: ${runtime.config.SCRIPT_COLOR_MAIN};"> ${runtime.config.isZH ? "图" : "Z"}${index}</span>`
        );
      }
    }
  }
  function addIndexToMaps() {
    const buttons = document.querySelectorAll(
      "div.MainPanel_subPanelContainer__1i-H9 div.CombatPanel_tabsComponentContainer__GsQlg div.MuiTabs-root.MuiTabs-vertical.css-6x4ics button.MuiButtonBase-root.MuiTab-root.MuiTab-textColorPrimary.css-1q2h7u5 span.MuiBadge-root.TabsComponent_badge__1Du26.css-1rzb3uu"
    );
    let index = 1;
    for (const button of buttons) {
      if (!button.querySelector("span.script_mapIndex")) {
        button.insertAdjacentHTML(
          "afterbegin",
          `<span class="script_mapIndex" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${index++}. </span>`
        );
      }
    }
  }
  var waitForItemDict = () => {
    const targetNode = document.querySelector("div.GamePage_gamePage__ixiPl");
    if (targetNode) {
      console.log("start observe item dict");
      const itemDictPanelObserver = new MutationObserver(async function(mutations) {
        for (const mutation of mutations) {
          for (const added of mutation.addedNodes) {
            if (added?.classList?.contains("ItemDictionary_modalWrapper__1Ywn2") && added.querySelector("div.ItemDictionary_modalContent__WvEBY")) {
              handleItemDict(
                added.querySelector("div.ItemDictionary_modalContent__WvEBY")
              );
            }
          }
        }
      });
      itemDictPanelObserver.observe(targetNode, {
        attributes: false,
        childList: true,
        subtree: true
      });
    } else {
      setTimeout(waitForItemDict, 200);
    }
  };
  async function handleItemDict(panel) {
    let abilityHrid = null;
    if (runtime.config.isZHInGameSetting) {
      abilityHrid = runtime.api.getOthersFromZhName(
        panel.querySelector("h1.ItemDictionary_title__27cTd").textContent
      );
    } else {
      const itemName = runtime.api.getOriTextFromElement(
        panel.querySelector("h1.ItemDictionary_title__27cTd")
      ).toLowerCase().replaceAll(" ", "_").replaceAll("'", "");
      for (const skillHrid of Object.keys(
        runtime.state.initData_abilityDetailMap
      )) {
        if (skillHrid.includes("/" + itemName)) {
          abilityHrid = skillHrid;
        }
      }
    }
    if (!abilityHrid) {
      return;
    }
    const itemHrid = abilityHrid.replace("/abilities/", "/items/");
    const abilityPerBookExp = runtime.state.initData_itemDetailMap[itemHrid]?.abilityBookDetail?.experienceGain;
    let currentLevel = 0;
    let currentExp = 0;
    for (const a of Object.values(runtime.state.initData_characterAbilities)) {
      if (a.abilityHrid === abilityHrid) {
        currentLevel = a.level;
        currentExp = a.experience;
      }
    }
    const getNeedBooksToLevel = (currentLevel2, currentExp2, targetLevel, abilityPerBookExp2) => {
      const needExp = runtime.state.initData_levelExperienceTable[targetLevel] - currentExp2;
      let needBooks = needExp / abilityPerBookExp2;
      if (currentLevel2 === 0) {
        needBooks += 1;
      }
      return (Math.ceil(needBooks * 10) / 10).toFixed(1);
    };
    let numBooks = getNeedBooksToLevel(
      currentLevel,
      currentExp,
      currentLevel + 1,
      abilityPerBookExp
    );
    const marketAPIJson = await runtime.api.fetchMarketJSON();
    const ask = marketAPIJson.marketData[itemHrid][0].a || 0;
    const bid = marketAPIJson.marketData[itemHrid][0].b || 0;
    let hTMLStr = `<div id="tillLevel" style="color: ${runtime.config.SCRIPT_COLOR_MAIN}; text-align: left;">${runtime.config.isZH ? "到 " : "To "}<input id="tillLevelInput" type="number" value="${currentLevel + 1}" min="${currentLevel + 1}" max="200">${runtime.config.isZH ? " 级还需 " : " level need "}
    <span id="tillLevelNumber">${numBooks} (${runtime.api.numberFormatter(numBooks * ask)} / ${runtime.api.numberFormatter(numBooks * bid)})</span>
    <div>${runtime.config.isZH ? " 本书 (刷新网页更新当前等级)" : " books (Refresh page to update current level.)"}</div>
    </div>`;
    panel.insertAdjacentHTML("beforeend", hTMLStr);
    const tillLevelInput = panel.querySelector("input#tillLevelInput");
    const tillLevelNumber = panel.querySelector("span#tillLevelNumber");
    tillLevelInput.onchange = () => {
      const targetLevel = Number(tillLevelInput.value);
      if (targetLevel > currentLevel && targetLevel <= 200) {
        let numBooks2 = getNeedBooksToLevel(
          currentLevel,
          currentExp,
          targetLevel,
          abilityPerBookExp
        );
        tillLevelNumber.textContent = `${numBooks2} (${runtime.api.numberFormatter(numBooks2 * ask)} / ${runtime.api.numberFormatter(numBooks2 * bid)})`;
      } else {
        tillLevelNumber.textContent = "Error";
      }
    };
    tillLevelInput.addEventListener("keyup", function(evt) {
      const targetLevel = Number(tillLevelInput.value);
      if (targetLevel > currentLevel && targetLevel <= 200) {
        let numBooks2 = getNeedBooksToLevel(
          currentLevel,
          currentExp,
          targetLevel,
          abilityPerBookExp
        );
        tillLevelNumber.textContent = `${numBooks2} (${runtime.api.numberFormatter(numBooks2 * ask)} / ${runtime.api.numberFormatter(numBooks2 * bid)})`;
      } else {
        tillLevelNumber.textContent = "Error";
      }
    });
  }
  Object.assign(runtime.api, {
    handleBattleSummary,
    addItemLevels,
    addMarketFilterButtons,
    handleMarketItemFilter,
    handleTaskCard,
    addIndexToMaps,
    waitForItemDict,
    handleItemDict
  });
  Object.defineProperties(runtime.state, {
    onlyShowItemsAboveLevel: {
      enumerable: true,
      get() {
        return onlyShowItemsAboveLevel;
      },
      set(value) {
        onlyShowItemsAboveLevel = value;
      }
    },
    onlyShowItemsBelowLevel: {
      enumerable: true,
      get() {
        return onlyShowItemsBelowLevel;
      },
      set(value) {
        onlyShowItemsBelowLevel = value;
      }
    },
    onlyShowItemsType: {
      enumerable: true,
      get() {
        return onlyShowItemsType;
      },
      set(value) {
        onlyShowItemsType = value;
      }
    },
    onlyShowItemsSkillReq: {
      enumerable: true,
      get() {
        return onlyShowItemsSkillReq;
      },
      set(value) {
        onlyShowItemsSkillReq = value;
      }
    }
  });
  runtime.registerStart("features/game-widgets.js", () => {
    if (runtime.settings.settingsMap.itemIconLevel.isTrue) {
      setInterval(addItemLevels, 500);
    }
    if (runtime.settings.settingsMap.marketFilter.isTrue) {
      setInterval(addMarketFilterButtons, 500);
    }
    if (runtime.settings.settingsMap.taskMapIndex.isTrue) {
      setInterval(handleTaskCard, 500);
    }
    if (runtime.settings.settingsMap.mapIndex.isTrue) {
      setInterval(addIndexToMaps, 500);
    }
  });

  // src/features/enhancement.js
  function add3rdPartyLinks() {
    const waitForNavi = () => {
      const targetNode = document.querySelector(
        "div.NavigationBar_minorNavigationLinks__dbxh7"
      );
      if (targetNode) {
        let div = document.createElement("div");
        div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
        div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
        div.innerHTML = runtime.config.isZH ? "插件设置" : "Script settings";
        div.addEventListener("click", () => {
          const array = document.querySelectorAll(
            ".NavigationBar_navigationLink__3eAHA"
          );
          array[array.length - 1]?.click();
        });
        targetNode.insertAdjacentElement("afterbegin", div);
        if (runtime.config.isZH) {
          div = document.createElement("div");
          div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
          div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
          div.innerHTML = runtime.config.isZH ? "牛牛手册" : "牛牛手册";
          div.addEventListener("click", () => {
            window.open(
              "https://test-ctmd6jnzo6t9.feishu.cn/docx/KG9ddER6Eo2uPoxJFkicsvbEnCe",
              "_blank"
            );
          });
          targetNode.insertAdjacentElement("afterbegin", div);
        }
        div = document.createElement("div");
        div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
        div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
        div.innerHTML = runtime.config.isZH ? "利润计算 Mooneycalc" : "Profit calc Mooneycalc";
        div.addEventListener("click", () => {
          window.open("https://mooneycalc.netlify.app/", "_blank");
        });
        targetNode.insertAdjacentElement("afterbegin", div);
        div = document.createElement("div");
        div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
        div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
        div.innerHTML = runtime.config.isZH ? "利润计算 Milkonomy" : "Profit calc Milkonomy";
        div.addEventListener("click", () => {
          window.open("https://milkonomy.pages.dev/", "_blank");
        });
        targetNode.insertAdjacentElement("afterbegin", div);
        div = document.createElement("div");
        div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
        div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
        div.innerHTML = runtime.config.isZH ? "利润计算 Cowculator" : "Profit calc Cowculator";
        div.addEventListener("click", () => {
          window.open("https://danthegoodman.github.io/cowculator/", "_blank");
        });
        targetNode.insertAdjacentElement("afterbegin", div);
        div = document.createElement("div");
        div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
        div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
        div.innerHTML = runtime.config.isZH ? "强化模拟 Enhancelator" : "Enhancement sim Enhancelator";
        div.addEventListener("click", () => {
          window.open("https://doh-nuts.github.io/Enhancelator/", "_blank");
        });
        targetNode.insertAdjacentElement("afterbegin", div);
        div = document.createElement("div");
        div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
        div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
        div.innerHTML = runtime.config.isZH ? "战斗榜 socko" : "Combat Tracker socko";
        div.addEventListener("click", () => {
          window.open("https://sockosnewcombattracker.pages.dev/", "_blank");
        });
        targetNode.insertAdjacentElement("afterbegin", div);
        div = document.createElement("div");
        div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
        div.style.color = runtime.config.SCRIPT_COLOR_MAIN;
        div.innerHTML = runtime.config.isZH ? "战斗模拟 shykai" : "Combat sim shykai";
        div.addEventListener("click", () => {
          window.open(
            "https://shykai.github.io/MWICombatSimulatorTest/dist/",
            "_blank"
          );
        });
        targetNode.insertAdjacentElement("afterbegin", div);
      } else {
        setTimeout(add3rdPartyLinks, 200);
      }
    };
    waitForNavi();
  }
  function handleActionQueueMenue(added) {
    if (!runtime.settings.settingsMap.actionQueue.isTrue) {
      return;
    }
    handleActionQueueMenueCalculateTime(added);
    const listDiv = added.querySelector(".QueuedActions_actions__2Lur6");
    new MutationObserver((mutationsList) => {
      handleActionQueueMenueCalculateTime(added);
    }).observe(listDiv, {
      characterData: false,
      subtree: false,
      childList: true
    });
  }
  function handleActionQueueMenueCalculateTime(added) {
    const actionDivList = added.querySelectorAll(
      "div.QueuedActions_action__r3HlD"
    );
    if (!actionDivList || actionDivList.length === 0) {
      return;
    }
    if (actionDivList.length !== runtime.state.currentActionsHridList.length - 1) {
      console.error("handleActionQueueTooltip action queue length inconsistency");
      return;
    }
    let actionDivListIndex = 0;
    let hasSkippedfirstActionObj = false;
    let accumulatedTimeSec = 0;
    let isAccumulatedTimeInfinite = false;
    for (const actionObj of runtime.state.currentActionsHridList) {
      const actionHrid = actionObj.actionHrid;
      const count = actionObj.maxCount - actionObj.currentCount;
      let isInfinit = false;
      if (count === 0 || actionHrid.includes("/combat/")) {
        isInfinit = true;
        isAccumulatedTimeInfinite = true;
      }
      const baseTimePerActionSec = runtime.state.initData_actionDetailMap[actionHrid].baseTimeCost / 1e9;
      const totalEffBuff = runtime.api.getTotalEffiPercentage(actionHrid);
      const toolSpeedBuff = runtime.api.getToolsSpeedBuffByActionHrid(actionHrid);
      let timePerActionSec = baseTimePerActionSec / (1 + toolSpeedBuff / 100);
      timePerActionSec /= 1 + totalEffBuff / 100;
      let totalTimeSec = count * timePerActionSec;
      let str = runtime.config.isZH ? "到 ∞ " : "Complete at ∞ ";
      if (!isAccumulatedTimeInfinite) {
        accumulatedTimeSec += totalTimeSec;
        const currentTime = /* @__PURE__ */ new Date();
        currentTime.setSeconds(currentTime.getSeconds() + accumulatedTimeSec);
        str = `${runtime.config.isZH ? "到 " : "Complete at "}${String(currentTime.getHours()).padStart(2, "0")}:${String(
          currentTime.getMinutes()
        ).padStart(2, "0")}:${String(currentTime.getSeconds()).padStart(2, "0")}`;
      }
      if (hasSkippedfirstActionObj) {
        const html2 = `<div class="script_actionTime" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${isInfinit ? "[ ∞ ] " : `[${runtime.api.timeReadable(totalTimeSec)}]`} ${str}</div>`;
        if (actionDivList[actionDivListIndex].querySelector(
          "div div.script_actionTime"
        )) {
          actionDivList[actionDivListIndex].querySelector(
            "div div.script_actionTime"
          ).innerHTML = html2;
        } else {
          actionDivList[actionDivListIndex].querySelector("div").insertAdjacentHTML("beforeend", html2);
        }
        actionDivListIndex++;
      }
      hasSkippedfirstActionObj = true;
    }
    const html = `<div id="script_queueTotalTime" style="color: ${runtime.config.SCRIPT_COLOR_MAIN};">${runtime.config.isZH ? "总时间：" : "Total time: "}${isAccumulatedTimeInfinite ? "[ ∞ ] " : `[${runtime.api.timeReadable(accumulatedTimeSec)}]`}</div>`;
    if (document.querySelector("div#script_queueTotalTime")) {
      document.querySelector("div#script_queueTotalTime").innerHTML = html;
    } else {
      document.querySelector("div.QueuedActions_queuedActionsEditMenu__3OoQH").insertAdjacentHTML("afterend", html);
    }
  }
  function getOriTextFromElement(elem) {
    if (!elem) {
      console.error("getTextFromElement null elem");
      return "";
    }
    const translatedfrom = elem.getAttribute("script_translatedfrom");
    if (translatedfrom) {
      return translatedfrom;
    }
    return elem.textContent;
  }
  async function handleItemTooltipWithEnhancementLevel(tooltip) {
    if (!runtime.settings.settingsMap.enhanceSim.isTrue) {
      return;
    }
    if (typeof math === "undefined") {
      console.error(`handleItemTooltipWithEnhancementLevel no math lib`);
      tooltip.querySelector(".ItemTooltipText_itemTooltipText__zFq3A").insertAdjacentHTML(
        "beforeend",
        `<div style="color: ${runtime.config.SCRIPT_COLOR_ALERT};">${runtime.config.isZH ? "由于网络问题无法强化模拟: 1. 手机可能不支持脚本联网；2. 请尝试科学网络；" : "Enhancement sim Internet error"}</div>`
      );
      return;
    }
    const itemNameElems = tooltip.querySelectorAll(
      "div.ItemTooltipText_name__2JAHA span"
    );
    let itemName = getOriTextFromElement(itemNameElems[0]);
    if (runtime.config.isZHInGameSetting) {
      itemName = runtime.api.getItemEnNameFromZhName(itemName);
    }
    const enhancementLevel = Number(
      itemNameElems[1].textContent.replace("+", "")
    );
    let itemHrid = runtime.state.itemEnNameToHridMap[itemName];
    if (!itemHrid || !runtime.state.initData_itemDetailMap[itemHrid]) {
      console.error(
        `handleItemTooltipWithEnhancementLevel invalid itemHrid ${itemName} ${itemHrid}`
      );
      return;
    }
    input_data.item_hrid = itemHrid;
    input_data.stop_at = enhancementLevel;
    const best = await findBestEnhanceStratWithPhiMirror(input_data);
    let appendHTMLStr = `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP};">${runtime.config.isZH ? "不支持模拟+1装备" : "Enhancement sim of +1 equipments not supported"}</div>`;
    if (best) {
      let needMatStr = "";
      if (best.costs.needMap) {
        for (const [key, value] of Object.entries(best.costs.needMap)) {
          needMatStr += `<div>${runtime.config.isZH ? runtime.data.ZHItemNames[runtime.state.initData_itemDetailMap[key].hrid] : runtime.state.initData_itemDetailMap[key].name} ${runtime.config.isZH ? "单价: " : "price per item: "}${runtime.api.numberFormatter(value)}<div>`;
        }
      }
      appendHTMLStr = `<div style="color: ${runtime.config.SCRIPT_COLOR_TOOLTIP};"><div>${runtime.config.isZH ? "强化模拟（默认125级强化，6级房子，10级星空工具，10级手套，究极茶，幸运茶，卖单价收货，不包括工时费，不包括市场税）：" : "Enhancement simulator: Default level 12 enhancing, level 6 house, level 10 celestial tool, level 10 gloves, ultra tea, blessed tea, sell order price in, no player time fee, no market tax: "}</div><div>${runtime.config.isZH ? "总成本 " : "Total cost "}${runtime.api.numberFormatter(best.totalCost.toFixed(0))}</div>
        <div>${runtime.config.isZH ? "耗时 " : "Time spend "}${best.simResult.totalActionTimeStr}</div>
        ${best.protect_count > 0 ? `<div>${runtime.config.isZH ? "从 " : "Use protection from level "}` + best.protect_at + `${runtime.config.isZH ? " 级开始保护" : ""}</div>` : `<div>${runtime.config.isZH ? "不需要保护" : "No protection use"}</div>`}
        <div>${runtime.config.isZH ? "保护 " : "Protection "}${best.protect_count.toFixed(1)}${runtime.config.isZH ? " 次" : " times"}</div>
        ${best.costs.inputCount ? `<div>+${best.protect_at}${runtime.config.isZH ? "底子价格: " : " Base item Price: "}${runtime.api.numberFormatter(best.costs.baseCost)}</div><div>+${best.protect_at}${runtime.config.isZH ? "底子数量: " : " Base item Count: "}${runtime.api.numberFormatter(best.costs.baseCount)}</div><div>+${best.protect_at - 1}${runtime.config.isZH ? "材料价格: " : " Base item Price: "}${runtime.api.numberFormatter(best.costs.inputCost)}</div><div>+${best.protect_at - 1}${runtime.config.isZH ? "材料数量: " : " Base item Count: "}${runtime.api.numberFormatter(best.costs.inputCount)}</div>` : `<div>${runtime.config.isZH ? "+0底子价格: " : "+0 Base item Price: "}${runtime.api.numberFormatter(best.costs.baseCost)}</div>`}
        <div>${best.protect_count > 0 ? (runtime.config.isZH ? "保护单价: " : "Price per protection: ") + (runtime.config.isZH ? runtime.data.ZHItemNames[runtime.state.initData_itemDetailMap[best.costs.choiceOfProtection].hrid] : runtime.state.initData_itemDetailMap[best.costs.choiceOfProtection].name) + " " + runtime.api.numberFormatter(best.costs.minProtectionCost) : ""}
         </div>${needMatStr}</div>`;
    }
    tooltip.querySelector(".ItemTooltipText_itemTooltipText__zFq3A").insertAdjacentHTML("beforeend", appendHTMLStr);
  }
  async function findBestEnhanceStratWithPhiMirror(input_data2) {
    const price_data = await runtime.api.fetchMarketJSON();
    if (!price_data || !price_data.marketData) {
      console.error("findBestEnhanceStrat fetchMarketJSON null");
      return null;
    }
    let best = await findBestEnhanceStrat(input_data2);
    if (!best) {
      return best;
    }
    const pMirrorHrid = "/items/philosophers_mirror";
    const pMirrorCost = getItemMarketPrice(pMirrorHrid, price_data);
    if (pMirrorCost <= 0) {
      return best;
    }
    const enhancementLevel = input_data2.stop_at;
    if (enhancementLevel <= 3) {
      return best;
    }
    const keyRefined = "_refined";
    const refinedHrid = input_data2.item_hrid;
    const isRefined = input_data2.item_hrid.includes(keyRefined);
    input_data2.item_hrid = isRefined ? input_data2.item_hrid.replace(keyRefined, "") : input_data2.item_hrid;
    const lowerBest = {};
    const lowestAt = 9;
    for (let i = lowestAt; i < enhancementLevel; i++) {
      input_data2.stop_at = i;
      lowerBest[i] = await findBestEnhanceStrat(input_data2);
    }
    const refinedNeedMap = {};
    let refinedCost = 0;
    if (isRefined) {
      const actionHrid = runtime.api.getActionHridFromItemName(
        runtime.state.initData_itemDetailMap[refinedHrid].name
      );
      if (actionHrid && runtime.state.initData_actionDetailMap[actionHrid].inputItems && runtime.state.initData_actionDetailMap[actionHrid].inputItems.length > 0) {
        const inputItems = JSON.parse(
          JSON.stringify(
            runtime.state.initData_actionDetailMap[actionHrid].inputItems
          )
        );
        for (const item of inputItems) {
          refinedNeedMap[item.itemHrid] = getItemMarketPrice(
            item.itemHrid,
            price_data
          );
          refinedCost += getItemMarketPrice(item.itemHrid, price_data) * item.count;
        }
      }
    }
    const allResults = [];
    for (let protect_at = lowestAt + 1; protect_at < enhancementLevel; protect_at++) {
      const fibonacci = [
        0,
        1,
        1,
        2,
        3,
        5,
        8,
        13,
        21,
        34,
        55,
        89,
        144,
        233,
        377,
        610,
        987,
        1597,
        2584,
        4181
      ];
      const baseCount = fibonacci[enhancementLevel - protect_at + 1];
      const inputCount = fibonacci[enhancementLevel - protect_at];
      const protectCount = baseCount + inputCount - 1;
      const totalCost = baseCount * lowerBest[protect_at].totalCost + inputCount * lowerBest[protect_at - 1].totalCost + pMirrorCost * protectCount + refinedCost;
      const cost = {
        minProtectionCost: pMirrorCost,
        choiceOfProtection: pMirrorHrid,
        baseCost: lowerBest[protect_at].totalCost,
        baseCount,
        inputCost: lowerBest[protect_at - 1].totalCost,
        inputCount,
        needMap: refinedNeedMap
      };
      const itemLevel = runtime.state.initData_itemDetailMap[input_data2.item_hrid].itemLevel;
      const effective_level = input_data2.enhancing_level + (input_data2.tea_enhancing ? 3 : 0) + (input_data2.tea_super_enhancing ? 6 : 0) + (input_data2.tea_ultra_enhancing ? 8 : 0);
      const perActionTimeSec = (12 / (1 + (input_data2.enhancing_level > itemLevel ? (effective_level + input_data2.laboratory_level - itemLevel + input_data2.glove_bonus) / 100 : (input_data2.laboratory_level + input_data2.glove_bonus) / 100))).toFixed(2);
      const totalActionTimeSec = protectCount * perActionTimeSec;
      const simResult = {
        totalActionTimeStr: runtime.api.timeReadable(totalActionTimeSec)
      };
      const r = {};
      r.protect_at = protect_at;
      r.protect_count = protectCount;
      r.intput_count = inputCount;
      r.simResult = simResult;
      r.costs = cost;
      r.totalCost = totalCost;
      allResults.push(r);
    }
    for (const r of allResults) {
      if (r.totalCost < best.totalCost) {
        best = r;
      }
    }
    return best;
  }
  async function findBestEnhanceStrat(input_data2) {
    const price_data = await runtime.api.fetchMarketJSON();
    if (!price_data || !price_data.marketData) {
      console.error("findBestEnhanceStrat fetchMarketJSON null");
      return [];
    }
    const allResults = [];
    for (let protect_at = 2; protect_at <= input_data2.stop_at; protect_at++) {
      const simResult = Enhancelate(input_data2, protect_at);
      const costs = getCosts(input_data2.item_hrid, price_data);
      const totalCost = costs.baseCost + costs.minProtectionCost * simResult.protect_count + costs.perActionCost * simResult.actions;
      const r = {};
      r.protect_at = protect_at;
      r.protect_count = simResult.protect_count;
      r.simResult = simResult;
      r.costs = costs;
      r.totalCost = totalCost;
      allResults.push(r);
    }
    let best = null;
    for (const r of allResults) {
      if (best === null || r.totalCost < best.totalCost) {
        best = r;
      }
    }
    return best;
  }
  function Enhancelate(input_data2, protect_at) {
    const success_rate = [
      50,
      //+1
      45,
      //+2
      45,
      //+3
      40,
      //+4
      40,
      //+5
      40,
      //+6
      35,
      //+7
      35,
      //+8
      35,
      //+9
      35,
      //+10
      30,
      //+11
      30,
      //+12
      30,
      //+13
      30,
      //+14
      30,
      //+15
      30,
      //+16
      30,
      //+17
      30,
      //+18
      30,
      //+19
      30
      //+20
    ];
    const itemLevel = runtime.state.initData_itemDetailMap[input_data2.item_hrid].itemLevel;
    let total_bonus = null;
    const effective_level = input_data2.enhancing_level + (input_data2.tea_enhancing ? 3 : 0) + (input_data2.tea_super_enhancing ? 6 : 0) + (input_data2.tea_ultra_enhancing ? 8 : 0);
    if (effective_level >= itemLevel) {
      total_bonus = 1 + (0.05 * (effective_level + input_data2.laboratory_level - itemLevel) + input_data2.enhancer_bonus) / 100;
    } else {
      total_bonus = 1 - 0.5 * (1 - effective_level / itemLevel) + (0.05 * input_data2.laboratory_level + input_data2.enhancer_bonus) / 100;
    }
    let markov = math.zeros(20, 20);
    for (let i = 0; i < input_data2.stop_at; i++) {
      const success_chance = success_rate[i] / 100 * total_bonus;
      const destination = i >= protect_at ? i - 1 : 0;
      if (input_data2.tea_blessed) {
        markov.set([i, i + 2], success_chance * 0.01);
        markov.set([i, i + 1], success_chance * 0.99);
        markov.set([i, destination], 1 - success_chance);
      } else {
        markov.set([i, i + 1], success_chance);
        markov.set([i, destination], 1 - success_chance);
      }
    }
    markov.set([input_data2.stop_at, input_data2.stop_at], 1);
    let Q = markov.subset(
      math.index(
        math.range(0, input_data2.stop_at),
        math.range(0, input_data2.stop_at)
      )
    );
    const M = math.inv(math.subtract(math.identity(input_data2.stop_at), Q));
    const attemptsArray = M.subset(
      math.index(math.range(0, 1), math.range(0, input_data2.stop_at))
    );
    const attempts = math.flatten(math.row(attemptsArray, 0).valueOf()).reduce((a, b) => a + b, 0);
    const protectAttempts = M.subset(
      math.index(math.range(0, 1), math.range(protect_at, input_data2.stop_at))
    );
    const protectAttemptsArray = typeof protectAttempts === "number" ? [protectAttempts] : math.flatten(math.row(protectAttempts, 0).valueOf());
    const protects = protectAttemptsArray.map((a, i) => a * markov.get([i + protect_at, i + protect_at - 1])).reduce((a, b) => a + b, 0);
    const perActionTimeSec = (12 / (1 + (input_data2.enhancing_level > itemLevel ? (effective_level + input_data2.laboratory_level - itemLevel + input_data2.glove_bonus) / 100 : (input_data2.laboratory_level + input_data2.glove_bonus) / 100))).toFixed(2);
    const result = {};
    result.actions = attempts;
    result.protect_count = protects;
    result.totalActionTimeSec = perActionTimeSec * attempts;
    result.totalActionTimeStr = runtime.api.timeReadable(
      result.totalActionTimeSec
    );
    return result;
  }
  var input_data = {
    item_hrid: null,
    stop_at: null,
    enhancing_level: 125,
    // 人物 Enhancing 技能等级
    laboratory_level: 6,
    // 房子等级
    enhancer_bonus: 5.42,
    // 工具提高成功率，10级星空强化工具
    glove_bonus: 12.9,
    // 手套提高强化速度，0级=10，5级=11.2，10级=12.9
    tea_enhancing: false,
    // 强化茶
    tea_super_enhancing: false,
    // 超级强化茶
    tea_ultra_enhancing: true,
    tea_blessed: true,
    // 祝福茶
    priceAskBidRatio: 1
    // 取市场卖单价买单价比例，1=只用卖单价，0=只用买单价
  };
  function getCosts(hrid, price_data) {
    const itemDetailObj = runtime.state.initData_itemDetailMap[hrid];
    const baseCost = getRealisticBaseItemPrice(hrid, price_data);
    let minProtectionPrice = null;
    let minProtectionHrid = null;
    let protect_item_hrids = itemDetailObj.protectionItemHrids == null ? [hrid, "/items/mirror_of_protection"] : [hrid, "/items/mirror_of_protection"].concat(
      itemDetailObj.protectionItemHrids
    );
    protect_item_hrids.forEach((protection_hrid, i) => {
      const this_cost = getRealisticBaseItemPrice(protection_hrid, price_data);
      if (i === 0) {
        minProtectionPrice = this_cost;
        minProtectionHrid = protection_hrid;
      } else {
        if (this_cost > 0 && (minProtectionPrice < 0 || this_cost < minProtectionPrice)) {
          minProtectionPrice = this_cost;
          minProtectionHrid = protection_hrid;
        }
      }
    });
    const needMap = {};
    let totalNeedPrice = 0;
    for (const need of itemDetailObj.enhancementCosts) {
      const price = need.itemHrid.startsWith("/items/trainee_") ? 25e4 : getItemMarketPrice(need.itemHrid, price_data);
      totalNeedPrice += price * need.count;
      if (!need.itemHrid.includes("/coin")) {
        needMap[need.itemHrid] = price;
      }
    }
    return {
      baseCost,
      minProtectionCost: minProtectionPrice,
      perActionCost: totalNeedPrice,
      choiceOfProtection: minProtectionHrid,
      needMap
    };
  }
  function getRealisticBaseItemPrice(hrid, price_data) {
    const itemDetailObj = runtime.state.initData_itemDetailMap[hrid];
    const productionCost = getBaseItemProductionCost(
      itemDetailObj.name,
      price_data
    );
    const item_price_data = price_data.marketData[hrid];
    const ask = item_price_data?.[0]?.a;
    const bid = item_price_data?.[0]?.b;
    let result = 0;
    if (ask && ask > 0) {
      if (bid && bid > 0) {
        if (ask / bid > 1.3) {
          result = Math.max(bid, productionCost);
        } else {
          result = ask;
        }
      } else {
        if (ask / productionCost > 1.3) {
          result = productionCost;
        } else {
          result = Math.max(ask, productionCost);
        }
      }
    } else {
      if (bid && bid > 0) {
        result = Math.max(bid, productionCost);
      } else {
        result = productionCost;
      }
    }
    return result;
  }
  function getItemMarketPrice(hrid, price_data) {
    const item_price_data = price_data.marketData[hrid];
    if (!item_price_data || !item_price_data[0] || item_price_data[0].a < 0 && item_price_data[0].b < 0) {
      return 0;
    }
    let ask = item_price_data[0]?.a;
    let bid = item_price_data[0]?.b;
    if (ask > 0 && bid < 0) {
      return ask;
    }
    if (bid > 0 && ask < 0) {
      return bid;
    }
    let final_cost = ask * input_data.priceAskBidRatio + bid * (1 - input_data.priceAskBidRatio);
    return final_cost;
  }
  function getBaseItemProductionCost(itemName, price_data) {
    const actionHrid = runtime.api.getActionHridFromItemName(itemName);
    if (!actionHrid || !runtime.state.initData_actionDetailMap[actionHrid]) {
      return -1;
    }
    let totalPrice = 0;
    const inputItems = JSON.parse(
      JSON.stringify(
        runtime.state.initData_actionDetailMap[actionHrid].inputItems
      )
    );
    for (let item of inputItems) {
      totalPrice += getItemMarketPrice(item.itemHrid, price_data) * item.count;
    }
    totalPrice *= 0.9;
    const upgradedFromItemHrid = runtime.state.initData_actionDetailMap[actionHrid]?.upgradeItemHrid;
    if (upgradedFromItemHrid) {
      totalPrice += getItemMarketPrice(upgradedFromItemHrid, price_data) * 1;
    }
    return totalPrice;
  }
  Object.assign(runtime.api, {
    add3rdPartyLinks,
    handleActionQueueMenue,
    handleActionQueueMenueCalculateTime,
    getOriTextFromElement,
    handleItemTooltipWithEnhancementLevel,
    findBestEnhanceStratWithPhiMirror,
    findBestEnhanceStrat,
    Enhancelate,
    getCosts,
    getRealisticBaseItemPrice,
    getItemMarketPrice,
    getBaseItemProductionCost
  });
  Object.defineProperties(runtime.state, {
    input_data: {
      enumerable: true,
      get() {
        return input_data;
      },
      set(value) {
        input_data = value;
      }
    }
  });

  // src/features/settings-and-notifications.js
  var waitForSetttins = () => {
    const targetNode = document.querySelector(
      "div.SettingsPanel_profileTab__214Bj"
    );
    if (targetNode) {
      if (!targetNode.querySelector("#script_settings")) {
        targetNode.insertAdjacentHTML(
          "beforeend",
          `<div id="script_settings"></div>`
        );
        const insertElem = targetNode.querySelector("div#script_settings");
        insertElem.insertAdjacentHTML(
          "beforeend",
          `<div style="float: left; color: ${runtime.config.SCRIPT_COLOR_MAIN}">${runtime.config.isZH ? "MWITools 设置 （刷新生效）：" : "MWITools Settings (refresh page to apply): "}</div></br>`
        );
        for (const setting of Object.values(runtime.settings.settingsMap)) {
          insertElem.insertAdjacentHTML(
            "beforeend",
            `<div style="float: left;"><input type="checkbox" id="${setting.id}" ${setting.isTrue ? "checked" : ""}></input>${setting.desc}</div></br>`
          );
        }
        insertElem.insertAdjacentHTML(
          "beforeend",
          `<div style="float: left;">${runtime.config.isZH ? "代码里搜索“自定义”可以手动修改字体颜色、强化模拟默认参数" : `Search "Customization" in code to customize font colors and default enhancement simulation parameters.`}</div></br>`
        );
        insertElem.addEventListener("change", saveSettings);
      }
    }
    setTimeout(waitForSetttins, 500);
  };
  function saveSettings() {
    for (const checkbox of document.querySelectorAll(
      "div#script_settings input"
    )) {
      runtime.settings.settingsMap[checkbox.id].isTrue = checkbox.checked;
      localStorage.setItem(
        "script_settingsMap",
        JSON.stringify(runtime.settings.settingsMap)
      );
    }
  }
  function readSettings() {
    const ls = localStorage.getItem("script_settingsMap");
    if (ls) {
      const lsObj = JSON.parse(ls);
      for (const option of Object.values(lsObj)) {
        if (runtime.settings.settingsMap.hasOwnProperty(option.id)) {
          runtime.settings.settingsMap[option.id].isTrue = option.isTrue;
        }
      }
    }
    if (runtime.settings.settingsMap.forceMWIToolsDisplayZH.isTrue) {
      runtime.config.isZH = true;
    }
    if (runtime.settings.settingsMap.useOrangeAsMainColor.isTrue && runtime.config.SCRIPT_COLOR_MAIN === "green") {
      runtime.config.SCRIPT_COLOR_MAIN = "orange";
    }
    if (runtime.settings.settingsMap.useOrangeAsMainColor.isTrue && runtime.config.SCRIPT_COLOR_TOOLTIP === "darkgreen") {
      runtime.config.SCRIPT_COLOR_TOOLTIP = "#804600";
    }
  }
  function checkEquipment() {
    if (runtime.state.currentActionsHridList.length === 0) {
      return;
    }
    const currentActionHrid = runtime.state.currentActionsHridList[0].actionHrid;
    const hasHat = runtime.state.currentEquipmentMap["/item_locations/head"]?.itemHrid === "/items/red_chefs_hat" ? true : false;
    const hasOffHand = runtime.state.currentEquipmentMap["/item_locations/off_hand"]?.itemHrid === "/items/eye_watch" ? true : false;
    const hasBoot = runtime.state.currentEquipmentMap["/item_locations/feet"]?.itemHrid === "/items/collectors_boots" ? true : false;
    const hasGlove = runtime.state.currentEquipmentMap["/item_locations/hands"]?.itemHrid === "/items/enchanted_gloves" ? true : false;
    let warningStr = null;
    if (currentActionHrid.includes("/actions/combat/")) {
      if (hasHat || hasOffHand || hasBoot || hasGlove) {
        warningStr = runtime.config.isZH ? "正穿着生产装备" : "Production equipment equipted";
      }
    } else if (currentActionHrid.includes("/actions/cooking/") || currentActionHrid.includes("/actions/brewing/")) {
      if (!hasHat && hasItemHridInInv("/items/red_chefs_hat")) {
        warningStr = runtime.config.isZH ? "没穿生产帽" : "Not wearing production hat";
      }
    } else if (currentActionHrid.includes("/actions/cheesesmithing/") || currentActionHrid.includes("/actions/crafting/") || currentActionHrid.includes("/actions/tailoring/")) {
      if (!hasOffHand && hasItemHridInInv("/items/eye_watch")) {
        warningStr = runtime.config.isZH ? "没穿生产副手" : "Not wearing production off-hand";
      }
    } else if (currentActionHrid.includes("/actions/milking/") || currentActionHrid.includes("/actions/foraging/") || currentActionHrid.includes("/actions/woodcutting/")) {
      if (!hasBoot && hasItemHridInInv("/items/collectors_boots")) {
        warningStr = runtime.config.isZH ? "没穿生产鞋" : "Not wearing production boots";
      }
    } else if (currentActionHrid.includes("/actions/enhancing")) {
      if (!hasGlove && hasItemHridInInv("/items/enchanted_gloves")) {
        warningStr = runtime.config.isZH ? "没穿强化手套" : "Not wearing enhancing gloves";
      }
    }
    document.body.querySelector("#script_item_warning")?.remove();
    if (warningStr) {
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div id="script_item_warning" style="position: fixed; top: 1%; left: 30%; color: ${runtime.config.SCRIPT_COLOR_ALERT}; font-size: 1rem;">${warningStr}</div>`
      );
    }
  }
  function hasItemHridInInv(hrid) {
    let result = null;
    for (const item of runtime.state.initData_characterItems) {
      if (item.itemHrid === hrid && item.itemLocationHrid === "/item_locations/inventory") {
        result = item;
      }
    }
    return result ? true : false;
  }
  function notificate() {
    if (typeof GM_notification === "undefined" || !GM_notification) {
      console.error("notificate null GM_notification");
      return;
    }
    if (runtime.state.currentActionsHridList.length > 0) {
      return;
    }
    console.log("notificate empty action");
    GM_notification({
      text: runtime.config.isZH ? "动作队列为空" : "Action queue is empty.",
      title: "MWITools"
    });
  }
  var waitForMarketOrders = () => {
    const element = document.querySelector(
      ".MarketplacePanel_marketListings__1GCyQ"
    );
    if (element) {
      console.log("start observe market order");
      new MutationObserver((mutationsList) => {
        mutationsList.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.classList.contains("Modal_modalContainer__3B80m")) {
              handleMarketNewOrder(node);
            }
          });
        });
      }).observe(element, {
        characterData: false,
        subtree: false,
        childList: true
      });
    } else {
      setTimeout(waitForMarketOrders, 500);
    }
  };
  function handleMarketNewOrder(node) {
    const title = runtime.api.getOriTextFromElement(
      node.querySelector(".MarketplacePanel_header__yahJo")
    );
    if (!title || title.includes(" Now") || title.includes("立即")) {
      return;
    }
    const label = node.querySelector("span.MarketplacePanel_bestPrice__3bgKp");
    const inputDiv = node.querySelector(
      ".MarketplacePanel_inputContainer__3xmB2 .MarketplacePanel_priceInputs__3iWxy"
    );
    if (!label || !inputDiv) {
      console.error("handleMarketNewOrder can not find elements");
      return;
    }
    label.click();
    if (runtime.api.getOriTextFromElement(label.parentElement).toLowerCase().includes("best buy") || label.parentElement.textContent.includes("购买")) {
      inputDiv.querySelectorAll(".MarketplacePanel_buttonContainer__vJQud")[2]?.querySelector("div button")?.click();
    } else if (runtime.api.getOriTextFromElement(label.parentElement).toLowerCase().includes("best sell") || label.parentElement.textContent.includes("出售")) {
      inputDiv.querySelectorAll(".MarketplacePanel_buttonContainer__vJQud")[1]?.querySelector("div button")?.click();
    }
  }
  Object.assign(runtime.api, {
    waitForSetttins,
    saveSettings,
    readSettings,
    checkEquipment,
    hasItemHridInInv,
    notificate,
    waitForMarketOrders,
    handleMarketNewOrder
  });
  runtime.registerStart("features/settings-and-notifications.js", () => {
    waitForSetttins();
  });

  // src/features/combat.js
  var lang = {
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
    aura: runtime.config.isZH ? "光环" : "Aura"
  };
  var totalDamage = [];
  var totalDuration = 0;
  var startTime = null;
  var endTime = null;
  var monstersHP = [];
  var playersMP = [];
  var players = [];
  var monsters = [];
  var dragging = false;
  var chart = null;
  var monsterCounts = {};
  var monsterEvasion = {};
  var monsterHrids = {};
  var calculateHitChance = (accuracy, evasion) => {
    const hitChance = Math.pow(accuracy, 1.4) / (Math.pow(accuracy, 1.4) + Math.pow(evasion, 1.4)) * 100;
    return hitChance;
  };
  var getStatisticsDom = () => {
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
      let dragging2 = false;
      const panelHeader = panel.querySelector("#panelHeader");
      panelHeader.addEventListener("mousedown", function(e) {
        const rect = panel.getBoundingClientRect();
        const isResizing = e.clientX > rect.right - 10 || e.clientY > rect.bottom - 10;
        if (isResizing || e.target.id === "script_toggleButton") return;
        dragging2 = true;
        offsetX = e.clientX - panel.offsetLeft;
        offsetY = e.clientY - panel.offsetTop;
        e.preventDefault();
      });
      let dragStartTime = 0;
      document.addEventListener("mousemove", function(e) {
        if (dragging2) {
          const now = Date.now();
          if (now - dragStartTime < 16) return;
          dragStartTime = now;
          var newX = e.clientX - offsetX;
          var newY = e.clientY - offsetY;
          panel.style.left = newX + "px";
          panel.style.top = newY + "px";
        }
      });
      document.addEventListener("mouseup", function() {
        dragging2 = false;
      });
      panel.addEventListener("touchstart", function(e) {
        const rect = panel.getBoundingClientRect();
        const isResizing = e.clientX > rect.right - 10 || e.clientY > rect.bottom - 10;
        if (isResizing || e.target.id === "script_toggleButton") return;
        dragging2 = true;
        let touch = e.touches[0];
        offsetX = touch.clientX - panel.offsetLeft;
        offsetY = touch.clientY - panel.offsetTop;
        e.preventDefault();
      });
      document.addEventListener("touchmove", function(e) {
        if (dragging2) {
          const now = Date.now();
          if (now - dragStartTime < 16) return;
          dragStartTime = now;
          let touch = e.touches[0];
          var newX = touch.clientX - offsetX;
          var newY = touch.clientY - offsetY;
          panel.style.left = newX + "px";
          panel.style.top = newY + "px";
        }
      });
      document.addEventListener("touchend", function() {
        dragging2 = false;
      });
      document.body.appendChild(panel);
      if (!localStorage.getItem("script_dpsPanel_isExpanded")) {
        localStorage.setItem("script_dpsPanel_isExpanded", true);
      }
      if (localStorage.getItem("script_dpsPanel_isExpanded") !== "true") {
        document.getElementById("script_panelContent").style.display = "none";
        document.getElementById("script_toggleButton").textContent = lang.toggleButtonShow;
      }
      document.getElementById("script_toggleButton").addEventListener("click", function() {
        let isExpanded = localStorage.getItem("script_dpsPanel_isExpanded") === "true";
        isExpanded = !isExpanded;
        localStorage.setItem(
          "script_dpsPanel_isExpanded",
          isExpanded ? true : false
        );
        this.textContent = isExpanded ? lang.toggleButtonHide : lang.toggleButtonShow;
        const panelContent = document.getElementById("script_panelContent");
        if (isExpanded) {
          panelContent.style.display = "block";
          this.textContent = lang.toggleButtonHide;
        } else {
          panelContent.style.display = "none";
          this.textContent = lang.toggleButtonShow;
        }
      });
      const ctx = document.getElementById("script_dpsChart").getContext("2d");
      chart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: [],
          datasets: [
            {
              data: [],
              backgroundColor: [
                "rgba(255, 99, 132, 0.6)",
                // 浅粉色
                "rgba(54, 162, 235, 0.6)",
                // 浅蓝色
                "rgba(255, 206, 86, 0.6)",
                // 浅黄色
                "rgba(75, 192, 192, 0.6)",
                // 浅绿色
                "rgba(153, 102, 255, 0.6)",
                // 浅紫色
                "rgba(255, 159, 64, 0.6)"
                // 浅橙色
              ],
              borderColor: [
                "rgba(255, 99, 132, 1)",
                // 浅粉色边框
                "rgba(54, 162, 235, 1)",
                // 浅蓝色边框
                "rgba(255, 206, 86, 1)",
                // 浅黄色边框
                "rgba(75, 192, 192, 1)",
                // 浅绿色边框
                "rgba(153, 102, 255, 1)",
                // 浅紫色边框
                "rgba(255, 159, 64, 1)"
                // 浅橙色边框
              ],
              borderWidth: 1,
              barPercentage: 0.9,
              categoryPercentage: 1
            }
          ]
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
                display: false
              }
            },
            y: {
              grid: {
                display: false
              },
              ticks: {
                font: {
                  size: 12,
                  // 字体大小
                  weight: "bold"
                  // 加粗字体
                },
                color: "rgba(255, 255, 255, 0.7)"
                // 浅色字体（你可以根据背景调整颜色）
              }
            }
          },
          layout: {
            padding: {
              left: 0,
              right: 0,
              top: 0,
              bottom: 0
            }
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              enabled: false
            },
            datalabels: {
              anchor: "end",
              align: "right",
              color: function(context) {
                const value = context.dataset.data[context.dataIndex];
                return value > 0 ? "white" : "transparent";
              },
              font: {
                weight: "bold",
                size: 12
              },
              formatter: function(value) {
                return `${value.toLocaleString()}`;
              },
              clip: false,
              display: true
            }
          }
        },
        plugins: [ChartDataLabels]
      });
    } else if (document.getElementById("script_dpsChart_div")) {
      document.getElementById("script_dpsChart_div").style.height = `${chartHeight}px`;
    }
    return document.querySelector(".script_dps_panel");
  };
  var updateStatisticsPanel = () => {
    const totalTime = totalDuration + (endTime - startTime) / 1e3;
    const dps = totalDamage.map(
      (damage) => totalTime ? Math.round(damage / totalTime) : 0
    );
    const totalTeamDamage = totalDamage.reduce((acc, damage) => acc + damage, 0);
    const totalTeamDPS = totalTime ? Math.round(totalTeamDamage / totalTime) : 0;
    const playersContainer = document.querySelector(
      ".BattlePanel_combatUnitGrid__2hTAM"
    );
    if (playersContainer) {
      players.forEach((player, index) => {
        const playerElement = playersContainer.children[index];
        if (playerElement) {
          const statusElement = playerElement.querySelector(
            ".CombatUnit_status__3bH7W"
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
    if (runtime.settings.settingsMap.showDamageGraph.isTrue && !dragging) {
      const panel = getStatisticsDom();
      chart.data.labels = players.map((player) => player?.name);
      chart.data.datasets[0].data = dps;
      chart.update();
      const days = Math.floor(totalTime / (24 * 3600));
      const hours = Math.floor(totalTime % (24 * 3600) / 3600);
      const minutes = Math.floor(totalTime % 3600 / 60);
      const seconds = Math.floor(totalTime % 60);
      const formattedTime = `${days}d ${hours}h ${minutes}m ${seconds}s`;
      const dpsText = document.getElementById("script_dpsText");
      const playerRows = players.map((player, index) => {
        const dpsFormatted = dps[index].toLocaleString();
        const totalDamageFormatted = totalDamage[index].toLocaleString();
        const damagePercentage = totalTeamDamage ? (totalDamage[index] / totalTeamDamage * 100).toFixed(2) : 0;
        let auraskill = "N/A";
        let auraskillHrid = null;
        if (player.combatAbilities && Array.isArray(player.combatAbilities)) {
          const firstAbility = player.combatAbilities[0];
          if (firstAbility && firstAbility.abilityHrid) {
            auraskillHrid = firstAbility.abilityHrid;
            auraskill = firstAbility.abilityHrid.split("/").pop().replace(/_/g, " ");
            const validSkills = [
              "revive",
              "insanity",
              "invincible",
              "fierce aura",
              "aqua aura",
              "sylvan aura",
              "flame aura",
              "speed aura",
              "critical aura"
            ];
            if (!validSkills.includes(auraskill)) {
              auraskill = "N/A";
            }
          }
        }
        auraskill = auraskill.split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
        const isHighestDPS = dps[index] === Math.max(...dps);
        const dpsPrefix = isHighestDPS ? "🔥" : "";
        return `
        <tr style="color: white;">
            <td style="font-weight: bold;">${dpsPrefix} ${player.name}</td>
            <td>${runtime.config.isZH ? auraskillHrid ? runtime.data.ZHOthersDic[auraskillHrid] : "无" : auraskill}</td>
            <td>${dpsFormatted}</td>
            <td>${totalDamageFormatted}</td>
            <td>${damagePercentage}%</td>
        </tr>`;
      }).join("");
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
      const hitChanceTable = document.getElementById("script_hitChanceTable");
      const hitChanceRows = players.map((player) => {
        const playerName = player.name;
        const playerHitChances = Object.entries(monsterCounts).map(([monsterName, count]) => {
          const combatStyle = player.combatDetails.combatStats.combatStyleHrids[0].split("/").pop();
          const evasionRating = monsterEvasion[monsterName][`${player.name}-${combatStyle}`];
          const accuracy = player.combatDetails[`${combatStyle}AccuracyRating`];
          const hitChance = calculateHitChance(accuracy, evasionRating);
          return `<td style="color: white;">${hitChance.toFixed(0)}%</td>`;
        }).join("");
        return `<tr><td style="color: white;">${playerName}</td>${playerHitChances}</tr>`;
      }).join("");
      hitChanceTable.innerHTML = `
<table style="width: 100%; border-collapse: collapse; font-size: smaller;">
    <thead>
        <tr>
            <th style="font-size: smaller; white-space: normal; text-align: left; color: white;">${lang.hitChance}</th>
            ${Object.entries(monsterCounts).map(
        ([monsterName, count]) => `<th style="font-size: smaller; white-space: normal; text-align: left; color: white;">${runtime.config.isZH ? runtime.data.ZHOthersDic[monsterHrids[monsterName]] : monsterName} (${count})</th>`
      ).join("")}
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
      runtime.state.totalDuration += (runtime.state.endTime - runtime.state.startTime) / 1e3;
    }
    runtime.state.startTime = Date.now();
    runtime.state.endTime = null;
    runtime.state.monstersHP = payload.monsters.map(
      (monster) => monster.currentHitpoints
    );
    runtime.state.playersMP = payload.players.map(
      (player) => player.currentManapoints
    );
    if (!runtime.state.players?.length) runtime.state.players = payload.players;
    for (const player of runtime.state.players) {
      player.currentAction = player.preparingAbilityHrid ? player.preparingAbilityHrid : player.isPreparingAutoAttack ? "auto" : "idle";
    }
    runtime.state.monsters = payload.monsters;
    if (!runtime.state.totalDamage.length)
      runtime.state.totalDamage = new Array(runtime.state.players.length).fill(0);
    for (const monster of payload.monsters) {
      const name = monster.name;
      runtime.state.monsterHrids[name] = monster.hrid;
      runtime.state.monsterCounts[name] = (runtime.state.monsterCounts[name] || 0) + 1;
      runtime.state.monsterEvasion[name] ??= {};
      for (const player of runtime.state.players) {
        for (const styleHrid of player.combatDetails?.combatStats?.combatStyleHrids ?? []) {
          const style = styleHrid.split("/").pop();
          runtime.state.monsterEvasion[name][`${player.name}-${style}`] = monster.combatDetails[`${style}EvasionRating`];
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
      const damageOwner = playerIndices.length > 1 ? String(castPlayer) : playerIndices[0];
      if (!playerIndices.includes(damageOwner)) return;
      const player = runtime.state.players[damageOwner];
      player.damageMap ??= /* @__PURE__ */ new Map();
      player.damageMap.set(
        player.currentAction,
        (player.damageMap.get(player.currentAction) ?? 0) + damage
      );
      runtime.state.totalDamage[damageOwner] += damage;
    });
    for (const userIndex of playerIndices) {
      const update = payload.pMap[userIndex];
      runtime.state.players[userIndex].currentAction = update.abilityHrid ? update.abilityHrid : update.isAutoAtk ? "auto" : "idle";
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
    handleBattleUpdated
  });
  Object.defineProperties(runtime.data, {
    lang: {
      enumerable: true,
      get() {
        return lang;
      }
    }
  });
  Object.defineProperties(runtime.state, {
    totalDamage: {
      enumerable: true,
      get() {
        return totalDamage;
      },
      set(value) {
        totalDamage = value;
      }
    },
    totalDuration: {
      enumerable: true,
      get() {
        return totalDuration;
      },
      set(value) {
        totalDuration = value;
      }
    },
    startTime: {
      enumerable: true,
      get() {
        return startTime;
      },
      set(value) {
        startTime = value;
      }
    },
    endTime: {
      enumerable: true,
      get() {
        return endTime;
      },
      set(value) {
        endTime = value;
      }
    },
    monstersHP: {
      enumerable: true,
      get() {
        return monstersHP;
      },
      set(value) {
        monstersHP = value;
      }
    },
    playersMP: {
      enumerable: true,
      get() {
        return playersMP;
      },
      set(value) {
        playersMP = value;
      }
    },
    players: {
      enumerable: true,
      get() {
        return players;
      },
      set(value) {
        players = value;
      }
    },
    monsters: {
      enumerable: true,
      get() {
        return monsters;
      },
      set(value) {
        monsters = value;
      }
    },
    dragging: {
      enumerable: true,
      get() {
        return dragging;
      },
      set(value) {
        dragging = value;
      }
    },
    chart: {
      enumerable: true,
      get() {
        return chart;
      },
      set(value) {
        chart = value;
      }
    },
    monsterCounts: {
      enumerable: true,
      get() {
        return monsterCounts;
      },
      set(value) {
        monsterCounts = value;
      }
    },
    monsterEvasion: {
      enumerable: true,
      get() {
        return monsterEvasion;
      },
      set(value) {
        monsterEvasion = value;
      }
    },
    monsterHrids: {
      enumerable: true,
      get() {
        return monsterHrids;
      },
      set(value) {
        monsterHrids = value;
      }
    }
  });

  // src/features/external-tools.js
  function addImportButtonForAmvoidguy() {
    const checkElem = () => {
      const selectedElement = document.querySelector(`button#buttonImportExport`);
      if (selectedElement) {
        clearInterval(timer);
        let button = document.createElement("button");
        selectedElement.parentNode.parentElement.parentElement.insertBefore(
          button,
          selectedElement.parentElement.parentElement.nextSibling
        );
        button.textContent = runtime.config.isZH ? "单人/组队导入(刷新游戏网页更新人物数据)" : "Import solo/group (Refresh game page to update character set)";
        button.style.backgroundColor = runtime.config.SCRIPT_COLOR_MAIN;
        button.style.padding = "5px";
        button.onclick = function() {
          console.log("Importer: Import button onclick");
          const getPriceButton = document.querySelector(`button#buttonGetPrices`);
          if (getPriceButton) {
            console.log("Click getPriceButton");
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
      isParty
    ] = constructGroupExportObj();
    console.log(exportObj);
    console.log(playerIDs);
    document.querySelector(`a#group-combat-tab`).click();
    const importInputElem = document.querySelector(
      `input#inputSetGroupCombatAll`
    );
    importInputElem.value = JSON.stringify(exportObj);
    document.querySelector(`button#buttonImportSet`).click();
    document.querySelector(`a#player1-tab`).textContent = playerIDs[0];
    document.querySelector(`a#player2-tab`).textContent = playerIDs[1];
    document.querySelector(`a#player3-tab`).textContent = playerIDs[2];
    document.querySelector(`a#player4-tab`).textContent = playerIDs[3];
    document.querySelector(`a#player5-tab`).textContent = playerIDs[4];
    if (zone) {
      if (isZoneDungeon) {
        document.querySelector(`input#simDungeonToggle`).checked = true;
        document.querySelector(`input#simDungeonToggle`).dispatchEvent(new Event("change"));
        const selectDungeon = document.querySelector(`select#selectDungeon`);
        for (let i = 0; i < selectDungeon.options.length; i++) {
          if (selectDungeon.options[i].value === zone) {
            selectDungeon.options[i].selected = true;
            break;
          }
        }
      } else {
        document.querySelector(`input#simDungeonToggle`).checked = false;
        document.querySelector(`input#simDungeonToggle`).dispatchEvent(new Event("change"));
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
          `select#selectDifficulty`
        );
        for (let i = 0; i < selectDifficulty.options.length; i++) {
          if (Number(selectDifficulty.options[i].value) === difficultyTier) {
            selectDifficulty.options[i].selected = true;
            break;
          }
        }
      }
    }
    for (let i = 0; i < 5; i++) {
      if (importedPlayerPositions[i]) {
        if (document.querySelector(
          `input#player${i + 1}.form-check-input.player-checkbox`
        )) {
          document.querySelector(
            `input#player${i + 1}.form-check-input.player-checkbox`
          ).checked = true;
          document.querySelector(
            `input#player${i + 1}.form-check-input.player-checkbox`
          ).dispatchEvent(new Event("change"));
        }
      } else {
        if (document.querySelector(
          `input#player${i + 1}.form-check-input.player-checkbox`
        )) {
          document.querySelector(
            `input#player${i + 1}.form-check-input.player-checkbox`
          ).checked = false;
          document.querySelector(
            `input#player${i + 1}.form-check-input.player-checkbox`
          ).dispatchEvent(new Event("change"));
        }
      }
    }
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
    const storedProfileList = JSON.parse(
      GM_getValue("profile_export_list", "[]")
    );
    const BLANK_PLAYER_JSON = `{"player":{"attackLevel":1,"magicLevel":1,"meleeLevel":1,"rangedLevel":1,"defenseLevel":1,"staminaLevel":1,"intelligenceLevel":1,"equipment":[]},"food":{"/action_types/combat":[{"itemHrid":""},{"itemHrid":""},{"itemHrid":""}]},"drinks":{"/action_types/combat":[{"itemHrid":""},{"itemHrid":""},{"itemHrid":""}]},"abilities":[{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"},{"abilityHrid":"","level":"1"}],"triggerMap":{},"zone":"/actions/combat/fly","simulationTime":"100","houseRooms":{"/house_rooms/dairy_barn":0,"/house_rooms/garden":0,"/house_rooms/log_shed":0,"/house_rooms/forge":0,"/house_rooms/workshop":0,"/house_rooms/sewing_parlor":0,"/house_rooms/kitchen":0,"/house_rooms/brewery":0,"/house_rooms/laboratory":0,"/house_rooms/observatory":0,"/house_rooms/dining_room":0,"/house_rooms/library":0,"/house_rooms/dojo":0,"/house_rooms/gym":0,"/house_rooms/armory":0,"/house_rooms/archery_range":0,"/house_rooms/mystical_study":0}}`;
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
      "Player 5"
    ];
    const importedPlayerPositions = [false, false, false, false, false];
    let zone = "/actions/combat/fly";
    let isZoneDungeon = false;
    let difficultyTier = 0;
    if (!characterObj?.partyInfo?.partySlotMap) {
      exportObj[1] = JSON.stringify(
        constructSelfPlayerExportObjFromInitCharacterData(
          characterObj,
          clientObj
        )
      );
      playerIDs[0] = characterObj.character.name;
      importedPlayerPositions[0] = true;
      for (const action of characterObj.characterActions) {
        if (action && action.actionHrid.includes("/actions/combat/")) {
          zone = action.actionHrid;
          difficultyTier = action.difficultyTier;
          isZoneDungeon = clientObj.actionDetailMap[action.actionHrid]?.combatZoneInfo?.isDungeon;
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
                clientObj
              )
            );
            playerIDs[i - 1] = characterObj.character.name;
            importedPlayerPositions[i - 1] = true;
          } else {
            const profileList = storedProfileList.filter(
              (item) => item.characterID === member.characterID
            );
            if (profileList.length !== 1) {
              console.log(
                "Can not find stored profile for " + member.characterID
              );
              playerIDs[i - 1] = runtime.config.isZH ? "需要点开资料" : "Open profile in game";
              i++;
              continue;
            }
            const profile = profileList[0];
            const battlePlayerList = battleObj.players.filter(
              (item) => item.character.id === member.characterID
            );
            let battlePlayer = null;
            if (battlePlayerList.length === 1) {
              battlePlayer = battlePlayerList[0];
            }
            exportObj[i] = JSON.stringify(
              constructPlayerExportObjFromStoredProfile(
                profile,
                clientObj,
                battlePlayer
              )
            );
            playerIDs[i - 1] = profile.characterName;
            importedPlayerPositions[i - 1] = true;
          }
        }
        i++;
      }
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
      isParty
    ];
  }
  function constructSelfPlayerExportObjFromInitCharacterData(characterObj, clientObj) {
    const playerObj = {};
    playerObj.player = {};
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
    playerObj.player.equipment = [];
    for (const item of characterObj.characterItems) {
      if (!item.itemLocationHrid.includes("/item_locations/inventory")) {
        playerObj.player.equipment.push({
          itemLocationHrid: item.itemLocationHrid,
          itemHrid: item.itemHrid,
          enhancementLevel: item.enhancementLevel
        });
      }
    }
    playerObj.food = {};
    playerObj.food["/action_types/combat"] = [];
    for (const food of characterObj.actionTypeFoodSlotsMap["/action_types/combat"]) {
      if (food) {
        playerObj.food["/action_types/combat"].push({
          itemHrid: food.itemHrid
        });
      } else {
        playerObj.food["/action_types/combat"].push({
          itemHrid: ""
        });
      }
    }
    playerObj.drinks = {};
    playerObj.drinks["/action_types/combat"] = [];
    for (const drink of characterObj.actionTypeDrinkSlotsMap["/action_types/combat"]) {
      if (drink) {
        playerObj.drinks["/action_types/combat"].push({
          itemHrid: drink.itemHrid
        });
      } else {
        playerObj.drinks["/action_types/combat"].push({
          itemHrid: ""
        });
      }
    }
    playerObj.abilities = [
      {
        abilityHrid: "",
        level: "1"
      },
      {
        abilityHrid: "",
        level: "1"
      },
      {
        abilityHrid: "",
        level: "1"
      },
      {
        abilityHrid: "",
        level: "1"
      },
      {
        abilityHrid: "",
        level: "1"
      }
    ];
    let normalAbillityIndex = 1;
    for (const ability of characterObj.combatUnit.combatAbilities) {
      if (ability && clientObj.abilityDetailMap[ability.abilityHrid].isSpecialAbility) {
        playerObj.abilities[0] = {
          abilityHrid: ability.abilityHrid,
          level: ability.level
        };
      } else if (ability) {
        playerObj.abilities[normalAbillityIndex++] = {
          abilityHrid: ability.abilityHrid,
          level: ability.level
        };
      }
    }
    playerObj.triggerMap = {
      ...characterObj.abilityCombatTriggersMap,
      ...characterObj.consumableCombatTriggersMap
    };
    playerObj.houseRooms = {};
    for (const house of Object.values(characterObj.characterHouseRoomMap)) {
      playerObj.houseRooms[house.houseRoomHrid] = house.level;
    }
    playerObj.achievements = {};
    for (const achievement of Object.values(characterObj.characterAchievements)) {
      playerObj.achievements[achievement.achievementHrid] = achievement.isCompleted;
    }
    return playerObj;
  }
  function constructPlayerExportObjFromStoredProfile(profile, clientObj, battlePlayer) {
    const playerObj = {};
    playerObj.player = {};
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
    playerObj.player.equipment = [];
    if (profile.profile.wearableItemMap) {
      for (const key in profile.profile.wearableItemMap) {
        const item = profile.profile.wearableItemMap[key];
        playerObj.player.equipment.push({
          itemLocationHrid: item.itemLocationHrid,
          itemHrid: item.itemHrid,
          enhancementLevel: item.enhancementLevel
        });
      }
    }
    playerObj.food = {};
    playerObj.food["/action_types/combat"] = [];
    playerObj.drinks = {};
    playerObj.drinks["/action_types/combat"] = [];
    if (battlePlayer?.combatConsumables) {
      for (const foodOrDrink of battlePlayer.combatConsumables) {
        if (foodOrDrink.itemHrid.includes("coffee")) {
          playerObj.drinks["/action_types/combat"].push({
            itemHrid: foodOrDrink.itemHrid
          });
        } else {
          playerObj.food["/action_types/combat"].push({
            itemHrid: foodOrDrink.itemHrid
          });
        }
      }
    } else {
      const weapon = profile.profile.wearableItemMap && (profile.profile.wearableItemMap["/item_locations/main_hand"]?.itemHrid || profile.profile.wearableItemMap["/item_locations/two_hand"]?.itemHrid);
      if (weapon) {
        if (weapon.includes("shooter") || weapon.includes("bow")) {
          playerObj.drinks["/action_types/combat"].push({
            itemHrid: "/items/wisdom_coffee"
          });
          playerObj.drinks["/action_types/combat"].push({
            itemHrid: "/items/super_ranged_coffee"
          });
          playerObj.drinks["/action_types/combat"].push({
            itemHrid: "/items/critical_coffee"
          });
          playerObj.food["/action_types/combat"].push({
            itemHrid: "/items/spaceberry_donut"
          });
          playerObj.food["/action_types/combat"].push({
            itemHrid: "/items/spaceberry_cake"
          });
          playerObj.food["/action_types/combat"].push({
            itemHrid: "/items/star_fruit_yogurt"
          });
        } else if (weapon.includes("boomstick") || weapon.includes("staff") || weapon.includes("trident")) {
          playerObj.drinks["/action_types/combat"].push({
            itemHrid: "/items/wisdom_coffee"
          });
          playerObj.drinks["/action_types/combat"].push({
            itemHrid: "/items/super_magic_coffee"
          });
          playerObj.drinks["/action_types/combat"].push({
            itemHrid: "/items/channeling_coffee"
          });
          playerObj.food["/action_types/combat"].push({
            itemHrid: "/items/spaceberry_cake"
          });
          playerObj.food["/action_types/combat"].push({
            itemHrid: "/items/star_fruit_gummy"
          });
          playerObj.food["/action_types/combat"].push({
            itemHrid: "/items/star_fruit_yogurt"
          });
        } else if (weapon.includes("bulwark")) {
          playerObj.drinks["/action_types/combat"].push({
            itemHrid: "/items/wisdom_coffee"
          });
          playerObj.drinks["/action_types/combat"].push({
            itemHrid: "/items/super_defense_coffee"
          });
          playerObj.drinks["/action_types/combat"].push({
            itemHrid: "/items/super_stamina_coffee"
          });
          playerObj.food["/action_types/combat"].push({
            itemHrid: "/items/spaceberry_donut"
          });
          playerObj.food["/action_types/combat"].push({
            itemHrid: "/items/spaceberry_cake"
          });
          playerObj.food["/action_types/combat"].push({
            itemHrid: "/items/star_fruit_yogurt"
          });
        } else {
          playerObj.drinks["/action_types/combat"].push({
            itemHrid: "/items/wisdom_coffee"
          });
          playerObj.drinks["/action_types/combat"].push({
            itemHrid: "/items/super_melee_coffee"
          });
          playerObj.drinks["/action_types/combat"].push({
            itemHrid: "/items/swiftness_coffee"
          });
          playerObj.food["/action_types/combat"].push({
            itemHrid: "/items/spaceberry_donut"
          });
          playerObj.food["/action_types/combat"].push({
            itemHrid: "/items/spaceberry_cake"
          });
          playerObj.food["/action_types/combat"].push({
            itemHrid: "/items/star_fruit_yogurt"
          });
        }
      }
    }
    playerObj.abilities = [
      {
        abilityHrid: "",
        level: "1"
      },
      {
        abilityHrid: "",
        level: "1"
      },
      {
        abilityHrid: "",
        level: "1"
      },
      {
        abilityHrid: "",
        level: "1"
      },
      {
        abilityHrid: "",
        level: "1"
      }
    ];
    if (profile.profile.equippedAbilities) {
      let normalAbillityIndex = 1;
      for (const ability of profile.profile.equippedAbilities) {
        if (ability && clientObj.abilityDetailMap[ability.abilityHrid].isSpecialAbility) {
          playerObj.abilities[0] = {
            abilityHrid: ability.abilityHrid,
            level: ability.level
          };
        } else if (ability) {
          playerObj.abilities[normalAbillityIndex++] = {
            abilityHrid: ability.abilityHrid,
            level: ability.level
          };
        }
      }
    }
    if (profile.profile.abilityCombatTriggersMap && profile.profile.consumableCombatTriggersMap) {
      playerObj.triggerMap = {
        ...profile.profile.abilityCombatTriggersMap,
        ...profile.profile.consumableCombatTriggersMap
      };
    }
    playerObj.houseRooms = {};
    for (const house of Object.values(profile.profile.characterHouseRoomMap)) {
      playerObj.houseRooms[house.houseRoomHrid] = house.level;
    }
    playerObj.achievements = {};
    for (const achievement of Object.values(
      profile.profile.characterAchievements
    )) {
      playerObj.achievements[achievement.achievementHrid] = achievement.isCompleted;
    }
    return playerObj;
  }
  async function observeResultsForAmvoidguy() {
    let resultDiv = document.querySelector(`div.row`)?.querySelectorAll(`div.col-md-5`)?.[2]?.querySelector(`div.row > div.col-md-5`);
    while (!resultDiv) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      resultDiv = document.querySelector(`div.row`)?.querySelectorAll(`div.col-md-5`)?.[2]?.querySelector(`div.row > div.col-md-5`);
    }
    const deathDiv = document.querySelector(`div#simulationResultPlayerDeaths`);
    const expDiv = document.querySelector(`div#simulationResultExperienceGain`);
    const consumeDiv = document.querySelector(
      `div#simulationResultConsumablesUsed`
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
    const isZHIn3rdPartyWebsites = localStorage.getItem("i18nextLng")?.toLowerCase()?.startsWith("zh");
    let perHourGainExp = {
      stamina: 0,
      intelligence: 0,
      attack: 0,
      melee: 0,
      defense: 0,
      ranged: 0,
      magic: 0
    };
    expNodes.forEach((expNode) => {
      if (runtime.api.getOriTextFromElement(expNode.children[0]).includes("Stamina") || runtime.api.getOriTextFromElement(expNode.children[0]).includes("耐力")) {
        perHourGainExp.stamina = Number(expNode.children[1].textContent);
      } else if (runtime.api.getOriTextFromElement(expNode.children[0]).includes("Intelligence") || runtime.api.getOriTextFromElement(expNode.children[0]).includes("智力")) {
        perHourGainExp.intelligence = Number(expNode.children[1].textContent);
      } else if (runtime.api.getOriTextFromElement(expNode.children[0]).includes("Attack") || runtime.api.getOriTextFromElement(expNode.children[0]).includes("攻击")) {
        perHourGainExp.attack = Number(expNode.children[1].textContent);
      } else if (runtime.api.getOriTextFromElement(expNode.children[0]).includes("Melee") || runtime.api.getOriTextFromElement(expNode.children[0]).includes("近战")) {
        perHourGainExp.melee = Number(expNode.children[1].textContent);
      } else if (runtime.api.getOriTextFromElement(expNode.children[0]).includes("Defense") || runtime.api.getOriTextFromElement(expNode.children[0]).includes("防御")) {
        perHourGainExp.defense = Number(expNode.children[1].textContent);
      } else if (runtime.api.getOriTextFromElement(expNode.children[0]).includes("Ranged") || runtime.api.getOriTextFromElement(expNode.children[0]).includes("远程")) {
        perHourGainExp.ranged = Number(expNode.children[1].textContent);
      } else if (runtime.api.getOriTextFromElement(expNode.children[0]).includes("Magic") || runtime.api.getOriTextFromElement(expNode.children[0]).includes("魔法")) {
        perHourGainExp.magic = Number(expNode.children[1].textContent);
      }
    });
    let data = GM_getValue("init_character_data", null);
    let obj = JSON.parse(data);
    if (!obj || !obj.characterSkills || !obj.currentTimestamp) {
      console.error("handleResult no character localstorage");
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
      "magic"
    ];
    let hTMLStr = "";
    for (const skill of skillNamesInOrder) {
      hTMLStr += `<div id="${"inputDiv_" + skill}" style="display: flex; justify-content: flex-end">${isZHIn3rdPartyWebsites ? skillLevels[skill].skillZhName : skillLevels[skill].skillName}${isZHIn3rdPartyWebsites ? "到" : " to level "}<input id="${"input_" + skill}" type="number" value="${skillLevels[skill].currentLevel + 1}" min="${skillLevels[skill].currentLevel + 1}" max="200">${isZHIn3rdPartyWebsites ? "级" : ""}</div>`;
    }
    hTMLStr += `<div id="script_afterDays" style="display: flex; justify-content: flex-end"><input id="script_afterDays_input" type="number" value="1" min="0" max="200">${isZHIn3rdPartyWebsites ? "天后" : "days after"}</div>`;
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
          isZHIn3rdPartyWebsites
        );
      };
      skillInput.addEventListener("keyup", function(evt) {
        calculateTill(
          skill,
          skillInput,
          skillLevels,
          parentDiv,
          perHourGainExp,
          isZHIn3rdPartyWebsites
        );
      });
      skillDiv.onclick = () => {
        calculateTill(
          skill,
          skillInput,
          skillLevels,
          parentDiv,
          perHourGainExp,
          isZHIn3rdPartyWebsites
        );
      };
    }
    const daysAfterDiv = parentDiv.querySelector(`div#script_afterDays`);
    const daysAfterInput = parentDiv.querySelector(
      `input#script_afterDays_input`
    );
    daysAfterInput.onchange = () => {
      calculateAfterDays(
        daysAfterInput,
        skillLevels,
        parentDiv,
        perHourGainExp,
        skillNamesInOrder,
        isZHIn3rdPartyWebsites
      );
    };
    daysAfterInput.addEventListener("keyup", function(evt) {
      calculateAfterDays(
        daysAfterInput,
        skillLevels,
        parentDiv,
        perHourGainExp,
        skillNamesInOrder,
        isZHIn3rdPartyWebsites
      );
    });
    daysAfterDiv.onclick = () => {
      calculateAfterDays(
        daysAfterInput,
        skillLevels,
        parentDiv,
        perHourGainExp,
        skillNamesInOrder,
        isZHIn3rdPartyWebsites
      );
    };
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
        `<div id="script_expense" style="background-color: #DCDCDC; color: black;">${expensesSpan.parentNode.textContent}</div><div id="script_revenue" style="background-color: #DCDCDC; color: black;">${revenueSpan.parentNode.textContent}</div>`
      );
    }
  }
  function calculateAfterDays(daysAfterInput, skillLevels, parentDiv, perHourGainExp, skillNamesInOrder, isZHIn3rdPartyWebsites) {
    const initData_levelExperienceTable2 = JSON.parse(
      GM_getValue("init_client_data", null)
    ).levelExperienceTable;
    const days = Number(daysAfterInput.value);
    parentDiv.querySelector(`div#needDiv`).textContent = `${isZHIn3rdPartyWebsites ? "" : "After"} ${days} ${isZHIn3rdPartyWebsites ? "天后：" : "days: "}`;
    const listDiv = parentDiv.querySelector(`div#needListDiv`);
    let html = "";
    let resultLevels = {};
    for (const skillName of skillNamesInOrder) {
      for (const skill of Object.values(skillLevels)) {
        if (skill.skillName.toLowerCase() === skillName.toLowerCase()) {
          const exp = skill.currentExp + perHourGainExp[skill.skillName.toLowerCase()] * days * 24;
          let level = 1;
          while (initData_levelExperienceTable2[level] < exp) {
            level++;
          }
          level--;
          const minExpAtLevel = initData_levelExperienceTable2[level];
          const maxExpAtLevel = initData_levelExperienceTable2[level + 1] - 1;
          const expSpanInLevel = maxExpAtLevel - minExpAtLevel;
          const levelPercentage = Number(
            (exp - minExpAtLevel) / expSpanInLevel * 100
          ).toFixed(1);
          resultLevels[skillName.toLowerCase()] = level;
          html += `<div>${isZHIn3rdPartyWebsites ? skill.skillZhName : skill.skillName} ${isZHIn3rdPartyWebsites ? "" : "level"} ${level} ${isZHIn3rdPartyWebsites ? "级" : ""} ${levelPercentage}%</div>`;
          break;
        }
      }
    }
    const combatLevel = 0.1 * (resultLevels.stamina + resultLevels.intelligence + resultLevels.defense + resultLevels.attack + Math.max(resultLevels.melee, resultLevels.ranged, resultLevels.magic)) + 0.5 * Math.max(
      resultLevels.attack,
      resultLevels.defense,
      resultLevels.melee,
      resultLevels.ranged,
      resultLevels.magic
    );
    html += `<div>${isZHIn3rdPartyWebsites ? "战斗等级：" : "Combat level: "} ${combatLevel.toFixed(1)}</div>`;
    listDiv.innerHTML = html;
  }
  function calculateTill(skillName, skillInputElem, skillLevels, parentDiv, perHourGainExp, isZHIn3rdPartyWebsites) {
    const initData_levelExperienceTable2 = JSON.parse(
      GM_getValue("init_client_data", null)
    ).levelExperienceTable;
    const targetLevel = Number(skillInputElem.value);
    parentDiv.querySelector(`div#needDiv`).textContent = `${isZHIn3rdPartyWebsites ? skillLevels[skillName].skillZhName : skillLevels[skillName].skillName} ${isZHIn3rdPartyWebsites ? "到" : "to level"} ${targetLevel} ${isZHIn3rdPartyWebsites ? "级 还需：" : " takes: "}`;
    const listDiv = parentDiv.querySelector(`div#needListDiv`);
    const currentLevel = Number(skillLevels[skillName].currentLevel);
    const currentExp = Number(skillLevels[skillName].currentExp);
    if (targetLevel > currentLevel && targetLevel <= 200) {
      if (perHourGainExp[skillName] === 0) {
        listDiv.innerHTML = isZHIn3rdPartyWebsites ? "永远" : "Forever";
      } else {
        let needExp = initData_levelExperienceTable2[targetLevel] - currentExp;
        let needHours = needExp / perHourGainExp[skillName];
        let html = "";
        html += `<div>[${hoursToReadableString(needHours)}]</div>`;
        const consumeDivs = document.querySelectorAll(
          `div#simulationResultConsumablesUsed div.row`
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
          selectedElement.nextSibling
        );
        button.textContent = runtime.config.isZH ? "导入人物数据 (刷新游戏网页更新人物数据)" : "Import character settings (Refresh game page to update character settings)";
        button.style.backgroundColor = runtime.config.SCRIPT_COLOR_MAIN;
        button.style.color = "black";
        button.style.padding = "5px";
        button.onclick = function() {
          console.log("Mooneycalc-Importer: Button onclick");
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
    if (!characterData || !characterData.characterSkills || !characterData.currentTimestamp) {
      button.textContent = runtime.config.isZH ? "错误：没有人物数据" : "Error: no character settings found";
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
    lsObj.state.settings.levels = {};
    for (const skill of characterData.characterSkills) {
      lsObj.state.settings.levels[skill.skillHrid] = skill.level;
    }
    lsObj.state.settings.communityBuffs = {};
    for (const buff of characterData.communityBuffs) {
      lsObj.state.settings.communityBuffs[buff.hrid] = buff.level;
    }
    lsObj.state.settings.equipment = {};
    lsObj.state.settings.equipmentLevels = {};
    for (const item of characterData.characterItems) {
      if (item.itemLocationHrid !== "/item_locations/inventory") {
        lsObj.state.settings.equipment[item.itemLocationHrid.replace("item_locations", "equipment_types")] = item.itemHrid;
        lsObj.state.settings.equipmentLevels[item.itemLocationHrid.replace("item_locations", "equipment_types")] = item.enhancementLevel;
      }
    }
    lsObj.state.settings.houseRooms = {};
    for (const house of Object.values(characterData.characterHouseRoomMap)) {
      lsObj.state.settings.houseRooms[house.houseRoomHrid] = house.level;
    }
    return JSON.stringify(lsObj);
  }
  function hoursToReadableString(hours) {
    const sec = hours * 60 * 60;
    if (sec >= 86400) {
      return Number(sec / 86400).toFixed(1) + (runtime.config.isZH ? " 天" : " days");
    }
    const d = new Date(Math.round(sec * 1e3));
    function pad(i) {
      return ("0" + i).slice(-2);
    }
    let str = d.getUTCHours() + "h " + pad(d.getUTCMinutes()) + "m " + pad(d.getUTCSeconds()) + "s";
    return str;
  }
  function addExportButton(obj) {
    const checkElem = () => {
      const selectedElement = document.querySelector(
        `div.SharableProfile_overviewTab__W4dCV`
      );
      if (selectedElement) {
        clearInterval(timer);
        const button = document.createElement("button");
        selectedElement.appendChild(button);
        button.textContent = runtime.config.isZH ? "导出人物到剪贴板" : "Export to clipboard";
        button.style.borderRadius = "5px";
        button.style.height = "30px";
        button.style.backgroundColor = runtime.config.SCRIPT_COLOR_MAIN;
        button.style.color = "black";
        button.style.boxShadow = "none";
        button.style.border = "0px";
        button.onclick = function() {
          let exportString = "";
          const playerID = obj.profile.characterSkills[0].characterID;
          const clientObj = JSON.parse(GM_getValue("init_client_data", ""));
          const characterObj = JSON.parse(GM_getValue("init_character_data", ""));
          if (playerID === characterObj.character.id) {
            exportString = JSON.stringify(
              constructSelfPlayerExportObjFromInitCharacterData(
                characterObj,
                clientObj
              )
            );
          } else {
            const storedProfileList = JSON.parse(
              GM_getValue("profile_export_list", "[]")
            );
            const profileList = storedProfileList.filter(
              (item) => item.characterID === playerID
            );
            let profile = null;
            if (profileList.length !== 1) {
              console.log("Can not find stored profile for " + playerID);
              return;
            }
            profile = profileList[0];
            let battlePlayer = null;
            if (GM_getValue("new_battle", "")) {
              const battleObj = JSON.parse(GM_getValue("new_battle", ""));
              const battlePlayerList = battleObj.players.filter(
                (item) => item.character.id === playerID
              );
              if (battlePlayerList.length === 1) {
                battlePlayer = battlePlayerList[0];
              }
            }
            exportString = JSON.stringify(
              constructPlayerExportObjFromStoredProfile(
                profile,
                clientObj,
                battlePlayer
              )
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
  var addImportButtonFor9Battles = addImportButtonForAmvoidguy;
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
    addExportButton
  });

  // src/features/message-effects.js
  runtime.onMessage("init_client_data", (payload, message) => {
    console.log(payload);
    GM_setValue("init_client_data", message);
  });
  runtime.onMessage("init_character_data", (payload, message) => {
    console.log(payload);
    GM_setValue("init_character_data", message);
    const settings = runtime.settings.settingsMap;
    if (settings.totalActionTime.isTrue) runtime.api.showTotalActionTime();
    runtime.api.waitForActionPanelParent();
    if (settings.skillbook.isTrue) runtime.api.waitForItemDict();
    if (settings.ThirdPartyLinks.isTrue) runtime.api.add3rdPartyLinks();
    if (settings.networth.isTrue) runtime.api.calculateNetworth();
    if (settings.checkEquipment.isTrue) runtime.api.checkEquipment();
    if (settings.notifiEmptyAction.isTrue) runtime.api.notificate();
    if (settings.fillMarketOrderPrice.isTrue) runtime.api.waitForMarketOrders();
  });
  runtime.onMessage("actions_updated", () => {
    const settings = runtime.settings.settingsMap;
    if (settings.checkEquipment.isTrue) runtime.api.checkEquipment();
    if (settings.notifiEmptyAction.isTrue)
      setTimeout(runtime.api.notificate, 1e3);
    if (settings.showDamage.isTrue && (runtime.state.currentActionsHridList.length === 0 || !runtime.state.currentActionsHridList[0].actionHrid.startsWith(
      "/actions/combat/"
    ))) {
      runtime.api.resetCombatState();
    }
  });
  runtime.onMessage("battle_unit_fetched", (payload) => {
    if (runtime.settings.settingsMap.battlePanel.isTrue)
      runtime.api.handleBattleSummary(payload);
  });
  runtime.onMessage("items_updated", () => {
    if (runtime.settings.settingsMap.checkEquipment.isTrue)
      runtime.api.checkEquipment();
  });
  runtime.onMessage("new_battle", (payload, message) => {
    GM_setValue("new_battle", message);
    if (runtime.settings.settingsMap.showDamage.isTrue)
      runtime.api.handleNewBattle(payload);
  });
  runtime.onMessage("battle_updated", (payload) => {
    if (runtime.settings.settingsMap.showDamage.isTrue && runtime.state.monstersHP.length) {
      runtime.api.handleBattleUpdated(payload);
    }
  });
  runtime.onMessage("profile_shared", (payload) => {
    let stored = GM_getValue("profile_export_list", null);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!parsed?.filter) {
        console.error(
          "Found invalid profileExportList in store. profileExportList cleared."
        );
        GM_setValue("profile_export_list", JSON.stringify([]));
      }
    } else {
      GM_setValue("profile_export_list", JSON.stringify([]));
    }
    payload.characterID = payload.profile.characterSkills[0].characterID;
    payload.characterName = payload.profile.sharableCharacter.name;
    payload.timestamp = Date.now();
    stored = GM_getValue("profile_export_list", null) || JSON.stringify([]);
    const profiles = JSON.parse(stored).filter(
      (item) => item.characterID !== payload.characterID
    );
    profiles.unshift(payload);
    if (profiles.length > 20) profiles.pop();
    GM_setValue("profile_export_list", JSON.stringify(profiles));
    runtime.api.addExportButton(payload);
    if (runtime.settings.settingsMap.profileBuildScore.isTrue)
      runtime.api.showBuildScoreOnProfile(payload);
  });

  // src/main.js
  function loadCachedClientData() {
    if (!localStorage.getItem("initClientData")) return;
    const clientData = localStorageUtil.getInitClientData();
    console.log(clientData);
    GM_setValue("init_client_data", JSON.stringify(clientData));
    runtime.state.initData_actionDetailMap = clientData.actionDetailMap;
    runtime.state.initData_levelExperienceTable = clientData.levelExperienceTable;
    runtime.state.initData_itemDetailMap = clientData.itemDetailMap;
    runtime.state.initData_actionCategoryDetailMap = clientData.actionCategoryDetailMap;
    runtime.state.initData_abilityDetailMap = clientData.abilityDetailMap;
    for (const [key, value] of Object.entries(
      runtime.state.initData_itemDetailMap
    )) {
      runtime.state.itemEnNameToHridMap[value.name] = key;
    }
  }
  function startGame() {
    loadCachedClientData();
    runtime.api.hookWS();
    const currentApiVersion = 2;
    const storedApiVersion = localStorage.getItem(
      "MWITools_marketAPI_ApiVersion"
    );
    if (!storedApiVersion || parseInt(storedApiVersion) < currentApiVersion) {
      console.log("Clearing API cache due to ApiVersion update");
      localStorage.setItem("MWITools_marketAPI_timestamp", JSON.stringify(0));
      localStorage.setItem("MWITools_marketAPI_json", JSON.stringify(null));
      localStorage.setItem(
        "MWITools_marketAPI_ApiVersion",
        JSON.stringify(currentApiVersion)
      );
    }
    runtime.api.fetchMarketJSON(true);
    runtime.start();
  }
  function main() {
    runtime.api.readSettings();
    if (document.URL.includes("amvoidguy.github.io") || document.URL.includes("shykai.github.io/MWICombatSimulatorTest/")) {
      runtime.api.addImportButtonForAmvoidguy();
      runtime.api.observeResultsForAmvoidguy();
      return;
    }
    if (document.URL.includes("shykai.github.io/mwisim")) {
      runtime.api.addImportButtonFor9Battles();
      runtime.api.observeResultsForAmvoidguy();
      return;
    }
    if (document.URL.includes("mooneycalc.netlify.app")) {
      runtime.api.addImportButtonForMooneycalc();
      return;
    }
    startGame();
  }
  main();
})();
