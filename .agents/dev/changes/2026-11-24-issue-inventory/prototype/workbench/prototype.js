const sideLinks = (label, entries) => `<h2>${label}</h2><nav aria-label="${label}">${entries.map(([key,name,asset]) =>
  button(name,{name:asset,className:"quiet nav-link",attrs:`data-route="${key}" ${app.route===key?'aria-current="page"':""}`})).join("")}</nav>`;
const settingsNav = () => sideLinks("设置", [
  ["appearance","外观","Sun"],["sync","版本与同步","GitBranch"],["gateway","MCP 服务","Link"],["tools","工具授权","Wrench"],
]);

startShell({
  defaultRoute:"notes",
  navigation:["home","notes","tasks","inbox","mail","agent","safe","appearance"],
  pages:{
    home:{ label:"首页",icon:"House",show:showDashboard,sidebar:()=>sideLinks("首页",[["home","看板","LayoutGrid"]])+`<p class="sidebar-link">${planLink("","自动化中心")}</p>` },
    notes:{ label:"知识库",icon:"NotebookPen",show:showNotes,sidebar:()=>'<h2>知识库</h2><p class="sidebar-title">日记</p><div id="calendar-slot"></div><div id="note-files"></div>' },
    tasks:{ label:"任务",icon:"ListTodo",show:showTasks,sidebar:()=>sideLinks("任务",[["tasks","任务列表","ListTodo"],["inbox","收件箱","Inbox"]]) },
    inbox:{ label:"收件箱",icon:"Inbox",show:showInbox,sidebar:()=>sideLinks("收件箱",[["inbox","捕获与待处理","Inbox"],["tasks","打开任务","ListTodo"]]) },
    mail:{ label:"邮件",icon:"Mail",show:showMail,sidebar:()=>sideLinks("邮件",[["mail","全部会话","Mail"]])+`<p class="sidebar-link">${planLink("plan-mail","周期同步计划")}</p>` },
    agent:{ label:"Agent",icon:"SquareTerminal",show:showAgent,sidebar:agentTree },
    safe:{ label:"保险箱",icon:"Shield",show:showSafe,sidebar:()=>sideLinks("保险箱",[["safe","账户条目","Shield"]]) },
    appearance:{ label:"设置",icon:"Settings",show:showAppearance,sidebar:settingsNav },
    sync:{ label:"版本与同步",icon:"GitBranch",show:showSync,sidebar:settingsNav },
    gateway:{ label:"MCP 服务",icon:"Link",show:showGateway,sidebar:settingsNav },
    tools:{ label:"工具授权",icon:"Wrench",show:showTools,sidebar:settingsNav },
  },
  onLeave:(proceed)=>{
    if (app.route==="notes") return guardNote(proceed);
    if (app.route==="safe") safe.revealed=null;
    if (app.route==="agent") agentUI.observer?.disconnect();
    if (app.route==="home"&&dashboard.draft) {
      confirmation("放弃未保存的布局","离开会恢复到上次保存的布局。","放弃并离开",()=>{dashboard.draft=null;proceed();});
      return true;
    }
    return false;
  },
  demo:()=>[
    demo("note-save","下一次笔记保存",'<option value="ok">正常</option><option value="error">写入失败</option><option value="unknown">回执丢失</option><option value="conflict">远端修订冲突</option>'),
    demo("task-plan","下一次提醒登记",'<option value="ok">正常</option><option value="error">任务已保存，提醒受阻</option>'),
    demo("capture-save","下一次捕获转换",'<option value="ok">正常</option><option value="unknown">收到结果前断线</option>'),
    demo("gateway-listen","MCP 端口",'<option value="ok">可用</option><option value="error">端口已占用</option>'),
    demo("tool-mode","工具授权状态",'<option value="ready">正常</option><option value="empty">空列表</option><option value="readonly">只读连接</option><option value="disabled">SSH 模块未启用</option>'),
    demo("grid-save","下一次布局保存",'<option value="ok">正常</option><option value="error">修订冲突</option>'),
    demo("widget-mail","邮件卡片来源",'<option value="ok">可用</option><option value="blocked">插件未启用</option>'),
    button("模拟没有邮件账户",{attrs:"id=demo-no-mail",className:"small"}),
  ].join(""),
});

by("#demo-fields").onchange=(event)=>{
  const {demo:which}=event.target.dataset;
  const value=event.target.value;
  if(which==="note-save") notes.saveNext=value;
  if(which==="task-plan") tasks.failPlan=value==="error";
  if(which==="capture-save") captures.failNext=value==="unknown";
  if(which==="gateway-listen") gateway.listenFault=value==="error";
  if(which==="grid-save") dashboard.saveFault=value==="error";
  if(which==="tool-mode") { gateway.toolsMode=value; if(app.route==="tools") showTools(); }
  if(which==="widget-mail") { dashboard.sourceBlocked=value==="blocked"; if(app.route==="home") showDashboard(); }
};

bind("demo-no-mail",()=>{
  mail.accounts=[];
  mail.account=null;
  mail.selected=null;
  mail.step=0;
  by(".demo-controls").open=false;
  openPage("mail");
});
