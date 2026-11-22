// Run from the Huhu integration checkout. Every Core address used belongs to this invocation.
const assert = require("node:assert/strict");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const root = process.cwd();
const sources=["plugins/agent-cli/src/engine/herdr-core.ts","packages/herdr-client/src/client.ts","packages/herdr-client/src/frames.ts","packages/herdr-client/src/index.ts"];
const atLoad={head:cp.execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8",windowsHide:true}).trim(),
  sourceSHA256:Object.fromEntries(sources.map(file=>[file,crypto.createHash("sha256").update(fs.readFileSync(path.join(root,file))).digest("hex")]))};
require(path.join(root, "node_modules/.pnpm/tsx@4.23.15/node_modules/tsx/dist/cjs/index.cjs"));
const { HerdrCore } = require(path.join(root, "plugins/agent-cli/src/engine/herdr-core.ts"));
const { attachTerminal } = require(path.join(root, "packages/herdr-client/src/index.ts"));
const bin = path.join(root, "apps/desktop/resources/herdr/win32-x64/herdr-core.exe");
const fixture = path.join(__dirname, "fixture.exe");
const sha = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
assert.equal(sha(bin), "8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d");
const tempRoot = fs.realpathSync(__dirname);
const tmp = fs.mkdtempSync(path.join(tempRoot, "huhu-t192-atbirth-"));
const core = new HerdrCore({ bin, vaultId: crypto.randomUUID(), machineId: "t192", runtimeDir: tmp });
const allowed = new Set(["systemroot","windir","comspec","path","pathext","temp","tmp","systemdrive"]);
for (const name of Object.keys(process.env)) if (!allowed.has(name.toLowerCase())) delete process.env[name];
Object.assign(process.env,{USERPROFILE:tmp, HOME:tmp, LOCALAPPDATA:tmp, APPDATA:tmp,HUHU_T192_PARENT_ONLY:"public-fixture"});
const report = {windows:os.release(),arch:os.arch(),node:process.version, coreSHA256:sha(bin),fixtureSHA256:sha(fixture),targetSHA256:sha(path.join(__dirname,'entry.cjs')),cases:[]};
const postStopChecks = [];
report.integrationAtLoad=atLoad;
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
  const random=crypto.randomBytes(16).toString("hex");
  const marker="fixture-t192-"+random+"-雪🧪";
  const cwd=path.join(tmp,"case-"+id);fs.mkdirSync(cwd);
  const issuer=cp.spawn(fixture,["issuer",id],{cwd:tmp,windowsHide:true,stdio:["pipe","pipe","pipe"]});
  const closed=new Promise((resolve,reject)=>{issuer.once("error",reject);issuer.once("close",resolve)});
  let brokerOut="",brokerErr="",outer="",stream;
  const traffic=[]; let piReady=false,piSession=false,resized=false;
  issuer.stdout.on("data",b=>{brokerOut+=b}); issuer.stderr.on("data",b=>{brokerErr+=b});issuer.stdin.on("error",()=>{});
  try {
    stage=scenario+":broker";
    const [,pid,birth]=await until(()=>/^BROKER (\d+) (\d+)\r?$/m.exec(brokerOut),"broker");
    assert.equal(+pid,issuer.pid);
    const mode=scenario==="wrong-peer"?"fixture":scenario;
    const argv=[fixture,"host",id,pid,birth,mode];
    stage=scenario+":core run";
    const term=await c.call("terminal.run",{argv,cwd,labels:{"t192.fixture":id},no_parent:true,keep:false});
    assert.ok(term.pid && term.created_ms && term.state==="live");
    const rows=()=>c.call("terminal.list",{all:true,labels:{"t192.fixture":id}});
    const list=await rows();assert.equal(list.terminals.length,1);assert.equal(list.terminals[0].pid,term.pid);assert.deepEqual(list.terminals[0].argv,argv);
    const stamp=cp.execFileSync(fixture,["stamp",String(term.pid)],{cwd:tmp,windowsHide:true,encoding:"utf8",timeout:3000}).trim();
    assert.match(stamp,/^\d+$/);
    const row=await until(()=>privateRow(id),"private snapshot");
    assert.deepEqual(row.restart_env??{},{});assert.deepEqual(row.argv,argv);
    stream=await attachTerminal(core.endpoint,{terminal:term.address,cols:120,rows:32});
    stream.onData(b=>{traffic.push(Buffer.from(b));outer=Buffer.concat(traffic).toString("utf8")});
    const wireClosed=new Promise(resolve=>stream.onClose(resolve));
    issuer.stdin.end(String(term.pid)+" "+(scenario==="wrong-peer"?(BigInt(stamp)+1n).toString():stamp)+" "+marker+"\n");
    const read=async()=>(await c.call("terminal.read",{terminal:term.address,lines:150})).text;
    const clean=t=>t.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,"");
    const screenHas=async re=>re.test(clean(outer))||re.test(await read());
    if(scenario==="fixture" || scenario==="echo"){
      stage=scenario+":prompt";
      await until(()=>outer.includes("CLI_INPUT>"),"child prompt");
      stream.resize(94,27);
      await until(async()=>{const row=(await rows()).terminals[0];return row.cols===94&&row.rows===27},"outer resize");
      resized=true;
      stream.write(Buffer.from("ping\r"));
    } else if(scenario==="pi"){
      stage="pi:startup";
      await until(()=>screenHas(/startup help|Pi Coding Agent|pi v1\.5\.2|ctrl\+/i),"Pi startup",19000);
      piReady=true;
      stream.write(Buffer.from("/session\r"));
      stage="pi:session panel";
      await until(()=>screenHas(/Session Info/i),"Pi session info",9000);
      piSession=true;
      stream.write(Buffer.from("/quit\r"));
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
    const raw=Buffer.concat(traffic);
    const observed=/ENTRY exact=(true|false) missing=(true|false) unicode=(true|false) keys=(true|false) decoyAbsent=(true|false) tty=(true|false)/.exec(clean(outer)) ||
      /ENTRY exact=(true|false) missing=(true|false) unicode=(true|false) keys=(true|false) decoyAbsent=(true|false) tty=(true|false)/.exec(screen);
    const exit=/CHILD_END code=(\d+) matches=(\d+)/.exec(clean(rendered));
    const r={scenario,brokerIssued:brokerOut.includes("ISSUED_ONCE"),brokerDenied:brokerOut.includes("REJECTED_ZERO"),
      noSecondOpen:rendered.includes("HOST_VERIFIED_ONCE"),outerDenied:rendered.includes("FIXTURE_DENIED"),
      innerArgvChecked:rendered.includes("TARGET_ARGV_CLEAN"),
      coreExit:finished.exit_code,childExit:exit?+exit[1]:null,maskCount:exit?+exit[2]:null,
      entry:observed?Object.fromEntries(["exact","missing","unicode","keys","decoyAbsent","tty"].map((key,i)=>[key,observed[i+1]==="true"])):null,
      fixturePong:outer.includes("CLI_PONG"),queriedSize:(/CLI_SIZE (\d+) (\d+)/.exec(clean(rendered))??[]).slice(1,3),fixtureResize:resized&&/CLI_SIZE 94 27/.test(clean(rendered)),
      piStartup:piReady,piSessionInfo:piSession,piQuit:piSession&&exit?.[1]==="0",
      publicRedaction:outer.includes("[REDACTED]")&&screen.includes("[REDACTED]"),
      interleavedEventVisible:rendered.includes("INTERLEAVED_PUBLIC_EVENT"),
      markerInRawAttach:raw.includes(Buffer.from(marker))||raw.includes(Buffer.from(marker,"utf16le")),
      markerInScreen:screen.includes(marker),randomHalvesInPublicOutput:[random.slice(0,16),random.slice(16)].some(half=>rendered.includes(half)),
      randomEightInPublicOutput:Array.from({length:25},(_,i)=>random.slice(i,i+8)).some(part=>rendered.includes(part)),
      markerInCoreFiles,scannedFiles,lockedFiles:locked,
      markerInArgvOrCoreView:JSON.stringify([argv,row,list,finished]).includes(marker),
      markerInIssuerDiagnostics:(brokerOut+brokerErr).includes(marker),restartEnvKeys:Object.keys(row.restart_env??{})};
    report.cases.push(r);
    assert.equal(brokerCode,0);
    for(const key of ["markerInRawAttach","markerInScreen","randomHalvesInPublicOutput","randomEightInPublicOutput","markerInCoreFiles","markerInArgvOrCoreView","markerInIssuerDiagnostics"])
      assert.equal(r[key],false,key);
    if(scenario==="wrong-peer"){
      assert.ok(r.outerDenied&&r.brokerDenied&&!r.brokerIssued&&!r.entry&&r.childExit===null&&r.coreExit===23);
    }else{
      assert.ok(r.brokerIssued&&r.noSecondOpen&&r.innerArgvChecked&&r.coreExit===0);
      if(scenario==="echo")assert.ok(r.maskCount>=1);else assert.equal(r.maskCount,0);
      if(scenario==="pi"){assert.ok(r.piStartup&&r.piSessionInfo&&r.piQuit);return;}
      assert.deepEqual(r.entry,{exact:scenario!=="omitted",missing:scenario==="omitted",unicode:scenario!=="omitted",keys:true,decoyAbsent:true,tty:true});
      if(scenario==="omitted")assert.equal(r.childExit,17);
      else {assert.equal(r.childExit,0);assert.ok(r.fixturePong&&r.fixtureResize);}
      if(scenario==="echo")assert.ok(r.publicRedaction&&!r.interleavedEventVisible);
    }
  } finally {stream?.close();if(issuer.exitCode===null)issuer.kill();await closed.catch(()=>{});}
}
async function changedTarget(c) {
  stage="changed-target";
  const dir=path.join(tmp,"changed-target");fs.mkdirSync(dir);
  const host=path.join(dir,"fixture.exe");fs.copyFileSync(fixture,host);
  fs.writeFileSync(path.join(dir,"entry.cjs"),'console.log("UNAPPROVED_EXECUTED");process.exit(88);\n',{flag:"wx"});
  const id=crypto.randomUUID().replaceAll("-","");
  // A hash rejection must occur before the broker is contacted. No issuer
  // or marker is created for this case.
  const argv=[host,"host",id,"1","1","fixture"];
  const term=await c.call("terminal.run",{argv,cwd:dir,labels:{"t192.fixture":id},no_parent:true,keep:false});
  const end=await until(async()=>(await c.call("terminal.list",{all:true,labels:{"t192.fixture":id}})).terminals.find(t=>t.state==="finished"),"pin rejection");
  const view=await c.call("terminal.read",{terminal:term.address,lines:100});
  const result={coreExit:end.exit_code,pinDenied:view.text.includes("TARGET_PIN_DENIED"),changedScriptRan:view.text.includes("UNAPPROVED_EXECUTED"),hostReceived:view.text.includes("HOST_VERIFIED_ONCE")};
  assert.deepEqual(result,{coreExit:24,pinDenied:true,changedScriptRan:false,hostReceived:false});
  report.changedTarget=result;
}
async function run(){
  let c;
  try{
    c=await core.ensure();report.core=(await c.call("server.status")).version;assert.equal(report.core,"0.1.19");
    for(const scenario of ["fixture","echo","omitted","wrong-peer","pi"]) await test(c,scenario);
    await changedTarget(c);
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
      const actual=fs.realpathSync(tmp);assert.equal(path.dirname(actual),tempRoot);assert.match(path.basename(actual),/^huhu-t192-atbirth-[a-zA-Z0-9]{6}$/);
      fs.rmSync(actual,{recursive:true,force:true,maxRetries:5,retryDelay:100});report.tmpRemoved=!fs.existsSync(tmp);
      console.log(JSON.stringify(report,null,2));
      assert.ok(report.lockedFilesAfterStop.flat().every(r=>r.removed||r.markerFound===false));
    }
  }
}
run().catch(e=>{console.error("Probe failed at",stage,(e.code||"")+":",String(e.message).split("\n")[0]);process.exitCode=1});
