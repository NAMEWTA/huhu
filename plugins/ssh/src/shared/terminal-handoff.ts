export type SshHandoffMode = "control" | "observe";

export type SshHandoffRequest = { type: "handoff.prepare"; operationId: string } | { type: "handoff.claim"; ticket: string; cols?: number; rows?: number } | { type: "handoff.commit" | "handoff.cancel"; ticket: string };

export type SshHandoffCancelReason = "cancelled" | "expired" | "source-closed" | "target-closed" | "shell-ended" | "source-changed" | "target-backpressure";
export type SshHandoffFailure = "not-allowed" | "malformed" | "busy" | "invalid-ticket" | "target-required" | "wrong-role";

export type SshHandoffOutcome =
  | { type: "handoff.committed"; operationId: string; ticket: string; sourceMode: "observe"; targetMode: SshHandoffMode }
  | { type: "handoff.cancelled"; operationId: string; ticket: string; reason: SshHandoffCancelReason };

export type SshHandoffEvent =
  | { type: "handoff.prepared"; operationId: string; ticket: string; expiresAt: number; targetMode: SshHandoffMode }
  | { type: "handoff.claimed"; operationId: string; ticket: string; targetMode: "observe" }
  | { type: "handoff.failed"; request: SshHandoffRequest["type"]; reason: SshHandoffFailure; operationId?: string; ticket?: string }
  | SshHandoffOutcome;
