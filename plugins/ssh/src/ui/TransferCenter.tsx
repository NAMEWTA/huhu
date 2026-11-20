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
  cancelling: "正在取消",
  completed: "已完成",
  failed: "传输失败",
  cancelled: "已取消",
  skipped: "已跳过",
};
const describe = (entry: TransferOrigin) => (entry.kind === "remote" ? `${entry.session.name} · ${entry.session.user}@${entry.session.host}:${entry.session.port}` : "本机");
const leaf = (entry: TransferOrigin) => entry.path.split(/[\\/]/).at(-1);

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
      <ul className="ssh-transfer-list">
        {queue.data?.jobs.map((job) => (
          <li key={job.transferId} data-testid="ssh-transfer-row" data-transfer-id={job.transferId} data-state={job.state}>
            <strong>
              {leaf(job.source)} → {leaf(job.target)}
            </strong>
            <p>
              {describe(job.source)} <code>{job.source.path}</code> → {describe(job.target)} <code>{job.target.path}</code>
            </p>
            <span role="status">{labels[job.state]}</span>
            {job.message && <p>{job.message}</p>}
            {job.total !== null && (
              <div>
                <progress aria-label={`${leaf(job.source)} 的传输进度`} max={job.total || 1} value={job.total === 0 && job.state === "completed" ? 1 : job.bytes} />
                <p>
                  {job.bytes} / {job.total} B{job.state === "running" ? ` · ${Math.round(job.bytesPerSecond)} B/s` : ""}
                </p>
              </div>
            )}
            <div className="ssh-workspace-controls">
              {job.state === "waiting" && (
                <Button
                  onClick={() => {
                    select(job);
                    setError("");
                  }}
                >
                  处理冲突
                </Button>
              )}
              {(job.state === "queued" || job.state === "running") && (
                <Button disabled={saving} onClick={() => void action("ssh.transfers.pause", { transferId: job.transferId })}>
                  暂停
                </Button>
              )}
              {job.state === "paused" && (
                <Button disabled={saving} onClick={() => void action("ssh.transfers.resume", { transferId: job.transferId })}>
                  继续
                </Button>
              )}
              {job.state === "failed" && job.errorCode !== "VERSION_CONFLICT" && job.errorCode !== "SSH_DISCONNECTED" && (
                <Button disabled={saving} onClick={() => void action("ssh.transfers.retry", { transferId: job.transferId })}>
                  重试原任务
                </Button>
              )}
              {["queued", "checking", "waiting", "running", "paused"].includes(job.state) && (
                <Button disabled={saving} onClick={() => void action("ssh.transfers.cancel", { transferId: job.transferId })}>
                  取消传输
                </Button>
              )}
              <Button onClick={() => void returnOrigin(job.transferId)}>返回原文件会话</Button>
            </div>
          </li>
        ))}
      </ul>
      {selection && (
        <Dialog
          open
          title="已存在同名文件"
          error={error}
          onClose={() => {
            if (!saving) select(undefined);
          }}
          actions={
            <>
              <Button disabled={saving} onClick={() => void action("ssh.transfers.decide", { transferId: selection.transferId, choice: "reject" }, () => select(undefined))}>
                保留原文件
              </Button>
              <Button disabled={saving} onClick={() => void action("ssh.transfers.decide", { transferId: selection.transferId, choice: "skip" }, () => select(undefined))}>
                跳过
              </Button>
              <Button disabled={saving} onClick={() => void action("ssh.transfers.decide", { transferId: selection.transferId, choice: "resume" }, () => select(undefined))}>
                校验后续传
              </Button>
              <Button variant="danger" disabled={saving} onClick={() => void action("ssh.transfers.decide", { transferId: selection.transferId, choice: "replace" }, () => select(undefined))}>
                确认覆盖
              </Button>
            </>
          }
        >
          <p>
            {describe(selection.target)} <code>{selection.target.path}</code>
          </p>
          <p>覆盖和续传都会重新核对目标。续传还会验证已有字节是源文件的完整前缀。</p>
        </Dialog>
      )}
    </section>
  );
}
