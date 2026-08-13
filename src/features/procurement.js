import { runtime } from "../core/runtime.js";
import { parseCompactNumber } from "../core/market.js";

const STYLE_ID = "mwitools-procurement-style";
const HOST_ID = "mwitools-procurement-host";
const MARKET_NAV_ID = "mwitools-procurement-market-nav";
const PRODUCTION_ID = "mwitools-procurement-production";
const procurement = runtime.api.procurement;

let shell = null;
let shadow = null;
let drawerOpen = false;
let activeTab = "cart";
let currentMarketTarget = "";
let armedNextItem = "";
let marketSessionDone = new Map();
let marketSessionActive = false;
let marketSessionRequiresModal = false;
let marketSessionStartedAt = 0;
let marketSessionModalSeen = false;
let marketSessionHost = null;
let marketSessionRestoreNavTarget = "";
let lastProductionSignature = "";
let activeHoldRepeatStop = null;

const MARKET_SESSION_OPEN_GRACE_MS = 2_500;

const CART_ICON = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1.6"/><circle cx="19" cy="21" r="1.6"/><path d="M2 3h3l2.6 12.5a2 2 0 0 0 2 1.5h8.7a2 2 0 0 0 2-1.6L22 7H6"/></svg>`;
const STAR_ICON = `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/></svg>`;

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function marketFeaturesSuppressed() {
  return runtime.api.shouldSuppressMarketFeatures?.() ?? false;
}

function materialNoun(count) {
  if (runtime.config.isZH) return "种材料";
  return Number(count) === 1 ? "material" : "materials";
}

function formatNumber(value) {
  return runtime.api.numberFormatter?.(value) ?? String(value ?? "—");
}

function exactNumber(value) {
  return runtime.api.formatExactNumber?.(value) ?? String(value ?? "—");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .mwi-procurement-badge{position:static!important;display:inline-flex;max-width:78px;min-height:16px;align-items:center;margin-left:4px;padding:0 4px;border:1px solid rgba(255,255,255,.16);border-radius:3px;background:rgba(15,18,28,.72);font:600 .58rem/1.35 Roboto,Arial,sans-serif;vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:auto}
    .mwi-procurement-panel{min-width:330px!important;max-width:min(420px,calc(100vw - 24px))!important}
    .mwi-procurement-requirement-row{width:max-content!important;max-width:none!important;grid-template-columns:repeat(4,max-content)!important;align-items:center!important;white-space:nowrap!important}
    .mwi-procurement-badge[data-state="missing"]{color:#ffad62;border-color:rgba(255,153,51,.45)}
    .mwi-procurement-badge[data-state="ready"]{color:#43d17f;border-color:#43c979;background:rgba(48,176,105,.12)}
    .mwi-procurement-badge[data-state="locked"]{color:#d9bd72;border-color:rgba(210,180,90,.4)}
    #${PRODUCTION_ID}{min-width:0;max-width:100%;box-sizing:border-box;margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,.08);font:inherit;font-size:.66rem}
    .mwi-procurement-summary-line{display:flex;min-width:0;align-items:center;gap:5px;flex-wrap:wrap}
    .mwi-procurement-summary-state{min-width:0;flex:1;color:var(--color-text-secondary,#aaa);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mwi-procurement-summary-state strong{color:#ffad62}
    .mwi-procurement-chain-mode{display:inline-flex;align-items:center;gap:4px;color:var(--color-text-secondary,#aaa);font-size:.62rem;white-space:nowrap;cursor:pointer}
    .mwi-procurement-chain-mode input{width:14px;height:14px;margin:0;accent-color:#8293d6;cursor:pointer}
    .mwi-procurement-inline-button{min-height:24px;padding:2px 8px;border:1px solid rgba(255,255,255,.16);border-radius:4px;background:var(--color-midnight-500,#343a54);color:var(--color-neutral-100,#eee);font:inherit;font-size:.65rem;cursor:pointer}
    .mwi-procurement-inline-button:hover{background:var(--color-space-700,#46547e)}
    .mwi-procurement-chain{margin-top:4px;border-radius:4px;background:rgba(0,0,0,.12)}
    .mwi-procurement-chain>summary{padding:4px 6px;cursor:pointer;color:var(--color-text-secondary,#aaa)}
    .mwi-procurement-chain-presets{display:flex;gap:4px;padding:0 6px 5px}
    .mwi-procurement-chain-preset{min-height:22px;padding:2px 7px;border:1px solid rgba(255,255,255,.14);border-radius:4px;background:rgba(255,255,255,.04);color:var(--color-text-secondary,#aaa);font:inherit;font-size:.62rem;cursor:pointer}
    .mwi-procurement-chain-preset[aria-pressed="true"]{border-color:#8293d6;background:rgba(82,100,154,.34);color:#fff}
    .mwi-procurement-chain-list{display:grid;gap:3px;padding:0 6px 6px}
    .mwi-procurement-chain-stage{display:flex;align-items:center;gap:6px;min-width:0}
    .mwi-procurement-chain-stage span:first-of-type{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mwi-procurement-chain-stage span:last-child{margin-left:auto;color:#d7bb67;white-space:nowrap}
    .mwi-procurement-market-target{outline:2px solid rgba(245,158,11,.72)!important;outline-offset:1px;border-radius:4px;box-shadow:0 0 0 3px rgba(245,158,11,.12)}
    #${MARKET_NAV_ID}{position:fixed;z-index:1005;display:flex;box-sizing:border-box;align-items:center;gap:7px;min-height:40px;padding:5px 8px;border:1px solid var(--color-midnight-400,#505776);border-radius:0 0 5px 5px;background:var(--color-midnight-900,#151927);color:var(--color-neutral-100,#eee);box-shadow:0 7px 18px rgba(0,0,0,.38);font:inherit;font-size:.68rem}
    #${MARKET_NAV_ID}[data-inside="true"]{border-radius:5px 5px 0 0;box-shadow:0 -5px 16px rgba(0,0,0,.35)}
    .mwi-procurement-nav-progress{flex:0 0 auto;color:var(--color-space-300,#9da9d0);white-space:nowrap}
    .mwi-procurement-nav-items{display:flex;min-width:0;flex:1;gap:4px;overflow-x:auto;padding:1px}
    .mwi-procurement-nav-chip{position:relative;display:flex;flex:0 0 34px;width:34px;height:32px;align-items:center;justify-content:center;padding:2px;border:1px solid var(--color-midnight-400,#505776);border-radius:4px;background:var(--color-midnight-700,#272d43);color:inherit;cursor:pointer}
    .mwi-procurement-nav-chip[data-current="true"]{border-color:#8293d6;background:#394568}
    .mwi-procurement-nav-chip[data-done="true"]{opacity:.68;border-color:#4d9d68;cursor:default}
    .mwi-procurement-nav-icon{display:flex;width:27px;height:27px;align-items:center;justify-content:center;overflow:hidden}.mwi-procurement-nav-icon svg{display:block;width:27px;height:27px}.mwi-procurement-nav-icon .item-icon-fallback{font-size:11px;font-weight:700}
    .mwi-procurement-nav-chip b{position:absolute;right:-2px;bottom:-2px;min-width:13px;padding:0 2px;border-radius:5px;background:var(--color-midnight-900,#151927);color:var(--color-neutral-100,#eee);font-size:.55rem;line-height:12px;text-align:center;box-shadow:0 0 0 1px var(--color-midnight-400,#505776)}.mwi-procurement-nav-chip[data-done="true"] b{color:#62d88e}
    .mwi-procurement-nav-next{flex:0 0 auto;min-height:28px;padding:3px 10px;border:0;border-radius:4px;background:var(--color-space-600,#52649a);color:#fff;cursor:pointer;white-space:nowrap}
    .mwi-procurement-toast{position:fixed;right:14px;top:14px;z-index:2147483000;max-width:min(360px,calc(100vw - 28px));padding:8px 11px;border:1px solid rgba(245,158,11,.55);border-radius:5px;background:rgba(15,18,28,.96);color:#eee;font-size:.75rem;box-shadow:0 8px 22px rgba(0,0,0,.4)}
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function shellStyles() {
  return `
    :host{all:initial;color-scheme:dark;--panel:#171b2a;--card:#23283b;--text:#e7e9ef;--muted:#9299aa;--line:#505773;--accent:#5669ab;--gold:#e8c87f;font-family:"PingFang SC","Microsoft YaHei",Roboto,system-ui,sans-serif}
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
    button,input,select{border:0;background:none;color:inherit;font:inherit}
    button{cursor:pointer}.icon{display:block}
    ::-webkit-scrollbar{width:7px}::-webkit-scrollbar-thumb{border-radius:4px;background:color-mix(in srgb,var(--muted) 28%,transparent)}
    .handle{position:fixed;right:0;z-index:1002;display:flex;width:32px;height:62px;align-items:center;justify-content:center;border-radius:9px 0 0 9px;background:var(--panel);color:var(--text);box-shadow:-2px 2px 10px rgba(0,0,0,.3);cursor:pointer;opacity:.86;touch-action:none;user-select:none;transition:opacity .15s}
    .handle:hover{opacity:1}.handle .icon{width:16px;height:16px}.handle[data-has-items="true"]{box-shadow:-2px 2px 10px rgba(0,0,0,.3),inset 2px 0 0 var(--gold)}
    .handle-badge{position:absolute;top:9px;right:7px;width:7px;height:7px;border-radius:50%;background:var(--gold);box-shadow:0 0 0 2px var(--panel)}
    .handle-badge::after{content:"";position:absolute;inset:-3px;border:1.5px solid var(--gold);border-radius:50%;opacity:.6;animation:badge-pulse 1.6s ease-out infinite}@keyframes badge-pulse{0%{transform:scale(.7);opacity:.7}100%{transform:scale(1.9);opacity:0}}
    .drawer{position:fixed;top:56px;right:10px;z-index:1001;display:flex;width:var(--drawer-width,360px);max-width:calc(100vw - 26px);min-height:320px;max-height:calc(100vh - 96px);flex-direction:column;border-radius:10px;background:var(--panel);color:var(--text);box-shadow:0 10px 32px rgba(0,0,0,.45),0 0 0 1px color-mix(in srgb,var(--line) 70%,transparent);transform:translateX(calc(100% + 18px));transition:transform .2s ease}
    .drawer[data-open="true"]{transform:translateX(0)}.resize{position:absolute;left:-3px;top:0;bottom:0;width:7px;border-radius:10px 0 0 10px;cursor:ew-resize;touch-action:none}.resize:hover{background:color-mix(in srgb,var(--accent) 25%,transparent)}
    .header{display:flex;flex:0 0 auto;align-items:center;gap:8px;padding:11px 14px 9px;border-bottom:1px solid color-mix(in srgb,var(--line) 55%,transparent)}
    .title{font-size:14px;font-weight:700;letter-spacing:.2px}.head-count{padding:2px 7px;border-radius:5px;background:color-mix(in srgb,var(--gold) 12%,transparent);color:color-mix(in srgb,var(--gold) 85%,white);font-size:10.5px}.head-count:empty{display:none}
    .close{margin-left:auto;width:27px;height:27px;border-radius:5px;color:var(--muted);font-size:15px}.close:hover{background:color-mix(in srgb,var(--text) 9%,transparent);color:var(--text)}
    .tabs{display:flex;flex:0 0 auto;gap:2px;margin:8px 12px 0;padding:2px;border-radius:7px;background:color-mix(in srgb,var(--text) 5%,transparent)}
    .tab{flex:1;min-width:0;padding:7px 0;border-radius:5px;color:var(--muted);font-size:12px;font-weight:600;white-space:nowrap}.tab:hover{color:var(--text)}.tab[data-active="true"]{background:var(--accent);color:#fff}
    .body{min-height:100px;flex:1 1 auto;overflow-y:auto;padding:4px 12px 6px}.empty{margin:12px 2px;padding:26px 12px;border-radius:8px;background:color-mix(in srgb,var(--text) 4%,transparent);color:var(--muted);font-size:12.5px;line-height:1.7;text-align:center}
    .cart-row{display:grid;min-height:56px;grid-template-columns:26px 44px minmax(0,1fr) auto auto;grid-template-rows:auto auto;align-items:center;column-gap:9px;row-gap:2px;padding:7px 2px;border-bottom:1px solid color-mix(in srgb,var(--line) 40%,transparent)}.cart-row:hover,.plan-row:hover{background:color-mix(in srgb,var(--text) 4%,transparent)}
    .star{grid-column:1;grid-row:1/span 2;width:26px;height:32px;border-radius:5px;color:color-mix(in srgb,var(--muted) 32%,transparent)}.star:hover{color:color-mix(in srgb,var(--gold) 70%,transparent)}.star[data-active="true"]{color:var(--gold)}.star .icon{width:14px;height:14px;margin:auto}
    .item-icon{grid-column:2;grid-row:1/span 2;display:flex;width:42px;height:42px;align-items:center;justify-content:center;border-radius:8px;background:var(--card);cursor:pointer}.item-icon:hover{background:color-mix(in srgb,var(--card) 88%,white)}.item-icon svg{width:32px;height:32px}.item-icon-fallback{color:var(--muted);font-size:13px;font-weight:700}
    .item-name{grid-column:3;grid-row:1;min-width:0;overflow:hidden;color:var(--text);font-size:13.5px;font-weight:600;text-align:left;text-overflow:ellipsis;white-space:nowrap}.item-name:hover{color:var(--gold)}
    .row-controls{grid-column:4;grid-row:1;display:flex;align-items:stretch;overflow:hidden;border-radius:6px;background:color-mix(in srgb,var(--text) 6%,transparent)}.step{width:27px;color:var(--muted);font-size:15px}.step:hover{background:color-mix(in srgb,var(--text) 9%,transparent);color:var(--text)}.qty{width:56px;height:30px;outline:0;background:transparent;color:var(--gold);font-size:13.5px;font-weight:700;text-align:center;font-variant-numeric:tabular-nums}.qty:focus{background:color-mix(in srgb,var(--accent) 16%,transparent)}
    .delete{grid-column:5;grid-row:1;width:26px;height:32px;border-radius:5px;color:color-mix(in srgb,var(--muted) 55%,transparent);font-size:15px}.delete:hover{background:color-mix(in srgb,#e05a64 14%,transparent);color:#ff8d96}
    .row-bottom{grid-column:3/6;grid-row:2;display:flex;min-width:0;align-items:center;gap:6px;color:var(--muted);font-size:11px;white-space:nowrap}.owned,.price{color:var(--muted)}.price{color:color-mix(in srgb,var(--gold) 78%,var(--muted))}.threshold-wrap{display:flex;min-width:0;align-items:center;gap:3px}.threshold{width:52px;padding:2px 4px;border-radius:4px;outline:0;background:color-mix(in srgb,var(--text) 7%,transparent);color:var(--text);font-size:10px;text-align:center}
    .panel-footer{display:flex;flex:0 0 auto;align-items:center;gap:8px;min-height:56px;padding:10px 14px;border-top:1px solid color-mix(in srgb,var(--line) 55%,transparent);color:var(--muted);font-size:11px}.panel-footer:empty{display:none}.footer-total{font-size:10px;line-height:1.35}.footer-total strong{display:block;color:var(--gold);font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}.footer-total small{display:block;color:var(--muted);font-size:9px}.clear{margin-left:auto;padding:9px 18px;border-radius:6px;background:color-mix(in srgb,var(--text) 8%,transparent);color:var(--text);font-size:12.5px;font-weight:700}.clear:hover{background:color-mix(in srgb,#e05a64 14%,transparent);color:#ff8d96}
    .plan-row{display:flex;min-height:58px;flex-direction:column;gap:6px;padding:8px 4px;border-bottom:1px solid color-mix(in srgb,var(--line) 40%,transparent)}.row-top{display:flex;align-items:center;gap:8px;min-width:0}.plan-title{min-width:0;flex:1;overflow:hidden;color:var(--text);font-size:13px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}.plan-status{color:var(--gold);font-size:10.5px}.progress{height:4px;overflow:hidden;border-radius:2px;background:color-mix(in srgb,var(--text) 7%,transparent)}.progress>span{display:block;height:100%;background:var(--accent)}.plan-meta{display:flex;justify-content:space-between;color:var(--muted);font-size:10.5px}.plan-actions{display:flex;gap:5px}.plan-actions button{padding:6px 9px;border-radius:6px;background:color-mix(in srgb,var(--text) 7%,transparent);color:var(--muted);font-size:11px;font-weight:600}.plan-actions button:hover{background:color-mix(in srgb,var(--text) 11%,transparent);color:var(--text)}
    .setting-section{margin-top:5px}.setting-section-title{padding:8px 4px 4px;color:var(--muted);font-size:10.5px;font-weight:700;letter-spacing:.4px}.setting-row{display:flex;min-height:48px;align-items:center;gap:10px;padding:5px 4px;border-bottom:1px solid color-mix(in srgb,var(--line) 32%,transparent)}.setting-label{min-width:0;flex:1;color:var(--text);font-size:13px;font-weight:600}.setting-label small{display:block;margin-top:2px;color:var(--muted);font-size:10.5px;font-weight:400}.switch-state{min-width:18px;color:var(--muted);font-size:10.5px;text-align:right}.switch-state[data-on="true"]{color:#3edd8b;font-weight:700}.switch{position:relative;width:42px;height:23px;flex:0 0 auto;border-radius:99px;background:color-mix(in srgb,var(--text) 10%,transparent);transition:background-color .15s}.switch::after{content:"";position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#fff;opacity:.5;transition:transform .15s,opacity .15s}.switch[data-on="true"]{background:#29c274}.switch[data-on="true"]::after{transform:translateX(19px);opacity:1}
    .setting-row input[type="number"],.setting-row select,.setting-button{flex:0 0 auto;min-height:28px;padding:5px 8px;border-radius:6px;background:color-mix(in srgb,var(--text) 7%,transparent);color:var(--text);font-size:11.5px}.setting-row input[type="number"]{width:76px;border:1px solid color-mix(in srgb,var(--text) 14%,transparent);outline:0;text-align:center}.setting-row select{max-width:116px}.setting-button{font-weight:600}.setting-button:hover{background:color-mix(in srgb,var(--text) 11%,transparent)}.shortcut{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    @media(max-width:760px){
      .drawer{left:0;right:0;top:auto;bottom:0;width:100%!important;max-width:none;height:52%;min-height:0;max-height:90%;border-radius:14px 14px 0 0;box-shadow:0 -10px 32px rgba(0,0,0,.5);transform:translateY(105%)}
      .drawer[data-open="true"]{transform:translateY(0)}
      .resize{display:none}
      .header::before{content:"";position:absolute;top:7px;left:50%;width:44px;height:4px;border-radius:2px;background:color-mix(in srgb,var(--muted) 45%,transparent);transform:translateX(-50%)}.header{position:relative;padding-top:18px}
    }
    @media(prefers-reduced-motion:reduce){.drawer{transition:none}.handle-badge::after{animation:none}}
  `;
}

function showToast(message) {
  document
    .querySelectorAll(".mwi-procurement-toast")
    .forEach((node) => node.remove());
  const toast = document.createElement("div");
  toast.className = "mwi-procurement-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

function pendingItems() {
  return procurement
    .getCartItems()
    .filter((item) => item.quantity > 0)
    .sort((a, b) => {
      if (a.starred !== b.starred) return a.starred ? -1 : 1;
      return a.name.localeCompare(b.name, runtime.config.isZH ? "zh" : "en");
    });
}

function findItemsSpriteBase() {
  for (const entry of globalThis.performance?.getEntriesByType?.("resource") ??
    []) {
    if (entry.name?.includes("items_sprite") && entry.name.endsWith(".svg")) {
      try {
        return new URL(entry.name).pathname;
      } catch {
        return entry.name;
      }
    }
  }
  const use = document.querySelector(
    'svg use[href*="items_sprite"],svg use[xlink\\:href*="items_sprite"]',
  );
  const href =
    use?.getAttribute("href") ?? use?.getAttribute("xlink:href") ?? "";
  return href.includes("#") ? href.split("#")[0] : "";
}

function renderItemIcon(item) {
  const bare = procurement.normalizeItemHrid(item.itemHrid).split("/").at(-1);
  const sprite = findItemsSpriteBase();
  if (!bare || !sprite) {
    return `<span class="item-icon-fallback">${escapeHtml((item.name || "?").trim().charAt(0) || "?")}</span>`;
  }
  const href = `${sprite}#${bare}`;
  return `<svg viewBox="0 0 32 32" aria-label="${escapeHtml(item.name)}"><use href="${escapeHtml(href)}" xlink:href="${escapeHtml(href)}"></use></svg>`;
}

function renderShell() {
  if (!shadow) return;
  const settings = procurement.getSettings();
  const items = procurement.getCartItems();
  const activeCount = items.filter((item) => item.quantity > 0).length;
  const handle = shadow.querySelector(".handle");
  const drawer = shadow.querySelector(".drawer");
  if (!handle || !drawer) return;
  handle.style.top = `${clampHandleY(settings.handleY)}px`;
  drawer.style.setProperty("--drawer-width", `${settings.drawerWidth}px`);
  drawer.dataset.open = String(drawerOpen);
  handle.dataset.hasItems = String(activeCount > 0);
  handle.setAttribute("aria-expanded", String(drawerOpen));
  handle.querySelector(".handle-badge").hidden = activeCount === 0;
  shadow.querySelector(".head-count").textContent = activeCount
    ? t(`缺 ${activeCount} 项`, `${activeCount} missing`)
    : t("无缺料", "All set");
  for (const button of shadow.querySelectorAll(".tab")) {
    button.dataset.active = String(button.dataset.tab === activeTab);
  }
  const body = shadow.querySelector(".body");
  shadow.querySelector(".panel-footer").replaceChildren();
  if (activeTab === "plans") renderPlans(body);
  else if (activeTab === "settings") renderProcurementSettings(body);
  else renderCart(body);
}

function renderCart(body) {
  const items = procurement.getCartItems();
  body.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t(
      "购物清单还是空的。打开生产或房屋界面，把缺少的材料加入这里。",
      "Your shopping list is empty. Add missing materials from a production or housing panel.",
    );
    body.append(empty);
    return;
  }
  const settings = procurement.getSettings();
  const marketEnabled = !marketFeaturesSuppressed();
  const pricesEnabled = marketEnabled && settings.pricesEnabled;
  let total = 0;
  let unpriced = 0;
  for (const item of items) {
    const row = document.createElement("article");
    row.className = "cart-row";
    const price = pricesEnabled
      ? runtime.api.getAskPrice?.(item.itemHrid, item.enhancementLevel) ||
        runtime.api.getFairValue?.(item.itemHrid, item.enhancementLevel) ||
        0
      : 0;
    if (pricesEnabled && item.quantity > 0) {
      if (price > 0) total += price * item.quantity;
      else unpriced += 1;
    }
    row.innerHTML = `
      <button class="star" data-active="${Boolean(item.starred)}" title="${t("收藏：买齐后保留并监控常备数量", "Favorite: keep and restock")}">${STAR_ICON}</button>
      <button class="item-icon" ${marketEnabled ? `title="${t("在市场中打开", "Open in marketplace")}"` : "disabled"}>${renderItemIcon(item)}</button>
      <button class="item-name" title="${escapeHtml(item.name)}" ${marketEnabled ? "" : "disabled"}>${escapeHtml(item.name)}${item.enhancementLevel ? ` +${item.enhancementLevel}` : ""}</button>
      <div class="row-controls">
        <button class="step" data-step="-1">−</button>
        <input class="qty" inputmode="numeric" value="${item.quantity}" aria-label="${t("待购数量", "Quantity")}">
        <button class="step" data-step="1">＋</button>
      </div>
      <button class="delete" title="${t("删除", "Remove")}">×</button>
      <div class="row-bottom">
        <span class="owned" title="${exactNumber(procurement.getInventoryCount(item.itemHrid, item.enhancementLevel))}">${t("库存", "Stock")} ${formatNumber(procurement.getInventoryCount(item.itemHrid, item.enhancementLevel))}</span>
        ${pricesEnabled ? `<span class="price" title="${price > 0 ? exactNumber(price * item.quantity) : "—"}">${price > 0 ? `${formatNumber(price)} · ${t("计", "total")} ${formatNumber(price * item.quantity)}` : "—"}</span>` : ""}
        <label class="threshold-wrap" ${item.starred ? "" : "hidden"}>${t("常备", "Min")}<input class="threshold" inputmode="numeric" placeholder="0" value="${item.threshold ?? ""}"></label>
      </div>`;
    const setQuantity = (quantity) => {
      procurement.setCartItemQuantity(
        item.itemHrid,
        quantity,
        item.enhancementLevel,
      );
    };
    row.querySelector(".star").addEventListener("click", () => {
      procurement.updateCartItem(item.itemHrid, item.enhancementLevel, {
        starred: !item.starred,
      });
    });
    for (const target of row.querySelectorAll(".item-name,.item-icon")) {
      if (marketEnabled) {
        target.addEventListener("click", () => {
          openMarketplace(item.itemHrid, item.enhancementLevel);
        });
      }
    }
    row.querySelector(".delete").addEventListener("click", () => {
      stopActiveHoldRepeat();
      procurement.removeFromCart(item.itemHrid, item.enhancementLevel);
    });
    const quantityInput = row.querySelector(".qty");
    quantityInput.addEventListener("change", () => {
      setQuantity(runtime.api.parseCompactNumber?.(quantityInput.value));
    });
    for (const step of row.querySelectorAll(".step")) {
      step.addEventListener("click", () => {
        setQuantity(item.quantity + Number(step.dataset.step));
      });
      installHoldRepeat(step, () => {
        const latest = procurement.getCartItem(
          item.itemHrid,
          item.enhancementLevel,
        );
        if (!latest) {
          stopActiveHoldRepeat();
          return;
        }
        setQuantity((latest?.quantity ?? 0) + Number(step.dataset.step));
      });
    }
    row.querySelector(".threshold").addEventListener("change", (event) => {
      procurement.updateCartItem(item.itemHrid, item.enhancementLevel, {
        threshold: event.target.value
          ? runtime.api.parseCompactNumber?.(event.target.value)
          : null,
      });
    });
    body.append(row);
  }
  const footer = shadow.querySelector(".panel-footer");
  footer.innerHTML = `
    ${marketEnabled ? `<span class="footer-total">${t("补齐合计", "Total")}<strong title="${unpriced ? t("部分物品缺少价格", "Some items are unpriced") : exactNumber(total)}">${settings.cartTotalEnabled && !unpriced ? formatNumber(total) : "—"}</strong>${unpriced ? `<small>${unpriced} ${t("项未估价", "unpriced")}</small>` : ""}</span>` : ""}
    <button class="clear">${t("清空未收藏", "Clear")}</button>`;
  footer.querySelector(".clear").addEventListener("click", () => {
    stopActiveHoldRepeat();
    procurement.clearCart();
  });
}

function stopActiveHoldRepeat() {
  activeHoldRepeatStop?.();
}

function installHoldRepeat(button, callback) {
  let delayTimer = null;
  let repeatTimer = null;
  let pointerId = null;
  const stop = () => {
    clearTimeout(delayTimer);
    clearInterval(repeatTimer);
    delayTimer = null;
    repeatTimer = null;
    pointerId = null;
    window.removeEventListener("pointerup", stopForPointer, true);
    window.removeEventListener("pointercancel", stopForPointer, true);
    window.removeEventListener("blur", stop, true);
    if (activeHoldRepeatStop === stop) activeHoldRepeatStop = null;
  };
  const stopForPointer = (event) => {
    if (pointerId === null || event.pointerId === pointerId) stop();
  };
  button.addEventListener("pointerdown", (event) => {
    stopActiveHoldRepeat();
    pointerId = event.pointerId;
    activeHoldRepeatStop = stop;
    window.addEventListener("pointerup", stopForPointer, true);
    window.addEventListener("pointercancel", stopForPointer, true);
    window.addEventListener("blur", stop, true);
    delayTimer = setTimeout(() => {
      repeatTimer = setInterval(callback, 90);
    }, 420);
  });
  button.addEventListener("pointerup", stopForPointer);
  button.addEventListener("pointercancel", stopForPointer);
}

function renderPlans(body) {
  const plans = procurement.getPlans();
  body.replaceChildren();
  if (!plans.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t(
      "还没有制作计划。把生产缺料加入购物车时可以同时创建。",
      "No crafting plans yet. Create one when adding production materials.",
    );
    body.append(empty);
    return;
  }
  for (const plan of plans) {
    const row = document.createElement("article");
    row.className = "plan-row";
    const percent = plan.targetCount
      ? Math.min(100, (plan.progress / plan.targetCount) * 100)
      : 0;
    row.innerHTML = `
      <div class="row-top"><div class="plan-title">${escapeHtml(plan.name)}</div><span class="plan-status">${plan.status === "completed" ? t("已完成", "Completed") : t("进行中", "Active")}</span></div>
      <div class="progress"><span style="width:${percent}%"></span></div>
      <div class="plan-meta"><span>${formatNumber(plan.progress)} / ${formatNumber(plan.targetCount)}</span><span>${Object.keys(plan.materials ?? {}).length} ${materialNoun(Object.keys(plan.materials ?? {}).length)}</span></div>
      <div class="plan-actions"><button data-action="count">${t("修改次数", "Edit count")}</button><button data-action="toggle">${plan.status === "completed" ? t("重新打开", "Reopen") : t("完成", "Complete")}</button><button data-action="remove">${t("删除", "Delete")}</button></div>`;
    row.querySelector('[data-action="count"]').addEventListener("click", () => {
      const value = globalThis.prompt?.(
        t("输入新的目标次数", "Enter a new target count"),
        String(plan.targetCount),
      );
      if (value != null)
        procurement.updatePlan(plan.id, { targetCount: value });
    });
    row
      .querySelector('[data-action="toggle"]')
      .addEventListener("click", () => {
        procurement.updatePlan(plan.id, {
          status: plan.status === "completed" ? "active" : "completed",
        });
      });
    row
      .querySelector('[data-action="remove"]')
      .addEventListener("click", () => {
        procurement.removePlan(plan.id);
      });
    body.append(row);
  }
  const footer = shadow.querySelector(".panel-footer");
  footer.innerHTML = `<span>${t("制作计划", "Plans")} ${plans.length}</span><button class="clear">${t("清空计划", "Clear plans")}</button>`;
  footer.querySelector(".clear").addEventListener("click", () => {
    for (const plan of procurement.getPlans()) procurement.removePlan(plan.id);
  });
}

const SETTING_SECTIONS = [
  {
    title: ["生产材料", "Production materials"],
    rows: [
      ["badgesEnabled", "材料缺口徽标", "Material shortage badges", "bool"],
      ["upgradeChainEnabled", "升级链材料", "Upgrade-chain materials", "bool"],
      [
        "createPlansByDefault",
        "默认建立制作计划",
        "Create plans by default",
        "bool",
      ],
      ["inventorySyncEnabled", "精确库存同步", "Exact inventory sync", "bool"],
      [
        "autoRestockEnabled",
        "收藏物资自动补货",
        "Favorite item restocking",
        "bool",
      ],
    ],
  },
  {
    title: ["市场购物", "Marketplace"],
    rows: [
      ["locateEnabled", "市场材料定位", "Locate market materials", "bool"],
      [
        "autoPrefillEnabled",
        "自动填写购买数量",
        "Prefill purchase quantity",
        "bool",
      ],
      ["purchaseNavEnabled", "购物导航条", "Shopping navigation", "bool"],
      ["pricesEnabled", "显示市场价格", "Show market prices", "bool"],
      ["cartTotalEnabled", "显示购物总价", "Show cart total", "bool"],
      [
        "autoCollapseEnabled",
        "全部补齐后自动收起",
        "Collapse when fulfilled",
        "bool",
      ],
    ],
  },
  {
    title: ["安全材料", "Material safety"],
    rows: [
      ["safetyLevel", "材料安全余量", "Material safety margin", "safety"],
      [
        "safetyThreshold",
        "启用余量的最少次数",
        "Minimum count for margin",
        "number",
      ],
      [
        "guzzlingPouchLevel",
        "狂饮袋等级（-1 自动）",
        "Guzzling pouch level (-1 auto)",
        "pouch",
      ],
    ],
  },
  {
    title: ["界面与快捷键", "Interface & shortcut"],
    rows: [
      [
        "autoExpandOnAddEnabled",
        "加购后自动展开",
        "Expand after adding",
        "bool",
      ],
      ["nextItemShortcut", "下一项快捷键", "Next item shortcut", "shortcut"],
      ["resetHandle", "重置把手位置", "Reset handle position", "button"],
      ["resetDrawer", "重置抽屉宽度", "Reset drawer width", "button"],
    ],
  },
];

const SETTING_DESCRIPTIONS = {
  badgesEnabled: [
    "直接在材料旁显示缺少或余量",
    "Show shortages beside materials",
  ],
  upgradeChainEnabled: [
    "展开查看升级链各阶段材料",
    "Show materials through upgrade chains",
  ],
  createPlansByDefault: [
    "加购缺料时同时锁定制作材料",
    "Create and lock a plan when adding materials",
  ],
  inventorySyncEnabled: [
    "按服务器库存变化自动扣减清单",
    "Update the list from live inventory changes",
  ],
  autoRestockEnabled: [
    "收藏物品低于常备数量时自动补单",
    "Restock favorites below their minimum",
  ],
  locateEnabled: [
    "从清单打开市场并定位对应物品",
    "Open and locate items in the marketplace",
  ],
  autoPrefillEnabled: [
    "只填写待买数量，不会自动下单",
    "Fill quantity without placing an order",
  ],
  purchaseNavEnabled: [
    "买完后快速切换到下一项",
    "Move through remaining shopping items",
  ],
  pricesEnabled: [
    "显示当前单价和物品小计",
    "Show current prices and subtotals",
  ],
  cartTotalEnabled: [
    "在底部显示全部补齐所需金额",
    "Show the total cost to fill the cart",
  ],
  autoCollapseEnabled: [
    "所有项目补齐后收起购物车",
    "Collapse after every item is fulfilled",
  ],
  autoExpandOnAddEnabled: [
    "任意入口成功加购后展开并显示清单",
    "Open the cart list after any successful add",
  ],
  safetyLevel: [
    "为工匠茶的随机省料准备余量",
    "Allow for Artisan's Tea material variance",
  ],
  safetyThreshold: [
    "次数较少时不额外准备材料",
    "Skip the margin for smaller batches",
  ],
  guzzlingPouchLevel: [
    "填写 -1 时自动读取当前等级",
    "Use -1 to detect the current level",
  ],
  nextItemShortcut: [
    "右键可清除已经录制的快捷键",
    "Right-click to clear the shortcut",
  ],
  resetHandle: ["恢复购物车图标的默认高度", "Restore the cart handle position"],
  resetDrawer: ["恢复悬浮购物车的默认宽度", "Restore the floating cart width"],
};

function renderProcurementSettings(body) {
  body.replaceChildren();
  const settings = procurement.getSettings();
  for (const sectionDefinition of SETTING_SECTIONS) {
    const section = document.createElement("section");
    section.className = "setting-section";
    const heading = document.createElement("div");
    heading.className = "setting-section-title";
    heading.textContent = t(...sectionDefinition.title);
    section.append(heading);
    for (const [id, zh, en, type] of sectionDefinition.rows) {
      const row = document.createElement("div");
      row.className = "setting-row";
      const label = document.createElement("span");
      label.className = "setting-label";
      const description = SETTING_DESCRIPTIONS[id];
      label.innerHTML = `${escapeHtml(t(zh, en))}${description ? `<small>${escapeHtml(t(...description))}</small>` : ""}`;
      row.append(label);
      let control;
      if (type === "bool") {
        const state = document.createElement("span");
        state.className = "switch-state";
        state.dataset.on = String(Boolean(settings[id]));
        state.textContent = settings[id] ? t("开", "On") : t("关", "Off");
        row.append(state);
        control = document.createElement("button");
        control.type = "button";
        control.className = "switch";
        control.dataset.on = String(Boolean(settings[id]));
        control.setAttribute("role", "switch");
        control.setAttribute("aria-checked", String(Boolean(settings[id])));
        control.setAttribute("aria-label", t(zh, en));
        control.addEventListener("click", () =>
          procurement.setSetting(id, !settings[id]),
        );
      } else if (type === "safety") {
        control = document.createElement("select");
        for (const [value, text] of [
          ["off", t("关闭", "Off")],
          ["95", t("标准 95%", "Standard 95%")],
          ["99", t("充足 99%", "Ample 99%")],
          ["99.9", t("极高 99.9%", "Full 99.9%")],
        ]) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = text;
          option.selected = String(settings[id]) === value;
          control.append(option);
        }
        control.addEventListener("change", () =>
          procurement.setSetting(id, control.value),
        );
      } else if (type === "shortcut") {
        control = document.createElement("button");
        control.type = "button";
        control.className = "setting-button shortcut";
        control.textContent =
          formatShortcut(settings.nextItemShortcut) || t("录制", "Record");
        control.addEventListener("click", () => captureShortcut(control));
        control.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          procurement.setSetting("nextItemShortcut", null);
        });
      } else if (type === "button") {
        control = document.createElement("button");
        control.type = "button";
        control.className = "setting-button";
        control.textContent = t("重置", "Reset");
        control.addEventListener("click", () => {
          procurement.setSetting(
            id === "resetHandle" ? "handleY" : "drawerWidth",
            id === "resetHandle" ? 180 : 360,
          );
        });
      } else {
        control = document.createElement("input");
        control.type = "number";
        control.min = id === "guzzlingPouchLevel" ? "-1" : "0";
        if (type === "pouch") control.max = "20";
        control.value = String(settings[id]);
        control.addEventListener("change", () =>
          procurement.setSetting(id, Number(control.value)),
        );
      }
      row.append(control);
      section.append(row);
    }
    body.append(section);
  }
}

function formatShortcut(shortcut) {
  if (!shortcut?.code) return "";
  return [
    shortcut.ctrl && "Ctrl",
    shortcut.shift && "Shift",
    shortcut.alt && "Alt",
    shortcut.meta && "Meta",
    shortcut.display || shortcut.code,
  ]
    .filter(Boolean)
    .join("+");
}

function captureShortcut(button) {
  button.textContent = t("请按快捷键…", "Press shortcut…");
  const handler = (event) => {
    if (event.key === "Escape") {
      window.removeEventListener("keydown", handler, true);
      renderShell();
      return;
    }
    if (/^(Control|Shift|Alt|Meta|OS)/.test(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    const display =
      event.code === "Space"
        ? "Space"
        : event.code.startsWith("Arrow")
          ? event.code.slice(5)
          : event.key?.length === 1
            ? event.key.toUpperCase()
            : event.key || event.code;
    procurement.setSetting("nextItemShortcut", {
      code: event.code,
      display,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
    });
    window.removeEventListener("keydown", handler, true);
  };
  window.addEventListener("keydown", handler, true);
}

function clampHandleY(value) {
  return Math.min(
    Math.max(8, Number(value) || 180),
    Math.max(8, window.innerHeight - 84),
  );
}

function createShell(scope) {
  shell = document.createElement("div");
  shell.id = HOST_ID;
  shadow = shell.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = shellStyles();
  shadow.innerHTML = `
    <button class="handle" aria-label="${t("购物车（可拖动）", "Shopping cart (drag to move)")}" aria-expanded="false">${CART_ICON}<span class="handle-badge"></span></button>
    <aside class="drawer" data-open="false" aria-label="${t("购物车", "Shopping cart")}">
      <div class="resize"></div>
      <header class="header"><div class="title">${t("购物车", "Shopping Cart")}</div><span class="head-count"></span><button class="close" aria-label="${t("收起", "Collapse")}">»</button></header>
      <nav class="tabs"><button class="tab" data-tab="cart">${t("清单", "Cart")}</button><button class="tab" data-tab="plans">${t("计划", "Plans")}</button><button class="tab" data-tab="settings">${t("设置", "Settings")}</button></nav>
      <main class="body"></main>
      <footer class="panel-footer"></footer>
    </aside>`;
  shadow.prepend(style);
  document.body.appendChild(shell);
  const handle = shadow.querySelector(".handle");
  const drawer = shadow.querySelector(".drawer");
  let dragStart = null;
  handle.addEventListener("pointerdown", (event) => {
    dragStart = { y: event.clientY, top: handle.getBoundingClientRect().top };
    handle.setPointerCapture?.(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (!dragStart) return;
    const next = clampHandleY(dragStart.top + event.clientY - dragStart.y);
    handle.style.top = `${next}px`;
  });
  handle.addEventListener("pointerup", (event) => {
    if (!dragStart) return;
    const moved = Math.abs(event.clientY - dragStart.y) > 5;
    dragStart = null;
    procurement.setSetting("handleY", parseFloat(handle.style.top));
    if (!moved) {
      drawerOpen = !drawerOpen;
      if (!drawerOpen) stopActiveHoldRepeat();
      renderShell();
    }
  });
  shadow.querySelector(".close").addEventListener("click", () => {
    stopActiveHoldRepeat();
    drawerOpen = false;
    renderShell();
  });
  for (const tab of shadow.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => {
      stopActiveHoldRepeat();
      activeTab = tab.dataset.tab;
      renderShell();
    });
  }
  const resize = shadow.querySelector(".resize");
  let resizing = false;
  resize.addEventListener("pointerdown", (event) => {
    resizing = true;
    resize.setPointerCapture?.(event.pointerId);
  });
  resize.addEventListener("pointermove", (event) => {
    if (!resizing) return;
    drawer.style.setProperty(
      "--drawer-width",
      `${Math.min(560, Math.max(300, window.innerWidth - event.clientX))}px`,
    );
  });
  resize.addEventListener("pointerup", () => {
    if (!resizing) return;
    resizing = false;
    procurement.setSetting(
      "drawerWidth",
      parseFloat(drawer.style.getPropertyValue("--drawer-width")),
    );
  });
  scope.event(window, "resize", renderShell);
  scope.event(document, "keydown", (event) => {
    if (event.key === "Escape" && drawerOpen) {
      stopActiveHoldRepeat();
      drawerOpen = false;
      renderShell();
    }
  });
  scope.event(document, "pointerdown", (event) => {
    if (!drawerOpen || event.composedPath().includes(shell)) return;
    stopActiveHoldRepeat();
    drawerOpen = false;
    renderShell();
  });
  scope.add(() => {
    shell?.remove();
    shell = null;
    shadow = null;
  });
  renderShell();
}

function resolveActionPanel() {
  const inputs = [
    ...document.querySelectorAll(
      'div[class*="SkillActionDetail_maxActionCountInput"] input',
    ),
  ]
    .filter((input) => !isHiddenActionElement(input))
    .sort(
      (left, right) =>
        Number(Boolean(right.closest('[class*="Modal_modalContainer"]'))) -
        Number(Boolean(left.closest('[class*="Modal_modalContainer"]'))),
    );
  for (const input of inputs) {
    const panel =
      input.closest('div[class*="SkillActionDetail_skillActionDetail"]') ??
      input.closest('div[class*="SkillActionDetail_regularComponent"]') ??
      input.parentElement;
    if (!panel || isHiddenActionElement(panel)) continue;
    const fiberContext = resolveActionFiberContext(panel);
    const actionHrid =
      fiberContext?.actionHrid ??
      runtime.api.resolveProductionAction?.(panel) ??
      (panel.closest?.(
        '[class*="EnhancingPanel"], [class*="EnhancementPanel"], [class*="EnhancePanel"]',
      )
        ? "/actions/enhancing/enhance"
        : null);
    const count = runtime.api.parseCompactNumber?.(input.value);
    if (!actionHrid || !Number.isFinite(count) || count <= 0) continue;
    return {
      panel,
      input,
      actionHrid,
      actionFunction: resolveActionFunction(
        panel,
        actionHrid,
        fiberContext?.actionFunction,
      ),
      count: Math.ceil(count),
    };
  }
  return null;
}

function isHiddenActionElement(element) {
  for (let node = element; node?.nodeType === 1; node = node.parentElement) {
    const className = String(node.className ?? "");
    if (
      node.hidden ||
      node.getAttribute?.("aria-hidden") === "true" ||
      node.style?.display === "none" ||
      node.style?.visibility === "hidden" ||
      (/MainPanel_/.test(className) && /hidden/i.test(className))
    ) {
      return true;
    }
  }
  return false;
}

function resolveActionFiberContext(panel) {
  let fiber = findReactFiber(panel);
  for (let depth = 0; fiber && depth < 10; depth += 1) {
    const actionDetail = fiber.memoizedProps?.actionDetail;
    if (actionDetail?.hrid) {
      return {
        actionHrid: actionDetail.hrid,
        actionFunction: actionDetail.function ?? "",
      };
    }
    fiber = fiber.return;
  }
  return null;
}

function resolveActionFunction(panel, actionHrid, fiberFunction = "") {
  if (fiberFunction) return fiberFunction;
  if (
    panel.closest?.(
      '[class*="EnhancingPanel"], [class*="EnhancementPanel"], [class*="EnhancePanel"]',
    ) ||
    String(actionHrid).includes("/enhancing/")
  ) {
    return "/action_functions/enhancing";
  }
  if (String(actionHrid).includes("/alchemy/")) {
    return "/action_functions/alchemy";
  }
  return "/action_functions/production";
}

function parseRequirementNumber(text) {
  const tokens = String(text ?? "").match(
    /(?:\d(?:[\d.,\s\u00a0\u202f]*\d)?|\.\d+)\s*[kmbt]?/gi,
  );
  if (!tokens?.length) return null;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const value = parseCompactNumber(tokens[index]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function itemHridFromRequirement(element) {
  const use = element?.querySelector("svg use");
  const href =
    use?.getAttribute("href") ?? use?.getAttribute("xlink:href") ?? "";
  const fragment = href.includes("#") ? href.split("#").at(-1) : href;
  return procurement.normalizeItemHrid(fragment);
}

function calculateEnhancingRequirements(context) {
  const requirementsRoot = context.panel.querySelector(
    '[class*="SkillActionDetail_itemRequirements"]',
  );
  if (!requirementsRoot) return null;
  const itemElements = [
    ...requirementsRoot.querySelectorAll(
      ':scope > [class*="Item_itemContainer"]',
    ),
  ];
  const inputElements = [
    ...requirementsRoot.querySelectorAll(
      ':scope > [class*="SkillActionDetail_inputCount"]',
    ),
  ];
  if (!itemElements.length || inputElements.length !== itemElements.length) {
    return null;
  }
  const materials = itemElements.map((element, index) => {
    const itemHrid = itemHridFromRequirement(element);
    const perAction = parseRequirementNumber(inputElements[index].textContent);
    if (!itemHrid || perAction === null || perAction <= 0) return null;
    const enhancementLevel = 0;
    const suggested = Math.ceil(perAction * context.count - 1e-9);
    const owned = procurement.getInventoryCount(itemHrid, enhancementLevel);
    const lockedDetails = procurement.getLockedDetails(
      itemHrid,
      enhancementLevel,
    );
    const effectiveOwned = Math.max(0, owned - lockedDetails.total);
    const cartQuantity =
      procurement.getCartItem(itemHrid, enhancementLevel)?.quantity ?? 0;
    return {
      itemHrid,
      enhancementLevel,
      name: procurement.resolveItemName(itemHrid),
      perAction,
      suggested,
      owned,
      locked: lockedDetails.total,
      lockedByPlans: lockedDetails.byPlan,
      effectiveOwned,
      cartQuantity,
      shortage: Math.max(0, suggested - effectiveOwned),
      addableShortage: Math.max(0, suggested - effectiveOwned - cartQuantity),
      purchasable: itemHrid !== "/items/coin",
    };
  });
  if (materials.some((material) => !material)) return null;
  return {
    status: "complete",
    actionHrid: context.actionHrid,
    count: context.count,
    materials,
  };
}

function appendSunnyEnhancingCompatibility(root) {
  root.classList.add("mwi-mm-summary-panel");
  const input = document.createElement("input");
  input.className = "mwi-mm-manual-input";
  input.type = "number";
  input.inputMode = "numeric";
  input.hidden = true;
  input.setAttribute("aria-hidden", "true");
  const add = document.createElement("button");
  add.type = "button";
  add.dataset.act = "add";
  add.hidden = true;
  add.setAttribute("aria-hidden", "true");
  add.addEventListener("click", () => {
    if (!root.isConnected || document.getElementById(PRODUCTION_ID) !== root) {
      return;
    }
    const count = parseCompactNumber(input.value);
    const context = resolveActionPanel();
    if (
      !Number.isFinite(count) ||
      count <= 0 ||
      context?.actionFunction !== "/action_functions/enhancing"
    ) {
      return;
    }
    const requirements = calculateEnhancingRequirements({
      ...context,
      count: Math.ceil(count),
    });
    const result = procurement.addRequirementsToCart(
      requirements?.materials ?? [],
      "enhancing",
    );
    showToast(
      result.added
        ? t(
            `已加入 ${result.added} 种材料`,
            `Added ${result.added} ${materialNoun(result.added)}`,
          )
        : t("没有新的缺料", "No new shortages"),
    );
  });
  root.append(input, add);
}

function findMaterialHost(panel, itemHrid) {
  const bare = procurement.normalizeItemHrid(itemHrid).split("/").at(-1);
  for (const node of panel.querySelectorAll('[class*="Item_itemContainer"]')) {
    const href =
      node.querySelector("svg use")?.getAttribute("href") ??
      node.querySelector("svg use")?.getAttribute("xlink:href") ??
      "";
    if (href.includes(bare)) return node;
  }
  return null;
}

function clearProductionUi() {
  document.getElementById(PRODUCTION_ID)?.remove();
  document
    .querySelectorAll(".mwi-procurement-badge")
    .forEach((node) => node.remove());
  document
    .querySelectorAll(".mwi-procurement-requirement-row")
    .forEach((node) =>
      node.classList.remove("mwi-procurement-requirement-row"),
    );
  document
    .querySelectorAll(".mwi-procurement-panel")
    .forEach((node) => node.classList.remove("mwi-procurement-panel"));
  lastProductionSignature = "";
}

function renderProductionProcurement() {
  const context = resolveActionPanel();
  if (!context) {
    const houseModal = findActiveHouseModal();
    if (!houseModal) {
      clearProductionUi();
      return;
    }
    renderHouseProcurement(houseModal);
    return;
  }
  const settings = procurement.getSettings();
  const isEnhancing = context.actionFunction === "/action_functions/enhancing";
  const direct = isEnhancing
    ? calculateEnhancingRequirements(context)
    : procurement.calculateRequirements(context.actionHrid, context.count);
  if (!direct?.materials?.length) {
    clearProductionUi();
    return;
  }
  const chain =
    !isEnhancing &&
    settings.upgradeChainEnabled &&
    direct.detail?.upgradeItemHrid
      ? procurement.calculateUpgradeChain(context.actionHrid, context.count)
      : null;
  const materials = chain?.leaves?.length ? chain.leaves : direct.materials;
  const signature = JSON.stringify([
    isEnhancing ? "enhancing" : "production",
    runtime.config.isZH,
    context.actionHrid,
    context.count,
    settings.badgesEnabled,
    settings.upgradeChainEnabled,
    materials.map((material) => [
      material.itemHrid,
      material.suggested,
      material.owned,
      material.locked,
      material.cartQuantity,
    ]),
  ]);
  if (
    signature === lastProductionSignature &&
    document.getElementById(PRODUCTION_ID)
  ) {
    return;
  }
  clearProductionUi();
  lastProductionSignature = signature;
  if (settings.badgesEnabled) {
    context.panel.classList.add("mwi-procurement-panel");
    for (const material of direct.materials) {
      const host = findMaterialHost(context.panel, material.itemHrid);
      if (!host) continue;
      host.parentElement?.classList.add("mwi-procurement-requirement-row");
      const badge = document.createElement("span");
      badge.className = "mwi-procurement-badge";
      badge.dataset.state = material.shortage ? "missing" : "ready";
      badge.textContent = material.shortage
        ? `${t("缺", "Need")} ${formatNumber(material.shortage)}`
        : `${t("余", "Spare")} ${formatNumber(material.effectiveOwned - material.suggested)}`;
      const locks = material.lockedByPlans
        .map((entry) => `${entry.name}: ${exactNumber(entry.quantity)}`)
        .join("\n");
      badge.title = `${t("建议准备", "Suggested")}: ${exactNumber(material.suggested)}\n${t("当前拥有", "Owned")}: ${exactNumber(material.owned)}${material.locked ? `\n${t("计划锁定", "Locked")}: ${exactNumber(material.locked)}\n${locks}` : ""}`;
      host.insertAdjacentElement("afterend", badge);
    }
  }
  const root = document.createElement("section");
  root.id = PRODUCTION_ID;
  root.dataset.mwitoolsProductionExtension = "true";
  const hasSelectableChain = (chain?.stages?.length ?? 0) > 1;
  const previousStepMaterials = hasSelectableChain
    ? procurement.selectUpgradeChainMaterials(chain, [
        chain.stages[0].actionHrid,
      ])
    : materials;
  let stageInputs = [];
  const summary = document.createElement("div");
  summary.className = "mwi-procurement-summary-line";
  const summaryState = document.createElement("span");
  summaryState.className = "mwi-procurement-summary-state";
  let chainModeInput = null;
  if (hasSelectableChain) {
    const chainMode = document.createElement("label");
    chainMode.className = "mwi-procurement-chain-mode";
    chainModeInput = document.createElement("input");
    chainModeInput.type = "checkbox";
    chainModeInput.setAttribute("role", "switch");
    chainModeInput.setAttribute("aria-label", t("所选链条", "Selected chain"));
    const chainModeLabel = document.createElement("span");
    chainModeLabel.textContent = t("所选链条", "Selected chain");
    chainMode.append(chainModeInput, chainModeLabel);
    summary.append(summaryState, chainMode);
  } else {
    summary.append(summaryState);
  }
  const add = document.createElement("button");
  add.className = "mwi-procurement-inline-button";
  add.type = "button";
  const selectedMaterials = () => {
    if (!hasSelectableChain || !chainModeInput?.checked) {
      return previousStepMaterials;
    }
    return procurement.selectUpgradeChainMaterials(
      chain,
      stageInputs
        .filter((input) => input.checked)
        .map((input) => input.dataset.action),
    );
  };
  const updateSummary = () => {
    const scopedMaterials = selectedMaterials();
    const missing = scopedMaterials.filter(
      (material) => material.purchasable && material.shortage > 0,
    );
    const addable = scopedMaterials.filter(
      (material) => material.purchasable && material.addableShortage > 0,
    );
    summaryState.innerHTML = missing.length
      ? `${t("缺少", "Missing")} <strong>${missing.length}</strong> ${materialNoun(missing.length)} · ${t("建议准备已包含安全余量", "Suggested amounts include a safety margin")}`
      : t("材料充足", "Materials ready");
    add.disabled = addable.length === 0;
    add.textContent = addable.length
      ? t("加入购物清单", "Add to shopping list")
      : t("已在清单中", "Already listed");
  };
  chainModeInput?.addEventListener("change", updateSummary);
  add.addEventListener("click", () => {
    const scopedMaterials = selectedMaterials();
    const result = procurement.addRequirementsToCart(
      scopedMaterials,
      isEnhancing ? "enhancing" : "production",
    );
    if (!isEnhancing && settings.createPlansByDefault && result.added > 0) {
      procurement.createPlan(
        context.actionHrid,
        context.count,
        scopedMaterials,
      );
    }
    showToast(
      result.added
        ? t(
            `已加入 ${result.added} 种材料`,
            `Added ${result.added} ${materialNoun(result.added)}`,
          )
        : t("没有新的缺料", "No new shortages"),
    );
  });
  summary.append(add);
  root.append(summary);
  if (isEnhancing) appendSunnyEnhancingCompatibility(root);
  if (hasSelectableChain) {
    const details = document.createElement("details");
    details.className = "mwi-procurement-chain";
    const heading = document.createElement("summary");
    heading.textContent = `${t("升级链", "Upgrade chain")} · ${chain.stages.length} ${t("阶段", "stages")}${chain.cycle ? ` · ${t("检测到循环", "cycle detected")}` : ""}${chain.truncated ? ` · ${t("已达到 25 层", "25-level limit")}` : ""}`;
    const list = document.createElement("div");
    list.className = "mwi-procurement-chain-list";
    for (const stage of chain.stages) {
      const row = document.createElement("label");
      row.className = "mwi-procurement-chain-stage";
      row.innerHTML = `<input type="checkbox" checked data-action="${escapeHtml(stage.actionHrid)}"><span>${escapeHtml(stage.name)}</span><span>×${formatNumber(stage.count)}</span>`;
      list.append(row);
    }
    const presets = document.createElement("div");
    presets.className = "mwi-procurement-chain-presets";
    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = "mwi-procurement-chain-preset";
    allButton.textContent = t("全链条", "Full chain");
    stageInputs = [...list.querySelectorAll("input[type=checkbox]")];
    const updatePresetState = () => {
      const checked = stageInputs.map((input) => input.checked);
      allButton.setAttribute("aria-pressed", String(checked.every(Boolean)));
      updateSummary();
    };
    allButton.addEventListener("click", () => {
      stageInputs.forEach((input) => {
        input.checked = true;
      });
      updatePresetState();
    });
    stageInputs.forEach((input) =>
      input.addEventListener("change", updatePresetState),
    );
    presets.append(allButton);
    updatePresetState();
    details.append(heading, presets, list);
    root.append(details);
  }
  updateSummary();
  const enhancingInfo = isEnhancing
    ? context.panel.querySelector('[class*="SkillActionDetail_info"]')
    : null;
  const existingSummary = context.panel.querySelector(
    "#mwi-production-summary",
  );
  if (enhancingInfo) enhancingInfo.append(root);
  else if (!isEnhancing && existingSummary) existingSummary.append(root);
  else {
    const anchor =
      context.panel.querySelector(
        '[class*="SkillActionDetail_actionContainer"]',
      ) ?? context.input.parentElement;
    anchor.insertAdjacentElement("afterend", root);
  }
}

function findReactFiber(element) {
  if (!element) return null;
  const key = Object.getOwnPropertyNames(element).find(
    (candidate) =>
      candidate.startsWith("__reactFiber") ||
      candidate.startsWith("__reactInternalInstance"),
  );
  return key ? element[key] : null;
}

function findObjectWithItemRequirements(value, depth = 0, seen = new Set()) {
  if (!value || typeof value !== "object" || depth > 5 || seen.has(value)) {
    return null;
  }
  seen.add(value);
  for (const candidate of Object.values(value)) {
    if (
      Array.isArray(candidate) &&
      candidate.some((entry) => entry?.itemHrid && Number(entry?.count) > 0)
    ) {
      return candidate;
    }
  }
  for (const candidate of Object.values(value)) {
    const found = findObjectWithItemRequirements(candidate, depth + 1, seen);
    if (found) return found;
  }
  return null;
}

function findActiveHouseModal() {
  return [
    ...document.querySelectorAll('[class*="HousePanel_modalContent"]'),
  ].find(
    (candidate) =>
      candidate.getClientRects().length &&
      candidate.querySelector('[class*="HousePanel_itemRequirements"]'),
  );
}

function parseHouseCount(value) {
  const normalized = String(value ?? "").trim();
  const compact = parseRequirementNumber(normalized);
  if (Number.isFinite(compact) && compact >= 0) return compact;
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  const number = Number(match?.[0]);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function houseItemHrid(element) {
  const use = element?.querySelector("svg use");
  const href =
    use?.getAttribute("href") ?? use?.getAttribute("xlink:href") ?? "";
  const fragment = href.includes("#") ? href.split("#").at(-1) : href;
  return procurement.normalizeItemHrid(fragment);
}

function extractHouseRequirementsFromDom(modal) {
  const requirementsRoot = modal.querySelector(
    '[class*="HousePanel_itemRequirements"]',
  );
  if (!requirementsRoot) return null;
  let itemElements = [
    ...requirementsRoot.querySelectorAll(
      ':scope > [class*="Item_itemContainer"]',
    ),
  ];
  if (!itemElements.length) {
    itemElements = [
      ...requirementsRoot.querySelectorAll(
        '[class*="HousePanel_itemRequirementCell"] [class*="Item_itemContainer"]',
      ),
    ];
  }
  const inputElements = [
    ...requirementsRoot.querySelectorAll(
      ':scope > [class*="HousePanel_inputCount"]',
    ),
  ];
  if (!itemElements.length || inputElements.length < itemElements.length) {
    return null;
  }
  const requirements = itemElements.map((element, index) => ({
    itemHrid: houseItemHrid(element),
    enhancementLevel: 0,
    count: parseHouseCount(inputElements[index]?.textContent),
  }));
  return requirements.every(
    (requirement) => requirement.itemHrid && requirement.count > 0,
  )
    ? requirements
    : null;
}

function extractHouseRequirementsFromFiber(modal) {
  let fiber = findReactFiber(modal);
  let requirements = null;
  for (let depth = 0; fiber && depth < 12 && !requirements; depth += 1) {
    requirements = findObjectWithItemRequirements({
      props: fiber.memoizedProps,
      state: fiber.memoizedState,
    });
    fiber = fiber.return;
  }
  return requirements?.length &&
    requirements.every(
      (requirement) =>
        procurement.normalizeItemHrid(requirement?.itemHrid) &&
        Number(requirement?.count) > 0,
    )
    ? requirements
    : null;
}

function renderHouseProcurement(modal = findActiveHouseModal()) {
  if (!modal) return;
  const requirements =
    extractHouseRequirementsFromDom(modal) ??
    extractHouseRequirementsFromFiber(modal);
  if (!requirements?.length) {
    modal.querySelector(`#${PRODUCTION_ID}`)?.remove();
    lastProductionSignature = "";
    return;
  }
  const materials = requirements.map((input) => {
    const owned = procurement.getEffectiveInventory(
      input.itemHrid,
      input.enhancementLevel,
    );
    const suggested = Math.ceil(Number(input.count) || 0);
    const cartQuantity =
      procurement.getCartItem(input.itemHrid, input.enhancementLevel)
        ?.quantity ?? 0;
    return {
      itemHrid: procurement.normalizeItemHrid(input.itemHrid),
      enhancementLevel: Number(input.enhancementLevel) || 0,
      name: procurement.resolveItemName(input.itemHrid),
      suggested,
      owned,
      shortage: Math.max(0, suggested - owned),
      addableShortage: Math.max(0, suggested - owned - cartQuantity),
      purchasable:
        procurement.normalizeItemHrid(input.itemHrid) !== "/items/coin",
    };
  });
  const signature = JSON.stringify([
    "housing",
    runtime.config.isZH,
    materials.map((material) => [
      material.itemHrid,
      material.suggested,
      material.owned,
      material.shortage,
      material.addableShortage,
    ]),
  ]);
  if (
    signature === lastProductionSignature &&
    modal.querySelector(`#${PRODUCTION_ID}`)
  ) {
    return;
  }
  document.getElementById(PRODUCTION_ID)?.remove();
  lastProductionSignature = signature;
  const root = document.createElement("section");
  root.id = PRODUCTION_ID;
  root.className = "mwi-procurement-summary-line";
  const missing = materials.filter(
    (material) => material.purchasable && material.shortage > 0,
  );
  root.innerHTML = `<span class="mwi-procurement-summary-state">${missing.length ? (runtime.config.isZH ? `房屋升级缺少 <strong>${missing.length}</strong> 种材料` : `Missing <strong>${missing.length}</strong> ${materialNoun(missing.length)} for the house upgrade`) : t("房屋升级材料充足", "House materials ready")}</span>`;
  const add = document.createElement("button");
  add.className = "mwi-procurement-inline-button";
  add.type = "button";
  const addable = materials.filter(
    (material) => material.purchasable && material.addableShortage > 0,
  );
  add.textContent = addable.length
    ? t("加入购物清单", "Add to shopping list")
    : t("已在清单中", "Already listed");
  add.disabled = addable.length === 0;
  add.addEventListener("click", () => {
    const result = procurement.addRequirementsToCart(materials, "housing");
    showToast(
      result.added
        ? t(
            `已加入 ${result.added} 种材料`,
            `Added ${result.added} ${materialNoun(result.added)}`,
          )
        : t("没有新的缺料", "No new shortages"),
    );
    lastProductionSignature = "";
    globalThis.queueMicrotask(() => renderHouseProcurement(modal));
  });
  root.append(add);
  const anchor =
    modal.querySelector('[class*="HousePanel_upgradeButton"]') ??
    modal.lastElementChild;
  anchor?.insertAdjacentElement("beforebegin", root);
}

function resolveMarketplaceHandler() {
  const root = document.getElementById("root");
  const fibers = [];
  const pushFiber = (value) => {
    const fiber = value?.current ?? value;
    if (fiber && typeof fiber === "object" && !fibers.includes(fiber)) {
      fibers.push(fiber);
    }
  };
  pushFiber(root?._reactRootContainer?.current);
  pushFiber(root?._reactRootContainer?._internalRoot?.current);
  for (const element of [root, document.body]) {
    for (const key of Object.getOwnPropertyNames(element ?? {})) {
      if (
        key.startsWith("__reactContainer") ||
        key.startsWith("__reactFiber") ||
        key.startsWith("__reactInternalInstance")
      ) {
        pushFiber(element[key]);
      }
    }
  }
  const seen = new Set();
  let fallback = null;
  while (fibers.length && seen.size < 50_000) {
    const fiber = fibers.pop();
    if (!fiber || seen.has(fiber)) continue;
    seen.add(fiber);
    const host = fiber.stateNode;
    if (
      typeof host?.handleGoToMarketplace === "function" &&
      typeof host?.handleCloseMarketplaceModal === "function" &&
      typeof host?.setState === "function"
    ) {
      return { host, fn: host.handleGoToMarketplace, floating: true };
    }
    const fn =
      host?.handleGoToMarketplace ??
      host?.goToMarketplace ??
      host?.openMarketplace;
    if (!fallback && typeof fn === "function") fallback = { host, fn };
    if (fiber.child) fibers.push(fiber.child);
    if (fiber.sibling) fibers.push(fiber.sibling);
  }
  return fallback;
}

function openMarketplace(itemHrid, enhancementLevel = 0) {
  if (marketFeaturesSuppressed()) return false;
  const resolved = resolveMarketplaceHandler();
  if (!resolved) {
    showToast(
      t(
        "暂时无法打开市场，请先手动打开市场",
        "Could not open the market; open it manually first",
      ),
    );
    return false;
  }
  currentMarketTarget = procurement.normalizeItemHrid(itemHrid);
  const bareItemId = currentMarketTarget.replace(/^\/items\//, "");
  const level = Number(enhancementLevel) || 0;
  const argumentSets = [
    [currentMarketTarget, level],
    [currentMarketTarget],
    [bareItemId, level],
    [bareItemId],
  ];
  let lastError = null;
  if (resolved.floating) {
    try {
      const restoreNavTarget =
        resolved.host.state?.navTarget === "marketplace" ? "marketplace" : "";
      const showFloatingModal = () => {
        resolved.host.setState({
          showMarketplaceModal: true,
          marketViewOverrideData: {
            itemHrid: currentMarketTarget,
            enhancementLevel: level,
          },
        });
      };
      if (restoreNavTarget) {
        resolved.host.setState(
          { navTarget: "milking", showMarketplaceModal: false },
          showFloatingModal,
        );
        setTimeout(() => {
          if (
            marketSessionActive &&
            currentMarketTarget === procurement.normalizeItemHrid(itemHrid) &&
            resolved.host.state?.navTarget !== "marketplace"
          ) {
            resolved.fn.call(resolved.host, currentMarketTarget, level);
          }
        }, 240);
      } else {
        showFloatingModal();
      }
      marketSessionActive = true;
      marketSessionRequiresModal = true;
      marketSessionStartedAt = Date.now();
      marketSessionModalSeen = false;
      marketSessionHost = resolved.host;
      marketSessionRestoreNavTarget = restoreNavTarget;
      marketSessionDone = new Map();
      if (window.matchMedia?.("(max-width:760px)").matches) {
        drawerOpen = false;
        renderShell();
      }
      for (const delay of [80, 240, 600, 1_200]) {
        setTimeout(() => updateMarketUi(true), delay);
      }
      return true;
    } catch (error) {
      lastError = error;
    }
  }
  for (const args of argumentSets) {
    try {
      resolved.fn.call(resolved.host, ...args);
      marketSessionActive = true;
      marketSessionRequiresModal = false;
      marketSessionStartedAt = Date.now();
      marketSessionModalSeen = false;
      marketSessionHost = null;
      marketSessionRestoreNavTarget = "";
      marketSessionDone = new Map();
      if (window.matchMedia?.("(max-width:760px)").matches) {
        drawerOpen = false;
        renderShell();
      }
      for (const delay of [80, 240, 600, 1_200]) {
        setTimeout(() => updateMarketUi(true), delay);
      }
      return true;
    } catch (error) {
      lastError = error;
    }
  }
  console.warn(
    runtime.config.isZH
      ? "[MWITools] 无法在市场中打开购物清单物品。"
      : "[MWITools] Failed to open the shopping-list item in the marketplace.",
    lastError,
  );
  showToast(t("市场跳转失败", "Marketplace navigation failed"));
  return false;
}

runtime.api.openProcurementMarketplace = openMarketplace;

function findMarketPanel() {
  const visible = [
    ...document.querySelectorAll(
      '[class*="MarketplacePanel_marketplacePanel"]',
    ),
  ].filter((candidate) => candidate.getClientRects().length);
  return (
    visible.find((candidate) =>
      candidate.closest('[class*="MainPanel_marketplaceModal__"]'),
    ) ?? visible.at(0)
  );
}

function detectMarketItem(panel) {
  const current = panel?.querySelector(
    '[class*="MarketplacePanel_currentItem"] svg use, [class*="MarketplacePanel_itemContainer"] svg use',
  );
  const href =
    current?.getAttribute("href") ?? current?.getAttribute("xlink:href") ?? "";
  const fragment = href.split("#").at(-1);
  return fragment ? procurement.normalizeItemHrid(fragment) : "";
}

function clearMarketUi({ preserveSession = false } = {}) {
  document.getElementById(MARKET_NAV_ID)?.remove();
  document
    .querySelectorAll(".mwi-procurement-market-target")
    .forEach((node) => node.classList.remove("mwi-procurement-market-target"));
  if (!preserveSession) {
    const restoreHost = marketSessionHost;
    const restoreNavTarget = marketSessionRestoreNavTarget;
    marketSessionActive = false;
    marketSessionRequiresModal = false;
    marketSessionStartedAt = 0;
    marketSessionModalSeen = false;
    marketSessionHost = null;
    marketSessionRestoreNavTarget = "";
    currentMarketTarget = "";
    armedNextItem = "";
    marketSessionDone = new Map();
    if (
      restoreNavTarget &&
      typeof restoreHost?.setState === "function" &&
      restoreHost.state?.navTarget !== restoreNavTarget
    ) {
      restoreHost.setState({ navTarget: restoreNavTarget });
    }
  }
}

function highlightMarketItems(panel, scroll = false) {
  document
    .querySelectorAll(".mwi-procurement-market-target")
    .forEach((node) => node.classList.remove("mwi-procurement-market-target"));
  if (marketFeaturesSuppressed() || !procurement.getSettings().locateEnabled) {
    return;
  }
  const pending = new Set(
    pendingItems().map((item) => item.itemHrid.split("/").at(-1)),
  );
  let scrollTarget = null;
  for (const use of panel.querySelectorAll("svg use")) {
    const href =
      use.getAttribute("href") ?? use.getAttribute("xlink:href") ?? "";
    const matched = [...pending].find((bare) => href.includes(bare));
    if (!matched) continue;
    const host =
      use.closest('[class*="Item_itemContainer"]') ?? use.parentElement;
    host.classList.add("mwi-procurement-market-target");
    if (
      currentMarketTarget &&
      currentMarketTarget.endsWith(matched) &&
      !scrollTarget
    ) {
      scrollTarget = host;
    }
  }
  if (scroll && scrollTarget) {
    scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function prefillPurchaseModal() {
  if (
    marketFeaturesSuppressed() ||
    !procurement.getSettings().autoPrefillEnabled
  ) {
    return;
  }
  for (const modal of document.querySelectorAll(
    '[class*="MarketplacePanel_modalContent"]',
  )) {
    if (modal.dataset.mwitoolsProcurementPrefilled) continue;
    const header =
      modal.querySelector('[class*="MarketplacePanel_header"]')?.textContent ??
      "";
    if (!/立即购买|购买挂牌|购买订单|buy|purchase/i.test(header)) continue;
    const use = modal.querySelector("svg use");
    const href =
      use?.getAttribute("href") ?? use?.getAttribute("xlink:href") ?? "";
    const itemHrid = procurement.normalizeItemHrid(href.split("#").at(-1));
    const item = procurement
      .getCartItems()
      .find((candidate) => candidate.itemHrid === itemHrid);
    const input = modal.querySelector(
      '[class*="MarketplacePanel_quantityInputs"] input',
    );
    if (!item?.quantity || !input) continue;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, String(item.quantity));
    if (!setter) input.value = String(item.quantity);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    modal.dataset.mwitoolsProcurementPrefilled = "true";
  }
}

function renderMarketNav(panel) {
  if (
    marketFeaturesSuppressed() ||
    !marketSessionActive ||
    !procurement.getSettings().purchaseNavEnabled
  ) {
    document.getElementById(MARKET_NAV_ID)?.remove();
    return;
  }
  const items = pendingItems();
  if (!items.length) {
    document.getElementById(MARKET_NAV_ID)?.remove();
    return;
  }
  const current = detectMarketItem(panel);
  const rows = [
    ...items.map((item) => ({ ...item, done: false })),
    ...[...marketSessionDone.values()].filter(
      (done) => !items.some((item) => item.itemHrid === done.itemHrid),
    ),
  ];
  let nav = document.getElementById(MARKET_NAV_ID);
  if (!nav) {
    nav = document.createElement("div");
    nav.id = MARKET_NAV_ID;
    document.body.appendChild(nav);
  }
  nav.replaceChildren();
  const progress = document.createElement("span");
  progress.className = "mwi-procurement-nav-progress";
  progress.textContent = t(`待购 ${items.length}`, `${items.length} pending`);
  const list = document.createElement("div");
  list.className = "mwi-procurement-nav-items";
  for (const item of rows) {
    const chip = document.createElement("button");
    chip.className = "mwi-procurement-nav-chip";
    chip.dataset.current = String(!item.done && item.itemHrid === current);
    chip.dataset.done = String(Boolean(item.done));
    const itemName = procurement.resolveItemName(item.itemHrid) || item.name;
    const quantity = item.done
      ? t("已完成", "Completed")
      : exactNumber(item.quantity);
    chip.title = `${itemName} · ${quantity}`;
    chip.setAttribute("aria-label", chip.title);
    chip.innerHTML = `<span class="mwi-procurement-nav-icon">${renderItemIcon({ ...item, name: itemName })}</span><b>${item.done ? "✓" : formatNumber(item.quantity)}</b>`;
    if (!item.done) {
      chip.addEventListener("click", () =>
        openMarketplace(item.itemHrid, item.enhancementLevel),
      );
    }
    list.append(chip);
  }
  const next =
    items.find((item) => item.itemHrid !== current) ?? items.at(0) ?? null;
  const nextButton = document.createElement("button");
  nextButton.className = "mwi-procurement-nav-next";
  nextButton.textContent = t("下一项 ›", "Next ›");
  nextButton.disabled = !next;
  nextButton.addEventListener("click", () => {
    if (next) openMarketplace(next.itemHrid, next.enhancementLevel);
    armedNextItem = "";
  });
  nav.append(progress, list, nextButton);
  const modal =
    panel.closest('[class*="MainPanel_marketplaceModal__"]') ??
    panel.closest('[class*="Modal_modalContainer"]') ??
    panel;
  const rect = modal.getBoundingClientRect();
  const height = nav.offsetHeight || 40;
  const below = window.innerHeight - rect.bottom;
  nav.style.left = `${rect.left}px`;
  nav.style.width = `${rect.width}px`;
  nav.style.top = `${below >= height ? rect.bottom : Math.max(0, rect.bottom - height)}px`;
  nav.dataset.inside = String(below < height);
}

function updateMarketUi(scroll = false) {
  const panel = findMarketPanel();
  if (!panel) {
    const waitingForModal =
      marketSessionActive &&
      !marketSessionModalSeen &&
      Date.now() - marketSessionStartedAt < MARKET_SESSION_OPEN_GRACE_MS;
    clearMarketUi({ preserveSession: waitingForModal });
    return;
  }
  if (
    marketSessionActive &&
    marketSessionRequiresModal &&
    !panel.closest('[class*="MainPanel_marketplaceModal__"]')
  ) {
    const waitingForModal =
      !marketSessionModalSeen &&
      Date.now() - marketSessionStartedAt < MARKET_SESSION_OPEN_GRACE_MS;
    clearMarketUi({ preserveSession: waitingForModal });
    if (waitingForModal) return;
  }
  if (panel.closest('[class*="MainPanel_marketplaceModal__"]')) {
    marketSessionModalSeen = true;
  }
  highlightMarketItems(panel, scroll);
  prefillPurchaseModal();
  renderMarketNav(panel);
}

function shortcutMatches(event, shortcut) {
  return (
    event.code === shortcut?.code &&
    event.ctrlKey === Boolean(shortcut.ctrl) &&
    event.shiftKey === Boolean(shortcut.shift) &&
    event.altKey === Boolean(shortcut.alt) &&
    event.metaKey === Boolean(shortcut.meta)
  );
}

function handleShortcut(event) {
  if (marketFeaturesSuppressed()) return;
  const shortcut = procurement.getSettings().nextItemShortcut;
  if (!armedNextItem || !shortcut || !shortcutMatches(event, shortcut)) return;
  const active = document.activeElement;
  if (active?.matches?.("input,textarea,select") || active?.isContentEditable) {
    return;
  }
  const item = procurement
    .getCartItems()
    .find(
      (candidate) =>
        candidate.itemHrid === armedNextItem && candidate.quantity > 0,
    );
  const fallback = item ?? pendingItems().at(0);
  armedNextItem = "";
  if (!fallback) return;
  event.preventDefault();
  event.stopPropagation();
  openMarketplace(fallback.itemHrid, fallback.enhancementLevel);
}

function subscribeProcurement(scope) {
  const rerender = ({ reason, added } = {}) => {
    if (
      reason === "add" &&
      Number(added) > 0 &&
      procurement.getSettings().autoExpandOnAddEnabled
    ) {
      drawerOpen = true;
      activeTab = "cart";
    }
    renderShell();
    lastProductionSignature = "";
    renderProductionProcurement();
    updateMarketUi();
  };
  scope.add(procurement.on("cart:change", rerender));
  scope.add(procurement.on("plan:change", rerender));
  scope.add(
    procurement.on("settings:change", ({ id, value }) => {
      if (id === "badgesEnabled" && !value) clearProductionUi();
      if (id === "locateEnabled" && !value) {
        document
          .querySelectorAll(".mwi-procurement-market-target")
          .forEach((node) =>
            node.classList.remove("mwi-procurement-market-target"),
          );
      }
      if (id === "purchaseNavEnabled" && !value) {
        document.getElementById(MARKET_NAV_ID)?.remove();
      }
      renderShell();
      lastProductionSignature = "";
    }),
  );
  scope.add(
    procurement.on("item:fulfilled", ({ item }) => {
      marketSessionDone.set(
        procurement.itemKey(item.itemHrid, item.enhancementLevel),
        {
          ...item,
          done: true,
        },
      );
      const next = pendingItems().at(0);
      armedNextItem = next?.itemHrid ?? "";
      showToast(
        next
          ? t(
              `${procurement.resolveItemName(item.itemHrid)} 已补齐，下一项：${next.name}`,
              `${procurement.resolveItemName(item.itemHrid)} fulfilled. Next: ${next.name}`,
            )
          : t("购物清单已全部补齐", "Shopping list fulfilled"),
      );
      updateMarketUi();
    }),
  );
  scope.add(
    procurement.on("all:fulfilled", () => {
      clearMarketUi();
      if (procurement.getSettings().autoCollapseEnabled) {
        drawerOpen = false;
        renderShell();
      }
    }),
  );
}

runtime.features.register({
  id: "procurementAssistant",
  setting: "procurementAssistant",
  scope: "character",
  initialize({ scope, characterId }) {
    runtime.api.openProcurementMarketplace = openMarketplace;
    addStyles();
    if (procurement.activeCharacterId !== characterId) {
      procurement.loadCharacterData(characterId);
    }
    createShell(scope);
    subscribeProcurement(scope);
    scope.add(
      runtime.settings.onChange?.("adaptIronCowMarketFeatures", () => {
        clearMarketUi();
        renderShell();
      }),
    );
    renderProductionProcurement();
    updateMarketUi();
    scope.interval(renderProductionProcurement, 350);
    scope.interval(updateMarketUi, 900);
    scope.event(document, "keydown", handleShortcut, true);
    scope.add(() => {
      stopActiveHoldRepeat();
      clearProductionUi();
      clearMarketUi();
      document.getElementById(STYLE_ID)?.remove();
      runtime.api.openProcurementMarketplace = null;
    });
  },
});

Object.assign(runtime.api, {
  renderProcurementShell: renderShell,
  renderProductionProcurement,
  updateProcurementMarketUi: updateMarketUi,
  openProcurementMarketplace: openMarketplace,
});
