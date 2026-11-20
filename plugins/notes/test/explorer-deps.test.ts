import { describe, expect, test } from "vitest";
import { composeMoves, createFilesDeps, LIST_MAX_PAGES, type EngineLike, type FilesDepsOptions } from "../src/ui/explorer/filesDeps.js";
import { addHiddenRule, isHiddenPath, removeHiddenRule } from "../src/ui/explorer/hiddenPaths.js";

function fakeEngine(handlers: Record<string, (input: { path: string; targetDir: string; newName: string; folder: string; name: string }) => unknown>) {
  const calls: { cap: string; input: unknown }[] = [];
  const engine: EngineLike = {
    async call<T>(cap: string, input?: unknown) {
      calls.push({ cap, input });
      const h = handlers[cap];
      if (!h) throw new Error(`未模拟 ${cap}`);
      return h(input as never) as T;
    },
  };
  return { engine, calls };
}
const opts = (engine: EngineLike, extra: Partial<FilesDepsOptions> = {}): FilesDepsOptions => ({
  engine,
  getHidden: () => [],
  getShowHidden: () => false,
  beforeMutate: async () => true,
  onMoved: () => {},
  getRoot: () => "/vault",
  ...extra,
});

describe("A02：hiddenPaths 规则", () => {
  test("目录规则作用于子树；不误伤同前缀兄弟", () => {
    expect(isHiddenPath("a/b/c.md", ["a"])).toBe(true);
    expect(isHiddenPath("ab/c.md", ["a"])).toBe(false);
  });
  test("加入祖先规则吞掉后代规则；已被覆盖则不变", () => {
    expect(addHiddenRule(["a/b", "z"], "a")).toEqual(["a", "z"]);
    expect(addHiddenRule(["a"], "a/b")).toEqual(["a"]);
  });
  test("取消隐藏：自身规则可移除；被祖先覆盖的后代返回 null（不猜测）", () => {
    expect(removeHiddenRule(["a", "z"], "a")).toEqual(["z"]);
    expect(removeHiddenRule(["a"], "a/b")).toBeNull();
  });
});

describe("A07：重命名 / 移动走同一业务能力", () => {
  test("同目录改名 → notes.rename；跨目录 → notes.move；两者都变 → 先移动后改名并合成映射", async () => {
    const moved: Record<string, string>[] = [];
    const { engine, calls } = fakeEngine({
      "notes.move": (i) => ({ moved: { [i.path]: `${i.targetDir}/${i.path.split("/").at(-1)}` } }),
      "notes.rename": (i) => ({ moved: { [i.path]: `${i.path.slice(0, i.path.lastIndexOf("/") + 1)}${i.newName}` } }),
    });
    const deps = createFilesDeps(opts(engine, { onMoved: (m) => void moved.push(m) }));
    await deps.rename({ kind: "file", fromPath: "a/x.md", toPath: "a/y.md" });
    await deps.rename({ kind: "file", fromPath: "a/x.md", toPath: "b/x.md" });
    const both = await deps.rename({ kind: "asset", fromPath: "a/p.pdf", toPath: "b/q.pdf" });
    expect(calls.map((c) => c.cap)).toEqual(["notes.rename", "notes.move", "notes.move", "notes.rename"]);
    expect(both.moved).toEqual({ "a/p.pdf": "b/q.pdf" });
    expect(moved).toHaveLength(3);
  });
  test("composeMoves 合成两步映射", () => {
    expect(composeMoves({ "a/x": "b/x" }, { "b/x": "b/y" })).toEqual({ "a/x": "b/y" });
  });
  test("复制 / 回收站走 notes.duplicate / notes.trash，并回报 trashId", async () => {
    const trashed: string[] = [];
    const { engine, calls } = fakeEngine({ "notes.duplicate": () => ({ path: "x · 副本.md" }), "notes.trash": () => ({ trashId: "T1" }) });
    const deps = createFilesDeps(opts(engine, { onTrashed: (p, id) => void trashed.push(`${p}:${id}`) }));
    expect((await deps.duplicate({ kind: "file", path: "x.md" })).paths).toEqual(["x · 副本.md"]);
    await deps.trash({ kind: "file", path: "x.md" });
    expect(trashed).toEqual(["x.md:T1"]);
    expect(calls.map((c) => c.cap)).toEqual(["notes.duplicate", "notes.trash"]);
  });
  test("创建页面只接受 Markdown；文件夹走 folders.create", async () => {
    const { engine, calls } = fakeEngine({ "notes.create": (i) => ({ path: `${i.folder ? `${i.folder}/` : ""}${i.name}.md` }), "folders.create": () => ({ ok: true }) });
    const deps = createFilesDeps(opts(engine));
    expect(await deps.createPage({ path: "n/new.md", template: "meeting" })).toEqual({ path: "n/new.md" });
    expect(calls[0]?.input).toMatchObject({ name: "new", folder: "n", template: "meeting" });
    await expect(deps.createPage({ path: "n/a.txt" })).rejects.toThrow(/Markdown/);
    await deps.createFolder({ path: "n/dir" });
    expect(calls.at(-1)?.cap).toBe("folders.create");
  });
});

describe("A08：脏文档先 flush，失败不丢草稿也不操作", () => {
  test("beforeMutate 返回 false → 重命名 / 复制 / 删除都不调用引擎", async () => {
    const { engine, calls } = fakeEngine({});
    const deps = createFilesDeps(opts(engine, { beforeMutate: async () => false }));
    await expect(deps.rename({ kind: "file", fromPath: "a.md", toPath: "b.md" })).rejects.toThrow(/未保存/);
    await expect(deps.duplicate({ kind: "folder", path: "d" })).rejects.toThrow(/未保存/);
    await expect(deps.trash({ kind: "file", path: "a.md" })).rejects.toThrow(/未保存/);
    expect(calls).toEqual([]);
  });
});

describe("A04 / A09：分页与计数输入", () => {
  test("多页目录逐页读完；超过页数上限标 truncated，不冒充完整", async () => {
    let page = 0;
    const listed: { dir: string; truncated: boolean }[] = [];
    const { engine, calls } = fakeEngine({
      "vault.list": () => {
        page++;
        return { entries: [{ name: `f${page}.md`, path: `f${page}.md`, kind: "file" }], nextCursor: `c${page}` };
      },
    });
    const deps = createFilesDeps(opts(engine, { onListed: (dir, s) => void listed.push({ dir, truncated: s.truncated }) }));
    const r = await deps.list("");
    expect(calls).toHaveLength(LIST_MAX_PAGES);
    expect(r.truncated).toBe(true);
    expect(r.entries).toHaveLength(LIST_MAX_PAGES);
    expect(listed).toEqual([{ dir: "", truncated: true }]);
  });
  test("受保护目录元信息与越界符号链接被带出（A10）", async () => {
    const { engine } = fakeEngine({
      "vault.list": () => ({
        entries: [
          { name: ".huhu", path: ".huhu", kind: "dir", protected: "internal" },
          { name: "out", path: "out", kind: "symlink", linkTarget: { inside: false } },
        ],
      }),
    });
    const r = await createFilesDeps(opts(engine)).list("");
    expect(r.entries[0]).toMatchObject({ protected: "internal" });
    expect(r.entries[1]).toMatchObject({ kind: "symlink", linkOutside: true });
    expect(r.truncated).toBe(false);
  });
});

test("A08：编辑在结算前暂停，路径重新定位后恢复", async () => {
  const timeline: string[] = [];
  const entered = Promise.withResolvers<void>();
  const reply = Promise.withResolvers<{ moved: Record<string, string> }>();
  const { engine } = fakeEngine({
    "notes.move": () => {
      timeline.push("move");
      entered.resolve();
      return reply.promise;
    },
  });
  const files = createFilesDeps(
    opts(engine, {
      beforeMutate: async () => (timeline.push("flush"), true),
      holdOpenPaths: async (_path, move) => {
        timeline.push("pause");
        try {
          return await move();
        } finally {
          timeline.push("resume");
        }
      },
      onMoved: () => void timeline.push("remap"),
    }),
  );
  const moving = files.rename({ kind: "file", fromPath: "a/x.md", toPath: "b/x.md" });
  await entered.promise;
  reply.resolve({ moved: { "a/x.md": "b/x.md" } });
  await moving;
  expect(timeline).toEqual(["pause", "flush", "move", "remap", "resume"]);
});
