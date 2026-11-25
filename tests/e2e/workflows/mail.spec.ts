import { _electron as electron, chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { ModuleCredentials } from "../../../packages/kernel/src/credentials/module-credentials.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { accountPasswordPurpose, accountTargets, mailAccountDefinitionSchema } from "../../../plugins/mail/src/engine/account-definition.js";
import { createMailOAuth, oauthMailEndpoints, type SealedOAuthToken } from "../../../plugins/mail/src/engine/oauth-provider.js";
import { operationIdFor, OutboxStorage } from "../../../plugins/mail/src/engine/outbox-storage.js";
import { createMailArchive } from "../../../plugins/mail/src/engine/subset-archive.js";
import { graphFixture, graphScopes } from "../../../plugins/mail/test/fixtures/graph.js";
import { openImapFixture, type FixtureImapMessage } from "../../../plugins/mail/test/fixtures/imap.js";
import { openApp, root as desktopRoot, USER_DATA_ARG } from "../helpers/launch.js";

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

async function createDesktopFixtureAccount(call: Awaited<ReturnType<typeof desktopMailCalls>>, name: string, label: string, port: number) {
  const endpoint = { host: "127.0.0.1", port, security: "none" };
  const { setupId } = await call<{ setupId: string }>("mail.accounts.testConnection", {
    settings: { provider: "custom_imap", email: `${name}@example.test`, label, auth: "password", imap: endpoint, smtpEnabled: false, smtp: endpoint },
    password: "synthetic-loopback-password",
  });
  return call<{ accountId: string }>("mail.accounts.save", { setupId, folders: ["INBOX"] });
}

async function openGraphWorkbench() {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-e2e-graph-"));
  const clientId = "graph-workbench-fixture";
  const email = "graph-workbench@example.test";
  const firstLabel = "Graph 同步邮箱";
  const secondLabel = "Graph 另一邮箱";
  const scopesToRead = graphScopes.split(" ")[0]!;
  const originalAccess = "graph-workbench-original";
  const refreshedAccess = "graph-workbench-renewed";
  let now = Date.now();
  const renewals: string[] = [];
  const graph = graphFixture(() => [originalAccess, refreshedAccess]);
  const initial = graph.add("initial-message", email, 1);
  initial.isRead = true;
  graph.pages.set("initial", { value: [initial], cursor: "before-manual-refresh" });
  const incoming = graph.add("new-message", email, 2);
  incoming.isRead = true;
  graph.pages.set("before-manual-refresh", { value: [incoming], cursor: "after-manual-refresh" });

  function deltaGate() {
    return { arrived: false, cancelled: false, authorization: "", release: Promise.withResolvers<void>() };
  }
  let held: ReturnType<typeof deltaGate> | undefined;
  const issuer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/token" && req.method === "POST") {
      req.setEncoding("utf8");
      let body = "";
      req.on("data", (chunk: string) => {
        body += chunk;
      });
      req.on("end", () => {
        const fields = new URLSearchParams(body);
        const scope = fields.get("scope") ?? "";
        renewals.push(scope);
        if (fields.get("client_id") !== clientId || fields.get("grant_type") !== "refresh_token" || fields.get("refresh_token") !== "graph-workbench-refresh") {
          res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "invalid_grant" }));
        } else if (scope.split(" ").includes("https://graph.microsoft.com/Mail.Send")) {
          res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "invalid_scope" }));
        } else {
          res.writeHead(200, { "Content-Type": "application/json" }).end(
            JSON.stringify({
              access_token: refreshedAccess,
              token_type: "Bearer",
              expires_in: 120,
              scope: scopesToRead,
            }),
          );
        }
      });
      return;
    }
    if (held && !held.arrived && url.searchParams.get("$deltatoken") === "before-manual-refresh") {
      const gate = held;
      gate.arrived = true;
      gate.authorization = req.headers.authorization ?? "";
      res.once("close", () => {
        gate.cancelled = !res.writableEnded;
      });
      void gate.release.promise.then(() => {
        if (!res.destroyed) graph.handle(req, res);
      });
      return;
    }
    if (!graph.handle(req, res)) res.writeHead(404).end();
  });
  let engine: RunningEngine | undefined;
  let browser: Browser | undefined;
  const close = async () => {
    held?.release.resolve();
    try {
      await browser?.close();
    } finally {
      issuer.closeAllConnections();
      await new Promise<void>((resolve) => issuer.close(() => resolve()));
      await engine?.shutdown();
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  };
  try {
    await new Promise<void>((resolve, reject) => {
      issuer.once("error", reject);
      issuer.listen(0, "127.0.0.1", resolve);
    });
    const address = issuer.address();
    if (!address || typeof address === "string") throw new Error("Graph fixture has no loopback port");
    const base = `http://127.0.0.1:${address.port}`;
    const runtime = createMailOAuth({ microsoft: { clientId } }, { hostLabel: "Graph workbench fixture", openBrowser: async () => undefined });
    runtime.issuers.outlook = {
      ...runtime.issuers.outlook!,
      authorize: `${base}/authorize`,
      token: `${base}/token`,
      jwks: `${base}/keys`,
      issuer: base,
      graphApi: `${base}${graph.endpoint}`,
    };
    runtime.now = () => now;
    const vaultPath = path.join(root, "vault");
    const appData = path.join(root, "app");
    const protection = path.join(root, "protection");
    for (const dir of [vaultPath, appData, protection]) mkdirSync(dir);
    const running = await boot({
      vaultPath,
      desktopUserData: appData,
      create: true,
      webAssetsDir: path.join(desktopRoot, "out", "web"),
      moduleCredentialProtection: new TestProtection(protection),
      mailOAuth: runtime,
    });
    engine = running;
    if (!running.moduleCredentialHost) throw new Error("Fixture requires local credential protection");
    const store = new ModuleCredentials({
      ...running.moduleCredentialHost,
      vault: running.vault,
      pluginId: "mail",
      definition: mailAccountDefinitionSchema,
      targets: ({ settings, oauth }) => accountTargets(settings, oauth),
    });
    const seedAccount = async (address: string, label: string, send: boolean, replacement?: { accountId: string; revision: string }) => {
      const id = replacement?.accountId ?? randomUUID();
      const credential: SealedOAuthToken = {
        access: originalAccess,
        refresh: "graph-workbench-refresh",
        until: now + 120_000,
        scopes: send ? graphScopes : scopesToRead,
        smtp: false,
        resource: "graph",
        graphInbox: initial.parentFolderId,
      };
      await store.save({
        entityId: id,
        expectedRevision: replacement?.revision ?? null,
        definition: {
          format: 1,
          settings: { provider: "outlook", auth: "oauth2", email: address, label, smtpEnabled: send, ...oauthMailEndpoints("outlook", address, false) },
          oauth: { clientId, subject: id, route: "graph", graphSend: send },
          folders: [{ path: "INBOX", name: "INBOX", delimiter: null, specialUse: null, flags: [] }],
        },
        actions: [{ purpose: accountPasswordPurpose, action: "replace", value: JSON.stringify(credential), ...(replacement && { reconfigure: true as const }) }],
      });
      return id;
    };
    const accountId = await seedAccount(email, firstLabel, true);
    await seedAccount("other-graph@example.test", secondLabel, false);
    const mailbox = { accountId, folder: "INBOX" };
    const call = async <T>(capability: string, input: unknown = {}) => {
      const result = await running.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() });
      if (!result.ok) throw new Error(`${capability} failed: ${JSON.stringify(result.error)}`);
      return result.data as T;
    };
    await call("mail.sync.refresh", mailbox);
    expect(await call("mail.messages.latest", mailbox)).toMatchObject({ message: { nativeId: initial.id } });
    expect(await call("web.share.start", { mode: "local" })).toMatchObject({ state: "running" });
    const { links } = await call<{ links: string[] }>("web.invitations.create");
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    await page.goto(links[0]!);
    await page.getByRole("button", { name: "邮件", exact: true }).first().click();
    await page.getByRole("button", { name: firstLabel, exact: true }).click();
    await page.getByRole("combobox", { name: "时间", exact: true }).selectOption("all");
    await expect(page.getByRole("complementary", { name: "联系人对话" })).toContainText("Graph message 1");
    return {
      page,
      close,
      email,
      accountId,
      firstLabel,
      call,
      secondLabel,
      renewals,
      sentMail: graph.sent,
      expectedRenewal: [graphScopes, scopesToRead],
      refreshedAccess,
      expireSoon: () => {
        now += 100_000;
      },
      holdDelta: () => (held = deltaGate()),
      expectCached: (nativeId: string) => expect.poll(() => call("mail.messages.latest", mailbox)).toMatchObject({ message: { nativeId } }),
      seedMixedDelivery: async () => {
        const draftId = randomUUID();
        const revision = randomUUID();
        const operationId = operationIdFor(draftId, revision);
        const messageId = `<${randomUUID()}@huhu.local>`;
        const at = new Date().toISOString();
        const to = ["accepted-f13@example.test", "refused-f13@example.test", "unknown-f13@example.test"];
        const bcc = ["blind-f13@example.test"];
        const subject = "逐收件人核对";
        const states = ["accepted", "not-delivered", "unknown", "accepted"] as const;
        await new OutboxStorage(running.vault.files).write({
          format: 1, operationId, draftId, revision, messageId, claimedAt: at, from: email, auth: "oauth2",
          smtp: oauthMailEndpoints("outlook", email, false).smtp,
          draft: { accountId, to, cc: [], bcc, subject, body: { type: "doc" } }, text: "投递结果测试。",
          result: { stage: "data", graphStatus: 202, finishedAt: at, recipients: [...to, ...bcc].map((address, index) => ({ address, state: states[index]! })) },
        }, null);
        return { messageId, subject, to, blind: bcc[0]! };
      },
      restoreSending: async () => {
        const account = ModuleCredentials.readPortableDefinition(running.vault.files, "mail", mailAccountDefinitionSchema, accountId);
        if (!account) throw new Error("Graph fixture account is missing");
        await seedAccount(email, firstLabel, true, { accountId, revision: account.revision });
        running.events.publish("entity.changed", { kind: "mail-account", id: accountId, op: "updated" });
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

test("Web 邮件往来按接受者分组，逐地址显示结果并回到原投递记录", async () => {
  const workbench = await openGraphWorkbench();
  const { page } = workbench;
  try {
    const { messageId, subject, to, blind } = await workbench.seedMixedDelivery();
    await page.reload();
    await page.getByRole("button", { name: "邮件", exact: true }).first().click();
    await page.getByRole("button", { name: workbench.firstLabel, exact: true }).click();
    await page.getByRole("combobox", { name: "时间", exact: true }).selectOption("all");
    const contacts = page.getByRole("complementary", { name: "联系人对话" });
    await contacts.getByRole("button", { name: /accepted-f13@example\.test.*逐收件人核对/ }).click();
    await expect(contacts).not.toContainText(to[1]!);
    await expect(contacts).not.toContainText(to[2]!);
    await page.getByRole("region", { name: "往来邮件" }).getByRole("button", { name: subject, exact: true }).click();
    const results = page.getByRole("list", { name: "收件人投递结果" });
    await expect(results.getByRole("listitem")).toHaveText([`${to[0]} · 服务端已接受`, `${to[1]} · 明确未投递`, `${to[2]} · 待核实`]);
    await expect(results).not.toContainText(blind);
    await page.getByRole("button", { name: "在发件箱核对投递", exact: true }).click();
    await expect(page.getByText(messageId, { exact: true })).toBeVisible();
    await expect(page.getByText("待核实", { exact: true })).toBeVisible();
  } finally {
    await workbench.close();
  }
});

test("工作台手动同步触发 Graph 降权后继续读取并停用该邮箱的发信入口", async () => {
  const workbench = await openGraphWorkbench();
  const { page } = workbench;
  try {
    const compose = page.getByRole("button", { name: "写信", exact: true });
    const composer = page.getByRole("form", { name: "写信" });
    const sender = composer.getByLabel("发件人");
    await compose.click();
    await expect(sender.locator("option").filter({ hasText: workbench.email })).toBeEnabled();
    await composer.getByRole("button", { name: "关闭写信" }).click();

    const delta = workbench.holdDelta();
    workbench.expireSoon();
    const refresh = page.getByRole("button", { name: "同步目录", exact: true });
    let refreshes = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/v1/call") && request.postDataJSON()?.capability === "mail.sync.refresh") refreshes++;
    });
    await refresh.click();
    await expect.poll(() => delta.arrived).toBe(true);
    expect(workbench.renewals).toEqual(workbench.expectedRenewal);
    expect(delta.authorization).toBe(`Bearer ${workbench.refreshedAccess}`);
    await expect(page.getByText(`${workbench.email} · OAuth · 只接收`, { exact: true })).toBeVisible();
    await expect.soft(refresh).toHaveAttribute("aria-busy", "true");
    await compose.click();
    await expect(sender.locator("option").filter({ hasText: workbench.email })).toHaveCount(0);
    await expect(composer.getByRole("button", { name: "发送邮件", exact: true })).toBeDisabled();
    await composer.getByRole("button", { name: "关闭写信" }).click();

    const contacts = page.getByRole("complementary", { name: "联系人对话" });
    await expect(contacts).not.toContainText("Graph message 2");
    expect.soft(delta.cancelled).toBe(false);
    delta.release.resolve();
    await expect(contacts).toContainText("Graph message 2");
    await expect(refresh).toBeEnabled();
    await workbench.expectCached("new-message");
    expect(refreshes).toBe(1);
  } finally {
    await workbench.close();
  }
});

for (const action of ["切换账号", "关闭邮件标签"] as const) {
  test(`工作台${action}时取消正在等待 Graph 的手动同步`, async () => {
    const workbench = await openGraphWorkbench();
    const { page } = workbench;
    try {
      const delta = workbench.holdDelta();
      await page.getByRole("button", { name: "同步目录", exact: true }).click();
      await expect.poll(() => delta.arrived).toBe(true);
      if (action === "切换账号") {
        await page.getByRole("button", { name: workbench.secondLabel, exact: true }).click();
        await expect(page.getByRole("heading", { name: workbench.secondLabel, exact: true })).toBeVisible();
      } else {
        const tabClose = page.getByRole("button", { name: "关闭邮件标签", exact: true });
        await tabClose.click();
        await expect(tabClose).toHaveCount(0);
      }
      await expect.poll(() => delta.cancelled).toBe(true);
      delta.release.resolve();
      await workbench.expectCached("initial-message");
    } finally {
      await workbench.close();
    }
  });
}

test("Graph 发件箱在只接收期间停用重试，恢复发信后可重试原收件人", async () => {
  const workbench = await openGraphWorkbench();
  const { page, accountId, call } = workbench;
  try {
    const recipient = "graph-retry@example.test";
    const otherRecipient = "graph-retry-later@example.test";
    const draftId = randomUUID();
    const subject = "Graph 发信权限变更";
    const permissionHistory = "该次投递时，Microsoft Graph 凭据缺少 Mail.Send 权限。";
    const { revision } = await call<{ revision: string }>("mail.drafts.save", {
      draftId,
      expectedRevision: null,
      draft: { accountId, to: [recipient, otherRecipient], cc: [], bcc: [], subject, body: { type: "doc", content: [{ type: "paragraph" }] } },
    });
    // The claim still sees sending enabled. Credential renewal during delivery returns a read-only grant.
    workbench.expireSoon();
    const { operationId, messageId } = await call<{ operationId: string; messageId: string }>("mail.outbox.submit", { draftId, expectedRevision: revision });
    await expect
      .poll(() => call("mail.outbox.status", { operationId }))
      .toMatchObject({
        state: "not-delivered",
        reason: "graph-send-permission",
        recipients: [
          { address: recipient, state: "not-delivered" },
          { address: otherRecipient, state: "not-delivered" },
        ],
      });

    await expect(page.getByText(`${workbench.email} · OAuth · 只接收`, { exact: true })).toBeVisible();
    // The parent operation was created outside this page. Reload its delivery list from the Engine.
    await page.reload();
    await page.getByRole("button", { name: "邮件", exact: true }).first().click();
    const original = page.getByRole("button", { name: `${subject} · 明确未投递`, exact: true });
    const [sourceDraft] = await Promise.all([
      page.waitForResponse((response) => {
        const request = response.request();
        if (request.method() !== "POST" || !request.url().endsWith("/api/v1/call")) return false;
        const input = request.postDataJSON();
        return input?.capability === "mail.drafts.get" && input.input?.draftId === draftId;
      }),
      (async () => {
        await page.getByRole("button", { name: "发件箱", exact: true }).click();
        await original.click();
      })(),
    ]);
    expect(await sourceDraft.json()).toMatchObject({ ok: true, data: { draft: { draftId, accountId } } });
    const detail = page.getByRole("article").filter({ has: page.getByRole("heading", { name: subject, exact: true }) });
    const hint = detail.getByText(permissionHistory, { exact: true });
    const recipients = detail.getByRole("list", { name: "收件人投递结果" }).getByRole("listitem");
    const choice = detail.getByRole("checkbox", { name: recipient, exact: true });
    const retry = detail.getByRole("button", { name: "重试所选收件人", exact: true });
    await expect(detail).toHaveAttribute("aria-busy", "false");
    await expect(hint).toBeVisible();
    await expect(recipients).toHaveText([`${recipient} · 明确未投递`, `${otherRecipient} · 明确未投递`]);
    await expect(retry).toHaveCount(0);
    expect(workbench.sentMail).toHaveLength(0);

    await workbench.restoreSending();
    await expect(choice).toBeEnabled();
    await expect(hint).toBeVisible();
    await choice.check();
    await retry.click();
    await expect(detail.getByText(`重试自 ${messageId}`, { exact: true })).toBeVisible();
    await expect(recipients).toHaveText([`${recipient} · 服务端已接受`]);
    expect(workbench.sentMail).toHaveLength(1);
    const destination = workbench.sentMail[0]?.match(/^To: (.+)$/m)?.[1]?.trim();
    expect(destination).toBe(recipient);

    await original.click();
    await expect(detail.getByRole("checkbox", { name: otherRecipient, exact: true })).toBeEnabled();
    await call("mail.drafts.discard", { draftId, expectedRevision: revision });
    await detail.getByRole("button", { name: "刷新投递状态", exact: true }).click();
    await expect(detail.getByText("源草稿已丢弃，无法从这条记录创建重试。", { exact: true })).toBeVisible();
    await expect(retry).toHaveCount(0);
    await expect(hint).toBeVisible();
  } finally {
    await workbench.close();
  }
});

test("工作台重开后续跑同地址 Mail 原批次并保留未完成邮箱的已读标记", async () => {
  const { page, vault, close } = await openApp();
  try {
    const call = await desktopMailCalls(page);
    const [firstId, secondId] = [randomUUID(), randomUUID()];
    const marker = createHash("sha256").update(secondId).digest("hex");
    const accounts = [firstId, secondId].map((accountId, index) => ({
      accountId,
      definition: {
        format: 1,
        settings: {
          provider: "custom_imap",
          email: "restore-fixture@example.test",
          label: index === 0 ? "原批次 A" : "原批次 B",
          auth: "password",
          imap: { host: "127.0.0.1", port: 1143, security: "none" },
          smtpEnabled: false,
          smtp: { host: "", port: 1025, security: "none" },
        },
        folders: [{ path: "INBOX", name: "INBOX", delimiter: "/", specialUse: null, flags: [] }],
      },
      drafts: {},
      deliveries: [],
      readOverrides: index === 0 ? [] : [marker],
    }));
    const buffer = await createMailArchive(readFileSync(path.join(vault, ".huhu/vault.json")), { format: "huhu-mail-subset", version: 1, accounts, attachments: {} }, AbortSignal.timeout(10_000));
    const overridePath = path.join(vault, ".huhu/mail/read-overrides", `${secondId}.json`);
    const list = () => call<{ accounts: { accountId: string; revision: string }[] }>("mail.accounts.list");
    const preflight = async () => {
      await page.getByRole("button", { name: "邮件", exact: true }).first().click();
      await page.getByRole("button", { name: "邮件设置", exact: true }).click();
      await page.getByRole("dialog", { name: "邮件设置", exact: true }).getByText("邮件备份和恢复", { exact: true }).click();
      await page.getByRole("button", { name: "预检并恢复" }).click();
      const dialog = page.getByRole("dialog", { name: "预检邮件备份" });
      await dialog.getByLabel("Huhu Mail 子集 ZIP（必填）").setInputFiles({ name: "original.zip", mimeType: "application/zip", buffer });
      await dialog.getByRole("button", { name: "运行预检" }).click();
      await expect(dialog.getByRole("heading", { name: "预检结果" })).toBeFocused();
      return dialog;
    };

    const initial = await preflight();
    await initial.getByRole("checkbox", { name: /^原批次 A ·/ }).check();
    await initial.getByRole("checkbox", { name: /^原批次 B ·/ }).check();
    // The second account refuses to overwrite this file after the first account commits.
    mkdirSync(path.dirname(overridePath), { recursive: true });
    writeFileSync(overridePath, JSON.stringify({ format: 1, messages: ["f".repeat(64)] }));
    await initial.getByRole("button", { name: "恢复选中邮箱" }).click();
    await expect.poll(async () => (await list()).accounts.map(({ accountId }) => accountId)).toEqual([firstId]);
    await expect(initial.getByRole("button", { name: "取消" })).toBeEnabled();
    const first = (await list()).accounts[0]!;
    rmSync(overridePath);

    await page.reload();
    await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
    const reopened = await preflight();
    const firstRow = reopened.getByRole("checkbox", { name: /^原批次 A ·/ });
    await expect(firstRow).toBeDisabled();
    const resume = reopened.getByRole("checkbox", { name: "按原批次续跑" });
    await expect(resume).not.toBeChecked();
    await resume.press("Space");
    await firstRow.check();
    await reopened.getByRole("checkbox", { name: /^原批次 B ·/ }).check();
    const separate = reopened.getByRole("checkbox", { name: /沿用独立账号选项/ });
    await expect(separate).toHaveCount(2);
    const independent = reopened.getByRole("checkbox", { name: "沿用独立账号选项 · 原批次 B" });
    await expect(independent).not.toBeChecked();
    await independent.check();
    await reopened.getByRole("button", { name: "续跑原批次" }).click();
    await expect(reopened.getByText(/无法核对原批次/)).toBeVisible();
    expect((await list()).accounts).toEqual([first]);
    await independent.uncheck();
    await reopened.getByRole("button", { name: "续跑原批次" }).click();
    await expect(page.getByRole("status").filter({ hasText: "原批次的 2 个邮箱已恢复" })).toBeVisible();
    const restored = (await list()).accounts;
    expect(restored.map(({ accountId }) => accountId).sort()).toEqual([firstId, secondId].sort());
    expect(restored.find(({ accountId }) => accountId === firstId)).toEqual(first);
    expect(JSON.parse(readFileSync(overridePath, "utf8"))).toEqual({ format: 1, messages: [marker] });
  } finally {
    await close();
  }
});

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

test("邮箱账号行独立刷新与管理两个账号，分栏可拖动且窄屏返回保留焦点", async () => {
  const source = (name: string): FixtureImapMessage => ({
    uid: 1,
    uidValidity: 42,
    subject: `${name} message`,
    source: `From: Sender <sender@example.test>\r\nTo: ${name}@example.test\r\nSubject: ${name} message\r\nDate: ${new Date().toUTCString()}\r\n\r\n${name} body\r\n`,
  });
  const pending = Promise.withResolvers<void>();
  const first = await openImapFixture({ message: source("first-account") });
  const second = await openImapFixture({ message: source("second-account"), beforeSource: () => pending.promise });
  try {
    const { page, close } = await openApp();
    try {
      await page.setViewportSize({ width: 1500, height: 950 });
      const call = await desktopMailCalls(page);
      await call("mail.sync.setInterval", { minutes: 0 });
      const a = await createDesktopFixtureAccount(call, "first-account", "第一个邮箱", first.port);
      const b = await createDesktopFixtureAccount(call, "second-account", "第二个邮箱", second.port);
      await call("mail.sync.refresh", { accountId: a.accountId, folder: "INBOX" });
      await page.getByRole("button", { name: "邮件", exact: true }).first().click();
      const sidebar = page.getByRole("complementary", { name: "邮箱账号" });
      const firstButton = sidebar.getByRole("button", { name: "第一个邮箱", exact: true });
      const secondButton = sidebar.getByRole("button", { name: "第二个邮箱", exact: true });
      const secondRow = sidebar.getByTestId("mail-account-row").filter({ has: page.getByRole("button", { name: "第二个邮箱", exact: true }) });
      await expect(secondButton).toHaveAttribute("data-mail-account", b.accountId);
      await expect(firstButton).toHaveAccessibleDescription(/1 封未读.*已同步/);
      await expect(secondButton).toHaveAccessibleDescription(/0 封未读.*等待首次同步/);
      await firstButton.click();

      const firstFetches = first.fetchRequests.length;
      const refresh = secondRow.getByRole("button", { name: "刷新 第二个邮箱" });
      await secondRow.hover();
      await expect(refresh).toHaveCSS("opacity", "1");
      await secondButton.focus();
      await page.keyboard.press("Tab");
      await expect(refresh).toBeFocused();
      await refresh.press("Enter");
      await expect(secondButton).toHaveAccessibleDescription(/同步中/);
      await expect.poll(() => second.fetchRequests.some((command) => /BODY\.PEEK/i.test(command))).toBe(true);
      expect(first.fetchRequests).toHaveLength(firstFetches);
      pending.resolve();
      await expect(secondButton).toHaveAccessibleDescription(/1 封未读.*已同步/);
      await expect(firstButton).toHaveAttribute("aria-pressed", "true");

      await secondButton.click({ button: "right" });
      const menu = page.getByRole("menu", { name: "第二个邮箱的操作" });
      await expect(menu.getByRole("menuitem", { name: "刷新" })).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(menu.getByRole("menuitem", { name: "修复认证" })).toBeFocused();
      await page.keyboard.press("Enter");
      const repair = page.getByRole("dialog", { name: "修复邮箱认证" });
      await expect(repair).toContainText("second-account@example.test");
      await repair.getByRole("button", { name: "取消" }).click();
      await expect(secondButton).toBeFocused();

      await secondButton.press("Shift+F10");
      await menu.getByRole("menuitem", { name: "更改名称" }).click();
      const rename = page.getByRole("dialog", { name: "更改邮箱名称" });
      await expect(rename).toContainText("second-account@example.test");
      await rename.getByLabel("显示名称").fill("已改名的邮箱");
      await rename.getByRole("button", { name: "保存名称" }).click();
      await expect(sidebar.getByRole("button", { name: "已改名的邮箱", exact: true })).toBeVisible();
      await expect(firstButton).toHaveAttribute("aria-pressed", "true");

      await sidebar.getByRole("button", { name: "已改名的邮箱的操作" }).press("ArrowDown");
      await page.keyboard.press("End");
      await expect(page.getByRole("menuitem", { name: "删除邮箱" })).toBeFocused();
      await page.keyboard.press("Enter");
      const removal = page.getByRole("dialog", { name: "删除本地邮箱" });
      await expect(removal).toContainText("second-account@example.test");
      await removal.getByRole("button", { name: "删除此邮箱" }).click();
      await expect(sidebar.getByRole("button", { name: "已改名的邮箱", exact: true })).toHaveCount(0);
      const remaining = await call<{ accounts: { accountId: string }[] }>("mail.accounts.list");
      expect(remaining.accounts.map(({ accountId }) => accountId)).toEqual([a.accountId]);
      await expect(firstButton).toHaveAttribute("aria-pressed", "true");

      const contacts = page.getByRole("complementary", { name: "联系人对话" });
      for (const [label, pane, minimum] of [
        ["调整账号栏宽度", sidebar, 220],
        ["调整联系人栏宽度", contacts, 160],
      ] as const) {
        const separator = page.getByRole("separator", { name: label });
        const position = (await separator.boundingBox())!;
        const before = (await pane.boundingBox())!.width;
        const x = position.x + position.width / 2;
        const y = position.y + 20;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 35, y, { steps: 4 });
        await page.mouse.up();
        await expect.poll(async () => (await pane.boundingBox())!.width).toBeGreaterThan(before + 20);
        await separator.press("Home");
        await expect(separator).toHaveAttribute("aria-valuenow", String(minimum));
        await separator.press("ArrowRight");
        await expect(separator).toHaveAttribute("aria-valuenow", String(minimum + 12));
      }

      await page.setViewportSize({ width: 480, height: 900 });
      await expect(page.getByRole("separator", { name: "调整账号栏宽度" })).toBeHidden();
      await expect(page.getByRole("separator", { name: "调整联系人栏宽度" })).toBeHidden();
      await expect(sidebar).toBeHidden();
      const latest = page.getByRole("button", { name: "阅读目录最新邮件" });
      await latest.click();
      const backMessages = page.getByRole("button", { name: "返回邮件列表" });
      await expect(backMessages).toBeFocused();
      await backMessages.click();
      await expect(latest).toBeFocused();
      await page.getByRole("button", { name: "返回账号" }).click();
      await expect(firstButton).toBeFocused();
      await expect(firstButton).toHaveAttribute("aria-pressed", "true");
    } finally {
      pending.resolve();
      await close();
    }
  } finally {
    pending.resolve();
    await Promise.all([first.close(), second.close()]);
  }
});

test("缓存越界时仍显示两个邮箱、健康邮箱可阅读、异常邮箱可修复认证", async () => {
  const outside = mkdtempSync(path.join(tmpdir(), "huhu-e2e-mail-cache-outside-"));
  const imap = await openImapFixture({
    message: { uidValidity: 42, subject: "Healthy message", source: "From: sender@example.test\r\nTo: healthy@example.test\r\nSubject: Healthy message\r\n\r\nHealthy cached body\r\n" },
  });
  try {
    const { page, vault, close } = await openApp();
    try {
      await page.setViewportSize({ width: 1500, height: 950 });
      const call = await desktopMailCalls(page);
      await call("mail.sync.setInterval", { minutes: 0 });
      const bad = await createDesktopFixtureAccount(call, "bad-cache", "异常缓存邮箱", imap.port);
      const good = await createDesktopFixtureAccount(call, "healthy", "健康缓存邮箱", imap.port);
      await call("mail.sync.refresh", { accountId: good.accountId, folder: "INBOX" });
      const digest = createHash("sha256")
        .update(JSON.stringify([bad.accountId, "INBOX"]))
        .digest("hex");
      symlinkSync(outside, path.join(vault, ".huhu/cache/mail", `${digest}.json`), "junction");

      await page.getByRole("button", { name: "邮件", exact: true }).first().click();
      const sidebar = page.getByRole("complementary", { name: "邮箱账号" });
      const badRow = sidebar.getByRole("button", { name: "异常缓存邮箱", exact: true });
      const goodRow = sidebar.getByRole("button", { name: "健康缓存邮箱", exact: true });
      await expect(badRow).toHaveAccessibleDescription(/未读数未知.*无法读取同步状态/);
      await expect(goodRow).toHaveAccessibleDescription(/1 封未读.*已同步/);
      await expect(page.getByRole("button", { name: "添加邮箱" })).toBeEnabled();
      await goodRow.click();
      await page.getByRole("button", { name: "阅读目录最新邮件" }).click();
      await expect(page.getByText("Healthy cached body", { exact: true })).toBeVisible();

      await badRow.press("Shift+F10");
      await page.getByRole("menu", { name: "异常缓存邮箱的操作" }).getByRole("menuitem", { name: "修复认证" }).click();
      const repair = page.getByRole("dialog", { name: "修复邮箱认证" });
      await expect(repair).toContainText("bad-cache@example.test");
      await repair.getByRole("button", { name: "取消" }).click();
      await expect(goodRow).toHaveAttribute("aria-pressed", "true");
    } finally {
      await close();
    }
  } finally {
    await imap.close();
    rmSync(outside, { recursive: true, force: true });
  }
});

test("邮件两处分栏随 Vault 重开恢复，窄窗收缩不覆盖保存值", async () => {
  const imap = await openImapFixture();
  const wide = { width: 1500, height: 950 };
  async function showMail(page: Page) {
    await page.setViewportSize(wide);
    await page.getByRole("button", { name: "邮件", exact: true }).first().click();
    await page.getByRole("button", { name: "分栏测试邮箱", exact: true }).click();
    return {
      account: page.getByRole("separator", { name: "调整账号栏宽度" }),
      contact: page.getByRole("separator", { name: "调整联系人栏宽度" }),
    };
  }
  async function prepare(page: Page) {
    const call = await desktopMailCalls(page);
    await call("mail.sync.setInterval", { minutes: 0 });
    await createDesktopFixtureAccount(call, "mail-layout", "分栏测试邮箱", imap.port);
    return call;
  }

  try {
    const first = await openApp();
    try {
      const call = await prepare(first.page);
      const { account, contact } = await showMail(first.page);
      await expect(account).toHaveAttribute("aria-valuenow", "260");
      await expect(contact).toHaveAttribute("aria-valuenow", "208");
      await account.press("End");
      await expect(account).toHaveAttribute("aria-valuenow", "440");

      const position = (await contact.boundingBox())!;
      const x = position.x + position.width / 2;
      const y = position.y + 20;
      await first.page.mouse.move(x, y);
      await first.page.mouse.down();
      await first.page.mouse.move(x + 200, y, { steps: 4 });
      await expect(contact).toHaveAttribute("aria-valuenow", "360");
      expect(await call("settings.get")).toMatchObject({ mail: { contactWidth: 208 } });
      await first.page.mouse.up();
      const saved = { mail: { accountWidth: 440, contactWidth: 360 } };
      await expect.poll(() => call("settings.get")).toMatchObject(saved);

      await first.page.setViewportSize({ width: 1120, height: 950 });
      await expect(contact).toBeVisible();
      await expect.poll(async () => Number(await contact.getAttribute("aria-valuenow"))).toBeLessThan(360);
      await first.page.setViewportSize({ width: 480, height: 900 });
      await expect(account).toBeHidden();
      await expect(contact).toBeHidden();
      expect(await call("settings.get")).toMatchObject(saved);
      await first.app.close();

      const second = await openApp();
      try {
        await prepare(second.page);
        const other = await showMail(second.page);
        await expect(other.account).toHaveAttribute("aria-valuenow", "260");
        await expect(other.contact).toHaveAttribute("aria-valuenow", "208");
      } finally {
        await second.close();
      }

      const reopened = await electron.launch({ args: [desktopRoot, "--no-sandbox", USER_DATA_ARG], env: { ...process.env, HUHU_VAULT: first.vault } });
      try {
        const page = await reopened.firstWindow();
        await desktopMailCalls(page);
        const restored = await showMail(page);
        await expect(restored.account).toHaveAttribute("aria-valuenow", "440");
        await expect(restored.contact).toHaveAttribute("aria-valuenow", "360");
      } finally {
        await reopened.close();
      }
    } finally {
      await first.close();
    }
  } finally {
    await imap.close();
  }
});

test("邮件分栏等待写权限，离开模块等两笔保存且迟到设置读取不覆盖宽度", async () => {
  const imap = await openImapFixture();
  const releaseAccess = Promise.withResolvers<void>();
  const releaseRead = Promise.withResolvers<void>();
  const releaseWrite = Promise.withResolvers<void>();
  try {
    const { page, close } = await openApp();
    try {
      const call = await desktopMailCalls(page);
      await call("mail.sync.setInterval", { minutes: 0 });
      await createDesktopFixtureAccount(call, "pane-delayed", "分栏延迟测试邮箱", imap.port);
      const oldSettings = await call("settings.get");
      let reads = 0;
      const writes: Array<{ accountWidth?: number; contactWidth?: number }> = [];
      await page.route("**/api/v1/call", async (route) => {
        const { capability, input } = route.request().postDataJSON() as { capability: string; input: { patch?: { mail?: (typeof writes)[number] } } };
        if (capability === "vault.info") await releaseAccess.promise;
        if (capability === "settings.get" && writes.length === 0) {
          reads++;
          await releaseRead.promise;
          // The renderer may have canceled this request after receiving a successful write.
          return route.fulfill({ status: 200, json: { ok: true, data: oldSettings } }).catch(() => undefined);
        }
        if (capability === "settings.update" && input.patch?.mail) {
          writes.push(input.patch.mail);
          if (writes.length === 1) {
            const response = await route.fetch();
            await releaseWrite.promise;
            return route.fulfill({ response });
          }
        }
        return route.continue();
      });

      await page.reload();
      await expect(page.getByTestId("engine-state")).toHaveText("引擎就绪", { timeout: 20_000 });
      await page.setViewportSize({ width: 1500, height: 950 });
      const mail = page.getByRole("button", { name: "邮件", exact: true }).first();
      const tasks = page.getByRole("button", { name: "任务", exact: true }).first();
      await mail.click();
      await page.getByRole("button", { name: "分栏延迟测试邮箱", exact: true }).click();
      const account = page.getByRole("separator", { name: "调整账号栏宽度" });
      const contact = page.getByRole("separator", { name: "调整联系人栏宽度" });
      await expect.poll(() => reads).toBeGreaterThanOrEqual(2);
      await expect(page.getByRole("button", { name: "写信" })).toBeDisabled();
      await account.press("End");
      await contact.press("End");
      await expect(account).toHaveAttribute("aria-valuenow", "440");
      await expect(contact).toHaveAttribute("aria-valuenow", "360");
      expect(writes).toEqual([]);

      releaseAccess.resolve();
      await expect.poll(() => writes).toEqual([{ accountWidth: 440 }]);
      await tasks.click();
      await expect(account).toBeVisible();
      await expect(page.getByTestId("tasks-module")).toHaveCount(0);
      releaseWrite.resolve();
      await expect(page.getByTestId("tasks-module")).toBeVisible();
      expect(writes).toEqual([{ accountWidth: 440 }, { contactWidth: 360 }]);

      releaseRead.resolve();
      await page.unrouteAll({ behavior: "wait" });
      await mail.click();
      await page.getByRole("button", { name: "分栏延迟测试邮箱", exact: true }).click();
      await expect(account).toHaveAttribute("aria-valuenow", "440");
      await expect(contact).toHaveAttribute("aria-valuenow", "360");
    } finally {
      releaseAccess.resolve();
      releaseRead.resolve();
      releaseWrite.resolve();
      await close();
    }
  } finally {
    await imap.close();
  }
});

test("邮件分栏写入失败保留原值供重试，关闭 Vault 等重试和下一笔保存", async () => {
  const imap = await openImapFixture();
  const releaseRetry = Promise.withResolvers<void>();
  try {
    const { page, close, vault } = await openApp();
    try {
      const call = await desktopMailCalls(page);
      await call("mail.sync.setInterval", { minutes: 0 });
      await createDesktopFixtureAccount(call, "pane-retry", "分栏重试测试邮箱", imap.port);
      await page.setViewportSize({ width: 1500, height: 950 });
      await page.getByRole("button", { name: "邮件", exact: true }).first().click();
      await page.getByRole("button", { name: "分栏重试测试邮箱", exact: true }).click();
      await expect(page.getByRole("button", { name: "写信" })).toBeEnabled();
      const account = page.getByRole("separator", { name: "调整账号栏宽度" });
      const contact = page.getByRole("separator", { name: "调整联系人栏宽度" });
      const writes: Array<{ accountWidth?: number; contactWidth?: number }> = [];
      await page.route("**/api/v1/call", async (route) => {
        const { capability, input } = route.request().postDataJSON() as { capability: string; input: { patch?: { mail?: (typeof writes)[number] } } };
        if (capability !== "settings.update" || !input.patch?.mail) return route.continue();
        writes.push(input.patch.mail);
        if (writes.length === 1) return route.fulfill({ status: 200, json: { ok: false, error: { code: "INTERNAL", message: "测试分栏写入失败", retryable: false } } });
        if (writes.length === 2) await releaseRetry.promise;
        return route.continue();
      });

      await account.press("End");
      const retry = page.getByRole("button", { name: "重试保存分栏" });
      await expect(retry).toBeVisible();
      await expect(account).toHaveAttribute("aria-valuenow", "440");
      const requestVaultClose = async () => {
        await page.getByTestId("vault-name").click();
        await page.getByRole("menuitem", { name: "关闭 Vault" }).click();
      };
      const confirm = page.getByTestId("svault-switch-confirm");
      await requestVaultClose();
      await expect(confirm).toBeHidden();
      await retry.click();
      await expect.poll(() => writes).toEqual([{ accountWidth: 440 }, { accountWidth: 440 }]);
      await contact.press("End");
      await requestVaultClose();
      await expect(confirm).toBeHidden();
      expect(writes).toHaveLength(2);

      releaseRetry.resolve();
      await confirm.click();
      await expect(page.getByTestId("vault-launch")).toBeVisible({ timeout: 20_000 });
      expect(writes).toEqual([{ accountWidth: 440 }, { accountWidth: 440 }, { contactWidth: 360 }]);
      expect(JSON.parse(readFileSync(path.join(vault, ".huhu", "settings.json"), "utf8"))).toMatchObject({ mail: { accountWidth: 440, contactWidth: 360 } });
    } finally {
      releaseRetry.resolve();
      await close();
    }
  } finally {
    await imap.close();
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

test("窄屏 Web 工作台流式上传 9 MiB 邮件附件，重开草稿验证哈希并可取消", async () => {
  const edge = process.platform === "win32" ? path.join(process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe") : "";
  const executablePath = [chromium.executablePath(), edge].find((file) => file && existsSync(file));
  if (!executablePath) {
    test.skip(true, "当前环境未安装 Playwright Chromium 或 Microsoft Edge");
    return;
  }
  const { page, vault, close } = await openApp();
  let browser: Browser | undefined;
  const subject = "Web 流附件夹具";
  try {
    const call = await desktopMailCalls(page);
    await call("web.share.start", { mode: "local" });
    const { links } = await call<{ links: string[] }>("web.invitations.create");
    browser = await chromium.launch({ executablePath, headless: true });
    const web = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await web.goto(links[0]!);
    await web.getByRole("button", { name: "邮件", exact: true }).first().click();
    await web.getByRole("button", { name: "写信", exact: true }).click();
    const composer = web.getByRole("form", { name: "写信" });
    await composer.getByLabel("主题").fill(subject);
    const bytes = Buffer.alloc(9 * 1024 * 1024, 0x7a);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const [chooser] = await Promise.all([web.waitForEvent("filechooser"), composer.getByRole("button", { name: "添加附件" }).click()]);
    await chooser.setFiles({ name: "web-fixture.bin", mimeType: "application/octet-stream", buffer: bytes });
    await expect(composer.getByRole("list", { name: "已有附件" })).toContainText("web-fixture.bin");
    await composer.getByRole("button", { name: "关闭写信" }).click();
    await web.getByRole("button", { name: "草稿", exact: true }).click();
    await web.getByRole("button", { name: subject, exact: true }).click();
    await web.getByRole("button", { name: "继续编辑", exact: true }).click();
    await expect(composer.getByRole("list", { name: "已有附件" })).toContainText("web-fixture.bin");
    const stored = readFileSync(path.join(vault, ".huhu", "mail", "attachments", digest));
    expect(stored.length).toBe(bytes.length);
    expect(createHash("sha256").update(stored).digest("hex")).toBe(digest);

    const requested = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    await web.route("**/api/v1/mail/attachments/*", async (route) => {
      requested.resolve();
      await release.promise;
      await route.abort().catch(() => undefined);
    });
    try {
      await composer.locator('input[type="file"]').setInputFiles({ name: "cancelled.txt", mimeType: "text/plain", buffer: Buffer.from("synthetic cancel") });
      await requested.promise;
      await composer.getByRole("button", { name: "取消上传" }).click();
      await expect(composer.getByText("附件上传已取消。", { exact: true })).toBeVisible();
    } finally {
      release.resolve();
    }
    await expect(composer.getByRole("list", { name: "已有附件" })).not.toContainText("cancelled.txt");
  } finally {
    await browser?.close();
    await close();
  }
});

test("邮件阅读按单封放行图片，原文和切换邮件保持默认屏蔽", async () => {
  const currentDate = new Date().toUTCString();
  const subjects = ["合成旧邮件", "合成最新邮件"];
  const messages = subjects.map((subject, index): FixtureImapMessage => ({
    uidValidity: 63,
    uid: index + 1,
    subject,
    source: [
      "From: Sender <sender@example.test>",
      "To: fixture@example.test",
      `Date: ${currentDate}`,
      `Message-ID: <fixture-${index}@example.test>`,
      `Subject: ${subject}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      `<p>${"合成长正文<br>".repeat(100)}</p><blockquote>合成引用</blockquote><img src="https://images.example.invalid/${index}.png" alt="合成外部图片">`,
      "",
    ].join("\r\n"),
  }));
  const imap = await openImapFixture({ windows: { INBOX: { uidValidity: 63, messages } } });
  const { page, close } = await openApp();
  try {
    const call = await desktopMailCalls(page);
    const connection = { host: "127.0.0.1", port: imap.port, security: "none" };
    const { setupId } = await call<{ setupId: string }>("mail.accounts.testConnection", {
      settings: { provider: "custom_imap", email: "fixture@example.test", label: "图片测试", auth: "password", imap: connection, smtpEnabled: false, smtp: connection },
      password: "synthetic-loopback-password",
    });
    const { accountId } = await call<{ accountId: string }>("mail.accounts.save", { setupId, folders: ["INBOX"] });
    await call("mail.sync.refresh", { accountId, folder: "INBOX" });
    let approvals = 0;
    let rendererRequests = 0;
    await page.route("https://images.example.invalid/**", (route) => {
      rendererRequests++;
      return route.abort();
    });
    await page.route("**/api/v1/call", (route) => {
      if (route.request().postDataJSON()?.capability !== "mail.messages.loadRemoteImages") return route.continue();
      approvals++;
      return route.fulfill({
        json: { ok: true, data: { images: [{ url: "https://images.example.invalid/0.png", mediaType: "image/gif", base64: "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" }], failed: 0 } },
      });
    });
    await page.getByRole("button", { name: "邮件", exact: true }).first().click();
    const timeline = page.getByRole("region", { name: "往来邮件", exact: true });
    await expect(timeline.locator("[data-mail-timeline-message]")).toHaveText(subjects);
    await timeline.getByRole("button", { name: subjects[0]! }).click();
    await page.getByRole("region", { name: "邮件阅读", exact: true }).scrollIntoViewIfNeeded();
    const reader = page.getByRole("region", { name: "正文", exact: true });
    await expect(reader).toContainText("合成长正文");
    await page.getByRole("button", { name: "查看原文" }).click();
    await expect(page.locator(".hu-mail-source")).toContainText("https://images.example.invalid/0.png");
    await expect(reader.getByRole("img")).toHaveCount(0);
    expect(approvals).toBe(0);
    await page.getByRole("button", { name: "收起原文" }).click();
    await page.getByRole("button", { name: "加载本封外部图片" }).click();
    await expect(reader.getByRole("img", { name: "合成外部图片" })).toHaveAttribute("src", /^data:image\/gif;/);
    await page.getByRole("button", { name: "返回最新" }).click();
    await page.getByRole("region", { name: "邮件阅读", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "加载本封外部图片" })).toBeVisible();
    await expect(reader.getByRole("img")).toHaveCount(0);
    expect(approvals).toBe(1);
    expect(rendererRequests).toBe(0);
  } finally {
    await close();
    await imap.close();
  }
});
