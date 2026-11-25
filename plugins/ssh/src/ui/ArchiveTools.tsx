import { Button, Dialog } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useEffect, useId, useState } from "react";
import type { ArchiveRequest, ArchiveResult, ArchiveSupport } from "../shared/archives.js";
import type { FileEntry } from "../shared/files.js";

type Operation = "compress" | "extract";
type Props = { side: "local" | "remote"; directory: string; entries: FileEntry[]; id: string; ready: boolean; refresh: () => void };

export function ArchiveTools(props: Props) {
  const [open, setOpen] = useState(false);
  const device = props.side === "local" ? "本机" : "远端";
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)} className="ssh-archive-tools">
      <summary>{device} ZIP 归档</summary>
      {open && <Actions {...props} device={device} />}
    </details>
  );
}

function Actions({ side, directory, entries, id, ready, refresh, device }: Props & { device: string }) {
  const engine = useEngine();
  const [support, setSupport] = useState<ArchiveSupport>();
  const [supportError, setSupportError] = useState("");
  const options = entries.filter(({ name, type }) => type === "dir" || (type === "file" && name.toLowerCase().endsWith(".zip")));
  const [name, choose] = useState("");
  const [dialog, setDialog] = useState<Operation>();
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ArchiveResult>();
  const formId = useId();
  const active = options.find((entry) => entry.name === name);
  const capability = support?.[side];
  const disabled = !directory || !ready || !capability?.zip || !active || busy;
  const endpoint: ArchiveRequest["directory"] = side === "local" ? { kind: "local", path: directory } : { kind: "remote", fileSessionId: id, path: directory };

  useEffect(() => {
    const request = new AbortController();
    setSupport(undefined);
    setSupportError("");
    void engine.call<ArchiveSupport>("ssh.archives.support", { fileSessionId: id }, { write: true, signal: request.signal }).then(
      (value) => {
        if (!request.signal.aborted) setSupport(value);
      },
      (error: unknown) => {
        if (!request.signal.aborted) setSupportError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => request.abort();
  }, [engine, id, ready]);

  function confirm(operation: Operation) {
    setError("");
    setOutput(operation === "compress" ? name + ".zip" : name.slice(0, -4) + "-解压");
    setDialog(operation);
  }

  async function run(operation: ArchiveRequest["operation"]) {
    if (disabled) return;
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      const completed = await engine.call<ArchiveResult>(
        "ssh.archives.run",
        {
          directory: endpoint,
          name,
          operation,
          localFileSessionId: id,
          ...(operation === "list" ? {} : { output: output.trim() }),
        } satisfies ArchiveRequest,
        { write: true },
      );
      setResult(completed);
      setDialog(undefined);
      if (operation !== "list") refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={`${device}归档能力`}>
      {supportError && <p role="alert">{supportError}</p>}
      <p role="status">
        {capability && `${capability.zip && ready ? "ZIP 可用" : "ZIP 不可用"} · ${ready ? capability.reason : "原 SSH 连接已断开"}`}
      </p>
      {support && (
        <p>
          {support.otherFormats} {side === "local" && support.nativeSelection}
        </p>
      )}
      <div className="ssh-workspace-controls">
        <div className="ssh-workspace-field">
          <label htmlFor={`${formId}-entry`}>归档项目</label>
          <select id={`${formId}-entry`} value={active?.name ?? ""} disabled={busy} onChange={(event) => choose(event.target.value)}>
            <option value="">选择目录或 ZIP 文件</option>
            {options.map(({ name }) => (
              <option value={name} key={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <Button disabled={disabled || active?.type !== "dir"} onClick={() => confirm("compress")}>
          生成 ZIP
        </Button>
        <Button disabled={disabled || active?.type !== "file"} onClick={() => void run("list")}>
          查看 ZIP 清单
        </Button>
        <Button disabled={disabled || active?.type !== "file"} onClick={() => confirm("extract")}>
          解压至新目录
        </Button>
      </div>
      {!dialog && error && <p role="alert">{error}</p>}
      {result && (
        <section aria-label="ZIP 清单" data-testid="ssh-archive-result">
          <p role="status">{result.extractedPath ? `已解压至 ${result.extractedPath}` : result.archivePath}</p>
          <p>
            ZIP SHA-256 <code>{result.archiveSha256}</code>
          </p>
          <ul>
            {result.entries.map((entry) => (
              <li key={entry.name}>
                {entry.name} {entry.directory ? "目录" : `${entry.size} B`} {entry.sha256 && <code>{entry.sha256}</code>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {dialog && (
        <Dialog
          open
          title={dialog === "compress" ? "生成 ZIP 归档" : "解压 ZIP 到新目录"}
          error={error}
          onClose={() => {
            if (!busy) setDialog(undefined);
          }}
          actions={
            <>
              <Button disabled={busy} onClick={() => setDialog(undefined)}>
                取消
              </Button>
              <Button variant="primary" type="submit" form={formId} disabled={disabled || !output.trim()}>
                确认
              </Button>
            </>
          }
        >
          <p>
            {device} · <code>{directory}</code> · {name}
          </p>
          <form
            id={formId}
            className="ssh-workspace-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void run(dialog);
            }}
          >
            <label>
              {dialog === "compress" ? "新 ZIP 名称" : "新目录名称"} <input required value={output} onChange={(event) => setOutput(event.target.value)} />
            </label>
          </form>
        </Dialog>
      )}
    </section>
  );
}
