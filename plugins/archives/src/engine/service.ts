import { errors, type ArchiveFrontmatter, type ArchiveTypeFrontmatter, type EventPayload, type EventType } from "@huhu/contracts";
import type { Entity, OperationLog, OpStep, SemanticRepository, VaultFiles } from "@huhu/vault";
import { patchFrontmatter } from "@huhu/vault";

export interface ArchivesDeps {
  repo: SemanticRepository;
  files: VaultFiles;
  ops: OperationLog;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  now(): Date;
}

export interface ArchiveDto {
  id: string;
  path: string;
  version: string;
  name: string;
  type: string;
  fields: Record<string, unknown>;
  relatedIds: string[];
  noteIds: string[];
  body: string;
  updatedAt: string;
  readOnly: boolean;
  /** 在类型定义中不存在、但档案里保留的字段键。 */
  undefinedFields: string[];
  /** relatedIds 中已不存在的档案 id。 */
  staleRelations: string[];
}

export interface ArchiveTypeDto {
  id: string;
  path: string;
  version: string;
  name: string;
  icon: string;
  fields: ArchiveTypeFrontmatter["fields"];
  body: string;
}

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const httpUrl = (v: unknown) => typeof v === "string" && /^https?:\/\/[^\s]+$/i.test(v);

/** 档案业务规则（modules/archives.md）：类型与字段、双向关系、迁移、删除时清理关系。 */
export class ArchivesService {
  constructor(private readonly d: ArchivesDeps) {}

  private toType(e: Entity): ArchiveTypeDto {
    const x = e.data as unknown as ArchiveTypeFrontmatter;
    return { id: e.id, path: e.path, version: e.version, name: x.name, icon: x.icon, fields: x.fields, body: e.body.replace(/^\r?\n/, "") };
  }

  types(): ArchiveTypeDto[] {
    return this.d.repo.list("archive-type").map((e) => this.toType(e));
  }

  private toArchive(e: Entity, types: ArchiveTypeDto[], ids: Set<string>): ArchiveDto {
    const x = e.data as unknown as ArchiveFrontmatter;
    const def = types.find((t) => t.id === x.type);
    const defined = new Set((def?.fields ?? []).map((f) => f.id));
    return {
      id: e.id,
      path: e.path,
      version: e.version,
      name: x.name,
      type: x.type,
      fields: x.fields,
      relatedIds: x.relatedIds,
      noteIds: x.noteIds,
      body: e.body.replace(/^\r?\n/, ""),
      updatedAt: x.updatedAt,
      readOnly: e.readOnly,
      undefinedFields: Object.keys(x.fields).filter((k) => !defined.has(k)),
      staleRelations: x.relatedIds.filter((r) => !ids.has(r)),
    };
  }

  list(q: { type?: string; query?: string } = {}): ArchiveDto[] {
    const types = this.types();
    const entities = this.d.repo.list("archive");
    const ids = new Set(entities.map((e) => e.id));
    const needle = q.query?.trim().toLowerCase();
    return entities
      .map((e) => this.toArchive(e, types, ids))
      .filter((a) => !q.type || a.type === q.type)
      .filter((a) => !needle || `${a.name}\n${a.body}\n${Object.values(a.fields).join("\n")}`.toLowerCase().includes(needle));
  }

  read(id: string): ArchiveDto {
    return (
      this.list().find((a) => a.id === id) ??
      (() => {
        throw errors.notFound(`档案 ${id} 不存在`);
      })()
    );
  }

  private validateFields(typeId: string, fields: Record<string, unknown>): void {
    const def = this.types().find((t) => t.id === typeId);
    if (!def) throw errors.invalidInput("档案类型不存在");
    for (const f of def.fields) {
      const v = fields[f.id];
      if (v === undefined || v === null || v === "") continue;
      if (f.type === "url" && !httpUrl(v)) throw errors.invalidInput(`「${f.label}」需要 http(s) 链接`);
      if (f.type === "number" && typeof v !== "number" && Number.isNaN(Number(v))) throw errors.invalidInput(`「${f.label}」需要数字`);
      if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw errors.invalidInput(`「${f.label}」需要 YYYY-MM-DD 日期`);
    }
  }

  async create(input: { name: string; type: string; fields?: Record<string, unknown> | undefined; body?: string | undefined }): Promise<ArchiveDto> {
    if (!input.name.trim()) throw errors.invalidInput("名称必填");
    const fields = input.fields ?? {};
    this.validateFields(input.type, fields);
    const e = await this.d.repo.create("archive", { name: input.name.trim(), type: input.type, fields, relatedIds: [], noteIds: [], updatedAt: iso(this.d.now()) }, input.body ?? "");
    this.d.publish("entity.changed", { kind: "archive", id: e.id, op: "created" });
    return this.read(e.id);
  }

  async update(id: string, expectedVersion: string, patch: { name?: string | undefined; fields?: Record<string, unknown> | undefined; body?: string | undefined }): Promise<ArchiveDto> {
    const cur = this.read(id);
    if (patch.fields) this.validateFields(cur.type, patch.fields);
    if (patch.name !== undefined && !patch.name.trim()) throw errors.invalidInput("名称必填");
    const changes: Record<string, unknown> = { updatedAt: iso(this.d.now()) };
    if (patch.name !== undefined) changes["name"] = patch.name.trim();
    // 合并而不是替换：保留类型中已不存在的"未定义字段"
    if (patch.fields) changes["fields"] = { ...cur.fields, ...patch.fields };
    await this.d.repo.patch("archive", id, changes, expectedVersion, patch.body !== undefined ? (patch.body.startsWith("\n") ? patch.body : `\n${patch.body}`) : undefined);
    this.d.publish("entity.changed", { kind: "archive", id, op: "updated" });
    return this.read(id);
  }

  /** 更改类型：`fields` 原样保留（旧字段进入未定义字段）。 */
  async changeType(id: string, expectedVersion: string, type: string): Promise<ArchiveDto> {
    if (!this.types().some((t) => t.id === type)) throw errors.invalidInput("目标类型不存在");
    await this.d.repo.patch("archive", id, { type, updatedAt: iso(this.d.now()) }, expectedVersion);
    this.d.publish("entity.changed", { kind: "archive", id, op: "updated" });
    return this.read(id);
  }

  /** 无向关系：一个操作同时更新双方文件；对方不存在则保留在本方并标记失效。 */
  async setRelations(id: string, relatedIds: string[]): Promise<ArchiveDto> {
    const unique = [...new Set(relatedIds.filter((r) => r !== id))];
    const all = this.d.repo.list("archive");
    const self = all.find((e) => e.id === id);
    if (!self) throw errors.notFound(`档案 ${id} 不存在`);
    const prev = new Set((self.data as unknown as ArchiveFrontmatter).relatedIds);
    const next = new Set(unique);
    const steps: OpStep[] = [];
    const updatedAt = iso(this.d.now());
    const rewrite = (e: Entity, related: string[]) => {
      const text = this.d.files.read(e.path)?.bytes.toString("utf8") ?? "";
      steps.push({ action: "write", path: e.path, bytes: Buffer.from(patchFrontmatter(text, { relatedIds: related, updatedAt })) });
    };
    rewrite(self, unique);
    for (const other of all) {
      if (other.id === id) continue;
      const rel = new Set((other.data as unknown as ArchiveFrontmatter).relatedIds);
      const had = rel.has(id);
      const wants = next.has(other.id);
      if (wants && !had) rewrite(other, [...rel, id]);
      else if (!wants && prev.has(other.id) && had)
        rewrite(
          other,
          [...rel].filter((x) => x !== id),
        );
    }
    await this.d.ops.run(`rel-${id}-${Date.now().toString(36)}`, "archive-relations", steps);
    this.d.publish("entity.changed", { kind: "archive", id, op: "updated" });
    return this.read(id);
  }

  async linkNote(id: string, noteId: string): Promise<ArchiveDto> {
    const cur = this.read(id);
    if (cur.noteIds.includes(noteId)) return cur;
    await this.d.repo.patch("archive", id, { noteIds: [...cur.noteIds, noteId], updatedAt: iso(this.d.now()) }, cur.version);
    return this.read(id);
  }

  async unlinkNote(id: string, noteId: string): Promise<ArchiveDto> {
    const cur = this.read(id);
    await this.d.repo.patch("archive", id, { noteIds: cur.noteIds.filter((n) => n !== noteId), updatedAt: iso(this.d.now()) }, cur.version);
    return this.read(id);
  }

  /** 硬删除，并在同一操作中清理其他档案 relatedIds 中的该 id。 */
  async delete(id: string): Promise<void> {
    const all = this.d.repo.list("archive");
    const self = all.find((e) => e.id === id);
    if (!self) throw errors.notFound(`档案 ${id} 不存在`);
    const steps: OpStep[] = [{ action: "delete", path: self.path }];
    for (const other of all) {
      const related = (other.data as unknown as ArchiveFrontmatter).relatedIds;
      if (other.id !== id && related.includes(id)) {
        const text = this.d.files.read(other.path)?.bytes.toString("utf8") ?? "";
        steps.push({ action: "write", path: other.path, bytes: Buffer.from(patchFrontmatter(text, { relatedIds: related.filter((r) => r !== id) })) });
      }
    }
    await this.d.ops.run(`del-${id}-${Date.now().toString(36)}`, "archive-delete", steps);
    this.d.publish("entity.changed", { kind: "archive", id, op: "deleted" });
  }

  // ---- 类型 ----
  async saveType(input: { id?: string; name: string; icon?: string; fields: ArchiveTypeFrontmatter["fields"]; body?: string; expectedVersion?: string }): Promise<ArchiveTypeDto> {
    if (!input.name.trim()) throw errors.invalidInput("类型名称必填");
    const ids = input.fields.map((f) => f.id);
    if (new Set(ids).size !== ids.length) throw errors.invalidInput("字段标识重复");
    if (this.types().some((t) => t.id !== input.id && t.name === input.name.trim())) throw errors.nameConflict(input.name);
    if (!input.id) {
      const e = await this.d.repo.create("archive-type", { name: input.name.trim(), icon: input.icon ?? "folder", fields: input.fields }, input.body ?? "");
      this.d.publish("entity.changed", { kind: "archive-type", id: e.id, op: "created" });
      return this.toType(e);
    }
    const cur = this.types().find((t) => t.id === input.id);
    if (!cur) throw errors.notFound("类型不存在");
    const e = await this.d.repo.patch(
      "archive-type",
      input.id,
      { name: input.name.trim(), icon: input.icon ?? cur.icon, fields: input.fields },
      input.expectedVersion ?? cur.version,
      input.body !== undefined ? `\n${input.body}` : undefined,
    );
    this.d.publish("entity.changed", { kind: "archive-type", id: e.id, op: "updated" });
    return this.toType(e);
  }

  /** 删除类型；类型下有档案时必须给 migrateTo，迁移与删除在一个操作中完成。 */
  async deleteType(id: string, migrateTo?: string): Promise<{ migrated: number }> {
    const type = this.types().find((t) => t.id === id);
    if (!type) throw errors.notFound("类型不存在");
    const affected = this.d.repo.list("archive").filter((e) => (e.data as unknown as ArchiveFrontmatter).type === id);
    if (affected.length > 0) {
      if (!migrateTo) throw errors.invalidInput(`该类型下有 ${affected.length} 个档案，请选择迁移目标类型`);
      if (migrateTo === id || !this.types().some((t) => t.id === migrateTo)) throw errors.invalidInput("迁移目标类型无效");
    }
    const steps: OpStep[] = [];
    for (const e of affected) {
      const text = this.d.files.read(e.path)?.bytes.toString("utf8") ?? "";
      const out = patchFrontmatter(text, { type: migrateTo, updatedAt: iso(this.d.now()) });
      steps.push({ action: "write", path: e.path, bytes: Buffer.from(out) });
    }
    steps.push({ action: "delete", path: type.path });
    await this.d.ops.run(`deltype-${id}-${Date.now().toString(36)}`, "archive-type-delete", steps);
    this.d.publish("entity.changed", { kind: "archive-type", id, op: "deleted" });
    return { migrated: affected.length };
  }
}
