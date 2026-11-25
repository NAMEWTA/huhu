import { randomUUID } from "node:crypto";
import { errors, type CommentFrontmatter, type EventPayload, type EventType } from "@huhu/contracts";
import { patchFrontmatter, type Entity, type OperationLog, type OpStep, type SemanticRepository, type VaultFiles } from "@huhu/vault";
import { requireUtf8 } from "../text-encoding.js";
import { bestByContext, createAnchor, refind, type Anchor, type Span } from "./anchor.js";
import { findAllPassages } from "./passage-match.js";

export interface CommentDto {
  id: string;
  path: string;
  version: string;
  documentId: string;
  documentPath: string;
  target: "body" | "file" | "property";
  property: string | null;
  anchor: (Anchor & { sourceVersion: string }) | null;
  state: "anchored" | "orphaned";
  createdAt: string;
  updatedAt: string;
  author: string;
  text: string;
}

export interface CommentsDeps {
  repo: SemanticRepository;
  files: VaultFiles;
  /** 笔记路径 → 稳定 id（必要时分配）。 */
  ensureId(rel: string): Promise<string>;
  noteId(rel: string): string | null;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  now(): Date;
}

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const legacyAuthor = (body: string): string => /^### \S+ · ([^\r\n]+)$/m.exec(body.replace(/\r\n/g, "\n"))?.[1] ?? "历史批注";

/** 前置 frontmatter 之后的正文起点（批注的引用文字只在正文里找，不匹配 YAML）。 */
export function bodyStart(text: string): number {
  const offset = text.startsWith("\uFEFF") ? 1 : 0;
  if (!text.startsWith("---\n", offset)) return 0;
  const m = /\n---[ \t]*(?:\n|$)/.exec(text.slice(offset + 3));
  return m ? offset + 3 + m.index + m[0].length : 0;
}

function createBodyAnchor(text: string, start: number, end: number): Anchor {
  const from = bodyStart(text);
  if (start < from) return createAnchor(text, start, end);
  return { ...createAnchor(text.slice(from), start - from, end - from), start, end };
}

/** 选区描述：源码偏移（源码模式 / 重新选择位置的旧入口），或编辑器里选中的“引用文字 + 上下文”（富文本模式，不使用 PM 坐标）。 */
export interface RangeInput {
  start?: number | undefined;
  end?: number | undefined;
  quote?: string | undefined;
  prefix?: string | undefined;
  suffix?: string | undefined;
  expectedSourceVersion?: string | undefined;
}

/**
 * 把选区解析成已保存文本里的 [start,end)：偏移直接用；引用文字同时考虑字面与“渲染文本”命中（越过强调 / 链接等语法）；
 * 多处命中用 prefix/suffix 判优，仍并列则报错——不猜位置（D04 / D05）。
 */
export function resolveRange(text: string, input: RangeInput): { start: number; end: number } {
  if (input.start !== undefined && input.end !== undefined) return { start: input.start, end: input.end };
  const quote = input.quote?.trim();
  if (!quote) throw errors.invalidInput("需要选区偏移或引用文字");
  const from = bodyStart(text);
  const literal: Span[] = [];
  for (let i = text.indexOf(quote, from); i !== -1; i = text.indexOf(quote, i + 1)) literal.push({ start: i, end: i + quote.length });
  const candidates = new Map(
    findAllPassages(text, quote)
      .filter((hit) => hit.start >= from)
      .map((hit) => [hit.start, hit]),
  );
  for (const hit of literal) candidates.set(hit.start, hit);
  const hits = [...candidates.values()];
  if (hits.length === 0) throw errors.invalidInput("引用的文字不在文档里（可能已修改，请重新选择）");
  if (hits.length === 1) return hits[0] as Span;
  const best = bestByContext(text, hits, { ...(input.prefix !== undefined ? { prefix: input.prefix } : {}), ...(input.suffix !== undefined ? { suffix: input.suffix } : {}) });
  if (best.length !== 1) throw errors.invalidInput("选中的文字在文档里出现多次，无法确定位置，请多选一些上下文");
  return best[0] as Span;
}

function toDto(e: Entity): CommentDto {
  const d = e.data as unknown as CommentFrontmatter;
  return {
    id: e.id,
    path: e.path,
    version: e.version,
    documentId: d.documentId,
    documentPath: d.documentPath,
    target: d.target,
    property: d.property ?? null,
    anchor: d.anchor ?? null,
    state: d.state,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    author: d.author ?? legacyAuthor(e.body),
    text: e.body.replace(/^\r?\n/, ""),
  };
}

/** 批注：`Comments/` 下的语义文件；锚点算法见 anchor.ts（R-24）。 */
export class CommentsService {
  constructor(private readonly d: CommentsDeps) {}

  /** 逐条保留原件，历史正文与所有消息作者、时间和顺序原样保留。 */
  async migrateLegacy(ops: OperationLog): Promise<void> {
    if (this.d.files.readOnly) return;
    for (const item of this.d.repo.list("comment")) {
      if (item.readOnly || item.data.contentFormat === "single") continue;
      try {
        const file = this.d.files.read(item.path);
        if (!file || file.version !== item.version) continue;
        const text = patchFrontmatter(requireUtf8(file.bytes), {
          contentFormat: "single",
          author: legacyAuthor(item.body),
          resolved: undefined,
        });
        await ops.run(randomUUID(), "comments-migrate-single", [
          { action: "write", path: `.huhu/comment-migrations/${item.id}-${file.version}.md`, bytes: file.bytes, expectedVersion: null },
          { action: "write", path: item.path, bytes: Buffer.from(text), expectedVersion: file.version },
        ]);
        this.d.repo.onWritten?.([item.path]);
        this.d.publish("entity.changed", { kind: "comment", id: item.id, op: "updated" });
      } catch (error) {
        console.warn("批注转换待重试", item.id, error instanceof Error ? error.name : "unknown");
      }
    }
  }

  /** 锚点偏移按编辑器看到的文本计算：CodeMirror 把 CRLF 归一为 LF，这里同样归一，偏移才对得上。 */
  private docText(rel: string, expectedSourceVersion?: string): { text: string; version: string } {
    const f = this.d.files.read(rel);
    if (!f) throw errors.notFound(`笔记不存在：${rel}`);
    if (expectedSourceVersion !== undefined && f.version !== expectedSourceVersion) throw errors.invalidInput("文档已改变，请重新选择");
    return { text: f.bytes.toString("utf8").replace(/\r\n?/g, "\n"), version: f.version };
  }

  list(rel?: string): CommentDto[] {
    const id = rel ? this.d.noteId(rel) : null;
    // 旧评论可能捕获了 YAML。只有源版本仍一致时，才给读取者裁掉不可见的那段上下文。
    const legacySources = new Map<string, { version: string; bodyOffset: number }>();
    return (
      this.d.repo
        .list("comment")
        .map(toDto)
        // 有稳定 id 就只按 id 匹配（回收站里同路径的旧笔记批注不会贴到同名新笔记上）；没有 id 才按路径
        .filter((c) => !rel || (id !== null ? c.documentId === id : c.documentPath === rel))
        .map((comment) => {
          const anchor = comment.anchor;
          if (!anchor?.prefix.includes("\n---")) return comment;
          const path = rel ?? comment.documentPath;
          let source = legacySources.get(path);
          if (!source) {
            const file = this.d.files.read(path);
            if (!file) return comment;
            source = { version: file.version, bodyOffset: bodyStart(file.bytes.toString("utf8").replace(/\r\n?/g, "\n")) };
            legacySources.set(path, source);
          }
          if (source.version !== anchor.sourceVersion || anchor.start < source.bodyOffset) return comment;
          const skip = source.bodyOffset - (anchor.start - anchor.prefix.length);
          if (skip <= 0) return comment;
          return { ...comment, anchor: { ...anchor, prefix: anchor.prefix.slice(skip) } };
        })
        .sort((a, b) => (a.anchor?.start ?? -1) - (b.anchor?.start ?? -1) || a.createdAt.localeCompare(b.createdAt))
    );
  }

  async create(input: RangeInput & { path: string; target: "body" | "file" | "property"; property?: string; text: string; author: string }): Promise<CommentDto> {
    const text = input.text.trim();
    if (!text) throw errors.invalidInput("批注内容不能为空");
    if (input.target === "property" && !input.property?.trim()) throw errors.invalidInput("属性批注需要指定属性名");
    const doc = this.docText(input.path, input.expectedSourceVersion);
    let anchor: CommentFrontmatter["anchor"] = null;
    if (input.target === "body") {
      if ((input.start === undefined || input.end === undefined) && !input.quote?.trim()) throw errors.invalidInput("正文批注需要选区");
      try {
        const r = resolveRange(doc.text, input);
        anchor = { ...createBodyAnchor(doc.text, r.start, r.end), sourceVersion: doc.version };
      } catch (e) {
        throw errors.invalidInput(e instanceof Error ? e.message : "选区无效");
      }
    }
    const documentId = await this.d.ensureId(input.path);
    if (input.expectedSourceVersion !== undefined && this.d.files.currentVersion(input.path) !== doc.version) {
      throw errors.invalidInput("文档已改变，请重新选择");
    }
    const now = iso(this.d.now());
    const e = await this.d.repo.create(
      "comment",
      { documentId, documentPath: input.path, target: input.target, property: input.target === "property" ? (input.property ?? null) : null, anchor, state: "anchored", contentFormat: "single", author: input.author, createdAt: now, updatedAt: now },
      text,
    );
    this.d.publish("entity.changed", { kind: "comment", id: e.id, op: "created" });
    return toDto(e);
  }

  async update(id: string, text: string, expectedVersion: string): Promise<CommentDto> {
    const body = text.trim();
    if (!body) throw errors.invalidInput("批注内容不能为空");
    const cur = this.d.repo.read("comment", id);
    if (cur.data.contentFormat !== "single") throw errors.invalidInput("批注尚未完成转换，请在可写知识库重开后重试");
    const e = await this.d.repo.patch("comment", id, { updatedAt: iso(this.d.now()) }, expectedVersion, `\n${body}`);
    this.d.publish("entity.changed", { kind: "comment", id, op: "updated" });
    return toDto(e);
  }

  /** 重新选择位置：用当前文档里的新选区重建锚点，状态回到 anchored。 */
  async relocate(id: string, range: RangeInput): Promise<CommentDto> {
    const cur = this.d.repo.read("comment", id);
    const data = cur.data as unknown as CommentFrontmatter;
    if (data.target !== "body") throw errors.invalidInput("只有正文批注可以重新选择位置");
    const doc = this.docText(data.documentPath, range.expectedSourceVersion);
    let anchor: CommentFrontmatter["anchor"];
    try {
      const r = resolveRange(doc.text, range);
      anchor = { ...createBodyAnchor(doc.text, r.start, r.end), sourceVersion: doc.version };
    } catch (e) {
      throw errors.invalidInput(e instanceof Error ? e.message : "选区无效");
    }
    const e = await this.d.repo.patch("comment", id, { anchor, state: "anchored", updatedAt: iso(this.d.now()) }, cur.version);
    this.d.publish("entity.changed", { kind: "comment", id, op: "updated" });
    return toDto(e);
  }

  async delete(id: string): Promise<void> {
    const cur = this.d.repo.read("comment", id);
    await this.d.repo.delete("comment", id, cur.version);
    this.d.publish("entity.changed", { kind: "comment", id, op: "deleted" });
  }

  /** 文档保存后：对该文档的正文批注重新定位；找不到或不唯一 → orphaned，不猜位置。 */
  async refind(rel: string, rawText: string, version: string, previous?: { text: string; version: string }): Promise<void> {
    const text = rawText.replace(/\r\n?/g, "\n");
    const previousText = previous?.text.replace(/\r\n?/g, "\n");
    const id = this.d.noteId(rel);
    const bodyOffset = bodyStart(text);
    for (const c of this.list(rel)) {
      if (c.state === "orphaned" || c.target !== "body" || !c.anchor || (id !== null && c.documentId !== id)) continue;
      const r = refind(text, c.anchor, bodyOffset, previous?.version === c.anchor.sourceVersion ? previousText : undefined);
      if (r.status === "anchored") {
        if (version === c.anchor.sourceVersion && c.state === "anchored") continue;
        const anchor = { ...createBodyAnchor(text, r.start, r.end), sourceVersion: version };
        await this.patchQuiet(c, { anchor, state: "anchored" });
      } else {
        await this.patchQuiet(c, { state: "orphaned" });
      }
    }
  }

  private async patchQuiet(c: CommentDto, changes: Record<string, unknown>): Promise<void> {
    await this.d.repo.patch("comment", c.id, { ...changes, updatedAt: iso(this.d.now()) }, c.version);
    this.d.publish("entity.changed", { kind: "comment", id: c.id, op: "updated" });
  }

  /** 笔记改名 / 移动：同一操作里更新批注的 documentPath（moved: 旧路径 → 新路径）。 */
  async moveDocuments(moved: Record<string, string>): Promise<void> {
    for (const c of this.d.repo.list("comment").map(toDto)) {
      const to = moved[c.documentPath];
      if (to && to !== c.documentPath) await this.patchQuiet(c, { documentPath: to });
    }
  }

  /** Keep comment changes in the same operation as the restored or purged documents. */
  trashProjection(documents: ReadonlyMap<string, string>, action: "restore" | "purge"): { steps: OpStep[]; publish(): void } {
    const steps: OpStep[] = [];
    const ids: string[] = [];
    for (const item of this.d.repo.list("comment")) {
      const comment = toDto(item);
      const target = documents.get(comment.documentId);
      if (target === undefined) continue;
      if (action === "purge") {
        steps.push({ action: "delete", path: item.path, expectedVersion: item.version });
      } else {
        if (comment.documentPath === target) continue;
        if (item.readOnly) throw errors.invalidInput(`无法更新只读批注：${item.path}`);
        const file = this.d.files.read(item.path);
        if (!file) throw errors.notFound(item.path);
        if (file.version !== item.version) throw errors.versionConflict(file.version);
        const text = patchFrontmatter(requireUtf8(file.bytes), { documentPath: target, updatedAt: iso(this.d.now()) });
        steps.push({ action: "write", path: item.path, bytes: Buffer.from(text), expectedVersion: file.version });
      }
      ids.push(comment.id);
    }
    return { steps, publish: () => {
      for (const id of ids) this.d.publish("entity.changed", { kind: "comment", id, op: action === "purge" ? "deleted" : "updated" });
    } };
  }

  /** 永久删除笔记时一并删除它的批注。 */
  async deleteForDocument(id: string | null, rel: string): Promise<void> {
    for (const c of this.d.repo.list("comment").map(toDto)) if (id !== null ? c.documentId === id : c.documentPath === rel) await this.delete(c.id);
  }
}
