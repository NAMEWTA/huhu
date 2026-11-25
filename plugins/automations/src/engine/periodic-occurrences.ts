import { lstatSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { errors, PlanOccurrenceSchema, type PlanOccurrence } from "@huhu/contracts";
import type { VaultFiles } from "@huhu/vault";

const databaseFile = "automations/periodic-occurrences.sqlite";

/** Keep the occurrence history of short sampling periods in one indexed journal. */
export class PeriodicOccurrences {
  private database?: DatabaseSync;
  private closed = false;

  constructor(private readonly files: VaultFiles) {}

  private open(create = false): DatabaseSync | undefined {
    if (this.closed || this.database) return this.database;
    if (!create && !this.files.exists(databaseFile)) return;
    const file = this.files.abs(databaseFile);
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      const entry = lstatSync(this.files.abs(databaseFile + suffix), { throwIfNoEntry: false });
      if (entry && !entry.isFile()) throw errors.invalidInput("周期发生记录应为普通文件");
    }
    if (create) {
      this.files.assertWritable();
      mkdirSync(path.dirname(file), { recursive: true });
    }
    const database = new DatabaseSync(file, { readOnly: this.files.readOnly });
    try {
      if (!this.files.readOnly) {
        database.exec(`
          CREATE TABLE IF NOT EXISTS occurrences (
            sequence INTEGER PRIMARY KEY,
            id TEXT NOT NULL UNIQUE,
            plan TEXT NOT NULL,
            payload TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS latest_by_plan ON occurrences (plan, sequence DESC);
        `);
      }
      this.database = database;
      return database;
    } catch (error) {
      database.close();
      throw error;
    }
  }

  read(id: string): PlanOccurrence | null {
    const payload = this.open()?.prepare("SELECT payload FROM occurrences WHERE id = ?").get(id)?.["payload"];
    return typeof payload === "string" ? PlanOccurrenceSchema.parse(JSON.parse(payload)) : null;
  }

  latest(planId: string): string | null {
    const id = this.open()?.prepare("SELECT id FROM occurrences WHERE plan = ? ORDER BY sequence DESC LIMIT 1").get(planId)?.["id"];
    return typeof id === "string" ? id : null;
  }

  claim(occurrence: PlanOccurrence): boolean {
    const result = this.open(true)?.prepare("INSERT OR IGNORE INTO occurrences (id, plan, payload) VALUES (?, ?, ?)")
      .run(occurrence.occurrenceId, occurrence.plan.planId, JSON.stringify(occurrence));
    return result !== undefined && result.changes !== 0;
  }

  settle(occurrence: PlanOccurrence): void {
    this.open()?.prepare("UPDATE occurrences SET payload = ? WHERE id = ?")
      .run(JSON.stringify(occurrence), occurrence.occurrenceId);
  }

  close(): void {
    this.closed = true;
    this.database?.close();
    delete this.database;
  }
}
