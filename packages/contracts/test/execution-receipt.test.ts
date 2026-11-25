import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createExecutionReceiptAck, executionReceiptIdentity, validateExecutionReceipt, validateExecutionReceiptAck } from "@huhu/contracts/execution-receipt/engine";
import { describe, expect, test } from "vitest";
import { appendComment, buildTaskBody, parseTaskBody } from "../../vault/src/markdown/regions.js";
import { ExecutionReceiptSchema, NativeStopIdSchema, TasksReceiptConsumptionSchema, TaskStopReceiptSchema, toJsonSchema, type ExecutionBinding, type ExecutionReceiptAckStage } from "../src/index.js";
import { execution, invalidCommentMessageIds, nativeQuestion, question, questionSchemaCases, result, utf8CommentMessageIds } from "./fixtures/execution-receipt-v1.js";

const fixtures = [result, question, nativeQuestion];

test("native stop and Tasks share a UTF-8 stable stop identity and a redacted receipt", () => {
  const at = "2026-11-25T00:00:00.000Z";
  const receipt = { taskId: "task-1", dispatchId: "dispatch-1", runId: "run-1", stopId: "停止🙂", status: "stopped", acceptedAt: at, updatedAt: at };
  expect(TaskStopReceiptSchema.parse(receipt)).toEqual(receipt);
  expect(TaskStopReceiptSchema.safeParse({ ...receipt, toolOwner: "local-owner" }).success).toBe(false);
  for (const stopId of [" ", "坏\ud800", "\udfff"]) {
    expect(NativeStopIdSchema.safeParse(stopId).success).toBe(false);
    expect(TaskStopReceiptSchema.safeParse({ ...receipt, stopId }).success).toBe(false);
  }
});

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

  test.each(questionSchemaCases)("validates $name", ({ receipt, valid }) => {
    expect(ExecutionReceiptSchema.safeParse(receipt).success).toBe(valid);
  });

  test("publishes distinct native and normal question bindings in the project JSON Schema", () => {
    const { anyOf } = toJsonSchema(ExecutionReceiptSchema) as { anyOf: Array<{ properties: { payload: { properties?: { mode?: { const: string } } } } }> };
    for (const [mode, nativeSessionId] of [
      ["native_deferred", { type: "string" }],
      ["normal", { anyOf: expect.arrayContaining([{ type: "null" }]) }],
    ]) {
      const branch = anyOf.find(({ properties }) => properties.payload.properties?.mode?.const === mode);
      expect(branch).toMatchObject({
        properties: {
          kind: { const: "question" },
          execution: { properties: { sessionBinding: { properties: { nativeSessionId }, required: expect.arrayContaining(["nativeSessionId"]) } } },
        },
      });
    }
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

describe("Tasks delivery message ID", () => {
  const { receipt, consumption } = result;
  const taskBody = buildTaskBody("Synthetic task");
  const comment = { at: "2026-11-20T00:00:00Z", source: "agent", body: receipt.payload.message } as const;

  test.each(invalidCommentMessageIds)("keeps delivery pending when Markdown rewrites the %s in an ID", (_name, messageId) => {
    const delivery = { ...consumption.delivery, messageId };
    const written = appendComment(taskBody, { ...comment, id: messageId });
    const comments = parseTaskBody(written.body).comments;
    expect(comments).toHaveLength(1);
    expect(comments[0]?.id).not.toBe(messageId);
    expect(createExecutionReceiptAck(receipt, "tasks_consumed", receipt, { ...consumption, delivery })).toEqual({ status: "pending", reason: "missing_durable_consumption" });
  });

  test.each(["", "u"])("exports message ID patterns that match UTF-8 readback (regex flags: %j)", (flags) => {
    const schema = toJsonSchema(TasksReceiptConsumptionSchema) as { properties: { delivery: { properties: { messageId: { allOf: Array<{ pattern: string }> } } } } };
    const patterns = schema.properties.delivery.properties.messageId.allOf.map(({ pattern }) => new RegExp(pattern, flags));
    for (const { name, messageId, readbackId } of utf8CommentMessageIds) {
      expect(
        patterns.every((pattern) => pattern.test(messageId)),
        name,
      ).toBe(messageId === readbackId);
    }
  });

  test.each(utf8CommentMessageIds)(
    "checks ACK and comment retry after UTF-8 disk readback for $name",
    ({ messageId, readbackId }) => {
      const directory = mkdtempSync(resolve(".receipt-fixture-"));
      const markdown = resolve(directory, "task.md");
      const projection = journal(directory, "delivery.json");
      const record = { ...consumption, delivery: { ...consumption.delivery, messageId } };
      const canDeduplicate = messageId === readbackId;

      try {
        projection.save(record);
        const reloaded = projection.read() as typeof record;
        expect(reloaded).toEqual(record);

        const first = appendComment(taskBody, { ...comment, id: messageId });
        expect(first.added).toBe(true);
        writeFileSync(markdown, Buffer.from(first.body), { flag: "wx", flush: true });
        const persistedBody = readFileSync(markdown).toString("utf8");
        const readback = parseTaskBody(persistedBody);
        expect(readback.problems).toEqual([]);
        expect(readback.comments.map(({ id, source }) => ({ id, source }))).toEqual([{ id: readbackId, source: "agent" }]);

        const retry = appendComment(persistedBody, { ...comment, id: reloaded.delivery.messageId });
        expect(retry.added).toBe(!canDeduplicate);
        if (canDeduplicate) expect(retry.body).toBe(persistedBody);

        expect(TasksReceiptConsumptionSchema.safeParse(reloaded).success).toBe(canDeduplicate);
        const expected = canDeduplicate ? { status: "ack", ack: result.tasksAck } : { status: "pending", reason: "missing_durable_consumption" };
        expect(createExecutionReceiptAck(receipt, "tasks_consumed", receipt, reloaded)).toEqual(expected);
      } finally {
        if (projection.pending()) projection.release();
        if (existsSync(markdown)) unlinkSync(markdown);
        rmdirSync(directory);
      }
    },
    30_000,
  );
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
