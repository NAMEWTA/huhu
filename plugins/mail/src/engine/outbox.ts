import { createHash, randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { errors, HuhuError } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { MailAccountDefinition } from "./account-definition.js";
import type { openMailAccounts } from "./accounts.js";
import { draftPlainText, storedDraftContent, uuid, type StoredDraftContent } from "./draft-content.js";
import { smtpResultSchema, uniformOutcome, type MailSmtpMessage, type MailSmtpResult, type MailSmtpTransport } from "./smtp.js";

export const MAIL_OUTBOX_SERVICE = "mail.outbox";
export type MailOutboxService = Pick<MailOutbox, "submit" | "status">;

const outboxDirectory = ".huhu/mail/outbox";
const operationIdSchema = z.string().regex(/^[0-9a-f]{64}$/);
const messageIdSchema = z.string().regex(/^<[0-9a-f-]{36}@huhu\.local>$/);
export const outboxSubmitInput = z.strictObject({ draftId: uuid, expectedRevision: uuid });
export const outboxStatusInput = z.strictObject({ operationId: operationIdSchema });
export const outboxReceipt = outboxStatusInput.extend({ messageId: messageIdSchema });
const identity = outboxReceipt.extend({ draftId: uuid, revision: uuid, claimedAt: z.iso.datetime() });
export const outboxView = z
  .union([
    identity.extend({ state: z.literal("sending") }),
    identity.extend({ state: z.literal("unknown"), reason: z.literal("result-not-recorded"), recipients: smtpResultSchema.shape.recipients }),
    smtpResultSchema.safeExtend({ ...identity.shape, state: z.enum(["unknown", "not-delivered", "accepted", "partially-accepted"]), finishedAt: z.iso.datetime() }),
  ])
  .nullable();
const intentSchema = z.strictObject({
  format: z.literal(1),
  operationId: operationIdSchema,
  draftId: uuid,
  revision: uuid,
  messageId: messageIdSchema,
  claimedAt: z.iso.datetime(),
  from: z.email(),
  auth: z.enum(["password", "app-password"]),
  smtp: z.strictObject({ host: z.string().min(1), port: z.number().int().min(1).max(65_535), security: z.enum(["tls", "starttls", "none"]) }),
  draft: storedDraftContent,
  text: z.string().max(2 * 1024 * 1024),
  result: smtpResultSchema.safeExtend({ finishedAt: z.iso.datetime() }).nullable(),
});
type Intent = z.infer<typeof intentSchema>;
type VaultFiles = HuhuApi["vault"]["files"];
type MailAccounts = ReturnType<typeof openMailAccounts>;
type DraftOwner = {
  serialize<T>(run: () => Promise<T>): Promise<T>;
  freezeForSend(draftId: string, revision: string): { draft: StoredDraftContent; attachments: MailSmtpMessage["attachments"] };
};

function operationIdFor(draftId: string, revision: string): string {
  // Vault-relative storage scopes the claim. Keeping the key on restore prevents a copied intent from submitting again.
  return createHash("sha256").update(`mail-submit\0${draftId}\0${revision}`).digest("hex");
}

function recipientsOf({ to, cc, bcc }: StoredDraftContent): string[] {
  return [...to, ...cc, ...bcc];
}

function hasSameRecipients(result: MailSmtpResult, addresses: string[]): boolean {
  return result.recipients.length === addresses.length && result.recipients.every((recipient, index) => recipient.address === addresses[index]);
}

function sameSender(intent: Intent, { email, auth, smtp, smtpEnabled }: MailAccountDefinition["settings"]): boolean {
  return smtpEnabled && email === intent.from && auth === intent.auth && smtp.host === intent.smtp.host && smtp.port === intent.smtp.port && smtp.security === intent.smtp.security;
}

function unavailable(reason: string, message: string): HuhuError {
  return new HuhuError("INVALID_INPUT", message, { details: { reason } });
}

export class MailOutbox {
  private readonly active = new Map<string, Promise<void>>();

  constructor(
    private readonly files: VaultFiles,
    private readonly drafts: DraftOwner,
    private readonly accounts: MailAccounts | undefined,
    private readonly transport: MailSmtpTransport | undefined,
    private readonly lifetime: AbortSignal,
  ) {}

  async submit(input: z.infer<typeof outboxSubmitInput>, requestSignal?: AbortSignal) {
    const { draftId, expectedRevision } = outboxSubmitInput.parse(input);
    this.files.assertWritable();
    const operationId = operationIdFor(draftId, expectedRevision);
    const signal = requestSignal ? AbortSignal.any([requestSignal, this.lifetime]) : this.lifetime;
    return this.drafts.serialize(async () => {
      signal.throwIfAborted();
      const current = this.read(operationId);
      if (current) return { operationId, messageId: current.intent.messageId };

      const { draft, attachments } = this.drafts.freezeForSend(draftId, expectedRevision);
      if (!recipientsOf(draft).length) throw unavailable("recipient-required", "请添加至少一个收件人");
      const { accounts, transport } = this;
      const sender = draft.accountId && (await accounts?.list())?.find(({ accountId }) => accountId === draft.accountId);
      if (!accounts || !sender || !sender.definition.settings.smtpEnabled) throw unavailable("sender-not-available", "请选择已启用 SMTP 的发件账号");
      if (!transport) throw unavailable("smtp-transport-unavailable", "SMTP 传输尚未装配");
      const settings = sender.definition.settings;
      const intent: Intent = {
        format: 1,
        operationId,
        draftId,
        revision: expectedRevision,
        messageId: `<${randomUUID()}@huhu.local>`,
        claimedAt: new Date().toISOString(),
        from: settings.email,
        auth: settings.auth,
        smtp: settings.smtp,
        draft,
        text: draftPlainText(draft.body),
        result: null,
      };
      signal.throwIfAborted();
      const { version } = await this.write(intent, null);
      const attempt = this.deliver(intent, version, sender.accountId, attachments, accounts, transport).finally(() => {
        this.active.delete(operationId);
      });
      this.active.set(operationId, attempt);
      return { operationId, messageId: intent.messageId };
    });
  }

  status(input: z.infer<typeof outboxStatusInput>): z.infer<typeof outboxView> {
    this.lifetime.throwIfAborted();
    const { operationId } = outboxStatusInput.parse(input);
    const record = this.read(operationId);
    if (!record) return null;
    const { messageId, draftId, revision, claimedAt, result, draft } = record.intent;
    const identity = { operationId, messageId, draftId, revision, claimedAt };
    if (!result) {
      if (this.active.has(operationId)) return { ...identity, state: "sending" as const };
      return { ...identity, state: "unknown" as const, reason: "result-not-recorded" as const, recipients: uniformOutcome(recipientsOf(draft), "data", "unknown").recipients };
    }
    const accepted = result.recipients.filter(({ state }) => state === "accepted").length;
    const unknown = result.recipients.some(({ state }) => state === "unknown");
    const state = unknown ? "unknown" : accepted === 0 ? "not-delivered" : accepted === result.recipients.length ? "accepted" : "partially-accepted";
    return { ...identity, state, ...result };
  }

  attachmentDigests(): string[] {
    const entries = (() => {
      try {
        return readdirSync(this.files.abs(outboxDirectory), { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
    })();
    return entries.flatMap(({ name }) => {
      const operationId = name.endsWith(".json") && name.slice(0, -5);
      if (!operationId || !operationIdSchema.safeParse(operationId).success) return [];
      const record = this.read(operationId);
      if (!record) throw errors.notFound("邮件投递记录不存在");
      return record.intent.draft.attachments?.map(({ digest }) => digest) ?? [];
    });
  }

  async drain(): Promise<void> {
    await Promise.all(this.active.values());
  }

  private async deliver(intent: Intent, version: string, accountId: string, attachments: MailSmtpMessage["attachments"], accounts: MailAccounts, transport: MailSmtpTransport): Promise<void> {
    const addresses = recipientsOf(intent.draft);
    let outcome: MailSmtpResult;
    try {
      outcome = await accounts.withSmtpCredentials(accountId, async (settings, password) => {
        if (!sameSender(intent, settings) || this.lifetime.aborted) return uniformOutcome(addresses, "credential", "not-delivered");
        const { to, cc, bcc, subject } = intent.draft;
        try {
          const message = { from: intent.from, to: [...to], cc: [...cc], bcc: [...bcc], subject, text: intent.text, messageId: intent.messageId, date: intent.claimedAt, attachments };
          const reply = await transport({ ...intent.smtp }, password, message, this.lifetime);
          const checked = smtpResultSchema.parse(reply);
          if (hasSameRecipients(checked, addresses)) return checked;
        } catch {
          // The transport may already have sent DATA.
        }
        return uniformOutcome(addresses, "data", "unknown");
      });
    } catch {
      outcome = uniformOutcome(addresses, "credential", "not-delivered");
    }
    try {
      await this.drafts.serialize(async () => this.write({ ...intent, result: { ...outcome, finishedAt: new Date().toISOString() } }, version));
    } catch {
      // A claim without a durable result is unknown once this attempt is no longer active.
    }
  }

  private read(operationId: string): { intent: Intent; version: string } | null {
    try {
      const file = this.files.read(`${outboxDirectory}/${operationId}.json`);
      if (!file) return null;
      const intent = intentSchema.parse(JSON.parse(file.bytes.toString("utf8")));
      if (intent.operationId !== operationId || operationIdFor(intent.draftId, intent.revision) !== operationId) throw new Error("outbox identity mismatch");
      if (intent.result && !hasSameRecipients(intent.result, recipientsOf(intent.draft))) throw new Error("outbox recipients mismatch");
      return { intent, version: file.version };
    } catch {
      throw new HuhuError("INTERNAL", "无法读取邮件投递记录", { retryable: false, details: { reason: "outbox-read-failed" } });
    }
  }

  private async write(intent: Intent, version: string | null): Promise<{ version: string }> {
    try {
      return await this.files.write(`${outboxDirectory}/${intent.operationId}.json`, Buffer.from(JSON.stringify(intent) + "\n"), { expectedVersion: version });
    } catch {
      throw new HuhuError("INTERNAL", "无法保存邮件投递记录", { details: { reason: "outbox-write-failed" } });
    }
  }
}
