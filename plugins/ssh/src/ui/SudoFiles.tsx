import { Button, Dialog } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { FileDirectory, FileDocument, FileProperties, FileSession } from "../shared/files.js";
import { FileTable } from "./FileTable.js";
import { FilePropertiesDialog } from "./FilePropertiesDialog.js";
import type { TransferBatchRequest } from "../shared/transfers.js";
import { RemoteTextEditor } from "./RemoteTextEditor.js";

export function SudoFiles({ session }: { session: FileSession }) {
  const engine = useEngine();
  const pathId = useId();
  const passwordId = useId();
  const [scope, setScope] = useState<AbortController>();
  const [showPassword, setShowPassword] = useState(false);
  const [sudoSessionId, setSudoSessionId] = useState<string>();
  const [path, setPath] = useState("");
  const [directory, setDirectory] = useState<FileDirectory>();
  const [editing, setEditing] = useState<FileDocument>();
  const [propertyPath, setPropertyPath] = useState<string>();
  const [deleting, setDeleting] = useState<FileProperties>();
  const [local, setLocal] = useState<FileDirectory>();
  const [selectedRemote, setSelectedRemote] = useState<string[]>([]);
  const [selectedLocal, setSelectedLocal] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController>(undefined);
  const authenticated = useRef<string>(undefined);
  const { fileSessionId } = session;
  const bound = { fileSessionId, ...(sudoSessionId && { sudoSessionId }) };
  useEffect(() => () => {
    active.current?.abort();
    const id = authenticated.current;
    if (id) void engine.call("ssh.fileSessions.sudo.close", { fileSessionId, sudoSessionId: id }, { write: true }).catch(() => undefined);
  }, [engine, fileSessionId]);

  async function enable() {
    const pending = new AbortController();
    active.current = pending;
    setError("");
    setBusy(true);
    try {
      const { available } = await engine.call<{ available: boolean }>("ssh.fileSessions.sudo.probe", { fileSessionId: session.fileSessionId }, { signal: pending.signal });
      if (!available) {
        setShowPassword(true);
        setError("无法免口令启动系统 sftp-server。若此主机要求 sudo 口令，可在此输入一次。");
        return;
      }
      if (!pending.signal.aborted) setScope(pending);
    } catch (cause) {
      if (!pending.signal.aborted) setError(cause instanceof Error ? cause.message : "无法探测 sudo 文件权限。");
    } finally {
      setBusy(false);
    }
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    form.reset();
    if (!password) return;
    const pending = new AbortController();
    active.current = pending;
    setBusy(true);
    setError("");
    try {
      const { sudoSessionId } = await engine.call<{ sudoSessionId: string }>("ssh.fileSessions.sudo.authenticate", { fileSessionId, password }, { write: true, signal: pending.signal });
      if (pending.signal.aborted) {
        void engine.call("ssh.fileSessions.sudo.close", { fileSessionId, sudoSessionId }, { write: true }).catch(() => undefined);
        return;
      }
      authenticated.current = sudoSessionId;
      setSudoSessionId(sudoSessionId);
      setScope(pending);
      setShowPassword(false);
    } catch (cause) {
      if (!pending.signal.aborted) setError(cause instanceof Error ? cause.message : "无法完成 sudo 认证");
    } finally {
      setBusy(false);
    }
  }

  function disable() {
    active.current?.abort();
    active.current = undefined;
    setScope(undefined);
    const id = authenticated.current;
    authenticated.current = undefined;
    setSudoSessionId(undefined);
    setShowPassword(false);
    if (id) void engine.call("ssh.fileSessions.sudo.close", { fileSessionId, sudoSessionId: id }, { write: true }).catch(() => undefined);
    setPath("");
    setDirectory(undefined);
    setEditing(undefined);
    setPropertyPath(undefined);
    setDeleting(undefined);
    setLocal(undefined);
    setSelectedRemote([]);
    setSelectedLocal([]);
    setNotice("");
    setError("");
  }

  async function open(target: string, kind: "directory" | "file") {
    if (!scope || busy) return;
    setBusy(true);
    setError("");
    const input = { ...bound, path: target };
    try {
      if (kind === "directory") {
        const value = await engine.call<FileDirectory>("ssh.fileSessions.sudo.list", input, { signal: scope.signal });
        if (!scope.signal.aborted) {
          setDirectory(value);
          setSelectedRemote([]);
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

  async function pickLocal() {
    if (!scope || busy) return;
    const bridge = (globalThis as { huhuHost?: { pickOpenPath(kind: "directory"): Promise<string | null> } }).huhuHost;
    setBusy(true);
    setError("");
    try {
      const root = await bridge?.pickOpenPath("directory");
      if (!root || scope.signal.aborted) return;
      setLocal(await engine.call<FileDirectory>("ssh.fileSessions.localList", { fileSessionId: session.fileSessionId, parts: [], root }, { signal: scope.signal }));
      setSelectedLocal([]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "无法读取本机目录");
    } finally {
      setBusy(false);
    }
  }

  async function queue(upload: boolean) {
    if (!scope || !local || !directory || busy) return;
    const remote = { kind: "remote", ...bound, path: directory.path, sudo: true } as const;
    const here = { kind: "local", path: local.path } as const;
    const request: TransferBatchRequest = {
      source: upload ? here : remote, target: upload ? remote : here,
      names: upload ? selectedLocal : selectedRemote, localFileSessionId: session.fileSessionId,
    };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await engine.call("ssh.transfers.startBatch", request, { write: true, signal: scope.signal });
      setNotice("已加入 sudo 传输队列。");
    } catch (error) {
      setError(error instanceof Error ? error.message : "无法加入 sudo 传输队列");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(target: string) {
    if (!scope || busy) return;
    setError("");
    setBusy(true);
    try {
      setDeleting(await engine.call<FileProperties>("ssh.fileSessions.sudo.properties", { ...bound, path: target }, { signal: scope.signal }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "无法检查删除目标");
    } finally {
      setBusy(false);
    }
  }

  async function erase() {
    if (!scope || !deleting || busy) return;
    setError("");
    setBusy(true);
    try {
      await engine.call("ssh.fileSessions.sudo.delete", { ...bound, path: deleting.path, expectedRevision: deleting.revision }, { write: true, signal: scope.signal });
      setDeleting(undefined);
      if (directory) void open(directory.path, "directory");
    } catch (error) {
      setError(error instanceof Error ? error.message : "sudo 删除失败");
    } finally {
      setBusy(false);
    }
  }

  const updateSelection = (current: string[], name: string, checked: boolean) =>
    checked ? [...current, name] : current.filter((item) => item !== name);
  return (
    <section aria-label="sudo 文件操作" className="hu-stack">
      {scope ? (
        <>
          <p role="status">此文件视图已启用 sudo 操作。已经加入队列的任务按发起时的权限执行。</p>
          <Button onClick={disable}>退出 sudo 文件操作</Button>
          <form className="ssh-workspace-controls" onSubmit={(event) => { event.preventDefault(); void open(path, "directory"); }}>
            <label htmlFor={pathId}>sudo 文件路径</label>
            <input id={pathId} value={path} maxLength={4096} onChange={(event) => setPath(event.currentTarget.value)} />
            <Button type="submit" disabled={busy}>浏览目录</Button>
            <Button disabled={busy || !path.startsWith("/")} onClick={() => void open(path, "file")}>打开文本</Button>
          </form>
          <div className="ssh-workspace-controls">
            <Button disabled={busy || !path.startsWith("/")} onClick={() => setPropertyPath(path)}>sudo 属性与移动</Button>
            <Button disabled={busy || !path.startsWith("/")} onClick={() => void confirmDelete(path)}>sudo 删除项目</Button>
            <Button disabled={busy} onClick={() => void pickLocal()}>选择 sudo 传输的本机目录</Button>
          </div>
          {directory && <FileTable caption="sudo 目录项目" entries={directory.entries} disabled={busy} onOpen={(entry) => {
            if (entry.type === "dir" || entry.type === "file") {
              const target = directory.path.replace(/\/$/u, "") + "/" + entry.name;
              void open(target, entry.type === "dir" ? "directory" : "file");
            }
          }} />}
          {directory && local && (
            <div className="ssh-file-columns">
              <fieldset>
                <legend>本机目录 {local.path}</legend>
                {local.entries.filter(({ type }) => type === "file" || type === "dir").map(({ name }) => (
                  <label key={name} className="hu-setting-row">
                    {name}
                    <input type="checkbox" disabled={busy || selectedLocal.length >= 32 && !selectedLocal.includes(name)} checked={selectedLocal.includes(name)} onChange={(event) => setSelectedLocal(updateSelection(selectedLocal, name, event.currentTarget.checked))} />
                  </label>
                ))}
                <Button disabled={busy || !selectedLocal.length} onClick={() => void queue(true)}>sudo 上传所选</Button>
              </fieldset>
              <fieldset>
                <legend>远端目录 {directory.path}</legend>
                {directory.entries.filter(({ type }) => type === "file" || type === "dir").map(({ name }) => (
                  <label key={name} className="hu-setting-row">
                    {name}
                    <input type="checkbox" disabled={busy || selectedRemote.length >= 32 && !selectedRemote.includes(name)} checked={selectedRemote.includes(name)} onChange={(event) => setSelectedRemote(updateSelection(selectedRemote, name, event.currentTarget.checked))} />
                  </label>
                ))}
                <Button disabled={busy || !selectedRemote.length} onClick={() => void queue(false)}>sudo 下载所选</Button>
              </fieldset>
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
          {propertyPath && <FilePropertiesDialog session={session} path={propertyPath} sudoSignal={scope.signal} sudoSessionId={sudoSessionId} onClose={() => setPropertyPath(undefined)} onSaved={() => { if (directory) void open(directory.path, "directory"); }} />}
          {deleting && <Dialog open title="确认 sudo 删除" description={deleting.path} error={error} onClose={() => { if (!busy) setDeleting(undefined); }}
            actions={<>
              <Button autoFocus disabled={busy} onClick={() => setDeleting(undefined)}>取消</Button>
              <Button variant="danger" loading={busy} onClick={() => void erase()}>确认删除</Button>
            </>}
          ><p>将删除这个文件或空目录。</p></Dialog>}
          {editing && <RemoteTextEditor session={session} initial={editing} sudoSignal={scope.signal} sudoSessionId={sudoSessionId} onClose={() => setEditing(undefined)} />}
        </>
      ) : showPassword ? (
        <form className="ssh-workspace-controls" onSubmit={(event) => void authenticate(event)}>
          <label htmlFor={passwordId}>原主机 sudo 口令</label>
          <input id={passwordId} name="password" type="password" autoComplete="off" maxLength={4096} required disabled={busy} />
          <Button type="submit" loading={busy}>一次性认证</Button>
          <Button onClick={disable}>取消 sudo 认证</Button>
        </form>
      ) : <Button loading={busy} onClick={() => void enable()}>检查 sudo 文件权限</Button>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
