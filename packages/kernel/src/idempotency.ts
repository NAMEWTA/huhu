import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CapabilityResult } from "@huhu/contracts";

const WINDOW_MS = 24 * 3600 * 1000;

interface Entry {
  k: string;
  h: string;
  at: number;
  result: CapabilityResult<unknown>;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** 24 小时窗口内的幂等记录；内存 + 可选 ndjson 持久化。 */
export class IdempotencyStore {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly file?: string, private readonly now: () => number = Date.now) {
    if (file && existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line) as Entry;
          if (this.now() - e.at < WINDOW_MS) this.entries.set(e.k, e);
        } catch {
          // 损坏的行（崩溃时的半行）直接忽略
        }
      }
    }
  }

  static hashInput(input: unknown): string {
    return createHash("sha256").update(canonicalJson(input)).digest("hex").slice(0, 16);
  }

  lookup(caller: string, capability: string, key: string, input: unknown): { hit: false } | { hit: true; mismatch: boolean; result: CapabilityResult<unknown> } {
    const e = this.entries.get(`${caller}|${capability}|${key}`);
    if (!e || this.now() - e.at >= WINDOW_MS) return { hit: false };
    return { hit: true, mismatch: e.h !== IdempotencyStore.hashInput(input), result: e.result };
  }

  record(caller: string, capability: string, key: string, input: unknown, result: CapabilityResult<unknown>): void {
    const e: Entry = { k: `${caller}|${capability}|${key}`, h: IdempotencyStore.hashInput(input), at: this.now(), result };
    this.entries.set(e.k, e);
    if (this.file) {
      mkdirSync(path.dirname(this.file), { recursive: true });
      appendFileSync(this.file, JSON.stringify(e) + "\n");
    }
  }
}
