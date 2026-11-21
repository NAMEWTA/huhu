import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PluginManifestSchema } from "@huhu/contracts";
import { HerdrClient } from "@huhu/herdr-client";
import { CapabilityRegistry, Dispatcher, EventBus, GatewayAudit, IdempotencyStore, PluginManager, createHuhuContext, type VaultServices } from "@huhu/kernel";
import { Vault, machineId } from "@huhu/vault";
import { expect, test, vi } from "vitest";
import { agentToolDescriptors, apply } from "../src/engine/index.js";
import { HerdrCore } from "../src/engine/herdr-core.js";

import { fixtureCoreCli } from "./fixtures/core-cli.js";

const windows = process.platform === "win32";

const bin = process.env["HUHU_AGENT_LAUNCH_TEST_BIN"];

interface LaunchPreview {
  machineId: string;
  cwd: string;
  command: string | null;
  argv: string[];
}

interface Terminal {
  address: string;
  argv: string[];
  cwd: string;
  labels: Record<string, string>;
  state: string;
  exit_code: number | null;
  created_ms: number;
  pid: number;
}

test.skipIf(!bin)(
  "Core 0.1.19: capability preview matches the launched shell and synthetic agents",
  async () => {
    const sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-w11-")));
    let vault = await Vault.open(mkdirSync(path.join(sandbox, "vault"), { recursive: true })!, { create: true });
    const runtimeDir = path.join(vault.runtimeDir, "herdr");
    const expectedCore = new HerdrCore({ bin: bin!, vaultId: vault.id, machineId: machineId(), runtimeDir });
    const env = {
      ...process.env,
      HC_SESSION: "huhu",
      HC_SOCKET: expectedCore.endpoint,
      XDG_STATE_HOME: path.join(runtimeDir, "state"),
      XDG_CONFIG_HOME: path.join(runtimeDir, "config"),
    };
    delete (env as NodeJS.ProcessEnv)["HC_TERMINAL_ID"];
    const cli = fixtureCoreCli(bin!, env);
    let emptyEndpoint = false;
    let isolatedId: string | undefined;
    let dispose: (() => void) | undefined;
    async function closeEngine() {
      await dispose?.();
      dispose = undefined;
    }
    try {
      if (windows) expect(expectedCore.endpoint).toMatch(/^\\\\\.\\pipe\\huhu-[a-z0-9]{8}-[a-z0-9]{4}$/);
      const before = cli("server", "status");
      expect(before.status).toBe(5);
      if (windows) expect(JSON.parse(before.stderr).error).toMatchObject({ kind: "unavailable", message: expect.stringContaining("(os error 2)") });
      emptyEndpoint = true;

      let dispatcher: Dispatcher;
      let manager!: PluginManager;
      async function openEngine() {
        const registry = new CapabilityRegistry();
        registry.declareDescriptors("agent-cli", agentToolDescriptors);
        const events = new EventBus(() => vault.id);
        dispatcher = new Dispatcher({
          registry,
          audit: new GatewayAudit(),
          idempotency: new IdempotencyStore(),
          isPluginEnabled: (id) => manager.isEnabled(id),
          toolAccess: () => ({ state: "ready", revision: 0, choices: {} }),
          grantedPermissions: () => [],
          pluginOrigin: () => "builtin",
        });
        const { root, facade } = createHuhuContext({
          registry,
          events,
          vault: { files: vault.files, stateDir: vault.stateDir, vaultId: vault.id } as VaultServices,
          call: async () => {
            throw new Error("The launch probe does not call other plugins");
          },
        });
        manager = new PluginManager(root, facade, events);
        manager.register({
          manifest: PluginManifestSchema.parse({ id: "agent-cli", title: "Agent CLI", description: "", version: "1.0.0", origin: "builtin" }),
          apply: (ctx, api) => {
            apply(ctx, api, { herdrBin: bin!, history: { home: sandbox, env: {} } });
          },
        });
        dispose = () => manager.disposeAll();
        expect(await manager.enable("agent-cli")).toBe("active");
      }
      await openEngine();
      const request = (capability: string, input: unknown, idempotencyKey = crypto.randomUUID()) => {
        const requestId = crypto.randomUUID();
        return dispatcher.call("desktop", { capability, input, requestId, idempotencyKey });
      };
      async function call<T>(capability: string, input: unknown): Promise<T> {
        const reply = await request(capability, input);
        if (!reply.ok) throw new Error(`${capability}: ${JSON.stringify(reply.error)}`);
        return reply.data as T;
      }

      const [space] = await call<{ id: string; revision: number; machineId: string }[]>("agent.spaces.list", {});
      const cwd = path.join(vault.root, "中文工作 目录").replace(/^\\\\\?\\(?=[a-z]:\\)/i, "");
      const scripts = path.join(sandbox, "中文模拟 CLI");
      mkdirSync(cwd);
      mkdirSync(scripts);
      const agentCmd = path.join(scripts, windows ? "synthetic agent.cmd" : "synthetic agent");
      const failedBat = path.join(scripts, windows ? "failed version.bat" : "failed version");
      const agentScript = path.join(scripts, "agent.mjs");
      const agentEvidence = path.join(scripts, "agent-result.json");
      const quote = (part: string) => "'" + part.replaceAll("'", "'\\''") + "'";
      writeFileSync(agentCmd, windows ? `@echo off\r\n"${process.execPath}" "%~dp0agent.mjs" %*\r\n` : `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(agentScript)} "$@"\n`, { mode: 0o700 });
      writeFileSync(failedBat, windows ? "@echo off\r\nexit /b 3\r\n" : "#!/bin/sh\nexit 3\n", { mode: 0o700 });
      writeFileSync(
        agentScript,
        'import { writeFileSync } from "node:fs";\n' +
          'if (process.argv[2] === "--version") console.log("synthetic-cli 1.0.0");\n' +
          `else writeFileSync(${JSON.stringify(agentEvidence)}, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));\n` +
          'if (process.argv.includes("isolated reopen fixture")) setTimeout(() => {}, 30_000);\n',
      );
      const { settings } = await call<{ settings: { revision: number } }>("agent.settings.get", {});
      await call("agent.settings.update", {
        expectedRevision: settings.revision,
        defaultAgent: "claude",
        waitingTasks: false,
        agents: { claude: { command: agentCmd, args: ["--fixture", "two words"] }, codex: { command: failedBat, args: [] }, pi: { enabled: false } },
      });
      const detected = await call<{ id: string; version?: string }[]>("agent.catalog.detect", { refresh: true });
      expect(detected).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "claude", installed: true, via: "override", path: agentCmd, version: "synthetic-cli 1.0.0" }),
          expect.objectContaining({ id: "codex", installed: true, via: "override", path: failedBat }),
          expect.objectContaining({ id: "pi", installed: false, skipped: true }),
        ]),
      );
      expect(detected.find(({ id }) => id === "codex")?.version).toBeUndefined();
      const target = { spaceId: space!.id, spaceRevision: space!.revision, cwd: path.toNamespacedPath(cwd) };
      if (windows) expect(target.cwd).not.toBe(cwd);
      const shellEvidence = path.join(cwd, "shell-cwd.txt");
      const shellInput = {
        ...target,
        provider: "shell",
        shell: windows ? "powershell" : "sh",
        command: windows ? `[IO.File]::WriteAllText('${shellEvidence.replaceAll("'", "''")}', (Get-Location).ProviderPath)` : `printf '%s' "$PWD" > ${quote(shellEvidence)}`,
      };
      const agentInput = { ...target, provider: "claude", model: "opus", prompt: "带 空格的提示" };
      writeFileSync(path.join(cwd, "plain-file.txt"), "");
      for (const invalidCwd of [path.join(cwd, "missing"), path.join(cwd, "plain-file.txt"), sandbox, "."]) {
        const invalid = { ...agentInput, cwd: invalidCwd };
        expect(await request("agent.launch.resolve", { session: invalid })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
        expect(await request("agent.sessions.launch", { ...invalid, requestId: crypto.randomUUID() })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      }
      if (windows) {
        const deepParent = path.join(cwd, "深".repeat(120));
        for (const length of [259, 300]) {
          const longCwd = path.join(deepParent, "层".repeat(length - deepParent.length - 1));
          const extended = path.toNamespacedPath(longCwd);
          mkdirSync(extended, { recursive: true });
          expect(realpathSync(extended).endsWith(longCwd.slice(2))).toBe(true);
          for (const [input, spelling] of [
            [shellInput, longCwd],
            [agentInput, extended],
          ] as const) {
            const unsupported = { ...input, cwd: spelling };
            const preview = await request("agent.launch.resolve", { session: unsupported });
            expect(preview).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { stage: "cwd", reason: "windows_cwd_too_long", maxLength: 258 } } });
            const launch = await request("agent.sessions.launch", { ...unsupported, requestId: crypto.randomUUID() });
            expect(launch).toEqual(preview);
          }
        }
      }
      expect(await request("agent.launch.resolve", { session: { ...agentInput, provider: "pi" } })).toMatchObject({ ok: false, error: { code: "AGENT_DISABLED" } });
      const shellPreview = await call<LaunchPreview>("agent.launch.resolve", { session: shellInput });
      const agentPreview = await call<LaunchPreview>("agent.launch.resolve", { session: agentInput });
      expect(shellPreview).toEqual({ cwd, machineId: space!.machineId, command: windows ? "powershell.exe" : "sh", argv: windows ? ["-NoProfile", "-Command", shellInput.command] : ["-c", shellInput.command] });
      expect(agentPreview).toEqual({ cwd, machineId: space!.machineId, command: agentCmd, argv: ["--model", "opus", "--fixture", "two words", "带 空格的提示"] });
      expect(await call("agent.launch.resolve", { agentId: "claude", mode: "interactive", preview: true, model: "opus", prompt: agentInput.prompt })).toMatchObject({ command: agentPreview.command, argv: agentPreview.argv });
      expect(await call("agent.sessions.list", {})).toEqual([]);
      expect(cli("server", "status").status).toBe(5); // Preview and invalid cwd never started Core.

      const observed: Terminal[] = [];
      for (const [input, preview] of [
        [shellInput, shellPreview],
        [agentInput, agentPreview],
      ] as const) {
        const requestId = crypto.randomUUID();
        const session = await call<{ id: string; terminalId: string }>("agent.sessions.launch", { ...input, requestId });
        const status = cli("server", "status");
        expect(status.status).toBe(0);
        const ready = JSON.parse(status.stdout) as { version: string; core: { id: string } };
        expect(ready.version).toBe("0.1.19");
        expect(ready.core.id).not.toBe("346bd5608735e3fcb27f9d01f5c8008e");
        isolatedId ??= ready.core.id;
        expect(ready.core.id).toBe(isolatedId);
        const finished = cli("wait", session.terminalId, "--timeout", "10", "--json");
        expect(finished.status).toBe(0);
        const result = JSON.parse(finished.stdout) as { ended: boolean; exit_code: number | null };
        const output = result.exit_code === 0 ? "" : cli("read", "--lines", "25", session.terminalId).stdout;
        expect(result, `${input.provider}: ${output}`).toMatchObject({ ended: true, exit_code: 0 });
        const terminal = JSON.parse(cli("get", session.terminalId).stdout) as Terminal;
        expect(terminal).toMatchObject({
          argv: [preview.command, ...preview.argv],
          address: session.terminalId,
          cwd,
          state: "finished",
          exit_code: 0,
          labels: { "huhu.vault": vault.id, "huhu.space": space!.id, "huhu.session": session.id, "huhu.launch": requestId },
        });
        observed.push(terminal);
        const sessionFile = path.join(vault.stateDir, "agent-cli", "sessions", `${session.id}.json`);
        expect(JSON.parse(readFileSync(sessionFile, "utf8"))).toMatchObject({ id: session.id, requestId, terminalId: session.terminalId, cwd });
        expect(await call("agent.sessions.launch", { ...input, requestId })).toMatchObject({ id: session.id, terminalId: session.terminalId });
      }
      expect(readFileSync(shellEvidence, "utf8")).toBe(cwd);
      expect(JSON.parse(readFileSync(agentEvidence, "utf8"))).toEqual({ argv: agentPreview.argv, cwd });
      const { terminals } = JSON.parse(cli("ls", "--all").stdout) as { terminals: Terminal[] };
      expect(terminals).toHaveLength(2);
      console.info(JSON.stringify({ isolatedId, endpoint: expectedCore.endpoint, shellPreview, agentPreview, labels: observed.map(({ labels }) => labels), exitCodes: observed.map(({ exit_code }) => exit_code) }));

      const launchId = crypto.randomUUID();
      const transportKey = crypto.randomUUID();
      const launch = { ...agentInput, prompt: "isolated reopen fixture", requestId: launchId };
      const realCall = HerdrClient.prototype.call;
      let dropped: Terminal | undefined;
      const fault = vi.spyOn(HerdrClient.prototype, "call").mockImplementation(function <T>(this: HerdrClient, method: string, params?: unknown): Promise<T> {
        if (method === "terminal.list") return Promise.reject(new Error("isolated snapshot unavailable"));
        const labels = (params as { labels?: Record<string, string> } | undefined)?.labels;
        if (method === "terminal.run" && labels?.["huhu.launch"] === launchId) {
          const receiver = this as unknown as { onMessage(line: string): void };
          const original = receiver.onMessage.bind(receiver);
          const reply = vi.spyOn(receiver, "onMessage").mockImplementation((line) => {
            const { result } = JSON.parse(line) as { result?: Terminal };
            if (result?.labels?.["huhu.launch"] !== launchId) return original(line);
            dropped = result;
            reply.mockRestore();
            this.close();
          });
        }
        return realCall.call(this, method, params) as Promise<T>;
      });
      try {
        expect(await request("agent.sessions.launch", launch, transportKey)).toMatchObject({
          ok: false,
          error: { code: "RUN_UNKNOWN", retryable: true, details: { reason: "snapshot_unavailable", requestId: launchId } },
        });
      } finally {
        fault.mockRestore();
      }
      expect(dropped).toMatchObject({ state: "live", labels: { "huhu.launch": launchId } });
      const original = dropped!;
      const sessionId = original.labels["huhu.session"]!;
      const attemptId = original.labels["huhu.launch.generation"]!;
      expect(attemptId).toBeTruthy();
      const persisted = () => JSON.parse(readFileSync(path.join(vault.stateDir, "agent-cli", "sessions", `${sessionId}.json`), "utf8"));
      expect(persisted()).toMatchObject({ state: "unknown", requestId: launchId, terminalId: null, launchReceipt: { vaultId: vault.id, attempt: { id: attemptId, core: { id: isolatedId, generation: 1 } } } });
      expect(JSON.parse(cli("get", original.address).stdout)).toMatchObject({ pid: original.pid, created_ms: original.created_ms, state: "live" });
      await closeEngine();
      const vaultRoot = vault.root;
      await vault.close();
      vault = await Vault.open(vaultRoot);
      await openEngine();
      const replay = await request("agent.sessions.launch", launch, transportKey);
      expect(replay).toMatchObject({ ok: true, data: { id: sessionId, requestId: launchId, terminalId: original.address, state: "running" } });
      expect(replay.ok && replay.data).not.toHaveProperty("launchReceipt");
      expect((await call<{ id: string }[]>("agent.sessions.list", {})).find(({ id }) => id === sessionId)).not.toHaveProperty("launchReceipt");
      expect(persisted()).toMatchObject({ launchReceipt: { attempt: { id: attemptId, binding: { address: original.address, pid: original.pid, createdMs: original.created_ms } } } });
      const coreClient = new HerdrClient({ endpoint: expectedCore.endpoint });
      await coreClient.connect();
      try {
        const after = await coreClient.call<{ terminals: Terminal[] }>("terminal.list", { all: true });
        expect(after.terminals).toHaveLength(3);
        expect(after.terminals.filter((terminal) => terminal.labels["huhu.launch"] === launchId)).toMatchObject([{ address: original.address, pid: original.pid, created_ms: original.created_ms }]);

        const sessionPath = path.join(vault.stateDir, "agent-cli", "sessions", `${sessionId}.json`);
        const sessionContents = readFileSync(sessionPath);
        for (const scenario of ["truncated", "missing"]) {
          await closeEngine();
          await vault.close();
          if (scenario === "truncated") writeFileSync(sessionPath, '{"id":');
          else rmSync(sessionPath);
          vault = await Vault.open(vaultRoot);
          await openEngine();
          const repeated = await request("agent.sessions.launch", launch, transportKey);
          const { terminals } = await coreClient.call<{ terminals: Terminal[] }>("terminal.list", { all: true });
          const matches = terminals.filter((terminal) => terminal.labels["huhu.launch"] === launchId);
          console.info(JSON.stringify({ scenario, result: repeated.ok ? "ok" : repeated.error.code, addresses: matches.map(({ address, pid }) => ({ address, pid })) }));
          expect(repeated).toMatchObject({ ok: false, error: { code: "RUN_UNKNOWN", details: { reason: "launch_receipt_unavailable", requestId: launchId } } });
          expect(matches).toMatchObject([{ address: original.address, pid: original.pid, created_ms: original.created_ms, state: "live" }]);
          writeFileSync(sessionPath, sessionContents);
        }
      } finally {
        coreClient.close();
      }
      await call("agent.sessions.kill", { id: sessionId });
      const junction = path.join(cwd, "start junction");
      const actual = path.join(cwd, "original target");
      const moved = path.join(cwd, "different target");
      mkdirSync(actual);
      mkdirSync(moved);
      symlinkSync(actual, junction, windows ? "junction" : "dir");
      const throughJunction = { ...launch, requestId: crypto.randomUUID(), cwd: junction };
      const junctionLaunch = await call<{ id: string; terminalId: string; cwd: string }>("agent.sessions.launch", throughJunction);
      expect(junctionLaunch.cwd).toBe(actual);
      rmSync(junction);
      expect(await call("agent.sessions.launch", throughJunction)).toMatchObject({ id: junctionLaunch.id, terminalId: junctionLaunch.terminalId, cwd: actual });
      symlinkSync(moved, junction, windows ? "junction" : "dir");
      expect(await request("agent.sessions.launch", throughJunction)).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
      await call("agent.sessions.kill", { id: junctionLaunch.id });
      console.info(JSON.stringify({ scenario: "junction", kept: junctionLaunch.terminalId, retargeted: "IDEMPOTENCY_MISMATCH" }));
      console.info(JSON.stringify({ isolatedId, launchId, sessionId, attemptId, address: original.address, pid: original.pid, createdMs: original.created_ms }));

      for (const phase of ["before_run", "late_run_reply"] as const) {
        const input = { ...launch, requestId: crypto.randomUUID() };
        let enter!: () => void;
        let resume!: () => void;
        const entered = new Promise<void>((resolve) => {
          enter = resolve;
        });
        const blocked = new Promise<void>((resolve) => {
          resume = resolve;
        });
        let first = true;
        const ensure = HerdrCore.prototype.ensure;
        const delayed =
          phase === "before_run"
            ? vi.spyOn(HerdrCore.prototype, "ensure").mockImplementation(async function (this: HerdrCore) {
                if (first && this.endpoint === expectedCore.endpoint) {
                  first = false;
                  enter();
                  await blocked;
                }
                return ensure.call(this);
              })
            : vi.spyOn(HerdrClient.prototype, "call").mockImplementation(async function <T>(this: HerdrClient, method: string, params?: unknown): Promise<T> {
                const result = (await realCall.call(this, method, params)) as T;
                if (method === "terminal.run" && (params as { labels?: Record<string, string> }).labels?.["huhu.launch"] === input.requestId) {
                  enter();
                  await blocked;
                }
                return result;
              });
        const pending = request("agent.sessions.launch", input);
        let replacement;
        try {
          expect(await Promise.race([entered.then(() => "paused"), pending.then(() => "finished")])).toBe("paused");
          await manager.disable("agent-cli");
          expect(await request("agent.sessions.launch", input)).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
          expect(await manager.enable("agent-cli")).toBe("active");
          replacement = await request("agent.sessions.launch", input);
        } finally {
          resume();
          delayed.mockRestore();
        }
        const old = await pending;
        const truth = new HerdrClient({ endpoint: expectedCore.endpoint });
        await truth.connect();
        const matches = await truth
          .call<{ terminals: Terminal[] }>("terminal.list", { all: true })
          .then(({ terminals }) => terminals.filter((terminal) => terminal.labels?.["huhu.launch"] === input.requestId))
          .finally(() => truth.close());
        expect(matches).toHaveLength(1);
        const match = matches[0]!;
        const file = path.join(vault.stateDir, "agent-cli", "sessions", match.labels["huhu.session"] + ".json");
        const recorded = JSON.parse(readFileSync(file, "utf8"));
        const retry = await request("agent.sessions.launch", input);
        console.info(
          JSON.stringify({
            phase,
            old: old.ok ? "ok" : old.error.code,
            replacement,
            retry,
            recorded: { terminalId: recorded.terminalId, attempt: recorded.launchReceipt?.attempt?.id },
            core: matches.map(({ address, pid, labels }) => ({ address, pid, attempt: labels["huhu.launch.generation"] })),
          }),
        );
        expect(replacement).toMatchObject({ ok: true, data: { terminalId: match.address } });
        expect(retry).toMatchObject({ ok: true, data: { terminalId: match.address } });
        expect(recorded).toMatchObject({ terminalId: match.address, launchReceipt: { attempt: { id: match.labels["huhu.launch.generation"], binding: { pid: match.pid } } } });
        expect(old).toMatchObject({ ok: false, error: { code: phase === "before_run" ? "PLUGIN_DISABLED" : "RUN_UNKNOWN" } });
        await call("agent.sessions.kill", { id: recorded.id });
        expect(JSON.parse(cli("wait", match.address, "--timeout", "10", "--json").stdout)).toMatchObject({ ended: true });
      }
    } finally {
      await closeEngine();
      try {
        if (emptyEndpoint) {
          const status = cli("server", "status");
          if (status.status === 0) {
            const current = (JSON.parse(status.stdout) as { core: { id: string } }).core.id;
            expect(current).toBeTruthy();
            expect(current).not.toBe("346bd5608735e3fcb27f9d01f5c8008e");
            if (isolatedId) expect(current).toBe(isolatedId);
            expect(cli("server", "stop").status).toBe(0);
            const stopped = cli("server", "status").status;
            console.info(JSON.stringify({ endpoint: expectedCore.endpoint, stopped }));
            expect(stopped).toBe(5);
          }
        }
      } finally {
        await vault.close();
        if (path.dirname(sandbox) === realpathSync(tmpdir()) && path.basename(sandbox).startsWith("huhu-w11-")) {
          rmSync(sandbox, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
        }
      }
    }
  },
  60_000,
);
