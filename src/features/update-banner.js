import { runtime } from "../core/runtime.js";

const MANIFEST_URL =
  "https://raw.githubusercontent.com/YangLeda/Userscripts-For-MilkyWayIdle/main/release-manifest.json";
const GREASY_FORK_URL = "https://greasyfork.org/zh-CN/scripts/494467-mwitools";
const CACHE_KEY = "MWITools_important_update_manifest_v1";
const CACHE_MAX_AGE = 6 * 60 * 60 * 1000;
const STYLE_ID = "mwitools-important-update-style";
const BANNER_ID = "mwitools-important-update-banner";

function t(value) {
  if (typeof value === "string") return value;
  return value?.[runtime.config.isZH ? "zh" : "en"] ?? value?.en ?? "";
}

function currentVersion() {
  return String(globalThis.GM_info?.script?.version ?? "26.0");
}

function isTestBuild() {
  const info = globalThis.GM_info?.script;
  return (
    /测试|test/i.test(String(info?.name ?? "")) ||
    /mwitools-test/i.test(String(info?.updateURL ?? info?.downloadURL ?? ""))
  );
}

function versionParts(value) {
  return String(value ?? "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

function shouldShowImportantUpdate(
  manifest,
  installedVersion = currentVersion(),
) {
  return Boolean(
    manifest?.importantVersion &&
    compareVersions(installedVersion, manifest.importantVersion) < 0 &&
    localStorage.getItem(
      `MWITools_update_banner_dismissed_${manifest.importantVersion}`,
    ) !== "true",
  );
}

function readCachedManifest() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!cached?.manifest || Date.now() - cached.savedAt > CACHE_MAX_AGE) {
      return null;
    }
    return cached.manifest;
  } catch {
    return null;
  }
}

function saveCachedManifest(manifest) {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ savedAt: Date.now(), manifest }),
  );
}

function requestManifest() {
  const request =
    typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
      ? GM.xmlHttpRequest
      : typeof GM_xmlhttpRequest === "function"
        ? GM_xmlhttpRequest
        : null;
  if (!request) {
    return globalThis
      .fetch(MANIFEST_URL, { cache: "no-store" })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Update manifest HTTP ${response.status}`);
        return response.json();
      });
  }
  return new Promise((resolve, reject) => {
    const finish = (response) => {
      try {
        if (Number(response?.status) < 200 || Number(response?.status) >= 300) {
          reject(new Error(`Update manifest HTTP ${response?.status}`));
          return;
        }
        resolve(JSON.parse(response.responseText));
      } catch (error) {
        reject(error);
      }
    };
    try {
      const result = request({
        method: "GET",
        url: MANIFEST_URL,
        timeout: 5000,
        onload: finish,
        onerror: () => reject(new Error("Update manifest request failed")),
        ontimeout: () => reject(new Error("Update manifest request timed out")),
      });
      result?.then?.(finish).catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

async function getImportantUpdateManifest() {
  const cached = readCachedManifest();
  if (cached) return cached;
  const manifest = await requestManifest();
  if (!manifest?.importantVersion) throw new Error("Invalid update manifest");
  saveCachedManifest(manifest);
  return manifest;
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${BANNER_ID}{position:fixed;left:50%;top:8px;z-index:2147482500;display:flex;box-sizing:border-box;width:min(720px,calc(100vw - 24px));align-items:center;gap:10px;padding:8px 10px;border:1px solid rgba(245,158,11,.62);border-radius:6px;background:rgba(25,28,42,.97);color:var(--color-neutral-100,#eee);box-shadow:0 9px 24px rgba(0,0,0,.42);font:inherit;transform:translateX(-50%)}
    .mwi-update-banner-icon{display:flex;width:28px;height:28px;flex:0 0 auto;align-items:center;justify-content:center;border-radius:5px;background:rgba(245,158,11,.14);color:#f5a623;font-weight:800}
    .mwi-update-banner-copy{min-width:0;flex:1}
    .mwi-update-banner-title{font-size:.78rem;font-weight:700;line-height:1.25}
    .mwi-update-banner-message{margin-top:2px;color:var(--color-text-secondary,#aaa);font-size:.68rem;line-height:1.3}
    .mwi-update-banner-action{flex:0 0 auto;min-height:29px;padding:3px 11px;border:0;border-radius:4px;background:#d98b2b;color:#171717;font-size:.7rem;font-weight:700;cursor:pointer;text-decoration:none}
    .mwi-update-banner-action:hover{background:#f0a13e}
    .mwi-update-banner-close{flex:0 0 auto;width:27px;height:27px;padding:0;border:0;border-radius:4px;background:transparent;color:#9299aa;cursor:pointer}
    .mwi-update-banner-close:hover{background:rgba(255,255,255,.08);color:#fff}
    @media(max-width:600px){#${BANNER_ID}{align-items:flex-start;gap:7px;padding:7px}.mwi-update-banner-icon{display:none}.mwi-update-banner-action{align-self:center;padding:3px 8px}.mwi-update-banner-message{display:none}}
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function renderImportantUpdateBanner(manifest) {
  document.getElementById(BANNER_ID)?.remove();
  if (!shouldShowImportantUpdate(manifest)) return false;
  addStyles();
  const banner = document.createElement("aside");
  banner.id = BANNER_ID;
  banner.setAttribute("role", "status");
  banner.innerHTML = `
    <span class="mwi-update-banner-icon">↑</span>
    <div class="mwi-update-banner-copy">
      <div class="mwi-update-banner-title"></div>
      <div class="mwi-update-banner-message"></div>
    </div>
    <a class="mwi-update-banner-action" target="_blank" rel="noopener noreferrer"></a>
    <button class="mwi-update-banner-close" aria-label="${runtime.config.isZH ? "关闭" : "Dismiss"}">×</button>`;
  banner.querySelector(".mwi-update-banner-title").textContent =
    t(manifest.title) ||
    (runtime.config.isZH ? "MWITools 有重要更新" : "Important MWITools update");
  banner.querySelector(".mwi-update-banner-message").textContent =
    t(manifest.message) ||
    (runtime.config.isZH
      ? `建议更新到 ${manifest.importantVersion}`
      : `Update to ${manifest.importantVersion} is recommended.`);
  const action = banner.querySelector(".mwi-update-banner-action");
  action.textContent = runtime.config.isZH ? "前往更新" : "Update";
  action.href = manifest.url || GREASY_FORK_URL;
  banner
    .querySelector(".mwi-update-banner-close")
    .addEventListener("click", () => {
      localStorage.setItem(
        `MWITools_update_banner_dismissed_${manifest.importantVersion}`,
        "true",
      );
      banner.remove();
    });
  document.body.appendChild(banner);
  return true;
}

runtime.features.register({
  id: "importantUpdateBanner",
  initialize({ scope }) {
    if (isTestBuild()) return;
    let disposed = false;
    getImportantUpdateManifest()
      .then((manifest) => {
        if (!disposed) renderImportantUpdateBanner(manifest);
      })
      .catch((error) => {
        console.info(
          "[MWITools] Important update check unavailable",
          error.message,
        );
      });
    scope.add(() => {
      disposed = true;
      document.getElementById(BANNER_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
    });
  },
});

Object.assign(runtime.api, {
  compareVersions,
  shouldShowImportantUpdate,
  renderImportantUpdateBanner,
  getImportantUpdateManifest,
});
