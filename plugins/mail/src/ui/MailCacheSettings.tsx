import { Button, Dialog } from "@huhu/ui";
import { CapabilityError, useCapability, useEngine, useEngineEvents } from "@huhu/workbench";
import { useLayoutEffect, useRef, useState } from "react";
import type { MailCacheUsage } from "../engine/message-cache.js";

const number = new Intl.NumberFormat();

export function MailCacheSettings({ readOnly }: { readOnly: boolean }) {
  const engine = useEngine();
  const usage = useCapability<MailCacheUsage>("mail.cache.usage");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const cancel = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (confirming) cancel.current?.focus();
  }, [confirming]);
  useEngineEvents((event) => {
    if (event.type !== "entity.changed" || !("kind" in event.payload)) return;
    if (event.payload.kind === "mail-cache" || event.payload.kind === "mail-message" || event.payload.kind === "mail-mailbox") void usage.refetch();
  });
  async function clear() {
    if (busy || readOnly) return;
    setBusy(true);
    setError("");
    try {
      const removed = await engine.call<MailCacheUsage>("mail.cache.clear", { confirm: true }, { write: true });
      await usage.refetch();
      setConfirming(false);
      setFeedback(`已清理 ${number.format(removed.files)} 份邮件缓存和搜索索引。同步目录可重建缓存。`);
    } catch (reason) {
      setError(reason instanceof CapabilityError ? reason.message : "无法确认清理结果，请检查当前占用。");
      void usage.refetch();
    } finally {
      setBusy(false);
    }
  }
  const used = usage.data;
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) void usage.refetch();
      }}
    >
      <summary>邮件缓存</summary>
      {used && (
        <p>
          邮件副本和同步游标 · {number.format(used.files)} 份 · {number.format(used.bytes)} 字节
        </p>
      )}
      {used && (
        <p>
          内存搜索索引 · {number.format(used.indexEntries)} 项 · {number.format(used.indexBytes)} 字节文本
        </p>
      )}
      <Button
        disabled={readOnly || !used || (!used.files && !used.indexEntries)}
        onClick={() => {
          setError("");
          setFeedback("");
          setConfirming(true);
        }}
      >
        清理邮件缓存
      </Button>
      <p role="status">{usage.isError ? "无法读取缓存占用。" : feedback}</p>
      <Dialog
        open={confirming}
        title="清理邮件缓存"
        description="清理当前 Vault 的邮件副本、同步游标和搜索索引。"
        onClose={() => {
          if (!busy) setConfirming(false);
        }}
        error={error}
        actions={
          <>
            <button type="button" className="hu-btn" ref={cancel} disabled={busy} onClick={() => setConfirming(false)}>
              取消
            </button>
            <Button type="button" variant="danger" disabled={readOnly} loading={busy} onClick={() => void clear()}>
              确认清理
            </Button>
          </>
        }
      >
        <p>草稿、受管附件、已读覆盖、发件记录和本机认证将保留。同步目录可重新下载邮件。</p>
      </Dialog>
    </details>
  );
}
