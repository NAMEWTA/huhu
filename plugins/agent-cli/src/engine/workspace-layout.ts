import { setTimeout as wait } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { errors, HuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { HerdrError, type HerdrClient } from "@huhu/herdr-client";
import { defineCapability, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import {
  WORKSPACE_DOCUMENT,
  emptyLayout,
  leaves,
  placeSession,
  removePane,
  sessionPlacement,
  SpaceLayoutSchema,
  WorkspaceDocumentSchema,
  WorkspaceEditSchema,
  WorkspaceViewSchema,
  type SpaceLayout,
  type WorkspaceLaunchView,
  type WorkspaceTarget,
  type WorkspaceView,
} from "../shared/workspace-layout.js";
import type { LaunchInput, SessionsService } from "./sessions.js";
import { launchHash } from "./launch-binding.js";
import type { SpaceStore } from "./spaces.js";

const envelope = z.strictObject({ version: z.int().nonnegative(), value: z.unknown() });
const saved = z.strictObject({ version: z.int().positive() });
const closeInput = WorkspaceEditSchema.pick({ spaceId: true, baseVersion: true })
  .extend({
    tab: z.string().min(1).max(128),
    leaf: z.string().min(1).max(128),
    sessionId: z.string().min(1).max(128).nullable(),
    terminate: z.boolean(),
  })
  .strict();

interface WorkspaceDeps {
  core(): Promise<HerdrClient>;
  /** start=false：外部只读调用，不得为读取而启动 Core。 */
  readCore?(start: boolean): Promise<HerdrClient | null>;
  spaces: SpaceStore;
  sessions: SessionsService;
  readOnly: boolean;
  signal: AbortSignal;
}

class WorkspaceLayoutService {
  private tail = Promise.resolve();

  constructor(private readonly deps: WorkspaceDeps) {}

  private async document(client: HerdrClient) {
    const reply = envelope.safeParse(await client.call("doc.get", { name: WORKSPACE_DOCUMENT }));
    if (!reply.success) throw new HuhuError("INTERNAL", "无法核对 Core 保存的工作区布局");
    const { version, value } = reply.data;
    const parsed = WorkspaceDocumentSchema.safeParse(value ?? { format: 1, spaces: {} });
    if (!parsed.success) throw errors.invalidInput("工作区布局格式无效，已保留原文档");
    return { version, value: parsed.data };
  }

  private async current(spaceId: string, connected?: HerdrClient) {
    this.deps.spaces.get(spaceId);
    const client = connected ?? (await this.deps.core());
    const document = await this.document(client);
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
    return { spaceId, version: 0, layout: emptyLayout(spaceId), writable: !this.deps.readOnly };
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

  update(spaceId: string, baseVersion: number, layout: SpaceLayout, signal: AbortSignal): Promise<WorkspaceView> {
    return this.operate(signal, async (active) => {
      const current = await this.current(spaceId);
      this.checkVersion(current.view, baseVersion);
      const known = new Set(this.deps.sessions.list(spaceId).map(({ id }) => id));
      for (const tab of current.view.layout.tabs) for (const leaf of leaves(tab.pane)) if (leaf.sessionId) known.add(leaf.sessionId);
      for (const tab of layout.tabs) {
        for (const { sessionId } of leaves(tab.pane)) if (sessionId && !known.has(sessionId)) throw errors.invalidInput("只能绑定当前工作区的会话");
      }
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

  close(input: z.infer<typeof closeInput>, signal: AbortSignal): Promise<WorkspaceView> {
    return this.operate(signal, async (active) => {
      const { spaceId, baseVersion, tab, leaf, sessionId, terminate } = input;
      let current = await this.current(spaceId);
      this.checkVersion(current.view, baseVersion);
      const owner = current.view.layout.tabs.find(({ id }) => id === tab);
      const target = owner && leaves(owner.pane).find(({ id }) => id === leaf);
      if (!target || target.sessionId !== sessionId) throw errors.versionConflict(String(current.view.version));
      if (terminate && sessionId) {
        const session = this.deps.sessions.get(sessionId);
        if (session.spaceId !== spaceId) throw errors.invalidInput("只能关闭当前工作区的会话");
        active.throwIfAborted();
        if (session.state !== "exited") await this.deps.sessions.kill(sessionId);
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
      return this.save(current, next, active);
    });
  }
}

const scope = { plugin: "agent-cli", exposable: false, defaultExposed: false } as const;

export function registerWorkspaceLayout(api: HuhuApi, deps: WorkspaceDeps) {
  const service = new WorkspaceLayoutService(deps);
  api.defineCapability(
    defineCapability({
      ...scope,
      name: "agent.workspace.get",
      scope: "read",
      input: WorkspaceEditSchema.pick({ spaceId: true }),
      output: WorkspaceViewSchema,
      handler: ({ caller }, { spaceId }) => service.read(spaceId, isWorkbenchCaller(caller)),
    }),
  );
  api.defineCapability(
    defineCapability({
      ...scope,
      name: "agent.workspace.save",
      scope: "write",
      input: WorkspaceEditSchema,
      output: WorkspaceViewSchema,
      handler: ({ signal }, { spaceId, baseVersion, layout }) => service.update(spaceId, baseVersion, layout, signal),
    }),
  );
  api.defineCapability(
    defineCapability({
      ...scope,
      name: "agent.workspace.close",
      scope: "execute",
      input: closeInput,
      output: WorkspaceViewSchema,
      handler: ({ signal }, input) => service.close(input, signal),
    }),
  );
  return service;
}
