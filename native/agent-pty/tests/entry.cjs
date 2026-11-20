// First application read, without any launcher or pipe handshake.
const value = process.env.HUHU_SYNTHETIC_PTY;
const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");
const path = require("node:path");
const { WriteStream } = require("node:tty");
const { setTimeout: sleep } = require("node:timers/promises");

const expected = ["APPDATA", "COMSPEC", "HOME", "HUHU_SYNTHETIC_SHA256", "LOCALAPPDATA", "PATH", "SYSTEMROOT", "TEMP", "TMP", "USERPROFILE", "WINDIR"];
if (value !== undefined) expected.push("HUHU_SYNTHETIC_PTY");
const keys =
  Object.keys(process.env)
    .map((k) => k.toUpperCase())
    .sort()
    .join("|") === expected.sort().join("|");
const exact = value !== undefined && createHash("sha256").update(value).digest("hex") === process.env.HUHU_SYNTHETIC_SHA256;
const unicode = value?.endsWith("-雪🧪") === true;
const decoyAbsent = process.env.HUHU_PARENT_DECOY === undefined;
const tty = [process.stdin, process.stdout, process.stderr].every((s) => s.isTTY === true);
const argv = process.argv[3] === 'space and "quoted" \\' && process.argv.length === 4;
const cwd = process.cwd() === path.join(path.dirname(process.env.HOME), "approved");
console.log("ENTRY exact=%s missing=%s unicode=%s keys=%s decoyAbsent=%s tty=%s argv=%s cwd=%s", exact, value === undefined, unicode, keys, decoyAbsent, tty, argv, cwd);
if (!keys || !decoyAbsent || !tty || !argv || !cwd) process.exit(18);
if (value === undefined) process.exit(17);
if (!exact || !unicode) process.exit(19);

async function interact() {
  if (process.argv[2] === "echo") {
    process.stderr.write(value.slice(0, 23));
    await sleep(80);
    process.stdout.write("INTERLEAVED_PUBLIC_EVENT");
    await sleep(80);
    process.stderr.write(value.slice(23) + "\n");
  }
  if (process.argv[2] === "tree" || process.argv[2] === "kill-tree") {
    // This separate console-less descendant deliberately outlives the root unless the job kills it.
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 10000)"], { detached: true, stdio: "ignore", windowsHide: true, env: {} });
    child.unref();
    console.log("DESCENDANT %d", child.pid);
  }
  const input = createInterface({ input: process.stdin, terminal: false });
  const sizes = setInterval(() => {
    const size = new WriteStream(1).getWindowSize();
    if (size[0] !== 94 || size[1] !== 27) return;
    clearInterval(sizes);
    console.log("CLI_RESIZED %d %d", ...size);
  }, 50);
  process.stdout.write("CLI_INPUT> ");
  input.once("line", (line) => {
    if (line !== "ping") process.exit(21);
    console.log("CLI_PONG");
    clearInterval(sizes);
    input.close();
    process.stdin.pause();
  });
}
interact().catch(() => process.exit(22));
