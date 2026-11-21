import { Button, Dialog } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useId, useState, type FormEvent } from "react";
import type { FileSession } from "../shared/files.js";

export function CreateFileEntryDialog({ session, directory, kind, onClose, onSaved }: { session: FileSession; directory: string; kind: "file" | "link"; onClose: () => void; onSaved: () => void }) {
  const engine = useEngine();
  const id = useId();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const canSave = session.state === "ready" && !!name && name !== "." && name !== ".." && !name.includes("/") && (kind === "file" || !!target);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canSave || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await engine.call(
        "ssh.fileSessions.createEntry",
        {
          fileSessionId: session.fileSessionId,
          path: `${directory.replace(/\/$/, "")}/${name}`,
          entry: kind === "file" ? { kind } : { kind, target },
        },
        { write: true },
      );
      onSaved();
    } catch (failure) {
      if (failure instanceof Error) setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      title={kind === "file" ? "新建远端文件" : "新建符号链接"}
      description={directory}
      error={error ?? null}
      onClose={() => {
        if (!busy) onClose();
      }}
      actions={
        <>
          <Button disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form={id} variant="primary" disabled={!canSave || busy}>
            创建
          </Button>
        </>
      }
    >
      <form id={id} className="ssh-workspace-editor" onSubmit={(event) => void save(event)}>
        <label>
          名称 <input required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {kind === "link" && (
          <label>
            链接目标 <input required maxLength={4096} value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
        )}
      </form>
    </Dialog>
  );
}
