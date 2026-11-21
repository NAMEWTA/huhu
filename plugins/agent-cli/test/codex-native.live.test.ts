import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TaskDto } from "@huhu/contracts";
import { AgentDetector, HerdrCore } from "@huhu/plugin-agent-cli/engine";
import { machineId } from "@huhu/vault";
import { assert, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { startCodexResponsesFixture } from "./fixtures/codex-responses.js";
import { fixtureCoreCli } from "./fixtures/core-cli.js";

const coreBin = process.env["HUHU_AGENT_LAUNCH_TEST_BIN"];
const codexBin = process.env["HUHU_CODEX_NATIVE_TEST_BIN"];

test.skipIf(process.platform !== "linux" || process.arch !== "x64" || !coreBin || !codexBin)(
  "Linux native Codex asks and answers in one Core session through the Tasks inbox",
  async () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "huhu-native-response-")));
    const vaultPath = path.join(root, "vault");
    const desktopUserData = path.join(root, "desktop");
    const codexHome = path.join(root, "provider");
    const home = path.join(root, "user");
    // 用户级 CODEX_HOME 与私有 provider 目录只差大小写：Linux 区分大小写，不能误判为同一目录
    const unusedCodexHome = path.join(root, "PROVIDER");
    for (const dir of [vaultPath, desktopUserData, codexHome, home, unusedCodexHome]) mkdirSync(dir, { mode: 0o700 });
    const responses = await startCodexResponsesFixture();
    let core: HerdrCore | undefined;
    let engine: RunningEngine | undefined;
    const detect = vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([]);
    let cli: ReturnType<typeof fixtureCoreCli> | undefined;
    const call = async <T>(capability: string, input: unknown, caller: "desktop" | "plugin:tasks" = "desktop") => {
      const result = await engine!.dispatcher.call(caller, { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
      assert(result.ok, `${capability}: ${JSON.stringify(result)}`);
      return result.data as T;
    };
    try {
      writeFileSync(
        path.join(codexHome, "config.toml"),
        `model = "gpt-5.4"
model_provider = "fixture"
check_for_update_on_startup = false
[features]
plugins = false
remote_plugin = false
skill_mcp_dependency_install = false
api_key_model_discovery = false
[analytics]
enabled = false
[feedback]
enabled = false
[model_providers.fixture]
name = "Isolated Responses fixture"
base_url = "${responses.baseUrl}"
wire_api = "responses"
requires_openai_auth = false
request_max_retries = 0
stream_max_retries = 0
`,
        { mode: 0o600 },
      );
      vi.stubEnv("HOME", home);
      vi.stubEnv("CODEX_HOME", unusedCodexHome);
      vi.stubEnv("HUHU_HERDR_BIN", coreBin);
      vi.stubEnv("HUHU_NODE_BIN", process.execPath);
      vi.stubEnv("HUHU_CODEX_DISPATCH_BIN", codexBin);
      vi.stubEnv("HUHU_CODEX_DISPATCH_HOME", codexHome);
      vi.stubEnv("HUHU_CODEX_DISPATCH_HELPER", path.resolve(import.meta.dirname, "../src/engine/codex-dispatch-helper.cjs"));
      engine = await boot({ vaultPath, desktopUserData, create: true, moduleCredentialProtection: new TestProtection(desktopUserData) });
      const mid = machineId();
      const runtimeDir = path.join(engine.vault.stateDir, "runtime", mid, "herdr");
      core = new HerdrCore({ bin: coreBin!, vaultId: engine.vault.id, machineId: mid, runtimeDir });
      const env = { ...process.env, HC_SESSION: "huhu", HC_SOCKET: core.endpoint, XDG_STATE_HOME: path.join(runtimeDir, "state"), XDG_CONFIG_HOME: path.join(runtimeDir, "config") };
      cli = fixtureCoreCli(coreBin!, env);
      const [space] = await call<{ id: string }[]>("agent.spaces.list", {});
      const task = await call<TaskDto>("tasks.create", { title: "Fixture question", body: "Choose a fixture shape.", type: "agent", execution: { spaceId: space!.id, provider: "codex" } });
      const key = { taskId: task.id, dispatchId: "native-linux-choice" };
      const run = await call<{ runId: string; attempt: number }>("tasks.dispatch", { ...key, expectedVersion: task.version, inputRevision: task.inputRevision, inputHash: task.inputHash });
      const questions = () => call<{ requestId: string; requestVersion: number; sessionId: string; runId: string }[]>("tasks.questions.list", { taskId: task.id });
      await expect.poll(questions, { timeout: 30_000 }).toMatchObject([{ runId: run.runId, mode: "native_deferred", status: "awaiting", options: ["Circle", "Square"] }]);
      const [question] = await questions();
      const { requestId, requestVersion, sessionId, runId } = question!;
      const reply = { taskId: task.id, runId, requestId, requestVersion, sessionId, replyId: "fixture-circle" };
      await call("tasks.reply", { ...reply, answer: "Circle" });
      const taskView = () => call<TaskDto>("tasks.read", { id: task.id });
      await expect.poll(async () => (await taskView()).comments.filter(({ event }) => event === "result"), { timeout: 30_000 }).toHaveLength(1);
      expect((await taskView()).comments).toEqual(expect.arrayContaining([expect.objectContaining({ body: expect.stringContaining(responses.result) })]));
      expect(responses.requests).toHaveLength(2);
      expect(responses.requests[0]?.tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: responses.toolName })]));
      expect(responses.requests[1]?.input).toEqual(expect.arrayContaining([expect.objectContaining({ type: "function_call_output", call_id: responses.callId, output: expect.stringContaining("Circle") })]));
      const [session] = await call<{ id: string; terminalId: string }[]>("agent.sessions.list", { spaceId: space!.id });
      expect(session).toMatchObject({ id: sessionId, state: "running" });
      expect(await call("agent.runs.inspect", { ...key, runId, attempt: run.attempt, vaultId: engine.vault.id, machineId: mid }, "plugin:tasks")).toMatchObject({
        status: "accepted",
        execution: { sessionBinding: { sessionId, coreAddress: session!.terminalId, nativeSessionId: expect.any(String) } },
        providerAcceptance: { nativeTurnId: expect.any(String) },
      });
    } catch (error) {
      const terminals = cli?.("ls", "--all");
      console.info({ fixtureRequests: responses.requests.map(({ path, tools }) => ({ path, toolNames: tools?.map(({ name }) => name) })), terminals: terminals?.stdout });
      throw error;
    } finally {
      try {
        await engine?.shutdown();
        await core?.stop();
      } finally {
        detect.mockRestore();
        vi.unstubAllEnvs();
        await responses.close();
        rmSync(root, { recursive: true, force: true });
      }
    }
  },
  75_000,
);
