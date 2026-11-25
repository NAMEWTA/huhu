import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OperationLog, SemanticRepository, Trash, VaultFiles } from "@huhu/vault";
import { afterEach, describe, expect, test, vi } from "vitest";
import { InboxService, sourceFor, type ConvertTarget } from "../src/engine/service.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function setup(opts: { disabled?: ConvertTarget[]; failBeforeCreate?: boolean; loseCreateReply?: boolean } = {}) {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-i-"));
  dirs.push(d);
  const root = path.join(d, "v");
  mkdirSync(path.join(root, ".huhu"), { recursive: true });
  const files = new VaultFiles(root);
  const repo = new SemanticRepository(files, new OperationLog(files, path.join(d, "ops")));
  const created = new Map<string, { id: string }>();
  const transportCache = new Set<string>();
  let createCalls = 0;
  const service = () => new InboxService({
    repo,
    trash: new Trash(files),
    publish: () => undefined,
    now: () => new Date("2026-11-10T12:00:00Z"),
    isTargetEnabled: (k) => !(opts.disabled ?? []).includes(k),
    createTarget: async (kind, _fields, key) => {
      createCalls++;
      if (opts.failBeforeCreate) throw new Error("目标调用在写入前中断");
      if (transportCache.has(key)) return;
      created.set(key, { id: `${kind}-new${createCalls}` });
      transportCache.add(key);
      if (opts.loseCreateReply) throw new Error("目标已落盘但没有回执");
    },
    readTarget: (_kind, key) => created.get(key)?.id ?? null,
  });
  return { svc: service(), service, repo, root, created, transportCache, calls: () => createCalls };
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
  test("转换落盘后回填中断，重启和缓存失效后核实原任务", async () => {
    const { svc, service, repo, created, transportCache, calls } = setup();
    const capture = await svc.capture({ body: "继续原转换" });
    const patch = repo.patch.bind(repo);
    const failure = vi.spyOn(repo, "patch").mockImplementation((...args) => {
      if (args[0] === "capture" && args[2].status === "processed") return Promise.reject(new Error("中断"));
      return patch(...args);
    });
    await expect(svc.convert(capture.id, "task", { title: "继续原转换" })).rejects.toMatchObject({ details: { outcome: "unknown" } });
    const original = [...created.values()][0]!;
    failure.mockRestore();
    transportCache.clear(); // 普通调用缓存已经过期，目标文件仍在。
    const restored = await service().convert(capture.id, "task", { title: "继续原转换" });
    expect(restored.result).toEqual({ kind: "task", id: original.id });
    expect(calls()).toBe(1);
  });
  test("ACC-IN-02 转为任务：processed + result；不可重复处理", async () => {
    const { svc } = setup();
    const c = await svc.capture({ body: "写周报", source: "quick" });
    const done = await svc.convert(c.id, "task", { title: "写周报" });
    expect(done).toMatchObject({ status: "processed", result: { kind: "task" } });
    expect(done.processedAt).toBe("2026-11-10T12:00:00Z");
    await expect(svc.convert(c.id, "task", {})).rejects.toMatchObject({ details: { outcome: "unknown" } });
  });
  test.each(["task", "archive", "note"] as const)("目标 %s 回执丢失后依靠创建凭据结算，同一来源重交只返回原结果", async (kind) => {
    const { svc, service, created, calls } = setup({ loseCreateReply: true });
    const capture = await svc.capture({ body: "原始正文" });
    const fields = { name: "目的", title: "目的", type: "测试类型" };
    const converted = await svc.convert(capture.id, kind, fields, { expectedVersion: capture.version });
    const replay = await service().convert(capture.id, kind, fields, { expectedVersion: capture.version });
    expect(replay).toEqual(converted);
    expect(created.size).toBe(1);
    expect(calls()).toBe(1);

    await svc.dismiss(capture.id);
    expect(await service().restore(capture.id)).toMatchObject({ status: "processed", result: converted.result });
  });
  test("目标写入前中断或缺少目标凭据保持待核实，改参数和重启都不会新建", async () => {
    const { svc, service, created, calls } = setup({ failBeforeCreate: true });
    const capture = await svc.capture({ body: "原始正文" });
    const input = { title: "原目标" };
    const unknown = { details: { outcome: "unknown", target: "task" } };
    await expect(svc.convert(capture.id, "task", input)).rejects.toMatchObject(unknown);
    const pending = service().read(capture.id);
    expect(pending).toMatchObject({ status: "pending", pendingConversion: "task" });
    await expect(service().convert(capture.id, "task", {}, { resume: true })).rejects.toMatchObject(unknown);
    await expect(service().convert(capture.id, "note", { name: "不同目标" })).rejects.toMatchObject(unknown);
    await svc.update(capture.id, pending.version, { body: "新的捕获内容" });
    await expect(service().convert(capture.id, "task", input)).rejects.toMatchObject(unknown);
    expect(calls()).toBe(1);
    expect(created.size).toBe(0);
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
  test("撤销处理后再次转换会创建新对象，而不是复用旧结果", async () => {
    const { svc, created } = setup();
    const c = await svc.capture({ body: "x", source: "quick" });
    const first = await svc.convert(c.id, "task", { title: "x" });
    await svc.undo(c.id);
    const second = await svc.convert(c.id, "task", { title: "x" });
    expect(second.result?.id).not.toBe(first.result?.id);
    expect(created.size).toBe(2);
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
    await svc.delete(c.id);
    expect(readdirSync(path.join(root, "Inbox"))).toEqual([]);
    expect(readdirSync(path.join(root, ".huhu/trash"))).toHaveLength(1);
  });
});
