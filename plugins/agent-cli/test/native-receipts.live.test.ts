import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { errors, ExecutionReceiptAckSchema, ExecutionReceiptSchema, HuhuError, type CapabilityResult, type ExecutionBinding, type ExecutionReceipt, type ExecutionReceiptAck, type TaskDto } from "@huhu/contracts";
import { createExecutionReceiptAck, executionReceiptIdentity, validateExecutionReceipt } from "@huhu/contracts/execution-receipt/engine";
import { CapabilityRegistry, defineCapability } from "@huhu/kernel";
import { AgentDetector, HerdrCore } from "@huhu/plugin-agent-cli/engine";
import { machineId } from "@huhu/vault";
import { expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { CodexDispatch } from "../src/engine/codex-dispatch.js";
import { putReceiptFile, TASKS_RECEIPTS_CONSUME } from "../src/engine/execution-receipts.js";
import { launchHash } from "../src/engine/launch-binding.js";

const bin = process.env["HUHU_AGENT_LAUNCH_TEST_BIN"];
const fixture = vi.hoisted(() => ({ directory: "", root: "" }));
vi.mock("@huhu/plugin-agent-cli/engine", async (original) => {
  const agent = await original<typeof import("@huhu/plugin-agent-cli/engine")>();
  return {
    ...agent,
    apply: ((ctx, api, opts) => {
      const codex = opts?.codexDispatch;
      if (codex) fixture.root = codex.root;
      return agent.apply(ctx, api, {
        ...opts,
        history: { home: fixture.directory, env: {} },
        receiptCheckMs: 120,
        ...(codex && { codexDispatch: { ...codex, fixtureArgs: [path.join(import.meta.dirname, "fixtures", "codex-receipts-provider.cjs"), fixture.directory] } }),
      });
    }) satisfies typeof agent.apply,
  };
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

function files(directory: string, pattern: RegExp): string[] {
  try {
    return readdirSync(directory)
      .filter((name) => pattern.test(name))
      .map((name) => path.join(directory, name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as unknown;

test.skipIf(process.platform !== "win32" || !bin)(
  "Windows Engine recovers both lost ACKs for the same native receipt without another input",
  async () => {
    const sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-w63-live-")));
    fixture.directory = sandbox;
    const makeDir = (name: string) => {
      const dir = path.join(sandbox, name);
      mkdirSync(dir);
      return dir;
    };
    const vaultPath = makeDir("vault");
    const desktopUserData = makeDir("desktop");
    const home = makeDir("provider-home");
    const receiver = makeDir("consumer");
    vi.stubEnv("HUHU_HERDR_BIN", bin!);
    vi.stubEnv("HUHU_NODE_BIN", process.execPath);
    vi.stubEnv("HUHU_CODEX_DISPATCH_BIN", process.execPath);
    vi.stubEnv("HUHU_CODEX_DISPATCH_HOME", home);
    vi.stubEnv("HUHU_CODEX_DISPATCH_HELPER", path.resolve(import.meta.dirname, "../src/engine/codex-dispatch-helper.cjs"));
    const detect = vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([]);
    const firstAck = vi.spyOn(CodexDispatch.prototype, "acknowledgeReport").mockImplementation(() => {
      throw new Error("Fixture dropped agent_received after durable acceptance");
    });
    const register = CapabilityRegistry.prototype.register;
    const replaceTasksReceiver = vi.spyOn(CapabilityRegistry.prototype, "register").mockImplementation(function (this: CapabilityRegistry, def) {
      if (def.name === TASKS_RECEIPTS_CONSUME) return () => {};
      return register.call(this, def);
    });
    const mid = machineId();
    let engine!: RunningEngine;
    let stopCore: (() => void) | undefined;
    const agentOutbox = () => path.join(fixture.root, "agent-receipts");
    const books = () => files(agentOutbox(), /^[a-f0-9]{64}\.json$/);
    const consumed = () => files(agentOutbox(), /\.tasks-ack$/);
    const providerEvents = () => {
      try {
        return readFileSync(path.join(sandbox, "native-events.log"), "utf8").trim().split("\n");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
    };
    const evidence = (name: string) => files(fixture.root, /^[a-f0-9]{64}$/).flatMap((dir) => files(dir, new RegExp(name)));
    const firstStage = () => evidence("^agent-ack-.*\\.json$");
    const inputReports = () => evidence("^report-.*\\.json$");
    const acceptedAcks: ExecutionReceiptAck[] = [];
    const deliveries: ExecutionReceipt[] = [];
    let answer: "drop" | "wrong-digest" | "exact" = "drop";
    function mountReceiver(expected: ExecutionBinding): void {
      const registerFixture = register.bind(engine.registry);
      registerFixture(
        defineCapability({
          name: TASKS_RECEIPTS_CONSUME,
          plugin: "tasks",
          scope: "write",
          exposable: false,
          defaultExposed: false,
          idempotency: "handler",
          input: ExecutionReceiptSchema,
          output: ExecutionReceiptAckSchema,
          handler({ caller }, input) {
            if (caller !== "plugin:agent-cli") throw errors.permissionDenied("fixture execution receipt");
            deliveries.push(input);
            const file = path.join(receiver, launchHash(input.receiptId) + ".json");
            const validation = validateExecutionReceipt(input, expected);
            if (validation.status === "rejected") throw errors.invalidInput("Unexpected fixture binding");
            putReceiptFile(file, {
              receipt: validation.receipt,
              consumption: {
                execution: expected,
                delivery: { receipt: validation.identity, deliveryId: `delivery-${input.receiptId}`, messageId: `message-${input.receiptId}` },
              },
            });
            const saved = read(file) as { receipt: unknown; consumption: unknown };
            const decision = createExecutionReceiptAck(input, "tasks_consumed", saved.receipt, saved.consumption);
            if (decision.status !== "ack") throw new Error("Fixture consumption was not durable");
            if (answer === "drop") throw new HuhuError("RUN_UNKNOWN", "Fixture lost first Tasks ACK");
            if (answer === "wrong-digest") return { ...decision.ack, receipt: { ...decision.ack.receipt, payloadSha256: "0".repeat(64) } };
            acceptedAcks.push(decision.ack);
            return decision.ack;
          },
        }),
      );
    }
    try {
      engine = await boot({ vaultPath, desktopUserData, create: true });
      const runtimeDir = path.join(engine.vault.stateDir, "runtime", mid, "herdr");
      const core = new HerdrCore({ bin: bin!, vaultId: engine.vault.id, machineId: mid, runtimeDir });
      const env: NodeJS.ProcessEnv = { ...process.env, HC_SESSION: "huhu", HC_SOCKET: core.endpoint, XDG_STATE_HOME: path.join(runtimeDir, "state"), XDG_CONFIG_HOME: path.join(runtimeDir, "config") };
      for (const key of ["HC_TERMINAL_ID", "HC_TERMINAL_SOCKET", "HC_SCOPE"]) delete env[key];
      const cli = (...args: string[]) => spawnSync(bin!, args, { env, windowsHide: true, encoding: "utf8", timeout: 15_000 });
      expect(cli("server", "status").status).toBe(5);
      stopCore = () => {
        if (cli("server", "status").status === 0) expect(cli("server", "stop").status).toBe(0);
        expect(cli("server", "status").status).toBe(5);
        console.info(JSON.stringify({ phase: "fixture-cleanup", isolatedCoreStopped: true }));
      };
      await call(engine, "plugins.setEnabled", { id: "automations", enabled: false });
      const [space] = await call<{ id: string }[]>(engine, "agent.spaces.list", {});
      const task = await call<TaskDto>(engine, "tasks.create", { title: "Fixture native reports", body: "Isolated native receipt probe.", type: "agent", execution: { spaceId: space!.id, provider: "codex" } });
      const key = { taskId: task.id, dispatchId: "fixture-w63" };
      const run = await call<{ runId: string; attempt: number }>(engine, "tasks.dispatch", { ...key, expectedVersion: task.version, inputRevision: task.inputRevision, inputHash: task.inputHash });
      await expect.poll(providerEvents, { timeout: 20_000 }).toContain("early-events");
      expect(inputReports()).toEqual([]);
      expect(books()).toEqual([]);
      writeFileSync(path.join(sandbox, "allow-turn-ack"), "");
      await expect.poll(books, { timeout: 10_000 }).toHaveLength(1);
      await expect.poll(() => firstAck.mock.calls.length).toBeGreaterThan(0);
      expect(firstStage()).toHaveLength(0);
      expect(inputReports()).toHaveLength(1);
      expect(consumed()).toHaveLength(0);
      const original = (read(books()[0]!) as { receipt: ExecutionReceipt }).receipt;
      expect(original).toMatchObject({ kind: "question", execution: { ...key, runId: run.runId, attempt: run.attempt }, payload: { mode: "native_deferred", text: "Choose a fixture shape", options: ["Circle", "Square"] } });
      const native = await engine.dispatcher.call("plugin:tasks", request("agent.runs.inspect", { ...key, runId: run.runId, attempt: run.attempt, vaultId: engine.vault.id, machineId: mid }));
      expect(native).toMatchObject({ ok: true, data: { status: "accepted", execution: original.execution } });
      const identity = executionReceiptIdentity(original);
      console.info(JSON.stringify({ phase: "helper-first-ack-dropped", receiptId: original.receiptId, payloadSha256: identity.payloadSha256, durableAgentReceipts: 1, helperAckFiles: 0 }));
      await engine.shutdown();
      firstAck.mockRestore();

      engine = await boot({ vaultPath, desktopUserData });
      await expect.poll(firstStage, { timeout: 10_000 }).toHaveLength(1);
      expect(read(firstStage()[0]!)).toMatchObject({ data: { stage: "agent_received", receipt: identity } });
      expect(books()).toHaveLength(1);
      expect(consumed()).toHaveLength(0);
      const heldByHelper = inputReports()[0]!;
      renameSync(heldByHelper, heldByHelper + ".fixture-released");
      mountReceiver(original.execution);
      expect(await engine.dispatcher.call("desktop", request(TASKS_RECEIPTS_CONSUME, original))).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      await expect.poll(() => files(receiver, /\.json$/)).toHaveLength(1);
      expect(consumed()).toHaveLength(0);
      console.info(JSON.stringify({ phase: "tasks-first-ack-dropped", receiptId: original.receiptId, durableConsumption: 1, agentTasksAckFiles: 0 }));
      await engine.shutdown();

      answer = "wrong-digest";
      const deliveredBefore = deliveries.length;
      engine = await boot({ vaultPath, desktopUserData });
      mountReceiver(original.execution);
      await expect.poll(() => deliveries.length).toBeGreaterThan(deliveredBefore);
      expect(consumed()).toHaveLength(0);
      expect(deliveries.every((receipt) => JSON.stringify(receipt) === JSON.stringify(original))).toBe(true);

      answer = "exact";
      await expect.poll(consumed).toHaveLength(1);
      expect(read(consumed()[0]!)).toEqual({ stage: "tasks_consumed", receipt: identity });
      writeFileSync(path.join(sandbox, "allow-turn-end"), "");
      await expect.poll(consumed, { timeout: 8_000 }).toHaveLength(2);
      expect(firstStage()).toHaveLength(2);
      const result = books()
        .map((book) => (read(book) as { receipt: ExecutionReceipt }).receipt)
        .find((receipt) => receipt.kind === "result");
      expect(result).toMatchObject({ execution: original.execution, payload: { message: "Synthetic result from the original turn." } });
      expect(files(receiver, /\.json$/)).toHaveLength(2);
      const receivedBeforeStop = deliveries.length;
      await engine.shutdown();
      engine = await boot({ vaultPath, desktopUserData });
      mountReceiver(original.execution);
      await expect.poll(() => call(engine, "tasks.read", { id: task.id }), { timeout: 10_000 }).toMatchObject({ status: "in_progress" });
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(deliveries).toHaveLength(receivedBeforeStop);
      expect(providerEvents().filter((event) => event === "turn-input")).toHaveLength(1);
      expect(providerEvents()).not.toContain("answered-original-question");
      expect(acceptedAcks.map(({ receipt }) => receipt.receiptId).sort()).toEqual([original.receiptId, result!.receiptId].sort());
      const info = JSON.parse(cli("server", "status").stdout) as { version: string };
      expect(info.version).toBe("0.1.19");
      console.info(
        JSON.stringify({
          phase: "reconciled",
          core: info.version,
          stages: ["agent_received", "tasks_consumed"],
          questionDeliveries: deliveries.filter(({ kind }) => kind === "question").length,
          uniqueConsumedReceipts: 2,
          nativeInputs: 1,
          questionAnswers: 0,
        }),
      );
    } finally {
      try {
        await engine?.shutdown();
      } finally {
        try {
          stopCore?.();
        } finally {
          detect.mockRestore();
          firstAck.mockRestore();
          replaceTasksReceiver.mockRestore();
          vi.unstubAllEnvs();
          if (path.dirname(sandbox) === realpathSync(tmpdir()) && path.basename(sandbox).startsWith("huhu-w63-live-")) rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        }
      }
    }
  },
  85_000,
);

test.skipIf(process.platform !== "win32" || !bin)(
  "Windows Engine delivers native receipts to the production Tasks inbox for the original run",
  async () => {
    const sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-w63-compose-")));
    fixture.directory = sandbox;
    const [vaultPath, desktopUserData, home] = ["vault", "desktop", "provider-home"].map((name) => {
      const dir = path.join(sandbox, name);
      mkdirSync(dir);
      return dir;
    }) as [string, string, string];
    vi.stubEnv("HUHU_HERDR_BIN", bin!);
    vi.stubEnv("HUHU_NODE_BIN", process.execPath);
    vi.stubEnv("HUHU_CODEX_DISPATCH_BIN", process.execPath);
    vi.stubEnv("HUHU_CODEX_DISPATCH_HOME", home);
    vi.stubEnv("HUHU_CODEX_DISPATCH_HELPER", path.resolve(import.meta.dirname, "../src/engine/codex-dispatch-helper.cjs"));
    const detect = vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([]);
    let engine: RunningEngine | undefined;
    let stopCore: (() => void) | undefined;
    try {
      engine = await boot({ vaultPath, desktopUserData, create: true });
      const mid = machineId();
      const runtimeDir = path.join(engine.vault.stateDir, "runtime", mid, "herdr");
      const core = new HerdrCore({ bin: bin!, vaultId: engine.vault.id, machineId: mid, runtimeDir });
      const env: NodeJS.ProcessEnv = { ...process.env, HC_SESSION: "huhu", HC_SOCKET: core.endpoint, XDG_STATE_HOME: path.join(runtimeDir, "state"), XDG_CONFIG_HOME: path.join(runtimeDir, "config") };
      for (const key of ["HC_TERMINAL_ID", "HC_TERMINAL_SOCKET", "HC_SCOPE"]) delete env[key];
      const cli = (...args: string[]) => spawnSync(bin!, args, { env, windowsHide: true, encoding: "utf8", timeout: 15_000 });
      expect(cli("server", "status").status).toBe(5);
      stopCore = () => {
        if (cli("server", "status").status === 0) expect(cli("server", "stop").status).toBe(0);
        expect(cli("server", "status").status).toBe(5);
      };
      await call(engine, "plugins.setEnabled", { id: "automations", enabled: false });
      const [space] = await call<{ id: string }[]>(engine, "agent.spaces.list", {});
      const task = await call<TaskDto>(engine, "tasks.create", { title: "Fixture production Tasks", body: "Isolated native receipt for the Tasks inbox.", type: "agent", execution: { spaceId: space!.id, provider: "codex" } });
      const key = { taskId: task.id, dispatchId: "fixture-w63-compose" };
      const run = await call<{ runId: string; attempt: number }>(engine, "tasks.dispatch", { ...key, expectedVersion: task.version, inputRevision: task.inputRevision, inputHash: task.inputHash });
      const eventLog = path.join(sandbox, "native-events.log");
      await expect.poll(() => files(sandbox, /^native-events\.log$/), { timeout: 20_000 }).toHaveLength(1);
      writeFileSync(path.join(sandbox, "allow-turn-ack"), "");
      const questions = () => call(engine!, "tasks.questions.list", { taskId: task.id });
      await expect.poll(questions, { timeout: 15_000 }).toMatchObject([{ runId: run.runId, mode: "native_deferred", status: "awaiting", options: ["Circle", "Square"] }]);
      expect(JSON.stringify(await questions())).not.toContain("nativeRequestId");
      const acks = () => files(path.join(fixture.root, "agent-receipts"), /\.tasks-ack$/).map((file) => read(file) as ExecutionReceiptAck);
      await expect.poll(acks).toMatchObject([{ stage: "tasks_consumed", receipt: { execution: { ...key, runId: run.runId } } }]);

      writeFileSync(path.join(sandbox, "allow-turn-end"), "");
      const results = async () => (await call<TaskDto>(engine!, "tasks.read", { id: task.id })).comments.filter(({ event }) => event === "result");
      await expect.poll(results, { timeout: 15_000 }).toMatchObject([{ run: run.runId, body: "Synthetic result from the original turn." }]);
      await expect.poll(questions).toMatchObject([{ runId: run.runId, status: "closed" }]);
      await expect.poll(acks).toHaveLength(2);
      const originalResults = await results();
      const originalAcks = acks();
      const bindings = originalAcks.map(({ receipt }) => receipt.execution);
      expect(bindings[0]).toEqual(bindings[1]);
      expect(originalResults[0]?.session).toBe(bindings[0]!.sessionBinding.sessionId);
      const readCore = await call<{ id: string; address: string }[]>(engine, "agent.sessions.list", { spaceId: space!.id });
      expect(readCore.find(({ id }) => id === bindings[0]!.sessionBinding.sessionId)).toBeDefined();
      await engine.shutdown();
      engine = await boot({ vaultPath, desktopUserData });
      expect(await results()).toEqual(originalResults);
      expect(acks()).toEqual(originalAcks);
      expect(
        readFileSync(eventLog, "utf8")
          .split("\n")
          .filter((event) => event === "turn-input"),
      ).toHaveLength(1);
      console.info(JSON.stringify({ phase: "production-tasks-consumed", sameSession: true, inputCount: 1, resultComments: originalResults.length, durableAcks: originalAcks.length }));
    } finally {
      try {
        await engine?.shutdown();
      } finally {
        try {
          stopCore?.();
        } finally {
          detect.mockRestore();
          vi.unstubAllEnvs();
          if (path.dirname(sandbox) === realpathSync(tmpdir()) && path.basename(sandbox).startsWith("huhu-w63-compose-")) rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        }
      }
    }
  },
  85_000,
);
