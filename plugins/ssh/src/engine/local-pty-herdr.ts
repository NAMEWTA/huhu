import { randomUUID } from "node:crypto";
import { HuhuError } from "@huhu/contracts";
import type { LaunchLocalPty } from "./local-shell.js";

type HerdrRpc = { call<T>(method: string, params: object, signal?: AbortSignal): Promise<T> };
type Terminal = { address: string; state: string; labels?: Record<string, string> };
type Stream = {
  onData(handler: (buffer: Buffer) => void): void;
  onClose(handler: () => void): void;
  write(buffer: Buffer): void;
  resize(cols: number, rows: number): void;
  close(): void;
};
type Attach = (endpoint: string, options: { terminal: string; cols: number; rows: number; signal: AbortSignal }) => Promise<Stream>;
const cleanupDeadline = () => AbortSignal.timeout(2000);
const unknownLaunch = () => new HuhuError("HERDR_UNAVAILABLE", "无法确认本地终端的启动和回收结果", { retryable: false, details: { outcome: "unknown" } });

/** Wrap the application's existing Herdr Core and framed terminal client for standalone local shells. */
export function createHerdrLocalPty(core: { endpoint: string; ensure(signal?: AbortSignal): Promise<HerdrRpc>; peek(signal?: AbortSignal): Promise<HerdrRpc | "absent" | null> }, attach: Attach): LaunchLocalPty {
  return async ({ argv, cwd, signal }, view) => {
    const client = await core.ensure(signal);
    signal.throwIfAborted();
    const launchId = randomUUID();
    const labels = { "huhu.ssh-local": launchId };
    const list = async (connection: HerdrRpc, deadline: AbortSignal) => {
      const { terminals } = await connection.call<{ terminals: Terminal[] }>("terminal.list", { all: true, labels }, deadline);
      return terminals.filter(({ address, labels }) => !address.includes("/") && labels?.["huhu.ssh-local"] === launchId);
    };
    const remove = async (connection: HerdrRpc, terminal: string, deadline: AbortSignal) => {
      try {
        await connection.call("terminal.rm", { terminal }, deadline);
      } catch (reason) {
        if ((await list(connection, deadline)).some(({ address }) => address === terminal)) throw reason;
      }
    };
    const kill = async (connection: HerdrRpc, terminal: string, deadline: AbortSignal) => {
      try {
        await connection.call("terminal.kill", { terminal }, deadline);
      } catch (reason) {
        if ((await list(connection, deadline)).some(({ address, state }) => address === terminal && state !== "finished")) throw reason;
      }
      await remove(connection, terminal, deadline);
    };
    const reconcileLaunch = async (): Promise<boolean> => {
      const deadline = cleanupDeadline();
      const connection = await core.peek(deadline);
      if (!connection || connection === "absent") return false;
      const found = await list(connection, deadline);
      await Promise.all(found.map(({ address, state }) => (state === "finished" ? remove(connection, address, deadline) : kill(connection, address, deadline))));
      return found.length > 0;
    };

    let terminal: Terminal;
    try {
      terminal = await client.call<Terminal>("terminal.run", { argv, cwd, labels, no_parent: true, keep: false }, signal);
    } catch (reason) {
      // A sent request can still be in flight. An empty list only confirms that it hasn't been observed.
      if ((signal.aborted || (reason instanceof HuhuError && reason.code === "HERDR_UNAVAILABLE")) && !(await reconcileLaunch().catch(() => false))) {
        throw unknownLaunch();
      }
      throw reason;
    }
    const stop = async () => {
      try {
        await kill(client, terminal.address, cleanupDeadline());
      } catch {
        if (!(await reconcileLaunch().catch(() => false))) throw unknownLaunch();
      }
    };

    let stream: Stream;
    try {
      signal.throwIfAborted();
      stream = await attach(core.endpoint, { terminal: terminal.address, cols: 80, rows: 24, signal });
      if (signal.aborted) {
        stream.close();
        signal.throwIfAborted();
      }
    } catch (reason) {
      await stop();
      throw reason;
    }

    let stopping: Promise<void> | undefined;
    let ended = false;
    let hostClosing = false;
    stream.onData(view.data);
    stream.onClose(() => {
      ended = true;
      if (!hostClosing) void stop().catch(() => undefined);
      view.end();
    });
    return {
      write: (buffer) => stream.write(buffer),
      resize: (cols, rows) => stream.resize(cols, rows),
      stop: () => {
        if (ended) return;
        hostClosing = true;
        stopping ??= stop()
          .then(() => stream.close())
          .catch((reason: unknown) => {
            hostClosing = false;
            stopping = undefined;
            throw reason;
          });
        return stopping;
      },
    };
  };
}
