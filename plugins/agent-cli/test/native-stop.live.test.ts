import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CapabilityResult, ExecutionBinding, TaskDto } from "@huhu/contracts";
import { HerdrClient } from "@huhu/herdr-client";
import { AgentDetector, HerdrCore } from "@huhu/plugin-agent-cli/engine";
import { machineId } from "@huhu/vault";
import { expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { CodexDispatch } from "../src/engine/codex-dispatch.js";
import { AgentDispatch } from "../src/engine/dispatch.js";
import { InputOwnership } from "../src/engine/input-ownership.js";
import { launchHash } from "../src/engine/launch-binding.js";
import type { NativeStop, NativeStopStatus } from "../src/engine/native-stop.js";
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
      if (opts?.codexDispatch) fixture.root = opts.codexDispatch.root;
      return agent.apply(ctx, api, {
        ...opts,
        history: { home: fixture.directory, env: {} },
        ...(opts?.codexDispatch && { codexDispatch: { ...opts.codexDispatch, fixtureArgs: [path.join(import.meta.dirname, "fixtures", "codex-receipts-provider.cjs"), fixture.directory] } }),
      });
    }) satisfies typeof agent.apply,
  };
});

const request = (capability: string, input: unknown, idempotencyKey = randomUUID()) => ({ capability, input, requestId: randomUUID(), idempotencyKey });
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

type Event = { event: string; threadId?: string; turnId?: string; params?: { threadId: string; turnId: string } };
type Phase = "held-interrupt" | "workbench-stop" | "natural-before" | "allowed-without-result" | "failed-before" | "failed-with-error" | "external-interrupt" | "raced-natural" | "reused-pending" | "reused-unsent";

test.skipIf(!bin)(
  "Engine sends one native interrupt and reconciles only the original turn across races and Core replacement",
  async () => {
    const sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-native-stop-")));
    fixture.directory = sandbox;
    const makeDir = (name: string) => {
      const dir = path.join(sandbox, name);
      mkdirSync(dir);
      return dir;
    };
    const vaultPath = makeDir("vault");
    const desktopUserData = makeDir("desktop");
    const ackGate = makeDir("receipt-ack");
    writeFileSync(path.join(ackGate, "dispatch-id"), "fixture-failed-with-error");
    const protection = new TestProtection(desktopUserData);
    vi.stubEnv("HUHU_HERDR_BIN", bin!);
    vi.stubEnv("HUHU_NODE_BIN", process.execPath);
    vi.stubEnv("HUHU_CODEX_DISPATCH_BIN", process.execPath);
    vi.stubEnv("HUHU_CODEX_DISPATCH_HOME", makeDir("provider-home"));
    vi.stubEnv("HUHU_CODEX_DISPATCH_HELPER", path.resolve(import.meta.dirname, "../src/engine/codex-dispatch-helper.cjs"));
    vi.stubEnv("HUHU_E2E_TASK_RECEIPT_ACK_GATE", ackGate);
    const detect = vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([]);
    const dispatch = AgentDispatch.prototype.dispatch;
    const resultContract = vi.spyOn(AgentDispatch.prototype, "dispatch").mockImplementation(function (this: AgentDispatch, input, signal) {
      return dispatch.call(this, input.dispatchId === "fixture-allowed-without-result" ? { ...input, resultMode: "allow_no_update" } : input, signal);
    });
    let engine!: RunningEngine;
    let stopCore: (() => void) | undefined;
    const gate = createFixtureGate();
    const open = CodexDispatch.prototype.connectStop;
    const connectSpy = vi.spyOn(CodexDispatch.prototype, "connectStop");
    const rpc = HerdrClient.prototype.call;
    const ptyWrites: string[] = [];
    const coreSpy = vi.spyOn(HerdrClient.prototype, "call").mockImplementation(async function <T>(this: HerdrClient, method: string, params?: unknown) {
      if (["terminal.interrupt", "terminal.kill", "terminal.send"].includes(method)) ptyWrites.push(method);
      return (await rpc.call(this, method, params)) as T;
    });
    const signalFixture = (file: string) => writeFileSync(path.join(sandbox, file), "");
    const events = (phase: Phase): Event[] => {
      const log = path.join(sandbox, phase + ".jsonl");
      return existsSync(log)
        ? readFileSync(log, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line) as Event)
        : [];
    };
    const interrupts = (phase: Phase) => events(phase).filter(({ event }) => event === "interrupt");
    const dispatchFile = (input: NativeStop, kind: "dispatches" | "dispatch-stop-intents") => path.join(engine.vault.stateDir, "agent-cli", kind, launchHash(input.execution.dispatchId) + ".json");
    const dispatchRecord = (input: NativeStop) => JSON.parse(readFileSync(dispatchFile(input, "dispatches"), "utf8")) as { ownerActive: boolean };
    const stop = (input: NativeStop, inspect = false, caller: "plugin:tasks" | "desktop" = "plugin:tasks", transportKey = randomUUID()) =>
      engine.dispatcher.call(caller, request(inspect ? "agent.runs.stop.inspect" : "agent.runs.stop", input, transportKey));
    const status = (value: NativeStopStatus) => ({ ok: true, data: { status: value } });
    try {
      signalFixture("native-stop-fixture");
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection, create: true });
      const mid = machineId();
      const runtimeDir = path.join(engine.vault.stateDir, "runtime", mid, "herdr");
      const core = new HerdrCore({ bin: bin!, vaultId: engine.vault.id, machineId: mid, runtimeDir });
      const env: NodeJS.ProcessEnv = { ...process.env, HC_SESSION: "huhu", HC_SOCKET: core.endpoint, XDG_STATE_HOME: path.join(runtimeDir, "state"), XDG_CONFIG_HOME: path.join(runtimeDir, "config") };
      for (const key of ["HC_TERMINAL_ID", "HC_TERMINAL_SOCKET", "HC_SCOPE"]) delete env[key];
      const shell = process.platform === "win32" ? [process.env["COMSPEC"] ?? "C:\\Windows\\System32\\cmd.exe", "/d"] : ["/bin/sh", "-i"];
      const configDir = path.join(runtimeDir, "config", "herdr-core");
      mkdirSync(configDir, { recursive: true });
      writeFileSync(path.join(configDir, "config.toml"), "shell = " + JSON.stringify(shell) + "\n");
      const cli = fixtureCoreCli(bin!, env, sandbox);
      expect(cli("server", "status").status).toBe(5);
      stopCore = () => {
        if (cli("server", "status").status === 0) expect(cli("server", "stop").status).toBe(0);
        expect(cli("server", "status").status).toBe(5);
        console.info(JSON.stringify({ phase: "stop-fixture-cleanup", coreStopped: true }));
      };
      await call(engine, "plugins.setEnabled", { id: "automations", enabled: false });
      const [space] = await call<{ id: string }[]>(engine, "agent.spaces.list", {});
      async function run(phase: Phase): Promise<NativeStop> {
        const task = await call<TaskDto>(engine, "tasks.create", { title: phase, body: JSON.stringify({ scenario: phase }), type: "agent", execution: { spaceId: space!.id, provider: "codex" } });
        const dispatchId = "fixture-" + phase;
        const { runId, attempt } = await call<{ runId: string; attempt: number }>(engine, "tasks.dispatch", { taskId: task.id, dispatchId, expectedVersion: task.version, inputRevision: task.inputRevision, inputHash: task.inputHash });
        const lookup = { taskId: task.id, dispatchId, runId, attempt, vaultId: engine.vault.id, machineId: mid };
        let binding: { execution?: ExecutionBinding; status?: string; providerAcceptance?: { nativeTurnId?: string } } | undefined;
        await expect
          .poll(
            async () => {
              const result = await engine.dispatcher.call("plugin:tasks", request("agent.runs.inspect", lookup));
              binding = result.ok ? (result.data as typeof binding) : undefined;
              return binding?.status;
            },
            { timeout: 12_000 },
          )
          .toBe("accepted");
        expect(events(phase)).toEqual([{ event: "turn-start", threadId: binding?.execution?.sessionBinding.nativeSessionId, turnId: binding?.providerAcceptance?.nativeTurnId }]);
        return { execution: binding!.execution!, stopId: "stop-" + phase };
      }

      const held = await run("held-interrupt");
      expect(await stop(held, false, "desktop")).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      expect(await stop(held, true, "desktop")).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      expect(await stop(held, true)).toEqual(status("not_sent"));
      expect(existsSync(dispatchFile(held, "dispatch-stop-intents"))).toBe(false);
      expect(await stop({ ...held, execution: { ...held.execution, attempt: held.execution.attempt + 1 } })).toEqual(status("stale"));
      expect(await stop({ ...held, execution: { ...held.execution, sessionBinding: { ...held.execution.sessionBinding, processGeneration: "expired" } } })).toEqual(status("stale"));

      connectSpy.mockImplementationOnce(async function (this: CodexDispatch, ...args) {
        const channel = await open.apply(this, args);
        if (channel) await gate.wait();
        return channel;
      });
      const late = stop(held);
      expect(await Promise.race([gate.entered.then(() => "paused"), late.then(() => "finished")])).toBe("paused");
      const lostOwner = vi.spyOn(InputOwnership.prototype, "availableForTask").mockReturnValue(false);
      try {
        gate.resume();
        expect(await late).toEqual(status("stale"));
      } finally {
        lostOwner.mockRestore();
      }
      expect(existsSync(dispatchFile(held, "dispatch-stop-intents"))).toBe(false);
      expect(interrupts("held-interrupt")).toEqual([]);
      console.info(JSON.stringify({ phase: "ownership-changed-after-authentication", nativeInterrupts: 0, stopIntent: false }));

      const transportKey = randomUUID();
      expect(await Promise.all([stop(held, false, "plugin:tasks", transportKey), stop(held, false, "plugin:tasks", transportKey)])).toEqual([status("unknown"), status("unknown")]);
      await expect.poll(() => events("held-interrupt").map(({ event }) => event)).toContain("foreign-terminals-sent");
      const { threadId, turnId } = events("held-interrupt")[0]!;
      expect(interrupts("held-interrupt")).toEqual([{ event: "interrupt", params: { threadId, turnId } }]);
      expect(await stop(held, true)).toEqual(status("unknown"));
      expect(await stop({ ...held, stopId: "competing-stop" })).toEqual(status("stale"));
      expect(dispatchRecord(held).ownerActive).toBe(true);
      console.info(JSON.stringify({ phase: "rpc-returned-without-original-terminal", threadId, turnId, nativeInterrupts: 1, ownerActive: true, status: "unknown" }));
      await engine.shutdown();
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection });
      expect(await stop(held, false, "plugin:tasks", transportKey)).toEqual(status("unknown"));
      expect(dispatchRecord(held).ownerActive).toBe(true);
      signalFixture("held-interrupt.finish");
      await expect.poll(() => stop(held, true), { timeout: 10_000 }).toEqual(status("stopped"));
      expect(dispatchRecord(held).ownerActive).toBe(false);
      expect(await stop(held, false, "plugin:tasks", transportKey)).toEqual(status("stopped"));
      expect(interrupts("held-interrupt")).toHaveLength(1);
      console.info(JSON.stringify({ phase: "original-interruption-after-engine-reopen", nativeInterrupts: 1, ownerActive: false, status: "stopped" }));

      const projections: { phase: string; id: string }[] = [];
      for (const phase of ["natural-before", "allowed-without-result", "failed-before", "failed-with-error", "external-interrupt"] as const) {
        const input = await run(phase);
        signalFixture(phase + ".finish");
        const expected = phase === "external-interrupt" ? "stale" : "completed";
        await expect.poll(() => stop(input, true), { timeout: 10_000 }).toEqual(status(expected));
        expect(await stop(input)).toEqual(status(expected));
        await expect.poll(() => dispatchRecord(input).ownerActive, { timeout: 10_000 }).toBe(false);
        expect(existsSync(dispatchFile(input, "dispatch-stop-intents"))).toBe(false);
        expect(interrupts(phase)).toHaveLength(0);
        projections.push({ phase, id: input.execution.taskId });
      }
      const raced = await run("raced-natural");
      expect(await stop(raced)).toEqual(status("unknown"));
      await expect.poll(() => interrupts("raced-natural")).toHaveLength(1);
      signalFixture("raced-natural.finish");
      await expect.poll(() => stop(raced, true), { timeout: 10_000 }).toEqual(status("completed"));
      expect(await stop(raced)).toEqual(status("completed"));
      expect(dispatchRecord(raced).ownerActive).toBe(false);
      expect(interrupts("raced-natural")).toHaveLength(1);
      console.info(JSON.stringify({ phase: "natural-terminal-before-and-after-stop", prefinishedInterrupts: 0, racedInterrupts: 1, status: "completed" }));

      const workbench = await run("workbench-stop");
      const { taskId, dispatchId, runId } = workbench.execution;
      const selection = { taskId, dispatchId, runId, stopId: workbench.stopId };
      await expect.poll(() => call(engine, "tasks.dispatch.read", { taskId, dispatchId }), { timeout: 12_000 }).toMatchObject({ runId, state: "running" });
      expect(await call(engine, "tasks.dispatch.stop", selection)).toMatchObject({ ...selection, status: "pending" });
      await expect.poll(() => call(engine, "tasks.dispatch.stop.read", selection), { timeout: 15_000 }).toMatchObject({ status: "unknown" });
      expect(interrupts("workbench-stop")).toHaveLength(1);
      await engine.shutdown();
      signalFixture("workbench-stop.finish");
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection });
      await expect.poll(() => call(engine, "tasks.dispatch.stop.read", selection), { timeout: 15_000 }).toMatchObject({ ...selection, status: "stopped" });
      expect(await call(engine, "tasks.dispatch.stop", selection)).toMatchObject({ ...selection, status: "stopped" });
      expect(await call(engine, "tasks.runs", { id: taskId })).toMatchObject([{ id: runId, state: "cancelled" }]);
      expect(await call(engine, "tasks.read", { id: taskId })).toMatchObject({ status: "in_progress" });
      expect(interrupts("workbench-stop")).toHaveLength(1);
      console.info(JSON.stringify({ phase: "workbench-original-stop", nativeInterrupts: 1, originalRun: runId, taskStatus: "in_progress", stopStatus: "stopped" }));

      await expect.poll(() => existsSync(path.join(ackGate, "held.json")), { timeout: 10_000 }).toBe(true);
      writeFileSync(path.join(ackGate, "release"), "");
      await expect
        .poll(
          async () =>
            Promise.all(
              projections.map(async ({ phase, id }) => {
                const [runs, task] = await Promise.all([call(engine, "tasks.runs", { id }), call<TaskDto>(engine, "tasks.read", { id })]);
                return { phase, runs, comments: task.comments.filter(({ event }) => event === "failed" || event === "result").map(({ body }) => body), taskStatus: task.status };
              }),
            ),
          { timeout: 10_000 },
        )
        .toMatchObject([
          { phase: "natural-before", runs: [{ state: "unknown", finishedAt: expect.any(String) }], taskStatus: "in_progress" },
          { phase: "allowed-without-result", runs: [{ state: "succeeded", finishedAt: expect.any(String), result: { kind: "no_update", delivery: "delivered" } }], comments: [], taskStatus: "in_progress" },
          { phase: "failed-before", runs: [{ state: "failed", finishedAt: expect.any(String) }], comments: ["原生执行失败，未提供原因"], taskStatus: "in_progress" },
          { phase: "failed-with-error", runs: [{ state: "failed", finishedAt: expect.any(String) }], comments: ["Synthetic structured provider reason"], taskStatus: "in_progress" },
          { phase: "external-interrupt", runs: [{ state: "interrupted", finishedAt: expect.any(String) }], taskStatus: "in_progress" },
        ]);
      const originalAck = JSON.parse(readFileSync(path.join(ackGate, "held.json"), "utf8")) as { receipt: { receiptId: string } };
      const receipts = path.join(fixture.root, "agent-receipts");
      await expect.poll(() => existsSync(path.join(receipts, launchHash(originalAck.receipt.receiptId) + ".json.tasks-ack")), { timeout: 10_000 }).toBe(true);

      const pending = await run("reused-pending");
      const unsent = await run("reused-unsent");
      const get = (address: string) => {
        const result = cli("get", address, "--json");
        if (result.status !== 0) return null;
        return JSON.parse(result.stdout) as { address: string; pid: number | null; argv: string[]; state: string };
      };
      const originalTerminals = [pending, unsent].map((input) => get(input.execution.sessionBinding.coreAddress)!);
      expect(await stop(pending)).toEqual(status("unknown"));
      await expect.poll(() => interrupts("reused-pending")).toHaveLength(1);
      for (const terminal of originalTerminals) expect(cli("keep", terminal.address).status).toBe(0);
      const coreVersion = (JSON.parse(cli("server", "status").stdout) as { version: string }).version;
      expect(coreVersion).toBe("0.1.19");
      await engine.shutdown();
      expect(cli("server", "stop").status).toBe(0);
      expect(cli("server", "start").status).toBe(0);
      for (const prior of originalTerminals) {
        await expect
          .poll(
            () => {
              const replacement = get(prior.address);
              return replacement?.state === "live" && replacement.pid !== null && replacement.pid !== prior.pid && replacement.argv[0]?.toLowerCase() === shell[0]!.toLowerCase();
            },
            { timeout: 12_000 },
          )
          .toBe(true);
      }
      engine = await boot({ vaultPath, desktopUserData, moduleCredentialProtection: protection });
      expect(await stop(pending, true)).toEqual(status("unknown"));
      expect(await stop(pending)).toEqual(status("unknown"));
      expect(await stop({ ...pending, stopId: "new-replacement-stop" })).toEqual(status("stale"));
      expect(await stop(unsent)).toEqual(status("stale"));
      expect(existsSync(dispatchFile(unsent, "dispatch-stop-intents"))).toBe(false);
      expect(interrupts("reused-pending")).toHaveLength(1);
      expect(interrupts("reused-unsent")).toHaveLength(0);
      for (const prior of originalTerminals) expect(get(prior.address)).toMatchObject({ state: "live", argv: shell });
      expect(ptyWrites).toEqual([]);
      console.info(JSON.stringify({ phase: "same-address-replacement-shells", coreVersion, addresses: originalTerminals.map(({ address }) => address), newShellInterrupts: 0, priorStop: "unknown", freshStop: "stale" }));
    } finally {
      gate.resume();
      try {
        await engine?.shutdown();
      } finally {
        try {
          stopCore?.();
        } finally {
          connectSpy.mockRestore();
          coreSpy.mockRestore();
          detect.mockRestore();
          resultContract.mockRestore();
          vi.unstubAllEnvs();
          if (path.dirname(sandbox) === realpathSync(tmpdir()) && path.basename(sandbox).startsWith("huhu-native-stop-")) rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        }
      }
    }
  },
  100_000,
);
