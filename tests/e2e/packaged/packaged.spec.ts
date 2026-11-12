/* oxlint-disable typescript/no-explicit-any */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * 打包后的 E2E 子集（release.md §5）：对安装/解包后的可执行文件运行。
 * 用法：HUHU_PACKAGED_EXE=<可执行文件> pnpm e2e:packaged
 * （Linux 解包目录：apps/desktop/release/linux-unpacked/huhu；CI 需要 xvfb-run。）
 */
const EXE = process.env["HUHU_PACKAGED_EXE"];
test.skip(!EXE, "需要 HUHU_PACKAGED_EXE 指向打包后的可执行文件");

async function start(): Promise<{ app: ElectronApplication; page: Page; vault: string; call(cap: string, input?: unknown): Promise<any>; stop(): Promise<void> }> {
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-pk-"));
  // 不传 HUHU_HERDR_BIN：必须用随包的 Herdr Core，而不是源码树里的那份
  const env = { ...process.env, HUHU_VAULT: vault } as Record<string, string>;
  delete env["HUHU_HERDR_BIN"];
  const app = await electron.launch({ executablePath: EXE!, args: ["--no-sandbox"], env });
  const page = await app.firstWindow();
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
  const ep = await page.evaluate(() => window.huhuHost.engine());
  const call = (capability: string, input: unknown = {}) =>
    page.evaluate(
      async ([e, cap, inp]) => {
        const r = await fetch(`${e.baseUrl}/api/v1/call`, {
          method: "POST",
          headers: { authorization: `Bearer ${e.token}`, "content-type": "application/json" },
          body: JSON.stringify({ capability: cap, input: inp, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
        });
        return r.json();
      },
      [ep, capability, input] as const,
    );
  return {
    app,
    page,
    vault,
    call,
    stop: async () => {
      // 退出后 Engine 进程必须在 10 秒内消失（Herdr Core 允许保留）
      const runtime = path.join(vault, ".huhu", "runtime");
      let pid = 0;
      try {
        const d = readdirSync(runtime)[0];
        if (d) pid = Number(readFileSync(path.join(runtime, d, "engine.json"), "utf8").match(/"pid":(\d+)/)?.[1]);
      } catch {
        // 没有端点描述：Engine 已自行清理
      }
      await app.close();
      expect(pid, "没有找到 Engine 端点描述，无法检查退出").toBeGreaterThan(0);
      if (pid > 0) {
        const deadline = Date.now() + 10_000;
        const alive = () => {
          try {
            process.kill(pid, 0);
            return true;
          } catch {
            return false;
          }
        };
        while (alive() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
        expect(alive(), "Engine 进程在退出后 10 秒内仍存在").toBe(false);
      }
      // Windows 上 Herdr Core 等后台进程可能还占着 Vault 里的文件（EPERM）：重试，仍不行就留给系统清理
      try {
        rmSync(vault, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      } catch (e) {
        if (process.platform !== "win32") throw e;
      }
    },
  };
}

test("打包后：创建笔记并保存；新建任务并勾选；导出数据包", async () => {
  const s = await start();
  try {
    const note = await s.call("notes.create", { name: "打包冒烟" });
    expect(note.ok).toBe(true);
    const cur = await s.call("notes.read", { path: note.data.path });
    expect((await s.call("notes.save", { path: note.data.path, text: "# 打包冒烟\n\n正文\n", expectedVersion: cur.data.version })).ok).toBe(true);
    expect(readFileSync(path.join(s.vault, note.data.path), "utf8")).toContain("正文");

    const task = await s.call("tasks.create", { title: "打包后的任务" });
    expect(task.ok).toBe(true);
    const done = await s.call("tasks.setCompleted", { id: task.data.id, completed: true, expectedVersion: task.data.version });
    expect(done.data.completed).toBe(true);

    const out = path.join(mkdtempSync(path.join(tmpdir(), "huhu-pk-out-")), "导出.zip");
    const exp = await s.call("vault.exportPackage", { dest: out });
    expect(exp.ok).toBe(true);
    expect(existsSync(out)).toBe(true);
    rmSync(path.dirname(out), { recursive: true, force: true });
  } finally {
    await s.stop();
  }
});

test("打包后：随包 Herdr Core 可用——Space 里启动 shell 会话，Core 状态为已连接", async () => {
  const s = await start();
  try {
    const health = await s.call("health.run", {});
    expect(health.ok).toBe(true);
    // Vault 根目录启动时已有默认 Space
    const spaces = await s.call("agent.spaces.list", {});
    const space = { data: spaces.data[0] };
    expect(space.data, JSON.stringify(spaces)).toBeTruthy();
    const sess = await s.call("agent.sessions.launch", { spaceId: space.data.id, spaceRevision: space.data.revision, provider: "shell", requestId: "packaged-shell-1" });
    expect(sess.ok, JSON.stringify(sess)).toBe(true);
    await expect.poll(async () => (await s.call("agent.core.status", {})).data?.state, { timeout: 15_000 }).toBe("connected");
    // 终端：经 WebSocket 发送 echo，读到输出（验证随包 Herdr 的 PTY 与桥接）
    const ep = await s.page.evaluate(() => window.huhuHost.engine());
    const out = await s.page.evaluate(
      async ([e, id]) =>
        new Promise<string>((resolve) => {
          const ws = new WebSocket(`${e.baseUrl.replace(/^http/, "ws")}/ws/terminal/${id}?cols=80&rows=24`, [`bearer.${e.token}`]);
          ws.binaryType = "arraybuffer";
          let text = "";
          ws.onopen = () => setTimeout(() => ws.send(new TextEncoder().encode("echo packaged-$((20+22))\n")), 800);
          ws.onmessage = (m) => {
            if (typeof m.data !== "string") text += new TextDecoder().decode(m.data as ArrayBuffer);
            if (text.includes("packaged-42")) {
              ws.close();
              resolve(text);
            }
          };
          setTimeout(() => resolve(text), 15_000);
        }),
      [ep, sess.data.id] as const,
    );
    expect(out).toContain("packaged-42");
    await s.call("agent.sessions.kill", { id: sess.data.id });
  } finally {
    await s.stop();
  }
});

test("打包后：随包命令行 huhu --version 与应用版本一致，huhu call vault.info 返回 ok", async () => {
  const s = await start();
  try {
    // 随包命令行的位置：Windows / Linux 在可执行文件旁的 resources/bin；macOS 在 HUHU.app/Contents/Resources/bin
    const resources = process.platform === "darwin" ? path.join(path.dirname(EXE!), "..", "Resources") : path.join(path.dirname(EXE!), "resources");
    const bin = path.join(resources, "bin", process.platform === "win32" ? "huhu.cmd" : "huhu");
    expect(existsSync(bin)).toBe(true);
    // Node 不允许不经 shell 直接 spawn .cmd（EINVAL）
    const run = (args: string[]) => execFileSync(process.platform === "win32" ? `"${bin}"` : bin, args, { encoding: "utf8", timeout: 30_000, ...(process.platform === "win32" ? { shell: true } : {}) });
    const info = await s.page.evaluate(() => window.huhuHost.appInfo());
    const version = run(["--version"]).trim();
    expect(version).toBe(info.version);
    const out = run(["call", "vault.info", "--vault", process.platform === "win32" ? `"${s.vault}"` : s.vault, "--json"]);
    expect(JSON.parse(out).ok).toBe(true);
  } finally {
    await s.stop();
  }
});

test("打包后：Agent 规则经监督进程运行（fake provider），运行页显示已完成与结果", async () => {
  test.skip(process.platform === "win32", "用 POSIX 脚本冒充 claude；Windows 需要 .cmd 假程序，待补");
  const { chmodSync, writeFileSync: write } = await import("node:fs");
  const bin = mkdtempSync(path.join(tmpdir(), "huhu-pk-bin-"));
  write(path.join(bin, "claude"), '#!/bin/sh\ncase "$*" in *" -p"*|"-p "*) cat >/dev/null; printf \'%s\\n\' \'{"type":"result","result":"周报已整理","session_id":"pk-sess-1","is_error":false}\';; *) echo \'2.0.0 (Claude Code)\';; esac\n');
  chmodSync(path.join(bin, "claude"), 0o755);
  const vault = mkdtempSync(path.join(tmpdir(), "huhu-pk-"));
  const env = { ...process.env, HUHU_VAULT: vault, PATH: `${bin}${path.delimiter}${process.env["PATH"] ?? ""}` } as Record<string, string>;
  delete env["HUHU_HERDR_BIN"];
  const app = await electron.launch({ executablePath: EXE!, args: ["--no-sandbox"], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByTestId("rule-new").click();
    const editor = page.getByTestId("rule-editor");
    await editor.getByLabel("规则名称").fill("打包后的规则");
    await editor.getByTestId("rule-kind").selectOption("agent_prompt");
    await expect(editor.getByTestId("rule-provider")).toContainText("Claude Code", { timeout: 15_000 });
    await editor.getByTestId("rule-space").selectOption({ index: 1 });
    await editor.getByTestId("rule-provider").selectOption("claude");
    await editor.getByTestId("rule-prompt").fill("请整理本周的工作记录。");
    await editor.getByTestId("rule-save").click();
    await page.getByTestId("rule-row").filter({ hasText: "打包后的规则" }).click();
    await page.getByRole("button", { name: "立即运行" }).click();
    await page.getByRole("button", { name: "运行", exact: true }).click();
    const row = page.getByTestId("run-row").filter({ hasText: "打包后的规则" });
    await expect(row).toContainText("已完成", { timeout: 30_000 });
    await row.getByRole("button").first().click();
    await expect(page.getByTestId("run-body")).toContainText("周报已整理");
  } finally {
    await app.close();
    rmSync(vault, { recursive: true, force: true });
    rmSync(bin, { recursive: true, force: true });
  }
});
