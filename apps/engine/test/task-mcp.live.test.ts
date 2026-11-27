import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CapabilityResult, McpCatalogView, McpSource, TaskDto, TaskMcpTool } from "@huhu/contracts";
import { TaskMcpCredentials } from "@huhu/kernel";
import { AgentDetector, HerdrCore } from "@huhu/plugin-agent-cli/engine";
import { machineId } from "@huhu/vault";
import { assert, expect, test, vi } from "vitest";
import { huhuMcpStep, huhuMcpTools, startCodexResponsesFixture } from "../../../plugins/agent-cli/test/fixtures/codex-responses.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { initializeMcp, mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { localUpstream } from "../../../packages/kernel/test/fixtures/mcp-upstream.js";
import { boot, type RunningEngine } from "../src/boot.js";

const coreBin = process.env["HUHU_AGENT_LAUNCH_TEST_BIN"];
const codexBin = process.env["HUHU_CODEX_NATIVE_TEST_BIN"];

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => { resolve = finish; });
  return { promise, resolve };
}

test.skipIf(process.platform !== "linux" || process.arch !== "x64" || !coreBin || !codexBin)(
  "a real Tasks dispatch gives pinned Codex only the original run's selected built-in and external tools",
  { timeout: 90_000 },
  async () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-task-mcp-")));
    const home = path.join(root, "provider");
    const vaultPath = path.join(root, "vault");
    const desktopUserData = path.join(root, "desktop");
    const config = path.join(root, "config");
    for (const dir of [home, vaultPath, desktopUserData, path.join(config, "huhu")]) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(config, "huhu", "dispatch-limits.json"), JSON.stringify({ active: 1, retained: 6 }));
    const allowed = await localUpstream("streamable-http");
    const unrelated = await localUpstream("streamable-http");
    const release = latch();
    const revoke = latch();
    const expire = latch();
    const revokeOnly = latch();
    const externalTool = "task_allowed__echo";
    let phase: "default" | "allowed" | "revise" | "revoke" | "expiry" = "default";
    let step = 0;
    const responses = await startCodexResponsesFixture({
      step: async ({ tools }) => {
        const names = tools.flatMap(({ name }) => name ? [name] : []);
        switch (phase) {
          case "default":
            return { result: names.some((name) => name.startsWith("mcp__")) ? "unexpected MCP" : "no MCP" };
          case "allowed":
            if (++step === 1) return huhuMcpStep("vault_info", {});
            if (step === 2) return huhuMcpStep(externalTool, { value: "selected" });
            await release.promise;
            return { result: "both tools finished" };
          case "revise":
            await revoke.promise;
            return { result: "revised" };
          case "revoke":
            await revokeOnly.promise;
            return { result: "revoked" };
          case "expiry":
            await expire.promise;
            return { result: "expired" };
        }
      },
    });
    let engine: RunningEngine | undefined;
    let core: HerdrCore | undefined;
    const credentials: string[] = [];
    const issue = TaskMcpCredentials.prototype.issue;
    const issuance = vi.spyOn(TaskMcpCredentials.prototype, "issue").mockImplementation(function (this: TaskMcpCredentials, scope) {
      const token = issue.call(this, scope);
      credentials.push(token);
      return token;
    });
    const detect = vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([]);
    try {
      writeFileSync(path.join(home, "config.toml"), responses.config, { mode: 0o600 });
      vi.stubEnv("HUHU_HERDR_BIN", coreBin);
      vi.stubEnv("HUHU_NODE_BIN", process.execPath);
      vi.stubEnv("HUHU_CODEX_DISPATCH_BIN", codexBin);
      vi.stubEnv("HUHU_CODEX_DISPATCH_HOME", home);
      vi.stubEnv("HUHU_CODEX_DISPATCH_HELPER", path.resolve(import.meta.dirname, "../../../plugins/agent-cli/src/engine/codex-dispatch-helper.cjs"));
      vi.stubEnv("XDG_CONFIG_HOME", config);
      engine = await boot({ vaultPath, desktopUserData, create: true, moduleCredentialProtection: new TestProtection(desktopUserData) });
      const endpoint = `http://127.0.0.1:${engine.port}`;
      const mcp = endpoint + "/mcp";
      core = new HerdrCore({ bin: coreBin!, vaultId: engine.vault.id, machineId: machineId(), runtimeDir: path.join(engine.vault.runtimeDir, "herdr") });
      async function call<T>(capability: string, input: unknown = {}): Promise<T> {
        const response = await fetch(endpoint + "/api/v1/call", {
          method: "POST", headers: { authorization: `Bearer ${engine!.rendererToken}`, "content-type": "application/json" },
          body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
        });
        const result = await response.json() as CapabilityResult<T>;
        assert(result.ok, `${capability}: ${JSON.stringify(result)}`);
        return result.data;
      }
      const publish = async (url: string, namespace: string) => {
        const { sourceId, revision } = await call<McpSource>("mcp.sources.create", {
          displayName: namespace, namespace, configuration: { transport: "streamable-http", url, headers: {}, authentication: { kind: "none" } },
        });
        const ref = { sourceId, expectedRevision: revision };
        expect(await call("mcp.sources.check", ref)).toMatchObject({ state: "ready", toolCount: 1 });
        const { catalogRevision, policyRevision } = await call<McpCatalogView>("mcp.catalog.list", { sourceId });
        await call("mcp.policy.update", { expectedCatalogRevision: catalogRevision, expectedPolicyRevision: policyRevision, choices: [{ sourceId, upstreamIdentity: "echo", selected: true }] });
        return call<McpSource>("mcp.sources.setEnabled", { ...ref, enabled: true });
      };
      const source = await publish(allowed.url, "task_allowed");
      const other = await publish(unrelated.url, "task_other");
      await call("gateway.update", { capability: "vault.info", exposed: true });
      await call("gateway.update", { capability: "notes.list", exposed: true });
      await call("gateway.mcp.update", { enabled: true });
      const [space] = await call<{ id: string }[]>("agent.spaces.list");
      const create = (title: string) => call<TaskDto>("tasks.create", { title, body: "Run the local fixture.", type: "agent", execution: { spaceId: space!.id, provider: "codex" } });
      const authorize = (task: TaskDto, tools: TaskMcpTool[]) => call<TaskDto>("tasks.mcp.authorize", { id: task.id, expectedVersion: task.version, tools });
      const dispatch = (task: TaskDto) => call("tasks.dispatch", { taskId: task.id, dispatchId: randomUUID(), expectedVersion: task.version, inputRevision: task.inputRevision, inputHash: task.inputHash });
      const result = (task: TaskDto, body: string) => expect.poll(async () =>
        (await call<TaskDto>("tasks.read", { id: task.id })).comments.filter(({ event }) => event === "result"),
      { timeout: 24_000 }).toMatchObject([{ body }]);
      const tools: TaskMcpTool[] = [
        { sourceId: "builtin", upstreamIdentity: "vault.info", sourceRevision: null },
        { sourceId: source.sourceId, upstreamIdentity: "echo", sourceRevision: source.revision },
      ];

      const defaultTask = await create("No task tool authorization");
      await dispatch(defaultTask);
      await result(defaultTask, "no MCP");
      expect(issuance).not.toHaveBeenCalled();
      expect(allowed.calls).toHaveLength(0);
      expect(unrelated.calls).toHaveLength(0);

      phase = "allowed";
      const authorized = await authorize(await create("Selected source"), tools);
      expect(await call("tasks.dispatch.targets", { spaceId: space!.id, taskId: authorized.id })).toEqual(expect.arrayContaining([
        expect.objectContaining({ mode: "new", provider: "codex", capabilities: expect.objectContaining({ mcp: { state: "available" } }) }),
      ]));
      await dispatch(authorized);
      await expect.poll(() => step, { timeout: 27_000 }).toBe(3);
      expect(huhuMcpTools(responses.requests[1]).sort()).toEqual([externalTool, "vault_info"]);
      expect(responses.requests[2]?.input.filter(({ type }) => type === "function_call_output")).toEqual(expect.arrayContaining([expect.objectContaining({ output: expect.anything() })]));
      expect(JSON.stringify(responses.requests[2]?.input.filter(({ type }) => type === "function_call_output"))).toContain(engine.vault.id);
      const audit = await call<{ entry: string; capability: string; code: string }[]>("gateway.audit.list");
      expect(audit.filter(({ entry, capability }) => entry === "http" && capability === "vault.info")).toMatchObject([{ code: "OK" }]);
      expect(allowed.calls).toEqual([{ name: "echo", input: { value: "selected" } }]);
      const [token] = credentials;
      assert(token);
      const session = await openMcpSession(mcp, token);
      const invoke = (name: string, value: string, bearer = token, handle = session) =>
        mcpRequest(mcp, bearer, mcpRpc("tools/call", { name, arguments: { value } }), handle);
      expect(await (await invoke("task_other__echo", "same upstream name")).json()).toMatchObject({ error: expect.any(Object) });
      expect(await (await invoke("notes_list", "cached built-in")).json()).toMatchObject({ result: { isError: true } });
      expect(unrelated.calls).toHaveLength(0);
      expect(await (await invoke(externalTool, "second")).json()).toMatchObject({ result: { structuredContent: { value: "second" } } });
      const forbidden = await fetch(endpoint + "/api/v1/call", { method: "POST", headers: { authorization: `Bearer ${token}` } });
      expect(forbidden.status).toBe(401);
      release.resolve();
      await result(authorized, "both tools finished");
      expect((await invoke(externalTool, "after finish")).status).toBe(401);

      phase = "revise";
      const second = await authorize(await create("Another task"), [{ sourceId: other.sourceId, upstreamIdentity: "echo", sourceRevision: other.revision }]);
      await dispatch(second);
      await expect.poll(() => credentials.length, { timeout: 15_000 }).toBe(2);
      const otherToken = credentials[1]!;
      await expect.poll(async () => (await mcpRequest(mcp, otherToken, initializeMcp)).status, { timeout: 10_000 }).toBe(200);
      await expect.poll(() => responses.requests.length, { timeout: 19_000 }).toBe(5);
      const otherSession = await openMcpSession(mcp, otherToken);
      expect((await invoke(externalTool, "other task", otherToken, session)).status).toBe(404);
      expect(await (await invoke(externalTool, "other task", otherToken, otherSession)).json()).toMatchObject({ error: expect.any(Object) });
      await expect.poll(async () => (await call<TaskDto>("tasks.read", { id: second.id })).status).toBe("in_progress");
      const reread = await call<TaskDto>("tasks.read", { id: second.id });
      const revised = await authorize(reread, second.mcpAuthorization!.tools);
      expect((await invoke("task_other__echo", "old revision", otherToken, otherSession)).status).toBe(401);
      await authorize(revised, []);
      expect((await mcpRequest(mcp, otherToken, initializeMcp)).status).toBe(401);
      revoke.resolve();
      await result(second, "revised");

      phase = "revoke";
      const revoking = await authorize(await create("Explicit task revocation"), tools);
      await dispatch(revoking);
      await expect.poll(() => responses.requests.length, { timeout: 22_000 }).toBe(6);
      const revokedToken = credentials[2]!;
      const revokedSession = await openMcpSession(mcp, revokedToken);
      await expect.poll(async () => (await call<TaskDto>("tasks.read", { id: revoking.id })).status).toBe("in_progress");
      const latest = await call<TaskDto>("tasks.read", { id: revoking.id });
      expect((await authorize(latest, [])).mcpAuthorization).toBeUndefined();
      expect((await invoke(externalTool, "after revocation", revokedToken, revokedSession)).status).toBe(401);
      expect((await mcpRequest(mcp, revokedToken, initializeMcp)).status).toBe(401);
      revokeOnly.resolve();
      await result(revoking, "revoked");
      phase = "expiry";
      const expiring = await authorize(await create("Expired task credential"), tools);
      await dispatch(expiring);
      await expect.poll(() => responses.requests.length, { timeout: 22_000 }).toBe(7);
      const expiredToken = credentials[3]!;
      const expiredSession = await openMcpSession(mcp, expiredToken);
      const now = Date.now();
      const clock = vi.spyOn(Date, "now").mockImplementation(() => now + 31 * 60_000);
      try {
        expect((await invoke(externalTool, "expired", expiredToken, expiredSession)).status).toBe(401);
      } finally {
        clock.mockRestore();
      }
      expect((await mcpRequest(mcp, expiredToken, initializeMcp)).status).toBe(401);
      expire.resolve();
      await result(expiring, "expired");
      expect(allowed.calls).toHaveLength(2);
      expect(unrelated.calls).toHaveLength(0);
    } finally {
      release.resolve();
      revoke.resolve();
      expire.resolve();
      revokeOnly.resolve();
      try {
        await engine?.shutdown();
        await core?.stop();
      } finally {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        await Promise.all([responses.close(), allowed.close(), unrelated.close()]);
        rmSync(root, { recursive: true, force: true });
      }
    }
  },
);
