import { runtime } from "../core/runtime.js";

const MANIFEST_URL =
  "https://raw.githubusercontent.com/YangLeda/Userscripts-For-MilkyWayIdle/main/release-manifest.json";
const FALLBACK_MANIFEST_URL =
  "https://feedback.43.167.210.211.sslip.io/api/v1/release-manifest";
const GREASY_FORK_DOWNLOAD_URL =
  "https://update.greasyfork.org/scripts/494467/MWITools.user.js";
const STYLE_ID = "mwitools-important-update-style";
const BANNER_ID = "mwitools-important-update-banner";

function t(value) {
  if (typeof value === "string") return value;
  return value?.[runtime.config.isZH ? "zh" : "en"] ?? value?.en ?? "";
}

function currentVersion() {
  return String(globalThis.GM_info?.script?.version ?? "26.4.10");
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
    manifest?.latestVersion &&
    manifest?.importantVersion &&
    compareVersions(installedVersion, manifest.importantVersion) < 0 &&
    localStorage.getItem(
      `MWITools_update_banner_seen_${manifest.latestVersion}`,
    ) !== "true",
  );
}

function requestManifest(url) {
  const request =
    typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
      ? GM.xmlHttpRequest
      : typeof GM_xmlhttpRequest === "function"
        ? GM_xmlhttpRequest
        : null;
  if (!request) {
    return globalThis.fetch(url, { cache: "no-store" }).then((response) => {
      if (!response.ok) {
        throw new Error(
          t({
            zh: `更新清单请求失败（HTTP ${response.status}）`,
            en: `Update manifest request failed (HTTP ${response.status})`,
          }),
        );
      }
      return response.json();
    });
  }
  return new Promise((resolve, reject) => {
    const finish = (response) => {
      try {
        if (Number(response?.status) < 200 || Number(response?.status) >= 300) {
          reject(
            new Error(
              t({
                zh: `更新清单请求失败（HTTP ${response?.status}）`,
                en: `Update manifest request failed (HTTP ${response?.status})`,
              }),
            ),
          );
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
        url,
        timeout: 5000,
        onload: finish,
        onerror: () =>
          reject(
            new Error(
              t({
                zh: "更新清单请求失败。",
                en: "Update manifest request failed.",
              }),
            ),
          ),
        ontimeout: () =>
          reject(
            new Error(
              t({
                zh: "更新清单请求超时。",
                en: "Update manifest request timed out.",
              }),
            ),
          ),
      });
      result?.then?.(finish).catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

function validateManifest(manifest) {
  if (
    !manifest ||
    typeof manifest !== "object" ||
    manifest.version !== 1 ||
    typeof manifest.latestVersion !== "string" ||
    !manifest.latestVersion.trim() ||
    typeof manifest.importantVersion !== "string" ||
    !manifest.importantVersion.trim() ||
    !manifest.title ||
    typeof manifest.title !== "object" ||
    !manifest.message ||
    typeof manifest.message !== "object"
  ) {
    throw new Error(
      t({ zh: "更新清单格式无效。", en: "Invalid update manifest." }),
    );
  }
  return manifest;
}

async function fetchImportantUpdateManifest({
  urls = [MANIFEST_URL, FALLBACK_MANIFEST_URL],
  request = requestManifest,
} = {}) {
  let lastError = null;
  for (const url of urls) {
    try {
      return validateManifest(await request(url));
    } catch (error) {
      lastError = error;
    }
  }
  throw (
    lastError ??
    new Error(t({ zh: "更新清单不可用。", en: "Update manifest unavailable." }))
  );
}

let manifestCheck = null;

function getImportantUpdateManifest() {
  manifestCheck ??= fetchImportantUpdateManifest();
  return manifestCheck;
}

function updateDownloadUrl() {
  return (
    String(globalThis.GM_info?.script?.downloadURL ?? "").trim() ||
    GREASY_FORK_DOWNLOAD_URL
  );
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
  const message =
    t(manifest.message) ||
    (runtime.config.isZH
      ? `建议更新到 ${manifest.latestVersion}`
      : `Update to ${manifest.latestVersion} is recommended.`);
  banner.querySelector(".mwi-update-banner-message").textContent = runtime
    .config.isZH
    ? `最新版本 ${manifest.latestVersion} · ${message}`
    : `Latest version ${manifest.latestVersion} · ${message}`;
  const action = banner.querySelector(".mwi-update-banner-action");
  action.textContent = runtime.config.isZH ? "前往更新" : "Update";
  action.href = updateDownloadUrl();
  localStorage.setItem(
    `MWITools_update_banner_seen_${manifest.latestVersion}`,
    "true",
  );
  banner
    .querySelector(".mwi-update-banner-close")
    .addEventListener("click", () => banner.remove());
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
          runtime.config.isZH
            ? "[MWITools] 暂时无法检查重要更新"
            : "[MWITools] Important update check unavailable",
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
  fetchImportantUpdateManifest,
  getImportantUpdateManifest,
  updateDownloadUrl,
});
