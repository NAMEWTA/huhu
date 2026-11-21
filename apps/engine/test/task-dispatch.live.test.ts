import { openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CapabilityResult, TaskDto, TaskExecution } from "@huhu/contracts";
import { AgentDetector, HerdrCore } from "@huhu/plugin-agent-cli/engine";
import { machineId } from "@huhu/vault";
import { expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { HerdrClient } from "../../../packages/herdr-client/src/index.js";
import { createDispatchProviderFixture, createFixtureGate, readFixtureJson } from "../../../plugins/agent-cli/test/fixtures/dispatch-provider.js";
import type { DispatchProvider } from "../../../plugins/agent-cli/src/engine/dispatch.js";
import type { DispatchReceipt, DispatchRecord } from "../../../plugins/tasks/src/engine/dispatch-store.js";
import { boot, type RunningEngine } from "../src/boot.js";
import { fixtureCoreCli, fixtureProcessRunning } from "../../../plugins/agent-cli/test/fixtures/core-cli.js";

const bin = process.env["HUHU_AGENT_LAUNCH_TEST_BIN"];
const fixture = vi.hoisted(() => ({ adapter: undefined as DispatchProvider | undefined, sandbox: "" }));
vi.mock("@huhu/plugin-agent-cli/engine", async (original) => {
  const agent = await original<typeof import("@huhu/plugin-agent-cli/engine")>();
  return {
    ...agent,
    apply: ((ctx, api, opts) =>
      agent.apply(ctx, api, {
        ...opts,
        ...(bin && { herdrBin: bin }),
        history: { home: fixture.sandbox, env: {} },
        ...(fixture.adapter && { dispatchProviders: { claude: fixture.adapter } }),
      })) satisfies typeof agent.apply,
  };
});
vi.mock("@huhu/plugin-tasks/engine", async (original) => {
  const tasks = await original<typeof import("@huhu/plugin-tasks/engine")>();
  return { ...tasks, apply: ((ctx, api, opts) => tasks.apply(ctx, api, { ...opts, dispatchCheckMs: 120 })) satisfies typeof tasks.apply };
});

const request = (capability: string, input: unknown) => ({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
async function post(engine: RunningEngine, capability: string, input: unknown, token = engine.rendererToken, session?: string) {
  const reply = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(session && { "mcp-session-id": session }) },
    body: JSON.stringify(request(capability, input)),
  });
  return (await reply.json()) as CapabilityResult<unknown>;
}
async function call<T = unknown>(engine: RunningEngine, capability: string, input: unknown): Promise<T> {
  const reply = await post(engine, capability, input);
  if (!reply.ok) throw new Error(`${capability}: ${JSON.stringify(reply.error)}`);
  return reply.data as T;
}

type Space = { id: string; name: string; root: string; revision: number };
type Session = { id: string; terminalId: string; spaceId: string };
const body = (id: string) => JSON.stringify({ kind: "fixture-task", dispatchId: id, text: "isolated task input" });
const intent = (task: TaskDto, dispatchId: string) => ({ taskId: task.id, dispatchId, expectedVersion: task.version, inputRevision: task.inputRevision, inputHash: task.inputHash });
const lookup = ({ taskId, dispatchId }: DispatchReceipt) => ({ taskId, dispatchId });
const recordOf = (engine: RunningEngine, receipt: DispatchReceipt) => readFixtureJson<DispatchRecord>(path.join(engine.vault.stateDir, "tasks", "dispatches", receipt.eventId + ".json"));
const pollReceipt = (engine: RunningEngine, receipt: DispatchReceipt, expected: Partial<DispatchReceipt>) =>
  expect.poll(() => call<DispatchReceipt>(engine, "tasks.dispatch.read", lookup(receipt)), { timeout: 8_000 }).toMatchObject({ runId: receipt.runId, attempt: receipt.attempt, ...expected });
const create = (engine: RunningEngine, name: string, spaceId: string, target?: TaskExecution["target"]) =>
  call<TaskDto>(engine, "tasks.create", { title: name, body: body(name), type: "agent", execution: { spaceId, provider: target?.mode === "existing" ? null : "claude", ...(target && { target }) } });
const active = (engine: RunningEngine, id: string, enabled: boolean) => call(engine, "plugins.setEnabled", { id, enabled });
const start = async (engine: RunningEngine, space: Space) => call<Session>(engine, "agent.sessions.launch", { spaceId: space.id, spaceRevision: space.revision, provider: "claude", requestId: randomUUID() });

async function useSandbox(run: (root: string) => Promise<void>) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-t21-")));
  fixture.sandbox = root;
  const detect = vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([]);
  try {
    await run(root);
  } finally {
    fixture.adapter = undefined;
    detect.mockRestore();
    if (path.dirname(root) === realpathSync(tmpdir()) && path.basename(root).startsWith("huhu-t21-")) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

test("Tasks production dispatch keeps providers without acceptance evidence unsupported", async () => {
  await useSandbox(async (root) => {
    const engine = await boot({ vaultPath: root, create: true });
    try {
      await active(engine, "automations", false);
      const [space] = await call<Space[]>(engine, "agent.spaces.list", {});
      const scope = { vaultId: engine.vault.id, machineId: machineId(), spaceId: space!.id };
      expect(await engine.dispatcher.call("plugin:tasks", request("agent.targets.list", scope))).toMatchObject({
        ok: true,
        data: expect.arrayContaining([expect.objectContaining({ mode: "new", available: false, reason: "provider_acceptance_unavailable" })]),
      });
      expect(await engine.dispatcher.call("plugin:automations", request("agent.targets.list", scope))).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      expect(await post(engine, "agent.targets.list", scope)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      await call(engine, "gateway.mcp.update", { enabled: true, transport: "stdio" });
      const session = await openMcpSession(`http://127.0.0.1:${engine.port}/api/v1/mcp`, engine.mcpToken);
      for (const token of [engine.cliToken, engine.mcpToken]) {
        expect(await post(engine, "agent.targets.list", scope, token, token === engine.mcpToken ? session : undefined)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
      }
      for (const target of [{ mode: "new" }, { mode: "resume", nativeSessionId: "synthetic-native-session" }] as const) {
        const task = await create(engine, target.mode, space!.id, target);
        if (target.mode === "resume") expect(task.dispatchBlockers).toContain("原生恢复需要 Agent CLI 支持绑定派遣");
        const input = intent(task, target.mode);
        const receipt = await call<DispatchReceipt>(engine, "tasks.dispatch", input);
        await pollReceipt(engine, receipt, { state: "blocked", reason: "target_unsupported" });
        expect(await call(engine, "tasks.read", { id: task.id })).toMatchObject({ status: "not_started", comments: [] });
        expect(await call(engine, "agent.sessions.list", {})).toEqual([]);
        expect(readFixtureJson(path.join(engine.vault.stateDir, "agent-cli", "dispatches", createHash("sha256").update(JSON.stringify(target.mode)).digest("hex") + ".json"))).toBeNull();
        console.info(JSON.stringify({ mode: target.mode, status: "target_unsupported", taskStatus: "not_started", launches: 0 }));
      }
    } finally {
      await engine.shutdown();
    }
  });
}, 30_000);

test.skipIf(!bin)(
  "Tasks production HTTP dispatch keeps the original Core session, snapshot and provider ACK",
  async () => {
    await useSandbox(async (sandbox) => {
      const root = path.join(sandbox, "vault");
      mkdirSync(root);
      let engine = await boot({ vaultPath: root, create: true });
      const mid = machineId();
      const runtimeDir = path.join(engine.vault.stateDir, "runtime", mid, "herdr");
      const core = new HerdrCore({ bin: bin!, vaultId: engine.vault.id, machineId: mid, runtimeDir });
      const env: NodeJS.ProcessEnv = { ...process.env, HC_SESSION: "huhu", HC_SOCKET: core.endpoint, XDG_STATE_HOME: path.join(runtimeDir, "state"), XDG_CONFIG_HOME: path.join(runtimeDir, "config") };
      for (const key of ["HC_TERMINAL_ID", "HC_TERMINAL_SOCKET", "HC_SCOPE"]) delete env[key];
      const cli = fixtureCoreCli(bin!, env);
      const { adapter, controls, pidOf, proofDir, readers, script } = createDispatchProviderFixture(sandbox, cli);
      const viewers = new Set<WebSocket>();
      const count = (id: string) =>
        readdirSync(proofDir)
          .filter((file) => file.endsWith(".jsonl"))
          .flatMap((file) => readers(file.slice(0, -6)))
          .filter((line) => line.dispatchId === id).length;
      const dispatch = (task: TaskDto, id: string) => call<DispatchReceipt>(engine, "tasks.dispatch", intent(task, id));
      const inspect = (receipt: DispatchReceipt) => engine.dispatcher.call("plugin:tasks", request("agent.runs.inspect", { ...lookup(receipt), runId: receipt.runId, attempt: receipt.attempt, vaultId: engine.vault.id, machineId: mid }));
      const taskRead = (task: TaskDto) => call<TaskDto>(engine, "tasks.read", { id: task.id });
      const checkTask = async (task: TaskDto, receipt: DispatchReceipt) => {
        await pollReceipt(engine, receipt, { state: "running", reason: null });
        await expect
          .poll(() => taskRead(task))
          .toMatchObject({ body: task.body, status: "in_progress", comments: expect.arrayContaining([expect.objectContaining({ id: `sys-${receipt.runId}-dispatched`, source: "system", run: receipt.runId })]) });
        expect((await taskRead(task)).comments.filter(({ id }) => id === `sys-${receipt.runId}-dispatched`)).toHaveLength(1);
      };
      const hold = async (sessionId: string) => {
        const ws = new WebSocket(`ws://127.0.0.1:${engine.port}/ws/terminal/${sessionId}?cols=80&rows=24`, [`bearer.${engine.rendererToken}`]);
        viewers.add(ws);
        await new Promise<void>((resolve, reject) => {
          ws.once("message", () => resolve());
          ws.once("error", reject);
          ws.once("close", (code) => reject(new Error(`Fixture terminal closed: ${code}`)));
        });
        return () => ws.close();
      };
      let started = false;
      try {
        expect(cli("server", "status").status).toBe(5);
        started = true;
        await active(engine, "automations", false);
        fixture.adapter = adapter;
        await active(engine, "agent-cli", false);
        await active(engine, "agent-cli", true);
        await call(engine, "agent.settings.update", {
          expectedRevision: 0,
          defaultAgent: "claude",
          waitingTasks: false,
          agents: { claude: { command: process.execPath, args: [script, proofDir] }, codex: { enabled: false }, pi: { enabled: false } },
        });
        const [space] = await call<Space[]>(engine, "agent.spaces.list", {});
        const id = "new-original";
        const task = await create(engine, id, space!.id);
        await call(engine, "tasks.comments.add", { taskId: task.id, body: "This discussion stays in the task." });
        controls.allowProof = false;
        const rpc = HerdrClient.prototype.call;
        let lostLaunches = 0;
        let lostWrites = 0;
        const fault = vi.spyOn(HerdrClient.prototype, "call").mockImplementation(async function <T>(this: HerdrClient, method: string, params?: unknown): Promise<T> {
          const response = (await rpc.call(this, method, params)) as T;
          if (method === "terminal.run") {
            lostLaunches++;
            this.close();
            throw new Error("fixture lost the Core launch response");
          }
          if (method === "terminal.send" && (params as { text?: string }).text === body(id)) {
            lostWrites++;
            this.close();
            throw new Error("fixture lost the Core input response");
          }
          return response;
        });
        const receipt = await dispatch(task, id);
        try {
          await pollReceipt(engine, receipt, { state: "unknown", reason: "awaiting_confirmation" });
        } finally {
          fault.mockRestore();
        }
        await expect.poll(() => [lostLaunches, lostWrites, count(id)]).toEqual([1, 1, 1]);
        expect(await taskRead(task)).toMatchObject({ status: "not_started", comments: [{ source: "human" }] });
        const [original] = await call<Session[]>(engine, "agent.sessions.list", { spaceId: space!.id });
        expect(original?.spaceId).toBe(space!.id);
        const originalPid = pidOf(original!.terminalId);
        expect(readers(original!.terminalId)).toEqual([{ pid: originalPid, dispatchId: id, sha256: createHash("sha256").update(task.body).digest("hex"), proof: true }]);
        expect(recordOf(engine, receipt)).toMatchObject({ snapshot: { body: task.body, source: { kind: "desktop" } }, agentTarget: { mode: "new", spaceId: space!.id, spaceRevision: space!.revision } });
        const coreStatus = JSON.parse(cli("server", "status").stdout) as { version: string; core: { id: string } };
        expect(coreStatus).toMatchObject({ version: "0.1.19" });
        expect(coreStatus.core.id).not.toBe("346bd5608735e3fcb27f9d01f5c8008e");
        await engine.shutdown();
        controls.allowProof = true;
        engine = await boot({ vaultPath: root });
        await checkTask(task, receipt);
        expect(await dispatch(task, id)).toMatchObject({ runId: receipt.runId, state: "running" });
        expect(await inspect(receipt)).toMatchObject({
          ok: true,
          data: { status: "accepted", coreWrite: "unknown", providerAcceptance: { execution: { runId: receipt.runId, sessionBinding: { sessionId: original!.id, coreAddress: original!.terminalId } } } },
        });
        expect(await call(engine, "agent.sessions.list", { spaceId: space!.id })).toMatchObject([original]);
        expect(pidOf(original!.terminalId)).toBe(originalPid);
        expect(count(id)).toBe(1);
        expect(await post(engine, "automations.list", {})).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
        console.info(JSON.stringify({ phase: "lost-launch-and-input-reconciled", coreStatus, session: original, pid: originalPid, runId: receipt.runId, count: count(id) }));

        const selected = await start(engine, space!);
        const release = await hold(selected.id);
        const existing = await create(engine, "explicit-existing", space!.id, { mode: "existing", sessionId: selected.id });
        const existingReceipt = await dispatch(existing, "explicit-existing");
        await pollReceipt(engine, existingReceipt, { state: "pending", reason: "waiting_resource" });
        expect(recordOf(engine, existingReceipt)).toMatchObject({ agentTarget: { mode: "existing", binding: { sessionId: selected.id, coreAddress: selected.terminalId } } });
        expect(count("explicit-existing")).toBe(0);
        controls.allowProof = false;
        release();
        await pollReceipt(engine, existingReceipt, { state: "unknown", reason: "awaiting_confirmation" });
        expect(await inspect(existingReceipt)).toMatchObject({ ok: true, data: { status: "unknown", coreWrite: "core_written", providerAcceptance: null } });
        expect(await taskRead(existing)).toMatchObject({ status: "not_started", comments: [] });
        controls.allowProof = true;
        await checkTask(existing, existingReceipt);
        expect(readers(selected.terminalId).map((entry) => entry.dispatchId)).toEqual(["explicit-existing"]);
        const afterExisting = await call<Session[]>(engine, "agent.sessions.list", { spaceId: space!.id });
        expect(afterExisting.map(({ id }) => id).sort()).toEqual([original!.id, selected.id].sort());
        console.info(JSON.stringify({ phase: "existing-after-manual-owner", session: selected, count: count("explicit-existing") }));

        const displaced = await start(engine, space!);
        const detach = await hold(displaced.id);
        const reused = await create(engine, "address-reused", space!.id, { mode: "existing", sessionId: displaced.id });
        const reusedReceipt = await dispatch(reused, "address-reused");
        await pollReceipt(engine, reusedReceipt, { state: "pending", reason: "waiting_resource" });
        const frozen = recordOf(engine, reusedReceipt)!.agentTarget;
        expect(cli("label", displaced.terminalId, "huhu.launch.generation=changed-in-isolated-core").status).toBe(0);
        detach();
        await pollReceipt(engine, reusedReceipt, { state: "pending", reason: "waiting_resource" });
        expect(recordOf(engine, reusedReceipt)!.agentTarget).toEqual(frozen);
        expect(count("address-reused")).toBe(0);
        expect(await taskRead(reused)).toMatchObject({ status: "not_started" });

        const oldDir = path.join(sandbox, "old-dir");
        const newDir = path.join(sandbox, "new-dir");
        mkdirSync(oldDir);
        mkdirSync(newDir);
        const other = await call<Space>(engine, "agent.spaces.save", { name: "Stale revision fixture", root: oldDir });
        const stale = await create(engine, "space-revised", other.id);
        const staleGate = createFixtureGate();
        controls.blockReady = staleGate.wait;
        const staleReceipt = await dispatch(stale, "space-revised");
        try {
          await staleGate.entered;
          await call(engine, "agent.spaces.save", { id: other.id, expectedRevision: other.revision, name: other.name, root: newDir });
        } finally {
          staleGate.resume();
        }
        await pollReceipt(engine, staleReceipt, { state: "claimed", reason: "waiting_resource" });
        expect(recordOf(engine, staleReceipt)).toMatchObject({ agentTarget: { spaceId: other.id, spaceRevision: other.revision } });
        expect(count("space-revised")).toBe(0);
        expect(await call(engine, "agent.sessions.list", { spaceId: other.id })).toMatchObject([{ spaceId: other.id }]);
        console.info(JSON.stringify({ phase: "frozen-targets", staleRevision: other.revision, reusedAddress: displaced.terminalId, staleInputs: count("space-revised"), reusedInputs: count("address-reused") }));

        const aborted = await create(engine, "tasks-disabled", space!.id);
        const abortGate = createFixtureGate();
        controls.blockReady = abortGate.wait;
        const abortReceipt = await dispatch(aborted, "tasks-disabled");
        try {
          await abortGate.entered;
          await active(engine, "tasks", false);
          expect(controls.readySignal?.aborted).toBe(true);
        } finally {
          abortGate.resume();
        }
        expect(count("tasks-disabled")).toBe(0);
        await active(engine, "tasks", true);
        await checkTask(aborted, abortReceipt);
        expect(count("tasks-disabled")).toBe(1);
        expect(recordOf(engine, reusedReceipt)).toMatchObject({ agentTarget: frozen, receipt: { state: "pending", reason: "waiting_resource" } });
        expect(count("address-reused")).toBe(0);
        expect(count("space-revised")).toBe(0);
        console.info(JSON.stringify({ phase: "tasks-abort-and-reconcile", signalAborted: true, runId: abortReceipt.runId, count: count("tasks-disabled") }));
      } finally {
        for (const socket of viewers) socket.terminate();
        try {
          await engine.shutdown();
        } finally {
          const status = started ? cli("server", "status") : undefined;
          if (status?.status === 0) {
            const { pid, holders } = JSON.parse(status.stdout) as { pid: number; holders: { pid: number }[] };
            const providerPids = readdirSync(proofDir)
              .filter((file) => file.endsWith(".ready.json"))
              .flatMap((file) => readFixtureJson<{ pid: number }>(path.join(proofDir, file))?.pid ?? []);
            expect(cli("server", "stop").status).toBe(0);
            const livePids = () => [pid, ...holders.map((holder) => holder.pid), ...providerPids].filter(fixtureProcessRunning);
            await expect.poll(livePids, { timeout: 5_000 }).toEqual([]);
            expect(cli("server", "status").status).toBe(5);
            console.info(JSON.stringify({ phase: "fixture-cleanup", endpoint: core.endpoint, livePids: livePids() }));
          }
        }
      }
    });
  },
  90_000,
);
