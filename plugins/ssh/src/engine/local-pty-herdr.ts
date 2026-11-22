import { randomUUID } from "node:crypto";
import { HuhuError } from "@huhu/contracts";
import type { LaunchLocalPty } from "./local-shell.js";

type HerdrRpc = { call<T>(method: string, params: object): Promise<T> };
type Terminal = { address: string; state: string; labels?: Record<string, string> };
type Stream = {
  onData(handler: (buffer: Buffer) => void): void;
  onClose(handler: () => void): void;
  write(buffer: Buffer): void;
  resize(cols: number, rows: number): void;
  close(): void;
};
type Attach = (endpoint: string, options: { terminal: string; cols: number; rows: number }) => Promise<Stream>;

/** Wrap the application's existing Herdr Core and framed terminal client for standalone local shells. */
export function createHerdrLocalPty(core: { endpoint: string; ensure(): Promise<HerdrRpc>; peek(): Promise<HerdrRpc | "absent" | null> }, attach: Attach): LaunchLocalPty {
  return async ({ argv, cwd, signal }, view) => {
    const client = await core.ensure();
    signal.throwIfAborted();
    const launchId = randomUUID();
    const labels = { "huhu.ssh-local": launchId };
    const list = async (connection: HerdrRpc) => {
      const { terminals } = await connection.call<{ terminals: Terminal[] }>("terminal.list", { all: true, labels });
      return terminals.filter(({ address, labels }) => !address.includes("/") && labels?.["huhu.ssh-local"] === launchId);
    };
    const remove = async (connection: HerdrRpc, terminal: string) => {
      try {
        await connection.call("terminal.rm", { terminal });
      } catch (reason) {
        if ((await list(connection)).some(({ address }) => address === terminal)) throw reason;
      }
    };
    const kill = async (connection: HerdrRpc, terminal: string) => {
      try {
        await connection.call("terminal.kill", { terminal });
      } catch (reason) {
        if ((await list(connection)).some(({ address, state }) => address === terminal && state !== "finished")) throw reason;
      }
      await remove(connection, terminal);
    };
    const reconcileLaunch = async (): Promise<boolean> => {
      const connection = await core.peek();
      if (!connection || connection === "absent") return false;
      const found = await list(connection);
      await Promise.all(found.map(({ address, state }) => (state === "finished" ? remove(connection, address) : kill(connection, address))));
      return found.length > 0;
    };

    let terminal: Terminal;
    try {
      terminal = await client.call<Terminal>("terminal.run", { argv, cwd, labels, no_parent: true, keep: false });
    } catch (reason) {
      // A sent request can still be in flight. An empty list only confirms that it hasn't been observed.
      if (reason instanceof HuhuError && reason.code === "HERDR_UNAVAILABLE" && !(await reconcileLaunch().catch(() => false))) {
        throw new HuhuError("HERDR_UNAVAILABLE", "无法确认本地终端的启动和回收结果", { retryable: false, details: { outcome: "unknown" } });
      }
      throw reason;
    }

    let stream: Stream;
    try {
      signal.throwIfAborted();
      stream = await attach(core.endpoint, { terminal: terminal.address, cols: 80, rows: 24 });
      if (signal.aborted) {
        stream.close();
        signal.throwIfAborted();
      }
    } catch (reason) {
      await kill(client, terminal.address);
      throw reason;
    }

    let stopping: Promise<void> | undefined;
    let ended = false;
    let hostClosing = false;
    stream.onData(view.data);
    stream.onClose(() => {
      ended = true;
      if (!hostClosing) void kill(client, terminal.address).catch(() => undefined);
      view.end();
    });
    return {
      write: (buffer) => stream.write(buffer),
      resize: (cols, rows) => stream.resize(cols, rows),
      stop: () => {
        if (ended) return;
        hostClosing = true;
        stopping ??= kill(client, terminal.address)
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
