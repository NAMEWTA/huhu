import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:https";
import { fileURLToPath } from "node:url";
import { withFixtureCleanup, withFixtureDeadline } from "./candidate-desktop.js";

const tlsFixtures = new URL("../../../plugins/mail/test/fixtures/", import.meta.url);
export const gitFixtureCertificate = fileURLToPath(new URL("loopback-cert.pem", tlsFixtures));

type RequestRecord = { path: string; service: string | null; auth: "none" | "correct" | "other" };

// Smart HTTP fixture adapted from versioning/test/remote-auth.engine.test.ts.
export async function openGitAuthFixture(root: string, env: NodeJS.ProcessEnv, login: { username: string; token: string }) {
  const expected = `Basic ${Buffer.from(`${login.username}:${login.token}`).toString("base64")}`;
  const requests: RequestRecord[] = [];
  const backends = new Map<ChildProcess, Promise<void>>();

  function runBackend(request: IncomingMessage, response: ServerResponse, url: URL) {
    const child = spawn("git", ["http-backend"], {
      cwd: root,
      detached: true,
      env: {
        ...env,
        GIT_PROJECT_ROOT: root,
        GIT_HTTP_EXPORT_ALL: "1",
        REMOTE_USER: "fixture",
        REQUEST_METHOD: request.method,
        PATH_INFO: url.pathname,
        QUERY_STRING: url.search.slice(1),
        CONTENT_TYPE: request.headers["content-type"],
        CONTENT_LENGTH: request.headers["content-length"],
        HTTP_GIT_PROTOCOL: request.headers["git-protocol"]?.toString(),
        HTTP_CONTENT_ENCODING: request.headers["content-encoding"],
      },
      stdio: ["pipe", "pipe", "ignore"],
    });
    let headers: Buffer | null = Buffer.alloc(0);
    backends.set(
      child,
      new Promise<void>((resolve) => {
        child.once("close", (code) => {
          backends.delete(child);
          resolve();
          if (response.destroyed) return;
          if (!response.headersSent && (headers !== null || code !== 0)) response.writeHead(500);
          response.end();
        });
      }),
    );
    child.once("error", () => {
      if (!response.destroyed) response.writeHead(500).end();
    });
    child.stdin.on("error", () => undefined);
    request.pipe(child.stdin);
    child.stdout.on("data", (part: Buffer) => {
      if (response.destroyed) return;
      if (headers === null) {
        response.write(part);
        return;
      }
      headers = Buffer.concat([headers, part]);
      const boundary = headers.indexOf("\r\n\r\n");
      if (boundary === -1) return;
      for (const line of headers.subarray(0, boundary).toString("utf8").split("\r\n")) {
        const split = line.indexOf(":");
        if (split === -1) continue;
        const key = line.slice(0, split);
        const value = line.slice(split + 1).trim();
        if (key.toLowerCase() === "status") response.statusCode = Number(value.split(" ")[0]);
        else response.setHeader(key, value);
      }
      response.write(headers.subarray(boundary + 4));
      headers = null;
    });
  }

  const server = createServer({ cert: readFileSync(gitFixtureCertificate), key: readFileSync(new URL("loopback-key.pem", tlsFixtures)) }, (request, response) => {
    const url = new URL(request.url ?? "/", "https://127.0.0.1");
    const authorization = request.headers.authorization;
    const auth = !authorization ? "none" : authorization === expected ? "correct" : "other";
    requests.push({ path: url.pathname, service: url.searchParams.get("service"), auth });
    if (auth === "correct") runBackend(request, response, url);
    else response.writeHead(401, { "WWW-Authenticate": 'Basic realm="fixture"' }).end();
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address !== "string") resolve(address.port);
      else server.close(() => reject(new Error("Git 回环服务未取得端口")));
    });
  });

  return {
    base: `https://127.0.0.1:${port}`,
    requests,
    async close() {
      const closed = new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      const active = [...backends];
      const shutdown = Promise.allSettled([closed, ...active.map(([, exited]) => exited)] as const);
      await withFixtureCleanup(async () => {}, [
        ["断开 Git HTTPS 连接", () => server.closeAllConnections()],
        ...active.map(
          ([{ pid }]) =>
            [
              `终止 Git CGI 进程组 ${pid ?? "（未启动）"}`,
              () => {
                if (!pid) return;
                try {
                  process.kill(-pid, "SIGKILL");
                } catch (error) {
                  if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
                }
              },
            ] as const,
        ),
        [
          "等待 Git HTTPS 服务与 CGI 退出",
          async () => {
            const [listener] = await withFixtureDeadline(5_000, () => shutdown);
            if (listener.status === "rejected") throw listener.reason;
          },
        ],
      ]);
    },
  };
}
