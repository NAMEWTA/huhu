import type { Draft } from "./engine/drafts.js";

export const MAX_DRAFT_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export type DraftAttachmentState = Pick<Draft, "draftId" | "revision" | "attachments">;

export interface SelectDraftAttachment {
  operationId: string;
  vaultId: string;
  draftId: string;
  expectedRevision: string;
}

export type DraftAttachmentError = "too-large" | "draft-limit" | "source-missing" | "interrupted" | "conflict" | "unavailable" | "failed";

export type SelectDraftAttachmentResult = { status: "cancelled" } | { status: "attached"; draft: DraftAttachmentState; deduped: boolean } | { status: "failed"; reason: DraftAttachmentError };

/** Exposed by Electron as window.huhuHost.mailDraftAttachments. No paths or bytes cross this bridge. */
export interface DesktopDraftAttachmentHost {
  selectAndAdd(input: SelectDraftAttachment): Promise<SelectDraftAttachmentResult>;
  cancel(operationId: string): Promise<void>;
}

/** Main-to-Engine input sent only over the private utility process channel. */
export interface SelectedAttachmentFile {
  path: string;
  name: string;
  size: number;
  fingerprint: string;
}

export interface PrivateMailAttachmentRequest {
  type: "mail-attachment:add";
  vaultId: string;
  draftId: string;
  expectedRevision: string;
  file: SelectedAttachmentFile;
}

export function selectedFileFingerprint(stat: { dev: bigint; ino: bigint; ctimeNs: bigint; mtimeNs: bigint }): string {
  return `${stat.dev}:${stat.ino}:${stat.ctimeNs}:${stat.mtimeNs}`;
}
