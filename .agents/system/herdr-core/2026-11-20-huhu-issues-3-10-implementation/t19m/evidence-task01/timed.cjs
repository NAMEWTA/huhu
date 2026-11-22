const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } = require("node:fs");
const { createServer } = require("node:http");
const { createRequire } = require("node:module");
const { tmpdir } = require("node:os");
const path = require("node:path");
const workspaceRequire = createRequire(path.resolve("package.json"));
const { _electron: electron, expect } = workspaceRequire("@playwright/test");

const [exeArg, buildArg, codexArg] = process.argv.slice(2);
assert.ok(exeArg && buildArg && codexArg);
const executablePath = realpathSync(exeArg);
const codexBin = realpathSync(codexArg);
assert.equal(createHash("sha256").update(readFileSync(codexBin)).digest("hex"), "cefea4ffee1fff04983a99c0dda99944d8b380e891e740a28b32f4b815a6e0b7");
const metadata = JSON.parse(readFileSync(buildArg, "utf8"));
const fixture = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-packed-codex-")));
const vault = path.join(fixture, "vault");
const home = path.join(fixture, "provider-home");
mkdirSync(vault);
mkdirSync(home);

const mode = process.argv[5] || "default";
const evidence = path.join(__dirname, mode + "-" + Date.now());
mkdirSync(evidence);
const log = (event, data) => { const line=JSON.stringify({at:new Date().toISOString(),event,data}); require("fs").appendFileSync(path.join(evidence,"events.jsonl"),line+"\n"); console.log(line); };
log("start",{fixture,evidence,mode,exe:executablePath,codex:codexBin});
const marker = "huhu-packed-synthetic-native-result";
let requests = 0;
let matchedInputs = 0;
let attemptsOutsideFixture = 0;
const model = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/responses") return res.writeHead(404).end();
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  requests++;
  const reqData=JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (JSON.stringify(reqData.input).includes(marker)) matchedInputs++;
  const functionOutputs=reqData.input.filter(x=>x.type==="function_call_output").map(x=>({call_id:x.call_id,output:x.output}));
  const tools=reqData.tools.map(t=>({type:t.type,name:t.name,tools:t.tools?.map(i=>i.name)}));
  const known=reqData.tools.flatMap(t=>[t,...(t.tools||[])]).find(t=>t.name==="request_user_input");
  const asyncTool=reqData.tools.flatMap(t=>[t,...(t.tools||[])]).find(t=>t.name==="request_user_input_async");
  log("responses-request",{requests,tools,functionOutputs,matchedInputs,questionSchema:known||asyncTool});
  const tool=known||asyncTool;
  const ask={questions:[{id:"direction",header:"Route",question:"Which local route?",options:[{label:"Blue",description:"First synthetic route"},{label:"Green",description:"Second synthetic route"}]}]};
  const output = requests===1 && tool ? {id:"fc_t19m",call_id:"call_t19m",type:"function_call",name:tool.name,arguments:JSON.stringify(ask),status:"completed"} : {
    id: "msg_huhu_packaged_fixture",
    type: "message",
    role: "assistant",
    phase: "final_answer",
    status: "completed",
    content: [{ type: "output_text", text: marker, annotations: [] }],
  };
  const response = { id: "resp_huhu_packaged_fixture", object: "response", status: "completed", output: [output], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
  res.writeHead(200, { "content-type": "text/event-stream" });
  const send = (type, fields) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`);
  send("response.created", { response: { ...response, status: "in_progress", output: [] } });
  send("response.output_item.added", { output_index: 0, item: { ...output, status: "in_progress", content: [] } });
  send("response.output_item.done", { output_index: 0, item: output });
  send("response.completed", { response });
  res.end();
});
const proxy = createServer((_req, res) => {
  attemptsOutsideFixture++;
  res.writeHead(403).end();
});
proxy.on("connect", (_req, socket) => {
  attemptsOutsideFixture++;
  socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
});
const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const close = (server) => new Promise((resolve) => {
  server.closeAllConnections();
  server.close(resolve);
});

function coreCli(...args) {
  const state = path.join(vault, ".huhu");
  if (!existsSync(path.join(state, "vault.json")) || !existsSync(path.join(state, "runtime"))) return;
  const members = readdirSync(path.join(state, "runtime"), { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(path.join(state, "runtime", entry.name, "herdr")));
  if (!members.length) return;
  assert.equal(members.length, 1);
  const machineId = members[0].name;
  const { id } = JSON.parse(readFileSync(path.join(state, "vault.json"), "utf8"));
  const endpoint = `\\\\.\\pipe\\huhu-${id.replace(/^vault-/, "").slice(0, 8)}-${machineId.slice(0, 4)}`;
  const runtime = path.join(state, "runtime", machineId, "herdr");
  const env = { ...process.env, HC_SESSION: "huhu", HC_SOCKET: endpoint, XDG_STATE_HOME: path.join(runtime, "state"), XDG_CONFIG_HOME: path.join(runtime, "config") };
  for (const key of ["HC_TERMINAL_ID", "HC_TERMINAL_SOCKET", "HC_SCOPE"]) delete env[key];
  const binary = path.join(path.dirname(executablePath), "resources", "herdr", "win32-x64", "herdr-core.exe");
  return spawnSync(binary, args, { env, windowsHide: true, encoding: "utf8", timeout: 15000 });
}

async function main() {
  let app;
  let page;
  const call = (capability, input = {}) => page.evaluate(async ({ capability, input }) => {
    const endpoint = await window.huhuHost.engine();
    const result = await fetch(endpoint.baseUrl + "/api/v1/call", {
      method: "POST",
      headers: { authorization: "Bearer " + endpoint.token, "content-type": "application/json" },
      body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
    }).then((reply) => reply.json());
    if (!result.ok) throw new Error(capability + ": " + result.error.code);
    return result.data;
  }, { capability, input });
  try {
    await Promise.all([listen(model), listen(proxy)]);
    writeFileSync(path.join(home, "config.toml"), [
      'model = "gpt-5.2-codex"',
      'model_provider = "fixture"',
      '[model_providers.fixture]',
      'name = "Local synthetic Windows candidate"',
      `base_url = "http://127.0.0.1:${model.address().port}/v1"`,
      'wire_api = "responses"',
      'requires_openai_auth = false',
      'request_max_retries = 0',
      'stream_max_retries = 0',
      '[analytics]', 'enabled = false', '[feedback]', 'enabled = false',
      ...(mode==="default"?[]:['[features]', 'default_mode_request_user_input = true']),
    ].join("\n") + "\n");
    const blocked = `http://127.0.0.1:${proxy.address().port}`;
    const env = { ...process.env, HUHU_VAULT: vault, HUHU_CODEX_DISPATCH_BIN: codexBin, HUHU_CODEX_DISPATCH_HOME: home, HTTP_PROXY: blocked, HTTPS_PROXY: blocked, ALL_PROXY: blocked, NO_PROXY: "localhost,127.0.0.1,::1" };
    for (const key of ["HUHU_HERDR_BIN", "HUHU_CODEX_DISPATCH_HELPER", "HUHU_NODE_BIN", "HC_SESSION", "HC_SOCKET", "HC_TERMINAL_ID", "HC_TERMINAL_SOCKET", "HC_SCOPE"]) delete env[key];
    for (const key of Object.keys(env)) if (/TOKEN|PASSWORD|API_KEY|SECRET|CREDENTIAL|AUTHORIZATION/i.test(key)) delete env[key];
    delete env.CODEX_HOME;
    app = await electron.launch({ executablePath, args: ["--no-sandbox", `--user-data-dir=${path.join(fixture, "desktop")}`], env });
    page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 35000 });
    const info = await page.evaluate(() => window.huhuHost.appInfo());
    assert.equal(info.commit, metadata.commit.slice(0, 12));
    await call("plugins.setEnabled", { id: "automations", enabled: true });
    const [space] = await call("agent.spaces.list");
    await call("gateway.mcp.update",{enabled:true,transport:"http"});
    for(const capability of ["tasks.agent.create","tasks.dispatch","tasks.questions.list","tasks.reply","tasks.reply.read","tasks.read","tasks.runs"]) await call("gateway.update",{capability,exposed:true});
    assert.equal(info.commit,"40822efd63d8");
    const coreStatus=await call("agent.core.status");
    log("versions",{info,core:coreStatus.version});
    const runtime=path.join(vault,".huhu","runtime");
    const nodeDir=readdirSync(runtime).find(d=>existsSync(path.join(runtime,d,"engine.json")));
    const descriptor=JSON.parse(readFileSync(path.join(runtime,nodeDir,"engine.json"),"utf8"));
    async function mcp(cap,args) {
      const resp=await fetch("http://127.0.0.1:"+descriptor.port+"/mcp",{method:"POST",headers:{authorization:"Bearer "+descriptor.mcpToken,"content-type":"application/json",accept:"application/json, text/event-stream"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:cap.replaceAll(".","_"),arguments:args}})});
      const wire=await resp.json();
      if(!wire.result) throw Error("MCP "+JSON.stringify(wire.error));
      return {ok:!wire.result.isError,data:JSON.parse(wire.result.content[0].text)};
    }
    function cli(cap,args) {
      const argFile=path.join(fixture,"input.json");
      writeFileSync(argFile,JSON.stringify(args));
      const cmd=path.join(path.dirname(executablePath),"resources","bin","huhu.cmd");
      const r=spawnSync(process.env.ComSpec,["/d","/s","/c",`""${cmd}" call ${cap} --input-file "${argFile}" --vault "${vault}" --json"`],{windowsVerbatimArguments:true,windowsHide:true,encoding:"utf8",timeout:15000,env});
      if(!r.stdout.trim()) throw Error("CLI "+cap+" failed "+r.status+" "+r.stderr);
      return JSON.parse(r.stdout.replace(/^\uFEFF/,""));
    }
    function readCli(cap,args) { const r=cli(cap,args);assert.ok(r.ok,JSON.stringify(r.error));return r.data; }
    const create=async(title,more={})=>{
      const r=await mcp("tasks.agent.create",{title,body:"Use the available human question tool exactly once to select Blue or Green. Return "+marker+" after the reply. No other tools. "+("中文派遣验证。".repeat(140)),execution:{spaceId:space.id,provider:"codex",model:"gpt-5.2-codex"},tags:["t19m"],...more});
      assert.ok(r.ok,JSON.stringify(r.data));return r.data;
    };
    const intent=t=>({taskId:t.id,dispatchId:require("crypto").randomUUID(),inputHash:t.inputHash,inputRevision:t.inputRevision,expectedVersion:t.version});
    const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
    const future=await create("T7.2 future",{availableAt:tomorrow.toISOString()});
    const reject=await mcp("tasks.dispatch",intent(future));
    const futureRuns=readCli("tasks.runs",{id:future.id});
    log("future",{task:future.id,availableAt:future.availableAt,reject,futureRuns});
    assert.equal(reject.data.details?.reason,"not_due");assert.deepEqual(futureRuns,[]);assert.equal(requests,0);
    const repeatCheck=async()=>readCli("tasks.runs",{id:future.id});
    const scan=await call("automations.create",{title:"T7.2 timed scan",trigger:{preset:"custom",cron:"*/5 * * * * *",zone:"Asia/Taipei"},action:{kind:"agent",input:{source:"tasks",tags:["t19m"],includeUnscheduled:true,includeOverdue:true,maxConcurrent:1}}});
    assert.equal(scan.data.enabled,false);
    const task=await create("T7.2 timed",{availableAt:new Date(Date.now()+22000).toISOString()});
    const acts=async()=>(await call("automations.activations")).filter(x=>x.ruleId===scan.id);
    await new Promise(resolve=>setTimeout(resolve,6200));
    const paused=await acts();log("rule-paused",{rule:scan.id,rows:paused,runs:readCli("tasks.runs",{id:task.id}),requests});
    assert.equal(paused.length,0);assert.equal(requests,0);
    await call("automations.setEnabled",{id:scan.id,enabled:true});
    await expect.poll(async()=>(await acts()).filter(x=>x.finishedAt).length,{timeout:14000}).toBeGreaterThan(0);
    const early=await acts();
    log("pre-due-scan",{early,task:task.id,availableAt:task.availableAt,runs:readCli("tasks.runs",{id:task.id}),requests});
    assert.ok(early.some(x=>x.finishedAt&&x.finishedAt<task.availableAt&&x.summary.processed===0));assert.equal(requests,0);
    const takeOcc=()=>readdirSync(path.join(vault,".huhu","automations","task-scan-occurrences")).filter(f=>f.endsWith(".json")).map(f=>JSON.parse(readFileSync(path.join(vault,".huhu","automations","task-scan-occurrences",f),"utf8"))).filter(o=>o.ruleId===scan.id);
    try{await expect.poll(()=>requests,{timeout:45000}).toBeGreaterThan(0);}finally{log("scan-hist",{activations:await acts(),occurrences:takeOcc().map(o=>({id:o.id,items:o.items.map(i=>({taskId:i.taskId,state:i.state,reason:i.reason,dispatchId:i.dispatchId,runId:i.runId}))}))});}
    await expect.poll(()=>requests,{timeout:65000}).toBeGreaterThan(0);
    let question, reply, again;
    for(let i=0;i<60;i++) {
      [question]=readCli("tasks.questions.list",{taskId:task.id});
      if(question || readCli("tasks.read",{id:task.id}).comments.some(x=>x.event==="result")) break;
      await new Promise(r=>setTimeout(r,300));
    }
    if(question) {
      log("question",question);
      const {runId,sessionId,requestId,requestVersion}=question;
      const args={taskId:task.id,runId,sessionId,requestId,requestVersion,replyId:"t19m-answer",answer:"Blue"};
      reply=cli("tasks.reply",args); again=cli("tasks.reply",args);
      log("cli-reply",{reply,again});assert.ok(reply.ok&&again.ok);
    } else log("no-task-question",{requests});
    const timeline=()=>readCli("tasks.read",{id:task.id}).comments.filter(x=>x.event==="result");
    await expect.poll(timeline,{timeout:20000}).toMatchObject([{body:marker}]);
    const [result]=timeline();const [run]=await call("tasks.dispatch.list",{taskId:task.id});
    assert.equal(result.run,run.runId);
    const runs=readCli("tasks.runs",{id:task.id});
    const comments=readCli("tasks.read",{id:task.id}).comments;
    log("external-result",{run,runs,comments});
    const sessions=await call("agent.sessions.list",{spaceId:space.id});
    assert.equal(sessions.filter(s=>s.id===result.session).length,1);
    await page.getByRole("button",{name:"任务",exact:true}).first().click();
    await page.getByRole("button",{name:"打开任务 "+task.title}).click();
    const row=page.getByTestId("task-detail").locator(`[data-run-id="${run.runId}"]`);
    await row.getByRole("button",{name:"展开结果"}).click();
    await expect(row.getByTestId("managed-run-result")).toContainText(marker);
    await page.screenshot({path:path.join(evidence,"result.png")});
    const routes=[];page.on("websocket",ws=>{const u=new URL(ws.url());if(u.pathname.startsWith("/ws/terminal/"))routes.push(u.pathname);});
    await row.getByRole("button",{name:"定位原会话"}).click();
    const selected=page.getByTestId("agent-cli-module").getByRole("tab",{selected:true});
    const session=sessions.find(s=>s.id===result.session);
    await expect(selected).toContainText(session.name);
    await expect(page.getByTestId("workspace-session-preview")).toBeVisible();
    await expect.poll(()=>routes).toContain("/ws/terminal/"+session.id);
    const core=await call("agent.core.status");assert.equal(core.version,"0.1.19");
    log("runtime",{core:core.version,session:session.id,space:session.spaceId,terminalRoutes:routes});
    log("located",{session:session.id,space:space.id,selected:await selected.innerText()});
    await page.screenshot({path:path.join(evidence,"located.png")});
    await page.getByRole("button",{name:"任务",exact:true}).first().click();
    const status=page.locator(`[data-task-id="${task.id}"]`).getByTestId("task-status");
    const before=readCli("tasks.read",{id:task.id}).status;
    assert.notEqual(before,"completed");await status.selectOption("completed");
    await expect.poll(()=>readCli("tasks.read",{id:task.id}).status).toBe("completed");
    const histories=takeOcc().sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
    const chosen=histories.flatMap(o=>o.items.filter(i=>i.taskId===task.id&&i.state==="accepted").map(i=>({occurrence:o.id, ...i})));
    assert.equal(chosen.length,1);assert.equal(chosen[0].runId,run.runId);
    log("repeat-scan",{chosen,occurrences:histories.map(h=>({id:h.id,scheduledFor:h.scheduledForUTC,items:h.items.map(i=>({task:i.taskId,state:i.state,reason:i.reason}))})),futureRuns:await repeatCheck()});
    const findData=(dir,test)=>readdirSync(dir,{recursive:true}).filter(test).map(f=>JSON.parse(readFileSync(path.join(dir,f),"utf8")));
    const reports=findData(path.join(fixture,"desktop"),f=>/^report-codex-[a-f0-9]{64}\.json$/.test(path.basename(f))).map(x=>x.data).filter(x=>x.receipt.execution.runId===run.runId);
    const inboxDir=path.join(vault,".huhu","tasks","receipts");
    const deliveries=findData(inboxDir,f=>f.endsWith(".json")).filter(x=>x.receipt.execution.runId===run.runId);
    assert.equal(reports.length,1);assert.equal(deliveries.length,1);
    const [native]=reports,[taskDelivery]=deliveries;
    assert.equal(native.receipt.receiptId,taskDelivery.receipt.receiptId);
    assert.equal(taskDelivery.status,"delivered");assert.equal(taskDelivery.consumption.delivery.messageId,result.id);
    assert.equal(native.receipt.execution.sessionBinding.nativeSessionId,native.source.threadId);
    log("bound-result",{native:native.source,receiptId:native.receipt.receiptId,deliveryId:taskDelivery.consumption.delivery.deliveryId,messageId:result.id,status:taskDelivery.status,taskId:task.id,dispatchId:run.dispatchId,runId:run.runId,attempt:run.attempt,space:space.id,session:session.id});
    await call("automations.setEnabled",{id:scan.id,enabled:false});
    log("human-close",{task:task.id,before,after:"completed",results:timeline().length,requests,matchedInputs,blockedProxy:attemptsOutsideFixture});
  } finally {
    try {
      await app?.close();
      if (coreCli("server", "status")?.status === 0) assert.equal(coreCli("server", "stop").status, 0);
      const stopped = coreCli("server", "status");
      if (stopped) { log("core-stopped",{status:stopped.status});assert.equal(stopped.status, 5); }
    } finally {
      await Promise.all([close(model), close(proxy)]);
      if (path.dirname(fixture) === realpathSync(tmpdir()) && path.basename(fixture).startsWith("huhu-packed-codex-")) rmSync(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
