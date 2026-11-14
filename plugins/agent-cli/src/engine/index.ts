import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { errors } from "@huhu/contracts";
import { machineId } from "@huhu/vault";
import path from "node:path";
import { z } from "zod";
import { HerdrCore } from "./herdr-core.js";
import { isValidNativeId, scanHistory } from "./history/scanner.js";
import { readTranscript } from "./history/transcript.js";
import { reviewDiff } from "./review.js";
import { PinStore } from "./pins.js";
import { AgentDetector } from "./detect.js";
import { resolveAgentLaunch } from "./launch.js";
import { AgentSettingsStore } from "./settings.js";
import { AgentSettingsEntry } from "../shared/settings.js";
import { WaitingWatcher } from "./waiting.js";
import { SessionsService } from "./sessions.js";
import { createTerminalBridge } from "./terminal-bridge.js";
import { SpaceStore } from "./spaces.js";

export { HerdrCore } from "./herdr-core.js";
export { SessionsService } from "./sessions.js";
export { createTerminalBridge, type TerminalBridge } from "./terminal-bridge.js";
export { AgentDetector } from "./detect.js";
export { resolveAgentLaunch } from "./launch.js";
export { AgentSettingsStore } from "./settings.js";
export { SpaceStore } from "./spaces.js";

const SpaceDto = z.object({ id: z.string(), name: z.string(), root: z.string(), machineId: z.string(), createdAt: z.string(), revision: z.number() });

export interface AgentCliOptions {
  /** 历史扫描的 HOME 与环境（测试用；缺省为进程的真实值）。 */
  history?: { home?: string; env?: NodeJS.ProcessEnv };
  /** herdr-core 可执行文件；缺省读 HUHU_HERDR_BIN，再退回应用资源目录。 */
  herdrBin?: string;
  /** 站内通知（程序在会话里等人工时）。 */
  notify?: (n: { title: string; module: string }) => void;
  /** 测试用：缩短订阅的重连间隔。 */
  waitingBackoffMs?: { min: number; max: number };
}

export function apply(ctx: Context, api: HuhuApi, opts: AgentCliOptions = {}): { spaces: SpaceStore; detector: AgentDetector; sessions: SessionsService; core: HerdrCore } {
  const root = api.vault.files.root;
  const spaces = new SpaceStore(path.join(api.vault.stateDir, "agent-cli", "spaces"), machineId());
  spaces.ensureDefault(root); // 首次进入：默认以 Vault 根为目录的 Space
  const settingsStore = new AgentSettingsStore(path.join(api.vault.stateDir, "agent-cli", "agents.json"));
  const detector = new AgentDetector({ settings: () => settingsStore.get() });
  const resolve = async (input: Parameters<typeof resolveAgentLaunch>[1]) => {
    const detected = input.preview ? undefined : (await detector.detect()).find((r) => r.id === input.agentId);
    return resolveAgentLaunch({ settings: settingsStore.get(), detected }, input);
  };
  const mid = machineId();
  const core = new HerdrCore({ bin: opts.herdrBin ?? process.env["HUHU_HERDR_BIN"] ?? "herdr-core", vaultId: api.vault.vaultId, machineId: mid, runtimeDir: path.join(api.vault.stateDir, "runtime", mid, "herdr") });
  ctx.effect(() => () => core.dispose()); // 停用只断开连接，不结束 Core
  const sessions = new SessionsService({
    dir: path.join(api.vault.stateDir, "agent-cli", "sessions"),
    vaultId: api.vault.vaultId,
    spaces,
    core: () => core.ensure(),
    peekCore: () => core.peek(),
    resolve,
    now: () => new Date(),
  });

  // 会话里的程序经 OSC 7501 上报 blocked（等人工）：不用等进程退出，几秒内显示“需要你操作”
  const waiting = new WaitingWatcher({
    endpoint: core.endpoint,
    vaultId: api.vault.vaultId,
    sessions,
    ...(opts.waitingBackoffMs ? { backoffMs: opts.waitingBackoffMs } : {}),
    onBlocked: async (sess) => {
      const w = sess.waiting;
      if (!w) return;
      const what = w.kind === "permission" ? "需要批准" : w.kind === "question" ? "有问题要回答" : w.kind === "auth" ? "需要登录授权" : "需要你操作";
      opts.notify?.({ title: `${sess.name}：${what}${w.msg ? `（${w.msg}）` : ""}`, module: "agent-cli" });
      if (settingsStore.get().waitingTasks === false) return;
      // 独立会话：在为它自动建立的 human 任务上追加评论（任务按会话 id 幂等创建，评论 id 由发生标识派生）
      const created = w.taskId
        ? { id: w.taskId }
        : ((await api.call(
            "tasks.create",
            { title: `${sess.name} 需要你操作`, type: "human", body: `终端会话「${sess.name}」里的程序在等你处理。\n\n在 Agent CLI 模块里点“前往处理”回到原终端。` },
            { idempotencyKey: `session-task-${sess.id}` },
          )) as { id: string });
      if (!w.taskId) sessions.setWaitingTask(sess.id, created.id);
      const commentId = `session-${sess.id}-w-${w.n}`;
      await api.call("tasks.comments.add", { taskId: created.id, id: commentId, source: "agent", author: sess.name, session: sess.id, event: "waiting", body: `${what}${w.msg ? `：${w.msg}` : ""}` }, { idempotencyKey: commentId });
    },
  });
  waiting.start();
  ctx.effect(() => () => waiting.stop()); // 停用时关闭订阅连接；重新启用后 apply 再次运行，重连并用快照补齐期间的 blocked

  api.defineCapability(def({ name: "agent.spaces.list", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false, input: z.object({}), output: z.array(SpaceDto), handler: () => spaces.list() }));
  api.defineCapability(
    def({
      name: "agent.spaces.save",
      plugin: "agent-cli",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: z.object({ id: z.string().optional(), name: z.string(), root: z.string(), expectedRevision: z.number().optional() }),
      output: SpaceDto,
      handler: (_c, i) => spaces.save({ name: i.name, root: i.root, ...(i.id ? { id: i.id } : {}), ...(i.expectedRevision !== undefined ? { expectedRevision: i.expectedRevision } : {}) }),
    }),
  );
  api.defineCapability(
    def({
      name: "agent.spaces.delete",
      plugin: "agent-cli",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: z.object({ id: z.string() }),
      output: z.object({ ok: z.literal(true) }),
      handler: async (_c, i) => {
        await sessions.reconcile();
        if (sessions.list(i.id).some((x) => x.state === "running" || x.state === "launching")) throw errors.invalidInput("这个 Space 还有运行中的会话，请先结束它们再删除");
        spaces.delete(i.id);
        pins.clear(i.id);
        return { ok: true as const };
      },
    }),
  );
  const DetectOut = z.object({
    id: z.string(),
    displayName: z.string(),
    installed: z.boolean(),
    skipped: z.literal(true).optional(),
    path: z.string().optional(),
    version: z.string().optional(),
    via: z.enum(["path", "installDir", "override"]).optional(),
    headless: z.boolean(),
    detectedAt: z.string(),
  });
  api.defineCapability(
    def({
      name: "agent.catalog.detect",
      plugin: "agent-cli",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: z.object({ refresh: z.boolean().optional() }),
      output: z.array(DetectOut),
      handler: (_c, i) => detector.detect(i.refresh === true),
    }),
  );
  const SettingsOut = z.object({
    settings: z.object({ schema: z.literal(1), revision: z.number(), defaultAgent: z.enum(["claude", "codex", "pi"]).nullable(), waitingTasks: z.boolean().optional(), agents: z.record(z.string(), AgentSettingsEntry) }),
    warning: z.string().optional(),
  });
  api.defineCapability(def({ name: "agent.settings.get", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false, input: z.object({}), output: SettingsOut, handler: () => settingsStore.read() }));
  api.defineCapability(
    def({
      name: "agent.settings.update",
      plugin: "agent-cli",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: z.object({ expectedRevision: z.number(), defaultAgent: z.enum(["claude", "codex", "pi"]).nullable(), waitingTasks: z.boolean().optional(), agents: z.record(z.string(), AgentSettingsEntry) }),
      output: SettingsOut.shape.settings,
      handler: (_c, i) => {
        const out = settingsStore.write({ defaultAgent: i.defaultAgent, ...(i.waitingTasks !== undefined ? { waitingTasks: i.waitingTasks } : {}), agents: i.agents }, i.expectedRevision);
        detector.invalidate(); // command / enabled 可能变了，旧检测结果不再可信
        return out;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "agent.launch.resolve",
      plugin: "agent-cli",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: z.object({
        agentId: z.string(),
        mode: z.enum(["interactive", "headless"]),
        model: z.string().optional(),
        effort: z.string().optional(),
        fast: z.boolean().optional(),
        prompt: z.string().optional(),
        sessionId: z.string().optional(),
        resume: z.string().optional(),
        draft: AgentSettingsEntry.optional(),
        preview: z.boolean().optional(),
      }),
      output: z.object({ command: z.string(), argv: z.array(z.string()), env: z.record(z.string(), z.string()), stdin: z.string().optional(), warnings: z.array(z.string()), unsupported: z.literal("headless").optional() }),
      handler: (_c, i) => resolve(i),
    }),
  );

  const Session = z.object({
    id: z.string(),
    spaceId: z.string(),
    provider: z.string(),
    model: z.string().nullable(),
    state: z.string(),
    requestId: z.string(),
    terminalId: z.string().nullable(),
    name: z.string(),
    cwd: z.string(),
    createdAt: z.string(),
    nativeSessionId: z.string().optional(),
    exitCode: z.number().nullable().optional(),
    exitedAt: z.string().optional(),
    error: z.string().optional(),
    command: z.string().optional(),
    hasEnv: z.boolean().optional(),
    waiting: z
      .object({
        n: z.number(),
        active: z.boolean(),
        expired: z.boolean().optional(),
        kind: z.string().nullable(),
        msg: z.string().nullable(),
        app: z.string().nullable(),
        since: z.string(),
        taskId: z.string().optional(),
        handled: z.number().optional(),
      })
      .optional(),
  });
  const Id = z.object({ id: z.string() });
  const Ok = z.object({ ok: z.literal(true) });
  api.defineCapability(
    def({
      name: "agent.sessions.launch",
      plugin: "agent-cli",
      scope: "execute",
      exposable: false,
      defaultExposed: false,
      input: z.object({
        spaceId: z.string(),
        spaceRevision: z.number(),
        provider: z.enum(["claude", "codex", "pi", "shell"]),
        model: z.string().optional(),
        effort: z.string().optional(),
        fast: z.boolean().optional(),
        prompt: z.string().optional(),
        requestId: z.string().min(8),
        /** 终端命令（automations 的 terminal 动作）：provider 必须是 shell；命令里的 shell 语义只来自规则作者写下的文本。 */
        command: z.string().min(1).max(4000).optional(),
        shell: z.enum(["default", "bash", "zsh", "sh", "powershell", "cmd"]).optional(),
        /** 环境变量名 → 保险箱引用：在引擎侧解析（调用方插件的身份），值只传给 terminal.run，不落盘、不回显。 */
        envRefs: z.record(z.string(), z.string()).optional(),
      }),
      output: Session,
      handler: async (c, i) => {
        let env: Record<string, string> | undefined;
        if (i.command !== undefined || i.envRefs) {
          if (i.provider !== "shell") throw errors.invalidInput("command / envRefs 只能与终端（shell）一起用");
          if (i.envRefs && Object.keys(i.envRefs).length > 0) {
            if (!c.caller.startsWith("plugin:")) throw errors.permissionDenied("环境变量引用（仅内置插件可用）");
            const su = api.service<{ resolve(ref: string, c: { plugin: string; purpose: string }): string }>("secretUse");
            if (!su) throw errors.invalidInput("保险箱插件未启用");
            env = {};
            for (const [k, ref] of Object.entries(i.envRefs)) env[k] = su.resolve(ref, { plugin: c.caller.slice("plugin:".length), purpose: "terminal" });
          }
        }
        const s = await sessions.launch({ ...i, ...(env ? { env } : {}) });
        if (env) sessions.rememberSecrets(s.id, Object.values(env));
        waiting.poke(); // Core 可能刚被这次启动拉起：立刻订阅，不等退避
        return s;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "agent.sessions.output",
      plugin: "agent-cli",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: z.object({ id: z.string(), lines: z.number().int().min(1).max(2000).optional() }),
      output: z.object({ text: z.string(), complete: z.boolean() }),
      handler: (_c, i) => sessions.output(i.id, i.lines ?? 200),
    }),
  );
  api.defineCapability(
    def({
      name: "agent.sessions.release",
      plugin: "agent-cli",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: z.object({ id: z.string() }),
      output: z.object({ ok: z.literal(true) }),
      handler: async (_c, i) => (await sessions.release(i.id), { ok: true as const }),
    }),
  );
  api.defineCapability(
    def({
      name: "agent.sessions.list",
      plugin: "agent-cli",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: z.object({ spaceId: z.string().optional() }),
      output: z.array(Session),
      handler: async (_c, i) => {
        await sessions.reconcile();
        return sessions.list(i.spaceId);
      },
    }),
  );
  api.defineCapability(
    def({ name: "agent.sessions.interrupt", plugin: "agent-cli", scope: "execute", exposable: false, defaultExposed: false, input: Id, output: Ok, handler: async (_c, i) => (await sessions.interrupt(i.id), { ok: true as const }) }),
  );
  api.defineCapability(
    def({ name: "agent.sessions.kill", plugin: "agent-cli", scope: "execute", exposable: false, defaultExposed: false, input: Id, output: Ok, handler: async (_c, i) => (await sessions.kill(i.id), { ok: true as const }) }),
  );
  api.defineCapability(
    def({ name: "agent.sessions.rename", plugin: "agent-cli", scope: "write", exposable: false, defaultExposed: false, input: Id.extend({ name: z.string() }), output: Session, handler: (_c, i) => sessions.rename(i.id, i.name) }),
  );
  api.defineCapability(
    def({
      name: "agent.core.status",
      plugin: "agent-cli",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: z.object({}),
      output: z.object({ state: z.string(), version: z.string().nullable(), error: z.string().optional() }),
      handler: () => core.status(),
    }),
  );
  api.defineCapability(
    def({
      name: "agent.core.restart",
      plugin: "agent-cli",
      scope: "execute",
      exposable: false,
      defaultExposed: false,
      input: z.object({}),
      output: z.object({ state: z.string(), version: z.string().nullable(), error: z.string().optional() }),
      handler: async () => {
        await core.stop();
        await core.ensure().catch(() => undefined);
        return core.status();
      },
    }),
  );
  const Entry = z.object({ provider: z.enum(["claude", "codex"]), nativeSessionId: z.string(), cwd: z.string(), title: z.string(), updatedAt: z.string(), active: z.boolean(), pinned: z.boolean() });
  const spaceOf = (id: string) => {
    const sp = spaces.list().find((x) => x.id === id);
    if (!sp) throw errors.notFound("Space 不存在");
    return sp;
  };
  // 列表请求很频繁（打开面板、切换 Space），短时间内复用结果；恢复时总是重新扫描
  const pins = new PinStore(path.join(api.vault.stateDir, "agent-cli", "pins.json"));
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
  api.defineCapability(
    def({
      name: "agent.history.list",
      plugin: "agent-cli",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: z.object({ spaceId: z.string(), limit: z.number().int().min(1).max(500).default(100) }),
      output: z.object({ entries: z.array(Entry), skipped: z.number() }),
      handler: async (_c, i) => {
        const sp = spaceOf(i.spaceId);
        await sessions.reconcile(); // 已结束的会话不再算“运行中”
        const live = new Set(
          sessions
            .list(sp.id)
            .filter((x) => x.state === "running" && x.nativeSessionId)
            .map((x) => `${x.provider}:${x.nativeSessionId}`),
        );
        const r = scanCached(sp.root);
        const pinned = pins.list(sp.id);
        const all = r.entries.map(({ file: _file, ...e }) => ({ ...e, active: live.has(`${e.provider}:${e.nativeSessionId}`), pinned: pinned.has(`${e.provider}:${e.nativeSessionId}`) }));
        // 固定项置顶；其余保持扫描器给出的时间倒序（sort 稳定）
        const ordered = [...all.filter((e) => e.pinned), ...all.filter((e) => !e.pinned)];
        return { entries: ordered.slice(0, i.limit), skipped: r.skipped };
      },
    }),
  );
  api.defineCapability(
    def({
      name: "agent.history.read",
      plugin: "agent-cli",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: z.object({ spaceId: z.string(), provider: z.enum(["claude", "codex"]), nativeSessionId: z.string() }),
      output: z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string(), at: z.string().nullable() })), truncated: z.boolean() }),
      handler: (_c, i) => {
        if (!isValidNativeId(i.nativeSessionId)) throw errors.invalidInput("会话 id 无效");
        const sp = spaceOf(i.spaceId);
        // 只读扫描结果里确实存在的会话文件：不接受调用方给出的路径
        const hit = scan(sp.root).entries.find((e) => e.provider === i.provider && e.nativeSessionId === i.nativeSessionId);
        if (!hit) throw errors.notFound("没有找到这个历史会话");
        return readTranscript(hit.provider, hit.file);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "agent.history.pin",
      plugin: "agent-cli",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: z.object({ spaceId: z.string(), provider: z.enum(["claude", "codex"]), nativeSessionId: z.string(), pinned: z.boolean() }),
      output: z.object({ pinned: z.boolean() }),
      handler: async (_c, i) => {
        if (!isValidNativeId(i.nativeSessionId)) throw errors.invalidInput("会话 id 无效");
        const sp = spaceOf(i.spaceId);
        pins.set(sp.id, `${i.provider}:${i.nativeSessionId}`, i.pinned);
        return { pinned: i.pinned };
      },
    }),
  );
  api.defineCapability(
    def({
      name: "agent.history.resume",
      plugin: "agent-cli",
      scope: "execute",
      exposable: false,
      defaultExposed: false,
      timeoutMs: 60_000,
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
    }),
  );
  // ---- 变更审查（git diff HEAD + 审查意见，意见经 terminal.send 写回会话）----
  const Line = z.object({ kind: z.enum(["ctx", "add", "del"]), oldLine: z.number().nullable(), newLine: z.number().nullable(), text: z.string(), noNewline: z.boolean().optional() });
  const Hunk = z.object({ header: z.string(), oldStart: z.number(), oldLines: z.number(), newStart: z.number(), newLines: z.number(), lines: z.array(Line) });
  const ReviewFile = z.object({
    path: z.string(),
    oldPath: z.string().nullable(),
    status: z.enum(["added", "modified", "deleted", "renamed", "untracked"]),
    binary: z.boolean(),
    additions: z.number(),
    deletions: z.number(),
    tooLarge: z.boolean(),
    hunks: z.array(Hunk),
  });
  const Comment = z.object({ id: z.string(), path: z.string(), side: z.enum(["old", "new"]), line: z.number(), text: z.string(), createdAt: z.string(), sentAt: z.string().nullable(), sending: z.boolean().optional() });
  const SessionId = z.object({ sessionId: z.string() });
  api.defineCapability(
    def({
      name: "agent.review.diff",
      plugin: "agent-cli",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      timeoutMs: 60_000,
      input: z.object({ spaceId: z.string() }),
      output: z.object({ isRepo: z.boolean(), hasHead: z.boolean(), truncated: z.boolean(), files: z.array(ReviewFile) }),
      handler: (_c, i) => reviewDiff(spaceOf(i.spaceId).root),
    }),
  );
  api.defineCapability(def({ name: "agent.review.comments", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false, input: SessionId, output: z.array(Comment), handler: (_c, i) => sessions.comments(i.sessionId) }));
  api.defineCapability(
    def({
      name: "agent.review.comment.add",
      plugin: "agent-cli",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: SessionId.extend({ path: z.string(), side: z.enum(["old", "new"]), line: z.number().int(), text: z.string() }),
      output: Comment,
      handler: (_c, i) => sessions.addComment(i.sessionId, { path: i.path, side: i.side, line: i.line, text: i.text }),
    }),
  );
  api.defineCapability(
    def({
      name: "agent.review.comment.delete",
      plugin: "agent-cli",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: SessionId.extend({ commentId: z.string() }),
      output: z.object({ ok: z.literal(true) }),
      handler: (_c, i) => (sessions.deleteComment(i.sessionId, i.commentId), { ok: true as const }),
    }),
  );
  api.defineCapability(
    def({
      name: "agent.review.send",
      plugin: "agent-cli",
      scope: "execute",
      exposable: false,
      defaultExposed: false,
      timeoutMs: 90_000,
      input: SessionId.extend({ commentIds: z.array(z.string()).optional(), dryRun: z.boolean().default(false) }),
      output: z.object({ sent: z.number(), text: z.string() }),
      handler: (_c, i) => sessions.sendComments(i.sessionId, i.commentIds, i.dryRun),
    }),
  );
  api.provide("agentCli", { spaces, detector, core });
  api.provide("terminalBridge:agent", createTerminalBridge({ sessions, core }));
  return { spaces, detector, sessions, core };
}
