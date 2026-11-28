import { _electron as electron, chromium, expect, test, type Browser, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CapabilityResult, ExecutionReceipt, ExecutionReceiptAck, TaskDto, TaskHistorySelection, TaskMcpTool, McpCatalogView, McpSource, TasksReceiptConsumption } from "../../../packages/contracts/src/index.js";
import { initializeMcp, mcpRequest, mcpRpc, openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { localUpstream } from "../../../packages/kernel/test/fixtures/mcp-upstream.js";
import { HerdrCore } from "../../../packages/herdr-client/src/herdr-core.js";
import { machineId } from "../../../packages/vault/src/vault.js";
import type { AgentSettingsFile } from "../../../plugins/agent-cli/src/shared/settings.js";
import { leaves, type WorkspaceView } from "../../../plugins/agent-cli/src/shared/workspace-layout.js";
import { huhuMcpStep, huhuMcpTools, startCodexResponsesFixture } from "../../../plugins/agent-cli/test/fixtures/codex-responses.js";
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

test("T7.2 AU13 Linux 定时与手动运行共享 Tasks 派遣，待处理可定位受阻子运行", async ({ browserName }, testInfo) => {
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
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByRole("button", { name: "激活记录", exact: true }).click();
    await page.getByRole("combobox", { name: /^发生状态/ }).selectOption("attention");
    const attention = page.getByTestId("activation-row").filter({ hasText: "任务旅程定时规则" });
    await expect(attention).toContainText("子运行待处理");
    await attention.getByRole("button", { name: "任务旅程定时规则" }).click();
    await expect(page.getByTestId("occurrence-child-run")).toContainText("无法派遣");
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

test("C01 任务编辑器直接恢复所选的 Codex 持久历史并完成原生问答（TW3 Engine 重开与 Web） · 两个获邀页面共用设备名额与原生等待", async ({ browserName }, testInfo) => {
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
    const configHome = path.join(runtime, "config");
    await mkdir(path.join(configHome, "huhu"), { recursive: true });
    await writeFile(path.join(configHome, "huhu", "dispatch-limits.json"), JSON.stringify({ active: 1, retained: 2 }));
    desktop = await openApp({ HUHU_CODEX_DISPATCH_HOME: privateHome, HUHU_CODEX_DISPATCH_BIN: provider, HUHU_HERDR_BIN: coreBin, XDG_RUNTIME_DIR: runtime, XDG_CONFIG_HOME: configHome }, undefined, process.env["HUHU_C01_DESKTOP_APP"]);
    const { app, page } = desktop;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(960, 600));
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
    await expect
      .poll(() =>
        fetch(`${previousEndpoint}/healthz`, { signal: AbortSignal.timeout(1000) }).then(
          () => true,
          () => false,
        ),
      )
      .toBe(false);
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
    await expect(
      call("tasks.create", {
        title: "过期物理历史选择",
        body: "This must not start a turn.",
        type: "agent",
        execution: { spaceId: space!.id, provider: "codex", target: { mode: "resume", nativeSessionId: a.id, history: sourceA!.history } },
      }),
    ).rejects.toThrow("INVALID_INPUT");
    expect(await call("agent.sessions.list", { spaceId: space!.id })).toEqual([]);
    expect(responses.requests).toHaveLength(sourceRequests.length);

    // Add newer rollouts outside the frozen target's Space after its selection.
    const other = path.join(privateHome, "other-workdir");
    const unrelated = path.join(privateHome, "sessions", "2099", "01", "01");
    await mkdir(other);
    await mkdir(unrelated, { recursive: true });
    for (let i = 0; i < 2001; i++) {
      const id = randomUUID();
      await writeFile(path.join(unrelated, `rollout-2099-01-01T00-00-00-${id}.jsonl`), JSON.stringify({ type: "session_meta", payload: { id, cwd: other } }) + "\n");
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
    await withFixtureDeadline(22_000, () => page.evaluate(() => window.huhuHost.vault.close()));
    expect(await withFixtureDeadline(25_000, () => page.evaluate((vault) => window.huhuHost.vault.open(vault), desktop!.vault))).toMatchObject({ ok: true });
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
    await expect.poll(questions, { timeout: 25_000 }).toMatchObject([{ runId: run!.runId, sessionId: session!.id, status: "awaiting" }]);
    await expect.poll(async () => (await targets()).find((entry) => entry.mode === "resume" && entry.nativeSessionId === b.id)).toMatchObject({ available: false, reason: "input_owned" });
    // The active provider has appended to the file. Replaying the accepted dispatch still returns the original run.
    expect(await call("tasks.dispatch", submitted.postDataJSON().input)).toMatchObject({ dispatchId: run!.dispatchId, runId: run!.runId });
    expect(await listDispatches(call, task.id)).toHaveLength(1);
    expect(responses.requests).toHaveLength(sourceRequests.length + 1);
    const [question] = await questions();
    await call("tasks.comments.add", { taskId: task.id, body: "Circle" });
    await expect(
      call("tasks.reply", {
        taskId: task.id,
        runId: run!.runId,
        sessionId: session!.id,
        requestId: question!.requestId,
        requestVersion: question!.requestVersion + 1,
        replyId: randomUUID(),
        answer: "Circle",
      }),
    ).rejects.toThrow("VERSION_CONFLICT");
    expect(responses.requests).toHaveLength(sourceRequests.length + 1);
    expect(await call("web.share.start", { mode: "local", port: 0 })).toMatchObject({ state: "running" });
    const { links } = await call<{ links: string[] }>("web.invitations.create");
    const peerInvitation = await call<{ links: string[] }>("web.invitations.create");
    browser = await chromium.launch();
    const web = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    const peer = await browser.newPage({ viewport: { width: 800, height: 700 } });
    await web.goto(links[0]!);
    await peer.goto(peerInvitation.links[0]!);
    const managed = await openRun(web, title);
    const peerRun = await openRun(peer, title);
    const queued = await call<TaskDto>("tasks.create", {
      title: "等待同一原会话的任务",
      body: "This input should stay queued.",
      type: "agent",
      execution: { spaceId: space!.id, target: { mode: "existing", sessionId: session!.id } },
    });
    const queuedDispatch = await call<TaskDispatchView>("tasks.dispatch", {
      taskId: queued.id,
      dispatchId: randomUUID(),
      expectedVersion: queued.version,
      inputRevision: queued.inputRevision,
      inputHash: queued.inputHash,
    });
    await expect.poll(() => listDispatches(call, queued.id)).toMatchObject([{ reason: "waiting_resource" }]);
    await openTask(page, title);
    for (const viewer of [page, web, peer]) {
      const resources = viewer.getByRole("region", { name: "本机派遣资源" });
      const value = (label: string) =>
        resources
          .locator("dl > div")
          .filter({ has: viewer.getByText(label, { exact: true }) })
          .locator("dd");
      await expect(value("本机活动名额")).toHaveText("0 / 1");
      await expect(value("本机保留名额")).toHaveText("1 / 2");
      await expect(value("排队积压")).toHaveText("1");
      await expect(value("最早排队").locator("time")).toHaveAttribute("datetime", queuedDispatch.acceptedAt);
      await expect(value("等待原生回答")).toHaveText("1");
      await expect(value("最早等待原生回答").locator("time")).toBeVisible();
    }
    const desktopResources = detail.getByRole("region", { name: "本机派遣资源" });
    const refreshResources = desktopResources.getByRole("button", { name: "刷新资源" });
    await refreshResources.click();
    await expect(refreshResources).toBeFocused();
    await expect(refreshResources).toHaveAttribute("aria-disabled", "false");
    await Promise.all([page.waitForRequest((request) => request.url().endsWith("/api/v1/call") && request.postDataJSON()?.capability === "tasks.dispatch.resources"), refreshResources.press("Enter")]);
    expect(await desktopResources.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(responses.requests).toHaveLength(sourceRequests.length + 1);
    await call("tasks.dispatch.cancel", { taskId: queued.id, dispatchId: queuedDispatch.dispatchId });
    await expect.poll(() => listDispatches(call, queued.id)).toMatchObject([{ state: "cancelled" }]);
    await managed.getByRole("radio", { name: "Circle" }).check();
    await managed.getByRole("button", { name: "发送回答" }).click();
    await expect
      .poll(async () => (await call<TaskDto>("tasks.read", { id: task.id })).comments.filter(({ event }) => event === "result"), { timeout: 45_000 })
      .toMatchObject([{ run: run!.runId, session: session!.id, body: responses.result }]);
    expect((await call<TaskDto>("tasks.read", { id: task.id })).comments.filter(({ event }) => event === "answer")).toMatchObject([
      { source: "human", author: "Web", run: run!.runId, session: session!.id, ask: question!.requestId, body: "Circle" },
    ]);
    await expect(peerRun.getByText("已送达", { exact: true })).toBeVisible();
    await expect(managed.getByText("已送达", { exact: true })).toBeVisible();
    await peer.reload();
    const reopenedRun = await openRun(peer, title);
    await expect(reopenedRun.getByTestId("task-run-question").getByText("已送达", { exact: true })).toBeVisible();
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
    [
      "关闭桌面",
      async () => {
        if (!desktop) return;
        try {
          await withFixtureDeadline(12_000, desktop.close);
        } catch (error) {
          desktop.app.process().kill("SIGKILL");
          throw error;
        }
      },
    ],
    ["停止本地模型夹具", () => withFixtureDeadline(5_000, responses.close)],
    [
      "清理受控资料和运行目录",
      () => {
        rmTree(privateHome);
        rmTree(runtime);
      },
    ],
  ]);
});

test("TW6 历史消失后从所选摘要与产物显式开始新轮次", async () => {
  test.setTimeout(120_000);
  const binary = process.env["HUHU_CODEX_DISPATCH_BIN"];
  test.skip(process.platform !== "linux" || !binary, "需要 Linux 上受控派遣白名单中的固定 Codex 二进制。");
  const provider = await realpath(binary!);
  const home = await realpath(await mkdtemp(path.join(tmpdir(), "huhu-task-new-round-")));
  const responses = await startCodexResponsesFixture({ result: "NEW-ROUND-FINISHED" });
  let desktop: Awaited<ReturnType<typeof openApp>> | undefined;
  await withFixtureCleanup(async () => {
    await writeFile(path.join(home, "config.toml"), responses.config, { mode: 0o600 });
    desktop = await openApp({ HUHU_CODEX_DISPATCH_HOME: home, HUHU_CODEX_DISPATCH_BIN: provider });
    const { app, page, vault } = desktop;
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(960, 600));
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
    const artifact = "Notes/新轮次产物.txt";
    const contents = "ARTIFACT-SELECTED";
    await mkdir(path.join(vault, "Notes"), { recursive: true });
    await writeFile(path.join(vault, artifact), contents);
    const task = await call<TaskDto>("tasks.create", {
      title: "原会话结束后明确续办",
      body: "Work on the fixture task.",
      type: "agent",
      execution: { spaceId: space!.id, provider: "codex" },
    });
    const detail = await openTask(page, task.title);
    const trigger = detail.getByRole("button", { name: "开始新一轮", exact: true });
    await detail.getByRole("button", { name: "立即派遣", exact: true }).click();
    const questions = () => call<ReturnType<typeof TaskQuestionView.parse>[]>("tasks.questions.list", { taskId: task.id });
    await expect.poll(questions, { timeout: 45_000 }).toMatchObject([{ mode: "native_deferred", status: "awaiting" }]);
    const [old] = await listDispatches(call, task.id);
    await expect(trigger).toHaveCount(0);
    const originalRun = detail.getByTestId("managed-task-run");
    await originalRun.getByRole("button", { name: "展开结果" }).click();
    await originalRun.getByRole("button", { name: "停止本轮", exact: true }).click();
    await page.getByRole("button", { name: "确认停止本轮" }).click();
    const runs = () => call<{ id: string; finishedAt: string | null; parentRunId?: string }[]>("tasks.runs", { id: task.id });
    await expect.poll(runs, { timeout: 30_000 }).toMatchObject([{ id: old!.runId, finishedAt: expect.any(String) }]);
    const closed = await questions();
    expect(closed).toMatchObject([{ runId: old!.runId, status: "closed" }]);
    expect(closed[0]).not.toHaveProperty("reply");
    await call("agent.sessions.kill", { id: old!.session!.id });
    await expect.poll(async () => (await call<{ id: string; state: string }[]>("agent.sessions.list", { spaceId: space!.id })).some(({ id, state }) => id === old!.session!.id && state !== "exited")).toBe(false);
    const summary = "SUMMARY-SELECTED";
    const excluded = "SUMMARY-EXCLUDED";
    const { comment } = await call<{ comment: { id: string } }>("tasks.comments.add", { taskId: task.id, body: `${summary} [[${artifact}]]` });
    await call("tasks.comments.add", { taskId: task.id, body: excluded });
    await originalRun.getByText("原请求已结束。").waitFor();
    await trigger.click();
    const round = page.getByRole("dialog", { name: "开始新一轮" });
    await expect(round.getByText("新轮次将使用新会话。原生问题保留原状态。")).toBeFocused();
    await round.press("Escape");
    await expect(round).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.press("Enter");
    const selected = round.getByRole("checkbox", { name: new RegExp(summary) });
    const product = round.getByRole("checkbox", { name: artifact, exact: true });
    await expect(product).toHaveCount(0);
    await selected.press("Space");
    await expect(selected).toBeChecked();
    await expect(selected).toBeFocused();
    await product.check();
    await expect(product).toBeChecked();
    await expect(round.getByRole("checkbox", { name: excluded })).not.toBeChecked();
    expect(await round.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    const [request] = await Promise.all([
      page.waitForRequest((request) => request.url().endsWith("/api/v1/call") && request.postDataJSON()?.capability === "tasks.dispatch"),
      round.getByRole("button", { name: "确认开始新一轮" }).press("Enter"),
    ]);
    expect(request.postDataJSON().input).toMatchObject({
      taskId: task.id,
      newRound: true,
      context: {
        messageIds: [comment.id],
        artifacts: [{ path: artifact, expectedVersion: expect.any(String) }],
      },
    });
    await expect(round).toBeHidden();
    await expect(detail.getByText("新轮次已受理。")).toBeVisible();
    await expect
      .poll(() => listDispatches(call, task.id), { timeout: 30_000 })
      .toContainEqual(
        expect.objectContaining({
          runId: expect.not.stringMatching(old!.runId),
          parentRunId: old!.runId,
          state: "running",
        }),
      );
    await expect.poll(() => responses.requests.length).toBe(2);
    const followUp = JSON.stringify(responses.requests[1]!.input);
    expect(followUp).toContain(summary);
    expect(followUp).toContain(contents);
    expect(followUp).not.toContain(excluded);
    expect(await questions()).toEqual(closed);
    const current = await call<TaskDto>("tasks.read", { id: task.id });
    expect(current).toMatchObject({ inputRevision: task.inputRevision, inputHash: task.inputHash });
    expect(current.comments.filter(({ event }) => event === "answer")).toEqual([]);
  }, [
    ["关闭桌面", () => desktop?.close()],
    ["停止模型回环夹具", () => responses.close()],
    ["清理独立模型资料", () => rmTree(home)],
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
    const enginePreview = page.waitForResponse((response) => {
      const request = response.request();
      if (!response.url().endsWith("/api/v1/call") || request.method() !== "POST") return false;
      const payload = request.postDataJSON();
      return payload?.capability === "automations.plans.previewRuleDraft" && payload.input?.trigger?.zone === "Asia/Taipei";
    });
    await ruleEditor.getByLabel("时区", { exact: true }).fill("Asia/Taipei");
    const { data: draftPreview } = (await (await enginePreview).json()) as { data: { next: string[] } };
    const previewTimes = ruleEditor.getByTestId("rule-upcoming").locator("time");
    await expect(previewTimes).toHaveCount(3);
    const proposed = await previewTimes.evaluateAll((elements) => elements.map((element) => element.getAttribute("datetime")));
    expect(proposed).toEqual(draftPreview.next);
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
    await page.getByRole("dialog", { name: "放弃未保存的更改？" }).getByRole("button", { name: "放弃更改" }).click();
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

async function withTaskCodex(
  step: NonNullable<NonNullable<Parameters<typeof startCodexResponsesFixture>[0]>["step"]>,
  exercise: (fixture: { desktop: { page: Page; vault: string }; call: Call; responses: Awaited<ReturnType<typeof startCodexResponsesFixture>>; root: string; gate: string }) => Promise<void>,
) {
  const binary = process.env["HUHU_CODEX_DISPATCH_BIN"];
  test.skip(process.platform !== "linux" || !binary, "需要 Linux 固定版本的受控 Codex。");
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "huhu-task-journey-")));
  const home = path.join(root, "provider");
  const config = path.join(root, "config");
  const vault = path.join(root, "vault");
  const userData = path.join(root, "desktop");
  const runtime = path.join(root, "runtime");
  const gate = path.join(root, "ack");
  for (const directory of [home, vault, userData, runtime, gate]) await mkdir(directory, { mode: 0o700 });
  await mkdir(path.join(config, "huhu"), { recursive: true });
  await writeFile(path.join(config, "huhu", "dispatch-limits.json"), JSON.stringify({ active: 2, retained: 8 }));
  const provider = await realpath(binary!);
  const coreBin = process.env["HUHU_HERDR_BIN"] ?? path.join(desktopRoot, "resources/herdr/linux-x64/herdr-core");
  const responses = await startCodexResponsesFixture({ step });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HUHU_VAULT: vault,
    HUHU_HERDR_BIN: coreBin,
    HUHU_CODEX_DISPATCH_HOME: home,
    HUHU_CODEX_DISPATCH_BIN: provider,
    XDG_CONFIG_HOME: config,
    XDG_RUNTIME_DIR: runtime,
    HUHU_E2E_TASK_RECEIPT_ACK_GATE: gate,
  };
  for (const key of ["HC_TERMINAL_ID", "HC_TERMINAL_SOCKET", "HC_SOCKET", "HC_SESSION", "HC_SCOPE"]) delete env[key];
  let app: ElectronApplication | undefined;
  let vaultId: string | undefined;
  try {
    await writeFile(path.join(home, "config.toml"), responses.config, { mode: 0o600 });
    app = await electron.launch({ args: [desktopRoot, "--no-sandbox", `--user-data-dir=${userData}`], env });
    const page = await app.firstWindow();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = caller(page);
    ({ id: vaultId } = await call<{ id: string }>("vault.info"));
    await pauseRules(call);
    const { settings } = await call<{ settings: AgentSettingsFile }>("agent.settings.get");
    await call("agent.settings.update", {
      ...settings,
      expectedRevision: settings.revision,
      agents: { ...settings.agents, codex: { ...settings.agents["codex"], command: provider, env: { CODEX_HOME: home } } },
    });
    await exercise({ desktop: { page, vault }, call, responses, root, gate });
  } finally {
    await withFixtureCleanup(async () => {}, [
      ["关闭桌面", () => app?.close()],
      ["关闭隔离 Core", () => stopFixtureCore(coreBin, runtime, env, vaultId)],
      ["关闭回环模型", () => responses.close()],
      ["清理受控资料目录", () => rmTree(root)],
    ]);
  }
}

async function publishTaskEcho(call: Call, url: string, namespace: string) {
  const source = await call<McpSource>("mcp.sources.create", {
    displayName: namespace,
    namespace,
    configuration: { transport: "streamable-http", url, headers: {}, authentication: { kind: "none" } },
  });
  const ref = { sourceId: source.sourceId, expectedRevision: source.revision };
  expect(await call("mcp.sources.check", ref)).toMatchObject({ state: "ready" });
  const { catalogRevision, policyRevision } = await call<McpCatalogView>("mcp.catalog.list", { sourceId: source.sourceId });
  await call("mcp.policy.update", { expectedCatalogRevision: catalogRevision, expectedPolicyRevision: policyRevision, choices: [{ sourceId: source.sourceId, upstreamIdentity: "echo", selected: true }] });
  return call<McpSource>("mcp.sources.setEnabled", { ...ref, enabled: true });
}

function holdFixture() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

const resultMessages = (task: TaskDto) => task.comments.filter(({ event }) => event === "result").map(({ body }) => body);
async function expectTaskResult(call: Call, task: TaskDto, text: string) {
  await expect.poll(async () => resultMessages(await call<TaskDto>("tasks.read", { id: task.id })), { timeout: 45_000 }).toEqual([text]);
}

async function taskFixtureBearer(root: string): Promise<string> {
  const launches = path.join(root, "desktop", "agent-cli", "codex-dispatch");
  for (const vaultDir of await readdir(launches)) {
    for (const attempt of await readdir(path.join(launches, vaultDir))) {
      const marker = await readFile(path.join(launches, vaultDir, attempt, "task-mcp-active.json"), "utf8").catch(() => "");
      if (!marker) continue;
      const {
        data: { pid },
      } = JSON.parse(marker) as { data: { pid: number } };
      const children = await readFile(`/proc/${pid}/task/${pid}/children`, "utf8");
      for (const child of children.trim().split(/\s+/u)) {
        const vars = await readFile(`/proc/${child}/environ`, "utf8").catch(() => "");
        const value = vars.split("\0").find((entry) => entry.startsWith("HUHU_TASK_MCP_TOKEN="));
        if (value) return value.slice("HUHU_TASK_MCP_TOKEN=".length);
      }
    }
  }
  throw new Error("隔离 Codex 没有任务 MCP 凭据");
}

test("受控 Task 只调用授权工具，结束和撤销后旧会话失效", async () => {
  test.setTimeout(120_000);
  const allowed = await localUpstream("streamable-http");
  const other = await localUpstream("streamable-http");
  const advance = holdFixture();
  const firstEnd = holdFixture();
  try {
    await withTaskCodex(
      async (_request, index) => {
        if (index === 1) return huhuMcpStep("vault_info", {});
        if (index === 2) return huhuMcpStep("task_allowed__echo", { value: "first" });
        if (index === 3) {
          await firstEnd.promise;
          return { result: "允许的工具已完成" };
        }
        if (index === 4) {
          await advance.promise;
          return huhuMcpStep("task_allowed__echo", { value: "revoked" });
        }
        return { result: "已处理撤权" };
      },
      async ({ desktop: { page }, call, responses, root }) => {
        const allowedSource = await publishTaskEcho(call, allowed.url, "task_allowed");
        const otherSource = await publishTaskEcho(call, other.url, "task_other");
        await call("gateway.update", { capability: "vault.info", exposed: true });
        await call("gateway.mcp.update", { enabled: true });
        // Enabling a source invalidates its temporary check. Rediscover the enabled revision before opening the read-only catalog.
        for (const source of [allowedSource, otherSource]) {
          expect(await call("mcp.sources.refresh", { sourceId: source.sourceId, expectedRevision: source.revision })).toMatchObject({ state: "ready", toolCount: 1 });
        }
        const [space] = await call<{ id: string }[]>("agent.spaces.list");
        async function createAuthorizedTask(title: string) {
          const task = await call<TaskDto>("tasks.create", { title, body: "调用经授权的工具。", type: "agent", execution: { spaceId: space!.id, provider: "codex" } });
          const detail = await openTask(page, task.title);
          await detail.getByRole("button", { name: "任务 MCP 授权" }).click();
          const dialog = page.getByRole("dialog", { name: "任务 MCP 授权" });
          await dialog.getByRole("checkbox", { name: "选择 vault.info（Huhu 内置）" }).check();
          await dialog.getByRole("checkbox", { name: "选择 task_allowed__echo（task_allowed）" }).check();
          await expect(dialog.getByRole("checkbox", { name: "选择 task_other__echo（task_other）" })).not.toBeChecked();
          await dialog.getByRole("button", { name: "保存工具授权" }).click();
          await expect(detail.getByText("已授权 2 项工具")).toBeVisible();
          await detail.getByRole("button", { name: "立即派遣", exact: true }).click();
          return { task, detail };
        }
        const { task: finished } = await createAuthorizedTask("受控工具完成");
        await expect.poll(() => responses.requests.length, { timeout: 40_000 }).toBe(3);
        const {
          mcp: { url },
        } = await call<{ mcp: { url: string } }>("gateway.get");
        const bearer = await taskFixtureBearer(root);
        const oldSession = await openMcpSession(url, bearer);
        const attemptUse = (token: string, session: string) => mcpRequest(url, token, mcpRpc("tools/call", { name: "task_allowed__echo", arguments: { value: "cached" } }), session);
        firstEnd.resolve();
        await expectTaskResult(call, finished, "允许的工具已完成");
        expect((await attemptUse(bearer, oldSession)).status).toBe(401);
        const firstToolNames = huhuMcpTools(responses.requests[0]);
        expect(firstToolNames).toContain("vault_info");
        expect(firstToolNames).toContain("task_allowed__echo");
        expect(firstToolNames).not.toContain("task_other__echo");
        expect(allowed.calls).toEqual([{ name: "echo", input: { value: "first" } }]);
        expect(other.calls).toHaveLength(0);

        const { task: revoked, detail } = await createAuthorizedTask("受控工具撤权");
        await expect.poll(() => responses.requests.length, { timeout: 30_000 }).toBe(4);
        const revokingBearer = await taskFixtureBearer(root);
        const revokingSession = await openMcpSession(url, revokingBearer);
        await detail.getByRole("button", { name: "任务 MCP 授权" }).click();
        await page.getByRole("button", { name: "撤销任务授权" }).click();
        await expect(detail.getByText("未授权工具")).toBeVisible();
        expect((await attemptUse(revokingBearer, revokingSession)).status).toBe(401);
        expect((await mcpRequest(url, revokingBearer, initializeMcp)).status).toBe(401);
        advance.resolve();
        await expectTaskResult(call, revoked, "已处理撤权");
        expect(responses.requests[4]?.input).toEqual(expect.arrayContaining([expect.objectContaining({ type: "function_call_output" })]));
        expect(allowed.calls).toHaveLength(1);
        expect(other.calls).toHaveLength(0);
      },
    );
  } finally {
    firstEnd.resolve();
    advance.resolve();
    await Promise.all([allowed.close(), other.close()]);
  }
});

test("同一受控任务写授权文件、调用内置与外部工具并按原身份撤权", async () => {
  test.setTimeout(120_000);
  const upstream = await localUpstream("streamable-http");
  const afterTools = holdFixture();
  let workspace: string;
  try {
    await withTaskCodex(
      async ({ tools }, index) => {
        if (index === 1) {
          const shell = tools.find(({ name }) => name === "exec_command" || name === "shell_command")?.name ?? "exec_command";
          const command = "printf 'task-workspace' > proof.txt";
          return { tool: shell, arguments: shell === "shell_command" ? { command, workdir: workspace } : { cmd: command, workdir: workspace } };
        }
        if (index === 2) return huhuMcpStep("vault_info", {});
        if (index === 3) return huhuMcpStep("task_workspace__echo", { value: "workspace" });
        if (index === 4) {
          await afterTools.promise;
          return huhuMcpStep("task_workspace__echo", { value: "after-revocation" });
        }
        return { result: "写入与工具执行已核对" };
      },
      async ({ desktop: { page }, call, responses, root }) => {
        workspace = path.join(root, "workspace");
        await mkdir(workspace);
        const space = await call<{ id: string; revision: number }>("agent.spaces.save", { name: "Task MCP 写入空间", root: workspace });
        await call("agent.spaces.dispatchWriteApproval", { id: space.id, expectedRevision: space.revision, allowed: true });
        const source = await publishTaskEcho(call, upstream.url, "task_workspace");
        await call("gateway.update", { capability: "vault.info", exposed: true });
        await call("gateway.mcp.update", { enabled: true });
        const task = await call<TaskDto>("tasks.create", {
          title: "组合工作区与 MCP",
          body: "写入授权工作区，调用选定工具。",
          type: "agent",
          execution: { spaceId: space.id, provider: "codex", profile: "workspace-write" },
        });
        expect(await call("tasks.dispatch.targets", { spaceId: space.id, taskId: task.id, profile: "workspace-write" })).toEqual(
          expect.arrayContaining([expect.objectContaining({ mode: "new", provider: "codex", capabilities: expect.objectContaining({ mcp: { state: "unsupported", reason: "no_task_tool_scope" } }) })]),
        );
        const tools: TaskMcpTool[] = [
          { sourceId: "builtin", upstreamIdentity: "vault.info", sourceRevision: null },
          { sourceId: source.sourceId, upstreamIdentity: "echo", sourceRevision: source.revision },
        ];
        await call("tasks.mcp.authorize", { id: task.id, expectedVersion: task.version, tools });
        const detail = await openTask(page, task.title);
        await detail.getByRole("button", { name: "立即派遣", exact: true }).click();
        await expect.poll(() => responses.requests.length, { timeout: 45_000 }).toBe(4);
        // Codex reports a sandbox or shell failure back to the model; show it instead of a bare ENOENT.
        const shellOutput = JSON.stringify(responses.requests[1]?.input.filter(({ type }) => type === "function_call_output"));
        expect(existsSync(path.join(workspace, "proof.txt")), shellOutput).toBe(true);
        expect(await readFile(path.join(workspace, "proof.txt"), "utf8")).toBe("task-workspace");
        expect(upstream.calls).toEqual([{ name: "echo", input: { value: "workspace" } }]);
        const [run] = await listDispatches(call, task.id);
        expect(run).toMatchObject({ attempt: 1 });
        const current = await call<TaskDto>("tasks.read", { id: task.id });
        await call("tasks.mcp.authorize", { id: task.id, expectedVersion: current.version, tools: [] });
        afterTools.resolve();
        await expectTaskResult(call, task, "写入与工具执行已核对");
        expect(await listDispatches(call, task.id)).toMatchObject([{ dispatchId: run!.dispatchId, runId: run!.runId, attempt: 1 }]);
        expect(upstream.calls).toHaveLength(1);
      },
    );
  } finally {
    afterTools.resolve();
    await upstream.close();
  }
});

test("TW1 各可信终态显示独立运行结果并释放已证结束的占用", async () => {
  test.setTimeout(160_000);
  const held = holdFixture();
  try {
    await withTaskCodex(
      async (_request, index) => {
        if (index === 1) return { result: "独立成功结果" };
        if (index === 2) return { error: "独立失败原因" };
        if (index === 3) return { noFinal: true };
        await held.promise;
        return { result: "迟到结果" };
      },
      async ({ desktop: { page }, call, responses, gate }) => {
        const [space] = await call<{ id: string }[]>("agent.spaces.list");
        const dispatch = async (title: string, dispatchId: string) => {
          const task = await call<TaskDto>("tasks.create", { title, body: title, type: "agent", execution: { spaceId: space!.id, provider: "codex" } });
          await call("tasks.dispatch", { taskId: task.id, dispatchId, expectedVersion: task.version, inputRevision: task.inputRevision, inputHash: task.inputHash });
          const [row] = await listDispatches(call, task.id);
          return { task, runId: row!.runId };
        };
        const proof = async (task: TaskDto, runId: string, state: string) => {
          await expect.poll(() => call("tasks.runs", { id: task.id }), { timeout: 40_000 }).toMatchObject([{ id: runId, state, finishedAt: expect.any(String) }]);
          await expect.poll(() => call("tasks.dispatch.resources"), { timeout: 15_000 }).toMatchObject({ vault: { active: 0 }, device: { active: { occupied: 0 } } });
          expect(await call<TaskDto>("tasks.read", { id: task.id })).toMatchObject({ status: "in_progress" });
          const row = await openRun(page, task.title);
          await expect(row).toHaveAttribute("data-run-id", runId);
          return row;
        };

        await writeFile(path.join(gate, "dispatch-id"), "tw1-dropped-ack");
        await writeFile(path.join(gate, "drop-once"), "");
        const success = await dispatch("TW1 成功和丢 ACK", "tw1-dropped-ack");
        await expect.poll(() => readFile(path.join(gate, "held.json"), "utf8").catch(() => ""), { timeout: 45_000 }).not.toBe("");
        await writeFile(path.join(gate, "release"), "");
        await expect(await proof(success.task, success.runId, "succeeded")).toContainText("独立成功结果");
        await expectTaskResult(call, success.task, "独立成功结果");

        const failed = await dispatch("TW1 原生失败", "tw1-native-failed");
        await expect(await proof(failed.task, failed.runId, "failed")).toContainText("独立失败原因");
        const empty = await dispatch("TW1 结束但结果未知", "tw1-no-final");
        await expect(await proof(empty.task, empty.runId, "unknown")).toContainText("执行已结束，结果待核实");

        const stopped = await dispatch("TW1 用户停止", "tw1-stopped");
        await expect.poll(() => responses.requests.length, { timeout: 30_000 }).toBe(4);
        const original = await openRun(page, stopped.task.title);
        await original.getByRole("button", { name: "停止本轮", exact: true }).click();
        await page.getByRole("button", { name: "确认停止本轮", exact: true }).click();
        await expect(await proof(stopped.task, stopped.runId, "cancelled")).toContainText("本轮已停止");
        expect(resultMessages(await call<TaskDto>("tasks.read", { id: stopped.task.id }))).toEqual([]);
        held.resolve();
      },
    );
  } finally {
    held.resolve();
  }
});

test("停用时已受理的手动和定时运行继续收尾，未受理队列重启不派发", async () => {
  test.setTimeout(180_000);
  const finish = holdFixture();
  try {
    await withTaskCodex(
      async ({ input }) => {
        const body = JSON.stringify(input);
        await finish.promise;
        return { result: body.includes("G1-MANUAL") ? "原手动运行已收尾" : "原定时运行已收尾" };
      },
      async ({ desktop: { page, vault }, call, responses }) => {
        const [space] = await call<{ id: string }[]>("agent.spaces.list");
        const create = (title: string, tags: string[], availableAt?: string) =>
          call<TaskDto>("tasks.create", { title, body: title, tags, type: "agent", execution: { spaceId: space!.id, provider: "codex" }, ...(availableAt && { availableAt }) });
        const manual = await create("G1-MANUAL", ["g1-manual"]);
        const timed = await create("G1-SCHEDULED", ["g1-scheduled"]);
        const late = schedule(33);
        const skipped = await create("G1-UNACCEPTED", ["g1-skipped"], late.at.toISOString());
        async function rule(title: string, tags: string[], trigger: ReturnType<typeof schedule>["trigger"]) {
          const draft = await call<Rule>("automations.create", { title, trigger, action: { kind: "agent", input: { source: "tasks", tags, maxConcurrent: 1 } } });
          return call<Rule>("automations.setEnabled", { id: draft.id, enabled: true, expectedVersion: draft.version });
        }
        const manualRule = await rule("手动受理", ["g1-manual"], { preset: "custom", cron: "0 0 0 1 1 *", zone: "UTC" });
        await rule("未受理队列", ["g1-skipped"], late.trigger);
        const due = schedule(8);
        const timedRule = await rule("定时受理", ["g1-scheduled"], due.trigger);
        await call("automations.runNow", { id: manualRule.id, expectedVersion: manualRule.version, intentId: randomUUID() });
        await expect.poll(() => responses.requests.length, { timeout: 25_000 }).toBe(2);
        const accepted = async (taskId: string) => (await listDispatches(call, taskId))[0];
        await expect.poll(() => accepted(manual.id), { timeout: 12_000 }).toMatchObject({ state: "running", attempt: 1 });
        await expect.poll(() => accepted(timed.id), { timeout: 12_000 }).toMatchObject({ state: "running", attempt: 1 });
        const originalManual = (await accepted(manual.id))!;
        const originalTimed = (await accepted(timed.id))!;
        expect(originalManual.runId).not.toBe(originalTimed.runId);
        const scheduleRow = (await call<Activation[]>("automations.activations")).find(({ ruleId, scheduledFor }) => ruleId === timedRule.id && scheduledFor === due.at.toISOString());
        expect(scheduleRow?.activationId).toBeTruthy();
        expect(await listDispatches(call, skipped.id)).toEqual([]);
        expect(Date.now()).toBeLessThan(late.at.getTime());
        expect(await call("plugins.setEnabled", { id: "automations", enabled: false })).toMatchObject({ state: "disabled" });
        finish.resolve();
        await expectTaskResult(call, manual, "原手动运行已收尾");
        await expectTaskResult(call, timed, "原定时运行已收尾");
        await expect.poll(() => Date.now(), { timeout: 40_000 }).toBeGreaterThanOrEqual(late.at.getTime());
        await withFixtureDeadline(22_000, () => page.evaluate(() => window.huhuHost.vault.close()));
        expect(await withFixtureDeadline(25_000, () => page.evaluate((path) => window.huhuHost.vault.open(path), vault))).toMatchObject({ ok: true });
        await page.reload();
        await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 30_000 });
        expect(await listDispatches(call, skipped.id)).toEqual([]);
        expect(await listDispatches(call, manual.id)).toMatchObject([{ runId: originalManual.runId, attempt: originalManual.attempt }]);
        expect(await listDispatches(call, timed.id)).toMatchObject([{ runId: originalTimed.runId, attempt: originalTimed.attempt }]);
        expect((await call<TaskDto>("tasks.read", { id: skipped.id })).status).toBe("not_started");
        expect(responses.requests).toHaveLength(2);
      },
    );
  } finally {
    finish.resolve();
  }
});

test("受控 Task 经公开入口使用 SSH 和账本，撤权后原运行仍可读", async () => {
  test.setTimeout(120_000);
  let hostId: string;
  let bookId: string;
  const done = holdFixture();
  try {
    await withTaskCodex(
      async (_request, index) => {
        if (index === 1) return huhuMcpStep("ssh_resources_host_get", { hostId });
        if (index === 2) return huhuMcpStep("ledger_records_list", { bookId });
        await done.promise;
        return { result: "SSH 和账本查询已完成" };
      },
      async ({ desktop: { page }, call, responses, root }) => {
        ({ hostId } = await call<{ hostId: string }>("ssh.hosts.configure", {
          name: "Task SSH 回环目标",
          host: "127.0.0.1",
          port: 2222,
          user: "fixture",
          authKind: "password",
          jumpHostIds: [],
          expectedRevision: null,
          credentials: [{ purpose: "password", action: "replace", value: "fixture-only" }],
        }));
        ({ id: bookId } = await call<{ id: string }>("ledger.books.create", {
          name: "Task 授权账本",
          defaultCurrency: "TWD",
          timeZone: "Asia/Taipei",
          firstAccount: { name: "银行" },
        }));
        const resources = { "ssh.hosts": [hostId] };
        const changes = ["ssh.resources.host.get", "ledger.records.list"].map((capability) => ({ capability, exposed: true }));
        const preview = await call<{ revision: number; catalogRevision: string }>("gateway.policy.preview", { resources, changes });
        await call("gateway.policy.update", { resources, changes, expectedRevision: preview.revision, catalogRevision: preview.catalogRevision });
        await call("gateway.mcp.update", { enabled: true });
        const [space] = await call<{ id: string }[]>("agent.spaces.list");
        const task = await call<TaskDto>("tasks.create", {
          title: "SSH 和账本联合运行",
          body: "读取授权的 SSH 主机和账本记录。",
          type: "agent",
          execution: { spaceId: space!.id, provider: "codex" },
        });
        const tools: TaskMcpTool[] = changes.map(({ capability }) => ({ sourceId: "builtin", upstreamIdentity: capability, sourceRevision: null }));
        const granted = await call<TaskDto>("tasks.mcp.authorize", { id: task.id, expectedVersion: task.version, tools });
        const detail = await openTask(page, task.title);
        await detail.getByRole("button", { name: "立即派遣", exact: true }).click();
        await expect.poll(() => responses.requests.length, { timeout: 45_000 }).toBe(3);
        expect(huhuMcpTools(responses.requests[0]).sort()).toEqual(["ledger_records_list", "ssh_resources_host_get"]);
        const outputs = responses.requests[2]!.input.filter(({ type }) => type === "function_call_output");
        expect(outputs).toHaveLength(2);
        expect(JSON.stringify(outputs[0]?.output)).toContain(hostId);
        expect(JSON.stringify(outputs[0]?.output)).not.toContain("fixture-only");
        expect(JSON.stringify(outputs[1]?.output)).not.toContain("PERMISSION_DENIED");
        const {
          mcp: { url },
        } = await call<{ mcp: { url: string } }>("gateway.get");
        const bearer = await taskFixtureBearer(root);
        const handle = await openMcpSession(url, bearer);
        const current = await call<TaskDto>("tasks.read", { id: task.id });
        expect(current.mcpAuthorization).toEqual(granted.mcpAuthorization);
        await call("tasks.mcp.authorize", { id: task.id, expectedVersion: current.version, tools: [] });
        expect((await mcpRequest(url, bearer, mcpRpc("tools/call", { name: "ssh_resources_host_get", arguments: { hostId } }), handle)).status).toBe(401);
        done.resolve();
        await expectTaskResult(call, task, "SSH 和账本查询已完成");
        expect(await listDispatches(call, task.id)).toMatchObject([{ attempt: 1 }]);
        await expect(await openRun(page, task.title)).toContainText("SSH 和账本查询已完成");
      },
    );
  } finally {
    done.resolve();
  }
});
