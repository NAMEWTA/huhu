/* oxlint-disable typescript/no-explicit-any */
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HuhuError } from "@huhu/contracts";
import { zipSync } from "fflate";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { run as runCli } from "../../cli/src/main.js";
import { mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { boot, type RunningEngine } from "../src/boot.js";

const EXAMPLES = path.resolve(import.meta.dirname, "../../../examples/plugins");
interface Reply {
  ok: boolean;
  data: any; // 测试里按用例直接取字段，形状由各用例的断言保证
  error?: { code: string; message: string };
}
const dirs: string[] = [];
const engines: RunningEngine[] = [];
beforeAll(() => {
  process.env["HUHU_EXAMPLES_DIR"] = EXAMPLES;
});
afterEach(async () => {
  for (const e of engines.splice(0)) await e.shutdown();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-x-"));
  dirs.push(d);
  return d;
};
const start = async (vault: string) => {
  const e = await boot({ vaultPath: vault, create: true });
  engines.push(e);
  return e;
};
let n = 0;
const call = (e: RunningEngine, capability: string, input: unknown = {}, token = e.rendererToken): Promise<Reply> =>
  fetch(`http://127.0.0.1:${e.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: `r${n++}`, idempotencyKey: `key-${n++}-xxxxxxxx` }),
  }).then((r) => r.json() as Promise<Reply>);

/** 写一个临时扩展到目录，返回目录。 */
function fixture(id: string, permissions: string[], code: string, extra: Record<string, unknown> = {}): string {
  const dir = path.join(tmp(), id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "huhu-plugin.json"), JSON.stringify({ id, title: id, description: "测试扩展", version: "1.0.0", origin: "external", main: "main.mjs", permissions, ...extra }));
  writeFileSync(path.join(dir, "main.mjs"), code);
  return dir;
}

const objectSchema = (properties: Record<string, unknown> = {}, required: string[] = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const textSchema = { type: "string" };
const command = (owner: string, commandId: string, overrides: Record<string, unknown> = {}) => ({
  owner,
  commandId,
  title: commandId,
  description: "合成命令",
  scope: "read",
  risk: "normal",
  retry: "read-only",
  dependencies: [],
  input: objectSchema(),
  output: textSchema,
  ...overrides,
});
const declared = (...commandDescriptors: ReturnType<typeof command>[]) => ({ contributes: { commandDescriptors } });

describe("外部扩展（W16.2）", () => {
  test("发现页列出三个示例；检查清单时列出权限对应的能力", async () => {
    const e = await start(tmp());
    const ex = await call(e, "plugins.examples");
    expect((ex.data as { id: string }[]).map((x) => x.id).sort()).toEqual(["daily-review", "portable-export", "quick-clip"]);
    const info = await call(e, "plugins.inspect", { source: path.join(EXAMPLES, "quick-clip") });
    expect(info.data.permissions).toEqual([{ name: "inbox.write", capabilities: ["inbox.capture"] }]);
  });

  test("ACC-PL-03：安装快速剪藏并运行命令 → 收件箱新增 plugin:quick-clip 来源的捕获", async () => {
    const e = await start(tmp());
    const src = path.join(EXAMPLES, "quick-clip");
    const bad = await call(e, "plugins.install", { source: src, grants: [] });
    expect(bad.ok).toBe(false); // 授权必须与请求的权限一致
    const ok = await call(e, "plugins.install", { source: src, grants: ["inbox.write"] });
    expect(ok.ok).toBe(true);
    const list = await call(e, "plugins.list");
    expect(list.data.find((p: { id: string }) => p.id === "quick-clip")).toMatchObject({ origin: "external", state: "active" });
    const cmds = await call(e, "plugins.commands.list");
    expect(cmds.data).toEqual([{ pluginId: "quick-clip", id: "clip", title: "快速剪藏：收集一条想法" }]);
    const run = await call(e, "plugins.commands.run", { pluginId: "quick-clip", commandId: "clip", args: { text: "路上的想法" } });
    expect(run.ok).toBe(true);
    const inbox = await call(e, "inbox.list", {});
    expect(inbox.data).toHaveLength(1);
    expect(inbox.data[0]).toMatchObject({ source: "plugin:quick-clip", title: "路上的想法" });
  });

  test("超出权限的调用得到 PERMISSION_DENIED（notes.save），且不产生副作用", async () => {
    const e = await start(tmp());
    const dir = fixture(
      "probe",
      ["inbox.write"],
      `export function activate(api) {
         api.registerCommand("probe", async (_args, context) => {
           const out = {};
           for (const [key, cap, input] of [["note", "notes.save", { path: "x.md", text: "x", expectedVersion: "v" }], ["task", "tasks.create", { title: "不该存在" }], ["safe", "safe.accounts.reveal", { id: "x" }], ["agent", "agent.sessions.kill", { id: "x" }]]) {
             try { await context.call(cap, input); out[key] = "ok"; } catch (e) { out[key] = e.code; }
           }
           return out;
         });
       }`,
      declared(command("probe", "probe", { output: objectSchema({ note: textSchema, task: textSchema, safe: textSchema, agent: textSchema }) })),
    );
    expect((await call(e, "plugins.install", { source: dir, grants: ["inbox.write"] })).ok).toBe(true);
    const r = await call(e, "plugins.commands.run", { pluginId: "probe", commandId: "probe" });
    expect(r.data.result).toEqual({ note: "PERMISSION_DENIED", task: "PERMISSION_DENIED", safe: "PERMISSION_DENIED", agent: "PERMISSION_DENIED" });
    expect((await call(e, "tasks.list", {})).data).toEqual([]);
  });

  test("ACC-PL-04：卸载默认保留数据；单独选择擦除", async () => {
    const vault = tmp();
    const e = await start(vault);
    const src = path.join(EXAMPLES, "quick-clip");
    await call(e, "plugins.install", { source: src, grants: ["inbox.write"] });
    const data = path.join(vault, ".huhu/plugins/data/quick-clip");
    writeFileSync(path.join(data, "state.json"), "{}");
    expect((await call(e, "plugins.uninstall", { id: "quick-clip" })).ok).toBe(true);
    expect(existsSync(path.join(vault, ".huhu/plugins/external/quick-clip"))).toBe(false);
    expect(existsSync(path.join(data, "state.json"))).toBe(true);
    expect((await call(e, "plugins.list")).data.some((p: { id: string }) => p.id === "quick-clip")).toBe(false);
    // 重新安装后再卸载并擦除
    await call(e, "plugins.install", { source: src, grants: ["inbox.write"] });
    expect((await call(e, "plugins.uninstall", { id: "quick-clip", eraseData: true })).ok).toBe(true);
    expect(existsSync(data)).toBe(false);
  });

  test("清单校验：与内置冲突、未知权限、main 越界/缺失、符号链接都被拒绝，且不留文件", async () => {
    const vault = tmp();
    const e = await start(vault);
    const cases: [string, string[], string, Record<string, unknown>][] = [
      ["tasks", [], "export function activate() {}", {}],
      ["bad-perm", ["root.all"], "export function activate() {}", {}],
      ["escape", [], "export function activate() {}", { main: "../x.mjs" }],
      ["nomain", [], "export function activate() {}", { main: "other.mjs" }],
    ];
    for (const [id, perms, code, extra] of cases) {
      const r = await call(e, "plugins.install", { source: fixture(id, perms, code, extra), grants: perms });
      expect(r.ok, id).toBe(false);
      expect(r.error?.code, id).toBe("INVALID_INPUT");
    }
    expect(existsSync(path.join(vault, ".huhu/plugins/external"))).toBe(false);
  });

  test("版本号不能夹带路径（../ 穿越）；包内容被替换后不再自动运行", async () => {
    const vault = tmp();
    let e = await start(vault);
    const evil = fixture("evil-version", [], "export function activate() {}", { version: "1.0.0/../../../../../../outside" });
    const r = await call(e, "plugins.install", { source: evil, grants: [] });
    expect(r.ok).toBe(false);
    expect(existsSync(path.join(vault, ".huhu/plugins/external"))).toBe(false);

    await call(e, "plugins.install", { source: path.join(EXAMPLES, "quick-clip"), grants: ["inbox.write"] });
    await e.shutdown();
    engines.splice(engines.indexOf(e), 1);
    // 同版本、文件被换掉：信任绑定内容哈希，重启后不自动运行
    writeFileSync(path.join(vault, ".huhu/plugins/external/quick-clip/1.0.0/main.mjs"), "export function activate() {}");
    e = await start(vault);
    expect(((await call(e, "plugins.list")).data as { id: string; state: string }[]).find((p) => p.id === "quick-clip")?.state).toBe("disabled");
  });

  test("启动失败的扩展不留半安装状态，可直接再试；`constructor` 之类的 id 不会被误判为已安装", async () => {
    const e = await start(tmp());
    const dir = fixture("broken", [], "export function activate() { throw new Error('boom'); }");
    const r = await call(e, "plugins.install", { source: dir, grants: [] });
    expect(r.ok).toBe(false);
    expect(((await call(e, "plugins.list")).data as { id: string }[]).some((p) => p.id === "broken")).toBe(false);
    expect((await call(e, "plugins.uninstall", { id: "constructor" })).ok).toBe(false);
  });

  test("安装失败的回滚不会删掉卸载时保留的旧数据", async () => {
    const vault = tmp();
    const e = await start(vault);
    const good = fixture("keeper", [], "export function activate() {}");
    await call(e, "plugins.install", { source: good, grants: [] });
    const keep = path.join(vault, ".huhu/plugins/data/keeper/keep.txt");
    writeFileSync(keep, "保留");
    await call(e, "plugins.uninstall", { id: "keeper" });
    const bad = fixture("keeper", [], "export function activate() { throw new Error('boom'); }");
    expect((await call(e, "plugins.install", { source: bad, grants: [] })).ok).toBe(false);
    expect(existsSync(keep)).toBe(true);
  });

  test("启动失败后另一扩展可在同一 Engine 安装尚无历史归属的能力名", async () => {
    const vault = tmp();
    const e = await start(vault);
    const id = "failed-owner";
    const capability = "fixture.rollback.read";
    const extra = { contributes: { capabilities: [capability] } };
    const failed = fixture(id, [], "export function activate() { throw new Error('fixture activation failed'); }", extra);
    const replacement = fixture("replacement-owner", [], "export function activate() {}", extra);
    const data = path.join(vault, ".huhu/plugins/data", id);
    mkdirSync(data, { recursive: true });
    writeFileSync(path.join(data, "keep.txt"), "保留");

    expect(await call(e, "plugins.install", { source: failed, grants: [] })).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", message: expect.stringContaining("fixture activation failed") },
    });
    expect(existsSync(path.join(vault, ".huhu/plugins/external", id))).toBe(false);
    for (const file of [".huhu/plugins/external.json", ".huhu/local/external-trust.json"]) {
      expect(JSON.parse(readFileSync(path.join(vault, file), "utf8"))).not.toHaveProperty(id);
    }
    expect(readFileSync(path.join(data, "keep.txt"), "utf8")).toBe("保留");
    expect((await call(e, "plugins.list")).data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
    expect((await call(e, "capabilities.list", { includeInactive: true })).data).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: capability })]));
    expect(await call(e, "gateway.check", { capability })).toMatchObject({ ok: true, data: { found: false, availability: "not-found" } });

    expect(await call(e, "plugins.install", { source: replacement, grants: [] })).toMatchObject({ ok: true, data: { id: "replacement-owner" } });
    expect((await call(e, "capabilities.list", { includeInactive: true })).data).toEqual(expect.arrayContaining([expect.objectContaining({ name: capability, plugin: "replacement-owner", availability: "handler-missing" })]));
  });

  test("失败的复装保留已安装过的归属，并释放复装时新声明的名称", async () => {
    const e = await start(tmp());
    const id = "historical-owner";
    const oldName = "fixture.history.read";
    const newName = "fixture.history.write";
    const install = (source: string) => call(e, "plugins.install", { source, grants: [] });
    const good = (owner: string, name: string) => fixture(owner, [], "export function activate() {}", { contributes: { capabilities: [name] } });
    const original = good(id, oldName);
    const conflict = { ok: false, error: { code: "NAME_CONFLICT" } };
    const canonical = good("canonical-challenger", oldName);
    const alias = good("mcp-challenger", "fixture.history_read");

    expect(await install(original)).toMatchObject({ ok: true });
    expect(await install(canonical)).toMatchObject(conflict);
    expect(await install(alias)).toMatchObject(conflict);
    expect(await call(e, "plugins.uninstall", { id })).toMatchObject({ ok: true });

    const failed = fixture(id, [], "export function activate() { throw new Error('failed reinstall'); }", { contributes: { capabilities: [oldName, newName] } });
    expect(await install(failed)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", message: expect.stringContaining("failed reinstall") } });
    expect(await install(canonical)).toMatchObject(conflict);
    expect(await install(alias)).toMatchObject(conflict);
    expect(await install(good("new-owner", newName))).toMatchObject({ ok: true });
    expect(await install(original)).toMatchObject({ ok: true });
  });

  test("ACC-PL-02：内置插件没有卸载入口；直接调用 plugins.uninstall 返回错误且无副作用", async () => {
    const vault = tmp();
    const e = await start(vault);
    const before = JSON.stringify((await call(e, "plugins.list")).data);
    for (const id of ["tasks", "notes", "inbox"]) {
      const r = await call(e, "plugins.uninstall", { id, eraseData: true });
      expect(r.ok, id).toBe(false);
      expect(r.error?.code, id).toBe("NOT_FOUND");
    }
    expect(JSON.stringify((await call(e, "plugins.list")).data)).toBe(before);
    expect(existsSync(path.join(vault, ".huhu/plugins/external"))).toBe(false);
  });

  test("zip 安装；含 ../ 的恶意 zip 被拒绝", async () => {
    const e = await start(tmp());
    const dir = tmp();
    const q = path.join(EXAMPLES, "quick-clip");
    const good = path.join(dir, "quick-clip.zip");
    writeFileSync(good, zipSync({ "huhu-plugin.json": readFileSync(path.join(q, "huhu-plugin.json")), "main.mjs": readFileSync(path.join(q, "main.mjs")) }));
    expect((await call(e, "plugins.install", { source: good, grants: ["inbox.write"] })).ok).toBe(true);
    const evil = path.join(dir, "evil.zip");
    writeFileSync(evil, zipSync({ "../../evil.txt": new Uint8Array([1]), "huhu-plugin.json": readFileSync(path.join(q, "huhu-plugin.json")) }));
    const r = await call(e, "plugins.inspect", { source: evil });
    expect(r.ok).toBe(false);
    expect(existsSync(path.join(dir, "..", "evil.txt"))).toBe(false);
  });

  test("崩溃隔离：扩展进程退出只让它变为 failed，Engine 继续可用", async () => {
    const e = await start(tmp());
    const dir = fixture("crasher", [], `export function activate(api) { api.registerCommand("die", async () => { setTimeout(() => process.exit(3), 10); return "bye"; }); }`, declared(command("crasher", "die")));
    await call(e, "plugins.install", { source: dir, grants: [] });
    await call(e, "plugins.commands.run", { pluginId: "crasher", commandId: "die" });
    await expect.poll(async () => ((await call(e, "plugins.list")).data as { id: string; state: string }[]).find((p) => p.id === "crasher")?.state, { timeout: 5000 }).toBe("failed");
    expect((await call(e, "vault.info")).ok).toBe(true);
    // 重试：重新启用
    expect((await call(e, "plugins.setEnabled", { id: "crasher", enabled: true })).data.state).toBe("active");
  });

  test("重启后保持启用；同步来的（本机未信任）扩展以停用状态加载", async () => {
    const vault = tmp();
    let e = await start(vault);
    await call(e, "plugins.install", { source: path.join(EXAMPLES, "quick-clip"), grants: ["inbox.write"] });
    await e.shutdown();
    engines.splice(engines.indexOf(e), 1);
    e = await start(vault);
    expect(((await call(e, "plugins.list")).data as { id: string; state: string }[]).find((p) => p.id === "quick-clip")?.state).toBe("active");
    await e.shutdown();
    engines.splice(engines.indexOf(e), 1);
    rmSync(path.join(vault, ".huhu/local/external-trust.json"));
    e = await start(vault);
    expect(((await call(e, "plugins.list")).data as { id: string; state: string }[]).find((p) => p.id === "quick-clip")?.state).toBe("disabled");
    // 用户在本机显式启用 = 信任
    expect((await call(e, "plugins.setEnabled", { id: "quick-clip", enabled: true })).data.state).toBe("active");
    expect(readdirSync(path.join(vault, ".huhu/local"))).toContain("external-trust.json");
  });

  test("扩展令牌随停用撤销；其他身份不能调用 plugins.install", async () => {
    const e = await start(tmp());
    const r = await call(e, "plugins.install", { source: path.join(EXAMPLES, "quick-clip"), grants: ["inbox.write"] }, e.cliToken);
    expect(r.ok).toBe(false);
  });
});

test("扩展拒绝整份冲突、超长和不支持的 schema 声明", async () => {
  const e = await start(tmp());
  const install = (id: string, descriptors: ReturnType<typeof command>[]) => call(e, "plugins.install", { source: fixture(id, [], "export function activate() {}", declared(...descriptors)), grants: [] });
  expect(await install("fixture", [command("fixture", "same"), command("fixture", "same")])).toMatchObject({ ok: false, error: { code: "NAME_CONFLICT" } });
  expect(await install("fixture", [command("fixture", "a".repeat(128))])).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await install("fixture", [command("other", "foreign")])).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await install("fixture", [command("fixture", "unknown", { input: { $ref: "schema.json" } })])).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  const reserved = fixture("reservation", [], "export function activate() {}", { contributes: { capabilities: ["extensions_fixture_reserved"] } });
  expect(await call(e, "plugins.install", { source: reserved, grants: [] })).toMatchObject({ ok: true });
  expect(await install("fixture", [command("fixture", "other"), command("fixture", "reserved")])).toMatchObject({ ok: false, error: { code: "NAME_CONFLICT" } });
  expect(await call(e, "gateway.check", { capability: "extensions.fixture.other" })).toMatchObject({ data: { found: false } });
});

test.each(["cli", "http"] as const)("G3.4 %s 原主体、逐项转发、撤销、持久步骤和换库", { timeout: 45_000 }, async (entry) => {
  const e = await start(tmp());
  const id = "delegation-fixture";
  const write = `extensions.${id}.write`;
  const peek = `extensions.${id}.peek`;
  const proxy = "plugins.commands.run";
  const grants = ["inbox.write", "tasks.write"];
  const set = async (capability: string, exposed = true) => {
    expect(await call(e, "gateway.update", { capability, exposed })).toMatchObject({ ok: true });
  };
  const setGrants = async (next: string[]) => {
    expect(await call(e, "plugins.grants.update", { id, grants: next })).toMatchObject({ ok: true });
  };
  const inputSchema = objectSchema({ text: textSchema, gate: textSchema }, ["text"]);
  const definitions = [command(id, "write", { scope: "write", retry: "durable-steps", input: inputSchema, output: textSchema, dependencies: ["inbox.capture", "tasks.create"] }), command(id, "peek")];
  const code = `import { copyFileSync, existsSync, writeFileSync } from "node:fs";
    import path from "node:path";
    export function activate(api) {
      if (api.call !== undefined) throw new Error("lifecycle cannot invoke Engine");
      api.registerCommand("peek", async () => "peek");
      api.registerCommand("write", async ({ text, gate }, context) => {
        const saved = await context.call("inbox.capture", { title: text, body: text, source: "system" }, "first-capture");
        if (gate) {
          writeFileSync(path.join(api.dataDir, gate + "-ready"), "");
          while (!existsSync(path.join(api.dataDir, gate + "-go"))) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        await context.call("tasks.create", { title: text }, "second-task");
        return saved.id;
      });
    }`;
  const source = fixture(id, grants, code, declared(...definitions));
  expect(await call(e, "plugins.install", { source, grants })).toMatchObject({ ok: true });
  const token = (await call(e, "gateway.tokens.create", { name: "G3.4 fixture" })).data.token as string;
  expect(await call(e, "gateway.mcp.update", { enabled: true, transport: "http" })).toMatchObject({ ok: true });
  const endpoint = (engine: RunningEngine) => `http://127.0.0.1:${engine.port}/mcp`;
  let handle = entry === "http" ? await openMcpSession(endpoint(e), token) : undefined;
  type ExternalReply = { data?: unknown; opId?: string; error?: { code: string; details?: Record<string, unknown> } };
  const invoke = async (name: string, args: unknown, intent?: string, engine = e): Promise<ExternalReply> => {
    if (entry === "cli") {
      const output: string[] = [];
      await runCli(["call", name, "--vault", engine.vault.root, "--input-json", JSON.stringify(args), "--json", ...(intent ? ["--intent-key", intent] : [])], {
        out: (line) => output.push(line),
        err: (line) => {
          throw new Error(line);
        },
      });
      return JSON.parse(output.join("")) as ExternalReply;
    }
    const response = await mcpRequest(endpoint(engine), token, mcpRpc("tools/call", { name: name.replaceAll(".", "_"), arguments: args, ...(intent && { _meta: { "huhu.dev/intent-key": intent } }) }), handle);
    expect(response.status).toBe(200);
    const { result } = (await response.json()) as { result: { isError?: boolean; content: { text: string }[]; structuredContent?: ExternalReply } };
    return result.isError ? { error: JSON.parse(result.content[0]!.text) } : result.structuredContent!;
  };
  const via = (name: string, args: unknown, intent?: string) => invoke(proxy, { pluginId: id, commandId: name, args }, intent);
  const expectError = (code: string) => ({ error: { code } });
  const captures = async () => (await call(e, "inbox.list")).data as { title: string; source: string }[];
  const tasks = async () => (await call(e, "tasks.list")).data as { title: string }[];
  const manifest = e.registry.get("inbox.capture")!;
  const capture = manifest.handler;
  const observed: Parameters<typeof capture>[0][] = [];
  const handler = vi.spyOn(manifest, "handler").mockImplementation((context, input) => {
    observed.push(context);
    return capture(context, input);
  });
  try {
    expect(await invoke(write, { text: "off" })).toMatchObject(expectError("CAPABILITY_NOT_EXPOSED"));
    expect(await via("write", { text: "off" })).toMatchObject(expectError("CAPABILITY_NOT_EXPOSED"));
    await set(proxy);
    await set(write);
    await set("inbox.capture");
    await set("tasks.create");
    const discovered =
      entry === "http"
        ? ((await (await mcpRequest(endpoint(e), token, mcpRpc("tools/list"), handle)).json()) as { result: { tools: { name: string }[] } }).result.tools.map(({ name }) => name)
        : ((await (await fetch(`http://127.0.0.1:${e.port}/api/v1/capabilities`, { headers: { authorization: `Bearer ${e.cliToken}` } })).json()) as { name: string }[]).map(({ name }) => name);
    const tool = (name: string) => (entry === "http" ? name.replaceAll(".", "_") : name);
    expect(discovered).toContain(tool(write));
    expect(discovered).not.toContain(tool(peek));
    expect(await invoke(peek, {})).toMatchObject(expectError("CAPABILITY_NOT_EXPOSED"));
    expect(await via("peek", {})).toMatchObject(expectError("CAPABILITY_NOT_EXPOSED"));
    expect(await invoke(write, { text: 4 })).toMatchObject(expectError("INVALID_INPUT"));

    const intent = randomUUID();
    const [direct, forwarded] = await Promise.all([invoke(write, { text: "one" }, intent), via("write", { text: "one" }, intent)]);
    expect(direct).toMatchObject({ data: expect.any(String), opId: expect.any(String) });
    expect(forwarded).toMatchObject({ data: { result: direct.data, operationId: direct.opId } });
    expect(await captures()).toMatchObject([{ title: "one", source: entry }]);
    expect(await tasks()).toMatchObject([{ title: "one" }]);
    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({ caller: entry, delegatedBy: { pluginId: id, caller: entry, command: write, vaultInstance: expect.stringContaining(e.vault.id) }, parentOperationId: direct.opId });
    expect(observed[0]?.subject).toBe(observed[0]?.delegatedBy?.subject);
    if (entry === "http") expect(observed[0]?.session).toMatchObject({ entry: "mcp-http", vaultInstance: observed[0]?.delegatedBy?.vaultInstance });
    else expect(observed[0]?.subject).toBe("cli");

    if (entry === "http") {
      const otherSession = await openMcpSession(endpoint(e), token);
      const first = invoke(write, { text: "same-token-a" }, intent + "-parallel");
      const original = handle;
      handle = otherSession;
      const second = invoke(write, { text: "same-token-b" }, intent + "-parallel");
      handle = original;
      const [a, b] = await Promise.all([first, second]);
      expect(a.opId).toBeTruthy();
      expect(b.opId).toBeTruthy();
      expect(a.opId).not.toBe(b.opId);
      const subjects = observed.slice(1).map(({ subject }) => subject);
      expect(subjects).toHaveLength(2);
      expect(new Set(subjects).size).toBe(2);
    }

    const dataDir = path.join(e.vault.stateDir, "plugins", "data", id);
    const waiting = (gate: string) => expect.poll(() => existsSync(path.join(dataDir, gate + "-ready"))).toBe(true);
    const open = (gate: string) => writeFileSync(path.join(dataDir, gate + "-go"), "");
    const scenarios = [
      { gate: "command", revoke: () => set(write, false), restore: () => set(write), error: "CAPABILITY_NOT_EXPOSED" },
      { gate: "target", revoke: () => set("tasks.create", false), restore: () => set("tasks.create"), error: "CAPABILITY_NOT_EXPOSED" },
      { gate: "grant", revoke: () => setGrants(["inbox.write"]), restore: () => setGrants(grants), error: "PERMISSION_DENIED" },
      { gate: "proxy", revoke: () => set(proxy, false), restore: () => set(proxy), error: "CAPABILITY_NOT_EXPOSED" },
    ];
    for (const scenario of scenarios) {
      const { gate } = scenario;
      const args = { text: gate, gate };
      const key = randomUUID();
      const pending = via("write", args, key);
      await waiting(gate);
      await scenario.revoke();
      open(gate);
      const denied = await pending;
      expect(denied).toMatchObject(expectError(scenario.error));
      expect((await tasks()).filter(({ title }) => title === gate)).toHaveLength(0);
      await scenario.restore();
      expect(await via("write", args, key)).toMatchObject({ data: { result: expect.any(String), operationId: denied.error?.details?.["operationId"] } });
      expect((await captures()).filter(({ title }) => title === gate)).toHaveLength(1);
      expect((await tasks()).filter(({ title }) => title === gate)).toHaveLength(1);
    }

    const args = { text: "stop", gate: "stop" };
    const key = randomUUID();
    const pending = invoke(write, args, key);
    await waiting(args.gate);
    expect(await call(e, "plugins.setEnabled", { id, enabled: false })).toMatchObject({ ok: true });
    expect((await pending).error).toBeDefined();
    expect((await tasks()).filter(({ title }) => title === "stop")).toHaveLength(0);
    expect(await invoke(write, args, key)).toMatchObject(expectError("PLUGIN_DISABLED"));
    expect(await call(e, "capabilities.list", { includeInactive: true })).toMatchObject({ data: expect.arrayContaining([expect.objectContaining({ name: write, availability: "plugin-disabled", scope: "write" })]) });
    await set(peek);
    expect(await call(e, "plugins.setEnabled", { id, enabled: true })).toMatchObject({ ok: true });
    expect(await invoke(peek, {})).toMatchObject({ data: "peek" });
    expect(await via("peek", {})).toMatchObject({ data: { result: "peek" } });
    expect(await invoke(write, args, key)).toMatchObject(expectError("INTERNAL"));

    let other = await start(tmp());
    expect(await call(other, "plugins.install", { source, grants })).toMatchObject({ ok: true });
    if (entry === "http") {
      const root = other.vault.root;
      const file = path.join(other.vault.stateDir, "gateways.json");
      await other.shutdown();
      engines.splice(engines.indexOf(other), 1);
      copyFileSync(path.join(e.vault.stateDir, "gateways.json"), file);
      other = await start(root);
      expect((await mcpRequest(endpoint(other), token, mcpRpc("tools/list"), handle)).status).toBe(404);
      const otherSession = await openMcpSession(endpoint(other), token);
      expect(otherSession).not.toBe(handle);
    } else {
      expect(await invoke(write, { text: "one" }, intent, other)).toMatchObject(expectError("CAPABILITY_NOT_EXPOSED"));
    }
    expect(await call(other, "inbox.list")).toMatchObject({ data: [] });

    const nextSchema = objectSchema({ text: textSchema, gate: textSchema, revision: textSchema }, ["text", "revision"]);
    const update = fixture(id, grants, code.replace('api.registerCommand("peek"', 'api.registerCommand("new-tool", () => "new"); api.registerCommand("peek"'), {
      ...declared(command(id, "write", { ...definitions[0], input: nextSchema }), definitions[1]!, command(id, "new-tool")),
      version: "1.1.0",
    });
    expect(await call(e, "plugins.uninstall", { id })).toMatchObject({ ok: true });
    expect(await call(e, "plugins.install", { source: update, grants })).toMatchObject({ ok: true });
    if (entry === "http") handle = await openMcpSession(endpoint(e), token);
    expect(await invoke(write, { text: "old-schema" })).toMatchObject(expectError("INVALID_INPUT"));
    expect(await via("write", { text: "old-schema" })).toMatchObject(expectError("INVALID_INPUT"));
    expect(await invoke(`extensions.${id}.new-tool`, {})).toMatchObject(expectError("CAPABILITY_NOT_EXPOSED"));
    expect(await via("new-tool", {})).toMatchObject(expectError("CAPABILITY_NOT_EXPOSED"));
  } finally {
    handler.mockRestore();
  }
});

test("每日回顾保存步骤明确未受理时，重交只保存已创建的原路径", async () => {
  const e = await start(tmp());
  const name = "extensions.daily-review.generate";
  const grants = ["tasks.read", "notes.read", "notes.write"];
  expect(await call(e, "plugins.install", { source: path.join(EXAMPLES, "daily-review"), grants })).toMatchObject({ ok: true });
  const save = vi.spyOn(e.registry.get("notes.save")!, "handler").mockImplementationOnce(() => {
    throw new HuhuError("WRITE_PARTIAL", "合成的保存受理失败", { details: { outcome: "not-accepted" } });
  });
  const intentKey = randomUUID();
  const run = () =>
    fetch(`http://127.0.0.1:${e.port}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${e.rendererToken}`, "content-type": "application/json" },
      body: JSON.stringify({ capability: name, requestId: randomUUID(), input: {}, intentKey }),
    }).then((reply) => reply.json());
  try {
    expect(await run()).toMatchObject({ ok: false, error: { code: "WRITE_PARTIAL", details: { outcome: "not-accepted" } } });
    const before = (await call(e, "notes.list")).data;
    expect(before).toHaveLength(1);
    const originalPath = before[0].path;
    expect(await run()).toMatchObject({ ok: true, data: { path: originalPath } });
    expect((await call(e, "notes.list")).data).toHaveLength(1);
    expect((await call(e, "notes.read", { path: originalPath })).data.text).toContain("未完成任务");
    expect(save).toHaveBeenCalledTimes(2);
  } finally {
    save.mockRestore();
  }
});
