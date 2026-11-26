import { Button } from "@huhu/ui";
import { host, useCapability, useEngine } from "@huhu/workbench";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

export function ScpDownloadPanel({ fileSessionId }: { fileSessionId: string }) {
  const desktop = host();
  if (!desktop) return null;
  return (
    <>
      <ScpDownload fileSessionId={fileSessionId} desktop={desktop} />
      <ScpUpload fileSessionId={fileSessionId} desktop={desktop} />
    </>
  );
}

type ScpProps = { fileSessionId: string; desktop: NonNullable<ReturnType<typeof host>> };

function ScpDownload({ fileSessionId, desktop }: ScpProps) {
  const engine = useEngine();
  const support = useCapability<{ available: boolean }>("ssh.fileSessions.scp.support", { fileSessionId });
  const [remote, setRemote] = useState("");
  const [directory, setDirectory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const inFlight = useRef<AbortController>(undefined);
  useEffect(() => () => inFlight.current?.abort(), []);
  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = remote.split("/").at(-1);
    if (!remote.startsWith("/") || !name || !directory || inFlight.current) return;
    const separator = directory.includes("\\") ? "\\" : "/";
    const local = directory.replace(/[\\/]$/u, "") + separator + name;
    const controller = new AbortController();
    inFlight.current = controller;
    setBusy(true);
    setError("");
    setResult("");
    try {
      const saved = await engine.call<{ size: number }>("ssh.fileSessions.scp.download", { fileSessionId, remote, local }, { write: true, signal: controller.signal });
      setResult(`已下载 ${saved.size} 字节至 ${local}`);
    } catch (failure) {
      setError(controller.signal.aborted ? "已取消 SCP 下载" : failure instanceof Error ? failure.message : "SCP 下载失败");
    } finally {
      setBusy(false);
      inFlight.current = undefined;
    }
  }

  return (
    <section aria-label="SCP 单文件下载" className="hu-card-alt hu-stack">
      <h3>SCP 单文件下载</h3>
      <p role="status">{support.isPending ? "正在探测原连接的 SCP…" : support.data?.available ? "原连接支持 SCP 下载" : "无法通过原连接运行 SCP"}</p>
      {support.data?.available && (
        <form method="post" className="hu-stack" onSubmit={(event) => void download(event)}>
          <label className="hu-field">
            远端文件绝对路径
            <input name="remote" value={remote} onChange={(event) => setRemote(event.currentTarget.value)} disabled={busy} maxLength={4096} required />
          </label>
          <Button type="button" disabled={busy} onClick={() => void desktop.pickOpenPath("directory").then(
            (folder) => { if (folder) setDirectory(folder); },
            () => setError("无法选取本机目录。"),
          )}>选择本机目录</Button>
          {directory && <p>保存到 <code>{directory}</code></p>}
          <Button type="submit" disabled={busy || !directory || !remote.startsWith("/")}>下载文件</Button>
          {busy && <Button type="button" onClick={() => inFlight.current?.abort()}>取消下载</Button>}
        </form>
      )}
      {result && <p role="status">{result}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function ScpUpload({ fileSessionId, desktop }: ScpProps) {
  const engine = useEngine();
  const support = useCapability<{ available: boolean }>("ssh.fileSessions.scp.uploadSupport", { fileSessionId });
  const remoteId = useId();
  const [remote, setRemote] = useState("");
  const [local, setLocal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const inFlight = useRef<AbortController>(undefined);
  useEffect(() => () => inFlight.current?.abort(), []);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!local || !remote.startsWith("/") || inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setBusy(true);
    setError("");
    setResult("");
    try {
      const saved = await engine.call<{ size: number }>("ssh.fileSessions.scp.upload", { fileSessionId, remote, local }, { write: true, signal: controller.signal });
      setResult(`已上传 ${saved.size} 字节至 ${remote}`);
    } catch (failure) {
      setError(controller.signal.aborted ? "SCP 上传已停止。请在原主机核对目标是否已提交。" : failure instanceof Error ? failure.message : "SCP 上传失败");
    } finally {
      setBusy(false);
      inFlight.current = undefined;
    }
  }

  return (
    <section aria-label="SCP 单文件上传" className="hu-card-alt hu-stack">
      <h3>SCP 单文件上传</h3>
      <p role="status">{support.isPending ? "正在探测原连接的 SCP…" : support.data?.available ? "原连接支持 SCP 上传" : "远端缺少 SCP 接收程序或无覆盖提交工具"}</p>
      {support.data?.available && (
        <form method="post" className="hu-stack" onSubmit={(event) => void upload(event)}>
          <div className="hu-field">
            <label htmlFor={remoteId}>新建远端文件绝对路径</label>
            <input id={remoteId} name="remote" value={remote} onChange={(event) => setRemote(event.currentTarget.value)} disabled={busy} maxLength={4096} required />
          </div>
          <Button type="button" disabled={busy} onClick={() => void desktop.pickOpenPath("file").then(
            (file) => { if (file) setLocal(file); },
            () => setError("无法选取本机源文件。"),
          )}>选择本机文件</Button>
          {local && <p>本机源文件 <code>{local}</code></p>}
          <Button type="submit" disabled={busy || !local || !remote.startsWith("/")}>上传文件</Button>
          {busy && <Button type="button" onClick={() => inFlight.current?.abort()}>取消上传</Button>}
        </form>
      )}
      {result && <p role="status">{result}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
