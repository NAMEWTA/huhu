import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const auditRecordSchema = z.object({
  at: z.string(), entry: z.string(), capability: z.string(), code: z.string(), ms: z.number(),
  mcp: z.object({
    operation: z.string(), requestId: z.string(), subject: z.string(), session: z.string(), result: z.string().optional(),
    sourceId: z.string().optional(), sourceName: z.string().optional(),
    upstreamEntry: z.string().optional(), publicEntry: z.string().optional(),
    catalogRevision: z.number().optional(), configRevision: z.number().optional(),
  }).optional(),
});
export type AuditRecord = z.infer<typeof auditRecordSchema>;

const MAX_RECORDS = 500;

/** Metadata for external calls. Parameters and results are never stored. */
export class GatewayAudit {
  private records: AuditRecord[] = [];

  constructor(private readonly file?: string) {
    if (file && existsSync(file)) {
      this.records = readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .flatMap((l) => {
          try {
            return [JSON.parse(l) as AuditRecord];
          } catch {
            return [];
          }
        })
        .slice(-MAX_RECORDS);
    }
  }

  add(r: AuditRecord): void {
    this.records.push(r);
    const overflow = this.records.length > MAX_RECORDS;
    if (overflow) this.records = this.records.slice(-MAX_RECORDS);
    if (this.file) {
      mkdirSync(path.dirname(this.file), { recursive: true });
      if (overflow) writeFileSync(this.file, this.records.map((x) => JSON.stringify(x)).join("\n") + "\n");
      else appendFileSync(this.file, JSON.stringify(r) + "\n");
    }
  }

  list(): AuditRecord[] {
    return [...this.records];
  }

  clear(): void {
    this.records = [];
    if (this.file && existsSync(this.file)) writeFileSync(this.file, "");
  }
}
