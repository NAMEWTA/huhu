import type { Context } from "@huhu/cordis";
import { bindCapability, defineCapability as def, type CapabilityContext, type HuhuApi } from "@huhu/kernel";
import { isAgentTool, vaultWorkspaceDirectory, workspaceStamp } from "./tool-access.js";
import { errors, HuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { filesystemIdentity, machineId, protectedKindOf } from "@huhu/vault";
import { lstatSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { mainAgentDescriptors, type HistoryLaunchInput, type HistoryReference, type HistoryScope, type SessionSelection } from "./capabilities.js";
import { HerdrCore } from "./herdr-core.js";
import { HistoryProjection, historyProfileKey, isUuidHistoryId, isValidNativeId, isWithin, nativeHistoryCandidates, nativeHistoryProfile, nativeHistorySourceMatches, readHistoryEntry, readSelectedHistory, type HistoryEntry } from "./history/scanner.js";
import { readTranscript } from "./history/transcript.js";
import { reviewDiff } from "./review.js";
import { PinStore } from "./pins.js";
import { AgentDetector, probeHistory, supportsPiHistory, type DetectInfo } from "./detect.js";
import { resolveAgentLaunch, type HistoryLaunch } from "./launch.js";
import { AgentSettingsStore } from "./settings.js";
import { entryOf, type AgentSettingsFile } from "../shared/settings.js";
import { WaitingWatcher } from "./waiting.js";
import { publicSession, sessionGeneration, SessionsService, type LaunchInput, type SessionRecord } from "./sessions.js";
import { createTerminalBridge } from "./terminal-bridge.js";
import { SpaceStore } from "./spaces.js";
import { AgentDispatch, type DispatchProvider, type ResumeTarget } from "./dispatch.js";
import { AgentDispatchStore, type DispatchLookup } from "./dispatch-store.js";
import { registerDispatch } from "./dispatch-capabilities.js";
import { InputOwnership } from "./input-ownership.js";
import { agentById, type AgentId } from "../shared/catalog.js";
import { CodexDispatch, type CodexDispatchOptions } from "./codex-dispatch.js";
import { ExecutionReceipts, pollExecutionReceipts } from "./execution-receipts.js";
import { registerAgentEnvironments, type AgentCredentialHost } from "./launch-environment.js";
import { ProtectedLaunch } from "./protected-launch.js";
import { launchHash } from "./launch-binding.js";
import { sessionPlacement, WORKSPACE_DOCUMENT } from "../shared/workspace-layout.js";
import { registerWorkspaceLayout } from "./workspace-layout.js";
import { agentCoreOptions, readWorkspacePackage } from "./workspace-package.js";
import { InteractiveEnvironment } from "./interactive-environment.js";
import { spaceCanLaunch, type Space } from "../shared/space.js";
import { registerWorkspaceFiles } from "./workspace-files.js";
import { registerWorkspaceWorktrees } from "./workspace-worktrees.js";

export { agentToolDescriptors } from "./capabilities.js";
export { HerdrCore } from "./herdr-core.js";
export { SessionsService } from "./sessions.js";
export { createTerminalBridge, type TerminalBridge } from "./terminal-bridge.js";
export { AgentDetector } from "./detect.js";
export { resolveAgentLaunch } from "./launch.js";
export { AgentSettingsStore } from "./settings.js";
export { SpaceStore } from "./spaces.js";
export { validateWorkspacePackage, workspacePackagePath, workspacePackageSnapshot } from "./workspace-package.js";
export { AgentDispatchTargetInfoSchema, AgentDispatchResponseSchema } from "./dispatch-capabilities.js";
export { DispatchInput as AgentDispatchInputSchema, DispatchTarget as AgentDispatchTargetSchema } from "./dispatch-store.js";
export { NativeStop as AgentNativeStopInputSchema, NativeStopStatus as AgentNativeStopStatusSchema } from "./native-stop.js";
export { nativeTerminalCodes } from "./codex-dispatch.js";

function summarizeSettings(settings: AgentSettingsFile): AgentSettingsFile {
  return {
    ...settings,
    agents: Object.fromEntries(Object.entries(settings.agents).map(([id, { command: _command, env: _env, args: _args, ...summary }]) => [id, summary])),
  };
}

export interface AgentCliOptions {
  /** 历史扫描的 HOME 与环境（测试用；缺省为进程的真实值）。 */
  history?: { home?: string; env?: NodeJS.ProcessEnv };
  /** herdr-core 可执行文件；缺省读 HUHU_HERDR_BIN，再退回应用资源目录。 */
  herdrBin?: string;
  /** 站内通知（程序在会话里等人工时）。 */
  /** 测试用：缩短订阅的重连间隔。 */
  waitingBackoffMs?: { min: number; max: number };
  /** Engine-owned provider protocols. Omit a provider that cannot prove input acceptance. */
  dispatchProviders?: Partial<Record<AgentId, DispatchProvider>>;
  codexDispatch?: CodexDispatchOptions | undefined;
  credentialHost?: AgentCredentialHost;
  receiptCheckMs?: number;
  dispatchBudget?: import("@huhu/vault").DeviceDispatchBudget;
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
  detector.snapshot();
  const codexHistoryRuntime = {
    node: process.env["HUHU_NODE_BIN"] ?? process.execPath,
    helper: process.env["HUHU_CODEX_DISPATCH_HELPER"] ?? path.join(import.meta.dirname, "codex-dispatch-helper.cjs"),
  };
  const resolve = async (input: Parameters<typeof resolveAgentLaunch>[1]) => {
    const settings = settingsStore.get();
    const locatedCommand = input.preview ? null : (detector.locate(input.agentId, settings)?.path ?? null);
    const resolved = resolveAgentLaunch({ settings, locatedCommand }, input);
    if (input.agentId === "pi" && input.history && !(await supportsPiHistory(resolved.command, input.history.mode, { ...process.env, ...resolved.env }))) {
      throw errors.invalidInput(input.history.mode === "fork" ? "当前 Pi CLI 未报告创建分支所需的 --fork 和 --session-id" : "当前 Pi CLI 未报告恢复所需的 --session");
    }
    if ((input.agentId === "claude" || input.agentId === "codex") && input.history) {
      const support = await probeHistory(input.agentId, resolved.command, { ...process.env, ...resolved.env });
      if (!support[input.history.mode]) throw errors.invalidInput(historySupportMessage(input.agentId, input.history.mode));
    }
    if (resolved.nativeSessionId && !(await supportsPiHistory(resolved.command, "new", { ...process.env, ...resolved.env }))) {
      return resolveAgentLaunch({ settings, locatedCommand }, { ...input, newPiId: undefined });
    }
    return resolved;
  };
  const mid = machineId();
  const vaultId = api.vault.vaultId;
  const lifetime = new AbortController();
  const protectedLaunch = new ProtectedLaunch(process.env["HUHU_NODE_BIN"] ?? process.execPath, process.env["HUHU_PROTECTED_LAUNCH_HELPER"] ?? path.join(import.meta.dirname, "protected-launch-helper.cjs"));
  const dispatchStore = new AgentDispatchStore(api.vault.stateDir, api.vault.files, { vaultId, machineId: mid });
  const resumeAbandoned = (dispatchId: string) => {
    const record = dispatchStore.read(dispatchId);
    return record?.write === "not_sent" && api.service<{ abandoned(key: DispatchLookup): boolean }>("taskResumeClaims")?.abandoned(record.key) === true;
  };
  const ownership = new InputOwnership(
    (id) => {
      const active = dispatchStore.owner(id);
      if (active) return active;
      const pending = sessions.resumeOwner(id);
      if (pending && (dispatchStore.read(pending)?.write ?? "not_sent") === "not_sent" && !resumeAbandoned(pending)) return pending;
    },
    (id) => sessions.reviewInputPending(id),
  );
  const core = new HerdrCore({
    ...agentCoreOptions(vaultId, api.vault.stateDir, opts.herdrBin),
    signal: lifetime.signal,
  });
  ctx.effect(() => () => {
    const { code, message, details, recovery } = errors.pluginDisabled("agent-cli");
    lifetime.abort(new HuhuError(code, message, { ...(details && { details }), ...(recovery && { recovery }), retryable: true }));
    core.dispose();
    protectedLaunch.close();
  });
  const publishSessionChanged = (id: string) => api.events.publish("entity.changed", { kind: "agent-session", id, op: "updated" });
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
    codexHistoryRuntime,
    onHistoryIdentityConfirmed: publishSessionChanged,
    protectedLaunch,
    interactiveEnvironment,
    ...(opts.dispatchBudget && { dispatchBudget: opts.dispatchBudget }),
  });
  const nativeProvider: DispatchProvider = { id: "codex-app-server-v1", modes: ["new", "existing", "resume"], transport: "native" };
  const providers = { ...(codex?.configured && { codex: nativeProvider }), ...opts.dispatchProviders };
  const dispatch = new AgentDispatch({
    vaultId,
    readOnly: api.vault.files.readOnly,
    spaces,
    sessions,
    detector,
    ownership,
    store: dispatchStore,
    providers,
    resumeTargets,
    launchResume: launchDispatchResume,
    resumeAbandoned,
    signal: lifetime.signal,
  });
  registerDispatch(api, dispatch);
  if (opts.codexDispatch && !api.vault.files.readOnly) {
    const receipts = new ExecutionReceipts(path.join(opts.codexDispatch.root, "agent-receipts"), { vaultId, machineId: mid });
    ctx.effect(() =>
      pollExecutionReceipts(
        api,
        dispatchStore,
        sessions,
        receipts,
        lifetime.signal,
        opts.receiptCheckMs ?? 5_000,
        (execution) => dispatch.reconcileNative(execution),
        async () => {
          await sessions.releaseAbandonedResumes(resumeAbandoned);
          await sessions.reconcileDispatchResources();
        },
      ),
    );
  }

  // 会话里的程序经 OSC 7501 上报 blocked（等人工）：不用等进程退出，几秒内显示“需要你操作”
  const waiting = new WaitingWatcher({
    endpoint: core.endpoint,
    vaultId: api.vault.vaultId,
    sessions,
    ...(opts.waitingBackoffMs ? { backoffMs: opts.waitingBackoffMs } : {}),
    onChanged: publishSessionChanged,
    document: { name: WORKSPACE_DOCUMENT, changed: () => api.events.publish("entity.changed", { kind: "agent-workspace", id: WORKSPACE_DOCUMENT, op: "updated" }) },
    onBlocked: async (sess) => {
      lifetime.signal.throwIfAborted();
      const w = sess.waiting;
      if (!w) return;
      const dispatchId = dispatchStore.owner(sess.id);
      if (!dispatchId) {
        if (sess.controlled && !w.ownerDispatchId) throw new HuhuError("RUN_UNKNOWN", "受控会话的任务运行尚未核对");
        return;
      }
      if (!sessions.pinWaitingOwner(sess.id, w.n, dispatchId)) return;
      const execution = dispatchStore.read(dispatchId)?.execution;
      const current = await sessions.executionSession(sess.id);
      if (!execution || !current || current.finished || launchHash(execution.sessionBinding) !== launchHash(current.binding) || dispatchStore.owner(sess.id) !== dispatchId) {
        throw new HuhuError("RUN_UNKNOWN", "无法核对等待信号的原会话与任务");
      }
      sessions.setWaitingTaskRun(sess.id, w.n, { taskId: execution.taskId, runId: execution.runId });
    },
  });
  api.provide("agentObservation", { status: (id: string) => sessions.observeStatus(id) });
  waiting.start();
  ctx.effect(() => () => waiting.stop()); // 停用时关闭订阅连接；重新启用后 apply 再次运行，重连并用快照补齐期间的 blocked
  const workspaceLayout = registerWorkspaceLayout(api, {
    core: async () => {
      const client = await core.ensure();
      waiting.poke();
      return client;
    },
    readCore: async (start) => {
      const client = await core.workspaceConnection(start);
      if (client && start) waiting.poke();
      return client;
    },
    readRestored: () => readWorkspacePackage(api.vault.files),
    spaces,
    sessions,
    readOnly: api.vault.files.readOnly,
    signal: lifetime.signal,
  });

  const writable = () => api.vault.files.assertWritable();
  const checkedSession = ({ caller }: CapabilityContext, id: string, selection: z.infer<typeof SessionSelection>, check: "binding" | "version" | "space") => {
    if (!isAgentTool(caller)) return;
    const session = sessions.get(id);
    if (!selection.spaceId || selection.spaceId !== session.spaceId || selection.spaceRevision === undefined) throw errors.notFound("没有找到选定 Space 的会话");
    const space = spaces.validateForLaunch(selection.spaceId, selection.spaceRevision);
    vaultWorkspaceDirectory(space.root, session.cwd);
    if (check === "binding" && (!selection.generation || sessionGeneration(session) !== selection.generation)) throw new HuhuError("VERSION_CONFLICT", "会话进程代次已变化或无法核实");
    if (check === "version" && selection.expectedRevision !== launchHash(session)) throw errors.versionConflict(launchHash(session));
    return session;
  };
  const sessionView = (c: CapabilityContext, session: SessionRecord) => {
    const view = publicSession(session);
    if (!isAgentTool(c.caller)) return view;
    const { command: _command, error: _error, waiting: _waiting, reviewComments: _comments, ...safe } = view;
    const generation = sessionGeneration(session);
    const name = session.command && safe.name.startsWith("命令：") ? "终端命令" : safe.name;
    return { ...safe, name, ...(generation && { generation }), spaceRevision: spaces.get(session.spaceId).revision, revision: launchHash(session) };
  };
  const launchKey = (c: CapabilityContext, requestId: string) => {
    if (!isAgentTool(c.caller)) return requestId;
    if (!/^[A-Za-z0-9_-]{8,110}$/.test(requestId)) throw errors.invalidInput("请求标识无效");
    return `tool-${launchHash([c.subject, requestId])}`;
  };
  const externalLaunch = <T extends LaunchInput>(c: CapabilityContext, launch: T): T => {
    if (!isAgentTool(c.caller)) return launch;
    writable();
    if (launch.command !== undefined || launch.shell !== undefined) throw errors.permissionDenied("自定义终端命令");
    const space = spaces.validateForLaunch(launch.spaceId, launch.spaceRevision);
    vaultWorkspaceDirectory(space.root, launch.cwd ?? space.root);
    return { ...launch, requestId: launchKey(c, launch.requestId) };
  };
  const replayableSession = (c: CapabilityContext, session: SessionRecord, requestId: string) => {
    const projected = sessionView(c, session);
    return isAgentTool(c.caller) ? { ...projected, requestId } : projected;
  };
  api.defineCapability(bindCapability(mainAgentDescriptors.spacesList, () => spaces.list()));
  api.defineCapability(bindCapability(mainAgentDescriptors.dispatchWriteApproval, ({ caller, signal }, { id, expectedRevision, allowed }) => {
    if (caller !== "desktop") throw errors.permissionDenied("需要在本机桌面批准工作区写入");
    signal.throwIfAborted();
    spaces.approveDispatchWrite(id, expectedRevision, allowed);
    return { allowed };
  }));
  api.defineCapability(
    bindCapability(mainAgentDescriptors.spacesSave, ({ caller }, i) => {
      const external = isAgentTool(caller);
      if (external && !i.id && i.expectedRevision !== undefined) throw errors.invalidInput("新建 Space 时不应指定已有版本");
      const existing = external && i.id ? spaces.get(i.id) : undefined;
      if (existing && existing.revision !== i.expectedRevision) throw errors.versionConflict(String(existing.revision));
      const directory = external && (!spaceCanLaunch(existing) || existing?.root !== i.root) ? vaultWorkspaceDirectory(root, i.root) : i.root;
      if (existing?.root !== directory && existing && sessions.list(existing.id).some((s) => s.state === "running" || s.state === "launching" || s.state === "unknown")) {
        throw errors.invalidInput("这个 Space 还有运行中或待核实的会话");
      }
      return spaces.save({ name: i.name, root: directory, ...(i.id ? { id: i.id } : {}), ...(i.expectedRevision !== undefined ? { expectedRevision: i.expectedRevision } : {}) });
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.spacesDelete, async ({ caller, signal }, i) => {
      writable();
      const external = isAgentTool(caller);
      if (external) {
        const current = spaces.get(i.id);
        if (i.expectedRevision !== current.revision) throw errors.versionConflict(String(current.revision));
      } else await sessions.reconcile();
      signal.throwIfAborted();
      if (sessions.list(i.id).some((x) => x.state === "running" || x.state === "launching" || (external && x.state === "unknown"))) {
        throw errors.invalidInput("这个 Space 还有运行中或待核实的会话，请先核对再删除");
      }
      spaces.delete(i.id);
      pins.clear(i.id);
      return { ok: true as const };
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.catalogDetect, ({ caller }) => {
      const snapshot = detector.cached();
      if (isWorkbenchCaller(caller)) return snapshot.map((entry) => ({
        ...entry, models: agentById(entry.id)?.options.models ?? [],
      }));
      return snapshot.map(({ id, displayName, installed, skipped, headless, detectedAt }) => ({ id, displayName, installed, skipped, headless, detectedAt }));
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.catalogRefresh, ({ caller }) => {
      if (!isWorkbenchCaller(caller)) throw errors.permissionDenied("刷新 Agent CLI 检测");
      return detector.detect(true);
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.settingsGet, ({ caller }) => {
      const current = settingsStore.read();
      return isAgentTool(caller) ? { ...current, settings: summarizeSettings(current.settings) } : current;
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.settingsUpdate, ({ caller, parentOperationId }, i) => {
      writable();
      const external = isAgentTool(caller);
      if (external) {
        for (const [id, entry] of Object.entries(i.agents)) {
          if (!agentById(id)) throw errors.invalidInput("未知的 Agent 配置");
          if (entry.command?.trim() && !detector.locate(id, { ...settingsStore.get(), agents: { [id]: { ...entry, enabled: true } } })) {
            throw errors.invalidInput("本机找不到配置的 Agent 命令");
          }
        }
      }
      const out = settingsStore.write({ defaultAgent: i.defaultAgent, agents: i.agents }, i.expectedRevision);
      detector.invalidate(); // command / enabled 可能变了，旧检测结果不再可信
      detector.snapshot();
      return external || parentOperationId ? summarizeSettings(out) : out;
    }),
  );
  const environmentPreview = new Map<string, { input: string; view: Awaited<ReturnType<SessionsService["previewEnvironment"]>> }>();
  api.defineCapability(
    bindCapability(mainAgentDescriptors.launchEnvironmentsPreview, async ({ caller }, { environment, ...input }) => {
      const key = launchHash([input, environment, settingsStore.get().revision]);
      if (isAgentTool(caller)) {
        const space = spaces.validateForLaunch(input.spaceId, input.spaceRevision);
        vaultWorkspaceDirectory(space.root, input.cwd ?? space.root);
        const snapshot = environmentPreview.get(environment.id);
        if (snapshot?.input !== key) throw errors.notFound("当前环境没有可核实的本机启动预览");
        const { argv, ...view } = snapshot.view;
        return { ...view, environment, argv: argv.length ? [argv[0]!, "…"] : [] };
      }
      const view = await sessions.previewEnvironment(input, environment);
      environmentPreview.set(environment.id, { input: key, view });
      return view;
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.launchResolve, async ({ caller }, { session, agentId, mode, ...options }) => {
      const external = isAgentTool(caller);
      if (session) {
        if (agentId !== undefined || mode !== undefined || Object.keys(options).length) throw errors.invalidInput("请选择一种启动预览");
        if (!external) return sessions.preview(session);
        if (session.command !== undefined) throw errors.permissionDenied("自定义终端命令预览");
        const space = spaces.validateForLaunch(session.spaceId, session.spaceRevision);
        vaultWorkspaceDirectory(space.root, session.cwd ?? space.root);
        const view = await sessions.preview(session);
        return { ...view, argv: session.provider !== "shell" && settingsStore.get().agents[session.provider]?.args ? ["…"] : view.argv };
      }
      if (!agentId || !mode) throw errors.invalidInput("请指定 Agent 和启动模式");
      const resolved = await resolve({ agentId, mode, ...options });
      if (!external) return resolved;
      const { env: _env, stdin: _stdin, ...view } = resolved;
      return { ...view, argv: (options.draft ?? settingsStore.get().agents[agentId])?.args ? ["…"] : view.argv, env: {} };
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.sessionsRecover, async (c, i) => {
      writable();
      const selected = checkedSession(c, i.id, i, "space");
      if (selected && (!i.requestId || selected.requestId !== launchKey(c, i.requestId))) throw errors.notFound("原启动请求不属于当前工具会话");
      const session = await sessions.recover(i.id, c.signal);
      return replayableSession(c, session, i.requestId ?? session.requestId);
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.sessionsLaunch, async (c, i) => {
      if (i.command !== undefined && i.provider !== "shell") throw errors.invalidInput("只有终端会话可以运行指定命令");
      const s = await sessions.launch(externalLaunch(c, i), c.signal);
      waiting.poke(); // Core 可能刚被这次启动拉起：立刻订阅，不等退避
      return replayableSession(c, s, i.requestId);
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.workspaceLaunch, async (c, { baseVersion, target, ...launch }) => {
      const view = await workspaceLayout.launch(externalLaunch(c, launch), target, baseVersion, c.signal);
      waiting.poke();
      return view;
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.workspaceLaunchProtected, async (c, { baseVersion, target, ...launch }) => {
      const authorized = externalLaunch(c, launch);
      if (isAgentTool(c.caller) && !sessions.hasLaunchAttempt(authorized.requestId)) {
        const {
          environment: { approval, ...environment },
          requestId: _requestId,
          ...input
        } = launch;
        const snapshot = environmentPreview.get(environment.id);
        if (snapshot?.input !== launchHash([input, environment, settingsStore.get().revision]) || snapshot.view.environment.approval !== approval) {
          throw errors.permissionDenied("使用未经本机工作台核对的受保护启动计划");
        }
      }
      const view = await workspaceLayout.launch(authorized, target, baseVersion, c.signal);
      waiting.poke();
      return view;
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.sessionsOutput, (c, i) => {
      const selected = checkedSession(c, i.id, i, "binding");
      if (!selected) return sessions.output(i.id, i.lines);
      if (selected.launchReceipt?.attempt?.nativeStatus) return { text: "受保护启动的输出仅在原工作区终端可看", complete: false };
      const observer = core.connected;
      if (!observer) return { text: "当前连接无法核对原终端输出", complete: false };
      return sessions.output(i.id, i.lines, observer);
    }),
  );
  api.defineCapability(
    def({
      name: "agent.sessions.release",
      plugin: "agent-cli",
      scope: "execute",
      idempotency: "handler",
      exposable: false,
      defaultExposed: false,
      input: z.object({ id: z.string(), requestId: z.string().min(1) }),
      output: z.object({ ok: z.literal(true) }),
      handler: async (c, i) => {
        if (c.caller !== "plugin:automations") throw errors.permissionDenied("自动化终端清理");
        await sessions.release(i.id, i.requestId, c.signal);
        return { ok: true as const };
      },
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.sessionsList, (c, i) => {
      if (!isAgentTool(c.caller)) return sessions.list(i.spaceId).map(publicSession);
      if (i.spaceId) spaces.get(i.spaceId);
      const known = new Map(
        spaces
          .list()
          .filter(spaceCanLaunch)
          .map((space) => [space.id, space.root]),
      );
      return sessions.list(i.spaceId).flatMap((session) => {
        const directory = known.get(session.spaceId);
        if (!directory) return [];
        try {
          vaultWorkspaceDirectory(directory, session.cwd);
          return [sessionView(c, session)];
        } catch {
          return [];
        }
      });
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.sessionsInterrupt, async (c, i) => {
      writable();
      const selected = checkedSession(c, i.id, i, "binding");
      await sessions.interrupt(i.id, selected && i.generation);
      return { ok: true as const };
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.sessionsKill, async (c, i) => {
      writable();
      const selected = checkedSession(c, i.id, i, "binding");
      await sessions.kill(i.id, selected && i.generation);
      return { ok: true as const };
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.sessionsRename, (c, i) => {
      writable();
      checkedSession(c, i.id, i, "version");
      return sessionView(c, sessions.rename(i.id, i.name));
    }),
  );
  api.defineCapability(bindCapability(mainAgentDescriptors.coreStatus, ({ caller }) => core.statusIfRunning(!isAgentTool(caller))));
  let restarting = false;
  api.defineCapability(
    bindCapability(mainAgentDescriptors.coreRestart, async ({ caller, signal }, { expectedCoreId, expectedPid }) => {
      writable();
      const external = isAgentTool(caller);
      if (restarting) throw errors.invalidInput("Core 正在重启");
      restarting = true;
      try {
        if (external) {
          if (expectedCoreId === undefined || (expectedCoreId === null) !== (expectedPid === undefined)) throw errors.invalidInput("请提供 Core 标识和进程编号，空闲时标识为 null");
          await core.assertInstance(expectedCoreId, expectedPid);
        }
        signal.throwIfAborted();
        await core.stop();
        if (external) {
          await core.ensure().catch(() => undefined);
          const current = await core.statusIfRunning(false);
          if (current.state !== "connected" || (expectedCoreId !== null && (current.coreId !== expectedCoreId || current.pid === expectedPid))) {
            throw new HuhuError("RUN_UNKNOWN", "无法核实受管 Core 的重启结果", { details: { outcome: "unknown" } });
          }
          return current;
        }
        return core.status();
      } finally {
        restarting = false;
      }
    }),
  );
  const spaceOf = (id: string) => {
    const sp = spaces.list().find((x) => x.id === id);
    if (!sp) throw errors.notFound("Space 不存在");
    if (!spaceCanLaunch(sp)) throw new HuhuError("SPACE_INVALID", "请先绑定 Space 工作目录");
    return sp;
  };
  const pins = new PinStore(path.join(api.vault.stateDir, "agent-cli", "pins.json"));
  const resuming = new Map<string, { requestId: string; count: number }>();
  const historyProjection = new HistoryProjection(lifetime.signal);
  const historyRoots = (i: z.infer<typeof HistoryScope>) => {
    const sp = spaceOf(i.spaceId);
    return i.allSpaces
      ? [
          ...new Set(
            spaces
              .list()
              .filter(spaceCanLaunch)
              .map((space) => space.root),
          ),
        ].sort()
      : [sp.root];
  };
  function historyScanEnvironment() {
    const settings = settingsStore.get();
    const env = { ...(opts.history?.env ?? process.env) };
    for (const provider of ["claude", "codex"] as const) {
      const key = historyProfileKey(provider);
      const configured = entryOf(settings, provider).env?.[key];
      if (configured !== undefined) env[key] = configured;
    }
    for (const key of ["PI_CODING_AGENT_DIR", "PI_CODING_AGENT_SESSION_DIR"]) {
      const configured = entryOf(settings, "pi").env?.[key];
      if (configured !== undefined) env[key] = configured;
    }
    return env;
  }
  const historyScope = (roots: string[], env = historyScanEnvironment()) => ({ roots, ...(opts.history?.home ? { home: opts.history.home } : {}), env });
  const nativeKey = (e: Pick<HistoryEntry, "provider" | "nativeSessionId">) => `${e.provider}:${e.nativeSessionId}`;
  const liveHistoryKey = (provider: SessionRecord["provider"], id: string) => `${provider}:${provider === "codex" ? id.toLowerCase() : id}`;
  const matchesHistory = (session: SessionRecord, e: HistoryEntry) => session.provider === e.provider && session.nativeSessionId === e.nativeSessionId && session.historyId === e.historyId;
  const mayBeSameHistory = (session: SessionRecord, e: HistoryEntry, fileIdentity: string | null) => {
    if (session.provider !== e.provider) return false;
    const source = session.historyLaunch?.history;
    const id = session.nativeSessionId ?? source?.nativeId;
    if (e.provider === "codex") {
      if (id?.toLowerCase() !== e.nativeSessionId.toLowerCase()) return false;
      if (source?.mode === "fork") return session.historyId === e.historyId;
      return source?.file ? path.relative(source.file, e.file) === "" : !session.historyId || session.historyId === e.historyId;
    }
    if (id !== e.nativeSessionId) return false;
    if (e.provider === "pi" && source?.mode === "resume" && source.file) {
      return path.relative(source.file, e.file) === "" || (fileIdentity !== null && piFileIdentity(source.file) === fileIdentity);
    }
    return path.relative(session.cwd, e.cwd) === "";
  };
  const blocksHistoryLaunch = (session: SessionRecord) => session.state === "running" || session.state === "launching" || session.state === "unknown";
  function historySourceBlocked(entry: HistoryEntry, profile?: string, candidates?: ReadonlyMap<string, string | null>): string | null {
    try {
      if (statSync(entry.cwd).isDirectory()) {
        if (entry.provider === "pi") return null;
        if (!isUuidHistoryId(entry.nativeSessionId)) return "当前记录没有有效的原生会话 UUID，仅可预览";
        const matches = candidates ? candidates.get(entry.nativeSessionId.toLowerCase()) === entry.file : nativeHistorySourceMatches(entry, profile);
        return matches ? null : "原生会话来源已变化、资料目录不可访问或标识不唯一，请重新查询";
      }
    } catch {
      // The directory can disappear after the scan.
    }
    return "历史会话的原工作目录不存在或不可访问";
  }
  function historySupportMessage(provider: HistoryEntry["provider"], action: HistoryLaunch["mode"]): string {
    const operation = action === "resume" ? "恢复" : "分支";
    return `当前 ${agentById(provider)?.displayName ?? provider} CLI 未报告支持原生历史${operation}`;
  }
  function historyArgs(entry: HistoryEntry, action: HistoryLaunch["mode"], requestId: string, profile?: string): NonNullable<LaunchInput["history"]> {
    const source = {
      sourceId: entry.historyId,
      nativeId: entry.nativeSessionId,
      file: entry.file,
      revision: entry.revision,
      ...(entry.provider !== "pi" && { sourceCwd: entry.cwd }),
      ...(profile && { profile }),
    };
    if (action === "resume") return { ...source, mode: "resume" };
    const hash = launchHash([vaultId, mid, requestId]);
    const forkId = entry.provider === "pi" ? `huhu-${hash}` : entry.provider === "claude" ? `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}` : undefined;
    return { ...source, mode: "fork", ...(forkId && { forkId }) };
  }
  function inDispatchSpace(space: Space, entry: HistoryEntry): boolean {
    try {
      return isUuidHistoryId(entry.nativeSessionId) && vaultWorkspaceDirectory(space.root, entry.cwd) === entry.cwd;
    } catch {
      return false;
    }
  }
  function resumeLaunchInput(space: Space, profile: string, entry: HistoryEntry, dispatchId: string) {
    return {
      spaceId: space.id,
      spaceRevision: space.revision,
      provider: "codex" as const,
      controlled: "codex" as const,
      cwd: entry.cwd,
      history: historyArgs(entry, "resume", "", profile),
      resumeDispatchId: dispatchId,
    };
  }
  async function resumeTargets(space: Space, snapshot: boolean) {
    const profile = codex?.historyProfile;
    if (!profile || !spaceCanLaunch(space)) return [];
    // Selecting a cold dispatch target must see history written since the last browse snapshot.
    const projected = await historyProjection.scan({ roots: [space.root], env: { CODEX_HOME: profile }, providers: ["codex"] }, { fresh: !snapshot });
    const rows = projected.entries.filter((entry) => inDispatchSpace(space, entry));
    if (rows.length === 0) return [];
    const candidates = projected.candidates.get("codex") ?? new Map();
    const local = sessions.list().filter((session) => session.provider === "codex" && (session.nativeSessionId || session.historyLaunch));
    const records = snapshot || api.vault.files.readOnly ? local : await sessions.observeHistorySessions(local);
    return Promise.all(
      rows.map(async (entry) => {
        let reason: string | null = historySourceBlocked(entry, profile, candidates) ? "history_selection_changed" : null;
        let configurationId: string | null = null;
        if (!reason && snapshot) reason = "binding_unverified";
        if (!reason) {
          try {
            configurationId = await sessions.freezeLaunch(resumeLaunchInput(space, profile, entry, "catalog"), candidates);
            if (historyBusy(entry, records)) reason = "input_owned";
            else if (recentWriterConflict(entry, records)) reason = "history_writer_busy";
          } catch (error) {
            reason = error instanceof HuhuError && error.code !== "HEADLESS_UNSUPPORTED" ? error.code : "native_resume_evidence_unavailable";
          }
        }
        return {
          mode: "resume" as const,
          provider: "codex" as const,
          spaceId: space.id,
          spaceRevision: space.revision,
          history: { machineId: mid, spaceId: space.id, spaceRevision: space.revision, historyId: entry.historyId, historyRevision: entry.revision },
          nativeSessionId: entry.nativeSessionId,
          historyTitle: entry.title,
          configurationId,
          binding: null,
          available: !reason,
          reason,
        };
      }),
    );
  }
  async function launchDispatchResume(target: ResumeTarget, requestId: string, dispatchId: string, prepare: boolean, signal: AbortSignal): Promise<string | null> {
    const history = target.history;
    const configurationId = target.configurationId;
    if (!history || !configurationId || target.spaceRevision !== history.spaceRevision) throw errors.invalidInput("请重新选择原生历史");
    const selection = launchHash(target);
    const replay = sessions.historyLaunchReplay(requestId, selection);
    if (replay) {
      const original = await sessions.launch(replay, signal);
      if (sessions.resumeWriterBusy(original)) throw new HuhuError("RUN_UNKNOWN", "原生历史已有活动写入者", { details: { reason: "history_writer_busy" } });
      if (original.state === "exited" || original.state === "failed") throw errors.notFound("原受控恢复进程已退出");
      return original.id;
    }
    if (!prepare) return null;
    const sp = spaces.validateForLaunch(target.spaceId, history.spaceRevision);
    const profile = codex?.historyProfile;
    if (!profile) throw new HuhuError("HEADLESS_UNSUPPORTED", "当前没有受控 Codex 历史资料目录");
    const source = nativeHistoryCandidates("codex", profile)?.get(target.nativeSessionId.toLowerCase());
    const entry = source && isWithin(path.join(profile, "sessions"), source) ? readHistoryEntry("codex", source) : undefined;
    if (!entry || entry.nativeSessionId !== target.nativeSessionId || entry.historyId !== history.historyId ||
        entry.revision !== history.historyRevision || !inDispatchSpace(sp, entry)) {
      throw errors.notFound("原生历史来源已变化，请重新选择");
    }
    await sessions.reconcile();
    signal.throwIfAborted();
    const id = await claimHistory<string | null>(
      entry,
      requestId,
      null,
      async () =>
        (
          await sessions.launch(
            {
              ...resumeLaunchInput(sp, profile, entry, dispatchId),
              requestId,
              historySelection: selection,
              expectedConfigurationId: configurationId,
            },
            signal,
          )
        ).id,
    );
    if (!id) throw new HuhuError("RUN_UNKNOWN", "原生历史正在使用", { details: { reason: "input_owned" } });
    return id;
  }
  function piFileIdentity(file: string): string | null {
    try {
      const stat = lstatSync(file, { bigint: true });
      return stat.isFile() ? filesystemIdentity(stat) : null;
    } catch {
      return null;
    }
  }
  function historyKeys({ provider, nativeSessionId, historyId, file }: HistoryEntry, fileIdentity: string | null): string[] {
    const key = JSON.stringify([provider, provider === "codex" ? historyId : provider === "pi" ? file : nativeSessionId.toLowerCase()]);
    // Keep the path claimed even when a later lookup cannot read the inode.
    return fileIdentity === null ? [key] : [key, JSON.stringify([provider, "inode", fileIdentity])];
  }
  function recentWriterConflict(entry: HistoryEntry, records: SessionRecord[]): boolean {
    const now = Date.now();
    return records.some(({ state, historyLaunch }) => {
      const dispatchId = historyLaunch?.dispatch?.id;
      if (state !== "exited" || !dispatchId || historyLaunch.history.sourceId !== entry.historyId || historyLaunch.history.revision !== entry.revision) return false;
      const record = dispatchStore.read(dispatchId);
      return record?.write === "not_sent" && (record.resumeWriterRetry?.after ?? 0) > now && !resumeAbandoned(dispatchId);
    });
  }
  function historyBusy(entry: HistoryEntry, records: SessionRecord[], requestId?: string, fileIdentity = entry.provider === "pi" && (resuming.size > 0 || records.length > 0) ? piFileIdentity(entry.file) : null): boolean {
    return (
      historyKeys(entry, fileIdentity).some((key) => {
        const pending = resuming.get(key);
        return pending !== undefined && pending.requestId !== requestId;
      }) || records.some((s) => s.requestId !== requestId && blocksHistoryLaunch(s) && mayBeSameHistory(s, entry, fileIdentity))
    );
  }
  async function claimHistory<T>(entry: HistoryEntry, requestId: string, busy: T, launch: () => Promise<T>): Promise<T> {
    const fileIdentity = entry.provider === "pi" ? piFileIdentity(entry.file) : null;
    if (historyBusy(entry, sessions.list(), requestId, fileIdentity)) return busy;
    const claims = historyKeys(entry, fileIdentity).map((key) => {
      const claim = resuming.get(key) ?? { requestId, count: 0 };
      claim.count++;
      resuming.set(key, claim);
      return [key, claim] as const;
    });
    try {
      return await launch();
    } finally {
      for (const [key, claim] of claims) {
        if (--claim.count === 0) resuming.delete(key);
      }
    }
  }
  function historyActionBlocked(entry: HistoryEntry, action: HistoryLaunch["mode"], targetRoot: string, detected: DetectInfo | undefined, profile?: string): string | null {
    if ((action === "resume" || entry.provider !== "pi") && !isWithin(targetRoot, entry.cwd)) return "请在原 Space 中打开此历史会话";
    if (detected?.skipped) return `${detected.displayName} CLI 已停用`;
    if (!detected?.path) return `未找到 ${agentById(entry.provider)?.displayName ?? entry.provider} CLI`;
    if (detected.history?.[action] === false) return historySupportMessage(entry.provider, action);
    try {
      if (entry.provider === "codex" && !statSync(codexHistoryRuntime.helper, { throwIfNoEntry: false })?.isFile()) return "本机 Codex 历史启动程序不可用";
      resolveAgentLaunch({ settings: settingsStore.get(), locatedCommand: detected.path }, { agentId: entry.provider, mode: "interactive", history: historyArgs(entry, action, entry.historyId, profile) });
      return null;
    } catch (error) {
      return error instanceof HuhuError ? error.message : "原生历史启动配置无效";
    }
  }
  async function historyReference(c: CapabilityContext, i: z.infer<typeof HistoryReference>, launch?: { sent: boolean }, fresh = false) {
    const external = isAgentTool(c.caller);
    if (external && (!i.historyId || !i.historyRevision || i.allSpaces)) throw errors.invalidInput("请选择指定 Space 内的历史记录及其版本");
    if (!isValidNativeId(i.nativeSessionId)) throw errors.invalidInput("会话 id 无效");
    const { selected, matches } = await historyProjection.resolve(historyScope(historyRoots(i)), i, fresh);
    c.signal.throwIfAborted();
    if (!selected) throw errors.notFound(matches > 1 ? "会话标识不唯一，请重新选择历史记录" : "历史文件或其原工作目录已不可用，请重新查询");
    if (!historyRoots(i).some((root) => isWithin(root, selected.cwd))) throw errors.notFound("历史会话已不在所选 Space，请重新查询");
    if ((external || launch) && !launch?.sent && selected.revision !== i.historyRevision) throw errors.versionConflict(selected.revision);
    if (external) vaultWorkspaceDirectory(spaceOf(i.spaceId).root, selected.cwd);
    return { selected, unique: matches === 1 };
  }
  async function launchHistory<T>(c: CapabilityContext, input: z.infer<typeof HistoryLaunchInput>, operation: "direct" | "workspace", launch: (input: LaunchInput) => Promise<T>): Promise<T> {
    writable();
    if (isAgentTool(c.caller) && input.allSpaces) throw errors.invalidInput("请选择指定 Space 内的历史记录及其版本");
    const i = { ...input, requestId: launchKey(c, input.requestId) };
    const selection = launchHash({ operation, input });
    const replay = sessions.historyLaunchReplay(i.requestId, selection);
    if (replay) return launch(replay);
    const sp = spaceOf(i.spaceId);
    const sent = sessions.hasLaunchAttempt(i.requestId);
    const { selected: hit } = await historyReference(c, i, { sent });
    const profile = hit.provider !== "pi" ? nativeHistoryProfile(hit.provider, historyScanEnvironment(), opts.history?.home) : undefined;
    const sourceBlocked = historySourceBlocked(hit, profile);
    if (sourceBlocked) throw errors.invalidInput(sourceBlocked);
    const cwd = i.action === "fork" && hit.provider === "pi" ? sp.root : hit.cwd;
    const history = { ...historyArgs(hit, i.action, i.requestId, profile), revision: i.historyRevision };
    const launchInput = { spaceId: sp.id, spaceRevision: i.spaceRevision, provider: hit.provider, requestId: i.requestId, history, cwd, ...(!sent && { historySelection: selection }) };
    if (sent) return launch(launchInput); // Legacy Pi launch records predate the frozen history reference.
    spaces.validateForLaunch(i.spaceId, i.spaceRevision);
    if (!isWithin(sp.root, cwd)) throw errors.invalidInput("原目录不在目标 Space 内，请选择原 Space");
    await sessions.reconcile();
    c.signal.throwIfAborted();
    const result = await claimHistory<T | null>(hit, i.requestId, null, () => launch(launchInput));
    if (result === null) throw errors.invalidInput("这个原生会话可能已在运行或正在打开，请从会话列表核对");
    return result;
  }
  api.defineCapability(
    bindCapability(mainAgentDescriptors.historyList, async ({ caller, signal }, i) => {
      const external = isAgentTool(caller);
      if (external && i.allSpaces) throw errors.invalidInput("请选择一个 Space 来查询历史");
      const roots = historyRoots(i);
      const live = new Map<string, SessionRecord[]>();
      for (const session of sessions.list()) {
        const id = session.nativeSessionId ?? session.historyLaunch?.history.nativeId;
        if (!blocksHistoryLaunch(session) || !id) continue;
        const key = liveHistoryKey(session.provider, id);
        const matches = live.get(key) ?? [];
        matches.push(session);
        live.set(key, matches);
      }
      const env = historyScanEnvironment();
      const r = await historyProjection.scan({ ...historyScope(roots, env), ...(i.provider && { providers: [i.provider] }) });
      signal.throwIfAborted();
      const pinned = pins.list(i.spaceId);
      const available = !external && r.entries.some((entry) => entry.provider === "pi" || isUuidHistoryId(entry.nativeSessionId)) ? await detector.detect() : detector.snapshot();
      if (JSON.stringify(historyRoots(i)) !== JSON.stringify(roots)) throw errors.notFound("Space 目录已变化，请重新查询历史");
      const targetRoot = spaceOf(i.spaceId).root;
      const profiles = { claude: nativeHistoryProfile("claude", env, opts.history?.home), codex: nativeHistoryProfile("codex", env, opts.history?.home) };
      const counts = new Map<string, number>();
      for (const entry of r.entries) counts.set(nativeKey(entry), (counts.get(nativeKey(entry)) ?? 0) + 1);
      const query = i.query.normalize("NFC").toLowerCase();
      const matching = r.entries
        .filter(({ cwd }) => !external || !protectedKindOf(cwd.split(path.sep).join("/")))
        .filter((e) => !query || [e.title, e.nativeSessionId, e.cwd].some((text) => text.normalize("NFC").toLowerCase().includes(query)));
      const liveMatches = (e: HistoryEntry) => live.get(liveHistoryKey(e.provider, e.nativeSessionId)) ?? [];
      const isActive = (e: HistoryEntry) => !external && liveMatches(e).filter((session) => session.state === "running" && matchesHistory(session, e)).length === 1;
      const isPinned = (e: HistoryEntry) => pinned.has(e.historyId) || pinned.has(e.legacyHistoryId) || (counts.get(nativeKey(e)) === 1 && pinned.has(nativeKey(e)));
      const ordered = [...matching.filter(isPinned), ...matching.filter((e) => !isPinned(e))];
      const noCandidates = new Map<string, string | null>();
      const view = (entry: HistoryEntry) => {
        const { file: _file, legacyHistoryId: _legacy, ...e } = entry;
        const active = isActive(entry);
        const possiblyActive = !active && historyBusy(entry, liveMatches(entry));
        const profile = e.provider === "pi" ? undefined : profiles[e.provider];
        const files = r.candidates.get(e.provider) ?? noCandidates;
        const detected = available.find(({ id }) => id === e.provider);
        const commonBlock = active ? "此会话正在运行，可前往原分栏" : possiblyActive ? "可能已在运行，请从会话列表核对" : historySourceBlocked(entry, profile, files);
        const resumeBlocked = commonBlock ?? historyActionBlocked(entry, "resume", targetRoot, detected, profile);
        const forkBlocked = commonBlock ?? historyActionBlocked(entry, "fork", targetRoot, detected, profile);
        return { ...e, active, possiblyActive, canResume: resumeBlocked === null, canFork: forkBlocked === null, resumeBlocked, forkBlocked, pinned: isPinned(entry) };
      };
      const end = i.offset + i.limit;
      const page = (entries: ReturnType<typeof view>[], total: number) => ({ entries, skipped: r.skipped, total, nextOffset: end < total ? end : null, limitedProviders: r.limitedProviders });
      signal.throwIfAborted();
      if (i.filter === "resumable") {
        const resumable = ordered.map(view).filter(({ canResume }) => canResume);
        return page(resumable.slice(i.offset, end), resumable.length);
      }
      const visible = i.filter === "active" ? ordered.filter(isActive) : ordered;
      return page(visible.slice(i.offset, end).map(view), visible.length);
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.historyRead, async (c, i) => {
      const { selected: hit } = await historyReference(c, i);
      const transcript = readSelectedHistory(hit.provider, hit.file, hit.nativeSessionId, hit.historyId, (fd) => readTranscript(hit.provider, fd), isAgentTool(c.caller) ? hit.revision : undefined, hit.cwd);
      if (!transcript) throw errors.notFound("历史文件已变化，请重新选择");
      return transcript;
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.historyPin, async (c, i) => {
      writable();
      const { selected, unique } = await historyReference(c, i, undefined, true);
      const legacyKeys = [selected.legacyHistoryId];
      if (unique) legacyKeys.push(nativeKey(selected));
      pins.set(i.spaceId, selected.historyId, i.pinned, legacyKeys);
      return { pinned: i.pinned };
    }),
  );
  api.defineCapability(bindCapability(mainAgentDescriptors.historyResume, (c, i) => launchHistory(c, i, "direct", async (input) => replayableSession(c, await sessions.launch(input, c.signal), i.requestId))));
  api.defineCapability(bindCapability(mainAgentDescriptors.historyWorkspaceLaunch, (c, i) => launchHistory(c, i, "workspace", (input) => workspaceLayout.launch(input, i.target, i.baseVersion, c.signal))));
  api.defineCapability(
    bindCapability(mainAgentDescriptors.historyLocate, async (c, i) => {
      const { selected } = await historyReference(c, i);
      const external = isAgentTool(c.caller);
      const observer = external ? core.connected : undefined;
      if (observer === null) throw new HuhuError("HERDR_UNAVAILABLE", "当前连接无法核对原历史会话的分栏");
      const bound = sessions.list(external ? i.spaceId : undefined).filter((s) => s.state === "running" && matchesHistory(s, selected));
      const session = bound.length === 1 ? bound[0] : undefined;
      if (!session?.terminalId || !spaceCanLaunch(spaces.list().find((s) => s.id === session.spaceId))) throw errors.notFound("原会话已关闭或无法核对");
      const execution = await sessions.executionSession(session.id, observer);
      const view = execution && !execution.finished && (await workspaceLayout.read(session.spaceId, !external));
      const placement = view && sessionPlacement(view.layout, session.id);
      if (!placement || execution?.binding.coreAddress !== session.terminalId) throw errors.notFound("原会话的分栏已变化，请重新查询");
      return { spaceId: session.spaceId, sessionId: session.id, terminalId: session.terminalId, ...placement };
    }),
  );
  const diffs = new Map<string, { stamp: string; view: Awaited<ReturnType<typeof reviewDiff>> & { observedAt: string; diffRevision: string } }>();
  const reviewSnapshot = (space: ReturnType<typeof spaceOf>) => {
    const snapshot = diffs.get(space.id);
    if (!snapshot || snapshot.stamp !== workspaceStamp(space)) throw new HuhuError("GIT_OFFLINE", "当前 Space 没有可核实的 Git 变更快照");
    return snapshot.view;
  };
  api.defineCapability(
    bindCapability(mainAgentDescriptors.reviewDiff, async ({ caller, signal }, { spaceId, spaceRevision }) => {
      const space = spaceOf(spaceId);
      if (isAgentTool(caller)) {
        if (spaceRevision !== space.revision) throw errors.versionConflict(String(space.revision));
        vaultWorkspaceDirectory(space.root, space.root);
        return reviewSnapshot(space);
      }
      const stamp = workspaceStamp(space);
      const diff = await reviewDiff(space.root);
      signal.throwIfAborted();
      if (workspaceStamp(spaceOf(spaceId)) === stamp) {
        const files = diff.files.filter(({ path, oldPath }) => !protectedKindOf(path) && (!oldPath || !protectedKindOf(oldPath)));
        const snapshot = { ...diff, files };
        diffs.set(spaceId, { stamp, view: { ...snapshot, observedAt: new Date().toISOString(), diffRevision: launchHash([stamp, snapshot]) } });
      }
      return diff;
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.reviewComments, (c, i) => {
      checkedSession(c, i.sessionId, i, "space");
      return sessions.comments(i.sessionId);
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.reviewCommentAdd, (c, i) => {
      writable();
      const selected = checkedSession(c, i.sessionId, i, "version");
      if (selected) {
        const snapshot = reviewSnapshot(spaceOf(selected.spaceId));
        if (snapshot.diffRevision !== i.diffRevision) throw errors.versionConflict(snapshot.diffRevision);
        const file = snapshot.files.find(({ path }) => path === i.path);
        if (!file?.hunks.some(({ lines }) => lines.some((line) => (i.side === "old" ? line.oldLine : line.newLine) === i.line))) throw errors.notFound("快照中没有选定的文件行");
      }
      const comment = sessions.addComment(i.sessionId, { path: i.path, side: i.side, line: i.line, text: i.text });
      const { text: _text, ...receipt } = comment;
      return receipt;
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.reviewCommentDelete, (c, i) => {
      writable();
      const selected = checkedSession(c, i.sessionId, i, "version");
      if (selected?.reviewComments?.find(({ id }) => id === i.commentId)?.sending) throw errors.invalidInput("请先核实这条意见的发送状态");
      sessions.deleteComment(i.sessionId, i.commentId);
      return { ok: true as const };
    }),
  );
  api.defineCapability(
    bindCapability(mainAgentDescriptors.reviewSend, async (c, i) => {
      if (!i.dryRun) writable();
      const selected = checkedSession(c, i.sessionId, i, i.dryRun ? "version" : "binding");
      if (selected && (!i.commentIds?.length || launchHash(selected) !== i.expectedRevision)) throw errors.invalidInput("请选择原会话版本和要发送的意见");
      const { text, sent } = await sessions.sendComments(i.sessionId, i.commentIds, i.dryRun, selected && i.generation, isWorkbenchCaller(c.caller) ? i.controlId : undefined);
      return selected || c.parentOperationId || !i.dryRun ? { sent } : { sent, text };
    }),
  );
  api.provide("agentCli", { spaces, detector, core, dispatchRetained: () => sessions.dispatchRetained() });
  api.provide("agentProtectedTerminal", {
    readApprovedShellCancellation: (requestId: string) => sessions.readApprovedShellCancellation(requestId),
    get launchApprovedShell() {
      if (!interactiveEnvironment.helperAvailable) return undefined;
      return async (input: Parameters<SessionsService["launchApprovedShell"]>[0], signal?: AbortSignal) => {
        const session = await sessions.launchApprovedShell(input, signal);
        waiting.poke();
        return { id: session.id };
      };
    },
    launch: async (input: Parameters<SessionsService["launch"]>[0] & { provider: "shell"; env: Record<string, string>; command: string }, signal?: AbortSignal) => {
      const session = await sessions.launch(input, signal);
      waiting.poke();
      return { id: session.id };
    },
  });
  api.provide("terminalBridge:agent", createTerminalBridge({ sessions, core, ownership, signal: lifetime.signal }));
  return { spaces, detector, sessions, core };
}
