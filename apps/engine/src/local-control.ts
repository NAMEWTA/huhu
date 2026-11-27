import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { rmSync } from "node:fs";
import { engineControlSocket, type EngineEndpointRecord } from "@huhu/vault";

export async function startLocalControl(endpoint: EngineEndpointRecord, rendererToken: string, stop: () => void): Promise<() => Promise<void>> {
  const socket = engineControlSocket(endpoint.rootBinding, true);
  // The Vault writer lock is already held. Remove a leftover socket from a dead writer.
  rmSync(socket, { force: true });
  const { cliToken, ...status } = endpoint;
  const authorized = Buffer.from(`Bearer ${cliToken}`);
  let stopping = false;
  const server = createServer((req, res) => {
    const supplied = Buffer.from(req.headers.authorization ?? "");
    if (authorized.length !== supplied.length || !timingSafeEqual(authorized, supplied)) {
      res.writeHead(403).end();
      return;
    }
    const attach = req.method === "GET" && req.url === "/attach";
    const shutdown = req.method === "POST" && req.url === "/stop";
    if (!attach && !shutdown && !(req.method === "GET" && req.url === "/status")) {
      res.writeHead(404).end();
      return;
    }
    if (attach && stopping) {
      res.writeHead(503).end();
      return;
    }
    if (shutdown && !stopping) {
      stopping = true;
      res.once("finish", stop);
    }
    res.writeHead(200, { "content-type": "application/json", connection: "close" });
    res.end(JSON.stringify({ status, ...(attach && { rendererToken }) }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket, resolve);
  });
  return () =>
    new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
}
