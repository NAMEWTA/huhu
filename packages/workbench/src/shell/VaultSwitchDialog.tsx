import { Button, Dialog } from "@huhu/ui";
import { useMemo, useState } from "react";
import { host } from "../settings/host.js";
import { listDirtyDocs, settleDirtyDocs } from "../state/flushers.js";

/**
 * 切换 Vault（原型标题栏的“切换 Vault”）：有未保存文档时逐个列出，
 * 选项“全部保存并切换”“保留草稿并切换”“取消”；没有就直接确认。
 */
export function VaultSwitchDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const [busy, setBusy] = useState(false);
  // 每次打开重新取一次未保存文档
  const labels = useMemo(() => (open ? listDirtyDocs().map((d) => d.label) : []), [open]);
  const go = async (mode: "save" | "draft") => {
    setBusy(true);
    await settleDirtyDocs(mode);
    await host()?.vault.close();
    window.location.reload();
  };
  const dirty = labels.length > 0;
  return (
    <Dialog
      open={open}
      title="切换 Vault"
      description={dirty ? "以下文档有未保存的修改，选择如何处理后再切换。" : "关闭当前 Vault 并回到启动页，可以打开另一个文件夹。"}
      onClose={() => !busy && onClose()}
      testId="svault-switch-dialog"
      actions={
        <>
          <Button disabled={busy} onClick={onClose}>
            取消
          </Button>
          {dirty ? (
            <>
              <Button disabled={busy} data-testid="svault-switch-draft" onClick={() => void go("draft")}>
                保留草稿并切换
              </Button>
              <Button variant="primary" disabled={busy} data-testid="svault-switch-save" onClick={() => void go("save")}>
                全部保存并切换
              </Button>
            </>
          ) : (
            <Button variant="primary" disabled={busy} data-testid="svault-switch-confirm" onClick={() => void go("save")}>
              关闭并切换
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
    </Dialog>
  );
}
