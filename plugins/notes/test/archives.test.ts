import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OperationLog, Trash, VaultFiles, VaultIndex } from "@huhu/vault";
import { afterEach, describe, expect, test } from "vitest";
import { ArchivesService } from "../src/engine/archives/service.js";
import { NotesService } from "../src/engine/service.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function setup(files: Record<string, string> = {}) {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-ar-"));
  dirs.push(d);
  const root = path.join(d, "v");
  mkdirSync(path.join(root, ".huhu"), { recursive: true });
  const put = (p: string, c: string) => {
    mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    writeFileSync(path.join(root, p), c);
  };
  for (const [p, c] of Object.entries(files)) put(p, c);
  const vf = new VaultFiles(root);
  const index = new VaultIndex(root);
  await index.build();
  const ops = new OperationLog(vf, path.join(d, "ops"));
  const trash = new Trash(vf);
  const notes = new NotesService({ files: vf, ops, index, trash, now: () => new Date("2026-11-10T12:00:00Z"), zone: () => "UTC" });
  const events: unknown[] = [];
  const svc = new ArchivesService({ files: vf, ops, index, notes, publish: (t, p) => events.push([t, p]), now: () => new Date("2026-11-10T12:00:00Z") });
  return { svc, notes, root, put, rebuild: () => index.build(), events, ops, vf };
}
const rd = (root: string, p: string) => readFileSync(path.join(root, p), "utf8");
const fields = [
  { name: "电话", type: "text" as const },
  { name: "生日", type: "date" as const },
  { name: "主页", type: "url" as const },
  { name: "年龄", type: "number" as const },
];

describe("类型（AR-01 / AR-13）", () => {
  test("新建类型：磁盘上出现 Archives/<名>/index.md，frontmatter 含 icon 与 fields；分配 noteId；重名追加随机码", async () => {
    const { svc, root } = await setup();
    const t = await svc.saveType({ name: "通讯录", icon: "users", fields });
    expect(t).toMatchObject({ path: "Archives/通讯录/", name: "通讯录", icon: "users", count: 0 });
    expect(t.noteId).toMatch(/^note-/);
    const text = rd(root, "Archives/通讯录/index.md");
    expect(text).toContain("icon: users");
    expect(text).toContain("- name: 电话\n    type: text");
    const dup = await svc.saveType({ name: "通讯录", fields: [] });
    expect(dup.name).toMatch(/^通讯录-[a-z0-9]{4}$/);
  });
  test("字段校验：保留名、非法字符、重复（NFC / 首尾空白后判断）、空名", async () => {
    const { svc } = await setup();
    for (const bad of ["title", "Tags", "huhuX", "a:b", "a#b", "", "  "]) await expect(svc.saveType({ name: "x", fields: [{ name: bad, type: "text" }] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      svc.saveType({
        name: "x",
        fields: [
          { name: "é", type: "text" },
          { name: " é ", type: "text" },
        ],
      }),
    ).rejects.toThrow(/重复/); // e + 组合重音 与 é
  });
  test("AR-13 命令行建的目录无需索引：mkdir 出来的类型和档案都能枚举，noteId 为 null", async () => {
    const { svc, root } = await setup();
    mkdirSync(path.join(root, "Archives/书籍/三体"), { recursive: true });
    expect(svc.types()).toMatchObject([{ path: "Archives/书籍/", name: "书籍", fields: [], count: 1, noteId: null }]);
    expect(svc.list()).toMatchObject([{ path: "Archives/书籍/三体/", name: "三体", type: "Archives/书籍/", noteId: null, fields: {} }]);
  });
});

describe("档案（AR-02 / AR-03 / AR-05 / AR-19）", () => {
  test("创建：文本字段带引号，键名即字段名；同名追加 4 位随机码且之后不变", async () => {
    const { svc, root } = await setup();
    await svc.saveType({ name: "通讯录", fields });
    const a = await svc.create({ type: "通讯录", name: "张三", fields: { 电话: "0123", 年龄: 34, 生日: "1990-05-01", 主页: "https://example.com" } });
    expect(a).toMatchObject({ path: "Archives/通讯录/张三/", fields: { 电话: "0123", 年龄: 34, 生日: "1990-05-01" }, invalidFields: [], undefinedFields: [] });
    expect(rd(root, "Archives/通讯录/张三/index.md")).toBe('---\n电话: "0123"\n生日: 1990-05-01\n主页: https://example.com\n年龄: 34\n---\n');
    expect(a.noteId).toMatch(/^note-/);
    const b = await svc.create({ type: "通讯录", name: "张三" });
    expect(b.name).toMatch(/^张三-[a-z0-9]{4}$/);
    expect(svc.list().map((x) => x.name)).toContain(b.name);
    const c = await svc.create({ type: "通讯录", name: "ZHANG" });
    const d = await svc.create({ type: "通讯录", name: "zhang" }); // 大小写不敏感
    expect(c.name).toBe("ZHANG");
    expect(d.name).toMatch(/^zhang-[a-z0-9]{4}$/);
  });
  test("AR-03 经能力写入不合法的值被拒绝；直接改文件写入的仍读出并标红", async () => {
    const { svc, root, rebuild } = await setup();
    await svc.saveType({ name: "通讯录", fields });
    await expect(svc.create({ type: "通讯录", name: "李四", fields: { 生日: "1990/5/1" } })).rejects.toThrow(/YYYY-MM-DD/);
    await expect(svc.create({ type: "通讯录", name: "李四", fields: { 主页: "ftp://x" } })).rejects.toThrow(/http/);
    await expect(svc.create({ type: "通讯录", name: "李四", fields: { 年龄: "abc" } })).rejects.toThrow(/数字/);
    await expect(svc.create({ type: "通讯录", name: "李四", fields: { 不存在: "x" } })).rejects.toThrow(/不是该类型的字段/);
    const a = await svc.create({ type: "通讯录", name: "王五" });
    writeFileSync(path.join(root, "Archives/通讯录/王五/index.md"), "---\n生日: 1990/5/1\n---\n");
    await rebuild();
    expect(svc.read("Archives/通讯录/王五/").invalidFields).toEqual([{ name: "生日", reason: "「生日」日期格式应为 YYYY-MM-DD" }]);
    expect(a.path).toBe("Archives/通讯录/王五/");
  });
  test('AR-19 手写 电话: 0123 读出 "0123"，不是 123', async () => {
    const { svc, put } = await setup({ "Archives/通讯录/index.md": "---\nfields:\n  - {name: 电话, type: text}\n---\n" });
    put("Archives/通讯录/张三/index.md", "---\n电话: 0123\n---\n");
    expect(svc.read("Archives/通讯录/张三/").fields).toEqual({ 电话: "0123" });
  });
  test("AR-05 模板里没有的键列为未定义字段、原样保留；removeKeys 删除；保留键不能删除", async () => {
    const { svc, root, put } = await setup({ "Archives/通讯录/index.md": "---\nfields:\n  - {name: 电话, type: text}\n---\n" });
    put("Archives/通讯录/张三/index.md", "---\n电话: '1'\n主页: https://x.com\n备注: 手写\n---\n正文\n");
    const a = svc.read("Archives/通讯录/张三/");
    expect(a.undefinedFields).toEqual(["主页", "备注"]);
    expect(a.body).toBe("正文\n");
    const u = await svc.update({ path: a.path, expectedVersion: a.version!, removeKeys: ["主页"] });
    expect(u.undefinedFields).toEqual(["备注"]);
    expect(rd(root, "Archives/通讯录/张三/index.md")).toBe("---\n电话: '1'\n备注: 手写\n---\n正文\n");
    await expect(svc.update({ path: a.path, removeKeys: ["huhu"] })).rejects.toThrow(/不能删除/);
  });
  test("update：字段与已有值合并、清空字段删除键、版本冲突被拒绝；没有 index.md 的档案第一次保存时创建", async () => {
    const { svc, root } = await setup({ "Archives/通讯录/index.md": "---\nfields:\n  - {name: 电话, type: text}\n  - {name: 年龄, type: number}\n---\n", "Archives/通讯录/空/资料.md": "# 资料\n" });
    const e = svc.read("Archives/通讯录/空/");
    expect(e.version).toBeNull();
    const created = await svc.update({ path: e.path, fields: { 电话: "1" } });
    expect(created.noteId).toMatch(/^note-/);
    expect(rd(root, "Archives/通讯录/空/index.md")).toBe('---\n电话: "1"\n---\n');
    const cur = svc.read(e.path);
    await svc.update({ path: e.path, expectedVersion: cur.version!, fields: { 年龄: 3 } });
    expect(rd(root, "Archives/通讯录/空/index.md")).toBe('---\n电话: "1"\n年龄: 3\n---\n');
    await expect(svc.update({ path: e.path, expectedVersion: cur.version!, fields: { 年龄: 4 } })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const now = svc.read(e.path);
    await svc.update({ path: e.path, expectedVersion: now.version!, fields: { 年龄: "" }, body: "新正文\n" });
    expect(rd(root, "Archives/通讯录/空/index.md")).toBe('---\n电话: "1"\n---\n新正文\n');
  });
});

describe("字段改名（AR-04 / AR-20）", () => {
  const tpl = "---\nicon: users\nfields:\n  - {name: 电话, type: text}\n  - {name: 生日, type: date}\n---\n";
  test("renames 在一个操作中改所有档案的键，其他键的值与顺序不变；模板同时更新", async () => {
    const { svc, root, put } = await setup({ "Archives/通讯录/index.md": tpl });
    put("Archives/通讯录/张三/index.md", "---\n生日: 1990-05-01\n电话: '1'\n---\n正文\n");
    put("Archives/通讯录/李四/index.md", "---\n电话: '2'\n---\n");
    put("Archives/通讯录/空白/资料.md", "# 无 index\n");
    const t = await svc.saveType({
      path: "Archives/通讯录/",
      name: "通讯录",
      fields: [
        { name: "手机", type: "text" },
        { name: "生日", type: "date" },
      ],
      renames: [{ from: "电话", to: "手机" }],
    });
    expect(t.fields.map((f) => f.name)).toEqual(["手机", "生日"]);
    expect(rd(root, "Archives/通讯录/张三/index.md")).toBe("---\n生日: 1990-05-01\n手机: '1'\n---\n正文\n");
    expect(rd(root, "Archives/通讯录/李四/index.md")).toBe("---\n手机: '2'\n---\n");
    expect(rd(root, "Archives/通讯录/index.md")).toContain("icon: users");
  });
  test("AR-20 某个档案已有目标键或 frontmatter 无法解析 → 整体拒绝并列出文件，所有文件保持原样", async () => {
    const { svc, root, put } = await setup({ "Archives/通讯录/index.md": tpl });
    put("Archives/通讯录/张三/index.md", "---\n电话: '1'\n手机: '9'\n---\n");
    put("Archives/通讯录/李四/index.md", "---\n电话: '2'\n---\n");
    put("Archives/通讯录/坏/index.md", "---\n电话: [\n---\n");
    const before = ["index.md", "张三/index.md", "李四/index.md", "坏/index.md"].map((f) => rd(root, `Archives/通讯录/${f}`));
    const err = await svc
      .saveType({
        path: "Archives/通讯录/",
        name: "通讯录",
        fields: [
          { name: "手机", type: "text" },
          { name: "生日", type: "date" },
        ],
        renames: [{ from: "电话", to: "手机" }],
      })
      .catch((e: Error) => e);
    expect(err).toMatchObject({ code: "INVALID_INPUT" });
    expect((err as Error).message).toContain("Archives/通讯录/张三/index.md");
    expect((err as Error).message).toContain("Archives/通讯录/坏/index.md");
    expect((err as Error).message).not.toContain("李四");
    expect(["index.md", "张三/index.md", "李四/index.md", "坏/index.md"].map((f) => rd(root, `Archives/通讯录/${f}`))).toEqual(before);
  });
  test("renames 的目标字段必须在新字段列表里", async () => {
    const { svc } = await setup({ "Archives/通讯录/index.md": tpl });
    await expect(svc.saveType({ path: "Archives/通讯录/", name: "通讯录", fields: [{ name: "生日", type: "date" }], renames: [{ from: "电话", to: "手机" }] })).rejects.toThrow(/不在字段列表/);
  });
});

describe("移动、改名与删除（AR-07 / AR-08 / AR-12 / AR-18）", () => {
  test("改名：双链改写、noteId 不变；移到其他类型：文件夹移动并改写双链，重名加随机码", async () => {
    const { svc, root, put, rebuild } = await setup({ "Archives/通讯录/index.md": "---\nfields:\n  - {name: 电话, type: text}\n---\n", "Archives/同事/index.md": "" });
    const a = await svc.create({ type: "通讯录", name: "张三", fields: { 电话: "1" } });
    put("项目/年度计划.md", "见 [[Archives/通讯录/张三/]] 与 [[Archives/通讯录/张三/index.md]]\n");
    await rebuild();
    const renamed = await svc.update({ path: a.path, name: "张三丰" });
    expect(renamed).toMatchObject({ path: "Archives/通讯录/张三丰/", name: "张三丰", noteId: a.noteId });
    expect(rd(root, "项目/年度计划.md")).toBe("见 [[Archives/通讯录/张三丰/]] 与 [[Archives/通讯录/张三丰/index.md]]\n");
    mkdirSync(path.join(root, "Archives/同事/张三丰"), { recursive: true });
    await rebuild();
    const moved = await svc.move({ path: renamed.path, type: "同事" });
    expect(moved.type).toBe("Archives/同事/");
    expect(moved.name).toMatch(/^张三丰-[a-z0-9]{4}$/);
    expect(moved.noteId).toBe(a.noteId);
    expect(rd(root, "项目/年度计划.md")).toContain(`[[Archives/同事/${moved.name}/]]`);
    expect(existsSync(path.join(root, "Archives/通讯录/张三丰"))).toBe(false);
  });
  test("AR-18 被链接只算档案外部的链接：[[index]] 与档案内部文件之间的链接都不算", async () => {
    const { svc, put, rebuild } = await setup({ "Archives/通讯录/index.md": "" });
    const a = await svc.create({ type: "通讯录", name: "张三" });
    put("Archives/通讯录/张三/资料.md", "内部 [[Archives/通讯录/张三/]]\n");
    put("外部.md", "指向 [[Archives/通讯录/张三/]]\n");
    put("文件.md", "指向内部文件 [[Archives/通讯录/张三/资料.md]]\n");
    put("裸名.md", "[[index]]\n");
    await rebuild();
    const r = svc.read(a.path);
    expect(r.backlinks.map((b) => b.path).sort()).toEqual(["externo".replace("externo", "外部.md"), "文件.md"].sort());
    expect(r.files).toEqual([{ path: "Archives/通讯录/张三/资料.md", name: "资料.md", kind: "note" }]);
    expect(r.outgoing).toEqual([]);
  });
  test("AR-12 删除：整个文件夹进回收站并返回文件数；恢复后 noteId 与内容回来", async () => {
    const { svc, notes, root, put, rebuild } = await setup({ "Archives/通讯录/index.md": "" });
    const a = await svc.create({ type: "通讯录", name: "张三", body: "正文\n" });
    put("Archives/通讯录/张三/资料.md", "# 资料\n");
    await rebuild();
    expect(await svc.delete(a.path)).toEqual({ trashed: 2 });
    expect(existsSync(path.join(root, "Archives/通讯录/张三"))).toBe(false);
    const item = notes.list("trash").find((x) => x.path === "Archives/通讯录/张三");
    expect(item?.trashId).toBeTruthy();
    await notes.restore(item!.trashId!);
    expect(rd(root, "Archives/通讯录/张三/index.md")).toBe("正文\n");
    expect(notes.noteId("Archives/通讯录/张三/index.md")).toBe(a.noteId);
  });
  test("删除类型：整个类型文件夹进回收站", async () => {
    const { svc, root } = await setup({ "Archives/通讯录/index.md": "" });
    await svc.create({ type: "通讯录", name: "张三" });
    expect((await svc.deleteType("Archives/通讯录/")).trashed).toBe(2);
    expect(existsSync(path.join(root, "Archives/通讯录"))).toBe(false);
  });
  test("路径防护：不是两层/三层的 Archives 路径一律 NOT_FOUND", async () => {
    const { svc } = await setup({ "Archives/通讯录/index.md": "", "其他/x.md": "" });
    expect(() => svc.read("其他/x")).toThrow(/档案不存在/);
    expect(() => svc.read("Archives/通讯录/")).toThrow();
    expect(() => svc.read("../外面/")).toThrow();
    await expect(svc.update({ path: "Archives/不存在/张三/" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  test("类型改名：经 notes 移动逻辑，档案与双链随之移动；重名加随机码", async () => {
    const { svc, root, put, rebuild } = await setup({ "Archives/通讯录/index.md": "---\nfields:\n  - {name: 电话, type: text}\n---\n", "Archives/联系人/占位.md": "x" });
    await svc.create({ type: "通讯录", name: "张三" });
    put("笔记.md", "[[Archives/通讯录/张三/]]\n");
    await rebuild();
    const t = await svc.saveType({ path: "Archives/通讯录/", name: "朋友", fields: [{ name: "电话", type: "text" }] });
    expect(t.path).toBe("Archives/朋友/");
    expect(rd(root, "笔记.md")).toBe("[[Archives/朋友/张三/]]\n");
    const again = await svc.saveType({ path: "Archives/朋友/", name: "联系人", fields: [{ name: "电话", type: "text" }] }); // 已有同名类型：加随机码，不报错
    expect(again.name).toMatch(/^联系人-[a-z0-9]{4}$/);
  });
});
