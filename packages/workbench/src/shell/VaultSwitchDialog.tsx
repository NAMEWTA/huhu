import type { Settings } from "@huhu/contracts";
import { Button, Dialog, Field } from "@huhu/ui";
import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCapability, useEngine, useOptionalEngine } from "../engine-client/react.js";
import { host } from "../settings/host.js";
import { listDirtyDocs, settleDirtyDocs } from "../state/flushers.js";

/**
 * 切换 Vault（原型标题栏的“切换 Vault”）：有未保存文档时逐个列出，
 * 选项“全部保存并切换”“保留草稿并切换”“取消”；没有就直接确认。
 */
export function VaultSwitchDialog({ open, onClose, target }: { open: boolean; onClose(): void; /** 直接切到这个 Vault（顶栏菜单里选了最近的 Vault / 其他目录）；缺省为回到启动页。 */ target?: { path: string; name: string } }) {
  const engine = useOptionalEngine();
  const [backupOk, setBackupOk] = useState(true);
  const [busy, setBusy] = useState(false);
  // 每次打开重新取一次未保存文档
  const labels = useMemo(() => (open ? listDirtyDocs().map((d) => d.label) : []), [open]);
  const [error, setError] = useState<string | null>(null);
  const go = async (mode: "save" | "draft") => {
    setBusy(true);
    setError(null);
    try {
      const lost = await settleDirtyDocs(mode);
      if (lost.length > 0) {
        setError(`这些文档既没能保存也没能留下草稿，已取消切换：${lost.join("、")}`);
        return;
      }
      const vaultHost = host()?.vault;
      if (target && vaultHost) {
        const r = await vaultHost.open(target.path);
        if (!r.ok) {
          // 打开前的检查失败时当前 Vault 还开着：留在原地说明原因；否则（已被停掉）回到启动页
          if ((await vaultHost.state()).path) {
            setError(r.message);
            return;
          }
        }
      } else {
        await vaultHost?.close();
      }
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const dirty = labels.length > 0;
  return (
    <Dialog
      open={open}
      title={target ? `切换到 ${target.name}` : "切换 Vault"}
      description={dirty ? "以下文档有未保存的修改，选择如何处理后再切换。" : target ? "关闭当前 Vault，并打开所选的文件夹。" : "关闭当前 Vault 并回到启动页，可以打开另一个文件夹。"}
      onClose={() => !busy && onClose()}
      testId="svault-switch-dialog"
      error={error}
      actions={
        <>
          <Button disabled={busy} onClick={onClose}>
            取消
          </Button>
          {dirty ? (
            <>
              <Button disabled={busy || !backupOk} data-testid="svault-switch-draft" onClick={() => void go("draft")}>
                保留草稿并切换
              </Button>
              <Button variant="primary" disabled={busy || !backupOk} data-testid="svault-switch-save" onClick={() => void go("save")}>
                全部保存并切换
              </Button>
            </>
          ) : (
            <Button variant="primary" disabled={busy || !backupOk} data-testid="svault-switch-confirm" onClick={() => void go("save")}>
              {target ? "切换" : "关闭并切换"}
            </Button>
          )}
        </>
      }
    >
      {dirty ? (
        <ul data-testid="svault-dirty-list">
          {labels.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        <p className="hint-text">没有未保存的修改。</p>
      )}
      {engine ? <BackupGate open={open} onGate={setBackupOk} onError={setError} setBusy={setBusy} busy={busy} /> : null}
    </Dialog>
  );
}

/** 关闭前备份（设置里开启“关闭前提示导出数据包”时）：先导出数据包并勾选“我已确认备份文件可用”才允许继续。 */
function BackupGate({ open, onGate, onError, busy, setBusy }: { open: boolean; onGate(ok: boolean): void; onError(e: string | null): void; busy: boolean; setBusy(b: boolean): void }) {
  const engine = useEngine();
  const settings = useCapability<Settings>("settings.get", {});
  const needBackup = settings.data?.storage.promptBackupBeforeClose === true;
  const [dest, setDest] = useState("");
  const [exported, setExported] = useState<{ path: string; sha256: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (open) {
      setExported(null);
      setConfirmed(false);
    }
  }, [open]); // 每次打开都要重新导出：备份必须是此刻的内容
  useEffect(() => {
    onGate(!needBackup || (exported !== null && confirmed));
  }, [needBackup, exported, confirmed, onGate]);
  useEffect(() => () => onGate(true), [onGate]);
  const doExport = async () => {
    setBusy(true);
    onError(null);
    try {
      setExported(await engine.call<{ path: string; sha256: string }>("vault.exportPackage", { dest: dest.trim(), includeAttachments: true }, { write: true }));
      setConfirmed(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (!needBackup) return null;
  return (
    <section data-testid="svault-backup" className="callout">
      <div style={{ display: "grid", gap: 10, minWidth: 0, width: "100%" }}>
        <strong>先保存可读的数据包</strong>
        <p className="hint-text">你开启了“关闭前提示导出数据包”。导出后确认文件可用，再继续。</p>
        <Field label="保存到">
          <div className="row">
            <input aria-label="数据包保存到" data-testid="svault-backup-path" value={dest} placeholder="/…/HUHU-备份.zip" onChange={(e) => setDest(e.target.value)} />
            {host()?.pickSavePath ? (
              <Button
                onClick={() =>
                  void host()
                    ?.pickSavePath(`HUHU-${new Date().toISOString().slice(0, 10)}.zip`)
                    .then((p) => p && setDest(p))
                }
              >
                选择…
              </Button>
            ) : null}
            <Button icon={Download} disabled={busy || !dest.trim()} data-testid="svault-backup-export" onClick={() => void doExport()}>
              {exported ? "重新导出最新内容" : "导出数据包"}
            </Button>
          </div>
        </Field>
        {exported ? (
          <p role="status" className="hint-text" data-testid="svault-backup-done">
            已导出：{exported.path}（SHA-256 {exported.sha256.slice(0, 12)}…）
          </p>
        ) : null}
        <label className="row">
          <input type="checkbox" aria-label="我已确认备份文件可用" data-testid="svault-backup-confirm" disabled={!exported} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>我已确认备份文件可用</span>
        </label>
      </div>
    </section>
  );
}
