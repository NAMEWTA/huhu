import type { PeriodicRunContext, PeriodicRunOutcome, PlanSummary } from "@huhu/contracts";
import { isSyncAuthError, SyncAuthFailure, type VersioningAuth } from "./remote-auth.js";

export type AutoMode = "off" | "follow" | "full";
export type RunMode = "pull" | "sync";

export interface AutoSyncConfig {
  mode: AutoMode;
  pullIntervalSec: number;
  pushIntervalSec: number;
}

export interface AutoSyncDeps {
  config(): AutoSyncConfig;
  run(mode: RunMode, isCurrent: () => boolean, signal: AbortSignal, repair?: VersioningAuth): Promise<boolean>;
  authTarget(): string | null;
  hasConflict(): boolean;
  wake(mode: RunMode): void;
  now?(): number;
  onChange?(): void;
}

export interface AutoSyncState {
  active: boolean;
  pausedReason: "conflict" | "auth-failed" | null;
  failures: number;
}

export const MIN_INTERVAL_SEC = 30;
export const MAX_INTERVAL_SEC = 3600;

const codeOf = (error: unknown): string => (error && typeof error === "object" && "code" in error ? String(error.code) : "");

/** Tracks Git execution eligibility and credential repair. Automations owns all wakeups. */
export class AutoSync {
  private paused: AutoSyncState["pausedReason"] = null;
  private failures = 0;
  private retryAt = 0;
  private authFailure: SyncAuthFailure | undefined;
  private latestRevision: string | null | undefined;
  private repair: VersioningAuth | undefined;

  constructor(private readonly d: AutoSyncDeps) {}

  state(): AutoSyncState {
    return { active: this.d.config().mode !== "off" && !this.paused, pausedReason: this.paused, failures: this.failures };
  }

  availability(mode: RunMode): PlanSummary["availability"] {
    if (this.d.hasConflict() || this.paused === "conflict") return { state: "blocked", reason: "domain-conflict", detail: "存在待解决的 Git 冲突" };
    if (this.paused === "auth-failed" && this.authFailure?.scope.target === this.d.authTarget() && (!this.repair || this.repairMode(this.repair) !== mode)) return { state: "blocked", reason: "credentials-unavailable" };
    if (this.retryAt > (this.d.now?.() ?? Date.now())) return { state: "blocked", reason: "domain-conflict", detail: "Git 正在等待重试" };
    return { state: "ready" };
  }

  authPause() {
    const error = this.authFailure;
    return error && { ...error.scope, reason: error.reason };
  }

  restart(): void {
    this.paused = null;
    this.authFailure = undefined;
    this.repair = undefined;
    this.failures = 0;
    this.retryAt = 0;
    this.d.onChange?.();
  }

  noteManualFailure(error: unknown): void {
    const code = codeOf(error);
    if (code === "GIT_CONFLICT") {
      this.paused = "conflict";
      this.authFailure = undefined;
    } else if (isSyncAuthError(code)) {
      if (error instanceof SyncAuthFailure) {
        const { scope } = error;
        if (this.d.authTarget() !== scope.target || (this.latestRevision !== undefined && scope.revision !== this.latestRevision)) return;
        this.authFailure = error;
      }
      this.paused = "auth-failed";
    } else return;
    this.repair = undefined;
    this.d.onChange?.();
  }

  configChanged(): void {
    if (!this.authFailure) this.restart();
    else if (this.repair && !this.repairMode(this.repair)) this.repair = undefined;
  }

  credentialsChanged(previous: string | null, next: VersioningAuth, replaced: boolean): void {
    if (this.latestRevision !== undefined && this.latestRevision !== previous) return;
    const failure = this.authFailure?.scope;
    const follows = this.latestRevision !== undefined || failure?.revision === previous;
    this.latestRevision = next.revision;
    this.repair = undefined;
    const mode = this.repairMode(next);
    if (replaced && follows && failure?.target === next.target && mode) {
      this.repair = next;
      this.d.wake(mode);
    }
    this.d.onChange?.();
  }

  private repairMode(repair: VersioningAuth): RunMode | null {
    if (!repair.revision || this.d.hasConflict() || this.d.authTarget() !== repair.target) return null;
    const { mode } = this.d.config();
    return mode === "full" ? "sync" : mode === "follow" ? "pull" : null;
  }

  async run(mode: RunMode, context: PeriodicRunContext): Promise<PeriodicRunOutcome | void> {
    const repair = this.repair && this.repairMode(this.repair) === mode ? this.repair : undefined;
    const isCurrent = () => context.isCurrent() && (!repair || this.repair === repair);
    try {
      const ran = await this.d.run(mode, isCurrent, context.signal, repair);
      if (!ran) return "skipped";
      if (ran && isCurrent()) this.restart();
    } catch (error) {
      if (isCurrent()) {
        const code = codeOf(error);
        if (code === "GIT_CONFLICT" || isSyncAuthError(code)) this.noteManualFailure(error);
        else {
          this.paused = null;
          this.authFailure = undefined;
          this.repair = undefined;
          this.failures = Math.min(this.failures + 1, 7);
          const { pullIntervalSec, pushIntervalSec } = this.d.config();
          this.retryAt = (this.d.now?.() ?? Date.now()) + 1_000 * Math.min(MAX_INTERVAL_SEC, (mode === "pull" ? pullIntervalSec : pushIntervalSec) * 2 ** this.failures);
        }
      }
      throw error;
    } finally {
      this.d.onChange?.();
    }
  }
}
