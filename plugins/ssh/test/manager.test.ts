import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { utils } from "ssh2";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { HuhuError } from "@huhu/contracts";
import { randomUUID } from "node:crypto";
import { findJumpCycle } from "../src/engine/hosts.js";
import type { SshHostProfile } from "../src/engine/auth-profile.js";
import { FileSessions } from "../src/engine/file-sessions.js";
import { SshManager } from "../src/engine/manager.js";
import { DeviceProxies } from "../src/engine/device-proxies.js";
import { TerminalRecordings } from "../src/engine/terminal-recordings.js";
import { connectionIdentity, routeForHost, workspaceTarget } from "../src/engine/workspace-target.js";
import { maxRecordingCheckpoints } from "../src/shared/recordings.js";
import { genHostKey, startFakeSsh } from "./fake-server.js";
import { ownedHosts } from "./owned-hosts.js";
import { relayToLoopback } from "./shell-relay-fixture.js";
import { defaultVaultPreferences, type ReconnectPreferences } from "../src/shared/preferences.js";
import { parseQuickEndpoint } from "../src/shared/quick-connection.js";

const dirs: string[] = [];
const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0)) await c();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-ssh-"));
  dirs.push(d);
  return d;
};

function setup(password = "pw", unavailable: boolean | "missing-identity" = false, deviceProxy = false, shareConnections = true, reconnect?: ReconnectPreferences) {
  const root = tmp();
  const hosts = ownedHosts();
  const commands = deviceProxy ? new DeviceProxies({ localRoot: root, localVaultInstanceId: "fixture-vault" }) : undefined;
  const prompts: { hop: number; reason: string; attemptId: string; fingerprint: string }[] = [];
  let mgr!: SshManager;
  const changes = vi.fn();
  const secretCalls: string[] = [];
  mgr = new SshManager({
    hosts,
    knownHostsFile: path.join(root, "known_hosts"),
    auditDir: path.join(root, "audit"),
    now: () => new Date("2026-11-11T00:00:00Z"),
    withManagedAuth: async (host, connect) => {
      secretCalls.push(host.id);
      if (unavailable === "missing-identity") throw new HuhuError("SSH_AUTH_FAILED", "本机身份文件不可用", { details: { reason: "identity-file-unavailable" } });
      if (unavailable) throw new HuhuError("SSH_AUTH_FAILED", "SSH 本机认证不可用");
      await connect({ password });
    },
    publish: (type, payload) => {
      if (type === "ssh.connectionChanged") changes(payload);
      if (type === "ssh.hostKeyPrompt") {
        const p = payload as { hop: number; reason: string; attemptId: string; fingerprint: string };
        prompts.push(p);
      }
    },
    decisionTimeoutMs: 1000,
    connectionPreferences: () => ({ ...defaultVaultPreferences.connection, shareConnections, ...(reconnect && { autoReconnect: true, reconnect }) }),
    ...(commands && { deviceProxy: { commands, currentRoute: (id: string) => connectionIdentity(routeForHost(new Map(hosts.list().map((host) => [host.id, host])), id)) } }),
  });
  closers.push(() => {
    commands?.dispose();
    mgr.disposeAll();
  });
  const add = (port: number, over: Partial<SshHostProfile> = {}) => hosts.save({ name: `h${port}`, host: "127.0.0.1", port, user: "u", jumpHostIds: [], tags: [], connectTimeoutSec: 5, ...over });
  return { root, hosts, mgr, prompts, add, secretCalls, commands, changes };
}
const until = async (c: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!c() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
};

describe("主机配置", () => {
  test("校验：端口、主机名、用户；ACC-SH-04 跳板链循环被拒", () => {
    const { hosts, add } = setup();
    expect(() => add(0)).toThrow(/端口/);
    expect(() => add(22, { host: "a b" })).toThrow(/空格/);
    const a = add(2201);
    const b = add(2202, { jumpHostIds: [a.id] });
    expect(() => hosts.save({ ...a, jumpHostIds: [b.id] })).toThrowError(/循环/);
    expect(
      findJumpCycle(
        [
          { id: "a", jumpHostIds: ["b"] },
          { id: "b", jumpHostIds: ["a"] },
        ],
        "a",
      ),
    ).toEqual(["a", "b", "a"]);
  });
});

describe("连接与主机密钥", () => {
  test("missing identity accepts a single replacement at the original hop and waits for host trust before sending it", async () => {
    let attempts = 0;
    const server = await startFakeSsh({ password: "replacement", onAuth: () => attempts++ });
    const { mgr, add, root } = setup("original", "missing-identity");
    closers.push(server.close);
    const host = add(server.port);
    const connected = mgr.connect(host.id);
    const status = () => mgr.connectionStatuses()[0];
    await expect.poll(() => status()?.state).toBe("auth-waiting");
    const pending = status();
    if (pending?.state !== "auth-waiting") throw new Error("Expected local identity recovery");
    const { attemptId, hop, promptId, recovery } = pending.authPrompt;
    expect(recovery).toBe("identity-file-unavailable");
    expect(attempts).toBe(0);
    expect(mgr.decideAuthentication(attemptId, hop + 1, promptId, ["password", "replacement"])).toBe(false);
    expect(mgr.decideAuthentication(attemptId, hop, promptId, ["password", ""])).toBe(false);
    expect(mgr.decideAuthentication(attemptId, hop, promptId, ["password", "replacement"])).toBe(true);
    expect(mgr.decideAuthentication(attemptId, hop, promptId, ["password", "replacement"])).toBe(false);
    await expect.poll(() => status()?.state).toBe("waiting");
    const trust = status();
    if (trust?.state !== "waiting") throw new Error("Expected host fingerprint");
    expect(attempts).toBe(0);
    expect(mgr.decide(attemptId, hop, true, trust.prompt.promptId)).toBe(true);
    await connected;
    expect(attempts).toBeGreaterThan(0);
    expect(readFileSync(path.join(root, "audit", "2026-11.ndjson"), "utf8")).not.toContain("replacement");
    mgr.disconnect(host.id);
    const next = mgr.connect(host.id).catch((error: unknown) => error);
    await expect.poll(() => status()?.state).toBe("auth-waiting");
    const second = status();
    if (second?.state !== "auth-waiting") throw new Error("Expected a new recovery prompt");
    expect(second.authPrompt.promptId).not.toBe(promptId);
    expect(mgr.decideAuthentication(second.attemptId, hop, second.authPrompt.promptId, null)).toBe(true);
    expect(await next).toMatchObject({ code: "SSH_DISCONNECTED" });
  });

  test("disposing an SSH generation drops old prompts and suppresses late status events", async () => {
    const server = await startFakeSsh({ keyboardResponse: "one-time answer" });
    const { mgr, add, changes } = setup();
    closers.push(server.close);
    const host = add(server.port);
    const pending = mgr.connect(host.id).catch((error: unknown) => error);
    const current = () => mgr.connectionStatuses()[0];
    await expect.poll(() => current()?.state).toBe("waiting");
    const first = current();
    if (first?.state !== "waiting") throw new Error("missing host key");
    expect(mgr.decide(first.attemptId, 0, true, first.prompt.promptId)).toBe(true);
    await expect.poll(() => current()?.state).toBe("auth-waiting");
    const auth = current();
    if (auth?.state !== "auth-waiting") throw new Error("missing interactive authentication");
    changes.mockClear();
    mgr.disposeAll();
    expect(mgr.decideAuthentication(auth.attemptId, 0, auth.authPrompt.promptId, ["one-time answer"])).toBe(false);
    expect(await pending).toMatchObject({ code: "SSH_DISCONNECTED" });
    await expect.poll(() => server.closed()).toBe(1);
    expect(mgr.connectionStatuses()).toEqual([]);
    expect(changes).not.toHaveBeenCalled();
  });

  test("a file view dials an unconnected host and releases only its own transport", async () => {
    const server = await startFakeSsh();
    const { mgr, add } = setup();
    const files = new FileSessions(mgr);
    closers.push(() => files.dispose(), server.close);
    server.fs.files.set("/home/test/isolated.txt", Buffer.from("file view connection"));
    const host = add(server.port);
    const opening = files.openIndependent(host.id, new AbortController().signal);
    const wait = () => mgr.connectionStatuses().find(({ purpose }) => purpose === "files");
    await expect.poll(() => wait()?.state).toBe("waiting");
    const status = wait();
    if (status?.state !== "waiting") throw new Error("missing fingerprint");
    expect(mgr.decide(status.attemptId, 0, true, status.prompt.promptId)).toBe(true);
    const session = await opening;
    expect(mgr.isConnected(host.id)).toBe(false);
    expect(mgr.listShells(host.id)).toEqual([]);
    await expect(mgr.sftpList(files.source({ fileSessionId: session.fileSessionId }), "")).resolves.toMatchObject({ entries: expect.arrayContaining([expect.objectContaining({ name: "isolated.txt" })]) });
    await mgr.connect(host.id);
    expect(server.conns).toHaveLength(2);
    files.close(session.fileSessionId);
    await expect.poll(() => server.closed()).toBe(1);
    expect(mgr.isConnected(host.id)).toBe(true);
    expect(wait()).toBeUndefined();
  });

  test("isolated panes keep their own trust requests, file origins and monitor transport", async () => {
    const server = await startFakeSsh();
    const { mgr, add } = setup("pw", false, false, false);
    closers.push(server.close);
    const host = add(server.port);
    const pane = { hostId: host.id, target: workspaceTarget([host]) };
    const firstSlot = mgr.newPaneSlot(host.id);
    const secondSlot = mgr.newPaneSlot(host.id);
    const signal = new AbortController().signal;
    const first = mgr.openWorkspaceShell(pane, signal, () => undefined, firstSlot);
    const second = mgr.openWorkspaceShell(pane, signal, () => undefined, secondSlot);
    await expect.poll(() => [firstSlot, secondSlot].every((slot) => mgr.workspacePrompt(slot, pane.target))).toBe(true);
    const firstPrompt = mgr.workspacePrompt(firstSlot, pane.target)!;
    const secondPrompt = mgr.workspacePrompt(secondSlot, pane.target)!;
    expect(firstPrompt.attemptId).not.toBe(secondPrompt.attemptId);
    expect(mgr.decide(firstPrompt.attemptId, 0, true, secondPrompt.promptId, false)).toBe(false);
    expect(mgr.decide(firstPrompt.attemptId, 0, true, firstPrompt.promptId, false)).toBe(true);
    const firstShell = await first;
    expect(mgr.workspacePrompt(secondSlot, pane.target)).toEqual(secondPrompt);
    expect(mgr.decide(secondPrompt.attemptId, 0, true, secondPrompt.promptId, false)).toBe(true);
    const secondShell = await second;
    const firstOrigin = mgr.fileOrigin(host.id, firstShell.id)!;
    const secondOrigin = mgr.fileOrigin(host.id, secondShell.id)!;
    expect(firstOrigin.connectionId).not.toBe(secondOrigin.connectionId);
    expect(mgr.monitorPane(host.id, secondShell.id).id).toBe(secondOrigin.connectionId);
    mgr.closeOwnedConnection(firstSlot);
    await expect.poll(() => server.closed()).toBe(1);
    expect(mgr.hasFileConnection(host.id, firstOrigin.connectionId)).toBe(false);
    expect(mgr.hasFileConnection(host.id, secondOrigin.connectionId)).toBe(true);
    expect(mgr.shellInfo(firstShell.id)?.state).toBe("ended");
    expect(mgr.shellInfo(secondShell.id)?.state).toBe("running");
  });

  test("an unsaved quick connection authenticates, opens one shell and releases all temporary state", async () => {
    const srv = await startFakeSsh({ password: "one-time-fixture" });
    const { root, hosts, mgr, prompts, secretCalls } = setup();
    closers.push(srv.close);
    const id = randomUUID();
    const target = { user: "fixture", host: "127.0.0.1", port: srv.port };
    const { hostId } = mgr.startQuick(id, target, "one-time-fixture");
    expect(mgr.startQuick(id, target, "one-time-fixture")).toEqual({ hostId });
    await expect.poll(() => prompts.length).toBe(1);
    const waiting = mgr.quickStatus(id)?.status;
    if (waiting?.state !== "waiting") throw new Error("Expected quick host-key prompt");
    expect(mgr.decide(waiting.attemptId, 0, true, waiting.prompt.promptId, false)).toBe(true);
    await expect.poll(() => mgr.quickStatus(id)?.shellId).toMatch(/^ssh-local-quick-/u);
    const shell = mgr.quickStatus(id)!.shellId!;
    expect(mgr.connectionStatuses()).toEqual([]);
    expect(mgr.listShells()).toEqual([]);
    expect(hosts.list()).toEqual([]);
    expect(secretCalls).toEqual([]);
    expect(mgr.auditList()).toEqual([]);
    expect(() => readFileSync(path.join(root, "known_hosts"))).toThrow();
    const output: string[] = [];
    const terminal = mgr.attachShell(shell, { onData: (bytes) => output.push(bytes.toString()), onEnd: () => undefined });
    await expect.poll(() => output.join("")).toContain("welcome");
    terminal?.write(Buffer.from("exit\n"));
    await expect.poll(() => mgr.quickStatus(id)).toBeNull();
    await expect.poll(() => srv.closed()).toBe(1);
    expect(mgr.shellInfo(shell)).toBeUndefined();
    expect(mgr.closeQuick(id)).toBe(false);
  });

  test("a cancelled quick connection leaves no prompt and ignores stale confirmation", async () => {
    const srv = await startFakeSsh();
    const { mgr, prompts } = setup();
    closers.push(srv.close);
    const id = randomUUID();
    mgr.startQuick(id, { user: "fixture", host: "127.0.0.1", port: srv.port }, "pw");
    await expect.poll(() => prompts.length).toBe(1);
    const waiting = mgr.quickStatus(id)?.status;
    if (waiting?.state !== "waiting") throw new Error("Expected quick host-key prompt");
    expect(mgr.closeQuick(id)).toBe(true);
    expect(mgr.decide(waiting.attemptId, 0, true, waiting.prompt.promptId)).toBe(false);
    await expect.poll(() => srv.closed()).toBe(1);
    expect(mgr.quickStatus(id)).toBeNull();
  });

  test("quick targets accept hostnames and bracketed IPv6, and reject URL decorations", () => {
    expect(parseQuickEndpoint("alice@ssh.example.com")).toEqual({ user: "alice", host: "ssh.example.com", port: 22 });
    expect(parseQuickEndpoint("alice@[::1]:2222")).toEqual({ user: "alice", host: "::1", port: 2222 });
    for (const bad of ["ssh://alice@host", "alice@host/path", "alice@host:0", "alice@host:70000", "alice@::1"]) expect(parseQuickEndpoint(bad)).toBeUndefined();
  });

  test("ViaShell authenticates both hops and closes its dedicated shell", async () => {
    const target = await startFakeSsh();
    const direct = vi.fn(() => true);
    const closed = vi.fn();
    const jump = await startFakeSsh({ onInteractiveShell: relayToLoopback(target.port), denyDirectTcp: direct, onShellClose: closed });
    const { mgr, prompts, add } = setup();
    closers.push(jump.close, target.close);
    const first = add(jump.port);
    const last = add(target.port, { jumpHostIds: [first.id], viaShell: true });
    const pending = mgr.connect(last.id);
    for (const hop of [0, 1]) {
      await expect.poll(() => prompts[hop]?.hop).toBe(hop);
      expect(mgr.decide(prompts[hop]!.attemptId, hop, true)).toBe(true);
    }
    await pending;
    expect(direct).not.toHaveBeenCalled();
    expect(mgr.connectionStatuses()[0]?.route?.[1]?.viaShell).toBe(true);
    await expect(mgr.exec(last.id, "echo relay-ok")).resolves.toMatchObject({ stdout: "relay-ok\n" });
    mgr.disconnect(last.id);
    await expect.poll(() => closed.mock.calls.length).toBe(1);
    await expect.poll(() => target.closed()).toBe(1);
  });

  test.each(["cancelled", "timeout"] as const)("ViaShell cleans up a waiting shell when %s", async (reason) => {
    const waiting = vi.fn();
    const jump = await startFakeSsh({ onInteractiveShell: waiting });
    const { mgr, prompts, add } = setup();
    closers.push(jump.close);
    const first = add(jump.port);
    const last = add(2222, { jumpHostIds: [first.id], viaShell: true, connectTimeoutSec: 1 });
    const pending = mgr.connect(last.id).catch((error: unknown) => error);
    await expect.poll(() => prompts.length).toBe(1);
    expect(mgr.decide(prompts[0]!.attemptId, 0, true)).toBe(true);
    await expect.poll(() => waiting.mock.calls.length).toBe(1);
    if (reason === "cancelled") mgr.disconnect(last.id);
    expect(await pending).toMatchObject({ details: { stage: "forwarding", reason } });
    await expect.poll(() => jump.closed()).toBe(1);
  });

  test.skipIf(process.platform !== "linux")("approved ProxyCommand uses the first hop, rejects a stale route and closes on revocation", async () => {
    const jump = await startFakeSsh();
    const target = await startFakeSsh();
    const { root, hosts, mgr, add, commands, prompts } = setup("pw", false, true);
    closers.push(jump.close, target.close);
    const first = add(jump.port);
    const last = add(target.port, { jumpHostIds: [first.id] });
    const script = path.join(root, "proxy.cjs");
    writeFileSync(script, `
      const [host, port, user] = process.argv.slice(2);
      if (host !== "127.0.0.1" || port !== "${jump.port}" || user !== "u") process.exit(1);
      const peer = require("node:net").connect(Number(port), host);
      peer.on("error", () => process.exit(1));
      process.stdin.pipe(peer).pipe(process.stdout);
      peer.once("close", () => process.exit(0));
    `);
    const approval = commands!.approve([first, last], null, { executable: process.execPath, arguments: [script, "%h", "%p", "%r"] });
    const external = mgr.openExternalConnection([first, last], new AbortController().signal, () => undefined, () => undefined, () => undefined);
    await expect(external.ready).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(jump.conns).toHaveLength(0);
    const pending = mgr.connect(last.id);
    for (const hop of [0, 1]) {
      await expect.poll(() => prompts[hop]?.hop).toBe(hop);
      expect(mgr.decide(prompts[hop]!.attemptId, hop, true)).toBe(true);
    }
    await pending;
    expect(mgr.connectionStatuses()[0]?.route?.[0]?.outboundProxy).toEqual({ source: "command" });
    await expect(mgr.exec(last.id, "echo proxy-ok")).resolves.toMatchObject({ stdout: "proxy-ok\n" });
    const { id, name, host, port, user, jumpHostIds, tags } = first;
    hosts.save({ id, name: name + " updated", host, port, user, jumpHostIds, tags });
    mgr.disconnect(last.id);
    await expect(mgr.connect(last.id)).rejects.toMatchObject({ message: expect.stringContaining("重新批准") });
    await expect.poll(() => jump.closed()).toBe(1);
    const current = hosts.list().find((candidate) => candidate.id === first.id)!;
    const refreshed = commands!.approve([current, last], approval.revision, approval.command);
    await mgr.connect(last.id);
    commands!.revoke(last.id, refreshed.revision);
    await expect.poll(() => mgr.isConnected(last.id)).toBe(false);
    await expect.poll(() => [jump.closed(), target.closed()]).toEqual([2, 2]);
    expect(commands!.read(last.id)).toBeUndefined();
  });

  test("关闭最后一个工作区等待后旧指纹不能再授权，共享拨号保留给未关闭的工作区", async () => {
    const srv = await startFakeSsh();
    closers.push(srv.close);
    const { mgr, add, secretCalls } = setup();
    const host = add(srv.port);
    const target = workspaceTarget([host]);
    const first = new AbortController();
    const second = new AbortController();
    const pane = { hostId: host.id, target };
    const a = mgr.openWorkspaceShell(pane, first.signal, () => undefined).catch((error: unknown) => error);
    const b = mgr.openWorkspaceShell(pane, second.signal, () => undefined).catch((error: unknown) => error);
    await until(() => Boolean(mgr.workspacePrompt(host.id, target)));
    const prompt = mgr.workspacePrompt(host.id, target)!;
    expect(prompt?.promptId).toBeTruthy();
    first.abort();
    expect(mgr.workspacePrompt(host.id, target)?.promptId).toBe(prompt.promptId);
    second.abort();
    expect(mgr.decide(prompt.attemptId, prompt.hop, true, prompt.promptId)).toBe(false);
    await expect(a).resolves.toMatchObject({ code: "SSH_DISCONNECTED" });
    await expect(b).resolves.toMatchObject({ code: "SSH_DISCONNECTED" });
    expect(secretCalls).toHaveLength(1);
    expect(mgr.isConnected(host.id)).toBe(false);
    expect(mgr.listShells(host.id)).toEqual([]);
  });
  test("ACC-SH-01 首次连接弹出指纹，接受后连接成功并写入 known_hosts；再次连接无提示", async () => {
    const srv = await startFakeSsh();
    closers.push(srv.close);
    const { mgr, prompts, add, root } = setup();
    const h = add(srv.port);
    const p = mgr.connect(h.id);
    await until(() => prompts.length > 0);
    expect(prompts[0]).toMatchObject({ hop: 0, reason: "first" });
    expect(prompts[0]?.fingerprint).toMatch(/^SHA256:/);
    expect(mgr.decide(prompts[0]!.attemptId, 0, true)).toBe(true);
    await p;
    expect(mgr.isConnected(h.id)).toBe(true);
    expect(readFileSync(path.join(root, "known_hosts"), "utf8")).toContain(`[127.0.0.1]:${srv.port} ssh-ed25519`);
    mgr.disconnect(h.id);
    prompts.length = 0;
    await mgr.connect(h.id);
    expect(prompts).toHaveLength(0);
  });
  test("取消 → 连接失败；超时未决定也视为取消；迟到/未知决定被忽略", async () => {
    const srv = await startFakeSsh();
    closers.push(srv.close);
    const { mgr, prompts, add } = setup();
    const h = add(srv.port);
    const p = mgr.connect(h.id).catch((e: Error) => e);
    await until(() => prompts.length > 0);
    mgr.decide(prompts[0]!.attemptId, 0, false);
    expect(await p).toMatchObject({ code: "SSH_DISCONNECTED" });
    expect(mgr.decide("att-unknown", 0, true)).toBe(false);
    prompts.length = 0;
    const timedOut = await mgr.connect(h.id).catch((e: Error) => e); // decisionTimeoutMs=1000
    expect(timedOut).toMatchObject({ code: "SSH_DISCONNECTED", message: "等待主机指纹确认超时", details: { hop: 0 } });
    expect(mgr.connectionStatuses()).toMatchObject([{ hostId: h.id, state: "failed", hop: 0 }]);
    expect(mgr.decide(prompts[0]!.attemptId, 0, true)).toBe(false);
  });
  test("等待首次确认时信任记录发生变化，决定须重新校验并阻止认证", async () => {
    const auth: string[] = [];
    const srv = await startFakeSsh({ onAuth: (_u, method) => auth.push(method) });
    closers.push(srv.close);
    const { mgr, prompts, add, root } = setup();
    const h = add(srv.port);
    const result = mgr.connect(h.id).catch((error: unknown) => error);
    await until(() => prompts.length > 0);
    const offered = mgr.connectionStatuses()[0];
    if (offered?.state !== "waiting") throw new Error("预期等待主机指纹");
    const peer = utils.parseKey(genHostKey());
    const key = Array.isArray(peer) ? peer[0] : peer;
    if (!key || key instanceof Error) throw new Error("测试主机密钥无法解析");
    const file = path.join(root, "known_hosts");
    const original = `[127.0.0.1]:${srv.port} ssh-ed25519 ${key.getPublicSSH().toString("base64")}\n`;
    writeFileSync(file, original);
    expect(mgr.decide(offered.attemptId, 0, true, "old-prompt")).toBe(false);
    expect(mgr.decide(offered.attemptId, 0, true, offered.prompt.promptId)).toBe(true);
    expect(await result).toMatchObject({ code: "SSH_HOST_KEY_MISMATCH", details: { hop: 0 } });
    expect(mgr.connectionStatuses()).toMatchObject([{ hostId: h.id, state: "key-changed", prompt: { fingerprint: srv.fingerprint } }]);
    expect(readFileSync(file, "utf8")).toBe(original);
    expect(auth).toEqual([]);
  });
  test("ACC-SH-02 已记录的主机密钥与服务器不符 → SSH_HOST_KEY_MISMATCH，且没有发送任何认证", async () => {
    const auth: string[] = [];
    const srv = await startFakeSsh({ onAuth: (u, m) => auth.push(`${u}:${m}`) });
    closers.push(srv.close);
    const { mgr, add, root } = setup();
    const other = utils.parseKey(genHostKey());
    const blob = (Array.isArray(other) ? other[0] : other) as { getPublicSSH(): Buffer };
    writeFileSync(path.join(root, "known_hosts"), `[127.0.0.1]:${srv.port} ssh-ed25519 ${blob.getPublicSSH().toString("base64")}\n`);
    const h = add(srv.port);
    await expect(mgr.connect(h.id)).rejects.toMatchObject({ code: "SSH_HOST_KEY_MISMATCH" });
    expect(auth).toEqual([]);
    expect(mgr.isConnected(h.id)).toBe(false);
  });

  test("ACC-SH-03 经跳板：两跳都首次连接依次提示（标明第 1、2 跳）；取消第二个则整体失败且跳板被关闭", async () => {
    const jump = await startFakeSsh();
    const dest = await startFakeSsh();
    closers.push(jump.close, dest.close);
    const { mgr, prompts, add } = setup();
    const j = add(jump.port);
    const t = add(dest.port, { jumpHostIds: [j.id] });
    const p = mgr.connect(t.id).catch((e: Error) => e);
    await until(() => prompts.length >= 1);
    expect(prompts[0]?.hop).toBe(0);
    mgr.decide(prompts[0]!.attemptId, 0, true);
    await until(() => prompts.length >= 2);
    expect(prompts[1]?.hop).toBe(1);
    mgr.decide(prompts[1]!.attemptId, 1, false); // 取消第二个
    expect(await p).toMatchObject({ code: "SSH_DISCONNECTED" });
    await until(() => jump.closed() >= 1);
    expect(jump.closed()).toBeGreaterThanOrEqual(1); // 跳板连接已被关闭
    expect(mgr.isConnected(t.id)).toBe(false);
  });

  test("跳板全部接受后可连接目标并执行命令", async () => {
    const jump = await startFakeSsh();
    const dest = await startFakeSsh();
    closers.push(jump.close, dest.close);
    const { mgr, prompts, add } = setup();
    const j = add(jump.port);
    const t = add(dest.port, { jumpHostIds: [j.id] });
    const p = mgr.connect(t.id);
    for (let hop = 0; hop < 2; hop++) {
      await until(() => prompts.length > hop);
      mgr.decide(prompts[hop]!.attemptId, hop, true);
    }
    await p;
    expect((await mgr.exec(t.id, "echo 你好")).stdout.trim()).toBe("你好");
  });

  test("本机所有者认证不可用时不拨号，审计中没有密码", async () => {
    const auth: string[] = [];
    const srv = await startFakeSsh({ onAuth: (u, m) => auth.push(m) });
    closers.push(srv.close);
    const { mgr, add } = setup("pw", true);
    const h = add(srv.port);
    await expect(mgr.connect(h.id)).rejects.toMatchObject({ code: "SSH_AUTH_FAILED" });
    expect(srv.conns).toHaveLength(0);
    expect(auth).toEqual([]);
    expect(JSON.stringify(mgr.auditList())).not.toContain("pw");
  });

  test("认证失败 → SSH_AUTH_FAILED", async () => {
    const srv = await startFakeSsh({ password: "right" });
    closers.push(srv.close);
    const { mgr, prompts, add } = setup("wrong");
    const h = add(srv.port);
    const p = mgr.connect(h.id).catch((e: Error) => e);
    await until(() => prompts.length > 0);
    mgr.decide(prompts[0]!.attemptId, 0, true);
    expect(await p).toMatchObject({ code: "SSH_AUTH_FAILED" });
  });
});

describe("Exec", () => {
  async function connected() {
    const srv = await startFakeSsh();
    closers.push(srv.close);
    const ctx = setup();
    const h = ctx.add(srv.port);
    const p = ctx.mgr.connect(h.id);
    await until(() => ctx.prompts.length > 0);
    ctx.mgr.decide(ctx.prompts[0]!.attemptId, 0, true);
    await p;
    return { ...ctx, h };
  }
  test("stdout/stderr 分离、退出码、耗时；未连接 → SSH_DISCONNECTED；空命令拒绝", async () => {
    const { mgr, h } = await connected();
    const ok = await mgr.exec(h.id, "echo hi");
    expect(ok).toMatchObject({ stdout: "hi\n", exitCode: 0, interrupted: false });
    const bad = await mgr.exec(h.id, "fail now");
    expect(bad).toMatchObject({ stderr: "boom\n", exitCode: 3 });
    await expect(mgr.exec("host-none", "echo")).rejects.toMatchObject({ code: "SSH_DISCONNECTED" });
    await expect(mgr.exec(h.id, "  ")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  test("ACC-SH-06 sleep 30 被中断：标记 interrupted，连接仍可用", async () => {
    const { mgr, h } = await connected();
    const run = mgr.exec(h.id, "sleep 30", { execId: "exec-fixed1" });
    await new Promise((r) => setTimeout(r, 200));
    expect(mgr.cancel("exec-fixed1")).toBe(true);
    const r = await run;
    expect(r.interrupted).toBe(true);
    expect(r.ms).toBeLessThan(5000);
    expect((await mgr.exec(h.id, "echo still")).stdout.trim()).toBe("still");
    expect(mgr.cancel("exec-fixed1")).toBe(false);
  });
  test("超时自动中断；审计记录动作且不含输出", async () => {
    const { mgr, h } = await connected();
    const r = await mgr.exec(h.id, "sleep 30", { timeoutSec: 1 });
    expect(r.interrupted).toBe(true);
    const log = mgr.auditList(h.id);
    expect(log.map((a) => a.action)).toEqual(expect.arrayContaining(["connect", "exec"]));
  });
});

describe("并发连接与审计", () => {
  test("unexpected loss retries with backoff, succeeds on the next attempt, and allows cancellation", { timeout: 9000 }, async () => {
    const hostKey = genHostKey();
    const first = await startFakeSsh({ hostKey });
    const { mgr, prompts, add } = setup("pw", false, false, true, { attempts: 3, intervalSec: 1, maxDelaySec: 2 });
    const host = add(first.port);
    const connected = mgr.connect(host.id);
    await until(() => prompts.length > 0);
    expect(mgr.decide(prompts[0]!.attemptId, 0, true)).toBe(true);
    await connected;
    await first.close();
    await expect.poll(() => mgr.reconnectStatus(host.id), { timeout: 1500 }).toEqual({ attempt: 1, total: 3, nextAt: "2026-11-11T00:00:01.000Z" });
    await expect.poll(() => mgr.reconnectStatus(host.id), { timeout: 2500 }).toEqual({ attempt: 2, total: 3, nextAt: "2026-11-11T00:00:02.000Z" });
    const restored = await startFakeSsh({ hostKey, port: first.port });
    closers.push(restored.close);
    await expect.poll(() => mgr.isConnected(host.id) && mgr.reconnectStatus(host.id) === undefined, { timeout: 3500 }).toBe(true);
    expect(restored.conns).toHaveLength(1);
    await mgr.connect(host.id);
    restored.conns[0]!.end();
    await expect.poll(() => mgr.reconnectStatus(host.id)).toMatchObject({ attempt: 1 });
    mgr.disconnect(host.id);
    expect(mgr.reconnectStatus(host.id)).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 1050));
    expect(restored.conns).toHaveLength(1);
  });

  test("同一主机并发 connect 合并为一次（只提示一次、只建一个连接）", async () => {
    const srv = await startFakeSsh();
    closers.push(srv.close);
    const { mgr, prompts, add } = setup();
    const h = add(srv.port);
    const a = mgr.connect(h.id);
    const b = mgr.connect(h.id);
    await until(() => prompts.length > 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(prompts).toHaveLength(1);
    mgr.decide(prompts[0]!.attemptId, 0, true);
    expect((await a).attemptId).toBe((await b).attemptId);
    expect(srv.conns).toHaveLength(1);
  });
  test("审计不记录命令原文（可能含口令）", async () => {
    const srv = await startFakeSsh();
    closers.push(srv.close);
    const { mgr, prompts, add } = setup();
    const h = add(srv.port);
    const p = mgr.connect(h.id);
    await until(() => prompts.length > 0);
    mgr.decide(prompts[0]!.attemptId, 0, true);
    await p;
    await mgr.exec(h.id, "echo hunter2-PASSWORD");
    expect(JSON.stringify(mgr.auditList())).not.toContain("hunter2");
  });
});

describe("Shell（ACC-SH-05）", () => {
  async function connected() {
    const srv = await startFakeSsh();
    closers.push(srv.close);
    const ctx = setup();
    const h = ctx.add(srv.port);
    const p = ctx.mgr.connect(h.id);
    await until(() => ctx.prompts.length > 0);
    ctx.mgr.decide(ctx.prompts[0]!.attemptId, 0, true);
    await p;
    return { ...ctx, h, srv };
  }
  const view = () => {
    const v = {
      out: "",
      ended: 0,
      onData: (b: Buffer) => {
        v.out += b.toString();
      },
      onEnd: () => {
        v.ended++;
      },
    };
    return v;
  };

  test("打开 shell、输入输出；关闭视图（detach）不结束 shell，重新打开回到同一 shell 并回放最近输出", async () => {
    const { mgr, h } = await connected();
    const sh = await mgr.openShell(h.id, { cols: 100, rows: 30 });
    expect(sh).toMatchObject({ state: "running", hostId: h.id });
    expect(sh.id).toMatch(/^ssh-/);
    const v1 = view();
    const a1 = mgr.attachShell(sh.id, v1)!;
    await until(() => v1.out.includes("welcome"));
    a1.write(Buffer.from("hello\n"));
    await until(() => v1.out.includes("ECHO:hello"));
    a1.resize(120, 40);
    a1.detach(); // 关闭视图
    expect(mgr.listShells(h.id)[0]?.state).toBe("running"); // 仍在运行
    const v2 = view();
    const a2 = mgr.attachShell(sh.id, v2)!;
    expect(v2.out).toContain("ECHO:hello"); // 回放
    a2.write(Buffer.from("again\n"));
    await until(() => v2.out.includes("ECHO:again"));
    a2.detach();
  });
  test("结束 shell 才关闭 channel；断开连接后所有 shell 变为已结束，重连后不会绑定旧 shell", async () => {
    const { mgr, h, prompts } = await connected();
    const a = await mgr.openShell(h.id);
    const b = await mgr.openShell(h.id);
    const v = view();
    mgr.attachShell(a.id, v);
    expect(mgr.closeShell(a.id)).toBe(true);
    await until(() => v.ended > 0);
    expect(mgr.listShells(h.id).find((s) => s.id === a.id)?.state).toBe("ended");
    expect(mgr.listShells(h.id).find((s) => s.id === b.id)?.state).toBe("running");
    mgr.disconnect(h.id);
    expect(mgr.listShells(h.id).every((s) => s.state === "ended")).toBe(true);
    prompts.length = 0;
    await mgr.connect(h.id);
    expect(mgr.listShells(h.id).find((s) => s.id === b.id)?.state).toBe("ended"); // 旧 shell 不会复活
    const c = await mgr.openShell(h.id);
    expect(c.id).not.toBe(b.id);
    expect(mgr.attachShell("ssh-none", view())).toBeNull();
  });
  test("未连接 → SSH_DISCONNECTED；shell 里 exit 时通知查看者结束", async () => {
    const { mgr, h } = await connected();
    await expect(mgr.openShell("host-none")).rejects.toMatchObject({ code: "SSH_DISCONNECTED" });
    const sh = await mgr.openShell(h.id);
    const v = view();
    const a = mgr.attachShell(sh.id, v)!;
    a.write(Buffer.from("exit\n"));
    await until(() => v.ended > 0);
    expect(v.ended).toBeGreaterThan(0);
  });
});

test("交互认证按当前尝试、跳点和轮次消费，多问 OTP 不写审计", async () => {
  const { Server } = await import("ssh2");
  const hostKey = genHostKey();
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    client.on("error", () => undefined);
    client.on("authentication", (ctx) => {
      if (ctx.method !== "keyboard-interactive") return ctx.reject(["keyboard-interactive"]);
      ctx.prompt(
        [
          { prompt: "Account alias", echo: true },
          { prompt: "Phrase", echo: false },
        ],
        (first) => {
          if (first.join("/") !== "fixture/only-for-this-round") return ctx.reject();
          ctx.prompt([{ prompt: "OTP", echo: false }], (second) => (second[0] === "042913" ? ctx.accept() : ctx.reject()));
        },
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { mgr, add } = setup();
  closers.push(() => {
    server.close();
  });
  const host = add((server.address() as import("node:net").AddressInfo).port);
  const { attemptId } = mgr.start(host.id);
  const read = () => mgr.connectionStatuses().find((status) => status.attemptId === attemptId);
  await expect.poll(() => read()?.state).toBe("waiting");
  const waiting = read();
  if (waiting?.state !== "waiting") throw new Error("Missing host key prompt");
  expect(mgr.decide(attemptId, 0, true, waiting.prompt.promptId, false)).toBe(true);
  await expect.poll(() => read()?.state).toBe("auth-waiting");
  const first = read();
  if (first?.state !== "auth-waiting") throw new Error("Missing authentication prompt");
  expect(first.authPrompt.questions.map(({ echo }) => echo)).toEqual([true, false]);
  expect(mgr.decideAuthentication(attemptId, 1, first.authPrompt.promptId, ["fixture", "only-for-this-round"])).toBe(false);
  expect(mgr.decideAuthentication(attemptId, 0, first.authPrompt.promptId, ["fixture"])).toBe(false);
  expect(mgr.decideAuthentication(attemptId, 0, first.authPrompt.promptId, ["fixture", "only-for-this-round"])).toBe(true);
  await expect
    .poll(() => {
      const status = read();
      return status?.state === "auth-waiting" && status.authPrompt.promptId !== first.authPrompt.promptId;
    })
    .toBe(true);
  const second = read();
  if (second?.state !== "auth-waiting") throw new Error("Missing OTP prompt");
  expect(mgr.decideAuthentication(attemptId, 0, first.authPrompt.promptId, ["042913"])).toBe(false);
  expect(mgr.decideAuthentication(attemptId, 0, second.authPrompt.promptId, ["042913"])).toBe(true);
  await expect.poll(() => read()?.state).toBe("connected");
  expect(JSON.stringify(mgr.auditList())).not.toMatch(/only-for-this-round|042913/);
});

function recordingFixture() {
  vi.useFakeTimers({ toFake: ["performance", "Date"] });
  closers.push(() => {
    vi.useRealTimers();
  });
  const directory = path.join(tmp(), "recordings");
  const wires = new Map<string, (bytes: Buffer) => void>();
  const manager = {
    shellInfo(id: string) {
      return { id, state: "running" as const, hostId: "fixture", name: "shell", createdAt: new Date().toISOString() };
    },
    attachShell(id: string, view: { onData(data: Buffer): void; onEnd(): void }, replay = true) {
      wires.set(id, view.onData);
      if (replay) view.onData(Buffer.from("输出在录制开始前"));
      return {
        detach: () => {
          wires.delete(id);
        },
        write: () => undefined,
        resize: () => undefined,
      };
    },
  };
  const reopen = () => new TerminalRecordings(manager, directory);
  const records = reopen();
  function start(shellId: string) {
    const { id } = records.start(shellId);
    const emit = wires.get(shellId)!;
    return { id, emit, file: path.join(directory, id + ".json") };
  }
  return { records, reopen, start, wires };
}

test("录制从明确开始处按时间捕获 UTF-8 输出，停止后隔离各会话", () => {
  const { records, reopen, start, wires } = recordingFixture();
  const a = start("ssh-record-a");
  const b = start("ssh-record-b");
  const encoded = Buffer.from("\x1b[31m中🙂\x1b]0;title-");
  vi.advanceTimersByTime(100);
  a.emit(encoded.subarray(0, 7));
  b.emit(Buffer.from("独立会话"));
  vi.advanceTimersByTime(40);
  a.emit(encoded.subarray(7));
  const opening = "中🙂";
  expect(records.read(a.id)).toMatchObject({ text: opening, summary: { endedAt: null } });
  expect(records.read(a.id).timeline).toBeUndefined();

  vi.advanceTimersByTime(160);
  const closing = "\n<b>原样</b> https://example.invalid/record";
  a.emit(Buffer.from("ignored\x07\x1b[0m" + closing));
  vi.advanceTimersByTime(200);
  records.stop("ssh-record-a");
  expect(wires.has("ssh-record-a")).toBe(false);
  a.emit(Buffer.from("录制已停止"));

  vi.advanceTimersByTime(100);
  b.emit(Buffer.from("继续"));
  records.stop("ssh-record-b");
  const reopened = reopen();
  expect(reopened.list("ssh-record-a").map(({ id }) => id)).toEqual([a.id]);
  expect(reopened.list("ssh-record-b").map(({ id }) => id)).toEqual([b.id]);
  expect(reopened.read(a.id)).toMatchObject({
    text: opening + closing,
    summary: { reason: "stopped", truncated: false },
    timeline: {
      durationMs: 500,
      checkpoints: [
        { atMs: 140, end: opening.length },
        { atMs: 300, end: (opening + closing).length },
      ],
    },
  });
  expect(reopened.read(b.id)).toMatchObject({
    text: "独立会话继续",
    timeline: {
      durationMs: 600,
      checkpoints: [
        { atMs: 100, end: 4 },
        { atMs: 600, end: 6 },
      ],
    },
  });
});

test("录制读取保留旧文本和时间轴损坏时的文本", () => {
  const { records, reopen, start } = recordingFixture();
  const { id, file } = start("ssh-record-legacy");
  vi.advanceTimersByTime(100);
  const summary = records.stop("ssh-record-legacy");
  const text = "旧🙂日志\nhttps://example.invalid/legacy";
  writeFileSync(file, JSON.stringify({ summary, text }));
  expect(reopen().read(id)).toEqual({ summary, text });

  // This index points into the middle of the emoji's surrogate pair.
  const timeline = {
    durationMs: 100,
    checkpoints: [
      { atMs: 50, end: 2 },
      { atMs: 80, end: text.length },
    ],
  };
  writeFileSync(file, JSON.stringify({ summary, text, timeline }));
  expect(reopen().read(id)).toEqual({ summary, text });
});

test("录制保存失败后维持原记录和停止点，可以重试保存", () => {
  const { records, reopen, start } = recordingFixture();
  const shellId = "ssh-record-retry";
  const { id, emit, file } = start(shellId);
  vi.advanceTimersByTime(20);
  emit(Buffer.from("保存前的输出"));
  vi.advanceTimersByTime(20);
  mkdirSync(file);
  expect(() => records.stop(shellId)).toThrow();
  expect(records.list(shellId)).toEqual([expect.objectContaining({ id, savePending: true })]);
  expect(records.read(id)).toMatchObject({ text: "保存前的输出", summary: { savePending: true }, timeline: { durationMs: 40 } });
  expect(records.start(shellId)).toMatchObject({ id, savePending: true });
  emit(Buffer.from("停止后的输出"));
  vi.advanceTimersByTime(100);
  rmSync(file, { recursive: true });
  expect(records.stop(shellId)).not.toHaveProperty("savePending");
  const saved = reopen().read(id);
  expect(saved).toMatchObject({ text: "保存前的输出", summary: { id, reason: "stopped" }, timeline: { durationMs: 40 } });
  expect(saved.summary).not.toHaveProperty("savePending");
});

test("密集录制的时间轴受限，截断保留字节上限和完整字符", () => {
  const { records, reopen, start } = recordingFixture();
  const { id, emit, file } = start("ssh-record-dense");
  const count = maxRecordingCheckpoints + 10;
  const byte = Buffer.from("\n");
  for (let i = 0; i < count; ++i) {
    vi.advanceTimersByTime(1);
    emit(byte);
  }
  vi.advanceTimersByTime(10);
  const maxBytes = 256 * 1024;
  emit(Buffer.from("\n".repeat(maxBytes - count - 2) + "中"));
  vi.advanceTimersByTime(10);
  records.stop("ssh-record-dense");
  const content = reopen().read(id);
  expect(content.summary.truncated).toBe(true);
  expect(content.text).toBe("\n".repeat(maxBytes - 2));
  expect(content.timeline?.durationMs).toBe(count + 20);
  expect(content.timeline?.checkpoints.length).toBeLessThanOrEqual(maxRecordingCheckpoints);
  expect(content.timeline?.checkpoints.at(-1)).toEqual({ atMs: count + 10, end: maxBytes - 2 });
  expect(readFileSync(file).length).toBeLessThan(7 * maxBytes);
});
