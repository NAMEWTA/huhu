"use strict";
const sections=[
  ["hosts","主机","▤"],["work","工作区","▣"],["files","文件传输","⇅"],["monitor","监控","⌁"],["logs","会话日志","◷"],
  ["","",""],["keys","密钥","◇"],["routes","跳板路由／代理","⇄"],["forward","端口转发","↗"],["known","已知主机","◎"],["commands","快捷操作","›"],
  ["","",""],["settings","SSH 设置","⚙"]
];
const presets=[["one","单列"],["two","双列"],["three","三列"],["left","左主右辅"],["top","上主下辅"],["tabs","内部标签"],["custom","自定义分栏"]];
const seedHosts=[
  {id:"H-1",name:"研发构建节点 · 台北",address:"build.lab.example",user:"release",port:22,group:"研发 / 构建",auth:"agent",tag:"构建"},
  {id:"H-2",name:"应用预检节点 · 亚太",address:"review.lab.example",user:"preview",port:22,group:"研发 / 验收",auth:"prompt",tag:"预检"},
  {id:"H-3",name:"实验跳板 · 内网入口",address:"jump.lab.example",user:"relay",port:2222,group:"网络",auth:"key",tag:"跳板"}
];
const opts=(pairs,current)=>pairs.map(([id,label])=>option(id,label,current)).join("");
const phase={new:"未连接",dial:"正在拨号",trust:"等待信任",auth:"等待认证",ready:"已连接",error:"连接失败",cancel:"已取消",closed:"已断开"};
const phases=(value)=>badge(phase[value]||value,value==="ready"?"ok":value==="error"?"err":["dial","auth","trust"].includes(value)?"warn":"");
const fingerprint=(id,rev=1)=>"SHA256:DEMO-"+id+"-FINGERPRINT-"+rev;
const exampleFiles=[
 {name:"本次部署检查清单.md",size:"18 KB",body:"演示检查清单\n确认交付文档与运行记录。"},
 {name:"预发布端到端走查记录.txt",size:"82 KB",body:"演示记录\n用于比较远端与本机文件。"}
];
function initial() {
  return {page:"hosts",hosts:seedHosts.map((row)=>({...row})),seq:3,search:"",group:"",layout:"list",picked:new Set(),
    known:{"H-3":fingerprint("H-3")}, offeredVersions:{}, keys:["构建节点用演示密钥"], routes:{}, proxy:"inherit",
    workspaces:[{id:"W-1",name:"预发布交付走查",hosts:["H-1","H-2"],preset:"two"}], run:null,pane:0,paneSeq:0,
    attached:false,pinned:null,monitorSide:false,maxPane:null,broadcast:false,
    localFiles:[{name:exampleFiles[0].name,size:"12 KB",body:"旧本机版本"}], transfers:[], transferSeq:0,
    forwards:[{id:"F-1",name:"预检面板 · 回环",host:"H-2",mode:"Local",port:43188,target:"localhost:8080",phase:"已停止",bytes:0}],
    forwardSeq:1,monitor:{phase:"未采样",interval:"5",retention:"15",hosts:["H-1","H-2"],tick:0},settings:{auto:"关闭",terminal:"跟随系统",timeout:"20",file:"新标签",sftp:"SFTP",mcp:"工具目录"},
    logs:[], fault:"",fileFlip:false,command:"目录位置",settingPage:"通用",localShell:""};
}
let s=initial();
const timers=new Set();
function later(callback,delay=380) {
  const timer=setTimeout(()=>{timers.delete(timer);callback();},delay);
  timers.add(timer);
}
const host=(id)=>s.hosts.find((item)=>item.id===id);
const pane=(id=s.pane)=>s.run?.panes.find((item)=>item.id===id);
const visibleHost=(id)=>host(id)?.name||"本地 Shell";
function log(message) {s.logs.unshift(message);render();say(message);}
const cb=(label,key,id,value)=>`<label class="row"><input type="checkbox" data-${key}="${id}" ${checked(value)}>${text(label)}</label>`;
const field=(label,name,value,attributes="")=>`<label class="field">${label}<input name="${name}" value="${text(value)}" ${attributes}></label>`;
const select=(label,name,pairs,value)=>`<label class="field">${label}<select name="${name}" aria-label="${text(label)}">${opts(pairs,value)}</select></label>`;
const hostOptions=()=>s.hosts.map((row)=>[row.id,row.name]);
const authOptions=[["agent","SSH agent（演示）"],["key","模块私有密钥（演示）"],["prompt","交互式认证（演示）"]];
function hostRows() {
  const q=s.search.trim().toLowerCase();
  return s.hosts.filter((item)=>(!s.group||item.group===s.group)&&[item.name,item.user,item.address,item.tag,item.group].join(" ").toLowerCase().includes(q));
}
function stateOf(id) {
  const all=s.run?.panes.filter((item)=>item.host===id)||[];
  return all.find((item)=>item.phase==="ready")?.phase||all.at(-1)?.phase||"new";
}
function hostView() {
  const rows=hostRows();
  const groups=[...new Set(s.hosts.map((item)=>item.group))];
  const actions=(item)=>`<div class="row">${button("连接","connect",item.id,'class="primary"')}${button("编辑","edit-host",item.id)}${button("复制","copy-host",item.id)}${button("删除","delete-host",item.id,'class="danger"')}</div>`;
  const list=rows.map((item)=>`<tr><td>${cb("选择 "+item.name,"pick",item.id,s.picked.has(item.id))}</td><td><strong>${text(item.name)}</strong><code>${text(item.user)}@${text(item.address)}:${item.port}</code></td><td>${text(item.group)}<br>${badge(item.tag)}</td><td>${phases(stateOf(item.id))}</td><td>${actions(item)}</td></tr>`).join("");
  const grid=rows.map((item)=>`<section class="card stack">${cb("选择 "+item.name,"pick",item.id,s.picked.has(item.id))}<div class="bar"><h2>${text(item.name)}</h2>${phases(stateOf(item.id))}</div><code>${text(item.user)}@${text(item.address)}:${item.port}</code><p>${text(item.group)} · ${badge(item.tag)}</p>${actions(item)}</section>`).join("");
  return heading("主机","管理已授权主机、连接资料与信任记录。",button("演示导入","import")+button("新建主机","new-host","",'class="primary"'))+
    `<div class="stack"><section class="card stack"><div class="bar"><label class="field search">搜索主机<input id="host-search" value="${text(s.search)}" placeholder="名称、地址、用户或标签"></label>
    <label class="field">分组<select data-setting="group">${opts([["","全部主机"],...groups.map((g)=>[g,g])],s.group)}</select></label>
    <div class="row">${button("列表","host-layout","list",s.layout==="list"?'aria-pressed="true"':"")}${button("网格","host-layout","grid",s.layout==="grid"?'aria-pressed="true"':"")}</div></div>
    <div class="row">${badge("已选 "+s.picked.size+" 台")}${button("连接所选","connect-picked","",disabled(!s.picked.size))}${button("从选择建立工作区","new-work","",disabled(!s.picked.size))}${button("移动所选","move-hosts","",disabled(!s.picked.size))}</div></section>
    ${!rows.length?'<p class="card empty">没有符合条件的主机。</p>':s.layout==="list"?table("主机列表",["选择","主机与账号","分组／标签","连接状态","操作"],list):`<div class="auto">${grid}</div>`}</div>`;
}
function hostDialog(id, copy=false) {
  const old=host(id);
  const profile=old?{...old}:{name:"",address:"",user:"",port:22,tag:"开发",group:"研发 / 构建",auth:"agent"};
  if(copy)profile.name+=" 副本";
  const test=`<div class="row"><button type="button" id="test-profile">测试当前表单</button><span id="host-test-result" role="status"></span></div>`;
  show(copy?"复制主机":old?"编辑主机":"新建主机",
    `<div class="cols">${field("主机名称","name",profile.name,"required maxlength=80")}${field("地址（演示）","address",profile.address,'required maxlength=120 placeholder="node.lab.example"')}${field("用户名","user",profile.user,"required maxlength=50")}${field("端口","port",profile.port,"required type=number min=1 max=65535")}${field("分组路径","group",profile.group,"required maxlength=70")}${field("标签","tag",profile.tag,"required maxlength=30")}</div>
    ${select("认证方式","auth",authOptions,profile.auth)}<p class="muted">认证仅使用预设演示资料。请勿输入真实密码、密钥或口令。</p>${test}`,
    (data)=>{
      const values=Object.fromEntries(data);
      for(const key of ["name","address","user","tag","group"])values[key]=values[key].trim();
      if(["name","address","user","tag","group"].some((key)=>!values[key])){
        dialog.querySelector("#host-test-result").textContent="请填写完整的非空连接资料。";return false;
      }
      values.port=Number(values.port);
      if(old&&!copy)Object.assign(old,values);
      else s.hosts.push({...values,id:"H-"+(++s.seq)});
      dialog.close();log(old&&!copy?"主机配置已更新。":"主机配置已保存。");
    },"保存主机");
  const form=dialog.querySelector("form"), result=dialog.querySelector("#host-test-result");
  form.addEventListener("input",()=>{result.textContent="";});
  form.querySelector("#test-profile").addEventListener("click",()=>{
    if(!form.reportValidity())return;
    const auth=new FormData(form).get("auth");
    if(s.fault==="dial"){s.fault="";result.textContent="测试失败 · 模拟连接超时。";return;}
    result.textContent=auth==="prompt"?"目标可达 · 还需交互式认证。":"模拟测试成功。";
  });
}
function dependencies(id) {
  return [
    ...s.workspaces.filter((item)=>item.hosts.includes(id)).map((item)=>"工作区 "+item.name),
    ...s.forwards.filter((item)=>item.host===id).map((item)=>"转发 "+item.name),
    ...(s.monitor.hosts.includes(id)?["监控面板"]:[]),
    ...Object.entries(s.routes).filter(([target,rule])=>target===id||rule.via===id).map(([target])=>"路由 "+visibleHost(target)),
    ...(s.run?.panes.some((item)=>item.host===id)?["当前工作区会话"]:[])
  ];
}
function removeHost(id) {
  const used=dependencies(id);
  if(used.length){
    show("此主机仍被引用",`<p>请先移除或改绑以下引用。当前采用该演示约定。</p><ul>${used.map((item)=>`<li>${text(item)}</li>`).join("")}</ul>`);
    return;
  }
  show("删除主机",`<p>移除 ${text(visibleHost(id))} 的模拟配置与信任记录？</p>`,()=>{
    s.hosts=s.hosts.filter((item)=>item.id!==id);s.picked.delete(id);delete s.known[id];dialog.close();log("主机已删除。");
  },"删除主机");
}
function importDialog(){
  show("预览演示导入",`<p>OpenSSH 配置样例 · 1 个新主机</p><ul><li>应用审阅节点 · inspect.lab.example:22</li><li>代理命令字段已标为待复核</li></ul><p class="muted">演示使用内置样例。</p>`,()=>{
    s.hosts.push({id:"H-"+(++s.seq),name:"应用审阅节点",address:"inspect.lab.example",port:22,user:"inspect",group:"研发 / 验收",tag:"导入",auth:"agent"});
    dialog.close();log("已导入一台演示主机。");
  },"导入样例");
}

function routeHops(id,routes=s.routes) {
  const path=[id], seen=new Set(path);
  let head=id;
  while(routes[head]?.active){
    head=routes[head].via;
    if(seen.has(head)||!host(head))return null;
    seen.add(head);path.unshift(head);
  }
  return path;
}
function addPane(hostId) {
  const item={id:"P-"+(++s.paneSeq),host:hostId,phase:"new",hop:0,error:"",terminal:[],
    files:exampleFiles.map((file)=>({...file})),epoch:0,path:"/srv/review"};
  s.run.panes.push(item);s.pane=item.id;
  return item;
}
function begin(item,partial=false) {
  item.chain=routeHops(item.host)||[item.host];
  item.hop=0;item.phase="dial";item.error="";item.epoch++;
  const epoch=item.epoch;
  const fault=partial?"dial":s.fault;
  if(["dial","key","auth"].includes(s.fault))s.fault="";
  item.changed=fault==="key";item.reject=fault==="auth";
  later(()=>{
    if(pane(item.id)!==item||item.epoch!==epoch)return;
    if(fault==="dial"){item.phase="error";item.error="模拟连接超时 · "+visibleHost(item.chain[0]);log(item.error);return;}
    verify(item);
  });
}
function verify(item) {
  const hop=item.chain[item.hop];
  const current=s.known[hop];
  if(item.changed){s.offeredVersions[hop]=(s.offeredVersions[hop]||1)+1;item.changed=false;}
  const offered=fingerprint(hop,s.offeredVersions[hop]||1);
  item.offered=offered;
  if(current&&current!==offered){item.phase="error";item.error="主机密钥已变化 · "+visibleHost(hop)+"。请先在已知主机中复核。";log(item.error);return;}
  if(!current){item.phase="trust";render();say("等待主机信任决定。");return;}
  authenticate(item);
}
function authenticate(item) {
  const h=host(item.chain[item.hop]);
  if(item.reject){item.phase="error";item.error="服务端拒绝演示认证 · "+h.name;log(item.error);return;}
  if(h.auth==="prompt"){item.phase="auth";render();say("等待演示认证。");return;}
  advance(item);
}
function advance(item){
  if(item.hop<item.chain.length-1){item.hop++;verify(item);return;}
  item.phase="ready";item.error="";item.terminal=["[会话已建立 · 演示输出]",host(item.host).user+"@"+host(item.host).address+"  "+item.path];
  log(visibleHost(item.host)+" 已连接。");
}
function terminate(item,reason) {
  item.epoch++;
  item.phase=reason==="cancel"?"cancel":"closed";
  item.error="";
  s.forwards.filter((rule)=>rule.boundPane===item.id&&rule.phase==="监听中").forEach((rule)=>{rule.phase=rule.resume?"待恢复":"已停止";rule.error="所借用会话已断开。";rule.boundPane=null;});
  s.transfers.filter((job)=>job.pane===item.id&&["传输中","已暂停","等待目标选择"].includes(job.phase)).forEach((job)=>{job.phase="连接中断";job.token++;});
  if(s.maxPane===item.id)s.maxPane=null;
}
function launch(name,ids,preset,replace=true){
  if(!ids.length||ids.length>12||ids.some((id)=>!host(id))){
    say("工作区需要 1–12 台存在且不重复的主机。");return;
  }
  if(s.fault==="layout"){s.fault="";render();say("工作区结构保存失败，未改变现有会话。");return;}
  if(replace||!s.run){
    s.run?.panes.forEach((item)=>terminate(item,"close"));
    s.run={name,preset,panes:[]};s.pinned=null;s.maxPane=null;s.broadcast=false;s.attached=false;
  }
  if(s.run.panes.length+ids.length>12){say("每个工作区最多 12 个分栏。");return;}
  const active=ids.map(addPane);
  const partial=s.fault==="partial";if(partial)s.fault="";
  s.pane=active[0].id;s.page="work";
  active.forEach((item,index)=>begin(item,partial&&index===active.length-1));
  render();say("工作区已建立，等待各分栏连接。");
}
function workspaceDialog(id) {
  const existing=s.workspaces.find((item)=>item.id===id);
  const defaults=existing?.hosts||[...s.picked];
  const body=field("工作区名称","name",existing?.name||"开发节点联调","required maxlength=80")+
    select("布局","preset",presets,existing?.preset||"two")+
    `<fieldset><legend>主机（最多 12 台，按列表顺序）</legend><div class="stack">${s.hosts.map((item)=>`<label class="row"><input name="hosts" type="checkbox" value="${item.id}" ${checked(defaults.includes(item.id))}>${text(item.name)}</label>`).join("")}</div></fieldset>
    ${existing?'<input name="kind" type="hidden" value="fixed">':select("用途","kind",[["temp","立即启动临时工作区"],["fixed","保存固定模板"]],"temp")}
    <p id="work-error" class="notice err" role="alert" hidden></p>`;
  show(existing?"编辑工作区":"建立工作区",body,(data)=>{
    const ids=data.getAll("hosts"),name=String(data.get("name")).trim(),preset=data.get("preset");
    const error=dialog.querySelector("#work-error");
    if(!name||!ids.length||ids.length>12){error.hidden=false;error.textContent="需要名称及 1–12 台主机。";return false;}
    if(data.get("kind")==="temp"&&s.fault==="layout"){s.fault="";error.hidden=false;error.textContent="结构保存失败，所有输入保留，可再次保存。";return false;}
    dialog.close();
    if(data.get("kind")==="temp")launch(name,ids,preset);
    else {
      if(existing)Object.assign(existing,{name,hosts:ids,preset});
      else s.workspaces.push({id:"W-"+Date.now(),name,hosts:ids,preset});
      s.page="work";log("工作区模板已保存。");
    }
  },existing?"保存模板":"继续");
}
function workView(){
  const list=s.workspaces.map((item)=>`<li class="bar"><div><strong>${text(item.name)}</strong> <small>${item.hosts.length} 台主机 · ${presets.find(([id])=>id===item.preset)[1]}</small></div><div class="row">${button("启动","start-work",item.id)}${button("编辑","edit-work",item.id)}${button("删除","remove-work",item.id,'class="danger"')}</div></li>`).join("");
  const workspace=`<details class="card" ${s.run?"":"open"}><summary>工作区模板 · ${s.workspaces.length}</summary><ul class="list">${list||'<li class="empty">没有固定模板。</li>'}</ul></details>`;
  const active=pane();
  if(!active)return heading("工作区","为多台获准访问的主机组织会话。",button("建立工作区","new-work","",'class="primary"'))+
    `<div class="stack">${workspace}<p class="card empty">尚未打开会话。可启动模板或由主机目录建立连接。</p>${localCard()}</div>`;
  const run=s.run;
  const visible=run.panes.filter((item)=>run.preset==="tabs"?item.id===active.id:!s.maxPane||s.maxPane===item.id);
  const navigation=run.panes.map((item)=>button(visibleHost(item.host),"focus-pane",item.id,item.id===active.id?'aria-pressed="true"':"")).join("");
  const split=`<div class="pane-grid ${visible.length===1?"one":run.preset}">${visible.map(paneCard).join("")}</div>`;
  return heading("工作区",run.name+" · "+run.panes.length+" 个分栏",button("建立工作区","new-work")+button("保存为模板","save-work"))+
    `<div class="stack">${workspace}
    <div class="card stack" id="workspace-run"><div class="row session-tabs" aria-label="会话分栏">${navigation}</div>
    <div class="bar"><div class="row">
      <label class="row">布局 <select data-setting="preset">${opts(presets,run.preset)}</select></label>
      ${button("增加分栏","split","",disabled(run.panes.length>=12))}
      ${button(s.maxPane?"还原分栏":"最大化分栏","max",active.id)}
      ${button(s.broadcast?"关闭广播":"开启广播","broadcast","",`aria-pressed="${s.broadcast}"`)}
    </div><div class="row">${button(s.attached?"隐藏活动文件":"活动分栏文件","toggle-files")}${button("打开独立文件视图","pin-file",active.id,disabled(active.phase!=="ready"))}${button(s.monitorSide?"隐藏监控":"活动分栏监控","toggle-monitor")}</div></div>
    ${s.broadcast?'<p class="notice warn">广播开启 · 模拟输出将写入当前工作区中的可见已连接分栏。</p>':""}
    <div class="${s.monitorSide?"work-area monitor-open":"work-area"}">${split}${s.monitorSide?monitorSide(active):""}</div>
    ${s.attached?attachedFiles(active):""}</div>${localCard()}</div>`;
}
function paneCard(item) {
  const focused=item.id===s.pane;
  const hop=item.chain?.[item.hop];
  let content;
  if(item.phase==="ready"){
    content=`<pre class="terminal-output" aria-label="模拟终端输出">${text(item.terminal.join("\n"))}</pre>
      <div class="row terminal-actions"><label class="row">演示动作<select data-setting="command">${opts([["目录位置","显示当前目录"],["服务状态","查看预设状态"]],s.command)}</select></label>
      ${button("生成模拟输出","mock-output",item.id,disabled(!focused))}${button("断开连接","disconnect",item.id)}</div>`;
  } else if(item.phase==="trust"){
    content=`<div class="stack pane-message"><h3>核对主机指纹</h3><p>第 ${item.hop+1} 跳 · ${text(visibleHost(hop))}<br><code>${item.offered}</code></p><div class="row">${button("信任并继续","trust",item.id,'class="primary"')}${button("仅本次信任","trust-once",item.id)}${button("拒绝并取消","cancel-pane",item.id)}</div></div>`;
  } else if(item.phase==="auth"){
    content=`<div class="stack pane-message"><h3>完成交互式认证</h3><p>第 ${item.hop+1} 跳 · ${text(visibleHost(hop))}。使用预置的模拟回答。</p><div class="row">${button("提交演示回答","authenticate",item.id,'class="primary"')}${button("取消认证","cancel-pane",item.id)}</div></div>`;
  } else {
    content=`<div class="stack pane-message"><p>${text(item.error||phase[item.phase])}</p><div class="row">${item.phase==="dial"?button("取消拨号","cancel-pane",item.id):button("重新连接","retry-pane",item.id,'class="primary"')}${item.error.includes("密钥已变化")?button("到已知主机复核","nav","known"):""}</div></div>`;
  }
  const chain=item.chain?.map((id)=>visibleHost(id)).join(" → ");
  return `<section class="console ${focused?"active-console":""}" data-pane="${item.id}">
    <header class="bar"><strong>${text(visibleHost(item.host))}</strong><div class="row">${phases(item.phase)}${button("关闭分栏","close-pane",item.id,'class="quiet"')}</div></header>
    ${chain?`<p class="chain">本机 → ${text(chain)}</p>`:""}${content}</section>`;
}
function localCard(){
  return `<section class="card stack"><div class="bar"><h2>本地终端演示</h2>${s.localShell?button("关闭本地演示","local-end"):button("打开本地演示","local-start")}</div>
   ${s.localShell?`<pre class="terminal-output">${text(s.localShell)} · 本地演示输出\n未启动任何系统程序。</pre>`:""}</section>`;
}

const getJob=(id)=>s.transfers.find((item)=>item.id===id);
function attachedFiles(item){
  const ready=item.phase==="ready";
  return `<section class="card stack"><div class="bar"><h2>活动分栏文件 · ${text(visibleHost(item.host))}</h2>${badge(item.path)}</div>
    ${ready?fileList(item.files,item,true):'<p>连接就绪后可浏览文件。</p>'}</section>`;
}
function fileList(files,item,remote){
  return `<ul class="list">${files.map((file,index)=>`<li class="bar"><div><strong>${text(file.name)}</strong><small>${text(file.size)}</small></div><div class="row">
    ${button(remote?"下载":"上传",remote?"download":"upload",item.id+"|"+index,disabled(item.phase!=="ready"))}
    ${remote?button("编辑","edit-file",item.id+"|"+index,disabled(item.phase!=="ready"||s.settings.sftp==="SCP")):""}</div></li>`).join("")||'<li class="empty">此目录没有演示文件。</li>'}</ul>`;
}
function fileView(){
  const pinned=pane(s.pinned);
  const message=pinned?visibleHost(pinned.host)+" · 固定于会话 "+pinned.id:"从已连接分栏打开独立文件视图。";
  const remote=pinned?`<section class="card stack"><div class="bar"><h2>${text(visibleHost(pinned.host))}</h2>${phases(pinned.phase)}</div><div class="bar"><code>${pinned.path}</code>${button(pinned.path==="/srv/review"?"返回上级":"打开 review 目录","file-path",pinned.id,disabled(pinned.phase!=="ready"||s.settings.sftp==="SCP"))}</div>${pinned.path==="/srv/review"?fileList(pinned.files,pinned,true):'<p class="empty">此层包含 review 目录。</p>'}</section>`:"";
  const local=pinned?`<section class="card stack"><h2>本机 · 演示设备</h2><code>演示目录 / 交付走查</code>${fileList(s.localFiles,pinned,false)}</section>`:"";
  const panels=pinned?`<div class="row">${button("交换左右位置","flip")}${button("关闭独立文件视图","close-file",pinned.id)}${button("返回工作区","nav","work")}</div>
  ${s.settings.sftp==="SCP"?'<p class="notice warn">SFTP 不可用。SCP 演示保留双向文件传输，浏览目录及远端编辑停用。</p>':""}
  <div class="cols">${s.fileFlip?remote+local:local+remote}</div>`:`<p class="card empty">没有已绑定的独立文件视图。 ${button("前往工作区","nav","work")}</p>`;
  const queue=s.transfers.map((job)=>{
    const row=(label,act)=>button(label,act,job.id);
    const buttons={
      "等待目标选择":row("处理冲突","conflict")+row("取消传输","cancel-transfer"),
      "传输中":row("暂停传输","pause-transfer")+row("取消传输","cancel-transfer"),
      "已暂停":row("继续传输","resume-transfer")+row("取消传输","cancel-transfer"),
      "传输失败":row("重试传输","retry-transfer"),
      "连接中断":row("重试传输","retry-transfer")
    }[job.phase]||"";
    return `<li class="stack" data-transfer="${job.id}"><div class="bar"><div><strong>${text(job.file.name)}</strong><br><small>${job.id} · ${text(job.hostName)} · ${job.direction==="download"?"远端 → 本机":"本机 → 远端"}</small></div>${badge(job.phase,job.phase==="已完成"?"ok":job.phase==="传输失败"?"err":job.phase==="等待目标选择"?"warn":"")}</div>
    <progress value="${job.progress}" max="100" aria-label="传输进度"></progress><div class="bar"><small>${job.progress}% ${job.error?text(job.error):""}</small><div class="row">${buttons}</div></div></li>`;
  }).join("");
  return heading("文件传输",message)+`<div class="stack"><div class="stack">${panels}</div><section class="card stack" id="transfer-center"><div class="bar"><h2>传输中心</h2>${badge(s.transfers.length+" 项")}</div><ul class="list">${queue||'<li class="empty">暂无传输任务。</li>'}</ul></section></div>`;
}
const destination=(job,item)=>job.direction==="download"?s.localFiles:item.files;
function createTransfer(direction,ref) {
  const [id,index]=ref.split("|"), item=pane(id);
  if(item?.phase!=="ready")return;
  const file=(direction==="download"?item.files:s.localFiles)[Number(index)];
  if(!file)return;
  const job={id:"X-"+(++s.transferSeq),pane:id,hostName:visibleHost(item.host),direction,file:{...file},phase:"等待目标选择",progress:0,token:0,error:""};
  s.transfers.unshift(job);
  s.page="files";
  if(destination(job,item).some((entry)=>entry.name===file.name)){render();conflictDialog(job);}
  else startTransfer(job);
}
function conflictDialog(job){
  show("已存在同名文件",`<p>${text(job.file.name)} · 旧目标保留到传输成功。</p>`+
    select("目标处理","resolution",[["cancel","保留旧文件并取消"],["replace","成功后覆盖"],["resume","校验后续传"],["skip","跳过此文件"]],"cancel"),(data)=>{
    const resolution=data.get("resolution");
    dialog.close();
    if(resolution==="cancel"||resolution==="skip"){job.phase=resolution==="skip"?"已跳过":"已取消";log("旧目标已保留。");}
    else {
      const item=pane(job.pane);
      const existing=item&&destination(job,item).find((entry)=>entry.name===job.file.name);
      if(resolution==="resume"&&existing&&!job.file.body.startsWith(existing.body)){
        job.phase="传输失败";job.error="续传前缀不匹配，旧目标完整保留。";job.retryChoice=true;log(job.error);return;
      }
      job.retryChoice=false;job.approved=true;job.progress=resolution==="resume"?35:0;startTransfer(job);
    }
  },"应用选择");
}
function startTransfer(job){
  const item=pane(job.pane);
  if(item?.phase!=="ready"){job.error="源会话尚未连接。";job.phase="连接中断";render();return;}
  if(!job.approved&&destination(job,item).some((entry)=>entry.name===job.file.name)){
    job.phase="等待目标选择";job.error="";render();conflictDialog(job);return;
  }
  job.phase="传输中";job.error="";
  const token=++job.token;
  const shouldFail=s.fault==="transfer";if(shouldFail)s.fault="";
  const tick=()=>{
    if(job.token!==token||job.phase!=="传输中")return;
    if(pane(job.pane)?.phase!=="ready"){job.phase="连接中断";render();return;}
    if(shouldFail&&job.progress>=50){job.phase="传输失败";job.error="模拟网络中断 · 旧目标完整保留";log(job.error);return;}
    job.progress=Math.min(100,job.progress+25);
    if(job.progress<100){render();later(tick,650);return;}
    const files=destination(job,item),index=files.findIndex((entry)=>entry.name===job.file.name);
    if(index>=0&&!job.approved){job.phase="等待目标选择";job.progress=0;job.error="目标在传输期间出现，等待确认。";render();return;}
    if(index<0)files.push({...job.file});else files[index]={...job.file};
    job.phase="已完成";log(job.file.name+" 已传输并提交目标。");
  };
  render();later(tick,650);
}
function editFile(ref){
  const [id,index]=ref.split("|"),item=pane(id),file=item?.files[Number(index)];
  if(!file||item.phase!=="ready")return;
  let revision=file.version||1;
  show("编辑远端样例",`<p>${text(file.name)} · 版本 ${revision}</p>
    <label class="field">正文<textarea name="body" aria-label="正文" required>${text(file.body)}</textarea></label>
    <p id="remote-error" class="notice err" role="alert" hidden></p>`,(data)=>{
    if(s.fault==="file"){s.fault="";file.version=revision+1;file.body+="\n服务端另有修改。";}
    if((file.version||1)!==revision){
      const error=dialog.querySelector("#remote-error");error.hidden=false;error.textContent="远端版本已变化，草稿保留。取消后可重新载入当前版本。";return false;
    }
    file.body=String(data.get("body"));file.version=revision+1;dialog.close();log("远端样例正文已更新。");
  },"保存远端样例");
}
function routeView() {
  const rows=Object.entries(s.routes).map(([id,rule])=>`<tr><td>${text(visibleHost(id))}</td><td>${text(routeHops(id)?.map(visibleHost).join(" → ")||"路径不可用")}<small>直接跳板 · ${text(visibleHost(rule.via))}</small></td><td>${badge(rule.active?"已启用":"已停用",rule.active?"ok":"")}</td><td><div class="row">${button(rule.active?"停用":"启用","route-toggle",id)}${button("编辑","edit-route",id)}${button("移除","remove-route",id)}</div></td></tr>`).join("");
  return heading("跳板路由／代理","定义之后的新连接使用的路径。",button("新建路由","add-route","",'class="primary"'))+
    `<div class="stack"><section class="card stack"><div class="bar"><h2>全局出站代理</h2><label class="row">代理模式 <select data-setting="proxy">${opts([["inherit","系统默认"],["direct","直连"],["socks","演示 SOCKS5"],["http","演示 HTTP"]],s.proxy)}</select></label></div><small>每次连接使用发起时的实际路由。停用路由后，新连接直连，现有会话继续使用其原路径。</small></section>
    ${rows?table("跳板路由",["目标主机","当前配置路径","配置状态","操作"],rows):'<p class="card empty">尚无跳板路由。</p>'}</div>`;
}
function routeDialog(id=""){
  const possible=hostOptions(), rule=s.routes[id];
  if(possible.length<2){say("至少需要两台主机才能添加路由。");return;}
  show(rule?"编辑跳板路由":"新建跳板路由",`${id?`<p>目标 · ${text(visibleHost(id))}</p>`:select("目标主机","target",possible,possible[0][0])}
    ${select("直接跳板","via",possible,rule?.via||possible.at(-1)[0])}
    <label class="row"><input name="enabled" type="checkbox" ${checked(rule?.active??true)}>启用路径</label><p id="route-error" class="notice err" role="alert" hidden></p>`,(data)=>{
    const target=id||data.get("target"),via=data.get("via"),active=data.has("enabled");
    const routes={...s.routes,[target]:{via,active}};
    const activeOnly=Object.fromEntries(Object.entries(routes).map(([key,value])=>[key,{...value,active:true}]));
    const error=dialog.querySelector("#route-error");
    if(target===via||!routeHops(target,activeOnly)){error.textContent="该路径会引用自身或形成循环。请选择其他跳板。";error.hidden=false;return false;}
    s.routes=routes;dialog.close();log("跳板路由已保存。");
  },"保存路由");
}

const modes=[["Local","Local · 本机监听"],["Remote","Remote · 远端监听"],["SOCKS5","SOCKS5 · SSH 出口"],["HTTP CONNECT","HTTP CONNECT · SSH 出口"]];
function forwardView(){
  const rows=s.forwards.map((item)=>`<tr><td><strong>${text(item.name)}</strong><small>${text(visibleHost(item.host))} · ${item.mode}</small></td><td><code>${item.mode==="Remote"?"远端":"本机"} 127.0.0.1:${item.port}</code><small>${text(item.target||"动态目的地")}</small></td><td>${badge(item.phase,item.phase==="监听中"?"ok":item.error?"err":"")}${item.error?`<small>${text(item.error)}</small>`:""}${item.phase==="监听中"?`<small>${text(item.owner)} · ${item.count||0} 次 · ${item.bytes} B</small>`:""}</td><td><div class="row">${button(item.phase==="监听中"?"停止":item.phase==="待恢复"?"恢复":item.error?"重试":"启动","forward-toggle",item.id)} ${button("编辑","edit-forward",item.id)} ${button("删除","remove-forward",item.id)} ${item.phase==="监听中"?button("模拟流量","forward-sample",item.id):""}</div></td></tr>`).join("");
  return heading("端口转发","规则保存后，可独立启动回环监听。",button("新建规则","new-forward","",'class="primary"'))+
    `<div class="stack">${rows?table("端口转发规则",["规则","监听与目的地","运行状态","操作"],rows):'<p class="card empty">尚未保存转发规则。</p>'}<p class="notice">回环地址与流量为演示数据；启动、停止和恢复只改变本页模型。</p></div>`;
}
function forwardDialog(id){
  const previous=s.forwards.find((item)=>item.id===id);
  const hosts=hostOptions();
  if(!hosts.length){say("请先建立主机配置。");return;}
  const defaults=previous||{name:"",host:hosts[0][0],mode:"Local",port:43190,target:"localhost:8080",resume:false};
  show(previous?"编辑转发规则":"新建转发规则",
    `${field("规则名称","name",defaults.name,"required maxlength=80")}
     ${select("SSH 主机","host",hosts,defaults.host)}${select("转发模式","mode",modes,defaults.mode)}
     ${field("回环监听端口","port",defaults.port,"type=number min=1024 max=65535 required")}
     ${field("静态目的地址（演示）","target",defaults.target,"maxlength=70 required")}
     <label class="row"><input name="resume" type="checkbox" ${checked(defaults.resume)}>断线后提供恢复操作</label>
     ${previous?.phase==="监听中"?'<p class="notice warn">保存时会停止正在监听的旧规则。</p>':""}`,(data)=>{
       const profile={name:String(data.get("name")).trim(),host:data.get("host"),mode:data.get("mode"),port:Number(data.get("port")),
         target:String(data.get("target")||"").trim(),resume:data.has("resume"),phase:"已停止",bytes:0,count:0,error:""};
       if(!profile.name){dialog.querySelector('[name="name"]').focus();return false;}
       if(previous)Object.assign(previous,profile);
       else s.forwards.push({...profile,id:"F-"+(++s.forwardSeq)});
       dialog.close();log("转发规则已保存，等待启动。");
     },"保存规则");
  const mode=dialog.querySelector('[name="mode"]'),target=dialog.querySelector('[name="target"]');
  const fields=()=>{const visible=["Local","Remote"].includes(mode.value);target.required=visible;target.disabled=!visible;target.closest("label").hidden=!visible;};
  mode.addEventListener("change",fields);fields();
}
const forward=(id)=>s.forwards.find((item)=>item.id===id);
function toggleForward(id) {
  const item=forward(id);
  if(item.phase==="监听中"){item.phase="已停止";item.error="";log("已停止该规则。");return;}
  const conflict=s.forwards.some((other)=>other!==item&&other.phase==="监听中"&&other.port===item.port&&(other.mode==="Remote")===(item.mode==="Remote")&&(item.mode!=="Remote"||other.host===item.host));
  if(conflict||s.fault==="port"||s.fault==="forward-denied"){
    item.phase="启动失败";item.error=s.fault==="forward-denied"?"远端拒绝绑定演示监听器。":"回环端口已被占用。";s.fault="";log(item.error);return;
  }
  item.phase="监听中";item.error="";
  const borrowed=s.run?.panes.find((entry)=>entry.host===item.host&&entry.phase==="ready");
  item.boundPane=borrowed?.id||null;
  item.owner=borrowed?"借用工作区会话":"专用模拟连接";
  log("规则 "+item.name+" 已开始监听（模拟）。");
}
function monitorSide(item){
  return `<aside class="card stack"><h2>活动分栏监控</h2><p>${text(visibleHost(item.host))}</p>${item.phase==="ready"?
    `<div class="metrics"><div><small>CPU</small><strong>${21+s.monitor.tick%13}%</strong></div><div><small>内存</small><strong>2.4 GB</strong></div></div>${button("取样","sample")}`:"<p>等待连接后采样。</p>"}${button("打开监控面板","nav","monitor")}</aside>`;
}
function monitorView(){
  const m=s.monitor;
  const cards=m.hosts.map((id,index)=>{
    const phase=m.phase==="采样中"?(stateOf(id)==="ready"?"正在采样":"连接待就绪"):m.phase;
    return `<section class="card stack"><div class="bar"><h2>${text(visibleHost(id))}</h2>${badge(phase,phase==="正在采样"?"ok":phase==="采样失败"?"err":"")}</div>
    ${phase==="正在采样"?`<div class="metrics"><div><small>CPU</small><strong>${(21+index*12+m.tick*3)%83}%</strong></div><div><small>内存</small><strong>${(2.4+index*.7).toFixed(1)} GB</strong></div><div><small>磁盘</small><strong>${36+index*7}%</strong></div></div><small>样本 ${m.tick} · 历史上限 ${m.retention} 分钟</small>`:"<small>当前没有新样本。</small>"}</section>`;
  }).join("");
  return heading("监控","预发布节点资源概览。",button("配置面板","monitor-config"))+
    `<div class="stack"><section class="card bar"><div>${badge(m.phase,m.phase==="采样中"?"ok":m.phase==="采样失败"?"err":"")} <small>周期 ${m.interval} 秒</small></div>
    <div class="row">${button(m.phase==="采样中"?"暂停采样":m.phase==="已暂停"?"继续采样":m.phase==="采样失败"?"重试采样":"开始采样","monitor-toggle","",'class="primary"')}${button("推进一个样本","sample","",disabled(m.phase!=="采样中"))}</div></section>
    ${m.phase==="采样失败"?'<p class="notice err">模拟读取失败，请检查会话后重试。</p>':""}
    <div class="auto">${cards||'<p class="card empty">尚未选择监控主机。</p>'}</div></div>`;
}
function configureMonitor(){
  const m=s.monitor;
  show("配置监控面板",`${select("采样周期","interval",[2,5,10,30,60].map((value)=>[String(value),value+" 秒"]),m.interval)}
    ${select("保留时间","retention",[15,60,360,1440].map((value)=>[String(value),value+" 分钟"]),m.retention)}
    <fieldset><legend>主机</legend>${s.hosts.map((item)=>`<label class="row"><input name="hosts" type="checkbox" value="${item.id}" ${checked(m.hosts.includes(item.id))}>${text(item.name)}</label>`).join("")}</fieldset>`,(data)=>{
    Object.assign(m,{interval:data.get("interval"),retention:data.get("retention"),hosts:data.getAll("hosts"),phase:"未采样",tick:0});dialog.close();log("监控面板配置已保存。");
  },"保存配置");
}
function auxiliaryView(){
  const page=s.page;
  if(page==="settings")return settingsView();
  const views={
    logs:["会话日志","本次演示的连接、文件和状态活动。",s.logs.map((message)=>[message,"",""]),"回到工作区","nav","work"],
    keys:["密钥","SSH 模块管理的演示密钥。",s.keys.map((name)=>[name,"Ed25519 · 演示公开标识",button("移除","remove-key",name)]),"新增演示密钥","add-key",""],
    known:["已知主机","核对已保存的主机指纹。",Object.entries(s.known).map(([id,fp])=>[visibleHost(id),fp,button("移除保存的指纹","forget",id)]),"返回工作区","nav","work"],
    commands:["快捷操作","预览生成到分栏的演示输出。",[["显示当前目录","预设输出 · 当前分栏",button("应用到工作区","pick-command","目录位置")],["查看预设状态","预设输出 · 当前分栏",button("应用到工作区","pick-command","服务状态")]],"回到工作区","nav","work"]
  };
  const [title,intro,rows,label,act,id]=views[page];
  return heading(title,intro,button(label,act,id))+`<section class="card"><ul class="list">${rows.map(([name,sub,action])=>`<li class="bar"><div><strong>${text(name)}</strong>${sub?`<br><small class="mono">${text(sub)}</small>`:""}</div>${action}</li>`).join("")||'<li class="empty">本次演示没有可显示的记录。</li>'}</ul></section>`;
}
function settingsView(){
  const pages=["通用","终端","连接","文件","MCP"];
  const def={
    "通用":[["自动恢复布局","auto",[["关闭","关闭"],["开启","开启"]]]],
    "终端":[["终端配色","terminal",[["跟随系统","跟随主题"],["浅色","浅色"],["深色","深色"]]]],
    "连接":[["连接超时","timeout",[["10","10 秒"],["20","20 秒"],["30","30 秒"]]]],
    "文件":[["独立文件打开方式","file",[["新标签","新标签"],["新窗口","新窗口（演示仍在当前页面）"]]],["传输能力","sftp",[["SFTP","SFTP"],["SCP","模拟 SFTP 不可用，改用 SCP"]]]],
    "MCP":[["工具视图","mcp",[["工具目录","统一工具目录 · SSH 筛选"],["最近活动","统一网关 · 最近 SSH 活动"]]]]
  };
  return heading("SSH 设置","保存 SSH 模块内的布局、会话与文件偏好。")+
    `<div class="stack"><div class="row">${pages.map((page)=>button(page,"setting-page",page,page===s.settingPage?'aria-pressed="true"':"")).join("")}</div>
    <section class="card"><form id="ssh-settings" class="stack">${def[s.settingPage].map(([label,name,items])=>select(label,name,items,s.settings[name])).join("")}
    <div class="row"><button type="submit" class="primary">保存设置</button>${s.settingPage==="MCP"?button("查看 SSH 示例能力","ssh-tools"):""}</div>
    ${s.settingPage==="连接"?'<p class="muted">连接超时用于下次连接；当前演示拨号使用固定时长。</p>':""}</form></section></div>`;
}

const faults=[["","无"],["dial","下一连接超时"],["key","主机密钥变化"],["auth","认证被拒绝"],
  ["layout","工作区结构保存失败"],["partial","工作区最后分栏失败"],["transfer","传输中断"],
  ["file","远端文件版本变化"],["port","转发端口占用"],["forward-denied","服务端拒绝转发"],["monitor","采样失败"]];
function render(){
  renderNav(sections,s.page);
  const views={hosts:hostView,work:workView,files:fileView,monitor:monitorView,routes:routeView,forward:forwardView};
  region.innerHTML=(views[s.page]||auxiliaryView)();
  document.querySelector("#demo").innerHTML=`<label class="row">注入下一次故障 <select aria-label="注入下一次故障" data-setting="fault">${opts(faults,s.fault)}</select></label>${button("模拟监听断线","break-forwards")}${button("复位演示","reset")}<span>全程使用虚构主机、文件和输出。</span>`;
}
function moveHosts(){
  show("移动所选主机",field("目标分组路径","group","研发 / 验收","required maxlength=70"),(data)=>{
    const group=String(data.get("group")).trim();
    if(!group)return false;
    s.hosts.filter((item)=>s.picked.has(item.id)).forEach((item)=>item.group=group);
    s.group="";dialog.close();log("已移动选中主机。");
  },"移动");
}
function chooseSplit(){
  if(!s.hosts.length)return;
  show("增加会话分栏",select("分栏主机","id",hostOptions(),s.hosts[0].id),(data)=>{
    dialog.close();launch(s.run.name,[data.get("id")],s.run.preset,false);
  },"建立分栏");
}
function saveRun(){
  show("保存工作区模板",field("模板名称","name",s.run.name,"required maxlength=80"),(data)=>{
    const name=String(data.get("name")).trim();
    if(!name)return false;
    const ids=[...new Set(s.run.panes.map((item)=>item.host))];
    s.workspaces.push({id:"W-"+Date.now(),name,hosts:ids,preset:s.run.preset});
    dialog.close();log("已从当前分栏保存工作区模板。");
  },"保存模板");
}
function closePane(item) {
  terminate(item,"close");s.run.panes=s.run.panes.filter((entry)=>entry!==item);
  if(item.id===s.pane)s.pane=s.run.panes[0]?.id||0;
  if(item.id===s.pinned)s.pinned=null;
  if(!s.run.panes.length)s.run=null;
  log("分栏已关闭。");
}
function simulatedOutput(item){
  const visible=(candidate)=>s.run.preset==="tabs"?candidate.id===s.pane:!s.maxPane||s.maxPane===candidate.id;
  const targets=s.broadcast?s.run.panes.filter((candidate)=>candidate.phase==="ready"&&visible(candidate)):[item];
  for(const candidate of targets){
    const output=s.command==="目录位置"?candidate.path:"应用预检服务：可用 · 演示样本";
    candidate.terminal.push("> "+s.command,output);
  }
  log("已为 "+targets.length+" 个分栏生成演示输出。");
}
appClicks((act,id,control)=>{
  const page={home:"hosts","rail-settings":"settings",nav:id}[act];
  if(page){s.page=page;render();keepFocus(control,document.querySelector("#main"));return;}
  const item=pane(id), job=getJob(id);
  const change=(title,words,commit,label)=>show(title,"<p>"+text(words)+"</p>",()=>{dialog.close();commit();},label);
  const actions={
    "new-host":()=>hostDialog(),"edit-host":()=>hostDialog(id),"copy-host":()=>hostDialog(id,true),"delete-host":()=>removeHost(id),
    import:()=>importDialog(),"host-layout":()=>{s.layout=id;render();},"move-hosts":()=>moveHosts(),
    connect:()=>launch(visibleHost(id),[id],"one",!s.run),
    "connect-picked":()=>launch("选择的主机",[...s.picked],"two"),
    "new-work":()=>workspaceDialog(),"edit-work":()=>workspaceDialog(id),
    "start-work":()=>{const w=s.workspaces.find((entry)=>entry.id===id);launch(w.name,w.hosts,w.preset);},
    "remove-work":()=>change("删除工作区模板","可以从主机目录重新建立工作区。",()=>{s.workspaces=s.workspaces.filter((entry)=>entry.id!==id);log("模板已删除。");},"删除模板"),
    "save-work":()=>saveRun(),split:()=>chooseSplit(),
    "focus-pane":()=>{s.pane=id;if(s.maxPane)s.maxPane=id;render();},
    max:()=>{s.maxPane=s.maxPane?null:id;render();},
    broadcast:()=>{s.broadcast=!s.broadcast;render();},
    "toggle-files":()=>{s.attached=!s.attached;render();},
    "toggle-monitor":()=>{s.monitorSide=!s.monitorSide;render();},
    "mock-output":()=>simulatedOutput(item),
    "cancel-pane":()=>{terminate(item,"cancel");log("已取消该分栏连接。");},
    disconnect:()=>{terminate(item,"close");log("会话已断开，工作区布局仍可使用。");},
    "close-pane":()=>closePane(item),
    "retry-pane":()=>{begin(item);render();},
    trust:()=>{s.known[item.chain[item.hop]]=item.offered;authenticate(item);},
    "trust-once":()=>authenticate(item),
    authenticate:()=>advance(item),
    forget:()=>change("移除保存的指纹","请先独立核对主机身份。下次连接会重新请求信任。",()=>{delete s.known[id];log("已移除保存的指纹。");},"移除指纹"),
    "pin-file":()=>{s.pinned=id;s.page="files";render();say("独立文件视图绑定 "+visibleHost(item.host)+"。");},
    "close-file":()=>{s.pinned=null;render();say("独立文件视图已关闭，传输任务仍可查询。");},
    "file-path":()=>{item.path=item.path==="/srv/review"?"/srv":"/srv/review";render();},
    flip:()=>{s.fileFlip=!s.fileFlip;render();},
    download:()=>createTransfer("download",id),upload:()=>createTransfer("upload",id),"edit-file":()=>editFile(id),
    conflict:()=>conflictDialog(job),
    "cancel-transfer":()=>{job.phase="已取消";job.token++;log("传输已取消，目标未更改。");},
    "pause-transfer":()=>{job.phase="已暂停";job.token++;render();},
    "resume-transfer":()=>startTransfer(job),
    "retry-transfer":()=>{job.progress=0;if(job.retryChoice){job.phase="等待目标选择";render();conflictDialog(job);}else startTransfer(job);},
    "add-route":()=>routeDialog(),"edit-route":()=>routeDialog(id),
    "route-toggle":()=>{s.routes[id].active=!s.routes[id].active;log("已更新之后的新连接路径。");},
    "remove-route":()=>change("移除跳板路由","需要时可用同一目标重新建路由。",()=>{delete s.routes[id];log("已移除路由。");},"移除路由"),
    "new-forward":()=>forwardDialog(),"edit-forward":()=>forwardDialog(id),
    "forward-toggle":()=>toggleForward(id),
    "forward-sample":()=>{const rule=forward(id);rule.bytes+=6480;rule.count=(rule.count||0)+1;log("已为该规则加入一条模拟流量样本。");},
    "remove-forward":()=>change("删除转发规则","将停止模拟监听并回收配置。",()=>{s.forwards=s.forwards.filter((rule)=>rule.id!==id);log("规则已删除。");},"删除规则"),
    "break-forwards":()=>{s.forwards.filter((rule)=>rule.phase==="监听中").forEach((rule)=>{rule.phase=rule.resume?"待恢复":"已停止";rule.error="模拟连接中断。";});log("已模拟运行中的转发断线。");},
    "monitor-config":()=>configureMonitor(),
    "monitor-toggle":()=>{
      if(s.monitor.phase==="采样中"){s.monitor.phase="已暂停";log("已暂停监控。");}
      else if(s.fault==="monitor"){s.fault="";s.monitor.phase="采样失败";log("模拟采样失败。");}
      else {s.monitor.phase="采样中";s.monitor.tick++;log("已开始采样。");}
    },
    sample:()=>{s.monitor.tick++;render();say("已更新模拟资源样本。");},
    "add-key":()=>show("新增演示密钥",field("名称","name","验收节点用演示密钥","required maxlength=60"),(data)=>{
      const name=String(data.get("name")).trim();
      if(!name||s.keys.includes(name)){dialog.querySelector('[name="name"]').focus();return false;}
      s.keys.push(name);dialog.close();log("已建立演示密钥记录。");
    },"保存演示密钥"),
    "remove-key":()=>change("移除演示密钥",id,()=>{s.keys=s.keys.filter((name)=>name!==id);log("密钥记录已移除。");},"移除密钥"),
    "pick-command":()=>{s.command=id;s.page="work";render();say("可在活动分栏生成预设输出。");},
    "local-start":()=>show("本地终端演示",select("显示的 Shell 类型","type",[["PowerShell","PowerShell"],["WSL","WSL"],["系统 Shell","系统 Shell"]],"PowerShell"),(data)=>{
      s.localShell=data.get("type");dialog.close();log("本地终端演示已打开。");
    },"打开演示"),
    "local-end":()=>{s.localShell="";render();},
    "setting-page":()=>{s.settingPage=id;render();},
    "ssh-tools":()=>show("统一工具目录 · SSH",'<p><code>ssh.hosts.list</code> · 读取主机摘要</p><p><code>ssh.connect</code> · 建立可查询的连接</p><p><code>ssh.sftp.list</code> · 查询已授权的文件会话</p><p>在 Huhu 能力网关统一管理工具开放。</p>'),
    reset:()=>{timers.forEach(clearTimeout);timers.clear();s=initial();render();say("已恢复演示初始数据。");}
  };
  actions[act]?.();
  keepFocus(control,document.querySelector("#main"));
});
document.addEventListener("input",(event)=>{
  if(event.target.id!=="host-search")return;
  const cursor=event.target.selectionStart;
  s.search=event.target.value;render();
  const next=document.querySelector("#host-search");next.focus();next.setSelectionRange(cursor,cursor);
});
document.addEventListener("change",(event)=>{
  const c=event.target, key=c.dataset.setting;
  if(key==="preset")s.run.preset=c.value;
  else if(key)s[key]=c.value;
  else if(c.dataset.pick)c.checked?s.picked.add(c.dataset.pick):s.picked.delete(c.dataset.pick);
  else return;
  render();
  const attr=key?"setting":"pick";
  let replacement=document.querySelector("[data-"+attr+'="'+(key||c.dataset.pick)+'"]');
  if(key==="command")replacement=document.querySelector(".active-console [data-setting=command]");
  replacement?.focus();
});
document.addEventListener("submit",(event)=>{
  if(event.target.id!=="ssh-settings")return;
  event.preventDefault();
  Object.assign(s.settings,Object.fromEntries(new FormData(event.target)));
  log("SSH 设置已保存。");
});
render();

