import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors, newId } from "@huhu/contracts";
import type { HerdrClient } from "@huhu/herdr-client";
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
  error?: string;
}

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
    writeFileSync(this.file(s.id), JSON.stringify(s, null, 2));
  }

  list(spaceId?: string): SessionRecord[] {
    if (!existsSync(this.d.dir)) return [];
    return readdirSync(this.d.dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(path.join(this.d.dir, f), "utf8")) as SessionRecord)
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

  rename(id: string, name: string): SessionRecord {
    if (!name.trim()) throw errors.invalidInput("名称必填");
    const next = { ...this.get(id), name: name.trim() };
    this.save(next);
    return next;
  }
}
