import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HerdrClient } from "@huhu/herdr-client";
import { CapabilityRegistry, Dispatcher, EventBus, GatewayAudit, IdempotencyStore, PERMISSION_TABLE, PluginManager, createHuhuContext, type VaultServices } from "@huhu/kernel";
import { Vault, machineId } from "@huhu/vault";
import { expect, test, vi } from "vitest";
import { PluginManifestSchema, type ExecutionBinding } from "@huhu/contracts";
import { apply } from "../src/engine/index.js";
import type { DispatchInput, DispatchLookup } from "../src/engine/dispatch-store.js";
import { HerdrCore } from "../src/engine/herdr-core.js";
import type { TerminalBridge } from "../src/engine/terminal-bridge.js";
import { createDispatchProviderFixture, createFixtureGate, readFixtureJson as read } from "./fixtures/dispatch-provider.js";

const bin = process.env["HUHU_AGENT_LAUNCH_TEST_BIN"];
const caps = ["agent.targets.list", "agent.runs.dispatch", "agent.runs.inspect"];

class FixtureViewer extends EventEmitter {
  OPEN = 1;
  readyState = this.OPEN;
  bufferedAmount = 0;
  messages: string[] = [];
  send(message: string | Buffer) {
    if (typeof message === "string") this.messages.push(message);
  }
  close() {
    if (this.readyState !== this.OPEN) return;
    this.readyState = 3;
    this.emit("close");
  }
}

type Target = { mode: string; provider: string; available: boolean; reason: string | null; configurationId: string | null; binding: ExecutionBinding["sessionBinding"] | null };
type Result = { status: string; reason: string | null; acceptedAt: string | null; execution: ExecutionBinding | null; coreWrite: string; providerAcceptance: unknown; ownerActive: boolean };
test.skipIf(process.platform !== "win32" || !bin)(
  "locked Windows Core keeps durable task ownership and independent provider evidence",
  async () => {
    const sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-w61-")));
    let vault = await Vault.open(mkdirSync(path.join(sandbox, "vault"), { recursive: true })!, { create: true });
    const scope = { vaultId: vault.id, machineId: machineId() };
    const runtimeDir = path.join(vault.stateDir, "runtime", scope.machineId, "herdr");
    const core = new HerdrCore({ bin: bin!, ...scope, runtimeDir });
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HC_SESSION: "huhu",
      HC_SOCKET: core.endpoint,
      XDG_STATE_HOME: path.join(runtimeDir, "state"),
      XDG_CONFIG_HOME: path.join(runtimeDir, "config"),
    };
    for (const key of ["HC_TERMINAL_ID", "HC_TERMINAL_SOCKET", "HC_SCOPE"]) delete env[key];
    const cli = (...args: string[]) => spawnSync(bin!, args, { env, windowsHide: true, encoding: "utf8", timeout: 15_000 });
    const { adapter, controls, proofDir, script, readers, pidOf } = createDispatchProviderFixture(sandbox, cli);
    const permission = "test.agent.dispatch";
    const permissions = PERMISSION_TABLE as Record<string, readonly string[]>;
    const openViewers: FixtureViewer[] = [];
    let dispatcher: Dispatcher;
    let manager!: PluginManager;
    let refreshBridge!: () => void;
    let bridge: TerminalBridge | undefined;
    let dispose: (() => void) | undefined;
    let started = false;
    const engine = async (withAdapter: boolean) => {
      const registry = new CapabilityRegistry();
      const events = new EventBus(() => vault.id);
      dispatcher = new Dispatcher({
        registry,
        audit: new GatewayAudit(),
        idempotency: new IdempotencyStore(),
        isPluginEnabled: (id) => manager.isEnabled(id),
        toolAccess: () => ({ state: "ready", revision: 0, choices: {} }),
        grantedPermissions: () => [permission],
        pluginOrigin: () => "builtin",
        log: (_level, message, extra) => console.error(message, extra),
      });
      const { root, facade, getService } = createHuhuContext({
        registry,
        events,
        vault: { files: vault.files, stateDir: vault.stateDir, vaultId: vault.id } as VaultServices,
        call: async () => {
          throw new Error("isolated fixture does not call other plugins");
        },
      });
      manager = new PluginManager(root, facade, events);
      manager.register({
        manifest: PluginManifestSchema.parse({ id: "agent-cli", title: "Agent CLI", description: "", version: "1.0.0", origin: "builtin" }),
        apply: (ctx, api) => {
          apply(ctx, api, { herdrBin: bin!, history: { home: sandbox, env: {} }, ...(withAdapter ? { dispatchProviders: { claude: adapter } } : {}) });
        },
      });
      dispose = () => manager.disposeAll();
      expect(await manager.enable("agent-cli")).toBe("active");
      refreshBridge = () => {
        bridge = getService<TerminalBridge>("terminalBridge:agent")!;
      };
      refreshBridge();
    };
    const request = (name: string, input: unknown, caller: "plugin:tasks" | "plugin:automations" | "desktop" = "plugin:tasks", idempotencyKey = crypto.randomUUID()) => {
      const requestId = crypto.randomUUID();
      return dispatcher.call(caller, { capability: name, input, requestId, idempotencyKey });
    };
    async function call<T>(name: string, input: unknown, caller?: "desktop"): Promise<T> {
      const reply = await request(name, input, caller);
      if (!reply.ok) throw new Error(name + " " + JSON.stringify(reply.error));
      return reply.data as T;
    }
    const body = (dispatchId: string, exitWithoutProof = false) => JSON.stringify({ kind: "fixture-task", dispatchId, text: "isolated input", exitWithoutProof });
    const recordFile = (id: string) => path.join(vault.stateDir, "agent-cli", "dispatches", createHash("sha256").update(JSON.stringify(id)).digest("hex") + ".json");
    const key = (dispatchId: string): DispatchLookup => ({ ...scope, taskId: "task-" + dispatchId, runId: "run-" + dispatchId, attempt: 1, dispatchId });
    const work = (dispatchId: string, target: DispatchInput["target"], exitWithoutProof = false): DispatchInput => ({
      ...key(dispatchId),
      target,
      eventIds: ["event-1", "event-2"],
      inputSnapshotRef: "snapshot-" + dispatchId,
      inputSnapshotHash: "a".repeat(64),
      input: body(dispatchId, exitWithoutProof),
    });
    try {
      expect(cli("server", "status").status).toBe(5);
      started = true;
      permissions[permission] = caps;
      await engine(false);
      const [space] = await call<{ id: string; revision: number }[]>("agent.spaces.list", {}, "desktop");
      const listing = { ...scope, spaceId: space!.id };
      const disabled = await call<Target[]>("agent.targets.list", listing);
      expect(disabled).toHaveLength(6);
      expect(disabled.every((item) => !item.available && item.reason)).toBe(true);
      expect(await request("agent.targets.list", listing, "desktop")).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      expect(await request("agent.targets.list", listing, "plugin:automations")).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      expect(await request("agent.targets.list", { ...listing, vaultId: "foreign" })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      delete permissions[permission];
      expect(await request("agent.targets.list", listing)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      permissions[permission] = caps;
      await dispose?.();
      await engine(true);
      await call(
        "agent.settings.update",
        {
          expectedRevision: 0,
          defaultAgent: "claude",
          waitingTasks: false,
          agents: { claude: { command: process.execPath, args: [script, proofDir] }, codex: { enabled: false }, pi: { enabled: false } },
        },
        "desktop",
      );
      const targets = await call<Target[]>("agent.targets.list", listing);
      expect(targets.find((target) => target.mode === "resume")).toMatchObject({ available: false, reason: "native_resume_evidence_unavailable" });
      const configured = targets.find((target) => target.mode === "new" && target.provider === "claude");
      expect(configured).toMatchObject({ available: true, configurationId: expect.stringMatching(/^[a-f0-9]{64}$/) });
      expect(cli("server", "status").status).toBe(5);
      const target = { mode: "new", provider: "claude", configurationId: configured!.configurationId!, spaceId: space!.id, spaceRevision: space!.revision } as const;
      const launchOnly = work("launch-only", target);
      const launchOnlyKey = crypto.randomUUID();
      controls.allowReady = false;
      expect(await request("agent.runs.dispatch", launchOnly, "plugin:tasks", launchOnlyKey)).toMatchObject({ ok: true, data: { status: "not_sent", reason: "provider_not_ready", coreWrite: "not_sent" } });
      const [launchOnlySession] = await call<{ id: string; terminalId: string }[]>("agent.sessions.list", {}, "desktop");
      const sessionFile = path.join(vault.stateDir, "agent-cli", "sessions", launchOnlySession!.id + ".json");
      const sessionBytes = readFileSync(sessionFile);
      const launchOnlyPid = pidOf(launchOnlySession!.terminalId);
      try {
        writeFileSync(sessionFile, '{"id":');
        controls.allowReady = true;
        expect(await request("agent.runs.dispatch", launchOnly, "plugin:tasks", launchOnlyKey)).toMatchObject({ ok: true, data: { status: "not_sent", reason: "launch_unverified", coreWrite: "not_sent" } });
        expect(JSON.parse(cli("ls", "--all").stdout).terminals).toHaveLength(1);
        expect(pidOf(launchOnlySession!.terminalId)).toBe(launchOnlyPid);
        expect(readers(launchOnlySession!.terminalId)).toEqual([]);
      } finally {
        writeFileSync(sessionFile, sessionBytes);
      }
      const first = work("first", target);
      controls.allowProof = false;
      const written = await call<Result>("agent.runs.dispatch", first);
      expect(written).toMatchObject({ status: "unknown", reason: "provider_acceptance_unconfirmed", acceptedAt: expect.any(String), coreWrite: "core_written", providerAcceptance: null, ownerActive: true });
      const firstAddress = written.execution!.sessionBinding.coreAddress;
      expect(await call<Result>("agent.runs.dispatch", first)).toMatchObject({ acceptedAt: written.acceptedAt, execution: written.execution });
      expect(await request("agent.runs.dispatch", { ...first, eventIds: ["event-2", "event-1"] })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
      expect(await request("agent.runs.dispatch", { ...first, input: body("changed") })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
      expect(await request("agent.runs.dispatch", { ...first, vaultId: "foreign" })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      expect(await request("agent.runs.inspect", { ...key("first"), attempt: 2 })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
      controls.allowProof = true;
      expect(await call<Result>("agent.runs.inspect", key("first"))).toMatchObject({ status: "accepted", coreWrite: "core_written", providerAcceptance: { id: "first-received" } });
      expect(readers(firstAddress).map(({ dispatchId }) => dispatchId)).toEqual(["first"]);
      const firstRecord = readFileSync(recordFile("first"));
      try {
        rmSync(recordFile("first"));
        expect(await request("agent.runs.dispatch", first)).toMatchObject({ ok: false, error: { code: "RUN_UNKNOWN", details: { reason: "dispatch_receipt_unavailable" } } });
        const alreadyOwned = { mode: "existing", spaceId: space!.id, binding: written.execution!.sessionBinding } as const;
        expect(await call<Result>("agent.runs.dispatch", work("during-loss", alreadyOwned))).toMatchObject({ status: "busy", coreWrite: "not_sent" });
        expect(readers(firstAddress).map(({ dispatchId }) => dispatchId)).toEqual(["first"]);
      } finally {
        writeFileSync(recordFile("first"), firstRecord);
      }

      const lost = work("lost", target);
      controls.allowProof = false;
      const originalCall = HerdrClient.prototype.call;
      const fault = vi.spyOn(HerdrClient.prototype, "call").mockImplementation(async function <T>(this: HerdrClient, method: string, params?: unknown): Promise<T> {
        const result = (await originalCall.call(this, method, params)) as T;
        if (method === "terminal.send" && (params as { text?: string }).text === lost.input) {
          this.close();
          throw new Error("isolated writer discarded the reply");
        }
        return result;
      });
      let lostReceipt: Result;
      try {
        lostReceipt = await call<Result>("agent.runs.dispatch", lost);
        expect(lostReceipt).toMatchObject({ status: "unknown", coreWrite: "unknown", providerAcceptance: null, ownerActive: true });
      } finally {
        fault.mockRestore();
      }
      await dispose?.();
      dispose = undefined;
      const rootPath = vault.root;
      await vault.close();
      // Simulate an abrupt Engine exit after the committed sending state and before saving the result.
      writeFileSync(recordFile("lost"), JSON.stringify({ ...read<object>(recordFile("lost")), write: "sending" }));
      vault = await Vault.open(rootPath);
      await engine(true);
      controls.allowProof = true;
      const recovered = await call<Result>("agent.runs.dispatch", lost);
      expect(recovered).toMatchObject({ status: "accepted", coreWrite: "unknown", providerAcceptance: { id: "lost-received" }, execution: lostReceipt.execution });
      expect(readers(recovered.execution!.sessionBinding.coreAddress).map(({ dispatchId }) => dispatchId)).toEqual(["lost"]);

      const manualSession = await call<{ id: string }>("agent.sessions.launch", { spaceId: space!.id, spaceRevision: space!.revision, provider: "claude", requestId: "isolated-manual" }, "desktop");
      const existingOptions = await call<Target[]>("agent.targets.list", listing);
      const existing = existingOptions.find((item) => item.binding?.sessionId === manualSession.id);
      expect(existing).toMatchObject({ available: true, mode: "existing" });
      const selected = { mode: "existing", spaceId: space!.id, binding: existing!.binding! } as const;
      const direct = new FixtureViewer();
      openViewers.push(direct);
      expect(await bridge!(manualSession.id, direct as never, { cols: 80, rows: 24, observe: false })).toBe(true);
      expect(await call<Result>("agent.runs.dispatch", work("competing-a", selected))).toMatchObject({ status: "busy", coreWrite: "not_sent" });
      direct.close();
      const outcomes = await Promise.all(["competing-a", "competing-b"].map((id) => call<Result>("agent.runs.dispatch", work(id, selected))));
      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["accepted", "busy"]);
      const winner = outcomes.find((outcome) => outcome.status === "accepted")!;
      const observer = new FixtureViewer();
      openViewers.push(observer);
      await bridge!(manualSession.id, observer as never, { cols: 80, rows: 24, observe: false });
      expect(observer.messages).toContain(JSON.stringify({ type: "mode", mode: "observe" }));
      observer.emit("message", Buffer.from(body("unowned") + "\r"), true);
      await call("agent.review.comment.add", { sessionId: manualSession.id, path: "synthetic.md", side: "new", line: 1, text: "isolated review" }, "desktop");
      expect(await request("agent.review.send", { sessionId: manualSession.id }, "desktop")).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(await request("agent.sessions.kill", { id: manualSession.id }, "desktop")).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      expect(readers(selected.binding.coreAddress).map(({ dispatchId }) => dispatchId)).toEqual([winner.execution!.dispatchId]);

      const stale = { ...selected, binding: { ...selected.binding, processGeneration: "different-generation" } };
      expect(await request("agent.runs.dispatch", work("stale", stale))).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT", details: { reason: "binding_changed" } } });
      const changedAddress = { ...selected, binding: { ...selected.binding, coreAddress: firstAddress } };
      expect(await request("agent.runs.dispatch", work("address", changedAddress))).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT", details: { reason: "binding_changed" } } });
      expect(cli("label", selected.binding.coreAddress, "huhu.launch.generation=changed-in-isolated-core").status).toBe(0);
      expect(await call<Result>("agent.runs.inspect", key(winner.execution!.dispatchId))).toMatchObject({ status: "unknown", reason: "binding_changed", ownerActive: true });
      expect(await call<Result>("agent.runs.dispatch", work("after-generation-change", selected))).toMatchObject({ status: "not_sent", reason: "binding_unverified" });
      expect(readers(selected.binding.coreAddress)).toHaveLength(1);

      const exits = work("zeroExit", target, true);
      const exited = await call<Result>("agent.runs.dispatch", exits);
      const exitAddress = exited.execution!.sessionBinding.coreAddress;
      const wait = cli("wait", exitAddress, "--timeout", "10", "--json");
      expect(wait.status).toBe(0);
      expect(JSON.parse(wait.stdout)).toMatchObject({ ended: true, exit_code: 0 });
      expect(await call<Result>("agent.runs.inspect", key("zeroExit"))).toMatchObject({ status: "unknown", coreWrite: "core_written", providerAcceptance: null, ownerActive: false });
      expect(readers(exitAddress)).toHaveLength(1);

      const gated = work("disabled-during-ready", target);
      const readiness = createFixtureGate();
      const transportKey = crypto.randomUUID();
      controls.blockReady = readiness.wait;
      const pending = request("agent.runs.dispatch", gated, "plugin:tasks", transportKey);
      try {
        expect(await Promise.race([readiness.entered.then(() => "paused"), pending.then(() => "finished")])).toBe("paused");
        await manager.disable("agent-cli");
        expect(await request("agent.runs.dispatch", gated)).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
      } finally {
        readiness.resume();
      }
      const disabledReply = await pending;
      const inputCount = (dispatchId: string) =>
        readdirSync(proofDir)
          .filter((file) => file.endsWith(".jsonl"))
          .flatMap((file) => readers(file.slice(0, -6)))
          .filter((line) => line.dispatchId === dispatchId).length;
      console.info(JSON.stringify({ phase: "disabled-during-ready", disabledReply, inputCount: inputCount(gated.dispatchId), cancelled: controls.readySignal?.aborted, endpoint: core.endpoint }));
      expect(inputCount(gated.dispatchId)).toBe(0);
      expect(controls.readySignal?.aborted).toBe(true);
      expect(disabledReply).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED", retryable: true } });
      expect(read(recordFile(gated.dispatchId))).toMatchObject({ write: "not_sent", execution: null, ownerActive: false });
      expect(await manager.enable("agent-cli")).toBe("active");
      refreshBridge();
      expect(await request("agent.runs.dispatch", gated, "plugin:tasks", transportKey)).toMatchObject({ ok: true, data: { status: "accepted" } });
      expect(inputCount(gated.dispatchId)).toBe(1);

      const manual = await call<{ id: string; terminalId: string }>("agent.sessions.launch", { spaceId: space!.id, spaceRevision: space!.revision, provider: "claude", requestId: "lifecycle-manual" }, "desktop");
      const current = (await call<Target[]>("agent.targets.list", listing)).find((item) => item.binding?.sessionId === manual.id);
      expect(current?.binding).toBeTruthy();
      const oldBridge = bridge!;
      const existingTarget = { mode: "existing", spaceId: space!.id, binding: current!.binding! } as const;
      const checking = work("disabled-during-final-check", existingTarget);
      const finalCheck = createFixtureGate();
      let checkNextList = false;
      controls.afterReady = () => {
        checkNextList = true;
      };
      const delayedList = vi.spyOn(HerdrClient.prototype, "call").mockImplementation(async function <T>(this: HerdrClient, method: string, params?: unknown): Promise<T> {
        const reply = (await originalCall.call(this, method, params)) as T;
        if (method === "terminal.list" && checkNextList) {
          checkNextList = false;
          await finalCheck.wait();
        }
        return reply;
      });
      const checkingOperation = request("agent.runs.dispatch", checking);
      const oldViewer = new FixtureViewer();
      openViewers.push(oldViewer);
      try {
        expect(await Promise.race([finalCheck.entered.then(() => "paused"), checkingOperation.then(() => "finished")])).toBe("paused");
        expect(read(recordFile(checking.dispatchId))).toMatchObject({ write: "not_sent", ownerActive: false });
        expect(await oldBridge(manual.id, oldViewer as never, { cols: 80, rows: 24, observe: false })).toBe(true);
        expect(oldViewer.messages).not.toContain(JSON.stringify({ type: "mode", mode: "observe" }));
        await manager.disable("agent-cli");
        expect(oldViewer.readyState).toBe(3);
        expect(await manager.enable("agent-cli")).toBe("active");
        refreshBridge();
        expect(await oldBridge(manual.id, new FixtureViewer() as never, { cols: 80, rows: 24, observe: false })).toBe(false);
      } finally {
        finalCheck.resume();
        delayedList.mockRestore();
      }
      expect(await checkingOperation).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
      expect(inputCount(checking.dispatchId)).toBe(0);
      expect(read(recordFile(checking.dispatchId))).toMatchObject({ write: "not_sent", ownerActive: false });
      console.info(JSON.stringify({ phase: "disabled-during-final-check", inputCount: inputCount(checking.dispatchId), oldViewerClosed: oldViewer.readyState === 3 }));

      const crossed = work("disabled-after-send", existingTarget);
      const lateSend = createFixtureGate();
      const delayedSend = vi.spyOn(HerdrClient.prototype, "call").mockImplementation(async function <T>(this: HerdrClient, method: string, params?: unknown): Promise<T> {
        const reply = (await originalCall.call(this, method, params)) as T;
        if (method === "terminal.send" && (params as { text?: string }).text === crossed.input) {
          await lateSend.wait();
          throw new Error("discarded Core send reply after the scope switch");
        }
        return reply;
      });
      controls.allowProof = false;
      const crossing = request("agent.runs.dispatch", crossed);
      try {
        expect(await Promise.race([lateSend.entered.then(() => "paused"), crossing.then(() => "finished")])).toBe("paused");
        expect(read(recordFile(crossed.dispatchId))).toMatchObject({ write: "sending", ownerActive: true });
        await manager.disable("agent-cli");
        expect(await manager.enable("agent-cli")).toBe("active");
        refreshBridge();
        expect(await call<Result>("agent.runs.dispatch", crossed)).toMatchObject({ status: "unknown", coreWrite: "unknown", ownerActive: true });
        expect(await call<Result>("agent.runs.dispatch", work("during-switch-competing", existingTarget))).toMatchObject({ status: "busy", coreWrite: "not_sent" });
        const switchedViewer = new FixtureViewer();
        openViewers.push(switchedViewer);
        expect(await bridge!(manual.id, switchedViewer as never, { cols: 80, rows: 24, observe: false })).toBe(true);
        expect(switchedViewer.messages).toContain(JSON.stringify({ type: "mode", mode: "observe" }));
        await call("agent.review.comment.add", { sessionId: manual.id, path: "synthetic.md", side: "new", line: 1, text: "switch review" }, "desktop");
        expect(await request("agent.review.send", { sessionId: manual.id }, "desktop")).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
        controls.allowProof = true;
        expect(await call<Result>("agent.runs.inspect", key(crossed.dispatchId))).toMatchObject({ status: "accepted", coreWrite: "unknown", providerAcceptance: { id: crossed.dispatchId + "-received" } });
      } finally {
        lateSend.resume();
        delayedSend.mockRestore();
      }
      expect(await crossing).toMatchObject({ ok: false, error: { code: "RUN_UNKNOWN", details: { reason: "dispatch_scope_ended_after_send" } } });
      const finalReceipt = await call<Result>("agent.runs.dispatch", crossed);
      expect(finalReceipt).toMatchObject({ status: "accepted", coreWrite: "unknown", providerAcceptance: { id: crossed.dispatchId + "-received" }, execution: { sessionBinding: existingTarget.binding } });
      expect(readers(manual.terminalId).map(({ dispatchId }) => dispatchId)).toEqual([crossed.dispatchId]);
      console.info(
        JSON.stringify({
          phase: "disabled-after-send",
          coreWrite: finalReceipt.coreWrite,
          providerReceipt: finalReceipt.providerAcceptance,
          inputCount: inputCount(crossed.dispatchId),
          competingInputCount: inputCount("during-switch-competing"),
        }),
      );

      const records = path.join(vault.stateDir, "agent-cli", "dispatches");
      for (const file of readdirSync(records)) expect(readFileSync(path.join(records, file), "utf8")).not.toContain("isolated input");
      const coreInfo = JSON.parse(cli("server", "status").stdout) as { core: { id: string }; version: string };
      expect(coreInfo.version).toBe("0.1.19");
      expect(coreInfo.core.id).not.toBe("346bd5608735e3fcb27f9d01f5c8008e");
      console.info(JSON.stringify({ core: coreInfo, endpoint: core.endpoint, first: written.execution, recovered: recovered.execution, winner: winner.execution, exitAddress }));
    } finally {
      for (const viewer of openViewers) viewer.close();
      await dispose?.();
      delete permissions[permission];
      try {
        const status = started ? cli("server", "status") : undefined;
        if (status?.status === 0) {
          const { pid, holders } = JSON.parse(status.stdout) as { pid: number; holders: { pid: number }[] };
          const providerPids = readdirSync(proofDir)
            .filter((file) => file.endsWith(".ready.json"))
            .flatMap((file) => read<{ pid: number }>(path.join(proofDir, file))?.pid ?? []);
          const pids = [pid, ...holders.map((holder) => holder.pid), ...providerPids];
          expect(cli("server", "stop").status).toBe(0);
          const stopped = cli("server", "status").status;
          const livePids = () =>
            pids.filter((pid) => {
              try {
                return process.kill(pid, 0);
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
                throw error;
              }
            });
          await expect.poll(livePids, { timeout: 5_000 }).toEqual([]);
          console.info(JSON.stringify({ endpoint: core.endpoint, stopped, corePid: pid, holderPids: holders.map((holder) => holder.pid), providerPids, livePids: livePids() }));
          expect(stopped).toBe(5);
        }
      } finally {
        await vault.close();
        if (path.dirname(sandbox) === realpathSync(tmpdir()) && path.basename(sandbox).startsWith("huhu-w61-")) rmSync(sandbox, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
      }
    }
  },
  60_000,
);
