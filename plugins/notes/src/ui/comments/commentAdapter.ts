import type { CommentsPort, HuhuComment, PassageInput } from "@huhu/editor/rich";

/** 渲染进程里调用 engine 能力的最小形状（`EngineClient.call`）。 */
export type EngineCall = <T>(capability: string, input?: unknown, opts?: { write?: boolean }) => Promise<T>;

/** 选区输入里只传有值的字段：引擎按 start/end 或 quote/prefix/suffix 解析（引用文字在已保存文本上解析，不使用编辑器内部坐标）。 */
const passage = (r: PassageInput): Record<string, unknown> => ({
  ...(r.start !== undefined ? { start: r.start } : {}),
  ...(r.end !== undefined ? { end: r.end } : {}),
  ...(r.quote !== undefined ? { quote: r.quote } : {}),
  ...(r.prefix !== undefined ? { prefix: r.prefix } : {}),
  ...(r.suffix !== undefined ? { suffix: r.suffix } : {}),
});

/** `CommentsPort` ↔ `comments.*` 能力（design §9 / evidence/comment-field-map.md）。写操作经 Dispatcher，事件由 entity.changed 带回。 */
export function createCommentsPort(call: EngineCall): CommentsPort {
  const w = { write: true };
  return {
    list: (path) => call<HuhuComment[]>("comments.list", path ? { path } : {}),
    create: (i) => call<HuhuComment>("comments.create", { path: i.path, target: i.target, ...(i.property !== undefined ? { property: i.property } : {}), ...passage(i), text: i.text }, w),
    reply: (id, text) => call<HuhuComment>("comments.reply", { id, text }, w),
    resolve: (id) => call<HuhuComment>("comments.resolve", { id }, w),
    reopen: (id) => call<HuhuComment>("comments.reopen", { id }, w),
    relocate: (id, range) => call<HuhuComment>("comments.relocate", { id, ...passage(range) }, w),
    delete: async (id) => void (await call("comments.delete", { id }, w)),
  };
}

const MD = /\.(md|mdx)$/i;
/** OK 的 docName 不带扩展名；Huhu 路径带。 */
export const docNameOf = (path: string): string => path.replace(MD, "");

/** docName → 笔记路径：已知笔记里找 `名.md` / `名.mdx` / 文件夹笔记 `名/index.md`，找不到按 `名.md`。 */
export function pathOfDocName(docName: string, known: Iterable<string>): string {
  const have = new Set(known);
  for (const c of [`${docName}.md`, `${docName}.mdx`, `${docName}/index.md`]) if (have.has(c)) return c;
  return MD.test(docName) ? docName : `${docName}.md`;
}
