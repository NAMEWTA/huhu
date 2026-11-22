import { randomUUID } from "node:crypto";
import { errors, HuhuError } from "@huhu/contracts";
import type { Client } from "ssh2";
import type { z } from "zod";
import type { MonitorHost, MonitorPanel, MonitorPanelChange, MonitorPanelRevision, MonitorPanelRun, MonitorPoint, MonitorSession, MonitorSessionChange, MonitorSessionOpen, SaveMonitorPanel, SessionInterval } from "../shared/monitoring.js";
import type { MonitorConnection, SshManager } from "./manager.js";
import type { MonitorPanels, MonitorPanelScope } from "./monitor-panels.js";
import { detectPlatform, readSample, SampleError, type Counters, type Platform } from "./monitor-sample.js";

const MAX_POINTS = 1800;
const PANE_LEASE_MS = 120_000;

type Source = {
  id: string;
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
  routeIdentity?: string;
  interval: number;
  retention: number;
  enabled: boolean;
  source?: Source;
  release?: () => void;
  dial?: AbortController;
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
  ) {}

  open(input: z.infer<typeof MonitorSessionOpen>): MonitorSession {
    this.assertOpen();
    if (this.panes.size >= 24) throw errors.invalidInput("监控侧栏已达上限");
    const connection = this.manager.monitorPane(input.hostId, input.shellId);
    const binding = this.binding(input.hostId, input.interval, 15);
    const pane = { id: randomUUID(), binding, interval: input.interval };
    this.panes.set(pane.id, pane);
    this.attach(binding, connection);
    return this.paneView(pane);
  }

  get(id: string) {
    return this.paneView(this.pane(id));
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
    return entry ? { id, revision: entry.panel.revision, state: entry.state, hosts: entry.bindings.map((binding) => this.view(binding)) } : null;
  }

  cachedDashboard(panel: MonitorPanel, routes: ReadonlyMap<string, string>) {
    const entry = this.dashboards.get(panel.id);
    if (!entry || entry.panel.revision !== panel.revision) return null;
    const hosts = entry.bindings.flatMap((binding) => {
      const { hostId, state, platform, latest, history } = binding.host;
      if (!binding.routeIdentity || routes.get(hostId) !== binding.routeIdentity) return [];
      const cutoff = this.cutoff(binding);
      return [{ hostId, state, platform, latest: latest && latest.at >= cutoff ? latest : undefined, history: reduceHistory(history.slice(this.historyStart(history, cutoff))) }];
    });
    return { id: panel.id, revision: panel.revision, state: entry.state, hosts };
  }

  save(input: SaveMonitorPanel, signal: AbortSignal, scope?: MonitorPanelScope) {
    return this.serial(async () => {
      const saved = await this.panels.save(input, signal, scope && this.inactiveScope(scope));
      this.clearDashboard(saved.id);
      return saved;
    });
  }

  delete(input: z.infer<typeof MonitorPanelRevision>, signal: AbortSignal, scope?: MonitorPanelScope) {
    return this.serial(async () => {
      const result = await this.panels.delete(input, signal, scope && this.inactiveScope(scope));
      this.clearDashboard(input.id);
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

  change(input: z.infer<typeof MonitorPanelChange>, signal: AbortSignal) {
    return this.serial(async () => {
      this.assertOpen();
      signal.throwIfAborted();
      const panel = this.panels.require(input);
      let run = this.dashboards.get(panel.id);
      if (input.action === "start" && (!run || run.state === "stopped")) {
        if ([...this.dashboards.values()].filter(({ state }) => state !== "stopped").length >= 8) throw errors.invalidInput("最多同时打开 8 个监控面板");
        const bindings = panel.hostIds.map((hostId) => this.binding(hostId, panel.interval, panel.retention));
        run = { panel, state: "running", bindings };
        this.dashboards.set(panel.id, run);
        for (const binding of bindings) this.dial(binding);
      } else if (run && input.action === "pause" && run.state === "running") {
        run.state = "paused";
        for (const binding of run.bindings) this.pause(binding);
      } else if (run && input.action === "continue" && run.state === "paused") {
        run.state = "running";
        for (const binding of run.bindings) {
          if (binding.host.state !== "paused") continue;
          if (binding.source) this.resume(binding);
          else this.dial(binding);
        }
      } else if (run && input.action === "stop") {
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
    return { ...host, history: reduceHistory(host.history), interval: source ? this.period(source) : undefined, subscribers: source?.users.size ?? 0 };
  }

  private dial(binding: Binding) {
    if (binding.dial) return;
    const dial = new AbortController();
    binding.dial = dial;
    binding.enabled = true;
    Object.assign(binding.host, { state: "connecting", prompt: undefined, message: undefined });
    void this.manager
      .acquireMonitor(binding.host.hostId, dial.signal, (status) => {
        if (dial.signal.aborted || binding.dial !== dial) return;
        binding.host.state = status.state === "waiting" ? "trust" : "connecting";
        binding.host.prompt = status.state === "waiting" || status.state === "key-changed" ? status.prompt : undefined;
      })
      .then(
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
    const source = this.sources.get(connection.id) ?? { id: connection.id, client: connection.client, users: new Set<Binding>() };
    this.sources.set(source.id, source);
    source.users.add(binding);
    binding.source = source;
    binding.routeIdentity = connection.routeIdentity;
    const off = connection.onClose(() => this.disconnect(binding, "disconnected"));
    binding.release = () => {
      off();
      connection.release();
    };
    Object.assign(host, { connectionId: source.id, state: source.failure?.phase ?? "sampling", message: source.failure?.message, prompt: undefined, platform: source.platform });
    this.schedule(source);
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
  }

  private disconnect(binding: Binding, state: "disconnected" | "stopped") {
    binding.enabled = false;
    binding.dial?.abort();
    delete binding.dial;
    const source = binding.source;
    if (source) {
      source.users.delete(binding);
      delete binding.source;
      if (!source.users.size) this.sources.delete(source.id);
      this.schedule(source);
    }
    binding.release?.();
    delete binding.release;
    this.gap(binding);
    Object.assign(binding.host, { state, prompt: undefined, message: state === "disconnected" ? "原 SSH 连接或分栏已关闭" : undefined });
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
    if (last?.sample && Math.floor(last.at / width) === Math.floor(point.at / width)) history[history.length - 1] = point;
    else history.push(point);
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

  private period(source: Source) {
    const intervals = [...source.users].filter(({ enabled }) => enabled).map(({ interval }) => interval);
    return intervals.length ? Math.min(...intervals) : undefined;
  }

  private schedule(source: Source) {
    clearTimeout(source.timer);
    source.timer = undefined;
    const period = this.period(source);
    if (!period || this.disposed) {
      source.request?.abort();
      source.previous = undefined;
      source.requestedAt = undefined;
      return;
    }
    if (source.request || source.failure) return;
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
      const reading = await readSample(source.client, platform, signal, source.previous);
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
