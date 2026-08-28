import { runtime } from "../../core/runtime.js";
import { createFrameScheduler } from "../../core/frame-scheduler.js";
import { subscribeMutationChannel } from "../../core/mutation-channel.js";
import { ASSET_COMPONENT_KEYS } from "./00-snapshot.js";
import { getUtc8DayKey } from "./10-store.js";
import { AssetHistoryChart } from "./20-chart.js";
import { createAssetCenter } from "./25-center.js";

const TAB_ID = "mwitools-asset-history-tab";
const PANEL_ID = "mwitools-asset-history-panel";
const CENTER_ID = "mwitools-asset-center-modal";
const STYLE_ID = "mwitools-asset-history-style";

export const ASSET_SHARE_TEMPLATE_COUNT = 12;
export const ASSET_COMPONENT_SHARE_TEMPLATE_COUNT = 12;

const ROWS = [
  ["total", "总计", "Total"],
  ["equipment", "装备", "Equipment"],
  ["inventory", "库存", "Inventory"],
  ["marketListings", "订单", "Market listings"],
  ["houses", "房屋", "Houses"],
  ["abilities", "技能", "Abilities"],
  ["nonTradableTokens", "不可交易代币", "Non-tradable tokens"],
  ["shrine", "神龛", "Shrine"],
];

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function formatNumber(value, signed = false) {
  if (!Number.isFinite(value)) return "—";
  const formatted = runtime.api.numberFormatter?.(Math.abs(value)) ?? value;
  if (!signed || value === 0) return String(formatted);
  return `${value > 0 ? "+" : "−"}${formatted}`;
}

function formatPercent(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0)
    return "—";
  const value = ((current - previous) / previous) * 100;
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function valueClass(value) {
  if (!Number.isFinite(value) || value === 0) return "is-neutral";
  return value > 0 ? "is-positive" : "is-negative";
}

function sharePeriod(gapDays) {
  if (runtime.config.isZH) {
    return gapDays === 1 ? "今天" : `近 ${gapDays} 天`;
  }
  return gapDays === 1 ? "Today" : `Over the last ${gapDays} days`;
}

export function buildAssetShareMessage(
  { change, percent, gapDays = 1 },
  templateIndex = Math.floor(Math.random() * ASSET_SHARE_TEMPLATE_COUNT),
) {
  if (!Number.isFinite(change) || !Number.isFinite(percent)) return "";
  const period = sharePeriod(gapDays);
  const amount = formatNumber(Math.abs(change));
  const percentText = `${Math.abs(percent).toFixed(2)}%`;
  const signedAmount = formatNumber(change, true);
  const signedPercent = `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
  const zhProfitTemplates = [
    () => `📈 ${period}资产含金量还在上升：+${amount}，涨幅 +${percentText}。`,
    () => `来财，来：${period}进账 ${amount}，总资产 +${percentText}。`,
    () => `${period}收益 +${amount}，助我破鼎；资产再涨 ${percentText}。`,
    () => `千百次练习只为这一刻：${period} +${amount}，资产 +${percentText}。`,
    () => `敬今天的自己一杯：${period}赚了 ${amount}，身家 +${percentText}。`,
    () => `${period}就这么水灵灵地赚了 ${amount}，资产 +${percentText}。`,
    () => `${period}财富曲线直接硬控全场：+${amount}，资产 +${percentText}。`,
    () =>
      `不知道，我的资产很曼妙：${period} +${amount}，身家 +${percentText}。`,
    () =>
      `资产敢这么涨，胆子真是肥嘟嘟的啊：${period} +${amount}，+${percentText}。`,
    () =>
      `来杯好茶摇一摇，余额跟着往上飘：${period} +${amount}，+${percentText}。`,
    () => `中式 DNA 动了，先存钱：${period} +${amount}，资产 +${percentText}。`,
    () =>
      `这收益，大人真乃神人也：${period} +${amount}，资产 +${percentText}。`,
  ];
  const zhLossTemplates = [
    () => `📉 这跌幅我要验牌：${period} -${amount}，资产 -${percentText}。`,
    () => `余额进入奥德赛时期：${period} -${amount}，资产 -${percentText}。`,
    () =>
      `财富肉体还在线，精神已经下班：${period} -${amount}，-${percentText}。`,
    () => `这次我绷住了：${period}亏 ${amount}，资产 -${percentText}。`,
    () => `账本像个草台班子：${period} -${amount}，身家 -${percentText}。`,
    () => `一下亏出班味：${period} -${amount}，资产 -${percentText}。`,
    () => `钱走得很有偷感：${period}少了 ${amount}，资产 -${percentText}。`,
    () => `浪浪山小妖怪下山填坑：${period}亏 ${amount}，资产 -${percentText}。`,
    () => `富婆哦？不讲不讲，${period}刚亏 ${amount}，身家 -${percentText}。`,
    () => `参考文献：${period}亏损 ${amount}，资产变化 -${percentText}。`,
    () =>
      `低山臭水遇至阴，账户一路向下：${period} -${amount}，-${percentText}。`,
    () =>
      `野生狗奶保质期永久，我的余额不是：${period} -${amount}，-${percentText}。`,
  ];
  const enProfitTemplates = [
    () =>
      `📈 POV: the balance finally popped off — ${period}, +${amount} and assets up ${percentText}.`,
    () => `Big W for the balance: ${period}, +${amount} and +${percentText}.`,
    () =>
      `The portfolio understood the assignment: ${period}, +${amount} and +${percentText}.`,
    () =>
      `The grind ate and left no crumbs: ${period}, +${amount} and +${percentText}.`,
    () =>
      `Aura farming paid off: ${period} earned ${amount}, net worth up ${percentText}.`,
    () =>
      `Locked in, ledger edition: ${period}, +${amount}; assets up ${percentText}.`,
    () =>
      `The rent was due and the portfolio delivered: ${period}, +${amount} and +${percentText}.`,
    () =>
      `Let the portfolio cook: ${period}, +${amount}; assets up ${percentText}.`,
    () =>
      `Main-character balance energy: ${period}, +${amount} and +${percentText}.`,
    () =>
      `In my compounding era: ${period}, +${amount}; assets up ${percentText}.`,
    () =>
      `Chef's kiss for this balance: ${period}, +${amount} and +${percentText}.`,
    () => `We love to see it: ${period}, +${amount}; assets up ${percentText}.`,
  ];
  const enLossTemplates = [
    () =>
      `📉 Financial canon event: ${period}, -${amount} and assets down ${percentText}.`,
    () => `The portfolio is cooked: ${period}, -${amount} and -${percentText}.`,
    () => `The math is not mathing: ${period}, -${amount} and -${percentText}.`,
    () =>
      `Caught the balance slipping in 4K: ${period}, -${amount} and -${percentText}.`,
    () => `Portfolio skill issue: ${period}, -${amount}; down ${percentText}.`,
    () =>
      `Villain-origin-story numbers: ${period}, -${amount}; net worth down ${percentText}.`,
    () =>
      `Plot twist nobody ordered: ${period} lost ${amount}, down ${percentText}.`,
    () =>
      `That side quest had microtransactions: ${period}, -${amount} and -${percentText}.`,
    () =>
      `Critical aura loss: ${period}, -${amount}; net worth down ${percentText}.`,
    () =>
      `Entering the crash-out arc: ${period}, -${amount} and -${percentText}.`,
    () =>
      `Task failed successfully: ${period}, -${amount}; assets down ${percentText}.`,
    () =>
      `Chat, is this real? ${period} dropped ${amount}, down ${percentText}.`,
  ];
  const neutralTemplates = runtime.config.isZH
    ? [
        () =>
          `➖ ${period}账本松弛感拉满：${signedAmount}，变化 ${signedPercent}。`,
        () => `${period}盈亏 ${signedAmount}，变化 ${signedPercent}，那咋了。`,
        () =>
          `${period}资产 ${signedAmount}，变化 ${signedPercent}；如何呢，又能怎。`,
        () =>
          `持平基础，稳得不基础：${period} ${signedAmount}，${signedPercent}。`,
        () =>
          `财富进城办事还没回来：${period}盈亏 ${signedAmount}，变化 ${signedPercent}。`,
        () =>
          `账本切换豆包型人格：${period} ${signedAmount}，情绪稳定在 ${signedPercent}。`,
        () =>
          `做完你的，做你的；资产先不做：${period} ${signedAmount}（${signedPercent}）。`,
        () =>
          `我们不说没动，我们可以说：${period}资产稳得很具体，${signedAmount}（${signedPercent}）。`,
        () =>
          `牌没有问题，资产也没动：${period} ${signedAmount}（${signedPercent}）。`,
        () =>
          `城巴佬第一次看资产曲线：怎么是一条直线？${period} ${signedAmount}（${signedPercent}）。`,
        () =>
          `数值没变，情绪价值给满：${period} ${signedAmount}，变化 ${signedPercent}。`,
        () =>
          `今日村咖特调：零涨跌。${period} ${signedAmount}（${signedPercent}）。`,
      ]
    : [
        () =>
          `➖ Very demure, very mindful, very unchanged: ${period}, P/L ${signedAmount}, change ${signedPercent}.`,
        () =>
          `The balance entered NPC idle animation: ${period}, P/L 0 and change ${signedPercent}.`,
        () =>
          `Portfolio loading screen: ${period}, P/L ${signedAmount}, change ${signedPercent}.`,
        () =>
          `No gains, no losses, just vibes: ${period}, ${signedAmount} (${signedPercent}).`,
        () =>
          `Standing on business, literally not moving: ${period}, ${signedAmount} (${signedPercent}).`,
        () =>
          `Zero lore progression: ${period}, P/L 0 and change ${signedPercent}.`,
        () =>
          `The chart is buffering: ${period}, ${signedAmount} and ${signedPercent}.`,
        () =>
          `The portfolio went to touch grass: ${period}, P/L 0 (${signedPercent}).`,
        () =>
          `Low-key the same balance: ${period}, ${signedAmount}; change ${signedPercent}.`,
        () =>
          `No thoughts, head empty, P/L zero: ${period}, ${signedAmount} (${signedPercent}).`,
        () =>
          `Not beating the flat-chart allegations: ${period}, ${signedAmount} (${signedPercent}).`,
        () =>
          `It's giving... absolutely no movement: ${period}, ${signedAmount} (${signedPercent}).`,
      ];
  const templates =
    change === 0
      ? neutralTemplates
      : runtime.config.isZH
        ? change > 0
          ? zhProfitTemplates
          : zhLossTemplates
        : change > 0
          ? enProfitTemplates
          : enLossTemplates;
  const normalizedIndex =
    (((Number(templateIndex) || 0) % templates.length) + templates.length) %
    templates.length;
  return templates[normalizedIndex]();
}

function componentSharePeriod(gapDays) {
  const days = Math.max(1, Math.trunc(Number(gapDays) || 1));
  if (runtime.config.isZH) return `相比 ${days} 天前`;
  return `vs ${days} day${days === 1 ? "" : "s"} ago`;
}

export function buildAssetComponentShareMessage(
  { key, current, change, percent, gapDays = 1 },
  templateIndex = Math.floor(
    Math.random() * ASSET_COMPONENT_SHARE_TEMPLATE_COUNT,
  ),
) {
  if (
    !ASSET_COMPONENT_KEYS.includes(key) ||
    !Number.isFinite(current) ||
    !Number.isFinite(change)
  ) {
    return "";
  }
  const row = ROWS.find(([candidate]) => candidate === key);
  if (!row) return "";
  const component = runtime.config.isZH ? row[1] : row[2];
  const period = componentSharePeriod(gapDays);
  const currentText = formatNumber(current);
  const amount = formatNumber(Math.abs(change));
  const percentText = Number.isFinite(percent)
    ? `${Math.abs(percent).toFixed(2)}%`
    : runtime.config.isZH
      ? "由 0 起步（无可比百分比）"
      : "up from zero (no comparable percentage)";
  const zhProfitTemplates = [
    () =>
      `📈 ${component}含金量还在上升：${period} +${amount}（${percentText}），当前 ${currentText}。`,
    () =>
      `${component}来财，来：${period} +${amount}（${percentText}），当前 ${currentText}。`,
    () =>
      `${component}助我破鼎：${period} +${amount}（${percentText}），现值 ${currentText}。`,
    () =>
      `千百次练习只为这一刻，${component}${period} +${amount}（${percentText}），当前 ${currentText}。`,
    () =>
      `敬${component}一杯：${period}赚 ${amount}（${percentText}），现值 ${currentText}。`,
    () =>
      `${component}就这么水灵灵地涨了：${period} +${amount}（${percentText}），当前 ${currentText}。`,
    () =>
      `${component}直接硬控收益榜：${period} +${amount}（${percentText}），当前 ${currentText}。`,
    () =>
      `不知道，我的${component}很曼妙：${period} +${amount}（${percentText}），现在 ${currentText}。`,
    () =>
      `${component}敢这么涨，胆子真是肥嘟嘟的啊：${period} +${amount}（${percentText}），当前 ${currentText}。`,
    () =>
      `${component}来杯好茶摇一摇：${period} +${amount}（${percentText}），现值 ${currentText}。`,
    () =>
      `中式 DNA 看到${component}上涨就想存：${period} +${amount}（${percentText}），当前 ${currentText}。`,
    () =>
      `${component}这波，大人真乃神人也：${period} +${amount}（${percentText}），现值 ${currentText}。`,
  ];
  const zhLossTemplates = [
    () =>
      `📉 ${component}这跌幅我要验牌：${period} -${amount}（${percentText}），当前 ${currentText}。`,
    () =>
      `${component}进入奥德赛时期：${period} -${amount}（${percentText}），现值 ${currentText}。`,
    () =>
      `${component}肉体还在账户，精神已经下班：${period} -${amount}（${percentText}），当前 ${currentText}。`,
    () =>
      `${component}这下不绷住也得绷住：${period} -${amount}（${percentText}），现值 ${currentText}。`,
    () =>
      `${component}账本临时草台班子：${period} -${amount}（${percentText}），当前 ${currentText}。`,
    () =>
      `${component}一下亏出班味：${period} -${amount}（${percentText}），现在 ${currentText}。`,
    () =>
      `${component}的钱走得很有偷感：${period} -${amount}（${percentText}），当前 ${currentText}。`,
    () =>
      `浪浪山小妖怪下山给${component}填坑：${period} -${amount}（${percentText}），现值 ${currentText}。`,
    () =>
      `富婆哦？不讲不讲，${component}${period} -${amount}（${percentText}），当前 ${currentText}。`,
    () =>
      `${component}亏损参考文献：${period} -${amount}（${percentText}），现值 ${currentText}。`,
    () =>
      `${component}低山臭水遇至阴：${period} -${amount}（${percentText}），当前 ${currentText}。`,
    () =>
      `野生狗奶永久，${component}余额不永久：${period} -${amount}（${percentText}），现值 ${currentText}。`,
  ];
  const zhNeutralTemplates = [
    () =>
      `➖ ${component}松弛感拉满：${period}变化 0（0.00%），当前 ${currentText}。`,
    () => `${component}${period}变化 0（0.00%），当前 ${currentText}，那咋了。`,
    () =>
      `${component}${period}变化 0（0.00%），现值 ${currentText}；如何呢，又能怎。`,
    () =>
      `${component}持平基础，稳得不基础：${period} 0（0.00%），当前 ${currentText}。`,
    () =>
      `${component}进城办事还没回来：${period} 0（0.00%），当前 ${currentText}。`,
    () =>
      `${component}切换豆包型人格：${period} 0（0.00%），情绪稳定在 ${currentText}。`,
    () =>
      `做完你的，做你的；${component}先不做：${period} 0（0.00%），现值 ${currentText}。`,
    () =>
      `我们不说${component}没动，我们可以说：${period}稳得很具体，0（0.00%），现值 ${currentText}。`,
    () => `${component}牌没有问题：${period} 0（0.00%），当前 ${currentText}。`,
    () =>
      `城巴佬看${component}曲线：怎么不动？${period} 0（0.00%），当前 ${currentText}。`,
    () =>
      `${component}数值没变，情绪价值给满：${period} 0（0.00%），现值 ${currentText}。`,
    () =>
      `${component}今日村咖特调：零涨跌。${period} 0（0.00%），当前 ${currentText}。`,
  ];
  const enProfitTemplates = [
    () =>
      `📈 POV: ${component} popped off — ${period}, +${amount} (${percentText}) to ${currentText}.`,
    () =>
      `Big W for ${component}: ${period}, +${amount} (${percentText}); now ${currentText}.`,
    () =>
      `${component} understood the assignment: ${period}, +${amount} (${percentText}); current ${currentText}.`,
    () =>
      `${component} ate and left no crumbs: ${period}, +${amount} (${percentText}); current ${currentText}.`,
    () =>
      `${component} is aura farming: ${period}, +${amount} (${percentText}); total ${currentText}.`,
    () =>
      `${component} is locked in: ${period}, +${amount} (${percentText}); current value ${currentText}.`,
    () =>
      `The rent was due and ${component} delivered: ${period}, +${amount} (${percentText}); now ${currentText}.`,
    () =>
      `Let ${component} cook: ${period}, +${amount} (${percentText}); total ${currentText}.`,
    () =>
      `${component} has main-character energy: ${period}, +${amount} (${percentText}); total ${currentText}.`,
    () =>
      `In my ${component} gains era: ${period}, +${amount} (${percentText}); now ${currentText}.`,
    () =>
      `Chef's kiss for ${component}: ${period}, +${amount} (${percentText}); current ${currentText}.`,
    () =>
      `We love to see ${component} win: ${period}, +${amount} (${percentText}); now ${currentText}.`,
  ];
  const enLossTemplates = [
    () =>
      `📉 ${component} canon event: ${period}, -${amount} (${percentText}) to ${currentText}.`,
    () =>
      `${component} is cooked: ${period}, -${amount} (${percentText}); now ${currentText}.`,
    () =>
      `${component} math is not mathing: ${period}, -${amount} (${percentText}); current ${currentText}.`,
    () =>
      `${component} got caught slipping in 4K: ${period}, -${amount} (${percentText}); now ${currentText}.`,
    () =>
      `${component} skill issue: ${period}, -${amount} (${percentText}); total ${currentText}.`,
    () =>
      `${component} entered its villain-origin story: ${period}, -${amount} (${percentText}); now ${currentText}.`,
    () =>
      `${component} plot twist nobody ordered: ${period}, -${amount} (${percentText}); now ${currentText}.`,
    () =>
      `That ${component} side quest had microtransactions: ${period}, -${amount} (${percentText}); current ${currentText}.`,
    () =>
      `${component} suffered critical aura loss: ${period}, -${amount} (${percentText}); total ${currentText}.`,
    () =>
      `${component} entered the crash-out arc: ${period}, -${amount} (${percentText}); now ${currentText}.`,
    () =>
      `${component} task failed successfully: ${period}, -${amount} (${percentText}); current ${currentText}.`,
    () =>
      `Chat, is this real? ${component}: ${period}, -${amount} (${percentText}); now ${currentText}.`,
  ];
  const enNeutralTemplates = [
    () =>
      `➖ Very demure, very mindful: ${component} stayed unchanged ${period}, 0 (0.00%); current ${currentText}.`,
    () =>
      `${component} entered NPC idle animation: ${period}, 0 (0.00%); current ${currentText}.`,
    () =>
      `${component} loading screen: ${period}, 0 (0.00%); current ${currentText}.`,
    () =>
      `${component}: no gains, no losses, just vibes ${period}, 0 (0.00%); current ${currentText}.`,
    () =>
      `${component} is standing on business, literally not moving: ${period}, 0 (0.00%); current ${currentText}.`,
    () =>
      `${component} logged zero lore progression: ${period}, 0 (0.00%); now ${currentText}.`,
    () =>
      `${component} is buffering: ${period}, 0 (0.00%); current ${currentText}.`,
    () =>
      `${component} went to touch grass: ${period}, 0 (0.00%); total ${currentText}.`,
    () =>
      `${component} stayed low-key the same: ${period}, 0 (0.00%); now ${currentText}.`,
    () =>
      `${component}: no thoughts, head empty, P/L zero ${period}, 0 (0.00%); current ${currentText}.`,
    () =>
      `${component} is not beating the flat-chart allegations: ${period}, 0 (0.00%); now ${currentText}.`,
    () =>
      `It's giving... absolutely no ${component} movement: ${period}, 0 (0.00%); current ${currentText}.`,
  ];
  const templates = runtime.config.isZH
    ? change > 0
      ? zhProfitTemplates
      : change < 0
        ? zhLossTemplates
        : zhNeutralTemplates
    : change > 0
      ? enProfitTemplates
      : change < 0
        ? enLossTemplates
        : enNeutralTemplates;
  const normalizedIndex =
    (((Number(templateIndex) || 0) % templates.length) + templates.length) %
    templates.length;
  return templates[normalizedIndex]();
}

export function pasteAssetShareToChat(message, root = document) {
  const inputs = [
    ...root.querySelectorAll(
      'input[class*="Chat_chatInput"],input[placeholder*="输入消息"],input[placeholder*="message" i]',
    ),
  ];
  const input =
    inputs.find((candidate) => candidate.getClientRects().length > 0) ??
    inputs.at(0);
  if (!input || !message) return null;
  const view = input.ownerDocument?.defaultView ?? window;
  const setter = Object.getOwnPropertyDescriptor(
    view.HTMLInputElement.prototype,
    "value",
  )?.set;
  const applyValue = (value) => {
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new view.Event("input", { bubbles: true }));
  };
  applyValue("");
  applyValue(message);
  input.focus();
  input.setSelectionRange?.(message.length, message.length);
  return input;
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${TAB_ID}[data-active="true"] { color:#00c6ff!important; font-weight:700; }
    [data-mwitools-asset-active="true"] button:not(#${TAB_ID}) { border-color:var(--mwi-asset-idle-border,rgba(255,255,255,.16))!important; background:var(--mwi-asset-idle-background,rgba(255,255,255,.08))!important; box-shadow:var(--mwi-asset-idle-shadow,none)!important; color:var(--mwi-asset-idle-color,var(--color-text-secondary,#aeb5c0))!important; filter:none!important; }
    #${PANEL_ID} { box-sizing:border-box; width:100%; max-width:100%; min-width:0; max-height:calc(100% - 34px); overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain; scrollbar-gutter:stable; padding:12px 12px 24px; color:var(--color-text-primary,#eee); background:#111b2b; }
    .mwi-asset-disclaimer { margin:0 0 10px; color:var(--color-text-secondary,#aaa); font-size:.72rem; line-height:1.4; }
    .mwi-asset-share { display:flex; align-items:center; gap:8px; margin:-2px 0 10px; }
    .mwi-asset-share-status { min-width:0; color:var(--color-text-secondary,#aaa); font-size:.68rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .mwi-asset-summary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-bottom:12px; }
    .mwi-asset-card { min-width:0; padding:10px 12px; border:1px solid rgba(255,255,255,.08); border-radius:8px; background:rgba(255,255,255,.06); }
    .mwi-asset-card-label { color:#9fb4d1; font-size:.68rem; }
    .mwi-asset-card-value { overflow:hidden; margin-top:4px; font-size:1rem; font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
    .mwi-asset-card-meta { margin-top:3px; color:var(--color-text-secondary,#999); font-size:.63rem; }
    .is-positive { color:#65d394!important; } .is-negative { color:#ff7b75!important; } .is-neutral { color:inherit; }
    .mwi-asset-section { margin-top:10px; border:1px solid rgba(255,255,255,.08); border-radius:8px; background:#0c141f; overflow:hidden; }
    .mwi-asset-section-title { padding:9px 11px; border-bottom:1px solid rgba(255,255,255,.08); font-size:.84rem; font-weight:700; }
    .mwi-asset-table-wrap { max-width:100%; overflow-x:hidden; }
    .mwi-asset-table { width:100%; min-width:0; table-layout:fixed; border-collapse:collapse; font-size:.72rem; }
    .mwi-asset-table th,.mwi-asset-table td { overflow:hidden; padding:7px 6px; border-bottom:1px solid rgba(255,255,255,.065); text-align:right; text-overflow:ellipsis; white-space:nowrap; }
    .mwi-asset-table th { overflow-wrap:anywhere; white-space:normal; }
    .mwi-asset-table th:first-child,.mwi-asset-table td:first-child { text-align:left; }
    .mwi-asset-table:not(.mwi-asset-history-table) th:first-child { width:18%; }
    .mwi-asset-history-table th:first-child { width:28%; }
    .mwi-asset-history-table th:last-child { width:38%; }
    .mwi-asset-table tr:last-child td { border-bottom:0; }
    .mwi-asset-table tr[data-key="total"] { font-weight:700; background:rgba(255,255,255,.035); }
    .mwi-asset-component-share { max-width:100%; border:0; border-bottom:1px dashed currentColor; background:transparent; color:#7ddcff; padding:0; cursor:pointer; font:inherit; text-align:left; text-overflow:ellipsis; white-space:nowrap; overflow:hidden; }
    .mwi-asset-component-share:hover { color:#b6ecff; }
    .mwi-asset-component-share:focus-visible { outline:2px solid #00c6ff; outline-offset:2px; }
    .mwi-asset-component-share:disabled { border-bottom-color:transparent; color:inherit; cursor:default; opacity:1; }
    .mwi-asset-chart-controls { display:flex; flex-wrap:wrap; gap:6px; padding:9px 10px 0; }
    .mwi-asset-chart-controls button,.mwi-asset-action { border:1px solid rgba(255,255,255,.13); border-radius:5px; background:rgba(255,255,255,.07); color:inherit; padding:5px 9px; cursor:pointer; font:inherit; }
    .mwi-asset-chart-controls button:hover,.mwi-asset-action:hover { background:#3f4655; transform:translateY(-1px); }
    .mwi-asset-chart-controls button[data-active="true"] { border-color:transparent; background:#00c6ff; color:#0b1522; box-shadow:0 0 10px rgba(0,198,255,.45); }
    .mwi-asset-chart-box { position:relative; height:330px; padding:8px 10px 12px; }
    .mwi-asset-chart-fallback { display:grid; height:100%; place-items:center; color:var(--color-text-secondary,#aaa); font-size:.75rem; text-align:center; }
    .mwi-asset-manager { padding:9px 11px 12px; }
    .mwi-asset-manager summary { cursor:pointer; font-size:.8rem; font-weight:700; }
    .mwi-asset-manager-actions { display:flex; flex-wrap:wrap; gap:6px; margin:9px 0; }
    .mwi-asset-action.is-danger { color:#ff938c; }
    .mwi-asset-history-table button { padding:3px 7px; font-size:.68rem; }
    .mwi-asset-edit-dialog { width:min(520px,calc(100vw - 24px)); border:1px solid rgba(255,255,255,.16); border-radius:8px; background:#182033; color:#eee; }
    .mwi-asset-edit-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 12px; }
    .mwi-asset-edit-grid label { display:grid; gap:3px; color:#bbb; font-size:.7rem; }
    .mwi-asset-edit-grid input { box-sizing:border-box; width:100%; border:1px solid rgba(255,255,255,.18); border-radius:4px; background:#101728; color:#eee; padding:6px; }
    .mwi-asset-edit-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
    @media(max-width:760px){
      #${PANEL_ID} { min-height:0; padding:10px 8px calc(20px + env(safe-area-inset-bottom,0px)); overflow-x:hidden; overflow-y:auto; overscroll-behavior-y:contain; -webkit-overflow-scrolling:touch; touch-action:pan-y; }
      .mwi-asset-chart-box { height:280px; }
      .mwi-asset-edit-grid { grid-template-columns:1fr; }
    }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function buttonLabel(button) {
  return String(
    runtime.api.getOriTextFromElement?.(button) ?? button?.textContent ?? "",
  )
    .trim()
    .toLowerCase();
}

const CHARACTER_TAB_PATTERNS = {
  inventory: /^(库存|inventory)$/i,
  equipment: /^(装备|equipment)$/i,
  skills: /^(技能|skills?|abilities)$/i,
  house: /^(房屋|house)$/i,
  loadout: /^(配装|loadouts?)(?:\s*\d+)?$/i,
};

export function findCharacterManagementLoadoutTab() {
  const groups = new Map();
  for (const button of document.querySelectorAll('button[role="tab"],button')) {
    if (
      button.id === TAB_ID ||
      button.dataset.mwitoolsCharacterTab === "true"
    ) {
      continue;
    }
    const parent = button.parentElement;
    if (!parent) continue;
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(button);
  }
  const candidates = [];
  for (const [parent, buttons] of groups) {
    const inCharacterManagement = Boolean(
      parent.closest('[class*="CharacterManagement_characterManagement"]'),
    );
    const nativeTabs = buttons.filter((button) =>
      button.matches('[role="tab"]'),
    );
    const structuralMatch = inCharacterManagement && nativeTabs.length >= 5;
    const matched = structuralMatch
      ? {
          inventory: nativeTabs[0],
          equipment: nativeTabs[1],
          skills: nativeTabs[2],
          house: nativeTabs[3],
          loadout: nativeTabs.at(-1),
        }
      : Object.fromEntries(
          Object.entries(CHARACTER_TAB_PATTERNS).map(([key, pattern]) => [
            key,
            buttons.find((button) => pattern.test(buttonLabel(button))),
          ]),
        );
    const supportingTabs = [
      matched.equipment,
      matched.skills,
      matched.house,
    ].filter(Boolean).length;
    if (!matched.inventory || !matched.loadout || supportingTabs < 2) continue;
    const rect = parent.getBoundingClientRect?.();
    const visible = Boolean(rect && rect.width > 0 && rect.height > 0);
    candidates.push({
      button: matched.loadout,
      score:
        Number(visible) * 4 +
        Number(inCharacterManagement) * 2 +
        Number(structuralMatch) * 8,
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.button ?? null;
}

function looksLikeContent(node) {
  if (!(node instanceof Element)) return false;
  const className = String(node.className ?? "");
  return Boolean(
    node.querySelector("input,canvas") ||
    /(Inventory|Equipment|Ability|Abilities|House|Loadout|Panel)_/i.test(
      className,
    ) ||
    node.querySelector(
      '[class*="Inventory_"],[class*="Equipment_"],[class*="Ability"],[class*="House_"],[class*="Loadout"]',
    ),
  );
}

export function findPanelShell(tab) {
  let navigationBranch = tab.parentElement;
  for (
    let depth = 0;
    navigationBranch?.parentElement && depth < 8;
    depth += 1
  ) {
    const shell = navigationBranch.parentElement;
    const siblings = [...shell.children].filter(
      (node) => node !== navigationBranch && node.id !== PANEL_ID,
    );
    if (siblings.some(looksLikeContent)) {
      return { shell, navigationBranch };
    }
    navigationBranch = shell;
  }
  return null;
}

function isCompactViewport() {
  const view = globalThis.window ?? globalThis;
  return (
    view.matchMedia?.("(max-width: 760px)")?.matches ??
    Number(view.innerWidth) <= 760
  );
}

function createCard(label, valueId, metaId = "") {
  return `<div class="mwi-asset-card"><div class="mwi-asset-card-label">${label}</div><div class="mwi-asset-card-value" id="${valueId}">—</div>${metaId ? `<div class="mwi-asset-card-meta" id="${metaId}"></div>` : ""}</div>`;
}

function downloadBackup(backup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `MWITools-asset-history-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

class AssetHistoryPanel {
  constructor(host, store, scopeKey) {
    this.host = host;
    this.store = store;
    this.scopeKey = scopeKey;
    this.snapshot = null;
    this.mode = "total";
    this.range = 30;
    this.visible = false;
    this.build();
    this.center = createAssetCenter({
      store: this.store,
      scopeKey: this.scopeKey,
      onChange: () => this.update(this.snapshot),
      onVisibilityChange: (open) => {
        if (open) this.chart.destroy();
        else if (this.visible) this.update(this.snapshot);
      },
    });
  }

  build() {
    this.host.innerHTML = `
      <p class="mwi-asset-disclaimer">${t("盈亏按资产估值变化计算，包含市场价格波动，并非已实现交易利润。", "P/L is based on asset valuation changes, including market price movement; it is not realized trading profit.")}</p>
      <div class="mwi-asset-share"><button type="button" class="mwi-asset-action" id="mwi-asset-open-center">${t("打开资产中心", "Open Asset Center")}</button><span class="mwi-asset-share-status"></span></div>
      <div class="mwi-asset-summary">
        ${createCard(t("当前总资产", "Current total assets"), "mwi-asset-current-total")}
        ${createCard(t("总盈亏", "Total P/L"), "mwi-asset-total-change", "mwi-asset-compare-date")}
        ${createCard(t("流动资产盈亏", "Liquid-asset P/L"), "mwi-asset-liquid-change")}
        ${createCard(t("非流动资产盈亏", "Non-current-asset P/L"), "mwi-asset-fixed-change")}
        ${createCard(t("盈亏比例", "P/L percentage"), "mwi-asset-total-percent")}
        ${createCard(t("近 7 日平均", "7-day average"), "mwi-asset-seven-average")}
      </div>
      <section class="mwi-asset-section">
        <div class="mwi-asset-section-title">${t("分项资产变化", "Asset changes by component")}</div>
        <div class="mwi-asset-table-wrap"><table class="mwi-asset-table"><thead><tr><th>${t("项目", "Component")}</th><th>${t("当前", "Current")}</th><th id="mwi-asset-change-heading">${t("变化", "Change")}</th><th>${t("比例", "Percentage")}</th></tr></thead><tbody id="mwi-asset-breakdown"></tbody></table></div>
      </section>
      <section class="mwi-asset-section">
        <div class="mwi-asset-chart-controls">
          <button type="button" data-mode="total">${t("总资产", "Total assets")}</button>
          <button type="button" data-mode="profit">${t("每日盈亏", "Daily P/L")}</button>
          <button type="button" data-mode="breakdown">${t("分项资产", "Component assets")}</button>
          <span style="flex:1"></span>
          <button type="button" data-range="7">7${t("天", "d")}</button>
          <button type="button" data-range="15">15${t("天", "d")}</button>
          <button type="button" data-range="30">30${t("天", "d")}</button>
          <button type="button" data-range="all">${t("全部", "All")}</button>
          <button type="button" id="mwi-asset-reset-zoom">${t("重置缩放", "Reset zoom")}</button>
        </div>
        <div class="mwi-asset-chart-box"><canvas id="mwi-asset-chart"></canvas><div class="mwi-asset-chart-fallback" hidden></div></div>
      </section>
      <section class="mwi-asset-section"><details class="mwi-asset-manager"><summary>${t("数据管理与备份", "Data management & backup")}</summary>
        <div class="mwi-asset-manager-actions">
          <button type="button" class="mwi-asset-action" id="mwi-asset-export">${t("导出备份", "Export backup")}</button>
          <button type="button" class="mwi-asset-action" id="mwi-asset-import">${t("导入备份", "Import backup")}</button>
          <button type="button" class="mwi-asset-action is-danger" id="mwi-asset-cleanup">${t("清理无效记录", "Clean invalid records")}</button>
          <button type="button" class="mwi-asset-action is-danger" id="mwi-asset-anomalies">${t("检测并删除异常", "Detect & delete anomalies")}</button>
          <input type="file" id="mwi-asset-import-file" accept="application/json" hidden>
        </div>
        <div class="mwi-asset-table-wrap"><table class="mwi-asset-table mwi-asset-history-table"><thead><tr><th>${t("日期", "Date")}</th><th>${t("总资产", "Total")}</th><th>${t("操作", "Actions")}</th></tr></thead><tbody id="mwi-asset-history-rows"></tbody></table></div>
      </details></section>
      <dialog class="mwi-asset-edit-dialog" id="mwi-asset-edit-dialog"><h3>${t("编辑分项资产", "Edit asset components")}</h3><div class="mwi-asset-edit-grid">${ASSET_COMPONENT_KEYS.map(
        (key) => {
          const row = ROWS.find(([candidate]) => candidate === key);
          return `<label>${t(row[1], row[2])}<input type="number" min="0" step="any" data-component="${key}"></label>`;
        },
      ).join(
        "",
      )}</div><div class="mwi-asset-edit-actions"><button type="button" class="mwi-asset-action" data-edit-cancel>${t("取消", "Cancel")}</button><button type="button" class="mwi-asset-action" data-edit-save>${t("保存", "Save")}</button></div></dialog>
    `;
    this.chart = new AssetHistoryChart(
      this.host.querySelector("#mwi-asset-chart"),
      this.host.querySelector(".mwi-asset-chart-fallback"),
    );
    this.bind();
  }

  bind() {
    this.host
      .querySelector("#mwi-asset-open-center")
      .addEventListener("click", () => this.center?.open());
    this.host
      .querySelector("#mwi-asset-breakdown")
      .addEventListener("click", (event) => {
        const button = event.target.closest("[data-component-share]");
        if (!button || button.disabled) return;
        this.shareComponentToChat(button.dataset.componentShare);
      });
    this.host.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        this.mode = button.dataset.mode;
        this.renderChart();
      });
    });
    this.host.querySelectorAll("[data-range]").forEach((button) => {
      button.addEventListener("click", () => {
        this.range =
          button.dataset.range === "all" ? null : Number(button.dataset.range);
        this.renderChart();
      });
    });
    this.host
      .querySelector("#mwi-asset-reset-zoom")
      .addEventListener("click", () => this.chart.resetZoom());
    this.host
      .querySelector("#mwi-asset-export")
      .addEventListener("click", () =>
        downloadBackup(this.store.exportBackup()),
      );
    const fileInput = this.host.querySelector("#mwi-asset-import-file");
    this.host
      .querySelector("#mwi-asset-import")
      .addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const backup = JSON.parse(await file.text());
        const replace = globalThis.confirm?.(
          t(
            "确定：替换当前角色历史；取消：合并导入。",
            "OK: replace this character's history; Cancel: merge it.",
          ),
        );
        this.store.importBackup(backup, {
          mode: replace ? "replace" : "merge",
          scopeKey: this.scopeKey,
        });
        this.update(this.snapshot);
      } catch (error) {
        globalThis.alert?.(
          `${t("导入失败", "Import failed")}: ${error.message}`,
        );
      } finally {
        fileInput.value = "";
      }
    });
    this.host
      .querySelector("#mwi-asset-cleanup")
      .addEventListener("click", () => {
        const removed = this.store.cleanupInvalid(this.scopeKey);
        globalThis.alert?.(
          t(
            `已删除 ${removed} 条无效记录。`,
            `Removed ${removed} invalid records.`,
          ),
        );
        this.update(this.snapshot);
      });
    this.host
      .querySelector("#mwi-asset-anomalies")
      .addEventListener("click", () => {
        const anomalies = this.store.detectAnomalies(this.scopeKey);
        if (!anomalies.length) {
          globalThis.alert?.(
            t("未发现明显异常。", "No clear anomalies found."),
          );
          return;
        }
        const preview = anomalies
          .map(({ date, zScore }) => `${date} (Z=${zScore.toFixed(1)})`)
          .join("\n");
        if (
          !globalThis.confirm?.(
            t(
              `确认删除以下异常日期？\n${preview}`,
              `Delete these anomalous dates?\n${preview}`,
            ),
          )
        ) {
          return;
        }
        anomalies.forEach(({ date }) =>
          this.store.deleteDay(date, this.scopeKey),
        );
        this.update(this.snapshot);
      });
    this.host
      .querySelector("[data-edit-cancel]")
      .addEventListener("click", () => this.closeEditor());
    this.host
      .querySelector("[data-edit-save]")
      .addEventListener("click", () => this.saveEditor());
  }

  shareToChat() {
    const message = buildAssetShareMessage(this.shareStats ?? {});
    if (!message) {
      this.host.querySelector(".mwi-asset-share-status").textContent = t(
        "暂无可对比的盈亏数据",
        "No comparable P/L data yet",
      );
      return;
    }
    this.pasteShareMessage(message);
  }

  shareComponentToChat(key) {
    const message = buildAssetComponentShareMessage(
      this.componentShareStats?.get(key) ?? {},
    );
    if (!message) {
      this.host.querySelector(".mwi-asset-share-status").textContent = t(
        "该分项暂无可对比数据",
        "No comparable data for this component",
      );
      return;
    }
    this.pasteShareMessage(message);
  }

  pasteShareMessage(message) {
    const status = this.host.querySelector(".mwi-asset-share-status");
    const input = pasteAssetShareToChat(message);
    status.dataset.pasted = String(Boolean(input));
    status.textContent = input
      ? t("已放入聊天框，按回车发送", "Pasted into chat; press Enter to send")
      : t(
          "未找到聊天框，请先展开聊天",
          "Chat input not found; open chat first",
        );
  }

  openEditor(dayKey) {
    const record = this.store.getRole(this.scopeKey).days[dayKey];
    const dialog = this.host.querySelector("#mwi-asset-edit-dialog");
    dialog.dataset.dayKey = dayKey;
    for (const input of dialog.querySelectorAll("[data-component]")) {
      const value = record?.values?.[input.dataset.component];
      input.value = Number.isFinite(value) ? value : "";
    }
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  closeEditor() {
    const dialog = this.host.querySelector("#mwi-asset-edit-dialog");
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  saveEditor() {
    const dialog = this.host.querySelector("#mwi-asset-edit-dialog");
    const values = Object.fromEntries(
      [...dialog.querySelectorAll("[data-component]")].map((input) => [
        input.dataset.component,
        Number(input.value),
      ]),
    );
    if (
      !ASSET_COMPONENT_KEYS.every(
        (key) => Number.isFinite(values[key]) && values[key] >= 0,
      )
    ) {
      globalThis.alert?.(
        t(
          "请为全部七个分项填写不小于零的数字。",
          "Enter a non-negative number for all seven components.",
        ),
      );
      return;
    }
    try {
      this.store.updateDay(dialog.dataset.dayKey, values, this.scopeKey);
    } catch {
      globalThis.alert?.(
        t(
          "资产记录保存失败，请检查浏览器存储空间后重试。",
          "Could not save the asset record. Check browser storage and try again.",
        ),
      );
      return;
    }
    this.closeEditor();
    this.update(this.snapshot);
  }

  update(snapshot) {
    this.snapshot = snapshot ?? this.snapshot;
    this.center?.update(this.snapshot);
    if (!this.visible || !this.host.isConnected || this.center?.isOpen()) {
      if (!this.host.isConnected) this.chart.destroy();
      return;
    }
    const dayKey = getUtc8DayKey();
    const todayRecord = this.store.getRole(this.scopeKey).days[dayKey];
    const current = this.snapshot?.values ?? todayRecord?.values ?? {};
    const comparison = this.store.comparison(dayKey, this.scopeKey);
    const previous = comparison?.record?.values ?? {};
    const totalChange =
      Number.isFinite(current.total) && Number.isFinite(previous.total)
        ? current.total - previous.total
        : null;
    const totalPercent =
      Number.isFinite(totalChange) &&
      Number.isFinite(previous.total) &&
      previous.total !== 0
        ? (totalChange / previous.total) * 100
        : null;
    this.shareStats =
      comparison && Number.isFinite(totalPercent)
        ? {
            change: totalChange,
            percent: totalPercent,
            gapDays: comparison.gapDays,
          }
        : null;
    const shareStatus = this.host.querySelector(".mwi-asset-share-status");
    if (shareStatus.dataset.pasted !== "true") shareStatus.textContent = "";
    const compareText = comparison
      ? comparison.gapDays === 1
        ? t(`较昨日（${comparison.date}）`, `vs yesterday (${comparison.date})`)
        : t(
            `较 ${comparison.gapDays} 天前（${comparison.date}）`,
            `vs ${comparison.gapDays} days ago (${comparison.date})`,
          )
      : t("暂无历史对比", "No prior record");
    const setNumber = (
      selector,
      value,
      { signed = false, className = "" } = {},
    ) => {
      const node = this.host.querySelector(selector);
      node.textContent = formatNumber(value, signed);
      node.title = Number.isFinite(value)
        ? runtime.api.formatExactNumber(value, 0)
        : "";
      node.className = `mwi-asset-card-value ${className}`.trim();
    };
    setNumber("#mwi-asset-current-total", current.total);
    setNumber("#mwi-asset-total-change", totalChange, {
      signed: true,
      className: valueClass(totalChange),
    });
    const liquidChange =
      Number.isFinite(current.liquid) && Number.isFinite(previous.liquid)
        ? current.liquid - previous.liquid
        : null;
    const fixedChange =
      Number.isFinite(current.fixed) && Number.isFinite(previous.fixed)
        ? current.fixed - previous.fixed
        : null;
    setNumber("#mwi-asset-liquid-change", liquidChange, {
      signed: true,
      className: valueClass(liquidChange),
    });
    setNumber("#mwi-asset-fixed-change", fixedChange, {
      signed: true,
      className: valueClass(fixedChange),
    });
    this.host.querySelector("#mwi-asset-compare-date").textContent =
      compareText;
    setNumber("#mwi-asset-total-percent", null, {
      className: valueClass(totalChange),
    });
    this.host.querySelector("#mwi-asset-total-percent").textContent =
      formatPercent(current.total, previous.total);
    const average = this.store.sevenDayAverage(dayKey, this.scopeKey);
    setNumber("#mwi-asset-seven-average", average, {
      signed: true,
      className: valueClass(average),
    });
    this.host.querySelector("#mwi-asset-change-heading").textContent =
      comparison
        ? t(`变化（较 ${comparison.date}）`, `Change (vs ${comparison.date})`)
        : t("变化", "Change");

    const body = this.host.querySelector("#mwi-asset-breakdown");
    this.componentShareStats = new Map();
    body.replaceChildren(
      ...ROWS.map(([key, zh, en]) => {
        const row = document.createElement("tr");
        row.dataset.key = key;
        const currentValue = current[key];
        const previousValue = previous[key];
        const change =
          Number.isFinite(currentValue) && Number.isFinite(previousValue)
            ? currentValue - previousValue
            : null;
        const percent =
          Number.isFinite(change) && Number.isFinite(previousValue)
            ? previousValue !== 0
              ? (change / previousValue) * 100
              : change === 0
                ? 0
                : null
            : null;
        const canShare =
          key !== "total" &&
          Boolean(comparison) &&
          Number.isFinite(currentValue) &&
          Number.isFinite(change);
        if (canShare) {
          this.componentShareStats.set(key, {
            key,
            current: currentValue,
            change,
            percent,
            gapDays: comparison.gapDays,
          });
        }
        const label =
          key === "total"
            ? t(zh, en)
            : `<button type="button" class="mwi-asset-component-share" data-component-share="${key}" title="${t(`点击炫耀${zh}变化`, `Click to flex ${en} changes`)}"${canShare ? "" : " disabled"}>${t(zh, en)}</button>`;
        row.innerHTML = `<td>${label}</td><td title="${Number.isFinite(currentValue) ? runtime.api.formatExactNumber(currentValue, 0) : ""}">${formatNumber(currentValue)}</td><td class="${valueClass(change)}" title="${Number.isFinite(change) ? runtime.api.formatExactNumber(change, 0) : ""}">${formatNumber(change, true)}</td><td class="${valueClass(change)}">${formatPercent(currentValue, previousValue)}</td>`;
        return row;
      }),
    );
    this.renderHistoryRows();
    this.renderChart();
  }

  renderHistoryRows() {
    const body = this.host.querySelector("#mwi-asset-history-rows");
    const entries = this.store.list(this.scopeKey).slice().reverse();
    body.replaceChildren(
      ...entries.map(([dayKey, record]) => {
        const row = document.createElement("tr");
        const total = record?.values?.total;
        row.innerHTML = `<td>${dayKey}</td><td title="${Number.isFinite(total) ? runtime.api.formatExactNumber(total, 0) : ""}">${formatNumber(total)}</td><td><button type="button" class="mwi-asset-action" data-edit>${t("编辑", "Edit")}</button> <button type="button" class="mwi-asset-action is-danger" data-delete>${t("删除", "Delete")}</button></td>`;
        row
          .querySelector("[data-edit]")
          .addEventListener("click", () => this.openEditor(dayKey));
        row.querySelector("[data-delete]").addEventListener("click", () => {
          if (
            globalThis.confirm?.(t(`确认删除 ${dayKey}？`, `Delete ${dayKey}?`))
          ) {
            this.store.deleteDay(dayKey, this.scopeKey);
            this.update(this.snapshot);
          }
        });
        return row;
      }),
    );
  }

  renderChart() {
    this.host.querySelectorAll("[data-mode]").forEach((button) => {
      button.dataset.active = String(button.dataset.mode === this.mode);
    });
    this.host.querySelectorAll("[data-range]").forEach((button) => {
      const range =
        button.dataset.range === "all" ? null : Number(button.dataset.range);
      button.dataset.active = String(range === this.range);
    });
    this.chart.render(this.store.list(this.scopeKey), {
      mode: this.mode,
      range: this.range,
    });
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    if (this.visible) return;
    this.chart.destroy();
    this.center?.close();
  }

  destroy() {
    this.visible = false;
    this.chart.destroy();
    this.center?.destroy();
  }
}

export function createAssetHistoryUi({ scope, store, scopeKey }) {
  let active = false;
  let mountMode = null;
  let tab = null;
  let host = null;
  let panel = null;
  let shell = null;
  let navigationBranch = null;
  const hiddenNodes = new Map();
  let lastActiveNativeTab = null;

  const restoreNative = () => {
    for (const [node, state] of hiddenNodes) {
      node.hidden = state.hidden;
      if (state.styleDisplay === null) node.style.removeProperty("display");
      else node.style.display = state.styleDisplay;
    }
    hiddenNodes.clear();
  };

  const captureIdleTabStyle = () => {
    if (!navigationBranch || typeof getComputedStyle !== "function") return;
    const unselectedTab =
      navigationBranch.querySelector(
        `button:not(#${TAB_ID}):not([aria-selected="true"]):not(.Mui-selected)`,
      ) ?? navigationBranch.querySelector(`button:not(#${TAB_ID})`);
    if (!unselectedTab) return;
    const style = getComputedStyle(unselectedTab);
    const background = style.background || style.backgroundColor;
    if (
      background &&
      background !== "transparent" &&
      background !== "rgba(0, 0, 0, 0)"
    ) {
      navigationBranch.style.setProperty(
        "--mwi-asset-idle-background",
        background,
      );
    }
    if (style.borderColor && style.borderColor !== "transparent") {
      navigationBranch.style.setProperty(
        "--mwi-asset-idle-border",
        style.borderColor,
      );
    }
    if (style.color) {
      navigationBranch.style.setProperty("--mwi-asset-idle-color", style.color);
    }
    if (style.boxShadow && style.boxShadow !== "none") {
      navigationBranch.style.setProperty(
        "--mwi-asset-idle-shadow",
        style.boxShadow,
      );
    }
  };

  const clearNativeTabOverride = () => {
    if (!navigationBranch) return;
    delete navigationBranch.dataset.mwitoolsAssetActive;
    for (const property of [
      "--mwi-asset-idle-background",
      "--mwi-asset-idle-border",
      "--mwi-asset-idle-color",
      "--mwi-asset-idle-shadow",
    ]) {
      navigationBranch.style.removeProperty(property);
    }
  };

  const syncHostViewport = () => {
    if (!host) return;
    if (!isCompactViewport() || !active) {
      host.style.removeProperty("height");
      host.style.removeProperty("max-height");
      return;
    }
    const top = Math.max(0, Math.round(host.getBoundingClientRect().top));
    const available = `calc(100dvh - ${top}px - env(safe-area-inset-bottom,0px))`;
    host.style.height = available;
    host.style.maxHeight = available;
  };

  const syncNativeVisibility = () => {
    for (const node of [...(shell?.children ?? [])]) {
      if (
        node === navigationBranch ||
        node === host ||
        node.tagName === "STYLE"
      ) {
        continue;
      }
      if (!hiddenNodes.has(node)) {
        hiddenNodes.set(node, {
          hidden: node.hidden,
          styleDisplay: node.style.display || null,
        });
      }
      if (!node.hidden) node.hidden = true;
      if (node.style.display !== "none") node.style.display = "none";
    }
  };

  const setActive = (next) => {
    const nextActive = Boolean(next);
    if (nextActive === active) {
      if (active) {
        syncNativeVisibility();
        syncHostViewport();
      }
      return;
    }
    if (mountMode === "native" && nextActive && !active) {
      captureIdleTabStyle();
    }
    active = nextActive;
    if (tab) {
      tab.dataset.active = String(active);
      tab.setAttribute("aria-selected", String(active));
      tab.classList.toggle("Mui-selected", active);
      if (tab.hasAttribute("data-selected")) {
        tab.dataset.selected = String(active);
      }
      if (tab.hasAttribute("data-state")) {
        tab.dataset.state = active ? "active" : "inactive";
      }
      if (!active) tab.blur();
    }
    if (navigationBranch && active) {
      const currentSelected = navigationBranch.querySelector(
        `button[aria-selected="true"]:not(#${TAB_ID}), button.Mui-selected:not(#${TAB_ID}), [role="tab"][aria-selected="true"]:not(#${TAB_ID})`,
      );
      if (currentSelected) lastActiveNativeTab = currentSelected;
    }
    if (host) host.hidden = !active;
    panel?.setVisible(active);
    if (!active) {
      restoreNative();
      clearNativeTabOverride();
      syncHostViewport();
      return;
    }
    navigationBranch.dataset.mwitoolsAssetActive = "true";
    syncNativeVisibility();
    syncHostViewport();
    panel?.update(runtime.api.getLatestAssetSnapshot?.());
  };

  const teardownMount = () => {
    setActive(false);
    panel?.destroy();
    panel = null;
    tab?.remove();
    host?.remove();
    mountMode = null;
    tab = null;
    host = null;
    shell = null;
    navigationBranch = null;
    lastActiveNativeTab = null;
  };

  const mountNative = (loadout, found) => {
    mountMode = "native";
    ({ shell, navigationBranch } = found);
    tab = loadout.cloneNode(true);
    tab.id = TAB_ID;
    tab.dataset.mwitoolsCharacterTab = "true";
    tab.type = "button";
    const badgeText = tab.querySelector(
      ".TabsComponent_badge__1Du26, .MuiBadge-root",
    );
    if (badgeText) {
      badgeText.textContent = t("盈亏", "P/L");
    } else {
      tab.textContent = t("盈亏", "P/L");
    }
    for (const className of [...tab.classList]) {
      if (/(?:^|[_-])(?:active|selected)(?:[_-]|$)/i.test(className)) {
        tab.classList.remove(className);
      }
    }
    tab.dataset.active = "false";
    if (tab.hasAttribute("data-selected")) tab.dataset.selected = "false";
    if (tab.hasAttribute("data-state")) tab.dataset.state = "inactive";
    tab.setAttribute("aria-selected", "false");
    tab.setAttribute("tabindex", "-1");
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActive(!active);
    });
    loadout.insertAdjacentElement("afterend", tab);
    host = document.createElement("section");
    host.id = PANEL_ID;
    host.hidden = true;
    shell.appendChild(host);
    panel = new AssetHistoryPanel(host, store, scopeKey);
    panel.update(runtime.api.getLatestAssetSnapshot?.());
  };

  const ensureMounted = () => {
    const loadout = findCharacterManagementLoadoutTab();
    const found = loadout && findPanelShell(loadout);
    if (loadout && found) {
      const mountedOnCurrentTabs =
        tab?.parentElement === loadout.parentElement &&
        tab?.previousElementSibling === loadout &&
        host?.parentElement === found.shell;
      if (
        mountMode === "native" &&
        tab?.isConnected &&
        host?.isConnected &&
        mountedOnCurrentTabs
      ) {
        const otherSelected = navigationBranch?.querySelector(
          `button[aria-selected="true"]:not(#${TAB_ID}), button.Mui-selected:not(#${TAB_ID}), [role="tab"][aria-selected="true"]:not(#${TAB_ID})`,
        );
        if (
          (otherSelected && otherSelected !== lastActiveNativeTab) ||
          tab.getAttribute("aria-selected") !== "true"
        ) {
          if (active) setActive(false);
          return;
        }
        if (active) {
          syncNativeVisibility();
          syncHostViewport();
        }
        return;
      }
      teardownMount();
      mountNative(loadout, found);
      return;
    }
    if (mountMode !== null) teardownMount();
  };

  addStyles();
  ensureMounted();
  const mountScheduler = createFrameScheduler(ensureMounted);
  subscribeMutationChannel(
    {
      name: "character-management-mount",
      target: document.body,
      options: {
        attributes: true,
        attributeFilter: ["aria-selected", "class", "data-active", "hidden"],
        childList: true,
        subtree: true,
      },
      scope,
    },
    (records) => {
      const relevant = records.some((record) => {
        const target =
          record.target?.nodeType === 1
            ? record.target
            : record.target?.parentElement;
        if (target?.closest?.(`#${TAB_ID},#${PANEL_ID},#${CENTER_ID}`)) {
          return false;
        }
        if (record.type === "attributes") {
          return Boolean(
            target?.closest?.(
              '[class*="CharacterManagement_characterManagement"]',
            ),
          );
        }
        if (
          target?.closest?.(
            '[class*="CharacterManagement_characterManagement"]',
          )
        ) {
          return true;
        }
        return [...record.addedNodes, ...record.removedNodes].some(
          (node) =>
            node?.nodeType === 1 &&
            !(
              node.matches?.(`#${TAB_ID},#${PANEL_ID},#${CENTER_ID}`) ||
              node.closest?.(`#${TAB_ID},#${PANEL_ID},#${CENTER_ID}`)
            ) &&
            (node.matches?.(
              '[class*="CharacterManagement_characterManagement"]',
            ) ||
              node.querySelector?.(
                '[class*="CharacterManagement_characterManagement"]',
              )),
        );
      });
      if (relevant) mountScheduler.schedule();
    },
  );
  scope.add(() => mountScheduler.cancel());
  const handleTabBranchClick = (event) => {
    if (
      !active ||
      event.target.closest(`#${TAB_ID}`) ||
      event.target.closest(`#${PANEL_ID}`)
    ) {
      return;
    }
    if (navigationBranch?.contains(event.target)) setActive(false);
  };
  scope.event(document, "pointerdown", handleTabBranchClick, true);
  scope.event(document, "click", handleTabBranchClick, true);
  scope.event(document, "keydown", (event) => {
    if (active && isCompactViewport() && event.key === "Escape") {
      setActive(false);
    }
  });
  scope.event(window, "resize", syncHostViewport);

  return {
    update(snapshot) {
      panel?.update(snapshot);
    },
    destroy() {
      teardownMount();
      document.getElementById(STYLE_ID)?.remove();
    },
  };
}
