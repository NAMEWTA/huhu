import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const source = process.cwd();
const load = (relative) => import(pathToFileURL(path.join(source, relative)).href);
const { boot } = await load("apps/engine/src/boot.ts");
const { AgentDetector, HerdrCore } = await load("plugins/agent-cli/src/engine/index.ts");
const { machineId } = await load("packages/vault/src/index.ts");
const sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-codex-real-")));
const dir = (name) => { const value = path.join(sandbox, name); mkdirSync(value); return value; };
const vaultPath = dir("vault");
const desktopUserData = dir("desktop");
const home = dir("provider-home");
const marker = "huhu-local-native-probe";
let modelRequests = 0;
let matchedInput = 0;
const endpoint = createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url?.endsWith("/responses")) {
    res.writeHead(404).end();
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  modelRequests++;
  if (JSON.stringify(body.input).includes(marker)) matchedInput++;
  const output = { id: "msg_huhu_fixture", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: marker, annotations: [] }] };
  const response = { id: "resp_huhu_fixture", object: "response", status: "completed", output: [output], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
  res.writeHead(200, { "content-type": "text/event-stream" });
  const send = (type, fields) => res.write("event: " + type + "\ndata: " + JSON.stringify({ type, ...fields }) + "\n\n");
  send("response.created", { response: { ...response, status: "in_progress", output: [] } });
  send("response.output_item.added", { output_index: 0, item: { ...output, status: "in_progress", content: [] } });
  send("response.output_item.done", { output_index: 0, item: output });
  send("response.completed", { response });
  res.end();
});
await new Promise((resolve) => endpoint.listen(0, "127.0.0.1", resolve));
const { port } = endpoint.address();
writeFileSync(path.join(home, "config.toml"), [
  'model = "gpt-5.2-codex"',
  'model_provider = "fixture"',
  '[model_providers.fixture]',
  'name = "Local synthetic Responses API"',
  'base_url = "http://127.0.0.1:' + port + '/v1"',
  'wire_api = "responses"',
  'requires_openai_auth = false',
  'request_max_retries = 0',
  'stream_max_retries = 0',
].join("\n") + "\n");
const coreBin = process.env.HUHU_AGENT_LAUNCH_TEST_BIN;
const codexBin = process.env.HUHU_CODEX_REAL_TEST_BIN;
assert.ok(coreBin && codexBin);
process.env.HUHU_HERDR_BIN = coreBin;
process.env.HUHU_CODEX_DISPATCH_BIN = codexBin;
process.env.HUHU_CODEX_DISPATCH_HOME = home;
process.env.HUHU_CODEX_DISPATCH_HELPER = path.join(source, "plugins/agent-cli/src/engine/codex-dispatch-helper.cjs");
process.env.HUHU_NODE_BIN = process.env.HUHU_CODEX_TEST_ELECTRON || process.execPath;
AgentDetector.prototype.detect = async () => [];
let engine;
let cli;
async function call(capability, input) {
  const result = await fetch("http://127.0.0.1:" + engine.port + "/api/v1/call", {
    method: "POST",
    headers: { authorization: "Bearer " + engine.rendererToken, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
  }).then((reply) => reply.json());
  if (!result.ok) throw new Error(capability + " " + result.error.code);
  return result.data;
}
try {
  const mid = machineId();
  engine = await boot({ vaultPath, desktopUserData, create: true });
  const runtimeDir = path.join(engine.vault.stateDir, "runtime", mid, "herdr");
  const core = new HerdrCore({ bin: coreBin, vaultId: engine.vault.id, machineId: mid, runtimeDir });
  const env = { ...process.env, HC_SESSION: "huhu", HC_SOCKET: core.endpoint, XDG_STATE_HOME: path.join(runtimeDir, "state"), XDG_CONFIG_HOME: path.join(runtimeDir, "config") };
  for (const key of ["HC_TERMINAL_ID", "HC_TERMINAL_SOCKET", "HC_SCOPE"]) delete env[key];
  cli = (...args) => spawnSync(coreBin, args, { env, windowsHide: true, encoding: "utf8", timeout: 15_000 });
  assert.equal(cli("server", "status").status, 5);
  await call("plugins.setEnabled", { id: "automations", enabled: false });
  const [space] = await call("agent.spaces.list", {});
  const task = await call("tasks.create", {
    title: "Isolated real Codex transport probe",
    body: "Return exactly " + marker + ". Do not use tools or read files.",
    type: "agent",
    execution: { spaceId: space.id, provider: "codex", model: "gpt-5.2-codex" },
  });
  const key = { taskId: task.id, dispatchId: "real-codex-probe" };
  const accepted = await call("tasks.dispatch", { ...key, expectedVersion: task.version, inputRevision: task.inputRevision, inputHash: task.inputHash });
  let last;
  let proof;
  for (let i = 0; i < 140; i++) {
    last = await call("tasks.dispatch.read", key);
    if (last.state === "blocked") break;
    proof = await engine.dispatcher.call("plugin:tasks", {
      capability: "agent.runs.inspect", requestId: randomUUID(),
      input: { ...key, vaultId: engine.vault.id, machineId: mid, runId: accepted.runId, attempt: 1 },
    });
    if (last.state === "running" && proof.ok && proof.data.status === "accepted" && !proof.data.ownerActive && modelRequests) break;
    await pause(250);
  }
  const sessions = await call("agent.sessions.list", { spaceId: space.id });
  if (last.state !== "running" || !proof?.ok || proof.data.status !== "accepted" || modelRequests !== 1) {
    const diagnostics = [];
    for (const session of sessions) {
      try { diagnostics.push((await call("agent.sessions.output", { id: session.id })).text); } catch {}
    }
    console.info(JSON.stringify({ phase: "probe-incomplete", taskReceipt: last.state, reason: last.reason, agent: proof?.ok ? proof.data.status : proof?.error?.code, modelRequests, sessions: sessions.map(({ state, terminalId }) => ({ state, terminalId })), diagnostics }));
  }
  assert.equal(last.state, "running");
  assert.ok(proof.ok);
  assert.equal(proof.data.status, "accepted");
  assert.equal(proof.data.nativeWrite, "provider_accepted");
  assert.equal(proof.data.coreWrite, "not_sent");
  assert.equal(proof.data.ownerActive, false);
  assert.ok(proof.data.providerAcceptance.nativeTurnId);
  const binding = proof.data.execution.sessionBinding;
  assert.ok(binding.nativeSessionId);
  assert.equal(sessions.filter((session) => session.id === binding.sessionId && session.terminalId === binding.coreAddress).length, 1);
  assert.equal(modelRequests, 1);
  assert.equal(matchedInput, 1);
  assert.equal(existsSync(path.join(home, "sessions")), false);
  const after = await call("tasks.read", { id: task.id });
  assert.equal(after.comments.filter(({ run }) => run === accepted.runId).length, 1);
  const coreStatus = JSON.parse(cli("server", "status").stdout);
  assert.equal(coreStatus.version, "0.1.19");
  const version = spawnSync(codexBin, ["--version"], { windowsHide: true, encoding: "utf8" }).stdout.trim();
  assert.equal(version, "codex-cli 0.171.0");
  console.info(JSON.stringify({ phase: "accepted", codex: version, core: coreStatus.version, nativeThread: true, nativeTurn: true, coreAddress: binding.coreAddress, huhuSessionBound: true, ephemeral: true, localSyntheticModelRequests: modelRequests, matchedInput, taskComments: 1, nativeWrite: proof.data.nativeWrite, coreWrite: proof.data.coreWrite, electronHost: Boolean(process.env.HUHU_CODEX_TEST_ELECTRON) }));
} finally {
  await engine?.shutdown();
  if (cli) {
    if (cli("server", "status").status === 0) assert.equal(cli("server", "stop").status, 0);
    assert.equal(cli("server", "status").status, 5);
  }
  endpoint.closeAllConnections();
  await new Promise((resolve) => endpoint.close(resolve));
  if (path.dirname(sandbox) === realpathSync(tmpdir()) && path.basename(sandbox).startsWith("huhu-codex-real-")) rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
