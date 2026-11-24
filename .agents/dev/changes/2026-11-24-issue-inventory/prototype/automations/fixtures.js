const sampleNow = "2026-11-24T02:00:00Z";
const zones = ["Asia/Taipei","America/New_York","UTC"];
const sources = {
  automations:"自动化", followUps:"跟进", tasks:"任务", agent:"Agent",
  mail:"邮件", versioning:"版本与同步", ssh:"SSH", home:"首页", ledger:"账本",
};
const actionTypes = {
  "agent.scan":"扫描任务", "agent.prompt":"派遣固定需求", "reminders.notify":"发送提醒",
  "tasks.dispatch":"派遣原任务", "tasks.observe":"观察任务状态", "agent.observe":"推送 Agent 状态",
  "mail.sync":"同步邮件", "versioning.sync":"同步 Git", "ssh.monitor":"取样 SSH 监控",
  "home.focus":"结算专注", "ledger.record":"记录固定收支", "terminal.run":"运行终端",
};
const stateText = {
  scheduled:"已安排", blocked:"受阻", cancelled:"已取消", accepted:"已受理", running:"执行中",
  completed:"已完成", failed:"失败", unknown:"结果未知", paused:"已暂停", enabled:"已启用",
  deleted:"已删除", "waiting-input":"等待答复", stopped:"已停止", "not-accepted":"未受理",
};
const blocking = {
  "plugin-disabled":"来源插件未启用", "read-only":"只读连接", "foreign-owner":"其他设备所有",
  "credentials-unavailable":"凭据不可用", "connection-unavailable":"连接不可用",
  "domain-conflict":"来源变更冲突", "target-unavailable":"目标不可用",
};
const intentTone = { enabled:"ok",paused:"",unknown:"warn","waiting-input":"warn",failed:"err",blocked:"warn",running:"info",completed:"ok" };
const scopeNames = { vault:"Vault · 北岸研究室", device:"设备 · 研究室工作站", connection:"连接 · SSH 档案节点" };
const times = {
  tuesday:"2026-11-24T03:00:00Z",
  wednesday:"2026-11-25T01:00:00Z",
  thursday:"2026-11-26T01:00:00Z",
  completed:"2026-11-24T01:58:00Z",
};
const daily = {kind:"cron",expression:"0 9 * * *",zone:"Asia/Taipei"};
const interval = (every, unit = "minutes") => ({kind:"interval",every,unit});
const once = (scheduledFor = times.wednesday) => ({kind:"once",scheduledFor});
const observation = (query,id) => ({kind:"observe",query,object:{kind:"source",id},everySeconds:30});
const makePlan = (planId,title,plugin,id,capability,target,trigger,options = {}) => ({
  planId,revision:"r1",title,
  source:{plugin,object:{kind:options.sourceKind ?? "source",id}},
  owner:options.owner === "device" ? {scope:"device",vaultId:"vault-demo",machineId:options.machine??"demo-workstation"} :
    options.owner === "connection" ? {scope:"connection",vaultId:"vault-demo",machineId:"demo-workstation",connectionId:"ssh-archive"} : {scope:"vault",vaultId:"vault-demo"},
  action:{capability,object:{kind:options.targetKind ?? "source",id:target},summary:options.summary ?? target},
  intent:options.paused ? "paused" : "enabled",trigger,
  availability:options.blocked ? {state:"blocked",reason:options.blocked,detail:options.detail} : {state:"ready"},
  createdAt:sampleNow,updatedAt:sampleNow,
  nextAt:options.paused || options.blocked || options.done ? null : options.nextAt ?? times.tuesday,
  lastOccurrence:options.lastOccurrence ?? null,
  actions:options.blocked==="foreign-owner"?[]:["reschedule","pause","resume","delete",...(options.blocked ? [] : ["run-now"])],
});

const fixtures = [
  makePlan("plan-scan","扫描待派遣任务","automations","daily-queue","agent.scan","口述史 / Codex",interval(15),{summary:"标签为口述史，需要时取最近一次补跑",lastOccurrence:{occurrenceId:"occ-scan",state:"accepted",at:times.completed}}),
  makePlan("plan-task-reminder","校对档案授权书","tasks","task-coast","reminders.notify","原任务 · 校对授权",once(),{sourceKind:"task",targetKind:"task",lastOccurrence:{occurrenceId:"occ-notify",state:"completed",at:times.completed}}),
  makePlan("plan-follow","提醒跟进出版反馈","followUps","follow-press","reminders.notify","宋宁 · 授权反馈",once(times.thursday),{nextAt:times.thursday}),
  makePlan("plan-task-dispatch","定时派遣引文核对","tasks","task-quotes","tasks.dispatch","原任务 · 引文核对",once(times.thursday),{sourceKind:"task",nextAt:times.thursday}),
  makePlan("plan-task-watch","观察交稿任务进展","tasks","task-coast","tasks.observe","原任务 · 校对授权",observation("tasks.activity","task-coast"),{sourceKind:"task"}),
  makePlan("plan-agent","状态变化发送摘要","agent","session-pi","agent.observe","口述史 / Pi 会话",observation("agent.state","session-pi"),{owner:"device",machine:"workstation-archive",blocked:"foreign-owner",detail:"原会话由档案馆工作站所有，请在该工作站管理。"}),
  makePlan("plan-mail","定期同步档案邮件","mail","research-box","mail.sync","北岸研究室邮箱",interval(45),{blocked:"credentials-unavailable",detail:"请在邮件账户设置重新连接。",lastOccurrence:{occurrenceId:"occ-mail",state:"unknown",at:times.completed}}),
  makePlan("plan-git","同步纪要与照片索引","versioning","repo-oral","versioning.sync","oral-history-vault / main",daily,{paused:true}),
  makePlan("plan-ssh","采集档案节点监控","ssh","ssh-archive","ssh.monitor","已启动面板 · archive-node",interval(30,"seconds"),{owner:"connection",blocked:"connection-unavailable",detail:"原 SSH 监控连接尚未就绪。"}),
  makePlan("plan-focus","结算本次专注","home","focus-session","home.focus","首页专注 · 整理录音",once(times.tuesday),{nextAt:times.tuesday}),
  makePlan("plan-ledger","记入存储服务月费","ledger","monthly-storage","ledger.record","北岸口述史账本 / 存储月费", {kind:"cron",expression:"0 9 1 * *",zone:"Asia/Taipei"},{paused:true}),
  makePlan("plan-fixed","整理每周访谈提纲","automations","plan-fixed","agent.prompt","出版校对 / Codex",interval(60),{paused:true,owner:"device"}),
  makePlan("plan-terminal","刷新校对索引","automations","plan-terminal","terminal.run","研究室工作站 / 本地终端",daily,{paused:true,owner:"device"}),
  makePlan("plan-once-done","提醒送交纸质授权原件","automations","plan-once-done","reminders.notify","北岸研究室 / 站内通知",once("2026-11-23T01:15:00Z"),{done:true,lastOccurrence:{occurrenceId:"occ-archive",state:"completed",at:"2026-11-23T01:15:00Z"}}),
];
const planInputs = {
  "plan-scan":{content:"优先找含口述史标签并在本周排期的任务。简短汇报受理与跳过原因。",tags:"口述史,审核",window:"本周",from:"2026-11-23",to:"2026-11-29",overdue:true,noDue:false,parallel:1,space:"口述史",provider:"Codex",model:"gpt-5.4",effort:"medium",grace:30},
  "plan-fixed":{content:"整理一份有简要时间安排的访谈提纲。",space:"出版校对",provider:"Codex",model:"gpt-5.4",effort:"medium"},
  "plan-terminal":{content:"刷新内置预览索引",space:"口述史"},
};
const makeEffect = (effectId,kind,target,state) => ({
  effectId,kind,target:{kind:"source",id:target},operationId:`op-${effectId}`,state,receiptId:state==="unknown"?null:`receipt-${effectId}`,
});
const makeOccurrence = (occurrenceId,planId,state,{ timing,at,frozenRevision="r1",effects=[], execution=null } = {}) => ({
  occurrenceId,plan:{planId,revision:"r1"},timing:timing ?? {trigger:"scheduled",scheduledFor:at ?? times.completed},
  state,acceptedAt:state==="blocked"||state==="cancelled" ? null : at ?? times.completed,
  frozenInput:state==="blocked"||state==="cancelled" ? null : {revision:frozenRevision,digest:`digest-${occurrenceId}`},
  execution,effects,
});
const sampleExecution = {
  vaultId:"vault-demo",taskId:"task-quotes",runId:"run-quotes",attempt:1,dispatchId:"dispatch-quotes",
  sessionBinding:{machineId:"demo-workstation",sessionId:"session-codex-oral",coreId:"core-demo",processGeneration:"generation-1",provider:"codex",nativeSessionId:"native-demo"},
};
const occurrenceFixtures = [
  makeOccurrence("occ-scan","plan-scan","accepted",{execution:sampleExecution,frozenRevision:7}),
  makeOccurrence("occ-notify","plan-task-reminder","completed",{timing:{trigger:"manual"},effects:[makeEffect("notify-1","站内通知","通知 · 已送达","completed"),makeEffect("create-task-1","建任务","目标缺少填报字段","failed")]}),
  makeOccurrence("occ-mail","plan-mail","unknown",{effects:[makeEffect("mail-sync-1","邮件同步","北岸研究室邮箱","unknown")]}),
  makeOccurrence("occ-archive","plan-once-done","completed",{at:"2026-11-23T01:15:00Z",effects:[makeEffect("archive-remind","站内通知","授权原件提醒","completed")]}),
  makeOccurrence("occ-old","plan-scan","failed",{at:"2026-11-21T01:40:00Z"}),
  makeOccurrence("occ-terminal","plan-terminal","running",{timing:{trigger:"manual"},at:"2026-11-24T01:55:00Z"}),
];
const domainRuns = {
  "occ-scan":[
    {runId:sampleExecution.runId,dispatchId:sampleExecution.dispatchId,attemptId:`attempt-${sampleExecution.attempt}`,taskId:sampleExecution.taskId,title:"核对引文出处",status:"waiting-input",sessionId:sampleExecution.sessionBinding.sessionId,canStop:true,question:"按原稿中的匿名处理规则继续？",output:"已核对 17 处引用。\n等候确认第 18 处引文。"},
    {runId:"run-labels",dispatchId:"dispatch-labels",attemptId:"attempt-1",taskId:"task-labels",title:"整理录音标签",status:"running",sessionId:"session-pi",canStop:true,output:"录音标签校对中。"},
    {runId:"run-missing",dispatchId:"dispatch-missing",attemptId:"attempt-1",taskId:"task-withdrawn",title:"此前已撤回的一份校对任务",status:"failed",sessionId:"session-expired",canStop:false,missing:true,output:"历史只保留计划接收的失败摘要。"},
  ],
  "occ-terminal":[{runId:"run-index",dispatchId:"dispatch-index",attemptId:"attempt-1",title:"本机终端 · 更新索引",sessionId:"session-terminal",status:"running",canStop:true,output:"初始化样例索引。\n输出可按需读取。"}],
  "occ-old":[{runId:"run-old",dispatchId:"dispatch-old",attemptId:"attempt-2",taskId:"task-old",title:"历史归档任务",status:"failed",sessionId:"session-old",canStop:false,missing:true,output:"目标已不存在。保留已脱敏的历史记录。"}],
};
const templates = [
  {id:"once",title:"一次性提醒",desc:"在选定时间发送一条站内通知。",source:"automations",action:"reminders.notify",target:"北岸研究室 · 站内通知",trigger:once()},
  {id:"repeat",title:"周期提醒",desc:"定期提醒同一件事。",source:"automations",action:"reminders.notify",target:"北岸研究室 · 站内通知",trigger:daily},
  {id:"queue",title:"扫描待派遣任务",desc:"按标签和排期选出候选任务。",source:"automations",action:"agent.scan",target:"口述史 / Codex",trigger:interval(15),input:planInputs["plan-scan"]},
  {id:"prompt",title:"定时固定需求",desc:"在选定 Space 创建并派遣新任务。",source:"automations",action:"agent.prompt",target:"出版校对 / Codex",trigger:daily},
  {id:"agent",title:"Agent 状态变化提醒",desc:"观察原会话的状态变化。",source:"agent",action:"agent.observe",target:"口述史 / Pi 会话",trigger:observation("agent.state","session-pi")},
  {id:"mail",title:"定期同步邮件",desc:"使用已有账户定期同步。",source:"mail",action:"mail.sync",target:"北岸研究室邮箱",trigger:interval(45)},
  {id:"git",title:"同步 Git 版本",desc:"在现有仓库的既定分支同步。",source:"versioning",action:"versioning.sync",target:"oral-history-vault / main",trigger:daily},
  {id:"ssh",title:"监控已连接的 SSH 节点",desc:"选择已启动的监控面板。",source:"ssh",action:"ssh.monitor",target:"",trigger:interval(30,"seconds"),block:"没有已启动且具备监控资格的面板。"},
];
