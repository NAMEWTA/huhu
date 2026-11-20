export type ExitPhase = "checking" | "waiting" | "flushing";
export type ExitReply = boolean | "stay";

export type PrepareExit = (requestId: number, report: (phase: ExitPhase) => void) => Promise<ExitReply>;
export type ReleaseExit = (requestId: number) => void;
