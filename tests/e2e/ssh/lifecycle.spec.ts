import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { FileSession } from "../../../plugins/ssh/src/shared/files.js";
import type { ForwardRule, ForwardRun } from "../../../plugins/ssh/src/shared/forwarding.js";
import type { MonitorSession } from "../../../plugins/ssh/src/shared/monitoring.js";
import type { TransferJob, TransferQueue } from "../../../plugins/ssh/src/shared/transfers.js";
import type { ConnectionStatus } from "../../../plugins/ssh/src/shared/trust.js";
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

async function trust(page: Page, hostId: string) {
  const status = () => desktopCall<ConnectionStatus[]>(page, "ssh.connections.status").then((entries) => entries.find((entry) => entry.hostId === hostId));
  await desktopCall(page, "ssh.connect", { hostId, background: true });
  await expect.poll(async () => (await status())?.state).toBe("waiting");
  const pending = await status();
  if (pending?.state !== "waiting") throw new Error("Missing SSH host-key prompt");
  expect(await desktopCall(page, "ssh.hostKey.decide", { attemptId: pending.attemptId, hop: pending.prompt.hop, promptId: pending.prompt.promptId, accept: true })).toEqual({ applied: true });
  return status;
}

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
