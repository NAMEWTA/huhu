import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { TaskExecutionSchema, type ExecutionBinding, type ExecutionReceipt, type TaskDto } from "../../../packages/contracts/src/index.js";
import { executionReceiptIdentity } from "../../../packages/contracts/src/execution-receipt-engine.js";
import { machineId, VaultFiles } from "../../../packages/vault/src/index.js";
import { operationIdFor, OutboxStorage } from "../../../plugins/mail/src/engine/outbox-storage.js";
import { openImapFixture } from "../../../plugins/mail/test/fixtures/imap.js";
import { DispatchStore, eventIdOf, fingerprint, type DispatchSnapshot } from "../../../plugins/tasks/src/engine/dispatch-store.js";
import { openApp } from "../helpers/launch.js";
import { call, engineReady } from "../knowledge/session-slow-bridge.js";

const navigate = (page: Page, name: string) => page.locator('[data-region="rail"]').getByRole("button", { name, exact: true }).click();

test("F07：丢失转换响应后重开工作台，三类转换只返回原目标", async () => {
  const { page, close } = await openApp();
  type Conversion = { result: { kind: "task" | "note" | "archive"; id: string }; status: string };
  let lostFor: string | undefined;
  let first: Conversion | undefined;
  try {
    await engineReady(page);
    await call(page, "archives.types.save", { name: "转换资料", fields: [] });
    await page.route("**/api/v1/call", async (route) => {
      const body = route.request().postDataJSON();
      if (body?.capability !== "inbox.convert" || body.input?.id !== lostFor) return route.continue();
      lostFor = undefined;
      const response = await route.fetch();
      const payload = await response.json();
      expect(payload).toMatchObject({ ok: true });
      first = payload.data;
      await route.abort();
    });
    for (const target of ["task", "note", "archive"] as const) {
      const title = `转换原件-${target}`;
      const body = "第一段中文。\n\n- 第二段";
      const capture = await call<{ id: string; version: string }>(page, "inbox.capture", { title, body });
      const fields = target === "task" ? { title, body } : { name: title, body, ...(target === "archive" ? { type: "转换资料" } : {}) };
      const input = { id: capture.id, expectedVersion: capture.version, target, fields };
      lostFor = capture.id;
      first = undefined;
      await expect(call(page, "inbox.convert", input)).rejects.toThrow();
      expect(first).toMatchObject({ status: "processed", result: { kind: target, id: expect.any(String) } });
      await page.reload();
      await engineReady(page);
      const replay = await call<Conversion>(page, "inbox.convert", input);
      expect(replay.result).toEqual(first!.result);
      const list = target === "task" ? "tasks.list" : target === "note" ? "notes.list" : "archives.list";
      const rows = await call<{ title?: string; name?: string }[]>(page, list, target === "task" ? { category: "all" } : {});
      expect(rows.filter((row) => (row.title ?? row.name) === title)).toHaveLength(1);
      await call(page, "inbox.dismiss", { id: capture.id });
      const restored = await call<Conversion>(page, "inbox.restore", { id: capture.id });
      expect(restored).toMatchObject({ status: "processed", result: replay.result });
    }
  } finally {
    await close();
  }
});

test("UX05：窄窗口可填写长中文、多个标签与 Agent 日期字段，保存后可重新打开", async () => {
  const { app, page, vault, close } = await openApp();
  const title = "长中文任务标题用于核对窄窗口中名称和正文仍然获得可编辑的空间";
  const text = "第一段需要保留完整中文。第二段用于再次打开时验证。";
  const tags = ["准备阶段", "跨团队复核", "必须保留同一个任务"];
  try {
    await engineReady(page);
    const space = await call<{ id: string }>(page, "agent.spaces.save", { name: "窄栏任务工作区", root: vault });
    await page.route("**/api/v1/call", async (route) => {
      if (route.request().postDataJSON()?.capability !== "agent.catalog.detect") return route.continue();
      return route.fulfill({ json: { ok: true, data: [{ id: "codex", displayName: "Codex", headless: true, installed: true }] } });
    });
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      win.setMinimumSize(400, 560);
      win.setContentSize(460, 640);
    });
    await navigate(page, "任务");
    await page.getByTestId("task-new").click();
    const dialog = page.getByTestId("task-editor");
    const type = dialog.getByTestId("task-type");
    await expect(type.locator("option:checked")).toHaveText("个人待办");
    await dialog.getByLabel("任务名称").fill(title);
    const body = dialog.getByTestId("task-body").locator(".ProseMirror");
    await body.fill(text);
    const label = dialog.getByRole("textbox", { name: "标签" });
    for (const tag of tags) {
      await label.fill(tag);
      await label.press("Enter");
    }
    await dialog.getByTestId("task-due").fill("2026-12-18");
    await type.selectOption("agent");
    await dialog.getByRole("combobox", { name: "工作目录（Space）" }).selectOption(space.id);
    await dialog.getByRole("combobox", { name: "任务Agent CLI" }).selectOption("codex");
    await expect.poll(() => dialog.locator(".hu-form-grid").evaluate((grid) => {
      const primary = grid.querySelector(".hu-form-primary")!.getBoundingClientRect();
      const aside = grid.querySelector(".hu-form-aside")!.getBoundingClientRect();
      return { stacked: aside.top >= primary.bottom, noHorizontalScroll: grid.scrollWidth <= grid.clientWidth + 1 };
    })).toEqual({ stacked: true, noHorizontalScroll: true });
    const save = dialog.getByTestId("task-save");
    await expect(save).toBeInViewport();
    await save.click();
    await expect(dialog).toBeHidden();
    const tasks = await call<{ id: string; title: string }[]>(page, "tasks.list", { category: "all" });
    const task = tasks.find((row) => row.title === title)!;
    await expect.poll(() => call(page, "tasks.read", { id: task.id })).toMatchObject({
      title, body: text, tags, due: "2026-12-18", type: "agent", execution: { provider: "codex", spaceId: space.id },
    });
    await page.getByRole("button", { name: `打开任务 ${title}` }).click();
    await page.getByTestId("detail-edit").click();
    await expect(dialog.getByLabel("任务名称")).toHaveValue(title);
    await expect(body).toHaveText(text);
  } finally {
    await close();
  }
});

test("UX06：快速捕获的斜线菜单在模态框内，中文正文和来源可保存并核实原转换", async () => {
  const { page, close } = await openApp();
  const title = "快速捕获，保留来源和正文";
  try {
    await engineReady(page);
    await navigate(page, "收件箱");
    await page.getByRole("button", { name: "快速捕获", exact: true }).click();
    const dialog = page.getByTestId("quick-capture-dialog");
    await dialog.getByRole("textbox", { name: "标题" }).fill(title);
    await dialog.getByRole("combobox", { name: "来源" }).selectOption("import");
    const editor = dialog.getByLabel("内容", { exact: true });
    await editor.click();
    await page.keyboard.type("/");
    const heading = dialog.locator('[data-slash-command="heading2"]');
    await expect(heading).toBeVisible();
    await expect.poll(() => heading.evaluate((item) => {
      const { x, y, width, height } = item.getBoundingClientRect();
      return item.contains(document.elementFromPoint(x + width / 2, y + height / 2));
    })).toBe(true);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(heading).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(editor).toBeFocused();
    await editor.fill("");
    await page.keyboard.type("/");
    await heading.click();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", { text: "zhongwen", selectionStart: 8, selectionEnd: 8 });
    await cdp.send("Input.insertText", { text: "中文标题" });
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("保留原始正文及第二段。");
    await dialog.getByRole("button", { name: "收进收件箱" }).click();
    await expect(dialog).toBeHidden();
    const captures = () => call<{ id: string; title: string; body: string; source: string; result: { id: string } | null }[]>(page, "inbox.list", {});
    const [capture] = await captures();
    expect(capture).toMatchObject({ title, source: "import" });
    expect(capture!.body).toContain("中文标题");
    expect(capture!.body).toContain("保留原始正文及第二段。");

    let cut = false;
    await page.route("**/api/v1/call", async (route) => {
      if (cut || route.request().postDataJSON()?.capability !== "inbox.convert") return route.continue();
      cut = true;
      expect(await (await route.fetch()).json()).toMatchObject({ ok: true });
      await route.abort();
    });
    await page.getByRole("button", { name: /^转为笔记/ }).click();
    const convert = page.getByTestId("convert-dialog");
    await convert.getByRole("button", { name: "创建笔记并完成处理" }).click();
    await convert.getByRole("button", { name: "核实原转换" }).click();
    await expect(convert).toBeHidden();
    expect(await captures()).toMatchObject([{ id: capture!.id, result: { id: expect.any(String) } }]);
    const notes = await call<{ title: string }[]>(page, "notes.list", {});
    expect(notes.filter((note) => note.title === title)).toHaveLength(1);
  } finally {
    await close();
  }
});

test("UX06：待处理事项只投影原任务、问题和投递，处理后收件项数保持不变", async () => {
  const { page, vault, close } = await openApp();
  try {
    await engineReady(page);
    const captureList = () => call<unknown[]>(page, "inbox.list", {});
    const before = (await captureList()).length;
    const task = await call<TaskDto>(page, "tasks.create", { title: "验收源任务" });
    const agentTask = await call<TaskDto>(page, "tasks.create", { title: "验收等待问题", type: "agent", body: "保留任务和问题绑定" });
    const { id: vaultId } = await call<{ id: string }>(page, "vault.info", {});
    const dispatchId = randomUUID();
    const runId = "run-attention-fixture";
    const at = new Date().toISOString();
    const device = machineId();
    const files = new VaultFiles(path.join(vault, ".huhu"));
    const execution: ExecutionBinding = { vaultId, taskId: agentTask.id, dispatchId, runId, attempt: 1, sessionBinding: {
      machineId: device, sessionId: "attention-session", coreId: "fixture-core", coreAddress: "t9", processGeneration: "fixture-generation", provider: "codex", nativeSessionId: null,
    } };
    const snapshot: DispatchSnapshot = {
      taskId: agentTask.id, inputRevision: agentTask.inputRevision, inputHash: agentTask.inputHash, expectedVersion: agentTask.version, taskVersion: agentTask.version,
      body: agentTask.body, references: [], execution: TaskExecutionSchema.parse({ provider: "codex", spaceId: "fixture-space", target: { mode: "new" } }), source: { kind: "desktop" },
    };
    const store = new DispatchStore(files, vaultId, device);
    await store.create({
      receipt: { taskId: agentTask.id, dispatchId, eventId: eventIdOf(dispatchId), runId, attempt: 1, acceptedAt: at, state: "running", reason: null, cancelRequested: false },
      snapshot, requestHash: fingerprint(snapshot), snapshotHash: fingerprint(snapshot), claim: { at, machineId: device }, boundExecution: execution, startedAt: at, finishedAt: null,
    });
    const receipt: ExecutionReceipt = {
      version: 1, receiptId: randomUUID(), execution, kind: "question",
      payload: { mode: "normal", requestId: "attention-question", requestVersion: 1, text: "确认原任务的问题", options: [] },
    };
    const key = fingerprint(receipt.receiptId);
    await files.write(`tasks/receipts/${key}.json`, Buffer.from(JSON.stringify({
      format: 1, receipt, consumption: { execution, delivery: { receipt: executionReceiptIdentity(receipt), deliveryId: `delivery-${key}`, messageId: `receipt-${key}` } },
      at, status: "delivered",
    })), { expectedVersion: null });
    const outbox = new OutboxStorage(new VaultFiles(vault));
    const mail = [];
    for (const state of ["unknown", "not-delivered"] as const) {
      const draftId = randomUUID();
      const revision = randomUUID();
      const operationId = operationIdFor(draftId, revision);
      const messageId = `<${randomUUID()}@huhu.local>`;
      const subject = state === "unknown" ? "待核实原投递" : "未送达原投递";
      await outbox.write({
        format: 1, operationId, draftId, revision, messageId, claimedAt: at, from: "sender@example.test", auth: "password",
        smtp: { host: "localhost", port: 1, security: "none" },
        draft: { accountId: randomUUID(), to: ["reader@example.test"], cc: [], bcc: [], subject, body: { type: "doc" } }, text: "验收投递",
        result: state === "unknown" ? null : { stage: "data", finishedAt: at, recipients: [{ address: "reader@example.test", state: "not-delivered" }] },
      }, null);
      mail.push({ subject, messageId });
    }
    await page.reload();
    await engineReady(page);
    const openAttention = async () => {
      await navigate(page, "收件箱");
      const details = page.locator(".inbox-attention");
      if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
      return details;
    };
    let detail = await openAttention();
    await detail.getByRole("button", { name: /待处理任务.*验收源任务/ }).click();
    await expect(page.getByTestId("detail-title")).toHaveText(task.title);
    await call(page, "tasks.setStatus", { id: task.id, expectedVersion: task.version, status: "completed" });
    detail = await openAttention();
    await expect(detail.getByRole("button", { name: /待处理任务.*验收源任务/ })).toHaveCount(0);
    await detail.getByRole("button", { name: /等待回答.*验收等待问题/ }).click();
    const question = page.getByTestId("task-run-question").filter({ hasText: "确认原任务的问题" });
    await expect(question).toBeFocused();
    for (const entry of mail) {
      detail = await openAttention();
      await detail.getByRole("button", { name: new RegExp(entry.subject) }).click();
      await expect(page.getByText(entry.messageId, { exact: true })).toBeVisible();
    }
    expect(await captureList()).toHaveLength(before);
  } finally {
    await close();
  }
});

test("UX07：邮件设置按需打开，三栏到窄窗继续阅读、回复草稿与逐收件人结果", async () => {
  const subject = "邮件工作区验收";
  const imap = await openImapFixture({ message: {
    uid: 1, uidValidity: 42, subject,
    source: `From: Sender <sender@example.test>\r\nTo: reader@example.test\r\nSubject: ${subject}\r\nDate: ${new Date().toUTCString()}\r\n\r\nmail fixture original\r\n`,
  } });
  try {
    const { page, vault, close } = await openApp();
    try {
      await engineReady(page);
      await page.setViewportSize({ width: 480, height: 850 });
      await navigate(page, "邮件");
      await expect(page.getByTestId("mail-no-accounts")).toBeVisible();
      const add = page.getByRole("button", { name: "添加邮箱", exact: true });
      await add.click();
      const accountDialog = page.getByRole("dialog", { name: "添加邮箱", exact: true });
      await expect(accountDialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(add).toBeFocused();
      const settings = page.getByRole("button", { name: "邮件设置", exact: true });
      await expect(page.getByText("邮件同步设置", { exact: true })).toHaveCount(0);
      await settings.click();
      const settingsDialog = page.getByRole("dialog", { name: "邮件设置", exact: true });
      await expect(settingsDialog.getByText("邮件同步设置", { exact: true })).toBeVisible();
      await expect(settingsDialog.getByText("邮件缓存", { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(settings).toBeFocused();

      const address = { host: "127.0.0.1", port: imap.port, security: "none" } as const;
      const { setupId } = await call<{ setupId: string }>(page, "mail.accounts.testConnection", {
        settings: { provider: "custom_imap", email: "reader@example.test", label: "验收邮箱", auth: "password", imap: address, smtpEnabled: false, smtp: address },
        password: "synthetic-loopback-password",
      });
      const { accountId } = await call<{ accountId: string }>(page, "mail.accounts.save", { setupId, folders: ["INBOX"] });
      await call(page, "mail.sync.refresh", { accountId, folder: "INBOX" });
      await page.reload();
      await engineReady(page);
      await page.setViewportSize({ width: 1500, height: 900 });
      await navigate(page, "邮件");
      const account = page.getByRole("button", { name: "验收邮箱", exact: true });
      await account.click();
      const panes = page.getByRole("separator", { name: "调整联系人栏宽度" });
      await expect(panes).toBeVisible();
      await panes.focus();
      await panes.press("ArrowRight");
      const contacts = page.getByRole("complementary", { name: "联系人对话" });
      await contacts.getByRole("button", { name: /sender@example\.test/ }).click();
      await page.getByRole("region", { name: "往来邮件" }).getByRole("button", { name: subject, exact: true }).click();
      await expect(page.getByText("mail fixture original", { exact: true })).toBeVisible();

      await page.setViewportSize({ width: 480, height: 850 });
      await expect(panes).toBeHidden();
      await page.getByRole("button", { name: "返回邮件列表" }).click();
      await page.getByRole("button", { name: "返回账号" }).click();
      await expect(account).toBeFocused();
      await account.click();
      await contacts.getByRole("button", { name: /sender@example\.test/ }).click();
      await page.getByRole("region", { name: "往来邮件" }).getByRole("button", { name: subject, exact: true }).click();
      await page.getByRole("button", { name: "引用回复", exact: true }).click();
      const composer = page.getByRole("form", { name: "回复邮件", exact: true });
      await composer.getByRole("textbox", { name: "正文", exact: true }).fill("保留到原回复草稿");
      await composer.getByRole("button", { name: "保存草稿", exact: true }).click();
      await expect(composer.getByRole("button", { name: "保存草稿", exact: true })).toBeDisabled();
      await composer.getByRole("button", { name: "关闭写信" }).click();
      await page.getByRole("button", { name: "草稿", exact: true }).click();
      await expect(page.getByRole("complementary", { name: "草稿列表" })).toContainText(subject);

      const draftId = randomUUID();
      const revision = randomUUID();
      const operationId = operationIdFor(draftId, revision);
      const messageId = `<${randomUUID()}@huhu.local>`;
      const claimedAt = new Date().toISOString();
      const recipients = ["accepted@example.test", "failed@example.test"];
      await new OutboxStorage(new VaultFiles(vault)).write({
        format: 1, operationId, draftId, revision, messageId, claimedAt, from: "reader@example.test", auth: "password", smtp: address,
        draft: { accountId, to: recipients, cc: [], bcc: [], subject: "部分送达的邮件", body: { type: "doc" } }, text: "测试投递",
        result: { stage: "data", finishedAt: claimedAt, smtpCode: 250, recipients: [{ address: recipients[0]!, state: "accepted" }, { address: recipients[1]!, state: "not-delivered" }] },
      }, null);
      await page.reload();
      await engineReady(page);
      await navigate(page, "邮件");
      await page.getByRole("button", { name: "发件箱", exact: true }).click();
      await page.getByRole("button", { name: /部分送达的邮件/ }).click();
      await expect(page.getByText(messageId, { exact: true })).toBeVisible();
      const results = page.getByRole("list", { name: "收件人投递结果" });
      await expect(results.getByRole("listitem")).toHaveText(["accepted@example.test · 服务端已接受", "failed@example.test · 明确未投递"]);
    } finally {
      await close();
    }
  } finally {
    await imap.close();
  }
});
