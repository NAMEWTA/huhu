import { mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CapabilityCatalogEntry, TaskDto } from "@huhu/contracts";
import { NotificationStore, OperationReceipts, type HuhuApi } from "@huhu/kernel";
import { exportPackage, filesystemIdentity, importPackage, machineId, VaultFiles } from "@huhu/vault";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { run as runCli } from "../../../apps/cli/src/main.js";
import { AgentDetector } from "../../agent-cli/src/engine/detect.js";
import type { TaskDispatchExecutor } from "../../tasks/src/engine/dispatch.js";
import type { DispatchReceipt, DispatchRecord } from "../../tasks/src/engine/dispatch-store.js";
import { externalEntries, externalToolEntry, type ExternalEntry } from "../../tasks/test/external-tool-entry.js";
import type { TaskRuleDispatch } from "../../tasks/src/engine/index.js";
import { DEFAULT_TASK_SCAN_RULE_ID, DEFAULT_TASK_SCAN_SERVICE, type DefaultTaskScanService } from "../src/engine/default-task-scan.js";
import { AutomationsService } from "../src/engine/service.js";
import { Scheduler } from "../src/engine/scheduler.js";
import { taskScanToolDescriptors } from "../src/engine/task-scan-tools.js";
import type { TaskScanOccurrences } from "../src/engine/task-scan-occurrences.js";
import type { ReminderDeliveries } from "../src/engine/reminder-deliveries.js";

const fixture = {
  now: new Date(),
  realtime: false,
  schedule: false,
  scheduler: undefined as Scheduler | undefined,
  repo: undefined as HuhuApi["vault"]["repo"] | undefined,
  defaults: undefined as DefaultTaskScanService | undefined,
  hold: undefined as ((taskId: string, inputHash: string) => void) | undefined,
  scans: undefined as TaskScanOccurrences | undefined,
  reminders: undefined as ReminderDeliveries | undefined,
  ready: vi.fn<TaskDispatchExecutor["ready"]>(),
  dispatch: vi.fn<TaskDispatchExecutor["dispatch"]>(),
  accept: vi.fn<TaskRuleDispatch["acceptRule"]>(),
  refresh: vi.fn<() => Promise<void>>(),
};
const fixtureNow = () => (fixture.realtime ? new Date() : fixture.now);

vi.mock("@huhu/plugin-automations/engine", async (original) => {
  const automations = await original<typeof import("../src/engine/index.js")>();
  return {
    ...automations,
    apply: ((ctx, api, opts) => {
      fixture.repo = api.vault.repo;
      const applied = automations.apply(
        ctx,
        {
          ...api,
          provide(name, service) {
            api.provide(name, service);
            if (name === "taskScanOccurrences") fixture.scans = service as TaskScanOccurrences;
            if (name === "automationReminderDeliveries") fixture.reminders = service as ReminderDeliveries;
            if (name === DEFAULT_TASK_SCAN_SERVICE) fixture.defaults = service as DefaultTaskScanService;
            if (name === "automations") fixture.hold = (service as { holdRestoredInput: typeof fixture.hold }).holdRestoredInput;
          },
        },
        {
          ...opts,
          schedule: fixture.schedule,
          now: fixtureNow,
          refreshClis: fixture.refresh,
          cliAvailable: () => true,
        },
      );
      fixture.scheduler = applied.scheduler;
      return applied;
    }) satisfies typeof automations.apply,
  };
});

vi.mock("../../tasks/src/engine/index.js", async (original) => {
  const tasks = await original<typeof import("../../tasks/src/engine/index.js")>();
  return {
    ...tasks,
    apply: ((ctx, api, opts) =>
      tasks.apply(
        ctx,
        {
          ...api,
          provide(name, service) {
            if (name !== "taskDispatch") return api.provide(name, service);
            const dispatch = service as TaskRuleDispatch;
            fixture.accept.mockImplementation(dispatch.acceptRule);
            api.provide(name, { ...dispatch, acceptRule: fixture.accept } satisfies TaskRuleDispatch);
          },
        },
        {
          ...opts,
          now: fixtureNow,
          dispatchCheckMs: 50,
          dispatchExecutor: { ready: fixture.ready, dispatch: fixture.dispatch, inspect: async () => "unknown" },
        },
      )) satisfies typeof tasks.apply,
  };
});

const engines: RunningEngine[] = [];
const dirs: string[] = [];
const at = (value: string) => new Date(`2030-02-01T${value}Z`);
const trigger = { preset: "every15", cron: "*/15 * * * *", zone: "Asia/Taipei" };
const scanDir = "automations/task-scan-occurrences/";

beforeEach(() => {
  fixture.now = at("01:00:00");
  fixture.realtime = false;
  fixture.schedule = false;
  fixture.ready.mockReset().mockResolvedValue("busy");
  fixture.dispatch.mockReset().mockResolvedValue("accepted");
  fixture.accept.mockReset();
  fixture.refresh.mockReset().mockResolvedValue(undefined);
  vi.spyOn(AgentDetector.prototype, "detect").mockResolvedValue([]);
});

afterEach(async () => {
  for (const engine of engines.splice(0)) await engine.shutdown();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  fixture.scans = undefined;
  fixture.reminders = undefined;
  fixture.scheduler = undefined;
  fixture.defaults = undefined;
  fixture.hold = undefined;
  vi.restoreAllMocks();
});

async function start(vaultPath?: string) {
  const create = vaultPath === undefined;
  if (!vaultPath) {
    vaultPath = mkdtempSync(path.join(tmpdir(), "huhu-task-occurrences-"));
    dirs.push(vaultPath);
  }
  fixture.scans = undefined;
  fixture.reminders = undefined;
  const engine = await boot({ vaultPath, create });
  engines.push(engine);
  expect(fixture.scans).toBeDefined();
  return { engine, scans: fixture.scans!, reminders: fixture.reminders! };
}

async function stop(engine: RunningEngine) {
  await engine.shutdown();
  engines.splice(engines.indexOf(engine), 1);
}

async function call<T = unknown>(engine: RunningEngine, capability: string, input: unknown, external: boolean | string = false) {
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${typeof external === "string" ? external : external ? engine.cliToken : engine.rendererToken}`, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
  });
  return (await response.json()) as { ok: boolean; data: T; error?: { code: string; details?: Record<string, unknown> } };
}

async function invoke<T = unknown>(engine: RunningEngine, capability: string, input: unknown) {
  const result = await call<T>(engine, capability, input);
  expect(result).toMatchObject({ ok: true });
  return result.data;
}

async function createTask(engine: RunningEngine, title: string, tags = ["match"], availableAt?: string) {
  const [space] = await invoke<{ id: string }[]>(engine, "agent.spaces.list", {});
  return invoke<TaskDto>(engine, "tasks.create", { title, body: `${title}的原正文`, type: "agent", tags, availableAt, execution: { spaceId: space!.id, provider: "codex" } });
}

type Rule = { id: string; version: string; body: string; data: { updatedAt: string; enabled: boolean; missedRunGraceMinutes: number } };
const scanTools = Object.fromEntries(Object.entries(taskScanToolDescriptors).map(([key, descriptor]) => [key, descriptor.name])) as Record<keyof typeof taskScanToolDescriptors, string>;
const scanDraft = (title: string) => ({
  title,
  body: "扫描补充说明",
  trigger,
  action: { kind: "agent", input: { source: "tasks", tags: ["match"], includeUnscheduled: true } },
});

async function expose(engine: RunningEngine, ...capabilities: string[]) {
  for (const capability of capabilities) await invoke(engine, "gateway.update", { capability, exposed: true });
}

async function cli<T = unknown>(engine: RunningEngine, capability: string, input: unknown, args: string[] = []) {
  const output: string[] = [];
  await runCli(["call", capability, "--vault", engine.vault.root, "--json", "--input-json", JSON.stringify(input), ...args], {
    out: (line) => output.push(line),
    err: (line) => output.push(line),
  });
  return JSON.parse(output.join("")) as Awaited<ReturnType<typeof call<T>>>;
}

test("CLI 逐项开放任务扫描，写权限只保存和修改停用草稿", async () => {
  const { engine, scans } = await start();
  const draft = scanDraft("CLI 任务扫描草稿");
  const create = () => cli<Rule>(engine, scanTools.create, draft, ["--intent-key", "external-scan-create"]);
  expect(await create()).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  await expose(engine, scanTools.create, scanTools.update, "automations.setEnabled");
  const created = await create();
  expect(created).toMatchObject({ ok: true, data: { data: { enabled: false } } });
  expect(await create()).toEqual(created);
  await expose(engine, "automations.create", "automations.update");
  const generic = await cli<Rule>(engine, "automations.create", { ...draft, title: "通用入口保存扫描草稿" });
  expect(generic).toMatchObject({ ok: true, data: { body: "", data: { enabled: false } } });
  expect(await cli(engine, "automations.create", { ...draft, action: { kind: "terminal", shell: "powershell", command: "Write-Output fixture" } })).toMatchObject({
    ok: false,
    error: { code: "PERMISSION_DENIED" },
  });
  expect(await cli(engine, "automations.update", { id: generic.data.id, expectedVersion: generic.data.version, patch: {}, body: "通用入口更新" })).toMatchObject({ ok: true, data: { body: "" } });
  const target = { id: created.data.id, expectedVersion: created.data.version };
  expect(await cli(engine, scanTools.enable, target)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  expect(await cli(engine, "automations.setEnabled", { ...target, enabled: true })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  for (const action of [
    { ...draft.action, input: { ...draft.action.input, env: { FIXTURE: "value" } } },
    { ...draft.action, input: { ...draft.action.input, spaceId: "caller-supplied" } },
    { ...draft.action, input: { source: "prompt", provider: "fixture", spaceId: "caller-supplied" } },
    { kind: "terminal", shell: "powershell", command: "Write-Output fixture" },
  ]) {
    expect(await cli(engine, scanTools.create, { ...draft, action })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  }
  const edited = await cli<Rule>(engine, scanTools.update, { ...target, patch: { title: "CLI 已编辑草稿" }, body: "版本化说明" });
  expect(edited).toMatchObject({ ok: true, data: { body: "版本化说明", data: { enabled: false } } });
  expect(await cli(engine, scanTools.update, { ...target, patch: { title: "陈旧更新" } })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  await expose(engine, scanTools.enable);
  expect(await cli(engine, scanTools.enable, target)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  const enabled = await cli<Rule>(engine, scanTools.enable, { ...target, expectedVersion: edited.data.version });
  expect(enabled).toMatchObject({ ok: true, data: { data: { enabled: true } } });
  expect(await cli(engine, scanTools.update, { ...target, expectedVersion: enabled.data.version, patch: { title: "活动规则改写" } })).toMatchObject({
    ok: false,
    error: { code: "INVALID_INPUT" },
  });
  expect(await cli(engine, scanTools.runNow, { ...target, expectedVersion: enabled.data.version, intentId: randomUUID() })).toMatchObject({
    ok: false,
    error: { code: "CAPABILITY_NOT_EXPOSED" },
  });
  expect(scans.list()).toEqual([]);
  expect(dispatchRecords(engine)).toEqual([]);
  await invoke(engine, "plugins.setEnabled", { id: "automations", enabled: false });
  const inactive = await invoke<CapabilityCatalogEntry[]>(engine, "capabilities.list", { includeInactive: true });
  for (const descriptor of Object.values(taskScanToolDescriptors)) {
    expect(inactive.find(({ name }) => name === descriptor.name)).toMatchObject({
      availability: "plugin-disabled",
      scope: descriptor.scope,
      risk: descriptor.risk,
      input: expect.any(Object),
      output: expect.any(Object),
    });
  }
  expect(await cli(engine, scanTools.create, draft)).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
}, 20_000);

test("专用规则启用后触发真实计划，保护默认规则、已启用规则和恢复保留任务", async () => {
  fixture.schedule = true;
  const { engine, scans } = await start();
  const scheduler = fixture.scheduler!;
  await fixture.defaults!.initializeAfterEnable();
  const defaultRule = await invoke<Rule>(engine, "automations.read", { id: DEFAULT_TASK_SCAN_RULE_ID });
  const existing = await createRule(engine, "原已启用规则");
  const originalJobs = [DEFAULT_TASK_SCAN_RULE_ID, existing.id].sort();
  expect(scheduler.active().sort()).toEqual(originalJobs);
  fixture.realtime = true;
  const task = await createTask(engine, "下一计划点入队");
  const held = await createTask(engine, "恢复后保留原输入");
  fixture.hold!(held.id, held.inputHash);
  await expose(engine, scanTools.create, scanTools.update, scanTools.enable, scanTools.setEnabled, scanTools.delete);
  for (const rule of [defaultRule, existing]) {
    expect(await cli(engine, scanTools.update, { id: rule.id, expectedVersion: rule.version, patch: {}, body: "不应保存" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT" },
    });
    expect(await invoke(engine, "automations.read", { id: rule.id })).toEqual(rule);
  }
  const created = await cli<Rule>(engine, scanTools.create, scanDraft("CLI 定时任务扫描"));
  expect(created).toMatchObject({ ok: true });
  const { id } = created.data;
  expect(scheduler.active().sort()).toEqual(originalJobs);
  const edited = await cli<Rule>(engine, scanTools.update, { id, expectedVersion: created.data.version, patch: { trigger: { ...trigger, cron: "* * * * * *" } } });
  expect(edited).toMatchObject({ ok: true });
  expect(scheduler.active().sort()).toEqual(originalJobs);
  expect(scans.lastScheduledFor(id)).toBeNull();
  const enabled = await cli<Rule>(engine, scanTools.enable, { id, expectedVersion: edited.data.version });
  expect(enabled).toMatchObject({ ok: true });
  expect(scheduler.active().sort()).toEqual([...originalJobs, id].sort());
  await vi.waitFor(
    () =>
      expect(scans.list()).toContainEqual(
        expect.objectContaining({
          ruleId: id,
          ruleVersion: enabled.data.version,
          scheduledForUTC: expect.any(String),
          finishedAt: expect.any(String),
          items: expect.arrayContaining([expect.objectContaining({ taskId: task.id, state: "accepted" }), expect.objectContaining({ taskId: held.id, state: "skipped", reason: "held-after-restore" })]),
        }),
      ),
    { timeout: 5000 },
  );
  const paused = await cli<Rule>(engine, scanTools.setEnabled, { id, expectedVersion: enabled.data.version, enabled: false });
  expect(paused).toMatchObject({ ok: true });
  expect(scheduler.active().sort()).toEqual(originalJobs);
  const count = scans.list().filter(({ ruleId }) => ruleId === id).length;
  expect(await cli(engine, scanTools.delete, { id, expectedVersion: paused.data.version })).toMatchObject({ ok: true });
  await createTask(engine, "规则删除后新增");
  await new Promise((resolve) => setTimeout(resolve, 2100));
  expect(scheduler.active().sort()).toEqual(originalJobs);
  expect(scans.list().filter(({ ruleId }) => ruleId === id)).toHaveLength(count);
  expect(dispatchRecords(engine).map(({ receipt }) => receipt.taskId)).toEqual([task.id]);
  expect(fixture.dispatch).not.toHaveBeenCalled();
}, 15_000);

test("同一 MCP HTTP 会话重交手动意图，Engine 重开后的新 stdio 会话无法认领", async () => {
  const first = await start();
  let { engine } = first;
  const task = await createTask(engine, "唯一应执行的合成任务");
  const rule = await createRule(engine, "MCP 扫描规则");
  const input = { id: rule.id, expectedVersion: rule.version, intentId: randomUUID() };
  const tool = scanTools.runNow.replaceAll(".", "_");
  const endpoint = () => `http://127.0.0.1:${engine.port}/mcp`;
  const { token } = await invoke<{ token: string }>(engine, "gateway.tokens.create", { name: "task-scan MCP fixture" });
  const setMcp = (transport: "http" | "stdio") => invoke(engine, "gateway.mcp.update", { enabled: true, transport });
  await setMcp("http");
  const session = await openMcpSession(endpoint(), token);
  const http = async (method: string, params: unknown) => {
    const response = await mcpRequest(endpoint(), token, mcpRpc(method, params), session);
    expect(response.status).toBe(200);
    return ((await response.json()) as { result: { structuredContent?: unknown; isError?: boolean; content?: { text: string }[]; tools?: { name: string; inputSchema: unknown; outputSchema: unknown }[] } }).result;
  };
  expect((await http("tools/list", {})).tools).toEqual([]);
  await expose(engine, scanTools.runNow, "automations.activations.dispatches", "automations.setEnabled", "automations.delete");
  const httpTool = (await http("tools/list", {})).tools?.find(({ name }) => name === tool);
  expect(httpTool).toMatchObject({ name: tool, inputSchema: { additionalProperties: false } });
  const callParams = { name: tool, arguments: input };
  const [accepted, duplicate] = await Promise.all([http("tools/call", callParams), http("tools/call", callParams)]);
  const receipt = accepted.structuredContent;
  expect(receipt).toMatchObject({ data: { activationId: expect.stringMatching(/^inv-ext-/), ruleVersion: rule.version, summary: { processed: 1, skipped: 0 } } });
  expect(duplicate.structuredContent).toEqual(receipt);
  expect(fixture.accept).toHaveBeenCalledTimes(1);
  const [occurrence] = first.scans.list();
  const { id: activationId } = occurrence!;
  expect(occurrence).toMatchObject({ ruleVersion: rule.version, scheduledForUTC: null, rule: { instructions: rule.body }, items: [{ taskId: task.id, state: "accepted" }] });
  expect(first.scans.lastScheduledFor(rule.id)).toBeNull();

  fixture.now = at("01:15:00");
  const paused = await cli<Rule>(engine, "automations.setEnabled", { id: rule.id, expectedVersion: rule.version, enabled: false });
  expect(paused).toMatchObject({ ok: true });
  fixture.now = at("01:30:00");
  expect(await first.scans.scheduled(rule.id, fixture.now)).toBeNull();
  expect(await cli(engine, "automations.delete", { id: rule.id, expectedVersion: paused.data.version })).toMatchObject({ ok: true });
  await createTask(engine, "删除规则后新增的合成任务");
  expect(await call(engine, scanTools.runNow, input, true)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

  expect((await http("tools/call", callParams)).structuredContent).toEqual(receipt);
  const mismatch = await http("tools/call", { ...callParams, arguments: { ...input, expectedVersion: paused.data.version } });
  expect(mismatch).toMatchObject({ isError: true, content: [expect.objectContaining({ text: expect.stringContaining("IDEMPOTENCY_MISMATCH") })] });
  const root = engine.vault.root;
  await stop(engine);
  ({ engine } = await start(root));
  expect((await mcpRequest(endpoint(), token, mcpRpc("tools/list"), session)).status).toBe(404);
  await setMcp("stdio");
  const cliRequire = createRequire(new URL("../../../apps/cli/package.json", import.meta.url));
  const { Client } = cliRequire("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = cliRequire("@modelcontextprotocol/sdk/client/stdio.js");
  const client = new Client({ name: "task-scan-fixture", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliRequire.resolve("tsx/cli"), path.resolve(import.meta.dirname, "../../../apps/cli/src/bin.ts"), "mcp", "--vault", root],
  });
  try {
    await client.connect(transport);
    const { tools } = (await client.listTools()) as { tools: { name: string; inputSchema: unknown; outputSchema: unknown }[] };
    const stdioTool = tools.find(({ name }) => name === tool);
    expect(stdioTool?.inputSchema).toEqual(httpTool?.inputSchema);
    expect(stdioTool?.outputSchema).toEqual(httpTool?.outputSchema);
    expect(await client.callTool(callParams)).toMatchObject({ isError: true, content: [expect.objectContaining({ text: expect.stringContaining("NOT_FOUND") })] });
    await invoke(engine, "gateway.update", { capability: scanTools.runNow, exposed: false });
    expect(await client.callTool(callParams)).toMatchObject({ isError: true, content: [expect.objectContaining({ text: expect.stringContaining("CAPABILITY_NOT_EXPOSED") })] });
  } finally {
    await client.close();
  }
  expect(fixture.accept).toHaveBeenCalledTimes(1);
  expect(await cli(engine, "automations.activations.dispatches", { ruleId: rule.id, activationId })).toMatchObject({
    ok: true,
    data: { dispatches: [{ taskId: task.id, dispatchId: expect.any(String), state: "accepted" }] },
  });
  fixture.ready.mockResolvedValue("ready");
  await vi.waitFor(() => expect(fixture.dispatch).toHaveBeenCalledTimes(1));
  expect(dispatchRecords(engine)).toHaveLength(1);
}, 25_000);

test("两枚 HTTP bearer 隔离手动意图，等待后的撤权在落盘前生效", async () => {
  const { engine, scans } = await start();
  const rule = await createRule(engine, "Bearer 扫描规则");
  const target = { id: rule.id, expectedVersion: rule.version };
  const input = { ...target, intentId: randomUUID() };
  const a = await invoke<{ id: string; token: string }>(engine, "gateway.tokens.create", { name: "synthetic-first" });
  const b = await invoke<{ id: string; token: string }>(engine, "gateway.tokens.create", { name: "synthetic-second" });
  await expose(engine, scanTools.runNow);
  const run = (token: string, request: object = input) => call<{ activationId: string }>(engine, scanTools.runNow, request, token);
  const [first, second] = await Promise.all([run(a.token), run(b.token)]);
  expect(first).toMatchObject({ ok: true, data: { ruleVersion: rule.version } });
  expect(second).toMatchObject({ ok: true, data: { ruleVersion: rule.version } });
  expect(second.data.activationId).not.toBe(first.data.activationId);
  expect(await run(a.token)).toEqual(first);
  expect(await run(b.token)).toEqual(second);
  expect(await run(a.token, { ...input, id: "different-rule" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
  expect(await run(a.token, { ...input, intentId: randomUUID(), expectedVersion: "stale" })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect(await run(a.token, { ...input, intentId: randomUUID(), dispatchId: "forged" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await run(b.token, { ...input, intentId: randomUUID(), allowEarly: true })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await call(engine, "agent.sessions.launch", {}, a.token)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  const waits = fixture.refresh.mock.calls.length;
  let release = () => {};
  fixture.refresh.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const inFlight = run(a.token, { ...input, intentId: randomUUID() });
  try {
    await vi.waitFor(() => expect(fixture.refresh).toHaveBeenCalledTimes(waits + 1));
    expect(await invoke(engine, "gateway.tokens.revoke", { id: a.id })).toEqual({ revoked: true });
  } finally {
    release();
  }
  expect(await inFlight).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  expect(await run(b.token)).toEqual(second);
  expect(scans.list()).toHaveLength(2);

  let enteredPublication!: () => void;
  let continuePublication!: () => void;
  const entered = new Promise<void>((resolve) => {
    enteredPublication = resolve;
  });
  const proceed = new Promise<void>((resolve) => {
    continuePublication = resolve;
  });
  const originalWrite = VaultFiles.prototype.write;
  const pause = vi.spyOn(VaultFiles.prototype, "write").mockImplementation(async function (this: VaultFiles, rel, bytes, options) {
    if (rel.startsWith(`${scanDir}inv-ext-`) && options?.expectedVersion === null) {
      enteredPublication();
      await proceed;
    }
    return originalWrite.call(this, rel, bytes, options);
  });
  const atPublication = run(b.token, { ...input, intentId: randomUUID() });
  try {
    expect(await Promise.race([entered.then(() => "at-publication"), atPublication.then(() => "finished")])).toBe("at-publication");
    expect(await invoke(engine, "gateway.update", { capability: scanTools.runNow, exposed: false })).toMatchObject({ exposed: false });
  } finally {
    continuePublication();
    pause.mockRestore();
  }
  expect(await atPublication).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  expect(scans.list()).toHaveLength(2);
  expect(dispatchRecords(engine)).toEqual([]);
}, 20_000);

test("外部手动受理在派遣前丢失确认，重开仅补原名单", async () => {
  const first = await start();
  const rule = await createRule(first.engine, "发生已落盘的外部扫描");
  const task = await createTask(first.engine, "原冻结任务");
  await expose(first.engine, scanTools.runNow);
  const input = { id: rule.id, expectedVersion: rule.version, intentId: randomUUID() };
  fixture.accept.mockRejectedValueOnce(new Error("合成中断：落盘后派遣前失联"));
  expect(await cli(first.engine, scanTools.runNow, input)).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  const [stored] = first.scans.list();
  expect(stored).toMatchObject({ ruleVersion: rule.version, finishedAt: null, items: [{ taskId: task.id, state: "pending" }] });
  expect(dispatchRecords(first.engine)).toEqual([]);
  const added = await createTask(first.engine, "重开后新增任务");
  fixture.now = at("01:01:00");
  const paused = await invoke<Rule>(first.engine, "automations.setEnabled", { id: rule.id, enabled: false });
  const changed = await invoke<Rule>(first.engine, "automations.update", { id: rule.id, expectedVersion: paused.version, patch: {}, body: "后续版本说明" });
  await stop(first.engine);
  const { engine, scans } = await start(first.engine.vault.root);
  const recovered = await cli(engine, scanTools.runNow, input);
  expect(recovered).toMatchObject({ ok: true, data: { activationId: stored!.id, ruleVersion: rule.version, summary: { processed: 1, skipped: 0 } } });
  expect(await cli(engine, scanTools.runNow, input)).toEqual(recovered);
  expect(await cli(engine, scanTools.runNow, { ...input, expectedVersion: changed.version })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
  expect(await cli(engine, scanTools.runNow, { ...input, intentId: randomUUID() })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect(scans.list()).toMatchObject([{ id: stored!.id, rule: { instructions: rule.body }, items: [{ taskId: task.id, state: "accepted" }] }]);
  expect(dispatchRecords(engine)).toHaveLength(1);
  expect(dispatchRecords(engine)[0]?.receipt.taskId).not.toBe(added.id);
  expect(fixture.refresh).toHaveBeenCalledTimes(1);
}, 20_000);

test("公开扫描明细按授权给出原派遣身份，停用或删除后仍可单项取消", async () => {
  const { engine, scans } = await start();
  const task = await createTask(engine, "实测待派任务");
  const rule = await createRule(engine, "挂起扫描");
  fixture.now = at("01:15:00");
  const occurrence = await scans.scheduled(rule.id, fixture.now);
  expect(occurrence?.items).toHaveLength(1);
  const identity = { ruleId: rule.id, activationId: occurrence!.id };
  const cli = <T = unknown>(capability: string, input: unknown) => call<T>(engine, capability, input, true);
  expect(await cli("automations.activations.dispatches", identity)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  for (const capability of ["automations.activations.dispatches", "automations.setEnabled", "automations.delete", "tasks.dispatch.read", "tasks.dispatch.cancel"]) {
    await invoke(engine, "gateway.update", { capability, exposed: true });
  }
  expect(await cli("automations.activations.dispatches", { ...identity, ruleId: "another-rule" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  const result = await cli<{ dispatches: { taskId: string; dispatchId: string; state: string }[] }>("automations.activations.dispatches", identity);
  expect(result).toMatchObject({ ok: true, data: { dispatches: [{ taskId: task.id, dispatchId: expect.any(String), state: "accepted" }] } });
  const { taskId, dispatchId } = result.data.dispatches[0]!;
  const target = { taskId, dispatchId };
  expect(await cli("automations.setEnabled", { id: rule.id, enabled: false })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await cli("automations.delete", { id: rule.id })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  const paused = await cli<Rule>("automations.setEnabled", { id: rule.id, expectedVersion: rule.version, enabled: false });
  expect(paused).toMatchObject({ ok: true, data: { data: { enabled: false } } });
  expect(await cli("automations.delete", { id: rule.id, expectedVersion: rule.version })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect(await cli("automations.delete", { id: rule.id, expectedVersion: paused.data.version })).toMatchObject({ ok: true });
  expect(await cli("automations.activations.dispatches", identity)).toEqual(result);
  expect(await cli("tasks.dispatch.read", target)).toMatchObject({ ok: true, data: { state: "pending" } });
  const cancelled = await cli("tasks.dispatch.cancel", target);
  expect(cancelled).toMatchObject({ ok: true, data: { state: "cancelled" } });
  expect(await cli("tasks.dispatch.cancel", target)).toEqual(cancelled);
  expect(fixture.dispatch).not.toHaveBeenCalled();
}, 20_000);

test("外部提醒规则独立授权，固定版本的运行意图在重启后仍只交付一次", async () => {
  let { engine } = await start();
  const cli = <T = unknown>(capability: string, input: unknown) => call<T>(engine, capability, input, true);
  const draft = { title: "合成提醒草稿", trigger, action: { kind: "reminder", mode: "both", text: "合成提醒效果" } };
  expect(await cli("automations.create", draft)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  for (const capability of ["automations.create", "automations.update", "automations.setEnabled", "automations.preview"]) {
    await invoke(engine, "gateway.update", { capability, exposed: true });
  }
  const created = await cli<Rule>("automations.create", draft);
  expect(created).toMatchObject({ ok: true, data: { data: { enabled: false } } });
  const { id, version } = created.data;
  const edited = await cli<Rule>("automations.update", { id, expectedVersion: version, patch: { title: "已编辑测试提醒" } });
  expect(edited).toMatchObject({ ok: true });
  const enabled = await cli<Rule>("automations.setEnabled", { id, expectedVersion: edited.data.version, enabled: true });
  expect(enabled).toMatchObject({ ok: true, data: { data: { enabled: true } } });
  expect(await cli("automations.preview", { id })).toMatchObject({ ok: true, data: { next: expect.any(Array) } });
  const input = { id, expectedVersion: enabled.data.version, intentId: randomUUID() };
  expect(await cli("automations.runNow", input)).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } });
  await invoke(engine, "gateway.update", { capability: "automations.runNow", exposed: true });
  expect(await cli("automations.runNow", { ...input, expectedVersion: version })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  const agent = await createRule(engine, "不能从提醒入口运行的 Agent 规则");
  expect(await cli("automations.runNow", { id: agent.id, expectedVersion: agent.version, intentId: randomUUID() })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });

  const [accepted, duplicate] = await Promise.all([cli("automations.runNow", input), cli("automations.runNow", input)]);
  expect(accepted).toMatchObject({ ok: true, data: { activationId: expect.stringMatching(/^rem-/), summary: { state: "succeeded", notification: "sent", task: "created" } } });
  expect(duplicate).toEqual(accepted);
  expect(await cli("automations.runNow", { ...input, expectedVersion: version })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });

  const { root } = engine.vault.files;
  await stop(engine);
  ({ engine } = await start(root));
  expect(await cli("automations.runNow", input)).toEqual(accepted);
  const notices = await invoke<{ title: string }[]>(engine, "notifications.list", {});
  expect(notices.filter(({ title }) => title === draft.action.text)).toHaveLength(1);
  expect(readdirSync(path.join(engine.vault.stateDir, "automations/reminder-deliveries"))).toHaveLength(1);
  expect(fixture.dispatch).not.toHaveBeenCalled();
}, 20_000);

async function createRule(engine: RunningEngine, title: string) {
  const rule = await invoke<Rule>(engine, "automations.create", {
    title,
    body: "第一版补充指令",
    trigger,
    action: { kind: "agent", input: { source: "tasks", tags: ["match"], maxConcurrent: 1, window: { kind: "today" }, includeUnscheduled: true } },
  });
  return invoke<Rule>(engine, "automations.setEnabled", { id: rule.id, enabled: true });
}

async function createReminder(engine: RunningEngine, text: string, mode: "notification" | "task" | "both") {
  const rule = await invoke<Rule>(engine, "automations.create", { title: text, trigger, action: { kind: "reminder", mode, text } });
  return invoke<Rule>(engine, "automations.setEnabled", { id: rule.id, enabled: true });
}

test("三种提醒效果对同一发生各自至多一次，重启保持任务、通知及发生关联", async () => {
  const { engine, reminders } = await start();
  const rules = await Promise.all([createReminder(engine, "仅通知", "notification"), createReminder(engine, "仅建任务", "task"), createReminder(engine, "两种提醒", "both")]);
  const root = engine.vault.root;
  const slot = (fixture.now = at("01:15:00"));
  for (const rule of rules) {
    const [first, duplicate] = await Promise.all([reminders.activate(rule.id, slot), reminders.activate(rule.id, slot)]);
    expect(first).toEqual(duplicate);
    expect(first?.summary).toMatchObject({ state: "succeeded" });
  }
  await stop(engine);
  const reopened = await start(root);
  await reopened.reminders.recover();
  const rows = await invoke<{ ruleId: string; activationId: string; summary: unknown }[]>(reopened.engine, "automations.activations", {});
  const [notification, task, both] = rules.map((rule) => rows.find(({ ruleId }) => ruleId === rule.id));
  expect(notification?.summary).toMatchObject({ notification: "sent", task: "disabled", notificationId: expect.any(String) });
  expect(task?.summary).toMatchObject({ notification: "disabled", task: "created", taskId: expect.any(String) });
  expect(both?.summary).toMatchObject({ notification: "sent", task: "created", notificationId: expect.any(String), taskId: expect.any(String) });
  const tasks = await invoke<TaskDto[]>(reopened.engine, "tasks.list", {});
  expect(tasks).toHaveLength(2);
  for (const row of [task, both])
    expect(tasks).toContainEqual(
      expect.objectContaining({
        type: "human",
        status: "not_started",
        origin: { kind: "automation", ruleId: row!.ruleId, activationId: row!.activationId },
      }),
    );
  const alerts = await invoke<{ title: string }[]>(reopened.engine, "notifications.list", {});
  expect(alerts.map(({ title }) => title).sort()).toEqual(["仅通知", "两种提醒"].sort());
  const manual = await invoke<{ activationId: string; summary: unknown }>(reopened.engine, "automations.runNow", { id: rules[0]!.id });
  expect(manual).toMatchObject({ activationId: expect.stringMatching(/^rem-/), summary: { state: "succeeded", notification: "sent", task: "disabled" } });
  expect(manual.activationId).not.toBe(notification!.activationId);
});

test("提醒任务创建后落盘失败，重启只读回原任务和已发通知", async () => {
  const { engine, reminders } = await start();
  const rule = await createReminder(engine, "保留确认身份", "both");
  const root = engine.vault.root;
  const slot = (fixture.now = at("01:15:00"));
  const original = VaultFiles.prototype.write;
  const write = vi.spyOn(VaultFiles.prototype, "write").mockImplementation(function (this: VaultFiles, name, bytes, options) {
    if (name.startsWith("automations/reminder-deliveries/") && JSON.parse(Buffer.from(bytes).toString("utf8")).task === "created") {
      throw new Error("合成中断：提醒任务已创建，确认未写入");
    }
    return original.call(this, name, bytes, options);
  });
  try {
    await expect(reminders.activate(rule.id, slot)).rejects.toThrow("确认未写入");
  } finally {
    write.mockRestore();
  }
  const [first] = await invoke<TaskDto[]>(engine, "tasks.list", {});
  expect(first).toMatchObject({ title: "保留确认身份", type: "human" });
  await stop(engine);
  const reopened = await start(root);
  await reopened.reminders.recover();
  expect((await reopened.reminders.activate(rule.id, slot))?.summary).toMatchObject({ notification: "sent", task: "created", taskId: first!.id });
  expect((await invoke<TaskDto[]>(reopened.engine, "tasks.list", {})).map(({ id }) => id)).toEqual([first!.id]);
  expect(await invoke(reopened.engine, "notifications.list", {})).toEqual([expect.objectContaining({ title: "保留确认身份" })]);
});

test("通知尝试无确认时只记录未知，并允许独立的建任务效果完成", async () => {
  const { engine, reminders } = await start();
  const rule = await createReminder(engine, "通知待核实", "both");
  const root = engine.vault.root;
  const slot = (fixture.now = at("01:15:00"));
  const notify = vi.spyOn(NotificationStore.prototype, "create").mockImplementationOnce(() => {
    throw new Error("无可读回的通知确认");
  });
  const first = await reminders.activate(rule.id, slot);
  expect(first?.summary).toMatchObject({ state: "unknown", notification: "unknown", task: "created", taskId: expect.any(String) });
  expect(notify).toHaveBeenCalledTimes(1);
  await stop(engine);
  const reopened = await start(root);
  await reopened.reminders.recover();
  expect(await reopened.reminders.activate(rule.id, slot)).toEqual(first);
  expect(await invoke(reopened.engine, "notifications.list", {})).toEqual([]);
  expect(notify).toHaveBeenCalledTimes(1);
});

function dispatchRecords(engine: RunningEngine): DispatchRecord[] {
  const dir = path.join(engine.vault.stateDir, "tasks", "dispatches");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(path.join(dir, name), "utf8")) as DispatchRecord);
}

test("真实两规则和工作台争同一任务，重交沿用原版本，运行长任务期间可读发生", async () => {
  const { engine, scans } = await start();
  const a = await createRule(engine, "扫描甲");
  const b = await createRule(engine, "扫描乙");
  const task = await createTask(engine, "同一个任务");
  fixture.now = at("01:15:00");
  const slot = fixture.now;
  const input = { taskId: task.id, dispatchId: randomUUID(), expectedVersion: task.version, inputRevision: task.inputRevision, inputHash: task.inputHash };

  const [first, duplicate, second, desktop] = await Promise.all([
    scans.scheduled(a.id, slot),
    scans.scheduled(a.id, new Date("2030-02-01T09:15:00+08:00")),
    scans.scheduled(b.id, slot),
    call<DispatchReceipt>(engine, "tasks.dispatch", input),
  ]);
  expect(first).toEqual(duplicate);
  expect([first?.items[0], second?.items[0]].filter((row) => row?.state === "accepted").length + Number(desktop.ok)).toBe(1);
  expect(fixture.accept).toHaveBeenCalledTimes(2);
  const [winner] = dispatchRecords(engine);
  expect(dispatchRecords(engine)).toHaveLength(1);
  for (const row of [first!, second!]) {
    expect(row.finishedAt).toEqual(expect.any(String));
    const result = row.items[0]!;
    if (result.state === "accepted") expect(result).toMatchObject({ eventId: winner!.receipt.eventId, runId: winner!.receipt.runId });
    else expect(result).toMatchObject({ state: "skipped", reason: "task_occupied", blockingRunId: winner!.receipt.runId });
  }
  if (!desktop.ok) expect(desktop.error).toMatchObject({ details: { reason: "task_occupied", runId: winner!.receipt.runId } });
  await vi.waitFor(() => expect(dispatchRecords(engine)[0]?.receipt).toMatchObject({ state: "pending", reason: "waiting_resource" }));
  expect(fixture.dispatch).not.toHaveBeenCalled();

  fixture.now = at("01:16:00");
  const edited = await invoke<Rule>(engine, "automations.update", { id: a.id, expectedVersion: a.version, patch: {}, body: "第二版补充指令" });
  expect(edited.body).toBe("第二版补充指令");
  const added = await createTask(engine, "下一次才入选");
  expect(await scans.scheduled(a.id, slot)).toEqual(first);
  expect(first).toMatchObject({ ruleVersion: a.version, rule: { instructions: "第一版补充指令" } });
  expect(first?.items.map((item) => item.taskId)).toEqual([task.id]);

  // Dispatch acceptance completes independently of the eventual task execution.
  fixture.dispatch.mockImplementation(
    async () =>
      new Promise((resolve) => {
        releaseDispatch = () => resolve("accepted");
      }),
  );
  let releaseDispatch: (() => void) | undefined;
  fixture.ready.mockResolvedValue("ready");
  try {
    await vi.waitFor(() => expect(fixture.dispatch).toHaveBeenCalledTimes(1));
    expect(scans.read(first!.id)).toEqual(first);
    expect(scans.read(first!.id)?.items.some((item) => item.taskId === added.id)).toBe(false);
  } finally {
    releaseDispatch?.();
  }
});

test("已有会话和原生恢复交由 Tasks 对各自目标做预检", async () => {
  const { engine, scans } = await start();
  const rule = await createRule(engine, "扫描绑定目标");
  const [space] = await invoke<{ id: string }[]>(engine, "agent.spaces.list", {});
  const create = (title: string, execution: Omit<NonNullable<TaskDto["execution"]>, "spaceId" | "model" | "effort" | "fast">) =>
    invoke<TaskDto>(engine, "tasks.create", { title, body: title, type: "agent", tags: ["match"], execution: { spaceId: space!.id, ...execution } });
  const existingTarget = { mode: "existing", sessionId: "synthetic-session" } as const;
  const resumeTarget = { mode: "resume", nativeSessionId: "synthetic-thread" } as const;
  const existing = await create("已有会话", { provider: null, target: existingTarget });
  const resume = await create("原生恢复", { provider: "codex", target: resumeTarget });
  await invoke(engine, "gateway.update", { capability: "automations.preview", exposed: true });
  const preview = await call<{ ruleVersion: string; candidates: { taskId: string }[] }>(engine, "automations.preview", { id: rule.id, expectedVersion: rule.version }, true);
  expect(preview).toMatchObject({ ok: true, data: { ruleVersion: rule.version } });
  expect(await call(engine, "automations.preview", { id: rule.id, expectedVersion: "stale" }, true)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect(fixture.refresh).not.toHaveBeenCalled();
  expect(preview.data.candidates.map(({ taskId }) => taskId).sort()).toEqual([existing.id, resume.id].sort());
  expect(scans.list()).toEqual([]);
  expect(dispatchRecords(engine)).toEqual([]);
  const row = await scans.invoke(rule.id);
  expect(row.items).toHaveLength(2);
  expect(row.items).toEqual(expect.arrayContaining([expect.objectContaining({ taskId: existing.id, state: "accepted" }), expect.objectContaining({ taskId: resume.id, state: "accepted" })]));
  await vi.waitFor(() =>
    expect(dispatchRecords(engine)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          receipt: expect.objectContaining({ taskId: existing.id, state: "pending", reason: "waiting_resource" }),
          snapshot: expect.objectContaining({ execution: expect.objectContaining({ target: existingTarget }) }),
        }),
        expect.objectContaining({ receipt: expect.objectContaining({ taskId: resume.id, state: "pending", reason: "waiting_resource" }), snapshot: expect.objectContaining({ execution: expect.objectContaining({ target: resumeTarget }) }) }),
      ]),
    ),
  );
  expect(fixture.dispatch).not.toHaveBeenCalled();
});

test("刷新未完成时保留扫描资格，冻结完成后重交不再刷新", async () => {
  const { engine, scans } = await start();
  const rule = await createRule(engine, "等待 CLI 探测");
  const task = await createTask(engine, "应当入选的任务");
  fixture.now = at("01:15:00");
  const failed = new Error("合成探测超时");
  fixture.refresh.mockRejectedValueOnce(failed);
  await expect(scans.scheduled(rule.id, fixture.now)).rejects.toBe(failed);
  expect(scans.list()).toEqual([]);
  expect(fixture.accept).not.toHaveBeenCalled();
  const captured = await scans.scheduled(rule.id, fixture.now);
  expect(captured?.items).toMatchObject([{ taskId: task.id, state: "accepted" }]);
  expect(await scans.scheduled(rule.id, fixture.now)).toEqual(captured);
  expect(fixture.refresh).toHaveBeenCalledTimes(2);
  expect(fixture.accept).toHaveBeenCalledTimes(1);
});

test("模板派遣在任务文件落盘后中断，恢复使用原任务和模板，各计划点有独立身份", async () => {
  const first = await start();
  const [space] = await invoke<{ id: string }[]>(first.engine, "agent.spaces.list", {});
  const created = await invoke<Rule>(first.engine, "automations.create", {
    title: "独立模板任务",
    body: "第一版模板正文",
    trigger,
    action: { kind: "agent", input: { source: "prompt", spaceId: space!.id, provider: "codex", model: "fixture-model", effort: "high", fast: true } },
  });
  const rule = await invoke<Rule>(first.engine, "automations.setEnabled", { id: created.id, enabled: true });
  fixture.now = at("01:15:00");
  const slot = fixture.now;
  const write = VaultFiles.prototype.write;
  const interrupted = new Error("创建模板任务后中断");
  const injection = vi.spyOn(VaultFiles.prototype, "write").mockImplementation(async function (this: VaultFiles, rel, bytes, options) {
    const result = await write.call(this, rel, bytes, options);
    if (rel.startsWith("Tasks/") && options?.expectedVersion === null) throw interrupted;
    return result;
  });
  try {
    await expect(first.scans.scheduled(rule.id, slot)).rejects.toBe(interrupted);
  } finally {
    injection.mockRestore();
  }
  const [frozen] = first.scans.list();
  const [task] = await invoke<TaskDto[]>(first.engine, "tasks.list", {});
  expect(frozen).toMatchObject({ finishedAt: null, template: { taskId: task!.id }, items: [], ruleVersion: rule.version });
  expect(task).toMatchObject({ body: "第一版模板正文", execution: { model: "fixture-model", effort: "high", fast: true }, origin: { kind: "automation", ruleId: rule.id, activationId: frozen!.id } });
  expect(dispatchRecords(first.engine)).toEqual([]);

  fixture.now = at("01:16:00");
  const changed = await invoke<Rule>(first.engine, "automations.update", { id: rule.id, expectedVersion: rule.version, patch: {}, body: "第二版模板正文" });
  await stop(first.engine);
  const reopened = await start(first.engine.vault.root);
  await reopened.scans.recover();
  expect(await invoke<TaskDto[]>(reopened.engine, "tasks.list", {})).toHaveLength(1);
  const firstRun = dispatchRecords(reopened.engine)[0]!;
  expect(firstRun.snapshot).toMatchObject({ taskId: task!.id, body: "第一版模板正文", source: { ruleVersion: rule.version, occurrenceId: frozen!.id } });
  expect(firstRun.snapshot.source).not.toHaveProperty("instructions");
  expect(await reopened.scans.scheduled(rule.id, slot)).toMatchObject({ items: [{ taskId: task!.id, state: "accepted", eventId: firstRun.receipt.eventId, runId: firstRun.receipt.runId }] });

  fixture.now = at("01:30:00");
  const next = await reopened.scans.scheduled(rule.id, fixture.now);
  expect(next?.template?.taskId).not.toBe(task!.id);
  expect(next).toMatchObject({ ruleVersion: changed.version, items: [{ state: "accepted", taskId: next?.template?.taskId }] });
  expect(dispatchRecords(reopened.engine)).toHaveLength(2);
  expect(dispatchRecords(reopened.engine).find(({ receipt }) => receipt.taskId === next?.template?.taskId)?.snapshot.body).toBe("第二版模板正文");
});

test("模板预检失败保存原因，且不会创建任务或运行", async () => {
  const { engine, scans } = await start();
  const rule = await invoke<Rule>(engine, "automations.create", {
    title: "空间缺失的模板",
    body: "模板正文",
    trigger,
    action: { kind: "agent", input: { source: "prompt", spaceId: "space-missing", provider: "codex" } },
  });
  const result = await scans.invoke(rule.id);
  expect(result).toMatchObject({ scheduledForUTC: null, finishedAt: expect.any(String), template: { issue: "missing-space" }, items: [] });
  expect(await invoke<TaskDto[]>(engine, "tasks.list", {})).toEqual([]);
  expect(dispatchRecords(engine)).toEqual([]);
});

test.each(["occurrence", "acceptance", "finish"] as const)("%s 写入边界中断后重开，从原名单收尾", async (stage) => {
  const first = await start();
  const rule = await createRule(first.engine, "带恢复的扫描");
  const a = await createTask(first.engine, "候选甲");
  const b = await createTask(first.engine, "候选乙");
  const future = await createTask(first.engine, "未到时间", undefined, at("03:00:00").toISOString());
  fixture.now = at("01:15:00");
  const slot = fixture.now;
  const write = VaultFiles.prototype.write;
  const error = new Error(`injected ${stage} interruption`);
  const boundary = vi.spyOn(VaultFiles.prototype, "write").mockImplementation(async function (this: VaultFiles, rel, bytes, options) {
    if (rel.startsWith(scanDir)) {
      const row = JSON.parse(Buffer.from(bytes).toString("utf8")) as NonNullable<ReturnType<TaskScanOccurrences["read"]>>;
      if (stage === "occurrence" && options?.expectedVersion === null) {
        await write.call(this, rel, bytes, options);
        throw error;
      }
      if (stage === "acceptance" && row.items.some((item) => item.state === "accepted")) throw error;
      if (stage === "finish" && row.finishedAt) throw error;
    }
    return write.call(this, rel, bytes, options);
  });
  try {
    await expect(first.scans.scheduled(rule.id, slot)).rejects.toBe(error);
  } finally {
    boundary.mockRestore();
  }

  const [frozen] = first.scans.list();
  expect(frozen).toMatchObject({ finishedAt: null, ruleVersion: rule.version, rule: { instructions: "第一版补充指令" } });
  expect(frozen!.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ taskId: a.id, inputHash: a.inputHash, expectedVersion: a.version, dispatchId: expect.any(String) }),
      expect.objectContaining({ taskId: b.id, inputHash: b.inputHash, expectedVersion: b.version, dispatchId: expect.any(String) }),
      expect.objectContaining({ taskId: future.id, state: "skipped", reason: "not-due" }),
    ]),
  );
  expect(first.scans.lastScheduledFor(rule.id)).toEqual(slot);
  const before = dispatchRecords(first.engine);
  expect(before).toHaveLength({ occurrence: 0, acceptance: 1, finish: 2 }[stage]);
  expect(frozen!.items.filter((item) => item.state === "accepted")).toHaveLength(stage === "finish" ? 2 : 0);
  fixture.now = at("01:16:00");
  await invoke(first.engine, "automations.update", { id: rule.id, expectedVersion: rule.version, patch: {}, body: "更新后的指令" });
  const added = await createTask(first.engine, "中断后新增");
  if (stage === "occurrence") {
    await invoke(first.engine, "tasks.update", { id: a.id, expectedVersion: a.version, patch: { body: "中断后修改任务输入" } });
  }
  await invoke(first.engine, "automations.setEnabled", { id: rule.id, enabled: false });
  await stop(first.engine);

  const reopened = await start(first.engine.vault.root);
  fixture.accept.mockClear();
  await reopened.scans.recover();
  const completed = reopened.scans.read(frozen!.id)!;
  expect(completed).toMatchObject({ ruleVersion: rule.version, rule: frozen!.rule, scheduledForUTC: slot.toISOString(), finishedAt: expect.any(String) });
  expect(completed.items.map(({ taskId, dispatchId }) => ({ taskId, dispatchId }))).toEqual(frozen!.items.map(({ taskId, dispatchId }) => ({ taskId, dispatchId })));
  expect(completed.items.some((item) => item.taskId === added.id)).toBe(false);
  expect(fixture.accept).toHaveBeenCalledTimes(stage === "finish" ? 0 : 2);
  const after = dispatchRecords(reopened.engine);
  expect(after).toHaveLength(stage === "occurrence" ? 1 : 2);
  if (stage === "occurrence") expect(completed.items.find((item) => item.taskId === a.id)).toMatchObject({ state: "skipped", reason: "stale_input" });
  for (const record of after) {
    const { receipt, snapshot } = record;
    expect(snapshot.source).toMatchObject({ ruleId: rule.id, ruleVersion: rule.version, instructions: "第一版补充指令", occurrenceId: completed.id });
    expect(completed.items.find((item) => item.taskId === receipt.taskId)).toMatchObject({ state: "accepted", dispatchId: receipt.dispatchId, eventId: receipt.eventId, runId: receipt.runId });
  }
  for (const record of before) expect(after).toEqual(expect.arrayContaining([expect.objectContaining({ receipt: expect.objectContaining({ eventId: record.receipt.eventId, runId: record.receipt.runId }) })]));
  expect(await reopened.scans.scheduled(rule.id, slot)).toEqual(completed);
});

test.each([false, true])("还原的扫描名单双份 Vault ID 策略下都仅作历史 (%s)", async (regenerateId) => {
  const first = await start();
  const rule = await createRule(first.engine, "归档中的扫描");
  const task = await createTask(first.engine, "尚未受理的任务");
  fixture.now = at("01:15:00");
  const slot = fixture.now;
  const write = VaultFiles.prototype.write;
  const interrupted = new Error("扫描写入后中断");
  const boundary = vi.spyOn(VaultFiles.prototype, "write").mockImplementation(async function (this: VaultFiles, rel, bytes, options) {
    const result = await write.call(this, rel, bytes, options);
    if (rel.startsWith(scanDir) && options?.expectedVersion === null) throw interrupted;
    return result;
  });
  try {
    await expect(first.scans.scheduled(rule.id, slot)).rejects.toBe(interrupted);
  } finally {
    boundary.mockRestore();
  }
  const [frozen] = first.scans.list();
  expect(frozen).toMatchObject({ finishedAt: null, items: [expect.objectContaining({ state: "pending", taskId: task.id })] });
  expect(fixture.accept).not.toHaveBeenCalled();

  const base = mkdtempSync(path.join(tmpdir(), "huhu-scan-restore-"));
  dirs.push(base);
  const archive = path.join(base, "frozen.zip");
  const restoredPath = path.join(base, "restored");
  await exportPackage(first.engine.vault.root, archive);
  importPackage(archive, restoredPath, { regenerateId });
  await stop(first.engine);
  const restored = await start(restoredPath);
  expect(restored.engine.vault.id === first.engine.vault.id).toBe(!regenerateId);
  expect(restored.scans.list()).toEqual([frozen]);
  expect(restored.scans.lastScheduledFor(rule.id)).toBeNull();
  await restored.scans.recover();
  expect(await restored.scans.scheduled(rule.id, slot)).toEqual(frozen);
  expect(restored.scans.read(frozen!.id)).toEqual(frozen);
  expect(dispatchRecords(restored.engine)).toHaveLength(0);
  expect(fixture.accept).not.toHaveBeenCalled();
});

test("停用期间不补扫，既受理任务可单独取消，启用后只补最近一轮且手动有独立身份", async () => {
  const { engine, scans } = await start();
  const rule = await createRule(engine, "可启停的扫描");
  const first = await createTask(engine, "首轮任务");
  fixture.now = at("01:15:00");
  const initial = await scans.scheduled(rule.id, fixture.now);
  const accepted = initial!.items.find((item) => item.taskId === first.id);
  expect(accepted?.state).toBe("accepted");
  fixture.now = at("01:20:00");
  await invoke(engine, "automations.setEnabled", { id: rule.id, enabled: false });
  fixture.now = at("02:00:00");
  expect(await scans.scheduled(rule.id, at("01:30:00"))).toBeNull();
  expect(scans.lastScheduledFor(rule.id)).toEqual(at("01:15:00"));
  expect(await invoke<DispatchReceipt>(engine, "tasks.dispatch.read", { taskId: first.id, dispatchId: accepted?.dispatchId })).toMatchObject({ state: "pending" });
  expect(await invoke<DispatchReceipt>(engine, "tasks.dispatch.cancel", { taskId: first.id, dispatchId: accepted?.dispatchId })).toMatchObject({ state: "cancelled" });

  fixture.now = at("02:01:00");
  await invoke(engine, "automations.setEnabled", { id: rule.id, enabled: true });
  expect(await scans.scheduled(rule.id, at("02:00:00"))).toBeNull();
  const task = await createTask(engine, "离线才可运行", undefined, at("03:03:00").toISOString());
  fixture.now = at("03:05:00");
  const current = await invoke<Rule>(engine, "automations.read", { id: rule.id });
  const callback = vi.fn(async (ruleId: string, scheduledFor: Date) => {
    await scans.scheduled(ruleId, scheduledFor);
  });
  const scheduler = new Scheduler({ activate: callback, lastActivatedFor: (id) => scans.lastScheduledFor(id), now: () => fixture.now });
  scheduler.sync([{ id: rule.id, ...trigger, ...current.data }]);
  scheduler.stop();
  await Promise.all(callback.mock.results.map((result) => result.value as Promise<void>));
  expect(callback).toHaveBeenCalledExactlyOnceWith(rule.id, at("03:00:00"), "schedule");
  expect(scans.list().find((row) => row.scheduledForUTC === at("03:00:00").toISOString())).toMatchObject({
    ruleVersion: current.version,
    items: expect.arrayContaining([expect.objectContaining({ taskId: task.id, state: "accepted" })]),
  });
  const [manual1, manual2] = await Promise.all([scans.invoke(rule.id), scans.invoke(rule.id)]);
  expect(manual1.id).not.toBe(manual2.id);
  expect([manual1.scheduledForUTC, manual2.scheduledForUTC]).toEqual([null, null]);
  expect(scans.lastScheduledFor(rule.id)).toEqual(at("03:00:00"));
  await invoke(engine, "automations.delete", { id: rule.id });
  expect(await scans.scheduled(rule.id, at("01:15:00"))).toEqual(initial);
});

async function toolsFor(entry: ExternalEntry, engine: RunningEngine) {
  const { token } = await invoke<{ token: string }>(engine, "gateway.tokens.create", { name: "automations-domain-fixture" });
  await invoke(engine, "gateway.mcp.update", { enabled: true, transport: "http" });
  return { external: await externalToolEntry(entry, engine, token), token };
}

test.each(externalEntries)("%s 逐项开放、撤销和重查任务跟进", async (entry) => {
  let { engine } = await start();
  const task = await createTask(engine, "跟进领域测试任务");
  const { external, token } = await toolsFor(entry, engine);
  const ids = { get: "automations.followUps.get", schedule: "automations.followUps.schedule", cancel: "automations.followUps.cancel" };
  const lookup = { taskId: task.id };
  const input = { ...lookup, expectedTaskVersion: task.version, scheduledFor: at("02:00:00").toISOString(), expectedRevision: null, intentId: randomUUID() };
  const denied = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
  expect(await external.list()).toEqual([]);
  expect(await external.call(ids.get, lookup)).toMatchObject(denied);
  expect(await external.call(ids.schedule, input)).toMatchObject(denied);
  expect(await external.call(ids.cancel, lookup)).toMatchObject(denied);

  await expose(engine, ids.get);
  expect(await external.list()).toEqual([ids.get]);
  const writes = vi.spyOn(VaultFiles.prototype, "write");
  try {
    expect(await external.call(ids.get, lookup)).toEqual({ ok: true, data: null });
    expect(await external.call(ids.get, { taskId: "task-wrong" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(writes).not.toHaveBeenCalled();
    expect(fixture.dispatch).not.toHaveBeenCalled();
  } finally {
    writes.mockRestore();
  }

  await expose(engine, ids.schedule);
  expect(await external.list()).toContain(ids.schedule);
  expect(await external.call(ids.schedule, { ...input, expectedTaskVersion: "stale" })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  const pending = () => external.call<{ revision: string }>(ids.schedule, input);
  const [first, repeat] = await Promise.all([pending(), pending()]);
  expect(first).toMatchObject({ ok: true, data: { state: "scheduled", scheduledFor: input.scheduledFor } });
  expect(repeat).toEqual(first);
  if (!first.ok) throw Error(first.error.code);
  expect(await pending()).toEqual(first);
  expect(await external.call(ids.schedule, { ...input, scheduledFor: at("03:00:00").toISOString() })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });

  await expose(engine, ids.cancel);
  const cancel = { ...lookup, expectedRevision: first.data.revision, intentId: randomUUID() };
  if (entry === "HTTP MCP") {
    const other = await externalToolEntry(entry, engine, token);
    expect(await other.call(ids.get, lookup)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await other.call(ids.cancel, cancel)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  }
  const calls = await Promise.all([external.call(ids.cancel, cancel), external.call(ids.cancel, cancel)]);
  expect(calls[0]).toMatchObject({ ok: true, data: { state: "cancelled" } });
  expect(calls[1]).toEqual(calls[0]);
  expect(await external.call(ids.cancel, { ...cancel, intentId: randomUUID() })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  expect(await external.call(ids.get, lookup)).toEqual(calls[0]);

  for (const [id, args] of [
    [ids.get, lookup],
    [ids.schedule, input],
    [ids.cancel, cancel],
  ] as const) {
    await invoke(engine, "gateway.update", { capability: id, exposed: false });
    expect(await external.list()).not.toContain(id);
    expect(await external.call(id, args)).toMatchObject(denied);
  }
  const root = engine.vault.root;
  await stop(engine);
  ({ engine } = await start(root));
  await expose(engine, ids.get, ids.schedule, ids.cancel);
  const reopened = await externalToolEntry(entry, engine, token);
  if (entry === "CLI") {
    expect(await reopened.call(ids.schedule, input)).toEqual(first);
    expect(await reopened.call(ids.cancel, cancel)).toEqual(calls[0]);
  } else {
    expect(await reopened.call(ids.schedule, input)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await reopened.call(ids.cancel, cancel)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  }
  expect(await call(engine, ids.get, lookup)).toEqual(calls[0]);
  expect(dispatchRecords(engine)).toEqual([]);
});

test.each(externalEntries)("%s 取消规则只能作用于指定本机运行和发生", async (entry) => {
  let { engine } = await start();
  const { external, token } = await toolsFor(entry, engine);
  const capability = "automations.cancel";
  const rule = await invoke<Rule>(engine, "automations.create", { title: "取消夹具", trigger, action: { kind: "terminal", shell: "powershell", command: "Write-Output fixture" } });
  const state = statSync(engine.vault.stateDir, { bigint: true });
  const owner = createHash("sha256")
    .update(JSON.stringify([engine.vault.id, machineId(), filesystemIdentity(state), String(state.birthtimeNs)]))
    .digest("hex");
  const makeRun = (activationId: string, terminalOwner = owner) =>
    fixture.repo!.create("automation-run", { actionKind: "terminal", ruleId: rule.id, trigger: "manual", state: "running", startedAt: at("01:00:00").toISOString(), activationId, terminalOwner }, "");
  const original = await makeRun("act-original");
  const replacement = await makeRun("act-replacement");
  const foreign = await makeRun("act-foreign", "0".repeat(64));
  const cancelRun = vi.spyOn(AutomationsService.prototype, "cancelRun").mockReturnValue(true);
  const input = { id: rule.id, runId: original.id, activationId: "act-original", intentId: randomUUID() };
  const denied = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
  expect(await external.list()).not.toContain(capability);
  expect(await external.call(capability, input)).toMatchObject(denied);
  await expose(engine, capability);
  expect(await external.list()).toContain(capability);
  expect(await external.call(capability, { id: rule.id })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  for (const candidate of [
    { ...input, id: "wrong-rule" },
    { ...input, runId: replacement.id },
    { ...input, runId: foreign.id, activationId: "act-foreign" },
  ]) {
    expect(await external.call(capability, candidate)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  }
  const results = await Promise.all([external.call(capability, input), external.call(capability, input)]);
  expect(results).toEqual([
    { ok: true, data: { cancelled: true } },
    { ok: true, data: { cancelled: true } },
  ]);
  expect(await external.call(capability, { ...input, runId: replacement.id, activationId: "act-replacement" })).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_MISMATCH" } });
  expect(cancelRun).toHaveBeenCalledExactlyOnceWith(original.id);

  const interrupted = { ...input, runId: replacement.id, activationId: "act-replacement", intentId: randomUUID() };
  const completion = vi.spyOn(OperationReceipts.prototype, "complete").mockImplementationOnce(() => {
    throw new Error("取消已发出，回执写入中断");
  });
  try {
    expect(await external.call(capability, interrupted)).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  } finally {
    completion.mockRestore();
  }
  const unknown = { ok: false, error: { code: "RUN_UNKNOWN", details: { outcome: "unknown", operationId: expect.any(String) } } };
  expect(await external.call(capability, interrupted)).toMatchObject(unknown);
  expect(cancelRun.mock.calls).toEqual([[original.id], [replacement.id]]);
  await invoke(engine, "gateway.update", { capability, exposed: false });
  expect(await external.list()).not.toContain(capability);
  expect(await external.call(capability, input)).toMatchObject(denied);
  const root = engine.vault.root;
  await stop(engine);
  ({ engine } = await start(root));
  await expose(engine, capability);
  if (entry === "CLI") {
    const reopened = await externalToolEntry(entry, engine, token);
    expect(await reopened.call(capability, input)).toEqual(results[0]);
    expect(await reopened.call(capability, interrupted)).toMatchObject(unknown);
  }
  expect(cancelRun.mock.calls).toEqual([[original.id], [replacement.id]]);
});

test.each(externalEntries)("%s 终端环境与批准能力逐项开放，本机批准不能自签", async (entry) => {
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-terminal-tools-"));
  dirs.push(dir);
  const desktopUserData = path.join(dir, "app");
  const vaultPath = path.join(dir, "vault");
  mkdirSync(desktopUserData);
  mkdirSync(vaultPath);
  const engine = await boot({ vaultPath, desktopUserData, create: true });
  engines.push(engine);
  const { external } = await toolsFor(entry, engine);
  const rule = await invoke<Rule>(engine, "automations.create", { title: "固定终端规则", trigger, action: { kind: "terminal", shell: "powershell", command: "Write-Output fixture" } });
  const ids = {
    get: "automations.terminal.environment.get",
    save: "automations.terminal.environment.save",
    review: "automations.terminal.approval.review",
    revoke: "automations.terminal.approval.revoke",
    approve: "automations.terminal.approval.approve",
  };
  const lookup = { ruleId: rule.id };
  const denied = { ok: false, error: { code: "CAPABILITY_NOT_EXPOSED" } };
  const name = "HUHU_RULE_SECRET_TEST";
  const unapproved = { ...lookup, expectedRevision: null, expectedRuleVersion: rule.version, names: [name], changes: [{ name, action: "keep" }], intentId: randomUUID() };
  let revoke = { ...lookup, expectedApprovalId: String(randomUUID()), expectedRuleVersion: rule.version, intentId: randomUUID() };

  expect(await external.list()).toEqual([]);
  for (const id of Object.values(ids)) expect(await external.call(id, lookup)).toMatchObject(denied);
  expect(
    await call(engine, "gateway.policy.preview", {
      changes: [
        { capability: ids.get, exposed: true },
        { capability: ids.approve, exposed: true },
      ],
    }),
  ).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  await expose(engine, ids.get, ids.save, ids.review, ids.revoke);
  expect(new Set(await external.list())).toEqual(new Set([ids.get, ids.save, ids.review, ids.revoke]));
  expect(await external.call(ids.get, lookup)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  expect(await external.call(ids.save, unapproved)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  expect(await external.call(ids.approve, lookup)).toMatchObject(denied);

  const reviewed = await external.call<{ ruleVersion: string; target: string; names: string[]; approvalId: string | null }>(ids.review, lookup);
  if (process.platform === "win32") {
    expect(reviewed).toMatchObject({ ok: true, data: { command: "Write-Output fixture", approvalId: null } });
    if (!reviewed.ok) throw Error(reviewed.error.code);
    const approval = { ...lookup, expectedRuleVersion: reviewed.data.ruleVersion, target: reviewed.data.target, names: [name], expectedApprovalId: null };
    expect(await external.call(ids.approve, approval)).toMatchObject(denied);
    const { approvalId } = await invoke<{ approvalId: string }>(engine, ids.approve, approval);
    const writes = vi.spyOn(VaultFiles.prototype, "write");
    try {
      expect(await external.call(ids.review, lookup)).toMatchObject({ ok: true, data: { approvalId, names: [name] } });
      expect(await external.call(ids.get, lookup)).toMatchObject({ ok: true, data: { names: [name], states: { [name]: "unconfigured" } } });
      expect(writes).not.toHaveBeenCalled();
    } finally {
      writes.mockRestore();
    }
    expect(await external.call(ids.save, { ...unapproved, names: ["HUHU_RULE_SECRET_UNAPPROVED"] })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    const saved = await Promise.all([external.call(ids.save, unapproved), external.call(ids.save, unapproved)]);
    expect(saved[0]).toMatchObject({ ok: true, data: { revision: expect.any(String), names: [name] } });
    expect(saved[1]).toEqual(saved[0]);
    revoke = { ...revoke, expectedApprovalId: approvalId };
    const revoked = await Promise.all([external.call(ids.revoke, revoke), external.call(ids.revoke, revoke)]);
    expect(revoked).toEqual([
      { ok: true, data: { revoked: true } },
      { ok: true, data: { revoked: true } },
    ]);
    expect(await external.call(ids.get, lookup)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  } else {
    expect(reviewed).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    expect(await external.call(ids.revoke, revoke)).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
  }

  for (const [id, input] of [
    [ids.get, lookup],
    [ids.save, unapproved],
    [ids.review, lookup],
    [ids.revoke, revoke],
  ] as const) {
    await invoke(engine, "gateway.update", { capability: id, exposed: false });
    expect(await external.list()).not.toContain(id);
    expect(await external.call(id, input)).toMatchObject(denied);
  }
});
