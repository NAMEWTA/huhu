import { Button } from "@huhu/ui";
import { useState } from "react";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { t } from "../i18n/zh-CN.js";
import { host } from "./host.js";

interface Info { id: string; name: string; readOnly: boolean; counts: Record<string, number>; indexing: boolean }
interface Summary { tasksOpen: number; inboxPending: number; notes: number }

/** 设置 → 当前 Vault：名称与描述可改（不移动目录）；根目录只读，可在文件管理器中显示；标识可复制；概况。 */
export function VaultPage() {
  const engine = useEngine();
  const qc = useQueryClient();
  const info = useCapability<Info>("vault.info", {});
  const loc = useCapability<{ root: string; readOnly: boolean; description: string }>("vault.location", {});
  const summary = useCapability<Summary>("home.summary", {});
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (info.isError) return <div role="alert" className="hu-overdue">{info.error instanceof Error ? info.error.message : String(info.error)}</div>;
  if (!info.data || !loc.data) return <p>{t.loading}</p>;
  return <VaultForm key={`${info.data.name}\n${loc.data.description}`} info={info.data} description={loc.data.description} root={loc.data.root} summary={summary.data ?? null}
    error={error} note={note}
    onSave={async (name, description) => {
      setError(null); setNote(null);
      try {
        await engine.call("vault.update", { name, description }, { write: true });
        await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
        setNote(t.settings.vault.saved);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }}
    onCopied={(ok) => { setError(null); setNote(ok ? t.settings.vault.copied : null); if (!ok) setError(t.settings.vault.copyFailed); }} />;
}

function VaultForm({ info, description, root, summary, error, note, onSave, onCopied }: { info: Info; description: string; root: string; summary: Summary | null; error: string | null; note: string | null; onSave(n: string, d: string): Promise<void>; onCopied(ok: boolean): void }) {
  const [name, setName] = useState(info.name);
  const [desc, setDesc] = useState(description);
  const dirty = name !== info.name || desc !== description;
  const valid = name.trim().length > 0 && name.trim().length <= 80 && desc.trim().length <= 500;
  const c = t.settings.vault;
  return (
    <div data-testid="settings-vault">
      <h1>{c.title}</h1>
      {info.readOnly ? <p role="status" className="hu-meta">{c.readOnly}</p> : null}
      <form className="hu-form" onSubmit={(e) => { e.preventDefault(); if (dirty && valid) void onSave(name.trim(), desc.trim()); }}>
        <label>{c.name}<input className="hu-input" data-testid="svault-name" value={name} maxLength={80} disabled={info.readOnly} onChange={(e) => setName(e.target.value)} /></label>
        <label>{c.description}<textarea className="hu-input" data-testid="svault-description" rows={3} maxLength={500} value={desc} disabled={info.readOnly} onChange={(e) => setDesc(e.target.value)} /></label>
        <Button type="submit" variant="primary" disabled={!dirty || !valid || info.readOnly} data-testid="svault-save">{c.save}</Button>
      </form>
      {note ? <div role="status" data-testid="svault-note">{note}</div> : null}
      {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
      <dl>
        <dt>{c.root}</dt>
        <dd className="hu-row"><code data-testid="svault-root">{root || "…"}</code>
          {host()?.revealVault ? <Button onClick={() => void host()?.revealVault()} data-testid="svault-reveal">{c.reveal}</Button> : null}</dd>
        <dt>{c.id}</dt>
        <dd className="hu-row"><code data-testid="svault-id">{info.id}</code>
          <Button onClick={() => { navigator.clipboard.writeText(info.id).then(() => onCopied(true), () => onCopied(false)); }} data-testid="svault-copy">{c.copy}</Button></dd>
        <dt>{c.overview}</dt>
        <dd data-testid="svault-counts">{c.counts(info.counts["files"] ?? 0, info.counts["notes"] ?? 0, summary?.tasksOpen ?? 0, summary?.inboxPending ?? 0)}{info.indexing ? `（${c.indexing}）` : ""}</dd>
      </dl>
    </div>
  );
}
