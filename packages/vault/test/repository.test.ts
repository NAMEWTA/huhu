import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { OperationLog, SemanticRepository, VaultFiles, idFromFilename, sanitizeTitle, semanticFilename } from "../src/index.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
function setup() {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-r-")); dirs.push(d);
  const root = path.join(d, "v"); mkdirSync(root);
  const files = new VaultFiles(root);
  return { root, repo: new SemanticRepository(files, new OperationLog(files, path.join(d, "ops"))), files };
}
const now = "2026-11-10T07:15:31Z";
const taskData = (title: string) => ({ title, completed: false, createdAt: now, updatedAt: now });

describe("文件名", () => {
  test("清理与 id 提取", () => {
    expect(sanitizeTitle('a/b:c*?"<>|d')).toBe("a b c d");
    expect(sanitizeTitle("...")).toBe("未命名");
    expect(sanitizeTitle("x".repeat(200)).length).toBe(80);
    expect(idFromFilename(semanticFilename("整理--摘要", "task-abc123"))).toBe("task-abc123");
  });
});

describe("SemanticRepository", () => {
  test("创建 → 读取 → 列表", async () => {
    const { repo } = setup();
    const t = await repo.create("task", taskData("整理研究摘要"), "正文\n");
    expect(t.id).toMatch(/^task-/);
    expect(t.path).toBe(`Tasks/整理研究摘要--${t.id}.md`);
    const r = repo.read("task", t.id);
    expect(r.data).toMatchObject({ title: "整理研究摘要", completed: false, execution: { kind: "manual" }, inputRevision: 1 });
    expect(r.body).toContain("正文");
    expect(repo.list("task")).toHaveLength(1);
  });
  test("非法数据 → INVALID_INPUT，不写文件", async () => {
    const { repo, root } = setup();
    await expect(repo.create("task", { title: "", completed: false, createdAt: now, updatedAt: now })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(() => readdirSync(path.join(root, "Tasks"))).toThrow();
  });
  test("patch 只改变化的键，保留未知键与注释；版本冲突被拒", async () => {
    const { repo, root } = setup();
    const t = await repo.create("task", taskData("A"));
    const file = path.join(root, t.path);
    writeFileSync(file, readFileSync(file, "utf8").replace("completed: false", "completed: false # 用户注释\ncustomKey: 保留我"));
    const cur = repo.read("task", t.id);
    const p = await repo.patch("task", t.id, { completed: true }, cur.version);
    const text = readFileSync(path.join(root, p.path), "utf8");
    expect(text).toContain("completed: true # 用户注释");
    expect(text).toContain("customKey: 保留我");
    await expect(repo.patch("task", t.id, { completed: false }, cur.version)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
  test("标题变更 → 文件改名，id 不变", async () => {
    const { repo, root } = setup();
    const t = await repo.create("task", taskData("旧标题"));
    const p = await repo.patch("task", t.id, { title: "新标题" }, t.version);
    expect(p.path).toBe(`Tasks/新标题--${t.id}.md`);
    expect(readdirSync(path.join(root, "Tasks"))).toEqual([`新标题--${t.id}.md`]);
    expect(repo.read("task", t.id).data).toMatchObject({ title: "新标题" });
  });
  test("坏 YAML / 缺 id / 模式不符 进入问题列表且不参与查询", async () => {
    const { repo, root } = setup();
    mkdirSync(path.join(root, "Tasks"));
    writeFileSync(path.join(root, "Tasks/bad.md"), "---\na: [1\n---\n");
    writeFileSync(path.join(root, "Tasks/noid.md"), "---\ntitle: x\n---\n");
    writeFileSync(path.join(root, "Tasks/schema.md"), "---\nhuhu: {kind: task, id: task-zzzzz1, schema: 1}\ntitle: 1\n---\n");
    expect(repo.list("task")).toEqual([]);
    expect(repo.problemList().map((p) => p.code).sort()).toEqual(["BAD_YAML", "INVALID_SCHEMA", "MISSING_ID"]);
    expect(readFileSync(path.join(root, "Tasks/bad.md"), "utf8")).toBe("---\na: [1\n---\n"); // 保持原样
  });
  test("id 冲突：两者都不参与查询", async () => {
    const { repo, root } = setup();
    const t = await repo.create("task", taskData("A"));
    writeFileSync(path.join(root, "Tasks/copy.md"), readFileSync(path.join(root, t.path)));
    expect(repo.list("task")).toEqual([]);
    expect(repo.problemList().filter((p) => p.code === "ID_CONFLICT")).toHaveLength(2);
  });
  test("schema 过新 → 只读，patch 被拒", async () => {
    const { repo, root } = setup();
    mkdirSync(path.join(root, "Tasks"));
    writeFileSync(path.join(root, "Tasks/future--task-fut001.md"), "---\nhuhu: {kind: task, id: task-fut001, schema: 9}\nnew: field\n---\n");
    const e = repo.read("task", "task-fut001");
    expect(e.readOnly).toBe(true);
    await expect(repo.patch("task", "task-fut001", { title: "x" }, e.version)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  test("删除", async () => {
    const { repo } = setup();
    const t = await repo.create("task", taskData("A"));
    await repo.delete("task", t.id, t.version);
    expect(repo.list("task")).toEqual([]);
    expect(() => repo.read("task", t.id)).toThrow();
  });
  test("YAML 日期自动解析为 Date 时仍通过模式", async () => {
    const { repo, root } = setup();
    mkdirSync(path.join(root, "Tasks"));
    writeFileSync(path.join(root, "Tasks/d--task-dat001.md"), "---\nhuhu: {kind: task, id: task-dat001, schema: 1}\ntitle: d\ncompleted: false\ndue: 2026-11-12\ncreatedAt: 2026-11-10T07:15:31Z\nupdatedAt: 2026-11-10T07:15:31Z\n---\n");
    expect(repo.read("task", "task-dat001").data).toMatchObject({ due: "2026-11-12" });
  });
});
