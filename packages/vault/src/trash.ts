import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { errors } from "@huhu/contracts";
import { HUHU_DIR } from "./vault.js";
import type { VaultFiles } from "./write.js";

export interface TrashMeta {
  trashId: string;
  originalPath: string;
  noteId: string | null;
  deletedAt: string;
}

function assertTrashId(id: string): void {
  if (!/^trash-[0-9a-z]+$/.test(id)) throw errors.invalidInput("回收站条目 id 无效");
}

/** 回收站：文件移到 `.huhu/trash/<trashId>/`，meta.json 记录来源；恢复时目标已存在则拒绝（不覆盖）。 */
export class Trash {
  constructor(private readonly files: VaultFiles, private readonly now: () => Date = () => new Date()) {}

  private dir(): string {
    return path.join(this.files.root, HUHU_DIR, "trash");
  }

  moveIn(rel: string, noteId: string | null = null): TrashMeta {
    this.files.assertWritable();
    const abs = this.files.abs(rel);
    if (!existsSync(abs)) throw errors.notFound(`文件不存在：${rel}`);
    const trashId = `trash-${this.now().getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const dest = path.join(this.dir(), trashId);
    mkdirSync(dest, { recursive: true });
    const meta: TrashMeta = { trashId, originalPath: rel, noteId, deletedAt: this.now().toISOString() };
    try {
      renameSync(abs, path.join(dest, path.basename(rel)));
    } catch {
      cpSync(abs, path.join(dest, path.basename(rel)));
      rmSync(abs);
    }
    writeFileSync(path.join(dest, "meta.json"), JSON.stringify(meta, null, 2));
    return meta;
  }

  list(): TrashMeta[] {
    if (!existsSync(this.dir())) return [];
    return readdirSync(this.dir()).flatMap((id) => {
      try {
        return [JSON.parse(readFileSync(path.join(this.dir(), id, "meta.json"), "utf8")) as TrashMeta];
      } catch {
        return [];
      }
    });
  }

  restore(trashId: string, newPath?: string): string {
    this.files.assertWritable();
    assertTrashId(trashId);
    const meta = this.list().find((m) => m.trashId === trashId);
    if (!meta) throw errors.notFound("回收站条目不存在");
    const target = newPath ?? meta.originalPath;
    if (existsSync(this.files.abs(target))) throw errors.nameConflict(target);
    mkdirSync(path.dirname(this.files.abs(target)), { recursive: true });
    renameSync(path.join(this.dir(), trashId, path.basename(meta.originalPath)), this.files.abs(target));
    rmSync(path.join(this.dir(), trashId), { recursive: true, force: true });
    return target;
  }

  deletePermanent(trashId: string): void {
    this.files.assertWritable();
    assertTrashId(trashId);
    rmSync(path.join(this.dir(), trashId), { recursive: true, force: true });
  }
}
