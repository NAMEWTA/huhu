import { errors, type CommentFrontmatter, type EventPayload, type EventType } from "@huhu/contracts";
import type { Entity, SemanticRepository, VaultFiles } from "@huhu/vault";
import { createAnchor, refind, type Anchor } from "./anchor.js";

export interface CommentMessage {
  at: string;
  author: string;
  text: string;
}
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
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  messages: CommentMessage[];
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
const HEADING = /^### (\S+) · (.*)$/;

/** 正文是消息列表：每条以 `### <ISO 时间> · <作者>` 开头。 */
export function parseMessages(body: string): CommentMessage[] {
  const out: CommentMessage[] = [];
  let cur: { at: string; author: string; lines: string[] } | null = null;
  for (const line of body.split(/\r?\n/)) {
    const m = HEADING.exec(line);
    if (m) {
      if (cur) out.push({ at: cur.at, author: cur.author, text: cur.lines.join("\n").trim() });
      cur = { at: m[1] ?? "", author: m[2] ?? "", lines: [] };
    } else cur?.lines.push(line);
  }
  if (cur) out.push({ at: cur.at, author: cur.author, text: cur.lines.join("\n").trim() });
  return out;
}
const formatMessage = (m: CommentMessage): string => `### ${m.at} · ${m.author}\n\n${m.text}\n`;

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
    resolved: d.resolved,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    messages: parseMessages(e.body),
  };
}

/** 批注：`Comments/` 下的语义文件；锚点算法见 anchor.ts（R-24）。 */
export class CommentsService {
  constructor(private readonly d: CommentsDeps) {}

  /** 锚点偏移按编辑器看到的文本计算：CodeMirror 把 CRLF 归一为 LF，这里同样归一，偏移才对得上。 */
  private docText(rel: string): { text: string; version: string } {
    const f = this.d.files.read(rel);
    if (!f) throw errors.notFound(`笔记不存在：${rel}`);
    return { text: f.bytes.toString("utf8").replace(/\r\n?/g, "\n"), version: f.version };
  }

  list(rel?: string): CommentDto[] {
    const id = rel ? this.d.noteId(rel) : null;
    return (
      this.d.repo
        .list("comment")
        .map(toDto)
        // 有稳定 id 就只按 id 匹配（回收站里同路径的旧笔记批注不会贴到同名新笔记上）；没有 id 才按路径
        .filter((c) => !rel || (id !== null ? c.documentId === id : c.documentPath === rel))
        .sort((a, b) => (a.anchor?.start ?? -1) - (b.anchor?.start ?? -1) || a.createdAt.localeCompare(b.createdAt))
    );
  }

  async create(input: { path: string; target: "body" | "file" | "property"; property?: string; start?: number; end?: number; text: string; author: string }): Promise<CommentDto> {
    const text = input.text.trim();
    if (!text) throw errors.invalidInput("批注内容不能为空");
    if (input.target === "property" && !input.property?.trim()) throw errors.invalidInput("属性批注需要指定属性名");
    const doc = this.docText(input.path);
    let anchor: CommentFrontmatter["anchor"] = null;
    if (input.target === "body") {
      if (input.start === undefined || input.end === undefined) throw errors.invalidInput("正文批注需要选区");
      try {
        anchor = { ...createAnchor(doc.text, input.start, input.end), sourceVersion: doc.version };
      } catch (e) {
        throw errors.invalidInput(e instanceof Error ? e.message : "选区无效");
      }
    }
    const documentId = await this.d.ensureId(input.path);
    const now = iso(this.d.now());
    const e = await this.d.repo.create(
      "comment",
      { documentId, documentPath: input.path, target: input.target, property: input.target === "property" ? (input.property ?? null) : null, anchor, state: "anchored", resolved: false, createdAt: now, updatedAt: now },
      formatMessage({ at: now, author: input.author, text }),
    );
    this.d.publish("entity.changed", { kind: "comment", id: e.id, op: "created" });
    return toDto(e);
  }

  async reply(id: string, text: string, author: string): Promise<CommentDto> {
    const body = text.trim();
    if (!body) throw errors.invalidInput("回复内容不能为空");
    const cur = this.d.repo.read("comment", id);
    const now = iso(this.d.now());
    const next = `${cur.body.replace(/\s+$/, "")}\n\n${formatMessage({ at: now, author, text: body })}`;
    const e = await this.d.repo.patch("comment", id, { updatedAt: now }, cur.version, next);
    this.d.publish("entity.changed", { kind: "comment", id, op: "updated" });
    return toDto(e);
  }

  async setResolved(id: string, resolved: boolean): Promise<CommentDto> {
    const cur = this.d.repo.read("comment", id);
    const e = await this.d.repo.patch("comment", id, { resolved, updatedAt: iso(this.d.now()) }, cur.version);
    this.d.publish("entity.changed", { kind: "comment", id, op: "updated" });
    return toDto(e);
  }

  /** 重新选择位置：用当前文档里的新选区重建锚点，状态回到 anchored。 */
  async relocate(id: string, start: number, end: number): Promise<CommentDto> {
    const cur = this.d.repo.read("comment", id);
    const data = cur.data as unknown as CommentFrontmatter;
    if (data.target !== "body") throw errors.invalidInput("只有正文批注可以重新选择位置");
    const doc = this.docText(data.documentPath);
    let anchor: CommentFrontmatter["anchor"];
    try {
      anchor = { ...createAnchor(doc.text, start, end), sourceVersion: doc.version };
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

  /** 文档保存后：对该文档未解决的正文批注重新定位；找不到或不唯一 → orphaned，不猜位置。 */
  async refind(rel: string, rawText: string, version: string): Promise<void> {
    const text = rawText.replace(/\r\n?/g, "\n");
    const id = this.d.noteId(rel);
    for (const c of this.list(rel)) {
      if (c.resolved || c.target !== "body" || !c.anchor || (id !== null && c.documentId !== id)) continue;
      const r = refind(text, c.anchor);
      if (r.status === "anchored") {
        if (r.start === c.anchor.start && r.end === c.anchor.end && c.state === "anchored") continue;
        const anchor = { ...createAnchor(text, r.start, r.end), sourceVersion: version };
        await this.patchQuiet(c, { anchor, state: "anchored" });
      } else if (c.state !== "orphaned") {
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

  /** 笔记从回收站恢复后，按稳定 id 同步批注里的路径。 */
  async syncPath(rel: string): Promise<void> {
    const id = this.d.noteId(rel);
    if (!id) return;
    for (const c of this.d.repo.list("comment").map(toDto)) if (c.documentId === id && c.documentPath !== rel) await this.patchQuiet(c, { documentPath: rel });
  }

  /** 永久删除笔记时一并删除它的批注。 */
  async deleteForDocument(id: string | null, rel: string): Promise<void> {
    for (const c of this.d.repo.list("comment").map(toDto)) if (id !== null ? c.documentId === id : c.documentPath === rel) await this.delete(c.id);
  }
}
