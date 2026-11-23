import { setTimeout as wait } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { errors, HuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { HerdrError, type HerdrClient } from "@huhu/herdr-client";
import { bindCapability, defineCapabilityDescriptor, durableExternal, ExposureStore, toolSelection, type HuhuApi } from "@huhu/kernel";
import path from "node:path";
import { publicAgentTool } from "./tool-access.js";
import { z } from "zod";
import {
  WORKSPACE_DOCUMENT,
  emptyLayout,
  leaves,
  placeSession,
  removePane,
  sessionPlacement,
  SpaceLayoutSchema,
  WorkspaceEditSchema,
  WorkspaceViewSchema,
  type SpaceLayout,
  type WorkspaceLaunchView,
  type WorkspaceTarget,
  type WorkspaceView,
} from "../shared/workspace-layout.js";
import { sessionGeneration, type LaunchInput, type SessionsService } from "./sessions.js";
import { launchHash } from "./launch-binding.js";
import type { SpaceStore } from "./spaces.js";
import { readWorkspaceDocument } from "./workspace-package.js";

const saved = z.strictObject({ version: z.int().positive() });
const closeInput = WorkspaceEditSchema.pick({ spaceId: true, baseVersion: true })
  .extend({
    tab: z.string().min(1).max(128),
    leaf: z.string().min(1).max(128),
    sessionId: z.string().min(1).max(128).nullable(),
    terminate: z.boolean(),
    spaceRevision: z.int().positive().optional(),
    generation: z.string().optional(),
  })
  .strict();

interface WorkspaceDeps {
  core(): Promise<HerdrClient>;
  /** start=false：外部只读调用，不得为读取而启动 Core。 */
  readCore?(start: boolean): Promise<HerdrClient | null>;
  readRestored?(): Record<string, SpaceLayout> | undefined;
  spaces: SpaceStore;
  sessions: SessionsService;
  readOnly: boolean;
  signal: AbortSignal;
}

class WorkspaceLayoutService {
  private tail = Promise.resolve();

  constructor(private readonly deps: WorkspaceDeps) {}

  private async current(spaceId: string, connected?: HerdrClient) {
    this.deps.spaces.get(spaceId);
    const client = connected ?? (await this.deps.core());
    const accepted = await readWorkspaceDocument(client);
    const restored = accepted.version === 0 ? this.deps.readRestored?.() : undefined;
    const document = restored ? { ...accepted, value: { ...accepted.value, spaces: restored } } : accepted;
    const layout = document.value.spaces[spaceId];
    const view: WorkspaceView = {
      spaceId,
      version: document.value.revisions?.[spaceId] ?? (layout ? document.version : 0),
      layout: layout ?? emptyLayout(spaceId),
      writable: !this.deps.readOnly,
    };
    return { client, document, view };
  }

  async read(spaceId: string, start = true): Promise<WorkspaceView> {
    if (!this.deps.readCore) return (await this.current(spaceId)).view;
    this.deps.spaces.get(spaceId);
    const client = await this.deps.readCore(start);
    if (client) return (await this.current(spaceId, client)).view;
    return { spaceId, version: 0, layout: this.deps.readRestored?.()?.[spaceId] ?? emptyLayout(spaceId), writable: !this.deps.readOnly };
  }

  private operate<T>(signal: AbortSignal, action: (active: AbortSignal) => Promise<T>): Promise<T> {
    if (this.deps.readOnly) return Promise.reject(errors.permissionDenied("工作区布局为只读"));
    const active = AbortSignal.any([signal, this.deps.signal]);
    const operation = this.tail.then(() => {
      active.throwIfAborted();
      return action(active);
    });
    this.tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private checkVersion(view: WorkspaceView, baseVersion: number) {
    if (view.version !== baseVersion) throw errors.versionConflict(String(view.version));
  }

  private async save(current: Awaited<ReturnType<WorkspaceLayoutService["current"]>>, layout: SpaceLayout, active: AbortSignal): Promise<WorkspaceView> {
    const { client, document, view } = current;
    const { spaceId } = view;
    this.deps.spaces.get(spaceId);
    const version = view.version + 1;
    const revisions = document.value.revisions ?? Object.fromEntries(Object.keys(document.value.spaces).map((id) => [id, document.version]));
    const content = { ...document.value, revisions: { ...revisions, [spaceId]: version }, spaces: { ...document.value.spaces, [spaceId]: layout } };
    if (Buffer.byteLength(JSON.stringify(content)) > 1024 * 1024) throw errors.invalidInput("工作区布局超过 1 MiB");
    active.throwIfAborted();
    try {
      saved.parse(await client.call("doc.set", { name: WORKSPACE_DOCUMENT, version: document.version, value: content }));
    } catch (error) {
      const actual = await this.current(spaceId).catch(() => null);
      if (actual?.document.version === document.version + 1 && isDeepStrictEqual(actual.document.value, content)) return actual.view;
      if (actual && (actual.document.version !== document.version || (error instanceof HerdrError && error.kind === "conflict"))) throw errors.versionConflict(String(actual.view.version));
      throw new HuhuError("HERDR_UNAVAILABLE", "无法核对布局保存结果，请重新读取工作区");
    }
    return { ...view, version, layout };
  }

  update(spaceId: string, baseVersion: number, layout: SpaceLayout, signal: AbortSignal, spaceRevision?: number): Promise<WorkspaceView> {
    return this.operate(signal, async (active) => {
      if (spaceRevision !== undefined) this.deps.spaces.validateForLaunch(spaceId, spaceRevision);
      const current = await this.current(spaceId);
      this.checkVersion(current.view, baseVersion);
      const known = new Set(this.deps.sessions.list(spaceId).map(({ id }) => id));
      for (const tab of current.view.layout.tabs) for (const leaf of leaves(tab.pane)) if (leaf.sessionId) known.add(leaf.sessionId);
      for (const tab of layout.tabs) {
        for (const { sessionId } of leaves(tab.pane)) if (sessionId && !known.has(sessionId)) throw errors.invalidInput("只能绑定当前工作区的会话");
      }
      if (spaceRevision !== undefined) this.deps.spaces.validateForLaunch(spaceId, spaceRevision);
      return this.save(current, layout, active);
    });
  }

  launch(input: LaunchInput, target: WorkspaceTarget, baseVersion: number, signal: AbortSignal): Promise<WorkspaceLaunchView> {
    return this.operate(signal, async (active) => {
      const { spaceId, requestId } = input;
      const recorded = this.deps.sessions.list(spaceId).find((session) => session.requestId === requestId && session.launchReceipt?.attempt);
      if (!recorded) this.deps.spaces.validateForLaunch(spaceId, input.spaceRevision);
      const current = await this.current(spaceId);
      const pending = placeSession(current.view.layout, target, `pending-${requestId}`, requestId);
      if (!recorded) {
        this.checkVersion(current.view, baseVersion);
        if (!pending || !SpaceLayoutSchema.safeParse(pending.layout).success) throw errors.invalidInput("目标分栏已关闭、已占用或超出布局限制");
      }
      // 已经提交过的请求走会话对账，即使其他窗口关闭了当时的分栏。
      const session = await this.deps.sessions.launch({ ...input, workspaceIntent: launchHash({ baseVersion, target }) }, active);
      const attached = sessionPlacement(current.view.layout, session.id);
      if (attached) return { sessionId: session.id, workspace: current.view, placement: attached };
      if (current.view.version === baseVersion && pending) {
        const next = placeSession(current.view.layout, target, session.id, requestId);
        if (next && SpaceLayoutSchema.safeParse(next.layout).success) {
          try {
            const workspace = await this.save(current, next.layout, active);
            return { sessionId: session.id, workspace, placement: { tab: next.tab, leaf: next.leaf } };
          } catch {
            const latest = await this.read(spaceId).catch(() => current.view);
            return { sessionId: session.id, workspace: latest, placement: sessionPlacement(latest.layout, session.id) };
          }
        }
      }
      return { sessionId: session.id, workspace: current.view, placement: null };
    });
  }

  close(input: z.infer<typeof closeInput>, signal: AbortSignal, authorizeTermination?: () => void): Promise<WorkspaceView> {
    return this.operate(signal, async (active) => {
      const { spaceId, baseVersion, tab, leaf, sessionId, terminate, spaceRevision, generation } = input;
      if (spaceRevision !== undefined) this.deps.spaces.validateForLaunch(spaceId, spaceRevision);
      let current = await this.current(spaceId);
      this.checkVersion(current.view, baseVersion);
      const owner = current.view.layout.tabs.find(({ id }) => id === tab);
      const target = owner && leaves(owner.pane).find(({ id }) => id === leaf);
      if (!target || target.sessionId !== sessionId) throw errors.versionConflict(String(current.view.version));
      if (terminate && sessionId) {
        const session = this.deps.sessions.get(sessionId);
        if (session.spaceId !== spaceId) throw errors.invalidInput("只能关闭当前工作区的会话");
        authorizeTermination?.();
        if (authorizeTermination && (!generation || sessionGeneration(session) !== generation)) throw new HuhuError("VERSION_CONFLICT", "分栏绑定的会话进程代次已变化");
        active.throwIfAborted();
        if (session.state !== "exited") await this.deps.sessions.kill(sessionId, authorizeTermination && generation);
        for (let count = 0; this.deps.sessions.get(sessionId).state !== "exited"; count++) {
          if (count >= 16) throw new HuhuError("RUN_UNKNOWN", "尚未核实终端已退出，原分栏仍可查看");
          await this.deps.sessions.reconcile();
          await wait(250, undefined, { signal: active });
        }
        const latest = await this.current(spaceId);
        this.checkVersion(latest.view, baseVersion);
        const bound = latest.view.layout.tabs.find(({ id }) => id === tab);
        const leafNow = bound && leaves(bound.pane).find(({ id }) => id === leaf);
        if (leafNow?.sessionId !== sessionId) throw errors.versionConflict(String(latest.view.version));
        current = latest;
      }
      const next: SpaceLayout = {
        tabs: current.view.layout.tabs.flatMap((entry) => {
          if (entry.id !== tab) return [entry];
          const pane = removePane(entry.pane, leaf);
          return pane ? [{ ...entry, pane }] : [];
        }),
      };
      if (spaceRevision !== undefined) this.deps.spaces.validateForLaunch(spaceId, spaceRevision);
      return this.save(current, next, active);
    });
  }
}

export const agentWorkspaceLayoutDescriptors = {
  workspaceGet: defineCapabilityDescriptor({
    ...publicAgentTool,
    name: "agent.workspace.get",
    scope: "read",
    risk: "normal",
    title: "读取工作区布局",
    description: "查看选定 Space 的布局。",
    input: WorkspaceEditSchema.pick({ spaceId: true }),
    output: WorkspaceViewSchema,
  }),
  workspaceSave: defineCapabilityDescriptor({
    ...publicAgentTool,
    name: "agent.workspace.save",
    scope: "write",
    risk: "normal",
    title: "保存工作区布局",
    description: "按版本保存选定 Space 的布局。",
    ...durableExternal,
    input: WorkspaceEditSchema.extend({ spaceRevision: z.int().positive().optional() }),
    output: WorkspaceViewSchema,
  }),
  workspaceClose: defineCapabilityDescriptor({
    ...publicAgentTool,
    name: "agent.workspace.close",
    scope: "execute",
    risk: "high",
    title: "关闭工作区分栏",
    description: "关闭选定分栏，可结束绑定的原进程。",
    ...durableExternal,
    input: closeInput,
    output: WorkspaceViewSchema,
  }),
};

export function registerWorkspaceLayout(api: HuhuApi, deps: WorkspaceDeps) {
  const service = new WorkspaceLayoutService(deps);
  const exposure = new ExposureStore(api.vault.files, path.join(api.vault.stateDir, "plugins.json"));
  api.defineCapability(bindCapability(agentWorkspaceLayoutDescriptors.workspaceGet, ({ caller }, { spaceId }) => service.read(spaceId, isWorkbenchCaller(caller))));
  api.defineCapability(
    bindCapability(agentWorkspaceLayoutDescriptors.workspaceSave, ({ caller, signal }, { spaceId, baseVersion, layout, spaceRevision }) => {
      if (!isWorkbenchCaller(caller) && spaceRevision === undefined) throw errors.invalidInput("请选择原 Space 版本");
      return service.update(spaceId, baseVersion, layout, signal, spaceRevision);
    }),
  );
  api.defineCapability(
    bindCapability(agentWorkspaceLayoutDescriptors.workspaceClose, ({ caller, delegatedBy, signal }, input) => {
      if (isWorkbenchCaller(caller) && !delegatedBy) return service.close(input, signal);
      if (input.spaceRevision === undefined) throw errors.invalidInput("请选择原 Space 版本");
      const authorizeTermination = () => {
        if (delegatedBy) throw errors.permissionDenied("扩展命令终止工作区进程");
        if (toolSelection(exposure.snapshot(), "agent.sessions.kill") !== true) throw errors.capabilityNotExposed("agent.sessions.kill");
      };
      if (input.terminate && input.sessionId) authorizeTermination();
      return service.close(input, signal, authorizeTermination);
    }),
  );
  return service;
}
