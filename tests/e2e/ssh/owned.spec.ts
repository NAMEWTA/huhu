import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import type { CapabilityResult } from "../../../packages/contracts/src/capability.js";
import { mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import type { PublicProbeStatus } from "../../../plugins/ssh/src/engine/public-probes.js";
import { shellDirectoryProbe } from "../../../plugins/ssh/src/engine/shell-directory.js";
import type { z } from "zod";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import { ownedArchiveFixture } from "../../../plugins/ssh/test/owned-archive-fixture.js";
import { openApp } from "../helpers/launch.js";
import { desktopCall } from "./workbench.js";

const run = promisify(execFile);
const connect = "ssh.connect";
const get = "ssh.resources.connection.get";
const trust = "ssh.resources.trust.decide";
const open = "ssh.shells.open";
const list = "ssh.shells.list";
const read = "ssh.shells.read";
const write = "ssh.shells.write";
const filesOpen = "ssh.fileSessions.open";
const directory = "ssh.fileSessions.directory";
const prepareDirectory = "ssh.fileSessions.prepareDirectory";
const commitDirectory = "ssh.fileSessions.commitDirectory";
const properties = "ssh.fileSessions.properties";
const archiveSupport = "ssh.archives.support";
const archiveRun = "ssh.archives.run";
const importPreview = "ssh.hosts.import.preview";
const importConfirm = "ssh.hosts.import.confirm";
const hostGet = "ssh.resources.host.get";
const upload = "ssh.sftp.upload";
const download = "ssh.sftp.download";
const queue = "ssh.transfers.list";
const startCopy = "ssh.transfers.start";
const forward = "ssh.forwarding.runs.start";
const forwards = "ssh.forwarding.runs.list";
const stopForward = "ssh.forwarding.runs.stop";
const lastActions = [directory, prepareDirectory, commitDirectory, archiveSupport, archiveRun, importConfirm];
const actions = [connect, get, trust, open, list, read, write, filesOpen, upload, download, queue, startCopy, forward, forwards, stopForward, properties, importPreview, hostGet, ...lastActions];

function accepted<T>(reply: CapabilityResult<unknown>): T {
  if (!reply.ok) throw new Error(reply.error.code);
  return reply.data as T;
}

for (const entry of ["CLI", "HTTP MCP"]) {
  test(`${entry} isolates SSH terminals, files, imports and forwarded listeners`, async () => {
    const password = randomUUID();
    const input: string[] = [];
    let closed = 0;
    const archiveRoot = process.platform === "linux" ? await mkdtemp(path.join(tmpdir(), "huhu-owned-archive-e2e-")) : undefined;
    const fixtures = archiveRoot && ownedArchiveFixture(archiveRoot);
    const server = await startFakeSsh({
      password,
      remoteForwarding: true,
      ...(fixtures && { onStat: fixtures.onStat }),
      onExec: (command) => (command === shellDirectoryProbe ? { stdout: "bash\n" } : undefined),
      onInteractiveExec: (command, channel, session) => {
        if (fixtures && fixtures.onInteractiveExec?.(command, channel, session)) return true;
        const marker = command.match(/;([a-f0-9]{48});B/)?.[1];
        if (!marker) return false;
        const prompt = (cwd: string) => channel.write(`\x1b]633;Huhu;${marker};P;${Buffer.from(cwd + "\n").toString("base64")}\x07`);
        channel.once("close", () => closed++);
        channel.on("data", (data: Buffer) => {
          input.push(data.toString());
          if (data.toString().startsWith(" builtin cd -- ")) {
            channel.write(`\x1b]633;Huhu;${marker};B\x07`);
            prompt("/home/test/selected");
          }
        });
        prompt("/home/test");
        return true;
      },
    });
    server.fs.dirs.add("/home/test/selected");
    const target = await startFakeSsh({ password });
    const app = await openApp();
    const { page, vault } = app;
    try {
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
      const saveHost = (name: string, port: number) =>
        desktopCall<{ hostId: string }>(page, "ssh.hosts.configure", {
          name,
          host: "127.0.0.1",
          port,
          user: "fixture",
          authKind: "password",
          expectedRevision: null,
          credentials: [{ purpose: "password", action: "replace", value: password }],
        });
      const { hostId } = await saveHost("外部终端回环夹具", server.port);
      const { hostId: targetHostId } = await saveHost("外部传输目标夹具", target.port);
      const { routeRevision } = await desktopCall<{ routeRevision: string }>(page, "ssh.resources.host.get", { hostId });
      const binding = { hostId, routeRevision };
      await desktopCall(page, "gateway.mcp.update", { enabled: true, transport: "http" });
      const { token } = await desktopCall<{ token: string }>(page, "gateway.tokens.create", { name: "外部终端验收" });
      const endpoint = await page.evaluate(async () => (await (window as unknown as { huhuHost: { engine(): Promise<{ baseUrl: string }> } }).huhuHost.engine()).baseUrl + "/mcp");
      expect(new URL(endpoint).hostname).toBe("127.0.0.1");
      const mcp =
        (session: string) =>
        async (capability: string, input: unknown = {}): Promise<CapabilityResult<unknown>> => {
          const response = await mcpRequest(endpoint, token, mcpRpc("tools/call", { name: capability.replaceAll(".", "_"), arguments: input }), session);
          expect(response.status).toBe(200);
          const { result } = await response.json();
          return result.isError ? { ok: false, error: JSON.parse(result.content[0].text) } : { ok: true, data: result.structuredContent.data };
        };
      const cli = async (capability: string, input: unknown = {}): Promise<CapabilityResult<unknown>> => {
        const script = path.resolve(import.meta.dirname, "../../../apps/cli/dist/cli.mjs");
        const { stdout } = await run(process.execPath, [script, "call", capability, "--vault", vault, "--json", "--input-json", JSON.stringify(input)]).catch((error: { stdout?: string }) => {
          if (!error.stdout) throw error;
          return { stdout: error.stdout };
        });
        return JSON.parse(stdout);
      };
      const invoke = entry === "CLI" ? cli : mcp(await openMcpSession(endpoint, token));
      const peer = mcp(await openMcpSession(endpoint, token));
      const policy = async (hosts: string[], exposed?: boolean) => {
        const resources = { "ssh.hosts": hosts };
        const changes = exposed === undefined ? [] : actions.map((capability) => ({ capability, exposed }));
        const { revision, catalogRevision } = await desktopCall<{ revision: number; catalogRevision: string }>(page, "gateway.policy.preview", { resources, changes });
        await desktopCall(page, "gateway.policy.update", { resources, changes, expectedRevision: revision, catalogRevision });
      };
      const connectIntent = { ...binding, intentKey: randomUUID() };
      const hosts = [hostId, targetHostId];
      await policy(hosts);
      expect(await invoke(connect, connectIntent)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
      for (const action of lastActions) expect(await invoke(action)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
      await policy(hosts, true);
      const dial = async (intent: typeof connectIntent) => {
        const { attemptId } = accepted<{ attemptId: string }>(await invoke(connect, intent));
        const status = async () => accepted<z.infer<typeof PublicProbeStatus>>(await invoke(get, { hostId: intent.hostId, attemptId }));
        await expect.poll(async () => (await status()).state).toBe("waiting");
        const pending = await status();
        if (pending.state !== "waiting") throw new Error("未找到回环夹具主机指纹");
        const { intentKey: _, ...route } = intent;
        accepted(await invoke(trust, { ...route, attemptId, ...pending.prompt, accept: true }));
        await expect.poll(async () => (await status()).state).toBe("connected");
        return attemptId;
      };
      const attemptId = await dial(connectIntent);
      const openIntent = { ...binding, attemptId, intentKey: randomUUID() };
      const opened = await invoke(open, openIntent);
      expect(await invoke(open, openIntent)).toEqual(opened);
      const { shellId: firstId } = accepted<{ shellId: string }>(opened);
      expect(accepted(await peer(list, { hostId }))).toEqual([]);
      expect(await peer(read, { shellId: firstId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

      await page.getByRole("button", { name: "远程连接", exact: true }).first().click();
      const moduleView = page.getByTestId("ssh-module");
      await moduleView.getByRole("button", { name: /^外部终端回环夹具 / }).click();
      await expect(moduleView.getByRole("heading", { name: "外部工具连接" })).toBeVisible();
      await moduleView.getByRole("tab", { name: "交互终端", exact: true }).click();
      await expect(moduleView.getByRole("heading", { name: "外部工具终端" })).toBeVisible();
      await moduleView.getByRole("button", { name: new RegExp(firstId) }).click();
      await expect.poll(() => closed).toBe(1);

      const { shellId } = accepted<{ shellId: string }>(await invoke(open, { ...openIntent, intentKey: randomUUID() }));
      const fresh = { shellId };
      const { fileSessionId } = accepted<{ fileSessionId: string }>(await invoke(filesOpen, { ...binding, attemptId, shellId, intentKey: randomUUID() }));
      const file = { fileSessionId };
      const shellDirectory = async () => accepted<{ state: string; revision: number; cwd?: string }>(await invoke(directory, file));
      await expect.poll(shellDirectory).toMatchObject({ state: "ready", cwd: "/home/test" });
      expect(await peer(directory, file)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      const { revision } = await shellDirectory();
      const { follow } = accepted<{ follow: string }>(await invoke(prepareDirectory, { ...file, revision, path: "/home/test/selected" }));
      const followIntent = { ...file, follow, intentKey: randomUUID() };
      expect(await invoke(commitDirectory, followIntent)).toEqual({ ok: true, data: { applied: true } });
      expect(await invoke(commitDirectory, followIntent)).toEqual({ ok: true, data: { applied: true } });
      expect(await invoke(commitDirectory, { ...followIntent, intentKey: randomUUID() })).toEqual({ ok: true, data: { applied: false } });
      await expect.poll(shellDirectory).toMatchObject({ state: "ready", cwd: "/home/test/selected" });
      const send = { ...fresh, intentKey: randomUUID(), dataBase64: Buffer.from("fixture-only").toString("base64") };
      expect(await invoke(write, send)).toEqual({ ok: true, data: { bytes: 12 } });
      expect(await invoke(write, send)).toEqual({ ok: true, data: { bytes: 12 } });
      await expect.poll(() => input).toEqual([" builtin cd -- '/home/test/selected'\r", "fixture-only"]);
      expect(await desktopCall(page, "ssh.fileSessions.list")).toMatchObject([{ fileSessionId, source: "external" }]);
      if (archiveRoot) {
        const name = "owned.txt";
        await writeFile(path.join(archiveRoot, name), "owned archive fixture");
        expect(accepted(await invoke(archiveSupport, file))).toMatchObject({ formats: expect.arrayContaining(["tar.gz"]) });
        expect(await peer(archiveSupport, file)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
        const version = async (name: string) => accepted<{ revision: string }>(await invoke(properties, { ...file, path: path.join(archiveRoot, name) })).revision;
        const remote = { kind: "remote", ...file, path: archiveRoot };
        const pack = { directory: remote, operation: "compress", name, output: "owned.tgz", sourceRevision: await version(name), maxBytes: 64 * 1024, intentKey: randomUUID() };
        const archived = await invoke(archiveRun, pack);
        expect(archived).toMatchObject({ ok: true, data: { entries: [{ name }] } });
        expect(await invoke(archiveRun, pack)).toEqual(archived);
        const unpack = { directory: remote, operation: "extract", name: "owned.tgz", output: "unpacked", sourceRevision: await version("owned.tgz"), maxBytes: 64 * 1024, intentKey: randomUUID() };
        expect(await invoke(archiveRun, unpack)).toMatchObject({ ok: true });
        expect(await readFile(path.join(archiveRoot, "unpacked", name), "utf8")).toBe("owned archive fixture");
      }
      const source = { format: "openssh", filename: "config", contentBase64: Buffer.from("Host imported-fixture\n HostName 127.0.0.2\n User fixture\n").toString("base64") };
      const { token: previewToken } = accepted<{ token: string }>(await invoke(importPreview, source));
      const confirm = { source, token: previewToken, selected: [{ index: 1 }], intentKey: randomUUID() };
      expect(await peer(importConfirm, confirm)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      const published = await invoke(importConfirm, confirm);
      const { imported } = accepted<{ imported: [{ hostId: string }] }>(published);
      expect(await invoke(importConfirm, confirm)).toEqual(published);
      expect(await invoke(hostGet, { hostId: imported[0].hostId })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      const remotePath = "/home/test/owned.bin";
      const remote = { fileSessionId, remotePath };
      const bytes = { ...remote, transferId: randomUUID(), intentKey: randomUUID(), dataBase64: "AP8=" };
      for (const action of [upload, download]) {
        expect(await invoke(action, { ...remote, localPath: "/fixture/local-only" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      }
      expect(await peer(download, { ...remote, transferId: randomUUID() })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(await invoke(upload, bytes)).toEqual({ ok: true, data: { size: 2 } });
      expect(await invoke(download, { ...remote, transferId: randomUUID() })).toMatchObject({ ok: true, data: { dataBase64: "AP8=", eof: true } });
      const targetRoute = await desktopCall<{ routeRevision: string }>(page, "ssh.resources.host.get", { hostId: targetHostId });
      const targetAttempt = await dial({ hostId: targetHostId, routeRevision: targetRoute.routeRevision, intentKey: randomUUID() });
      const { fileSessionId: targetFileId } = accepted<{ fileSessionId: string }>(await invoke(filesOpen, { routeRevision: targetRoute.routeRevision, hostId: targetHostId, attemptId: targetAttempt, intentKey: randomUUID() }));
      const request = {
        source: { kind: "remote", fileSessionId, path: remotePath },
        target: { kind: "remote", fileSessionId: targetFileId, path: remotePath },
        intentKey: randomUUID(),
      };
      const copied = accepted<{ transferId: string }>(await invoke(startCopy, request));
      expect(await invoke(startCopy, request)).toMatchObject({ ok: true, data: { transferId: copied.transferId } });
      expect(accepted(await peer(queue))).toMatchObject({ jobs: [] });
      await expect.poll(async () => accepted(await invoke(queue))).toMatchObject({ jobs: [{ transferId: copied.transferId, state: "completed" }] });
      expect(target.fs.files.get(remotePath)).toEqual(Buffer.from([0, 255]));
      const rule = await desktopCall<{ id: string; revision: string }>(page, "ssh.forwarding.rules.save", {
        name: "外部回环转发",
        mode: "local",
        hostId,
        listenPort: target.port,
        resume: false,
        target: { host: "127.0.0.1", port: target.port },
      });
      const requested = { ...binding, attemptId, id: rule.id, expectedRevision: rule.revision, intentKey: randomUUID() };
      const forwarded = accepted<{ id: string; listener: unknown }>(await invoke(forward, requested));
      expect(forwarded.listener).toMatchObject({ device: "local", host: "127.0.0.1", port: expect.any(Number) });
      const reserve = createServer();
      reserve.listen(0, "127.0.0.1");
      await once(reserve, "listening");
      const remotePort = (reserve.address() as { port: number }).port;
      const freed = once(reserve, "close");
      reserve.close();
      await freed;
      const allForwards = [forwarded.id];
      for (const mode of ["socks5", "http-connect", "remote"]) {
        const more = await desktopCall<{ id: string; revision: string }>(page, "ssh.forwarding.rules.save", {
          name: `外部夹具 ${mode}`,
          mode,
          hostId,
          listenPort: mode === "remote" ? remotePort : target.port,
          resume: false,
          ...(mode === "remote" && { target: { host: "127.0.0.1", port: target.port } }),
        });
        const run = accepted<{ id: string; listener: unknown }>(await invoke(forward, { ...requested, id: more.id, expectedRevision: more.revision, intentKey: randomUUID() }));
        allForwards.push(run.id);
        if (mode === "remote") {
          expect(run.listener).toEqual({ device: "remote", requestedHost: "127.0.0.1", requestedPort: remotePort, binding: "server-policy-unknown" });
          const socket = createConnection(remotePort, "127.0.0.1");
          try {
            const [greeting] = await once(socket, "data", { signal: AbortSignal.timeout(3000) });
            expect(greeting.toString()).toContain("SSH-2.0-");
          } finally {
            socket.destroy();
          }
        } else {
          expect(run.listener).toMatchObject({ device: "local", host: "127.0.0.1", port: expect.any(Number) });
        }
      }
      expect(accepted(await peer(forwards))).toEqual([]);
      expect(await peer(stopForward, { id: rule.id, expectedRevision: rule.revision, runId: forwarded.id, intentKey: randomUUID() })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      await policy([targetHostId]);
      await expect.poll(() => closed).toBe(2);
      const denied = { ok: false, error: { code: "PERMISSION_DENIED" } };
      expect(await invoke(write, send)).toMatchObject(denied);
      expect(await invoke(read, fresh)).toMatchObject(denied);
      expect(await invoke(download, { ...remote, transferId: randomUUID() })).toMatchObject(denied);
      expect(await invoke(directory, file)).toMatchObject(denied);
      expect(await invoke(commitDirectory, followIntent)).toMatchObject(denied);
      if (archiveRoot) expect(await invoke(archiveSupport, file)).toMatchObject(denied);
      expect(accepted(await invoke(queue))).toMatchObject({ jobs: [] });
      expect(accepted(await invoke(forwards))).toEqual([]);
      await expect.poll(() => desktopCall(page, forwards)).toEqual(expect.arrayContaining(allForwards.map((id) => expect.objectContaining({ id, state: "stopped", source: "external" }))));
      await policy(hosts, false);
      expect(await invoke(open, openIntent)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
    } finally {
      try {
        await Promise.all([server.close(), target.close()]);
      } finally {
        if (archiveRoot) await rm(archiveRoot, { recursive: true, force: true });
        await app.close();
      }
    }
  });
}
