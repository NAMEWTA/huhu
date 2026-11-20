import { isDeepStrictEqual } from "node:util";
import { errors, HuhuError } from "@huhu/contracts";
import { HerdrError, type HerdrClient } from "@huhu/herdr-client";
import { defineCapability, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { WORKSPACE_DOCUMENT, emptyLayout, leaves, WorkspaceDocumentSchema, WorkspaceEditSchema, WorkspaceViewSchema, type SpaceLayout, type WorkspaceView } from "../shared/workspace-layout.js";
import type { SessionsService } from "./sessions.js";
import type { SpaceStore } from "./spaces.js";

const envelope = z.strictObject({ version: z.int().nonnegative(), value: z.unknown() });
const saved = z.strictObject({ version: z.int().positive() });

interface WorkspaceDeps {
  core(): Promise<HerdrClient>;
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
    if (!parsed.success) throw errors.invalidInput("工作区布局格式损坏。已保留原记录");
    return { version, value: parsed.data };
  }

  async read(spaceId: string): Promise<WorkspaceView> {
    this.deps.spaces.get(spaceId);
    const client = await this.deps.core();
    const { value, version } = await this.document(client);
    return { spaceId, version, layout: value.spaces[spaceId] ?? emptyLayout(spaceId), writable: !this.deps.readOnly };
  }

  update(spaceId: string, baseVersion: number, layout: SpaceLayout, signal: AbortSignal): Promise<WorkspaceView> {
    const operation = this.tail.then(() => this.write(spaceId, baseVersion, layout, signal));
    this.tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async write(spaceId: string, baseVersion: number, layout: SpaceLayout, signal: AbortSignal): Promise<WorkspaceView> {
    if (this.deps.readOnly) throw errors.permissionDenied("工作区当前为只读");
    this.deps.spaces.get(spaceId);
    const active = AbortSignal.any([signal, this.deps.signal]);
    active.throwIfAborted();
    const client = await this.deps.core();
    const current = await this.document(client);
    if (current.version !== baseVersion) throw errors.versionConflict(String(current.version));
    this.deps.spaces.get(spaceId);
    const existing = current.value.spaces[spaceId];
    const known = new Set(this.deps.sessions.list(spaceId).map(({ id }) => id));
    for (const tab of existing?.tabs ?? []) for (const leaf of leaves(tab.pane)) if (leaf.sessionId) known.add(leaf.sessionId);
    for (const tab of layout.tabs) {
      for (const { sessionId } of leaves(tab.pane)) {
        if (sessionId && !known.has(sessionId)) throw errors.invalidInput("只能绑定此工作区中的会话");
      }
    }
    active.throwIfAborted();
    const content = { ...current.value, spaces: { ...current.value.spaces, [spaceId]: layout } };
    if (Buffer.byteLength(JSON.stringify(content)) > 1024 * 1024) throw errors.invalidInput("工作区布局超过 1 MiB");
    try {
      const result = saved.parse(await client.call("doc.set", { name: WORKSPACE_DOCUMENT, version: baseVersion, value: content }));
      return { spaceId, version: result.version, layout, writable: true };
    } catch (error) {
      const actual = await this.deps
        .core()
        .then((next) => this.document(next))
        .catch(() => null);
      if (actual?.version === baseVersion + 1 && isDeepStrictEqual(actual.value, content)) return { spaceId, version: actual.version, layout, writable: true };
      if (actual && (actual.version !== baseVersion || (error instanceof HerdrError && error.kind === "conflict"))) throw errors.versionConflict(String(actual.version));
      throw new HuhuError("HERDR_UNAVAILABLE", "未收到布局保存确认。请先核对当前工作区");
    }
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
      handler: (_, { spaceId }) => service.read(spaceId),
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
}
