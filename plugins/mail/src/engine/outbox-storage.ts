import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { HuhuError } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { storedDraftContent, uuid, type StoredDraftContent } from "./draft-content.js";
import { smtpResultSchema, type MailSmtpResult } from "./smtp.js";

const outboxDirectory = ".huhu/mail/outbox";
export const operationIdSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const messageId = z.string().regex(/^<[0-9a-f-]{36}@huhu\.local>$/);
const identity = z.strictObject({ format: z.literal(1), operationId: operationIdSchema, draftId: uuid, revision: uuid, messageId });
export const lineage = z.strictObject({ parentOperationId: operationIdSchema, parentMessageId: messageId, originalOperationId: operationIdSchema, originalMessageId: messageId });
const intentSchema = identity.extend({
  retry: lineage.optional(),
  claimedAt: z.iso.datetime(),
  from: z.email(),
  auth: z.enum(["password", "app-password"]),
  smtp: z.strictObject({ host: z.string().min(1), port: z.number().int().min(1).max(65_535), security: z.enum(["tls", "starttls", "none"]) }),
  draft: storedDraftContent,
  text: z.string().max(2 * 1024 * 1024),
  result: smtpResultSchema.safeExtend({ finishedAt: z.iso.datetime() }).nullable(),
});
const deletedSchema = identity.extend({ deleted: z.literal(true), retry: z.strictObject({ parentOperationId: operationIdSchema, recipientKeys: z.array(operationIdSchema).min(1).max(3_000) }).optional() });
const recordSchema = z.union([deletedSchema, intentSchema]);
export type OutboxIntent = z.infer<typeof intentSchema>;
export type OutboxRecord = z.infer<typeof recordSchema>;

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

export function deleteDetails({ format, operationId, draftId, revision, messageId, retry, ...details }: OutboxIntent): OutboxRecord {
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

export class OutboxStorage {
  constructor(private readonly files: HuhuApi["vault"]["files"]) {}

  *records(): IterableIterator<OutboxRecord> {
    let names: string[];
    try {
      names = readdirSync(this.files.abs(outboxDirectory));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw this.readFailure();
    }
    for (const name of names) {
      const operationId = name.endsWith(".json") && name.slice(0, -5);
      if (!operationId || !operationIdSchema.safeParse(operationId).success) continue;
      const stored = this.read(operationId);
      if (!stored) throw this.readFailure();
      yield stored.record;
    }
  }

  read(operationId: string): { record: OutboxRecord; version: string } | null {
    try {
      const file = this.files.read(`${outboxDirectory}/${operationId}.json`);
      if (!file) return null;
      const record = recordSchema.parse(JSON.parse(file.bytes.toString("utf8")));
      const { draftId, revision, retry } = record;
      const expected = retry ? retryOperationIdFor(retry.parentOperationId, draftId, revision, selectedRecipientKeys(record)) : operationIdFor(draftId, revision);
      if (record.operationId !== operationId || expected !== operationId) throw new Error("outbox identity mismatch");
      if (!("deleted" in record) && record.result && !hasSameRecipients(record.result, recipientsOf(record.draft))) throw new Error("outbox recipients mismatch");
      return { record, version: file.version };
    } catch {
      throw this.readFailure();
    }
  }

  async write(record: OutboxRecord, expectedVersion: string | null): Promise<{ version: string }> {
    try {
      return await this.files.write(`${outboxDirectory}/${record.operationId}.json`, Buffer.from(JSON.stringify(record) + "\n"), { expectedVersion });
    } catch {
      throw new HuhuError("INTERNAL", "无法保存邮件投递记录", { details: { reason: "outbox-write-failed" } });
    }
  }

  private readFailure(): HuhuError {
    return new HuhuError("INTERNAL", "无法读取邮件投递记录", { retryable: false, details: { reason: "outbox-read-failed" } });
  }
}
