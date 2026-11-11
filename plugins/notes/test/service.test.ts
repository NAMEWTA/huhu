import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OperationLog, Trash, VaultFiles, VaultIndex } from "@huhu/vault";
import { afterEach, describe, expect, test } from "vitest";
import { NotesService } from "../src/engine/service.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function setup(files: Record<string, string> = {}) {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-n-"));
  dirs.push(d);
  const root = path.join(d, "v");
  mkdirSync(path.join(root, ".huhu"), { recursive: true });
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    writeFileSync(path.join(root, p), c);
  }
  const vf = new VaultFiles(root);
  const index = new VaultIndex(root);
  await index.build();
  const svc = new NotesService({ files: vf, ops: new OperationLog(vf, path.join(d, "ops")), index, trash: new Trash(vf), now: () => new Date("2026-11-10T12:00:00Z"), zone: () => "UTC" });
  const rebuild = () => index.build();
  return { svc, root, rebuild };
}
const rd = (root: string, p: string) => readFileSync(path.join(root, p), "utf8");

describe("新建与校验", () => {
  test("模板、嵌套文件夹、分配 id", async () => {
    const { svc, root } = await setup();
    const r = await svc.create({ name: "周会", folder: "a/b", template: "meeting" });
    expect(r.path).toBe("a/b/周会.md");
    expect(rd(root, r.path)).toContain("## 参会者");
    expect(svc.noteId(r.path)).toBe(r.id);
  });
  test("非法名称与大小写不敏感同名", async () => {
    const { svc, rebuild } = await setup({ "Readme.md": "x" });
    await rebuild();
    await expect(svc.create({ name: "a/b" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(svc.create({ name: "CON" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(svc.create({ name: "readme" })).rejects.toMatchObject({ code: "NAME_CONFLICT" });
  });
});

describe("ACC-KN-06 重命名改写双链", () => {
  test("3 篇引用，其中一篇在代码块；改名后 2 处改写、代码块不变、Y 的反链为 2 篇", async () => {
    const { svc, root, rebuild } = await setup({
      "X.md": "# X\n",
      "A.md": "见 [[X]]\n",
      "B.md": "再见 [[X|别名]]\n",
      "C.md": "```\n[[X]]\n```\n",
    });
    const id = await svc.ensureId("X.md");
    const r = await svc.rename("X.md", "Y");
    expect(r.moved).toEqual({ "X.md": "Y.md" });
    expect(rd(root, "A.md")).toBe("见 [[Y]]\n");
    expect(rd(root, "B.md")).toBe("再见 [[Y|别名]]\n");
    expect(rd(root, "C.md")).toBe("```\n[[X]]\n```\n");
    expect(existsSync(path.join(root, "X.md"))).toBe(false);
    expect(svc.noteId("Y.md")).toBe(id); // id 不变
    await rebuild();
    expect(
      svc
        .backlinks("Y.md")
        .map((b) => b.path)
        .sort(),
    ).toEqual(["A.md", "B.md"]);
  });
  test("目标已存在 → NAME_CONFLICT，文件不变", async () => {
    const { svc, root } = await setup({ "X.md": "x", "Y.md": "y" });
    await expect(svc.rename("X.md", "y")).rejects.toMatchObject({ code: "NAME_CONFLICT" });
    expect(rd(root, "X.md")).toBe("x");
  });
});

describe("移动", () => {
  test("文件夹移动带后代，路径双链更新；禁止移入自身/后代；同名不合并", async () => {
    const { svc, root } = await setup({ "docs/p.md": "p", "docs/sub/q.md": "q", "ref.md": "[[docs/p]] [[q]]", "archive/keep.md": "k" });
    await expect(svc.move("docs", "docs/sub")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const r = await svc.move("docs", "archive");
    expect(Object.values(r.moved).sort()).toEqual(["archive/docs/p.md", "archive/docs/sub/q.md"]);
    expect(rd(root, "ref.md")).toBe("[[archive/docs/p]] [[q]]"); // 裸名称仍唯一，不改
    expect(readdirSync(path.join(root, "archive"))).toContain("keep.md");
    await expect(svc.move("archive/docs/p.md", "archive/docs/sub")).resolves.toBeDefined();
  });
  test("裸标题存在多个同名文件 → 不改写并列出", async () => {
    const { svc, root } = await setup({ "a/N.md": "1", "b/N.md": "2", "ref.md": "[[N]]" });
    const r = await svc.rename("a/N.md", "M");
    expect(rd(root, "ref.md")).toBe("[[N]]");
    expect(r.ambiguous).toEqual(["N"]);
  });
  test("删除文件夹：整体进回收站，笔记列表不再包含；恢复后原样回来", async () => {
    const { svc, root } = await setup({ "docs/p.md": "p", "docs/sub/q.md": "q", "keep.md": "k" });
    const { trashId } = svc.trash("docs");
    expect(existsSync(path.join(root, "docs"))).toBe(false);
    expect(svc.list("all").map((x) => x.path)).toEqual(["keep.md"]);
    expect(svc.list("trash").map((x) => x.path)).toEqual(["docs"]);
    expect(svc.restore(trashId)).toBe("docs");
    expect(rd(root, "docs/sub/q.md")).toBe("q");
    expect(
      svc
        .list("all")
        .map((x) => x.path)
        .sort(),
    ).toEqual(["docs/p.md", "docs/sub/q.md", "keep.md"]);
  });
  test("空文件夹改名只改登记", async () => {
    const { svc, root } = await setup();
    await svc.createFolder("空目录");
    await svc.rename("空目录", "改名后");
    expect(existsSync(path.join(root, "改名后"))).toBe(true);
    expect(svc.folders()).toEqual(["改名后"]);
  });
});

describe("复制、回收站", () => {
  test("复制：新 id、名称带副本、内容相同", async () => {
    const { svc, root } = await setup({ "n.md": "内容" });
    const a = await svc.ensureId("n.md");
    const d = await svc.duplicate("n.md");
    expect(d.path).toBe("n 副本.md".replace("n 副本", "n · 副本"));
    expect(d.id).not.toBe(a);
    expect(rd(root, d.path)).toBe("内容");
  });
  test("ACC-KN-07 恢复：原路径有同名 → 要求新名称，原有文件不变；永久删除", async () => {
    const { svc, root } = await setup({ "n.md": "旧" });
    const { trashId } = svc.trash("n.md");
    writeFileSync(path.join(root, "n.md"), "新占位");
    expect(() => svc.restore(trashId)).toThrowError(/已存在/);
    expect(rd(root, "n.md")).toBe("新占位");
    expect(svc.restore(trashId, "n-恢复")).toBe("n-恢复.md");
    expect(rd(root, "n-恢复.md")).toBe("旧");
    const t2 = svc.trash("n-恢复.md");
    svc.deletePermanent(t2.trashId);
    expect(svc.list("trash")).toEqual([]);
  });
});

describe("日记与筛选", () => {
  test("ACC-KN-11 不存在则按模板创建，存在则直接打开；目录被删后重建", async () => {
    const { svc, root } = await setup();
    const a = await svc.openDaily("2026-11-10");
    expect(a).toEqual({ path: "日记/2026-11-10 · 每日笔记.md", created: true });
    expect(rd(root, a.path)).toContain("## 今天最重要的事");
    expect(await svc.openDaily("2026-11-10")).toMatchObject({ created: false });
    rmSync(path.join(root, "日记"), { recursive: true });
    expect(await svc.openDaily("2026-11-11")).toMatchObject({ created: true });
    await expect(svc.openDaily("2026/11/10")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  test("星标与日记筛选", async () => {
    const { svc, rebuild } = await setup({ "a.md": "a", "日记/2026-11-10 · 每日笔记.md": "d" });
    await svc.setFavorite("a.md", true);
    await rebuild();
    expect(svc.list("favorites").map((n) => n.path)).toEqual(["a.md"]);
    expect(svc.list("daily").map((n) => n.path)).toEqual(["日记/2026-11-10 · 每日笔记.md"]);
    await svc.setFavorite("a.md", false);
    expect(svc.list("favorites")).toEqual([]);
  });
});

describe("审计回归", () => {
  test("名称含点号（v1.2 方案）仍补 .md，不会让笔记从列表消失", async () => {
    const { svc, root, rebuild } = await setup({ "n.md": "x" });
    await svc.rename("n.md", "v1.2 方案");
    expect(existsSync(path.join(root, "v1.2 方案.md"))).toBe(true);
    await rebuild();
    expect(svc.list("all").map((n) => n.path)).toEqual(["v1.2 方案.md"]);
    const { trashId } = svc.trash("v1.2 方案.md");
    expect(svc.restore(trashId, "Q1.5 计划")).toBe("Q1.5 计划.md");
  });
  test("仅大小写改名：内容不丢，双链改写，id 不变", async () => {
    const { svc, root } = await setup({ "readme.md": "正文", "ref.md": "[[readme]] [[readme.md]]" });
    const id = await svc.ensureId("readme.md");
    await svc.rename("readme.md", "README");
    expect(
      readdirSync(root)
        .filter((n) => n.endsWith(".md"))
        .sort(),
    ).toEqual(["README.md", "ref.md"]);
    expect(rd(root, "README.md")).toBe("正文");
    expect(rd(root, "ref.md")).toBe("[[README]] [[README.md]]");
    expect(svc.noteId("README.md")).toBe(id);
  });
  test("文件夹移动后不留空壳目录", async () => {
    const { svc, root } = await setup({ "a/b/c.md": "c", "dest/keep.md": "k" });
    await svc.move("a", "dest");
    expect(existsSync(path.join(root, "a"))).toBe(false);
    expect(rd(root, "dest/a/b/c.md")).toBe("c");
  });
});
