import { codeRanges, inCodeRange } from "./codeRanges.js";

/** 评论允许的属性（顺序即写入顺序）。 */
export const COMMENT_ATTRS = ["id", "at", "source", "author", "run", "ask", "session", "event"] as const;
export type CommentAttr = (typeof COMMENT_ATTRS)[number];
export type CommentSource = "human" | "agent" | "system" | "external";
const SOURCES = new Set<string>(["human", "agent", "system", "external"]);

export interface ParsedComment {
  id: string;
  at: string;
  source: CommentSource;
  author?: string;
  run?: string;
  ask?: string;
  session?: string;
  event?: string;
  /** 评论内容（已去掉转义的 `\`）。 */
  body: string;
  /** 评论块（含开闭标签）在整个文本中的区间。 */
  range: [number, number];
}

export interface TaskRegions {
  /** `<task>` 内容（不含标签本身；已去掉转义的 `\`）。没有 `<task>` 时为 null。 */
  task: string | null;
  comments: ParsedComment[];
  /** `<task>` 区段（含开闭标签）区间；`<comments>` 区段区间。 */
  taskRange: [number, number] | null;
  commentsRange: [number, number] | null;
  /** 文件级问题：非空时任务不可派发。 */
  problems: string[];
  /** 两个区段之外的非空文本（原样保留，不参与派发）。 */
  strayText: boolean;
}

const TAG = /^[ \t]*(<task>|<\/task>|<comments>|<\/comments>|<\/comment>|<comment(?:\s+[a-z]+="[^"]*")*\s*>)[ \t]*$/;

/** 转义：内容中任何会被识别为结构标签的行，在行首加 `\`，评论内容无法伪造评论或闭合区段。 */
export function escapeContent(content: string): string {
  return content
    .split("\n")
    .map((line) => (TAG.test(line.replace(/\r$/, "")) ? line.replace(/^([ \t]*)/, "$1\\") : line))
    .join("\n");
}

/** 去掉转义：`\<comment …>` → `<comment …>`。 */
export function unescapeContent(content: string): string {
  return content
    .split("\n")
    .map((line) => (/^[ \t]*\\/.test(line) && TAG.test(line.replace(/\r$/, "").replace(/^([ \t]*)\\/, "$1")) ? line.replace(/^([ \t]*)\\/, "$1") : line))
    .join("\n");
}

const attrsOf = (tag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-z]+)="([^"]*)"/g)) out[m[1]!] = m[2]!;
  return out;
};
const attrEscape = (v: string): string => v.replace(/"/g, "&quot;").replace(/[\r\n]+/g, " ");
const attrUnescape = (v: string): string => v.replace(/&quot;/g, '"');

/** 解析任务文件正文（frontmatter 之后的部分）里的 `<task>` 与 `<comments>`。偏移相对于传入的 body。 */
export function parseTaskBody(body: string): TaskRegions {
  const ranges = codeRanges(body);
  const problems: string[] = [];
  type Ev = { kind: "task" | "/task" | "comments" | "/comments" | "comment" | "/comment"; start: number; end: number; tag: string };
  const events: Ev[] = [];
  for (let i = 0; i <= body.length;) {
    const nl = body.indexOf("\n", i);
    const lineEnd = nl === -1 ? body.length : nl;
    const raw = body.slice(i, lineEnd).replace(/\r$/, "");
    const m = TAG.exec(raw);
    if (m && !inCodeRange(ranges, i)) {
      const tag = m[1]!;
      const kind = tag.startsWith("</") ? (`/${tag.slice(2, -1)}` as Ev["kind"]) : (tag.slice(1).split(/[\s>]/)[0] as Ev["kind"]);
      events.push({ kind, start: i, end: nl === -1 ? body.length : nl + 1, tag });
    }
    if (nl === -1) break;
    i = nl + 1;
  }

  let task: string | null = null;
  let taskRange: [number, number] | null = null;
  let commentsRange: [number, number] | null = null;
  const comments: ParsedComment[] = [];
  const seenIds = new Set<string>();
  let state: "top" | "task" | "comments" | "comment" = "top";
  let open: Ev | null = null;
  let tasksSeen = 0;
  let commentsSeen = 0;
  let current: { ev: Ev; attrs: Record<string, string> } | null = null;
  const inner = (a: Ev, b: Ev) =>
    body
      .slice(a.end, b.start)
      .replace(/^(\r?\n)+/, "")
      .replace(/(\r?\n)+$/, "");

  for (const ev of events) {
    if (state === "top") {
      if (ev.kind === "task") {
        tasksSeen++;
        if (tasksSeen > 1) problems.push("<task> 区段重复");
        state = "task";
        open = ev;
      } else if (ev.kind === "comments") {
        commentsSeen++;
        if (commentsSeen > 1) problems.push("<comments> 区段重复");
        state = "comments";
        open = ev;
      } else problems.push(`出现位置不合法的标签：${ev.tag}`);
    } else if (state === "task") {
      if (ev.kind === "/task") {
        if (tasksSeen === 1) {
          task = unescapeContent(inner(open!, ev));
          taskRange = [open!.start, ev.end];
        }
        state = "top";
        open = null;
      } else problems.push(`<task> 内出现未转义的结构标签：${ev.tag}`);
    } else if (state === "comments") {
      if (ev.kind === "comment") {
        const attrs = attrsOf(ev.tag);
        current = { ev, attrs };
        state = "comment";
      } else if (ev.kind === "/comments") {
        if (commentsSeen === 1) commentsRange = [open!.start, ev.end];
        state = "top";
        open = null;
      } else problems.push(`<comments> 内出现不合法的标签：${ev.tag}`);
    } else if (state === "comment") {
      if (ev.kind === "/comment" && current) {
        const a = current.attrs;
        const miss = (["id", "at", "source"] as const).filter((k) => !a[k]);
        if (miss.length) problems.push(`评论缺少必需属性：${miss.join("、")}`);
        else if (!SOURCES.has(a["source"]!)) problems.push(`评论 ${a["id"]} 的 source 不合法`);
        else if (seenIds.has(a["id"]!)) problems.push(`评论 id 重复：${a["id"]}`);
        else {
          seenIds.add(a["id"]!);
          const c: ParsedComment = { id: a["id"]!, at: a["at"]!, source: a["source"] as CommentSource, body: unescapeContent(inner(current.ev, ev)), range: [current.ev.start, ev.end] };
          for (const k of ["author", "run", "ask", "session", "event"] as const) if (a[k] !== undefined) c[k] = attrUnescape(a[k]!);
          comments.push(c);
        }
        current = null;
        state = "comments";
      } else problems.push(`评论内出现未转义的结构标签：${ev.tag}`);
    }
  }
  if (state !== "top") problems.push(state === "task" ? "<task> 未闭合" : state === "comments" ? "<comments> 未闭合" : "<comment> 未闭合");
  if (tasksSeen === 0) problems.push("缺少 <task> 区段");

  const covered = [taskRange, commentsRange].filter(Boolean) as [number, number][];
  let strayText = false;
  let cursor = 0;
  for (const [a, b] of covered.sort((x, y) => x[0] - y[0])) {
    if (body.slice(cursor, a).trim()) strayText = true;
    cursor = b;
  }
  if (body.slice(cursor).trim()) strayText = true;
  return { task, comments, taskRange, commentsRange, problems, strayText };
}

const LF = "\n";
/** 新建任务文件正文：`<task>` 骨架（`content` 已转义）。 */
export function buildTaskBody(content: string): string {
  return `${LF}<task>${LF}${LF}${escapeContent(content.trim())}${LF}${LF}</task>${LF}`;
}

/** 只替换 `<task>` 区段的内容，区段之外的字节保持不变；没有 `<task>` 时追加一个。 */
export function replaceTaskSection(body: string, content: string): string {
  const r = parseTaskBody(body);
  const block = `<task>${LF}${LF}${escapeContent(content.trim())}${LF}${LF}</task>${LF}`;
  if (r.taskRange) return body.slice(0, r.taskRange[0]) + block + body.slice(r.taskRange[1]);
  return `${body.replace(/\s*$/, "")}${LF}${LF}${block}`;
}

export interface NewComment {
  id: string;
  at: string;
  source: CommentSource;
  author?: string | undefined;
  run?: string | undefined;
  ask?: string | undefined;
  session?: string | undefined;
  event?: string | undefined;
  body: string;
}

const commentBlock = (c: NewComment): string => {
  const attrs = COMMENT_ATTRS.flatMap((k) => (c[k] === undefined || c[k] === "" ? [] : [`${k}="${attrEscape(String(c[k]))}"`])).join(" ");
  return `<comment ${attrs}>${LF}${LF}${escapeContent(c.body.trim())}${LF}${LF}</comment>${LF}`;
};

/** 在 `</comments>` 前追加一条评论；没有 `<comments>` 区段就新建。按 id 去重：已存在返回 `{ body, added: false }`。 */
export function appendComment(body: string, c: NewComment): { body: string; added: boolean } {
  const r = parseTaskBody(body);
  if (r.comments.some((x) => x.id === c.id)) return { body, added: false };
  if (r.commentsRange) {
    const closeStart = r.commentsRange[1] - body.slice(r.commentsRange[0], r.commentsRange[1]).length + body.slice(r.commentsRange[0], r.commentsRange[1]).lastIndexOf("</comments>");
    return { body: `${body.slice(0, closeStart)}${commentBlock(c)}${LF}${body.slice(closeStart)}`, added: true };
  }
  return { body: `${body.replace(/\s*$/, "")}${LF}${LF}<comments>${LF}${LF}${commentBlock(c)}${LF}</comments>${LF}`, added: true };
}
