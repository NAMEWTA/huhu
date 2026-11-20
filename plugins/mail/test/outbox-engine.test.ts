import { randomUUID } from "node:crypto";
import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema } from "@huhu/contracts";
import { ModuleCredentials } from "@huhu/kernel";
import { exportPackage, importPackage } from "@huhu/vault";
import { assert, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { accountPasswordPurpose, accountTargets, mailAccountDefinitionSchema } from "../src/engine/account-definition.js";
import { openMailAccounts, type MailDraftAttachments, type MailOutboxService } from "../src/engine/index.js";
import { outboxReceipt } from "../src/engine/outbox.js";
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
      expect(await outbox.submit(refusedDraft)).toEqual(refused);
      expect(await outbox.submit(unknownDraft)).toEqual(unknown);
      expect(await outbox.submit(unwrittenDraft)).toEqual(unwritten);
      expect(smtp.counts).toEqual({ connections: 5, authenticated: 5, data: 4 });
      console.log(JSON.stringify({ scenario: "outcomes-after-reopen", refusal: 554, envelopeRefusal: 550, unknown: unknown.operationId, resultNotRecorded: unwritten.operationId, ...smtp.counts }));
    });
  },
  120_000,
);
