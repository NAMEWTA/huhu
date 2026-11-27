import { issueMcpCredential, mcpRequest, mcpRpc, openMcpSession, openRecoverableMcpSession, recoveryInitialize } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createConnection, createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema, type CapabilityResult } from "@huhu/contracts";
import { ModuleCredentials } from "@huhu/kernel";
import { expect, test, vi } from "vitest";
import { z } from "zod";
import { run } from "../../../apps/cli/src/main.js";
import { boot } from "../../../apps/engine/src/boot.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { HerdrCore } from "../../agent-cli/src/engine/herdr-core.js";
import type { ExecJobStatus, ExecOutputPage } from "../src/engine/public-jobs.js";
import { LINUX_SAMPLE, PLATFORM_COMMAND } from "../src/engine/monitor-sample.js";
import { PROCESS_LIST } from "../src/engine/monitor-tools.js";
import { PublicProbeStatus } from "../src/engine/public-probes.js";
import { shellDirectoryProbe } from "../src/engine/shell-directory.js";
import type { ResourceHost } from "../src/engine/public-resources.js";
import type { ConnectionStatus } from "../src/shared/trust.js";
import type { MonitorPanel, MonitorPanelRun } from "../src/shared/monitoring.js";
import type { ForwardRule, ForwardRun } from "../src/shared/forwarding.js";
import { WorkspaceRun, type WorkspaceTemplate } from "../src/shared/workspace.js";
import type { ProxyProfile, ProxyRouting } from "../src/shared/outbound-proxy.js";
import type { TransferBatch, TransferJob, TransferQueue } from "../src/shared/transfers.js";
import { startFakeSsh, type FakeSshOptions } from "./fake-server.js";
import { ownedArchiveFixture } from "./owned-archive-fixture.js";
import { privilegedSftpCommand } from "../src/engine/privileged-sftp.js";
import { localPosixCommand } from "./shell-relay-fixture.js";
import type { FileDocument, FileProperties, FileSession } from "../src/shared/files.js";

const hostGet = "ssh.resources.host.get";
const probeStart = "ssh.resources.connection.start";
const probeGet = "ssh.resources.connection.get";
const probeList = "ssh.resources.connection.list";
const trustDecide = "ssh.resources.trust.decide";
const jobPrepare = "ssh.jobs.prepare";
const jobStart = "ssh.jobs.start";
const jobGet = "ssh.jobs.get";
const jobOutput = "ssh.jobs.output.read";
const jobCancel = "ssh.jobs.cancel";
const execCancel = "ssh.exec.cancel";
const execRun = "ssh.exec.run";
const jobCapabilities = [jobPrepare, jobStart, jobGet, jobOutput, jobCancel];

test("privileged SFTP uses sudo on just the original file binding and keeps file ownership", { timeout: 20_000 }, async (ctx) => {
  if (process.platform !== "linux" || spawnSync("sudo", ["-n", "true"]).status !== 0 || spawnSync("test", ["-x", "/usr/lib/openssh/sftp-server"]).status !== 0) {
    ctx.skip("requires passwordless sudo and OpenSSH sftp-server on the Linux loopback host");
    return;
  }
  const f = await fixture();
  const root = await mkdtemp(path.join(tmpdir(), "huhu-privileged-files-"));
  try {
    const secret = path.join(root, "fixture.txt");
    const seed = path.join(root, "seed.txt");
    await writeFile(seed, "restricted fixture");
    execFileSync("sudo", ["-n", "install", "-m", "600", seed, secret]);
    const first = await f.host("sudo SFTP", [], {
      noSftp: true,
      onInteractiveExec(command, channel) {
        if (command !== privilegedSftpCommand) return false;
        localPosixCommand(channel, command);
        return true;
      },
    });
    const second = await f.host("sudo unavailable", [], {
      noSftp: true,
      onInteractiveExec(command, channel) {
        if (command !== privilegedSftpCommand) return false;
        channel.exit(1);
        channel.end();
        return true;
      },
    });
    async function connect(hostId: string) {
      await f.desktop("ssh.connect", { hostId, background: true });
      const state = async () => (await f.desktop<ConnectionStatus[]>("ssh.connections.status")).find((item) => item.hostId === hostId);
      await expect.poll(async () => (await state())?.state).toBe("waiting");
      const pending = await state();
      if (pending?.state !== "waiting") throw new Error("Missing initial trust decision for file fixture");
      await f.desktop("ssh.hostKey.decide", { attemptId: pending.attemptId, hop: 0, promptId: pending.prompt.promptId, accept: true });
      await expect.poll(async () => (await state())?.state).toBe("connected");
      return f.desktop<FileSession>("ssh.fileSessions.open", { hostId });
    }
    const original = await connect(first.hostId);
    const denied = await connect(second.hostId);
    expect(await f.desktop("ssh.fileSessions.sudo.probe", { fileSessionId: original.fileSessionId })).toEqual({ available: true });
    expect(await f.desktop("ssh.fileSessions.sudo.probe", { fileSessionId: denied.fileSessionId })).toEqual({ available: false });
    const input = { fileSessionId: original.fileSessionId, path: secret };
    await expect(f.desktop("ssh.fileSessions.document.open", input)).rejects.toThrow("document.open");
    const document = await f.desktop<FileDocument>("ssh.fileSessions.sudo.read", input);
    expect(document.text).toBe("restricted fixture");
    const text = "经原端点 sudo 写回";
    await f.desktop("ssh.fileSessions.sudo.save", { ...input, text, expectedVersion: document.version });
    expect(await f.desktop<FileDocument>("ssh.fileSessions.sudo.read", input)).toMatchObject({ text, mode: "600" });
    expect(execFileSync("sudo", ["-n", "stat", "-c", "%u:%a", "--", secret], { encoding: "utf8" }).trim()).toBe("0:600");
    const props = await f.desktop<FileProperties>("ssh.fileSessions.sudo.properties", input);
    const changed = await f.desktop<FileProperties>("ssh.fileSessions.sudo.changeProperties", { ...input, expectedRevision: props.revision, change: { mode: "640" } });
    expect(changed.mode).toBe("640");
    const moved = path.join(root, "renamed.txt");
    await f.desktop("ssh.fileSessions.sudo.moveEntry", { ...input, expectedRevision: changed.revision, destination: moved });
    const local = path.join(root, "downloads");
    await mkdir(local);
    await f.desktop("ssh.fileSessions.localList", { fileSessionId: original.fileSessionId, parts: [], root: local });
    const remote = { kind: "remote", fileSessionId: original.fileSessionId, path: root, sudo: true };
    const target = { kind: "local", path: local };
    const run = await f.desktop<TransferBatch>("ssh.transfers.startBatch", { source: remote, target, names: ["renamed.txt"], localFileSessionId: original.fileSessionId });
    await expect.poll(async () => (await f.desktop<TransferQueue>("ssh.transfers.list")).batches.find(({ batchId }) => batchId === run.batchId)?.state).toBe("completed");
    expect(await readFile(path.join(local, "renamed.txt"), "utf8")).toBe(text);
    const movedProps = await f.desktop<FileProperties>("ssh.fileSessions.sudo.properties", { ...input, path: moved });
    await f.desktop("ssh.fileSessions.sudo.delete", { ...input, path: moved, expectedRevision: movedProps.revision });
    expect(await readdir(root)).not.toContain("renamed.txt");
    await f.desktop("ssh.fileSessions.close", { fileSessionId: original.fileSessionId });
    await expect(f.desktop("ssh.fileSessions.sudo.read", input)).rejects.toThrow("NOT_FOUND");
    expect(first.server.conns).toHaveLength(1);
  } finally {
    await f.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("privileged SFTP consumes a password once and pins batch work to that authenticated channel", { timeout: 20_000 }, async (ctx) => {
  if (process.platform !== "linux" || spawnSync("sudo", ["-n", "true"]).status !== 0 || spawnSync("test", ["-x", "/usr/lib/openssh/sftp-server"]).status !== 0) {
    ctx.skip("requires OpenSSH sftp-server and a privileged Linux fixture");
    return;
  }
  const f = await fixture();
  const root = await mkdtemp(path.join(tmpdir(), "huhu-sudo-challenge-"));
  const password = "fixture sudo " + randomUUID();
  let answers = 0;
  let authentications = 0;
  try {
    const file = path.join(root, "secret.txt");
    const output = path.join(root, "out");
    const seed = path.join(root, "seed");
    await mkdir(output);
    await writeFile(seed, "sudo challenge SFTP");
    execFileSync("sudo", ["-n", "install", "-m", "600", seed, file]);
    const host = await f.host("interactive sudo", [], {
      noSftp: true,
      onInteractiveExec(command, channel) {
        if (command === privilegedSftpCommand) {
          channel.exit(1);
          channel.end();
          return true;
        }
        const prompt = /huhu-sudo-[a-f0-9-]+:/u.exec(command)?.[0];
        const ready = /huhu-ready-[a-f0-9-]+:/u.exec(command)?.[0];
        if (!prompt || !ready) return false;
        expect(command).not.toContain(password);
        authentications++;
        channel.once("data", (input: Buffer) => {
          answers++;
          if (input.toString() !== password + "\n") {
            channel.stderr.write(prompt);
            return;
          }
          localPosixCommand(channel, privilegedSftpCommand);
          channel.stderr.write(ready);
        });
        channel.stderr.write(prompt);
        return true;
      },
    });
    await f.desktop("ssh.connect", { hostId: host.hostId, background: true });
    const live = async () => (await f.desktop<ConnectionStatus[]>("ssh.connections.status")).find(({ hostId }) => hostId === host.hostId);
    await expect.poll(async () => (await live())?.state).toBe("waiting");
    const waiting = await live();
    if (waiting?.state !== "waiting") throw new Error("Missing fingerprint");
    await f.desktop("ssh.hostKey.decide", { attemptId: waiting.attemptId, hop: 0, promptId: waiting.prompt.promptId, accept: true });
    await expect.poll(async () => (await live())?.state).toBe("connected");
    const { fileSessionId } = await f.desktop<FileSession>("ssh.fileSessions.open", { hostId: host.hostId });
    expect(await f.desktop("ssh.fileSessions.sudo.probe", { fileSessionId })).toEqual({ available: false });
    await expect(f.desktop("ssh.fileSessions.sudo.authenticate", { fileSessionId, password: "incorrect fixture" })).rejects.toThrow("PERMISSION_DENIED");
    const { sudoSessionId } = await f.desktop<{ sudoSessionId: string }>("ssh.fileSessions.sudo.authenticate", { fileSessionId, password });
    const scope = { fileSessionId, sudoSessionId };
    expect(await f.desktop("ssh.fileSessions.sudo.read", { ...scope, path: file })).toMatchObject({ text: "sudo challenge SFTP" });
    await f.desktop("ssh.fileSessions.localList", { fileSessionId, parts: [], root: output });
    const batch = await f.desktop<TransferBatch>("ssh.transfers.startBatch", {
      source: { kind: "remote", ...scope, sudo: true, path: root },
      target: { kind: "local", path: output },
      names: ["secret.txt"],
      localFileSessionId: fileSessionId,
    });
    await expect.poll(async () => (await f.desktop<TransferQueue>("ssh.transfers.list")).batches.find(({ batchId }) => batchId === batch.batchId)?.state).toBe("completed");
    expect(await readFile(path.join(output, "secret.txt"), "utf8")).toBe("sudo challenge SFTP");
    await writeFile(path.join(output, "upload.txt"), "same authenticated channel");
    const upload = await f.desktop<TransferBatch>("ssh.transfers.startBatch", {
      source: { kind: "local", path: output },
      target: { kind: "remote", ...scope, sudo: true, path: root },
      names: ["upload.txt"],
      localFileSessionId: fileSessionId,
    });
    await expect.poll(async () => (await f.desktop<TransferQueue>("ssh.transfers.list")).batches.find(({ batchId }) => batchId === upload.batchId)?.state).toBe("completed");
    expect(execFileSync("sudo", ["-n", "stat", "-c", "%u:%a", "--", path.join(root, "upload.txt")], { encoding: "utf8" }).trim()).toBe("0:600");
    expect(authentications).toBe(2);
    expect(answers).toBe(2);
    await f.desktop("ssh.fileSessions.sudo.close", scope);
    await expect(f.desktop("ssh.fileSessions.sudo.read", { ...scope, path: file })).rejects.toThrow("PERMISSION_DENIED");
    expect(JSON.stringify(await f.desktop("ssh.audit.list"))).not.toContain(password);
    expect((await live())?.state).toBe("connected");
  } finally {
    await f.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("workbench dynamic split gives the new SSH host its own trust prompt", async () => {
  const f = await fixture();
  try {
    const first = await f.host("original pane");
    const second = await f.host("added pane");
    const started = await f.desktop<WorkspaceRun>("ssh.workspace.runs.start", {
      name: "dynamic split",
      layout: { kind: "one" },
      panes: [{ hostId: first.hostId }],
    });
    const read = async () => (await f.desktop<WorkspaceRun[]>("ssh.workspace.runs.list")).find(({ id }) => id === started.id)!;
    async function accept(hostId: string) {
      const pane = async () => (await read()).panes.find((item) => item.hostId === hostId);
      await expect.poll(async () => (await pane())?.phase).toBe("trust");
      const prompt = (await pane())?.prompt;
      if (!prompt) throw new Error("Missing pending host key");
      expect(
        await f.desktop("ssh.hostKey.decide", {
          attemptId: prompt.attemptId,
          hop: prompt.hop,
          promptId: prompt.promptId,
          accept: true,
        }),
      ).toEqual({ applied: true });
      await expect.poll(async () => (await pane())?.phase).toBe("ready");
      return (await pane())?.sessionId;
    }
    const originalShell = await accept(first.hostId);
    expect(originalShell).toBeDefined();
    expect(second.server.conns).toHaveLength(0);
    const open = await read();
    await f.desktop("ssh.workspace.runs.changeLayout", {
      id: open.id,
      expectedLayoutRevision: open.layoutRevision ?? open.id,
      change: { action: "split", hostId: second.hostId, paneId: open.panes[0]!.paneId, axis: "column" },
    });
    expect(await accept(second.hostId)).toBeDefined();
    expect((await read()).panes[0]?.sessionId).toBe(originalShell);
    expect([first.server.conns.length, second.server.conns.length]).toEqual([1, 1]);
  } finally {
    await f.close();
  }
});

type Probe = z.infer<typeof PublicProbeStatus>;
type Waiting = Extract<Probe, { prompt: unknown }>;
type JobStatus = z.infer<typeof ExecJobStatus>;
type OutputPage = z.infer<typeof ExecOutputPage>;

test.each(["cli", "mcp"] as const)("%s edits SSH routes with versioned grants and durable receipts", { timeout: 30_000 }, async (entry) => {
  const f = await fixture();
  const capability = "ssh.routes.edit";
  try {
    const jump = await f.host("authorized route jump");
    const target = await f.host("authorized route target");
    const invoke = await externalTool(f, entry);
    await f.allow(capability);
    const connection = await connectOwned(f, invoke, target.hostId);
    const jumpBinding = await f.desktop<ResourceHost>(hostGet, { hostId: jump.hostId });
    const edit = {
      targets: [{ hostId: target.hostId, expectedRevision: target.revision }],
      change: { action: "associate", jumpHostId: jump.hostId, ifExists: "replace" },
      bindings: [
        { hostId: jump.hostId, routeRevision: jumpBinding.routeRevision },
        { hostId: target.hostId, routeRevision: connection.routeRevision },
      ],
      intentKey: randomUUID(),
    };
    await f.chooseHosts([target.hostId]);
    expect(await invoke(capability, edit)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    await f.chooseHosts([target.hostId, jump.hostId]);
    const saved = await invoke(capability, edit);
    expect(saved).toMatchObject({ ok: true, data: { updated: [target.hostId], skipped: [] } });
    expect(await invoke(capability, edit)).toEqual(saved);
    expect(await invoke(capability, { ...edit, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    const route = await f.desktop<ResourceHost>(hostGet, { hostId: target.hostId });
    expect(route.route.map(({ hostId }) => hostId)).toEqual([jump.hostId, target.hostId]);
    expect(route.routeRevision).not.toBe(connection.routeRevision);
    await vi.waitFor(() => expect(target.server.closed()).toBe(1));
    expect(await invoke("ssh.connect", { hostId: target.hostId, routeRevision: connection.routeRevision, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    const disable = {
      targets: [{ hostId: target.hostId, expectedRevision: route.revision }],
      change: { action: "setEnabled", enabled: false },
      bindings: [{ hostId: target.hostId, routeRevision: route.routeRevision }],
      intentKey: randomUUID(),
    };
    expect(await invoke(capability, disable)).toMatchObject({ ok: true, data: { updated: [target.hostId] } });
    const direct = await f.desktop<ResourceHost>(hostGet, { hostId: target.hostId });
    expect(direct.route.map(({ hostId }) => hostId)).toEqual([target.hostId]);
    const enable = {
      targets: [{ hostId: target.hostId, expectedRevision: direct.revision }],
      change: { action: "setEnabled", enabled: true },
      bindings: [{ hostId: target.hostId, routeRevision: direct.routeRevision }],
      intentKey: randomUUID(),
    };
    expect(await invoke(capability, enable)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await invoke(capability, { ...enable, bindings: [...enable.bindings, edit.bindings[0]!] })).toMatchObject({ ok: true, data: { updated: [target.hostId] } });
    await f.chooseHosts([target.hostId]);
    expect(await invoke(capability, edit)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s edits SSH routes only while the prospective jump is still authorized at commit", { timeout: 30_000 }, async (entry) => {
  const f = await fixture();
  try {
    const jump = await f.host("commit boundary jump");
    const target = await f.host("commit boundary target");
    const capability = "ssh.routes.edit";
    const invoke = await externalTool(f, entry);
    await f.allow(capability);
    const bindings = await Promise.all(
      [jump, target].map(async ({ hostId }) => {
        const { routeRevision } = await f.desktop<ResourceHost>(hostGet, { hostId });
        return { hostId, routeRevision };
      }),
    );
    const files = f.engine.vault.files;
    const write = files.write.bind(files);
    let markEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    let release!: () => void;
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pause = vi.spyOn(files, "write").mockImplementation(async (relative, bytes, options) => {
      if (relative.startsWith(".huhu/module-credentials/")) {
        markEntered();
        await resume;
      }
      return write(relative, bytes, options);
    });
    const changing = invoke(capability, {
      targets: [{ hostId: target.hostId, expectedRevision: target.revision }],
      change: { action: "associate", jumpHostId: jump.hostId, ifExists: "replace" },
      bindings,
      intentKey: randomUUID(),
    });
    try {
      expect(await Promise.race([entered.then(() => "held"), changing.then(() => "returned")])).toBe("held");
      await f.chooseHosts([target.hostId]);
    } finally {
      release();
      pause.mockRestore();
    }
    const result = await changing;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(["PERMISSION_DENIED", "VERSION_CONFLICT"]).toContain(result.error.code);
    expect(await f.desktop<ResourceHost>(hostGet, { hostId: target.hostId })).toMatchObject({ revision: target.revision, route: [{ hostId: target.hostId }] });
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s isolates monitor subscriptions and keeps active query output out of receipts", { timeout: 30_000 }, async (entry) => {
  const f = await fixture();
  let queries = 0;
  try {
    const proc = "fixture-private-process-label";
    const { hostId } = await f.host("owned monitor fixture", [], {
      onExec: (command) => {
        if (command === PLATFORM_COMMAND) return { stdout: "Linux\n" };
        if (command === PROCESS_LIST) {
          queries++;
          return { stdout: `12\t101\t${proc}\n` };
        }
        if (command === LINUX_SAMPLE) return { stdout: "cpu 25 100\nmemory 8192 4096\nuptime 3600\nload 1.25\nnet 80 50\ndisk 40960 20480\n" };
      },
    });
    const spare = await f.host("unrelated monitoring grant");
    const invoke = await externalTool(f, entry);
    const peer = await externalTool(f, "mcp");
    const open = "ssh.monitor.session.open";
    const get = "ssh.monitor.session.get";
    const list = "ssh.monitor.session.list";
    const change = "ssh.monitor.session.change";
    const tool = "ssh.monitor.tools.read";
    const panelChange = "ssh.monitor.panels.change";
    const panelRead = "ssh.monitor.panels.run";
    const panelsList = "ssh.monitor.panels.external.list";
    const denied = { ok: false, error: { code: "PERMISSION_DENIED" } };
    const missing = { ok: false, error: { code: "NOT_FOUND" } };
    expect(await invoke(open, {})).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    for (const id of ["ssh.connect", probeGet, trustDecide, open, get, list, change, tool, panelChange, panelRead, panelsList]) await f.allow(id);
    const { routeRevision } = await f.desktop<ResourceHost>(hostGet, { hostId });
    const route = { hostId, routeRevision };
    const { attemptId } = z.object({ attemptId: z.string() }).parse(data(await invoke("ssh.connect", { ...route, intentKey: randomUUID() })));
    const status = async () => PublicProbeStatus.parse(data(await invoke(probeGet, { hostId, attemptId })));
    const pending = await vi.waitFor(async () => {
      const current = await status();
      if (current.state !== "waiting") throw new Error("Waiting for monitor fixture trust");
      return current;
    });
    expect(await invoke(trustDecide, decision(pending))).toMatchObject({ ok: true });
    await vi.waitFor(async () => expect(await status()).toMatchObject({ state: "connected" }));
    const connection = { ...route, attemptId };
    const intent = { ...connection, interval: 2, intentKey: randomUUID() };
    expect(await peer(open, intent)).toMatchObject(missing);
    const { id } = z.object({ id: z.uuid() }).parse(data(await invoke(open, intent)));
    expect(await invoke(open, intent)).toMatchObject({ ok: true, data: { id } });
    expect(data(await peer(list, {}))).toEqual([]);
    expect(await peer(get, { id })).toMatchObject(missing);
    expect(await peer(change, { id, action: "close", intentKey: randomUUID() })).toMatchObject(missing);
    expect(await f.desktop(list)).toMatchObject([{ id, source: "external" }]);
    await vi.waitFor(async () => expect(await invoke(get, { id })).toMatchObject({ ok: true, data: { host: { latest: { sample: { memory: { total: expect.any(Number) } } } } } }), { timeout: 5000 });
    const query = { ...connection, tool: "processes", intentKey: randomUUID() };
    const result = await invoke(tool, query);
    expect(result).toMatchObject({ ok: true, data: { rows: [{ name: proc }] } });
    expect(await invoke(tool, query)).toEqual(result);
    expect(await peer(tool, query)).toMatchObject(missing);
    expect(queries).toBe(1);
    const panel = await f.desktop<MonitorPanel>("ssh.monitor.panels.save", { name: "owned fixture monitor", note: "", hostIds: [hostId], interval: 2, retention: 15 });
    const selectedPanel = { id: panel.id, expectedRevision: panel.revision };
    const start = { ...selectedPanel, action: "start", connections: [connection], intentKey: randomUUID() };
    expect(await invoke(panelChange, start)).toMatchObject({ ok: true, data: { state: "running" } });
    expect(await invoke(panelChange, start)).toMatchObject({ ok: true, data: { id: panel.id } });
    expect(data(await peer(panelRead, selectedPanel))).toBeNull();
    const [running] = await f.desktop<{ id: string; runId: string }[]>(panelsList);
    expect(running).toMatchObject({ id: panel.id, runId: expect.any(String) });
    expect(data(await peer(panelsList, {}))).toEqual([]);
    await vi.waitFor(async () => expect(await invoke(panelRead, selectedPanel)).toMatchObject({ ok: true, data: { hosts: [{ hostId, latest: { sample: { memory: { total: expect.any(Number) } } } }] } }), { timeout: 5000 });
    expect(await readFile(path.join(f.engine.vault.runtimeDir, "ssh-host-intents.ndjson"), "utf8")).not.toContain(proc);
    await f.chooseHosts([spare.hostId]);
    expect(data(await invoke(list, {}))).toEqual([]);
    expect(await invoke(tool, query)).toMatchObject(denied);
    expect(await f.desktop(list)).toEqual([]);
    expect(await f.desktop(panelsList)).toEqual([]);
  } finally {
    await f.close();
  }
});

function data<T>(reply: { ok: true; data: T } | { ok: false; error: { code: string } }): T {
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data;
}

function decision({ hostId, attemptId, routeRevision, prompt }: Waiting) {
  return { hostId, attemptId, routeRevision, ...prompt, accept: true };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "huhu-ssh-resource-"));
  const vaultPath = path.join(root, "vault");
  const desktopUserData = path.join(root, "device");
  await Promise.all([mkdir(vaultPath), mkdir(desktopUserData)]);
  const protection = new TestProtection(desktopUserData);
  let engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection, create: true });
  const baseUrl = () => `http://127.0.0.1:${engine.port}`;
  const servers: Awaited<ReturnType<typeof startFakeSsh>>[] = [];
  const hosts: string[] = [];
  async function server(opts?: FakeSshOptions) {
    const item = await startFakeSsh(opts);
    servers.push(item);
    return item;
  }
  async function call<T = unknown>(token: string, capability: string, input: unknown = {}, idempotencyKey = randomUUID()) {
    const response = await fetch(`${baseUrl()}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey }),
    });
    if (response.status === 401) return { ok: false, error: { code: "HTTP_401" } } as const;
    return CapabilityResultSchema.parse(await response.json()) as CapabilityResult<T>;
  }
  async function desktop<T = unknown>(capability: string, input?: unknown) {
    const result = await call<T>(engine.rendererToken, capability, input);
    if (!result.ok) throw new Error(`${capability}: ${result.error.code}`);
    return result.data;
  }
  const chooseHosts = async (ids: readonly string[]) => {
    const resources = { "ssh.hosts": ids };
    const { revision, catalogRevision } = await desktop<{ revision: number; catalogRevision: string }>("gateway.policy.preview", { resources });
    return desktop("gateway.policy.update", { resources, expectedRevision: revision, catalogRevision });
  };
  async function cliArgs(args: string[]) {
    const output: string[] = [];
    await run([...args, "--vault", vaultPath, "--json"], {
      out: (line) => output.push(line),
      err: (line) => {
        throw new Error(line);
      },
    });
    return JSON.parse(output.join(""));
  }
  return {
    get engine() {
      return engine;
    },
    async restart(update?: () => Promise<unknown>) {
      await engine.shutdown();
      await update?.();
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection });
    },
    call,
    desktop,
    chooseHosts,
    server,
    allow: (capability: string, exposed = true) => desktop("gateway.update", { capability, exposed }),
    mcpEndpoint: () => `${baseUrl()}/mcp`,
    async mcp(token: string, method: string, params = {}, handle?: string) {
      const endpoint = `${baseUrl()}/mcp`;
      const session = handle ?? (await openMcpSession(endpoint, token));
      const response = await mcpRequest(endpoint, token, mcpRpc(method, params), session);
      expect(response.status).toBe(200);
      return (await response.json()).result;
    },
    async cli(capability: string, input: unknown) {
      return CapabilityResultSchema.parse(await cliArgs(["call", capability, "--input-json", JSON.stringify(input)]));
    },
    async cliTools() {
      return z.object({ data: z.array(z.object({ name: z.string() })) }).parse(await cliArgs(["capabilities", "list"])).data;
    },
    async host(name: string, jumpHostIds: string[] = [], opts: FakeSshOptions = {}) {
      const password = `synthetic-${randomUUID()}`;
      const ssh = await server({ ...opts, password: opts.password ?? password });
      const profile = { name, host: "127.0.0.1", port: ssh.port, user: "fixture-login", authKind: "password", jumpHostIds };
      const saved = await desktop<{ hostId: string; revision: string }>("ssh.hosts.configure", { ...profile, expectedRevision: null, credentials: [{ purpose: "password", action: "replace", value: password }] });
      hosts.push(saved.hostId);
      await chooseHosts(hosts);
      return { server: ssh, password, profile, ...saved };
    },
    async close() {
      try {
        if (hosts.length) {
          await desktop("plugins.setEnabled", { id: "ssh", enabled: false });
          await desktop("plugins.setEnabled", { id: "ssh", enabled: true });
          for (const hostId of hosts.reverse()) {
            const { revision } = await desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
            await desktop("ssh.hosts.remove", { hostId, expectedRevision: revision });
          }
        }
      } finally {
        await engine.shutdown();
        await Promise.all(servers.map((server) => server.close()));
        await rm(root, { recursive: true, force: true, maxRetries: 4 });
      }
    },
  };
}

async function externalTool(f: Awaited<ReturnType<typeof fixture>>, entry: "cli" | "mcp") {
  if (entry === "cli") return f.cli;
  await f.desktop("gateway.mcp.update", { enabled: true });
  const { token } = await f.desktop<{ token: string }>("gateway.tokens.create", { name: "SSH tool fixture" });
  const session = await openMcpSession(f.mcpEndpoint(), token);
  return async (id: string, args: object) => {
    const result = await f.mcp(token, "tools/call", { name: id.replaceAll(".", "_"), arguments: args }, session);
    return CapabilityResultSchema.parse(result.isError ? { ok: false, error: JSON.parse(result.content[0].text) } : { ok: true, ...result.structuredContent });
  };
}

async function connectOwned(f: Awaited<ReturnType<typeof fixture>>, invoke: Awaited<ReturnType<typeof externalTool>>, hostId: string) {
  for (const tool of ["ssh.connect", probeGet, trustDecide]) await f.allow(tool);
  const { routeRevision } = await f.desktop<ResourceHost>(hostGet, { hostId });
  const { attemptId } = z.object({ attemptId: z.string() }).parse(data(await invoke("ssh.connect", { hostId, routeRevision, intentKey: randomUUID() })));
  const status = async () => PublicProbeStatus.parse(data(await invoke(probeGet, { hostId, attemptId })));
  const pending = await vi.waitFor(async () => {
    const current = await status();
    if (current.state !== "waiting") throw new Error("Waiting for loopback trust");
    return current;
  });
  expect(await invoke(trustDecide, decision(pending))).toMatchObject({ ok: true });
  await vi.waitFor(async () => expect(await status()).toMatchObject({ state: "connected" }));
  return { hostId, routeRevision, attemptId };
}

test.each(["cli", "mcp"] as const)("%s binds the effective outbound proxy to the first of three SSH jumps", { timeout: 45_000 }, async (entry) => {
  const f = await fixture();
  const proxy = createHttpServer();
  const echo = createServer((socket) => socket.pipe(socket));
  const sockets = new Set<Socket>();
  let forwardRule: ForwardRule | undefined;
  try {
    const jumps: Awaited<ReturnType<typeof f.host>>[] = [];
    for (const name of ["first", "middle", "last"]) {
      const previous = jumps.at(-1)?.hostId;
      jumps.push(await f.host(name + " jump fixture", previous ? [previous] : []));
    }
    const destination = await f.host("destination fixture", [jumps[2]!.hostId], {
      onExec: (command) => {
        if (command === PLATFORM_COMMAND) return { stdout: "Linux\n" };
        if (command === LINUX_SAMPLE) return { stdout: "cpu 25 100\nmemory 8192 4096\nuptime 3600\nload 1.25\nnet 80 50\ndisk 40960 20480\n" };
      },
    });
    const first = jumps[0]!;
    const authority = `127.0.0.1:${first.server.port}`;
    const proxyAuth = { action: "replace", username: "fixture-proxy-user", password: "fixture-proxy-passphrase" } as const;
    const expectedHeader = `Basic ${Buffer.from(`${proxyAuth.username}:${proxyAuth.password}`).toString("base64")}`;
    const received: string[] = [];
    proxy.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    proxy.on("connect", (request, wire) => {
      received.push(request.url ?? "");
      if (request.url !== authority || request.headers["proxy-authorization"] !== expectedHeader) {
        wire.end("HTTP/1.1 407 Proxy Authentication Required\r\nConnection: close\r\n\r\n");
        return;
      }
      const upstream = createConnection(first.server.port, "127.0.0.1");
      upstream.on("error", () => wire.destroy());
      wire.on("error", () => upstream.destroy());
      upstream.once("close", () => wire.destroy());
      wire.once("close", () => upstream.destroy());
      upstream.once("connect", () => {
        wire.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        upstream.pipe(wire).pipe(upstream);
      });
    });
    proxy.listen(0, "127.0.0.1");
    await once(proxy, "listening");
    const proxyPort = (proxy.address() as { port: number }).port;
    const { hostId } = destination;
    const direct = await f.desktop<ResourceHost>(hostGet, { hostId });
    const preview = () => f.desktop("ssh.outboundProxies.preview", { hostId });
    expect(await preview()).toEqual({ source: "inherit" });
    const profile = await f.desktop<ProxyProfile>("ssh.outboundProxies.save", {
      expectedRevision: null,
      name: "authorized proxy fixture",
      protocol: "http-connect",
      host: "127.0.0.1",
      port: proxyPort,
      authentication: proxyAuth,
    });
    expect(profile).toMatchObject({ available: true, authenticated: true });
    expect(JSON.stringify(profile)).not.toContain(proxyAuth.password);
    const current = await f.desktop<ProxyRouting>("ssh.outboundProxies.setDefault", { expectedRevision: null, defaultProfileId: profile.id });
    expect(await preview()).toEqual({ source: "inherit", protocol: profile.protocol, name: profile.name });
    const route = await f.desktop<ResourceHost>(hostGet, { hostId });
    expect(route.route.map(({ hostId }) => hostId)).toEqual([...jumps.map(({ hostId }) => hostId), hostId]);
    expect(route.routeRevision).not.toBe(direct.routeRevision);
    const invoke = await externalTool(f, entry);
    for (const capability of ["ssh.connect", probeGet, trustDecide]) await f.allow(capability);
    const intent = { hostId, routeRevision: route.routeRevision, intentKey: randomUUID() };
    expect(await invoke("ssh.connect", { ...intent, routeRevision: direct.routeRevision })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    await f.chooseHosts([hostId]);
    expect(await invoke("ssh.connect", intent)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(received).toEqual([]);
    await f.chooseHosts([...jumps.map(({ hostId }) => hostId), hostId]);
    const { attemptId } = z.object({ attemptId: z.string() }).parse(data(await invoke("ssh.connect", intent)));
    const status = async () => PublicProbeStatus.parse(data(await invoke(probeGet, { hostId, attemptId })));
    for (let hop = 0; hop < 4; hop++) {
      const waiting = await vi.waitFor(
        async () => {
          const result = await status();
          if (result.state !== "waiting" || result.prompt.hop !== hop) throw new Error(`Waiting for fixture SSH hop ${hop}`);
          return result;
        },
        { timeout: 6000 },
      );
      expect(await invoke(trustDecide, decision(waiting))).toMatchObject({ ok: true });
    }
    await vi.waitFor(async () => expect(await status()).toMatchObject({ state: "connected" }));
    for (const capability of ["ssh.shells.open", "ssh.shells.read", "ssh.fileSessions.open", "ssh.sftp.upload", "ssh.sftp.download", "ssh.monitor.session.open", "ssh.monitor.session.get", "ssh.forwarding.runs.start"])
      await f.allow(capability);
    const connection = { hostId, attemptId, routeRevision: route.routeRevision };
    const allocate = () => ({ ...connection, intentKey: randomUUID() });
    const { shellId } = z.object({ shellId: z.string() }).parse(data(await invoke("ssh.shells.open", allocate())));
    expect(data(await invoke("ssh.shells.read", { shellId, waitMs: 1000 }))).toMatchObject({ text: "welcome\n" });
    const { fileSessionId } = z.object({ fileSessionId: z.uuid() }).parse(data(await invoke("ssh.fileSessions.open", allocate())));
    const remotePath = "/home/test/three-jump.bin";
    const upload = { fileSessionId, remotePath, transferId: randomUUID(), intentKey: randomUUID(), dataBase64: "AQID" };
    expect(data(await invoke("ssh.sftp.upload", upload))).toMatchObject({ size: 3 });
    expect(data(await invoke("ssh.sftp.download", { fileSessionId, remotePath, transferId: randomUUID() }))).toMatchObject({ dataBase64: "AQID", eof: true });
    const monitor = z.object({ id: z.uuid() }).parse(data(await invoke("ssh.monitor.session.open", { ...allocate(), interval: 2 })));
    await vi.waitFor(
      async () =>
        expect(data(await invoke("ssh.monitor.session.get", monitor))).toMatchObject({
          host: { hostId, latest: { sample: { memory: { total: expect.any(Number) } } } },
        }),
      { timeout: 5000 },
    );

    echo.listen(0, "127.0.0.1");
    await once(echo, "listening");
    const echoPort = (echo.address() as { port: number }).port;
    forwardRule = await f.desktop<ForwardRule>("ssh.forwarding.rules.save", {
      name: "three-jump loopback",
      mode: "local",
      hostId,
      listenPort: echoPort,
      target: { host: "127.0.0.1", port: echoPort },
      resume: false,
    });
    const run = data(await invoke("ssh.forwarding.runs.start", { ...allocate(), id: forwardRule.id, expectedRevision: forwardRule.revision })) as ForwardRun;
    expect(run).toMatchObject({ ruleId: forwardRule.id, state: "running" });
    if (run.listener?.device !== "local") throw new Error("Expected a loopback forwarding listener");
    const socket = createConnection(run.listener.port, run.listener.host);
    try {
      await once(socket, "connect");
      const returned = once(socket, "data");
      socket.write("three jumps");
      expect((await returned)[0]).toEqual(Buffer.from("three jumps"));
    } finally {
      socket.destroy();
    }
    for (const hop of [...jumps, destination]) expect(hop.server.conns).toHaveLength(1);
    expect(received).toEqual([authority]);

    const removed = await f.call(f.engine.rendererToken, "ssh.outboundProxies.remove", { id: profile.id, revision: profile.revision });
    expect(removed).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    await f.desktop("ssh.hosts.configure", { ...destination.profile, hostId, expectedRevision: destination.revision, credentials: [], outboundProxy: { mode: "direct" } });
    const override = await f.desktop<ResourceHost>(hostGet, { hostId });
    expect(override.routeRevision).not.toBe(route.routeRevision);
    expect(await preview()).toEqual({ source: "direct" });
    await f.desktop("ssh.outboundProxies.setDefault", { expectedRevision: current.revision, defaultProfileId: null });
    expect(await f.desktop<ResourceHost>(hostGet, { hostId })).toEqual(override);
    expect(await preview()).toEqual({ source: "direct" });
    await f.desktop("ssh.outboundProxies.remove", { id: profile.id, revision: profile.revision });
  } finally {
    try {
      try {
        if (forwardRule) await f.desktop("ssh.forwarding.rules.delete", { id: forwardRule.id, expectedRevision: forwardRule.revision });
      } finally {
        await f.close();
      }
    } finally {
      if (echo.listening) await new Promise<void>((resolve, reject) => echo.close((error) => (error ? reject(error) : resolve())));
      for (const socket of sockets) socket.destroy();
      if (proxy.listening) {
        const closed = once(proxy, "close");
        proxy.close();
        await closed;
      }
    }
  }
});

test.each(["cli", "mcp"] as const)("%s retires every external connection when its effective proxy changes", { timeout: 30_000 }, async (entry) => {
  const f = await fixture();
  let dispatches = 0;
  try {
    const { hostId, server } = await f.host("outbound policy fixture", [], {
      onInteractiveExec: (_command, channel) => {
        dispatches++;
        channel.write("fixture started");
        return true;
      },
    });
    const { routeRevision } = await f.desktop<ResourceHost>(hostGet, { hostId });
    const binding = { hostId, routeRevision };
    const invoke = await externalTool(f, entry);
    for (const capability of [probeStart, probeGet, trustDecide, jobPrepare, jobStart, jobGet]) await f.allow(capability);

    const waitForTrust = async (attemptId: string) =>
      vi.waitFor(async () => {
        const status = PublicProbeStatus.parse(data(await invoke(probeGet, { hostId, attemptId })));
        if (status.state !== "waiting") throw new Error("Waiting for fixture trust");
        return status;
      });
    const openJob = async () => {
      const { jobId } = data(await invoke(jobPrepare, { ...binding, intentKey: randomUUID(), command: "fixture command" })) as { jobId: string };
      const status = async () => data(await invoke(jobGet, { jobId })) as JobStatus;
      const { attemptId } = await vi.waitFor(async () => {
        const job = await status();
        if (!("attemptId" in job) || !job.attemptId) throw new Error("Waiting for fixture attempt");
        return job;
      });
      expect(await invoke(trustDecide, decision(await waitForTrust(attemptId!)))).toMatchObject({ ok: true });
      const ready = await vi.waitFor(async () => {
        const job = await status();
        if (job.state !== "ready") throw new Error("Waiting for ready fixture job");
        return job;
      });
      return { jobId, ready, status };
    };
    const unstarted = await openJob();
    const running = await openJob();
    if (!("sessionId" in running.ready)) throw new Error("Ready fixture requires a session");
    expect(await invoke(jobStart, { ...binding, jobId: running.jobId, sessionId: running.ready.sessionId })).toMatchObject({ ok: true });
    await vi.waitFor(async () => expect(await running.status()).toMatchObject({ state: "running" }));

    const { attemptId } = data(await invoke(probeStart, binding)) as { attemptId: string };
    await waitForTrust(attemptId);
    expect(server.conns).toHaveLength(3);
    const proxy = await f.desktop<ProxyProfile>("ssh.outboundProxies.save", { expectedRevision: null, name: "changed policy", protocol: "socks5", host: "127.0.0.1", port: server.port, authentication: { action: "none" } });
    await f.desktop("ssh.outboundProxies.setDefault", { expectedRevision: null, defaultProfileId: proxy.id });
    await vi.waitFor(() => expect(server.closed()).toBe(3), { timeout: 2000 });
    expect(await unstarted.status()).toMatchObject({ state: "failed" });
    expect(await running.status()).toMatchObject({ state: "unknown", exitCode: null });
    expect(data(await invoke(probeGet, { hostId, attemptId }))).toMatchObject({ state: "failed", reason: "route-changed" });
    expect(dispatches).toBe(1);
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s rejects SSH host changes when their proxy binding changes before publication", { timeout: 20_000 }, async (entry) => {
  const f = await fixture();
  let markHeld!: () => void;
  const entered = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  let releaseWrite!: () => void;
  const resume = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  try {
    const host = await f.host("host binding publication fixture");
    const initial = await f.desktop<ResourceHost>(hostGet, { hostId: host.hostId });
    const proxy = await f.desktop<ProxyProfile>("ssh.outboundProxies.save", { expectedRevision: null, name: "other path", protocol: "http-connect", host: "127.0.0.1", port: host.server.port, authentication: { action: "none" } });
    const invoke = await externalTool(f, entry);
    const capability = "ssh.hosts.configure";
    await f.allow(capability);
    const files = f.engine.vault.files;
    const write = files.write.bind(files);
    let held = false;
    const pause = vi.spyOn(files, "write").mockImplementation(async (relative, bytes, options) => {
      if (!held && relative.startsWith(".huhu/module-credentials/")) {
        held = true;
        markHeld();
        await resume;
      }
      return write(relative, bytes, options);
    });
    const update = invoke(capability, { ...host.profile, hostId: host.hostId, name: "changed too late", expectedRevision: initial.revision, routeRevision: initial.routeRevision, intentKey: randomUUID(), credentials: [] });
    try {
      expect(await Promise.race([entered.then(() => "held"), update.then(() => "finished")])).toBe("held");
      await f.desktop("ssh.outboundProxies.setDefault", { expectedRevision: null, defaultProfileId: proxy.id });
    } finally {
      releaseWrite();
      pause.mockRestore();
    }
    expect(await update).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(await f.desktop<ResourceHost>(hostGet, { hostId: host.hostId })).toMatchObject({ name: host.profile.name, revision: initial.revision });
    expect(host.server.conns).toHaveLength(0);
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s selects and revokes SSH hosts across all public entry points", { timeout: 45_000 }, async (entry) => {
  const f = await fixture();
  const hostList = "ssh.hosts.list";
  const directory = "ssh.hosts.directory";
  const tools = [hostList, directory, hostGet, probeStart, probeGet, probeList, trustDecide, ...jobCapabilities];
  const commands: string[] = [];
  const notExposed = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
  const notGranted = { ok: false, error: { code: "PERMISSION_DENIED" } };
  try {
    const a = await f.host("visible fixture", [], {
      onExec: (command) => {
        commands.push(command);
        return { stdout: "fixture output", code: 0 };
      },
    });
    const b = await f.host("hidden fixture");
    const group = (name: string, expectedVersion: string) => f.desktop<{ version: string; groups: { name: string; groupId: string }[] }>("ssh.hosts.organize", { expectedVersion, operation: { type: "group.create", name, parentId: null } });
    const first = await group("selected group", "0");
    const second = await group("hidden group", first.version);
    const visible = second.groups.find(({ name }) => name === "selected group")!.groupId;
    const hidden = second.groups.find(({ name }) => name === "hidden group")!.groupId;
    const move = (hostId: string, groupId: string, expectedVersion: string) => f.desktop<{ version: string }>("ssh.hosts.organize", { expectedVersion, operation: { type: "hosts.move", hostIds: [hostId], groupId } });
    const placed = await move(a.hostId, visible, second.version);
    await move(b.hostId, hidden, placed.version);
    await f.chooseHosts([]);

    await f.desktop("gateway.mcp.update", { enabled: true });
    const { token } = await f.desktop<{ token: string }>("gateway.tokens.create", { name: "resource matrix" });
    let session = entry === "mcp" ? await openRecoverableMcpSession(f.mcpEndpoint(), token) : undefined;
    const name = (id: string) => (entry === "mcp" ? id.replaceAll(".", "_") : id);
    const discover = async () => {
      if (entry === "cli") return (await f.cliTools()).map(({ name }) => name);
      const result = await f.mcp(token, "tools/list", {}, session!.handle);
      return z
        .array(z.object({ name: z.string() }))
        .parse(result.tools)
        .map(({ name }) => name);
    };
    const invoke = async (id: string, args: object = {}): Promise<CapabilityResult<unknown>> => {
      if (entry === "cli") return f.cli(id, args);
      const result = await f.mcp(token, "tools/call", { name: name(id), arguments: args }, session!.handle);
      return CapabilityResultSchema.parse(result.isError ? { ok: false, error: JSON.parse(result.content[0].text) } : { ok: true, ...result.structuredContent });
    };
    const discardReply = async (id: string, args: object) => {
      if (entry === "cli") {
        await f.cli(id, args);
        return;
      }
      const response = await mcpRequest(f.mcpEndpoint(), token, mcpRpc("tools/call", { name: name(id), arguments: args }), session!.handle);
      expect(response.status).toBe(200);
      await response.body!.cancel();
    };
    expect((await discover()).filter((id) => tools.map(name).includes(id))).toEqual([]);
    for (const id of tools) {
      expect(await invoke(id), id).toMatchObject(notExposed);
      await f.allow(id);
    }
    expect(await discover()).toEqual(expect.arrayContaining(tools.map(name)));
    const host = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId: a.hostId });
    const binding = { hostId: a.hostId, routeRevision: host.routeRevision };
    const intent = { ...binding, intentKey: randomUUID() };
    const prepare = { ...binding, intentKey: randomUUID(), command: "fixture command" };
    for (const [id, input] of [
      [hostList, {}],
      [directory, {}],
      [hostGet, binding],
      [probeStart, intent],
      [jobPrepare, prepare],
    ] as const) {
      const args = id === hostGet ? { hostId: a.hostId } : input;
      expect(await invoke(id, args), id).toMatchObject(notGranted);
    }
    expect(a.server.conns).toHaveLength(0);
    await f.chooseHosts([a.hostId]);
    const version = () => f.engine.vault.files.currentVersion(".huhu/ssh/host-directory.json");
    const beforeRead = version();
    const sideEffects = [vi.spyOn(HerdrCore.prototype, "ensure"), vi.spyOn(ModuleCredentials.prototype, "list"), vi.spyOn(ModuleCredentials.prototype, "use")];
    try {
      const list = data(await invoke(hostList));
      expect(list).toEqual([{ id: a.hostId, name: a.profile.name, host: "127.0.0.1", port: a.server.port, user: "fixture-login", tags: [], revision: a.revision }]);
      expect(data(await invoke(directory))).toMatchObject({ groups: [{ groupId: visible }], hosts: [{ hostId: a.hostId }] });
      expect(await invoke(directory, { groupId: hidden })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(data(await invoke(hostGet, { hostId: a.hostId }))).toEqual(host);
      expect(await invoke(hostGet, { hostId: b.hostId })).toMatchObject(notGranted);
      expect(a.server.conns).toHaveLength(0);
      expect(b.server.conns).toHaveLength(0);
      expect(version()).toBe(beforeRead);
      for (const spy of sideEffects) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of sideEffects) spy.mockRestore();
    }

    const [left] = await Promise.all([invoke(probeStart, intent), discardReply(probeStart, intent)]);
    expect(await invoke(probeStart, intent)).toEqual(left);
    const probe = { hostId: a.hostId, ...z.object({ attemptId: z.string() }).parse(data(left)) };
    const waitForTrust = (address: typeof probe) =>
      vi.waitFor(async () => {
        const status = data(await invoke(probeGet, address));
        expect(status).toMatchObject({ state: "waiting" });
        return status as Waiting;
      });
    const prompt = await waitForTrust(probe);
    expect(data(await invoke(probeList))).toEqual(expect.arrayContaining([expect.objectContaining(probe)]));
    expect(data(await invoke(trustDecide, decision(prompt)))).toEqual({ applied: true });
    const [firstJob] = await Promise.all([invoke(jobPrepare, prepare), discardReply(jobPrepare, prepare)]);
    expect(await invoke(jobPrepare, prepare)).toEqual(firstJob);
    const job = z.object({ jobId: z.string() }).parse(data(firstJob));
    const field = async (key: "attemptId" | "sessionId") => vi.waitFor(async () => z.object({ [key]: z.string() }).parse(data(await invoke(jobGet, job)))[key]!);
    const jobPrompt = await waitForTrust({ hostId: a.hostId, attemptId: await field("attemptId") });
    expect(data(await invoke(trustDecide, decision(jobPrompt)))).toEqual({ applied: true });
    const start = { ...binding, ...job, sessionId: await field("sessionId") };
    const cursor = { ...job, stream: "stdout", cursor: 0 };
    expect(data(await invoke(jobStart, start))).toEqual(job);
    await vi.waitFor(async () => expect(data(await invoke(jobGet, job))).toMatchObject({ state: "exited" }));
    expect(data(await invoke(jobOutput, cursor))).toMatchObject({ text: "fixture output" });
    expect(data(await invoke(jobCancel, job))).toEqual({ requested: false });
    expect(commands).toEqual([prepare.command]);
    expect(a.server.conns).toHaveLength(2);

    const rows = [
      [hostList, {}],
      [directory, {}],
      [hostGet, { hostId: a.hostId }],
      [probeStart, intent],
      [probeGet, probe],
      [probeList, {}],
      [trustDecide, decision(prompt)],
      [jobPrepare, prepare],
      [jobStart, start],
      [jobGet, job],
      [jobOutput, cursor],
      [jobCancel, job],
    ] as const;
    for (const [id, input] of rows) {
      await f.allow(id, false);
      expect(await discover()).not.toContain(name(id));
      expect(await invoke(id, input), id).toMatchObject(notExposed);
      await f.allow(id, true);
    }
    await f.chooseHosts([b.hostId]);
    for (const [id, input] of rows.filter(([id]) => ![hostList, directory, probeList].includes(id))) expect(await invoke(id, input), id).toMatchObject(notGranted);
    expect(data(await invoke(probeList))).toEqual([]);
    await f.chooseHosts([a.hostId]);
    await f.restart();
    if (session) session = await openRecoverableMcpSession(f.mcpEndpoint(), token, session.recovery);
    expect(data(await invoke(jobGet, job))).toMatchObject({ state: "exited", exitCode: 0 });
    expect(await invoke(probeStart, intent)).toMatchObject({ ok: false, error: { details: { outcome: "unknown" } } });
    if (entry === "cli") expect(data(await invoke(jobPrepare, prepare))).toEqual(job);
    await f.chooseHosts([]);
    expect(await invoke(jobGet, job)).toMatchObject(notGranted);
    expect(await invoke(jobOutput, cursor)).toMatchObject(notGranted);
    expect(commands).toEqual([prepare.command]);
    expect(a.server.conns).toHaveLength(2);
    expect(b.server.conns).toHaveLength(0);
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s confines host edits, copies, directory changes and removal to the authorized SSH route", { timeout: 45_000 }, async (entry) => {
  const f = await fixture();
  const configure = "ssh.hosts.configure";
  const copy = "ssh.hosts.copy";
  const remove = "ssh.hosts.remove";
  const organize = "ssh.hosts.organize";
  const denied = { ok: false, error: { code: "PERMISSION_DENIED" } };
  const closed = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
  try {
    const jump = await f.host("granted jump");
    const target = await f.host("original target", [jump.hostId]);
    const hidden = await f.host("ungranted host");
    const describeRoute = (hostId: string) => f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    const selectedRoute = await describeRoute(target.hostId);
    const jumpRoute = await describeRoute(jump.hostId);
    const targetBinding = { hostId: target.hostId, routeRevision: selectedRoute.routeRevision };
    const jumpBinding = { hostId: jump.hostId, routeRevision: jumpRoute.routeRevision, expectedRevision: jumpRoute.revision };
    const createGroup = (name: string, expectedVersion: string) => f.desktop<{ version: string; groups: { groupId: string; name: string }[] }>(organize, { expectedVersion, operation: { type: "group.create", name, parentId: null } });
    const { version: initial } = await createGroup("visible group", "0");
    const { version: withGroup, groups } = await createGroup("hidden group", initial);
    const visibleId = groups.find(({ name }) => name === "visible group")!.groupId;
    const hiddenId = groups.find(({ name }) => name === "hidden group")!.groupId;
    const place = (hostId: string, groupId: string, expectedVersion: string) => f.desktop<{ version: string }>(organize, { expectedVersion, operation: { type: "hosts.move", hostIds: [hostId], groupId } });
    const placedTarget = await place(target.hostId, visibleId, withGroup);
    const placedHidden = await place(hidden.hostId, hiddenId, placedTarget.version);

    await f.desktop("gateway.mcp.update", { enabled: true });
    const { token } = await f.desktop<{ token: string }>("gateway.tokens.create", { name: "host mutation fixture" });
    let session = entry === "mcp" ? await openRecoverableMcpSession(f.mcpEndpoint(), token) : undefined;
    const invoke = async (id: string, args: object = {}): Promise<CapabilityResult<unknown>> => {
      if (entry === "cli") return f.cli(id, args);
      const result = await f.mcp(token, "tools/call", { name: id.replaceAll(".", "_"), arguments: args }, session!.handle);
      return CapabilityResultSchema.parse(result.isError ? { ok: false, error: JSON.parse(result.content[0].text) } : { ok: true, ...result.structuredContent });
    };
    const capabilities = [configure, copy, remove, organize];
    for (const id of capabilities) {
      expect(await invoke(id), id).toMatchObject(closed);
      await f.allow(id);
    }
    if (entry === "cli") {
      expect((await f.cliTools()).map(({ name }) => name)).toEqual(expect.arrayContaining(capabilities));
    } else {
      const discovered = await f.mcp(token, "tools/list", {}, session!.handle);
      expect(discovered.tools).toEqual(expect.arrayContaining(capabilities.map((id) => expect.objectContaining({ name: id.replaceAll(".", "_"), inputSchema: expect.objectContaining({ type: "object" }) }))));
    }
    const secret = `synthetic-rotation-${randomUUID()}`;
    const edit = {
      ...target.profile,
      ...targetBinding,
      expectedRevision: target.revision,
      name: "revised target",
      intentKey: randomUUID(),
      credentials: [{ purpose: "password", action: "replace", value: secret }],
    };
    await f.chooseHosts([target.hostId]);
    expect(await invoke(configure, edit)).toMatchObject(denied);
    await f.chooseHosts([target.hostId, jump.hostId]);
    expect(await invoke(configure, { ...edit, port: hidden.server.port })).toMatchObject(denied);
    expect(await invoke(configure, { ...edit, credentials: [{ purpose: "identityFile", action: "replace", value: "/synthetic-fixture" }] })).toMatchObject(denied);
    expect(await invoke(configure, { ...edit, routeRevision: "0".repeat(64) })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });

    const pin = { expectedVersion: placedHidden.version, operation: { type: "hosts.pin", hostIds: [target.hostId], pinned: true }, bindings: [targetBinding], intentKey: randomUUID() };
    expect(await invoke(organize, { ...pin, operation: { type: "hosts.move", hostIds: [target.hostId], groupId: hiddenId } })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const scopedPin = { ...pin, intentKey: randomUUID() };
    const validPin = await invoke(organize, scopedPin);
    expect(validPin).toEqual({ ok: true, data: { version: expect.any(String) } });
    expect(await invoke(organize, scopedPin)).toEqual(validPin);
    expect(await invoke(organize, { ...scopedPin, operation: { type: "sort.set", sort: "manual" } })).toMatchObject(denied);
    const version = (reply: CapabilityResult<unknown>) => z.object({ version: z.string() }).parse(data(reply)).version;
    const jumpDirectoryBinding = { hostId: jump.hostId, routeRevision: jumpRoute.routeRevision };
    const moved = await invoke(organize, {
      expectedVersion: version(validPin),
      operation: { type: "hosts.move", hostIds: [jump.hostId], groupId: visibleId },
      bindings: [jumpDirectoryBinding],
      intentKey: randomUUID(),
    });
    const order = {
      expectedVersion: version(moved),
      operation: { type: "hosts.reorder", hostIds: [target.hostId, jump.hostId], groupId: visibleId },
      bindings: [targetBinding, jumpDirectoryBinding],
      intentKey: randomUUID(),
    };
    expect(await invoke(organize, order)).toEqual({ ok: true, data: { version: expect.any(String) } });
    const directory = await f.desktop<{ hosts: { hostId: string; pinned: boolean; groupId: string }[] }>("ssh.hosts.directory");
    expect(directory.hosts.find(({ hostId }) => hostId === target.hostId)).toMatchObject({ pinned: true, groupId: visibleId });
    expect(directory.hosts.find(({ hostId }) => hostId === jump.hostId)).toMatchObject({ groupId: visibleId });
    expect(directory.hosts.find(({ hostId }) => hostId === hidden.hostId)).toMatchObject({ pinned: false, groupId: hiddenId });

    const [firstEdit, repeatedEdit] = await Promise.all([invoke(configure, edit), invoke(configure, edit)]);
    expect(repeatedEdit).toEqual(firstEdit);
    const current = await describeRoute(target.hostId);
    expect(current).toMatchObject({ name: edit.name });
    expect(firstEdit).toEqual({ ok: true, data: { hostId: target.hostId, revision: current.revision } });
    expect(await invoke(configure, { ...edit, credentials: [{ purpose: "password", action: "replace", value: "other-synthetic-secret" }] })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
    expect(await invoke(configure, { ...edit, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });

    const copyRequest = { ...jumpBinding, name: "new independent host", intentKey: randomUUID() };
    const [copyResult, retryCopy] = await Promise.all([invoke(copy, copyRequest), invoke(copy, copyRequest)]);
    expect(retryCopy).toEqual(copyResult);
    const copied = z.object({ hostId: z.string(), revision: z.string() }).parse(data(copyResult));
    expect(copyResult).toEqual({ ok: true, data: copied });
    expect(copied.hostId).not.toBe(jump.hostId);
    const copiedRoute = await describeRoute(copied.hostId);
    const removingCopy = { hostId: copied.hostId, routeRevision: copiedRoute.routeRevision, expectedRevision: copied.revision, intentKey: randomUUID() };
    expect(await invoke(remove, removingCopy)).toMatchObject(denied);
    expect(await invoke(remove, { ...jumpBinding, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const workbench = await f.desktop<{ id: string; configured: boolean }[]>("ssh.hosts.list");
    expect(workbench.find(({ id }) => id === copied.hostId)?.configured).toBe(false);
    await f.chooseHosts([target.hostId, jump.hostId, copied.hostId]);
    expect(await invoke(remove, removingCopy)).toEqual({ ok: true, data: { ok: true } });
    expect(await invoke(remove, removingCopy)).toEqual({ ok: true, data: { ok: true } });

    for (const [id, request] of [
      [configure, edit],
      [copy, copyRequest],
      [remove, removingCopy],
      [organize, scopedPin],
    ] as const) {
      await f.allow(id, false);
      expect(await invoke(id, request), id).toMatchObject(closed);
      await f.allow(id, true);
    }
    await f.chooseHosts([target.hostId]);
    expect(await invoke(configure, edit)).toMatchObject(denied);
    expect(await invoke(organize, scopedPin)).toMatchObject(denied);
    expect(await invoke(copy, copyRequest)).toMatchObject(denied);
    expect(await invoke(remove, removingCopy)).toMatchObject(denied);
    await f.chooseHosts([target.hostId, jump.hostId]);
    const receipts = await readFile(path.join(f.engine.vault.runtimeDir, "ssh-host-intents.ndjson"), "utf8");
    expect(receipts).not.toContain(secret);
    expect(receipts).not.toContain("authState");
    expect(receipts).not.toContain("configured");
    await f.restart();
    if (session) session = await openRecoverableMcpSession(f.mcpEndpoint(), token, session.recovery);
    if (entry === "cli") {
      expect(await invoke(configure, edit)).toEqual(firstEdit);
      expect(await invoke(copy, copyRequest)).toEqual(copyResult);
    } else {
      expect(await invoke(configure, edit)).toMatchObject({ ok: false, error: { details: { outcome: "unknown" } } });
      expect(await invoke(copy, copyRequest)).toMatchObject({ ok: false, error: { details: { outcome: "unknown" } } });
    }
    expect((await describeRoute(target.hostId)).revision).toBe(current.revision);
    expect((await f.desktop<{ id: string }[]>("ssh.hosts.list")).some(({ id }) => id === copied.hostId)).toBe(false);
    for (const host of [target, jump, hidden]) expect(host.server.conns).toHaveLength(0);
  } finally {
    await f.close();
  }
});

test("the legacy policy defaults to no SSH access and resource changes share an atomic policy revision", async () => {
  const f = await fixture();
  try {
    const access = () => f.desktop<{ toolAccess: { revision: number; choices: Record<string, boolean>; resources?: { "ssh.hosts": string[] } } }>("gateway.get").then(({ toolAccess }) => toolAccess);
    expect(await access()).not.toHaveProperty("resources");
    const { hostId } = await f.host("resource revision fixture");
    const current = await access();
    const resources = { "ssh.hosts": [] };
    const changes = [{ capability: hostGet, exposed: true }];
    const preview = await f.desktop<{ revision: number; catalogRevision: string }>("gateway.policy.preview", { changes, resources, expectedRevision: current.revision });
    const token = f.engine.rendererToken;
    const saved = { changes, resources, expectedRevision: preview.revision, catalogRevision: preview.catalogRevision };
    const changeAgain = { ...saved, resources: { "ssh.hosts": [hostId] }, changes: [{ capability: probeGet, exposed: true }] };
    const outcomes = await Promise.all([f.call(token, "gateway.policy.update", saved), f.call(token, "gateway.policy.update", changeAgain)]);
    expect(outcomes.filter((reply) => reply.ok)).toHaveLength(1);
    expect(outcomes.find((reply) => !reply.ok)).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
    const committed = await access();
    expect(committed.revision).toBe(current.revision + 1);
    const granted = committed.resources?.["ssh.hosts"].includes(hostId);
    expect(committed.choices[hostGet]).toBe(!granted);
    expect(await f.call(token, "gateway.policy.preview", { resources: { "ssh.hosts": [`host-owned-${"e".repeat(32)}`] } })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });

    await f.allow("gateway.get");
    await f.allow("gateway.policy.preview");
    const external = f.engine.cliToken;
    expect(data(await f.call<{ toolAccess: object }>(external, "gateway.get")).toolAccess).not.toHaveProperty("resources");
    expect(await f.call(external, "gateway.policy.preview", { resources })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(await f.call(external, "gateway.policy.update", saved)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    expect((await access()).resources).toEqual(committed.resources);
  } finally {
    await f.close();
  }
});

test("only authorized Engine, CLI and MCP resolve the same portable SSH host and route without credentials or a dial", { timeout: 30_000 }, async () => {
  const f = await fixture();
  try {
    const jump = await f.host("jump fixture");
    const target = await f.host("target fixture", [jump.hostId]);
    const { hostId } = target;
    const { cliToken } = f.engine;
    const mcpToken = await issueMcpCredential(f.engine);
    expect(await f.call(cliToken, hostGet, { hostId })).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    const enabled = await f.allow(hostGet);
    expect(enabled).toMatchObject({ exposed: true });
    await f.chooseHosts([target.hostId]);
    expect(await f.cli(hostGet, { hostId })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    await f.chooseHosts([jump.hostId, target.hostId]);
    await f.desktop("gateway.mcp.update", { enabled: true });
    const using = vi.spyOn(ModuleCredentials.prototype, "use");
    const checking = vi.spyOn(ModuleCredentials.prototype, "list");
    try {
      const projected = await f.desktop(hostGet, { hostId });
      expect(projected).toEqual({
        hostId,
        name: target.profile.name,
        authKind: "password",
        host: target.profile.host,
        port: target.profile.port,
        revision: target.revision,
        routeRevision: expect.stringMatching(/^[a-f0-9]{64}$/),
        route: [jump, target].map((hop) => ({ hostId: hop.hostId, revision: hop.revision, host: hop.profile.host, port: hop.profile.port })),
      });
      expect(await f.cli(hostGet, { hostId })).toEqual({ ok: true, data: projected });
      expect(await f.mcp(mcpToken, "tools/call", { name: "ssh_resources_host_get", arguments: { hostId } })).toMatchObject({ structuredContent: { data: projected } });
      expect(await f.call(cliToken, hostGet, { hostId: `host-owned-${"a".repeat(32)}` })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      expect(await f.call(cliToken, hostGet, { hostId, includeSecrets: true })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      for (const srv of [jump, target]) expect(srv.server.conns).toHaveLength(0);
      expect(using).not.toHaveBeenCalled();
      expect(checking).not.toHaveBeenCalled();
    } finally {
      using.mockRestore();
      checking.mockRestore();
    }
    await f.allow(hostGet, false);
    expect(await f.call(cliToken, hostGet, { hostId })).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await f.allow(hostGet);
    await f.desktop("plugins.setEnabled", { id: "ssh", enabled: false });
    expect(await f.call(cliToken, hostGet, { hostId })).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
    expect(await f.desktop("capabilities.list", { includeInactive: true })).toContainEqual(expect.objectContaining({ name: hostGet, scope: "read", availability: "plugin-disabled", selected: true }));
  } finally {
    await f.close();
  }
});

async function beginProbe(f: Awaited<ReturnType<typeof fixture>>, token: string, hostId: string) {
  const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
  const input = { hostId, routeRevision };
  const { attemptId } = data(await f.call<{ attemptId: string }>(token, probeStart, input));
  return { ...input, attemptId };
}

test.each(["cli", "mcp"] as const)("%s can test a draft only at its authorized SSH route", { timeout: 30_000 }, async (entry) => {
  const f = await fixture();
  const capability = "ssh.hosts.testDraft";
  const denied = { ok: false, error: { code: "PERMISSION_DENIED" } };
  const authentication: string[] = [];
  try {
    const host = await f.host("authorized fixture", [], { onAuth: (_user, method) => authentication.push(method) });
    const other = await f.host("unrelated fixture");
    const { routeRevision } = await f.desktop<ResourceHost>(hostGet, { hostId: host.hostId });
    const input = { ...host.profile, hostId: host.hostId, expectedRevision: host.revision, routeRevision };
    const invoke = await externalTool(f, entry);

    expect(await invoke(capability, input)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await f.allow(capability);
    await f.chooseHosts([other.hostId]);
    expect(await invoke(capability, input)).toMatchObject(denied);
    await f.chooseHosts([host.hostId]);
    expect(await invoke(capability, { ...input, routeRevision: "0".repeat(64) })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(await invoke(capability, { ...input, port: other.profile.port })).toMatchObject(denied);
    expect(await invoke(capability, { ...input, user: "other-user" })).toMatchObject(denied);
    expect(await invoke(capability, { ...input, authKind: "identity-file", credentials: [{ action: "replace", purpose: "identityFile", value: "/fixture/key" }] })).toMatchObject(denied);
    expect(host.server.conns).toHaveLength(0);
    expect(other.server.conns).toHaveLength(0);

    expect(await invoke(capability, input)).toMatchObject({ ok: true, data: { state: "reachable", hop: 0, reason: "host-key" } });
    expect(host.server.conns).toHaveLength(1);
    expect(other.server.conns).toHaveLength(0);
    expect(authentication).toEqual([]);
    expect(await f.desktop("ssh.connections.status")).toEqual([]);
    expect(await f.desktop("ssh.knownHosts.list")).toEqual([]);

    await f.allow(capability, false);
    expect(await invoke(capability, input)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  } finally {
    await f.close();
  }
});

async function awaitPrompt(f: Awaited<ReturnType<typeof fixture>>, token: string, binding: { hostId: string; attemptId: string }, state: "waiting" | "key-changed" = "waiting", hop?: number) {
  return vi.waitFor(
    async () => {
      const probe = data(await f.call<Probe>(token, probeGet, binding));
      if (probe.state !== state || (hop !== undefined && probe.prompt.hop !== hop)) throw new Error("Waiting for the expected SSH hop");
      return probe;
    },
    { timeout: 5000 },
  );
}

test("first trust stays with the original attempt, route and external subject through policy and token revocation", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const auth: string[] = [];
  try {
    const { hostId, server } = await f.host("owner fixture", [], { onAuth: (_user, method) => auth.push(method) });
    const another = await f.host("other fixture");
    await f.desktop("plugins.setEnabled", { id: "safe", enabled: false });
    const a = await f.desktop<{ id: string; token: string }>("gateway.tokens.create", { name: "fixture A" });
    const b = await f.desktop<{ id: string; token: string }>("gateway.tokens.create", { name: "fixture B" });
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    await f.allow(probeGet);
    await f.allow(probeList);
    expect(await f.call(a.token, probeStart, { hostId, routeRevision })).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    expect(await f.call(a.token, probeList)).toEqual({ ok: true, data: [] });
    expect(server.conns).toHaveLength(0);

    await f.allow(probeStart);
    const { attemptId } = await beginProbe(f, a.token, hostId);
    const key = { hostId, attemptId };
    const waiting = await awaitPrompt(f, a.token, key);
    const reply = decision(waiting);
    expect(waiting.prompt.fingerprint).toBe(server.fingerprint);
    expect(await f.call(a.token, probeStart, { hostId, routeRevision })).toEqual({ ok: true, data: { attemptId } });
    expect(await f.call(b.token, probeGet, key)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await f.call(b.token, probeList)).toEqual({ ok: true, data: [] });
    expect(await f.cli(probeGet, key)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await f.desktop("ssh.connections.status")).toEqual([]);
    expect(await f.desktop("ssh.hostKey.decide", { attemptId, hop: reply.hop, promptId: reply.promptId, accept: true, remember: false })).toEqual({ applied: false });
    expect(await f.call(a.token, trustDecide, reply)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await f.allow(trustDecide);
    for (const invalid of [{ hostId: another.hostId }, { serverHostId: another.hostId }, { hop: reply.hop + 1 }, { promptRevision: "0".repeat(64) }, { routeRevision: "0".repeat(64) }, { promptId: "other" }]) {
      expect(await f.call(a.token, trustDecide, { ...reply, ...invalid })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    }
    expect(await f.call(a.token, trustDecide, { ...reply, remember: true })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    await f.desktop("gateway.mcp.update", { enabled: true });
    expect(await f.mcp(a.token, "tools/call", { name: "ssh_resources_connection_get", arguments: key })).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("NOT_FOUND") }] });
    await f.allow(trustDecide, false);
    const idempotencyKey = randomUUID();
    expect(await f.call(a.token, trustDecide, reply, idempotencyKey)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    expect(auth).not.toContain("password");
    await f.allow(trustDecide);
    expect(await f.call(a.token, trustDecide, reply, idempotencyKey)).toEqual({ ok: true, data: { applied: true } });
    expect(await f.call(b.token, trustDecide, reply, idempotencyKey)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await f.call(a.token, trustDecide, reply, idempotencyKey)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    await vi.waitFor(async () => expect(await f.call(a.token, probeGet, key)).toMatchObject({ ok: true, data: { state: "verified" } }));
    await vi.waitFor(() => expect(server.closed()).toBe(1));
    expect(auth.filter((method) => method === "password")).toHaveLength(1);
    expect(await f.desktop("ssh.knownHosts.list")).toEqual([]);

    const refused = await beginProbe(f, a.token, hostId);
    const refusedPrompt = await awaitPrompt(f, a.token, { hostId, attemptId: refused.attemptId });
    expect(await f.call(a.token, trustDecide, { ...decision(refusedPrompt), accept: false })).toMatchObject({ ok: true, data: { applied: true } });
    await vi.waitFor(async () => expect(await f.call(a.token, probeGet, { hostId, attemptId: refused.attemptId })).toMatchObject({ ok: true, data: { state: "failed" } }));

    const next = await beginProbe(f, a.token, hostId);
    const held = await awaitPrompt(f, a.token, { hostId, attemptId: next.attemptId });
    await f.desktop("gateway.tokens.revoke", { id: a.id });
    expect(await f.call(a.token, trustDecide, decision(held))).toMatchObject({ ok: false, error: { code: "HTTP_401" } });
    expect(auth.filter((method) => method === "password")).toHaveLength(1);
    expect(another.server.conns).toHaveLength(0);
    await f.desktop("plugins.setEnabled", { id: "ssh", enabled: false });
    await vi.waitFor(() => expect(server.closed()).toBe(3), { timeout: 5000 });
    await f.desktop("plugins.setEnabled", { id: "ssh", enabled: true });
    expect(await f.call(b.token, probeList)).toEqual({ ok: true, data: [] });
  } finally {
    await f.close();
  }
});

test("a changed jump revision invalidates the original pending target before authentication", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const targetAuth: string[] = [];
  try {
    const jump = await f.host("jump fixture");
    const target = await f.host("target fixture", [jump.hostId], { onAuth: (_user, method) => targetAuth.push(method) });
    for (const capability of [probeStart, probeGet, trustDecide]) await f.allow(capability);
    const { cliToken } = f.engine;
    const hostId = target.hostId;
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    const { attemptId } = data(await f.cli(probeStart, { hostId, routeRevision })) as { attemptId: string };
    const key = { hostId, attemptId };
    const first = await awaitPrompt(f, cliToken, key, "waiting", 0);
    expect(first.prompt).toMatchObject({ serverHostId: jump.hostId, fingerprint: jump.server.fingerprint });
    expect(await f.cli(trustDecide, decision(first))).toMatchObject({ ok: true });
    const second = await awaitPrompt(f, cliToken, key, "waiting", 1);
    expect(second.prompt).toMatchObject({ serverHostId: target.hostId, fingerprint: target.server.fingerprint });
    expect(await f.call(cliToken, trustDecide, decision(first))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    await f.desktop("ssh.hosts.configure", { ...jump.profile, name: "revised jump", hostId: jump.hostId, expectedRevision: jump.revision, credentials: [] });
    expect(await f.desktop(hostGet, { hostId })).not.toMatchObject({ routeRevision });
    await vi.waitFor(async () => {
      expect(await f.call(cliToken, probeGet, key)).toMatchObject({
        ok: true,
        data: { ...key, routeRevision, state: "failed", reason: "route-changed" },
      });
      expect(jump.server.closed()).toBe(1);
      expect(target.server.closed()).toBe(1);
    });
    expect(await f.call(cliToken, trustDecide, decision(second))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(targetAuth).not.toContain("password");
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s reads current SSH connection, known host and audit metadata within the authorized route", { timeout: 45_000 }, async (entry) => {
  const f = await fixture();
  const statuses = "ssh.connections.status";
  const keys = "ssh.knownHosts.list";
  const audit = "ssh.audit.list";
  const tools = [statuses, keys, audit];
  const notGranted = { ok: false, error: { code: "PERMISSION_DENIED" } };
  try {
    const jump = await f.host("metadata jump");
    const target = await f.host("metadata target", [jump.hostId]);
    const { hostId } = target;
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    await f.desktop("gateway.mcp.update", { enabled: true });
    const { token } = await f.desktop<{ token: string }>("gateway.tokens.create", { name: "metadata fixture" });
    const session = await openMcpSession(f.mcpEndpoint(), token);
    const otherSession = await openMcpSession(f.mcpEndpoint(), token);
    const mcp = async (id: string, input: object, handle: string) => {
      const result = await f.mcp(token, "tools/call", { name: id.replaceAll(".", "_"), arguments: input }, handle);
      return CapabilityResultSchema.parse(result.isError ? { ok: false, error: JSON.parse(result.content[0].text) } : { ok: true, ...result.structuredContent });
    };
    const invoke = (id: string, input = {}) => (entry === "cli" ? f.cli(id, input) : mcp(id, input, session));
    const names = tools.map((name) => (entry === "cli" ? name : name.replaceAll(".", "_")));
    const discover = async () => (entry === "cli" ? await f.cliTools() : z.array(z.object({ name: z.string() })).parse((await f.mcp(token, "tools/list", {}, session)).tools)).map(({ name }) => name);

    expect((await discover()).filter((name) => names.includes(name))).toEqual([]);
    for (const tool of tools) {
      expect(await invoke(tool), tool).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
      await f.allow(tool);
    }
    expect(await discover()).toEqual(expect.arrayContaining(names));
    await f.chooseHosts([]);
    for (const tool of tools) expect(await invoke(tool), tool).toMatchObject(notGranted);
    await f.chooseHosts([hostId, jump.hostId]);

    for (const tool of [probeStart, trustDecide]) await f.allow(tool);
    const binding = { hostId, routeRevision };
    const { attemptId } = z.object({ attemptId: z.string() }).parse(data(await invoke(probeStart, { ...binding, intentKey: randomUUID() })));
    const waitForHop = (hop: number) =>
      vi.waitFor(async () => {
        const records = z.array(PublicProbeStatus).parse(data(await invoke(statuses)));
        const record = records.find((value) => value.attemptId === attemptId);
        if (record?.state !== "waiting" || record.prompt.hop !== hop) throw new Error("Waiting for SSH fingerprint");
        return record;
      });
    const first = await waitForHop(0);
    expect(first.prompt).toMatchObject({ serverHostId: jump.hostId, fingerprint: jump.server.fingerprint });
    expect(data(await mcp(statuses, {}, otherSession))).toEqual([]);
    expect(await f.desktop(statuses)).toEqual([]);
    expect(data(await invoke(trustDecide, decision(first)))).toEqual({ applied: true });
    const second = await waitForHop(1);
    expect(second.prompt).toMatchObject({ serverHostId: hostId, fingerprint: target.server.fingerprint });
    expect(data(await invoke(trustDecide, decision(second)))).toEqual({ applied: true });
    const auditEntry = { hostId, at: expect.any(String), action: "connect", result: "ok", detail: "" };
    await vi.waitFor(async () => expect(data(await invoke(audit, { hostId }))).toEqual([auditEntry]));
    expect(data(await mcp(audit, { hostId }, otherSession))).toEqual([]);
    expect(await f.desktop(audit, { hostId })).toEqual([]);

    await f.desktop("ssh.connect", { hostId, background: true });
    for (const hop of [0, 1]) {
      const { prompt } = await vi.waitFor(async () => {
        const records = await f.desktop<ConnectionStatus[]>(statuses);
        const pending = records.find((value) => value.hostId === hostId);
        if (pending?.state !== "waiting" || pending.prompt.hop !== hop) throw new Error("Waiting for desktop trust");
        return pending;
      });
      const { attemptId, promptId } = prompt;
      await f.desktop("ssh.hostKey.decide", { attemptId, hop, promptId, accept: true, remember: true });
    }
    await vi.waitFor(async () => expect(await f.desktop(statuses)).toMatchObject([{ state: "connected" }]));
    const credentials = [vi.spyOn(ModuleCredentials.prototype, "list"), vi.spyOn(ModuleCredentials.prototype, "use")];
    try {
      const counts = [jump.server.conns.length, target.server.conns.length];
      const knownHosts = data(await invoke(keys));
      expect(knownHosts).toEqual(
        expect.arrayContaining([expect.objectContaining({ port: jump.server.port, fingerprint: jump.server.fingerprint }), expect.objectContaining({ port: target.server.port, fingerprint: target.server.fingerprint })]),
      );
      expect(data(await invoke(statuses))).toEqual([{ ...binding, attemptId, state: "verified" }]);
      expect(data(await invoke(audit))).toEqual([auditEntry]);
      await f.chooseHosts([hostId]);
      expect(data(await invoke(keys))).toEqual([]);
      expect(data(await invoke(statuses))).toEqual([]);
      expect(data(await invoke(audit))).toEqual([]);
      expect(await invoke(audit, { hostId })).toMatchObject(notGranted);
      expect([jump.server.conns.length, target.server.conns.length]).toEqual(counts);
      for (const spy of credentials) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of credentials) spy.mockRestore();
    }
    await f.chooseHosts([hostId, jump.hostId]);
    expect(data(await invoke(statuses))).toEqual([]);
    await f.desktop("ssh.hosts.configure", { ...jump.profile, name: "revised metadata jump", hostId: jump.hostId, expectedRevision: jump.revision, credentials: [] });
    expect(data(await invoke(statuses))).toEqual([]);
    expect(data(await invoke(audit, { hostId }))).toEqual([]);
    for (const tool of tools) {
      await f.allow(tool, false);
      expect(await invoke(tool), tool).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    }
    expect((await discover()).filter((name) => names.includes(name))).toEqual([]);
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s scopes monitor reads and edits to authorized routes without starting a sampler", { timeout: 35_000 }, async (entry) => {
  const f = await fixture();
  const list = "ssh.monitor.panels.list";
  const cached = "ssh.monitor.panels.run";
  const save = "ssh.monitor.panels.save";
  const remove = "ssh.monitor.panels.delete";
  const change = "ssh.monitor.panels.change";
  let samples = 0;
  try {
    const jump = await f.host("monitor jump");
    const target = await f.host("monitored host", [jump.hostId], {
      onExec(command) {
        if (command === PLATFORM_COMMAND) return { stdout: "Linux" };
        if (command === LINUX_SAMPLE) {
          samples++;
          return { stdout: "memory 8192 4096\nuptime 3600\n" };
        }
        return undefined;
      },
    });
    const draft = { name: "fixture monitor", note: "", hostIds: [target.hostId], interval: 2, retention: 15 };
    const panel = await f.desktop<MonitorPanel>(save, draft);
    const binding = { id: panel.id, expectedRevision: panel.revision };
    await f.desktop("gateway.mcp.update", { enabled: true });
    const { token } = await f.desktop<{ token: string }>("gateway.tokens.create", { name: "monitor fixture" });
    const session = entry === "mcp" ? await openMcpSession(f.mcpEndpoint(), token) : undefined;
    const invoke = async (id: string, args: object = {}) => {
      if (entry === "cli") return f.cli(id, args);
      const result = await f.mcp(token, "tools/call", { name: id.replaceAll(".", "_"), arguments: args }, session);
      return CapabilityResultSchema.parse(result.isError ? { ok: false, error: JSON.parse(result.content[0].text) } : { ok: true, ...result.structuredContent });
    };
    for (const tool of [list, cached, save, remove]) {
      expect(await invoke(tool)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
      await f.allow(tool);
    }
    const route = () => f.desktop<ResourceHost>(hostGet, { hostId: target.hostId });
    const { routeRevision } = await route();
    const bindings = [{ hostId: target.hostId, routeRevision }];
    const creation = { ...draft, name: "idle monitor", bindings, intentKey: randomUUID() };
    await f.chooseHosts([target.hostId]);
    expect(data(await invoke(list))).toEqual([]);
    expect(await invoke(cached, binding)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await invoke(save, creation)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    await f.chooseHosts([target.hostId, jump.hostId]);
    expect(data(await invoke(list))).toEqual([panel]);
    expect(await invoke(cached, { ...binding, expectedRevision: randomUUID() })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(data(await invoke(cached, binding))).toBeNull();
    const [created, replay] = await Promise.all([invoke(save, creation), invoke(save, creation)]);
    expect(created).toEqual(replay);
    const idle = z.object({ id: z.string(), revision: z.string() }).parse(data(created));
    const removeIdle = { id: idle.id, expectedRevision: idle.revision, bindings, intentKey: randomUUID() };
    expect(data(await invoke(remove, removeIdle))).toEqual({ ok: true });
    expect(data(await invoke(remove, removeIdle))).toEqual({ ok: true });
    expect(jump.server.conns).toHaveLength(0);
    expect(target.server.conns).toHaveLength(0);

    await f.desktop(change, { ...binding, action: "start" });
    for (const hop of [0, 1]) {
      const prompt = await vi.waitFor(async () => {
        const active = await f.desktop<MonitorPanelRun>(cached, { id: panel.id });
        const key = active.hosts[0]?.prompt;
        if (key?.hop !== hop) throw new Error("Waiting for monitor route trust");
        return key;
      });
      expect(data(await invoke(cached, binding))).toBeNull();
      await f.desktop("ssh.hostKey.decide", { attemptId: prompt.attemptId, hop, promptId: prompt.promptId, accept: true, remember: false });
    }
    await vi.waitFor(
      async () => {
        const result = await f.desktop<MonitorPanelRun>(cached, { id: panel.id });
        expect(result.hosts[0]?.latest?.sample?.memory).toEqual({ total: 8192, available: 4096 });
      },
      { timeout: 7_500, interval: 30 },
    );
    expect(data(await invoke(cached, binding))).toBeNull();
    await f.desktop(change, { ...binding, action: "pause" });
    const before = samples;
    expect(data(await invoke(cached, binding))).toBeNull();
    const deletion = { ...binding, bindings, intentKey: randomUUID() };
    expect(await invoke(save, { ...creation, intentKey: randomUUID(), previous: binding })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(await invoke(remove, deletion)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    await f.desktop("ssh.hosts.configure", { ...jump.profile, name: "revised monitor jump", hostId: jump.hostId, expectedRevision: jump.revision, credentials: [] });
    expect(data(await invoke(cached, binding))).toBeNull();
    expect(samples).toBe(before);
    expect(jump.server.conns).toHaveLength(1);
    expect(target.server.conns).toHaveLength(1);
    await f.allow(cached, false);
    expect(await invoke(cached, binding)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await f.desktop(change, { ...binding, action: "stop" });
    expect(await invoke(remove, deletion)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    const fresh = await route();
    expect(data(await invoke(remove, { ...deletion, bindings: [{ hostId: target.hostId, routeRevision: fresh.routeRevision }], intentKey: randomUUID() }))).toEqual({ ok: true });
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s scopes forwarding reads and dormant configuration edits to current authorized routes", { timeout: 35_000 }, async (entry) => {
  const f = await fixture();
  const rules = "ssh.forwarding.rules.list";
  const runs = "ssh.forwarding.runs.list";
  const save = "ssh.forwarding.rules.save";
  const remove = "ssh.forwarding.rules.delete";
  const start = "ssh.forwarding.runs.start";
  try {
    const jump = await f.host("forwarding jump");
    const target = await f.host("forwarding host", [jump.hostId]);
    const reserve = createServer();
    const listening = once(reserve, "listening");
    reserve.listen(0, "127.0.0.1");
    await listening;
    const address = reserve.address();
    const closed = once(reserve, "close");
    reserve.close();
    await closed;
    if (!address || typeof address === "string") throw new Error("No loopback fixture port");
    const draft = {
      name: "loopback fixture",
      mode: "local",
      hostId: target.hostId,
      listenPort: address.port,
      target: { host: "127.0.0.1", port: 8080 },
      resume: false,
    };
    const rule = await f.desktop<ForwardRule>(save, draft);
    const spare = { name: "spare fixture", mode: "socks5", hostId: jump.hostId, listenPort: address.port, resume: false };
    const other = await f.desktop<ForwardRule>(save, spare);
    const revision = { id: rule.id, expectedRevision: rule.revision };
    const invoke = await externalTool(f, entry);
    for (const id of [rules, runs, save, remove]) {
      expect(await invoke(id, {})).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
      await f.allow(id);
    }
    await f.chooseHosts([target.hostId]);
    expect(data(await invoke(rules, {}))).toEqual([]);
    expect(data(await invoke(runs, {}))).toEqual([]);
    await f.chooseHosts([jump.hostId, target.hostId]);
    expect(data(await invoke(rules, {}))).toEqual([rule, other]);
    expect(data(await invoke(runs, {}))).toEqual([]);
    const route = (hostId: string) => f.desktop<ResourceHost>(hostGet, { hostId });
    const binding = (value: ResourceHost) => ({ hostId: value.hostId, routeRevision: value.routeRevision });
    const bindings = [binding(await route(jump.hostId))];
    const rename = { ...spare, name: "renamed fixture", previous: { id: other.id, expectedRevision: other.revision }, bindings, intentKey: randomUUID() };
    const stopped = { ...draft, name: "authorized rename", previous: revision, bindings: [binding(await route(target.hostId))], intentKey: randomUUID() };
    expect(await invoke(save, { ...spare, bindings, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await invoke(save, { ...stopped, target: { host: "127.0.0.1", port: 9090 } })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    const [renamed, duplicate] = await Promise.all([invoke(save, rename), invoke(save, rename)]);
    expect(renamed).toEqual(duplicate);
    const updated = z.object({ id: z.string(), revision: z.string() }).parse(data(renamed));
    expect(updated.id).toBe(other.id);
    expect(updated.revision).not.toBe(other.revision);
    const deleteIdle = { id: updated.id, expectedRevision: updated.revision, bindings, intentKey: randomUUID() };
    expect(data(await invoke(remove, deleteIdle))).toEqual({ ok: true });
    expect(data(await invoke(remove, deleteIdle))).toEqual({ ok: true });
    expect(await invoke(start, revision)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    expect(jump.server.conns).toHaveLength(0);
    expect(target.server.conns).toHaveLength(0);

    await f.desktop(start, revision);
    for (const hop of [0, 1]) {
      const prompt = await vi.waitFor(async () => {
        const current = (await f.desktop<ForwardRun[]>(runs))[0];
        const key = current?.prompt;
        if (key?.hop !== hop) throw new Error("Waiting for forwarding route trust");
        return key;
      });
      expect(data(await invoke(runs, {}))).toEqual([]);
      await f.desktop("ssh.hostKey.decide", { attemptId: prompt.attemptId, hop, promptId: prompt.promptId, accept: true, remember: false });
    }
    await vi.waitFor(async () => {
      const [run] = await f.desktop<ForwardRun[]>(runs);
      expect(run?.state).toBe("running");
    });
    expect(data(await invoke(runs, {}))).toEqual([]);
    expect(await invoke(save, { ...stopped, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(await invoke(remove, { ...revision, bindings: stopped.bindings, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    await f.desktop("ssh.hosts.configure", { ...jump.profile, name: "revised forwarding jump", hostId: jump.hostId, expectedRevision: jump.revision, credentials: [] });
    expect(data(await invoke(runs, {}))).toEqual([]);
    expect(data(await invoke(rules, {}))).toEqual([rule]);
    expect(jump.server.conns).toHaveLength(1);
    expect(target.server.conns).toHaveLength(1);
    await f.allow(runs, false);
    expect(await invoke(runs, {})).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await f.desktop(remove, revision);
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s owns fixed, dynamic and acknowledged remote forwards until host revocation", { timeout: 45_000 }, async (entry) => {
  const f = await fixture();
  const echo = createServer((sock) => sock.pipe(sock));
  try {
    echo.listen(0, "127.0.0.1");
    await once(echo, "listening");
    const address = echo.address();
    if (!address || typeof address === "string") throw new Error("Missing loopback fixture address");
    let acknowledgeRemote!: () => void;
    const remoteBind = new Promise<void>((resolve) => {
      acknowledgeRemote = resolve;
    });
    const { hostId } = await f.host("owned forwarding fixture", [], { remoteForwarding: true, waitRemoteBind: () => remoteBind });
    const spare = await f.host("other forwarding resource");
    const save = "ssh.forwarding.rules.save";
    const start = "ssh.forwarding.runs.start";
    const list = "ssh.forwarding.runs.list";
    const stop = "ssh.forwarding.runs.stop";
    const draft = { name: "fixed loopback", hostId, mode: "local", listenPort: address.port, target: { host: "127.0.0.1", port: address.port }, resume: false };
    const rule = await f.desktop<ForwardRule>(save, draft);
    const proxy = await f.desktop<ForwardRule>(save, { name: "dynamic proxy fixture", hostId, mode: "socks5", listenPort: address.port, resume: false });
    const http = await f.desktop<ForwardRule>(save, { name: "CONNECT proxy fixture", hostId, mode: "http-connect", listenPort: address.port, resume: false });
    const occupied = await f.desktop<ForwardRule>(save, { ...draft, name: "occupied remote fixture", mode: "remote" });
    const reserve = createServer();
    reserve.listen(0, "127.0.0.1");
    await once(reserve, "listening");
    const remotePort = (reserve.address() as { port: number }).port;
    const released = once(reserve, "close");
    reserve.close();
    await released;
    const reverse = await f.desktop<ForwardRule>(save, { ...draft, name: "remote fixture", mode: "remote", listenPort: remotePort });
    const invoke = await externalTool(f, entry);
    const peer = await externalTool(f, "mcp");
    const disabled = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
    const missing = { ok: false, error: { code: "NOT_FOUND" } };
    const denied = { ok: false, error: { code: "PERMISSION_DENIED" } };
    expect(await invoke(start, {})).toMatchObject(disabled);
    for (const tool of ["ssh.connect", probeGet, trustDecide, start, list, stop, save]) await f.allow(tool);
    const { routeRevision } = await f.desktop<ResourceHost>(hostGet, { hostId });
    const binding = { hostId, routeRevision };
    const { attemptId } = z.object({ attemptId: z.string() }).parse(data(await invoke("ssh.connect", { ...binding, intentKey: randomUUID() })));
    const status = async () => PublicProbeStatus.parse(data(await invoke(probeGet, { hostId, attemptId })));
    const pending = await vi.waitFor(async () => {
      const current = await status();
      if (current.state !== "waiting") throw new Error("Waiting for loopback trust");
      return current;
    });
    expect(await invoke(trustDecide, decision(pending))).toMatchObject({ ok: true });
    await vi.waitFor(async () => expect(await status()).toMatchObject({ state: "connected" }));
    const revision = { id: rule.id, expectedRevision: rule.revision };
    const begin = { ...revision, ...binding, attemptId, intentKey: randomUUID() };
    expect(await peer(start, begin)).toMatchObject(missing);
    const startRule = ({ id, revision }: ForwardRule) => invoke(start, { ...begin, id, expectedRevision: revision, intentKey: randomUUID() });
    const created = data(await invoke(start, begin)) as ForwardRun;
    expect(data(await invoke(start, begin))).toEqual(created);
    const listener = created.listener;
    expect(listener).toMatchObject({ device: "local", host: "127.0.0.1", port: expect.any(Number) });
    if (listener?.device !== "local") throw new Error("Expected a loopback listener");
    expect(listener.port).not.toBe(address.port);
    const socket = createConnection(listener.port, listener.host);
    try {
      await once(socket, "connect");
      const returned = once(socket, "data");
      socket.write("loopback fixture");
      expect((await returned)[0]).toEqual(Buffer.from("loopback fixture"));
    } finally {
      socket.destroy();
    }
    const started = [created.id];
    const listeners = [listener.port, remotePort];
    for (const dynamic of [proxy, http]) {
      const run = data(await startRule(dynamic)) as ForwardRun;
      started.push(run.id);
      const addr = run.listener;
      if (addr?.device !== "local") throw new Error("Expected a proxy on Engine loopback");
      expect(addr.host).toBe("127.0.0.1");
      expect(addr.port).not.toBe(dynamic.listenPort);
      listeners.push(addr.port);
      const proxySocket = createConnection(addr.port, addr.host);
      try {
        await once(proxySocket, "connect");
        if (dynamic.mode === "socks5") {
          const hello = once(proxySocket, "data");
          proxySocket.write(Buffer.from([5, 1, 0]));
          expect((await hello)[0]).toEqual(Buffer.from([5, 0]));
          const response = once(proxySocket, "data");
          proxySocket.write(Buffer.from([5, 1, 0, 1, 127, 0, 0, 1, address.port >>> 8, address.port & 255]));
          expect((await response)[0].subarray(0, 2)).toEqual(Buffer.from([5, 0]));
        } else {
          const response = once(proxySocket, "data");
          proxySocket.write(`CONNECT 127.0.0.1:${address.port} HTTP/1.1\r\nHost: 127.0.0.1:${address.port}\r\n\r\n`);
          expect((await response)[0].toString()).toContain("200 Connection Established");
        }
        const response = once(proxySocket, "data");
        proxySocket.write("owned proxy");
        expect((await response)[0]).toEqual(Buffer.from("owned proxy"));
      } finally {
        proxySocket.destroy();
      }
    }
    expect(await startRule(occupied)).toMatchObject({ ok: false, error: { code: "NAME_CONFLICT" } });
    const starting = startRule(reverse);
    try {
      await vi.waitFor(async () => expect((await f.desktop<ForwardRun[]>(list)).find(({ ruleId }) => ruleId === reverse.id)).toMatchObject({ state: "starting" }));
    } finally {
      acknowledgeRemote();
    }
    const reversed = data(await starting) as ForwardRun;
    expect(reversed.listener).toEqual({ device: "remote", requestedHost: "127.0.0.1", requestedPort: remotePort, binding: "server-policy-unknown" });
    started.push(reversed.id);
    const reverseSocket = createConnection(remotePort, "127.0.0.1");
    try {
      await once(reverseSocket, "connect");
      const response = once(reverseSocket, "data");
      reverseSocket.write("remote listener");
      expect((await response)[0]).toEqual(Buffer.from("remote listener"));
    } finally {
      reverseSocket.destroy();
    }
    expect(data(await peer(list, {}))).toEqual([]);
    const end = { ...revision, runId: created.id, intentKey: randomUUID() };
    expect(await peer(stop, end)).toMatchObject(missing);
    expect(await f.desktop(list)).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, source: "external" })]));
    expect(await invoke(save, { ...draft, name: "rename running rule", previous: revision, bindings: [binding], intentKey: randomUUID() })).toMatchObject(denied);
    await f.chooseHosts([spare.hostId]);
    expect(data(await invoke(list, {}))).toEqual([]);
    expect(await invoke(stop, end)).toMatchObject(denied);
    await vi.waitFor(async () => expect((await f.desktop<ForwardRun[]>(list)).filter(({ id }) => started.includes(id)).map(({ state }) => state)).toEqual(started.map(() => "stopped")));
    for (const port of listeners) {
      const after = createConnection(port, "127.0.0.1");
      try {
        const [error] = await once(after, "error", { signal: AbortSignal.timeout(1000) });
        expect(error).toMatchObject({ code: "ECONNREFUSED" });
      } finally {
        after.destroy();
      }
    }
    await f.allow(start, false);
    expect(await invoke(start, begin)).toMatchObject(disabled);
  } finally {
    try {
      for (const { id, revision } of await f.desktop<ForwardRule[]>("ssh.forwarding.rules.list")) {
        await f.desktop("ssh.forwarding.rules.delete", { id, expectedRevision: revision });
      }
    } finally {
      try {
        await f.close();
      } finally {
        if (echo.listening) await new Promise<void>((resolve, reject) => echo.close((error) => (error ? reject(error) : resolve())));
      }
    }
  }
});

test.each(["cli", "mcp"] as const)("%s manages workspace templates only within current bindings and preserves private login commands", { timeout: 35_000 }, async (entry) => {
  const f = await fixture();
  const list = "ssh.workspace.templates.list";
  const save = "ssh.workspace.templates.save";
  const remove = "ssh.workspace.templates.delete";
  const notExposed = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
  try {
    const jump = await f.host("template jump");
    const target = await f.host("template host", [jump.hostId]);
    const { hostId, routeRevision } = await f.desktop<ResourceHost>(hostGet, { hostId: target.hostId });
    const bindings = [{ hostId, routeRevision }];
    const draft = { name: "fixture layout", layout: { kind: "one" }, panes: [{ hostId }] };
    const command = "private-fixture-login";
    const original = await f.desktop<WorkspaceTemplate>(save, { ...draft, panes: [{ hostId, loginCommand: command }] });
    const input = { ...draft, name: "fixture renamed", previous: { id: original.id, expectedRevision: original.revision }, bindings, intentKey: randomUUID() };
    const invoke = await externalTool(f, entry);
    expect(await invoke(list, {})).toMatchObject(notExposed);
    expect(await invoke(save, input)).toMatchObject(notExposed);
    expect(await invoke(remove, input.previous)).toMatchObject(notExposed);
    for (const tool of [list, save, remove]) await f.allow(tool);
    await f.chooseHosts([hostId]);
    expect(data(await invoke(list, {}))).toEqual([]);
    expect(await invoke(save, input)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    await f.chooseHosts([hostId, jump.hostId]);
    expect(data(await invoke(list, {}))).toEqual([{ ...original, panes: [{ hostId, target: original.panes[0]!.target }] }]);
    expect(await invoke(save, { ...input, panes: [{ hostId, loginCommand: "untrusted fixture command" }] })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(await invoke(save, { ...input, bindings: [{ hostId, routeRevision: "0".repeat(64) }] })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    const [first, second] = await Promise.all([invoke(save, input), invoke(save, input)]);
    const saved = z.object({ id: z.string(), revision: z.string() }).parse(data(first));
    expect(saved.id).toBe(original.id);
    expect(saved.revision).not.toBe(original.revision);
    expect(second).toEqual(first);
    expect(await invoke(save, { ...input, name: "different intent payload" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
    const [updated] = await f.desktop<WorkspaceTemplate[]>(list);
    expect(updated).toEqual({ ...original, ...saved, name: input.name });
    const creation = { ...draft, bindings, intentKey: randomUUID() };
    const [create, replay] = await Promise.all([invoke(save, creation), invoke(save, creation)]);
    expect(replay).toEqual(create);
    const created = z.object({ id: z.string(), revision: z.string() }).parse(data(create));
    expect(created.id).not.toBe(saved.id);
    expect(data(await invoke(list, {}))).toHaveLength(2);
    expect(await invoke(remove, { ...input.previous, bindings, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    const deletion = { id: saved.id, expectedRevision: saved.revision, bindings, intentKey: randomUUID() };
    expect(data(await invoke(remove, deletion))).toEqual({ ok: true });
    expect(data(await invoke(remove, deletion))).toEqual({ ok: true });
    await f.chooseHosts([hostId]);
    expect(await invoke(remove, deletion)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(jump.server.conns).toHaveLength(0);
    expect(target.server.conns).toHaveLength(0);
    await f.allow(save, false);
    expect(await invoke(save, creation)).toMatchObject(notExposed);
  } finally {
    try {
      for (const { id, revision } of await f.desktop<WorkspaceTemplate[]>(list)) await f.desktop(remove, { id, expectedRevision: revision });
    } finally {
      await f.close();
    }
  }
});

test.each(["cli", "mcp"] as const)("%s owns a live connection and controls only its original attempt and trust prompt", { timeout: 35_000 }, async (entry) => {
  const f = await fixture();
  const connect = "ssh.connect";
  const disconnect = "ssh.disconnect";
  const decide = "ssh.hostKey.decide";
  const notExposed = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
  const notFound = { ok: false, error: { code: "NOT_FOUND" } };
  const invalid = { ok: false, error: { code: "INVALID_INPUT" } };
  try {
    const { hostId, server } = await f.host("verification host");
    const { routeRevision } = await f.desktop<ResourceHost>(hostGet, { hostId });
    const binding = { hostId, routeRevision };
    const invoke = await externalTool(f, entry);
    const { token } = await f.desktop<{ token: string }>("gateway.tokens.create", { name: "independent HTTP probe" });
    for (const capability of [connect, disconnect, decide]) {
      expect(await invoke(capability, {})).toMatchObject(notExposed);
      await f.allow(capability);
    }
    await f.allow(probeGet);
    const intent = { ...binding, intentKey: randomUUID() };
    expect(await invoke(connect, { ...intent, background: true })).toMatchObject(invalid);
    expect(await invoke(connect, binding)).toMatchObject(invalid);
    const [first, retry] = await Promise.all([invoke(connect, intent), invoke(connect, intent)]);
    expect(retry).toEqual(first);
    const addressed = (value: unknown) => ({ ...binding, ...z.object({ attemptId: z.string() }).parse(value) });
    const probe = addressed(data(first));
    const waitForProbe = (address: typeof probe, wanted: Probe["state"]) =>
      vi.waitFor(async () => {
        const result = PublicProbeStatus.parse(data(await invoke(probeGet, { hostId: address.hostId, attemptId: address.attemptId })));
        expect(result.state).toBe(wanted);
        return result;
      });
    const waiting = await waitForProbe(probe, "waiting");
    if (waiting.state !== "waiting") throw new Error("Missing fixture trust prompt");
    const answer = decision(waiting);
    expect(await invoke(decide, { ...answer, remember: true })).toMatchObject(invalid);
    expect(await invoke(decide, { ...answer, promptRevision: "0".repeat(64) })).toMatchObject(notFound);
    expect(await f.call(token, decide, answer)).toMatchObject(notFound);
    expect(await invoke(decide, answer)).toEqual({ ok: true, data: { applied: true } });
    expect(await invoke(decide, answer)).toMatchObject(notFound);
    await waitForProbe(probe, "connected");
    expect(server.closed()).toBe(0);
    expect(await f.desktop("ssh.connections.status")).toContainEqual({ state: "connected", hostId, attemptId: probe.attemptId, source: "external" });
    expect(await f.desktop("ssh.knownHosts.list")).toEqual([]);
    await f.desktop(disconnect, { hostId, attemptId: probe.attemptId });
    await waitForProbe(probe, "disconnected");
    await vi.waitFor(() => expect(server.closed()).toBe(1));
    expect(await invoke(connect, intent)).toEqual(first);
    const next = addressed(data(await invoke(connect, { ...intent, intentKey: randomUUID() })));
    await waitForProbe(next, "waiting");
    expect(await invoke(disconnect, { hostId })).toMatchObject(invalid);
    expect(await f.call(token, disconnect, next)).toMatchObject(notFound);
    expect(await invoke(disconnect, next)).toEqual({ ok: true, data: { ok: true } });
    expect(await invoke(disconnect, next)).toEqual({ ok: true, data: { ok: true } });
    await waitForProbe(next, "failed");
    await vi.waitFor(() => expect(server.closed()).toBe(2));
    expect(server.conns).toHaveLength(2);
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s answers only its original SSH keyboard-interactive challenge", { timeout: 30_000 }, async (entry) => {
  const f = await fixture();
  try {
    const answer = `synthetic-challenge-${randomUUID()}`;
    const { hostId, server } = await f.host("keyboard authentication fixture", [], { keyboardResponse: answer });
    const other = await f.host("unrelated authorized host");
    const invoke = await externalTool(f, entry);
    const peer = await externalTool(f, "mcp");
    const respond = "ssh.auth.keyboardInteractive.respond";
    const connect = "ssh.connect";
    const { routeRevision } = await f.desktop<ResourceHost>(hostGet, { hostId });
    const route = { hostId, routeRevision };
    const denied = { ok: false, error: { code: "PERMISSION_DENIED" } };
    const missing = { ok: false, error: { code: "NOT_FOUND" } };
    const closed = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
    for (const tool of [connect, probeGet, trustDecide]) await f.allow(tool);
    async function challenge() {
      const { attemptId } = z.object({ attemptId: z.string() }).parse(data(await invoke(connect, { ...route, intentKey: randomUUID() })));
      const status = async () => PublicProbeStatus.parse(data(await invoke(probeGet, { hostId, attemptId })));
      const key = await vi.waitFor(async () => {
        const value = await status();
        if (value.state !== "waiting") throw new Error("Waiting for fixture key");
        return value;
      });
      expect(await invoke(trustDecide, decision(key))).toMatchObject({ ok: true });
      const pending = await vi.waitFor(async () => {
        const value = await status();
        if (value.state !== "keyboard") throw new Error("Waiting for fixture challenge");
        return value;
      });
      expect(pending.keyboard.prompts).toEqual([{ label: "Fixture response", echo: false }]);
      const { promptId, promptRevision, hop, serverHostId } = pending.keyboard;
      return { status, input: { ...route, attemptId, promptId, promptRevision, hop, serverHostId, responses: [answer] } };
    }
    const first = await challenge();
    expect(await invoke(respond, first.input)).toMatchObject(closed);
    await f.allow(respond);
    expect(await peer(respond, first.input)).toMatchObject(missing);
    expect(await invoke(respond, { ...first.input, promptRevision: "0".repeat(64) })).toMatchObject(missing);
    expect(await invoke(respond, first.input)).toEqual({ ok: true, data: { applied: true } });
    expect(await invoke(respond, first.input)).toMatchObject(missing);
    await vi.waitFor(async () => expect(await first.status()).toMatchObject({ state: "connected" }));
    const next = await challenge();
    await f.chooseHosts([other.hostId]);
    expect(await invoke(respond, next.input)).toMatchObject(denied);
    await vi.waitFor(() => expect(server.closed()).toBe(2));
    expect(await readFile(path.join(f.engine.vault.runtimeDir, "ssh-exec-intents.ndjson"), "utf8")).not.toContain(answer);
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s isolates SSH terminal I/O and closes the PTY when a jump loses authorization", { timeout: 35_000 }, async (entry) => {
  const f = await fixture();
  const input: string[] = [];
  let closed = 0;
  try {
    const jump = await f.host("shell jump fixture");
    const target = await f.host("shell target fixture", [jump.hostId], { onShellInput: (text) => input.push(text), onShellClose: () => closed++ });
    const { hostId } = target;
    const { routeRevision } = await f.desktop<ResourceHost>(hostGet, { hostId });
    const invokeA = await externalTool(f, entry);
    const invokeB = await externalTool(f, "mcp");
    const connect = "ssh.connect";
    const open = "ssh.shells.open";
    const list = "ssh.shells.list";
    const read = "ssh.shells.read";
    const write = "ssh.shells.write";
    const resize = "ssh.shells.resize";
    const close = "ssh.shells.close";
    const startWorkspace = "ssh.workspace.runs.start";
    const listWorkspaces = "ssh.workspace.runs.list";
    const closeWorkspace = "ssh.workspace.runs.close";
    const reconnectWorkspace = "ssh.workspace.runs.reconnect";
    const saveWorkspace = "ssh.workspace.runs.saveTemplate";
    const disabled = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
    const missing = { ok: false, error: { code: "NOT_FOUND" } };
    const denied = { ok: false, error: { code: "PERMISSION_DENIED" } };
    const binding = { hostId, routeRevision };
    expect(await invokeA(open, binding)).toMatchObject(disabled);
    for (const capability of [connect, open, list, read, write, resize, close, probeGet, trustDecide, startWorkspace, listWorkspaces, closeWorkspace, reconnectWorkspace, saveWorkspace]) await f.allow(capability);
    const { attemptId } = z.object({ attemptId: z.string() }).parse(data(await invokeA(connect, { ...binding, intentKey: randomUUID() })));
    const status = async () => PublicProbeStatus.parse(data(await invokeA(probeGet, { hostId, attemptId })));
    for (const hop of [0, 1]) {
      const pending = await vi.waitFor(
        async () => {
          const result = await status();
          if (result.state !== "waiting" || result.prompt.hop !== hop) throw new Error("Waiting for loopback trust");
          return result;
        },
        { timeout: 5000 },
      );
      expect(await invokeA(trustDecide, decision(pending))).toMatchObject({ ok: true });
    }
    await vi.waitFor(async () => expect(await status()).toMatchObject({ state: "connected" }));
    const intent = { ...binding, attemptId, intentKey: randomUUID() };
    expect(await invokeB(open, intent)).toMatchObject(missing);
    const first = await invokeA(open, intent);
    expect(await invokeA(open, intent)).toEqual(first);
    const { shellId } = z.object({ shellId: z.string() }).parse(data(first));
    expect(await f.desktop(list, { hostId })).toMatchObject([{ id: shellId, source: "external", state: "running" }]);
    expect(data(await invokeB(list, { hostId }))).toEqual([]);
    expect(await invokeB(read, { shellId })).toMatchObject(missing);
    expect(await invokeB(close, { shellId, intentKey: randomUUID() })).toMatchObject(missing);
    expect(await invokeA(resize, { shellId, cols: 100, rows: 40, intentKey: randomUUID() })).toEqual({ ok: true, data: { resized: true } });
    const banner = data(await invokeA(read, { shellId, waitMs: 1000 })) as OutputPage;
    expect(banner).toMatchObject({ text: "welcome\n", nextCursor: 8 });
    const content = "fixture-private-terminal-data";
    const send = { shellId, dataBase64: Buffer.from(content).toString("base64"), intentKey: randomUUID() };
    expect(await invokeA(write, send)).toMatchObject({ ok: true, data: { bytes: content.length } });
    expect(await invokeA(write, send)).toMatchObject({ ok: true, data: { bytes: content.length } });
    expect(await invokeA(write, { ...send, dataBase64: "YQ==" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
    expect(data(await invokeA(read, { shellId, cursor: banner.nextCursor, waitMs: 1000 }))).toMatchObject({ text: `ECHO:${content}`, ended: false });
    expect(input).toEqual([content]);
    const workspace = { name: "owned fixture workspace", layout: { kind: "one" }, connections: [{ ...binding, attemptId }], intentKey: randomUUID() };
    const started = await invokeA(startWorkspace, workspace);
    const run = z.object({ id: z.uuid(), generation: z.literal(1) }).parse(data(started));
    expect(await invokeA(startWorkspace, workspace)).toEqual(started);
    expect(data(await invokeB(listWorkspaces, {}))).toEqual([]);
    expect(await invokeB(closeWorkspace, { ...run, intentKey: randomUUID() })).toMatchObject(missing);
    expect(await f.desktop(listWorkspaces)).toMatchObject([{ ...run, source: "external" }]);
    const template = z.object({ id: z.uuid(), revision: z.uuid() }).parse(data(await invokeA(saveWorkspace, { ...run, name: "owned runtime template", intentKey: randomUUID() })));
    await f.desktop("ssh.workspace.templates.delete", { id: template.id, expectedRevision: template.revision });
    const reconnect = { ...run, connections: workspace.connections, intentKey: randomUUID() };
    expect(await invokeA(reconnectWorkspace, reconnect)).toMatchObject({ ok: true, data: { generation: 2 } });
    expect(await invokeA(reconnectWorkspace, reconnect)).toMatchObject({ ok: true, data: { generation: 2 } });
    expect(await invokeA(closeWorkspace, { ...run, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    const receipts = await readFile(path.join(f.engine.vault.runtimeDir, "ssh-host-intents.ndjson"), "utf8");
    for (const secret of [content, send.dataBase64, send.intentKey, target.password, "welcome"]) expect(receipts).not.toContain(secret);
    await f.chooseHosts([hostId]);
    await vi.waitFor(() => expect(closed).toBe(3), { timeout: 5000 });
    expect(await invokeA(write, send)).toMatchObject(denied);
    expect(await invokeA(read, { shellId })).toMatchObject(denied);
    expect(data(await invokeA(list, { hostId }))).toEqual([]);
    expect(data(await invokeA(listWorkspaces, {}))).toEqual([]);
    await f.chooseHosts([hostId, jump.hostId]);
    expect(await invokeA(write, send)).toMatchObject(denied);
    expect(await invokeA(read, { shellId })).toMatchObject(denied);
    expect(input).toEqual([content]);
    await f.allow(open, false);
    expect(await invokeA(open, intent)).toMatchObject(disabled);
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s changes only the owned SSH workspace layout with current bindings and a stable intent", { timeout: 35_000 }, async (entry) => {
  const f = await fixture();
  let closedLeft = 0;
  let closedRight = 0;
  try {
    const left = await f.host("layout left", [], { onShellClose: () => closedLeft++ });
    const right = await f.host("layout right", [], { onShellClose: () => closedRight++ });
    const invoke = await externalTool(f, entry);
    const peer = await externalTool(f, "mcp");
    const change = "ssh.workspace.runs.changeLayout";
    const start = "ssh.workspace.runs.start";
    const list = "ssh.workspace.runs.list";
    const connections = [await connectOwned(f, invoke, left.hostId), await connectOwned(f, invoke, right.hostId)];
    for (const capability of [start, list]) await f.allow(capability);
    const initial = WorkspaceRun.parse(data(await invoke(start, { name: "layout fixture", layout: { kind: "two" }, connections, intentKey: randomUUID() })));
    const [a, b] = initial.panes;
    const input = {
      id: initial.id,
      generation: initial.generation,
      expectedLayoutRevision: initial.layoutRevision ?? initial.id,
      change: { action: "layout", layout: { kind: "main-bottom" }, paneIds: [b!.paneId, a!.paneId] },
      intentKey: randomUUID(),
    };
    const disabled = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
    const stale = { ok: false, error: { code: "VERSION_CONFLICT" } };
    expect(await invoke(change, input)).toMatchObject(disabled);
    await f.allow(change);
    expect(await peer(change, input)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await invoke(change, { ...input, generation: initial.generation + 1, intentKey: randomUUID() })).toMatchObject(stale);
    const result = await invoke(change, input);
    const updated = WorkspaceRun.parse(data(result));
    expect(updated).toMatchObject({ id: initial.id, generation: initial.generation, panes: [b, a], layout: { kind: "main-bottom" } });
    expect(updated.layoutRevision).toBeDefined();
    expect(updated.layoutRevision).not.toBe(input.expectedLayoutRevision);
    expect(await invoke(change, input)).toEqual(result);
    expect(await invoke(change, { ...input, change: { ...input.change, paneIds: [a!.paneId, b!.paneId] } })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
    expect(await invoke(change, { ...input, intentKey: randomUUID() })).toMatchObject(stale);
    expect([closedLeft, closedRight]).toEqual([0, 0]);

    const close = { ...input, expectedLayoutRevision: updated.layoutRevision!, change: { action: "close", paneId: b!.paneId }, intentKey: randomUUID() };
    const remaining = WorkspaceRun.parse(data(await invoke(change, close)));
    expect(remaining.panes).toEqual([a]);
    await vi.waitFor(() => expect(closedRight).toBe(1));
    expect(await invoke(change, input)).toEqual(result);
    expect(data(await invoke(change, close))).toEqual(remaining);
    expect(data(await invoke(list, {}))).toEqual([remaining]);
    expect([closedLeft, closedRight]).toEqual([0, 1]);
    await f.chooseHosts([left.hostId]);
    expect(data(await invoke(list, {}))).toEqual([remaining]);
    expect(closedLeft).toBe(0);
    expect(await invoke(change, input)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(await invoke(change, close)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    await f.allow(change, false);
    expect(await invoke(change, close)).toMatchObject(disabled);
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s binds byte transfers to owned SFTP sessions and rejects every Engine local path", { timeout: 35_000 }, async (entry) => {
  const f = await fixture();
  const readFileBegan = latch();
  const releaseRead = latch();
  const heldPath = "/home/test/held.bin";
  try {
    const { hostId, server, password } = await f.host("owned SFTP fixture", [], {
      waitReadFile: (path) => {
        if (path !== heldPath) return;
        readFileBegan.resolve();
        return releaseRead.promise;
      },
    });
    const other = await f.host("other selected resource");
    const { routeRevision } = await f.desktop<ResourceHost>(hostGet, { hostId });
    const invoke = await externalTool(f, entry);
    const peer = await externalTool(f, "mcp");
    const open = "ssh.fileSessions.open";
    const list = "ssh.fileSessions.list";
    const close = "ssh.fileSessions.close";
    const upload = "ssh.sftp.upload";
    const download = "ssh.sftp.download";
    const cancel = "ssh.sftp.cancel";
    const properties = "ssh.fileSessions.properties";
    const openDocument = "ssh.fileSessions.document.open";
    const saveDocument = "ssh.fileSessions.document.save";
    const createEntry = "ssh.fileSessions.createEntry";
    const changeProperties = "ssh.fileSessions.changeProperties";
    const moveEntry = "ssh.fileSessions.moveEntry";
    const search = "ssh.fileSessions.search";
    const searchCancel = "ssh.fileSessions.cancelSearch";
    const denied = { ok: false, error: { code: "PERMISSION_DENIED" } };
    const missing = { ok: false, error: { code: "NOT_FOUND" } };
    const invalid = { ok: false, error: { code: "INVALID_INPUT" } };
    const notExposed = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
    expect(await invoke(open, {})).toMatchObject(notExposed);
    for (const tool of ["ssh.connect", probeGet, trustDecide, open, list, close, upload, download, cancel, properties, openDocument, saveDocument, createEntry, changeProperties, moveEntry, search, searchCancel, "ssh.sftp.list"])
      await f.allow(tool);
    const bind = { hostId, routeRevision, intentKey: randomUUID() };
    const { attemptId } = z.object({ attemptId: z.string() }).parse(data(await invoke("ssh.connect", bind)));
    const status = async () => PublicProbeStatus.parse(data(await invoke(probeGet, { hostId, attemptId })));
    const pending = await vi.waitFor(async () => {
      const result = await status();
      if (result.state !== "waiting") throw new Error("Waiting for loopback trust");
      return result;
    });
    expect(await invoke(trustDecide, decision(pending))).toMatchObject({ ok: true });
    await vi.waitFor(async () => expect(await status()).toMatchObject({ state: "connected" }));
    const openIntent = { ...bind, attemptId, intentKey: randomUUID() };
    const opened = await invoke(open, openIntent);
    expect(await invoke(open, openIntent)).toEqual(opened);
    expect(await peer(open, openIntent)).toMatchObject(missing);
    const { fileSessionId } = z.object({ fileSessionId: z.uuid() }).parse(data(opened));
    expect(data(await peer(list, {}))).toEqual([]);
    expect(await f.desktop(list)).toMatchObject([{ fileSessionId, source: "external" }]);
    expect(await peer(close, { fileSessionId, intentKey: randomUUID() })).toMatchObject(missing);
    const remotePath = "/home/test/binary.dat";
    for (const capability of [upload, download]) {
      expect(await invoke(capability, { fileSessionId, remotePath, localPath: "/fixture/engine-local" })).toMatchObject(invalid);
    }
    expect(await invoke("ssh.fileSessions.localList", { fileSessionId, root: "/fixture/engine-local", parts: [] })).toMatchObject(notExposed);
    const bytes = Buffer.concat([Buffer.from([0, 255]), Buffer.from("fixture-remote-data")]);
    const uploadIntent = { fileSessionId, remotePath, dataBase64: bytes.toString("base64"), transferId: randomUUID(), intentKey: randomUUID() };
    expect(await peer(upload, uploadIntent)).toMatchObject(missing);
    const sent = await invoke(upload, uploadIntent);
    expect(sent).toEqual({ ok: true, data: { size: bytes.length } });
    expect(await invoke(upload, uploadIntent)).toEqual(sent);
    expect(await invoke(upload, { ...uploadIntent, dataBase64: "YQ==" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
    expect(server.fs.files.get(remotePath)).toEqual(bytes);
    const downloaded = (offset: number, limit: number) => invoke(download, { fileSessionId, remotePath, offset, limit, transferId: randomUUID() });
    expect(await downloaded(0, 2)).toEqual({ ok: true, data: { dataBase64: "AP8=", size: 2, nextOffset: 2, eof: false } });
    expect(await downloaded(2, bytes.length)).toEqual({ ok: true, data: { dataBase64: bytes.subarray(2).toString("base64"), size: bytes.length - 2, nextOffset: bytes.length, eof: true } });
    expect(await invoke(properties, { fileSessionId, path: remotePath })).toMatchObject({ ok: true, data: { size: bytes.length, revision: expect.any(String) } });
    const doc = { fileSessionId, path: "/home/test/document.txt" };
    expect(await invoke(createEntry, { ...doc, entry: { kind: "file" }, intentKey: randomUUID() })).toMatchObject({ ok: true });
    const version = z.object({ version: z.string() }).parse(data(await invoke(openDocument, doc))).version;
    const edited = { ...doc, expectedVersion: version, text: "fixture-edit-body", intentKey: randomUUID() };
    expect(await peer(saveDocument, edited)).toMatchObject(missing);
    const saved = await invoke(saveDocument, edited);
    expect(saved).toMatchObject({ ok: true, data: { version: expect.any(String) } });
    expect(await invoke(saveDocument, edited)).toEqual(saved);
    expect(await invoke(saveDocument, { ...edited, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    const expectedRevision = z.object({ revision: z.string() }).parse(data(await invoke(properties, doc))).revision;
    const changed = await invoke(changeProperties, { ...doc, expectedRevision, change: { mode: "640" }, intentKey: randomUUID() });
    const acknowledged = z.object({ revision: z.string(), mode: z.literal("640") }).parse(data(changed));
    const destination = "/home/test/moved.txt";
    expect(await invoke(moveEntry, { ...doc, destination, expectedRevision: acknowledged.revision, intentKey: randomUUID() })).toMatchObject({ ok: true });
    expect(server.fs.files.get(destination)?.toString()).toBe(edited.text);
    const query = { fileSessionId, path: "/home/test", query: "moved.txt", searchId: randomUUID() };
    expect(await peer(search, query)).toMatchObject(missing);
    expect(await invoke(search, query)).toMatchObject({ ok: true, data: { hits: [{ entry: { name: "moved.txt" } }] } });
    expect(await invoke(searchCancel, { fileSessionId, searchId: query.searchId, intentKey: randomUUID() })).toEqual({ ok: true, data: { cancelled: false } });
    const receipts = await readFile(path.join(f.engine.vault.runtimeDir, "ssh-host-intents.ndjson"), "utf8");
    for (const secret of [password, "fixture-remote-data", uploadIntent.dataBase64, uploadIntent.intentKey, edited.text]) expect(receipts).not.toContain(secret);

    server.fs.files.set(heldPath, Buffer.from("withhold pending result"));
    const transferId = randomUUID();
    const pendingDownload = invoke(download, { fileSessionId, remotePath: heldPath, transferId });
    await readFileBegan.promise;
    expect(await peer(cancel, { fileSessionId, transferId, intentKey: randomUUID() })).toMatchObject(missing);
    const cancellation = { fileSessionId, transferId, intentKey: randomUUID() };
    expect(await invoke(cancel, cancellation)).toEqual({ ok: true, data: { cancelled: true } });
    expect(await invoke(cancel, cancellation)).toEqual({ ok: true, data: { cancelled: true } });
    expect(await pendingDownload).toMatchObject({ ok: false });
    releaseRead.resolve();
    await f.chooseHosts([other.hostId]);
    await vi.waitFor(() => expect(server.closed()).toBe(1));
    expect(await downloaded(0, 1)).toMatchObject(denied);
    expect(await invoke(upload, uploadIntent)).toMatchObject(denied);
    expect(await f.desktop(list)).toEqual([]);
    await f.allow(upload, false);
    expect(await invoke(upload, uploadIntent)).toMatchObject(notExposed);
  } finally {
    releaseRead.resolve();
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s owns the remote transfer queue and consumes only the original conflict decision", { timeout: 35_000 }, async (entry) => {
  const f = await fixture();
  try {
    const source = await f.host("transfer source fixture");
    const target = await f.host("transfer target fixture");
    const sourcePath = "/home/test/source.txt";
    const targetPath = "/home/test/target.txt";
    const content = "fixture source bytes";
    source.server.fs.files.set(sourcePath, Buffer.from(content));
    target.server.fs.files.set(targetPath, Buffer.from("original destination"));
    const invoke = await externalTool(f, entry);
    const peer = await externalTool(f, "mcp");
    const start = "ssh.transfers.start";
    const list = "ssh.transfers.list";
    const decide = "ssh.transfers.decide";
    const cancel = "ssh.transfers.cancel";
    const disabled = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
    const missing = { ok: false, error: { code: "NOT_FOUND" } };
    expect(await invoke(start, {})).toMatchObject(disabled);
    for (const cap of ["ssh.connect", probeGet, trustDecide, "ssh.fileSessions.open", start, list, decide, cancel]) await f.allow(cap);
    async function openFiles(hostId: string) {
      const { routeRevision } = await f.desktop<ResourceHost>(hostGet, { hostId });
      const binding = { hostId, routeRevision };
      const { attemptId } = z.object({ attemptId: z.string() }).parse(data(await invoke("ssh.connect", { ...binding, intentKey: randomUUID() })));
      const status = async () => PublicProbeStatus.parse(data(await invoke(probeGet, { hostId, attemptId })));
      const pending = await vi.waitFor(async () => {
        const result = await status();
        if (result.state !== "waiting") throw new Error("Waiting for loopback trust");
        return result;
      });
      expect(await invoke(trustDecide, decision(pending))).toMatchObject({ ok: true });
      await vi.waitFor(async () => expect(await status()).toMatchObject({ state: "connected" }));
      return z.object({ fileSessionId: z.uuid() }).parse(data(await invoke("ssh.fileSessions.open", { ...binding, attemptId, intentKey: randomUUID() }))).fileSessionId;
    }
    const [sourceId, targetId] = await Promise.all([openFiles(source.hostId), openFiles(target.hostId)]);
    const request = {
      source: { kind: "remote", fileSessionId: sourceId, path: sourcePath },
      target: { kind: "remote", fileSessionId: targetId, path: targetPath },
      intentKey: randomUUID(),
    };
    expect(await invoke(start, { ...request, source: { kind: "local", path: "/fixture/engine" } })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await peer(start, request)).toMatchObject(missing);
    const job = data(await invoke(start, request)) as TransferJob;
    expect(data(await invoke(start, request))).toMatchObject({ transferId: job.transferId });
    const waitForState = (transferId: string, state: TransferJob["state"]) =>
      vi.waitFor(
        async () => {
          const queue = data(await invoke(list, {})) as TransferQueue;
          const found = queue.jobs.find((entry) => entry.transferId === transferId);
          expect(found).toMatchObject({ transferId, state });
          return found!;
        },
        { timeout: 5000 },
      );
    const waiting = await waitForState(job.transferId, "waiting");
    expect(waiting.conflictRevision).toBeTruthy();
    expect(data(await peer(list, {}))).toMatchObject({ jobs: [], batches: [] });
    expect(await peer(cancel, { transferId: job.transferId, intentKey: randomUUID() })).toMatchObject(missing);
    expect(await f.desktop(list)).toMatchObject({ jobs: [{ transferId: job.transferId, source: { session: { source: "external" } } }] });
    const accept = { transferId: job.transferId, choice: "replace", conflictRevision: waiting.conflictRevision, intentKey: randomUUID() };
    expect(await peer(decide, accept)).toMatchObject(missing);
    expect(await invoke(decide, { ...accept, conflictRevision: randomUUID(), intentKey: randomUUID() })).toMatchObject(missing);
    expect(await invoke(decide, accept)).toMatchObject({ ok: true });
    await waitForState(job.transferId, "completed");
    expect(await invoke(decide, accept)).toMatchObject({ ok: true, data: { transferId: job.transferId, state: "completed" } });
    expect(target.server.fs.files.get(targetPath)?.toString()).toBe(content);

    const second = data(await invoke(start, { ...request, intentKey: randomUUID() })) as TransferJob;
    await waitForState(second.transferId, "waiting");
    await f.chooseHosts([target.hostId]);
    expect(data(await invoke(list, {}))).toMatchObject({ jobs: [], batches: [] });
    expect(await invoke(cancel, { transferId: second.transferId, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    await vi.waitFor(async () => expect(await f.desktop(list)).toMatchObject({ jobs: expect.arrayContaining([expect.objectContaining({ transferId: second.transferId, state: "cancelled" })]) }));
    expect(target.server.fs.files.get(targetPath)?.toString()).toBe(content);
    expect(await readFile(path.join(f.engine.vault.runtimeDir, "ssh-host-intents.ndjson"), "utf8")).not.toContain(content);
    await f.allow(start, false);
    expect(await invoke(start, request)).toMatchObject(disabled);
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s previews inline SSH import bytes against only authorized routes and binds the preview to its subject", { timeout: 35_000 }, async (entry) => {
  const f = await fixture();
  const preview = "ssh.hosts.import.preview";
  const confirm = "ssh.hosts.import.confirm";
  try {
    const jump = await f.host("import jump");
    const selected = await f.host("import selected", [jump.hostId]);
    const hidden = await f.host("import hidden");
    const invoke = await externalTool(f, entry);
    const holder = await f.desktop<{ token: string }>("gateway.tokens.create", { name: "independent import preview" });
    const source = {
      format: "openssh",
      filename: "/synthetic/import/config",
      contentBase64: Buffer.from(
        `Host fixture-selected\n HostName 127.0.0.1\n Port ${selected.server.port}\n User fixture-login\n IdentityFile /fixture-private-key-path\nHost fixture-hidden\n HostName 127.0.0.1\n Port ${hidden.server.port}\n User fixture-login\n`,
      ).toString("base64"),
    };
    expect(await invoke(preview, source)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await f.allow(preview);
    await f.chooseHosts([selected.hostId]);
    const parse = (value: unknown) =>
      z
        .object({ token: z.string(), rows: z.array(z.object({ state: z.string() })) })
        .passthrough()
        .parse(value);
    const incomplete = parse(data(await invoke(preview, source)));
    expect(incomplete.rows.map(({ state }) => state)).toEqual(["ready", "ready"]);
    await f.chooseHosts([selected.hostId, jump.hostId]);
    const checks = [vi.spyOn(ModuleCredentials.prototype, "list"), vi.spyOn(ModuleCredentials.prototype, "use")];
    try {
      const exposed = data(await invoke(preview, source));
      expect(exposed).toMatchObject({
        filename: "config",
        token: expect.stringMatching(/^[a-f0-9]{64}$/),
        rows: [{ state: "conflict", conflicts: [{ kind: "existing", hostId: selected.hostId, field: "endpoint" }], issues: [{ code: "credential-reconfigure" }] }, { state: "ready" }],
      });
      const { token } = parse(exposed);
      expect(JSON.stringify(exposed)).not.toContain("fixture-private-key-path");
      expect(token).not.toBe(incomplete.token);
      expect(data(await invoke(preview, source))).toEqual(exposed);
      expect(parse(data(await f.call(holder.token, preview, source))).token).not.toBe(token);
      expect(await invoke(confirm, { source, token, selected: [{ index: 2 }] })).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
      for (const check of checks) expect(check).not.toHaveBeenCalled();
    } finally {
      for (const check of checks) check.mockRestore();
    }
    expect(jump.server.conns).toHaveLength(0);
    expect(selected.server.conns).toHaveLength(0);
    expect(hidden.server.conns).toHaveLength(0);
    await f.allow(preview, false);
    expect(await invoke(preview, source)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  } finally {
    await f.close();
  }
});

test("changed SSH keys stay blocked for an external subject with trust decision enabled", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const auth: string[] = [];
  try {
    const old = await f.host("changed-key fixture");
    const { hostId } = old;
    for (const capability of [probeStart, probeGet, trustDecide]) await f.allow(capability);
    await f.desktop("ssh.connect", { hostId, background: true });
    const prompt = await vi.waitFor(async () => {
      const [status] = await f.desktop<ConnectionStatus[]>("ssh.connections.status");
      if (status?.state !== "waiting") throw new Error("Waiting for desktop trust");
      return status.prompt;
    });
    const { attemptId, hop, promptId } = prompt;
    expect(await f.desktop("ssh.hostKey.decide", { attemptId, hop, promptId, accept: true, remember: true })).toEqual({ applied: true });
    await vi.waitFor(async () => expect(await f.desktop("ssh.connections.status")).toMatchObject([{ state: "connected" }]));
    await old.server.close();
    const changed = await f.server({ port: old.server.port, password: old.password, onAuth: (_user, method) => auth.push(method) });
    const { cliToken } = f.engine;
    const next = await beginProbe(f, cliToken, hostId);
    const mismatch = await awaitPrompt(f, cliToken, { hostId, attemptId: next.attemptId }, "key-changed");
    expect(mismatch.prompt.fingerprint).toBe(changed.fingerprint);
    expect(await f.call(cliToken, trustDecide, decision(mismatch))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(auth).not.toContain("password");
    expect(await f.desktop("ssh.knownHosts.list")).toMatchObject([{ fingerprint: old.server.fingerprint }]);
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s removes only the exact saved SSH fingerprint on its authorized route", { timeout: 35_000 }, async (entry) => {
  const f = await fixture();
  try {
    const first = await f.host("trusted SSH fixture");
    const unrelated = await f.host("independent SSH fixture");
    for (const hostId of [first.hostId, unrelated.hostId]) {
      await f.desktop("ssh.connect", { hostId, background: true });
      const prompt = await vi.waitFor(async () => {
        const status = (await f.desktop<ConnectionStatus[]>("ssh.connections.status")).find((item) => item.hostId === hostId);
        if (status?.state !== "waiting") throw new Error("Waiting for loopback trust");
        return status.prompt;
      });
      await f.desktop("ssh.hostKey.decide", { attemptId: prompt.attemptId, hop: prompt.hop, promptId: prompt.promptId, accept: true, remember: true });
      await vi.waitFor(async () => expect(await f.desktop("ssh.knownHosts.list")).toEqual(expect.arrayContaining([expect.objectContaining({ port: prompt.server.port })])));
    }
    const invoke = await externalTool(f, entry);
    const forget = "ssh.knownHosts.forget";
    const { routeRevision } = await f.desktop<ResourceHost>(hostGet, { hostId: first.hostId });
    const keys = await f.desktop<{ port: number; fingerprint: string }[]>("ssh.knownHosts.list");
    const current = keys.find(({ port }) => port === first.server.port)!;
    const other = keys.find(({ port }) => port === unrelated.server.port)!;
    const binding = { hostId: first.hostId, routeRevision };
    const request = { ...current, ...binding, intentKey: randomUUID() };
    expect(await invoke(forget, request)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await f.allow(forget);
    expect(await invoke(forget, { ...other, ...binding, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await invoke(forget, { ...request, fingerprint: other.fingerprint, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await invoke(forget, request)).toEqual({ ok: true, data: { ok: true } });
    expect(await invoke(forget, request)).toEqual({ ok: true, data: { ok: true } });
    expect(await f.desktop("ssh.knownHosts.list")).toEqual([other]);
    await f.chooseHosts([unrelated.hostId]);
    expect(await invoke(forget, request)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  } finally {
    await f.close();
  }
});

type Fixture = Awaited<ReturnType<typeof fixture>>;
type JobBinding = { hostId: string; routeRevision: string; jobId: string; sessionId: string };

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function allowJobs(f: Fixture) {
  for (const name of [...jobCapabilities, probeGet, trustDecide]) await f.allow(name);
}

async function readJob(f: Fixture, token: string, { jobId }: { jobId: string }) {
  return data(await f.call<JobStatus>(token, jobGet, { jobId }));
}

async function waitForJob(f: Fixture, token: string, job: { jobId: string }, state: JobStatus["state"]) {
  return vi.waitFor(
    async () => {
      const current = await readJob(f, token, job);
      expect(current.state).toBe(state);
      return current;
    },
    { timeout: 9000 },
  );
}

async function trustedJob(
  f: Fixture,
  token: string,
  hostId: string,
  jobId: string,
  trust = async (input: ReturnType<typeof decision>) => {
    expect(data(await f.call(token, trustDecide, input))).toEqual({ applied: true });
  },
): Promise<JobBinding> {
  const { attemptId } = await vi.waitFor(async () => {
    const current = await readJob(f, token, { jobId });
    if (!("attemptId" in current) || !current.attemptId) throw new Error("The job has no SSH attempt");
    return { attemptId: current.attemptId };
  });
  const prompt = await awaitPrompt(f, token, { hostId, attemptId });
  await trust(decision(prompt));
  const ready = await waitForJob(f, token, { jobId }, "ready");
  if (!("sessionId" in ready) || !ready.sessionId) throw new Error("The ready job has no session");
  return { hostId, jobId, routeRevision: ready.routeRevision, sessionId: ready.sessionId };
}

test("CLI owns a separate SSH job, reads split UTF-8 with byte cursors and retains a bounded tail", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const secondChunk = latch();
  const tail = latch();
  const command = "fixture-output";
  const executed: string[] = [];
  try {
    const { hostId, server, password } = await f.host("UTF-8 fixture", [], {
      onExecRequest: (received) => {
        executed.push(received);
        return undefined;
      },
      onInteractiveExec: (received, channel) => {
        if (received !== command) return false;
        const bytes = Buffer.from("A中文🙂");
        channel.write(bytes.subarray(0, 2));
        void secondChunk.promise.then(async () => {
          channel.write(bytes.subarray(2));
          channel.stderr.write("错误");
          await tail.promise;
          channel.write("界".repeat(25_000));
          channel.exit(7);
          channel.end();
        });
        return true;
      },
    });
    const { cliToken } = f.engine;
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    const prepare = { hostId, routeRevision, command, intentKey: randomUUID() };
    const catalog = await f.desktop<Array<{ name: string; selected: boolean }>>("capabilities.list", { includeInactive: true });
    expect(catalog.filter(({ name }) => jobCapabilities.includes(name))).toHaveLength(5);
    expect(catalog.filter(({ name }) => jobCapabilities.includes(name)).every(({ selected }) => !selected)).toBe(true);
    expect(await f.cli(jobPrepare, prepare)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await allowJobs(f);
    expect(await f.cli(jobGet, { jobId: randomUUID() })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(server.conns).toHaveLength(0);

    await f.allow(probeStart);
    const probe = await beginProbe(f, cliToken, hostId);
    const probePrompt = await awaitPrompt(f, cliToken, { hostId, attemptId: probe.attemptId });
    expect(await f.cli(trustDecide, decision(probePrompt))).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(server.closed()).toBe(1));
    const [created, repeated] = await Promise.all([f.cli(jobPrepare, prepare), f.cli(jobPrepare, prepare)]);
    const { jobId } = data(created) as { jobId: string };
    expect(repeated).toEqual(created);
    expect(await f.cli(jobPrepare, { ...prepare, command: "different fixture intent" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
    const start = await trustedJob(f, cliToken, hostId, jobId, async (input) => {
      expect(await f.cli(trustDecide, input)).toEqual({ ok: true, data: { applied: true } });
    });
    const ready = await readJob(f, cliToken, { jobId });
    expect(ready).toMatchObject({ state: "ready", jobId, hostId, routeRevision, attemptId: expect.any(String), sessionId: start.sessionId });
    expect(new Set([hostId, probe.attemptId, "attemptId" in ready && ready.attemptId, start.sessionId, jobId]).size).toBe(5);
    expect(server.conns).toHaveLength(2);
    expect(server.closed()).toBe(1);
    expect(executed).toEqual([]);
    expect(await f.cli(jobStart, { ...start, sessionId: randomUUID() })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

    expect(await f.cli(execRun, start)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await f.allow(execRun);
    expect(await f.cli(execRun, { hostId, command })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const starts = await Promise.all([f.cli(jobStart, start), f.cli(execRun, start)]);
    expect(starts).toEqual([created, created]);
    await waitForJob(f, cliToken, { jobId }, "running");
    const read = async (cursor = 0, limit = 4, stream = "stdout") => data(await f.cli(jobOutput, { jobId, stream, cursor, limit })) as OutputPage;
    await vi.waitFor(async () => expect(await read()).toEqual({ text: "A", fromCursor: 0, nextCursor: 1, endCursor: 1, skippedBytes: 0, truncated: false }));
    secondChunk.resolve();
    await vi.waitFor(async () => expect(await read()).toMatchObject({ text: "A中", nextCursor: 4, endCursor: 11 }));
    expect(await read(2)).toMatchObject({ text: "文", fromCursor: 4, nextCursor: 7, skippedBytes: 2, truncated: false });
    expect(await read(7)).toMatchObject({ text: "🙂", fromCursor: 7, nextCursor: 11 });
    expect(await read(0, 4096, "stderr")).toMatchObject({ text: "错误", endCursor: 6 });
    tail.resolve();

    const exited = await waitForJob(f, cliToken, { jobId }, "exited");
    expect(exited).toMatchObject({ state: "exited", reason: "exit-code", exitCode: 7, stdoutEnd: 75_011, stderrEnd: 6 });
    expect(JSON.stringify(exited)).not.toContain(password);
    await vi.waitFor(() => expect(server.closed()).toBe(2));
    const pages: OutputPage[] = [await read(0, 16_384)];
    expect(pages[0]).toMatchObject({ fromCursor: 9476, skippedBytes: 9476, truncated: true });
    while (pages.at(-1)!.nextCursor < 75_011) pages.push(await read(pages.at(-1)!.nextCursor, 16_384));
    expect(pages.map(({ text }) => text).join("")).toBe("界".repeat(21_845));
    expect(pages.every(({ text, fromCursor, nextCursor }) => Buffer.byteLength(text) === nextCursor - fromCursor && Buffer.byteLength(text) <= 16_384)).toBe(true);
    expect(await f.cli(jobOutput, { jobId, stream: "stdout", cursor: 75_012 })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await f.cli(jobStart, start)).toEqual(created);
    expect(executed).toEqual([command]);

    const ledger = path.join(f.engine.vault.runtimeDir, "ssh-exec-intents.ndjson");
    const receipts = await readFile(ledger, "utf8");
    for (const secret of [command, password, prepare.intentKey, "界界", "错误"]) expect(receipts).not.toContain(secret);
    const audit = "ssh.audit.list";
    await f.allow(audit);
    const auditEntry = { at: expect.any(String), hostId, action: "exec", result: "failed", detail: "" };
    expect(data(await f.cli(audit, { limit: 1 }))).toEqual([auditEntry]);
    expect(await f.cli(execCancel, { jobId, hostId, routeRevision })).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    await f.allow(execCancel);
    expect(await f.cli(execCancel, { execId: randomUUID() })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await f.cli(execCancel, { jobId, hostId, routeRevision })).toEqual({ ok: true, data: { cancelled: false } });
    await f.restart();
    expect(data(await f.cli(audit, { limit: 1 }))).toEqual([auditEntry]);
    expect(await f.cli(jobPrepare, prepare)).toEqual(created);
    expect(await f.cli(jobGet, { jobId })).toEqual({ ok: true, data: exited });
    expect(await read()).toEqual({ text: "", fromCursor: 75_011, nextCursor: 75_011, endCursor: 75_011, skippedBytes: 75_011, truncated: true });
    expect(await f.cli(jobStart, start)).toEqual(created);
    expect(server.conns).toHaveLength(2);
    expect(executed).toEqual([command]);
  } finally {
    await f.close();
  }
});

test("HTTP MCP isolates SSH owners under one token and never replays a job after reconnect or restart", { timeout: 45_000 }, async () => {
  const f = await fixture();
  const commands: string[] = [];
  const notFound = { isError: true, content: [{ text: expect.stringContaining("NOT_FOUND") }] };
  try {
    const { hostId, server } = await f.host("MCP job fixture", [], {
      onExecRequest: (command) => {
        commands.push(command);
        return undefined;
      },
      onInteractiveExec: (_command, channel, session) => {
        channel.write("hello");
        session.on("signal", (ack) => {
          ack?.();
          channel.exit(130);
          channel.end();
        });
        return true;
      },
    });
    await f.desktop("gateway.mcp.update", { enabled: true });
    await allowJobs(f);
    await f.allow(probeList);
    await f.allow(execCancel);
    await f.allow(execRun);
    await f.allow("ssh.jobs.list");
    const a = await f.desktop<{ id: string; token: string }>("gateway.tokens.create", { name: "jobs MCP A" });
    const b = await f.desktop<{ id: string; token: string }>("gateway.tokens.create", { name: "independent MCP token" });
    const original = await openRecoverableMcpSession(f.mcpEndpoint(), a.token);
    const sessionA = original.handle;
    const archive = path.join(path.dirname(f.engine.vault.root), "mcp-recovery-fixture.zip");
    await f.desktop("vault.exportPackage", { dest: archive });
    expect((await readFile(archive)).includes("mcp-recovery.json")).toBe(false);
    await f.desktop("git.init");
    const git = await f.desktop<{ files: { path: string }[] }>("git.status");
    expect(git.files.some(({ path }) => path.includes("mcp-recovery.json"))).toBe(false);
    const sessionB = await openMcpSession(f.mcpEndpoint(), a.token);
    const independent = await openMcpSession(f.mcpEndpoint(), b.token);
    const rpc = (token: string, handle: string, method: string, params = {}) => f.mcp(token, method, params, handle);
    const tool = (token: string, handle: string) => (capability: string, input: unknown) => rpc(token, handle, "tools/call", { name: capability.replaceAll(".", "_"), arguments: input });
    const invokeA = tool(a.token, sessionA);
    const invokeB = tool(a.token, sessionB);
    const invokeIndependent = tool(b.token, independent);
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    const prepare = { hostId, routeRevision, command: "fixture-session-output", intentKey: randomUUID() };
    expect(await rpc(a.token, sessionA, "tools/list")).toMatchObject({ tools: expect.arrayContaining([expect.objectContaining({ name: "ssh_jobs_prepare" })]) });
    const prepared = await invokeA(jobPrepare, prepare);
    expect(prepared).toMatchObject({ structuredContent: { data: { jobId: expect.any(String) } } });
    expect(await invokeA(jobPrepare, prepare)).toEqual(prepared);
    const { jobId } = prepared.structuredContent.data as { jobId: string };
    const cancellation = { jobId, hostId, routeRevision };
    const status = (state: JobStatus["state"], targetJob = jobId) =>
      vi.waitFor(
        async () => {
          const reply = await invokeA(jobGet, { jobId: targetJob });
          expect(reply).toMatchObject({ structuredContent: { data: { state } } });
          return reply.structuredContent.data as JobStatus;
        },
        { timeout: 9000 },
      );
    const key = await vi.waitFor(async () => {
      const reply = await invokeA(jobGet, { jobId });
      const current = reply.structuredContent?.data as JobStatus;
      if (!current || !("attemptId" in current) || !current.attemptId) throw new Error("SSH job has no attempt");
      return { hostId, attemptId: current.attemptId };
    });
    const waiting = await vi.waitFor(async () => {
      const reply = await invokeA(probeGet, key);
      expect(reply).toMatchObject({ structuredContent: { data: { state: "waiting" } } });
      return reply.structuredContent.data as Waiting;
    });

    expect(await f.call(a.token, jobGet, { jobId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await f.cli(jobGet, { jobId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    for (const invoke of [invokeB, invokeIndependent]) {
      expect(await invoke(probeList, {})).toMatchObject({ structuredContent: { data: [] } });
      expect(await invoke(probeGet, key)).toMatchObject(notFound);
      expect(await invoke(trustDecide, decision(waiting))).toMatchObject(notFound);
      expect(await invoke(jobGet, { jobId })).toMatchObject(notFound);
      expect(await invoke(jobOutput, { jobId, stream: "stdout" })).toMatchObject(notFound);
      expect(await invoke(jobCancel, { jobId })).toMatchObject(notFound);
      expect(await invoke(execCancel, cancellation)).toMatchObject(notFound);
    }
    expect((await mcpRequest(f.mcpEndpoint(), b.token, mcpRpc("tools/list"), sessionA)).status).toBe(404);

    // Drop the actual MCP response stream and resume with the original transport handle.
    const stream = await mcpRequest(f.mcpEndpoint(), a.token, undefined, sessionA, { method: "GET" });
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    await stream.body!.cancel();
    expect(await invokeA(probeGet, key)).toMatchObject({ structuredContent: { data: waiting } });
    expect(await invokeA(trustDecide, decision(waiting))).toMatchObject({ structuredContent: { data: { applied: true } } });
    expect(await invokeA(trustDecide, decision(waiting))).toMatchObject(notFound);
    const ready = await status("ready");
    if (!("sessionId" in ready) || !ready.sessionId) throw new Error("SSH job has no connection");
    const start = { jobId, hostId, routeRevision, sessionId: ready.sessionId };
    expect(await invokeB(jobStart, start)).toMatchObject(notFound);
    expect(await invokeB(execRun, start)).toMatchObject(notFound);
    expect(await invokeB("ssh.jobs.list", { hostId })).toMatchObject({ structuredContent: { data: [] } });
    expect(await f.desktop("ssh.jobs.list", { hostId })).toMatchObject([{ jobId, state: "ready" }]);
    const held = await invokeA(jobPrepare, { ...prepare, intentKey: randomUUID() });
    const heldId = held.structuredContent.data.jobId as string;
    const heldKey = await vi.waitFor(async () => {
      const reply = await invokeA(jobGet, { jobId: heldId });
      const current = reply.structuredContent?.data as JobStatus;
      if (!current || !("attemptId" in current) || !current.attemptId) throw new Error("SSH job has no attempt");
      return { hostId, attemptId: current.attemptId };
    });
    const heldProbe = await vi.waitFor(async () => {
      const reply = await invokeA(probeGet, heldKey);
      expect(reply).toMatchObject({ structuredContent: { data: { state: "waiting" } } });
      return reply.structuredContent.data as Waiting;
    });
    expect(await invokeA(trustDecide, decision(heldProbe))).toMatchObject({ structuredContent: { data: { applied: true } } });
    const heldReady = await status("ready", heldId);
    if (!("sessionId" in heldReady) || !heldReady.sessionId) throw new Error("SSH job has no connection");
    expect(await invokeA(jobStart, { ...start, sessionId: heldReady.sessionId })).toMatchObject(notFound);
    await f.allow(jobStart, false);
    expect(await invokeA(jobStart, start)).toMatchObject({ isError: true, content: [{ text: expect.stringContaining("CAPABILITY_NOT_EXPOSED") }] });
    expect(commands).toEqual([]);
    await f.allow(jobStart);
    for (const reply of await Promise.all([invokeA(jobStart, start), invokeA(execRun, start)])) {
      expect(reply).toMatchObject({ structuredContent: { data: { jobId } } });
    }
    await status("running");
    const read = () => invokeA(jobOutput, { jobId, stream: "stdout", cursor: 0 });
    await vi.waitFor(async () => {
      const reply = await read();
      expect(reply).toMatchObject({ structuredContent: { data: { text: "hello", nextCursor: 5 } } });
    });
    await f.chooseHosts([]);
    const resourceDenied = { isError: true, content: [{ text: expect.stringContaining("PERMISSION_DENIED") }] };
    expect(await invokeA(probeGet, key)).toMatchObject(resourceDenied);
    expect(await invokeA(probeList, {})).toMatchObject(resourceDenied);
    expect(await read()).toMatchObject(resourceDenied);
    expect(await invokeA(jobGet, { jobId })).toMatchObject(resourceDenied);
    expect(await invokeA(jobPrepare, prepare)).toMatchObject(resourceDenied);
    expect(await invokeA(jobCancel, { jobId })).toMatchObject(resourceDenied);
    expect(await invokeA(execCancel, cancellation)).toMatchObject(resourceDenied);
    expect(commands).toEqual([prepare.command]);
    await vi.waitFor(() => expect(server.closed()).toBe(2));
    await f.chooseHosts([hostId]);
    const beforeReconnect = await mcpRequest(f.mcpEndpoint(), a.token, undefined, sessionA, { method: "GET" });
    expect(beforeReconnect.status).toBe(200);
    await beforeReconnect.body!.cancel();
    expect(await read()).toMatchObject(resourceDenied);
    expect(await invokeA(jobGet, { jobId })).toMatchObject(resourceDenied);
    expect(await invokeA(execCancel, cancellation)).toMatchObject(resourceDenied);
    expect(await invokeA(jobCancel, { jobId: heldId })).toMatchObject(resourceDenied);
    expect(await invokeA(jobPrepare, prepare)).toMatchObject(resourceDenied);
    expect(commands).toEqual([prepare.command]);

    expect((await mcpRequest(f.mcpEndpoint(), b.token, undefined, independent, { method: "DELETE" })).status).toBe(200);
    expect((await mcpRequest(f.mcpEndpoint(), b.token, mcpRpc("tools/list"), independent)).status).toBe(404);
    const anotherVault = await fixture();
    try {
      await anotherVault.restart(() =>
        Promise.all([
          ...["gateways.json", "vault.json"].map((file) => copyFile(path.join(f.engine.vault.stateDir, file), path.join(anotherVault.engine.vault.stateDir, file))),
          copyFile(path.join(f.engine.vault.runtimeDir, "mcp-recovery.json"), path.join(anotherVault.engine.vault.runtimeDir, "mcp-recovery.json")),
        ]),
      );
      expect(anotherVault.engine.vault.id).toBe(f.engine.vault.id);
      expect((await mcpRequest(anotherVault.mcpEndpoint(), a.token, recoveryInitialize(original.recovery))).status).toBe(403);
      const otherHandle = await openMcpSession(anotherVault.mcpEndpoint(), a.token);
      expect(otherHandle).not.toBe(sessionA);
      expect((await mcpRequest(anotherVault.mcpEndpoint(), a.token, mcpRpc("tools/list"), sessionA)).status).toBe(404);
    } finally {
      await anotherVault.close();
    }

    await f.restart();
    expect((await mcpRequest(f.mcpEndpoint(), a.token, mcpRpc("tools/list"), sessionA)).status).toBe(404);
    const afterRestart = await openMcpSession(f.mcpEndpoint(), a.token);
    const invokeAfterRestart = tool(a.token, afterRestart);
    expect(await invokeAfterRestart(jobGet, { jobId })).toMatchObject(notFound);
    expect(await invokeAfterRestart(jobStart, start)).toMatchObject(notFound);
    expect(await invokeAfterRestart(jobCancel, { jobId })).toMatchObject(notFound);
    const restored = await openRecoverableMcpSession(f.mcpEndpoint(), a.token, original.recovery);
    const invokeRestored = tool(a.token, restored.handle);
    expect(await invokeRestored(jobGet, { jobId })).toMatchObject(resourceDenied);
    expect(await invokeRestored(jobOutput, { jobId, stream: "stdout", cursor: 0 })).toMatchObject(resourceDenied);
    await f.chooseHosts([]);
    expect(await invokeRestored(jobGet, { jobId })).toMatchObject(resourceDenied);
    expect(await invokeRestored(jobOutput, { jobId, stream: "stdout", cursor: 0 })).toMatchObject(resourceDenied);
    await f.chooseHosts([hostId]);
    expect(await invokeRestored(jobStart, start)).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('"outcome":"unknown"') }] });
    expect(commands).toEqual([prepare.command]);
    await f.desktop("gateway.mcp.update", { enabled: false });
    expect((await mcpRequest(f.mcpEndpoint(), a.token, mcpRpc("tools/list"), afterRestart)).status).toBe(404);
    await f.desktop("gateway.mcp.update", { enabled: true });
    expect((await mcpRequest(f.mcpEndpoint(), a.token, mcpRpc("tools/list"), afterRestart)).status).toBe(404);
    await f.restart();
    expect((await mcpRequest(f.mcpEndpoint(), a.token, recoveryInitialize(restored.recovery))).status).toBe(403);
    const beforeRevoke = await openRecoverableMcpSession(f.mcpEndpoint(), a.token);
    const revokedStream = await mcpRequest(f.mcpEndpoint(), a.token, undefined, beforeRevoke.handle, { method: "GET" });
    expect(revokedStream.status).toBe(200);
    await f.desktop("gateway.tokens.revoke", { id: a.id });
    expect(await revokedStream.body!.getReader().read()).toMatchObject({ done: true });
    expect((await mcpRequest(f.mcpEndpoint(), a.token, mcpRpc("tools/list"), beforeRevoke.handle)).status).toBe(401);
    await f.restart();
    expect((await mcpRequest(f.mcpEndpoint(), a.token, recoveryInitialize(beforeRevoke.recovery))).status).toBe(401);
  } finally {
    await f.close();
  }
});

test("route edits and a second Vault cannot reuse the original job or its receipts", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const commands: string[] = [];
  try {
    const host = await f.host("revision fixture", [], {
      onExecRequest: (command) => {
        commands.push(command);
        return undefined;
      },
    });
    const { hostId } = host;
    await allowJobs(f);
    const token = f.engine.cliToken;
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    const prepare = { hostId, routeRevision, command: "fixture-stale", intentKey: randomUUID() };
    expect(await f.call(token, jobPrepare, { ...prepare, routeRevision: "0".repeat(64) })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(host.server.conns).toHaveLength(0);
    const { jobId } = data(await f.call<{ jobId: string }>(token, jobPrepare, prepare));
    const start = await trustedJob(f, token, hostId, jobId);
    await f.desktop("ssh.hosts.configure", { ...host.profile, name: "revised fixture", hostId, expectedRevision: host.revision, credentials: [] });
    expect(await f.call(token, jobStart, start)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(await readJob(f, token, { jobId })).toMatchObject({ state: "failed", reason: "route-changed", exitCode: null, routeRevision, sessionId: start.sessionId });
    expect(await f.call(token, jobPrepare, prepare)).toEqual({ ok: true, data: { jobId } });
    await vi.waitFor(() => expect(host.server.closed()).toBe(1));

    const other = await fixture();
    try {
      const filename = "ssh-exec-intents.ndjson";
      await other.restart(() => copyFile(path.join(f.engine.vault.runtimeDir, filename), path.join(other.engine.vault.runtimeDir, filename)));
      await allowJobs(other);
      const otherToken = other.engine.cliToken;
      expect(await other.call(otherToken, jobGet, { jobId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(await other.call(otherToken, jobStart, start)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(await other.call(otherToken, jobCancel, { jobId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(commands).toEqual([]);
    } finally {
      await other.close();
    }
  } finally {
    await f.close();
  }
});

test("SSH rejection, reported signals and missing replies preserve actual outcomes without replay", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const commands: string[] = [];
  try {
    await allowJobs(f);
    const token = f.engine.cliToken;
    const { hostId, server } = await f.host("SSH exit fixture", [], {
      onExecRequest: (command) => {
        commands.push(command);
        if (command === "fixture-rejected") return "reject";
        if (command === "fixture-no-ack") return "hold";
        return undefined;
      },
      onInteractiveExec: (command, channel) => {
        if (command === "fixture-signal") channel.exit("TERM");
        if (command === "fixture-ignores-stop") return true;
        channel.end();
        return true;
      },
    });
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    for (const [command, state, reason, exitSignal, stopRequested] of [
      ["fixture-rejected", "failed", "exec-rejected", null, null],
      ["fixture-signal", "exited", "remote-signal", "SIGTERM", null],
      ["fixture-no-status", "unknown", "exit-unreported", null, null],
      ["fixture-no-ack", "unknown", "dispatch-timeout", null, null],
      ["fixture-ignores-stop", "unknown", "timeout-unconfirmed", null, "timeout"],
    ] as const) {
      const prepare = { hostId, routeRevision, command, intentKey: randomUUID(), timeoutSec: 1 };
      const job = data(await f.call<{ jobId: string }>(token, jobPrepare, prepare));
      const start = await trustedJob(f, token, hostId, job.jobId);
      expect(data(await f.call(token, jobStart, start))).toEqual(job);
      expect(await waitForJob(f, token, job, state)).toMatchObject({ state, reason, exitCode: null, exitSignal, stopRequested });
      expect(data(await f.call(token, jobPrepare, prepare))).toEqual(job);
      expect(data(await f.call(token, jobStart, start))).toEqual(job);
    }
    await vi.waitFor(() => expect(server.closed()).toBe(5));
    expect(commands).toEqual(["fixture-rejected", "fixture-signal", "fixture-no-status", "fixture-no-ack", "fixture-ignores-stop"]);
    const refused = await f.host("refused credentials fixture", [], { password: randomUUID() });
    const refusedRoute = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId: refused.hostId });
    const job = data(await f.call<{ jobId: string }>(token, jobPrepare, { hostId: refused.hostId, routeRevision: refusedRoute.routeRevision, command: "fixture-never-exec", intentKey: randomUUID() }));
    const attempting = await readJob(f, token, job);
    if (!("attemptId" in attempting) || !attempting.attemptId) throw new Error("The job has no SSH attempt");
    const waiting = await awaitPrompt(f, token, { hostId: refused.hostId, attemptId: attempting.attemptId });
    expect(data(await f.call(token, trustDecide, decision(waiting)))).toEqual({ applied: true });
    expect(await waitForJob(f, token, job, "failed")).toMatchObject({ reason: "authentication-failed", sessionId: null, exitCode: null });
    await vi.waitFor(() => expect(refused.server.closed()).toBe(1));
  } finally {
    await f.close();
  }
});

test("an admission left by an interrupted Engine remains unknown and cannot dial or dispatch again", { timeout: 30_000 }, async () => {
  const f = await fixture();
  const executed: string[] = [];
  try {
    await allowJobs(f);
    const { hostId, server } = await f.host("interrupted fixture", [], {
      onExecRequest: (command) => {
        executed.push(command);
        return undefined;
      },
    });
    const token = f.engine.cliToken;
    const { routeRevision } = await f.desktop<z.infer<typeof ResourceHost>>(hostGet, { hostId });
    const prepare = { hostId, routeRevision, command: "sleep 25", intentKey: randomUUID() };
    const job = data(await f.call<{ jobId: string }>(token, jobPrepare, prepare));
    const start = await trustedJob(f, token, hostId, job.jobId);
    await f.call(token, jobStart, start);
    await waitForJob(f, token, job, "running");

    const ledger = path.join(f.engine.vault.runtimeDir, "ssh-exec-intents.ndjson");
    const pendingReceipt = await readFile(ledger, "utf8");
    expect(pendingReceipt.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(pendingReceipt)).toMatchObject({ operationId: job.jobId, phase: "accepted" });
    // Reopen the exact durable state left by a crash before the terminal write.
    await f.restart(() => writeFile(ledger, pendingReceipt));
    await vi.waitFor(() => expect(server.closed()).toBe(1));
    expect(await f.cli(jobPrepare, prepare)).toEqual({ ok: true, data: job });
    expect(await f.cli(jobGet, job)).toEqual({ ok: true, data: { ...job, state: "unknown", reason: "engine-interrupted" } });
    expect(await f.cli(jobStart, start)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await f.cli(jobCancel, job)).toEqual({ ok: true, data: { requested: false } });
    expect(await f.cli(jobOutput, { ...job, stream: "stdout" })).toMatchObject({ ok: false, error: { details: { outcome: "unknown" } } });
    expect(server.conns).toHaveLength(1);
    expect(executed).toEqual(["sleep 25"]);
  } finally {
    await f.close();
  }
});

test.each(["cli", "mcp"] as const)("%s binds directory commits to a single owned shell, prompt revision and file session", { timeout: 35_000 }, async (entry) => {
  const f = await fixture();
  const input: string[] = [];
  const fileOpen = "ssh.fileSessions.open";
  const directory = "ssh.fileSessions.directory";
  const prepare = "ssh.fileSessions.prepareDirectory";
  const commit = "ssh.fileSessions.commitDirectory";
  try {
    const { hostId, server } = await f.host("directory follow fixture", [], {
      onExec: (command) => (command === shellDirectoryProbe ? { stdout: "bash\n" } : undefined),
      onInteractiveExec: (command, channel) => {
        const token = command.match(/;([a-f0-9]{48});B/)?.[1];
        if (!token) return false;
        const prompt = (cwd: string) => channel.write(`\x1b]633;Huhu;${token};P;${Buffer.from(cwd + "\n").toString("base64")}\x07`);
        channel.on("data", (data: Buffer) => {
          input.push(data.toString());
          channel.write(`\x1b]633;Huhu;${token};B\x07`);
          prompt("/home/test/nested");
        });
        prompt("/home/test");
        return true;
      },
    });
    server.fs.dirs.add("/home/test/nested");
    server.fs.dirs.add("/home/test/other");
    const spare = await f.host("directory spare");
    const invoke = await externalTool(f, entry);
    const peer = await externalTool(f, "mcp");
    const disabled = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
    const missing = { ok: false, error: { code: "NOT_FOUND" } };
    for (const tool of [directory, prepare, commit]) {
      expect(await invoke(tool, {})).toMatchObject(disabled);
      await f.allow(tool);
    }
    for (const tool of ["ssh.shells.open", "ssh.shells.write", fileOpen]) await f.allow(tool);
    const binding = await connectOwned(f, invoke, hostId);
    const another = await connectOwned(f, invoke, spare.hostId);
    const { shellId } = z.object({ shellId: z.string() }).parse(data(await invoke("ssh.shells.open", { ...binding, intentKey: randomUUID() })));
    expect(await invoke(fileOpen, { ...another, shellId, intentKey: randomUUID() })).toMatchObject(missing);
    const opened = await invoke(fileOpen, { ...binding, shellId, intentKey: randomUUID() });
    const { fileSessionId } = z.object({ fileSessionId: z.uuid() }).parse(data(opened));
    expect(data(opened)).toMatchObject({ shellId, source: "external" });
    const file = { fileSessionId };
    const promptState = async () => z.object({ state: z.string(), cwd: z.string().optional(), revision: z.number() }).parse(data(await invoke(directory, file)));
    const { revision } = await vi.waitFor(async () => {
      const state = await promptState();
      expect(state).toMatchObject({ state: "ready", cwd: "/home/test" });
      return state;
    });
    const request = { ...file, path: "/home/test/nested", revision };
    expect(await peer(directory, file)).toMatchObject(missing);
    expect(await peer(prepare, request)).toMatchObject(missing);
    const { follow } = z.object({ follow: z.uuid() }).parse(data(await invoke(prepare, request)));
    const change = { ...file, follow, intentKey: randomUUID() };
    expect(await peer(commit, change)).toMatchObject(missing);
    expect(data(await invoke(commit, change))).toEqual({ applied: true });
    expect(data(await invoke(commit, change))).toEqual({ applied: true });
    expect(data(await invoke(commit, { ...change, intentKey: randomUUID() }))).toEqual({ applied: false });
    await vi.waitFor(async () => expect(await promptState()).toMatchObject({ state: "ready", cwd: "/home/test/nested" }));
    expect(input).toEqual([" builtin cd -- '/home/test/nested'\r"]);
    const navigation = { ...file, path: "/home/test/other", revision: (await promptState()).revision };
    const expiring = z.object({ follow: z.uuid() }).parse(data(await invoke(prepare, navigation)));
    const elapsed = vi.spyOn(performance, "now").mockReturnValue(performance.now() + 6000);
    try {
      expect(data(await invoke(commit, { ...file, ...expiring, intentKey: randomUUID() }))).toEqual({ applied: false });
    } finally {
      elapsed.mockRestore();
    }
    const stale = z.object({ follow: z.uuid() }).parse(data(await invoke(prepare, navigation)));
    expect(await invoke("ssh.shells.write", { shellId, dataBase64: Buffer.from("pwd\r").toString("base64"), intentKey: randomUUID() })).toMatchObject({ ok: true });
    expect(data(await invoke(commit, { ...file, ...stale, intentKey: randomUUID() }))).toEqual({ applied: false });
    expect(input).toEqual([" builtin cd -- '/home/test/nested'\r", "pwd\r"]);
    await f.chooseHosts([spare.hostId]);
    expect(await invoke(directory, file)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(await invoke(commit, change)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  } finally {
    await f.close();
  }
});

test.skipIf(process.platform !== "linux").each(["cli", "mcp"] as const)("%s runs archives in an owned remote directory with bounds, revision checks and intent receipts", { timeout: 45_000 }, async (entry) => {
  const f = await fixture();
  const root = await mkdtemp(path.join(tmpdir(), "huhu-remote-archive-"));
  const support = "ssh.archives.support";
  const archive = "ssh.archives.run";
  const content = "archive-fixture-content";
  let probes = 0;
  let commands = 0;
  try {
    const { hostId } = await f.host(
      "archive fixture",
      [],
      ownedArchiveFixture(root, (phase) => {
        if (phase === "probe") probes++;
        else commands++;
      }),
    );
    const spare = await f.host("archive spare");
    const invoke = await externalTool(f, entry);
    const peer = await externalTool(f, "mcp");
    for (const tool of [support, archive]) {
      expect(await invoke(tool, {})).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
      await f.allow(tool);
    }
    await f.allow("ssh.fileSessions.open");
    await f.allow("ssh.fileSessions.properties");
    const binding = await connectOwned(f, invoke, hostId);
    const { fileSessionId } = z.object({ fileSessionId: z.uuid() }).parse(data(await invoke("ssh.fileSessions.open", { ...binding, intentKey: randomUUID() })));
    expect(await peer(support, { fileSessionId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const provided = data(await invoke(support, { fileSessionId }));
    expect(provided).toMatchObject({ local: { zip: false }, remote: { zip: true }, formats: ["tar", "tar.gz", "zip"] });
    expect(data(await invoke(support, { fileSessionId }))).toEqual(provided);
    expect(probes).toBe(1);
    const name = "source's data.txt";
    await writeFile(path.join(root, name), content);
    const revision = async (name: string) => z.object({ revision: z.string() }).parse(data(await invoke("ssh.fileSessions.properties", { fileSessionId, path: path.join(root, name) }))).revision;
    const dir = { kind: "remote", fileSessionId, path: root };
    const request = { directory: dir, operation: "compress", name, output: "fixture.tgz", sourceRevision: await revision(name), maxBytes: 64 * 1024, intentKey: randomUUID() };
    expect(await peer(archive, request)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await invoke(archive, { ...request, directory: { kind: "local", path: root } })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await invoke(archive, { ...request, maxBytes: 3, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await invoke(archive, { ...request, sourceRevision: "0".repeat(64), intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    const created = await invoke(archive, request);
    expect(created).toMatchObject({ ok: true, data: { archivePath: path.join(root, "fixture.tgz"), archiveSha256: expect.stringMatching(/^[0-9a-f]{64}$/), entries: [{ name, size: content.length }] } });
    const afterCreate = commands;
    expect(await invoke(archive, request)).toEqual(created);
    expect(commands).toBe(afterCreate);
    expect(await invoke(archive, { ...request, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "NAME_CONFLICT" } });
    expect(await invoke(archive, { ...request, overwrite: true, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await invoke(archive, { ...request, overwrite: true, targetRevision: "0".repeat(64), intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(await invoke(archive, { ...request, overwrite: true, targetRevision: await revision("fixture.tgz"), intentKey: randomUUID() })).toMatchObject({ ok: true });
    const file = { directory: dir, name: "fixture.tgz", sourceRevision: await revision("fixture.tgz"), maxBytes: 64 * 1024 };
    expect(await invoke(archive, { ...file, operation: "list", intentKey: randomUUID() })).toMatchObject({ ok: true, data: { entries: [{ name }] } });
    expect(await invoke(archive, { ...file, operation: "extract", output: "restored", intentKey: randomUUID() })).toMatchObject({ ok: true, data: { extractedPath: path.join(root, "restored") } });
    expect(await readFile(path.join(root, "restored", name), "utf8")).toBe(content);
    for (const output of ["fixture.tar", "fixture.zip"]) {
      expect(await invoke(archive, { ...request, output, intentKey: randomUUID() })).toMatchObject({ ok: true, data: { entries: [{ name, size: content.length }] } });
    }
    expect((await readdir(root)).sort()).toEqual(["fixture.tar", "fixture.tgz", "fixture.zip", "restored", name].sort());
    await f.chooseHosts([spare.hostId]);
    expect(await invoke(archive, request)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(await readFile(path.join(f.engine.vault.runtimeDir, "ssh-host-intents.ndjson"), "utf8")).not.toContain(content);
  } finally {
    await f.close();
    await rm(root, { recursive: true, force: true });
  }
});

test.each(["cli", "mcp"] as const)("%s imports new hosts into visible groups without granting their use", { timeout: 35_000 }, async (entry) => {
  const f = await fixture();
  const preview = "ssh.hosts.import.preview";
  const confirm = "ssh.hosts.import.confirm";
  const directory = "ssh.hosts.directory";
  const organize = "ssh.hosts.organize";
  const shape = z.object({
    version: z.string(),
    groups: z.array(z.object({ groupId: z.string(), name: z.string() })),
    hosts: z.array(z.object({ hostId: z.string(), groupId: z.string().nullable() })),
  });
  try {
    const visible = await f.host("authorized catalogue fixture");
    const hidden = await f.host("hidden catalogue fixture");
    await f.chooseHosts([visible.hostId]);
    const desktopDirectory = async () => shape.parse(await f.desktop(directory));
    const group = async (name: string, hostId: string) => {
      const made = shape.parse(await f.desktop(organize, { expectedVersion: (await desktopDirectory()).version, operation: { type: "group.create", name, parentId: null } }));
      const groupId = made.groups.find((group) => group.name === name)!.groupId;
      await f.desktop(organize, { expectedVersion: made.version, operation: { type: "hosts.move", groupId, hostIds: [hostId] } });
      return groupId;
    };
    const visibleGroup = await group("Visible", visible.hostId);
    await group("Hidden", hidden.hostId);
    const invoke = await externalTool(f, entry);
    const peer = await externalTool(f, "mcp");
    const disabled = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
    const stale = { ok: false, error: { code: "INVALID_INPUT" } };
    expect(await invoke(confirm, {})).toMatchObject(disabled);
    for (const tool of [preview, confirm, hostGet, directory]) await f.allow(tool);
    const file = (names: string[]) => ({
      format: "windterm",
      filename: "user.sessions",
      contentBase64: Buffer.from(
        JSON.stringify(
          names.map((group, index) => ({
            "session.label": `New import ${index}`,
            "session.group": group,
            "session.target": "fixture-login@127.0.0.1",
            "session.port": index + 65530,
            "session.protocol": "SSH",
            "session.password": "fixture-secret-omitted",
          })),
        ),
      ).toString("base64"),
    });
    const source = file(["Visible", "Hidden", "Missing"]);
    const tokenFor = async () => z.object({ token: z.string() }).parse(data(await invoke(preview, source))).token;
    const token = await tokenFor();
    const choice = { source, token, selected: [{ index: 1 }, { index: 2 }, { index: 3 }], intentKey: randomUUID() };
    expect(await peer(confirm, choice)).toMatchObject(stale);
    expect(await invoke(confirm, { ...choice, source: file(["Missing"]) })).toMatchObject(stale);
    await f.desktop(organize, { expectedVersion: (await desktopDirectory()).version, operation: { type: "sort.set", sort: "name-desc" } });
    expect(await invoke(confirm, { ...choice, intentKey: randomUUID() })).toMatchObject(stale);
    const fresh = { ...choice, token: await tokenFor(), intentKey: randomUUID() };
    const published = await invoke(confirm, fresh);
    const { imported } = z.object({ imported: z.array(z.object({ hostId: z.string() })) }).parse(data(published));
    expect(imported).toHaveLength(3);
    expect(await invoke(confirm, fresh)).toEqual(published);
    const current = await desktopDirectory();
    expect(current.groups.map(({ name }) => name)).toEqual(["Hidden", "Visible"]);
    expect(imported.map(({ hostId }) => current.hosts.find((host) => host.hostId === hostId)?.groupId)).toEqual([visibleGroup, null, null]);
    expect(data(await invoke(directory, {}))).toMatchObject({ groups: [{ groupId: visibleGroup }], hosts: [{ hostId: visible.hostId }] });
    for (const { hostId } of imported) expect(await invoke(hostGet, { hostId })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(await readFile(path.join(f.engine.vault.runtimeDir, "ssh-host-intents.ndjson"), "utf8")).not.toContain("fixture-secret-omitted");
    await f.allow(confirm, false);
    expect(await invoke(confirm, fresh)).toMatchObject(disabled);
  } finally {
    await f.close();
  }
});
