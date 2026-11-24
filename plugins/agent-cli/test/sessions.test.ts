import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, assert, describe, expect, test, vi } from "vitest";
import { HerdrError, type HerdrClient } from "@huhu/herdr-client";
import { filesystemIdentity } from "@huhu/vault";
import { HerdrCore } from "../src/engine/herdr-core.js";
import { AgentDetector } from "../src/engine/detect.js";
import { InputOwnership } from "../src/engine/input-ownership.js";
import { resolveAgentLaunch } from "../src/engine/launch.js";
import { emptyAgentSettings } from "../src/shared/index.js";
import { SessionsService } from "../src/engine/sessions.js";
import { SpaceStore } from "../src/engine/spaces.js";
import { InteractiveEnvironment } from "../src/engine/interactive-environment.js";
import type { AgentEnvironmentProfile } from "../src/engine/launch-environment.js";
import type { BrokerOutcome, NativePtyBroker } from "../src/engine/native-pty.js";
import type { SessionRecord } from "../src/engine/sessions.js";
import { readHistoryEntry } from "../src/engine/history/scanner.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-ss-"));
  dirs.push(d);
  return d;
};

function fakeClient(
  opts: {
    failRun?: "throw-after-create" | "throw";
    failSend?: string;
    failSendTransport?: boolean;
    snapshot?: () => "unavailable" | "empty" | "ambiguous" | "current";
    coreId?: () => string;
    output?: string;
    beforeHello?: () => Promise<void>;
    beforeSend?: () => Promise<void>;
  } = {},
) {
  const terminals: { address: string; labels: Record<string, string>; argv?: string[]; cwd: string; pid: number; created_ms: number; state?: string; exit_code?: number | null; finished_ms?: number | null }[] = [];
  const calls: string[] = [];
  const runs: { argv?: string[]; cwd?: string }[] = [];
  const runEnvironments: (Record<string, string> | undefined)[] = [];
  const sends: { terminal?: string; text?: string }[] = [];
  const client = {
    call: async (method: string, params: { labels?: Record<string, string>; terminal?: string; argv?: string[]; cwd?: string; text?: string; env?: Record<string, string> }) => {
      calls.push(method);
      if (method === "hello") {
        await opts.beforeHello?.();
        return { core: { id: opts.coreId?.() ?? "fake-core" }, generation: 1 };
      }
      if (method === "terminal.send") {
        await opts.beforeSend?.();
        if (opts.failSend) throw new HerdrError({ code: -32000, message: opts.failSend, data: { kind: "not_found" } });
        if (opts.failSendTransport) throw new Error("timeout");
        sends.push({ terminal: params.terminal as string, text: params.text as string });
        return {};
      }
      if (method === "terminal.run") {
        runEnvironments.push(params.env);
        runs.push({ ...(params.argv ? { argv: params.argv } : {}), ...(params.cwd ? { cwd: params.cwd } : {}) });
        const t = {
          address: `t${terminals.length + 1}`,
          labels: params.labels ?? {},
          cwd: params.cwd!,
          argv: params.argv ?? [],
          pid: 100 + terminals.length,
          created_ms: 200 + terminals.length,
          state: "live",
          finished_ms: null,
          exit_code: null,
        };
        if (opts.failRun === "throw") throw new Error("boom");
        terminals.push(t);
        if (opts.failRun === "throw-after-create") throw new Error("响应丢失");
        return t;
      }
      if (method === "terminal.list") {
        const mode = opts.snapshot?.();
        if (mode === "unavailable") throw new Error("Core snapshot unavailable");
        const matches = mode === "empty" ? [] : terminals.filter((t) => Object.entries(params.labels ?? {}).every(([k, v]) => t.labels[k] === v));
        if (mode === "ambiguous" && matches[0]) matches.push({ ...matches[0], address: "ambiguity" });
        return { terminals: matches };
      }
      if (method === "terminal.read") return { text: opts.output ?? "" };
      return {};
    },
  } as unknown as HerdrClient;
  const finish = (address: string, code: number | null) => {
    const x = terminals.find((y) => y.address === address);
    if (x) {
      x.state = "finished";
      x.exit_code = code;
      x.finished_ms = Date.parse("2026-11-11T00:30:00Z");
    }
  };
  return { client, calls, terminals, runs, runEnvironments, sends, finish };
}

function setup(client: HerdrClient, over: Partial<ConstructorParameters<typeof SessionsService>[0]> = {}) {
  const root = tmp();
  const work = tmp();
  const bin = tmp();
  writeFileSync(path.join(bin, "claude"), "#!/bin/sh\necho 2.0.0\n");
  chmodSync(path.join(bin, "claude"), 0o755);
  const spaces = new SpaceStore(path.join(root, "spaces"), "m1");
  const space = spaces.save({ name: "S", root: work });
  const deps: ConstructorParameters<typeof SessionsService>[0] = {
    dir: path.join(root, "sessions"),
    vaultId: "vault-x",
    spaces,
    core: async () => client,
    resolve: async (i) => {
      const detector = new AgentDetector({ settings: () => emptyAgentSettings(), now: () => 0, env: { PATH: bin }, home: tmp() });
      return resolveAgentLaunch({ settings: emptyAgentSettings(), locatedCommand: detector.locate(i.agentId)?.path ?? null }, i);
    },
    now: () => new Date("2026-11-11T00:00:00Z"),
    ...over,
  };
  const reopen = (overrides: Partial<ConstructorParameters<typeof SessionsService>[0]> = {}) => new SessionsService({ ...deps, ...overrides });
  return { svc: reopen(), reopen, space, spaces, work, sessionsDir: deps.dir };
}
const req = (space: { id: string; revision: number }, over: Record<string, unknown> = {}) => ({
  spaceId: space.id,
  spaceRevision: space.revision,
  provider: "shell" as const,
  requestId: `req-${Math.random().toString(36).slice(2)}`,
  ...over,
});

describe("原生历史启动", () => {
  const nativeId = "f5806e5c-1127-424b-966c-22087b88af27";
  const forkId = "fca2240f-0e87-4099-92dc-1214f5cadd11";
  function source(work: string) {
    const profile = realpathSync(tmp());
    const projects = path.join(profile, "projects", work.replace(/[^a-zA-Z0-9]/g, "-"));
    mkdirSync(projects, { recursive: true });
    const file = path.join(projects, `${nativeId}.jsonl`);
    const row = JSON.stringify({ type: "user", cwd: work, message: { role: "user", content: "source" } }) + "\n";
    writeFileSync(file, row);
    const entry = readHistoryEntry("claude", file);
    return { file, projects, profile, row, history: { nativeId, file, profile, sourceId: entry!.historyId, revision: entry!.revision, sourceCwd: entry!.cwd } };
  }

  test("Claude 分支异步确认只在登记子 UUID 后通知一次，仍能重放原请求", async () => {
    const core = fakeClient({ failRun: "throw-after-create" });
    const onHistoryIdentityConfirmed = vi.fn((id: string): string | undefined => svc.get(id).nativeSessionId);
    const { svc, reopen, space, work } = setup(core.client, { onHistoryIdentityConfirmed });
    const { file, projects, row, history } = source(realpathSync(work));
    const input = { ...req(space), provider: "claude" as const, cwd: realpathSync(work), history: { ...history, mode: "fork" as const, forkId }, historySelection: "frozen-request" };
    const launched = await svc.launch(input);
    expect(launched).toMatchObject({ state: "running" });
    expect(launched.nativeSessionId).toBeUndefined();
    expect(onHistoryIdentityConfirmed).not.toHaveBeenCalled();
    expect(core.runs[0]?.argv?.slice(1)).toEqual(["--resume", nativeId, "--fork-session", "--session-id", forkId]);
    writeFileSync(path.join(projects, `${forkId}.jsonl`), row);
    const afterRestart = reopen();
    await afterRestart.reconcile();
    expect(afterRestart.get(launched.id)).toMatchObject({ nativeSessionId: forkId });
    expect(onHistoryIdentityConfirmed).toHaveBeenCalledExactlyOnceWith(launched.id);
    expect(onHistoryIdentityConfirmed).toHaveReturnedWith(forkId);
    rmSync(file);
    expect(() => afterRestart.historyLaunchReplay(input.requestId, "different-request")).toThrow();
    const replay = afterRestart.historyLaunchReplay(input.requestId, input.historySelection);
    const recovered = await afterRestart.launch(replay!);
    expect(recovered).toMatchObject({ id: launched.id, nativeSessionId: forkId });
    expect(recovered.historyId).toBeDefined();
    expect(onHistoryIdentityConfirmed).toHaveBeenCalledTimes(1);
    expect(core.runs).toHaveLength(1);
  });

  test("等待 Core 期间出现同 UUID 候选时零启动", async () => {
    let insert = () => {};
    const core = fakeClient({ beforeHello: async () => insert() });
    const { svc, space, work } = setup(core.client);
    const { profile, history } = source(realpathSync(work));
    const other = path.join(profile, "projects", "outside");
    insert = () => {
      mkdirSync(other);
      writeFileSync(path.join(other, `${nativeId}.jsonl`), "another native candidate");
    };
    await expect(svc.launch({ ...req(space), provider: "claude", cwd: realpathSync(work), history: { ...history, mode: "resume" } })).rejects.toMatchObject({
      code: "HERDR_UNAVAILABLE",
      details: { stage: "run", reason: "confirmed_not_created" },
    });
    expect(core.runs).toHaveLength(0);
  });
});

function ordinaryProfile(provider: AgentEnvironmentProfile["provider"]) {
  const profile: AgentEnvironmentProfile = {
    id: "profile",
    revision: "first",
    name: "普通配置",
    provider,
    ordinary: [
      { name: "SAMPLE", value: "portable-value" },
      { name: "CLEARED", value: "" },
    ],
    protectedNames: [],
    states: {},
  };
  const environment = new InteractiveEnvironment(undefined, {
    available: true,
    async profile(selection, selectedProvider) {
      if (selection.revision !== profile.revision || selectedProvider !== provider) throw Object.assign(new Error("启动环境已变化"), { code: "VERSION_CONFLICT" });
      return profile;
    },
    async use() {
      throw new Error("普通配置不得领取凭据");
    },
  });
  return { profile, environment };
}

test("普通 Agent 配置复用 resolver 和原 Core 启动，保留空字符串与单次请求归属", async () => {
  const { client, runs, runEnvironments } = fakeClient({ output: "ordinary portable-value" });
  const { profile, environment } = ordinaryProfile("claude");
  const { svc, reopen, space, work } = setup(client, {
    interactiveEnvironment: environment,
    resolve: async () => ({ command: path.join(work, "agent"), argv: ["argument with spaces"], warnings: [], env: { SAMPLE: "original", CLEARED: "original", BASE: "kept" } }),
  });
  const input = { ...req(space), provider: "claude" as const };
  const preview = await svc.previewEnvironment(input, { id: profile.id, revision: profile.revision });
  expect(environment.available).toBe(false);
  expect(preview).toMatchObject({ cwd: work, argv: [path.join(work, "agent"), "argument with spaces"], ordinaryNames: ["BASE", "CLEARED", "SAMPLE"], protectedNames: [] });
  expect(JSON.stringify(preview)).not.toContain("portable-value");
  const approved = { ...input, environment: preview.environment };
  const result = await svc.launch(approved);
  expect(result.hasEnv).toBeUndefined();
  expect(await svc.output(result.id)).toEqual({ text: "ordinary portable-value", complete: true });
  expect(await reopen().output(result.id)).toEqual({ text: "ordinary portable-value", complete: true });
  expect(runs).toEqual([{ cwd: work, argv: preview.argv }]);
  expect(runEnvironments).toEqual([{ BASE: "kept", SAMPLE: "portable-value", CLEARED: "" }]);
  profile.revision = "later";
  expect(await svc.launch(approved)).toMatchObject({ id: result.id, terminalId: result.terminalId });
  expect(runs).toHaveLength(1);
  await expect(svc.launch({ ...approved, requestId: "stale-profile-new-request" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  expect(runs).toHaveLength(1);
});

test("普通终端配置在连接 Core 后复核版本，并使用 Core 默认 shell", async () => {
  const { client, runs, runEnvironments } = fakeClient();
  const { profile, environment } = ordinaryProfile("shell");
  let changeOnConnect = true;
  const { svc, reopen, space, work } = setup(client, {
    interactiveEnvironment: environment,
    core: async () => {
      if (changeOnConnect) profile.revision = "changed-after-preview";
      return client;
    },
  });
  const input = req(space);
  const preview = await svc.previewEnvironment(input, { id: profile.id, revision: profile.revision });
  expect(preview.argv).toEqual([]);
  await expect(svc.launch({ ...input, environment: preview.environment })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  expect(runs).toHaveLength(0);
  const [rejected] = reopen().list(space.id);
  expect(rejected).toMatchObject({ state: "failed", terminalId: null, requestId: input.requestId });
  expect(rejected?.launchReceipt?.attempt).toBeUndefined();

  changeOnConnect = false;
  const revised = await svc.previewEnvironment(input, { id: profile.id, revision: profile.revision });
  await svc.launch({ ...input, requestId: "reapproved-shell", environment: revised.environment });
  expect(runs).toEqual([{ cwd: work }]);
  expect(runEnvironments).toEqual([{ SAMPLE: "portable-value", CLEARED: "" }]);
});

function nativeLaunchFixture(before?: (stage: "connect" | "hello" | "broker") => Promise<void> | undefined) {
  let view: "unavailable" | "current" | "ambiguous" | "empty" = "unavailable";
  let instance = "original";
  const core = fakeClient({ failRun: "throw-after-create", snapshot: () => view, coreId: () => instance, beforeHello: async () => before?.("hello") });
  const expiry = new AbortController();
  const cancel = new AbortController();
  const lifetime = new AbortController();
  const helper = path.join(tmp(), "agent-pty");
  writeFileSync(helper, "fixture helper image");
  const interactive = new InteractiveEnvironment(helper, {
    available: false,
    async profile() {
      throw new Error("unexpected profile");
    },
    async use() {
      throw new Error("unexpected lease");
    },
  });
  const inspectHost = vi.fn(async (pid: number) => ({ pid, created: "123", image: { path: helper, sha256: "fixture" } }));
  const revoke = vi.fn();
  const start = vi.fn<NativePtyBroker["start"]>();
  const { svc, reopen, space, spaces, work, sessionsDir } = setup(core.client, {
    core: async () => {
      await before?.("connect");
      return core.client;
    },
    signal: lifetime.signal,
    interactiveEnvironment: interactive,
    nativeBroker: (_helper, signal) => ({
      waiting: AbortSignal.any([expiry.signal, ...(signal ? [signal] : [])]),
      hostArgv: async () => {
        await before?.("broker");
        return [helper, "host", "original-broker"];
      },
      inspectHost,
      start,
      revoke,
    }),
  });
  const cwd = realpathSync.native(work);
  const stats = statSync(cwd, { bigint: true });
  const identity = filesystemIdentity(stats);
  assert(identity);
  const name = "HUHU_RULE_SECRET_FIXTURE";
  const marker = "synthesized-value-must-stay-in-lease";
  const command = "printf fixture";
  const executable = { path: "/bin/sh", identity: "1:2", birthtimeNs: "3", ctimeNs: "4", mtimeNs: "5", size: "6", sha256: "a".repeat(64) };
  const use = vi.fn(async (consumer: (values: ReadonlyMap<string, string>) => Promise<BrokerOutcome>) => consumer(new Map([[name, marker]])));
  const onPending = vi.fn<(completion: Promise<SessionRecord>) => void>();
  const input: Parameters<SessionsService["launchApprovedShell"]>[0] = {
    ...req(space),
    provider: "shell",
    shell: "sh",
    command,
    approvedDirectory: { path: cwd, identity, birthtimeNs: String(stats.birthtimeNs) },
    approvedShell: { executable, argv: [executable.path, "-c", command] },
    names: [name],
    use,
    onPending,
  };
  return {
    ...core,
    svc,
    reopen,
    space,
    spaces,
    sessionsDir,
    interactive,
    expiry,
    cancel,
    lifetime,
    input,
    use,
    onPending,
    start,
    inspectHost,
    revoke,
    marker,
    setView: (next: typeof view) => {
      view = next;
    },
    replaceCore: () => {
      instance = "replacement";
    },
    launch: () => svc.launchApprovedShell(input, cancel.signal),
    pending: () => onPending.mock.calls[0]![0],
  };
}

const linuxNativeOnly = process.platform !== "linux" || process.arch !== "x64";

function nativeGate() {
  let reached!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    entered,
    release,
    pause: () => {
      reached();
      return waiting;
    },
  };
}

test.skipIf(linuxNativeOnly)("原生 helper 预检取消封存原请求，不创建会话或重放", async () => {
  const f = nativeLaunchFixture();
  const gate = nativeGate();
  const pin = f.interactive.pinHelper.bind(f.interactive);
  const pinHelper = vi.spyOn(f.interactive, "pinHelper").mockImplementationOnce(async () => {
    await gate.pause();
    return pin();
  });
  const launch = f.launch();
  void launch.catch(() => undefined);
  await gate.entered;
  const proof = { requestId: f.input.requestId, sessionId: null, cleanupRequired: false };
  const cancellation = { details: { reason: "native_cancelled_before_start", ...proof } };
  f.cancel.abort();
  try {
    await expect(launch).rejects.toMatchObject(cancellation);
    const reopened = f.reopen();
    expect(reopened.readApprovedShellCancellation(f.input.requestId)).toEqual(proof);
    expect(reopened.readApprovedShellCancellation("unrelated-request")).toBeNull();
    await expect(reopened.launchApprovedShell(f.input)).rejects.toMatchObject(cancellation);
    const command = "printf different";
    const approvedShell: typeof f.input.approvedShell = { ...f.input.approvedShell, argv: [f.input.approvedShell.executable.path, "-c", command] };
    await expect(reopened.launchApprovedShell({ ...f.input, command, approvedShell })).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
    expect(reopened.list()).toEqual([]);
    expect(reopened.hasLaunchAttempt(f.input.requestId)).toBe(false);
    expect(f.calls).toEqual([]);
    expect(pinHelper).toHaveBeenCalledTimes(1);
  } finally {
    gate.release();
  }
});

test.skipIf(linuxNativeOnly)("原生 helper 的普通 AbortError 不产生未交付取消凭证", async () => {
  const f = nativeLaunchFixture();
  const error = new DOMException("synthetic helper read error", "AbortError");
  vi.spyOn(f.interactive, "pinHelper").mockRejectedValueOnce(error);
  await expect(f.launch()).rejects.toBe(error);
  expect(f.reopen().readApprovedShellCancellation(f.input.requestId)).toBeNull();
  expect(f.calls).toEqual([]);
});

test.skipIf(linuxNativeOnly).each(["connect", "hello", "broker"] as const)("原生前台取消在 %s 等待时结算原会话且释放 Space", async (stage) => {
  const gate = nativeGate();
  const f = nativeLaunchFixture((at) => (at === stage ? gate.pause() : undefined));
  const launch = f.launch();
  void launch.catch(() => undefined);
  await gate.entered;
  const [session] = f.svc.list(f.space.id);
  expect(session).toMatchObject({ state: "launching", requestId: f.input.requestId });
  const expected = { details: { reason: "native_cancelled_before_start", requestId: f.input.requestId, sessionId: session!.id, cleanupRequired: false } };
  f.cancel.abort();
  // Cancellation must settle even while the original operation is still blocked.
  try {
    await expect(Promise.race([launch, new Promise((resolve) => setTimeout(() => resolve("still blocked"), 200))])).rejects.toMatchObject(expected);
  } finally {
    gate.release();
  }
  const reopened = f.reopen();
  expect(reopened.list(f.space.id)).toEqual([expect.objectContaining({ id: session!.id, requestId: f.input.requestId, state: "failed", terminalId: null })]);
  expect(reopened.hasLaunchAttempt(f.input.requestId)).toBe(false);
  await expect(reopened.launchApprovedShell(f.input)).rejects.toMatchObject(expected);
  expect(reopened.list(f.space.id).filter(({ state }) => state === "running" || state === "launching" || state === "unknown")).toEqual([]);
  f.spaces.delete(f.space.id);
  expect(f.spaces.list()).toEqual([]);
  expect(f.runs).toHaveLength(0);
  expect(f.start).not.toHaveBeenCalled();
});

test.skipIf(linuxNativeOnly)("原生前台取消在凭据放行前保留原会话和外层清理待办", async () => {
  const f = nativeLaunchFixture();
  const gate = nativeGate();
  f.setView("current");
  f.use.mockImplementationOnce(async (consumer) => {
    await gate.pause();
    return consumer(new Map([[f.input.names[0]!, f.marker]]));
  });
  const launch = f.launch();
  void launch.catch(() => undefined);
  await gate.entered;
  const [session] = f.svc.list();
  f.cancel.abort();
  try {
    await expect(launch).rejects.toMatchObject({ details: { reason: "native_cancelled_before_start", requestId: f.input.requestId, sessionId: session!.id, cleanupRequired: true } });
  } finally {
    gate.release();
  }
  await expect(f.use.mock.results[0]?.value).rejects.toThrow();
  const reopened = f.reopen();
  expect(reopened.get(session!.id)).toMatchObject({ state: "failed", launchReceipt: { attempt: { nativeCleanup: "pending", id: session!.launchReceipt!.attempt!.id } } });
  expect(f.onPending).not.toHaveBeenCalled();
  f.finish(f.terminals[0]!.address, 70);
  await reopened.release(session!.id, f.input.requestId);
  expect(reopened.get(session!.id).launchReceipt?.attempt?.nativeCleanup).toBe("complete");
  expect(f.calls).toContain("terminal.rm");
  expect(f.runs).toHaveLength(1);
  expect(f.start).not.toHaveBeenCalled();
});

test.skipIf(linuxNativeOnly).each(["generation", "ambiguous", "replaced", "empty", "reused-pid"] as const)("原生交付前再核验拒绝 %s，保留原尝试", async (change) => {
  const f = nativeLaunchFixture();
  const gate = nativeGate();
  f.setView("current");
  f.start.mockResolvedValue("started");
  f.use.mockImplementationOnce(async (consumer) => {
    await gate.pause();
    return consumer(new Map([[f.input.names[0]!, f.marker]]));
  });
  const launch = f.launch();
  void launch.catch(() => undefined);
  await gate.entered;
  const original = f.svc.list()[0]!;
  if (change === "generation") f.replaceCore();
  if (change === "ambiguous" || change === "empty") f.setView(change);
  if (change === "replaced") f.terminals[0]!.pid++;
  if (change === "reused-pid") f.inspectHost.mockImplementationOnce(async (pid) => ({ pid, created: "456", image: { path: "fixture", sha256: "fixture" } }));
  gate.release();
  await expect(launch).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(f.reopen().get(original.id)).toMatchObject({ state: "failed", launchReceipt: { attempt: { id: original.launchReceipt!.attempt!.id, nativeCleanup: "pending" } } });
  expect(f.runs).toHaveLength(1);
  expect(f.start).not.toHaveBeenCalled();
});

test.skipIf(linuxNativeOnly).each(["cancel", "expiry"] as const)("原生交付前再核验卡在 Core 时 %s 释放 lease 且零交付", async (event) => {
  const gate = nativeGate();
  let taking = false;
  const f = nativeLaunchFixture((stage) => (stage === "hello" && taking ? gate.pause() : undefined));
  f.setView("current");
  const lease = new Map([[f.input.names[0]!, f.marker]]);
  f.use.mockImplementationOnce(async (consumer) => {
    taking = true;
    try {
      return await consumer(lease);
    } finally {
      lease.clear();
    }
  });
  const launch = f.launch();
  void launch.catch(() => undefined);
  await gate.entered;
  const original = f.svc.list()[0]!;
  (event === "cancel" ? f.cancel : f.expiry).abort();
  try {
    const timeout = new Promise((resolve) => setTimeout(() => resolve("still blocked"), 200));
    await expect(Promise.race([launch, timeout])).rejects.toMatchObject({ code: "INVALID_INPUT", ...(event === "cancel" && { details: { reason: "native_cancelled_before_start", sessionId: original.id } }) });
    await expect(Promise.race([f.use.mock.results[0]!.value as Promise<BrokerOutcome>, timeout])).rejects.toThrow();
    expect(lease.size).toBe(0);
  } finally {
    taking = false;
    gate.release();
  }
  expect(f.reopen().get(original.id)).toMatchObject({ state: "failed", launchReceipt: { attempt: { id: original.launchReceipt!.attempt!.id, nativeCleanup: "pending" } } });
  expect(f.start).not.toHaveBeenCalled();
  expect(f.runs).toHaveLength(1);
});

test.skipIf(linuxNativeOnly)("原生短断恢复只向原 host 写一帧，并在重开后核对已启动进程", async () => {
  const f = nativeLaunchFixture();
  await expect(f.launch()).rejects.toMatchObject({ code: "RUN_UNKNOWN", details: { reason: "native_host_unverified" } });
  const [waiting] = f.svc.list();
  expect(waiting?.launchReceipt?.attempt).toMatchObject({ nativeStatus: "waiting-host" });
  expect(f.use).not.toHaveBeenCalled();
  await expect(f.launch()).rejects.toMatchObject({ code: "RUN_UNKNOWN" });
  f.start.mockImplementation(async (host, _plan, _values, consumed) => {
    expect(f.svc.get(waiting!.id).launchReceipt?.attempt).toMatchObject({ nativeStatus: "delivering", binding: { pid: host.pid } });
    consumed();
    expect(f.svc.get(waiting!.id).launchReceipt?.attempt?.nativeConsumed).toBe(true);
    return "started";
  });
  f.setView("current");
  const running = await f.pending();
  const [terminal] = f.terminals;
  expect(running).toMatchObject({ id: waiting!.id, terminalId: terminal!.address, launchReceipt: { attempt: { id: waiting!.launchReceipt!.attempt!.id, nativeStatus: "started", nativeConsumed: true } } });
  expect(JSON.stringify(running)).not.toContain(f.marker);
  expect(f.runs).toHaveLength(1);
  expect(f.use).toHaveBeenCalledTimes(1);
  expect(f.start).toHaveBeenCalledTimes(1);
  expect(f.revoke).toHaveBeenCalledTimes(1);
  f.finish(terminal!.address, 0);
  const reopened = f.reopen();
  await expect(reopened.recover(running.id, new AbortController().signal)).resolves.toMatchObject({ id: running.id, state: "exited", exitCode: 0 });
});

test.skipIf(linuxNativeOnly).each(["delivering", "consumed", "legacy"] as const)("原生缺启动回执时标为 unknown，最后证据=%s", async (evidence) => {
  const f = nativeLaunchFixture();
  f.setView("current");
  f.start.mockImplementation(async (_host, _launch, _values, reportConsumed) => {
    expect(f.svc.list()[0]?.launchReceipt?.attempt?.nativeStatus).toBe("delivering");
    if (evidence === "consumed") reportConsumed();
    return "unknown";
  });
  await expect(f.launch()).rejects.toMatchObject({ code: "RUN_UNKNOWN", details: { reason: "native_start_unknown" } });
  const [waiting] = f.svc.list();
  const attempt = waiting!.launchReceipt!.attempt!;
  expect(attempt.nativeConsumed).toBe(evidence === "consumed" ? true : undefined);
  if (evidence === "legacy") {
    attempt.nativeStatus = "pending";
    writeFileSync(path.join(f.sessionsDir, waiting!.id + ".json"), JSON.stringify(waiting));
  }
  f.finish(f.terminals[0]!.address, 0);
  const reopened = f.reopen();
  await reopened.reconcile();
  await expect(reopened.launchApprovedShell(f.input)).rejects.toMatchObject({ code: "RUN_UNKNOWN" });
  expect(reopened.get(waiting!.id)).toMatchObject({ state: "unknown", terminalId: null, launchReceipt: { attempt: { id: attempt.id, nativeStatus: evidence === "legacy" ? "pending" : "delivering" } } });
  expect(f.start).toHaveBeenCalledTimes(1);
  expect(f.runs).toHaveLength(1);
});

test.skipIf(linuxNativeOnly)("原生宿主已核验但领取仍在等待时，过期后不接受迟到的交付", async () => {
  const f = nativeLaunchFixture();
  let markTaking!: () => void;
  const taking = new Promise<void>((resolve) => {
    markTaking = () => resolve();
  });
  let makeAvailable!: () => void;
  const available = new Promise<void>((resolve) => {
    makeAvailable = () => resolve();
  });
  f.use.mockImplementationOnce(async (consumer) => {
    markTaking();
    await available;
    return consumer(new Map([[f.input.names[0]!, f.marker]]));
  });
  await expect(f.launch()).rejects.toMatchObject({ code: "RUN_UNKNOWN" });
  f.setView("current");
  await taking;
  f.expiry.abort();
  expect(await f.pending()).toMatchObject({ state: "failed", launchReceipt: { attempt: { nativeStatus: "failed", nativeCleanup: "pending" } } });
  makeAvailable();
  await expect(f.use.mock.results[0]?.value).rejects.toThrow();
  expect(f.start).not.toHaveBeenCalled();
  expect(f.runs).toHaveLength(1);
});

test.skipIf(linuxNativeOnly).each(["expiry", "cancel", "ambiguous", "generation", "shutdown"] as const)("原生等待阶段 %s 后保留失败尝试且零私有交付", async (event) => {
  const f = nativeLaunchFixture();
  f.setView("empty");
  await expect(f.launch()).rejects.toMatchObject({ code: "RUN_UNKNOWN" });
  const [waiting] = f.svc.list();
  const id = waiting!.id;
  const attemptId = waiting!.launchReceipt!.attempt!.id;
  expect(f.inspectHost).not.toHaveBeenCalled();
  if (event === "expiry") f.expiry.abort();
  if (event === "cancel") f.cancel.abort();
  if (event === "ambiguous") f.setView("ambiguous");
  if (event === "generation") {
    f.replaceCore();
    f.setView("current");
  }
  if (event === "shutdown") {
    f.lifetime.abort();
    await expect(f.pending()).rejects.toThrow();
    expect(f.svc.get(id).launchReceipt?.attempt?.nativeStatus).toBe("waiting-host");
    const reopened = f.reopen({ signal: new AbortController().signal });
    await reopened.reconcile();
    expect(reopened.get(id)).toMatchObject({ state: "failed", launchReceipt: { attempt: { id: attemptId, nativeStatus: "failed", nativeCleanup: "pending" } } });
  } else if (event === "cancel") {
    await expect(f.pending()).rejects.toMatchObject({ details: { reason: "native_cancelled_before_start", requestId: f.input.requestId, sessionId: id, cleanupRequired: true } });
    expect(f.reopen().get(id)).toMatchObject({ state: "failed", launchReceipt: { nativeCancelledBeforeStart: true, attempt: { id: attemptId, nativeStatus: "failed", nativeCleanup: "pending" } } });
  } else {
    expect(await f.pending()).toMatchObject({ id, state: "failed", launchReceipt: { attempt: { id: attemptId, nativeStatus: "failed", nativeCleanup: "pending" } } });
  }
  expect(f.inspectHost).not.toHaveBeenCalled();
  expect(f.use).not.toHaveBeenCalled();
  expect(f.start).not.toHaveBeenCalled();
  expect(f.runs).toHaveLength(1);
});

describe("HerdrCore.peek（不 mock：真实端点检查）", () => {
  test("没有任何 Core 在监听：peek 返回 absent，且不会启动它（二进制不存在也不报错）", async () => {
    const core = new HerdrCore({ bin: "/nonexistent/herdr-core", vaultId: `vault-${Math.random().toString(36).slice(2, 10)}`, machineId: "abcd", runtimeDir: tmp() });
    expect(await core.peek()).toBe("absent");
  });
  test.skipIf(process.platform === "win32")("只读诊断与外部布局读取不启动 Core：probe 区分未运行与缺程序，有旧布局时外部读取报不可用", async () => {
    const root = tmp();
    const marker = path.join(root, "spawned");
    const bin = path.join(root, "herdr-core");
    writeFileSync(bin, `#!/bin/sh\ntouch '${marker}'\n`);
    chmodSync(bin, 0o755);
    const runtimeDir = path.join(root, "runtime");
    const scope = { vaultId: `vault-${Math.random().toString(36).slice(2, 10)}`, machineId: "abcd", runtimeDir };
    const core = new HerdrCore({ bin, ...scope });
    expect(await core.probe()).toEqual({ state: "idle", version: null });
    expect(await new HerdrCore({ bin: path.join(root, "missing"), ...scope }).probe()).toMatchObject({ state: "unavailable", error: expect.stringContaining("missing") });
    const notExecutable = path.join(root, "not-executable");
    writeFileSync(notExecutable, "");
    chmodSync(notExecutable, 0o644);
    expect(await new HerdrCore({ bin: notExecutable, ...scope }).probe()).toMatchObject({ state: "unavailable" });
    expect(await new HerdrCore({ bin: root, ...scope }).probe()).toMatchObject({ state: "unavailable" });
    expect(await core.workspaceConnection(false)).toBeNull();
    const saved = path.join(runtimeDir, "state", "herdr-core", "huhu");
    mkdirSync(saved, { recursive: true });
    writeFileSync(path.join(saved, "docs.json"), "{}");
    await expect(core.workspaceConnection(false)).rejects.toMatchObject({ code: "HERDR_UNAVAILABLE" });
    expect(existsSync(marker)).toBe(false);
  });
  test.skipIf(process.platform === "win32")("并发 peek：只保留一个连接，被丢弃的重复连接关闭后不会把保留的那个清掉", async () => {
    const net = await import("node:net");
    const core = new HerdrCore({ bin: "/nonexistent/herdr-core", vaultId: `vault-${Math.random().toString(36).slice(2, 10)}`, machineId: "abcd", runtimeDir: tmp() });
    const srv = net.createServer((s) => {
      s.on("error", () => undefined);
    });
    await new Promise<void>((r) => srv.listen(core.endpoint, r));
    try {
      const [a, b] = await Promise.all([core.peek(), core.peek()]);
      expect(a).not.toBe("absent");
      expect(a).not.toBeNull();
      expect(b).toBe(a);
      await new Promise((r) => setTimeout(r, 300)); // 等被丢弃的那条连接的关闭事件
      expect(await core.peek()).toBe(a); // 仍是同一个，没有重新建连
      core.dispose();
    } finally {
      srv.close();
    }
  });
  test("接线到 SessionsService：Core 不在时，已绑定会话转为待核实", async () => {
    const f = fakeClient();
    const core = new HerdrCore({ bin: "/nonexistent/herdr-core", vaultId: `vault-${Math.random().toString(36).slice(2, 10)}`, machineId: "abcd", runtimeDir: tmp() });
    const { svc, space } = setup(f.client, { peekCore: () => core.peek() });
    const s = await svc.launch(req(space));
    expect(svc.get(s.id).state).toBe("running");
    await svc.reconcile();
    expect(svc.get(s.id)).toMatchObject({ state: "unknown", terminalId: null });
  });
});

describe("会话对账（终端是否已结束）", () => {
  test("程序退出：记录变为 exited 并带退出码与结束时间；仍在运行的不动；之后发送审查意见被拒绝", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const a = await svc.launch(req(space));
    const b = await svc.launch(req(space));
    f.finish(a.terminalId as string, 3);
    await svc.reconcile();
    expect(svc.get(a.id)).toMatchObject({ state: "exited", exitCode: 3, exitedAt: "2026-11-11T00:30:00.000Z" });
    expect(svc.get(b.id).state).toBe("running");
    svc.addComment(a.id, { path: "a.md", side: "new", line: 1, text: "x" });
    await expect(svc.sendComments(a.id)).rejects.toThrow(/恢复会话/);
  });
  test("终端已不在快照中：保留待核实的原绑定", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const a = await svc.launch(req(space));
    f.terminals.length = 0; // Core 里已经没有这个终端
    await svc.reconcile();
    expect(svc.get(a.id)).toMatchObject({ state: "unknown", terminalId: null });
  });
  test("Core 暂时连不上时保持 running，确认 Core 缺席时转为待核实", async () => {
    let mode: "up" | "unknown" | "absent" = "up";
    const f = fakeClient();
    const { svc, space } = setup(f.client, { peekCore: async () => (mode === "up" ? f.client : mode === "unknown" ? null : "absent") });
    const a = await svc.launch(req(space));
    mode = "unknown";
    await svc.reconcile();
    expect(svc.get(a.id).state).toBe("running");
    mode = "absent";
    await new Promise((r) => setTimeout(r, 2100)); // 过了节流窗口
    await svc.reconcile();
    expect(svc.get(a.id)).toMatchObject({ state: "unknown", terminalId: null });
  });
  test("地址被别的终端占用（标签不是这个会话）：不能把旧会话当成还在运行", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const a = await svc.launch(req(space));
    f.terminals[0]!.labels = { ...f.terminals[0]!.labels, "huhu.session": "sess-someone-else" }; // Core 重置后 t1 被别的会话的终端复用
    await svc.reconcile();
    expect(svc.get(a.id).state).toBe("unknown");
  });
  test("2 秒内重复对账直接跳过（不反复打 Core）", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    await svc.launch(req(space));
    await svc.reconcile();
    await svc.reconcile();
    await svc.reconcile();
    expect(f.calls.filter((c) => c === "terminal.list")).toHaveLength(1);
  });
});

describe("变更审查意见", () => {
  test("仅当前控制视图可借用输入权发送审查，任务独占及观察权限继续有效", async () => {
    const f = fakeClient();
    let taskOwner: string | undefined;
    const ownership = new InputOwnership(
      () => taskOwner,
      () => false,
    );
    const { svc, space } = setup(f.client, { inputOwnership: ownership });
    const s = await svc.launch(req(space));
    const comment = svc.addComment(s.id, { path: "a.md", side: "new", line: 1, text: "控制视图审查" });
    const detach = ownership.take(s.id, "manual", "controlling-view");
    expect(detach).toBeDefined();

    await expect(svc.sendComments(s.id, undefined, false, undefined, "other-view")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(svc.sendComments(s.id)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(ownership.availableForTask(s.id)).toBe(false);
    expect(f.sends).toHaveLength(0);

    expect(await svc.sendComments(s.id, undefined, false, undefined, "controlling-view")).toMatchObject({ sent: 1 });
    expect(svc.comments(s.id)).toMatchObject([{ id: comment.id, sentAt: expect.any(String) }]);
    expect(f.sends).toHaveLength(1);
    expect(ownership.availableForTask(s.id)).toBe(false);

    detach?.();
    svc.addComment(s.id, { path: "a.md", side: "new", line: 2, text: "再次发送" });
    await expect(svc.sendComments(s.id, undefined, false, undefined, "controlling-view")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    taskOwner = "task-run";
    expect(ownership.take(s.id, "manual", "new-view")).toBeUndefined();
    await expect(svc.sendComments(s.id)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.sends).toHaveLength(1);
  });
  test("控制视图发送中断开时，等原发送结束再通知下一视图接管", async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let finishSend!: () => void;
    const send = new Promise<void>((resolve) => {
      finishSend = resolve;
    });
    const f = fakeClient({
      beforeSend: () => {
        started();
        return send;
      },
    });
    const ownership = new InputOwnership(
      () => undefined,
      () => false,
    );
    const { svc, space } = setup(f.client, { inputOwnership: ownership });
    const s = await svc.launch(req(space));
    svc.addComment(s.id, { path: "a.md", side: "new", line: 1, text: "断开前确认的审查" });
    const detach = ownership.take(s.id, "manual", "first-view");
    expect(detach).toBeDefined();
    const sending = svc.sendComments(s.id, undefined, false, undefined, "first-view");
    await Promise.race([ready, sending]);
    const released = vi.fn();
    detach?.(released);
    expect(released).not.toHaveBeenCalled();
    expect(ownership.take(s.id, "manual", "next-view")).toBeUndefined();
    expect(ownership.availableForTask(s.id)).toBe(false);

    finishSend();
    expect(await sending).toMatchObject({ sent: 1 });
    expect(released).toHaveBeenCalledTimes(1);
    expect(ownership.take(s.id, "manual", "next-view")).toBeDefined();
  });
  test("恢复视图只能明确重交状态未知的意见，核实后才恢复键盘控制", async () => {
    const f = fakeClient();
    const ownership = new InputOwnership(
      () => undefined,
      (id): boolean => svc.reviewInputPending(id),
    );
    const { svc, space } = setup(f.client, { inputOwnership: ownership });
    const s = await svc.launch(req(space));
    const unknown = svc.addComment(s.id, { path: "a.md", side: "new", line: 1, text: "状态未知" });
    const pending = svc.addComment(s.id, { path: "a.md", side: "new", line: 2, text: "待发送" });
    (svc as unknown as { save(r: unknown): void }).save({ ...svc.get(s.id), reviewComments: [{ ...unknown, sending: true }, pending] });
    expect(ownership.take(s.id, "manual")).toBeUndefined();

    const recovered = vi.fn();
    expect(ownership.take(s.id, "manual", "recovery-view", { onReviewRecovered: recovered })).toBeDefined();
    await expect(svc.sendComments(s.id, undefined, false, undefined, "recovery-view")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(svc.sendComments(s.id, [unknown.id], false, undefined, "other-view")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(recovered).not.toHaveBeenCalled();
    expect(f.sends).toHaveLength(0);

    expect(await svc.sendComments(s.id, [unknown.id], false, undefined, "recovery-view")).toMatchObject({ sent: 1 });
    expect(recovered).toHaveBeenCalledTimes(1);
    expect(svc.comments(s.id)).toMatchObject([
      { id: unknown.id, sentAt: expect.any(String) },
      { id: pending.id, sentAt: null },
    ]);
    expect(f.sends).toHaveLength(1);
  });
  test("恢复视图删除最后一条状态未知的意见后通知重新接管", async () => {
    let loseReply = true;
    const f = fakeClient({
      beforeSend: async () => {
        if (loseReply) throw new Error("收据未返回");
      },
    });
    const ownership = new InputOwnership(
      () => undefined,
      (id): boolean => svc.reviewInputPending(id),
    );
    const { svc, space } = setup(f.client, { inputOwnership: ownership });
    const session = await svc.launch(req(space));
    const first = svc.addComment(session.id, { path: "a.md", side: "new", line: 1, text: "旧意见一" });
    const second = svc.addComment(session.id, { path: "a.md", side: "new", line: 2, text: "旧意见二" });
    await expect(svc.sendComments(session.id)).rejects.toThrow("发送结果未知");
    expect(svc.comments(session.id)).toMatchObject([
      { id: first.id, sending: true },
      { id: second.id, sending: true },
    ]);

    const reconnect = vi.fn();
    const detach = ownership.take(session.id, "manual", "recovery-view", { onReviewRecovered: reconnect });
    expect(detach).toBeDefined();
    svc.deleteComment(session.id, first.id);
    expect(reconnect).not.toHaveBeenCalled();
    svc.deleteComment(session.id, second.id);
    expect(svc.comments(session.id)).toEqual([]);
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(f.sends).toHaveLength(0);

    const pending = svc.addComment(session.id, { path: "a.md", side: "new", line: 3, text: "重新接管后的意见" });
    await expect(svc.sendComments(session.id, undefined, false, undefined, "recovery-view")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    detach?.();
    expect(ownership.take(session.id, "manual", "reconnected-view")).toBeDefined();
    loseReply = false;
    expect(await svc.sendComments(session.id, undefined, false, undefined, "reconnected-view")).toMatchObject({ sent: 1 });
    expect(svc.comments(session.id)).toMatchObject([{ id: pending.id, sentAt: expect.any(String) }]);
  });
  test("添加/删除/校验；发送：格式为“文件:新|旧行 — 意见”，成功后才标记已发送，只发未发送的", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    const a = svc.addComment(s.id, { path: "src/a.md", side: "new", line: 12, text: "这里\n需要处理空值" });
    svc.addComment(s.id, { path: "b.md", side: "old", line: 3, text: "旧逻辑为什么删了？" });
    expect(a.text).toBe("这里 需要处理空值"); // 换行压缩
    expect(() => svc.addComment(s.id, { path: "../x", side: "new", line: 1, text: "x" })).toThrow();
    expect(() => svc.addComment(s.id, { path: "/abs", side: "new", line: 1, text: "x" })).toThrow();
    expect(() => svc.addComment(s.id, { path: "a", side: "new", line: 0, text: "x" })).toThrow();
    expect(() => svc.addComment(s.id, { path: "a", side: "new", line: 1, text: "  " })).toThrow();
    expect(() => svc.addComment(s.id, { path: "a", side: "new", line: 1, text: "长".repeat(2001) })).toThrow();
    const r = await svc.sendComments(s.id);
    expect(r.sent).toBe(2);
    expect(f.sends).toHaveLength(1);
    expect(f.sends[0]).toMatchObject({ terminal: s.terminalId, text: "请根据以下审查意见继续工作：\nsrc/a.md:新12 — 这里 需要处理空值\nb.md:旧3 — 旧逻辑为什么删了？" });
    expect(svc.comments(s.id).every((c) => c.sentAt !== null && !c.sending)).toBe(true);
    await expect(svc.sendComments(s.id)).rejects.toMatchObject({ code: "INVALID_INPUT" }); // 没有待发送的
    const c = svc.addComment(s.id, { path: "c.md", side: "new", line: 1, text: "新增的" });
    expect((await svc.sendComments(s.id)).sent).toBe(1); // 只发新增的
    expect(f.sends[1]!.text).not.toContain("src/a.md");
    svc.deleteComment(s.id, c.id);
    expect(svc.comments(s.id)).toHaveLength(2);
    expect(() => svc.deleteComment(s.id, "rc-none")).toThrow();
  });
  test("发送失败：意见保持未发送且不留“发送中”；终端已不存在 → 提示恢复会话；会话没在运行 → 拒绝", async () => {
    const f = fakeClient({ failSend: "terminal not found" });
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    svc.addComment(s.id, { path: "a.md", side: "new", line: 1, text: "x" });
    await expect(svc.sendComments(s.id)).rejects.toThrow(/恢复会话/);
    expect(svc.comments(s.id)[0]).toMatchObject({ sentAt: null });
    expect(svc.comments(s.id)[0]!.sending).toBeUndefined();
    const g = fakeClient({ failRun: "throw" });
    const other = setup(g.client);
    const failed = await other.svc.launch(req(other.space)).catch(() => null);
    expect(failed).toBeNull();
    const rec = other.svc.list(other.space.id)[0]!;
    other.svc.addComment(rec.id, { path: "a.md", side: "new", line: 1, text: "x" });
    await expect(other.svc.sendComments(rec.id)).rejects.toThrow(/恢复会话/); // 状态 failed：没有运行中的会话
  });
  test("路径里的控制字符被拒绝；写进终端的路径把 shell 元字符换成 _；dryRun 只预览不发送、不改状态", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    expect(() => svc.addComment(s.id, { path: "a\nrm -rf ~", side: "new", line: 1, text: "x" })).toThrow();
    expect(() => svc.addComment(s.id, { path: "a\u0085b", side: "new", line: 1, text: "x" })).toThrow();
    svc.addComment(s.id, { path: "笔记/a.md;echo INJECT $(id) `x` | y", side: "new", line: 2, text: "注意" });
    const dry = await svc.sendComments(s.id, undefined, true);
    expect(dry.sent).toBe(0);
    expect(dry.text).toBe("请根据以下审查意见继续工作：\n笔记/a.md_echo INJECT __id_ _x_ _ y:新2 — 注意");
    expect(f.sends).toHaveLength(0);
    expect(svc.comments(s.id)[0]).toMatchObject({ sentAt: null });
    await svc.sendComments(s.id);
    expect(f.sends[0]!.text).toBe(dry.text);
  });
  test("已发送的意见不能通过显式 ids 再发；传输层错误（超时/断开）保留“发送状态未知”，Core 明确拒绝则清除", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    const c = svc.addComment(s.id, { path: "a.md", side: "new", line: 1, text: "x" });
    await svc.sendComments(s.id);
    await expect(svc.sendComments(s.id, [c.id])).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.sends).toHaveLength(1);
    const g = fakeClient({ failSendTransport: true });
    const o = setup(g.client);
    const os = await o.svc.launch(req(o.space));
    const oc = o.svc.addComment(os.id, { path: "a.md", side: "new", line: 1, text: "x" });
    await expect(o.svc.sendComments(os.id)).rejects.toThrow(/发送结果未知/);
    expect(o.svc.comments(os.id)[0]).toMatchObject({ id: oc.id, sentAt: null, sending: true });
    await expect(o.svc.sendComments(os.id)).rejects.toMatchObject({ code: "INVALID_INPUT" }); // 默认不会自动重发
  });
  test("损坏的会话记录不拖垮列表", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    await svc.launch(req(space));
    const dir = (svc as unknown as { d: { dir: string } }).d.dir;
    writeFileSync(path.join(dir, "sess-broken.json"), "{坏的");
    expect(svc.list(space.id)).toHaveLength(1);
  });
  test("意见正文里的 C0/C1 控制字符被替换成空格（不会作为转义序列进入终端）", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    const c = svc.addComment(s.id, { path: "a.md", side: "new", line: 1, text: "前\u001b[31m红\u009b后\u0007" });
    expect(c.text).toBe("前 [31m红 后");
  });
  test("并发发送同一会话：第二次被拒绝，不会重复写入终端", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    svc.addComment(s.id, { path: "a.md", side: "new", line: 1, text: "x" });
    const [a, b] = await Promise.allSettled([svc.sendComments(s.id), svc.sendComments(s.id)]);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect(f.sends).toHaveLength(1);
  });
  test("上一次发送中断（记录里停留在发送中）：默认不重发，需要明确选择", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    const c = svc.addComment(s.id, { path: "a.md", side: "new", line: 1, text: "x" });
    const rec = svc.get(s.id);
    (svc as unknown as { save(r: unknown): void }).save({ ...rec, reviewComments: [{ ...c, sending: true }] });
    await expect(svc.sendComments(s.id)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect((await svc.sendComments(s.id, [c.id])).sent).toBe(1);
  });
});

describe("恢复历史会话", () => {
  test.skipIf(process.platform === "win32")("claude：argv 为 --resume <id>，在原会话的子目录启动，记录保存原生 id", async () => {
    const f = fakeClient();
    const { svc, space, work } = setup(f.client);
    mkdirSync(path.join(work, "sub"));
    const s = await svc.launch(req(space, { provider: "claude", resumeSessionId: "abc-123", cwd: path.join(work, "sub") }));
    const run = f.runs[0];
    expect(run?.argv?.slice(1)).toEqual(["--dangerously-skip-permissions", "--resume", "abc-123"]);
    expect(run?.cwd).toBe(path.join(work, "sub"));
    expect(s).toMatchObject({ nativeSessionId: "abc-123", state: "running" });
    expect(s.cwd).toBe(path.join(work, "sub"));
  });
  test.skipIf(process.platform === "win32")("非法的原生会话 id 被拒绝（不能以 - 开头）", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    await expect(svc.launch(req(space, { provider: "claude", resumeSessionId: "--dangerously-skip-permissions" }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.calls).not.toContain("terminal.run");
  });
  test.skipIf(process.platform === "win32")("启动目录不在 Space 之内 → 拒绝，且不启动", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    await expect(svc.launch(req(space, { provider: "claude", resumeSessionId: "abc", cwd: tmp() }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.calls).not.toContain("terminal.run");
  });
});

describe("会话启动", () => {
  test("ACC-AG-02 shell：不传 argv，cwd=Space 根，带四个标签；记录先持久化后 running", async () => {
    const f = fakeClient();
    const { svc, space, work } = setup(f.client);
    const s = await svc.launch(req(space));
    expect(s).toMatchObject({ state: "running", terminalId: "t1", provider: "shell" });
    expect(f.terminals[0]?.labels).toMatchObject({ "huhu.vault": "vault-x", "huhu.space": space.id, "huhu.session": s.id });
    expect(s.cwd).toContain(path.basename(work));
    expect(svc.list(space.id)).toHaveLength(1);
  });
  test("同一 requestId 重复提交不会再次 run", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const r = req(space);
    const a = await svc.launch(r);
    const b = await svc.launch(r);
    expect(b.id).toBe(a.id);
    expect(f.calls.filter((c) => c === "terminal.run")).toHaveLength(1);
  });
  test("ACC-AG-07 响应丢失：按 huhu.launch 标签找回唯一终端，不重复 run", async () => {
    const f = fakeClient({ failRun: "throw-after-create" });
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space));
    expect(s).toMatchObject({ state: "running", terminalId: "t1" });
    expect(f.calls.filter((c) => c === "terminal.run")).toHaveLength(1);
  });
  test("run 回包缺失且找不到终端 → unknown + RUN_UNKNOWN", async () => {
    const f = fakeClient({ failRun: "throw" });
    const { svc, space } = setup(f.client);
    await expect(svc.launch(req(space))).rejects.toMatchObject({ code: "RUN_UNKNOWN" });
    expect(svc.list()[0]?.state).toBe("unknown");
  });
  test("provider 未检测到 → AGENT_NOT_FOUND，且不创建终端；revision 变化 → SPACE_INVALID", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    await expect(svc.launch(req(space, { provider: "codex" }))).rejects.toMatchObject({ code: "AGENT_NOT_FOUND" });
    await expect(svc.launch(req(space, { spaceRevision: 99 }))).rejects.toMatchObject({ code: "SPACE_INVALID" });
    expect(f.terminals).toHaveLength(0);
  });
  test.skipIf(process.platform === "win32")("claude 启动带 argv；中断/结束调用 terminal.interrupt/kill；重命名", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const s = await svc.launch(req(space, { provider: "claude", model: "opus", prompt: "hi" }));
    expect(s.provider).toBe("claude");
    await svc.interrupt(s.id);
    await svc.kill(s.id);
    expect(f.calls).toEqual(expect.arrayContaining(["terminal.interrupt", "terminal.kill"]));
    expect(svc.rename(s.id, "我的会话").name).toBe("我的会话");
    expect(() => svc.rename(s.id, " ")).toThrow();
  });
});

const REAL = process.env["HUHU_HERDR_BIN"] ?? path.resolve(import.meta.dirname, "../../..", "apps/desktop/resources/herdr", `${process.platform}-${process.arch}`, process.platform === "win32" ? "herdr-core.exe" : "herdr-core");
describe.skipIf(!existsSync(REAL))("真实 Herdr Core（Linux）", () => {
  test("启动实例、launch shell 会话、按标签查回、结束会话；Core 实例相互隔离", async () => {
    const rt = tmp();
    const core = new HerdrCore({ bin: REAL, vaultId: "vault-realtest", machineId: "m1abc", runtimeDir: rt });
    try {
      expect((await core.status()).state).toBe("connected");
      const { svc, space } = setup(await core.ensure());
      const s = await svc.launch(req(space));
      expect(s.state).toBe("running");
      const c = await core.ensure();
      const found = await c.call<{ terminals: { address: string; cwd: string }[] }>("terminal.list", { labels: { "huhu.session": s.id } });
      expect(found.terminals).toHaveLength(1);
      expect(found.terminals[0]?.address).toBe(s.terminalId);
      await svc.kill(s.id);
    } finally {
      await core.stop();
    }
  }, 60_000);
});

describe("审计回归", () => {
  test("相同 requestId 并发提交只 run 一次", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    const r = req(space);
    const [a, b] = await Promise.all([svc.launch(r), svc.launch(r)]);
    expect(a.id).toBe(b.id);
    expect(f.calls.filter((c) => c === "terminal.run")).toHaveLength(1);
  });
  test("prompt / model / effort 不能以 - 开头（避免被 CLI 当作选项）", async () => {
    const f = fakeClient();
    const { svc, space } = setup(f.client);
    for (const over of [{ prompt: "--dangerously-skip-permissions" }, { model: "-x" }, { effort: "--high" }]) {
      await expect(svc.launch(req(space, { provider: "claude", ...over }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(f.terminals).toHaveLength(0);
  });
});
