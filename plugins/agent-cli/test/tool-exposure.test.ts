import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CapabilityResult } from "@huhu/contracts";
import { HerdrClient } from "@huhu/herdr-client";
import { VaultFiles } from "@huhu/vault";
import { afterEach, expect, test, vi } from "vitest";
import { run } from "../../../apps/cli/src/main.js";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { mcpRequest, mcpRpc, openRecoverableMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { agentToolDescriptors, HerdrCore, SessionsService } from "../src/engine/index.js";
import type { Terminal } from "../src/engine/launch-binding.js";
import { WaitingWatcher } from "../src/engine/waiting.js";
import { emptyLayout, type WorkspaceView } from "../src/shared/workspace-layout.js";
import type { Space } from "../src/shared/space.js";

const roots: string[] = [];
const engines = new Set<RunningEngine>();
const noExposure = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
const closed = ["agent.catalog.detect", "agent.targets.list", "agent.runs.dispatch", "agent.runs.inspect", "agent.runs.answer", "agent.runs.answer.inspect", "agent.runs.stop", "agent.runs.stop.inspect", "agent.sessions.release"];
const entries = ["CLI", "HTTP MCP"] as const;
type Entry = (typeof entries)[number];
let historyHome: string;

vi.mock("@huhu/plugin-agent-cli/engine", async (original) => {
  const agent = await original<typeof import("../src/engine/index.js")>();
  return {
    ...agent,
    apply: ((ctx, api, opts) => agent.apply(ctx, api, { ...opts, history: { home: historyHome, env: {} } })) satisfies typeof agent.apply,
  };
});

afterEach(async () => {
  for (const engine of engines) await engine.shutdown();
  engines.clear();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

function scratch() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-agent-tools-")));
  roots.push(base);
  return base;
}

async function start(vaultPath: string, create: boolean, desktopUserData?: string) {
  historyHome = path.dirname(vaultPath);
  const engine = await boot({
    vaultPath,
    create,
    ...(desktopUserData && {
      desktopUserData,
      moduleCredentialProtection: {
        read: () => Promise.reject(Error("fixture protected keyring")),
        create: () => Promise.reject(Error("fixture protected keyring")),
        remove: () => Promise.reject(Error("fixture protected keyring")),
      },
    }),
  });
  engines.add(engine);
  return engine;
}

async function stop(engine: RunningEngine) {
  await engine.shutdown();
  engines.delete(engine);
}

function unwrap<T>(result: CapabilityResult<T>): T {
  if (!result.ok) throw Error(JSON.stringify(result.error));
  return result.data;
}

function desktop(engine: RunningEngine) {
  return async <T = unknown>(capability: string, input: unknown = {}) => (await engine.dispatcher.call("desktop", { capability, requestId: randomUUID(), idempotencyKey: randomUUID(), input })) as CapabilityResult<T>;
}

async function external(entry: Entry, engine: RunningEngine, token: string, recovery?: string) {
  if (entry === "CLI") {
    const cli = async <T>(...args: string[]) => {
      const output: string[] = [];
      await run([...args, "--vault", engine.vault.root, "--json"], { out: (line) => output.push(line), err: (line) => output.push(line) });
      return JSON.parse(output.join("")) as CapabilityResult<T>;
    };
    return {
      call: <T = unknown>(name: string, input: unknown, key?: string) => cli<T>("call", name, "--input-json", JSON.stringify(input), ...(key ? ["--intent-key", key] : [])),
      list: async () => unwrap(await cli<{ name: string }[]>("capabilities", "list")).map(({ name }) => name),
      recovery: undefined,
    };
  }
  const endpoint = `http://127.0.0.1:${engine.port}/mcp`;
  const session = await openRecoverableMcpSession(endpoint, token, recovery);
  const rpc = async (method: string, params: unknown) => {
    const response = await mcpRequest(endpoint, token, mcpRpc(method, params), session.handle);
    expect(response.status).toBe(200);
    return ((await response.json()) as { result: { tools?: { name: string; inputSchema: unknown }[]; isError?: boolean; content?: { text: string }[]; structuredContent?: { data: unknown; opId?: string } } }).result;
  };
  return {
    call: async <T = unknown>(name: string, input: unknown, key?: string): Promise<CapabilityResult<T>> => {
      const result = await rpc("tools/call", { name: name.replaceAll(".", "_"), arguments: input, ...(key && { _meta: { "huhu.dev/intent-key": key } }) });
      if (result.isError) return { ok: false, error: JSON.parse(result.content![0]!.text) };
      return { ok: true, data: result.structuredContent?.data as T, ...(result.structuredContent?.opId && { opId: result.structuredContent.opId }) };
    },
    list: async () =>
      (await rpc("tools/list", {})).tools!.map(({ name, inputSchema }) => {
        expect(inputSchema).toMatchObject({ type: expect.any(String) });
        return name.replaceAll("_", ".");
      }),
    recovery: session.recovery,
  };
}

async function gateway(engine: RunningEngine, entry: Entry) {
  const manage = desktop(engine);
  const { token } = unwrap(await manage<{ token: string }>("gateway.tokens.create", { name: "agent-tools-fixture" }));
  unwrap(await manage("gateway.mcp.update", { enabled: true, transport: "http" }));
  const tool = await external(entry, engine, token);
  const configure = async (capability: string, exposed: boolean) => unwrap(await manage<{ revision: number }>("gateway.update", { capability, exposed }));
  const receipts = new Map<string, { input: unknown; key: string; completion: CapabilityResult<unknown> }>();

  async function withTool<T>(id: string, input: unknown, check: (key: string | undefined) => Promise<T>, key?: string) {
    expect(await tool.list()).not.toContain(id);
    expect(await tool.call(id, input, key)).toMatchObject(noExposure);
    const open = await configure(id, true);
    expect(await tool.list()).toContain(id);
    const result = await check(key);
    if (key) {
      const completion = await tool.call(id, input, key);
      expect(completion).toMatchObject({ ok: true, opId: expect.any(String) });
      receipts.set(id, { input, key, completion });
    }
    expect((await configure(id, false)).revision).toBe(open.revision + 1);
    expect(await tool.list()).not.toContain(id);
    expect(await tool.call(id, input, key)).toMatchObject(noExposure);
    return result;
  }
  async function reopen(desktopUserData?: string) {
    for (const id of receipts.keys()) await configure(id, true);
    await stop(engine);
    const reopened = await start(engine.vault.root, false, desktopUserData);
    const restored = await external(entry, reopened, token, tool.recovery);
    const before = snapshot(reopened.vault.root);
    for (const [id, { input, key, completion }] of receipts) expect(await restored.call(id, input, key)).toEqual(completion);
    expect(snapshot(reopened.vault.root)).toEqual(before);
    return { reopened, restored };
  }
  return { manage, tool, token, configure, withTool, reopen };
}

function coreFixture() {
  let document = { version: 0, value: null as unknown };
  let generation = 0;
  let dropRun = false;
  const terminals: Terminal[] = [];
  const rpc = vi.fn(async (method: string, input: Record<string, unknown>) => {
    switch (method) {
      case "hello":
        return { generation: 1, core: { id: "fixture-core" } };
      case "server.status":
        return { version: "fixture", core: { id: "fixture-core" }, pid: generation + 1 };
      case "doc.get":
        return document;
      case "doc.set":
        expect(input.version).toBe(document.version);
        document = { version: document.version + 1, value: input.value };
        return { version: document.version };
      case "terminal.list":
        return { terminals: [...terminals] };
      case "terminal.run": {
        const terminal: Terminal = {
          address: `fixture/t${terminals.length + 1}`,
          cwd: input.cwd as string,
          labels: input.labels as Record<string, string>,
          state: "live",
          pid: terminals.length + 1,
          created_ms: 101,
          finished_ms: null,
          exit_code: null,
        };
        if (input.argv) terminal.argv = input.argv as string[];
        terminals.push(terminal);
        if (dropRun) {
          dropRun = false;
          throw Error("fixture lost Core acknowledgement");
        }
        return terminal;
      }
      case "terminal.read":
        return { text: "fixture terminal output" };
      case "terminal.kill": {
        const terminal = terminals.find(({ address }) => address === input.terminal);
        expect(terminal).toBeDefined();
        Object.assign(terminal!, { state: "finished", finished_ms: 102, exit_code: 0 });
        return {};
      }
      case "terminal.interrupt":
      case "terminal.send":
        return {};
      default:
        throw Error(method);
    }
  });
  const client = { call: rpc } as unknown as HerdrClient;
  const ensure = vi.spyOn(HerdrCore.prototype, "ensure").mockResolvedValue(client);
  const peek = vi.spyOn(HerdrCore.prototype, "peek").mockResolvedValue(client);
  const connected = vi.spyOn(HerdrCore.prototype, "connected", "get").mockReturnValue(client);
  const restart = vi.spyOn(HerdrCore.prototype, "stop").mockImplementation(async () => {
    generation++;
  });
  vi.spyOn(WaitingWatcher.prototype, "poke").mockImplementation(() => {});
  return { rpc, ensure, peek, connected, restart, terminals, loseRunAnswer: () => (dropRun = true) };
}

function snapshot(root: string) {
  const dir = path.join(root, ".huhu", "agent-cli");
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => [path.join(entry.parentPath, entry.name), readFileSync(path.join(entry.parentPath, entry.name), "utf8")])
    .sort();
}

const keyFor = (id: string) => `fixture-${id.replaceAll(".", "-")}`;
const selectedSpace = (space: Space) => ({ spaceId: space.id, spaceRevision: space.revision });
const rootSpace = async (manage: ReturnType<typeof desktop>, root: string) => unwrap(await manage<Space[]>("agent.spaces.list")).find(({ root: dir }) => dir === root)!;

test.each(entries)("%s 默认关闭 Agent 目录，保持内部工具不可选并逐项验证无副作用读取", { timeout: 60_000 }, async (entry) => {
  const fixture = scratch();
  const root = path.join(fixture, "vault");
  mkdirSync(root);
  const engine = await start(root, true, fixture);
  const { manage, tool, withTool } = await gateway(engine, entry);
  const space = await rootSpace(manage, root);
  const selection = selectedSpace(space);
  const known = unwrap(await manage<{ name: string; plugin: string; exposable: boolean; exposed: boolean; scope: string; risk?: string }[]>("capabilities.list", { includeInactive: true })).filter(({ plugin }) => plugin === "agent-cli");
  expect(await tool.list()).toEqual([]);
  expect(known.every(({ exposed }) => !exposed)).toBe(true);
  const bulk = known.filter(({ exposable }) => exposable).map(({ name }) => ({ capability: name, exposed: true }));
  expect(bulk).toHaveLength(agentToolDescriptors.filter(({ exposable }) => exposable).length);
  expect(unwrap(await manage<{ targets: unknown[] }>("gateway.policy.preview", { changes: bulk })).targets).toHaveLength(bulk.length);
  for (const name of closed) {
    expect(known.find((item) => item.name === name)?.exposable).toBe(false);
    expect(await tool.call(name, {})).toMatchObject(noExposure);
    expect(await manage("gateway.policy.preview", { changes: [{ capability: name, exposed: true }] })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  }
  expect(known.filter(({ scope, risk }) => scope === "read" && risk === "high").length).toBeGreaterThan(1);
  expect(known.find(({ name }) => name === "agent.spaces.list")).toMatchObject({ risk: "normal" });
  expect(known.find(({ name }) => name === "agent.sessions.output")).toMatchObject({ risk: "high" });

  const secret = "fixture-secret-env-value";
  unwrap(await manage("agent.settings.update", { expectedRevision: 0, defaultAgent: "claude", agents: { claude: { args: [secret], env: { FIXTURE_SECRET: secret } } } }));
  writeFileSync(path.join(root, "fixture.txt"), "fixture body");
  execFileSync("git", ["init", "--quiet", root]);
  unwrap(await manage("agent.review.diff", { spaceId: space.id }));
  unwrap(await manage("agent.workspace.worktrees.list", selection));
  const ensure = vi.spyOn(HerdrCore.prototype, "ensure");
  const peek = vi.spyOn(HerdrCore.prototype, "peek");
  const dial = vi.spyOn(HerdrClient.prototype, "connect");
  const poke = vi.spyOn(WaitingWatcher.prototype, "poke");
  const reconcile = vi.spyOn(SessionsService.prototype, "reconcile");
  const read = async <T = unknown>(id: string, input: unknown, check: (result: CapabilityResult<T>) => void) =>
    withTool(id, input, async () => {
      const before = snapshot(root);
      const writes = vi.spyOn(VaultFiles.prototype, "write");
      try {
        const result = await tool.call<T>(id, input);
        check(result);
        expect(snapshot(root)).toEqual(before);
        expect(writes).not.toHaveBeenCalled();
      } finally {
        writes.mockRestore();
      }
    });
  await read("agent.spaces.list", {}, (r) => expect(r).toMatchObject({ ok: true, data: expect.arrayContaining([expect.objectContaining({ id: space.id, root })]) }));
  await read("agent.settings.get", {}, (r) => {
    expect(r).toMatchObject({ ok: true, data: { settings: { revision: 1, agents: { claude: {} } } } });
    expect(JSON.stringify(r)).not.toContain(secret);
  });
  await read("agent.launch.resolve", { agentId: "claude", mode: "headless", preview: true, prompt: secret }, (r) => {
    expect(r).toMatchObject({ ok: true, data: { argv: ["…"], env: {} } });
    expect(JSON.stringify(r)).not.toContain(secret);
  });
  await read("agent.sessions.list", { spaceId: space.id }, (r) => expect(r).toMatchObject({ ok: true, data: [] }));
  await read("agent.core.status", {}, (r) => expect(r).toMatchObject({ ok: true, data: { state: process.platform === "win32" ? "unavailable" : "idle" } }));
  await read("agent.workspace.get", { spaceId: space.id }, (r) => {
    if (process.platform === "win32") expect(r).toMatchObject({ ok: false, error: { code: "HERDR_UNAVAILABLE" } });
    else expect(r).toMatchObject({ ok: true, data: { version: 0 } });
  });
  await read("agent.workspace.files.list", { ...selection, directory: "" }, (r) => expect(r).toMatchObject({ ok: true }));
  await read("agent.workspace.files.open", { ...selection, path: "fixture.txt" }, (r) => expect(r).toMatchObject({ ok: true, data: { kind: "text", text: "fixture body" } }));
  await read("agent.workspace.files.open", { ...selection, path: ".huhu/vault.json" }, (r) => expect(r).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } }));
  await read("agent.review.diff", selection, (r) => expect(r).toMatchObject({ ok: true, data: { isRepo: true, observedAt: expect.any(String), files: expect.arrayContaining([expect.objectContaining({ path: "fixture.txt" })]) } }));
  await read("agent.workspace.worktrees.list", selection, (r) => expect(r).toMatchObject({ ok: true, data: { repository: root, observedAt: expect.any(String) } }));
  await read("agent.history.list", { spaceId: space.id }, (r) => expect(r).toMatchObject({ ok: true, data: { entries: [] } }));
  await read("agent.launch.environments.list", {}, (r) => expect(r).toMatchObject({ ok: true, data: { profiles: [] } }));
  await read("agent.launch.environments.preview", { ...selection, provider: "shell", environment: { id: randomUUID(), revision: randomUUID() } }, (r) => expect(r).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } }));
  for (const spy of [ensure, peek, dial, poke, reconcile]) expect(spy).not.toHaveBeenCalled();
});

type SessionView = {
  id: string;
  requestId: string;
  generation: string;
  revision: string;
  state: string;
};

test.each(entries)("%s 核对会话、布局和审查的当前对象代次，同意图只执行一次", { timeout: 60_000 }, async (entry) => {
  const fixture = scratch();
  const root = path.join(fixture, "vault");
  mkdirSync(root);
  const core = coreFixture();
  const engine = await start(root, true);
  const { manage, tool, configure, withTool, token, reopen } = await gateway(engine, entry);
  const space = await rootSpace(manage, root);
  const selection = selectedSpace(space);
  const launch = { ...selection, provider: "shell", requestId: "original-fixture-launch" };
  const calls = (method: string) => core.rpc.mock.calls.filter(([name]) => name === method).length;
  const once = async <T>(id: string, input: unknown, measure?: () => number) =>
    withTool(
      id,
      input,
      async (key) => {
        const before = measure?.();
        expect(await tool.call(id, input)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
        const [one, two] = await Promise.all([tool.call<T>(id, input, key), tool.call<T>(id, input, key)]);
        expect(two).toEqual(one);
        expect(one).toMatchObject({ ok: true, opId: expect.any(String) });
        if (before !== undefined) expect(measure?.()).toBe(before + 1);
        return unwrap(one);
      },
      keyFor(id),
    );

  const sess = await withTool("agent.sessions.launch", launch, async () => {
    core.loseRunAnswer();
    const [first, second] = await Promise.all([tool.call<SessionView>("agent.sessions.launch", launch), tool.call<SessionView>("agent.sessions.launch", launch)]);
    const live = unwrap(first);
    expect(second).toMatchObject({ ok: true, data: { id: live.id, state: "running" } });
    expect(live).toMatchObject({ state: "running", requestId: launch.requestId });
    expect(await tool.call("agent.sessions.launch", { ...launch, provider: "claude" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
    return live;
  });
  expect(calls("terminal.run")).toBe(1);
  const scope = { ...selection, id: sess.id, generation: sess.generation };
  const recovery = { ...scope, requestId: launch.requestId };
  await withTool("agent.sessions.recover", recovery, async () => {
    expect(await tool.call("agent.sessions.recover", recovery)).toMatchObject({ ok: true, data: { id: sess.id, state: "running" } });
    if (entry === "HTTP MCP") {
      const other = await external(entry, engine, token);
      expect(await other.call("agent.sessions.recover", recovery)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    }
  });
  expect(calls("terminal.run")).toBe(1);
  const peekBefore = core.peek.mock.calls.length;
  const ensureBefore = core.ensure.mock.calls.length;
  const pokeBefore = vi.mocked(WaitingWatcher.prototype.poke).mock.calls.length;
  await withTool("agent.sessions.output", scope, async () => {
    const before = snapshot(root);
    expect(await tool.call("agent.sessions.output", scope)).toMatchObject({ ok: true, data: { complete: true, text: "fixture terminal output" } });
    expect(await tool.call("agent.sessions.output", { ...scope, spaceId: "wrong-space" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await tool.call("agent.sessions.output", { ...scope, generation: "old" })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(snapshot(root)).toEqual(before);
  });
  const view = await withTool("agent.workspace.get", { spaceId: space.id }, async () => unwrap(await tool.call<WorkspaceView>("agent.workspace.get", { spaceId: space.id })));
  expect(core.peek).toHaveBeenCalledTimes(peekBefore);
  expect(core.ensure).toHaveBeenCalledTimes(ensureBefore);
  expect(WaitingWatcher.prototype.poke).toHaveBeenCalledTimes(pokeBefore);
  expect(calls("terminal.read")).toBe(1);

  const renamed = await once<SessionView>("agent.sessions.rename", { ...scope, name: "new fixture name", expectedRevision: sess.revision });
  expect(renamed.revision).not.toBe(sess.revision);
  expect(renamed).toMatchObject({ name: "new fixture name" });
  const saved = await once<WorkspaceView>("agent.workspace.save", { ...selection, baseVersion: view.version, layout: emptyLayout(space.id) }, () => calls("doc.set"));
  const workspaceLaunch = { ...selection, provider: "shell", requestId: "workspace-fixture-launch", baseVersion: saved.version, target: { kind: "tab" } };
  const attached = await withTool("agent.workspace.launch", workspaceLaunch, async () => {
    type Attached = { sessionId: string; workspace: WorkspaceView; placement: { tab: string; leaf: string } };
    const [one, two] = await Promise.all([tool.call<Attached>("agent.workspace.launch", workspaceLaunch), tool.call<Attached>("agent.workspace.launch", workspaceLaunch)]);
    expect(two).toEqual(one);
    return unwrap(one);
  });
  expect(calls("terminal.run")).toBe(2);
  const close = { ...selection, ...attached.placement, baseVersion: attached.workspace.version, sessionId: attached.sessionId, terminate: false };
  await withTool(
    "agent.workspace.close",
    close,
    async (key) => {
      expect(await tool.call("agent.workspace.close", { ...close, terminate: true }, "blocked-termination")).toMatchObject(noExposure);
      expect(await tool.call("agent.workspace.close", close, key)).toMatchObject({ ok: true, data: { version: attached.workspace.version + 1 } });
      expect(await tool.call("agent.workspace.close", close, key)).toMatchObject({ ok: true, data: { version: attached.workspace.version + 1 } });
      expect(await tool.call("agent.workspace.close", close, "stale-layout-close")).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    },
    keyFor("agent.workspace.close"),
  );
  expect(calls("terminal.kill")).toBe(0);
  const environment = { id: randomUUID(), revision: randomUUID() };
  const approval = "0".repeat(64);
  const preview = { ...selection, provider: "shell", environment };
  const nativePreview = vi.spyOn(SessionsService.prototype, "previewEnvironment").mockResolvedValue({
    environment: { ...environment, approval },
    cwd: root,
    argv: ["fixture-term", "private-argument"],
    ordinaryNames: ["FIXTURE_ENV"],
    protectedNames: ["FIXTURE_KEY"],
  });
  unwrap(await manage("agent.launch.environments.preview", preview));
  await withTool("agent.launch.environments.preview", preview, async () => {
    const view = unwrap(await tool.call("agent.launch.environments.preview", preview));
    expect(view).toMatchObject({ environment, argv: ["fixture-term", "…"], ordinaryNames: ["FIXTURE_ENV"], protectedNames: ["FIXTURE_KEY"] });
    expect(JSON.stringify(view)).not.toContain(approval);
    expect(nativePreview).toHaveBeenCalledTimes(1);
  });
  nativePreview.mockRestore();
  const protectedLaunch = { ...workspaceLaunch, requestId: "protected-fixture-launch", environment: { ...environment, approval: "1".repeat(64) } };
  await withTool("agent.workspace.launchProtected", protectedLaunch, async () => {
    expect(await tool.call("agent.workspace.launchProtected", protectedLaunch)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  });
  expect(calls("terminal.run")).toBe(2);

  writeFileSync(path.join(root, "review.txt"), "line one\n");
  execFileSync("git", ["init", "--quiet", root]);
  unwrap(await manage("agent.review.diff", { spaceId: space.id }));
  await configure("agent.review.diff", true);
  const { diffRevision } = unwrap(await tool.call<{ diffRevision: string }>("agent.review.diff", selection));
  await configure("agent.review.diff", false);
  const commentScope = { ...selection, sessionId: sess.id, expectedRevision: renamed.revision, generation: sess.generation };
  const text = "fixture private review body";
  const comment = await once<{ id: string }>("agent.review.comment.add", { ...commentScope, path: "review.txt", line: 1, side: "new", text, diffRevision });
  expect(JSON.stringify(comment)).not.toContain(text);
  const interim = await withTool("agent.sessions.list", { spaceId: space.id }, async () => unwrap(await tool.call<SessionView[]>("agent.sessions.list", { spaceId: space.id })).find(({ id }) => id === sess.id)!);
  await withTool("agent.review.comments", commentScope, async () => expect(await tool.call("agent.review.comments", commentScope)).toMatchObject({ ok: true, data: [expect.objectContaining({ id: comment.id, text })] }));
  const send = { ...commentScope, commentIds: [comment.id], expectedRevision: interim.revision };
  await withTool(
    "agent.review.send",
    send,
    async (key) => {
      expect(await tool.call("agent.review.send", { ...send, dryRun: true }, "review-fixture-preview")).toMatchObject({ ok: true, data: { sent: 0 } });
      expect(calls("terminal.send")).toBe(0);
      const [first, second] = await Promise.all([tool.call("agent.review.send", send, key), tool.call("agent.review.send", send, key)]);
      expect(second).toEqual(first);
      expect(first).toMatchObject({ ok: true, data: { sent: 1 } });
      expect(JSON.stringify(first)).not.toContain(text);
      expect(await tool.call("agent.review.send", { ...send, commentIds: ["different"] }, key)).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
    },
    keyFor("agent.review.send"),
  );
  expect(calls("terminal.send")).toBe(1);
  const latest = await withTool("agent.sessions.list", { spaceId: space.id }, async () => unwrap(await tool.call<SessionView[]>("agent.sessions.list", { spaceId: space.id })).find(({ id }) => id === sess.id)!);
  await once("agent.review.comment.delete", { ...commentScope, expectedRevision: latest.revision, commentId: comment.id });
  expect(unwrap(await manage("agent.review.comments", { sessionId: sess.id }))).toEqual([]);
  await once("agent.sessions.interrupt", scope, () => calls("terminal.interrupt"));
  await once("agent.sessions.kill", scope, () => calls("terminal.kill"));
  expect(calls("terminal.kill")).toBe(1);

  const beforeRestart = core.restart.mock.calls.length;
  const started = await once<{ coreId: string; pid: number }>("agent.core.restart", { expectedCoreId: "fixture-core", expectedPid: 1 }, () => core.restart.mock.calls.length);
  expect(started).toMatchObject({ coreId: "fixture-core", pid: 2 });
  expect(core.restart).toHaveBeenCalledTimes(beforeRestart + 1);
  for (const id of ["agent.sessions.launch", "agent.sessions.list"]) await configure(id, true);
  const actions = core.rpc.mock.calls.length;
  const { restored } = await reopen();
  expect(core.rpc).toHaveBeenCalledTimes(actions);
  const replay = await restored.call("agent.sessions.launch", launch);
  if (entry === "CLI") expect(replay).toMatchObject({ ok: true, data: { id: sess.id } });
  else expect(replay).toMatchObject({ ok: false, error: { code: "INTERNAL", details: { outcome: "unknown" } } });
  expect(await restored.call("agent.sessions.list", { spaceId: space.id })).toMatchObject({ ok: true, data: expect.arrayContaining([expect.objectContaining({ id: sess.id })]) });
  expect(calls("terminal.run")).toBe(2);
});

test.each(entries)("%s 外部设置回执脱敏，Space 与环境变更并发及重开仍只生效一次", { timeout: 60_000 }, async (entry) => {
  const fixture = scratch();
  const root = path.join(fixture, "vault");
  const sub = path.join(root, "new-space");
  mkdirSync(sub, { recursive: true });
  const engine = await start(root, true, fixture);
  const { manage, tool, withTool, reopen } = await gateway(engine, entry);
  const twice = async <T>(id: string, input: unknown, key?: string) => {
    const [one, two] = await Promise.all([tool.call<T>(id, input, key), tool.call<T>(id, input, key)]);
    expect(two).toEqual(one);
    expect(one).toMatchObject({ ok: true, opId: expect.any(String) });
    return unwrap(one);
  };

  const spaceInput = { name: "tool space", root: sub };
  const space = await withTool(
    "agent.spaces.save",
    spaceInput,
    async (key) => {
      expect(await tool.call("agent.spaces.save", { name: "off-scope", root: fixture }, "off-scope-space")).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      expect(await tool.call("agent.spaces.save", spaceInput)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      const saved = await twice<Space>("agent.spaces.save", spaceInput, key);
      expect(await tool.call("agent.spaces.save", { ...spaceInput, name: "other" }, key)).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
      expect(await tool.call("agent.spaces.save", { ...spaceInput, id: saved.id }, "missing-space-rev")).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      return saved;
    },
    keyFor("agent.spaces.save"),
  );
  expect(unwrap(await manage<Space[]>("agent.spaces.list")).filter(({ root }) => root === sub)).toEqual([space]);

  const deletion = { id: space.id, expectedRevision: space.revision };
  await withTool(
    "agent.spaces.delete",
    deletion,
    async (key) => {
      expect(await tool.call("agent.spaces.delete", { ...deletion, expectedRevision: 2 }, "old-space-delete")).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      await twice("agent.spaces.delete", deletion, key);
    },
    keyFor("agent.spaces.delete"),
  );
  expect(unwrap(await manage<Space[]>("agent.spaces.list")).some(({ id }) => id === space.id)).toBe(false);

  const value = "fixture-value-must-not-enter-receipts";
  const env = { name: "fixture profile", provider: "shell", ordinary: [{ name: "FIXTURE_VALUE", value }], protectedNames: [], changes: [], expectedRevision: null };
  const profile = await withTool(
    "agent.launch.environments.save",
    env,
    async (key) => {
      const saved = await twice<{ id: string; revision: string }>("agent.launch.environments.save", env, key);
      expect(saved).toMatchObject({ ordinary: [{ name: "FIXTURE_VALUE" }] });
      expect(JSON.stringify(saved)).not.toContain(value);
      return saved;
    },
    keyFor("agent.launch.environments.save"),
  );
  await withTool("agent.launch.environments.list", {}, async () => {
    const list = await tool.call("agent.launch.environments.list", {});
    expect(list).toMatchObject({ ok: true, data: { profiles: [expect.objectContaining({ id: profile.id, ordinary: [{ name: "FIXTURE_VALUE" }] })] } });
    expect(JSON.stringify(list)).not.toContain(value);
  });
  const remove = { id: profile.id, expectedRevision: profile.revision };
  await withTool("agent.launch.environments.remove", remove, (key) => twice("agent.launch.environments.remove", remove, key), keyFor("agent.launch.environments.remove"));
  expect(unwrap(await manage("agent.launch.environments.list"))).toMatchObject({ profiles: [] });

  const setting = { expectedRevision: 0, defaultAgent: "claude", agents: { claude: { env: { FIXTURE_VALUE: value }, args: [value] } } };
  const id = "agent.settings.update";
  const key = keyFor(id);
  const changed = await withTool(
    id,
    setting,
    async () => {
      expect(await tool.call(id, { ...setting, agents: { codex: { command: path.join(root, "no-such-program") } } }, "bad-setting-command")).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      const result = await twice(id, setting, key);
      expect(result).toMatchObject({ revision: 1, agents: { claude: {} } });
      expect(JSON.stringify(result)).not.toContain(value);
      return result;
    },
    key,
  );
  const { reopened, restored } = await reopen(fixture);
  expect(await restored.call(id, setting, key)).toMatchObject({ ok: true, data: changed });
  expect(unwrap(await desktop(reopened)("agent.settings.get"))).toMatchObject({ settings: { revision: 1, agents: { claude: { env: { FIXTURE_VALUE: value } } } } });
  const runtime = reopened.vault.runtimeDir;
  for (const name of readdirSync(runtime).filter((name) => name.endsWith(".ndjson") || name.includes("operation"))) {
    if (
      !readdirSync(runtime, { withFileTypes: true })
        .find((entry) => entry.name === name)
        ?.isFile()
    )
      continue;
    expect(readFileSync(path.join(runtime, name), "utf8")).not.toContain(value);
  }
});

test.each(entries)("%s Pi 历史绑定指定 Space 和来源版本，重开按原启动回读", { timeout: 60_000 }, async (entry) => {
  const fixture = scratch();
  const root = path.join(fixture, "vault");
  const project = path.join(root, "project");
  const otherDirectory = path.join(root, "other");
  const history = path.join(fixture, ".pi", "agent", "sessions", "--project--");
  for (const directory of [project, otherDirectory, history]) mkdirSync(directory, { recursive: true });
  const source = path.join(history, "source.jsonl");
  const second = path.join(history, "second.jsonl");
  const journal = (nativeId: string, title: string) =>
    [
      { type: "session", version: 3, id: nativeId, cwd: project },
      { type: "message", id: "prompt", parentId: null, message: { role: "user", content: [{ type: "text", text: title }] } },
    ]
      .map((row) => JSON.stringify(row))
      .join("\n") + "\n";
  const bytes = journal("fixture-native-id", "Original history text");
  writeFileSync(source, bytes);
  writeFileSync(second, journal("fixture-second-id", "Second history text"));
  const core = coreFixture();
  const engine = await start(root, true);
  const { manage, tool, token, configure, withTool } = await gateway(engine, entry);
  const space = unwrap(await manage<Space>("agent.spaces.save", { name: "Source", root: project }));
  const other = unwrap(await manage<Space>("agent.spaces.save", { name: "Other", root: otherDirectory }));
  const bin = process.platform === "win32" ? path.join(fixture, "fixture-pi.cmd") : path.join(fixture, "fixture-pi");
  const description = process.platform === "win32" ? "@echo off\r\necho   --session PATH\r\n" : "#!/bin/sh\nprintf '  --session PATH\\n'\n";
  writeFileSync(bin, description, { mode: 0o755 });
  unwrap(await manage("agent.settings.update", { expectedRevision: 0, defaultAgent: "pi", agents: { pi: { command: bin } } }));
  const selection = selectedSpace(space);
  const query = { spaceId: space.id, provider: "pi" };
  const histories = await withTool("agent.history.list", query, async () => {
    const peek = core.peek.mock.calls.length;
    const rows = unwrap(await tool.call<{ entries: Array<{ historyId: string; nativeSessionId: string; revision: string }> }>("agent.history.list", query)).entries;
    expect(rows).toHaveLength(2);
    expect(core.peek).toHaveBeenCalledTimes(peek);
    return rows.map(({ revision, ...row }) => ({ ...query, ...row, historyRevision: revision }));
  });
  const reference = histories.find(({ nativeSessionId }) => nativeSessionId === "fixture-native-id")!;
  const secondReference = histories.find(({ nativeSessionId }) => nativeSessionId === "fixture-second-id")!;
  await withTool("agent.history.read", reference, async () => {
    const saved = snapshot(root);
    expect(await tool.call("agent.history.read", reference)).toMatchObject({ ok: true, data: { messages: [expect.objectContaining({ text: "Original history text" })] } });
    expect(await tool.call("agent.history.read", { ...reference, spaceId: other.id })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await tool.call("agent.history.read", { ...reference, historyRevision: "f".repeat(64) })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    expect(snapshot(root)).toEqual(saved);
  });

  const pin = { ...reference, pinned: true };
  await withTool(
    "agent.history.pin",
    pin,
    async (key) => {
      const [one, two] = await Promise.all([tool.call("agent.history.pin", pin, key), tool.call("agent.history.pin", pin, key)]);
      expect(one).toMatchObject({ ok: true, data: { pinned: true }, opId: expect.any(String) });
      expect(two).toEqual(one);
    },
    keyFor("agent.history.pin"),
  );
  expect(unwrap(await manage("agent.history.list", query))).toMatchObject({ entries: expect.arrayContaining([expect.objectContaining({ historyId: reference.historyId, pinned: true })]) });
  const launched = { ...reference, ...selection, baseVersion: 0, target: { kind: "tab" }, requestId: "fixture-pi-workspace-launch" };
  const workspace = await withTool("agent.history.workspaceLaunch", launched, async () => {
    const [one, two] = await Promise.all([tool.call<{ sessionId: string; placement: { tab: string; leaf: string } }>("agent.history.workspaceLaunch", launched), tool.call("agent.history.workspaceLaunch", launched)]);
    expect(two).toEqual(one);
    return unwrap(one);
  });
  await withTool("agent.history.locate", reference, async () => {
    const peek = core.peek.mock.calls.length;
    const ensure = core.ensure.mock.calls.length;
    expect(await tool.call("agent.history.locate", reference)).toMatchObject({ ok: true, data: { spaceId: space.id, sessionId: workspace.sessionId, ...workspace.placement } });
    expect(core.peek).toHaveBeenCalledTimes(peek);
    expect(core.ensure).toHaveBeenCalledTimes(ensure);
  });

  const resume = { ...secondReference, ...selection, requestId: "fixture-pi-resume" };
  const resumed = await withTool("agent.history.resume", resume, async () => {
    const [one, two] = await Promise.all([tool.call<SessionView>("agent.history.resume", resume), tool.call("agent.history.resume", resume)]);
    expect(two).toEqual(one);
    return unwrap(one);
  });
  expect(core.terminals).toHaveLength(2);
  for (const id of ["agent.history.resume", "agent.sessions.list"]) await configure(id, true);
  await stop(engine);
  const reopened = await start(root, false);
  const restored = await external(entry, reopened, token, tool.recovery);
  const reply = await restored.call("agent.history.resume", resume);
  if (entry === "CLI") expect(reply).toMatchObject({ ok: true, data: { id: resumed.id } });
  else expect(reply).toMatchObject({ ok: false, error: { code: "INTERNAL", details: { outcome: "unknown" } } });
  expect(await restored.call("agent.sessions.list", { spaceId: space.id })).toMatchObject({ ok: true, data: expect.arrayContaining([expect.objectContaining({ id: resumed.id })]) });
  expect(core.terminals).toHaveLength(2);
  expect(readFileSync(source, "utf8")).toBe(bytes);
});

test.each(entries)("%s worktree 创建与打开只作用于授权仓库和真实候选目录", { timeout: 60_000 }, async (entry) => {
  const fixture = scratch();
  const root = path.join(fixture, "vault");
  const repository = path.join(root, "repo");
  const destination = path.join(root, "created");
  const linked = path.join(root, "linked");
  const outside = path.join(fixture, "outside");
  for (const directory of [repository, destination, linked, outside]) mkdirSync(directory, { recursive: true });
  const git = (...args: string[]) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
  git("init", "--quiet");
  writeFileSync(path.join(repository, "fixture.txt"), "base");
  git("add", "fixture.txt");
  git("-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "base");
  git("worktree", "add", "--quiet", "--detach", linked);
  const engine = await start(root, true);
  const { manage, tool, withTool, reopen } = await gateway(engine, entry);
  const space = unwrap(await manage<Space>("agent.spaces.save", { name: "Repository", root: repository }));
  const selection = selectedSpace(space);
  const create = { ...selection, dir: destination, branch: "fixture/new" };
  const created = await withTool(
    "agent.workspace.worktrees.create",
    create,
    async (key) => {
      expect(await tool.call("agent.workspace.worktrees.create", { ...create, dir: outside }, "outside-worktree")).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      const [one, two] = await Promise.all([tool.call<Space>("agent.workspace.worktrees.create", create, key), tool.call<Space>("agent.workspace.worktrees.create", create, key)]);
      expect(two).toEqual(one);
      return unwrap(one);
    },
    keyFor("agent.workspace.worktrees.create"),
  );
  expect(created.root).toBe(destination);
  expect(
    git("worktree", "list", "--porcelain")
      .split("\n")
      .filter((line) => line === `worktree ${destination}`),
  ).toHaveLength(1);
  expect(readdirSync(outside)).toEqual([]);
  const open = { ...selection, root: linked };
  const bound = await withTool(
    "agent.workspace.worktrees.open",
    open,
    async (key) => {
      expect(await tool.call("agent.workspace.worktrees.open", { ...open, root: root }, "nonmember-worktree")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      const [one, two] = await Promise.all([tool.call<Space>("agent.workspace.worktrees.open", open, key), tool.call<Space>("agent.workspace.worktrees.open", open, key)]);
      expect(two).toEqual(one);
      return unwrap(one);
    },
    keyFor("agent.workspace.worktrees.open"),
  );
  expect(unwrap(await manage<Space[]>("agent.spaces.list")).filter(({ root }) => root === linked)).toEqual([bound]);
  await reopen();
  expect(
    git("worktree", "list", "--porcelain")
      .split("\n")
      .filter((line) => line === `worktree ${destination}`),
  ).toHaveLength(1);
});
