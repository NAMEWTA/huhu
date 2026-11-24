// Run from the Huhu integration checkout. Every Core address used belongs to this invocation.
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const root = process.cwd();
require(path.join(root, "node_modules/.pnpm/tsx@4.23.15/node_modules/tsx/dist/cjs/index.cjs"));
const { HerdrCore } = require(path.join(root, "plugins/agent-cli/src/engine/herdr-core.ts"));
const { attachTerminal } = require(path.join(root, "packages/herdr-client/src/index.ts"));
const bin = path.join(root, "apps/desktop/resources/herdr/win32-x64/herdr-core.exe");
const fixture = process.argv[2];
assert(fixture && path.isAbsolute(fixture), "Pass the built fixture path from replay.ps1");
const sha = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
assert.equal(sha(bin), "8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d");
const tempRoot = fs.realpathSync(os.tmpdir());
const tmp = fs.mkdtempSync(path.join(tempRoot, "huhu-t192-inner-"));
const core = new HerdrCore({ bin, vaultId: crypto.randomUUID(), machineId: "t192", runtimeDir: tmp });
const allowed = new Set(["systemroot","windir","comspec","path","pathext","temp","tmp","systemdrive"]);
for (const name of Object.keys(process.env)) if (!allowed.has(name.toLowerCase())) delete process.env[name];
Object.assign(process.env,{USERPROFILE:tmp, HOME:tmp, LOCALAPPDATA:tmp, APPDATA:tmp});
const report = {windows:os.release(),arch:os.arch(),node:process.version, coreSHA256:sha(bin),fixtureSHA256:sha(fixture),cases:[]};
const postStopChecks = [];
let stage = "setup";
async function until(fn, label, ms=9000) {
  const end=Date.now()+ms; do { const result=await fn(); if(result) return result; await sleep(40); } while(Date.now()<end);
  throw Error("timeout: "+label);
}
function files() { return fs.readdirSync(tmp,{recursive:true}).map(f=>path.join(tmp,f)).filter(f=>fs.statSync(f).isFile()); }
function privateRow(id) {
  function walk(value) {
    if(!value || typeof value!=="object") return;
    if(value.labels?.["t192.fixture"]===id && Array.isArray(value.argv)) return value;
    for(const entry of Object.values(value)){const found=walk(entry);if(found)return found;}
  }
  for(const f of files().filter(f=>f.endsWith(".json"))) {
    try {const found=walk(JSON.parse(fs.readFileSync(f,"utf8")));if(found)return found;} catch {}
  }
}
async function test(c, scenario) {
  const id=crypto.randomUUID().replaceAll("-","");
  const marker="fixture-t192-"+crypto.randomBytes(16).toString("hex");
  const issuer=cp.spawn(fixture,["issuer",id],{cwd:tmp,windowsHide:true,stdio:["pipe","pipe","pipe"]});
  const closed=new Promise((resolve,reject)=>{issuer.once("error",reject);issuer.once("close",resolve)});
  let brokerOut="",brokerErr="",outer="",stream;
  issuer.stdout.on("data",b=>{brokerOut+=b}); issuer.stderr.on("data",b=>{brokerErr+=b});issuer.stdin.on("error",()=>{});
  try {
    stage=scenario+":broker";
    const [,pid,birth]=await until(()=>/^BROKER (\d+) (\d+)\r?$/m.exec(brokerOut),"broker");
    assert.equal(+pid,issuer.pid);
    const mode=scenario.startsWith("inner-")?scenario:"normal";
    const argv=[fixture,"host",id,pid,birth,mode];
    stage=scenario+":core run";
    const term=await c.call("terminal.run",{argv,cwd:tmp,labels:{"t192.fixture":id},no_parent:true,keep:false});
    assert.ok(term.pid && term.created_ms && term.state==="live");
    const rows=()=>c.call("terminal.list",{all:true,labels:{"t192.fixture":id}});
    const list=await rows();assert.equal(list.terminals.length,1);assert.equal(list.terminals[0].pid,term.pid);assert.deepEqual(list.terminals[0].argv,argv);
    const stamp=cp.execFileSync(fixture,["stamp",String(term.pid)],{cwd:tmp,windowsHide:true,encoding:"utf8",timeout:3000}).trim();
    assert.match(stamp,/^\d+$/);
    const row=await until(()=>privateRow(id),"private snapshot");
    assert.deepEqual(row.restart_env??{},{});assert.deepEqual(row.argv,argv);
    stream=await attachTerminal(core.endpoint,{terminal:term.address,cols:120,rows:32});
    stream.onData(b=>{outer+=b.toString("latin1")});
    const wireClosed=new Promise(resolve=>stream.onClose(resolve));
    issuer.stdin.end(String(term.pid)+" "+(scenario==="outer-birth"?(BigInt(stamp)+1n).toString():stamp)+" "+marker+"\n");
    const read=async()=>(await c.call("terminal.read",{terminal:term.address,lines:150})).text;
    if(scenario==="ok"){
      stage="ok:interactive";
      await until(()=>outer.includes("INNER_BOUND") && outer.includes("CLI_INPUT>"),"interactive prompt");
      stream.write(Buffer.from("ping\r"));
    }
    stage=scenario+":exit";
    const finished=await until(async()=>(await rows()).terminals.find(t=>t.state==="finished"),"terminal exit",11000);
    await Promise.race([wireClosed,sleep(2000)]);
    const screen=await read();
    const brokerCode=await closed;
    const rendered=screen+"\n"+outer;
    const locked = [];
    let markerInCoreFiles = false;
    let scannedFiles = 0;
    for(const f of files()) {
      try {const data=fs.readFileSync(f);scannedFiles++;if(data.includes(marker)||data.includes(Buffer.from(marker,"utf16le")))markerInCoreFiles=true;}
      catch(e) {if(e.code!=="EBUSY")throw e;locked.push(path.relative(tmp,f));}
    }
    postStopChecks.push({marker,locked});
    const r={scenario,coreExit:finished.exit_code,brokerExit:brokerCode,bindingsCheckedBeforeDelivery:true,
      brokerIssued:brokerOut.includes("ISSUED_ONCE"),brokerDenied:brokerOut.includes("REJECTED_ZERO"),
      outerDenied:rendered.includes("FIXTURE_DENIED"),innerDenied:rendered.includes("INNER_REJECTED_ZERO"),
      innerSawNoValue:rendered.includes("INNER_RECEIVED_ZERO"),ttyAll:rendered.includes("CLI_TTY_READY"),
      promptBeforeInput:scenario==="ok" && outer.includes("CLI_INPUT>"),
      outerSecondOpenDenied:rendered.includes("OUTER_REPLAY_CLOSED"),innerSecondOpenDenied:rendered.includes("INNER_REPLAY_CLOSED"),
      pongOnAttach:outer.includes("CLI_PONG"),redactedOnAttach:outer.includes("[REDACTED]"),
      redactedOnScreen:screen.includes("[REDACTED]"),oneMatch:rendered.includes("MASK_COUNT_ONE"),
      markerInRawAttach:outer.includes(marker),markerInScreen:screen.includes(marker),
      randomHalvesInPublicOutput:[marker.slice(-32,-16),marker.slice(-16)].some(half=>rendered.includes(half)),
      markerInCoreFiles, scannedFiles, lockedFiles:locked,
      markerInArgvOrCoreView:JSON.stringify([argv,row,list,finished]).includes(marker),
      markerInIssuerDiagnostics:(brokerOut+brokerErr).includes(marker),restartEnvKeys:Object.keys(row.restart_env??{})};
    report.cases.push(r);
    const yes=(...keys)=>keys.forEach(k=>assert.equal(r[k],true,k));
    const no=(...keys)=>keys.forEach(k=>assert.equal(r[k],false,k));
    assert.equal(brokerCode,0);assert.equal(finished.exit_code,scenario==="outer-birth"?23:0);
    no("markerInRawAttach","markerInScreen","randomHalvesInPublicOutput","markerInCoreFiles","markerInArgvOrCoreView","markerInIssuerDiagnostics");
    if(scenario==="ok") {yes("brokerIssued","ttyAll","pongOnAttach","redactedOnAttach","redactedOnScreen","oneMatch","outerSecondOpenDenied","innerSecondOpenDenied");no("innerDenied","outerDenied");}
    else if(scenario==="outer-birth") {yes("brokerDenied","outerDenied");no("brokerIssued","ttyAll","oneMatch");}
    else {yes("brokerIssued","innerDenied","innerSawNoValue");no("ttyAll","oneMatch");}
  } finally {stream?.close();if(issuer.exitCode===null)issuer.kill();await closed.catch(()=>{});}
}
async function run(){
  let c;
  try{
    c=await core.ensure();report.core=(await c.call("server.status")).version;assert.equal(report.core,"0.1.19");
    for(const scenario of ["ok","outer-birth","inner-pid","inner-birth"]) await test(c,scenario);
    report.passed=true;
  } finally {
    try {if(c){
      // This endpoint was created using a fresh UUID. Only our own labeled panes are ever modified.
      for(const row of (await c.call("terminal.list",{all:true})).terminals){
        assert.match(row.labels["t192.fixture"],/^[a-f0-9]{32}$/);
        if(row.state==="live") await c.call("terminal.kill",{terminal:row.address});
        await until(async()=>!(await c.call("terminal.list",{all:true})).terminals.some(t=>t.address===row.address&&t.state==="live"),"stop");
        await c.call("terminal.rm",{terminal:row.address});
      }
      report.remainingPanes=(await c.call("terminal.list",{all:true})).terminals.length;
    }} finally{
      await core.stop();report.coreStopped=(await core.peek())==="absent";
      report.lockedFilesAfterStop = postStopChecks.map(({marker,locked})=>locked.map(rel=>{
        const f=path.join(tmp,rel);
        if(!fs.existsSync(f))return {rel,removed:true};
        const b=fs.readFileSync(f);
        return {rel,size:b.length,markerFound:b.includes(marker)||b.includes(Buffer.from(marker,"utf16le"))};
      }));
      const actual=fs.realpathSync(tmp);assert.equal(path.dirname(actual),tempRoot);assert.match(path.basename(actual),/^huhu-t192-inner-[a-zA-Z0-9]{6}$/);
      fs.rmSync(actual,{recursive:true,force:true,maxRetries:5,retryDelay:100});report.tmpRemoved=!fs.existsSync(tmp);
      console.log(JSON.stringify(report,null,2));
      assert.ok(report.lockedFilesAfterStop.flat().every(r=>r.removed||r.markerFound===false));
    }
  }
}
run().catch(e=>{console.error("Probe failed at",stage,(e.code||"")+":",String(e.message).split("\n")[0]);process.exitCode=1});
