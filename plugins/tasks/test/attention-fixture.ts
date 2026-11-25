import { randomUUID } from "node:crypto";
import { newId, type ExecutionBinding, type ExecutionReceipt, type TaskDto } from "@huhu/contracts";
import { machineId, type VaultFiles } from "@huhu/vault";
import { DispatchStore, eventIdOf, fingerprint, type DispatchSnapshot } from "../src/engine/dispatch-store.js";
import { TaskReceiptInbox } from "../src/engine/receipt-inbox.js";

export async function seedAttentionQuestion(files: VaultFiles, vaultId: string, task: TaskDto) {
  const target = task.execution;
  if (!target?.spaceId || !target.provider) throw new Error("待回答夹具需要已配置执行目标的 Agent 任务");
  const now = new Date();
  const at = now.toISOString();
  const device = machineId();
  const dispatchId = randomUUID();
  const runId = newId("run", now.getTime());
  const requestId = "attention-question";
  const text = "确认原任务的问题";
  const source = { kind: "desktop" } as const;
  const input = { taskId: task.id, dispatchId, inputRevision: task.inputRevision, inputHash: task.inputHash, expectedVersion: task.version };
  const snapshot: DispatchSnapshot = {
    taskId: input.taskId,
    inputRevision: input.inputRevision,
    inputHash: input.inputHash,
    expectedVersion: input.expectedVersion,
    taskVersion: task.version,
    body: task.body,
    references: task.references.filter(({ from }) => from === "task").map(({ path }) => path),
    execution: target,
    source,
  };
  const execution: ExecutionBinding = {
    vaultId,
    taskId: task.id,
    dispatchId,
    runId,
    attempt: 1,
    sessionBinding: { machineId: device, sessionId: "attention-session", coreId: "fixture-core", coreAddress: "t9", processGeneration: runId, provider: target.provider, nativeSessionId: null },
  };
  const store = new DispatchStore(files, vaultId, device);
  const inbox = new TaskReceiptInbox(
    files,
    () => now,
    () => {},
  );
  try {
    await store.create({
      receipt: { taskId: task.id, dispatchId, eventId: eventIdOf(dispatchId), runId, attempt: 1, acceptedAt: at, state: "running", reason: null, cancelRequested: false },
      snapshot,
      requestHash: fingerprint({ input, source }),
      snapshotHash: fingerprint(snapshot),
      claim: { at, machineId: device },
      boundExecution: execution,
      startedAt: at,
      finishedAt: null,
    });
    const receipt: ExecutionReceipt = { version: 1, receiptId: randomUUID(), execution, kind: "question", payload: { mode: "normal", requestId, requestVersion: 1, text, options: [] } };
    await inbox.consume(receipt, execution, new AbortController().signal, false);
    return { runId, requestId, text };
  } finally {
    inbox.close();
    store.close();
  }
}
