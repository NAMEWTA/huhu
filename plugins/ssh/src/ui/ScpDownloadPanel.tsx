import { Button } from "@huhu/ui";
import { host, useCapability, useEngine } from "@huhu/workbench";
import { useEffect, useRef, useState, type FormEvent } from "react";

export function ScpDownloadPanel({ fileSessionId }: { fileSessionId: string }) {
  const desktop = host();
  const engine = useEngine();
  const support = useCapability<{ available: boolean }>("ssh.fileSessions.scp.support", { fileSessionId }, { enabled: Boolean(desktop) });
  const [remote, setRemote] = useState("");
  const [directory, setDirectory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const inFlight = useRef<AbortController>(undefined);
  useEffect(() => () => inFlight.current?.abort(), []);
  if (!desktop) return null;

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
