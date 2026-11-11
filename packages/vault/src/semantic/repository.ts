import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { KINDS, errors, newId, type IdPrefix, type KindName } from "@huhu/contracts";
import { stringify } from "yaml";
import { OperationLog } from "../operations.js";
import type { VaultFiles } from "../write.js";
import { versionOf } from "../write.js";
import { semanticFilename } from "./filename.js";
import { joinDocument, parseFrontmatter, patchFrontmatter, replaceBody, splitDocument } from "./frontmatter.js";

export interface Entity<T = Record<string, unknown>> {
  kind: KindName;
  id: string;
  path: string;
  version: string;
  data: T;
  body: string;
  /** schema 比当前代码新：只读显示。 */
  readOnly: boolean;
}

export interface Problem {
  path: string;
  kind: KindName;
  code: "BAD_YAML" | "MISSING_ID" | "INVALID_SCHEMA" | "ID_CONFLICT";
  message: string;
}

const ID_PREFIX: Record<KindName, IdPrefix> = {
  task: "task",
  "task-run": "run",
  "automation-rule": "rule",
  "automation-run": "arun",
  "archive-type": "atype",
  archive: "archive",
  capture: "cap",
  comment: "cmt",
};

export class SemanticRepository {
  private problems = new Map<KindName, Problem[]>();

  constructor(
    private readonly files: VaultFiles,
    private readonly ops: OperationLog,
  ) {}

  /** 所有 kind 当前的问题列表（供健康中心）。 */
  problemList(): Problem[] {
    return [...this.problems.values()].flat();
  }

  private scanKind(kind: KindName): Entity[] {
    const spec = KINDS[kind];
    const problems: Problem[] = [];
    const found: Entity[] = [];
    let names: string[] = [];
    try {
      names = readdirSync(this.files.abs(spec.dir)).filter((n) => n.endsWith(".md"));
    } catch {
      // 目录尚不存在：没有该类实体
    }
    for (const name of names) {
      const rel = `${spec.dir}/${name}`;
      if (!statSync(this.files.abs(rel)).isFile()) continue;
      const file = this.files.read(rel);
      if (!file) continue;
      const text = file.bytes.toString("utf8");
      const fm = parseFrontmatter(text);
      if (fm.errors.length) {
        problems.push({ path: rel, kind, code: "BAD_YAML", message: fm.errors[0] ?? "YAML 无法解析" });
        continue;
      }
      const huhu = fm.data["huhu"] as { kind?: string; id?: string; schema?: number } | undefined;
      if (!huhu?.id || huhu.kind !== kind) {
        problems.push({ path: rel, kind, code: "MISSING_ID", message: "缺少 huhu.id 或 kind 不符" });
        continue;
      }
      const future = typeof huhu.schema === "number" && huhu.schema > spec.currentSchema;
      const parsed = spec.schema.safeParse(fm.data);
      if (!parsed.success && !future) {
        problems.push({ path: rel, kind, code: "INVALID_SCHEMA", message: parsed.error.issues[0]?.message ?? "字段不符合模式" });
        continue;
      }
      found.push({ kind, id: huhu.id, path: rel, version: file.version, data: (parsed.success ? parsed.data : fm.data) as Record<string, unknown>, body: fm.doc.body, readOnly: future });
    }
    // id 冲突：两者都不参与查询
    const byId = new Map<string, Entity[]>();
    for (const e of found) byId.set(e.id, [...(byId.get(e.id) ?? []), e]);
    const ok: Entity[] = [];
    for (const group of byId.values()) {
      if (group.length === 1) ok.push(group[0] as Entity);
      else for (const e of group) problems.push({ path: e.path, kind, code: "ID_CONFLICT", message: `id ${e.id} 被多个文件声明` });
    }
    this.problems.set(kind, problems);
    return ok.sort((a, b) => a.path.localeCompare(b.path));
  }

  list(kind: KindName): Entity[] {
    return this.scanKind(kind);
  }

  read(kind: KindName, id: string): Entity {
    const e = this.scanKind(kind).find((x) => x.id === id);
    if (!e) throw errors.notFound(`${kind} ${id} 不存在`);
    return e;
  }

  /** 新建语义文件；`data` 不含 huhu 头（由仓储写入）。 */
  async create(kind: KindName, data: Record<string, unknown>, body = ""): Promise<Entity> {
    const spec = KINDS[kind];
    const id = newId(ID_PREFIX[kind]);
    const full = { huhu: { kind, id, schema: spec.currentSchema }, ...data };
    const parsed = spec.schema.safeParse(full);
    if (!parsed.success) throw errors.invalidInput("字段不符合要求", parsed.error.issues);
    const title = String((full as Record<string, unknown>)[spec.titleField] ?? kind);
    const rel = `${spec.dir}/${semanticFilename(title, id)}`;
    const yamlText = stringify(full, { lineWidth: 0 });
    const text = joinDocument({ bom: "", eol: "\n", yaml: yamlText, body: body.length && !body.startsWith("\n") ? `\n${body}` : body });
    const { version } = await this.files.write(rel, Buffer.from(text), { expectedVersion: null });
    return { kind, id, path: rel, version, data: parsed.data as Record<string, unknown>, body: splitDocument(text).body, readOnly: false };
  }

  /**
   * 修改：只改变化的键，保留未知键、注释、顺序与换行符。
   * 标题字段变化时同步重命名文件（多文件操作，可恢复）。
   */
  async patch(kind: KindName, id: string, changes: Record<string, unknown>, expectedVersion: string, body?: string): Promise<Entity> {
    const spec = KINDS[kind];
    const cur = this.read(kind, id);
    if (cur.readOnly) throw errors.invalidInput("该文件由更新版本的 HUHU 创建，只读");
    if (cur.version !== expectedVersion) throw errors.versionConflict(cur.version);
    const text = this.files.read(cur.path)?.bytes.toString("utf8") ?? "";
    let next = patchFrontmatter(text, changes);
    if (body !== undefined) next = replaceBody(next, body);
    const merged = { ...parseFrontmatter(next).data };
    const check = spec.schema.safeParse(merged);
    if (!check.success) throw errors.invalidInput("字段不符合要求", check.error.issues);
    const title = String((check.data as Record<string, unknown>)[spec.titleField] ?? "");
    const wantPath = `${spec.dir}/${semanticFilename(title, id)}`;
    const bytes = Buffer.from(next);
    if (wantPath === cur.path) {
      const { version } = await this.files.write(cur.path, bytes, { expectedVersion });
      return { ...cur, version, data: check.data as Record<string, unknown>, body: splitDocument(next).body };
    }
    await this.ops.run(`ren-${id}-${Date.now().toString(36)}`, `rename-${kind}`, [
      { action: "write", path: wantPath, bytes },
      { action: "delete", path: cur.path },
    ]);
    return { ...cur, path: wantPath, version: versionOf(bytes), data: check.data as Record<string, unknown>, body: splitDocument(next).body };
  }

  async delete(kind: KindName, id: string, expectedVersion: string): Promise<void> {
    const cur = this.read(kind, id);
    if (cur.version !== expectedVersion) throw errors.versionConflict(cur.version);
    await this.ops.run(`del-${id}-${Date.now().toString(36)}`, `delete-${kind}`, [{ action: "delete", path: cur.path }]);
  }

  /** 目录是否存在某 kind 的任意文件（路径展示用）。 */
  dirOf(kind: KindName): string {
    return path.posix.join(KINDS[kind].dir);
  }
}
