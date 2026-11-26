import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { execution, nativeQuestion, result } from "../../../packages/contracts/test/fixtures/execution-receipt-v1.js";
import { emptyAgentSettings } from "../src/shared/settings.js";
import { CodexDispatch } from "../src/engine/codex-dispatch.js";
import { ExecutionReceipts } from "../src/engine/execution-receipts.js";
import { launchHash } from "../src/engine/launch-binding.js";
import { answerFingerprint } from "../src/engine/native-answer.js";

test("Agent readback accepts the original W6.0 receipt once and only a matching Tasks ACK ends retry", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-w63-store-"));
  try {
    const scope = { vaultId: execution.vaultId, machineId: execution.sessionBinding.machineId };
    const store = new ExecutionReceipts(dir, scope);
    expect(store.receive({ ...result.receipt, payload: {} }, execution)).toBeUndefined();
    expect(store.receive(result.receipt, { ...execution, runId: "different-run" })).toBeUndefined();
    expect(store.receive({ ...nativeQuestion.receipt, execution: { ...execution, sessionBinding: { ...execution.sessionBinding, nativeSessionId: null } } }, execution)).toBeUndefined();
    expect([...store.pending()]).toEqual([]);
    expect(store.receive(result.receipt, execution)).toEqual(result.agentAck);
    expect(store.receive({ ...result.receipt, payload: { message: "Altered after receipt" } }, execution)).toBeUndefined();
    const reopened = new ExecutionReceipts(dir, scope);
    expect(reopened.receive(result.receipt, execution)).toEqual(result.agentAck);
    const foreign = new ExecutionReceipts(dir, { ...scope, vaultId: "other-vault" });
    expect([...foreign.pending()]).toEqual([]);
    for (const ack of [nativeQuestion.tasksAck, result.agentAck, { ...result.tasksAck, receipt: { ...result.identity, payloadSha256: "0".repeat(64) } }]) {
      reopened.consumed(result.receipt, ack);
      expect([...reopened.pending()]).toEqual([{ receipt: result.receipt, identity: result.identity }]);
    }
    reopened.consumed(result.receipt, result.tasksAck);
    expect([...new ExecutionReceipts(dir, scope).pending()]).toEqual([]);
  } finally {
    if (path.dirname(dir) === tmpdir() && path.basename(dir).startsWith("huhu-w63-store-")) rmSync(dir, { recursive: true, force: true });
  }
});

test("Codex 恢复历史后只以原轮次记录中的同一原生回答确认送达", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-resumed-answer-"));
  try {
    const file = path.join(dir, "rollout.jsonl");
    const prior = '{"type":"event_msg","payload":{"type":"task_complete","turn_id":"earlier-turn"}}\n';
    writeFileSync(file, prior);
    const { dev, ino, birthtimeNs } = statSync(file, { bigint: true });
    const threadId = "01998fe4-0316-7140-97c3-74965ba41745";
    const turnId = "original-turn";
    const callId = "call-original-question";
    const questionId = "choice";
    const attempt = "fixture-launch";
    const binding = { ...execution.sessionBinding, nativeSessionId: threadId };
    const original = { ...execution, sessionBinding: binding };
    const session = { id: binding.sessionId, coreId: binding.coreId, attempt, address: binding.coreAddress, pid: 42 };
    const identity = { vaultId: execution.vaultId, machineId: binding.machineId, sessionId: session.id, coreId: session.coreId, attempt };
    const history = { historyId: "a".repeat(64), revision: "b".repeat(64), source: "c".repeat(64) };
    const codex = new CodexDispatch({ root: dir }, emptyAgentSettings);
    const [, , launch] = codex.start({ node: "node", helper: "helper", command: "codex", args: [], home: dir, fast: false, binaryStamp: "", helperStamp: "", configStamp: null, nativeChoiceBridge: true }, identity);
    const secret = "1".repeat(64);
    writeFileSync(launch!, JSON.stringify({ ...identity, secret, resume: { ...history, threadId, file, cwd: dir, physical: `${dev}:${ino}:${birthtimeNs}`, dispatchId: execution.dispatchId } }));
    const signed = (name: string, data: unknown) => {
      const mac = createHmac("sha256", Buffer.from(secret, "hex")).update(JSON.stringify([name, data])).digest("hex");
      writeFileSync(path.join(path.dirname(launch!), `${name}.json`), JSON.stringify({ data, mac }));
    };
    signed("thread", { attempt, threadId, address: session.address, pid: session.pid, protocol: 2, history });
    const scope = [original.vaultId, original.taskId, original.runId, original.attempt, original.dispatchId, binding.machineId, binding.sessionId, binding.coreId, binding.coreAddress, binding.processGeneration, binding.provider, threadId];
    signed(`run-${launchHash(scope)}-completed`, { threadId, turnId, status: "completed" });
    const reply = { execution: original, requestId: "original-question", requestVersion: 1, nativeRequestId: "original-request", replyId: "reply-original", answer: "Circle" };
    const fingerprint = answerFingerprint(reply);
    const writeTurn = (id: string, answer: string, tool = "request_user_input") => {
      const output = JSON.stringify({ answers: { [questionId]: { answers: [answer] } } });
      const records = [
        { type: "event_msg", payload: { type: "task_started", turn_id: id } },
        { type: "response_item", payload: { type: "function_call", call_id: callId, name: tool } },
        { type: "response_item", payload: { type: "function_call_output", call_id: callId, output: [{ type: "input_text", text: output }] } },
        { type: "event_msg", payload: { type: "task_complete", turn_id: id } },
      ];
      writeFileSync(file, prior + records.map((record) => JSON.stringify(record) + "\n").join(""));
    };
    writeTurn(turnId, reply.answer);
    expect(codex.answerAccepted(reply, session)).toBe(false);
    signed(`answer-resolved-${fingerprint}`, { fingerprint, turnId, itemId: callId, questionId, offset: Buffer.byteLength(prior) });
    writeTurn("different-turn", reply.answer);
    expect(codex.answerAccepted(reply, session)).toBe(false);
    writeTurn(turnId, "Square");
    expect(codex.answerAccepted(reply, session)).toBe(false);
    writeTurn(turnId, reply.answer, "different_tool");
    expect(codex.answerAccepted(reply, session)).toBe(false);
    writeTurn(turnId, reply.answer);
    expect(codex.answerAccepted(reply, session)).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
