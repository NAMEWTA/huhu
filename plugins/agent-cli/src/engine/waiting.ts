import { existsSync } from "node:fs";
import { subscribeEvents, type EventSubscription } from "@huhu/herdr-client";
import type { ProgramStatus, SessionRecord, SessionsService } from "./sessions.js";

interface TerminalRecord {
  address?: string;
  labels?: Record<string, string>;
  status?: ProgramStatus | null;
  state?: string;
}

export interface WaitingWatcherDeps {
  endpoint: string;
  vaultId: string;
  sessions: SessionsService;
  /** 会话第一次或再次进入 blocked（发生标识 = `<会话 id>:<n>`）。处理失败不影响订阅；下一次重连的快照会重试尚未完成的发生。 */
  onBlocked(session: SessionRecord): Promise<void>;
  /** 测试用：缩短重连间隔。 */
  backoffMs?: { min: number; max: number };
}

/**
 * 订阅 Herdr Core 的终端事件，把程序经 OSC 7501 上报的 blocked 状态转成“需要你操作”：
 * 断线后按指数退避重连，重连成功后用订阅快照对账一次；Core 不存在时不启动它，只等它出现。
 */
export class WaitingWatcher {
  private sub: EventSubscription | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private delay: number;
  private readonly range: { min: number; max: number };

  constructor(private readonly d: WaitingWatcherDeps) {
    this.range = d.backoffMs ?? { min: 1000, max: 30_000 };
    this.delay = this.range.min;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.attempt();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.sub?.close();
    this.sub = null;
  }

  /** 立刻重试（刚启动了第一个会话、Core 刚出现时由调用方触发）。 */
  poke(): void {
    if (this.stopped || this.sub) return;
    if (this.timer) clearTimeout(this.timer);
    this.attempt();
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => this.attempt(), this.delay);
    this.delay = Math.min(this.delay * 2, this.range.max);
  }

  private attempt(): void {
    this.timer = null;
    if (this.stopped) return;
    // Core 还没启动（没有人开过终端）：不替用户启动它，稍后再看
    if (process.platform !== "win32" && !existsSync(this.d.endpoint)) return this.schedule();
    subscribeEvents(this.d.endpoint, {
      labels: { "huhu.vault": this.d.vaultId },
      onEvent: (e) => void this.onEvent(e),
      onLost: () => {
        this.sub = null;
        this.schedule();
      },
    }).then(
      async (sub) => {
        if (this.stopped) return sub.close();
        this.sub = sub;
        this.delay = this.range.min;
        await this.reconcile(sub.snapshot.terminals as TerminalRecord[]); // 订阅之后读快照：断线期间发生的 blocked 在这里补上
      },
      () => this.schedule(),
    );
  }

  private sessionOf(t: TerminalRecord): SessionRecord | null {
    const id = t.labels?.["huhu.session"];
    if (!id || !t.address) return null;
    return this.d.sessions.byTerminal(t.address, id);
  }

  private async reconcile(terminals: TerminalRecord[]): Promise<void> {
    for (const t of terminals) {
      const sess = this.sessionOf(t);
      if (!sess) continue;
      if (t.state === "finished") this.d.sessions.expireWaiting(sess.id);
      else await this.apply(sess.id, t.status ?? null);
    }
    // 订阅快照里已经没有的终端：对应会话里残留的等待标为过期
    const live = new Set(terminals.map((t) => t.address));
    for (const s of this.d.sessions.list()) if (s.waiting?.active && s.terminalId && !live.has(s.terminalId)) this.d.sessions.expireWaiting(s.id);
  }

  private async apply(sessionId: string, status: ProgramStatus | null): Promise<void> {
    try {
      const r = this.d.sessions.applyStatus(sessionId, status);
      const w = r.session.waiting;
      // 进入 blocked，或上次处理失败（handled 落后于 n）：重试。onBlocked 内部的评论 / 任务都是幂等的
      if (status?.state === "blocked" && w?.active && w.handled !== w.n) {
        await this.d.onBlocked(r.session);
        this.d.sessions.markWaitingHandled(sessionId, w.n);
      }
    } catch {
      /* 处理失败（tasks 未启用、会话记录读写失败）：保持 handled 不变，下次快照或事件再试 */
    }
  }

  private async onEvent(e: { type: string; terminal?: string; data?: unknown }): Promise<void> {
    if (!e.terminal) return;
    const sess = this.d.sessions.byTerminal(e.terminal);
    if (!sess) return;
    if (e.type === "status") {
      const data = e.data as { status?: ProgramStatus | null } | undefined;
      await this.apply(sess.id, data?.status ?? null);
    } else if (e.type === "finished" || e.type === "removed") this.d.sessions.expireWaiting(sess.id);
  }
}
