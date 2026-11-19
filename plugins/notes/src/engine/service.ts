import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path/posix";
import { errors, KINDS, newId } from "@huhu/contracts";
import { folderNoteDir, normalizeRelPath, resolveReadableAsset, splitDocument, versionOf, type OperationLog, type OpStep, type Trash, type VaultFiles, type VaultIndex } from "@huhu/vault";
import { ATTACH_DIR, hasProtectedSegment, isAllowedAttachment, MAX_ATTACH_BYTES, sanitizeAttachmentName, uniqueName } from "../shared/attachments.js";
import { rewriteLinks } from "../shared/links-rewrite.js";
import { renderTemplate, validateName, type NoteTemplate } from "../shared/templates.js";

export interface NotesDeps {
  files: VaultFiles;
  ops: OperationLog;
  index: VaultIndex;
  trash: Trash;
  now(): Date;
  zone(): string;
}

const IDENTITIES = ".huhu/notes/identities.json";
const FOLDERS = ".huhu/notes/folders.json";
/** 进回收站的笔记带走的稳定 id：trashId → { 相对于被删条目的路径 → id }。 */
const TRASHED_IDS = ".huhu/notes/trashed-identities.json";
const FAVORITES = ".huhu/notes/favorites.json";
/** 仅文件树视图隐藏的路径规则（目录规则作用于整棵子树）；搜索、`@`、双链、已打开标签不使用（OP-D11）。 */
const HIDDEN_PATHS = ".huhu/notes/hidden-paths.json";
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
  /** 每 Vault 的“仅文件树隐藏”规则（规范相对路径，已去重排序）。 */
  hiddenPaths(): string[] {
    const raw = this.readJson<unknown>(HIDDEN_PATHS, []);
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  }
  async setHiddenPaths(paths: readonly string[]): Promise<string[]> {
    const norm = [...new Set(paths.map((p) => normalizeRelPath(p)))].sort();
    const cur = this.d.files.currentVersion(HIDDEN_PATHS);
    await this.d.files.write(HIDDEN_PATHS, Buffer.from(JSON.stringify(norm, null, 2)), { expectedVersion: cur });
    return norm;
  }
  /** 内部改名 / 移动：把命中的隐藏规则（含子树规则）重定位到新路径；没有变化返回 null。外部改名按路径规则处理，不猜测。 */
  private hiddenStepFor(from: string, to: string): OpStep | null {
    const rules = this.hiddenPaths();
    const next = rules.map((r) => (r === from || r.startsWith(`${from}/`) ? to + r.slice(from.length) : r));
    if (next.every((r, i) => r === rules[i])) return null;
    return this.jsonStep(HIDDEN_PATHS, [...new Set(next)].sort());
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
  /** 磁盘上某个目录下的全部文件（相对路径）；不是目录则为空。 */
  private filesUnder(rel: string): string[] {
    const abs = this.d.files.abs(rel);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) return [];
    const out: string[] = [];
    const walk = (dirRel: string): void => {
      for (const e of readdirSync(this.d.files.abs(dirRel), { withFileTypes: true })) {
        const child = `${dirRel}/${e.name}`;
        if (e.isDirectory()) {
          out.push(child);
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

  /** 复制文件夹：整棵子树按字节复制到“<名> · 副本”（不复制批注与历史；复制出的笔记得到新 id）。 */
  private async duplicateFolder(rel: string): Promise<{ path: string; id: string; paths: string[] }> {
    const dir = path.dirname(rel) === "." ? "" : `${path.dirname(rel)}/`;
    let n = 0;
    let dest: string;
    do dest = `${dir}${path.basename(rel)} · 副本${n ? ` (${n})` : ""}`;
    while (this.findCaseInsensitive(dest) && ++n < 100);
    mkdirSync(this.d.files.abs(dest), { recursive: true });
    const copied: string[] = [];
    const emptyDirs: string[] = [dest];
    for (const child of this.filesUnder(rel)) {
      const to = `${dest}${child.slice(rel.length)}`;
      if (statSync(this.d.files.abs(child)).isDirectory()) {
        mkdirSync(this.d.files.abs(to), { recursive: true });
        emptyDirs.push(to);
        continue;
      }
      const src = this.d.files.read(child);
      if (!src) continue;
      await this.d.files.write(to, src.bytes, { expectedVersion: null });
      copied.push(to);
    }
    const nonEmpty = (d: string) => copied.some((f) => f.startsWith(`${d}/`));
    const list = new Set(this.folders());
    for (const d of emptyDirs) if (!nonEmpty(d)) list.add(d);
    await this.d.files.write(FOLDERS, Buffer.from(JSON.stringify([...list].sort(), null, 2)), { expectedVersion: this.d.files.currentVersion(FOLDERS) });
    this.d.index.refreshPaths(copied);
    return { path: dest, id: "", paths: copied };
  }

  async duplicate(rel: string): Promise<{ path: string; id: string; paths?: string[] }> {
    rel = normalizeRelPath(rel);
    if (existsSync(this.d.files.abs(rel)) && statSync(this.d.files.abs(rel)).isDirectory()) return this.duplicateFolder(rel);
    const src = this.d.files.read(rel);
    if (!src) throw errors.notFound(`文件不存在：${rel}`);
    const ext = path.extname(rel);
    const dir = path.dirname(rel) === "." ? "" : `${path.dirname(rel)}/`;
    let n = 0;
    let dest: string;
    do dest = `${dir}${path.basename(rel, ext)} · 副本${n ? ` (${n})` : ""}${ext}`;
    while (this.findCaseInsensitive(dest) && ++n < 100);
    await this.d.files.write(dest, src.bytes, { expectedVersion: null });
    this.d.index.refreshPaths([dest]);
    return { path: dest, id: await this.ensureId(dest) }; // 新 id；不复制批注与历史
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
    return this.moveEntry(rel, `${dir ? `${dir}/` : ""}${path.basename(rel)}`);
  }

  /** 移动或改名到完整的目标路径（双链改写与笔记 id 迁移都在这里完成）；档案层先算好不重名的目标。 */
  async moveEntry(from: string, to: string): Promise<MoveResult> {
    from = normalizeRelPath(from);
    to = normalizeRelPath(to);
    if (from === to) return { moved: {}, rewrittenFiles: [], ambiguous: [] };
    if (!existsSync(this.d.files.abs(from))) throw errors.notFound(`不存在：${from}`);
    const isDir = statSync(this.d.files.abs(from)).isDirectory();
    if (isDir && (to === from || to.startsWith(`${from}/`))) throw errors.invalidInput("不能把文件夹移入自身或其后代");
    const existing = this.findCaseInsensitive(to);
    // 仅大小写变化（同一个文件）允许；否则同名拒绝，不合并
    if (existing && existing.toLowerCase() !== from.toLowerCase()) throw errors.nameConflict(to);
    if (from.toLowerCase() === to.toLowerCase()) return this.caseOnlyRename(from, to, isDir);
    mkdirSync(path.dirname(this.d.files.abs(to)), { recursive: true });

    const all = this.allFiles();
    const moves = new Map<string, string>();
    if (isDir) {
      for (const p of all) if (p.startsWith(`${from}/`)) moves.set(p, `${to}${p.slice(from.length)}`);
    } else moves.set(from, to);
    const folderMoves = isDir ? new Map([[from, to]]) : undefined;
    if (isDir && moves.size === 0) {
      // 空文件夹：只改登记
      const list = this.folders().map((f) => (f === from || f.startsWith(`${from}/`) ? to + f.slice(from.length) : f));
      const hid = this.hiddenStepFor(from, to);
      await this.d.ops.run(`mv-${Date.now().toString(36)}`, "move-folder", [{ action: "rename", from, path: to }, this.jsonStep(FOLDERS, list), ...(hid ? [hid] : [])]);
      return { moved: { [from]: to }, rewrittenFiles: [], ambiguous: [] };
    }

    const steps: OpStep[] = [];
    const rewritten: string[] = [];
    const ambiguous = new Set<string>();
    const ids = this.identities();
    for (const p of all) {
      const newPath = moves.get(p) ?? p;
      const f = this.d.files.read(p);
      if (!f) continue;
      let bytes: Uint8Array = f.bytes;
      let changed = false;
      if (isNoteFile(p) || isTaskFile(p)) {
        const r = rewriteFile(p, f.bytes.toString("utf8"), { filePath: p, newFilePath: newPath, moves, allPaths: all, ...(folderMoves ? { folderMoves } : {}) });
        r.ambiguous.forEach((a) => ambiguous.add(a));
        if (r.changes > 0) {
          bytes = Buffer.from(r.text);
          changed = true;
          rewritten.push(newPath);
        }
      }
      if (moves.has(p)) {
        steps.push({ action: "write", path: newPath, bytes });
        steps.push({ action: "delete", path: p });
      } else if (changed) steps.push({ action: "write", path: p, bytes });
    }
    for (const [o, n] of moves)
      if (ids[o]) {
        ids[n] = ids[o] as string;
        delete ids[o];
      }
    const folderList = this.folders().map((f) => (f === from || f.startsWith(`${from}/`) ? to + f.slice(from.length) : f));
    steps.push(this.jsonStep(IDENTITIES, ids), this.jsonStep(FOLDERS, folderList));
    const hiddenStep = this.hiddenStepFor(from, to);
    if (hiddenStep) steps.push(hiddenStep);
    await this.d.ops.run(`mv-${Date.now().toString(36)}`, isDir ? "move-folder" : "move-file", dedupeWrites(steps));
    if (isDir) removeEmptyDirs(this.d.files.abs(from));
    this.d.index.refreshPaths([...moves.keys(), ...moves.values(), ...rewritten]);
    return { moved: Object.fromEntries(moves), rewrittenFiles: rewritten, ambiguous: [...ambiguous] };
  }

  /**
   * 仅大小写变化：大小写不敏感的文件系统上 from 与 to 是同一物理文件，不能"写新+删旧"。
   * 这里经临时名做两次物理重命名，再单独改写双链与登记。
   */
  private async caseOnlyRename(from: string, to: string, isDir: boolean): Promise<MoveResult> {
    const all = this.allFiles();
    const moves = new Map<string, string>();
    if (isDir) {
      for (const p of all) if (p.startsWith(`${from}/`)) moves.set(p, `${to}${p.slice(from.length)}`);
    } else moves.set(from, to);
    const folderMoves = isDir ? new Map([[from, to]]) : undefined;
    const tmp = `${from}.huhu-case-tmp`;
    renameSync(this.d.files.abs(from), this.d.files.abs(tmp));
    renameSync(this.d.files.abs(tmp), this.d.files.abs(to));
    const steps: OpStep[] = [];
    const rewritten: string[] = [];
    const ambiguous = new Set<string>();
    for (const p of all) {
      if (moves.has(p) || !(isNoteFile(p) || isTaskFile(p))) continue;
      const f = this.d.files.read(p);
      if (!f) continue;
      const r = rewriteFile(p, f.bytes.toString("utf8"), { filePath: p, newFilePath: p, moves, allPaths: all, ...(folderMoves ? { folderMoves } : {}) });
      r.ambiguous.forEach((a) => ambiguous.add(a));
      if (r.changes > 0) {
        steps.push({ action: "write", path: p, bytes: Buffer.from(r.text) });
        rewritten.push(p);
      }
    }
    const ids = this.identities();
    for (const [o, n] of moves)
      if (ids[o]) {
        ids[n] = ids[o] as string;
        delete ids[o];
      }
    steps.push(
      this.jsonStep(IDENTITIES, ids),
      this.jsonStep(
        FOLDERS,
        this.folders().map((f) => (f === from || f.startsWith(`${from}/`) ? to + f.slice(from.length) : f)),
      ),
    );
    const hiddenStep = this.hiddenStepFor(from, to);
    if (hiddenStep) steps.push(hiddenStep);
    await this.d.ops.run(`case-${Date.now().toString(36)}`, "rename-case", dedupeWrites(steps));
    this.d.index.refreshPaths([...moves.keys(), ...moves.values(), ...rewritten]);
    return { moved: Object.fromEntries(moves), rewrittenFiles: rewritten, ambiguous: [...ambiguous] };
  }

  // ---- 回收站 ----
  async trash(rel: string): Promise<{ trashId: string }> {
    const norm = normalizeRelPath(rel);
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
  async save(rel: string, text: string, expectedVersion: string): Promise<{ version: string }> {
    const norm = normalizeRelPath(rel);
    const r = await this.d.files.write(norm, Buffer.from(text), { expectedVersion });
    this.d.index.refreshPaths([norm]);
    return r;
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
    return { path: rel, text: f.bytes.toString("utf8"), version: f.version };
  }

  backlinks(rel: string): { path: string; title: string }[] {
    return this.d.index.backlinks(rel);
  }
}

/** 递归删除空目录（文件夹移走后留下的空壳）；含文件的目录不动。 */
function removeEmptyDirs(dir: string): boolean {
  if (!existsSync(dir)) return true;
  let empty = true;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory() && removeEmptyDirs(path.join(dir, ent.name))) continue;
    empty = false;
  }
  if (empty) rmSync(dir, { recursive: true, force: true });
  return empty;
}

/** 同一路径的多个 write 步骤只保留最后一个（例如 identities.json）。 */
function dedupeWrites(steps: OpStep[]): OpStep[] {
  const lastWrite = new Map<string, number>();
  steps.forEach((s, i) => {
    if (s.action === "write") lastWrite.set(s.path, i);
  });
  return steps.filter((s, i) => s.action !== "write" || lastWrite.get(s.path) === i);
}
