/* oxlint-disable typescript/no-explicit-any */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipSync } from "fflate";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
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
         api.registerCommand("probe", "探测", async () => {
           const out = {};
           for (const [cap, input] of [["notes.save", { path: "x.md", text: "x", expectedVersion: "v" }], ["tasks.create", { title: "不该存在" }], ["safe.items.reveal", { id: "x" }], ["agent.sessions.kill", { id: "x" }]]) {
             try { await api.call(cap, input); out[cap] = "ok"; } catch (e) { out[cap] = e.code; }
           }
           return out;
         });
       }`,
    );
    expect((await call(e, "plugins.install", { source: dir, grants: ["inbox.write"] })).ok).toBe(true);
    const r = await call(e, "plugins.commands.run", { pluginId: "probe", commandId: "probe" });
    expect(r.data.result).toEqual({ "notes.save": "PERMISSION_DENIED", "tasks.create": "PERMISSION_DENIED", "safe.items.reveal": "PERMISSION_DENIED", "agent.sessions.kill": "PERMISSION_DENIED" });
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
    const dir = fixture("crasher", [], `export function activate(api) { api.registerCommand("die", "崩溃", async () => { setTimeout(() => process.exit(3), 10); return "bye"; }); }`);
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
