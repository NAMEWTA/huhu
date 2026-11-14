import { matchesTags } from "@huhu/contracts";

export interface SnapshotTask {
  id: string;
  title: string;
  type: "human" | "agent";
  status: "not_started" | "in_progress" | "completed";
  tags: string[];
  execution: { spaceId: string | null; provider: string | null } | null;
  inputRevision: number;
  inputHash: string;
  /** 任务自身原因导致的不可派发原因（结构错误、缺少执行配置、引用越界等）。 */
  dispatchBlockers: string[];
}

export type SkipReason = "not-open" | "not-agent" | "tag-mismatch" | "task-blocked" | "missing-space" | "space-inaccessible" | "space-busy" | "cli-missing" | "succeeded" | "retryable" | "running" | "held-after-restore";

export interface Claim {
  processingKey: string;
  taskId: string;
  runId: string;
  state: "queued" | "running" | "waiting_input" | "succeeded" | "failed" | "cancelled" | "unknown";
  claimedAt: string;
  /** 启动这次运行的机器：多机共享 Vault 时，对账只处理本机的 claim。缺省（旧数据）视为任何机器都可对账。 */
  machineId?: string;
  attempt?: number;
  workerPid?: number;
  supervisorPid?: number;
}

export const ACTIVE_CLAIM = new Set<Claim["state"]>(["queued", "running", "waiting_input", "unknown"]);

export interface ScanEnv {
  claims(processingKey: string): Claim | null;
  holds(taskId: string, inputHash: string): boolean;
  spaceAccessible(spaceId: string): "ok" | "missing" | "inaccessible";
  /** 这个 Space 里是否已有活动运行（同一 Space 同一时间只跑一个）。 */
  spaceBusy(spaceId: string): boolean;
  cliAvailable(provider: string): boolean;
}

export interface Candidate {
  task: SnapshotTask;
  processingKey: string;
}
export interface Skipped {
  task: SnapshotTask;
  reason: SkipReason;
  detail?: string;
}

export const processingKeyOf = (t: Pick<SnapshotTask, "id" | "inputRevision" | "inputHash">): string => `${t.id}:${t.inputRevision}:${t.inputHash}`;

/**
 * 只读分类：候选与跳过原因。预览和真实扫描共用，保证两者一致。
 * 只有 type=agent、status=not_started 且符合标签筛选的任务才可能成为候选。
 */
export function classify(tasks: SnapshotTask[], env: ScanEnv, filter: { tags?: string[] } = {}): { candidates: Candidate[]; skipped: Skipped[] } {
  const candidates: Candidate[] = [];
  const skipped: Skipped[] = [];
  const usedSpaces = new Set<string>(); // 一次扫描里同一 Space 只选一个候选
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
    if (task.dispatchBlockers.length > 0) {
      skip("task-blocked", task.dispatchBlockers.join("；"));
      continue;
    }
    const key = processingKeyOf(task);
    const claim = env.claims(key);
    if (claim) {
      // 活动运行不重复派发；成功的需要重开才会生成新的 key；失败 / 取消的由用户“重试”（同一个 key，attempt + 1）
      if (ACTIVE_CLAIM.has(claim.state)) skip("running", claim.state);
      else skip(claim.state === "succeeded" ? "succeeded" : "retryable", claim.state);
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
    if (!task.execution?.provider || !env.cliAvailable(task.execution.provider)) {
      skip("cli-missing");
      continue;
    }
    if (env.spaceBusy(spaceId) || usedSpaces.has(spaceId)) {
      skip("space-busy");
      continue;
    }
    usedSpaces.add(spaceId);
    candidates.push({ task, processingKey: key });
  }
  return { candidates, skipped };
}
