const todayDay = "2026-11-24";
const initialMarkdown = "# 2026 年 11 月 24 日 · 日记\n今早整理了北岸口述史项目的走访记录，准备周五发给小组。\n## 今天的工作\n- [x] 核对访谈授权书\n- [ ] 汇总三处待核对的地名\n> 和讲述者确认原话，再写入公开底稿。\n![[访谈整理进度]]\n## 实验记录\n```text\narchive / research / interviews\n```\n下周把带时间戳的版本交给校对组。";
const notes = {
  current: todayDay, month: "2026-11", mode: "edit", language: "zh-CN", saveNext: "ok",
  files: {
    [todayDay]: { stored: initialMarkdown, comments: [{ id: "c1", line: 1, quote: "准备周五发给小组", body: "对照共享盘的版本号后再发。", resolved: false }] },
    "2026-11-21": { stored: "# 2026 年 11 月 21 日 · 日记\n内页排版和照片清单已经确认。", comments: [] },
    "2026-11-20": { stored: "# 2026 年 11 月 20 日 · 日记\n在旧地图上标了第一批地名。", comments: [] },
  },
};
const currentNote = () => notes.files[notes.current];
const noteText = (note) => note.draft ?? note.stored;
const dayKey = (date) => date.toISOString().slice(0, 10);
const calendarDate = (key) => new Date(`${key}T12:00:00Z`);

function calendarView() {
  const first = calendarDate(`${notes.month}-01`);
  const firstOffset = (first.getUTCDay() + 6) % 7;
  const monthTitle = new Intl.DateTimeFormat(notes.language, { year: "numeric", month: "long", timeZone: "UTC" }).format(first);
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(notes.language, { weekday: "narrow", timeZone: "UTC" }).format(Date.UTC(2026, 10, 23 + i)));
  const cells = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(first);
    date.setUTCDate(1 + i - firstOffset);
    const key = dayKey(date);
    return `<button class="day quiet" type="button" data-day="${key}" aria-label="${key}${notes.files[key] ? ' · 有日记' : ''}" aria-pressed="${key === notes.current}" ${key === todayDay ? 'aria-current="date"' : ""} data-outside="${key.slice(0, 7) !== notes.month}">${date.getUTCDate()}${notes.files[key] ? '<span class="dot"></span>' : ""}</button>`;
  });
  return `<section class="calendar" aria-label="日记月历"><div class="bar calendar-head">
    ${button("", { name:"ChevronLeft", aria:"上个月", className:"quiet small", attrs:"id=cal-prev" })}
    <strong>${monthTitle}</strong>
    ${button("", { name:"ChevronRight", aria:"下个月", className:"quiet small", attrs:"id=cal-next" })}
    </div><div class="calendar-grid"><div class="weekdays">${weekdays.map((day) => `<span>${day}</span>`).join("")}</div>${cells.join("")}</div>
    <div class="bar calendar-foot">${button(notes.language === "en" ? "Today" : "今天", { className:"quiet small", attrs:"id=cal-today" })}${button(notes.language === "en" ? "中文" : "English", { className:"quiet small", attrs:"id=cal-lang" })}</div>
    </section>`;
}

function changeNote(key, requestCreate = true) {
  const enter = () => {
    notes.current = key;
    if (!key.startsWith("note-")) notes.month = key.slice(0, 7);
    notes.mode = "edit";
    renderShell();
    by(`[data-day="${key}"], [data-note-file="${key}"]`, menu)?.focus();
  };
  const choose = () => {
    if (!notes.files[key] && requestCreate) {
      confirmation("新建日记", `为 ${key} 建立一篇日记。`, "创建", () => {
        notes.files[key] ??= { stored: `# ${key} · 日记\n新的一天。`, comments: [] };
        enter();
      });
    } else if (notes.files[key]) enter();
  };
  if (!guardNote(choose)) choose();
}

function renderCalendar() {
  by("#calendar-slot", menu).innerHTML = calendarView();
  const files = Object.keys(notes.files).filter((key) => key.startsWith("note-"));
  by("#note-files",menu).innerHTML = files.length ? '<p class="sidebar-title">笔记</p>'
    + files.map((key) => button(notes.files[key].title, { className:"quiet nav-link", name:"FileText",attrs:`data-note-file="${key}" ${key===notes.current?'aria-current="page"':""}` })).join("") : "";
  all("[data-note-file]", menu).forEach((entry)=>entry.onclick=()=>changeNote(entry.dataset.noteFile,false));
  const moveMonth = (direction) => {
    const date = calendarDate(`${notes.month}-01`);
    date.setUTCMonth(date.getUTCMonth() + direction);
    notes.month = dayKey(date).slice(0, 7);
    renderCalendar();
    by(direction < 0 ? "#cal-prev" : "#cal-next", menu).focus();
  };
  bind("cal-prev", () => moveMonth(-1), menu);
  bind("cal-next", () => moveMonth(1), menu);
  bind("cal-today", () => changeNote(todayDay), menu);
  bind("cal-lang", () => {
    notes.language = notes.language === "en" ? "zh-CN" : "en";
    renderCalendar();
    by("#cal-lang", menu).focus();
  }, menu);
  all("[data-day]", menu).forEach((entry) => {
    entry.onclick = () => changeNote(entry.dataset.day);
    entry.onkeydown = (event) => {
      const shift = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (!shift) return;
      event.preventDefault();
      const date = calendarDate(entry.dataset.day);
      date.setUTCDate(date.getUTCDate() + shift);
      const key = dayKey(date);
      if (!by(`[data-day="${key}"]`, menu)) {
        notes.month = key.slice(0, 7);
        renderCalendar();
      }
      by(`[data-day="${key}"]`, menu)?.focus();
    };
  });
}

function noteBlocks(markdown, editing, comments) {
  let inCode = false;
  const editable = editing ? 'contenteditable="plaintext-only" spellcheck="false"' : "";
  return markdown.split("\n").map((line, index) => {
    if (line.startsWith("```")) {
      inCode = !inCode;
      return "";
    }
    const parsed = /^([#]{1,3} |> |- \[[x ]\] |- )?(.*)$/.exec(line);
    const prefix = inCode ? "" : parsed[1] ?? "";
    const text = inCode ? line : parsed[2];
    const attrs = `data-line="${index}" ${editable}`;
    const annotated = comments.some((item) => item.line === index && text.includes(item.quote));
    const element = inCode ? "code" : ({ "# ": "h1", "## ": "h2", "### ": "h3", "> ": "blockquote" }[prefix] ?? "p");
    if (line === "![[访谈整理进度]]") {
      return '<aside class="note-embed card"><div class="bar"><strong>访谈整理进度</strong><small>7 / 10 份</small></div><progress value="7" max="10" aria-label="访谈整理进度"></progress></aside>';
    }
    const list = prefix.startsWith("- ");
    return `<${element} ${attrs} class="${annotated ? "annotated " : ""}${list ? "note-list" : ""}">${escapeHtml(text)}</${element}>`;
  }).join("");
}

function guardNote(continueTo) {
  if (app.route !== "notes") return false;
  const note = currentNote();
  if (note.draft === undefined || note.draft === note.stored) return false;
  const dialog = modal("未保存的文档", '<div class="dialog-body">离开前可以保存、保留草稿或继续编辑。</div><footer class="dialog-footer"><button type="button" data-close>继续编辑</button><button type="button" id="keep-note">保留草稿并离开</button><button type="button" id="save-leaving" class="primary">保存并离开</button></footer>');
  bind("keep-note", () => { dialog.close(); continueTo(); }, dialog);
  bind("save-leaving", async () => {
    const saved = await saveNote(note);
    dialog.close();
    if (saved) continueTo();
  }, dialog);
  return true;
}

function noteStatus() {
  if (!by("#note-state") || app.route !== "notes") return;
  const note = currentNote();
  const state = note.status ?? (note.draft !== undefined && note.draft !== note.stored ? "dirty" : "saved");
  const messages = {
    saved: "已保存", dirty: "有未保存的更改", progress: "正在保存", error: "保存失败，草稿已保留",
    unknown: "保存结果未知，可按原请求核实", conflict: "文档已被另一处修改，草稿已保留",
  };
  by("#note-state").innerHTML = badge(messages[state], { saved: "ok", error: "err", conflict: "warn", unknown: "warn", progress: "info" }[state]);
  by("#save-note").hidden = state === "unknown" || state === "conflict";
  by("#save-note").disabled = state === "progress" || state === "saved";
  by("#verify-note").hidden = state !== "unknown";
  by("#compare-note").hidden = state !== "conflict";
}

async function saveNote(note = currentNote()) {
  if (note.status === "progress" || note.status === "unknown" || note.status === "conflict") return false;
  const text = noteText(note);
  const outcome = notes.saveNext;
  notes.saveNext = "ok";
  by('[data-demo="note-save"]').value = "ok";
  note.status = "progress";
  noteStatus();
  await new Promise((resolve) => setTimeout(resolve, 450));
  if (outcome === "ok" || outcome === "unknown") note.stored = text;
  if (outcome === "conflict") note.stored += "\n共享工作台补记：照片编号需要复查。";
  note.status = outcome === "ok" ? undefined : outcome;
  if (outcome === "ok" && note.draft === text) delete note.draft;
  noteStatus();
  return outcome === "ok";
}

function editNoteLine(index, text) {
  const note = currentNote();
  const lines = noteText(note).split("\n");
  const prefix = /^([#]{1,3} |> |- \[[x ]\] |- )/.exec(lines[index])?.[1] ?? "";
  lines[index] = prefix + text;
  note.draft = lines.join("\n");
  if (note.status === "saved") note.status = undefined;
  if (!by("#verify-note").hidden || !by("#compare-note").hidden) return;
  noteStatus();
}

function annotate() {
  const selection = getSelection();
  const node = selection?.anchorNode;
  const block = (node?.nodeType === Node.TEXT_NODE ? node.parentElement : node)?.closest?.("[data-line]");
  const quote = selection?.toString().trim();
  if (!block || !by("#note-paper").contains(block) || !quote || !block.textContent.includes(quote)) {
    setStatus("先选中当前段落中的文字。");
    return;
  }
  const note = currentNote();
  const dialog = modal("添加批注", `<form class="dialog-form"><div class="dialog-body stack"><blockquote class="callout">${escapeHtml(quote)}</blockquote>${field("批注内容", '<textarea required name="comment" autofocus></textarea>')}</div><footer class="dialog-footer"><button type="button" data-close>取消</button><button class="primary" type="submit">保存批注</button></footer></form>`);
  by("form", dialog).onsubmit = (event) => {
    event.preventDefault();
    const body = new FormData(event.currentTarget).get("comment").trim();
    if (!body) return;
    note.comments.push({ id: crypto.randomUUID(), line: Number(block.dataset.line), quote, body, resolved: false });
    dialog.close();
    showNotes();
    setStatus("批注已保存。");
  };
}

function noteCommentList(note) {
  return note.comments.length ? note.comments.map((item) => {
    const present = noteText(note).split("\n")[item.line]?.includes(item.quote);
    return `<li class="stack"><div class="bar"><strong>${escapeHtml(item.quote)}</strong>${badge(present ? item.resolved ? "已解决" : "未解决" : "原文已变更", present ? "" : "warn")}</div><p>${escapeHtml(item.body)}</p><div class="row">
      ${button("定位", { className:"small", attrs:`data-locate="${item.id}" ${present ? "" : "disabled"}` })}
      ${button(item.resolved ? "重新打开" : "解决", { className:"small quiet", attrs:`data-resolve="${item.id}"` })}
      ${button("删除", { className:"small quiet", attrs:`data-remove-comment="${item.id}"` })}
    </div></li>`;
  }).join("") : '<li class="empty">暂时没有批注。</li>';
}

function showNotes() {
  renderCalendar();
  const note = currentNote();
  const text = noteText(note);
  main.innerHTML = `<div class="module-container">
    <header class="bar note-tools"><div class="segments">${[["edit","实时预览"],["read","阅读"],["source","源码"]].map(([mode,label]) => tab(label, notes.mode === mode, `data-note-mode="${mode}"`)).join("")}</div>
    <div class="row" id="note-actions"><span id="note-state" role="status"></span>
      ${button("批注", { name:"MessageSquare", attrs: notes.mode === "source" ? "id=add-comment disabled" : "id=add-comment", className:"small" })}
      ${button("保存", { name:"Check", attrs:"id=save-note", className:"small primary" })}
      ${button("核实保存", { attrs:"id=verify-note hidden", className:"small" })}
      ${button("查看冲突", { attrs:"id=compare-note hidden", className:"small" })}
    </div></header>
    <div class="notebook-layout two-up"><article id="note-paper" class="note-paper">
      ${notes.mode === "source" ? `<textarea id="note-source" aria-label="笔记 Markdown 源码" spellcheck="false">${escapeHtml(text)}</textarea>` : noteBlocks(text, notes.mode === "edit", note.comments)}
    </article>
    <section class="card comment-rail"><div class="bar"><h2>批注</h2>${badge(String(note.comments.length))}</div>
      <ul class="list">${noteCommentList(note)}</ul>
      <details><summary>旧批注保全示例</summary><p class="meta">保留旧正文与附加消息的作者和顺序。</p>${button("转换示例批注", { attrs:"id=convert-comment", className:"small" })}</details>
    </section></div></div>`;
  markCurrent(main, "note-mode", notes.mode, (mode) => { notes.mode = mode; showNotes(); by(`[data-note-mode="${mode}"]`).focus(); });
  all("[contenteditable]", main).forEach((node) => {
    node.oninput = () => editNoteLine(Number(node.dataset.line), node.innerText);
    node.onkeydown = (event) => { if (event.key === "Enter") event.preventDefault(); };
  });
  by("#note-source")?.addEventListener("input", (event) => {
    note.draft = event.target.value;
    if (note.status === "saved") note.status = undefined;
    noteStatus();
  });
  by("#add-comment").addEventListener("mousedown", (event) => event.preventDefault());
  bind("add-comment", annotate);
  bind("save-note", () => saveNote());
  bind("verify-note", () => {
    note.status = undefined;
    if (note.draft === note.stored) delete note.draft;
    noteStatus();
  });
  bind("compare-note", () => {
    const dialog = modal("保留并比较两个版本", `<div class="dialog-body cols"><div><h3>已保存版本</h3><pre>${escapeHtml(note.stored)}</pre></div><div><h3>我的草稿</h3><pre>${escapeHtml(note.draft)}</pre></div></div><footer class="dialog-footer"><button type="button" data-close>继续保留草稿</button><button type="button" id="take-disk">载入已保存版本</button></footer>`, { wide: true });
    bind("take-disk", () => { delete note.draft; note.status = undefined; dialog.close(); showNotes(); }, dialog);
  });
  all("[data-locate]", main).forEach((entry) => entry.onclick = () => {
    if (notes.mode === "source") { notes.mode = "read"; showNotes(); }
    const item = note.comments.find((value) => value.id === entry.dataset.locate);
    const block = by(`[data-line="${item.line}"]`, main);
    if (!block) return;
    block.tabIndex = -1;
    block.scrollIntoView({ block:"center" });
    block.focus({ preventScroll: true });
    block.classList.add("located");
  });
  all("[data-resolve]", main).forEach((entry) => entry.onclick = () => {
    const item = note.comments.find((value) => value.id === entry.dataset.resolve);
    item.resolved = !item.resolved;
    showNotes();
  });
  all("[data-remove-comment]", main).forEach((entry) => entry.onclick = () => confirmation("删除这条批注", "删除后原文标记也会移除。", "删除批注", () => {
    note.comments = note.comments.filter((item) => item.id !== entry.dataset.removeComment);
    showNotes();
  }));
  bind("convert-comment", () => {
    if (!note.comments.some((value) => value.id === "legacy-1")) {
      note.comments.push({ id: "legacy-1", line: 1, quote: "北岸", body: "09:10 · 林舟：先核对录音。\n09:25 · 宋宁：已补录第二段。", resolved: false });
    }
    showNotes();
  });
  noteStatus();
}
