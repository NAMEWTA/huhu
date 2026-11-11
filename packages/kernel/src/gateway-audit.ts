import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface AuditRecord {
  at: string;
  entry: string;
  capability: string;
  code: string;
  ms: number;
}

const MAX_RECORDS = 500;

/** 外部入口调用记录：只含时间、入口、能力、结果码、耗时，不含输入。 */
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
