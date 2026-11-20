export type { SyncConfig as Cfg } from "../../engine/sync.js";

export type SyncStatus = { name: string; detail: string; pausedReason: "conflict" | "auth-failed" | null };
