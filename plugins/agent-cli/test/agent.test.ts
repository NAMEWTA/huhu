import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { AgentDetector, findOnPath, probeVersion } from "../src/engine/detect.js";
import { resolveAgentLaunch } from "../src/engine/launch.js";
import { AGENT_CATALOG, emptyAgentSettings, type AgentCatalogEntry, type AgentSettingsFile } from "../src/shared/index.js";
import { SpaceStore } from "../src/engine/spaces.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-ag-"));
  dirs.push(d);
  return d;
};
function fakeBin(dir: string, name: string, script: string) {
  const f = path.join(dir, name);
  writeFileSync(f, `#!/bin/sh\n${script}\n`);
  chmodSync(f, 0o755);
}

const settingsWith = (agents: AgentSettingsFile["agents"] = {}, defaultAgent: AgentSettingsFile["defaultAgent"] = null): AgentSettingsFile => ({ ...emptyAgentSettings(), defaultAgent, agents });

describe("智能体检测", () => {
  test.skipIf(process.platform === "win32")("找到 → 已检测 + 版本；未安装 → 未检测到；结果缓存 10 分钟；停用的不探测", async () => {
    const bin = tmp();
    fakeBin(bin, "claude", 'echo "2.1.0 (Claude Code)"');
    fakeBin(bin, "codex", "exit 3");
    let now = 1_000_000;
    let settings = settingsWith();
    const det = new AgentDetector({ settings: () => settings, now: () => now, env: { PATH: bin }, home: tmp() });
    const by = Object.fromEntries((await det.detect()).map((x) => [x.id, x]));
    expect(by["claude"]).toMatchObject({ installed: true, version: "2.1.0 (Claude Code)", path: path.join(bin, "claude"), via: "path", headless: true });
    expect(by["codex"]).toMatchObject({ installed: true, path: path.join(bin, "codex") }); // 版本探测失败仍算已检测
    expect(by["codex"]?.version).toBeUndefined();
    expect(by["pi"]).toMatchObject({ installed: false, headless: false });
    // 缓存
    fakeBin(bin, "pi", "echo pi-1");
    expect((await det.detect()).find((x) => x.id === "pi")?.installed).toBe(false);
    expect((await det.detect(true)).find((x) => x.id === "pi")?.installed).toBe(true);
    now += 11 * 60_000;
    expect((await det.detect()).find((x) => x.id === "pi")?.detectedAt).toBe(new Date(now).toISOString());
    settings = settingsWith({ codex: { enabled: false } });
    expect((await det.detect(true)).find((x) => x.id === "codex")).toMatchObject({ installed: false, skipped: true });
  });
  test.skipIf(process.platform === "win32")("命令覆盖：存在的绝对路径视为已检测（via=override）；invalidate 后立即生效", async () => {
    const bin = tmp();
    const other = tmp();
    fakeBin(other, "mypi", "echo mypi-1");
    let settings = settingsWith();
    const det = new AgentDetector({ settings: () => settings, env: { PATH: bin }, home: tmp() });
    expect((await det.detect()).find((x) => x.id === "pi")?.installed).toBe(false);
    settings = settingsWith({ pi: { command: path.join(other, "mypi") } });
    det.invalidate();
    expect((await det.detect()).find((x) => x.id === "pi")).toMatchObject({ installed: true, via: "override", version: "mypi-1" });
  });
  test.skipIf(process.platform === "win32")("PATH 里没有时回退到安装目录（via=installDir）", async () => {
    const home = tmp();
    mkdirSync(path.join(home, ".local", "bin"), { recursive: true });
    fakeBin(path.join(home, ".local", "bin"), "claude", "echo 9.9.9");
    const det = new AgentDetector({ settings: () => settingsWith(), env: { PATH: tmp() }, home });
    expect((await det.detect()).find((x) => x.id === "claude")).toMatchObject({ installed: true, via: "installDir", version: "9.9.9" });
  });
  test("版本探测 5 秒超时被杀（用短超时验证）", async () => {
    const bin = tmp();
    fakeBin(bin, "claude", "sleep 5; echo late");
    const t0 = Date.now();
    expect(await probeVersion(path.join(bin, "claude"), ["--version"], 300)).toBeNull();
    expect(Date.now() - t0).toBeLessThan(3000);
  });
  test("findOnPath：非可执行文件与目录被忽略；Windows 用 PATHEXT", () => {
    const bin = tmp();
    writeFileSync(path.join(bin, "tool"), "x");
    mkdirSync(path.join(bin, "dirtool"));
    expect(findOnPath("tool", { PATH: bin }, "linux")).toBeNull();
    expect(findOnPath("dirtool", { PATH: bin }, "linux")).toBeNull();
    writeFileSync(path.join(bin, "cl.cmd"), "x");
    expect(findOnPath("cl", { PATH: bin, PATHEXT: ".EXE;.CMD" }, "win32")).toBe(path.join(bin, "cl.cmd"));
  });
});

describe("智能体目录（AG-01）", () => {
  test("三个条目的关键字段", () => {
    expect(AGENT_CATALOG.map((e) => [e.id, e.displayName, e.detect.command, e.fullAccessArgs, e.headless !== undefined])).toEqual([
      ["claude", "Claude Code", "claude", ["--dangerously-skip-permissions"], true],
      ["codex", "Codex", "codex", ["--dangerously-bypass-approvals-and-sandbox"], true],
      ["pi", "Pi", "pi", [], false],
    ]);
    expect(AGENT_CATALOG.find((e) => e.id === "claude")?.options.models?.map((m) => [m.id, m.fast, m.efforts.length])).toEqual([
      ["fable", false, 5],
      ["opus", true, 5],
      ["sonnet", false, 5],
      ["haiku", false, 0],
    ]);
    expect(AGENT_CATALOG.find((e) => e.id === "codex")?.options.models?.map((m) => m.id)).toEqual(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.2-codex"]);
  });
  test("没有任何 Agent Teams 残留", () => {
    expect(JSON.stringify(AGENT_CATALOG)).not.toMatch(/agent-teams|AGENT_TEAMS/i);
  });
});

describe("启动合成 resolveAgentLaunch", () => {
  const det = (id: string, p = `/b/${id}`) => ({ id, displayName: id, installed: true, path: p, headless: true, detectedAt: "x" }) as never;
  const run = (agentId: string, over: Record<string, unknown> = {}, settings = settingsWith()) => resolveAgentLaunch({ settings, detected: det(agentId) }, { agentId, mode: "interactive", ...over } as never);

  test("LA-01 缺省设置：完全访问参数", () => {
    expect(run("claude")).toMatchObject({ command: "/b/claude", argv: ["--dangerously-skip-permissions"], env: {} });
    expect(run("codex")).toMatchObject({ command: "/b/codex", argv: ["--dangerously-bypass-approvals-and-sandbox"] });
    expect(run("pi")).toMatchObject({ command: "/b/pi", argv: [] });
  });
  test("交互：模型 / effort / 提示词；恢复会话", () => {
    expect(run("claude", { model: "opus", prompt: "做事" }).argv).toEqual(["--model", "opus", "--dangerously-skip-permissions", "做事"]);
    expect(run("claude", { resume: "abc" }).argv).toEqual(["--dangerously-skip-permissions", "--resume", "abc"]);
    expect(run("codex", { model: "gpt-5.5", effort: "high", prompt: "x" }).argv).toEqual(["-m", "gpt-5.5", "-c", "model_reasoning_effort=high", "--dangerously-bypass-approvals-and-sandbox", "x"]);
    // LA-04：codex 恢复以 resume <id> 紧跟命令，恢复时不追加提示词
    expect(run("codex", { resume: "s1", prompt: "忽略" }).argv).toEqual(["resume", "s1", "--dangerously-bypass-approvals-and-sandbox"]);
  });
  test("LA-02 claude headless：参数顺序，--disallowedTools 在最后", () => {
    const r = run("claude", { mode: "headless", model: "sonnet", sessionId: "11111111-1111-1111-1111-111111111111", prompt: "任务" });
    expect(r.argv).toEqual([
      "--model",
      "sonnet",
      "--dangerously-skip-permissions",
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--session-id",
      "11111111-1111-1111-1111-111111111111",
      "--disallowedTools",
      "EnterWorktree,ExitWorktree",
    ]);
    expect(r.stdin).toBe("任务");
    expect(run("claude", { mode: "headless", resume: "abc" }).argv.slice(-4)).toEqual(["--resume", "abc", "--disallowedTools", "EnterWorktree,ExitWorktree"]);
  });
  test("LA-03 codex headless：exec 紧跟命令；恢复为 exec resume … <id> -", () => {
    expect(run("codex", { mode: "headless", model: "gpt-5.5", prompt: "任务" }).argv).toEqual(["exec", "-m", "gpt-5.5", "--dangerously-bypass-approvals-and-sandbox", "--json", "-"]);
    expect(run("codex", { mode: "headless", resume: "t1" }).argv).toEqual(["exec", "resume", "--dangerously-bypass-approvals-and-sandbox", "--json", "t1", "-"]);
  });
  test("LA-05 错误：pi 无 headless；停用；未检测到；非法值", () => {
    const code = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        return (e as { code: string }).code;
      }
      return null;
    };
    expect(code(() => run("pi", { mode: "headless" }))).toBe("HEADLESS_UNSUPPORTED");
    expect(code(() => run("claude", {}, settingsWith({ claude: { enabled: false } })))).toBe("AGENT_DISABLED");
    expect(code(() => resolveAgentLaunch({ settings: settingsWith() }, { agentId: "claude", mode: "interactive" }))).toBe("AGENT_NOT_FOUND");
    expect(code(() => run("claude", { model: "-x" }))).toBe("INVALID_INPUT");
    expect(code(() => run("nope"))).toBe("INVALID_INPUT");
    expect(code(() => run("claude", { draft: {} }))).toBe("INVALID_INPUT"); // draft 只能与 preview 一起用
  });
  test("LA-06 fast：claude opus → --settings；haiku 不支持并告警；codex → service_tier=priority", () => {
    expect(run("claude", { model: "opus", fast: true }).argv).toEqual(["--model", "opus", "--settings", '{"fastMode":true}', "--dangerously-skip-permissions"]);
    const h = run("claude", { model: "haiku", fast: true });
    expect(h.argv).toEqual(["--model", "haiku", "--dangerously-skip-permissions"]);
    expect(h.warnings.join()).toMatch(/速度/);
    expect(run("codex", { fast: true }).argv).toContain("service_tier=priority");
  });
  test("LA-07 冲突：用户参数里已有的选项以用户为准，其他选项照常", () => {
    const s = settingsWith({ claude: { args: ["--model", "opus"] }, codex: { args: ["-c", "model_reasoning_effort=low"] } });
    const a = run("claude", { model: "sonnet", effort: "high" }, s);
    expect(a.argv).toEqual(["--effort", "high", "--model", "opus"]);
    expect(a.warnings.join()).toMatch(/模型/);
    const b = run("codex", { model: "gpt-5.5", effort: "high" }, s);
    expect(b.argv).toEqual(["-m", "gpt-5.5", "-c", "model_reasoning_effort=low"]);
    expect(run("codex", { effort: "high" }, settingsWith({ codex: { args: ["-c", "foo=bar"] } })).argv).toEqual(["-c", "model_reasoning_effort=high", "-c", "foo=bar"]); // 无关的 -c 不触发冲突
  });
  test("LA-08 env 只含条目与用户覆盖层；设置里的命令覆盖优先于检测路径；空参数数组 = 不加任何参数", () => {
    const r = run("claude", {}, settingsWith({ claude: { env: { FOO: "1" }, command: "/my/claude", args: [] } }));
    expect(r).toMatchObject({ command: "/my/claude", argv: [], env: { FOO: "1" } });
  });
  test("预览：未检测到 / 停用也能预览；env 值打码；不支持 headless 返回标记", () => {
    const p = resolveAgentLaunch({ settings: settingsWith() }, { agentId: "claude", mode: "interactive", preview: true, draft: { enabled: false, env: { TOKEN: "abc" } } });
    expect(p).toMatchObject({ command: "claude", argv: ["--dangerously-skip-permissions"], env: { TOKEN: "…" } });
    expect(resolveAgentLaunch({ settings: settingsWith() }, { agentId: "pi", mode: "headless", preview: true }).unsupported).toBe("headless");
  });
  test("AG-02 新增一个虚构条目：不改其他代码即可检测与启动", async () => {
    const fake: AgentCatalogEntry = {
      id: "fake" as never,
      displayName: "Fake",
      homepage: "https://example.com",
      detect: { command: "fakecli", versionArgs: ["--version"] },
      launch: { command: "fakecli" },
      fullAccessArgs: ["--yolo"],
      options: {},
      interactive: { prompt: "positional" },
    };
    const r = resolveAgentLaunch({ settings: settingsWith(), catalog: [fake], detected: det("fake", "/b/fakecli") }, { agentId: "fake", mode: "interactive", prompt: "hi" });
    expect(r).toMatchObject({ command: "/b/fakecli", argv: ["--yolo", "hi"] });
    if (process.platform !== "win32") {
      const bin = tmp();
      fakeBin(bin, "fakecli", "echo fake-1");
      const d = await new AgentDetector({ settings: () => settingsWith(), env: { PATH: bin }, catalog: [fake], home: tmp() }).detect();
      expect(d).toEqual([expect.objectContaining({ id: "fake", installed: true, version: "fake-1" })]);
    }
  });
});

describe("Space", () => {
  test("创建不启动进程；canonical 路径去重（符号链接指向同一目录）", () => {
    const root = tmp();
    const work = tmp();
    const link = path.join(root, "link");
    symlinkSync(work, link);
    const store = new SpaceStore(path.join(root, "spaces"), "m1", () => new Date("2026-11-10T00:00:00Z"));
    const a = store.save({ name: "研究", root: work });
    expect(a).toMatchObject({ revision: 1, machineId: "m1" });
    expect(() => store.save({ name: "重复", root: link })).toThrowError(/已有 Space/);
    expect(store.list()).toHaveLength(1);
  });
  test("名称必填、目录必须存在且为绝对路径；编辑 revision+1，过期 revision 冲突", () => {
    const root = tmp();
    const work = tmp();
    const store = new SpaceStore(path.join(root, "spaces"), "m1");
    expect(() => store.save({ name: " ", root: work })).toThrow();
    expect(() => store.save({ name: "x", root: "relative/dir" })).toThrow();
    expect(() => store.save({ name: "x", root: path.join(work, "nope") })).toThrow();
    const s = store.save({ name: "A", root: work });
    const s2 = store.save({ id: s.id, name: "A2", root: work, expectedRevision: 1 });
    expect(s2.revision).toBe(2);
    expect(() => store.save({ id: s.id, name: "A3", root: work, expectedRevision: 1 })).toThrowError(/修改/);
  });
  test("绑定 machineId：他机的 Space 不可见", () => {
    const root = tmp();
    const work = tmp();
    new SpaceStore(path.join(root, "spaces"), "other").save({ name: "他机", root: work });
    expect(new SpaceStore(path.join(root, "spaces"), "m1").list()).toEqual([]);
  });
  test("ACC-AG-03：启动校验：revision 变化 / 目录被删 → SPACE_INVALID", () => {
    const root = tmp();
    const work = tmp();
    const doomed = path.join(work, "gone");
    mkdirSync(doomed);
    const store = new SpaceStore(path.join(root, "spaces"), "m1");
    const s = store.save({ name: "A", root: doomed });
    expect(store.validateForLaunch(s.id, 1).id).toBe(s.id);
    expect(() => store.validateForLaunch(s.id, 9)).toThrowError(/已变化/);
    rmSync(doomed, { recursive: true });
    try {
      store.validateForLaunch(s.id, 1);
    } catch (e) {
      expect((e as { code: string }).code).toBe("SPACE_INVALID");
    }
    expect(() => store.validateForLaunch("space-none", 1)).toThrow();
  });
  test("默认 Space 以 Vault 根为目录且幂等", () => {
    const root = tmp();
    const vault = tmp();
    const store = new SpaceStore(path.join(root, "spaces"), "m1");
    const a = store.ensureDefault(vault)!;
    expect(store.ensureDefault(vault)!.id).toBe(a.id);
    store.delete(a.id);
    expect(store.ensureDefault(vault)).toBeNull(); // 删掉后不再重建
    expect(store.list()).toEqual([]);
  });
});
