import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { WorkerInput } from "../src/engine/service.js";
import { killRound, readSupervisor, roundActive, supervisorAlive, waitExit } from "../src/engine/supervised.js";
import { buildPrompt, buildRulePrompt, isSafeId, parseOutput, processWorker, roundDir, type ResolveLaunch } from "../src/engine/worker.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const posix = process.platform !== "win32";

function fakeCli(script: string): { exe: string; runs: string; count: string; dir: string } {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-sup-"));
  dirs.push(d);
  const exe = path.join(d, "fake-cli.sh");
  const count = path.join(d, "count.txt");
  writeFileSync(exe, `#!/bin/sh\necho x >> "${count}"\n${script}\n`);
  chmodSync(exe, 0o755);
  return { exe, runs: path.join(d, "runs"), count, dir: d };
}
const input = (over: Partial<WorkerInput> = {}): WorkerInput => ({
  runId: "run-1",
  task: { id: "t1", title: "T", body: "b" } as never,
  vaultRoot: "/vault/root",
  cwd: tmpdir(),
  provider: "claude",
  model: null,
  signal: new AbortController().signal,
  ...over,
});
/** 智能体启动合成的替身（真实实现在 agent-cli 的 resolveAgentLaunch，单独测试）：直接启动假的 CLI。 */
const launcher =
  (f: { exe: string }, seen: Parameters<ResolveLaunch>[0][] = []): ResolveLaunch =>
  async (i) => {
    seen.push(i);
    return { command: f.exe, argv: [], env: {}, warnings: [] };
  };
const calls = (count: string): number => (existsSync(count) ? readFileSync(count, "utf8").trim().split("\n").length : 0);

describe("输出解析与命令构造", () => {
  test("claude stream-json：取 result 与 session_id；codex --json：取 thread_id 与最后一条 agent_message", () => {
    const c = parseOutput("claude", ['{"type":"system","session_id":"s-1"}', '{"type":"result","result":"好了","session_id":"s-1","is_error":false}'].join("\n"));
    expect(c).toEqual({ message: "好了", nativeSessionId: "s-1", isError: false });
    const x = parseOutput(
      "codex",
      ['{"type":"thread.started","thread_id":"th-9"}', '{"type":"item.completed","item":{"type":"agent_message","text":"一"}}', '{"type":"item.completed","item":{"type":"agent_message","text":"二"}}'].join("\n"),
    );
    expect(x).toMatchObject({ message: "二", nativeSessionId: "th-9" });
    expect(parseOutput("claude", "纯文本").message).toBe("纯文本");
  });
  test("提示词第一条写明 Vault 绝对路径；任务提示词带快照路径与补充指令；规则提示词带规则正文", () => {
    const t = buildPrompt({ vaultRoot: "/v", snapshotFile: "/runs/r1/task-snapshot.md", instruction: "写总结" });
    expect(t.split("\n")[0]).toBe("Vault 的绝对路径：/v");
    expect(t).toContain("/runs/r1/task-snapshot.md");
    expect(t).toContain("补充指令：\n写总结");
    expect(buildPrompt({ vaultRoot: "/v", snapshotFile: "/s" })).not.toContain("补充指令");
    const r = buildRulePrompt("/v", "  整理收件箱 ");
    expect(r.split("\n")[0]).toBe("Vault 的绝对路径：/v");
    expect(r.endsWith("整理收件箱")).toBe(true);
    expect(isSafeId("a b")).toBe(false);
    expect(isSafeId("--x")).toBe(false);
    expect(isSafeId("th-9")).toBe(true);
  });
});

describe.skipIf(!posix)("监督进程（ACC-AU-06 / 取消）", () => {
  test("正常运行：结果落盘并被解释为 succeeded，会话 id 取自输出", async () => {
    const f = fakeCli(`cat > /dev/null\nprintf '%s\\n' '{"type":"result","result":"完成","session_id":"abc-1","is_error":false}'`);
    const w = processWorker({ runsDir: f.runs, resolveLaunch: launcher(f) });
    const out = await w.run(input());
    expect(out).toMatchObject({ state: "succeeded", message: "完成", nativeSessionId: "abc-1", exitCode: 0 });
    expect(calls(f.count)).toBe(1);
  });

  test("启动参数交给 resolveLaunch（provider/模型/强度/fast/新会话 id）；提示词走 stdin，含 Vault 绝对路径与任务快照路径", async () => {
    const f = fakeCli(`cat > "${"${0%/*}"}/stdin.txt"\nprintf '%s\\n' '{"type":"result","result":"好","session_id":"abc-0","is_error":false}'`);
    const seen: Parameters<ResolveLaunch>[0][] = [];
    const w = processWorker({ runsDir: f.runs, resolveLaunch: launcher(f, seen) });
    const out = await w.run(input({ model: "sonnet", effort: "high", fast: true, snapshotText: "任务全文", instruction: "补充" }));
    expect(out).toMatchObject({ state: "succeeded" });
    expect(seen[0]).toMatchObject({ agentId: "claude", mode: "headless", model: "sonnet", effort: "high", fast: true });
    expect(seen[0]?.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    const stdin = readFileSync(path.join(f.dir, "stdin.txt"), "utf8");
    expect(stdin.split("\n")[0]).toBe("Vault 的绝对路径：/vault/root");
    expect(stdin).toContain("task-snapshot.md");
    expect(readFileSync(path.join(f.runs, "run-1", "task-snapshot.md"), "utf8")).toBe("任务全文");
    // 续跑：不再带 sessionId，使用 resume
    const seen2: Parameters<ResolveLaunch>[0][] = [];
    await processWorker({ runsDir: f.runs, resolveLaunch: launcher(f, seen2) }).run(input({ round: 2, resume: { nativeSessionId: "abc-0", prompt: "继续" } }));
    expect(seen2[0]).toMatchObject({ resume: "abc-0" });
    expect(seen2[0]?.sessionId).toBeUndefined();
  });

  test("resolveLaunch 失败（例如 CLI 未安装）→ failed，带原因，不留下运行目录", async () => {
    const f = fakeCli("true");
    const w = processWorker({
      runsDir: f.runs,
      resolveLaunch: async () => {
        throw new Error("未检测到 Codex");
      },
    });
    expect(await w.run(input({ provider: "codex" }))).toMatchObject({ state: "failed", message: "未检测到 Codex" });
    expect(existsSync(path.join(f.runs, "run-1"))).toBe(false);
  });

  test("最终消息含 agent-autoloop 提问 → waiting_input，带问题", async () => {
    const msg = '需要确认\\n```agent-autoloop\\n{\\"ask\\":[{\\"id\\":\\"q-1\\",\\"text\\":\\"覆盖吗\\"}]}\\n```';
    const f = fakeCli(`cat > /dev/null\nprintf '%s\\n' '{"type":"result","result":"${msg}","session_id":"abc-2","is_error":false}'`);
    const out = await processWorker({ runsDir: f.runs, resolveLaunch: launcher(f) }).run(input());
    expect(out).toMatchObject({ state: "waiting_input", nativeSessionId: "abc-2" });
    expect(out?.questions[0]).toMatchObject({ id: "q-1", text: "覆盖吗" });
  });

  test("ACC-AU-06：引擎停止等待（模拟退出）后 CLI 继续运行；重新接管得到 succeeded，且不会启动第二个进程", async () => {
    const f = fakeCli(`cat > /dev/null\nsleep 1.5\nprintf '%s\\n' '{"type":"result","result":"后台完成","session_id":"abc-3","is_error":false}'`);
    const w1 = processWorker({ runsDir: f.runs, resolveLaunch: launcher(f) });
    const stop = new AbortController();
    const first = w1.run(input({ stopWaiting: stop.signal }));
    await new Promise((r) => setTimeout(r, 600));
    stop.abort(); // 引擎关闭：只停止等待
    expect(await first).toBeNull();
    expect(supervisorAlive(roundDir(f.runs, "run-1", 1))).toBe(true);
    // “重启”：新的 worker 实例接管
    const w2 = processWorker({ runsDir: f.runs, resolveLaunch: launcher(f) });
    const out = await w2.adopt({ runId: "run-1", provider: "claude", round: 1, signal: new AbortController().signal });
    expect(out).toMatchObject({ state: "succeeded", message: "后台完成", nativeSessionId: "abc-3" });
    expect(calls(f.count)).toBe(1);
    expect(await w2.run(input())).toMatchObject({ state: "failed", message: "这一轮已经启动过" }); // 同一轮不会再启动第二个进程
  });

  test("ACC-AU-07：没有监督进程也没有结果 → unknown（立刻判定，不等握手超时）", async () => {
    const f = fakeCli("true");
    mkdirSync(roundDir(f.runs, "run-gone", 1), { recursive: true });
    const t0 = Date.now();
    const out = await processWorker({ runsDir: f.runs, resolveLaunch: launcher(f) }).adopt({ runId: "run-gone", provider: "claude", round: 1, signal: new AbortController().signal });
    expect(out?.state).toBe("unknown");
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  test("取消：结束 CLI 进程树，结果为 cancelled", async () => {
    const f = fakeCli("cat > /dev/null\nsleep 30");
    const w = processWorker({ runsDir: f.runs, resolveLaunch: launcher(f) });
    const c = new AbortController();
    const p = w.run(input({ signal: c.signal }));
    await new Promise((r) => setTimeout(r, 700));
    c.abort();
    expect(await p).toMatchObject({ state: "cancelled" });
  }, 15_000);

  test("CLI 非零退出 → failed，带 stderr 末尾；一轮的输出在各自目录里，续跑不会覆盖上一轮", async () => {
    const f = fakeCli(`cat > /dev/null\necho 坏了 >&2\nexit 3`);
    const w = processWorker({ runsDir: f.runs, resolveLaunch: launcher(f) });
    const a = await w.run(input());
    expect(a).toMatchObject({ state: "failed", exitCode: 3 });
    expect(a?.message).toContain("坏了");
    const b = await w.run(input({ round: 2, resume: { nativeSessionId: "abc-1", prompt: "继续" } }));
    expect(b?.state).toBe("failed");
    expect(existsSync(path.join(roundDir(f.runs, "run-1", 1), "exit.json"))).toBe(true);
    expect(existsSync(path.join(roundDir(f.runs, "run-1", 2), "exit.json"))).toBe(true);
  });

  test("监督进程被杀后 CLI 成了孤儿：roundActive 仍为 true（重试不会并发启动第二个），取消能杀掉它", async () => {
    const f = fakeCli("cat > /dev/null\nsleep 30");
    const w = processWorker({ runsDir: f.runs, resolveLaunch: launcher(f) });
    const stop = new AbortController();
    const first = w.run(input({ stopWaiting: stop.signal }));
    await new Promise((r) => setTimeout(r, 700));
    stop.abort();
    await first;
    const dir = roundDir(f.runs, "run-1", 1);
    const sup = readSupervisor(dir)!;
    process.kill(sup.supervisorPid, "SIGKILL"); // 监督进程被杀，CLI（自己的进程组）还活着
    await new Promise((r) => setTimeout(r, 200));
    expect(supervisorAlive(dir)).toBe(false);
    expect(roundActive(dir)).toBe(true);
    const c = new AbortController();
    c.abort(); // 用户在监督进程已死时取消
    expect(await w.adopt({ runId: "run-1", provider: "claude", round: 1, signal: c.signal })).toMatchObject({ state: "cancelled" });
    await new Promise((r) => setTimeout(r, 300));
    expect(roundActive(dir)).toBe(false);
  }, 30_000);

  test("重启对账判定 unknown 后孤儿 CLI 仍在跑：killRound 能结束它，之后 roundActive 为 false", async () => {
    const f = fakeCli("cat > /dev/null\nsleep 31");
    const w = processWorker({ runsDir: f.runs, resolveLaunch: launcher(f) });
    const stop = new AbortController();
    const first = w.run(input({ stopWaiting: stop.signal }));
    await new Promise((r) => setTimeout(r, 700));
    stop.abort();
    await first;
    const dir = roundDir(f.runs, "run-1", 1);
    const sup = readSupervisor(dir)!;
    process.kill(sup.supervisorPid, "SIGKILL");
    await new Promise((r) => setTimeout(r, 200));
    expect((await w.adopt({ runId: "run-1", provider: "claude", round: 1, signal: new AbortController().signal }))?.state).toBe("unknown"); // 重启后的对账：无法确认
    expect(roundActive(dir)).toBe(true); // CLI 还在
    killRound(dir);
    await new Promise((r) => setTimeout(r, 300));
    expect(roundActive(dir)).toBe(false);
    expect(() => process.kill(sup.workerPid!, 0)).toThrow(); // CLI 已被结束
  }, 30_000);

  test("非法 runId（路径穿越）被拒绝；握手超时判定为 lost", async () => {
    const f = fakeCli("true");
    const w = processWorker({ runsDir: f.runs, resolveLaunch: launcher(f) });
    expect(await w.run(input({ runId: "../../etc" }))).toMatchObject({ state: "failed" });
    const d = path.join(f.runs, "nobody");
    mkdirSync(d, { recursive: true });
    expect(await waitExit(d, { handshakeMs: 100, pollMs: 20 })).toMatchObject({ kind: "lost" });
  });
});
