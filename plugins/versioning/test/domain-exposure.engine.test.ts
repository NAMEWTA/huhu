import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema } from "@huhu/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { run } from "../../../apps/cli/src/main.js";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { mcpRequest, mcpRpc, openMcpSession, openRecoverableMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { HerdrCore } from "../../agent-cli/src/engine/herdr-core.js";
import { GitRunner } from "../src/engine/git.js";
import { VaultGit } from "../src/engine/repo.js";
import { VaultSync } from "../src/engine/sync.js";

type Entry = "cli" | "mcp";
type Reply = z.infer<typeof CapabilityResultSchema>;
const work = new Map<string, RunningEngine>();
const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const [root, engine] of work) {
    try {
      await engine.shutdown();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  work.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function fixture(entry: Entry) {
  const root = mkdtempSync(path.join(tmpdir(), `huhu-domain-tools-${entry}-`));
  const profile = path.join(root, "profile");
  const vault = path.join(root, "vault");
  mkdirSync(profile);
  mkdirSync(vault);
  const protection = new TestProtection(profile);
  let engine = await boot({ vaultPath: vault, desktopUserData: profile, moduleCredentialProtection: protection, create: true });
  work.set(root, engine);
  const callDesktop = async (capability: string, input: unknown = {}) => {
    const reply = await engine.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
    if (!reply.ok) throw new Error(`${capability}: ${reply.error.code} ${reply.error.message}`);
    return reply.data;
  };
  await callDesktop("gateway.mcp.update", { enabled: true, transport: "http" });
  const gateway = z.object({ id: z.string(), token: z.string() }).parse(await callDesktop("gateway.tokens.create", { name: "isolated domain fixture" }));
  const endpoint = () => `http://127.0.0.1:${engine.port}/mcp`;
  let session = entry === "mcp" ? await openRecoverableMcpSession(endpoint(), gateway.token) : undefined;

  const cli = async (args: string[], discard = false) => {
    const output: string[] = [];
    await run([...args, "--vault", vault, "--json"], {
      out: (line) => {
        if (!discard) output.push(line);
      },
      err: (line) => {
        throw new Error(line);
      },
    });
    return discard ? undefined : JSON.parse(output.join(""));
  };
  const invoke = async (id: string, input: unknown, intent?: string, discard = false, handle = session?.handle) => {
    if (entry === "cli") {
      const reply = await cli(["call", id, "--input-json", JSON.stringify(input), ...(intent ? ["--intent-key", intent] : [])], discard);
      return discard ? undefined : CapabilityResultSchema.parse(reply);
    }
    const response = await mcpRequest(endpoint(), gateway.token, mcpRpc("tools/call", { name: id.replaceAll(".", "_"), arguments: input, ...(intent && { _meta: { "huhu.dev/intent-key": intent } }) }), handle);
    expect(response.status).toBe(200);
    if (discard) {
      await response.body!.cancel();
      return;
    }
    const { result } = z
      .object({
        result: z.object({
          isError: z.boolean().optional(),
          content: z.array(z.object({ text: z.string() })),
          structuredContent: z.object({ data: z.unknown(), opId: z.string().optional() }).optional(),
        }),
      })
      .parse(await response.json());
    return CapabilityResultSchema.parse(result.isError ? { ok: false, error: JSON.parse(result.content[0]!.text) } : { ok: true, ...result.structuredContent });
  };
  const tools = async () => {
    const list = z.array(z.object({ name: z.string(), _meta: z.record(z.string(), z.unknown()).optional() }));
    if (entry === "cli") return z.object({ data: list }).parse(await cli(["capabilities", "list"])).data;
    const response = await mcpRequest(endpoint(), gateway.token, mcpRpc("tools/list"), session!.handle);
    return z.object({ result: z.object({ tools: list }) }).parse(await response.json()).result.tools;
  };
  const operation = async (operationId: string) => {
    if (entry === "cli") return CapabilityResultSchema.parse(await cli(["operation", operationId]));
    const response = await mcpRequest(endpoint(), gateway.token, mcpRpc("resources/read", { uri: `huhu://operations/${operationId}` }), session!.handle);
    const { result } = z.object({ result: z.object({ contents: z.array(z.object({ text: z.string() })) }) }).parse(await response.json());
    return CapabilityResultSchema.parse(JSON.parse(result.contents[0]!.text));
  };
  const restart = async () => {
    await engine.shutdown();
    engine = await boot({ vaultPath: vault, desktopUserData: profile, moduleCredentialProtection: protection });
    work.set(root, engine);
    if (session) {
      expect((await mcpRequest(endpoint(), gateway.token, mcpRpc("tools/list"), session.handle)).status).toBe(404);
      session = await openRecoverableMcpSession(endpoint(), gateway.token, session.recovery);
    }
  };
  const put = (rel: string, bytes: string | Buffer) => {
    const target = path.join(vault, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    engine.index.refreshPaths([rel]);
  };
  const version = (rel: string) => engine.vault.files.currentVersion(rel);
  const get = (rel: string) => readFileSync(path.join(vault, rel), "utf8");
  const policy = z.object({ revision: z.number(), choices: z.record(z.string(), z.boolean()) });
  const currentPolicy = async () => z.object({ toolAccess: policy }).parse(await callDesktop("gateway.get")).toolAccess;
  const choose = async (id: string, exposed: boolean) => {
    const before = await currentPolicy();
    expect(await callDesktop("gateway.update", { capability: id, exposed })).toMatchObject({ revision: before.revision + 1, exposed });
  };

  return { root, vault, engine: () => engine, gateway, endpoint, callDesktop, invoke, tools, operation, restart, put, version, get, choose };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

function businessState(root: string, includeHistory = false): Record<string, string> {
  const state: Record<string, string> = {};
  const excluded = new Set([".huhu/runtime", ".huhu/gateway", ".huhu/writer.lock", ".huhu/cache", ".huhu/logs", ".huhu/ui"]);
  // The file watcher may record earlier fixture edits while unrelated rows are running.
  if (!includeHistory) excluded.add(".huhu/history");
  function visit(dir: string) {
    for (const child of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${child.name}` : child.name;
      if (excluded.has(rel)) continue;
      if (child.isDirectory()) {
        state[rel] = "directory";
        visit(rel);
      } else if (child.isFile()) {
        state[rel] = createHash("sha256")
          .update(readFileSync(path.join(root, rel)))
          .digest("hex");
      }
    }
  }
  visit("");
  return state;
}

const denied = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
const note = "Versioned.md";
const body = "synthetic versioned note contents";
const commitMessage = "synthetic private commit message";
const nameOf = (entry: Entry, id: string) => (entry === "mcp" ? id.replaceAll(".", "_") : id);

function success(reply: Reply | undefined) {
  if (!reply?.ok) throw Error(JSON.stringify(reply));
  return reply;
}

function git(root: string, ...args: string[]) {
  return execFileSync("git", ["-C", root, "-c", "user.name=Fixture", "-c", "user.email=fixture@localhost", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true }).trim();
}

async function isolatedRemote(f: Fixture) {
  const directory = path.join(f.root, "remotes");
  const repository = path.join(directory, "fixture.git");
  const peer = path.join(f.root, "peer");
  mkdirSync(directory);
  git(directory, "init", "--bare", "--quiet", "--initial-branch=main", repository);
  git(f.vault, "push", "--quiet", repository, "HEAD:main");
  git(directory, "clone", "--quiet", repository, peer);
  const update = (rel: string, contents: string) => {
    writeFileSync(path.join(peer, rel), contents);
    git(peer, "add", "--", rel);
    git(peer, "commit", "--quiet", "-m", "Remote synthetic edit");
    git(peer, "push", "--quiet", "origin", "main");
    git(repository, "update-server-info");
  };
  update("Incoming.md", "isolated remote fixture");
  const user = "fixture-user";
  const token = randomUUID();
  const authorization = "Basic " + Buffer.from(user + ":" + token).toString("base64");
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    if (request.headers.authorization !== authorization) {
      response.writeHead(401, { "WWW-Authenticate": 'Basic realm="fixture"' }).end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const file = path.resolve(directory, "." + url.pathname);
    if (!file.startsWith(repository + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/octet-stream" }).end(readFileSync(file));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Expected loopback Git fixture");
  return { target: `http://127.0.0.1:${address.port}/fixture.git`, user, token, requests: () => requests, update };
}

describe.each(["cli", "mcp"] as const)("%s Versioning and Safe audit", (entry) => {
  test("catalog and 23 actions are default off, individually authorized, revoked and reconciled after restart", { timeout: 90_000 }, async () => {
    const f = await fixture(entry);
    const configPath = path.join(f.root, "gitconfig");
    writeFileSync(configPath, "[init]\n\tdefaultBranch = main\n");
    vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
    vi.stubEnv("GIT_CONFIG_GLOBAL", configPath);
    const catalog = z
      .array(z.object({ name: z.string(), plugin: z.string(), scope: z.string().nullable(), risk: z.string().optional(), availability: z.string(), exposable: z.boolean(), selected: z.boolean().nullable() }))
      .parse(await f.callDesktop("capabilities.list"));
    const reviewed = catalog.filter((row) => row.plugin === "versioning" || row.name === "safe.audit.list");
    expect(reviewed).toHaveLength(23);
    for (const row of reviewed) {
      expect(row).toMatchObject({ availability: "active", exposable: true, selected: false });
      expect(f.engine().registry.getDescriptor(row.name)?.defaultExposed).toBe(false);
      expect(f.engine().registry.get(row.name)?.defaultExposed).toBe(false);
    }
    const core = vi.spyOn(HerdrCore.prototype, "ensure");
    const gitCalls = vi.spyOn(GitRunner.prototype, "run");
    const reads = new Set<string>();
    const replay: Array<{ id: string; input: object; key: string | undefined; reply: Reply }> = [];
    let network = () => 0;
    const repo = new VaultGit(f.vault);
    const sync = new VaultSync(f.vault);

    async function row(id: string, scope: string, risk: string, input: object, verify: (value: unknown) => void, mismatch?: object) {
      const state = () => businessState(f.vault, id.startsWith("history."));
      expect(reads.has(id), id).toBe(false);
      reads.add(id);
      expect(
        reviewed.find((entry) => entry.name === id),
        id,
      ).toMatchObject({ scope, risk });
      const name = nameOf(entry, id);
      const domain = id === "sync.auth.configure";
      const key = scope === "read" || domain ? undefined : randomUUID();
      expect(
        (await f.tools()).find((tool) => tool.name === name),
        id,
      ).toBeUndefined();
      expect(await f.invoke(id, input, key), id).toMatchObject(denied);
      await f.choose(id, true);
      const discovered = (await f.tools()).find((tool) => tool.name === name);
      expect(discovered, id).toBeDefined();
      if (entry === "mcp" && key) expect(discovered?._meta).toMatchObject({ "huhu.dev/intent-key": "required" });
      const before = state();
      const beforeNetwork = network();
      const beforeGit = gitCalls.mock.calls.length;
      if (key) {
        expect(await f.invoke(id, input), id).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
        expect(network()).toBe(beforeNetwork);
        expect(state(), id).toEqual(before);
      }
      const [result] = await Promise.all([f.invoke(id, input, key), f.invoke(id, input, key, true)]);
      expect(result, id).toMatchObject({ ok: true });
      const reply = success(result);
      verify(reply.data);

      if (scope === "read") {
        expect(network(), id).toBe(beforeNetwork);
        expect(state(), id).toEqual(before);
        if (["sync.get", "sync.auth.get", "sync.status", "conflicts.list", "safe.audit.list"].includes(id)) expect(gitCalls.mock.calls.length, id).toBe(beforeGit);
      } else {
        expect(await f.invoke(id, input, key), id).toEqual(reply);
        const after = state();
        const afterNetwork = network();
        expect(after, id).not.toEqual(before);
        if (mismatch) expect(await f.invoke(id, { ...input, ...mismatch }, key), id).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
        if (key) expect(await f.operation(reply.opId!), id).toMatchObject({ ok: true, data: { state: "completed" } });
        expect(state(), id).toEqual(after);
        expect(network(), id).toBe(afterNetwork);
        replay.push({ id, input, key, reply });
      }

      await f.choose(id, false);
      const afterRevoke = state();
      const afterRequests = network();
      expect(
        (await f.tools()).find((tool) => tool.name === name),
        id,
      ).toBeUndefined();
      expect(await f.invoke(id, input, key), id).toMatchObject(denied);
      if (key) expect(await f.operation(reply.opId!), id).toMatchObject(denied);
      expect(state(), id).toEqual(afterRevoke);
      expect(network(), id).toBe(afterRequests);
    }

    await row("git.status", "read", "normal", {}, (data) => expect(data).toMatchObject({ isRepo: false }));
    await row("history.timeline", "read", "normal", { path: note }, (data) => expect(data).toEqual([]));
    f.put(note, body);
    const snapshot = z.object({ id: z.string() });
    let checkpoint = "";
    await row(
      "history.checkpoint",
      "write",
      "normal",
      { path: note, title: "Fixture checkpoint", expectedVersion: f.version(note) },
      (data) => {
        checkpoint = snapshot.parse(data).id;
        expect(data).toMatchObject({ path: note, title: "Fixture checkpoint" });
      },
      { title: "A different title" },
    );
    await row("history.read", "read", "high", { path: note, entryId: checkpoint }, (data) => expect(data).toEqual({ text: body }));
    f.put(note, "altered fixture contents");
    await row(
      "history.restore",
      "write",
      "high",
      { path: note, entryId: checkpoint, expectedCurrentVersion: f.version(note) },
      (data) => {
        expect(data).toEqual({ restored: true });
        expect(f.get(note)).toBe(body);
      },
      { expectedCurrentVersion: "invalid-version" },
    );

    await row("git.init", "admin", "high", {}, (data) => expect(data).toMatchObject({ created: true }));
    await row("git.stage", "write", "normal", { paths: [note], expected: await repo.baseline() }, () => expect(git(f.vault, "diff", "--cached", "--name-only")).toBe(note), { paths: [".gitignore"] });
    await row("git.diff", "read", "high", { path: note, staged: true }, (data) => expect(data).toMatchObject({ diff: expect.stringContaining(body) }));
    await row(
      "git.unstage",
      "write",
      "normal",
      { paths: [note], expected: await repo.baseline() },
      () => {
        expect(git(f.vault, "diff", "--cached", "--name-only")).toBe("");
      },
      { paths: [".gitignore"] },
    );
    git(f.vault, "add", "--", note);
    await row(
      "git.commit",
      "write",
      "high",
      { message: commitMessage, expected: await repo.baseline() },
      (data) => {
        expect(data).toMatchObject({ id: git(f.vault, "rev-parse", "HEAD") });
        expect(git(f.vault, "rev-list", "--count", "HEAD")).toBe("1");
        expect(JSON.stringify(data)).not.toContain(commitMessage);
      },
      { message: "A different commit" },
    );
    await row("git.log", "read", "normal", { limit: 1 }, (data) => expect(data).toMatchObject([{ subject: commitMessage }]));

    const remote = await isolatedRemote(f);
    network = remote.requests;
    await row("sync.get", "read", "normal", {}, (data) => expect(data).toMatchObject({ remote: "", revision: sync.toolConfig().revision }));
    await row("sync.update", "admin", "high", { remote: remote.target, branch: "main", expectedRevision: sync.toolConfig().revision }, (data) => expect(data).toMatchObject({ remote: remote.target }), { branch: "other" });
    const authInput = { remote: remote.target, expectedRevision: null, operationId: randomUUID(), credential: { action: "replace", username: remote.user, token: remote.token } };
    let revision: string | null = null;
    await row(
      "sync.auth.configure",
      "admin",
      "high",
      authInput,
      (data) => {
        expect(data).toMatchObject({ state: "configured" });
        revision = z.object({ revision: z.uuidv4() }).parse(data).revision;
      },
      { credential: { action: "keep" } },
    );
    await row("sync.auth.get", "read", "normal", { remote: remote.target }, (data) => expect(data).toEqual({ state: "configured", revision }));
    const syncTarget = async () => {
      const { id, head } = await repo.baseline();
      return { repositoryId: id, head, remote: remote.target, branch: "main", authRevision: revision };
    };
    await row(
      "sync.preview",
      "execute",
      "high",
      { expected: await syncTarget() },
      (data) => {
        expect(data).toMatchObject({ pull: ["Incoming.md"], ahead: 0, behind: 1 });
        expect(network()).toBeGreaterThan(0);
      },
      { expected: { ...(await syncTarget()), branch: "other" } },
    );
    const beforePull = network();
    await row(
      "sync.run",
      "execute",
      "high",
      { mode: "pull", expected: await syncTarget() },
      (data) => {
        expect(data).toEqual({ pulled: true, pushed: false, committed: false });
        expect(f.get("Incoming.md")).toBe("isolated remote fixture");
        expect(network()).toBeGreaterThan(beforePull);
      },
      { mode: "push" },
    );

    async function conflict(round: string) {
      f.put(note, `local conflict for ${round}\n`);
      git(f.vault, "add", "--", note);
      git(f.vault, "commit", "--quiet", "-m", "Local synthetic edit");
      remote.update(note, `remote conflict for ${round}\n`);
      const reply = await f.engine().dispatcher.call("desktop", { capability: "sync.run", requestId: randomUUID(), idempotencyKey: randomUUID(), input: { mode: "pull" } });
      expect(reply).toMatchObject({ ok: false, error: { code: "GIT_CONFLICT" } });
      const listing = z.object({ id: z.string(), localHead: z.string(), remoteHead: z.string() }).parse(sync.conflictSummary());
      return { sessionId: listing.id, localHead: listing.localHead, remoteHead: listing.remoteHead };
    }
    const first = await conflict("resolve");
    await row("sync.status", "read", "normal", {}, (data) => expect(data).toMatchObject({ name: "conflict" }));
    await row("conflicts.list", "read", "normal", {}, (data) => expect(data).toMatchObject({ conflict: { id: first.sessionId, files: [{ path: note, kind: "blocks", blocks: 1 }] } }));
    await row("conflicts.read", "read", "high", { path: note, expected: first }, (data) => expect(data).toMatchObject({ path: note, kind: "blocks" }));
    await row(
      "conflicts.resolve",
      "execute",
      "high",
      { sessionId: first.sessionId, expected: first, resolutions: [{ path: note, blocks: [{ custom: "synthetic custom conflict text\n" }] }] },
      (data) => {
        expect(data).toEqual({ commit: git(f.vault, "rev-parse", "HEAD"), pushed: false });
        expect(f.get(note)).toBe("synthetic custom conflict text\n");
        expect(sync.conflictSummary()).toBeNull();
      },
      { resolutions: [{ path: note, blocks: ["ours"] }] },
    );
    const second = await conflict("cancel");
    await f.choose("conflicts.cancel", true);
    expect(await f.invoke("conflicts.cancel", { expected: first }, randomUUID())).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(sync.conflictSummary()?.id).toBe(second.sessionId);
    await f.choose("conflicts.cancel", false);
    await row(
      "conflicts.cancel",
      "write",
      "high",
      { expected: second },
      (data) => {
        expect(data).toEqual({ cancelled: true });
        expect(sync.conflictSummary()).toBeNull();
        expect(git(f.vault, "rev-parse", "HEAD")).toBe(second.localHead);
      },
      { expected: first },
    );

    const password = randomUUID();
    await f.callDesktop("safe.setup", { password });
    await f.callDesktop("safe.lock");
    await f.choose("safe.status", true);
    const session = z.object({ instanceId: z.uuid(), generation: z.number(), callerProof: z.string() }).parse(success(await f.invoke("safe.status", {})).data);
    await f.choose("safe.status", false);
    await row("safe.audit.list", "read", "high", { session, limit: 1 }, (data) => {
      expect(data).toMatchObject([{ action: "lock", result: "ok", itemId: null }]);
      expect(JSON.stringify(data)).not.toContain(password);
    });
    await f.choose("safe.audit.list", true);
    if (entry === "mcp") {
      const peer = await openMcpSession(f.endpoint(), f.gateway.token);
      expect(await f.invoke("safe.audit.list", { session }, undefined, false, peer)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    }
    await f.callDesktop("safe.unlock", { password });
    await f.callDesktop("safe.lock");
    expect(await f.invoke("safe.audit.list", { session })).toMatchObject({ ok: false, error: { code: "SAFE_LOCKED" } });
    await f.choose("safe.audit.list", false);

    expect(reads.size).toBe(reviewed.length);
    expect(core).not.toHaveBeenCalled();
    for (const { id } of replay) await f.choose(id, true);
    await f.restart();
    const requestsBeforeReplay = network();
    const afterRestart = businessState(f.vault);
    for (const { id, input, key, reply } of replay) {
      if (entry === "mcp" && id === "sync.auth.configure") {
        expect(await f.invoke(id, input), id).toMatchObject({ ok: false, error: { details: { outcome: "unknown" } } });
        await f.choose("sync.auth.get", true);
        expect(success(await f.invoke("sync.auth.get", { remote: remote.target })).data).toEqual({ state: "configured", revision });
        await f.choose("sync.auth.get", false);
        continue;
      }
      expect(await f.invoke(id, input, key), id).toEqual(reply);
    }
    expect(network()).toBe(requestsBeforeReplay);
    expect(Object.entries(businessState(f.vault)).filter(([key]) => key !== ".huhu/plugins.json")).toEqual(Object.entries(afterRestart).filter(([key]) => key !== ".huhu/plugins.json"));
    const runtime = f.engine().vault.runtimeDir;
    for (const name of ["invocation-intents.ndjson", "versioning-auth-intents.ndjson"]) {
      const ledger = readFileSync(path.join(runtime, name), "utf8");
      for (const privateValue of [body, password, remote.token, remote.user, f.gateway.token, commitMessage, "synthetic custom conflict text"]) expect(ledger).not.toContain(privateValue);
    }
  });
});

describe.each(["cli", "mcp"] as const)("%s Versioning object guards", (entry) => {
  test("rejects a different repository, protected paths, stale object versions and wrong network target", { timeout: 45_000 }, async () => {
    const f = await fixture(entry);
    const repo = new VaultGit(f.vault);
    const sync = new VaultSync(f.vault);

    const other = path.join(f.root, "other");
    mkdirSync(other);
    git(other, "init", "--quiet");
    const dotGit = path.join(f.vault, ".git");
    symlinkSync(path.join(other, ".git"), dotGit, process.platform === "win32" ? "junction" : "dir");
    await f.choose("git.init", true);
    expect(await f.invoke("git.init", {}, randomUUID())).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    rmSync(dotGit);
    expect(await f.invoke("git.init", {}, randomUUID())).toMatchObject({ ok: true });

    f.put(note, body);
    f.put("Other.md", "unrelated note");
    f.put(".huhu/fixture-private.md", "internal test fixture");
    const oldIndex = await repo.baseline();
    git(f.vault, "add", "--", "Other.md");
    const currentIndex = await repo.baseline();
    const checks = [
      { id: "git.stage", input: { paths: [note], expected: oldIndex }, code: "VERSION_CONFLICT" },
      { id: "git.stage", input: { paths: [note], expected: { ...currentIndex, id: "a different repository identity" } }, code: "VERSION_CONFLICT" },
      { id: "git.stage", input: { paths: [".huhu/fixture-private.md"], expected: currentIndex }, code: "PERMISSION_DENIED" },
      { id: "git.diff", input: { path: ".huhu/fixture-private.md" }, code: "PERMISSION_DENIED" },
      { id: "history.checkpoint", input: { path: note, title: "Stale checkpoint", expectedVersion: "wrong-version" }, code: "VERSION_CONFLICT" },
      { id: "history.checkpoint", input: { path: ".huhu/fixture-private.md", title: "Internal fixture", expectedVersion: f.version(".huhu/fixture-private.md") }, code: "PERMISSION_DENIED" },
      { id: "sync.update", input: { remote: "https://example.invalid/repo", expectedRevision: "wrong-revision" }, code: "VERSION_CONFLICT" },
      { id: "sync.update", input: { remote: other, expectedRevision: sync.toolConfig().revision }, code: "INVALID_INPUT" },
    ];
    for (const row of checks) {
      await f.choose(row.id, true);
      const before = businessState(f.vault);
      expect(await f.invoke(row.id, row.input, row.id === "git.diff" ? undefined : randomUUID()), row.id).toMatchObject({ ok: false, error: { code: row.code } });
      expect(businessState(f.vault), row.id).toEqual(before);
      await f.choose(row.id, false);
    }

    await f.choose("history.checkpoint", true);
    const checkpoint = z.object({ id: z.string() }).parse(success(await f.invoke("history.checkpoint", { path: note, title: "Known history", expectedVersion: f.version(note) }, randomUUID())).data);
    await f.choose("history.read", true);
    await f.choose("history.restore", true);
    expect(await f.invoke("history.read", { path: "Other.md", entryId: checkpoint.id })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await f.invoke("history.restore", { path: "Other.md", entryId: checkpoint.id, expectedCurrentVersion: f.version("Other.md") }, randomUUID())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(f.get("Other.md")).toBe("unrelated note");

    const inlineSecret = "synthetic-url-credential";
    f.put(".huhu/sync/config.json", JSON.stringify({ remote: `https://fixture:${inlineSecret}@example.invalid/repo` }));
    await f.choose("sync.get", true);
    const sanitized = success(await f.invoke("sync.get", {})).data;
    expect(sanitized).toMatchObject({ remote: "" });
    expect(JSON.stringify(sanitized)).not.toContain(inlineSecret);

    const target = "https://remote.invalid/fixture.git";
    await f.callDesktop("sync.update", { remote: target });
    const expected = { repositoryId: currentIndex.id, head: currentIndex.head, remote: "https://other.invalid/fixture.git", branch: "main", authRevision: null };
    await f.choose("sync.preview", true);
    await f.choose("sync.run", true);
    const network = vi.spyOn(GitRunner.prototype, "run");
    expect(await f.invoke("sync.preview", { expected }, randomUUID())).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(await f.invoke("sync.run", { mode: "pull", expected: { ...expected, remote: target, head: "0".repeat(40) } }, randomUUID())).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(await f.invoke("sync.run", { mode: "pull", expected: { ...expected, remote: target, authRevision: randomUUID() } }, randomUUID())).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(network.mock.calls.some(([args]) => args.includes("fetch") || args.includes("push"))).toBe(false);
    expect(git(f.vault, "remote")).toBe("");
  });
});

test("a disabled Versioning plugin preserves the catalog and the selected policy", async () => {
  const f = await fixture("cli");
  const name = "sync.get";
  const descriptor = f.engine().registry.getDescriptor(name);
  expect(descriptor).toBeDefined();
  await f.choose(name, true);
  expect(await f.callDesktop("plugins.setEnabled", { id: "versioning", enabled: false })).toMatchObject({ state: "disabled" });
  expect(f.engine().registry.getDescriptor(name)).toBe(descriptor);
  expect(f.engine().registry.get(name)).toBeUndefined();
  expect(await f.callDesktop("capabilities.list", { includeInactive: true })).toEqual(expect.arrayContaining([expect.objectContaining({ name, availability: "plugin-disabled", selected: true, exposable: true })]));
  expect(await f.invoke(name, {})).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
  expect(await f.callDesktop("plugins.setEnabled", { id: "versioning", enabled: true })).toMatchObject({ state: "active" });
  expect(f.engine().registry.getDescriptor(name)).toBe(descriptor);
  expect(await f.invoke(name, {})).toMatchObject({ ok: true });
});
