const API_BASE = "https://feedback.43.167.210.211.sslip.io/api/v1";
const TOKEN_PREFIX = "MWITools_feedback_identity_v1";
export const MAX_ATTACHMENTS = 3;
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

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

function request({ token, path, method = "GET", body, responseType }) {
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
        return responseType === "blob" ? response.blob() : response.json();
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
      if (responseType === "blob") resolve(response.response);
      else resolve(parseResponse(response));
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
        responseType: responseType === "blob" ? "blob" : "text",
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

export function validateImageFiles(files, existingCount = 0) {
  const values = [...(files ?? [])];
  if (existingCount + values.length > MAX_ATTACHMENTS) {
    throw new Error("最多只能上传 3 张图片");
  }
  for (const file of values) {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      throw new Error("只支持 PNG、JPEG 和 WebP 图片");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("每张图片不能超过 1MB");
    }
  }
  return values;
}

function appendFeedbackForm(form, value, files, keepAttachments = null) {
  form.append("kind", value.type);
  form.append("title", value.title);
  form.append("detail", value.detail);
  form.append("reproduction", value.reproduction ?? "");
  form.append("expected", value.expected ?? "");
  if (value.context) form.append("context", JSON.stringify(value.context));
  if (keepAttachments)
    form.append("keepAttachments", JSON.stringify(keepAttachments));
  for (const file of files) form.append("images", file, file.name);
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

  submit(value, files = []) {
    validateImageFiles(files);
    return this.call("/feedback", {
      method: "POST",
      body: appendFeedbackForm(new globalThis.FormData(), value, files),
    });
  }

  edit(id, value, files = [], keepAttachments = []) {
    validateImageFiles(files, keepAttachments.length);
    return this.call(`/feedback/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: appendFeedbackForm(
        new globalThis.FormData(),
        value,
        files,
        keepAttachments,
      ),
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

  attachmentBlob(id, thumbnail = false) {
    return this.call(
      `/attachments/${encodeURIComponent(id)}${thumbnail ? "/thumbnail" : ""}`,
      { responseType: "blob" },
    );
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
