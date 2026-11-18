// hostFetch 的 comments 路由（S4）：把 OK 的 `/api/comments`、`/api/comment` 动作集适配到 Huhu 的 `comments.*` 能力。
// 本包不依赖业务模块：能力经 CommentsPort 由宿主（plugins/notes 的 commentAdapter）注入。
// 字段对照与差异登记见 .agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/comment-field-map.md。
import type { HostRoutes } from "../host-fetch";

/** Huhu `CommentDto` 的结构化副本（只含适配用到的字段；不 import 业务类型）。 */
export interface HuhuComment {
  id: string;
  documentPath: string;
  target: "body" | "file" | "property";
  property: string | null;
  anchor: { exact: string; prefix: string; suffix: string; start: number; end: number } | null;
  state: "anchored" | "orphaned";
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  messages: { at: string; author: string; text: string }[];
}

/** 选区：富文本里是“引用文字 + 上下文”（不使用 PM 坐标）；源码偏移只给重新选择位置的旧入口 / 源码模式 */
export interface PassageInput {
  quote?: string;
  prefix?: string;
  suffix?: string;
  start?: number;
  end?: number;
}

export interface CommentsPort {
  list(path?: string): Promise<HuhuComment[]>;
  create(input: PassageInput & { path: string; target: "body" | "file" | "property"; property?: string; text: string }): Promise<HuhuComment>;
  reply(id: string, text: string): Promise<HuhuComment>;
  resolve(id: string): Promise<HuhuComment>;
  reopen(id: string): Promise<HuhuComment>;
  relocate(id: string, range: PassageInput): Promise<HuhuComment>;
  delete(id: string): Promise<void>;
}

export interface CommentRouteDeps {
  port: CommentsPort;
  /** OK 的 docName（不带扩展名）→ Huhu 笔记路径 */
  pathOf(docName: string): string;
  /** Huhu 路径 → docName */
  docNameOf(path: string): string;
  /** 创建 / 重新定位之前把该文档的编辑落盘：引擎在已保存文本上解析引用文字（D05） */
  flush(docName: string): Promise<void>;
}

/** OK 线程元数据（`CommentThreadMetaSchema`）+ Huhu 扩展字段（P-S4-01：messages / resolved 状态在 state 里） */
export interface OkThreadMeta {
  threadId: string;
  docName: string;
  target: { kind: "body" } | { kind: "property"; key: string; path: (string | number)[] };
  anchor: { exact: string; prefix: string; suffix: string; start: number; end: number } | null;
  state: "anchored" | "orphaned" | "resolved";
  queued: false;
  latestComment: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  /** Huhu 扩展：整篇笔记批注（OK 没有这个目标） */
  scope: "body" | "file" | "property";
  messages: { at: string; author: string; text: string }[];
}

const ms = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

export function toThreadMeta(c: HuhuComment, docNameOf: (path: string) => string): OkThreadMeta {
  const first = c.messages[0];
  return {
    threadId: c.id,
    docName: docNameOf(c.documentPath),
    target: c.target === "property" && c.property ? { kind: "property", key: c.property, path: [] } : { kind: "body" },
    anchor: c.anchor,
    state: c.resolved ? "resolved" : c.state,
    queued: false,
    latestComment: first?.text ?? "",
    createdBy: first?.author ?? "Huhu",
    createdAt: ms(c.createdAt),
    updatedAt: ms(c.updatedAt),
    scope: c.target,
    messages: c.messages,
  };
}

interface CreateBody extends PassageInput {
  docName: string;
  propertyKey?: string;
  propertyPath?: (string | number)[];
  /** Huhu 扩展：true = 整篇笔记批注 */
  wholeFile?: boolean;
  body: string;
}

interface MutateBody {
  action: string;
  id: string;
  body?: string;
  quote?: string;
  prefix?: string;
  suffix?: string;
}

const notAvailable = (what: string): never => {
  throw new Error(`NOT_AVAILABLE: ${what} 在 Huhu 里不可用`);
};

/** AI 派发 / 队列类动作（queue / unqueue / dispatch-*）不接：登记于 comment-field-map.md。 */
const UNSUPPORTED = new Set(["queue", "unqueue", "dispatch-prepare-batch", "dispatch-complete-batch", "dispatch-prepare", "dispatch-complete", "edit"]);

export function commentRoutes(deps: CommentRouteDeps): HostRoutes {
  const meta = (c: HuhuComment) => toThreadMeta(c, deps.docNameOf);
  return {
    "GET /api/comments": async ({ url }) => {
      const doc = url.searchParams.get("doc");
      const list = await deps.port.list(doc ? deps.pathOf(doc) : undefined);
      return { threads: list.map(meta) };
    },
    "POST /api/comments": async ({ body }) => {
      const b = body as CreateBody;
      const path = deps.pathOf(b.docName);
      await deps.flush(b.docName);
      const propertyKey = b.propertyKey;
      const created = await deps.port.create({
        path,
        target: propertyKey ? "property" : b.wholeFile ? "file" : "body",
        ...(propertyKey ? { property: propertyKey } : {}),
        ...(b.quote !== undefined ? { quote: b.quote } : {}),
        ...(b.prefix !== undefined ? { prefix: b.prefix } : {}),
        ...(b.suffix !== undefined ? { suffix: b.suffix } : {}),
        ...(b.start !== undefined ? { start: b.start } : {}),
        ...(b.end !== undefined ? { end: b.end } : {}),
        text: b.body,
      });
      return meta(created);
    },
    "POST /api/comment": async ({ body }) => {
      const b = body as MutateBody;
      if (UNSUPPORTED.has(b.action)) return notAvailable(b.action);
      switch (b.action) {
        case "reopen":
          return meta(await deps.port.reopen(b.id));
        case "resolve":
          return meta(await deps.port.resolve(b.id));
        case "reply":
          return meta(await deps.port.reply(b.id, b.body ?? ""));
        case "replace": {
          // 重新选择位置：先把编辑落盘，再按引用文字在已保存文本里解析
          const current = (await deps.port.list()).find((c) => c.id === b.id);
          if (current) await deps.flush(deps.docNameOf(current.documentPath));
          return meta(
            await deps.port.relocate(b.id, {
              ...(b.quote !== undefined ? { quote: b.quote } : {}),
              ...(b.prefix !== undefined ? { prefix: b.prefix } : {}),
              ...(b.suffix !== undefined ? { suffix: b.suffix } : {}),
            }),
          );
        }
        default:
          return notAvailable(b.action);
      }
    },
    "DELETE /api/comment": async ({ url }) => {
      const id = url.searchParams.get("id") ?? "";
      await deps.port.delete(id);
      return { threadId: id };
    },
  };
}
