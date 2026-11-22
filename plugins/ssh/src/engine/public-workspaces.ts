import { createHash, randomUUID } from "node:crypto";
import { CapabilityIntentKeySchema, errors, HuhuError } from "@huhu/contracts";
import type { CapabilityContext, HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { layoutProblem, MAX_WORKSPACE_PANES, WorkspaceLayout, WorkspaceName, type WorkspaceRun } from "../shared/workspace.js";
import type { HostIntents } from "./host-intents.js";
import { OwnedConnection, type PublicSshProbes } from "./public-probes.js";
import { assertSshHosts, externalSshOwner, hasSshHosts, readBoundRoute, selectedSshHosts } from "./public-resources.js";
import type { PublicShells } from "./public-shells.js";
import type { WorkspaceTemplates } from "./workspace-templates.js";
import { workspaceTarget } from "./workspace-target.js";

const runtime = { connections: z.array(OwnedConnection).min(1).max(MAX_WORKSPACE_PANES), intentKey: CapabilityIntentKeySchema };
export const StartOwnedWorkspace = z.union([z.strictObject({ ...runtime, name: WorkspaceName, layout: WorkspaceLayout }), z.strictObject({ ...runtime, templateId: z.uuid(), expectedRevision: z.uuid() })]);
export const OwnedRun = z.strictObject({ id: z.uuid(), generation: z.int().min(1), intentKey: CapabilityIntentKeySchema });
export const ReconnectOwnedRun = OwnedRun.extend({ connections: runtime.connections });
export const SaveOwnedTemplate = OwnedRun.extend({ name: WorkspaceName });
const RunReceipt = OwnedRun.pick({ id: true, generation: true });
const TemplateReceipt = z.strictObject({ id: z.uuid(), revision: z.uuid() });
type Address = z.infer<typeof OwnedConnection>;
type Owned = { owner: string; bindings: Address[]; hostIds: readonly string[]; view: WorkspaceRun; detach(): void; authorized(): boolean; revoked?: true };

export class PublicWorkspaces {
  private readonly runs = new Map<string, Owned>();
  private readonly pending = new Map<string, AbortController>();

  constructor(
    private readonly files: HuhuApi["vault"]["files"],
    private readonly connections: PublicSshProbes,
    private readonly shells: PublicShells,
    private readonly templates: WorkspaceTemplates,
    private readonly intents: HostIntents | undefined,
    private readonly changed: (id: string) => void,
  ) {}

  async start(context: CapabilityContext, input: z.infer<typeof StartOwnedWorkspace>) {
    const { intentKey, connections } = input;
    const owner = externalSshOwner(context);
    const authorize = () => {
      const active = connections.map((binding) => this.connections.connection(context, binding));
      const template = "templateId" in input ? this.template(input.templateId, input.expectedRevision) : undefined;
      if (template && (template.panes.length !== connections.length || template.panes.some(({ hostId, target }, index) => hostId !== connections[index]!.hostId || target !== active[index]!.targetIdentity))) {
        throw errors.notFound("工作区模板的原主机与路由");
      }
      const layout = template?.layout ?? ("layout" in input ? input.layout : undefined);
      const name = template?.name ?? ("name" in input ? input.name : undefined);
      if (!layout || !name) throw errors.invalidInput("工作区模板不可用");
      const problem = layoutProblem(connections, layout);
      if (problem) throw errors.invalidInput(problem);
      return { hostIds: active.flatMap((connection) => connection.hostIds), name, layout, templateId: template?.id, active };
    };
    const initial = authorize();
    const result = await this.intentStore().run(context, "ssh.workspace.runs.start", {
      hosts: initial.hostIds,
      intentKey,
      input,
      output: RunReceipt,
      authorize: () => authorize().hostIds,
      run: async () => {
        if (this.runs.size + this.pending.size >= 32 || [...this.runs.values()].filter((run) => run.owner === owner && this.snapshot(run).panes.some(({ phase }) => phase === "ready")).length >= 4) {
          throw errors.invalidInput("SSH 工作区运行数量已达上限");
        }
        const { name, layout, templateId, active, hostIds } = authorize();
        const view: WorkspaceRun = {
          id: randomUUID(),
          source: "external",
          generation: 1,
          name,
          layout,
          ...(templateId && { templateId }),
          panes: active.map(({ origin }) => ({ paneId: randomUUID(), hostId: origin.hostId, label: origin.name, phase: "connecting" })),
        };
        await this.openPanes(context, owner, view, connections, hostIds, intentKey);
        return { id: view.id, generation: view.generation };
      },
    });
    return this.resolve(context, result.id, result.generation);
  }

  async reconnect(context: CapabilityContext, { id, generation, intentKey, connections }: z.infer<typeof ReconnectOwnedRun>) {
    const authorize = () => {
      const run = this.owned(context, id);
      if (run.bindings.length !== connections.length || run.bindings.some((item, index) => item.hostId !== connections[index]!.hostId || item.routeRevision !== connections[index]!.routeRevision)) {
        throw errors.notFound("原工作区主机与路由");
      }
      for (const binding of connections) this.connections.connection(context, binding);
      return run;
    };
    const result = await this.intentStore().run(context, "ssh.workspace.runs.reconnect", {
      hosts: authorize().hostIds,
      intentKey,
      input: { id, generation, connections },
      output: RunReceipt,
      authorize: () => authorize().hostIds,
      run: async () => {
        const current = authorize();
        if (current.view.generation !== generation) throw errors.versionConflict(String(current.view.generation));
        if (this.pending.has(id)) throw errors.invalidInput("该工作区正在重连");
        this.closeWorkbench(id);
        const view = { ...current.view, generation: generation + 1 };
        await this.openPanes(context, current.owner, view, connections, current.hostIds, intentKey);
        return { id, generation: view.generation };
      },
    });
    return this.resolve(context, id, result.generation);
  }

  async close(context: CapabilityContext, { id, generation, intentKey }: z.infer<typeof OwnedRun>) {
    const authorize = () => this.owned(context, id).hostIds;
    await this.intentStore().run(context, "ssh.workspace.runs.close", {
      hosts: authorize(),
      intentKey,
      input: { id, generation },
      output: RunReceipt,
      authorize,
      run: async () => {
        this.resolve(context, id, generation);
        this.closeWorkbench(id);
        return { id, generation };
      },
    });
    return this.resolve(context, id, generation);
  }

  async saveTemplate(context: CapabilityContext, { id, generation, intentKey, name }: z.infer<typeof SaveOwnedTemplate>) {
    const authorize = () => this.owned(context, id).hostIds;
    const result = await this.intentStore().run(context, "ssh.workspace.runs.saveTemplate", {
      hosts: authorize(),
      intentKey,
      input: { id, generation, name },
      output: TemplateReceipt,
      authorize,
      run: async (check) => {
        const run = this.owned(context, id);
        this.resolve(context, id, generation);
        const saved = await this.templates.save({ name, layout: run.view.layout, panes: run.bindings.map(({ hostId }) => ({ hostId })), rebindHostIds: [] }, context.signal, undefined, () => {
          check();
          return new Map(run.bindings.map((binding) => [binding.hostId, workspaceTarget(readBoundRoute(this.files, context, binding))]));
        });
        return { id: saved.id, revision: saved.revision };
      },
    });
    authorize();
    return this.template(result.id, result.revision);
  }

  list(context?: CapabilityContext) {
    const owner = context && externalSshOwner(context);
    const selected = context && selectedSshHosts(context);
    return [...this.runs.values()].flatMap((run) => {
      if (context) {
        if (run.owner !== owner || run.revoked || run.hostIds.some((hostId) => !selected?.has(hostId))) return [];
        try {
          this.owned(context, run.view.id);
        } catch (error) {
          if (!(error instanceof HuhuError)) throw error;
          return [];
        }
      }
      return [this.snapshot(run)];
    });
  }

  closeWorkbench(id: string) {
    this.pending.get(id)?.abort();
    const run = this.runs.get(id);
    if (!run) return;
    run.detach();
    for (const { sessionId } of run.view.panes) if (sessionId) this.shells.closeWorkbench(sessionId);
    this.changed(id);
    return this.snapshot(run);
  }

  revokeUnauthorized() {
    for (const run of this.runs.values()) {
      if (run.revoked || run.authorized()) continue;
      run.revoked = true;
      this.closeWorkbench(run.view.id);
    }
  }

  dispose() {
    for (const request of this.pending.values()) request.abort();
    for (const id of this.runs.keys()) this.closeWorkbench(id);
    this.runs.clear();
  }

  private async openPanes(context: CapabilityContext, owner: string, view: WorkspaceRun, bindings: Address[], hostIds: readonly string[], intentKey: string) {
    const signals = bindings.map((binding) => this.connections.connection(context, binding).signal);
    const controller = new AbortController();
    this.pending.set(view.id, controller);
    const signal = AbortSignal.any([context.signal, controller.signal, ...signals]);
    const panes: WorkspaceRun["panes"] = [];
    try {
      for (const [index, binding] of bindings.entries()) {
        signal.throwIfAborted();
        const key = createHash("sha256")
          .update(JSON.stringify([view.id, view.generation, index, intentKey]))
          .digest("hex");
        const shell = await this.shells.open({ ...context, signal }, { ...binding, cols: 80, rows: 24, intentKey: key });
        panes.push({ ...view.panes[index]!, sessionId: shell.shellId, phase: "ready" });
      }
      signal.throwIfAborted();
      const lost = () => this.closeWorkbench(view.id);
      for (const item of signals) item.addEventListener("abort", lost, { once: true });
      this.runs.set(view.id, {
        owner,
        bindings,
        hostIds,
        authorized: () => hasSshHosts(context, hostIds),
        view: { ...view, panes },
        detach: () => {
          for (const item of signals) item.removeEventListener("abort", lost);
        },
      });
      this.changed(view.id);
    } catch (error) {
      for (const { sessionId } of panes) if (sessionId) this.shells.closeWorkbench(sessionId);
      throw error;
    } finally {
      this.pending.delete(view.id);
    }
  }

  private template(id: string, revision: string) {
    const template = this.templates.get(id);
    if (template.revision !== revision) throw errors.versionConflict(template.revision);
    return template;
  }

  private resolve(context: CapabilityContext, id: string, generation: number) {
    const run = this.owned(context, id);
    if (run.view.generation !== generation) throw errors.versionConflict(String(run.view.generation));
    return this.snapshot(run);
  }

  private snapshot({ view }: Owned): WorkspaceRun {
    return { ...view, panes: view.panes.map((pane) => (this.shells.state(pane.sessionId ?? "") === "running" ? pane : { ...pane, phase: "ended" })) };
  }

  private owned(context: CapabilityContext, id: string) {
    const run = this.runs.get(id);
    if (run?.owner !== externalSshOwner(context)) throw errors.notFound("SSH 工作区运行");
    assertSshHosts(context, run.hostIds);
    if (run.revoked) throw errors.permissionDenied("SSH 主机授权");
    for (const binding of run.bindings) readBoundRoute(this.files, context, binding);
    return run;
  }

  private intentStore(): HostIntents {
    if (!this.intents) throw errors.invalidInput("此 Vault 无法保存 SSH 工作区意图");
    return this.intents;
  }
}
