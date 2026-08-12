import { feedbackContext, normalizeImageLinks } from "./client.js";
import { AnnouncementStore } from "./announcements.js";
import { runtime } from "../../core/runtime.js";

const ROOT_ID = "mwitools-feedback-root";
const BUTTON_ID = "mwitools-feedback-button";
const STYLE_ID = "mwitools-feedback-style";
function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function statusLabel(status) {
  const labels = {
    pending: ["待处理", "Pending"],
    processing: ["处理中", "Processing"],
    closed: ["已结束", "Closed"],
  };
  return labels[status] ? t(...labels[status]) : status;
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${BUTTON_ID}{position:relative;display:flex;align-items:center;align-self:center;justify-content:center;gap:5px;width:auto;min-width:76px;margin:2px auto 0;padding:1px 7px;border:1px solid rgba(245,158,11,.55);border-radius:4px;background:rgba(245,158,11,.1);color:#ffc45b;font-size:11px;line-height:1.2;cursor:pointer}
    #${BUTTON_ID}:hover{background:rgba(245,158,11,.19);color:#ffd887}#${BUTTON_ID}[data-unread="true"]{border-color:#ff6b6b;box-shadow:0 0 8px rgba(255,74,74,.62);animation:mwi-opinion-alert 1.4s ease-in-out infinite}.mwi-opinion-dot{position:absolute;right:-4px;top:-4px;width:9px;height:9px;border:2px solid #171b2a;border-radius:50%;background:#f04444;box-shadow:0 0 6px rgba(255,54,54,.9)}.mwi-opinion-dot[hidden]{display:none}@keyframes mwi-opinion-alert{0%,100%{filter:brightness(1)}50%{filter:brightness(1.32)}}
    #${ROOT_ID}{position:fixed;inset:0;z-index:2147482600;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(4,6,12,.72);font-family:inherit;color:#e7e9f0}#${ROOT_ID}[hidden]{display:none}
    .mwi-feedback-modal{display:flex;flex-direction:column;width:min(760px,100%);max-height:min(820px,calc(100vh - 32px));overflow:hidden;border:1px solid #45516f;border-radius:9px;background:#171b2a;box-shadow:0 20px 60px rgba(0,0,0,.65)}
    .mwi-feedback-head{display:flex;align-items:center;padding:12px 15px;border-bottom:1px solid #343c55;background:#1d2336}.mwi-feedback-head h2{margin:0;font-size:16px}.mwi-feedback-close{margin-left:auto;width:30px;height:30px;border:0;border-radius:5px;background:transparent;color:#aab1c4;font-size:20px;cursor:pointer}.mwi-feedback-close:hover{background:#303950;color:white}
    .mwi-feedback-tabs{display:flex;border-bottom:1px solid #343c55}.mwi-feedback-tab{position:relative;flex:1;padding:10px;border:0;background:#191e2e;color:#aeb6ca;cursor:pointer}.mwi-feedback-tab[data-active="true"]{background:#252d45;color:#ffc65b;font-weight:700}
    .mwi-feedback-body{min-height:360px;overflow:auto;padding:16px}.mwi-feedback-view[hidden]{display:none}.mwi-feedback-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mwi-feedback-field{display:flex;flex-direction:column;gap:5px}.mwi-feedback-field.is-wide{grid-column:1/-1}.mwi-feedback-field span{font-size:12px;color:#c5cada}.mwi-feedback-field input,.mwi-feedback-field select,.mwi-feedback-field textarea,.mwi-feedback-reply textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #434e6c;border-radius:5px;background:#101522;color:#eef0f6;font:inherit}.mwi-feedback-field textarea{min-height:105px;resize:vertical}.mwi-feedback-bug-fields{display:contents}.mwi-feedback-bug-fields[hidden]{display:none}
    .mwi-feedback-label-row{display:flex;align-items:center;gap:6px}.mwi-feedback-image-help{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border:1px solid #6f7c9d;border-radius:50%;color:#a9cfff;text-decoration:none;font:700 11px/1 sans-serif}.mwi-feedback-image-help:hover{border-color:#ffc45b;color:#ffc45b}.mwi-feedback-image-links textarea{min-height:76px}.mwi-feedback-field small{color:#8691aa;font-size:11px}.mwi-feedback-link-list{display:grid;gap:6px}.mwi-feedback-link-list a{overflow:hidden;color:#82b8ff;text-overflow:ellipsis;white-space:nowrap}
    .mwi-feedback-footer{display:flex;align-items:center;gap:10px;margin-top:13px}.mwi-feedback-quota{font-size:12px;color:#aeb5c7}.mwi-feedback-submit{margin-left:auto;padding:8px 17px;border:0;border-radius:5px;background:#d58b27;color:#17130c;font-weight:700;cursor:pointer}.mwi-feedback-submit:disabled{opacity:.48;cursor:not-allowed}.mwi-feedback-error{min-height:18px;margin-top:8px;color:#ff8f8f;font-size:12px}.mwi-feedback-success{color:#7ddc96}
    .mwi-feedback-list{display:grid;gap:8px}.mwi-feedback-card{padding:11px;border:1px solid #353f59;border-radius:6px;background:#131927;cursor:pointer}.mwi-feedback-card:hover{background:#1b2336}.mwi-feedback-card h3{margin:0 0 5px;font-size:13px}.mwi-feedback-card-meta{display:flex;gap:7px;align-items:center;color:#959fb8;font-size:11px}.mwi-feedback-status{padding:2px 6px;border-radius:4px;background:#55401c;color:#ffd06f}.mwi-feedback-status.processing{background:#193f58;color:#7ad9ff}.mwi-feedback-status.closed{background:#24452e;color:#84df9d}.mwi-feedback-empty{padding:35px;text-align:center;color:#8d97b0}.mwi-feedback-detail-back{margin-bottom:10px;border:0;background:transparent;color:#81b7ff;cursor:pointer}.mwi-feedback-detail h3{margin:0 0 5px}.mwi-feedback-copy{white-space:pre-wrap;word-break:break-word;line-height:1.5}.mwi-feedback-section{margin-top:12px;padding:11px;border:1px solid #343e58;border-radius:6px;background:#131825}.mwi-feedback-section h4{margin:0 0 7px;font-size:12px;color:#b8c0d3}.mwi-feedback-messages{display:grid;gap:7px}.mwi-feedback-message{padding:8px 10px;border-radius:5px;background:#20283b;border-left:3px solid #f1ae42}.mwi-feedback-message.admin{border-left-color:#68a8ff}.mwi-feedback-message time{display:block;margin-top:4px;color:#8993aa;font-size:10px}.mwi-feedback-actions{display:flex;gap:8px;margin-top:12px}.mwi-feedback-actions button{padding:7px 11px;border:1px solid #465273;border-radius:5px;background:#26314d;color:#e7ebf5;cursor:pointer}.mwi-feedback-reply{display:flex;gap:8px;margin-top:9px}.mwi-feedback-reply textarea{min-height:64px}.mwi-feedback-reply button{align-self:flex-end}.mwi-feedback-notice{margin-bottom:12px;padding:9px;border-radius:5px;background:rgba(64,127,199,.12);color:#b8d7fb;font-size:12px}.mwi-announcement-list{display:grid;gap:10px}.mwi-announcement-card{padding:14px;border:1px solid #3d4967;border-radius:7px;background:#131927}.mwi-announcement-card h3{margin:0;font-size:15px;color:#ffd071}.mwi-announcement-meta{margin-top:4px;color:#8993aa;font-size:11px}.mwi-announcement-card ul{margin:12px 0 0;padding-left:20px}.mwi-announcement-card li{margin:7px 0;color:#d8ddea;line-height:1.5}
    .mwi-announcement-card li strong{color:#ff5f66}
    @media(prefers-reduced-motion:reduce){#${BUTTON_ID}[data-unread="true"]{animation:none}}
    @media(max-width:620px){#${ROOT_ID}{padding:6px}.mwi-feedback-modal{max-height:calc(100vh - 12px)}.mwi-feedback-body{padding:11px}.mwi-feedback-grid{grid-template-columns:1fr}.mwi-feedback-field.is-wide{grid-column:1}.mwi-feedback-reply{flex-direction:column}}
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function formatTime(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value ?? "");
  }
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export class OpinionCenterPanel {
  constructor({ client, scope, announcements = new AnnouncementStore() }) {
    this.client = client;
    this.scope = scope;
    this.announcements = announcements;
    this.items = [];
    this.feedbackUnread = 0;
    this.announcementUnread = this.announcements.unread().length;
    this.acknowledgedFeedbackIds = new Set();
    this.pendingReadIds = new Set();
    this.currentDetailId = null;
    this.quota = null;
    this.editing = null;
    this.build();
  }

  build() {
    addStyles();
    this.root = document.createElement("div");
    this.root.id = ROOT_ID;
    this.root.hidden = true;
    this.root.innerHTML = `
      <section class="mwi-feedback-modal" role="dialog" aria-modal="true" aria-label="${t("MWITools 意见中心", "MWITools Feedback Center")}">
        <header class="mwi-feedback-head"><h2>${t("MWITools 意见中心", "MWITools Feedback Center")}</h2><button type="button" class="mwi-feedback-close" aria-label="${t("关闭", "Close")}">×</button></header>
        <nav class="mwi-feedback-tabs"><button type="button" class="mwi-feedback-tab" data-tab="announcements" data-active="false">${t("公告", "Announcements")}</button><button type="button" class="mwi-feedback-tab" data-tab="submit" data-active="true">${t("提交反馈", "Submit")}</button><button type="button" class="mwi-feedback-tab" data-tab="mine" data-active="false">${t("我的反馈", "My feedback")}</button></nav>
        <div class="mwi-feedback-body">
          <section class="mwi-feedback-view" data-view="announcements" hidden><div class="mwi-announcement-list"></div></section>
          <section class="mwi-feedback-view" data-view="submit"><div class="mwi-feedback-notice">${t("每个角色每个 UTC+8 自然周最多提交 2 条；编辑和留言不占额度。不会采集聊天、游戏消息正文或凭证。", "Up to 2 new reports per character each UTC+8 week. Edits and messages do not use quota. Chats, game message bodies, and credentials are never collected.")}</div>
            <form class="mwi-feedback-form"><div class="mwi-feedback-grid">
              <label class="mwi-feedback-field"><span>${t("类型", "Type")}</span><select name="type"><option value="bug">Bug</option><option value="feature">${t("功能建议", "Feature request")}</option><option value="other">${t("其他", "Other")}</option></select></label>
              <label class="mwi-feedback-field"><span>${t("标题", "Title")}</span><input name="title" maxlength="160" required></label>
              <label class="mwi-feedback-field is-wide"><span>${t("详细说明", "Details")}</span><textarea name="detail" maxlength="12000" required></textarea></label>
              <div class="mwi-feedback-bug-fields"><label class="mwi-feedback-field is-wide"><span>${t("复现步骤", "Steps to reproduce")}</span><textarea name="reproduction" maxlength="8000"></textarea></label><label class="mwi-feedback-field is-wide"><span>${t("预期结果", "Expected result")}</span><textarea name="expected" maxlength="8000"></textarea></label></div>
              <label class="mwi-feedback-field is-wide mwi-feedback-image-links"><span class="mwi-feedback-label-row"><span>${t("图片链接（每行一个，最多 3 个）", "Image links (one per line, up to 3)")}</span><a class="mwi-feedback-image-help" href="https://tupian.li" target="_blank" rel="noopener noreferrer" title="${t("不知道图床？打开 tupian.li", "Need image hosting? Open tupian.li")}">?</a></span><textarea name="imageLinks" maxlength="6002" placeholder="https://..."></textarea><small>${t("服务器不会上传、下载或代理图片，只保存你填写的链接。", "The server only stores your links; it never uploads, downloads, or proxies images.")}</small></label>
            </div><div class="mwi-feedback-footer"><span class="mwi-feedback-quota">${t("正在查询本周额度…", "Checking weekly quota…")}</span><button type="submit" class="mwi-feedback-submit">${t("提交", "Submit")}</button></div><div class="mwi-feedback-error"></div></form>
          </section>
          <section class="mwi-feedback-view" data-view="mine" hidden><div class="mwi-feedback-list"></div><div class="mwi-feedback-detail" hidden></div><div class="mwi-feedback-error"></div></section>
        </div>
      </section>`;
    document.body.appendChild(this.root);
    this.form = this.root.querySelector(".mwi-feedback-form");
    this.scope.event(
      this.root.querySelector(".mwi-feedback-close"),
      "click",
      () => this.close(),
    );
    this.scope.event(this.root, "click", (event) => {
      if (event.target === this.root) this.close();
    });
    this.root
      .querySelectorAll("[data-tab]")
      .forEach((button) =>
        this.scope.event(button, "click", () =>
          this.showTab(button.dataset.tab),
        ),
      );
    this.scope.event(this.form.elements.type, "change", () =>
      this.toggleBugFields(),
    );
    this.scope.event(this.form, "submit", (event) => this.submit(event));
    this.scope.event(document, "keydown", (event) => {
      if (event.key === "Escape" && !this.root.hidden) this.close();
    });
    this.scope.add(() => this.destroy());
    this.toggleBugFields();
    this.renderAnnouncements();
  }

  ensureButton() {
    const totalLevel = this.findTotalLevel();
    if (!totalLevel?.parentElement) return null;
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.id = BUTTON_ID;
      const icon = makeElement("span", "", "✉");
      const label = makeElement("span", "mwi-opinion-label");
      const dot = makeElement("span", "mwi-opinion-dot");
      dot.hidden = true;
      button.append(icon, label, dot);
      this.scope.event(button, "click", () => this.open());
    }
    button.querySelector(".mwi-opinion-label").textContent = t(
      "MWITools 意见中心",
      "MWITools Feedback Center",
    );
    if (
      button.parentElement !== totalLevel.parentElement ||
      button.previousElementSibling !== totalLevel
    ) {
      totalLevel.insertAdjacentElement("afterend", button);
    }
    this.updateUnreadIndicator();
    return button;
  }

  findTotalLevel() {
    const direct = document.querySelector(
      '[class*="Header_totalLevel"],[class*="totalLevel"]',
    );
    if (direct) return direct;
    return [
      ...document.querySelectorAll(
        'header div,header span,[class*="Header"] div',
      ),
    ].find((node) => {
      const text = node.textContent?.trim() ?? "";
      return text.length < 80 && /^(总等级|Total Level)\s*[:：]/i.test(text);
    });
  }

  setUnread(count) {
    this.feedbackUnread = Math.max(0, Number(count) || 0);
    this.updateUnreadIndicator();
  }

  updateUnreadIndicator() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;
    const hasUnread = this.feedbackUnread > 0 || this.announcementUnread > 0;
    button.dataset.unread = String(hasUnread);
    const dot = button.querySelector(".mwi-opinion-dot");
    if (dot) dot.hidden = !hasUnread;
    button.setAttribute(
      "aria-label",
      hasUnread
        ? t(
            "MWITools 意见中心，有新内容",
            "MWITools Feedback Center, new activity",
          )
        : t("MWITools 意见中心", "MWITools Feedback Center"),
    );
  }

  async open() {
    const hadAnnouncementUnread = this.announcementUnread > 0;
    const hadFeedbackUnread = this.feedbackUnread > 0;
    this.root.hidden = false;
    this.showTab(
      hadAnnouncementUnread
        ? "announcements"
        : hadFeedbackUnread
          ? "mine"
          : "submit",
    );
    this.announcements.markAllRead();
    this.announcementUnread = 0;
    this.feedbackUnread = 0;
    this.updateUnreadIndicator();
    await this.refresh({ keepIndicatorClear: true });
    const discoveredFeedbackUnread = this.feedbackUnread > 0;
    if (
      !hadAnnouncementUnread &&
      !hadFeedbackUnread &&
      discoveredFeedbackUnread
    ) {
      this.showTab("mine");
    }
    const unreadItems = this.items.filter(
      (item) => item.unread && !this.acknowledgedFeedbackIds.has(item.id),
    );
    this.acknowledgeFeedback(unreadItems);
    this.feedbackUnread = 0;
    this.updateUnreadIndicator();
  }

  close() {
    this.root.hidden = true;
  }

  showTab(name) {
    this.root.querySelectorAll("[data-tab]").forEach((button) => {
      button.dataset.active = String(button.dataset.tab === name);
    });
    this.root.querySelectorAll("[data-view]").forEach((view) => {
      view.hidden = view.dataset.view !== name;
    });
    if (name === "mine") this.renderList();
    if (name === "announcements") this.renderAnnouncements();
  }

  toggleBugFields() {
    this.form.querySelector(".mwi-feedback-bug-fields").hidden =
      this.form.elements.type.value !== "bug";
  }

  formValue() {
    return {
      type: this.form.elements.type.value,
      title: this.form.elements.title.value.trim(),
      detail: this.form.elements.detail.value.trim(),
      reproduction: this.form.elements.reproduction.value.trim(),
      expected: this.form.elements.expected.value.trim(),
      imageLinks: normalizeImageLinks(this.form.elements.imageLinks.value),
      context: feedbackContext(this.client),
    };
  }

  async submit(event) {
    event.preventDefault();
    const error = this.form.querySelector(".mwi-feedback-error");
    const button = this.form.querySelector(".mwi-feedback-submit");
    button.disabled = true;
    error.classList.remove("mwi-feedback-success");
    error.textContent = t("正在提交…", "Submitting…");
    try {
      const value = this.formValue();
      if (!value.title || !value.detail) {
        throw new Error(
          t("请填写标题和详细说明。", "Enter a title and details."),
        );
      }
      const editingId = this.editing?.id ?? null;
      const saved = editingId
        ? await this.client.edit(editingId, value)
        : await this.client.submit(value);
      if (!editingId && this.quota) {
        this.quota = {
          ...this.quota,
          remaining: Math.max(0, Number(this.quota.remaining) - 1),
        };
      }
      if (saved?.id) {
        this.items = [
          saved,
          ...this.items.filter((item) => item.id !== saved.id),
        ];
      }
      this.resetForm();
      this.renderQuota();
      error.classList.add("mwi-feedback-success");
      error.textContent = t("已保存反馈。", "Feedback saved.");
      this.showTab("mine");
      void this.refresh();
    } catch (caught) {
      error.classList.remove("mwi-feedback-success");
      error.textContent = caught.message;
    } finally {
      button.disabled = !this.editing && this.quota?.remaining === 0;
    }
  }

  resetForm() {
    this.form.reset();
    this.editing = null;
    this.form.querySelector(".mwi-feedback-submit").textContent = t(
      "提交",
      "Submit",
    );
    this.toggleBugFields();
  }

  unreadFeedbackCount(result) {
    const unreadItems = this.items.filter((item) => item.unread);
    const acknowledged = unreadItems.filter((item) =>
      this.acknowledgedFeedbackIds.has(item.id),
    ).length;
    return Math.max(
      0,
      Number(result.unread ?? unreadItems.length) - acknowledged,
    );
  }

  acknowledgeFeedback(items) {
    for (const item of items) {
      if (!item?.id || this.pendingReadIds.has(item.id)) continue;
      this.acknowledgedFeedbackIds.add(item.id);
      this.pendingReadIds.add(item.id);
      Promise.resolve()
        .then(() => this.client.markRead(item.id))
        .then(() => {
          this.pendingReadIds.delete(item.id);
          this.acknowledgedFeedbackIds.delete(item.id);
          item.unread = false;
        })
        .catch(() => {
          // Keep failed IDs suppressed for this session and retry after polling.
        });
    }
  }

  retryPendingReads() {
    for (const id of [...this.pendingReadIds]) {
      Promise.resolve()
        .then(() => this.client.markRead(id))
        .then(() => {
          this.pendingReadIds.delete(id);
          this.acknowledgedFeedbackIds.delete(id);
          const item = this.items.find((candidate) => candidate.id === id);
          if (item) item.unread = false;
        })
        .catch(() => {});
    }
  }

  async refresh({ keepIndicatorClear = false } = {}) {
    try {
      const result = await this.client.list();
      this.items = result.items ?? [];
      this.quota = result.quota;
      this.feedbackUnread = this.unreadFeedbackCount(result);
      if (!keepIndicatorClear) this.updateUnreadIndicator();
      this.renderQuota();
      this.root.querySelectorAll(".mwi-feedback-error").forEach((node) => {
        if (!node.classList.contains("mwi-feedback-success"))
          node.textContent = "";
      });
      if (this.currentDetailId && !this.root.hidden) {
        await this.openDetail(this.currentDetailId);
      } else {
        this.renderList();
      }
      this.retryPendingReads();
      return true;
    } catch (error) {
      this.renderQuota(error.message);
      this.root.querySelector(
        '[data-view="mine"] .mwi-feedback-error',
      ).textContent = error.message;
      return false;
    }
  }

  renderAnnouncements() {
    const host = this.root.querySelector(".mwi-announcement-list");
    if (!host) return;
    host.replaceChildren();
    const announcements = this.announcements.list();
    if (!announcements.length) {
      host.append(
        makeElement(
          "div",
          "mwi-feedback-empty",
          t("目前还没有公告。", "There are no announcements yet."),
        ),
      );
      return;
    }
    for (const item of announcements) {
      const card = makeElement("article", "mwi-announcement-card");
      const title = makeElement(
        "h3",
        "",
        item.title?.[runtime.config.isZH ? "zh" : "en"] ?? item.version,
      );
      const meta = makeElement(
        "div",
        "mwi-announcement-meta",
        `${item.version} · ${item.publishedAt}`,
      );
      const list = document.createElement("ul");
      const body = item.body?.[runtime.config.isZH ? "zh" : "en"] ?? [];
      const emphasizedIndexes = new Set(item.emphasizedBodyIndexes ?? []);
      list.append(
        ...body.map((line, index) => {
          const listItem = makeElement("li");
          if (!emphasizedIndexes.has(index)) {
            listItem.textContent = line;
            return listItem;
          }
          const strong = document.createElement("strong");
          const underline = document.createElement("u");
          underline.textContent = line;
          strong.append(underline);
          listItem.append(strong);
          return listItem;
        }),
      );
      card.append(title, meta, list);
      host.append(card);
    }
  }

  renderQuota(errorMessage = "") {
    const node = this.form.querySelector(".mwi-feedback-quota");
    node.textContent = errorMessage
      ? t(
          `额度查询失败：${errorMessage}`,
          `Quota check failed: ${errorMessage}`,
        )
      : this.quota
        ? t(
            `本周剩余 ${this.quota.remaining}/${this.quota.limit} 条`,
            `${this.quota.remaining}/${this.quota.limit} submissions left this week`,
          )
        : t("额度暂时不可用", "Quota unavailable");
    this.form.querySelector(".mwi-feedback-submit").disabled =
      !this.editing && this.quota?.remaining === 0;
  }

  renderList() {
    this.currentDetailId = null;
    const host = this.root.querySelector(".mwi-feedback-list");
    const detail = this.root.querySelector(".mwi-feedback-detail");
    detail.hidden = true;
    host.hidden = false;
    host.replaceChildren();
    if (!this.items.length) {
      host.append(
        makeElement(
          "div",
          "mwi-feedback-empty",
          t("还没有提交过反馈。", "No feedback yet."),
        ),
      );
      return;
    }
    for (const item of this.items) {
      const card = makeElement("article", "mwi-feedback-card");
      const title = makeElement("h3", "", item.title);
      const meta = makeElement("div", "mwi-feedback-card-meta");
      const status = makeElement(
        "span",
        `mwi-feedback-status ${item.status}`,
        statusLabel(item.status),
      );
      meta.append(status, document.createTextNode(formatTime(item.updatedAt)));
      card.append(title, meta);
      card.addEventListener("click", () => this.openDetail(item.id), {
        once: true,
      });
      host.append(card);
    }
  }

  async openDetail(id) {
    const host = this.root.querySelector(".mwi-feedback-list");
    const detail = this.root.querySelector(".mwi-feedback-detail");
    try {
      const item = await this.client.detail(id);
      this.currentDetailId = id;
      host.hidden = true;
      detail.hidden = false;
      detail.replaceChildren();
      const back = makeElement(
        "button",
        "mwi-feedback-detail-back",
        `← ${t("返回列表", "Back")}`,
      );
      back.type = "button";
      back.addEventListener("click", () => this.renderList(), { once: true });
      const title = makeElement("h3", "", item.title);
      const meta = makeElement(
        "div",
        "mwi-feedback-card-meta",
        `${statusLabel(item.status)} · ${formatTime(item.updatedAt)}`,
      );
      detail.append(
        back,
        title,
        meta,
        this.textSection(t("详细说明", "Details"), item.detail),
      );
      if (item.type === "bug") {
        detail.append(
          this.textSection(
            t("复现步骤", "Steps to reproduce"),
            item.reproduction || "—",
          ),
          this.textSection(
            t("预期结果", "Expected result"),
            item.expected || "—",
          ),
        );
      }
      if (item.imageLinks?.length) {
        const section = makeElement("section", "mwi-feedback-section");
        section.append(makeElement("h4", "", t("图片链接", "Image links")));
        const links = makeElement("div", "mwi-feedback-link-list");
        for (const [index, url] of item.imageLinks.entries()) {
          const link = makeElement(
            "a",
            "",
            `${t("图片", "Image")} ${index + 1}：${url}`,
          );
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          links.append(link);
        }
        section.append(links);
        detail.append(section);
      }
      const messages = makeElement("section", "mwi-feedback-section");
      messages.append(makeElement("h4", "", t("留言", "Messages")));
      const messageList = makeElement("div", "mwi-feedback-messages");
      for (const message of item.messages ?? []) {
        const box = makeElement("div", `mwi-feedback-message ${message.actor}`);
        box.append(
          makeElement(
            "strong",
            "",
            message.actor === "admin" ? t("管理员", "Admin") : t("我", "Me"),
          ),
          makeElement("div", "mwi-feedback-copy", message.body),
          makeElement("time", "", formatTime(message.createdAt)),
        );
        messageList.append(box);
      }
      if (!messageList.childElementCount) {
        messageList.append(
          makeElement(
            "div",
            "mwi-feedback-card-meta",
            t("暂无留言", "No messages"),
          ),
        );
      }
      messages.append(messageList);
      detail.append(messages);
      if (item.status !== "closed") {
        const actions = makeElement("div", "mwi-feedback-actions");
        const edit = makeElement("button", "", t("修改反馈", "Edit feedback"));
        edit.type = "button";
        edit.addEventListener("click", () => this.startEdit(item), {
          once: true,
        });
        actions.append(edit);
        detail.append(actions);
        const reply = makeElement("div", "mwi-feedback-reply");
        const input = document.createElement("textarea");
        input.placeholder = t("补充留言…", "Add a message…");
        input.maxLength = 8000;
        const send = makeElement("button", "", t("发送", "Send"));
        send.type = "button";
        send.addEventListener("click", async () => {
          if (!input.value.trim()) return;
          send.disabled = true;
          try {
            await this.client.reply(item.id, input.value.trim());
            await this.openDetail(item.id);
          } catch (error) {
            send.disabled = false;
            input.setCustomValidity(error.message);
            input.reportValidity();
          }
        });
        reply.append(input, send);
        detail.append(reply);
      } else {
        detail.append(
          makeElement(
            "div",
            "mwi-feedback-notice",
            t(
              "该反馈已结束，内容和留言已锁定。",
              "This feedback is closed and locked.",
            ),
          ),
        );
      }
      await this.client.markRead(item.id).catch(() => {});
      if (item.unread) this.setUnread(this.unread - 1);
    } catch (error) {
      detail.hidden = false;
      detail.replaceChildren(
        makeElement("div", "mwi-feedback-error", error.message),
      );
    }
  }

  textSection(label, value) {
    const section = makeElement("section", "mwi-feedback-section");
    section.append(
      makeElement("h4", "", label),
      makeElement("div", "mwi-feedback-copy", value),
    );
    return section;
  }

  startEdit(item) {
    this.editing = { ...item };
    for (const name of [
      "type",
      "title",
      "detail",
      "reproduction",
      "expected",
    ]) {
      this.form.elements[name].value = item[name] ?? "";
    }
    this.form.elements.imageLinks.value = (item.imageLinks ?? []).join("\n");
    this.form.querySelector(".mwi-feedback-submit").textContent = t(
      "保存修改",
      "Save changes",
    );
    this.toggleBugFields();
    this.renderQuota();
    this.showTab("submit");
  }

  destroy() {
    document.getElementById(BUTTON_ID)?.remove();
    this.root?.remove();
    document.getElementById(STYLE_ID)?.remove();
  }
}

export const feedbackUiIds = { ROOT_ID, BUTTON_ID, STYLE_ID };
export const FeedbackPanel = OpinionCenterPanel;
