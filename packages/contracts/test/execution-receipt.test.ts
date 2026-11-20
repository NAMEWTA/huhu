import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  ExecutionReceiptSchema,
  TasksReceiptConsumptionSchema,
  createExecutionReceiptAck,
  executionReceiptIdentity,
  validateExecutionReceipt,
  validateExecutionReceiptAck,
  type ExecutionBinding,
  type ExecutionReceiptAckStage,
} from "../src/index.js";
import { execution, nativeQuestion, question, result } from "./fixtures/execution-receipt-v1.js";

const fixtures = [result, question, nativeQuestion];

describe("execution receipt v1", () => {
  test.each(fixtures)("$receipt.kind $receipt.receiptId has a fixed identity", ({ receipt, identity }) => {
    expect(validateExecutionReceipt(receipt, execution)).toEqual({ status: "new", receipt, identity });
    expect(validateExecutionReceipt(JSON.parse(JSON.stringify(receipt)), execution, identity)).toEqual({ status: "duplicate", receipt, identity });
  });

  test("object key order is irrelevant while choice order, kind and text matter", () => {
    const { receipt, identity } = question;
    const payload = Object.fromEntries(Object.entries(receipt.payload).reverse());
    expect(validateExecutionReceipt({ ...receipt, payload }, execution, identity).status).toBe("duplicate");
    const rejected = { status: "rejected", reason: "receipt_conflict" };
    expect(validateExecutionReceipt({ ...receipt, payload: { ...receipt.payload, options: ["Replace", "Keep"] } }, execution, identity)).toEqual(rejected);
    expect(validateExecutionReceipt({ ...result.receipt, kind: "progress" }, execution, result.identity)).toEqual(rejected);
    expect(validateExecutionReceipt({ ...result.receipt, payload: { message: "Synthetic task complete. " } }, execution, result.identity)).toEqual(rejected);
  });

  const otherBindings: [string, ExecutionBinding][] = [
    ["Vault", { ...execution, vaultId: "vault-other" }],
    ["task", { ...execution, taskId: "task-other" }],
    ["run", { ...execution, runId: "run-other" }],
    ["attempt", { ...execution, attempt: execution.attempt + 1 }],
    ["dispatch", { ...execution, dispatchId: "dispatch-other" }],
    ...Object.entries(execution.sessionBinding).map(([key]): [string, ExecutionBinding] => [key, { ...execution, sessionBinding: { ...execution.sessionBinding, [key]: "other" } }]),
  ];

  test.each(otherBindings)("rejects another %s in a receipt or ACK", (_name, alternate) => {
    expect(validateExecutionReceipt({ ...result.receipt, execution: alternate }, execution, result.identity)).toEqual({ status: "rejected", reason: "binding_mismatch" });
    const receipt = { ...result.identity, execution: alternate };
    expect(validateExecutionReceiptAck({ ...result.agentAck, receipt }, "agent_received", result.identity)).toBe(false);
    expect(validateExecutionReceiptAck({ ...result.tasksAck, receipt }, "tasks_consumed", result.identity)).toBe(false);
  });

  test("rejects unsupported versions and payloads with fields from another kind", () => {
    for (const invalid of [
      { ...result.receipt, version: 2 },
      { ...result.receipt, execution: { ...execution, attempt: 0 } },
      { ...result.receipt, kind: "no_update" },
      { ...result.receipt, payload: { ...result.receipt.payload, exitCode: 0 } },
      { ...nativeQuestion.receipt, payload: { ...nativeQuestion.receipt.payload, nativeRequestId: undefined } },
      { ...nativeQuestion.receipt, execution: { ...execution, sessionBinding: { ...execution.sessionBinding, nativeSessionId: null } } },
      { ...question.receipt, payload: { ...question.receipt.payload, requestVersion: 0 } },
      { ...question.receipt, payload: { ...question.receipt.payload, nativeRequestId: "forbidden" } },
    ]) {
      expect(validateExecutionReceipt(invalid, execution)).toEqual({ status: "rejected", reason: "invalid_receipt" });
    }
    expect(ExecutionReceiptSchema.safeParse({ ...result.receipt, kind: "no_update", payload: {} }).success).toBe(true);
    expect(ExecutionReceiptSchema.safeParse({ ...result.receipt, kind: "failed", payload: { code: "provider_failed", message: "Synthetic failure" } }).success).toBe(true);
    expect(validateExecutionReceiptAck({ ...result.agentAck, receipt: { ...result.identity, version: 2 } }, "agent_received", result.identity)).toBe(false);
    expect(validateExecutionReceiptAck({ ...result.tasksAck, receipt: { ...result.identity, receiptId: "receipt-other" } }, "tasks_consumed", result.identity)).toBe(false);
    expect(validateExecutionReceiptAck({ ...result.tasksAck, receipt: { ...result.identity, payloadSha256: question.identity.payloadSha256 } }, "tasks_consumed", result.identity)).toBe(false);
    expect(validateExecutionReceiptAck(result.agentAck, "tasks_consumed", result.identity)).toBe(false);
    expect(validateExecutionReceiptAck(result.tasksAck, "agent_received", result.identity)).toBe(false);
  });

  test("ACK issuance requires matching readback including original payload and delivery reconstruction data", () => {
    const { receipt, identity, consumption } = result;
    const changed = { ...receipt, payload: { message: "Different result under the same ID" } };
    for (const stored of [undefined, identity, { persisted: true }, changed, { ...receipt, version: 2 }]) {
      expect(createExecutionReceiptAck(receipt, "agent_received", stored)).toEqual({ status: "pending", reason: "missing_durable_receipt" });
      expect(createExecutionReceiptAck(receipt, "tasks_consumed", stored, consumption)).toEqual({ status: "pending", reason: "missing_durable_receipt" });
    }
    for (const stored of [
      undefined,
      { execution },
      { ...consumption, execution: { ...execution, attempt: 1 } },
      { ...consumption, delivery: { ...consumption.delivery, receipt: question.identity } },
      { ...consumption, delivery: { ...consumption.delivery, messageId: "" } },
    ]) {
      expect(createExecutionReceiptAck(receipt, "tasks_consumed", receipt, stored)).toEqual({ status: "pending", reason: "missing_durable_consumption" });
    }
  });
});

// Each operation opens the file afresh. The driver never passes a sender's in-memory data as receiver readback.
function journal(directory: string, name: string) {
  const file = resolve(directory, name);
  return {
    read: (): unknown => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined),
    save: (value: unknown) => writeFileSync(file, JSON.stringify(value), { flag: "wx", flush: true }),
    pending: () => existsSync(file),
    release: () => unlinkSync(file),
  };
}

function releaseOnAck(outbox: ReturnType<typeof journal>, stage: ExecutionReceiptAckStage, ack: unknown) {
  const pending = ExecutionReceiptSchema.parse(outbox.read());
  if (validateExecutionReceiptAck(ack, stage, executionReceiptIdentity(pending))) outbox.release();
}

test.each(fixtures)(
  "$receipt.receiptId replays across both persistent handoffs",
  ({ receipt, identity, agentAck, tasksAck, consumption }) => {
    const directory = mkdtempSync(resolve(".receipt-fixture-"));
    const adapter = journal(directory, "adapter-outbox.json");
    const accepted = journal(directory, "agent-received.json");
    const pending = journal(directory, "agent-outbox.json");
    const original = journal(directory, "tasks-receipt.json");
    const projection = journal(directory, "tasks-delivery.json");

    try {
      adapter.save(receipt);
      expect(createExecutionReceiptAck(receipt, "agent_received", accepted.read()).status).toBe("pending");
      expect(adapter.pending()).toBe(true);

      const initial = validateExecutionReceipt(adapter.read(), execution);
      expect(initial).toEqual({ status: "new", receipt, identity });
      accepted.save(receipt);
      pending.save(receipt);
      expect(createExecutionReceiptAck(receipt, "agent_received", accepted.read())).toEqual({ status: "ack", ack: agentAck });
      expect(adapter.pending()).toBe(true); // Drop the first Agent ACK.

      const acceptedAfterReload = ExecutionReceiptSchema.parse(journal(directory, "agent-received.json").read());
      expect(validateExecutionReceipt(adapter.read(), execution, executionReceiptIdentity(acceptedAfterReload))).toEqual({ status: "duplicate", receipt, identity });
      const agentReply = createExecutionReceiptAck(receipt, "agent_received", acceptedAfterReload);
      expect(agentReply).toEqual({ status: "ack", ack: agentAck });
      releaseOnAck(adapter, "agent_received", agentReply.status === "ack" ? agentReply.ack : undefined);
      expect(adapter.pending()).toBe(false);
      releaseOnAck(pending, "tasks_consumed", agentAck);
      expect(pending.pending()).toBe(true);

      expect(validateExecutionReceipt(pending.read(), execution)).toEqual({ status: "new", receipt, identity });
      expect(createExecutionReceiptAck(receipt, "tasks_consumed", original.read(), projection.read()).status).toBe("pending");
      original.save(receipt);
      expect(createExecutionReceiptAck(receipt, "tasks_consumed", original.read(), projection.read()).status).toBe("pending");
      expect(pending.pending()).toBe(true);

      projection.save(consumption);
      expect(createExecutionReceiptAck(receipt, "tasks_consumed", original.read(), projection.read())).toEqual({ status: "ack", ack: tasksAck });
      expect(pending.pending()).toBe(true); // Drop the first Tasks ACK.

      const tasksReceiptAfterReload = ExecutionReceiptSchema.parse(journal(directory, "tasks-receipt.json").read());
      const deliveryAfterReload = TasksReceiptConsumptionSchema.parse(journal(directory, "tasks-delivery.json").read());
      const agentOutboxAfterReload = journal(directory, "agent-outbox.json");
      expect(validateExecutionReceipt(agentOutboxAfterReload.read(), execution, executionReceiptIdentity(tasksReceiptAfterReload))).toEqual({ status: "duplicate", receipt, identity });
      expect({ ...deliveryAfterReload.delivery, payload: tasksReceiptAfterReload.payload }).toEqual({ ...consumption.delivery, payload: receipt.payload });
      const tasksReply = createExecutionReceiptAck(receipt, "tasks_consumed", tasksReceiptAfterReload, deliveryAfterReload);
      expect(tasksReply).toEqual({ status: "ack", ack: tasksAck });
      releaseOnAck(agentOutboxAfterReload, "tasks_consumed", tasksReply.status === "ack" ? tasksReply.ack : undefined);
      expect(agentOutboxAfterReload.pending()).toBe(false);
      expect(original.read()).toEqual(receipt);
    } finally {
      for (const entry of [adapter, accepted, pending, original, projection]) if (entry.pending()) entry.release();
      rmdirSync(directory);
    }
  },
  30_000,
);
