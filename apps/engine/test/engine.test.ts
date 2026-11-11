import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  const REAL_HERDR = process.env["HUHU_HERDR_BIN"] ?? path.resolve(import.meta.dirname, "../../..", "apps/desktop/resources/herdr", `${process.platform}-${process.arch}`, process.platform === "win32" ? "herdr-core.exe" : "herdr-core")
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
  test.skipIf(!existsSync(REAL_HERDR))("ACC-AG-10：变更审查——真实 Git 仓库的差异、审查意见经真实 Herdr Core 写进会话终端并标记已发送", async () => {
    process.env["HUHU_HERDR_BIN"] = REAL_HERDR;
    const { execFileSync } = await import("node:child_process");
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true }); engines.push(e);
    type R = { ok: boolean; data: any; error?: { code: string } }; // eslint-disable-line
    const call = (capability: string, input: unknown) => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    const { HerdrCore } = await import("@huhu/plugin-agent-cli/engine");
    const { machineId } = await import("@huhu/vault");
    const core = new HerdrCore({ bin: REAL_HERDR, vaultId: e.vault.id, machineId: machineId(), runtimeDir: path.join(dir, ".huhu", "runtime", machineId(), "herdr") });
    try {
      const sp = (await call("agent.spaces.list", {})).data[0] as { id: string; revision: number };
      expect((await call("agent.review.diff", { spaceId: sp.id })).data).toMatchObject({ isRepo: false, files: [] }); // 还不是仓库
      execFileSync("git", ["-C", dir, "init", "-q", "-b", "main"]);
      writeFileSync(path.join(dir, "审查笔记.md"), "第一行\n第二行\n");
      const diff = (await call("agent.review.diff", { spaceId: sp.id })).data;
      expect(diff.isRepo).toBe(true);
      expect(diff.files.find((f: { path: string }) => f.path === "审查笔记.md")).toMatchObject({ status: "untracked", additions: 2 });

      const s = (await call("agent.sessions.launch", { spaceId: sp.id, spaceRevision: sp.revision, provider: "shell", requestId: "req-review-1" })).data as { id: string; terminalId: string };
      expect((await call("agent.review.comment.add", { sessionId: s.id, path: "审查笔记.md", side: "new", line: 2, text: "REVIEWMARK 第二行需要补充来源" })).ok).toBe(true);
      const sent = await call("agent.review.send", { sessionId: s.id });
      expect(sent.data.sent).toBe(1);
      expect((await call("agent.review.comments", { sessionId: s.id })).data[0].sentAt).not.toBeNull();
      const client = await core.ensure();
      let seen = "";
      for (let i = 0; i < 40 && !seen.includes("REVIEWMARK"); i++) {
        seen = JSON.stringify(await client.call("terminal.read", { terminal: s.terminalId, lines: 50 }));
        if (!seen.includes("REVIEWMARK")) await new Promise((r) => setTimeout(r, 100));
      }
      expect(seen).toContain("REVIEWMARK"); // 终端里收到了意见文本
      expect(seen).toContain("审查笔记.md");
      expect((await call("agent.sessions.kill", { id: s.id })).ok).toBe(true);
      // 会话结束后再发：给出恢复会话的提示，意见保持未发送
      await call("agent.review.comment.add", { sessionId: s.id, path: "审查笔记.md", side: "new", line: 1, text: "结束后的意见" });
      const late = await call("agent.review.send", { sessionId: s.id });
      expect(late.ok).toBe(false); // 终端已被结束：Core 明确拒绝
      expect(["INVALID_INPUT", "INTERNAL", "HERDR_UNAVAILABLE"]).toContain(late.error?.code);
      expect((await call("agent.review.comments", { sessionId: s.id })).data.find((x: { text: string }) => x.text === "结束后的意见").sentAt).toBeNull(); // 保持未发送
    } finally {
      await core.stop();
      delete process.env["HUHU_HERDR_BIN"];
    }
  }, 90_000);
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
  test("SSH shell 经同一条 /ws/terminal/ssh-<id> 路由：输入回显；关闭视图后 shell 仍在，可重新打开；ssh- 路由对未知 shell 返回 4404", async () => {
    const { startFakeSsh } = await import("../../../plugins/ssh/test/fake-server.js");
    const srv = await startFakeSsh({ password: "pw-shell-1" });
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (capability: string, input: unknown): Promise<R> => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    const prompts: { attemptId: string; hop: number }[] = [];
    e.events.subscribe((ev) => { if (ev.type === "ssh.hostKeyPrompt") prompts.push(ev.payload as { attemptId: string; hop: number }); });
    const { WebSocket } = await import("ws");
    try {
      await call("safe.setup", { password: "correct horse battery" });
      const item = (await call("safe.items.save", { name: "pw", type: "password", allowedModules: ["ssh"], value: "pw-shell-1" })).data as { id: string };
      const host = (await call("ssh.hosts.save", { name: "m", host: "127.0.0.1", port: srv.port, user: "u", auth: { kind: "password", secretRef: `safe://${item.id}` }, connectTimeoutSec: 5 })).data as { id: string };
      const connecting = call("ssh.connect", { hostId: host.id });
      for (let i = 0; i < 100 && prompts.length === 0; i++) await new Promise((r) => setTimeout(r, 30));
      await call("ssh.hostKey.decide", { attemptId: prompts[0]?.attemptId, hop: 0, accept: true });
      expect((await connecting).ok).toBe(true);
      const shell = (await call("ssh.shells.open", { hostId: host.id, cols: 100, rows: 30 })).data as { id: string };
      // 回放在连接建立时立即发出，所以收集器必须在 open 之前就挂好
      const open = (id: string) => new Promise<InstanceType<typeof WebSocket> & { text: string }>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${e.port}/ws/terminal/${id}?cols=100&rows=30`, [`bearer.${e.rendererToken}`]) as InstanceType<typeof WebSocket> & { text: string };
        ws.text = "";
        ws.on("message", (d, bin) => { if (bin) ws.text += d.toString(); });
        ws.on("open", () => resolve(ws));
        ws.on("error", reject);
      });
      const ws = await open(shell.id);
      ws.send(Buffer.from("ping\n"));
      for (let i = 0; i < 100 && !ws.text.includes("ECHO:ping"); i++) await new Promise((r) => setTimeout(r, 30));
      expect(ws.text).toContain("ECHO:ping");
      ws.close();
      await new Promise((r) => setTimeout(r, 200));
      expect(((await call("ssh.shells.list", { hostId: host.id })).data as { state: string }[])[0]?.state).toBe("running");
      const again = await open(shell.id);
      for (let i = 0; i < 100 && !again.text.includes("ECHO:ping"); i++) await new Promise((r) => setTimeout(r, 30));
      expect(again.text).toContain("ECHO:ping"); // 回放最近输出
      again.close();
      const code = await open("ssh-unknown").then((w) => new Promise<number>((r) => w.on("close", (c) => r(c))));
      expect(code).toBe(4404);
      expect((await call("ssh.shells.close", { id: shell.id })).data).toEqual({ closed: true });
    } finally {
      await srv.close();
    }
  }, 60_000);
  test("审计回归：HTTP 令牌不能连接终端流（403）；撤销令牌会关闭它已建立的事件连接（4401）", async () => {
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    const { WebSocket } = await import("ws");
    const created = (await (await fetch(`http://127.0.0.1:${e.port}/api/v1/call`, { method: "POST", headers: { authorization: `Bearer ${e.rendererToken}`, "content-type": "application/json" }, body: JSON.stringify({ capability: "gateway.tokens.create", input: { name: "t" }, requestId: "r", idempotencyKey: "key-tok-create-1" }) })).json() as { data: { id: string; token: string } }).data;
    const status = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${e.port}/ws/terminal/sess-abcdef`, [`bearer.${created.token}`]);
      ws.on("unexpected-response", (_r, res) => resolve(res.statusCode ?? 0));
      ws.on("open", () => resolve(200));
      ws.on("error", () => undefined);
    });
    expect(status).toBe(403);
    const events = new WebSocket(`ws://127.0.0.1:${e.port}/ws/events`, [`bearer.${created.token}`]);
    await new Promise<void>((r) => events.on("open", () => r()));
    const closed = new Promise<number>((r) => events.on("close", (c) => r(c)));
    await fetch(`http://127.0.0.1:${e.port}/api/v1/call`, { method: "POST", headers: { authorization: `Bearer ${e.rendererToken}`, "content-type": "application/json" }, body: JSON.stringify({ capability: "gateway.tokens.revoke", input: { id: created.id }, requestId: "r", idempotencyKey: "key-tok-revoke-1" }) });
    expect(await Promise.race([closed, new Promise<number>((r) => setTimeout(() => r(-1), 3000))])).toBe(4401);
  }, 30_000);
  test("ACC-SF-04（端到端）：脚本环境变量引用只允许 ssh 的保险箱条目 → 运行失败 SECRET_REF_INVALID 并通知；允许 automations 后成功，输出里有值但文件里没有引用解密结果之外的泄漏", async () => {
    const { chmodSync, writeFileSync, readdirSync: ls } = await import("node:fs");
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true }); engines.push(e);
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (capability: string, input: unknown): Promise<R> => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    const prog = path.join(tmp(), "show.sh");
    writeFileSync(prog, '#!/bin/sh\necho "got=${TOKEN:+set}"\n'); chmodSync(prog, 0o755);
    await call("safe.setup", { password: "correct horse battery" });
    const item = (await call("safe.items.save", { name: "tok", type: "token", allowedModules: ["ssh"], value: "TOP-SECRET-VALUE" })).data as { id: string };
    const script = (await call("automations.scripts.save", { title: "显示", program: prog, args: [], cwd: dir, envRefs: { TOKEN: `safe://${item.id}` }, timeoutSec: 10 })).data as { id: string };
    const rule = (await call("automations.create", { title: "脚本规则", trigger: { preset: "custom", cron: "0 9 * * *", zone: "UTC" }, action: { kind: "script", scriptId: script.id, args: [] } })).data as { id: string };
    expect(((await call("automations.runNow", { id: rule.id })).data as { summary: { state: string } }).summary).toEqual({ state: "failed" });
    const note = ((await call("notifications.list", {})).data as { title: string }[]).map((n) => n.title).join("\n");
    expect(note).toContain("SECRET_REF_INVALID");
    // 允许 automations 引用后成功
    await call("safe.items.save", { id: item.id, name: "tok", type: "token", allowedModules: ["ssh", "automations"] });
    expect(((await call("automations.runNow", { id: rule.id })).data as { summary: { state: string } }).summary).toEqual({ state: "succeeded" });
    const texts = ls(path.join(dir, "Automation Runs")).map((f) => readFileSync(path.join(dir, "Automation Runs", f), "utf8"));
    expect(texts.some((t) => t.includes("got=set"))).toBe(true);
    expect(texts.join()).not.toContain("TOP-SECRET-VALUE");
    // 保险箱锁定后同一脚本失败（SAFE_LOCKED）
    await call("safe.lock", {});
    expect(((await call("automations.runNow", { id: rule.id })).data as { summary: { state: string } }).summary).toEqual({ state: "failed" });
  }, 60_000);
  test("MCP over HTTP：默认关闭(404)；开启后 mcp/http 令牌可用，桌面/cli 令牌 403；工具列表遵守开放规则；经 Dispatcher 授权", async () => {
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    const rpc = (token: string | null, body: unknown, method = "POST") => fetch(`http://127.0.0.1:${e.port}/mcp`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", accept: "application/json, text/event-stream" }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
    const init = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
    expect((await rpc(e.mcpToken, init)).status).toBe(404); // 默认关闭
    const call = (capability: string, input: unknown) => fetch(`http://127.0.0.1:${e.port}/api/v1/call`, { method: "POST", headers: { authorization: `Bearer ${e.rendererToken}`, "content-type": "application/json" }, body: JSON.stringify({ capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) }).then((r) => r.json() as Promise<{ ok: boolean; data: unknown }>);
    expect((await call("gateway.mcp.update", { enabled: true, transport: "http" })).ok).toBe(true);
    expect((await rpc(null, init)).status).toBe(401);
    expect((await rpc(e.rendererToken, init)).status).toBe(403);
    expect((await rpc(e.cliToken, init)).status).toBe(403);
    expect((await rpc(e.mcpToken, init, "GET")).status).toBe(405);
    const list = (await (await rpc(e.mcpToken, init)).json()) as { result: { tools: { name: string }[] } };
    const names = list.result.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["vault_info", "tasks_list"]));
    expect(names).not.toContain("safe_items_reveal");
    expect(names).not.toContain("tasks_create"); // 默认不对外
    const callTool = async (name: string, args: unknown) => ((await (await rpc(e.mcpToken, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } })).json()) as { result: { isError?: boolean; content: { text: string }[] } }).result;
    const info = await callTool("vault_info", {});
    expect(info.isError).toBeUndefined();
    expect(JSON.parse(info.content[0]?.text ?? "{}")).toMatchObject({ id: e.vault.id });
    expect((await callTool("tasks_create", { title: "x" })).isError).toBe(true);
    const cap = await callTool("inbox_capture", { body: "来自 MCP HTTP", source: "quick" });
    expect(JSON.parse(cap.content[0]?.text ?? "{}").source).toBe("mcp");
    // 网关令牌（http 身份）同样可用；关闭 MCP 后立即 404
    const tok = ((await call("gateway.tokens.create", { name: "mcp 客户端" })).data as { token: string }).token;
    expect((await rpc(tok, init)).status).toBe(200);
    await call("gateway.mcp.update", { enabled: false, transport: "http" });
    expect((await rpc(e.mcpToken, init)).status).toBe(404);
  }, 30_000);
  test("审计回归：外部入口即使被开放 automations.create/update/setEnabled，也不能创建或启用 agent_prompt 规则", async () => {
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (token: string, capability: string, input: unknown): Promise<R> => post(e, token, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    for (const cap of ["automations.create", "automations.update", "automations.setEnabled"]) await call(e.rendererToken, "gateway.update", { capability: cap, exposed: true });
    const trig = { preset: "custom", cron: "0 9 * * *", zone: "UTC" };
    const agent = { kind: "agent_prompt", spaceId: "space-1", provider: "codex" };
    expect((await call(e.cliToken, "automations.create", { title: "外部想创建 Agent 规则", trigger: trig, action: agent })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.cliToken, "automations.create", { title: "外部创建通知规则", trigger: trig, action: { kind: "notify", channel: "in_app", text: "ok" } })).ok).toBe(true);
    expect((await call(e.cliToken, "automations.create", { title: "外部想创建扫描规则", trigger: trig, action: { kind: "scan_agent_tasks", maxConcurrent: 1 } })).error?.code).toBe("PERMISSION_DENIED");
    // 内置 scan 规则：外部可以暂停、改时间，但不能启用，也不能改 action
    const list = (await call(e.rendererToken, "automations.list", {})).data as { id: string; version: string; data: { builtin: boolean; action: { kind: string } } }[] | undefined;
    const scan = list?.find((r) => r.data.action.kind === "scan_agent_tasks");
    expect(scan).toBeDefined();
    const paused = await call(e.cliToken, "automations.setEnabled", { id: scan!.id, enabled: false });
    expect(paused.ok).toBe(true);
    const pausedVersion = (paused.data as { version: string }).version;
    expect((await call(e.cliToken, "automations.setEnabled", { id: scan!.id, enabled: true })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.cliToken, "automations.update", { id: scan!.id, expectedVersion: pausedVersion, patch: { action: { kind: "notify", channel: "in_app", text: "x" } } })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.cliToken, "automations.update", { id: scan!.id, expectedVersion: pausedVersion, patch: { title: "外部改名" } })).ok).toBe(true);
    const desktopRule = (await call(e.rendererToken, "automations.create", { title: "桌面创建的 Agent 规则", trigger: trig, action: agent })).data as { id: string; version: string };
    expect((await call(e.cliToken, "automations.setEnabled", { id: desktopRule.id, enabled: true })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.cliToken, "automations.update", { id: desktopRule.id, expectedVersion: desktopRule.version, patch: { title: "改名" } })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.rendererToken, "automations.setEnabled", { id: desktopRule.id, enabled: true })).ok).toBe(true);
  }, 30_000);
  test("ACC-SY-06：设置里的时区立即影响日记的“今天”（两个相差 25 小时的时区得到不同日期）", async () => {
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    type R = { ok: boolean; data: any; error?: { code: string } }; // eslint-disable-line
    const call = (capability: string, input: unknown): Promise<R> => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    const dayIn = (zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());
    await call("settings.update", { patch: { dateTime: { zone: "Pacific/Kiritimati" } } });
    const east = await call("notes.openDaily", {});
    await call("settings.update", { patch: { dateTime: { zone: "Pacific/Pago_Pago" } } });
    const west = await call("notes.openDaily", {});
    expect(east.ok && west.ok).toBe(true);
    expect(east.data.path).toContain(dayIn("Pacific/Kiritimati"));
    expect(west.data.path).toContain(dayIn("Pacific/Pago_Pago"));
    expect(dayIn("Pacific/Kiritimati")).not.toBe(dayIn("Pacific/Pago_Pago"));
  }, 30_000);
  test("vault.update / vault.location 只有桌面可用；改名后 vault.info 与 vault.json 一致", async () => {
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    type R = { ok: boolean; data: any; error?: { code: string } }; // eslint-disable-line
    const call = (token: string, capability: string, input: unknown): Promise<R> => post(e, token, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    expect((await call(e.cliToken, "vault.update", { name: "外部改名" })).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    expect((await call(e.cliToken, "vault.location", {})).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    const r = await call(e.rendererToken, "vault.update", { name: "我的工作台", description: "说明" });
    expect(r.ok).toBe(true);
    const info = await call(e.rendererToken, "vault.info", {});
    expect(info.data).toMatchObject({ name: "我的工作台" });
    expect(info.data).not.toHaveProperty("description"); // 描述不随 vault.info 对外
    const loc = await call(e.rendererToken, "vault.location", {});
    expect(loc.data).toMatchObject({ description: "说明" });
    expect(JSON.parse(readFileSync(path.join(loc.data.root, ".huhu/vault.json"), "utf8"))).toMatchObject({ name: "我的工作台", description: "说明" });
    expect((await call(e.rendererToken, "vault.update", { name: "" })).ok).toBe(false);
  }, 30_000);
  test("ACC-SY-08：导出受管数据包 → 在新目录导入：Markdown 与保险箱密文哈希一致，保险箱用原主密码解锁；导出结果的 SHA-256 与文件一致", async () => {
    const { createHash } = await import("node:crypto");
    const { mkdirSync, readdirSync, statSync } = await import("node:fs");
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    type R = { ok: boolean; data: any; error?: { code: string } }; // eslint-disable-line
    const call = (token: string, capability: string, input: unknown): Promise<R> => post(e, token, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    const note = (await call(e.rendererToken, "notes.create", { name: "要备份的笔记" })).data as { path: string };
    const ver = (await call(e.rendererToken, "notes.read", { path: note.path })).data.version as string;
    await call(e.rendererToken, "notes.save", { path: note.path, text: "# 要备份的笔记\n\n正文 中文\n", expectedVersion: ver });
    await call(e.rendererToken, "safe.setup", { password: "correct horse battery" });
    await call(e.rendererToken, "safe.items.save", { name: "令牌", type: "token", value: "backup-secret-value", allowedModules: [] });
    const out = tmp(); const zip = path.join(out, "backup.zip");

    // 只有桌面可用；路径必须合法
    expect((await call(e.cliToken, "vault.exportPackage", { dest: zip })).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    expect((await call(e.rendererToken, "vault.exportPackage", { dest: "relative.zip" })).ok).toBe(false);
    expect((await call(e.rendererToken, "vault.exportPackage", { dest: path.join(out, "a.txt") })).ok).toBe(false);
    expect((await call(e.rendererToken, "vault.exportPackage", { dest: path.join(e.vault.root, "inside.zip") })).ok).toBe(false); // 不能导到 Vault 里面

    const ex = await call(e.rendererToken, "vault.exportPackage", { dest: zip, includeAttachments: true });
    expect(ex.ok).toBe(true);
    expect(ex.data.sha256).toBe(createHash("sha256").update(readFileSync(zip)).digest("hex"));
    expect(ex.data.size).toBe(statSync(zip).size);
    expect((await call(e.rendererToken, "vault.exportPackage", { dest: zip })).ok).toBe(false); // 不覆盖已有文件

    const target = path.join(out, "restored");
    expect((await call(e.rendererToken, "vault.importPackage", { zipPath: zip, targetDir: path.join(e.vault.root, "nested") })).ok).toBe(false); // 不能导进当前 Vault
    const im = await call(e.rendererToken, "vault.importPackage", { zipPath: zip, targetDir: target });
    expect(im.ok).toBe(true);
    expect(im.data.vaultId).not.toBe(e.vault.id); // 同 id 的 Vault 正开着：副本换新 id
    const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");
    const list = (root: string, sub: string): string[] => { const d = path.join(root, sub); return existsSync(d) ? readdirSync(d).sort() : []; };
    expect(sha(path.join(target, note.path))).toBe(sha(path.join(e.vault.root, note.path)));
    expect(list(target, ".huhu/safe")).toEqual(list(e.vault.root, ".huhu/safe"));
    for (const f of list(e.vault.root, ".huhu/safe").filter((n) => n.endsWith(".json") || n.endsWith(".bin"))) expect(sha(path.join(target, ".huhu/safe", f))).toBe(sha(path.join(e.vault.root, ".huhu/safe", f)));
    // 经悬空符号链接指向 Vault 内部的导入目标：明确拒绝，而不是靠后续 mkdir 恰好失败
    const { symlinkSync } = await import("node:fs");
    symlinkSync(path.join(e.vault.root, "ghost"), path.join(out, "linkgone"));
    const viaLink = await call(e.rendererToken, "vault.importPackage", { zipPath: zip, targetDir: path.join(out, "linkgone", "new") });
    expect(viaLink.ok).toBe(false);
    expect(viaLink.error?.code).toBe("INVALID_INPUT");
    expect(existsSync(path.join(e.vault.root, "ghost"))).toBe(false);
    mkdirSync(path.join(out, "occupied")); writeFileSync(path.join(out, "occupied", "x.txt"), "x");
    expect((await call(e.rendererToken, "vault.importPackage", { zipPath: zip, targetDir: path.join(out, "occupied") })).ok).toBe(false); // 目标必须为空

    // 用原主密码解锁导入后的保险箱
    const e2 = await boot({ vaultPath: target }); engines.push(e2);
    const unlock = await post(e2, e2.rendererToken, { capability: "safe.unlock", input: { password: "correct horse battery" }, requestId: "r", idempotencyKey: "key-unlock-restored" }) as unknown as R;
    expect(unlock.ok).toBe(true);
  }, 60_000);
  test("vault.reindexCancel：没有重建在进行时返回 cancelled=false；重建完成后搜索可用（ACC-SY-07 的能力层前置）", async () => {
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    type R = { ok: boolean; data: any; error?: { code: string } }; // eslint-disable-line
    const call = (token: string, capability: string, input: unknown): Promise<R> => post(e, token, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    expect((await call(e.cliToken, "vault.reindexCancel", {})).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    expect((await call(e.rendererToken, "vault.reindexCancel", {})).data).toEqual({ cancelled: false });
    expect((await call(e.rendererToken, "vault.reindex", {})).data).toEqual({ completed: true });
  }, 30_000);
  test("automations.update 可以改规则正文（agent_prompt 的提示词）；外部入口不能改 agent 规则的正文", async () => {
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    type R = { ok: boolean; data: any; error?: { code: string } }; // eslint-disable-line
    const call = (token: string, capability: string, input: unknown): Promise<R> => post(e, token, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    const trig = { preset: "daily", cron: "30 9 * * *", zone: "UTC" };
    const created = (await call(e.rendererToken, "automations.create", { title: "每日整理", trigger: trig, action: { kind: "agent_prompt", spaceId: "space-x", provider: "claude" }, body: "第一版提示词" })).data;
    expect(created.body).toContain("第一版提示词");
    expect(created.data.enabled).toBe(false); // 新建默认暂停
    const upd = await call(e.rendererToken, "automations.update", { id: created.id, expectedVersion: created.version, patch: { title: "每日整理（改）", trigger: { ...trig, cron: "0 18 * * 1-5" } }, body: "第二版提示词\n第二行" });
    expect(upd.ok).toBe(true);
    expect(upd.data.body).toContain("第二版提示词");
    expect(upd.data.data).toMatchObject({ title: "每日整理（改）", trigger: { cron: "0 18 * * 1-5" } });
    expect((await call(e.rendererToken, "automations.update", { id: created.id, expectedVersion: created.version, patch: {}, body: "旧版本写入" })).error?.code).toBe("VERSION_CONFLICT");
    await call(e.rendererToken, "gateway.update", { capability: "automations.update", exposed: true });
    expect((await call(e.cliToken, "automations.update", { id: created.id, expectedVersion: upd.data.version, patch: {}, body: "外部想改提示词" })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.rendererToken, "automations.read", { id: created.id })).data?.body ?? upd.data.body).toContain("第二版提示词");
  }, 30_000);
  test("审计回归：/mcp 受单令牌并发上限约束（超过 32 个同时进行的请求得到 429）", async () => {
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    await post(e, e.rendererToken, { capability: "gateway.mcp.update", input: { enabled: true, transport: "http" }, requestId: "r", idempotencyKey: "key-mcp-enable-1" });
    const slow = () => fetch(`http://127.0.0.1:${e.port}/mcp`, { method: "POST", headers: { authorization: `Bearer ${e.mcpToken}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) }).then((r) => r.status);
    const statuses = await Promise.all(Array.from({ length: 80 }, slow));
    expect(statuses.every((s) => s === 200 || s === 429)).toBe(true);
    // 引擎仍然健康，并且并发回落后可以再次正常使用
    expect(await slow()).toBe(200);
  }, 30_000);
  test("审计回归：外部入口即使开放 notes 写能力，也不能在 Automations/ 下创建/改写/复制/移入规则", async () => {
    const e = await boot({ vaultPath: tmp(), create: true }); engines.push(e);
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (token: string, capability: string, input: unknown): Promise<R> => post(e, token, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    for (const cap of ["notes.create", "notes.save", "notes.move", "notes.duplicate", "notes.rename"]) await call(e.rendererToken, "gateway.update", { capability: cap, exposed: true });
    expect((await call(e.cliToken, "notes.create", { name: "evil", folder: "Automations" })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.cliToken, "notes.create", { name: "evil", folder: "automations/sub" })).error?.code).toBe("PERMISSION_DENIED");
    const ok = await call(e.cliToken, "notes.create", { name: "正常笔记" });
    expect(ok.ok).toBe(true);
    const note = ok.data as { path: string };
    expect((await call(e.cliToken, "notes.move", { path: note.path, targetDir: "Automations" })).error?.code).toBe("PERMISSION_DENIED");
    // 审计回归：带 "./"、重复斜杠的写法归一化后同样落在 Automations/ 下，必须同样被拦
    expect((await call(e.cliToken, "notes.move", { path: note.path, targetDir: "./Automations" })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.cliToken, "notes.create", { name: "evil", folder: "./automations//sub" })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.cliToken, "notes.save", { path: "./Automations/x--rule-1.md", text: "x", expectedVersion: "v" })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.cliToken, "notes.rename", { path: ".//Automations/x--rule-1.md", newName: "y" })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.rendererToken, "notes.create", { name: "桌面可以", folder: "Automations" })).error?.code).not.toBe("PERMISSION_DENIED");
  }, 30_000);
});
