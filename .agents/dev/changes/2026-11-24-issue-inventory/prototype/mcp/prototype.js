const kinds = { tool: "工具", resource: "资源", "resource-template": "资源模板", prompt: "提示" };
const transports = { stdio: "stdio", "streamable-http": "Streamable HTTP", sse: "HTTP + SSE（旧版）" };
const states = {
  ready: ["已连接", "success"], stopped: ["已停用", ""], offline: ["离线", "warning"], stale: ["目录已失效", "warning"],
  "needs-auth": ["需认证", "warning"], checking: ["正在检查", ""], "needs-approval": ["需本机执行许可", "warning"],
};
const authNames = { none: "无认证", environment: "环境变量引用", credential: "模块凭据", "credential-needed": "需重新绑定凭据", oauth: "OAuth" };
const list = [
  { id: "src-repo", name: "项目索引", namespace: "repo", transport: "stdio", command: "repo-mcp", args: ["serve"], cwd: "", env: {}, enabled: true, state: "ready", auth: "none", approved: true, rev: 1, checked: "2026-11-24 16:42", found: 4 },
  { id: "src-docs", name: "文档目录 · 工作账号", namespace: "docs", transport: "streamable-http", url: "https://docs.example.invalid/mcp", enabled: true, state: "needs-auth", auth: "oauth", rev: 1, checked: "2026-11-24 16:39", found: 0 },
  { id: "src-archive", name: "档案目录", namespace: "archive", transport: "sse", url: "https://archive.example.invalid/sse", enabled: true, state: "offline", auth: "environment", reference: "ARCHIVE_MCP_TOKEN", rev: 1, checked: "2026-11-24 15:20", found: 1 },
];
const items = [
  { source: "builtin", kind: "tool", key: "vault_info", raw: "vault.info", title: "Vault 概览", open: true },
  { source: "builtin", kind: "resource", key: "huhu://vault/summary", raw: "huhu://vault/summary", title: "Vault 摘要", open: true },
  { source: "builtin", kind: "resource-template", key: "huhu://notes/{id}", raw: "huhu://notes/{id}", title: "按 ID 读取笔记", open: true },
  { source: "builtin", kind: "prompt", key: "daily-review", raw: "daily-review", title: "每日回顾", open: true },
  { source: "src-repo", kind: "tool", key: "repo__search", raw: "search", title: "检索项目", open: true },
  { source: "src-repo", kind: "resource", key: "mcp-source://repo/current", raw: "repo://current", title: "项目摘要", open: false },
  { source: "src-repo", kind: "resource-template", key: "mcp-source://repo/items/{id}", raw: "repo://items/{id}", title: "按 ID 读取项目资料", open: false },
  { source: "src-repo", kind: "prompt", key: "repo__summarize", raw: "summarize", title: "汇总项目", open: false },
  { source: "src-archive", kind: "tool", key: "archive__search", raw: "search", title: "检索档案", open: true },
];
let revision = 1;
let nextId = 1;
let publish = true;
let pluginActive = true;
let access = "manage";
let nextSaveFails = false;
let selectedSource = "";
let sourceFilter = "all";
let kind = "tool";
let hostCredentials = true;
const get = (id) => list.find((source) => source.id === id);
const mutable = () => pluginActive && access === "manage";
const disabled = () => mutable() ? "" : "disabled";
const statusBadge = (source) => badge(...(states[source.state] ?? states.stopped));
const address = (source) => source.transport === "stdio" ? source.command : source.url;
const authBadge = (source) => badge(source.authReady ? "已绑定" : authNames[source.auth], source.authReady ? "success" : "");
const sortActions = (controls) => `<div class="action-strip">${controls}</div>`;
const textControl = (name, value = "", more = "") => `<input name="${name}" value="${escapeHtml(value)}" ${more}>`;
const stateChange = (message) => { revision++; renderShell(); setStatus(message); };
const sourceEntries = (id) => items.filter((item) => item.source === id);

function sidebar() {
  return `<div class="stack"><h2>MCP</h2>
    ${button("外部服务", { name: "Server", attrs: 'data-route="services"' })}
    ${button("能力目录", { name: "List", attrs: 'data-route="catalog"' })}
    <a href="../workbench/index.html#gateway">返回工作台接入中心</a></div>`;
}

function accessNotice() {
  if (!pluginActive) return `<p class="notice" role="status">MCP 管理插件已停用。请从插件中心重新启用配置管理。</p>`;
  if (access === "denied") return `<p class="notice" role="status">当前身份没有查看或管理 MCP 来源的权限。</p>`;
  if (access === "readonly") return `<p class="notice" role="status">Vault 以只读方式打开。可查看来源和脱敏配置。</p>`;
  return "";
}

function entryToolbar() {
  return `<section class="card stack" aria-label="MCP 对外服务">
    <div class="bar"><div><h2>MCP 对外服务</h2><p>Streamable HTTP · <code>/mcp</code></p></div>${badge(publish && pluginActive ? "开放中" : "已关闭", publish && pluginActive ? "success" : "")}</div>
    ${sortActions(button(publish ? "关闭对外服务" : "开启对外服务", { attrs: `id="toggle-publish" ${disabled()}` }) + button("查看 HTTP 客户端配置", { attrs: 'id="client-config"' }))}
  </section>`;
}

function showServices() {
  const allowed = pluginActive && access !== "denied";
  const actions = button("添加服务", { name: "Plus", attrs: `id="add-source" ${disabled()}` }) + button("导入 JSON", { name: "Upload", attrs: `id="import-sources" ${disabled()}` });
  main.innerHTML = heading("外部 MCP 服务", "将已授权的外部服务与 Huhu 内置能力发布到同一个接入入口。", actions) + accessNotice() + (allowed ? `<div class="stack">
    ${entryToolbar()}
    <section class="card stack" aria-label="服务列表"><div class="bar"><h2>服务</h2>${button("脱敏导出", { attrs: 'id="export-sources"' })}</div>
    ${list.length ? `<ul class="service-list">${list.map((source) => `<li class="service-row"><div class="service-copy">
        <div class="row"><strong>${escapeHtml(source.name)}</strong>${statusBadge(source)}</div>
        <p class="muted source-address">${transports[source.transport]} · ${escapeHtml(address(source))}</p>
        <p class="muted">${source.enabled ? "已启用" : "未启用"} · ${escapeHtml(source.checked || "尚未检查")} · 发现 ${source.found} · 选择开放 ${sourceEntries(source.id).filter((item) => item.open).length}</p>
      </div><div class="status-summary">${authBadge(source)}${button("详情", { attrs: `data-detail="${source.id}"`, aria: `查看 ${source.name}` })}</div></li>`).join("")}</ul>` : `<p>添加第一个服务，或导入现有客户端的配置。</p>`}
    </section></div>` : "");
  bind("add-source", () => sourceForm());
  bind("import-sources", () => importForm());
  bind("export-sources", exportSources);
  bind("toggle-publish", () => {
    publish = !publish;
    renderShell();
    setStatus(publish ? "对外服务已开启" : "对外服务已关闭，仍可配置与显式检查来源");
  });
  bind("client-config", () => modal("HTTP 客户端配置", `<div class="dialog-body stack"><pre class="config-sample">{ "url": "http://127.0.0.1:17940/mcp" }</pre><p>示例地址。真实连接使用当前生效地址和专用 Huhu 入站令牌。</p></div>`));
  all("[data-detail]", main).forEach((control) => control.onclick = () => {
    selectedSource = control.dataset.detail;
    openPage("details");
  });
}

function showDetails() {
  const source = get(selectedSource);
  if (!source || !pluginActive || access === "denied") {
    main.innerHTML = heading("服务详情", "") + accessNotice() + `<div class="card">${button("外部服务", { attrs: 'data-route="services"' })}</div>`;
    return;
  }
  const actions = button("编辑", { attrs: `id="edit-source" ${disabled()}` }) + button("删除", { attrs: `id="delete-source" ${disabled()}` });
  main.innerHTML = heading(escapeHtml(source.name), "外部 MCP 服务", actions) + accessNotice() + `<div class="service-layout">
    <section class="card stack">
      <div class="bar"><h2>连接</h2><div class="status-summary">${badge(source.enabled ? "已启用" : "未启用")} ${statusBadge(source)}</div></div>
      <dl><div class="definition-row"><dt>传输</dt><dd>${transports[source.transport]}</dd></div>
      <div class="definition-row"><dt>${source.transport === "stdio" ? "Engine 主机程序" : "远端 URL"}</dt><dd>${escapeHtml(address(source))}</dd></div>
      ${source.transport === "stdio" ? `<div class="definition-row"><dt>参数</dt><dd><code>${escapeHtml(JSON.stringify(source.args))}</code></dd></div>` : ""}
      <div class="definition-row"><dt>命名空间</dt><dd><code>${escapeHtml(source.namespace)}</code></dd></div>
      <div class="definition-row"><dt>配置修订</dt><dd>${source.rev}</dd></div>
      <div class="definition-row"><dt>最近检查</dt><dd>${escapeHtml(source.checked || "尚未检查")}</dd></div></dl>
      ${source.state === "offline" ? '<p role="status">上游离线。保留上次发现的目录供查看，暂停对外调用。</p>' : ""}
      ${source.state === "stale" ? '<p role="status">配置已更新，原目录不可用于调用。请重新检查连接。</p>' : ""}
      ${source.state === "needs-approval" ? '<p role="status">当前命令需要本机执行许可。</p>' : ""}
      ${source.checkResult ? `<p role="status">${escapeHtml(source.checkResult)}</p>` : ""}
      ${sortActions(button("检查连接", { attrs: `id="check-source" ${disabled()} ${source.state === "checking" ? "disabled" : ""}` }) +
        button(source.enabled ? "停用来源" : "启用来源", { attrs: `id="toggle-source" ${disabled()}` }) +
        (source.enabled ? button("重新连接", { attrs: `id="reconnect-source" ${disabled()}` }) : "") +
        (source.state === "ready" ? button("刷新目录", { attrs: `id="refresh-source" ${disabled()}` }) : ""))}
    </section>
    <section class="card stack"><div class="bar"><h2>认证与本机许可</h2>${authBadge(source)}</div>
      <p>${source.auth === "none" ? "此连接未配置上游认证。" : source.reference ? `引用 · <code>${escapeHtml(source.reference)}</code>` : "此来源需要完成认证绑定。"}<\/p>
      ${source.transport === "stdio" ? button(source.approved ? "撤销本机许可" : "核对命令并授权", { attrs: `id="approve-source" ${disabled()}` }) :
        source.auth === "oauth" ? button(source.authReady ? "注销 OAuth" : "登录 OAuth", { attrs: `id="start-auth" ${disabled()}` }) :
        source.auth !== "none" ? button("绑定认证", { attrs: `id="start-auth" ${disabled()}` }) : ""}</section>
    <section class="card stack"><div class="bar"><h2>能力目录</h2><span>已发现 ${source.found} 项</span></div>
      ${button("查看此来源的目录", { attrs: 'id="open-source-catalog"' })}</section>
    </div>`;
  bind("edit-source", () => sourceForm(source));
  bind("delete-source", () => confirmation("删除来源", `将撤下 ${sourceEntries(source.id).filter((item) => item.open).length} 个公开条目和此服务的认证绑定。`, "删除来源", () => {
    list.splice(list.indexOf(source), 1);
    for (const item of sourceEntries(source.id)) items.splice(items.indexOf(item), 1);
    openPage("services");
    stateChange("来源已删除");
  }));
  bind("check-source", () => check(source));
  bind("reconnect-source", () => check(source));
  bind("refresh-source", () => check(source));
  bind("toggle-source", () => {
    source.enabled = !source.enabled;
    source.rev++;
    source.state = source.enabled ? "stale" : "stopped";
    source.checkResult = "";
    stateChange(source.enabled ? "来源已启用，请检查连接" : "来源已停用");
  });
  bind("start-auth", () => authentication(source));
  bind("approve-source", () => confirmation("本机执行许可", source.approved ? "撤销后，当前命令无法再启动。" : `确认允许 Engine 主机初始化 ${source.command} ${JSON.stringify(source.args)}，并访问其已开放条目。`, source.approved ? "撤销许可" : "授予许可", () => {
    source.approved = !source.approved;
    source.state = source.enabled ? (source.approved ? "stale" : "needs-approval") : "stopped";
    stateChange(source.approved ? "已记录当前配置的本机许可" : "已撤销本机许可");
  }));
  bind("open-source-catalog", () => { sourceFilter = source.id; openPage("catalog"); });
}

function check(source) {
  source.state = "checking";
  source.checkResult = "";
  const checkedRevision = source.rev;
  renderShell();
  setStatus("正在检查来源");
  setTimeout(() => {
    if (!get(source.id) || checkedRevision !== source.rev || !pluginActive || source.state !== "checking") return;
    const outcome = source.transport === "stdio" && !source.approved ? "needs-approval"
      : source.id === "src-archive" ? "offline" : source.auth !== "none" && !source.authReady ? "needs-auth" : "ready";
    if (outcome === "ready" && source.id.startsWith("src-new-") && !source.url?.endsWith("/empty") && !sourceEntries(source.id).length) {
      items.push({ source: source.id, kind: "tool", key: source.namespace + "__check_status", raw: "check_status", title: "查看示例服务状态", open: false });
      source.found = 1;
      revision++;
    }
    source.checked = "刚刚";
    source.state = outcome === "ready" && !source.enabled ? "stopped" : outcome;
    source.checkResult = outcome === "ready" ? `检查成功 · 临时连接已释放 · 发现 ${source.found} 项` : "检查结束 · " + states[outcome][0];
    renderShell();
    setStatus(source.checkResult);
  }, 300);
}

function signature(source) {
  return JSON.stringify(source.transport === "stdio"
    ? [source.transport, source.command, source.args, source.cwd, source.env]
    : [source.transport, source.url, source.auth, source.reference || "", source.headers ?? {}]);
}

function plainHeaders(headers) {
  if (!headers || Array.isArray(headers) || typeof headers !== "object") return false;
  return Object.entries(headers).every(([key, value]) => /^[A-Za-z0-9-]+$/.test(key) && !/authorization|cookie|token|secret|api[-_]?key/i.test(key)
    && typeof value === "string" && !/[\r\n]/.test(value));
}

function parseUrl(value) {
  try { return new URL(value); }
  catch { return null; }
}

function decodeDraft(input) {
  const { name, namespace, transport } = input;
  if (!name.trim() || !/^[a-z][a-z0-9_-]{0,31}$/.test(namespace)) throw Error("请输入名称和有效的命名空间。");
  if (!Object.hasOwn(transports, transport)) throw Error("此传输类型不受支持。");
  if (transport === "stdio") {
    if (typeof input.command !== "string" || !input.command.trim()) throw Error("请输入 Engine 主机上的命令。");
    if (!Array.isArray(input.args) || input.args.some((value) => typeof value !== "string")) throw Error("参数须为 JSON 字符串数组。");
    if (!input.env || Array.isArray(input.env) || typeof input.env !== "object" || Object.entries(input.env).some(([key, value]) =>
      typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value))) throw Error("环境变量必须映射到显式变量名。");
    return { name, namespace, transport, command: input.command, args: input.args, cwd: input.cwd || "", env: input.env, auth: "none" };
  }
  const url = parseUrl(input.url);
  if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error("请输入无用户信息、query 或 fragment 的 HTTP(S) 地址。");
  if (!Object.hasOwn(authNames, input.auth)) throw Error("认证方式不受支持。");
  if (input.auth === "oauth" && transport !== "streamable-http") throw Error("OAuth 仅用于 Streamable HTTP。");
  if (input.auth === "environment" && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.reference ?? "")) throw Error("请输入有效的环境变量名。");
  if (!plainHeaders(input.headers)) throw Error("请检查非秘密 header 的 JSON，认证 header 需要单独绑定。");
  return { name, namespace, transport, url: url.href, auth: input.auth, reference: input.reference || "", headers: input.headers };
}

function saveDraft(draft, previous) {
  if (!previous) {
    list.push({ ...draft, id: `src-new-${nextId++}`, enabled: false, state: "stopped", approved: false, rev: 1, found: 0 });
    return;
  }
  const changed = signature(draft) !== signature(previous);
  if (changed) {
    for (const key of ["command", "args", "cwd", "env", "url", "reference", "headers"]) delete previous[key];
    previous.state = previous.enabled ? "stale" : "stopped";
    previous.authReady = false;
    previous.approved = false;
    previous.checkResult = "";
  }
  Object.assign(previous, draft);
  previous.rev++;
}

function sourceForm(previous) {
  const original = previous ?? { transport: "stdio", auth: "none" };
  const openedAt = revision;
  const dialog = modal(previous ? "编辑服务" : "添加服务", `<form class="stack" id="source-form">
    <div class="dialog-body source-form">
      ${field("服务名称", textControl("name", original.name, "required autofocus"))}
      ${field("稳定命名空间", textControl("namespace", original.namespace, previous ? "readonly required" : "required"))}
      ${field("传输", `<select name="transport">${Object.entries(transports).map(([key, label]) => option(key, label, original.transport)).join("")}</select>`)}
      <div id="transport-fields" class="source-form"></div>
      <p class="form-error" role="alert" hidden></p>
    </div><footer class="dialog-footer">${button("取消", { attrs: "data-close" })}<button type="submit" class="primary">保存配置</button></footer>
  </form>`, { wide: true });
  const form = by("#source-form", dialog);
  const transport = by('[name="transport"]', form);
  const content = by("#transport-fields", form);
  const renderFields = () => {
    content.innerHTML = transport.value === "stdio" ? `
      ${field("命令", textControl("command", original.command, "required"))}
      ${field("参数（JSON 数组）", `<textarea name="args">${escapeHtml(JSON.stringify(original.args ?? []))}</textarea>`)}
      ${field("工作目录", textControl("cwd", original.cwd))}
      ${field("环境变量引用（JSON）", `<textarea name="env">${escapeHtml(JSON.stringify(original.env ?? {}))}</textarea>`)}
      <p class="muted inline-note">命令在 Engine 所在主机运行，检查前须明确授权。</p>` : `
      ${field("远端 URL", textControl("url", original.url, 'type="url" required'))}
      ${field("非秘密 header（JSON）", `<textarea name="headers">${escapeHtml(JSON.stringify(original.headers ?? {}))}</textarea>`)}
      ${field("认证方式", `<select name="auth">${Object.entries(authNames).filter(([key]) => key !== "credential-needed" && (key !== "oauth" || transport.value === "streamable-http")).map(([key, label]) =>
        option(key, label, original.auth === "credential-needed" ? "credential" : original.auth)).join("")}</select>`)}
      <div id="auth-reference"></div>`;
    const auth = by('[name="auth"]', content);
    if (!auth) return;
    const showReference = () => { by("#auth-reference", content).innerHTML = auth.value === "environment" ? field("环境变量名", textControl("reference", original.reference, "required")) : ""; };
    auth.addEventListener("change", showReference);
    showReference();
  };
  transport.addEventListener("change", renderFields);
  renderFields();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(form));
      if (values.transport === "stdio") {
        try { values.args = JSON.parse(values.args); values.env = JSON.parse(values.env); }
        catch { throw Error("请检查参数数组和环境变量引用的 JSON 格式。"); }
      } else {
        try { values.headers = JSON.parse(values.headers); }
        catch { throw Error("请检查 header 的 JSON 格式。"); }
      }
      values.name = values.name.trim();
      values.namespace = values.namespace.trim();
      const draft = decodeDraft(values);
      if (openedAt !== revision) throw Error("配置发生变化，请关闭并重新打开编辑。");
      if (list.some((source) => source !== previous && (source.namespace === draft.namespace || source.name === draft.name))) throw Error("服务名称或命名空间已存在。");
      if (nextSaveFails) { nextSaveFails = false; throw Error("模拟保存失败，已保留表单内容，可重试。"); }
      saveDraft(draft, previous);
      dialog.close();
      stateChange(previous ? "服务配置已保存" : "已添加停用的服务");
    } catch (error) { showError(form, error.message); }
  });
}

function showError(root, message) {
  const error = by(".form-error", root);
  error.hidden = !message;
  error.textContent = message;
}

function authentication(source) {
  if (source.auth === "oauth" && source.authReady) {
    confirmation("注销 OAuth", "注销将取消当前账号认证，来源需重新检查。", "确认注销", () => {
      source.authReady = false;
      source.state = "needs-auth";
      source.rev++;
      stateChange("已注销 OAuth");
    });
    return;
  }
  const oauth = source.auth === "oauth";
  const environment = source.auth === "environment";
  const canBind = environment || oauth || hostCredentials;
  const dialog = modal(oauth ? "OAuth 登录" : "绑定认证", `<form id="auth-form" class="stack"><div class="dialog-body source-form">
    <p>${oauth ? `浏览器登录范围绑定到 ${escapeHtml(source.url)}。本原型用示例回调模拟成功或过期。`
      : environment ? `Engine 将在运行时读取 <code>${escapeHtml(source.reference)}</code>。`
      : hostCredentials ? "凭据由当前宿主保存，列表和脱敏导出仅显示绑定状态。" : "当前宿主无法保存模块凭据。可使用环境变量引用。"}<\/p>
    ${oauth || environment || !hostCredentials ? "" : field("示例令牌", '<input name="secret" type="password" autocomplete="off" required>')}
    ${oauth ? field("示例回调结果", '<select name="outcome"><option value="success">成功</option><option value="expired">已过期</option></select>') : ""}
    <p class="form-error" role="alert" hidden></p></div>
    <footer class="dialog-footer">${button("取消", { attrs: "data-close" })}<button type="submit" class="primary" ${canBind ? "" : "disabled"}>${oauth ? "模拟回调" : "确认绑定"}</button></footer></form>`);
  const form = by("#auth-form", dialog);
  const openedAt = source.rev;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (oauth && new FormData(form).get("outcome") === "expired") return showError(form, "此次登录已过期。重新选择回调结果可演示再次登录。");
    if (source.rev !== openedAt) return showError(form, "来源配置已更新，请重新开始绑定。");
    source.authReady = true;
    if (source.auth === "credential-needed") source.auth = "credential";
    source.rev++;
    source.state = source.enabled ? "stale" : "stopped";
    dialog.close();
    stateChange("认证已绑定，请检查连接");
  });
}

const exampleImport = {
  mcpServers: {
    repo: { command: "repo-mcp", args: ["serve", "--index"], name: "项目索引" },
    local: { command: "fixture-mcp", args: ["serve"], env: { ACCESS: "${LOCAL_MCP_TOKEN}" } },
    notes: { url: "https://notes.example.invalid/mcp", headers: { Authorization: "Bearer sample-secret" } },
    broken: { command: "fixture-mcp", url: "https://broken.example.invalid/mcp", args: 12 },
  },
};

function importRows(value) {
  if (!value || !value.mcpServers || Array.isArray(value.mcpServers) || typeof value.mcpServers !== "object" || !Object.keys(value.mcpServers).length) {
    throw Error("请输入包含 mcpServers 对象的 JSON。");
  }
  const names = new Set();
  return Object.entries(value.mcpServers).map(([key, row], index) => {
    const item = { id: index, key, action: "skip" };
    try {
      if (!row || typeof row !== "object" || Array.isArray(row) || Boolean(row.command) === Boolean(row.url)) throw Error("每条来源须填写命令或远端 URL 之一。");
      const name = typeof row.name === "string" ? row.name.trim() : key;
      const existing = list.find((entry) => entry.namespace === key);
      if (names.has(name) || list.some((entry) => entry.name === name && entry !== existing)) throw Error("名称重复。");
      const transport = row.transport ?? row.type ?? (row.command ? "stdio" : "streamable-http");
      if ((transport === "stdio") !== Boolean(row.command)) throw Error("传输与配置字段冲突。");
      const rawEnv = row.env ?? {};
      if (!rawEnv || Array.isArray(rawEnv) || typeof rawEnv !== "object") throw Error("环境变量须为 JSON 对象。");
      const env = {};
      let secret = !plainHeaders(row.headers ?? {});
      for (const [variable, raw] of Object.entries(rawEnv)) {
        const reference = typeof raw === "string" && /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(raw);
        if (reference) env[variable] = reference[1];
        else secret = true;
      }
      const url = row.url ? parseUrl(row.url) : null;
      if (url?.search || url?.username || url?.password) secret = true;
      if (secret) throw Error("包含凭据或需核对的 header，请先用环境引用或清除敏感内容。");
      item.draft = decodeDraft({ name, namespace: key, transport, command: row.command, args: row.args ?? [], cwd: row.cwd, env, url: row.url, auth: row.auth ?? "none", reference: row.reference, headers: row.headers ?? {} });
      item.existing = existing;
      item.action = existing ? "skip" : "create";
      names.add(name);
    } catch (error) { item.error = error.message; }
    return item;
  });
}

function importForm() {
  const dialog = modal("导入 MCP 配置", `<form id="import-form" class="stack"><div class="dialog-body source-form">
    ${field("mcpServers JSON", '<textarea name="config" rows="8" required autofocus spellcheck="false"></textarea>')}
    ${button("填入示例", { attrs: 'id="import-example"' })}
    <div id="import-preview" aria-live="polite"></div>
    <p class="form-error" role="alert" hidden></p>
    </div><footer class="dialog-footer">${button("取消", { attrs: "data-close" })}<button type="submit" id="make-preview" class="primary">预览导入</button>
    ${button("提交所选变更", { className: "primary", attrs: 'id="commit-import" disabled' })}</footer></form>`, { wide: true });
  const form = by("#import-form", dialog);
  const config = by('[name="config"]', form);
  const preview = by("#import-preview", form);
  const commit = by("#commit-import", form);
  let plan;
  function invalidate() {
    if (!plan) return;
    plan = undefined;
    commit.disabled = true;
    preview.textContent = "配置文本有变化，请重新预览。";
  }
  config.addEventListener("input", invalidate);
  bind("import-example", () => { config.value = JSON.stringify(exampleImport, null, 2); invalidate(); }, dialog);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      let input;
      try { input = JSON.parse(config.value); } catch { throw Error("JSON 格式无效。"); }
      plan = { revision, rows: importRows(input) };
      preview.innerHTML = `<h3>预览结果</h3><ul class="import-table">${plan.rows.map((row) => `<li><strong>${escapeHtml(row.key)}</strong>
        ${row.error ? `<p class="muted">${escapeHtml(row.error)}</p>` : field(`处理 ${row.key}`,
          `<select data-entry="${row.id}">${option("skip", "跳过", row.action)}${row.existing ? option("update", "更新现有来源", row.action) : option("create", "添加停用来源", row.action)}</select>`)}
        </li>`).join("")}</ul>`;
      commit.disabled = !plan.rows.some((row) => !row.error);
      showError(form, "");
    } catch (error) {
      invalidate();
      showError(form, error.message);
    }
  });
  commit.addEventListener("click", () => {
    if (!plan || plan.revision !== revision) return showError(form, "来源已变化，请重新预览。");
    const selected = all("[data-entry]", form).filter((entry) => entry.value !== "skip").map((entry) => plan.rows[Number(entry.dataset.entry)]);
    if (!selected.length) return showError(form, "请选择要添加或更新的有效来源。");
    if (nextSaveFails) { nextSaveFails = false; return showError(form, "模拟提交失败，已保留预览和选择。"); }
    selected.forEach((row) => saveDraft(row.draft, row.existing));
    dialog.close();
    stateChange(`已提交 ${selected.length} 项来源变更`);
  });
}

function exportSources() {
  const mcpServers = Object.fromEntries(list.map((source) => [source.namespace, source.transport === "stdio"
    ? { name: source.name, transport: source.transport, command: source.command, args: source.args, cwd: source.cwd,
        env: Object.fromEntries(Object.entries(source.env).map(([key, reference]) => [key, "${" + reference + "}"])) }
    : { name: source.name, transport: source.transport, url: source.url, headers: source.headers ?? {}, auth: source.auth === "credential" ? "credential-needed" : source.auth,
        ...(source.auth === "environment" ? { reference: source.reference } : {}) }]));
  const dialog = modal("脱敏导出", `<div class="dialog-body"><pre class="config-sample">${escapeHtml(JSON.stringify({ mcpServers }, null, 2))}</pre></div>
    <footer class="dialog-footer">${button("下载 JSON", { attrs: 'id="download-json"' })}</footer>`, { wide: true });
  bind("download-json", () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ mcpServers }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "huhu-mcp-redacted.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, dialog);
}

function availability(item) {
  if (!publish) return ["对外服务已关闭", ""];
  if (item.source === "builtin") return ["沿用能力权限", ""];
  const source = get(item.source);
  if (!source.enabled || source.state === "stopped") return ["来源停用", ""];
  if (source.state !== "ready") return states[source.state];
  return item.open ? ["已开放", "success"] : ["未开放", ""];
}

function showCatalog() {
  const allowed = pluginActive && access !== "denied";
  const visible = items.filter((item) => item.kind === kind && (sourceFilter === "all" || item.source === sourceFilter));
  const editable = visible.filter((item) => item.source !== "builtin");
  main.innerHTML = heading("能力目录", "查看内置能力及外部来源的条目与开放状态。") + accessNotice() + (allowed ?
    `<div class="stack"><section class="card stack">
      <div class="row" role="group" aria-label="目录类型">${Object.entries(kinds).map(([key, label]) => tab(label, kind === key, `data-kind="${key}"`)).join("")}</div>
      <div class="bar">${field("按来源筛选", `<select id="source-filter">${option("all", "全部来源", sourceFilter)}${option("builtin", "Huhu 内置", sourceFilter)}${list.map((source) => option(source.id, source.name, sourceFilter)).join("")}</select>`)}
        ${button("批量调整开放", { attrs: `id="bulk-exposure" ${editable.length ? disabled() : "disabled"}` })}</div>
      <h2>${kinds[kind]}</h2>
      ${visible.length ? `<ul class="directory-list">${visible.map((item, index) => `<li class="directory-row">
        <div class="catalog-title"><strong>${escapeHtml(item.title)}</strong><p><code>${escapeHtml(item.key)}</code></p>
        <p class="muted">${item.source === "builtin" ? "Huhu 内置 · Kernel" : `外部 MCP · ${escapeHtml(get(item.source).name)} · ${escapeHtml(item.raw)}`}</p></div>
        ${badge(...availability(item))}
        <div class="action-strip">${item.source !== "builtin" ? button(item.open ? "撤销开放" : "选择开放", {
          attrs: `data-policy="${index}" ${disabled()}`, aria: `${item.open ? "撤销开放" : "选择开放"} ${item.key}`,
        }) : ""}${button("检查公开路由", { attrs: `data-route-check="${index}"`, aria: `检查路由 ${item.key}` })}</div></li>`).join("")}</ul>`
      : `<p>此来源没有发现${kinds[kind]}。</p>`}
    </section></div>` : "");
  markCurrent(main, "kind", kind, (value) => { kind = value; showCatalog(); });
  by("#source-filter", main)?.addEventListener("change", (event) => {
    sourceFilter = event.target.value;
    showCatalog();
  });
  all("[data-policy]", main).forEach((control) => control.onclick = () => {
    const item = visible[Number(control.dataset.policy)];
    policyPreview([item], !item.open);
  });
  all("[data-route-check]", main).forEach((control) => control.onclick = () => {
    const item = visible[Number(control.dataset.routeCheck)];
    const source = get(item.source);
    const outcome = !publish ? "对外服务已关闭。" : item.source === "builtin" ? "当前可见，按现有 Huhu Dispatcher 权限调用。"
      : !item.open ? "此条目未开放，旧客户端缓存同样无权调用。"
      : !source.enabled || source.state !== "ready" ? `暂不可路由 · ${availability(item)[0]}` : `当前可路由至 ${source.name} 的 ${item.raw}。`;
    modal("公开路由检查", `<div class="dialog-body stack"><p><code>${escapeHtml(item.key)}</code></p><p>${escapeHtml(outcome)}</p><p class="muted">检查使用本地模拟目录。</p></div>`);
  });
  bind("bulk-exposure", () => policyPreview(editable, true, true));
}

function policyPreview(selection, open, bulk = false) {
  const openedAt = revision;
  const dialog = modal("预览开放变更", `<div class="dialog-body source-form">
    ${bulk ? field("操作", '<select id="policy-action"><option value="open">选择开放</option><option value="revoke">撤销开放</option></select>') : ""}
    <p id="policy-summary" aria-live="polite"></p>
    <ul>${selection.map((item) => `<li><code>${escapeHtml(item.key)}</code></li>`).join("")}</ul>
    <p class="form-error" role="alert" hidden></p></div>
    <footer class="dialog-footer">${button("取消", { attrs: "data-close" })}${button("确认更新开放策略", { attrs: 'id="apply-policy"', className: "primary" })}</footer>`);
  const mode = by("#policy-action", dialog);
  const summary = () => {
    if (mode) open = mode.value === "open";
    by("#policy-summary", dialog).textContent = `${open ? "选择开放" : "撤销开放"} ${selection.length} 项。当前可用性仍由所选来源的状态决定。`;
  };
  mode?.addEventListener("change", summary);
  summary();
  bind("apply-policy", () => {
    if (openedAt !== revision) return showError(dialog, "目录或策略已改变，请重新预览。");
    selection.forEach((item) => { item.open = open; });
    dialog.close();
    stateChange("开放策略已更新");
  }, dialog);
}

startShell({
  title: "MCP", defaultRoute: "services", navigation: ["services", "catalog"],
  pages: {
    services: { label: "外部服务", icon: "Server", show: showServices, sidebar },
    details: { label: "服务详情", icon: "Settings", show: showDetails, sidebar },
    catalog: { label: "能力目录", icon: "List", show: showCatalog, sidebar },
  },
  demo: () => demo("access", "身份与宿主状态", [
    option("manage", "可管理", "manage"), option("readonly", "只读 Vault"), option("denied", "无访问权限"), option("plugin-off", "管理插件停用"),
  ].join("")) + demo("host", "模块凭据", option("available", "宿主可保存", "available") + option("unavailable", "宿主不可保存")) +
    demo("save", "保存场景", option("normal", "正常", "normal") + option("fail", "下次保存失败")),
});

by("#demo-fields").addEventListener("change", (event) => {
  const { value, dataset } = event.target;
  if (dataset.demo === "access") {
    pluginActive = value !== "plugin-off";
    access = pluginActive ? value : "denied";
    if (!pluginActive) publish = false;
  }
  if (dataset.demo === "host") hostCredentials = value === "available";
  if (dataset.demo === "save") nextSaveFails = value === "fail";
  renderShell();
});
