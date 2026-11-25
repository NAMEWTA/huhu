// S4：comments 路由适配层（OK `/api/comments*` ↔ Huhu `comments.*`）。纯函数 + 假 port，不触碰 PM / Y。
import { describe, expect, test, vi } from "vitest";
import { commentRoutes, toThreadMeta, type CommentsPort, type HuhuComment } from "../src/host/routes/comments";
import { hostFetch, registerHostRoutes } from "../src/host/host-fetch";

const base: HuhuComment = {
  id: "c1",
  documentPath: "笔记/一.md",
  target: "body",
  property: null,
  anchor: { exact: "一套能力", prefix: "这里有", suffix: "，值得", start: 10, end: 14 },
  state: "anchored",
  version: "v1",
  createdAt: "2026-11-11T08:00:00Z",
  updatedAt: "2026-11-11T09:00:00Z",
  text: "这里要展开",
  author: "我",
};
const docNameOf = (p: string) => p.replace(/\.md$/, "");

function fakePort(over: Partial<CommentsPort> = {}) {
  const calls: string[] = [];
  const port: CommentsPort = {
    list: vi.fn(async (path?: string) => (calls.push(`list:${path ?? "*"}`), [base])),
    create: vi.fn(async (i) => (calls.push(`create:${JSON.stringify(i)}`), base)),
    update: vi.fn(async (id, text, version) => (calls.push(`update:${id}:${text}:${version}`), { ...base, text })),
    relocate: vi.fn(async (id, r) => (calls.push(`relocate:${id}:${JSON.stringify(r)}`), base)),
    delete: vi.fn(async (id) => void calls.push(`delete:${id}`)),
    ...over,
  };
  return { port, calls };
}

async function call(routes: ReturnType<typeof commentRoutes>, method: string, url: string, body?: unknown) {
  const off = registerHostRoutes(routes);
  try {
    const res = await hostFetch(url, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  } finally {
    off();
  }
}

describe("toThreadMeta：字段映射", () => {
  test("正文批注：携带正文、作者和版本，毫秒时间戳，docName 去扩展名", () => {
    const m = toThreadMeta(base, docNameOf);
    expect(m).toMatchObject({ threadId: "c1", docName: "笔记/一", target: { kind: "body" }, state: "anchored", queued: false, latestComment: "这里要展开", createdBy: "我", scope: "body" });
    expect(m.createdAt).toBe(Date.parse("2026-11-11T08:00:00Z"));
    expect(m.version).toBe("v1");
  });
  test("孤立保留原锚点", () => {
    const o = toThreadMeta({ ...base, state: "orphaned" }, docNameOf);
    expect(o.state).toBe("orphaned");
    expect(o.anchor?.exact).toBe("一套能力");
  });
  test("属性批注：target.property 带真实属性键；整篇批注 scope=file 且无锚点", () => {
    const p = toThreadMeta({ ...base, target: "property", property: "status", anchor: null }, docNameOf);
    expect(p.target).toEqual({ kind: "property", key: "status", path: [] });
    const f = toThreadMeta({ ...base, target: "file", anchor: null }, docNameOf);
    expect(f.scope).toBe("file");
    expect(f.anchor).toBeNull();
  });
});

describe("路由", () => {
  const mk = (over: Partial<CommentsPort> = {}) => {
    const flushed: string[] = [];
    const { port, calls } = fakePort(over);
    const routes = commentRoutes({ port, pathOf: (d) => `${d}.md`, docNameOf, flush: async (d) => void flushed.push(d) });
    return { routes, calls, flushed, port };
  };
  test("GET /api/comments?doc=：按文档过滤；不带 doc 列全部", async () => {
    const { routes, calls } = mk();
    const r = await call(routes, "GET", "/api/comments?doc=笔记%2F一");
    expect(r.status).toBe(200);
    expect((r.json.threads as unknown[]).length).toBe(1);
    await call(routes, "GET", "/api/comments");
    expect(calls).toEqual(["list:笔记/一.md", "list:*"]);
  });
  test("POST /api/comments 创建：先 flush 该文档，再把引用文字 + 上下文交给引擎（不传 PM 坐标）", async () => {
    const { routes, calls, flushed } = mk();
    await call(routes, "POST", "/api/comments", { docName: "笔记/一", quote: "一套能力", prefix: "这里有", suffix: "，值得", body: "这里要展开", queue: true });
    expect(flushed).toEqual(["笔记/一"]);
    const sent = JSON.parse(calls[0]!.replace("create:", ""));
    expect(sent).toEqual({ path: "笔记/一.md", target: "body", quote: "一套能力", prefix: "这里有", suffix: "，值得", text: "这里要展开" });
    expect("start" in sent).toBe(false);
  });
  test("正文批注 flush 在途时 revision 改变，要求重新选择且不创建线程", async () => {
    const { port } = fakePort();
    const { promise: flushing, resolve: started } = Promise.withResolvers<void>();
    const { promise: pending, resolve: finish } = Promise.withResolvers<void>();
    const selection = { vaultId: "vault", path: "a.md", epoch: 4, revision: 7 };
    let revision = selection.revision;
    const deps = {
      port,
      pathOf: () => "a.md",
      docNameOf,
      selectionRevision: () => ({ ...selection, revision, sourceVersion: "saved" }),
      flush: async () => {
        started();
        await pending;
      },
    };
    const result = call(commentRoutes(deps), "POST", "/api/comments", { docName: "a", quote: "同句", selection, body: "评论" });
    await flushing;
    revision++;
    finish();
    const response = await result;
    expect(response.status).toBe(500);
    expect(response.json.title).toContain("重新选择");
    expect(port.create).not.toHaveBeenCalled();
  });
  test("同一会话 revision 以 flush 回执版本落盘，换同名会话则拒绝", async () => {
    const { port } = fakePort();
    const selection = { vaultId: "vault", path: "a.md", epoch: 4, revision: 7 };
    let sourceVersion = "before";
    const routes = commentRoutes({
      port,
      pathOf: () => "a.md",
      docNameOf,
      selectionRevision: () => ({ ...selection, sourceVersion }),
      flush: async () => {
        sourceVersion = "after";
      },
    });
    const body = { docName: "a", quote: "同句", selection, body: "评论" };
    expect((await call(routes, "POST", "/api/comments", body)).status).toBe(200);
    expect(port.create).toHaveBeenCalledWith({ path: "a.md", target: "body", quote: "同句", text: "评论", expectedSourceVersion: "after" });
    const oldSession = await call(routes, "POST", "/api/comments", { ...body, selection: { ...selection, epoch: 3 } });
    expect(oldSession.status).toBe(500);
    expect(port.create).toHaveBeenCalledTimes(1);
  });
  test("属性批注创建：target=property，带属性键", async () => {
    const { routes, calls } = mk();
    await call(routes, "POST", "/api/comments", { docName: "a", propertyKey: "status", propertyPath: [], body: "改一下" });
    expect(JSON.parse(calls[0]!.replace("create:", ""))).toMatchObject({ target: "property", property: "status" });
  });
  test("整篇批注：wholeFile → target=file", async () => {
    const { routes, calls } = mk();
    await call(routes, "POST", "/api/comments", { docName: "a", wholeFile: true, body: "总评" });
    expect(JSON.parse(calls[0]!.replace("create:", ""))).toMatchObject({ target: "file" });
  });
  test("编辑检查版本，重新选择位置先 flush，支持删除", async () => {
    const { routes, calls, flushed } = mk();
    const edited = await call(routes, "POST", "/api/comment", { action: "edit", id: "c1", body: "已补充", expectedVersion: "v1" });
    expect(edited.json.latestComment).toBe("已补充");
    await call(routes, "POST", "/api/comment", { action: "replace", id: "c1", quote: "新句子", prefix: "p", suffix: "s" });
    const del = await call(routes, "DELETE", "/api/comment?id=c1");
    expect(del.json).toEqual({ threadId: "c1" });
    expect(calls).toEqual(["update:c1:已补充:v1", "list:*", 'relocate:c1:{"quote":"新句子","prefix":"p","suffix":"s"}', "delete:c1"]);
    expect(flushed).toEqual(["笔记/一"]);
  });
  test("AI 派发、队列、解决和回复动作不接：返回带 title 的错误，不改任何数据", async () => {
    const { routes, calls } = mk();
    for (const action of ["queue", "unqueue", "dispatch-prepare-batch", "dispatch-complete-batch", "reply", "resolve", "reopen"]) {
      const r = await call(routes, "POST", "/api/comment", { action, id: "c1", body: "x" });
      expect(r.status).toBe(500);
      expect(String(r.json.title)).toContain("NOT_AVAILABLE");
      expect(r.json.type).toBe("urn:ok:error:invalid-request");
    }
    expect(calls).toEqual([]);
  });
  test("引擎拒绝（引用文字不在文档里 / 多处命中）：错误信息原样透出，让 UI toast 显示原因", async () => {
    const { routes } = mk({ create: vi.fn(async () => Promise.reject(new Error("引用的文字不在文档里（可能已修改，请重新选择）"))) });
    const r = await call(routes, "POST", "/api/comments", { docName: "a", quote: "x", body: "y" });
    expect(r.status).toBe(500);
    expect(r.json.title).toBe("引用的文字不在文档里（可能已修改，请重新选择）");
  });
});

test.each([
  { method: "GET", path: "/api/comments", operation: "list", payload: undefined },
  { method: "POST", path: "/api/comments", operation: "create", payload: { docName: "笔记/一", body: "测试" } },
  { method: "POST", path: "/api/comment", operation: "update", payload: { action: "edit", id: "c1", body: "测试", expectedVersion: "v1" } },
  { method: "DELETE", path: "/api/comment?id=c1", operation: "delete", payload: undefined },
])("H04 $method $path propagates the comments error code and readable reason", async ({ method, path, operation, payload }) => {
  const { port } = fakePort({
    [operation]: async () => {
      throw new Error("批注暂时无法保存或读取");
    },
  });
  const routes = commentRoutes({ port, pathOf: (doc) => doc + ".md", docNameOf, flush: async () => {} });
  const failure = await call(routes, method, path, payload);
  expect(failure.status).toBe(500);
  expect(failure.json).toMatchObject({ code: "HOST_ERROR", title: "批注暂时无法保存或读取", detail: "批注暂时无法保存或读取" });
});
