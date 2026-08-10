import {
  ACCEPTED_IMAGE_TYPES,
  MAX_ATTACHMENTS,
  MAX_IMAGE_BYTES,
  feedbackContext,
  validateImageFiles,
} from "./client.js";

const ROOT_ID = "mwitools-feedback-root";
const BUTTON_ID = "mwitools-feedback-button";
const STYLE_ID = "mwitools-feedback-style";
const STATUS_LABELS = {
  pending: "待处理",
  processing: "处理中",
  closed: "已结束",
};

function t(zh, en) {
  const language =
    globalThis.localStorage?.getItem("i18nextLng") ??
    globalThis.document?.documentElement?.lang ??
    "en";
  return language.toLowerCase().startsWith("zh") ? zh : en;
}

function addStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${BUTTON_ID}{position:relative;display:flex;align-items:center;justify-content:center;gap:5px;width:100%;margin-top:3px;padding:3px 7px;border:1px solid rgba(245,158,11,.55);border-radius:4px;background:rgba(245,158,11,.1);color:#ffc45b;font-size:11px;line-height:1.2;cursor:pointer}
    #${BUTTON_ID}:hover{background:rgba(245,158,11,.19);color:#ffd887}.mwi-feedback-badge{position:absolute;right:-5px;top:-6px;display:none;min-width:16px;height:16px;padding:0 4px;border-radius:9px;background:#df4b4b;color:white;font:700 10px/16px sans-serif}.mwi-feedback-badge[data-count]:not([data-count="0"]){display:block}
    #${ROOT_ID}{position:fixed;inset:0;z-index:2147482600;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(4,6,12,.72);font-family:inherit;color:#e7e9f0}#${ROOT_ID}[hidden]{display:none}
    .mwi-feedback-modal{display:flex;flex-direction:column;width:min(760px,100%);max-height:min(820px,calc(100vh - 32px));overflow:hidden;border:1px solid #45516f;border-radius:9px;background:#171b2a;box-shadow:0 20px 60px rgba(0,0,0,.65)}
    .mwi-feedback-head{display:flex;align-items:center;padding:12px 15px;border-bottom:1px solid #343c55;background:#1d2336}.mwi-feedback-head h2{margin:0;font-size:16px}.mwi-feedback-close{margin-left:auto;width:30px;height:30px;border:0;border-radius:5px;background:transparent;color:#aab1c4;font-size:20px;cursor:pointer}.mwi-feedback-close:hover{background:#303950;color:white}
    .mwi-feedback-tabs{display:flex;border-bottom:1px solid #343c55}.mwi-feedback-tab{position:relative;flex:1;padding:10px;border:0;background:#191e2e;color:#aeb6ca;cursor:pointer}.mwi-feedback-tab[data-active="true"]{background:#252d45;color:#ffc65b;font-weight:700}.mwi-feedback-tab .mwi-feedback-badge{right:calc(50% - 52px);top:4px}
    .mwi-feedback-body{min-height:360px;overflow:auto;padding:16px}.mwi-feedback-view[hidden]{display:none}.mwi-feedback-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mwi-feedback-field{display:flex;flex-direction:column;gap:5px}.mwi-feedback-field.is-wide{grid-column:1/-1}.mwi-feedback-field span{font-size:12px;color:#c5cada}.mwi-feedback-field input,.mwi-feedback-field select,.mwi-feedback-field textarea,.mwi-feedback-reply textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #434e6c;border-radius:5px;background:#101522;color:#eef0f6;font:inherit}.mwi-feedback-field textarea{min-height:105px;resize:vertical}.mwi-feedback-bug-fields{display:contents}.mwi-feedback-bug-fields[hidden]{display:none}
    .mwi-feedback-drop{grid-column:1/-1;padding:13px;border:1px dashed #53607f;border-radius:6px;background:#121827;text-align:center;color:#9fa9c0;font-size:12px}.mwi-feedback-drop[data-drag="true"]{border-color:#f2ad3e;background:rgba(242,173,62,.09)}.mwi-feedback-drop button{margin-left:6px}.mwi-feedback-previews{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.mwi-feedback-preview{position:relative;width:112px;height:82px;border:1px solid #3f4964;border-radius:5px;overflow:hidden;background:#0e121d}.mwi-feedback-preview img{width:100%;height:100%;object-fit:cover}.mwi-feedback-preview button{position:absolute;right:3px;top:3px;width:21px;height:21px;padding:0;border:0;border-radius:50%;background:rgba(0,0,0,.72);color:white;cursor:pointer}
    .mwi-feedback-footer{display:flex;align-items:center;gap:10px;margin-top:13px}.mwi-feedback-quota{font-size:12px;color:#aeb5c7}.mwi-feedback-submit{margin-left:auto;padding:8px 17px;border:0;border-radius:5px;background:#d58b27;color:#17130c;font-weight:700;cursor:pointer}.mwi-feedback-submit:disabled{opacity:.48;cursor:not-allowed}.mwi-feedback-error{min-height:18px;margin-top:8px;color:#ff8f8f;font-size:12px}.mwi-feedback-success{color:#7ddc96}
    .mwi-feedback-list{display:grid;gap:8px}.mwi-feedback-card{padding:11px;border:1px solid #353f59;border-radius:6px;background:#131927;cursor:pointer}.mwi-feedback-card:hover{background:#1b2336}.mwi-feedback-card h3{margin:0 0 5px;font-size:13px}.mwi-feedback-card-meta{display:flex;gap:7px;align-items:center;color:#959fb8;font-size:11px}.mwi-feedback-status{padding:2px 6px;border-radius:4px;background:#55401c;color:#ffd06f}.mwi-feedback-status.processing{background:#193f58;color:#7ad9ff}.mwi-feedback-status.closed{background:#24452e;color:#84df9d}.mwi-feedback-empty{padding:35px;text-align:center;color:#8d97b0}.mwi-feedback-detail-back{margin-bottom:10px;border:0;background:transparent;color:#81b7ff;cursor:pointer}.mwi-feedback-detail h3{margin:0 0 5px}.mwi-feedback-copy{white-space:pre-wrap;word-break:break-word;line-height:1.5}.mwi-feedback-section{margin-top:12px;padding:11px;border:1px solid #343e58;border-radius:6px;background:#131825}.mwi-feedback-section h4{margin:0 0 7px;font-size:12px;color:#b8c0d3}.mwi-feedback-messages{display:grid;gap:7px}.mwi-feedback-message{padding:8px 10px;border-radius:5px;background:#20283b;border-left:3px solid #f1ae42}.mwi-feedback-message.admin{border-left-color:#68a8ff}.mwi-feedback-message time{display:block;margin-top:4px;color:#8993aa;font-size:10px}.mwi-feedback-actions{display:flex;gap:8px;margin-top:12px}.mwi-feedback-actions button{padding:7px 11px;border:1px solid #465273;border-radius:5px;background:#26314d;color:#e7ebf5;cursor:pointer}.mwi-feedback-reply{display:flex;gap:8px;margin-top:9px}.mwi-feedback-reply textarea{min-height:64px}.mwi-feedback-reply button{align-self:flex-end}.mwi-feedback-notice{margin-bottom:12px;padding:9px;border-radius:5px;background:rgba(64,127,199,.12);color:#b8d7fb;font-size:12px}
    @media(max-width:620px){#${ROOT_ID}{padding:6px}.mwi-feedback-modal{max-height:calc(100vh - 12px)}.mwi-feedback-body{padding:11px}.mwi-feedback-grid{grid-template-columns:1fr}.mwi-feedback-field.is-wide,.mwi-feedback-drop{grid-column:1}.mwi-feedback-reply{flex-direction:column}}
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

export class FeedbackPanel {
  constructor({ client, scope }) {
    this.client = client;
    this.scope = scope;
    this.files = [];
    this.fileUrls = new Map();
    this.serverImageUrls = new Set();
    this.items = [];
    this.unread = 0;
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
      <section class="mwi-feedback-modal" role="dialog" aria-modal="true" aria-label="${t("意见反馈", "Feedback")}">
        <header class="mwi-feedback-head"><h2>${t("意见反馈", "Feedback")}</h2><button type="button" class="mwi-feedback-close" aria-label="${t("关闭", "Close")}">×</button></header>
        <nav class="mwi-feedback-tabs"><button type="button" class="mwi-feedback-tab" data-tab="submit" data-active="true">${t("提交反馈", "Submit")}</button><button type="button" class="mwi-feedback-tab" data-tab="mine" data-active="false">${t("我的反馈", "My feedback")}<span class="mwi-feedback-badge" data-count="0">0</span></button></nav>
        <div class="mwi-feedback-body">
          <section class="mwi-feedback-view" data-view="submit"><div class="mwi-feedback-notice">${t("每个角色每个 UTC+8 自然周最多提交 2 条；编辑和留言不占额度。不会采集聊天、游戏消息正文或凭证。", "Up to 2 new reports per character each UTC+8 week. Edits and messages do not use quota. Chats, game message bodies, and credentials are never collected.")}</div>
            <form class="mwi-feedback-form"><div class="mwi-feedback-grid">
              <label class="mwi-feedback-field"><span>${t("类型", "Type")}</span><select name="type"><option value="bug">Bug</option><option value="feature">${t("功能建议", "Feature request")}</option><option value="other">${t("其他", "Other")}</option></select></label>
              <label class="mwi-feedback-field"><span>${t("标题", "Title")}</span><input name="title" maxlength="160" required></label>
              <label class="mwi-feedback-field is-wide"><span>${t("详细说明", "Details")}</span><textarea name="detail" maxlength="12000" required></textarea></label>
              <div class="mwi-feedback-bug-fields"><label class="mwi-feedback-field is-wide"><span>${t("复现步骤", "Steps to reproduce")}</span><textarea name="reproduction" maxlength="8000"></textarea></label><label class="mwi-feedback-field is-wide"><span>${t("预期结果", "Expected result")}</span><textarea name="expected" maxlength="8000"></textarea></label></div>
              <div class="mwi-feedback-drop"><span>${t("拖放或粘贴截图，也可以", "Drop or paste screenshots, or")}</span><button type="button" data-pick>${t("选择图片", "Choose images")}</button><div>${t("PNG / JPEG / WebP，最多 3 张，每张不超过 1MB", "PNG / JPEG / WebP, up to 3 images, 1MB each")}</div><input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden><div class="mwi-feedback-previews"></div></div>
            </div><div class="mwi-feedback-footer"><span class="mwi-feedback-quota">${t("正在查询本周额度…", "Checking weekly quota…")}</span><button type="submit" class="mwi-feedback-submit">${t("提交", "Submit")}</button></div><div class="mwi-feedback-error"></div></form>
          </section>
          <section class="mwi-feedback-view" data-view="mine" hidden><div class="mwi-feedback-list"></div><div class="mwi-feedback-detail" hidden></div><div class="mwi-feedback-error"></div></section>
        </div>
      </section>`;
    document.body.appendChild(this.root);
    this.form = this.root.querySelector(".mwi-feedback-form");
    this.fileInput = this.form.querySelector('input[type="file"]');
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
    this.scope.event(this.form.querySelector("[data-pick]"), "click", () =>
      this.fileInput.click(),
    );
    this.scope.event(this.fileInput, "change", () =>
      this.addFiles(this.fileInput.files),
    );
    const drop = this.form.querySelector(".mwi-feedback-drop");
    for (const name of ["dragenter", "dragover"]) {
      this.scope.event(drop, name, (event) => {
        event.preventDefault();
        drop.dataset.drag = "true";
      });
    }
    for (const name of ["dragleave", "drop"]) {
      this.scope.event(drop, name, (event) => {
        event.preventDefault();
        drop.dataset.drag = "false";
        if (name === "drop") this.addFiles(event.dataTransfer?.files);
      });
    }
    this.scope.event(this.root, "paste", (event) => {
      if (this.root.hidden) return;
      const images = [...(event.clipboardData?.files ?? [])].filter((file) =>
        ACCEPTED_IMAGE_TYPES.has(file.type),
      );
      if (images.length) {
        event.preventDefault();
        this.addFiles(images);
      }
    });
    this.scope.event(document, "keydown", (event) => {
      if (event.key === "Escape" && !this.root.hidden) this.close();
    });
    this.scope.add(() => this.destroy());
    this.toggleBugFields();
  }

  ensureButton() {
    const totalLevel = document.querySelector(
      'div[class*="Header_totalLevel"]',
    );
    if (!totalLevel?.parentElement) return null;
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.id = BUTTON_ID;
      button.innerHTML = `<span>✉</span><span>${t("意见反馈", "Feedback")}</span><span class="mwi-feedback-badge" data-count="0">0</span>`;
      this.scope.event(button, "click", () => this.open());
    }
    if (
      button.parentElement !== totalLevel.parentElement ||
      button.previousElementSibling !== totalLevel
    ) {
      totalLevel.insertAdjacentElement("afterend", button);
    }
    return button;
  }

  setUnread(count) {
    this.unread = Math.max(0, Number(count) || 0);
    for (const badge of document.querySelectorAll(
      `#${BUTTON_ID} .mwi-feedback-badge,#${ROOT_ID} .mwi-feedback-tab .mwi-feedback-badge`,
    )) {
      badge.dataset.count = String(this.unread);
      badge.textContent = String(this.unread);
    }
  }

  async open() {
    this.root.hidden = false;
    await this.refresh();
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
  }

  toggleBugFields() {
    this.form.querySelector(".mwi-feedback-bug-fields").hidden =
      this.form.elements.type.value !== "bug";
  }

  addFiles(files) {
    const error = this.form.querySelector(".mwi-feedback-error");
    try {
      const values = validateImageFiles(
        files,
        this.files.length + (this.editing?.attachments?.length ?? 0),
      );
      this.files.push(...values);
      error.textContent = "";
      this.renderPreviews();
    } catch (caught) {
      error.textContent = caught.message;
    } finally {
      this.fileInput.value = "";
    }
  }

  renderPreviews() {
    for (const value of this.fileUrls.values()) URL.revokeObjectURL(value);
    this.fileUrls.clear();
    const host = this.form.querySelector(".mwi-feedback-previews");
    host.replaceChildren();
    for (const attachment of this.editing?.attachments ?? []) {
      const preview = this.previewNode(null, attachment.name, () => {
        this.editing.attachments = this.editing.attachments.filter(
          (item) => item.id !== attachment.id,
        );
        this.renderPreviews();
      });
      host.append(preview);
      this.loadAttachmentImage(
        attachment.id,
        preview.querySelector("img"),
        true,
      );
    }
    this.files.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      this.fileUrls.set(file, url);
      host.append(
        this.previewNode(url, file.name, () => {
          this.files.splice(index, 1);
          this.renderPreviews();
        }),
      );
    });
  }

  previewNode(src, name, remove) {
    const box = makeElement("div", "mwi-feedback-preview");
    const image = document.createElement("img");
    image.alt = name;
    if (src) image.src = src;
    const button = makeElement("button", "", "×");
    button.type = "button";
    button.setAttribute("aria-label", t("移除图片", "Remove image"));
    button.addEventListener("click", remove, { once: true });
    box.append(image, button);
    return box;
  }

  formValue() {
    return {
      type: this.form.elements.type.value,
      title: this.form.elements.title.value.trim(),
      detail: this.form.elements.detail.value.trim(),
      reproduction: this.form.elements.reproduction.value.trim(),
      expected: this.form.elements.expected.value.trim(),
      context: feedbackContext(this.client),
    };
  }

  async submit(event) {
    event.preventDefault();
    const error = this.form.querySelector(".mwi-feedback-error");
    const button = this.form.querySelector(".mwi-feedback-submit");
    const value = this.formValue();
    if (!value.title || !value.detail) {
      error.textContent = t(
        "请填写标题和详细说明。",
        "Enter a title and details.",
      );
      return;
    }
    button.disabled = true;
    error.textContent = t("正在提交…", "Submitting…");
    try {
      if (this.editing) {
        await this.client.edit(
          this.editing.id,
          value,
          this.files,
          this.editing.attachments.map((item) => item.id),
        );
      } else {
        await this.client.submit(value, this.files);
      }
      this.resetForm();
      error.classList.add("mwi-feedback-success");
      error.textContent = t("已保存反馈。", "Feedback saved.");
      await this.refresh();
      this.showTab("mine");
    } catch (caught) {
      error.classList.remove("mwi-feedback-success");
      error.textContent = caught.message;
    } finally {
      button.disabled = false;
    }
  }

  resetForm() {
    this.form.reset();
    this.files = [];
    this.editing = null;
    this.form.querySelector(".mwi-feedback-submit").textContent = t(
      "提交",
      "Submit",
    );
    this.toggleBugFields();
    this.renderPreviews();
  }

  async refresh() {
    try {
      const result = await this.client.list();
      this.items = result.items ?? [];
      this.quota = result.quota;
      this.setUnread(result.unread ?? 0);
      this.renderQuota();
      if (this.currentDetailId && !this.root.hidden) {
        await this.openDetail(this.currentDetailId);
      } else {
        this.renderList();
      }
      return true;
    } catch (error) {
      this.root.querySelector(
        '[data-view="mine"] .mwi-feedback-error',
      ).textContent = error.message;
      return false;
    }
  }

  renderQuota() {
    const node = this.form.querySelector(".mwi-feedback-quota");
    node.textContent = this.quota
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
        STATUS_LABELS[item.status] ?? item.status,
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
        `${STATUS_LABELS[item.status] ?? item.status} · ${formatTime(item.updatedAt)}`,
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
      if (item.attachments?.length) {
        const section = makeElement("section", "mwi-feedback-section");
        section.append(makeElement("h4", "", t("截图", "Screenshots")));
        const gallery = makeElement("div", "mwi-feedback-previews");
        for (const attachment of item.attachments) {
          const preview = makeElement("button", "mwi-feedback-preview");
          preview.type = "button";
          const image = document.createElement("img");
          image.alt = attachment.name;
          preview.append(image);
          this.loadAttachmentImage(attachment.id, image, true);
          preview.addEventListener(
            "click",
            () => this.openFullImage(attachment.id),
            { once: true },
          );
          gallery.append(preview);
        }
        section.append(gallery);
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
    this.editing = { ...item, attachments: [...(item.attachments ?? [])] };
    this.files = [];
    for (const name of [
      "type",
      "title",
      "detail",
      "reproduction",
      "expected",
    ]) {
      this.form.elements[name].value = item[name] ?? "";
    }
    this.form.querySelector(".mwi-feedback-submit").textContent = t(
      "保存修改",
      "Save changes",
    );
    this.toggleBugFields();
    this.renderPreviews();
    this.renderQuota();
    this.showTab("submit");
  }

  async loadAttachmentImage(id, image, thumbnail) {
    try {
      const blob = await this.client.attachmentBlob(id, thumbnail);
      const url = URL.createObjectURL(blob);
      this.serverImageUrls.add(url);
      image.src = url;
    } catch {
      image.alt = t("图片加载失败", "Image failed to load");
    }
  }

  async openFullImage(id) {
    try {
      const blob = await this.client.attachmentBlob(id, false);
      const url = URL.createObjectURL(blob);
      this.serverImageUrls.add(url);
      globalThis.open(url, "_blank", "noopener");
    } catch {
      // Keep the game responsive when the private image request fails.
    }
  }

  destroy() {
    for (const value of this.fileUrls.values()) URL.revokeObjectURL(value);
    for (const value of this.serverImageUrls) URL.revokeObjectURL(value);
    this.fileUrls.clear();
    this.serverImageUrls.clear();
    document.getElementById(BUTTON_ID)?.remove();
    this.root?.remove();
    document.getElementById(STYLE_ID)?.remove();
  }
}

export const feedbackUiIds = { ROOT_ID, BUTTON_ID, STYLE_ID };
