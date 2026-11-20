import { Button, Dialog } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useEffect, useId, useState } from "react";
import { FileAttributes, type FileProperties, type FileSession } from "../shared/files.js";

const date = (value: number | null) => value === null ? "服务端未提供" : new Date(value).toLocaleString();

function FilePropertiesForm({ value, submit, busy, formId }: {
  value: FileProperties;
  formId: string;
  busy: boolean;
  submit: (value: FileAttributes | { destination: string }) => void;
}) {
  const mutable = value.type === "file" || value.type === "dir";
  const [mode, setMode] = useState(value.mode);
  const [uid, setUid] = useState(value.uid?.toString() ?? "");
  const [gid, setGid] = useState(value.gid?.toString() ?? "");
  const [destination, setDestination] = useState("");
  const changedOwner = uid !== (value.uid?.toString() ?? "") || gid !== (value.gid?.toString() ?? "");
  const change = FileAttributes.safeParse({
    ...(mode !== value.mode ? { mode } : {}),
    ...(changedOwner ? { owner: { uid: uid ? Number(uid) : NaN, gid: gid ? Number(gid) : NaN } } : {}),
  });
  const canSave = !busy && mutable && change.success;
  return (
    <div className="hu-stack">
      <dl>
        <dt>类型</dt><dd>{{ file: "普通文件", dir: "目录", link: "符号链接", other: "其他" }[value.type]}</dd>
        <dt>大小（字节）</dt><dd>{value.size}{value.type === "dir" ? "（目录条目）" : ""}</dd>
        <dt>修改时间</dt><dd>{date(value.mtime)}</dd>
        <dt>访问时间</dt><dd>{date(value.atime)}</dd>
        {value.linkTarget !== null && <><dt>链接目标</dt><dd><code>{value.linkTarget}</code></dd></>}
      </dl>
      <form id={formId} className="ssh-workspace-editor" onSubmit={(event) => {
        event.preventDefault();
        if (canSave && change.success) submit(change.data);
      }}>
        <label>权限（八进制） <input value={mode} pattern="[0-7]{3}" maxLength={3} required disabled={!mutable || busy} onChange={(e) => setMode(e.target.value)} /></label>
        <label>所有者 UID <input type="number" min={0} max={0xfffffffe} value={uid} disabled={!mutable || busy} onChange={(e) => setUid(e.target.value)} /></label>
        <label>所属组 GID <input type="number" min={0} max={0xfffffffe} value={gid} disabled={!mutable || busy} onChange={(e) => setGid(e.target.value)} /></label>
        {mutable && <Button type="submit" variant="primary" disabled={!canSave}>保存属性</Button>}
      </form>
      <form className="ssh-workspace-editor" onSubmit={(event) => {
        event.preventDefault();
        if (destination.startsWith("/") && !busy) submit({ destination });
      }}>
        <label>移动到（远端绝对路径） <input required maxLength={4096} value={destination} disabled={busy} onChange={(e) => setDestination(e.target.value)} /></label>
        <Button type="submit" disabled={busy || !destination.startsWith("/") || destination === value.path}>移动项目</Button>
      </form>
    </div>
  );
}

export function FilePropertiesDialog({ session, path, onClose, onSaved }: {
  session: FileSession;
  path: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const engine = useEngine();
  const { fileSessionId } = session;
  const formId = useId();
  const [value, setValue] = useState<FileProperties>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void engine.call<FileProperties>("ssh.fileSessions.properties", { fileSessionId, path }, { signal: abort.signal }).then(
      (result) => { if (!abort.signal.aborted) setValue(result); },
      (failure: unknown) => { if (!abort.signal.aborted && failure instanceof Error) setError(failure.message); },
    );
    return () => abort.abort();
  }, [engine, fileSessionId, path, reload]);
  async function submit(update: FileAttributes | { destination: string }) {
    if (!value || busy || session.state !== "ready") return;
    const input = { fileSessionId, path: value.path, expectedRevision: value.revision };
    setBusy(true);
    setError(undefined);
    try {
      if ("destination" in update) {
        await engine.call("ssh.fileSessions.moveEntry", { ...input, destination: update.destination }, { write: true });
        onClose();
      } else {
        setValue(await engine.call<FileProperties>("ssh.fileSessions.changeProperties", { ...input, change: update }, { write: true }));
      }
      onSaved();
    } catch (failure) {
      if (failure instanceof Error) setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open title="远端文件属性" description={path} error={error ?? null} onClose={() => { if (!busy) onClose(); }} actions={
      <>
        {error && <Button disabled={busy} onClick={() => { setValue(undefined); setError(undefined); setReload((n) => n + 1); }}>重新读取</Button>}
        <Button disabled={busy} onClick={onClose}>关闭</Button>
      </>
    }>
      {value ? <FilePropertiesForm key={value.revision} value={value} formId={formId} busy={busy || session.state !== "ready"} submit={(update) => void submit(update)} /> : !error && <p role="status">正在读取远端属性…</p>}
    </Dialog>
  );
}
