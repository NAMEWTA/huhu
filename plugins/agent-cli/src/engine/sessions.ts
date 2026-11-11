import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors, newId } from "@huhu/contracts";
import { HerdrError, type HerdrClient } from "@huhu/herdr-client";
import { isValidNativeId, isWithin } from "./history/scanner.js";
import { PROVIDERS, type DetectResult, type ProviderId } from "./providers/index.js";
import type { SpaceStore } from "./spaces.js";

export interface SessionRecord {
  id: string;
  spaceId: string;
  provider: ProviderId | "shell";
  model: string | null;
  state: "launching" | "running" | "failed" | "unknown";
  requestId: string;
  terminalId: string | null;
  name: string;
  cwd: string;
  createdAt: string;
  /** 由历史恢复启动时记录 provider 原生会话 id。 */
  nativeSessionId?: string;
  /** 变更审查意见（随会话记录保存）。 */
  reviewComments?: ReviewComment[];
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

const MAX_COMMENTS = 200;
const hasControl = (s: string): boolean => { for (const ch of s) { const n = ch.codePointAt(0) as number; if (n < 0x20 || (n >= 0x7f && n <= 0x9f)) return true; } return false; };
/** 写进终端的路径：只保留字母数字（含中文等）和 . _ - / @ + ~ 空格，其余一律换成 _（文件名里的 ; $ ` | 等不能被 shell 解释）。 */
const safePath = (p: string): string => Array.from(p, (ch) => (/[\p{L}\p{N}._\-/@+~ ]/u.test(ch) ? ch : "_")).join("");
/** C0、DEL 与 C1 控制字符（如 U+009B）都不进终端：替换成空格并压缩空白。 */
const noControl = (s: string): string => Array.from(s, (ch) => { const c = ch.codePointAt(0) as number; return c < 0x20 || (c >= 0x7f && c <= 0x9f) ? " " : ch; }).join("").replace(/\s+/g, " ").trim();

export interface LaunchInput {
  spaceId: string;
  spaceRevision: number;
  provider: ProviderId | "shell";
  model?: string | undefined;
  effort?: string | undefined;
  fast?: boolean | undefined;
  prompt?: string | undefined;
  requestId: string;
  /** 恢复历史会话（仅内部调用：id 来自对历史的扫描结果，不由外部直接传入）。 */
  resumeSessionId?: string | undefined;
  /** 恢复时在原会话的 cwd 启动（必须在 Space 根之内）。 */
  cwd?: string | undefined;
}

interface Terminal { address: string }
interface RunResult { address: string }

export interface SessionsDeps {
  dir: string;
  vaultId: string;
  spaces: SpaceStore;
  core(): Promise<HerdrClient>;
  detect(): Promise<DetectResult[]>;
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
    return readdirSync(this.d.dir).filter((f) => f.endsWith(".json")).flatMap((f) => { try { return [JSON.parse(readFileSync(path.join(this.d.dir, f), "utf8")) as SessionRecord]; } catch { return []; } }) // 单个记录损坏不拖垮整个列表
      .filter((s) => !spaceId || s.spaceId === spaceId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
    for (const [k, v] of [["prompt", input.prompt], ["model", input.model], ["effort", input.effort]] as const) {
      // 以 - 开头的值会被 CLI 当作选项解析（例如 --dangerously-skip-permissions）
      if (v !== undefined && v.startsWith("-")) throw errors.invalidInput(`${k} 不能以 - 开头`);
    }
    const space = this.d.spaces.validateForLaunch(input.spaceId, input.spaceRevision);
    let argv: string[] | undefined;
    let env: Record<string, string> | undefined;
    if (input.provider !== "shell") {
      const prov = PROVIDERS.find((p) => p.id === input.provider);
      const det = (await this.d.detect()).find((r) => r.provider === input.provider);
      if (!prov || !det || det.status !== "found" || !det.exe) throw new HuhuError("PROVIDER_NOT_FOUND", `未检测到 ${prov?.displayName ?? input.provider}`);
      argv = prov.interactiveArgv({ exe: det.exe, model: input.model, effort: input.effort, fast: input.fast, prompt: input.prompt, resumeSessionId: input.resumeSessionId });
      env = prov.env;
    }
    const cwd = input.cwd ?? space.root;
    if (input.resumeSessionId !== undefined && !isValidNativeId(input.resumeSessionId)) throw errors.invalidInput("会话 id 无效");
    if (input.cwd !== undefined) {
      let ok = false;
      try { ok = isWithin(realpathSync(space.root), realpathSync(input.cwd)); } catch { /* 目录不存在 */ }
      if (!ok) throw errors.invalidInput("启动目录必须在 Space 之内且存在");
    }
    const session: SessionRecord = {
      id: newId("cap").replace(/^cap-/, "sess-"), spaceId: space.id, provider: input.provider, model: input.model ?? null, state: "launching",
      requestId: input.requestId, terminalId: null, name: input.provider === "shell" ? "终端" : (PROVIDERS.find((p) => p.id === input.provider)?.displayName ?? input.provider),
      cwd, createdAt: this.d.now().toISOString(), ...(input.resumeSessionId ? { nativeSessionId: input.resumeSessionId } : {}),
    };
    this.save(session); // 先持久化，再启动
    const labels = { "huhu.vault": this.d.vaultId, "huhu.space": space.id, "huhu.session": session.id, "huhu.launch": input.requestId };
    const client = await this.d.core().catch((e: unknown) => { this.save({ ...session, state: "failed", error: String(e) }); throw e; });
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
      const next: SessionRecord = n === 1 && list ? { ...session, state: "running", terminalId: (list[0] as Terminal).address } : n > 1 ? { ...session, state: "unknown" } : { ...session, state: "failed", error: e instanceof Error ? e.message : String(e) };
      this.save(next);
      if (next.state === "running") return next;
      throw new HuhuError(next.state === "unknown" ? "RUN_UNKNOWN" : "HERDR_UNAVAILABLE", next.state === "unknown" ? "找到多个同请求终端，请手动选择" : `启动失败：${next.error}`);
    }
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
      const mark = (patch: (c: ReviewComment) => ReviewComment) => { const cur = this.get(id); this.save({ ...cur, reviewComments: (cur.reviewComments ?? []).map((c) => (chosen.some((x) => x.id === c.id) ? patch(c) : c)) }); };
      const clear = (c: ReviewComment): ReviewComment => { const { sending: _s, ...rest } = c; return rest; };
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
