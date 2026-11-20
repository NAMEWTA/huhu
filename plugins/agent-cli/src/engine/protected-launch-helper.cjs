const { spawn } = require("node:child_process");
const { realpathSync, statSync } = require("node:fs");
const { createConnection } = require("node:net");
const { StringDecoder } = require("node:string_decoder");
const { Transform } = require("node:stream");

const MAX_PAYLOAD = 2 * 1024 * 1024;

function fetchLaunch(port, token) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const chunks = [];
    let size = 0;
    socket.setTimeout(5_000, () => socket.destroy(new Error("Launch timeout")));
    socket.on("error", reject);
    socket.on("connect", () => socket.write(token + "\n"));
    socket.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_PAYLOAD) socket.destroy(new Error("Launch payload too large"));
      else chunks.push(chunk);
    });
    socket.on("end", () => {
      try {
        const config = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!Array.isArray(config.argv) || config.argv.length === 0 || !config.argv.every((part) => typeof part === "string") || !config.env || Object.values(config.env).some((value) => typeof value !== "string"))
          throw new Error("Invalid launch payload");
        resolve(config);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function redact(values) {
  const decoder = new StringDecoder("utf8");
  const secrets = [...new Set(values.filter(Boolean))].sort((a, b) => b.length - a.length);
  const retained = Math.max(0, (secrets[0]?.length ?? 1) - 1);
  let pending = "";
  function filter(text, final = false) {
    pending += text;
    const limit = final ? pending.length : pending.length - retained;
    const output = [];
    let offset = 0;
    while (offset < limit) {
      let first = limit;
      let match = "";
      for (const secret of secrets) {
        const position = pending.indexOf(secret, offset);
        if (position >= 0 && position < first) {
          first = position;
          match = secret;
        }
      }
      output.push(pending.slice(offset, first));
      if (match) output.push("***");
      offset = first + match.length;
    }
    pending = pending.slice(offset);
    return output.join("");
  }
  return new Transform({
    transform(chunk, _encoding, callback) {
      callback(null, filter(decoder.write(chunk)));
    },
    flush(callback) {
      callback(null, filter(decoder.end(), true));
    },
  });
}

function matchesApprovedDirectory(expected) {
  try {
    const cwd = realpathSync.native(process.cwd());
    const stat = statSync(cwd, { bigint: true });
    // 此独立 helper 由打包器原样复制，身份格式与 vault 的 filesystemIdentity 一致。
    return cwd === expected.path && stat.isDirectory() && stat.ino !== 0n && `${stat.dev}:${stat.ino}` === expected.identity && String(stat.birthtimeNs) === expected.birthtimeNs;
  } catch {
    return false;
  }
}

async function main() {
  const port = Number(process.argv[2]);
  const token = process.argv[3] ?? "";
  if (!Number.isInteger(port) || port < 1 || port > 65_535 || !/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid launch ticket");
  const {
    argv: [command, ...args],
    env,
    approvedDirectory,
  } = await fetchLaunch(port, token);
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  if (process.platform === "win32") {
    const overrides = new Set(Object.keys(env).map((name) => name.toUpperCase()));
    for (const name of Object.keys(environment)) if (overrides.has(name.toUpperCase())) delete environment[name];
  }
  if (approvedDirectory !== undefined && !matchesApprovedDirectory(approvedDirectory)) {
    process.stderr.write("受保护的终端工作目录已变化，命令未启动。\n");
    process.exitCode = 1;
    return;
  }
  // 继承 helper 已打开的当前目录。启动时无需用批准路径另选一次 cwd。
  const child = spawn(command, args, { env: { ...environment, ...env }, stdio: ["inherit", "pipe", "pipe"], windowsHide: true });
  child.stdout.pipe(redact(Object.values(env))).pipe(process.stdout, { end: false });
  child.stderr.pipe(redact(Object.values(env))).pipe(process.stderr, { end: false });
  const interrupt = () => child.kill();
  process.on("SIGTERM", interrupt);
  process.on("SIGINT", interrupt);
  process.exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  process.off("SIGTERM", interrupt);
  process.off("SIGINT", interrupt);
}

main().catch(() => {
  process.stderr.write("受保护的终端命令未能启动。\n");
  process.exitCode = 1;
});
