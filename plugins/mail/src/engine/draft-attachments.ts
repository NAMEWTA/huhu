import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readdirSync, readSync, unlinkSync } from "node:fs";
import { HuhuError } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";

export const MAX_DRAFT_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const maxDraftBytes = 2 * MAX_DRAFT_ATTACHMENT_BYTES;
const maxDraftAttachments = 100;
const objectsDir = ".huhu/mail/attachments";
export const attachmentDigest = z.hash("sha256", { enc: "hex" }).regex(/^[0-9a-f]+$/);
export const attachmentName = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((name) => !/[/\\\p{Cc}]/u.test(name) && name !== "." && name !== "..");
const attachmentSize = z.number().int().min(0).max(MAX_DRAFT_ATTACHMENT_BYTES);
const attachmentRef = z.strictObject({ digest: attachmentDigest, name: attachmentName, size: attachmentSize });
export const attachmentRefs = z
  .array(attachmentRef)
  .max(maxDraftAttachments)
  .refine((refs) => refs.reduce((total, ref) => total + ref.size, 0) <= maxDraftBytes && new Set(refs.map(({ digest }) => digest)).size === refs.length);
export const attachmentDetails = attachmentRef.extend({ state: z.enum(["ready", "missing", "corrupt", "unreadable"]) });
type Attachment = z.infer<typeof attachmentRef>;
type AttachmentRead = { state: "ready"; bytes: Buffer } | { state: "missing" | "corrupt" | "unreadable" };
type VaultFiles = HuhuApi["vault"]["files"];

/** A trusted host opens the selected file and supplies a bounded, cancellable byte source. */
export interface MailAttachmentSource {
  name: string;
  size: number;
  read(signal: AbortSignal): AsyncIterable<Uint8Array>;
}

export const attachmentObjectPath = (digest: string) => `${objectsDir}/${digest}`;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const missing = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";

function tooLarge() {
  return new HuhuError("INVALID_INPUT", "附件超过 25 MiB 上限", { details: { reason: "attachment-too-large", maxBytes: MAX_DRAFT_ATTACHMENT_BYTES } });
}

export function assertImportActive(signal: AbortSignal): void {
  if (signal.aborted) throw new HuhuError("INVALID_INPUT", "附件导入已取消", { details: { reason: "attachment-import-interrupted" } });
}

export async function readAttachmentSource(source: MailAttachmentSource, signal: AbortSignal): Promise<{ ref: Attachment; bytes: Buffer }> {
  assertImportActive(signal);
  const name = attachmentName.safeParse(source.name);
  if (source.size > MAX_DRAFT_ATTACHMENT_BYTES) throw tooLarge();
  const size = attachmentSize.safeParse(source.size);
  if (!name.success || !size.success) throw new HuhuError("INVALID_INPUT", "附件名称或大小无效", { details: { reason: "attachment-invalid-source" } });
  const bytes = Buffer.alloc(size.data);
  let received = 0;
  try {
    for await (const chunk of source.read(signal)) {
      assertImportActive(signal);
      if (received + chunk.byteLength > MAX_DRAFT_ATTACHMENT_BYTES) throw tooLarge();
      if (received + chunk.byteLength > bytes.length) throw new HuhuError("INVALID_INPUT", "附件大小与选取时不符", { details: { reason: "attachment-size-mismatch", expectedBytes: bytes.length } });
      bytes.set(chunk, received);
      received += chunk.byteLength;
    }
  } catch (error) {
    assertImportActive(signal);
    if (error instanceof HuhuError) throw error;
    if (missing(error)) throw new HuhuError("NOT_FOUND", "选取的附件已不存在", { details: { reason: "attachment-source-missing" } });
    throw new HuhuError("INTERNAL", "附件读取中断", { details: { reason: "attachment-import-interrupted", receivedBytes: received } });
  }
  assertImportActive(signal);
  if (received !== bytes.length) {
    throw new HuhuError("INVALID_INPUT", "附件读取提前结束", { details: { reason: "attachment-import-interrupted", receivedBytes: received, expectedBytes: bytes.length } });
  }
  return { ref: { name: name.data, size: bytes.length, digest: sha256(bytes) }, bytes };
}

export function assertAttachmentCapacity(refs: Attachment[], next: Attachment): void {
  if (refs.length >= maxDraftAttachments || refs.reduce((total, ref) => total + ref.size, next.size) > maxDraftBytes) {
    throw new HuhuError("INVALID_INPUT", "邮件草稿的附件超过数量或总大小上限", {
      details: { reason: "draft-attachment-limit", maxCount: maxDraftAttachments, maxBytes: maxDraftBytes },
    });
  }
}

export class DraftAttachmentObjects {
  constructor(private readonly files: VaultFiles) {}

  read({ size, digest }: Attachment): AttachmentRead {
    try {
      const descriptor = openSync(this.files.abs(attachmentObjectPath(digest)), "r");
      try {
        const stat = fstatSync(descriptor);
        if (!stat.isFile() || stat.size !== size) return { state: "corrupt" };
        const bytes = Buffer.alloc(size);
        let offset = 0;
        while (offset < size) {
          const read = readSync(descriptor, bytes, offset, size - offset, offset);
          if (read === 0) return { state: "corrupt" };
          offset += read;
        }
        if (fstatSync(descriptor).size !== size || sha256(bytes) !== digest) return { state: "corrupt" };
        return { state: "ready", bytes };
      } finally {
        closeSync(descriptor);
      }
    } catch (error) {
      return { state: missing(error) ? "missing" : "unreadable" };
    }
  }

  async publish(ref: Attachment, bytes: Buffer): Promise<void> {
    if (this.read(ref).state === "ready") return;
    try {
      await this.files.write(attachmentObjectPath(ref.digest), bytes);
    } catch {
      throw new HuhuError("INTERNAL", "无法保存附件字节", { details: { reason: "attachment-write-failed", digest: ref.digest } });
    }
  }

  sweep(referenced: ReadonlySet<string>, candidates?: ReadonlySet<string>): { removed: string[]; failed: string[] } {
    const removed: string[] = [];
    const failed: string[] = [];
    try {
      for (const entry of readdirSync(this.files.abs(objectsDir), { withFileTypes: true })) {
        if (!entry.isFile() || !attachmentDigest.safeParse(entry.name).success || referenced.has(entry.name) || (candidates && !candidates.has(entry.name))) continue;
        try {
          unlinkSync(this.files.abs(attachmentObjectPath(entry.name)));
          removed.push(entry.name);
        } catch (error) {
          if (!missing(error)) failed.push(entry.name);
        }
      }
    } catch (error) {
      if (!missing(error)) throw new HuhuError("INTERNAL", "无法检查待回收附件", { details: { reason: "attachment-sweep-failed" } });
    }
    return { removed, failed };
  }
}
