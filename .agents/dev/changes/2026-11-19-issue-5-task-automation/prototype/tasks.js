"use strict";

const byId = id => document.getElementById(id);
const html = value => String(value ?? "").replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const btn = (act, label, value = "", classes = "", disabled = false) =>
  `<button type="button" data-act="${act}" data-value="${html(value)}" class="${classes}" ${disabled ? "disabled" : ""}>${html(label)}</button>`;
const pill = (label, tone = "") => `<span class="pill ${tone}">${html(label)}</span>`;
const field = (id, label, content) => `<div class="field"><label for="${id}">${label}</label>${content}</div>`;
const check = (id, label, checked) => `<div class="check"><input id="${id}" name="${id}" type="checkbox" ${checked ? "checked" : ""}><label for="${id}">${label}</label></div>`;
const options = (values, current) => Object.entries(values).map(([value, label]) =>
  `<option value="${html(value)}" ${value === current ? "selected" : ""}>${html(label)}</option>`).join("");
const select = (id, values, value) => `<select id="${id}" name="${id}">${options(values, value)}</select>`;
const stages = { todo: "未开始", doing: "进行中", done: "已完成" };
const runStages = {
  queued: ["已受理 · 待资源","warn"], running: ["运行中","ok"], failed: ["失败 · 已知未发送","bad"],
  unknown: ["待核实 · 发送情况未知","warn"], question: ["等待读取答复","warn"],
  suspended: ["原生暂停 · 等待答复","warn"], blocked: ["现场阻塞","warn"], succeeded: ["已收结果","ok"],
  cancelled: ["已取消",""], exited: ["进程退出 · 无业务回执","warn"]
};
const zones = { "Asia/Taipei": "Asia/Taipei", "America/New_York": "America/New_York", UTC: "UTC" };
const providers = { codex: "Codex", claude: "Claude Code", pi: "Pi（仅现场处理）" };
const spaces = { product: "产品与工程", service: "服务与接入" };
const windows = { all: "所有可派时间", today: "今天", week: "本周", month: "本月", seven: "未来七天", custom: "自定义日期范围" };
const ruleKinds = { existing: "已有 Agent 任务", template: "新建 Agent 任务", terminal: "终端命令", remind: "提醒" };
const resolution = { "": "未选择", earlier: "较早的一次", later: "较晚的一次" };
const sources = { manual: "人工", advance: "人工提前", once: "运行一次", scheduled: "定时", follow: "一次性跟进" };
const baseTime = Date.parse("2026-11-15T02:00:00Z");
const day = 86400000;
let state, ids, editContext;
const id = prefix => `${prefix}-${++ids}`;
const formatter = new Map();
function wall(time, zone) {
  if (!formatter.has(zone)) formatter.set(zone, new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23"
  }));
  const p = Object.fromEntries(formatter.get(zone).formatToParts(time).map(part => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function wallCandidates(value, zone) {
  const desired = Date.parse(`${value}:00Z`);
  if (Number.isNaN(desired)) return [];
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = desired + hours * 3600000;
    offsets.add(Date.parse(`${wall(sample, zone)}:00Z`) - sample);
  }
  return [...offsets].map(offset => desired - offset).filter(time => wall(time, zone) === value).sort((a, b) => a - b);
}
function resolveWall(value, zone, which, label) {
  if (!value) return null;
  const choices = wallCandidates(value, zone);
  if (!choices.length) throw Error(`${label}在 ${zone} 不存在，请选择另一时刻。`);
  if (choices.length > 1 && !which) throw Error(`${label}出现两次，请选择较早或较晚。UTC 候选为 ${choices.map(time => new Date(time).toISOString().slice(11, 16)).join(" / ")}。`);
  return which === "later" ? choices.at(-1) : choices[0];
}
const showTime = (time, zone = "Asia/Taipei") => time == null ? "未排期" : `${wall(time, zone).replace("T", " ")} ${zone}`;
const shortTime = time => wall(time, "Asia/Taipei").replace("T", " ").slice(5);
const dateKey = time => new Date(time).toISOString().slice(0, 10);
const activeTask = () => state.tasks.find(task => task.id === state.task);
const activeRule = () => state.rules.find(rule => rule.id === state.rule);
const lastRun = task => task.runs.at(-1);
const hasLiveRun = task => ["queued", "running", "unknown", "question", "suspended", "blocked"].includes(lastRun(task)?.stage);

function taskData(key, title, more = {}) {
  return { id: key, title, body: "", kind: "Agent", stage: "todo", zone: "Asia/Taipei", space: "product",
    provider: "codex", model: "", args: "", target: "new", tag: "发布", available: null, due: "",
    origin: "人工创建", runs: [], timeline: [], follow: null, ...more };
}
function defaultRule() {
  return { id: "default-rule", title: "处理可执行的 Agent 任务", on: true, kind: "existing", zone: "Asia/Taipei",
    cadence: "quarter", span: "all", lower: "", upper: "", overdue: true, unscheduled: true,
    tag: "", space: "all", targetSpace: "product", provider: "codex", body: "", activations: [] };
}
function initial() {
  ids = 100;
  return { now: baseTime, page: "tasks", task: "release", rule: "default-rule", taskView: "board",
    preview: false, message: "工作台就绪", tasks: [
      taskData("release", "整理下一版发布检查清单", { body: "比对工作台入口、权限提示和回退步骤，先汇总需要人工确认的项目。", available: baseTime - 3600000, due: "2026-11-20" }),
      taskData("tomorrow", "核对服务接入指南的配置示例", { body: "按部署说明核对最小接入实例。", space: "service", available: Date.parse("2026-11-16T01:00:00Z") }),
      taskData("yesterday", "梳理过去两次 Beta 的用户反馈", { available: Date.parse("2026-11-14T10:00:00Z"), tag: "回访" }),
      taskData("triage", "汇总窄窗和键盘走查证据", { tag: "验收", provider: "claude" }),
      taskData("human", "确认演示素材的发布授权", { kind: "Human", stage: "doing", tag: "设计", due: "2026-11-19" }),
      taskData("done", "把服务入口说明同步到团队手册", { kind: "Human", stage: "done", tag: "文档" })
    ], rules: [defaultRule()], occurrences: new Set(), engineOn: true };
}
function setStatus(message) {
  state.message = message;
  byId("status").textContent = message;
}
function render() {
  const rulePage = state.page === "rules";
  byId("status").textContent = state.message;
  byId("clock").textContent = showTime(state.now);
  byId("sections").innerHTML = [
    ["tasks", "任务", "任务看板和列表"], ["rules", "自动化", "规则、时间窗口和激活记录"]
  ].map(([key, label, description]) => `<button type="button" data-act="page" data-value="${key}" class="nav-item" ${state.page === key ? 'aria-current="page"' : ""}><strong>${label}</strong><small>${description}</small></button>`).join("");
  document.querySelectorAll(".rail [data-act=page]").forEach(item => {
    if (item.dataset.value === state.page) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  byId("module-head").innerHTML = rulePage ?
    `<div class="row between"><div><div class="muted">工作管理</div><h1>自动化</h1></div><div class="row">${btn("engine", state.engineOn ? "暂停自动调度" : "启用自动调度")}${btn("new-rule","＋ 新建规则","","primary")}</div></div>
     <div class="row">${pill(state.engineOn ? "自动调度开启" : "自动调度暂停",state.engineOn ? "ok" : "warn")}${pill(`${state.rules.length} 条规则`)}</div>` :
    `<div class="row between"><div><div class="muted">工作管理</div><h1>任务</h1></div>${btn("new-task","＋ 新建任务","","primary")}</div>
     <div class="row between"><div class="row segmented">${Object.entries({ board: "看板", list: "列表" }).map(([key,label]) => `<button type="button" data-act="task-view" data-value="${key}" aria-pressed="${state.taskView === key}">${label}</button>`).join("")}</div><small>${state.tasks.length} 项任务</small></div>`;
  if (rulePage) {
    renderRules();
    renderRule(activeRule());
  } else {
    renderTasks();
    renderTask(activeTask());
  }
  const hasDetail = Boolean(rulePage ? activeRule() : activeTask());
  byId("detail").hidden = !hasDetail;
  byId("task-workarea").classList.toggle("solo", !hasDetail);
}

function taskCard(task) {
  const run = lastRun(task);
  return `<button class="task-card" type="button" data-act="task" data-value="${task.id}" ${state.task === task.id ? 'aria-current="true"' : ""}>
    <strong class="task-heading ${task.stage === "done" ? "done" : ""}">${html(task.title)}</strong>
    <span class="row">${pill(task.kind, task.kind === "Agent" ? "info" : "")}${pill(task.tag || "未分组")}${state.taskView === "list" ? pill(stages[task.stage]) : ""}</span>
    <small>${run && ["queued","failed","unknown","question","suspended","blocked","exited"].includes(run.stage) ? html(runStages[run.stage][0]) :
      task.available != null ? `最早 ${shortTime(task.available)}` : task.due ? `截止 ${html(task.due)}` : "未排期"}</small></button>`;
}
function renderTasks() {
  byId("main-content").innerHTML = state.taskView === "list" ?
    `<h2>所有任务</h2><div class="task-list">${state.tasks.map(taskCard).join("")}</div>` :
    `<div class="board">${Object.entries(stages).map(([stage, label]) => {
      const items = state.tasks.filter(task => task.stage === stage);
      return `<section class="column stack tight" aria-label="${label}"><div class="row between"><h2>${label}</h2>${pill(String(items.length))}</div>
        ${items.map(taskCard).join("") || '<p class="muted">暂无任务</p>'}</section>`;
    }).join("")}</div>`;
}
function renderRules() {
  byId("main-content").innerHTML = state.rules.length ?
    `<h2>调度规则</h2><table class="rule-table"><caption class="muted">在所选时区检查触发时间</caption>
      <thead><tr><th scope="col">规则</th><th scope="col">动作</th><th scope="col">启用</th></tr></thead><tbody>${state.rules.map(rule =>
        `<tr><td>${btn("rule",rule.title,rule.id,"subtle")}<small>${rule.zone} · ${rule.cadence === "quarter" ? "每 15 分钟" : "每日 09:00"}</small></td>
        <td>${ruleKinds[rule.kind]}</td><td><input type="checkbox" role="switch" data-rule-switch="${rule.id}" aria-label="${html(rule.title)}" ${rule.on ? "checked" : ""}></td></tr>`).join("")}</tbody></table>
      ${!state.rules.some(rule => rule.id === "default-rule") ? btn("default-rule","恢复默认规则") : ""}` :
    `<div class="empty stack"><p>还没有调度规则。</p><div class="row">${btn("default-rule","恢复默认规则")}</div></div>`;
}
function renderRule(rule) {
  if (!rule) return;
  const isScanner = rule.kind === "existing";
  const preview = isScanner && state.preview ? candidates(rule) : [];
  const ownPending = state.tasks.filter(task => lastRun(task)?.rule === rule.id && lastRun(task)?.stage === "queued");
  const windowsText = isScanner ? `${windows[rule.span]} · ${rule.overdue ? "含逾期" : "排除逾期"} · ${rule.unscheduled ? "含未排期" : "排除未排期"}` : "每次触发按此规则快照运行";
  const nexts = nextTimes(rule, 3);
  byId("detail").innerHTML = `<header class="detail-head stack tight"><div class="row between"><h2>${html(rule.title)}</h2>${btn("close-detail","关闭详情","","subtle")}</div>
    <div class="row">${pill(rule.on ? "已启用" : "已停用",rule.on ? "ok" : "warn")}${pill(ruleKinds[rule.kind])}</div></header>
    <dl class="detail-meta"><dt>规则时区</dt><dd>${rule.zone}</dd><dt>执行范围</dt><dd>${windowsText}</dd>
      <dt>下次触发</dt><dd>${rule.on && state.engineOn ? showTime(nexts[0],rule.zone) : "日程未开启"}</dd><dt>已受理待发送</dt><dd>${ownPending.length} 项</dd></dl>
    ${rule.on && state.engineOn ? `<details><summary>接下来三次触发</summary><ul>${nexts.map(time => `<li>${showTime(time,rule.zone)}</li>`).join("")}</ul></details>` : ""}
    ${ownPending.length ? `<div class="card stack tight"><h3>已入队的任务</h3>${ownPending.map(task => btn("go-task", task.title, task.id)).join("")}</div>` : ""}
    <div class="row">${btn("edit-rule","编辑规则",rule.id)}${isScanner ? btn("preview",state.preview ? "收起预览" : "预览候选") : ""}${btn("run-once","运行一次",rule.id,"primary")}${btn("delete-rule","删除规则",rule.id,"danger")}</div>
    ${isScanner && state.preview ? `<section class="stack tight"><h3>候选预览</h3><small>${html(showTime(state.now,rule.zone))} · ${html(windowDescription(rule))}</small>
      <ul class="clean">${preview.map(({ task, verdict, reason }) => `<li class="list-item"><div class="row">${pill(verdict,verdict === "可派遣" ? "ok" : verdict === "等待空闲" ? "warn" : "")}<strong>${html(task.title)}</strong></div><small>${html(reason)}</small></li>`).join("")}</ul></section>` : ""}
    <details ${rule.activations.length ? "open" : ""}><summary>触发记录 · ${rule.activations.length}</summary>
      <ul class="clean">${rule.activations.slice().reverse().map(item => `<li class="list-item"><strong>${html(item.label)}</strong><br><small>${html(item.id)} · ${html(item.result)}</small></li>`).join("") || '<li class="muted">暂无触发记录</li>'}</ul></details>`;
}

function taskActions(task, run) {
  if (task.kind !== "Agent" || task.stage === "done") return "";
  if (!run || ["cancelled", "succeeded", "exited"].includes(run.stage)) {
    const future = task.available > state.now;
    const valid = Boolean(task.space && task.provider);
    return btn("dispatch", future ? "提前派遣" : "立即派遣", future ? "advance" : "manual", "primary", !valid);
  }
  return {
    queued: `${btn("try-send","检查并尝试发送")}${btn("cancel-run","取消待派","","danger")}`,
    running: btn("stop-run","停止本轮","","danger"),
    failed: btn("retry-snapshot","以原快照重试","","primary"),
    unknown: btn("reconcile","核对原发送","","primary"),
    question: "", suspended: "", blocked: ""
  }[run.stage] ?? "";
}
function renderTask(task) {
  if (!task) return;
  const run = lastRun(task);
  const question = run?.request;
  const pending = task.runs.filter(item => item.delivery?.status === "pending");
  const requestOpen = task.stage !== "done" && question?.status === "open";
  const reference = "资料/发布/下一版发布准备与验收.md";
  byId("detail").innerHTML = `<header class="detail-head stack tight"><div class="row between"><h2 class="${task.stage === "done" ? "task-heading done" : "task-heading"}">${html(task.title)}</h2>${btn("close-detail","关闭详情","","subtle")}</div>
    <div class="row">${pill(stages[task.stage])}${pill(task.kind,task.kind === "Agent" ? "info" : "")}${pill(task.origin)}</div></header>
    <dl class="detail-meta"><dt>最早可派</dt><dd>${html(showTime(task.available,task.zone))}</dd>
      <dt>截止</dt><dd>${html(task.due || "未设截止")}</dd>
      ${task.kind === "Agent" ? `<dt>执行目标</dt><dd>${html(spaces[task.space] ?? "未选择工作区")} · ${html(providers[task.provider] ?? "未选 Agent")} · ${task.target === "existing" ? "复用指定会话" : "新会话"}</dd>` : ""}</dl>
    ${task.body ? `<section class="card snapshot stack tight"><h3>任务正文</h3><p>${html(task.body)}</p>${task.id === "release" ? `<small>关联资料 · <code>${reference}</code></small>` : ""}</section>` : ""}
    <div class="row">${taskActions(task,run)}${btn("edit-task","编辑任务")}${btn("task-state",task.stage === "done" ? "重开任务" : "标记完成")}</div>
    ${task.kind === "Agent" && (!task.space || !task.provider) ? '<p class="callout warn">先选择工作区和 Agent，再派遣。</p>' : ""}
    ${run ? `<section class="card stack tight" aria-label="当前运行"><div class="row between"><h3>当前运行</h3>${pill(...runStages[run.stage])}</div>
      <small>${html(run.id)} · ${html(sources[run.source])} · ${html(run.session ?? "待绑定会话")}</small>
      ${run.note ? `<p class="callout ${["failed","unknown","queued","exited"].includes(run.stage) ? "warn" : "info"}">${html(run.note)}</p>` : ""}
      ${question ? `<p><strong>${question.type === "deferred" ? "原生暂停请求" : "Agent 提问"}</strong> · ${html(question.id)} v${question.version}</p>
        <p>${html(question.text)}</p>
        ${requestOpen ? btn("reply","答复问题",question.id,"primary") : `<small>${question.status === "accepted" ? "答复已保存 · 待发送" : question.status === "resolved" ? "已处理" : "任务已关闭 · 问题暂停"}</small>`}` : ""}
      ${run.session ? `${btn("site","前往模拟现场")}` : ""}
      ${pending.map(item => `<p class="callout warn">结果已保存 · 评论待投递 · ${item.id}</p>${btn("retry-delivery","补送原结果",item.id,"primary")}`).join("")}</section>` : ""}
    ${task.follow ? `<section class="card stack tight"><h3>一次性跟进</h3><p>${html(showTime(task.follow.time,task.zone))} · ${task.follow.sent ? "已触发" : "待触发"}</p>
      ${task.follow.sent ? "" : `<div class="row">${btn("follow","改期")}${btn("cancel-follow","取消跟进","","danger")}</div>`}</section>` :
      task.kind === "Agent" && task.stage !== "done" ? `<div class="row">${btn("follow","安排一次性跟进")}</div>` : ""}
    <section class="stack tight"><div class="row between"><h3>任务时间线</h3>${btn("comment","添加讨论")} ${task.kind === "Agent" && task.stage !== "done" && run?.session ? btn("add-input","发送补充信息") : ""}</div>
      ${task.timeline.length ? `<ul class="timeline clean">${task.timeline.map(item => `<li class="list-item stack tight" data-message="${item.id}"><strong>${html(item.label)}</strong><p>${html(item.body)}</p><small>${shortTime(item.time)} · ${item.id}</small></li>`).join("")}</ul>` :
        '<p class="muted">暂无评论或运行回执。</p>'}</section>
    ${task.runs.length ? `<details><summary>运行记录 · ${task.runs.length}</summary><ul class="clean">${[...task.runs].reverse().map(record =>
      `<li class="list-item"><div class="row">${pill(...runStages[record.stage])}<code>${record.id}</code></div><small>${sources[record.source]}${record.parent ? ` · 上一轮 ${record.parent}` : ""} · ${record.snapshotId}</small><br>${btn("snapshot","查看执行快照",record.id,"subtle")}</li>`).join("")}</ul></details>` : ""}`;
}
function openEditor(title, content) {
  const dialog = byId("editor");
  byId("editor-title").textContent = title;
  byId("editor-body").innerHTML = content;
  if (!dialog.open) dialog.showModal();
}
function formBody(id, fields, submit) {
  return `<form id="${id}" class="stack" aria-labelledby="editor-title">${fields}
    <p id="form-error" class="error-text" role="alert" hidden></p>
    <div class="row actions"><button type="button" data-act="dismiss" ${id === "confirm-form" ? "autofocus" : ""}>取消</button><button type="submit" class="primary">${submit}</button></div></form>`;
}
function input(id, value, attrs = "") {
  return `<input id="${id}" name="${id}" ${attrs} value="${html(value)}">`;
}
function textarea(id, value, attrs = "") {
  return `<textarea id="${id}" name="${id}" rows="3" ${attrs}>${html(value)}</textarea>`;
}
function taskForm(task) {
  const data = task ?? taskData("", "", { kind: "Human", space: "", provider: "", tag: "" });
  editContext = { task };
  openEditor(task ? "编辑任务" : "新建任务", formBody("task-form",
    field("title","标题",input("title",data.title,"required maxlength='120' autofocus")) +
    field("body","任务正文",textarea("body",data.body)) +
    `<div class="grid-two">${field("kind","类型",select("kind",{ Human:"Human", Agent:"Agent" },data.kind))}${field("tag","分组 / 标签",input("tag",data.tag,"maxlength='36'"))}</div>` +
    `<fieldset id="target-fields" ${data.kind === "Agent" ? "" : "hidden"}><legend>执行目标</legend><div class="stack"><div class="grid-two">
    ${field("space","工作区",select("space",{ "":"稍后选择",...spaces },data.space))}${field("provider","Agent",select("provider",{ "":"稍后选择",...providers },data.provider))}
    ${field("target","会话策略",select("target",{ new:"启动新会话", existing:"复用当前工作区示例会话" },data.target))}${field("model","模型",input("model",data.model,"placeholder='使用 Agent 默认模型'"))}</div>
    ${field("args","启动参数（演示文本）",input("args",data.args))}</div></fieldset>` +
    `<div class="grid-two">${field("available","最早可派时间",input("available",data.available == null ? "" : wall(data.available,data.zone),"type='datetime-local' aria-describedby='wall-help'"))}
      ${field("zone","输入时区",select("zone",zones,data.zone))}${field("due","截止日期",input("due",data.due,"type='date'"))}
      ${field("overlap","回拨时间选项",select("overlap",resolution,data.available != null && wallCandidates(wall(data.available,data.zone),data.zone).length > 1 ?
        wallCandidates(wall(data.available,data.zone),data.zone)[0] === data.available ? "earlier" : "later" : ""))}</div>
    <small id="wall-help">回拨时间出现两次时请选择其一。跳过的时间需要重新选择。</small>`, "保存任务"));
}
function ruleForm(rule) {
  const data = rule ?? { ...defaultRule(), on: false, title: "" };
  editContext = { rule };
  openEditor(rule ? "编辑规则" : "新建规则", formBody("rule-form",
    field("rule-title","规则名称",input("rule-title",data.title,"required maxlength='100' autofocus")) +
    `<div class="grid-two">${field("rule-kind","动作",select("rule-kind",ruleKinds,data.kind))}
    ${field("rule-zone","规则时区",select("rule-zone",zones,data.zone))}
    ${field("cadence","触发周期",select("cadence",{ quarter:"每 15 分钟", daily:"每日 09:00" },data.cadence))}</div>` +
    `<section class="stack" id="scanner-fields" ${data.kind === "existing" ? "" : "hidden"}>
    <div class="grid-two">${field("span","时间窗口",select("span",windows,data.span))}
    ${field("rule-space","工作区范围",select("rule-space",{ all:"全部工作区",...spaces },data.space))}
    ${field("rule-tag","标签（可选）",input("rule-tag",data.tag))}</div>
    <div class="grid-two" id="custom-fields" ${data.span === "custom" ? "" : "hidden"}>
      ${field("lower","开始日期（含）",input("lower",data.lower,"type='date'"))}
      ${field("upper","结束日期（不含）",input("upper",data.upper,"type='date'"))}</div>
    <div class="row">${check("overdue","包含逾期",data.overdue)}${check("unscheduled","包含未排期",data.unscheduled)}</div></section>` +
    `<div class="grid-two" id="template-fields" ${data.kind === "template" ? "" : "hidden"}>
    ${field("template-space","新任务工作区",select("template-space",spaces,data.targetSpace))}
    ${field("template-provider","新任务 Agent",select("template-provider",providers,data.provider))}</div>` +
    `<div id="rule-body-wrap">${field("rule-body","补充指令、模板正文或模拟动作说明",textarea("rule-body",data.body))}</div>
    ${rule ? `<p class="callout info">演示约定 · 保存后维持当前启停状态，已接受的触发沿用原快照。</p>` : ""}`, "保存规则"));
}
function simpleForm(type, label, prompt, note = "") {
  openEditor(label, formBody(type, (note ? `<p class="callout info">${html(note)}</p>` : "") +
    field("input-body",prompt,textarea("input-body","","required autofocus")),label));
}
function confirmAction(title, description, label, apply) {
  editContext = { apply };
  openEditor(title, formBody("confirm-form",`<p>${html(description)}</p>`,label));
}

function timeline(task, label, body, key = id("消息")) {
  if (!task.timeline.some(item => item.id === key)) task.timeline.push({ id:key, label, body, time:state.now });
}
function takeFault() {
  const field = byId("fault");
  const fault = field.value;
  field.value = "normal";
  return fault;
}
function snapshot(task, extra = "") {
  return { title:task.title, body:task.body, space:task.space, provider:task.provider,
    target:task.target, model:task.model, args:task.args, available:task.available, extra };
}
function capacity(run) {
  const busy = state.tasks.some(task => {
    const existing = lastRun(task);
    if (!existing || existing === run || !["running","unknown"].includes(existing.stage)) return false;
    return (run.snapshot.target === "existing" && existing.snapshot.target === "existing" && existing.snapshot.space === run.snapshot.space) ||
      (run.rule && existing.rule === run.rule && run.snapshot.target === "new");
  });
  return !busy;
}
function tryStart(task, run, fault) {
  if (!["queued","failed"].includes(run.stage)) return;
  if (fault === "readonly" || fault === "busy" || !capacity(run)) {
    run.stage = "queued";
    run.note = fault === "readonly" ? "Vault 当前只读，继续保留已接受记录。" : "目标或规则的工作槽正忙，原输入保留待发送。";
    setStatus(run.note);
    return;
  }
  if (fault === "unsent") {
    run.stage = "failed";
    run.note = "确定未写入 CLI，可按原执行快照重新发送。";
    setStatus(run.note);
    return;
  }
  if (fault === "unknown") {
    run.stage = "unknown";
    run.note = "可能已发送。保留原运行身份，核对前继续占用会话。";
    setStatus(run.note);
    return;
  }
  markRunning(task, run);
}
function markRunning(task, run) {
  run.stage = "running";
  run.session ??= run.snapshot.target === "existing" ? `会话-${run.snapshot.space}-现有` : id("会话");
  run.note = "CLI 已接受本轮输入。";
  if (task.stage === "todo") task.stage = "doing";
  if (run.request?.status === "accepted") run.request.status = "resolved";
  timeline(task,"系统","CLI 已接受本轮输入。",`${run.id}-dispatch`);
  setStatus(`已启动 · ${run.id} · ${run.session}`);
}
function dispatch(task, source, rule, fault, extra = "", parent = null) {
  if (task.stage === "done" || (!parent && (task.kind !== "Agent" || !task.space || !task.provider)) ||
      (!parent && hasLiveRun(task)) || (!parent && lastRun(task)?.stage === "failed")) {
    setStatus("当前任务条件不允许再次派遣。"); return null;
  }
  if (fault === "readonly") { setStatus("Vault 只读，派遣未受理。"); return null; }
  if (task.available > state.now && source !== "advance" && !parent) {
    setStatus("尚未到最早可派时间。"); return null;
  }
  const run = { id:id("运行"), snapshotId:id("快照"), snapshot:parent ? { ...parent.snapshot, extra } : snapshot(task,extra), stage:"queued",
    source, rule:rule?.id, parent:parent?.id, session:parent?.session, note:"已受理，等待 CLI 接收。" };
  task.runs.push(run);
  setStatus(`已受理 · ${run.id}`);
  tryStart(task,run,fault);
  return run;
}
function acceptAnswer(task, run, body, fault) {
  if (fault === "readonly") { throw Error("Vault 只读，答复尚未保存。"); }
  const request = run.request;
  if (request.status !== "open" || task.stage === "done") throw Error("该问题现在不可答复。");
  request.status = "accepted";
  timeline(task,"用户答复",body,`${request.id}-answer`);
  if (request.type === "deferred") {
    run.replySnapshot = body;
    run.stage = "queued";
    tryStart(task,run,fault);
  } else {
    const next = dispatch(task,"manual",null,fault,`原问题：${request.text}\n答复：${body}`,run);
    if (next) next.resolves = run;
    if (next?.stage === "running") request.status = "resolved";
  }
}
function deliver(task, run) {
  if (!run.delivery) return;
  const delivery = run.delivery;
  timeline(task,"Agent 结果",delivery.body,delivery.id);
  delivery.status = "delivered";
  setStatus(`时间线已收原结果 · ${delivery.id}`);
}
function background(task, action) {
  const run = task && lastRun(task);
  if (!run) { setStatus("请先选择一个有运行记录的任务。"); return; }
  if (action === "replay") {
    const original = task.runs.findLast(item => item.delivery);
    if (original) deliver(task,original);
    else setStatus("暂无可重交的结果。");
    return;
  }
  if (run.stage !== "running") { setStatus("这个后台事件需要一轮运行中的任务。"); return; }
  if (action === "deferred" && run.snapshot.provider === "pi") action = "blocked";
  if (["question","deferred","blocked"].includes(action)) {
    run.stage = { question:"question", deferred:"suspended", blocked:"blocked" }[action];
    run.note = action === "blocked" ? "此 Agent 只报告阻塞，请前往原会话处理。" : "等待用户，不占用规则工作槽。";
    if (action !== "blocked") run.request = { id:id("请求"), version:1, type:action, status:"open",
      text:action === "question" ? "检查清单是否要区分内测发布和面向全体用户的发布？" : "原会话暂停，是否继续读取演示目录中的发布资料？" };
    timeline(task,"Agent 问题",run.request?.text ?? run.note);
    setStatus(run.note);
  } else if (action === "progress") {
    timeline(task,"Agent 进度","已比对三处工作台入口，正在核对权限提示与回退步骤。");
    setStatus("任务时间线已收到进度摘要。");
  } else if (action === "exit") {
    run.stage = "exited";
    run.note = "终端已退出。尚无受信业务结果。";
    setStatus(run.note);
  } else {
    run.stage = "succeeded";
    run.note = "已保存受信的业务结果。";
    run.delivery = { id:id("结果"), status:"pending", body:"已完成检查清单。建议先核对窄窗权限提示及回退入口，再更新发布说明。" };
    if (action === "delivery-fail") setStatus("结果已保存 · 评论写入失败，可补送原结果。");
    else deliver(task,run);
    if (run.supplements?.length && task.stage !== "done") {
      dispatch(task,"manual",null,"normal",run.supplements.join("\n"),run);
    }
  }
}

function windowBounds(rule) {
  const date = wall(state.now,rule.zone).slice(0,10);
  const current = Date.parse(date);
  if (rule.span === "all") return ["",""];
  if (rule.span === "custom") return [rule.lower,rule.upper];
  if (rule.span === "week") {
    const shift = (new Date(current).getUTCDay() + 6) % 7;
    return [dateKey(current - shift * day),dateKey(current + (7 - shift) * day)];
  }
  if (rule.span === "month") {
    const at = new Date(current);
    return [date.slice(0,7) + "-01",dateKey(Date.UTC(at.getUTCFullYear(),at.getUTCMonth() + 1,1))];
  }
  return [date,dateKey(current + (rule.span === "seven" ? 7 : 1) * day)];
}
function windowDescription(rule) {
  const [lower,upper] = windowBounds(rule);
  return lower ? `${lower} ≤ 当地日期 < ${upper}` : "所有可派时间";
}
function candidates(rule) {
  const [lower,upper] = windowBounds(rule);
  const today = wall(state.now,rule.zone).slice(0,10);
  return state.tasks.map(task => {
    const rejected = reason => ({ task, verdict:"排除", reason });
    if (task.kind !== "Agent" || task.stage !== "todo") return rejected("需为未开始的 Agent 任务");
    if (!task.space || !task.provider) return rejected("缺少执行目标");
    if (rule.tag && task.tag !== rule.tag) return rejected("标签不在规则范围内");
    if (rule.space !== "all" && task.space !== rule.space) return rejected("工作区不在规则范围内");
    if (hasLiveRun(task) || lastRun(task)?.stage === "failed") return rejected("已有待处理或待核实的运行");
    if (task.available > state.now) return rejected("尚未到最早可派时间");
    if (task.available == null && !rule.unscheduled) return rejected("规则排除未排期任务");
    if (task.available != null) {
      const date = wall(task.available,rule.zone).slice(0,10);
      if (upper && date >= upper) return rejected("晚于规则窗口");
      if (date < (lower || today) && !rule.overdue) return rejected("逾期任务未纳入");
    }
    const probe = { rule:rule.id, snapshot:task };
    if (!capacity(probe) || byId("fault").value === "busy") return { task, verdict:"等待空闲", reason:"会话或规则工作槽繁忙" };
    return { task, verdict:"可派遣", reason:task.available == null ? "规则纳入未排期" : "满足最早时间及窗口" };
  });
}
function nextTimes(rule, count) {
  const interval = 15 * 60000;
  if (rule.cadence === "quarter") {
    return Array.from({length:count},(_,i) => Math.floor(state.now / interval) * interval + (i + 1) * interval);
  }
  const current = Date.parse(wall(state.now,rule.zone).slice(0,10));
  const times = [];
  for (let i = 0; times.length < count; i++) {
    const match = wallCandidates(`${dateKey(current + day * i)}T09:00`,rule.zone)[0];
    if (match > state.now) times.push(match);
  }
  return times;
}
function activateRule(rule, source, scheduledFor) {
  const key = source === "scheduled" ? `${rule.id}@${new Date(scheduledFor).toISOString()}` : id("手动触发");
  if (state.occurrences.has(key)) { setStatus("同一时刻已认领，保留原触发记录。"); return; }
  const fault = takeFault();
  if (fault === "readonly") { setStatus("Vault 只读，此次触发未受理。"); return; }
  state.occurrences.add(key);
  const record = { id:key, label:source === "scheduled" ? showTime(scheduledFor,rule.zone) : "运行一次", result:"" };
  rule.activations.push(record);
  if (rule.kind === "existing") {
    const entries = candidates(rule).filter(item => item.verdict !== "排除")
      .sort((a,b) => (a.task.available ?? -Infinity) - (b.task.available ?? -Infinity) || a.task.id.localeCompare(b.task.id));
    const accepted = [];
    for (const { task } of entries) {
      const run = dispatch(task,source,rule,fault,rule.body);
      if (run) accepted.push(run.id);
    }
    record.result = accepted.length ? `受理 ${accepted.length} 项 · ${accepted.join("、")}` : "无符合条件的任务";
  } else if (rule.kind === "template") {
    const task = taskData(id("任务"),rule.title,{ origin:`规则 · ${rule.title}`,zone:rule.zone,body:rule.body,space:rule.targetSpace,provider:rule.provider,tag:"自动化" });
    state.tasks.unshift(task);
    const run = dispatch(task,source,rule,fault);
    record.result = `已创建 ${task.id} · ${run.id}`;
  } else record.result = rule.kind === "terminal" ? "已记录模拟终端启动" : "已记录模拟提醒通知";
  setStatus(record.result);
}
function latestTick(rule) {
  const interval = 15 * 60000;
  if (rule.cadence === "quarter") return Math.floor(state.now / interval) * interval;
  const date = Date.parse(wall(state.now,rule.zone).slice(0,10));
  const today = wallCandidates(`${dateKey(date)}T09:00`,rule.zone)[0];
  return today <= state.now ? today : wallCandidates(`${dateKey(date - day)}T09:00`,rule.zone)[0];
}
function triggerDue() {
  if (!state.engineOn) { setStatus("自动调度已暂停。"); return; }
  let count = 0;
  for (const rule of state.rules.filter(item => item.on)) {
    const tick = latestTick(rule);
    if (tick < (rule.enabledAt ?? baseTime)) continue;
    activateRule(rule,"scheduled",tick);
    count++;
  }
  for (const task of state.tasks) {
    if (task.follow && !task.follow.sent && task.follow.time <= state.now && task.stage !== "done" && !hasLiveRun(task)) {
      const run = dispatch(task,"follow",null,takeFault(),"一次性跟进");
      if (run) task.follow.sent = true;
    }
  }
  if (!count) setStatus("当前没有到期的已启用规则。");
}

function restart() {
  let count = 0;
  for (const task of state.tasks) for (const run of task.runs) {
    if (run.delivery?.status === "pending") { deliver(task,run); count++; }
  }
  setStatus(`重启完成 · 补投原结果 ${count} 条，待核实发送保留原身份，规则启停选择已恢复。`);
}
function toggleRule(rule, enabled) {
  rule.on = enabled;
  if (enabled) rule.enabledAt = state.now;
  const retained = state.tasks.filter(task => lastRun(task)?.rule === rule.id && lastRun(task)?.stage === "queued").length;
  setStatus(enabled ? "规则已启用。" : `已停用未来触发 · 保留 ${retained} 项已入队待发任务。`);
}
function openFollow(task) {
  editContext = { task };
  openEditor("一次性跟进",formBody("follow-form",
    field("follow-at","跟进时间",input("follow-at",wall(task.follow?.time ?? state.now + 3600000,task.zone),"type='datetime-local' required autofocus")) +
    field("follow-overlap","回拨时间选项",select("follow-overlap",resolution,"")) +
    `<small>使用 ${task.zone}。任务关闭时跳过。</small>`,"保存跟进"));
}
function saveTask(data) {
  const title = data.get("title").trim();
  if (!title) throw Error("请输入任务标题。");
  const zone = data.get("zone");
  const available = resolveWall(data.get("available"),zone,data.get("overlap"),"最早可派时间");
  const old = editContext.task;
  const task = old ?? taskData(id("任务"),title);
  Object.assign(task,{title, available, zone, body:data.get("body").trim(), kind:data.get("kind"), tag:data.get("tag"),
    due:data.get("due"), space:data.get("space"), provider:data.get("provider"), target:data.get("target"), model:data.get("model"), args:data.get("args") });
  if (!old) state.tasks.unshift(task);
  state.task = task.id;
  setStatus(old ? "任务已保存，已接受的执行仍使用原快照。" : "任务已保存，可从详情继续编辑。");
}
function saveRule(data) {
  const title = data.get("rule-title").trim();
  if (!title) throw Error("请输入规则名称。");
  const lower = data.get("lower"), upper = data.get("upper");
  if (data.get("rule-kind") === "existing" && data.get("span") === "custom" && (!lower || !upper || lower >= upper)) {
    throw Error("自定义范围需要有效的开始和结束日期，结束需晚于开始。");
  }
  const old = editContext.rule;
  const rule = old ?? { ...defaultRule(), id:id("规则"), on:false };
  Object.assign(rule,{ title, lower, upper, kind:data.get("rule-kind"), zone:data.get("rule-zone"), cadence:data.get("cadence"),
    span:data.get("span"), overdue:data.has("overdue"), unscheduled:data.has("unscheduled"),
    tag:data.get("rule-tag").trim(), space:data.get("rule-space"), targetSpace:data.get("template-space"),
    provider:data.get("template-provider"), body:data.get("rule-body").trim() });
  if (!old) state.rules.push(rule);
  state.rule = rule.id;
  state.preview = false;
  setStatus(old ? "规则更新已保存 · 维持当前启停状态。" : "规则已保存 · 可预览后启用。");
}

document.addEventListener("click", event => {
  const control = event.target.closest("button[data-act]");
  if (!control) return;
  const { act, value = "" } = control.dataset;
  const task = activeTask(), rule = activeRule(), run = task && lastRun(task);
  switch (act) {
    case "dismiss": byId("editor").close(); return;
    case "page": state.page = value; break;
    case "task-view": state.taskView = value; break;
    case "task": state.task = value; break;
    case "rule": state.rule = value; state.preview = false; break;
    case "go-task": state.task = value; state.page = "tasks"; break;
    case "close-detail": if (state.page === "tasks") state.task = null; else state.rule = null; break;
    case "new-task": taskForm(null); return;
    case "edit-task": taskForm(task); return;
    case "new-rule": ruleForm(null); return;
    case "edit-rule": ruleForm(rule); return;
    case "default-rule":
      if (!state.rules.some(item => item.id === "default-rule")) {
        const restored = defaultRule();
        restored.enabledAt = state.now;
        state.rules.unshift(restored);
        state.rule = restored.id;
        setStatus("已显式恢复默认规则。");
      }
      break;
    case "preview": state.preview = !state.preview; break;
    case "run-once": activateRule(rule,"once"); break;
    case "delete-rule": {
      const retained = state.tasks.filter(item => lastRun(item)?.rule === rule.id && lastRun(item)?.stage === "queued").length;
      confirmAction("删除规则", `删除后停止未来触发。已入队的 ${retained} 项待发送任务会保留，可从原任务详情单独取消。`,"删除规则",() => {
        state.rules = state.rules.filter(item => item !== rule);
        state.rule = null;
        setStatus(`规则已删除 · 保留 ${retained} 项已入队待发任务。`);
      });
      return;
    }
    case "engine":
      state.engineOn = !state.engineOn;
      if (state.engineOn) for (const item of state.rules) if (item.on) item.enabledAt = state.now;
      setStatus(state.engineOn ? "自动调度已启用。" : "自动调度已暂停，人工派遣仍可用。");
      break;
    case "dispatch":
      if (value === "advance") {
        confirmAction("提前派遣", `最早可派时间为 ${showTime(task.available,task.zone)}。确认后仅覆盖本次派遣。`,"确认提前派遣",() => dispatch(task,"advance",null,takeFault()));
        return;
      }
      dispatch(task,"manual",null,takeFault()); break;
    case "try-send": case "retry-snapshot":
      tryStart(task,run,takeFault());
      if (run.stage === "running" && run.resolves) run.resolves.request.status = "resolved";
      break;
    case "reconcile":
      confirmAction("核对原发送",`从原会话取回已接受的证据。核对 ${run.id} 时不会再次发送原输入。`,"确认核对",() => {
        markRunning(task,run);
        if (run.resolves) run.resolves.request.status = "resolved";
      });
      return;
    case "cancel-run": case "stop-run": {
      const queued = act === "cancel-run";
      confirmAction(queued ? "取消待派" : "停止本轮", queued ? "仅取消这条尚未发送的运行，保留任务与其他任务的队列。" :
        "模拟确认原会话已停止，任务业务状态由你单独维护。",queued ? "确认取消待派" : "确认停止本轮",() => {
        run.stage = "cancelled"; run.note = queued ? "用户取消了尚未发送的意图。" : "原会话已确认中断。";
        setStatus(run.note);
      });
      return;
    }
    case "task-state":
      if (task.stage === "done") { task.stage = task.runs.length ? "doing" : "todo"; setStatus("已重开任务。"); break; }
      confirmAction("标记任务完成","关闭后暂停后续派遣与回复，已发送的执行仍可回报历史结果。","确认标记完成",() => {
        task.stage = "done";
        setStatus("已标记任务完成。");
      }); return;
    case "comment": simpleForm("comment-form","添加讨论","评论内容","普通讨论仅进入时间线。"); return;
    case "reply":
      editContext = { task, run, request:run.request };
      simpleForm("reply-form","保存答复","答复内容",run.request.text); return;
    case "add-input":
      editContext = { task, run };
      simpleForm("extra-form","发送补充","补充内容","补充先保存。会话忙时进入同任务的等待队列。"); return;
    case "follow": openFollow(task); return;
    case "cancel-follow":
      task.follow = null; setStatus("一次性跟进已取消。"); break;
    case "snapshot": {
      const found = task.runs.find(item => item.id === value);
      openEditor("执行快照",`<article class="stack snapshot"><strong>${html(found.snapshot.title)}</strong>
        <small>${found.snapshotId} · ${html(spaces[found.snapshot.space])} · ${html(providers[found.snapshot.provider])} · ${html(found.snapshot.model || "默认模型")}</small>
        <p>${html(found.snapshot.body)}</p>${found.snapshot.extra ? `<p>${html(found.snapshot.extra)}</p>` : ""}${found.replySnapshot ? `<p>${html(found.replySnapshot)}</p>` : ""}</article>`); return;
    }
    case "site":
      openEditor("原运行现场",`<article class="stack snapshot"><strong>${html(spaces[run.snapshot.space])} · ${html(providers[run.snapshot.provider])}</strong>
        <div class="card mono">${html(run.session)} · ${html(run.id)}<br>${html(run.note)}</div>
        ${run.stage === "blocked" && task.stage !== "done" ? btn("site-resume","模拟现场已处理","","primary") : ""}</article>`); return;
    case "site-resume":
      markRunning(task,run); byId("editor").close(); break;
    case "event": background(task,byId("event-mode").value); break;
    case "retry-delivery": deliver(task,task.runs.find(item => item.id === value)); break;
    case "advance": state.now += 15 * 60000; setStatus("模拟时钟已前进 15 分钟。"); break;
    case "tomorrow": {
      const today = Date.parse(wall(state.now,"Asia/Taipei").slice(0,10));
      state.now = wallCandidates(`${dateKey(today + day)}T09:00`,"Asia/Taipei")[0];
      setStatus("模拟时钟已跳到明天 09:00。"); break;
    }
    case "tick": triggerDue(); break;
    case "restart": restart(); break;
    case "reset":
      state = initial();
      byId("fault").value = "normal";
      byId("event-mode").value = "question";
      break;
    default: return;
  }
  render();
  if ((act === "task" || act === "go-task") && innerWidth <= 760) {
    const detail = byId("detail");
    detail.tabIndex = -1;
    detail.focus();
    detail.scrollIntoView({ block:"start" });
  } else if (!control.isConnected) {
    [...document.querySelectorAll(`[data-act="${act}"]`)].find(item => item.dataset.value === value)?.focus({preventScroll:true});
  }
});

document.addEventListener("change", event => {
  const input = event.target;
  if (input.dataset.ruleSwitch) {
    const rule = state.rules.find(item => item.id === input.dataset.ruleSwitch);
    toggleRule(rule,input.checked);
    render();
    document.querySelector(`[data-rule-switch="${rule.id}"]`)?.focus({preventScroll:true});
  }
  if (input.id === "kind") byId("target-fields").hidden = input.value !== "Agent";
  if (input.id === "rule-kind") {
    byId("scanner-fields").hidden = input.value !== "existing";
    byId("template-fields").hidden = input.value !== "template";
  }
  if (input.id === "span") byId("custom-fields").hidden = input.value !== "custom";
});
document.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const task = activeTask();
  try {
    if (form.id === "task-form") saveTask(data);
    if (form.id === "rule-form") saveRule(data);
    if (form.id === "confirm-form") editContext.apply();
    if (form.id === "follow-form") {
      const target = editContext.task;
      const time = resolveWall(data.get("follow-at"),target.zone,data.get("follow-overlap"),"跟进时间");
      if (time <= state.now) throw Error("跟进时间需晚于当前模拟时钟。");
      target.follow = { time, sent:false };
      setStatus("一次性跟进已保存。");
    }
    if (["comment-form","reply-form","extra-form"].includes(form.id)) {
      const body = data.get("input-body").trim();
      if (!body) throw Error("请输入内容。");
      if (form.id === "comment-form") { timeline(task,"讨论",body); setStatus("讨论已保存。"); }
      if (form.id === "reply-form") {
        const { task, run } = editContext;
        if (lastRun(task) !== run || run.request !== editContext.request) throw Error("该问题版本已变更。");
        acceptAnswer(task,run,body,takeFault());
      }
      if (form.id === "extra-form") {
        const { task, run } = editContext;
        if (lastRun(task) !== run) throw Error("目标运行已变化。请从当前运行重新提交。");
        const fault = takeFault();
        if (fault === "readonly") throw Error("Vault 只读，补充尚未保存。");
        timeline(task,"补充信息",body);
        if (hasLiveRun(task)) {
          run.supplements ??= [];
          run.supplements.push(body);
          setStatus("已保存补充 · 等候当前工作轮次结束。");
        } else dispatch(task,"manual",null,fault,body,run);
      }
    }
  } catch (error) {
    const feedback = byId("form-error");
    feedback.hidden = false;
    feedback.textContent = error.message;
    return;
  }
  byId("editor").close();
  render();
});

byId("theme").addEventListener("change", event => {
  document.documentElement.dataset.theme = event.target.value;
});
byId("appearance").addEventListener("click",event => {
  const dark = document.documentElement.dataset.mode === "light";
  document.documentElement.dataset.mode = dark ? "dark" : "light";
  event.target.textContent = dark ? "浅色" : "深色";
  event.target.setAttribute("aria-label",dark ? "切换浅色外观" : "切换深色外观");
});

state = initial();
render();

