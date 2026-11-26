import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { FileSession } from "../../../plugins/ssh/src/shared/files.js";
import type { ForwardRule, ForwardRun } from "../../../plugins/ssh/src/shared/forwarding.js";
import type { MonitorSession } from "../../../plugins/ssh/src/shared/monitoring.js";
import type { TransferJob, TransferQueue } from "../../../plugins/ssh/src/shared/transfers.js";
import type { ConnectionStatus } from "../../../plugins/ssh/src/shared/trust.js";
import type { WorkspaceRun } from "../../../plugins/ssh/src/shared/workspace.js";
import { LINUX_SAMPLE, PLATFORM_COMMAND } from "../../../plugins/ssh/src/engine/monitor-sample.js";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import { openApp } from "../helpers/launch.js";
import { desktopCall } from "./workbench.js";

async function bindLoopback(port = 0) {
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Loopback listener must use TCP");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function trust(page: Page, hostId: string, remember = false) {
  const status = () => desktopCall<ConnectionStatus[]>(page, "ssh.connections.status").then((entries) => entries.find((entry) => entry.hostId === hostId));
  await desktopCall(page, "ssh.connect", { hostId, background: true });
  await expect.poll(async () => (await status())?.state).toBe("waiting");
  const pending = await status();
  if (pending?.state !== "waiting") throw new Error("Missing SSH host-key prompt");
  expect(await desktopCall(page, "ssh.hostKey.decide", { attemptId: pending.attemptId, hop: pending.prompt.hop, promptId: pending.prompt.promptId, accept: true, remember })).toEqual({ applied: true });
  return status;
}

test("H12.1 Engine 异常退出释放转发并留下唯一传输终态，原工作区可重新连接", async () => {
  test.skip(process.platform !== "linux", "需要 Linux SIGKILL");
  test.setTimeout(70_000);
  let releaseWrite!: () => void;
  const holdWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
  const target = "/home/test/crash-target.bin";
  let writes = 0;
  const server = await startFakeSsh({ waitWriteFile(file) {
    if (!file.endsWith(".part")) return;
    writes++;
    return holdWrite;
  } });
  try {
    const app = await openApp();
    const { page, vault } = app;
    const call = <T>(capability: string, input?: unknown) => desktopCall<T>(page, capability, input);
    try {
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
      const { hostId } = await call<{ hostId: string }>("ssh.hosts.configure", {
        name: "异常退出主机", host: "127.0.0.1", port: server.port, user: "fixture", authKind: "password", expectedRevision: null,
        credentials: [{ purpose: "password", action: "replace", value: "pw" }],
      });
      const status = await trust(page, hostId, true);
      await expect.poll(async () => (await status())?.state).toBe("connected");
      const started = await call<WorkspaceRun>("ssh.workspace.runs.start", { name: "异常退出原工作区", layout: { kind: "one" }, panes: [{ hostId }] });
      const workspace = () => call<WorkspaceRun[]>("ssh.workspace.runs.list").then((runs) => runs.find(({ id }) => id === started.id));
      await expect.poll(async () => (await workspace())?.panes[0]?.phase).toBe("ready");
      const shellId = (await workspace())?.panes[0]?.sessionId;
      expect(shellId).toBeTruthy();
      const { fileSessionId } = await call<FileSession>("ssh.fileSessions.open", { hostId, shellId });
      const listenPort = await bindLoopback();
      const rule = await call<ForwardRule>("ssh.forwarding.rules.save", { name: "异常退出转发", hostId, mode: "socks5", listenPort, resume: false });
      await call("ssh.forwarding.runs.start", { id: rule.id, expectedRevision: rule.revision });
      await expect.poll(async () => (await call<ForwardRun[]>("ssh.forwarding.runs.list")).find(({ ruleId }) => ruleId === rule.id)?.state).toBe("running");
      await expect(bindLoopback(listenPort)).rejects.toMatchObject({ code: "EADDRINUSE" });
      const source = path.join(vault, "crash-source.bin");
      await writeFile(source, Buffer.alloc(96 * 1024, 23));
      const { transferId } = await call<TransferJob>("ssh.transfers.start", { source: { kind: "local", path: source }, target: { kind: "remote", path: target, fileSessionId } });
      const job = () => call<TransferQueue>("ssh.transfers.list").then(({ jobs }) => jobs.filter((item) => item.transferId === transferId));
      await expect.poll(() => writes).toBeGreaterThan(0);
      expect(await job()).toMatchObject([{ state: "running" }]);
      const writesBeforeCrash = writes;

      const endpoint = await page.evaluate(async () => {
        const { baseUrl, vaultId } = await window.huhuHost.engine();
        return { port: Number(new URL(baseUrl).port), vaultId };
      });
      const runtime = path.join(vault, ".huhu", "runtime");
      const descriptors = await Promise.all((await readdir(runtime)).map(async (machine) => JSON.parse(await readFile(path.join(runtime, machine, "engine.json"), "utf8")) as { pid: number; port: number; vaultId: string }));
      const engine = descriptors.find(({ port, vaultId }) => port === endpoint.port && vaultId === endpoint.vaultId);
      expect(engine?.pid).toBeGreaterThan(1);
      process.kill(engine!.pid, "SIGKILL");
      await expect(page.getByText("工作台引擎未连接")).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => server.closed()).toBe(server.conns.length);
      await expect(bindLoopback(listenPort)).resolves.toBe(listenPort);

      await page.getByRole("button", { name: "重启引擎" }).click();
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
      expect(await call("ssh.shells.list")).toEqual([]);
      expect(await call("ssh.fileSessions.list")).toEqual([]);
      expect(await call("ssh.forwarding.runs.list")).toEqual([]);
      expect(await workspace()).toMatchObject({ panes: [{ phase: "reconnect" }] });
      expect((await workspace())?.panes[0]?.sessionId).toBeUndefined();
      expect(await job()).toEqual([expect.objectContaining({ transferId, state: "failed", message: expect.stringContaining("引擎异常退出") })]);
      await expect(call("ssh.transfers.retry", { transferId })).rejects.toThrow("重新发起并核对目标");

      await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
      await page.getByRole("button", { name: "工作区", exact: true }).click();
      await page.getByRole("button", { name: /异常退出原工作区.*代次 1/ }).click();
      await page.getByRole("button", { name: "重连工作区", exact: true }).click();
      const pane = page.getByTestId("ssh-workspace-run-pane");
      await expect(pane.getByTestId("terminal-view").locator(".xterm-rows")).toContainText("welcome");
      expect(await pane.getAttribute("data-session-id")).not.toBe(shellId);
      expect(writes).toBe(writesBeforeCrash);
      expect(server.fs.files.has(target)).toBe(false);
    } finally {
      releaseWrite();
      await app.close();
    }
  } finally {
    await server.close();
  }
});

test("H12.1 新格式备份恢复主机和跳板路由，重配设备凭据后可连接", async () => {
  test.setTimeout(60_000);
  const password = randomUUID();
  const jump = await startFakeSsh({ password });
  const target = await startFakeSsh({ password });
  const fixture = await mkdtemp(path.join(tmpdir(), "huhu-ssh-backup-"));
  try {
    const app = await openApp();
    const { page } = app;
    const call = <T>(capability: string, input?: unknown) => desktopCall<T>(page, capability, input);
    try {
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
      const configure = (name: string, port: number, jumpHostIds: string[], current?: { id: string; revision: string }) =>
        call<{ hostId: string }>("ssh.hosts.configure", {
          name, host: "127.0.0.1", port, user: "fixture", authKind: "password", jumpHostIds,
          ...(current && { hostId: current.id }), expectedRevision: current?.revision ?? null,
          credentials: [{ purpose: "password", action: "replace", value: password, ...(current && { reconfigure: true }) }],
        });
      const { hostId: jumpId } = await configure("可恢复跳板", jump.port, []);
      const { hostId } = await configure("可恢复目标", target.port, [jumpId]);
      const zipPath = path.join(fixture, "ssh-new.zip");
      const targetDir = path.join(fixture, "restored");
      const exported = await call<{ vaultId: string; sha256: string }>("vault.exportPackage", { dest: zipPath });
      expect(exported.sha256).toMatch(/^[0-9a-f]{64}$/);
      const imported = await call<{ vaultId: string }>("vault.importPackage", { zipPath, targetDir });
      expect(imported.vaultId).not.toBe(exported.vaultId);
      expect(await page.evaluate((location) => window.huhuHost.vault.open(location), targetDir)).toMatchObject({ ok: true });
      await expect.poll(() => page.evaluate(async () => (await window.huhuHost.engine()).vaultId)).toBe(imported.vaultId);
      const hosts = await call<Array<{ id: string; revision: string; name: string; jumpHostIds: string[]; authState: { password: string } }>>("ssh.hosts.list");
      const restoredJump = hosts.find(({ id }) => id === jumpId);
      const restoredTarget = hosts.find(({ id }) => id === hostId);
      expect(restoredJump).toMatchObject({ name: "可恢复跳板", jumpHostIds: [], authState: { password: "needs-reconfiguration" } });
      expect(restoredTarget).toMatchObject({ name: "可恢复目标", jumpHostIds: [jumpId], authState: { password: "needs-reconfiguration" } });
      expect(JSON.stringify(hosts)).not.toContain(password);
      await configure("可恢复跳板", jump.port, [], restoredJump!);
      await configure("可恢复目标", target.port, [jumpId], restoredTarget!);
      const status = await trust(page, hostId);
      await expect.poll(async () => {
        const pending = await status();
        return pending?.state === "waiting" ? pending.prompt.fingerprint : undefined;
      }).toBe(target.fingerprint);
      const pending = await status();
      if (pending?.state !== "waiting") throw new Error("Missing restored target prompt");
      await call("ssh.hostKey.decide", { attemptId: pending.attemptId, hop: pending.prompt.hop, promptId: pending.prompt.promptId, accept: true });
      await expect.poll(async () => (await status())?.state).toBe("connected");
      expect(jump.conns).toHaveLength(1);
      expect(target.conns).toHaveLength(1);
    } finally {
      await app.close();
    }
  } finally {
    await Promise.all([jump.close(), target.close()]);
    await rm(fixture, { recursive: true, force: true, maxRetries: 5 });
  }
});

for (const mode of ["停用插件", "切换 Vault"] as const) {
  test(`H12.1 ${mode}回收活跃 SSH 对象并拒绝旧代答复`, async () => {
    test.setTimeout(55_000);
    let releaseWrite!: () => void;
    const blockedWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const finalPath = "/home/test/lifecycle.bin";
    let staged = false;
    const server = await startFakeSsh({
      onExec(command) {
        if (command === PLATFORM_COMMAND) return { stdout: "Linux" };
        if (command === LINUX_SAMPLE) return { stdout: "memory 8192 4096" };
      },
      waitWriteFile(file) {
        if (!file.startsWith("/home/test/")) return;
        staged = true;
        return blockedWrite;
      },
    });
    const challenge = await startFakeSsh({ keyboardResponse: "a discarded fixture answer" });
    const nextVault = await mkdtemp(path.join(tmpdir(), "huhu-ssh-next-vault-"));
    const app = await openApp();
    try {
      const { page, vault } = app;
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
      const createHost = (name: string, port: number) => desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
        name, host: "127.0.0.1", port, user: "fixture", authKind: "password", expectedRevision: null,
        credentials: [{ purpose: "password", action: "replace", value: "pw" }],
      });
      const { hostId: liveId } = await createHost("生命周期活跃主机", server.port);
      const waiting = await createHost("生命周期等待主机", challenge.port);
      const activeStatus = await trust(page, liveId);
      await expect.poll(async () => (await activeStatus())?.state).toBe("connected");
      const shell = await desktopCall<{ id: string }>(page, "ssh.shells.open", { hostId: liveId });
      const files = await desktopCall<FileSession>(page, "ssh.fileSessions.open", { hostId: liveId });
      const monitor = await desktopCall<MonitorSession>(page, "ssh.monitor.session.open", { hostId: liveId, shellId: shell.id, interval: 1 });
      await expect.poll(async () => (await desktopCall<MonitorSession>(page, "ssh.monitor.session.get", { id: monitor.id })).host.state).toBe("running");
      const listenPort = await bindLoopback();
      const rule = await desktopCall<ForwardRule>(page, "ssh.forwarding.rules.save", { name: "生命周期转发", hostId: liveId, mode: "socks5", listenPort, resume: false });
      await desktopCall(page, "ssh.forwarding.runs.start", { id: rule.id, expectedRevision: rule.revision });
      await expect.poll(async () => (await desktopCall<ForwardRun[]>(page, "ssh.forwarding.runs.list")).find(({ ruleId }) => ruleId === rule.id)?.state).toBe("running");
      await expect(bindLoopback(listenPort)).rejects.toMatchObject({ code: "EADDRINUSE" });

      const source = path.join(vault, "lifecycle-source.bin");
      await writeFile(source, Buffer.alloc(96 * 1024, 17));
      const running = await desktopCall<TransferJob>(page, "ssh.transfers.start", {
        source: { kind: "local", path: source }, target: { kind: "remote", path: finalPath, fileSessionId: files.fileSessionId },
      });
      await expect.poll(() => staged).toBe(true);
      expect((await desktopCall<TransferQueue>(page, "ssh.transfers.list")).jobs.find(({ transferId }) => transferId === running.transferId)?.state).toBe("running");
      const waitingStatus = await trust(page, waiting.hostId);
      await expect.poll(async () => (await waitingStatus())?.state).toBe("auth-waiting");
      const old = await waitingStatus();
      if (old?.state !== "auth-waiting") throw new Error("Missing pending authentication before cutover");

      const note = await desktopCall<{ id: string }>(page, "notes.create", { name: "接续笔记" });
      expect(note.id).toBeTruthy();
      if (mode === "停用插件") {
        expect(await desktopCall(page, "plugins.setEnabled", { id: "ssh", enabled: false })).toMatchObject({ state: "disabled" });
        await expect(desktopCall(page, "ssh.connections.status")).rejects.toThrow();
        await expect(desktopCall(page, "notes.list")).resolves.toBeDefined();
        await desktopCall(page, "plugins.setEnabled", { id: "ssh", enabled: true });
      } else {
        expect(await page.evaluate((target) => window.huhuHost.vault.open(target, { kind: "new" }), nextVault)).toMatchObject({ ok: true });
        await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
        await expect(desktopCall(page, "ssh.hosts.list")).resolves.toEqual([]);
        await expect(desktopCall(page, "notes.list")).resolves.toBeDefined();
      }
      await expect.poll(() => server.closed()).toBe(1);
      await expect.poll(() => challenge.closed()).toBe(1);
      await expect.poll(() => bindLoopback(listenPort).then(() => true, () => false)).toBe(true);
      releaseWrite();
      expect(await desktopCall(page, "ssh.authentication.answer", {
        attemptId: old.attemptId, hop: old.authPrompt.hop, promptId: old.authPrompt.promptId, answers: ["a discarded fixture answer"],
      })).toEqual({ applied: false });
      expect(await desktopCall(page, "ssh.connections.status")).toEqual([]);
      expect(await desktopCall(page, "ssh.shells.list")).toEqual([]);
      expect(await desktopCall(page, "ssh.fileSessions.list")).toEqual([]);
      expect(await desktopCall(page, "ssh.forwarding.runs.list")).toEqual([]);
      expect(await desktopCall<TransferQueue>(page, "ssh.transfers.list")).toMatchObject({ jobs: [] });
      await expect(desktopCall(page, "ssh.monitor.session.get", { id: monitor.id })).rejects.toThrow("NOT_FOUND");
      expect(server.fs.files.has(finalPath)).toBe(false);
    } finally {
      releaseWrite();
      await app.close();
      await Promise.all([server.close(), challenge.close()]);
      await rm(nextVault, { recursive: true, force: true, maxRetries: 5 });
    }
  });
}
