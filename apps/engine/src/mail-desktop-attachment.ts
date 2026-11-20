import { constants, type BigIntStats } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { HuhuError } from "@huhu/contracts";
import { selectedFileFingerprint, type DraftAttachmentError, type PrivateMailAttachmentRequest, type SelectDraftAttachmentResult, type SelectedAttachmentFile } from "@huhu/plugin-mail/desktop-attachments";
import type { MailDraftAttachments } from "@huhu/plugin-mail/engine";

function assertSelected(stat: BigIntStats, source: SelectedAttachmentFile) {
  if (!stat.isFile() || stat.size !== BigInt(source.size) || selectedFileFingerprint(stat) !== source.fingerprint) {
    throw new HuhuError("INVALID_INPUT", "所选附件已变化，请重新选择", { details: { reason: "attachment-import-interrupted" } });
  }
}

function failure(error: unknown): DraftAttachmentError {
  if (!(error instanceof HuhuError)) return "failed";
  if (error.code === "VERSION_CONFLICT") return "conflict";
  switch ((error.details as { reason?: string } | undefined)?.reason) {
    case "attachment-too-large":
      return "too-large";
    case "draft-attachment-limit":
      return "draft-limit";
    case "attachment-source-missing":
      return "source-missing";
    case "attachment-import-interrupted":
      return "interrupted";
    default:
      return error.code === "NOT_FOUND" ? "conflict" : "failed";
  }
}

export async function addDesktopMailAttachment(manager: MailDraftAttachments | undefined, request: PrivateMailAttachmentRequest, signal: AbortSignal): Promise<SelectDraftAttachmentResult> {
  if (!manager) return { status: "failed", reason: "unavailable" };
  const { draftId, expectedRevision, file } = request;
  if (!path.isAbsolute(file.path) || !Number.isSafeInteger(file.size) || file.size < 0) return { status: "failed", reason: "failed" };
  try {
    const { draft, deduped } = await manager.addAttachment(
      { draftId, expectedRevision },
      {
        name: file.name,
        size: file.size,
        async *read(active) {
          active.throwIfAborted();
          const handle = await open(file.path, constants.O_RDONLY | constants.O_NONBLOCK);
          try {
            assertSelected(await handle.stat({ bigint: true }), file);
            yield* handle.createReadStream({ autoClose: false, signal: active });
            assertSelected(await handle.stat({ bigint: true }), file);
          } finally {
            await handle.close();
          }
        },
      },
      signal,
    );
    return { status: "attached", draft: { draftId, revision: draft.revision, attachments: draft.attachments }, deduped };
  } catch (error) {
    return signal.aborted ? { status: "cancelled" } : { status: "failed", reason: failure(error) };
  }
}
