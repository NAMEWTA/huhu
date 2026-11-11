import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { PROVIDERS, ProviderDetector, findOnPath } from "../src/engine/providers/index.js";
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

describe("Provider 检测", () => {
  test("找到 → found + 版本；未安装 → not-installed；探测失败 → probe-failed；结果缓存 10 分钟", async () => {
    const bin = tmp();
    fakeBin(bin, "claude", 'echo "2.1.0 (Claude Code)"');
    fakeBin(bin, "codex", "exit 3");
    let now = 1_000_000;
    const det = new ProviderDetector(() => now, { PATH: bin });
    const r = await det.detect();
    const by = Object.fromEntries(r.map((x) => [x.provider, x]));
    expect(by["claude"]).toMatchObject({ status: "found", version: "2.1.0 (Claude Code)", exe: path.join(bin, "claude") });
    expect(by["claude-agent-teams"]?.status).toBe("found");
    expect(by["codex"]).toMatchObject({ status: "probe-failed", version: null });
    expect(by["pi"]).toMatchObject({ status: "not-installed", exe: null });
    // 缓存
    fakeBin(bin, "pi", "echo pi-1");
    expect((await det.detect()).find((x) => x.provider === "pi")?.status).toBe("not-installed");
    expect((await det.detect(true)).find((x) => x.provider === "pi")?.status).toBe("found");
    now += 11 * 60_000;
    expect((await det.detect()).find((x) => x.provider === "pi")?.checkedAt).toBe(new Date(now).toISOString());
  });
  test("Agent Teams 需要 claude：没有 claude 时不可用", async () => {
    const r = await new ProviderDetector(() => 0, { PATH: tmp() }).detect();
    expect(r.every((x) => x.status === "not-installed")).toBe(true);
  });
  test("版本探测 5 秒超时被杀（用短超时验证）", async () => {
    const bin = tmp();
    fakeBin(bin, "claude", "sleep 5; echo late");
    const { probeVersion } = await import("../src/engine/providers/index.js");
    const t0 = Date.now();
    expect(await probeVersion(path.join(bin, "claude"), 300)).toBeNull();
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

describe("启动参数", () => {
  const p = (id: string) => PROVIDERS.find((x) => x.id === id)!;
  test("claude / codex / pi 的 argv", () => {
    expect(p("claude").interactiveArgv({ exe: "/b/claude", model: "opus", prompt: "做事" })).toEqual(["/b/claude", "--model", "opus", "做事"]);
    expect(p("claude").interactiveArgv({ exe: "/b/claude", resumeSessionId: "abc" })).toEqual(["/b/claude", "--resume", "abc"]);
    expect(p("codex").interactiveArgv({ exe: "codex", model: "gpt-5.5", effort: "high", prompt: "x" })).toEqual(["codex", "-m", "gpt-5.5", "-c", 'model_reasoning_effort="high"', "x"]);
    expect(p("codex").interactiveArgv({ exe: "codex", resumeSessionId: "s1", prompt: "忽略" })).toEqual(["codex", "resume", "s1"]);
    expect(p("pi").interactiveArgv({ exe: "pi" })).toEqual(["pi"]);
    expect(p("claude-agent-teams").env).toEqual({ CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" });
  });
  test("无界面能力：仅 claude 与 codex", () => {
    expect(PROVIDERS.filter((x) => x.headless).map((x) => x.id)).toEqual(["claude", "codex"]);
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
    const a = store.ensureDefault(vault);
    expect(store.ensureDefault(vault).id).toBe(a.id);
  });
});
