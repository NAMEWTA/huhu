export interface SnapshotTask {
  id: string;
  title: string;
  completed: boolean;
  execution: { kind: "manual" } | { kind: "agent"; spaceId: string | null; provider: string | null };
  inputRevision: number;
  inputHash: string;
}

export type SkipReason =
  | "completed"
  | "not-agent"
  | "missing-space"
  | "space-inaccessible"
  | "cli-missing"
  | "already-processed"
  | "running"
  | "held-after-restore";

export const SKIP_LABEL: Record<SkipReason, string> = {
  completed: "已完成",
  "not-agent": "执行方式非 Agent",
  "missing-space": "缺少 Space",
  "space-inaccessible": "Space 目录不可访问",
  "cli-missing": "CLI 未安装",
  "already-processed": "同输入已处理",
  running: "正在运行",
  "held-after-restore": "恢复后暂停",
};

export interface Claim {
  processingKey: string;
  taskId: string;
  runId: string;
  state: "queued" | "running" | "waiting_input" | "succeeded" | "failed" | "cancelled" | "unknown";
  claimedAt: string;
}

export interface ScanEnv {
  claims(processingKey: string): Claim | null;
  holds(taskId: string, inputHash: string): boolean;
  spaceAccessible(spaceId: string): "ok" | "missing" | "inaccessible";
  cliAvailable(provider: string): boolean;
}

export interface Candidate { task: SnapshotTask; processingKey: string }
export interface Skipped { task: SnapshotTask; reason: SkipReason; detail?: string }

export const processingKeyOf = (t: Pick<SnapshotTask, "id" | "inputRevision" | "inputHash">): string => `${t.id}:${t.inputRevision}:${t.inputHash}`;

/** 只读分类：候选与跳过原因。预览和真实扫描共用，保证两者一致。 */
export function classify(tasks: SnapshotTask[], env: ScanEnv): { candidates: Candidate[]; skipped: Skipped[] } {
  const candidates: Candidate[] = [];
  const skipped: Skipped[] = [];
  for (const task of tasks) {
    const skip = (reason: SkipReason, detail?: string) => skipped.push({ task, reason, ...(detail ? { detail } : {}) });
    if (task.completed) { skip("completed"); continue; }
    if (task.execution.kind !== "agent") { skip("not-agent"); continue; }
    const key = processingKeyOf(task);
    const claim = env.claims(key);
    // 排队/运行/等待回答/结果未知/已成功/已失败：都不自动再处理（失败只能由用户点"重试"）
    if (claim) { skip(claim.state === "queued" || claim.state === "running" || claim.state === "waiting_input" ? "running" : "already-processed", claim.state); continue; }
    if (env.holds(task.id, task.inputHash)) { skip("held-after-restore"); continue; }
    if (!task.execution.spaceId) { skip("missing-space"); continue; }
    const sp = env.spaceAccessible(task.execution.spaceId);
    if (sp !== "ok") { skip(sp === "missing" ? "missing-space" : "space-inaccessible"); continue; }
    if (!task.execution.provider || !env.cliAvailable(task.execution.provider)) { skip("cli-missing"); continue; }
    candidates.push({ task, processingKey: key });
  }
  return { candidates, skipped };
}
