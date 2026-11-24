import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { OperationLog, SemanticRepository, VaultFiles, idFromFilename, sanitizeTitle, semanticFilename, versionOf } from "../src/index.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function setup() {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-r-"));
  dirs.push(d);
  const root = path.join(d, "v");
  mkdirSync(root);
  const files = new VaultFiles(root);
  return { root, repo: new SemanticRepository(files, new OperationLog(files, path.join(d, "ops"))), files };
}
const now = "2026-11-10T07:15:31Z";
const taskData = (title: string) => ({ title, type: "human", status: "not_started", origin: { kind: "desktop" }, createdAt: now, updatedAt: now });

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
    expect(r.data).toMatchObject({ title: "整理研究摘要", type: "human", status: "not_started", execution: null, tags: [], inputRevision: 1 });
    expect(r.body).toContain("正文");
    expect(repo.list("task")).toHaveLength(1);
  });
  test("非法数据 → INVALID_INPUT，不写文件", async () => {
    const { repo, root } = setup();
    await expect(repo.create("task", { title: "", type: "human", status: "not_started", origin: { kind: "desktop" }, createdAt: now, updatedAt: now })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(() => readdirSync(path.join(root, "Tasks"))).toThrow();
  });
  test("patch 只改变化的键，保留未知键与注释；版本冲突被拒", async () => {
    const { repo, root } = setup();
    const t = await repo.create("task", taskData("A"));
    const file = path.join(root, t.path);
    writeFileSync(file, readFileSync(file, "utf8").replace("status: not_started", "status: not_started # 用户注释\ncustomKey: 保留我"));
    const cur = repo.read("task", t.id);
    const p = await repo.patch("task", t.id, { status: "completed" }, cur.version);
    const text = readFileSync(path.join(root, p.path), "utf8");
    expect(text).toContain("status: completed # 用户注释");
    expect(text).toContain("customKey: 保留我");
    await expect(repo.patch("task", t.id, { status: "not_started" }, cur.version)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
  test("F02：语义 Markdown 内容含非法 UTF-8 时拒绝改写字段和重命名，保留原字节", async () => {
    const { repo, root } = setup();
    const task = await repo.create("task", taskData("原名"));
    const file = path.join(root, task.path);
    const bytes = Buffer.concat([readFileSync(file), Buffer.from([0x0a, 0xc3, 0x28, 0x0a])]);
    writeFileSync(file, bytes);
    const { version } = repo.read("task", task.id);
    await expect(repo.patch("task", task.id, { status: "completed" }, version)).rejects.toMatchObject({ code: "INVALID_INPUT", message: expect.stringContaining("UTF-8") });
    await expect(repo.patch("task", task.id, { title: "新名" }, version)).rejects.toMatchObject({ code: "INVALID_INPUT", message: expect.stringContaining("UTF-8") });
    expect(readdirSync(path.join(root, "Tasks"))).toEqual([path.basename(task.path)]);
    expect(readFileSync(file)).toEqual(bytes);
  });
  test("标题变更 → 文件改名，id 不变", async () => {
    const { repo, root } = setup();
    const t = await repo.create("task", taskData("旧标题"));
    const p = await repo.patch("task", t.id, { title: "新标题" }, t.version);
    expect(p.path).toBe(`Tasks/新标题--${t.id}.md`);
    expect(readdirSync(path.join(root, "Tasks"))).toEqual([`新标题--${t.id}.md`]);
    expect(repo.read("task", t.id).data).toMatchObject({ title: "新标题" });
  });
  test.each([
    ["坏 YAML", "---\nfield: [\n---\n外部内容"],
    ["缺 ID", "---\nhuhu: { kind: task, schema: 2 }\n---\n外部内容"],
    ["错误 kind", "---\nhuhu: { kind: capture, id: cap-zzzzz1, schema: 2 }\n---\n外部内容"],
  ])("改名遇到占位文件（%s），返回冲突路径并保留双方", async (_label, placeholder) => {
    const { repo, root } = setup();
    const task = await repo.create("task", taskData("原名"), "原正文");
    const target = `Tasks/${semanticFilename("目标", task.id)}`;
    const original = readFileSync(path.join(root, task.path));
    writeFileSync(path.join(root, target), placeholder);
    await expect(repo.patch("task", task.id, { title: "目标" }, task.version)).rejects.toMatchObject({ code: "NAME_CONFLICT", details: { path: target } });
    expect(readFileSync(path.join(root, target), "utf8")).toBe(placeholder);
    expect(readFileSync(path.join(root, task.path))).toEqual(original);
  });

  test("排队期间出现字节与拟写内容相同的目标，保留外部条目和源文件", async () => {
    const { files, repo, root } = setup();
    const task = await repo.create("task", taskData("Original"), "body");
    const target = `Tasks/${semanticFilename("Occupied", task.id)}`;
    const original = readFileSync(path.join(root, task.path), "utf8");
    const bytes = original.replace("title: Original", "title: Occupied");
    const external = files.withCommit([target], () => writeFileSync(path.join(root, target), bytes, { flag: "wx" }));
    const renamed = expect(repo.patch("task", task.id, { title: "Occupied" }, task.version)).rejects.toMatchObject({ code: "NAME_CONFLICT", details: { path: target } });
    await external;
    await renamed;
    expect(readFileSync(path.join(root, target), "utf8")).toBe(bytes);
    expect(readFileSync(path.join(root, task.path), "utf8")).toBe(original);
  });

  test("源在等待提交时被编辑，保留新版本并撤回本次创建的目标", async () => {
    const { files, repo, root } = setup();
    const task = await repo.create("task", taskData("Original"), "body");
    const target = `Tasks/${semanticFilename("Renamed", task.id)}`;
    const source = path.join(root, task.path);
    const external = Buffer.concat([readFileSync(source), Buffer.from("\nexternal edit\n")]);
    const blocker = files.withCommit([task.path], () => writeFileSync(source, external));
    const rename = expect(repo.patch("task", task.id, { title: "Renamed" }, task.version)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      details: { path: task.path, currentVersion: versionOf(external), state: "rolled_back" },
    });
    await blocker;
    await rename;
    expect(readFileSync(source)).toEqual(external);
    expect(existsSync(path.join(root, target))).toBe(false);
    await expect(repo.patch("task", task.id, { title: "Renamed" }, versionOf(external))).resolves.toMatchObject({ path: target, id: task.id });
  });

  test("只改标题大小写时提交新拼写并保留实体 ID 和正文", async () => {
    const { repo, root } = setup();
    const task = await repo.create("task", taskData("Readme"), "原正文");
    const changed = await repo.patch("task", task.id, { title: "README" }, task.version);
    expect(changed).toMatchObject({ path: `Tasks/README--${task.id}.md`, id: task.id, body: task.body });
    expect(readdirSync(path.join(root, "Tasks"))).toEqual([path.basename(changed.path)]);
    expect(repo.read("task", task.id).version).toBe(changed.version);
  });

  test("区分大小写的文件系统上，只改大小写仍保留不同目录项的占位文件", async ({ skip }) => {
    const { repo, root } = setup();
    const task = await repo.create("task", taskData("Readme"), "原正文");
    const target = `Tasks/${semanticFilename("README", task.id)}`;
    if (existsSync(path.join(root, target))) skip();
    writeFileSync(path.join(root, target), "unowned bytes", { flag: "wx" });
    await expect(repo.patch("task", task.id, { title: "README" }, task.version)).rejects.toMatchObject({ code: "NAME_CONFLICT", details: { path: target } });
    expect(readFileSync(path.join(root, target), "utf8")).toBe("unowned bytes");
    expect(repo.read("task", task.id).version).toBe(task.version);
  });
  test("坏 YAML / 缺 id / 模式不符 进入问题列表且不参与查询", async () => {
    const { repo, root } = setup();
    mkdirSync(path.join(root, "Tasks"));
    writeFileSync(path.join(root, "Tasks/bad.md"), "---\na: [1\n---\n");
    writeFileSync(path.join(root, "Tasks/noid.md"), "---\ntitle: x\n---\n");
    writeFileSync(path.join(root, "Tasks/schema.md"), "---\nhuhu: {kind: task, id: task-zzzzz1, schema: 1}\ntitle: 1\n---\n");
    expect(repo.list("task")).toEqual([]);
    expect(
      repo
        .problemList()
        .map((p) => p.code)
        .sort(),
    ).toEqual(["BAD_YAML", "INVALID_SCHEMA", "MISSING_ID"]);
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
  test("A09：schema 1 的任务文件给出明确的文件级错误，不出现在列表中，文件字节不变", async () => {
    const { repo, root } = setup();
    mkdirSync(path.join(root, "Tasks"));
    const v1 = "---\nhuhu: {kind: task, id: task-old001, schema: 1}\ntitle: 旧任务\ncompleted: false\ncreatedAt: 2026-11-10T07:15:31Z\nupdatedAt: 2026-11-10T07:15:31Z\n---\n";
    writeFileSync(path.join(root, "Tasks/旧任务--task-old001.md"), v1);
    expect(repo.list("task")).toEqual([]);
    expect(repo.problemList()).toEqual([expect.objectContaining({ code: "INVALID_SCHEMA", message: expect.stringContaining("schema 1") })]);
    expect(readFileSync(path.join(root, "Tasks/旧任务--task-old001.md"), "utf8")).toBe(v1);
  });
  test("A09：缺少 type 或 status 的任务文件是文件错误（没有默认值）", async () => {
    const { repo, root } = setup();
    mkdirSync(path.join(root, "Tasks"));
    writeFileSync(
      path.join(root, "Tasks/x--task-no-type.md"),
      "---\nhuhu: {kind: task, id: task-no-type, schema: 2}\ntitle: x\nstatus: not_started\norigin: {kind: desktop}\ncreatedAt: 2026-11-10T07:15:31Z\nupdatedAt: 2026-11-10T07:15:31Z\n---\n",
    );
    expect(repo.list("task")).toEqual([]);
    expect(repo.problemList()[0]).toMatchObject({ code: "INVALID_SCHEMA" });
  });
  test("YAML 日期自动解析为 Date 时仍通过模式", async () => {
    const { repo, root } = setup();
    mkdirSync(path.join(root, "Tasks"));
    writeFileSync(
      path.join(root, "Tasks/d--task-dat001.md"),
      "---\nhuhu: {kind: task, id: task-dat001, schema: 2}\ntitle: d\ntype: human\nstatus: not_started\norigin: {kind: desktop}\ndue: 2026-11-12\ncreatedAt: 2026-11-10T07:15:31Z\nupdatedAt: 2026-11-10T07:15:31Z\n---\n",
    );
    expect(repo.read("task", "task-dat001").data).toMatchObject({ due: "2026-11-12" });
  });

  describe("只读 Vault", () => {
    test("写入被拒绝：create / 多文件操作 / 回收站", async () => {
      const d = mkdtempSync(path.join(tmpdir(), "huhu-ro-"));
      dirs.push(d);
      const files = new VaultFiles(path.join(d), undefined, true);
      const repo = new SemanticRepository(files, new OperationLog(files, path.join(d, "ops")));
      await expect(repo.create("task", { title: "x", type: "human", status: "not_started", origin: { kind: "desktop" }, createdAt: now, updatedAt: now })).rejects.toMatchObject({ code: "READ_ONLY_VAULT" });
      await expect(new OperationLog(files, path.join(d, "ops")).run("o", "t", [])).rejects.toMatchObject({ code: "READ_ONLY_VAULT" });
    });
  });
});
