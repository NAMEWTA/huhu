import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OperationLog, SemanticRepository, Trash, VaultFiles } from "@huhu/vault";
import { afterEach, describe, expect, test } from "vitest";
import { InboxService, sourceFor, type ConvertTarget } from "../src/engine/service.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
function setup(opts: { disabled?: ConvertTarget[]; failAfterCreate?: boolean } = {}) {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-i-")); dirs.push(d);
  const root = path.join(d, "v"); mkdirSync(path.join(root, ".huhu"), { recursive: true });
  const files = new VaultFiles(root);
  const created = new Map<string, { id: string }>(); // 以幂等键模拟目标插件的幂等行为
  let createCalls = 0;
  const svc = new InboxService({
    repo: new SemanticRepository(files, new OperationLog(files, path.join(d, "ops"))), trash: new Trash(files), publish: () => undefined, now: () => new Date("2026-11-10T12:00:00Z"),
    isTargetEnabled: (k) => !(opts.disabled ?? []).includes(k),
    createTarget: async (kind, _fields, key) => {
      createCalls++;
      const hit = created.get(key);
      if (hit) return hit;
      const r = { id: `${kind}-new${created.size}` };
      created.set(key, r);
      return r;
    },
  });
  return { svc, root, created, calls: () => createCalls };
}

describe("来源（ACC-IN-05）", () => {
  test("由调用者身份决定；输入里的来源只对桌面调用生效", () => {
    expect(sourceFor("mcp", "quick")).toBe("mcp");
    expect(sourceFor("cli", "import")).toBe("cli");
    expect(sourceFor("http")).toBe("http");
    expect(sourceFor("plugin:clipper", "quick")).toBe("plugin:clipper");
    expect(sourceFor("desktop", "note-excerpt")).toBe("note-excerpt");
    expect(sourceFor("desktop", "mcp")).toBe("quick");
    expect(sourceFor("desktop")).toBe("quick");
  });
});

describe("捕获", () => {
  test("ACC-IN-01 写入 Inbox/，标题缺省取首行前 40 字，空内容拒绝", async () => {
    const { svc, root } = setup();
    const c = await svc.capture({ body: "让 MCP 能力和插件状态保持一致\n第二行", source: "quick" });
    expect(c).toMatchObject({ status: "pending", source: "quick", title: "让 MCP 能力和插件状态保持一致" });
    expect(readdirSync(path.join(root, "Inbox"))).toHaveLength(1);
    const long = await svc.capture({ body: "一".repeat(60), source: "quick" });
    expect([...long.title]).toHaveLength(40);
    await expect(svc.capture({ body: "  ", source: "quick" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  test("筛选：状态/来源/搜索", async () => {
    const { svc } = setup();
    const a = await svc.capture({ body: "苹果", source: "quick" });
    await svc.capture({ body: "香蕉", source: "plugin:clipper" });
    await svc.dismiss(a.id);
    expect(svc.list({ status: "dismissed" }).map((c) => c.id)).toEqual([a.id]);
    expect(svc.list({ source: "plugin" })).toHaveLength(1);
    expect(svc.list({ query: "香" })).toHaveLength(1);
  });
});

describe("转换", () => {
  test("ACC-IN-02 转为任务：processed + result；不可重复处理", async () => {
    const { svc } = setup();
    const c = await svc.capture({ body: "写周报", source: "quick" });
    const done = await svc.convert(c.id, "task", { title: "写周报" });
    expect(done).toMatchObject({ status: "processed", result: { kind: "task" } });
    expect(done.processedAt).toBe("2026-11-10T12:00:00Z");
    await expect(svc.convert(c.id, "task", {})).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  test("ACC-IN-03 创建目标后、更新捕获前崩溃：重试用同一幂等键，不会产生第二个任务", async () => {
    const { svc, created, calls } = setup();
    const c = await svc.capture({ body: "x", source: "quick" });
    // 模拟崩溃：目标已创建（幂等记录已存在），但捕获仍是 pending
    created.set(`inbox-convert-${c.id}`, { id: "task-orphan1" });
    expect(svc.read(c.id).status).toBe("pending");
    const done = await svc.convert(c.id, "task", { title: "x" });
    expect(done.result).toEqual({ kind: "task", id: "task-orphan1" });
    expect(created.size).toBe(1);
    expect(calls()).toBe(1);
  });
  test("ACC-IN-04 撤销处理：回到待处理、清空 result，不删除生成内容", async () => {
    const { svc, created } = setup();
    const c = await svc.capture({ body: "x", source: "quick" });
    await svc.convert(c.id, "note", { name: "x" });
    const undone = await svc.undo(c.id);
    expect(undone).toMatchObject({ status: "pending", result: null, processedAt: null });
    expect(created.size).toBe(1); // 生成的内容仍在
    await expect(svc.undo(c.id)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  test("ACC-IN-06 目标插件停用：拒绝转换并提示启用", async () => {
    const { svc, calls } = setup({ disabled: ["archive"] });
    const c = await svc.capture({ body: "x", source: "quick" });
    await expect(svc.convert(c.id, "archive", {})).rejects.toThrowError(/插件中心/);
    expect(calls()).toBe(0);
    expect(svc.read(c.id).status).toBe("pending");
  });
  test("删除只移走原始记录", async () => {
    const { svc, root } = setup();
    const c = await svc.capture({ body: "x", source: "quick" });
    svc.delete(c.id);
    expect(readdirSync(path.join(root, "Inbox"))).toEqual([]);
    expect(readdirSync(path.join(root, ".huhu/trash"))).toHaveLength(1);
  });
});
