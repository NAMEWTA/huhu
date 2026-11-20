import { Button, Dialog } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { useId, useState } from "react";
import type { FileSession } from "../shared/files.js";

export function RemoteCopyDialog({ source, name, error, onClose, onCopy }: { source: FileSession; name: string; error: string | null; onClose: () => void; onCopy: (fileSessionId: string, path: string) => Promise<boolean> }) {
  const sessions = useCapability<FileSession[]>("ssh.fileSessions.list");
  const valid = sessions.data?.filter((session) => session.state === "ready" && session.connectionId !== source.connectionId) ?? [];
  const [selected, setSelected] = useState("");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const formId = useId();
  const canCopy = valid.some(({ fileSessionId }) => fileSessionId === selected) && path.trim().startsWith("/") && !path.trim().endsWith("/");
  return (
    <Dialog
      open
      title="复制到另一 SSH 会话"
      error={error}
      onClose={() => {
        if (!busy) onClose();
      }}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={!canCopy || busy}>
            加入传输中心
          </Button>
        </>
      }
    >
      <p>
        {source.name} · {name}
      </p>
      <form
        id={formId}
        className="ssh-workspace-editor"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canCopy || busy) return;
          setBusy(true);
          void onCopy(selected, path.trim())
            .then((ok) => {
              if (ok) onClose();
            })
            .finally(() => setBusy(false));
        }}
      >
        <div className="ssh-workspace-field">
          <label htmlFor={`${formId}-session`}>目标文件会话</label>
          <select id={`${formId}-session`} required value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="">选择其他已连接的独立会话</option>
            {valid.map((session) => (
              <option key={session.fileSessionId} value={session.fileSessionId}>
                {session.name} · {session.user}@{session.host}:{session.port}
              </option>
            ))}
          </select>
        </div>
        <label>
          远端目标绝对文件路径 <input required value={path} onChange={(event) => setPath(event.target.value)} />
        </label>
        {valid.length === 0 && <p>先从另一已连接的主机打开独立双栏。</p>}
      </form>
    </Dialog>
  );
}
