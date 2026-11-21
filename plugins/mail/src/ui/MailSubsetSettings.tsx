import { Button, Dialog } from "@huhu/ui";
import { CapabilityError, useEngine } from "@huhu/workbench";
import { useEffect, useId, useRef, useState } from "react";
import type { MailSubsetPreview } from "../engine/subset-data.js";
import { maxMailArchiveBytes } from "../mail-subset-limit.js";

function fileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function download(content: string) {
  const bytes = Uint8Array.from(atob(content), (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "huhu-mail-subset.zip";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function MailSubsetSettings({ readOnly, canRestore, accounts }: { readOnly: boolean; canRestore: boolean; accounts: ReadonlyMap<string, string> }) {
  const engine = useEngine();
  const id = useId();
  const [dialog, setDialog] = useState<"export" | "restore">();
  const [selected, setSelected] = useState<string[]>([]);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<MailSubsetPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => active.current?.abort(), [engine]);
  useEffect(() => {
    if (preview) previewHeading.current?.focus();
  }, [preview]);

  function close() {
    if (active.current) return;
    if (preview) void engine.call("mail.subset.cancel", { previewId: preview.previewId }, { write: true }).catch(() => undefined);
    setDialog(undefined);
    setFile(undefined);
    setPreview(undefined);
    setSelected([]);
    setError("");
  }

  async function submit() {
    if (active.current) return;
    if ((dialog === "export" || preview) && !selected.length) return setError("请勾选至少一个邮箱。");
    if (dialog === "restore" && !preview && (!file || file.size > maxMailArchiveBytes)) return setError("请选择不超过 5 MiB 的 Huhu Mail 子集 ZIP。");
    if (dialog === "restore" && preview && readOnly) return;
    const controller = new AbortController();
    const { signal } = controller;
    active.current = controller;
    setBusy(true);
    setError("");
    let finished = false;
    try {
      if (dialog === "export") {
        const { content } = await engine.call<{ content: string }>("mail.subset.create", { accountIds: selected }, { signal });
        if (signal.aborted) return;
        download(content);
        setNotice("已生成 Mail 子集备份。");
        finished = true;
      } else if (!preview && file) {
        const content = await fileContent(file);
        if (signal.aborted) return;
        const result = await engine.call<MailSubsetPreview>("mail.subset.preview", { content }, { signal, write: true });
        if (!signal.aborted) setPreview(result);
      } else if (preview) {
        const result = await engine.call<{ accounts: MailSubsetPreview["accounts"] }>("mail.subset.restore", { previewId: preview.previewId, accountIds: selected, confirm: true }, { write: true, signal });
        if (signal.aborted) return;
        setNotice(`已恢复 ${result.accounts.length} 个邮箱。请配置本机认证后同步。`);
        finished = true;
      }
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof CapabilityError ? cause.message : "无法完成邮件数据操作。请检查预检和当前账号后重试。");
    } finally {
      active.current = null;
      if (!signal.aborted) {
        setBusy(false);
        if (finished) close();
      }
    }
  }

  function toggle(accountId: string, checked: boolean) {
    setSelected((current) => (checked ? [...current, accountId] : current.filter((id) => id !== accountId)));
    setError("");
  }

  return (
    <details>
      <summary>邮件备份和恢复</summary>
      <div className="hu-mail-row">
        <Button type="button" disabled={!accounts.size} onClick={() => setDialog("export")}>
          创建 Mail 备份
        </Button>
        <Button type="button" disabled={!canRestore} onClick={() => setDialog("restore")}>
          预检并恢复
        </Button>
      </div>
      <p role="status">{notice}</p>
      {dialog && (
        <Dialog
          open
          title={dialog === "export" ? "创建 Mail 备份" : "预检邮件备份"}
          description="Mail 子集包括所选邮箱的配置、草稿、受管附件和投递记录。"
          onClose={close}
          error={error}
          actions={
            <>
              <Button type="button" disabled={busy} onClick={close}>
                取消
              </Button>
              <Button type="submit" form={id} loading={busy} disabled={dialog === "restore" && !!preview && readOnly}>
                {dialog === "export" ? "下载备份" : preview ? "恢复选中邮箱" : "运行预检"}
              </Button>
            </>
          }
        >
          <form
            id={id}
            method="post"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {dialog === "export" && (
              <fieldset disabled={busy}>
                <legend>选择要备份的邮箱</legend>
                {[...accounts].map(([accountId, name]) => (
                  <div key={accountId}>
                    <input type="checkbox" name="account" id={`${id}-${accountId}`} checked={selected.includes(accountId)} onChange={(event) => toggle(accountId, event.currentTarget.checked)} />
                    <label htmlFor={`${id}-${accountId}`}>{name}</label>
                  </div>
                ))}
              </fieldset>
            )}
            {dialog === "restore" && !preview && (
              <>
                <label htmlFor={`${id}-file`}>Huhu Mail 子集 ZIP（必填）</label>
                <input
                  id={`${id}-file`}
                  name="archive"
                  type="file"
                  accept=".zip,application/zip"
                  required
                  disabled={busy}
                  aria-describedby={`${id}-size`}
                  onChange={(event) => {
                    setFile(event.currentTarget.files?.[0]);
                    setError("");
                  }}
                />
                <p id={`${id}-size`}>文件上限 5 MiB。</p>
              </>
            )}
            {preview && (
              <>
                <h3 tabIndex={-1} ref={previewHeading}>
                  预检结果
                </h3>
                <fieldset disabled={busy || readOnly}>
                  <legend>选择要恢复的无冲突邮箱</legend>
                  {preview.accounts.map((row) => (
                    <div key={row.accountId}>
                      <input
                        type="checkbox"
                        name="account"
                        id={`${id}-${row.accountId}`}
                        disabled={row.state !== "ready"}
                        checked={selected.includes(row.accountId)}
                        onChange={(event) => toggle(row.accountId, event.currentTarget.checked)}
                      />
                      <label htmlFor={`${id}-${row.accountId}`}>
                        {row.label ? `${row.label} · ` : ""}
                        {row.email} · {row.drafts} 份草稿 · {row.deliveries} 条投递
                      </label>
                      {row.state === "conflict" && <p>{row.existing ? `与当前邮箱 ${row.existing.label || row.existing.email}（${row.existing.email}）冲突` : "邮箱或邮件记录标识冲突"}</p>}
                      {row.state === "restored" && <p>已恢复</p>}
                      {row.missingAttachments !== 0 && <p>{row.missingAttachments} 个附件缺少字节，恢复后需重新选择文件。</p>}
                    </div>
                  ))}
                </fieldset>
                <p>恢复后的邮箱需要配置本机认证。</p>
              </>
            )}
          </form>
        </Dialog>
      )}
    </details>
  );
}
