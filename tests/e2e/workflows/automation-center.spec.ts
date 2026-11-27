import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import type { PlanOccurrence, PlanSummary, PlanWrite } from "../../../packages/contracts/src/automation-plan.js";
import type { TaskDto } from "../../../packages/contracts/src/index.js";
import { openImapFixture } from "../../../plugins/mail/test/fixtures/imap.js";
import { LINUX_SAMPLE, PLATFORM_COMMAND } from "../../../plugins/ssh/src/engine/monitor-sample.js";
import type { MonitorPanel, MonitorPanelRun } from "../../../plugins/ssh/src/shared/monitoring.js";
import { startFakeSsh } from "../../../plugins/ssh/test/fake-server.js";
import { planReminderOccurrenceId } from "../../../plugins/automations/src/engine/reminder-deliveries.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";
import { openApp, rmTree } from "../helpers/launch.js";
import { withFixtureCleanup } from "../helpers/candidate-desktop.js";

const listPlans = (page: Page) => call<{ plans: PlanSummary[] }>(page, "automations.plans.list", {});
const readPlan = (page: Page, planId: string) => call<PlanSummary | null>(page, "automations.plans.read", { planId });
const changePlan = (
  page: Page,
  plan: Pick<PlanSummary, "planId" | "revision">,
  change: Omit<Extract<PlanWrite, { change: "reschedule" }>, "planId" | "expectedRevision" | "intentId"> | { change: "set-intent"; intent: "paused" | "enabled" } | { change: "delete" },
) => {
  const intentId = randomUUID();
  return call<{ outcome: string; plan?: PlanSummary; error?: { code: string } }>(
    page,
    "automations.plans.submit",
    {
      planId: plan.planId,
      expectedRevision: plan.revision,
      ...change,
      intentId,
    },
    intentId,
  );
};

async function openPlanDirectory(page: Page) {
  await page.getByRole("navigation", { name: "功能图标栏" }).getByRole("button", { name: "自动化", exact: true }).click();
  const directory = page.getByTestId("plan-directory");
  if (!(await directory.isVisible())) await page.getByRole("button", { name: "计划", exact: true }).click();
  await expect(directory).toBeVisible();
  return directory;
}

async function invitePlans(desktop: Page, browser: Browser) {
  await call(desktop, "web.share.start", { mode: "local", port: 0 });
  const { links } = await call<{ links: string[] }>(desktop, "web.invitations.create", {});
  const invited = await browser.newPage();
  await invited.goto(links[0]!);
  await engineReady(invited);
  return invited;
}

async function openDomainPlans(
  use: (fixture: {
    page: Page;
    vault: string;
    sandbox: string;
    mail: PlanSummary;
    git: PlanSummary;
    gitPull: PlanSummary;
    ssh: PlanSummary;
    samples: () => { mail: number; git: number; ssh: number };
    saveMail(label: string): Promise<{ accountId: string }>;
    configureGit(remote: string): Promise<void>;
    alternateRemote: string;
    deliverMail(): number;
    mailAccountId: string;
  }) => Promise<void>,
) {
  const sandbox = mkdtempSync(path.join(tmpdir(), "huhu-plan-domains-"));
  let imap: Awaited<ReturnType<typeof openImapFixture>> | undefined;
  let ssh: Awaited<ReturnType<typeof startFakeSsh>> | undefined;
  let desktop: Awaited<ReturnType<typeof openApp>> | undefined;
  await withFixtureCleanup(async () => {
    const counters = { ssh: 0 };
    const mailbox = { uidValidity: 42, messages: [] as import("../../../plugins/mail/test/fixtures/imap.js").FixtureImapMessage[] };
    const deliverMail = () => {
      const uid = mailbox.messages.length + 1;
      const subject = `周期邮件 ${uid}`;
      mailbox.messages.push({ uid, uidValidity: 42, subject, source: `From: Fixture <sender@example.test>\r\nSubject: ${subject}\r\n\r\nFixture body\r\n` });
      return uid;
    };
    deliverMail();
    const imapFixture = (imap = await openImapFixture({ allowIdle: false, windows: { INBOX: mailbox } }));
    const sshFixture = (ssh = await startFakeSsh({
      onExec(command) {
        if (command === PLATFORM_COMMAND) return { stdout: "Linux" };
        if (command === LINUX_SAMPLE) {
          counters.ssh++;
          return { stdout: "memory 8192 4096\nuptime 3600\n" };
        }
      },
    }));
    const trace = path.join(sandbox, "git-trace.log");
    const git = (directory: string, ...args: string[]) => execFileSync("git", ["-C", directory, ...args], { timeout: 10_000, stdio: "pipe" });
    const source = path.join(sandbox, "git-seed");
    mkdirSync(source);
    git(source, "init", "--initial-branch=main", "--template=");
    git(source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "--allow-empty", "-m", "fixture");
    for (const name of ["origin.git", "alternate.git"]) git(sandbox, "clone", "--bare", source, name);
    desktop = await openApp({ GIT_TRACE: trace });
    const { page, vault } = desktop;
    await engineReady(page);
    const remote = (name: string) => pathToFileURL(path.join(sandbox, name)).href;
    await call(page, "git.init", {});
    const configureGit = async (url: string) => {
      await call(page, "sync.update", { remote: url, branch: "main", mode: "full", pullIntervalSec: 30, pushIntervalSec: 30 });
    };
    await configureGit(remote("origin.git"));
    const getGit = () => call<{ periodics: { sync: PlanSummary; pull: PlanSummary } }>(page, "sync.get", {});

    const saveMail = async (label: string) => {
      const endpoint = { host: "127.0.0.1", port: imapFixture.port, security: "none" };
      const { setupId } = await call<{ setupId: string }>(page, "mail.accounts.testConnection", {
        settings: { provider: "custom_imap", email: `${label}@example.test`, label, auth: "password", imap: endpoint, smtpEnabled: false, smtp: endpoint },
        password: "synthetic-loopback-password",
      });
      return call<{ accountId: string }>(page, "mail.accounts.save", { setupId, folders: ["INBOX"] });
    };
    const { accountId: mailAccountId } = await saveMail("original");
    await call(page, "mail.sync.setInterval", { minutes: 1, expectedRevision: null });
    const { plan: mail } = await call<{ plan: PlanSummary }>(page, "mail.sync.settings", {});

    const { hostId } = await call<{ hostId: string }>(page, "ssh.hosts.configure", {
      name: "原监控主机",
      host: "127.0.0.1",
      port: sshFixture.port,
      user: "fixture",
      authKind: "password",
      expectedRevision: null,
      credentials: [{ purpose: "password", action: "replace", value: "pw" }],
    });
    const panel = await call<MonitorPanel>(page, "ssh.monitor.panels.save", {
      name: "原监控面板",
      hostIds: [hostId],
      note: "",
      interval: 2,
      retention: 15,
    });
    const readPanel = () => call<MonitorPanelRun>(page, "ssh.monitor.panels.run", { id: panel.id });
    expect(await readPanel()).toBeNull();
    await call(page, "ssh.monitor.panels.change", { id: panel.id, expectedRevision: panel.revision, action: "start" });
    await expect.poll(async () => (await readPanel()).hosts[0]?.prompt).toBeTruthy();
    const prompt = (await readPanel()).hosts[0]!.prompt!;
    await call(page, "ssh.hostKey.decide", { attemptId: prompt.attemptId, hop: prompt.hop, promptId: prompt.promptId, accept: true, remember: true });
    const samples = () => ({
      mail: imapFixture.commands.filter((command) => command === "EXAMINE" || command === "SELECT").length,
      git: existsSync(trace)
        ? readFileSync(trace, "utf8")
            .split("\n")
            .filter((line) => /run_command:.*git-upload-pack .*origin\.git/.test(line)).length
        : 0,
      ssh: counters.ssh,
    });
    const {
      periodics: { sync: gitSync, pull: gitPull },
    } = await getGit();
    await use({ page, vault, sandbox, mail, git: gitSync, gitPull, ssh: (await readPanel()).plan!, samples, saveMail, configureGit, deliverMail, mailAccountId, alternateRemote: remote("alternate.git") });
  }, [
    ["关闭桌面", () => desktop?.close()],
    ["关闭 IMAP", () => imap?.close()],
    ["关闭 SSH", () => ssh?.close()],
    ["清理本地远端", () => rmTree(sandbox)],
  ]);
}

test("AU15 全局暂停从中心写入并在设置中恢复", async ({ browserName: _browserName }) => {
  const { page, close } = await openApp();
  try {
    await engineReady(page);
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    const control = page.getByTestId("automatic-run-control");
    await control.getByRole("button", { name: "暂停自动运行" }).click();
    await page.getByRole("dialog", { name: "暂停自动运行" }).getByRole("button", { name: "暂停自动运行" }).click();
    await expect(control.getByRole("status")).toHaveText("自动运行已全局暂停");
    await page.getByRole("button", { name: "设置", exact: true }).first().click();
    const settings = page.getByTestId("settings-module");
    await page.getByTestId("settings-nav-automations").click();
    await expect(settings.getByTestId("automatic-run-control").getByRole("status")).toHaveText("自动运行已全局暂停");
    await settings.getByRole("button", { name: "恢复自动运行" }).click();
    await page.getByRole("dialog", { name: "恢复自动运行" }).getByRole("button", { name: "恢复自动运行" }).click();
    await expect(settings.getByTestId("automatic-run-control").getByRole("status")).toHaveText("自动运行已开启");
  } finally {
    await close();
  }
});

test("AU13 重试原建任务效果，保留通知和任务身份", async ({ browserName: _browserName }) => {
  const { page, vault, close } = await openApp();
  const title = "原效果重试夹具";
  try {
    await engineReady(page);
    const rule = await call<{ id: string; version: string }>(page, "automations.create", {
      title,
      trigger: { preset: "custom", cron: "0 0 1 1 *", zone: "UTC" },
      action: { kind: "reminder", mode: "both", text: title },
    });
    const { activationId, summary } = await call<{ activationId: string; summary: { taskId: string } }>(page, "automations.runNow", {
      id: rule.id,
      expectedVersion: rule.version,
      intentId: randomUUID(),
    });
    const filename = path.join(vault, ".huhu", "automations", "reminder-deliveries", `${activationId}.json`);
    const record = JSON.parse(readFileSync(filename, "utf8")) as object;
    writeFileSync(filename, JSON.stringify({ ...record, task: "unavailable" }) + "\n");

    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByRole("button", { name: "激活记录", exact: true }).click();
    await page.getByTestId("activation-row").getByRole("button", { name: title }).click();
    const detail = page.getByTestId("occurrence-inspector");
    await expect(detail).toContainText("创建任务 · 失败");
    await detail.getByRole("button", { name: "重试该效果" }).click();
    await expect(detail).toContainText("创建任务 · 已完成");
    const tasks = await call<{ id: string }[]>(page, "tasks.list", {});
    expect(tasks.map(({ id }) => id)).toEqual([summary.taskId]);
    const notices = await call<{ title: string }[]>(page, "notifications.list", {});
    expect(notices.filter((row) => row.title === title)).toHaveLength(1);
  } finally {
    await close();
  }
});

test("AU18 桌面和获邀 Web 同步显示同一次通知和发生", async ({ browserName: _browserName }) => {
  const { page, close } = await openApp();
  let browser: Browser | undefined;
  const title = "同一 Engine 的通知";
  try {
    await engineReady(page);
    await call(page, "web.share.start", { mode: "local", port: 0 });
    const invitation = await call<{ links: string[] }>(page, "web.invitations.create", {});
    browser = await chromium.launch();
    const web = await browser.newPage();
    await web.goto(invitation.links[0]!);
    for (const client of [page, web]) {
      await client.getByTestId("bell").click();
      await expect(client.getByTestId("notice-item")).toHaveCount(0);
    }
    const rule = await call<{ id: string; version: string }>(page, "automations.create", {
      title,
      trigger: { preset: "custom", cron: "0 0 1 1 *", zone: "UTC" },
      action: { kind: "reminder", mode: "notification", text: title },
    });
    const { activationId } = await call<{ activationId: string }>(page, "automations.runNow", {
      id: rule.id,
      expectedVersion: rule.version,
      intentId: randomUUID(),
    });
    for (const client of [page, web]) {
      const notice = client.getByTestId("notice-item").filter({ hasText: title });
      await expect(notice).toHaveCount(1);
      await notice.click();
      const occurrence = client.getByTestId("notification-occurrence");
      await expect(occurrence).toContainText("通知 · 已完成");
      await occurrence.getByText("计划与冻结输入").click();
      await expect(occurrence).toContainText(activationId);
    }
  } finally {
    await browser?.close();
    await close();
  }
});

test("AW2：模板只填草稿，目录组合筛选并保留原计划身份", async () => {
  const { page, close } = await openApp();
  try {
    await engineReady(page);
    const automations = page.getByRole("navigation", { name: "功能图标栏" }).getByRole("button", { name: "自动化", exact: true });
    await expect(automations).toBeVisible({ timeout: 10_000 });
    await automations.click({ timeout: 10_000 });
    const center = page.getByTestId("plan-directory");
    const rows = center.getByTestId("rule-row");
    await expect(center).toContainText("尚无计划");
    const templates = center.getByRole("button", { name: "从模板新建" });
    await expect
      .poll(() =>
        templates.evaluate((control) => {
          const host = control.closest(".automations-center-host")!;
          const surface = host.parentElement!;
          const box = control.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return { fillsSurface: host.clientWidth === surface.clientWidth && host.clientWidth > 0, clickable: control.contains(hit) };
        }),
      )
      .toEqual({ fillsSurface: true, clickable: true });
    await templates.click();
    await page.getByRole("button", { name: "使用模板 · 周期提醒" }).click();
    await expect(page.getByLabel("规则名称")).toHaveValue("周期提醒");
    await page.getByTestId("rule-editor").getByRole("button", { name: "取消", exact: true }).click();
    const list = () => call<{ plans: PlanSummary[] }>(page, "automations.plans.list", {});
    expect((await list()).plans).toHaveLength(0);
    await center.getByRole("button", { name: "从模板新建" }).click();
    await page.getByRole("button", { name: "使用模板 · 周期提醒" }).click();
    await page.getByLabel("通知内容").fill("写周报");
    await page.getByTestId("rule-save").click();
    await expect(center.getByTestId("rule-detail").getByRole("heading", { name: "周期提醒", exact: true })).toBeVisible();
    const [plan] = (await list()).plans;
    expect(plan).toMatchObject({ title: "周期提醒", intent: "paused" });
    await center.getByRole("button", { name: "返回计划目录", exact: true }).click();
    await center.getByLabel("来源", { exact: true }).selectOption("automations");
    await center.getByLabel("状态", { exact: true }).selectOption("paused");
    await center.getByLabel("搜索计划").fill("周期");
    await expect(rows).toHaveCount(1);
    await center.getByRole("button", { name: "更多操作 · 周期提醒" }).click();
    await expect(center.getByTestId("rule-detail")).toHaveCount(0);
    await page.getByRole("dialog", { name: "计划操作" }).getByRole("button", { name: "关闭" }).click();
    await rows.first().click();
    await expect(page).toHaveURL(new RegExp(`automation-plan=${plan!.planId}`));
    await center.getByRole("button", { name: "返回计划目录", exact: true }).click();
    await expect(rows.first()).toBeFocused();
    await center.getByLabel("搜索计划").fill("没有匹配值");
    await expect(center).toContainText("没有匹配的计划");
    await expect(center).not.toContainText("尚无计划");
  } finally {
    await close();
  }
});

test("AW3：扫描草稿预览无写入，关闭保护草稿并保留并发冲突输入", async () => {
  const { page, close } = await openApp();
  const engineCall = <T>(capability: string, input: object) => test.step(`Engine ${capability}`, () => call<T>(page, capability, input, undefined, 8_000), { timeout: 10_000 });
  try {
    await test.step("等待桌面 Engine 就绪", () => engineReady(page), { timeout: 23_000 });
    await engineCall("tasks.create", { title: "人工任务 · 仅供预览" });
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    const center = page.getByTestId("plan-directory");
    await center.getByRole("button", { name: "从模板新建" }).click();
    await page.getByRole("button", { name: "使用模板 · 扫描 Agent 任务" }).click();
    const dialog = page.getByTestId("rule-dialog");
    const editor = dialog.getByTestId("rule-editor");
    await editor.getByLabel("派遣窗口").selectOption("week");
    await editor.getByLabel("包括逾期").check();
    await editor.getByLabel("每次并发上限").fill("3");
    await editor.getByTestId("rule-instruction").fill("初版草稿");
    await editor.getByRole("button", { name: "预览候选" }).click();
    await expect(editor.getByRole("region", { name: "候选预览" })).toContainText("人工任务 · 仅供预览");
    expect(await engineCall("automations.activations", {})).toEqual([]);
    expect(await engineCall("automations.list", {})).toEqual([]);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "放弃未保存的更改？" }).getByRole("button", { name: "继续编辑" }).click();
    await expect(editor.getByTestId("rule-instruction")).toHaveValue("初版草稿");
    await editor.getByTestId("rule-save").click();
    await expect(dialog).toBeHidden();

    await center.getByTestId("rule-edit").click();
    await expect(editor.getByLabel("派遣窗口")).toHaveValue("week");
    await expect(editor.getByLabel("每次并发上限")).toHaveValue("3");
    await expect(editor.getByLabel("包括逾期")).toBeChecked();
    const [rule] = await engineCall<{ id: string; version: string }[]>("automations.list", {});
    await editor.getByTestId("rule-instruction").fill("并发时保留这份输入");
    await engineCall("automations.update", { id: rule!.id, expectedVersion: rule!.version, patch: { title: "另一个客户端已更新" } });
    await editor.getByTestId("rule-save").click();
    await expect(page.getByRole("region", { name: "当前计划版本" })).toContainText("另一个客户端已更新");
    await expect(editor.getByTestId("rule-instruction")).toHaveValue("并发时保留这份输入");
    await page.getByRole("button", { name: "保留草稿并采用当前修订" }).click();
    await editor.getByTestId("rule-save").click();
    await expect(dialog).toBeHidden();
    await expect(center.getByTestId("rule-detail").getByRole("heading", { name: "另一个客户端已更新" })).toBeVisible();
    expect(await engineCall("automations.read", { id: rule!.id })).toMatchObject({
      id: rule!.id,
      body: "并发时保留这份输入",
      data: { title: "另一个客户端已更新" },
    });
  } finally {
    await test.step("关闭桌面夹具", close, { timeout: 15_000 });
  }
});

test("AW3：暂停规则的手动请求断线后从原意图核实", async () => {
  const { page, close } = await openApp();
  const title = "手动核实的提醒";
  type Rule = { id: string; version: string; data: { enabled: boolean } };
  try {
    await engineReady(page);
    const rule = await call<Rule>(page, "automations.create", {
      title,
      trigger: { preset: "custom", cron: "0 0 1 1 *", zone: "UTC" },
      action: { kind: "reminder", mode: "notification", text: title },
    });
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByTestId("rule-row").filter({ hasText: title }).click();
    const requests: { intentId: string; idempotencyKey: string }[] = [];
    await page.route("**/api/v1/call", async (route) => {
      const request = route.request().postDataJSON() as { capability: string; input: { intentId: string }; idempotencyKey: string };
      if (request.capability !== "automations.runNow") return route.continue();
      requests.push({ intentId: request.input.intentId, idempotencyKey: request.idempotencyKey });
      if (requests.length > 1) return route.continue();
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort();
    });
    const detail = page.getByTestId("rule-detail");
    await detail.getByRole("button", { name: "立即运行", exact: true }).click();
    await expect(detail.getByRole("button", { name: "核对原运行", exact: true })).toBeVisible();
    await detail.getByRole("button", { name: "核对原运行", exact: true }).click();
    await detail.getByRole("button", { name: "查看本次运行" }).click();
    await expect(page.getByRole("dialog", { name: "运行详情" })).toContainText("立即运行");
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    const records = await call<{ ruleId: string; trigger: string }[]>(page, "automations.activations", {});
    expect(records.filter(({ ruleId }) => ruleId === rule.id)).toMatchObject([{ trigger: "manual" }]);
    const saved = await call<Rule>(page, "automations.read", { id: rule.id });
    expect(saved).toMatchObject({ id: rule.id, version: rule.version, data: { enabled: false } });
  } finally {
    await close();
  }
});

test("AW3：独立 Web 窄容器保留编辑内容和返回焦点", async () => {
  const { page, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await engineReady(page);
    await call(page, "automations.create", {
      title: "需要在窄容器里完整显示的中文周期提醒名称",
      trigger: { preset: "custom", cron: "0 9 1 * *", zone: "Asia/Taipei" },
      action: { kind: "reminder", mode: "notification", text: "原通知" },
    });
    await call(page, "web.share.start", { mode: "local", port: 0 });
    const invitation = await call<{ links: string[] }>(page, "web.invitations.create", {});
    browser = await chromium.launch();
    const web = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await web.goto(invitation.links[0]!);
    await web.getByRole("button", { name: "自动化", exact: true }).first().click();
    const row = web.getByTestId("rule-row").first();
    await row.click();
    await web.getByTestId("rule-edit").click();
    const editor = web.getByTestId("rule-editor");
    await expect(editor.getByLabel("cron 表达式")).toHaveValue("0 9 1 * *");
    await editor.getByLabel("通知内容").fill("窄工作台输入");
    const dialog = web.getByTestId("rule-dialog");
    await expect(dialog).toContainText("做什么");
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await editor.getByTestId("rule-save").click();
    await expect(dialog).toBeHidden();
    await expect(web.getByTestId("rule-detail")).toContainText("窄工作台输入");
    await web.getByRole("button", { name: "返回计划目录" }).click();
    await expect(row).toBeFocused();
  } finally {
    await browser?.close();
    await close();
  }
});

test("AW5：筛选原发生和逐项效果，重新读取不会再次发送通知", async () => {
  const { page, close } = await openApp();
  try {
    await engineReady(page);
    const rule = await call<{ id: string; version: string }>(page, "automations.create", {
      title: "检查原通知效果",
      trigger: { preset: "custom", cron: "0 0 1 1 *", zone: "UTC" },
      action: { kind: "reminder", mode: "notification", text: "只发送一次的通知" },
    });
    const occurrence = await call<{ activationId: string }>(page, "automations.runNow", {
      id: rule.id,
      expectedVersion: rule.version,
      intentId: randomUUID(),
    });
    await page.getByRole("button", { name: "自动化", exact: true }).first().click();
    await page.getByRole("button", { name: "激活记录", exact: true }).click();
    await page.getByRole("searchbox", { name: "搜索发生" }).fill("检查原通知");
    const row = page.getByTestId("activation-row");
    await expect(row).toHaveCount(1);
    const open = row.getByRole("button", { name: "检查原通知效果" });
    await open.click();
    const detail = page.getByTestId("occurrence-inspector");
    await expect(detail.getByRole("listitem").filter({ hasText: "通知" })).toContainText("已完成");
    await detail.getByText("计划与冻结输入", { exact: true }).click();
    await expect(detail.getByText(occurrence.activationId, { exact: true })).toBeVisible();
    await detail.getByRole("button", { name: "重新读取原发生" }).click();
    await expect(detail.getByRole("listitem").filter({ hasText: "通知" })).toHaveCount(1);
    await detail.getByRole("button", { name: "关闭" }).click();
    await expect(open).toBeFocused();
    const all = await call<{ activationId: string; ruleId: string }[]>(page, "automations.activations", {});
    expect(all.filter(({ ruleId }) => ruleId === rule.id).map(({ activationId }) => activationId)).toEqual([occurrence.activationId]);
  } finally {
    await close();
  }
});

test("AW4 AU16 专注来源与中心共享计划修订和下次时间", async () => {
  const { page, close } = await openApp();
  try {
    await engineReady(page);
    const focus = page.getByTestId("card-focus");
    await focus.getByTestId("focus-start").click();
    const readFocus = () => call<{ running: boolean; endsAt: string | null; plan: { planId: string; revision: string } }>(page, "home.focus.get", {});
    await expect.poll(readFocus).toMatchObject({ running: true, plan: { planId: expect.any(String) } });
    const source = await readFocus();
    const read = () => call<PlanSummary>(page, "automations.plans.read", { planId: source.plan.planId });
    expect(await read()).toMatchObject({ ...source.plan, intent: "enabled", nextAt: source.endsAt });
    const eligible = await call<{ plans: PlanSummary[] }>(page, "automations.plans.list", { state: "enabled", order: "next", limit: 1 });
    const summary = await call<{ next: PlanSummary | null }>(page, "automations.plans.summary", {});
    expect(summary.next).toMatchObject({ planId: eligible.plans[0]?.planId, revision: eligible.plans[0]?.revision, nextAt: eligible.plans[0]?.nextAt });
    await focus.getByRole("button", { name: "在自动化中心管理计划" }).click();
    const inspector = page.getByTestId("rule-detail");
    await expect(inspector.getByRole("heading", { name: "专注计时" })).toBeVisible();
    await inspector.getByRole("button", { name: "暂停", exact: true }).click();
    await expect.poll(read).toMatchObject({ planId: source.plan.planId, intent: "paused", nextAt: null });
    expect(await readFocus()).toMatchObject({ running: false, plan: { planId: source.plan.planId, revision: (await read()).revision } });
    await inspector.getByRole("button", { name: "打开专注" }).click();
    await expect(focus.getByTestId("focus-start")).toBeVisible();
    await focus.getByTestId("focus-start").click();
    await expect.poll(read).toMatchObject({ planId: source.plan.planId, intent: "enabled" });
  } finally {
    await close();
  }
});

test("AW6 AU16 AU17 获邀 Web 在任务来源管理原提醒，停用来源时中心显示准确状态", async ({ browserName: _browserName }) => {
  const { page: desktop, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await engineReady(desktop);
    const task = await call<{ id: string }>(desktop, "tasks.create", { title: "核对采购付款", type: "human" });
    const intentId = randomUUID();
    const scheduledFor = new Date(Date.now() + 86_400_000).toISOString();
    const reminder = await call<PlanSummary>(
      desktop,
      "automations.plans.createTaskReminder",
      {
        taskId: task.id,
        scheduledFor,
        intentId,
        startPaused: true,
      },
      intentId,
    );
    const { planId } = reminder;
    const read = () => call<PlanSummary>(desktop, "automations.plans.read", { planId });

    await call(desktop, "web.share.start", { mode: "local", port: 0 });
    const invitation = await call<{ links: string[] }>(desktop, "web.invitations.create", {});
    browser = await chromium.launch();
    const web = await browser.newPage();
    await web.goto(invitation.links[0]!);
    await engineReady(web);
    for (const client of [desktop, web]) {
      await client.getByRole("navigation", { name: "功能图标栏" }).getByRole("button", { name: "自动化", exact: true }).click();
      const row = client.getByTestId("plan-directory").locator(`[data-plan-id="${planId}"]`);
      await row.getByTestId("rule-row").click();
      await expect(client.getByTestId("rule-detail")).toContainText("任务提醒：核对采购付款");
    }
    const detail = web.getByTestId("rule-detail");
    await detail.getByRole("button", { name: "打开来源任务" }).click();
    const reminders = web.getByTestId("detail-reminders");
    const sourceRow = reminders.locator(`[data-plan-id="${planId}"]`);
    await expect(sourceRow.locator("time")).toHaveAttribute("datetime", scheduledFor);
    await sourceRow.getByRole("button", { name: "启用", exact: true }).click();
    await expect.poll(read).toMatchObject({ planId, intent: "enabled", nextAt: scheduledFor });
    const enabled = await read();
    expect(enabled.revision).not.toBe(reminder.revision);
    await expect(desktop.getByTestId("rule-detail").locator("time")).toHaveAttribute("datetime", scheduledFor);
    await sourceRow.getByRole("button", { name: "在中心管理 · 任务提醒：核对采购付款" }).click();
    await expect(detail.locator("time")).toHaveAttribute("datetime", scheduledFor);

    await call(desktop, "plugins.setEnabled", { id: "tasks", enabled: false });
    await expect(detail).toContainText("来源插件未启用");
    await expect(detail.getByRole("button", { name: "打开来源任务" })).toHaveCount(0);
    expect(await read()).toMatchObject({ planId, revision: enabled.revision, nextAt: null, availability: { state: "blocked", reason: "plugin-disabled" } });
    await detail.getByRole("button", { name: "暂停", exact: true }).click();
    await expect.poll(read).toMatchObject({ planId, intent: "paused", nextAt: null });

    await call(desktop, "plugins.setEnabled", { id: "tasks", enabled: true });
    await expect(detail.getByRole("button", { name: "打开来源任务" })).toBeVisible();
    await detail.getByRole("button", { name: "打开来源任务" }).click();
    await expect(sourceRow).toContainText("已暂停");
    await expect(sourceRow.locator("time")).toHaveAttribute("datetime", scheduledFor);
  } finally {
    await browser?.close();
    await close();
  }
});

test("同一 Vault 的双端目录列出每个来源并同步修订", async () => {
  test.setTimeout(90_000);
  await openDomainPlans(async ({ page, mail, git, gitPull, ssh }) => {
    const [space] = await call<{ id: string }[]>(page, "agent.spaces.list", {});
    const task = await call<TaskDto>(page, "tasks.create", {
      title: "双端原任务",
      type: "agent",
      execution: { spaceId: space!.id, provider: "codex" },
    });
    const scheduledFor = new Date(Date.now() + 86_400_000).toISOString();
    const remind = randomUUID();
    const reminder = await call<PlanSummary>(page, "automations.plans.createTaskReminder", { taskId: task.id, scheduledFor, intentId: remind }, remind);
    const followUp = await call<{ planId: string }>(page, "automations.followUps.schedule", { taskId: task.id, scheduledFor, expectedRevision: null });
    const [spaceVersion] = await call<{ id: string; revision: number }[]>(page, "agent.spaces.list", {});
    const session = await call<{ id: string }>(page, "agent.sessions.launch", {
      provider: "shell",
      spaceId: spaceVersion!.id,
      spaceRevision: spaceVersion!.revision,
      command: "sleep 90",
      requestId: randomUUID(),
    });
    const observations = [];
    for (const [title, target] of [
      ["任务观察", { kind: "task", id: task.id }],
      ["会话观察", { kind: "agent-session", id: session.id }],
    ] as const) {
      const intentId = randomUUID();
      observations.push(
        await call<PlanSummary>(
          page,
          "automations.plans.createObservation",
          {
            title,
            target,
            everySeconds: 60,
            condition: { kind: "change" },
            intentId,
          },
          intentId,
        ),
      );
    }
    const { plan: focus } = await call<{ plan: Pick<PlanSummary, "planId" | "revision"> }>(page, "home.focus.update", { action: "start" });
    const cron = await call<{ id: string }>(page, "automations.create", {
      title: "规则提醒",
      trigger: { preset: "custom", cron: "0 0 1 1 *", zone: "UTC" },
      action: { kind: "reminder", mode: "notification", text: "规则提醒" },
    });
    const book = await call<{ id: string; revision: string }>(page, "ledger.books.create", {
      name: "双端账本",
      defaultCurrency: "TWD",
      timeZone: "Asia/Taipei",
      firstAccount: { name: "银行", type: "bank" },
    });
    const { accounts, businessDate } = await call<{ accounts: { id: string }[]; businessDate: string }>(page, "ledger.accounts.list", { bookId: book.id });
    const { plan: ledger } = await call<{ plan: PlanSummary }>(page, "ledger.recurring.create", {
      bookId: book.id,
      expectedRevision: book.revision,
      rule: {
        id: randomUUID(),
        title: "双端账本计划",
        type: "expense",
        accountId: accounts[0]!.id,
        currency: "TWD",
        amountMinor: "7500",
        startOn: new Date(Date.parse(businessDate) + 86_400_000).toISOString().slice(0, 10),
        frequency: "monthly",
        memo: null,
      },
    });

    const browser = await chromium.launch();
    try {
      const web = await invitePlans(page, browser);
      const known = [mail.planId, git.planId, gitPull.planId, ssh.planId, reminder.planId, followUp.planId, ...observations.map(({ planId }) => planId), focus.planId, cron.id, ledger.planId];
      const [desktopDirectory, webDirectory] = await Promise.all([openPlanDirectory(page), openPlanDirectory(web)]);
      const project = async (client: Page) =>
        (await listPlans(client)).plans
          .filter(({ planId }) => known.includes(planId))
          .map(({ planId, revision, source }) => ({ planId, revision, source }))
          .sort((a, b) => a.planId.localeCompare(b.planId));
      expect((await project(page)).map(({ planId }) => planId)).toEqual([...known].sort((a, b) => a.localeCompare(b)));
      expect(await project(web)).toEqual(await project(page));
      for (const center of [desktopDirectory, webDirectory])
        for (const planId of known) {
          await expect(center.locator(`[data-plan-id="${planId}"]`)).toBeVisible();
        }

      for (const [author, stale, observing] of [
        [page, web, webDirectory],
        [web, page, desktopDirectory],
      ] as const) {
        const snapshot = (await readPlan(stale, reminder.planId))!;
        const newDate = new Date(Date.parse((snapshot.trigger as { scheduledFor: string }).scheduledFor) + 3_600_000).toISOString();
        const reschedule = { change: "reschedule", trigger: { kind: "once", scheduledFor: newDate } } as const;
        const current = await changePlan(author, snapshot, reschedule);
        expect(current).toMatchObject({ outcome: "completed", plan: { revision: expect.not.stringMatching(snapshot.revision), trigger: reschedule.trigger } });
        const row = observing.locator(`[data-plan-id="${reminder.planId}"]`);
        await row.getByTestId("rule-row").click();
        await expect(observing.getByTestId("rule-detail").locator("time").first()).toHaveAttribute("datetime", newDate);
        for (const change of [reschedule, { change: "set-intent", intent: "paused" }, { change: "delete" }] as const) {
          expect(await changePlan(stale, snapshot, change)).toMatchObject({ outcome: "not-accepted", error: { code: "VERSION_CONFLICT" } });
        }
        expect(await readPlan(stale, reminder.planId)).toMatchObject({ revision: current.plan!.revision, intent: "enabled" });
      }
      const pause = await changePlan(web, (await readPlan(web, reminder.planId))!, { change: "set-intent", intent: "paused" });
      expect(pause).toMatchObject({ outcome: "completed", plan: { intent: "paused" } });
      await expect(desktopDirectory.locator(`[data-plan-id="${reminder.planId}"]`)).toContainText("已暂停");
      expect(await changePlan(page, pause.plan!, { change: "delete" })).toMatchObject({ outcome: "completed" });
      await expect(webDirectory.locator(`[data-plan-id="${reminder.planId}"]`)).toHaveCount(0);
    } finally {
      await browser.close();
    }
  });
});

test("停用、换实例和切库后受阻状态正确，删除的计划不复活", async () => {
  test.setTimeout(300_000);
  await openDomainPlans(async ({ page, vault, sandbox, mail, git, gitPull, ssh, samples, saveMail, configureGit, alternateRemote, deliverMail, mailAccountId }) => {
    const read = (plan: PlanSummary) => readPlan(page, plan.planId);
    const original = samples();
    await expect.poll(async () => (await read(mail))!.lastOccurrence?.state, { timeout: 75_000, intervals: [1_000] }).toBe("completed");
    expect(samples().mail).toBeGreaterThan(original.mail);
    const firstMail = (await read(mail))!.lastOccurrence!;
    const previousMailReads = samples().mail;
    const uid = deliverMail();
    await expect
      .poll(
        async () => {
          const current = (await read(mail))!.lastOccurrence;
          return current?.occurrenceId === firstMail.occurrenceId ? null : current;
        },
        { timeout: 75_000, intervals: [1_000] },
      )
      .toMatchObject({ state: "completed" });
    expect(samples().mail).toBeGreaterThan(previousMailReads);
    expect(await call(page, "mail.messages.latest", { accountId: mailAccountId, folder: "INBOX" })).toMatchObject({ message: { uid } });
    expect(samples().git).toBeGreaterThan(original.git);
    expect(samples().ssh).toBeGreaterThan(original.ssh + 1);
    const firstGit = (await read(git))!.lastOccurrence!;
    expect(firstGit.occurrenceId).toBeTruthy();
    await call(page, "plugins.setEnabled", { id: "versioning", enabled: false });
    try {
      expect(await read(git)).toMatchObject({ intent: "enabled", nextAt: null, availability: { state: "blocked", reason: "plugin-disabled" } });
    } finally {
      await call(page, "plugins.setEnabled", { id: "versioning", enabled: true });
    }
    const deleted = [mail, ssh, gitPull];
    for (const plan of deleted) expect(await changePlan(page, (await read(plan))!, { change: "delete" })).toMatchObject({ outcome: "completed" });
    await configureGit(alternateRemote);
    expect(await call<PlanOccurrence>(page, "automations.plans.readOccurrence", { occurrenceId: firstGit.occurrenceId })).toMatchObject({
      occurrenceId: firstGit.occurrenceId,
      plan: { planId: git.planId, revision: git.revision },
    });
    await saveMail("replacement");
    const afterSetup = samples();
    const open = async (location: string, kind: "new" | "open", readOnly = false) => {
      expect(await page.evaluate(({ location, kind, readOnly }) => window.huhuHost.vault.open(location, { kind, readOnly }), { location, kind, readOnly })).toMatchObject({ ok: true });
      await page.reload();
      await engineReady(page);
    };
    const clone = path.join(sandbox, "copy");
    const other = path.join(sandbox, "other");
    mkdirSync(other);
    await open(other, "new");
    expect((await listPlans(page)).plans.map(({ planId }) => planId)).not.toContain(git.planId);
    const paths = [".huhu/vault.json", ".huhu/automations/periodic-plans.json"];
    for (const file of paths) {
      mkdirSync(path.dirname(path.join(clone, file)), { recursive: true });
      copyFileSync(path.join(vault, file), path.join(clone, file));
    }
    await open(clone, "open");
    expect(await read(git)).toMatchObject({ nextAt: null, availability: { state: "blocked", reason: "foreign-owner" } });
    await open(vault, "open", true);
    expect(await read(git)).toMatchObject({ nextAt: null, availability: { state: "blocked", reason: "read-only" } });
    await open(vault, "open");
    for (const plan of deleted) {
      expect(await read(plan)).toMatchObject({ intent: "deleted", nextAt: null });
      expect((await listPlans(page)).plans.map(({ planId }) => planId)).not.toContain(plan.planId);
    }
    const completedOldCycle = Date.now() + 62_000;
    const next = (await read(git))!.lastOccurrence;
    await expect.poll(async () => (await read(git))!.lastOccurrence?.occurrenceId, { timeout: 45_000 }).not.toBe(next?.occurrenceId);
    await expect.poll(Date.now, { timeout: 68_000, intervals: [1_000] }).toBeGreaterThan(completedOldCycle);
    expect(samples()).toEqual(afterSetup);
  });
});

test("旧提醒候选取消，评论效果中断后按原发生核实", async () => {
  test.setTimeout(100_000);
  const { page, vault, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await engineReady(page);
    const task = await call<TaskDto>(page, "tasks.create", { title: "提醒与评论的原任务", type: "human" });
    const oldSlot = new Date(Date.now() + 8_000).toISOString();
    const intentId = randomUUID();
    const reminder = await call<PlanSummary>(page, "automations.plans.createTaskReminder", { taskId: task.id, scheduledFor: oldSlot, intentId }, intentId);
    const oldOccurrence = planReminderOccurrenceId({ ...reminder, scheduledFor: oldSlot });
    expect(await changePlan(page, reminder, { change: "reschedule", trigger: { kind: "once", scheduledFor: new Date(Date.now() + 86_400_000).toISOString() } })).toMatchObject({ outcome: "completed" });
    const observe = randomUUID();
    const plan = await call<PlanSummary>(
      page,
      "automations.plans.createObservation",
      {
        title: "观察后的原评论",
        target: { kind: "task", id: task.id },
        effect: "comment",
        everySeconds: 1,
        condition: { kind: "threshold", status: "not_started", seconds: 1 },
        repeat: false,
        intentId: observe,
      },
      observe,
    );
    const comments = async () => (await call<TaskDto>(page, "tasks.read", { id: task.id })).comments.filter(({ event }) => event === "observation");
    await expect.poll(comments, { timeout: 20_000 }).toHaveLength(1);
    await expect.poll(async () => (await readPlan(page, plan.planId))?.lastOccurrence?.state).toBe("completed");
    const { occurrenceId } = (await readPlan(page, plan.planId))!.lastOccurrence!;
    const filename = path.join(vault, ".huhu", "automations", "reminder-deliveries", `${occurrenceId}.json`);
    const record = JSON.parse(readFileSync(filename, "utf8")) as object;
    // Reproduce a lost checkpoint after the visible comment has committed.
    writeFileSync(filename, JSON.stringify({ ...record, comment: "writing", finishedAt: null }) + "\n");
    expect(await changePlan(page, (await readPlan(page, plan.planId))!, { change: "set-intent", intent: "paused" })).toMatchObject({ outcome: "completed" });
    browser = await chromium.launch();
    const web = await invitePlans(page, browser);
    for (const client of [page, web]) {
      await openPlanDirectory(client);
      await client.getByRole("button", { name: "激活记录", exact: true }).click();
      await client.getByRole("searchbox", { name: "搜索发生" }).fill("观察后的原评论");
      await client.getByTestId("activation-row").getByRole("button", { name: "观察后的原评论" }).click();
      const panel = client.getByTestId("occurrence-inspector");
      await expect(panel).toContainText("写入任务评论 · 待核实");
      await panel.getByText("计划与冻结输入", { exact: true }).click();
      await expect(panel.getByText(occurrenceId, { exact: true })).toBeVisible();
    }
    await web.getByTestId("occurrence-inspector").getByRole("button", { name: "核实该效果" }).click();
    for (const client of [page, web]) {
      const panel = client.getByTestId("occurrence-inspector");
      if (client === page) await panel.getByRole("button", { name: "重新读取原发生" }).click();
      await expect(panel).toContainText("写入任务评论 · 已完成");
    }
    expect(await comments()).toMatchObject([{ id: expect.any(String), body: "观察后的原评论：未开始" }]);
    await expect.poll(Date.now, { timeout: 12_000 }).toBeGreaterThan(Date.parse(oldSlot));
    expect(await call(page, "automations.plans.readOccurrence", { occurrenceId: oldOccurrence })).toBeNull();
    expect((await call<{ title: string }[]>(page, "notifications.list", {})).map(({ title }) => title)).not.toContain("任务提醒：提醒与评论的原任务");
  } finally {
    try {
      await browser?.close();
    } finally {
      await close();
    }
  }
});
