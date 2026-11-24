const gateway = { enabled:true, port:9134, pending:9134, remote:false, pendingRemote:false, online:true, probe:"", token:"", permissions:new Set(["vault.info"]), chosen:new Set(), toolsMode:"ready", listenFault:false };
const syncSettings = { url:"https://git.example.test/teams/shoreline/archive/narratives/oral-history-vault.git", branch:"main", mode:"full", excludes:".huhu/cache/\n访谈原始录音/", initial:true };
const appearance = { size:14, density:"舒适", motion:"跟随系统" };
const safe = { open:true, entry:"research", step:0, account:"archive", revealed:null,
  entries:{
    research:{ name:"北岸口述史", domain:"archive.example.test", accounts:[
      { id:"editor", name:"项目编辑", login:"editor@shoreline.test", phone:"•••• 1204", email:"editor@example.test", note:"共享草稿管理。", fixture:"DEMO-EDITOR-012" },
      { id:"archive", name:"档案馆协作", login:"oral.history@archive.test", phone:"•••• 5302", email:"archive@example.test", note:"可以核对档案编号，勿用于公开投递。", fixture:"DEMO-ARCHIVE-462" },
      { id:"reader", name:"校对只读", login:"reader@shoreline.test", phone:"未填写", email:"proof@example.test", note:"仅查看校对清单。", fixture:"DEMO-READER-839" },
    ] },
    press:{ name:"出版校对", domain:"press.example.test", accounts:[
      { id:"press", name:"校对项目", login:"proof@example.test", phone:"未填写", email:"proof@example.test", note:"本周五提交校对意见。", fixture:"DEMO-PRESS-327" },
    ] },
  },
};

function endpointConfig() {
  return `${gateway.remote ? "https://workbench.example.test" : `http://127.0.0.1:${gateway.port}`}/mcp`;
}

function copyDemo(text, label, selected) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => setStatus(`${label}已复制。`), () => {
      selected?.focus();
      selected?.select();
      setStatus("已选中文本，可按 Ctrl+C 复制。");
    });
  } else {
    selected?.focus();
    selected?.select();
    setStatus(selected ? "已选中文本，可按 Ctrl+C 复制。" : "当前浏览器不允许复制。");
  }
}

function showGateway() {
  const endpoint = endpointConfig();
  const pending = gateway.pending !== gateway.port || gateway.pendingRemote !== gateway.remote;
  main.innerHTML = `<div class="module-container stack">
    ${heading("MCP 服务", "向外部应用提供 Streamable HTTP", button("工具授权", { name:"Wrench", attrs:'data-route="tools"' }))}
    <div class="two-up">
      <section class="card stack"><div class="bar"><h2>连接状态</h2>${badge(gateway.enabled && gateway.online ? "HTTP 已启用" : gateway.enabled ? "当前地址不可用" : "已停用", gateway.enabled && gateway.online ? "ok" : "warn")}</div>
      <label class="check"><input type="checkbox" id="mcp-enabled" ${gateway.enabled ? "checked" : ""}> 启用 MCP 服务</label>
      ${field("当前生效地址", `<input id="active-endpoint" readonly value="${endpoint}">`)}
      <div class="row">${button("复制生效地址", { name:"Copy", attrs:"id=copy-endpoint" })}${button(gateway.token ? "撤销演示令牌" : "生成演示令牌", { attrs:"id=token-action", className:"small" })}</div>
      ${gateway.token ? field("演示令牌",`<input id="mcp-token" readonly value="${gateway.token}">`) : ""}
      <details><summary>客户端 JSON 配置</summary><p>使用 URL 和对应 Vault 的授权。客户端无需安装 Huhu 命令。</p>
      <textarea readonly id="client-config" aria-label="客户端 JSON 配置" rows="9">${escapeHtml(JSON.stringify({ mcpServers: { huhu:{ url:endpoint, headers:{ Authorization: gateway.token ? `Bearer ${gateway.token}` : "Bearer <填入授权令牌>" } } } },null,2))}</textarea><div>${button("复制配置", { name:"Copy", attrs:"id=copy-client" })}</div></details>
      </section>
      <section class="card stack"><h2>监听设置</h2><form id="mcp-settings" class="stack">
      ${field("监听范围",`<select name="scope">${option("local","本机回环",gateway.pendingRemote ? "remote" : "local")}${option("remote","远程 HTTPS",gateway.pendingRemote ? "remote" : "local")}</select>`)}
      ${field("固定端口",`<input name="port" type="number" min="1024" max="65535" required value="${gateway.pending}">`)}
      <div class="notice ${pending ? "warn" : ""}" id="endpoint-message" role="status">${pending ? `等待重启生效 · 端口 ${gateway.pending}` : "当前使用以上监听设置。"}</div>
      <div class="row"><button class="primary" type="submit">保存配置</button>${button("模拟重启", { attrs:pending ? "id=restart-connection" : "id=restart-connection disabled" })}</div>
      </form></section>
    </div>
    <section class="card stack"><h2>客户端连接演练</h2><div class="row">${["正确令牌","错误令牌","其他 Vault"].map((name) => button(name,{className:"small",attrs:`data-client-test="${name}"`})).join("")}</div>
      <p class="meta" role="status">${escapeHtml(gateway.probe || "选择一个示例查看连接结果。")}</p></section></div>`;
  by("#mcp-enabled").onchange = (event) => { gateway.enabled = event.target.checked; showGateway(); };
  bind("copy-endpoint", () => copyDemo(endpoint, "生效地址", by("#active-endpoint")));
  bind("copy-client", () => copyDemo(by("#client-config").value, "客户端配置", by("#client-config")));
  bind("token-action", () => { gateway.token = gateway.token ? "" : "demo_vault_north_shore"; showGateway(); });
  by("#mcp-settings").onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const port = Number(data.get("port"));
    if ([2049,3659,4045,5060,5061,6000,6665,6666,6667,6668,6669,6697,10080].includes(port)) {
      by("#endpoint-message").textContent = "客户端限制使用该端口。请选择其他端口。";
      return;
    }
    gateway.pending = port;
    gateway.pendingRemote = data.get("scope") === "remote";
    showGateway();
  };
  bind("restart-connection", () => {
    if (gateway.listenFault) {
      by("#endpoint-message").textContent = "端口已被占用，实际生效地址保持不变。";
      return;
    }
    gateway.port = gateway.pending;
    gateway.remote = gateway.pendingRemote;
    showGateway();
    setStatus("已按保存的监听设置重新联通。");
  });
  all("[data-client-test]", main).forEach((entry) => entry.onclick = () => {
    gateway.probe = !gateway.enabled ? "404 · 服务已停用" : entry.dataset.clientTest === "其他 Vault" ? "拒绝 · 授权不属于当前 Vault" : entry.dataset.clientTest === "正确令牌" && gateway.token ? "连接成功 · 已列出授权工具" : "401 · 没有有效的授权令牌";
    showGateway();
  });
}

const toolCatalog = [
  { key:"vault.info", name:"查看 Vault 摘要", desc:"读取当前 Vault 的名称与可用能力。", group:"知识库", tone:"只读" },
  { key:"tasks.list", name:"查看任务列表", desc:"读取授权范围内的任务摘要。", group:"任务", tone:"只读" },
  { key:"ssh.list", name:"查看主机状态", desc:"仅限明确选择的主机，不包含登录凭据。", group:"SSH", tone:"需固定目标" },
  { key:"tasks.create", name:"创建任务", desc:"授权后仅允许在当前 Vault 创建指定类型的任务。", group:"任务", tone:"写入" },
];

function showTools() {
  const readOnly = gateway.toolsMode === "readonly";
  const available = gateway.toolsMode === "empty" ? [] : toolCatalog;
  const chosen = [...gateway.chosen].filter((key) => available.some((item) => item.key === key) && !(key === "ssh.list" && gateway.toolsMode === "disabled"));
  main.innerHTML = `<div class="module-container stack">
    ${heading("工具授权", "北岸研究室 · 外部 MCP 主体", button("返回 MCP", { name:"ArrowLeft", attrs:'data-route="gateway"' }))}
    ${readOnly ? '<p class="callout warn" role="status">当前连接为只读。可以查看已有授权。</p>' : ""}
    <div class="bar card"><div><h2>授权对象</h2><p class="meta">已选择 ${chosen.length} 项 · 已授权 ${gateway.permissions.size} 项</p></div><div class="row">
      ${button("授权选中", { name:"Check", className:"primary", attrs:!readOnly && chosen.length ? "id=grant-tools" : "id=grant-tools disabled" })}
      ${button("撤销选中", { className:"danger", attrs:!readOnly && chosen.some((key) => gateway.permissions.has(key)) ? "id=revoke-tools" : "id=revoke-tools disabled" })}
    </div></div>
    <section class="card stack"><ul class="list">${available.length ? available.map((item) => {
      const disabled = readOnly || (item.group === "SSH" && gateway.toolsMode === "disabled");
      return `<li><div class="bar"><label class="check"><input type="checkbox" data-tool="${item.key}" ${chosen.includes(item.key) ? "checked" : ""} ${disabled ? "disabled" : ""}><strong>${item.name}</strong></label><div class="row">${badge(item.tone)}${badge(gateway.permissions.has(item.key) ? "已授权" : "未授权", gateway.permissions.has(item.key) ? "ok" : "")}</div></div><p class="meta">${item.group} · ${item.desc}${disabled && !readOnly ? " SSH 模块未启用。" : ""}</p>
      ${item.group === "SSH" && !disabled ? '<label class="check tool-target"><input type="checkbox" id="ssh-target">允许样例主机 archive-preview</label>' : ""}</li>`;
    }).join("") : '<li class="empty">当前没有可配置的工具。</li>'}</ul></section></div>`;
  const savedTarget = gateway.target === true;
  const target = by("#ssh-target");
  if (target) { target.checked = savedTarget; target.onchange = () => { gateway.target = target.checked; }; }
  all("[data-tool]",main).forEach((entry) => entry.onchange = () => {
    if (entry.checked) gateway.chosen.add(entry.dataset.tool);
    else gateway.chosen.delete(entry.dataset.tool);
    showTools();
    by(`[data-tool="${entry.dataset.tool}"]`)?.focus();
  });
  bind("grant-tools", () => {
    const keys = chosen.filter((key) => key !== "ssh.list" || gateway.target);
    if (keys.length !== chosen.length) setStatus("请选择授权访问的 SSH 主机。");
    for (const key of keys) gateway.permissions.add(key);
    gateway.chosen.clear();
    showTools();
    if (keys.length === chosen.length) setStatus(`已授权 ${keys.length} 项。`);
  });
  bind("revoke-tools", () => confirmation("撤销工具授权", `这会使已选择的 ${chosen.filter((key) => gateway.permissions.has(key)).length} 项授权失效。`, "撤销授权", () => {
    chosen.forEach((key) => gateway.permissions.delete(key));
    gateway.chosen.clear(); showTools(); setStatus("授权已撤销。");
  }));
}

function showSync() {
  main.innerHTML = `<div class="module-container stack">
    ${heading("版本与同步", "", planLink("plan-git","管理周期同步"))}
    <form class="stack" id="sync-form"><div class="two-up"><section class="card stack"><h2>连接信息</h2>
    ${field("远端地址",`<input name="url" type="url" required value="${escapeHtml(syncSettings.url)}">`)}
    ${field("分支",`<input name="branch" required value="${escapeHtml(syncSettings.branch)}">`)}
    </section><section class="card stack"><h2>同步行为</h2>
    ${field("同步模式",`<select name="mode">${option("full","完整同步",syncSettings.mode)}${option("push","仅推送",syncSettings.mode)}${option("off","不自动同步",syncSettings.mode)}</select>`)}
    <p class="meta" id="sync-mode-note"></p></section></div>
    <section class="card stack"><h2>排除规则</h2>${field("每行一条规则",`<textarea name="excludes" rows="6">${escapeHtml(syncSettings.excludes)}</textarea>`)}</section>
    <div class="bar"><p class="meta" id="sync-saved" role="status"></p><button class="primary" type="submit">保存同步设置</button></div></form></div>`;
  const form = by("#sync-form");
  const explain = () => { by("#sync-mode-note").textContent = { full:"取得远端更新后提交并推送本地变更。发生冲突时保留两边记录。",push:"仅提交和推送本地变更。",off:"保留连接设置，需要时可以手动同步。" }[form.elements.mode.value]; };
  explain();
  form.elements.mode.onchange = explain;
  form.onsubmit = (event) => {
    event.preventDefault();
    Object.assign(syncSettings,Object.fromEntries(new FormData(form)));
    by("#sync-saved").textContent = "同步设置已保存。";
  };
}

function editSafeAccount(entry, account) {
  const dialog = modal(account ? "编辑账户" : "新增账户", `<form class="dialog-form"><div class="dialog-body stack">
    ${field("账户名称", `<input name="name" required maxlength="80" value="${escapeHtml(account?.name)}" autofocus>`)}
    ${field("登录账号", `<input name="login" required value="${escapeHtml(account?.login)}">`)}
    ${field("演示密码", '<input name="fixture" type="password" placeholder="留空保留原值">')}
    ${field("手机号", `<input name="phone" type="tel" value="${escapeHtml(account?.phone)}">`)}
    ${field("邮箱", `<input name="email" type="email" value="${escapeHtml(account?.email)}">`)}
    ${field("备注", `<textarea name="note">${escapeHtml(account?.note)}</textarea>`)}
    <p id="safe-form-error" class="meta" role="alert"></p>
    </div><footer class="dialog-footer"><button type="button" data-close>取消</button><button type="submit" class="primary">保存账户</button></footer></form>`);
  by("form",dialog).onsubmit=(event)=>{
    event.preventDefault();
    const data=Object.fromEntries(new FormData(event.currentTarget));
    if(!data.name.trim()||!data.login.trim())return;
    if(entry.accounts.some((item)=>item!==account&&item.login===data.login.trim())) {
      by("#safe-form-error",dialog).textContent="该登录账号已经存在。";
      return;
    }
    const result=account??{id:crypto.randomUUID(),fixture:"DEMO-NEW-ACCOUNT"};
    Object.assign(result,{...data,name:data.name.trim(),login:data.login.trim(),fixture:data.fixture||result.fixture});
    if(!account)entry.accounts.push(result);
    safe.account=result.id;
    safe.revealed=null;
    safe.step=2;
    dialog.close();
    showSafe();
    by("#safe-account-detail").focus();
  };
}

function showSafe() {
  if (!safe.open) {
    main.innerHTML = `<div class="stack">${heading("保险箱","") }<section class="card stack"><h2>保险箱已锁定</h2><p>解锁后查看演练数据。</p><div>${button("解锁示例保险箱", { name:"Lock", attrs:"id=unlock-safe", className:"primary" })}</div></section></div>`;
    bind("unlock-safe", () => { safe.open = true; safe.step = 0; showSafe(); });
    return;
  }
  const entry = safe.entries[safe.entry];
  const account = entry.accounts.find(({ id }) => id === safe.account);
  const shown = account?.id === safe.revealed;
  main.innerHTML = `<div class="module-container">
    ${heading("保险箱","",button("锁定", { name:"Lock", attrs:"id=lock-safe" }))}
    <div class="triple safe-columns">
      <section class="${safe.step === 0 ? "active-panel" : ""}"><h2>条目</h2><div class="stack">
      ${Object.entries(safe.entries).map(([key,item]) => button(item.name, { name:"Folder", className:"quiet nav-link", attrs:`data-safe-entry="${key}" aria-pressed="${key === safe.entry}"` })).join("")}</div></section>
      <section class="${safe.step === 1 ? "active-panel" : ""}">
        ${button("返回条目", { name:"ArrowLeft", className:"quiet narrow-back", attrs:"id=back-safe-entries" })}
        <h2>${entry.name}</h2><p class="meta">${entry.domain}</p><hr><div class="bar"><h3>账户 · ${entry.accounts.length}</h3>${button("新增账户",{name:"Plus",className:"small",attrs:"id=safe-add"})}</div><div class="stack">
        ${entry.accounts.map((item) => `<button type="button" class="list-button" data-safe-account="${item.id}" aria-pressed="${item === account}"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.login)} · <span aria-label="密码已遮罩">••••••••</span></small></button>`).join("")}</div>
      </section>
      <section class="${safe.step === 2 ? "active-panel" : ""}">${button("返回账户", { name:"ArrowLeft", className:"quiet narrow-back", attrs:"id=back-safe-accounts" })}
        <div class="stack" id="safe-account-detail" tabindex="-1"><h2>${escapeHtml(account?.name ?? "选择一个账户")}</h2>
        ${account ? `${field("账号",`<input readonly value="${escapeHtml(account.login)}">`)}
        ${field("密码",`<input id="safe-password" readonly aria-label="密码" type="${shown ? "text" : "password"}" value="${shown ? escapeHtml(account.fixture) : "00000000"}">`)}
        <div class="row">${button(shown ? "隐藏密码" : "显示密码", { name:"Eye", className:"small", attrs:"id=show-password" })}${button("复制密码", { name:"Copy", className:"small", attrs:"id=copy-password" })}</div>
        <dl><dt>手机号</dt><dd>${escapeHtml(account.phone||"未填写")}</dd><dt>邮箱</dt><dd>${escapeHtml(account.email||"未填写")}</dd><dt>备注</dt><dd>${escapeHtml(account.note||"未填写")}</dd></dl>
        <div class="row">${button("编辑账户",{className:"small",attrs:"id=safe-edit"})}${button("删除账户",{className:"small danger",attrs:"id=safe-delete"})}</div>` : ""}</div>
      </section></div></div>`;
  const selectEntry = (key) => { safe.entry = key; safe.account = safe.entries[key].accounts[0]?.id; safe.revealed = null; safe.step = 1; showSafe(); by("[data-safe-account]")?.focus(); };
  markCurrent(main,"safe-entry",safe.entry,selectEntry);
  markCurrent(main,"safe-account",safe.account,(key) => { safe.account = key; safe.revealed = null; safe.step = 2; showSafe(); by("#safe-account-detail").focus(); });
  bind("back-safe-entries", () => { safe.step=0; safe.revealed=null; showSafe(); by(`[data-safe-entry="${safe.entry}"]`)?.focus(); });
  bind("back-safe-accounts", () => { safe.step=1; safe.revealed=null; showSafe(); by(`[data-safe-account="${safe.account}"]`)?.focus(); });
  bind("lock-safe", () => { safe.open=false; safe.revealed=null; showSafe(); });
  bind("show-password", () => { safe.revealed = shown ? null : account.id; showSafe(); by("#show-password").focus(); });
  bind("copy-password", () => copyDemo(account.fixture,"演示密码", shown ? by("#safe-password") : null));
  bind("safe-add",()=>editSafeAccount(entry,null));
  bind("safe-edit",()=>editSafeAccount(entry,account));
  bind("safe-delete",()=>confirmation("删除账户",`从「${entry.name}」删除「${account.name}」。`,"删除账户",()=>{
    entry.accounts=entry.accounts.filter((item)=>item!==account);
    safe.revealed=null;
    safe.account=entry.accounts[0]?.id;
    safe.step=1;
    showSafe();
    by("[data-safe-account]")?.focus();
  }));
}

function showAppearance() {
  const currentMode = document.documentElement.dataset.mode;
  const current = document.documentElement.dataset.theme;
  const families = [["claude","Claude"],["apple","Apple"],["notion","Notion"],["vercel","Vercel"]];
  main.innerHTML = `<div class="module-container stack">${heading("外观","")}
    <section class="card stack"><div class="bar"><h2>主题预设</h2><div class="segments">${tab("浅色",currentMode==="light",'data-theme-mode="light"')}${tab("深色",currentMode==="dark",'data-theme-mode="dark"')}</div></div>
    <div class="theme-grid">${families.map(([key,label]) => `<button type="button" class="theme-card" aria-pressed="${key === current}" data-pick-theme="${key}">
      <div class="theme-picture" data-theme="${key}" data-mode="${currentMode}"><div></div><span><b></b><i></i><i></i></span></div><strong>${label}</strong></button>`).join("")}</div></section>
    <section class="card stack"><h2>字号与界面密度</h2>
      <div class="bar"><label for="text-size">界面字号</label><output id="text-size-value">${appearance.size} px</output></div>
      <input id="text-size" type="range" min="12" max="21" value="${appearance.size}">
      ${field("显示密度",`<select id="density">${["舒适","紧凑"].map((item)=>option(item,item,appearance.density)).join("")}</select>`)}
      ${field("动效",`<select id="motion">${["跟随系统","减少"].map((item)=>option(item,item,appearance.motion)).join("")}</select>`)}
    </section></div>`;
  markCurrent(main,"pick-theme",current,(name) => { theme(currentMode,name); showAppearance(); by(`[data-pick-theme="${name}"]`).focus(); });
  markCurrent(main,"theme-mode",currentMode,(mode) => { theme(mode,current); showAppearance(); by(`[data-theme-mode="${mode}"]`).focus(); });
  by("#text-size").oninput = (event) => {
    appearance.size=Number(event.target.value);
    document.documentElement.style.setProperty("--demo-font",`${appearance.size}px`);
    by("#text-size-value").value=`${appearance.size} px`;
  };
  by("#density").onchange = (event) => {
    appearance.density = event.target.value; document.documentElement.dataset.demoDensity = appearance.density === "紧凑" ? "compact" : "normal";
  };
  by("#motion").onchange = (event) => {
    appearance.motion = event.target.value; document.documentElement.dataset.demoMotion = appearance.motion === "减少" ? "reduced" : "system";
  };
}
