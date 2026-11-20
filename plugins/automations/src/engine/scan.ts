import { isTaskAvailable, matchesTags } from "@huhu/contracts";

export interface SnapshotTask {
  id: string;
  title: string;
  type: "human" | "agent";
  status: "not_started" | "in_progress" | "completed";
  tags: string[];
  availableAt?: string | null;
  execution: { spaceId: string | null; provider: string | null } | null;
  usesExistingSession?: boolean;
  inputRevision: number;
  inputHash: string;
  /** 任务自身原因导致的不可派发原因（结构错误、缺少执行配置、引用越界等）。 */
  dispatchBlockers: string[];
}

export type SkipReason = "not-open" | "not-agent" | "tag-mismatch" | "not-due" | "outside-window" | "unscheduled" | "task-blocked" | "missing-space" | "space-inaccessible" | "cli-missing" | "held-after-restore";

export interface ScanEnv {
  holds(taskId: string, inputHash: string): boolean;
  spaceAccessible(spaceId: string): "ok" | "missing" | "inaccessible";
  cliAvailable(provider: string): boolean;
}

export interface Candidate<T extends SnapshotTask = SnapshotTask> {
  task: T;
  processingKey: string;
}
export interface Skipped<T extends SnapshotTask = SnapshotTask> {
  task: T;
  reason: SkipReason;
  detail?: string;
}

export interface ScanFilter {
  tags?: string[];
  now?: Date;
  window?: { start: number; end: number };
  includeOverdue?: boolean;
  includeUnscheduled?: boolean;
}

export const processingKeyOf = (t: Pick<SnapshotTask, "id" | "inputRevision" | "inputHash">): string => `${t.id}:${t.inputRevision}:${t.inputHash}`;

/**
 * 只读分类：候选与跳过原因。预览和真实扫描共用，保证两者一致。
 * 只有 type=agent、status=not_started 且符合标签筛选的任务才可能成为候选。
 */
export function classify<T extends SnapshotTask>(tasks: T[], env: ScanEnv, filter: ScanFilter = {}): { candidates: Candidate<T>[]; skipped: Skipped<T>[] } {
  const candidates: Candidate<T>[] = [];
  const skipped: Skipped<T>[] = [];
  const now = filter.now ?? new Date();
  for (const task of tasks) {
    const skip = (reason: SkipReason, detail?: string) => skipped.push({ task, reason, ...(detail ? { detail } : {}) });
    if (task.type !== "agent") {
      skip("not-agent");
      continue;
    }
    if (task.status !== "not_started") {
      skip("not-open", task.status);
      continue;
    }
    if (filter.tags && filter.tags.length > 0 && !matchesTags(task.tags, filter.tags)) {
      skip("tag-mismatch");
      continue;
    }
    if (!isTaskAvailable(task.availableAt, now)) {
      skip("not-due", task.availableAt ?? undefined);
      continue;
    }
    if (task.availableAt == null && filter.includeUnscheduled === false) {
      skip("unscheduled");
      continue;
    }
    if (task.availableAt != null && filter.window) {
      const instant = Date.parse(task.availableAt);
      if (instant >= filter.window.end || (instant < filter.window.start && !filter.includeOverdue)) {
        skip("outside-window", task.availableAt);
        continue;
      }
    }
    if (task.dispatchBlockers.length > 0) {
      skip("task-blocked", task.dispatchBlockers.join("；"));
      continue;
    }
    if (env.holds(task.id, task.inputHash)) {
      skip("held-after-restore");
      continue;
    }
    const spaceId = task.execution?.spaceId;
    if (!spaceId) {
      skip("missing-space");
      continue;
    }
    const sp = env.spaceAccessible(spaceId);
    if (sp !== "ok") {
      skip(sp === "missing" ? "missing-space" : "space-inaccessible");
      continue;
    }
    if (!task.usesExistingSession && (!task.execution?.provider || !env.cliAvailable(task.execution.provider))) {
      skip("cli-missing");
      continue;
    }
    candidates.push({ task, processingKey: processingKeyOf(task) });
  }
  return { candidates, skipped };
}
