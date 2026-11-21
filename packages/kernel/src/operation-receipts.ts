import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { CapabilityResultSchema, HuhuError, type CapabilityResult } from "@huhu/contracts";
import { z } from "zod";
import { canonicalJson } from "./idempotency.js";

const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Identity = z.strictObject({ operationId: z.uuidv4(), key: Hash, input: Hash, owner: z.string(), capability: z.string() });
const Finished = z.enum(["completed", "failed", "invalid-output", "unknown", "paused"]);
const Entry = z.discriminatedUnion("phase", [Identity.extend({ phase: z.literal("accepted") }), Identity.extend({ phase: Finished, result: CapabilityResultSchema })]);
type Entry = z.infer<typeof Entry>;
type Accepted = Extract<Entry, { phase: "accepted" }>;
type Resolved = Exclude<Entry, Accepted>;

const hash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");

export class OperationReceipts {
  private damaged = false;
  private readonly byKey = new Map<string, Entry>();
  private readonly byId = new Map<string, Entry>();

  constructor(private readonly file: string) {
    if (!existsSync(file)) return;
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const item = Entry.parse(JSON.parse(line));
        const old = this.byKey.get(item.key);
        if (!old ? item.phase !== "accepted" : !this.transition(old, item)) throw new Error("Invalid operation transition");
        this.set(item);
      }
    } catch {
      this.damaged = true;
    }
  }

  private transition(old: Entry, item: Entry): boolean {
    if (old.operationId !== item.operationId || old.owner !== item.owner || old.input !== item.input || old.capability !== item.capability) return false;
    return old.phase === "accepted" ? item.phase !== "accepted" : old.phase === "paused" && item.phase === "accepted";
  }

  private set(entry: Entry): void {
    this.byKey.set(entry.key, entry);
    this.byId.set(entry.operationId, entry);
  }

  get available(): boolean {
    return !this.damaged;
  }

  private unavailable() {
    return new HuhuError("INTERNAL", "操作记录需要修复", { retryable: false, details: { outcome: "not-accepted" } });
  }

  private append(entry: Entry): void {
    if (this.damaged) {
      if (entry.phase === "accepted") throw this.unavailable();
      throw new HuhuError("INTERNAL", "操作记录需要修复", { retryable: false, details: { operationId: entry.operationId, outcome: "unknown" } });
    }
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      // A complete last record can survive a crash without its final newline.
      appendFileSync(this.file, "\n" + JSON.stringify(entry) + "\n", { encoding: "utf8", flush: true });
      this.set(entry);
    } catch {
      this.damaged = true;
      const details = entry.phase === "accepted" ? { outcome: "not-accepted" } : { operationId: entry.operationId, outcome: "unknown" };
      throw new HuhuError("INTERNAL", "操作记录无法持久保存", { retryable: false, details });
    }
  }

  claim(owner: string, capability: string, intentKey: string, input: unknown) {
    const key = hash([owner, capability, intentKey]);
    const inputDigest = hash(input);
    const existing = this.byKey.get(key);
    if (existing) return { entry: existing, mismatch: existing.input !== inputDigest, fresh: false };
    if (this.damaged) throw this.unavailable();
    const accepted: Accepted = { operationId: randomUUID(), key, input: inputDigest, owner, capability, phase: "accepted" };
    this.append(accepted);
    return { entry: accepted, mismatch: false, fresh: true };
  }

  complete(entry: Accepted, phase: z.infer<typeof Finished>, result: CapabilityResult<unknown>): Resolved {
    if (this.byId.get(entry.operationId) !== entry) throw new Error("Operation changed before completion");
    const update: Resolved = { ...entry, phase, result };
    this.append(update);
    return update;
  }

  resume(entry: Resolved): Accepted {
    if (entry.phase !== "paused" || this.byId.get(entry.operationId) !== entry) throw new Error("Operation cannot resume");
    const { result: _, ...identity } = entry;
    const accepted = { ...identity, phase: "accepted" as const };
    this.append(accepted);
    return accepted;
  }

  lookup(owner: string, lookup: { operationId: string } | { capability: string; intentKey: string }): Entry | undefined {
    const entry = "operationId" in lookup ? this.byId.get(lookup.operationId) : this.byKey.get(hash([owner, lookup.capability, lookup.intentKey]));
    return entry?.owner === owner ? entry : undefined;
  }
}
