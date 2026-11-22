export type ExitPhase = "checking" | "waiting" | "flushing";
export type ExitSaveSummary = { files: number; drafts: number };
export type ExitReply = ExitSaveSummary | "stay";

export type PrepareExit = (requestId: number, report: (phase: ExitPhase) => void) => Promise<ExitReply>;
export type ReleaseExit = (requestId: number) => void;

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isExitSaveSummary(value: unknown): value is ExitSaveSummary {
  return value !== null && typeof value === "object" && "files" in value && "drafts" in value && isCount(value.files) && isCount(value.drafts);
}

export function exitSaveMessage({ files, drafts }: ExitSaveSummary): string {
  return [files ? `已写入 ${files} 份文档。` : "", drafts ? `已保留 ${drafts} 份可恢复草稿。` : ""].filter(Boolean).join("");
}
