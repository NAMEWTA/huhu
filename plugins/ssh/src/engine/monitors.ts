import { randomUUID } from "node:crypto";
import { errors, HuhuError, type PeriodicRunContext, type PeriodicRunOutcome, type PlanSummary } from "@huhu/contracts";
import type { Client } from "ssh2";
import type { z } from "zod";
import type {
  MonitorHost,
  MonitorPanel,
  MonitorPanelChange,
  MonitorPanelRevision,
  MonitorPanelRun,
  MonitorPanelSudo,
  MonitorPoint,
  MonitorSession,
  MonitorSessionChange,
  MonitorSessionOpen,
  SaveMonitorPanel,
  SessionInterval,
} from "../shared/monitoring.js";
import type { MonitorConnection, SshManager } from "./manager.js";
import type { MonitorPanels, MonitorPanelScope } from "./monitor-panels.js";
import type { MonitorPlans } from "./monitor-plans.js";
import { detectPlatform, readSample, SampleError, type Counters, type Platform } from "./monitor-sample.js";

const MAX_POINTS = 1800;
const PANE_LEASE_MS = 120_000;

type Source = {
  id: string;
  key: string;
  elevated: boolean;
  client: Client;
  users: Set<Binding>;
  previous?: Counters | undefined;
  platform?: Platform | undefined;
  failure?: SampleError | undefined;
  requestedAt?: number | undefined;
  timer?: ReturnType<typeof setTimeout> | undefined;
  request?: AbortController | undefined;
};
type Binding = {
  host: MonitorHost;
  interval: number;
  retention: number;
  enabled: boolean;
  elevated?: boolean;
  panelId?: string;
  source?: Source;
  connection?: MonitorConnection;
  release?: () => void;
  dial?: AbortController;
  acquire?: () => MonitorConnection;
};
type Pane = { id: string; binding: Binding; interval: z.infer<typeof SessionInterval>; expiry?: ReturnType<typeof setTimeout> };
type Dashboard = { panel: MonitorPanel; state: MonitorPanelRun["state"]; bindings: Binding[] };

function reduceHistory(history: readonly MonitorPoint[]): MonitorPoint[] {
  const stride = Math.max(1, Math.ceil(history.length / 90));
  const reduced: MonitorPoint[] = [];
  for (let i = 0; i < history.length; i += stride) {
    const bucket = history.slice(i, i + stride);
    const gap = bucket.find(({ sample }) => sample === null);
    const last = bucket.at(-1)!;
    if (gap && gap !== last) reduced.push(gap);
    reduced.push(last);
  }
  return reduced;
}

export class Monitors {
  private readonly sources = new Map<string, Source>();
  private readonly panes = new Map<string, Pane>();
  private readonly dashboards = new Map<string, Dashboard>();
  private tail: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly panels: MonitorPanels,
    private readonly manager: SshManager,
    private readonly plans?: MonitorPlans,
  ) {}

  open(input: z.infer<typeof MonitorSessionOpen>): MonitorSession {
    return this.openConnection(input.hostId, input.interval, () => this.manager.monitorPane(input.hostId, input.shellId), input.sudo);
  }

  openConnection(hostId: string, interval: z.infer<typeof SessionInterval>, acquire: () => MonitorConnection, elevated = false): MonitorSession {
    this.assertOpen();
    if (this.panes.size >= 24) throw errors.invalidInput("监控侧栏已达上限");
    const connection = acquire();
    const binding = this.binding(hostId, interval, 15);
    binding.elevated = elevated;
    const pane = { id: randomUUID(), binding, interval };
    this.panes.set(pane.id, pane);
    this.attach(binding, connection);
    return this.paneView(pane);
  }

  get(id: string) {
    return this.paneView(this.pane(id));
  }

  peek(id: string): MonitorSession | undefined {
    const pane = this.panes.get(id);
    return pane && { id, interval: pane.interval, host: this.view(pane.binding) };
  }

  session(input: z.infer<typeof MonitorSessionChange>): MonitorSession | null {
    if (input.action === "close") {
      this.closePane(input.id);
      return null;
    }
    const pane = this.pane(input.id);
    const binding = pane.binding;
    if (input.action === "pause") this.pause(binding);
    if (input.action === "continue" && binding.host.state === "paused") this.resume(binding);
    if (input.action === "retry") {
      if (!binding.source) throw new HuhuError("SSH_DISCONNECTED", "请在重新连接的分栏打开监控");
      this.retrySource(binding);
    }
    if (input.action === "interval") {
      pane.interval = input.interval;
      binding.interval = input.interval;
      if (binding.source) this.schedule(binding.source);
    }
    return this.paneView(pane);
  }

  dashboard(id: string): MonitorPanelRun | null {
    const entry = this.dashboards.get(id);
    const plan = this.plans?.read(id);
    return entry ? { id, revision: entry.panel.revision, state: entry.state, hosts: entry.bindings.map((binding) => this.view(binding)), ...(plan && { plan }) } : null;
  }

  availability(id: string): PlanSummary["availability"] {
    if (!this.panels.get(id)) return { state: "blocked", reason: "target-unavailable" };
    const run = this.dashboards.get(id);
    if (run && run.state !== "stopped" && run.bindings.some(({ source }) => source && !source.failure)) return { state: "ready" };
    return { state: "blocked", reason: "connection-unavailable", detail: "请在 SSH 面板启动或恢复连接" };
  }

  applyPlan(id: string): void {
    const run = this.dashboards.get(id);
    if (!run || run.state === "stopped") return;
    const plan = this.plans?.inspect(id);
    if (!plan || plan.intent === "deleted") {
      run.state = "stopped";
      for (const binding of run.bindings) this.disconnect(binding, "stopped");
      return;
    }
    for (const binding of run.bindings) binding.interval = plan.everySeconds;
    if (plan.intent === "paused" && run.state === "running") {
      run.state = "paused";
      for (const binding of run.bindings) this.pause(binding);
    } else if (plan.intent === "enabled" && run.state === "paused") {
      this.continueDashboard(run);
      this.plans?.wake(id);
    } else {
      for (const { source } of run.bindings) if (source) this.schedule(source);
    }
  }

  suspendPlans(): void {
    for (const run of this.dashboards.values()) {
      if (!run.bindings.some(({ panelId }) => panelId)) continue;
      run.state = "stopped";
      for (const binding of run.bindings) this.disconnect(binding, "stopped");
    }
  }

  async sampleDashboard(id: string, context: PeriodicRunContext): Promise<PeriodicRunOutcome | void> {
    const run = this.dashboards.get(id);
    if (run?.state !== "running" || !context.isCurrent()) return "skipped";
    const sources = new Set(run.bindings.flatMap(({ source }) => (source && !source.failure ? [source] : [])));
    const samples = await Promise.allSettled(
      [...sources].map(async (source) => {
        const period = this.period(source);
        if (!period || source.request || (source.requestedAt !== undefined && Date.now() - source.requestedAt + 100 < period * 1_000)) return false;
        await this.sample(source);
        if (source.failure) throw source.failure;
        return true;
      }),
    );
    for (const sample of samples) if (sample.status === "rejected") throw sample.reason;
    if (!samples.some((sample) => sample.status === "fulfilled" && sample.value)) return "skipped";
  }

  save(input: SaveMonitorPanel, signal: AbortSignal, scope?: MonitorPanelScope) {
    return this.serial(async () => {
      const plan = !scope && input.previous ? this.plans?.inspect(input.previous.id) : null;
      if (input.previous && !scope) this.plans?.check(input.previous.id, input.expectedPlanRevision);
      const previous = plan && input.previous ? this.panels.require(input.previous) : null;
      const saved = await this.panels.save(previous ? { ...input, interval: previous.interval } : input, signal, scope && this.inactiveScope(scope));
      this.clearDashboard(saved.id);
      if (plan && plan.intent !== "deleted") await this.plans?.set(saved, "paused", signal, plan.revision, input.interval);
      return !scope && this.plans ? this.plans.project(saved) : saved;
    });
  }

  delete(input: z.infer<typeof MonitorPanelRevision>, signal: AbortSignal, scope?: MonitorPanelScope) {
    return this.serial(async () => {
      const plan = !scope && this.plans?.inspect(input.id);
      const panel = plan && this.panels.require(input);
      if (panel && plan.intent !== "deleted") this.plans?.check(input.id, plan.revision);
      const result = await this.panels.delete(input, signal, scope && this.inactiveScope(scope));
      this.clearDashboard(input.id);
      if (panel && plan && plan.intent !== "deleted") await this.plans?.set(panel, "deleted", signal, plan.revision);
      return result;
    });
  }

  private inactiveScope(scope: MonitorPanelScope): MonitorPanelScope {
    return (panel) => {
      scope(panel);
      const run = panel && this.dashboards.get(panel.id);
      if (run && run.state !== "stopped") throw errors.permissionDenied("监控面板仍在使用");
    };
  }

  change(input: z.infer<typeof MonitorPanelChange>, signal: AbortSignal, acquire?: (hostId: string) => MonitorConnection) {
    return this.serial(async () => {
      this.assertOpen();
      signal.throwIfAborted();
      const panel = this.panels.require(input);
      let run = this.dashboards.get(panel.id);
      this.plans?.check(panel.id, input.expectedPlanRevision);
      if (input.action === "start" && (!run || run.state === "stopped")) {
        if ([...this.dashboards.values()].filter(({ state }) => state !== "stopped").length >= 8) throw errors.invalidInput("最多同时打开 8 个监控面板");
        await this.plans?.set(panel, "enabled", signal, input.expectedPlanRevision);
        signal.throwIfAborted();
        const plan = this.plans?.inspect(panel.id);
        if (this.plans && plan?.intent !== "enabled") return this.dashboard(panel.id);
        const interval = plan?.everySeconds ?? panel.interval;
        const bindings = panel.hostIds.map((hostId) => this.binding(hostId, interval, panel.retention));
        if (this.plans) for (const binding of bindings) binding.panelId = panel.id;
        if (acquire) for (const binding of bindings) binding.acquire = () => acquire(binding.host.hostId);
        run = { panel, state: "running", bindings };
        this.dashboards.set(panel.id, run);
        for (const binding of bindings) this.dial(binding);
      } else if (run && input.action === "pause" && run.state === "running") {
        await this.plans?.set(panel, "paused", signal, input.expectedPlanRevision);
        run.state = "paused";
        for (const binding of run.bindings) this.pause(binding);
      } else if (run && input.action === "continue" && run.state === "paused") {
        await this.plans?.set(panel, "enabled", signal, input.expectedPlanRevision);
        this.continueDashboard(run);
        this.plans?.wake(panel.id);
      } else if (run && input.action === "stop") {
        if (run.state !== "stopped") await this.plans?.set(panel, "paused", signal, input.expectedPlanRevision);
        run.state = "stopped";
        for (const binding of run.bindings) this.disconnect(binding, "stopped");
      } else if (run?.state === "running" && input.action === "retry") {
        const binding = run.bindings.find(({ host }) => host.hostId === input.hostId);
        if (!binding) throw errors.notFound("主机不在当前面板内");
        if (binding.source) this.retrySource(binding);
        else this.dial(binding);
      }
      return this.dashboard(panel.id);
    });
  }

  changeDashboardSudo(input: z.infer<typeof MonitorPanelSudo>) {
    return this.serial(async () => {
      this.assertOpen();
      this.panels.require(input);
      const run = this.dashboards.get(input.id);
      const binding = run?.bindings.find(({ host }) => host.hostId === input.hostId);
      if (!run || run.state === "stopped" || !binding) throw errors.notFound("此主机没有运行中的监控");
      if (Boolean(binding.elevated) === input.sudo) return this.dashboard(input.id);
      this.unbindSource(binding);
      binding.elevated = input.sudo;
      delete binding.host.latest;
      delete binding.host.platform;
      this.gap(binding);
      if (binding.connection) this.bindSource(binding, binding.connection);
      return this.dashboard(input.id);
    });
  }

  private continueDashboard(run: Dashboard): void {
    run.state = "running";
    for (const binding of run.bindings) {
      if (binding.host.state !== "paused") continue;
      if (binding.source) this.resume(binding);
      else this.dial(binding);
    }
  }

  dispose() {
    this.disposed = true;
    for (const id of this.panes.keys()) this.closePane(id);
    for (const id of this.dashboards.keys()) this.clearDashboard(id);
  }

  private serial<T>(operation: () => Promise<T>) {
    const next = this.tail.then(operation);
    this.tail = next.catch(() => undefined);
    return next;
  }

  private assertOpen() {
    if (this.disposed) throw errors.notFound("监控所属 Vault 已关闭");
  }

  private binding(hostId: string, interval: number, retention: number): Binding {
    return { host: { hostId, state: "connecting", subscribers: 0, history: [] }, interval, retention, enabled: true };
  }

  private pane(id: string) {
    const pane = this.panes.get(id);
    if (!pane) throw errors.notFound("此分栏监控已关闭");
    return pane;
  }

  private paneView(pane: Pane): MonitorSession {
    clearTimeout(pane.expiry);
    pane.expiry = setTimeout(() => this.closePane(pane.id), PANE_LEASE_MS);
    pane.expiry.unref();
    return { id: pane.id, interval: pane.interval, host: this.view(pane.binding) };
  }

  private closePane(id: string) {
    const pane = this.panes.get(id);
    if (!pane) return;
    clearTimeout(pane.expiry);
    this.disconnect(pane.binding, "stopped");
    this.panes.delete(id);
  }

  private clearDashboard(id: string) {
    const run = this.dashboards.get(id);
    if (run) for (const binding of run.bindings) this.disconnect(binding, "stopped");
    this.dashboards.delete(id);
  }

  private view(binding: Binding): MonitorHost {
    const { host, source } = binding;
    this.trim(binding);
    return { ...host, ...(binding.elevated && { sudo: true }), history: reduceHistory(host.history), interval: source ? this.period(source) : undefined, subscribers: source?.users.size ?? 0 };
  }

  private dial(binding: Binding) {
    if (binding.dial) return;
    const dial = new AbortController();
    binding.dial = dial;
    binding.enabled = true;
    Object.assign(binding.host, { state: "connecting", prompt: undefined, message: undefined });
    const connection = binding.acquire
      ? Promise.resolve().then(binding.acquire)
      : this.manager.acquireMonitor(binding.host.hostId, dial.signal, (status) => {
          if (dial.signal.aborted || binding.dial !== dial) return;
          binding.host.state = status.state === "waiting" ? "trust" : "connecting";
          binding.host.prompt = status.state === "waiting" || status.state === "key-changed" ? status.prompt : undefined;
        });
    void connection.then(
      (connection) => {
        if (dial.signal.aborted || binding.dial !== dial || this.disposed) {
          connection.release();
          return;
        }
        delete binding.dial;
        this.attach(binding, connection);
      },
      (error: unknown) => {
        if (dial.signal.aborted || binding.dial !== dial) return;
        delete binding.dial;
        binding.host.state = error instanceof HuhuError && error.code === "NOT_FOUND" ? "missing" : "failed";
        binding.host.message = error instanceof HuhuError ? error.message : "无法建立监控连接";
      },
    );
  }

  private attach(binding: Binding, connection: MonitorConnection) {
    const { host } = binding;
    if (host.connectionId !== connection.id) {
      host.history = [];
      delete host.latest;
      delete host.platform;
    }
    binding.connection = connection;
    const off = connection.onClose(() => this.disconnect(binding, "disconnected"));
    binding.release = () => {
      off();
      connection.release();
    };
    this.bindSource(binding, connection);
  }

  private bindSource(binding: Binding, connection: MonitorConnection) {
    const { host } = binding;
    const elevated = binding.elevated ?? false;
    const key = JSON.stringify([connection.id, elevated]);
    const source = this.sources.get(key) ?? { id: connection.id, key, elevated, client: connection.client, users: new Set<Binding>() };
    this.sources.set(key, source);
    source.users.add(binding);
    binding.source = source;
    Object.assign(host, { connectionId: source.id, state: binding.enabled ? (source.failure?.phase ?? "sampling") : "paused", message: source.failure?.message, prompt: undefined, platform: source.platform });
    this.schedule(source);
    if (binding.panelId) this.plans?.wake(binding.panelId);
  }

  private pause(binding: Binding) {
    if (binding.host.state === "disconnected" || binding.host.state === "missing" || !binding.enabled) return;
    binding.enabled = false;
    binding.dial?.abort();
    delete binding.dial;
    binding.host.state = "paused";
    delete binding.host.prompt;
    this.gap(binding);
    if (binding.source) this.schedule(binding.source);
  }

  private resume(binding: Binding) {
    const source = binding.source;
    if (!source) return;
    binding.enabled = true;
    Object.assign(binding.host, { state: source.failure?.phase ?? "sampling", message: source.failure?.message });
    this.schedule(source);
  }

  private retrySource(binding: Binding) {
    const source = binding.source;
    if (!source || !source.failure) return;
    source.failure = undefined;
    source.platform = undefined;
    source.previous = undefined;
    source.requestedAt = undefined;
    for (const user of source.users)
      if (user.enabled) {
        this.gap(user);
        Object.assign(user.host, { state: "sampling", message: undefined });
      }
    this.schedule(source);
    if (binding.panelId) this.plans?.wake(binding.panelId);
  }

  private disconnect(binding: Binding, state: "disconnected" | "stopped") {
    binding.enabled = false;
    binding.dial?.abort();
    delete binding.dial;
    this.unbindSource(binding);
    delete binding.connection;
    binding.release?.();
    delete binding.release;
    this.gap(binding);
    Object.assign(binding.host, { state, prompt: undefined, message: state === "disconnected" ? "原 SSH 连接或分栏已关闭" : undefined });
  }

  private unbindSource(binding: Binding) {
    const source = binding.source;
    if (!source) return;
    source.users.delete(binding);
    delete binding.source;
    if (!source.users.size) this.sources.delete(source.key);
    this.schedule(source);
  }

  private gap(binding: Binding) {
    const { history } = binding.host;
    if (history.at(-1)?.sample === null) return;
    history.push({ at: Date.now(), sample: null });
    this.trim(binding);
  }

  private append(binding: Binding, point: MonitorPoint) {
    const { history } = binding.host;
    const width = Math.max(1000, (binding.retention * 60_000) / MAX_POINTS);
    const last = history.at(-1);
    const historical = { ...point, sample: point.sample && { ...point.sample } };
    // Hardware detail belongs to the latest sample. Keep history bounded by its existing aggregate metrics.
    if (historical.sample) {
      delete historical.sample.cores;
      delete historical.sample.interfaces;
    }
    if (last?.sample && Math.floor(last.at / width) === Math.floor(point.at / width)) history[history.length - 1] = historical;
    else history.push(historical);
    binding.host.latest = point;
    this.trim(binding);
  }

  private cutoff(binding: Binding) {
    return Date.now() - binding.retention * 60_000;
  }

  private historyStart(history: readonly MonitorPoint[], cutoff: number) {
    let remove = Math.max(0, history.length - MAX_POINTS);
    while (remove < history.length && history[remove]!.at < cutoff) remove++;
    return remove;
  }

  private trim(binding: Binding) {
    const { history } = binding.host;
    const cutoff = this.cutoff(binding);
    const remove = this.historyStart(history, cutoff);
    if (remove) history.splice(0, remove);
    if (binding.host.latest && binding.host.latest.at < cutoff) delete binding.host.latest;
  }

  private period(source: Source, leaseOnly = false) {
    const intervals = [...source.users].filter(({ enabled, panelId }) => enabled && (!leaseOnly || !panelId)).map(({ interval }) => interval);
    return intervals.length ? Math.min(...intervals) : undefined;
  }

  private schedule(source: Source) {
    clearTimeout(source.timer);
    source.timer = undefined;
    if (!this.period(source) || this.disposed) {
      source.request?.abort();
      source.previous = undefined;
      source.requestedAt = undefined;
      return;
    }
    const period = this.period(source, true);
    if (!period || source.request || source.failure) return;
    const wait = source.requestedAt === undefined ? 0 : Math.max(0, source.requestedAt + period * 1000 - Date.now());
    source.timer = setTimeout(() => void this.sample(source), wait);
    source.timer.unref();
  }

  private async sample(source: Source) {
    if (source.request || !this.period(source)) return;
    const request = new AbortController();
    source.request = request;
    source.requestedAt = Date.now();
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]);
    try {
      const platform = source.platform ?? (await detectPlatform(source.client, signal));
      const reading = await readSample(source.client, platform, signal, source.previous, source.elevated);
      if (request.signal.aborted) return;
      source.platform = platform;
      source.previous = reading.counters;
      const point = { at: reading.at, sample: reading.sample };
      for (const binding of source.users)
        if (binding.enabled) {
          Object.assign(binding.host, { state: "running", platform, message: undefined });
          this.append(binding, point);
        }
    } catch (error) {
      if (request.signal.aborted) return;
      if (error instanceof HuhuError && error.code === "SSH_DISCONNECTED") {
        for (const binding of source.users) this.disconnect(binding, "disconnected");
      } else {
        source.failure = error instanceof SampleError ? error : new SampleError("failed", "监控查询失败");
        for (const binding of source.users)
          if (binding.enabled) {
            this.gap(binding);
            Object.assign(binding.host, { state: source.failure.phase, message: source.failure.message });
          }
      }
    } finally {
      source.request = undefined;
      this.schedule(source);
    }
  }
}
