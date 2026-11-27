import { chmodSync, writeFileSync } from "node:fs";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const listen = (server: Server, endpoint: string) =>
  new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint, () => {
      server.off("error", reject);
      resolve();
    });
  });

/** Redirect the actual Core through a test-owned Unix socket. Only ordinary event subscriptions are reframed. */
export async function fragmentHerdrEvents(directory: string, binary: string, marker: Buffer) {
  const registration = path.join(directory, "register.sock");
  const launcher = path.join(directory, "herdr-fixture.cjs");
  const sockets = new Set<Socket>();
  const listeners = new Map<string, Server>();
  const boundaries: number[][] = [];
  let subscriptions = 0;
  function track(socket: Socket) {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    return socket;
  }

  const control = createServer((incoming) => {
    const socket = track(incoming);
    socket.once("data", async (data) => {
      try {
        const { address, upstreamPath } = JSON.parse(data.toString()) as { address: string; upstreamPath: string };
        if (!listeners.has(address)) {
          const relay = createServer((incoming) => {
            const client = track(incoming);
            const upstream = track(createConnection(upstreamPath));
            upstream.once("close", () => client.destroy());
            client.once("close", () => upstream.destroy());
            let request = Buffer.alloc(0);
            client.on("data", function firstRequest(part: Buffer) {
              request = Buffer.concat([request, part]);
              const newline = request.indexOf(10);
              if (newline < 0) return;
              client.off("data", firstRequest);
              let subscription = false;
              try {
                subscription = JSON.parse(request.subarray(0, newline).toString()).method === "events.subscribe";
              } catch {
                client.destroy();
                return;
              }
              if (subscription) {
                void (async () => {
                  let pending = Buffer.alloc(0);
                  let first = true;
                  for await (const part of upstream) {
                    pending = Buffer.concat([pending, Buffer.from(part)]);
                    for (let end = pending.indexOf(10); end >= 0; end = pending.indexOf(10)) {
                      const line = pending.subarray(0, end + 1);
                      pending = pending.subarray(end + 1);
                      if (first) {
                        first = false;
                        if (JSON.parse(line.toString()).result) subscriptions++;
                      }
                      const offset = line.indexOf(marker);
                      if (offset < 0 || JSON.parse(line.toString()).params?.type !== "status") {
                        client.write(line);
                        continue;
                      }
                      const cuts = [1, 4, 6]; // inside the three-byte CJK code point and twice inside the four-byte emoji
                      let start = 0;
                      for (const cut of cuts) {
                        client.write(line.subarray(start, offset + cut));
                        start = offset + cut;
                        await delay(30, undefined, { ref: false });
                      }
                      client.write(line.subarray(start));
                      boundaries.push(cuts.map((cut) => line[offset + cut]!));
                    }
                  }
                })().catch(() => client.destroy());
              } else upstream.pipe(client);
              upstream.write(request);
              client.pipe(upstream);
            });
          });
          await listen(relay, address);
          listeners.set(address, relay);
        }
        socket.end("ready");
      } catch (error) {
        socket.end(String(error));
      }
    });
  });
  writeFileSync(
    launcher,
    `#!${process.execPath}
const { spawnSync } = require("node:child_process");
const { createConnection } = require("node:net");
const address = process.env.HC_SOCKET;
const upstreamPath = address.replace(/\\.sock$/, "-r.sock");
const args = process.argv.slice(2);
const binary = ${JSON.stringify(binary)};
const env = { ...process.env, HC_SOCKET: upstreamPath };
const result = spawnSync(binary, args, { env, stdio: "inherit" });
if (result.status !== 0 || args[0] !== "server" || args[1] !== "start") process.exit(result.status ?? 1);
const control = createConnection(${JSON.stringify(registration)}, () => control.write(JSON.stringify({ address, upstreamPath })));
let reply = "";
function failed(error) {
  console.error(error);
  spawnSync(binary, ["server", "stop"], { env, timeout: 5000, stdio: "ignore" });
  process.exitCode = 1;
}
control.on("data", (part) => { reply += part; });
control.on("error", failed);
control.on("end", () => { if (reply !== "ready") failed(reply); });
`,
  );
  chmodSync(launcher, 0o700);
  await listen(control, registration);
  return {
    launcher,
    get subscriptions() {
      return subscriptions;
    },
    boundaries,
    async close() {
      for (const socket of sockets) socket.destroy();
      await Promise.all([control, ...listeners.values()].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    },
  };
}
