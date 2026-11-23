import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CapabilityResult, TaskDto, TaskExecution, TaskHistorySelection } from "@huhu/contracts";
import { AgentDetector, HerdrCore } from "@huhu/plugin-agent-cli/engine";
import { machineId } from "@huhu/vault";
import { expect, test, vi } from "vitest";
import { HerdrClient } from "../../../packages/herdr-client/src/index.js";
import { CodexDispatch } from "../../../plugins/agent-cli/src/engine/codex-dispatch.js";
import { createFixtureGate } from "../../../plugins/agent-cli/test/fixtures/dispatch-provider.js";
import type { DispatchReceipt, DispatchRecord } from "../../../plugins/tasks/src/engine/dispatch-store.js";
import { boot, type RunningEngine } from "../src/boot.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { fixtureCoreCli, fixtureProcessRunning } from "../../../plugins/agent-cli/test/fixtures/core-cli.js";

const bin = process.env["HUHU_AGENT_LAUNCH_TEST_BIN"];
const fixture = vi.hoisted(() => ({ directory: "" }));
vi.mock("@huhu/plugin-agent-cli/engine", async (original) => {
  const agent = await original<typeof import("@huhu/plugin-agent-cli/engine")>();
  return {
    ...agent,
    apply: ((ctx, api, opts) =>
      agent.apply(ctx, api, {
        ...opts,
        history: { home: fixture.directory, env: {} },
        ...(opts?.codexDispatch && {
          codexDispatch: { ...opts.codexDispatch, fixtureArgs: [path.join(import.meta.dirname, "fixtures", "codex-app-server.cjs"), fixture.directory] },
        }),
      })) satisfies typeof agent.apply,
  };
});
vi.mock("@huhu/plugin-tasks/engine", async (original) => {
  const tasks = await original<typeof import("@huhu/plugin-tasks/engine")>();
  return { ...tasks, apply: ((ctx, api, opts) => tasks.apply(ctx, api, { ...opts, dispatchCheckMs: 120 })) satisfies typeof tasks.apply };
});

const request = (capability: string, input: unknown) => ({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
async function call<T = unknown>(engine: RunningEngine, capability: string, input: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${engine.rendererToken}`, "content-type": "application/json" },
    body: JSON.stringify(request(capability, input)),
  });
  const reply = (await response.json()) as CapabilityResult<unknown>;
  if (!reply.ok) throw new Error(`${capability}: ${reply.error.code}`);
  return reply.data as T;
}

type Event = { event: string; scenario?: string; threadId?: string; turnId?: string; pid?: number };

test.skipIf(!bin)(
  "Engine dispatch uses one original Core helper and accepts only its correlated native Codex response",
  async () => {
    const sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-codex-live-")));
    fixture.directory = sandbox;
    const vaultPath = path.join(sandbox, "vault");
    const desktopUserData = path.join(sandbox, "desktop");
    const home = path.join(sandbox, "codex-home");
    for (const dir of [vaultPath, desktopUserData, home]) mkdirSync(dir);
    const protection = new TestProtection(desktopUserData);
    vi.stubEnv("HUHU_HERDR_BIN", bin!);
    vi.stubEnv("HUHU_NODE_BIN", process.execPath);
    vi.stubEnv("HUHU_CODEX_DISPATCH_BIN", process.execPath);
    vi.stubEnv("HUHU_CODEX_DISPATCH_HOME", home);
    vi.stubEnv("HUHU_CODEX_DISPATCH_HELPER", path.resolve(import.meta.dirname, "../../../plugins/agent-cli/src/engine/codex-dispatch-helper.cjs"));
    const detect = vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([]);
    const mid = machineId();
    let engine!: RunningEngine;
    let stopCore: (() => Promise<void>) | undefined;
    const rpc = HerdrClient.prototype.call;
    let ptyInputs = 0;
    const coreSpy = vi.spyOn(HerdrClient.prototype, "call").mockImplementation(async function <T>(this: HerdrClient, method: string, params?: unknown) {
      if (method === "terminal.send") ptyInputs++;
      return (await rpc.call(this, method, params)) as T;
    });
    const events = (): Event[] => {
      try {
        return readFileSync(path.join(sandbox, "provider.jsonl"), "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as Event);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
    };
    try {
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection, create: true });
      const runtimeDir = path.join(engine.vault.stateDir, "runtime", mid, "herdr");
      const core = new HerdrCore({ bin: bin!, vaultId: engine.vault.id, machineId: mid, runtimeDir });
      const env: NodeJS.ProcessEnv = { ...process.env, HC_SESSION: "huhu", HC_SOCKET: core.endpoint, XDG_STATE_HOME: path.join(runtimeDir, "state"), XDG_CONFIG_HOME: path.join(runtimeDir, "config") };
      for (const key of ["HC_TERMINAL_ID", "HC_TERMINAL_SOCKET", "HC_SCOPE"]) delete env[key];
      const cli = fixtureCoreCli(bin!, env);
      expect(cli("server", "status").status).toBe(5);
      stopCore = async () => {
        const status = cli("server", "status");
        if (status.status === 0) {
          const { pid, holders } = JSON.parse(status.stdout) as { pid: number; holders: { pid: number }[] };
          const providerPids = events().flatMap((event) => {
            if (event.event === "thread" && event.threadId) return [Number(event.threadId.slice("thread-".length))];
            return event.event === "thread/resume" && event.pid ? [event.pid] : [];
          });
          const live = () => [pid, ...holders.map((holder) => holder.pid), ...providerPids].filter(fixtureProcessRunning);
          expect(cli("server", "stop").status).toBe(0);
          await expect.poll(live, { timeout: 5_000 }).toEqual([]);
          console.info(JSON.stringify({ probe: "fixture-cleanup", livePids: live() }));
        }
        expect(cli("server", "status").status).toBe(5);
      };
      const enable = (id: string, enabled: boolean) => call(engine, "plugins.setEnabled", { id, enabled });
      await enable("automations", false);
      const [space] = await call<{ id: string; root: string }[]>(engine, "agent.spaces.list", {});
      const scope = { vaultId: engine.vault.id, machineId: mid };
      const internal = (capability: string, input: unknown) => engine.dispatcher.call("plugin:tasks", request(capability, input));
      expect(await internal("agent.targets.list", { ...scope, spaceId: space!.id })).toMatchObject({
        ok: true,
        data: expect.arrayContaining([
          expect.objectContaining({ provider: "codex", mode: "new", available: true, structuredReply: false, structuredResult: false, cancel: false }),
          expect.objectContaining({ provider: "codex", mode: "resume", available: false }),
        ]),
      });
      const create = (scenario: string, target?: TaskExecution["target"]) =>
        call<TaskDto>(engine, "tasks.create", {
          title: scenario,
          body: JSON.stringify({ scenario, text: "isolated fixture input" }),
          type: "agent",
          execution: { spaceId: space!.id, provider: "codex", model: "gpt-5.2-codex", effort: "high", fast: true, ...(target && { target }) },
        });
      const intent = (task: TaskDto, dispatchId: string) => ({ taskId: task.id, dispatchId, expectedVersion: task.version, inputHash: task.inputHash, inputRevision: task.inputRevision });
      const begin = (task: TaskDto, id: string) => call<DispatchReceipt>(engine, "tasks.dispatch", intent(task, id));
      const key = ({ taskId, dispatchId }: DispatchReceipt) => ({ taskId, dispatchId });
      const inspect = (receipt: DispatchReceipt) => internal("agent.runs.inspect", { ...scope, ...key(receipt), runId: receipt.runId, attempt: receipt.attempt });
      const poll = (receipt: DispatchReceipt, state: string) =>
        expect.poll(() => call<DispatchReceipt>(engine, "tasks.dispatch.read", key(receipt)), { timeout: 20_000 }).toMatchObject({ runId: receipt.runId, attempt: receipt.attempt, state });
      const taskStatus = (task: TaskDto) => call<TaskDto>(engine, "tasks.read", { id: task.id });
      const turns = (scenario: string) => events().filter((e) => e.event === "turn" && e.scenario === scenario);

      const late = await create("late-native-ack");
      const [initial, retry] = await Promise.all([begin(late, "fixture-late"), begin(late, "fixture-late")]);
      expect(initial.runId).toBe(retry.runId);
      await poll(initial, "unknown");
      await expect.poll(() => turns("late-native-ack"), { timeout: 7_000 }).toHaveLength(1);
      const [turn] = turns("late-native-ack");
      expect(turn).toMatchObject({ sha: createHash("sha256").update(late.body).digest("hex"), clientUserMessageId: expect.stringMatching(/^[a-f0-9]{64}$/) });
      const pending = await inspect(initial);
      expect(pending).toMatchObject({ ok: true, data: { status: "unknown", coreWrite: "not_sent", nativeWrite: "unknown", providerAcceptance: null, execution: { sessionBinding: { nativeSessionId: turn!.threadId } } } });
      if (!pending.ok) throw new Error("Missing original execution");
      const { execution } = pending.data as { execution: { sessionBinding: { sessionId: string; coreAddress: string } } };
      const [session] = await call<{ id: string; terminalId: string; spaceId: string }[]>(engine, "agent.sessions.list", { spaceId: space!.id });
      expect(session).toMatchObject({ id: execution.sessionBinding.sessionId, terminalId: execution.sessionBinding.coreAddress, spaceId: space!.id });
      expect(events()).toContainEqual(
        expect.objectContaining({
          event: "thread",
          threadId: turn!.threadId,
          cwd: space!.root,
          ephemeral: true,
          sandbox: "read-only",
          approvalPolicy: "never",
          isolatedHome: true,
          model: "gpt-5.2-codex",
          effort: "high",
          serviceTier: "priority",
        }),
      );
      expect(await taskStatus(late)).toMatchObject({ status: "not_started", comments: [] });
      expect(await internal("agent.targets.list", { ...scope, spaceId: space!.id })).toMatchObject({
        ok: true,
        data: expect.arrayContaining([expect.objectContaining({ provider: "codex", mode: "existing", sessionId: session!.id, available: false, reason: "input_owned" })]),
      });
      const existing = await create("existing", { mode: "existing", sessionId: session!.id });
      const waiting = await begin(existing, "fixture-existing");
      await expect.poll(() => call(engine, "tasks.dispatch.read", key(waiting))).toMatchObject({ state: "pending", reason: "waiting_resource" });
      expect(await call(engine, "tasks.dispatch.cancel", key(waiting))).toMatchObject({ state: "cancelled" });
      await expect(create("resume", { mode: "resume", nativeSessionId: turn!.threadId! })).rejects.toThrow("INVALID_INPUT");
      expect(events().filter((e) => e.event === "thread")).toHaveLength(1);
      await enable("agent-cli", false);
      await engine.shutdown();
      writeFileSync(path.join(sandbox, "release"), "");
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection });
      expect(await taskStatus(late)).toMatchObject({ status: "not_started", comments: [] });
      await enable("agent-cli", true);
      await poll(initial, "running");
      await expect.poll(() => taskStatus(late)).toMatchObject({ status: "in_progress", comments: [expect.objectContaining({ source: "system", run: initial.runId })] });
      expect(await inspect(initial)).toMatchObject({
        ok: true,
        data: { status: "accepted", coreWrite: "not_sent", nativeWrite: "provider_accepted", ownerActive: false, execution, providerAcceptance: { nativeTurnId: turn!.turnId } },
      });
      expect(turns("late-native-ack")).toHaveLength(1);
      expect(events().filter((e) => e.event === "thread")).toHaveLength(1);
      console.info(JSON.stringify({ probe: "late-native-ack-after-engine-reopen", originalCoreAddress: session!.terminalId, originalSession: session!.id, nativeTurnBound: true, nativeInputs: 1, ptyInputs }));

      const missing = await create("missing-native-response");
      const missingReceipt = await begin(missing, "fixture-missing");
      await poll(missingReceipt, "unknown");
      await expect.poll(() => turns("missing-native-response")).toHaveLength(1);
      expect(await inspect(missingReceipt)).toMatchObject({ ok: true, data: { status: "unknown", coreWrite: "not_sent", ownerActive: true, providerAcceptance: null } });
      expect(await begin(missing, "fixture-missing")).toMatchObject({ state: "unknown", runId: missingReceipt.runId });

      const gate = createFixtureGate();
      const originalConnect = CodexDispatch.prototype.connect;
      const paused = vi.spyOn(CodexDispatch.prototype, "connect").mockImplementationOnce(async function (this: CodexDispatch, ...args) {
        const channel = await originalConnect.apply(this, args);
        await gate.wait();
        return channel;
      });
      const revoked = await create("tasks-disabled-before-submit");
      const revokedReceipt = await begin(revoked, "fixture-abort");
      try {
        await gate.entered;
        await enable("tasks", false);
      } finally {
        paused.mockRestore();
        gate.resume();
      }
      expect(turns("tasks-disabled-before-submit")).toHaveLength(0);
      await enable("tasks", true);
      await poll(revokedReceipt, "running");
      expect(turns("tasks-disabled-before-submit")).toHaveLength(1);
      expect(await taskStatus(missing)).toMatchObject({ status: "not_started", comments: [] });
      expect(turns("missing-native-response")).toHaveLength(1);
      expect(ptyInputs).toBe(0);
      expect(events().some((e) => e.event === "unsupported-server-request")).toBe(true);

      const sessionsPath = path.join(home, "sessions", "2026", "11", "23");
      mkdirSync(sessionsPath, { recursive: true });
      const makeSource = (title: string, gates: { gate?: string; writerGate?: string } = {}) => {
        const id = randomUUID();
        const file = path.join(sessionsPath, `rollout-2026-11-23T12-00-00-${id}.jsonl`);
        const cwd = space!.root;
        writeFileSync(
          file,
          [
            { type: "session_meta", payload: { id, cwd } },
            { type: "event_msg", payload: { type: "user_message", message: title } },
          ]
            .map((row) => JSON.stringify(row))
            .join("\n") + "\n",
        );
        return { id, path: file, cwd, ...gates };
      };
      const a = makeSource("A", { gate: "release-resume-a" });
      const b = makeSource("B");
      const c = makeSource("C");
      const d = makeSource("D");
      const e = makeSource("E", { writerGate: "release-writer-e" });
      writeFileSync(path.join(sandbox, "resume-sources.json"), JSON.stringify(Object.fromEntries([a, b, c, d, e].map((source) => [source.id, source]))));
      const setCodexEnabled = async (enabled: boolean) => {
        const { settings } = await call<{ settings: { revision: number; defaultAgent: string | null; agents: Record<string, Record<string, unknown>> } }>(engine!, "agent.settings.get", {});
        await call(engine!, "agent.settings.update", { expectedRevision: settings.revision, defaultAgent: settings.defaultAgent, agents: { ...settings.agents, codex: { ...settings.agents["codex"], enabled } } });
      };
      const listing = () => call<{ mode: string; nativeSessionId?: string; history?: TaskHistorySelection; available: boolean }[]>(engine, "tasks.dispatch.targets", { spaceId: space!.id });
      const makeTask = async (source: { id: string }, scenario = source.id) => {
        const row = (await listing()).find(({ nativeSessionId }) => nativeSessionId === source.id);
        expect(row).toMatchObject({ mode: "resume", available: true, history: { spaceId: space!.id } });
        return call<TaskDto>(engine, "tasks.create", {
          title: source.id,
          body: JSON.stringify({ scenario }),
          type: "agent",
          execution: { spaceId: space!.id, provider: "codex", target: { mode: "resume", nativeSessionId: source.id, history: row!.history } },
        });
      };
      const bTask = await makeTask(b, "late-native-resume");
      expect(await taskStatus(bTask)).toMatchObject({ execution: bTask.execution });
      const [bRun, sameRun] = await Promise.all([begin(bTask, "resume-b"), begin(bTask, "resume-b")]);
      expect(sameRun.runId).toBe(bRun.runId);
      await poll(bRun, "unknown");
      const frozen = JSON.parse(readFileSync(path.join(engine.vault.stateDir, "tasks", "dispatches", bRun.eventId + ".json"), "utf8")) as DispatchRecord;
      const input = {
        ...scope,
        taskId: bTask.id,
        runId: bRun.runId,
        attempt: bRun.attempt,
        dispatchId: bRun.dispatchId,
        eventIds: [bRun.eventId],
        inputSnapshotRef: bRun.eventId,
        inputSnapshotHash: frozen.snapshotHash,
        input: bTask.body,
        target: frozen.agentTarget,
      };
      expect(await internal("agent.runs.dispatch", { ...input, input: "different payload" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
      expect(await internal("agent.runs.dispatch", input)).toMatchObject({ ok: true, data: { status: "unknown" } });
      await setCodexEnabled(false);
      writeFileSync(path.join(sandbox, "release-resume-b"), "");
      await poll(bRun, "running");
      await setCodexEnabled(true);
      const proof = await inspect(bRun);
      expect(proof).toMatchObject({ ok: true, data: { status: "accepted", execution: { sessionBinding: { nativeSessionId: b.id } } } });
      expect(
        events()
          .filter((event) => event.threadId === b.id)
          .map(({ event }) => event),
      ).toEqual(["thread/read", "thread/resume", "turn"]);
      expect((await taskStatus(bTask)).comments.filter(({ run }) => run === bRun.runId)).toHaveLength(1);

      const aTask = await makeTask(a);
      const aRun = await begin(aTask, "resume-a-cancelled");
      await expect.poll(() => events().filter(({ event, threadId }) => event === "thread/resume" && threadId === a.id)).toHaveLength(1);
      const originalSession = async (nativeId: string) =>
        (await call<{ id: string; state: string; nativeSessionId?: string }[]>(engine!, "agent.sessions.list", { spaceId: space!.id })).find(({ nativeSessionId }) => nativeSessionId === nativeId);
      const aSession = await originalSession(a.id);
      expect(aSession).toBeDefined();
      await expect(call(engine, "agent.sessions.kill", { id: aSession!.id })).rejects.toThrow("INVALID_INPUT");
      await expect(call(engine, "tasks.dispatch.cancel", key(aRun))).resolves.toMatchObject({ state: "cancelled" });
      await call(engine, "agent.sessions.kill", { id: aSession!.id });
      await expect.poll(() => originalSession(a.id), { timeout: 8_000 }).toMatchObject({ state: "exited" });
      const aWriter = events().find(({ event, threadId }) => event === "thread/resume" && threadId === a.id)?.pid;
      expect(aWriter).toEqual(expect.any(Number));
      await expect.poll(() => fixtureProcessRunning(aWriter!), { timeout: 8_000 }).toBe(false);
      await expect.poll(() => listing(), { timeout: 8_000 }).toContainEqual(expect.objectContaining({ mode: "resume", nativeSessionId: a.id, available: true }));
      expect(events().filter(({ event, threadId }) => event === "turn" && threadId === a.id)).toHaveLength(0);

      const dTask = await makeTask(d);
      const submitGate = createFixtureGate();
      const pauseResume = vi.spyOn(CodexDispatch.prototype, "connect").mockImplementationOnce(async function (this: CodexDispatch, ...args) {
        const channel = await originalConnect.apply(this, args);
        await submitGate.wait();
        return channel;
      });
      const dRun = await begin(dTask, "resume-d-revoked");
      try {
        await submitGate.entered;
        await setCodexEnabled(false);
      } finally {
        pauseResume.mockRestore();
        submitGate.resume();
      }
      await poll(dRun, "blocked");
      expect(await inspect(dRun)).toMatchObject({ ok: true, data: { nativeWrite: "not_sent", providerAcceptance: null } });
      expect(events().filter(({ event, threadId }) => event === "turn" && threadId === d.id)).toHaveLength(0);
      await expect.poll(() => originalSession(d.id), { timeout: 12_000 }).toMatchObject({ state: "exited" });
      await setCodexEnabled(true);

      const eTask = await makeTask(e);
      const eRun = await begin(eTask, "resume-e-writer-busy");
      await expect.poll(() => events().filter(({ event, threadId }) => event === "thread/resume" && threadId === e.id).length).toBeGreaterThan(0);
      await expect.poll(() => call(engine!, "tasks.dispatch.read", key(eRun))).toMatchObject({ state: "claimed", reason: "waiting_resource" });
      expect(events().filter(({ event, threadId }) => event === "turn" && threadId === e.id)).toHaveLength(0);
      writeFileSync(path.join(sandbox, e.writerGate!), "");
      await poll(eRun, "running");
      expect(await inspect(eRun)).toMatchObject({ ok: true, data: { status: "accepted", execution: { sessionBinding: { nativeSessionId: e.id } } } });
      expect(events().filter(({ event, threadId }) => event === "turn" && threadId === e.id)).toHaveLength(1);

      const cTask = await makeTask(c);
      writeFileSync(c.path, readFileSync(c.path, "utf8") + "\n");
      const cRun = await begin(cTask, "resume-c-stale");
      await poll(cRun, "blocked");
      expect(events().filter(({ threadId }) => threadId === c.id)).toHaveLength(0);
      expect(ptyInputs).toBe(0);
      const info = JSON.parse(cli("server", "status").stdout) as { version: string; core: { id: string } };
      expect(info.version).toBe("0.1.19");
      console.info(JSON.stringify({ probe: "missing-ack-and-revocation", core: info.core.id, version: info.version, noAckState: "unknown", disabledBeforeSubmission: 0, afterReenable: 1, ptyInputs }));
    } finally {
      try {
        await engine?.shutdown();
      } finally {
        try {
          await stopCore?.();
        } finally {
          coreSpy.mockRestore();
          detect.mockRestore();
          vi.unstubAllEnvs();
          if (path.dirname(sandbox) === realpathSync(tmpdir()) && path.basename(sandbox).startsWith("huhu-codex-live-")) rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        }
      }
    }
  },
  100_000,
);
