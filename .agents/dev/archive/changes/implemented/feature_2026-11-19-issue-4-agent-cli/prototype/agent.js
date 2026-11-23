"use strict";

const byId = id => document.getElementById(id);
const text = value => String(value ?? "").replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const button = (action, title, value = "", classes = "", disabled = false) =>
  `<button type="button" data-act="${action}" data-value="${text(value)}" class="${classes}" ${disabled ? "disabled" : ""}>${text(title)}</button>`;
const badge = (label, tone = "") => `<span class="pill ${tone}">${text(label)}</span>`;
const providers = {
  shell: { name: "PowerShell", detail: "本机 Shell · 可启动", state: "available" },
  codex: { name: "Codex", detail: "已安装 · 可启动", state: "available" },
  claude: { name: "Claude Code", detail: "已发现 · 版本未验证", state: "available" },
  pi: { name: "Pi", detail: "未找到 · 只读历史", state: "missing" }
};
const directions = { left: "向左", right: "向右", up: "向上", down: "向下" };
const labels = {
  shell: ["Shell 就绪", "info"], running: ["运行中", "ok"], waiting: ["等待处理", "warn"],
  done: ["已结束", ""], starting: ["启动中", "info"], failed: ["启动失败", "bad"],
  unknown: ["待核实", "warn"], empty: ["空窗格", ""], kept: ["原 Agent 已丢失", "warn"]
};
let state, clock = 0;
let launchAnchor, pendingDialog, drag;

const next = prefix => `${prefix}-${++clock}`;
function pane(id, provider, status, name, cwd) {
  return { id, provider, status, name, cwd, lines: [], pinned: false };
}
function makeTab(id, title, root) {
  return { id, title, root, focus: leaves(root)[0].id, zoom: null };
}
function initial() {
  const product = "D:/Huhu/产品工作台";
  const agent = pane("agent-review", "codex", "waiting", "发布周检与评审", product);
  agent.lines = ["已汇总 3 个待核对项目。", "是否将演示数据与正式发布时间表分开记录？"];
  return {
    space: "workspace-product", inspect: "session", transport: true, recent: [], recovered: [],
    historyQuery: "", historyScope: "current", historyFilter: "all", historyShown: 3, preview: null,
    providerEnabled: { pi: true, claude: true, codex: true, shell: true },
    message: "本机工作区已保存", spaces: [
      { id: "workspace-product", name: "产品与工程", path: product, selected: "tab-release", tabs: [
        makeTab("tab-release", "发布评审", {
          id: "initial-split", axis: "x", ratio: 55,
          first: pane("pane-shell", "shell", "shell", "PowerShell", product), second: agent
        }),
        makeTab("tab-notes", "发布说明与验收素材", pane("pane-empty", "shell", "empty", "空窗格", product))
      ] },
      { id: "workspace-service", name: "服务与接入", path: "D:/Huhu/服务与接入", selected: "tab-service",
        tabs: [makeTab("tab-service", "服务联调", pane("pane-service", "shell", "shell", "PowerShell", "D:/Huhu/服务与接入"))] },
      { id: "workspace-sandbox", name: "独立验收目录", path: "E:/演示工作区/独立验收", selected: "tab-sandbox",
        tabs: [makeTab("tab-sandbox", "验收终端", pane("pane-sandbox", "shell", "shell", "PowerShell", "E:/演示工作区/独立验收"))] }
    ], history: [
      { id: "h-live", space: "workspace-product", provider: "codex", name: "发布周检与评审", ref: "codex/demo-62b9", date: "11-19 09:41", live: "agent-review", preview: "已列出三条待核对的发布条件。" },
      { id: "h-release", space: "workspace-product", provider: "codex", name: "一次性发布说明和灰度验证", ref: "codex/demo-34c1", date: "11-18 17:20", preview: "从工作台导航核对了灰度入口，并记录了回退条件。" },
      { id: "h-claude", space: "workspace-product", provider: "claude", name: "整理用户反馈与改版范围", ref: "claude/demo-4bb0", date: "11-16 14:05", preview: "把三条反馈归到导航、详情和退出行为。" },
      { id: "h-pi", space: "workspace-product", provider: "pi", name: "工作台窄窗的历史笔记", ref: "pi/demo-2a91", date: "11-15 17:48", preview: "这份记录可读；模拟机器未找到 Pi。" },
      { id: "h-service", space: "workspace-service", provider: "codex", name: "联调排查与性能观察", ref: "codex/demo-34c1", date: "11-17 16:32", preview: "同一原生编号来自另一目录，归入服务与接入。" }
    ]
  };
}

const space = () => state.spaces.find(item => item.id === state.space);
const tab = () => space()?.tabs.find(item => item.id === space().selected);
const active = () => findNode(tab()?.root, tab()?.focus);
function leaves(node) {
  return !node ? [] : node.axis ? [...leaves(node.first), ...leaves(node.second)] : [node];
}
function findNode(node, id) {
  if (!node || node.id === id) return node;
  if (node.axis) return findNode(node.first, id) ?? findNode(node.second, id);
}
function modify(node, id, transform) {
  if (node.id === id) return transform(node);
  if (!node.axis) return node;
  const first = modify(node.first, id, transform);
  const second = modify(node.second, id, transform);
  return first && second ? { ...node, first, second } : first ?? second;
}
function located(id) {
  for (const owner of state.spaces) {
    for (const view of owner.tabs) {
      const node = findNode(view.root, id);
      if (node) return { owner, view, node };
    }
  }
}
function flatten(owner) {
  return owner.tabs.flatMap(view => leaves(view.root).map(node => ({ owner, view, node })));
}
function message(value) {
  state.message = value;
  byId("status").textContent = value;
}
function activate(owner, view, leaf) {
  state.space = owner.id;
  owner.selected = view.id;
  if (leaf) {
    view.focus = leaf.id;
    if (view.zoom) view.zoom = leaf.id;
  }
}
function statusPill(node) {
  return badge(...labels[node.status]);
}
function render() {
  const owner = space();
  const view = tab();
  const node = active();
  const groups = state.spaces.flatMap(flatten);
  const byStatus = { waiting: 0, done: 1, running: 2, kept: 3, unknown: 3, failed: 3, starting: 4 };
  byId("spaces").innerHTML = state.spaces.map(item => {
    const entries = flatten(item);
    const count = entries.filter(entry => entry.node.status === "waiting").length;
    return `<button type="button" class="nav-item" data-act="space" data-value="${item.id}" ${item === owner ? 'aria-current="true"' : ""}>
      <strong>${text(item.name)}</strong><small>${item.tabs.length} 个标签 · ${entries.length} 个窗格${count ? ` · ${count} 待处理` : ""}</small></button>`;
  }).join("") || `<p class="empty">还没有打开的工作区。</p>`;
  byId("recent").innerHTML = state.recent.map(item => button("reopen", item.name, item.id, "nav-item")).join("") || "<p>最近没有关闭的工作区。</p>";
  byId("agents").innerHTML = groups.filter(entry => entry.node.provider !== "shell" && entry.node.status !== "empty")
    .sort((a, b) => (byStatus[a.node.status] ?? 7) - (byStatus[b.node.status] ?? 7))
    .map(({ owner, node }) => `<button type="button" class="nav-item" data-act="locate" data-value="${node.id}">
      ${statusPill(node)} ${text(node.name)}<small>${text(owner.name)} · ${text(providers[node.provider].name)}</small></button>`).join("") || '<p class="muted">暂无 Agent 会话。</p>';
  byId("space-title").textContent = owner?.name ?? "工作区";
  byId("space-path").textContent = owner?.path ?? "打开或新建一个工作区";
  byId("space-facts").innerHTML = owner ? `${badge("本机")}${badge(state.transport ? "视图已连接" : "视图失联", state.transport ? "ok" : "warn")}${owner.id === "workspace-sandbox" ? badge("Vault 外 · 演示授权") : ""}` : "";
  for (const action of ["space-edit", "tab-left", "tab-right", "tab-close", "launch"]) {
    const staticButton = document.querySelector(`[data-act="${action}"]`);
    staticButton.disabled = !owner;
  }
  byId("tabs").innerHTML = (owner?.tabs ?? []).map(item =>
    `<button id="tab-button-${item.id}" type="button" role="tab" aria-controls="terminal-panel" aria-selected="${item === view}" tabindex="${item === view ? 0 : -1}" data-act="tab" data-value="${item.id}">${text(item.title)}</button>`).join("");
  if (view) byId("terminal-panel").setAttribute("aria-labelledby", `tab-button-${view.id}`);
  else byId("terminal-panel").removeAttribute("aria-labelledby");
  byId("pane-bar").innerHTML = `<div><h2>终端工作台</h2><small>${view ? `${leaves(view.root).length} 个窗格 · ${view.zoom ? "已放大当前窗格" : "当前标签"}` : "暂无标签"}</small></div>
    ${view ? `<div class="row">${button("zoom", view.zoom ? "恢复分栏" : "放大窗格", "", "", leaves(view.root).length === 1)}${button("pane-move", "调换窗格", "", "", leaves(view.root).length === 1)}</div>` : ""}`;
  byId("pane-tree").innerHTML = view ? renderNode(view.zoom ? node : view.root, view) :
    `<div class="empty">从侧栏新建或重开工作区。最近记录保留原标签布局。</div>`;
  document.querySelectorAll("#agent-inspector [data-act=inspect]").forEach(item =>
    item.setAttribute("aria-pressed", String(item.dataset.value === state.inspect)));
  renderInspect();
  byId("connection").textContent = state.transport ? "● 本机 · 模拟连接" : "○ 本机 · 视图失联";
  byId("status").textContent = state.message;
}

function renderNode(node, view) {
  if (node.axis) {
    return `<div class="branch ${node.axis}" style="--weight:${node.ratio}fr;--remainder:${100 - node.ratio}fr">${renderNode(node.first, view)}
      <div class="splitter" role="separator" tabindex="0" data-split="${node.id}" aria-label="调整窗格比例" aria-orientation="${node.axis === "x" ? "vertical" : "horizontal"}" aria-valuemin="20" aria-valuemax="80" aria-valuenow="${node.ratio}">${node.axis === "x" ? "⋮" : "⋯"}</div>
      ${renderNode(node.second, view)}</div>`;
  }
  const body = !state.transport ? `<p>连接已中断 · <strong>保留原终端</strong></p>` :
    node.status === "empty" ? "<p>选择 Shell 或 Agent，填充当前窗格。</p>" :
    node.status === "failed" ? "<p>启动失败 · resolver 未找到可执行文件。</p><p>已确认未创建终端，可按原启动意图重试。</p>" :
    node.status === "unknown" ? "<p>未收到启动回执。保留原启动身份，等待对账。</p>" :
    node.status === "starting" ? "<p>正在建立会话并等待启动回执…</p>" :
    `<p><strong>${text(node.status === "kept" ? "PowerShell · 保活恢复" : providers[node.provider].name)}</strong> <span>· ${text(node.cwd)}</span></p>
     ${node.lines.length ? node.lines.map(line => `<p>${text(line)}</p>`).join("") : "<p>PS&gt; <span aria-hidden='true'>▮</span></p>"}`;
  return `<article class="pane ${view.focus === node.id ? "active" : ""}" data-pane="${node.id}">
    <header class="pane-header row"><button type="button" class="subtle ellipsis" title="${text(node.name)}" data-act="focus" data-value="${node.id}" aria-pressed="${view.focus === node.id}">${text(node.name)}</button>
      ${statusPill(node)}${button("close-leaf", "关闭", node.id, "subtle")}</header>
    <div class="terminal mono">${body}</div>
    <div class="pane-controls row">
      ${node.status === "empty" ? button("launch", "＋ 填充窗格", `fill:${node.id}`, "primary", !state.transport) :
      Object.entries(directions).map(([key, title]) => button("launch", title, `${key}:${node.id}`, "subtle", !state.transport)).join("")}
      ${node.status === "failed" ? button("retry", "按原配置重试", node.id) : ""}
      ${node.status === "unknown" ? button("reconcile", "核对原启动", node.id) : ""}
    </div>
  </article>`;
}

function renderInspect() {
  const owner = space();
  const node = active();
  const area = byId("inspect-body");
  if (state.inspect === "history") {
    const query = state.historyQuery.toLowerCase();
    const rows = state.history.filter(item => (state.historyScope === "all" || item.space === owner?.id) &&
      (state.historyFilter !== "pinned" || item.pinned) &&
      (state.historyFilter !== "live" || located(item.live)) &&
      `${item.name} ${item.ref} ${providers[item.provider].name}`.toLowerCase().includes(query))
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.date.localeCompare(a.date));
    const renderRows = () => {
      const preview = state.history.find(item => item.id === state.preview);
      return `<div class="muted">已加载 ${Math.min(state.historyShown, rows.length)} / ${rows.length} 项</div>
        <ul class="clean">${rows.slice(0, state.historyShown).map(item => `<li class="list-item stack tight">
          <strong>${text(item.name)}</strong><small>${text(providers[item.provider].name)} · ${item.date} · ${text(state.spaces.find(group => group.id === item.space)?.name ?? "已关闭工作区")}</small>
          <div class="row">${button("history-preview", "预览", item.id)}${located(item.live) ? button("locate", "回到原现场", item.live) : ""}${button("history-pin", item.pinned ? "取消固定" : "固定", item.id, "subtle")}</div></li>`).join("")}</ul>
        ${!rows.length ? '<p class="empty">该范围暂无符合条件的会话。</p>' : ""}
        ${rows.length > state.historyShown ? button("history-more", "加载更多") : ""}
        ${preview ? `<article class="card stack tight"><h3>${text(preview.name)}</h3><code>${text(preview.ref)}</code><p>${text(preview.preview)}</p>
        ${preview.provider === "pi" ? '<p class="callout warn">未检测到 Pi，历史仅可预览。</p>' :
          `<div class="row">${button("history-launch", "恢复到这里", `${preview.id}:resume`, "primary", !node || !state.transport)}${button("history-launch", "分支为新标签", `${preview.id}:fork`, "", !owner || !state.transport)}</div>`}</article>` : ""}`;
    };
    if (!byId("history-query")) {
      area.innerHTML = `<h2>历史会话</h2>
        <div class="field"><label for="history-query">搜索会话</label><input id="history-query" type="search"></div>
        <div class="grid-two"><div class="field"><label for="history-scope">工作区范围</label><select id="history-scope"><option value="current">当前工作区</option><option value="all">全部工作区</option></select></div>
        <div class="field"><label for="history-filter">筛选</label><select id="history-filter"><option value="all">全部状态</option><option value="live">在现场</option><option value="pinned">已固定</option></select></div></div><div id="history-rows" class="stack tight"></div>`;
    }
    byId("history-query").value = state.historyQuery;
    byId("history-scope").value = state.historyScope;
    byId("history-filter").value = state.historyFilter;
    byId("history-rows").innerHTML = renderRows();
    return;
  }
  if (state.inspect === "files" || state.inspect === "changes") {
    const files = state.inspect === "files";
    area.innerHTML = `<h2>${files ? "文件" : "变更与评审"}</h2><p class="mono muted">${text(owner?.path ?? "选择一个工作区")}</p>
      ${owner ? `<article class="card stack tight"><strong>${files ? "发布说明.md" : "发布清单.md"}</strong><small>${files ? "资料 · 3.2 KB" : "+12 / −3 · 工作区改动"}</small>${button(files ? "mock-file" : "review", files ? "预览文件" : "发送模拟评审", "", "", !files && (!node || node.status === "empty" || !state.transport))}</article>` : ""}
      ${files && owner ? button("worktree", "查看可选 worktree") : ""}`;
    return;
  }
  const recovered = state.recovered.filter(item => item.owner === owner?.id);
  area.innerHTML = `<h2>会话现场</h2>${node ? `<article class="card stack tight"><div class="row between"><strong>${text(node.name)}</strong>${statusPill(node)}</div>
      <code>${text(node.cwd)}</code><small>窗格 ${text(node.id)}${node.intent ? ` · 启动 ${text(node.intent.id)}` : ""}</small>
      <div class="row">${button("observe", "只读查看", node.id, "", node.status === "empty")}${button("peek", "互动查看", node.id, "", node.status === "empty" || !state.transport)}${button("pin", node.pinned ? "取消固定现场" : "固定现场", node.id, "subtle", node.status === "empty")}</div>
      ${node.status === "waiting" ? '<p class="callout warn">Agent 正等候你的判断。互动查看可向这个模拟会话答复。</p>' : ""}</article>` :
    '<p class="empty">选择一个窗格以查看会话现场。</p>'}
    ${recovered.length ? `<div class="card stack tight"><h3>可找回的终端</h3>${recovered.map(item =>
      `<div>${text(item.node.name)} ${button("claim", "放入当前标签", item.node.id)}</div>`).join("")}</div>` : ""}
    ${button("settings", "Agent 启动设置")}`;
}

function openDialog(title, content, anchor = null) {
  const dialog = byId("editor");
  launchAnchor = anchor;
  byId("editor-title").textContent = title;
  byId("editor-body").innerHTML = content;
  dialog.classList.toggle("launch-dialog", Boolean(anchor));
  if (!dialog.open) dialog.showModal();
  if (anchor) positionDialog();
}
function positionDialog() {
  if (!launchAnchor) return;
  const dialog = byId("editor");
  const rect = launchAnchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, innerWidth - dialog.offsetWidth - 8));
  const top = rect.bottom + dialog.offsetHeight + 8 < innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - dialog.offsetHeight - 4);
  dialog.style.left = `${left}px`;
  dialog.style.top = `${top}px`;
}
function dialogForm(fields, submitLabel, formId) {
  return `<form id="${formId}" class="stack" aria-labelledby="editor-title">${fields}<div class="row actions">
    <button type="button" data-act="dismiss" ${formId === "confirm-form" ? "autofocus" : ""}>取消</button><button class="primary" type="submit">${submitLabel}</button></div></form>`;
}
function field(id, label, input) {
  return `<div class="field"><label for="${id}">${label}</label>${input}</div>`;
}
function openSpaceForm(edit) {
  const owner = edit ? space() : null;
  pendingDialog = { owner };
  openDialog(edit ? "工作区设置" : "新建工作区", dialogForm(
    field("space-name", "名称", `<input id="space-name" name="name" required autofocus value="${text(owner?.name)}">`) +
    field("workspace-dir", "工作目录（演示路径）", `<input id="workspace-dir" name="path" required value="${text(owner?.path ?? "D:/Huhu/")}">`) +
    (edit ? `<div class="row">${button("space-prev", "向前移动工作区")}${button("space-next", "向后移动工作区")}</div>` : ""),
    edit ? "保存设置" : "打开工作区", "space-form"));
}
function openLaunch(value, anchor, history = null, mode = null) {
  const [place, id] = value.split(":");
  const owner = space();
  const view = tab();
  const target = id ? findNode(view.root, id) : active();
  pendingDialog = { target, view, owner, place, history, mode };
  const title = place === "tab" ? "新建标签" : place === "fill" ? "填充窗格" : `${directions[place]}分栏`;
  const defaultAgent = history?.provider ?? "codex";
  const choices = Object.entries(providers).map(([key, info]) => {
    const available = info.state === "available" && state.providerEnabled[key] && (!history || key === history.provider);
    return `<label data-provider="${key}"><input type="radio" name="provider" value="${key}" ${key === defaultAgent && available ? "checked" : ""} ${available ? "" : "disabled"}>
      <span><strong>${text(info.name)}</strong><br><small>${text(!state.providerEnabled[key] ? "已停用" : info.detail)}</small></span></label>`;
  }).join("");
  openDialog(history ? `${mode === "fork" ? "分支" : "恢复"} · ${history.name}` : title, dialogForm(
    `<p class="muted">${text(owner.name)} / ${text(view.title)} · ${text(place === "tab" ? "新标签" : target.name)}</p>` +
    field("provider-search", "搜索 Shell 或 Agent", '<input type="search" id="provider-search" autocomplete="off" autofocus>') +
    `<fieldset><legend>启动项</legend><div class="launch-options">${choices}</div></fieldset>` +
    `<details><summary>模型、参数与目录</summary><div class="stack tight">
      ${field("agent-model", "模型", '<select id="agent-model" name="model"><option value="">使用 Agent 默认模型</option><option>平衡</option><option>深入推理</option></select>')}
      ${field("agent-args", "参数（演示文本）", '<input id="agent-args" name="args" placeholder="可选">')}
      ${field("agent-cwd", "明确指定目录（可选）", `<input id="agent-cwd" name="cwd" placeholder="${text(target?.cwd ?? owner.path)}">`)}</div></details>
      <div id="launch-error" class="error-text" role="alert"></div>`,
    history ? "确认启动会话" : "启动", "launch-form"), anchor);
}

function start(intent) {
  const simulation = state;
  const item = intent.node;
  item.status = "starting";
  const failure = intent.fault;
  if (failure === "stale") removeLeaf(intent.owner, intent.view, item.id);
  render();
  setTimeout(() => {
    if (state !== simulation) return;
    const result = located(item.id);
    if (!result) {
      item.status = item.provider === "shell" ? "shell" : "running";
      state.recovered.push({ owner: intent.owner.id, node: item });
      message(`目标已过期。原工作区「${intent.owner.name}」可找回已启动的终端 · ${intent.id}`);
    } else if (failure === "unknown" || failure === "fail") {
      item.status = failure === "unknown" ? "unknown" : "failed";
      message(`${failure === "unknown" ? "未收到启动确认" : "启动失败 · 已确认未创建"} · ${intent.id}`);
    } else {
      item.status = item.provider === "shell" ? "shell" : "running";
      item.lines = item.provider === "shell" ? [] : [intent.history ? `已${intent.mode === "fork" ? "分支" : "恢复"} ${intent.history.name}` : "交互会话已就绪。", "等待本机用户输入。"];
      message(`原位置已启动 ${item.name} · ${intent.id}`);
    }
    render();
  }, failure === "late" ? 3700 : 260);
}
function addLeaf(view, target, item, place) {
  if (place === "fill") {
    view.root = modify(view.root, target.id, () => item);
  } else {
    const first = place === "left" || place === "up";
    view.root = modify(view.root, target.id, old => ({
      id: next("split"), axis: ["left", "right"].includes(place) ? "x" : "y", ratio: 50,
      first: first ? item : old, second: first ? old : item
    }));
  }
  view.focus = item.id;
  view.zoom = null;
}
function removeLeaf(owner, view, id) {
  view.root = modify(view.root, id, () => null);
  if (!view.root) return removeTab(owner, view);
  if (view.focus === id) view.focus = leaves(view.root)[0].id;
  if (view.zoom === id) view.zoom = null;
}
function removeTab(owner, view) {
  const index = owner.tabs.indexOf(view);
  owner.tabs.splice(index, 1);
  if (!owner.tabs.length) {
    state.spaces = state.spaces.filter(item => item !== owner);
    owner.tabs.push(view.root ? view : makeTab(next("tab"), view.title, pane(next("pane"), "shell", "empty", "空窗格", owner.path)));
    state.recent.unshift(owner);
    if (state.space === owner.id) state.space = state.spaces[0]?.id;
  } else if (owner.selected === view.id) owner.selected = owner.tabs[Math.min(index, owner.tabs.length - 1)].id;
}
function archiveClosing(nodes, owner) {
  for (const node of nodes) {
    const history = state.history.find(item => item.live === node.id);
    if (history) history.live = null;
    if (!history && node.provider !== "shell" && ["running", "waiting", "done"].includes(node.status)) {
      state.history.unshift({ id: next("history"), space: owner.id, provider: node.provider, name: node.name,
        ref: `${node.provider}/demo-${node.id}`, date: "11-19 10:00", preview: node.lines.join(" ") });
    }
  }
}
function runLaunch(form) {
  const data = new FormData(form);
  const provider = data.get("provider");
  if (!provider) {
    byId("launch-error").textContent = "请选择当前机器可启动的 Shell 或 Agent。";
    return;
  }
  const explicit = data.get("cwd").trim();
  if (explicit && !/^[A-Z]:[\\/][^*?"<>|]+$/i.test(explicit)) {
    byId("launch-error").textContent = "目录不可用。请输入本机 Windows 绝对路径，或留空继承当前窗格目录。";
    byId("agent-cwd").focus();
    return;
  }
  const { owner, view, target, place, history, mode } = pendingDialog;
  const cwd = explicit || target?.cwd || owner.path;
  const item = pane(next("pane"), provider, "starting", history?.name ?? providers[provider].name, cwd);
  const fault = byId("fault").value;
  byId("fault").value = "normal";
  const intent = { id: next("launch"), owner, view, node: item, fault, history, mode, config: { cwd, model: data.get("model"), args: data.get("args") } };
  item.intent = intent;
  if (place === "tab") {
    const newTab = makeTab(next("tab"), item.name, item);
    owner.tabs.push(newTab);
    owner.selected = newTab.id;
    intent.view = newTab;
  } else addLeaf(view, target, item, place);
  byId("editor").close();
  message(`正在启动 ${item.name} · ${intent.id}`);
  start(intent);
}

function confirmAction(title, description, callback) {
  pendingDialog = { callback };
  openDialog(title, dialogForm(`<p>${text(description)}</p>`, "确认关闭", "confirm-form"));
}
function moveItem(items, item, delta) {
  const from = items.indexOf(item);
  const to = from + delta;
  if (from >= 0 && to >= 0 && to < items.length) [items[from], items[to]] = [items[to], items[from]];
}
function changeRatio(el, ratio) {
  const branch = findNode(tab().root, el.dataset.split);
  branch.ratio = Math.max(20, Math.min(80, Math.round(ratio)));
  el.setAttribute("aria-valuenow", branch.ratio);
  el.parentElement.style.setProperty("--weight", `${branch.ratio}fr`);
  el.parentElement.style.setProperty("--remainder", `${100 - branch.ratio}fr`);
  return branch.ratio;
}

document.addEventListener("click", event => {
  const control = event.target.closest("button[data-act]");
  if (!control) return;
  const { act, value = "" } = control.dataset;
  const owner = space(), view = tab(), node = active();
  const row = located(value);
  switch (act) {
    case "dismiss": byId("editor").close(); return;
    case "space": state.space = value; state.preview = null; break;
    case "space-new": openSpaceForm(false); return;
    case "space-edit": openSpaceForm(true); return;
    case "space-prev": case "space-next":
      moveItem(state.spaces, pendingDialog.owner, act === "space-prev" ? -1 : 1);
      message("工作区顺序已保存"); break;
    case "reopen": {
      const index = state.recent.findIndex(item => item.id === value);
      const [old] = state.recent.splice(index, 1);
      old.selected = old.tabs[0].id;
      state.spaces.push(old);
      state.space = old.id;
      message("已重开工作区布局。先前关闭的终端没有重启。");
      break;
    }
    case "tab": owner.selected = value; break;
    case "tab-left": case "tab-right":
      moveItem(owner.tabs, view, act === "tab-left" ? -1 : 1);
      message("标签顺序已保存"); break;
    case "focus": activate(row.owner, row.view, row.node); break;
    case "locate": activate(row.owner, row.view, row.node); state.inspect = "session"; break;
    case "zoom": view.zoom = view.zoom ? null : node.id; break;
    case "pane-move": {
      const options = leaves(view.root).filter(item => item !== node);
      pendingDialog = { source: node, view, options };
      openDialog("调换当前窗格的位置", dialogForm(field("swap", "与哪个窗格调换",
        `<select id="swap" name="target">${options.map(item => `<option value="${item.id}">${text(item.name)} · ${item.id}</option>`).join("")}</select>`), "调换", "move-form"));
      return;
    }
    case "launch":
      if (!state.transport) { message("视图失联。重新连接后再启动。"); return; }
      openLaunch(value, control); return;
    case "close-leaf": {
      const last = row.owner.tabs.length === 1 && leaves(row.view.root).length === 1;
      confirmAction("关闭窗格", `将关闭「${row.node.name}」的模拟终端。${last ? "这是最后一个标签，工作区将移到最近记录。" : ""}`, () => {
        archiveClosing([row.node], row.owner);
        removeLeaf(row.owner, row.view, row.node.id);
        message("终端已退出 · 布局已更新");
      });
      return;
    }
    case "tab-close": {
      const items = leaves(view.root);
      confirmAction("关闭标签", `此操作影响 ${items.length} 个窗格（${items.map(item => item.name).join("、")}）。${owner.tabs.length === 1 ? "这是最后一个标签，工作区将移到最近记录。" : ""}`, () => {
        archiveClosing(items, owner);
        for (const item of items) {
          item.status = "empty";
          item.name = "空窗格";
          item.lines = [];
          item.intent = null;
        }
        removeTab(owner, view);
        message("标签已关闭 · 模拟终端已退出");
      });
      return;
    }
    case "retry":
      if (!state.transport) { message("重新连接后再重试。"); return; }
      row.node.intent.fault = "normal";
      message(`重试原启动 · ${row.node.intent.id}`);
      start(row.node.intent); return;
    case "reconcile":
      if (!state.transport) { message("重新连接后再核对。"); return; }
      row.node.status = row.node.provider === "shell" ? "shell" : "running";
      row.node.lines = ["已确认同一进程和原启动身份。"];
      message(`已认领原终端 · ${row.node.intent.id}`); break;
    case "inspect": state.inspect = value; break;
    case "history-preview": state.preview = value; break;
    case "history-more": state.historyShown += 3; break;
    case "history-pin": {
      const entry = state.history.find(item => item.id === value);
      entry.pinned = !entry.pinned;
      break;
    }
    case "history-launch": {
      const [id, mode] = value.split(":");
      const entry = state.history.find(item => item.id === id);
      openLaunch(mode === "fork" ? "tab" : node.status === "empty" ? `fill:${node.id}` : `right:${node.id}`, control, entry, mode);
      return;
    }
    case "settings":
      openDialog("Agent 启动设置", dialogForm(Object.entries(providers).map(([key, info]) =>
        `<label class="check"><input type="checkbox" name="${key}" ${state.providerEnabled[key] ? "checked" : ""} ${key === "shell" ? "disabled" : ""}>${info.name} · ${info.detail}</label>`).join("") +
        `<p class="muted">演示工作台使用内存配置。授权环境只显示已配置状态。</p>`, "保存设置", "provider-form")); return;
    case "observe": case "peek":
      pendingDialog = { node: row.node };
      openDialog(act === "observe" ? "只读现场" : "互动现场",
        `<div class="stack"><div class="card mono">${text(row.node.cwd)}<br>${row.node.lines.map(text).join("<br>") || "等待会话输出"}</div>
        ${act === "observe" ? `<p class="callout info">仅观察会话输出。</p>` :
          ["waiting", "running", "shell", "kept"].includes(row.node.status) ? dialogForm(field("mock-input", "输入模拟文本", '<input id="mock-input" name="body" required autofocus>'), "发送模拟输入", "send-form") :
          `<p class="callout warn">此状态下输入不可用。</p>`}</div>`);
      return;
    case "pin": row.node.pinned = !row.node.pinned; break;
    case "mock-file":
      openDialog("发布说明.md", '<article class="card stack"><h3>发布准备</h3><p>已完成工作台导航核对。需要在发布前收集两条窄窗验收证据。</p></article>'); return;
    case "worktree":
      openDialog("工作区的 worktree", `<div class="stack"><p class="mono">${text(owner.path)}</p><p class="callout info">当前演示目录为主工作树。</p>${button("space-new", "打开另一个目录")}</div>`);
      return;
    case "review":
      if (node.status !== "waiting" && node.status !== "shell") { message("该会话当前占用输入，评审暂未发送。"); return; }
      node.lines.push("收到模拟评审 · 请补充工作台窄窗截图。");
      node.status = node.provider === "shell" ? "shell" : "running";
      message("评审已送至当前窗格"); break;
    case "claim": {
      const index = state.recovered.findIndex(item => item.node.id === value);
      const [item] = state.recovered.splice(index, 1);
      addLeaf(view, node, item.node, node.status === "empty" ? "fill" : "right");
      message("已将原终端放回工作区"); break;
    }
    case "transport":
      state.transport = !state.transport;
      control.textContent = state.transport ? "断开视图" : "重新连接视图";
      message(state.transport ? "已重连原终端，保留运行与布局" : "模拟视图断线，原终端继续运行");
      break;
    case "kept":
      if (!node || node.provider === "shell" || !["waiting", "running"].includes(node.status)) {
        message("请选择一个正在运行或等待的 Agent 窗格"); return;
      }
      node.status = "kept";
      node.lines = ["原 Agent 进程已丢失。现在是新的交互 Shell。"];
      message("保活已恢复 Shell · 原任务输入未重放"); break;
    case "conflict": message("布局更新冲突，已保留最后确认版本。"); break;
    case "reset":
      state = initial();
      clock = 0;
      byId("fault").value = "normal";
      document.querySelector('[data-act="transport"]').textContent = "断开视图";
      break;
    default: return;
  }
  render();
  if (!control.isConnected && ["space", "tab", "focus", "locate", "zoom", "history-preview", "history-pin", "pin"].includes(act)) {
    const replacement = [...document.querySelectorAll(`[data-act="${act}"]`)].find(item => item.dataset.value === value);
    replacement?.focus({ preventScroll: true });
  }
});

byId("editor").addEventListener("click", event => {
  if (event.target !== byId("editor") || !launchAnchor) return;
  const rect = event.target.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close();
});
byId("editor").addEventListener("close", event => {
  if (event.target.open) return;
  launchAnchor = null;
  event.target.style.removeProperty("left");
  event.target.style.removeProperty("top");
});
window.addEventListener("resize", positionDialog);
document.addEventListener("submit", event => {
  const form = event.target;
  event.preventDefault();
  const data = new FormData(form);
  if (form.id === "launch-form") { runLaunch(form); return; }
  if (form.id === "space-form") {
    const name = data.get("name").trim(), path = data.get("path").trim();
    if (!name || !/^[A-Z]:[\\/][^*?"<>|]*$/i.test(path)) {
      const field = byId(name ? "workspace-dir" : "space-name");
      field.setCustomValidity(name ? "请输入本机 Windows 绝对目录。" : "请输入工作区名称。");
      field.reportValidity();
      return;
    }
    const existing = state.spaces.find(item => item.path.toLowerCase() === path.toLowerCase());
    if (pendingDialog.owner) {
      if (existing && existing !== pendingDialog.owner) {
        byId("workspace-dir").setCustomValidity("该目录已在另一个工作区打开。");
        byId("workspace-dir").reportValidity();
        return;
      }
      Object.assign(pendingDialog.owner, { name, path });
      message("工作区设置已保存");
    } else if (existing) {
      state.space = existing.id;
      message("已切换到打开的工作区");
    } else {
      const initialTab = makeTab(next("tab"), "终端", pane(next("pane"), "shell", "shell", "PowerShell", path));
      const group = { id: next("space"), name, path, selected: initialTab.id, tabs: [initialTab] };
      state.spaces.push(group);
      state.space = group.id;
      message("已打开工作区并创建首个终端");
    }
  }
  if (form.id === "confirm-form") pendingDialog.callback();
  if (form.id === "provider-form") {
    for (const key of ["codex", "claude", "pi"]) state.providerEnabled[key] = data.has(key);
    message("Agent 可用性设置已保存");
  }
  if (form.id === "send-form") {
    const target = pendingDialog.node;
    const body = data.get("body").trim();
    if (!body) return;
    target.lines.push(`模拟输入：${body}`);
    if (target.status === "waiting") target.status = "running";
    message(`模拟输入已送达 ${target.name}`);
  }
  if (form.id === "move-form") {
    const { source, view, options } = pendingDialog;
    const target = options.find(item => item.id === data.get("target"));
    const swap = branch => branch.axis ? { ...branch, first: swap(branch.first), second: swap(branch.second) } :
      branch === source ? target : branch === target ? source : branch;
    view.root = swap(view.root);
    message("已调换窗格位置");
  }
  byId("editor").close();
  render();
});
document.addEventListener("input", event => {
  const input = event.target;
  if (input.id === "provider-search") {
    const query = input.value.trim().toLowerCase();
    document.querySelectorAll(".launch-options label").forEach(item => {
      item.hidden = !item.textContent.toLowerCase().includes(query);
      if (item.hidden) item.firstElementChild.checked = false;
    });
    positionDialog();
  }
  if (input.id === "history-query") { state.historyQuery = input.value; state.historyShown = 3; renderInspect(); }
  if (["workspace-dir", "space-name"].includes(input.id)) input.setCustomValidity("");
});
document.addEventListener("change", event => {
  if (event.target.id === "history-scope") { state.historyScope = event.target.value; state.preview = null; renderInspect(); }
  if (event.target.id === "history-filter") { state.historyFilter = event.target.value; renderInspect(); }
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !event.isComposing && event.target.id === "provider-search" && byId("editor").open) {
    event.preventDefault();
    byId("editor").close();
    return;
  }
  if (event.key === "Enter" && event.isComposing && event.target.closest("form")) { event.preventDefault(); return; }
  if (event.key === "Escape" && drag) {
    changeRatio(drag.el, drag.initial);
    drag = null; event.preventDefault(); return;
  }
  const el = event.target.closest("[data-split]");
  if (el && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    const ratio = Number(el.getAttribute("aria-valuenow"));
    const updated = changeRatio(el, ratio + (["ArrowLeft","ArrowUp"].includes(event.key) ? -5 : 5));
    message(`布局已保存 · 分栏比例 ${updated}%`);
    event.preventDefault();
    return;
  }
  const tabButton = event.target.closest("[role=tab]");
  if (tabButton && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    const all = [...byId("tabs").querySelectorAll("[role=tab]")];
    const current = all.indexOf(tabButton);
    const target = event.key === "Home" ? 0 : event.key === "End" ? all.length - 1 :
      (all.length + current + (event.key === "ArrowLeft" ? -1 : 1)) % all.length;
    all[target].click();
    event.preventDefault();
    return;
  }
  if (event.altKey && event.key.toLowerCase() === "n" && !byId("editor").open) {
    document.querySelector('[data-act="launch"]').click();
    event.preventDefault();
  }
});
byId("pane-tree").addEventListener("pointerdown", event => {
  const el = event.target.closest("[data-split]");
  if (!el || event.button !== 0) return;
  el.focus();
  el.setPointerCapture(event.pointerId);
  const rect = el.parentElement.getBoundingClientRect();
  const horizontal = el.parentElement.classList.contains("x") && innerWidth > 505;
  drag = { el, rect, horizontal, initial: Number(el.getAttribute("aria-valuenow")) };
});
byId("pane-tree").addEventListener("pointermove", event => {
  if (!drag) return;
  const { horizontal, rect } = drag;
  const ratio = horizontal ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height;
  changeRatio(drag.el, ratio * 100);
});
byId("pane-tree").addEventListener("pointerup", () => {
  if (!drag) return;
  message(`布局已保存 · 分栏比例 ${drag.el.getAttribute("aria-valuenow")}%`);
  drag = null;
});
byId("pane-tree").addEventListener("pointercancel", () => {
  if (drag) changeRatio(drag.el, drag.initial);
  drag = null;
});
byId("theme").addEventListener("change", event => {
  document.documentElement.dataset.theme = event.target.value;
});
byId("appearance").addEventListener("click", event => {
  const dark = document.documentElement.dataset.mode === "light";
  document.documentElement.dataset.mode = dark ? "dark" : "light";
  event.target.textContent = dark ? "浅色" : "深色";
  event.target.setAttribute("aria-label", dark ? "切换浅色外观" : "切换深色外观");
});
state = initial();
if (new URLSearchParams(location.search).get("pane") === "agent-review") {
  const target = located("agent-review");
  activate(target.owner, target.view, target.node);
}
render();

