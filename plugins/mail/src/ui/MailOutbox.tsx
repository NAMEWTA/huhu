import { Banner, Button, Dialog } from "@huhu/ui";
import { CapabilityError, useCapability, useEngine } from "@huhu/workbench";
import { useEffect, useState } from "react";
import type { Delivery, DeliverySummary, Draft, MailAccount } from "./mail-types.js";

export const deliveryLabels = {
  sending: "正在投递",
  unknown: "待核实",
  "not-delivered": "明确未投递",
  accepted: "服务端已接受",
  "partially-accepted": "部分接受",
} satisfies Record<DeliverySummary["state"], string>;

const missingDraftMessage = "源草稿已丢弃，无法从这条记录创建重试。";

export function MailOutbox({
  operationId,
  accounts,
  readOnly,
  onChanged,
  onRetry,
  onDeleted,
}: {
  operationId: string;
  accounts: MailAccount[];
  readOnly: boolean;
  onChanged(message: string): void;
  onRetry(operationId: string): void;
  onDeleted(): void;
}) {
  const engine = useEngine();
  const status = useCapability<Delivery | null>("mail.outbox.status", { operationId });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recheck, setRecheck] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const row = status.data;
  const draftId = row?.retryableRecipients.length ? row.draftId : undefined;
  const draft = useCapability<{ draft: Draft | null }>("mail.drafts.get", { draftId }, { enabled: !!draftId });
  const refresh = status.refetch;

  useEffect(() => {
    if (row?.state !== "sending") return;
    const timer = window.setTimeout(() => {
      void refresh().then((result) => {
        if (result.data?.state !== "sending") onChanged("");
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [row?.state, refresh, status.dataUpdatedAt, onChanged]);

  if (status.isPending) return <p>正在读取投递记录…</p>;
  if (!row)
    return (
      <Banner tone={status.isError ? "danger" : "warning"} action={<Button onClick={() => void refresh()}>刷新</Button>}>
        {status.isError ? "无法读取投递记录。" : "这条投递记录已不存在。"}
      </Banner>
    );

  const delivery = row;
  const sender = accounts.find(({ accountId }) => accountId === draft.data?.draft?.accountId);
  const canRetry = sender?.definition.settings.smtpEnabled && sender.authState["account-password"] === "configured";
  const retryable = canRetry ? row.retryableRecipients : [];
  const recipients = "recipients" in row ? row.recipients : [];
  const destinations = retryable.filter((address) => selected.has(address));
  const sourceDraftMissing = draftId !== undefined && draft.isSuccess && draft.data.draft === null;
  const detailError = sourceDraftMissing ? missingDraftMessage : error;

  async function retry() {
    if (!destinations.length || busy || readOnly) return;
    setBusy(true);
    setError(null);
    try {
      const { draft } = await engine.call<{ draft: Draft | null }>("mail.drafts.get", { draftId: delivery.draftId });
      if (!draft) {
        setError(missingDraftMessage);
        return;
      }
      const { operationId: retryId } = await engine.call<{ operationId: string }>("mail.outbox.retry", { parentOperationId: operationId, expectedRevision: draft.revision, recipients: destinations }, { write: true });
      onRetry(retryId);
    } catch (err) {
      setError(err instanceof CapabilityError ? err.message : "暂时无法确认重试是否已受理，请刷新发件箱。");
      await refresh();
      onChanged("");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecord() {
    setConfirmDelete(false);
    setBusy(true);
    setError(null);
    try {
      await engine.call("mail.outbox.deleteLocal", { operationId }, { write: true });
      onDeleted();
    } catch (err) {
      setError(err instanceof CapabilityError ? err.message : "删除本地投递记录失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="hu-mail-detail" aria-busy={draftId ? draft.isPending || draft.isFetching : undefined}>
      <h2>{row.retained ? "保留的投递记录" : row.subject || "未填写主题"}</h2>
      <p role="status">{deliveryLabels[row.state]}</p>
      {row.retained && <p className="hu-mail-help">来源邮箱已移除。可用下方记录核对投递。</p>}
      {row.retry && (
        <p className="hu-mail-help">
          重试自 <code>{row.retry.parentMessageId}</code>
        </p>
      )}
      {row.state === "unknown" && <Banner>服务端接受情况尚未确认。可用 Message-ID 向邮件服务商核对这次投递。</Banner>}
      {"graphStatus" in row && row.graphStatus && (
        <p>
          {row.graphStatus === 403 ? "Microsoft Graph 拒绝发送（HTTP 403）" : `Microsoft Graph HTTP ${row.graphStatus}`}
          {row.graphErrorCode && ` · ${row.graphErrorCode}`}
        </p>
      )}
      {"reason" in row && row.reason === "graph-send-permission" && !("graphStatus" in row && row.graphStatus) && <Banner>该次投递时，Microsoft Graph 凭据缺少 Mail.Send 权限。</Banner>}
      <p className="hu-mail-help">
        Message-ID <code>{row.messageId}</code>
      </p>
      {recheck && <p role="status">本机记录仍待核实。请核对服务商日志或向服务商提供上方的 Message-ID。</p>}
      {!!recipients.length && (
        <ul aria-label="收件人投递结果">
          {recipients.map(({ address, state, smtpCode }) => (
            <li key={address}>
              <span>{address}</span> · {deliveryLabels[state]}
              {smtpCode && ` · SMTP ${smtpCode}`}
            </li>
          ))}
        </ul>
      )}
      {!!retryable.length && (
        <fieldset className="hu-mail-group" disabled={busy || readOnly}>
          <legend>选择明确未投递的收件人</legend>
          {retryable.map((address) => (
            <label className="hu-mail-check" key={address}>
              <input
                type="checkbox"
                checked={selected.has(address)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSelected((current) => {
                    const next = new Set(current);
                    if (checked) next.add(address);
                    else next.delete(address);
                    return next;
                  });
                }}
              />
              {address}
            </label>
          ))}
          <Button variant="primary" disabled={!destinations.length} onClick={() => void retry()}>
            重试所选收件人
          </Button>
        </fieldset>
      )}
      {detailError && <Banner tone="danger">{detailError}</Banner>}
      <div className="hu-mail-row">
        {row.state === "unknown" && (
          <Button
            loading={status.isFetching}
            onClick={() =>
              void refresh().then((result) => {
                setRecheck(result.data?.state === "unknown" && !result.isError);
                setError(result.isError ? "无法刷新本机投递记录，请重试。" : null);
                onChanged("");
              })
            }
          >
            核对投递记录
          </Button>
        )}
        {row.state !== "unknown" && (
          <Button loading={status.isFetching} onClick={() => void refresh().then(() => onChanged(""))}>
            刷新投递状态
          </Button>
        )}
        <Button variant="danger" disabled={readOnly || busy || row.state === "sending"} onClick={() => setConfirmDelete(true)}>
          删除本地记录
        </Button>
      </div>
      {confirmDelete && (
        <Dialog
          open
          title="删除本地记录？"
          onClose={() => setConfirmDelete(false)}
          actions={
            <>
              <Button onClick={() => setConfirmDelete(false)}>取消</Button>
              <Button variant="danger" onClick={() => void deleteRecord()}>
                删除本地记录
              </Button>
            </>
          }
        >
          此操作只删除 Vault 中的投递详情。服务商已接受的邮件仍保留在服务端。
        </Dialog>
      )}
    </article>
  );
}
