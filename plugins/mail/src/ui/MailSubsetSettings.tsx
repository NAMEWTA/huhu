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
  const [resumeOriginalBatch, setResumeOriginalBatch] = useState(false);
  const [originalSeparate, setOriginalSeparate] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const canResume = preview?.accounts.some((row) => row.state === "restored") && preview.accounts.some((row) => row.state === "ready" || row.canKeepSeparate);
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
    setResumeOriginalBatch(false);
    setOriginalSeparate([]);
    setError("");
  }

  async function submit() {
    if (active.current) return;
    if ((dialog === "export" || preview) && !selected.length) return setError("请勾选至少一个邮箱。");
    if (preview && resumeOriginalBatch) {
      const chosen = preview.accounts.filter(({ accountId }) => selected.includes(accountId));
      if (!chosen.some((row) => row.state === "restored") || !chosen.some((row) => row.state !== "restored")) return setError("请选择原批次中已恢复与待恢复的邮箱。");
    }
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
        const keepSeparateAccountIds = resumeOriginalBatch ? originalSeparate : preview.accounts.filter((row) => row.canKeepSeparate && selected.includes(row.accountId)).map(({ accountId }) => accountId);
        const result = await engine.call<{ accounts: MailSubsetPreview["accounts"] }>(
          "mail.subset.restore",
          { previewId: preview.previewId, accountIds: selected, confirm: true, ...(keepSeparateAccountIds.length && { keepSeparateAccountIds }), ...(resumeOriginalBatch && { resumeOriginalBatch }) },
          { write: true, signal },
        );
        if (signal.aborted) return;
        const unmapped = result.accounts.reduce((total, row) => total + (row.unmappedReadOverrides ?? 0), 0);
        const message = resumeOriginalBatch ? `原批次的 ${result.accounts.length} 个邮箱已恢复。新恢复的邮箱需配置本机认证后同步。` : `已恢复 ${result.accounts.length} 个邮箱。请配置本机认证后同步。`;
        setNotice(`${message}${unmapped ? `有 ${unmapped} 条本地已读标记缺少定位，未恢复。` : ""}`);
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
    if (!checked && resumeOriginalBatch) setOriginalSeparate((current) => current.filter((id) => id !== accountId));
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
                {dialog === "export" ? "下载备份" : resumeOriginalBatch ? "续跑原批次" : preview ? "恢复选中邮箱" : "运行预检"}
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
                  <legend>{resumeOriginalBatch ? "重选原批次的邮箱" : "选择要恢复的邮箱"}</legend>
                  {canResume && (
                    <div>
                      <input
                        type="checkbox"
                        id={`${id}-resume`}
                        name="resumeOriginalBatch"
                        checked={resumeOriginalBatch}
                        aria-describedby={`${id}-resume-help`}
                        onChange={(event) => {
                          setResumeOriginalBatch(event.currentTarget.checked);
                          setSelected([]);
                          setOriginalSeparate([]);
                          setError("");
                        }}
                      />
                      <label htmlFor={`${id}-resume`}>按原批次续跑</label>
                      <p id={`${id}-resume-help`}>如果恢复曾中断，请使用同一 ZIP，勾选原批次的全部邮箱（含已恢复项），并重选原来保留为独立账号的邮箱。核对通过后只恢复尚未完成的邮箱。</p>
                    </div>
                  )}
                  {preview.accounts.map((row) => (
                    <div key={row.accountId}>
                      <input
                        type="checkbox"
                        name="account"
                        id={`${id}-${row.accountId}`}
                        disabled={row.state === "restored" ? !resumeOriginalBatch : row.state !== "ready" && !row.canKeepSeparate}
                        aria-describedby={row.state !== "ready" ? `${id}-state-${row.accountId}` : undefined}
                        checked={selected.includes(row.accountId)}
                        onChange={(event) => toggle(row.accountId, event.currentTarget.checked)}
                      />
                      <label htmlFor={`${id}-${row.accountId}`}>
                        {row.canKeepSeparate && !resumeOriginalBatch && "保留为独立账号 · "}
                        {row.label ? `${row.label} · ` : ""}
                        {row.email} · {row.drafts} 份草稿 · {row.deliveries} 条投递
                      </label>
                      {row.state === "conflict" && (
                        <p id={`${id}-state-${row.accountId}`}>
                          {row.existing ? `当前邮箱 ${row.existing.label || row.existing.email}（${row.existing.email}）。` : ""}
                          {row.canKeepSeparate ? (resumeOriginalBatch ? "地址相同。续跑时请沿用原批次的独立账号选项。" : "地址相同。默认跳过。勾选后保留当前邮箱的认证和设置，并创建独立账号。") : "邮箱、邮件记录或附件存在冲突，无法恢复。"}
                          {row.unmappedReadOverrides && (!resumeOriginalBatch || originalSeparate.includes(row.accountId)) ? `有 ${row.unmappedReadOverrides} 条本地已读标记缺少定位，无法恢复。` : null}
                        </p>
                      )}
                      {row.state === "restored" && <p id={`${id}-state-${row.accountId}`}>已恢复</p>}
                      {resumeOriginalBatch && (row.state === "restored" || row.canKeepSeparate) && selected.includes(row.accountId) && (
                        <div>
                          <input
                            type="checkbox"
                            name="keepSeparateAccountIds"
                            id={`${id}-separate-${row.accountId}`}
                            checked={originalSeparate.includes(row.accountId)}
                            onChange={(event) => {
                              const { checked } = event.currentTarget;
                              setOriginalSeparate((current) => (checked ? [...current, row.accountId] : current.filter((id) => id !== row.accountId)));
                              setError("");
                            }}
                          />
                          <label htmlFor={`${id}-separate-${row.accountId}`}>沿用独立账号选项 · {row.label || row.email}</label>
                        </div>
                      )}
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
