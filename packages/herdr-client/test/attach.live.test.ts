import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, describe, expect, test } from "vitest";
import { HerdrClient, attachTerminal, type TerminalStream } from "../src/index.js";

const BIN = process.env["HUHU_HERDR_BIN"] ?? path.resolve(import.meta.dirname, "../../..", "apps/desktop/resources/herdr", `${process.platform}-${process.arch}`, process.platform === "win32" ? "herdr-core.exe" : "herdr-core");
const dir = mkdtempSync(path.join(tmpdir(), "huhu-hl-"));
const env = {
  ...process.env,
  HC_SESSION: "huhulive",
  HC_SOCKET: process.platform === "win32" ? `\\\\.\\pipe\\huhu-${path.basename(dir)}-hc` : path.join(dir, "hc.sock"),
  XDG_STATE_HOME: path.join(dir, "state"),
  XDG_CONFIG_HOME: path.join(dir, "config"),
};

afterAll(() => {
  if (existsSync(BIN) && (process.platform === "win32" || existsSync(env.HC_SOCKET))) spawnSync(BIN, ["server", "stop"], { env });
  rmSync(dir, { recursive: true, force: true });
});

function hasProbeHome(pid: number, home: string): boolean {
  try {
    return readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").includes(`HOME=${home}`);
  } catch (error) {
    if (["ENOENT", "ESRCH", "EACCES", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "")) return false;
    throw error;
  }
}

test.runIf(process.platform === "linux" && process.env["HUHU_ATTACH_FLOOD_PROBE"] === "1")(
  "隔离终端洪流阶段取证",
  async () => {
    const bin = realpathSync(BIN);
    const binSha256 = createHash("sha256").update(readFileSync(bin)).digest("hex");
    expect(binSha256, "锁定 Core 0.1.19 Linux x64 可执行文件").toBe("d408197a6b85af97b2fe93a10e6f4bee18d3a654307db94df2b35aea277c466f");
    const root = mkdtempSync("/tmp/huhu-flood-");
    const home = path.join(root, "home");
    const runtime = path.join(root, "run");
    const endpoint = path.join(runtime, "hc.sock");
    const probeEnv = {
      HOME: home,
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_STATE_HOME: path.join(root, "state"),
      XDG_DATA_HOME: path.join(root, "data"),
      XDG_CACHE_HOME: path.join(root, "cache"),
      XDG_RUNTIME_DIR: runtime,
      HC_SESSION: "huhu-flood-probe",
      HC_SOCKET: endpoint,
      // Prevent a holder from relaunching Core during a bounded cleanup fallback.
      HC_HOLDER_GRACE_MS: "60000",
      PATH: "/usr/bin:/bin",
      SHELL: "/bin/sh",
      HISTFILE: "/dev/null",
      TERM: "xterm-256color",
    };
    mkdirSync(home, { mode: 0o700 });
    mkdirSync(runtime, { mode: 0o700 });
    const core = spawn(bin, ["serve"], { cwd: root, env: probeEnv, stdio: ["ignore", "ignore", "pipe"] });
    let serveError: string | undefined;
    let serveStderr = "";
    core.on("error", (error) => {
      serveError = error.message;
    });
    core.stderr.on("data", (chunk: Buffer) => {
      serveStderr = (serveStderr + chunk.toString("utf8")).slice(-4096);
    });
    const ownedPids = () =>
      readdirSync("/proc")
        .filter((entry) => /^\d+$/u.test(entry))
        .map(Number)
        .filter((pid) => hasProbeHome(pid, home));
    const c = new HerdrClient({ endpoint, timeoutMs: 18_000 });
    let verifiedCore = false;
    let t: TerminalStream | undefined;
    let address: string | undefined;
    const state = { version: "", firstDataMs: null as number | null, lastDataMs: null as number | null, frames: 0, bytes: 0, bytesByDeadline: 0, canRepaints: 0, tailMs: null as number | null };
    const sampleMs = 20_000;
    const marker = Buffer.from("FLOOD-DONE-42-10485760");
    const ready = Buffer.from("HUHU-FLOOD-READY-42");
    let readySeen = false;
    let releasedAt: number | undefined;
    let suffix: Buffer = Buffer.alloc(0);
    let endSample!: () => void;
    const tailSeen = new Promise<void>((resolve) => {
      endSample = resolve;
    });
    let read: { status: "read"; atMs: number; complete: boolean; how: string; characters: number; hasTail: boolean; hasPromptLikeLastLine: boolean } | { status: "error"; message: string } | undefined;
    let stop: { stopped: boolean } | { error: string } | undefined;
    const forcedPids: number[] = [];
    const failures: unknown[] = [];
    try {
      await expect.poll(() => serveError ?? { ready: lstatSync(endpoint, { throwIfNoEntry: false })?.isSocket() ?? false, exit: core.exitCode }, { timeout: 6_000 }).toEqual({ ready: true, exit: null });
      await c.connect(AbortSignal.timeout(3_000));
      const status = await c.call<{ pid: number; version: string }>("server.status", {}, AbortSignal.timeout(3_000));
      expect(status.pid).toBe(core.pid);
      expect(readlinkSync(`/proc/${status.pid}/exe`)).toBe(bin);
      verifiedCore = true;
      state.version = status.version;
      expect(status.version).toBe("0.1.19");
      const run = await c.call<{ address: string }>("terminal.run", { argv: ["/bin/sh"], cwd: root, name: "flood-attach-probe", env: probeEnv, no_parent: true, keep: false });
      address = run.address;
      expect(address).toBeTruthy();
      t = await attachTerminal(endpoint, { terminal: address, cols: 100, rows: 30, signal: AbortSignal.timeout(6_000) });
      t.onData((bytes) => {
        const target = releasedAt === undefined ? ready : marker;
        const overlap = target.length - 1;
        const acrossFrames = Buffer.concat([suffix, bytes.subarray(0, overlap)]);
        const matched = bytes.includes(target) || acrossFrames.includes(target);
        suffix = Buffer.from((bytes.length >= overlap ? bytes : acrossFrames).subarray(-overlap));
        if (releasedAt === undefined) {
          readySeen ||= matched;
          return;
        }
        const elapsed = performance.now() - releasedAt;
        state.firstDataMs ??= elapsed;
        state.lastDataMs = elapsed;
        state.frames++;
        state.bytes += bytes.length;
        if (elapsed <= sampleMs) state.bytesByDeadline += bytes.length;
        for (let at = bytes.indexOf(0x18); at !== -1; at = bytes.indexOf(0x18, at + 1)) state.canRepaints++;
        if (state.tailMs !== null || !matched) return;
        state.tailMs = elapsed;
        endSample();
      });
      const gate = path.join(root, "gate");
      t.write(Buffer.from(`printf 'HUHU-FLOOD-READY-%s\\n' "$((6*7))"; while [ ! -f '${gate}' ]; do sleep 0.01; done; count=$(yes 0123456789abcdef | head -c 10485760 | tee /dev/tty | wc -c); echo FLOOD-DONE-$((6*7))-$count\n`));
      await expect.poll(() => readySeen, { timeout: 4_000 }).toBe(true);
      suffix = Buffer.alloc(0);
      releasedAt = performance.now();
      writeFileSync(gate, "");
      const timer = new AbortController();
      try {
        await Promise.race([tailSeen, delay(sampleMs, undefined, { signal: timer.signal })]);
      } finally {
        timer.abort();
      }
      const snapshot = { ...state, atMs: performance.now() - releasedAt };
      try {
        const output = await c.call<{ text: string; complete: boolean; how: string }>("terminal.read", { terminal: address, lines: 40 }, AbortSignal.timeout(4_000));
        read = {
          status: "read",
          atMs: performance.now() - releasedAt,
          complete: output.complete,
          how: output.how,
          characters: output.text.length,
          hasTail: output.text.includes(marker.toString("utf8")),
          hasPromptLikeLastLine: /[$#%>❯]$/u.test(output.text.trimEnd().split(/\r?\n/u).at(-1) ?? ""),
        };
      } catch (error) {
        read = { status: "error", message: String(error) };
      }
      console.info("flood-attach-probe", JSON.stringify({ address, binSha256, windowMs: sampleMs, snapshot, throughCoreRead: state, read }));
      expect(snapshot.tailMs !== null && snapshot.tailMs <= sampleMs, "直连 attach 必须在 20 秒内收到洪流尾标").toBe(true);
      expect(read).toMatchObject({ status: "read", hasTail: true });
    } catch (error) {
      failures.push(error);
    }

    try {
      t?.close();
      if (verifiedCore) {
        stop = await c.call<{ stopped: boolean }>("server.stop", {}, AbortSignal.timeout(9_000)).catch((error) => ({ error: String(error) }));
      }
    } catch (error) {
      failures.push(error);
    } finally {
      c.close();
    }
    try {
      try {
        await expect.poll(ownedPids, { timeout: 4_000 }).toEqual([]);
      } catch {
        // The bounded fallback below handles any remaining fixture processes.
      }
      for (const pid of ownedPids()) {
        if (!hasProbeHome(pid, home)) continue;
        try {
          process.kill(pid, "SIGKILL");
          forcedPids.push(pid);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") failures.push(error);
        }
      }
      await expect.poll(() => ({ pids: ownedPids(), coreAlive: core.pid !== undefined && core.exitCode === null && core.signalCode === null }), { timeout: 4_000 }).toEqual({ pids: [], coreAlive: false });
      if (verifiedCore) expect(stop, "私有 Core 应返回停止回执").toEqual({ stopped: true });
      expect(forcedPids, "Core 和 holder 应正常退出").toEqual([]);
    } catch (error) {
      failures.push(error);
    } finally {
      const remaining = ownedPids();
      const coreExited = core.pid === undefined || core.exitCode !== null || core.signalCode !== null;
      const sockets = readdirSync(runtime).filter((name) => /^hc(?:\.holder(?:\.[^.]+)?)?\.sock$/u.test(name));
      console.info("flood-attach-cleanup", JSON.stringify({ root, corePid: core.pid, exit: core.exitCode, signal: core.signalCode, stop, forcedPids, remaining, sockets, readySeen, serveError, serveStderr }));
      if (remaining.length === 0 && coreExited) rmSync(root, { recursive: true, force: true });
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "直连诊断和清理发生多项失败");
  },
  90_000,
);

describe.skipIf(!existsSync(BIN))("真实 Herdr Core：attach 终端", () => {
  test.skipIf(process.platform === "win32")(
    "输入回显、resize、程序退出时收到 CLOSE(exited)",
    async () => {
      spawnSync(BIN, ["server", "start"], { env });
      const c = new HerdrClient({ endpoint: env.HC_SOCKET });
      await c.connect();
      const run = await c.call<{ address: string }>("terminal.run", { argv: ["/bin/sh"], cwd: "/tmp", name: "attach-test" });
      const t = await attachTerminal(env.HC_SOCKET, { terminal: run.address, cols: 100, rows: 30 });
      let out = "";
      const closed = new Promise<{ reason?: string; exit_code?: number | null } | null>((r) => t.onClose(r));
      t.onData((b) => {
        out += b.toString("utf8");
      });
      t.write(Buffer.from("echo HUHU-ATTACH-$((20+22))\n"));
      for (let i = 0; i < 100 && !out.includes("HUHU-ATTACH-42"); i++) await new Promise((r) => setTimeout(r, 50));
      expect(out).toContain("HUHU-ATTACH-42");
      t.resize(120, 40);
      t.write(Buffer.from("stty size\n"));
      for (let i = 0; i < 100 && !/40 120/.test(out); i++) await new Promise((r) => setTimeout(r, 50));
      expect(out).toMatch(/40 120/);
      t.write(Buffer.from("exit 7\n"));
      const reason = await Promise.race([closed, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 5000))]);
      expect(reason).toMatchObject({ reason: "exited", exit_code: 7 });
      c.close();
    },
    30_000,
  );
});
