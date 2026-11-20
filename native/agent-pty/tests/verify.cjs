// Windows integration probe. It creates and removes its own Core service and panes.
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");

const root = path.resolve(__dirname, "../../..");
const [coreArgument, piArgument, ...selected] = process.argv.slice(2);
assert.equal(process.platform, "win32");
assert.equal(process.arch, "x64");
assert.ok(coreArgument && piArgument);
const corePath = fs.realpathSync.native(coreArgument);
const piEntry = fs.realpathSync.native(piArgument);
const hostImage = fs.realpathSync.native(path.join(__dirname, "../bin/huhu-agent-pty.exe"));
const node = fs.realpathSync.native(process.execPath);
const entry = fs.realpathSync.native(path.join(__dirname, "entry.cjs"));
const sha = (contents) => createHash("sha256").update(contents).digest("hex");
const pinned = (filename) => ({ path: filename, sha256: sha(fs.readFileSync(filename)) });
const nodeImage = pinned(node);
const installed = pinned(hostImage);
const pi = pinned(piEntry);
const coreSHA256 = pinned(corePath).sha256;
assert.equal(coreSHA256, "8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d");
assert.equal(nodeImage.sha256, "ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32");
assert.equal(pi.sha256, "e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774");

require(path.join(root, "node_modules/.pnpm/tsx@4.23.15/node_modules/tsx/dist/cjs/index.cjs"));
const { HerdrCore } = require(path.join(root, "plugins/agent-cli/src/engine/herdr-core.ts"));
const { attachTerminal } = require(path.join(root, "packages/herdr-client/src/index.ts"));
const scratch = fs.realpathSync.native(os.tmpdir());
const tmp = fs.mkdtempSync(path.join(scratch, "huhu-agent-pty-proof-"));
const core = new HerdrCore({ bin: corePath, vaultId: randomUUID(), machineId: "pty1", runtimeDir: tmp });
const inherited = new Set(["SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "TEMP", "TMP", "SYSTEMDRIVE"]);
for (const name of Object.keys(process.env)) {
  if (!inherited.has(name.toUpperCase())) delete process.env[name];
}
Object.assign(process.env, { HOME: tmp, USERPROFILE: tmp, APPDATA: tmp, LOCALAPPDATA: tmp, HUHU_PARENT_DECOY: "public-parent-decoy" });

const agentBundle = path.dirname(piEntry);
const piFiles = fs
  .readdirSync(agentBundle, { recursive: true })
  .map((item) => path.join(agentBundle, item))
  .filter((item) => item !== piEntry && fs.statSync(item).isFile())
  .sort()
  .map((item) => pinned(fs.realpathSync.native(item)));
piFiles.push(pinned(fs.realpathSync.native(path.resolve(agentBundle, "../../package.json"))));

const report = {
  runId: randomUUID(),
  startedAt: new Date().toISOString(),
  windows: os.release(),
  arch: os.arch(),
  node: process.version,
  coreSHA256,
  hostSHA256: installed.sha256,
  piEntrySHA256: pi.sha256,
  piPinnedFiles: piFiles.length + 1,
  sourceHeadAtLoad: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim(),
  cases: [],
};
const needles = [];
let stage = "startup";

async function until(find, label, timeout = 12_000) {
  const end = Date.now() + timeout;
  do {
    const result = await find();
    if (result) return result;
    await sleep(40);
  } while (Date.now() < end);
  throw new Error("Timed out at " + label);
}

function native(args) {
  return execFileSync(hostImage, args, { cwd: tmp, encoding: "utf8", timeout: 6_000, windowsHide: true }).trim();
}

function directory(folder) {
  const [, volume, index, created] = /^HUHU_PTY DIRECTORY 1 (\d+) (\d+) (\d+)$/.exec(native(["directory", folder]));
  return { path: folder, id: { volume, index, created } };
}

function files() {
  return fs
    .readdirSync(tmp, { recursive: true })
    .map((item) => path.join(tmp, item))
    .filter((item) => fs.statSync(item).isFile());
}

function privateRow(id) {
  function find(value) {
    if (!value || typeof value !== "object") return undefined;
    if (value.labels?.["huhu.agent-pty.proof"] === id && Array.isArray(value.argv)) return value;
    for (const entry of Object.values(value)) {
      const result = find(entry);
      if (result) return result;
    }
  }
  for (const file of files().filter((item) => item.endsWith(".json"))) {
    try {
      const found = find(JSON.parse(fs.readFileSync(file, "utf8")));
      if (found) return found;
    } catch {
      /* The snapshot can be in the middle of replacement. */
    }
  }
}

function pipeGone(id) {
  return new Promise((resolve) => {
    const socket = net.createConnection("\\\\.\\pipe\\huhu-agent-pty-v1-" + id);
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", (error) => resolve(error.code === "ENOENT"));
  });
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

function contains(data, secret) {
  return data.includes(Buffer.from(secret)) || data.includes(Buffer.from(secret, "utf16le"));
}

function outputSafe(data, marker, random) {
  assert.ok(!contains(data, marker), "complete protected value was exposed");
  for (let i = 0; i <= random.length - 8; i++) {
    assert.ok(!data.includes(random.slice(i, i + 8)), "a synthetic 8-character fragment was exposed");
  }
}

async function scenario(c, name) {
  const id = randomBytes(16).toString("hex");
  const random = randomBytes(16).toString("hex");
  const marker = "fixture-huhu-" + random + "-雪🧪";
  needles.push(marker);
  const dir = path.join(tmp, "case-" + id);
  const outerDirectory = path.join(dir, "outer");
  const innerDirectory = path.join(dir, "approved");
  const home = path.join(dir, "home");
  const temp = path.join(dir, "temp");
  for (const folder of [outerDirectory, innerDirectory, home, temp]) fs.mkdirSync(folder, { recursive: true });
  const frozen = directory(innerDirectory);
  const sys = process.env.SYSTEMROOT;
  const env = {
    SYSTEMROOT: sys,
    WINDIR: sys,
    COMSPEC: path.join(sys, "System32", "cmd.exe"),
    PATH: path.join(sys, "System32"),
    HOME: home,
    USERPROFILE: home,
    APPDATA: home,
    LOCALAPPDATA: home,
    TEMP: temp,
    TMP: temp,
  };
  if (name !== "omitted") env.HUHU_SYNTHETIC_PTY = marker;
  let target = pinned(entry);
  let argv = [node, target.path, name, 'space and "quoted" \\'];
  let dependent = [];
  if (name === "pi") {
    Object.assign(env, { PI_OFFLINE: "1", PI_TELEMETRY: "0", PI_CODING_AGENT_DIR: path.join(home, "agent") });
    target = pi;
    dependent = piFiles;
    argv = [node, target.path, "--offline", "--no-session", "--no-extensions", "--no-mcp", "--no-skills", "--no-themes", "--no-context-files", "--no-prompt-templates", "--no-approve", "--tui-mode", "regular"];
  } else env.HUHU_SYNTHETIC_SHA256 = sha(marker);
  const launch = { directory: frozen, image: nodeImage, entry: target, files: dependent, argv, environment: env, protect: name === "omitted" ? [] : ["HUHU_SYNTHETIC_PTY"] };
  if (name === "changed-entry") {
    const target = path.join(innerDirectory, "approved.cjs");
    fs.copyFileSync(entry, target);
    launch.entry = pinned(target);
    launch.argv[1] = target;
    fs.writeFileSync(target, 'console.log("UNAPPROVED_EXECUTED"); process.exit(88);');
  }
  if (name === "changed-image") {
    const target = path.join(innerDirectory, "approved.exe");
    fs.copyFileSync(node, target);
    launch.image = pinned(target);
    launch.argv[0] = target;
    fs.writeFileSync(target, "replacement fixture");
  }
  if (name === "create-failed") {
    const target = path.join(innerDirectory, "not-a-pe.exe");
    fs.writeFileSync(target, "approved fixture with no executable image");
    launch.image = pinned(target);
    launch.argv[0] = target;
  }
  if (name === "pin-held") {
    const target = path.join(innerDirectory, "held.cjs");
    fs.copyFileSync(entry, target);
    launch.entry = pinned(target);
    launch.argv[1] = target;
  }
  if (name === "changed-directory") {
    fs.renameSync(innerDirectory, path.join(dir, "previous"));
    fs.mkdirSync(innerDirectory);
  }
  if (name === "changed-ancestor") {
    const replacement = path.join(dir, "replacement");
    fs.renameSync(innerDirectory, replacement);
    fs.symlinkSync(replacement, innerDirectory, "junction");
  }
  if (name === "bad-argv") launch.argv[3] = marker;
  if (name === "entry-case") launch.argv[1] = path.join(path.dirname(entry), path.basename(entry).toUpperCase());
  if (name === "bad-env") env.huhu_synthetic_pty = "duplicate-key";

  const broker = spawn(hostImage, ["broker", id], { cwd: tmp, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const closed = new Promise((resolve, reject) => {
    broker.once("error", reject);
    broker.once("close", resolve);
  });
  let issued = "",
    errors = "",
    attach;
  const chunks = [];
  broker.stdout.on("data", (data) => (issued += data));
  broker.stderr.on("data", (data) => (errors += data));
  broker.stdin.on("error", () => {});
  const labels = { "huhu.agent-pty.proof": id };
  const rows = () => c.call("terminal.list", { all: true, labels });
  try {
    stage = name + ":ready";
    const [, pid, created] = await until(() => /^HUHU_PTY BROKER_READY 1 (\d+) (\d+)\r?$/m.exec(issued), "broker ready");
    assert.equal(+pid, broker.pid);
    let peerCreated = created;
    if (name === "wrong-broker") peerCreated = String(BigInt(created) + 1n);
    const outerArgv = [hostImage, "host", id, pid, peerCreated];
    const terminal = await c.call("terminal.run", { argv: outerArgv, cwd: outerDirectory, labels, no_parent: true, keep: false });
    assert.ok(terminal.pid && terminal.created_ms);
    let rootCreated;
    if (name !== "wrong-broker") {
      const [, rootPid, observed] = /^HUHU_PTY PROCESS 1 (\d+) (\d+)$/.exec(native(["inspect", String(terminal.pid), installed.path, installed.sha256]));
      assert.equal(+rootPid, terminal.pid);
      rootCreated = observed;
    }
    const listing = await rows();
    assert.equal(listing.terminals.length, 1);
    assert.deepEqual(listing.terminals[0].argv, outerArgv);
    const persisted = await until(() => privateRow(id), "restart metadata");
    assert.deepEqual(persisted.restart_env ?? {}, {});
    assert.deepEqual(persisted.argv, outerArgv);
    attach = await attachTerminal(core.endpoint, { terminal: terminal.address, cols: 120, rows: 32 });
    attach.onData((buf) => chunks.push(Buffer.from(buf)));
    const wireClosed = new Promise((resolve) => attach.onClose(resolve));
    const screen = async () => (await c.call("terminal.read", { terminal: terminal.address, lines: 300 })).text;
    const wire = () => Buffer.concat(chunks).toString("utf8");
    const csi = new RegExp(String.fromCharCode(27) + "\\[[0-?]*[ -/]*[@-~]", "g");
    const publicText = async () => (wire() + "\n" + (await screen())).replace(csi, "");
    const textMatch = (pattern, label, ms) => until(async () => pattern.exec(await publicText()), label, ms);
    let host = { pid: terminal.pid, created: rootCreated, image: installed };
    if (name === "wrong-host") host.created = String(BigInt(rootCreated) + 1n);
    if (name === "wrong-installation") {
      const other = path.join(dir, "copy.exe");
      fs.copyFileSync(hostImage, other);
      host.image = pinned(other);
    }
    if (name === "wrong-broker") {
      await until(async () => (await rows()).terminals.find((row) => row.state === "finished"), "host rejected broker before private input");
      broker.stdin.end();
    } else {
      broker.stdin.end(JSON.stringify({ version: 1, host, launch }));
    }
    const positive = ["plain", "echo", "omitted", "pin-held", "tree", "kill-tree", "pi"].includes(name);
    const observed = {};
    let descendant;
    stage = name + ":interactive";
    if (positive) await until(() => /^HUHU_PTY RUNNING\r?$/m.test(issued), "private running receipt");
    if (name === "pi") {
      await textMatch(/startup help|Pi Coding Agent|pi v1\.5\.2|ctrl\+/i, "Pi startup", 22_000);
      attach.write(Buffer.from("/session\r"));
      await textMatch(/Session Info/i, "Pi session panel");
      attach.write(Buffer.from("/quit\r"));
      observed.offlinePiSession = true;
    } else if (positive && name !== "omitted") {
      await until(() => wire().includes("CLI_INPUT>"), "unbuffered child prompt");
      if (name === "pin-held") {
        assert.throws(() => fs.closeSync(fs.openSync(launch.entry.path, "r+")), { code: /^(EBUSY|EACCES|EPERM)$/ });
        observed.entryWriteDenied = true;
      }
      if (name.endsWith("tree")) {
        const [, child] = await textMatch(/DESCENDANT (\d+)/, "job descendant");
        descendant = +child;
        assert.ok(alive(descendant));
      }
      if (name === "kill-tree") {
        await c.call("terminal.kill", { terminal: terminal.address });
      } else {
        attach.resize(94, 27);
        await textMatch(/CLI_RESIZED 94 27/, "inner resize without keystroke");
        attach.write(Buffer.from("ping\r"));
        await textMatch(/CLI_PONG/, "inner input");
        observed.promptInputAndResize = true;
      }
    }
    stage = name + ":finish";
    const finished = await until(async () => (await rows()).terminals.find((row) => row.state === "finished"), "terminal exit", 38_000);
    await Promise.race([wireClosed, sleep(1000)]);
    const rendered = await publicText();
    const brokerCode = await closed;
    const receipts = issued.split(/\r?\n/).filter((line) => /^HUHU_PTY (ISSUED_ONCE|RUNNING|START_FAILED|START_UNKNOWN)\b/.test(line));
    const received = receipts.includes("HUHU_PTY ISSUED_ONCE");
    const running = receipts.includes("HUHU_PTY RUNNING");
    const startupFailed = name === "create-failed";
    assert.deepEqual(receipts, positive ? ["HUHU_PTY ISSUED_ONCE", "HUHU_PTY RUNNING"] : startupFailed ? ["HUHU_PTY ISSUED_ONCE", "HUHU_PTY START_FAILED 70"] : []);
    observed.brokerCode = brokerCode;
    observed.coreExit = finished.exit_code;
    observed.consumed = received;
    observed.running = running;
    observed.pipeGone = await pipeGone(id);
    assert.ok(observed.pipeGone);
    if (name === "pin-held") {
      fs.closeSync(fs.openSync(launch.entry.path, "r+"));
      observed.entryHandleReleased = true;
    }
    if (descendant) {
      await until(() => !alive(descendant), "job descendant exit");
      observed.descendantStopped = true;
    }
    const exitMarker = /HUHU_PTY CHILD_EXIT (\d+)/.exec(rendered);
    if (positive) {
      assert.equal(brokerCode, 0);
      if (name === "kill-tree") {
        assert.ok(!exitMarker, "kill unexpectedly reached a normal host exit");
      } else {
        const code = name === "omitted" ? 17 : 0;
        assert.equal(finished.exit_code, code);
        assert.equal(Number(exitMarker?.[1]), code);
        if (name !== "pi") {
          const present = name !== "omitted";
          const entry = new RegExp("ENTRY exact=" + present + " missing=" + !present + " unicode=" + present + " keys=true decoyAbsent=true tty=true argv=true cwd=true");
          assert.ok(entry.test(rendered), "inner entry contract did not match");
          observed.entryContract = true;
        }
      }
      if (name === "echo") {
        assert.ok(wire().includes("[REDACTED]") && (await screen()).includes("[REDACTED]") && !rendered.includes("INTERLEAVED_PUBLIC_EVENT"));
        observed.interleavedRedaction = true;
      }
    } else if (startupFailed) {
      assert.equal(brokerCode, 70);
      assert.equal(finished.exit_code, 70);
      assert.ok(!exitMarker && !rendered.includes("ENTRY exact=") && !rendered.includes("HUHU_PTY RUNNING"));
      observed.startupFailedAfterConsumption = true;
    } else {
      assert.ok(!exitMarker && !rendered.includes("UNAPPROVED_EXECUTED") && !rendered.includes("ENTRY exact="));
      assert.ok([73, 74, 75].includes(brokerCode) && [73, 74, 75].includes(finished.exit_code), "wrapper refused with the expected statuses");
      if (name.startsWith("changed-")) assert.equal(brokerCode, 74);
      observed.zeroLaunch = true;
    }
    for (const data of [Buffer.concat(chunks), Buffer.from(await screen()), Buffer.from(issued + errors), Buffer.from(JSON.stringify([outerArgv, persisted, listing, finished]))]) {
      outputSafe(data, marker, random);
    }
    for (const file of files()) {
      try {
        assert.ok(!contains(fs.readFileSync(file), marker), "protected value appeared on disk");
      } catch (error) {
        if (error.code !== "EBUSY") throw error;
      }
    }
    report.cases.push({ name, ...observed });
  } finally {
    attach?.close();
    if (broker.exitCode === null) broker.kill();
    await closed.catch(() => {});
  }
}

async function main() {
  let c;
  try {
    c = await core.ensure();
    report.core = (await c.call("server.status")).version;
    assert.equal(report.core, "0.1.19");
    const scenarios = [
      "plain",
      "echo",
      "omitted",
      "wrong-host",
      "wrong-broker",
      "wrong-installation",
      "changed-entry",
      "changed-image",
      "create-failed",
      "changed-directory",
      "changed-ancestor",
      "bad-argv",
      "entry-case",
      "bad-env",
      "pin-held",
      "tree",
      "kill-tree",
      "pi",
    ];
    assert.ok(selected.every((scenario) => scenarios.includes(scenario)));
    for (const test of selected.length ? selected : scenarios) {
      await scenario(c, test);
    }
    report.passed = true;
  } finally {
    try {
      if (c) {
        for (const row of (await c.call("terminal.list", { all: true })).terminals) {
          assert.match(row.labels["huhu.agent-pty.proof"], /^[0-9a-f]{32}$/);
          if (row.state === "live") await c.call("terminal.kill", { terminal: row.address });
          await until(async () => !(await c.call("terminal.list", { all: true })).terminals.some((item) => item.address === row.address && item.state === "live"), "fixture termination");
          await c.call("terminal.rm", { terminal: row.address });
        }
        report.remainingPanes = (await c.call("terminal.list", { all: true })).terminals.length;
      }
    } finally {
      await core.stop();
      report.coreStopped = (await core.peek()) === "absent";
      for (const file of files()) {
        const content = fs.readFileSync(file);
        assert.ok(
          needles.every((needle) => !contains(content, needle)),
          "protected value appeared after shutdown",
        );
      }
      const resolved = fs.realpathSync.native(tmp);
      assert.equal(path.dirname(resolved), scratch);
      assert.match(path.basename(resolved), /^huhu-agent-pty-proof-[a-zA-Z0-9]{6}$/);
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      report.tmpRemoved = !fs.existsSync(tmp);
      console.log(JSON.stringify(report, null, 2));
    }
  }
}

main().catch((error) => {
  console.error("Probe failed at", stage, error.code ?? "", String(error.message).split("\n")[0]);
  process.exitCode = 1;
});
