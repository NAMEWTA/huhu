import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { boot } from "../../../apps/engine/src/boot.js";
import { EngineClient } from "../../../packages/workbench/src/engine-client/client.js";
import { LINUX_SAMPLE, PLATFORM_COMMAND, WINDOWS_SAMPLE } from "../src/engine/monitor-sample.js";
import type { MonitorPanel, MonitorPanelRun, MonitorSession, SaveMonitorPanel } from "../src/shared/monitoring.js";
import type { ConnectionStatus, HostKeyPrompt } from "../src/shared/trust.js";
import { startFakeSsh } from "./fake-server.js";

const wait = { timeout: 7500, interval: 30 };
const opts = { write: true };
const windows = { cpu: 25, memory: { total: 8192, available: 2048 }, disk: { mount: "C:", total: 40960, available: 12288 }, network: { received: 35, sent: 12 }, uptimeSec: 120 };

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "huhu-monitor-fixture-"));
  const vaultPath = path.join(root, "vault");
  const desktopUserData = path.join(root, "desktop");
  await Promise.all([mkdir(vaultPath), mkdir(desktopUserData)]);
  const servers: Awaited<ReturnType<typeof startFakeSsh>>[] = [];
  const open = (create: boolean) => boot({ vaultPath, desktopUserData, create });
  let engine = await open(true);
  const clientFor = () => new EngineClient({ baseUrl: `http://127.0.0.1:${engine.port}`, token: engine.rendererToken, vaultId: engine.vault.id });
  return {
    client: clientFor(),
    async host(name: string, platform: "linux" | "windows") {
      let reads = 0;
      let denied = false;
      const server = await startFakeSsh({
        onExec(command) {
          if (command === PLATFORM_COMMAND) return platform === "linux" ? { stdout: "Linux" } : { stderr: "command not found", code: 127 };
          if (command !== (platform === "linux" ? LINUX_SAMPLE : WINDOWS_SAMPLE)) return undefined;
          reads++;
          if (denied) return { stdout: "denied" };
          const linux = `cpu ${readCount(25)} ${readCount(100)}\nmemory 8192 4096\nuptime 3600\nload 1.25\nnet ${readCount(80)} ${readCount(50)}\ndisk 40960 20480\n`;
          return { stdout: platform === "linux" ? linux : JSON.stringify(windows) };
          function readCount(unit: number) {
            return (reads + 10) * unit;
          }
        },
      });
      servers.push(server);
      const saved = await clientFor().call<{ hostId: string }>(
        "ssh.hosts.configure",
        {
          name,
          host: "127.0.0.1",
          port: server.port,
          user: "fixture",
          authKind: "password",
          expectedRevision: null,
          credentials: [{ purpose: "password", action: "replace", value: "pw" }],
        },
        opts,
      );
      return {
        id: saved.hostId,
        server,
        reads: () => reads,
        deny: (value: boolean) => {
          denied = value;
        },
      };
    },
    async reopen() {
      await engine.shutdown();
      engine = await open(false);
      return clientFor();
    },
    async close() {
      await engine.shutdown();
      await Promise.all(servers.map((server) => server.close()));
      await rm(root, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}

async function approve(client: EngineClient, prompt: HostKeyPrompt) {
  const { attemptId, promptId, hop } = prompt;
  expect(await client.call("ssh.hostKey.decide", { attemptId, promptId, hop, accept: true, remember: true }, opts)).toEqual({ applied: true });
}

async function shell(client: EngineClient, hostId: string, first = true) {
  await client.call("ssh.connect", { hostId, background: true }, opts);
  const read = async () => (await client.call<ConnectionStatus[]>("ssh.connections.status")).find((value) => value.hostId === hostId);
  if (first) {
    const prompt = await vi.waitFor(async () => {
      const value = await read();
      expect(value?.state).toBe("waiting");
      return value?.state === "waiting" ? value.prompt : undefined;
    }, wait);
    await approve(client, prompt!);
  }
  await vi.waitFor(async () => expect((await read())?.state).toBe("connected"), wait);
  return (await client.call<{ id: string }>("ssh.shells.open", { hostId }, opts)).id;
}

const pane = (client: EngineClient, hostId: string, shellId: string) => client.call<MonitorSession>("ssh.monitor.session.open", { hostId, shellId, interval: 1 }, opts);
const readPane = (client: EngineClient, id: string) => client.call<MonitorSession>("ssh.monitor.session.get", { id });
const paneAction = (client: EngineClient, id: string, action: "pause" | "continue" | "close" | "retry") => client.call<MonitorSession>("ssh.monitor.session.change", { id, action }, opts);
const panel = (client: EngineClient, draft: SaveMonitorPanel) => client.call<MonitorPanel>("ssh.monitor.panels.save", draft, opts);
const readPanel = (client: EngineClient, id: string) => client.call<MonitorPanelRun | null>("ssh.monitor.panels.run", { id });
const change = (client: EngineClient, panel: MonitorPanel, action: "start" | "pause" | "continue" | "stop" | "retry", hostId?: string) =>
  client.call<MonitorPanelRun>("ssh.monitor.panels.change", { id: panel.id, expectedRevision: panel.revision, action, ...(hostId && { hostId }) }, opts);

test("Pane monitor binds the original shell and separates Linux counters, Windows readings, and reconnect history", { timeout: 25_000 }, async () => {
  const f = await fixture();
  try {
    const { client } = f;
    const linux = await f.host("Linux fixture", "linux");
    const win = await f.host("Windows fixture", "windows");
    const left = await shell(client, linux.id);
    const right = await shell(client, win.id);
    await expect(pane(client, linux.id, right)).rejects.toMatchObject({ code: "SSH_DISCONNECTED" });
    const a = await pane(client, linux.id, left);
    const b = await pane(client, win.id, right);
    expect(a.host.connectionId).not.toBe(b.host.connectionId);
    await vi.waitFor(async () => {
      expect((await readPane(client, a.id)).host).toMatchObject({
        state: "running",
        platform: "linux",
        latest: { sample: { cpu: 25, memory: { total: 8192, available: 4096 }, network: { received: expect.any(Number), sent: expect.any(Number) } } },
      });
      expect((await readPane(client, b.id)).host).toMatchObject({ state: "running", platform: "windows", latest: { sample: windows } });
    }, wait);
    expect((await paneAction(client, a.id, "pause")).host).toMatchObject({ state: "paused", history: expect.arrayContaining([{ at: expect.any(Number), sample: null }]) });
    const before = linux.reads();
    await delay(1150);
    expect(linux.reads()).toBe(before);
    expect(win.reads()).toBeGreaterThan(1);
    await paneAction(client, a.id, "continue");
    await vi.waitFor(() => expect(linux.reads()).toBeGreaterThan(before), wait);
    await client.call("ssh.disconnect", { hostId: linux.id }, opts);
    await vi.waitFor(async () => expect((await readPane(client, a.id)).host.state).toBe("disconnected"), wait);
    await expect(paneAction(client, a.id, "retry")).rejects.toMatchObject({ code: "SSH_DISCONNECTED" });
    const reconnected = await shell(client, linux.id, false);
    const next = await pane(client, linux.id, reconnected);
    expect(next.host).toMatchObject({ state: "sampling", history: [] });
    expect(next.host.connectionId).not.toBe(a.host.connectionId);
    await paneAction(client, b.id, "close");
    expect(await client.call("ssh.shells.list", { hostId: win.id })).toContainEqual(expect.objectContaining({ id: right, state: "running" }));
    await expect(readPane(client, b.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  } finally {
    await f.close();
  }
});

test("dashboards share fastest sampling, isolate host failures and keep configuration across restart", { timeout: 35_000 }, async () => {
  const f = await fixture();
  try {
    const { client } = f;
    const linux = await f.host("Panel Linux", "linux");
    const win = await f.host("Panel Windows", "windows");
    win.deny(true);
    const fast = await panel(client, { name: "Fast", note: "two hosts", hostIds: [win.id, linux.id], interval: 2, retention: 15 });
    const slow = await panel(client, { name: "Slow", note: "", hostIds: [linux.id], interval: 5, retention: 1440 });
    expect(await readPanel(client, fast.id)).toBeNull();
    expect(linux.server.conns).toHaveLength(0);
    await change(client, fast, "start");
    await change(client, slow, "start");
    for (const host of [linux, win]) {
      const prompt = await vi.waitFor(async () => {
        const current = (await readPanel(client, fast.id))?.hosts.find(({ hostId }) => hostId === host.id);
        expect(current?.state).toBe("trust");
        return current?.prompt;
      }, wait);
      await approve(client, prompt!);
    }
    await vi.waitFor(async () => {
      const a = await readPanel(client, fast.id);
      const b = await readPanel(client, slow.id);
      expect(a?.hosts).toMatchObject([
        { hostId: win.id, state: "denied" },
        { hostId: linux.id, state: "running", interval: 2, subscribers: 2 },
      ]);
      expect(b?.hosts).toMatchObject([{ hostId: linux.id, state: "running", interval: 2, subscribers: 2, connectionId: a?.hosts[1]?.connectionId }]);
    }, wait);
    expect(linux.server.conns).toHaveLength(1);
    expect(await client.call("ssh.connections.status")).toEqual([]);
    const earlier = linux.reads();
    await vi.waitFor(() => expect(linux.reads()).toBeGreaterThan(earlier), wait);
    win.deny(false);
    await change(client, fast, "retry", win.id);
    await vi.waitFor(async () => expect((await readPanel(client, fast.id))?.hosts[0]).toMatchObject({ state: "running", latest: { sample: windows } }), wait);
    expect((await change(client, fast, "pause")).hosts[1]).toMatchObject({ state: "paused", history: expect.arrayContaining([{ sample: null, at: expect.any(Number) }]) });
    expect((await readPanel(client, slow.id))?.hosts[0]).toMatchObject({ state: "running", interval: 5, subscribers: 2 });
    await change(client, fast, "continue");
    await change(client, fast, "stop");
    await vi.waitFor(() => expect(win.server.closed()).toBe(1), wait);
    expect((await readPanel(client, slow.id))?.hosts[0]).toMatchObject({ state: "running", subscribers: 1, interval: 5 });
    const lastConnection = (await readPanel(client, slow.id))?.hosts[0]?.connectionId;
    linux.server.conns[0]!.end();
    await vi.waitFor(async () => expect((await readPanel(client, slow.id))?.hosts[0]).toMatchObject({ state: "disconnected", history: expect.arrayContaining([{ sample: null, at: expect.any(Number) }]) }), wait);
    await change(client, slow, "retry", linux.id);
    const recovered = await vi.waitFor(async () => {
      const source = (await readPanel(client, slow.id))?.hosts[0];
      expect(source?.state).toBe("running");
      return source!;
    }, wait);
    expect(recovered.connectionId).not.toBe(lastConnection);
    expect(recovered.history).toHaveLength(1);
    await change(client, slow, "stop");
    await vi.waitFor(() => expect(linux.server.closed()).toBe(2), wait);
    const reopened = await f.reopen();
    expect(await reopened.call("ssh.monitor.panels.list")).toEqual([fast, slow]);
    expect(await readPanel(reopened, slow.id)).toBeNull();
    await reopened.call("ssh.monitor.panels.delete", { id: fast.id, expectedRevision: fast.revision }, opts);
    expect(await reopened.call("ssh.monitor.panels.list")).toEqual([slow]);
  } finally {
    await f.close();
  }
});
