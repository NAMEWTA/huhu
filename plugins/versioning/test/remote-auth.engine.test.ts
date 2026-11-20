import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { CapabilityError, EngineClient } from "../../../packages/workbench/src/engine-client/client.js";
import { GitRunner, type RunOpts } from "../src/engine/git.js";
import { httpTarget } from "../src/engine/remote-auth.js";

type Auth = { revision: string | null; state: string };
const roots: string[] = [];
const engines: Array<{ engine: RunningEngine; client: EngineClient }> = [];
const servers: ReturnType<typeof createServer>[] = [];
const cgis = new Set<ReturnType<typeof spawn>>();
const testWindows = test.skipIf(process.platform !== "win32" || process.arch !== "x64");

function git(dir: string, ...args: string[]) {
  return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
}

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-git-owner-"));
  roots.push(root);
  const vaultPath = path.join(root, "vault");
  const profile = path.join(root, "profile");
  const remoteRoot = path.join(root, "remotes");
  for (const dir of [vaultPath, profile, remoteRoot]) mkdirSync(dir);
  const privateGitConfig = path.join(root, "gitconfig");
  writeFileSync(privateGitConfig, "");
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  vi.stubEnv("GIT_CONFIG_GLOBAL", privateGitConfig);
  git(vaultPath, "init", "--quiet", "--initial-branch=main");
  for (const name of ["a.git", "b.git"]) git(remoteRoot, "init", "--bare", "--quiet", "--initial-branch=main", name);
  const engine = await boot({ vaultPath, desktopUserData: profile, create: true });
  const client = new EngineClient({ baseUrl: `http://127.0.0.1:${engine.port}`, token: engine.rendererToken, vaultId: engine.vault.id });
  engines.push({ engine, client });
  return { root, vaultPath, remoteRoot, engine, client, privateGitConfig };
}

async function capture(pending: Promise<unknown>) {
  try {
    await pending;
    return "OK";
  } catch (error) {
    if (error instanceof CapabilityError) return error.code;
    throw new Error("Test client did not receive a Git capability result");
  }
}

function runBackend(root: string, req: IncomingMessage, res: ServerResponse, url: URL) {
  const subprocess = spawn("git", ["http-backend"], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_PROJECT_ROOT: root,
      GIT_HTTP_EXPORT_ALL: "1",
      REMOTE_USER: "fixture",
      REQUEST_METHOD: req.method,
      PATH_INFO: url.pathname,
      QUERY_STRING: url.search.slice(1),
      CONTENT_TYPE: req.headers["content-type"],
      CONTENT_LENGTH: req.headers["content-length"],
      HTTP_GIT_PROTOCOL: req.headers["git-protocol"]?.toString(),
      HTTP_CONTENT_ENCODING: req.headers["content-encoding"],
    },
    stdio: ["pipe", "pipe", "ignore"],
  });
  cgis.add(subprocess);
  subprocess.once("close", () => cgis.delete(subprocess));
  subprocess.stdin.on("error", () => undefined);
  subprocess.once("error", () => res.writeHead(500).end());
  req.pipe(subprocess.stdin);
  let headers: Buffer | null = Buffer.alloc(0);
  subprocess.stdout.on("data", (part: Buffer) => {
    if (headers === null) return void res.write(part);
    headers = Buffer.concat([headers, part]);
    const boundary = headers.indexOf("\r\n\r\n");
    if (boundary === -1) return;
    for (const line of headers.subarray(0, boundary).toString("utf8").split("\r\n")) {
      const split = line.indexOf(":");
      if (split === -1) continue;
      const key = line.slice(0, split);
      const value = line.slice(split + 1).trim();
      if (key.toLowerCase() === "status") res.statusCode = Number(value.split(" ")[0]);
      else res.setHeader(key, value);
    }
    res.write(headers.subarray(boundary + 4));
    headers = null;
  });
  subprocess.stdout.once("end", () => res.end());
}

async function remote(root: string, username: string, token: string, tls?: { cert: string; key: string }) {
  const expected = `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}`;
  const seen: Array<{ path: string; auth: "none" | "correct" | "other" }> = [];
  let afterAuth: ((req: IncomingMessage, res: ServerResponse) => void) | undefined;
  const handle = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://fixture.local");
    const auth = !req.headers.authorization ? "none" : req.headers.authorization === expected ? "correct" : "other";
    seen.push({ path: url.pathname, auth });
    if (auth !== "correct") return void res.writeHead(401, { "WWW-Authenticate": 'Basic realm="fixture"' }).end();
    if (afterAuth) return afterAuth(req, res);
    runBackend(root, req, res, url);
  };
  const server = tls ? createHttpsServer({ cert: readFileSync(tls.cert), key: readFileSync(tls.key) }, handle) : createServer(handle);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected loopback Git fixture");
  return {
    base: `${tls ? "https" : "http"}://127.0.0.1:${address.port}`,
    seen,
    afterAuth: (fn?: typeof afterAuth) => {
      afterAuth = fn;
    },
  };
}

function certificate(root: string) {
  const gitRoot = path.resolve(git(root, "--exec-path").trim(), "../../..");
  const cert = path.join(root, "fixture.crt");
  const key = path.join(root, "fixture.key");
  execFileSync(
    path.join(gitRoot, "usr", "bin", "openssl.exe"),
    ["req", "-new", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", key, "-out", cert, "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"],
    { cwd: root, stdio: "ignore", windowsHide: true },
  );
  return { cert, key };
}

function event() {
  let fire!: () => void;
  const promise = new Promise<void>((resolve) => {
    fire = resolve;
  });
  return { promise, fire };
}

afterEach(async () => {
  vi.restoreAllMocks();
  try {
    for (const { engine, client } of engines.splice(0).reverse()) {
      try {
        const current = await client.call<Auth>("sync.auth.get").catch(() => null);
        if (current?.revision && engine.moduleCredentialHost) {
          const { remote } = await client.call<{ remote: string }>("sync.get");
          await client.call("sync.auth.configure", { remote, expectedRevision: current.revision, credential: { action: "clear" } });
        }
      } finally {
        await engine.shutdown();
      }
    }
  } finally {
    for (const p of cgis) p.kill();
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
          }),
      ),
    );
    vi.unstubAllEnvs();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
});

test("HTTP 目标归一化端口和仓库，并拒绝 URL 内嵌认证材料与歧义路径", () => {
  expect(httpTarget("HTTPS://EXAMPLE.INVALID:443/team/%72epo.git/")).toBe("https://example.invalid/team/repo.git");
  expect(httpTarget("https://example.invalid:8443/team/repo.git")).toBe("https://example.invalid:8443/team/repo.git");
  expect(httpTarget("ssh://git@127.0.0.1/fixture.git")).toBeNull();
  for (const invalid of ["https://fixture@127.0.0.1/fixture.git", "https://127.0.0.1/fixture.git?fixture=value", "https://127.0.0.1/a%2Fb.git"]) {
    expect(() => httpTarget(invalid)).toThrow();
  }
});

testWindows(
  "真实 Git fetch/push 使用 Versioning 自有认证，换仓库或端口后不送旧认证",
  async () => {
    const live = await fixture();
    const user = `user-${randomUUID()}`;
    const token = `tok-${randomUUID()}!&^%`;
    const a = await remote(live.remoteRoot, user, token);
    const b = await remote(live.remoteRoot, user, token);
    const choose = (remote: string) => live.client.call("sync.update", { remote }, { write: true });
    const configure = (remote: string, expectedRevision: string | null) => live.client.call<Auth>("sync.auth.configure", { remote, expectedRevision, credential: { action: "replace", username: user, token } });
    const operation = (mode: "pull" | "push") => live.client.call("sync.run", { mode }, { write: true });
    const first = `${a.base}/a.git`;
    await choose(first);
    const setting = configure(first, null);
    expect(await capture(setting)).toBe("OK");
    const saved = await setting;
    expect(saved.state).toBe("configured");
    expect(await live.client.call("safe.status")).toMatchObject({ initialized: false });
    writeFileSync(path.join(live.vaultPath, "sample.md"), "fixture note");
    expect(await capture(operation("push"))).toBe("OK");
    expect(git(path.join(live.remoteRoot, "a.git"), "show", "main:sample.md")).toBe("fixture note");

    await live.client.call("safe.setup", { password: randomUUID() });
    await live.client.call("safe.lock");
    expect(await capture(operation("pull"))).toBe("OK");
    await live.client.call("plugins.setEnabled", { id: "safe", enabled: false }, { write: true });
    expect(await capture(operation("pull"))).toBe("OK");
    expect(a.seen.some((record) => record.auth === "correct")).toBe(true);

    await choose(`${a.base}/b.git`);
    expect(await capture(operation("pull"))).toBe("GIT_AUTH_FAILED");
    expect(a.seen.some((record) => record.path.startsWith("/b.git") && record.auth !== "none")).toBe(false);
    await choose(`${b.base}/b.git`);
    expect(await capture(operation("pull"))).toBe("GIT_AUTH_FAILED");
    expect(b.seen.some((record) => record.auth !== "none")).toBe(false);
    expect(await capture(configure(`${b.base}/b.git`, saved.revision))).toBe("OK");
    expect(await capture(operation("push"))).toBe("OK");
    expect(b.seen.some((record) => record.auth === "correct")).toBe(true);
    expect(git(path.join(live.remoteRoot, "b.git"), "ls-tree", "-r", "--name-only", "main").includes(".huhu/module-credentials/")).toBe(false);

    const body = JSON.stringify([await live.client.call("sync.get"), await live.client.call("sync.auth.get"), await live.client.call("capabilities.list")]);
    expect([user, token].some((secret) => body.includes(secret))).toBe(false);
    for (const file of [path.join(live.vaultPath, ".git", "config"), path.join(live.vaultPath, ".huhu", "sync", "config.json"), path.join(live.engine.vault.runtimeDir, "idempotency.ndjson"), live.privateGitConfig]) {
      const bytes = readFileSync(file);
      expect([user, token].some((secret) => bytes.includes(secret))).toBe(false);
    }
  },
  120_000,
);

testWindows(
  "HTTPS 认证绑定协议与主机，拒绝重定向、权限越界和取消后的请求",
  async () => {
    const live = await fixture();
    const tls = certificate(live.root);
    git(live.vaultPath, "config", "http.sslBackend", "openssl");
    git(live.vaultPath, "config", "http.sslCAInfo", tls.cert.replaceAll("\\", "/"));
    const user = `person-${randomUUID()}@example.test`;
    const token = `secret-${randomUUID()}!&^%`;
    const a = await remote(live.remoteRoot, user, token, tls);
    const b = await remote(live.remoteRoot, user, token, tls);
    const first = `${a.base}/a.git`;
    const repoB = `${b.base}/b.git`;
    const choose = (remote: string) => live.client.call("sync.update", { remote }, { write: true });
    const pull = () => live.client.call("sync.run", { mode: "pull" }, { write: true });
    await choose(first);
    const input = { remote: first, expectedRevision: null, credential: { action: "replace", username: user, token } };
    const saved = await live.client.call<Auth>("sync.auth.configure", input);
    const cli = new EngineClient({ ...live.client.endpoint, token: live.engine.cliToken });
    expect(await capture(cli.call("sync.auth.configure", input))).toBe("CAPABILITY_NOT_EXPOSED");
    const web = await live.engine.dispatcher.call("web:fixture", { capability: "sync.auth.configure", input, requestId: randomUUID() });
    expect(web).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(await capture(live.client.call("sync.auth.configure", input))).toBe("VERSION_CONFLICT");

    const gitRun = GitRunner.prototype.run;
    let sensitiveProcessInput = false;
    const launchers: string[] = [];
    vi.spyOn(GitRunner.prototype, "run").mockImplementation(function (this: GitRunner, args: string[], options?: RunOpts) {
      if (options?.env?.["GIT_ASKPASS"]) {
        launchers.push(options.env["GIT_ASKPASS"]);
        const material = JSON.stringify([args, options.env]);
        sensitiveProcessInput ||= material.includes(user) || material.includes(token);
      }
      return gitRun.call(this, args, options);
    });
    const trace = path.join(live.root, "forbidden-curl-trace.log");
    vi.stubEnv("GIT_TRACE_CURL", trace);
    expect(await capture(pull())).toBe("OK");
    writeFileSync(path.join(live.vaultPath, "tls.md"), "HTTPS fixture note");
    expect(await capture(live.client.call("sync.run", { mode: "push" }, { write: true }))).toBe("OK");
    expect(git(path.join(live.remoteRoot, "a.git"), "show", "main:tls.md")).toBe("HTTPS fixture note");
    expect(a.seen.some((record) => record.auth === "correct")).toBe(true);
    expect(existsSync(trace)).toBe(false);
    expect(sensitiveProcessInput).toBe(false);

    for (const different of [first.replace("https:", "http:"), first.replace("127.0.0.1", "localhost")]) {
      const requests = a.seen.length;
      await choose(different);
      expect(await live.client.call("sync.auth.get")).toMatchObject({ revision: saved.revision, state: "needs-reconfiguration" });
      expect(await capture(pull())).toBe("GIT_AUTH_FAILED");
      expect(a.seen.length).toBe(requests);
    }
    await choose(first);
    git(live.vaultPath, "config", `http.${first}.followRedirects`, "true");
    a.afterAuth((_req, reply) => reply.writeHead(302, { Location: `${repoB}/info/refs?service=git-upload-pack` }).end());
    const rejected = await pull().catch((error: CapabilityError) => error);
    expect(rejected instanceof CapabilityError).toBe(true);
    expect(b.seen).toHaveLength(0);
    a.afterAuth((_req, reply) => reply.writeHead(302, { Location: `${a.base}/b.git/info/refs?service=git-upload-pack` }).end());
    expect(await capture(pull())).not.toBe("OK");
    expect(a.seen.some((request) => request.path.startsWith("/b.git"))).toBe(false);

    a.afterAuth((_req, reply) => reply.writeHead(403).end(token));
    const denied = await pull().catch((error: CapabilityError) => error);
    expect(denied instanceof CapabilityError && denied.code === "GIT_AUTH_FAILED" && !JSON.stringify(denied).includes(token)).toBe(true);

    const authenticated = event();
    const disconnected = event();
    a.afterAuth((_req, reply) => {
      reply.once("close", disconnected.fire);
      authenticated.fire();
    });
    const cancel = new AbortController();
    const pending = live.engine.dispatcher.call("desktop", { capability: "sync.run", input: { mode: "pull" }, idempotencyKey: randomUUID(), requestId: randomUUID() }, cancel.signal);
    try {
      expect(await Promise.race([authenticated.promise.then(() => true), pending.then(() => false)])).toBe(true);
      const launcher = launchers.at(-1)!;
      expect(existsSync(launcher)).toBe(true);
      const secretOnDisk = readdirSync(path.dirname(launcher)).some((file) => readFileSync(path.join(path.dirname(launcher), file)).includes(token));
      expect(secretOnDisk).toBe(false);
      cancel.abort();
      expect((await pending).ok).toBe(false);
      await disconnected.promise;
      await expect.poll(() => existsSync(launcher), { timeout: 8000 }).toBe(false);
    } finally {
      cancel.abort();
      a.afterAuth();
    }
    expect(await capture(pull())).toBe("OK");
    expect(launchers.every((launcher) => !existsSync(launcher))).toBe(true);
    expect(sensitiveProcessInput).toBe(false);
  },
  120_000,
);
