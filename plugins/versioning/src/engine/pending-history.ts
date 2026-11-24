import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HuhuError } from "@huhu/contracts";
import { normalizeRelPath, readAsset, versionOf, type VaultFiles } from "@huhu/vault";
import { z } from "zod";
import { HISTORY_MAX_BYTES, historyPathSupported, type FileHistory } from "./history.js";

const revision = z.strictObject({
  id: z.uuidv4(),
  version: z.string().regex(/^[a-f0-9]{16}$/),
  bytes: z.string().max(Math.ceil(HISTORY_MAX_BYTES / 3) * 4),
  executable: z.boolean(),
  source: z.enum(["edit", "external"]),
});
const journal = z.strictObject({ format: z.literal(1), path: z.string(), rows: z.array(revision).min(1) });
type Revision = z.infer<typeof revision>;
type Pending = {
  rows: Revision[];
  recover: Set<string>;
  dirty?: boolean;
  timer?: ReturnType<typeof setTimeout> | undefined;
  processing?: Promise<void> | undefined;
};
type Failure = (id: string, title: string) => void;
const retryDelayMs = 10_000;
const pathKey = (rel: string) => createHash("sha256").update(rel).digest("hex");

/** Owns the debounce timer and the durable bytes until their Git commit has been acknowledged. */
export class PendingHistory {
  private readonly pending = new Map<string, Pending>();
  private readonly directory: string;
  private closing = false;

  constructor(private readonly files: VaultFiles, stateDir: string, private readonly history: FileHistory, private readonly debounceMs: number, private readonly notify: Failure) {
    this.directory = path.relative(files.root, path.join(stateDir, "history", "pending")).split(path.sep).join("/");
    if (!files.readOnly) this.recover();
  }

  observe(rel: string, source: Revision["source"], saved?: Uint8Array): void {
    if (this.closing || this.files.readOnly) return;
    const id = randomUUID();
    try {
      const file = normalizeRelPath(rel);
      if (!historyPathSupported(file)) return;
      const stat = statSync(this.files.abs(file), { throwIfNoEntry: false });
      if (saved === undefined && (!stat?.isFile() || stat.size > HISTORY_MAX_BYTES)) return;
      const bytes = saved === undefined ? readAsset(this.files.root, file, 0, HISTORY_MAX_BYTES, undefined, HISTORY_MAX_BYTES).bytes : Buffer.from(saved);
      if (bytes.length > HISTORY_MAX_BYTES) return;
      const version = versionOf(bytes);
      const executable = !!stat && (stat.mode & 0o100) !== 0;
      const slot: Pending = this.pending.get(file) ?? { rows: [], recover: new Set<string>() };
      const last = slot.rows.at(-1);
      if (last?.version === version && last.executable === executable) return;
      const entry = { id, version, bytes: bytes.toString("base64"), executable, source };
      // Collapse consecutive edits during the debounce window only. Once submitted,
      // the original intent is kept until Git and the journal agree on its outcome.
      const coalesce = !slot.processing && last?.source === source && !slot.recover.has(last.id);
      const rows = [...(coalesce ? slot.rows.slice(0, -1) : slot.rows), entry];
      slot.rows = rows;
      slot.dirty = true;
      this.pending.set(file, slot);
      try {
        this.persist(file, rows);
        slot.dirty = false;
        this.schedule(file, slot, this.debounceMs);
      } catch {
        this.failed(id, `无法保存待记录的文件版本：${file}`);
        this.schedule(file, slot, retryDelayMs);
      }
    } catch {
      this.failed(id, `无法保存待记录的文件版本：${rel}`);
    }
  }

  async drainPath(rel: string): Promise<void> {
    const file = normalizeRelPath(rel);
    const slot = this.pending.get(file);
    if (!slot) return;
    clearTimeout(slot.timer);
    await this.flush(file, slot);
    if (slot.rows.length) throw new HuhuError("INTERNAL", "此文件有待重试的历史版本", { retryable: true });
  }

  async close(): Promise<void> {
    this.closing = true;
    for (const slot of this.pending.values()) clearTimeout(slot.timer);
    await Promise.all([...this.pending].map(([rel, slot]) => slot.processing ?? this.flush(rel, slot)));
    await this.history.idle();
  }

  private persist(rel: string, rows: Revision[]): void {
    const file = this.files.abs(`${this.directory}/${pathKey(rel)}.json`);
    if (!rows.length) {
      rmSync(file, { force: true });
      return;
    }
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify({ format: 1, path: rel, rows }), { flag: "wx", mode: 0o600, flush: true });
      renameSync(temporary, file);
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  private recover(): void {
    let names: string[];
    try {
      names = readdirSync(this.files.abs(this.directory));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.failed("journal", "无法读取待记录的文件版本");
      return;
    }
    for (const name of names) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      try {
        const recovered = journal.parse(JSON.parse(readFileSync(this.files.abs(`${this.directory}/${name}`), "utf8")));
        const rel = normalizeRelPath(recovered.path);
        if (!historyPathSupported(rel) || name !== `${pathKey(rel)}.json`) throw new Error("Invalid history journal identity");
        const slot = { rows: recovered.rows, recover: new Set(recovered.rows.map(({ id }) => id)) };
        this.pending.set(rel, slot);
        this.schedule(rel, slot, 0);
      } catch {
        this.failed(name, "待记录的文件版本无法核对");
      }
    }
  }

  private schedule(rel: string, slot: Pending, delay: number): void {
    if (this.closing) return;
    clearTimeout(slot.timer);
    slot.timer = setTimeout(() => {
      slot.timer = undefined;
      void this.flush(rel, slot);
    }, delay);
    slot.timer.unref();
  }

  private flush(rel: string, slot: Pending): Promise<void> {
    if (slot.processing) return slot.processing;
    slot.processing = this.record(rel, slot).finally(() => {
      slot.processing = undefined;
    });
    return slot.processing;
  }

  private async record(rel: string, slot: Pending): Promise<void> {
    while (slot.rows.length) {
      const current = slot.rows[0]!;
      try {
        if (slot.dirty) {
          this.persist(rel, slot.rows);
          slot.dirty = false;
        }
        const bytes = Buffer.from(current.bytes, "base64");
        if (bytes.length > HISTORY_MAX_BYTES || versionOf(bytes) !== current.version) throw new Error("Invalid history revision");
        await this.history.recordRevision(rel, bytes, current.executable, current.source, current.id, slot.recover.has(current.id));
        const rows = slot.rows.slice(1);
        this.persist(rel, rows);
        slot.rows = rows;
        slot.dirty = false;
        slot.recover.delete(current.id);
      } catch {
        slot.recover.add(current.id);
        this.failed(current.id, `文件历史待重试：${rel}`);
        this.schedule(rel, slot, retryDelayMs);
        return;
      }
    }
    clearTimeout(slot.timer);
    this.pending.delete(rel);
  }

  private failed(id: string, title: string): void {
    try {
      this.notify(`ntf-history-${id}`, title);
    } catch {
      // A failed notification store must not interrupt close or a committed editor save.
    }
  }
}
