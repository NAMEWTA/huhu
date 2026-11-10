import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OperationLog, SemanticRepository, VaultFiles } from "@huhu/vault";
import { afterEach, describe, expect, test } from "vitest";
import { ArchivesService } from "../src/engine/service.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
function setup() {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-a-")); dirs.push(d);
  const root = path.join(d, "v"); mkdirSync(path.join(root, ".huhu"), { recursive: true });
  const files = new VaultFiles(root);
  const events: string[] = [];
  const svc = new ArchivesService({ repo: new SemanticRepository(files, new OperationLog(files, path.join(d, "ops"))), files, ops: new OperationLog(files, path.join(d, "ops2")), publish: (t, p) => events.push(`${t}:${JSON.stringify(p)}`), now: () => new Date("2026-11-10T12:00:00Z") });
  return { svc, root, events };
}
const rd = (root: string, p: string) => readFileSync(path.join(root, p), "utf8");

async function twoTypes(svc: ArchivesService) {
  const project = await svc.saveType({ name: "项目", fields: [{ id: "owner", label: "负责人", type: "text" }, { id: "site", label: "网站", type: "url" }, { id: "target", label: "目标日期", type: "date" }] });
  const book = await svc.saveType({ name: "书籍", fields: [{ id: "author", label: "作者", type: "text" }] });
  return { project, book };
}

describe("类型", () => {
  test("创建、重名拒绝、字段标识重复拒绝", async () => {
    const { svc } = setup();
    await twoTypes(svc);
    await expect(svc.saveType({ name: "项目", fields: [] })).rejects.toMatchObject({ code: "NAME_CONFLICT" });
    await expect(svc.saveType({ name: "x", fields: [{ id: "a", label: "A", type: "text" }, { id: "a", label: "B", type: "text" }] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(svc.types().map((t) => t.name).sort()).toEqual(["书籍", "项目"]);
  });
  test("ACC-AR-03 删除有档案的类型：必须迁移；迁移与删除一起完成", async () => {
    const { svc } = setup();
    const { project, book } = await twoTypes(svc);
    const a = await svc.create({ name: "A", type: project.id });
    const b = await svc.create({ name: "B", type: project.id });
    await expect(svc.deleteType(project.id)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(svc.deleteType(project.id, project.id)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await svc.deleteType(project.id, book.id)).toEqual({ migrated: 2 });
    expect(svc.read(a.id).type).toBe(book.id);
    expect(svc.read(b.id).type).toBe(book.id);
    expect(svc.types().map((t) => t.id)).toEqual([book.id]);
  });
  test("无档案的类型直接删除", async () => {
    const { svc } = setup();
    const { book } = await twoTypes(svc);
    expect(await svc.deleteType(book.id)).toEqual({ migrated: 0 });
  });
});

describe("档案", () => {
  test("字段校验：链接/日期/数字/必填", async () => {
    const { svc } = setup();
    const { project } = await twoTypes(svc);
    await expect(svc.create({ name: " ", type: project.id })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(svc.create({ name: "X", type: project.id, fields: { site: "ftp://x" } })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(svc.create({ name: "X", type: project.id, fields: { target: "明天" } })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const ok = await svc.create({ name: "X", type: project.id, fields: { owner: "我", site: "https://a.com", target: "2026-11-20" } });
    expect(ok.fields).toMatchObject({ owner: "我" });
  });
  test("ACC-AR-01 关系双写；取消关系双方清除", async () => {
    const { svc, root } = setup();
    const { project } = await twoTypes(svc);
    const a = await svc.create({ name: "A", type: project.id });
    const b = await svc.create({ name: "B", type: project.id });
    await svc.setRelations(a.id, [b.id]);
    expect(svc.read(a.id).relatedIds).toEqual([b.id]);
    expect(svc.read(b.id).relatedIds).toEqual([a.id]);
    expect(rd(root, svc.read(b.id).path)).toContain(a.id);
    await svc.setRelations(a.id, []);
    expect(svc.read(a.id).relatedIds).toEqual([]);
    expect(svc.read(b.id).relatedIds).toEqual([]);
  });
  test("ACC-AR-02 更改类型保留字段值，旧字段进入未定义字段", async () => {
    const { svc } = setup();
    const { project, book } = await twoTypes(svc);
    const x = await svc.create({ name: "X", type: project.id, fields: { owner: "我" } });
    const moved = await svc.changeType(x.id, x.version, book.id);
    expect(moved.type).toBe(book.id);
    expect(moved.fields).toEqual({ owner: "我" });
    expect(moved.undefinedFields).toEqual(["owner"]);
    // 编辑时保留未定义字段
    const edited = await svc.update(moved.id, moved.version, { fields: { author: "某人" } });
    expect(edited.fields).toEqual({ owner: "我", author: "某人" });
  });
  test("ACC-AR-04 删除：文件消失，其他档案 relatedIds 清理", async () => {
    const { svc, root } = setup();
    const { project } = await twoTypes(svc);
    const a = await svc.create({ name: "A", type: project.id });
    const b = await svc.create({ name: "B", type: project.id });
    await svc.setRelations(a.id, [b.id]);
    await svc.delete(a.id);
    expect(() => svc.read(a.id)).toThrow();
    expect(svc.read(b.id).relatedIds).toEqual([]);
    expect(() => rd(root, a.path)).toThrow();
  });
  test("对方不存在 → 关系保留并标记失效", async () => {
    const { svc, root } = setup();
    const { project } = await twoTypes(svc);
    const a = await svc.create({ name: "A", type: project.id });
    const f = path.join(root, a.path);
    writeFileSync(f, readFileSync(f, "utf8").replace("relatedIds: []", "relatedIds: [archive-ghost1]"));
    const r = svc.read(a.id);
    expect(r.relatedIds).toEqual(["archive-ghost1"]);
    expect(r.staleRelations).toEqual(["archive-ghost1"]);
  });
  test("ACC-AR-05 外部加的未知键、注释、顺序在改名后保留", async () => {
    const { svc, root } = setup();
    const { project } = await twoTypes(svc);
    const a = await svc.create({ name: "旧名", type: project.id });
    const f = path.join(root, a.path);
    writeFileSync(f, readFileSync(f, "utf8").replace("fields: {}", "fields: {}\nrating: 5 # 我的评分"));
    const cur = svc.read(a.id);
    const out = await svc.update(a.id, cur.version, { name: "新名" });
    const text = rd(root, out.path);
    expect(text).toContain("rating: 5 # 我的评分");
    expect(text.indexOf("fields:")).toBeLessThan(text.indexOf("rating:"));
    expect(out.name).toBe("新名");
  });
  test("笔记关联与搜索", async () => {
    const { svc } = setup();
    const { project } = await twoTypes(svc);
    const a = await svc.create({ name: "HUHU 工作台", type: project.id, fields: { owner: "我" }, body: "长期项目" });
    await svc.linkNote(a.id, "note-abc12345");
    await svc.linkNote(a.id, "note-abc12345");
    expect(svc.read(a.id).noteIds).toEqual(["note-abc12345"]);
    expect(svc.list({ query: "长期" })).toHaveLength(1);
    expect(svc.list({ query: "我" })).toHaveLength(1);
    expect(svc.list({ type: "atype-none" })).toHaveLength(0);
    await svc.unlinkNote(a.id, "note-abc12345");
    expect(svc.read(a.id).noteIds).toEqual([]);
  });
});
