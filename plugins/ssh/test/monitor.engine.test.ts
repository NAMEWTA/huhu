import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PlanSummary } from "@huhu/contracts";
import { expect, test, vi } from "vitest";
import { boot } from "../../../apps/engine/src/boot.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { EngineClient } from "../../../packages/workbench/src/engine-client/client.js";
import { LINUX_SAMPLE, PLATFORM_COMMAND, WINDOWS_SAMPLE } from "../src/engine/monitor-sample.js";
import { CONTAINER_LIST, PROCESS_LIST } from "../src/engine/monitor-tools.js";
import type { MonitorPanel, MonitorPanelRun, MonitorSession, MonitorTool, MonitorToolResult, SaveMonitorPanel } from "../src/shared/monitoring.js";
import type { ConnectionStatus, HostKeyPrompt } from "../src/shared/trust.js";
import { startFakeSsh, type FakeSshOptions } from "./fake-server.js";

const wait = { timeout: 7500, interval: 30 };
const opts = { write: true };
const windows = { cpu: 25, memory: { total: 8192, available: 2048 }, disk: { mount: "C:", total: 40960, available: 12288 }, network: { received: 35, sent: 12 }, uptimeSec: 120 };

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "huhu-monitor-fixture-"));
  const vaultPath = path.join(root, "vault");
  const desktopUserData = path.join(root, "desktop");
  await Promise.all([mkdir(vaultPath), mkdir(desktopUserData)]);
  const servers: Awaited<ReturnType<typeof startFakeSsh>>[] = [];
  const open = (create: boolean) => boot({ vaultPath, desktopUserData, moduleCredentialProtection: new TestProtection(desktopUserData), create });
  let engine = await open(true);
  const clientFor = () => new EngineClient({ baseUrl: `http://127.0.0.1:${engine.port}`, token: engine.rendererToken, vaultId: engine.vault.id });
  return {
    client: clientFor(),
    async host(name: string, platform: "linux" | "windows", tools?: FakeSshOptions["onExec"]) {
      let reads = 0;
      let denied = false;
      const server = await startFakeSsh({
        onExec(command) {
          if (command === PLATFORM_COMMAND) return platform === "linux" ? { stdout: "Linux" } : { stderr: "command not found", code: 127 };
          if (command !== (platform === "linux" ? LINUX_SAMPLE : WINDOWS_SAMPLE)) return tools?.(command);
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
const monitorPlans = (client: EngineClient) => client.call<{ plans: PlanSummary[] }>("automations.plans.list");
async function updatePlan(client: EngineClient, { planId, revision }: PlanSummary, update: object) {
  const intentId = randomUUID();
  const result = await client.call<{ outcome: string; plan: PlanSummary }>("automations.plans.submit",
    { planId, expectedRevision: revision, intentId, ...update }, { ...opts, intentKey: intentId });
  expect(result.outcome).toBe("completed");
  return result.plan;
}

test("server tools use only read-only commands on the selected Pane", { timeout: 20_000 }, async () => {
  const f = await fixture();
  try {
    const { client } = f;
    const a = await f.host("Tool A", "linux", (command) => {
      if (command === PROCESS_LIST) return { stdout: "23 tool-a" };
      if (command === CONTAINER_LIST) return { stderr: "docker: not found", code: 127 };
    });
    let restricted = false;
    const b = await f.host("Tool B", "linux", (command) => {
      if (command === PROCESS_LIST) return { stdout: "31 tool-b" };
      if (command === CONTAINER_LIST) return restricted ? { stderr: "permission denied", code: 1 } : { stdout: "abcdef123456|fixture-b|fixture/image|running" };
    });
    const left = await shell(client, a.id);
    const right = await shell(client, b.id);
    const read = (hostId: string, shellId: string, tool: MonitorTool) => client.call<MonitorToolResult>("ssh.monitor.tools.read", { hostId, shellId, tool }, opts);
    const leftResult = await read(a.id, left, "processes");
    const rightResult = await read(b.id, right, "processes");
    expect(leftResult).toMatchObject({ state: "ready", rows: [{ id: "23", name: "tool-a" }] });
    expect(rightResult).toMatchObject({ state: "ready", rows: [{ id: "31", name: "tool-b" }] });
    expect(leftResult.connectionId).not.toBe(rightResult.connectionId);
    await expect(read(a.id, right, "processes")).rejects.toMatchObject({ code: "SSH_DISCONNECTED" });
    await expect(client.call("ssh.monitor.tools.read", { hostId: a.id, shellId: left, tool: "processes", command: "echo fixture" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await read(a.id, left, "containers")).toMatchObject({ state: "unsupported", rows: [] });
    expect(await read(b.id, right, "containers")).toMatchObject({ state: "ready", rows: [{ id: "abcdef123456", name: "fixture-b", detail: "fixture/image · running" }] });
    restricted = true;
    expect(await read(b.id, right, "containers")).toMatchObject({ state: "denied", rows: [] });
    await client.call("ssh.disconnect", { hostId: a.id }, opts);
    await expect(read(a.id, left, "processes")).rejects.toMatchObject({ code: "SSH_DISCONNECTED" });
    expect(await client.call("ssh.shells.list", { hostId: b.id })).toContainEqual(expect.objectContaining({ id: right, state: "running" }));
  } finally {
    await f.close();
  }
});

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
    expect((await monitorPlans(client)).plans.filter(({ source }) => source.plugin === "ssh")).toEqual([]);
    expect(linux.server.conns).toHaveLength(0);
    const { plan: fastPlan } = await change(client, fast, "start");
    expect(fastPlan).toBeDefined();
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
    const paused = await updatePlan(client, fastPlan!, { change: "set-intent", intent: "paused" });
    expect(await readPanel(client, fast.id)).toMatchObject({ plan: { planId: paused.planId, revision: paused.revision }, state: "paused" });
    expect((await readPanel(client, fast.id))?.hosts[1]).toMatchObject({ state: "paused", history: expect.arrayContaining([{ sample: null, at: expect.any(Number) }]) });
    expect((await readPanel(client, slow.id))?.hosts[0]).toMatchObject({ state: "running", interval: 5, subscribers: 2 });
    await change(client, fast, "continue");
    await updatePlan(client, (await readPanel(client, fast.id))!.plan!, { change: "delete" });
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
    const stopped = (await readPanel(client, slow.id))!.plan!;
    const rescheduled = await updatePlan(client, stopped, { change: "reschedule", trigger: { kind: "interval", every: 10, unit: "seconds" } });
    const resumed = await updatePlan(client, rescheduled, { change: "set-intent", intent: "enabled" });
    expect(resumed.availability).toMatchObject({ state: "blocked", reason: "connection-unavailable" });
    const reopened = await f.reopen();
    expect(await reopened.call("ssh.monitor.panels.list")).toMatchObject([
      { ...fast, plan: { planId: fastPlan!.planId, intent: "deleted" } },
      { ...slow, interval: 10, plan: { planId: resumed.planId, revision: resumed.revision, intent: "enabled", availability: { reason: "connection-unavailable" } } },
    ]);
    expect(await readPanel(reopened, slow.id)).toBeNull();
    expect(linux.server.conns).toHaveLength(2);
    await reopened.call("ssh.monitor.panels.delete", { id: fast.id, expectedRevision: fast.revision }, opts);
    expect(await reopened.call("ssh.monitor.panels.list")).toMatchObject([{ id: slow.id, interval: 10 }]);
  } finally {
    await f.close();
  }
});
