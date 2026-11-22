import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

const [exe, mode = "baseline"] = process.argv.slice(2);
assert.equal(process.platform, "win32");
assert.ok(exe && ["baseline", "feature", "raw", "plan"].includes(mode));
const root = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-codex-answer-")));
const directory = (name) => {
  const value = path.join(root, name);
  mkdirSync(value);
  return value;
};
const home = directory("provider-home");
const cwd = directory("cwd");
const schemaDir = directory("schema");
const osHome = directory("user-profile");
const temp = directory("tmp");
const question = {
  id: "shape",
  header: "Shape",
  question: "Choose a shape",
  ...(mode === "plan" && { isOther: false, isSecret: false }),
  options: [{ label: "Circle", description: "Round" }, { label: "Square", description: "Four corners" }],
};
const callId = "call_huhu_original_choice";
const finalText = "huhu-synthetic-followup";
const chosen = { answers: { shape: { answers: ["Circle"] } } };
const log = (event, fields = {}) => console.log(JSON.stringify({ event, ...fields }));
let modelRequests = 0;
let deniedProxyRequests = 0;
const deniedProxyKinds = new Set();
function denyProxy(req) {
  deniedProxyRequests++;
  let hostname;
  try { hostname = new URL(req.method === "CONNECT" ? "https://" + req.url : req.url).hostname; } catch {}
  deniedProxyKinds.add(hostname === "api.openai.com" ? "openai-api" : hostname === "chatgpt.com" ? "chatgpt" : "other");
}
let matchedEndpointOutputs = 0;
let offeredTool = false;
let app;
let appClosed;
let timer;

const endpoint = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/responses") {
    denyProxy(req);
    res.writeHead(403).end();
    return;
  }
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const step = ++modelRequests;
    assert.ok(step <= 2);
    const tool = body.tools.find((candidate) => candidate.name === "request_user_input");
    if (step === 1) offeredTool = Boolean(tool);
    const prior = body.input.filter((item) => item.type === "function_call_output" && item.call_id === callId);
    const outputs = prior.map((item) => {
      const proof = summarizeOutput(item.output);
      if (proof.exact) matchedEndpointOutputs++;
      return { callIdMatches: true, nameMatches: item.name === "request_user_input", ...proof };
    });
    log("local-responses-request", { step, advertisedNativeTool: Boolean(tool), originalToolOutputs: outputs });
    const item = step === 1
      ? { id: "fc_huhu_fixture", type: "function_call", call_id: callId, name: "request_user_input", arguments: JSON.stringify({ questions: [question] }), status: "completed" }
      : { id: "msg_huhu_fixture", type: "message", role: "assistant", phase: "final_answer", status: "completed", content: [{ type: "output_text", text: finalText, annotations: [] }] };
    const response = { id: "resp_huhu_fixture_" + step, object: "response", status: "completed", output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    const initial = item.type === "function_call" ? { ...item, status: "in_progress", arguments: "" } : { ...item, status: "in_progress", content: [] };
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (type, fields) => res.write("event: " + type + "\ndata: " + JSON.stringify({ type, ...fields }) + "\n\n");
    send("response.created", { response: { ...response, status: "in_progress", output: [] } });
    send("response.output_item.added", { output_index: 0, item: initial });
    send("response.output_item.done", { output_index: 0, item });
    send("response.completed", { response });
    res.end();
  } catch {
    res.writeHead(500).end();
    log("local-fixture-invalid-request");
  }
});
endpoint.on("connect", (req, socket) => {
  denyProxy(req);
  socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
});

function summarizeOutput(output) {
  const format = typeof output === "string" ? "string" : Array.isArray(output) ? "content-array" : typeof output;
  const text = Array.isArray(output) && output.length === 1 && output[0]?.type === "input_text" ? output[0].text : output;
  let parsed;
  try { if (typeof text === "string") parsed = JSON.parse(text); } catch {}
  const exact = JSON.stringify(parsed) === JSON.stringify(chosen);
  const diagnostic = typeof text === "string" && !parsed && /^[\w ,.:;!_\-\/()'"]{1,240}$/.test(text) ? text : undefined;
  return { format, topLevelKeys: parsed && typeof parsed === "object" ? Object.keys(parsed).sort() : [], exact, ...(exact && { syntheticResult: parsed }), ...(diagnostic && { syntheticToolDiagnostic: diagnostic }) };
}

function projectedProperty(root, title) {
  const queue = [root];
  while (queue.length) {
    const item = queue.shift();
    if (!item || typeof item !== "object") continue;
    if (item.title === title) return { properties: Object.keys(item.properties ?? {}).sort(), required: item.required ?? [] };
    queue.push(...Object.values(item));
  }
  return null;
}

try {
  endpoint.listen(0, "127.0.0.1");
  await once(endpoint, "listening");
  const base = "http://127.0.0.1:" + endpoint.address().port;
  const systemKeys = new Set(["SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "SYSTEMDRIVE", "PROGRAMDATA"]);
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => systemKeys.has(key.toUpperCase()))),
    CODEX_HOME: home, USERPROFILE: osHome, HOME: osHome, APPDATA: directory("app-data"), LOCALAPPDATA: directory("local-app-data"),
    TEMP: temp, TMP: temp, HTTP_PROXY: base, HTTPS_PROXY: base, ALL_PROXY: base, NO_PROXY: "127.0.0.1,localhost",
  };
  writeFileSync(path.join(home, "config.toml"), [
    'model = "gpt-5.2-codex"',
    'model_provider = "fixture"',
    'check_for_update_on_startup = false',
    'web_search = "disabled"',
    '[analytics]', 'enabled = false',
    '[feedback]', 'enabled = false',
    '[model_providers.fixture]',
    'name = "Local synthetic Responses API"',
    'base_url = "' + base + '/v1"',
    'wire_api = "responses"',
    'requires_openai_auth = false',
    'request_max_retries = 0',
    'stream_max_retries = 0',
  ].join("\n") + "\n");
  const launch = { env, cwd, windowsHide: true };
  const cli = (args) => spawnSync(exe, args, { ...launch, encoding: "utf8", timeout: 15_000 });
  const version = cli(["--version"]);
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), "codex-cli 0.171.0");
  const schemaCommand = ["app-server", "generate-json-schema"];
  const schemaHelp = cli([...schemaCommand, "--help"]);
  assert.equal(schemaHelp.status, 0);
  const experimentalSchema = schemaHelp.stdout.includes("--experimental");
  const generated = cli([...schemaCommand, "--out", schemaDir, ...(experimentalSchema ? ["--experimental"] : [])]);
  assert.equal(generated.status, 0);
  const schema = (file) => JSON.parse(readFileSync(path.join(schemaDir, file), "utf8"));
  const notifications = schema("ServerNotification.json");
  const request = schema("ToolRequestUserInputParams.json");
  const resolved = schema("v2/ServerRequestResolvedNotification.json");
  const typed = schema("v2/ItemCompletedNotification.json");
  const raw = schema("v2/RawResponseItemCompletedNotification.json");
  const threadStart = schema("v2/ThreadStartParams.json");
  const reply = schema("ToolRequestUserInputResponse.json");
  log("pinned-protocol", {
    version: version.stdout.trim(), mode, experimentalSchema, rawMethodInNotificationUnion: JSON.stringify(notifications).includes('"rawResponseItem/completed"'),
    rawOptInInThreadStart: threadStart.properties.experimentalRawEvents ?? null,
    readbackMethodInClientRequestUnion: JSON.stringify(schema("ClientRequest.json")).includes('"thread/items/list"'),
    requestRequired: request.required, responseKeys: Object.keys(reply.properties), resolvedKeys: Object.keys(resolved.properties),
    typedOutput: projectedProperty(typed, "FunctionCallOutputThreadItem"), rawOutput: projectedProperty(raw, "FunctionCallOutputResponseItem"),
  });

  const require = createRequire(import.meta.url);
  const helper = require(path.join(process.cwd(), "plugins/agent-cli/src/engine/codex-dispatch-helper.cjs"));
  const readAnswerOutput = helper.createNativeAnswerOutputReader();
  const unrelatedCallReader = helper.createNativeAnswerOutputReader();
  const flags = ["--config", "mcp_servers={}", "--config", 'web_search="disabled"', "--disable", "shell_tool"];
  if (mode === "feature" || mode === "raw") flags.push("--enable", "default_mode_request_user_input");
  app = spawn(exe, [...flags, "app-server", "--listen", "stdio://"], { ...launch, stdio: ["pipe", "pipe", "pipe"] });
  appClosed = once(app, "close");
  app.stderr.resume();
  app.stdin.on("error", () => {});
  timer = setTimeout(() => app.kill(), 35_000);
  const frames = createInterface({ input: app.stdout, crlfDelay: Infinity });
  const send = (data) => app.stdin.write(JSON.stringify(data) + "\n");
  let threadId;
  let turnId;
  let asked;
  let answered = 0;
  let resolvedOriginal = false;
  let matchingAppServerOutputs = 0;
  let helperMatchedOutputs = 0;
  let rejectedForeignCall = 0;
  let toolOutputEvents = 0;
  let rawNotifications = 0;
  let finalMatched = false;
  let completed = false;
  let readbackSeen = false;
  let pendingQuestion;
  const counts = new Map();
  const aliases = new Map([[callId, "fixture-call"]]);
  function alias(value) {
    if (typeof value !== "string") return null;
    if (!aliases.has(value)) aliases.set(value, "id-" + aliases.size);
    return aliases.get(value);
  }
  function submit() {
    if (answered || !pendingQuestion || !threadId || !turnId) return;
    const { id, params } = pendingQuestion;
    const entry = params.questions[0];
    assert.equal(params.threadId, threadId);
    assert.equal(params.turnId, turnId);
    assert.deepEqual(params.questions.map(({ id: questionId, options }) => ({ questionId, labels: options.map(({ label }) => label) })), [{ questionId: question.id, labels: ["Circle", "Square"] }]);
    answered++;
    log("answer-frame", { rpcId: typeof id === "number" ? id : alias(id), rpcIdType: typeof id, thread: alias(threadId), turn: alias(turnId), originalItem: alias(params.itemId), itemIsOriginalCall: params.itemId === callId, result: chosen });
    send({ id, result: chosen });
  }
  function projectItem(item, params, method) {
    if (!item) return null;
    const entry = { type: item.type, id: alias(item.id), callId: alias(item.call_id), nameField: Object.hasOwn(item, "name") ? (item.name === null ? "null" : typeof item.name) : "absent", nameIsNativeTool: item.name === "request_user_input" };
    const isRaw = item.type === "function_call_output";
    if (isRaw || item.type === "functionCallOutput") {
      const source = isRaw ? item.call_id : item.id;
      const proof = summarizeOutput(item.output);
      const matchesQuestionItem = Boolean(asked) && source === asked.params.itemId;
      const sameTurn = params.threadId === threadId && params.turnId === turnId;
      Object.assign(entry, { matchesQuestionItem, sameTurn, ...proof });
      if ((method === "item/completed" || method === "rawResponseItem/completed") && answered) {
        toolOutputEvents++;
        if (sameTurn && matchesQuestionItem && entry.nameIsNativeTool && proof.exact) matchingAppServerOutputs++;
      }
    } else if (item.type === "agentMessage") {
      entry.phase = item.phase;
      entry.finalFixtureText = item.text === finalText;
      if (method === "item/completed" && params.threadId === threadId && params.turnId === turnId) finalMatched ||= entry.finalFixtureText;
    }
    return entry;
  }
  send({ id: 101, method: "initialize", params: { clientInfo: { name: "huhu-local-answer-probe", version: "1" }, capabilities: { experimentalApi: true } } });
  for await (const line of frames) {
    const frame = JSON.parse(line);
    const { id, method, params, result, error } = frame;
    if (method) {
      counts.set(method, (counts.get(method) ?? 0) + 1);
      if (/raw/i.test(method)) rawNotifications++;
      if (method === "item/tool/requestUserInput") {
        assert.equal(asked, undefined);
        asked = pendingQuestion = frame;
        log("app-question", { rpcId: typeof id === "number" ? id : alias(id), rpcIdType: typeof id, thread: alias(params.threadId), turn: alias(params.turnId), item: alias(params.itemId), questionIds: params.questions.map(({ id: questionId }) => questionId), isBlocking: params.isBlocking, isSecret: params.questions[0]?.isSecret, isOther: params.questions[0]?.isOther });
        submit();
        continue;
      }
      if (method === "serverRequest/resolved" && answered && params.threadId === threadId && params.requestId === asked.id) resolvedOriginal = true;
      if (id !== undefined) {
        log("unexpected-app-server-request", { method });
        send({ id, error: { code: -32601, message: "Unavailable in isolated probe" } });
        continue;
      }
      const evidence = readAnswerOutput(method, params, threadId, turnId);
      const foreignParams = params?.item?.type === "function_call" ? { ...params, turnId: "unrelated-turn" } : params;
      const unrelated = unrelatedCallReader(method, foreignParams, threadId, turnId);
      if (answered && evidence?.itemId === asked.params.itemId) {
        assert.deepEqual(evidence.result, chosen);
        assert.equal(unrelated, null);
        rejectedForeignCall++;
        helperMatchedOutputs++;
        log("helper-proof-matched", { method, thread: alias(threadId), turn: alias(turnId), callId: alias(evidence.itemId), response: evidence.result, foreignTurnCallAccepted: false });
      }
      const item = projectItem(params?.item, params ?? {}, method);
      log("app-notification", { method, thread: alias(params?.threadId ?? params?.thread?.id), turn: alias(params?.turnId ?? params?.turn?.id), ...(item && { threadMatches: params.threadId === threadId, turnMatches: params.turnId === turnId }), ...(item && { item }), ...(method === "serverRequest/resolved" && { requestId: typeof params.requestId === "number" ? params.requestId : alias(params.requestId), original: resolvedOriginal }), ...(method === "turn/completed" && { status: params.turn.status }) });
      if (method === "turn/completed" && params.threadId === threadId && params.turn.id === turnId) {
        completed = params.turn.status === "completed";
        send({ id: 104, method: "thread/items/list", params: { threadId, turnId, limit: 50 } });
      }
      continue;
    }
    if (id === 104) {
      readbackSeen = true;
      log("isolated-thread-readback", { rpcError: error?.code ?? null, errorKind: error && /ephemeral/i.test(error.message) ? "ephemeral" : undefined, itemTypes: result?.data?.map((item) => projectItem(item, { threadId, turnId }, "readback")) ?? [], nextCursorPresent: Boolean(result?.nextCursor) });
      break;
    }
    if (error) throw new Error("App Server request failed: " + id + " (code " + error.code + ")");
    if (id === 101 && result) {
      send({ method: "initialized", params: {} });
      send({ id: 102, method: "thread/start", params: { cwd, ephemeral: true, sandbox: "read-only", approvalPolicy: "never", ...(["raw", "plan"].includes(mode) && { experimentalRawEvents: true }) } });
    } else if (id === 102) {
      threadId = result.thread.id;
      send({ id: 103, method: "turn/start", params: { threadId, ...(mode === "plan" && { collaborationMode: { mode: "plan", settings: { model: "gpt-5.2-codex", reasoning_effort: null, developer_instructions: null } } }), input: [{ type: "text", text: "Isolated native question compatibility probe." }] } });
    } else if (id === 103) {
      turnId = result.turn.id;
      log("original-turn-bound", { thread: alias(threadId), turn: alias(turnId) });
      submit();
    }
  }
  log("summary", {
    mode, offeredTool, turnBound: Boolean(threadId && turnId), asked: Boolean(asked), answered, resolvedOriginal, originalParserMatchedOutputs: matchingAppServerOutputs, helperMatchedOutputs, rejectedForeignCall, toolOutputEvents, rawNotifications,
    matchedEndpointOutputs, finalMatched, completed, readbackSeen, modelRequests, deniedProxyRequests, deniedProxyKinds: [...deniedProxyKinds], forwardedProxyRequests: 0, persistentSessions: existsSync(path.join(home, "sessions")), notifications: Object.fromEntries(counts),
  });
  assert.ok(threadId && turnId && completed && readbackSeen && finalMatched);
  assert.equal(modelRequests, 2);
  assert.equal(helperMatchedOutputs, ["raw", "plan"].includes(mode) ? 1 : 0);
  assert.equal(rejectedForeignCall, helperMatchedOutputs);
  assert.equal(existsSync(path.join(home, "sessions")), false);
  if (mode !== "baseline" || asked) {
    assert.equal(answered, 1);
    assert.ok(resolvedOriginal);
    assert.equal(matchedEndpointOutputs, 1);
  }
} finally {
  try {
    if (app) {
      app.stdin.end();
      const stop = setTimeout(() => app.kill(), 2_500);
      try {
        const [exitCode] = await appClosed;
        log("app-server-stopped", { exitCode });
      } finally {
        clearTimeout(stop);
      }
    }
  } finally {
    clearTimeout(timer);
    endpoint.closeAllConnections();
    await new Promise((done) => endpoint.close(done));
    assert.equal(path.dirname(root), realpathSync(tmpdir()));
    assert.ok(path.basename(root).startsWith("huhu-codex-answer-"));
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    log("cleanup", { isolatedRootRemoved: !existsSync(root), loopbackClosed: !endpoint.listening });
  }
}
