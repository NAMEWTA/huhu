import { randomUUID } from "node:crypto";
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
export function createHerdrLocalPty(core: { endpoint: string; ensure(): Promise<HerdrRpc> }, attach: Attach): LaunchLocalPty {
  return async ({ argv, cwd, signal }, view) => {
    const client = await core.ensure();
    signal.throwIfAborted();
    const launchId = randomUUID();
    const labels = { "huhu.ssh-local": launchId };
    const list = async () => {
      const { terminals } = await client.call<{ terminals: Terminal[] }>("terminal.list", { all: true, labels });
      return terminals.filter((terminal) => terminal.labels?.["huhu.ssh-local"] === launchId);
    };
    const remove = (terminal: string) => client.call("terminal.rm", { terminal }).catch(() => undefined);
    const kill = async (terminal: string) => {
      try {
        await client.call("terminal.kill", { terminal });
      } catch (reason) {
        if ((await list()).some(({ address, state }) => address === terminal && state !== "finished")) throw reason;
      }
      await remove(terminal);
    };

    let terminal: Terminal;
    try {
      terminal = await client.call<Terminal>("terminal.run", { argv, cwd, labels, name: `ssh-local-${launchId}`, no_parent: true, keep: false });
    } catch (reason) {
      // A lost reply can leave a launched terminal. Reconcile only this request's exact label.
      const found = await list().catch(() => []);
      await Promise.allSettled(found.map(({ address }) => kill(address)));
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
      await kill(terminal.address);
      throw reason;
    }

    let stopping: Promise<void> | undefined;
    let ended = false;
    let hostClosing = false;
    stream.onData(view.data);
    stream.onClose(() => {
      ended = true;
      if (!hostClosing) void kill(terminal.address).catch(() => undefined);
      view.end();
    });
    return {
      write: (buffer) => stream.write(buffer),
      resize: (cols, rows) => stream.resize(cols, rows),
      stop: () => {
        if (ended) return;
        hostClosing = true;
        stopping ??= kill(terminal.address)
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
