import { Button, Field } from "@huhu/ui";
import { Copy, Folder } from "lucide-react";
import { useState } from "react";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { t } from "../i18n/zh-CN.js";
import { host } from "./host.js";

interface Info {
  id: string;
  name: string;
  readOnly: boolean;
  counts: Record<string, number>;
  indexing: boolean;
}
interface Summary {
  tasksOpen: number;
  inboxPending: number;
  notes: number;
}

/** 设置 → 当前 Vault：名称与描述可改（不移动目录）；根目录只读，可在文件管理器中显示；标识可复制；概况。 */
export function VaultPage() {
  const engine = useEngine();
  const qc = useQueryClient();
  const info = useCapability<Info>("vault.info", {});
  const loc = useCapability<{ root: string; readOnly: boolean; description: string }>("vault.location", {});
  const summary = useCapability<Summary>("home.summary", {});
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (info.isError)
    return (
      <div role="alert" className="hu-overdue">
        {info.error instanceof Error ? info.error.message : String(info.error)}
      </div>
    );
  if (!info.data || !loc.data) return <p>{t.loading}</p>;
  return (
    <VaultForm
      key={`${info.data.name}\n${loc.data.description}`}
      info={info.data}
      description={loc.data.description}
      root={loc.data.root}
      summary={summary.data ?? null}
      error={error}
      note={note}
      onSave={async (name, description) => {
        setError(null);
        setNote(null);
        try {
          await engine.call("vault.update", { name, description }, { write: true });
          await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
          setNote(t.settings.vault.saved);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }}
      onCopied={(ok) => {
        setError(null);
        setNote(ok ? t.settings.vault.copied : null);
        if (!ok) setError(t.settings.vault.copyFailed);
      }}
    />
  );
}

function VaultForm({
  info,
  description,
  root,
  summary,
  error,
  note,
  onSave,
  onCopied,
}: {
  info: Info;
  description: string;
  root: string;
  summary: Summary | null;
  error: string | null;
  note: string | null;
  onSave(n: string, d: string): Promise<void>;
  onCopied(ok: boolean): void;
}) {
  const [name, setName] = useState(info.name);
  const [desc, setDesc] = useState(description);
  const dirty = name !== info.name || desc !== description;
  const valid = name.trim().length > 0 && name.trim().length <= 80 && desc.trim().length <= 500;
  const c = t.settings.vault;
  return (
    <div data-testid="settings-vault">
      {info.readOnly ? (
        <div role="status" className="callout">
          <p>{c.readOnly}</p>
        </div>
      ) : null}
      <section className="settings-section card">
        <h2>知识库信息</h2>
        <form
          className="form-body"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty && valid) void onSave(name.trim(), desc.trim());
          }}
        >
          <Field label={c.name}>
            <input data-testid="svault-name" aria-label={c.name} value={name} maxLength={80} disabled={info.readOnly} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={c.description}>
            <textarea data-testid="svault-description" aria-label={c.description} rows={2} maxLength={500} value={desc} disabled={info.readOnly} onChange={(e) => setDesc(e.target.value)} />
          </Field>
          <div className="row">
            <Button type="submit" variant="primary" disabled={!dirty || !valid || info.readOnly} data-testid="svault-save">
              {c.save}
            </Button>
          </div>
        </form>
        {note ? (
          <div role="status" data-testid="svault-note" className="hint-text">
            {note}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="field-error">
            {error}
          </div>
        ) : null}
        <Field label={c.root} description="引擎直接读写此 Vault 目录；名称与描述的修改不会移动目录。">
          <div className="row">
            <input readOnly aria-label={c.root} data-testid="svault-root" value={root || "…"} />
            {host()?.revealVault ? (
              <Button icon={Folder} onClick={() => void host()?.revealVault()} data-testid="svault-reveal">
                {c.reveal}
              </Button>
            ) : null}
          </div>
        </Field>
        <div className="setting-row">
          <div>
            <strong>{c.id}</strong>
            <p className="mono" data-testid="svault-id">
              {info.id}
            </p>
          </div>
          <Button
            icon={Copy}
            onClick={() => {
              navigator.clipboard.writeText(info.id).then(
                () => onCopied(true),
                () => onCopied(false),
              );
            }}
            data-testid="svault-copy"
          >
            {c.copy}
          </Button>
        </div>
      </section>
      <section className="settings-section card">
        <h2>{c.overview}</h2>
        <div className="metric-grid" data-testid="svault-counts">
          <div>
            <strong>{info.counts["files"] ?? 0}</strong>
            <span>文件</span>
          </div>
          <div>
            <strong>{info.counts["notes"] ?? 0}</strong>
            <span>Markdown 笔记</span>
          </div>
          <div>
            <strong>{summary?.tasksOpen ?? 0}</strong>
            <span>未完成任务</span>
          </div>
          <div>
            <strong>{summary?.inboxPending ?? 0}</strong>
            <span>待整理收件</span>
          </div>
        </div>
        {info.indexing ? <p className="hint-text">{c.indexing}</p> : null}
      </section>
    </div>
  );
}
