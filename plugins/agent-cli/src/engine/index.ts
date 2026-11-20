import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { errors, HuhuError } from "@huhu/contracts";
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
import { publicSession, SessionsService } from "./sessions.js";
import { createTerminalBridge } from "./terminal-bridge.js";
import { SpaceStore } from "./spaces.js";
import { AgentDispatch, type DispatchProvider } from "./dispatch.js";
import { AgentDispatchStore } from "./dispatch-store.js";
import { registerDispatch } from "./dispatch-capabilities.js";
import { InputOwnership } from "./input-ownership.js";
import type { AgentId } from "../shared/catalog.js";
import { CodexDispatch, type CodexDispatchOptions } from "./codex-dispatch.js";
import { ExecutionReceipts, pollExecutionReceipts } from "./execution-receipts.js";
import { registerAgentEnvironments, type AgentCredentialHost } from "./launch-environment.js";
import { ProtectedLaunch } from "./protected-launch.js";
import { launchHash } from "./launch-binding.js";
import { WORKSPACE_DOCUMENT, WorkspaceLaunchViewSchema, WorkspaceTargetSchema } from "../shared/workspace-layout.js";
import { registerWorkspaceLayout } from "./workspace-layout.js";
import { InteractiveEnvironment } from "./interactive-environment.js";
import { SpaceSchema, spaceCanLaunch } from "../shared/space.js";
import { registerWorkspaceFiles } from "./workspace-files.js";
import { registerWorkspaceWorktrees } from "./workspace-worktrees.js";

export { HerdrCore } from "./herdr-core.js";
export { SessionsService } from "./sessions.js";
export { createTerminalBridge, type TerminalBridge } from "./terminal-bridge.js";
export { AgentDetector } from "./detect.js";
export { resolveAgentLaunch } from "./launch.js";
export { AgentSettingsStore } from "./settings.js";
export { SpaceStore } from "./spaces.js";
export { AgentDispatchTargetInfoSchema, AgentDispatchResponseSchema } from "./dispatch-capabilities.js";
export { DispatchInput as AgentDispatchInputSchema, DispatchTarget as AgentDispatchTargetSchema } from "./dispatch-store.js";
export { NativeStop as AgentNativeStopInputSchema, NativeStopStatus as AgentNativeStopStatusSchema } from "./native-stop.js";
export { agentEnvironmentDescriptors } from "./launch-environment.js";

export interface AgentCliOptions {
  /** 历史扫描的 HOME 与环境（测试用；缺省为进程的真实值）。 */
  history?: { home?: string; env?: NodeJS.ProcessEnv };
  /** herdr-core 可执行文件；缺省读 HUHU_HERDR_BIN，再退回应用资源目录。 */
  herdrBin?: string;
  /** 站内通知（程序在会话里等人工时）。 */
  notify?: (n: { title: string; module: string }) => void;
  /** 测试用：缩短订阅的重连间隔。 */
  waitingBackoffMs?: { min: number; max: number };
  /** Engine-owned provider protocols. Omit a provider that cannot prove input acceptance. */
  dispatchProviders?: Partial<Record<AgentId, DispatchProvider>>;
  codexDispatch?: CodexDispatchOptions | undefined;
  credentialHost?: AgentCredentialHost;
  receiptCheckMs?: number;
}

export function apply(ctx: Context, api: HuhuApi, opts: AgentCliOptions = {}): { spaces: SpaceStore; detector: AgentDetector; sessions: SessionsService; core: HerdrCore } {
  let interactiveEnvironment: InteractiveEnvironment;
  const environments = registerAgentEnvironments(api, opts.credentialHost, () => interactiveEnvironment.available);
  interactiveEnvironment = new InteractiveEnvironment(process.env["HUHU_AGENT_PTY_HOST"], environments);
  const root = api.vault.files.root;
  const spaces = new SpaceStore(path.join(api.vault.stateDir, "agent-cli", "spaces"), machineId(), undefined, { vaultRoot: root, readOnly: api.vault.files.readOnly });
  spaces.ensureDefault(root); // 首次进入：默认以 Vault 根为目录的 Space
  registerWorkspaceFiles(api, spaces);
  registerWorkspaceWorktrees(api, spaces);
  const settingsStore = new AgentSettingsStore(path.join(api.vault.stateDir, "agent-cli", "agents.json"));
  const codex = opts.codexDispatch && new CodexDispatch(opts.codexDispatch, () => settingsStore.get());
  const detector = new AgentDetector({ settings: () => settingsStore.get() });
  const resolve = async (input: Parameters<typeof resolveAgentLaunch>[1]) => {
    const settings = settingsStore.get();
    const locatedCommand = input.preview ? null : (detector.locate(input.agentId, settings)?.path ?? null);
    return resolveAgentLaunch({ settings, locatedCommand }, input);
  };
  const mid = machineId();
  const vaultId = api.vault.vaultId;
  const lifetime = new AbortController();
  const protectedLaunch = new ProtectedLaunch(process.env["HUHU_NODE_BIN"] ?? process.execPath, process.env["HUHU_PROTECTED_LAUNCH_HELPER"] ?? path.join(import.meta.dirname, "protected-launch-helper.cjs"));
  const dispatchStore = new AgentDispatchStore(api.vault.stateDir, api.vault.files, { vaultId, machineId: mid });
  const ownership = new InputOwnership(
    (id) => dispatchStore.owner(id),
    (id) => sessions.reviewInputPending(id),
  );
  const core = new HerdrCore({
    bin: opts.herdrBin ?? process.env["HUHU_HERDR_BIN"] ?? "herdr-core",
    vaultId,
    machineId: mid,
    runtimeDir: path.join(api.vault.stateDir, "runtime", mid, "herdr"),
    signal: lifetime.signal,
  });
  ctx.effect(() => () => {
    const { code, message, details, recovery } = errors.pluginDisabled("agent-cli");
    lifetime.abort(new HuhuError(code, message, { ...(details && { details }), ...(recovery && { recovery }), retryable: true }));
    core.dispose();
    protectedLaunch.close();
  });
  const sessions: SessionsService = new SessionsService({
    dir: path.join(api.vault.stateDir, "agent-cli", "sessions"),
    vaultId: api.vault.vaultId,
    spaces,
    core: () => core.ensure(),
    peekCore: () => core.peek(),
    resolve,
    now: () => new Date(),
    signal: lifetime.signal,
    inputOwnership: ownership,
    codex,
    protectedLaunch,
    interactiveEnvironment,
  });
  const nativeProvider: DispatchProvider = { id: "codex-app-server-v1", modes: ["new", "existing"], transport: "native" };
  const providers = { ...(codex?.configured && { codex: nativeProvider }), ...opts.dispatchProviders };
  const dispatch = new AgentDispatch({ vaultId, readOnly: api.vault.files.readOnly, spaces, sessions, ownership, store: dispatchStore, providers, signal: lifetime.signal });
  registerDispatch(api, dispatch);
  if (opts.codexDispatch && !api.vault.files.readOnly) {
    const receipts = new ExecutionReceipts(path.join(opts.codexDispatch.root, "agent-receipts"), { vaultId, machineId: mid });
    ctx.effect(() => pollExecutionReceipts(api, dispatchStore, sessions, receipts, lifetime.signal, opts.receiptCheckMs ?? 5_000, (execution) => dispatch.reconcileNative(execution)));
  }

  // 会话里的程序经 OSC 7501 上报 blocked（等人工）：不用等进程退出，几秒内显示“需要你操作”
  const waiting = new WaitingWatcher({
    endpoint: core.endpoint,
    vaultId: api.vault.vaultId,
    sessions,
    ...(opts.waitingBackoffMs ? { backoffMs: opts.waitingBackoffMs } : {}),
    onChanged: (id) => api.events.publish("entity.changed", { kind: "agent-session", id, op: "updated" }),
    document: { name: WORKSPACE_DOCUMENT, changed: () => api.events.publish("entity.changed", { kind: "agent-workspace", id: WORKSPACE_DOCUMENT, op: "updated" }) },
    onBlocked: async (sess) => {
      lifetime.signal.throwIfAborted();
      const w = sess.waiting;
      if (!w) return;
      const what = w.kind === "permission" ? "需要批准" : w.kind === "question" ? "有问题要回答" : w.kind === "auth" ? "需要登录授权" : "需要你操作";
      const dispatchId = dispatchStore.owner(sess.id);
      if (dispatchId) {
        if (!sessions.pinWaitingOwner(sess.id, w.n, dispatchId)) return;
        const execution = dispatchStore.read(dispatchId)?.execution;
        const current = await sessions.executionSession(sess.id);
        if (!execution || !current || current.finished || launchHash(execution.sessionBinding) !== launchHash(current.binding) || dispatchStore.owner(sess.id) !== dispatchId) {
          throw new HuhuError("RUN_UNKNOWN", "无法核对等待信号的原会话与任务");
        }
        if (sessions.setWaitingTaskRun(sess.id, w.n, { taskId: execution.taskId, runId: execution.runId })) {
          opts.notify?.({ title: `${sess.name}：${what}`, module: "agent-cli" });
        }
        return;
      }
      if (w.ownerDispatchId) return;
      if (sess.controlled) throw new HuhuError("RUN_UNKNOWN", "受控会话的任务运行尚未核对");
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
      lifetime.signal.throwIfAborted();
      const commentId = `session-${sess.id}-w-${w.n}`;
      await api.call("tasks.comments.add", { taskId: created.id, id: commentId, source: "agent", author: sess.name, session: sess.id, event: "waiting", body: `${what}${w.msg ? `：${w.msg}` : ""}` }, { idempotencyKey: commentId });
    },
  });
  waiting.start();
  ctx.effect(() => () => waiting.stop()); // 停用时关闭订阅连接；重新启用后 apply 再次运行，重连并用快照补齐期间的 blocked
  const workspaceLayout = registerWorkspaceLayout(api, {
    core: async () => {
      const client = await core.ensure();
      waiting.poke();
      return client;
    },
    readCore: async () => {
      const client = await core.workspaceConnection();
      if (client) waiting.poke();
      return client;
    },
    spaces,
    sessions,
    readOnly: api.vault.files.readOnly,
    signal: lifetime.signal,
  });

  api.defineCapability(def({ name: "agent.spaces.list", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false, input: z.object({}), output: z.array(SpaceSchema), handler: () => spaces.list() }));
  api.defineCapability(
    def({
      name: "agent.spaces.save",
      plugin: "agent-cli",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: z.object({ id: z.string().optional(), name: z.string(), root: z.string(), expectedRevision: z.number().optional() }),
      output: SpaceSchema,
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
  const LaunchTarget = z.object({
    spaceId: z.string(),
    spaceRevision: z.number(),
    provider: z.enum(["claude", "codex", "pi", "shell"]),
    model: z.string().optional(),
    effort: z.string().optional(),
    fast: z.boolean().optional(),
    prompt: z.string().optional(),
    cwd: z.string().optional(),
    /** 终端命令（automations 的 terminal 动作）：provider 必须是 shell；解释规则来自 shell。 */
    command: z.string().min(1).max(4000).optional(),
    shell: z.enum(["default", "bash", "zsh", "sh", "powershell", "cmd"]).optional(),
  });
  const EnvironmentSelection = z.strictObject({ id: z.uuidv4(), revision: z.uuidv4() });
  const ApprovedEnvironment = EnvironmentSelection.extend({ approval: z.string().regex(/^[0-9a-f]{64}$/) });
  const InteractiveTarget = LaunchTarget.omit({ command: true, shell: true });
  const WorkspaceLaunch = InteractiveTarget.extend({
    requestId: z.string().regex(/^[A-Za-z0-9_-]{8,110}$/),
    baseVersion: z.int().nonnegative(),
    target: WorkspaceTargetSchema,
  }).strict();
  api.defineCapability(
    def({
      name: "agent.launch.environments.preview",
      plugin: "agent-cli",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      desktopOnly: true,
      input: InteractiveTarget.extend({ environment: EnvironmentSelection }).strict(),
      output: z.strictObject({ environment: ApprovedEnvironment, cwd: z.string(), argv: z.array(z.string()), ordinaryNames: z.array(z.string()), protectedNames: z.array(z.string()) }),
      handler: (_c, { environment, ...input }) => sessions.previewEnvironment(input, environment),
    }),
  );
  const SessionPreview = z.object({ machineId: z.string(), cwd: z.string(), command: z.string().nullable(), argv: z.array(z.string()) });
  api.defineCapability(
    def({
      name: "agent.launch.resolve",
      plugin: "agent-cli",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: z.union([
        z.strictObject({ session: LaunchTarget }),
        z.object({
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
      ]),
      output: z.union([
        SessionPreview,
        z.object({ command: z.string(), argv: z.array(z.string()), env: z.record(z.string(), z.string()), stdin: z.string().optional(), warnings: z.array(z.string()), unsupported: z.literal("headless").optional() }),
      ]),
      handler: (_c, i) => ("session" in i ? sessions.preview(i.session) : resolve(i)),
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
        taskRun: z.object({ taskId: z.string(), runId: z.string() }).optional(),
        handled: z.number().optional(),
      })
      .optional(),
  });
  const Id = z.object({ id: z.string() });
  const Ok = z.object({ ok: z.literal(true) });
  api.defineCapability(
    def({
      name: "agent.sessions.recover",
      plugin: "agent-cli",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: Id.strict(),
      output: Session,
      handler: async ({ signal }, { id }) => publicSession(await sessions.recover(id, signal)),
    }),
  );
  api.defineCapability(
    def({
      name: "agent.sessions.launch",
      plugin: "agent-cli",
      scope: "execute",
      exposable: false,
      defaultExposed: false,
      input: LaunchTarget.extend({ requestId: z.string().min(8) }).strict(),
      output: Session,
      handler: async (c, i) => {
        if (i.command !== undefined && i.provider !== "shell") throw errors.invalidInput("只有终端会话可以运行指定命令");
        const s = await sessions.launch(i, c.signal);
        waiting.poke(); // Core 可能刚被这次启动拉起：立刻订阅，不等退避
        return publicSession(s);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "agent.workspace.launch",
      plugin: "agent-cli",
      scope: "execute",
      exposable: false,
      defaultExposed: false,
      input: WorkspaceLaunch,
      output: WorkspaceLaunchViewSchema,
      handler: async ({ signal }, { baseVersion, target, ...launch }) => {
        const view = await workspaceLayout.launch(launch, target, baseVersion, signal);
        waiting.poke();
        return view;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "agent.workspace.launchProtected",
      plugin: "agent-cli",
      scope: "execute",
      exposable: false,
      defaultExposed: false,
      desktopOnly: true,
      input: WorkspaceLaunch.extend({ environment: ApprovedEnvironment }),
      output: WorkspaceLaunchViewSchema,
      handler: async ({ signal }, { baseVersion, target, ...launch }) => {
        const view = await workspaceLayout.launch(launch, target, baseVersion, signal);
        waiting.poke();
        return view;
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
      idempotency: "handler",
      exposable: false,
      defaultExposed: false,
      input: z.object({ id: z.string(), requestId: z.string().min(1) }),
      output: z.object({ ok: z.literal(true) }),
      handler: async (c, i) => (await sessions.release(i.id, i.requestId, c.signal), { ok: true as const }),
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
        return sessions.list(i.spaceId).map(publicSession);
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
    def({
      name: "agent.sessions.rename",
      plugin: "agent-cli",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: Id.extend({ name: z.string() }),
      output: Session,
      handler: (_c, i) => publicSession(sessions.rename(i.id, i.name)),
    }),
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
      handler: () => core.statusIfRunning(),
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
    if (!spaceCanLaunch(sp)) throw new HuhuError("SPACE_INVALID", "请先绑定 Space 工作目录");
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
        return sessions
          .launch({ spaceId: sp.id, spaceRevision: i.spaceRevision, provider: i.provider, requestId: i.requestId, resumeSessionId: hit.nativeSessionId, cwd: hit.cwd }, _c.signal)
          .then(publicSession)
          .finally(() => resuming.delete(key));
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
  api.provide("agentProtectedTerminal", {
    launch: async (input: Parameters<SessionsService["launch"]>[0] & { provider: "shell"; env: Record<string, string>; command: string }, signal?: AbortSignal) => {
      const session = await sessions.launch(input, signal);
      waiting.poke();
      return { id: session.id };
    },
  });
  api.provide("terminalBridge:agent", createTerminalBridge({ sessions, core, ownership, signal: lifetime.signal }));
  return { spaces, detector, sessions, core };
}
