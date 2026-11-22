import { randomUUID } from "node:crypto";
import { errors } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { MonitorPanel, MonitorPanelRevision, type SaveMonitorPanel } from "../shared/monitoring.js";
import type { HostConfigurations } from "./host-configurations.js";

const FILE = ".huhu/ssh/monitor-panels.json";
const LIMIT = 24;
const State = z.strictObject({ version: z.literal(1), panels: z.array(MonitorPanel).max(LIMIT) });
type Revision = z.infer<typeof MonitorPanelRevision>;

export class MonitorPanels {
  constructor(
    private readonly files: HuhuApi["vault"]["files"],
    private readonly hosts: HostConfigurations,
  ) {}

  private read() {
    const file = this.files.read(FILE);
    if (!file) {
      if (this.files.exists(FILE)) throw errors.invalidInput("监控面板配置应为普通文件");
      return { panels: [], version: null } as const;
    }
    try {
      const { panels } = State.parse(JSON.parse(file.bytes.toString("utf8")));
      if (new Set(panels.map(({ id }) => id)).size === panels.length) return { panels, version: file.version };
    } catch {
      // The original file remains available for repair.
    }
    throw errors.invalidInput("监控面板配置格式无效");
  }

  list() {
    return [...this.read().panels];
  }

  get(id: string) {
    return this.list().find((panel) => panel.id === id);
  }

  require(input: Revision) {
    return this.match(this.list(), input);
  }

  save(input: SaveMonitorPanel, signal: AbortSignal) {
    return this.hosts.withStableDirectory(async () => {
      this.files.assertWritable();
      const { panels, version } = this.read();
      const { previous, ...draft } = input;
      const old = previous && this.match(panels, previous);
      if (!old && panels.length >= LIMIT) throw errors.invalidInput("最多保存 24 个监控面板");
      const available = new Set((await this.hosts.list()).map(({ id }) => id));
      if (draft.hostIds.some((id) => !available.has(id))) throw errors.notFound("所选主机已移除");
      const saved = { ...draft, id: old?.id ?? randomUUID(), revision: randomUUID() };
      signal.throwIfAborted();
      await this.write(old ? panels.map((entry) => (entry.id === old.id ? saved : entry)) : [...panels, saved], version);
      return saved;
    });
  }

  delete(input: Revision, signal: AbortSignal) {
    return this.hosts.withStableDirectory(async () => {
      this.files.assertWritable();
      const { panels, version } = this.read();
      this.match(panels, input);
      signal.throwIfAborted();
      await this.write(
        panels.filter(({ id }) => id !== input.id),
        version,
      );
      return { ok: true as const };
    });
  }

  private match(panels: readonly MonitorPanel[], { id, expectedRevision }: Revision) {
    const panel = panels.find((entry) => entry.id === id);
    if (!panel) throw errors.notFound("监控面板已移除");
    if (panel.revision !== expectedRevision) throw errors.versionConflict(panel.revision);
    return panel;
  }

  private async write(panels: MonitorPanel[], expectedVersion: string | null) {
    await this.files.write(FILE, Buffer.from(JSON.stringify({ version: 1, panels }, null, 2) + "\n"), { expectedVersion });
  }
}
