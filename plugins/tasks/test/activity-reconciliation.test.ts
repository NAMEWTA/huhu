import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TaskExecutionSchema, type ExecutionBinding, type ExecutionReceipt } from "@huhu/contracts";
import { executionReceiptIdentity } from "@huhu/contracts/execution-receipt/engine";
import { machineId, VaultFiles } from "@huhu/vault";
import { assert, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { TaskDispatch } from "../src/engine/dispatch.js";
import { DispatchStore, eventIdOf, fingerprint, type DispatchSnapshot } from "../src/engine/dispatch-store.js";

const fixture = vi.hoisted(() => ({ errors: [] as unknown[] }));
vi.mock("@huhu/plugin-tasks/engine", async (original) => {
  const tasks = await original<typeof import("../src/engine/index.js")>();
  return {
    ...tasks,
    apply: ((ctx, api, options) => tasks.apply(ctx, api, {
      ...options, dispatchCheckMs: 3_600_000, dispatchExecutor: null, onError: (error) => fixture.errors.push(error),
    })) satisfies typeof tasks.apply,
  };
});

const at = "2026-11-25T00:00:00.000Z";
const inputHash = "0000000000000000";
const active = 2;
const measuredFiles = /^tasks\/(dispatches|receipts|native-replies)\//;

type ActivitySample = { reads: number; readBytes: number; cpuMs: number; checkMs: number; responseMs: number; rssBytes: number };

function summarize(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  return { median: sorted[Math.ceil(sorted.length / 2) - 1]!, p95: sorted[Math.ceil(sorted.length * 0.95) - 1]! };
}

async function seed(engine: RunningEngine, closed: number) {
  const files = new VaultFiles(engine.vault.stateDir);
  const device = machineId();
  const store = new DispatchStore(files, engine.vault.id, device);
  mkdirSync(files.abs("tasks/receipts"), { recursive: true });
  for (let index = 0; index < closed + active; index++) {
    const taskId = `task-fixture${index.toString(36)}`;
    const dispatchId = `dispatch-fixture-${index}`;
    const runId = `run-fixture${index.toString(36)}`;
    const input = { taskId, dispatchId, inputRevision: 1, inputHash, expectedVersion: "fixture" };
    const source = { kind: "automation", ruleId: "rule-fixture", ruleVersion: "fixture", occurrenceId: dispatchId } as const;
    const snapshot: DispatchSnapshot = {
      taskId, inputRevision: 1, inputHash, expectedVersion: "fixture", taskVersion: "fixture",
      body: "Benchmark input", references: [], execution: TaskExecutionSchema.parse({ spaceId: "space-fixture", provider: "codex" }), source,
    };
    const execution: ExecutionBinding = { vaultId: engine.vault.id, taskId, dispatchId, runId, attempt: 1, sessionBinding: {
      machineId: device, sessionId: `session-${index}`, coreId: "fixture-core", coreAddress: "t2", processGeneration: runId, provider: "codex", nativeSessionId: null,
    } };
    await store.create({
      receipt: { taskId, dispatchId, eventId: eventIdOf(dispatchId), runId, attempt: 1, acceptedAt: at, state: "running", reason: null, cancelRequested: false },
      snapshot, requestHash: fingerprint({ input, source }), snapshotHash: fingerprint(snapshot),
      claim: { at, machineId: device }, boundExecution: execution, startedAt: at, finishedAt: null,
    });
    if (index >= closed) continue;
    const receipt: ExecutionReceipt = { version: 1, receiptId: `result-${index}`, execution, kind: "result", payload: { message: "Benchmark result" } };
    const key = fingerprint(receipt.receiptId);
    const consumption = { execution, delivery: { receipt: executionReceiptIdentity(receipt), deliveryId: `delivery-${key}`, messageId: `receipt-${key}` } };
    writeFileSync(files.abs(`tasks/receipts/${key}.json`), JSON.stringify({ format: 1, receipt, consumption, at, status: "delivered" }));
  }
  return store;
}

test.runIf(process.env["HUHU_F11_BENCH"] === "1")("activity reconciliation against 0, 1000 and 10000 concluded dispatches", { timeout: 180_000 }, async () => {
  for (const closed of [0, 1_000, 10_000]) {
    const root = mkdtempSync(path.join(tmpdir(), "huhu-f11-activity-"));
    let engine: RunningEngine | undefined;
    let startup: Promise<void> | undefined;
    const realCheck = TaskDispatch.prototype.check;
    const check = vi.spyOn(TaskDispatch.prototype, "check").mockImplementation(function (this: TaskDispatch) {
      return (startup = realCheck.call(this));
    });
    try {
      engine = await boot({ vaultPath: root, create: true });
      await startup;
      await engine.shutdown();
      const seedStore = await seed(engine, closed);
      // Indexing implementations may attach a watcher while populating the fixture.
      Reflect.get(seedStore, "close")?.call(seedStore);
      startup = undefined;
      engine = await boot({ vaultPath: root });
      await startup;
      const runtime = check.mock.contexts.at(-1);
      assert(runtime);
      const warmStart = performance.now();
      await realCheck.call(runtime);
      const warmedMs = performance.now() - warmStart;
      const traces: ActivitySample[] = [];
      for (let repeat = 0; repeat < 5; repeat++) {
        const originalRead = VaultFiles.prototype.read;
        let reads = 0;
        let readBytes = 0;
        const probe = vi.spyOn(VaultFiles.prototype, "read").mockImplementation(function (this: VaultFiles, input) {
          const result = originalRead.call(this, input);
          if (result && measuredFiles.test(input)) {
            reads++;
            readBytes += result.bytes.byteLength;
          }
          return result;
        });
        try {
          const requestAt = performance.now();
          const response = fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
            method: "POST", headers: { authorization: `Bearer ${engine.rendererToken}`, "content-type": "application/json" },
            body: JSON.stringify({ capability: "tasks.dispatch.resources", input: {}, requestId: randomUUID(), idempotencyKey: randomUUID() }),
          }).then(async (r) => ({ body: await r.json(), ms: performance.now() - requestAt }));
          const cpu = process.cpuUsage();
          const now = performance.now();
          await realCheck.call(runtime);
          const checkMs = performance.now() - now;
          const used = process.cpuUsage(cpu);
          const http = await response;
          expect(http.body).toMatchObject({ ok: true, data: { vault: { active, pending: 0, unknown: 0 } } });
          traces.push({ reads, readBytes, cpuMs: (used.user + used.system) / 1000, checkMs, responseMs: http.ms, rssBytes: process.memoryUsage.rss() });
        } finally {
          probe.mockRestore();
        }
      }
      expect(fixture.errors).toEqual([]);
      const summary = {
        reads: summarize(traces.map(({ reads }) => reads)),
        readBytes: summarize(traces.map(({ readBytes }) => readBytes)),
        checkMs: summarize(traces.map(({ checkMs }) => checkMs)),
        responseMs: summarize(traces.map(({ responseMs }) => responseMs)),
        peakSampleRssBytes: Math.max(...traces.map(({ rssBytes }) => rssBytes)),
      };
      console.info("F11", JSON.stringify({ closed, active, warmedMs, correct: true, summary, traces }));
      if (process.env["HUHU_F11_ASSERT_ACTIVITY"] === "1") expect(Math.max(...traces.map(({ reads }) => reads))).toBeLessThan(25);
    } finally {
      check.mockRestore();
      await startup;
      await engine?.shutdown();
      rmSync(root, { recursive: true, force: true, maxRetries: 5 });
    }
  }
});
