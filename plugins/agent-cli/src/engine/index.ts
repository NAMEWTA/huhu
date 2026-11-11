import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { errors } from "@huhu/contracts";
import { machineId } from "@huhu/vault";
import path from "node:path";
import { z } from "zod";
import { HerdrCore } from "./herdr-core.js";
import { isValidNativeId, scanHistory } from "./history/scanner.js";
import { reviewDiff } from "./review.js";
import { ProviderDetector } from "./providers/index.js";
import { SessionsService } from "./sessions.js";
import { createTerminalBridge } from "./terminal-bridge.js";
import { SpaceStore } from "./spaces.js";

export { HerdrCore } from "./herdr-core.js";
export { SessionsService } from "./sessions.js";
export { createTerminalBridge, type TerminalBridge } from "./terminal-bridge.js";
export { PROVIDERS, ProviderDetector } from "./providers/index.js";
export { SpaceStore } from "./spaces.js";

const SpaceDto = z.object({ id: z.string(), name: z.string(), root: z.string(), machineId: z.string(), createdAt: z.string(), revision: z.number() });

export interface AgentCliOptions {
  /** 历史扫描的 HOME 与环境（测试用；缺省为进程的真实值）。 */
  history?: { home?: string; env?: NodeJS.ProcessEnv };
  /** herdr-core 可执行文件；缺省读 HUHU_HERDR_BIN，再退回应用资源目录。 */
  herdrBin?: string;
}

export function apply(ctx: Context, api: HuhuApi, opts: AgentCliOptions = {}): { spaces: SpaceStore; detector: ProviderDetector; sessions: SessionsService; core: HerdrCore } {
  const root = api.vault.files.root;
  const spaces = new SpaceStore(path.join(root, ".huhu", "agent-cli", "spaces"), machineId());
  spaces.ensureDefault(root); // 首次进入：默认以 Vault 根为目录的 Space
  const detector = new ProviderDetector();
  const mid = machineId();
  const core = new HerdrCore({ bin: opts.herdrBin ?? process.env["HUHU_HERDR_BIN"] ?? "herdr-core", vaultId: api.vault.vaultId, machineId: mid, runtimeDir: path.join(root, ".huhu", "runtime", mid, "herdr") });
  ctx.effect(() => () => core.dispose()); // 停用只断开连接，不结束 Core
  const sessions = new SessionsService({ dir: path.join(root, ".huhu", "agent-cli", "sessions"), vaultId: api.vault.vaultId, spaces, core: () => core.ensure(), peekCore: () => core.peek(), detect: () => detector.detect(), now: () => new Date() });

  api.defineCapability(def({ name: "agent.spaces.list", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false, input: z.object({}), output: z.array(SpaceDto), handler: () => spaces.list() }));
  api.defineCapability(def({
    name: "agent.spaces.save", plugin: "agent-cli", scope: "write", exposable: false, defaultExposed: false,
    input: z.object({ id: z.string().optional(), name: z.string(), root: z.string(), expectedRevision: z.number().optional() }), output: SpaceDto,
    handler: (_c, i) => spaces.save({ name: i.name, root: i.root, ...(i.id ? { id: i.id } : {}), ...(i.expectedRevision !== undefined ? { expectedRevision: i.expectedRevision } : {}) }),
  }));
  api.defineCapability(def({ name: "agent.spaces.delete", plugin: "agent-cli", scope: "write", exposable: false, defaultExposed: false, input: z.object({ id: z.string() }), output: z.object({ ok: z.literal(true) }), handler: (_c, i) => (spaces.delete(i.id), { ok: true as const }) }));
  api.defineCapability(def({
    name: "agent.providers.detect", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false,
    input: z.object({ refresh: z.boolean().optional() }),
    output: z.array(z.object({ provider: z.string(), displayName: z.string(), status: z.string(), exe: z.string().nullable(), version: z.string().nullable(), checkedAt: z.string(), headless: z.boolean(), models: z.array(z.object({ id: z.string(), label: z.string(), efforts: z.array(z.string()), fast: z.boolean() })) })),
    handler: (_c, i) => detector.detect(i.refresh === true),
  }));

  const Session = z.object({ id: z.string(), spaceId: z.string(), provider: z.string(), model: z.string().nullable(), state: z.string(), requestId: z.string(), terminalId: z.string().nullable(), name: z.string(), cwd: z.string(), createdAt: z.string(), nativeSessionId: z.string().optional(), exitCode: z.number().nullable().optional(), exitedAt: z.string().optional(), error: z.string().optional() });
  const Id = z.object({ id: z.string() });
  const Ok = z.object({ ok: z.literal(true) });
  api.defineCapability(def({
    name: "agent.sessions.launch", plugin: "agent-cli", scope: "execute", exposable: false, defaultExposed: false,
    input: z.object({ spaceId: z.string(), spaceRevision: z.number(), provider: z.enum(["claude", "claude-agent-teams", "codex", "pi", "shell"]), model: z.string().optional(), effort: z.string().optional(), fast: z.boolean().optional(), prompt: z.string().optional(), requestId: z.string().min(8) }), output: Session,
    handler: (_c, i) => sessions.launch(i),
  }));
  api.defineCapability(def({ name: "agent.sessions.list", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false, input: z.object({ spaceId: z.string().optional() }), output: z.array(Session), handler: async (_c, i) => { await sessions.reconcile(); return sessions.list(i.spaceId); } }));
  api.defineCapability(def({ name: "agent.sessions.interrupt", plugin: "agent-cli", scope: "execute", exposable: false, defaultExposed: false, input: Id, output: Ok, handler: async (_c, i) => (await sessions.interrupt(i.id), { ok: true as const }) }));
  api.defineCapability(def({ name: "agent.sessions.kill", plugin: "agent-cli", scope: "execute", exposable: false, defaultExposed: false, input: Id, output: Ok, handler: async (_c, i) => (await sessions.kill(i.id), { ok: true as const }) }));
  api.defineCapability(def({ name: "agent.sessions.rename", plugin: "agent-cli", scope: "write", exposable: false, defaultExposed: false, input: Id.extend({ name: z.string() }), output: Session, handler: (_c, i) => sessions.rename(i.id, i.name) }));
  api.defineCapability(def({ name: "agent.core.status", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false, input: z.object({}), output: z.object({ state: z.string(), version: z.string().nullable(), error: z.string().optional() }), handler: () => core.status() }));
  const Entry = z.object({ provider: z.enum(["claude", "codex"]), nativeSessionId: z.string(), cwd: z.string(), title: z.string(), updatedAt: z.string(), active: z.boolean() });
  const spaceOf = (id: string) => {
    const sp = spaces.list().find((x) => x.id === id);
    if (!sp) throw errors.notFound("Space 不存在");
    return sp;
  };
  // 列表请求很频繁（打开面板、切换 Space），短时间内复用结果；恢复时总是重新扫描
  const resuming = new Set<string>();
  const cache = new Map<string, { at: number; r: ReturnType<typeof scanHistory> }>();
  const scanCached = (root: string) => {
    const hit = cache.get(root);
    if (hit && Date.now() - hit.at < 3000) return hit.r;
    const r = scan(root);
    cache.set(root, { at: Date.now(), r });
    return r;
  };
  const scan = (root: string) => scanHistory({ roots: [root], ...(opts.history?.home ? { home: opts.history.home } : {}), ...(opts.history?.env ? { env: opts.history.env } : {}) });
  api.defineCapability(def({
    name: "agent.history.list", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false,
    input: z.object({ spaceId: z.string(), limit: z.number().int().min(1).max(500).default(100) }),
    output: z.object({ entries: z.array(Entry), skipped: z.number() }),
    handler: async (_c, i) => {
      const sp = spaceOf(i.spaceId);
      await sessions.reconcile(); // 已结束的会话不再算“运行中”
      const live = new Set(sessions.list(sp.id).filter((x) => x.state === "running" && x.nativeSessionId).map((x) => `${x.provider}:${x.nativeSessionId}`));
      const r = scanCached(sp.root);
      return { entries: r.entries.slice(0, i.limit).map((e) => ({ ...e, active: live.has(`${e.provider}:${e.nativeSessionId}`) })), skipped: r.skipped };
    },
  }));
  api.defineCapability(def({
    name: "agent.history.resume", plugin: "agent-cli", scope: "execute", exposable: false, defaultExposed: false, timeoutMs: 60_000,
    input: z.object({ spaceId: z.string(), spaceRevision: z.number(), provider: z.enum(["claude", "codex"]), nativeSessionId: z.string(), requestId: z.string() }),
    output: Session,
    handler: async (_c, i) => {
      await sessions.reconcile();
      if (!isValidNativeId(i.nativeSessionId)) throw errors.invalidInput("会话 id 无效");
      const sp = spaceOf(i.spaceId);
      // 只接受扫描结果里确实存在的会话：不能把任意字符串交给 CLI
      const hit = scan(sp.root).entries.find((e) => e.provider === i.provider && e.nativeSessionId === i.nativeSessionId);
      if (!hit) throw errors.notFound("没有找到这个历史会话");
      const key = `${i.provider}:${i.nativeSessionId}`;
      // launching 也算占用；resuming 在 await 之前同步占位，挡住双击和多窗口并发
      if (resuming.has(key) || sessions.list(sp.id).some((x) => (x.state === "running" || x.state === "launching") && x.provider === i.provider && x.nativeSessionId === i.nativeSessionId)) throw errors.invalidInput("这个会话已经在运行");
      resuming.add(key);
      return sessions.launch({ spaceId: sp.id, spaceRevision: i.spaceRevision, provider: i.provider, requestId: i.requestId, resumeSessionId: hit.nativeSessionId, cwd: hit.cwd }).finally(() => resuming.delete(key));
    },
  }));
  // ---- 变更审查（git diff HEAD + 审查意见，意见经 terminal.send 写回会话）----
  const Line = z.object({ kind: z.enum(["ctx", "add", "del"]), oldLine: z.number().nullable(), newLine: z.number().nullable(), text: z.string(), noNewline: z.boolean().optional() });
  const Hunk = z.object({ header: z.string(), oldStart: z.number(), oldLines: z.number(), newStart: z.number(), newLines: z.number(), lines: z.array(Line) });
  const ReviewFile = z.object({ path: z.string(), oldPath: z.string().nullable(), status: z.enum(["added", "modified", "deleted", "renamed", "untracked"]), binary: z.boolean(), additions: z.number(), deletions: z.number(), tooLarge: z.boolean(), hunks: z.array(Hunk) });
  const Comment = z.object({ id: z.string(), path: z.string(), side: z.enum(["old", "new"]), line: z.number(), text: z.string(), createdAt: z.string(), sentAt: z.string().nullable(), sending: z.boolean().optional() });
  const SessionId = z.object({ sessionId: z.string() });
  api.defineCapability(def({ name: "agent.review.diff", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false, timeoutMs: 60_000, input: z.object({ spaceId: z.string() }), output: z.object({ isRepo: z.boolean(), hasHead: z.boolean(), truncated: z.boolean(), files: z.array(ReviewFile) }), handler: (_c, i) => reviewDiff(spaceOf(i.spaceId).root) }));
  api.defineCapability(def({ name: "agent.review.comments", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false, input: SessionId, output: z.array(Comment), handler: (_c, i) => sessions.comments(i.sessionId) }));
  api.defineCapability(def({ name: "agent.review.comment.add", plugin: "agent-cli", scope: "write", exposable: false, defaultExposed: false, input: SessionId.extend({ path: z.string(), side: z.enum(["old", "new"]), line: z.number().int(), text: z.string() }), output: Comment, handler: (_c, i) => sessions.addComment(i.sessionId, { path: i.path, side: i.side, line: i.line, text: i.text }) }));
  api.defineCapability(def({ name: "agent.review.comment.delete", plugin: "agent-cli", scope: "write", exposable: false, defaultExposed: false, input: SessionId.extend({ commentId: z.string() }), output: z.object({ ok: z.literal(true) }), handler: (_c, i) => (sessions.deleteComment(i.sessionId, i.commentId), { ok: true as const }) }));
  api.defineCapability(def({ name: "agent.review.send", plugin: "agent-cli", scope: "execute", exposable: false, defaultExposed: false, timeoutMs: 90_000, input: SessionId.extend({ commentIds: z.array(z.string()).optional(), dryRun: z.boolean().default(false) }), output: z.object({ sent: z.number(), text: z.string() }), handler: (_c, i) => sessions.sendComments(i.sessionId, i.commentIds, i.dryRun) }));
  api.provide("agentCli", { spaces, detector });
  api.provide("terminalBridge:agent", createTerminalBridge({ sessions, core }));
  return { spaces, detector, sessions, core };
}
