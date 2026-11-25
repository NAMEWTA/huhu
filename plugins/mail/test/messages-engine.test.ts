import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema } from "@huhu/contracts";
import { CapabilityRegistry, EventBus, ModuleCredentials, NotificationStore, registerNotificationAndSettings, type CapabilityDefinition, type Context, type HuhuApi } from "@huhu/kernel";
import { exportPackage, Vault } from "@huhu/vault";
import { assert, expect, test as engineTest } from "vitest";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { boot, type RunningEngine } from "./fixtures/engine.js";
import { accountPasswordPurpose, accountTargets, mailAccountDefinitionSchema } from "../src/engine/account-definition.js";
import { openMailAccounts, type MailAccount } from "../src/engine/accounts.js";
import { mailMessageSourceDescriptor, mailRefreshDescriptor } from "../src/engine/message-cache.js";
import { apply } from "../src/engine/registration.js";
import { openImapFixture } from "./fixtures/imap.js";

engineTest("两个邮箱的相同 UID 保持独立，重开及 UIDVALIDITY 换代后仍只读原账号", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-message-native-"));
  const vaultPath = path.join(root, "vault");
  const desktopUserData = path.join(root, "app");
  mkdirSync(vaultPath);
  mkdirSync(desktopUserData);
  const synthA = {
    uidValidity: 12,
    subject: "Alpha",
    source: "Subject: Alpha\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nfirst account =E9=82=AE=E4=BB=B6\r\n",
    seen: false,
    ignoreRead: true,
  };
  const synthB = { uidValidity: 12, subject: "Beta", source: "Subject: Beta\r\n\r\nsecond account fixture\r\n" };
  const imapA = await openImapFixture({ message: synthA });
  const imapB = await openImapFixture({ message: synthB });
  const saved: MailAccount[] = [];
  let engine: RunningEngine | undefined;
  let readOnly: RunningEngine | undefined;

  async function call(running: RunningEngine, capability: string, input: unknown = {}) {
    const id = randomUUID();
    const response = await fetch(`http://127.0.0.1:${running.port}/api/v1/call`, {
      method: "POST",
      headers: { authorization: `Bearer ${running.rendererToken}`, "content-type": "application/json" },
      body: JSON.stringify({ capability, input, requestId: id, idempotencyKey: id }),
    });
    return CapabilityResultSchema.parse(await response.json());
  }

  async function refresh(running: RunningEngine, mailbox: { accountId: string; folder: string }) {
    const reply = await call(running, mailRefreshDescriptor.name, mailbox);
    assert(reply.ok, JSON.stringify(reply));
    const output = mailRefreshDescriptor.output.parse(reply.data);
    assert(output.message);
    return { ...output, message: output.message };
  }
  async function checkSource(running: RunningEngine, { accountId, folder, localMessageId }: { accountId: string; folder: string; localMessageId: string }, expected: string) {
    const reply = await call(running, mailMessageSourceDescriptor.name, { accountId, folder, localMessageId });
    assert(reply.ok);
    const value = mailMessageSourceDescriptor.output.parse(reply.data);
    assert(value.state === "ready");
    expect(Buffer.from(value.source, "base64").toString("utf8")).toBe(expected);
  }

  try {
    engine = await boot({ vaultPath, desktopUserData, create: true });
    assert(engine.moduleCredentialHost);
    const accounts = openMailAccounts({ ...engine.moduleCredentialHost, vault: engine.vault });
    for (const [index, fixture] of [imapA, imapB].entries()) {
      const draft = accounts.begin(
        {
          provider: "custom_imap",
          email: `fixture-${index}@example.test`,
          label: `Fixture ${index}`,
          auth: "password",
          imap: { host: "127.0.0.1", port: fixture.port, security: "none" },
          smtpEnabled: false,
          smtp: { host: "", port: 465, security: "tls" },
        },
        `synthetic-${randomUUID()}`,
      );
      await draft.testConnection();
      saved.push(await draft.save());
    }
    const [a, b] = saved.map(({ accountId }) => ({ accountId, folder: "INBOX" }));
    assert(a && b);
    const accountSummaries = (running: RunningEngine) => call(running, "mail.accounts.list", { includeMailboxSummary: true });
    const first = await refresh(engine, a);
    const other = await refresh(engine, b);
    expect(first.message).toMatchObject({ ...a, uidValidity: "12", uid: 42, subject: "Alpha", transport: "imap" });
    expect(other.message).toMatchObject({ ...b, uidValidity: "12", uid: 42, subject: "Beta", transport: "imap" });
    expect(first.message.localMessageId).not.toBe(other.message.localMessageId);
    await checkSource(engine, first.message, synthA.source);
    await checkSource(engine, other.message, synthB.source);
    const key = (message: typeof first.message) => ({ accountId: message.accountId, folder: message.folder, localMessageId: message.localMessageId });
    const mark = (running: RunningEngine, message: typeof first.message) => call(running, "mail.messages.markRead", key(message));
    expect(await call(engine, "mail.messages.loadBody", key(first.message))).toMatchObject({ ok: true, data: { state: "ready", body: { text: "first account 邮件\r\n", untrustedHtml: null, attachments: [] } } });
    const remoteImageCapability = "mail.messages.loadRemoteImages";
    const approved = { ...key(first.message), sourceDigest: createHash("sha256").update(synthA.source).digest("hex"), view: "mailbox" };
    expect(await call(engine, remoteImageCapability, approved)).toEqual({ ok: true, data: { images: [], failed: 0 } });
    expect(await call(engine, remoteImageCapability, { ...approved, url: "https://synthetic.example.invalid/image" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await call(engine, remoteImageCapability, { ...approved, sourceDigest: "0".repeat(64) })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await call(engine, remoteImageCapability, { ...approved, accountId: b.accountId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(synthA.seen).toBe(false);
    expect(await call(engine, mailMessageSourceDescriptor.name, { ...a, localMessageId: other.message.localMessageId })).toMatchObject({ ok: true, data: { state: "needs-refresh" } });
    const manifest = await exportPackage(vaultPath, path.join(root, "mail.zip"));
    expect(manifest.files.some(({ path: file }) => file.startsWith(".huhu/cache/mail/"))).toBe(false);

    await engine.shutdown();
    engine = await boot({ vaultPath, desktopUserData });
    await checkSource(engine, first.message, synthA.source);
    await checkSource(engine, other.message, synthB.source);
    expect(await accountSummaries(engine)).toMatchObject({
      ok: true,
      data: { accounts: expect.arrayContaining([expect.objectContaining({ accountId: a.accountId, mailbox: { unread: 1, synced: true } })]) },
    });
    const receivedA = imapA.fetchRequests.length;
    const receivedB = imapB.fetchRequests.length;
    readOnly = await boot({ vaultPath, desktopUserData, readOnly: true });
    await checkSource(readOnly, first.message, synthA.source);
    expect(await call(readOnly, mailRefreshDescriptor.name, a)).toMatchObject({ ok: false, error: { code: "READ_ONLY_VAULT" } });
    expect(imapA.fetchRequests).toHaveLength(receivedA);
    expect(imapB.fetchRequests).toHaveLength(receivedB);
    for (const imap of [imapA, imapB]) {
      expect(imap.commands).toContain("EXAMINE");
      expect(imap.commands).not.toContain("SELECT");
      expect(imap.storeRequests).toHaveLength(0);
      expect(imap.fetchRequests.some((line) => /UID FETCH 42 .*BODY\.PEEK\[\]/i.test(line))).toBe(true);
    }
    expect(await mark(readOnly, first.message)).toMatchObject({ ok: false, error: { code: "READ_ONLY_VAULT" } });
    expect(imapA.storeRequests).toHaveLength(0);
    expect(await mark(engine, first.message)).toMatchObject({ ok: true, data: { state: "local" } });
    expect(await accountSummaries(engine)).toMatchObject({
      ok: true,
      data: {
        accounts: expect.arrayContaining([expect.objectContaining({ accountId: a.accountId, mailbox: { unread: 0, synced: true } }), expect.objectContaining({ accountId: b.accountId, mailbox: { unread: 1, synced: true } })]),
      },
    });
    expect(imapA.storeRequests).toHaveLength(1);
    expect(imapA.fetchRequests).toContainEqual(expect.stringMatching(/UID FETCH 42 .*FLAGS/i));
    expect((await refresh(engine, a)).message.readState).toBe("local");
    await engine.shutdown();
    engine = await boot({ vaultPath, desktopUserData });
    expect(await call(engine, "mail.messages.latest", a)).toMatchObject({ ok: true, data: { message: { readState: "local" } } });
    synthA.ignoreRead = false;
    const [, marked] = await Promise.all([refresh(engine, a), mark(engine, first.message)]);
    expect(marked).toMatchObject({ ok: true, data: { state: "synced" } });
    expect(await mark(engine, first.message)).toMatchObject({ ok: true, data: { state: "synced" } });
    expect(imapA.storeRequests).toHaveLength(2);
    expect(synthA.seen).toBe(true);
    synthA.seen = false;
    expect((await refresh(engine, a)).message.readState).toBe("local");

    synthA.uidValidity = 13;
    synthA.source = "Subject: Alpha\r\n\r\ncurrent account generation\r\n";
    expect(await mark(engine, first.message)).toMatchObject({ ok: true, data: { state: "needs-refresh" } });
    expect(imapA.storeRequests).toHaveLength(2);
    const changed = await refresh(engine, a);
    expect(changed).toMatchObject({ mailboxChanged: true, message: { uidValidity: "13", uid: 42, readState: "unread" } });
    expect(changed.message.localMessageId).not.toBe(first.message.localMessageId);
    expect(await call(engine, mailMessageSourceDescriptor.name, { ...a, localMessageId: first.message.localMessageId })).toMatchObject({ ok: true, data: { state: "needs-refresh" } });
    expect(await call(engine, "mail.messages.loadBody", key(first.message))).toMatchObject({ ok: true, data: { state: "needs-refresh" } });
    expect(await call(engine, remoteImageCapability, approved)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    await checkSource(engine, changed.message, synthA.source);
    await checkSource(engine, other.message, synthB.source);
    expect(imapB.fetchRequests).toHaveLength(receivedB);
    expect(imapB.storeRequests).toHaveLength(0);
  } finally {
    try {
      if (engine?.moduleCredentialHost) {
        const credentials = new ModuleCredentials({
          ...engine.moduleCredentialHost,
          vault: engine.vault,
          pluginId: "mail",
          definition: mailAccountDefinitionSchema,
          targets: ({ settings }) => accountTargets(settings),
        });
        for (const { accountId, revision, definition } of saved) {
          await credentials.save({ entityId: accountId, expectedRevision: revision, definition, actions: [{ purpose: accountPasswordPurpose, action: "clear" }] });
        }
      }
    } finally {
      await Promise.all([engine?.shutdown(), readOnly?.shutdown(), imapA.close(), imapB.close()]);
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    }
  }
});

function cacheDigest(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function mailboxCacheFile(accountId: string, folder: string) {
  return `.huhu/cache/mail/${cacheDigest([accountId, folder])}.json`;
}

async function writeMailboxCopy(vault: Vault, accountId: string, folder: string, uid: number, seen: boolean, legacy = false) {
  const internetId = "<copy@example.test>";
  const date = "2026-09-01T10:00:00.000Z";
  const sender = "sender@example.test";
  const source = `From: ${sender}\r\nTo: owner@example.test\r\nMessage-ID: ${internetId}\r\nDate: ${new Date(date).toUTCString()}\r\nSubject: Same message\r\n\r\nDuplicate body\r\n`;
  const uidValidity = "42";
  const record = {
    format: 1,
    uidValidity,
    message: {
      summary: { transport: "imap", accountId, folder, uid, uidValidity, subject: "Same message", readState: seen ? "synced" : "unread", localMessageId: cacheDigest([accountId, folder, uidValidity, uid]) },
      source: Buffer.from(source).toString("base64"),
      ...(!legacy && { publicMail: { participants: [sender, "owner@example.test"], internetId, date } }),
    },
  };
  await vault.files.write(mailboxCacheFile(accountId, folder), Buffer.from(JSON.stringify(record)));
}

async function withMailboxFixture(
  run: (fixture: { vault: Vault; addAccount(email: string, folders: string[]): Promise<{ accountId: string; revision: string }>; call(name: string, input?: unknown): Promise<unknown>; outside: string }) => Promise<void>,
) {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-mailbox-"));
  const vaultPath = path.join(root, "vault");
  const localRoot = path.join(root, "local");
  const protectionRoot = path.join(root, "keys");
  const outside = path.join(root, "outside");
  for (const dir of [vaultPath, localRoot, protectionRoot, outside]) mkdirSync(dir);
  const vault = await Vault.open(vaultPath, { create: true });
  const cleanup: (() => Promise<void>)[] = [];
  try {
    const owner = { vault, localRoot, protection: new TestProtection(protectionRoot), localVaultInstanceId: "mailbox-test-instance" };
    const credentials = new ModuleCredentials({ ...owner, pluginId: "mail", definition: mailAccountDefinitionSchema, targets: ({ settings }) => accountTargets(settings) });
    const bindings = new Map<string, CapabilityDefinition>();
    const api = {
      vault: { files: vault.files, vaultId: vault.id, stateDir: vault.stateDir },
      events: new EventBus(() => vault.id),
      provide: () => {},
      defineCapability: (entry: CapabilityDefinition) => bindings.set(entry.name, entry),
    } as unknown as HuhuApi;
    const context = { effect: (register: () => () => Promise<void>) => cleanup.push(register()) } as unknown as Context;
    await apply(context, api, owner);
    const signal = new AbortController().signal;
    await run({
      vault,
      outside,
      async addAccount(email, folders) {
        const accountId = randomUUID();
        const definition = mailAccountDefinitionSchema.parse({
          format: 1,
          settings: { provider: "custom_imap", email, label: email, auth: "password", imap: { host: "127.0.0.1", port: 1143, security: "none" }, smtpEnabled: false, smtp: { host: "", port: 1025, security: "none" } },
          folders: folders.map((name) => ({ path: name, name, delimiter: "/", specialUse: null, flags: [] })),
        });
        const { revision } = await credentials.save({ entityId: accountId, expectedRevision: null, definition, actions: [{ purpose: accountPasswordPurpose, action: "replace", value: "synthetic-test-password" }] });
        return { accountId, revision };
      },
      async call(name, input = {}) {
        const entry = bindings.get(name);
        assert(entry, name);
        return entry.output.parse(await entry.handler({ caller: "desktop", subject: "mailbox-test", signal, requestId: randomUUID() }, entry.input.parse(input)));
      },
    });
  } finally {
    try {
      await Promise.all(cleanup.map((dispose) => dispose()));
      await vault.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

engineTest.each([{ folders: ["Archive", "Work"] }, { folders: ["Work", "Archive"] }])("普通目录副本的未读计数沿用对话的胜出副本 $folders", async ({ folders }) => {
  await withMailboxFixture(async ({ addAccount, call, vault }) => {
    const { accountId } = await addAccount("owner@example.test", ["INBOX", ...folders]);
    for (const workSeen of [true, false]) {
      await writeMailboxCopy(vault, accountId, "Archive", 1, !workSeen);
      await writeMailboxCopy(vault, accountId, "Work", 2, workSeen, !workSeen);
      const unread = workSeen ? 0 : 1;
      expect(await call("mail.conversations.list", { accountId })).toMatchObject({ conversations: [{ count: 1, unread, latest: { folder: "Work", uid: 2 } }] });
      expect(await call("mail.accounts.list", { includeMailboxSummary: true })).toMatchObject({ accounts: [{ accountId, mailbox: { unread, synced: true } }] });
    }
  });
});

engineTest("一号邮箱的缓存被 Vault 拦截时，两号邮箱仍可列出，健康邮箱可阅读，异常邮箱可改名", async () => {
  await withMailboxFixture(async ({ addAccount, call, vault, outside }) => {
    const bad = await addAccount("bad@example.test", ["INBOX"]);
    const good = await addAccount("owner@example.test", ["INBOX"]);
    await writeMailboxCopy(vault, good.accountId, "INBOX", 1, false);
    const relative = mailboxCacheFile(bad.accountId, "INBOX");
    const target = vault.files.abs(relative);
    symlinkSync(outside, target, "junction");
    expect(() => vault.files.abs(relative)).toThrow(expect.objectContaining({ code: "PATH_OUTSIDE_VAULT" }));
    await expect(call("mail.messages.latest", { accountId: bad.accountId, folder: "INBOX" })).rejects.toMatchObject({ code: "PATH_OUTSIDE_VAULT" });

    const list = () => call("mail.accounts.list", { includeMailboxSummary: true });
    const configured = { "account-password": "configured" };
    expect(await list()).toMatchObject({
      available: true,
      accounts: expect.arrayContaining([
        expect.objectContaining({ ...bad, definition: expect.objectContaining({ settings: expect.objectContaining({ email: "bad@example.test" }) }), authState: configured, mailbox: null }),
        expect.objectContaining({ ...good, authState: configured, mailbox: { unread: 1, synced: true } }),
      ]),
    });
    expect(await call("mail.conversations.list", { accountId: good.accountId })).toMatchObject({ conversations: [{ unread: 1, latest: { subject: "Same message" } }] });
    expect(await call("mail.accounts.rename", { accountId: bad.accountId, expectedRevision: bad.revision, label: "Recovered name" })).toMatchObject({ accountId: bad.accountId });
    rmSync(target);
    await vault.files.write(relative, Buffer.from("{bad JSON"));
    expect(await list()).toMatchObject({
      accounts: expect.arrayContaining([expect.objectContaining({ accountId: bad.accountId, mailbox: null, definition: expect.objectContaining({ settings: expect.objectContaining({ label: "Recovered name" }) }) })]),
    });
    await writeMailboxCopy(vault, bad.accountId, "INBOX", 1, false);
    expect(await list()).toMatchObject({ accounts: expect.arrayContaining([expect.objectContaining({ accountId: bad.accountId, mailbox: { unread: 1, synced: true } })]) });
  });
});

engineTest("邮件分栏经过现有设置能力分别合并，重开读取同一 Vault，其他 Vault 使用默认值", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-widths-"));
  const openSettings = (name: string) => {
    const directory = path.join(root, name);
    const registry = new CapabilityRegistry();
    registerNotificationAndSettings(registry, new NotificationStore(path.join(directory, "notifications.ndjson")), path.join(directory, "settings.json"));
    return async (name: string, input: unknown = {}) => {
      const entry = registry.get(name);
      assert(entry, name);
      return entry.output.parse(await entry.handler({ caller: "desktop", subject: "mailbox-test", signal: new AbortController().signal, requestId: randomUUID() }, entry.input.parse(input)));
    };
  };
  try {
    const first = openSettings("first-vault");
    await first("settings.update", { patch: { appearance: { mode: "dark" }, mail: { accountWidth: 320 } } });
    await first("settings.update", { patch: { mail: { contactWidth: 280 } } });
    expect(await openSettings("first-vault")("settings.get")).toMatchObject({ appearance: { mode: "dark" }, mail: { accountWidth: 320, contactWidth: 280 } });
    expect(await openSettings("second-vault")("settings.get")).toMatchObject({ mail: { accountWidth: 260, contactWidth: 208 } });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
