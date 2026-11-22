import { Button, Dialog, EmptyState } from "@huhu/ui";
import { useCapability, useEngine, useEngineEvents, useQueryClient } from "@huhu/workbench";
import { useEffect, useState } from "react";
import type { TransferJob, TransferLocation, TransferOrigin, TransferQueue } from "../shared/transfers.js";

const labels: Record<TransferJob["state"], string> = {
  queued: "排队中",
  checking: "核对文件",
  waiting: "等待处理同名文件",
  running: "传输中",
  paused: "已暂停",
  committing: "校验完成，提交目标",
  uncertain: "提交结果待核实",
  cancelling: "正在取消",
  completed: "已完成",
  failed: "传输失败",
  cancelled: "已取消",
  skipped: "已跳过",
};
const describe = (entry: TransferOrigin) => (entry.kind === "remote" ? `${entry.session.name} · ${entry.session.user}@${entry.session.host}:${entry.session.port}` : "本机");
const leaf = (entry: TransferOrigin) => entry.path.split(/[\\/]/).at(-1);
const batchLabels = { active: "处理中", completed: "全部完成", partial: "部分完成", failed: "未完成" };

export function TransferCenter({ onOrigin }: { onOrigin: (session: TransferLocation) => void }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const queue = useCapability<TransferQueue>("ssh.transfers.list");
  const [selection, select] = useState<TransferJob>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: [engine.vaultId, "ssh.transfers.list"] });
  }, [qc, engine.vaultId]);
  useEngineEvents((event) => {
    if (event.type === "ssh.connectionChanged" || (event.type === "entity.changed" && "kind" in event.payload && event.payload.kind === "ssh-transfer")) {
      void qc.invalidateQueries({ queryKey: [engine.vaultId, "ssh.transfers.list"] });
    }
  });
  async function action(capability: string, args: object, onSuccess?: () => void) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await engine.call(capability, args, { write: true });
      await queue.refetch();
      onSuccess?.();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }
  async function returnOrigin(transferId: string) {
    setError("");
    try {
      onOrigin(await engine.call<TransferLocation>("ssh.transfers.origin", { transferId }, { write: true }));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <section aria-label="传输中心" data-testid="ssh-transfer-center">
      <div className="ssh-workspace-controls">
        <h2>传输中心</h2>
        <Button disabled={saving || !queue.data?.jobs.some(({ state }) => ["completed", "failed", "cancelled", "skipped"].includes(state))} onClick={() => void action("ssh.transfers.clearHistory", {})}>
          清理已结束记录
        </Button>
      </div>
      {queue.data && <p>{queue.data.canQueue ? `最多 ${queue.data.liveLimit} 个待办，并发 ${queue.data.parallel}` : "队列已满，等待任务结束或取消后可继续加入"}</p>}
      {!selection && (error || queue.error) && <p role="alert">{error || queue.error?.message}</p>}
      {queue.data?.jobs.length === 0 && <EmptyState title="暂无传输任务" />}
      {queue.data?.batches.map((batch) => {
        const rows = queue.data?.jobs.filter(({ batchId }) => batchId === batch.batchId) ?? [];
        return (
          <section key={batch.batchId} data-testid="ssh-transfer-batch" data-batch-id={batch.batchId} data-state={batch.state} id={`batch-${batch.batchId}`}>
            <h3>目录与文件批量传输</h3>
            <p>
              {describe(batch.source)} <code>{batch.source.path}</code> → {describe(batch.target)} <code>{batch.target.path}</code>
            </p>
            <p role="status">
              {batchLabels[batch.state]} · 已完成 {rows.filter(({ state }) => state === "completed").length} / {batch.children.length} 项
            </p>
            <ul>
              {rows.map((job) => (
                <li key={job.transferId}>
                  <Button variant="ghost" onClick={() => document.getElementById(`transfer-${job.transferId}`)?.focus()}>
                    {leaf(job.source)} · {labels[job.state]}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <ul className="ssh-transfer-list">
        {queue.data?.jobs.map((job) => {
          const external = job.source.kind === "remote" && job.source.session.source === "external";
          return (
            <li key={job.transferId} id={`transfer-${job.transferId}`} tabIndex={-1} data-testid="ssh-transfer-row" data-transfer-id={job.transferId} data-batch-id={job.batchId} data-state={job.state}>
              <strong>
                {job.directory ? "目录 · " : ""}
                {external ? "外部工具 · " : ""}
                {leaf(job.source)} → {leaf(job.target)}
              </strong>
              <p>
                {describe(job.source)} <code>{job.source.path}</code> → {describe(job.target)} <code>{job.target.path}</code>
              </p>
              <span role="status">{labels[job.state]}</span>
              {job.message && <p>{job.message}</p>}
              {job.recovery && (
                <ul>
                  <li>
                    暂存位置 <code>{job.recovery.stagingPath}</code>
                  </li>
                  {job.recovery.backupPath && (
                    <li>
                      备份位置 <code>{job.recovery.backupPath}</code>
                    </li>
                  )}
                </ul>
              )}
              {job.total !== null && (
                <div>
                  <progress aria-label={`${leaf(job.source)} 的传输进度`} max={job.total || 1} value={job.total === 0 && job.state === "completed" ? 1 : job.bytes} />
                  <p>
                    {job.bytes} / {job.total} B{job.state === "running" ? ` · ${Math.round(job.bytesPerSecond)} B/s` : ""}
                  </p>
                </div>
              )}
              <div className="ssh-workspace-controls">
                {!external && job.state === "waiting" && (
                  <Button
                    onClick={() => {
                      select(job);
                      setError("");
                    }}
                  >
                    处理冲突
                  </Button>
                )}
                {!external && (job.state === "queued" || job.state === "running") && (
                  <Button disabled={saving} onClick={() => void action("ssh.transfers.pause", { transferId: job.transferId })}>
                    暂停
                  </Button>
                )}
                {!external && job.state === "paused" && (
                  <Button disabled={saving} onClick={() => void action("ssh.transfers.resume", { transferId: job.transferId })}>
                    继续
                  </Button>
                )}
                {!external && job.state === "failed" && job.errorCode !== "VERSION_CONFLICT" && job.errorCode !== "SSH_DISCONNECTED" && (
                  <Button disabled={saving} onClick={() => void action("ssh.transfers.retry", { transferId: job.transferId })}>
                    重试原任务
                  </Button>
                )}
                {!external && job.state === "uncertain" && (
                  <Button disabled={saving} onClick={() => void action("ssh.transfers.recheck", { transferId: job.transferId })}>
                    重查提交结果
                  </Button>
                )}
                {["queued", "checking", "waiting", "running", "paused"].includes(job.state) && (
                  <Button disabled={saving} onClick={() => void action("ssh.transfers.cancel", { transferId: job.transferId })}>
                    取消传输
                  </Button>
                )}
                {!external && <Button onClick={() => void returnOrigin(job.transferId)}>返回原文件会话</Button>}
              </div>
            </li>
          );
        })}
      </ul>
      {selection && (
        <Dialog
          open
          title={selection.directory ? "已存在同名目录" : "已存在同名文件"}
          error={error}
          onClose={() => {
            if (!saving) select(undefined);
          }}
          actions={
            <>
              <Button disabled={saving} onClick={() => void action("ssh.transfers.decide", { transferId: selection.transferId, choice: "reject" }, () => select(undefined))}>
                {selection.directory ? "保留原目录" : "保留原文件"}
              </Button>
              <Button disabled={saving} onClick={() => void action("ssh.transfers.decide", { transferId: selection.transferId, choice: "skip" }, () => select(undefined))}>
                跳过
              </Button>
              {selection.directory ? (
                <Button variant="primary" disabled={saving} onClick={() => void action("ssh.transfers.decide", { transferId: selection.transferId, choice: "merge" }, () => select(undefined))}>
                  合并此目录
                </Button>
              ) : (
                <>
                  <Button disabled={saving} onClick={() => void action("ssh.transfers.decide", { transferId: selection.transferId, choice: "resume" }, () => select(undefined))}>
                    校验后续传
                  </Button>
                  <Button variant="danger" disabled={saving} onClick={() => void action("ssh.transfers.decide", { transferId: selection.transferId, choice: "replace" }, () => select(undefined))}>
                    确认覆盖
                  </Button>
                </>
              )}
            </>
          }
        >
          <p>
            {describe(selection.target)} <code>{selection.target.path}</code>
          </p>
          <p>{selection.directory ? "仅合并此目录。内部同名目录及文件仍会分别确认。" : "覆盖和续传都会重新核对目标。续传还会验证已有字节是源文件的完整前缀。"}</p>
        </Dialog>
      )}
    </section>
  );
}
