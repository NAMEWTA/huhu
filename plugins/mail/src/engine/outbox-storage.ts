import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { HuhuError } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { storedDraftContent, uuid, type StoredDraftContent } from "./draft-content.js";
import { smtpResultSchema, type MailSmtpResult } from "./smtp.js";
import { mailSourceStamp, readMailProjection, removeMailProjections, saveMailProjection } from "./mail-projection.js";

const outboxDirectory = ".huhu/mail/outbox";
export const outboxRecordPath = (operationId: string) => `${outboxDirectory}/${operationId}.json`;
export const isOutboxRecordPath = (relative: string) => /^\.huhu\/mail\/outbox\/[a-f0-9]{64}\.json$/.test(relative);
export const operationIdSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const messageId = z.string().regex(/^<[0-9a-f-]{36}@huhu\.local>$/);
const identity = z.strictObject({ format: z.literal(1), operationId: operationIdSchema, draftId: uuid, revision: uuid, messageId });
export const lineage = z.strictObject({ parentOperationId: operationIdSchema, parentMessageId: messageId, originalOperationId: operationIdSchema, originalMessageId: messageId });
const intentSchema = identity.extend({
  retry: lineage.optional(),
  claimedAt: z.iso.datetime(),
  from: z.email(),
  auth: z.enum(["password", "app-password", "oauth2"]),
  graph: z.strictObject({ clientId: z.string().min(1), subject: z.string().min(1) }).optional(),
  smtp: z.strictObject({ host: z.string().min(1), port: z.number().int().min(1).max(65_535), security: z.enum(["tls", "starttls", "none"]) }),
  draft: storedDraftContent,
  text: z.string().max(2 * 1024 * 1024),
  result: smtpResultSchema.safeExtend({ finishedAt: z.iso.datetime() }).nullable(),
});
const deletedSchema = identity.extend({
  deleted: z.literal(true),
  retry: z.strictObject({ parentOperationId: operationIdSchema, recipientKeys: z.array(operationIdSchema).min(1).max(3_000) }).optional(),
  evidence: z
    .strictObject({
      claimedAt: z.iso.datetime(),
      outcome: z.union([intentSchema.shape.result.unwrap(), z.strictObject({ reason: z.literal("result-not-recorded"), recipients: smtpResultSchema.shape.recipients })]),
    })
    .optional(),
});
export const outboxRecordSchema = z.union([deletedSchema, intentSchema]);
export type OutboxIntent = z.infer<typeof intentSchema>;
export type OutboxRecord = z.infer<typeof outboxRecordSchema>;

const hash = (fields: string[]) => createHash("sha256").update(fields.join("\0")).digest("hex");
// Vault-relative storage scopes the claim. Restoring a Vault preserves its existing operations.
export const operationIdFor = (draftId: string, revision: string) => hash(["mail-submit", draftId, revision]);
// A deleted child keeps this parent-scoped claim without retaining the address in clear text.
export const retryRecipientKey = (parentOperationId: string, address: string) => hash(["mail-retry-recipient", parentOperationId, address]);
export const retryOperationIdFor = (parentOperationId: string, draftId: string, revision: string, keys: string[]) => hash(["mail-retry", parentOperationId, draftId, revision, ...keys.toSorted()]);

export function recipientsOf({ to, cc, bcc }: StoredDraftContent): string[] {
  return [...to, ...cc, ...bcc];
}

export function hasSameRecipients(result: MailSmtpResult, addresses: string[]): boolean {
  return result.recipients.length === addresses.length && result.recipients.every((recipient, index) => recipient.address === addresses[index]);
}

export function selectedRecipientKeys(record: OutboxRecord): string[] {
  if (!record.retry) return [];
  if ("deleted" in record) return record.retry.recipientKeys;
  const { parentOperationId } = record.retry;
  return recipientsOf(record.draft).map((address) => retryRecipientKey(parentOperationId, address));
}

export function parseOutboxRecord(value: unknown, operationId?: string): OutboxRecord {
  const record = outboxRecordSchema.parse(value);
  const { draftId, revision, retry } = record;
  const expected = retry ? retryOperationIdFor(retry.parentOperationId, draftId, revision, selectedRecipientKeys(record)) : operationIdFor(draftId, revision);
  if (record.operationId !== expected || (operationId && record.operationId !== operationId)) throw new Error("outbox identity mismatch");
  if (!("deleted" in record) && record.result && !hasSameRecipients(record.result, recipientsOf(record.draft))) throw new Error("outbox recipients mismatch");
  return record;
}

export function deleteDetails({ format, operationId, draftId, revision, messageId, retry, ...details }: OutboxIntent): z.infer<typeof deletedSchema> {
  return {
    format,
    operationId,
    draftId,
    revision,
    messageId,
    deleted: true,
    ...(retry && { retry: { parentOperationId: retry.parentOperationId, recipientKeys: recipientsOf(details.draft).map((address) => retryRecipientKey(retry.parentOperationId, address)) } }),
  };
}

const visibleDelivery = z.strictObject({
  message: z.strictObject({ source: z.literal("sent"), accountId: uuid, operationId: operationIdSchema, subject: z.string(), date: z.iso.datetime() }),
  internetId: messageId,
  delivery: z.strictObject({ operationId: operationIdSchema, recipients: z.array(smtpResultSchema.shape.recipients.element.pick({ address: true, state: true })) }),
  accepted: z.array(z.string()),
  from: z.string(),
});
export type VisibleDelivery = z.infer<typeof visibleDelivery>;

export function publicDelivery(record: OutboxIntent) {
  const published = new Set([...record.draft.to, ...record.draft.cc]);
  const recipients = record.result?.recipients.flatMap(({ address, state }) => (published.has(address) ? [{ address, state }] : [])) ?? [];
  return {
    delivery: { operationId: record.operationId, recipients },
    accepted: recipients.flatMap(({ address, state }) => (state === "accepted" ? [address] : [])),
    from: record.from.toLowerCase(),
  };
}

function indexDelivery(record: OutboxRecord): VisibleDelivery | null {
  if ("deleted" in record || !record.draft.accountId) return null;
  return {
    ...publicDelivery(record),
    message: {
      source: "sent",
      accountId: record.draft.accountId,
      operationId: record.operationId,
      subject: record.draft.subject,
      date: record.result?.finishedAt ?? record.claimedAt,
    },
    internetId: record.messageId,
  };
}

export class OutboxStorage {
  constructor(private readonly files: HuhuApi["vault"]["files"]) {}

  attachmentDigests(excludeAccountId?: string): string[] {
    const digests = new Set<string>();
    for (const record of this.records()) {
      if ("deleted" in record || (excludeAccountId && record.draft.accountId === excludeAccountId)) continue;
      for (const { digest } of record.draft.attachments ?? []) digests.add(digest);
    }
    return [...digests];
  }

  private operationIds(): string[] {
    let names: string[];
    try {
      names = readdirSync(this.files.abs(outboxDirectory));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw this.readFailure();
    }
    return names.flatMap((name) => {
      const operationId = name.endsWith(".json") && name.slice(0, -5);
      return operationId && operationIdSchema.safeParse(operationId).success ? [operationId] : [];
    });
  }

  *records(onBytes?: (path: string, bytes: Buffer) => void): IterableIterator<OutboxRecord> {
    for (const operationId of this.operationIds()) {
      const stored = this.read(operationId, onBytes);
      if (!stored) throw this.readFailure();
      yield stored.record;
    }
  }

  async *conversationMetadata(signal: AbortSignal): AsyncIterableIterator<{ stamp: string; value: VisibleDelivery }> {
    for (const operationId of this.operationIds()) {
      signal.throwIfAborted();
      const source = outboxRecordPath(operationId);
      const stamp = mailSourceStamp(this.files, source);
      if (!stamp) continue;
      const cached = readMailProjection(this.files, source, "sent", visibleDelivery.nullable());
      if (cached?.stamp === stamp && (!cached.value || cached.value.message.operationId === operationId)) {
        if (cached.value && mailSourceStamp(this.files, source) === stamp) yield { stamp, value: cached.value };
        continue;
      }
      let stored: ReturnType<OutboxStorage["read"]>;
      try {
        stored = this.read(operationId);
      } catch {
        // Keep one damaged delivery from hiding all other conversations.
        continue;
      }
      if (!stored || mailSourceStamp(this.files, source) !== stamp) continue;
      const value = indexDelivery(stored.record);
      await saveMailProjection(this.files, source, "sent", stamp, value);
      if (value) yield { stamp, value };
    }
  }

  async searchText(operationId: string, stamp: string, signal: AbortSignal, remember: boolean): Promise<string> {
    const source = outboxRecordPath(operationId);
    if (mailSourceStamp(this.files, source) !== stamp) return "";
    const cached = readMailProjection(this.files, source, "sent-search", z.string());
    if (cached?.stamp === stamp && mailSourceStamp(this.files, source) === stamp) return cached.value;
    try {
      const record = this.read(operationId)?.record;
      if (!record || "deleted" in record || mailSourceStamp(this.files, source) !== stamp) return "";
      const text = record.text.replace(/\s+/g, " ").trim();
      signal.throwIfAborted();
      if (remember) await saveMailProjection(this.files, source, "sent-search", stamp, text, signal);
      signal.throwIfAborted();
      return text;
    } catch {
      signal.throwIfAborted();
      return "";
    }
  }

  read(operationId: string, onBytes?: (path: string, bytes: Buffer) => void): { record: OutboxRecord; version: string } | null {
    try {
      const relative = outboxRecordPath(operationId);
      const file = this.files.read(relative);
      if (!file) return null;
      const record = parseOutboxRecord(JSON.parse(file.bytes.toString("utf8")), operationId);
      onBytes?.(relative, file.bytes);
      return { record, version: file.version };
    } catch {
      throw this.readFailure();
    }
  }

  async write(record: OutboxRecord, expectedVersion: string | null): Promise<{ version: string }> {
    try {
      const source = outboxRecordPath(record.operationId);
      const result = await this.files.write(source, Buffer.from(JSON.stringify(record) + "\n"), { expectedVersion });
      try {
        const stamp = mailSourceStamp(this.files, source);
        if (stamp && this.files.currentVersion(source) === result.version) {
          await saveMailProjection(this.files, source, "sent", stamp, indexDelivery(record));
          if ("deleted" in record) removeMailProjections(this.files, source, ["sent-search"]);
        }
      } catch {
        // No projection failure changes the authoritative delivery receipt.
      }
      return result;
    } catch {
      throw new HuhuError("INTERNAL", "无法保存邮件投递记录", { details: { reason: "outbox-write-failed" } });
    }
  }

  private readFailure(): HuhuError {
    return new HuhuError("INTERNAL", "无法读取邮件投递记录", { retryable: false, details: { reason: "outbox-read-failed" } });
  }
}
