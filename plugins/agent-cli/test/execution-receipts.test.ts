import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { execution, nativeQuestion, result } from "../../../packages/contracts/test/fixtures/execution-receipt-v1.js";
import { ExecutionReceipts } from "../src/engine/execution-receipts.js";

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
