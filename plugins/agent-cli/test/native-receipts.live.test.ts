import { initializeMcp, mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { errors, ExecutionReceiptAckSchema, ExecutionReceiptSchema, HuhuError, type CapabilityResult, type ExecutionBinding, type ExecutionReceipt, type ExecutionReceiptAck, type TaskDto } from "@huhu/contracts";
import { createExecutionReceiptAck, executionReceiptIdentity, validateExecutionReceipt } from "@huhu/contracts/execution-receipt/engine";
import { CapabilityRegistry, defineCapability } from "@huhu/kernel";
import { AgentDetector, HerdrCore } from "@huhu/plugin-agent-cli/engine";
import { machineId } from "@huhu/vault";
import { expect, test, vi } from "vitest";
import { run as runCli } from "../../../apps/cli/src/main.js";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import type { DispatchInput, DispatchReceipt } from "../../tasks/src/engine/dispatch-store.js";
import { CodexDispatch } from "../src/engine/codex-dispatch.js";
import { putReceiptFile, TASKS_RECEIPTS_CONSUME } from "../src/engine/execution-receipts.js";
import { launchHash } from "../src/engine/launch-binding.js";
import { type NativeAnswer, type NativeAnswerStatus } from "../src/engine/native-answer.js";
import { createFixtureGate } from "./fixtures/dispatch-provider.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { fixtureCoreCli } from "./fixtures/core-cli.js";

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

async function expectUnknownTaskReconciliation(engine: RunningEngine, runId: string, replyId: string) {
  // Install after the provider fence so an earlier inspection cannot satisfy this check.
  const calls = vi.spyOn(engine.dispatcher, "call");
  try {
    const { value } = await vi.waitFor(
      () => {
        const index = calls.mock.calls.findIndex(([caller, { capability, input }]) => {
          if (caller !== "plugin:tasks" || capability !== "agent.runs.answer.inspect") return false;
          const answer = input as NativeAnswer;
          return answer.replyId === replyId && answer.execution.runId === runId;
        });
        const result = calls.mock.results[index];
        if (result?.type !== "return") throw new Error(`Waiting for answer reconciliation of ${replyId}`);
        return result;
      },
      { timeout: 15_000 },
    );
    expect(await value).toEqual({ ok: true, data: { status: "unknown" } });
  } finally {
    calls.mockRestore();
  }
}

test.skipIf(!bin)(
  "Engine recovers both lost ACKs for the same native receipt without another input",
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
    const protection = new TestProtection(desktopUserData);
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
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection, create: true });
      const runtimeDir = path.join(engine.vault.stateDir, "runtime", mid, "herdr");
      const core = new HerdrCore({ bin: bin!, vaultId: engine.vault.id, machineId: mid, runtimeDir });
      const env: NodeJS.ProcessEnv = { ...process.env, HC_SESSION: "huhu", HC_SOCKET: core.endpoint, XDG_STATE_HOME: path.join(runtimeDir, "state"), XDG_CONFIG_HOME: path.join(runtimeDir, "config") };
      for (const key of ["HC_TERMINAL_ID", "HC_TERMINAL_SOCKET", "HC_SCOPE"]) delete env[key];
      const cli = fixtureCoreCli(bin!, env);
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

      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection });
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
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection });
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
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection });
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

test.skipIf(!bin)(
  "MCP and CLI dispatch and answer through the same Core session and production Tasks inbox",
  async () => {
    const sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-w63-compose-")));
    fixture.directory = sandbox;
    const [vaultPath, desktopUserData, home] = ["vault", "desktop", "provider-home"].map((name) => {
      const dir = path.join(sandbox, name);
      mkdirSync(dir);
      return dir;
    }) as [string, string, string];
    const protection = new TestProtection(desktopUserData);
    vi.stubEnv("HUHU_HERDR_BIN", bin!);
    vi.stubEnv("HUHU_NODE_BIN", process.execPath);
    vi.stubEnv("HUHU_CODEX_DISPATCH_BIN", process.execPath);
    vi.stubEnv("HUHU_CODEX_DISPATCH_HOME", home);
    vi.stubEnv("HUHU_CODEX_DISPATCH_HELPER", path.resolve(import.meta.dirname, "../src/engine/codex-dispatch-helper.cjs"));
    const detect = vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([]);
    let engine: RunningEngine | undefined;
    let stopCore: (() => void) | undefined;
    try {
      writeFileSync(path.join(sandbox, "tasks-reply-fixture"), "");
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection, create: true });
      const mid = machineId();
      const runtimeDir = path.join(engine.vault.stateDir, "runtime", mid, "herdr");
      const core = new HerdrCore({ bin: bin!, vaultId: engine.vault.id, machineId: mid, runtimeDir });
      const env: NodeJS.ProcessEnv = { ...process.env, HC_SESSION: "huhu", HC_SOCKET: core.endpoint, XDG_STATE_HOME: path.join(runtimeDir, "state"), XDG_CONFIG_HOME: path.join(runtimeDir, "config") };
      for (const key of ["HC_TERMINAL_ID", "HC_TERMINAL_SOCKET", "HC_SCOPE"]) delete env[key];
      const cli = fixtureCoreCli(bin!, env);
      expect(cli("server", "status").status).toBe(5);
      stopCore = () => {
        if (cli("server", "status").status === 0) expect(cli("server", "stop").status).toBe(0);
        expect(cli("server", "status").status).toBe(5);
      };
      await call(engine, "plugins.setEnabled", { id: "automations", enabled: false });
      const [space] = await call<{ id: string }[]>(engine, "agent.spaces.list", {});
      const cliTool = async <T>(capability: string, input: unknown): Promise<T> => {
        const stdout: string[] = [];
        const stderr: string[] = [];
        const code = await runCli(["call", capability, "--vault", vaultPath, "--json", "--input-json", JSON.stringify(input)], { out: (line) => stdout.push(line), err: (line) => stderr.push(line) });
        expect(code, [...stdout, ...stderr].join("\n")).toBe(0);
        const result = JSON.parse(stdout.join("\n")) as CapabilityResult<T>;
        if (!result.ok) throw new Error(result.error.code);
        return result.data;
      };
      const mcpEndpoint = () => `http://127.0.0.1:${engine!.port}/mcp`;
      let mcpSession: string;
      const mcpTool = async <T>(capability: string, input: unknown): Promise<T> => {
        const response = await mcpRequest(mcpEndpoint(), engine!.mcpToken, mcpRpc("tools/call", { name: capability.replaceAll(".", "_"), arguments: input }), mcpSession);
        expect(response.status).toBe(200);
        const { result } = (await response.json()) as { result: { isError?: boolean; content: { text: string }[] } };
        expect(result.isError, result.content[0]?.text).not.toBe(true);
        return JSON.parse(result.content[0]!.text) as T;
      };
      for (const capability of ["tasks.agent.create", "tasks.dispatch", "tasks.dispatch.read", "tasks.questions.list", "tasks.reply", "tasks.reply.read", "tasks.read"]) {
        await call(engine, "gateway.update", { capability, exposed: true });
      }
      await call(engine, "gateway.mcp.update", { enabled: true, transport: "http" });
      mcpSession = await openMcpSession(mcpEndpoint(), engine.mcpToken);
      const task = await mcpTool<TaskDto>("tasks.agent.create", { title: "Fixture production Tasks", body: "Isolated native receipt for the Tasks inbox.", execution: { spaceId: space!.id, provider: "codex" } });
      expect(task.origin).toEqual({ kind: "external", caller: "mcp" });
      const key = { taskId: task.id, dispatchId: "fixture-w63-compose" };
      const run = await cliTool<{ runId: string; attempt: number }>("tasks.dispatch", { ...key, expectedVersion: task.version, inputRevision: task.inputRevision, inputHash: task.inputHash });
      const eventLog = path.join(sandbox, "native-events.log");
      await expect.poll(() => files(sandbox, /^native-events\.log$/), { timeout: 20_000 }).toHaveLength(1);
      writeFileSync(path.join(sandbox, "allow-turn-ack"), "");
      const questions = () => mcpTool<{ requestId: string; requestVersion: number; sessionId: string; runId: string }[]>("tasks.questions.list", { taskId: task.id });
      await expect.poll(questions, { timeout: 15_000 }).toMatchObject([{ runId: run.runId, mode: "native_deferred", status: "awaiting", options: ["Circle", "Square"] }]);
      expect(JSON.stringify(await questions())).not.toContain("nativeRequestId");
      const acks = () => files(path.join(fixture.root, "agent-receipts"), /\.tasks-ack$/).map((file) => read(file) as ExecutionReceiptAck);
      await expect.poll(acks).toMatchObject([{ stage: "tasks_consumed", receipt: { execution: { ...key, runId: run.runId } } }]);

      const [question] = await questions();
      const { runId, requestId, requestVersion, sessionId } = question!;
      const lookup = { taskId: task.id, runId, requestId, requestVersion, sessionId, replyId: "fixture-tasks-reply" };
      const answer = () => cliTool("tasks.reply", { ...lookup, answer: "Circle" });
      expect(await answer()).toMatchObject({ status: "pending" });
      const reply = () => call(engine!, "tasks.reply.read", lookup);
      const events = () => readFileSync(eventLog, "utf8").trim().split("\n");
      await expect.poll(events, { timeout: 15_000 }).toContain("answered-original-question");
      await expect.poll(reply, { timeout: 15_000 }).toMatchObject({ status: "unknown" });
      writeFileSync(path.join(sandbox, "resolve-without-proof"), "");
      await expect.poll(events, { timeout: 8_000 }).toContain("resolution-without-proof-processed");
      await expectUnknownTaskReconciliation(engine, runId, lookup.replyId);
      expect(await answer()).toMatchObject({ status: "unknown" });
      await engine.shutdown();
      writeFileSync(path.join(sandbox, "allow-answer-proof"), "");
      await expect.poll(events).toContain("original-answer-output");
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection });
      mcpSession = await openMcpSession(mcpEndpoint(), engine.mcpToken);
      await expect.poll(reply, { timeout: 15_000 }).toMatchObject({ status: "accepted" });
      writeFileSync(path.join(sandbox, "allow-turn-end"), "");
      const timeline = async () => (await cliTool<TaskDto>("tasks.read", { id: task.id })).comments.filter(({ event }) => event === "answer" || event === "result");
      await expect.poll(timeline, { timeout: 15_000 }).toMatchObject([
        { event: "answer", run: runId, session: sessionId, ask: requestId, body: "Circle" },
        { event: "result", run: runId, session: sessionId, body: "Synthetic result from the original turn." },
      ]);
      await expect.poll(questions).toMatchObject([{ runId: run.runId, status: "closed" }]);
      await expect.poll(acks).toHaveLength(2);
      const originalTimeline = await timeline();
      const originalAcks = acks();
      const bindings = originalAcks.map(({ receipt }) => receipt.execution);
      expect(bindings[0]).toEqual(bindings[1]);
      expect(sessionId).toBe(bindings[0]!.sessionBinding.sessionId);
      const readCore = await call<{ id: string; address: string }[]>(engine, "agent.sessions.list", { spaceId: space!.id });
      expect(readCore.find(({ id }) => id === bindings[0]!.sessionBinding.sessionId)).toBeDefined();
      expect(await call(engine, "tasks.dispatch.list", { taskId: task.id })).toMatchObject([{ runId, session: { id: sessionId, spaceId: space!.id } }]);
      await engine.shutdown();
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection });
      mcpSession = await openMcpSession(mcpEndpoint(), engine.mcpToken);
      expect(await timeline()).toEqual(originalTimeline);
      expect(acks()).toEqual(originalAcks);
      expect(await reply()).toMatchObject({ status: "accepted" });
      expect(events().filter((event) => event === "turn-input")).toHaveLength(1);
      expect(events().filter((event) => event === "answered-original-question")).toHaveLength(1);

      const next = await cliTool<TaskDto>("tasks.agent.create", {
        title: "Fixture existing provider session",
        body: "Follow the first turn on this fixture thread.",
        type: "agent",
        execution: { spaceId: space!.id, provider: "codex", target: { mode: "existing", sessionId } },
      });
      expect(next.origin).toEqual({ kind: "external", caller: "cli" });
      const nextInput = { taskId: next.id, dispatchId: "fixture-w63-existing", expectedVersion: next.version, inputRevision: next.inputRevision, inputHash: next.inputHash };
      const nextRun = await mcpTool<{ runId: string; attempt: number }>("tasks.dispatch", nextInput);
      await expect.poll(() => call(engine!, "tasks.dispatch.read", { taskId: next.id, dispatchId: nextInput.dispatchId }), { timeout: 15_000 }).toMatchObject({ state: "running" });
      const normalInput = { taskId: next.id, runId: nextRun.runId, sessionId, requestId: "fixture-ordinary-question", requestVersion: 1, replyId: "fixture-ordinary-reply" };
      const nextExecution = { vaultId: engine.vault.id, taskId: next.id, runId: nextRun.runId, attempt: nextRun.attempt, dispatchId: nextInput.dispatchId, sessionBinding: bindings[0]!.sessionBinding };
      const normal = await engine.dispatcher.call(
        "plugin:agent-cli",
        request(TASKS_RECEIPTS_CONSUME, {
          version: 1,
          receiptId: "fixture-ordinary-question-receipt",
          kind: "question",
          execution: nextExecution,
          payload: { mode: "normal", requestId: normalInput.requestId, requestVersion: normalInput.requestVersion, text: "Can you clarify?", options: [] },
        }),
      );
      expect(normal).toMatchObject({ ok: true, data: { stage: "tasks_consumed" } });
      const child = await mcpTool<{ followUpRunId: string }>("tasks.reply", { ...normalInput, answer: "Continue after the ordinary question." });
      expect(child).toMatchObject({ status: "pending" });
      expect(events()).not.toContain("ordinary-reply-input");

      writeFileSync(path.join(sandbox, "allow-existing-turn-end"), "");
      await expect
        .poll(async () => (await call<TaskDto>(engine!, "tasks.read", { id: next.id })).comments.filter(({ event }) => event === "result"), { timeout: 20_000 })
        .toMatchObject([{ event: "result", run: nextRun.runId, session: sessionId, body: "Synthetic result from the existing thread." }]);
      await expect.poll(acks).toHaveLength(3);
      const nextAck = acks().find(({ receipt }) => receipt.execution.runId === nextRun.runId);
      expect(nextAck?.receipt.execution.sessionBinding).toEqual(bindings[0]!.sessionBinding);
      expect(await mcpTool("tasks.dispatch", nextInput)).toMatchObject({ runId: nextRun.runId });
      expect(events().filter((event) => event === "existing-turn-input")).toHaveLength(1);
      await expect.poll(() => call(engine!, "tasks.reply.read", normalInput), { timeout: 20_000 }).toMatchObject({ status: "accepted", followUpRunId: child.followUpRunId });
      expect(events().filter((event) => event === "ordinary-reply-input")).toHaveLength(1);
      writeFileSync(path.join(sandbox, "allow-ordinary-reply-end"), "");
      await expect
        .poll(async () => (await mcpTool<TaskDto>("tasks.read", { id: next.id })).comments.filter(({ event }) => event === "result"), { timeout: 15_000 })
        .toMatchObject([{ run: nextRun.runId }, { run: child.followUpRunId, session: sessionId, body: "Synthetic result from the ordinary reply." }]);
      await expect.poll(acks).toHaveLength(4);
      expect(acks().find(({ receipt }) => receipt.execution.runId === child.followUpRunId)?.receipt.execution.sessionBinding).toEqual(bindings[0]!.sessionBinding);
      expect(await call(engine, "tasks.runs", { id: next.id })).toEqual(expect.arrayContaining([expect.objectContaining({ id: child.followUpRunId, parentRunId: nextRun.runId, state: "succeeded" })]));
      expect(await call(engine, "tasks.dispatch.recent", { limit: 3 })).toMatchObject([
        { title: next.title, dispatch: { runId: child.followUpRunId, session: { id: sessionId, spaceId: space!.id } }, run: { state: "succeeded", parentRunId: nextRun.runId } },
        { title: next.title, dispatch: { runId: nextRun.runId, session: { id: sessionId, spaceId: space!.id } }, run: { state: "succeeded" } },
        { title: task.title, dispatch: { runId, session: { id: sessionId, spaceId: space!.id } }, run: { state: "succeeded" } },
      ]);
      expect(await timeline()).toEqual(originalTimeline);
      expect(acks()).toEqual(expect.arrayContaining(originalAcks));
      console.info(JSON.stringify({ phase: "production-tasks-consumed", sameSession: true, inputCount: 3, nativeAnswerCount: 1, ordinaryAnswerCount: 1, timelineComments: originalTimeline.length, durableAcks: acks().length }));
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

test.skipIf(!bin).each(["CLI-only", "HTTP MCP-only"] as const)("%s creates, edits, dispatches, answers and reads one result in the original Core session", { timeout: 85_000 }, async (entry) => {
  const tempRoot = realpathSync(tmpdir());
  const sandbox = mkdtempSync(path.join(tempRoot, "huhu-external-task-"));
  let restoreDetect: (() => void) | undefined;
  let engine: RunningEngine | undefined;
  let stopCore: (() => void) | undefined;
  const signalFixture = (name: string) => writeFileSync(path.join(sandbox, name), "");
  const events = () => files(sandbox, /^native-events\.log$/).flatMap((file) => readFileSync(file, "utf8").trim().split("\n"));
  const acks = () => files(path.join(fixture.root, "agent-receipts"), /\.tasks-ack$/).map((file) => read(file) as ExecutionReceiptAck);

  try {
    fixture.directory = sandbox;
    const makeDir = (name: string) => {
      const dir = path.join(sandbox, name);
      mkdirSync(dir);
      return dir;
    };
    const vaultPath = makeDir("vault");
    const desktopUserData = makeDir("desktop");
    const home = makeDir("provider-home");
    const protection = new TestProtection(desktopUserData);
    vi.stubEnv("HUHU_HERDR_BIN", bin!);
    vi.stubEnv("HUHU_NODE_BIN", process.execPath);
    vi.stubEnv("HUHU_CODEX_DISPATCH_BIN", process.execPath);
    vi.stubEnv("HUHU_CODEX_DISPATCH_HOME", home);
    vi.stubEnv("HUHU_CODEX_DISPATCH_HELPER", path.resolve(import.meta.dirname, "../src/engine/codex-dispatch-helper.cjs"));
    const detect = vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([]);
    restoreDetect = () => detect.mockRestore();
    signalFixture("tasks-reply-fixture");
    engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection, create: true });
    const running = engine;
    const mid = machineId();
    const runtimeDir = path.join(running.vault.stateDir, "runtime", mid, "herdr");
    const core = new HerdrCore({ bin: bin!, vaultId: running.vault.id, machineId: mid, runtimeDir });
    const env: NodeJS.ProcessEnv = { ...process.env, HC_SESSION: "huhu", HC_SOCKET: core.endpoint, XDG_STATE_HOME: path.join(runtimeDir, "state"), XDG_CONFIG_HOME: path.join(runtimeDir, "config") };
    for (const key of ["HC_TERMINAL_ID", "HC_TERMINAL_SOCKET", "HC_SCOPE"]) delete env[key];
    const coreCli = fixtureCoreCli(bin!, env);
    expect(coreCli("server", "status").status).toBe(5);
    stopCore = () => {
      core.dispose();
      if (coreCli("server", "status").status === 0) expect(coreCli("server", "stop").status).toBe(0);
      expect(coreCli("server", "status").status).toBe(5);
    };

    // Desktop prepares the Vault and grants tools. All task operations use only the selected external entry.
    await call(running, "plugins.setEnabled", { id: "automations", enabled: false });
    const [space] = await call<{ id: string }[]>(running, "agent.spaces.list", {});
    if (!space) throw new Error("The fixture Vault has no Agent Space");
    const grant = (capability: string) => call(running, "gateway.update", { capability, exposed: true });
    const cliOnly = entry === "CLI-only";
    const endpoint = `http://127.0.0.1:${running.port}/mcp`;
    let session: string | undefined;
    if (!cliOnly) {
      expect((await mcpRequest(endpoint, running.mcpToken, initializeMcp)).status).toBe(404);
      await call(running, "gateway.mcp.update", { enabled: true, transport: "http" });
      session = await openMcpSession(endpoint, running.mcpToken);
    }
    const cliArgs = (capability: string, input: unknown, intentKey?: string) => ["call", capability, "--vault", vaultPath, "--json", "--input-json", JSON.stringify(input), ...(intentKey ? ["--intent-key", intentKey] : [])];
    const sendMcpTool = (capability: string, input: unknown, intentKey?: string) =>
      mcpRequest(
        endpoint,
        running.mcpToken,
        mcpRpc("tools/call", {
          name: capability.replaceAll(".", "_"),
          arguments: input,
          ...(intentKey && { _meta: { "huhu.dev/intent-key": intentKey } }),
        }),
        session,
      );
    const invoke = async <T>(capability: string, input: unknown, intentKey?: string): Promise<CapabilityResult<T>> => {
      if (cliOnly) {
        const stdout: string[] = [];
        const stderr: string[] = [];
        const code = await runCli(cliArgs(capability, input, intentKey), { out: (line) => stdout.push(line), err: (line) => stderr.push(line) });
        expect(stdout.length, stderr.join("\n")).toBeGreaterThan(0);
        const result = JSON.parse(stdout.join("\n")) as CapabilityResult<T>;
        expect(code).toBe(result.ok ? 0 : 1);
        return result;
      }
      const response = await sendMcpTool(capability, input, intentKey);
      expect(response.status).toBe(200);
      const { result } = (await response.json()) as { result: { isError?: boolean; content: { text: string }[]; structuredContent?: { data: T; opId?: string } } };
      if (result.isError) return { ok: false, error: JSON.parse(result.content[0]!.text) as Extract<CapabilityResult<T>, { ok: false }>["error"] };
      const structured = result.structuredContent;
      if (!structured) throw new Error(`${capability}: missing MCP structured result`);
      return { ok: true, ...structured };
    };
    const tool = async <T>(capability: string, input: unknown): Promise<T> => {
      const result = await invoke<T>(capability, input);
      if (!result.ok) throw new Error(`${capability}: ${JSON.stringify(result.error)}`);
      return result.data;
    };

    const denied = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
    const mismatch = { ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } };
    const intent = "external-agent-task-create";
    const origin = { kind: "external", caller: cliOnly ? "cli" : "mcp" };
    const draft = { title: `${entry} fixture task`, type: "agent", body: "Original fixture input.", execution: { spaceId: space.id, provider: "codex" } };
    expect(await invoke("tasks.create", draft, intent)).toMatchObject(denied);
    await grant("tasks.create");
    expect(await invoke("tasks.create", draft)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    await grant("tasks.agent.create");
    const created = await invoke<TaskDto>("tasks.create", draft, intent);
    if (!created.ok) throw new Error(`tasks.create: ${JSON.stringify(created.error)}`);
    expect(created.opId).toEqual(expect.any(String));
    const task = created.data;
    expect(task).toMatchObject({ type: "agent", origin, title: draft.title, execution: draft.execution });
    expect(await invoke("tasks.create", draft, intent)).toEqual(created);
    expect(await invoke("tasks.create", { ...draft, body: "Conflicting fixture input." }, intent)).toMatchObject(mismatch);
    await grant("tasks.list");
    expect(await tool("tasks.list", { type: "agent" })).toMatchObject([{ id: task.id }]);

    const patch = { title: `${draft.title} edited`, body: "Edited fixture input for the original turn." };
    const edit = { id: task.id, expectedVersion: task.version, baseEditHash: task.editHash, patch };
    expect(await invoke("tasks.update", edit)).toMatchObject(denied);
    await grant("tasks.update");
    const updated = await tool<TaskDto>("tasks.update", edit);
    expect(updated).toMatchObject({ id: task.id, origin, title: patch.title, inputRevision: task.inputRevision + 1 });
    expect(updated.version).not.toBe(task.version);
    expect(updated.inputHash).not.toBe(task.inputHash);
    await grant("tasks.read");
    const readTask = () => tool<TaskDto>("tasks.read", { id: task.id });
    expect(await readTask()).toMatchObject({ ...patch, id: task.id, version: updated.version, execution: draft.execution });

    const dispatchLookup = { taskId: task.id, dispatchId: "external-agent-task-dispatch" };
    const dispatch: DispatchInput = { ...dispatchLookup, expectedVersion: updated.version, inputRevision: updated.inputRevision, inputHash: updated.inputHash };
    expect(await invoke("tasks.dispatch", dispatch)).toMatchObject(denied);
    await grant("tasks.dispatch");
    expect(await invoke("tasks.dispatch", { ...dispatch, expectedVersion: task.version, inputRevision: task.inputRevision, inputHash: task.inputHash })).toMatchObject({
      ok: false,
      error: { code: "VERSION_CONFLICT", details: { reason: "stale_input" } },
    });
    const sent = await tool<DispatchReceipt>("tasks.dispatch", dispatch);
    expect(sent).toMatchObject({ ...dispatchLookup, state: "pending", attempt: 1 });
    const run = { ...dispatchLookup, runId: sent.runId, eventId: sent.eventId, attempt: sent.attempt, acceptedAt: sent.acceptedAt };
    expect(await tool("tasks.dispatch", dispatch)).toMatchObject(run);
    await expect.poll(events, { timeout: 20_000 }).toContain("early-events");
    signalFixture("allow-turn-ack");
    await grant("tasks.dispatch.read");
    const readDispatch = () => tool<DispatchReceipt>("tasks.dispatch.read", dispatchLookup);
    await expect.poll(readDispatch, { timeout: 15_000 }).toMatchObject({ ...run, state: "running" });
    await grant("tasks.questions.list");
    const questions = () => tool<{ requestId: string; requestVersion: number; sessionId: string; runId: string }[]>("tasks.questions.list", { taskId: task.id });
    await expect.poll(questions, { timeout: 15_000 }).toMatchObject([{ runId: sent.runId, mode: "native_deferred", status: "awaiting", text: "Choose a fixture shape", options: ["Circle", "Square"] }]);
    const [question] = await questions();
    expect(JSON.stringify(question)).not.toContain("nativeRequestId");
    const { runId, requestId, requestVersion, sessionId } = question!;
    await expect.poll(acks).toHaveLength(1);
    const [questionAck] = acks();
    const execution = questionAck!.receipt.execution;
    expect(questionAck).toMatchObject({
      stage: "tasks_consumed",
      receipt: {
        execution: {
          ...dispatchLookup,
          vaultId: running.vault.id,
          runId,
          attempt: sent.attempt,
          sessionBinding: { sessionId, machineId: mid, provider: "codex" },
        },
      },
    });
    const providerAcceptances = files(fixture.root, /^[a-f0-9]{64}$/).flatMap((dir) => files(dir, /^run-[a-f0-9]{64}-receipt\.json$/));
    expect(providerAcceptances.map(read)).toMatchObject([
      {
        data: { execution, inputSha256: createHash("sha256").update(patch.body).digest("hex"), nativeTurnId: expect.any(String) },
      },
    ]);
    const client = await core.peek();
    if (!client || client === "absent") throw new Error("The original fixture Core is unavailable");
    const coreSession = async () => {
      const { core: identity } = await client.call<{ core: { id: string } }>("server.status");
      const { terminals } = await client.call<{ terminals: { address: string }[] }>("terminal.list", { all: true, labels: { "huhu.vault": running.vault.id } });
      return { coreId: identity.id, address: terminals.find(({ address }) => address === execution.sessionBinding.coreAddress)?.address };
    };
    const originalSession = { coreId: execution.sessionBinding.coreId, address: execution.sessionBinding.coreAddress };
    expect(await coreSession()).toEqual(originalSession);

    const replyLookup = { taskId: task.id, runId, requestId, requestVersion, sessionId, replyId: "external-agent-task-reply" };
    const reply = { ...replyLookup, answer: "Circle" };
    expect(await invoke("tasks.reply", reply)).toMatchObject(denied);
    await grant("tasks.reply");
    await grant("tasks.reply.read");
    // Lose the first response, then look up the original answer before retrying its business ID.
    if (cliOnly) {
      const stderr: string[] = [];
      expect(await runCli(cliArgs("tasks.reply", reply), { out: () => {}, err: (line) => stderr.push(line) }), stderr.join("\n")).toBe(0);
    } else {
      const response = await sendMcpTool("tasks.reply", reply);
      expect(response.status).toBe(200);
      await response.body?.cancel();
    }
    const readReply = () => tool<{ acceptedAt: string }>("tasks.reply.read", replyLookup);
    await expect.poll(events, { timeout: 15_000 }).toContain("answered-original-question");
    await expect.poll(readReply, { timeout: 15_000 }).toMatchObject({ ...replyLookup, status: "unknown" });
    signalFixture("resolve-without-proof");
    await expect.poll(events, { timeout: 8_000 }).toContain("resolution-without-proof-processed");
    await expectUnknownTaskReconciliation(running, runId, replyLookup.replyId);
    const unconfirmed = await readReply();
    expect(unconfirmed).toMatchObject({ ...replyLookup, status: "unknown" });
    expect(await tool("tasks.reply", reply)).toEqual(unconfirmed);
    expect(await invoke("tasks.reply", { ...reply, answer: "Square" })).toMatchObject(mismatch);
    signalFixture("allow-answer-proof");
    await expect.poll(readReply, { timeout: 15_000 }).toMatchObject({ ...replyLookup, status: "accepted" });
    const accepted = await readReply();
    expect(accepted.acceptedAt).toBe(unconfirmed.acceptedAt);

    // The original input is already running. Queue cancellation records intent without interrupting that turn.
    await grant("tasks.dispatch.cancel");
    const cancelled = await tool("tasks.dispatch.cancel", dispatchLookup);
    expect(cancelled).toMatchObject({ ...run, state: "running", cancelRequested: true });
    expect(await tool("tasks.dispatch.cancel", dispatchLookup)).toEqual(cancelled);

    signalFixture("allow-turn-end");
    const timeline = async () => (await readTask()).comments.filter(({ event }) => event === "answer" || event === "result");
    await expect.poll(timeline, { timeout: 15_000 }).toMatchObject([
      { event: "answer", run: runId, session: sessionId, ask: requestId, body: reply.answer },
      { event: "result", run: runId, session: sessionId, body: "Synthetic result from the original turn." },
    ]);
    const originalTimeline = await timeline();
    await expect.poll(questions).toMatchObject([{ runId, requestId, requestVersion, sessionId, status: "closed", reply: accepted }]);
    await expect.poll(acks).toHaveLength(2);
    const originalAcks = acks();
    expect(originalAcks.map(({ stage, receipt }) => ({ stage, execution: receipt.execution }))).toEqual([
      { stage: "tasks_consumed", execution },
      { stage: "tasks_consumed", execution },
    ]);

    expect(await tool("tasks.reply", reply)).toEqual(accepted);
    expect(await tool("tasks.dispatch", dispatch)).toMatchObject(run);
    expect(await invoke("tasks.create", draft, intent)).toEqual(created);
    await grant("tasks.dispatch.list");
    expect(await tool("tasks.dispatch.list", { taskId: task.id })).toMatchObject([{ ...run, session: { id: sessionId, spaceId: space.id } }]);
    await grant("tasks.runs");
    expect(await tool("tasks.runs", { id: task.id })).toMatchObject([{ id: runId, state: "succeeded", result: { kind: "result", delivery: "delivered" } }]);
    expect(await tool("tasks.list", { type: "agent" })).toMatchObject([{ id: task.id }]);
    expect(await timeline()).toEqual(originalTimeline);
    expect(acks()).toEqual(originalAcks);
    expect(await coreSession()).toEqual(originalSession);
    expect(events().filter((event) => event === "turn-input" || event.endsWith("-input"))).toEqual(["turn-input"]);
    expect(events().filter((event) => event === "answered-original-question")).toEqual(["answered-original-question"]);
    expect(
      events()
        .filter((event) => event.startsWith('{"nativeAnswer":'))
        .map((event) => JSON.parse(event)),
    ).toEqual([{ nativeAnswer: { id: 0, result: { answers: { choice: { answers: [reply.answer] } } } } }]);
  } finally {
    try {
      await engine?.shutdown();
    } finally {
      try {
        stopCore?.();
      } finally {
        restoreDetect?.();
        vi.unstubAllEnvs();
        if (path.dirname(sandbox) === tempRoot && path.basename(sandbox).startsWith("huhu-external-task-")) rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  }
});

test.skipIf(!bin)(
  "Engine sends one answer to the original native request and reconciles only matching provider proof",
  async () => {
    const sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-w62-live-")));
    fixture.directory = sandbox;
    const makeDir = (name: string) => {
      const dir = path.join(sandbox, name);
      mkdirSync(dir);
      return dir;
    };
    const vaultPath = makeDir("vault");
    const desktopUserData = makeDir("desktop");
    const protection = new TestProtection(desktopUserData);
    vi.stubEnv("HUHU_HERDR_BIN", bin!);
    vi.stubEnv("HUHU_NODE_BIN", process.execPath);
    vi.stubEnv("HUHU_CODEX_DISPATCH_BIN", process.execPath);
    vi.stubEnv("HUHU_CODEX_DISPATCH_HOME", makeDir("provider-home"));
    vi.stubEnv("HUHU_CODEX_DISPATCH_HELPER", path.resolve(import.meta.dirname, "../src/engine/codex-dispatch-helper.cjs"));
    const detect = vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([]);
    const gate = createFixtureGate();
    let engine!: RunningEngine;
    let stopCore: (() => void) | undefined;
    const signalFixture = (name: string) => writeFileSync(path.join(sandbox, name), "");
    const events = () => files(sandbox, /^native-events\.log$/).flatMap((file) => readFileSync(file, "utf8").trim().split("\n"));
    const nativeAnswers = () =>
      events()
        .filter((event) => event.startsWith('{"nativeAnswer":'))
        .map((event) => JSON.parse(event) as unknown);
    const evidence = (pattern: RegExp) => files(fixture.root, /^[a-f0-9]{64}$/).flatMap((dir) => files(dir, pattern));
    const acknowledgements = () => evidence(/^answer-ack-.*\.json$/);
    const writes = () => evidence(/^answer-write-.*\.json$/);
    const intents = () => files(fixture.root, /^native-answer-intents\.json$/);
    const inputFor = (text: string) => {
      const match = evidence(/^report-.*\.json$/)
        .map((file) => (read(file) as { data: { receipt: ExecutionReceipt } }).data.receipt)
        .find((receipt) => receipt.kind === "question" && receipt.payload.mode === "native_deferred" && receipt.payload.text === text);
      if (match?.kind !== "question" || match.payload.mode !== "native_deferred") throw new Error(`Missing fixture question: ${text}`);
      const { requestId, requestVersion, nativeRequestId } = match.payload;
      return { execution: match.execution, requestId, requestVersion, nativeRequestId, replyId: "fixture-reply", answer: "Circle" } satisfies NativeAnswer;
    };
    const answer = (input: NativeAnswer, inspect = false, caller: "plugin:tasks" | "desktop" = "plugin:tasks", idempotencyKey = randomUUID()) =>
      engine.dispatcher.call(caller, { ...request(inspect ? "agent.runs.answer.inspect" : "agent.runs.answer", input), idempotencyKey });
    const status = (value: NativeAnswerStatus) => ({ ok: true, data: { status: value } });
    const connectAnswer = CodexDispatch.prototype.connectAnswer;
    const connectSpy = vi.spyOn(CodexDispatch.prototype, "connectAnswer");
    try {
      signalFixture("native-answer-fixture");
      signalFixture("allow-turn-ack");
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection, create: true });
      const mid = machineId();
      const runtimeDir = path.join(engine.vault.stateDir, "runtime", mid, "herdr");
      const core = new HerdrCore({ bin: bin!, vaultId: engine.vault.id, machineId: mid, runtimeDir });
      const env: NodeJS.ProcessEnv = { ...process.env, HC_SESSION: "huhu", HC_SOCKET: core.endpoint, XDG_STATE_HOME: path.join(runtimeDir, "state"), XDG_CONFIG_HOME: path.join(runtimeDir, "config") };
      for (const key of ["HC_TERMINAL_ID", "HC_TERMINAL_SOCKET", "HC_SCOPE"]) delete env[key];
      const cli = fixtureCoreCli(bin!, env);
      expect(cli("server", "status").status).toBe(5);
      stopCore = () => {
        if (cli("server", "status").status === 0) expect(cli("server", "stop").status).toBe(0);
        expect(cli("server", "status").status).toBe(5);
        console.info(JSON.stringify({ phase: "answer-fixture-cleanup", isolatedCoreStopped: true }));
      };
      await call(engine, "plugins.setEnabled", { id: "automations", enabled: false });
      const [space] = await call<{ id: string }[]>(engine, "agent.spaces.list", {});
      const task = await call<TaskDto>(engine, "tasks.create", { title: "Fixture native answer", body: "Isolated native answer probe.", type: "agent", execution: { spaceId: space!.id, provider: "codex" } });
      const dispatchId = "fixture-w62";
      const run = await call<{ runId: string; attempt: number }>(engine, "tasks.dispatch", { taskId: task.id, dispatchId, expectedVersion: task.version, inputRevision: task.inputRevision, inputHash: task.inputHash });
      await expect.poll(() => evidence(/^report-.*\.json$/), { timeout: 15_000 }).toHaveLength(2);
      const original = inputFor("Choose a fixture shape");
      expect(original.execution).toMatchObject({ taskId: task.id, dispatchId, runId: run.runId, attempt: run.attempt });
      expect(await answer(original, false, "desktop")).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      expect(await answer(original, true, "desktop")).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      expect(await answer(inputFor("Older fixture question"))).toEqual(status("stale"));
      expect(await answer({ ...original, requestVersion: 2 })).toEqual(status("stale"));
      expect(await answer({ ...original, execution: { ...original.execution, sessionBinding: { ...original.execution.sessionBinding, nativeSessionId: "foreign-thread" } } })).toEqual(status("stale"));
      expect(await answer({ ...original, answer: "circle" })).toEqual(status("unsupported"));
      expect(await answer(original, true)).toEqual(status("not_sent"));
      expect(intents()).toHaveLength(0);
      expect(writes()).toHaveLength(0);
      expect(nativeAnswers()).toHaveLength(0);

      let connections = 0;
      connectSpy.mockImplementation(async function (this: CodexDispatch, ...args) {
        const channel = await connectAnswer.apply(this, args);
        if (++connections === 2 && channel) await gate.wait();
        return channel;
      });
      const disabled = answer(original);
      expect(await Promise.race([gate.entered.then(() => "paused"), disabled.then(() => "finished")])).toBe("paused");
      try {
        await call(engine, "plugins.setEnabled", { id: "agent-cli", enabled: false });
        expect(await answer(original, true)).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
      } finally {
        gate.resume();
      }
      expect(await disabled).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
      expect(intents()).toHaveLength(0);
      expect(writes()).toHaveLength(0);
      expect(nativeAnswers()).toHaveLength(0);
      connectSpy.mockRestore();
      await call(engine, "plugins.setEnabled", { id: "agent-cli", enabled: true });
      expect(await answer(original, true)).toEqual(status("not_sent"));
      console.info(JSON.stringify({ phase: "answer-disabled-before-write", intents: intents().length, nativeWrites: nativeAnswers().length }));

      const contenders = [original, { ...original, replyId: "competing-reply", answer: "Square" }];
      const transportKeys = contenders.map(() => randomUUID());
      const replies = await Promise.all(contenders.map((input, index) => answer(input, false, "plugin:tasks", transportKeys[index])));
      expect(replies).toEqual(expect.arrayContaining([status("unknown"), status("stale")]));
      const chosenIndex = replies.findIndex((reply) => reply.ok && (reply.data as { status: NativeAnswerStatus }).status === "unknown");
      const chosen = contenders[chosenIndex]!;
      const competing = contenders[1 - chosenIndex]!;
      await expect.poll(nativeAnswers).toEqual([{ nativeAnswer: { id: 0, result: { answers: { choice: { answers: [chosen.answer] } } } } }]);
      expect(intents()).toHaveLength(1);
      expect(writes()).toHaveLength(1);
      expect(acknowledgements()).toHaveLength(0);
      expect(await answer(competing, true)).toEqual(status("stale"));
      expect(await answer({ ...chosen, answer: competing.answer })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
      expect(await answer(chosen, false, "plugin:tasks", transportKeys[chosenIndex])).toEqual(status("unknown"));

      signalFixture("resolve-without-proof");
      await expect.poll(events, { timeout: 8_000 }).toContain("resolution-without-proof-processed");
      expect(await answer(chosen, true)).toEqual(status("unknown"));
      expect(acknowledgements()).toHaveLength(0);
      console.info(JSON.stringify({ phase: "answer-resolution-without-ack", concurrentStatuses: replies, nativeAnswers: nativeAnswers().length, confirmed: acknowledgements().length }));
      await engine.shutdown();
      signalFixture("allow-answer-proof");
      await expect.poll(acknowledgements, { timeout: 8_000 }).toHaveLength(1);
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection });
      expect(await answer(chosen, true)).toEqual(status("accepted"));
      expect(await answer(chosen, false, "plugin:tasks", transportKeys[chosenIndex])).toEqual(status("accepted"));

      signalFixture("ask-canceled");
      await expect.poll(() => evidence(/^report-.*\.json$/)).toHaveLength(3);
      const canceled = { ...inputFor("Canceled fixture question"), replyId: "canceled-reply" };
      expect(await answer(canceled, true)).toEqual(status("not_sent"));
      signalFixture("cancel-question");
      await expect.poll(() => answer(canceled, true)).toEqual(status("stale"));
      expect(await answer(canceled)).toEqual(status("stale"));
      signalFixture("allow-turn-end");
      await expect.poll(events).toContain("turn-ended");
      expect(await answer(chosen, true)).toEqual(status("accepted"));
      expect(nativeAnswers()).toHaveLength(1);
      expect(events().filter((event) => event === "turn-input")).toHaveLength(1);
      const info = JSON.parse(cli("server", "status").stdout) as { version: string };
      expect(info.version).toBe("0.1.19");
      console.info(
        JSON.stringify({
          phase: "answer-reconciled-after-engine-restart",
          core: info.version,
          originalThread: original.execution.sessionBinding.nativeSessionId,
          nativeTurnInputs: 1,
          nativeAnswers: 1,
          confirmations: 1,
          canceledRequest: "stale",
        }),
      );
    } finally {
      gate.resume();
      try {
        await engine?.shutdown();
      } finally {
        try {
          stopCore?.();
        } finally {
          connectSpy.mockRestore();
          detect.mockRestore();
          vi.unstubAllEnvs();
          if (path.dirname(sandbox) === realpathSync(tmpdir()) && path.basename(sandbox).startsWith("huhu-w62-live-")) rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        }
      }
    }
  },
  85_000,
);
