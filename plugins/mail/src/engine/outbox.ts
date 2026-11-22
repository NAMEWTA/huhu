import { randomUUID } from "node:crypto";
import { errors, HuhuError } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { MailAccountDefinition } from "./account-definition.js";
import type { openMailAccounts } from "./accounts.js";
import { draftPlainText, draftRecipient, uuid, type StoredDraftContent } from "./draft-content.js";
import { sendGraphMail } from "./graph-send.js";
import { MailOAuthError } from "./oauth-provider.js";
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
  retained: z.literal(true).optional(),
  state: z.enum(["sending", "unknown", "not-delivered", "accepted", "partially-accepted"]),
});
const outboxDetails = outboxSummary.extend({ recordVersion: z.string().optional(), retryableRecipients: z.array(draftRecipient) });
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
type DeliveryEvidence = Extract<OutboxRecord, { deleted: true }>;

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

function outcomeState(recipients: MailSmtpResult["recipients"]): Exclude<DeliveryState, "sending"> {
  if (recipients.some(({ state }) => state === "unknown")) return "unknown";
  const accepted = recipients.filter(({ state }) => state === "accepted").length;
  return accepted === 0 ? "not-delivered" : accepted === recipients.length ? "accepted" : "partially-accepted";
}

function evidenceView({ operationId, messageId, draftId, revision, evidence }: DeliveryEvidence): z.infer<typeof outboxView> {
  if (!evidence) return null;
  const { claimedAt, outcome } = evidence;
  const summary = { operationId, messageId, draftId, revision, claimedAt, subject: "", retained: true as const, retryableRecipients: [] };
  if (!("finishedAt" in outcome)) return { ...summary, ...outcome, state: "unknown" };
  return { ...summary, ...outcome, state: outcomeState(outcome.recipients) };
}

export class MailOutbox {
  private readonly active = new Map<string, { accountId: string; attempt: Promise<void> }>();
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
      this.accounts?.assertActive(parent.draft.accountId);

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

  status(input: z.infer<typeof outboxStatusInput>, external = false): z.infer<typeof outboxView> {
    this.lifetime.throwIfAborted();
    const { operationId } = outboxStatusInput.parse(input);
    const stored = this.storage.read(operationId);
    if (!stored) return null;
    const { record, version } = stored;
    if ("deleted" in record) return external ? null : evidenceView(record);
    if (external && (!record.draft.accountId || !this.accounts?.visibleDefinition(record.draft.accountId))) return null;
    const { result, draft } = record;
    const summary = { ...this.summary(record), ...(external && { recordVersion: version }) };
    const retryableRecipients = this.retryableRecipients(record);
    const { state } = summary;
    if (state === "sending") return { ...summary, state, retryableRecipients };
    if (result) return { ...summary, ...result, state, retryableRecipients };
    return { ...summary, state: "unknown", reason: "result-not-recorded", recipients: uniformOutcome(recipientsOf(draft), "data", "unknown").recipients, retryableRecipients };
  }

  list(external = false) {
    this.lifetime.throwIfAborted();
    const summaries: z.infer<typeof outboxSummary>[] = [];
    for (const record of this.storage.records()) {
      if (!("deleted" in record)) {
        if (!external || (record.draft.accountId && this.accounts?.visibleDefinition(record.draft.accountId))) summaries.push(this.summary(record));
      } else if (!external) {
        const view = evidenceView(record);
        if (view) summaries.push({ operationId: view.operationId, messageId: view.messageId, draftId: view.draftId, revision: view.revision, claimedAt: view.claimedAt, subject: view.subject, state: view.state, retained: true });
      }
    }
    return summaries.sort((a, b) => b.claimedAt.localeCompare(a.claimedAt) || a.operationId.localeCompare(b.operationId));
  }

  async deleteLocal({ operationId, expectedVersion }: z.infer<typeof outboxStatusInput> & { expectedVersion?: string | undefined }, requestSignal?: AbortSignal, external = false) {
    outboxStatusInput.parse({ operationId });
    if (external && !expectedVersion) throw errors.invalidInput("删除本机投递记录需要记录版本。");
    return this.mutate(requestSignal, async (signal) => {
      const stored = this.storage.read(operationId);
      if (!stored) throw errors.notFound("邮件投递记录不存在");
      signal.throwIfAborted();
      if (!("deleted" in stored.record)) {
        this.accounts?.assertActive(stored.record.draft.accountId);
        if (expectedVersion !== undefined && stored.version !== expectedVersion) throw errors.versionConflict(stored.version);
        await this.storage.write(deleteDetails(stored.record), stored.version);
      } else if (external) {
        throw errors.notFound("邮件投递记录不存在");
      } else if (stored.record.evidence) {
        const { evidence: _evidence, ...claim } = stored.record;
        await this.storage.write(claim, stored.version);
      }
      return { operationId, deleted: true as const };
    });
  }

  attachmentDigests(excludeAccountId?: string): string[] {
    return this.storage.attachmentDigests(excludeAccountId);
  }

  accountRecords(accountId: string) {
    return [...this.storage.records()]
      .flatMap((record) => {
        if ("deleted" in record || record.draft.accountId !== accountId) return [];
        return [
          {
            operationId: record.operationId,
            version: this.storage.read(record.operationId)!.version,
            active: this.active.has(record.operationId),
            retained: !record.result || outcomeState(record.result.recipients) !== "not-delivered",
            attachments: record.draft.attachments?.map(({ digest }) => digest) ?? [],
          },
        ];
      })
      .sort((a, b) => a.operationId.localeCompare(b.operationId));
  }

  /** Caller holds the shared writer after the account's active attempts have stopped. */
  async retireAccount(accountId: string) {
    for (const { operationId, retained, version } of this.accountRecords(accountId)) {
      const record = this.storage.read(operationId)?.record;
      if (!record || "deleted" in record) continue;
      const tombstone = deleteDetails(record);
      if (retained) tombstone.evidence = { claimedAt: record.claimedAt, outcome: record.result ?? { reason: "result-not-recorded", recipients: uniformOutcome(recipientsOf(record.draft), "data", "unknown").recipients } };
      await this.storage.write(tombstone, version);
    }
  }

  async drainAccount(accountId: string) {
    await Promise.all([...this.active.values()].filter((entry) => entry.accountId === accountId).map(({ attempt }) => attempt));
  }

  async drain(): Promise<void> {
    await Promise.all([...this.active.values()].map(({ attempt }) => attempt));
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
    try {
      this.accounts?.assertActive(intent.draft.accountId);
    } catch (error) {
      if (error instanceof HuhuError && error.code === "NOT_FOUND") return [];
      throw error;
    }
    const claimed = new Set<string>();
    for (const record of this.storage.records()) {
      if (record.retry?.parentOperationId !== intent.operationId) continue;
      for (const key of selectedRecipientKeys(record)) claimed.add(key);
    }
    return failed.flatMap(({ address }) => (claimed.has(retryRecipientKey(intent.operationId, address)) ? [] : [address]));
  }

  private summary({ operationId, messageId, draftId, revision, claimedAt, retry, draft, result }: OutboxIntent) {
    let state: DeliveryState = this.active.has(operationId) ? "sending" : "unknown";
    if (result) state = outcomeState(result.recipients);
    return { operationId, messageId, draftId, revision, claimedAt, ...(retry && { retry }), subject: draft.subject, state };
  }

  private async claim({ operationId, draftId, revision, retry, selected }: Claim, signal: AbortSignal) {
    const frozen = this.drafts.freezeForSend(draftId, revision);
    const draft = selected ? retainSelected(frozen.draft, selected) : frozen.draft;
    if (draft.reply && draft.accountId !== draft.reply.accountId) throw unavailable("reply-origin-mismatch", "回复必须使用原邮件所属的邮箱。");
    if (!recipientsOf(draft).length) throw unavailable("recipient-required", "请添加至少一个收件人");
    const { accounts, transport } = this;
    const sender = draft.accountId && (await accounts?.list())?.find(({ accountId }) => accountId === draft.accountId);
    if (!accounts || !sender) throw unavailable("sender-not-available", "请选择已启用发送的邮箱账号");
    const identity = sender.definition.oauth;
    const graph = identity?.route === "graph" ? { clientId: identity.clientId, subject: identity.subject } : undefined;
    const settings = sender.definition.settings;
    if (!settings.smtpEnabled) {
      if (identity?.route === "graph") {
        if (identity.graphSend === false) throw unavailable("graph-send-permission", "Microsoft Graph 未授予当前凭据 Mail.Send 权限。");
        throw unavailable("sender-not-available", "此 Microsoft Graph 账号未启用发送。");
      }
      throw unavailable("sender-not-available", "请选择已启用 SMTP 的发件账号");
    }
    if (!graph && !transport) throw unavailable("smtp-transport-unavailable", "SMTP 传输尚未装配");
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
      ...(graph && { graph }),
      smtp: settings.smtp,
      draft,
      text: draftPlainText(draft.body),
      result: null,
    };
    signal.throwIfAborted();
    const deliverySignal = AbortSignal.any([this.lifetime, accounts.signal(sender.accountId)]);
    const { version } = await this.storage.write(intent, null);
    const attempt = this.deliver(intent, version, sender.accountId, frozen.attachments, accounts, transport, deliverySignal).finally(() => {
      this.active.delete(operationId);
    });
    this.active.set(operationId, { accountId: sender.accountId, attempt });
    return receipt(intent);
  }

  private async deliver(intent: OutboxIntent, version: string, accountId: string, attachments: MailSmtpMessage["attachments"], accounts: MailAccounts, transport: MailSmtpTransport | undefined, signal: AbortSignal): Promise<void> {
    const addresses = recipientsOf(intent.draft);
    const { to, cc, bcc, subject, reply: replyContext } = intent.draft;
    const message: MailSmtpMessage = {
      from: intent.from,
      to: [...to],
      cc: [...cc],
      bcc: [...bcc],
      subject,
      text: intent.text,
      messageId: intent.messageId,
      date: intent.claimedAt,
      attachments,
      ...(replyContext?.inReplyTo && { inReplyTo: replyContext.inReplyTo }),
      ...(replyContext?.references.length && { references: [...replyContext.references] }),
    };
    let outcome: MailSmtpResult;
    try {
      outcome = intent.graph
        ? await accounts.withGraphSendCredentials(
            accountId,
            async ({ settings, oauth }, endpoint, token, assertCurrent) => {
              if (signal.aborted || settings.email !== intent.from || oauth?.clientId !== intent.graph?.clientId || oauth?.subject !== intent.graph?.subject) return uniformOutcome(addresses, "credential", "not-delivered");
              return sendGraphMail(endpoint, token, message, signal, assertCurrent);
            },
            signal,
          )
        : await accounts.withSmtpCredentials(
            accountId,
            async (settings, password) => {
              if (!transport || !sameSender(intent, settings) || signal.aborted) return uniformOutcome(addresses, "credential", "not-delivered");
              try {
                const reply = await transport({ ...intent.smtp }, password, message, signal, intent.auth === "oauth2" ? "oauth2" : undefined);
                const checked = smtpResultSchema.parse(reply);
                if (hasSameRecipients(checked, addresses)) return checked;
              } catch {
                // The transport may already have sent DATA.
              }
              return uniformOutcome(addresses, "data", "unknown");
            },
            signal,
          );
    } catch (error) {
      outcome = uniformOutcome(addresses, "credential", "not-delivered");
      if (intent.graph && error instanceof MailOAuthError && error.reason === "permission-missing") outcome.reason = "graph-send-permission";
    }
    try {
      await this.drafts.serialize(async () => this.storage.write({ ...intent, result: { ...outcome, finishedAt: new Date().toISOString() } }, version));
    } catch {
      // An unsettled claim becomes unknown. A local deletion wins over a late result.
    }
  }
}
