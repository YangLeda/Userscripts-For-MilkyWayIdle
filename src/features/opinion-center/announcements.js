const STORAGE_KEY = "MWITools_opinion_center_seen_announcements_v1";

export const ANNOUNCEMENTS = Object.freeze([
  Object.freeze({
    id: "26.4.11",
    version: "26.4.11",
    publishedAt: "2026-08-14",
    title: Object.freeze({
      zh: "26.4.11 重要更新公告",
      en: "Important version 26.4.11 update",
    }),
    body: Object.freeze({
      zh: Object.freeze([
        "优化库存首次打开和切换性能：强化装备会复用相同的概率方案，制作、精炼与商店来源改为按目标物品查找，并减少汇总和排序控件的首屏样式计算；总资产、分类价值和排序仍会同步完整显示。",
        "修复手机端开启“规划”后角色页明显卡顿、规划界面可能迟迟无法加载的问题；规划编辑器现在只在首次点开时构建，响应式布局切换不会反复创建隐藏界面，生产目标也改为按产物索引查找并可在角色数据加载期间正常识别。",
        "新增游戏原生小紫牛风格的性能初始化引导，新装与升级后可先选择生活、战斗或平衡用途，再使用流畅优先、标准、完整功能或分组自定义档位；手机与触屏设备默认推荐流畅优先，桌面默认推荐标准。引导会一次性设置 DPS、Buff 倒计时、任务与资产、公会增强、装饰动画、DPS 趋势图和 1/2 秒刷新节奏，利润等复杂悬浮计算仍统一使用按键或长按触发；左上角总进度会在自定义流程中显示当前步数，应用配置后自动刷新页面。可在通用设置顶部查看当前配置并随时重新开始，取消不会覆盖已有选择。首次启动会先保留消息与数据核心，确认配置后才启动可选功能，避免升级时先全量初始化造成卡顿。",
        "检测到铁牛或旧铁牛角色时，现在会自动开启铁牛模式适配，隐藏该模式不可用的市场价格、交易利润与市场采购操作；切回普通角色时这些功能仍会正常显示。",
        "库存排序旁恢复“刷新价值”按钮，可在需要时主动生成新资产快照，同时保留当前排序与摘要展开状态；购物清单新增鼠标和触屏拖动排序并按角色、服务器保存，清单行与“清空未收藏”按钮也会在库存和价格更新时保持稳定，不再反复重建闪烁。",
        "强化行动的剩余时间改为原位更新，并会在原生强化数量文字短暂缺失时沿用同一行动最后一次有效数量，不再闪成无限或消失。本次生产总耗时已移到数量、无限与最大控制右侧，以无边框的“耗时”文字显示；购物车与生产摘要的英文界面也改用更清晰的系统字体。",
        "行动队列更新现在按行动 ID 合并、去重并按真实序号排序，上下重排后会在已打开的队列内立即刷新耗时。遇到无限行动时保留此前可达的有限总时长并显示“有限时长 + ∞”，无限后的行动不再计算或残留旧时间；队列关闭后会立即停止相关观察与延迟校验。",
        "重复插件提醒新增 MWI TaskManager 识别，仅在任务排序标记与其专用任务、行动、战斗或副本标记组合出现时提示，避免单个通用页面标记造成误报。",
        "通用设置新增“悬浮窗口字号”，可在标准、较大和最大三档之间即时切换生产利润、宝箱估值与强化成本窗口的文字大小；只更新悬浮层样式，不影响游戏原生提示和页面布局。",
        "修复资产中心在强化等高频资产更新期间反复重建当前页面，导致按钮无法点击、图表悬浮提示消失的问题；打开期间现在保持按钮和画布节点稳定，只原位更新顶部资产数字。",
        "优化手机端资产中心的图表生命周期：隐藏的盈亏页不再持续重建图表，打开资产中心时会先释放底层画布，离开资产页后也会立即停止图表工作，避免游戏持续卡顿。",
        "修复 DPS 职业可能长期沿用旧自动缓存的问题；本场明确的武器与近战、魔法战斗属性现在会纠正旧结果，手动指定仍保持最高优先级，只有无法仅凭攻速可靠区分的弓弩继续保留已有精确装备识别。",
        "DPS 面板新增使用“稳定射击”图标的实时命中率排行，可查看每位玩家的可靠直伤命中数与出手数；悬停玩家行可查看对各怪物的命中率。统计会保存到新战斗历史，并排除辅助、持续伤害、反伤与无法归属的同帧结算，避免显示误导数字。",
        "修复 DPS 标题栏在游戏图集尚未加载时永久缺失大部分图标的问题；伤害、恢复、承伤、命中率、历史与设置的官方图标会在资源就绪后自动补回，并兼容游戏调整后的图集路径。",
        "修复角色初始化或重新连接时生产缺料提示可能先读取旧库存的问题；现在直接使用本次角色消息中的完整库存建立快照，避免材料充足却被误报缺少。",
        "恢复发布脚本原有的可读构建，并改为压缩内置备用行情数据，使脚本保持在 Greasy Fork 大小上限以内；备用行情仅在网络行情与缓存均不可用时解压一次，不增加外部 CDN 依赖。",
        "游戏物品、行动、怪物、技能、副本与 Buff 现在直接使用当前游戏版本的官方客户端数据和当前语言资源，覆盖全部九种游戏语言；已移除内置旧中文实体表、固定副本名单、漂移的技能时长和带构建哈希的图标地址。数据在启动时从游戏本地缓存读取一次并按版本保存语言资源，不轮询服务器、不预载其他语言，也不会新增游戏数据网络请求。",
        "修复部分浏览器在资产快照刷新或切换角色页面时抛出 contains 权限错误、导致资产图表刷新失败的问题；图表现在只会在画布仍连接页面时绘制，并会安全处理游戏界面重建。",
        "修复打开角色页“盈亏”后隐藏状态监听与图表重建相互触发、导致单核 CPU 持续占满的问题；盈亏页现在会在界面稳定后停止工作，行动、公会、任务、角色页与顶部入口也会共享重复的页面观察，降低默认运行开销。",
        "恢复任务页地牢筛选按钮的官方图标；即使当前页面尚未加载行动图集，也会从游戏资源清单补全图集地址并自动替换菱形占位符。属于地牢的怪物任务卡现在也会在怪物图旁显示所有匹配地牢的同尺寸图标。",
        "修复眼球怪、灵魂猎手等同时出现在多个地牢的战斗任务只显示首个地牢的问题；怪物任务现在会完整显示官方刷怪数据中的全部匹配地牢，明确以地牢为目标的任务仍只显示自身地牢。",
        "恢复食物与饮品的回复性价比悬浮提示，可按市场价值查看回复 100 血或蓝所需金币；设置中的“消耗品性价比”默认开启，不再显示旧版的每分钟回复和理论每日用量。",
        "优化任务页打开速度：官方名称回退和图集地址现在按当前游戏数据复用，旧地图序号会直接沿用任务分类结果，避免每张任务卡重复扫描整套实体数据和全页图标。",
        "DPS 命中率悬浮明细现在会在怪物名称前显示对应的官方怪物图标，多个目标更容易快速区分。",
        "新增自托管更新源发布流程；发布前会校验脚本、元数据、版本和更新地址，并在 CDN 缓存刷新完成后再确认成功，避免损坏的更新文件或旧脚本被发布。",
      ]),
      en: Object.freeze([
        "Improved first-open and switching performance for Inventory: enhanced equipment now reuses matching probability plans, production, refining, and shop sources are looked up by target item, and the summary and sorting controls do less first-frame style work. Total assets, category values, and sorting still appear synchronously and in full.",
        "Fixed severe character-page lag and Planning sometimes failing to load on mobile while the feature was enabled. The Planning editor is now built only when first opened, responsive layout switches no longer recreate a hidden editor, and production targets use an output index so they remain discoverable while character data is loading.",
        "Added a native Purple Cow-style performance setup for fresh installs and upgrades. Choose Skilling, Combat, or Balanced, then Smooth, Standard, Full features, or grouped Custom settings; phones and touch devices recommend Smooth while desktop recommends Standard. The guide atomically configures DPS, buff countdowns, tasks and assets, guild enhancements, decorative motion, DPS graphs, and one- or two-second refresh cadence, while detailed profit calculations continue to require a held key or long press. An overall progress bar in the upper-left tracks custom steps, and applying the profile now refreshes the page automatically. General settings show the active profile and can restart the guide without changing anything when cancelled. Startup keeps message and data services available but waits to initialize optional features until the profile is confirmed, avoiding an all-features-first upgrade spike.",
        "Detecting an Iron Cow or Legacy Iron Cow character now automatically enables Iron Cow adaptation, hiding marketplace prices, trading profit, and marketplace procurement actions that are unavailable in those modes; these features remain visible after switching back to a standard character.",
        "A Refresh values button has returned beside Inventory sorting, letting players create a fresh asset snapshot on demand while preserving the selected sort and expanded summary. Shopping-list rows can now be reordered with mouse or touch and persist per character and server; keyed rows and the Clear unfavorited button also stay mounted during inventory and price updates instead of being rebuilt and flickering.",
        "Enhancement remaining time now updates in place and keeps the last valid native quantity for the same action when that text briefly disappears, preventing the estimate from flashing to infinity or vanishing. Production duration now appears as unboxed Duration text to the right of the quantity, infinity, and Max controls, and English Shopping Cart and Production Summary surfaces use a clearer system UI font stack.",
        "Action updates now merge and deduplicate by action ID and sort by the authoritative ordinal, so moving actions up or down refreshes an open queue immediately. The queue keeps every reachable finite duration before the first infinite action and displays “finite duration + ∞”; actions after infinity are not calculated and stale timing is removed. Queue observers and transition checks stop as soon as the menu or feature closes.",
        "Duplicate-script warnings now recognize MWI TaskManager only when its task-sort marker appears together with its task, action, combat, or dungeon markers, avoiding false positives from a single generic page ID.",
        "General settings now include Tooltip panel font size, with Standard, Large, and Largest options that update production profit, loot valuation, and enhancement cost text immediately. Only the floating panel styles change, leaving native game tooltips and page layout untouched.",
        "Fixed Asset Center repeatedly rebuilding the active page during high-frequency asset updates such as Enhancement, which made buttons unclickable and chart hover tooltips disappear. Open pages now keep their controls and canvas mounted while only the top asset figures update in place.",
        "Optimized Asset Center chart lifecycles on mobile: hidden P/L pages no longer rebuild charts, opening Asset Center releases the underlying canvas first, and leaving the asset page stops chart work immediately to prevent ongoing game lag.",
        "Fixed DPS roles remaining stuck on stale automatic classifications. Explicit current-battle weapon, melee, and magic evidence now corrects old results, manual choices remain highest priority, and existing exact equipment detection is preserved only when attack speed alone cannot reliably distinguish bows from crossbows.",
        "Added a live accuracy ranking to the DPS panel with the Steady Shot icon, showing each player's reliably resolved direct hits and attempts; hovering a player shows accuracy against each monster. New combat history retains these statistics, while support actions, damage-over-time ticks, reflected damage, and ambiguous simultaneous resolutions are excluded to avoid misleading results.",
        "Fixed most DPS title-bar icons remaining permanently missing when the game sprites had not loaded yet. The official damage, healing, damage-taken, accuracy, history, and settings icons now appear automatically once resources are ready and remain compatible with changed sprite paths.",
        "Fixed production shortage hints occasionally reading stale inventory during character initialization or reconnection. They now build their snapshot directly from the complete inventory in the current character message, preventing materials already owned from being reported as missing.",
        "Restored the original readable userscript build and compressed its embedded backup market data to stay within Greasy Fork's size limit. The backup is decompressed once only when both live and cached prices are unavailable, with no external CDN dependency added.",
        "Game items, actions, monsters, abilities, dungeons, and buffs now use official client data and the active locale resources for the current game version across all nine game languages. The bundled legacy Chinese entity table, fixed dungeon rosters, drifting ability durations, and build-hashed sprite URLs have been removed. Data is read once from the game's local cache at startup and locale resources are cached per version, without server polling, preloading other languages, or adding game-data network requests.",
        "Fixed some browsers throwing a contains permission error during asset snapshot refreshes or Character page switches, which could stop asset charts from refreshing. Charts now render only while their canvas remains connected and safely handle game UI rebuilds.",
        "Fixed the Character-page P/L view saturating one CPU core when hidden-state observation repeatedly triggered chart rebuilds. P/L now becomes idle once the UI settles, while action, guild, task, Character-page, and header features share duplicate page observers to reduce default runtime overhead.",
        "Restored the official icons on Task-page dungeon filters. When the current page has not loaded the action sprite yet, MWITools now completes its sprite registry from the game asset manifest and automatically replaces the diamond placeholders. Monster task cards now also show same-size icons for every matching dungeon beside the monster artwork.",
        "Fixed combat tasks for Eye, Soul Hunter, and other monsters found in multiple dungeons showing only the first dungeon. Monster tasks now show every matching dungeon in the official spawn data, while tasks explicitly targeting a dungeon still show only that dungeon.",
        "Restored recovery-efficiency details in food and drink tooltips, showing the market-value cost to restore 100 HP or MP. The Consumable efficiency setting is enabled by default without bringing back the old recovery-per-minute or theoretical daily-use figures.",
        "Improved Task-page opening speed by reusing official-name fallbacks and sprite locations for the current game data. Legacy zone labels now consume the existing task classification instead of rescanning every card, the full entity catalog, and page-wide icons.",
        "DPS accuracy details now show each monster's official icon beside its name, making multiple targets easier to distinguish at a glance.",
        "Added the self-hosted update-channel publishing flow. It validates the script, metadata, version, and update URLs before publishing, then waits for CDN cache invalidation before confirming success so broken update files or stale scripts are not released.",
      ]),
    }),
  }),
  Object.freeze({
    id: "26.4.9",
    version: "26.4.9",
    publishedAt: "2026-08-13",
    title: Object.freeze({
      zh: "26.4.9 更新公告",
      en: "Version 26.4.9 update",
    }),
    body: Object.freeze({
      zh: Object.freeze([
        "修复角色页“规划”标签被误认成游戏原生“配装”标签，导致点击后立即重建并关闭；“盈亏”和“规划”现在会稳定共存，点击后保持打开。",
        "“规划”已从采购抽屉移到角色页“盈亏”旁，并改用带游戏原生物品与房屋技能图标的稳定搜索选择器，数据刷新时不再反复重建输入区或让已打开的选择菜单消失；项目对应的采购项全部买完或清除后，项目也会自动删除。",
        "新增独立“规划”计算器，可按物品最终持有量与房屋目标等级递归汇总制作步骤和基础材料；采购抽屉原“计划”更名为“项目”，购物车会分别记录手工、项目与规划来源，多项目统一分配库存，项目完成或规划需求降低时释放数量会转为手工来源而不会静默删除。",
        "规划改为“选择目标 → 选择制作方式 → 基础材料清单”三步流程：第一次计算只展开可按房屋来源分别调整的全链条制作、单步制作或直接购买策略，第二次计算才生成清单；共享物品的混合策略不再污染展开项，房屋名称支持中文，目标行和英文策略开关也更加紧凑稳定。无变化的游戏数据不再清空第 2 步，返回目标页会保留已生成的制作方式；添加器开关在常用宽度保持同排并完整显示，英文购买策略精简为 Buy，最终清单数量改用向上取整的千分位整数。角色页观察与隐藏面板更新也已收窄，减少滚动和切页卡顿。",
        "排行榜徽章新增总等级、迷宫深度、智力、耐力和任务积分，并使用游戏原生图标；徽章名次不再显示 # 前缀，个人主页会在姓名下方完整展示全部徽章，其他位置只保留名次最靠前的三个，好友列表则保持在姓名右侧；前五名彩色徽章默认启用一秒横扫白光、一秒右上角呼吸闪光和三秒停顿循环，也可在设置中关闭。",
        "修复切换到技能页再返回库存后，战斗与生活着装评分、总资产可能被残留的隐藏状态遮住；摘要和排序栏现在始终跟随游戏原生库存面板显隐，即使复用旧节点或晚到回调再次写入隐藏状态也会保持可见。",
        "库存中的战斗着装评分、生活着装评分和总资产现在会在本次页面会话首次计算后保持不变；技能、装备、资产或市场数据变化只会恢复原有显示，游戏在切换技能后单独移除摘要时也会自动补回，刷新网页后才会重新计算。",
        "修复生产面板重建、存在嵌套容器或更换战斗技能后，目标等级和生产次数快捷输入不显示；插件现在会识别实际弹窗表单，并在技能数据与面板先后更新时稳定恢复整组生产扩展。",
        "生活装备提醒现在使用当前游戏的红色厨师帽标识；红色厨师帽、掌上监工、收藏家靴和附魔手套穿戴后都会计入生活着装评分。",
        "任务筛选现在默认全部未选并显示所有任务，选择多个专业、战斗或副本时按并集显示，副本也可独立筛选；新增一键重置筛选，桌面端全部筛选按钮保持同一行，移动端按空间换行。",
        "总等级下方的意见中心左侧新增快捷设置齿轮，可在随时打开的浮窗中搜索并调整完整 MWITools 设置；设置页与快捷浮窗共享相同状态并立即生效。",
        "顶部当前动作条和行动队列中的每项动作现在统一显示纯剩余时长与括号内的 24 小时制结束时间，不再显示剩余次数或多余文字标签；结束时间跨日时会用第二组括号标记 +1 天、+2 天等实际相隔天数，队列总时间也会显示最终结束时刻。",
        "修复游戏改用独立饮品栏消息后，本次生产摘要没有及时读取加工茶的问题；现在切换加工茶后会立即按实际加工率拆分原料与加工品产出，并同步更新产出数量和利润，其他生产规划也会使用最新饮品栏。",
        "26.4.9 已标记为重要更新；仍在使用旧版本的玩家会收到顶部更新提示，以便及时获得本次规划、任务筛选、快捷设置、时间显示及生产修复。",
        "修复前五名排行榜徽章的闪光设置在徽章已经显示后可能不立即刷新，并隔离相关回归验证，避免较慢环境把正常的延迟渲染误判为失败。",
        "修复手机端切换到响应式角色面板后“规划”标签仍留在隐藏桌面面板的问题；规划现在会精确跟随可见的手机页签栏，并继续显示在“盈亏”旁。设置中也新增默认开启的独立“规划计算器”开关，不再与购物车和采购功能共用开关。第 2、3 步计算现在只滚动规划面板内部，不再把游戏页面推高并露出底部空白。第 2 步还会锁定点击计算时的库存与项目占用快照，后续游戏数据更新不会再让结果闪现后消失，第 3 步也不会改用更新后的库存；只有重新计算第 2 步才会换用新库存。“所需”数量现在显示扣除快照库存后的实际制作缺口，不再误显示最终持有目标总量；基础材料的“已覆盖/还需”也只按实际库存判断，不再把购物车数量当成已经持有。物品耗尽时，即使游戏的零数量更新省略了原堆叠 ID，采购库存缓存也会正确移除旧条目，不再把已经用完的碎片或其他物品算作仍然持有。",
      ]),
      en: Object.freeze([
        "Fixed the character-page Planning tab being mistaken for the native Loadout tab, which rebuilt and closed it immediately after a click. P/L and Planning now coexist reliably and Planning stays open after selection.",
        "Planning has moved from the procurement drawer to a character tab beside P/L, with stable item and house pickers that use native game item and skill icons and no longer rebuild the input area or close an open menu during data refreshes. Projects are also removed automatically once all of their shopping rows are purchased or cleared.",
        "MWITools now includes an independent Planning calculator that recursively summarizes production steps and base materials from final item holdings and house-level targets. Procurement “Plans” are now “Projects”; manual, project, and planning cart sources are tracked separately, multiple projects share inventory allocation correctly, and quantities released by completed projects or reduced planning demand become manual instead of being silently removed.",
        "Planning now follows three explicit steps: choose targets, choose production methods, then calculate the base-material list. The first calculation only opens per-target Full chain, One step, or Buy decisions, while the second creates the list. Mixed shared items no longer contaminate expanded source policies, house names are localized in Chinese, and compact target rows and English policy controls fit more reliably. Unchanged game data no longer clears Step 2 when returning from the List; picker policy controls stay inline and fully visible at common widths, the English purchase option is shortened to Buy, and final-list quantities use comma-grouped integers rounded up to cover demand. Narrower character-page observation plus deferred hidden-panel updates also reduce scrolling and tab-switching stutter.",
        "Leaderboard badges now include Total Level, Labyrinth Depth, Intelligence, Stamina, and Task Points with native game icons. Badge ranks no longer show a # prefix, profiles show every badge on a second row below the name, other locations keep only the three best ranks, and friend-list badges stay beside the name. Top-five rainbow badges now enable a one-second white sweep, a one-second upper-right breathing glint, and a three-second pause by default, with an option to turn the effect off.",
        "Fixed combat and skilling gear scores and total assets being obscured by a stale hidden state after switching to Abilities and returning to Inventory. The summary and sorting bar now always follow the native Inventory panel, remaining visible even when a reused node or delayed callback writes another hidden state.",
        "Combat gear score, skilling gear score, and total assets in Inventory now stay fixed after their first calculation in the current page session. Ability, equipment, asset, and market updates only restore the existing display, including when the game removes the summary separately after an ability change; reloading the page recalculates it.",
        "Fixed target-level controls and production count shortcuts not appearing after production-panel rebuilds, nested containers, or combat ability changes. MWITools now identifies the actual modal form and reliably restores the full extension group when ability data and the panel update at different times.",
        "Skilling equipment reminders now use the current Red Culinary Hat identifier. Red Culinary Hat, Eye Watch, Collector's Boots, and Enchanted Gloves all contribute to skilling gear score while equipped.",
        "Task filters now start unselected while showing every task, combine selected professions, combat, and dungeons as a union, and let dungeon filters work independently. A one-click reset was added; desktop keeps every filter on one row while mobile wraps as needed.",
        "A quick-settings gear now sits to the left of the Feedback Center below Total Level, opening the complete searchable MWITools settings in an always-available popover. The settings page and quick panel share state and apply changes immediately.",
        "The top current-action bar and every action in the queue now share the same plain time-remaining and parenthesized 24-hour finish-time format, without remaining counts or extra text labels. A second parenthetical marker shows +1 day, +2 days, and so on after midnight, and the queue total now includes its final finish time.",
        "Fixed Production Summary not picking up Processing Tea after the game moved drink-slot changes to a dedicated message. Switching Processing Tea now immediately splits raw and processed output at the effective rate, updates quantities and profit, and keeps other production planning on the latest drink loadout.",
        "Version 26.4.9 is now marked as an important update. Players still on an older release will see the top update prompt so they can receive the new planner, task filters, quick settings, timing display, and production fixes.",
        "Fixed the top-five leaderboard badge glint setting not always refreshing badges that were already visible, and isolated its regression coverage so slower environments no longer mistake normal deferred rendering for a failure.",
        "Fixed Planning remaining attached to a hidden desktop character panel after mobile switched to its responsive panel. Planning now follows the visible mobile tab bar precisely and stays beside P/L. Settings also include a separate Planning calculator switch, enabled by default and independent from shopping cart and procurement features. Step 2 and Step 3 calculations now scroll only inside Planning, preventing the game page from jumping upward and exposing a blank strip. Step 2 also locks the inventory and project-reservation snapshot from the moment Calculate is clicked: later game updates no longer make the result flash and disappear, Step 3 does not switch to newer inventory, and only recalculating Step 2 captures a new snapshot. Required quantities now show the actual production shortage after snapshot inventory instead of the final holding target total; base-material Covered/Need status also reflects actual inventory without treating cart quantities as already owned. When a stack is depleted, the procurement inventory cache now removes its old entry even if the game's zero-count update omits the original stack ID, so consumed fragments and other items are no longer counted as still owned.",
      ]),
    }),
  }),
  Object.freeze({
    id: "26.4.8",
    version: "26.4.8",
    publishedAt: "2026-08-13",
    title: Object.freeze({
      zh: "26.4.8 更新公告",
      en: "Version 26.4.8 update",
    }),
    body: Object.freeze({
      zh: Object.freeze([
        "生产面板改用稳定挂载区：切换配装或游戏重建面板后，次数快捷输入、本次生产摘要、缺料提示和目标等级会自动恢复且不再重复；未填写数量与材料充足时也保持稳定占位，且不会再让弹窗持续变高，可在设置中隐藏仅材料充足的提示。",
        "本次生产摘要默认折叠，并可改为始终展开或关闭；新增三档 MWITools 字号，仅调整插件界面，改善生产、采购、库存价值、设置与利润详情中的小字阅读。",
        "总资产默认计入公会代币与奇幻、阴森、秘法、海盗地下城代币，并统一归入不可交易代币；设置中可关闭，当前资产、库存分类和后续历史快照会使用相同口径。",
        "普通物品悬浮窗新增效率与贪心两档生产总成本（含材料与茶饮），订单簿缺价时使用市场价值兜底，并提示自定义按键与移动端长按查看完整详情。",
        "装备分类恢复市场价值、出售价和收购价排序，并按强化等级与整堆数量显示价值角标；效率茶继续读取游戏 Buff 数据，回归验证基础效果为 +10%，数字 5 仅代表持续 5 分钟。",
        "降低手机端空闲、生产、市场和战斗统计的后台轮询与重复计算，修复反复打开行动队列后的内存占用增长，减少长时间挂机时的发热、耗电和卡顿。",
        "任务自动返回现在只恢复任务列表内部的滚动位置，并会等待列表布局稳定；新任务同时进入队列时不再把整个页面滚到空白区域。顶部当前动作时间也改为跟随游戏原生字号，并在可用空间不足时隐藏预计完成时间以保持紧凑。",
        "手机端长按打开生产收益、宝箱估值或强化成本后，松手及原生物品提示消失时详情会继续显示；点击详情内部可滚动或操作，只有点击窗口外才会关闭。",
        "制造和指定次数强化的多材料余缺提示改为固定四列逐行对齐，不再横向撑宽；物品价格会下移避开强化等级，同时保留原有文字样式。",
        "技能书计算器新增“加入购物车”，会自动扣除当前库存和购物车已有数量，只加入达到目标等级所需的净缺口。",
        "公会信用兑换推荐默认显示 3 个方案，并可在设置中通过下拉菜单自由选择显示 1–8 个；修改后已打开的推荐会立即更新。",
        "移动端意见中心压缩了表单和公告的空白，输入框会按内容与屏幕高度自适应；标题与三个页签保持可见，公告和表单改为弹窗正文内独立滚动。",
        "任务筛选移除不会出现的炼金与强化类型；桌面端会尽量将生活技能和战斗筛选排在同一行，空间不足时五个战斗按钮会整组换行，同时通过缓存任务解析与战斗索引降低大量任务时的卡顿。",
        "排行榜徽章改用游戏原生技能与名望图标，不再从 MWITools 排行榜服务器加载图标文件。",
        "公会成员与好友列表的排行榜徽章改为在名字下方紧凑排列，不再挤压或截断角色名；名字颜色设置中的角色预览也会显示对应徽章。",
        "修复重置任务后卡片被原地复用时，“前往”仍按旧任务计算合并数量；现在会根据当前卡片和最新任务数据重新汇总。",
        "战斗模拟器重新从最近一场战斗读取队友实际携带的食物和咖啡；尚未取得对应战斗数据时，组队导入也不再中断。",
        "修复中英文下顶部当前动作时间在窄窗口中与动作名称或排队按钮重叠；可用空间不足时会自动精简显示。",
        "修复刷新任务或页面时任务图标串位、被替换后消失，以及火车提示漂移并撑出横向滚动条；普通任务不再显示“无需火车”。",
        "修复开启任务战斗地图序号后，任务统计、筛选和背景图标整组不显示；任务身份匹配现在会忽略插件自身的“图N”标记，并能按目标怪物识别战斗任务。",
        "生产、全链条与火车现在统一读取当前茶饮、社区等行动增益和暴饮之囊；换茶后会即时重算，链条按实际产量规划，采集利润与队列耗时不再漏算社区速度。",
      ]),
      en: Object.freeze([
        "Production panels now use a stable mount area. Quick counts, production summary, shortage hints, and target level automatically return once a loadout switch or game render replaces the panel, without duplicates. Waiting and ready states keep their space stable without making the dialog grow continuously, with an option to hide only the ready hint.",
        "Production summary is collapsed by default and can be set to always expanded or off. Three MWITools font-size levels improve small text in production, procurement, inventory values, settings, and profit details without changing the game's native UI.",
        "Total assets now include Guild, Chimerical, Sinister, Enchanted, and Pirate Tokens by default under non-tradable tokens. The setting applies the same inclusion rule to current assets, inventory categories, and future history snapshots.",
        "Regular item tooltips now show Efficiency and Greedy total production costs including materials and drinks, fall back to market value when an order-book side is missing, and explain the custom-key or mobile long-press gesture for full details.",
        "Equipment categories once again support market-value, ask, and bid sorting with value badges based on enhancement and full stack count. Efficiency Tea remains driven by game Buff data, with regression coverage confirming +10% base effect while 5 only means five minutes of duration.",
        "Reduced background polling and repeated work across idle, production, market, and combat-stat views on mobile, and fixed memory growth after repeatedly opening the action queue to reduce heat, battery drain, and long-session stutter.",
        "Task auto-return now restores only the task list's internal scroll position and waits for its layout to settle, so a newly queued task no longer scrolls the whole page into a blank area. The top current-action time also follows the game's native font size and hides the finish time when space is tight to stay compact.",
        "On mobile, production profit, loot valuation, and enhancement cost details opened by a long press now remain visible after release or after the native item tooltip disappears. Taps and scrolling inside remain interactive, and only a tap outside closes the detail window.",
        "Multi-material shortage indicators in production and fixed-count enhancing now stay aligned in four explicit columns without widening the panel. Item prices move below enhancement levels while keeping their existing text style.",
        "The ability-book calculator now includes Add to cart and subtracts both current inventory and quantities already in the cart, adding only the net shortage needed for the target level.",
        "Guild Credit Exchange shows three recommendations by default, with a settings dropdown for choosing one through eight. Open recommendations update immediately when the value changes.",
        "The mobile Feedback Center now removes excess form and announcement spacing, and text boxes adapt to their content and screen height. The title and all three tabs stay visible while announcements and forms scroll independently inside the modal body.",
        "Task filters no longer include the unavailable Alchemy and Enhancing types. Desktop layouts keep profession and combat filters on one row when possible, move all five combat buttons together when space is tight, and reduce large-task-list lag through cached task parsing and combat indexes.",
        "Leaderboard badges now use the game's native skill and Fame icons instead of loading icon files from the MWITools leaderboard server.",
        "Leaderboard badges in guild member and friend lists now use a compact row below the name instead of squeezing or truncating it, and character previews in the name-color setting now show their badges too.",
        "Fixed Go still using stale merged counts when a rerolled task reused the same card. Merge totals are now recalculated from the current card and latest task data.",
        "Combat simulators once again read teammates' actual food and coffee from the latest battle. Group imports also no longer stop when matching battle data has not been captured yet.",
        "Fixed the top current-action timing overlapping the action name or queued-actions button in narrow windows in both Chinese and English. The summary now simplifies itself when space is limited.",
        'Fixed task icons moving to the wrong card or disappearing after task and page refreshes, along with train labels drifting and causing horizontal overflow. Ordinary tasks no longer show "No train needed."',
        'Fixed task statistics, filters, and background icons all disappearing when task combat-map numbers were enabled. Task identity matching now ignores MWITools\' own "Map N" labels and recognizes combat tasks by their target monsters.',
        "Production, full-chain planning, and trains now share the current drinks, community and other action buffs, and Guzzling Pouch effects. Drink changes recalculate immediately, chains use effective output, and gathering profit and queue timing no longer miss community speed.",
      ]),
    }),
  }),
  Object.freeze({
    id: "26.4.7",
    version: "26.4.7",
    publishedAt: "2026-08-13",
    title: Object.freeze({
      zh: "26.4.7 更新公告",
      en: "Version 26.4.7 update",
    }),
    body: Object.freeze({
      zh: Object.freeze([
        "修复移动浏览器工具栏变化后页面底部偶尔出现白条并整体上移；Sunny 强化倍数按钮现在可再次把对应期望次数的净缺料加入购物车。",
        "资产中心图例在实时资产刷新后继续保持隐藏或显示状态。",
        "修复九种官方语言下库存评分与总资产、当前行动倒计时、任务合并与自动返回、战斗每小时统计不显示或未生效的问题；装备分类也不再因语言不同参与库存排序。",
        "精炼背部装备加入购物清单时不再包含不可交易的原始背部物品；生产时长快捷按钮现在结合当前综合效率向上换算，避免队列早于所选时长结束。",
        "修复任务页重复出现多个规划火车、资产中心日期选择器被实时刷新关闭，以及强化当前行动条的剩余次数与预计完成时间偶尔不显示。",
        "意见审理台现在显示反馈者使用的 MWITools 版本；重大更新清单支持 GitHub 失败后从反馈服务器读取，并明确显示最新版本且每个版本最多提醒一次。",
        "移动端生产摘要改为紧凑双列，顶部行动条只保留剩余次数和时间并随内容收缩；桌面端继续显示预计完成时间。意见中心入口统一精简为单行 MWITools。",
        "DPS 面板改为每秒刷新一次，伤害、治疗和击杀仍按战斗消息实时累计；长时间离线或挂起后会直接快进时间桶，不再逐个循环补齐。",
        "任务卡的语义匹配与火车升级链改用索引，任务附属控件按需刷新，并取消功能关闭后尚未执行的帧回调，降低乱序任务和战斗期间的后台开销。",
        "物品等级、市场筛选和地图编号改为按交互与数据消息刷新；DPS 启动器及收益、强化浮窗缩小观察范围，并移除高 GPU 占用的背景模糊。",
        "强化成本现在与生产收益和宝箱估算共用同一个自定义快捷键；桌面端按住触发，移动端长按触发。",
        "版本公告恢复按版本独立保存，26.4.6 的历史内容不再混入本版公告。",
        "生产购物清单现在默认补齐上一层成品与当前步骤材料，也可通过“所选链条”开关按勾选阶段补齐；有限次数的总产出、耗时和利润不再被当前库存截断，无限次数且无库存时会明确显示为 0。",
        "任务页在当前页面刷新出新任务时，会立即将所有新任务置顶，再按专业和战斗分类排序；普通进度刷新继续保持卡片位置稳定。",
        "修复不同缩放比例或窄窗口下任务页礼物、未读提示和普通任务卡宽度不一致、列边界错位及横向溢出。",
        "修复聊天框或数量输入框仍有焦点时，按住 Ctrl 等修饰键不显示生产利润、宝箱估算和强化成本面板；自定义字母键仍会在输入时避免误触。",
      ]),
      en: Object.freeze([
        "Fixed an occasional bottom white strip and upward-shifted game layout after mobile browser toolbar changes. Sunny's enhancement multiplier buttons can again add the net shortages for their expected action counts to the shopping cart.",
        "Asset Center legend visibility now persists through live asset refreshes.",
        "Fixed inventory scores and total assets, the current-action countdown, task merging and auto-return, and hourly battle statistics not appearing or activating across all nine official game languages. Equipment also stays excluded from inventory sorting in every language.",
        "Refined back equipment no longer adds its untradeable base item to the shopping list. Production duration shortcuts now round up using current total efficiency so queues do not finish before the selected duration.",
        "Fixed duplicate train-planning controls on tasks, live asset refreshes closing date pickers, and remaining counts and completion estimates intermittently missing from the current-action bar while enhancing.",
        "The feedback review console now shows each reporter's MWITools version. Important-update manifests fall back to the feedback server when GitHub fails, show the latest version explicitly, and appear at most once per version.",
        "Mobile production summaries now use a compact two-column layout, and the mobile current-action bar keeps only the remaining count and time while shrinking to its content. Desktop keeps the finish-time estimate. The Feedback Center launcher is shortened to a single-line MWITools label.",
        "The DPS panel now refreshes once per second while damage, healing, and kills remain event-driven. Long suspended gaps fast-forward graph buckets instead of replaying every missing interval.",
        "Task semantic matching and train upgrade lookups now use indexes, task decorations refresh on demand, and queued frames are cancelled on feature cleanup to reduce shuffled-task and combat overhead.",
        "Item levels, market filters, and map indexes now refresh on interactions and data messages. DPS launcher and estimate-panel observers are narrower, and expensive backdrop blur was removed.",
        "Enhancement costs now share the same custom shortcut as production profit and loot chest estimates: hold the key on desktop or long-press on touch devices.",
        "Release announcements are stored separately by version again, so the 26.4.6 history is no longer mixed into this release.",
        "Production shopping lists now default to the direct predecessor and current-step materials, with a “Selected chain” switch for the checked stages. Finite totals are no longer capped by current inventory, while infinite production with no stock now clearly shows zero.",
        "When new tasks arrive on the current task page, all new tasks now move to the top before profession and combat sorting. Ordinary progress refreshes continue to keep card positions stable.",
        "Fixed mismatched widths, misaligned column edges, and horizontal overflow between gift, unread-notice, and regular task cards at different zoom levels or in narrow windows.",
        "Fixed production profit, loot estimate, and enhancement cost panels not appearing while Ctrl or another modifier key was held with focus still in chat or a quantity input. Custom letter shortcuts remain suppressed while typing.",
      ]),
    }),
  }),
  Object.freeze({
    id: "26.4.6",
    version: "26.4.6",
    publishedAt: "2026-08-12",
    title: Object.freeze({
      zh: "26.4.6 更新公告",
      en: "Version 26.4.6 update",
    }),
    emphasizedBodyIndexes: Object.freeze([6]),
    body: Object.freeze({
      zh: Object.freeze([
        "意见反馈升级为意见中心，新增版本公告，并统一使用红点提醒反馈回复和新公告。",
        "任务页改为平铺布局，支持新任务、已完成任务、生活专业、战斗和四个副本的排序与图标筛选，并提供手动重新排序。",
        "资产中心支持在历史记录缺失日期之间补录七项资产；同一轮资产估值固定使用一份行情快照，避免实时价格变化造成统计口径不一致。",
        "公会经验统计改为近 6 小时、24 小时和成员本周平均速率；七日趋势使用 6 小时滚动平均，并修正升级经验与预计升级时间计算。",
        "新增铁牛模式适配开关，自动识别铁牛和旧铁牛角色；开启后隐藏不可用的市场价格、利润与市场采购操作，同时保留资产和宝箱估值。",
        "修复点金、分解、转化和解精炼的完成时间：现在会结合所选物品批量、催化剂、金币、完成次数和当前周期计算，缺少选择时不再显示无穷大。",
        "生产利润和宝箱估算悬浮默认需要同时按住 Ctrl，可在设置中改成任意单键；移动端均需 800 毫秒长按，并支持滑动取消与点外关闭。",
        "迷宫活动期间暂停所有生活装备提醒，离开迷宫后自动恢复。",
        "购物车升级链新增“从上一步开始”，可直接购买上一层成品与当前步骤材料，不再继续拆解上一层装备。",
        "资产与吃书经验不再显示浮点尾数；宝箱碎片自制钥匙会计入工匠减耗、浓缩倍率和泡饮成本，并可选择忽略所有牛铃价值。",
        "购物车新增默认关闭的“加购后自动展开”，开启后任意入口成功加购都会直接打开购物清单。",
        "兼容游戏全部九种内置语言；库存、悬浮窗、任务、行动、市场和 DPS 等功能现在会直接使用游戏当前语言的官方词表，不再因繁体中文或其他语言名称不同而失效。",
        "移除作用有限的消耗品回复速度、单位回复成本和理论每日用量显示。",
        "修复购物车数量加减按钮长按后可能无法停止，现在松手、清空、删除、收起或切换页签都会立即结束连续加减。",
        "数字解析和显示现在跟随游戏内语言，修复逗号作为小数点、句点或空格作为千分位时，生产材料、房屋数量、任务进度和行动时间计算错误，并稳定公会经验速率条宽度。",
        "修复中文以外的游戏语言下火车点击加入队列后不续站，以及角色管理页不显示盈亏标签的问题。",
        "修复全服技能与公会排行榜可能被经验速率排序或当前角色置顶改变顺序；经验速率继续作为只读信息显示。",
        "资产中心的分项图表改为显示各日期的实际资产持有值，图例可点击隐藏或恢复曲线，悬浮数值使用 K/M/B/T 单位。",
        "修复精炼生活披风等背部装备提示没有新缺料的问题；强化缺料加购移至右侧信息列，单阶段与多阶段升级链均可正确加入购物车。",
        "关闭产出与库存摘要后不再重新出现本次生产摘要；同时减少任务页重复的多语言匹配和插件自身刷新，改善英文界面卡顿。",
      ]),
      en: Object.freeze([
        "Feedback is now the Feedback Center, with release announcements and one red-dot notification for replies and new announcements.",
        "Tasks now use a flat layout with sorting and icon filters for new, completed, profession, combat, and four dungeon categories, plus manual re-sorting.",
        "The Asset Center can insert seven-component records into missing historical dates. One market snapshot is used per valuation session to keep totals consistent while live prices change.",
        "Guild XP now shows 6-hour, 24-hour, and member this-week average rates. The seven-day trend uses a 6-hour rolling average, with corrected level requirements and ETA calculations.",
        "Added an Iron Cow adaptation switch that recognizes both Iron Cow modes. When enabled, unavailable market prices, profits, and marketplace purchasing actions are hidden while asset and loot chest valuations remain available.",
        "Fixed completion times for Coinify, Decompose, Transmute, and Unrefine by accounting for the selected stack, bulk size, catalyst, coins, completed count, and current cycle. Missing selections no longer appear as infinite.",
        "Production profit and loot chest estimate tooltips now require holding Ctrl by default, with any single key configurable in settings. Both use an 800 ms long press on touch devices with movement cancellation and outside-tap dismissal.",
        "All skilling equipment reminders pause during an active Labyrinth run and resume automatically after leaving it.",
        "Upgrade chains now offer “Start from previous” to buy the direct predecessor and current-step materials without breaking the predecessor down further.",
        "Asset and ability-book XP displays no longer show floating-point tails. Fragment-crafted key estimates now include Artisan reduction, concentration, and drink costs, with an option to ignore all Cowbell value.",
        "The cart adds an off-by-default “Expand after adding” option that opens the shopping list after any successful addition.",
        "Added compatibility with all nine built-in game languages. Inventory, tooltips, tasks, actions, marketplace tools, DPS, and related features now use the official dictionary for the active game language instead of failing on Traditional Chinese or other localized names.",
        "Removed the low-value consumable recovery-rate, cost-per-recovery, and theoretical daily-use display.",
        "Fixed shopping-cart quantity buttons sometimes continuing forever after a long press. Releasing, clearing, deleting, collapsing, or changing tabs now stops repeat adjustments immediately.",
        "Number parsing and display now follow the in-game language, fixing production materials, house quantities, task progress, and action timing when commas are decimals and periods or spaces are grouping separators, while stabilizing guild XP rate-bar widths.",
        "Fixed trains not advancing after queue submission and the P/L tab missing from Character Management when the game uses a non-Chinese language.",
        "Fixed standard skill and guild leaderboard order being changed by XP-rate sorting or current-character pinning; XP rates remain available as read-only information.",
        "Asset component charts now show actual holdings for each date, legends can hide and restore lines, and hover values use K/M/B/T units.",
        "Fixed refined skilling capes and other back equipment reporting no new shortages. Enhancement shopping now sits in the right-hand information column, and both single- and multi-stage upgrade chains add materials correctly.",
        "Disabling the output and inventory summary now keeps the production summary hidden. Repeated multilingual task matching and MWITools-owned refreshes were also reduced to improve English task-page performance.",
      ]),
    }),
  }),
]);

function defaultGetValue(key, fallback) {
  try {
    return typeof GM_getValue === "function"
      ? GM_getValue(key, fallback)
      : fallback;
  } catch {
    return fallback;
  }
}

function defaultSetValue(key, value) {
  try {
    if (typeof GM_setValue === "function") GM_setValue(key, value);
  } catch {
    // A storage failure must not prevent the center from opening.
  }
}

function parseSeenIds(value) {
  const parsed = typeof value === "string" ? JSON.parse(value || "[]") : value;
  return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
}

export class AnnouncementStore {
  constructor({
    announcements = ANNOUNCEMENTS,
    getValue = defaultGetValue,
    setValue = defaultSetValue,
  } = {}) {
    this.announcements = [...announcements].sort(
      (left, right) =>
        String(right.publishedAt).localeCompare(String(left.publishedAt)) ||
        String(right.version).localeCompare(String(left.version), undefined, {
          numeric: true,
        }),
    );
    this.getValue = getValue;
    this.setValue = setValue;
    try {
      this.seenIds = parseSeenIds(this.getValue(STORAGE_KEY, []));
    } catch {
      this.seenIds = new Set();
    }
  }

  list() {
    return [...this.announcements];
  }

  unread() {
    return this.announcements.filter((item) => !this.seenIds.has(item.id));
  }

  markAllRead() {
    const unread = this.unread();
    if (!unread.length) return 0;
    for (const item of unread) this.seenIds.add(item.id);
    this.setValue(STORAGE_KEY, [...this.seenIds]);
    return unread.length;
  }
}

export const announcementStorageKey = STORAGE_KEY;
