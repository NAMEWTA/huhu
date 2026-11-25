import { spawn, type ChildProcess } from "node:child_process";
import { isIP } from "node:net";
import { posix } from "node:path";
import { Duplex } from "node:stream";
import { HuhuError } from "@huhu/contracts";
import { z } from "zod";

export type ProxyCommand = { executable: string; arguments: readonly string[] };
export type ProxyCommandTarget = { host: string; port: number; user: string };

const startupTimeoutMs = 20_000;
const closeGraceMs = 1000;
const maxArguments = 64;
const maxCommandBytes = 8 * 1024;
const maxExecutableBytes = 4096;
const maxUserBytes = 256;
const control = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const hostname = z.hostname();

const messages = {
  "invalid-configuration": "本机 SSH 代理程序的配置或首段地址无效",
  "unsupported-platform": "当前平台不支持受管的本机 SSH 代理程序",
  "approval-changed": "本机 SSH 代理程序的批准已失效",
  "spawn-failed": "无法启动本机 SSH 代理程序",
  "process-exited": "本机 SSH 代理程序已退出",
  "pipe-failed": "本机 SSH 代理程序的管道已断开",
  timeout: "本机 SSH 代理程序启动超时",
  cancelled: "已取消本机 SSH 代理程序的启动",
};
type Reason = keyof typeof messages;

function proxyError(reason: Reason) {
  return new HuhuError(reason === "timeout" ? "SSH_TIMEOUT" : "SSH_DISCONNECTED", messages[reason], {
    details: { stage: "proxy", reason },
  });
}

function invalid(): never {
  throw proxyError("invalid-configuration");
}

function checkArguments(executable: string, argv: readonly string[]) {
  if (!Array.isArray(argv) || argv.length > maxArguments) invalid();
  let bytes = Buffer.byteLength(executable) + 1;
  for (const argument of argv) {
    if (typeof argument !== "string" || argument.length > maxCommandBytes || control.test(argument)) invalid();
    bytes += Buffer.byteLength(argument) + 1;
    if (bytes > maxCommandBytes) invalid();
  }
}

/** Validate the saved executable and argument template without running any program. */
export function validateProxyCommand(command: ProxyCommand): void {
  const { executable } = command;
  if (typeof executable !== "string" || executable.length > maxExecutableBytes || !posix.isAbsolute(executable) || control.test(executable) || Buffer.byteLength(executable) > maxExecutableBytes) invalid();
  checkArguments(executable, command.arguments);
  for (const argument of command.arguments) {
    for (const [token] of argument.matchAll(/%[\s\S]?/gu)) {
      if (token !== "%h" && token !== "%p" && token !== "%r" && token !== "%%") invalid();
    }
  }
}

/** Expand each saved argv slot in one pass, using the actual first SSH hop. */
export function expandProxyCommand(command: ProxyCommand, target: ProxyCommandTarget): { executable: string; arguments: string[] } {
  validateProxyCommand(command);
  const { host, port, user } = target;
  if (typeof host !== "string" || host.length > 254 || host.includes("%") || (!isIP(host) && !hostname.safeParse(host).success)) invalid();
  if (!Number.isInteger(port) || port < 1 || port > 65535) invalid();
  if (typeof user !== "string" || user.length > maxUserBytes || user.startsWith("-") || !/^[\p{L}\p{M}\p{N}._@+:-]+$/u.test(user) || Buffer.byteLength(user) > maxUserBytes) invalid();
  const values: Record<string, string> = { "%h": host, "%p": String(port), "%r": user, "%%": "%" };
  const argv = command.arguments.map((argument) => argument.replace(/%[hpr%]/gu, (token) => values[token]!));
  checkArguments(command.executable, argv);
  return { executable: command.executable, arguments: argv };
}

function abortReason(signal: AbortSignal): Reason {
  return signal.reason instanceof Error && signal.reason.name === "TimeoutError" ? "timeout" : "cancelled";
}

function approvalFailure(signal: AbortSignal, assertCurrent: () => void): Reason | undefined {
  if (signal.aborted) return abortReason(signal);
  try {
    assertCurrent();
  } catch {
    return signal.aborted ? abortReason(signal) : "approval-changed";
  }
  if (signal.aborted) return abortReason(signal);
}

function stopGroup(child: ChildProcess) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH" && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
}

export async function dialProxyCommand(command: ProxyCommand, target: ProxyCommandTarget, signal: AbortSignal, assertCurrent: () => void): Promise<Duplex> {
  if (signal.aborted) throw proxyError(abortReason(signal));
  if (process.platform !== "linux") throw proxyError("unsupported-platform");
  const deadline = performance.now() + startupTimeoutMs;
  const invocation = expandProxyCommand(command, target);
  const initialFailure = approvalFailure(signal, assertCurrent);
  if (initialFailure) throw proxyError(initialFailure);
  if (performance.now() >= deadline) throw proxyError("timeout");

  return new Promise<Duplex>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(invocation.executable, invocation.arguments, {
        detached: true,
        shell: false,
        cwd: "/",
        env: { PATH: "/usr/bin:/bin", LANG: "C" },
        stdio: ["pipe", "pipe", "ignore"],
      });
    } catch {
      reject(proxyError("spawn-failed"));
      return;
    }
    const { stdin, stdout } = child;
    if (!stdin || !stdout) {
      child.on("error", () => undefined);
      stopGroup(child);
      reject(proxyError("spawn-failed"));
      return;
    }
    let state: "starting" | "ready" | "failed" = "starting";
    let groupStopped = false;
    let exitError: HuhuError | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;

    function stop() {
      if (!groupStopped && child.pid) {
        groupStopped = true;
        stopGroup(child);
      }
    }

    const stream = new Duplex({
      allowHalfOpen: false,
      read() {
        stdout.resume();
      },
      write(chunk: Buffer, _encoding, callback) {
        stdin.write(chunk, (error) => callback(error ? proxyError("pipe-failed") : undefined));
      },
      final(callback) {
        // Let a half-close drain its final reply and bound cleanup if the peer ignores EOF.
        closeTimer = setTimeout(() => stream.destroy(), closeGraceMs);
        closeTimer.unref();
        stdin.end((error?: Error | null) => callback(error ? proxyError("pipe-failed") : undefined));
      },
      destroy(error, callback) {
        clearTimeout(closeTimer);
        stop();
        stdin.destroy();
        stdout.destroy();
        callback(error);
      },
    });
    stream.on("error", () => undefined); // Covers failure before the caller can register a listener.
    stdout.pause();
    stdout.on("data", (chunk: Buffer) => {
      if (!stream.push(chunk)) stdout.pause();
    });
    stdout.once("end", () => stream.push(null));
    stream.once("end", () => {
      if (exitError) stream.destroy(exitError);
    });

    const timer = setTimeout(() => fail("timeout"), Math.max(0, Math.ceil(deadline - performance.now())));
    timer.unref();

    function endStartup() {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }

    function fail(reason: Reason) {
      if (state === "starting") {
        state = "failed";
        endStartup();
        stream.destroy();
        reject(proxyError(reason));
      } else if (state === "ready") {
        stream.destroy(proxyError(reason));
      }
    }

    function onAbort() {
      fail(abortReason(signal));
    }

    // Keep the listeners even if startup failed so late errors cannot escape.
    child.on("error", () => fail(state === "starting" ? "spawn-failed" : "process-exited"));
    stdin.on("error", () => fail("pipe-failed"));
    stdout.on("error", () => fail("pipe-failed"));
    child.once("exit", (code) => {
      // Descendants must not keep the pipes open after the leader has exited.
      stop();
      if (state === "starting") fail("process-exited");
      else if (state === "ready" && code !== 0 && !stream.destroyed) {
        exitError = proxyError("process-exited");
        if (stream.readableEnded) stream.destroy(exitError);
      }
    });
    child.once("spawn", () => {
      if (state !== "starting") {
        stop();
        return;
      }
      const failure = approvalFailure(signal, assertCurrent);
      if (failure) return fail(failure);
      if (performance.now() >= deadline) return fail("timeout");
      if (child.exitCode !== null || child.signalCode !== null || stdin.destroyed || stdout.destroyed || stream.destroyed) return fail("process-exited");
      state = "ready";
      endStartup();
      resolve(stream);
    });
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}
