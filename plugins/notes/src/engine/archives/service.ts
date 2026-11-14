import { randomInt } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path/posix";
import { errors, fieldNameProblem, fieldValueProblem, normalizeFieldName, RESERVED_FIELD_NAMES, type ArchiveDetailDto, type ArchiveDto, type ArchiveFieldDef, type ArchiveTypeDto, type EventPayload, type EventType } from "@huhu/contracts";
import {
  frontmatterScalarSources,
  normalizeRelPath,
  parseFrontmatter,
  parseWikiLinks,
  patchFrontmatter,
  renameFrontmatterKeys,
  replaceBody,
  resolveFolderLink,
  sanitizeTitle,
  splitDocument,
  type OperationLog,
  type OpStep,
  type VaultFiles,
  type VaultIndex,
} from "@huhu/vault";
import { validateName } from "../../shared/templates.js";
import type { NotesService } from "../service.js";

export interface ArchivesDeps {
  files: VaultFiles;
  ops: OperationLog;
  index: VaultIndex;
  notes: NotesService;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  now(): Date;
}

const ROOT = "Archives";
const INDEX = "index.md";
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const CODES = "abcdefghijklmnopqrstuvwxyz0123456789";
const randomCode = (): string => Array.from({ length: 4 }, () => CODES[randomInt(CODES.length)]).join("");
const isReservedKey = (k: string): boolean => (RESERVED_FIELD_NAMES as readonly string[]).includes(k.toLowerCase()) || k.toLowerCase().startsWith("huhu");

type FieldInput = Record<string, unknown>;

/**
 * 档案 = `Archives/<类型>/<名称>/` 下的文件夹笔记（判定只看路径）：
 * 类型文件夹的 `index.md` 是字段模板，档案文件夹的 `index.md` 存字段值与正文。
 * 枚举不依赖索引（空文件夹不进索引快照），直接读磁盘上 `Archives/` 的两层目录。
 */
export class ArchivesService {
  constructor(private readonly d: ArchivesDeps) {}

  // ---- 路径与磁盘 ----
  private abs(rel: string): string {
    return this.d.files.abs(rel);
  }
  private isDir(rel: string): boolean {
    const a = this.abs(rel);
    return existsSync(a) && statSync(a).isDirectory();
  }
  private dirNames(rel: string): string[] {
    if (!this.isDir(rel)) return [];
    return readdirSync(this.abs(rel), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
  }
  private text(rel: string): { text: string; version: string } | null {
    const f = this.d.files.read(rel);
    return f ? { text: f.bytes.toString("utf8"), version: f.version } : null;
  }
  private nameTaken(parent: string, name: string, except?: string): boolean {
    const abs = this.abs(parent);
    if (!existsSync(abs)) return false;
    const lower = name.toLowerCase();
    return readdirSync(abs).some((n) => n.toLowerCase() === lower && n.toLowerCase() !== (except ?? "").toLowerCase());
  }
  /** 清理名称；同级已有同名（不区分大小写）则追加 `-xxxx` 随机码，随机码此后就是名称的一部分。`except` 是正在改名的文件夹自身。 */
  private uniqueName(parent: string, raw: string, except?: string): string {
    const base = sanitizeTitle(raw, "");
    if (!base) throw errors.invalidInput("名称必填");
    const err = validateName(base);
    if (err) throw errors.invalidInput(err);
    if (!this.nameTaken(parent, base, except)) return base;
    const stem = [...base].slice(0, 75).join("");
    for (;;) {
      const candidate = `${stem}-${randomCode()}`;
      if (!this.nameTaken(parent, candidate, except)) return candidate;
    }
  }
  private typeDir(input: string): string {
    const norm = normalizeRelPath(input.replace(/\/+$/, ""));
    const rel = norm.includes("/") ? norm : `${ROOT}/${norm}`;
    const parts = rel.split("/");
    if (parts.length !== 2 || parts[0] !== ROOT || !this.isDir(rel)) throw errors.notFound(`档案类型不存在：${input}`);
    return rel;
  }
  private archiveDir(input: string): { dir: string; type: string } {
    const rel = normalizeRelPath(input.replace(/\/+$/, "").replace(/\/index\.md$/i, ""));
    const parts = rel.split("/");
    if (parts.length !== 3 || parts[0] !== ROOT || !this.isDir(rel)) throw errors.notFound(`档案不存在：${input}`);
    return { dir: rel, type: `${parts[0]}/${parts[1]}` };
  }
  private touch(paths: string[]): void {
    this.d.index.refreshPaths(paths);
  }
  private emit(dir: string, op: "created" | "updated" | "deleted"): void {
    const p = `${dir}/`;
    this.d.publish("entity.changed", { kind: "archive", id: p, path: p, noteId: this.d.notes.noteId(`${dir}/${INDEX}`), op });
  }

  // ---- 类型 ----
  private template(typeDir: string): { icon: string; fields: ArchiveFieldDef[]; body: string; version: string | null } {
    const f = this.text(`${typeDir}/${INDEX}`);
    if (!f) return { icon: "folder", fields: [], body: "", version: null };
    const fm = parseFrontmatter(f.text);
    const icon = typeof fm.data["icon"] === "string" && fm.data["icon"] ? (fm.data["icon"] as string) : "folder";
    const raw = Array.isArray(fm.data["fields"]) ? (fm.data["fields"] as unknown[]) : [];
    const fields = raw.flatMap((x): ArchiveFieldDef[] => {
      const o = x as { name?: unknown; type?: unknown };
      return typeof o?.name === "string" && (o.type === "text" || o.type === "date" || o.type === "url" || o.type === "number") ? [{ name: o.name, type: o.type }] : [];
    });
    return { icon, fields, body: splitDocument(f.text).body, version: f.version };
  }

  private toType(typeDir: string): ArchiveTypeDto {
    const t = this.template(typeDir);
    return { path: `${typeDir}/`, name: path.basename(typeDir), icon: t.icon, fields: t.fields, count: this.dirNames(typeDir).length, noteId: this.d.notes.noteId(`${typeDir}/${INDEX}`) };
  }

  types(): ArchiveTypeDto[] {
    return this.dirNames(ROOT).map((n) => this.toType(`${ROOT}/${n}`));
  }

  private checkFields(fields: readonly ArchiveFieldDef[]): ArchiveFieldDef[] {
    const seen = new Set<string>();
    return fields.map((f) => {
      const name = normalizeFieldName(f.name);
      const problem = fieldNameProblem(name);
      if (problem) throw errors.invalidInput(problem);
      if (seen.has(name)) throw errors.invalidInput(`字段名「${name}」重复`);
      seen.add(name);
      return { name, type: f.type };
    });
  }

  /**
   * 新建（不传 path）或更新类型模板。字段改名由 `renames` 显式声明：同一次调用把该类型下所有档案的 from 键改为 to 键，
   * 与模板写入在一个 OperationLog 操作里完成，失败整体回滚；任一档案已有目标键或 frontmatter 无法解析时整体拒绝并列出相关文件。
   */
  async saveType(input: { path?: string; name: string; icon?: string; fields: ArchiveFieldDef[]; renames?: { from: string; to: string }[] }): Promise<ArchiveTypeDto> {
    const fields = this.checkFields(input.fields);
    if (!input.path) {
      const dirName = this.uniqueName(ROOT, input.name);
      const dir = `${ROOT}/${dirName}`;
      mkdirSync(this.abs(dir), { recursive: true });
      const text = patchFrontmatter("", { icon: input.icon ?? "folder", fields });
      await this.d.files.write(`${dir}/${INDEX}`, Buffer.from(text), { expectedVersion: null });
      await this.d.notes.ensureId(`${dir}/${INDEX}`);
      this.touch([`${dir}/${INDEX}`]);
      this.emit(dir, "created");
      return this.toType(dir);
    }
    let dir = this.typeDir(input.path);
    const cur = this.template(dir);
    const names = new Set(fields.map((f) => f.name));
    const renames = (input.renames ?? []).map((r) => ({ from: normalizeFieldName(r.from), to: normalizeFieldName(r.to) })).filter((r) => r.from !== r.to);
    for (const r of renames) if (!names.has(r.to)) throw errors.invalidInput(`改名后的字段「${r.to}」不在字段列表里`);
    const steps: OpStep[] = [];
    const written: string[] = [];
    if (renames.length > 0) {
      const problems: string[] = [];
      for (const a of this.dirNames(dir)) {
        const rel = `${dir}/${a}/${INDEX}`;
        const f = this.text(rel);
        if (!f) continue;
        try {
          const out = renameFrontmatterKeys(f.text, renames);
          if (out !== f.text) {
            steps.push({ action: "write", path: rel, bytes: Buffer.from(out) });
            written.push(rel);
          }
        } catch (e) {
          problems.push(`${rel}：${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (problems.length > 0) throw errors.invalidInput(`字段改名被拒绝，以下档案需要先处理：\n${problems.join("\n")}`);
    }
    const idx = `${dir}/${INDEX}`;
    const before = this.text(idx)?.text ?? "";
    const next = patchFrontmatter(before, { icon: input.icon ?? cur.icon, fields });
    if (next !== before || !this.text(idx)) {
      steps.push({ action: "write", path: idx, bytes: Buffer.from(next) });
      written.push(idx);
    }
    if (steps.length > 0) await this.d.ops.run(`atype-${Date.now().toString(36)}`, "archive-template-save", steps);
    this.touch(written);
    if (written.includes(idx)) await this.d.notes.ensureId(idx);
    // 类型改名：经 notes 的移动逻辑（双链随之改写）。模板已经保存，改名失败时说明原因
    const wanted = sanitizeTitle(input.name, "");
    if (wanted && wanted.toLowerCase() !== path.basename(dir).toLowerCase()) {
      const target = this.uniqueName(ROOT, input.name, path.basename(dir));
      try {
        await this.d.notes.rename(dir, target);
        dir = `${ROOT}/${target}`;
      } catch (e) {
        throw errors.invalidInput(`字段已保存，但类型改名失败：${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (wanted && wanted !== path.basename(dir)) {
      await this.d.notes.rename(dir, wanted); // 仅大小写变化
      dir = `${ROOT}/${wanted}`;
    }
    this.emit(dir, "updated");
    return this.toType(dir);
  }

  /** 整个文件夹进入笔记回收站，返回其中的文件数。 */
  private async trashDir(dir: string): Promise<{ trashed: number }> {
    const n = this.d.index.entries(dir).filter((e) => e.type === "file").length;
    await this.d.notes.trash(dir);
    return { trashed: n };
  }
  async deleteType(input: string): Promise<{ trashed: number }> {
    const dir = this.typeDir(input);
    const r = await this.trashDir(dir);
    this.emit(dir, "deleted");
    return r;
  }

  // ---- 档案 ----
  private defsOf(typeDir: string): ArchiveFieldDef[] {
    return this.template(typeDir).fields;
  }

  private toArchive(dir: string, typeDir: string, defs: ArchiveFieldDef[]): ArchiveDto & { body: string; version: string | null } {
    const idx = `${dir}/${INDEX}`;
    const f = this.text(idx);
    const fields: Record<string, unknown> = {};
    const invalid: { name: string; reason: string }[] = [];
    let undef: string[] = [];
    let body = "";
    if (f) {
      const fm = parseFrontmatter(f.text);
      body = fm.doc.body.replace(/^\r?\n/, "");
      if (fm.errors.length) invalid.push({ name: "frontmatter", reason: `frontmatter 无法解析：${fm.errors[0]}` });
      else {
        const src = frontmatterScalarSources(f.text);
        for (const def of defs) {
          const raw = fm.data[def.name];
          if (raw === undefined || raw === null) continue;
          const value = def.type === "text" ? (src[def.name] ?? (typeof raw === "object" ? JSON.stringify(raw) : String(raw))) : raw instanceof Date ? raw.toISOString().slice(0, 10) : raw;
          fields[def.name] = value;
          const reason = fieldValueProblem(def, value);
          if (reason) invalid.push({ name: def.name, reason });
        }
        const known = new Set(defs.map((x) => x.name));
        undef = Object.keys(fm.data).filter((k) => !known.has(k) && !isReservedKey(k));
      }
    }
    const stat = statSync(this.abs(f ? idx : dir));
    return { path: `${dir}/`, name: path.basename(dir), type: `${typeDir}/`, fields, undefinedFields: undef, invalidFields: invalid, noteId: this.d.notes.noteId(idx), updatedAt: iso(stat.mtime), body, version: f?.version ?? null };
  }

  list(q: { type?: string; query?: string } = {}): ArchiveDto[] {
    const typeDirs = q.type ? [this.typeDir(q.type)] : this.dirNames(ROOT).map((n) => `${ROOT}/${n}`);
    const needle = q.query?.trim().toLowerCase();
    const out: ArchiveDto[] = [];
    for (const typeDir of typeDirs) {
      const defs = this.defsOf(typeDir);
      for (const name of this.dirNames(typeDir)) {
        const { body, version: _v, ...dto } = this.toArchive(`${typeDir}/${name}`, typeDir, defs);
        if (needle && !`${dto.name}\n${body}\n${Object.values(dto.fields).join("\n")}`.toLowerCase().includes(needle)) continue;
        out.push(dto);
      }
    }
    return out;
  }

  read(input: string): ArchiveDetailDto {
    const { dir, type } = this.archiveDir(input);
    const a = this.toArchive(dir, type, this.defsOf(type));
    const files = readdirSync(this.abs(dir), { withFileTypes: true })
      .filter((e) => !e.name.startsWith(".") && e.name !== INDEX)
      .map((e) => ({ path: `${dir}/${e.name}`, name: e.name, kind: e.isDirectory() ? ("folder" as const) : /\.md$/i.test(e.name) ? ("note" as const) : ("file" as const) }))
      .sort((x, y) => x.name.localeCompare(y.name));
    const all = new Set(
      this.d.index
        .entries()
        .filter((e) => e.type === "file")
        .map((e) => e.path),
    );
    const exists = (t: string): boolean => {
      if (t.endsWith("/")) return this.isDir(t.replace(/\/+$/, ""));
      return all.has(t) || all.has(`${t}.md`) || resolveFolderLink(`${t}/`, (p) => all.has(p)) !== null || [...all].some((p) => path.basename(p, path.extname(p)) === t);
    };
    const outgoing = parseWikiLinks(a.body).map((l) => ({ target: l.target, exists: exists(l.target) }));
    const seen = new Set<string>();
    const backlinks: { path: string; title: string }[] = [];
    for (const target of [`${dir}/${INDEX}`, ...[...all].filter((p) => p.startsWith(`${dir}/`) && /\.md$/i.test(p) && p !== `${dir}/${INDEX}`)]) {
      for (const b of this.d.index.backlinks(target)) {
        if (b.path.startsWith(`${dir}/`) || seen.has(b.path)) continue; // 档案文件夹内部文件之间的链接不算
        seen.add(b.path);
        backlinks.push(b);
      }
    }
    return { ...a, files, outgoing, backlinks };
  }

  private fieldChanges(defs: ArchiveFieldDef[], fields: FieldInput): Record<string, unknown> {
    const known = new Map(defs.map((x) => [x.name, x]));
    const changes: Record<string, unknown> = {};
    // 按模板中的字段顺序写入，文件里的键序稳定
    const order = (k: string) => defs.findIndex((x) => x.name === normalizeFieldName(k));
    for (const [rawKey, value] of Object.entries(fields).sort((a, b) => order(a[0]) - order(b[0]))) {
      const key = normalizeFieldName(rawKey);
      const def = known.get(key);
      if (!def) throw errors.invalidInput(`「${key}」不是该类型的字段`);
      const problem = fieldValueProblem(def, value);
      if (problem) throw errors.invalidInput(problem);
      changes[key] = value === undefined || value === null || value === "" ? undefined : def.type === "number" ? Number(value) : String(value);
    }
    return changes;
  }

  async create(input: { type: string; name: string; fields?: FieldInput | undefined; body?: string | undefined }): Promise<ArchiveDto> {
    const typeDir = this.typeDir(input.type);
    const defs = this.defsOf(typeDir);
    const changes = this.fieldChanges(defs, input.fields ?? {});
    const name = this.uniqueName(typeDir, input.name);
    const dir = `${typeDir}/${name}`;
    const idx = `${dir}/${INDEX}`;
    const head = patchFrontmatter("", changes, { quoted: defs.filter((x) => x.type === "text").map((x) => x.name) });
    mkdirSync(this.abs(dir), { recursive: true });
    await this.d.files.write(idx, Buffer.from(head + (input.body ?? "")), { expectedVersion: null });
    await this.d.notes.ensureId(idx);
    this.touch([idx]);
    this.emit(dir, "created");
    return this.read(dir);
  }

  /**
   * 条件写 index.md（字段与已有值合并，removeKeys 删除未定义字段），然后按需移动文件夹改名。
   * 改名失败时字段的修改保留，错误里说明改名没有成功。
   */
  async update(input: { path: string; expectedVersion?: string | undefined; fields?: FieldInput | undefined; body?: string | undefined; name?: string | undefined; removeKeys?: string[] | undefined }): Promise<ArchiveDto> {
    const { dir, type } = this.archiveDir(input.path);
    const defs = this.defsOf(type);
    const idx = `${dir}/${INDEX}`;
    const cur = this.text(idx);
    const changes = this.fieldChanges(defs, input.fields ?? {});
    for (const k of input.removeKeys ?? []) {
      if (isReservedKey(k)) throw errors.invalidInput(`「${k}」不能删除`);
      changes[k] = undefined;
    }
    const touched = Object.keys(changes).length > 0 || input.body !== undefined;
    if (touched) {
      let text = cur?.text ?? "";
      try {
        text = patchFrontmatter(text, changes, { quoted: defs.filter((x) => x.type === "text").map((x) => x.name) });
      } catch (e) {
        throw errors.invalidInput(e instanceof Error ? e.message : String(e));
      }
      if (input.body !== undefined) text = replaceBody(text, input.body);
      if (text !== (cur?.text ?? "")) {
        await this.d.files.write(idx, Buffer.from(text), { expectedVersion: cur ? (input.expectedVersion ?? cur.version) : null });
        await this.d.notes.ensureId(idx);
        this.touch([idx]);
      }
    }
    let finalDir = dir;
    if (input.name !== undefined) {
      const wanted = sanitizeTitle(input.name, "");
      if (!wanted) throw errors.invalidInput("名称必填");
      if (wanted !== path.basename(dir)) {
        const target = wanted.toLowerCase() === path.basename(dir).toLowerCase() ? wanted : this.uniqueName(type, input.name, path.basename(dir));
        try {
          await this.d.notes.rename(dir, target);
          finalDir = `${type}/${target}`;
        } catch (e) {
          this.emit(dir, "updated");
          throw errors.invalidInput(`字段已保存，但改名没有成功：${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    this.emit(finalDir, "updated");
    const { body: _b, version: _v, ...dto } = this.toArchive(finalDir, type, defs);
    return dto;
  }

  /** 移到另一个类型：移动文件夹（重名先算好随机码），值不变，不做字段映射。 */
  async move(input: { path: string; type: string }): Promise<ArchiveDto> {
    const { dir, type } = this.archiveDir(input.path);
    const target = this.typeDir(input.type);
    if (target === type) {
      const { body: _b, version: _v, ...same } = this.toArchive(dir, type, this.defsOf(type));
      return same;
    }
    const name = path.basename(dir);
    const finalName = this.nameTaken(target, name) ? this.uniqueName(target, name) : name;
    await this.d.notes.moveEntry(dir, `${target}/${finalName}`);
    const next = `${target}/${finalName}`;
    this.emit(next, "updated");
    const { body: _b, version: _v, ...dto } = this.toArchive(next, target, this.defsOf(target));
    return dto;
  }

  /** 给档案添加附件（桌面界面用）：不覆盖已有文件，重名加随机码。 */
  async addFile(input: { path: string; name: string; dataBase64: string }): Promise<{ path: string }> {
    const { dir } = this.archiveDir(input.path);
    const ext = path.extname(input.name);
    const stem = this.uniqueName(dir, path.basename(input.name, ext));
    const rel = `${dir}/${stem}${ext}`;
    const bytes = Buffer.from(input.dataBase64, "base64");
    if (bytes.length > 50 * 1024 * 1024) throw errors.invalidInput("附件不能超过 50 MB");
    await this.d.files.write(rel, bytes, { expectedVersion: null });
    this.touch([rel]);
    this.emit(dir, "updated");
    return { path: rel };
  }

  async delete(input: string): Promise<{ trashed: number }> {
    const { dir } = this.archiveDir(input);
    const r = await this.trashDir(dir);
    this.emit(dir, "deleted");
    return r;
  }
}
