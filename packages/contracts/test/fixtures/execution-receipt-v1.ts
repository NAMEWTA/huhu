import type { ExecutionBinding, ExecutionReceipt, ExecutionReceiptAck, ExecutionReceiptIdentity, TasksReceiptConsumption } from "../../src/index.js";

export const execution: ExecutionBinding = {
  vaultId: "vault-fixture-1",
  taskId: "task-fixture-1",
  runId: "run-fixture-1",
  attempt: 2,
  dispatchId: "dispatch-fixture-1",
  sessionBinding: {
    machineId: "machine-fixture-1",
    sessionId: "session-fixture-1",
    coreId: "core-fixture-1",
    coreAddress: "t7",
    processGeneration: "process-fixture-2",
    provider: "codex",
    nativeSessionId: "native-fixture-1",
  },
};

function fixture<T extends ExecutionReceipt>(receipt: T, payloadSha256: string) {
  const identity: ExecutionReceiptIdentity = { version: 1, receiptId: receipt.receiptId, execution, payloadSha256 };
  return {
    receipt,
    identity,
    agentAck: { stage: "agent_received", receipt: identity } satisfies ExecutionReceiptAck,
    tasksAck: { stage: "tasks_consumed", receipt: identity } satisfies ExecutionReceiptAck,
    consumption: {
      execution,
      delivery: { receipt: identity, deliveryId: `delivery-${receipt.receiptId}`, messageId: `message-${receipt.receiptId}` },
    } satisfies TasksReceiptConsumption,
  };
}

export const result = fixture({ version: 1, receiptId: "receipt-result-1", execution, kind: "result", payload: { message: "Synthetic task complete." } }, "61947ed56f86f77ea8ea71c74705c0955e0e124461ad07b0a32f4f67b7d7d9f7");

export const question = fixture(
  {
    version: 1,
    receiptId: "receipt-question-1",
    execution,
    kind: "question",
    payload: { mode: "normal", requestId: "request-fixture-1", requestVersion: 1, text: "Which option should be used?", options: ["Keep", "Replace"] },
  },
  "7c06ea5b0d80ae627b5f88edb793edb6e7bbcfbea43886efe5461a07427bd3da",
);

export const nativeQuestion = fixture(
  {
    version: 1,
    receiptId: "receipt-native-question-1",
    execution,
    kind: "question",
    payload: {
      mode: "native_deferred",
      requestId: "request-fixture-2",
      requestVersion: 2,
      text: "Continue this turn?",
      options: [],
      nativeRequestId: "native-request-fixture-1",
    },
  },
  "c0142f20a745fa97231ce252b642852203dad2f8d8dc0a65d88dcfce397ff7b1",
);
