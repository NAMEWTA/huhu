import { createHash, randomUUID } from "node:crypto";
import { errors } from "@huhu/contracts";
import type { OpStep } from "@huhu/vault";
import type { z } from "zod";
import { maxAttachmentBytes, type Attachment, type AttachmentRead, type UploadAttachment } from "../shared/entries.js";
import { findRecord } from "./records.js";
import { attachmentPath, type BookState, type LedgerStore } from "./store.js";

const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");

export function uploadAttachment(state: BookState, steps: OpStep[], input: z.infer<typeof UploadAttachment>): Attachment {
  const record = findRecord(state, input.recordId, input.recordRevision);
  const bytes = Buffer.from(input.base64, "base64");
  if (!bytes.length || bytes.length > maxAttachmentBytes || bytes.toString("base64") !== input.base64) {
    throw errors.invalidInput("凭证必须为不超过 2 MiB 的有效文件");
  }
  if (record.attachmentIds.length >= 20) throw errors.invalidInput("每笔流水最多关联 20 份凭证");
  const attachment: Attachment = {
    id: randomUUID(), fileName: input.fileName, mediaType: input.mediaType,
    size: bytes.length, sha256: digest(bytes),
  };
  steps.push({ action: "write", path: attachmentPath(state.book.id, attachment.id), bytes, expectedVersion: null });
  state.attachments.push(attachment);
  record.attachmentIds.push(attachment.id);
  record.revision = randomUUID();
  return attachment;
}

export function readAttachment(store: LedgerStore, state: BookState, attachmentId: string): z.infer<typeof AttachmentRead> {
  const attachment = state.attachments.find((entry) => entry.id === attachmentId);
  if (!attachment || !state.records.some((record) => record.attachmentIds.includes(attachmentId))) throw errors.notFound("找不到账本凭证");
  const data = store.files.read(attachmentPath(state.book.id, attachment.id));
  if (!data || data.bytes.length !== attachment.size || digest(data.bytes) !== attachment.sha256) return { status: "missing", attachment };
  return { status: "available", attachment, base64: data.bytes.toString("base64") };
}
