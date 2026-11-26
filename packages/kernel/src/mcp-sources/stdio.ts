import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { getDefaultEnvironment, type StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

function signalGroup(pid: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

/** A local MCP source owns its POSIX process group, including helpers that inherit its pipes. */
export class GroupStdioTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private readonly messages = new ReadBuffer();
  private child?: ChildProcessWithoutNullStreams;
  private closed?: Promise<void>;

  start(): Promise<void> {
    const { command, args = [], cwd, env } = this.parameters;
    const child = spawn(command, args, {
      cwd, env: { ...getDefaultEnvironment(), ...env }, detached: true, stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    // Upstream controls stderr. Drain it without putting output or startup arguments in diagnostics.
    child.stderr.resume();
    child.stdin.on("error", () => this.onerror?.(new Error("MCP stdio input closed")));
    child.stdout.on("error", () => this.onerror?.(new Error("MCP stdio output closed")));
    child.stdout.on("data", (chunk: Buffer) => {
      try {
        this.messages.append(chunk);
        for (let message = this.messages.readMessage(); message; message = this.messages.readMessage()) {
          this.onmessage?.(message);
        }
      } catch {
        this.onerror?.(new Error("Invalid MCP stdio output"));
        this.beginClose();
      }
    });
    child.once("exit", () => this.beginClose());
    return new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.on("error", (error: NodeJS.ErrnoException) => {
        reject(Object.assign(new Error("MCP stdio process could not start"), { code: error.code }));
        this.beginClose();
      });
    });
  }

  constructor(private readonly parameters: StdioServerParameters) {}

  send(message: JSONRPCMessage): Promise<void> {
    const input = this.child?.stdin;
    if (!input || input.destroyed || this.closed) return Promise.reject(new Error("MCP stdio process is closed"));
    return new Promise((resolve, reject) => {
      input.write(serializeMessage(message), (error) => error ? reject(new Error("MCP stdio send failed")) : resolve());
    });
  }

  private beginClose(): void {
    void this.close().catch(() => undefined);
  }

  close(): Promise<void> {
    if (this.closed) return this.closed;
    const child = this.child;
    this.closed = Promise.resolve().then(async () => {
      if (!child) return;
      child.stdin.destroy();
      const pid = child.pid;
      if (pid !== undefined && signalGroup(pid, "SIGTERM")) {
        const deadline = Date.now() + 200;
        while (Date.now() < deadline && signalGroup(pid, 0)) await delay(20);
        signalGroup(pid, "SIGKILL");
      }
      child.stdout.destroy();
      child.stderr.destroy();
      this.messages.clear();
    });
    this.onclose?.();
    return this.closed;
  }
}
