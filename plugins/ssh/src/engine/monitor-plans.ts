import { errors, PERIODIC_PLANS_SERVICE, type PeriodicPlanControl, type PeriodicPlanSpec } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { PANEL_INTERVALS, PanelInterval, type MonitorPanel } from "../shared/monitoring.js";

const prefix = "periodic-ssh-monitor-";

export function monitorForPlan(planId: string): string | undefined {
  return planId.startsWith(prefix) ? planId.slice(prefix.length) : undefined;
}

export class MonitorPlans {
  constructor(private readonly api: HuhuApi) {}

  private control() {
    return this.api.service<PeriodicPlanControl>(PERIODIC_PLANS_SERVICE);
  }

  inspect(id: string) {
    return this.control()?.inspect(prefix + id) ?? null;
  }

  read(id: string) {
    return this.control()?.read(prefix + id) ?? null;
  }

  project(panel: MonitorPanel): MonitorPanel {
    const current = this.inspect(panel.id);
    const plan = this.read(panel.id);
    const interval = PanelInterval.safeParse(current?.everySeconds);
    return plan ? { ...panel, interval: interval.success ? interval.data : panel.interval, plan } : panel;
  }

  check(id: string, expectedRevision: string | null | undefined): void {
    const current = this.inspect(id);
    if (expectedRevision !== undefined && expectedRevision !== (current?.revision ?? null)) throw errors.versionConflict(current?.revision ?? "");
    const availability = this.read(id)?.availability;
    if (availability?.state === "blocked" && availability.reason === "foreign-owner") throw errors.permissionDenied("SSH 采样计划属于另一设备");
  }

  async set(panel: MonitorPanel, intent: PeriodicPlanSpec["intent"], signal: AbortSignal, expectedRevision?: string | null, interval?: MonitorPanel["interval"]) {
    this.api.vault.files.assertWritable();
    const service = this.control();
    if (!service) throw errors.pluginDisabled("automations");
    const current = service.inspect(prefix + panel.id);
    this.check(panel.id, expectedRevision);
    const everySeconds = interval ?? current?.everySeconds ?? panel.interval;
    if (current?.intent === intent && current.everySeconds === everySeconds && current.title === panel.name) return;
    const object = { kind: "ssh-monitor-panel", id: panel.id };
    await service.configure(
      [
        {
          planId: prefix + panel.id,
          expectedRevision: current?.revision ?? null,
          source: { plugin: "ssh", object },
          title: panel.name,
          action: { capability: "ssh.monitor.panels.run", object, summary: "采样已启动的 SSH 监控面板" },
          everySeconds,
          bounds: { min: 2, max: 60, step: 1, allowed: [...PANEL_INTERVALS] },
          intent,
        },
      ],
      signal,
    );
  }

  wake(id: string): void {
    const service = this.control();
    const current = service?.inspect(prefix + id);
    if (current?.intent === "enabled") service?.wake(current, 0);
  }
}
