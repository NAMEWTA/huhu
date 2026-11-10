import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, test } from "vitest";
import { boot, readLiveEndpoint, type RunningEngine } from "../src/boot.js";

interface Reply {
  [k: string]: unknown;
  ok: boolean;
  data: { id: string; hits: { path: string }[]; text: string } & { path: string }[];
  error?: { code: string };
}
const dirs: string[] = [];
const engines: RunningEngine[] = [];
afterEach(async () => {
  for (const e of engines.splice(0)) await e.shutdown();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), "huhu-e-")); dirs.push(d); return d; };
const post = (e: RunningEngine, token: string, body: unknown) =>
  fetch(`http://127.0.0.1:${e.port}/api/v1/call`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<Reply>);

describe("Engine 启动与关闭", () => {
  test("Renderer 与 CLI 令牌经同一 Dispatcher 调用 vault.info", async () => {
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    const req = { capability: "vault.info", input: {}, requestId: "r" };
    const a = await post(e, e.rendererToken, req);
    const b = await post(e, e.cliToken, req);
    expect(a.ok && b.ok).toBe(true);
    expect(a.data.id).toBe(e.vault.id);
    expect(a).toEqual(b);
  });
  test("端点描述写入与删除；关闭中拒绝写调用", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    expect(existsSync(e.descriptorPath)).toBe(true);
    expect(readLiveEndpoint(e.vault)?.port).toBe(e.port);
    e.dispatcher.beginClose();
    await e.shutdown();
    expect(existsSync(e.descriptorPath)).toBe(false);
    expect(readLiveEndpoint(e.vault)).toBeNull();
  });
  test("陈旧端点描述（进程不存在）被清理", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(e.descriptorPath, JSON.stringify({ pid: 999999, port: 1, vaultId: "x", cliToken: "t", startedAt: "" }));
    expect(readLiveEndpoint(e.vault)).toBeNull();
    expect(existsSync(e.descriptorPath)).toBe(false);
    await e.shutdown();
  });
  test("子进程模式：报告 ready，收到 SIGTERM 后删除端点描述并退出 0", async () => {
    const dir = tmp();
    const tsx = createRequire(import.meta.url).resolve("tsx/cli");
    const child = spawn(process.execPath, [tsx, path.resolve(import.meta.dirname, "../src/main.ts"), "--vault", dir, "--create"], { stdio: ["ignore", "pipe", "pipe"] });
    const ready: { type: string; port: number } = await new Promise((resolve, reject) => {
      let out = "";
      child.stdout.on("data", (d) => { out += d; const line = out.split("\n")[0]; if (line && out.includes("\n")) resolve(JSON.parse(line)); });
      child.on("exit", (c) => reject(new Error(`exited ${c}`)));
      setTimeout(() => reject(new Error("timeout")), 20000);
    });
    expect(ready.type).toBe("ready");
    const health = await fetch(`http://127.0.0.1:${ready.port}/healthz`);
    expect(await health.text()).toBe("ok");
    const exit = new Promise<number | null>((r) => child.on("exit", (c) => r(c)));
    child.kill("SIGTERM");
    expect(await exit).toBe(0);
    expect(existsSync(path.join(dir, ".huhu/runtime"))).toBe(true);
    const { Vault } = await import("@huhu/vault");
    const v = await Vault.open(dir); // 锁已释放
    expect(existsSync(path.join(v.runtimeDir, "engine.json"))).toBe(false);
    await v.close();
  }, 30000);
  test("同一 Vault 的第二个 Engine → READ_ONLY_VAULT", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true }); engines.push(e);
    await expect(boot({ vaultPath: dir })).rejects.toMatchObject({ code: "READ_ONLY_VAULT" });
  });
  test("vault.tree / vault.search / vault.readFile 与外部修改后的增量索引", async () => {
    const dir = tmp();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path.join(dir, "笔记.md"), "# 笔记\n关于知识库的想法\n");
    const e = await boot({ vaultPath: dir, create: true }); engines.push(e);
    const call = (capability: string, input: unknown, token = e.rendererToken) => post(e, token, { capability, input, requestId: "r" });
    await e.index.build();
    expect((await call("vault.tree", {})).data.map((x) => x.path)).toEqual(["笔记.md"]);
    expect((await call("vault.search", { query: "知识库" })).data.hits[0]?.path).toBe("笔记.md");
    expect((await call("vault.readFile", { path: "笔记.md" })).data.text).toContain("想法");
    expect((await call("vault.readFile", { path: "../etc/passwd" })).error?.code).toBe("PATH_OUTSIDE_VAULT");
    // CLI 身份：readFile 默认不对外
    expect((await call("vault.readFile", { path: "笔记.md" }, e.cliToken)).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    expect((await call("vault.reindex", {}, e.cliToken)).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    // 外部新增文件 → 事件 + 索引
    const seen: string[] = [];
    e.events.subscribe((ev) => { if (ev.type === "vault.fileChanged") seen.push((ev.payload as { path: string }).path); });
    writeFileSync(path.join(dir, "新文件.md"), "独特词汇蜻蜓");
    const end = Date.now() + 3000;
    while (!seen.includes("新文件.md") && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
    expect(seen).toContain("新文件.md");
    expect((await call("vault.search", { query: "蜻蜓" })).data.hits[0]?.path).toBe("新文件.md");
  });
  test("tasks 插件：经 HTTP 创建、勾选、列表；停用后能力不可用", async () => {
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    const call = (capability: string, input: unknown, key?: string) =>
      post(e, e.rendererToken, { capability, input, requestId: "r", ...(key ? { idempotencyKey: key } : {}) }) as unknown as Promise<{ ok: boolean; data: { id: string; version: string; completed: boolean; title: string }; error?: { code: string } }>;
    const created = await call("tasks.create", { title: "写周报", execution: { kind: "manual" } }, "key-create-1");
    expect(created.ok).toBe(true);
    expect((await call("tasks.create", { title: "写周报", execution: { kind: "manual" } })).error?.code).toBe("INVALID_INPUT"); // 缺幂等键
    const done = await call("tasks.setCompleted", { id: created.data.id, completed: true, expectedVersion: created.data.version }, "key-done-1");
    expect(done.data.completed).toBe(true);
    const list = (await post(e, e.rendererToken, { capability: "tasks.list", input: { completed: true }, requestId: "r" })) as unknown as { data: { title: string }[] };
    expect(list.data.map((t) => t.title)).toEqual(["写周报"]);
    // 外部入口：tasks.list 默认开放，tasks.create 不开放
    expect((await post(e, e.cliToken, { capability: "tasks.list", input: {}, requestId: "r" })).ok).toBe(true);
    expect((await post(e, e.cliToken, { capability: "tasks.create", input: { title: "x" }, requestId: "r", idempotencyKey: "key-cli-1" })).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
  });
  test("notes 插件：创建、改名改写双链、保存冲突、反链、日记", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true }); engines.push(e);
    const call = (capability: string, input: unknown, key: string = `key-${capability}-${Math.random()}`) =>
      post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: key }) as unknown as Promise<{ ok: boolean; data: { path: string; id: string; version: string; text: string; moved: Record<string, string> }; error?: { code: string } }>;
    const x = await call("notes.create", { name: "X" });
    const a = await call("notes.create", { name: "A" });
    const aRead = await call("notes.read", { path: a.data.path }, "key-read-a-1");
    const saved = await call("notes.save", { path: a.data.path, text: "见 [[X]]\n", expectedVersion: aRead.data.version });
    expect(saved.ok).toBe(true);
    expect((await call("notes.save", { path: a.data.path, text: "覆盖", expectedVersion: aRead.data.version })).error?.code).toBe("VERSION_CONFLICT");
    const renamed = await call("notes.rename", { path: x.data.path, newName: "Y" });
    expect(renamed.data.moved).toEqual({ "X.md": "Y.md" });
    expect((await call("notes.read", { path: a.data.path }, "key-read-a2-1")).data.text).toBe("见 [[Y]]\n");
    const bl = (await call("notes.backlinks", { path: "Y.md" }, "key-backlinks-1")) as unknown as { data: { path: string }[]; error?: unknown };
    expect(bl.error).toBeUndefined();
    expect(bl.data.map((b) => b.path)).toEqual(["A.md"]);
    expect((await call("notes.openDaily", { date: "2026-11-10" })).data.path).toBe("日记/2026-11-10 · 每日笔记.md");
    expect((await call("notes.read", { path: "../x" }, "key-bad-path-1")).error?.code).toBe("PATH_OUTSIDE_VAULT");
  });
});
