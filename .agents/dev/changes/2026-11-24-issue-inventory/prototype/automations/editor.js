const cadenceLabels = { once:"一次性", interval:"固定间隔", daily:"每日", weekly:"每周选定日", cron:"高级 Cron", observe:"状态观察", event:"领域事件" };
const repeatDays = [["1","一"],["2","二"],["3","三"],["4","四"],["5","五"],["6","六"],["0","日"]];
const modelsByProvider = { Codex:["gpt-5.4","gpt-5.4-mini"], Pi:["deepseek-v3","claude-sonnet"] };
const eligibleActions = new Set(["reminders.notify","agent.scan","agent.prompt","terminal.run"]);
const defaultInput = { content:"",tags:"",window:"本周",from:"2026-11-23",to:"2026-11-29",overdue:false,noDue:false,parallel:1,space:"口述史",provider:"Codex",model:"gpt-5.4",effort:"medium",grace:30,overlap:"skip" };

function formatMoment(iso, zone = "Asia/Taipei") {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",timeZone:zone,timeZoneName:"shortOffset",
  }).format(new Date(iso));
}

function offsetPreview(local, zone) {
  const points = Date.parse(local+"Z");
  if (!Number.isFinite(points)) return [];
  const zoneFormat = new Intl.DateTimeFormat("en-CA",{
    timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",
  });
  const clock = (instant) => {
    const values = Object.fromEntries(zoneFormat.formatToParts(instant).map(({type,value}) => [type,value]));
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
  };
  const offsets = new Set([-1,0,1].map((day) => {
    const point = points+day*86_400_000;
    return Date.parse(clock(point)+"Z")-point;
  }));
  const withSecond = local.length===16 ? local+":00" : local;
  return [...offsets].map((offset)=>points-offset).filter((time)=>clock(time)===withSecond).sort().map((time)=>new Date(time).toISOString());
}

function triggerDesc(trigger) {
  switch (trigger.kind) {
    case "once":return `一次性 · ${formatMoment(trigger.scheduledFor)}`;
    case "interval":return `每 ${trigger.every} ${trigger.unit==="seconds"?"秒":"分钟"}`;
    case "observe":return `每 ${trigger.everySeconds} 秒观察 · ${trigger.query}`;
    case "event":return `领域事件 · ${trigger.event}`;
    case "cron": {
      const [minute,hour,date,month,week] = trigger.expression.split(" ");
      if (date==="*"&&month==="*"&&/^\d+$/.test(hour)&&/^\d+$/.test(minute)) {
        const time=`${hour.padStart(2,"0")}:${minute.padStart(2,"0")}`;
        return week==="*" ? `每天 ${time} · ${trigger.zone}` : `周 ${week} ${time} · ${trigger.zone}`;
      }
      return `Cron ${trigger.expression} · ${trigger.zone}`;
    }
  }
}

function toScheduleDraft(trigger) {
  if (trigger.kind==="interval") return { cadence:"interval",every:trigger.every,unit:trigger.unit };
  if (trigger.kind==="observe") return { cadence:"observe",every:trigger.everySeconds,query:trigger.query,match:trigger.object.id };
  if (trigger.kind==="event") return { cadence:"event",query:trigger.event,match:trigger.object.id };
  if (trigger.kind==="once") return { cadence:"once",local:trigger.scheduledFor.slice(0,16),zone:"UTC" };
  const [minute,hour,date,month,week]=trigger.expression.split(" ");
  const simple=date==="*"&&month==="*"&&/^\d+$/.test(hour)&&/^\d+$/.test(minute)&&/^(\*|[0-6](,[0-6])*)$/.test(week);
  return {cadence:simple?(week==="*"?"daily":"weekly"):"cron",cron:trigger.expression,zone:trigger.zone,
    time:simple?`${hour.padStart(2,"0")}:${minute.padStart(2,"0")}`:"09:00",days:simple&&week!=="*"?week.split(","):["1"]};
}

function explainDraft(draft) {
  const zone = draft.zone || "Asia/Taipei";
  try {
    new Intl.DateTimeFormat("en",{timeZone:zone});
  } catch {
    return {error:"请输入有效的 IANA 时区，例如 Asia/Taipei。"};
  }
  const {cadence}=draft;
  if(cadence==="once"){
    if(!draft.local)return{error:"请选择一次性计划的日期和时刻。"};
    const options=offsetPreview(draft.local,zone);
    if(!options.length)return{error:"这个本地时刻不存在。请选择夏令时切换后的时间。"};
    if(options.length>1&&!draft.fold)return{error:"这个本地时刻出现两次，请选择实际偏移。",options};
    const instant=options[draft.fold==="later"?options.length-1:0];
    if(instant<=sampleNow&&draft.allowPast!==true)return{error:"请选择晚于演示工作台当前时刻的日期。",options};
    return{trigger:once(instant),zone,due:[instant],options};
  }
  if(cadence==="interval"||cadence==="observe"){
    const every=Number(draft.every);
    if(!Number.isInteger(every)||every<1||every>10080)return{error:"请输入有效的正整数间隔。"};
    if(cadence==="observe"&&(!draft.match||!draft.query))return{error:"观察计划需要明确来源对象。"};
    const hours=draft.unit==="hours";
    const unit=draft.unit==="seconds"?"seconds":"minutes";
    const value=hours?every*60:every;
    const ms=value*(cadence==="observe"||unit==="seconds"?1000:60000);
    const due=[1,2,3].map((index)=>new Date(Date.parse(sampleNow)+index*ms).toISOString());
    return{
      trigger:cadence==="observe"?{kind:"observe",query:draft.query,object:{kind:"source",id:draft.match},everySeconds:every}:interval(value,unit),zone,due,
    };
  }
  if(cadence==="event") {
    if(!draft.match||!draft.query)return{error:"请选择事件与来源对象。"};
    return{trigger:{kind:"event",event:draft.query,object:{kind:"source",id:draft.match}},zone,due:[]};
  }
  if(cadence==="cron"){
    const expression=draft.cron.trim().replace(/\s+/g," ");
    if (!/^([0-9*\/,\-]+ ){4}[0-9*\/,\-]+$/.test(expression))return{error:"填写五段 Cron：分、时、日、月、周。"};
    return{trigger:{kind:"cron",expression,zone},zone,due:[],backend:true};
  }
  if(cadence==="weekly"&&!draft.days.length)return{error:"请至少选择一个工作日。"};
  if(!draft.time)return{error:"请选择执行时间。"};
  const [h,m]=draft.time.split(":").map(Number);
  const expression=`${m} ${h} * * ${cadence==="daily"?"*":draft.days.join(",")}`;
  const due = [];
  for (let offset=0;offset<23&&due.length<3;offset+=1){
    const day=new Date(Date.parse(sampleNow)+offset*86_400_000);
    if(cadence==="weekly"&&!draft.days.includes(String(day.getUTCDay())))continue;
    const candidates=offsetPreview(day.toISOString().slice(0,10)+"T"+draft.time,zone);
    if(candidates[0]>sampleNow)due.push(candidates[0]);
  }
  return{trigger:{kind:"cron",expression,zone},zone,due};
}

function planEditor({ plan = null, template = null, afterSave = () => {} } = {}) {
  const selectedReference=plan?.planId??template?.id??"new";
  const input={...defaultInput,...(plan?planInputs[plan.planId]:template?.input)};
  const draft={
    title:plan?.title??template?.title??"",source:plan?.source.plugin??template?.source??"automations",action:plan?.action.capability??template?.action??"reminders.notify",
    target:plan?.action.object.id??template?.target??"",...input,zone:"Asia/Taipei",local:"2026-11-25T09:00",time:"09:00",cron:"0 9 * * *",every:15,unit:"minutes",
    days:["1"],query:"tasks.activity",match:"task-coast",fold:"",allowPast:Boolean(plan&&completedOnce(plan)),
    ...toScheduleDraft(plan?.trigger??template?.trigger??daily),
  };
  let editVersion=plan?.revision;
  let dirty=false;
  let pending=false;
  let previewRevision=0;
  let intentId=crypto.randomUUID();
  let committing=false;
  let pendingSaveResult=null;
  const askClose=(dialog,proceed=()=>{})=>{
    if(pending)return false;
    if(!dirty)return true;
    confirmation("离开计划编辑","表单已有修改。可以继续编辑，或放弃草稿。","放弃草稿",()=>{dirty=false;dialog.close();proceed();});
    return false;
  };
  const purpose=plan?"编辑计划":template?`从模板新建 · ${template.title}`:"新建计划";
  const dialog=modal(purpose,`<form class="dialog-form"><div class="dialog-body form-container"><div class="form-grid">
    <section class="stack"><h3>做什么</h3>
      ${field("计划名称",`<input name="title" maxlength="150" value="${escapeHtml(draft.title)}" required autofocus>`)}
      ${field("来源",`<input readonly value="${sources[draft.source]??draft.source}${plan?" · "+escapeHtml(plan.source.object.id):""}">`)}
      ${field("动作",`<select id="draft-action" name="action" ${plan&&plan.source.plugin!=="automations"?"disabled":""}>${Object.entries(actionTypes).filter(([key])=>eligibleActions.has(key)||key===draft.action).map(([key,name])=>option(key,name,draft.action)).join("")}</select>`)}
      <div id="draft-target" class="stack"></div>
      ${field("动作内容 / 补充说明",`<textarea name="content" rows="6" placeholder="输入必要内容或执行条件">${escapeHtml(draft.content)}</textarea>`)}
      <div id="draft-extras"></div>
    </section>
    <aside class="stack"><h3>何时执行</h3>
      ${field("触发方式",`<select name="cadence">${Object.entries(cadenceLabels).map(([key,label])=>option(key,label,draft.cadence)).join("")}</select>`)}
      <div id="draft-schedule" class="stack"></div>
      ${field("计划时区",`<input name="zone" list="known-zones" value="${escapeHtml(draft.zone)}"><datalist id="known-zones">${zones.map((zone)=>option(zone,zone)).join("")}</datalist>`)}
      <details><summary>运行策略</summary><div class="stack advanced">
        ${field("错过时的宽限（分钟）",`<input type="number" name="grace" min="0" value="${draft.grace}">`)}
        ${field("执行重叠",`<select name="overlap">${option("skip","跳过本次",draft.overlap)}${option("queue","等待原运行结束",draft.overlap)}</select>`)}
        <small>扫描任务在宽限内只考虑最近一次；账本周期按来源期次处理。</small>
      </div></details>
      <div class="callout"><h3>规则预览</h3><p class="meta">按 2026-11-24 10:00（Asia/Taipei）演练。</p><div id="draft-preview" role="status"></div>
      ${button("预览", {name:"Search",className:"small",attrs:"id=preview-plan"})}</div>
    </aside></div><div id="editor-feedback" class="stack" aria-live="polite"></div></div>
    <footer class="dialog-footer"><button type="button" data-close>取消</button><button type="submit" class="primary" id="submit-plan">${plan?"保存修改":"保存为暂停"}</button></footer>
  </form>`,{wide:true,closing:askClose});
  const form=by("form",dialog);
  const feedback=by("#editor-feedback",dialog);
  const submitButton=by("#submit-plan",dialog);
  const names=(data)=>Object.entries(data).map(([key,value])=>option(key,value,draft.provider)).join("");
  const agentOptions=()=>draft.action==="agent.prompt"||draft.action==="agent.scan";
  const extra=(key,value)=>`<input type="checkbox" name="${key}" ${value?"checked":""}>`;

  function paintTarget() {
    by("#draft-target",dialog).innerHTML=agentOptions()?`
      ${field("Space",`<select name="space">${["口述史","出版校对","已移除 Space"].map((value)=>option(value,value,draft.space)).join("")}</select>`)}
      ${field("Agent",`<select name="provider">${names({Codex:"Codex",Pi:"Pi",unavailable:"不可用的 Agent"})}</select>`)}
      ${field("模型",`<select name="model">${(modelsByProvider[draft.provider]??[]).map((name)=>option(name,name,draft.model)).join("")}</select>`)}
      ${field("推理档位",`<select name="effort" ${draft.model==="deepseek-v3"?"disabled":""}>${["low","medium","high"].map((name)=>option(name,name,draft.effort)).join("")}</select>`)}
      <p class="meta">${draft.action==="agent.prompt"?"在所选 Space 通过 Tasks 新建并派遣一条任务。":"执行当前符合条件的任务，结果留在原任务。"}</p>`:
      field("动作目标",`<input name="target" value="${escapeHtml(draft.target)}" ${plan&&plan.source.plugin!=="automations"?"readonly":""} placeholder="输入或从来源选择执行对象">`);
    const target=by("#draft-extras",dialog);
    target.innerHTML=draft.action==="agent.scan"?`<fieldset><legend>任务筛选</legend>
      ${field("匹配标签",`<input name="tags" value="${escapeHtml(draft.tags)}">`)}
      ${field("时间窗口",`<select name="window">${["本周","未来 7 天","自定义"].map((value)=>option(value,value,draft.window)).join("")}</select>`)}
      <div class="date-parts" ${draft.window==="自定义"?"":"hidden"}>${field("开始日期",`<input type="date" name="from" value="${draft.from}">`)}${field("结束日期",`<input type="date" name="to" value="${draft.to}">`)}</div>
      <label class="check">${extra("overdue",draft.overdue)} 包括逾期</label><label class="check">${extra("noDue",draft.noDue)} 包括未排期</label>
      ${field("每次并发",`<input name="parallel" type="number" min="1" max="8" value="${draft.parallel}">`)}
      </fieldset>`:"";
  }

  function paintSchedule() {
    const c=draft.cadence;
    let details="";
    if(c==="once")details=field("本地日期时间",`<input type="datetime-local" name="local" step="1" value="${escapeHtml(draft.local)}">`)+'<div id="fold-choices"></div>';
    if(c==="daily"||c==="weekly"){
      details=field("每天时刻",`<input type="time" name="time" value="${escapeHtml(draft.time)}">`);
      if(c==="weekly")details+=`<fieldset><legend>执行日</legend><div class="row">${repeatDays.map(([key,label])=>`<label class="check"><input type="checkbox" name="days" value="${key}" ${draft.days.includes(key)?"checked":""}> 周${label}</label>`).join("")}</div></fieldset>`;
    }
    if(c==="cron")details=field("Cron 表达式",`<input name="cron" value="${escapeHtml(draft.cron)}" placeholder="分 时 日 月 周">`);
    if(c==="interval"||c==="observe")details=`<div class="date-parts">${field("间隔",`<input name="every" type="number" min="1" value="${draft.every}">`)}
      ${c==="observe"?'<span class="meta">秒</span>':field("单位",`<select name="unit">${option("seconds","秒",draft.unit)}${option("minutes","分钟",draft.unit)}${option("hours","小时",draft.unit)}</select>`)}</div>`;
    if(c==="observe"||c==="event")details+=field(c==="observe"?"观察对象类型":"事件",`<select name="query">${option("tasks.activity","任务状态",draft.query)}${option("agent.state","Agent 会话状态",draft.query)}${option("source.changed","来源变更",draft.query)}</select>`)+field("来源对象",`<input name="match" value="${escapeHtml(draft.match)}">`);
    by("#draft-schedule",dialog).innerHTML=details;
  }

  function paintPreview(run=false) {
    const summary=explainDraft(draft);
    const slot=by("#fold-choices",dialog);
    if(slot)slot.innerHTML=summary.options?.length>1?`<fieldset><legend>选择回拨前后</legend>${summary.options.map((value,i)=>{
      const key=i===0?"earlier":"later";
      return `<label class="check"><input type="radio" name="fold" value="${key}" ${draft.fold===key?"checked":""}> ${formatMoment(value,draft.zone)}</label>`;
    }).join("")}</fieldset>`:"";
    const preview=by("#draft-preview",dialog);
    preview.innerHTML=summary.error?`<p class="notice warn">${escapeHtml(summary.error)}</p>`:
      `<p>${escapeHtml(triggerDesc(summary.trigger))}</p><p class="meta">${summary.zone} · 规则推算</p>
      ${summary.due.length?`<ol class="preview-times">${summary.due.map((value)=>`<li><time datetime="${value}">${formatMoment(value,summary.zone)}</time></li>`).join("")}</ol>`:
        `<p class="meta">${summary.backend?"高级表达式的下次时刻由执行服务返回。":"等待来源事件，不预先安排发生时刻。"}</p>`}`;
    if(run&&draft.action==="agent.scan"&&!summary.error)preview.innerHTML+='<p class="meta">演示候选 · 核对引文出处可受理，整理录音标签因已在运行跳过。取样时间 10:00。</p>';
    return summary;
  }

  paintTarget();paintSchedule();paintPreview();
  if(template?.block)feedback.innerHTML=`<p class="notice warn">${escapeHtml(template.block)}</p>`;
  form.oninput=(event)=>{
    const inputElement=event.target;
    const name=inputElement.name;
    if(!name)return;
    dirty=true;
    previewRevision+=1;
    if(name==="days")draft.days=all("[name=days]:checked",form).map(({value})=>value);
    else draft[name]=inputElement.type==="checkbox"?inputElement.checked:inputElement.value;
    if(name==="cadence"){
      if(draft.cadence==="cron" || draft.cadence==="daily" || draft.cadence==="weekly"){
        const current=explainDraft({...draft,cadence:form.dataset.previousCadence??"daily"});
        if(current.trigger?.kind==="cron"){
          if(draft.cadence==="cron")draft.cron=current.trigger.expression;
          else if(form.dataset.previousCadence==="cron"){
            const conversion=toScheduleDraft(current.trigger);
            if(conversion.cadence==="cron"){
              draft.cadence="cron";
              form.elements.cadence.value="cron";
              feedback.innerHTML='<p class="notice warn">当前 Cron 无法等价表示为简单排期，已保留原表达式。</p>';
            }else Object.assign(draft,conversion,{cadence:inputElement.value});
          }
        }
      }
      form.dataset.previousCadence=draft.cadence;
      paintSchedule();
    }
    if(name==="zone"||name==="local")draft.fold="";
    if(name==="action"||name==="window")paintTarget();
    if(name==="provider"){
      if(!modelsByProvider[draft.provider]?.includes(draft.model))draft.model=modelsByProvider[draft.provider]?.[0]??"";
      paintTarget();
      form.elements.provider.focus();
    }
    if(name==="model") { paintTarget(); form.elements.model.focus(); }
    if(!["title","content","tags"].includes(name))paintPreview();
  };
  form.dataset.previousCadence=draft.cadence;
  bind("preview-plan",()=>{
    const version=++previewRevision;
    by("#draft-preview",dialog).textContent="正在核对当前条件…";
    setTimeout(()=>{if(dialog.open&&version===previewRevision)paintPreview(true);},320);
  },dialog);
  function savedResult(result) {
    pending=false;dirty=false;
    dialog.close();
    afterSave(result);
  }
  function validation() {
    const schedule=paintPreview();
    if(schedule.error)return schedule.error;
    if(draft.action==="agent.scan"&&(!Number.isInteger(Number(draft.parallel))||Number(draft.parallel)<1||Number(draft.parallel)>8))return "扫描并发必须为 1 到 8。";
    if(draft.action==="agent.scan"&&draft.window==="自定义"&&(!draft.from||!draft.to||draft.from>draft.to))return "请输入有效的自定义日期范围。";
    if(agentOptions()&&(draft.space==="已移除 Space"||!modelsByProvider[draft.provider]?.includes(draft.model)))return "所选 Space 或 Agent 不可用，请调整执行目标。";
    if(!agentOptions()&&!draft.target.trim())return template?.block??"请填写动作目标。";
    if(!draft.title.trim())return "请填写计划名称。";
    return schedule;
  }
  form.onsubmit=(event)=>{
    event.preventDefault();
    if(pending||committing)return;
    const candidate=validation();
    if(typeof candidate==="string"){
      feedback.innerHTML=`<p class="notice err">${escapeHtml(candidate)}</p>`;
      feedback.scrollIntoView({block:"nearest"});
      return;
    }
    if(centre.mode==="readonly"||centre.mode==="offline"||centre.mode==="plugin"){
      feedback.innerHTML='<p class="notice err">当前连接不能保存，草稿已保留。</p>';return;
    }
    if(centre.saveFault==="conflict"&&plan){advance(plan);plan.title+=" · 已在另一工作台修改";}
    if(centre.saveFault==="deleted"&&plan){advance(plan);plan.intent="deleted";plan.nextAt=null;}
    if(plan&&(plan.intent==="deleted"||plan.revision!==editVersion)){
      centre.saveFault="ok";
      by('[data-demo="save-fault"]').value="ok";
      feedback.innerHTML=`<div class="notice warn"><p>${plan.intent==="deleted"?"计划已删除，草稿无法覆盖原记录。":`版本冲突。当前已保存为「${escapeHtml(plan.title)}」。`}</p>
        ${plan.intent!=="deleted"?button("核对当前版本并保留草稿",{className:"small",attrs:"id=reload-revision"}):""}</div>`;
      bind("reload-revision",()=>{editVersion=plan.revision;intentId=crypto.randomUUID();feedback.innerHTML='<p class="notice">已读取当前版本。确认后可再次保存这份草稿。</p>';},dialog);
      feedback.scrollIntoView({block:"nearest"});return;
    }
    const fault=centre.saveFault;
    centre.saveFault="ok";
    by('[data-demo="save-fault"]').value="ok";
    if(fault==="error"){feedback.innerHTML='<p class="notice err">保存失败。草稿仍可编辑并重试。</p>';feedback.scrollIntoView({block:"nearest"});return;}
    pending=true;submitButton.disabled=true;submitButton.textContent="正在保存…";
    const frozen={...draft,planId:plan?.planId,expectedRevision:editVersion,intentId};
    setTimeout(()=>{
      const id=plan?.planId??`plan-${selectedReference}-${intentId.slice(0,8)}`;
      const target=["agent.prompt","agent.scan"].includes(frozen.action)?`${frozen.space} / ${frozen.provider}`:frozen.target;
      const result=plan??makePlan(id,frozen.title,frozen.source,id,frozen.action,target,candidate.trigger,{paused:true});
      Object.assign(result,{
        title:frozen.title.trim(),trigger:candidate.trigger,
        action:{...result.action,capability:frozen.action,object:{...result.action.object,id:target},summary:target},
      });
      if(plan)advance(result);
      if(!plan)centre.plans.unshift(result);
      setNext(result,candidate.due);
      planInputs[id]=Object.fromEntries(Object.keys(defaultInput).map((key)=>[key,frozen[key]]));
      if(fault==="unknown"){
        pending=false;committing=true;
        pendingSaveResult=result;
        submitButton.textContent="等待核实";
        feedback.innerHTML=`<div class="notice warn">保存结果未知。草稿和原请求已保留。 ${button("核实原保存",{className:"small",attrs:"id=check-save"})}</div>`;
        bind("check-save",()=>savedResult(pendingSaveResult),dialog);
        feedback.scrollIntoView({block:"nearest"});
      }else savedResult(result);
    },350);
  };
}
