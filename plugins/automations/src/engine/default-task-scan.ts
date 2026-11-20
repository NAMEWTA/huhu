import { errors, HuhuError } from "@huhu/contracts";
import { idFromFilename, parseFrontmatter, type SemanticRepository, type VaultFiles } from "@huhu/vault";
import { z } from "zod";
import { PRESETS, validateSchedule } from "../shared/cron.js";

export const DEFAULT_TASK_SCAN_RULE_ID = "rule-defaulttaskscan";
export const DEFAULT_TASK_SCAN_SERVICE = "automations.defaultTaskScan";
const markerPath = "automations/default-task-scan.json";
const Marker = z.strictObject({ schema: z.literal(1), ruleId: z.literal(DEFAULT_TASK_SCAN_RULE_ID), state: z.enum(["pending", "initialized"]) });
type MarkerState = z.infer<typeof Marker>["state"];
type Result = { ruleId: typeof DEFAULT_TASK_SCAN_RULE_ID; state: "created" | "existing" | "deleted" };

export type DefaultTaskScanService = Pick<DefaultTaskScan, "initializeAfterEnable" | "restore">;

export class DefaultTaskScan implements DefaultTaskScanService {
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly stateFiles: VaultFiles,
    private readonly vaultFiles: VaultFiles,
    private readonly repo: SemanticRepository,
    private readonly zone: () => string,
    private readonly now: () => Date,
    private readonly ruleCreated: (id: string) => void,
  ) {}

  initializeAfterEnable(): Promise<Result> {
    return this.run(() => this.ensure(false));
  }

  restore(): Promise<Result> {
    return this.run(() => this.ensure(true));
  }

  deleteRule(remove: () => Promise<void>): Promise<void> {
    return this.run(async () => {
      const marker = this.readMarker();
      // Complete the marker first so deletion after a partial install is still durable.
      if (marker?.state !== "initialized" && this.hasRule()) await this.writeMarker("initialized", marker?.version ?? null);
      await remove();
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.tail.catch(() => undefined);
  }

  private run<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail
      .catch(() => undefined)
      .then(() => {
        if (this.closed) throw errors.pluginDisabled("automations");
        this.stateFiles.assertWritable();
        return work();
      });
    this.tail = next;
    return next;
  }

  private readMarker(): { state: MarkerState; version: string } | null {
    const file = this.stateFiles.read(markerPath);
    if (!file) return null;
    try {
      const { state } = Marker.parse(JSON.parse(file.bytes.toString("utf8")));
      return { state, version: file.version };
    } catch {
      throw new HuhuError("WRITE_PARTIAL", "默认任务扫描初始化标记损坏", { details: { path: markerPath } });
    }
  }

  private async writeMarker(state: MarkerState, expectedVersion: string | null): Promise<string> {
    const marker = { schema: 1, ruleId: DEFAULT_TASK_SCAN_RULE_ID, state } satisfies z.infer<typeof Marker>;
    const { version } = await this.stateFiles.write(markerPath, Buffer.from(`${JSON.stringify(marker)}\n`), { expectedVersion });
    return version;
  }

  private hasRule(): boolean {
    const kind = "automation-rule";
    if (this.repo.list(kind).some((rule) => rule.id === DEFAULT_TASK_SCAN_RULE_ID)) return true;
    // A rejected semantic file with the reserved ID is not a deleted rule.
    for (const problem of this.repo.problemList()) {
      if (problem.kind !== kind) continue;
      const text = this.vaultFiles.read(problem.path)?.bytes.toString("utf8") ?? "";
      const header = parseFrontmatter(text).data.huhu as { id?: unknown } | undefined;
      if (idFromFilename(problem.path) === DEFAULT_TASK_SCAN_RULE_ID || header?.id === DEFAULT_TASK_SCAN_RULE_ID) {
        throw new HuhuError("WRITE_PARTIAL", "默认任务扫描规则文件有问题", { details: { path: problem.path } });
      }
    }
    return false;
  }

  private async ensure(restore: boolean): Promise<Result> {
    const ruleId = DEFAULT_TASK_SCAN_RULE_ID;
    const marker = this.readMarker();
    if (this.hasRule()) {
      if (marker?.state !== "initialized") {
        await this.writeMarker("initialized", marker?.version ?? null);
        this.ruleCreated(ruleId);
      }
      return { ruleId, state: "existing" };
    }
    // An initialized marker with no rule is the tombstone, including a deletion on disk.
    if (marker?.state === "initialized" && !restore) return { ruleId, state: "deleted" };

    const preset = "every15";
    const cron = PRESETS[preset]!;
    const zone = this.zone();
    validateSchedule(cron, zone);
    const version = marker?.state === "pending" ? marker.version : await this.writeMarker("pending", marker?.version ?? null);
    const kind = "automation-rule";
    const now = this.now().toISOString();
    await this.repo.create(
      kind,
      {
        title: "处理可执行的 Agent 任务",
        enabled: true,
        trigger: { preset, cron, zone },
        missedRunGraceMinutes: 30,
        action: { kind: "agent", input: { source: "tasks", tags: [], includeOverdue: true, includeUnscheduled: true, maxConcurrent: 1 } },
        createdAt: now,
        updatedAt: now,
      },
      "",
      ruleId,
    );
    await this.writeMarker("initialized", version);
    this.ruleCreated(ruleId);
    return { ruleId, state: "created" };
  }
}
