import { readFileSync } from "node:fs";
import { createServer, type RequestListener } from "node:http";
import { createServer as createSecureServer } from "node:https";

export const aiFixtureCert = new URL("./loopback-cert.pem", import.meta.url);

export async function aiFixture(secure = false) {
  const requests: { path: string | undefined; authorization: string | undefined; body: unknown }[] = [];
  const behavior: { status?: number; redirect?: string; wait?: Promise<void>; text?: string; toolCalls?: unknown } = {};
  let interrupted = 0;
  const respond: RequestListener = (request, response) => {
    response.once("close", () => {
      if (!response.writableEnded) interrupted++;
    });
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({ path: request.url, authorization: request.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
      void Promise.resolve(behavior.wait).then(() => {
        if (response.destroyed) return;
        response.writeHead(behavior.status ?? 200, {
          "content-type": "application/json",
          ...(behavior.redirect && { location: behavior.redirect }),
        });
        response.end(JSON.stringify({ choices: [{ message: { content: behavior.text ?? "OK", tool_calls: behavior.toolCalls } }] }));
      });
    });
  };
  const server = secure ? createSecureServer({ key: readFileSync(new URL("./loopback-key.pem", import.meta.url)), cert: readFileSync(aiFixtureCert) }, respond) : createServer(respond);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Synthetic AI listener has no port.");
  return {
    url: `${secure ? "https" : "http"}://127.0.0.1:${address.port}/v1`,
    requests,
    behavior,
    get interrupted() {
      return interrupted;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
