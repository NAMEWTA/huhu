import { _electron as electron, chromium, expect, test, type Browser, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CapabilityResult, ExecutionReceipt, ExecutionReceiptAck, TaskDto, TaskHistorySelection, TasksReceiptConsumption } from "../../../packages/contracts/src/index.js";
import { HerdrCore } from "../../../packages/herdr-client/src/herdr-core.js";
import { machineId } from "../../../packages/vault/src/vault.js";
import type { AgentSettingsFile } from "../../../plugins/agent-cli/src/shared/settings.js";
import { leaves, type WorkspaceView } from "../../../plugins/agent-cli/src/shared/workspace-layout.js";
import { startCodexResponsesFixture } from "../../../plugins/agent-cli/test/fixtures/codex-responses.js";
import { fixtureCoreCli } from "../../../plugins/agent-cli/test/fixtures/core-cli.js";
import type { TaskDispatchView } from "../../../plugins/tasks/src/engine/dispatch-store.js";
import type { TaskQuestionView } from "../../../plugins/tasks/src/engine/receipt-inbox.js";
import { candidatePackage, candidateEnvironment, confirmCandidate, disposeCandidate } from "../helpers/candidate-package.js";
import { openCandidateDesktop, withFixtureCleanup, withFixtureDeadline } from "../helpers/candidate-desktop.js";
import { createPersistentCodexSource, readCodexSource } from "../helpers/codex-persistent-source.js";
import { openApp, rmTree, root as desktopRoot } from "../helpers/launch.js";

test.afterAll(disposeCandidate);

type Rule = { id: string; version: string; data: { enabled: boolean; trigger: { preset: string; cron: string; zone: string } } };
type Activation = { activationId: string; ruleId: string; trigger: string; scheduledFor: string | null; summary?: { processed: number; skipped: number } };
type Call = <T>(capability: string, input?: unknown) => Promise<T>;

function caller(page: Page): Call {
  return async <T>(capability: string, input: unknown = {}) => {
    const response = (await page.evaluate(
      async ([cap, payload]) => {
        const endpoint = await window.huhuHost.engine();
        const request = await fetch(`${endpoint.baseUrl}/api/v1/call`, {
          method: "POST",
          headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json" },
          body: JSON.stringify({ capability: cap, input: payload, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
        });
        return request.json();
      },
      [capability, input] as const,
    )) as CapabilityResult<T>;
    if (!response.ok) throw new Error(`${capability}: ${response.error.code} ${response.error.message}`);
    return response.data;
  };
}

function schedule(secondsFromNow: number) {
  const at = new Date(Math.ceil((Date.now() + secondsFromNow * 1_000) / 1_000) * 1_000);
  const cron = `${at.getUTCSeconds()} ${at.getUTCMinutes()} ${at.getUTCHours()} * * *`;
  return { at, trigger: { preset: "custom", cron, zone: "UTC" } };
}

/** Put this isolated rule's midnight 30–90 seconds ahead using a valid fixed-offset zone. */
function nextDaySchedule() {
  const at = new Date(Math.ceil((Date.now() + 30_000) / 60_000) * 60_000);
  let offset = -(at.getUTCHours() * 60 + at.getUTCMinutes());
  if (offset < -720) offset += 1440;
  const zone = `${offset < 0 ? "-" : "+"}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`;
  const day = (instant: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
  return { at, day, trigger: { preset: "custom", cron: "0 0 0 * * *", zone } };
}

async function pauseRules(call: Call) {
  for (const rule of await call<Rule[]>("automations.list")) {
    if (rule.data.enabled) await call("automations.setEnabled", { id: rule.id, enabled: false, expectedVersion: rule.version });
  }
}

async function listDispatches(call: Call, taskId: string) {
  return call<TaskDispatchView[]>("tasks.dispatch.list", { taskId });
}

async function openTask(page: Page, title: string) {
  await page.getByRole("button", { name: "任务", exact: true }).first().click();
  await page.getByRole("button", { name: `打开任务 ${title}`, exact: true }).click();
  return page.getByTestId("task-detail");
}

async function openRun(page: Page, title: string) {
  const run = (await openTask(page, title)).getByTestId("managed-task-run");
  await expect(run).toHaveCount(1);
  const expand = run.getByRole("button", { name: "展开结果", exact: true });
  if (await expand.isVisible()) await expand.click();
  return run;
}

async function stopFixtureCore(coreBin: string, runtime: string, env: NodeJS.ProcessEnv, vaultId?: string) {
  let endpoints: string[];
  if (process.platform === "win32") {
    if (!vaultId) return;
    endpoints = [new HerdrCore({ bin: coreBin, vaultId, machineId: machineId(), runtimeDir: runtime }).endpoint];
  } else {
    endpoints = (await readdir(runtime)).filter((name) => /^huhu-[a-z0-9]{8}-[a-z0-9]{4}\.sock$/u.test(name)).map((name) => path.join(runtime, name));
  }
  for (const endpoint of endpoints) {
    const core = fixtureCoreCli(coreBin, { ...env, HC_SESSION: "huhu", HC_SOCKET: endpoint });
    expect(core("server", "stop").status).toBe(0);
  }
}

test("T7.2 Linux 实际定时与手动运行共享同一 Tasks 派遣，原目标不可用时可人工关闭", async ({ browserName }, testInfo) => {
  void browserName; // Electron tests still require Playwright’s fixture parameter.
  const { page, close, vault } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = caller(page);
    await pauseRules(call);
    const [space] = await call<{ id: string }[]>("agent.spaces.list");
    const { at, trigger } = schedule(18);
    const task = await call<TaskDto>("tasks.create", {
      title: "后台派遣的原任务",
      body: "只使用本任务固定的原会话。",
      type: "agent",
      tags: ["journey"],
      availableAt: new Date(at.getTime() - 2_000).toISOString(),
      execution: { spaceId: space!.id, target: { mode: "existing", sessionId: "fixture-closed-session" } },
    });
    const draft = await call<Rule>("automations.create", {
      title: "任务旅程定时规则",
      trigger,
      action: { kind: "agent", input: { source: "tasks", tags: ["journey"], maxConcurrent: 1 } },
    });
    const rule = await call<Rule>("automations.setEnabled", { id: draft.id, enabled: true, expectedVersion: draft.version });
    const manualIntent = { id: rule.id, expectedVersion: rule.version, intentId: randomUUID() };
    const early = await call<{ activationId: string; summary: { processed: number } }>("automations.runNow", manualIntent);
    expect(early.summary.processed).toBe(0);
    expect(await listDispatches(call, task.id)).toEqual([]);
    expect(await call("automations.runNow", manualIntent)).toEqual(early);

    const activations = () => call<Activation[]>("automations.activations");
    await expect.poll(async () => (await activations()).find((row) => row.ruleId === rule.id && row.scheduledFor === at.toISOString()), { timeout: 30_000 }).toMatchObject({ summary: { processed: 1 } });
    const scheduled = (await activations()).find((row) => row.ruleId === rule.id && row.scheduledFor === at.toISOString())!;
    const [dispatch] = await listDispatches(call, task.id);
    expect(await call("automations.activations.dispatches", { ruleId: rule.id, activationId: scheduled.activationId })).toEqual({
      dispatches: [{ taskId: task.id, dispatchId: dispatch!.dispatchId, runId: dispatch!.runId, state: "accepted" }],
    });
    const detail = await openTask(page, task.title);
    const managed = detail.getByTestId("managed-task-run");
    await expect(managed).toHaveAttribute("data-run-id", dispatch!.runId);
    await expect(managed).toContainText("原会话未连接或已不可用", { timeout: 12_000 });
    expect(await call("agent.sessions.list", { spaceId: space!.id })).toEqual([]);
    expect(await readdir(vault)).not.toContain("Task Runs");
    await detail.getByTestId("task-status").selectOption("completed");
    await expect.poll(async () => (await call<TaskDto>("tasks.read", { id: task.id })).status).toBe("completed");
    await testInfo.attach("dispatch-identities", { body: JSON.stringify({ occurrenceId: scheduled.activationId, taskId: task.id, dispatch }), contentType: "application/json" });
  } finally {
    await close();
  }
});

test("TW1 已受理的 Codex 失败显示在原任务且业务任务仍打开", async ({ browserName }) => {
  void browserName;
  test.setTimeout(120_000);
  const binary = process.env["HUHU_CODEX_DISPATCH_BIN"];
  test.skip(process.platform !== "linux" || !binary, "需要 Linux 上受控派遣白名单中的固定 Codex 二进制。");
  const provider = await realpath(binary!);
  const home = await realpath(await mkdtemp(path.join(tmpdir(), "huhu-task-terminal-")));
  const failure = "Huhu isolated provider failure";
  const responses = await startCodexResponsesFixture({ failedTurn: failure });
  let desktop: Awaited<ReturnType<typeof openApp>> | undefined;
  try {
    await writeFile(path.join(home, "config.toml"), responses.config, { mode: 0o600 });
    desktop = await openApp({ HUHU_CODEX_DISPATCH_HOME: home, HUHU_CODEX_DISPATCH_BIN: provider });
    const { page } = desktop;
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = caller(page);
    await pauseRules(call);
    const [space] = await call<{ id: string }[]>("agent.spaces.list");
    const { settings } = await call<{ settings: AgentSettingsFile }>("agent.settings.get");
    await call("agent.settings.update", {
      ...settings,
      expectedRevision: settings.revision,
      agents: { ...settings.agents, codex: { ...settings.agents["codex"], command: provider, env: { CODEX_HOME: home } } },
    });
    const task = await call<TaskDto>("tasks.create", { title: "保留失败轮次的任务", body: "Run one isolated turn.", type: "agent", execution: { spaceId: space!.id, provider: "codex" } });
    const detail = await openTask(page, task.title);
    await detail.getByRole("button", { name: "立即派遣", exact: true }).click();
    await expect.poll(() => listDispatches(call, task.id), { timeout: 20_000 }).toHaveLength(1);
    const [run] = await listDispatches(call, task.id);
    await expect.poll(() => call("tasks.runs", { id: task.id }), { timeout: 45_000 }).toMatchObject([{ id: run!.runId, state: "failed", finishedAt: expect.any(String) }]);
    const managed = detail.getByTestId("managed-task-run");
    await managed.getByRole("button", { name: "展开结果" }).click();
    await expect(managed.getByTestId("managed-run-result")).toContainText(failure);
    expect(await call<TaskDto>("tasks.read", { id: task.id })).toMatchObject({ status: "in_progress" });
    expect(responses.requests).toHaveLength(1);
  } finally {
    await withFixtureCleanup(async () => {}, [
      ["关闭桌面", () => desktop?.close()],
      ["停止本地模型夹具", () => responses.close()],
      ["清理受控资料目录", () => rmTree(home)],
    ]);
  }
});

test("C01 任务编辑器直接恢复所选的 Codex 持久历史并完成原生问答（TW3 Engine 重开与 Web）", async ({ browserName }, testInfo) => {
  void browserName;
  test.setTimeout(180_000);
  const binary = process.env["HUHU_CODEX_DISPATCH_BIN"];
  test.skip(process.platform !== "linux" || !binary, "需要 Linux 上受控派遣白名单中的固定 Codex 二进制。");
  const provider = await realpath(binary!);
  const fingerprint = createHash("sha256");
  for await (const chunk of createReadStream(provider)) fingerprint.update(chunk);
  expect(fingerprint.digest("hex")).toBe("880819aab735adcf16f36cd628940b9f1e652a36c01d10a5d32f83cc84902971");
  const privateHome = await realpath(await mkdtemp(path.join(tmpdir(), "huhu-task-history-")));
  const runtime = await realpath(await mkdtemp(path.join(tmpdir(), "huhu-c01-")));
  const coreBin = process.env["HUHU_HERDR_BIN"] ?? path.join(desktopRoot, "resources/herdr/linux-x64/herdr-core");
  const responses = await startCodexResponsesFixture({ seedReplies: ["SOURCE-A-RESULT", "SOURCE-B-RESULT"], result: "RESUME-B-RESULT" });
  const titleA = "OLDER-HISTORY-A";
  const titleB = "SELECTED-HISTORY-B";
  const taskMarker = "RESUME-B-INPUT";
  const fileIdentity = async (file: string) => {
    const stat = await lstat(file, { bigint: true });
    expect(stat.isFile()).toBe(true);
    return { device: String(stat.dev), inode: String(stat.ino), birthTime: String(stat.birthtimeNs) };
  };
  let desktop: Awaited<ReturnType<typeof openApp>> | undefined;
  let browser: Browser | undefined;
  await withFixtureCleanup(async () => {
    await writeFile(path.join(privateHome, "config.toml"), responses.config, { mode: 0o600 });
    desktop = await openApp({ HUHU_CODEX_DISPATCH_HOME: privateHome, HUHU_CODEX_DISPATCH_BIN: provider, HUHU_HERDR_BIN: coreBin, XDG_RUNTIME_DIR: runtime }, undefined, process.env["HUHU_C01_DESKTOP_APP"]);
    const { page } = desktop;
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = caller(page);
    await pauseRules(call);
    const [space] = await call<{ id: string; root: string }[]>("agent.spaces.list");
    const { settings } = await call<{ settings: AgentSettingsFile }>("agent.settings.get");
    await call("agent.settings.update", {
      ...settings,
      expectedRevision: settings.revision,
      agents: { ...settings.agents, codex: { ...settings.agents["codex"], command: provider, env: { CODEX_HOME: privateHome } } },
    });
    const cwd = path.join(space!.root, "original-workdir");
    await mkdir(cwd);
    const profile = { binary: provider, home: privateHome, cwd };
    // These calls resolve only after each real provider process has exited.
    const a = await createPersistentCodexSource(profile, titleA);
    const b = await createPersistentCodexSource(profile, titleB);
    expect(a.id).not.toBe(b.id);
    expect(a.file).not.toBe(b.file);
    const oldA = await readFile(a.file, "utf8");
    const oldB = await readFile(b.file, "utf8");
    const identityB = await fileIdentity(b.file);
    expect(oldA).toContain("SOURCE-A-RESULT");
    expect(oldB).toContain("SOURCE-B-RESULT");
    const sourceRequests = responses.requests.slice();
    expect(sourceRequests).toHaveLength(2);
    expect(sourceRequests.map(({ input }) => [titleA, titleB].filter((marker) => JSON.stringify(input).includes(marker)))).toEqual([[titleA], [titleB]]);

    const previousEndpoint = await page.evaluate(async () => (await window.huhuHost.engine()).baseUrl);
    await withFixtureDeadline(22_000, () => page.evaluate(() => window.huhuHost.vault.close()));
    expect(await page.evaluate(() => window.huhuHost.vault.state())).toMatchObject({ path: null });
    await expect.poll(() => fetch(`${previousEndpoint}/healthz`, { signal: AbortSignal.timeout(1000) }).then(() => true, () => false)).toBe(false);
    expect(await withFixtureDeadline(25_000, () => page.evaluate((vault) => window.huhuHost.vault.open(vault), desktop!.vault))).toMatchObject({ ok: true });
    await page.reload({ timeout: 20_000 });
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    expect(await call("agent.sessions.list", { spaceId: space!.id })).toEqual([]);
    expect(responses.requests).toHaveLength(sourceRequests.length);

    const targets = () => call<{ mode: string; nativeSessionId?: string; history?: TaskHistorySelection; available: boolean; reason?: string }[]>("tasks.dispatch.targets", { spaceId: space!.id });
    const sourceA = (await targets()).find((entry) => entry.mode === "resume" && entry.nativeSessionId === a.id);
    expect(sourceA).toMatchObject({ available: true, history: { historyRevision: expect.any(String) } });

    await page.getByRole("button", { name: "任务", exact: true }).first().click();
    await page.getByTestId("task-new").click();
    const editor = page.getByTestId("task-editor");
    const title = "从运行历史 B 派遣";
    await editor.getByLabel("任务名称").fill(title);
    await editor.getByTestId("task-body").locator(".ProseMirror").fill(`Ask the fixture question for ${taskMarker} and report the result.`);
    await editor.getByTestId("task-type").selectOption("agent");
    await editor.getByRole("combobox", { name: "工作目录（Space）" }).selectOption(space!.id);
    const select = editor.getByRole("combobox", { name: "会话目标" });
    const selected = select.locator("option").filter({ hasText: "SELECTED-HISTORY-B" });
    await expect(select.locator("option").filter({ hasText: "OLDER-HISTORY-A" })).toBeEnabled();
    await expect(selected).toBeEnabled();
    await select.selectOption((await selected.getAttribute("value")) ?? "");
    await editor.getByTestId("task-save").click();
    await expect(editor).toBeHidden();
    const tasks = await call<TaskDto[]>("tasks.list", { category: "all" });
    const task = tasks.find((row) => row.title === title)!;
    expect(task.execution).toMatchObject({ provider: "codex", spaceId: space!.id, target: { mode: "resume", nativeSessionId: b.id, history: { spaceId: space!.id } } });
    const changedA = oldA + "\n";
    await writeFile(a.file, changedA);
    await expect(call("tasks.create", {
      title: "过期物理历史选择", body: "This must not start a turn.", type: "agent",
      execution: { spaceId: space!.id, provider: "codex", target: { mode: "resume", nativeSessionId: a.id, history: sourceA!.history } },
    })).rejects.toThrow("INVALID_INPUT");
    expect(await call("agent.sessions.list", { spaceId: space!.id })).toEqual([]);
    expect(responses.requests).toHaveLength(sourceRequests.length);

    // Add newer rollouts outside the frozen target's Space after its selection.
    const other = path.join(privateHome, "other-workdir");
    const unrelated = path.join(privateHome, "sessions", "2099", "01", "01");
    await mkdir(other);
    await mkdir(unrelated, { recursive: true });
    for (let i = 0; i < 2001; i++) {
      const id = randomUUID();
      await writeFile(path.join(unrelated, `rollout-2099-01-01T00-00-00-${id}.jsonl`),
        JSON.stringify({ type: "session_meta", payload: { id, cwd: other } }) + "\n");
    }
    const detail = await openTask(page, title);
    const [submitted] = await Promise.all([
      page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/api/v1/call") && request.postDataJSON()?.capability === "tasks.dispatch"),
      detail.getByRole("button", { name: "立即派遣", exact: true }).click(),
    ]);
    const questions = () => call<ReturnType<typeof TaskQuestionView.parse>[]>("tasks.questions.list", { taskId: task.id });
    await expect.poll(questions, { timeout: 45_000 }).toMatchObject([{ mode: "native_deferred", status: "awaiting" }]);
    const [run] = await listDispatches(call, task.id);
    const sessions = await call<{ id: string; nativeSessionId: string; cwd: string }[]>("agent.sessions.list", { spaceId: space!.id });
    expect(sessions).toHaveLength(1);
    const [session] = sessions;
    expect(session).toMatchObject({ id: run!.session!.id, nativeSessionId: b.id, cwd });
    await expect.poll(async () => (await targets()).find((entry) => entry.mode === "resume" && entry.nativeSessionId === b.id)).toMatchObject({ available: false, reason: "input_owned" });
    expect(await questions()).toMatchObject([{ runId: run!.runId, sessionId: session!.id, status: "awaiting" }]);
    // The active provider has appended to the file. Replaying the accepted dispatch still returns the original run.
    expect(await call("tasks.dispatch", submitted.postDataJSON().input)).toMatchObject({ dispatchId: run!.dispatchId, runId: run!.runId });
    expect(await listDispatches(call, task.id)).toHaveLength(1);
    expect(responses.requests).toHaveLength(sourceRequests.length + 1);
    const [question] = await questions();
    await call("tasks.comments.add", { taskId: task.id, body: "Circle" });
    await expect(call("tasks.reply", {
      taskId: task.id, runId: run!.runId, sessionId: session!.id, requestId: question!.requestId,
      requestVersion: question!.requestVersion + 1, replyId: randomUUID(), answer: "Circle",
    })).rejects.toThrow("VERSION_CONFLICT");
    expect(responses.requests).toHaveLength(sourceRequests.length + 1);
    expect(await call("web.share.start", { mode: "local", port: 0 })).toMatchObject({ state: "running" });
    const { links } = await call<{ links: string[] }>("web.invitations.create");
    browser = await chromium.launch();
    const web = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    await web.goto(links[0]!);
    const managed = await openRun(web, title);
    await managed.getByRole("radio", { name: "Circle" }).check();
    await managed.getByRole("button", { name: "发送回答" }).click();
    await expect
      .poll(async () => (await call<TaskDto>("tasks.read", { id: task.id })).comments.filter(({ event }) => event === "result"), { timeout: 45_000 })
      .toMatchObject([{ run: run!.runId, session: session!.id, body: responses.result }]);
    expect((await call<TaskDto>("tasks.read", { id: task.id })).comments.filter(({ event }) => event === "answer")).toMatchObject([
      { source: "human", author: "Web", run: run!.runId, session: session!.id, ask: question!.requestId, body: "Circle" },
    ]);
    const taskRequests = responses.requests.slice(sourceRequests.length);
    expect(taskRequests).toHaveLength(2);
    expect(JSON.stringify(taskRequests[0]!.input)).toContain(taskMarker);
    expect(JSON.stringify(taskRequests[0]!.input)).toContain(titleB);
    expect(JSON.stringify(taskRequests.map(({ input }) => input))).not.toContain(titleA);
    const answers = taskRequests.flatMap(({ input }) => input.filter(({ type, call_id }) => type === "function_call_output" && call_id === responses.callId));
    expect(answers).toHaveLength(1);
    expect(JSON.stringify(answers[0]!.output)).toContain("Circle");
    expect(await readFile(a.file, "utf8")).toBe(changedA);
    expect(await fileIdentity(b.file)).toEqual(identityB);
    const appended = await readFile(b.file, "utf8");
    expect(appended.startsWith(oldB)).toBe(true);
    expect(appended.slice(oldB.length)).toContain(taskMarker);
    const after = await readCodexSource(profile, b.id);
    expect(after).toMatchObject({ id: b.id, cwd });
    expect(after.path).toBeTruthy();
    expect(await realpath(after.path!)).toBe(b.file);
    expect(after.turns).toHaveLength(2);
    expect(after.turns[0]).toMatchObject({ id: b.turnId, status: "completed" });
    expect(after.turns[1]).toMatchObject({ status: "completed" });
    expect(after.turns[1]!.id).not.toBe(b.turnId);
    expect(responses.requests).toHaveLength(4);
    await testInfo.attach("original-rollout-binding", {
      body: JSON.stringify({ taskId: task.id, runId: run!.runId, sessionId: session!.id, cwd, sources: { a, b }, identityB, resumedTurn: after.turns[1]!.id, sourceRequests: sourceRequests.length, taskRequests: taskRequests.length }),
      contentType: "application/json",
    });
  }, [
    ["关闭独立浏览器", () => withFixtureDeadline(10_000, async () => browser?.close())],
    ["停止桌面引擎", () => withFixtureDeadline(22_000, async () => desktop?.page.evaluate(() => window.huhuHost.vault.close()))],
    ["回收独立 Core", () => stopFixtureCore(coreBin, runtime, process.env)],
    ["关闭桌面", async () => {
      if (!desktop) return;
      try {
        await withFixtureDeadline(12_000, desktop.close);
      } catch (error) {
        desktop.app.process().kill("SIGKILL");
        throw error;
      }
    }],
    ["停止本地模型夹具", () => withFixtureDeadline(5_000, responses.close)],
    ["清理受控资料和运行目录", () => { rmTree(privateHome); rmTree(runtime); }],
  ]);
});

test("T4.1 与 T5.5 在工作台处理 DST 回拨与缺口、保留启用状态并预览三次新触发", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = caller(page);
    await call("settings.update", { patch: { dateTime: { zone: "America/New_York" } } });
    // The backdoor caller bypasses the workbench cache invalidation, so reload to read the new zone.
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const task = await call<TaskDto>("tasks.create", { title: "回拨与截止", due: "2099-12-01" });
    const detail = await openTask(page, task.title);
    await detail.getByTestId("detail-edit").click();
    const editor = page.getByTestId("task-editor");
    const availableAt = editor.getByTestId("task-available-at");
    await availableAt.fill("2026-03-08T02:30");
    await editor.getByTestId("task-save").click();
    await expect(editor.getByRole("alert")).toContainText("此时区没有这个时间");
    await availableAt.fill("2026-11-01T01:30");
    const choices = editor.getByRole("group", { name: "回拨时间的 UTC 偏移" });
    await expect(choices.getByRole("radio")).toHaveCount(2);
    await choices.getByRole("radio", { name: /GMT-05:00/ }).check();
    await editor.getByTestId("task-save").click();
    await expect(editor).toBeHidden();
    await expect(detail.locator('time[datetime="2026-11-01T06:30:00.000Z"]')).toBeVisible();
    expect(await call("tasks.read", { id: task.id })).toMatchObject({ due: "2099-12-01", availableAt: "2026-11-01T06:30:00.000Z" });
    await detail.getByTestId("detail-edit").click();
    await availableAt.fill("");
    await editor.getByTestId("task-save").click();
    await expect(editor).toBeHidden();
    expect(await call("tasks.read", { id: task.id })).toMatchObject({ due: "2099-12-01", availableAt: null });

    const rule = await call<Rule>("automations.create", {
      title: "保持启用的规则",
      trigger: { preset: "custom", cron: "0 0 1 1 *", zone: "UTC" },
      action: { kind: "reminder", mode: "notification", text: "一次提醒", taskId: null },
    });
    await call("automations.setEnabled", { id: rule.id, enabled: true, expectedVersion: rule.version });
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByRole("button", { name: "打开自动化 保持启用的规则" }).click();
    await page.getByTestId("rule-edit").click();
    const ruleEditor = page.getByTestId("rule-editor");
    await expect(ruleEditor).toContainText("保存后保持启用");
    await ruleEditor.getByLabel("时区", { exact: true }).fill("invalid/zone");
    await expect(ruleEditor.getByTestId("rule-trigger-error")).toBeVisible();
    await ruleEditor.getByLabel("时区", { exact: true }).fill("Asia/Taipei");
    const previewTimes = ruleEditor.getByTestId("rule-upcoming").locator("time");
    await expect(previewTimes).toHaveCount(3);
    const proposed = await previewTimes.evaluateAll((elements) => elements.map((element) => element.getAttribute("datetime")));
    await ruleEditor.getByTestId("rule-save").click();
    await expect(ruleEditor).toBeHidden();
    const saved = await call<Rule>("automations.read", { id: rule.id });
    expect(saved.data).toMatchObject({ enabled: true, trigger: { zone: "Asia/Taipei" } });
    expect(await call("automations.preview", { id: rule.id, expectedVersion: saved.version })).toMatchObject({ next: proposed });

    await page.getByTestId("rule-edit").click();
    await ruleEditor.getByLabel("规则名称").fill("编辑器里的旧草稿");
    const concurrent = await call<Rule>("automations.update", { id: rule.id, expectedVersion: saved.version, patch: { title: "其他窗口已保存" } });
    await expect(page.getByTestId("rule-detail").locator("h2")).toHaveText("其他窗口已保存");
    await ruleEditor.getByTestId("rule-save").click();
    const dialog = page.getByTestId("rule-dialog");
    await expect(dialog.getByRole("alert")).toContainText("文件已被修改");
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await call("automations.read", { id: rule.id })).toMatchObject({ version: concurrent.version, data: { enabled: true, title: "其他窗口已保存" } });
  } finally {
    await close();
  }
});

test("T7.2 候选安装包：后台到期、原生问题同会话继续、一次结果与人工完成", async ({ browserName }, testInfo) => {
  void browserName; // Electron tests still require Playwright’s fixture parameter.
  test.setTimeout(300_000);
  const packageArtifact = process.env["HUHU_TASK_JOURNEY_PACKAGE_ARTIFACT"];
  const expectedSha = process.env["HUHU_TASK_JOURNEY_PACKAGE_SHA"];
  const provider = process.env["HUHU_CODEX_DISPATCH_BIN"];
  test.skip(process.env["HUHU_TASK_JOURNEY_ACCEPTANCE"] !== "1", "需 W8.3 候选包及 SHA、受控派遣白名单中的真实 Codex 构建，并显式设置 HUHU_TASK_JOURNEY_ACCEPTANCE=1。");
  expect(packageArtifact).toBeTruthy();
  expect(expectedSha).toBeTruthy();
  expect(provider).toBeTruthy();
  const { executablePath, sha } = await candidatePackage();
  const sandbox = await mkdtemp(path.join(tmpdir(), "huhu-task-journey-"));
  const vault = path.join(sandbox, "vault");
  const userData = path.join(sandbox, "desktop");
  const home = path.join(sandbox, "home");
  const providerHome = path.join(sandbox, "provider");
  const runtime = path.join(sandbox, "runtime");
  const gate = path.join(sandbox, "receipt-gate");
  const responses = await startCodexResponsesFixture({ seedReply: "READY", result: "TASK-JOURNEY-RESULT You chose Circle." });
  const env: Record<string, string> = {
    ...candidateEnvironment(),
    HUHU_VAULT: vault,
    HOME: home,
    USERPROFILE: home,
    XDG_RUNTIME_DIR: runtime,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_STATE_HOME: path.join(home, ".state"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    CODEX_HOME: path.join(home, ".codex"),
    CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
    PI_CODING_AGENT_DIR: path.join(home, ".pi"),
    PI_CODING_AGENT_SESSION_DIR: path.join(home, ".pi", "sessions"),
    HUHU_CODEX_DISPATCH_HOME: providerHome,
    HUHU_E2E_TASK_RECEIPT_ACK_GATE: gate,
  };
  for (const key of ["HUHU_HERDR_BIN", "HC_TERMINAL_ID", "HC_TERMINAL_SOCKET", "HC_SOCKET", "HC_SESSION", "HC_SCOPE"]) delete env[key];
  let coreBin: string | undefined;
  let vaultId: string | undefined;
  try {
    for (const dir of [vault, userData, home, providerHome, runtime, gate]) await mkdir(dir, { mode: 0o700 });
    await writeFile(path.join(providerHome, "config.toml"), responses.config, { mode: 0o600 });
    const app = await electron.launch({ executablePath, args: ["--no-sandbox", `--user-data-dir=${userData}`], env });
    try {
      coreBin = path.join(await app.evaluate(() => process.resourcesPath), "herdr", `${process.platform}-${process.arch}`, process.platform === "win32" ? "herdr-core.exe" : "herdr-core");
      const page = await app.firstWindow();
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 25_000 });
      const candidateIdentity = await confirmCandidate(app, page);
      const call = caller(page);
      ({ id: vaultId } = await call<{ id: string }>("vault.info"));
      await pauseRules(call);
      const [space] = await call<{ id: string }[]>("agent.spaces.list");
      const seed = await call<TaskDto>("tasks.create", {
        title: "原会话夹具",
        body: "Reply only with READY. Do not run tools.",
        type: "agent",
        execution: { spaceId: space!.id, provider: "codex" },
      });
      const seedDetail = await openTask(page, seed.title);
      await seedDetail.getByRole("button", { name: "立即派遣", exact: true }).click();
      await expect.poll(() => listDispatches(call, seed.id)).toHaveLength(1);
      const initial = (await listDispatches(call, seed.id))[0]!;
      await expect.poll(async () => (await call<TaskDto>("tasks.read", { id: seed.id })).comments.some(({ run, event }) => run === initial.runId && event === "result"), { timeout: 40_000 }).toBe(true);
      const [seedRun] = await listDispatches(call, seed.id);
      const session = seedRun!.session!;
      expect(session).toBeTruthy();

      const { at, day, trigger } = nextDaySchedule();
      const task = await call<TaskDto>("tasks.create", {
        title: "原生问答任务旅程",
        body: "在回复之前必须使用原生 request_user_input 请求选择，只提供 Circle 和 Square 两个选项。用户选定后，以 TASK-JOURNEY-RESULT 开头给出唯一的最终结果。",
        type: "agent",
        tags: ["native-journey"],
        availableAt: at.toISOString(),
        execution: { spaceId: space!.id, target: { mode: "existing", sessionId: session.id } },
      });
      const createdDay = day(task.createdAt);
      const scheduledDay = day(at.toISOString());
      expect(createdDay).toBe(day(new Date(at.getTime() - 86_400_000).toISOString()));
      expect(createdDay).not.toBe(scheduledDay);
      const draft = await call<Rule>("automations.create", {
        title: "后台原生问答",
        trigger,
        action: { kind: "agent", input: { source: "tasks", tags: ["native-journey"], maxConcurrent: 1 } },
      });
      const rule = await call<Rule>("automations.setEnabled", { id: draft.id, enabled: true, expectedVersion: draft.version });
      expect(Date.now()).toBeLessThan(at.getTime());
      expect(await listDispatches(call, task.id)).toEqual([]);
      expect(responses.requests).toHaveLength(1);
      const detail = await openTask(page, task.title);
      const questions = () => call<ReturnType<typeof TaskQuestionView.parse>[]>("tasks.questions.list", { taskId: task.id });
      await expect.poll(questions, { timeout: 120_000 }).toMatchObject([{ mode: "native_deferred", status: "awaiting", sessionId: session.id }]);
      const [question] = await questions();
      const [run] = await listDispatches(call, task.id);
      expect(run).toMatchObject({ runId: question!.runId, attempt: 1, session });
      const managed = detail.getByTestId("managed-task-run");
      await managed.getByRole("button", { name: "展开结果" }).click();
      await managed.getByRole("radio", { name: "Circle" }).check();
      await writeFile(path.join(gate, "dispatch-id"), run!.dispatchId);
      await writeFile(path.join(gate, "before-consume"), "");
      await writeFile(path.join(gate, "drop-once"), "");
      await managed.getByRole("button", { name: "发送回答" }).click();
      await expect.poll(() => readFile(path.join(gate, "pending.json"), "utf8").catch(() => ""), { timeout: 45_000 }).toMatch(/^\{.+\}$/);
      const pending = JSON.parse(await readFile(path.join(gate, "pending.json"), "utf8")) as ExecutionReceipt;
      expect(pending).toMatchObject({ kind: "result", execution: { dispatchId: run!.dispatchId, runId: run!.runId } });
      const agentRoot = path.join(userData, "agent-cli", "codex-dispatch");
      const [localVault] = await readdir(agentRoot);
      const agentReceipts = path.join(agentRoot, localVault!, "agent-receipts");
      const agentRows = await Promise.all((await readdir(agentReceipts)).filter((file) => file.endsWith(".json")).map(async (file) => JSON.parse(await readFile(path.join(agentReceipts, file), "utf8")) as { receipt: ExecutionReceipt }));
      expect(agentRows).toContainEqual(expect.objectContaining({ receipt: pending }));
      const receiptDir = path.join(vault, ".huhu", "tasks", "receipts");
      const matchingInbox = async () => {
        const rows = await Promise.all((await readdir(receiptDir)).filter((file) => file.endsWith(".json")).map(async (file) => JSON.parse(await readFile(path.join(receiptDir, file), "utf8")) as { receipt: ExecutionReceipt }));
        return rows.filter(({ receipt }) => receipt.receiptId === pending.receiptId);
      };
      expect(await matchingInbox()).toEqual([]);
      expect(await call("plugins.setEnabled", { id: "tasks", enabled: false })).toMatchObject({ state: "disabled" });
      await writeFile(path.join(gate, "consume-release"), "");
      expect(await matchingInbox()).toEqual([]);
      expect(await call("plugins.setEnabled", { id: "tasks", enabled: true })).toMatchObject({ state: "active" });
      await expect.poll(() => readFile(path.join(gate, "held.json"), "utf8").catch(() => ""), { timeout: 20_000 }).toMatch(/^\{.+\}$/);
      const held = JSON.parse(await readFile(path.join(gate, "held.json"), "utf8")) as ExecutionReceiptAck;
      expect(held.receipt.receiptId).toBe(pending.receiptId);
      await expect.poll(matchingInbox).toHaveLength(1);
      const timeline = async () => (await call<TaskDto>("tasks.read", { id: task.id })).comments;
      await expect.poll(async () => (await timeline()).filter(({ event }) => event === "result"), { timeout: 45_000 }).toMatchObject([{ run: run!.runId, session: session.id, body: expect.stringContaining("TASK-JOURNEY-RESULT") }]);
      const result = (await timeline()).find(({ event }) => event === "result")!;
      expect(result.body).toBe(responses.result);
      expect(responses.requests).toHaveLength(3);
      const answers = responses.requests[2]!.input.filter(({ type, call_id }) => type === "function_call_output" && call_id === responses.callId);
      expect(answers).toHaveLength(1);
      expect(answers[0]!.output).toContain("Circle");
      const occurrences = await call<Activation[]>("automations.activations");
      const occurrence = occurrences.find(({ ruleId, scheduledFor }) => ruleId === rule.id && scheduledFor === at.toISOString());
      expect(occurrence?.summary?.processed).toBe(1);
      expect(occurrence?.trigger).toBe("schedule");
      expect(occurrences.filter(({ ruleId }) => ruleId === rule.id)).toHaveLength(1);
      expect(day((await call<TaskDto>("tasks.read", { id: task.id })).createdAt)).toBe(createdDay);
      expect(day(at.toISOString())).toBe(scheduledDay);
      const readResultReceipt = async () => {
        const receipts = await Promise.all(
          (await readdir(receiptDir))
            .filter((file) => /^[a-f0-9]{64}\.json$/.test(file))
            .map(
              async (file) =>
                JSON.parse(await readFile(path.join(receiptDir, file), "utf8")) as {
                  receipt: { receiptId: string; kind: string; execution: { runId: string; dispatchId: string; attempt: number } };
                  consumption: TasksReceiptConsumption;
                  status: string;
                },
            ),
        );
        const matches = receipts.filter(({ receipt }) => receipt.execution.runId === run!.runId && receipt.kind === "result");
        expect(matches).toHaveLength(1);
        expect(matches[0]!.receipt).toEqual(pending);
        return matches[0];
      };
      await expect.poll(readResultReceipt).toMatchObject({ receipt: { execution: { runId: run!.runId, dispatchId: run!.dispatchId, attempt: 1 } }, consumption: { delivery: { messageId: result.id } }, status: "delivered" });
      const saved = (await readResultReceipt())!;
      await expect
        .poll(
          async () => {
            const acks = await Promise.all((await readdir(agentReceipts)).filter((file) => file.endsWith(".tasks-ack")).map(async (file) => JSON.parse(await readFile(path.join(agentReceipts, file), "utf8")) as ExecutionReceiptAck));
            return acks.filter(({ receipt }) => receipt.receiptId === saved.receipt.receiptId);
          },
          { timeout: 20_000 },
        )
        .toEqual([held]);
      expect(held).toEqual({ stage: "tasks_consumed", receipt: saved.consumption.delivery.receipt });
      expect((await call<TaskDto>("tasks.read", { id: task.id })).status).toBe("in_progress");
      const restoredDetail = await openTask(page, task.title);
      const visibleResult = restoredDetail.getByTestId("task-timeline").locator(`[data-comment-id="${result.id}"]`);
      await expect(visibleResult).toHaveCount(1);
      await expect(visibleResult).toContainText(responses.result);
      expect((await timeline()).filter(({ event }) => event === "result")).toHaveLength(1);
      await restoredDetail.getByTestId("task-status").selectOption("completed");
      await expect.poll(async () => (await call<TaskDto>("tasks.read", { id: task.id })).status).toBe("completed");
      await testInfo.attach("T7.2 原生任务回执身份", {
        contentType: "application/json",
        body: JSON.stringify({
          sha,
          candidateIdentity,
          receiptRecovery: { pending, firstDroppedAck: held, phases: ["agent-saved", "tasks-empty", "tasks-disabled", "tasks-enabled", "ack-dropped-once", "matching-ack-saved"] },
          calendar: { zone: trigger.zone, createdAt: task.createdAt, createdDay, scheduledFor: at.toISOString(), scheduledDay },
          occurrenceId: occurrence!.activationId,
          taskId: task.id,
          runId: run!.runId,
          attempt: run!.attempt,
          sessionId: session.id,
          requestId: question!.requestId,
          receiptId: saved.receipt.receiptId,
          messageId: result.id,
        }),
      });
      const templateResponses = await startCodexResponsesFixture({ seedReply: "TEMPLATE-JOURNEY-RESULT" });
      try {
        await writeFile(path.join(providerHome, "config.toml"), templateResponses.config, { mode: 0o600 });
        const { settings } = await call<{ settings: AgentSettingsFile }>("agent.settings.get");
        await call("agent.settings.update", {
          expectedRevision: settings.revision,
          defaultAgent: settings.defaultAgent,
          ...(settings.waitingTasks === undefined ? {} : { waitingTasks: settings.waitingTasks }),
          agents: { ...settings.agents, codex: { ...settings.agents["codex"], command: provider!, enabled: true } },
        });
        const available = await call<{ id: string; installed: boolean; headless: boolean; path?: string }[]>("agent.catalog.refresh");
        expect(available.find(({ id }) => id === "codex")).toMatchObject({ installed: true, headless: true, path: provider });
        const template = await call<Rule>("automations.create", {
          title: "候选包新模板",
          body: "只回复 TEMPLATE-JOURNEY-RESULT",
          trigger: { preset: "custom", cron: "0 0 0 * * *", zone: "UTC" },
          action: { kind: "agent", input: { source: "prompt", provider: "codex", spaceId: space!.id } },
        });
        const intent = { id: template.id, expectedVersion: template.version, intentId: randomUUID() };
        const invocation = await call<{ activationId: string }>("automations.runNow", intent);
        expect(await call("automations.runNow", intent)).toEqual(invocation);
        const linked = await call<{ dispatches: { taskId: string; runId: string }[] }>("automations.activations.dispatches", { ruleId: template.id, activationId: invocation.activationId });
        if (linked.dispatches.length !== 1) {
          const catalog = await call<{ id: string; installed: boolean; headless: boolean; path?: string }[]>("agent.catalog.detect");
          const detected = catalog.find(({ id }) => id === "codex");
          const occurrence = JSON.parse(await readFile(path.join(vault, ".huhu", "automations", "task-scan-occurrences", `${invocation.activationId}.json`), "utf8")) as {
            id: string;
            ruleId: string;
            finishedAt?: string;
            template?: { issue?: string };
            items: { state: string; reason?: string }[];
          };
          const evidence = {
            invocation,
            detector: detected && { installed: detected.installed, headless: detected.headless, pinnedPath: detected.path === provider },
            occurrence: { id: occurrence.id, ruleId: occurrence.ruleId, finishedAt: occurrence.finishedAt, issue: occurrence.template?.issue, items: occurrence.items.map(({ state, reason }) => ({ state, reason })) },
          };
          await testInfo.attach("模板派遣未受理原因", { contentType: "application/json", body: JSON.stringify(evidence) });
          console.log("template-admission", JSON.stringify(evidence));
        }
        expect(linked.dispatches).toHaveLength(1);
        const created = linked.dispatches[0]!;
        expect(created.taskId).not.toBe(task.id);
        const templateTask = () => call<TaskDto>("tasks.read", { id: created.taskId });
        await expect.poll(async () => (await templateTask()).comments.filter(({ event }) => event === "result"), { timeout: 45_000 }).toMatchObject([{ run: created.runId, body: "TEMPLATE-JOURNEY-RESULT" }]);
        expect(await templateTask()).toMatchObject({ title: "候选包新模板", body: "只回复 TEMPLATE-JOURNEY-RESULT", origin: { kind: "automation", ruleId: template.id, activationId: invocation.activationId } });
        expect(templateResponses.requests).toHaveLength(1);
        const templateDetail = await openTask(page, "候选包新模板");
        await expect(templateDetail.getByTestId("task-timeline")).toContainText("TEMPLATE-JOURNEY-RESULT");
        await testInfo.attach("T7.2 人工立即派与新模板", {
          contentType: "application/json",
          body: JSON.stringify({
            candidateIdentity,
            manual: { taskId: seed.id, runId: initial.runId },
            template: { ruleId: template.id, activationId: invocation.activationId, ...created },
            nativeTemplateInputs: templateResponses.requests.length,
          }),
        });
      } finally {
        await templateResponses.close();
      }
    } finally {
      await app.close();
    }
  } finally {
    try {
      if (coreBin) await stopFixtureCore(coreBin, runtime, env, vaultId);
    } finally {
      await responses.close();
      rmTree(sandbox);
    }
  }
});

test("W8.2/W8.3 候选安装包：跨 Space 分栏、原生会话重连、消费 ACK 重交与历史恢复", async ({ browserName }, testInfo) => {
  void browserName; // Electron tests still require Playwright’s fixture parameter.
  test.setTimeout(240_000);
  const artifact = process.env["HUHU_TASK_JOURNEY_PACKAGE_ARTIFACT"];
  const expectedSha = process.env["HUHU_TASK_JOURNEY_PACKAGE_SHA"];
  const provider = process.env["HUHU_CODEX_DISPATCH_BIN"];
  test.skip(process.env["HUHU_AGENT_WORKSPACE_ACCEPTANCE"] !== "1", "需 Linux x64、W8.3 候选包和 SHA、受控的 Codex ELF，并显式设置 HUHU_AGENT_WORKSPACE_ACCEPTANCE=1。Windows 实机走独立的原生 Pi 用例。");
  expect(artifact).toBeTruthy();
  expect(expectedSha).toBeTruthy();
  expect(provider).toBeTruthy();
  const { executablePath, sha } = await candidatePackage();

  const sandbox = await mkdtemp(path.join(tmpdir(), "huhu-w8-workspace-"));
  const vault = path.join(sandbox, "vault");
  const other = path.join(sandbox, "other-space");
  const userData = path.join(sandbox, "desktop");
  const fixtureHome = path.join(sandbox, "home");
  const providerHome = path.join(sandbox, "provider");
  const histories = path.join(sandbox, "pi-sessions");
  const gate = path.join(sandbox, "ack-gate");
  const runtime = path.join(sandbox, "runtime");
  const responses = await startCodexResponsesFixture();
  const env: Record<string, string> = {
    ...candidateEnvironment(),
    HUHU_VAULT: vault,
    HOME: fixtureHome,
    USERPROFILE: fixtureHome,
    XDG_CONFIG_HOME: path.join(fixtureHome, ".config"),
    XDG_DATA_HOME: path.join(fixtureHome, ".local/share"),
    XDG_STATE_HOME: path.join(fixtureHome, ".state"),
    XDG_CACHE_HOME: path.join(fixtureHome, ".cache"),
    XDG_RUNTIME_DIR: runtime,
    CODEX_HOME: path.join(fixtureHome, ".codex"),
    CLAUDE_CONFIG_DIR: path.join(fixtureHome, ".claude"),
    PI_CODING_AGENT_DIR: path.join(fixtureHome, ".pi"),
    PI_CODING_AGENT_SESSION_DIR: histories,
    HUHU_CODEX_DISPATCH_HOME: providerHome,
    HUHU_E2E_TASK_RECEIPT_ACK_GATE: gate,
  };
  delete env["HUHU_HERDR_BIN"];
  delete env["HC_TERMINAL_ID"];
  type Space = { id: string; name: string };
  type Session = { id: string; terminalId: string; nativeSessionId?: string; state: string };
  let app: ElectronApplication | undefined;
  let coreBin: string | undefined;
  const launch = async () => {
    app = await electron.launch({ executablePath, args: ["--no-sandbox", `--user-data-dir=${userData}`], env });
    coreBin = path.join(await app.evaluate(() => process.resourcesPath), "herdr", "linux-x64", "herdr-core");
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 25_000 });
    await confirmCandidate(app, page);
    await page.setViewportSize({ width: 1600, height: 1050 });
    return { page, call: caller(page) };
  };
  try {
    for (const dir of [vault, other, userData, fixtureHome, providerHome, histories, gate, runtime]) await mkdir(dir, { mode: 0o700 });
    await writeFile(path.join(providerHome, "config.toml"), responses.config, { mode: 0o600 });
    const source = path.join(histories, "original.jsonl");
    const original =
      [
        { type: "session", version: 3, id: "fixture-w8-pi-history", cwd: vault },
        { type: "message", id: "prompt", parentId: null, message: { role: "user", content: "W8 原历史" } },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n";
    await writeFile(source, original);
    const pi = path.join(sandbox, "pi-fixture");
    const piLaunch = path.join(sandbox, "pi-launch.txt");
    await writeFile(
      pi,
      `#!/bin/sh
case "$1" in
  --version) printf 'Pi history fixture 1\\n';;
  --help) printf '  --session FILE\\n  --fork FILE\\n  --session-id ID\\n';;
  --session)
    printf '%s\\n' "$PWD" "$2" > "${piLaunch}"
    while IFS= read -r line; do :; done;;
  *) exit 2;;
esac
`,
      { mode: 0o700 },
    );
    execFileSync("git", ["-C", vault, "init", "-q"], { env });
    await writeFile(path.join(vault, "w8-review.md"), "合成工作区改动\n");

    let { page, call } = await launch();
    const catalog = await call<{ name: string; exposed: boolean; exposable: boolean }[]>("capabilities.list", { includeInactive: true });
    expect(catalog.every(({ exposed }) => !exposed)).toBe(true);
    expect(catalog.find(({ name }) => name === "tasks.receipts.consume")).toMatchObject({ exposable: false });
    const catalogPolicy = (exposed: boolean) => call("gateway.update", { capability: "agent.catalog.detect", exposed });
    expect(await catalogPolicy(true)).toMatchObject({ exposed: true });
    const [homeSpace] = await call<Space[]>("agent.spaces.list");
    const settings = await call<{ settings: { revision: number } }>("agent.settings.get");
    await call("agent.settings.update", { expectedRevision: settings.settings.revision, defaultAgent: null, agents: { claude: { enabled: false }, pi: { command: pi, args: [] } } });
    const sessions = (spaceId: string) => call<Session[]>("agent.sessions.list", { spaceId });
    const workspace = (spaceId: string) => call<WorkspaceView>("agent.workspace.get", { spaceId });
    const agent = () => page.getByRole("button", { name: "Agent CLI", exact: true }).first().click();
    const pane = (id: string) => page.getByTestId("workspace-pane").and(page.locator(`[data-session-id="${id}"]`));
    const startShell = async (trigger: ReturnType<Page["getByTestId"]>, count: number) => {
      await trigger.click();
      await page.getByTestId("launch-shell").click();
      await expect(page.getByTestId("terminal-view")).toHaveCount(count, { timeout: 15_000 });
    };
    await agent();
    await startShell(page.getByTestId("workspace-pane-launch"), 1);
    const [anchor] = await sessions(homeSpace!.id);
    for (const [index, direction] of ["right", "up", "down", "left"].entries()) {
      await startShell(pane(anchor!.id).getByTestId(`workspace-split-${direction}`), index + 2);
    }
    const originalLayout = await workspace(homeSpace!.id);
    await page.getByTestId("space-new").click();
    await page.getByLabel("Space 名称").fill("W8 第二工作区");
    await page.getByLabel("工作目录", { exact: true }).fill(other);
    await page.getByTestId("space-save").click();
    await expect(page.getByTestId("agent-space-item").filter({ hasText: "W8 第二工作区" })).toHaveAttribute("aria-pressed", "true");
    await startShell(page.getByTestId("workspace-pane-launch"), 1);
    const otherSpace = (await call<Space[]>("agent.spaces.list")).find(({ name }) => name === "W8 第二工作区")!;
    const otherLayout = await workspace(otherSpace.id);
    expect((await workspace(homeSpace!.id)).layout).toEqual(originalLayout.layout);

    const title = "W8 单次受控派遣";
    const task = await call<TaskDto>("tasks.create", { title, body: "Use the fixture shape question.", type: "agent", execution: { spaceId: homeSpace!.id, provider: "codex" } });
    const taskDetail = await openTask(page, title);
    await taskDetail.getByRole("button", { name: "立即派遣", exact: true }).click();
    await expect.poll(() => listDispatches(call, task.id)).toMatchObject([{ runId: expect.any(String), attempt: 1 }]);
    const run = (await listDispatches(call, task.id))[0]!;
    const { dispatchId } = run;
    await writeFile(path.join(gate, "dispatch-id"), dispatchId);
    const questions = () => call<ReturnType<typeof TaskQuestionView.parse>[]>("tasks.questions.list", { taskId: task.id });
    await expect.poll(questions, { timeout: 40_000 }).toMatchObject([{ runId: run.runId, status: "awaiting", mode: "native_deferred", options: ["Circle", "Square"] }]);
    const [question] = await questions();
    const session = (await sessions(homeSpace!.id)).find(({ id }) => id === question!.sessionId)!;
    expect((await listDispatches(call, task.id))[0]).toMatchObject({ runId: run.runId, dispatchId, attempt: 1, session: { id: session.id, spaceId: homeSpace!.id } });
    const detail = await openRun(page, title);
    await detail.getByRole("button", { name: "定位原会话" }).click();
    await page.getByTestId("workspace-session-preview").getByRole("button", { name: "放入当前标签", exact: true }).click();
    await expect(pane(session.id).getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 15_000 });
    const claimed = await workspace(homeSpace!.id);
    expect(claimed.layout.tabs.map(({ id }) => id)).toEqual(originalLayout.layout.tabs.map(({ id }) => id));
    const [originTab] = originalLayout.layout.tabs;
    const currentLeaves = leaves(claimed.layout.tabs[0]!.pane);
    expect(currentLeaves).toEqual(expect.arrayContaining([...leaves(originTab!.pane), expect.objectContaining({ sessionId: session.id })]));
    expect(currentLeaves).toHaveLength(leaves(originTab!.pane).length + 1);
    await expect(pane(anchor!.id).getByTestId("terminal-view")).toHaveAttribute("data-state", "open");
    await pane(session.id).getByTestId("agent-review-toggle").click();
    await expect(page.getByTestId("review-panel").getByTestId("review-file").filter({ hasText: "w8-review.md" })).toBeVisible();

    await app!.close();
    app = undefined;
    ({ page, call } = await launch());
    const reopened = await openRun(page, title);
    await expect.poll(() => sessions(homeSpace!.id)).toContainEqual(expect.objectContaining({ id: session.id, terminalId: session.terminalId, state: "running" }));
    expect(await questions()).toMatchObject([{ requestId: question!.requestId, sessionId: session.id, runId: run.runId, status: "awaiting" }]);
    expect(await catalogPolicy(false)).toMatchObject({ exposed: false });
    await reopened.getByRole("button", { name: "定位原会话" }).click();
    await expect(pane(session.id)).toHaveAttribute("data-active", "true");
    await expect(pane(session.id).getByTestId("terminal-view")).toHaveAttribute("data-state", "open", { timeout: 15_000 });
    expect((await workspace(otherSpace.id)).layout).toEqual(otherLayout.layout);
    const managed = await openRun(page, title);
    await managed.getByRole("radio", { name: "Circle" }).check();
    await managed.getByRole("button", { name: "发送回答" }).click();

    const heldFile = path.join(gate, "held.json");
    await expect.poll(() => readFile(heldFile, "utf8").catch(() => ""), { timeout: 35_000 }).toMatch(/^\{.+\}$/);
    const held = JSON.parse(await readFile(heldFile, "utf8")) as ExecutionReceiptAck;
    expect(held).toMatchObject({ stage: "tasks_consumed", receipt: { execution: { dispatchId, runId: run.runId, attempt: 1, sessionBinding: { sessionId: session.id, coreAddress: session.terminalId } } } });
    const [localVault] = await readdir(path.join(userData, "agent-cli", "codex-dispatch"));
    const agentRoot = path.join(userData, "agent-cli", "codex-dispatch", localVault!);
    const books = path.join(agentRoot, "agent-receipts");
    const saved = await Promise.all(
      (await readdir(books))
        .filter((file) => /^[a-f0-9]{64}\.json$/.test(file))
        .map(async (file) => ({ file, ...(JSON.parse(await readFile(path.join(books, file), "utf8")) as { receipt: ExecutionReceipt; identity: ExecutionReceiptAck["receipt"] }) })),
    );
    const result = saved.find(({ receipt }) => receipt.receiptId === held.receipt.receiptId)!;
    expect(result).toMatchObject({ receipt: { kind: "result" }, identity: held.receipt });
    const helperAckName = `agent-ack-${result.receipt.receiptId}.json`;
    const nativeDirs = (await readdir(agentRoot)).filter((file) => /^[a-f0-9]{64}$/.test(file));
    const helperAcks = await Promise.all(nativeDirs.map(async (dir) => ((await readdir(path.join(agentRoot, dir))).includes(helperAckName) ? path.join(agentRoot, dir, helperAckName) : null)));
    const helperAckFile = helperAcks.find((file) => file !== null)!;
    expect(JSON.parse(await readFile(helperAckFile, "utf8"))).toMatchObject({ data: { stage: "agent_received", receipt: held.receipt }, mac: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const missingAck = `${result.file}.tasks-ack`;
    expect(await readdir(books)).not.toContain(missingAck);

    const inbox = path.join(vault, ".huhu", "tasks", "receipts");
    const deliveries = async () => {
      const rows = await Promise.all(
        (await readdir(inbox))
          .filter((file) => /^[a-f0-9]{64}\.json$/.test(file))
          .map(
            async (file) =>
              JSON.parse(await readFile(path.join(inbox, file), "utf8")) as {
                receipt: ExecutionReceipt;
                consumption: TasksReceiptConsumption;
                status: string;
              },
          ),
      );
      return rows.filter(({ receipt }) => receipt.receiptId === result.receipt.receiptId);
    };
    const [durable] = await deliveries();
    expect(durable).toMatchObject({ receipt: result.receipt, consumption: { delivery: { receipt: held.receipt } } });
    expect(await call("plugins.setEnabled", { id: "tasks", enabled: false })).toMatchObject({ state: "disabled" });
    await writeFile(path.join(gate, "release"), "");
    expect(await readdir(books)).not.toContain(missingAck);
    expect(await call("plugins.setEnabled", { id: "tasks", enabled: true })).toMatchObject({ state: "active" });
    await expect.poll(() => readdir(books), { timeout: 20_000 }).toContain(missingAck);
    expect(JSON.parse(await readFile(path.join(books, missingAck), "utf8"))).toEqual(held);
    await expect.poll(deliveries).toEqual([{ ...durable, status: "delivered" }]);
    const comments = async () => (await call<TaskDto>("tasks.read", { id: task.id })).comments.filter(({ event }) => event === "result");
    await expect.poll(comments).toMatchObject([{ id: durable!.consumption.delivery.messageId, run: run.runId, session: session.id, body: expect.stringContaining(responses.result) }]);
    expect(responses.requests).toHaveLength(2);
    expect(responses.requests[1]?.input).toContainEqual(expect.objectContaining({ type: "function_call_output", call_id: responses.callId, output: expect.stringContaining("Circle") }));

    const currentTask = await openRun(page, title);
    await currentTask.getByRole("button", { name: "定位原会话" }).click();
    await pane(session.id).getByTestId("workspace-pane-close").click();
    await page.getByRole("button", { name: "终止并关闭" }).click();
    await expect(pane(session.id)).toHaveCount(0);
    await expect.poll(async () => (await sessions(homeSpace!.id)).filter(({ id, state }) => id === session.id && state === "running")).toEqual([]);
    const finalTask = await openTask(page, title);
    await finalTask.getByTestId("task-status").selectOption("completed");
    await expect.poll(async () => (await call<TaskDto>("tasks.read", { id: task.id })).status).toBe("completed");
    expect((await listDispatches(call, task.id))[0]).toMatchObject({ runId: run.runId, dispatchId, attempt: 1 });

    await agent();
    await page.getByTestId("agent-space-item").filter({ hasText: homeSpace!.name }).click();
    const toggleHistory = page.getByTestId("agent-history-toggle");
    if (!(await page.getByTestId("agent-history").isVisible())) await toggleHistory.click();
    const history = page.getByTestId("history-item").filter({ hasText: "W8 原历史" });
    await history.getByTestId("history-resume").click();
    await page.getByTestId("history-launch").getByRole("button", { name: "恢复会话" }).click();
    await expect.poll(() => sessions(homeSpace!.id)).toContainEqual(expect.objectContaining({ nativeSessionId: "fixture-w8-pi-history", state: "running" }));
    await expect.poll(() => readFile(piLaunch, "utf8").catch(() => "")).toBe(`${vault}\n${source}\n`);
    expect(await readFile(source, "utf8")).toBe(original);
    const next = await call<TaskDto>("tasks.create", { title: "W8 已关闭目标", type: "agent", body: "只用原会话", execution: { spaceId: homeSpace!.id, target: { mode: "existing", sessionId: session.id } } });
    await call("tasks.dispatch", { taskId: next.id, dispatchId: randomUUID(), expectedVersion: next.version, inputRevision: next.inputRevision, inputHash: next.inputHash });
    await expect.poll(() => listDispatches(call, next.id)).toMatchObject([{ state: "blocked", reason: "target_unavailable" }]);
    await expect.poll(comments).toHaveLength(1);
    const core = await call<{ version: string }>("agent.core.status");
    const codexVersion = execFileSync(provider!, ["--version"], { env, encoding: "utf8" }).trim();
    await testInfo.attach("W8 原生会话与两段 ACK", {
      contentType: "application/json",
      body: JSON.stringify({
        candidateIdentity: await confirmCandidate(app!, page),
        sha,
        platform: process.platform,
        arch: process.arch,
        coreVersion: core.version,
        codexVersion,
        dispatchId,
        runId: run.runId,
        session,
        receipt: held.receipt,
        messageId: durable!.consumption.delivery.messageId,
      }),
    });
  } finally {
    try {
      await app?.close();
    } finally {
      try {
        if (coreBin) await stopFixtureCore(coreBin, runtime, env);
      } finally {
        await responses.close();
        rmTree(sandbox);
      }
    }
  }
});

test("W8.1 候选安装包：Vault 数据包恢复分栏与未绑定终端，保持零隐式启动", async ({ browserName }, testInfo) => {
  void browserName;
  test.skip(process.env["HUHU_AGENT_WORKSPACE_ACCEPTANCE"] !== "1", "通过隔离候选安装包环境运行");
  test.setTimeout(150_000);
  const sandbox = await mkdtemp(path.join(tmpdir(), "huhu-w8-package-"));
  const external = path.join(sandbox, "external");
  const zipPath = path.join(sandbox, "workspace.zip");
  const targetDir = path.join(sandbox, "restored");
  let source: Awaited<ReturnType<typeof openCandidateDesktop>> | undefined;
  let target: Awaited<ReturnType<typeof openCandidateDesktop>> | undefined;
  await withFixtureCleanup(async () => {
    await mkdir(external);
    source = await openCandidateDesktop({ identityAttachment: "workspace-package-source", disableProviderDetection: true });
    const page = source.page;
    const call = caller(page);
    const spaces = await call<{ id: string; root: string; name: string }[]>("agent.spaces.list");
    const space = spaces.find(({ root }) => root === source?.vault)!;
    expect(space).toBeDefined();
    const outside = await call<{ id: string }>("agent.spaces.save", { root: external, name: "原外部目录" });
    await page.getByRole("button", { name: "Agent CLI", exact: true }).first().click();
    await page
      .getByTestId("agent-space-item")
      .filter({ has: page.getByText(space.name, { exact: true }) })
      .click();
    await page.getByTestId("workspace-pane-launch").click();
    await page.getByTestId("launch-shell").click();
    await expect(page.getByTestId("terminal-view")).toHaveCount(1, { timeout: 15_000 });
    await page.getByTestId("workspace-split-right").click();
    await page.getByTestId("launch-shell").click();
    await expect(page.getByTestId("terminal-view")).toHaveCount(2, { timeout: 15_000 });
    const original = await call<WorkspaceView>("agent.workspace.get", { spaceId: space.id });
    expect(original.layout.tabs[0]?.pane).toMatchObject({ kind: "split", axis: "columns" });
    const before = leaves(original.layout.tabs[0]!.pane);
    expect(before.every(({ sessionId }) => !!sessionId)).toBe(true);
    const exported = await call<{ sha256: string; files: number }>("vault.exportPackage", { dest: zipPath });
    await mkdir(targetDir);
    target = await openCandidateDesktop({ identityAttachment: "workspace-package-target", vault: targetDir, importPackage: zipPath });
    const sourceIdentity = await source.confirmEngine();
    expect((await target.confirmEngine()).vaultId).not.toBe(sourceIdentity.vaultId);
    expect(await call<WorkspaceView>("agent.workspace.get", { spaceId: space.id })).toEqual(original);
    const restoredPage = target.page;
    const read = caller(restoredPage);
    await restoredPage.getByRole("button", { name: "Agent CLI", exact: true }).first().click();
    await restoredPage
      .getByTestId("agent-space-item")
      .filter({ has: restoredPage.getByText(space.name, { exact: true }) })
      .click();
    await expect(restoredPage.getByTestId("workspace-pane").filter({ hasText: "未绑定终端" })).toHaveCount(2);
    await expect(restoredPage.getByTestId("terminal-view")).toHaveCount(0);
    const restored = await read<WorkspaceView>("agent.workspace.get", { spaceId: space.id });
    expect(restored).toMatchObject({ version: 0, layout: { tabs: [{ pane: { kind: "split", axis: "columns", ratio: 0.5 } }] } });
    expect(leaves(restored.layout.tabs[0]!.pane)).toMatchObject([
      { sessionId: null, unbound: true },
      { sessionId: null, unbound: true },
    ]);
    expect(await read("agent.sessions.list", { spaceId: space.id })).toEqual([]);
    await restoredPage.getByTestId("agent-space-item").filter({ hasText: "原外部目录" }).click();
    expect(await read("agent.spaces.list")).toContainEqual(expect.objectContaining({ id: outside.id, root: "", binding: { status: "needs-binding", reason: "external" } }));
    await expect(restoredPage.getByText("请在此 Vault 中重新选择外部工作目录。", { exact: false })).toBeVisible();
    await expect(restoredPage.getByTestId("workspace-pane-launch")).toBeDisabled();
    expect(await read("agent.core.status")).toMatchObject({ state: "idle" });
    await expect(lstat(path.join(targetDir, ".huhu/runtime", machineId(), "herdr"))).rejects.toMatchObject({ code: "ENOENT" });
    await testInfo.attach("workspace-package-restore", { contentType: "application/json", body: JSON.stringify({ exported, original: { version: original.version, panes: before.length }, restored }) });
  }, [
    ["关闭恢复目标", () => target?.close()],
    ["关闭源 Vault", () => source?.close()],
    ["删除独立数据包目录", () => rmTree(sandbox)],
  ]);
});
