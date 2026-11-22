import { mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { CapabilityResultSchema } from "@huhu/contracts";
import { boot, type RunningEngine } from "@huhu/engine";
import { exportPackage, importPackage } from "@huhu/vault";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { assert, expect, test, vi } from "vitest";
import { HerdrClient } from "../../../packages/herdr-client/src/index.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { SessionsService, type SessionRecord } from "../../../plugins/agent-cli/src/engine/sessions.js";

const prefix = "automations.terminal.external";
const approvals = "automations.terminal.approval";
const coreBinary = process.env["HUHU_AGENT_LAUNCH_TEST_BIN"];
const exec = promisify(execFile);
const bundle = process.env["HUHU_CLI_TEST_BUNDLE"];
const cliEntry = bundle ? [bundle] : [createRequire(import.meta.url).resolve("tsx/cli"), path.resolve(import.meta.dirname, "../src/bin.ts")];
const mcpName = (name: string) => `${prefix}.${name}`.replaceAll(".", "_");
const linux = process.platform === "linux";

test.skipIf(!(linux || (process.platform === "win32" && process.arch === "x64")) || !coreBinary)(
  `${linux ? "Linux sh" : "Windows PowerShell"} CLI/MCP 的终端授权、保护值轮换与原意图对账`,
  async () => {
    const fixture = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-approved-terminal-")));
    const vault = path.join(fixture, "vault");
    const userData = path.join(fixture, "app");
    const archive = path.join(fixture, "vault.zip");
    const restored = path.join(fixture, "restored");
    const counter = path.join(fixture, "execution-count");
    const count = () => readFileSync(counter, "utf8").split("\n").filter(Boolean).length;
    const marker = `synthetic-approval-${randomUUID()}`;
    const rotatedMarker = `synthetic-rotation-${randomUUID()}`;
    const variable = "HUHU_RULE_SECRET_FIXTURE";
    const shell = linux ? "sh" : "powershell";
    const keys = path.join(fixture, "synthetic-protection");
    const moduleCredentialProtection = linux ? new TestProtection(keys) : undefined;
    const starts: unknown[] = [];
    let omitCoreAck = true;
    let loseStartedReply = false;
    let lostStartedReply = false;
    let e: RunningEngine | undefined;
    let copy: RunningEngine | undefined;
    let cleanup: (() => Promise<void>) | undefined;
    const original = HerdrClient.prototype.call;
    const launchApprovedShell = SessionsService.prototype.launchApprovedShell;
    const agentProbe = vi.spyOn(SessionsService.prototype, "launchApprovedShell").mockImplementation(async function (this: SessionsService, input, signal) {
      const session = await launchApprovedShell.call(this, input, signal);
      if (loseStartedReply) {
        loseStartedReply = false;
        expect(session.launchReceipt?.attempt).toMatchObject({ nativeStatus: "started", nativeConsumed: true, binding: { address: session.terminalId } });
        lostStartedReply = true;
        throw new Error("丢失 Agent 已保存内层启动回执后的回复");
      }
      return session;
    });
    const probe = vi.spyOn(HerdrClient.prototype, "call").mockImplementation(async function <T>(this: HerdrClient, method: string, input?: unknown) {
      if (method === "terminal.list" && starts.length === 1 && omitCoreAck) throw new Error("暂时无法核对原终端");
      const out = await original.call(this, method, input);
      if (method === "terminal.run") {
        starts.push(input);
        if (starts.length === 1 && omitCoreAck) throw new Error("丢失已创建终端的回包");
      }
      return out as T;
    });
    const desktop = async <T>(capability: string, input: unknown = {}, engine = e!) => {
      const reply = await engine.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
      if (!reply.ok) throw new Error(reply.error.message);
      return reply.data as T;
    };
    const cli = async (op: string, input: unknown, engine = e!) => {
      const requestFile = path.join(fixture, `request-${randomUUID()}.json`);
      writeFileSync(requestFile, JSON.stringify(input), { flag: "wx", mode: 0o600 });
      try {
        const args = [...cliEntry, "call", `${prefix}.${op}`, "--vault", engine.vault.root, "--json", "--input-file", requestFile];
        const env = { ...process.env };
        const hasValue = (text: string | undefined) => !!text && (text.includes(marker) || text.includes(rotatedMarker));
        expect(args.some(hasValue)).toBe(false);
        expect(Object.values(env).some(hasValue)).toBe(false);
        const { stdout, stderr, code } = await exec(process.execPath, args, { env, windowsHide: true, timeout: 20_000 })
          .then((output) => ({ ...output, code: 0 }))
          .catch((error: { code: unknown; stdout: string; stderr: string }) => {
            expect(error.code).toBe(1);
            return { stdout: error.stdout, stderr: error.stderr, code: 1 };
          });
        expect(hasValue(stdout) || hasValue(stderr)).toBe(false);
        expect(stderr.trim()).toBe("");
        const result = CapabilityResultSchema.parse(JSON.parse(stdout));
        expect(code).toBe(result.ok ? 0 : 1);
        return result;
      } finally {
        rmSync(requestFile);
      }
    };
    let session: string;
    const mcp = async (method: string, params: unknown) => {
      const response = await mcpRequest(`http://127.0.0.1:${e!.port}/mcp`, e!.mcpToken, mcpRpc(method, params), session);
      expect(response.status).toBe(200);
      return ((await response.json()) as { result: { isError?: boolean; content?: { text: string }[]; tools?: { name: string }[] } }).result;
    };
    const tool = async (op: string, args: unknown) => {
      const reply = await mcp("tools/call", { name: mcpName(op), arguments: args });
      return { ok: !reply.isError, data: JSON.parse(reply.content?.[0]?.text ?? "{}") };
    };
    const setAccess = (op: string, exposed: boolean, engine = e!) => desktop("gateway.update", { capability: `${prefix}.${op}`, exposed }, engine);
    const denied = (code: string) => ({ ok: false, error: { code } });

    try {
      vi.stubEnv("HUHU_HERDR_BIN", coreBinary);
      mkdirSync(vault);
      mkdirSync(userData);
      if (linux) mkdirSync(keys);
      if (linux) writeFileSync(counter, "", { mode: 0o600 });
      e = await boot({ vaultPath: vault, create: true, desktopUserData: userData, ...(moduleCredentialProtection && { moduleCredentialProtection }) });
      const command = linux
        ? `test -n "$HUHU_RULE_SECRET_FIXTURE" || exit 7; printf 'executed\\n' >> '${counter.replaceAll("'", `'"'"'`)}' || exit 8; printf '%s\\n' "$HUHU_RULE_SECRET_FIXTURE" approved-fixture-ok; pwd -P`
        : "if (-not $env:HUHU_RULE_SECRET_FIXTURE) { exit 7 }; [Console]::WriteLine($env:HUHU_RULE_SECRET_FIXTURE); Write-Output 'approved-fixture-ok'; [Console]::WriteLine((Get-Location).Path)";
      const create = (title: string) =>
        desktop<{ id: string; version: string }>("automations.create", {
          title,
          trigger: { preset: "every15", cron: "*/15 * * * *", zone: "UTC" },
          action: { kind: "terminal", command, shell, spaceId: null },
        });
      const rule = await create("仅用于授权测试");
      const other = await create("另一条未批准规则");
      const id = { ruleId: rule.id };
      await desktop("gateway.mcp.update", { enabled: true, transport: "http" });
      session = await openMcpSession(`http://127.0.0.1:${e!.port}/mcp`, e!.mcpToken);
      expect((await mcp("tools/list", {})).tools).toEqual([]);
      expect(await cli("status", id)).toMatchObject(denied("CAPABILITY_NOT_EXPOSED"));
      for (const op of ["run", "save", "status"]) await setAccess(op, true);
      expect((await mcp("tools/list", {})).tools?.map(({ name }) => name)).toEqual(expect.arrayContaining(["run", "save", "status"].map(mcpName)));
      expect(await cli("status", id)).toMatchObject(denied("PERMISSION_DENIED"));
      const review = await desktop<{ ruleVersion: string; target: string; command: string; space: { root: string }; approvalId: null }>(`${approvals}.review`, id);
      expect(review).toMatchObject({ shell, command, space: { root: vault }, approvalId: null, ...(linux && { executable: realpathSync.native("/bin/sh") }) });
      const approve = { ...id, expectedRuleVersion: review.ruleVersion, target: review.target, names: [variable], expectedApprovalId: null };
      expect(await e.dispatcher.call("cli", { capability: `${approvals}.approve`, input: approve, requestId: randomUUID() })).toMatchObject(denied("CAPABILITY_NOT_EXPOSED"));
      const { approvalId } = await desktop<{ approvalId: string }>(`${approvals}.approve`, approve);
      expect(await cli("status", id)).toMatchObject({ ok: true, data: { ruleVersion: rule.version, revision: null, states: { [variable]: "unconfigured" } } });
      expect(await cli("status", { ruleId: other.id })).toMatchObject(denied("PERMISSION_DENIED"));
      const approveRule = async (ruleId: string) => {
        const { target, ruleVersion, approvalId } = await desktop<{ target: string; ruleVersion: string; approvalId: string | null }>(`${approvals}.review`, { ruleId });
        return desktop(`${approvals}.approve`, { ruleId, target, expectedRuleVersion: ruleVersion, names: [variable], expectedApprovalId: approvalId });
      };
      await approveRule(other.id);
      await desktop("automations.update", { id: other.id, expectedVersion: other.version, patch: { action: { kind: "terminal", command: linux ? "printf 'changed fixture'" : "Write-Output 'changed fixture'", shell, spaceId: null } } });
      expect(await cli("status", { ruleId: other.id })).toMatchObject(denied("PERMISSION_DENIED"));
      await approveRule(other.id);
      await desktop("automations.terminal.environment.save", {
        ruleId: other.id,
        expectedRevision: null,
        names: ["HUHU_RULE_SECRET_OTHER"],
        changes: [],
      });
      expect(await cli("status", { ruleId: other.id })).toMatchObject(denied("PERMISSION_DENIED"));
      const workspace = path.join(fixture, "workspace");
      const moved = path.join(fixture, "moved");
      mkdirSync(workspace);
      mkdirSync(moved);
      const space = await desktop<{ id: string; revision: number }>("agent.spaces.save", { name: "批准目标", root: workspace });
      const isolated = await desktop<{ id: string }>("automations.create", {
        title: "Space 版本测试",
        trigger: { preset: "every15", cron: "*/15 * * * *", zone: "UTC" },
        action: { kind: "terminal", command, shell, spaceId: space.id },
      });
      await approveRule(isolated.id);
      expect(await cli("status", { ruleId: isolated.id })).toMatchObject({ ok: true });
      await desktop("agent.spaces.save", { id: space.id, name: "批准目标", root: moved, expectedRevision: space.revision });
      expect(await cli("status", { ruleId: isolated.id })).toMatchObject(denied("PERMISSION_DENIED"));
      const expected = { ...id, expectedRuleVersion: rule.version, expectedRevision: null as string | null };
      expect(await cli("save", { ...expected, changes: [{ name: "PATH", action: "replace", value: marker }] })).toMatchObject(denied("PERMISSION_DENIED"));
      const saved = await cli("save", { ...expected, changes: [{ name: variable, action: "replace", value: marker }] });
      assert(saved.ok);
      const revision = (saved.data as { revision: string }).revision;
      cleanup = async () => {
        if (!e) return;
        const current = await desktop<{ revision: string; states: Record<string, string> }>("automations.terminal.environment.get", id);
        if (current.states[variable] === "configured") await desktop("automations.terminal.environment.save", { ...id, expectedRevision: current.revision, names: [variable], changes: [{ name: variable, action: "clear" }] });
      };
      expect(JSON.stringify(saved)).not.toContain(marker);
      expect(await cli("save", { ...expected, changes: [{ name: variable, action: "clear" }] })).toMatchObject(denied("VERSION_CONFLICT"));
      const intent = { ...expected, expectedRevision: revision, intentId: randomUUID() };
      expect(await cli("run", { ...intent, command: "fixture override" })).toMatchObject(denied("INVALID_INPUT"));
      // 第一次 CLI 回包在调用方被丢弃。重投使用同一个意图，Core 仍处于无法核对状态。
      const [, repeat] = await Promise.all([cli("run", intent), cli("run", intent)]);
      assert(repeat.ok);
      const first = repeat.data as { runId: string; activationId: string; state: string };
      expect(first.state).toBe("unknown");
      expect(starts).toHaveLength(1);
      const originalSession = () => {
        const dir = path.join(e!.vault.stateDir, "agent-cli", "sessions");
        return readdirSync(dir)
          .filter((file) => file.endsWith(".json"))
          .map((file) => JSON.parse(readFileSync(path.join(dir, file), "utf8")) as SessionRecord)
          .find((row) => row.requestId === `autorun-${first.runId}`);
      };
      const waiting = linux ? originalSession() : undefined;
      if (linux) {
        expect(count()).toBe(0);
        expect(waiting?.launchReceipt?.attempt).toMatchObject({ nativeStatus: "waiting-host" });
        expect(waiting?.launchReceipt?.attempt?.nativeConsumed).toBeUndefined();
      }
      expect(await cli("run", { ...intent, expectedRevision: randomUUID() })).toMatchObject(denied("IDEMPOTENCY_MISMATCH"));
      expect(await tool("run", intent)).toMatchObject({ ok: false, data: { code: "IDEMPOTENCY_MISMATCH" } });
      omitCoreAck = false;
      await vi.waitFor(async () => expect(await cli("run", intent)).toMatchObject({ ok: true, data: { runId: first.runId, activationId: first.activationId, state: "succeeded" } }), { timeout: 12_000, interval: 400 });
      const details = await desktop<{ body: string }>("automations.runs.read", { runId: first.runId });
      expect(details.body).toContain("approved-fixture-ok");
      expect(details.body).toContain(review.space.root);
      expect(details.body).toContain("***");
      expect(details.body).not.toContain(marker);
      expect(JSON.stringify(starts)).not.toContain(marker);
      if (linux) expect(JSON.stringify(starts)).not.toContain(command);
      if (linux) {
        expect(count()).toBe(1);
        expect(starts).toHaveLength(1);
        expect(originalSession()).toMatchObject({ id: waiting!.id, state: "exited", launchReceipt: { attempt: { id: waiting!.launchReceipt!.attempt!.id, nativeStatus: "started", nativeConsumed: true } } });
        expect(await cli("run", intent)).toMatchObject({ ok: true, data: { runId: first.runId, activationId: first.activationId, state: "succeeded" } });
        await e.shutdown();
        e = await boot({ vaultPath: vault, desktopUserData: userData, ...(moduleCredentialProtection && { moduleCredentialProtection }) });
        session = await openMcpSession(`http://127.0.0.1:${e.port}/mcp`, e.mcpToken);
        expect(await cli("run", intent)).toMatchObject({ ok: true, data: { runId: first.runId, activationId: first.activationId, state: "succeeded" } });
        expect(count()).toBe(1);
      }

      const rotated = await tool("save", { ...expected, expectedRevision: revision, changes: [{ name: variable, action: "replace", value: rotatedMarker }] });
      expect(rotated).toMatchObject({ ok: true, data: { states: { [variable]: "configured" } } });
      const mcpIntent = { ...intent, expectedRevision: rotated.data.revision as string, intentId: randomUUID() };
      loseStartedReply = linux;
      const mcpRun = await tool("run", mcpIntent);
      expect(mcpRun.ok).toBe(true);
      if (linux) expect({ lostStartedReply, state: mcpRun.data.state }).toEqual({ lostStartedReply: true, state: "unknown" });
      await vi.waitFor(async () => expect(await tool("run", mcpIntent)).toMatchObject({ ok: true, data: { runId: mcpRun.data.runId, state: "succeeded" } }), { timeout: 8_000, interval: 300 });
      expect(starts).toHaveLength(2);
      if (linux) expect(count()).toBe(2);
      expect(JSON.stringify(starts)).not.toContain(rotatedMarker);
      await setAccess("run", false);
      expect(await cli("run", intent)).toMatchObject(denied("CAPABILITY_NOT_EXPOSED"));
      expect(await tool("run", mcpIntent)).toMatchObject({ ok: false, data: { code: "CAPABILITY_NOT_EXPOSED" } });
      await setAccess("run", true);
      expect(await cli("run", intent)).toMatchObject({ ok: true, data: { runId: first.runId, state: "succeeded" } });
      const audit = readFileSync(path.join(e.vault.runtimeDir, "gateway-audit.ndjson"), "utf8");
      expect(audit).not.toContain(marker);
      expect(audit).not.toContain(rotatedMarker);
      const manifest = await exportPackage(vault, archive);
      expect(manifest.files.some(({ path }) => path.includes("automations-terminal-approvals"))).toBe(false);
      importPackage(archive, restored);
      expect(
        manifest.files.some(({ path: file }) => {
          const bytes = readFileSync(path.join(restored, file));
          return bytes.includes(marker) || bytes.includes(rotatedMarker);
        }),
      ).toBe(false);
      copy = await boot({ vaultPath: restored, desktopUserData: userData, ...(moduleCredentialProtection && { moduleCredentialProtection }) });
      await setAccess("run", true, copy);
      expect(await cli("run", intent, copy)).toMatchObject(denied("PERMISSION_DENIED"));
      await copy.shutdown();
      copy = undefined;
      await e.shutdown();
      e = await boot({ vaultPath: vault, desktopUserData: userData, ...(moduleCredentialProtection && { moduleCredentialProtection }) });
      expect(await cli("run", intent)).toMatchObject({ ok: true, data: { runId: first.runId, state: "succeeded" } });
      await desktop("gateway.mcp.update", { enabled: true, transport: "stdio" });
      const stdio = new Client({ name: "approved-terminal-test", version: "1" });
      await stdio.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [...cliEntry, "mcp", "--vault", vault],
        }),
      );
      try {
        const same = CallToolResultSchema.parse(await stdio.callTool({ name: mcpName("run"), arguments: mcpIntent }));
        expect(same.isError).toBeFalsy();
        expect(same.content[0]).toMatchObject({ type: "text", text: expect.stringContaining(mcpRun.data.runId) });
      } finally {
        await stdio.close();
      }
      const cleared = await cli("save", { ...expected, expectedRevision: mcpIntent.expectedRevision, changes: [{ name: variable, action: "clear" }] });
      expect(cleared).toMatchObject({ ok: true, data: { states: { [variable]: "unconfigured" } } });
      assert(cleared.ok);
      const clearedRevision = (cleared.data as { revision: string }).revision;
      expect(await cli("run", { ...intent, expectedRevision: clearedRevision, intentId: randomUUID() })).toMatchObject(denied("INVALID_INPUT"));
      await desktop(`${approvals}.revoke`, { ...id, expectedApprovalId: approvalId });
      expect(await cli("run", intent)).toMatchObject(denied("PERMISSION_DENIED"));
      expect(await cli("status", id)).toMatchObject(denied("PERMISSION_DENIED"));
      expect(starts).toHaveLength(2);
    } finally {
      try {
        await cleanup?.();
      } finally {
        await Promise.allSettled([e?.shutdown(), copy?.shutdown()]);
        probe.mockRestore();
        agentProbe.mockRestore();
        vi.unstubAllEnvs();
        rmSync(fixture, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
      }
    }
  },
  90_000,
);

test.skipIf(process.platform === "win32")("POSIX 拒绝向外部批准 default 终端规则", async () => {
  const fixture = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-approved-posix-")));
  const vaultPath = path.join(fixture, "vault");
  const desktopUserData = path.join(fixture, "app");
  mkdirSync(vaultPath);
  mkdirSync(desktopUserData);
  let engine: RunningEngine | undefined;
  try {
    engine = await boot({ vaultPath, desktopUserData, create: true });
    const call = (capability: string, input: unknown) => engine!.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
    const created = await call("automations.create", {
      title: "POSIX 授权验证",
      trigger: { preset: "every15", cron: "*/15 * * * *", zone: "UTC" },
      action: { kind: "terminal", command: "false", shell: "default", spaceId: null },
    });
    assert(created.ok);
    const ruleId = (created.data as { id: string }).id;
    expect(await call(`${approvals}.review`, { ruleId })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(await call("agent.sessions.list", {})).toMatchObject({ ok: true, data: [] });
  } finally {
    await engine?.shutdown();
    rmSync(fixture, { recursive: true, force: true });
  }
});
