import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import { errors } from "@huhu/contracts";
import { OperationLog, type OpStep, type VaultFiles } from "@huhu/vault";
import { buildGuideFiles, GUIDE_PATHS, type GuideCapability, type GuideFile, type GuidePath } from "../shared/guide-files.js";
import { emptyState, judgeFile, overall, type FileStatus, type GuideStateFile } from "../shared/guide-state.js";

const STATE = ".huhu/guide/state.json";
const BACKUPS = ".huhu/guide/backups";
const BACKUP_ID = /^[0-9A-Za-z_-]+$/;
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

export type GuideVersions = Partial<Record<GuidePath, string | null>>;
type Snapshot = { path: GuidePath; file: ReturnType<VaultFiles["read"]> };

export interface GuideFileInfo {
  path: GuidePath;
  status: FileStatus;
  contentVersion: string | null;
}
export interface GuideStatusDto {
  version: string;
  readOnly: boolean;
  overall: FileStatus;
  files: GuideFileInfo[];
}
export interface GuideDeps {
  files: VaultFiles;
  operations?: OperationLog;
  version: string;
  capabilities(): GuideCapability[];
  now?(): Date;
}

/** 管理三份指南文件及其本库状态和备份。 */
export class GuideService {
  private pending: Promise<unknown> = Promise.resolve();
  private readonly operations: OperationLog;

  constructor(private readonly d: GuideDeps) {
    this.operations = d.operations ?? new OperationLog(d.files, path.join(d.files.root, ".huhu", "operations"));
  }

  private write<T>(action: () => Promise<T>): Promise<T> {
    const next = this.pending.then(action);
    this.pending = next.catch(() => undefined);
    return next;
  }

  private absolute(rel: string): string {
    const absolute = this.d.files.abs(rel);
    let entry = this.d.files.root;
    for (const segment of rel.split("/")) {
      entry = path.join(entry, segment);
      const info = lstatSync(entry, { throwIfNoEntry: false });
      if (!info) break;
      if (info.isSymbolicLink()) throw errors.permissionDenied(rel);
    }
    return absolute;
  }

  private file(rel: string) {
    this.absolute(rel);
    return this.d.files.read(rel);
  }

  private builtin(): GuideFile[] {
    return buildGuideFiles(this.d.version, this.d.capabilities());
  }

  private state(): GuideStateFile {
    const file = this.file(STATE);
    if (!file) return emptyState();
    try {
      return { ...emptyState(), ...(JSON.parse(file.bytes.toString("utf8")) as Partial<GuideStateFile>) };
    } catch {
      return emptyState();
    }
  }

  private async save(state: GuideStateFile): Promise<void> {
    this.absolute(STATE);
    await this.d.files.write(STATE, Buffer.from(`${JSON.stringify(state, null, 2)}\n`));
  }

  private inspect(rel: GuidePath) {
    try {
      const file = this.file(rel);
      return { text: file?.bytes.toString("utf8") ?? null, version: file?.version ?? null, error: false };
    } catch {
      return { text: null, version: null, error: true };
    }
  }

  private assertPath(rel: string): GuidePath {
    if (!(GUIDE_PATHS as readonly string[]).includes(rel)) throw errors.invalidInput("只能操作三份 HUHU 指南文件");
    return rel as GuidePath;
  }

  status(): GuideStatusDto {
    const state = this.state();
    const files = this.builtin().map((built): GuideFileInfo => {
      const cur = this.inspect(built.path);
      return {
        path: built.path,
        contentVersion: cur.version,
        status: judgeFile({
          current: cur.text === null ? null : sha(cur.text),
          builtin: sha(built.content),
          baseline: state.baseline[built.path] ?? null,
          preserved: state.preserved[built.path] === true,
          needsCheck: state.needsCheck[built.path] === true,
          error: cur.error,
        }),
      };
    });
    return { version: this.d.version, readOnly: this.d.files.readOnly, overall: overall(files.map((file) => file.status)), files };
  }

  view(rel: string): { path: GuidePath; current: string | null; builtin: string; status: FileStatus; contentVersion: string | null } {
    const guide = this.assertPath(rel);
    const built = this.builtin().find((entry) => entry.path === guide)!;
    const cur = this.inspect(guide);
    return { path: guide, current: cur.text, builtin: built.content, contentVersion: cur.version, status: this.status().files.find((entry) => entry.path === guide)!.status };
  }

  private snapshots(paths: readonly GuidePath[], expected?: GuideVersions): Snapshot[] {
    return paths.map((rel) => {
      const file = this.file(rel);
      if (expected) {
        if (!Object.hasOwn(expected, rel)) throw errors.invalidInput(`必须提供指南版本：${rel}`);
        if (expected[rel] !== (file?.version ?? null)) throw errors.versionConflict(file?.version ?? "");
      }
      return { path: rel, file };
    });
  }

  private async backup(entries: readonly Snapshot[]): Promise<string | null> {
    const files = entries.filter(({ file }) => file !== null);
    if (!files.length) return null;
    const stamp = (this.d.now?.() ?? new Date()).toISOString().replace(/[:.]/g, "-");
    const id = `${stamp}-${randomUUID()}`;
    for (const entry of files) {
      const rel = `${BACKUPS}/${id}/${entry.path}`;
      this.absolute(rel);
      await this.d.files.write(rel, entry.file!.bytes, { expectedVersion: null });
    }
    return id;
  }

  private async replace(targets: readonly Snapshot[], contents: readonly Buffer[], state: GuideStateFile, stateVersion: string | null): Promise<void> {
    const steps: OpStep[] = targets.map(({ path, file }, i) => {
      this.absolute(path);
      return { action: "write", path, bytes: contents[i]!, expectedVersion: file?.version ?? null };
    });
    this.absolute(STATE);
    steps.push({ action: "write", path: STATE, bytes: Buffer.from(`${JSON.stringify(state, null, 2)}\n`), expectedVersion: stateVersion });
    await this.operations.run(`guide-${randomUUID()}`, "guide-restore", steps);
  }

  /** Open and upgrade maintain missing/outdated files, and leave custom guide contents intact. */
  maintain(): Promise<GuideStatusDto> {
    return this.write(async () => {
      if (this.d.files.readOnly) return this.status();
      const state = this.state();
      const status = this.status();
      const built = this.builtin();
      const todo = status.files.filter(({ status }) => status === "missing" || status === "outdated");
      if (!todo.length) return status;
      const files = this.snapshots(todo.map(({ path }) => path));
      await this.backup(files);
      for (const { path, file } of files) {
        try {
          const entry = built.find((item) => item.path === path)!;
          this.absolute(path);
          await this.d.files.write(path, Buffer.from(entry.content), { expectedVersion: file?.version ?? null });
          state.baseline[path] = sha(entry.content);
        } catch {
          // Concurrent edits stay on disk and are classified on the next status read.
        }
      }
      await this.save(state);
      return this.status();
    });
  }

  check(): Promise<GuideStatusDto> {
    return this.write(async () => {
      const state = this.state();
      state.needsCheck = {};
      if (!this.d.files.readOnly) await this.save(state);
      return this.status();
    });
  }

  preserve(rel?: string, expected?: GuideVersions): Promise<GuideStatusDto> {
    return this.write(async () => {
      this.d.files.assertWritable();
      const state = this.state();
      const paths = rel
        ? [this.assertPath(rel)]
        : this.status()
            .files.filter(({ status }) => status === "conflict" || status === "needs-check")
            .map(({ path }) => path);
      for (const { path, file } of this.snapshots(paths, expected)) {
        if (expected && !file) throw errors.notFound(path);
        state.preserved[path] = true;
        delete state.needsCheck[path];
      }
      await this.save(state);
      return this.status();
    });
  }

  restoreBuiltin(rel?: string, expected?: GuideVersions): Promise<GuideStatusDto & { backupId: string | null }> {
    return this.write(async () => {
      this.d.files.assertWritable();
      const stateVersion = this.file(STATE)?.version ?? null;
      const state = this.state();
      const built = this.builtin();
      const paths = rel
        ? [this.assertPath(rel)]
        : this.status()
            .files.filter(({ status }) => status !== "current")
            .map(({ path }) => path);
      const targets = this.snapshots(paths, expected);
      const backupId = await this.backup(targets);
      const contents = targets.map(({ path }) => {
        const entry = built.find((item) => item.path === path)!;
        state.baseline[path] = sha(entry.content);
        delete state.preserved[path];
        delete state.needsCheck[path];
        return Buffer.from(entry.content);
      });
      await this.replace(targets, contents, state, stateVersion);
      return { ...this.status(), backupId };
    });
  }

  backups(): { id: string; files: GuidePath[] }[] {
    const root = this.absolute(BACKUPS);
    if (!lstatSync(root, { throwIfNoEntry: false })?.isDirectory()) return [];
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && BACKUP_ID.test(entry.name))
      .map(({ name }) => name)
      .sort()
      .reverse()
      .map((id) => ({
        id,
        files: GUIDE_PATHS.filter((rel) => {
          try {
            return lstatSync(this.absolute(`${BACKUPS}/${id}/${rel}`), { throwIfNoEntry: false })?.isFile() ?? false;
          } catch {
            return false;
          }
        }),
      }))
      .filter(({ files }) => files.length > 0);
  }

  restoreBackup(id: string, expected?: GuideVersions): Promise<GuideStatusDto> {
    return this.write(async () => {
      this.d.files.assertWritable();
      if (!BACKUP_ID.test(id)) throw errors.invalidInput("备份 ID 不合法");
      const found = this.backups().find((backup) => backup.id === id);
      if (!found) throw errors.notFound(`备份不存在：${id}`);
      const targets = this.snapshots(found.files, expected);
      const source = found.files.map((rel) => {
        const file = this.file(`${BACKUPS}/${id}/${rel}`);
        if (!file) throw errors.notFound(rel);
        return file.bytes;
      });
      const stateVersion = this.file(STATE)?.version ?? null;
      const state = this.state();
      await this.backup(targets);
      for (const { path } of targets) delete state.needsCheck[path];
      await this.replace(targets, source, state, stateVersion);
      return this.status();
    });
  }

  /** 版本历史恢复指南后保留待检查标记。 */
  markNeedsCheck(paths: string[]): Promise<void> {
    return this.write(async () => {
      if (this.d.files.readOnly) return;
      const state = this.state();
      for (const rel of paths) if ((GUIDE_PATHS as readonly string[]).includes(rel)) state.needsCheck[rel as GuidePath] = true;
      await this.save(state);
    });
  }
}
