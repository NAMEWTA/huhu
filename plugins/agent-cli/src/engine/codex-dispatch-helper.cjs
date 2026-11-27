"use strict";

const { spawn, spawnSync } = require("node:child_process");
const { createHash, createHmac, timingSafeEqual } = require("node:crypto");
const { closeSync, mkdtempSync, openSync, readFileSync, readSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync, writeSync } = require("node:fs");
const { createServer } = require("node:net");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { createInterface } = require("node:readline");

const validText = (value, limit) => typeof value === "string" && value.length <= limit && /\S/.test(value) && value.isWellFormed();

function executableSha256(file) {
  const handle = openSync(file, "r");
  try {
    const hash = createHash("sha256");
    const bytes = Buffer.allocUnsafe(1024 * 1024);
    for (let count; (count = readSync(handle, bytes)) > 0;) hash.update(bytes.subarray(0, count));
    return hash.digest("hex");
  } finally {
    closeSync(handle);
  }
}

function createNativeAnswerOutputReader() {
  const calls = new Map();
  const tool = "request_user_input";
  return (method, params, threadId, turnId) => {
    if (!turnId || params?.threadId !== threadId || params?.turnId !== turnId || !params.item) return null;
    const { item } = params;
    let itemId;
    let pairedRaw = false;
    if (method === "item/completed" && item.type === "functionCallOutput" && item.name === tool) {
      itemId = item.id;
    } else if (method === "rawResponseItem/completed" && typeof item.call_id === "string") {
      const callId = item.call_id;
      const prior = calls.get(callId);
      if (item.type === "function_call") {
        if (prior !== undefined || calls.size < 128) calls.set(callId, prior !== false && item.name === tool);
        return null;
      }
      // The native Codex raw output can omit name. The earlier call on this turn supplies it.
      if (item.type === "function_call_output" && prior !== false && (item.name === tool || (item.name == null && prior === true))) {
        itemId = callId;
        pairedRaw = prior === true;
      }
    }
    if (typeof itemId !== "string") return null;
    const output = Array.isArray(item.output) && item.output.length === 1 && item.output[0]?.type === "input_text" ? item.output[0].text : item.output;
    if (!validText(output, 16_000)) return null;
    try {
      return { itemId, pairedRaw, result: JSON.parse(output) };
    } catch {
      return null;
    }
  };
}

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
  const nativeChoiceBridge = config.nativeChoiceBridge === true;
  const resume = config.resume;
  const workspace = config.workspace;
  function workspaceApproved() {
    if (!workspace) return true;
    try {
      const stat = statSync(workspace.root, { bigint: true });
      const identity = stat.ino === 0n ? null : `${stat.dev}:${stat.ino}`;
      return (
        !resume &&
        process.platform === "linux" &&
        process.cwd() === workspace.root &&
        realpathSync(workspace.root) === workspace.root &&
        stat.isDirectory() &&
        JSON.stringify([identity, String(stat.birthtimeNs)]) === workspace.rootIdentity &&
        workspace.files.every(({ path, stamp: expected }) => stamp(path) === expected)
      );
    } catch {
      return false;
    }
  }
  if (!workspaceApproved()) throw new Error("Workspace write approval changed");
  function resumeStamp() {
    const stat = statSync(resume.file, { bigint: true });
    const physical = [stat.dev, stat.ino, stat.birthtimeNs].join(":");
    if (!stat.isFile() || realpathSync(resume.file) !== resume.file || physical !== resume.physical || path.relative(realpathSync(process.cwd()), resume.cwd) !== "") throw new Error("Resume source changed");
    return createHash("sha256").update([physical, stat.size, stat.mtimeNs, stat.ctimeNs].join(":")).digest("hex");
  }
  if (resume && resumeStamp() !== resume.revision) throw new Error("Resume selection changed");
  const linuxNative = process.platform === "linux" && config.args.length === 0;
  const expectedDigest = process.platform === "win32" ? "cefea4ffee1fff04983a99c0dda99944d8b380e891e740a28b32f4b815a6e0b7" : "880819aab735adcf16f36cd628940b9f1e652a36c01d10a5d32f83cc84902971";
  if ((nativeChoiceBridge || linuxNative) && (executableSha256(config.command) !== expectedDigest || stamp(config.command) !== config.binaryStamp)) {
    throw new Error("Provider fingerprint changed before native questions could be enabled");
  }

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
  const windows = process.platform === "win32";
  const systemKeys = new Set(windows ? ["SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "USERNAME", "SYSTEMDRIVE", "PROGRAMDATA"] : ["PATH", "LANG", "LC_ALL", "LC_CTYPE"]);
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => systemKeys.has(windows ? name.toUpperCase() : name)));
  env.CODEX_HOME = config.home;
  if (!windows) env.HOME = config.home;

  // Codex merges tables across layers, so an empty CLI MCP table alone does not clear profile entries.
  const isolatedMcpArgs = config.args.length
    ? []
    : ["--disable", "plugins", "--disable", "remote_plugin", "--disable", "skill_mcp_dependency_install", "--disable", "apps", "--config", "projects." + JSON.stringify(process.cwd()) + '.trust_level="untrusted"'];
  if (isolatedMcpArgs.length) {
    const inventory = spawnSync(config.command, [...isolatedMcpArgs, "mcp", "list", "--json"], {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
      timeout: 4_000,
      maxBuffer: 512 * 1024,
      windowsHide: true,
    });
    if (inventory.status !== 0) throw new Error("Controlled MCP configuration could not be verified");
    const entries = JSON.parse(inventory.stdout);
    if (!Array.isArray(entries) || entries.length) throw new Error("Controlled Codex profile contains existing MCP entries");
    if ((statSync(userConfig, { throwIfNoEntry: false }) ? stamp(userConfig) : null) !== config.configStamp) throw new Error("Provider configuration changed");
  }

  const nativeChoiceFeature = "default_mode_request_user_input";
  const choiceArgs = nativeChoiceBridge ? ["--enable", nativeChoiceFeature] : [];
  const toolArgs = workspace ? ["--enable", "shell_tool", "--config", "sandbox_workspace_write={writable_roots=[],network_access=false,exclude_tmpdir_env_var=true,exclude_slash_tmp=true}"] : ["--disable", "shell_tool"];
  const tokenFile = path.join(directory, "task-mcp-token.json");
  const taskMcp = !resume && statSync(tokenFile, { throwIfNoEntry: false }) ? JSON.parse(readFileSync(tokenFile, "utf8")) : null;
  const endTaskMcp = () => {
    if (!taskMcp) return;
    rmSync(path.join(directory, "task-mcp-active.json"), { force: true });
    rmSync(path.join(directory, "task-mcp-submitted.json"), { force: true });
  };
  let mcp = "mcp_servers={}";
  if (taskMcp) {
    rmSync(tokenFile);
    if (!/^http:\/\/127\.0\.0\.1:[0-9]+\/mcp$/.test(taskMcp.url) || !/^[A-Za-z0-9_-]{43}$/.test(taskMcp.token)) throw new Error("Invalid task MCP binding");
    env.HUHU_TASK_MCP_TOKEN = taskMcp.token;
    mcp = "mcp_servers={huhu={url=" + JSON.stringify(taskMcp.url) + ',bearer_token_env_var="HUHU_TASK_MCP_TOKEN",default_tools_approval_mode="approve"}}';
    toolArgs.push("--config", 'shell_environment_policy.exclude=["HUHU_TASK_MCP_TOKEN"]');
    const processStart = process.platform === "linux" ? statSync(`/proc/${process.pid}`, { bigint: true }).ino.toString() : undefined;
    save("task-mcp-active", { pid: process.pid, processStart });
  }
  const app = spawn(config.command, [...config.args, ...isolatedMcpArgs, ...choiceArgs, "--config", mcp, "--config", 'web_search="disabled"', ...toolArgs, "app-server", "--listen", "stdio://"], {
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
  let resumedStamp;
  let resumeTurnOffset;
  let defaultChoices = false;
  let turnId;
  let executionBinding;
  let stopRequest;
  let resultMode;
  const questions = new Map();
  const submittedAnswers = new Map();
  let readAnswerOutput = createNativeAnswerOutputReader();
  const seenQuestionIds = new Set();
  const seenQuestionItems = new Set();
  let currentQuestion;
  const finals = new Map();
  const completed = new Map();
  const emitted = new Set();
  const observedTurns = new Set();
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
    endTaskMcp();
    clearTimeout(startup);
    clearInterval(approvalWatch);
    for (const socket of sockets) socket.destroy();
    server?.close();
    app.stdin.destroy();
    app.kill();
    log(state);
  }

  const validId = (value) => typeof value === "string" && id.test(value);
  const hash = (values) => createHash("sha256").update(JSON.stringify(values)).digest("hex");
  const executionFields = ({ vaultId, taskId, runId, attempt, dispatchId, sessionBinding: b }) => [
    vaultId,
    taskId,
    runId,
    attempt,
    dispatchId,
    b.machineId,
    b.sessionId,
    b.coreId,
    b.coreAddress,
    b.processGeneration,
    b.provider,
    b.nativeSessionId,
  ];
  const sameExecution = (execution) => execution?.sessionBinding && executionBinding && JSON.stringify(executionFields(execution)) === JSON.stringify(executionFields(executionBinding));
  const runFile = (execution, name) => "run-" + hash(executionFields(execution)) + "-" + name;

  function report(source, payload) {
    const { vaultId, runId, attempt, dispatchId, sessionBinding } = executionBinding;
    const receiptId = "codex-" + hash([vaultId, runId, attempt, dispatchId, sessionBinding.processGeneration, source.kind, source.threadId, source.turnId, source.itemId, source.rpcId, source.questionId]);
    if (emitted.has(receiptId)) return false;
    const receipt = { version: 1, receiptId, execution: executionBinding, kind: source.kind, payload };
    save("report-" + receiptId, { source, receipt });
    emitted.add(receiptId);
    return true;
  }

  function questionIdentity(source) {
    const nativeRequestId = "codex-request-" + hash([source.threadId, source.turnId, source.itemId, source.rpcId]);
    return { nativeRequestId, requestId: "codex-question-" + hash([nativeRequestId, source.questionId]), requestVersion: 1 };
  }

  function publishBoundReports() {
    if (!turnId) return;
    const completion = completed.get(turnId);
    if (!completion) {
      for (const entry of questions.values()) {
        const { source, question } = entry;
        if (source.turnId !== turnId) continue;
        if (
          report(source, {
            mode: "native_deferred",
            ...questionIdentity(source),
            text: question.question,
            options: question.options.map(({ label }) => label),
          })
        )
          currentQuestion = entry;
      }
      return;
    }
    const final = finals.get(turnId);
    const { status, error } = completion;
    endTaskMcp();
    if (status === "completed" && final) report(final.source, { message: final.text });
    const withoutFinal = status === "completed" && !final ? (final === undefined && resultMode === "allow_no_update" ? "allowed" : "unconfirmed") : undefined;
    save(runFile(executionBinding, "completed"), { threadId, turnId, status, error, withoutFinal });
    log("original turn ended");
    submitted = false;
    turnId = undefined;
    executionBinding = undefined;
    stopRequest = undefined;
    resultMode = undefined;
    currentQuestion = undefined;
    questions.clear();
    submittedAnswers.clear();
    seenQuestionIds.clear();
    seenQuestionItems.clear();
    finals.clear();
    completed.clear();
    emitted.clear();
    readAnswerOutput = createNativeAnswerOutputReader();
  }

  function boundQuestion(rpcId, params) {
    if (seenQuestionIds.has(rpcId)) return true;
    if (!submitted || params?.threadId !== threadId || !validId(params.turnId) || !validId(params.itemId) || (turnId ? params.turnId !== turnId : observedTurns.has(params.turnId)) || completed.has(params.turnId)) return false;
    if (!(Number.isSafeInteger(rpcId) || validId(rpcId)) || !Array.isArray(params.questions) || params.questions.length !== 1) return false;
    const [question] = params.questions;
    if (!validId(question?.id) || typeof question.header !== "string" || !validText(question.question, 8_000)) return false;
    const legacyChoice = params.isBlocking === true && (question.isSecret === undefined || question.isSecret === false) && (question.isOther === undefined || question.isOther === false);
    // This exact Default-mode shape has no automatic resolution. The UI and the reply pipe accept only the listed values.
    const defaultChoice = defaultChoices && params.isBlocking === false && params.autoResolutionMs === null && question.isSecret === false && question.isOther === true && questions.size === 0;
    if (!legacyChoice && !defaultChoice) return false;
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 8) return false;
    if (!question.options.every((option) => validText(option?.label, 512) && typeof option.description === "string" && option.isOther !== true)) return false;
    if (new Set(question.options.map(({ label }) => label)).size !== question.options.length) return false;
    const itemKey = hash([params.turnId, params.itemId]);
    if (questions.size >= 32 || seenQuestionIds.size >= 128 || seenQuestionItems.has(itemKey)) return false;
    const source = { kind: "question", threadId, turnId: params.turnId, itemId: params.itemId, rpcId, questionId: question.id };
    questions.set(rpcId, { source, question, defaultChoice });
    seenQuestionIds.add(rpcId);
    seenQuestionItems.add(itemKey);
    publishBoundReports();
    return true;
  }

  function recordFinal(turn, item) {
    if (item?.type !== "agentMessage" || item.phase !== "final_answer") return;
    const prior = finals.get(turn);
    if (prior === null || (prior === undefined && finals.size >= 32)) return;
    if (!validId(item.id) || !validText(item.text, 64_000) || (prior && (prior.source.itemId !== item.id || prior.text !== item.text))) {
      finals.set(turn, null);
    } else if (!prior) {
      finals.set(turn, { source: { kind: "result", threadId, turnId: turn, itemId: item.id }, text: item.text });
    }
  }

  function nativeNotice(method, params) {
    if (!submitted || params?.threadId !== threadId) return;
    if (method === "serverRequest/resolved") {
      questions.delete(params.requestId);
      const answer = submittedAnswers.get(params.requestId);
      if (!answer) return;
      answer.resolved = true;
      confirmAnswer(answer);
      if (resumeTurnOffset !== undefined && !answer.accepted) {
        const {
          fingerprint,
          source: { turnId, itemId, questionId },
        } = answer;
        save("answer-resolved-" + fingerprint, { fingerprint, turnId, itemId, questionId, offset: resumeTurnOffset });
      }
      return;
    }
    recordAnswerOutput(readAnswerOutput(method, params, threadId, turnId));
    if (method === "item/completed" && validId(params.turnId) && (turnId ? params.turnId === turnId : !observedTurns.has(params.turnId))) {
      recordFinal(params.turnId, params.item);
    } else if (method === "turn/completed" && validId(params.turn?.id) && (turnId ? params.turn.id === turnId : !observedTurns.has(params.turn.id))) {
      const { id: completedId, status, error, items } = params.turn;
      if (!["completed", "failed", "interrupted"].includes(status) || completed.has(completedId) || completed.size >= 32) return;
      if (status === "completed" && Array.isArray(items)) for (const item of items) recordFinal(completedId, item);
      const info = error?.codexErrorInfo;
      const code = typeof info === "string" ? info : info && typeof info === "object" && Object.keys(info).length === 1 ? Object.keys(info)[0] : undefined;
      const reason = status === "failed" && validText(error?.message, 8_000) ? { message: error.message, code: validId(code) ? code : undefined } : undefined;
      completed.set(completedId, { status, error: reason });
      publishBoundReports();
    }
  }

  function recordAnswerOutput(evidence) {
    if (!evidence) return;
    const answer = [...submittedAnswers.values()].find((entry) => entry.source.itemId === evidence.itemId);
    if (!answer || (answer.defaultChoice && !evidence.pairedRaw) || JSON.stringify(evidence.result) !== JSON.stringify(answer.result)) return;
    answer.consumed = true;
    confirmAnswer(answer);
  }

  function confirmAnswer(answer) {
    if (!answer.resolved || !answer.consumed || answer.accepted) return;
    save("answer-ack-" + answer.fingerprint, { fingerprint: answer.fingerprint });
    answer.accepted = true;
  }

  function nativeAnswer(data) {
    const { execution, requestId, requestVersion, nativeRequestId, replyId, answer, operation } = data;
    if (!turnId || closing || completed.has(turnId) || stopRequest || !sameExecution(execution) || !currentQuestion) return "stale";
    const { source, question, defaultChoice } = currentQuestion;
    const identity = questionIdentity(source);
    if (source.turnId !== turnId || questions.get(source.rpcId) !== currentQuestion || identity.requestId !== requestId || identity.requestVersion !== requestVersion || identity.nativeRequestId !== nativeRequestId) return "stale";
    if (!validText(replyId, 256) || !question.options.some(({ label }) => label === answer)) return "unsupported";
    const fingerprint = hash([...executionFields(execution), requestId, requestVersion, nativeRequestId, replyId, answer]);
    const previous = submittedAnswers.get(source.rpcId);
    if (previous) return previous.fingerprint === fingerprint ? (previous.accepted ? "accepted" : "unknown") : "stale";
    if (operation === "answer.inspect") return "not_sent";
    const result = { answers: { [source.questionId]: { answers: [answer] } } };
    save("answer-write-" + nativeRequestId, { fingerprint });
    submittedAnswers.set(source.rpcId, { source, fingerprint, result, defaultChoice });
    send({ id: source.rpcId, result });
    return "unknown";
  }

  function nativeStop({ execution, stopId, operation }) {
    if (closing || !sameExecution(execution)) return "stale";
    if (!turnId || completed.has(turnId)) return "unknown";
    if (!validText(stopId, 256)) return "unsupported";
    const fingerprint = hash([...executionFields(execution), stopId]);
    if (stopRequest) return stopRequest === fingerprint ? "unknown" : "stale";
    if (operation === "stop.inspect") return "not_sent";
    save(runFile(execution, "stop-write"), { fingerprint, threadId, turnId });
    stopRequest = fingerprint;
    // The response to turn/interrupt is transport feedback. Only nativeNotice records the terminal state.
    request("turn/interrupt", { threadId, turnId }, () => {});
    return "unknown";
  }

  function submit(data) {
    const { execution, input, resultMode: requestedResultMode } = data ?? {};
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
      typeof execution?.runId !== "string" ||
      (requestedResultMode !== undefined && requestedResultMode !== "allow_no_update")
    )
      return;
    if (taskMcp && observedTurns.size === 0 && Object.entries(taskMcp.key).some(([key, value]) => (key === "machineId" ? binding.machineId !== value : execution[key] !== value))) return;
    if (!workspaceApproved()) return stop("workspace write approval changed before input");
    if (resume && observedTurns.size === 0) {
      if (execution.dispatchId !== resume.dispatchId) return;
      if (resumeStamp() !== resumedStamp) return stop("resume source changed before the first turn");
    }
    const intent = runFile(execution, "intent");
    if (statSync(path.join(directory, intent + ".json"), { throwIfNoEntry: false })) return;
    resumeTurnOffset = resume ? statSync(resume.file, { throwIfNoEntry: false })?.size : undefined;
    submitted = true;
    executionBinding = execution;
    resultMode = requestedResultMode;
    const inputSha256 = createHash("sha256").update(input).digest("hex");
    const clientUserMessageId = createHash("sha256")
      .update(JSON.stringify([execution, inputSha256]))
      .digest("hex");
    save(intent, { execution, inputSha256, clientUserMessageId, resultMode });
    if (taskMcp && observedTurns.size === 0) save("task-mcp-submitted", { pid: process.pid });
    request("turn/start", { threadId, clientUserMessageId, input: [{ type: "text", text: input }] }, (result) => {
      if (typeof result?.turn?.id !== "string" || !id.test(result.turn.id) || observedTurns.has(result.turn.id)) return stop("turn acceptance is unconfirmed");
      turnId = result.turn.id;
      observedTurns.add(turnId);
      const acceptanceId = createHash("sha256")
        .update(JSON.stringify([threadId, turnId]))
        .digest("hex");
      save(runFile(execution, "receipt"), { id: acceptanceId, execution, inputSha256, nativeTurnId: turnId });
      log("provider accepted the original input");
      publishBoundReports();
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
        const operation = envelope.data?.operation;
        const answerOperation = operation === "answer.submit" || operation === "answer.inspect";
        const stopOperation = operation === "stop.submit" || operation === "stop.inspect";
        if (answerOperation || stopOperation) {
          let status;
          try {
            status = answerOperation ? nativeAnswer(envelope.data) : nativeStop(envelope.data);
          } catch {
            status = "unknown";
            if (operation === "answer.submit") stop("native answer could not be confirmed");
          }
          return socket.end(JSON.stringify({ status, mac: sign(answerOperation ? "answer-response" : "stop-response", [nonce, status]) }) + "\n");
        }
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
  const watchApproval = () => {
    if (!workspaceApproved()) stop("workspace write approval changed");
  };
  // oxlint-disable-next-line huhu-scheduling/no-private-periodic-timer -- 子进程执行期间监控工作区授权撤回，随子进程退出清理。
  const approvalWatch = workspace ? setInterval(watchApproval, 250) : undefined;
  app.once("error", () => stop("App Server unavailable"));
  app.once("close", () => stop("App Server ended"));
  app.stdin.on("error", () => stop("App Server connection lost"));
  createInterface({ input: app.stdout, crlfDelay: Infinity }).on("line", (line) => {
    if (closing) return;
    try {
      const { id: rpcId, method, result, error, params } = JSON.parse(line);
      if (typeof method === "string") {
        if (rpcId !== undefined) {
          if (method !== "item/tool/requestUserInput" || !boundQuestion(rpcId, params)) send({ id: rpcId, error: { code: -32601, message: "This client cannot handle the request" } });
        } else {
          if (resume && !executionBinding && method === "turn/started" && params?.threadId === resume.threadId) return stop("resume produced an unrequested turn");
          nativeNotice(method, params);
        }
        return;
      }
      const accept = pending.get(rpcId);
      if (!accept) return;
      pending.delete(rpcId);
      accept(error === undefined ? result : undefined, error);
    } catch {
      stop("App Server protocol interrupted");
    }
  });
  process.once("SIGTERM", () => stop("session ended"));
  process.once("SIGINT", () => stop("session ended"));
  if (!windows) process.once("SIGHUP", () => stop("session ended"));

  function listenForControl() {
    const socketDir = windows ? undefined : mkdtempSync(path.join(tmpdir(), "huhu-codex-"));
    const socket = socketDir ? path.join(socketDir, "control.sock") : undefined;
    if (socket && Buffer.byteLength(socket) > 103) {
      rmdirSync(socketDir);
      throw new Error("Control socket path is too long");
    }
    server = createServer(authorize);
    if (socketDir) server.once("close", () => rmdirSync(socketDir));
    server.once("error", () => stop("control channel unavailable"));
    server.listen(socket ?? "\\\\.\\pipe\\huhu-codex-" + sign("socket", 1), () => {
      try {
        const history = resume && { historyId: resume.historyId, revision: resume.revision, source: resume.source };
        save("thread", { attempt: config.attempt, threadId, address, pid: process.pid, protocol: 2, ...(socket && { socket }), ...(history && { history }) });
        clearTimeout(startup);
        log("native thread ready");
      } catch {
        stop("thread binding could not be saved");
      }
    });
  }

  function prepareDefaultChoices(cursor, remaining) {
    request("experimentalFeature/list", { threadId, limit: 100, ...(cursor && { cursor }) }, (result) => {
      const feature = Array.isArray(result?.data) ? result.data.find((row) => row?.name === nativeChoiceFeature) : undefined;
      if (!feature && remaining > 1 && validText(result?.nextCursor, 256) && result.nextCursor !== cursor) {
        prepareDefaultChoices(result.nextCursor, remaining - 1);
        return;
      }
      defaultChoices = feature?.enabled === true && feature.stage === "underDevelopment" && feature.defaultEnabled === false;
      listenForControl();
    });
  }

  request("initialize", { clientInfo: { name: "huhu", version: "1" }, capabilities: { experimentalApi: true } }, (result) => {
    if (!result) return stop("App Server handshake rejected");
    send({ method: "initialized", params: {} });
    const settings = {
      cwd: process.cwd(),
      sandbox: workspace ? "workspace-write" : "read-only",
      approvalPolicy: "never",
      ...(config.model ? { model: config.model } : {}),
      ...(config.fast ? { serviceTier: "priority" } : {}),
      ...(config.effort ? { config: { model_reasoning_effort: config.effort } } : {}),
    };
    const ready = (started) => {
      if (!validId(started?.thread?.id)) return stop("thread startup is unconfirmed");
      if (workspace) {
        const sandbox = started.sandbox;
        if (
          !workspaceApproved() ||
          started.approvalPolicy !== "never" ||
          started.thread.cwd !== workspace.root ||
          sandbox?.type !== "workspaceWrite" ||
          sandbox.networkAccess !== false ||
          sandbox.excludeTmpdirEnvVar !== true ||
          sandbox.excludeSlashTmp !== true ||
          !Array.isArray(sandbox.writableRoots) ||
          sandbox.writableRoots.some((root) => root !== workspace.root)
        ) {
          return stop("workspace sandbox is unconfirmed");
        }
      }
      threadId = started.thread.id;
      if (nativeChoiceBridge) prepareDefaultChoices(undefined, 4);
      else listenForControl();
    };
    if (!resume) return request("thread/start", { ...settings, ephemeral: true, ...(nativeChoiceBridge && { experimentalRawEvents: true }) }, ready);
    const sameSource = (thread) =>
      thread?.id === resume.threadId && typeof thread.path === "string" && realpathSync(thread.path) === resume.file && typeof thread.cwd === "string" && path.relative(realpathSync(thread.cwd), resume.cwd) === "";
    request("thread/read", { threadId: resume.threadId, includeTurns: false }, (read) => {
      if (!sameSource(read?.thread) || resumeStamp() !== resume.revision) return stop("resume source is unconfirmed");
      request("thread/resume", { ...settings, threadId: resume.threadId, path: resume.file, excludeTurns: true, deferGoalContinuation: true }, (restored, error) => {
        if (error?.code === -32600 && error.message === `thread ${resume.threadId} already has an active writer`) {
          save("resume-refusal", { attempt: config.attempt, source: resume.source, address, pid: process.pid, reason: "history_writer_busy" });
          return stop("the selected thread has an active writer");
        }
        if (
          !sameSource(restored?.thread) ||
          restored.thread.status?.type !== "idle" ||
          restored.approvalPolicy !== settings.approvalPolicy ||
          restored.sandbox?.type !== "readOnly" ||
          restored.sandbox.networkAccess !== false ||
          (config.model && restored.model !== config.model) ||
          (config.effort && restored.reasoningEffort !== config.effort)
        )
          return stop("resume identity, availability or configuration is unconfirmed");
        resumedStamp = resumeStamp();
        ready(restored);
      });
    });
  });
}

function historyInvocation(command, argv, env, platform = process.platform) {
  const batch = platform === "win32" && /\.(?:cmd|bat)$/i.test(command);
  if (!batch) return { command, argv, env, windowsVerbatimArguments: false };
  if (/["\r\n\0]/.test(command) || argv.some((value) => /[\r\n\0]/.test(value))) throw new Error("Invalid Windows batch arguments for Codex history");
  // Herdr Core's Windows batch_line encoding keeps quotes literal through cmd and the child argv parser.
  // The empty %cd:~,% expansion prevents percent signs in arguments from forming variable references.
  const args = argv.map(
    (value) =>
      '"' +
      value
        .replace(/(\\*)"/g, '$1$1""')
        .replace(/%/g, "%%cd:~,%")
        .replace(/\\+$/, "$&$&") +
      '"',
  );
  const line = ['"%HUHU_HISTORY_COMMAND%"', ...args].join(" ");
  return {
    command: env.ComSpec ?? env.COMSPEC ?? "cmd.exe",
    argv: ["/d", "/s", "/e:on", "/v:off", "/c", `"${line}"`],
    env: { ...env, HUHU_HISTORY_COMMAND: command },
    windowsVerbatimArguments: true,
  };
}

async function openHistory(file) {
  const config = JSON.parse(readFileSync(file, "utf8"));
  const directory = path.dirname(file);
  const address = process.env.HC_TERMINAL_ID;
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const stamp = (location) => {
    const stat = statSync(location, { bigint: true });
    if (!stat.isFile() || realpathSync(location) !== location) throw new Error("File changed");
    return [stat.dev, stat.ino, stat.birthtimeNs, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
  };
  const sameFile = (actual, expected) => typeof actual === "string" && path.isAbsolute(actual) && path.relative(realpathSync(actual), expected) === "";
  const commandTarget = config.commandTarget ?? config.command;
  const commandUnchanged = () => realpathSync(config.command) === commandTarget && stamp(commandTarget) === config.commandStamp;
  const sourceUnchanged = () => {
    if (!commandUnchanged() || stamp(config.helper) !== config.helperStamp || stamp(config.file) !== config.fileStamp || !sameFile(process.cwd(), config.cwd)) {
      throw new Error("History source or launch configuration changed");
    }
  };
  if (
    !address ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(address) ||
    !/^[a-f0-9]{64}$/.test(config.secret) ||
    !uuid.test(config.nativeId) ||
    !["resume", "fork"].includes(config.mode) ||
    config.argv[0] !== "resume" ||
    config.argv[1] !== config.nativeId
  )
    throw new Error("Invalid history request");
  sourceUnchanged();
  const env = { ...process.env, CODEX_HOME: config.profile };
  delete env.ELECTRON_RUN_AS_NODE;
  // Reject invalid TUI arguments before sending any fork request.
  historyInvocation(config.command, config.argv, env);
  const spawnCodex = (args, stdio) => {
    const launch = historyInvocation(config.command, args, env);
    return spawn(launch.command, launch.argv, { cwd: config.cwd, env: launch.env, windowsHide: true, windowsVerbatimArguments: launch.windowsVerbatimArguments, stdio });
  };
  writeFileSync(path.join(directory, "helper-started"), "", { flag: "wx", mode: 0o600, flush: true });
  const app = spawnCodex(["app-server", "--listen", "stdio://"], ["pipe", "pipe", "ignore"]);
  const output = createInterface({ input: app.stdout });
  const pending = new Map();
  let serial = 0;
  const stop = (error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  const ended = new Promise((resolve) => {
    app.once("error", (error) => {
      stop(error);
      resolve();
    });
    app.once("exit", () => {
      stop(new Error("App Server exited"));
      resolve();
    });
  });
  app.stdin.on("error", stop);
  output.on("line", (line) => {
    let response;
    try {
      response = JSON.parse(line);
    } catch {
      return;
    }
    if (!response || typeof response !== "object") return;
    const request = pending.get(response.id);
    if (!request || response.method) return;
    pending.delete(response.id);
    if (response.error || !response.result) request.reject(new Error("Codex rejected the history request"));
    else request.resolve(response.result);
  });
  const send = (message) => app.stdin.write(JSON.stringify(message) + "\n");
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, { resolve, reject });
      send({ id, method, params });
    });
  const timeout = setTimeout(() => stop(new Error("Codex did not confirm the history request")), 15_000);
  let id = config.nativeId;
  let rollout = config.file;
  try {
    await request("initialize", { clientInfo: { name: "huhu", version: "1" }, capabilities: { experimentalApi: true } });
    send({ method: "initialized", params: {} });
    const { thread: source } = await request("thread/read", { threadId: config.nativeId, includeTurns: false });
    if (source?.id?.toLowerCase() !== config.nativeId.toLowerCase() || !sameFile(source.path, config.file) || !sameFile(source.cwd, config.cwd)) throw new Error("Codex resolved a different history source");
    sourceUnchanged();
    if (config.mode === "fork") {
      const { thread } = await request("thread/fork", {
        threadId: config.nativeId,
        path: config.file,
        cwd: config.cwd,
        ephemeral: false,
        excludeTurns: true,
        deferGoalContinuation: true,
      });
      if (
        !uuid.test(thread?.id) ||
        thread.id.toLowerCase() === config.nativeId.toLowerCase() ||
        thread.forkedFromId?.toLowerCase() !== config.nativeId.toLowerCase() ||
        !sameFile(thread.cwd, config.cwd) ||
        !path.isAbsolute(thread.path ?? "")
      )
        throw new Error("Codex did not confirm an independent fork");
      const child = realpathSync(thread.path);
      const relative = path.relative(path.join(config.profile, "sessions"), child);
      if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative) || !path.basename(child).endsWith("-" + thread.id + ".jsonl") || !statSync(child).isFile())
        throw new Error("Codex did not persist the selected fork");
      id = thread.id;
      rollout = child;
    }
  } finally {
    clearTimeout(timeout);
    output.close();
    app.stdin.end();
    const kill = setTimeout(() => app.kill("SIGKILL"), 1500);
    await ended;
    clearTimeout(kill);
  }
  if (config.mode === "resume") sourceUnchanged();
  const data = { attempt: config.attempt, address, pid: process.pid, parent: config.nativeId, source: config.file, id, file: rollout, cwd: config.cwd };
  const mac = createHmac("sha256", Buffer.from(config.secret, "hex"))
    .update(JSON.stringify([config.mode, data]))
    .digest("hex");
  const receipt = path.join(directory, config.mode + ".json");
  writeFileSync(receipt + ".tmp", JSON.stringify({ data, mac }), { flag: "wx", mode: 0o600, flush: true });
  renameSync(receipt + ".tmp", receipt);
  if (!commandUnchanged()) throw new Error("Codex entry point changed before interactive launch");
  const terminal = spawnCodex(["resume", id, ...config.argv.slice(2)], "inherit");
  process.exitCode = await new Promise((resolve, reject) => {
    terminal.once("error", reject);
    terminal.once("exit", (code) => resolve(code ?? 1));
  });
}

module.exports = { createNativeAnswerOutputReader, historyInvocation };
if (require.main === module) {
  if (process.argv[2] === "--history") {
    openHistory(process.argv[3]).catch((error) => {
      writeSync(2, "HUHU Codex: " + (error instanceof Error && !error.code ? error.message : "native history launch unavailable") + "\n");
      process.exitCode = 1;
    });
  } else {
    try {
      main(process.argv[2]);
    } catch {
      process.stderr.write("HUHU Codex: controlled launch unavailable\n");
      process.exitCode = 1;
    }
  }
}
