import { Button, Dialog } from "@huhu/ui";
import { CapabilityError, useEngine } from "@huhu/workbench";
import { useId, useRef, useState } from "react";
import { EDIT_MAX_BYTES, type FileDocument, type FileSession } from "../shared/files.js";

const editable = (text: string) => text.replace(/\r\n|\r/g, "\n");

export function RemoteTextEditor({ session, initial, onClose }: { session: FileSession; initial: FileDocument; onClose: () => void }) {
  const engine = useEngine();
  const field = useRef<HTMLTextAreaElement>(null);
  const formId = useId();
  const [document, setDocument] = useState(initial);
  const [draft, setDraft] = useState(editable(initial.text));
  const [remote, setRemote] = useState<FileDocument>();
  const [conflict, setConflict] = useState(false);
  const [finding, setFinding] = useState("");
  const [replacement, setReplacement] = useState("");
  const [line, setLine] = useState("");
  const [position, setPosition] = useState(0);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = session.state === "ready";

  function select(start: number, end = start) {
    setPosition(start);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(start, end);
    });
  }

  function find() {
    if (!finding || !field.current) return;
    const next = draft.indexOf(finding, field.current.selectionEnd);
    const found = next >= 0 ? next : draft.indexOf(finding);
    setNote(found < 0 ? "没有匹配正文" : "");
    if (found >= 0) select(found, found + finding.length);
  }

  function replace(start: number, end: number, text: string) {
    setDraft(draft.slice(0, start) + text + draft.slice(end));
    select(start, start + text.length);
  }

  async function save() {
    if (busy || !ready) return;
    if (new TextEncoder().encode(draft).byteLength > EDIT_MAX_BYTES) {
      setError("远端文本编辑上限为 1 MiB");
      return;
    }
    setBusy(true);
    setError("");
    setNote("");
    try {
      const saved = await engine.call<Omit<FileDocument, "text">>(
        "ssh.fileSessions.document.save",
        {
          fileSessionId: session.fileSessionId,
          path: document.path,
          text: draft,
          expectedVersion: document.version,
        },
        { write: true },
      );
      setDocument({ ...saved, text: draft });
      setConflict(false);
      setRemote(undefined);
      setNote("已保存远端文件");
    } catch (error) {
      if (error instanceof CapabilityError && error.code === "VERSION_CONFLICT") setConflict(true);
      if (error instanceof Error) setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function compare() {
    setBusy(true);
    setError("");
    try {
      setRemote(await engine.call<FileDocument>("ssh.fileSessions.document.open", { fileSessionId: session.fileSessionId, path: document.path }));
    } catch (error) {
      if (error instanceof Error) setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      wide
      title="编辑远端文本"
      error={error}
      onClose={() => {
        if (!busy) onClose();
      }}
      actions={
        <>
          <Button disabled={busy} onClick={onClose}>
            关闭编辑
          </Button>
          <Button variant="primary" type="submit" form={formId} formNoValidate loading={busy} disabled={!ready}>
            保存远端文件
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="ssh-workspace-editor"
        aria-label="远端文档编辑"
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <p>
          {session.name} · <code>{document.path}</code> · 权限 <code>{document.mode}</code>
        </p>
        {!ready && <p role="status">原连接已断开，草稿可复制</p>}
        <div className="ssh-workspace-controls">
          <label>
            查找 <input value={finding} onChange={(event) => setFinding(event.target.value)} />
          </label>
          <Button onClick={find} disabled={!finding}>
            下一个匹配
          </Button>
          <label>
            替换为 <input value={replacement} onChange={(event) => setReplacement(event.target.value)} />
          </label>
          <Button
            disabled={!finding || busy}
            onClick={() => {
              const input = field.current;
              if (!input) return;
              if (draft.slice(input.selectionStart, input.selectionEnd) === finding) replace(input.selectionStart, input.selectionEnd, replacement);
              else find();
            }}
          >
            替换当前匹配
          </Button>
          <label>
            行号 <input type="number" min={1} value={line} onChange={(event) => setLine(event.target.value)} />
          </label>
          <Button
            disabled={!line}
            onClick={() => {
              const row = Number(line);
              const lines = draft.split("\n");
              if (!Number.isInteger(row) || row < 1 || row > lines.length) return setNote("行号超出范围");
              setNote("");
              select(lines.slice(0, row - 1).reduce((offset, text) => offset + text.length + 1, 0));
            }}
          >
            跳到行
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              const input = field.current;
              if (!input) return;
              const start = input.selectionStart === 0 ? 0 : draft.lastIndexOf("\n", input.selectionStart - 1) + 1;
              const nextBreak = draft.indexOf("\n", input.selectionEnd);
              const end = nextBreak < 0 ? draft.length : nextBreak;
              replace(
                start,
                end,
                draft
                  .slice(start, end)
                  .split("\n")
                  .map((text) => "  " + text)
                  .join("\n"),
              );
            }}
          >
            缩进选中行
          </Button>
        </div>
        <label>
          正文{" "}
          <textarea
            ref={field}
            className="ssh-file-document"
            spellCheck={false}
            readOnly={busy}
            value={draft}
            onSelect={(event) => setPosition(event.currentTarget.selectionStart)}
            onChange={(event) => {
              setDraft(event.target.value);
              setPosition(event.target.selectionStart);
            }}
          />
        </label>
        <p>
          第 {draft.slice(0, position).split("\n").length} 行，共 {draft.split("\n").length} 行
        </p>
        {note && <p role="status">{note}</p>}
        {conflict && (
          <Button disabled={!ready || busy} onClick={() => void compare()}>
            读取远端新版本
          </Button>
        )}
        {remote && (
          <>
            <label>
              远端新版本 <textarea readOnly className="ssh-file-document" value={editable(remote.text)} />
            </label>
            <Button
              disabled={busy}
              onClick={() => {
                setDocument(remote);
                setDraft(editable(remote.text));
                setRemote(undefined);
                setConflict(false);
                setError("");
                setPosition(0);
              }}
            >
              丢弃草稿并采用远端版本
            </Button>
          </>
        )}
      </form>
    </Dialog>
  );
}
