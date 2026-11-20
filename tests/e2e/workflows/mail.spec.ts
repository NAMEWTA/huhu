import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openImapFixture, type FixtureImapMessage } from "../../../plugins/mail/test/fixtures/imap.js";
import { openApp } from "../helpers/launch.js";

async function desktopMailCalls(page: Page) {
  await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
  const endpoint = await page.evaluate(() => window.huhuHost.engine());
  return async <T>(capability: string, input: unknown = {}) => {
    const result = await fetch(`${endpoint.baseUrl}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${endpoint.token}`, "content-type": "application/json" },
      body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
    }).then((response) => response.json());
    expect(result, capability).toMatchObject({ ok: true });
    return result.data as T;
  };
}

test("桌面邮箱授权经主进程浏览器入口，取消后释放原回调", async () => {
  const { app, page, close } = await openApp({
    HUHU_MAIL_GOOGLE_CLIENT_ID: "synthetic-desktop-client",
    HUHU_MAIL_GOOGLE_CLIENT_SECRET: "synthetic-configured-secret",
    HUHU_MAIL_MICROSOFT_CLIENT_ID: "",
  });
  try {
    const call = await desktopMailCalls(page);
    type HostProbe = typeof globalThis & { mailAuthorization?: string };
    await app.evaluate(({ shell }) => {
      shell.openExternal = async (url) => {
        (globalThis as HostProbe).mailAuthorization = url;
      };
    });
    expect(await app.evaluate(() => process.env["HUHU_MAIL_GOOGLE_CLIENT_SECRET"] !== undefined)).toBe(false);
    expect(await call("mail.oauth.availability")).toMatchObject({ gmail: true, outlook: false });
    const setup = await call<{ sessionId: string; phase: string }>("mail.oauth.begin", { provider: "gmail", email: "fixture@example.test" });
    expect(setup.phase).toBe("waiting");
    const address = await app.evaluate(() => (globalThis as HostProbe).mailAuthorization);
    expect(address).toBeTruthy();
    const url = new URL(address!);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("synthetic-desktop-client");
    expect(url.searchParams.has("client_secret")).toBe(false);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const local = new URL(url.searchParams.get("redirect_uri")!);
    expect(local.hostname).toBe("127.0.0.1");
    expect((await fetch(local)).status).toBe(400);
    expect(await call("mail.oauth.cancel", { sessionId: setup.sessionId })).toMatchObject({ phase: "cancelled" });
    await expect
      .poll(() =>
        fetch(local, { signal: AbortSignal.timeout(500) }).then(
          () => true,
          () => false,
        ),
      )
      .toBe(false);
  } finally {
    await close();
  }
});

test("桌面邮箱授权的浏览器回执迟到仍保留原监听，明确拒绝则停止", async () => {
  const { app, page, close } = await openApp({ HUHU_MAIL_GOOGLE_CLIENT_ID: "synthetic-late-ack", HUHU_MAIL_MICROSOFT_CLIENT_ID: "" });
  try {
    const call = await desktopMailCalls(page);
    type Probe = typeof globalThis & { mailBrowserProbe?: { url: string; finished: boolean } };
    await app.evaluate(({ shell }) => {
      shell.openExternal = async (url) => {
        const probe = { url, finished: false };
        (globalThis as Probe).mailBrowserProbe = probe;
        await new Promise((resolve) => setTimeout(resolve, 5500));
        probe.finished = true;
      };
    });
    const first = await call<{ sessionId: string; phase: string }>("mail.oauth.begin", { provider: "gmail", email: "late@example.test" });
    expect(first.phase).toBe("waiting");
    await expect.poll(() => app.evaluate(() => (globalThis as Probe).mailBrowserProbe?.finished), { timeout: 10_000 }).toBe(true);
    const authorization = await app.evaluate(() => (globalThis as Probe).mailBrowserProbe?.url);
    const listener = new URL(authorization!).searchParams.get("redirect_uri")!;
    expect(await call("mail.oauth.status", { sessionId: first.sessionId })).toMatchObject({ phase: "waiting" });
    expect((await fetch(listener)).status).toBe(400);
    expect(await call("mail.oauth.cancel", { sessionId: first.sessionId })).toMatchObject({ phase: "cancelled" });
    await app.evaluate(({ shell }) => {
      shell.openExternal = async () => {
        throw new Error("synthetic browser refusal");
      };
    });
    const second = await call<{ sessionId: string }>("mail.oauth.begin", { provider: "gmail", email: "refused@example.test" });
    await expect.poll(() => call("mail.oauth.status", { sessionId: second.sessionId })).toMatchObject({ phase: "failed", reason: "browser-unavailable" });
  } finally {
    await close();
  }
});

test("新邮件通知从桌面铃铛定位到原账号的邮件并交接焦点", async () => {
  const message = (uid: number, subject: string): FixtureImapMessage => ({
    uid,
    uidValidity: 42,
    subject,
    source: `From: Sender <sender@example.test>\r\nTo: fixture@example.test\r\nSubject: ${subject}\r\n\r\nBody for UID ${uid}\r\n`,
  });
  const messages = [message(1, "初次同步邮件")];
  const imap = await openImapFixture({ windows: { INBOX: { uidValidity: 42, messages } }, allowIdle: false });
  try {
    const { page, close } = await openApp();
    try {
      const call = await desktopMailCalls(page);
      const connection = { host: "127.0.0.1", port: imap.port, security: "none" };
      const { setupId } = await call<{ setupId: string }>("mail.accounts.testConnection", {
        settings: { provider: "custom_imap", email: "fixture@example.test", label: "通知测试", auth: "password", imap: connection, smtpEnabled: false, smtp: connection },
        password: "synthetic-loopback-password",
      });
      const { accountId } = await call<{ accountId: string }>("mail.accounts.save", { setupId, folders: ["INBOX"] });
      const folder = { accountId, folder: "INBOX" };
      await call("mail.sync.refresh", folder);
      expect(await call<Array<{ module: string }>>("notifications.list")).not.toContainEqual(expect.objectContaining({ module: "mail" }));

      messages.push(message(2, "原邮件主题"));
      await call("mail.sync.refresh", folder);
      await call("mail.sync.refresh", folder);
      await expect(page.getByTestId("unread-count")).toBeVisible();
      await page.getByTestId("bell").click();
      const notice = page.getByTestId("notice-item").filter({ hasText: "收到新邮件" });
      await expect(notice).toHaveCount(1);
      await notice.press("Enter");
      const target = page.getByRole("group", { name: "已定位邮件" });
      await expect(target).toContainText("Body for UID 2");
      await expect(target).toBeFocused();
      await expect(target).toHaveAttribute("data-mail-highlighted", "true");
      await expect(page.getByTestId("notification-panel")).toBeHidden();
      expect(await call("notifications.list")).toContainEqual(expect.objectContaining({ module: "mail", read: true }));
    } finally {
      await close();
    }
  } finally {
    await imap.close();
  }
});

test("工作台命令从首页打开邮件缓存搜索并交接焦点", async () => {
  const { page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByLabel("搜索模块、命令和内容").fill("搜索已缓存邮件");
    await page.getByTestId("palette-item").filter({ hasText: "搜索已缓存邮件" }).click();
    const search = page.getByRole("dialog", { name: "搜索已缓存邮件" });
    await expect(search).toBeVisible();
    await expect(search.getByRole("combobox", { name: "主题、联系人或正文" })).toBeFocused();
  } finally {
    await close();
  }
});

test("邮件草稿保存失败时保留工作区，重试后可切换并继续编辑原草稿", async () => {
  const { app, page, close } = await openApp();
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const mail = page.getByRole("button", { name: "邮件", exact: true }).first();
    const tasks = page.getByRole("button", { name: "任务", exact: true }).first();
    await mail.click();
    await page.getByRole("button", { name: "写信", exact: true }).click();
    const editor = page.getByRole("form", { name: "写信" });
    const subject = editor.getByLabel("主题");
    await subject.fill("切换模块保留这份草稿");

    let rejected = 0;
    await page.route("**/api/v1/call", async (route) => {
      const { capability } = route.request().postDataJSON() as { capability: string };
      if (capability !== "mail.drafts.save" || rejected > 0) return route.continue();
      rejected++;
      await route.fulfill({ status: 200, json: { ok: false, error: { code: "INTERNAL", message: "测试草稿写入失败", retryable: false } } });
    });
    await tasks.click();
    await expect(editor).toContainText("测试草稿写入失败");
    await expect(subject).toHaveValue("切换模块保留这份草稿");
    await expect(page.getByTestId("tasks-module")).toHaveCount(0);

    await tasks.click();
    await expect(page.getByTestId("tasks-module")).toBeVisible();
    await mail.click();
    await page.getByRole("button", { name: "草稿", exact: true }).click();
    await expect(page.getByRole("button", { name: "切换模块保留这份草稿" })).toHaveCount(1);
    await page.getByRole("button", { name: "继续编辑", exact: true }).click();
    await expect(subject).toHaveValue("切换模块保留这份草稿");
    expect(rejected).toBe(1);
    await page.unrouteAll({ behavior: "wait" });
    await Promise.all([app.waitForEvent("close", { timeout: 12_000 }), app.evaluate(({ app }) => app.quit())]);
  } finally {
    await close();
  }
});

test("桌面邮件用原生选择结果导入受管附件，重开草稿后可移除", async () => {
  const { app, page, vault, close } = await openApp();
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-mail-picker-"));
  const bytes = Buffer.from("合成附件夹具");
  const name = "样本 附件.txt";
  const file = path.join(dir, name);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const managed = path.join(vault, ".huhu/mail/attachments", digest);
  writeFileSync(file, bytes);
  try {
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    await app.evaluate(({ dialog }, selected) => {
      const choices = [undefined, selected];
      dialog.showOpenDialog = (async () => {
        const choice = choices.shift();
        return { canceled: !choice, filePaths: choice ? [choice] : [] };
      }) as typeof dialog.showOpenDialog;
    }, file);
    const malformed = await page.evaluate(async () => {
      const { vaultId } = await window.huhuHost.engine();
      const input = { operationId: crypto.randomUUID(), draftId: crypto.randomUUID(), expectedRevision: crypto.randomUUID(), vaultId, path: "untrusted-renderer-path" };
      return window.huhuHost.mailDraftAttachments.selectAndAdd(input);
    });
    expect(malformed).toEqual({ status: "failed", reason: "unavailable" });

    await page.getByRole("button", { name: "邮件", exact: true }).first().click();
    await page.getByRole("button", { name: "写信", exact: true }).click();
    const composer = page.getByRole("form", { name: "写信" });
    await composer.getByLabel("主题").fill("保留附件的草稿");
    const add = composer.getByRole("button", { name: "添加附件" });
    await add.click();
    await expect(add).toBeEnabled();
    expect(existsSync(managed)).toBe(false);
    await add.click();
    await expect(composer.getByText("附件已保存。")).toBeVisible();
    expect(readFileSync(managed)).toEqual(bytes);
    rmSync(file);

    await page.reload();
    await page.getByRole("button", { name: "邮件", exact: true }).first().click();
    await page.getByRole("button", { name: "草稿", exact: true }).click();
    await page.getByRole("button", { name: "继续编辑", exact: true }).click();
    await expect(composer.getByLabel("主题")).toHaveValue("保留附件的草稿");
    await expect(composer.getByText(name, { exact: false })).toBeVisible();
    await composer.getByRole("button", { name: `移除附件 ${name}` }).click();
    await expect(composer.getByText("附件已移除。")).toBeVisible();
    expect(existsSync(managed)).toBe(false);
  } finally {
    await close();
    rmSync(dir, { recursive: true, force: true });
  }
});
