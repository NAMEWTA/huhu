"use strict";

const { createHash } = require("node:crypto");
const { appendFileSync, existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { createInterface } = require("node:readline");

const directory = process.argv[2];
if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.171.0\n");
} else {
  let threadId = "thread-" + process.pid;
  const turnId = "turn-" + process.pid;
  const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
  const record = (value) => appendFileSync(path.join(directory, "provider.jsonl"), JSON.stringify(value) + "\n");
  createInterface({ input: process.stdin }).on("line", (line) => {
    const message = JSON.parse(line);
    if (message.method === "initialize") send({ id: message.id, result: {} });
    if (message.method === "thread/start") {
      const { cwd, ephemeral, sandbox, approvalPolicy, model, serviceTier, config } = message.params;
      record({ event: "thread", threadId, cwd, ephemeral, sandbox, approvalPolicy, model, serviceTier, effort: config?.model_reasoning_effort, isolatedHome: process.env.CODEX_HOME === path.join(directory, "codex-home") });
      send({ id: message.id, result: { thread: { id: threadId } } });
    }
    if (message.method === "thread/read" || message.method === "thread/resume") {
      const sources = JSON.parse(readFileSync(path.join(directory, "resume-sources.json"), "utf8"));
      const source = sources[message.params.threadId];
      if (!source) return send({ id: message.id, error: { code: -32600, message: "Missing source" } });
      record({ event: message.method, threadId: source.id, pid: process.pid });
      if (message.method === "thread/read") return send({ id: message.id, result: { thread: source } });
      if (source.writerGate && !existsSync(path.join(directory, source.writerGate))) {
        return send({ id: message.id, error: { code: -32600, message: `thread ${source.id} already has an active writer` } });
      }
      const ready = () => {
        threadId = source.id;
        appendFileSync(source.path, "\n");
        send({ id: message.id, result: { thread: { ...source, status: { type: "idle" } }, approvalPolicy: "never", sandbox: { type: "readOnly", networkAccess: false } } });
      };
      if (!source.gate) return ready();
      const timer = setInterval(() => {
        if (!existsSync(path.join(directory, source.gate))) return;
        clearInterval(timer);
        ready();
      }, 25);
    }
    if (message.method === "turn/start") {
      const { threadId: selectedThread, clientUserMessageId, input } = message.params;
      const text = input[0].text;
      const scenario = JSON.parse(text).scenario;
      record({ event: "turn", scenario, threadId: selectedThread, turnId, sha: createHash("sha256").update(text).digest("hex"), clientUserMessageId });
      // A server request can use the same numeric ID as our outstanding client request.
      send({ id: message.id, method: "item/tool/requestUserInput", params: { threadId, turnId } });
      send({ method: "turn/started", params: { threadId, turn: { id: turnId, status: "inProgress" } } });
      if (scenario === "missing-native-response") {
        send({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } });
      } else {
        const respond = () => {
          send({ id: message.id, result: { turn: { id: turnId } } });
          send({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } });
        };
        if (scenario === "late-native-ack" || scenario === "late-native-resume") {
          const release = scenario === "late-native-resume" ? "release-resume-b" : "release";
          const poll = setInterval(() => {
            if (!existsSync(path.join(directory, release))) return;
            clearInterval(poll);
            respond();
          }, 25);
        } else {
          respond();
        }
      }
    } else if (message.error?.code === -32601) {
      record({ event: "unsupported-server-request" });
    }
  });
}
