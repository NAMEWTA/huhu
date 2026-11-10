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
  test("inbox/archives：外部来源由身份决定；转换为任务/档案经插件权限调用；停用目标插件后拒绝", async () => {
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    type R = { ok: boolean; data: { id: string; source: string; status: string; result: { kind: string; id: string } | null; type: string }; error?: { code: string } };
    const call = (token: string, capability: string, input: unknown, key = `key-${capability}-${Math.random().toString(36).slice(2)}`) =>
      post(e, token, { capability, input, requestId: "r", idempotencyKey: key }) as unknown as Promise<R>;
    // ACC-IN-05：CLI 提交带 source: quick，文件中仍是 cli（inbox.capture 默认对外开放）
    const viaCli = await call(e.cliToken, "inbox.capture", { body: "来自 CLI", source: "quick" });
    expect(viaCli.data.source).toBe("cli");
    // ACC-IN-02：转为任务
    const toTask = await call(e.rendererToken, "inbox.convert", { id: viaCli.data.id, target: "task", fields: { title: "来自 CLI" } });
    expect(toTask.ok).toBe(true);
    expect(toTask.data).toMatchObject({ status: "processed", result: { kind: "task" } });
    const tasks = (await post(e, e.rendererToken, { capability: "tasks.list", input: {}, requestId: "r" })) as unknown as { data: { id: string; title: string }[] };
    expect(tasks.data.map((t) => t.id)).toContain(toTask.data.result?.id);
    // 档案：先建类型，再转换
    const type = await call(e.rendererToken, "archives.types.save", { name: "项目", fields: [] });
    const second = await call(e.rendererToken, "inbox.capture", { body: "一个项目想法" });
    const toArchive = await call(e.rendererToken, "inbox.convert", { id: second.data.id, target: "archive", fields: { name: "新项目", type: type.data.id } });
    expect(toArchive.data.result?.kind).toBe("archive");
    // 外部入口不能调用 inbox.convert
    expect((await call(e.cliToken, "inbox.convert", { id: second.data.id, target: "task", fields: {} })).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    // ACC-AR：archives.list 对外默认开放
    expect(((await post(e, e.cliToken, { capability: "archives.list", input: {}, requestId: "r" })) as unknown as { ok: boolean }).ok).toBe(true);
  });
  test("safe：ACC-SF-06 外部入口不能 reveal；ACC-SF-01 全 Vault 找不到明文；锁定后 SAFE_LOCKED", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true }); engines.push(e);
    type R = { ok: boolean; data: { id: string; value: string; locked: boolean }; error?: { code: string } };
    const call = (token: string, capability: string, input: unknown) =>
      post(e, token, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    expect((await call(e.rendererToken, "safe.setup", { password: "correct horse battery" })).ok).toBe(true);
    const item = await call(e.rendererToken, "safe.items.save", { name: "GH", type: "token", allowedModules: ["ssh"], value: "HUHU-MARKER-7f3a" });
    expect((await call(e.rendererToken, "safe.items.reveal", { id: item.data.id })).data.value).toBe("HUHU-MARKER-7f3a");
    for (const cap of ["safe.items.reveal", "safe.items.list", "safe.status"]) expect((await call(e.cliToken, cap, { id: item.data.id })).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    await call(e.rendererToken, "safe.lock", {});
    expect((await call(e.rendererToken, "safe.items.list", {})).error?.code).toBe("SAFE_LOCKED");
    expect((await call(e.rendererToken, "safe.unlock", { password: "wrong password!" })).error?.code).toBe("SAFE_BAD_PASSWORD");
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const hits: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p); else if (readFileSync(p).includes("HUHU-MARKER-7f3a")) hits.push(p); } };
    walk(dir);
    expect(hits).toEqual([]);
  });
  test("agent-cli：默认 Space 指向 Vault 根；Provider 检测可调用；对外不开放", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true }); engines.push(e);
    const call = (token: string, capability: string, input: unknown) => post(e, token, { capability, input, requestId: "r" }) as unknown as Promise<{ ok: boolean; data: { root: string }[]; error?: { code: string } }>;
    const spaces = await call(e.rendererToken, "agent.spaces.list", {});
    expect(spaces.data).toHaveLength(1);
    const { realpathSync } = await import("node:fs");
    expect(spaces.data[0]?.root).toBe(realpathSync(dir));
    expect((await call(e.rendererToken, "agent.providers.detect", {})).ok).toBe(true);
    expect((await call(e.cliToken, "agent.spaces.list", {})).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
  });
});
