import { Button, ChoiceSwitch, Field } from "@huhu/ui";
import { Download, RefreshCw, Upload } from "lucide-react";
import { useState } from "react";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { t } from "../i18n/zh-CN.js";
import { host } from "./host.js";

interface Info {
  counts: Record<string, number>;
  indexing: boolean;
  readOnly: boolean;
}
interface Exported {
  path: string;
  size: number;
  sha256: string;
  files: number;
}
interface Imported {
  vaultId: string;
  files: number;
  targetDir: string;
}

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
    setBusy("reindex");
    setMsg(null);
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
    setBusy("export");
    setMsg(null);
    setExported(null);
    try {
      setExported(await engine.call<Exported>("vault.exportPackage", { dest: dest.trim(), includeAttachments: attachments }, { write: true }));
    } catch (e) {
      fail(e, "storage-export-msg");
    } finally {
      setBusy(null);
    }
  }
  async function doImport() {
    setBusy("import");
    setMsg(null);
    setImported(null);
    try {
      setImported(await engine.call<Imported>("vault.importPackage", { zipPath: zipPath.trim(), targetDir: targetDir.trim() }, { write: true }));
    } catch (e) {
      fail(e, "storage-import-msg");
    } finally {
      setBusy(null);
    }
  }
  const h = host();

  if (info.isError)
    return (
      <div role="alert" className="hu-overdue">
        {info.error instanceof Error ? info.error.message : String(info.error)}
      </div>
    );
  if (!info.data) return <p>{t.loading}</p>;
  const indexing = info.data.indexing || busy === "reindex";
  return (
    <div data-testid="settings-storage">
      {msg ? (
        <div role={msg.kind === "error" ? "alert" : "status"} className={msg.kind === "error" ? "callout danger" : "callout"} data-testid={msg.testid}>
          <p>{msg.text}</p>
        </div>
      ) : null}

      <section className="settings-section card">
        <h2>{c.indexTitle}</h2>
        <p data-testid="storage-counts">
          {c.counts(info.data.counts["files"] ?? 0, info.data.counts["notes"] ?? 0)}
          {indexing ? `（${c.indexing}）` : ""}
        </p>
        <p className="field-description">{c.indexNote}</p>
        <div className="row">
          <Button icon={RefreshCw} onClick={() => void reindex()} disabled={busy !== null || info.data.indexing} loading={busy === "reindex"} data-testid="storage-reindex">
            {c.reindex}
          </Button>
          {indexing ? (
            <Button onClick={() => void cancelReindex()} data-testid="storage-reindex-cancel">
              {c.cancel}
            </Button>
          ) : null}
        </div>
      </section>

      <section className="settings-section card">
        <h2>{c.exportTitle}</h2>
        <p>{c.exportNote}</p>
        <div className="setting-row">
          <div>
            <strong>{c.attachments}</strong>
          </div>
          <ChoiceSwitch checked={attachments} onChange={setAttachments} label={c.attachments} />
        </div>
        <Field label={c.exportPath}>
          <div className="row">
            <input aria-label={c.exportPath} data-testid="storage-export-path" value={dest} placeholder="/…/HUHU-备份.zip" onChange={(e) => setDest(e.target.value)} />
            {h?.pickSavePath ? (
              <Button
                onClick={() =>
                  void h.pickSavePath(`HUHU-${new Date().toISOString().slice(0, 10)}.zip`).then((p) => {
                    if (p) setDest(p);
                  })
                }
              >
                {c.choose}
              </Button>
            ) : null}
            <Button variant="primary" icon={Download} onClick={() => void doExport()} disabled={busy !== null || !dest.trim()} loading={busy === "export"} data-testid="storage-export">
              {c.export}
            </Button>
          </div>
        </Field>
        {exported ? (
          <div className="date-format-samples" data-testid="storage-export-result">
            <div>
              <span>{c.resultPath}</span>
              <code data-testid="export-path">{exported.path}</code>
            </div>
            <div>
              <span>{c.resultSize}</span>
              <code data-testid="export-size">
                {fmtSize(exported.size)}（{c.files(exported.files)}）
              </code>
            </div>
            <div>
              <span>SHA-256</span>
              <code data-testid="export-sha">{exported.sha256}</code>
            </div>
          </div>
        ) : null}
      </section>

      <section className="settings-section card">
        <h2>{c.importTitle}</h2>
        <p>{c.importNote}</p>
        <Field label={c.zipPath}>
          <div className="row">
            <input aria-label={c.zipPath} data-testid="storage-import-zip" value={zipPath} onChange={(e) => setZipPath(e.target.value)} />
            {h?.pickOpenPath ? (
              <Button
                onClick={() =>
                  void h.pickOpenPath("zip").then((p) => {
                    if (p) setZipPath(p);
                  })
                }
              >
                {c.choose}
              </Button>
            ) : null}
          </div>
        </Field>
        <Field label={c.targetDir}>
          <div className="row">
            <input aria-label={c.targetDir} data-testid="storage-import-target" value={targetDir} onChange={(e) => setTargetDir(e.target.value)} />
            {h?.pickOpenPath ? (
              <Button
                onClick={() =>
                  void h.pickOpenPath("directory").then((p) => {
                    if (p) setTargetDir(p);
                  })
                }
              >
                {c.choose}
              </Button>
            ) : null}
            <Button icon={Upload} onClick={() => void doImport()} disabled={busy !== null || !zipPath.trim() || !targetDir.trim()} loading={busy === "import"} data-testid="storage-import">
              {c.import}
            </Button>
          </div>
        </Field>
        {imported ? (
          <p role="status" data-testid="storage-import-result" className="field-description">
            {c.imported(imported.targetDir, imported.files)}
          </p>
        ) : null}
      </section>

      <section className="settings-section card">
        <h2>{c.backupTitle}</h2>
        <p>{c.backupNote}</p>
      </section>
    </div>
  );
}
