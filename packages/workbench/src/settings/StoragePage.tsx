import { Button } from "@huhu/ui";
import { useState } from "react";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { t } from "../i18n/zh-CN.js";
import { host } from "./host.js";

interface Info { counts: Record<string, number>; indexing: boolean; readOnly: boolean }
interface Exported { path: string; size: number; sha256: string; files: number }
interface Imported { vaultId: string; files: number; targetDir: string }

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** 设置 → 数据与存储：索引重建（可取消，取消后旧索引继续使用）、导出受管数据包、导入数据包到新目录。 */
export function StoragePage() {
  const engine = useEngine();
  const qc = useQueryClient();
  const info = useCapability<Info>("vault.info", {});
  const c = t.settings.storage;
  const [busy, setBusy] = useState<"reindex" | "export" | "import" | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; testid: string } | null>(null);
  const [exported, setExported] = useState<Exported | null>(null);
  const [imported, setImported] = useState<Imported | null>(null);
  const [attachments, setAttachments] = useState(true);
  const [dest, setDest] = useState("");
  const [zipPath, setZipPath] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
  const fail = (e: unknown, testid: string) => setMsg({ kind: "error", text: e instanceof Error ? e.message : String(e), testid });

  async function reindex() {
    setBusy("reindex"); setMsg(null);
    try {
      const r = await engine.call<{ completed: boolean }>("vault.reindex", {}, { write: true });
      setMsg({ kind: "ok", text: r.completed ? c.reindexDone : c.reindexCancelled, testid: "storage-reindex-msg" });
    } catch (e) {
      fail(e, "storage-reindex-msg");
    } finally {
      setBusy(null);
      void refresh();
    }
  }
  async function cancelReindex() {
    try {
      const r = await engine.call<{ cancelled: boolean }>("vault.reindexCancel", {}, { write: true });
      if (!r.cancelled) setMsg({ kind: "ok", text: c.cannotCancel, testid: "storage-reindex-msg" });
    } catch (e) {
      fail(e, "storage-reindex-msg");
    }
  }
  async function doExport() {
    setBusy("export"); setMsg(null); setExported(null);
    try {
      setExported(await engine.call<Exported>("vault.exportPackage", { dest: dest.trim(), includeAttachments: attachments }, { write: true }));
    } catch (e) {
      fail(e, "storage-export-msg");
    } finally {
      setBusy(null);
    }
  }
  async function doImport() {
    setBusy("import"); setMsg(null); setImported(null);
    try {
      setImported(await engine.call<Imported>("vault.importPackage", { zipPath: zipPath.trim(), targetDir: targetDir.trim() }, { write: true }));
    } catch (e) {
      fail(e, "storage-import-msg");
    } finally {
      setBusy(null);
    }
  }
  const h = host();

  if (info.isError) return <div role="alert" className="hu-overdue">{info.error instanceof Error ? info.error.message : String(info.error)}</div>;
  if (!info.data) return <p>{t.loading}</p>;
  const indexing = info.data.indexing || busy === "reindex";
  return (
    <div data-testid="settings-storage">
      <h1>{c.title}</h1>
      {msg ? <div role={msg.kind === "error" ? "alert" : "status"} className={msg.kind === "error" ? "hu-overdue" : undefined} data-testid={msg.testid}>{msg.text}</div> : null}

      <h2>{c.indexTitle}</h2>
      <p data-testid="storage-counts">{c.counts(info.data.counts["files"] ?? 0, info.data.counts["notes"] ?? 0)}{indexing ? `（${c.indexing}）` : ""}</p>
      <p className="hu-meta">{c.indexNote}</p>
      <div className="hu-row">
        <Button onClick={() => void reindex()} disabled={busy !== null || info.data.indexing} loading={busy === "reindex"} data-testid="storage-reindex">{c.reindex}</Button>
        {indexing ? <Button onClick={() => void cancelReindex()} data-testid="storage-reindex-cancel">{c.cancel}</Button> : null}
      </div>

      <h2>{c.exportTitle}</h2>
      <p className="hu-meta">{c.exportNote}</p>
      <label><input type="checkbox" aria-label={c.attachments} checked={attachments} onChange={(e) => setAttachments(e.target.checked)} /> {c.attachments}</label>
      <div className="hu-row">
        <label>{c.exportPath}<input className="hu-input" data-testid="storage-export-path" value={dest} placeholder="/…/HUHU-备份.zip" onChange={(e) => setDest(e.target.value)} /></label>
        {h?.pickSavePath ? <Button onClick={() => void h.pickSavePath(`HUHU-${new Date().toISOString().slice(0, 10)}.zip`).then((p) => { if (p) setDest(p); })}>{c.choose}</Button> : null}
        <Button variant="primary" onClick={() => void doExport()} disabled={busy !== null || !dest.trim()} loading={busy === "export"} data-testid="storage-export">{c.export}</Button>
      </div>
      {exported ? (
        <dl data-testid="storage-export-result">
          <dt>{c.resultPath}</dt><dd data-testid="export-path">{exported.path}</dd>
          <dt>{c.resultSize}</dt><dd data-testid="export-size">{fmtSize(exported.size)}（{c.files(exported.files)}）</dd>
          <dt>SHA-256</dt><dd><code data-testid="export-sha">{exported.sha256}</code></dd>
        </dl>
      ) : null}

      <h2>{c.importTitle}</h2>
      <p className="hu-meta">{c.importNote}</p>
      <div className="hu-row">
        <label>{c.zipPath}<input className="hu-input" data-testid="storage-import-zip" value={zipPath} onChange={(e) => setZipPath(e.target.value)} /></label>
        {h?.pickOpenPath ? <Button onClick={() => void h.pickOpenPath("zip").then((p) => { if (p) setZipPath(p); })}>{c.choose}</Button> : null}
      </div>
      <div className="hu-row">
        <label>{c.targetDir}<input className="hu-input" data-testid="storage-import-target" value={targetDir} onChange={(e) => setTargetDir(e.target.value)} /></label>
        {h?.pickOpenPath ? <Button onClick={() => void h.pickOpenPath("directory").then((p) => { if (p) setTargetDir(p); })}>{c.choose}</Button> : null}
        <Button onClick={() => void doImport()} disabled={busy !== null || !zipPath.trim() || !targetDir.trim()} loading={busy === "import"} data-testid="storage-import">{c.import}</Button>
      </div>
      {imported ? <p role="status" data-testid="storage-import-result">{c.imported(imported.targetDir, imported.files)}</p> : null}

      <h2>{c.backupTitle}</h2>
      <p className="hu-meta">{c.backupNote}</p>
    </div>
  );
}
