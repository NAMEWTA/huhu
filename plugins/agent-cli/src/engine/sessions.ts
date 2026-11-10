import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors, newId } from "@huhu/contracts";
import type { HerdrClient } from "@huhu/herdr-client";
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

  async launch(input: LaunchInput): Promise<SessionRecord> {
    // 同一 requestId 重复提交：返回已有会话，不重复启动
    const dup = this.list().find((s) => s.requestId === input.requestId);
    if (dup) return dup;
    const space = this.d.spaces.validateForLaunch(input.spaceId, input.spaceRevision);
    let argv: string[] | undefined;
    let env: Record<string, string> | undefined;
    if (input.provider !== "shell") {
      const prov = PROVIDERS.find((p) => p.id === input.provider);
      const det = (await this.d.detect()).find((r) => r.provider === input.provider);
      if (!prov || !det || det.status !== "found" || !det.exe) throw new HuhuError("PROVIDER_NOT_FOUND", `未检测到 ${prov?.displayName ?? input.provider}`);
      argv = prov.interactiveArgv({ exe: det.exe, model: input.model, effort: input.effort, fast: input.fast, prompt: input.prompt });
      env = prov.env;
    }
    const session: SessionRecord = {
      id: newId("cap").replace(/^cap-/, "sess-"), spaceId: space.id, provider: input.provider, model: input.model ?? null, state: "launching",
      requestId: input.requestId, terminalId: null, name: input.provider === "shell" ? "终端" : (PROVIDERS.find((p) => p.id === input.provider)?.displayName ?? input.provider),
      cwd: space.root, createdAt: this.d.now().toISOString(),
    };
    this.save(session); // 先持久化，再启动
    const labels = { "huhu.vault": this.d.vaultId, "huhu.space": space.id, "huhu.session": session.id, "huhu.launch": input.requestId };
    const client = await this.d.core().catch((e: unknown) => { this.save({ ...session, state: "failed", error: String(e) }); throw e; });
    try {
      const r = await client.call<RunResult>("terminal.run", { ...(argv ? { argv } : {}), cwd: space.root, ...(env ? { env } : {}), labels, name: session.id }); // Herdr 名称只接受 ASCII（a-z0-9-_.，1–32 位）；显示名保存在 HUHU 会话记录里
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
