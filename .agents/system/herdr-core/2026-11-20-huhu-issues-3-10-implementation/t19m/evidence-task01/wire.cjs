const assert = require("node:assert/strict");
const { spawnSync,spawn } = require("node:child_process");
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

async function main(){
  let app;
  try {
    await Promise.all([listen(model),listen(proxy)]);
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
      ...(mode==="default"||mode.startsWith("plan")?[]:['[features]', 'default_mode_request_user_input = true']),
    ].join("\n") + "\n");

    const nativeEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>["SYSTEMROOT","WINDIR","COMSPEC","PATH","PATHEXT","TEMP","TMP","USERNAME","SYSTEMDRIVE","PROGRAMDATA"].includes(key.toUpperCase())));
    const blocked="http://127.0.0.1:"+proxy.address().port;
    Object.assign(nativeEnv,{CODEX_HOME:home,USERPROFILE:fixture,HTTP_PROXY:blocked,HTTPS_PROXY:blocked,ALL_PROXY:blocked,NO_PROXY:"localhost,127.0.0.1,::1"});
    app=spawn(codexBin,["--config","mcp_servers={}","--config",'web_search="disabled"',"--disable","shell_tool","app-server","--listen","stdio://"],{cwd:vault,env:nativeEnv,stdio:["pipe","pipe","pipe"],windowsHide:true});
    app.stderr.resume();
    const send=m=>app.stdin.write(JSON.stringify(m)+"\n");
    const reader=require(path.join(path.dirname(executablePath),"resources","codex-dispatch","helper.cjs")).createNativeAnswerOutputReader();
    let threadId,turnId;
    const done=new Promise((resolve,reject)=>{
      let asked=false;
      const timer=setTimeout(()=>reject(Error("native timeout")),35000);
      app.on("error",reject);app.on("exit",()=>{clearTimeout(timer);if(!asked)reject(Error("early exit"));});
      require("readline").createInterface({input:app.stdout}).on("line",line=>{
        const m=JSON.parse(line);
        if(m.method==="thread/started")threadId=m.params.thread.id;
        if(m.method==="turn/started")turnId=m.params.turn.id;
        if(m.method==="item/completed"||m.method==="rawResponseItem/completed"){
          const evidence=reader(m.method,m.params,threadId,turnId);
          log("output-reader",{method:m.method,itemType:m.params.item?.type,evidence});
        }
        if(m.id===1&&!m.method){send({method:"initialized",params:{}});send({id:2,method:"thread/start",params:{cwd:vault,ephemeral:true,...(mode==="plan-raw"?{experimentalRawEvents:true}:{}),sandbox:"read-only",approvalPolicy:"never",model:"gpt-5.2-codex"}});}
        if(m.id===2&&!m.method){log("thread",{thread:m.result.thread.id});send({id:3,method:"turn/start",params:{threadId:m.result.thread.id,...(mode.startsWith("plan")?{collaborationMode:{mode:"plan",settings:{model:"gpt-5.2-codex",reasoning_effort:null,developer_instructions:null}}}:{}),input:[{type:"text",text:"Select a local route. "+marker}]}});}
        if(m.method==="item/tool/requestUserInput"){
          asked=true;log("native-rpc",m);
          send({id:m.id,result:{answers:{direction:{answers:["Blue"]}}}});
        }
        if(m.method==="serverRequest/resolved"||m.method==="turn/completed"||m.method==="rawResponseItem/completed"&&m.params.item.type==="function_call_output")log("native-event",{method:m.method,params:m.params});
        if(m.method==="turn/completed"){clearTimeout(timer);resolve();}
      });
    });
    send({id:1,method:"initialize",params:{clientInfo:{name:"huhu",version:"1"},capabilities:{experimentalApi:true}}});
    await done;
  }finally{if(app&&!app.killed){const exited=new Promise(resolve=>app.once("close",resolve));app.kill();await exited;}await Promise.all([close(model),close(proxy)]);if(path.dirname(fixture)===realpathSync(tmpdir())&&path.basename(fixture).startsWith("huhu-packed-codex-"))rmSync(fixture,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
