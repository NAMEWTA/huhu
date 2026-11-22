import type { Client, ClientChannel } from "ssh2";

export class RemoteCommandError extends Error {
  constructor(readonly reason: "cancelled" | "disconnected" | "output-limit" | "denied" | "interrupted") {
    super(reason);
  }
}

export function captureSshCommand(client: Client, command: string, signal: AbortSignal, maxBytes: number, terminate = false): Promise<{ stdout: string; stderr: string; code: number | undefined }> {
  return new Promise((resolve, reject) => {
    let channel: ClientChannel | undefined;
    let finished = false;
    let code: number | undefined;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    const clear = () => {
      finished = true;
      signal.removeEventListener("abort", cancel);
      client.off("close", lost);
    };
    const stop = (stream: ClientChannel | undefined) => {
      if (terminate && stream) {
        try {
          stream.signal("TERM");
        } catch {
          // The transport may have already closed.
        }
      }
      stream?.close();
    };
    const fail = (error: Error) => {
      if (finished) return;
      clear();
      stop(channel);
      reject(error);
    };
    const cancel = () => fail(new RemoteCommandError("cancelled"));
    const lost = () => fail(new RemoteCommandError("disconnected"));
    const collect = (target: Buffer[], chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) fail(new RemoteCommandError("output-limit"));
      else if (!finished) target.push(chunk);
    };
    if (signal.aborted) return cancel();
    signal.addEventListener("abort", cancel, { once: true });
    client.once("close", lost);
    try {
      client.exec(command, (error, stream) => {
        if (finished) return stop(stream);
        if (error) return fail(new RemoteCommandError("denied"));
        channel = stream;
        stream.on("error", () => fail(new RemoteCommandError("interrupted")));
        stream.on("data", (chunk: Buffer) => collect(stdout, chunk));
        stream.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
        stream.on("exit", (status: number | undefined) => {
          code = status;
        });
        stream.once("close", () => {
          if (finished) return;
          clear();
          resolve({ stdout: Buffer.concat(stdout).toString("utf8").trim(), stderr: Buffer.concat(stderr).toString("utf8").trim(), code });
        });
      });
    } catch {
      lost();
    }
  });
}
