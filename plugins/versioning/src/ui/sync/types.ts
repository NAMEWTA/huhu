import type { PlanSummary } from "@huhu/contracts";
import type { SyncConfig } from "../../engine/sync.js";

export type Cfg = SyncConfig & { revision?: string; periodics?: { pull: PlanSummary | null; sync: PlanSummary | null } };

export type SyncStatus = { name: string; detail: string; pausedReason: "conflict" | "auth-failed" | null };
