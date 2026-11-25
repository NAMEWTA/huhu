import { Button, Dialog, Select } from "@huhu/ui";
import { createRequestId, useCapability } from "@huhu/workbench";
import { useId, useRef, useState, type FormEvent } from "react";
import { backupModuleLabels, backupModules, maxLedgerArchiveBytes, missingBackupModules,
  type BackupDecision, type BackupModule, type BackupPreview, type ExportedBackup } from "../shared/backups.js";
import type { Book } from "../shared/books.js";
import type { AccountsView } from "../shared/entries.js";
import { ImportWizard } from "./ImportWizard.js";
import { downloadFile, fileBase64, LedgerField, useLedgerAction } from "./primitives.js";

type DialogKind = "export" | "restore" | "import";
const choices: Record<BackupDecision, string> = {
  "skip-row": "跳过该条", "drop-link": "保留可迁入的数据，略去该引用",
  "retain-offset": "保留旧报表排除标记", "clear-offset": "取消旧报表排除标记",
};

export function LedgerBackupsSection({ book, readOnly, restored }: { book?: Book | undefined; readOnly: boolean; restored(book: Book): void }) {
  const [dialog, setDialog] = useState<DialogKind>();
  const readyToImport = Boolean(book && !readOnly && book.status === "active");
  const accounts = useCapability<AccountsView>("ledger.accounts.list", { bookId: book?.id }, { enabled: readyToImport });
  const close = () => setDialog(undefined);
  return <section className="hu-stack" aria-label="导入与恢复">
    <h2>导入与恢复</h2>
    <div className="hu-toolbar">
      {readyToImport && <Button disabled={!accounts.data} onClick={() => setDialog("import")}>打开导入向导</Button>}
      <Button disabled={!book} onClick={() => setDialog("export")}>准备当前快照</Button>
      <Button disabled={readOnly} onClick={() => setDialog("restore")}>预览恢复</Button>
    </div>
    {dialog === "import" && accounts.data && <ImportWizard view={accounts.data} onClose={close} />}
    {dialog === "export" && book && <ExportDialog book={book} close={close} />}
    {dialog === "restore" && <RestoreDialog timeZone={book?.timeZone} close={close} restored={(book) => {
      close();
      restored(book);
    }} />}
  </section>;
}

function ModuleFields({ available, selected, onChange, disabled }: {
  available: readonly BackupModule[]; selected: BackupModule[]; onChange(next: BackupModule[]): void; disabled?: boolean;
}) {
  return <fieldset className="hu-stack" disabled={disabled}>
    <legend>选择模块</legend>
    {available.map((module) => <label key={module}>
      <input type="checkbox" checked={selected.includes(module)} onChange={(event) => onChange(event.currentTarget.checked
        ? [...selected, module] : selected.filter((value) => value !== module))} />
      {" "}{backupModuleLabels[module]}
    </label>)}
  </fieldset>;
}

function Dependencies({ modules }: { modules: readonly BackupModule[] }) {
  const missing = missingBackupModules(modules);
  return missing.length ? <p role="status">请补选 {missing.map((module) => backupModuleLabels[module]).join("、")}。</p> : null;
}

function ExportDialog({ book, close }: { book: Book; close(): void }) {
  const action = useLedgerAction();
  const [modules, setModules] = useState<BackupModule[]>([...backupModules]);
  async function save() {
    const archive = await action.run<ExportedBackup>("ledger.backups.export", { bookId: book.id, modules }, false);
    if (!archive) return;
    const bytes = Uint8Array.from(atob(archive.base64), (value) => value.charCodeAt(0));
    downloadFile(archive.fileName, new Blob([bytes], { type: "application/zip" }));
    close();
  }
  return <Dialog open title="导出账本包" error={action.error} onClose={() => { if (!action.working) close(); }}
    actions={<>
      <Button disabled={action.working} onClick={close}>取消</Button>
      <Button variant="primary" loading={action.working} disabled={modules.length === 0 || Boolean(missingBackupModules(modules).length)}
        onClick={() => void save()}>下载账本包</Button>
    </>}>
    <ModuleFields available={backupModules} selected={modules} onChange={setModules} disabled={action.working} />
    <Dependencies modules={modules} />
  </Dialog>;
}

function RestoreDialog({ timeZone, close, restored }: { timeZone: string | undefined; close(): void; restored(book: Book): void }) {
  const action = useLedgerAction();
  const settings = useCapability<{ dateTime: { zone: string } }>("settings.get");
  const [file, setFile] = useState<File>();
  const [zone, setZone] = useState<string>();
  const [revising, setRevising] = useState(false);
  const [preview, setPreview] = useState<BackupPreview>();
  const [modules, setModules] = useState<BackupModule[]>([]);
  const [decisions, setDecisions] = useState<Record<string, BackupDecision>>({});
  const [name, setName] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const formId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const lastIntent = useRef<{ body: string; id: string }>(null);
  const inspectPending = useRef(false);
  const zoneValue = zone ?? timeZone ?? settings.data?.dateTime.zone ?? "";
  const issues = preview?.issues.filter(({ module }) => modules.includes(module)) ?? [];
  const canConfirm = name.trim() && modules.length > 0 && missingBackupModules(modules).length === 0 &&
    issues.every(({ id }) => Boolean(decisions[id]));
  const confirmStage = preview !== undefined && !revising;
  const busy = inspecting || action.working;

  async function inspect(sourceBookId?: string) {
    if (!file || inspectPending.current) return;
    if (file.size > maxLedgerArchiveBytes) {
      action.setError("账本包最大为 5 MiB。");
      return;
    }
    inspectPending.current = true;
    setInspecting(true);
    try {
      const base64 = await fileBase64(file);
      const next = await action.run<BackupPreview>("ledger.backups.preview", {
        base64, ...(sourceBookId && { sourceBookId }), ...(zoneValue && { timeZone: zoneValue }),
      }, false);
      if (!next) return;
      if (preview) await action.run("ledger.backups.cancel", { previewId: preview.previewId }, false);
      setPreview(next);
      setRevising(false);
      setModules(next.modules);
      setName(next.suggestedName);
      setDecisions({});
      requestAnimationFrame(() => heading.current?.focus());
    } catch (failure) {
      action.setError(failure instanceof Error ? failure.message : "文件读取失败。");
    } finally {
      inspectPending.current = false;
      setInspecting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!confirmStage || !preview) {
      await inspect();
      return;
    }
    if (!canConfirm) return;
    const input = { previewId: preview.previewId, name, modules, decisions: Object.fromEntries(issues.map(({ id }) => [id, decisions[id]])) };
    const body = JSON.stringify(input);
    if (lastIntent.current?.body !== body) lastIntent.current = { body, id: createRequestId() };
    const book = await action.run<Book>("ledger.backups.confirm", input, true, lastIntent.current.id);
    if (book) restored(book);
  }

  async function cancel() {
    if (busy) return;
    if (preview) await action.run("ledger.backups.cancel", { previewId: preview.previewId }, false);
    close();
  }

  async function checkStatus() {
    if (!preview) return;
    const book = await action.run<Book | null>("ledger.backups.status", { previewId: preview.previewId }, false);
    if (book) restored(book);
    else if (book === null) action.setError("该预览尚无已提交的账本。");
  }

  return <Dialog open wide title="恢复账本包" error={action.error} onClose={() => void cancel()}
    actions={<>
      <Button disabled={busy} onClick={() => void cancel()}>取消</Button>
      {confirmStage && action.error && <Button disabled={busy} onClick={() => void checkStatus()}>核对原恢复</Button>}
      <Button type="submit" form={formId} variant="primary" loading={busy}
        disabled={confirmStage ? !canConfirm : !file}>{confirmStage ? "确认恢复" : "检查备份"}</Button>
    </>}>
    <form id={formId} className="hu-stack" onSubmit={(event) => void submit(event)}>
      {!confirmStage ? <>
        <LedgerField label="本地账本包"><input type="file" accept=".zip,application/zip" required disabled={busy}
          onChange={(event) => setFile(event.currentTarget.files?.[0])} /></LedgerField>
        <LedgerField label="HomiBook 来源业务时区"><input value={zoneValue} onChange={(event) => setZone(event.currentTarget.value)}
          placeholder="例如 Asia/Taipei" disabled={busy} /></LedgerField>
      </> : <>
        <h3 ref={heading} tabIndex={-1}>核对恢复范围</h3>
        <div className="hu-toolbar">
          <p>{file?.name} · {preview.source === "huhu" ? "Huhu 账本包" : "HomiBook v1"}</p>
          <Button disabled={busy} onClick={() => { setFile(undefined); setRevising(true); }}>更换文件</Button>
        </div>
        {preview.sourceBooks.length > 1 && <LedgerField label="原账本">
          <Select value={preview.sourceBookId} disabled={busy} onChange={(event) => void inspect(event.currentTarget.value)}>
            {preview.sourceBooks.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </Select>
        </LedgerField>}
        <LedgerField label="恢复到新账本"><input value={name} onChange={(event) => setName(event.currentTarget.value)} required maxLength={100}
          disabled={busy} /></LedgerField>
        <ModuleFields available={preview.modules} selected={modules} onChange={setModules} disabled={busy} />
        <Dependencies modules={modules} />
        <p>来源包含 {preview.counts.accounts} 个账户、{preview.counts.records} 条可恢复流水和 {preview.counts.attachments} 份凭证 · {preview.currency} · {preview.timeZone}</p>
        {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        {issues.length > 0 && <fieldset className="hu-stack" disabled={busy}>
          <legend>逐项处理</legend>
          {issues.map(({ id, row, message, choices: available }) => <LedgerField key={id} label={row + " · " + message}>
            <Select value={decisions[id] ?? ""} onChange={(event) => setDecisions({ ...decisions, [id]: event.currentTarget.value as BackupDecision })} required>
              <option value="" disabled>选择处理方式</option>
              {available.map((choice) => <option key={choice} value={choice}>{choices[choice]}</option>)}
            </Select>
          </LedgerField>)}
        </fieldset>}
      </>}
    </form>
  </Dialog>;
}
