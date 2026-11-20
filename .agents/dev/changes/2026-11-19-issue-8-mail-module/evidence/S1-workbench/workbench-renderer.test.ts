import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect as browserExpect } from "@playwright/test";
import { ModuleCredentials } from "@huhu/kernel";
import { assert, expect, test, vi } from "vitest";
import { boot } from "../../../apps/engine/src/boot.js";
import type { SelectDraftAttachment, SelectDraftAttachmentResult } from "../src/desktop-attachments.js";
import { accountTargets, mailAccountDefinitionSchema } from "../src/engine/account-definition.js";
import { MAX_DRAFT_ATTACHMENT_BYTES, type MailDraftAttachments } from "../src/engine/index.js";
import { openImapFixture } from "./fixtures/imap.js";
import { loopbackSmtp } from "./fixtures/smtp.js";

const attachmentServices = vi.hoisted(() => new Map<string, MailDraftAttachments>());
vi.mock("@huhu/plugin-mail/engine", async (original) => {
  const mail = await original<typeof import("../src/engine/index.js")>();
  return {
    ...mail,
    apply: ((ctx, api, owner, transport) =>
      mail.apply(
        ctx,
        {
          ...api,
          provide(name, service) {
            api.provide(name, service);
            if (name === mail.MAIL_DRAFT_ATTACHMENTS_SERVICE) attachmentServices.set(api.vault.files.root, service as MailDraftAttachments);
          },
        },
        owner,
        transport,
      )) satisfies typeof mail.apply,
  };
});

test("Mail 实际组件经本机 Engine 走通阅读、回复、账号维护、草稿附件和投递", async () => {
  const repo = path.resolve(import.meta.dirname, "../../..");
  const desktop = path.join(repo, "apps/desktop");
  const entry = path.join(desktop, "src/renderer/mail-proof-entry.tsx");
  const bridge = path.join(repo, "packages/workbench/src/mail-proof-bridge.ts");
  const absolute = (item: string) => path.join(repo, item).replaceAll("\\", "/");
  const bundleEntry = [
    'import { createRoot } from "react-dom/client";',
    'import "@huhu/ui/styles.css";',
    'import { EngineProvider, checkExitParticipants } from "@huhu/workbench";',
    "import { contributions } from " + JSON.stringify(absolute("plugins/mail/src/ui/index.tsx")) + ";",
    "const Mail = contributions.modules[0].component;",
    'window.checkMailProofExit = () => checkExitParticipants({ reason: "window", signal: new AbortController().signal, waitForUser: (decision) => decision });',
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
  const replyRoute = "reply-target@example.invalid";
  const participant = "team-member@example.invalid";
  const originalMessageId = "<original-edge@example.invalid>";
  const ancestorMessageId = "<prior-edge@example.invalid>";
  const message = {
    uidValidity: 12,
    subject,
    ignoreRead: true,
    source: [
      `Subject: ${subject}`,
      "From: Original Sender <author@example.invalid>",
      `Reply-To: Reply Route <${replyRoute}>`,
      `To: renderer@example.invalid, second@example.invalid, ${participant}`,
      `Cc: ${participant.toUpperCase()}, ${replyRoute}`,
      "Bcc: hidden-original@example.invalid",
      `Message-ID: ${originalMessageId}`,
      `References: ${ancestorMessageId}`,
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
  const other = await openImapFixture({
    acceptPassword: (value) => value === otherPassword,
    message: { uidValidity: 12, subject: "Other mailbox fixture", source: "From: author@example.invalid\r\nSubject: Other mailbox fixture\r\n\r\nOther account\r\n" },
  });
  const smtp = await loopbackSmtp(password);
  const engine = await boot({ vaultPath, desktopUserData, create: true });
  const managed = attachmentServices.get(engine.vault.root);
  assert(managed);
  const attachmentsPath = path.join(vaultPath, ".huhu/mail/attachments");
  const selectedFile = path.join(root, "selected.bin");
  const duplicateFile = path.join(root, "duplicate.bin");
  const overLimitFile = path.join(root, "large.bin");
  const fileBytes = Buffer.from([0, 255, 8, 0, 91, 252]);
  const fileDigest = createHash("sha256").update(fileBytes).digest("hex");
  writeFileSync(selectedFile, fileBytes);
  writeFileSync(duplicateFile, fileBytes);
  writeFileSync(overLimitFile, "");
  truncateSync(overLimitFile, MAX_DRAFT_ATTACHMENT_BYTES + 1);
  let selected: { file: string; size: number } | null = null;
  let holdSelection = false;
  const selectionReady = Promise.withResolvers<void>();
  const deliverSelection = Promise.withResolvers<void>();
  const selectionSettled = Promise.withResolvers<void>();
  const selections: SelectDraftAttachment[] = [];
  const cancellations: string[] = [];
  const pendingSelections = new Map<string, AbortController>();
  let importCalls = 0;
  let fileReads = 0;
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
    await shell.exposeFunction("fixtureSelectAndAdd", async (input: SelectDraftAttachment): Promise<SelectDraftAttachmentResult> => {
      expect(Object.keys(input).sort()).toEqual(["draftId", "expectedRevision", "operationId", "vaultId"]);
      expect(input.vaultId).toBe(engine.vault.id);
      expect(await direct("mail.drafts.get", { draftId: input.draftId })).toMatchObject({ draft: { revision: input.expectedRevision } });
      selections.push(input);
      const controller = new AbortController();
      pendingSelections.set(input.operationId, controller);
      const chosen = selected;
      const delayed = holdSelection;
      try {
        if (delayed) {
          selectionReady.resolve();
          await deliverSelection.promise;
        }
        if (controller.signal.aborted) return { status: "failed", reason: "interrupted" };
        if (!chosen) return { status: "cancelled" };
        importCalls++;
        const { draft, deduped } = await managed.addAttachment(
          { draftId: input.draftId, expectedRevision: input.expectedRevision },
          {
            name: path.basename(chosen.file),
            size: chosen.size,
            read(signal) {
              fileReads++;
              return createReadStream(chosen.file, { signal, highWaterMark: 2 });
            },
          },
          controller.signal,
        );
        const { draftId, revision, attachments } = draft;
        return { status: "attached", draft: { draftId, revision, ...(attachments && { attachments }) }, deduped };
      } catch (err) {
        const reason = (err as { details?: { reason?: unknown } }).details?.reason;
        return { status: "failed", reason: reason === "attachment-too-large" ? "too-large" : reason === "attachment-source-missing" ? "source-missing" : "failed" };
      } finally {
        pendingSelections.delete(input.operationId);
        if (delayed) selectionSettled.resolve();
      }
    });
    await shell.exposeFunction("fixtureCancelAttachment", (operationId: string) => {
      cancellations.push(operationId);
      pendingSelections.get(operationId)?.abort();
    });
    await shell.addInitScript(
      (endpoint) => {
        Reflect.set(window, "testEndpoint", endpoint);
        Reflect.set(window, "huhuHost", {
          mailDraftAttachments: {
            selectAndAdd: (input: SelectDraftAttachment) => Reflect.get(window, "fixtureSelectAndAdd")(input),
            cancel: (id: string) => Reflect.get(window, "fixtureCancelAttachment")(id),
          },
        });
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
    await offscreen.evaluate((element) => element.parentNode?.removeChild(element));
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
    await browserExpect(body).toBeHidden();
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
    await openedMessage.press("Enter");
    const replyComposer = shell.locator(".hu-mail-compose");
    const replyEditor = replyComposer.getByRole("textbox", { name: "正文", exact: true });
    const mailReader = shell.getByRole("region", { name: "邮件阅读", exact: true });
    const dataBeforeReply = smtp.counts.data;
    await mailReader.getByRole("button", { name: "引用回复", exact: true }).press("Enter");
    await browserExpect(replyEditor).toBeFocused();
    await browserExpect(replyComposer.getByLabel("收件人", { exact: true })).toHaveValue(replyRoute);
    await browserExpect(replyComposer.getByLabel("抄送", { exact: true })).toHaveValue("");
    expect(smtp.counts.data).toBe(dataBeforeReply);
    await replyComposer.getByRole("button", { name: "丢弃", exact: true }).click();
    await shell.getByRole("dialog", { name: "丢弃草稿？" }).getByRole("button", { name: "丢弃草稿", exact: true }).click();
    await browserExpect(replyComposer).toBeHidden();

    const messageContent = mailReader.getByRole("region", { name: "正文", exact: true });
    await messageContent.click({ button: "right" });
    await shell.getByRole("dialog", { name: "邮件操作", exact: true }).getByRole("button", { name: "回复全部", exact: true }).click();
    await browserExpect(replyEditor).toBeFocused();
    await browserExpect(replyComposer).toHaveAttribute("data-inline", "true");
    await browserExpect(replyComposer.getByLabel("发件人", { exact: true })).toBeDisabled();
    await browserExpect(replyComposer.getByLabel("收件人", { exact: true })).toHaveValue(replyRoute);
    await browserExpect(replyComposer.getByLabel("抄送", { exact: true })).toHaveValue(participant);
    await browserExpect(replyComposer.getByLabel("密送", { exact: true })).toHaveValue("");
    await browserExpect(replyEditor).toContainText("> 纯文本正文");
    await replyEditor.pressSequentially("My reply");
    await replyEditor.getByText("> 纯文本正文", { exact: true }).click();
    await replyEditor.press("End");
    await replyEditor.pressSequentially(" [edited]");
    await browserExpect(replyEditor).toContainText("> 纯文本正文 [edited]");
    await replyComposer.getByLabel("主题", { exact: true }).press("Enter");
    expect(smtp.counts.data).toBe(dataBeforeReply);
    failDraftSave = true;
    await replyComposer.getByRole("button", { name: "关闭写信" }).click();
    await browserExpect(replyComposer.getByText("暂时无法确认操作结果", { exact: false })).toBeVisible();
    await browserExpect(replyEditor).toContainText("My reply");
    await replyComposer.getByRole("button", { name: "关闭写信" }).click();
    await browserExpect(replyComposer).toBeHidden();
    expect(smtp.counts.data).toBe(dataBeforeReply);

    await shell.getByRole("button", { name: "草稿", exact: true }).click();
    await shell.getByRole("button", { name: `Re: ${subject}`, exact: true }).click();
    await shell.getByRole("button", { name: "继续编辑", exact: true }).click();
    await browserExpect(replyEditor).toContainText("My reply");
    await browserExpect(replyEditor).toContainText("> 纯文本正文 [edited]");
    await browserExpect(replyComposer.getByText(`回复原邮件「${subject}」`, { exact: false })).toBeVisible();
    if (screenshots) await shell.screenshot({ path: path.join(screenshots, "mail-reply-390.png"), animations: "disabled" });
    smtp.configure("accept");
    await replyComposer.getByRole("button", { name: "发送邮件", exact: true }).press("Enter");
    await browserExpect(replyComposer).toBeHidden();
    await expect.poll(() => smtp.counts.data).toBe(dataBeforeReply + 1);
    await expect.poll(() => smtp.messages.at(-1)?.recipients).toEqual([replyRoute, participant]);
    const replyWire = smtp.messages.at(-1)?.wire;
    expect(replyWire).toContain(`In-Reply-To: ${originalMessageId}`);
    expect(replyWire).toContain(`References: ${ancestorMessageId} ${originalMessageId}`);
    expect(replyWire).not.toContain("hidden-original@example.invalid");
    await shell.getByRole("button", { name: "邮箱", exact: true }).click();

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
    const otherMessage = shell.getByRole("button", { name: "Other mailbox fixture" });
    await browserExpect(otherMessage).toBeVisible();
    await browserExpect(openedMessage).toBeHidden();
    await otherMessage.click();
    await mailReader.getByRole("button", { name: "引用回复", exact: true }).click();
    await browserExpect(replyComposer.getByText("原邮箱只接收邮件", { exact: false })).toBeVisible();
    await browserExpect(replyComposer.getByRole("button", { name: "发送邮件", exact: true })).toBeDisabled();
    await replyComposer.getByRole("button", { name: "关闭写信", exact: true }).click();
    await browserExpect(replyComposer).toBeHidden();
    expect(smtp.counts.data).toBe(dataBeforeReply + 1);
    await backMessages.click();

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

    const attachmentSubject = "附件回环草稿";
    const attachmentDataBefore = smtp.counts.data;
    await shell.getByRole("button", { name: "写信", exact: true }).click();
    const attachmentComposer = shell.getByRole("region", { name: "写信", exact: true });
    const attachmentEditor = attachmentComposer.getByRole("textbox", { name: "正文", exact: true });
    await attachmentComposer.getByLabel("主题", { exact: true }).fill(attachmentSubject);
    await attachmentEditor.pressSequentially("Local attachment draft");
    const addFile = attachmentComposer.getByRole("button", { name: "添加附件", exact: true });
    const list = attachmentComposer.getByRole("list", { name: "已有附件" });
    const closeAttachmentDraft = attachmentComposer.getByRole("button", { name: "关闭写信", exact: true });
    failDraftSave = true;
    await addFile.press("Enter");
    await browserExpect(attachmentComposer.getByRole("alert")).toContainText("暂时无法确认操作结果");
    expect(selections).toHaveLength(0);
    await browserExpect(attachmentEditor).toHaveText("Local attachment draft");

    await addFile.press("Enter");
    await browserExpect(addFile).toBeEnabled();
    await browserExpect(addFile).toBeFocused();
    expect(selections).toHaveLength(1);
    expect(importCalls).toBe(0);
    expect(fileReads).toBe(0);
    expect(existsSync(attachmentsPath)).toBe(false);
    const { draftId } = selections[0]!;
    const getAttachmentDraft = async () => (await direct("mail.drafts.get", { draftId })).draft;
    expect(await getAttachmentDraft()).toMatchObject({ draftId, subject: attachmentSubject, revision: selections[0]!.expectedRevision });

    selected = { file: selectedFile, size: fileBytes.length };
    await addFile.click();
    await browserExpect(list.getByRole("listitem")).toHaveCount(1);
    await browserExpect(list).toContainText("selected.bin · 6 字节 · 已保存");
    const attachedDraft = await getAttachmentDraft();
    expect(attachedDraft.attachments).toEqual([{ digest: fileDigest, name: "selected.bin", size: fileBytes.length, state: "ready" }]);
    selected = { file: duplicateFile, size: fileBytes.length };
    await addFile.click();
    await browserExpect(shell.getByText("此附件已存在。", { exact: true })).toBeVisible();
    expect(await getAttachmentDraft()).toEqual(attachedDraft);
    expect(fileReads).toBe(2);

    selected = { file: overLimitFile, size: MAX_DRAFT_ATTACHMENT_BYTES + 1 };
    await addFile.click();
    await browserExpect(attachmentComposer.getByRole("alert")).toContainText("单个附件不能超过 25 MiB");
    expect(fileReads).toBe(2);
    expect(await getAttachmentDraft()).toEqual(attachedDraft);
    renameSync(selectedFile, `${selectedFile}.moved`);
    selected = { file: selectedFile, size: fileBytes.length };
    await addFile.click();
    await browserExpect(attachmentComposer.getByRole("alert")).toContainText("所选文件已不存在");
    expect(await getAttachmentDraft()).toEqual(attachedDraft);
    await browserExpect(attachmentEditor).toHaveText("Local attachment draft");

    const openAttachmentDraft = async () => {
      await shell.getByRole("button", { name: "草稿", exact: true }).click();
      await shell.getByRole("button", { name: attachmentSubject, exact: true }).click();
      await shell.getByRole("button", { name: "继续编辑", exact: true }).click();
      await browserExpect(attachmentEditor).toHaveText("Local attachment draft");
    };
    await closeAttachmentDraft.press("Enter");
    await browserExpect(attachmentComposer).toBeHidden();
    await openAttachmentDraft();
    await browserExpect(list).toContainText("selected.bin · 6 字节 · 已保存");
    const objectFile = path.join(attachmentsPath, fileDigest);
    expect(readFileSync(objectFile)).toEqual(fileBytes);
    expect(managed.readAttachment({ draftId, digest: fileDigest })).toMatchObject({ state: "ready", bytes: fileBytes });
    if (screenshots) {
      await browserExpect(shell.getByText("此附件已存在。", { exact: true })).toBeHidden();
      await list.scrollIntoViewIfNeeded();
      await shell.screenshot({ path: path.join(screenshots, "mail-attachments-390.png"), animations: "disabled" });
    }
    await closeAttachmentDraft.click();
    await browserExpect(attachmentComposer).toBeHidden();
    rmSync(objectFile);
    await openAttachmentDraft();
    await browserExpect(list).toContainText("字节缺失");
    selected = { file: duplicateFile, size: fileBytes.length };
    await addFile.click();
    await browserExpect(list).toContainText("selected.bin · 6 字节 · 已保存");
    expect(readFileSync(objectFile)).toEqual(fileBytes);

    const removeFile = list.getByRole("button", { name: "移除附件 selected.bin", exact: true });
    await removeFile.press("Enter");
    await browserExpect(list).toBeHidden();
    await browserExpect(addFile).toBeFocused();
    expect(existsSync(objectFile)).toBe(false);
    const removedDraft = await getAttachmentDraft();
    expect(removedDraft.attachments).toBeUndefined();
    expect(removedDraft.revision).not.toBe(attachedDraft.revision);

    const importsBeforeClose = importCalls;
    holdSelection = true;
    await addFile.click();
    await expect.poll(() => pendingSelections.size).toBe(1);
    await selectionReady.promise;
    expect(await shell.evaluate(() => Reflect.get(window, "checkMailProofExit")())).toBe(true);
    await browserExpect(attachmentComposer).toBeHidden();
    await expect.poll(() => cancellations).toEqual([selections.at(-1)!.operationId]);
    await openAttachmentDraft();
    deliverSelection.resolve();
    await selectionSettled.promise;
    await browserExpect(addFile).toBeEnabled();
    await browserExpect(list).toBeHidden();
    await browserExpect(attachmentComposer.getByRole("alert")).toHaveCount(0);
    expect(importCalls).toBe(importsBeforeClose);
    expect(await getAttachmentDraft()).toEqual(removedDraft);
    expect(existsSync(objectFile)).toBe(false);
    expect(smtp.counts.data).toBe(attachmentDataBefore);

    await shell.getByRole("button", { name: "邮箱", exact: true }).click();
    const removeMailbox = shell.getByRole("button", { name: "删除邮箱", exact: true });
    await removeMailbox.press("Enter");
    const removal = shell.getByRole("dialog", { name: "删除本地邮箱", exact: true });
    const impacted = removal.getByRole("list", { name: "删除影响" });
    await browserExpect(impacted).toContainText("份草稿");
    await browserExpect(removal.getByText("已修复的回环邮箱", { exact: true })).toBeVisible();
    const cancelRemoval = removal.getByRole("button", { name: "取消", exact: true });
    await browserExpect(cancelRemoval).toBeFocused();
    if (screenshots) await shell.screenshot({ path: path.join(screenshots, "mail-remove-preview-390.png"), animations: "disabled" });
    await cancelRemoval.press("Enter");
    await browserExpect(removal).toBeHidden();
    await browserExpect(removeMailbox).toBeFocused();
    await browserExpect(attachmentEditor).toHaveText("Local attachment draft");

    await removeMailbox.press("Enter");
    await browserExpect(impacted).toBeVisible();
    const current = await direct("mail.accounts.list", {});
    const target = current.accounts.find((row: { definition: { settings: { label: string } } }) => row.definition.settings.label === "已修复的回环邮箱");
    assert(target);
    await direct("mail.accounts.rename", { accountId: target.accountId, expectedRevision: target.revision, label: "重新核对的邮箱" });
    const confirmRemoval = removal.getByRole("button", { name: "删除此邮箱", exact: true });
    await confirmRemoval.click();
    await browserExpect(removal.getByRole("alert")).toContainText("删除影响已变化");
    await browserExpect(confirmRemoval).toBeDisabled();
    await removal.getByRole("button", { name: "刷新预览", exact: true }).click();
    await browserExpect(removal.getByText("重新核对的邮箱", { exact: true })).toBeVisible();
    const publish = engine.vault.files.write.bind(engine.vault.files);
    const failCredentialCleanup = vi.spyOn(engine.vault.files, "write").mockImplementation(async (...args) => {
      if (args[0].startsWith(".huhu/module-credentials/")) throw new Error("fixture credential cleanup failure");
      return publish(...args);
    });
    try {
      await confirmRemoval.click();
      await browserExpect(removal.getByRole("alert")).toContainText("部分本机资料尚未清理");
      await browserExpect(attachmentComposer).toBeHidden();
    } finally {
      failCredentialCleanup.mockRestore();
    }
    await removal.getByRole("button", { name: "关闭", exact: true }).first().press("Escape");
    await browserExpect(removal).toBeHidden();
    const pendingRemoval = shell.getByRole("button", { name: "继续清理 重新核对的邮箱", exact: true });
    await pendingRemoval.press("Enter");
    await removal.getByRole("button", { name: "继续清理", exact: true }).click();
    await browserExpect(removal).toBeHidden();
    await browserExpect(attachmentComposer).toBeHidden();
    await browserExpect(shell.getByRole("button", { name: "全部账号", exact: true })).toBeFocused();
    await browserExpect(accountB).toBeVisible();
    await browserExpect(shell.getByRole("button", { name: "重新核对的邮箱", exact: true })).toBeHidden();
    expect(await getAttachmentDraft()).toBeNull();
    await shell.getByRole("button", { name: "发件箱", exact: true }).click();
    await shell.getByRole("button", { name: "保留的投递记录 · 待核实", exact: true }).click();
    await browserExpect(shell.getByText("来源邮箱已移除。", { exact: false })).toBeVisible();
    await browserExpect(shell.getByText(/^Message-ID <[a-f0-9-]+@huhu\.local>$/)).toBeVisible();
    await browserExpect(shell.getByRole("group", { name: "选择明确未投递的收件人" })).toBeHidden();
    expect(smtp.counts.data).toBe(attachmentDataBefore);
    expect(imap.commands).not.toContain("DELETE");
    expect(pageErrors).toEqual([]);
  } catch (error) {
    if (screenshots) await shell.screenshot({ path: path.join(screenshots, "mail-probe-failure.png"), style: 'input[type="password"] { visibility: hidden; }' });
    throw error;
  } finally {
    deliverSelection.resolve();
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
