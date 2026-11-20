import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect as browserExpect } from "@playwright/test";
import { ModuleCredentials } from "@huhu/kernel";
import { assert, expect, test } from "vitest";
import { boot } from "../../../apps/engine/src/boot.js";
import { accountTargets, mailAccountDefinitionSchema } from "../src/engine/account-definition.js";
import { openImapFixture } from "./fixtures/imap.js";
import { loopbackSmtp } from "./fixtures/smtp.js";

test("Mail 实际组件经本机 Engine 走通账号修复、阅读、草稿和投递", async () => {
  const repo = path.resolve(import.meta.dirname, "../../..");
  const desktop = path.join(repo, "apps/desktop");
  const entry = path.join(desktop, "src/renderer/mail-proof-entry.tsx");
  const bridge = path.join(repo, "packages/workbench/src/mail-proof-bridge.ts");
  const absolute = (item: string) => path.join(repo, item).replaceAll("\\", "/");
  const bundleEntry = [
    'import { createRoot } from "react-dom/client";',
    'import "@huhu/ui/styles.css";',
    'import { EngineProvider } from "@huhu/workbench";',
    "import { contributions } from " + JSON.stringify(absolute("plugins/mail/src/ui/index.tsx")) + ";",
    "const Mail = contributions.modules[0].component;",
    'createRoot(document.getElementById("root")).render(<EngineProvider endpoint={window.testEndpoint}><div className="hu-app" data-theme="claude" data-mode="light" style={{display:"flex", height:"100dvh"}}><Mail /></div></EngineProvider>);',
  ].join("\n");
  const vite = await import(pathToFileURL(path.join(desktop, "node_modules/vite/dist/node/index.js")).href);
  const renderer = await vite.build({
    root: desktop,
    configFile: false,
    logLevel: "warn",
    resolve: { alias: [{ find: /^@huhu\/workbench$/, replacement: bridge }] },
    plugins: [
      {
        name: "mail-workbench-proof",
        resolveId(id: string) {
          if (id === entry || id === bridge) return id;
        },
        load(id: string) {
          if (id === entry) return bundleEntry;
          if (id === bridge) return 'export * from "./engine-client/react.tsx"; export * from "./engine-client/client.ts"; export * from "./state/exit-participants.ts"; export * from "./settings/host.ts";';
        },
      },
    ],
    oxc: { jsx: { runtime: "automatic" } },
    build: {
      write: false,
      minify: false,
      cssCodeSplit: false,
      rolldownOptions: {
        input: entry,
        output: { entryFileNames: "mail.js" },
        onLog(level: string, log: { code: string }, handler: (level: string, log: { code: string }) => void) {
          if (log.code !== "MODULE_LEVEL_DIRECTIVE") handler(level, log);
        },
      },
    },
  });
  const assets = new Map(renderer.output.map((file: { fileName: string; source?: string | Uint8Array; code?: string }) => [file.fileName, file.code ?? file.source]));
  const css = [...assets.keys()]
    .filter((key) => String(key).endsWith(".css"))
    .map((key) => '<link rel="stylesheet" href="/' + key + '">')
    .join("");
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-renderer-proof-"));
  const screenshots = process.env.HUHU_MAIL_PROOF_SCREENSHOTS;
  const vaultPath = path.join(root, "vault");
  const desktopUserData = path.join(root, "app-data");
  mkdirSync(vaultPath);
  mkdirSync(desktopUserData);
  const password = randomUUID();
  const replacement = randomUUID();
  let acceptedPassword = password;
  const subject = "Mail reading fixture";
  const message = {
    uidValidity: 12,
    subject,
    ignoreRead: true,
    source: [
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="mixed"',
      "",
      "--mixed",
      'Content-Type: multipart/alternative; boundary="alternative"',
      "",
      "--alternative",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "纯文本正文",
      "> 合成引用",
      "--alternative",
      "Content-Type: text/html; charset=utf-8",
      "",
      '<p>HTML 正文 <strong>可见内容</strong></p><blockquote><p>合成 HTML 引用</p></blockquote><img src="https://mail-images.invalid/pixel" alt="外部图">' +
        '<script>globalThis.mailFixtureRan=true</script><style>p{background-image:url(https://mail-style.invalid/pixel)}</style><iframe src="https://mail-frame.invalid/"></iframe>' +
        Array.from({ length: 12 }, (_, index) => `<p>合成长段落 ${index + 1}</p>`).join(""),
      "--alternative--",
      "--mixed",
      'Content-Type: text/plain; name="fixture.txt"',
      'Content-Disposition: attachment; filename="fixture.txt"',
      "",
      "attachment bytes",
      "--mixed--",
      "",
    ].join("\r\n"),
  };
  const imap = await openImapFixture({ message, acceptPassword: (value) => value === acceptedPassword });
  const otherPassword = randomUUID();
  const other = await openImapFixture({ acceptPassword: (value) => value === otherPassword, message: { uidValidity: 12, subject: "Other mailbox fixture", source: "Subject: Other mailbox fixture\r\n\r\nOther account\r\n" } });
  const smtp = await loopbackSmtp(password);
  const engine = await boot({ vaultPath, desktopUserData, create: true });
  const origin = "http://mail-workbench.test";
  const shell = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors: string[] = [];
  let failDraftSave = true;
  let failBodyRead = true;
  let markCalls = 0;
  const externalRequests: string[] = [];
  const repairReplyReady = Promise.withResolvers<void>();
  const deliverRepairReply = Promise.withResolvers<void>();
  let holdRepair = false;
  shell.on("pageerror", (error) => pageErrors.push(error.message));
  async function direct(capability: string, input: unknown) {
    const id = randomUUID();
    const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${engine.rendererToken}`, "content-type": "application/json" },
      body: JSON.stringify({ capability, input, requestId: id, idempotencyKey: id }),
    });
    const reply = await response.json();
    assert(reply.ok);
    return reply.data;
  }
  try {
    await shell.addInitScript(
      (endpoint) => {
        Reflect.set(window, "testEndpoint", endpoint);
      },
      { baseUrl: origin, token: engine.rendererToken, vaultId: engine.vault.id },
    );
    await shell.routeWebSocket("**/*", () => {});
    await shell.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        externalRequests.push(url.origin);
        return route.abort();
      }
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="zh-CN"><meta charset="UTF-8">' + css + '<div id="root"></div><script type="module" src="/mail.js"></script>' });
      if (url.pathname.startsWith("/api/")) {
        const request = route.request();
        const payload = request.postData();
        const envelope = payload ? JSON.parse(payload) : undefined;
        const capability = envelope?.capability;
        if (capability === "mail.messages.markRead") markCalls++;
        if (failBodyRead && capability === "mail.messages.loadBody") {
          failBodyRead = false;
          return route.abort("failed");
        }
        if (failDraftSave && capability === "mail.drafts.save") {
          failDraftSave = false;
          return route.abort("failed");
        }
        const response = await fetch("http://127.0.0.1:" + engine.port + url.pathname, {
          method: request.method(),
          headers: { authorization: engine.rendererToken ? "Bearer " + engine.rendererToken : "", "content-type": "application/json" },
          body: payload,
        });
        const body = await response.text();
        if (holdRepair && capability === "mail.accounts.testConnection" && envelope?.input?.accountId) {
          holdRepair = false;
          repairReplyReady.resolve();
          await deliverRepairReply.promise;
        }
        return route.fulfill({ status: response.status, contentType: "application/json", body });
      }
      const asset = assets.get(url.pathname.slice(1));
      if (!asset) return route.abort();
      if (asset instanceof Uint8Array) return route.fulfill({ body: Buffer.from(asset) });
      return route.fulfill({ contentType: url.pathname.endsWith(".css") ? "text/css" : "text/javascript", body: String(asset) });
    });
    await shell.goto(origin);
    const add = shell.getByRole("button", { name: "添加邮箱" });
    await add.click();
    const dialog = shell.getByRole("dialog");
    await dialog.getByLabel("显示名称").fill("回环邮箱");
    await dialog.getByLabel("邮箱地址").fill("renderer@example.invalid");
    await dialog.getByLabel("邮箱密码或客户端授权码").fill(password);
    await dialog.getByLabel("IMAP 主机").fill("127.0.0.1");
    await dialog.getByLabel("IMAP 端口").fill(String(imap.port));
    await dialog.getByLabel("IMAP 安全模式").selectOption("none");
    await dialog.getByLabel("SMTP 主机").fill("127.0.0.1");
    await dialog.getByLabel("SMTP 端口").fill(String(smtp.port));
    await dialog.getByLabel("SMTP 安全模式").selectOption("none");
    const testConnection = dialog.getByRole("button", { name: "测试连接并发现文件夹" });
    await testConnection.click();
    await browserExpect(dialog.getByRole("checkbox", { name: "INBOX", exact: true })).toBeChecked();
    await browserExpect(dialog.getByRole("checkbox", { name: "Container（不可选择）" })).toBeDisabled();
    await dialog.getByLabel("显示名称").fill("回环邮箱已修改");
    await browserExpect(dialog.getByRole("button", { name: "保存邮箱" })).toBeDisabled();
    await testConnection.click();
    await dialog.getByRole("checkbox", { name: "Container/Projects", exact: true }).check();
    await dialog.getByRole("button", { name: "保存邮箱" }).click();
    await browserExpect(dialog).toBeHidden();
    await browserExpect(add).toBeFocused();
    await browserExpect(shell.getByRole("button", { name: "回环邮箱已修改" })).toBeVisible();

    await shell.getByRole("button", { name: "同步目录", exact: true }).click();
    const received = shell.getByRole("button", { name: subject, exact: true });
    await browserExpect(received).toBeVisible();
    expect(markCalls).toBe(0);
    const offscreen = await shell.addStyleTag({ content: ".hu-mail-body-viewport { margin-block-start: 1200px; }" });
    await received.click();
    await browserExpect(shell.getByText("无法读取邮件正文。", { exact: true })).toBeVisible();
    expect(markCalls).toBe(0);
    await shell.getByRole("button", { name: "重试加载正文" }).click();
    const reading = shell.getByRole("region", { name: "正文", exact: true });
    await browserExpect(reading).toContainText("HTML 正文");
    expect(await reading.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThan(900);
    expect(markCalls).toBe(0);
    expect(imap.storeRequests).toHaveLength(0);
    await reading.scrollIntoViewIfNeeded();
    await browserExpect(shell.getByText("本机已读 · 待同步", { exact: true })).toBeVisible();
    expect(imap.storeRequests).toHaveLength(1);
    message.ignoreRead = false;
    await offscreen.evaluate((element) => element.remove());
    await shell.getByRole("button", { name: "重试同步已读" }).click();
    await browserExpect(shell.getByText("已读 · 服务器已确认", { exact: true })).toBeVisible();
    expect(imap.storeRequests).toHaveLength(2);
    await browserExpect(reading.locator("img, iframe, script, style")).toHaveCount(0);
    await browserExpect(shell.getByRole("list", { name: "邮件附件" })).toContainText("fixture.txt · text/plain · 仅有元数据");
    await shell.getByRole("button", { name: "查看原文" }).click();
    await browserExpect(shell.locator(".hu-mail-source")).toContainText('<img src="https://mail-images.invalid/pixel"');
    await shell.getByRole("button", { name: "收起原文" }).click();
    await shell.getByRole("button", { name: "纯文本显示" }).click();
    await browserExpect(reading).toContainText("纯文本正文");
    await reading.getByText("展开引用与签名").click();
    await browserExpect(reading.getByText("> 合成引用")).toBeVisible();
    await shell.getByRole("button", { name: "HTML 显示" }).click();
    const expandBody = shell.getByRole("button", { name: "展开全文" });
    await browserExpect(expandBody).toHaveAttribute("aria-expanded", "false");
    await expandBody.click();
    await browserExpect(shell.getByRole("button", { name: "收起正文" })).toHaveAttribute("aria-expanded", "true");
    await shell.getByRole("button", { name: "收起正文" }).click();
    expect(externalRequests).toEqual([]);
    expect(await shell.evaluate(() => Reflect.get(globalThis, "mailFixtureRan"))).toBeUndefined();
    if (screenshots) await shell.screenshot({ path: path.join(screenshots, "mail-reader-1440.png") });

    await shell.getByRole("button", { name: "写信", exact: true }).click();
    await shell.getByLabel("收件人", { exact: true }).fill("accepted@example.invalid, refused@example.invalid");
    await shell.getByLabel("主题", { exact: true }).fill("回环投递");
    const body = shell.getByRole("textbox", { name: "正文" });
    await body.fill("重开后继续编辑");
    await body.press("ControlOrMeta+a");
    await shell.getByRole("button", { name: "粗体", exact: true }).click();
    await shell.getByRole("button", { name: "关闭写信" }).click();
    await browserExpect(shell.getByText("暂时无法确认操作结果")).toBeVisible();
    await browserExpect(body).toHaveText("重开后继续编辑");
    await shell.getByRole("button", { name: "关闭写信" }).click();
    await browserExpect(body).toBeHidden();
    await shell.getByRole("button", { name: "草稿", exact: true }).click();
    await shell.getByRole("button", { name: "继续编辑" }).click();
    await browserExpect(body).toHaveText("重开后继续编辑");
    await browserExpect(body.locator("strong")).toHaveText("重开后继续编辑");
    expect(smtp.counts.data).toBe(0);

    smtp.configure("partial");
    await shell.getByRole("button", { name: "发送邮件" }).click();
    const recipients = shell.getByRole("group", { name: "选择明确未投递的收件人" });
    await browserExpect(recipients.getByRole("checkbox")).toHaveCount(1);
    await recipients.getByRole("checkbox", { name: "refused@example.invalid" }).check();
    if (screenshots) await shell.screenshot({ path: path.join(screenshots, "mail-partial-1440.png") });
    smtp.configure("lose-reply");
    await recipients.getByRole("button", { name: "重试所选收件人" }).click();
    await shell.getByRole("button", { name: "核对投递记录" }).click();
    await browserExpect(shell.getByText("本机记录仍待核实", { exact: false })).toBeVisible();
    await browserExpect(recipients).toBeHidden();
    expect(smtp.messages.map((message) => message.recipients)).toEqual([["accepted@example.invalid"], ["refused@example.invalid"]]);
    await shell.setViewportSize({ width: 390, height: 844 });
    await browserExpect(shell.getByRole("button", { name: "核对投递记录" })).toBeVisible();
    expect(await shell.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(390);
    if (screenshots) await shell.screenshot({ path: path.join(screenshots, "mail-unknown-390.png") });

    const otherSetup = await direct("mail.accounts.testConnection", {
      settings: {
        provider: "yahoo",
        email: "second@example.invalid",
        label: "另一回环邮箱",
        auth: "app-password",
        imap: { host: "127.0.0.1", port: other.port, security: "none" },
        smtpEnabled: false,
        smtp: { host: "", port: 465, security: "tls" },
      },
      password: otherPassword,
    });
    await direct("mail.accounts.save", { setupId: otherSetup.setupId, folders: ["INBOX"] });
    await shell.reload();
    const accountA = shell.getByRole("button", { name: "回环邮箱已修改", exact: true });
    const accountB = shell.getByRole("button", { name: "另一回环邮箱", exact: true });
    const groupA = shell.getByRole("button", { name: "自定义 IMAP/SMTP", exact: true });
    const backAccounts = shell.getByRole("button", { name: "返回账号", exact: true });
    await groupA.click();
    await browserExpect(accountA).toBeHidden();
    await browserExpect(accountB).toBeVisible();
    await groupA.press("Enter");
    await accountA.press("Enter");
    await browserExpect(backAccounts).toBeFocused();
    const openedMessage = shell.getByRole("button", { name: subject, exact: true });
    await openedMessage.press("Enter");
    const backMessages = shell.getByRole("button", { name: "返回邮件列表", exact: true });
    await browserExpect(backMessages).toBeFocused();
    await backMessages.press("Enter");
    await browserExpect(openedMessage).toBeFocused();
    await backAccounts.click();
    await browserExpect(accountA).toBeFocused();
    await browserExpect(accountA).toHaveAttribute("aria-pressed", "true");
    await accountA.click();

    const repairButton = shell.getByRole("button", { name: "修复认证", exact: true });
    const repair = shell.getByRole("dialog", { name: "修复邮箱认证" });
    await repairButton.click();
    const newPassword = repair.getByLabel("新邮箱密码或客户端授权码");
    const testRepair = repair.getByRole("button", { name: "测试新认证", exact: true });
    await newPassword.fill(replacement);
    await testRepair.click();
    await browserExpect(repair.getByText("邮箱认证失败", { exact: false })).toBeVisible();
    await browserExpect(repair.getByRole("button", { name: "保存新认证" })).toBeDisabled();

    acceptedPassword = replacement;
    holdRepair = true;
    await testRepair.click();
    await repairReplyReady.promise;
    await repair.getByRole("button", { name: "取消", exact: true }).click();
    await browserExpect(repairButton).toBeFocused();
    await backAccounts.click();
    await accountB.click();
    deliverRepairReply.resolve();
    await browserExpect(shell.getByRole("heading", { name: "另一回环邮箱" })).toBeVisible();
    await browserExpect(repair).toBeHidden();
    await shell.getByRole("button", { name: "同步目录", exact: true }).click();
    await browserExpect(shell.getByRole("button", { name: "Other mailbox fixture" })).toBeVisible();
    await browserExpect(openedMessage).toBeHidden();

    await backAccounts.click();
    await accountA.click();
    await repairButton.click();
    await newPassword.fill(replacement);
    await testRepair.click();
    await browserExpect(repair.getByText("新凭据已通过 IMAP 测试", { exact: false })).toBeVisible();
    if (screenshots) await shell.screenshot({ path: path.join(screenshots, "mail-repair-390.png"), animations: "disabled", style: 'dialog input[type="password"] { visibility: hidden; }' });
    await repair.getByRole("button", { name: "保存新认证" }).click();
    await browserExpect(repair).toBeHidden();
    await browserExpect(shell.getByRole("heading", { name: "回环邮箱已修改" })).toBeVisible();
    await shell.getByRole("button", { name: "更改名称", exact: true }).click();
    const rename = shell.getByRole("dialog", { name: "更改邮箱名称" });
    await rename.getByLabel("显示名称").fill("已修复的回环邮箱");
    await rename.getByRole("button", { name: "保存名称" }).click();
    await browserExpect(shell.getByRole("heading", { name: "已修复的回环邮箱" })).toBeVisible();
    const synced = shell.waitForResponse((response) => response.url().endsWith("/api/v1/call") && response.request().postDataJSON()?.capability === "mail.sync.refresh");
    await shell.getByRole("button", { name: "同步目录", exact: true }).click();
    expect(await (await synced).json()).toMatchObject({ ok: true, data: { message: { subject } } });
    await browserExpect(openedMessage).toBeVisible();
    expect(pageErrors).toEqual([]);
  } finally {
    deliverRepairReply.resolve();
    await browser.close();
    try {
      assert(engine.moduleCredentialHost);
      const owner = new ModuleCredentials({ ...engine.moduleCredentialHost, vault: engine.vault, pluginId: "mail", definition: mailAccountDefinitionSchema, targets: ({ settings }) => accountTargets(settings) });
      for (const { entityId, revision } of await owner.list()) await owner.delete(entityId, revision);
    } finally {
      await Promise.all([imap.close(), other.close(), smtp.close(), engine.shutdown()]);
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    }
  }
}, 90_000);
