import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors, newId } from "@huhu/contracts";
import { HerdrError, type HerdrClient } from "@huhu/herdr-client";
import { isValidNativeId, isWithin } from "./history/scanner.js";
import { agentById, type AgentId } from "../shared/catalog.js";
import { redactSecrets, shellCommand, type ShellName } from "../shared/shell.js";
import type { ResolvedLaunch, ResolveInput } from "./launch.js";
import type { SpaceStore } from "./spaces.js";

export interface SessionRecord {
  id: string;
  spaceId: string;
  provider: AgentId | "shell";
  model: string | null;
  state: "launching" | "running" | "exited" | "failed" | "unknown";
  /** state=exited：程序的退出码（拿不到为 null）与结束时间。 */
  exitCode?: number | null;
  exitedAt?: string;
  requestId: string;
  terminalId: string | null;
  name: string;
  cwd: string;
  createdAt: string;
  /** 由历史恢复启动时记录 provider 原生会话 id。 */
  nativeSessionId?: string;
  /** 终端命令会话（automations 的 terminal 动作）：显示用，不含环境变量。 */
  command?: string;
  /** 启动时带了保险箱环境变量（只存布尔，不存值）：输出读取与终端清理都以它为准，不信任调用方的声明。 */
  hasEnv?: boolean;
  /** 变更审查意见（随会话记录保存）。 */
  reviewComments?: ReviewComment[];
  /** 程序经 OSC 7501 上报 blocked（等人工）的状态；`n` 是第几次进入 blocked，发生标识 = `<会话 id>:<n>`，重连、重启 Engine 不会重复处理。 */
  waiting?: WaitingInfo;
  error?: string;
}

export interface ReviewComment {
  id: string;
  path: string;
  side: "old" | "new";
  line: number;
  text: string;
  createdAt: string;
  sentAt: string | null;
  /** 正在发送：崩溃后停留在这个状态说明“是否已送达未知”，需要用户明确选择再发。 */
  sending?: boolean;
}

export interface WaitingInfo {
  n: number;
  /** 当前是否仍在等待。 */
  active: boolean;
  /** 终端结束时仍未解除：提示过期。 */
  expired?: boolean;
  kind: string | null;
  msg: string | null;
  app: string | null;
  since: string;
  /** 独立会话自动建立的 human 任务。 */
  taskId?: string;
  /** 已完成通知 / 评论的最近一次发生（等于 n 表示这次已处理；不等说明上次处理失败，重连后重试）。 */
  handled?: number;
}
export interface ProgramStatus {
  state: string;
  kind?: string | null;
  msg?: string | null;
  app?: string | null;
}

const MAX_COMMENTS = 200;
const hasControl = (s: string): boolean => {
  for (const ch of s) {
    const n = ch.codePointAt(0) as number;
    if (n < 0x20 || (n >= 0x7f && n <= 0x9f)) return true;
  }
  return false;
};
/** 写进终端的路径：只保留字母数字（含中文等）和 . _ - / @ + ~ 空格，其余一律换成 _（文件名里的 ; $ ` | 等不能被 shell 解释）。 */
const safePath = (p: string): string => Array.from(p, (ch) => (/[\p{L}\p{N}._\-/@+~ ]/u.test(ch) ? ch : "_")).join("");
/** C0、DEL 与 C1 控制字符（如 U+009B）都不进终端：替换成空格并压缩空白。 */
const noControl = (s: string): string =>
  Array.from(s, (ch) => {
    const c = ch.codePointAt(0) as number;
    return c < 0x20 || (c >= 0x7f && c <= 0x9f) ? " " : ch;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();

export interface LaunchInput {
  spaceId: string;
  spaceRevision: number;
  provider: AgentId | "shell";
  model?: string | undefined;
  effort?: string | undefined;
  fast?: boolean | undefined;
  prompt?: string | undefined;
  requestId: string;
  /** 恢复历史会话（仅内部调用：id 来自对历史的扫描结果，不由外部直接传入）。 */
  resumeSessionId?: string | undefined;
  /** 恢复时在原会话的 cwd 启动（必须在 Space 根之内）。 */
  cwd?: string | undefined;
  /** 终端命令（只与 provider=shell 一起用）：以 `argv = [shell, -c, command]` 运行，能拿到退出码。 */
  command?: string | undefined;
  shell?: ShellName | undefined;
  /** 已由调用方（引擎侧）从保险箱解析好的环境变量；只传给 terminal.run，不落盘、不回显。 */
  env?: Record<string, string> | undefined;
}

interface Terminal {
  address: string;
}
interface RunResult {
  address: string;
}

export interface SessionsDeps {
  dir: string;
  vaultId: string;
  spaces: SpaceStore;
  core(): Promise<HerdrClient>;
  /** 只读检查用：Core 在运行才返回客户端，不启动它（缺省退回 core()）。 */
  peekCore?(): Promise<HerdrClient | "absent" | null>;
  /** 合成启动命令（agent-cli 的 resolveAgentLaunch，已绑定当前 Vault 的设置与检测结果）。 */
  resolve(input: ResolveInput): Promise<ResolvedLaunch>;
  now(): Date;
}

/** 交互会话：先持久化记录，再 terminal.run；响应丢失时按 huhu.launch 标签找回，绝不重复 run。 */
export class SessionsService {
  constructor(private readonly d: SessionsDeps) {}

  private file(id: string): string {
    return path.join(this.d.dir, `${id}.json`);
  }
  private save(s: SessionRecord): void {
    mkdirSync(this.d.dir, { recursive: true });
    const tmp = `${this.file(s.id)}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(s, null, 2));
    renameSync(tmp, this.file(s.id)); // 原子替换：崩溃时不会留下写到一半的记录（“发送中”标记依赖它）
  }

  list(spaceId?: string): SessionRecord[] {
    if (!existsSync(this.d.dir)) return [];
    return readdirSync(this.d.dir)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => {
        try {
          return [JSON.parse(readFileSync(path.join(this.d.dir, f), "utf8")) as SessionRecord];
        } catch {
          return [];
        }
      }) // 单个记录损坏不拖垮整个列表
      .filter((s) => !spaceId || s.spaceId === spaceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): SessionRecord {
    const s = this.list().find((x) => x.id === id);
    if (!s) throw errors.notFound("会话不存在");
    return s;
  }

  private inflight = new Map<string, Promise<SessionRecord>>();

  /** 同一 requestId 的并发提交合并为一次，避免两次 terminal.run。 */
  launch(input: LaunchInput): Promise<SessionRecord> {
    const running = this.inflight.get(input.requestId);
    if (running) return running;
    const p = this.doLaunch(input).finally(() => this.inflight.delete(input.requestId));
    this.inflight.set(input.requestId, p);
    return p;
  }

  private async doLaunch(input: LaunchInput): Promise<SessionRecord> {
    // 同一 requestId 重复提交：返回已有会话，不重复启动
    const dup = this.list().find((s) => s.requestId === input.requestId);
    if (dup) return dup;
    const space = this.d.spaces.validateForLaunch(input.spaceId, input.spaceRevision);
    let argv: string[] | undefined;
    let env: Record<string, string> | undefined;
    if (input.command !== undefined) {
      if (input.provider !== "shell") throw errors.invalidInput("command 只能与终端（shell）一起用");
      argv = shellCommand(input.shell ?? "default", input.command);
      if (input.env && Object.keys(input.env).length > 0) env = input.env;
    } else if (input.provider !== "shell") {
      const r = await this.d.resolve({ agentId: input.provider, mode: "interactive", model: input.model, effort: input.effort, fast: input.fast, prompt: input.prompt, resume: input.resumeSessionId });
      argv = [r.command, ...r.argv];
      env = Object.keys(r.env).length > 0 ? r.env : undefined;
    }
    const cwd = input.cwd ?? space.root;
    if (input.resumeSessionId !== undefined && !isValidNativeId(input.resumeSessionId)) throw errors.invalidInput("会话 id 无效");
    if (input.cwd !== undefined) {
      let ok = false;
      try {
        ok = isWithin(realpathSync(space.root), realpathSync(input.cwd));
      } catch {
        /* 目录不存在 */
      }
      if (!ok) throw errors.invalidInput("启动目录必须在 Space 之内且存在");
    }
    const session: SessionRecord = {
      id: newId("cap").replace(/^cap-/, "sess-"),
      spaceId: space.id,
      provider: input.provider,
      model: input.model ?? null,
      state: "launching",
      requestId: input.requestId,
      terminalId: null,
      name: input.command !== undefined ? `命令：${input.command.replace(/\s+/g, " ").slice(0, 40)}` : input.provider === "shell" ? "终端" : (agentById(input.provider)?.displayName ?? input.provider),
      ...(input.command !== undefined ? { command: input.command } : {}),
      ...(env && Object.keys(env).length > 0 ? { hasEnv: true } : {}),
      cwd,
      createdAt: this.d.now().toISOString(),
      ...(input.resumeSessionId ? { nativeSessionId: input.resumeSessionId } : {}),
    };
    this.save(session); // 先持久化，再启动
    const labels = { "huhu.vault": this.d.vaultId, "huhu.space": space.id, "huhu.session": session.id, "huhu.launch": input.requestId };
    const client = await this.d.core().catch((e: unknown) => {
      this.save({ ...session, state: "failed", error: String(e) });
      throw e;
    });
    try {
      const r = await client.call<RunResult>("terminal.run", { ...(argv ? { argv } : {}), cwd, ...(env ? { env } : {}), labels, name: session.id }); // Herdr 名称只接受 ASCII（a-z0-9-_.，1–32 位）；显示名保存在 HUHU 会话记录里
      const ok = { ...session, state: "running" as const, terminalId: r.address };
      this.save(ok);
      return ok;
    } catch (e) {
      // 响应丢失/调用失败：按标签查回，找到唯一终端则绑定；找不到 failed；多个 unknown；任何情况都不重试 run
      const found = await client.call<{ terminals: Terminal[] }>("terminal.list", { labels: { "huhu.launch": input.requestId } }).catch(() => null);
      const list = found?.terminals ?? null;
      const n = list ? list.length : -1;
      const next: SessionRecord =
        n === 1 && list ? { ...session, state: "running", terminalId: (list[0] as Terminal).address } : n > 1 ? { ...session, state: "unknown" } : { ...session, state: "failed", error: e instanceof Error ? e.message : String(e) };
      this.save(next);
      if (next.state === "running") return next;
      throw new HuhuError(next.state === "unknown" ? "RUN_UNKNOWN" : "HERDR_UNAVAILABLE", next.state === "unknown" ? "找到多个同请求终端，请手动选择" : `启动失败：${next.error}`);
    }
  }

  /** 带环境变量的命令会话：这些秘密值只在内存里，用来抹掉输出里的回显。 */
  private readonly secrets = new Map<string, string[]>();
  rememberSecrets(sessionId: string, values: string[]): void {
    this.secrets.set(sessionId, values);
  }

  /**
   * 终端当前输出（屏幕 + 历史）。命令带环境变量时，只有本进程记得秘密值才能确认已抹掉回显——引擎重启后拿不到就不返回输出。
   * 是否带过环境变量以会话记录里的 `hasEnv` 为准。
   */
  async output(id: string, lines = 200): Promise<{ text: string; complete: boolean }> {
    const s = this.get(id);
    if (!s.terminalId) throw errors.invalidInput("会话没有终端");
    if (s.hasEnv && !this.secrets.has(id)) return { text: "（引擎重启过：无法确认环境变量值已从输出里抹掉，没有收录输出）", complete: false };
    const r = await (await this.d.core()).call<{ text?: string; screen?: string; history?: string }>("terminal.read", { terminal: s.terminalId, lines: Math.min(Math.max(lines, 1), 2000) });
    const text = r.text ?? [r.history, r.screen].filter(Boolean).join("\n");
    return {
      text: redactSecrets(text, this.secrets.get(id) ?? [])
        .trim()
        .split("\n")
        .slice(-lines)
        .join("\n"),
      complete: true,
    };
  }

  /**
   * 移除已结束的终端：Herdr 会把启动时的环境变量连同终端记录一起保存在状态文件里（restart_env），
   * 带保险箱环境变量的命令读完输出后必须移除终端，秘密值才不会留在 Vault 的运行目录里。
   */
  async release(id: string): Promise<void> {
    const s = this.get(id);
    this.secrets.delete(id);
    if (!s.terminalId) return;
    await (await this.d.core()).call("terminal.rm", { terminal: s.terminalId });
  }

  async interrupt(id: string): Promise<void> {
    const s = this.get(id);
    if (!s.terminalId) throw errors.invalidInput("会话没有终端");
    await (await this.d.core()).call("terminal.interrupt", { terminal: s.terminalId });
  }

  async kill(id: string): Promise<void> {
    const s = this.get(id);
    if (!s.terminalId) throw errors.invalidInput("会话没有终端");
    await (await this.d.core()).call("terminal.kill", { terminal: s.terminalId });
  }

  private lastReconcile = 0;

  /**
   * 对账：记录里还是 running 的会话，到 Herdr Core 里核对终端是否已经结束（程序退出 / 被结束 / Core 重启后终端不存在）。
   * 在打开模块时调用；2 秒内重复调用直接跳过。Core 连不上就保持原状，不乱改。
   */
  async reconcile(): Promise<void> {
    const mine = this.list().filter((x) => x.state === "running" && x.terminalId);
    if (mine.length === 0 || Date.now() - this.lastReconcile < 2000) return;
    this.lastReconcile = Date.now();
    type T = { address: string; labels?: Record<string, string>; state?: string; exit_code?: number | null; finished_ms?: number | null };
    let list: T[] | null;
    try {
      const c = this.d.peekCore ? await this.d.peekCore() : await this.d.core();
      if (c === null) return; // 暂时判断不了：保持原状
      list = c === "absent" ? [] : (await c.call<{ terminals: T[] }>("terminal.list", { all: true, labels: { "huhu.vault": this.d.vaultId } })).terminals;
    } catch {
      return;
    }
    for (const sess of mine) {
      // 地址之外还要核对标签：Core 状态被重置后地址可能被别的终端复用
      const t = list.find((x) => x.address === sess.terminalId && x.labels?.["huhu.session"] === sess.id);
      const finished = t && (t.state === "finished" || (t.finished_ms ?? null) !== null);
      if (t && !finished) continue;
      try {
        const at = t?.finished_ms ? new Date(t.finished_ms).toISOString() : this.d.now().toISOString();
        this.save({ ...this.get(sess.id), state: "exited", exitCode: t?.exit_code ?? null, exitedAt: at, ...(t ? {} : { error: "终端已不存在（Herdr Core 没有在运行，或已重启过）" }) });
      } catch {
        /* 单条记录读写失败不影响其他会话和列表 */
      }
    }
  }

  // ---- 等人工（Herdr 状态订阅）----

  /** 终端对应的运行中会话（核对 huhu.session 标签由调用方负责）。 */
  byTerminal(terminalId: string, sessionLabel?: string): SessionRecord | null {
    return this.list().find((x) => x.terminalId === terminalId && x.state === "running" && (!sessionLabel || x.id === sessionLabel)) ?? null;
  }

  /** 应用一条程序状态：返回是否发生了“进入 blocked”或“离开 blocked”。同一次 blocked 重复到达（重连、快照）不产生新的发生标识。 */
  applyStatus(sessionId: string, status: ProgramStatus | null): { session: SessionRecord; transition: "blocked" | "cleared" | null } {
    const sess = this.get(sessionId);
    const w = sess.waiting;
    if (status?.state === "blocked") {
      if (w?.active) {
        const next = { ...w, kind: status.kind ?? null, msg: status.msg ?? null, app: status.app ?? w.app };
        if (JSON.stringify(next) !== JSON.stringify(w)) this.save({ ...sess, waiting: next });
        return { session: this.get(sessionId), transition: null };
      }
      this.save({
        ...sess,
        waiting: {
          n: (w?.n ?? 0) + 1,
          active: true,
          kind: status.kind ?? null,
          msg: status.msg ?? null,
          app: status.app ?? null,
          since: this.d.now().toISOString(),
          ...(w?.taskId ? { taskId: w.taskId } : {}),
          ...(w?.handled !== undefined ? { handled: w.handled } : {}),
        },
      });
      return { session: this.get(sessionId), transition: "blocked" };
    }
    if (w?.active) {
      this.save({ ...sess, waiting: { ...w, active: false } });
      return { session: this.get(sessionId), transition: "cleared" };
    }
    return { session: sess, transition: null };
  }

  /** 终端结束：未解除的等待标为过期。 */
  expireWaiting(sessionId: string): void {
    const sess = this.get(sessionId);
    if (sess.waiting?.active) this.save({ ...sess, waiting: { ...sess.waiting, active: false, expired: true } });
  }

  markWaitingHandled(sessionId: string, n: number): void {
    const sess = this.get(sessionId);
    if (sess.waiting && sess.waiting.handled !== n) this.save({ ...sess, waiting: { ...sess.waiting, handled: n } });
  }

  setWaitingTask(sessionId: string, taskId: string): void {
    const sess = this.get(sessionId);
    if (sess.waiting && sess.waiting.taskId !== taskId) this.save({ ...sess, waiting: { ...sess.waiting, taskId } });
  }

  // ---- 变更审查意见 ----

  comments(id: string): ReviewComment[] {
    return this.get(id).reviewComments ?? [];
  }

  addComment(id: string, c: { path: string; side: "old" | "new"; line: number; text: string }): ReviewComment {
    const s = this.get(id);
    const text = noControl(c.text);
    if (!text) throw errors.invalidInput("意见不能为空");
    if (text.length > 2000) throw errors.invalidInput("意见最多 2000 个字");
    if (!c.path || hasControl(c.path) || c.path.startsWith("/") || c.path.split("/").includes("..") || c.path.length > 1000) throw errors.invalidInput("文件路径无效");
    if (!Number.isInteger(c.line) || c.line < 1 || c.line > 10_000_000) throw errors.invalidInput("行号无效");
    const list = s.reviewComments ?? [];
    if (list.length >= MAX_COMMENTS) throw errors.invalidInput(`每个会话最多 ${MAX_COMMENTS} 条意见，请先删除已发送的`);
    const comment: ReviewComment = { id: newId("cap").replace(/^cap-/, "rc-"), path: c.path, side: c.side, line: c.line, text, createdAt: this.d.now().toISOString(), sentAt: null };
    this.save({ ...s, reviewComments: [...list, comment] });
    return comment;
  }

  deleteComment(id: string, commentId: string): void {
    const s = this.get(id);
    const list = s.reviewComments ?? [];
    if (!list.some((x) => x.id === commentId)) throw errors.notFound("意见不存在");
    this.save({ ...s, reviewComments: list.filter((x) => x.id !== commentId) });
  }

  private sending = new Set<string>();

  /** 把意见整理成一段文本写入会话输入（terminal.send，会自动回车提交）；dryRun 只返回将要发送的文本。成功后才标记已发送。 */
  async sendComments(id: string, ids?: string[], dryRun = false): Promise<{ sent: number; text: string }> {
    const s = this.get(id);
    if (!dryRun && (s.state !== "running" || !s.terminalId)) throw errors.invalidInput("会话没有在运行：恢复会话后再发送");
    if (this.sending.has(id)) throw errors.invalidInput("正在发送上一批意见，请稍候");
    const all = s.reviewComments ?? [];
    // 显式指定时也只允许“未发送”的（含发送状态未知的）；已确认发送过的不能再发
    const chosen = ids ? all.filter((c) => ids.includes(c.id) && c.sentAt === null) : all.filter((c) => c.sentAt === null && !c.sending);
    if (chosen.length === 0) throw errors.invalidInput("没有待发送的意见");
    const text = ["请根据以下审查意见继续工作：", ...chosen.map((c) => `${safePath(c.path)}:${c.side === "new" ? "新" : "旧"}${c.line} — ${c.text}`)].join("\n");
    if (dryRun) return { sent: 0, text };
    this.sending.add(id);
    try {
      const mark = (patch: (c: ReviewComment) => ReviewComment) => {
        const cur = this.get(id);
        this.save({ ...cur, reviewComments: (cur.reviewComments ?? []).map((c) => (chosen.some((x) => x.id === c.id) ? patch(c) : c)) });
      };
      const clear = (c: ReviewComment): ReviewComment => {
        const { sending: _s, ...rest } = c;
        return rest;
      };
      // 先落盘“发送中”：发送期间崩溃时，重启后能看出这批意见送达状态未知，而不是静默重发
      mark((c) => ({ ...c, sending: true }));
      try {
        await (await this.d.core()).call("terminal.send", { terminal: s.terminalId, text });
      } catch (e) {
        if (e instanceof HerdrError) {
          mark(clear); // Core 明确拒绝了：没有送达
          const msg = `${e.message} ${e.kind ?? ""}`;
          if (/not.?found|unknown terminal|no such terminal|no terminal|has finished|finished/i.test(msg)) throw errors.invalidInput("会话的终端已经结束：恢复会话后再发送");
          throw e;
        }
        // 超时或连接中断：请求可能已经送达。保留“发送中”，由用户确认后再决定是否重发
        throw new HuhuError("INTERNAL", "发送结果未知（连接中断或超时）：这批意见标记为“发送状态未知”，确认终端里没有收到后再重发", { retryable: false });
      }
      const at = this.d.now().toISOString();
      mark((c) => ({ ...clear(c), sentAt: at }));
      return { sent: chosen.length, text };
    } finally {
      this.sending.delete(id);
    }
  }

  rename(id: string, name: string): SessionRecord {
    if (!name.trim()) throw errors.invalidInput("名称必填");
    const next = { ...this.get(id), name: name.trim() };
    this.save(next);
    return next;
  }
}
