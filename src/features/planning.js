import { runtime } from "../core/runtime.js";
import { itemName } from "../core/localization.js";

const procurement = runtime.api.procurement;
const planning = runtime.api.planning;

function t(zh, en) {
  return runtime.config.isZH ? zh : en;
}

function number(value) {
  return runtime.api.numberFormatter?.(value) ?? String(value ?? "—");
}

function exact(value) {
  return runtime.api.formatExactNumber?.(value) ?? String(value ?? "—");
}

function tail(value) {
  return (
    String(value ?? "")
      .split("/")
      .at(-1)
      ?.replaceAll("_", " ") ?? "—"
  );
}

function houseName(hrid) {
  return (
    runtime.data?.ZHOthersDic?.[hrid] ??
    runtime.state.initData_houseRoomDetailMap?.[hrid]?.name ??
    tail(hrid)
  );
}

function currentHouseLevel(hrid) {
  const map = runtime.state.initData_characterHouseRoomMap ?? {};
  return Math.max(
    0,
    Number(
      map[hrid]?.level ??
        Object.values(map).find((house) => house?.houseRoomHrid === hrid)
          ?.level,
    ) || 0,
  );
}

function maxHouseLevel(hrid) {
  const levels = Object.keys(
    runtime.state.initData_houseRoomDetailMap?.[hrid]?.upgradeCostsMap ?? {},
  )
    .map(Number)
    .filter((level) => Number.isFinite(level));
  return levels.length ? Math.max(...levels) : 0;
}

function goalLabel(goal) {
  return goal.kind === "house"
    ? houseName(goal.targetHrid)
    : itemName(goal.targetHrid);
}

function itemCandidates() {
  return Object.entries(runtime.state.initData_itemDetailMap ?? {})
    .filter(([hrid]) => hrid.startsWith("/items/"))
    .map(([hrid, detail]) => ({
      hrid,
      name: itemName(hrid),
      english: String(detail?.name ?? ""),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function resolveItemInput(value, candidates) {
  const query = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!query) return null;
  const normalized = procurement.normalizeItemHrid(query);
  return (
    candidates.find(
      (candidate) =>
        candidate.hrid.toLowerCase() === query ||
        candidate.hrid === normalized ||
        candidate.name.toLowerCase() === query ||
        candidate.english.toLowerCase() === query,
    ) ?? null
  );
}

function goalSources(ids, goals) {
  const byId = new Map(goals.map((goal) => [goal.id, goalLabel(goal)]));
  return ids.map((id) => byId.get(id) ?? id).join(t("、", ", "));
}

function createGoalEditor(body, rerender) {
  const editor = document.createElement("section");
  editor.className = "planning-editor";
  const mode = document.createElement("div");
  mode.className = "planning-mode";
  const itemButton = document.createElement("button");
  const houseButton = document.createElement("button");
  itemButton.type = houseButton.type = "button";
  itemButton.textContent = t("物品", "Item");
  houseButton.textContent = t("房屋", "House");
  let activeMode = "item";
  const form = document.createElement("div");
  form.className = "planning-form";
  const renderForm = () => {
    itemButton.dataset.active = String(activeMode === "item");
    houseButton.dataset.active = String(activeMode === "house");
    form.replaceChildren();
    const target = document.createElement(
      activeMode === "item" ? "input" : "select",
    );
    target.className = "planning-target-input";
    let candidates = [];
    if (activeMode === "item") {
      candidates = itemCandidates();
      const listId = `mwi-planning-items-${Date.now()}`;
      const list = document.createElement("datalist");
      list.id = listId;
      for (const candidate of candidates) {
        const option = document.createElement("option");
        option.value = candidate.name;
        option.label = `${candidate.english || candidate.name} · ${candidate.hrid}`;
        list.append(option);
      }
      target.setAttribute("list", listId);
      target.placeholder = t("搜索物品名称或 HRID", "Search item name or HRID");
      form.append(list);
    } else {
      for (const hrid of Object.keys(
        runtime.state.initData_houseRoomDetailMap ?? {},
      ).sort((left, right) =>
        houseName(left).localeCompare(houseName(right)),
      )) {
        const max = maxHouseLevel(hrid);
        if (!max) continue;
        const option = document.createElement("option");
        option.value = hrid;
        option.textContent = `${houseName(hrid)} · ${currentHouseLevel(hrid)} / ${max}`;
        target.append(option);
      }
    }
    const count = document.createElement(
      activeMode === "item" ? "input" : "select",
    );
    count.className = "planning-count-input";
    if (activeMode === "item") {
      count.type = "number";
      count.min = "1";
      count.step = "1";
      count.value = "1";
    }
    const renderHouseLevels = () => {
      if (activeMode !== "house") return;
      count.replaceChildren();
      const current = currentHouseLevel(target.value);
      const maximum = maxHouseLevel(target.value);
      for (let level = current + 1; level <= maximum; level += 1) {
        const option = document.createElement("option");
        option.value = String(level);
        option.textContent = `${t("等级", "Level")} ${level}`;
        count.append(option);
      }
      count.disabled = count.options.length === 0;
    };
    count.setAttribute(
      "aria-label",
      activeMode === "item"
        ? t("最终持有量", "Final quantity")
        : t("目标等级", "Target level"),
    );
    const add = document.createElement("button");
    add.type = "button";
    add.className = "planning-primary";
    add.textContent = t("加入规划", "Add");
    const submit = () => {
      const selected =
        activeMode === "item"
          ? resolveItemInput(target.value, candidates)?.hrid
          : target.value;
      const goal = selected
        ? planning.upsertGoal({
            kind: activeMode,
            targetHrid: selected,
            target: count.value,
          })
        : null;
      if (!goal) {
        target.setCustomValidity?.(
          t("请选择有效目标", "Choose a valid target"),
        );
        target.reportValidity?.();
        return;
      }
      rerender();
    };
    add.addEventListener("click", submit);
    target.addEventListener("change", renderHouseLevels);
    target.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
    });
    count.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
    });
    form.append(target, count, add);
    renderHouseLevels();
  };
  itemButton.addEventListener("click", () => {
    activeMode = "item";
    renderForm();
  });
  houseButton.addEventListener("click", () => {
    activeMode = "house";
    renderForm();
  });
  mode.append(itemButton, houseButton);
  editor.append(mode, form);
  body.append(editor);
  renderForm();
}

function renderGoals(body, goals, rerender) {
  const section = document.createElement("section");
  section.className = "planning-section";
  const heading = document.createElement("h3");
  heading.textContent = `${t("规划目标", "Planning goals")} · ${goals.length}`;
  section.append(heading);
  if (!goals.length) {
    const empty = document.createElement("div");
    empty.className = "planning-empty";
    empty.textContent = t(
      "添加物品最终持有量或房屋目标等级开始计算。",
      "Add an item holding target or house level to begin.",
    );
    section.append(empty);
  }
  for (const goal of goals) {
    const row = document.createElement("article");
    row.className = "planning-goal";
    row.dataset.enabled = String(goal.enabled);
    const current =
      goal.kind === "house"
        ? currentHouseLevel(goal.targetHrid)
        : procurement.getInventoryCount(goal.targetHrid, 0);
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = goal.enabled;
    toggle.title = t("启用目标", "Enable goal");
    toggle.addEventListener("change", () => {
      planning.updateGoal(goal.id, { enabled: toggle.checked });
      rerender();
    });
    const name = document.createElement("div");
    name.className = "planning-goal-name";
    name.textContent = goalLabel(goal);
    name.title = goal.targetHrid;
    const meta = document.createElement("span");
    meta.textContent = `${t("当前", "Current")} ${number(current)}`;
    const target = document.createElement("input");
    target.type = "number";
    target.min = "1";
    target.step = "1";
    target.value = String(goal.target);
    target.title =
      goal.kind === "house"
        ? t("目标等级", "Target level")
        : t("最终持有量", "Final quantity");
    target.addEventListener("change", () => {
      planning.updateGoal(goal.id, { target: target.value });
      rerender();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "planning-remove";
    remove.textContent = "×";
    remove.title = t("删除", "Remove");
    remove.addEventListener("click", () => {
      planning.removeGoal(goal.id);
      rerender();
    });
    row.append(toggle, name, meta, target, remove);
    section.append(row);
  }
  body.append(section);
}

function renderSteps(body, result, rerender) {
  const section = document.createElement("section");
  section.className = "planning-section";
  const heading = document.createElement("h3");
  heading.textContent = `${t("需要制作", "Production needed")} · ${result.steps.length}`;
  section.append(heading);
  if (!result.steps.length) {
    const empty = document.createElement("div");
    empty.className = "planning-empty";
    empty.textContent = t("当前没有需要制作的物品。", "Nothing to produce.");
    section.append(empty);
  }
  for (const step of result.steps) {
    const row = document.createElement("details");
    row.className = "planning-step";
    const summary = document.createElement("summary");
    const label = document.createElement("span");
    label.textContent = itemName(step.itemHrid);
    const counts = document.createElement("span");
    counts.textContent = `${t("需", "Need")} ${number(step.requiredOutput)} · ${t("预计", "Est.")} ${number(step.actionCount)} ${t("次", "actions")}`;
    const policy = document.createElement("button");
    policy.type = "button";
    policy.className = "planning-policy";
    const current = planning.getPolicy(step.itemHrid);
    policy.textContent =
      current === "acquire" ? t("直接获取", "Acquire") : t("制作", "Produce");
    policy.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      planning.setPolicy(
        step.itemHrid,
        current === "acquire" ? "produce" : "acquire",
      );
      rerender();
    });
    summary.append(label, counts, policy);
    const source = document.createElement("div");
    source.className = "planning-source";
    source.textContent = `${t("来源", "Sources")}: ${goalSources(step.sourceIds, result.goals)} · ${t("单次有效产出", "Effective output")} ${exact(step.outputCount)}`;
    row.append(summary, source);
    section.append(row);
  }
  body.append(section);
}

function renderMaterials(body, result, rerender) {
  const section = document.createElement("section");
  section.className = "planning-section";
  const heading = document.createElement("div");
  heading.className = "planning-section-heading";
  const title = document.createElement("h3");
  title.textContent = `${t("基础材料", "Base materials")} · ${result.materials.length}`;
  const addAll = document.createElement("button");
  addAll.type = "button";
  addAll.className = "planning-primary";
  const allAddable = result.materials.filter(
    (material) => material.purchasable && material.addableShortage > 0,
  );
  addAll.textContent = t("一键补齐", "Add all");
  addAll.disabled = !allAddable.length;
  addAll.addEventListener("click", () => {
    planning.addShortagesToCart(result.materials);
    rerender();
  });
  heading.append(title, addAll);
  section.append(heading);
  if (!result.materials.length) {
    const empty = document.createElement("div");
    empty.className = "planning-empty";
    empty.textContent = t(
      "当前没有基础材料需求。",
      "No base materials needed.",
    );
    section.append(empty);
  }
  for (const material of result.materials) {
    const row = document.createElement("details");
    row.className = "planning-material";
    row.dataset.missing = String(material.addableShortage > 0);
    const summary = document.createElement("summary");
    const name = document.createElement("span");
    name.className = "planning-material-name";
    name.textContent = material.name;
    name.title = material.itemHrid;
    const missing = document.createElement("strong");
    missing.textContent = material.addableShortage
      ? `${t("还需", "Need")} ${number(material.addableShortage)}`
      : t("已覆盖", "Covered");
    summary.append(name, missing);
    const grid = document.createElement("div");
    grid.className = "planning-material-grid";
    const metric = (label, value, sub = "") => {
      const cell = document.createElement("div");
      cell.innerHTML = `<span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ""}`;
      return cell;
    };
    grid.append(
      metric(t("规划需求", "Required"), number(material.required)),
      metric(
        t("库存", "Inventory"),
        number(material.owned),
        `${t("项目占用", "Project")} ${number(material.projectInventory)} · ${t("规划使用", "Planning")} ${number(material.inventoryUsed)}`,
      ),
      metric(
        t("购物车", "Cart"),
        number(material.cart.total),
        `${t("项目", "Project")} ${number(material.cart.project)} · ${t("规划", "Planning")} ${number(material.cart.planning)} · ${t("手工", "Manual")} ${number(material.cart.manual)}`,
      ),
      metric(t("仍需购买", "To buy"), number(material.addableShortage)),
    );
    const actions = document.createElement("div");
    actions.className = "planning-material-actions";
    const policy = document.createElement("button");
    policy.type = "button";
    policy.textContent =
      planning.getPolicy(material.itemHrid) === "acquire"
        ? t("改为制作", "Produce")
        : t("直接获取", "Acquire");
    policy.addEventListener("click", () => {
      planning.setPolicy(
        material.itemHrid,
        planning.getPolicy(material.itemHrid) === "acquire"
          ? "produce"
          : "acquire",
      );
      rerender();
    });
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = material.purchasable
      ? t("加入购物车", "Add to cart")
      : t("不可购买", "Not tradable");
    add.disabled = !material.purchasable || !material.addableShortage;
    add.addEventListener("click", () => {
      planning.addShortagesToCart([material]);
      rerender();
    });
    const source = document.createElement("span");
    source.textContent = `${t("来源", "Sources")}: ${goalSources(material.sourceIds, result.goals)}`;
    actions.append(policy, add, source);
    row.append(summary, grid, actions);
    section.append(row);
  }
  body.append(section);
}

export function renderPlanning(body, footer) {
  const rerender = () => renderPlanning(body, footer);
  body.replaceChildren();
  footer.replaceChildren();
  const result = planning.calculate();
  createGoalEditor(body, rerender);
  renderGoals(body, planning.getGoals(), rerender);
  renderSteps(body, result, rerender);
  renderMaterials(body, result, rerender);
  if (result.warnings.length) {
    const warning = document.createElement("div");
    warning.className = "planning-warning";
    warning.textContent = t(
      `有 ${result.warnings.length} 条链路出现循环或超过深度限制，已作为基础材料显示。`,
      `${result.warnings.length} paths contained a cycle or exceeded the depth limit and were shown as base materials.`,
    );
    body.append(warning);
  }
  footer.textContent = t(
    `规划 ${result.goals.length} 项 · 制作 ${result.steps.length} 项 · 基础材料 ${result.materials.length} 种`,
    `${result.goals.length} goals · ${result.steps.length} production steps · ${result.materials.length} base materials`,
  );
}

export function planningStyles() {
  return `
    .planning-editor,.planning-section{margin-bottom:10px;border:1px solid color-mix(in srgb,var(--line) 42%,transparent);border-radius:8px;background:color-mix(in srgb,var(--card) 72%,transparent)}
    .planning-mode{display:flex;padding:4px;gap:3px}.planning-mode button{flex:1;padding:6px;border-radius:5px;color:var(--muted);font-size:11px;font-weight:700}.planning-mode button[data-active="true"]{background:var(--accent);color:#fff}
    .planning-form{display:flex;gap:5px;padding:4px 8px 8px}.planning-form input,.planning-form select,.planning-goal input[type="number"]{min-width:0;height:30px;border:1px solid color-mix(in srgb,var(--line) 55%,transparent);border-radius:6px;background:color-mix(in srgb,var(--text) 6%,transparent);color:var(--text);outline:0;padding:4px 7px}.planning-target-input{flex:1}.planning-count-input{width:72px}.planning-primary{padding:6px 9px;border-radius:6px;background:var(--accent);color:#fff;font-size:11px;font-weight:700;white-space:nowrap}.planning-primary:disabled{opacity:.45;cursor:default}
    .planning-section>h3,.planning-section-heading{min-height:34px;padding:8px 10px;border-bottom:1px solid color-mix(in srgb,var(--line) 35%,transparent);color:var(--text);font-size:11.5px;font-weight:700}.planning-section-heading{display:flex;align-items:center;justify-content:space-between}.planning-section-heading h3{font-size:11.5px}.planning-empty{padding:14px 10px;color:var(--muted);font-size:11px;text-align:center}
    .planning-goal{display:grid;grid-template-columns:18px minmax(0,1fr) auto 68px 25px;align-items:center;gap:6px;padding:7px 8px;border-bottom:1px solid color-mix(in srgb,var(--line) 24%,transparent);font-size:11px}.planning-goal:last-child{border-bottom:0}.planning-goal[data-enabled="false"]{opacity:.52}.planning-goal-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);font-weight:600}.planning-goal>span{color:var(--muted);white-space:nowrap}.planning-goal input[type="number"]{width:68px;text-align:center}.planning-remove{width:25px;height:25px;border-radius:5px;color:#ff8d96;font-size:17px}.planning-remove:hover{background:rgba(224,90,100,.14)}
    .planning-step,.planning-material{border-bottom:1px solid color-mix(in srgb,var(--line) 25%,transparent)}.planning-step:last-child,.planning-material:last-child{border-bottom:0}.planning-step summary,.planning-material summary{display:flex;align-items:center;gap:8px;padding:8px;color:var(--text);font-size:11px;cursor:pointer}.planning-step summary>span:first-child,.planning-material-name{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.planning-step summary>span:nth-child(2){color:var(--muted);white-space:nowrap}.planning-policy,.planning-material-actions button{padding:5px 7px;border-radius:5px;background:color-mix(in srgb,var(--text) 7%,transparent);color:var(--muted);font-size:10px;font-weight:600}.planning-source{padding:0 9px 8px;color:var(--muted);font-size:10px}.planning-material[data-missing="true"] summary strong{color:#ffad62}.planning-material[data-missing="false"] summary strong{color:#43d17f}.planning-material summary strong{font-size:10px;white-space:nowrap}
    .planning-material-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;padding:0 8px 7px}.planning-material-grid>div{min-width:0;padding:5px;border-radius:5px;background:color-mix(in srgb,var(--text) 5%,transparent)}.planning-material-grid span,.planning-material-grid small{display:block;overflow:hidden;color:var(--muted);font-size:8.5px;text-overflow:ellipsis;white-space:nowrap}.planning-material-grid b{display:block;margin:2px 0;color:var(--gold);font-size:11.5px;font-variant-numeric:tabular-nums}.planning-material-actions{display:flex;align-items:center;gap:5px;padding:0 8px 8px}.planning-material-actions span{min-width:0;flex:1;overflow:hidden;color:var(--muted);font-size:9px;text-align:right;text-overflow:ellipsis;white-space:nowrap}.planning-material-actions button:disabled{opacity:.45;cursor:default}.planning-warning{margin:8px;padding:8px;border:1px solid rgba(255,173,98,.35);border-radius:6px;color:#ffad62;font-size:10px}
    @media(max-width:420px){.planning-form{flex-wrap:wrap}.planning-target-input{flex:1 1 calc(100% - 80px)}.planning-form .planning-primary{flex:1 1 100%}.planning-goal{grid-template-columns:18px minmax(0,1fr) 62px 25px}.planning-goal>span{display:none}.planning-material-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
}
