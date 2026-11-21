import { chromium, expect, test, type Browser } from "@playwright/test";
import { existsSync } from "node:fs";
import type {} from "../../../apps/desktop/src/renderer/env.js";
import { openApp } from "../../../tests/e2e/helpers/launch.js";
import { aiFixture } from "./fixtures/ai.js";
import { openImapFixture, type FixtureImapMessage } from "./fixtures/imap.js";

test("桌面邮件 AI 设置用合成消息测试，失败可修正并保留已保存设置", async () => {
  const provider = await aiFixture();
  const { app, page, close } = await openApp();
  try {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.getByRole("button", { name: "邮件", exact: true }).click();
    await page.getByText("邮件 AI 设置", { exact: true }).click();
    const form = page.getByRole("form", { name: "邮件 AI 设置" });
    const status = page.getByRole("status").filter({ visible: true });
    const enabled = form.getByRole("checkbox", { name: "启用邮件 AI" });
    const model = form.getByRole("textbox", { name: "模型" });
    await expect(enabled).not.toBeChecked();
    await enabled.check();
    await form.getByRole("textbox", { name: "目标服务地址" }).fill(provider.url);
    await model.fill("synthetic-ui-model");
    await form.getByRole("button", { name: "测试连接" }).click();
    await expect(status.filter({ hasText: "连接测试通过。" })).toBeVisible();
    await expect(page.getByText(/已保存 · 关闭 · Key 未配置/)).toBeVisible();
    await form.getByRole("button", { name: "保存 AI 设置" }).click();
    await expect(status.filter({ hasText: "邮件 AI 设置已保存。" })).toBeVisible();
    await expect(page.getByText(/已保存 · 启用 · Key 未配置/)).toContainText("synthetic-ui-model");
    provider.behavior.status = 500;
    await model.fill("recoverable-draft-model");
    await form.getByRole("button", { name: "保存 AI 设置" }).click();
    await expect(status.filter({ hasText: "邮件 AI 服务未返回可用文本。" })).toBeVisible();
    await expect(model).toHaveValue("recoverable-draft-model");
    await expect(page.getByText(/已保存 · 启用 · Key 未配置/)).toContainText("synthetic-ui-model");
    expect(provider.requests).toHaveLength(3);
    expect(provider.requests.every(({ authorization }) => authorization === undefined)).toBe(true);
    expect(provider.requests[0]?.body).toEqual({ model: "synthetic-ui-model", messages: [{ role: "user", content: "Huhu Mail connection test. Reply with OK." }], stream: false });
    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪");
    const mail = page.getByText("邮件 AI 设置", { exact: true });
    if (!(await mail.isVisible())) await page.getByRole("button", { name: "邮件", exact: true }).click();
    await mail.click();
    await expect(model).toHaveValue("synthetic-ui-model");
    await expect(form.getByLabel("新 API Key")).toHaveCount(0);
    expect(provider.requests).toHaveLength(3);
    expect(pageErrors).toEqual([]);
    console.log("Desktop runtime", await app.evaluate(() => ({ electron: process.versions.electron, chromium: process.versions.chrome })));
  } finally {
    await Promise.all([close(), provider.close()]);
  }
});

test("桌面邮件 AI 只提交确认片段，采纳回复后使用原有编辑器", async () => {
  const selected = "Only this synthetic sentence.";
  const unselected = "Keep this second line private.";
  const other = "Unselected other mail body.";
  const mail = (uid: number, subject: string, body: string): FixtureImapMessage => ({
    uid,
    uidValidity: 42,
    subject,
    seen: true,
    source: ["From: Fixture Sender <sender@example.test>", "To: user@example.test", `Message-ID: <fixture-${uid}@example.test>`, `Date: ${new Date().toUTCString()}`, `Subject: ${subject}`, "", body, ""].join("\r\n"),
  });
  const imap = await openImapFixture({ windows: { INBOX: { uidValidity: 42, messages: [mail(1, "Fixture selected", `${selected}\r\n${unselected}`), mail(2, "Fixture other", other)] } }, allowIdle: false });
  const provider = await aiFixture();
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const engine = await page.evaluate(() => window.huhuHost.engine());
    async function call<T>(capability: string, input: unknown = {}): Promise<T> {
      const response = await fetch(`${engine.baseUrl}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${engine.token}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
      });
      const result = await response.json();
      expect(result.ok, `${capability}: ${JSON.stringify(result.error)}`).toBe(true);
      return result.data as T;
    }
    const host = { host: "127.0.0.1", port: imap.port, security: "none" };
    const { setupId } = await call<{ setupId: string }>("mail.accounts.testConnection", {
      settings: { provider: "custom_imap", email: "user@example.test", label: "AI 测试邮箱", auth: "password", imap: host, smtpEnabled: false, smtp: host },
      password: "synthetic-imap-password",
    });
    const { accountId } = await call<{ accountId: string }>("mail.accounts.save", { setupId, folders: ["INBOX"] });
    await call("mail.sync.refresh", { accountId, folder: "INBOX" });
    const stale = await call<{ total: number }>("mail.conversations.search", { text: other });
    expect(stale.total).toBe(1);
    await page.getByRole("button", { name: "邮件", exact: true }).click();
    await page.getByRole("button", { name: "搜索邮件" }).click();
    const search = page.getByRole("dialog", { name: "搜索已缓存邮件" });
    await search.getByRole("combobox", { name: "主题、联系人或正文" }).fill("Fixture selected");
    await search.getByRole("option").filter({ hasText: "Fixture selected" }).click();
    const reader = page.getByRole("group", { name: "已定位邮件" });
    await expect(reader.getByRole("region", { name: "正文" })).toContainText(unselected);
    const ai = reader.getByRole("button", { name: "邮件 AI", exact: true });
    await expect(ai).toBeDisabled();
    expect(provider.requests).toHaveLength(0);

    await call("mail.ai.saveSettings", { expectedRevision: null, enabled: true, endpoint: provider.url, model: "synthetic-selection-model" });
    await expect(ai).toBeEnabled();
    const assistant = page.getByRole("dialog", { name: "选择交给 AI 的内容" });
    const confirm = assistant.getByRole("button", { name: "同意发送所示内容" });
    const source = assistant.getByRole("textbox", { name: "正文选取区" });
    const mode = assistant.getByRole("combobox", { name: "操作" });
    async function openSelection() {
      await ai.click();
      await expect(assistant.getByText(/目标服务/)).toContainText(`${provider.url}/chat/completions`);
      await expect(source).toBeFocused();
      await expect(confirm).toBeDisabled();
      await source.evaluate((element, fragment) => {
        const field = element as HTMLTextAreaElement;
        const start = field.value.indexOf(fragment);
        field.setSelectionRange(start, start + fragment.length);
      }, selected);
      await assistant.getByRole("button", { name: "采用所选片段" }).click();
      await expect(assistant.getByRole("textbox", { name: "将发送的邮件片段" })).toHaveValue(selected);
    }
    await openSelection();
    await page.keyboard.press("Escape");
    await expect(assistant).toBeHidden();
    await expect(ai).toBeFocused();
    expect(provider.requests).toHaveLength(1);

    await openSelection();
    await mode.selectOption("todos");
    provider.behavior.status = 500;
    await confirm.click();
    await expect(assistant.getByRole("alert")).toContainText("邮件 AI 服务未返回可用文本");
    await expect(assistant.getByRole("textbox", { name: "将发送的邮件片段" })).toHaveValue(selected);
    delete provider.behavior.status;
    provider.behavior.text = "Todo: review the synthetic sentence.";
    await assistant.getByRole("button", { name: "核对服务地址" }).click();
    await confirm.click();
    const result = page.getByRole("dialog", { name: "邮件 AI 结果" });
    await expect(result.getByText(provider.behavior.text)).toBeFocused();
    await result.getByRole("button", { name: "关闭结果" }).click();
    await expect(reader.getByRole("region", { name: "正文" })).toContainText(unselected);

    await openSelection();
    await mode.selectOption("reply");
    provider.behavior.text = "Synthetic reply.\n<svg onload=alert(1)>literal</svg>";
    provider.behavior.toolCalls = [{ type: "function", function: { name: "mail.outbox.submit", arguments: "{}" } }];
    await confirm.click();
    await expect(result.getByText("<svg onload=alert(1)>literal</svg>", { exact: false })).toBeVisible();
    await expect(result.locator("svg[onload]")).toHaveCount(0);
    expect(await call("mail.drafts.list")).toEqual({ drafts: [] });
    expect(await call("mail.outbox.list")).toEqual({ operations: [] });
    await result.getByRole("button", { name: "采纳为草稿" }).click();
    const composer = page.getByRole("form", { name: "回复邮件" });
    const editor = composer.getByRole("textbox", { name: "正文" });
    await expect(editor).toContainText("Synthetic reply.");
    await expect(editor).toContainText("<svg onload=alert(1)>literal</svg>");
    await editor.fill("Synthetic locally edited reply.");
    await composer.getByRole("button", { name: "保存草稿" }).click();
    await expect.poll(async () => (await call<{ drafts: unknown[] }>("mail.drafts.list")).drafts.length).toBe(1);
    expect(await call("mail.outbox.list")).toEqual({ operations: [] });
    expect(provider.requests).toHaveLength(4);
    for (const request of provider.requests.slice(1)) {
      expect(request.body).toMatchObject({ stream: false, messages: [{ role: "system" }, { role: "user", content: selected }] });
      for (const omitted of [unselected, other, "sender@example.test", "Fixture selected", "mail.outbox.submit"]) expect(JSON.stringify(request.body)).not.toContain(omitted);
    }
  } finally {
    await Promise.all([close(), provider.close(), imap.close()]);
  }
});

test("桌面和 Web 工作台批准外部邮件 AI 请求，工具只能发送原选区一次", async () => {
  test.skip(!existsSync(chromium.executablePath()), "需安装 Playwright Chromium");
  const excerpt = "Only the approved external excerpt.";
  const privateText = "This line remains in the cache.";
  const imap = await openImapFixture({
    message: {
      uidValidity: 42,
      subject: "External approval fixture",
      source: ["From: fixture@example.test", "To: reader@example.test", "Subject: External approval fixture", "", excerpt, privateText].join("\r\n"),
    },
  });
  const provider = await aiFixture();
  const { page, close } = await openApp();
  let browser: Browser | undefined;
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const engine = await page.evaluate(() => window.huhuHost.engine());
    async function call(capability: string, input: unknown = {}, token = engine.token) {
      const response = await fetch(`${engine.baseUrl}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
      });
      expect(response.status).toBe(200);
      return response.json() as Promise<{ ok: boolean; data?: unknown; error?: unknown }>;
    }
    async function desktop<T>(capability: string, input?: unknown) {
      const result = await call(capability, input);
      expect(result.ok, `${capability}: ${JSON.stringify(result.error)}`).toBe(true);
      return result.data as T;
    }
    const host = { host: "127.0.0.1", port: imap.port, security: "none" };
    const { setupId } = await desktop<{ setupId: string }>("mail.accounts.testConnection", {
      settings: { provider: "custom_imap", email: "reader@example.test", label: "AI approval fixture", auth: "password", imap: host, smtpEnabled: false, smtp: host },
      password: "synthetic-imap-password",
    });
    const { accountId } = await desktop<{ accountId: string }>("mail.accounts.save", { setupId, folders: ["INBOX"] });
    const { accounts } = await desktop<{ accounts: { revision: string }[] }>("mail.accounts.list");
    const { revision: settingsRevision } = await desktop<{ revision: string }>("mail.ai.saveSettings", { expectedRevision: null, enabled: true, endpoint: provider.url, model: "approval-fixture" });
    const box = { accountId, folder: "INBOX" };
    const { message } = await desktop<{ message: { localMessageId: string } }>("mail.sync.refresh", box);
    const identity = { ...box, localMessageId: message.localMessageId };
    const { sourceDigest } = await desktop<{ sourceDigest: string }>("mail.messages.loadBody", identity);
    for (const name of ["mail.ai.prepare", "mail.ai.chat"]) await desktop("gateway.update", { capability: name, exposed: true });
    const { token } = await desktop<{ token: string }>("gateway.tokens.create", { name: "AI approval UI fixture" });
    const share = await desktop<{ state: string }>("web.share.start", { mode: "local", port: 0 });
    expect(share.state).toBe("running");
    const { links } = await desktop<{ links: string[] }>("web.invitations.create");
    browser = await chromium.launch({ headless: true });
    const web = await browser.newPage();
    await web.goto(links[0]!);
    await expect(web.getByTestId("home-dashboard")).toBeVisible();

    for (const workbench of [page, web]) {
      await workbench.getByRole("button", { name: "邮件", exact: true }).click();
      const before = provider.requests.length;
      const prepared = await call(
        "mail.ai.prepare",
        {
          requestId: crypto.randomUUID(),
          mode: "summary",
          settingsRevision,
          source: { ...identity, accountRevision: accounts[0]!.revision, sourceDigest, start: 0, end: excerpt.length },
        },
        token,
      );
      expect(prepared).toMatchObject({ ok: true, data: { state: "pending" } });
      const { approvalId } = prepared.data as { approvalId: string };
      expect(await call("mail.ai.chat", { approvalId }, token)).toMatchObject({ ok: false, error: { details: { reason: "approval-required" } } });
      expect(provider.requests).toHaveLength(before);

      const prompt = workbench.getByRole("button", { name: "待确认的邮件 AI 请求（1）" });
      await prompt.click();
      const dialog = workbench.getByRole("dialog", { name: "核对外部工具的邮件 AI 请求" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "关闭", exact: true })).toBeFocused();
      await expect(dialog).toContainText(excerpt);
      await expect(dialog).toContainText(provider.url);
      await expect(dialog).not.toContainText(privateText);
      await workbench.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(prompt).toBeFocused();
      await prompt.click();
      await dialog.getByRole("button", { name: "批准一次发送" }).click();
      await expect(dialog).toBeHidden();
      expect(provider.requests).toHaveLength(before);
      expect(await call("mail.ai.chat", { approvalId }, token)).toMatchObject({ ok: true, data: { text: "OK" } });
      expect(await call("mail.ai.chat", { approvalId }, token)).toMatchObject({ ok: true, data: { state: "completed" } });
      expect(provider.requests).toHaveLength(before + 1);
      expect(JSON.stringify(provider.requests.at(-1)?.body)).toContain(excerpt);
      expect(JSON.stringify(provider.requests.at(-1)?.body)).not.toContain(privateText);
    }
  } finally {
    await browser?.close();
    await Promise.all([close(), provider.close(), imap.close()]);
  }
});
