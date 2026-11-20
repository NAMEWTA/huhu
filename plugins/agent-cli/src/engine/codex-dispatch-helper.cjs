"use strict";

const { spawn } = require("node:child_process");
const { createHash, createHmac, timingSafeEqual } = require("node:crypto");
const { readFileSync, renameSync, statSync, writeFileSync } = require("node:fs");
const { createServer } = require("node:net");
const path = require("node:path");
const { createInterface } = require("node:readline");

const validText = (value, limit) => typeof value === "string" && value.length <= limit && /\S/.test(value) && value.isWellFormed();

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

  const nativeChoiceFeature = "default_mode_request_user_input";
  const nativeChoiceBridge = config.nativeChoiceBridge === true;
  const choiceArgs = nativeChoiceBridge ? ["--enable", nativeChoiceFeature] : [];
  const app = spawn(config.command, [...config.args, ...choiceArgs, "--config", "mcp_servers={}", "--config", 'web_search="disabled"', "--disable", "shell_tool", "app-server", "--listen", "stdio://"], {
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
  let defaultChoices = false;
  let turnId;
  let executionBinding;
  let stopRequest;
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
    clearTimeout(startup);
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
    const status = completed.get(turnId);
    if (!status) {
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
    if (status === "completed" && final) report(final.source, { message: final.text });
    save(runFile(executionBinding, "completed"), { threadId, turnId, status });
    log("original turn ended");
    submitted = false;
    turnId = undefined;
    executionBinding = undefined;
    stopRequest = undefined;
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

  function nativeNotice(method, params) {
    if (!submitted || params?.threadId !== threadId) return;
    if (method === "serverRequest/resolved") {
      questions.delete(params.requestId);
      const answer = submittedAnswers.get(params.requestId);
      if (!answer) return;
      answer.resolved = true;
      confirmAnswer(answer);
      return;
    }
    recordAnswerOutput(readAnswerOutput(method, params, threadId, turnId));
    if (method === "item/completed" && validId(params.turnId) && (turnId ? params.turnId === turnId : !observedTurns.has(params.turnId))) {
      const item = params.item;
      if (item?.type !== "agentMessage" || item.phase !== "final_answer" || !validId(item.id) || !validText(item.text, 64_000)) return;
      const prior = finals.get(params.turnId);
      if (prior === undefined && finals.size < 32) finals.set(params.turnId, { source: { kind: "result", threadId, turnId: params.turnId, itemId: item.id }, text: item.text });
      else if (prior && (prior.source.itemId !== item.id || prior.text !== item.text)) finals.set(params.turnId, null);
    } else if (method === "turn/completed" && validId(params.turn?.id) && (turnId ? params.turn.id === turnId : !observedTurns.has(params.turn.id))) {
      const { id: completedId, status } = params.turn;
      if (["completed", "failed", "interrupted"].includes(status) && completed.size < 32) completed.set(completedId, status);
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
    const intent = runFile(execution, "intent");
    if (statSync(path.join(directory, intent + ".json"), { throwIfNoEntry: false })) return;
    submitted = true;
    executionBinding = execution;
    const inputSha256 = createHash("sha256").update(input).digest("hex");
    const clientUserMessageId = createHash("sha256")
      .update(JSON.stringify([execution, inputSha256]))
      .digest("hex");
    save(intent, { execution, inputSha256, clientUserMessageId });
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
        } else nativeNotice(method, params);
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

  function listenForControl() {
    server = createServer(authorize);
    server.once("error", () => stop("control channel unavailable"));
    server.listen("\\\\.\\pipe\\huhu-codex-" + sign("socket", 1), () => {
      try {
        save("thread", { attempt: config.attempt, threadId, address, pid: process.pid, protocol: 2 });
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
    request(
      "thread/start",
      {
        cwd: process.cwd(),
        ephemeral: true,
        sandbox: "read-only",
        approvalPolicy: "never",
        ...(nativeChoiceBridge && { experimentalRawEvents: true }),
        ...(config.model ? { model: config.model } : {}),
        ...(config.fast ? { serviceTier: "priority" } : {}),
        ...(config.effort ? { config: { model_reasoning_effort: config.effort } } : {}),
      },
      (started) => {
        if (typeof started?.thread?.id !== "string" || !id.test(started.thread.id)) return stop("thread startup is unconfirmed");
        threadId = started.thread.id;
        if (nativeChoiceBridge) prepareDefaultChoices(undefined, 4);
        else listenForControl();
      },
    );
  });
}

module.exports = { createNativeAnswerOutputReader };
if (require.main === module) {
  try {
    main(process.argv[2]);
  } catch {
    process.stderr.write("HUHU Codex: controlled launch unavailable\n");
    process.exitCode = 1;
  }
}
