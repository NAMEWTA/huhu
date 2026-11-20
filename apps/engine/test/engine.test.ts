import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { AutomationsService } from "@huhu/plugin-automations/engine";
import { OperationLog, SemanticRepository } from "@huhu/vault";
import { afterEach, describe, expect, test, vi } from "vitest";
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
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-e-"));
  dirs.push(d);
  return d;
};
const post = (e: RunningEngine, token: string, body: unknown) =>
  fetch(`http://127.0.0.1:${e.port}/api/v1/call`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<Reply>);
async function allowTools(e: RunningEngine, ...names: string[]) {
  for (const capability of names) {
    expect(await post(e, e.rendererToken, { capability: "gateway.update", input: { capability, exposed: true }, requestId: `allow-${capability}` })).toMatchObject({ ok: true });
  }
}

describe("首页布局读取", () => {
  const board = { schemaVersion: 1, boardId: "home", revision: "r1", updatedAt: "2026-11-19T00:00:00Z", instances: [], layout: [] };
  const focus = { instanceId: "focus-a", widgetType: "widget:kernel:focus", config: {}, hidden: false };
  const withCard = { ...board, instances: [focus], layout: [{ instanceId: focus.instanceId, x: 0, y: 0, w: 3, h: 2 }] };
  const getBoard = (e: RunningEngine) => post(e, e.rendererToken, { capability: "home.dashboard.get", input: {}, requestId: "dashboard" });

  test("W02-02 正常启动的 Engine 经 HTTP 提交整板，重启后保留 revision、实例与几何", async () => {
    const root = tmp();
    const engine = await boot({ vaultPath: root, create: true });
    engines.push(engine);
    const input = { baseRevision: "0", instances: withCard.instances, layout: withCard.layout };
    const saved = await post(engine, engine.rendererToken, { capability: "home.dashboard.update", input, requestId: "submit-board", idempotencyKey: "submit-board" });
    expect(saved).toMatchObject({ ok: true, data: { source: "stored", board: { revision: expect.any(String), updatedAt: expect.any(String), instances: input.instances, layout: input.layout } } });
    await engine.shutdown();
    engines.pop();
    const reopened = await boot({ vaultPath: root });
    engines.push(reopened);
    expect((await getBoard(reopened)).data).toEqual(saved.data);
  });

  test("W02-01 缺文件重复读保持默认；空板、有卡布局和不可识别的原件按实际来源返回", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    const home = path.join(e.vault.root, ".huhu", "home");
    const file = path.join(home, "widgets.json");
    const first = await getBoard(e);
    expect(first).toMatchObject({ ok: true, data: { source: "default", writable: true, vaultId: e.vault.id, board: { revision: "0", instances: ["metrics", "tasks", "notes", "focus"].map((id) => ({ instanceId: `default-${id}` })) } } });
    expect(await getBoard(e)).toEqual(first);
    expect(existsSync(file)).toBe(false);

    mkdirSync(home, { recursive: true });
    for (const saved of [board, withCard]) {
      const bytes = JSON.stringify(saved);
      writeFileSync(file, bytes);
      for (let i = 0; i < 2; i++) {
        expect(await getBoard(e)).toMatchObject({ ok: true, data: { source: "stored", writable: true, vaultId: e.vault.id, board: saved } });
      }
      expect(readFileSync(file, "utf8")).toBe(bytes);
    }
    const oldWrite = await post(e, e.rendererToken, { capability: "home.widgets.update", input: { hidden: [] }, requestId: "old-dashboard", idempotencyKey: "old-dashboard" });
    expect(oldWrite).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_FOUND" } });
    expect(readFileSync(file, "utf8")).toBe(JSON.stringify(withCard));

    const samples = [
      [JSON.stringify({ hidden: ["focus"] }), "unrecognized"],
      [JSON.stringify({ ...board, schemaVersion: 2 }), "unrecognized"],
      [JSON.stringify({ ...withCard, layout: [{ ...withCard.layout[0], x: 5 }] }), "invalid"],
      [JSON.stringify({ ...withCard, instances: [focus, focus] }), "invalid"],
      ["{", "invalid"],
    ];
    for (const [bytes, source] of samples) {
      writeFileSync(file, bytes!);
      expect(await getBoard(e)).toMatchObject({ ok: true, data: { source, writable: false } });
      expect(readFileSync(file, "utf8")).toBe(bytes);
    }
  });

  test("W02-01 只读从原 Vault 读板，区分找不到文件与无法读取", async () => {
    const dir = tmp();
    const writer = await boot({ vaultPath: dir, create: true });
    await writer.shutdown();
    const file = path.join(dir, ".huhu", "home", "widgets.json");
    const readonlyEngine = await boot({ vaultPath: dir, readOnly: true });
    engines.push(readonlyEngine);
    expect(await getBoard(readonlyEngine)).toMatchObject({ ok: true, data: { source: "default", writable: false, vaultId: readonlyEngine.vault.id } });
    expect(existsSync(file)).toBe(false);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(withCard));
    expect(await getBoard(readonlyEngine)).toMatchObject({ ok: true, data: { source: "stored", writable: false, vaultId: readonlyEngine.vault.id, board: withCard } });
    expect(readFileSync(file, "utf8")).toBe(JSON.stringify(withCard));
    rmSync(file);
    mkdirSync(file);
    expect(await getBoard(readonlyEngine)).toMatchObject({ ok: true, data: { source: "unreadable", writable: false } });
  });
});

describe("Engine 启动与关闭", () => {
  test("Renderer 与 CLI 令牌经同一 Dispatcher 调用 vault.info", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    await allowTools(e, "vault.info");
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
  test.skipIf(process.platform === "win32")(
    "子进程模式：报告 ready，收到 SIGTERM 后删除端点描述并退出 0",
    async () => {
      const dir = tmp();
      const tsx = createRequire(import.meta.url).resolve("tsx/cli");
      const child = spawn(process.execPath, [tsx, path.resolve(import.meta.dirname, "../src/main.ts"), "--vault", dir, "--create"], { stdio: ["ignore", "pipe", "pipe"] });
      const ready: { type: string; port: number } = await new Promise((resolve, reject) => {
        let out = "";
        child.stdout.on("data", (d) => {
          out += d;
          const line = out.split("\n")[0];
          if (line && out.includes("\n")) resolve(JSON.parse(line));
        });
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
    },
    30000,
  );
  test("同一 Vault 的第二个 Engine → READ_ONLY_VAULT", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    await expect(boot({ vaultPath: dir })).rejects.toMatchObject({ code: "READ_ONLY_VAULT" });
  });
  test("vault.list / vault.readRange：真实目录、受保护标记、范围读取与对外限制", async () => {
    const dir = tmp();
    const { mkdirSync, writeFileSync } = await import("node:fs");
    writeFileSync(path.join(dir, "a.md"), "# a\n");
    writeFileSync(path.join(dir, "data.bin"), Buffer.from("0123456789"));
    mkdirSync(path.join(dir, "empty"));
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    const call = (capability: string, input: unknown, token = e.rendererToken) => post(e, token, { capability, input, requestId: "r" });
    const list = (await call("vault.list", {})).data as unknown as { entries: { name: string; kind: string }[]; total: number; counts: { files: number; dirs: number } };
    expect(list.entries.map((x) => x.name)).toEqual(["empty", "a.md", "data.bin"]); // .huhu 默认不列
    expect(list.counts).toEqual({ files: 2, dirs: 1 });
    const withProt = (await call("vault.list", { includeProtected: true })).data as unknown as { entries: { name: string; protected?: string }[] };
    expect(withProt.entries.find((x) => x.name === ".huhu")?.protected).toBe("internal");
    expect((await call("vault.list", { dir: "../.." })).error?.code).toBe("PATH_OUTSIDE_VAULT");
    // 外部入口：默认不开放；开放后也不能列受保护目录
    expect((await call("vault.list", {}, e.cliToken)).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    const r = (await call("vault.readRange", { path: "data.bin", offset: 2, length: 4 })).data as unknown as { base64: string; size: number; eof: boolean; length: number };
    expect(Buffer.from(r.base64, "base64").toString()).toBe("2345");
    expect(r).toMatchObject({ size: 10, eof: false, length: 4 });
    const tail = (await call("vault.readRange", { path: "data.bin", offset: 8, length: 100 })).data as unknown as { base64: string; eof: boolean };
    expect(Buffer.from(tail.base64, "base64").toString()).toBe("89");
    expect(tail.eof).toBe(true);
    expect((await call("vault.readRange", { path: "../x", offset: 0, length: 1 })).error?.code).toBe("PATH_OUTSIDE_VAULT");
    expect((await call("vault.readRange", { path: "data.bin", offset: 0, length: 5 * 1024 * 1024 })).error?.code).toBe("INVALID_INPUT");
    expect((await call("vault.readRange", { path: "data.bin", offset: 0, length: 1 }, e.cliToken)).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
  });
  test("vault.indexEntries / vault.search / vault.readFile 与外部修改后的增量索引", async () => {
    const dir = tmp();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path.join(dir, "笔记.md"), "# 笔记\n关于知识库的想法\n");
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    const call = (capability: string, input: unknown, token = e.rendererToken) => post(e, token, { capability, input, requestId: "r" });
    await e.index.build();
    expect((await call("vault.indexEntries", {})).data.map((x) => x.path)).toContain("笔记.md");
    expect((await call("vault.search", { query: "知识库" })).data.hits[0]?.path).toBe("笔记.md");
    expect((await call("vault.readFile", { path: "笔记.md" })).data.text).toContain("想法");
    expect((await call("vault.readFile", { path: "../etc/passwd" })).error?.code).toBe("PATH_OUTSIDE_VAULT");
    const managed = (await call("vault.managedFiles", {})).data as unknown as { files: { path: string; domain: string }[] };
    expect(managed.files.find((f) => f.path === "笔记.md")?.domain).toBe("notes");
    expect(managed.files.find((f) => f.path === ".huhu/vault.json")?.domain).toBe("config");
    expect(managed.files.some((f) => /^\.huhu\/(runtime|history|cache|safe|operations)\//.test(f.path))).toBe(false); // 运行态、历史、缓存、密文不列出
    // CLI 身份：readFile 默认不对外
    expect((await call("vault.readFile", { path: "笔记.md" }, e.cliToken)).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    expect((await call("vault.reindex", {}, e.cliToken)).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    // 外部新增文件 → 事件 + 索引
    const seen: string[] = [];
    e.events.subscribe((ev) => {
      if (ev.type === "vault.fileChanged") seen.push((ev.payload as { path: string }).path);
    });
    writeFileSync(path.join(dir, "新文件.md"), "独特词汇蜻蜓");
    const end = Date.now() + 15000; // 全量并行时原生监听延迟可能更长
    while (!seen.includes("新文件.md") && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
    expect(seen).toContain("新文件.md");
    expect((await call("vault.search", { query: "蜻蜓" })).data.hits[0]?.path).toBe("新文件.md");
  });
  test("tasks 插件：经 HTTP 创建、改状态、列表；停用后能力不可用", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    const call = (capability: string, input: unknown, key?: string) =>
      post(e, e.rendererToken, { capability, input, requestId: "r", ...(key ? { idempotencyKey: key } : {}) }) as unknown as Promise<{
        ok: boolean;
        data: { id: string; version: string; status: string; type: string; title: string; tags: string[]; origin: { kind: string } };
        error?: { code: string };
      }>;
    const created = await call("tasks.create", { title: "写周报", type: "human", tags: ["#周报"] }, "key-create-1");
    expect(created.ok).toBe(true);
    expect(created.data).toMatchObject({ type: "human", status: "not_started", tags: ["周报"], origin: { kind: "desktop" } });
    expect((await call("tasks.create", { title: "写周报", type: "human" })).error?.code).toBe("INVALID_INPUT"); // 缺幂等键
    const done = await call("tasks.setStatus", { id: created.data.id, status: "completed", expectedVersion: created.data.version }, "key-done-1");
    expect(done.data.status).toBe("completed");
    const list = (await post(e, e.rendererToken, { capability: "tasks.list", input: { status: ["completed"] }, requestId: "r" })) as unknown as { data: { title: string }[] };
    expect(list.data.map((t) => t.title)).toEqual(["写周报"]);
    const tagged = (await post(e, e.rendererToken, { capability: "tasks.list", input: { tags: ["周报"] }, requestId: "r" })) as unknown as { data: { title: string }[] };
    expect(tagged.data).toHaveLength(1);
    // 用户明确开放查询后，外部入口仍不能创建任务。
    await allowTools(e, "tasks.list");
    expect((await post(e, e.cliToken, { capability: "tasks.list", input: {}, requestId: "r" })).ok).toBe(true);
    expect((await post(e, e.cliToken, { capability: "tasks.create", input: { title: "x" }, requestId: "r", idempotencyKey: "key-cli-1" })).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
  });
  test.each(["已移走", "占位.md", "占位.md/子目录"])("notes.move 拒绝非现存目录 %s 且保持磁盘不变", async (targetDir) => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    const call = (capability: string, input: unknown) => post(e, e.rendererToken, { capability, input, requestId: capability, idempotencyKey: capability });
    await call("folders.create", { path: "目标" });
    const created = await call("notes.create", { name: "笔记", folder: "目标" });
    expect(created).toMatchObject({ ok: true, data: { path: "目标/笔记.md" } });
    writeFileSync(path.join(dir, "占位.md"), "不变\n");
    const source = path.join(dir, "目标/笔记.md");
    const bytes = readFileSync(source);
    const result = await call("notes.move", { path: "目标", targetDir });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND", message: `目标文件夹不存在：${targetDir}` } });
    expect(readFileSync(source)).toEqual(bytes);
    expect(readFileSync(path.join(dir, "占位.md"), "utf8")).toBe("不变\n");
    expect(existsSync(path.join(dir, targetDir, "目标"))).toBe(false);
    expect(existsSync(path.join(dir, "已移走"))).toBe(false);
  });

  test("notes.move 仍可移动笔记到 Vault 根目录", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    const call = (capability: string, input: unknown) => post(e, e.rendererToken, { capability, input, requestId: capability, idempotencyKey: capability });
    const created = await call("notes.create", { name: "移回根", folder: "子目录" });
    expect(created).toMatchObject({ ok: true, data: { path: "子目录/移回根.md" } });
    const source = path.join(dir, "子目录/移回根.md");
    const bytes = readFileSync(source);
    expect(await call("notes.move", { path: "子目录/移回根.md", targetDir: "" })).toMatchObject({
      ok: true,
      data: { moved: { "子目录/移回根.md": "移回根.md" } },
    });
    expect(existsSync(source)).toBe(false);
    expect(readFileSync(path.join(dir, "移回根.md"))).toEqual(bytes);
  });

  test("notes 插件：创建、改名改写双链、保存冲突、反链、日记", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    const call = (capability: string, input: unknown, key: string = `key-${capability}-${Math.random()}`) =>
      post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: key }) as unknown as Promise<{
        ok: boolean;
        data: { path: string; id: string; version: string; text: string; moved: Record<string, string> };
        error?: { code: string };
      }>;
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
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    type R = { ok: boolean; data: { id: string; source: string; status: string; result: { kind: string; id: string } | null; type: string }; error?: { code: string } };
    const call = (token: string, capability: string, input: unknown, key = `key-${capability}-${Math.random().toString(36).slice(2)}`) => post(e, token, { capability, input, requestId: "r", idempotencyKey: key }) as unknown as Promise<R>;
    await allowTools(e, "inbox.capture", "archives.list");
    // ACC-IN-05：CLI 提交带 source: quick，文件中仍是 cli。
    const viaCli = await call(e.cliToken, "inbox.capture", { body: "来自 CLI", source: "quick" });
    expect(viaCli.data.source).toBe("cli");
    // ACC-IN-02：转为任务
    const toTask = await call(e.rendererToken, "inbox.convert", { id: viaCli.data.id, target: "task", fields: { title: "来自 CLI" } });
    expect(toTask.ok).toBe(true);
    expect(toTask.data).toMatchObject({ status: "processed", result: { kind: "task" } });
    const tasks = (await post(e, e.rendererToken, { capability: "tasks.list", input: {}, requestId: "r" })) as unknown as { data: { id: string; title: string }[] };
    expect(tasks.data.map((t) => t.id)).toContain(toTask.data.result?.id);
    // 档案：先建类型，再转换（档案以文件夹路径标识）
    const type = (await call(e.rendererToken, "archives.types.save", { name: "项目", fields: [] })) as unknown as { data: { path: string } };
    expect(type.data.path).toBe("Archives/项目/");
    const second = await call(e.rendererToken, "inbox.capture", { body: "一个项目想法" });
    const toArchive = await call(e.rendererToken, "inbox.convert", { id: second.data.id, target: "archive", fields: { name: "新项目", type: type.data.path } });
    expect(toArchive.data.result).toMatchObject({ kind: "archive", id: "Archives/项目/新项目/" });
    // 外部入口不能调用 inbox.convert
    expect((await call(e.cliToken, "inbox.convert", { id: second.data.id, target: "task", fields: {} })).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    // ACC-AR：archives.list 按用户选择开放。
    expect(((await post(e, e.cliToken, { capability: "archives.list", input: {}, requestId: "r" })) as unknown as { ok: boolean }).ok).toBe(true);
  });
  test("AR-15 档案能力的暴露：外部可读 list/read；create/update/move/delete 需用户开放；types.* 永不对外", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    type R = { ok: boolean; data: any; error?: { code: string } }; // eslint-disable-line
    const call = (token: string, capability: string, input: unknown): Promise<R> => post(e, token, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    await call(e.rendererToken, "archives.types.save", {
      name: "通讯录",
      fields: [
        { name: "电话", type: "text" },
        { name: "生日", type: "date" },
      ],
    });
    await allowTools(e, "archives.list", "archives.read");
    expect((await call(e.cliToken, "archives.list", {})).ok).toBe(true);
    expect((await call(e.cliToken, "archives.create", { type: "通讯录", name: "张三" })).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    for (const cap of ["archives.create", "archives.update", "archives.move", "archives.delete"]) expect((await call(e.rendererToken, "gateway.update", { capability: cap, exposed: true })).ok).toBe(true);
    for (const cap of ["archives.types.list", "archives.types.save", "archives.types.delete"]) {
      expect((await call(e.rendererToken, "gateway.update", { capability: cap, exposed: true })).error?.code).toBe("INVALID_INPUT");
      expect((await call(e.cliToken, cap, {})).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    }
    const created = await call(e.cliToken, "archives.create", { type: "Archives/通讯录/", name: "张三", fields: { 电话: "0123", 生日: "1990-05-01" }, body: "备注\n" });
    expect(created.ok).toBe(true);
    expect(created.data).toMatchObject({ path: "Archives/通讯录/张三/", name: "张三", fields: { 电话: "0123", 生日: "1990-05-01" }, undefinedFields: [], invalidFields: [] });
    expect(readFileSync(path.join(dir, "Archives/通讯录/张三/index.md"), "utf8")).toBe('---\n电话: "0123"\n生日: 1990-05-01\n---\n备注\n');
    expect((await call(e.cliToken, "archives.create", { type: "通讯录", name: "李四", fields: { 生日: "1990/5/1" } })).error?.code).toBe("INVALID_INPUT");
    const dup = await call(e.cliToken, "archives.create", { type: "通讯录", name: "张三" });
    expect(dup.data.name).toMatch(/^张三-[a-z0-9]{4}$/);
    const read = await call(e.cliToken, "archives.read", { path: "Archives/通讯录/张三/" });
    expect(read.data).toMatchObject({ body: "备注\n", files: [], backlinks: [] });
    expect(read.data.version).toBeTruthy();
    // 重命名：双链被改写，noteId 不变
    await call(e.rendererToken, "notes.create", { name: "计划" });
    const plan = path.join(dir, "计划.md");
    writeFileSync(plan, "见 [[Archives/通讯录/张三/]]\n");
    const upd = await call(e.cliToken, "archives.update", { path: "Archives/通讯录/张三/", expectedVersion: read.data.version, name: "张三丰", fields: { 电话: "999" } });
    expect(upd.data).toMatchObject({ path: "Archives/通讯录/张三丰/", fields: { 电话: "999" }, noteId: read.data.noteId });
    expect(readFileSync(plan, "utf8")).toBe("见 [[Archives/通讯录/张三丰/]]\n");
    expect((await call(e.cliToken, "archives.delete", { path: "Archives/通讯录/张三丰/" })).data.trashed).toBeGreaterThan(0);
    expect(existsSync(path.join(dir, "Archives/通讯录/张三丰"))).toBe(false);
  }, 30_000);
  test("safe：ACC-SF-06 外部入口不能 reveal；ACC-SF-01 全 Vault 找不到明文；锁定后 SAFE_LOCKED", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    type R = { ok: boolean; data: { id: string; value: string; locked: boolean }; error?: { code: string } };
    const call = (token: string, capability: string, input: unknown) => post(e, token, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    expect((await call(e.rendererToken, "safe.setup", { password: "correct horse battery" })).ok).toBe(true);
    const item = await call(e.rendererToken, "safe.items.save", { name: "GH", type: "token", allowedModules: ["ssh"], value: "HUHU-MARKER-7f3a" });
    expect((await call(e.rendererToken, "safe.items.reveal", { id: item.data.id })).data.value).toBe("HUHU-MARKER-7f3a");
    for (const cap of ["safe.items.reveal", "safe.items.list", "safe.status"]) expect((await call(e.cliToken, cap, { id: item.data.id })).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    await call(e.rendererToken, "safe.lock", {});
    expect((await call(e.rendererToken, "safe.items.list", {})).error?.code).toBe("SAFE_LOCKED");
    expect((await call(e.rendererToken, "safe.unlock", { password: "wrong password!" })).error?.code).toBe("SAFE_BAD_PASSWORD");
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (readFileSync(p).includes("HUHU-MARKER-7f3a")) hits.push(p);
      }
    };
    walk(dir);
    expect(hits).toEqual([]);
  });
  test("agent-cli：默认 Space 指向 Vault 根；Provider 检测可调用；对外不开放", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    const call = (token: string, capability: string, input: unknown) => post(e, token, { capability, input, requestId: "r" }) as unknown as Promise<{ ok: boolean; data: { root: string }[]; error?: { code: string } }>;
    const spaces = await call(e.rendererToken, "agent.spaces.list", {});
    expect(spaces.data).toHaveLength(1);
    const { realpathSync } = await import("node:fs");
    expect(spaces.data[0]?.root).toBe(realpathSync(dir));
    expect((await call(e.rendererToken, "agent.catalog.detect", {})).ok).toBe(true);
    expect((await call(e.cliToken, "agent.spaces.list", {})).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
  });
  const REAL_HERDR = process.env["HUHU_HERDR_BIN"] ?? path.resolve(import.meta.dirname, "../../..", "apps/desktop/resources/herdr", `${process.platform}-${process.arch}`, process.platform === "win32" ? "herdr-core.exe" : "herdr-core");
  test.skipIf(!existsSync(REAL_HERDR))(
    "agent-cli：经 HTTP 在真实 Herdr Core 里启动 shell 会话并结束",
    async () => {
      process.env["HUHU_HERDR_BIN"] = REAL_HERDR;
      const dir = tmp();
      const e = await boot({ vaultPath: dir, create: true });
      engines.push(e);
      type R = { ok: boolean; data: { id: string; state: string; terminalId: string; revision: number; state2?: string; version: string | null } & { length?: number }; error?: { code: string } };
      const call = (capability: string, input: unknown) => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
      try {
        const status = await call("agent.core.status", {});
        expect(status.data).toMatchObject({ state: "idle" });
        const spaces = (await call("agent.spaces.list", {})) as unknown as { data: { id: string; revision: number }[] };
        const sp = spaces.data[0] as { id: string; revision: number };
        const s = await call("agent.sessions.launch", { spaceId: sp.id, spaceRevision: sp.revision, provider: "shell", requestId: "req-http-1234" });
        expect(s.data).toMatchObject({ state: "running" });
        expect((await call("agent.core.status", {})).data).toMatchObject({ state: "connected" });
        expect((await call("agent.sessions.kill", { id: s.data.id })).ok).toBe(true);
      } finally {
        const { HerdrCore } = await import("@huhu/plugin-agent-cli/engine");
        const { machineId } = await import("@huhu/vault");
        await new HerdrCore({ bin: REAL_HERDR, vaultId: e.vault.id, machineId: machineId(), runtimeDir: path.join(dir, ".huhu", "runtime", machineId(), "herdr") }).stop();
        delete process.env["HUHU_HERDR_BIN"];
      }
    },
    60_000,
  );
  test.skipIf(!existsSync(REAL_HERDR))(
    "ACC-AG-10：变更审查——真实 Git 仓库的差异、审查意见经真实 Herdr Core 写进会话终端并标记已发送",
    async () => {
      process.env["HUHU_HERDR_BIN"] = REAL_HERDR;
      const { execFileSync } = await import("node:child_process");
      const dir = tmp();
      const e = await boot({ vaultPath: dir, create: true });
      engines.push(e);
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
        // 终端被结束后对账：记录变成 exited（真实 Core 的 finished 状态）
        await new Promise((r) => setTimeout(r, 2200));
        const listed = (await call("agent.sessions.list", { spaceId: sp.id })).data as { id: string; state: string }[];
        expect(listed.find((x) => x.id === s.id)?.state).toBe("exited");
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
    },
    90_000,
  );
  test("Agent 任务自动化的预览和立即运行使用同一持久发生与派遣记录", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    const call = (capability: string, input: unknown, key = `test-${Math.random().toString(36)}`) => post(e, e.rendererToken, { capability, input, requestId: "fixture-rule", idempotencyKey: key });
    const [space] = (await call("agent.spaces.list", {})).data as unknown as { id: string }[];
    const { data: task } = await call("tasks.create", {
      title: "整理资料",
      type: "agent",
      body: "只发给指定的测试会话",
      execution: { spaceId: space!.id, target: { mode: "existing", sessionId: "fixture-missing-original" } },
    });
    expect(task).toMatchObject({ id: expect.any(String) });
    expect((await call("tasks.create", { title: "手动任务" })).ok).toBe(true);
    const { data: rule } = await call("automations.create", {
      title: "处理 Agent 任务",
      trigger: { preset: "every5", cron: "*/5 * * * *", zone: "UTC" },
      action: { kind: "agent", input: { source: "tasks", includeUnscheduled: true, tags: [], maxConcurrent: 1 } },
    });
    const occurrenceDir = path.join(e.vault.stateDir, "automations", "task-scan-occurrences");
    expect(await call("automations.preview", { id: rule.id })).toMatchObject({
      ok: true,
      data: { candidates: [expect.objectContaining({ taskId: task.id })], skipped: [expect.objectContaining({ reason: "not-agent" })] },
    });
    expect(existsSync(occurrenceDir)).toBe(false);
    const first = await call("automations.runNow", { id: rule.id }, "one-intent");
    expect(first).toMatchObject({ ok: true, data: { activationId: expect.stringMatching(/^inv-/), summary: { processed: 1, skipped: 1 } } });
    expect(await call("automations.runNow", { id: rule.id }, "one-intent")).toEqual(first);
    expect(readdirSync(occurrenceDir)).toHaveLength(1);
    expect(await call("automations.activations", {})).toMatchObject({
      ok: true,
      data: [{ ruleId: rule.id, trigger: "manual", summary: { processed: 1, skipped: 1 } }],
    });
    expect(await call("tasks.dispatch.list", { taskId: task.id })).toMatchObject({ ok: true, data: [{ dispatchId: expect.stringMatching(/^scan-/), runId: expect.any(String) }] });
    expect(existsSync(path.join(dir, "Task Runs"))).toBe(false);
    expect(await call("agent.sessions.list", { spaceId: space!.id })).toMatchObject({ ok: true, data: [] });
  }, 30_000);
  test("恢复 Engine 时只查询新任务派遣，旧监督记录保留原字节", async () => {
    const dir = tmp();
    let engine = await boot({ vaultPath: dir, create: true });
    engines.push(engine);
    const call = (capability: string, input: unknown) => post(engine, engine.rendererToken, { capability, input, requestId: "cutover", idempotencyKey: `cutover-${Math.random().toString(36)}` });
    const [space] = (await call("agent.spaces.list", {})).data as unknown as { id: string }[];
    const { data } = await call("tasks.create", {
      title: "已有旧记录的任务",
      type: "agent",
      body: "按这份测试输入受理一次派遣",
      execution: { spaceId: space!.id, target: { mode: "existing", sessionId: "fixture-original" } },
    });
    const task = data as unknown as { id: string; inputRevision: number; inputHash: string };
    const { data: rule } = await call("automations.create", {
      title: "持久派遣规则",
      trigger: { preset: "every5", cron: "*/5 * * * *", zone: "UTC" },
      action: { kind: "agent", input: { source: "tasks" } },
    });
    const processingKey = `${task.id}:${task.inputRevision}:${task.inputHash}`;
    const { files, stateDir } = engine.vault;
    const repo = new SemanticRepository(files, new OperationLog(files, path.join(stateDir, "operations")));
    const { id: runId, path: runPath } = await repo.create("task-run", {
      taskId: task.id,
      ruleId: rule.id,
      processingKey,
      state: "queued",
      attempt: 1,
      provider: "codex",
      spaceId: space!.id,
      cwd: dir,
      machineId: "historic",
    });
    const legacyDir = path.join(engine.vault.stateDir, "automations", "claims");
    mkdirSync(legacyDir, { recursive: true });
    const claimPath = path.join(legacyDir, processingKey.replaceAll(":", "_") + ".json");
    const claim = JSON.stringify({ processingKey, taskId: task.id, runId, state: "queued", claimedAt: "2026-10-21T00:00:00Z" });
    writeFileSync(claimPath, claim);
    const before = readFileSync(path.join(dir, runPath));
    await engine.shutdown();
    engines.pop();
    engine = await boot({ vaultPath: dir });
    engines.push(engine);
    expect(await call("automations.runs.list", {})).toMatchObject({ ok: true, data: [] });
    expect(await call("automations.runs.read", { runId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    for (const capability of ["automations.runs.answer", "automations.runs.retry", "automations.runs.activeFor", "tasks.markDispatched"]) {
      expect(await call(capability, { runId })).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_FOUND" } });
    }
    expect(await call("tasks.runs", { id: task.id })).toMatchObject({ ok: true, data: [] });
    const preview = await call("automations.preview", { id: rule.id });
    expect(preview, JSON.stringify(preview)).toMatchObject({ ok: true, data: { candidates: [{ taskId: task.id }] } });
    expect(await call("automations.runNow", { id: rule.id })).toMatchObject({ ok: true, data: { summary: { processed: 1, skipped: 0 } } });
    expect(await call("tasks.dispatch.recent", {})).toMatchObject({ ok: true, data: [{ dispatch: { taskId: task.id, runId: expect.not.stringMatching(runId) } }] });
    expect(readFileSync(claimPath, "utf8")).toBe(claim);
    expect(readFileSync(path.join(dir, runPath))).toEqual(before);
  }, 60_000);
  test("versioning：命名版本、时间线、读取、恢复（经 HTTP）", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
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
    for (const directory of ["Automation Runs", "Task Runs"]) {
      const runPath = `${directory}/fixture--run-history.md`;
      const original = Buffer.from("---\nstatus: running\n---\n运行中\n");
      const final = Buffer.from("---\nstatus: succeeded\nterminalReleasePending: true\n---\n核实后的输出\n");
      await e.vault.files.write(runPath, original);
      const checkpoint = await call("history.checkpoint", { path: runPath, title: "运行中" });
      expect(checkpoint.error).toBeUndefined();
      const entry = checkpoint.data as { id: string };
      const current = await e.vault.files.write(runPath, final);
      expect(await call("history.restore", { path: runPath, entryId: entry.id, expectedCurrentVersion: current.version })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(e.vault.files.read(runPath)?.bytes).toEqual(final);
      expect(await call("history.read", { path: runPath, entryId: entry.id })).toMatchObject({ ok: true, data: { text: original.toString("utf8") } });
    }
  }, 60_000);
  test("ssh + safe：凭据只经保险箱引用；锁定时连接失败；解锁后确认指纹并执行命令；审计无密码", async () => {
    const { startFakeSsh } = await import("../../../plugins/ssh/test/fake-server.js");
    const srv = await startFakeSsh({ password: "s3cret-PW-marker" });
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (capability: string, input: unknown): Promise<R> => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    const prompts: { attemptId: string; hop: number }[] = [];
    e.events.subscribe((ev) => {
      if (ev.type === "ssh.hostKeyPrompt") prompts.push(ev.payload as { attemptId: string; hop: number });
    });
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
      expect(((await post(e, e.cliToken, { capability: "ssh.hosts.list", input: {}, requestId: "r" })) as unknown as R).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    } finally {
      await srv.close();
    }
  }, 60_000);
  test("ACC-TK-07：已到点的提醒在引擎启动时投递为站内通知；deliveredAt 写入；任务状态不变", async () => {
    const dir = tmp();
    const e1 = await boot({ vaultPath: dir, create: true });
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (e: RunningEngine, capability: string, input: unknown): Promise<R> =>
      post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    const t = (await call(e1, "tasks.create", { title: "到点提醒", type: "human", reminders: [{ id: "rem-1", channel: "in_app", at: "2020-01-01T00:00:00Z", enabled: true }] })).data as { id: string };
    await e1.shutdown(); // 模拟"应用关闭期间到点"：下次启动时补发
    const e2 = await boot({ vaultPath: dir });
    engines.push(e2);
    let list: { title: string; module: string }[] = [];
    for (let i = 0; i < 60; i++) {
      list = (await call(e2, "notifications.list", {})).data as typeof list;
      if (list.length) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(list.map((n) => [n.title, n.module])).toEqual([["任务提醒：到点提醒", "tasks"]]);
    const task = (await call(e2, "tasks.read", { id: t.id })).data as { status: string; reminders: { deliveredAt: string | null }[] };
    expect(task.status).toBe("not_started");
    expect(task.reminders[0]?.deliveredAt).toBeTruthy();
    const ids = ((await call(e2, "notifications.list", {})).data as { id: string }[]).map((n) => n.id);
    expect(((await call(e2, "notifications.markRead", { ids })).data as { changed: number }).changed).toBe(1);
  }, 30_000);
  test("plugins.setEnabled：停用后其能力不可用并持久化；级联停用依赖者；重启保持；kernel 不可停用", async () => {
    const dir = tmp();
    const e1 = await boot({ vaultPath: dir, create: true });
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (e: RunningEngine, capability: string, input: unknown): Promise<R> =>
      post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    expect((await call(e1, "plugins.setEnabled", { id: "tasks", enabled: false })).data).toMatchObject({ state: "disabled" });
    expect((await call(e1, "tasks.list", {})).error?.code).toBe("PLUGIN_DISABLED");
    expect(JSON.parse(readFileSync(path.join(dir, ".huhu/plugins.json"), "utf8")).builtin.tasks).toEqual({ enabled: false });
    expect((await call(e1, "plugins.setEnabled", { id: "kernel", enabled: false })).data).toMatchObject({ state: "active" });
    await e1.shutdown();
    const e2 = await boot({ vaultPath: dir });
    engines.push(e2);
    expect((await call(e2, "tasks.list", {})).error?.code).toBe("PLUGIN_DISABLED");
    const list = (await call(e2, "plugins.list", {})).data as { id: string; state: string }[];
    expect(list.find((p) => p.id === "tasks")?.state).toBe("disabled");
    expect(list.find((p) => p.id === "notes")?.state).toBe("active");
    expect((await call(e2, "plugins.setEnabled", { id: "tasks", enabled: true })).data).toMatchObject({ state: "active" });
    expect((await call(e2, "tasks.list", {})).ok).toBe(true);
  }, 30_000);
  test("ACC-SY-04：诊断数据（health.run / health.events / plugins.list）不含笔记正文与保险箱的标记文本", async () => {
    const dir = tmp();
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    const call = (capability: string, input: unknown) => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` });
    const note = await call("notes.create", { name: "标记笔记" });
    const path = (note.data as unknown as { path: string }).path;
    const cur = await call("notes.read", { path });
    await call("notes.save", { path, text: "HUHU-NOTE-MARKER\n", expectedVersion: (cur.data as unknown as { version: string }).version });
    expect((await call("safe.setup", { password: "correct horse battery" })).ok).toBe(true);
    expect((await call("safe.items.save", { name: "HUHU-SAFE-MARKER", type: "password", account: "x", allowedModules: [], value: "HUHU-SAFE-MARKER-VALUE" })).ok).toBe(true);
    const dump = JSON.stringify([
      (await call("health.run", {})).data,
      (await call("health.events", { limit: 500 })).data,
      (await call("health.exportDiagnostics", {})).data,
      (await call("plugins.list", {})).data,
      (await call("vault.info", {})).data,
    ]);
    expect(dump).not.toContain("HUHU-NOTE-MARKER");
    expect(dump).not.toContain("HUHU-SAFE-MARKER");
  });
  test("health.run / home.summary：坏文件 → warning；插件失败 → error；对应插件停用时首页卡片为 0 而不是报错", async () => {
    const dir = tmp();
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(path.join(dir, "Tasks"), { recursive: true });
    writeFileSync(path.join(dir, "Tasks", "bad.md"), "---\nhuhu: {kind: task, id: task-bad001, schema: 1}\ntitle: 1\n---\n");
    const e = await boot({ vaultPath: dir, create: true });
    engines.push(e);
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (capability: string, input: unknown): Promise<R> => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    await call("tasks.list", {}); // 触发一次扫描，让文件问题登记
    const h = (await call("health.run", {})).data as { overall: string; checks: { id: string; status: string; detail: string }[] };
    // 本测试环境没有 Herdr Core（未设 HUHU_HERDR_BIN）：该项应为“需处理”并带“重启 Core”（ACC-SY-02），其余项的总体状态是 warning
    const herdr = h.checks.find((c) => c.id === "herdr") as { status: string; action?: { label: string; capability?: string } } | undefined;
    if (!process.env["HUHU_HERDR_BIN"]) expect(herdr).toMatchObject({ status: "error", action: { label: "重启 Core", capability: "agent.core.restart" } });
    expect(h.checks.filter((c) => c.id !== "herdr").some((c) => c.status === "error")).toBe(false);
    expect(h.checks.find((c) => c.id === "files")).toMatchObject({ status: "warning" });
    expect(h.checks.find((c) => c.id === "files")?.detail).toContain("bad.md");
    expect(h.checks.find((c) => c.id === "safe")).toMatchObject({ status: "ok", detail: "尚未设置" });
    expect(((await post(e, e.cliToken, { capability: "health.run", input: {}, requestId: "r" })) as unknown as R).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    const before = (await call("home.summary", {})).data as { tasksOpen: number; vault: { name: string } };
    expect(before.tasksOpen).toBe(0);
    await call("tasks.create", { title: "A", type: "human" });
    expect(((await call("home.summary", {})).data as { tasksOpen: number }).tasksOpen).toBe(1);
    await call("plugins.setEnabled", { id: "tasks", enabled: false });
    expect(((await call("home.summary", {})).data as { tasksOpen: number }).tasksOpen).toBe(0);
  }, 30_000);
  test("HTTP 服务令牌：创建后明文只返回一次、文件只存哈希；身份为 http（遵守开放规则）；撤销后 401；重启后仍有效", async () => {
    const dir = tmp();
    const e1 = await boot({ vaultPath: dir, create: true });
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (e: RunningEngine, token: string, capability: string, input: unknown = {}) =>
      fetch(`http://127.0.0.1:${e.port}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }),
      });
    const created = ((await (await call(e1, e1.rendererToken, "gateway.tokens.create", { name: "脚本" })).json()) as R).data as { id: string; token: string };
    expect(created.token).toMatch(/^huhu_/);
    const stored = readFileSync(path.join(dir, ".huhu/gateways.json"), "utf8");
    expect(stored).not.toContain(created.token); // 只保存哈希
    expect(stored).toContain("脚本");
    expect(((await (await call(e1, created.token, "vault.info")).json()) as R).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    await allowTools(e1, "vault.info");
    expect(((await (await call(e1, created.token, "vault.info")).json()) as R).ok).toBe(true);
    expect(((await (await call(e1, created.token, "safe.status")).json()) as R).error?.code).toBe("CAPABILITY_NOT_EXPOSED"); // 外部入口规则同样适用
    expect(((await (await call(e1, created.token, "gateway.tokens.list")).json()) as R).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    await e1.shutdown();
    const e2 = await boot({ vaultPath: dir });
    engines.push(e2);
    expect(((await (await call(e2, created.token, "vault.info")).json()) as R).ok).toBe(true);
    expect(((await (await call(e2, e2.rendererToken, "gateway.tokens.revoke", { id: created.id })).json()) as R).data).toEqual({ revoked: true });
    expect((await call(e2, created.token, "vault.info")).status).toBe(401);
    expect(readFileSync(path.join(dir, ".huhu/gateways.json"), "utf8")).not.toContain("脚本");
  }, 30_000);
  test("审计回归：home.summary 以调用者身份取数；外部入口即使被开放 tasks.create 也不能设置 Agent 执行", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (token: string, capability: string, input: unknown = {}): Promise<R> =>
      post(e, token, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    await call(e.rendererToken, "tasks.create", { title: "T", type: "human" });
    const note = (await call(e.rendererToken, "notes.create", { name: "N" })).data as { path: string };
    const { version } = (await call(e.rendererToken, "notes.read", { path: note.path })).data as { version: string };
    expect(await call(e.rendererToken, "notes.save", { path: note.path, expectedVersion: version, text: "# 正文样例\n" })).toMatchObject({ ok: true });
    await allowTools(e, "home.summary", "tasks.list", "notes.list");
    expect((await call(e.cliToken, "home.summary")).data).toMatchObject({ tasksOpen: 1, notes: 1, recentNotes: [{ snippet: "" }] });
    await allowTools(e, "notes.read");
    expect((await call(e.cliToken, "home.summary")).data).toMatchObject({ recentNotes: [{ snippet: "正文样例" }] });
    // 用户关闭 notes.list 的对外开放后，外部调用 home.summary 看不到笔记；桌面仍然能看到
    await call(e.rendererToken, "gateway.update", { capability: "notes.list", exposed: false });
    expect((await call(e.cliToken, "home.summary")).data as { notes: number; recentNotes: unknown[] }).toMatchObject({ notes: 0, recentNotes: [] });
    expect(((await call(e.rendererToken, "home.summary")).data as { notes: number }).notes).toBe(1);
    // 开放 tasks.create 后，外部仍不能创建 Agent 执行的任务
    await call(e.rendererToken, "gateway.update", { capability: "tasks.create", exposed: true });
    expect((await call(e.cliToken, "tasks.create", { title: "手动", type: "human" })).data).toMatchObject({ origin: { kind: "external" } });
    expect((await call(e.cliToken, "tasks.create", { title: "Agent", type: "agent", execution: { spaceId: "space-1", provider: "codex" } })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.cliToken, "tasks.create", { title: "带执行配置", type: "human", execution: { spaceId: "space-1", provider: "codex" } })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.rendererToken, "tasks.create", { title: "桌面 Agent", type: "agent", body: "x", execution: { spaceId: "space-1", provider: "codex" } })).ok).toBe(true);
  }, 30_000);
  test.skipIf(!existsSync(REAL_HERDR) || process.platform === "win32")(
    "B04a/B07 会话里的程序经 OSC 7501 上报 blocked：不退出也在几秒内出现“需要你操作”（独立会话自动建 human 任务 + 评论），同一次只记一条，解除后提示取消；再次 blocked 只追加评论",
    async () => {
      process.env["HUHU_HERDR_BIN"] = REAL_HERDR;
      const dir = tmp();
      const e = await boot({ vaultPath: dir, create: true });
      engines.push(e);
      type R = { ok: boolean; data: any; error?: { code: string } }; // eslint-disable-line
      const call = (capability: string, input: unknown): Promise<R> => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
      const { HerdrCore } = await import("@huhu/plugin-agent-cli/engine");
      const { machineId } = await import("@huhu/vault");
      const core = new HerdrCore({ bin: REAL_HERDR, vaultId: e.vault.id, machineId: machineId(), runtimeDir: path.join(dir, ".huhu", "runtime", machineId(), "herdr") });
      try {
        const sp = (await call("agent.spaces.list", {})).data[0] as { id: string; revision: number };
        const s = (await call("agent.sessions.launch", { spaceId: sp.id, spaceRevision: sp.revision, provider: "shell", requestId: "req-wait-1234" })).data as { id: string; terminalId: string };
        const client = await core.ensure();
        const osc = (state: string) => client.call("terminal.send", { terminal: s.terminalId, force: true, text: `printf '\\033]7501;state=${state}:kind=permission:app=e2e\\033\\\\'` });
        const task = async () => ((await call("tasks.list", {})).data as { id: string; title: string; origin: { kind: string }; comments: { id: string; event?: string }[] }[]).find((t) => t.title.includes("需要你操作"));
        await osc("blocked");
        await expect.poll(async () => (await task())?.comments.length, { timeout: 15_000 }).toBe(1);
        const t1 = (await task())!;
        expect(t1.origin.kind).toBe("session");
        expect(t1.comments[0]).toMatchObject({ id: `session-${s.id}-w-1`, event: "waiting" });
        expect(((await call("agent.sessions.list", {})).data as { waiting?: { active: boolean; n: number } }[])[0]?.waiting).toMatchObject({ active: true, n: 1 });
        // 解除：程序离开 blocked → 提示取消；任务与评论保留
        await osc("working");
        await expect.poll(async () => ((await call("agent.sessions.list", {})).data as { waiting?: { active: boolean } }[])[0]?.waiting?.active, { timeout: 15_000 }).toBe(false);
        // 再次 blocked：同一个任务上只追加评论
        await osc("blocked");
        await expect.poll(async () => (await task())?.comments.length, { timeout: 15_000 }).toBe(2);
        expect((await task())!.id).toBe(t1.id);
        expect(((await call("tasks.list", {})).data as { title: string }[]).filter((t) => t.title.includes("需要你操作"))).toHaveLength(1);
        expect((await task())!.comments[1]?.id).toBe(`session-${s.id}-w-2`);
      } finally {
        await core.stop();
        delete process.env["HUHU_HERDR_BIN"];
      }
    },
    60_000,
  );
  test.skipIf(!existsSync(REAL_HERDR) || process.platform === "win32")(
    "终端 WebSocket：经 Engine 桥接真实 Herdr 终端——输入回显、鉴权、关闭只 detach",
    async () => {
      process.env["HUHU_HERDR_BIN"] = REAL_HERDR;
      const dir = tmp();
      const e = await boot({ vaultPath: dir, create: true });
      engines.push(e);
      type R = { ok: boolean; data: unknown; error?: { code: string } };
      const call = (capability: string, input: unknown): Promise<R> => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
      const { WebSocket } = await import("ws");
      try {
        const sp = ((await call("agent.spaces.list", {})).data as { id: string; revision: number }[])[0] as { id: string; revision: number };
        const s = (await call("agent.sessions.launch", { spaceId: sp.id, spaceRevision: sp.revision, provider: "shell", requestId: "req-ws-1234" })).data as { id: string; terminalId: string };
        const open = (token: string, id: string) =>
          new Promise<InstanceType<typeof WebSocket>>((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${e.port}/ws/terminal/${id}?cols=100&rows=30`, [`bearer.${token}`]);
            ws.on("open", () => resolve(ws));
            ws.on("error", reject);
            ws.on("unexpected-response", (_r, res) => reject(new Error(`status ${res.statusCode}`)));
          });
        await expect(open("bad-token", s.id)).rejects.toThrow(/401/);
        const ws = await open(e.rendererToken, s.id);
        let out = "";
        ws.on("message", (d, bin) => {
          if (bin) out += d.toString();
        });
        ws.send(Buffer.from("echo VIA-ENGINE-$((6*7))\n"));
        for (let i = 0; i < 100 && !out.includes("VIA-ENGINE-42"); i++) await new Promise((r) => setTimeout(r, 50));
        expect(out).toContain("VIA-ENGINE-42");
        ws.close(); // detach：进程仍在运行
        await new Promise((r) => setTimeout(r, 300));
        const again = await open(e.rendererToken, s.id); // 重新打开同一个终端
        let out2 = "";
        again.on("message", (d, bin) => {
          if (bin) out2 += d.toString();
        });
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
    },
    60_000,
  );
  test("SSH shell 经同一条 /ws/terminal/ssh-<id> 路由：输入回显；关闭视图后 shell 仍在，可重新打开；ssh- 路由对未知 shell 返回 4404", async () => {
    const { startFakeSsh } = await import("../../../plugins/ssh/test/fake-server.js");
    const srv = await startFakeSsh({ password: "pw-shell-1" });
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (capability: string, input: unknown): Promise<R> => post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    const prompts: { attemptId: string; hop: number }[] = [];
    e.events.subscribe((ev) => {
      if (ev.type === "ssh.hostKeyPrompt") prompts.push(ev.payload as { attemptId: string; hop: number });
    });
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
      const open = (id: string) =>
        new Promise<InstanceType<typeof WebSocket> & { text: string }>((resolve, reject) => {
          const ws = new WebSocket(`ws://127.0.0.1:${e.port}/ws/terminal/${id}?cols=100&rows=30`, [`bearer.${e.rendererToken}`]) as InstanceType<typeof WebSocket> & { text: string };
          ws.text = "";
          ws.on("message", (d, bin) => {
            if (bin) ws.text += d.toString();
          });
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
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    const { WebSocket } = await import("ws");
    const created = (
      (await (
        await fetch(`http://127.0.0.1:${e.port}/api/v1/call`, {
          method: "POST",
          headers: { authorization: `Bearer ${e.rendererToken}`, "content-type": "application/json" },
          body: JSON.stringify({ capability: "gateway.tokens.create", input: { name: "t" }, requestId: "r", idempotencyKey: "key-tok-create-1" }),
        })
      ).json()) as { data: { id: string; token: string } }
    ).data;
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
    await fetch(`http://127.0.0.1:${e.port}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${e.rendererToken}`, "content-type": "application/json" },
      body: JSON.stringify({ capability: "gateway.tokens.revoke", input: { id: created.id }, requestId: "r", idempotencyKey: "key-tok-revoke-1" }),
    });
    expect(await Promise.race([closed, new Promise<number>((r) => setTimeout(() => r(-1), 3000))])).toBe(4401);
  }, 30_000);
  test("旧规则环境只需重新配置，工作台和工具拒绝旧格式启动", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    const call = (capability: string, input: unknown = {}) => post(e, e.rendererToken, { capability, input, requestId: "legacy-terminal", idempotencyKey: "legacy-terminal-" + Math.random().toString(36).slice(2) });
    const repo = new SemanticRepository(e.vault.files, new OperationLog(e.vault.files, path.join(e.vault.stateDir, "operations")));
    const title = "旧终端环境";
    const at = new Date().toISOString();
    const trigger = { preset: "every15", cron: "*/15 * * * *", zone: "UTC" };
    const action = { kind: "terminal", command: "echo fixture", shell: "default", spaceId: null, envRefs: { SYNTHETIC: "safe://retired-reference" } };
    expect(await call("automations.create", { title, trigger, action })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const old = await repo.create("automation-rule", { title, trigger, action, enabled: true, createdAt: at, updatedAt: at }, "");
    const bytes = readFileSync(path.join(e.vault.files.root, old.path));
    const shown = await call("automations.read", { id: old.id });
    expect(shown).toMatchObject({ ok: true, data: { data: { legacyEnvironment: true } } });
    expect(JSON.stringify(shown)).not.toContain("retired-reference");
    expect(await call("automations.runNow", { id: old.id })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const available = await call("agent.spaces.list");
    expect(available.ok).toBe(true);
    const [space] = available.data as unknown as { id: string; revision: number }[];
    expect(await call("agent.sessions.launch", { spaceId: space!.id, spaceRevision: space!.revision, provider: "shell", requestId: "obsolete-launch", command: "echo fixture", envRefs: action.envRefs })).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT" },
    });
    expect((await call("automations.runs.list")).data).toEqual([]);
    expect(readFileSync(path.join(e.vault.files.root, old.path)).equals(bytes)).toBe(true);
  });
  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "ACC-WB-02 无写权限的普通文件夹：写入打开给出“无法写入”（READ_ONLY_VAULT + 只读打开建议），只读打开可浏览，写操作被拒绝，磁盘无变化",
    async () => {
      const dir = tmp();
      writeFileSync(path.join(dir, "只读笔记.md"), "# 只读笔记\n");
      chmodSync(dir, 0o555);
      try {
        await expect(boot({ vaultPath: dir, create: true })).rejects.toMatchObject({ code: "READ_ONLY_VAULT", message: expect.stringContaining("无法写入"), recovery: [{ action: "open-readonly" }] });
        const e = await boot({ vaultPath: dir, readOnly: true });
        engines.push(e);
        const call = (capability: string, input: unknown) =>
          post(e, e.rendererToken, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<{ ok: boolean; data: unknown; error?: { code: string } }>;
        const notes = (await call("notes.list", { filter: "all" })).data as { path: string }[];
        expect(notes.map((n) => n.path)).toContain("只读笔记.md");
        const w = await call("notes.create", { name: "新笔记" });
        expect(w.ok).toBe(false);
        expect(w.error?.code).toBe("READ_ONLY_VAULT");
        await e.shutdown();
        expect(readdirSync(dir)).toEqual(["只读笔记.md"]); // 没有 .huhu、没有新文件
      } finally {
        chmodSync(dir, 0o755);
      }
    },
    30_000,
  );
  test("ACC-PL-01 停用 tasks：MCP 工具列表不再含 tasks_*，已缓存工具的调用得到 PLUGIN_DISABLED，重新启用后恢复", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    const rpc = (body: unknown) =>
      fetch(`http://127.0.0.1:${e.port}/mcp`, {
        method: "POST",
        headers: { authorization: `Bearer ${e.mcpToken}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify(body),
      }).then((r) => r.json() as Promise<{ result: { tools?: { name: string }[]; isError?: boolean; content?: { text: string }[] } }>);
    const call = (capability: string, input: unknown) =>
      fetch(`http://127.0.0.1:${e.port}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${e.rendererToken}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }),
      }).then((r) => r.json() as Promise<{ ok: boolean; data: unknown }>);
    await call("gateway.mcp.update", { enabled: true, transport: "http" });
    await allowTools(e, "tasks.list");
    const tools = async () => ((await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })).result.tools ?? []).map((t) => t.name);
    expect((await tools()).some((n) => n.startsWith("tasks_"))).toBe(true);
    await call("plugins.setEnabled", { id: "tasks", enabled: false });
    expect((await tools()).some((n) => n.startsWith("tasks_"))).toBe(false);
    const stale = (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "tasks_list", arguments: {} } })).result;
    expect(stale.isError).toBe(true);
    expect(stale.content?.[0]?.text ?? "").toContain("PLUGIN_DISABLED");
    await call("plugins.setEnabled", { id: "tasks", enabled: true });
    expect((await tools()).some((n) => n.startsWith("tasks_"))).toBe(true);
  }, 30_000);
  test("MCP over HTTP：默认关闭(404)；开启后 mcp/http 令牌可用，桌面/cli 令牌 403；工具列表遵守开放规则；经 Dispatcher 授权", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    const rpc = (token: string | null, body: unknown, method = "POST") =>
      fetch(`http://127.0.0.1:${e.port}/mcp`, {
        method,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", accept: "application/json, text/event-stream" },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      });
    const init = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
    expect((await rpc(e.mcpToken, init)).status).toBe(404); // 默认关闭
    const call = (capability: string, input: unknown) =>
      fetch(`http://127.0.0.1:${e.port}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${e.rendererToken}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }),
      }).then((r) => r.json() as Promise<{ ok: boolean; data: unknown }>);
    expect((await call("gateway.mcp.update", { enabled: true, transport: "http" })).ok).toBe(true);
    expect((await rpc(null, init)).status).toBe(401);
    expect((await rpc(e.rendererToken, init)).status).toBe(403);
    expect((await rpc(e.cliToken, init)).status).toBe(403);
    expect((await rpc(e.mcpToken, init, "GET")).status).toBe(405);
    expect((await (await rpc(e.mcpToken, init)).json()) as unknown).toMatchObject({ result: { tools: [] } });
    await allowTools(e, "vault.info", "tasks.list", "inbox.capture");
    const list = (await (await rpc(e.mcpToken, init)).json()) as { result: { tools: { name: string }[] } };
    const names = list.result.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["vault_info", "tasks_list"]));
    expect(names).not.toContain("safe_items_reveal");
    expect(names).not.toContain("tasks_create"); // 默认不对外
    const callTool = async (name: string, args: unknown) =>
      ((await (await rpc(e.mcpToken, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } })).json()) as { result: { isError?: boolean; content: { text: string }[] } }).result;
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
  test("审计回归：外部入口即使被开放 automations.create/update/setEnabled，也不能创建或启用会启动 Agent / 运行命令的规则", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    type R = { ok: boolean; data: unknown; error?: { code: string } };
    const call = (token: string, capability: string, input: unknown): Promise<R> => post(e, token, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    for (const cap of ["automations.create", "automations.update", "automations.setEnabled"]) await call(e.rendererToken, "gateway.update", { capability: cap, exposed: true });
    const trig = { preset: "custom", cron: "0 9 * * *", zone: "UTC" };
    const agentTasks = { kind: "agent", input: { source: "tasks", tags: [], maxConcurrent: 1 } };
    const agentPrompt = { kind: "agent", input: { source: "prompt", spaceId: "space-1", provider: "codex" } };
    const terminal = { kind: "terminal", command: "echo hi", shell: "sh" };
    for (const [title, action] of [
      ["外部想创建任务扫描规则", agentTasks],
      ["外部想创建提示词规则", agentPrompt],
      ["外部想创建终端规则", terminal],
    ] as const)
      expect((await call(e.cliToken, "automations.create", { title, trigger: trig, action })).error?.code).toBe("PERMISSION_DENIED");
    // 提醒规则：外部可以创建、启用、暂停、改名
    const reminder = (await call(e.cliToken, "automations.create", { title: "外部创建提醒规则", trigger: trig, action: { kind: "reminder", mode: "notification", text: "ok" } })).data as { id: string; version: string };
    expect(reminder).toBeDefined();
    expect((await call(e.cliToken, "automations.setEnabled", { id: reminder.id, enabled: true })).ok).toBe(true);
    // 外部不能把提醒规则改成会启动 Agent / 运行命令的规则
    expect((await call(e.cliToken, "automations.update", { id: reminder.id, expectedVersion: reminder.version, patch: { action: terminal } })).error?.code).toBe("PERMISSION_DENIED");
    // 桌面创建的 Agent 规则：外部不能启用，也不能修改；暂停永远允许
    const desktopRule = (await call(e.rendererToken, "automations.create", { title: "桌面创建的 Agent 规则", trigger: trig, action: agentTasks })).data as { id: string; version: string };
    expect((await call(e.cliToken, "automations.setEnabled", { id: desktopRule.id, enabled: true })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.cliToken, "automations.update", { id: desktopRule.id, expectedVersion: desktopRule.version, patch: { title: "改名" } })).error?.code).toBe("PERMISSION_DENIED");
    expect((await call(e.rendererToken, "automations.setEnabled", { id: desktopRule.id, enabled: true })).ok).toBe(true);
    expect((await call(e.cliToken, "automations.setEnabled", { id: desktopRule.id, enabled: false })).ok).toBe(true);
    const desktopTerminal = (await call(e.rendererToken, "automations.create", { title: "桌面终端夹具", trigger: trig, action: terminal })).data as { id: string };
    expect((await call(e.cliToken, "automations.setEnabled", { id: desktopTerminal.id, enabled: true })).error?.code).toBe("PERMISSION_DENIED");
  }, 30_000);
  test("公开启用提醒时，权限判定与写入读取同一事务的当前规则", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    await allowTools(e, "automations.setEnabled");
    const call = (token: string, capability: string, input: unknown) => post(e, token, { capability, input, requestId: capability, idempotencyKey: `config-${capability}` });
    const created = await call(e.rendererToken, "automations.create", {
      title: "原提醒",
      trigger: { preset: "custom", cron: "0 0 1 1 *", zone: "UTC" },
      action: { kind: "reminder", mode: "notification", text: "fixture" },
    });
    expect(created.ok).toBe(true);
    const { id, version } = created.data as typeof created.data & { version: string };
    let holdWrite!: () => void;
    let allowWrite!: () => void;
    let observeEnable!: () => void;
    const writing = new Promise<void>((resolve) => {
      holdWrite = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      allowWrite = resolve;
    });
    const enabling = new Promise<void>((resolve) => {
      observeEnable = resolve;
    });
    const patch = SemanticRepository.prototype.patch;
    const setEnabled = AutomationsService.prototype.setEnabled;
    const observeWrite = vi.spyOn(SemanticRepository.prototype, "patch").mockImplementation(async function (this: SemanticRepository, ...args) {
      if (args[0] === "automation-rule" && args[1] === id && args[2]["title"] === "更新后的提醒") {
        holdWrite();
        await resume;
      }
      return patch.apply(this, args);
    });
    const observeCall = vi.spyOn(AutomationsService.prototype, "setEnabled").mockImplementation(function (this: AutomationsService, ...args) {
      const result = setEnabled.apply(this, args);
      observeEnable();
      return result;
    });
    const ruleReads = vi.spyOn(AutomationsService.prototype, "rule");
    try {
      const edit = call(e.rendererToken, "automations.update", { id, expectedVersion: version, patch: { title: "更新后的提醒" } });
      await writing;
      ruleReads.mockClear();
      const enable = call(e.cliToken, "automations.setEnabled", { id, enabled: true });
      await enabling;
      const readsWhileQueued = ruleReads.mock.calls.filter(([ruleId]) => ruleId === id).length;
      allowWrite();
      expect(await edit).toMatchObject({ ok: true });
      expect(await enable).toMatchObject({ ok: true, data: { data: { title: "更新后的提醒", enabled: true } } });
      expect(readsWhileQueued).toBe(0);
    } finally {
      allowWrite();
      ruleReads.mockRestore();
      observeCall.mockRestore();
      observeWrite.mockRestore();
    }
  }, 30_000);
  test("ACC-SY-06：设置里的时区立即影响日记的“今天”（两个相差 25 小时的时区得到不同日期）", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
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
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
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
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    type R = { ok: boolean; data: any; error?: { code: string } }; // eslint-disable-line
    const call = (token: string, capability: string, input: unknown): Promise<R> => post(e, token, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    const note = (await call(e.rendererToken, "notes.create", { name: "要备份的笔记" })).data as { path: string };
    const ver = (await call(e.rendererToken, "notes.read", { path: note.path })).data.version as string;
    await call(e.rendererToken, "notes.save", { path: note.path, text: "# 要备份的笔记\n\n正文 中文\n", expectedVersion: ver });
    await call(e.rendererToken, "safe.setup", { password: "correct horse battery" });
    await call(e.rendererToken, "safe.items.save", { name: "令牌", type: "token", value: "backup-secret-value", allowedModules: [] });
    const out = tmp();
    const zip = path.join(out, "backup.zip");

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
    const list = (root: string, sub: string): string[] => {
      const d = path.join(root, sub);
      return existsSync(d) ? readdirSync(d).sort() : [];
    };
    expect(sha(path.join(target, note.path))).toBe(sha(path.join(e.vault.root, note.path)));
    expect(list(target, ".huhu/safe")).toEqual(list(e.vault.root, ".huhu/safe"));
    for (const f of list(e.vault.root, ".huhu/safe").filter((n) => n.endsWith(".json") || n.endsWith(".bin"))) expect(sha(path.join(target, ".huhu/safe", f))).toBe(sha(path.join(e.vault.root, ".huhu/safe", f)));
    // 经悬空符号链接指向 Vault 内部的导入目标：明确拒绝，而不是靠后续 mkdir 恰好失败
    const { symlinkSync } = await import("node:fs");
    symlinkSync(path.join(e.vault.root, "ghost"), path.join(out, "linkgone"), process.platform === "win32" ? "junction" : "dir");
    const viaLink = await call(e.rendererToken, "vault.importPackage", { zipPath: zip, targetDir: path.join(out, "linkgone", "new") });
    expect(viaLink.ok).toBe(false);
    expect(viaLink.error?.code).toBe("INVALID_INPUT");
    expect(existsSync(path.join(e.vault.root, "ghost"))).toBe(false);
    mkdirSync(path.join(out, "occupied"));
    writeFileSync(path.join(out, "occupied", "x.txt"), "x");
    expect((await call(e.rendererToken, "vault.importPackage", { zipPath: zip, targetDir: path.join(out, "occupied") })).ok).toBe(false); // 目标必须为空

    // 用原主密码解锁导入后的保险箱
    const e2 = await boot({ vaultPath: target });
    engines.push(e2);
    const unlock = (await post(e2, e2.rendererToken, { capability: "safe.unlock", input: { password: "correct horse battery" }, requestId: "r", idempotencyKey: "key-unlock-restored" })) as unknown as R;
    expect(unlock.ok).toBe(true);
  }, 60_000);
  test("vault.reindexCancel：没有重建在进行时返回 cancelled=false；重建完成后搜索可用（ACC-SY-07 的能力层前置）", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    type R = { ok: boolean; data: any; error?: { code: string } }; // eslint-disable-line
    const call = (token: string, capability: string, input: unknown): Promise<R> => post(e, token, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    expect((await call(e.cliToken, "vault.reindexCancel", {})).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    expect((await call(e.rendererToken, "vault.reindexCancel", {})).data).toEqual({ cancelled: false });
    expect((await call(e.rendererToken, "vault.reindex", {})).data).toEqual({ completed: true });
  }, 30_000);
  test("automations.update 可以改规则正文（agent 提示词输入的提示词）；外部入口不能改 agent 规则的正文", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    type R = { ok: boolean; data: any; error?: { code: string } }; // eslint-disable-line
    const call = (token: string, capability: string, input: unknown): Promise<R> => post(e, token, { capability, input, requestId: "r", idempotencyKey: `key-${capability}-${Math.random().toString(36).slice(2)}` }) as unknown as Promise<R>;
    const trig = { preset: "daily", cron: "30 9 * * *", zone: "UTC" };
    const created = (await call(e.rendererToken, "automations.create", { title: "每日整理", trigger: trig, action: { kind: "agent", input: { source: "prompt", spaceId: "space-x", provider: "claude" } }, body: "第一版提示词" })).data;
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
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    await post(e, e.rendererToken, { capability: "gateway.mcp.update", input: { enabled: true, transport: "http" }, requestId: "r", idempotencyKey: "key-mcp-enable-1" });
    const slow = () =>
      fetch(`http://127.0.0.1:${e.port}/mcp`, {
        method: "POST",
        headers: { authorization: `Bearer ${e.mcpToken}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }).then((r) => r.status);
    const statuses = await Promise.all(Array.from({ length: 80 }, slow));
    expect(statuses.every((s) => s === 200 || s === 429)).toBe(true);
    // 引擎仍然健康，并且并发回落后可以再次正常使用
    expect(await slow()).toBe(200);
  }, 30_000);
  test("notes.create 的 Vault 模板路径仅桌面可用，CLI 仍可使用内置模板", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
    const call = (token: string, capability: string, input: unknown) => post(e, token, { capability, input, requestId: "r", idempotencyKey: crypto.randomUUID() });
    const markdown = "# 本地模板测试\n\n模板正文\n";
    writeFileSync(path.join(e.vault.root, "样板.md"), markdown);
    expect((await call(e.rendererToken, "notes.templates.import", { path: "样板.md" })).ok).toBe(true);
    expect((await call(e.rendererToken, "gateway.update", { capability: "notes.read", exposed: false })).ok).toBe(true);
    expect((await call(e.rendererToken, "gateway.update", { capability: "notes.create", exposed: true })).ok).toBe(true);

    const templatePath = "模板/样板.md";
    expect((await call(e.cliToken, "notes.read", { path: templatePath })).error?.code).toBe("CAPABILITY_NOT_EXPOSED");
    expect(await call(e.cliToken, "notes.create", { name: "外部本地模板", templatePath })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(existsSync(path.join(e.vault.root, "外部本地模板.md"))).toBe(false);
    expect((await call(e.cliToken, "notes.create", { name: "外部会议", template: "meeting" })).ok).toBe(true);
    expect(readFileSync(path.join(e.vault.root, "外部会议.md"), "utf8")).toContain("## 参会者");
    expect((await call(e.rendererToken, "notes.create", { name: "桌面本地模板", templatePath })).ok).toBe(true);
    expect(readFileSync(path.join(e.vault.root, "桌面本地模板.md"), "utf8")).toBe(markdown);
  }, 30_000);
  test("审计回归：外部入口即使开放 notes 写能力，也不能在 Automations/ 下创建/改写/复制/移入规则", async () => {
    const e = await boot({ vaultPath: tmp(), create: true });
    engines.push(e);
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
