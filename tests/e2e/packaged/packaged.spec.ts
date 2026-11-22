/* oxlint-disable typescript/no-explicit-any */
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { execFile, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { openImapFixture } from "../../../plugins/mail/test/fixtures/imap.js";
import { USER_DATA_ARG } from "../helpers/launch.js";

/**
 * 打包后的 E2E 子集（release.md §5）：对安装/解包后的可执行文件运行。
 * 用法：HUHU_PACKAGED_EXE=<可执行文件> pnpm e2e:packaged
 * （Linux 解包目录：apps/desktop/release/linux-unpacked/huhu；CI 需要 xvfb-run。）
 */
const EXE = process.env["HUHU_PACKAGED_EXE"];
test.skip(!EXE, "需要 HUHU_PACKAGED_EXE 指向打包后的可执行文件");

async function start(vault = mkdtempSync(path.join(tmpdir(), "huhu-pk-"))): Promise<{ app: ElectronApplication; page: Page; vault: string; call(cap: string, input?: unknown): Promise<any>; stop(): Promise<void> }> {
  // 不传 HUHU_HERDR_BIN：必须用随包的 Herdr Core，而不是源码树里的那份
  const env = { ...process.env, HUHU_VAULT: vault } as Record<string, string>;
  delete env["HUHU_HERDR_BIN"];
  const app = await electron.launch({ executablePath: EXE!, args: ["--no-sandbox", USER_DATA_ARG], env });
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
    const done = await s.call("tasks.setStatus", { id: task.data.id, status: "completed", expectedVersion: task.data.version });
    expect(done.data.status).toBe("completed");

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
          // Windows 的 shell 是 PowerShell（启动 / PSReadLine 初始化更慢，输入太早会被吞）：等久一点，并用 PowerShell 的写法
          const win = /Windows/i.test(navigator.userAgent);
          ws.onopen = () => setTimeout(() => ws.send(new TextEncoder().encode(win ? 'Write-Output ("packaged-" + (20+22))\r' : "echo packaged-$((20+22))\n")), win ? 5000 : 800);
          ws.onmessage = (m) => {
            if (typeof m.data !== "string") text += new TextDecoder().decode(m.data as ArrayBuffer);
            if (text.includes("packaged-42")) {
              ws.close();
              resolve(text);
            }
          };
          setTimeout(() => resolve(text), 25_000);
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
    expect((await s.call("gateway.update", { capability: "vault.info", exposed: true })).ok).toBe(true);
    const out = run(["call", "vault.info", "--vault", process.platform === "win32" ? `"${s.vault}"` : s.vault, "--json"]);
    expect(JSON.parse(out).ok).toBe(true);
  } finally {
    await s.stop();
  }
});

test("打包后：自动化发生、运行抽屉与任务详情使用同一笔派遣", async () => {
  const { page, call, vault, stop } = await start();
  try {
    const spaces = await call("agent.spaces.list");
    expect(spaces.ok).toBe(true);
    const [{ id: spaceId }] = spaces.data as { id: string }[];
    const created = await call("tasks.create", {
      title: "打包后的原任务",
      type: "agent",
      body: "只发送给选定的原会话",
      execution: { spaceId, target: { mode: "existing", sessionId: "missing-packaged-test-session" } },
    });
    expect(created.ok).toBe(true);
    const taskId = created.data.id as string;
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByTestId("rule-new").click();
    await page.getByLabel("规则名称").fill("打包后的规则");
    await page.getByTestId("rule-kind").selectOption("agent_tasks");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await page.getByTestId("rule-row").filter({ hasText: "打包后的规则" }).click();
    await page.getByRole("button", { name: "立即运行" }).click();
    await expect.poll(async () => (await call("tasks.dispatch.list", { taskId })).data, { timeout: 25_000 }).toMatchObject([{ dispatchId: expect.stringMatching(/^scan-/), state: "blocked" }]);
    const [{ runId }] = (await call("tasks.dispatch.list", { taskId })).data as { runId: string }[];
    await page.getByRole("button", { name: "运行", exact: true }).click();
    await page.getByRole("button", { name: "打包后的原任务", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "打包后的原任务" });
    await expect(drawer.locator("[data-run-id]")).toHaveAttribute("data-run-id", runId);
    await expect(drawer).toContainText("原会话未连接或已不可用");
    await drawer.getByRole("button", { name: "打开原任务" }).click();
    await expect(page.getByTestId("managed-task-run")).toHaveAttribute("data-run-id", runId);
    expect((await call("tasks.read", { id: taskId })).data.status).toBe("not_started");
    expect((await call("agent.sessions.list", { spaceId })).data).toEqual([]);
    expect(existsSync(path.join(vault, "Task Runs"))).toBe(false);
  } finally {
    await stop();
  }
});

test("打包后：CLI 与 HTTP MCP 逐项授权，Safe 锁定期间读取邮件并恢复新格式备份", async () => {
  test.skip(process.platform !== "linux" || process.env["HUHU_PACKAGED_CREDENTIAL_ACCEPTANCE"] !== "1", "需隔离的 Linux Secret Service 会话和候选安装包");
  test.setTimeout(120_000);
  const fixture = mkdtempSync(path.join(tmpdir(), "huhu-pk-credentials-"));
  const password = randomUUID();
  const imap = await openImapFixture({
    acceptPassword: (candidate) => candidate === password,
    message: { uidValidity: 41, uid: 2, subject: "Backup fixture", source: "From: sender@example.invalid\r\nSubject: Backup fixture\r\n\r\nReadable body" },
  });
  const desktop = async (app: Awaited<ReturnType<typeof start>>, capability: string, input?: unknown) => {
    const result = await app.call(capability, input);
    expect(result, capability).toMatchObject({ ok: true });
    return result.data;
  };
  let app: Awaited<ReturnType<typeof start>> | undefined;
  try {
    const source = (app = await start(mkdtempSync(path.join(fixture, "vault-"))));
    const bin = path.join(path.dirname(EXE!), "resources", "bin", "huhu");
    const run = promisify(execFile);
    const cli = async (...args: string[]) => {
      const output = await run(bin, [...args, "--vault", source.vault, "--json"], { encoding: "utf8", timeout: 30_000 }).catch((failure: unknown) => {
        if (failure && typeof failure === "object" && "stdout" in failure && typeof failure.stdout === "string" && failure.stdout.trim()) return { stdout: failure.stdout };
        throw failure;
      });
      return JSON.parse(output.stdout);
    };
    const cliCall = (capability: string, input: unknown = {}, intent?: string) => cli("call", capability, "--input-json", JSON.stringify(input), ...(intent ? ["--intent-key", intent] : []));
    const cliTools = async () => (await cli("capabilities", "list")).data.map(({ name }: { name: string }) => name);

    const ep = await source.page.evaluate(() => window.huhuHost.engine());
    const url = `${ep.baseUrl}/mcp`;
    const { token } = await desktop(source, "gateway.tokens.create", { name: "候选包本机夹具" });
    expect((await mcpRequest(url, token, mcpRpc("tools/list"))).status).toBe(404);
    await desktop(source, "gateway.mcp.update", { enabled: true, transport: "http" });
    const session = await openMcpSession(url, token);
    const rpc = async (method: string, input: unknown = {}) => {
      const response = await mcpRequest(url, token, mcpRpc(method, input), session);
      expect(response.status).toBe(200);
      return (await response.json()).result;
    };
    const mcpTools = async () => (await rpc("tools/list")).tools.map(({ name }: { name: string }) => name.replaceAll("_", "."));
    const mcpCall = async (capability: string, input: unknown) => {
      const value = await rpc("tools/call", { name: capability.replaceAll(".", "_"), arguments: input });
      return value.isError ? { ok: false, error: JSON.parse(value.content[0].text) } : { ok: true, data: value.structuredContent.data };
    };
    expect(await cliTools()).toEqual([]);
    expect(await mcpTools()).toEqual([]);

    const changeAccess = (capability: string, exposed: boolean) => desktop(source, "gateway.update", { capability, exposed });
    const { setupId } = await desktop(source, "mail.accounts.testConnection", {
      requestId: randomUUID(),
      password,
      settings: {
        provider: "custom_imap",
        email: "backup-fixture@example.invalid",
        label: "候选包邮箱",
        auth: "password",
        imap: { host: "127.0.0.1", port: imap.port, security: "none" },
        smtp: { host: "", port: 587, security: "starttls" },
        smtpEnabled: false,
      },
    });
    const { accountId } = await desktop(source, "mail.accounts.save", { setupId, folders: ["INBOX"] });
    const { accounts: mailAccounts } = await desktop(source, "mail.accounts.list");
    const { revision } = mailAccounts.find((entry: { accountId: string }) => entry.accountId === accountId);
    const safePassword = randomUUID();
    const accounts = Array.from({ length: 3 }, (_, n) => ({ account: `备份账号 ${n + 1}`, password: randomUUID() }));
    await desktop(source, "safe.setup", { password: safePassword });
    const safeSession = await desktop(source, "safe.status");
    const { tagId } = await desktop(source, "safe.tags.create", { session: safeSession, expectedRevision: 0, name: "候选包标签", color: "purple" });
    const { entryId, accountIds } = await desktop(source, "safe.entries.create", { session: safeSession, expectedRevision: 1, name: "候选包恢复", accounts, tagIds: [tagId] });
    await desktop(source, "safe.lock");
    expect(await desktop(source, "safe.status")).toMatchObject({ locked: true });

    const refresh = "mail.sync.refresh";
    const request = () => ({ accountId, folder: "INBOX", expectedRevision: revision, requestId: randomUUID() });
    const logins = () => imap.commands.filter((command) => command === "LOGIN").length;
    const closed = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
    expect(await cliCall(refresh, request())).toMatchObject(closed);
    await changeAccess(refresh, true);
    expect(await cliTools()).toEqual([refresh]);
    expect(await mcpTools()).toEqual([refresh]);
    for (const invoke of [cliCall, mcpCall]) {
      const before = logins();
      expect(await invoke(refresh, request())).toMatchObject({ ok: true, data: { message: { localMessageId: expect.any(String) } } });
      expect(logins()).toBeGreaterThan(before);
    }
    await changeAccess(refresh, false);
    expect(await cliCall(refresh, request())).toMatchObject(closed);
    expect(await mcpCall(refresh, request())).toMatchObject(closed);
    expect(await desktop(source, "safe.status")).toMatchObject({ locked: true });

    await changeAccess("vault.exportPackage", true);
    await changeAccess("vault.importPackage", true);
    const packageId = randomUUID();
    const exported = await cliCall("vault.exportPackage", { packageId }, randomUUID());
    expect(exported).toMatchObject({ ok: true, data: { sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) } });
    const archive = exported.data;
    expect(archive.sha256).toBe(createHash("sha256").update(readFileSync(archive.path)).digest("hex"));
    const imported = await cliCall("vault.importPackage", { packageId, restoreId: randomUUID(), expectedSha256: archive.sha256 }, randomUUID());
    expect(imported).toMatchObject({ ok: true, data: { vaultId: expect.any(String), targetDir: expect.any(String) } });
    expect(imported.data.vaultId).not.toBe(ep.vaultId);
    expect(path.relative(fixture, imported.data.targetDir)).not.toMatch(/^(?:\.\.|\/)/u);
    await source.stop();
    app = undefined;

    const restored = (app = await start(imported.data.targetDir));
    expect(await desktop(restored, "mail.accounts.list")).toMatchObject({ accounts: [{ accountId, authState: { "account-password": "needs-reconfiguration" } }] });
    await desktop(restored, "safe.unlock", { password: safePassword });
    const restoredSession = await desktop(restored, "safe.status");
    expect(await desktop(restored, "safe.entries.get", { session: restoredSession, entryId })).toMatchObject({ tagIds: [tagId], accounts: accounts.map(({ account }) => ({ account })) });
    for (const [index, id] of (accountIds as string[]).entries()) {
      expect(await desktop(restored, "safe.accounts.reveal", { session: restoredSession, entryId, accountId: id })).toMatchObject({ password: accounts[index]?.password });
    }
  } finally {
    try {
      await app?.stop();
    } finally {
      await imap.close();
      rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    }
  }
});
