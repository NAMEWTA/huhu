import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import hostPath from "node:path";
import path from "node:path/posix";
import { errors, KINDS, newId } from "@huhu/contracts";
import { folderNoteDir, normalizeRelPath, resolveReadableAsset, splitDocument, versionOf, type OperationLog, type OpStep, type Trash, type VaultFiles, type VaultIndex } from "@huhu/vault";
import { ATTACH_DIR, hasProtectedSegment, isAllowedAttachment, MAX_ATTACH_BYTES, sanitizeAttachmentName, uniqueName } from "../shared/attachments.js";
import { rewriteLinks } from "../shared/links-rewrite.js";
import { renderTemplate, validateName, type NoteTemplate } from "../shared/templates.js";

import type { LegacyTextEncoding } from "../shared/text-encoding.js";
import { decodeUtf8, requireUtf8, textEncodingOf } from "./text-encoding.js";

export interface NotesDeps {
  files: VaultFiles;
  stateDir: string;
  ops: OperationLog;
  index: VaultIndex;
  trash: Trash;
  now(): Date;
  zone(): string;
  draftMoveSteps?(from: string, to: string): OpStep[];
}

const IDENTITIES = ".huhu/notes/identities.json";
const FOLDERS = ".huhu/notes/folders.json";
/** 进回收站的笔记带走的稳定 id：trashId → { 相对于被删条目的路径 → id }。 */
const TRASHED_IDS = ".huhu/notes/trashed-identities.json";
const FAVORITES = ".huhu/notes/favorites.json";
/** 仅文件树视图隐藏的路径规则（目录规则作用于整棵子树）；搜索、`@`、双链、已打开标签不使用（OP-D11）。 */
const LEGACY_HIDDEN_PATHS = ".huhu/notes/hidden-paths.json";
interface NotesPreferences {
  hiddenPaths: string[];
}
/** 名称里含点（如 `v1.2 方案`）不等于已带扩展名：只有与原扩展名一致时才不再追加。 */
function withExtension(name: string, ext: string): string {
  return ext && name.toLowerCase().endsWith(ext.toLowerCase()) ? name : `${name}${ext}`;
}
const SEMANTIC_DIRS = new Set(Object.values(KINDS).map((k) => k.dir));
/** 笔记 = 普通 Markdown。Tasks/、Automations/ 等语义目录里的文件由各自的插件管理，不是笔记。 */
const isNoteFile = (p: string) => /\.md$/i.test(p) && !SEMANTIC_DIRS.has(p.split("/")[0] ?? "");
const TEMPLATE_FOLDER = "模板";
const isTemplateSource = (rel: string) => isNoteFile(rel.replace(/\.mdx$/i, ".md")) && !hasProtectedSegment(rel);
const isLocalTemplate = (rel: string) => isTemplateSource(rel) && path.basename(path.dirname(rel)) === TEMPLATE_FOLDER;
/** 任务文件：改名 / 移动时只改写正文（`<task>`、`<comments>`）里的双链，frontmatter 不动（任务 spec §3.4）。 */
const isTaskFile = (p: string) => /^Tasks\/.+\.md$/i.test(p);

/** 改写文本里的双链；任务文件只改写正文部分，frontmatter 原样保留。 */
function rewriteFile(p: string, text: string, ctx: Parameters<typeof rewriteLinks>[1]): ReturnType<typeof rewriteLinks> {
  if (!isTaskFile(p)) return rewriteLinks(text, ctx);
  const doc = splitDocument(text);
  const head = text.slice(0, text.length - doc.body.length);
  const r = rewriteLinks(doc.body, ctx);
  return { ...r, text: `${head}${r.text}` };
}

export interface MoveResult {
  moved: Record<string, string>;
  rewrittenFiles: string[];
  ambiguous: string[];
}

/** 笔记与文件夹管理（modules/knowledge.md §3）。所有多文件改动走操作日志，可恢复。 */
export class NotesService {
  private readonly pendingCreations = new Set<string>();
  private duplicateQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly d: NotesDeps) {}

  // ---- 身份、星标、文件夹登记 ----
  private readJson<T>(rel: string, fallback: T): T {
    const f = this.d.files.read(rel);
    if (!f) return fallback;
    try {
      return JSON.parse(f.bytes.toString("utf8")) as T;
    } catch {
      return fallback;
    }
  }
  identities(): Record<string, string> {
    return this.readJson<Record<string, string>>(IDENTITIES, {});
  }
  private jsonStep(rel: string, value: unknown): OpStep {
    return { action: "write", path: rel, bytes: Buffer.from(JSON.stringify(value, null, 2)) };
  }
  noteId(rel: string): string | null {
    return this.identities()[rel] ?? null;
  }
  /** 确保普通笔记有稳定 id（首次需要时分配）。 */
  async ensureId(rel: string): Promise<string> {
    const ids = this.identities();
    if (ids[rel]) return ids[rel] as string;
    const id = newId("note");
    ids[rel] = id;
    const cur = this.d.files.currentVersion(IDENTITIES);
    await this.d.files.write(IDENTITIES, Buffer.from(JSON.stringify(ids, null, 2)), { expectedVersion: cur });
    return id;
  }
  favorites(): string[] {
    return this.readJson<string[]>(FAVORITES, []);
  }
  async setFavorite(rel: string, on: boolean): Promise<string[]> {
    const id = await this.ensureId(rel);
    const set = new Set(this.favorites());
    if (on) set.add(id);
    else set.delete(id);
    const cur = this.d.files.currentVersion(FAVORITES);
    await this.d.files.write(FAVORITES, Buffer.from(JSON.stringify([...set], null, 2)), { expectedVersion: cur });
    return [...set];
  }
  private preferencesFile(): string {
    return hostPath.join(this.d.stateDir, "notes", "ui-preferences.json");
  }
  private relativeStatePath(file: string): string {
    return hostPath.relative(this.d.files.root, file).split(hostPath.sep).join("/");
  }
  /** 优先读新偏好，旧格式在下一次偏好写入（含内部移动）时迁移。 */
  hiddenPaths(): string[] {
    const file = this.preferencesFile();
    let raw: unknown;
    if (existsSync(file)) {
      try {
        raw = (JSON.parse(readFileSync(file, "utf8")) as Partial<NotesPreferences>).hiddenPaths;
      } catch {
        return [];
      }
    } else {
      raw = this.readJson<unknown>(LEGACY_HIDDEN_PATHS, []);
    }
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  }
  private hiddenStep(hiddenPaths: string[]): OpStep & { action: "write" } {
    const prefs: NotesPreferences = { hiddenPaths };
    return { action: "write", path: this.relativeStatePath(this.preferencesFile()), bytes: Buffer.from(JSON.stringify(prefs, null, 2)) };
  }
  async setHiddenPaths(paths: readonly string[]): Promise<string[]> {
    this.d.files.assertWritable();
    const norm = [...new Set(paths.map((p) => normalizeRelPath(p)))].sort();
    const step = this.hiddenStep(norm);
    await this.d.files.write(step.path, step.bytes, { expectedVersion: this.d.files.currentVersion(step.path) });
    return norm;
  }
  /** 内部改名 / 移动重定位规则。外部改名保留原路径规则。 */
  private hiddenStepFor(from: string, to: string): OpStep | null {
    const rules = this.hiddenPaths();
    const next = rules.map((r) => (r === from || r.startsWith(`${from}/`) ? to + r.slice(from.length) : r));
    if (next.every((r, i) => r === rules[i])) return null;
    return this.hiddenStep([...new Set(next)].sort());
  }
  tags(): { tag: string; count: number }[] {
    return this.d.index.allTags();
  }
  folders(): string[] {
    return this.readJson<string[]>(FOLDERS, []);
  }
  async createFolder(rel: string): Promise<void> {
    const norm = normalizeRelPath(rel);
    this.assertValidSegments(norm);
    this.assertUnprotectedDestination(norm);
    if (this.findCaseInsensitive(norm)) throw errors.nameConflict(norm);
    mkdirSync(this.d.files.abs(norm), { recursive: true });
    const list = new Set(this.folders());
    list.add(norm);
    await this.d.files.write(FOLDERS, Buffer.from(JSON.stringify([...list].sort(), null, 2)), { expectedVersion: this.d.files.currentVersion(FOLDERS) });
  }

  // ---- 辅助 ----
  private assertValidSegments(rel: string): void {
    for (const seg of rel.split("/")) {
      const err = validateName(seg);
      if (err) throw errors.invalidInput(err);
    }
  }
  private assertUnprotectedDestination(rel: string): void {
    if (hasProtectedSegment(rel)) throw errors.permissionDenied(rel);
    let probe = rel;
    while (probe !== ".") {
      const absolute = this.d.files.abs(probe);
      if (existsSync(absolute)) {
        resolveReadableAsset(this.d.files.root, probe);
        return;
      }
      probe = path.dirname(probe);
    }
  }

  /** 磁盘目录的真实后代，按相对路径列出，不跟随子目录链接。 */
  private filesUnder(rel: string, options: { includeDirectories?: boolean; validate?: (child: string, symlink: boolean) => void } = {}): string[] {
    const abs = this.d.files.abs(rel);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) return [];
    const out: string[] = [];
    const walk = (dirRel: string): void => {
      for (const e of readdirSync(this.d.files.abs(dirRel), { withFileTypes: true })) {
        const child = `${dirRel}/${e.name}`;
        options.validate?.(child, e.isSymbolicLink());
        if (e.isDirectory()) {
          if (options.includeDirectories !== false) out.push(child);
          walk(child);
        } else out.push(child);
      }
    };
    walk(rel);
    return out;
  }
  private allFiles(): string[] {
    return this.d.index
      .entries()
      .filter((e) => e.type === "file")
      .map((e) => e.path);
  }
  /** 大小写不敏感地查找已存在条目（文件或目录）。 */
  private findCaseInsensitive(rel: string): string | null {
    const lower = rel.toLowerCase();
    const parent = path.dirname(rel) === "." ? "" : path.dirname(rel);
    const dir = parent ? this.d.files.abs(parent) : this.d.files.root;
    if (!existsSync(dir)) return null;
    const hit = readdirSync(dir).find((n) => (parent ? `${parent}/${n}` : n).toLowerCase() === lower);
    return hit ? (parent ? `${parent}/${hit}` : hit) : null;
  }

  // ---- 新建、复制 ----
  private creationPathTaken(rel: string): boolean {
    return this.pendingCreations.has(rel.toLowerCase()) || this.findCaseInsensitive(rel) !== null;
  }

  private async writeNewNote(rel: string, bytes: Uint8Array): Promise<void> {
    if (this.creationPathTaken(rel)) throw errors.nameConflict("这个文件夹中已有同名文件");
    const key = rel.toLowerCase();
    this.pendingCreations.add(key);
    try {
      await this.d.files.write(rel, bytes, { expectedVersion: null });
      this.d.index.refreshPaths([rel]);
    } finally {
      this.pendingCreations.delete(key);
    }
  }

  private readTemplateSource(rel: string): Buffer {
    if (!isTemplateSource(rel)) throw errors.invalidInput("请选择 Vault 内的 Markdown 文件");
    const absolute = resolveReadableAsset(this.d.files.root, rel);
    if (!statSync(absolute).isFile()) throw errors.invalidInput("请选择 Vault 内的 Markdown 文件");
    return readFileSync(absolute);
  }

  templatePaths(): string[] {
    return this.allFiles().filter(isLocalTemplate).sort();
  }

  async importTemplate(sourcePath: string): Promise<{ path: string }> {
    const source = normalizeRelPath(sourcePath);
    const parent = path.dirname(source);
    if (path.basename(parent) === TEMPLATE_FOLDER) throw errors.invalidInput("这已经是模板文件");
    const bytes = this.readTemplateSource(source);
    const folder = path.join(parent, TEMPLATE_FOLDER);
    if (parent !== ".") resolveReadableAsset(this.d.files.root, parent);
    if (this.d.files.exists(folder)) {
      const absolute = resolveReadableAsset(this.d.files.root, folder);
      if (!statSync(absolute).isDirectory()) throw errors.nameConflict("目标模板目录已被同名文件占用");
    }
    const title = path.basename(source).replace(/\.mdx?$/i, "");
    const error = validateName(title);
    if (error) throw errors.invalidInput(error);
    let rel = path.join(folder, `${title}.md`);
    for (let suffix = 2; this.creationPathTaken(rel); suffix++) rel = path.join(folder, `${title}-${suffix}.md`);
    await this.writeNewNote(rel, bytes);
    return { path: rel };
  }

  async create(input: { name: string; folder?: string; template?: NoteTemplate; templatePath?: string }): Promise<{ path: string; id: string }> {
    const nameErr = validateName(input.name.replace(/\.md$/i, ""));
    if (nameErr) throw errors.invalidInput(nameErr);
    const base = input.name.replace(/\.md$/i, "").trim();
    const folder = input.folder ? normalizeRelPath(input.folder) : "";
    if (folder) this.assertValidSegments(folder);
    const rel = `${folder ? `${folder}/` : ""}${base}.md`;
    this.assertUnprotectedDestination(rel);
    const templatePath = input.templatePath === undefined ? undefined : normalizeRelPath(input.templatePath);
    if (templatePath !== undefined && (input.template !== undefined || !isLocalTemplate(templatePath))) {
      throw errors.invalidInput("请选择一个内置模板或 Vault 本地模板");
    }
    const bytes = templatePath === undefined ? Buffer.from(renderTemplate(input.template ?? "blank", base)) : this.readTemplateSource(templatePath);
    await this.writeNewNote(rel, bytes);
    return { path: rel, id: await this.ensureId(rel) };
  }

  /**
   * 写入附件：`notePath` 给定时落在该笔记旁的 `attachments/`（编辑器粘贴 / 拖入），`dir` 给定时直接落在该目录（文件树拖入）。
   * 同名同内容 → 复用并标记 deduped；同名不同内容 → `名-1.ext`。写入走 OperationLog（不覆盖第三方改动、可恢复）。
   */
  async attach(input: { notePath?: string; dir?: string; name: string; bytes: Uint8Array }): Promise<{ path: string; size: number; deduped: boolean }> {
    if (input.bytes.byteLength === 0) throw errors.invalidInput("附件是空文件");
    if (input.bytes.byteLength > MAX_ATTACH_BYTES) throw errors.invalidInput(`附件超过 ${MAX_ATTACH_BYTES / 1024 / 1024} MiB 上限`);
    const name = sanitizeAttachmentName(input.name);
    if (!isAllowedAttachment(name)) throw errors.invalidInput(`不支持的附件类型：${name}`);
    let dir: string;
    if (input.dir !== undefined && input.dir !== "") dir = normalizeRelPath(input.dir);
    else if (input.notePath) {
      const noteDir = path.dirname(normalizeRelPath(input.notePath));
      dir = `${noteDir === "." ? "" : `${noteDir}/`}${ATTACH_DIR}`;
    } else dir = ATTACH_DIR;
    if (dir) this.assertValidSegments(dir);
    if (hasProtectedSegment(dir)) throw errors.invalidInput("不能把附件写进受保护目录");
    const at = (n: string) => (dir ? `${dir}/${n}` : n);
    const wanted = at(name);
    const existing = this.findCaseInsensitive(wanted);
    if (existing && this.d.files.currentVersion(existing) === versionOf(input.bytes)) return { path: existing, size: input.bytes.byteLength, deduped: true };
    const final = uniqueName(name, (n) => this.findCaseInsensitive(at(n)) !== null);
    const rel = at(final);
    await this.d.ops.run(`attach-${Date.now().toString(36)}`, "attach", [{ action: "write", path: rel, bytes: input.bytes }]);
    this.d.index.refreshPaths([rel]);
    return { path: rel, size: input.bytes.byteLength, deduped: false };
  }

  private duplicateDestination(rel: string, ext: string): string {
    const dir = path.dirname(rel);
    const base = path.basename(rel, ext);
    for (let suffix = 0; suffix < 100; suffix++) {
      const name = `${base} · 副本${suffix ? ` (${suffix})` : ""}${ext}`;
      const dest = path.join(dir, name);
      if (!this.creationPathTaken(dest)) return dest;
    }
    throw errors.nameConflict(rel);
  }

  /** 在状态目录备妥字节，再由 OperationLog 将整棵树移入目标路径。 */
  private async duplicateFolder(rel: string): Promise<{ path: string; id: string; paths: string[] }> {
    const dest = this.duplicateDestination(rel, "");
    const key = dest.toLowerCase();
    this.pendingCreations.add(key);
    try {
      return await this.copyFolderTo(rel, dest);
    } finally {
      this.pendingCreations.delete(key);
    }
  }

  private async copyFolderTo(rel: string, dest: string): Promise<{ path: string; id: string; paths: string[] }> {
    const copies = hostPath.join(this.d.stateDir, "notes", "copies");
    mkdirSync(copies, { recursive: true });
    const staging = mkdtempSync(hostPath.join(copies, "copy-"));
    const copied: string[] = [];
    const folders: string[] = [dest];
    try {
      for (const child of this.filesUnder(rel)) {
        const suffix = child.slice(rel.length + 1);
        const target = hostPath.join(staging, ...suffix.split("/"));
        if (lstatSync(this.d.files.abs(child)).isDirectory()) {
          mkdirSync(target);
          folders.push(`${dest}/${suffix}`);
          continue;
        }
        const source = this.d.files.read(child);
        if (!source) continue;
        writeFileSync(target, source.bytes, { flag: "wx" });
        copied.push(`${dest}/${suffix}`);
      }
      const list = new Set(this.folders());
      for (const dir of folders) if (!copied.some((file) => file.startsWith(`${dir}/`))) list.add(dir);
      await this.d.ops.run(`copy-${randomUUID()}`, "duplicate-folder", [this.jsonStep(FOLDERS, [...list].sort()), { action: "rename", from: this.relativeStatePath(staging), path: dest }]);
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
    this.d.index.refreshPaths(copied);
    return { path: dest, id: "", paths: copied };
  }

  duplicate(rel: string): Promise<{ path: string; id: string; paths?: string[] }> {
    const copy = this.duplicateQueue.then(() => this.duplicateEntry(normalizeRelPath(rel)));
    this.duplicateQueue = copy.catch(() => undefined);
    return copy;
  }

  private async duplicateEntry(rel: string): Promise<{ path: string; id: string; paths?: string[] }> {
    this.d.files.assertWritable();
    const absolute = resolveReadableAsset(this.d.files.root, rel);
    if (statSync(absolute).isDirectory()) return this.duplicateFolder(rel);
    const src = this.d.files.read(rel);
    if (!src) throw errors.notFound(`文件不存在：${rel}`);
    const dest = this.duplicateDestination(rel, path.extname(rel));
    const id = newId("note");
    const key = dest.toLowerCase();
    this.pendingCreations.add(key);
    try {
      await this.d.ops.run(`copy-${randomUUID()}`, "duplicate-file", [{ action: "write", path: dest, bytes: src.bytes, expectedVersion: null }, this.jsonStep(IDENTITIES, { ...this.identities(), [dest]: id })]);
      this.d.index.refreshPaths([dest]);
      return { path: dest, id };
    } finally {
      this.pendingCreations.delete(key);
    }
  }

  // ---- 重命名 / 移动 ----
  async rename(rel: string, newName: string): Promise<MoveResult> {
    const err = validateName(newName.replace(/\.md$/i, ""));
    if (err) throw errors.invalidInput(err);
    const dir = path.dirname(rel) === "." ? "" : `${path.dirname(rel)}/`;
    const isDir = existsSync(this.d.files.abs(rel)) && statSync(this.d.files.abs(rel)).isDirectory();
    const ext = isDir ? "" : path.extname(rel);
    const finalName = isDir ? newName : withExtension(newName, ext);
    return this.moveEntry(rel, `${dir}${finalName}`);
  }

  async move(rel: string, targetDir: string): Promise<MoveResult> {
    const dir = targetDir ? normalizeRelPath(targetDir) : "";
    if (dir && !statSync(this.d.files.abs(dir), { throwIfNoEntry: false })?.isDirectory()) {
      throw errors.notFound(`目标文件夹不存在：${dir}`);
    }
    return this.moveEntry(rel, `${dir ? `${dir}/` : ""}${path.basename(rel)}`);
  }

  /** 移动或改名到完整的目标路径（双链改写与笔记 id 迁移都在这里完成）；档案层先算好不重名的目标。 */
  async moveEntry(from: string, to: string): Promise<MoveResult> {
    this.d.files.assertWritable();
    from = normalizeRelPath(from);
    to = normalizeRelPath(to);
    if (from === to) return { moved: {}, rewrittenFiles: [], ambiguous: [] };
    const source = resolveReadableAsset(this.d.files.root, from);
    this.assertUnprotectedDestination(to);
    const isDir = statSync(source).isDirectory();
    if (isDir && (to === from || to.startsWith(`${from}/`))) throw errors.invalidInput("不能把文件夹移入自身或其后代");
    const caseOnly = from.toLowerCase() === to.toLowerCase();
    const existing = this.findCaseInsensitive(to);
    if (existing && (!caseOnly || existing !== from)) throw errors.nameConflict(to);

    const under = (p: string) => p.startsWith(`${from}/`);
    const actualFiles = isDir
      ? this.filesUnder(from, {
          includeDirectories: false,
          validate: (child, symlink) => {
            if (hasProtectedSegment(child)) throw errors.permissionDenied(child);
            if (symlink) resolveReadableAsset(this.d.files.root, child);
          },
        })
      : [from];
    const all = [...new Set([...this.allFiles().filter((p) => !isDir || !under(p)), ...actualFiles])];
    const moves = new Map(actualFiles.map((p) => [p, to + p.slice(from.length)]));
    const folderMoves = isDir ? new Map([[from, to]]) : undefined;

    const steps: OpStep[] = [];
    const rewritten: string[] = [];
    const ambiguous = new Set<string>();
    const ids = this.identities();
    for (const p of all) {
      if (!(isNoteFile(p) || isTaskFile(p))) continue;
      const absolute = this.d.files.abs(p);
      if (!lstatSync(absolute, { throwIfNoEntry: false })?.isFile()) continue;
      const f = this.d.files.read(p);
      if (!f) continue;
      const text = decodeUtf8(f.bytes);
      if (text === null) continue;
      const newPath = moves.get(p) ?? p;
      const r = rewriteFile(p, text, { filePath: p, newFilePath: newPath, moves, allPaths: all, ...(folderMoves ? { folderMoves } : {}) });
      r.ambiguous.forEach((a) => ambiguous.add(a));
      if (r.changes > 0) {
        steps.push({ action: "write", path: p, bytes: Buffer.from(r.text), expectedVersion: f.version });
        rewritten.push(newPath);
      }
    }
    for (const [o, n] of moves) {
      steps.push(...(this.d.draftMoveSteps?.(o, n) ?? []));
      if (ids[o]) {
        ids[n] = ids[o] as string;
        delete ids[o];
      }
    }
    const folderList = this.folders().map((f) => (f === from || under(f) ? to + f.slice(from.length) : f));
    steps.push(this.jsonStep(IDENTITIES, ids), this.jsonStep(FOLDERS, folderList));
    const hiddenStep = this.hiddenStepFor(from, to);
    if (hiddenStep) steps.push(hiddenStep);
    // 改写旧路径的双链并保留备份，再通过一次物理移动保留目录内的所有条目。
    steps.push({ action: "rename", from, path: to, ...(caseOnly ? { caseOnly: true as const } : {}) });
    await this.d.ops.run(`mv-${randomUUID()}`, caseOnly ? "rename-case" : isDir ? "move-folder" : "move-file", dedupeWrites(steps));
    const moved = isDir ? this.filesUnder(to, { includeDirectories: false }).map((p) => [from + p.slice(to.length), p] as const) : ([[from, to]] as const);
    this.d.index.refreshPaths([...new Set([...moves.keys(), ...moved.flat(), ...rewritten])]);
    return { moved: Object.fromEntries(moved.length ? moved : [[from, to]]), rewrittenFiles: rewritten, ambiguous: [...ambiguous] };
  }

  // ---- 回收站 ----
  async trash(rel: string): Promise<{ trashId: string }> {
    const norm = normalizeRelPath(rel);
    resolveReadableAsset(this.d.files.root, norm);
    const ids = this.identities();
    const under = this.d.index.entries(norm).map((e) => e.path); // 文件夹整体进回收站：连同后代一并从索引移除
    const r = { trashId: this.d.trash.moveIn(norm, ids[norm] ?? null).trashId };
    // 被删条目（及其后代）的稳定 id 随回收站条目保存，不再占用原路径：同名新建会得到新 id，恢复时原样带回
    const carried: Record<string, string> = {};
    for (const [p, id] of Object.entries(ids)) {
      if (p === norm || p.startsWith(`${norm}/`)) {
        carried[p === norm ? "" : p.slice(norm.length + 1)] = id;
        delete ids[p];
      }
    }
    const folders = this.folders().filter((f) => f !== norm && !f.startsWith(`${norm}/`));
    const trashed = this.readJson<Record<string, Record<string, string>>>(TRASHED_IDS, {});
    if (Object.keys(carried).length > 0) trashed[r.trashId] = carried;
    await this.d.ops.run(`trash-${r.trashId}`, "trash-ids", [this.jsonStep(IDENTITIES, ids), this.jsonStep(FOLDERS, folders), this.jsonStep(TRASHED_IDS, trashed)]);
    this.d.index.refreshPaths([...new Set([norm, ...under])]);
    return r;
  }
  /** 恢复；原路径已有同名文件时必须提供 newName，不覆盖。 */
  async restore(trashId: string, newName?: string): Promise<string> {
    const meta = this.d.trash.list().find((m) => m.trashId === trashId);
    if (!meta) throw errors.notFound("回收站条目不存在");
    const dir = path.dirname(meta.originalPath) === "." ? "" : `${path.dirname(meta.originalPath)}/`;
    const target = newName ? `${dir}${withExtension(newName, path.extname(meta.originalPath))}` : meta.originalPath;
    if (newName) {
      const err = validateName(newName.replace(/\.md$/i, ""));
      if (err) throw errors.invalidInput(err);
    }
    this.assertUnprotectedDestination(target);
    if (this.findCaseInsensitive(target)) throw errors.nameConflict(target);
    const restored = this.d.trash.restore(trashId, target);
    // 带回稳定 id；恢复的是文件夹时，空文件夹重新登记
    const trashed = this.readJson<Record<string, Record<string, string>>>(TRASHED_IDS, {});
    const carried = trashed[trashId];
    delete trashed[trashId];
    const ids = this.identities();
    for (const [sub, id] of Object.entries(carried ?? {})) if (!Object.values(ids).includes(id)) ids[sub === "" ? restored : `${restored}/${sub}`] = id;
    const steps = [this.jsonStep(IDENTITIES, ids), this.jsonStep(TRASHED_IDS, trashed)];
    if (existsSync(this.d.files.abs(restored)) && statSync(this.d.files.abs(restored)).isDirectory()) steps.push(this.jsonStep(FOLDERS, [...new Set([...this.folders(), restored])].sort()));
    await this.d.ops.run(`restore-${trashId}`, "restore-ids", steps);
    this.d.index.refreshPaths([restored, ...this.filesUnder(restored)]);
    return restored;
  }
  async deletePermanent(trashId: string): Promise<void> {
    this.d.trash.deletePermanent(trashId);
    const trashed = this.readJson<Record<string, Record<string, string>>>(TRASHED_IDS, {});
    if (trashed[trashId]) {
      delete trashed[trashId];
      await this.d.files.write(TRASHED_IDS, Buffer.from(JSON.stringify(trashed, null, 2)));
    }
  }

  // ---- 日记 ----
  openDaily(dateIso: string): Promise<{ path: string; created: boolean }> {
    return this.dailyAt(dateIso);
  }
  private async dailyAt(date: string): Promise<{ path: string; created: boolean }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw errors.invalidInput("日期格式应为 YYYY-MM-DD");
    const rel = `日记/${date} · 每日笔记.md`;
    if (this.d.files.exists(rel)) return { path: rel, created: false };
    mkdirSync(this.d.files.abs("日记"), { recursive: true }); // 日记目录被删除时重建
    await this.d.files.write(rel, Buffer.from(renderTemplate("daily", `${date} · 每日笔记`)), { expectedVersion: null });
    await this.ensureId(rel);
    this.d.index.refreshPaths([rel]);
    return { path: rel, created: true };
  }

  /** 编辑器保存：必须带 expectedVersion，冲突时返回 VERSION_CONFLICT。 */
  async save(rel: string, text: string, expectedVersion: string): Promise<{ version: string; previous: { text: string; version: string } }> {
    const norm = normalizeRelPath(rel);
    const file = this.d.files.read(norm);
    if (!file) throw errors.notFound(`文件不存在：${rel}`);
    const previous = { text: requireUtf8(file.bytes), version: file.version };
    if (file.bytes.includes(0)) throw errors.invalidInput("不能把二进制文件当作文本覆盖");
    const r = await this.d.files.write(norm, Buffer.from(text), { expectedVersion });
    this.d.index.refreshPaths([norm]);
    return { ...r, previous };
  }

  list(filter: "all" | "favorites" | "daily" | "trash" | { tag: string }): { path: string; id: string | null; title: string; trashId?: string; deletedAt?: string; favorite?: boolean; tags?: string[] }[] {
    if (filter === "trash") return this.d.trash.list().map((m) => ({ path: m.originalPath, id: m.noteId, title: path.basename(m.originalPath, ".md"), trashId: m.trashId, deletedAt: m.deletedAt }));
    const ids = this.identities();
    const fav = new Set(this.favorites());
    return this.allFiles()
      .filter(isNoteFile)
      .filter((p) => {
        if (filter === "all") return true;
        if (filter === "favorites") return fav.has(ids[p] ?? "");
        if (filter === "daily") return p.startsWith("日记/");
        return this.d.index.tagsOf(p).includes(filter.tag);
      })
      .map((p) => ({ path: p, id: ids[p] ?? null, title: folderNoteDir(p) !== null ? path.basename(folderNoteDir(p) as string) : path.basename(p, ".md"), favorite: fav.has(ids[p] ?? ""), tags: this.d.index.tagsOf(p) }));
  }

  read(rel: string): { path: string; text: string; version: string } {
    const f = this.d.files.read(normalizeRelPath(rel));
    if (!f) throw errors.notFound(`文件不存在：${rel}`);
    const text = requireUtf8(f.bytes);
    if (text.includes("\0")) throw errors.invalidInput("这个文件含有二进制内容，无法作为文本编辑");
    return { path: rel, text, version: f.version };
  }

  inspectEncoding(rel: string) {
    const f = this.d.files.read(normalizeRelPath(rel));
    if (!f) throw errors.notFound(`文件不存在：${rel}`);
    return { state: textEncodingOf(f.bytes), version: f.version };
  }

  async convertEncoding(rel: string, encoding: LegacyTextEncoding, expectedVersion: string): Promise<{ version: string }> {
    const norm = normalizeRelPath(rel);
    const f = this.d.files.read(norm);
    if (!f) throw errors.notFound(`文件不存在：${rel}`);
    if (f.version !== expectedVersion) throw errors.versionConflict(f.version);
    if (textEncodingOf(f.bytes) !== "encoding") throw errors.invalidInput("此文件无需转换编码或不是文本");
    let text: string;
    try {
      text = new TextDecoder(encoding, { fatal: true }).decode(f.bytes);
    } catch {
      throw errors.invalidInput("无法按所选编码无损解码文件");
    }
    if (text.includes("\0")) throw errors.invalidInput("解码结果包含二进制内容，请检查所选编码");
    const result = await this.d.files.write(norm, Buffer.from(text), { expectedVersion });
    this.d.index.refreshPaths([norm]);
    return result;
  }

  backlinks(rel: string): { path: string; title: string }[] {
    return this.d.index.backlinks(rel);
  }
}

/** 同一路径的多个 write 步骤只保留最后一个（例如 identities.json）。 */
function dedupeWrites(steps: OpStep[]): OpStep[] {
  const lastWrite = new Map<string, number>();
  steps.forEach((s, i) => {
    if (s.action === "write") lastWrite.set(s.path, i);
  });
  return steps.filter((s, i) => s.action !== "write" || lastWrite.get(s.path) === i);
}
