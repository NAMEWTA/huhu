import { isSyncAuthError, SyncAuthFailure, type LegacyAuth, type VersioningAuth } from "./remote-auth.js";

export type AutoMode = "off" | "follow" | "full";
export type RunMode = "pull" | "sync";

export interface AutoSyncConfig {
  mode: AutoMode;
  pullIntervalSec: number;
  pushIntervalSec: number;
}

export interface AutoSyncDeps {
  config(): AutoSyncConfig;
  run(mode: RunMode, isCurrent: () => boolean, repair?: VersioningAuth): Promise<unknown>;
  authTarget?(): string | null;
  canRun?(): boolean;
  hasConflict(): boolean;
  schedule(fn: () => void, ms: number): () => void;
  onChange?(state: AutoSyncState): void;
}

export interface AutoSyncState {
  active: boolean;
  pausedReason: "conflict" | "auth-failed" | null;
  failures: number;
}

export const MIN_INTERVAL_SEC = 30;
export const MAX_INTERVAL_SEC = 3600;
const MAX_BACKOFF_MS = MAX_INTERVAL_SEC * 1000;

const codeOf = (e: unknown): string => (e && typeof e === "object" && "code" in e ? String(e.code) : "");

export class AutoSync {
  private timers: Partial<Record<RunMode, () => void>> = {};
  private paused: AutoSyncState["pausedReason"] = null;
  private failures = 0;
  private running = false;
  private stopped = false;
  private generation = 0;
  private authFailure: SyncAuthFailure | undefined;
  private latestRevision: string | null | undefined;
  private repair: VersioningAuth | undefined;
  private repairTimer: (() => void) | undefined;

  constructor(private readonly d: AutoSyncDeps) {}

  state(): AutoSyncState {
    return { active: Object.keys(this.timers).length > 0, pausedReason: this.paused, failures: this.failures };
  }

  authPause() {
    const error = this.authFailure;
    if (!error) return undefined;
    const { scope, reason } = error;
    return { source: scope.source, target: scope.target, revision: scope.source === "versioning" ? scope.revision : null, reason };
  }

  restart(): void {
    this.stopped = false;
    this.generation++;
    this.paused = null;
    this.authFailure = undefined;
    this.clearRepair();
    this.failures = 0;
    this.arm();
  }

  stop(): void {
    this.stopped = true;
    this.generation++;
    this.clearRepair();
    this.clearTimers();
    this.d.onChange?.(this.state());
  }

  noteManualFailure(e: unknown): void {
    const code = codeOf(e);
    if (code === "GIT_CONFLICT") this.pause("conflict");
    else if (isSyncAuthError(code)) {
      if (e instanceof SyncAuthFailure) {
        const { scope } = e;
        if (this.d.authTarget && this.d.authTarget() !== scope.target) return;
        if (scope.source === "versioning" && this.latestRevision !== undefined && scope.revision !== this.latestRevision) return;
      }
      this.pause("auth-failed", e instanceof SyncAuthFailure ? e : undefined);
    }
  }

  configChanged(): void {
    if (!this.authFailure) return this.restart();
    if (this.repair && !this.recoveryMode(this.repair)) this.clearRepair();
    this.d.onChange?.(this.state());
  }

  credentialsChanged(previous: string | null, next: VersioningAuth, replaced: boolean): void {
    // 凭据记录的修订链包含 keep 和 clear，只有实际替换可以排队恢复。
    if (this.latestRevision !== undefined && this.latestRevision !== previous) return;
    const scope = this.authFailure?.scope;
    const followsFailedRevision = scope?.source === "legacy-safe" || this.latestRevision !== undefined || scope?.revision === previous;
    this.latestRevision = next.revision;
    this.clearRepair();
    if (replaced && followsFailedRevision && scope?.target === next.target && this.recoveryMode(next)) {
      this.repair = next;
      this.scheduleRepair();
    }
  }

  legacyUnlocked(legacyAuth: () => LegacyAuth | null): void {
    const failed = this.authFailure;
    const scope = failed?.scope;
    if (failed?.code !== "SAFE_LOCKED" || scope?.source !== "legacy-safe") return;
    const current = legacyAuth();
    if (current?.target === scope.target && current.reference === scope.reference) this.restart();
  }

  private clearRepair(): void {
    this.repairTimer?.();
    this.repairTimer = undefined;
    this.repair = undefined;
  }

  private recoveryMode(repair: VersioningAuth): RunMode | null {
    if (this.stopped || this.d.canRun?.() === false || this.d.hasConflict() || this.d.authTarget?.() !== repair.target || !repair.revision) return null;
    const { mode } = this.d.config();
    return mode === "full" ? "sync" : mode === "follow" ? "pull" : null;
  }

  private scheduleRepair(): void {
    const repair = this.repair;
    if (!repair || this.running || this.repairTimer) return;
    this.repairTimer = this.d.schedule(() => {
      if (this.repair !== repair) return;
      this.repairTimer = undefined;
      void this.recover(repair);
    }, 0);
  }

  private async recover(repair: VersioningAuth): Promise<void> {
    if (this.running) return;
    const mode = this.recoveryMode(repair);
    if (!mode) return this.clearRepair();
    const isCurrent = () => this.repair === repair && this.recoveryMode(repair) === mode;
    this.running = true;
    try {
      const ran = await this.d.run(mode, isCurrent, repair);
      if (this.repair === repair && ran === true) this.restart();
    } catch (e) {
      if (this.repair === repair) {
        const code = codeOf(e);
        if (isSyncAuthError(code) || code === "GIT_CONFLICT") this.noteManualFailure(e);
        else {
          this.paused = null;
          this.authFailure = undefined;
          this.failures = 1;
          this.arm();
        }
      }
    } finally {
      if (this.repair === repair) this.clearRepair();
      this.running = false;
      this.scheduleRepair();
    }
  }

  private clearTimers(): void {
    for (const cancel of Object.values(this.timers)) cancel();
    this.timers = {};
  }

  private pause(reason: NonNullable<AutoSyncState["pausedReason"]>, error?: SyncAuthFailure): void {
    this.generation++;
    this.paused = reason;
    this.authFailure = error;
    this.clearRepair();
    this.clearTimers();
    this.d.onChange?.(this.state());
  }

  private arm(): void {
    this.clearTimers();
    if (!this.stopped && !this.paused && this.d.canRun?.() !== false) {
      const { mode } = this.d.config();
      if (mode !== "off") {
        this.armOne("pull");
        if (mode === "full") this.armOne("sync");
      }
    }
    this.d.onChange?.(this.state());
  }

  private armOne(kind: RunMode): void {
    this.timers[kind]?.();
    delete this.timers[kind];
    const config = this.d.config();
    if (!this.allowed(kind, config.mode)) return;
    const raw = kind === "pull" ? config.pullIntervalSec : config.pushIntervalSec;
    const sec = Number.isFinite(raw) ? raw : kind === "pull" ? 30 : 60;
    const ms = Math.min(MAX_INTERVAL_SEC, Math.max(MIN_INTERVAL_SEC, Math.round(sec))) * 1000;
    const cancel = this.d.schedule(
      () => {
        if (this.timers[kind] !== cancel) return;
        delete this.timers[kind];
        void this.tick(kind);
      },
      Math.min(MAX_BACKOFF_MS, ms * 2 ** this.failures),
    );
    this.timers[kind] = cancel;
  }

  private allowed(kind: RunMode, mode: AutoMode): boolean {
    return mode === "full" || (mode === "follow" && kind === "pull");
  }

  private async tick(mode: RunMode): Promise<void> {
    if (this.stopped || this.paused || this.d.canRun?.() === false) return;
    if (!this.allowed(mode, this.d.config().mode)) return;
    if (this.d.hasConflict()) return this.pause("conflict");
    if (this.running) return this.armOne(mode);
    this.running = true;
    const generation = this.generation;
    const isCurrent = () => generation === this.generation && this.allowed(mode, this.d.config().mode);
    try {
      await this.d.run(mode, isCurrent);
      if (isCurrent()) this.failures = 0;
    } catch (e) {
      if (isCurrent()) {
        const code = codeOf(e);
        if (code === "GIT_CONFLICT" || isSyncAuthError(code)) this.noteManualFailure(e);
        else this.failures = Math.min(this.failures + 1, 7);
      }
    } finally {
      this.running = false;
      this.scheduleRepair();
    }
    if (isCurrent()) this.armOne(mode);
    this.d.onChange?.(this.state());
  }
}
