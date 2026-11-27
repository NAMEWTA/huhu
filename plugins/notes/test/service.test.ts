import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { listDir, OperationLog, SemanticRepository, Trash, VaultFiles, VaultIndex, versionOf } from "@huhu/vault";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NotesService } from "../src/engine/service.js";
import { CommentsService } from "../src/engine/comments/service.js";
import { todayInZone } from "../src/shared/daily.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function setup(files: Record<string, string> = {}, draftMoveSteps?: ConstructorParameters<typeof NotesService>[0]["draftMoveSteps"]) {
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
  const ops = new OperationLog(vf, path.join(d, "ops"));
  const trash = new Trash(vf, undefined, ops);
  const svc = new NotesService({ files: vf, stateDir: path.join(vf.root, ".huhu"), ops, index, trash, now: () => new Date("2026-11-10T12:00:00Z"), zone: () => "UTC", ...(draftMoveSteps ? { draftMoveSteps } : {}) });
  const rebuild = () => index.build();
  return { svc, root, rebuild, vf, ops, trash };
}
const rd = (root: string, p: string) => readFileSync(path.join(root, p), "utf8");

describe("F04 回收站操作", () => {
  test("meta.json 文件与同名目录分别保留原始字节、空目录和元数据", async () => {
    const { svc, root, trash, ops } = await setup({ "meta.json": "{原始文件}", "tree/meta.json/inside.md": "原始目录" });
    mkdirSync(path.join(root, "tree/meta.json/empty"));
    for (const rel of ["meta.json", "tree/meta.json"]) {
      const { trashId } = await svc.trash(rel);
      const entry = `.huhu/trash/${trashId}`;
      expect(JSON.parse(rd(root, `${entry}/meta.json`))).toMatchObject({ trashId, originalPath: rel, layout: 2 });
      expect(ops.load(trashId)?.state).toBe("committed");
      expect(trash.list()).toMatchObject([{ trashId }]);
      expect(await svc.restore(trashId)).toBe(rel);
      expect(trash.list()).toEqual([]);
      expect(existsSync(path.join(root, entry))).toBe(false);
    }
    expect(rd(root, "meta.json")).toBe("{原始文件}");
    expect(rd(root, "tree/meta.json/inside.md")).toBe("原始目录");
    expect(readdirSync(path.join(root, "tree/meta.json/empty"))).toEqual([]);
  });

  test.each([0, 1, 2, 3])("回收步骤 %i 发布后失败时还原全部原数据与身份", async (failAfter) => {
    const { svc, root, ops, trash } = await setup({ "tree/note.md": "original" });
    await svc.createFolder("tree/empty");
    const noteId = await svc.ensureId("tree/note.md");
    const run = ops.run.bind(ops);
    vi.spyOn(ops, "run").mockImplementationOnce((id, kind, steps) =>
      run(id, kind, steps, {
        afterPublish: (index) => {
          if (index === failAfter) throw new Error("injected publication failure");
        },
      }),
    );
    await expect(svc.trash("tree")).rejects.toMatchObject({ code: "WRITE_PARTIAL", details: { state: "rolled_back" } });
    expect(trash.list()).toEqual([]);
    expect(rd(root, "tree/note.md")).toBe("original");
    expect(svc.noteId("tree/note.md")).toBe(noteId);
    expect(svc.folders()).toContain("tree/empty");
    expect(ops.recover()).toEqual([]);
  });

  test("换名恢复原批注、星标和空目录，永久删除只清理原身份", async () => {
    const { svc, root, vf, ops, trash } = await setup({ "tree/note.md": "original" });
    const comments = new CommentsService({
      repo: new SemanticRepository(vf, ops),
      files: vf,
      ensureId: (rel) => svc.ensureId(rel),
      noteId: (rel) => svc.noteId(rel),
      publish: () => undefined,
      now: () => new Date("2026-11-10T12:00:00Z"),
    });
    const create = (file: string, text: string) => comments.create({ path: file, target: "file", text, author: "fixture" });
    await svc.createFolder("tree/empty");
    await svc.setFavorite("tree/note.md", true);
    const original = await create("tree/note.md", "old");
    const { trashId } = await svc.trash("tree");
    const replacement = await svc.create({ name: "note", folder: "tree" });
    const replacementComment = await create(replacement.path, "replacement");
    await expect(svc.restore(trashId)).rejects.toMatchObject({ code: "NAME_CONFLICT", details: { path: "tree" } });
    const project = (documents: ReadonlyMap<string, string>) => comments.trashProjection(documents, "restore");
    const run = ops.run.bind(ops);
    vi.spyOn(ops, "run").mockImplementationOnce((id, kind, steps) =>
      run(id, kind, steps, {
        afterPublish: (index) => {
          if (index === steps.length - 2) throw new Error("restore interrupted after payload move");
        },
      }),
    );
    await expect(svc.restore(trashId, "recovered", undefined, project)).rejects.toMatchObject({ code: "WRITE_PARTIAL", details: { state: "rolled_back" } });
    expect(trash.list()).toMatchObject([{ trashId }]);
    expect(svc.noteId("recovered/note.md")).toBeNull();
    expect(comments.list().find(({ id }) => id === original.id)?.documentPath).toBe("tree/note.md");
    expect(existsSync(path.join(root, "recovered/note.md"))).toBe(false);

    await expect(svc.restore(trashId, "recovered", undefined, project)).resolves.toBe("recovered");
    expect(svc.noteId("recovered/note.md")).toBe(original.documentId);
    expect(svc.favorites()).toContain(original.documentId);
    expect(svc.folders()).toContain("recovered/empty");
    expect(comments.list("recovered/note.md")).toMatchObject([{ id: original.id, documentPath: "recovered/note.md" }]);
    expect(comments.list(replacement.path)).toMatchObject([{ id: replacementComment.id }]);
    const purging = await svc.trash("recovered");
    await svc.deletePermanent(purging.trashId, (documents) => comments.trashProjection(documents, "purge"));
    expect(comments.list().map(({ id }) => id)).toEqual([replacementComment.id]);
    expect(svc.favorites()).not.toContain(original.documentId);
    expect(trash.list()).toEqual([]);
    new Trash(vf, undefined, ops).cleanupRetired();
    expect(ops.recover()).toEqual([]);
  });
});

test("改名提交撞名后保留两份笔记及原有双链", async () => {
  const { root, svc, vf, ops } = await setup({ "source.md": "source", "links.md": "[[source]]" });
  const exists = vf.exists.bind(vf);
  vi.spyOn(vf, "exists").mockImplementation((rel) => {
    const found = exists(rel);
    if (rel === "target.md" && !found) writeFileSync(path.join(root, rel), "external", { flag: "wx" });
    return found;
  });
  await expect(svc.rename("source.md", "target")).rejects.toMatchObject({ code: "WRITE_PARTIAL", details: { state: "rolled_back" } });
  expect(rd(root, "source.md")).toBe("source");
  expect(rd(root, "target.md")).toBe("external");
  expect(rd(root, "links.md")).toBe("[[source]]");
  expect(ops.list().map(({ state }) => state)).toEqual(["rolled_back"]);
});

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

describe("Vault 模板", () => {
  test("导入首次写入完整字节，写入失败后可重试且不留空模板", async () => {
    const contents = "\uFEFF# 样板\r\n\r\n**原样保留**\r\n";
    const { svc, root, vf } = await setup({ "项目/样板.md": contents });
    const write = vi.spyOn(vf, "write").mockRejectedValueOnce(new Error("模拟写入中断"));
    const templatePath = "项目/模板/样板.md";
    await expect(svc.importTemplate("项目/样板.md")).rejects.toThrow("模拟写入中断");
    expect(write).toHaveBeenCalledExactlyOnceWith(templatePath, Buffer.from(contents), { expectedVersion: null });
    expect(existsSync(path.join(root, templatePath))).toBe(false);
    expect(svc.templatePaths()).toEqual([]);
    await expect(svc.importTemplate("项目/样板.md")).resolves.toEqual({ path: templatePath });
    expect(svc.templatePaths()).toEqual([templatePath]);

    const created = await svc.create({ name: "新笔记", templatePath });
    expect(rd(root, created.path)).toBe(contents);
    expect(rd(root, templatePath)).toBe(contents);
    expect(rd(root, "项目/样板.md")).toBe(contents);
    await expect(svc.create({ name: "不应创建", templatePath: "项目/样板.md" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(existsSync(path.join(root, "不应创建.md"))).toBe(false);
  });

  test("并行导入同名模板分别写入且保留原有文件", async () => {
    const { svc, root } = await setup({ "样板.md": "新模板", "模板/样板.md": "已有模板" });
    const imports = await Promise.all([svc.importTemplate("样板.md"), svc.importTemplate("样板.md")]);
    expect(imports.map((item) => item.path).sort()).toEqual(["模板/样板-2.md", "模板/样板-3.md"]);
    expect(imports.map((item) => rd(root, item.path))).toEqual(["新模板", "新模板"]);
    expect(rd(root, "模板/样板.md")).toBe("已有模板");
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
  test("A07/A08/E04：监听器交付前移动含新文件、二进制文件与空目录的混合子树", async () => {
    const { svc, root, ops } = await setup({ "docs/index.md": "档案", "ref.md": "[[docs/late]] [[docs/empty/]]" });
    const id = await svc.ensureId("docs/index.md");
    await svc.setHiddenPaths(["docs/empty"]);
    mkdirSync(path.join(root, "docs/empty/deep"), { recursive: true });
    writeFileSync(path.join(root, "docs/late.md"), "未入索引");
    const bytes = Buffer.from([0x01, 0xfe, 0x00]);
    writeFileSync(path.join(root, "docs/data.bin"), bytes);
    const run = ops.run.bind(ops);
    vi.spyOn(ops, "run").mockImplementationOnce((...args) => {
      writeFileSync(path.join(root, "docs/during.txt"), "计划提交后出现");
      return run(...args);
    });
    const result = await svc.rename("docs", "moved");
    expect(result.moved).toMatchObject({ "docs/index.md": "moved/index.md", "docs/late.md": "moved/late.md", "docs/data.bin": "moved/data.bin", "docs/during.txt": "moved/during.txt" });
    expect(rd(root, "ref.md")).toBe("[[moved/late]] [[moved/empty/]]");
    expect(rd(root, "moved/late.md")).toBe("未入索引");
    expect(rd(root, "moved/during.txt")).toBe("计划提交后出现");
    expect(readFileSync(path.join(root, "moved/data.bin"))).toEqual(bytes);
    expect(readdirSync(path.join(root, "moved/empty/deep"))).toEqual([]);
    expect(existsSync(path.join(root, "docs"))).toBe(false);
    expect(svc.hiddenPaths()).toEqual(["moved/empty"]);
    expect(svc.noteId("moved/index.md")).toBe(id);
    expect(ops.list().at(-1)?.steps).toContainEqual(expect.objectContaining({ action: "rename", from: "docs", path: "moved", done: true }));
  });

  test("A07：含受保护后代的目录整棵保留，避免部分搬迁", async () => {
    const { svc, root } = await setup({ "docs/index.md": "档案", "docs/.git/config": "保护资源" });
    await expect(svc.rename("docs", "moved")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(rd(root, "docs/.git/config")).toBe("保护资源");
    expect(rd(root, "docs/index.md")).toBe("档案");
    expect(existsSync(path.join(root, "moved"))).toBe(false);
  });

  test("A08：大小写改名的日志步骤失败时，恢复原名称、身份与草稿", async () => {
    const { svc, root, ops } = await setup({ "Readme.md": "原文", ".huhu/old-draft": "草稿", "ref.md": "[[Readme]]" }, (from, to) => {
      expect([from, to]).toEqual(["Readme.md", "README.md"]);
      return [
        { action: "write", path: ".huhu/new-draft", bytes: Buffer.from("草稿") },
        { action: "delete", path: ".huhu/old-draft" },
      ];
    });
    const id = await svc.ensureId("Readme.md");
    const run = ops.run.bind(ops);
    vi.spyOn(ops, "run").mockImplementation((opId, kind, steps) =>
      run(opId, kind, steps, {
        afterStep: (i) => {
          if (i === steps.length - 1) throw new Error("模拟事务尾部失败");
        },
      }),
    );
    await expect(svc.rename("Readme.md", "README")).rejects.toMatchObject({ code: "WRITE_PARTIAL" });
    expect(readdirSync(root).sort()).toEqual([".huhu", "Readme.md", "ref.md"]);
    expect(rd(root, "Readme.md")).toBe("原文");
    expect(rd(root, "ref.md")).toBe("[[Readme]]");
    expect(rd(root, ".huhu/old-draft")).toBe("草稿");
    expect(existsSync(path.join(root, ".huhu/new-draft"))).toBe(false);
    expect(svc.noteId("Readme.md")).toBe(id);
    expect(ops.list().at(-1)?.state).toBe("rolled_back");
  });

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
    const { trashId } = await svc.trash("docs");
    expect(existsSync(path.join(root, "docs"))).toBe(false);
    expect(svc.list("all").map((x) => x.path)).toEqual(["keep.md"]);
    expect(svc.list("trash").map((x) => x.path)).toEqual(["docs"]);
    expect(await svc.restore(trashId)).toBe("docs");
    expect(rd(root, "docs/sub/q.md")).toBe("q");
    expect(
      svc
        .list("all")
        .map((x) => x.path)
        .sort(),
    ).toEqual(["docs/p.md", "docs/sub/q.md", "keep.md"]);
  });
  test("回收后同名新建得到新 id；恢复（改名）把原 id 带回；回收文件夹同时取消登记", async () => {
    const { svc } = await setup({ "a.md": "# a" });
    const oldId = await svc.ensureId("a.md");
    const { trashId } = await svc.trash("a.md");
    expect(svc.noteId("a.md")).toBeNull();
    const fresh = await svc.create({ name: "a" });
    expect(fresh.id).not.toBe(oldId);
    const back = await svc.restore(trashId, "a-旧");
    expect(svc.noteId(back)).toBe(oldId);
    await svc.createFolder("空目录");
    expect(svc.folders()).toContain("空目录");
    const f = await svc.trash("空目录");
    expect(svc.folders()).not.toContain("空目录");
    await svc.restore(f.trashId);
    expect(svc.folders()).toContain("空目录");
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
  test("A07：选名后外部创建同名目标，保留两份原始字节", async () => {
    const { svc, root, ops } = await setup({ "note.md": "副本来源" });
    const rival = "note · 副本.md";
    const bytes = Buffer.from([0xff, 0x02]);
    const run = ops.run.bind(ops);
    vi.spyOn(ops, "run").mockImplementationOnce((opId, kind, steps) => {
      expect(kind).toBe("duplicate-file");
      writeFileSync(path.join(root, rival), bytes, { flag: "wx" });
      return run(opId, kind, steps);
    });
    await expect(svc.duplicate("note.md")).rejects.toMatchObject({ code: "NAME_CONFLICT" });
    expect(rd(root, "note.md")).toBe("副本来源");
    expect(readFileSync(path.join(root, rival))).toEqual(bytes);
    expect(svc.noteId(rival)).toBeNull();
    const next = await svc.duplicate("note.md");
    expect(rd(root, next.path)).toBe("副本来源");
    expect(readFileSync(path.join(root, rival))).toEqual(bytes);
  });

  test("复制：新 id、名称带副本、内容相同", async () => {
    const { svc, root } = await setup({ "n.md": "内容" });
    const a = await svc.ensureId("n.md");
    const d = await svc.duplicate("n.md");
    expect(d.path).toBe("n 副本.md".replace("n 副本", "n · 副本"));
    expect(d.id).not.toBe(a);
    expect(rd(root, d.path)).toBe("内容");
  });
  test("A07 复制文件夹：整棵子树（含非 Markdown 与空目录）按字节复制，原文件不变", async () => {
    const { svc, root } = await setup({ "Proj/a.md": "# A", "Proj/sub/b.md": "# B", "Proj/data.json": '{"k":1}' });
    mkdirSync(path.join(root, "Proj/emptyDir"), { recursive: true });
    const d = await svc.duplicate("Proj");
    expect(d.path).toBe("Proj · 副本");
    expect(rd(root, "Proj · 副本/a.md")).toBe("# A");
    expect(rd(root, "Proj · 副本/sub/b.md")).toBe("# B");
    expect(rd(root, "Proj · 副本/data.json")).toBe('{"k":1}');
    expect(existsSync(path.join(root, "Proj · 副本/emptyDir"))).toBe(true);
    expect(rd(root, "Proj/a.md")).toBe("# A");
    expect(svc.folders()).toContain("Proj · 副本/emptyDir");
    const again = await svc.duplicate("Proj");
    expect(again.path).toBe("Proj · 副本 (1)");
  });
  test("A07：复制和身份一步提交；非 Markdown 回收再恢复原字节", async () => {
    const original = '\uFEFF{ "值": 99 }\r\n';
    const { svc, root, ops } = await setup({ "data.json": original });
    const d = await svc.duplicate("data.json");
    expect(d.path).toBe("data · 副本.json");
    expect(ops.list()).toContainEqual(
      expect.objectContaining({
        kind: "duplicate-file",
        state: "committed",
        steps: expect.arrayContaining([expect.objectContaining({ path: d.path }), expect.objectContaining({ path: ".huhu/notes/identities.json" })]),
      }),
    );
    const { trashId } = await svc.trash(d.path);
    expect(existsSync(path.join(root, d.path))).toBe(false);
    expect(await svc.restore(trashId)).toBe(d.path);
    expect(readFileSync(path.join(root, d.path))).toEqual(Buffer.from(original));
    expect(readFileSync(path.join(root, "data.json"))).toEqual(Buffer.from(original));
  });

  test("OP-D10：真实列表到大小写改名保留中文、空格、Unicode 和磁盘元数据", async () => {
    const parent = "项目 空间";
    const base = "Café";
    const decomposed = "Résumé";
    const source = `${parent}/${base}.TXT`;
    const other = `${parent}/${decomposed}.txt`;
    const { svc, root } = await setup({ [source]: "原始\r\n", [other]: "另一份" });
    const stored = readdirSync(path.join(root, parent));
    const actualSource = stored.find((name) => name.normalize("NFC") === `${base}.TXT`)!;
    const actualOther = stored.find((name) => name.normalize("NFD") === `${decomposed}.txt`)!;
    const before = listDir(root, parent).entries;
    expect(before).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: actualSource, path: `${parent}/${actualSource}`, kind: "file", size: Buffer.byteLength("原始\r\n"), mtimeMs: expect.any(Number) }),
        expect.objectContaining({ name: actualOther, path: `${parent}/${actualOther}`, kind: "file" }),
      ]),
    );
    await svc.rename(`${parent}/${actualSource}`, actualSource.toLowerCase());
    const renamed = listDir(root, parent).entries.find((entry) => entry.name === actualSource.toLowerCase())!;
    expect(renamed).toMatchObject({ kind: "file", size: before.find((entry) => entry.name === actualSource)!.size, mtimeMs: before.find((entry) => entry.name === actualSource)!.mtimeMs });
    expect(readFileSync(path.join(root, renamed.path))).toEqual(Buffer.from("原始\r\n"));
    expect(readFileSync(path.join(root, parent, actualOther))).toEqual(Buffer.from("另一份"));
  });

  test("A07：越界写操作不改变库内外文件字节", async () => {
    const { svc, root } = await setup({ "inside.txt": "原始\r\n" });
    const outside = path.resolve(root, "../outside.txt");
    writeFileSync(outside, "外部\r\n");
    const byPath = () => [readFileSync(outside), readFileSync(path.join(root, "inside.txt"))];
    const before = byPath();
    const operations = [
      () => svc.create({ folder: "..", name: "escape" }),
      () => svc.createFolder("../escape"),
      () => svc.rename("../outside.txt", "escape"),
      () => svc.move("../outside.txt", ""),
      () => svc.move("inside.txt", ".."),
      () => svc.moveEntry("inside.txt", "../outside.txt"),
      () => svc.duplicate("../outside.txt"),
      () => svc.trash("../outside.txt"),
    ];
    for (const operate of operations) {
      await expect(operate()).rejects.toMatchObject({ code: "PATH_OUTSIDE_VAULT" });
      expect(byPath()).toEqual(before);
    }
    expect(readdirSync(path.dirname(root)).sort()).toEqual(["outside.txt", "v"]);
  });
  test("ACC-KN-07 恢复：原路径有同名 → 要求新名称，原有文件不变；永久删除", async () => {
    const { svc, root } = await setup({ "n.md": "旧" });
    const { trashId } = await svc.trash("n.md");
    writeFileSync(path.join(root, "n.md"), "新占位");
    await expect(svc.restore(trashId)).rejects.toThrowError(/已存在/);
    expect(rd(root, "n.md")).toBe("新占位");
    expect(await svc.restore(trashId, "n-恢复")).toBe("n-恢复.md");
    expect(rd(root, "n-恢复.md")).toBe("旧");
    const t2 = await svc.trash("n-恢复.md");
    await svc.deletePermanent(t2.trashId);
    expect(svc.list("trash")).toEqual([]);
  });
});

describe("日记与筛选", () => {
  test("今天按 Vault 时区取纯日期", () => {
    const instant = new Date("2026-11-07T03:00:00Z");
    expect(todayInZone(instant, "America/Los_Angeles")).toBe("2026-11-06");
    expect(todayInZone(instant, "Asia/Taipei")).toBe("2026-11-07");
  });
  test("ACC-KN-11 不存在则按模板创建，存在则直接打开；目录被删后重建", async () => {
    const { svc, root } = await setup();
    const a = await svc.openDaily("2026-11-10");
    expect(a).toEqual({ path: "日记/2026-11-10 · 每日笔记.md", created: true });
    expect(rd(root, a.path)).toContain("## 今天最重要的事");
    expect(await svc.openDaily("2026-11-10")).toMatchObject({ created: false });
    rmSync(path.join(root, "日记"), { recursive: true });
    expect(await svc.openDaily("2026-11-11")).toMatchObject({ created: true });
    await expect(svc.openDaily("2026/11/10")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(svc.openDaily("2026-02-29")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  test("同一天并发打开只创建一个日记文件", async () => {
    const { svc, root } = await setup();
    const replies = await Promise.all([svc.openDaily("2028-02-29"), svc.openDaily("2028-02-29")]);
    expect(replies.map(({ created }) => created).sort()).toEqual([false, true]);
    const paths = new Set(replies.map(({ path }) => path));
    expect([...paths]).toEqual(["日记/2028-02-29 · 每日笔记.md"]);
    expect(rd(root, replies[0]!.path)).toContain("## 今天最重要的事");
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
    const { trashId } = await svc.trash("v1.2 方案.md");
    expect(await svc.restore(trashId, "Q1.5 计划")).toBe("Q1.5 计划.md");
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

describe("任务文件与文件夹链接的改写（任务 spec §3.4）", () => {
  const task = (body: string) =>
    `---\nhuhu: {kind: task, id: task-1, schema: 2}\ntitle: 含 [[设计/旧/]] 的标题不应被改\nstatus: not_started\n---\n\n<task>\n\n${body}\n\n</task>\n\n<comments>\n\n<comment id="c1" at="2026-11-10T12:00:00Z" source="human">\n\n评论里也有 [[设计/旧/a.md]]\n\n</comment>\n\n</comments>\n`;
  test("文件夹改名：Tasks/ 里 <task> 与评论中的 [[旧/]]、[[旧/a.md]] 同步更新；frontmatter 不动；笔记里的 [[旧/]] 也更新", async () => {
    const { svc, root, rebuild } = await setup({ "设计/旧/a.md": "# a\n", "Tasks/t--task-1.md": task("参考 [[设计/旧/]] 与 `[[设计/旧/]]`"), "笔记.md": "见 [[设计/旧/]]\n" });
    await rebuild();
    const r = await svc.rename("设计/旧", "新");
    expect(r.rewrittenFiles.sort()).toEqual(["Tasks/t--task-1.md", "笔记.md"]);
    const text = rd(root, "Tasks/t--task-1.md");
    expect(text).toContain("参考 [[设计/新/]] 与 `[[设计/旧/]]`");
    expect(text).toContain("评论里也有 [[设计/新/a.md]]");
    expect(text).toContain("title: 含 [[设计/旧/]] 的标题不应被改");
    expect(text).toContain("schema: 2");
    expect(rd(root, "笔记.md")).toBe("见 [[设计/新/]]\n");
  });
  test("单个文件移动不会改写指向其所在文件夹的 [[目录/]]", async () => {
    const { svc, root, rebuild } = await setup({ "设计/a.md": "# a\n", "笔记.md": "见 [[设计/]] 和 [[设计/a.md]]\n" });
    await svc.createFolder("归档");
    await rebuild();
    await svc.move("设计/a.md", "归档");
    expect(rd(root, "笔记.md")).toBe("见 [[设计/]] 和 [[归档/a.md]]\n");
  });
});

describe("hiddenPaths（OP-D11：仅文件树隐藏的偏好）", () => {
  test("读写：规范化、去重、排序；越界路径被拒", async () => {
    const { svc } = await setup();
    expect(svc.hiddenPaths()).toEqual([]);
    expect(await svc.setHiddenPaths(["./b/", "a", "a", "b"])).toEqual(["a", "b"]);
    expect(svc.hiddenPaths()).toEqual(["a", "b"]);
    await expect(svc.setHiddenPaths(["../x"])).rejects.toThrow(/路径越界/);
    expect(svc.hiddenPaths()).toEqual(["a", "b"]);
  });

  test("OP-D11：载入旧只含数组的规则，首次内部改名迁移并保留其余规则", async () => {
    const { svc, root, rebuild } = await setup({ "d/a.md": "x", "solo.md": "s", ".huhu/notes/hidden-paths.json": '["d", "solo.md"]' });
    expect(svc.hiddenPaths()).toEqual(["d", "solo.md"]);
    await svc.rename("solo.md", "renamed");
    expect(JSON.parse(rd(root, ".huhu/notes/ui-preferences.json"))).toEqual({ hiddenPaths: ["d", "renamed.md"] });
    renameSync(path.join(root, "d"), path.join(root, "external"));
    await rebuild();
    expect(svc.hiddenPaths()).toEqual(["d", "renamed.md"]);
    expect(svc.list("all").map((n) => n.path)).toContain("external/a.md");
  });

  test("内部改名 / 移动：规则与子树规则一起重定位；无关规则不动", async () => {
    const { svc, rebuild } = await setup({ "d/a.md": "x", "d/sub/b.md": "y", "keep/c.md": "z", "solo.md": "s" });
    await svc.setHiddenPaths(["d", "d/sub/b.md", "keep", "solo.md"]);
    await svc.moveEntry("d", "e");
    expect(svc.hiddenPaths()).toEqual(["e", "e/sub/b.md", "keep", "solo.md"]);
    await rebuild();
    await svc.rename("solo.md", "alone");
    expect(svc.hiddenPaths()).toEqual(["alone.md", "e", "e/sub/b.md", "keep"]);
    await rebuild();
    await svc.move("alone.md", "keep");
    expect(svc.hiddenPaths()).toEqual(["e", "e/sub/b.md", "keep", "keep/alone.md"]);
  });

  test("空文件夹改名也重定位", async () => {
    const { svc } = await setup();
    await svc.createFolder("empty");
    await svc.setHiddenPaths(["empty"]);
    await svc.moveEntry("empty", "renamed");
    expect(svc.hiddenPaths()).toEqual(["renamed"]);
  });

  test("隐藏规则不影响笔记列表 / 搜索语义（只是偏好数据）", async () => {
    const { svc } = await setup({ "a.md": "# A" });
    await svc.setHiddenPaths(["a.md"]);
    expect(svc.list("all").map((n) => n.path)).toContain("a.md");
  });
});

test("F02 普通保存拒绝非法 UTF-8，保留磁盘原字节", async () => {
  const { svc, root, vf } = await setup();
  const file = "旧编码.md";
  const original = Buffer.from([0x41, 0xc3, 0x28, 0x0a]);
  writeFileSync(path.join(root, file), original);
  expect(() => svc.read(file)).toThrow(/UTF-8/);
  await expect(svc.save(file, "替换", vf.currentVersion(file)!)).rejects.toThrow(/UTF-8/);
  expect(readFileSync(path.join(root, file))).toEqual(original);
});

test("F02 显式转换需要原字节版本，按所选编码解码后才允许保存", async () => {
  const { svc, root } = await setup();
  const name = "旧文本.txt";
  const file = path.join(root, name);
  const old = Buffer.from([0xc4, 0xe3, 0xba, 0xc3, 0x0a]);
  writeFileSync(file, old);
  const info = svc.inspectEncoding(name);
  expect(info.state).toBe("encoding");
  await expect(svc.convertEncoding(name, "gb18030", "stale")).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  expect(readFileSync(file)).toEqual(old);
  const converted = await svc.convertEncoding(name, "gb18030", info.version);
  expect(svc.read(name)).toEqual({ path: name, text: "你好\n", version: converted.version });
  expect(readFileSync(file)).toEqual(Buffer.from("你好\n"));
});

test.each(["html", "htm", "HTML"])("HTML 源码可探测、读取和按版本保存（%s）", async (ext) => {
  const name = `页面.${ext}`;
  const original = "<!doctype html><p>原文</p>";
  const changed = "<!doctype html><p>新正文</p>";
  const { root, svc } = await setup({ [name]: original });
  const info = svc.inspectEncoding(name);
  expect(info).toMatchObject({ state: "ok", encodings: [] });
  expect(svc.read(name)).toEqual({ path: name, text: original, version: info.version });
  await svc.save(name, changed, info.version);
  expect(rd(root, name)).toBe(changed);
  await expect(svc.save(name, original, info.version)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  writeFileSync(path.join(root, name), Buffer.alloc(8 * 1024 * 1024 + 1, 0x61));
  expect(() => svc.inspectEncoding(name)).toThrow(/8 MiB/);
});

test("HTML 保存按 UTF-8 字节上限拒绝超限正文并保留原文件", async () => {
  const name = "页面.html";
  const original = "<p>原文</p>";
  const { root, svc } = await setup({ [name]: original });
  const { version } = svc.read(name);
  const oversized = "中".repeat(Math.floor((8 * 1024 * 1024) / 3) + 1);
  await expect(svc.save(name, oversized, version)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(rd(root, name)).toBe(original);
  expect(svc.read(name).version).toBe(version);
});

test("编码探测和转换根据实际大小与真实目标拒绝读取", async () => {
  const { root, svc } = await setup({ "large.txt": "a", ".huhu/private.txt": "secret" });
  writeFileSync(path.join(root, "large.txt"), Buffer.alloc(1024 * 1024 + 1, 0xfe));
  symlinkSync(".huhu/private.txt", path.join(root, "link.txt"));
  expect(() => svc.inspectEncoding("large.txt")).toThrow(/1 MiB/);
  expect(() => svc.inspectEncoding("link.txt")).toThrow();
  await expect(svc.convertEncoding("large.txt", "windows-1252", "stale")).rejects.toThrow(/1 MiB/);
  await expect(svc.convertEncoding("link.txt", "windows-1252", "stale")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
});

test("编码转换在提交前遇到外部更新时保留外部文件和已预览字节", async () => {
  const { root, svc, vf } = await setup();
  const rel = "旧编码.txt";
  const file = path.join(root, rel);
  const original = Buffer.from([0xc4, 0xe3, 0xba, 0xc3]);
  const external = Buffer.from("外部更新\n");
  writeFileSync(file, original);
  const { version } = svc.inspectEncoding(rel);
  expect(svc.previewEncoding(rel, "gb18030", version)).toEqual({ text: "你好", truncated: false });
  const replace = vf.replaceRecoverably.bind(vf);
  vi.spyOn(vf, "replaceRecoverably").mockImplementationOnce((...args) => {
    writeFileSync(file, external);
    return replace(...args);
  });
  await expect(svc.convertEncoding(rel, "gb18030", version)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  expect(readFileSync(file)).toEqual(external);
  const recovery = path.join(root, ".huhu", "operations", "encoding-recovery");
  const [attempt] = readdirSync(recovery);
  expect(readFileSync(path.join(recovery, attempt!, "inspected"))).toEqual(original);
  expect(readFileSync(path.join(recovery, attempt!, "path.txt"), "utf8")).toBe(rel + "\n");
});

test.each([false, true])("可预览和确认 UTF-16LE（带 BOM：%s）", async (bom) => {
  const { root, svc } = await setup();
  const rel = "utf16.txt";
  const file = path.join(root, rel);
  const text = "hello 你好\n";
  const bytes = Buffer.from(bom ? "\ufeff" + text : text, "utf16le");
  writeFileSync(file, bytes);
  const { version, encodings } = svc.inspectEncoding(rel);
  expect(encodings).toContain("utf-16le");
  expect(() => svc.previewEncoding(rel, bom ? "utf-16be" : "gb18030", version)).toThrow();
  expect(svc.previewEncoding(rel, "utf-16le", version)).toEqual({ text, truncated: false });
  expect(readFileSync(file)).toEqual(bytes);
  await expect(svc.convertEncoding(rel, "utf-16le", version)).resolves.toEqual({ version: versionOf(Buffer.from(text)) });
  expect(readFileSync(file)).toEqual(Buffer.from(text));
});

test("移动前拒绝会改变指向的相对链接，内部链接随整目录保留", async () => {
  const { root, svc, ops } = await setup({ "源/plain.md": "inside", "outside.md": "outside", "目标/keep.md": "keep" });
  const outside = path.join(root, "源", "outside.md");
  symlinkSync("../outside.md", outside);
  symlinkSync("plain.md", path.join(root, "源", "inside.md"));
  await expect(svc.move("源", "目标")).rejects.toThrow(/源\/outside\.md/);
  expect(readFileSync(outside, "utf8")).toBe("outside");
  expect(existsSync(path.join(root, "目标", "源"))).toBe(false);
  expect(ops.list()).toEqual([]);
  rmSync(outside);
  await svc.move("源", "目标");
  expect(readFileSync(path.join(root, "目标", "源", "inside.md"), "utf8")).toBe("inside");
  expect(existsSync(path.join(root, "源"))).toBe(false);
});
