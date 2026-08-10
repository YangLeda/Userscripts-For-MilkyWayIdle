const API_BASE = "https://feedback.43.167.210.211.sslip.io/api/v1";
const TOKEN_PREFIX = "MWITools_feedback_identity_v1";
export const MAX_IMAGE_LINKS = 3;

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
    return globalThis
      .fetch(`${API_BASE}${path}`, {
        method,
        headers,
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
          throw new Error(payload.detail || `HTTP ${response.status}`);
        }
        return response.json();
      });
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (response) => {
      if (settled) return;
      settled = true;
      const status = Number(response?.status) || 0;
      if (status < 200 || status >= 300) {
        const payload = parseResponse(response);
        const error = new Error(
          payload?.detail || `反馈服务返回 HTTP ${status}`,
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
      reject(new Error(message));
    };
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
        timeout: 20_000,
        anonymous: false,
        onload: finish,
        onerror: () => fail("无法连接意见反馈服务"),
        ontimeout: () => fail("意见反馈服务请求超时"),
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
    throw new Error("最多只能填写 3 个图片链接");
  }
  for (const link of links) {
    if (link.length > 2000) throw new Error("图片链接过长");
    let url;
    try {
      url = new URL(link);
    } catch {
      throw new Error("图片链接格式不正确");
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("图片链接只支持 HTTP 或 HTTPS");
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
  }

  async ensureIdentity() {
    if (this.registered) return;
    const result = await request({
      token: this.token,
      path: "/identity",
      method: "POST",
      body: {
        gameServer: this.server,
        characterId: this.characterId,
        characterName: this.characterName,
        source: "mwitools-userscript",
      },
    });
    this.registered = true;
    return result;
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
