import { randomUUID } from "node:crypto";
import { CapabilityIntentKeySchema, errors, HuhuError } from "@huhu/contracts";
import type { CapabilityContext } from "@huhu/kernel";
import { z } from "zod";
import { MonitorPanelRevision, MonitorSessionId, MonitorSessionOpen, MonitorToolRequest, type MonitorPanelChange, type MonitorSessionChange, type MonitorToolResult } from "../shared/monitoring.js";
import type { HostIntents } from "./host-intents.js";
import type { MonitorConnection, SshManager } from "./manager.js";
import type { MonitorPanels } from "./monitor-panels.js";
import { readMonitorConnection } from "./monitor-tools.js";
import { Monitors } from "./monitors.js";
import { OwnedConnection, type PublicSshProbes } from "./public-probes.js";
import { externalSshOwner, selectedSshHosts } from "./public-resources.js";

export const OpenOwnedMonitor = OwnedConnection.extend({ interval: MonitorSessionOpen.shape.interval, intentKey: CapabilityIntentKeySchema });
export const OwnedMonitorTool = OwnedConnection.extend({ tool: MonitorToolRequest.shape.tool, intentKey: CapabilityIntentKeySchema });
export const MonitorPanelRuntime = MonitorPanelRevision.extend({ runId: z.uuid(), name: z.string(), state: z.enum(["running", "paused", "stopped"]) });
export const PanelRuntimeFields = { intentKey: CapabilityIntentKeySchema.optional(), connections: z.array(OwnedConnection).min(1).max(12).optional(), runId: z.uuid().optional() };
const QueryId = z.strictObject({ id: z.uuid() });
type Address = z.infer<typeof OwnedConnection>;
type Subscription = { owner: string; binding: Address; hostIds: readonly string[]; detach(): void };
type PanelRuntime = { owner: string; id: string; revision: string; runId: string; name: string; bindings: Address[]; monitor: Monitors; detach(): void };

export class PublicMonitors {
  private readonly sampler: Monitors;
  private readonly sessions = new Map<string, Subscription>();
  private readonly toolResults = new Map<string, { result: MonitorToolResult; expires: number }>();
  private readonly panelRuns = new Map<string, PanelRuntime>();

  constructor(
    private readonly panels: MonitorPanels,
    private readonly manager: SshManager,
    private readonly connections: PublicSshProbes,
    private readonly intents: HostIntents | undefined,
    private readonly changed: (id: string) => void,
  ) {
    this.sampler = new Monitors(panels, manager);
  }

  async open(context: CapabilityContext, { intentKey, interval, ...binding }: z.infer<typeof OpenOwnedMonitor>) {
    const owner = externalSshOwner(context);
    const authorize = () => this.connections.connection(context, binding);
    const { hostIds } = authorize();
    const { id } = await this.intentStore().run(context, "ssh.monitor.session.open", {
      hosts: hostIds,
      intentKey,
      input: { ...binding, interval },
      output: MonitorSessionId,
      authorize: () => authorize().hostIds,
      run: async () => {
        for (const id of this.sessions.keys()) if (!this.sampler.peek(id)) this.closeWorkbench(id);
        if ([...this.sessions.values()].filter((session) => session.owner === owner).length >= 4) throw errors.invalidInput("主体的 SSH 监控订阅已达上限");
        const connection = authorize();
        const monitor = this.sampler.openConnection(binding.hostId, interval, () => this.adapter(binding, connection));
        const close = () => this.closeWorkbench(monitor.id);
        connection.signal.addEventListener("abort", close, { once: true });
        this.sessions.set(monitor.id, { owner, binding, hostIds, detach: () => connection.signal.removeEventListener("abort", close) });
        this.changed(monitor.id);
        return { id: monitor.id };
      },
    });
    return this.get(context, id);
  }

  get(context: CapabilityContext, id: string) {
    this.owned(context, id);
    return { ...this.sampler.get(id), source: "external" as const };
  }

  list(context?: CapabilityContext) {
    const owner = context && externalSshOwner(context);
    const selected = context && selectedSshHosts(context);
    return [...this.sessions.entries()].flatMap(([id, session]) => {
      if (context) {
        if (session.owner !== owner || session.hostIds.some((host) => !selected?.has(host))) return [];
        try {
          this.owned(context, id);
        } catch (error) {
          if (!(error instanceof HuhuError)) throw error;
          return [];
        }
      }
      const view = this.sampler.peek(id);
      return view ? [{ ...view, source: "external" as const }] : [];
    });
  }

  async change(context: CapabilityContext, input: z.infer<typeof MonitorSessionChange>, intentKey?: string) {
    if (!intentKey) throw errors.invalidInput("外部 SSH 监控需要稳定意图键");
    const authorize = () => this.owned(context, input.id).hostIds;
    const hosts = authorize();
    await this.intentStore().run(context, "ssh.monitor.session.change", {
      hosts,
      intentKey,
      input,
      output: MonitorSessionId,
      authorize,
      run: async () => {
        if (input.action === "close") {
          const session = this.sessions.get(input.id)!;
          this.sampler.session({ id: input.id, action: "close" });
          // Keep the binding for the close receipt while the original connection is live.
          this.changed(input.id);
          session.detach();
        } else {
          this.sampler.session(input);
          this.changed(input.id);
        }
        return { id: input.id };
      },
    });
    authorize();
    return input.action === "close" ? null : this.get(context, input.id);
  }

  closeWorkbench(id: string) {
    const session = this.sessions.get(id);
    if (!session) return false;
    this.sampler.session({ id, action: "close" });
    session.detach();
    this.sessions.delete(id);
    this.changed(id);
    return true;
  }

  async tool(context: CapabilityContext, { intentKey, tool, ...binding }: z.infer<typeof OwnedMonitorTool>) {
    const authorize = () => this.connections.connection(context, binding);
    const { hostIds } = authorize();
    const { id } = await this.intentStore().run(context, "ssh.monitor.tools.read", {
      hosts: hostIds,
      intentKey,
      input: { ...binding, tool },
      output: QueryId,
      authorize: () => authorize().hostIds,
      run: async (check) => {
        const connection = authorize();
        const result = await readMonitorConnection(this.adapter(binding, connection), tool, context.signal);
        check();
        const id = randomUUID();
        const now = Date.now();
        for (const [key, value] of this.toolResults) if (value.expires <= now || this.toolResults.size >= 32) this.toolResults.delete(key);
        this.toolResults.set(id, { result, expires: now + 60_000 });
        return { id };
      },
    });
    authorize();
    const cached = this.toolResults.get(id);
    if (!cached || cached.expires <= Date.now()) throw new HuhuError("INTERNAL", "原 SSH 查询结果待核实", { retryable: false, details: { outcome: "unknown" } });
    return cached.result;
  }

  async panelChange(context: CapabilityContext, input: z.infer<typeof MonitorPanelChange>, intentKey: string | undefined, bindings?: Address[]) {
    const owner = externalSshOwner(context);
    if (!intentKey) throw errors.invalidInput("外部 SSH 监控面板需要稳定意图键");
    const key = JSON.stringify([owner, input.id]);
    const resolve = () => {
      const panel = this.panels.require(input);
      const previous = this.panelRuns.get(key);
      const connections = input.action === "start" ? bindings : previous?.bindings;
      if (input.action !== "start" && (!previous || previous.revision !== input.expectedRevision)) throw errors.notFound("原 SSH 监控面板运行");
      if (!connections || connections.length !== panel.hostIds.length || panel.hostIds.some((hostId) => !connections.some((binding) => binding.hostId === hostId))) {
        throw errors.invalidInput("监控面板需要每台主机的原连接");
      }
      const hostIds = connections.flatMap((binding) => this.connections.connection(context, binding).hostIds);
      return { panel, previous, connections, hostIds };
    };
    const { hostIds } = resolve();
    const { id } = await this.intentStore().run(context, "ssh.monitor.panels.change", {
      hosts: hostIds,
      intentKey,
      input: { ...input, connections: bindings },
      output: QueryId,
      authorize: () => resolve().hostIds,
      run: async () => {
        const { panel, previous, connections } = resolve();
        let runtime = previous;
        if (input.action === "start") {
          if (runtime?.monitor.dashboard(panel.id)?.state !== "stopped" && runtime && JSON.stringify(runtime.bindings) !== JSON.stringify(connections)) {
            throw errors.invalidInput("请先停止原监控面板运行");
          }
          if (!runtime || runtime.monitor.dashboard(panel.id)?.state === "stopped") {
            if (runtime) this.releasePanel(key);
            if (this.panelRuns.size >= 8) throw errors.invalidInput("外部监控面板数量已达上限");
            const runId = randomUUID();
            const signals = connections.map((binding) => this.connections.connection(context, binding).signal);
            const lost = () => this.releasePanel(key);
            for (const signal of signals) signal.addEventListener("abort", lost, { once: true });
            runtime = {
              owner,
              id: panel.id,
              name: panel.name,
              revision: panel.revision,
              runId,
              bindings: connections,
              monitor: new Monitors(this.panels, this.manager),
              detach: () => {
                for (const signal of signals) signal.removeEventListener("abort", lost);
              },
            };
            this.panelRuns.set(key, runtime);
          }
        }
        if (!runtime) throw errors.notFound("SSH 监控面板运行");
        const runId = runtime.runId;
        try {
          await runtime.monitor.change(input, context.signal, (hostId) => {
            const binding = connections.find((item) => item.hostId === hostId)!;
            return this.adapter(binding, this.connections.connection(context, binding));
          });
        } catch (error) {
          if (!runtime.monitor.dashboard(panel.id)) this.releasePanel(key);
          throw error;
        }
        this.changed(runId);
        return { id: runId };
      },
    });
    resolve();
    if (this.panelRuns.get(key)?.runId !== id) throw errors.notFound("原 SSH 监控面板运行");
    return this.readPanel(context, input);
  }

  readPanel(context: CapabilityContext, input: z.infer<typeof MonitorPanelRevision>) {
    const owner = externalSshOwner(context);
    const selected = selectedSshHosts(context);
    const panel = this.panels.require(input);
    if (panel.hostIds.some((hostId) => !selected.has(hostId))) throw errors.permissionDenied("SSH 主机授权");
    const runtime = this.panelRuns.get(JSON.stringify([owner, panel.id]));
    if (!runtime || runtime.revision !== panel.revision) return null;
    for (const binding of runtime.bindings) this.connections.connection(context, binding);
    return runtime.monitor.dashboard(panel.id);
  }

  panelsList(context?: CapabilityContext) {
    const owner = context && externalSshOwner(context);
    return [...this.panelRuns.values()].flatMap((runtime) => {
      if (context) {
        if (runtime.owner !== owner) return [];
        try {
          for (const binding of runtime.bindings) this.connections.connection(context, binding);
        } catch (error) {
          if (!(error instanceof HuhuError)) throw error;
          return [];
        }
      }
      const run = runtime.monitor.dashboard(runtime.id);
      return run ? [{ id: runtime.id, expectedRevision: runtime.revision, runId: runtime.runId, name: runtime.name, state: run.state }] : [];
    });
  }

  closeWorkbenchPanel(runId: string) {
    for (const [key, run] of this.panelRuns) if (run.runId === runId) this.releasePanel(key);
  }

  assertPanelInactive(id: string) {
    for (const runtime of this.panelRuns.values()) {
      if (runtime.id === id && runtime.monitor.dashboard(id)?.state !== "stopped") throw errors.permissionDenied("监控面板仍在使用");
    }
  }

  revalidatePanels() {
    const revisions = new Map(this.panels.list().map(({ id, revision }) => [id, revision]));
    for (const [key, run] of this.panelRuns) if (revisions.get(run.id) !== run.revision) this.releasePanel(key);
  }

  dispose() {
    for (const id of this.sessions.keys()) this.closeWorkbench(id);
    for (const key of this.panelRuns.keys()) this.releasePanel(key);
    this.sampler.dispose();
    this.toolResults.clear();
  }

  private releasePanel(key: string) {
    const run = this.panelRuns.get(key);
    if (!run) return;
    this.panelRuns.delete(key);
    run.detach();
    run.monitor.dispose();
    this.changed(run.runId);
  }

  private owned(context: CapabilityContext, id: string) {
    const session = this.sessions.get(id);
    if (session?.owner !== externalSshOwner(context)) throw errors.notFound("SSH 监控订阅");
    this.connections.connection(context, session.binding);
    return session;
  }

  private adapter(binding: Address, { client, signal }: ReturnType<PublicSshProbes["connection"]>): MonitorConnection {
    return {
      id: binding.attemptId,
      client,
      routeIdentity: binding.routeRevision,
      release: () => undefined,
      onClose: (callback) => {
        signal.addEventListener("abort", callback, { once: true });
        return () => signal.removeEventListener("abort", callback);
      },
    };
  }

  private intentStore(): HostIntents {
    if (!this.intents) throw errors.invalidInput("此 Vault 无法保存 SSH 监控意图");
    return this.intents;
  }
}
