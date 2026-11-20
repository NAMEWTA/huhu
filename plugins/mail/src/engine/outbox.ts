import { randomUUID } from "node:crypto";
import { errors, HuhuError } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { MailAccountDefinition } from "./account-definition.js";
import type { openMailAccounts } from "./accounts.js";
import { draftPlainText, draftRecipient, uuid, type StoredDraftContent } from "./draft-content.js";
import {
  deleteDetails,
  hasSameRecipients,
  lineage,
  messageId,
  operationIdFor,
  operationIdSchema,
  OutboxStorage,
  recipientsOf,
  retryOperationIdFor,
  retryRecipientKey,
  selectedRecipientKeys,
  type OutboxIntent,
  type OutboxRecord,
} from "./outbox-storage.js";
import { smtpResultSchema, uniformOutcome, type MailSmtpMessage, type MailSmtpResult, type MailSmtpTransport } from "./smtp.js";

export const MAIL_OUTBOX_SERVICE = "mail.outbox";
export type MailOutboxService = Pick<MailOutbox, "submit" | "retry" | "status" | "list" | "deleteLocal">;

export const outboxSubmitInput = z.strictObject({ draftId: uuid, expectedRevision: uuid });
export const outboxStatusInput = z.strictObject({ operationId: operationIdSchema });
export const outboxRetryInput = z.strictObject({
  parentOperationId: operationIdSchema,
  expectedRevision: uuid,
  recipients: z
    .array(draftRecipient)
    .min(1)
    .max(3_000)
    .refine((addresses) => new Set(addresses).size === addresses.length),
});
export const outboxReceipt = outboxStatusInput.extend({ messageId });
export const outboxSummary = outboxReceipt.extend({
  draftId: uuid,
  revision: uuid,
  claimedAt: z.iso.datetime(),
  retry: lineage.optional(),
  subject: z.string(),
  state: z.enum(["sending", "unknown", "not-delivered", "accepted", "partially-accepted"]),
});
const outboxDetails = outboxSummary.extend({ retryableRecipients: z.array(draftRecipient) });
export const outboxView = z
  .union([
    outboxDetails.extend({ state: z.literal("sending") }),
    outboxDetails.extend({ state: z.literal("unknown"), reason: z.literal("result-not-recorded"), recipients: smtpResultSchema.shape.recipients }),
    smtpResultSchema.safeExtend({ ...outboxDetails.shape, state: z.enum(["unknown", "not-delivered", "accepted", "partially-accepted"]), finishedAt: z.iso.datetime() }),
  ])
  .nullable();
type VaultFiles = HuhuApi["vault"]["files"];
type MailAccounts = ReturnType<typeof openMailAccounts>;
type DraftOwner = {
  serialize<T>(run: () => Promise<T>): Promise<T>;
  freezeForSend(draftId: string, revision: string): { draft: StoredDraftContent; attachments: MailSmtpMessage["attachments"] };
};
type Claim = Pick<OutboxIntent, "operationId" | "draftId" | "revision"> & { retry?: OutboxIntent["retry"]; selected?: string[] };
type DeliveryState = z.infer<typeof outboxSummary>["state"];

const receipt = ({ operationId, messageId }: OutboxRecord) => ({ operationId, messageId });

function sameSender(intent: OutboxIntent, { email, auth, smtp, smtpEnabled }: MailAccountDefinition["settings"]): boolean {
  return smtpEnabled && email === intent.from && auth === intent.auth && smtp.host === intent.smtp.host && smtp.port === intent.smtp.port && smtp.security === intent.smtp.security;
}

function unavailable(reason: string, message: string): HuhuError {
  return new HuhuError("INVALID_INPUT", message, { details: { reason } });
}

function retainSelected(draft: StoredDraftContent, selected: string[]): StoredDraftContent {
  const allow = new Set(selected);
  const filtered = { ...draft, to: draft.to.filter((address) => allow.has(address)), cc: draft.cc.filter((address) => allow.has(address)), bcc: draft.bcc.filter((address) => allow.has(address)) };
  if (new Set(recipientsOf(filtered)).size !== allow.size) throw unavailable("retry-recipient-missing", "修正后的草稿必须包含所有选定收件人");
  return filtered;
}

export class MailOutbox {
  private readonly active = new Map<string, Promise<void>>();
  private readonly storage: OutboxStorage;

  constructor(
    private readonly files: VaultFiles,
    private readonly drafts: DraftOwner,
    private readonly accounts: MailAccounts | undefined,
    private readonly transport: MailSmtpTransport | undefined,
    private readonly lifetime: AbortSignal,
  ) {
    this.storage = new OutboxStorage(files);
  }

  async submit(input: z.infer<typeof outboxSubmitInput>, requestSignal?: AbortSignal) {
    const { draftId, expectedRevision: revision } = outboxSubmitInput.parse(input);
    const operationId = operationIdFor(draftId, revision);
    return this.mutate(requestSignal, async (signal) => {
      const current = this.storage.read(operationId);
      if (current) return receipt(current.record);
      for (const record of this.storage.records()) {
        if (record.draftId === draftId) throw unavailable("retry-required", "此草稿已有投递记录，请从发件记录选择可重试的收件人");
      }
      return this.claim({ operationId, draftId, revision }, signal);
    });
  }

  async retry(input: z.infer<typeof outboxRetryInput>, requestSignal?: AbortSignal) {
    const { parentOperationId, expectedRevision: revision, recipients: selected } = outboxRetryInput.parse(input);
    return this.mutate(requestSignal, async (signal) => {
      const parent = this.storage.read(parentOperationId)?.record;
      if (!parent) throw errors.notFound("原投递记录不存在");
      const keys = selected.map((address) => retryRecipientKey(parentOperationId, address));
      const operationId = retryOperationIdFor(parentOperationId, parent.draftId, revision, keys);
      const current = this.storage.read(operationId);
      if (current) return receipt(current.record);
      if ("deleted" in parent) throw errors.notFound("原投递记录已删除");

      const eligible = new Set(this.retryableRecipients(parent));
      if (selected.some((address) => !eligible.has(address))) {
        throw unavailable("retry-recipient-ineligible", "只能重试已确认未投递且尚未重试的收件人");
      }
      return this.claim(
        {
          operationId,
          draftId: parent.draftId,
          revision,
          retry: {
            parentOperationId,
            parentMessageId: parent.messageId,
            originalOperationId: parent.retry?.originalOperationId ?? parentOperationId,
            originalMessageId: parent.retry?.originalMessageId ?? parent.messageId,
          },
          selected,
        },
        signal,
      );
    });
  }

  status(input: z.infer<typeof outboxStatusInput>): z.infer<typeof outboxView> {
    this.lifetime.throwIfAborted();
    const { operationId } = outboxStatusInput.parse(input);
    const record = this.storage.read(operationId)?.record;
    if (!record || "deleted" in record) return null;
    const { result, draft } = record;
    const summary = this.summary(record);
    const retryableRecipients = this.retryableRecipients(record);
    const { state } = summary;
    if (state === "sending") return { ...summary, state, retryableRecipients };
    if (result) return { ...summary, ...result, state, retryableRecipients };
    return { ...summary, state: "unknown", reason: "result-not-recorded", recipients: uniformOutcome(recipientsOf(draft), "data", "unknown").recipients, retryableRecipients };
  }

  list() {
    this.lifetime.throwIfAborted();
    const summaries: ReturnType<MailOutbox["summary"]>[] = [];
    for (const record of this.storage.records()) {
      if (!("deleted" in record)) summaries.push(this.summary(record));
    }
    return summaries.sort((a, b) => b.claimedAt.localeCompare(a.claimedAt) || a.operationId.localeCompare(b.operationId));
  }

  async deleteLocal(input: z.infer<typeof outboxStatusInput>, requestSignal?: AbortSignal) {
    const { operationId } = outboxStatusInput.parse(input);
    return this.mutate(requestSignal, async (signal) => {
      const stored = this.storage.read(operationId);
      if (!stored) throw errors.notFound("邮件投递记录不存在");
      signal.throwIfAborted();
      if (!("deleted" in stored.record)) await this.storage.write(deleteDetails(stored.record), stored.version);
      return { operationId, deleted: true as const };
    });
  }

  attachmentDigests(): string[] {
    const digests = new Set<string>();
    for (const record of this.storage.records()) {
      if ("deleted" in record) continue;
      for (const { digest } of record.draft.attachments ?? []) digests.add(digest);
    }
    return [...digests];
  }

  async drain(): Promise<void> {
    await Promise.all(this.active.values());
  }

  private mutate<T>(requestSignal: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.files.assertWritable();
    const signal = requestSignal ? AbortSignal.any([requestSignal, this.lifetime]) : this.lifetime;
    return this.drafts.serialize(() => {
      signal.throwIfAborted();
      return run(signal);
    });
  }

  private retryableRecipients(intent: OutboxIntent): string[] {
    const failed = intent.result?.recipients.filter(({ state }) => state === "not-delivered") ?? [];
    if (!failed.length) return [];
    const claimed = new Set<string>();
    for (const record of this.storage.records()) {
      if (record.retry?.parentOperationId !== intent.operationId) continue;
      for (const key of selectedRecipientKeys(record)) claimed.add(key);
    }
    return failed.flatMap(({ address }) => (claimed.has(retryRecipientKey(intent.operationId, address)) ? [] : [address]));
  }

  private summary({ operationId, messageId, draftId, revision, claimedAt, retry, draft, result }: OutboxIntent) {
    let state: DeliveryState = this.active.has(operationId) ? "sending" : "unknown";
    if (result) {
      const accepted = result.recipients.filter((recipient) => recipient.state === "accepted").length;
      const unknown = result.recipients.some((recipient) => recipient.state === "unknown");
      state = unknown ? "unknown" : accepted === 0 ? "not-delivered" : accepted === result.recipients.length ? "accepted" : "partially-accepted";
    }
    return { operationId, messageId, draftId, revision, claimedAt, ...(retry && { retry }), subject: draft.subject, state };
  }

  private async claim({ operationId, draftId, revision, retry, selected }: Claim, signal: AbortSignal) {
    const frozen = this.drafts.freezeForSend(draftId, revision);
    const draft = selected ? retainSelected(frozen.draft, selected) : frozen.draft;
    if (!recipientsOf(draft).length) throw unavailable("recipient-required", "请添加至少一个收件人");
    const { accounts, transport } = this;
    const sender = draft.accountId && (await accounts?.list())?.find(({ accountId }) => accountId === draft.accountId);
    if (!accounts || !sender || !sender.definition.settings.smtpEnabled) throw unavailable("sender-not-available", "请选择已启用 SMTP 的发件账号");
    if (!transport) throw unavailable("smtp-transport-unavailable", "SMTP 传输尚未装配");
    const settings = sender.definition.settings;
    const intent: OutboxIntent = {
      format: 1,
      operationId,
      draftId,
      revision,
      messageId: `<${randomUUID()}@huhu.local>`,
      ...(retry && { retry }),
      claimedAt: new Date().toISOString(),
      from: settings.email,
      auth: settings.auth,
      smtp: settings.smtp,
      draft,
      text: draftPlainText(draft.body),
      result: null,
    };
    signal.throwIfAborted();
    const { version } = await this.storage.write(intent, null);
    const attempt = this.deliver(intent, version, sender.accountId, frozen.attachments, accounts, transport).finally(() => {
      this.active.delete(operationId);
    });
    this.active.set(operationId, attempt);
    return receipt(intent);
  }

  private async deliver(intent: OutboxIntent, version: string, accountId: string, attachments: MailSmtpMessage["attachments"], accounts: MailAccounts, transport: MailSmtpTransport): Promise<void> {
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
      await this.drafts.serialize(async () => this.storage.write({ ...intent, result: { ...outcome, finishedAt: new Date().toISOString() } }, version));
    } catch {
      // An unsettled claim becomes unknown. A local deletion wins over a late result.
    }
  }
}
