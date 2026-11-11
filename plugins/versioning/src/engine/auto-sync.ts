/** 自动同步调度器：按模式与间隔定时拉取/推送；认证失败或冲突后暂停；其他失败指数退避。时钟与同步函数都可注入，便于单测。 */
export type AutoMode = "off" | "follow" | "full";
export type RunMode = "pull" | "sync";

export interface AutoSyncConfig { mode: AutoMode; pullIntervalSec: number; pushIntervalSec: number }

export interface AutoSyncDeps {
  config(): AutoSyncConfig;
  /** 执行一次同步；失败抛出带 code 的错误。 */
  run(mode: RunMode): Promise<unknown>;
  /** 是否已有未解决的冲突（有则不自动同步）。 */
  hasConflict(): boolean;
  schedule(fn: () => void, ms: number): () => void;
  onChange?(state: AutoSyncState): void;
}

export interface AutoSyncState { active: boolean; pausedReason: "conflict" | "auth-failed" | null; failures: number }

export const MIN_INTERVAL_SEC = 30;
export const MAX_INTERVAL_SEC = 3600;
const MAX_BACKOFF_MS = MAX_INTERVAL_SEC * 1000;

/** 需要用户去重新配置凭据的错误（含保险箱锁定/引用失效）。 */
const AUTH_CODES = new Set(["GIT_AUTH_FAILED", "SAFE_LOCKED", "SECRET_REF_INVALID"]);
const codeOf = (e: unknown): string => (e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "");

export class AutoSync {
  private timers: Partial<Record<RunMode, () => void>> = {};
  private paused: AutoSyncState["pausedReason"] = null;
  private failures = 0;
  private running = false;
  private stopped = false;

  constructor(private readonly d: AutoSyncDeps) {}

  state(): AutoSyncState {
    return { active: Object.keys(this.timers).length > 0, pausedReason: this.paused, failures: this.failures };
  }

  /** 配置变化、手动同步成功、冲突解决/放弃之后调用：清除暂停与退避并按当前配置重新排程。 */
  restart(): void {
    this.stopped = false;
    this.paused = null;
    this.failures = 0;
    this.arm();
  }

  stop(): void {
    this.stopped = true;
    this.clear();
    this.d.onChange?.(this.state());
  }

  /** 手动同步失败时通知：认证失败/冲突同样会让自动同步暂停。 */
  noteManualFailure(e: unknown): void {
    const c = codeOf(e);
    if (c === "GIT_CONFLICT") this.pause("conflict");
    else if (AUTH_CODES.has(c)) this.pause("auth-failed");
  }

  private clear(): void {
    for (const k of Object.keys(this.timers) as RunMode[]) { this.timers[k]?.(); delete this.timers[k]; }
  }

  private pause(reason: NonNullable<AutoSyncState["pausedReason"]>): void {
    this.paused = reason;
    this.clear();
    this.d.onChange?.(this.state());
  }

  private arm(): void {
    this.clear();
    if (!this.stopped && !this.paused) {
      const c = this.d.config();
      if (c.mode !== "off") {
        this.armOne("pull");
        if (c.mode === "full") this.armOne("sync");
      }
    }
    this.d.onChange?.(this.state());
  }

  /** 拉取与推送各有自己的定时器（规格：独立间隔）；一方触发只重排自己的，不重置另一方。 */
  private armOne(kind: RunMode): void {
    this.timers[kind]?.();
    delete this.timers[kind];
    const c = this.d.config();
    if (!this.allowed(kind, c.mode)) return; // tick 进行中改了模式：不再为不属于新模式的一方续排
    const raw = kind === "pull" ? c.pullIntervalSec : c.pushIntervalSec;
    const sec = Number.isFinite(raw) ? raw : kind === "pull" ? 30 : 60; // 手改配置文件写出非数字时不能变成 1ms 的紧循环
    const ms = Math.min(MAX_INTERVAL_SEC, Math.max(MIN_INTERVAL_SEC, Math.round(sec))) * 1000;
    this.timers[kind] = this.d.schedule(() => void this.tick(kind), Math.min(MAX_BACKOFF_MS, ms * 2 ** this.failures));
  }

  private allowed(kind: RunMode, mode: AutoMode): boolean {
    return mode === "full" || (mode === "follow" && kind === "pull");
  }

  private async tick(mode: RunMode): Promise<void> {
    if (this.stopped || this.paused) return;
    if (!this.allowed(mode, this.d.config().mode)) return; // 模式已改：这一方不再执行
    if (this.d.hasConflict()) return this.pause("conflict");
    if (this.running) return this.armOne(mode); // 上一次还没结束：跳过这一拍
    this.running = true;
    try {
      await this.d.run(mode);
      this.failures = 0;
    } catch (e) {
      const c = codeOf(e);
      if (c === "GIT_CONFLICT") this.pause("conflict");
      else if (AUTH_CODES.has(c)) this.pause("auth-failed");
      else this.failures = Math.min(this.failures + 1, 7); // 离线等：退避（30 秒起翻 7 次即封顶 3600 秒）
    } finally {
      this.running = false;
    }
    if (this.stopped || this.paused) { this.d.onChange?.(this.state()); return; }
    this.armOne(mode);
    this.d.onChange?.(this.state());
  }
}
