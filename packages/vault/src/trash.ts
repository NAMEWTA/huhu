import { randomBytes, randomUUID } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { errors } from "@huhu/contracts";
import { OperationLog, type OpRecord, type OpStep } from "./operations.js";
import { normalizeRelPath } from "./paths.js";
import { HUHU_DIR } from "./vault.js";
import { publicationIdentity, type VaultFiles } from "./write.js";

export interface TrashMeta {
  trashId: string;
  originalPath: string;
  noteId: string | null;
  deletedAt: string;
  layout?: 2;
  /** Relative to the original entry. The empty string represents the entry itself. */
  documents?: Record<string, string>;
  folders?: string[];
}

const TRASH = `${HUHU_DIR}/trash`;
const RETIRED = `${HUHU_DIR}/trash-retired`;
const validId = (id: string) => /^trash-[0-9a-z]+$/.test(id);
const entryPath = (id: string) => `${TRASH}/${id}`;

type TrashEntry = { meta: TrashMeta; payload: string; directory: boolean };
type MoveOptions = Pick<TrashMeta, "documents" | "folders"> & { steps?: OpStep[]; expectedVersion?: string };

/** Metadata and payload use separate names. Visibility follows the payload's committed move. */
export class Trash {
  constructor(
    private readonly files: VaultFiles,
    private readonly now: () => Date = () => new Date(),
    private readonly operations = new OperationLog(files, path.join(files.root, HUHU_DIR, "operations")),
  ) {}

  async moveIn(rel: string, noteId: string | null = null, options: MoveOptions = {}): Promise<TrashMeta> {
    this.files.assertWritable();
    rel = normalizeRelPath(rel);
    if (!this.files.exists(rel)) throw errors.notFound(`文件不存在：${rel}`);
    const trashId = `trash-${this.now().getTime().toString(36)}${randomBytes(8).toString("hex")}`;
    const entry = entryPath(trashId);
    const { documents, folders, steps = [], expectedVersion } = options;
    const meta: TrashMeta = {
      trashId,
      originalPath: rel,
      noteId,
      deletedAt: this.now().toISOString(),
      layout: 2,
      ...(documents !== undefined && { documents }),
      ...(folders !== undefined && { folders }),
    };
    await this.operations.run(trashId, "trash", [
      { action: "write", path: `${entry}/meta.json`, expectedVersion: null, bytes: Buffer.from(JSON.stringify(meta, null, 2)) },
      ...steps,
      { action: "rename", from: rel, path: `${entry}/payload/entry`, ...(expectedVersion !== undefined && { expectedVersion }) },
    ]);
    return meta;
  }

  private read(trashId: string): TrashEntry | null {
    if (!validId(trashId)) return null;
    const entry = entryPath(trashId);
    try {
      const meta = JSON.parse(readFileSync(this.files.abs(`${entry}/meta.json`), "utf8")) as TrashMeta;
      if (meta.trashId !== trashId || typeof meta.originalPath !== "string" || normalizeRelPath(meta.originalPath) !== meta.originalPath) return null;
      const name = path.posix.basename(meta.originalPath);
      // A legacy item with the metadata name has no distinguishable payload.
      if (meta.layout !== 2 && name.toLowerCase() === "meta.json") return null;
      const payload = meta.layout === 2 ? `${entry}/payload/entry` : `${entry}/${name}`;
      const parts = path.posix.parse(payload);
      const info = lstatSync(path.join(this.files.abs(parts.dir), parts.base), { throwIfNoEntry: false });
      return info ? { meta, payload, directory: info.isDirectory() } : null;
    } catch {
      return null;
    }
  }

  list(): TrashMeta[] {
    const dir = this.files.abs(TRASH);
    if (!lstatSync(dir, { throwIfNoEntry: false })) return [];
    return readdirSync(dir).flatMap((id) => {
      const found = this.read(id);
      return found ? [found.meta] : [];
    });
  }

  get(trashId: string): { meta: TrashMeta; directory: boolean } {
    if (!validId(trashId)) throw errors.invalidInput("回收站条目 id 无效");
    const found = this.read(trashId);
    if (!found) throw errors.notFound("回收站条目不存在或无法核实载荷");
    return found;
  }

  async restore(trashId: string, newPath?: string, steps: OpStep[] = []): Promise<string> {
    this.files.assertWritable();
    const entry = this.read(trashId);
    if (!entry) throw errors.notFound("回收站条目不存在或无法核实载荷");
    const target = newPath ?? entry.meta.originalPath;
    if (this.files.exists(target)) throw errors.nameConflict(target);
    await this.retire(trashId, "restore", [...steps, { action: "rename", from: entry.payload, path: target }]);
    return target;
  }

  async deletePermanent(trashId: string, steps: OpStep[] = []): Promise<void> {
    this.files.assertWritable();
    if (!validId(trashId)) throw errors.invalidInput("回收站条目 id 无效");
    if (!this.files.exists(entryPath(trashId))) return;
    await this.retire(trashId, "purge", steps);
  }

  private async retire(trashId: string, action: "restore" | "purge", steps: OpStep[]): Promise<void> {
    const opId = `trash-${action}-${trashId}-${randomUUID()}`;
    const op = await this.operations.run(opId, `trash-${action}`, [...steps, { action: "rename", from: entryPath(trashId), path: `${RETIRED}/${opId}` }]);
    this.clearRetired(op);
  }

  private clearRetired(op: OpRecord): void {
    const last = op.steps.at(-1);
    if (
      op.state !== "committed" ||
      (op.kind !== "trash-restore" && op.kind !== "trash-purge") ||
      !last?.done ||
      last.action !== "rename" ||
      last.path !== `${RETIRED}/${op.opId}` ||
      !last.from?.startsWith(`${TRASH}/`) ||
      !last.renameIdentity
    ) return;
    try {
      this.files.guardSynchronousCommit([last.path]);
      const absolute = this.files.abs(last.path);
      const stat = lstatSync(absolute, { bigint: true, throwIfNoEntry: false });
      if (stat?.isDirectory() && publicationIdentity(stat) === last.renameIdentity) rmSync(absolute, { recursive: true });
    } catch {
      // The committed entry is already absent from Trash. Retry its cleanup on startup.
    }
  }

  cleanupRetired(): void {
    this.files.assertWritable();
    for (const op of this.operations.list()) this.clearRetired(op);
  }
}
