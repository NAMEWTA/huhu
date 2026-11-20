import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityRegistry, Dispatcher, EventBus, GatewayAudit, IdempotencyStore, createHuhuContext, type VaultServices } from "@huhu/kernel";
import { Vault, machineId } from "@huhu/vault";
import { expect, test } from "vitest";
import { apply } from "../src/engine/index.js";
import { HerdrCore } from "../src/engine/herdr-core.js";

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
}

test.skipIf(process.platform !== "win32" || !bin)(
  "Windows Core 0.1.19: capability preview matches the launched shell and synthetic agents",
  async () => {
    const sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-w11-")));
    const vault = await Vault.open(mkdirSync(path.join(sandbox, "vault"), { recursive: true })!, { create: true });
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
    const cli = (...argv: string[]) => spawnSync(bin!, argv, { env, windowsHide: true, encoding: "utf8", timeout: 15_000 });
    let emptyEndpoint = false;
    let isolatedId: string | undefined;
    let dispose: (() => void) | undefined;
    try {
      expect(expectedCore.endpoint).toMatch(/^\\\\\.\\pipe\\huhu-[a-z0-9]{8}-[a-z0-9]{4}$/);
      const before = cli("server", "status");
      expect(before.status).toBe(5);
      expect(JSON.parse(before.stderr).error).toMatchObject({ kind: "unavailable", message: expect.stringContaining("(os error 2)") });
      emptyEndpoint = true;

      const registry = new CapabilityRegistry();
      const dispatcher = new Dispatcher({
        registry,
        audit: new GatewayAudit(),
        idempotency: new IdempotencyStore(),
        isPluginEnabled: () => true,
        exposureOverride: () => undefined,
        grantedPermissions: () => [],
        pluginOrigin: () => "builtin",
      });
      const { root, facade } = createHuhuContext({
        registry,
        events: new EventBus(() => vault.id),
        vault: { files: vault.files, stateDir: vault.stateDir, vaultId: vault.id } as VaultServices,
        call: async () => {
          throw new Error("The launch probe does not call other plugins");
        },
      });
      const running = root.plugin((ctx) => {
        apply(ctx, facade("agent-cli", ctx), { herdrBin: bin! });
      });
      dispose = () => running.dispose();
      await running.await?.();
      const request = (capability: string, input: unknown) => {
        const requestId = crypto.randomUUID();
        return dispatcher.call("desktop", { capability, input, requestId, idempotencyKey: requestId });
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
      const agentCmd = path.join(scripts, "synthetic agent.cmd");
      const failedBat = path.join(scripts, "failed version.bat");
      const agentScript = path.join(scripts, "agent.mjs");
      const agentEvidence = path.join(scripts, "agent-result.json");
      writeFileSync(agentCmd, `@echo off\r\n"${process.execPath}" "%~dp0agent.mjs" %*\r\n`);
      writeFileSync(failedBat, "@echo off\r\nexit /b 3\r\n");
      writeFileSync(
        agentScript,
        'import { writeFileSync } from "node:fs";\n' +
          'if (process.argv[2] === "--version") console.log("synthetic-cli 1.0.0");\n' +
          `else writeFileSync(${JSON.stringify(agentEvidence)}, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));\n`,
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
      expect(target.cwd).not.toBe(cwd);
      const shellEvidence = path.join(cwd, "shell-cwd.txt");
      const shellInput = { ...target, provider: "shell", shell: "powershell", command: `[IO.File]::WriteAllText('${shellEvidence.replaceAll("'", "''")}', (Get-Location).ProviderPath)` };
      const agentInput = { ...target, provider: "claude", model: "opus", prompt: "带 空格的提示" };
      writeFileSync(path.join(cwd, "plain-file.txt"), "");
      for (const invalidCwd of [path.join(cwd, "missing"), path.join(cwd, "plain-file.txt"), sandbox, "."]) {
        const invalid = { ...agentInput, cwd: invalidCwd };
        expect(await request("agent.launch.resolve", { session: invalid })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
        expect(await request("agent.sessions.launch", { ...invalid, requestId: crypto.randomUUID() })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      }
      const deepParent = path.join(cwd, "深".repeat(120));
      for (const length of [259, 300]) {
        const longCwd = path.join(deepParent, "层".repeat(length - deepParent.length - 1));
        const extended = path.toNamespacedPath(longCwd);
        mkdirSync(extended, { recursive: true });
        expect(realpathSync(extended).endsWith(longCwd.slice(2))).toBe(true);
        for (const [input, spelling] of [[shellInput, longCwd], [agentInput, extended]] as const) {
          const unsupported = { ...input, cwd: spelling };
          const preview = await request("agent.launch.resolve", { session: unsupported });
          expect(preview).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { stage: "cwd", reason: "windows_cwd_too_long", maxLength: 258 } } });
          const launch = await request("agent.sessions.launch", { ...unsupported, requestId: crypto.randomUUID() });
          expect(launch).toEqual(preview);
        }
      }
      expect(await request("agent.launch.resolve", { session: { ...agentInput, provider: "pi" } })).toMatchObject({ ok: false, error: { code: "AGENT_DISABLED" } });
      const shellPreview = await call<LaunchPreview>("agent.launch.resolve", { session: shellInput });
      const agentPreview = await call<LaunchPreview>("agent.launch.resolve", { session: agentInput });
      expect(shellPreview).toEqual({ cwd, machineId: space!.machineId, command: "powershell.exe", argv: ["-NoProfile", "-Command", shellInput.command] });
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
    } finally {
      await dispose?.();
      try {
        if (emptyEndpoint) {
          const status = cli("server", "status");
          if (status.status === 0) {
            const current = (JSON.parse(status.stdout) as { core: { id: string } }).core.id;
            expect(current).toBeTruthy();
            expect(current).not.toBe("346bd5608735e3fcb27f9d01f5c8008e");
            if (isolatedId) expect(current).toBe(isolatedId);
            expect(cli("server", "stop").status).toBe(0);
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
