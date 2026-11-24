import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CapabilityResultSchema, HuhuError, type CapabilityResult } from "@huhu/contracts";
import { z } from "zod";

const WINDOW_MS = 24 * 3600 * 1000;
const PRUNE_INTERVAL_MS = 60_000;
const COMPACT_AFTER_STALE_ROWS = 256;
const Identity = z.object({ k: z.string().min(1), h: z.string().regex(/^[0-9a-f]{16}$/), at: z.number().finite() });
const Receipt = Identity.extend({ result: CapabilityResultSchema });
const JournalRow = z.union([Identity.extend({ released: z.literal(true) }), Receipt]);
type Receipt = z.infer<typeof Receipt>;
type JournalRow = z.infer<typeof JournalRow>;

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Ordinary idempotency leases expire 24 hours after admission or the last saved result. */
export class IdempotencyStore {
  private readonly entries = new Map<string, Receipt>();
  private needsRewrite = false;
  private damaged = false;
  private rows = 0;
  private expiredOnDisk = false;
  private nextPrune: number;
  private nextCompaction = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly file?: string,
    private readonly now: () => number = Date.now,
  ) {
    const nowMs = this.now();
    this.nextPrune = nowMs + PRUNE_INTERVAL_MS;
    if (!file) return;
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (error) {
      this.damaged = (error as NodeJS.ErrnoException).code !== "ENOENT";
      return;
    }

    const lines = text.split("\n");
    // A complete record can survive the loss of only its separator. An incomplete
    // final record can be discarded, preserving all complete admissions before it.
    this.needsRewrite = text.length > 0 && !text.endsWith("\n");
    for (const [index, line] of lines.entries()) {
      if (!line.trim()) continue;
      try {
        const row = JournalRow.parse(JSON.parse(line));
        this.rows++;
        this.entries.delete(row.k);
        if ("released" in row) continue;
        if (this.expired(row, nowMs)) this.expiredOnDisk = true;
        else this.entries.set(row.k, row);
      } catch {
        // An invalid complete line may hide a prior acceptance. Leave the original
        // file intact and reject new claims while serving the receipts we can read.
        if (index !== lines.length - 1 || !this.needsRewrite) this.damaged = true;
      }
    }
  }

  static hashInput(input: unknown): string {
    return createHash("sha256").update(canonicalJson(input)).digest("hex").slice(0, 16);
  }

  lookup(caller: string, capability: string, key: string, input: unknown): { hit: false } | { hit: true; mismatch: boolean; result: CapabilityResult<unknown> } {
    const nowMs = this.now();
    this.prune(nowMs);
    const id = `${caller}|${capability}|${key}`;
    const entry = this.entries.get(id);
    if (!entry) return { hit: false };
    if (this.expired(entry, nowMs)) {
      this.entries.delete(id);
      this.expiredOnDisk = true;
      return { hit: false };
    }
    return { hit: true, mismatch: entry.h !== IdempotencyStore.hashInput(input), result: entry.result };
  }

  /** Persist the stable key before any of its effects can run. */
  accept(caller: string, capability: string, key: string, input: unknown): CapabilityResult<never> {
    const result: CapabilityResult<never> = {
      ok: false,
      error: new HuhuError("INTERNAL", "调用结果待核实", { retryable: false, details: { outcome: "unknown", verification: "receipt-not-confirmed" } }).toJSON(),
    };
    this.record(caller, capability, key, input, result);
    return result;
  }

  record(caller: string, capability: string, key: string, input: unknown, result: CapabilityResult<unknown>): void {
    const receipt = { ...this.identity(caller, capability, key, input), result };
    this.append(receipt);
    this.entries.set(receipt.k, receipt);
  }

  /** A confirmed retryable result releases the accepted key on disk as well. */
  release(caller: string, capability: string, key: string, input: unknown): void {
    const release = { ...this.identity(caller, capability, key, input), released: true as const };
    this.append(release);
    this.entries.delete(release.k);
  }

  private identity(caller: string, capability: string, key: string, input: unknown): z.infer<typeof Identity> {
    return { k: `${caller}|${capability}|${key}`, h: IdempotencyStore.hashInput(input), at: this.now() };
  }

  private expired(row: Receipt, nowMs: number): boolean {
    return nowMs - row.at >= WINDOW_MS;
  }

  private prune(nowMs: number): void {
    if (nowMs < this.nextPrune) return;
    this.nextPrune = nowMs + PRUNE_INTERVAL_MS;
    for (const [key, receipt] of this.entries) {
      if (!this.expired(receipt, nowMs)) continue;
      this.entries.delete(key);
      this.expiredOnDisk = true;
    }
  }

  private append(row: JournalRow): void {
    this.prune(row.at);
    if (!this.file) return;
    if (this.damaged) throw new Error("幂等记录需要修复");
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      if (this.needsRewrite || (this.expiredOnDisk && row.at >= this.nextCompaction) || this.rows > this.entries.size * 2 + COMPACT_AFTER_STALE_ROWS) {
        this.compact(this.file);
        this.nextCompaction = row.at + PRUNE_INTERVAL_MS;
      }
      appendFileSync(this.file, JSON.stringify(row) + "\n", { flush: true, mode: 0o600 });
      this.rows++;
    } catch (error) {
      // After an ambiguous append, only a restart that loads and verifies the
      // journal may admit another key. Outstanding accepted keys stay in memory.
      this.damaged = true;
      throw error;
    }
  }

  private compact(file: string): void {
    const regular = [...this.entries.values()].map((entry) => JSON.stringify(entry) + "\n").join("");
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, regular, { flag: "wx", flush: true, mode: 0o600 });
      renameSync(temporary, file);
    } finally {
      rmSync(temporary, { force: true });
    }
    this.rows = this.entries.size;
    this.needsRewrite = false;
    this.expiredOnDisk = false;
  }
}
