"use strict";

const { appendFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { createInterface } = require("node:readline");

const directory = process.argv[2];
const log = (event) => appendFileSync(path.join(directory, "native-events.log"), event + "\n");
const send = (frame) => process.stdout.write(JSON.stringify(frame) + "\n");
const threadId = "thread-" + process.pid;
const turnId = "turn-" + process.pid;
const answerFixture = existsSync(path.join(directory, "native-answer-fixture"));

function waitFor(file, fn) {
  const timer = setInterval(() => {
    if (!existsSync(path.join(directory, file))) return;
    clearInterval(timer);
    fn();
  }, 25);
}

if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.171.0\n");
} else {
  createInterface({ input: process.stdin }).on("line", (line) => {
    const message = JSON.parse(line);
    if (message.method === "initialize") send({ id: message.id, result: {} });
    else if (message.method === "thread/start") send({ id: message.id, result: { thread: { id: threadId } } });
    else if (message.method === "turn/start") {
      log("turn-input");
      const question = {
        id: "choice",
        header: "Fixture shape",
        question: "Choose a fixture shape",
        options: [
          { label: "Circle", description: "" },
          { label: "Square", description: "" },
        ],
      };
      const ask = { threadId, turnId, itemId: "fixture-question", isBlocking: true, questions: [question] };
      const item = (thread, turn, id, phase, text) => send({ method: "item/completed", params: { threadId: thread, turnId: turn, item: { id, type: "agentMessage", phase, text } } });
      send({ id: 1, method: "item/tool/requestUserInput", params: { ...ask, threadId: "foreign-thread" } });
      send({ id: 2, method: "item/tool/requestUserInput", params: { ...ask, turnId: "foreign-turn" } });
      send({ id: "secret", method: "item/tool/requestUserInput", params: { ...ask, questions: [{ ...question, isSecret: true }] } });
      send({ id: "free-text", method: "item/tool/requestUserInput", params: { ...ask, questions: [{ ...question, isOther: true }] } });
      if (answerFixture) send({ id: "previous", method: "item/tool/requestUserInput", params: { ...ask, itemId: "older-question", questions: [{ ...question, question: "Older fixture question" }] } });
      send({ id: 0, method: "item/tool/requestUserInput", params: ask });
      item("foreign-thread", turnId, "foreign-item", "final_answer", "Foreign thread");
      item(threadId, "foreign-turn", "foreign-item", "final_answer", "Foreign turn");
      item(threadId, turnId, "commentary", "commentary", "Partial commentary");
      item(threadId, turnId, "real-final", "final_answer", "Synthetic result from the original turn.");
      log("early-events");
      waitFor("allow-turn-ack", () => send({ id: message.id, result: { turn: { id: turnId } } }));
      if (answerFixture) {
        waitFor("ask-canceled", () => send({ id: "canceled", method: "item/tool/requestUserInput", params: { ...ask, itemId: "canceled-question", questions: [{ ...question, question: "Canceled fixture question" }] } }));
        waitFor("cancel-question", () => {
          send({ method: "serverRequest/resolved", params: { threadId, requestId: "canceled" } });
          log("canceled-question-resolved");
        });
      }
      waitFor("allow-turn-end", () => {
        send({ method: "serverRequest/resolved", params: { threadId, requestId: 0 } });
        send({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } });
        log("turn-ended");
      });
    } else if (message.result?.answers || message.id === 0) {
      if (message.id === 0) log("answered-original-question");
      if (!answerFixture) return;
      log(JSON.stringify({ nativeAnswer: message }));
      if (message.id !== 0) return;
      const output = (method, thread, turn, item) => send({ method, params: { threadId: thread, turnId: turn, item } });
      const consumed = { type: "functionCallOutput", id: "fixture-question", name: "request_user_input", output: JSON.stringify(message.result) };
      waitFor("resolve-without-proof", () => {
        send({ method: "serverRequest/resolved", params: { threadId, requestId: 0 } });
        output("item/completed", "foreign-thread", turnId, consumed);
        output("item/completed", threadId, "foreign-turn", consumed);
        output("item/completed", threadId, turnId, { ...consumed, id: "older-question" });
        output("item/completed", threadId, turnId, { ...consumed, output: JSON.stringify({ answers: { choice: { answers: ["Wrong"] } } }) });
        log("resolution-without-proof");
      });
      waitFor("allow-answer-proof", () => {
        output("rawResponseItem/completed", threadId, turnId, { type: "function_call_output", call_id: "fixture-question", name: "request_user_input", output: [{ type: "input_text", text: consumed.output }] });
        log("original-answer-output");
      });
    }
  });
}
