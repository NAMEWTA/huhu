"use strict";

const { appendFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { createInterface } = require("node:readline");

const directory = process.argv[2];
const log = (event) => appendFileSync(path.join(directory, "native-events.log"), event + "\n");
const send = (frame) => process.stdout.write(JSON.stringify(frame) + "\n");
const threadId = "thread-" + process.pid;
const turnId = "turn-" + process.pid;

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
      send({ id: 0, method: "item/tool/requestUserInput", params: ask });
      item("foreign-thread", turnId, "foreign-item", "final_answer", "Foreign thread");
      item(threadId, "foreign-turn", "foreign-item", "final_answer", "Foreign turn");
      item(threadId, turnId, "commentary", "commentary", "Partial commentary");
      item(threadId, turnId, "real-final", "final_answer", "Synthetic result from the original turn.");
      log("early-events");
      waitFor("allow-turn-ack", () => send({ id: message.id, result: { turn: { id: turnId } } }));
      waitFor("allow-turn-end", () => {
        send({ method: "serverRequest/resolved", params: { threadId, requestId: 0 } });
        send({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } });
        log("turn-ended");
      });
    } else if (message.id === 0) log("answered-original-question");
  });
}
