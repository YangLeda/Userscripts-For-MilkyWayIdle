import { runtime } from "../../core/runtime.js";

const API_BASE = "https://feedback.43.167.210.211.sslip.io/api/v1";
const TOKEN_PREFIX = "MWITools_feedback_identity_v1";
const REQUEST_TIMEOUT = 10_000;
export const MAX_IMAGE_LINKS = 3;

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

const SERVER_ERROR_LABELS = {
  "Required text is missing": ["必填内容不能为空", "Required text is missing"],
  "Bearer token required": [
    "缺少反馈身份令牌",
    "Feedback identity token is missing",
  ],
  "Invalid bearer token": [
    "反馈身份令牌无效",
    "Feedback identity token is invalid",
  ],
  "Identity is not registered": [
    "反馈身份尚未注册",
    "Feedback identity is not registered",
  ],
  "Invalid image link list": ["图片链接列表无效", "Invalid image link list"],
  "Image links must be a list": [
    "图片链接必须是列表",
    "Image links must be a list",
  ],
  "At most 3 image links are allowed": [
    "最多只能填写 3 个图片链接",
    "At most 3 image links are allowed",
  ],
  "Image links must use http or https": [
    "图片链接只支持 HTTP 或 HTTPS",
    "Image links must use HTTP or HTTPS",
  ],
  "Feedback not found": ["未找到这条反馈", "Feedback not found"],
  "This private identity belongs to another character": [
    "当前反馈身份属于其他角色",
    "This feedback identity belongs to another character",
  ],
  "Invalid feedback type": ["反馈类型无效", "Invalid feedback type"],
  "Invalid context JSON": ["反馈环境信息无效", "Invalid feedback context"],
  "Context must be an object": [
    "反馈环境信息格式无效",
    "Feedback context must be an object",
  ],
  "Weekly feedback limit reached": [
    "本周反馈额度已用完",
    "Weekly feedback limit reached",
  ],
  "Closed feedback cannot be edited": [
    "已结束的反馈不能修改",
    "Closed feedback cannot be edited",
  ],
  "Closed feedback cannot receive messages": [
    "已结束的反馈不能继续留言",
    "Closed feedback cannot receive messages",
  ],
};

function localizeErrorDetail(detail) {
  const value = String(detail ?? "").trim();
  const labels = SERVER_ERROR_LABELS[value];
  if (labels) return t(...labels);
  const limit = /^Text exceeds (\d+) characters$/.exec(value);
  if (limit) {
    return t(
      `内容不能超过 ${limit[1]} 个字符`,
      `Text cannot exceed ${limit[1]} characters`,
    );
  }
  return value;
}

function gameServer() {
  return String(globalThis.location?.hostname ?? "unknown");
}

function encodeToken(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis
    .btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function createToken() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return encodeToken(bytes);
}

function getPrivateValue(key) {
  try {
    return typeof GM_getValue === "function" ? GM_getValue(key, "") : "";
  } catch {
    return "";
  }
}

function setPrivateValue(key, value) {
  if (typeof GM_setValue === "function") GM_setValue(key, value);
}

function parseResponse(response) {
  const text = response?.responseText ?? response?.response ?? "";
  if (!text) return null;
  if (typeof text === "object") return text;
  try {
    return JSON.parse(text);
  } catch {
    return { detail: String(text) };
  }
}

function request({ token, path, method = "GET", body }) {
  const requestFn =
    typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
      ? GM.xmlHttpRequest
      : typeof GM_xmlhttpRequest === "function"
        ? GM_xmlhttpRequest
        : null;
  const headers = { Authorization: `Bearer ${token}` };
  if (body && !(body instanceof globalThis.FormData))
    headers["Content-Type"] = "application/json";
  if (!requestFn) {
    const controller = new globalThis.AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    return globalThis
      .fetch(`${API_BASE}${path}`, {
        method,
        headers,
        signal: controller.signal,
        body:
          body instanceof globalThis.FormData
            ? body
            : body
              ? JSON.stringify(body)
              : undefined,
      })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(
            localizeErrorDetail(payload.detail) || `HTTP ${response.status}`,
          );
        }
        return response.json();
      })
      .catch((error) => {
        if (error?.name === "AbortError") {
          throw new Error(
            t("意见反馈服务请求超时", "Feedback service request timed out"),
          );
        }
        throw error;
      })
      .finally(() => clearTimeout(timeout));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let watchdog;
    const finish = (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      const status = Number(response?.status) || 0;
      if (status < 200 || status >= 300) {
        const payload = parseResponse(response);
        const error = new Error(
          localizeErrorDetail(payload?.detail) ||
            t(
              `反馈服务返回 HTTP ${status}`,
              `Feedback service returned HTTP ${status}`,
            ),
        );
        error.status = status;
        reject(error);
        return;
      }
      resolve(parseResponse(response));
    };
    const fail = (message) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      reject(new Error(message));
    };
    watchdog = setTimeout(
      () =>
        fail(t("意见反馈服务请求超时", "Feedback service request timed out")),
      REQUEST_TIMEOUT + 1_000,
    );
    try {
      const result = requestFn({
        method,
        url: `${API_BASE}${path}`,
        headers,
        data:
          body instanceof globalThis.FormData
            ? body
            : body
              ? JSON.stringify(body)
              : undefined,
        responseType: "text",
        timeout: REQUEST_TIMEOUT,
        anonymous: false,
        onload: finish,
        onerror: () =>
          fail(
            t("无法连接意见反馈服务", "Unable to reach the feedback service"),
          ),
        ontimeout: () =>
          fail(t("意见反馈服务请求超时", "Feedback service request timed out")),
      });
      result?.then?.(finish).catch((error) => fail(error.message));
    } catch (error) {
      fail(error.message);
    }
  });
}

export function normalizeImageLinks(value) {
  const values = Array.isArray(value)
    ? value
    : String(value ?? "").split(/\r?\n/);
  const links = values.map((item) => String(item).trim()).filter(Boolean);
  if (links.length > MAX_IMAGE_LINKS) {
    throw new Error(
      t("最多只能填写 3 个图片链接", "At most 3 image links are allowed"),
    );
  }
  for (const link of links) {
    if (link.length > 2000)
      throw new Error(t("图片链接过长", "The image link is too long"));
    let url;
    try {
      url = new URL(link);
    } catch {
      throw new Error(t("图片链接格式不正确", "Invalid image link format"));
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error(
        t("图片链接只支持 HTTP 或 HTTPS", "Image links must use HTTP or HTTPS"),
      );
    }
  }
  return links;
}

function appendFeedbackForm(form, value) {
  form.append("kind", value.type);
  form.append("title", value.title);
  form.append("detail", value.detail);
  form.append("reproduction", value.reproduction ?? "");
  form.append("expected", value.expected ?? "");
  if (value.context) form.append("context", JSON.stringify(value.context));
  form.append(
    "imageLinks",
    JSON.stringify(normalizeImageLinks(value.imageLinks)),
  );
  return form;
}

export class FeedbackClient {
  constructor({ characterId, characterName }) {
    this.characterId = String(characterId);
    this.characterName = String(characterName ?? "");
    this.server = gameServer();
    this.storageKey = `${TOKEN_PREFIX}:${this.server}:${this.characterId}`;
    this.token = getPrivateValue(this.storageKey) || createToken();
    setPrivateValue(this.storageKey, this.token);
    this.registered = false;
    this.identityPromise = null;
  }

  async ensureIdentity() {
    if (this.registered) return;
    if (!this.identityPromise) {
      this.identityPromise = request({
        token: this.token,
        path: "/identity",
        method: "POST",
        body: {
          gameServer: this.server,
          characterId: this.characterId,
          characterName: this.characterName,
          source: "mwitools-userscript",
        },
      })
        .then((result) => {
          this.registered = true;
          return result;
        })
        .finally(() => {
          this.identityPromise = null;
        });
    }
    return this.identityPromise;
  }

  async call(path, options = {}) {
    await this.ensureIdentity();
    return request({ token: this.token, path, ...options });
  }

  quota() {
    return this.call("/quota");
  }

  list() {
    return this.call("/feedback");
  }

  detail(id) {
    return this.call(`/feedback/${encodeURIComponent(id)}`);
  }

  submit(value) {
    return this.call("/feedback", {
      method: "POST",
      body: appendFeedbackForm(new globalThis.FormData(), value),
    });
  }

  edit(id, value) {
    return this.call(`/feedback/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: appendFeedbackForm(new globalThis.FormData(), value),
    });
  }

  reply(id, body) {
    return this.call(`/feedback/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: { body },
    });
  }

  markRead(id) {
    return this.call(`/feedback/${encodeURIComponent(id)}/seen`, {
      method: "POST",
    });
  }
}

export function feedbackContext(client) {
  const info = globalThis.GM_info?.script ?? {};
  return {
    scriptVersion: String(info.version ?? "unknown"),
    gameServer: client.server,
    characterId: client.characterId,
    characterName: client.characterName,
    browser: String(globalThis.navigator?.userAgent ?? "").slice(0, 500),
  };
}
