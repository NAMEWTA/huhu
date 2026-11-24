const longTask = "整理北岸第三次访谈的原文、授权范围与周五分享前的三组时间戳";
const tasks = {
  selected: "task-coast", records: [
    { id: "task-coast", title: longTask, body: "复查引用与授权，遇到版本分歧时先问负责人。", kind: "agent", due: "2026-11-27", tags: "研究,归档,周五", target: "口述史 / Codex", question: "确认使用经匿名处理的访谈稿？", state: "等待答复", comments: [], plan: "plan-task-reminder" },
    { id: "task-labels", title: "校对资料标签", body: "整理样片、录音和照片的共同标签。", kind: "human", due: "", tags: "归档", state: "待办", comments: [] },
  ], failPlan: false,
};
const captures = { rows: [{ id: "capture-archive", title: "走访录音收到补录", body: "第二段注明公共档案引用许可。", source: "手动", state: "待整理" }], selected: "capture-archive", failNext: false };
const mail = {
  accounts: [
    { id: "work", name: "北岸研究室", address: "research@example.test" },
    { id: "personal", name: "个人", address: "lin@example.test" },
  ], account: "work", folder: "in", selected: "m-archive", step: 0, width: 280, drafts: {},
  threads: [
    { id:"m-archive", account:"work", who:"宋宁", subject:"确认档案馆第 3 批扫描件", time:"10:42", body:"今天完成了第三批的登记。扫描件分为已授权、待核对两组，等你补一份统一的标记。", to:"song@example.test" },
    { id:"m-field", account:"work", who:"许一", subject:"周五走访时间及停车位置", time:"昨天", body:"周五上午十点在北岸馆见。停车位在入口右侧，三脚架可提前寄放。", to:"xu@example.test" },
    { id:"m-lab", account:"personal", who:"文献室", subject:"借阅登记回执", time:"11 月 20 日", body:"已登记，请于本周五前归还资料。", to:"library@example.test" },
  ], outbox:[
    { id:"out-unknown", subject:"同步周五资料包", to:"group@example.test", accepted:0, outcome:"结果未知", body:"请核实本邮件，避免重复投递。" },
    { id:"out-failure", subject:"照片原件清单", to:"records@example.test", accepted:1, outcome:"部分失败", body:"其中一位收件人已接收，另一位地址被拒绝。" },
  ],
};

function planLink(key, text = "在自动化中心管理") {
  return `<a href="../automations/index.html#plans/${key}">${text}</a>`;
}

function commonDatePicker(input) {
  const selected = input.value || todayDay;
  const [year, month, day] = selected.split("-");
  const months = Array.from({ length: 12 }, (_, i) => {
    const n = String(i + 1).padStart(2, "0");
    return option(n, new Intl.DateTimeFormat(notes.language, { month:"long", timeZone:"UTC" }).format(Date.UTC(2026, i, 1)), month);
  }).join("");
  const dialog = modal("选择截止日期", `<form class="dialog-form"><div class="dialog-body stack"><div class="date-parts">
    ${field("年", `<input name="year" type="number" min="1" max="9999" value="${year}" required autofocus>`)}
    ${field("月", `<select name="month">${months}</select>`)}
    ${field("日", `<select name="day"></select>`)}
  </div><p class="meta">日期按日历记录。清空后没有截止日期。</p></div><footer class="dialog-footer"><button type="button" id="date-clear">清除</button><button type="button" id="date-today">今天</button><button type="submit" class="primary">确定</button></footer></form>`);
  const form = by("form", dialog);
  const readDays = (value) => {
    const end = new Date(0);
    end.setUTCFullYear(Number(form.elements.year.value), Number(form.elements.month.value), 0);
    const count = Number.isNaN(end.getTime()) ? 31 : end.getUTCDate();
    const select = form.elements.day;
    select.innerHTML = '<option value="">选择日期</option>' + Array.from({ length: count }, (_, i) => option(String(i + 1).padStart(2,"0"), String(i + 1), value)).join("");
    select.required = true;
  };
  readDays(day);
  form.elements.year.onchange = form.elements.month.onchange = () => readDays(form.elements.day.value);
  const done = (value) => {
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles:true }));
    dialog.close();
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    const values = new FormData(form);
    done(`${values.get("year").padStart(4,"0")}-${values.get("month")}-${values.get("day")}`);
  };
  bind("date-clear", () => done(""), dialog);
  bind("date-today", () => done(todayDay), dialog);
}

function taskEditor(record = null) {
  const data = record ?? { title:"", body:"", tags:"", kind:"human", due:"" };
  const [space = "口述史", provider = "Codex"] = data.target?.split(" / ") ?? [];
  let dirty = false;
  const dialog = modal(record ? "编辑任务" : "新建任务", `<form class="dialog-form">
    <div class="dialog-body module-container form-container"><div class="form-grid">
      <section class="stack"><h3>任务内容</h3>
        ${field("任务名称", `<input name="title" required autofocus maxlength="200" value="${escapeHtml(data.title)}">`)}
        ${field("任务正文", `<textarea name="body" rows="7">${escapeHtml(data.body)}</textarea>`)}
        ${field("标签", `<input name="tags" placeholder="研究, 归档" value="${escapeHtml(data.tags)}">`)}
        <div class="tag-list" id="task-tags"></div>
        ${field("截止日期", `<input name="due" id="task-due" placeholder="YYYY-MM-DD" readonly value="${data.due}">`)}
        <div>${button("选择截止日期", { name:"CalendarClock", attrs:"id=task-pick-date" })}</div>
      </section><aside class="stack">
        ${field("执行方式", `<select name="kind">${option("human","个人待办",data.kind)}${option("agent","由 Agent 执行",data.kind)}<option disabled>不支持的执行模式</option></select>`)}
        <div id="task-target" class="stack" hidden>
          ${field("Space", `<select name="space">${["口述史","出版校对"].map((item)=>option(item,item,space)).join("")}</select>`)}
          ${field("Agent", `<select name="provider">${["Codex","Pi"].map((item)=>option(item,item,provider)).join("")}</select>`)}
          ${field("最早派遣时间（America/New_York）", `<input name="wall" type="datetime-local" value="${escapeHtml(data.wall)}">`)}
          <div class="stack" id="task-fold"></div>
        </div>
        ${field("提醒", `<select name="reminder">${option("off","不设提醒",data.plan ? "on" : "off")}${option("on","截止当日 09:00",data.plan ? "on" : "off")}</select>`)}
        <p class="meta">提醒由统一计划管理。截止日期本身可以只作参考。</p>
        ${data.plan ? planLink(data.plan) : ""}
      </aside></div><p id="task-error" class="notice err form-notice" role="alert" hidden></p></div>
    <footer class="dialog-footer"><button type="button" data-close>取消</button><button class="primary" type="submit">保存任务</button></footer>
  </form>`, { wide:true, closing: (current) => {
    if (!dirty) return true;
    confirmation("放弃任务草稿", "尚有未保存的变更。", "放弃", () => current.close());
    return false;
  } });
  const form = by("form", dialog);
  const updateFields = () => {
    by("#task-target", dialog).hidden = form.elements.kind.value !== "agent";
    by("#task-tags", dialog).innerHTML = form.elements.tags.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean).map((x) => badge(x)).join("");
    const value = form.elements.wall.value;
    if (value === "2026-11-01T01:30") {
      if (!form.elements.fold) by("#task-fold", dialog).innerHTML = `<fieldset><legend>该时刻出现两次</legend>
        <label><input type="radio" name="fold" value="earlier" ${data.fold==="earlier"?"checked":""}> 01:30（UTC−04:00）</label>
        <label><input type="radio" name="fold" value="later" ${data.fold==="later"?"checked":""}> 01:30（UTC−05:00）</label></fieldset>`;
    } else by("#task-fold", dialog).replaceChildren();
  };
  updateFields();
  form.oninput = form.onchange = () => { dirty = true; updateFields(); };
  bind("task-pick-date", () => commonDatePicker(form.elements.due), dialog);
  form.onsubmit = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    let error = "";
    if (values.kind === "agent" && values.wall === "2026-03-08T02:30") error = "该本地时间因夏令时跳过，请选择其他时刻。";
    if (values.kind === "agent" && values.wall === "2026-11-01T01:30" && !values.fold) error = "请选择回拨前或回拨后的时刻。";
    if (!values.title.trim()) error = "请填写任务名称。";
    if (error) {
      by("#task-error", dialog).textContent = error;
      by("#task-error", dialog).hidden = false;
      return;
    }
    const saved = record ?? { id:crypto.randomUUID(), state:"待办", comments:[] };
    const planId = saved.plan ?? (saved.id==="task-coast"?"plan-task-reminder":`plan-${saved.id}`);
    Object.assign(saved, {
      title:values.title.trim(), body:values.body, due:values.due, tags:values.tags, kind:values.kind,
      target:values.kind === "agent" ? `${values.space} / ${values.provider}` : "", wall:values.wall, fold:values.fold,
      plan:values.reminder === "on" && !tasks.failPlan ? planId : null,
      planPending:values.reminder === "on" && tasks.failPlan,
    });
    if (!record) tasks.records.unshift(saved);
    tasks.selected = saved.id;
    tasks.failPlan = false;
    by('[data-demo="task-plan"]').value = "ok";
    dialog.close();
    if (app.route === "tasks") showTasks();
    setStatus("任务已保存。");
  };
}

function showTasks() {
  const record = tasks.records.find((item) => item.id === tasks.selected);
  main.innerHTML = `<div class="module-container"><div class="stack">
    ${heading("任务", "个人待办与 Agent 执行", button("新建任务", { name:"Plus", className:"primary", attrs:"id=new-task" }))}
    <div class="two-up"><section class="card"><h2>任务列表</h2><div class="stack task-rows">${tasks.records.map((item) => `<button type="button" class="list-button" data-task="${item.id}" aria-pressed="${item === record}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.state)} · ${item.kind === "agent" ? "Agent" : "个人"}${item.due ? ` · ${item.due}` : ""}</small></button>`).join("")}</div></section>
    <section class="card stack" id="task-detail" tabindex="-1"><div class="bar">${badge(record.state, record.question ? "warn" : "")}${button("编辑任务", { className:"small", attrs:"id=edit-task" })}</div>
    <h2>${escapeHtml(record.title)}</h2><p>${escapeHtml(record.body)}</p>
    ${record.target ? `<p class="meta">执行目标 · ${escapeHtml(record.target)}</p>` : ""}
    <p>截止日期 · ${record.due || "未设日期"}</p><div class="tag-list">${record.tags.split(/[,，]/).filter(Boolean).map((x) => badge(x)).join("")}</div>
    ${record.plan ? `<div class="callout"><strong>任务提醒</strong><p>来源计划 ${escapeHtml(record.plan)}</p>${record.plan==="plan-task-reminder"?planLink(record.plan):button("查看已登记计划",{className:"small",attrs:"id=view-task-reminder"})}</div>` : ""}
    ${record.planPending ? `<div class="callout warn">任务已保存，提醒未登记。 ${button("登记原提醒", { attrs:"id=retry-plan", className:"small" })}</div>` : ""}
    ${record.question ? `<div class="callout warn"><strong>Agent 正在等待你的答复</strong><p>${escapeHtml(record.question)}</p>${button("答复问题", { attrs:"id=reply-task", className:"small" })}</div>` : ""}
    <h3>活动</h3><ul class="list">${record.comments.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    ${button("添加普通评论", { attrs:"id=comment-task", className:"small" })}
    </section></div></div></div>`;
  bind("new-task", () => taskEditor());
  bind("edit-task", () => taskEditor(record));
  bind("retry-plan", () => { record.planPending = false; record.plan = record.id==="task-coast"?"plan-task-reminder":`plan-${record.id}`; showTasks(); });
  bind("view-task-reminder", () => modal("任务提醒",`<div class="dialog-body stack"><p>${escapeHtml(record.title)} · 截止当日 09:00</p><p>${badge("已登记","ok")} <code>${escapeHtml(record.plan)}</code></p></div><footer class="dialog-footer"><button type="button" data-close>返回任务</button></footer>`));
  markCurrent(main, "task", tasks.selected, (id) => {
    tasks.selected = id;
    showTasks();
    by("#task-detail").focus();
  });
  const write = (reply) => {
    const title = reply ? "答复原问题" : "普通评论";
    const dialog = modal(title, `<form class="dialog-form"><div class="dialog-body">${field(title,'<textarea name="text" required autofocus></textarea>')}</div><footer class="dialog-footer"><button type="button" data-close>取消</button><button type="submit" class="primary">${reply ? "发送回答" : "保存评论"}</button></footer></form>`);
    by("form", dialog).onsubmit = (event) => {
      event.preventDefault();
      const text = new FormData(event.currentTarget).get("text").trim();
      if (!text) return;
      record.comments.push(reply ? `Web · 已接收的原问题答复：${text}` : `我 · 普通评论：${text}`);
      if (reply) { record.question = null; record.state = "执行中"; }
      dialog.close();
      showTasks();
      by("#task-detail").focus();
    };
  };
  bind("reply-task", () => write(true));
  bind("comment-task", () => write(false));
}

function captureEditor() {
  const dialog = modal("快速捕获", `<form class="dialog-form"><div class="dialog-body stack">
    ${field("标题", '<input name="title" required autofocus>')}
    <div class="capture-area">${field("内容", '<textarea name="body" rows="7" placeholder="输入 / 打开命令" aria-controls="capture-commands"></textarea>')}
    <div id="capture-commands" class="capture-commands" role="listbox" aria-label="编辑命令" hidden></div></div>
    ${field("来源", '<select name="source"><option>手动</option><option>选中文本</option><option>链接</option></select>')}
    </div><footer class="dialog-footer"><button type="button" data-close>取消</button><button class="primary" type="submit">收进收件箱</button></footer></form>`);
  const form = by("form", dialog);
  const editor = form.elements.body;
  const commands = by("#capture-commands", dialog);
  const actions = [{ name:"二级标题", value:"## " }, { name:"任务清单", value:"- [ ] " }, { name:"引用", value:"> " }, { name:"北岸口述史资料", value:"[[北岸口述史资料]]" }];
  let start = -1, index = 0, choices = [];
  const dismiss = () => {
    commands.hidden = true;
    editor.removeAttribute("aria-activedescendant");
  };
  const choose = (item) => {
    editor.focus();
    editor.setRangeText(item.value, start, editor.selectionStart, "end");
    dismiss();
  };
  const paint = () => {
    commands.innerHTML = choices.map((item, i) => `<div id="command-option-${i}" role="option" aria-selected="${i === index}" data-command="${i}">${escapeHtml(item.name)}</div>`).join("");
    editor.setAttribute("aria-activedescendant", `command-option-${index}`);
    all("[data-command]", commands).forEach((entry) => {
      entry.onmousedown = (event) => event.preventDefault();
      entry.onclick = () => choose(choices[Number(entry.dataset.command)]);
    });
  };
  const suggest = () => {
    const match = /(?:^|[\s])([/@])([^\s]*)$/.exec(editor.value.slice(0, editor.selectionStart));
    if (!match) return dismiss();
    choices = match[1] === "@" ? actions.slice(3) : actions.slice(0,3);
    choices = choices.filter((item) => item.name.includes(match[2]));
    if (!choices.length) return dismiss();
    start = editor.selectionStart - match[1].length - match[2].length;
    index = 0;
    commands.hidden = false;
    paint();
  };
  editor.oninput = (event) => { if (!event.isComposing) suggest(); };
  editor.oncompositionend = suggest;
  editor.onkeydown = (event) => {
    if (commands.hidden || event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      index = (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
      paint();
    }
    if (event.key === "Enter") { event.preventDefault(); choose(choices[index]); }
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    const item = Object.fromEntries(new FormData(form));
    if (!item.title.trim()) return;
    item.id = crypto.randomUUID();
    item.state = "待整理";
    captures.rows.push(item);
    captures.selected = item.id;
    dialog.close();
    showInbox();
    setStatus("捕获项已保存。");
  };
}

function convertCapture(capture, target) {
  const candidate = capture.conversion ?? { id:target==="note"?`note-${crypto.randomUUID()}`:crypto.randomUUID(), source:capture.id, target };
  capture.conversion = candidate;
  if (candidate.target==="note") {
    notes.files[candidate.id] ??= { title:capture.title, stored:`# ${capture.title}\n${capture.body}`, comments:[] };
  } else if (!tasks.records.some(({ id }) => id === candidate.id)) {
    tasks.records.unshift({ id:candidate.id, title:capture.title, body:capture.body, tags:"", kind:"human", due:"", state:"待办", comments:[] });
  }
  capture.state = captures.failNext ? "转换结果未知" : candidate.target==="note"?"已转为笔记":"已转为任务";
  captures.failNext = false;
  by('[data-demo="capture-save"]').value = "ok";
  showInbox();
}

function showInbox() {
  const selected = captures.rows.find(({ id }) => id === captures.selected);
  const needsAnswer = tasks.records.find(({ question }) => Boolean(question));
  main.innerHTML = `<div class="module-container stack">
    ${heading("收件箱", "", button("快速捕获", { name:"Plus", attrs:"id=quick-capture", className:"primary" }))}
    <div class="two-up"><section class="card stack"><div class="bar"><h2>捕获</h2>${badge(captures.rows.length)}</div>
    ${captures.rows.map((item) => `<button class="list-button" type="button" data-capture="${item.id}" aria-pressed="${item === selected}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.source)} · ${escapeHtml(item.state)}</small></button>`).join("")}
    </section><section class="card stack" id="capture-detail">
    <h2>${escapeHtml(selected.title)}</h2><pre>${escapeHtml(selected.body)}</pre>
    <div class="row">${selected.state === "待整理" ? button("转为任务", { attrs:"id=convert-capture" })+button("转为笔记",{attrs:"id=convert-note"}) : selected.state === "转换结果未知" ? button("核实原转换", { attrs:"id=verify-convert" }) : button("打开转换后的"+(selected.conversion.target==="note"?"笔记":"任务"), { attrs:"id=open-convert" })}</div>
    <small>${escapeHtml(selected.state)}</small></section></div>
    <section class="card stack"><h2>待处理</h2>
    ${needsAnswer ? button("任务等待答复 · " + needsAnswer.title, { name:"MessageSquare", attrs:"id=from-question", className:"list-button" }) : "<p>没有等待答复的问题。</p>"}
    ${mail.outbox.filter(({outcome}) => outcome !== "已投递").map((item) => button(`${item.outcome} · ${item.subject}`, { name:"Mail", className:"list-button", attrs:`data-outbox-link="${item.id}"` })).join("")}
    </section></div>`;
  bind("quick-capture", captureEditor);
  markCurrent(main, "capture", captures.selected, (key) => { captures.selected = key; showInbox(); });
  bind("convert-capture", () => convertCapture(selected,"task"));
  bind("convert-note", () => convertCapture(selected,"note"));
  bind("verify-convert", () => convertCapture(selected));
  bind("open-convert", () => {
    if(selected.conversion.target==="note"){notes.current=selected.conversion.id;notes.mode="edit";openPage("notes");}
    else{tasks.selected=selected.conversion.id;openPage("tasks");}
  });
  bind("from-question", () => { tasks.selected = needsAnswer.id; openPage("tasks"); by("#task-detail").focus(); });
  all("[data-outbox-link]", main).forEach((entry) => entry.onclick = () => {
    mail.folder = "out"; mail.selected = entry.dataset.outboxLink; mail.step = 2; openPage("mail");
  });
}

function accountDialog() {
  const dialog = modal("邮件账户设置", `<form class="dialog-form"><div class="dialog-body stack">
    <p>添加用于走查的账户。连接测试使用内置样例。</p>
    ${field("账户名称", '<input name="name" required autofocus>')}
    ${field("邮件地址", '<input name="address" type="email" required placeholder="name@example.test">')}
    <p id="mail-account-result" role="status"></p><hr><div><strong>定期同步</strong><p>计划由自动化中心管理。</p>${planLink("plan-mail")}</div></div>
    <footer class="dialog-footer"><button type="button" data-close>关闭</button><button class="primary" type="submit">添加账户</button></footer></form>`);
  by("form", dialog).onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!data.get("name").trim()) return;
    if (mail.accounts.some(({ address }) => address === data.get("address"))) {
      by("#mail-account-result", dialog).textContent = "该地址已经存在。";
      return;
    }
    const id = crypto.randomUUID();
    mail.accounts.push({ id, name:data.get("name"), address:data.get("address") });
    mail.account = id; mail.step = 1; mail.folder = "in"; mail.selected = null;
    dialog.close();
    showMail();
  };
}

function mailComposer(thread, reply = true) {
  const identity = reply ? thread.id : "new";
  const draft = mail.drafts[identity] ?? { to:reply ? thread.to : "", subject:reply ? `回复：${thread.subject}` : "", body:"" };
  const dialog = modal(reply ? "回复邮件" : "写邮件", `<form class="dialog-form"><div class="dialog-body stack">
    ${field("收件人", `<input name="to" type="email" multiple value="${escapeHtml(draft.to)}" required>`)}
    ${field("主题", `<input name="subject" value="${escapeHtml(draft.subject)}" required>`)}
    ${field("邮件正文", `<textarea name="body" required autofocus rows="8">${escapeHtml(draft.body)}</textarea>`)}
    <p id="draft-mail-state" role="status">${mail.drafts[identity] ? "已恢复草稿" : ""}</p>
    </div><footer class="dialog-footer"><button type="button" data-close>关闭</button><button type="button" id="save-mail-draft">保存草稿</button><button class="primary" type="submit">模拟发送</button></footer></form>`, { wide:true });
  const form = by("form", dialog);
  const read = () => Object.fromEntries(new FormData(form));
  form.oninput = () => { mail.drafts[identity] = read(); by("#draft-mail-state", dialog).textContent = "草稿已保留"; };
  bind("save-mail-draft", () => { mail.drafts[identity] = read(); dialog.close(); showMail(); }, dialog);
  form.onsubmit = (event) => {
    event.preventDefault();
    const values = read();
    const id = crypto.randomUUID();
    const recipients = values.to.split(",").map((value) => value.trim());
    const part = recipients.length > 1;
    mail.outbox.unshift({ id, ...values, accepted:1, denied:part ? recipients.slice(1) : [], outcome:part ? "部分失败" : "已投递" });
    delete mail.drafts[identity];
    mail.folder = "out"; mail.selected = id; mail.step = 2;
    dialog.close();
    showMail();
  };
}

function showMail() {
  const account = mail.accounts.find(({ id }) => id === mail.account);
  const rows = mail.folder === "out" ? mail.outbox : mail.threads.filter((row) => row.account === mail.account);
  const message = rows.find(({ id }) => id === mail.selected);
  const inbox = mail.folder === "in";
  const tools = button("同步", { name:"RefreshCcw", attrs:"id=mail-sync" }) + button("账户设置", { name:"Settings2", attrs:"id=mail-settings" }) + button("写邮件", { name:"Plus", className:"primary", attrs:account ? "id=mail-compose" : "id=mail-compose disabled" });
  main.innerHTML = `<div class="module-container">
    ${heading("邮件", "", tools)}
    <div class="triple mail-columns" style="--conversation-width:${mail.width}px">
    <section class="mail-accounts ${mail.step === 0 ? "active-panel" : ""}"><h2>账户</h2>
      <div class="stack">${mail.accounts.length ? mail.accounts.map((item) => `<button type="button" class="list-button" data-mail-account="${item.id}" aria-pressed="${item === account}"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.address)}</small></button>`).join("") : '<p>还没有邮件账户。</p>'}
      ${button("添加账户", { name:"Plus", attrs:"id=mail-add", className:"small" })}</div>
    </section><section class="mail-conversations ${mail.step === 1 ? "active-panel" : ""}">
      ${button("返回账户", { name:"ArrowLeft", className:"quiet narrow-back", attrs:"id=mail-back-account" })}
      <div class="segments">${tab("收件箱",inbox,'data-mail-folder="in"')}${tab("发件箱",!inbox,'data-mail-folder="out"')}</div>
      <div class="stack mail-list">${rows.length ? rows.map((row) => `<button type="button" class="list-button" data-mail-thread="${row.id}" aria-pressed="${row === message}"><strong>${escapeHtml(row.subject)}</strong><small>${escapeHtml(row.who ?? row.to)} · ${escapeHtml(row.time ?? row.outcome)}</small></button>`).join("") : '<p class="empty">还没有邮件。</p>'}</div>
      <div class="column-divider" role="separator" aria-label="调整会话栏宽度" aria-orientation="vertical" aria-valuemin="180" aria-valuemax="440" aria-valuenow="${mail.width}" tabindex="0"></div>
    </section><section class="mail-reader ${mail.step === 2 ? "active-panel" : ""}">
      ${button("返回会话", { name:"ArrowLeft", className:"quiet narrow-back", attrs:"id=mail-back-thread" })}
      ${message ? `<div class="stack" id="mail-message" tabindex="-1"><div class="bar"><h2>${escapeHtml(message.subject)}</h2>${inbox ? "" : badge(message.outcome,message.outcome === "已投递" ? "ok" : "warn")}</div>
      <p class="meta">${escapeHtml(message.who ?? message.to)}</p><hr><p>${escapeHtml(message.body)}</p>
      ${inbox ? button(mail.drafts[message.id] ? "继续回复草稿" : "回复", { name:"Mail", attrs:"id=mail-reply" }) :
        `<p>已接收 ${message.accepted} 位收件人</p>${message.outcome === "结果未知" ? button("核实原投递", { attrs:"id=mail-verify" }) : message.outcome === "部分失败" ? `<p>未送达 · ${escapeHtml(message.denied?.join("、") || " archive-old@example.test")}</p>${button("重试未送达收件人", { attrs:"id=mail-retry" })}` : ""}`}
      </div>` : '<p class="empty">选择一封邮件阅读。</p>'}
    </section></div></div>`;
  markCurrent(main, "mail-account", mail.account, (id) => {
    mail.account = id; mail.step = 1; mail.selected = mail.threads.find((row) => row.account === id)?.id; mail.folder = "in"; showMail();
    by("[data-mail-thread]", main)?.focus();
  });
  markCurrent(main, "mail-folder", mail.folder, (id) => {
    mail.folder = id; mail.step = 1;
    mail.selected = (id === "in" ? mail.threads.find((row) => row.account === mail.account) : mail.outbox[0])?.id;
    showMail();
    by(`[data-mail-folder="${id}"]`)?.focus();
  });
  markCurrent(main, "mail-thread", mail.selected, (id) => { mail.selected = id; mail.step = 2; showMail(); by("#mail-message")?.focus(); });
  bind("mail-back-account", () => { mail.step = 0; showMail(); by(`[data-mail-account="${mail.account}"]`)?.focus(); });
  bind("mail-back-thread", () => { mail.step = 1; showMail(); by(`[data-mail-thread="${mail.selected}"]`)?.focus(); });
  bind("mail-sync", () => {
    setStatus(account ? "正在更新会话…" : "请先添加邮件账户。");
    if (account) setTimeout(() => { if (app.route === "mail") setStatus("会话列表已更新。"); }, 450);
  });
  bind("mail-add", accountDialog);
  bind("mail-settings", accountDialog);
  bind("mail-compose", () => mailComposer(null, false));
  bind("mail-reply", () => mailComposer(message));
  bind("mail-verify", () => { message.outcome = "已投递"; message.accepted = 1; showMail(); });
  bind("mail-retry", () => { message.outcome = "已投递"; message.accepted += message.denied?.length ?? 1; message.denied = []; showMail(); });
  const divider = by(".column-divider", main);
  const resize = (value) => {
    mail.width = Math.max(180, Math.min(440, value));
    by(".mail-columns", main).style.setProperty("--conversation-width", `${mail.width}px`);
    divider.setAttribute("aria-valuenow", String(mail.width));
  };
  divider.onkeydown = (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault(); resize(mail.width + (event.key === "ArrowLeft" ? -10 : 10));
    }
  };
  divider.onpointerdown = (event) => {
    divider.setPointerCapture(event.pointerId);
    const start = { x:event.clientX, width:mail.width };
    divider.onpointermove = (next) => resize(start.width + next.clientX - start.x);
    divider.onpointerup = divider.onpointercancel = () => { divider.onpointermove = null; };
  };
}
