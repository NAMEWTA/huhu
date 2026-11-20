import { createHash, randomUUID } from "node:crypto";
import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema } from "@huhu/contracts";
import { ModuleCredentials } from "@huhu/kernel";
import { exportPackage, importPackage } from "@huhu/vault";
import { assert, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "./fixtures/engine.js";
import { accountPasswordPurpose, accountTargets, mailAccountDefinitionSchema } from "../src/engine/account-definition.js";
import { mailAttachmentPackagePaths, openMailAccounts, type MailDraftAttachments, type MailOutboxService } from "../src/engine/index.js";
import { outboxReceipt } from "../src/engine/outbox.js";
import { forwardSeed, newTopicSeed } from "../src/engine/prepare-forward.js";
import { replySeed, type ReplySeed } from "../src/engine/prepare-reply.js";
import { openImapFixture } from "./fixtures/imap.js";
import { loopbackSmtp } from "./fixtures/smtp.js";

const shared = vi.hoisted(() => ({ services: new Map<string, { outbox?: MailOutboxService; attachments?: MailDraftAttachments }>() }));
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
            const services = shared.services.get(api.vault.files.root) ?? {};
            if (name === mail.MAIL_OUTBOX_SERVICE) services.outbox = service as MailOutboxService;
            if (name === mail.MAIL_DRAFT_ATTACHMENTS_SERVICE) services.attachments = service as MailDraftAttachments;
            shared.services.set(api.vault.files.root, services);
          },
        },
        owner,
        transport,
      )) satisfies typeof mail.apply,
  };
});

const testWindows = test.skipIf(process.platform !== "win32" || process.arch !== "x64");

const outboxDir = ".huhu/mail/outbox";
const sender = "fixture-sender@example.invalid";
const to = "receiver@example.invalid";
const bcc = "blind@example.invalid";
const content = { to: [to], cc: [] as string[], bcc: [bcc], subject: "frozen fixture", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "frozen body", marks: [{ type: "bold" }] }] }] } };

function credentials(engine: RunningEngine) {
  assert(engine.moduleCredentialHost);
  return new ModuleCredentials({ ...engine.moduleCredentialHost, vault: engine.vault, pluginId: "mail", definition: mailAccountDefinitionSchema, targets: ({ settings }) => accountTargets(settings) });
}

async function fixture(run: (fixture: { root: string; smtp: Awaited<ReturnType<typeof loopbackSmtp>>; password: string; open: (options?: Partial<Parameters<typeof boot>[0]>) => Promise<RunningEngine> }) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-outbox-"));
  const vaultPath = path.join(root, "vault");
  const desktopUserData = path.join(root, "app-data");
  const password = `synthetic-${randomUUID()}`;
  const engines: RunningEngine[] = [];
  const createdKeys: { keyId: string; protection: NonNullable<RunningEngine["moduleCredentialHost"]>["protection"] }[] = [];
  let writer: RunningEngine | undefined;
  try {
    mkdirSync(vaultPath);
    mkdirSync(desktopUserData);
    const smtp = await loopbackSmtp(password);
    try {
      await run({
        root,
        smtp,
        password,
        async open(options) {
          const engine = await boot({ vaultPath, desktopUserData, ...options });
          engines.push(engine);
          if (!engine.vault.readOnly && engine.vault.root === vaultPath) {
            writer = engine;
            const protection = engine.moduleCredentialHost?.protection;
            assert(protection);
            const create = protection.create.bind(protection);
            vi.spyOn(protection, "create").mockImplementation(async (keyId, key) => {
              createdKeys.push({ keyId, protection });
              await create(keyId, key);
            });
          }
          return engine;
        },
      });
    } finally {
      await smtp.close();
    }
  } finally {
    try {
      if (writer) {
        const owner = credentials(writer);
        for (const entry of await owner.list()) await owner.delete(entry.entityId, entry.revision);
        for (const { keyId, protection } of createdKeys) {
          const secret = await protection.read(keyId);
          const removed = secret === null;
          secret?.fill(0);
          expect(removed).toBe(true);
        }
      }
    } finally {
      vi.restoreAllMocks();
      await Promise.all(engines.map((engine) => engine.shutdown()));
      shared.services.clear();
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
      expect(existsSync(root)).toBe(false);
    }
  }
}

function services(engine: RunningEngine) {
  const found = shared.services.get(engine.vault.root);
  assert(found?.outbox && found.attachments);
  return { outbox: found.outbox, attachments: found.attachments };
}

async function account(engine: RunningEngine, port: number, password: string) {
  assert(engine.moduleCredentialHost);
  const accounts = openMailAccounts({ ...engine.moduleCredentialHost, vault: engine.vault }, async () => [{ path: "INBOX", name: "INBOX", delimiter: "/", flags: [], specialUse: null }]);
  const settings = { host: "127.0.0.1", port, security: "none" } as const;
  const draft = accounts.begin({ provider: "custom_imap", email: sender, label: "loopback", auth: "password", imap: settings, smtpEnabled: true, smtp: settings }, password);
  await draft.testConnection();
  return draft.save();
}

async function call(engine: RunningEngine, capability: string, input: unknown, signal?: AbortSignal) {
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${engine.rendererToken}`, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
    signal: signal ?? null,
  });
  expect(response.status).toBe(200);
  return CapabilityResultSchema.parse(await response.json());
}

async function save(engine: RunningEngine, accountId: string, draftId: string = randomUUID(), expectedRevision: string | null = null, overrides: Partial<typeof content> = {}) {
  const result = await call(engine, "mail.drafts.save", { draftId, expectedRevision, draft: { ...content, ...overrides, accountId } });
  assert(result.ok);
  const draft = result.data as { draftId: string; revision: string };
  return { draftId: draft.draftId, expectedRevision: draft.revision };
}

testWindows(
  "本地删除邮箱按 ID 和预览修订执行，停止在途 IMAP/SMTP 并可重启续清理",
  async () => {
    await fixture(async ({ root, smtp, password, open }) => {
      const imapRelease = Promise.withResolvers<void>();
      const smtpRelease = Promise.withResolvers<void>();
      let holdFetch = false;
      const fixtureMessage = (subject: string) => ({ uidValidity: 12, subject, source: `Subject: ${subject}\r\n\r\nlocal removal fixture\r\n` });
      const targetBox = { uidValidity: 12, messages: [{ ...fixtureMessage("target mailbox"), uid: 42 }] };
      const imapA = await openImapFixture({
        windows: { INBOX: targetBox },
        beforeSource: async () => {
          if (holdFetch) await imapRelease.promise;
        },
      });
      const imapB = await openImapFixture({ message: fixtureMessage("same-address mailbox") });
      const vaultPath = path.join(root, "vault");
      const sameAddressPassword = `different-${randomUUID()}`;
      try {
        let engine = await open({ create: true });
        async function config(label: string, imap: number, secret: string) {
          const accountId = randomUUID();
          const saved = await credentials(engine).save({
            entityId: accountId,
            expectedRevision: null,
            definition: {
              format: 1,
              settings: { provider: "custom_imap", email: sender, label, auth: "password", imap: { host: "127.0.0.1", port: imap, security: "none" }, smtpEnabled: true, smtp: { host: "127.0.0.1", port: smtp.port, security: "none" } },
              folders: [{ path: "INBOX", name: "INBOX", delimiter: "/", flags: [], specialUse: null }],
            },
            actions: [{ purpose: accountPasswordPurpose, action: "replace", value: secret }],
          });
          return { accountId, expectedRevision: saved.revision };
        }
        const target = await config("要移除的邮箱", imapA.port, password);
        const sameAddress = await config("保留的同地址邮箱", imapB.port, sameAddressPassword);
        const mailbox = (accountId: string) => ({ accountId, folder: "INBOX" });
        const cachedA = await call(engine, "mail.sync.refresh", mailbox(target.accountId));
        const cachedB = await call(engine, "mail.sync.refresh", mailbox(sameAddress.accountId));
        assert(cachedB.ok);
        expect(cachedA).toMatchObject({ ok: true, data: { message: { subject: "target mailbox" } } });
        expect(cachedB).toMatchObject({ ok: true, data: { message: { subject: "same-address mailbox" } } });
        expect(readdirSync(path.join(vaultPath, ".huhu/cache/mail"))).toHaveLength(2);
        let acceptedDraft = await save(engine, target.accountId);
        const notDeliveredDraft = await save(engine, target.accountId);
        const activeDraft = await save(engine, target.accountId);
        let keepDraft = await save(engine, sameAddress.accountId);
        const { attachments } = services(engine);
        async function attach(input: typeof keepDraft, name: string, value: string) {
          const bytes = Buffer.from(value);
          const { draft } = await attachments.addAttachment(input, {
            name,
            size: bytes.length,
            async *read() {
              yield bytes;
            },
          });
          return { draftId: draft.draftId, expectedRevision: draft.revision };
        }
        acceptedDraft = await attach(acceptedDraft, "shared.txt", "shared bytes");
        acceptedDraft = await attach(acceptedDraft, "target.txt", "target bytes");
        keepDraft = await attach(keepDraft, "shared-copy.txt", "shared bytes");
        const hash = (value: string) => createHash("sha256").update(value).digest("hex");
        const objects = (value: string) => path.join(vaultPath, `.huhu/mail/attachments/${hash(value)}`);
        const journal = `.huhu/mail/removed-accounts/${target.accountId}.json`;

        async function preview(input = target) {
          const result = await call(engine, "mail.accounts.previewRemoval", input);
          assert(result.ok, result.ok ? undefined : result.error.message);
          return result.data as { accountId: string; expectedRevision: string; impactKey: string; pending: boolean; impact: Record<string, number | boolean> };
        }
        const remove = ({ accountId, expectedRevision, impactKey }: Awaited<ReturnType<typeof preview>>) => call(engine, "mail.accounts.remove", { accountId, expectedRevision, impactKey });
        async function submit(input: typeof keepDraft) {
          const result = await call(engine, "mail.outbox.submit", input);
          assert(result.ok, result.ok ? undefined : result.error.message);
          return outboxReceipt.parse(result.data);
        }
        const status = (operationId: string) => call(engine, "mail.outbox.status", { operationId });

        const beforeCancel = await preview();
        expect(beforeCancel.impact).toEqual({ drafts: 3, attachments: 2, sharedAttachments: 1, cache: 1, history: 0, retained: 0, sending: 0, credentials: true });
        expect(await preview()).toEqual(beforeCancel);
        expect(existsSync(path.join(vaultPath, journal))).toBe(false);
        expect(await remove({ ...beforeCancel, ...sameAddress })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
        const renamed = await call(engine, "mail.accounts.rename", { ...target, label: "确认目标" });
        assert(renamed.ok);
        expect(await remove(beforeCancel)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
        target.expectedRevision = (renamed.data as { revision: string }).revision;
        const beforeEdit = await preview();
        acceptedDraft = await save(engine, target.accountId, acceptedDraft.draftId, acceptedDraft.expectedRevision, { subject: "private subject" });
        expect(await remove(beforeEdit)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
        expect(existsSync(path.join(vaultPath, journal))).toBe(false);
        const beforeSharedChange = await preview();
        const detached = await attachments.removeAttachment({ ...keepDraft, digest: hash("shared bytes") });
        expect(await remove(beforeSharedChange)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
        expect((await preview()).impact.sharedAttachments).toBe(0);
        keepDraft = await attach({ draftId: detached.draftId, expectedRevision: detached.revision }, "shared-copy.txt", "shared bytes");

        const accepted = await submit(acceptedDraft);
        await expect.poll(() => status(accepted.operationId)).toMatchObject({ ok: true, data: { state: "accepted" } });
        smtp.configure("reject-rcpt");
        const notDelivered = await submit(notDeliveredDraft);
        await expect.poll(() => status(notDelivered.operationId)).toMatchObject({ ok: true, data: { state: "not-delivered" } });
        smtp.configure("accept", async () => smtpRelease.promise);
        const active = await submit(activeDraft);
        await expect.poll(() => smtp.messages.length).toBe(2);
        const repair = await call(engine, "mail.accounts.testConnection", { ...target, password });
        assert(repair.ok);
        const fetches = imapA.fetchRequests.length;
        holdFetch = true;
        targetBox.messages.push({ ...fixtureMessage("arrival before removal"), uid: 43 });
        const refreshing = call(engine, "mail.sync.refresh", mailbox(target.accountId));
        await expect.poll(() => imapA.fetchRequests.length).toBeGreaterThan(fetches + 1);
        const snapshots = await preview();
        expect(snapshots.impact).toEqual({ drafts: 3, attachments: 2, sharedAttachments: 1, cache: 1, history: 3, retained: 2, sending: 1, credentials: true });
        expect(await engine.dispatcher.call("web:fixture", { capability: "mail.accounts.previewRemoval", input: target, requestId: randomUUID() })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });

        const write = engine.vault.files.write.bind(engine.vault.files);
        const beforeCommit = vi.spyOn(engine.vault.files, "write").mockImplementation(async (...args) => {
          if (args[0] === journal) throw new Error("fixture journal write failed");
          return write(...args);
        });
        expect(await remove(snapshots)).toMatchObject({ ok: false });
        beforeCommit.mockRestore();
        expect(existsSync(path.join(vaultPath, journal))).toBe(false);
        expect(await status(active.operationId)).toMatchObject({ ok: true, data: { state: "sending" } });

        const deferred = vi.spyOn(engine.vault.files, "write").mockImplementation(async (...args) => {
          if (args[0].startsWith(".huhu/module-credentials/")) throw new Error("fixture credential publication failed");
          return write(...args);
        });
        expect(await remove(snapshots)).toMatchObject({ ok: true, data: { state: "pending" } });
        deferred.mockRestore();
        expect(await refreshing).toMatchObject({ ok: false });
        imapRelease.resolve();
        smtpRelease.resolve();
        expect(await call(engine, "mail.accounts.save", { setupId: (repair.data as { setupId: string }).setupId })).toMatchObject({ ok: false });
        expect(await call(engine, "mail.accounts.list", {})).toMatchObject({ ok: true, data: { accounts: [{ accountId: sameAddress.accountId }], pendingRemovals: [target] } });
        expect(await call(engine, "mail.messages.latest", mailbox(target.accountId))).toEqual({ ok: true, data: { message: null } });
        expect(await call(engine, "mail.messages.latest", mailbox(sameAddress.accountId))).toEqual({ ok: true, data: { message: (cachedB.data as { message: unknown }).message } });
        expect(readdirSync(path.join(vaultPath, ".huhu/cache/mail"))).toHaveLength(1);
        expect(await call(engine, "mail.drafts.get", { draftId: acceptedDraft.draftId })).toEqual({ ok: true, data: { draft: null } });
        expect(await call(engine, "mail.drafts.save", { draftId: acceptedDraft.draftId, expectedRevision: null, draft: { ...content, accountId: sameAddress.accountId } })).toMatchObject({ ok: false });
        expect(await call(engine, "mail.drafts.save", { draftId: randomUUID(), expectedRevision: null, draft: { ...content, accountId: target.accountId } })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
        expect(await call(engine, "mail.drafts.get", { draftId: keepDraft.draftId })).toMatchObject({ ok: true, data: { draft: { accountId: sameAddress.accountId, revision: keepDraft.expectedRevision } } });
        expect(existsSync(objects("target bytes"))).toBe(false);
        expect(readFileSync(objects("shared bytes"), "utf8")).toBe("shared bytes");
        expect(await status(notDelivered.operationId)).toEqual({ ok: true, data: null });
        expect(await status(accepted.operationId)).toMatchObject({ ok: true, data: { ...accepted, state: "accepted", retained: true, retryableRecipients: [] } });
        expect(await status(active.operationId)).toMatchObject({ ok: true, data: { ...active, state: "unknown", retained: true, retryableRecipients: [] } });
        const history = readFileSync(path.join(vaultPath, outboxDir, `${accepted.operationId}.json`), "utf8");
        expect(history).not.toContain("private subject");
        expect(history).not.toContain("target.txt");
        expect(history).not.toContain('smtp":{');
        expect(smtp.counts).toMatchObject({ connections: 3, data: 2 });
        const remoteCalls = [imapA.commands.length, imapB.commands.length, smtp.counts.connections, smtp.counts.data];

        await engine.shutdown();
        engine = await open();
        const resumed = await preview();
        expect(resumed).toMatchObject({ pending: true, impactKey: snapshots.impactKey });
        expect(await call(engine, "mail.sync.refresh", mailbox(target.accountId))).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
        expect(await remove(resumed)).toMatchObject({ ok: true, data: { state: "removed" } });
        expect(await remove(resumed)).toMatchObject({ ok: true, data: { state: "removed" } });
        expect((await credentials(engine).list()).map(({ entityId }) => entityId)).toEqual([sameAddress.accountId]);
        await credentials(engine).use(sameAddress.accountId, [accountPasswordPurpose], async (_, values) => expect(values.get(accountPasswordPurpose)).toBe(sameAddressPassword));
        expect(JSON.parse(readFileSync(path.join(vaultPath, journal), "utf8"))).toEqual({ accountId: target.accountId, expectedRevision: target.expectedRevision, impactKey: snapshots.impactKey, state: "removed" });
        expect(await status(accepted.operationId)).toMatchObject({ ok: true, data: { state: "accepted", retained: true } });
        expect(await status(active.operationId)).toMatchObject({ ok: true, data: { state: "unknown", retained: true } });
        expect(await call(engine, "mail.outbox.retry", { parentOperationId: active.operationId, expectedRevision: activeDraft.expectedRevision, recipients: [to] })).toMatchObject({ ok: false });
        expect([imapA.commands.length, imapB.commands.length, smtp.counts.connections, smtp.counts.data]).toEqual(remoteCalls);
        for (const imap of [imapA, imapB]) expect(imap.commands).not.toContain("DELETE");
      } finally {
        imapRelease.resolve();
        smtpRelease.resolve();
        await Promise.all([imapA.close(), imapB.close()]);
      }
    });
  },
  90_000,
);

testWindows(
  "真实 IMAP 转发只发送纳入草稿的字节，新话题换账号且不沿用线程",
  async () => {
    await fixture(async ({ smtp, password, open }) => {
      const author = "author@example.invalid";
      const second = "other-sender@example.invalid";
      const publicCc = "public@example.invalid";
      const blind = "historical-bcc@example.invalid";
      const originalId = "<origin-forward@example.invalid>";
      const actual = Buffer.from([0, 1, 2, 100, 254, 255]);
      const mime = (namesOnly: boolean) =>
        [
          `From: Original <${author}>`,
          `Reply-To: reply-only@example.invalid`,
          `To: ${sender}, ${second}, ${publicCc}`,
          `Cc: ${author.toUpperCase()}, ${publicCc.toUpperCase()}`,
          `Bcc: ${blind}`,
          `Message-ID: ${originalId}`,
          "In-Reply-To: <prior@example.invalid>",
          "References: <old@example.invalid> <prior@example.invalid>",
          "MIME-Version: 1.0",
          'Content-Type: multipart/mixed; boundary="forward-fixture"',
          "",
          "--forward-fixture",
          "Content-Type: text/html; charset=utf-8",
          "",
          '<p>Original message</p><img src="https://mail-resource.invalid/pixel">',
          ...(!namesOnly
            ? ["--forward-fixture", 'Content-Type: application/octet-stream; name="actual.bin"', 'Content-Disposition: attachment; filename="actual.bin"', "Content-Transfer-Encoding: base64", "", actual.toString("base64")]
            : []),
          "--forward-fixture",
          `Content-Type: application/octet-stream; name="${namesOnly ? "other-only.bin" : "missing.bin"}"`,
          `Content-Disposition: attachment; filename="${namesOnly ? "other-only.bin" : "missing.bin"}"`,
          "",
          ...(!namesOnly
            ? [
                "--forward-fixture",
                'Content-Type: image/png; name="inline.png"',
                "Content-ID: <picture@example.invalid>",
                "Content-Transfer-Encoding: base64",
                "",
                "aW5saW5lLWJ5dGVz",
                "--forward-fixture",
                'Content-Type: message/external-body; access-type=URL; URL="https://mail-resource.invalid/external"',
                'Content-Disposition: attachment; filename="external.bin"',
                "",
                "Content-Type: application/octet-stream",
                "",
                "https://mail-resource.invalid/external",
              ]
            : []),
          "--forward-fixture--",
          "",
        ].join("\r\n");
      const originalSource = mime(false);
      const incoming = { uidValidity: 21, subject: "Forward fixture", source: originalSource };
      const imap = await openImapFixture({ message: incoming });
      const other = await openImapFixture({ message: { uidValidity: 21, subject: "Names only", source: mime(true) } });
      try {
        let engine = await open({ create: true });
        async function add(email: string, port: number) {
          const tested = await call(engine, "mail.accounts.testConnection", {
            settings: { provider: "custom_imap", email, label: "", auth: "password", imap: { host: "127.0.0.1", port, security: "none" }, smtpEnabled: true, smtp: { host: "127.0.0.1", port: smtp.port, security: "none" } },
            password,
          });
          assert(tested.ok);
          const saved = await call(engine, "mail.accounts.save", { setupId: (tested.data as { setupId: string }).setupId, folders: ["INBOX"] });
          assert(saved.ok);
          const accountId = (saved.data as { accountId: string }).accountId;
          const fetched = await call(engine, "mail.sync.refresh", { accountId, folder: "INBOX" });
          assert(fetched.ok);
          return { accountId, folder: "INBOX", localMessageId: (fetched.data as { message: { localMessageId: string } }).message.localMessageId };
        }
        const a = await add(sender, imap.port);
        const b = await add(second, other.port);
        const fetchCounts = [imap.fetchRequests.length, other.fetchRequests.length];
        for (const capability of ["mail.messages.prepareForward", "mail.messages.prepareNewTopic"]) {
          expect(await call(engine, capability, { ...a, accountId: b.accountId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
        }
        async function prepare(identity: typeof a) {
          const reply = await call(engine, "mail.messages.prepareForward", identity);
          assert(reply.ok, reply.ok ? undefined : reply.error.message);
          return forwardSeed.parse(reply.data);
        }
        const seed = await prepare(a);
        const onlyNames = await prepare(b);
        expect(seed).toMatchObject({
          accountId: a.accountId,
          subject: "转发：Forward fixture",
          forward: {
            ...a,
            from: author,
            sourceAttachments: [
              { name: "actual.bin", available: true },
              { name: "missing.bin", available: false },
              { name: "inline.png", available: false },
              { name: "external.bin", available: false },
            ],
          },
        });
        expect(onlyNames.forward.sourceAttachments).toEqual([{ name: "other-only.bin", available: false }]);
        expect(JSON.stringify(seed)).not.toContain(blind);
        const topic = await call(engine, "mail.messages.prepareNewTopic", a);
        assert(topic.ok);
        expect(newTopicSeed.parse(topic.data)).toEqual({ accountId: a.accountId, to: [author, publicCc] });
        expect([imap.fetchRequests.length, other.fetchRequests.length]).toEqual(fetchCounts);
        expect(await call(engine, "mail.drafts.list", {})).toEqual({ ok: true, data: { drafts: [] } });
        expect(smtp.counts.data).toBe(0);

        const draftId = randomUUID();
        const forwarded = { ...content, ...seed, to: [to], cc: [], bcc: [] };
        const saveForward = (draft: typeof forwarded, expectedRevision: string | null = null, id = draftId) => call(engine, "mail.drafts.save", { draftId: id, expectedRevision, draft });
        const forged = { ...forwarded, forward: { ...seed.forward, accountId: b.accountId } };
        expect(await saveForward(forged)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
        incoming.source = originalSource.replace("Original message", "Replaced message with same UID");
        expect(await call(engine, "mail.sync.refresh", { accountId: a.accountId, folder: "INBOX" })).toMatchObject({ ok: true, data: { message: { localMessageId: a.localMessageId } } });
        expect(await saveForward(forwarded)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
        incoming.source = originalSource;
        await call(engine, "mail.sync.refresh", { accountId: a.accountId, folder: "INBOX" });

        const saved = await saveForward(forwarded);
        assert(saved.ok, saved.ok ? undefined : saved.error.message);
        const savedDraft = saved.data as { revision: string; attachments: { digest: string; name: string; state: string }[] };
        expect(savedDraft.attachments).toEqual([{ digest: createHash("sha256").update(actual).digest("hex"), name: "actual.bin", size: actual.length, state: "ready" }]);
        const namesId = randomUUID();
        const savedNames = await saveForward({ ...forwarded, ...onlyNames }, null, namesId);
        assert(savedNames.ok);
        const namesDraft = savedNames.data as { revision: string; attachments?: unknown };
        expect(namesDraft.attachments).toBeUndefined();
        const submit = (id: string, revision: string) => call(engine, "mail.outbox.submit", { draftId: id, expectedRevision: revision });
        for (const [id, revision] of [
          [draftId, savedDraft.revision],
          [namesId, namesDraft.revision],
        ] as const) {
          expect(await submit(id, revision)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
        }
        expect(smtp.counts.data).toBe(0);

        await engine.shutdown();
        engine = await open();
        expect(await call(engine, "mail.drafts.get", { draftId })).toEqual({ ok: true, data: { draft: saved.data } });
        expect(await call(engine, "mail.drafts.get", { draftId: namesId })).toEqual({ ok: true, data: { draft: savedNames.data } });
        expect(services(engine).attachments.readAttachment({ draftId, digest: savedDraft.attachments[0]!.digest })).toMatchObject({ state: "ready", bytes: actual });
        expect(await saveForward({ ...forwarded, ...onlyNames }, savedDraft.revision)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
        const skip = await saveForward({ ...forwarded, forward: { ...seed.forward, omitted: [1, 2, 3] } }, savedDraft.revision);
        assert(skip.ok);
        const accepted = await submit(draftId, (skip.data as { revision: string }).revision);
        assert(accepted.ok);
        await expect.poll(() => smtp.messages.length).toBe(1);
        expect(smtp.messages[0]).toMatchObject({ sender, recipients: [to] });
        const wire = smtp.messages[0]!.wire;
        expect(wire).toContain("actual.bin");
        expect(wire).toContain(actual.toString("base64"));
        expect(wire).not.toMatch(/missing\.bin|other-only\.bin|inline\.png|external\.bin|mail-resource\.invalid|historical-bcc|^In-Reply-To:|^References:|^Reply-To:/im);

        const fresh = await save(engine, b.accountId, randomUUID(), null, { subject: "Independent topic", to: [author, publicCc], bcc: [] });
        expect(await submit(fresh.draftId, fresh.expectedRevision)).toMatchObject({ ok: true });
        await expect.poll(() => smtp.messages.length).toBe(2);
        expect(smtp.messages[1]).toMatchObject({ sender: second, recipients: [author, publicCc] });
        expect(smtp.messages[1]!.wire).toContain("Subject: Independent topic");
        expect(smtp.messages[1]!.wire).not.toMatch(/historical-bcc|^In-Reply-To:|^References:|^Reply-To:|multipart\/mixed|actual\.bin/im);
        const replacement = Buffer.from([5, 0, 244, 7, 82]);
        const supplemented = await services(engine).attachments.addAttachment(
          { draftId: namesId, expectedRevision: namesDraft.revision },
          {
            name: "other-only.bin",
            size: replacement.length,
            async *read() {
              yield replacement;
            },
          },
        );
        expect(await submit(namesId, supplemented.draft.revision)).toMatchObject({ ok: true });
        await expect.poll(() => smtp.messages.length).toBe(3);
        expect(smtp.messages[2]).toMatchObject({ sender: second, recipients: [to] });
        expect(smtp.messages[2]!.wire).toContain("other-only.bin");
        expect(smtp.messages[2]!.wire).toContain(replacement.toString("base64"));
        expect(smtp.messages[2]!.wire).not.toMatch(/actual\.bin|historical-bcc|^In-Reply-To:|^References:|^Reply-To:/im);
        expect([imap.commands.includes("DELETE"), other.commands.includes("DELETE")]).toEqual([false, false]);
      } finally {
        await Promise.all([imap.close(), other.close()]);
      }
    });
  },
  90_000,
);

testWindows(
  "真实 IMAP 回复保留来源、草稿和 SMTP 线程头，拒收重试沿用原信",
  async () => {
    await fixture(async ({ root, smtp, password, open }) => {
      const other = "own-alias@example.invalid";
      const replyTo = "routing@example.invalid";
      const refused = "refused@example.invalid";
      const participant = "team@example.invalid";
      const blind = "hidden@example.invalid";
      const sourceId = "<incoming.42@example.invalid>";
      const chain = ["<root@example.invalid>", "<previous@example.invalid>", sourceId];
      const source = [
        'From: "Original, Author" <original@example.invalid>',
        `Reply-To: Team Routing <${replyTo}>`,
        `To: <${sender.toUpperCase()}>, <${other}>, Team: <${participant}>;`,
        `Cc: <${participant.toUpperCase()}>, <${refused}>, <${replyTo}>`,
        `Bcc: <${blind}>`,
        `Message-ID: ${sourceId}`,
        "In-Reply-To: <another@example.invalid>",
        "References: <root@example.invalid>",
        " <previous@example.invalid> <root@example.invalid>",
        "Subject: Thread fixture",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Original message text",
        "",
      ].join("\r\n");
      const imapA = await openImapFixture({ message: { uidValidity: 12, subject: "Thread fixture", source } });
      const imapB = await openImapFixture({ message: { uidValidity: 12, subject: "Receive only", source: "From: origin@example.invalid\r\nSubject: Receive only\r\n\r\nReceived fixture\r\n" } });
      try {
        let engine = await open({ create: true });
        async function add(email: string, port: number, smtpEnabled: boolean) {
          const tested = await call(engine, "mail.accounts.testConnection", {
            settings: {
              provider: "custom_imap",
              email,
              label: "",
              auth: "password",
              imap: { host: "127.0.0.1", port, security: "none" },
              smtpEnabled,
              smtp: { host: "127.0.0.1", port: smtp.port, security: "none" },
            },
            password,
          });
          assert(tested.ok);
          const saved = await call(engine, "mail.accounts.save", { setupId: (tested.data as { setupId: string }).setupId, folders: ["INBOX"] });
          assert(saved.ok);
          const accountId = (saved.data as { accountId: string }).accountId;
          const result = await call(engine, "mail.sync.refresh", { accountId, folder: "INBOX" });
          assert(result.ok);
          return { accountId, folder: "INBOX", localMessageId: (result.data as { message: { localMessageId: string } }).message.localMessageId };
        }
        async function reply(identity: Awaited<ReturnType<typeof add>>, mode: ReplySeed["reply"]["mode"]) {
          const result = await call(engine, "mail.messages.prepareReply", { ...identity, mode });
          assert(result.ok, result.ok ? undefined : result.error.message);
          return replySeed.parse(result.data);
        }

        const from = await add(sender, imapA.port, true);
        const receiveOnly = await add(other, imapB.port, false);
        const cross = await call(engine, "mail.messages.prepareReply", { ...from, accountId: receiveOnly.accountId, mode: "reply-all" });
        expect(cross).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
        expect(await reply(from, "reply")).toMatchObject({ accountId: from.accountId, to: [replyTo], cc: [], reply: { inReplyTo: sourceId } });
        const seed = await reply(from, "reply-all");
        expect(seed).toEqual({ accountId: from.accountId, to: [replyTo], cc: [participant, refused], subject: "Re: Thread fixture", reply: { ...from, subject: "Thread fixture", mode: "reply-all", inReplyTo: sourceId, references: chain } });
        expect(JSON.stringify(seed)).not.toContain(blind);
        expect(existsSync(path.join(root, "vault", ".huhu/mail/drafts.json"))).toBe(false);
        expect(smtp.counts).toMatchObject({ connections: 0, data: 0 });

        const toDraft = (prepared: ReplySeed) => ({
          ...prepared,
          bcc: [],
          body: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Reply text" }] },
              { type: "paragraph", content: [{ type: "text", text: "> Original message text" }] },
            ],
          },
        });
        const draftId = randomUUID();
        const writing = { draftId, expectedRevision: null, draft: toDraft(seed) };
        const stored = await call(engine, "mail.drafts.save", writing);
        assert(stored.ok);
        const revision = (stored.data as { revision: string }).revision;
        const edited = { ...writing.draft, subject: "Re: Edited thread" };
        const write = engine.vault.files.write.bind(engine.vault.files);
        const fail = vi.spyOn(engine.vault.files, "write").mockImplementation(async (...args) => {
          if (args[0] === ".huhu/mail/drafts.json") throw new Error("synthetic write failure");
          return write(...args);
        });
        try {
          expect(await call(engine, "mail.drafts.save", { draftId, expectedRevision: revision, draft: edited })).toMatchObject({ ok: false, error: { details: { reason: "draft-write-failed" } } });
        } finally {
          fail.mockRestore();
        }
        expect(await call(engine, "mail.drafts.get", { draftId })).toMatchObject({ ok: true, data: { draft: { ...writing.draft, revision } } });
        expect(smtp.counts.data).toBe(0);

        await engine.shutdown();
        engine = await open();
        expect(await call(engine, "mail.drafts.get", { draftId })).toMatchObject({ ok: true, data: { draft: { ...writing.draft, revision } } });
        expect(await call(engine, "mail.drafts.save", { draftId, expectedRevision: revision, draft: { ...edited, accountId: receiveOnly.accountId } })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
        const continued = await call(engine, "mail.drafts.save", { draftId, expectedRevision: revision, draft: edited });
        assert(continued.ok);
        const finalRevision = (continued.data as { revision: string }).revision;
        const receiverDraft = toDraft(await reply(receiveOnly, "reply"));
        expect(receiverDraft.reply.inReplyTo).toBeUndefined();
        const localId = randomUUID();
        const local = await call(engine, "mail.drafts.save", { draftId: localId, expectedRevision: null, draft: receiverDraft });
        assert(local.ok);
        expect(await call(engine, "mail.outbox.submit", { draftId: localId, expectedRevision: (local.data as { revision: string }).revision })).toMatchObject({ ok: false, error: { details: { reason: "sender-not-available" } } });
        expect(smtp.counts.connections).toBe(0);

        smtp.configure("partial");
        const submitted = await call(engine, "mail.outbox.submit", { draftId, expectedRevision: finalRevision });
        assert(submitted.ok);
        const first = outboxReceipt.parse(submitted.data);
        await expect.poll(() => call(engine, "mail.outbox.status", { operationId: first.operationId })).toMatchObject({ ok: true, data: { state: "partially-accepted", retryableRecipients: [refused] } });
        smtp.configure("accept");
        const retried = await call(engine, "mail.outbox.retry", { parentOperationId: first.operationId, expectedRevision: finalRevision, recipients: [refused] });
        assert(retried.ok);
        const second = outboxReceipt.parse(retried.data);
        await expect.poll(() => call(engine, "mail.outbox.status", { operationId: second.operationId })).toMatchObject({ ok: true, data: { state: "accepted", retry: { parentOperationId: first.operationId } } });
        expect(smtp.messages.map(({ sender: envelopeSender, recipients }) => [envelopeSender, recipients])).toEqual([
          [sender, [replyTo, participant]],
          [sender, [refused]],
        ]);
        for (const { wire } of smtp.messages) {
          const headers = wire.split("\r\n\r\n")[0]?.replace(/\r\n[ \t]+/g, " ");
          expect(headers).toContain(`In-Reply-To: ${sourceId}`);
          expect(headers).toContain(`References: ${chain.join(" ")}`);
          expect(headers).not.toMatch(/^Bcc:/im);
          expect(wire).not.toContain(blind);
          expect(wire).toContain("> Original message text");
        }
        expect(first.messageId).not.toBe(second.messageId);
        expect(first.messageId).not.toBe(sourceId);
        expect(smtp.counts.data).toBe(2);
      } finally {
        await Promise.all([imapA.close(), imapB.close()]);
      }
    });
  },
  45_000,
);

testWindows(
  "工作台能力使用回环 IMAP 添加邮箱，重开草稿后只重试拒收项并保留待核实记录",
  async () => {
    await fixture(async ({ smtp, password, open }) => {
      const imap = await openImapFixture();
      const rejectedImap = await openImapFixture({ rejectLogin: true });
      const stalledImap = await openImapFixture({ stallList: true });
      try {
        let engine = await open({ create: true });
        const settings = {
          provider: "custom_imap",
          email: sender,
          label: "工作台回环",
          auth: "password",
          imap: { host: "127.0.0.1", port: imap.port, security: "none" },
          smtpEnabled: true,
          smtp: { host: "127.0.0.1", port: smtp.port, security: "none" },
        };
        const testConnection = (port: number, signal?: AbortSignal) => call(engine, "mail.accounts.testConnection", { settings: { ...settings, imap: { ...settings.imap, port } }, password }, signal);
        expect(await testConnection(rejectedImap.port)).toMatchObject({ ok: false, error: { details: { reason: "authentication" } } });
        const abort = new AbortController();
        const stalled = testConnection(stalledImap.port, abort.signal);
        const stalledRejection = expect(stalled).rejects.toMatchObject({ name: "AbortError" });
        await stalledImap.listed;
        abort.abort();
        await stalledRejection;
        await stalledImap.disconnected;
        expect(await call(engine, "mail.accounts.list", {})).toMatchObject({ ok: true, data: { accounts: [] } });

        const old = await testConnection(imap.port);
        assert(old.ok);
        const oldKey = { setupId: (old.data as { setupId: string }).setupId };
        expect(await call(engine, "mail.accounts.cancelSetup", oldKey)).toMatchObject({ ok: true });
        expect(await call(engine, "mail.accounts.save", { ...oldKey, folders: ["INBOX"] })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
        const tested = await testConnection(imap.port);
        expect(tested).toMatchObject({
          ok: true,
          data: { folders: expect.arrayContaining([expect.objectContaining({ path: "INBOX", selectable: true, selected: true }), expect.objectContaining({ path: "Container", selectable: false })]) },
        });
        assert(tested.ok);
        expect(JSON.stringify(tested.data).includes(password)).toBe(false);
        const key = { setupId: (tested.data as { setupId: string }).setupId };
        expect(await call(engine, "mail.accounts.save", { ...key, folders: ["Container/Projects"] })).toMatchObject({ ok: false, error: { details: { reason: "inbox-required" } } });
        expect(await call(engine, "mail.accounts.save", { ...key, folders: ["INBOX", "Container"] })).toMatchObject({ ok: false, error: { details: { reason: "invalid-selection" } } });
        const saved = await call(engine, "mail.accounts.save", { ...key, folders: ["INBOX", "Container/Projects"] });
        assert(saved.ok);
        expect(await call(engine, "mail.accounts.save", { ...key, folders: ["Container/Projects", "INBOX"] })).toEqual(saved);
        const { accountId } = saved.data as { accountId: string };
        expect(imap.commands.filter((command) => command === "LOGIN")).toHaveLength(2);

        const refused = "refused@example.invalid";
        const draft = await save(engine, accountId, undefined, null, { cc: [refused] });
        await engine.shutdown();
        engine = await open();
        expect(await call(engine, "mail.accounts.list", {})).toMatchObject({ ok: true, data: { accounts: [{ accountId, definition: { settings, folders: [{ path: "INBOX" }, { path: "Container/Projects" }] } }] } });
        expect(await call(engine, "mail.drafts.get", { draftId: draft.draftId })).toMatchObject({ ok: true, data: { draft: { ...content, cc: [refused], revision: draft.expectedRevision } } });
        expect(smtp.counts.data).toBe(0);

        smtp.configure("partial");
        const result = await call(engine, "mail.outbox.submit", draft);
        assert(result.ok);
        const parent = outboxReceipt.parse(result.data);
        const status = (operationId: string) => call(engine, "mail.outbox.status", { operationId });
        await expect.poll(() => status(parent.operationId)).toMatchObject({ ok: true, data: { state: "partially-accepted", retryableRecipients: [refused] } });
        expect(await call(engine, "mail.outbox.retry", { parentOperationId: parent.operationId, expectedRevision: draft.expectedRevision, recipients: [to, refused] })).toMatchObject({
          ok: false,
          error: { details: { reason: "retry-recipient-ineligible" } },
        });
        smtp.configure("lose-reply");
        const retry = await call(engine, "mail.outbox.retry", { parentOperationId: parent.operationId, expectedRevision: draft.expectedRevision, recipients: [refused] });
        assert(retry.ok);
        const child = outboxReceipt.parse(retry.data);
        await expect.poll(() => status(child.operationId)).toMatchObject({ ok: true, data: { state: "unknown", retryableRecipients: [], recipients: [{ address: refused, state: "unknown" }] } });
        expect(smtp.messages.map(({ recipients }) => recipients)).toEqual([[to, bcc], [refused]]);
        await engine.shutdown();
        engine = await open();
        expect(await status(child.operationId)).toMatchObject({ ok: true, data: { state: "unknown", messageId: child.messageId, retryableRecipients: [] } });
        expect(smtp.counts.data).toBe(2);
      } finally {
        await Promise.all([imap.close(), rejectedImap.close(), stalledImap.close()]);
      }
    });
  },
  45_000,
);

testWindows(
  "Windows Engine 对两个来路只认领一次，冻结内容、密送信封和附件后只发一次 DATA",
  async () => {
    await fixture(async ({ root, smtp, password, open }) => {
      let engine = await open({ create: true });
      const { outbox, attachments } = services(engine);
      const { accountId } = await account(engine, smtp.port, password);
      const draft = await save(engine, accountId);
      const bytes = Buffer.from([0, 160, 234, 255, 67]);
      const attached = await attachments.addAttachment(draft, {
        name: "frozen.bin",
        size: bytes.length,
        async *read() {
          yield bytes;
        },
      });
      const digest = attached.draft.attachments?.[0]?.digest;
      assert(digest);
      const input = { draftId: draft.draftId, expectedRevision: attached.draft.revision };
      const gotData = Promise.withResolvers<void>();
      const reply = Promise.withResolvers<void>();
      smtp.configure("accept", () => {
        gotData.resolve();
        return reply.promise;
      });
      const desktopRequest = new AbortController();
      const [desktop, web] = await Promise.all([
        call(engine, "mail.outbox.submit", input, desktopRequest.signal),
        engine.dispatcher.call("web:fixture", { capability: "mail.outbox.submit", input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
      ]);
      assert(desktop.ok && web.ok);
      const one = outboxReceipt.parse(desktop.data);
      const two = outboxReceipt.parse(web.data);
      expect(one).toEqual(two);
      expect(Object.keys(one).sort()).toEqual(["messageId", "operationId"]);
      const file = path.join(engine.vault.root, outboxDir, `${one.operationId}.json`);
      await gotData.promise;
      try {
        desktopRequest.abort();
        const bytesAtData = readFileSync(file, "utf8");
        expect(bytesAtData).not.toContain(password);
        expect(JSON.parse(bytesAtData)).toMatchObject({ draftId: input.draftId, revision: input.expectedRevision, messageId: one.messageId, result: null, draft: { body: content.body, attachments: [{ digest }] } });
        expect(outbox.status({ operationId: one.operationId })).toMatchObject({ state: "sending" });
        await save(engine, accountId, draft.draftId, input.expectedRevision, { subject: "new title" });
        const current = await call(engine, "mail.drafts.get", { draftId: draft.draftId });
        assert(current.ok);
        const revised = (current.data as { draft: { revision: string } }).draft.revision;
        await attachments.removeAttachment({ draftId: draft.draftId, expectedRevision: revised, digest });
        expect(await attachments.sweepUnreferenced()).toEqual({ removed: [], failed: [] });
        expect(smtp.messages[0]).toMatchObject({ sender, recipients: [to, bcc] });
        const wire = smtp.messages[0]!.wire;
        expect(wire).toContain(`Message-ID: ${one.messageId}`);
        expect(wire).toContain("Subject: frozen fixture");
        expect(wire).toContain("frozen body");
        expect(wire).toContain(bytes.toString("base64"));
        expect(wire).not.toMatch(/(?:^|\r\n)Bcc:/i);
        expect(wire).not.toContain(bcc);
        expect(wire).not.toContain("new title");
        expect(await engine.dispatcher.call("cli", { capability: "mail.outbox.submit", input, requestId: randomUUID(), idempotencyKey: randomUUID() })).toMatchObject({
          ok: false,
          error: { code: "CAPABILITY_NOT_EXPOSED" },
        });
        expect(await call(engine, "mail.outbox.status", { operationId: one.operationId })).toMatchObject({ ok: true, data: { state: "sending" } });
      } finally {
        reply.resolve();
      }
      await expect
        .poll(() => outbox.status({ operationId: one.operationId }))
        .toMatchObject({
          state: "accepted",
          smtpCode: 250,
          recipients: [
            { address: to, state: "accepted" },
            { address: bcc, state: "accepted" },
          ],
        });
      expect(smtp.counts).toEqual({ connections: 1, authenticated: 1, data: 1 });
      await engine.shutdown();
      engine = await open();
      const reopened = services(engine).outbox;
      expect(reopened.status({ operationId: one.operationId })).toMatchObject({ state: "accepted", messageId: one.messageId });
      expect(await reopened.submit(input)).toEqual(one);
      const archive = path.join(root, "outbox.zip");
      const restoredPath = path.join(root, "restored");
      const manifest = await services(engine).attachments.withSnapshot((signal) => exportPackage(engine.vault.root, archive, { signal }));
      expect(manifest.files).toEqual(expect.arrayContaining([expect.objectContaining({ path: `${outboxDir}/${one.operationId}.json` }), expect.objectContaining({ path: `.huhu/mail/attachments/${digest}` })]));
      const restored = importPackage(archive, restoredPath, { regenerateId: true });
      expect(restored.vaultId).not.toBe(engine.vault.id);
      const restoredEngine = await open({ vaultPath: restoredPath });
      const restoredOutbox = services(restoredEngine).outbox;
      expect(restoredOutbox.status({ operationId: one.operationId })).toMatchObject({ state: "accepted", messageId: one.messageId });
      expect(await restoredOutbox.submit(input)).toEqual(one);
      expect(smtp.counts.data).toBe(1);
      console.log(JSON.stringify({ scenario: "concurrent-and-restored", operationId: one.operationId, messageId: one.messageId, ...smtp.counts }));
    });
  },
  120_000,
);

testWindows(
  "Windows Engine 在草稿过期、附件缺失、只读、收件专用或认领写失败时不开 SMTP",
  async () => {
    await fixture(async ({ smtp, password, open }) => {
      const engine = await open({ create: true });
      const { outbox, attachments } = services(engine);
      const saved = await account(engine, smtp.port, password);
      const original = await save(engine, saved.accountId);
      const revised = await save(engine, saved.accountId, original.draftId, original.expectedRevision, { subject: "revised" });
      await expect(outbox.submit(original)).rejects.toMatchObject({ code: "VERSION_CONFLICT", details: { currentVersion: revised.expectedRevision } });
      const inserted = await attachments.addAttachment(revised, {
        name: "removed.bin",
        size: 1,
        async *read() {
          yield Buffer.of(1);
        },
      });
      const digest = inserted.draft.attachments?.[0]?.digest;
      assert(digest);
      rmSync(path.join(engine.vault.root, ".huhu/mail/attachments", digest));
      await expect(outbox.submit({ draftId: revised.draftId, expectedRevision: inserted.draft.revision })).rejects.toMatchObject({ details: { reason: "attachment-unavailable", digest, state: "missing" } });
      const clean = await save(engine, saved.accountId);
      const readonly = await open({ readOnly: true });
      await expect(services(readonly).outbox.submit(clean)).rejects.toMatchObject({ code: "READ_ONLY_VAULT" });
      const empty = await save(engine, saved.accountId, randomUUID(), null, { to: [], cc: [], bcc: [] });
      await expect(outbox.submit(empty)).rejects.toMatchObject({ details: { reason: "recipient-required" } });
      const atomicRename = fs.rename;
      const failure = vi.spyOn(fs, "rename").mockImplementation((from, to, callback) => {
        if (!String(to).startsWith(`${path.join(engine.vault.root, outboxDir)}${path.sep}`)) return atomicRename(from, to, callback);
        callback(Object.assign(new Error("synthetic claim failure"), { code: "EIO" }));
      });
      try {
        await expect(outbox.submit(clean)).rejects.toMatchObject({ details: { reason: "outbox-write-failed" } });
        expect(readdirSync(path.join(engine.vault.root, outboxDir))).toEqual([]);
      } finally {
        failure.mockRestore();
      }
      await credentials(engine).save({
        entityId: saved.accountId,
        expectedRevision: saved.revision,
        definition: { ...saved.definition, settings: { ...saved.definition.settings, smtpEnabled: false } },
        actions: [{ purpose: accountPasswordPurpose, action: "replace", value: password }],
      });
      await expect(outbox.submit(clean)).rejects.toMatchObject({ details: { reason: "sender-not-available" } });
      expect(smtp.counts).toEqual({ connections: 0, authenticated: 0, data: 0 });
      expect(readdirSync(path.join(engine.vault.root, outboxDir))).toEqual([]);
      expect(await call(engine, "mail.drafts.get", { draftId: clean.draftId })).toMatchObject({ ok: true, data: { draft: { revision: clean.expectedRevision } } });
      console.log(JSON.stringify({ scenario: "preclaim-rejections", ...smtp.counts, persistedClaims: 0 }));
    });
  },
  120_000,
);

testWindows(
  "Windows Engine 持久区分拒收、部分接受和 DATA 确认丢失，重开及回执写失败均不重投",
  async () => {
    await fixture(async ({ smtp, password, open }) => {
      let engine = await open({ create: true });
      let { outbox } = services(engine);
      const { accountId } = await account(engine, smtp.port, password);
      const refusedDraft = await save(engine, accountId);
      smtp.configure("reject-data");
      const refused = await outbox.submit(refusedDraft);
      await expect
        .poll(() => outbox.status({ operationId: refused.operationId }))
        .toMatchObject({
          state: "not-delivered",
          stage: "data",
          smtpCode: 554,
          recipients: [
            { address: to, state: "not-delivered" },
            { address: bcc, state: "not-delivered" },
          ],
        });
      expect(await call(engine, "mail.drafts.get", { draftId: refusedDraft.draftId })).toMatchObject({ ok: true, data: { draft: { revision: refusedDraft.expectedRevision } } });

      smtp.configure("reject-rcpt");
      const rcpt = await outbox.submit(await save(engine, accountId));
      await expect.poll(() => outbox.status({ operationId: rcpt.operationId })).toMatchObject({ state: "not-delivered", stage: "envelope", smtpCode: 550 });
      expect(smtp.counts.data).toBe(1);

      smtp.configure("partial");
      const partial = await outbox.submit(await save(engine, accountId, randomUUID(), null, { cc: ["refused@example.invalid"] }));
      await expect
        .poll(() => outbox.status({ operationId: partial.operationId }))
        .toMatchObject({
          state: "partially-accepted",
          recipients: [
            { address: to, state: "accepted" },
            { address: "refused@example.invalid", state: "not-delivered", smtpCode: 550 },
            { address: bcc, state: "accepted" },
          ],
        });

      const unknownDraft = await save(engine, accountId);
      smtp.configure("lose-reply");
      const unknown = await outbox.submit(unknownDraft);
      await expect
        .poll(() => outbox.status({ operationId: unknown.operationId }))
        .toMatchObject({
          state: "unknown",
          stage: "data",
          recipients: [
            { address: to, state: "unknown" },
            { address: bcc, state: "unknown" },
          ],
        });
      expect(smtp.messages[2]?.wire).toContain(`Message-ID: ${unknown.messageId}`);

      smtp.configure("accept");
      const unwrittenDraft = await save(engine, accountId);
      const atomicRename = fs.rename;
      let failedWrites = 0;
      const failure = vi.spyOn(fs, "rename").mockImplementation((from, to, callback) => {
        if (!String(to).startsWith(`${path.join(engine.vault.root, outboxDir)}${path.sep}`) || !existsSync(to)) return atomicRename(from, to, callback);
        failedWrites++;
        callback(Object.assign(new Error("synthetic result failure"), { code: "EIO" }));
      });
      let unwritten: Awaited<ReturnType<MailOutboxService["submit"]>>;
      try {
        unwritten = await outbox.submit(unwrittenDraft);
        await expect.poll(() => outbox.status({ operationId: unwritten.operationId })).toMatchObject({ state: "unknown", reason: "result-not-recorded" });
        expect(failedWrites).toBe(1);
        expect(JSON.parse(readFileSync(path.join(engine.vault.root, outboxDir, `${unwritten.operationId}.json`), "utf8"))).toMatchObject({ result: null });
      } finally {
        failure.mockRestore();
      }
      await engine.shutdown();
      engine = await open();
      outbox = services(engine).outbox;
      expect(outbox.status({ operationId: refused.operationId })).toMatchObject({ state: "not-delivered", smtpCode: 554 });
      expect(outbox.status({ operationId: unknown.operationId })).toMatchObject({ state: "unknown", messageId: unknown.messageId });
      expect(outbox.status({ operationId: unwritten.operationId })).toMatchObject({ state: "unknown", reason: "result-not-recorded", messageId: unwritten.messageId });
      for (const [parent, draft] of [
        [unknown, unknownDraft],
        [unwritten, unwrittenDraft],
      ] as const) {
        expect(outbox.status({ operationId: parent.operationId })).toMatchObject({ retryableRecipients: [] });
        await expect(outbox.retry({ parentOperationId: parent.operationId, expectedRevision: draft.expectedRevision, recipients: [to] })).rejects.toMatchObject({ details: { reason: "retry-recipient-ineligible" } });
      }
      expect(await outbox.submit(refusedDraft)).toEqual(refused);
      expect(await outbox.submit(unknownDraft)).toEqual(unknown);
      expect(await outbox.submit(unwrittenDraft)).toEqual(unwritten);
      expect(smtp.counts).toEqual({ connections: 5, authenticated: 5, data: 4 });
      console.log(JSON.stringify({ scenario: "outcomes-after-reopen", refusal: 554, envelopeRefusal: 550, unknown: unknown.operationId, resultNotRecorded: unwritten.operationId, ...smtp.counts }));

      smtp.configure("reject-rcpt");
      const failedRetry = await outbox.retry({ parentOperationId: refused.operationId, expectedRevision: refusedDraft.expectedRevision, recipients: [to] });
      await expect.poll(() => outbox.status({ operationId: failedRetry.operationId })).toMatchObject({ state: "not-delivered", retryableRecipients: [to] });
      expect(smtp.counts.data).toBe(4);
      smtp.configure("accept");
      const resolvedRetry = await outbox.retry({ parentOperationId: failedRetry.operationId, expectedRevision: refusedDraft.expectedRevision, recipients: [to] });
      await expect
        .poll(() => outbox.status({ operationId: resolvedRetry.operationId }))
        .toMatchObject({
          state: "accepted",
          retry: { parentOperationId: failedRetry.operationId, parentMessageId: failedRetry.messageId, originalOperationId: refused.operationId, originalMessageId: refused.messageId },
          recipients: [{ address: to, state: "accepted" }],
        });
      expect(smtp.messages.at(-1)?.recipients).toEqual([to]);
      expect(smtp.counts.data).toBe(5);
    });
  },
  120_000,
);

testWindows(
  "Windows Engine 只重试选定的明确拒收地址，删除本地详情后仍保留防重认领",
  async () => {
    await fixture(async ({ root, smtp, password, open }) => {
      let engine = await open({ create: true });
      let { outbox, attachments } = services(engine);
      const { accountId } = await account(engine, smtp.port, password);
      const rejected = "refused@example.invalid";
      const unselected = "refused@other.example.invalid";
      const start = await save(engine, accountId, randomUUID(), null, { cc: [rejected], bcc: [unselected] });
      const data = Buffer.from("outbox attachment fixture");
      const attached = await attachments.addAttachment(start, {
        name: "outbox.bin",
        size: data.length,
        async *read() {
          yield data;
        },
      });
      const digest = attached.draft.attachments?.[0]?.digest;
      assert(digest);
      const original = { draftId: start.draftId, expectedRevision: attached.draft.revision };
      smtp.configure("partial");
      const first = await outbox.submit(original);
      const firstKey = { operationId: first.operationId };
      await expect
        .poll(() => outbox.status(firstKey))
        .toMatchObject({
          state: "partially-accepted",
          recipients: [
            { address: to, state: "accepted" },
            { address: rejected, state: "not-delivered", smtpCode: 550 },
            { address: unselected, state: "not-delivered", smtpCode: 550 },
          ],
          retryableRecipients: [rejected, unselected],
        });
      expect(await call(engine, "mail.outbox.list", {})).toMatchObject({ ok: true, data: { operations: [{ operationId: first.operationId, state: "partially-accepted" }] } });
      expect(smtp.messages[0]?.recipients).toEqual([to]);

      const withoutB = await save(engine, accountId, start.draftId, original.expectedRevision, { cc: [], bcc: [unselected] });
      await expect(outbox.retry({ parentOperationId: first.operationId, expectedRevision: withoutB.expectedRevision, recipients: [rejected] })).rejects.toMatchObject({ details: { reason: "retry-recipient-missing" } });
      const corrected = await save(engine, accountId, start.draftId, withoutB.expectedRevision, { subject: "corrected delivery", cc: [rejected], bcc: [unselected] });
      const retry = { parentOperationId: first.operationId, expectedRevision: corrected.expectedRevision, recipients: [rejected] };
      await expect(outbox.retry({ ...retry, expectedRevision: original.expectedRevision })).rejects.toMatchObject({ code: "VERSION_CONFLICT", details: { currentVersion: corrected.expectedRevision } });
      await expect(outbox.retry({ ...retry, recipients: [to, rejected] })).rejects.toMatchObject({ details: { reason: "retry-recipient-ineligible" } });
      await expect(outbox.submit(corrected)).rejects.toMatchObject({ details: { reason: "retry-required" } });
      expect(smtp.counts).toEqual({ connections: 1, authenticated: 1, data: 1 });

      smtp.configure("accept");
      const response = await call(engine, "mail.outbox.retry", retry);
      assert(response.ok);
      const one = outboxReceipt.parse(response.data);
      const [repeat, overlap] = await Promise.all([outbox.retry({ ...retry, recipients: [rejected.toUpperCase()] }), outbox.retry({ ...retry, recipients: [rejected, unselected] }).catch((error) => error)]);
      expect(repeat).toEqual(one);
      expect(overlap).toMatchObject({ details: { reason: "retry-recipient-ineligible" } });
      expect(one.operationId).not.toBe(first.operationId);
      expect(one.messageId).not.toBe(first.messageId);
      const secondKey = { operationId: one.operationId };
      await expect
        .poll(() => outbox.status(secondKey))
        .toMatchObject({
          state: "accepted",
          draftId: start.draftId,
          revision: corrected.expectedRevision,
          retry: { parentOperationId: first.operationId, originalOperationId: first.operationId, parentMessageId: first.messageId, originalMessageId: first.messageId },
          recipients: [{ address: rejected, state: "accepted", smtpCode: 250 }],
          retryableRecipients: [],
        });
      expect(outbox.status(firstKey)).toMatchObject({ state: "partially-accepted", retryableRecipients: [unselected], messageId: first.messageId });
      expect(smtp.messages.map(({ recipients }) => recipients)).toEqual([[to], [rejected]]);
      const wire = smtp.messages[1]!.wire;
      expect(wire).toContain(`Message-ID: ${one.messageId}`);
      expect(wire).toContain("Subject: corrected delivery");
      expect(wire).not.toContain(to);
      expect(wire).not.toContain(unselected);

      await engine.shutdown();
      engine = await open();
      ({ outbox, attachments } = services(engine));
      expect(outbox.status(firstKey)).toMatchObject({ state: "partially-accepted", retryableRecipients: [unselected] });
      expect(outbox.status(secondKey)).toMatchObject({ state: "accepted", messageId: one.messageId });
      expect(await outbox.retry(retry)).toEqual(one);
      const readonly = await open({ readOnly: true });
      expect(services(readonly).outbox.status(secondKey)).toMatchObject({ state: "accepted" });
      await expect(services(readonly).outbox.retry(retry)).rejects.toMatchObject({ code: "READ_ONLY_VAULT" });
      await expect(services(readonly).outbox.deleteLocal(secondKey)).rejects.toMatchObject({ code: "READ_ONLY_VAULT" });

      const removed = await attachments.removeAttachment({ ...corrected, digest });
      const attachmentPath = `.huhu/mail/attachments/${digest}`;
      expect(removed.attachments).toBeUndefined();
      expect(mailAttachmentPackagePaths(engine.vault.files)).toEqual(new Set([attachmentPath]));
      const childFile = path.join(engine.vault.root, outboxDir, `${one.operationId}.json`);
      const fullRecord = readFileSync(childFile);
      const rename = fs.rename;
      const failure = vi.spyOn(fs, "rename").mockImplementation((from, to, callback) => {
        if (to !== childFile) return rename(from, to, callback);
        callback(Object.assign(new Error("synthetic local deletion failure"), { code: "EIO" }));
      });
      try {
        await expect(outbox.deleteLocal(secondKey)).rejects.toMatchObject({ details: { reason: "outbox-write-failed" } });
      } finally {
        failure.mockRestore();
      }
      expect(readFileSync(childFile)).toEqual(fullRecord);
      expect(outbox.status(secondKey)).toMatchObject({ state: "accepted" });

      expect(await call(engine, "mail.outbox.deleteLocal", secondKey)).toMatchObject({ ok: true, data: { ...secondKey, deleted: true } });
      expect(await outbox.deleteLocal(secondKey)).toEqual({ ...secondKey, deleted: true });
      const shortened = JSON.parse(readFileSync(childFile, "utf8"));
      expect(shortened).toEqual({
        format: 1,
        ...secondKey,
        draftId: start.draftId,
        revision: corrected.expectedRevision,
        messageId: one.messageId,
        deleted: true,
        retry: { parentOperationId: first.operationId, recipientKeys: [expect.stringMatching(/^[0-9a-f]{64}$/)] },
      });
      expect(await call(engine, "mail.outbox.status", secondKey)).toMatchObject({ ok: true, data: null });
      expect(outbox.list().map(({ operationId }) => operationId)).toEqual([first.operationId]);
      expect(await outbox.retry(retry)).toEqual(one);
      await expect(outbox.retry({ ...retry, expectedRevision: removed.revision })).rejects.toMatchObject({ details: { reason: "retry-recipient-ineligible" } });
      expect(await attachments.sweepUnreferenced()).toEqual({ removed: [], failed: [] });

      expect(await outbox.deleteLocal(firstKey)).toEqual({ ...firstKey, deleted: true });
      expect(outbox.status(firstKey)).toBeNull();
      expect(outbox.list()).toEqual([]);
      expect(engine.vault.files.exists(attachmentPath)).toBe(true);
      expect(mailAttachmentPackagePaths(engine.vault.files)).toEqual(new Set());
      expect(await attachments.sweepUnreferenced()).toEqual({ removed: [digest], failed: [] });
      expect(await outbox.submit(original)).toEqual(first);
      expect(await outbox.retry(retry)).toEqual(one);
      await expect(outbox.retry({ ...retry, recipients: [unselected] })).rejects.toMatchObject({ code: "NOT_FOUND" });

      const archive = path.join(root, "deleted-local.zip");
      const restoredPath = path.join(root, "restored-deleted");
      const manifest = await attachments.withSnapshot((signal) => exportPackage(engine.vault.root, archive, { signal }));
      expect(manifest.files.some(({ path: item }) => item.endsWith(`/${digest}`))).toBe(false);
      importPackage(archive, restoredPath, { regenerateId: true });
      const restoredOutbox = services(await open({ vaultPath: restoredPath })).outbox;
      expect(restoredOutbox.list()).toEqual([]);
      expect(await restoredOutbox.submit(original)).toEqual(first);
      expect(await restoredOutbox.retry(retry)).toEqual(one);
      await expect(restoredOutbox.submit({ draftId: start.draftId, expectedRevision: removed.revision })).rejects.toMatchObject({ details: { reason: "retry-required" } });
      expect(smtp.counts).toEqual({ connections: 2, authenticated: 2, data: 2 });
      console.log(
        JSON.stringify({
          scenario: "selective-retry-and-delete",
          operationId: first.operationId,
          retryOperationId: one.operationId,
          smtpRecipients: smtp.messages.map(({ recipients }) => recipients),
          ...smtp.counts,
          restoredLocalRecords: 0,
        }),
      );
    });
  },
  120_000,
);

testWindows(
  "Windows Engine 关闭途中保留未知，迟到结果无法恢复已删除详情",
  async () => {
    await fixture(async ({ smtp, password, open }) => {
      let engine = await open({ create: true });
      let { outbox } = services(engine);
      const { accountId } = await account(engine, smtp.port, password);
      const draft = await save(engine, accountId);
      const gotData = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      smtp.configure("accept", () => {
        gotData.resolve();
        return release.promise;
      });
      const pending = await outbox.submit(draft);
      await gotData.promise;
      try {
        expect(outbox.status({ operationId: pending.operationId })).toMatchObject({ state: "sending", retryableRecipients: [] });
        await engine.shutdown();
      } finally {
        release.resolve();
      }
      engine = await open();
      ({ outbox } = services(engine));
      expect(outbox.status({ operationId: pending.operationId })).toMatchObject({
        state: "unknown",
        recipients: [
          { address: to, state: "unknown" },
          { address: bcc, state: "unknown" },
        ],
        retryableRecipients: [],
      });
      await expect(outbox.retry({ parentOperationId: pending.operationId, expectedRevision: draft.expectedRevision, recipients: [to] })).rejects.toMatchObject({ details: { reason: "retry-recipient-ineligible" } });
      expect(await outbox.submit(draft)).toEqual(pending);
      expect(smtp.counts.data).toBe(1);

      const secondDraft = await save(engine, accountId);
      const gotSecondData = Promise.withResolvers<void>();
      const releaseSecond = Promise.withResolvers<void>();
      smtp.configure("accept", () => {
        gotSecondData.resolve();
        return releaseSecond.promise;
      });
      const second = await outbox.submit(secondDraft);
      const secondKey = { operationId: second.operationId };
      await gotSecondData.promise;
      const lateWrite = Promise.withResolvers<void>();
      const files = engine.vault.files;
      const write = files.write.bind(files);
      const observe = vi.spyOn(files, "write").mockImplementation(async (relative, bytes, options) => {
        try {
          return await write(relative, bytes, options);
        } finally {
          if (relative.startsWith(outboxDir) && JSON.parse(Buffer.from(bytes).toString("utf8")).result) lateWrite.resolve();
        }
      });
      try {
        expect(outbox.status(secondKey)).toMatchObject({ state: "sending" });
        await outbox.deleteLocal(secondKey);
        releaseSecond.resolve();
        await lateWrite.promise;
      } finally {
        releaseSecond.resolve();
        observe.mockRestore();
      }
      expect(outbox.status(secondKey)).toBeNull();
      expect(await outbox.submit(secondDraft)).toEqual(second);
      await engine.shutdown();
      const reopened = services(await open()).outbox;
      expect(reopened.status(secondKey)).toBeNull();
      expect(reopened.status({ operationId: pending.operationId })).toMatchObject({ state: "unknown" });
      expect(smtp.counts).toEqual({ connections: 2, authenticated: 2, data: 2 });
      console.log(JSON.stringify({ scenario: "shutdown-and-delete-race", unresolved: pending.operationId, deleted: second.operationId, ...smtp.counts }));
    });
  },
  120_000,
);
