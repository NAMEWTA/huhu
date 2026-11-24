const centre = {
  plans:structuredClone(fixtures), occurrences:structuredClone(occurrenceFixtures), runs:structuredClone(domainRuns),
  filters:{query:"",source:"",action:"",state:"",order:"recent",limit:7}, history:{source:"",state:"",date:"",query:"",limit:4},
  globalPause:false, mode:"ready", saveFault:"ok", runFault:"ok", outputFault:false, selected:null,
  occurrence:null, sourceKey:"plan-task-reminder", narrowPanel:"list", runPanel:"list", returnTo:null, sourceReturn:null,
  planScroll:0, planPageScroll:0, seenOutputs:new Set(),
};
const readPlan=(id)=>centre.plans.find(({planId})=>planId===id);
const readOccurrence=(id)=>centre.occurrences.find(({occurrenceId})=>occurrenceId===id);
const canWrite=()=>centre.mode==="ready"||centre.mode==="empty";
const canManage=(plan,action)=>canWrite()&&plan.actions.includes(action);
const toggleAction=(plan)=>plan.intent==="enabled"?"pause":"resume";
const locationSummary=(plan)=>`${sources[plan.source.plugin]} · ${plan.source.object.id}`;
const historyTime=(row)=>row.acceptedAt??row.timing.scheduledFor??sampleNow;
function completedOnce(plan) {
  return plan.trigger.kind === "once" && centre.occurrences.some((row) =>
    row.plan.planId === plan.planId && row.state === "completed" && row.timing.trigger === "scheduled"
    && row.timing.scheduledFor === plan.trigger.scheduledFor);
}

function advance(plan) {
  plan.revision = `r${Number(plan.revision.slice(1))+1}`;
  plan.updatedAt = new Date(Date.parse(plan.updatedAt)+1000).toISOString();
}

function setNext(plan,times) {
  if(plan.intent!=="enabled"||plan.availability.state!=="ready"){plan.nextAt=null;return;}
  if(completedOnce(plan)){plan.nextAt=null;return;}
  const next=times??explainDraft(toScheduleDraft(plan.trigger)).due;
  plan.nextAt=next?.[0]??null;
}

function needsAction(plan) {
  return plan.availability.state==="blocked" || ["unknown","failed"].includes(plan.lastOccurrence?.state)
    || centre.occurrences.some((row)=>row.plan.planId===plan.planId && ((centre.runs[row.occurrenceId]??[]).some((run)=>run.status==="waiting-input") || row.effects.some((effect)=>["failed","unknown"].includes(effect.state))));
}

function routeSidebar() {
  const entries=[["plans","计划","CalendarClock"],["runs","运行记录","History"],["sources","来源对象","Layers"]];
  return `<h2>自动化</h2><nav aria-label="自动化导航">${entries.map(([id,label,asset])=>button(label,{name:asset,className:"quiet nav-link",attrs:`data-route="${id}" ${app.route===id?'aria-current="page"':""}`})).join("")}
    <a class="root-link" href="../workbench/index.html">${icon("ArrowLeft")} 工作台布局</a></nav>`;
}

function modeBanner(retry) {
  const current=centre.mode;
  if(current==="ready"||current==="empty") return centre.globalPause?'<p class="notice warn">自动运行已全局暂停。可继续管理计划，已受理的发生仍可查看。</p>':"";
  const labels={loading:"正在读取计划目录…",offline:"工作台离线。下面为上次可见摘要，操作暂不可用。",readonly:"当前连接为只读。可查看记录，无法更改或执行。",error:"无法读取计划目录。可以重试读取。",plugin:"Automations 插件已停用。请先前往插件设置恢复。"};
  return `<div class="notice ${current==="readonly"?"info":"warn"}"><div class="bar"><p>${labels[current]}</p>${retry?button(current==="plugin"?"打开插件设置":"重试读取",{attrs:"id=retry-directory",className:"small"}):""}</div></div>`;
}

function retryDirectory() {
  const prior=centre.mode;
  if(prior==="plugin"){
    const dialog=modal("插件设置",'<div class="dialog-body">启用演练中的 Automations 插件后，再读取目录。</div><footer class="dialog-footer"><button type="button" data-close>取消</button><button type="button" id="enable-plugin" class="primary">启用 Automations</button></footer>');
    bind("enable-plugin",()=>{dialog.close();setDemoMode("ready");},dialog);
  }else{
    setDemoMode("loading");
    setTimeout(()=>setDemoMode("ready"),430);
  }
}

function setDemoMode(mode) {
  centre.mode=mode;
  const input=by('[data-demo="directory-mode"]');
  if(input)input.value=mode;
  renderShell();
}

function listPlans() {
  if(centre.mode==="empty")return [];
  const f=centre.filters;
  const query=f.query.toLowerCase().trim();
  return centre.plans.filter((plan)=>{
    if(plan.intent==="deleted")return false;
    return (!query||[plan.title,plan.action.object.id,locationSummary(plan)].join(" ").toLowerCase().includes(query))
      &&(!f.source||f.source===plan.source.plugin)
      &&(!f.action||f.action===plan.action.capability)
      &&(!f.state || (f.state==="needs" ? needsAction(plan) : f.state==="blocked" ? plan.availability.state==="blocked" :
        f.state==="done" ? completedOnce(plan) : plan.intent===f.state));
  }).sort((left,right)=>f.order==="title"?left.title.localeCompare(right.title,"zh-CN"):f.order==="next"?(left.nextAt??"z").localeCompare(right.nextAt??"z"):right.updatedAt.localeCompare(left.updatedAt));
}

function planRow(plan) {
  const blocked=plan.availability.state==="blocked";
  const last=plan.lastOccurrence;
  return `<li class="plan-row" data-plan-row="${plan.planId}"><button type="button" class="plan-open list-button" data-open-plan="${plan.planId}" aria-pressed="${centre.selected===plan.planId}">
      <span class="line-title"><strong>${escapeHtml(plan.title)}</strong>${blocked?badge("受阻","warn"):""}</span>
      <span class="meta">${escapeHtml(locationSummary(plan))} · ${escapeHtml(plan.action.object.id)}</span>
      <span class="plan-schedule meta">${escapeHtml(triggerDesc(plan.trigger))}</span>
    </button><div class="plan-row-next"><small>下次</small><strong>${plan.nextAt?(centre.globalPause?"全局暂停":formatMoment(plan.nextAt)):"—"}</strong>
      <small>最近 · ${last?stateText[last.state]:"尚未运行"}</small></div>
    <div class="plan-row-actions"><button class="switch small" role="switch" type="button" aria-label="启用 ${escapeHtml(plan.title)}" aria-checked="${plan.intent==="enabled"}" data-toggle-plan="${plan.planId}" ${canManage(plan,toggleAction(plan))?"":"disabled"}><span></span>${plan.intent==="enabled"?"启用":"暂停"}</button>
      ${button("",{name:"MoreHorizontal",aria:`更多操作 · ${plan.title}`,className:"small quiet icon-only",attrs:`data-menu-plan="${plan.planId}"`})}</div></li>`;
}

function saveListScroll() {
  if(by("#plan-list"))centre.planScroll=by("#plan-list").scrollTop;
  if(!centre.selected)centre.planPageScroll=main.scrollTop;
}

function setActivePlan(id) {
  saveListScroll();
  centre.selected=id;centre.narrowPanel="detail";
  history.replaceState(null,"",`#plans/${id}`);
  paintPlans();
  if(isNarrow(by(".module-container")))by("#plan-inspector")?.scrollIntoView({block:"start"});
  by("#plan-inspector")?.focus({preventScroll:true});
}

function planFilters() {
  const f=centre.filters;
  return `<div class="directory-filters">
    ${field("搜索计划",`<input id="plan-query" type="search" placeholder="名称、来源或目标" value="${escapeHtml(f.query)}">`)}
    ${field("来源",`<select id="filter-source">${option("","全部来源",f.source)}${Object.entries(sources).map(([key,value])=>option(key,value,f.source)).join("")}</select>`)}
    ${field("动作",`<select id="filter-action">${option("","全部动作",f.action)}${Object.entries(actionTypes).map(([key,value])=>option(key,value,f.action)).join("")}</select>`)}
    ${field("状态",`<select id="filter-state">${Object.entries({"":"全部状态",needs:"待处理",enabled:"已启用",paused:"已暂停",blocked:"受阻",done:"一次性已完成"}).map(([key,value])=>option(key,value,f.state)).join("")}</select>`)}
    ${field("排序",`<select id="filter-order">${option("recent","最近修改",f.order)}${option("title","名称",f.order)}${option("next","下次执行",f.order)}</select>`)}
    ${button("清除筛选",{name:"X",className:"quiet small",attrs:"id=clear-plan-filters"})}
  </div>`;
}

function showPlans() {
  const pending=centre.plans.filter((plan)=>plan.intent!=="deleted"&&needsAction(plan)).length;
  const actions=button(centre.globalPause?"恢复自动运行":"暂停自动运行",{name:centre.globalPause?"Play":"Pause",attrs:canWrite()?"id=toggle-global":"id=toggle-global disabled"})
    +button("从模板新建",{name:"Layers",attrs:canWrite()?"id=plan-templates":"id=plan-templates disabled"})
    +button("新建计划",{name:"Plus",attrs:canWrite()?"id=plan-add":"id=plan-add disabled",className:"primary"});
  main.innerHTML=`<div class="module-container stack">${heading("计划","来源、排期与最近结果",actions)}
    ${modeBanner(["error","plugin","offline"].includes(centre.mode))}
    ${!["error","plugin","loading"].includes(centre.mode)?`<div class="bar centre-toolbar"><div class="row">
      ${tab("全部计划",centre.filters.state!=="needs",'id=all-plans')}${tab(`待处理 ${pending}`,centre.filters.state==="needs",'id=needs-plans')}
    </div>${button("",{name:"RefreshCcw",className:"quiet small",aria:"刷新目录",attrs:"id=refresh-plans"})}</div>
    ${planFilters()}<div id="plan-panels"></div>`:""}
  </div>`;
  bind("retry-directory",retryDirectory);
  bind("toggle-global",()=>confirmation(centre.globalPause?"恢复自动运行":"暂停自动运行","此操作只改变总体运行开关，各计划自己的启用意图保持不变。",centre.globalPause?"恢复自动运行":"暂停自动运行",()=>{
    centre.globalPause=!centre.globalPause;showPlans();
  }));
  bind("plan-add",()=>planEditor({afterSave:(plan)=>{centre.filters.query="";centre.filters.source="";centre.filters.state="";centre.filters.action="";centre.selected=plan.planId;centre.narrowPanel="detail";showPlans();setStatus("计划已保存为暂停。");}}));
  bind("plan-templates",showTemplates);
  bind("all-plans",()=>{centre.filters.state="";showPlans();});
  bind("needs-plans",()=>{centre.filters.state="needs";showPlans();});
  bind("refresh-plans",retryDirectory);
  if(!by("#plan-panels"))return;
  by("#plan-query").oninput=(event)=>{centre.filters.query=event.target.value;centre.filters.limit=7;paintPlans();};
  ["source","action","state","order"].forEach((key)=>by(`#filter-${key}`).onchange=(event)=>{centre.filters[key]=event.target.value;centre.filters.limit=7;paintPlans();});
  bind("clear-plan-filters",()=>{centre.filters={query:"",source:"",action:"",state:"",order:"recent",limit:7};showPlans();by("#plan-query").focus();});
  paintPlans();
}

function paintPlans() {
  const rows=listPlans();
  const plan=rows.find(({planId})=>planId===centre.selected);
  if(!plan){centre.selected=null;centre.narrowPanel="list";}
  const host=by("#plan-panels");
  host.innerHTML=`<div class="centre-layout ${plan?"has-detail":""}" data-step="${centre.narrowPanel}">
    <section class="card directory" aria-label="计划目录">
    <div class="directory-head bar"><h2>计划目录</h2><small>${rows.length} 项</small></div>
    <div id="plan-list" class="directory-scroll"><ul class="list directory-list">${rows.slice(0,centre.filters.limit).map(planRow).join("") ||
      (centre.mode==="empty"||centre.plans.every((item)=>item.intent==="deleted")?'<li class="empty">尚无计划。可新建，或选择一个模板。</li>':'<li class="empty">没有匹配的计划。调整或清除筛选。</li>')}</ul>
      ${rows.length>centre.filters.limit?button("加载更多",{className:"small",attrs:"id=load-plans"}):""}</div>
    </section>${plan?planDetail(plan):""}</div>`;
  by("#plan-list").scrollTop=centre.planScroll;
  all("[data-open-plan]",host).forEach((entry)=>entry.onclick=()=>setActivePlan(entry.dataset.openPlan));
  all("[data-toggle-plan]",host).forEach((entry)=>entry.onclick=()=>togglePlan(readPlan(entry.dataset.togglePlan),entry.dataset.togglePlan));
  all("[data-menu-plan]",host).forEach((entry)=>entry.onclick=()=>planMenu(readPlan(entry.dataset.menuPlan)));
  bind("load-plans",()=>{saveListScroll();centre.filters.limit+=7;paintPlans();});
  if(plan)bindPlanDetail(plan);
}

function planDetail(plan) {
  const id=plan.planId;
  const input=planInputs[id];
  const schedule=explainDraft(toScheduleDraft(plan.trigger));
  const blocked=plan.availability.state==="blocked";
  const completed=completedOnce(plan);
  const last=plan.lastOccurrence;
  return `<section class="card detail-panel stack" id="plan-inspector" aria-label="计划详情" tabindex="-1">
    ${button("返回计划目录",{name:"ArrowLeft",className:"quiet small plan-back",attrs:"id=back-list"})}
    <div class="bar"><div class="row">${badge(stateText[plan.intent],intentTone[plan.intent])}${blocked?badge(blocking[plan.availability.reason],"warn"):badge(completed?"一次性已完成":"可执行","info")}</div>
    ${button("更多操作",{name:"MoreHorizontal",className:"small quiet",attrs:"id=detail-menu"})}</div>
    <div><h2 class="inspector-title">${escapeHtml(plan.title)}</h2><p class="meta">${escapeHtml(locationSummary(plan))}</p></div>
    ${blocked?`<p class="callout warn">${escapeHtml(plan.availability.detail??blocking[plan.availability.reason])} ${button("去来源查看",{className:"small",attrs:"id=fix-source"})}</p>`:""}
    <div class="row"><button id="edit-plan" type="button" ${canManage(plan,"reschedule")?"":"disabled"}>${icon("Settings2")} 编辑</button>
    <button type="button" id="run-plan" class="primary" ${canWrite()&&plan.actions.includes("run-now")&&!blocked?"":"disabled"}>${icon("Play")} 立即运行</button>
    ${button(plan.intent==="enabled"?"暂停计划":"启用计划",{className:"quiet",attrs:canManage(plan,toggleAction(plan))?"id=detail-toggle":"id=detail-toggle disabled"})}</div>
    <div class="facts"><div><small>下次执行</small><strong>${centre.globalPause?"全局暂停":plan.nextAt?formatMoment(plan.nextAt):"未安排"}</strong></div><div><small>最近发生</small>${last?button(stateText[last.state],{className:"small quiet",attrs:"id=open-last"}):"<strong>尚未运行</strong>"}</div></div>
    <section class="detail-section"><h3>做什么</h3><p>${actionTypes[plan.action.capability]} · ${escapeHtml(plan.action.object.id)}</p>
      ${input?.content?`<details><summary>查看完整内容</summary><pre>${escapeHtml(input.content)}</pre></details>`:""}
      ${input?.tags?`<small>标签 · ${escapeHtml(input.tags)} · ${input.window} · 并发 ${input.parallel}</small>`:""}</section>
    <section class="detail-section"><h3>何时执行</h3><p>${escapeHtml(triggerDesc(plan.trigger))}</p>
      <small>${plan.trigger.zone??"Asia/Taipei"} · 规则预览${plan.nextAt?"":"（当前未安排）"}</small>
      ${schedule.due?.length?`<ul class="preview-times">${schedule.due.map((value)=>`<li><time datetime="${value}">${formatMoment(value,plan.trigger.zone)}</time></li>`).join("")}</ul>`:""}
      ${input?.grace?`<small>错过宽限 ${input.grace} 分钟 · 扫描仅考虑最近一次</small>`:""}</section>
    <section class="detail-section"><h3>执行与结果</h3><p>${scopeNames[plan.owner.scope]} · ${button("打开来源对象",{name:"ExternalLink",className:"small quiet",attrs:"id=goto-source"})}</p>
      <details><summary>计划身份</summary><code>${id} · ${plan.revision}</code></details></section>
    </section>`;
}

function bindPlanDetail(plan) {
  bind("back-list",()=>{
    centre.narrowPanel="list";centre.selected=null;
    history.replaceState(null,"","#plans");paintPlans();main.scrollTop=centre.planPageScroll;by(`[data-open-plan="${plan.planId}"]`)?.focus({preventScroll:true});
  });
  bind("detail-menu",()=>planMenu(plan));
  bind("edit-plan",()=>editPlan(plan));
  bind("detail-toggle",()=>togglePlan(plan));
  bind("run-plan",()=>runPlan(plan));
  bind("open-last",()=>jumpOccurrence(plan.lastOccurrence.occurrenceId,plan.planId));
  bind("fix-source",()=>jumpSource(plan));
  bind("goto-source",()=>jumpSource(plan));
}

function editPlan(plan) {
  if(!canManage(plan,"reschedule"))return;
  planEditor({plan,afterSave:()=>{
    if(app.route==="sources")showSources();else showPlans();
    setStatus("修改已保存，保留原启用意图。");
  }});
}

function togglePlan(plan,focusId) {
  if(!canManage(plan,toggleAction(plan)))return;
  plan.intent=plan.intent==="enabled"?"paused":"enabled";
  advance(plan);setNext(plan);
  if(app.route==="sources")showSources();
  else {saveListScroll();paintPlans();}
  if(focusId)by(`[data-toggle-plan="${focusId}"]`)?.focus({preventScroll:true});
  setStatus(plan.intent==="paused"?"未来触发已暂停。已经受理的运行保留。":"已启用。受阻条件仍需处理。");
}

function planMenu(plan) {
  const dialog=modal("计划操作",`<div class="dialog-body stack"><h3>${escapeHtml(plan.title)}</h3>
    ${button("编辑计划",{attrs:`id=menu-edit ${canManage(plan,"reschedule")?"":"disabled"}`})}${button("查看运行记录",{attrs:"id=menu-runs"})}
    ${button("删除计划",{className:"danger",attrs:`id=menu-delete ${canManage(plan,"delete")?"":"disabled"}`})}</div><footer class="dialog-footer"><button type="button" data-close>关闭</button></footer>`);
  bind("menu-edit",()=>{dialog.close();editPlan(plan);},dialog);
  bind("menu-runs",()=>{dialog.close();centre.history.query=plan.title;centre.occurrence=null;centre.runPanel="list";centre.returnTo=plan.planId;openPage("runs");},dialog);
  bind("menu-delete",()=>{dialog.close();removePlan(plan);},dialog);
}

function removePlan(plan) {
  if(!canManage(plan,"delete"))return;
  const revision=plan.revision;
  confirmation("删除计划",`从${sources[plan.source.plugin]}停用「${plan.title}」的未来触发，保留原对象和运行历史。`,"删除计划",()=>{
    if(plan.revision!==revision){setStatus("版本已更新，请复核后重试。");return;}
    plan.intent="deleted";plan.nextAt=null;advance(plan);
    centre.selected=null;showPlans();setStatus("计划已删除，原对象和历史仍保留。");
  });
}

function showTemplates() {
  const dialog=modal("从模板新建",`<div class="dialog-body stack"><div class="template-grid">${templates.map((template)=>`<article class="card stack">
    <div class="bar">${badge(sources[template.source])}${template.block?badge("缺少目标","warn"):""}</div><h3>${template.title}</h3>
    <p>${template.desc}</p><small>${escapeHtml(triggerDesc(template.trigger))}</small>
    ${button("使用模板",{className:"small",aria:`使用模板 · ${template.title}`,attrs:`data-template="${template.id}"`})}</article>`).join("")}</div>
    <p class="meta">模板会填入新表单。保存后默认暂停。</p></div><footer class="dialog-footer"><button type="button" data-close>关闭</button></footer>`,{wide:true});
  all("[data-template]",dialog).forEach((entry)=>entry.onclick=()=>{
    const template=templates.find(({id})=>id===entry.dataset.template);
    dialog.close();
    planEditor({template,afterSave:(plan)=>{centre.selected=plan.planId;centre.narrowPanel="detail";centre.filters={query:"",source:"",action:"",state:"",order:"recent",limit:7};showPlans();setStatus("已从模板保存为暂停。");}});
  });
}

function runPlan(plan) {
  if(!canWrite()||!plan.actions.includes("run-now")||plan.availability.state!=="ready")return;
  const inDoubt=centre.occurrences.find((row)=>row.plan.planId===plan.planId&&row.timing.trigger==="manual"&&row.state==="unknown");
  if(inDoubt){jumpOccurrence(inDoubt.occurrenceId,plan.planId);return;}
  const revision=plan.revision;
  confirmation("立即运行",`使用当前修订执行「${plan.title}」。本次手动运行会留下独立记录，原排期和启用状态保持不变。`,"运行一次",()=>{
    if(plan.revision!==revision){setStatus("计划已经修改。请重新查看当前内容。");return;}
    const intentId=crypto.randomUUID();
    const fault=centre.runFault;
    centre.runFault="ok";
    by('[data-demo="run-fault"]').value="ok";
    if(fault==="denied"){setStatus("未受理 · 当前主体无运行权限。");return;}
    const id=`occ-manual-${intentId.slice(0,8)}`;
    const state=fault==="unknown"?"unknown":"accepted";
    const row=makeOccurrence(id,plan.planId,state,{timing:{trigger:"manual"},frozenRevision:revision,at:sampleNow});
    row.plan.revision=revision;
    centre.occurrences.unshift(row);
    if(state==="accepted")centre.runs[id]=[{runId:`run-${id}`,attemptId:"attempt-1",dispatchId:`dispatch-${id}`,title:plan.action.object.id,status:"running",canStop:true,sessionId:`session-${id}`,output:"已受理本次样例运行。"}];
    plan.lastOccurrence={occurrenceId:id,state,at:sampleNow};
    jumpOccurrence(id,plan.planId);
    setStatus(state==="unknown"?"原请求结果未知。可在发生详情核实。":"已受理独立手动发生。");
  });
}

function jumpOccurrence(id, planId) {
  centre.occurrence=id;
  centre.runPanel="detail";
  centre.returnTo=planId;
  centre.history={source:"",state:"",date:"",query:"",limit:4};
  openPage("runs");
  history.replaceState(null,"",`#runs/${id}`);
  by("#run-inspector")?.focus({preventScroll:true});
}

function outputDialog(run) {
  const dialog=modal("运行输出",`<div class="dialog-body stack"><p>${escapeHtml(run.title)}</p><div id="run-output" aria-live="polite">正在读取…</div></div><footer class="dialog-footer"><button type="button" data-close>关闭</button></footer>`,{wide:true});
  const read=()=>{
    by("#run-output",dialog).textContent="正在读取…";
    setTimeout(()=>{
      if(!dialog.open)return;
      if(centre.outputFault){
        centre.outputFault=false;
        by('[data-demo="output-fault"]').value="ok";
        by("#run-output",dialog).innerHTML='<p class="notice err">读取输出失败。</p><button type="button" id="retry-output">重读输出</button>';
        bind("retry-output",read,dialog);
        return;
      }
      centre.seenOutputs.add(run.runId);
      const lines=run.output.split("\n");
      by("#run-output",dialog).innerHTML=`<pre class="out-block">${escapeHtml(lines.slice(0,2).join("\n"))}</pre>${lines.length>2?`<details><summary>查看其余 ${lines.length-2} 行</summary><pre>${escapeHtml(lines.slice(2).join("\n"))}</pre></details>`:""}<p class="meta">输出已按示例范围脱敏。</p>`;
    },320);
  };
  read();
}

function openDomainRun(run) {
  const dialog=modal(run.taskId?"原任务":"原终端会话",`<div class="dialog-body stack">
    <h3>${escapeHtml(run.title)}</h3><p>${badge(stateText[run.status],intentTone[run.status])}</p>
    <p class="meta">${escapeHtml(run.taskId??run.sessionId)} · ${escapeHtml(run.runId)}</p>
    ${run.missing?'<p class="notice warn">原对象已不可访问。运行历史仍保留。</p>':""}
    ${run.question?`<div class="callout warn"><strong>等待原问题</strong><p>${escapeHtml(run.question)}</p></div>
      <form class="stack" id="domain-answer">${field("答复",'<textarea name="answer" required autofocus></textarea>')}<button type="submit" class="primary" ${canWrite()?"":"disabled"}>发送原问题答复</button></form>`:""}
    ${run.taskId&&!run.missing?`<div class="stack"><div id="domain-comments">${(run.comments??[]).map((item)=>`<p>${escapeHtml(item)}</p>`).join("")}</div>
      <form id="domain-comment" class="stack">${field("普通评论",'<input name="comment" required>')}<button type="submit" ${canWrite()?"":"disabled"}>保存普通评论</button></form></div>`:""}</div>
    <footer class="dialog-footer"><button type="button" data-close>返回发生记录</button></footer>`);
  const comment=by("#domain-comment",dialog);
  if(comment)comment.onsubmit=(event)=>{
    event.preventDefault();
    const value=comment.elements.comment.value.trim();
    if(!value)return;
    run.comments??=[];
    run.comments.push(`普通评论：${value}`);
    const row=document.createElement("p");row.textContent=`普通评论：${value}`;by("#domain-comments",dialog).append(row);
    comment.reset();
  };
  const answer=by("#domain-answer",dialog);
  if(answer)answer.onsubmit=(event)=>{
    event.preventDefault();
    if(!answer.elements.answer.value.trim())return;
    run.question=null;run.status="running";
    run.comments??=[];run.comments.push(`Web · 原问题已接收：${answer.elements.answer.value}`);
    dialog.close();showRuns();setStatus("答复已关联到原问题与运行。");
  };
}

function verifyOccurrence(row) {
  if(!canWrite())return;
  if(row.state!=="unknown")return;
  if(row.timing.trigger==="manual"){
    row.state="accepted";
    centre.runs[row.occurrenceId]=[{runId:`run-${row.occurrenceId}`,dispatchId:`dispatch-${row.occurrenceId}`,attemptId:"attempt-1",sessionId:`session-${row.occurrenceId}`,title:"原手动运行",status:"running",canStop:true,output:"核实到原受理记录，没有新增发生。"}];
  }else{
    row.state="completed";
    for(const effect of row.effects)if(effect.state==="unknown"){effect.state="completed";effect.receiptId=`receipt-${effect.effectId}`;}
  }
  const plan=readPlan(row.plan.planId);
  if(plan?.lastOccurrence?.occurrenceId===row.occurrenceId)plan.lastOccurrence.state=row.state;
  showRuns();
  setStatus("已核实原请求，没有新增发生。");
}

function occurrenceDetail(row) {
  const plan=readPlan(row.plan.planId);
  const runs=centre.runs[row.occurrenceId]??[];
  const notes={accepted:"已完成受理检查，可继续查看各领域运行。",running:"领域执行仍在运行。",unknown:"结果未知。先核实原请求，再决定是否需要新操作。",completed:"发生已结束。查看各项效果的结果。",failed:"发生失败，已保留可读历史。",cancelled:"该发生已取消。",blocked:"尚未受理。"};
  return `<section class="card detail-panel stack" id="run-inspector" tabindex="-1">
    <div class="bar">${button("返回运行列表",{name:"ArrowLeft",className:"quiet small run-back",attrs:"id=back-runs"})}${badge(stateText[row.state],intentTone[row.state])}</div>
    <div><h2 class="inspector-title">${escapeHtml(plan?.title??"历史计划")}</h2><p class="meta">${row.timing.trigger==="manual"?"手动触发":row.timing.trigger==="event"?"来源事件":"按排期触发"} · ${formatMoment(historyTime(row))}</p></div>
    <p>${notes[row.state]??stateText[row.state]}</p>
    <div class="row">${button("返回对应计划",{name:"ArrowLeft",className:"small",attrs:plan?.intent==="deleted"?"id=return-plan disabled":"id=return-plan"})}
      ${row.state==="unknown"?button("核实原请求",{name:"Search",className:"small primary",attrs:canWrite()?"id=verify-occurrence":"id=verify-occurrence disabled"}):""}</div>
    <details><summary>计划与冻结输入</summary><dl><dt>计划</dt><dd><code>${row.plan.planId} · ${row.plan.revision}</code></dd>
    <dt>发生</dt><dd><code>${row.occurrenceId}</code></dd><dt>受理时间</dt><dd>${formatMoment(row.acceptedAt)}</dd>
    <dt>冻结输入</dt><dd>${row.frozenInput?escapeHtml(row.frozenInput.revision):"未受理"}</dd>
    ${row.execution?`<dt>会话</dt><dd><code>${row.execution.sessionBinding.sessionId} · ${row.execution.sessionBinding.processGeneration}</code></dd>`:""}</dl></details>
    <section class="detail-section"><h3>领域运行</h3><ul class="list">${runs.length?runs.map((run)=>`<li class="stack">
      <div class="bar"><strong>${escapeHtml(run.title)}</strong>${badge(stateText[run.status],intentTone[run.status])}</div>
      ${run.missing?'<p class="meta">目标已不可访问。以下仅保留历史摘要。</p>':""}
      <div class="row">${button(run.taskId?"打开原任务":"打开原会话",{className:"small",attrs:`data-run-source="${run.runId}" ${run.missing?"disabled":""}`})}
      ${button(centre.seenOutputs.has(run.runId)?"再次查看输出":"查看输出",{className:"small quiet",attrs:`data-run-output="${run.runId}"`})}
      ${run.canStop?button("停止本次运行",{className:"small danger",attrs:`data-stop-run="${run.runId}" ${canWrite()&&["running","waiting-input"].includes(run.status)?"":"disabled"}`}):""}</div>
      <small><code>${run.dispatchId} / ${run.runId} / ${run.attemptId}</code></small></li>`).join(""):'<li class="empty">当前无领域运行记录。</li>'}</ul></section>
    <section class="detail-section"><h3>通知与其他效果</h3><ul class="list">${row.effects.length?row.effects.map((effect)=>`<li class="stack"><div class="bar"><strong>${escapeHtml(effect.kind)}</strong>${badge(stateText[effect.state],intentTone[effect.state])}</div>
    <small>${escapeHtml(effect.target.id)}</small>
    ${effect.state==="failed"?button("重试该效果",{className:"small",attrs:`data-retry-effect="${effect.effectId}" ${canWrite()?"":"disabled"}`}):""}</li>`).join(""):'<li class="empty">没有已记录的交付效果。</li>'}</ul></section>
    </section>`;
}

function returnPlan(id) {
  const plan=readPlan(id);
  if(!plan||plan.intent==="deleted")return;
  if(!listPlans().some(({planId})=>planId===id))centre.filters={query:"",source:"",action:"",state:"",order:"recent",limit:7};
  centre.selected=id;centre.narrowPanel="detail";
  openPage("plans");history.replaceState(null,"",`#plans/${id}`);
  by("#plan-inspector")?.focus({preventScroll:true});
}

function showRuns() {
  const f=centre.history;
  const unavailable=["plugin","error","loading"].includes(centre.mode);
  main.innerHTML=`<div class="module-container stack">${heading("运行记录","从触发与受理到领域运行和交付结果")}
  ${modeBanner(unavailable||centre.mode==="offline")}
  ${unavailable?"":`<div class="directory-filters run-filters">
    ${field("查找运行",`<input id="run-query" type="search" value="${escapeHtml(f.query)}" placeholder="计划、目标或运行身份">`)}
    ${field("来源",`<select id="run-source">${option("","全部来源",f.source)}${Object.entries(sources).map(([key,value])=>option(key,value,f.source)).join("")}</select>`)}
    ${field("发生状态",`<select id="run-state">${option("","全部状态",f.state)}${["accepted","running","completed","failed","unknown","cancelled"].map((key)=>option(key,stateText[key],f.state)).join("")}</select>`)}
    ${field("触发日期",`<input id="run-date" type="date" value="${f.date}">`)}
    ${button("清除筛选",{className:"quiet small",attrs:"id=clear-history"})}
    </div><div id="run-panels"></div>`}
  </div>`;
  bind("retry-directory",retryDirectory);
  if(unavailable)return;
  by("#run-query").oninput=(event)=>{f.query=event.target.value;paintRuns();};
  ["source","state","date"].forEach((key)=>by(`#run-${key}`).onchange=(event)=>{f[key]=event.target.value;paintRuns();});
  bind("clear-history",()=>{centre.history={source:"",state:"",date:"",query:"",limit:4};showRuns();by("#run-query").focus();});
  paintRuns();
}

function paintRuns() {
  const f=centre.history;
  const rows=centre.occurrences.filter((item)=>{
    const plan=readPlan(item.plan.planId);
    const query=f.query.trim().toLowerCase();
    const child=centre.runs[item.occurrenceId]??[];
    return (!f.source||plan?.source.plugin===f.source)&&(!f.state||item.state===f.state)&&(!f.date||historyTime(item).slice(0,10)===f.date)
      &&(!query||[plan?.title,plan?.action.object.id,item.occurrenceId,...child.map(({runId,title})=>`${runId} ${title}`)].join(" ").toLowerCase().includes(query));
  }).sort((left,right)=>historyTime(right).localeCompare(historyTime(left)));
  const row=rows.find(({occurrenceId})=>occurrenceId===centre.occurrence);
  if(!row)centre.runPanel="list";
  by("#run-panels").innerHTML=`<div class="centre-layout ${row?"has-detail":""}" data-step="${centre.runPanel}">
    <section class="card directory"><div class="directory-head bar"><h2>发生记录</h2><small>${rows.length} 项</small></div><div class="directory-scroll"><ul class="list directory-list">
    ${rows.slice(0,f.limit).map((occ)=>`<li><button type="button" class="list-button" aria-pressed="${row===occ}" data-occurrence="${occ.occurrenceId}">
      <span class="line-title"><strong>${escapeHtml(readPlan(occ.plan.planId)?.title??"历史计划")}</strong>${badge(stateText[occ.state],intentTone[occ.state])}</span>
      <span class="meta">${occ.timing.trigger==="manual"?"手动":"按条件触发"} · ${formatMoment(historyTime(occ))}</span>
    </button></li>`).join("")||'<li class="empty">没有匹配的发生记录。</li>'}</ul>
    ${rows.length>f.limit?button("加载更早记录",{className:"small",attrs:"id=more-runs"}):""}</div></section>${row?occurrenceDetail(row):""}</div>`;
  bind("more-runs",()=>{f.limit+=4;paintRuns();});
  all("[data-occurrence]",main).forEach((node)=>node.onclick=()=>{
    centre.occurrence=node.dataset.occurrence;centre.runPanel="detail";
    history.replaceState(null,"",`#runs/${centre.occurrence}`);
    paintRuns();by("#run-inspector")?.focus({preventScroll:true});
  });
  if(!row)return;
  bind("back-runs",()=>{centre.occurrence=null;centre.runPanel="list";history.replaceState(null,"","#runs");paintRuns();by(`[data-occurrence="${row.occurrenceId}"]`)?.focus();});
  bind("return-plan",()=>returnPlan(row.plan.planId));
  bind("verify-occurrence",()=>verifyOccurrence(row));
  const runs=centre.runs[row.occurrenceId]??[];
  all("[data-run-source]",main).forEach((entry)=>entry.onclick=()=>openDomainRun(runs.find(({runId})=>runId===entry.dataset.runSource)));
  all("[data-run-output]",main).forEach((entry)=>entry.onclick=()=>outputDialog(runs.find(({runId})=>runId===entry.dataset.runOutput)));
  all("[data-stop-run]",main).forEach((entry)=>entry.onclick=()=>{
    const run=runs.find(({runId})=>runId===entry.dataset.stopRun);
    confirmation("停止本次运行",`只停止「${run.title}」（${run.runId}），不会暂停计划或其他运行。`,"确认停止",()=>{
      run.status="stopped";run.canStop=false;showRuns();setStatus("已停止当前领域运行。");
    });
  });
  all("[data-retry-effect]",main).forEach((entry)=>entry.onclick=()=>{
    const effect=row.effects.find(({effectId})=>effectId===entry.dataset.retryEffect);
    confirmation("重试未完成效果",`重试「${effect.kind}」的原目标，保留 Agent 和其他效果。`,"重试该效果",()=>{
      effect.state="completed";effect.receiptId=`receipt-${effect.effectId}`;showRuns();setStatus("原效果已完成。");
    });
  });
}

function jumpSource(plan) {
  centre.sourceKey=plan.planId;
  centre.sourceReturn=plan.planId;
  openPage("sources");
  history.replaceState(null,"",`#sources/${plan.planId}`);
  by("#source-detail")?.focus({preventScroll:true});
}

function showSources() {
  const plan=readPlan(centre.sourceKey)??centre.plans[0];
  const hidden=plan.intent==="deleted";
  main.innerHTML=`<div class="module-container stack">${heading(sources[plan.source.plugin]+" · 来源","查看来源对象与它的计划")}
  ${modeBanner(["error","plugin","offline"].includes(centre.mode))}
  <div class="two-up">
    <section class="card stack"><h2>来源对象</h2>${field("选择示例来源",`<select id="source-objects">${centre.plans.map((value)=>option(value.planId,`${sources[value.source.plugin]} · ${value.source.object.id}`,plan.planId)).join("")}</select>`)}
    <p>${escapeHtml(plan.action.object.id)}</p><small>对象身份 · ${escapeHtml(plan.source.object.id)}</small>
    ${plan.availability.state==="blocked"?`<p class="notice warn">${escapeHtml(plan.availability.detail??blocking[plan.availability.reason])}</p>`:""}
    ${plan.source.plugin==="mail"?'<a href="../workbench/index.html#mail">进入邮件工作台</a>':plan.source.plugin==="versioning"?'<a href="../workbench/index.html#sync">进入同步设置</a>':""}</section>
    <section class="card stack" id="source-detail" tabindex="-1" aria-label="来源计划"><div class="bar"><h2>计划</h2>${badge(stateText[plan.intent],intentTone[plan.intent])}</div>
    <strong>${escapeHtml(plan.title)}</strong>
    <small><code>${plan.planId} · ${plan.revision}</code></small><p>${escapeHtml(triggerDesc(plan.trigger))}</p>
    <p class="meta">${hidden?"原对象保留，计划已删除。":`下次执行 · ${centre.globalPause?"全局暂停":formatMoment(plan.nextAt)}`}</p>
    ${hidden?"":`<div class="row">${button("在中心打开",{name:"ExternalLink",attrs:"id=source-centre"})}
    ${button("编辑共用计划",{className:"small",attrs:canManage(plan,"reschedule")?"id=source-edit":"id=source-edit disabled"})}
    ${button(plan.intent==="enabled"?"暂停共用计划":"启用共用计划",{className:"small",attrs:canManage(plan,toggleAction(plan))?"id=source-toggle":"id=source-toggle disabled"})}</div>`}</section>
  </div></div>`;
  bind("retry-directory",retryDirectory);
  by("#source-objects").onchange=(event)=>{centre.sourceKey=event.target.value;showSources();by("#source-objects").focus();};
  bind("source-centre",()=>returnPlan(plan.planId));
  bind("source-edit",()=>editPlan(plan));
  bind("source-toggle",()=>togglePlan(plan));
}

const [route,key]=location.hash.slice(1).split("/");
if(route==="plans"&&readPlan(key)){
  centre.selected=key;centre.narrowPanel="detail";
}else if(route==="runs"&&readOccurrence(key)){
  centre.occurrence=key;centre.runPanel="detail";
}else if(route==="sources"&&readPlan(key))centre.sourceKey=key;

startShell({
  defaultRoute:"plans",
  pages:{
    plans:{label:"计划",icon:"CalendarClock",sidebar:routeSidebar,show:showPlans},
    runs:{label:"运行记录",icon:"History",sidebar:routeSidebar,show:showRuns},
    sources:{label:"来源",icon:"Layers",sidebar:routeSidebar,show:showSources},
  },
  demo:()=>[
    demo("directory-mode","目录与连接",'<option value="ready">正常</option><option value="empty">空库</option><option value="loading">加载中</option><option value="error">读取失败</option><option value="offline">离线</option><option value="readonly">只读</option><option value="plugin">插件已停用</option>'),
    demo("save-fault","下一次保存",'<option value="ok">正常</option><option value="error">保存失败</option><option value="unknown">结果未知</option><option value="conflict">其他工作台已修改</option><option value="deleted">其他工作台已删除</option>'),
    demo("run-fault","下一次立即运行",'<option value="ok">正常受理</option><option value="unknown">受理回包丢失</option><option value="denied">未获运行权限</option>'),
    demo("output-fault","下一次读取输出",'<option value="ok">正常</option><option value="error">读取失败一次</option>'),
  ].join(""),
});
by("#demo-fields").onchange=(event)=>{
  const {demo:kind}=event.target.dataset;
  const value=event.target.value;
  if(kind==="directory-mode")setDemoMode(value);
  if(kind==="save-fault")centre.saveFault=value;
  if(kind==="run-fault")centre.runFault=value;
  if(kind==="output-fault")centre.outputFault=value==="error";
};
