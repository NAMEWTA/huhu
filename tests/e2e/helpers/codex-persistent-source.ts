import { expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";

type Profile = { binary: string; home: string; cwd: string };
type Turn = { id: string; status: string };
type Thread = { id: string; path: string | null; cwd: string; turns: Turn[] };
type Request = { resolve(value: unknown): void; reject(error: Error): void };
type Message = {
  id?: number;
  method?: string;
  params?: { threadId: string; turn: Turn };
  result?: unknown;
  error?: { code: number; message: string };
};
type Server = {
  request<T>(method: string, params: unknown): Promise<T>;
  completed(threadId: string, turnId: string): Turn | undefined;
};

async function withAppServer<T>({ binary, home, cwd }: Profile, run: (server: Server) => Promise<T>): Promise<T> {
  const child = spawn(binary, ["--config", "mcp_servers={}", "--config", 'web_search="disabled"', "--disable", "shell_tool", "app-server", "--listen", "stdio://"], {
    cwd,
    env: { HOME: home, CODEX_HOME: home, PATH: process.env["PATH"] },
    stdio: ["pipe", "pipe", "ignore"],
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const pending = new Map<number, Request>();
  const completions = new Map<string, Map<string, Turn>>();
  let failure: Error | undefined;
  let sequence = 0;
  const fail = (error: Error) => {
    failure ??= error;
    for (const wait of pending.values()) wait.reject(failure);
  };
  const closed = new Promise<void>((resolve) =>
    child.once("close", () => {
      fail(new Error("Codex App Server closed"));
      resolve();
    }),
  );
  child.once("error", fail);
  child.stdin.on("error", fail);
  child.stdout.on("error", fail);
  const send = (value: unknown) => child.stdin.write(JSON.stringify(value) + "\n");
  lines.on("line", (line) => {
    try {
      const message = JSON.parse(line) as Message;
      if (message.method !== undefined) {
        if (message.id !== undefined) {
          send({ id: message.id, error: { code: -32601, message: "The source fixture only handles model responses" } });
        } else if (message.method === "turn/completed" && message.params) {
          const { threadId, turn } = message.params;
          const existing = completions.get(threadId) ?? new Map<string, Turn>();
          existing.set(turn.id, turn);
          completions.set(threadId, existing);
        }
      } else if (message.id !== undefined) {
        const wait = pending.get(message.id);
        if (message.error) wait?.reject(new Error(`Codex RPC ${message.error.code}: ${message.error.message}`));
        else wait?.resolve(message.result);
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
  async function request<R>(method: string, params: unknown): Promise<R> {
    if (failure) throw failure;
    const id = ++sequence;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await new Promise<unknown>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        timer = setTimeout(() => reject(new Error(`Codex RPC timed out: ${method}`)), 15_000);
        send({ id, method, params });
      });
      return result as R;
    } finally {
      clearTimeout(timer);
      pending.delete(id);
    }
  }
  try {
    await request("initialize", { clientInfo: { name: "huhu", version: "1" }, capabilities: { experimentalApi: true } });
    send({ method: "initialized", params: {} });
    return await run({
      request,
      completed: (threadId, turnId) => {
        if (failure) throw failure;
        return completions.get(threadId)?.get(turnId);
      },
    });
  } finally {
    child.stdin.end();
    const terminate = setTimeout(() => child.kill(), 1_500);
    const forceExit = setTimeout(() => child.kill("SIGKILL"), 3_000);
    try {
      await closed;
    } finally {
      clearTimeout(terminate);
      clearTimeout(forceExit);
      lines.close();
    }
  }
}

export async function createPersistentCodexSource(profile: Profile, prompt: string) {
  return withAppServer(profile, async (server) => {
    const { thread } = await server.request<{ thread: Thread }>("thread/start", { cwd: profile.cwd, ephemeral: false, sandbox: "read-only", approvalPolicy: "never" });
    const { turn } = await server.request<{ turn: Turn }>("turn/start", { threadId: thread.id, clientUserMessageId: randomUUID(), input: [{ type: "text", text: prompt }] });
    await expect.poll(() => server.completed(thread.id, turn.id), { timeout: 20_000 }).toMatchObject({ id: turn.id, status: "completed" });
    const { thread: saved } = await server.request<{ thread: Thread }>("thread/read", { threadId: thread.id, includeTurns: true });
    expect(saved.id).toBe(thread.id);
    expect(saved.turns.map(({ id, status }) => ({ id, status }))).toEqual([{ id: turn.id, status: "completed" }]);
    expect(await realpath(saved.cwd)).toBe(await realpath(profile.cwd));
    if (!saved.path) throw new Error("Codex did not return a persisted rollout path");
    const file = await realpath(saved.path);
    expect(file.startsWith(path.join(await realpath(profile.home), "sessions") + path.sep)).toBe(true);
    return { id: saved.id, file, turnId: turn.id };
  });
}

/** Read the final provider view by UUID without loading or resuming the thread. */
export function readCodexSource(profile: Profile, id: string) {
  return withAppServer(profile, async (server) => {
    const { thread } = await server.request<{ thread: Thread }>("thread/read", { threadId: id, includeTurns: true });
    return thread;
  });
}
