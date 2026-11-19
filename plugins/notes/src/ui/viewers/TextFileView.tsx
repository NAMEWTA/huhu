import { PlainTextEditor, diagnoseJson, isValidUtf8, detectPlainFormat, lineSeparatorFor, type PlainTextEditorHandle } from "@huhu/editor";
import { Banner, Button, Dialog, ReviewDiff } from "@huhu/ui";
import { useCapability, useEngine } from "@huhu/workbench";
import { Braces, Save } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDocumentSession } from "../documents/useDocumentSession.js";
import { FileToolbar } from "./FileChrome.js";
import { v } from "./strings.js";

/**
 * `.txt` / `.json` / 其它文本文件的编辑视图（F01 / F02）。
 * 内容由 `DocumentSession` 持有（保存 / 冲突 / 草稿 / flush 与笔记同一套），编辑器是 `PlainTextEditor`（CM6，不绑 Y）；
 * JSON 的格式化只在点按钮时发生，保存路径永不重写内容。读取前先按字节确认是有效 UTF-8 文本，否则只读元信息，不会被当 UTF-8 覆盖。
 */
type Probe = { state: "checking" } | { state: "ok" } | { state: "binary" } | { state: "encoding" } | { state: "error"; message: string };

export function TextFileView({ path, language, toolbarLead, sidecar }: { path: string; language: "text" | "json"; toolbarLead?: ReactNode | undefined; sidecar?: ((text: string) => ReactNode) | undefined }) {
  const engine = useEngine();
  const [probe, setProbe] = useState<Probe>({ state: "checking" });
  useEffect(() => {
    let alive = true;
    setProbe({ state: "checking" });
    engine
      .call<{ base64: string }>("vault.readBinary", { path })
      .then((r) => {
        if (!alive) return;
        const bin = atob(r.base64);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        if (bytes.includes(0)) return setProbe({ state: "binary" });
        setProbe(isValidUtf8(bytes) ? { state: "ok" } : { state: "encoding" });
      })
      .catch((e: unknown) => alive && setProbe({ state: "error", message: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [engine, path]);

  if (probe.state === "ok") return <TextEditorBody path={path} language={language} toolbarLead={toolbarLead} sidecar={sidecar} />;
  return (
    <>
      <FileToolbar path={path}>{toolbarLead}</FileToolbar>
      <div className="hu-empty-state" style={{ margin: "auto" }} data-testid="file-unreadable">
        {probe.state === "checking" ? <p className="hu-hint-text">{v.reading}</p> : null}
        {probe.state === "binary" ? <p className="hu-hint-text">{v.binary}</p> : null}
        {probe.state === "encoding" ? (
          <p className="hu-field-error" data-testid="file-encoding-unsupported">
            {v.encodingUnsupported}
          </p>
        ) : null}
        {probe.state === "error" ? <p className="hu-field-error">{probe.message}</p> : null}
      </div>
    </>
  );
}

function TextEditorBody({ path, language, toolbarLead, sidecar }: { path: string; language: "text" | "json"; toolbarLead?: ReactNode | undefined; sidecar?: ((text: string) => ReactNode) | undefined }) {
  const settings = useCapability<{ editor: { autosave: boolean } }>("settings.get", {});
  const autosave = settings.data?.editor.autosave !== false;
  const { session, snap } = useDocumentSession(path, autosave);
  const editor = useRef<PlainTextEditorHandle>(null);
  const [note, setNote] = useState<string | null>(null);
  const [diffOf, setDiffOf] = useState<string | null>(null);
  const [confirmReload, setConfirmReload] = useState(false);
  const loaded = snap.loaded;
  const text = snap.text;
  const state = snap.state === "error" ? "dirty" : snap.state;

  // 结构诊断：JSON 才有；空文件不报错
  const diag = language === "json" && loaded && text.trim() !== "" ? diagnoseJson(text) : null;
  const eol = lineSeparatorFor(detectPlainFormat(text).eol);
  const readOnly = !eol.editable;

  useEffect(() => setNote(null), [path]);

  const onChange = (next: string) => {
    if (!session || next === session.currentText()) return;
    session.setText(next, "plain");
  };
  const save = () => (session ? session.save() : Promise.resolve(false));
  const format = () => {
    const r = editor.current?.formatJson();
    if (!r) return;
    setNote(r.ok ? v.formatDone : v.formatFailed(r.message));
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }} data-testid="file-text-view">
      <FileToolbar path={path}>
        {toolbarLead}
        {language === "json" ? (
          <Button icon={Braces} title={v.formatHint} data-testid="file-format-json" disabled={!loaded || readOnly || diag?.ok === false} onClick={format}>
            {v.format}
          </Button>
        ) : null}
      </FileToolbar>
      {state === "conflict" && session ? (
        <Banner
          tone="danger"
          action={
            confirmReload ? (
              <>
                <Button variant="danger" onClick={() => (setConfirmReload(false), void session.load())}>
                  {v.reload}
                </Button>
                <Button onClick={() => setConfirmReload(false)}>取消</Button>
              </>
            ) : (
              <>
                {session.currentText() !== session.lastSavedText() ? (
                  <>
                    <Button variant="primary" data-testid="note-merge" onClick={() => void session.merge()}>
                      {v.merge}
                    </Button>
                    <Button data-testid="note-view-diff" onClick={() => void session.readDisk().then(setDiffOf)}>
                      {v.viewDiff}
                    </Button>
                    <Button data-testid="note-keep-mine" onClick={() => void session.keepMine()}>
                      {v.keepMine}
                    </Button>
                  </>
                ) : null}
                <Button onClick={() => (session.currentText() === session.lastSavedText() ? void session.load() : setConfirmReload(true))}>{v.reload}</Button>
              </>
            )
          }
        >
          {v.conflict}
        </Banner>
      ) : null}
      {diffOf !== null ? (
        <Dialog open wide title={v.diffTitle} onClose={() => setDiffOf(null)} testId="note-diff-dialog" actions={<Button onClick={() => setDiffOf(null)}>{v.close}</Button>}>
          <ReviewDiff before={diffOf} after={session?.currentText() ?? ""} path={path} />
        </Dialog>
      ) : null}
      {snap.draft ? (
        <Banner
          tone="blue"
          action={
            <>
              <Button variant="primary" data-testid="note-draft-restore" onClick={() => session?.restoreDraft()}>
                {v.restoreDraft}
              </Button>
              <Button onClick={() => session?.discardDraft()}>{v.discardDraft}</Button>
            </>
          }
        >
          {v.draftFound(snap.draft.savedAt.replace("T", " ").slice(0, 16))}
        </Banner>
      ) : null}
      {snap.flushError ? <Banner tone="danger">{v.saveFailed(snap.flushError)}</Banner> : null}
      {readOnly ? (
        <p className="hu-hint-text" role="status" data-testid="file-readonly-note" style={{ margin: "6px 12px" }}>
          {v.mixedEol}
        </p>
      ) : null}
      {diag ? (
        <p className={diag.ok ? "hu-hint-text" : "hu-field-error"} role="status" data-testid="file-diagnostic" style={{ margin: "6px 12px" }}>
          {diag.ok ? v.jsonOk : v.jsonError(diag.message)}
        </p>
      ) : null}
      {note ? (
        <p className="hu-hint-text" role="status" data-testid="file-format-note" style={{ margin: "0 12px 6px" }}>
          {note}
        </p>
      ) : null}
      {sidecar && loaded ? sidecar(text) : null}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {loaded ? (
          <PlainTextEditor ref={editor} documentId={`file:${path}`} value={text} language={language} readOnly={readOnly} ariaLabel={v.textLabel(path.split("/").at(-1) ?? path)} onChange={onChange} />
        ) : (
          <p className="hu-hint-text" style={{ margin: 12 }}>
            {v.reading}
          </p>
        )}
      </div>
      <div className="notes-document-status">
        <span className={`notes-save-dot${state === "saved" ? "" : " notes-unsaved"}`} />
        <span data-testid="save-state">{state === "saved" ? v.saved : state === "saving" ? v.saving : state === "conflict" ? v.conflictState : v.dirty}</span>
        <span className="hu-flex-fill" />
        {!autosave ? (
          <Button variant="primary" icon={Save} disabled={state !== "dirty"} data-testid="note-save" onClick={() => void save()}>
            {v.save}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
