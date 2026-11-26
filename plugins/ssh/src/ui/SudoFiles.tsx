import { Button } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useEffect, useId, useRef, useState } from "react";
import type { FileDirectory, FileDocument, FileSession } from "../shared/files.js";
import { FileTable } from "./FileTable.js";
import { RemoteTextEditor } from "./RemoteTextEditor.js";

export function SudoFiles({ session }: { session: FileSession }) {
  const engine = useEngine();
  const pathId = useId();
  const [scope, setScope] = useState<AbortController>();
  const [path, setPath] = useState("");
  const [directory, setDirectory] = useState<FileDirectory>();
  const [editing, setEditing] = useState<FileDocument>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController>(undefined);
  useEffect(() => () => active.current?.abort(), []);

  async function enable() {
    const pending = new AbortController();
    active.current = pending;
    setError("");
    setBusy(true);
    try {
      const { available } = await engine.call<{ available: boolean }>("ssh.fileSessions.sudo.probe", { fileSessionId: session.fileSessionId }, { signal: pending.signal });
      if (!available) {
        setError("原主机不支持 sudo 文件操作。系统 sftp-server 需要免交互 sudo 权限。");
        return;
      }
      if (!pending.signal.aborted) setScope(pending);
    } catch (cause) {
      if (!pending.signal.aborted) setError(cause instanceof Error ? cause.message : "无法探测 sudo 文件权限。");
    } finally {
      setBusy(false);
    }
  }

  function disable() {
    active.current?.abort();
    active.current = undefined;
    setScope(undefined);
    setPath("");
    setDirectory(undefined);
    setEditing(undefined);
    setError("");
  }

  async function open(target: string, kind: "directory" | "file") {
    if (!scope || busy) return;
    setBusy(true);
    setError("");
    const input = { fileSessionId: session.fileSessionId, path: target };
    try {
      if (kind === "directory") {
        const value = await engine.call<FileDirectory>("ssh.fileSessions.sudo.list", input, { signal: scope.signal });
        if (!scope.signal.aborted) {
          setDirectory(value);
          setPath(value.path);
        }
      } else {
        const value = await engine.call<FileDocument>("ssh.fileSessions.sudo.read", input, { signal: scope.signal });
        if (!scope.signal.aborted) setEditing(value);
      }
    } catch (cause) {
      if (!scope.signal.aborted) setError(cause instanceof Error ? cause.message : "sudo 文件操作失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="sudo 文件操作" className="hu-stack">
      {scope ? (
        <>
          <p role="status">此文件视图已启用 sudo 浏览与文本编辑。</p>
          <Button onClick={disable}>退出 sudo 文件操作</Button>
          <form className="ssh-workspace-controls" onSubmit={(event) => { event.preventDefault(); void open(path, "directory"); }}>
            <label htmlFor={pathId}>sudo 文件路径</label>
            <input id={pathId} value={path} maxLength={4096} onChange={(event) => setPath(event.currentTarget.value)} />
            <Button type="submit" disabled={busy}>浏览目录</Button>
            <Button disabled={busy || !path.startsWith("/")} onClick={() => void open(path, "file")}>打开文本</Button>
          </form>
          {directory && <FileTable caption="sudo 目录项目" entries={directory.entries} disabled={busy} onOpen={(entry) => {
            if (entry.type === "dir" || entry.type === "file") {
              const target = directory.path.replace(/\/$/u, "") + "/" + entry.name;
              void open(target, entry.type === "dir" ? "directory" : "file");
            }
          }} />}
          {editing && <RemoteTextEditor session={session} initial={editing} sudoSignal={scope.signal} onClose={() => setEditing(undefined)} />}
        </>
      ) : <Button loading={busy} onClick={() => void enable()}>检查 sudo 文件权限</Button>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
