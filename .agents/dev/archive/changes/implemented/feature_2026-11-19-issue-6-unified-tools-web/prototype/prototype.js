"use strict";
const sections = [
  ["catalog","工具目录","⌘"],["mcp","MCP 服务","◇"],["cli","CLI 命令行","›"],["api","外部 API","⇄"],
  ["","",""],["web","Web 服务","▣"],["browser","浏览器工作台","◫"],["activity","最近活动","◷"]
];
const toolsList = [
  ["notes.list","列出笔记","笔记","read","normal","按标题返回当前 Vault 的笔记摘要。"],
  ["notes.read","读取笔记","笔记","read","normal","读取指定笔记正文与版本。"],
  ["notes.save","保存笔记","笔记","write","normal","核对版本并保存笔记。"],
  ["notes.trash","移入回收站","笔记","write","high","将指定笔记移入回收站。"],
  ["tasks.list","列出任务","任务","read","normal","查看当前 Vault 中的任务。"],
  ["tasks.create","新建任务","任务","write","normal","创建一条待办并分配 ID。"],
  ["automations.preview","预览自动化","自动化","read","normal","返回匹配结果。"],
  ["automations.run","运行自动化","自动化","execute","high","派发已保存的自动化规则。"],
  ["ssh.hosts.list","列出 SSH 主机","SSH","read","normal","读取授权主机摘要。"],
  ["ssh.connect","连接 SSH 主机","SSH","execute","high","创建可查询的连接尝试。"],
  ["ssh.sftp.list","列出远端文件","SSH","read","normal","查询既有文件会话。","缺少文件会话"],
  ["safe.accounts.reveal","显式查看密码","保险箱","read","high","查询已授权的账号条目。","保险箱已锁定"],
  ["mail.messages.list","列出邮件摘要","邮件","read","normal","返回邮件的主题与发送人。"],
  ["gateway.policy.update","更新开放策略","系统","admin","high","保存一批明确的工具选择。"],
  ["widgets.layout.get","读取工作台布局","小组件","read","normal","返回当前 View 的布局。","处理器尚未注册",true]
];
const owners=[...new Set(toolsList.map((row)=>row[2]))];
const scopes={read:"读取",write:"写入",execute:"执行",admin:"管理"};
const sources={cli:"CLI",stdio:"MCP stdio",http:"MCP HTTP",api:"外部 API",desktop:"桌面",browser:"浏览器"};
const lookup=(id)=>toolsList.find((row)=>row[0]===id);
const opts=(pairs,current)=>pairs.map(([value,label])=>option(value,label,current)).join("");
const shortFilter=()=>({search:"",owners:[],scope:[],risk:"",choice:"",ready:""});
function initial() {
  return {page:"catalog",vault:"项目工作 Vault",vaults:{},generation:1,revision:1,
    choices:Object.fromEntries(toolsList.filter((tool)=>!tool[7]).map(([id])=>[id,false])),
    filters:shortFilter(),picked:new Set(),offset:0,batch:"read",mail:false,broken:false,fault:"",
    mcp:false,mode:"stdio",cli:false,diag:null,checkTool:"notes.list",history:[],
    web:{running:false,busy:false,scope:"lan",port:"",bound:null,error:"",links:[],selected:"",seq:0},
    device:"A",sessions:{},tab:"tasks",workError:"",taskDraft:"",draft:null,
    tasks:[{id:"T-1042",title:"核对开发环境与发布前检查清单",done:false},{id:"T-1043",title:"归纳本周用户反馈与处理进度",done:true}],
    note:{version:4,body:"本周安排工具目录和工作台演练，确认后补充交付证据。"},files:[]};
}
let s=initial();
let startTimer;
const selected=(id)=>s.choices[id]===undefined?"未配置":s.choices[id]?"已开放":"已关闭";
const currentSession=()=>s.sessions[s.device];
const connected=()=>s.web.running&&currentSession()?.phase==="active";
function log(message) {
  s.history.unshift(message);
  render();
  say(message);
}
function verdict(row,source="catalog") {
  const [id,,owner,,,,reason] = row;
  if(owner==="邮件"&&!s.mail)return "插件已停用";
  if(reason==="处理器尚未注册")return reason;
  if(source==="browser"&&!connected())return "浏览器会话已断开";
  if(["stdio","http"].includes(source)){
    if(!s.mcp)return "MCP 服务已停止";
    if(s.mode!==source)return "此 MCP 传输未启用";
  }
  if(!["desktop","browser"].includes(source)){
    if(s.broken)return "开放策略需恢复";
    if(!s.choices[id])return "未开放";
  }
  return reason||"可调用";
}
function filtered() {
  const f=s.filters;
  return toolsList.filter((row)=>{
    const [id,title,plugin,scope,risk,description]=row;
    return [id,title,description].join(" ").toLowerCase().includes(f.search.trim().toLowerCase()) &&
      (!f.owners.length||f.owners.includes(plugin))&&(!f.scope.length||f.scope.includes(scope))&&
      (!f.risk||f.risk===risk)&&(!f.choice||f.choice===selected(id))&&
      (!f.ready||(verdict(row)==="可调用")===(f.ready==="yes"));
  });
}
const evaluated=(value)=>badge(value,value==="可调用"?"ok":value==="未开放"?"":"warn");
function diagResult() {
  return s.diag? `<p class="notice"><code>${s.diag.id}</code> · ${sources[s.diag.source]} · ${evaluated(verdict(lookup(s.diag.id),s.diag.source))}</p>`:"";
}
function facet(key,label,pairs) {
  return `<fieldset><legend>${label}</legend><div class="row">${pairs.map(([id,name])=>`<label class="row"><input type="checkbox" data-facet="${key}" value="${id}" ${checked(s.filters[key].includes(id))}>${name}</label>`).join("")}</div></fieldset>`;
}
const batches = [
  ["read","启用全部只读"],["normal","仅保留常规只读"],["matching+","开启筛选结果"],["matching-","关闭筛选结果"],
  ["all+","开启全目录"],["all-","关闭全目录"],...owners.map((owner)=>["owner:"+owner,"开启插件全部 · "+owner])
];
function catalogView() {
  const f=s.filters, match=filtered();
  const pages=Math.max(1,Math.ceil(match.length/7));
  s.offset=Math.min(s.offset,pages-1);
  const picked=match.filter(([id])=>s.picked.has(id)).length;
  const rows=match.slice(s.offset*7,s.offset*7+7).map((row)=>{
    const [id,title,owner,scope,risk,desc]=row;
    return `<tr><td><input type="checkbox" aria-label="选择${title}" data-pick="${id}" ${checked(s.picked.has(id))}></td><td><strong>${title}</strong><code>${id}</code><small>${desc}</small></td><td>${owner}</td><td>${badge(scopes[scope])} ${risk==="high"?badge("高风险","warn"):""}</td><td>${badge(selected(id),s.choices[id]?"ok":"")}</td><td>${evaluated(verdict(row))}</td><td><div class="row">${button(s.choices[id]?"关闭":"开放","toggle",id)}${button("详情","detail",id)}</div></td></tr>`;
  }).join("");
  const menu=(key,label,items)=>`<label class="field">${label}<select data-filter="${key}" aria-label="${label}">${opts(items,f[key])}</select></label>`;
  const open=toolsList.filter(([id])=>s.choices[id]).length;
  return heading("工具目录","管理 MCP、CLI 和外部 API 共用的工具开放策略。",badge("策略版本 "+s.revision))+
    `<div class="stack"><div class="summary-grid">
    ${[["目录工具",toolsList.length],["已开放",open],["目录可调用",toolsList.filter((row)=>verdict(row)==="可调用").length]].map(([label,count])=>`<section class="card"><small>${label}</small><strong>${count}</strong></section>`).join("")}</div>
    ${s.broken?`<p class="notice err">开放策略无法读取，外部调用已暂停。 ${button("恢复策略快照","restore-policy")}</p>`:""}
    <section class="card stack" aria-label="筛选与批量策略"><div class="filter-grid">
      <label class="field">检索工具<input id="search" type="text" placeholder="名称、ID 或说明" value="${text(f.search)}"></label>
      ${menu("risk","风险",[["","全部风险"],["normal","常规"],["high","高风险"]])}
      ${menu("choice","策略",[["","全部选择"],...["已开放","已关闭","未配置"].map((v)=>[v,v])])}
      ${menu("ready","可用性",[["","全部状态"],["yes","可调用"],["no","不可调用"]])}</div>
    <details id="facets" ${f.scope.length||f.owners.length?'open':''}><summary>所有者与作用类型</summary><div class="auto facet-grid">${facet("owners","插件",owners.map((v)=>[v,v]))}${facet("scope","作用类型",Object.entries(scopes))}</div></details>
    <div class="bar"><strong>${match.length} 项匹配 · 选中 ${s.picked.size} 项</strong><div class="row"><label class="row"><input id="match-all" type="checkbox" ${checked(match.length>0&&picked===match.length)} ${disabled(!match.length)}>全部匹配</label>${button("清空选择","clear-pick")}</div></div>
    <div class="row">${button("开启所选","batch","pick+",disabled(!s.picked.size))}${button("关闭所选","batch","pick-",disabled(!s.picked.size))}
    <select id="batch-kind" aria-label="其他批量范围">${opts(batches,s.batch)}</select>${button("预览批量操作","batch-preview")}</div></section>
    ${rows?table("能力目录",["选择","工具","插件","作用与风险","开放策略","目录可用性","操作"],rows):`<p class="card empty">没有符合条件的工具。 ${button("清除筛选","clear-filter")}</p>`}
    <div class="bar"><small>第 ${s.offset+1} / ${pages} 页</small><div class="row">${button("上一页","page","-1",disabled(!s.offset))}${button("下一页","page","1",disabled(s.offset+1===pages))}</div></div>${diagResult()}</div>`;
}
function policy(title,changes) {
  if(!changes.length){say("当前范围没有可提交的工具。");return;}
  const version=s.revision;
  let staleCatalog=false;
  const labels=changes.map(([id,allow])=>{
    const [,,owner,scope,risk]=lookup(id);
    return `<li><code>${id}</code> · ${owner} · ${scopes[scope]}${risk==="high"?" · 高风险":""} · ${allow?"开放":"关闭"}</li>`;
  }).join("");
  const high=changes.filter(([id])=>lookup(id)[4]==="high").length;
  show(title,`<p>涉及 ${changes.length} 项 · 高风险 ${high} 项 · 策略版本 ${version}</p><details open><summary>明确的工具范围</summary><ul class="preview-list">${labels}</ul></details><p id="policy-error" class="notice err" role="alert" hidden></p>`,()=>{
    let issue="";
    if(s.broken)issue="开放策略需先恢复。";
    else if(s.fault==="write"){issue="模拟保存失败，整批选择维持原样。可重试。";s.fault="";}
    else if(s.fault==="conflict"){s.revision++;s.fault="";}
    else if(s.fault==="catalog"){staleCatalog=true;s.fault="";}
    if(staleCatalog)issue="目录在预览后变化，当前批次未保存。请返回并重取范围。";
    if(s.revision!==version)issue="另一入口更新了策略版本，当前批次未保存。请返回重新核对。";
    if(issue){const error=dialog.querySelector("#policy-error");error.textContent=issue;error.hidden=false;return false;}
    changes.forEach(([id,allow])=>s.choices[id]=allow);
    s.revision++;dialog.close();log("已保存 "+changes.length+" 项工具选择。");return true;
  },"保存选择");
}
function batch(kind) {
  const match=filtered().map(([id])=>id);
  const ids=kind.startsWith("pick")?[...s.picked]:
    kind.startsWith("matching")?match:
    toolsList.filter((row)=>kind==="read"?row[3]==="read":kind.startsWith("owner:")?row[2]===kind.slice(6):true).map(([id])=>id);
  policy(batches.find(([id])=>id===kind)?.[1]||(kind==="pick+"?"开启所选":"关闭所选"),
    ids.map((id)=>[id,kind==="normal"?lookup(id)[3]==="read"&&lookup(id)[4]==="normal":!kind.endsWith("-")]));
}
function detail(id) {
  const [,title,owner,scope,risk,desc]=lookup(id);
  show(title,`<p><code>${id}</code> · ${owner} · ${scopes[scope]} · ${risk==="high"?"高风险":"常规"}</p><p>${desc}</p><p class="muted">输入 · 查询条件或业务对象 ID<br>输出 · 结构化结果、版本或操作标识</p><label class="field">诊断调用入口<select name="source" aria-label="诊断调用入口">${opts(Object.entries(sources),"cli")}</select></label>`,
    (data)=>{s.diag={id,source:data.get("source")};dialog.close();render();say("已检查调用条件。");},"检查");
}


function serviceView(page) {
  const mcp=page==="mcp", cli=page==="cli";
  const src=mcp?s.mode:page, active=mcp?s.mcp:cli?s.cli:true;
  const discovered=toolsList.filter((row)=>verdict(row,src)==="可调用");
  return heading(mcp?"MCP 服务":cli?"CLI 命令行":"外部 API",mcp?"MCP 使用本机控制端点。":"当前 Vault · 本机控制端点",button("管理开放策略","nav","catalog",'class="primary"'))+
    '<div class="stack"><section class="card stack"><div class="bar"><h2>'+(cli?"启动器状态":"服务状态")+'</h2>'+badge(active?(cli?"已安装":"可用"):(cli?"未安装":"已停止"),active?"ok":"")+'</div>'+
    (mcp?'<label class="field">传输方式<select aria-label="传输方式" data-value="mode">'+opts([["stdio","stdio"],["http","HTTP（回环）"]],s.mode)+'</select></label><div>'+button(active?"停止 MCP":"启动 MCP","mcp")+'</div>':
      cli?'<div>'+button(active?"移除启动器":"安装启动器","cli")+'</div><small>启动器安装与工具开放策略各自管理。</small>':"")+
    '</section><section class="card stack"><h2>当前发现结果 · '+discovered.length+' 项</h2>'+
    (discovered.length?'<ul class="list">'+discovered.map(([id,title])=>'<li>'+title+' · <code>'+id+'</code></li>').join("")+"</ul>":'<p class="empty">没有当前可发现的可调用工具。</p>')+
    '<div class="row"><label class="field">诊断工具<select aria-label="诊断工具" data-value="checkTool">'+opts(toolsList.map(([id,title])=>[id,title]),s.checkTool)+'</select></label>'+button("检查当前入口","diagnose",src)+'</div>'+diagResult()+'</section></div>';
}
const link=(id=s.web.selected)=>s.web.links.find((item)=>item.id===id);
const address=(lan)=>"http://"+(lan?"192.0.2.24":"127.0.0.1")+":"+s.web.bound;
const users=(id)=>Object.values(s.sessions).filter((item)=>item.source===id&&item.phase==="active").length;
function webView(){
  const w=s.web, item=link();
  const status=w.running?"监听中":w.busy?"正在监听":"已停止";
  return heading("Web 服务","让当前 Vault 在普通浏览器中打开。",badge(status,w.running?"ok":""))+
    '<div class="stack"><div class="cols"><section class="card stack"><h2>工作台监听</h2><form id="web-config" class="stack">'+
    '<label class="field">访问范围<select name="scope" aria-label="访问范围" '+disabled(w.running||w.busy)+'>'+opts([["lan","局域网（默认）"],["local","仅本机"]],w.scope)+'</select></label>'+
    '<label class="field">端口<input type="number" name="port" min="1024" max="65535" placeholder="留空自动分配" value="'+text(w.port)+'" '+disabled(w.running||w.busy)+'></label>'+
    '<div class="row">'+(w.running?button("停止 Web 服务","web-stop","",'class="danger"'):w.busy?button("取消启动","web-cancel"):'<button type="submit" class="primary">开启 Web 服务</button>')+button("切换 Vault","switch-vault")+'</div></form>'+
    (w.error?'<p class="notice err" role="alert">'+text(w.error)+'</p>':"")+'<small>当前 Vault · '+text(s.vault)+' · 控制端点供桌面／CLI／MCP 使用</small></section>'+
    '<section class="card stack"><h2>实际监听地址（模拟）</h2>'+
    (w.running?'<label class="field">本机地址<input readonly value="'+address(false)+'"></label>'+
      (w.scope==="lan"?'<label class="field">局域网 · 以太网<input readonly value="'+address(true)+'"></label>':"")+
      '<div class="row">'+button("打开本机工作台","join","local")+button("浏览器视图","nav","browser")+"</div>":'<p class="empty">启动成功后显示绑定地址和端口。</p>')+
    '</section></div><section id="invites" class="card stack"><div class="bar"><h2>局域网邀请</h2>'+button("另建邀请","new-link","",disabled(!w.running||w.scope!=="lan"))+'</div>'+
    (w.links.length?'<ul class="list">'+w.links.map((entry)=>'<li class="bar" data-invite="'+entry.id+'"><div><strong>邀请 '+entry.id+'</strong> '+badge(entry.phase,entry.phase==="有效"?"ok":"")+' <small>'+users(entry.id)+' 个活跃会话</small></div>'+
      '<div class="row">'+button("查看邀请","view-link",entry.id,entry.id===w.selected?'aria-pressed="true"':"")+button("撤销邀请","revoke",entry.id,'class="danger" '+disabled(entry.phase!=="有效"))+"</div></li>").join("")+"</ul>":'<p class="empty">局域网服务开启后可取得邀请链接。</p>')+
    (item?.phase==="有效"?'<label class="field">邀请链接<input readonly id="invite-url" value="'+address(true)+'/join?invite='+item.id+'"></label><div class="row">'+button("选取链接","copy-link")+button("在浏览器中使用此邀请","join",item.id,'class="primary"')+'</div><small>可重复使用。撤销会断开通过该邀请进入的所有浏览器会话。</small>':
      item?'<p class="notice">邀请 '+item.id+' '+item.phase+'。需要分享时可另建邀请。</p>':"")+
    "</section></div>";
}
function browserView(){
  const session=currentSession(), active=connected();
  const description=active?s.vault+" · "+(session.source==="local"?"本机地址":"邀请 "+session.source):"通过有效邀请进入当前 Vault。";
  return heading("浏览器工作台",description,badge(active?"已连接":"未连接",active?"ok":""))+
    '<div class="stack"><div class="bar"><div class="row">'+["A","B","C"].map((id)=>button("浏览器 "+id,"device",id,(id===s.device?'aria-pressed="true" ':"")+'aria-label="浏览器 '+id+(s.sessions[id]?.phase==="active"?"（已连接）":"")+'"')).join("")+'</div>'+
    (active?button("刷新会话","refresh"):button("前往 Web 服务","nav","web"))+'</div>'+
    (active?webBusiness():'<section class="card stack"><h2>'+text(session?.reason||"等待邀请")+'</h2><label class="field">使用邀请<select aria-label="使用邀请" data-value="joinSelect" '+disabled(!s.web.links.length)+'>'+
      opts(s.web.links.map((item)=>[item.id,"邀请 "+item.id+" · "+item.phase]),s.web.selected)+'</select></label><div class="row">'+
      button("使用选中邀请","join",s.web.selected,disabled(!s.web.selected))+button("使用本机地址","join","local",disabled(!s.web.running))+'</div></section>')+
    (s.workError?'<p class="notice err" role="alert">'+text(s.workError)+'</p>':"")+'</div>';
}
function webBusiness() {
  let content;
  if(s.tab==="tasks")content='<form id="task-add" class="row"><label class="field">任务标题<input name="title" required maxlength="100" value="'+text(s.taskDraft)+'" placeholder="例如 核对部署演练结果"></label><button type="submit" class="primary">创建任务</button></form>'+
    '<ul class="list">'+s.tasks.map((task)=>'<li class="bar"><div><strong>'+text(task.title)+'</strong> <small>'+task.id+'</small></div><label class="row"><input type="checkbox" data-task="'+task.id+'" '+checked(task.done)+'>已完成</label></li>').join("")+"</ul>";
  else if(s.tab==="note")content='<form id="note-save" class="stack"><div class="bar"><h2>十一月工作台交付记录</h2>'+badge("版本 "+s.note.version)+'</div><label class="field">正文<textarea name="body" aria-label="正文" required>'+text(s.draft?.body??s.note.body)+'</textarea></label><div class="row"><button class="primary" type="submit">保存笔记</button>'+button("重取当前版本","reload-note")+'</div></form>';
  else content='<div class="bar"><h2>浏览器设备文件</h2>'+button("添加演示附件","upload")+'</div><ul class="list">'+
    (s.files.map((file)=>'<li class="bar"><span>'+text(file)+' · 浏览器设备</span>'+button("取回演示附件","download",file)+'</li>').join("")||'<li class="empty">没有已上传的样例附件。</li>')+'</ul>';
  return '<div class="row">'+[["tasks","任务"],["note","笔记"],["files","文件"]].map(([id,name])=>button(name,"tab",id,id===s.tab?'aria-pressed="true"':"")).join("")+'</div>'+
    '<section class="card stack">'+content+'</section><details class="card"><summary>桌面同步结果</summary><p>任务 '+s.tasks.length+' 条 · 笔记版本 '+s.note.version+' · 附件 '+s.files.length+' 个</p><p>最新任务 · '+text(s.tasks[0].title)+'</p><p>笔记 · '+text(s.note.body)+'</p></details>';
}
function makeLink(){
  const id="D-"+String(++s.web.seq).padStart(3,"0");
  s.web.links.push({id,phase:"有效"});s.web.selected=id;
  return id;
}
function revoke(id,reason="邀请已撤销"){
  const entry=link(id);
  if(entry?.phase==="有效")entry.phase=reason==="邀请已撤销"?"已撤销":"已失效";
  Object.values(s.sessions).forEach((session)=>{
    if(session.source===id&&session.phase==="active"){session.phase="closed";session.reason=reason;}
  });
}
function stopWeb(reason){
  clearTimeout(startTimer);
  s.web.running=false;s.web.busy=false;s.web.bound=null;
  s.web.links.forEach((item)=>revoke(item.id,reason));
  revoke("local",reason);s.generation++;s.workError="";
}
function join(id){
  s.page="browser";s.workError="";
  if(!s.web.running||(id!=="local"&&link(id)?.phase!=="有效")){
    if(!connected())s.sessions[s.device]={source:id,phase:"closed",reason:"邀请已失效，无法连接"};
    s.workError="请从桌面取得有效邀请。";render();return;
  }
  s.sessions[s.device]={source:id,phase:"active",generation:s.generation};
  log("浏览器 "+s.device+" 已进入工作台。");
}


function render(){
  const service=()=>serviceView(s.page);
  const views={catalog:catalogView,mcp:service,cli:service,api:service,web:webView,browser:browserView,
    activity:()=>heading("最近活动","策略、入口与工作台事件。")+'<section class="card"><ul class="list">'+(s.history.map((item)=>'<li>'+text(item)+'</li>').join("")||'<li class="empty">等待本次演示的活动。</li>')+'</ul></section>'};
  renderNav(sections,s.page);
  region.innerHTML=views[s.page]();
  document.querySelector("#vault").textContent=s.vault;
  document.querySelector("#demo").innerHTML='<label class="row">注入下一次故障 <select aria-label="注入下一次故障" data-value="fault">'+opts([["","无"],["write","策略保存失败"],["conflict","策略版本冲突"],["catalog","目录变更"],["listen","端口占用"],["note","笔记版本冲突"]],s.fault)+'</select></label>'+
    '<label class="row">邮件插件状态 <select aria-label="邮件插件状态" data-value="mail">'+opts([["off","停用"],["on","运行"]],s.mail?"on":"off")+'</select></label>'+button("模拟策略损坏","break-policy")+button("复位演示","reset");
  const all=document.querySelector("#match-all");
  if(all)all.indeterminate=!all.checked&&filtered().some(([id])=>s.picked.has(id));
}
appClicks((action,id,control)=>{
  const target={home:"catalog","rail-settings":"web",nav:id}[action];
  if(target){s.page=target;render();keepFocus(control,document.querySelector("#main"));return;}
  const actions={
    toggle:()=>policy(s.choices[id]?"关闭工具":"开放工具",[[id,!s.choices[id]]]),detail:()=>detail(id),batch:()=>batch(id),
    "batch-preview":()=>batch(s.batch),"clear-pick":()=>{s.picked.clear();render();},
    "clear-filter":()=>{s.filters=shortFilter();s.offset=0;render();},page:()=>{s.offset+=Number(id);render();},
    mcp:()=>{s.mcp=!s.mcp;log(s.mcp?"MCP 已启动。":"MCP 已停止，旧客户端同时失去调用权限。");},
    cli:()=>{s.cli=!s.cli;log(s.cli?"CLI 启动器已安装。":"CLI 启动器已移除。");},
    diagnose:()=>{s.diag={id:s.checkTool,source:id};render();say("诊断完成。");},
    "break-policy":()=>{s.broken=true;log("外部调用已暂停。");},
    "restore-policy":()=>{s.broken=false;log("已恢复此前保存的策略。");},
    "new-link":()=>log("已创建邀请 "+makeLink()+"。"),"view-link":()=>{s.web.selected=id;render();},
    "copy-link":()=>{const field=document.querySelector("#invite-url");field.focus();field.select();say("链接已选取，可用复制快捷键。");},
    revoke:()=>show("撤销局域网邀请","<p>邀请 "+id+" 将立即失效，并断开通过它建立的 "+users(id)+" 个活动会话。</p>",()=>{
      revoke(id);dialog.close();log("邀请 "+id+" 已撤销，关联浏览器会话已断开。");},"撤销并断开"),
    "web-cancel":()=>{clearTimeout(startTimer);s.web.busy=false;log("已取消启动。");},
    "web-stop":()=>show("停止 Web 服务","<p>所有 Web 会话将断开，邀请随之失效。</p>",()=>{
      stopWeb("Web 服务已停止");dialog.close();log("Web 服务已停止，桌面、CLI 与 MCP 控制端点仍可使用。");},"停止服务"),
    "switch-vault":()=>show("切换 Vault","<p>当前 Web 监听、邀请和浏览器会话将失效。</p>",()=>{
      stopWeb("Vault 已切换");
      s.vaults[s.vault]={choices:s.choices,revision:s.revision,tasks:s.tasks,note:s.note,files:s.files};
      s.vault=s.vault==="项目工作 Vault"?"读书与研究 Vault":"项目工作 Vault";
      const next=s.vaults[s.vault]||initial();
      for(const key of ["choices","revision","tasks","note","files"])s[key]=next[key];
      s.draft=null;s.taskDraft="";s.picked.clear();s.broken=false;
      dialog.close();log("当前 Vault 已切换。");
    },"切换 Vault"),
    join:()=>join(id),device:()=>{s.device=id;s.workError="";s.draft=null;s.taskDraft="";render();},
    refresh:()=>{s.workError="";s.draft=null;render();say("已重新读取会话和 Vault。");},
    tab:()=>{s.tab=id;s.workError="";render();},
    "reload-note":()=>{s.draft=null;s.workError="";render();say("已载入当前版本。");},
    upload:()=>{if(connected()){s.files.push("发布检查记录-"+(s.files.length+1)+".txt");log("演示附件已上传。");}},
    download:()=>{if(connected())log("已模拟将 "+id+" 交付到浏览器 "+s.device+"。");},
    reset:()=>{clearTimeout(startTimer);s=initial();render();say("已恢复干净安装状态。");}
  };
  actions[action]?.();
  keepFocus(control,document.querySelector("#main"));
});
document.addEventListener("input",(event)=>{
  const c=event.target;
  if(c.id==="search"){
    const selection=c.selectionStart;
    s.filters.search=c.value;s.offset=0;render();
    const next=document.querySelector("#search");next.focus();next.setSelectionRange(selection,selection);
  }
  if(c.closest("#note-save")&&c.name==="body")s.draft={version:s.draft?.version??s.note.version,body:c.value};
  if(c.closest("#task-add")&&c.name==="title")s.taskDraft=c.value;
});
document.addEventListener("change",(event)=>{
  const c=event.target;
  if(c.id==="batch-kind"){s.batch=c.value;return;}
  if(c.dataset.filter){s.filters[c.dataset.filter]=c.value;s.offset=0;}
  else if(c.dataset.facet){
    const key=c.dataset.facet;
    const current=new Set(s.filters[key]);
    c.checked?current.add(c.value):current.delete(c.value);
    s.filters[key]=[...current];s.offset=0;
  } else if(c.dataset.pick||c.id==="match-all"){
    const ids=c.dataset.pick?[c.dataset.pick]:filtered().map(([id])=>id);
    ids.forEach((id)=>c.checked?s.picked.add(id):s.picked.delete(id));
  } else if(c.dataset.value){
    const key=c.dataset.value;
    if(key==="joinSelect")s.web.selected=c.value;
    else s[key]=key==="mail"?c.value==="on":c.value;
  } else if(c.dataset.task&&connected()){
    s.tasks.find((task)=>task.id===c.dataset.task).done=c.checked;
  } else return;
  const wasFacet=c.dataset.facet;
  render();
  if(wasFacet)document.querySelector("#facets").open=true;
  const attrs=["filter","facet","pick","value","task"];
  const byData=attrs.find((key)=>c.dataset[key]);
  const controls=byData?[...document.querySelectorAll("[data-"+byData+"]")]:[];
  (c.id?document.getElementById(c.id):controls.find((node)=>node.dataset[byData]===c.dataset[byData]&&(!wasFacet||node.value===c.value)))?.focus();
});
document.addEventListener("submit",(event)=>{
  if(event.target.closest("dialog"))return;
  event.preventDefault();
  const data=new FormData(event.target);
  if(event.target.id==="web-config"){
    s.web.scope=data.get("scope");s.web.port=data.get("port");s.web.error="";s.web.busy=true;
    render();document.querySelector('[data-action="web-cancel"]')?.focus();
    startTimer=setTimeout(()=>{
      s.web.busy=false;
      if(s.fault==="listen"){s.fault="";s.web.error="所选端口被占用。请选择其他端口或清空后重试。";render();return;}
      s.web.running=true;s.web.bound=Number(s.web.port)||43127;
      if(s.web.scope==="lan")makeLink();
      log("Web 服务已启动。");
    },600);
  } else if(event.target.id==="task-add"&&connected()){
    const title=String(data.get("title")).trim();
    if(!title){s.workError="请输入任务标题。";render();return;}
    s.tasks.unshift({id:"T-"+(1042+s.tasks.length),title,done:false});
    s.taskDraft="";s.workError="";log("任务已创建，桌面和浏览器读取同一条任务。");
  } else if(event.target.id==="note-save"&&connected()){
    if(s.fault==="note"){s.fault="";s.note.version++;s.note.body+="\n桌面新增：补充审阅时间。";}
    if(s.draft&&s.draft.version!==s.note.version){
      s.workError="桌面已更新笔记版本。浏览器草稿保留，可重取当前版本后重新编辑。";render();return;
    }
    s.note.body=String(data.get("body"));s.note.version++;s.draft=null;s.workError="";log("笔记已保存。");
  }
});
render();

