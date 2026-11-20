import { randomUUID } from "node:crypto";
import { linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ExecutionReceiptAckSchema, ExecutionReceiptIdentitySchema, ExecutionReceiptSchema, type ExecutionBinding, type ExecutionReceipt, type ExecutionReceiptAck } from "@huhu/contracts";
import { createExecutionReceiptAck, validateExecutionReceipt, validateExecutionReceiptAck } from "@huhu/contracts/execution-receipt/engine";
import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { AgentDispatchStore } from "./dispatch-store.js";
import { launchHash } from "./launch-binding.js";
import type { SessionsService } from "./sessions.js";

export const TASKS_RECEIPTS_CONSUME = "tasks.receipts.consume";
const Stored = z.strictObject({ receipt: ExecutionReceiptSchema, identity: ExecutionReceiptIdentitySchema });
type Stored = z.infer<typeof Stored>;

function readReceiptFile<T>(file: string, schema: z.ZodType<T>): T | undefined {
  try {
    return schema.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Keep original receipts immutable and publish ACKs atomically. */
export function putReceiptFile(file: string, value: unknown, replace = false): void {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { flag: "wx", flush: true, mode: 0o600 });
  try {
    if (replace) renameSync(temporary, file);
    else linkSync(temporary, file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    rmSync(temporary, { force: true });
  }
}

export class ExecutionReceipts {
  constructor(
    private readonly directory: string,
    private readonly scope: { vaultId: string; machineId: string },
  ) {}

  private file(id: string): string {
    return path.join(this.directory, launchHash(id) + ".json");
  }

  private read(file: string): Stored | undefined {
    const saved = readReceiptFile(file, Stored);
    if (!saved) return undefined;
    const { execution } = saved.identity;
    if (
      this.file(saved.receipt.receiptId) !== file ||
      execution.vaultId !== this.scope.vaultId ||
      execution.sessionBinding.machineId !== this.scope.machineId ||
      validateExecutionReceipt(saved.receipt, execution, saved.identity).status !== "duplicate"
    ) {
      throw new Error("Invalid durable execution receipt");
    }
    return saved;
  }

  receive(input: unknown, expected: ExecutionBinding): ExecutionReceiptAck | undefined {
    if (expected.vaultId !== this.scope.vaultId || expected.sessionBinding.machineId !== this.scope.machineId) return undefined;
    const initial = validateExecutionReceipt(input, expected);
    if (initial.status === "rejected") return undefined;
    const file = this.file(initial.receipt.receiptId);
    const prior = this.read(file);
    if (!prior) putReceiptFile(file, { receipt: initial.receipt, identity: initial.identity });
    const decision = createExecutionReceiptAck(initial.receipt, "agent_received", this.read(file)?.receipt);
    return decision.status === "ack" ? decision.ack : undefined;
  }

  *pending(): Iterable<Stored> {
    let files: string[];
    try {
      files = readdirSync(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const name of files.filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).sort()) {
      try {
        const file = path.join(this.directory, name);
        const saved = this.read(file);
        if (!saved) continue;
        let ack: ExecutionReceiptAck | undefined;
        try {
          ack = readReceiptFile(file + ".tasks-ack", ExecutionReceiptAckSchema);
        } catch {
          // A damaged ACK cannot establish consumption.
        }
        if (!validateExecutionReceiptAck(ack, "tasks_consumed", saved.identity)) yield saved;
      } catch {
        // Preserve unreadable records for repair and keep other receipts moving.
      }
    }
  }

  consumed(receipt: ExecutionReceipt, reply: unknown): void {
    const file = this.file(receipt.receiptId);
    const current = this.read(file);
    if (!current || validateExecutionReceipt(receipt, current.identity.execution, current.identity).status !== "duplicate") return;
    if (validateExecutionReceiptAck(reply, "tasks_consumed", current.identity)) putReceiptFile(file + ".tasks-ack", reply, true);
  }
}

export function pollExecutionReceipts(api: HuhuApi, dispatches: AgentDispatchStore, sessions: SessionsService, receipts: ExecutionReceipts, signal: AbortSignal, interval: number): () => void {
  let running = false;
  async function drain() {
    if (running || signal.aborted) return;
    running = true;
    try {
      for (const record of dispatches.nativeInputs()) {
        signal.throwIfAborted();
        try {
          for (const report of sessions.nativeReports(record.execution, record.inputSha256)) {
            try {
              const ack = receipts.receive(report.receipt, record.execution);
              if (ack) report.acknowledge(ack);
            } catch {
              // A lost or refused first ACK is retried from the helper's report.
            }
          }
        } catch {
          // An unreadable binding cannot accept another execution's reports.
        }
      }
      for (const { receipt } of receipts.pending()) {
        signal.throwIfAborted();
        try {
          const ack = await api.call(TASKS_RECEIPTS_CONSUME, receipt, { idempotencyKey: randomUUID(), signal });
          signal.throwIfAborted();
          receipts.consumed(receipt, ack);
        } catch {
          // An unavailable consumer or a lost ACK leaves the original receipt pending.
        }
      }
    } catch {
      // A plugin stop or an unavailable local directory can be reconciled on the next start or poll.
    } finally {
      running = false;
    }
  }
  void drain();
  const timer = setInterval(() => void drain(), interval);
  return () => clearInterval(timer);
}
