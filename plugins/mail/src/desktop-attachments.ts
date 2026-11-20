import type { Draft } from "./engine/drafts.js";

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
