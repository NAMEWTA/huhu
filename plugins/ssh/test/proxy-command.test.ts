import { type ChildProcess, type SpawnOptions, spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo, type Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Writable, type Duplex } from "node:stream";
import { afterEach, expect, test, vi, type TestContext } from "vitest";
import { dialProxyCommand, expandProxyCommand, validateProxyCommand, type ProxyCommand } from "../src/engine/proxy-command.js";

const mocked = vi.hoisted(() => ({
  child: undefined as ChildProcess | undefined,
  nativeError: undefined as string | undefined,
}));

vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:child_process")>();
  return {
    ...real,
    spawn: vi.fn((file: string, args: string[], options: SpawnOptions) => {
      if (mocked.child) return mocked.child;
      const child = real.spawn(file, args, options);
      child.on("error", (error: NodeJS.ErrnoException) => {
        mocked.nativeError = error.code;
      });
      return child;
    }),
  };
});

afterEach(() => {
  mocked.child = undefined;
  mocked.nativeError = undefined;
  vi.mocked(spawn).mockClear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const command = { executable: "/tmp/fixture proxy", arguments: ["%h", "%p", "%r", "--label=%%h", "literal ; $value", ""] } as const;
const target = { host: "service.fixture.invalid", port: 2222, user: "合成-user" };
const rejectWith = (reason: string) => ({
  code: reason === "timeout" ? "SSH_TIMEOUT" : "SSH_DISCONNECTED",
  details: { stage: "proxy", reason },
});

class FixtureProcess extends EventEmitter {
  pid: number | undefined = 91234;
  exitCode = null;
  signalCode = null;
  readonly kill = vi.fn();
  readonly received: Buffer[] = [];
  readonly stdin = new Writable({
    write: (chunk: Buffer, _encoding, callback) => {
      this.received.push(chunk);
      callback();
    },
  });
  readonly stdout = new PassThrough();
}

function fixture() {
  const child = new FixtureProcess();
  mocked.child = child as unknown as ChildProcess;
  const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
  return { child, kill };
}

function closeOf(stream: Duplex) {
  return new Promise<void>((resolve) => stream.once("close", resolve));
}

async function collect(stream: Duplex) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

test("expands only the four placeholders within their original argv slots", () => {
  expect(validateProxyCommand(command)).toBeUndefined();
  expect(expandProxyCommand(command, target)).toEqual({
    executable: command.executable,
    arguments: ["service.fixture.invalid", "2222", "合成-user", "--label=%h", "literal ; $value", ""],
  });
  expect(expandProxyCommand({ ...command, arguments: ["%h/%p", "%%%%", "%%%r"] }, { ...target, host: "2001:db8::23" }).arguments).toEqual(["2001:db8::23/2222", "%%", "%合成-user"]);
  expect(spawn).not.toHaveBeenCalled();
});

test("rejects unsafe endpoints, unknown tokens and both original and expanded limits", () => {
  for (const invalid of [
    { ...command, executable: "relative/helper" },
    { ...command, executable: "/tmp/contains\0nul" },
    { ...command, arguments: ["%n"] },
    { ...command, arguments: ["lone%"] },
    { ...command, arguments: ["line\nbreak"] },
    { ...command, arguments: ["\u0085"] },
    { ...command, arguments: Array(65).fill("x") },
    { ...command, arguments: ["x".repeat(8192)] },
  ]) {
    expect(() => validateProxyCommand(invalid)).toThrow(expect.objectContaining(rejectWith("invalid-configuration")));
  }
  for (const endpoint of [
    { ...target, host: "-fixture" },
    { ...target, host: "service.fixture.invalid:2222" },
    { ...target, host: "[2001:db8::23]" },
    { ...target, host: "service;fixture" },
    { ...target, port: 0 },
    { ...target, port: 65536 },
    { ...target, port: 2.5 },
    { ...target, user: "-fixture" },
    { ...target, user: "fixture user" },
    { ...target, user: "fixture%h" },
  ]) {
    expect(() => expandProxyCommand(command, endpoint)).toThrow(expect.objectContaining(rejectWith("invalid-configuration")));
  }
  const large = { ...command, arguments: ["%h".repeat(512)] };
  expect(validateProxyCommand(large)).toBeUndefined();
  expect(() => expandProxyCommand(large, target)).toThrow(expect.objectContaining(rejectWith("invalid-configuration")));
  expect(spawn).not.toHaveBeenCalled();
});

test.skipIf(process.platform !== "linux")("pre-cancellation and stale approval launch no process", async (context) => {
  const guard = vi.fn(() => {
    throw new Error("fixture private assertion trace");
  });
  await expect(dialProxyCommand(command, target, AbortSignal.abort(new Error("private abort")), guard)).rejects.toMatchObject(rejectWith("cancelled"));
  expect(guard).not.toHaveBeenCalled();
  const reason = await dialProxyCommand(command, target, context.signal, guard).catch((error) => error);
  expect(reason).toMatchObject(rejectWith("approval-changed"));
  expect(JSON.stringify(reason)).not.toContain("private assertion");
  expect(spawn).not.toHaveBeenCalled();
});

test.skipIf(process.platform !== "linux")("uses constrained spawn options and hands off preserved bytes independently of the startup deadline", async () => {
  vi.useFakeTimers();
  const { child, kill } = fixture();
  const guard = vi.fn();
  const scope = new AbortController();
  const pending = dialProxyCommand(command, target, scope.signal, guard);
  expect(guard).toHaveBeenCalledTimes(1);
  expect(spawn).toHaveBeenCalledExactlyOnceWith(command.executable, expandProxyCommand(command, target).arguments, {
    detached: true,
    shell: false,
    cwd: "/",
    env: { PATH: "/usr/bin:/bin", LANG: "C" },
    stdio: ["pipe", "pipe", "ignore"],
  });
  const banner = Buffer.from([0, 255, 13, 10]);
  child.stdout.write(banner);
  child.emit("spawn");
  const stream = await pending;
  expect(guard).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(30_000);
  scope.abort(new DOMException("fixture startup deadline", "TimeoutError"));
  expect(stream.destroyed).toBe(false);
  expect(kill).not.toHaveBeenCalled();
  const first = once(stream, "data");
  stream.resume();
  expect(await first).toEqual([banner]);
  const input = Buffer.from([0, 131, 9]);
  await new Promise<void>((resolve, reject) => stream.write(input, (error) => (error ? reject(error) : resolve())));
  expect(child.received).toEqual([input]);
  const close = closeOf(stream);
  stream.destroy();
  stream.destroy();
  await close;
  expect(kill).toHaveBeenCalledExactlyOnceWith(-child.pid!, "SIGKILL");
  expect(child.stdin.destroyed).toBe(true);
  expect(child.stdout.destroyed).toBe(true);
});

test.skipIf(process.platform !== "linux").each(["cancelled", "timeout", "approval-changed", "spawn-failed", "process-exited"] as const)("normalizes startup failure %s and discards late spawn", async (reason) => {
  vi.useFakeTimers();
  const { child, kill } = fixture();
  const scope = new AbortController();
  const guard = vi.fn();
  if (reason === "cancelled") child.pid = undefined;
  if (reason === "approval-changed")
    guard
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error("fixture-private-approval");
      });
  const pending = dialProxyCommand(command, target, scope.signal, guard);
  const observed = pending.catch((error) => error);
  if (reason === "cancelled") scope.abort(new Error("fixture-private-abort"));
  if (reason === "timeout") vi.advanceTimersByTime(20_000);
  if (reason === "approval-changed") child.emit("spawn");
  if (reason === "spawn-failed") child.emit("error", new Error("fixture-private-executable"));
  if (reason === "process-exited") child.emit("exit", 23, null);
  const error = await observed;
  expect(error).toMatchObject(rejectWith(reason));
  expect(JSON.stringify(error)).not.toContain("fixture-private");
  child.pid ??= 91234;
  if (reason !== "approval-changed") child.emit("spawn");
  child.emit("error", new Error("fixture-private-late"));
  expect(kill).toHaveBeenCalledExactlyOnceWith(-child.pid, "SIGKILL");
  expect(child.stdin.destroyed).toBe(true);
  expect(child.stdout.destroyed).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test.skipIf(process.platform !== "linux")("handles an early spawn failure that has no usable stdio", async (context) => {
  const { child, kill } = fixture();
  mocked.child = Object.assign(new EventEmitter(), { pid: undefined, stdin: null, stdout: null }) as unknown as ChildProcess;
  await expect(dialProxyCommand(command, target, context.signal, () => undefined)).rejects.toMatchObject(rejectWith("spawn-failed"));
  expect(kill).not.toHaveBeenCalled();
  mocked.child.emit("error", new Error("private pipe creation message"));
  child.stdin.destroy();
  child.stdout.destroy();
});

test.skipIf(process.platform !== "linux")("preserves output through half-close and bounds a child that ignores EOF", async (context) => {
  vi.useFakeTimers();
  const { child, kill } = fixture();
  const pending = dialProxyCommand(command, target, context.signal, () => undefined);
  child.emit("spawn");
  const stream = await pending;
  const closed = closeOf(stream);
  const output = collect(stream);
  child.stdin.once("finish", () => {
    child.stdout.write(Buffer.alloc(256 * 1024, 0x9f));
    child.stdout.end(Buffer.from([0, 0xf1]));
    child.emit("exit", 0, null);
  });
  stream.end(Buffer.from([0x81]));
  expect(await output).toEqual(Buffer.concat([Buffer.alloc(256 * 1024, 0x9f), Buffer.from([0, 0xf1])]));
  await closed;
  expect(child.received).toEqual([Buffer.from([0x81])]);
  expect(kill).toHaveBeenCalledExactlyOnceWith(-child.pid!, "SIGKILL");

  const lingering = new FixtureProcess();
  lingering.pid = 91235;
  mocked.child = lingering as unknown as ChildProcess;
  const second = dialProxyCommand(command, target, context.signal, () => undefined);
  lingering.emit("spawn");
  const lease = await second;
  const leaseClosed = closeOf(lease);
  lease.end();
  vi.advanceTimersByTime(1000);
  await leaseClosed;
  expect(kill.mock.calls).toEqual([
    [-91234, "SIGKILL"],
    [-91235, "SIGKILL"],
  ]);
});

test.skipIf(process.platform !== "linux")("after handoff sanitizes a pipe error and reaps only this group", async (context) => {
  const { child, kill } = fixture();
  const pending = dialProxyCommand(command, target, context.signal, () => undefined);
  child.emit("spawn");
  const stream = await pending;
  const error = once(stream, "error");
  child.stdout.destroy(new Error("fixture-private-output"));
  expect(await error).toEqual([expect.objectContaining(rejectWith("pipe-failed"))]);
  expect(kill).toHaveBeenCalledExactlyOnceWith(-child.pid!, "SIGKILL");
});

function helper(context: TestContext, program: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "huhu-proxy-command-"));
  context.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "fixture.js");
  writeFileSync(file, program);
  return file;
}

async function nativeDial(context: TestContext, invocation: ProxyCommand, endpoint: typeof target) {
  try {
    return await dialProxyCommand(invocation, endpoint, context.signal, () => undefined);
  } catch (error) {
    if (mocked.nativeError === "EPERM" || mocked.nativeError === "EACCES") context.skip(`Native spawn failed with ${mocked.nativeError}`);
    throw error;
  }
}

test.skipIf(process.platform !== "linux")("real exec failure is reported without the approved path or arguments", async (context) => {
  const file = helper(context, "");
  const error = await dialProxyCommand({ executable: file + ".missing", arguments: ["fixture-private-argument"] }, target, context.signal, () => undefined).catch((reason) => reason);
  expect(error).toMatchObject(rejectWith("spawn-failed"));
  expect(JSON.stringify(error)).not.toContain(file);
  expect(JSON.stringify(error)).not.toContain("fixture-private-argument");
});

test.skipIf(process.platform !== "linux")("real local helper exchanges binary data with isolated environment and stderr", async (context) => {
  const file = helper(
    context,
    `
    const fs = require("node:fs");
    const allowed = Object.keys(process.env).sort().join(":") === "LANG:PATH" && process.cwd() === "/";
    fs.writeSync(1, Buffer.from([0, 255, allowed ? 1 : 0]));
    fs.writeSync(2, "fixture-private-stderr");
    const input = fs.createReadStream(null, { fd: 0, autoClose: false });
    input.on("data", (chunk) => fs.writeSync(1, chunk));
    input.on("end", () => fs.writeSync(1, Buffer.from([128, 0])));
  `,
  );
  const stream = await nativeDial(context, { executable: process.execPath, arguments: [file] }, target);
  context.onTestFinished(() => {
    stream.destroy();
  });
  const response = collect(stream);
  stream.end(Buffer.from([0, 131, 10]));
  expect(await response).toEqual(Buffer.from([0, 255, 1, 0, 131, 10, 128, 0]));
});

function noLongerRunning(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3) === "Z";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

test.skipIf(process.platform !== "linux")("destroying a real stream stops its leader and a helper in the same Linux process group", async (context) => {
  const file = helper(
    context,
    `
    const { spawn } = require("node:child_process");
    const { writeSync } = require("node:fs");
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    child.once("spawn", () => writeSync(1, process.pid + ":" + child.pid));
    setInterval(() => {}, 1000);
  `,
  );
  const stream = await nativeDial(context, { executable: process.execPath, arguments: [file] }, target);
  context.onTestFinished(() => {
    stream.destroy();
  });
  const first = once(stream, "data");
  stream.resume();
  const [chunk] = await first;
  const [leader, descendant] = chunk.toString().split(":").map(Number);
  expect(leader).toBeGreaterThan(1);
  expect(descendant).toBeGreaterThan(1);
  expect(noLongerRunning(leader!)).toBe(false);
  expect(noLongerRunning(descendant!)).toBe(false);
  const closed = closeOf(stream);
  stream.destroy();
  await closed;
  await expect.poll(() => [noLongerRunning(leader!), noLongerRunning(descendant!)]).toEqual([true, true]);
});

test.skipIf(process.platform !== "linux")("real helper reaches only the fixed loopback fixture", async (context) => {
  const peers = new Set<Socket>();
  const server = createServer((peer) => {
    peers.add(peer);
    peer.once("close", () => peers.delete(peer));
    peer.write(Buffer.from([0xff, 0]));
    peer.on("data", (chunk) => peer.write(chunk));
  });
  const listening = once(server, "listening");
  server.listen(0, "127.0.0.1");
  try {
    await listening;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES") context.skip(`Loopback listen failed with ${code}`);
    throw error;
  }
  const port = (server.address() as AddressInfo).port;
  context.onTestFinished(
    () =>
      new Promise<void>((resolve) => {
        for (const peer of peers) peer.destroy();
        server.close(() => resolve());
      }),
  );
  const file = helper(
    context,
    `
    const fs = require("node:fs");
    const [host, port] = process.argv.slice(2);
    if (host !== "127.0.0.1" || Number(port) !== ${port}) process.exit(1);
    const socket = require("node:net").connect({ host, port: Number(port) });
    fs.createReadStream(null, { fd: 0, autoClose: false }).pipe(socket);
    socket.pipe(fs.createWriteStream(null, { fd: 1, autoClose: false }));
  `,
  );
  const stream = await nativeDial(context, { executable: process.execPath, arguments: [file, "%h", "%p"] }, { ...target, host: "127.0.0.1", port });
  context.onTestFinished(() => {
    stream.destroy();
  });
  const response = collect(stream);
  stream.end(Buffer.from([0x81, 0]));
  expect(await response).toEqual(Buffer.from([0xff, 0, 0x81, 0]));
});
