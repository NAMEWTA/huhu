import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema } from "@huhu/contracts";
import { ModuleCredentials } from "@huhu/kernel";
import { exportPackage } from "@huhu/vault";
import { assert, expect, test as engineTest } from "vitest";
import { boot, type RunningEngine } from "./fixtures/engine.js";
import { accountPasswordPurpose, accountTargets, mailAccountDefinitionSchema } from "../src/engine/account-definition.js";
import { openMailAccounts, type MailAccount } from "../src/engine/accounts.js";
import { mailMessageSourceDescriptor, mailRefreshDescriptor } from "../src/engine/message-cache.js";
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
