import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CapabilityResult, ExecutionReceiptAck, TaskDto, TasksReceiptConsumption } from "@huhu/contracts";
import type { DispatchReceipt, TaskDispatchView } from "../../../plugins/tasks/src/engine/dispatch-store.js";
import type { TaskQuestionView } from "../../../plugins/tasks/src/engine/receipt-inbox.js";
import type { z } from "zod";
import { openApp, rmTree } from "../helpers/launch.js";

type Rule = { id: string; version: string; data: { enabled: boolean; trigger: { preset: string; cron: string; zone: string } } };
type Activation = { activationId: string; ruleId: string; scheduledFor: string | null; summary?: { processed: number; skipped: number } };
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

test("T7.2 Linux 实际定时与手动运行共享同一 Tasks 派遣，原目标不可用时可人工关闭", async ({}, testInfo) => {
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

test("T4.1 与 T5.5 在工作台处理 DST 回拨与缺口、保留启用状态并预览三次新触发", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const call = caller(page);
    await call("settings.update", { patch: { dateTime: { zone: "America/New_York" } } });
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

test("T7.2 候选安装包：后台到期、原生问题同会话继续、一次结果与人工完成", async ({}, testInfo) => {
  test.setTimeout(180_000);
  const executablePath = process.env["HUHU_PACKAGED_EXE"];
  const packageArtifact = process.env["HUHU_TASK_JOURNEY_PACKAGE_ARTIFACT"];
  const expectedSha = process.env["HUHU_TASK_JOURNEY_PACKAGE_SHA"];
  const provider = process.env["HUHU_CODEX_DISPATCH_BIN"];
  const providerHome = process.env["HUHU_CODEX_DISPATCH_HOME"];
  test.skip(
    process.env["HUHU_TASK_JOURNEY_ACCEPTANCE"] !== "1" || !executablePath || !packageArtifact || !expectedSha || !provider || !providerHome,
    "需 W8.3 候选包、受控派遣白名单中的真实 Codex 构建及专用测试 provider 配置。Linux 普通工作树没有整段原生问答所需的输入。",
  );
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(packageArtifact!)) hash.update(chunk);
  const sha = hash.digest("hex");
  expect(sha).toBe(expectedSha);
  const sandbox = await mkdtemp(path.join(tmpdir(), "huhu-task-journey-"));
  const vault = path.join(sandbox, "vault");
  const userData = path.join(sandbox, "desktop");
  const env = { ...process.env, HUHU_VAULT: vault };
  delete (env as NodeJS.ProcessEnv)["HUHU_HERDR_BIN"];
  try {
    await mkdir(vault);
    await mkdir(userData);
    const app = await electron.launch({ executablePath, args: ["--no-sandbox", `--user-data-dir=${userData}`], env });
    try {
      const page = await app.firstWindow();
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 25_000 });
      const call = caller(page);
      await pauseRules(call);
      const [space] = await call<{ id: string }[]>("agent.spaces.list");
      const seed = await call<TaskDto>("tasks.create", {
        title: "原会话夹具",
        body: "Reply only with READY. Do not run tools.",
        type: "agent",
        execution: { spaceId: space!.id, provider: "codex" },
      });
      const initial = await call<DispatchReceipt>("tasks.dispatch", { taskId: seed.id, dispatchId: randomUUID(), expectedVersion: seed.version, inputRevision: seed.inputRevision, inputHash: seed.inputHash });
      await expect.poll(async () => (await call<TaskDto>("tasks.read", { id: seed.id })).comments.some(({ run, event }) => run === initial.runId && event === "result"), { timeout: 40_000 }).toBe(true);
      const [seedRun] = await listDispatches(call, seed.id);
      const session = seedRun!.session!;
      expect(session).toBeTruthy();

      const { at, trigger } = schedule(18);
      const task = await call<TaskDto>("tasks.create", {
        title: "原生问答任务旅程",
        body: "在回复之前必须使用原生 request_user_input 请求选择，只提供 Circle 和 Square 两个选项。用户选定后，以 TASK-JOURNEY-RESULT 开头给出唯一的最终结果。",
        type: "agent",
        tags: ["native-journey"],
        availableAt: new Date(at.getTime() - 2_000).toISOString(),
        execution: { spaceId: space!.id, target: { mode: "existing", sessionId: session.id } },
      });
      const draft = await call<Rule>("automations.create", {
        title: "后台原生问答",
        trigger,
        action: { kind: "agent", input: { source: "tasks", tags: ["native-journey"], maxConcurrent: 1 } },
      });
      const rule = await call<Rule>("automations.setEnabled", { id: draft.id, enabled: true, expectedVersion: draft.version });
      expect(await listDispatches(call, task.id)).toEqual([]);
      const detail = await openTask(page, task.title);
      const questions = () => call<z.infer<typeof TaskQuestionView>[]>("tasks.questions.list", { taskId: task.id });
      await expect.poll(questions, { timeout: 65_000 }).toMatchObject([{ mode: "native_deferred", status: "awaiting", sessionId: session.id }]);
      const [question] = await questions();
      const [run] = await listDispatches(call, task.id);
      expect(run).toMatchObject({ runId: question!.runId, attempt: 1, session });
      const managed = detail.getByTestId("managed-task-run");
      await managed.getByRole("button", { name: "展开结果" }).click();
      await managed.getByRole("radio", { name: "Circle" }).check();
      await managed.getByRole("button", { name: "发送回答" }).click();
      const timeline = async () => (await call<TaskDto>("tasks.read", { id: task.id })).comments;
      await expect.poll(async () => (await timeline()).filter(({ event }) => event === "result"), { timeout: 45_000 }).toMatchObject([{ run: run!.runId, session: session.id, body: expect.stringContaining("TASK-JOURNEY-RESULT") }]);
      const result = (await timeline()).find(({ event }) => event === "result")!;
      const occurrences = await call<Activation[]>("automations.activations");
      const occurrence = occurrences.find(({ ruleId, scheduledFor }) => ruleId === rule.id && scheduledFor === at.toISOString());
      expect(occurrence?.summary?.processed).toBe(1);
      const receiptDir = path.join(vault, ".huhu", "tasks", "receipts");
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
        return receipts.find(({ receipt }) => receipt.execution.runId === run!.runId && receipt.kind === "result");
      };
      await expect.poll(readResultReceipt).toMatchObject({ receipt: { execution: { runId: run!.runId, dispatchId: run!.dispatchId, attempt: 1 } }, consumption: { delivery: { messageId: result.id } }, status: "delivered" });
      const saved = (await readResultReceipt())!;
      const agentRoot = path.join(userData, "agent-cli", "codex-dispatch");
      const [localVault] = await readdir(agentRoot);
      const agentReceipts = path.join(agentRoot, localVault!, "agent-receipts");
      await expect
        .poll(
          async () => {
            const acks = await Promise.all((await readdir(agentReceipts)).filter((file) => file.endsWith(".tasks-ack")).map(async (file) => JSON.parse(await readFile(path.join(agentReceipts, file), "utf8")) as ExecutionReceiptAck));
            return acks.filter(({ receipt }) => receipt.receiptId === saved.receipt.receiptId);
          },
          { timeout: 20_000 },
        )
        .toEqual([{ stage: "tasks_consumed", receipt: saved.consumption.delivery.receipt }]);
      expect((await call<TaskDto>("tasks.read", { id: task.id })).status).toBe("in_progress");
      await detail.getByTestId("task-status").selectOption("completed");
      await expect.poll(async () => (await call<TaskDto>("tasks.read", { id: task.id })).status).toBe("completed");
      await testInfo.attach("W8.3 任务回执身份", {
        contentType: "application/json",
        body: JSON.stringify({
          sha,
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
    } finally {
      await app.close();
    }
  } finally {
    rmTree(sandbox);
  }
});

test("T7.2 候选安装包：停用 Tasks、丢失一次消费 ACK 和原生进程恢复", () => {
  test.skip(true, "安装包缺少可控制内部 Agent→Tasks ACK 的验收夹具。Linux 的内部消费协议与重交用 agent-cli/test/native-receipts.live.test.ts 的固定 Core 夹具验证，随包 Windows 原生恢复需 W8.3 环境。");
});
