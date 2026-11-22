export type ExitPhase = "checking" | "waiting" | "flushing";
export type ExitSaveSummary = { files: number; drafts: number };
export type ExitSaveOutcome = ExitSaveSummary & { failed?: true };
export type ExitSaveReceipt = ExitSaveSummary & { id: string };
export type ExitReply = ExitSaveOutcome | "stay";

export type PrepareExit = (requestId: number, report: (phase: ExitPhase) => void) => Promise<ExitReply>;
export type ReleaseExit = (requestId: number) => void;

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isExitSaveSummary(value: unknown): value is ExitSaveSummary {
  return value !== null && typeof value === "object" && "files" in value && "drafts" in value && isCount(value.files) && isCount(value.drafts);
}

export function isExitSaveOutcome(value: unknown): value is ExitSaveOutcome {
  return isExitSaveSummary(value) && (!("failed" in value) || value.failed === true);
}

export function isExitSaveReceipt(value: unknown): value is ExitSaveReceipt {
  return isExitSaveSummary(value) && "id" in value && typeof value.id === "string";
}

export function exitSaveMessage({ files, drafts }: ExitSaveSummary): string {
  return [files ? `已写入 ${files} 份文档。` : "", drafts ? `已保留 ${drafts} 份可恢复草稿。` : ""].filter(Boolean).join("");
}
