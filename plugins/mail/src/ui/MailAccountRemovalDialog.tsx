import { Button, Dialog } from "@huhu/ui";
import { CapabilityError, useEngine } from "@huhu/workbench";
import { useEffect, useRef, useState } from "react";
import type { AccountRemovalPreview } from "../engine/account-removals.js";
import type { MailAccount } from "./mail-types.js";

export type RemovalTarget = { accountId: string; expectedRevision: string; label: string };

export function MailAccountRemovalDialog({ target, onClose, onProgress }: { target: RemovalTarget; onClose(): void; onProgress(state?: "removed" | "pending"): void }) {
  const engine = useEngine();
  const cancelTarget = useRef<HTMLSpanElement>(null);
  const [preview, setPreview] = useState<AccountRemovalPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    cancelTarget.current?.querySelector("button")?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    setPreview(null);
    setError("");
    void (async () => {
      const { accountId } = target;
      let { expectedRevision } = target;
      if (reload) {
        const { accounts } = await engine.call<{ accounts: MailAccount[] }>("mail.accounts.list", {}, { signal });
        expectedRevision = accounts.find((row) => row.accountId === accountId)?.revision ?? expectedRevision;
      }
      const snapshot = await engine.call<AccountRemovalPreview>("mail.accounts.previewRemoval", { accountId, expectedRevision }, { signal });
      if (!signal.aborted) setPreview(snapshot);
    })()
      .catch((err) => {
        if (!signal.aborted) setError(err instanceof CapabilityError ? err.message : "无法读取删除预览。");
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [engine, target, reload]);

  async function confirm() {
    if (!preview || working) return;
    setWorking(true);
    setError("");
    const { accountId, expectedRevision, impactKey } = preview;
    try {
      const { state } = await engine.call<{ state: "removed" | "pending" }>("mail.accounts.remove", { accountId, expectedRevision, impactKey }, { write: true });
      onProgress(state);
      if (state === "pending") {
        setPreview({ ...preview, pending: true });
        setError("邮箱已停止使用，部分本机资料尚未清理。可继续清理。");
      }
    } catch (err) {
      setPreview(null);
      onProgress();
      setError(err instanceof CapabilityError ? err.message : "暂时无法确认删除是否开始，请刷新预览。");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog
      open
      title="删除本地邮箱"
      description="删除仅影响此 Vault 中选定的邮箱。服务商邮箱和其他本地邮箱保留。"
      onClose={() => {
        if (!working) onClose();
      }}
      error={error}
      actions={
        <>
          <span ref={cancelTarget}>
            <Button type="button" disabled={working} onClick={onClose}>
              {preview?.pending ? "关闭" : "取消"}
            </Button>
          </span>
          {!loading && !preview && (
            <Button type="button" onClick={() => setReload((value) => value + 1)}>
              刷新预览
            </Button>
          )}
          <Button type="button" variant="danger" disabled={!preview} loading={working} onClick={() => void confirm()}>
            {preview?.pending ? "继续清理" : "删除此邮箱"}
          </Button>
        </>
      }
    >
      {loading && <p role="status">正在核对本机资料…</p>}
      <p>
        <strong>{preview?.label ?? target.label}</strong>
        {preview && preview.label !== preview.email && <> · {preview.email}</>}
      </p>
      {preview && (
        <>
          <ul aria-label="删除影响">
            <li>邮箱配置{preview.impact.credentials ? "及本机认证" : " · 无已登记的认证"}</li>
            <li>
              {preview.impact.drafts} 份草稿，{preview.impact.attachments} 个附件对象的引用，其中 {preview.impact.sharedAttachments} 个仍有其他本机引用
            </li>
            <li>{preview.impact.cache} 份本机邮件缓存</li>
            <li>
              {preview.impact.history} 条本机投递记录，其中 {preview.impact.sending} 条在途
            </li>
          </ul>
          <p>与该邮箱关联的编辑器将关闭。其他草稿仍在用的附件继续保留。</p>
          {!!preview.impact.retained && <p>最多保留 {preview.impact.retained} 条可能已经被服务端接受的投递事实，可用 Message-ID 核对。</p>}
        </>
      )}
    </Dialog>
  );
}
