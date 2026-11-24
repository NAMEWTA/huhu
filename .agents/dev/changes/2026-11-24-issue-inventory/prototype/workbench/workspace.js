const agentWorkspaces = {
  oral: { name:"口述史", sessions:[
    { id:"pi-orals", name:"Pi", state:"运行中", model:"deepseek-v3", output:["$ pi", "已加载北岸口述史工作区", "共找到 31 份访谈记录。", "最近一次变更：修订第三批音频的索引。"] },
    { id:"codex-orals", name:"Codex", state:"等待输入", model:"gpt-5.4", output:["$ codex", "已经准备好匿名化检查。", "请选择要处理的样稿。"] },
  ], visible:["pi-orals"], active:"pi-orals", direction:"right", ratio:50 },
  publish: { name:"出版校对", sessions:[
    { id:"shell-publish", name:"终端", state:"运行中", model:"Shell", output:["$ npm run check", "开始核对图文排版", "交叉引用已经更新。"] },
    { id:"codex-publish", name:"Codex", state:"运行中", model:"gpt-5.4-mini", output:["$ codex", "准备复核发布前资料。"] },
  ], visible:["shell-publish"], active:"shell-publish", direction:"right", ratio:50 },
};
const agentUI = { space:"oral", expanded:new Set(["oral","publish"]), readerSize:13, observer:null };
const providerCatalog = {
  Codex:[{name:"gpt-5.4",efforts:["low","medium","high"]},{name:"gpt-5.4-mini",efforts:["low","medium"]}],
  Pi:[{name:"deepseek-v3",efforts:[]},{name:"claude-sonnet",efforts:["medium","high"]}],
  "终端":[{name:"Shell",efforts:[]}],
};

function selectSession(spaceID, sessionID) {
  const workspace = agentWorkspaces[spaceID];
  agentUI.space = spaceID;
  if (!workspace.visible.includes(sessionID)) workspace.visible[workspace.visible.indexOf(workspace.active)] = sessionID;
  workspace.active = sessionID;
  renderShell();
  by(`[data-global-session="${sessionID}"]`)?.focus();
}

function agentTree() {
  return `<h2>Spaces</h2><div class="workspace-tree">${Object.entries(agentWorkspaces).map(([key,group]) => `<details data-space-tree="${key}" ${agentUI.expanded.has(key) ? "open" : ""}><summary>${icon("Folder")} ${group.name}</summary>
  <nav aria-label="${group.name}会话">${group.sessions.map((session) => button(session.name, { name:"Terminal", className:"quiet nav-link", aria:`${group.name} / ${session.name}`, attrs:`data-tree-session="${session.id}" data-space="${key}" ${agentUI.space === key && group.active === session.id ? 'aria-current="page"' : ""}` })).join("")}</nav></details>`).join("")}</div>`;
}

function terminalPane(session, workspace) {
  return `<section class="terminal-pane ${workspace.active === session.id ? "active" : ""}" data-pane="${session.id}">
    <header class="bar"><button class="quiet small" type="button" data-focus-pane="${session.id}" aria-pressed="${workspace.active === session.id}">${icon("Terminal")} ${escapeHtml(session.name)}</button><small>${escapeHtml(session.state)}</small></header>
    <pre class="terminal-buffer" tabindex="0" aria-label="${escapeHtml(session.name)}终端输出">${session.output.map(escapeHtml).join("\n")}\n<span class="last-output">最后一行可见 · ${session.output.length} 行</span>\n<span class="term-cursor" aria-hidden="true"></span></pre>
    <footer class="bar"><span>${escapeHtml(workspace.name)} / ${escapeHtml(session.model)}</span><span data-term-size>计算内容尺寸…</span></footer>
  </section>`;
}

function splitTerminal(direction) {
  const workspace = agentWorkspaces[agentUI.space];
  let session = workspace.sessions.find(({ id }) => !workspace.visible.includes(id));
  if (!session) {
    session = { id:crypto.randomUUID(), name:"终端", model:"Shell", state:"运行中", output:["$ pwd", `/vault/${workspace.name}`] };
    workspace.sessions.push(session);
  }
  workspace.direction = direction;
  workspace.visible = ["left","up"].includes(direction) ? [session.id,workspace.active] : [workspace.active,session.id];
  workspace.active = session.id;
  renderShell();
}

function showAgent() {
  const workspace = agentWorkspaces[agentUI.space];
  agentUI.observer?.disconnect();
  const parts = workspace.visible.map((id) => terminalPane(workspace.sessions.find((session) => session.id === id), workspace));
  const axis = ["up","down"].includes(workspace.direction) ? "row" : "col";
  const divider = `<div class="split-handle" tabindex="0" role="separator" aria-label="调整终端分栏" aria-orientation="${axis === "row" ? "horizontal" : "vertical"}" aria-valuemin="25" aria-valuemax="75" aria-valuenow="${workspace.ratio}"></div>`;
  main.innerHTML = `<div class="agent-page stack">
    ${heading("Agent 工作区", "", button("启动 Agent", { name:"Plus", className:"primary", attrs:"id=launch-agent" }))}
    <nav class="global-sessions" aria-label="全局会话">${Object.entries(agentWorkspaces).flatMap(([key,group]) => group.sessions.map((session) => button(`${session.name} · ${group.name}`, { name:"Terminal", className:"quiet small", attrs:`data-global-session="${session.id}" data-space="${key}" aria-pressed="${key === agentUI.space && workspace.active === session.id}"` }))).join("")}</nav>
    <div class="bar agent-controls"><div class="row">
      ${[["left","向左"],["right","向右"],["up","向上"],["down","向下"]].map(([direction,label]) => button(label + "分栏", { className:"small", attrs:`data-split="${direction}"` })).join("")}
      ${button("收起分栏", { attrs:workspace.visible.length === 1 ? "id=hide-pane disabled" : "id=hide-pane", className:"small" })}
    </div><div class="row">${button("输出下一屏", { attrs:"id=term-output", className:"small" })}${button("放大字号", { attrs:"id=term-font", className:"small" })}</div></div>
    <div class="terminal-canvas" data-axis="${axis}" data-two="${parts.length > 1}" style="--split:${workspace.ratio}%;--term-size:${agentUI.readerSize}px">${parts.join(divider)}</div>
    </div>`;
  for (const nav of [main,menu]) {
    all("[data-global-session], [data-tree-session]",nav).forEach((entry) => entry.onclick = () => selectSession(entry.dataset.space, entry.dataset.globalSession || entry.dataset.treeSession));
  }
  all("[data-space-tree]", menu).forEach((entry) => entry.ontoggle = () => {
    if (entry.open) agentUI.expanded.add(entry.dataset.spaceTree);
    else agentUI.expanded.delete(entry.dataset.spaceTree);
  });
  all("[data-focus-pane]", main).forEach((entry) => entry.onclick = () => selectSession(agentUI.space, entry.dataset.focusPane));
  all("[data-split]", main).forEach((entry) => entry.onclick = () => splitTerminal(entry.dataset.split));
  const canvas = by(".terminal-canvas");
  const buffers = all(".terminal-buffer", canvas);
  const updatePreviewSize = (buffer) => {
    const { fontSize, lineHeight } = getComputedStyle(buffer);
    const rows = Math.max(1, Math.floor((buffer.clientHeight - 14) / parseFloat(lineHeight)));
    const cols = Math.max(1, Math.floor((buffer.clientWidth - 18) / (parseFloat(fontSize) * .61)));
    by("[data-term-size]", buffer.parentElement).textContent = `${rows} 行 × ${cols} 列（预览）`;
    buffer.scrollTop = buffer.scrollHeight;
  };
  agentUI.observer = new ResizeObserver((entries) => entries.forEach(({target}) => updatePreviewSize(target)));
  buffers.forEach((buffer) => agentUI.observer.observe(buffer));
  const resize = (ratio) => {
    workspace.ratio = Math.max(25, Math.min(75, ratio));
    canvas.style.setProperty("--split", `${workspace.ratio}%`);
    by(".split-handle", canvas)?.setAttribute("aria-valuenow", String(workspace.ratio));
  };
  const handle = by(".split-handle", canvas);
  if (handle) {
    handle.onkeydown = (event) => {
      if (!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) return;
      event.preventDefault(); resize(workspace.ratio + (["ArrowUp","ArrowLeft"].includes(event.key) ? -4 : 4));
    };
    handle.onpointerdown = (event) => {
      handle.setPointerCapture(event.pointerId);
      const box = canvas.getBoundingClientRect();
      handle.onpointermove = (next) => resize(axis === "row" ? 100 * (next.clientY-box.top) / box.height : 100 * (next.clientX-box.left) / box.width);
      handle.onpointerup = handle.onpointercancel = () => { handle.onpointermove = null; };
    };
  }
  bind("hide-pane", () => { workspace.visible = [workspace.active]; showAgent(); });
  bind("term-font", () => {
    agentUI.readerSize = agentUI.readerSize >= 17 ? 12 : agentUI.readerSize+1;
    canvas.style.setProperty("--term-size", `${agentUI.readerSize}px`);
    buffers.forEach(updatePreviewSize);
  });
  bind("term-output", () => {
    const session = workspace.sessions.find(({ id }) => id === workspace.active);
    session.output.push(...Array.from({ length:20 }, (_,i) => `已读取档案目录 · 索引 ${session.output.length+i+1}`));
    showAgent();
  });
  bind("launch-agent", openLauncher);
}

function openLauncher(event) {
  const invoker = event.currentTarget;
  const popup = document.createElement("div");
  popup.className = "launch-popover";
  popup.setAttribute("popover","auto");
  popup.setAttribute("aria-label","启动器");
  const size = invoker.getBoundingClientRect();
  popup.style.setProperty("--launch-top", `${size.bottom+5}px`);
  popup.style.setProperty("--launch-right", `${Math.max(8, innerWidth-size.right)}px`);
  popup.innerHTML = `<div class="stack launch-list"><h2>启动 Agent</h2>
    ${Object.keys(providerCatalog).map((name) => button(name, { name:"Terminal", className:"quiet", attrs:`data-provider="${name}"` })).join("")}
    ${button("管理 Agent", { name:"Settings2", className:"quiet", attrs:"id=agent-management" })}
    </div><form class="stack launch-config" hidden></form>`;
  document.body.append(popup);
  const form = by("form", popup);
  let active = "";
  let selected = "";
  const dismissModel = () => {
    form.hidden = true;
    popup.classList.remove("configuring");
    by(`[data-provider="${active}"]`,popup)?.focus();
    active = "";
  };
  const showModel = (provider, focus = false) => {
    if (active === provider) {
      if (focus) by("#model-search",popup)?.focus();
      return;
    }
    active = provider;
    selected = providerCatalog[provider][0].name;
    form.hidden = false;
    popup.classList.add("configuring");
    markCurrent(popup,"provider",active,(id) => showModel(id,true));
    form.innerHTML = `<div class="bar"><strong>${provider}</strong>${button("返回", { className:"small quiet", attrs:"id=close-launch-config" })}</div>
      ${field("搜索模型", '<input type="search" id="model-search">')}
      <div class="launch-models stack" id="models"></div>
      <div id="effort-settings"></div>
      ${provider === "终端" ? "" : field("启动提示（可选）",'<textarea id="launch-prompt" rows="2"></textarea>')}
      <button type="submit" class="primary">在${agentWorkspaces[agentUI.space].name}启动</button>`;
    const modelList = () => {
      const input = by("#model-search",popup).value.trim().toLowerCase();
      const matches = providerCatalog[provider].filter(({name}) => name.toLowerCase().includes(input));
      by("#models",popup).innerHTML = matches.map(({name}) => button(name, { className:"quiet small", attrs:`data-model="${name}"` })).join("") || '<small>没有匹配的模型。</small>';
      markCurrent(popup,"model",selected,(name) => { selected = name; modelList(); by(`[data-model="${name}"]`,popup)?.focus(); });
      const options = providerCatalog[provider].find(({name}) => name === selected).efforts;
      const previous = by("#effort-choice",popup)?.value;
      by("#effort-settings",popup).innerHTML = options.length ? field("推理档位", `<select id="effort-choice">${options.map((name) => option(name,name,previous)).join("")}</select>`) : "";
    };
    by("#model-search",popup).oninput = modelList;
    bind("close-launch-config", dismissModel, popup);
    modelList();
    if (focus) by("#model-search",popup).focus();
  };
  all("[data-provider]",popup).forEach((entry) => {
    entry.onclick = () => showModel(entry.dataset.provider,true);
    entry.onpointermove = (next) => {
      if (next.pointerType === "mouse" && (next.movementX || next.movementY)) showModel(entry.dataset.provider);
    };
    entry.onkeydown = (next) => {
      if (next.key === "ArrowRight") { next.preventDefault(); showModel(entry.dataset.provider,true); }
    };
  });
  popup.onkeydown = (next) => {
    if (next.key === "Escape" && !next.isComposing) {
      next.preventDefault();
      next.stopPropagation();
      if (active) dismissModel();
      else popup.hidePopover();
    }
  };
  popup.ontoggle = (next) => {
    if (next.newState === "closed") {
      popup.remove();
      invoker.focus();
    }
  };
  bind("agent-management", () => {
    popup.hidePopover();
    modal("可用 Agent", '<div class="dialog-body stack"><p>演示目录包含 Codex、Pi 和 Shell。真实模型和推理档位由已安装的 Agent 目录提供。</p></div><footer class="dialog-footer"><button type="button" data-close>关闭</button></footer>');
  }, popup);
  form.onsubmit = (next) => {
    next.preventDefault();
    const workspace = agentWorkspaces[agentUI.space];
    const id = crypto.randomUUID();
    const prompt = by("#launch-prompt",popup)?.value.trim();
    const effort = by("#effort-choice",popup)?.value;
    workspace.sessions.push({ id,name:active,model:selected,state:"运行中",output:[`已启动 ${selected}${effort ? ` · ${effort}` : ""}`, ...(prompt ? [prompt] : [])] });
    popup.hidePopover();
    selectSession(agentUI.space,id);
  };
  popup.showPopover();
  by("[data-provider]",popup)?.focus();
}
