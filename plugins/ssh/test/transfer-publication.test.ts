import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { FileSessions } from "../src/engine/file-sessions.js";
import { ownedHosts } from "./owned-hosts.js";
import { SshManager } from "../src/engine/manager.js";
import { Transfers } from "../src/engine/transfers.js";
import type { TransferJob } from "../src/shared/transfers.js";
import { startFakeSsh, type FakeSshOptions } from "./fake-server.js";

async function fixture() {
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
  const queue = new Transfers(sessions, manager, () => {});
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
    endpoint,
    find,
    state,
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
