// Run from the integration checkout on Windows with its existing dependencies.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const assert = require("node:assert/strict");
const root = process.cwd();
require(path.join(root, "node_modules/.pnpm/tsx@4.23.15/node_modules/tsx/dist/cjs/index.cjs"));
const engine = path.join(root, "plugins/agent-cli/src/engine");
const { HerdrCore } = require(path.join(engine, "herdr-core.ts"));
const { ProtectedLaunch } = require(path.join(engine, "protected-launch.ts"));
const electron = require(path.join(root, "apps/desktop/node_modules/electron"));
const bin = path.join(root, "apps/desktop/resources/herdr/win32-x64/herdr-core.exe");
const exeHash = createHash("sha256").update(fs.readFileSync(bin)).digest("hex");
assert.equal(exeHash, "8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d");
const tmpRoot = fs.realpathSync(os.tmpdir());
const tmp = fs.mkdtempSync(path.join(tmpRoot, "huhu-t192-"));
const core = new HerdrCore({ bin, vaultId: randomUUID(), machineId: "t192", runtimeDir: tmp });
const broker = new ProtectedLaunch(electron, path.join(engine, "protected-launch-helper.cjs"));
const privateMarker = "fixture-" + randomUUID();
const ordinaryMarker = "ordinary-" + randomUUID();
const envName = "HUHU_T192_SAMPLE";
// Only the fresh Core and its children inherit this environment. No user CLI profile is used.
const allowed = new Set(["systemroot", "windir", "comspec", "path", "pathext", "temp", "tmp", "systemdrive"]);
for (const name of Object.keys(process.env)) if (!allowed.has(name.toLowerCase())) delete process.env[name];
const evidence = { node: process.version, arch: process.arch, windows: os.release(), exeHash, rows: [] };
const piEntry = process.argv[2];
if (piEntry) {
  assert.ok(path.isAbsolute(piEntry));
  // Give the offline CLI an empty profile and only the fixture's working directory.
  const profile = path.join(tmp, "profile");
  fs.mkdirSync(profile);
  Object.assign(process.env, { USERPROFILE: profile, HOME: profile, APPDATA: profile, LOCALAPPDATA: profile,
    PI_CODING_AGENT_DIR: path.join(profile, "agent"), PI_OFFLINE: "1", PI_TELEMETRY: "0" });
}
async function until(fn, max = 12000) {
  const end = Date.now() + max;
  do { const result = await fn(); if (result) return result; await delay(100); } while (Date.now() < end);
  throw Error("fixture timed out");
}
function savedRows() {
  const rows = [];
  function walk(obj) {
    if (!obj || typeof obj !== "object") return;
    if (obj.restart_env && obj.labels?.["t192.probe"]) rows.push(obj);
    for (const value of Object.values(obj)) walk(value);
  }
  for (const file of fs.readdirSync(tmp, { recursive: true })) {
    if (!file.endsWith(".json")) continue;
    try { walk(JSON.parse(fs.readFileSync(path.join(tmp, file), "utf8"))); } catch {}
  }
  return rows;
}
async function run() {
  let c;
  const panes = [];
  try {
    c = await core.ensure();
    evidence.version = (await c.call("server.status")).version;
    assert.equal(evidence.version, "0.1.19");
    const port = await broker.listen();
    for (const mode of ["direct", "relay"]) {
      const key = randomUUID();
      const marker = mode === "direct" ? ordinaryMarker : privateMarker;
      // A stock local interactive Node REPL. Never render the environment value.
      const code = "console.log('TTYFACTS', +!!process.stdin.isTTY, +!!process.stdout.isTTY, +!!process.stderr.isTTY, /^((ordinary)|(fixture))-[a-f0-9-]{36}$/.test(process.env.HUHU_T192_SAMPLE));setTimeout(()=>process.exit(0),6500).unref()";
      const argv = [process.execPath, "-i", "-e", code];
      const ticket = mode === "relay" ? broker.issue(port, argv, { [envName]: marker }) : undefined;
      const args = ticket?.argv ?? argv;
      const env = ticket ? { ELECTRON_RUN_AS_NODE: "1" } : { [envName]: marker };
      const term = await c.call("terminal.run", { argv: args, env, cwd: tmp, labels: { "t192.probe": key }, keep: false, no_parent: true });
      panes.push(term.address);
      const persisted = await until(() => savedRows().find(row => row.labels["t192.probe"] === key));
      let sent = false;
      await delay(1000);
      try { await c.call("terminal.send", { terminal: term.address, text: "console.log('ROUND'+'TRIP', 12*11)\r" }); sent = true; } catch {}
      const finished = await until(async () => (await c.call("terminal.list", { all: true, labels: { "t192.probe": key } })).terminals.find(t => t.address === term.address && t.state === "finished"));
      const out = (await c.call("terminal.read", { terminal: term.address, lines: 120 })).text;
      const observed = out.match(/TTYFACTS\s+([01])\s+([01])\s+([01])\s+(true|false)/);
      const record = { mode, tty: observed?.slice(1,4).map(x => x === "1"), received: observed?.[4] === "true", sent, evaluated: /ROUNDTRIP\s+132/.test(out), exit: finished.exit_code, markerInOutput: out.includes(marker), markerInArgv: JSON.stringify(args).includes(marker), restartEnvNames: Object.keys(persisted.restart_env), markerInRestartEnv: Object.values(persisted.restart_env).includes(marker) };
      evidence.rows.push(record);
      ticket?.revoke();
      assert.ok(record.received);
      assert.equal(record.markerInOutput, false);
      assert.equal(record.markerInArgv, false);
      assert.equal(record.markerInRestartEnv, mode === "direct");
      assert.deepEqual(record.tty.slice(1), mode === "direct" ? [true,true] : [false,false]);
      if (mode === "direct") assert.ok(record.evaluated);
    }
    if (piEntry) {
      const argv = [process.execPath, piEntry, "--offline", "--no-session", "--no-extensions", "--no-mcp",
        "--no-skills", "--no-themes", "--no-context-files", "--no-prompt-templates", "--no-approve", "--tui-mode", "regular"];
      const pane = await c.call("terminal.run", { argv, cwd: tmp, no_parent: true, keep: false });
      panes.push(pane.address);
      const view = () => c.call("terminal.read", { terminal: pane.address, lines: 100 });
      const isLive = async () => (await c.call("terminal.list", { all: true })).terminals.find(t => t.address === pane.address)?.state === "live";
      await until(async () => /startup help|Pi Coding Agent|pi v1\.5\.2|ctrl\+|Open hardware/i.test((await view()).text), 18000);
      assert.ok(await isLive());
      await c.call("terminal.send", { terminal: pane.address, text: "/quit\r" });
      const end = await until(async () => (await c.call("terminal.list", { all: true })).terminals.find(t => t.address === pane.address && t.state === "finished"), 10000);
      evidence.pi = { entrySha256: createHash("sha256").update(fs.readFileSync(piEntry)).digest("hex"),
        offline: true, emptyProfile: true, startupVisible: true, quitExitCode: end.exit_code };
      assert.equal(end.exit_code, 0);
    }
  } finally {
    broker.close();
    if (c) for (const address of panes) {
      const list = () => c.call("terminal.list", { all: true });
      if ((await list()).terminals.some(t => t.address === address && t.state === "live")) await c.call("terminal.kill", { terminal: address });
      await until(async () => !(await list()).terminals.some(t => t.address === address && t.state === "live"));
      await c.call("terminal.rm", { terminal: address });
    }
    evidence.remainingPanes = c ? (await c.call("terminal.list", { all: true })).terminals.length : null;
    await core.stop();
    assert.equal(await core.peek(), "absent");
    evidence.coreStopped = true;
    const actual = fs.realpathSync(tmp);
    assert.equal(path.dirname(actual), tmpRoot);
    assert.match(path.basename(actual), /^huhu-t192-[a-zA-Z0-9]{6}$/);
    fs.rmSync(actual, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    evidence.tempRemoved = !fs.existsSync(tmp);
    console.log(JSON.stringify(evidence, null, 2));
  }
}
run().catch(err => { console.error("Probe failed:", err.name, (err.message || "").split("\n")[0]); process.exitCode=1; });
