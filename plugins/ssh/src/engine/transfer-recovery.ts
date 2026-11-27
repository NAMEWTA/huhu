import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { TransferBatch, TransferJob } from "../shared/transfers.js";

const Snapshot = z.object({ vaultInstance: z.string(), jobs: z.array(TransferJob), batches: z.array(TransferBatch) });
type Snapshot = z.infer<typeof Snapshot>;

export class TransferRecovery {
  private readonly temporary: string;
  private warned = false;

  constructor(
    private readonly file: string,
    private readonly vaultInstance: string,
  ) {
    this.temporary = `${file}.tmp`;
  }

  load() {
    try {
      const stat = lstatSync(this.file, { throwIfNoEntry: false });
      if (!stat) return;
      if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error("Invalid transfer recovery file");
      const snapshot = Snapshot.parse(JSON.parse(readFileSync(this.file, "utf8")));
      if (snapshot.vaultInstance === this.vaultInstance) return snapshot;
    } catch {
      this.warn();
    }
  }

  save(snapshot: Pick<Snapshot, "jobs" | "batches">) {
    try {
      mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
      rmSync(this.temporary, { force: true });
      writeFileSync(this.temporary, JSON.stringify({ vaultInstance: this.vaultInstance, ...snapshot }), { mode: 0o600, flag: "wx", flush: true });
      renameSync(this.temporary, this.file);
    } catch {
      this.warn();
    }
  }

  clear() {
    try {
      rmSync(this.file, { force: true });
      rmSync(this.temporary, { force: true });
    } catch {
      this.warn();
    }
  }

  private warn() {
    if (this.warned) return;
    this.warned = true;
    console.warn("SSH 传输中断记录不可用");
  }
}
