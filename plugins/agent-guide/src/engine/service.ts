import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { errors } from "@huhu/contracts";
import type { VaultFiles } from "@huhu/vault";
import { buildGuideFiles, GUIDE_PATHS, type GuideCapability, type GuideFile, type GuidePath } from "../shared/guide-files.js";
import { emptyState, judgeFile, overall, type FileStatus, type GuideStateFile } from "../shared/guide-state.js";

const STATE = ".huhu/guide/state.json";
const BACKUPS = ".huhu/guide/backups";
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

export interface GuideFileInfo {
  path: GuidePath;
  status: FileStatus;
}
export interface GuideStatusDto {
  version: string;
  readOnly: boolean;
  overall: FileStatus;
  files: GuideFileInfo[];
}
export interface GuideDeps {
  files: VaultFiles;
  version: string;
  capabilities(): GuideCapability[];
  now?(): Date;
}

/** 只操作三份指南文件与 `.huhu/guide/` 下的状态、备份；不碰 `.agents/skills/` 下的其他内容。 */
export class GuideService {
  constructor(private readonly d: GuideDeps) {}

  private builtin(): GuideFile[] {
    return buildGuideFiles(this.d.version, this.d.capabilities());
  }
  private state(): GuideStateFile {
    const f = this.d.files.read(STATE);
    if (!f) return emptyState();
    try {
      return { ...emptyState(), ...(JSON.parse(f.bytes.toString("utf8")) as Partial<GuideStateFile>) };
    } catch {
      return emptyState();
    }
  }
  private async save(s: GuideStateFile): Promise<void> {
    await this.d.files.write(STATE, Buffer.from(`${JSON.stringify(s, null, 2)}\n`));
  }
  private read(p: GuidePath): { text: string | null; error: boolean } {
    try {
      const f = this.d.files.read(p);
      return { text: f ? f.bytes.toString("utf8") : null, error: false };
    } catch {
      return { text: null, error: true };
    }
  }
  private assertPath(p: string): GuidePath {
    if (!(GUIDE_PATHS as readonly string[]).includes(p)) throw errors.invalidInput("只能操作三份 HUHU 指南文件");
    return p as GuidePath;
  }

  status(): GuideStatusDto {
    const s = this.state();
    const built = this.builtin();
    const files = built.map((b): GuideFileInfo => {
      const cur = this.read(b.path);
      return {
        path: b.path,
        status: judgeFile({
          current: cur.text === null ? null : sha(cur.text),
          builtin: sha(b.content),
          baseline: s.baseline[b.path] ?? null,
          preserved: s.preserved[b.path] === true,
          needsCheck: s.needsCheck[b.path] === true,
          error: cur.error,
        }),
      };
    });
    return { version: this.d.version, readOnly: this.d.files.readOnly, overall: overall(files.map((f) => f.status)), files };
  }

  /** 当前 / 内置内容（界面的“当前 / 内置 / 差异”视图）。 */
  view(p: string): { path: GuidePath; current: string | null; builtin: string; status: FileStatus } {
    const path = this.assertPath(p);
    const b = this.builtin().find((x) => x.path === path)!;
    return { path, current: this.read(path).text, builtin: b.content, status: this.status().files.find((f) => f.path === path)!.status };
  }

  /** Vault 打开 / 能力变化后的自动维护：missing 补写、outdated 先备份再升级；conflict / preserved / needs-check 不写。只读 Vault 不写。 */
  async maintain(): Promise<GuideStatusDto> {
    if (this.d.files.readOnly) return this.status();
    const s = this.state();
    const st = this.status();
    const built = this.builtin();
    const todo = st.files.filter((f) => f.status === "missing" || f.status === "outdated");
    if (todo.length === 0) return st;
    const backup = todo.filter((f) => f.status === "outdated").map((f) => f.path);
    if (backup.length > 0) await this.backup(backup);
    for (const f of todo) {
      try {
        const b = built.find((x) => x.path === f.path)!;
        await this.d.files.write(f.path, Buffer.from(b.content));
        s.baseline[f.path] = sha(b.content);
      } catch {
        // 写失败：保留原文件，状态会显示 error
      }
    }
    await this.save(s);
    return this.status();
  }

  private async backup(paths: GuidePath[]): Promise<string | null> {
    const id = (this.d.now?.() ?? new Date()).toISOString().replace(/[:.]/g, "-");
    let any = false;
    for (const p of paths) {
      const cur = this.read(p).text;
      if (cur === null) continue;
      await this.d.files.write(`${BACKUPS}/${id}/${p}`, Buffer.from(cur));
      any = true;
    }
    return any ? id : null;
  }

  /** 检查：清除 needs-check 标记，重新按内容判定。 */
  async check(): Promise<GuideStatusDto> {
    const s = this.state();
    s.needsCheck = {};
    if (!this.d.files.readOnly) await this.save(s);
    return this.status();
  }

  /** 保留当前文件：把存在差异的文件设为 preserved，自动维护不再碰它。 */
  async preserve(p?: string): Promise<GuideStatusDto> {
    this.d.files.assertWritable();
    const s = this.state();
    const targets = p
      ? [this.assertPath(p)]
      : this.status()
          .files.filter((f) => f.status === "conflict" || f.status === "needs-check")
          .map((f) => f.path);
    for (const t of targets) {
      s.preserved[t] = true;
      delete s.needsCheck[t];
    }
    await this.save(s);
    return this.status();
  }

  /** 备份并恢复内置版本：先把当前文件写入备份目录，再写内置内容并重新校验哈希。 */
  async restoreBuiltin(p?: string): Promise<GuideStatusDto & { backupId: string | null }> {
    this.d.files.assertWritable();
    const s = this.state();
    const built = this.builtin();
    const targets = p ? [this.assertPath(p)] : GUIDE_PATHS.filter((x) => this.status().files.find((f) => f.path === x)!.status !== "current");
    const backupId = await this.backup([...targets]);
    for (const t of targets) {
      const b = built.find((x) => x.path === t)!;
      await this.d.files.write(t, Buffer.from(b.content));
      if (this.read(t).text !== b.content) throw errors.invalidInput(`写入后校验失败：${t}`);
      s.baseline[t] = sha(b.content);
      delete s.preserved[t];
      delete s.needsCheck[t];
    }
    await this.save(s);
    return { ...this.status(), backupId };
  }

  backups(): { id: string; files: GuidePath[] }[] {
    if (!this.d.files.exists(BACKUPS)) return [];
    return readdirSync(this.d.files.abs(BACKUPS))
      .sort()
      .reverse()
      .map((id) => ({ id, files: GUIDE_PATHS.filter((p) => this.d.files.exists(`${BACKUPS}/${id}/${p}`)) }))
      .filter((b) => b.files.length > 0);
  }

  /** 恢复某份备份：先备份当前，再写回备份内容；之后这些文件按内容判定（通常是 conflict，由用户决定）。 */
  async restoreBackup(id: string): Promise<GuideStatusDto> {
    this.d.files.assertWritable();
    if (!/^[0-9A-Za-z_-]+$/.test(id)) throw errors.invalidInput("备份 ID 不合法");
    const found = this.backups().find((b) => b.id === id);
    if (!found) throw errors.notFound(`备份不存在：${id}`);
    await this.backup([...found.files]);
    const s = this.state();
    for (const p of found.files) {
      const f = this.d.files.read(`${BACKUPS}/${id}/${p}`);
      if (!f) continue;
      await this.d.files.write(p, f.bytes);
      delete s.needsCheck[p];
    }
    await this.save(s);
    return this.status();
  }

  /** 版本历史恢复了指南文件后调用：标记为 needs-check，等用户检查。 */
  async markNeedsCheck(paths: string[]): Promise<void> {
    if (this.d.files.readOnly) return;
    const s = this.state();
    for (const p of paths) if ((GUIDE_PATHS as readonly string[]).includes(p)) s.needsCheck[p as GuidePath] = true;
    await this.save(s);
  }
}
