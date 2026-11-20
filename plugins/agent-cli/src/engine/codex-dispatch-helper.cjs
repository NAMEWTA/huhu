"use strict";

const { spawn } = require("node:child_process");
const { createHash, createHmac, timingSafeEqual } = require("node:crypto");
const { readFileSync, renameSync, statSync, writeFileSync } = require("node:fs");
const { createServer } = require("node:net");
const path = require("node:path");
const { createInterface } = require("node:readline");

function main(file) {
  const config = JSON.parse(readFileSync(file, "utf8"));
  const directory = path.dirname(file);
  const address = process.env.HC_TERMINAL_ID;
  const digest = /^[a-f0-9]{64}$/;
  const id = /^[A-Za-z0-9._-]{1,128}$/;
  if (!address || !id.test(address) || !digest.test(config.secret)) throw new Error("Invalid control");
  const stamp = (filePath) => {
    const stat = statSync(filePath, { bigint: true });
    return createHash("sha256")
      .update(JSON.stringify([filePath, stat.ino.toString(), stat.size.toString(), stat.mtimeNs.toString()]))
      .digest("hex");
  };
  if (stamp(config.command) !== config.binaryStamp || stamp(config.helper) !== config.helperStamp) throw new Error("Launch configuration changed");
  const userConfig = path.join(config.home, "config.toml");
  if ((statSync(userConfig, { throwIfNoEntry: false }) ? stamp(userConfig) : null) !== config.configStamp) throw new Error("Provider configuration changed");

  // A recovered shell or a second process with the same argv cannot start another App Server.
  writeFileSync(path.join(directory, "helper-started"), "", { flag: "wx", flush: true });
  const key = Buffer.from(config.secret, "hex");
  const sign = (purpose, data) =>
    createHmac("sha256", key)
      .update(JSON.stringify([purpose, data]))
      .digest("hex");
  const authentic = (actual, expected) => typeof actual === "string" && digest.test(actual) && timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
  const save = (name, data) => {
    const target = path.join(directory, name + ".json");
    const temp = target + ".tmp";
    writeFileSync(temp, JSON.stringify({ data, mac: sign(name, data) }), { flag: "wx", flush: true });
    renameSync(temp, target);
  };
  const log = (state) => process.stdout.write("HUHU Codex: " + state + "\n");
  const systemKeys = new Set(["SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "USERNAME", "SYSTEMDRIVE", "PROGRAMDATA"]);
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => systemKeys.has(name.toUpperCase())));
  env.CODEX_HOME = config.home;

  const app = spawn(config.command, [...config.args, "--config", "mcp_servers={}", "--config", 'web_search="disabled"', "--disable", "shell_tool", "app-server", "--listen", "stdio://"], {
    cwd: process.cwd(),
    env,
    windowsHide: true,
    shell: false,
    stdio: ["pipe", "pipe", "ignore"],
  });
  const pending = new Map();
  const sockets = new Set();
  let server;
  let threadId;
  let turnId;
  let completed;
  let closing = false;
  let submitted = false;
  let serial = 0;
  const send = (message) => app.stdin.write(JSON.stringify(message) + "\n");
  const request = (method, params, accept) => {
    const rpcId = ++serial;
    pending.set(rpcId, accept);
    send({ id: rpcId, method, params });
  };

  function stop(state) {
    if (closing) return;
    closing = true;
    clearTimeout(startup);
    for (const socket of sockets) socket.destroy();
    server?.close();
    app.stdin.destroy();
    app.kill();
    log(state);
  }

  function finishIfMatched() {
    if (!turnId || completed !== turnId) return;
    save("completed", { threadId, turnId });
    stop("original turn ended");
  }

  function submit(data) {
    const { execution, input } = data ?? {};
    const binding = execution?.sessionBinding;
    if (
      submitted ||
      closing ||
      !threadId ||
      typeof input !== "string" ||
      input.length < 1 ||
      input.length > 64_000 ||
      execution?.vaultId !== config.vaultId ||
      binding?.machineId !== config.machineId ||
      binding?.sessionId !== config.sessionId ||
      binding?.coreId !== config.coreId ||
      binding?.coreAddress !== address ||
      binding?.provider !== "codex" ||
      binding?.nativeSessionId !== threadId ||
      !id.test(binding?.processGeneration ?? "") ||
      typeof execution?.dispatchId !== "string" ||
      typeof execution?.runId !== "string"
    )
      return;
    submitted = true;
    const inputSha256 = createHash("sha256").update(input).digest("hex");
    const clientUserMessageId = createHash("sha256")
      .update(JSON.stringify([execution, inputSha256]))
      .digest("hex");
    save("intent", { execution, inputSha256, clientUserMessageId });
    request("turn/start", { threadId, clientUserMessageId, input: [{ type: "text", text: input }] }, (result) => {
      if (typeof result?.turn?.id !== "string" || !id.test(result.turn.id)) return stop("turn acceptance is unconfirmed");
      turnId = result.turn.id;
      const acceptanceId = createHash("sha256")
        .update(JSON.stringify([threadId, turnId]))
        .digest("hex");
      save("receipt", { id: acceptanceId, execution, inputSha256, nativeTurnId: turnId });
      log("provider accepted the original input");
      finishIfMatched();
    });
  }

  function authorize(socket) {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    // Only the first frame is needed to authenticate the endpoint. The second frame binds the input to that nonce.
    socket.setTimeout(10_000, () => socket.destroy());
    socket.setEncoding("utf8");
    let nonce;
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > 400_000) return socket.destroy();
      const end = buffer.indexOf("\n");
      if (end === -1) return;
      if (end !== buffer.length - 1) return socket.destroy();
      const frame = buffer.slice(0, end);
      buffer = "";
      if (!nonce) {
        if (!digest.test(frame)) return socket.destroy();
        nonce = frame;
        return socket.write(sign("ready", nonce) + "\n");
      }
      let envelope;
      try {
        envelope = JSON.parse(frame);
      } catch {
        return socket.end();
      }
      if (envelope && authentic(envelope.mac, sign("input", [nonce, envelope.data]))) {
        try {
          submit(envelope.data);
        } catch {
          stop("turn acceptance is unconfirmed");
        }
      }
      socket.end();
    });
  }

  const startup = setTimeout(() => stop("thread startup is unconfirmed"), 20_000);
  app.once("error", () => stop("App Server unavailable"));
  app.once("close", () => stop("App Server ended"));
  app.stdin.on("error", () => stop("App Server connection lost"));
  createInterface({ input: app.stdout, crlfDelay: Infinity }).on("line", (line) => {
    if (closing) return;
    try {
      const { id: rpcId, method, result, error, params } = JSON.parse(line);
      if (typeof method === "string") {
        if (rpcId !== undefined) {
          send({ id: rpcId, error: { code: -32601, message: "This client cannot handle the request" } });
        } else if (method === "turn/completed" && threadId && params?.threadId === threadId && ["completed", "failed", "interrupted"].includes(params.turn?.status)) {
          completed = params.turn?.id;
          finishIfMatched();
        }
        return;
      }
      const accept = pending.get(rpcId);
      if (!accept) return;
      pending.delete(rpcId);
      accept(error === undefined ? result : undefined);
    } catch {
      stop("App Server protocol interrupted");
    }
  });
  process.once("SIGTERM", () => stop("session ended"));
  process.once("SIGINT", () => stop("session ended"));

  request("initialize", { clientInfo: { name: "huhu", version: "1" }, capabilities: { experimentalApi: true } }, (result) => {
    if (!result) return stop("App Server handshake rejected");
    send({ method: "initialized", params: {} });
    request(
      "thread/start",
      {
        cwd: process.cwd(),
        ephemeral: true,
        sandbox: "read-only",
        approvalPolicy: "never",
        ...(config.model ? { model: config.model } : {}),
        ...(config.fast ? { serviceTier: "priority" } : {}),
        ...(config.effort ? { config: { model_reasoning_effort: config.effort } } : {}),
      },
      (started) => {
        if (typeof started?.thread?.id !== "string" || !id.test(started.thread.id)) return stop("thread startup is unconfirmed");
        threadId = started.thread.id;
        server = createServer(authorize);
        server.once("error", () => stop("control channel unavailable"));
        server.listen("\\\\.\\pipe\\huhu-codex-" + sign("socket", 1), () => {
          try {
            save("thread", { attempt: config.attempt, threadId, address, pid: process.pid });
            clearTimeout(startup);
            log("native thread ready");
          } catch {
            stop("thread binding could not be saved");
          }
        });
      },
    );
  });
}

try {
  main(process.argv[2]);
} catch {
  process.stderr.write("HUHU Codex: controlled launch unavailable\n");
  process.exitCode = 1;
}
