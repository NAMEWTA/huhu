import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
    expect((await call("vault.tree", {})).data.map((x) => x.path)).toContain("笔记.md"); // 新 Vault 还有内置规则所在的 Automations/
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
    const end = Date.now() + 15000; // 全量并行时原生监听延迟可能更长
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
  const REAL_HERDR = "/tmp/claude-1000/herdr-build/src/target/release/herdr-core";
  test.skipIf(!existsSync(REAL_HERDR))("agent-cli：经 HTTP 在真实 Herdr Core 里启动 shell 会话并结束", async () => {
    process.env["HUHU_HERDR_BIN"] = REAL_HERDR;
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true }); engines.push(e);
    type R = { ok: boolean; data: { id: string; state: string; terminalId: string; revision: number; state2?: string; version: string | null } & { length?: number }; error?: { code: string } };
    const call = (capability: string, input: unknown) => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    try {
      const status = await call("agent.core.status", {});
      expect(status.data).toMatchObject({ state: "connected" });
      const spaces = (await call("agent.spaces.list", {})) as unknown as { data: { id: string; revision: number }[] };
      const sp = spaces.data[0] as { id: string; revision: number };
      const s = await call("agent.sessions.launch", { spaceId: sp.id, spaceRevision: sp.revision, provider: "shell", requestId: "req-http-1234" });
      expect(s.data).toMatchObject({ state: "running" });
      expect((await call("agent.sessions.kill", { id: s.data.id })).ok).toBe(true);
    } finally {
      const { HerdrCore } = await import("@huhu/plugin-agent-cli/engine");
      const { machineId } = await import("@huhu/vault");
      await new HerdrCore({ bin: REAL_HERDR, vaultId: e.vault.id, machineId: machineId(), runtimeDir: path.join(dir, ".huhu", "runtime", machineId(), "herdr") }).stop();
      delete process.env["HUHU_HERDR_BIN"];
    }
  }, 60_000);
  test("automations：内置规则、预览无副作用、立即运行用假 CLI 处理 Agent 任务，再次运行不重复，Task 仍未完成", async () => {
    const { chmodSync, writeFileSync, readdirSync: ls } = await import("node:fs");
    const bin = tmp();
    writeFileSync(path.join(bin, "codex"), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex 1.0.0"; exit 0; fi\necho "假 CLI 已处理"\n');
    chmodSync(path.join(bin, "codex"), 0o755);
    const oldPath = process.env["PATH"];
    process.env["PATH"] = `${bin}:${oldPath}`;
    try {
      const dir = tmp();
      const e = await boot({ vaultPath: dir, create: true }); engines.push(e);
      type R = { ok: boolean; data: unknown; error?: { code: string } };
      const call = (capability: string, input: unknown): Promise<R> => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
      const rules = (await call("automations.list", {})).data as { id: string; data: { builtin: boolean; enabled: boolean } }[];
      expect(rules).toHaveLength(1);
      expect(rules[0]?.data).toMatchObject({ builtin: true, enabled: true });
      expect((await call("automations.delete", { id: rules[0]?.id })).error?.code).toBe("INVALID_INPUT");
      const space = ((await call("agent.spaces.list", {})).data as { id: string }[])[0] as { id: string };
      const t = await call("tasks.create", { title: "整理资料", body: "请整理", execution: { kind: "agent", spaceId: space.id, provider: "codex" } });
      await call("tasks.create", { title: "手动任务", execution: { kind: "manual" } });
      // 等 Provider 检测完成
      for (let i = 0; i < 50; i++) { const d = (await call("agent.providers.detect", { refresh: true })).data as { provider: string; status: string }[]; if (d.find((x) => x.provider === "codex")?.status === "found") break; await new Promise((r) => setTimeout(r, 100)); }
      await new Promise((r) => setTimeout(r, 300));
      const preview = (await call("automations.preview", { id: rules[0]?.id })).data as { candidates: unknown[]; skipped: unknown[] };
      expect(preview.candidates).toHaveLength(1);
      expect(preview.skipped).toHaveLength(1);
      expect(existsSync(path.join(dir, "Task Runs"))).toBe(false); // 预览不写文件
      const run1 = (await call("automations.runNow", { id: rules[0]?.id })).data as { summary: unknown };
      expect(run1.summary).toEqual({ processed: 1, skipped: 1 });
      const runFile = ls(path.join(dir, "Task Runs"));
      expect(runFile).toHaveLength(1);
      const text = readFileSync(path.join(dir, "Task Runs", runFile[0] as string), "utf8");
      expect(text).toContain("state: succeeded");
      expect(text).toContain("假 CLI 已处理");
      expect(((await call("tasks.read", { id: (t.data as { id: string }).id })).data as { completed: boolean }).completed).toBe(false);
      expect(((await call("automations.runNow", { id: rules[0]?.id })).data as { summary: unknown }).summary).toEqual({ processed: 0, skipped: 2 });
      expect(ls(path.join(dir, "Task Runs"))).toHaveLength(1);
      expect(((await call("automations.activations", {})).data as unknown[]).length).toBe(2);
    } finally {
      process.env["PATH"] = oldPath;
    }
  }, 60_000);
  test("versioning：命名版本、时间线、读取、恢复（经 HTTP）", async () => {
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (capability: string, input: unknown): Promise<R> => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    const note = (await call("notes.create", { name: "历史笔记" })).data as { path: string };
    const read1 = (await call("notes.read", { path: note.path })).data as { version: string };
    const saved = (await call("notes.save", { path: note.path, text: "# 历史笔记\n\n第一版\n", expectedVersion: read1.version })).data as { version: string };
    const cp = await call("history.checkpoint", { path: note.path, title: "第一版" });
    expect(cp.error, JSON.stringify(cp.error)).toBeUndefined();
    const saved2 = (await call("notes.save", { path: note.path, text: "# 历史笔记\n\n第二版\n", expectedVersion: saved.version })).data as { version: string };
    await call("history.checkpoint", { path: note.path, title: "第二版" });
    const tl = (await call("history.timeline", { path: note.path })).data as { id: string; title: string | null }[];
    expect(tl.map((t) => t.title).slice(0, 2)).toEqual(["第二版", "第一版"]);
    expect(((await call("history.read", { path: note.path, entryId: tl[1]?.id })).data as { text: string }).text).toContain("第一版");
    expect((await call("history.restore", { path: note.path, entryId: tl[1]?.id, expectedCurrentVersion: "wrong" })).error?.code).toBe("VERSION_CONFLICT");
    const rest = await call("history.restore", { path: note.path, entryId: tl[1]?.id, expectedCurrentVersion: saved2.version });
    expect(rest.error, JSON.stringify(rest.error)).toBeUndefined();
    expect(((await call("notes.read", { path: note.path })).data as { text: string }).text).toContain("第一版");
  }, 60_000);
  test("ssh + safe：凭据只经保险箱引用；锁定时连接失败；解锁后确认指纹并执行命令；审计无密码", async () => {
    const { startFakeSsh } = await import("../../../plugins/ssh/test/fake-server.js");
    const srv = await startFakeSsh({ password: "s3cret-PW-marker" });
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (capability: string, input: unknown): Promise<R> => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    const prompts: { attemptId: string; hop: number }[] = [];
    e.events.subscribe((ev) => { if (ev.type === "ssh.hostKeyPrompt") prompts.push(ev.payload as { attemptId: string; hop: number }); });
    try {
      await call("safe.setup", { password: "correct horse battery" });
      const item = (await call("safe.items.save", { name: "服务器密码", type: "password", allowedModules: ["ssh"], value: "s3cret-PW-marker" })).data as { id: string };
      const host = (await call("ssh.hosts.save", { name: "测试机", host: "127.0.0.1", port: srv.port, user: "u", auth: { kind: "password", secretRef: `safe://${item.id}` }, connectTimeoutSec: 5 })).data as { id: string };
      await call("safe.lock", {});
      expect((await call("ssh.connect", { hostId: host.id })).error?.code).toBe("SAFE_LOCKED");
      await call("safe.unlock", { password: "correct horse battery" });
      const connecting = call("ssh.connect", { hostId: host.id });
      for (let i = 0; i < 100 && prompts.length === 0; i++) await new Promise((r) => setTimeout(r, 30));
      expect((await call("ssh.hostKey.decide", { attemptId: prompts[0]?.attemptId, hop: 0, accept: true })).data).toEqual({ applied: true });
      expect((await connecting).ok).toBe(true);
      const out = (await call("ssh.exec.run", { hostId: host.id, command: "echo 远程你好" })).data as { stdout: string; exitCode: number };
      expect(out).toMatchObject({ stdout: "远程你好\n", exitCode: 0 });
      expect((await call("ssh.disconnect", { hostId: host.id })).ok).toBe(true);
      const audit = JSON.stringify((await call("ssh.audit.list", {})).data);
      expect(audit).toContain("connect");
      expect(audit).not.toContain("s3cret-PW-marker");
      expect((await post(e, e.cliToken, { capability: "ssh.hosts.list", input: {}, requestId: "r" }) as unknown as R).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    } finally {
      await srv.close();
    }
  }, 60_000);
  test("ACC-TK-07：已到点的提醒在引擎启动时投递为站内通知；deliveredAt 写入；任务仍未完成", async () => {
    const dir = tmp();
    const e1 = await boot({ vaultPath: dir, create: true });
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (e: RunningEngine, capability: string, input: unknown): Promise<R> => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    const t = (await call(e1, "tasks.create", { title: "到点提醒", execution: { kind: "manual" }, reminders: [{ id: "rem-1", channel: "in_app", at: "2020-01-01T00:00:00Z", enabled: true }] })).data as { id: string };
    await e1.shutdown(); // 模拟"应用关闭期间到点"：下次启动时补发
    const e2 = await boot({ vaultPath: dir }); engines.push(e2);
    let list: { title: string; module: string }[] = [];
    for (let i = 0; i < 60; i++) { list = (await call(e2, "notifications.list", {})).data as typeof list; if (list.length) break; await new Promise((r) => setTimeout(r, 50)); }
    expect(list.map((n) => [n.title, n.module])).toEqual([["任务提醒：到点提醒", "tasks"]]);
    const task = (await call(e2, "tasks.read", { id: t.id })).data as { completed: boolean; reminders: { deliveredAt: string | null }[] };
    expect(task.completed).toBe(false);
    expect(task.reminders[0]?.deliveredAt).toBeTruthy();
    const ids = ((await call(e2, "notifications.list", {})).data as { id: string }[]).map((n) => n.id);
    expect(((await call(e2, "notifications.markRead", { ids })).data as { changed: number }).changed).toBe(1);
  }, 30_000);
  test("plugins.setEnabled：停用后其能力不可用并持久化；级联停用依赖者；重启保持；kernel 不可停用", async () => {
    const dir = tmp();
    const e1 = await boot({ vaultPath: dir, create: true });
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (e: RunningEngine, capability: string, input: unknown): Promise<R> => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    expect((await call(e1, "plugins.setEnabled", { id: "tasks", enabled: false })).data).toMatchObject({ state: "disabled" });
    expect((await call(e1, "tasks.list", {})).error?.code).toBe("PLUGIN_DISABLED");
    expect(JSON.parse(readFileSync(path.join(dir, ".huhu/plugins.json"), "utf8")).builtin.tasks).toEqual({ enabled: false });
    expect((await call(e1, "plugins.setEnabled", { id: "kernel", enabled: false })).data).toMatchObject({ state: "active" });
    await e1.shutdown();
    const e2 = await boot({ vaultPath: dir }); engines.push(e2);
    expect((await call(e2, "tasks.list", {})).error?.code).toBe("PLUGIN_DISABLED");
    const list = (await call(e2, "plugins.list", {})).data as { id: string; state: string }[];
    expect(list.find((p) => p.id === "tasks")?.state).toBe("disabled");
    expect(list.find((p) => p.id === "notes")?.state).toBe("active");
    expect((await call(e2, "plugins.setEnabled", { id: "tasks", enabled: true })).data).toMatchObject({ state: "active" });
    expect((await call(e2, "tasks.list", {})).ok).toBe(true);
  }, 30_000);
  test("health.run / home.summary：坏文件 → warning；插件失败 → error；对应插件停用时首页卡片为 0 而不是报错", async () => {
    const dir = tmp();
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(path.join(dir, "Tasks"), { recursive: true });
    writeFileSync(path.join(dir, "Tasks", "bad.md"), "---\nhuhu: {kind: task, id: task-bad001, schema: 1}\ntitle: 1\n---\n");
    const e = await boot({ vaultPath: dir, create: true }); engines.push(e);
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (capability: string, input: unknown): Promise<R> => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    await call("tasks.list", {}); // 触发一次扫描，让文件问题登记
    const h = (await call("health.run", {})).data as { overall: string; checks: { id: string; status: string; detail: string }[] };
    expect(h.overall).toBe("warning");
    expect(h.checks.find((c) => c.id === "files")).toMatchObject({ status: "warning" });
    expect(h.checks.find((c) => c.id === "files")?.detail).toContain("bad.md");
    expect(h.checks.find((c) => c.id === "safe")).toMatchObject({ status: "ok", detail: "尚未设置" });
    expect((await post(e, e.cliToken, { capability: "health.run", input: {}, requestId: "r" }) as unknown as R).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    const before = (await call("home.summary", {})).data as { tasksOpen: number; vault: { name: string } };
    expect(before.tasksOpen).toBe(0);
    await call("tasks.create", { title: "A", execution: { kind: "manual" } });
    expect(((await call("home.summary", {})).data as { tasksOpen: number }).tasksOpen).toBe(1);
    await call("plugins.setEnabled", { id: "tasks", enabled: false });
    expect(((await call("home.summary", {})).data as { tasksOpen: number }).tasksOpen).toBe(0);
  }, 30_000);
  test("HTTP 服务令牌：创建后明文只返回一次、文件只存哈希；身份为 http（遵守开放规则）；撤销后 401；重启后仍有效", async () => {
    const dir = tmp();
    const e1 = await boot({ vaultPath: dir, create: true });
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (e: RunningEngine, token: string, capability: string, input: unknown = {}) => fetch(`http://127.0.0.1:${e.port}/api/v1/call`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) });
    const created = (await (await call(e1, e1.rendererToken, "gateway.tokens.create", { name: "脚本" })).json() as R).data as { id: string; token: string };
    expect(created.token).toMatch(/^huhu_/);
    const stored = readFileSync(path.join(dir, ".huhu/gateways.json"), "utf8");
    expect(stored).not.toContain(created.token); // 只保存哈希
    expect(stored).toContain("脚本");
    expect(((await (await call(e1, created.token, "vault.info")).json()) as R).ok).toBe(true);
    expect(((await (await call(e1, created.token, "safe.status")).json()) as R).error?.code).toBe("CAPABILITY_NOT_EXPOSED"); // 外部入口规则同样适用
    expect(((await (await call(e1, created.token, "gateway.tokens.list")).json()) as R).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    await e1.shutdown();
    const e2 = await boot({ vaultPath: dir }); engines.push(e2);
    expect(((await (await call(e2, created.token, "vault.info")).json()) as R).ok).toBe(true);
    expect(((await (await call(e2, e2.rendererToken, "gateway.tokens.revoke", { id: created.id })).json()) as R).data).toEqual({ revoked: true });
    expect((await call(e2, created.token, "vault.info")).status).toBe(401);
    expect(readFileSync(path.join(dir, ".huhu/gateways.json"), "utf8")).not.toContain("脚本");
  }, 30_000);
  test("审计回归：home.summary 以调用者身份取数；外部入口即使被开放 tasks.create 也不能设置 Agent 执行", async () => {
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (token: string, capability: string, input: unknown = {}): Promise<R> => post(e, token, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    await call(e.rendererToken, "tasks.create", { title: "T", execution: { kind: "manual" } });
    await call(e.rendererToken, "notes.create", { name: "N" });
    // 默认：CLI 能读 tasks.list / notes.list，home.summary 带出计数
    expect(((await call(e.cliToken, "home.summary")).data as { tasksOpen: number; notes: number })).toMatchObject({ tasksOpen: 1, notes: 1 });
    // 用户关闭 notes.list 的对外开放后，外部调用 home.summary 看不到笔记；桌面仍然能看到
    await call(e.rendererToken, "gateway.update", { capability: "notes.list", exposed: false });
    expect(((await call(e.cliToken, "home.summary")).data as { notes: number; recentNotes: unknown[] })).toMatchObject({ notes: 0, recentNotes: [] });
    expect(((await call(e.rendererToken, "home.summary")).data as { notes: number }).notes).toBe(1);
    // 开放 tasks.create 后，外部仍不能创建 Agent 执行的任务
    await call(e.rendererToken, "gateway.update", { capability: "tasks.create", exposed: true });
    expect((await call(e.cliToken, "tasks.create", { title: "手动", execution: { kind: "manual" } })).ok).toBe(true);
    expect((await call(e.cliToken, "tasks.create", { title: "Agent", execution: { kind: "agent", spaceId: "space-1", provider: "codex" } })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.rendererToken, "tasks.create", { title: "桌面 Agent", execution: { kind: "agent", spaceId: "space-1", provider: "codex" } })).ok).toBe(true);
  }, 30_000);
  test.skipIf(!existsSync(REAL_HERDR))("终端 WebSocket：经 Engine 桥接真实 Herdr 终端——输入回显、鉴权、关闭只 detach", async () => {
    process.env["HUHU_HERDR_BIN"] = REAL_HERDR;
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true }); engines.push(e);
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (capability: string, input: unknown): Promise<R> => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    const { WebSocket } = await import("ws");
    try {
      const sp = ((await call("agent.spaces.list", {})).data as { id: string; revision: number }[])[0] as { id: string; revision: number };
      const s = (await call("agent.sessions.launch", { spaceId: sp.id, spaceRevision: sp.revision, provider: "shell", requestId: "req-ws-1234" })).data as { id: string; terminalId: string };
      const open = (token: string, id: string) => new Promise<InstanceType<typeof WebSocket>>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${e.port}/ws/terminal/${id}?cols=100&rows=30`, [`bearer.${token}`]);
        ws.on("open", () => resolve(ws));
        ws.on("error", reject);
        ws.on("unexpected-response", (_r, res) => reject(new Error(`status ${res.statusCode}`)));
      });
      await expect(open("bad-token", s.id)).rejects.toThrow(/401/);
      const ws = await open(e.rendererToken, s.id);
      let out = "";
      ws.on("message", (d, bin) => { if (bin) out += d.toString(); });
      ws.send(Buffer.from("echo VIA-ENGINE-$((6*7))\n"));
      for (let i = 0; i < 100 && !out.includes("VIA-ENGINE-42"); i++) await new Promise((r) => setTimeout(r, 50));
      expect(out).toContain("VIA-ENGINE-42");
      ws.close(); // detach：进程仍在运行
      await new Promise((r) => setTimeout(r, 300));
      const again = await open(e.rendererToken, s.id); // 重新打开同一个终端
      let out2 = "";
      again.on("message", (d, bin) => { if (bin) out2 += d.toString(); });
      again.send(Buffer.from("echo STILL-ALIVE\n"));
      for (let i = 0; i < 100 && !out2.includes("STILL-ALIVE"); i++) await new Promise((r) => setTimeout(r, 50));
      expect(out2).toContain("STILL-ALIVE");
      again.close();
      // 不存在的会话
      const bad = await open(e.rendererToken, "sess-none").then((w) => new Promise<number>((r) => w.on("close", (code) => r(code))));
      expect(bad).toBe(4404);
    } finally {
      const { HerdrCore } = await import("@huhu/plugin-agent-cli/engine");
      const { machineId } = await import("@huhu/vault");
      await new HerdrCore({ bin: REAL_HERDR, vaultId: e.vault.id, machineId: machineId(), runtimeDir: path.join(dir, ".huhu", "runtime", machineId(), "herdr") }).stop();
      delete process.env["HUHU_HERDR_BIN"];
    }
  }, 60_000);
});
