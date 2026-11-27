import { lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { FileSessions } from "../src/engine/file-sessions.js";
import { ownedHosts } from "./owned-hosts.js";
import { SshManager } from "../src/engine/manager.js";
import { Transfers } from "../src/engine/transfers.js";
import { TransferRecovery } from "../src/engine/transfer-recovery.js";
import type { TransferJob } from "../src/shared/transfers.js";
import { startFakeSsh, type FakeSshOptions } from "./fake-server.js";

async function fixture(trackRecovery = false) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "huhu-transfer-publication-")));
  const hosts = ownedHosts();
  const servers: Awaited<ReturnType<typeof startFakeSsh>>[] = [];
  const manager = new SshManager({
    hosts,
    knownHostsFile: path.join(root, "known_hosts"),
    auditDir: path.join(root, "audit"),
    now: () => new Date(),
    withManagedAuth: (_host, connect) => connect({ password: "pw" }),
    decisionTimeoutMs: 2500,
    publish: (type, payload) => {
      if (type !== "ssh.hostKeyPrompt") return;
      const { attemptId } = payload as { attemptId: string };
      queueMicrotask(() => manager.decide(attemptId, 0, true));
    },
  });
  const sessions = new FileSessions(manager);
  const recovery = new TransferRecovery(path.join(root, "recovery.json"), "fixture-vault");
  const makeQueue = (track: boolean) => new Transfers(sessions, manager, () => {}, undefined, false, track ? recovery : undefined);
  const queue = makeQueue(trackRecovery);
  async function endpoint(options: FakeSshOptions = {}) {
    const server = await startFakeSsh(options);
    servers.push(server);
    const host = hosts.save({
      name: `fixture-${servers.length}`,
      host: "127.0.0.1",
      port: server.port,
      user: "fixture",
      tags: [],
      jumpHostIds: [],
      connectTimeoutSec: 4,
    });
    await manager.connect(host.id);
    const session = sessions.open({ hostId: host.id, attached: true });
    return { server, host, session, file: (filePath: string) => ({ kind: "remote" as const, path: filePath, fileSessionId: session.fileSessionId }) };
  }
  const find = (id: string) => queue.list().jobs.find(({ transferId }) => transferId === id);
  const state = (id: string, wanted: TransferJob["state"]) => vi.waitFor(() => expect(find(id)?.state).toBe(wanted), { timeout: 7000, interval: 12 });
  return {
    manager,
    queue,
    reopenQueue: () => makeQueue(true),
    endpoint,
    find,
    state,
    localDirectory: (sessionId: string) => sessions.localList(sessionId, [], root),
    async close() {
      queue.dispose();
      sessions.dispose();
      manager.disposeAll();
      await Promise.all(servers.map((server) => server.close()));
      await rm(root, { recursive: true, force: true });
    },
  };
}

const source = "/home/test/source";
const target = "/home/test/destination";
const fresh = Buffer.from("new published remote file");
const original = Buffer.from("old remote bytes");
const temporary = (files: Map<string, Buffer>) => [...files.keys()].filter((key) => key.includes(".huhu-transfer-"));
const isPublication = (from: string, to: string) => from.endsWith(".part") && to === target;

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function readGate() {
  return { entered: latch(), released: latch() };
}

test("a new Engine sees one terminal outcome for an interrupted transfer and cannot replay its origin", async () => {
  const f = await fixture(true);
  const gate = readGate();
  try {
    const input = await f.endpoint();
    const output = await f.endpoint({
      waitWriteFile: () => {
        gate.entered.resolve();
        return gate.released.promise;
      },
    });
    input.server.fs.files.set(source, fresh);
    const { transferId } = f.queue.start({ source: input.file(source), target: output.file(target) });
    await gate.entered.promise;
    expect(f.find(transferId)?.state).toBe("running");
    for (let restart = 0; restart < 2; restart++) {
      const reopened = f.reopenQueue();
      expect(reopened.list().jobs).toEqual([expect.objectContaining({ transferId, state: "failed", message: expect.stringContaining("引擎异常退出") })]);
      expect(() => reopened.retry(transferId)).toThrow("重新发起并核对目标");
      expect(() => reopened.openOrigin(transferId)).toThrow("原文件会话已关闭");
      expect(output.server.fs.files.has(target)).toBe(false);
    }
  } finally {
    gate.released.resolve();
    await f.close();
  }
});

test("remote directory downloads complete ordinary children and report unsupported links in the same batch", async () => {
  const f = await fixture();
  try {
    const { server, session, file } = await f.endpoint();
    server.fs.dirs.add("/home/test/docs");
    server.fs.dirs.add("/home/test/docs/sub");
    server.fs.files.set("/home/test/docs/sub/notes.txt", fresh);
    server.fs.links.set("/home/test/docs/notes-link", "/home/test/docs/sub/notes.txt");
    const local = await f.localDirectory(session.fileSessionId);
    const batch = await f.queue.startBatch(
      {
        source: file("/home/test"),
        target: { kind: "local", path: local.path },
        names: ["docs"],
        localFileSessionId: session.fileSessionId,
      },
      new AbortController().signal,
    );
    await vi.waitFor(() => expect(f.queue.findBatch(batch.batchId)?.state).toBe("partial"));
    const jobs = f.queue.list().jobs.filter(({ batchId }) => batchId === batch.batchId);
    expect(jobs.find(({ target }) => target.path === path.join(local.path, "docs", "sub", "notes.txt"))?.state).toBe("completed");
    expect(jobs.find(({ message }) => message?.includes("docs/notes-link"))).toMatchObject({ state: "failed", message: expect.stringContaining("未遍历链接") });
    expect(await readFile(path.join(local.path, "docs", "sub", "notes.txt"))).toEqual(fresh);
    await expect(lstat(path.join(local.path, "docs", "notes-link"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await f.close();
  }
});

test.each(["changed target", "replaced connection"] as const)(
  "waiting transfer preserves current target after %s",
  async (scenario) => {
    const f = await fixture();
    try {
      const input = await f.endpoint();
      const output = await f.endpoint();
      input.server.fs.files.set(source, fresh);
      output.server.fs.files.set(target, original);
      const { transferId } = f.queue.start({ source: input.file(source), target: output.file(target) });
      await f.state(transferId, "waiting");
      const changed = Buffer.from("different remote revision");
      if (scenario === "changed target") {
        output.server.fs.files.set(target, changed);
        f.queue.decide(transferId, "replace");
      } else {
        f.manager.disconnect(output.host.id);
        await f.manager.connect(output.host.id);
        expect(f.manager.fileOrigin(output.host.id)?.connectionId).not.toBe(output.session.connectionId);
      }
      await f.state(transferId, "failed");
      expect(f.find(transferId)?.errorCode).toBe(scenario === "changed target" ? "VERSION_CONFLICT" : "SSH_DISCONNECTED");
      expect(() => f.queue.retry(transferId)).toThrow(scenario === "changed target" ? "重新发起并核对目标" : "从新文件会话重新发起");
      expect(output.server.fs.files.get(target)).toEqual(scenario === "changed target" ? changed : original);
      expect(temporary(output.server.fs.files)).toEqual([]);
    } finally {
      await f.close();
    }
  },
  12000,
);

test("a second pause during the last SFTP target digest holds publication until another resume", async () => {
  const f = await fixture();
  const first = readGate();
  const second = readGate();
  let onNext: ReturnType<typeof readGate> | undefined;
  let armed = false;
  try {
    const input = await f.endpoint();
    const output = await f.endpoint({
      onWriteFile(file) {
        if (file.endsWith(".part") && !armed) {
          armed = true;
          onNext = first;
        }
      },
      waitReadFile(file) {
        if (file !== target || !onNext) return;
        const gate = onNext;
        onNext = undefined;
        gate.entered.resolve();
        return gate.released.promise;
      },
    });
    input.server.fs.files.set(source, fresh);
    output.server.fs.files.set(target, original);
    const { transferId } = f.queue.start({ source: input.file(source), target: output.file(target) });
    await f.state(transferId, "waiting");
    f.queue.decide(transferId, "replace");
    const records = Reflect.get(f.queue, "records") as Map<string, { wake?: () => void }>;
    for (const [gate, next] of [
      [first, second],
      [second, undefined],
    ] as const) {
      await gate.entered.promise;
      expect(f.queue.pause(transferId).state).toBe("paused");
      gate.released.resolve();
      await vi.waitFor(() => expect(records.get(transferId)?.wake).toBeTypeOf("function"), { timeout: 3500 });
      expect(output.server.fs.files.get(target)).toEqual(original);
      expect(f.find(transferId)?.state).toBe("paused");
      onNext = next;
      expect(f.queue.resume(transferId).state).toBe("running");
    }
    await f.state(transferId, "completed");
    expect(output.server.fs.files.get(target)).toEqual(fresh);
    expect(temporary(output.server.fs.files)).toEqual([]);
  } finally {
    first.released.resolve();
    second.released.resolve();
    await f.close();
  }
}, 12000);

test("cancellation of staged SFTP bytes is reported after cleanup and keeps the old target", async () => {
  const f = await fixture();
  const gate = readGate();
  let staged = false;
  try {
    const input = await f.endpoint();
    const output = await f.endpoint({
      onWriteFile(file) {
        if (file.endsWith(".part")) staged = true;
      },
      waitReadFile(file) {
        if (file !== target || !staged) return;
        gate.entered.resolve();
        return gate.released.promise;
      },
    });
    input.server.fs.files.set(source, fresh);
    output.server.fs.files.set(target, original);
    const { transferId } = f.queue.start({ source: input.file(source), target: output.file(target) });
    await f.state(transferId, "waiting");
    f.queue.decide(transferId, "replace");
    await gate.entered.promise;
    expect(f.queue.cancel(transferId).state).toBe("cancelling");
    gate.released.resolve();
    await f.state(transferId, "cancelled");
    expect(output.server.fs.files.get(target)).toEqual(original);
    expect(temporary(output.server.fs.files)).toEqual([]);
  } finally {
    gate.released.resolve();
    await f.close();
  }
}, 12000);

test.each(["readable", "blocked", "changed backup"] as const)(
  "lost SFTP publication reply reconciles on the same connection (%s)",
  async (scenario) => {
    const f = await fixture();
    let installs = 0;
    let unreadable = scenario === "blocked";
    const changedBackup = Buffer.alloc(original.length, 0x68);
    let changedPath: string | undefined;
    try {
      const input = await f.endpoint();
      const output = await f.endpoint({
        dropRenameReply(from, to) {
          if (!isPublication(from, to)) return false;
          installs++;
          if (scenario === "changed backup") {
            changedPath = temporary(output.server.fs.files).find((file) => file.endsWith(".old"));
            if (changedPath) output.server.fs.files.set(changedPath, changedBackup);
          }
          return installs === 1;
        },
        waitReadFile(file) {
          if (installs > 0 && unreadable && file === target) return Promise.reject(new Error("fixture blocks readback"));
        },
      });
      input.server.fs.files.set(source, fresh);
      output.server.fs.files.set(target, original);
      const { transferId } = f.queue.start({ source: input.file(source), target: output.file(target) });
      await f.state(transferId, "waiting");
      f.queue.decide(transferId, "replace");
      const signal = AbortSignal.timeout(7000);
      if (scenario === "blocked") {
        await f.state(transferId, "uncertain");
        const backupPath = temporary(output.server.fs.files).find((file) => file.endsWith(".old"));
        expect(f.find(transferId)?.recovery).toMatchObject({ stagingPath: `/home/test/.huhu-transfer-${transferId}.part`, backupPath });
        expect(backupPath && output.server.fs.files.get(backupPath)).toEqual(original);
        expect(() => f.queue.retry(transferId)).toThrow();
        expect(f.queue.clear().removed).toBe(0);
        for (let i = 0; i < 2; i++) {
          expect(await f.queue.recheck(transferId, signal)).toMatchObject({ state: "uncertain", recovery: { backupPath } });
          expect(installs).toBe(1);
        }
        unreadable = false;
        expect((await f.queue.recheck(transferId, signal)).state).toBe("completed");
      } else {
        await f.state(transferId, "completed");
      }
      expect(f.manager.fileOrigin(output.host.id)?.connectionId).toBe(output.session.connectionId);
      expect(f.find(transferId)?.message).toContain("已从原端点回读确认提交");
      expect(f.find(transferId)?.recovery).toBeUndefined();
      expect(output.server.fs.files.get(target)).toEqual(fresh);
      if (scenario === "changed backup") {
        expect(changedPath).toBeDefined();
        expect(temporary(output.server.fs.files)).toEqual([changedPath]);
        expect(output.server.fs.files.get(changedPath!)).toEqual(changedBackup);
        expect(f.find(transferId)?.message).toContain(changedPath!);
      } else {
        expect(temporary(output.server.fs.files)).toEqual([]);
      }
      expect((await f.queue.recheck(transferId, signal)).state).toBe("completed");
      expect(installs).toBe(1);
    } finally {
      await f.close();
    }
  },
  18000,
);
