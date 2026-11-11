import { Badge, Button, EmptyState } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { Fragment, useCallback, useEffect, useState } from "react";
import { t } from "./i18n.js";

interface DiffLine {
  kind: "ctx" | "add" | "del";
  oldLine: number | null;
  newLine: number | null;
  text: string;
  noNewline?: boolean;
}
interface Hunk {
  header: string;
  lines: DiffLine[];
}
interface RFile {
  path: string;
  oldPath: string | null;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
  binary: boolean;
  additions: number;
  deletions: number;
  tooLarge: boolean;
  hunks: Hunk[];
}
interface Diff {
  isRepo: boolean;
  hasHead: boolean;
  truncated: boolean;
  files: RFile[];
}
interface Comment {
  id: string;
  path: string;
  side: "old" | "new";
  line: number;
  text: string;
  sentAt: string | null;
  sending?: boolean;
}

/** 变更审查：工作树相对 HEAD 的差异（含未跟踪文件）；在行上加意见；把未发送的意见写回会话终端。 */
export function ReviewPanel({ spaceId, sessionId, running, provider }: { spaceId: string; sessionId: string; running: boolean; provider: string }) {
  const engine = useEngine();
  const [diff, setDiff] = useState<Diff | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ side: "old" | "new"; line: number } | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const c = t.review;

  const load = useCallback(async () => {
    setError(null);
    try {
      setDiff(await engine.call<Diff>("agent.review.diff", { spaceId }));
      setComments(await engine.call<Comment[]>("agent.review.comments", { sessionId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [engine, spaceId, sessionId]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      await fn();
      if (ok) setNote(ok);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error && !diff)
    return (
      <div role="alert" className="hu-overdue" data-testid="review-panel">
        {error}
      </div>
    );
  if (!diff) return <p data-testid="review-panel">…</p>;
  if (!diff.isRepo)
    return (
      <section data-testid="review-panel" aria-label={c.title}>
        <EmptyState title={c.notRepo} />
      </section>
    );
  const file = diff.files.find((f) => f.path === sel) ?? diff.files[0] ?? null;
  const pending = comments.filter((x) => x.sentAt === null && !x.sending);
  const unknown = comments.filter((x) => x.sending);
  const forFile = (side: "old" | "new", line: number) => comments.filter((x) => x.path === file?.path && x.side === side && x.line === line);
  const statusLabel: Record<RFile["status"], string> = c.status;

  return (
    <section data-testid="review-panel" aria-label={c.title}>
      <h2>{c.title}</h2>
      {!diff.hasHead ? <p className="hu-meta">{c.noHead}</p> : null}
      {diff.truncated ? (
        <p className="hu-meta" role="status">
          {c.truncated}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="hu-overdue">
          {error}
        </div>
      ) : null}
      {note ? (
        <div role="status" data-testid="review-note">
          {note}
        </div>
      ) : null}
      <div className="hu-row">
        <Button onClick={() => void load()}>{c.refresh}</Button>
        <Button
          variant="primary"
          disabled={busy || pending.length === 0 || !running}
          data-testid="review-send"
          onClick={() =>
            void act(async () => {
              const r = await engine.call<{ text: string }>("agent.review.send", { sessionId, dryRun: true }, { write: true });
              setPreview(r.text);
            })
          }
        >
          {c.send(pending.length)}
        </Button>
        {!running ? <span className="hu-meta">{c.notRunning}</span> : null}
      </div>
      {preview !== null ? (
        <div role="alertdialog" aria-label={c.confirmTitle} data-testid="review-confirm">
          <p>{c.confirmBody}</p>
          {provider === "shell" ? (
            <p className="hu-overdue" data-testid="review-shell-warning">
              {c.shellWarning}
            </p>
          ) : null}
          <pre data-testid="review-preview" style={{ whiteSpace: "pre-wrap" }}>
            {preview}
          </pre>
          <Button
            variant="primary"
            disabled={busy}
            data-testid="review-confirm-yes"
            onClick={() =>
              void act(async () => {
                const r = await engine.call<{ sent: number }>("agent.review.send", { sessionId }, { write: true });
                setPreview(null);
                setNote(c.sent(r.sent));
              })
            }
          >
            {c.confirmSend}
          </Button>
          <Button onClick={() => setPreview(null)}>{c.cancel}</Button>
        </div>
      ) : null}
      {unknown.length > 0 ? (
        <p className="hu-overdue" role="status" data-testid="review-unknown">
          {c.unknown(unknown.length)}{" "}
          <Button
            disabled={busy || !running}
            onClick={() =>
              void act(async () => {
                await engine.call("agent.review.send", { sessionId, commentIds: unknown.map((x) => x.id) }, { write: true });
              })
            }
          >
            {c.resend}
          </Button>
        </p>
      ) : null}
      {diff.files.length === 0 ? (
        <EmptyState title={c.clean} />
      ) : (
        <div className="hu-row" style={{ alignItems: "flex-start" }}>
          <ul aria-label={c.files} style={{ minWidth: "16rem", maxHeight: "50vh", overflow: "auto", margin: 0, padding: 0, listStyle: "none" }}>
            {diff.files.map((f) => (
              <li key={f.path}>
                <button
                  type="button"
                  className="hu-nav-item"
                  aria-current={f.path === file?.path}
                  data-testid="review-file"
                  onClick={() => {
                    setSel(f.path);
                    setDraft(null);
                  }}
                >
                  <span>{f.path}</span>
                  <Badge tone={f.status === "deleted" ? "danger" : f.status === "modified" ? "warning" : "success"}>{statusLabel[f.status]}</Badge>
                  <span className="hu-meta">{f.binary ? "二进制" : `+${f.additions} −${f.deletions}`}</span>
                </button>
              </li>
            ))}
          </ul>
          <div style={{ flex: 1, minWidth: 0 }}>
            {file ? (
              <>
                <h3 data-testid="review-file-title">{file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}</h3>
                {file.binary ? (
                  <p className="hu-meta">{c.binary}</p>
                ) : file.tooLarge ? (
                  <p className="hu-meta">{c.tooLarge}</p>
                ) : file.hunks.length === 0 ? (
                  <p className="hu-meta">{c.noChanges}</p>
                ) : (
                  file.hunks.map((h, hi) => (
                    <table key={hi} className="hu-diff" aria-label={h.header} style={{ fontFamily: "monospace", width: "100%", borderCollapse: "collapse" }}>
                      <caption className="hu-meta" style={{ textAlign: "left" }}>
                        {h.header}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">{c.oldCol}</th>
                          <th scope="col">{c.newCol}</th>
                          <th scope="col">{c.commentCol}</th>
                          <th scope="col">{c.contentCol}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {h.lines.map((l, li) => {
                          const side: "old" | "new" = l.kind === "del" ? "old" : "new";
                          const n = side === "old" ? l.oldLine : l.newLine;
                          const here = n === null ? [] : forFile(side, n);
                          return (
                            <Fragment key={`${hi}-${li}`}>
                              <tr data-testid="diff-line" data-kind={l.kind} style={{ background: l.kind === "add" ? "var(--success-soft, #e6f6ea)" : l.kind === "del" ? "var(--danger-soft, #fdeaea)" : undefined }}>
                                <td style={{ width: "3.5rem", textAlign: "right", opacity: 0.6 }}>{l.oldLine ?? ""}</td>
                                <td style={{ width: "3.5rem", textAlign: "right", opacity: 0.6 }}>{l.newLine ?? ""}</td>
                                <td style={{ width: "1.5rem" }}>
                                  {n !== null ? (
                                    <button
                                      type="button"
                                      aria-label={c.addAt(file.path, side === "new" ? c.newSide : c.oldSide, n)}
                                      data-testid="diff-comment-btn"
                                      onClick={() => {
                                        setDraft({ side, line: n });
                                        setText("");
                                      }}
                                    >
                                      ＋
                                    </button>
                                  ) : null}
                                </td>
                                <td style={{ whiteSpace: "pre-wrap" }}>
                                  {l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}
                                  {l.text}
                                  {l.noNewline ? <em className="hu-meta"> {c.noNewline}</em> : null}
                                </td>
                              </tr>
                              {here.map((x) => (
                                <tr key={x.id} data-testid="review-comment">
                                  <td colSpan={4}>
                                    <span>
                                      <span aria-hidden="true">💬 </span>
                                      {x.text}
                                    </span>{" "}
                                    <Badge tone={x.sentAt ? "success" : "neutral"}>{x.sentAt ? c.sentBadge : x.sending ? c.sendingBadge : c.pendingBadge}</Badge>
                                    <Button variant="ghost" aria-label={c.deleteComment(x.text)} onClick={() => void act(() => engine.call("agent.review.comment.delete", { sessionId, commentId: x.id }, { write: true }))}>
                                      ×
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                              {draft && draft.side === side && draft.line === n ? (
                                <tr key={`d-${hi}-${li}`}>
                                  <td colSpan={4}>
                                    <form
                                      className="hu-form"
                                      onSubmit={(ev) => {
                                        ev.preventDefault();
                                        if (text.trim())
                                          void act(async () => {
                                            await engine.call("agent.review.comment.add", { sessionId, path: file.path, side, line: n, text }, { write: true });
                                            setDraft(null);
                                            setText("");
                                          });
                                      }}
                                    >
                                      <input
                                        className="hu-input"
                                        autoFocus
                                        aria-label={c.commentLabel}
                                        data-testid="review-comment-input"
                                        value={text}
                                        maxLength={2000}
                                        onChange={(ev) => setText(ev.target.value)}
                                        onKeyDown={(ev) => {
                                          if (ev.key === "Escape") setDraft(null);
                                        }}
                                      />
                                      <Button type="submit" disabled={!text.trim() || busy} data-testid="review-comment-save">
                                        {c.addComment}
                                      </Button>
                                      <Button type="button" onClick={() => setDraft(null)}>
                                        {c.cancel}
                                      </Button>
                                    </form>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  ))
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
