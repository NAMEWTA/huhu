import { Button, EmptyState } from "@huhu/ui";
import { Check, MessageSquare, RotateCcw, Send } from "lucide-react";
import { useState } from "react";

export interface CommentView {
  id: string;
  target: "body" | "file" | "property";
  property: string | null;
  anchor: { exact: string; start: number; end: number } | null;
  state: "anchored" | "orphaned";
  resolved: boolean;
  messages: { at: string; author: string; text: string }[];
}
export interface CommentActions {
  add(text: string): Promise<void>;
  reply(id: string, text: string): Promise<void>;
  setResolved(id: string, resolved: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  relocate(id: string): Promise<void>;
  jump(c: CommentView): void;
}

/** 本地时间 MM-DD HH:mm（消息时间戳是 UTC，不能直接截取字符串）。 */
const shortDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 详情面板「批注」页签（原型 knowledge.jsx 的批注结构）：待处理计数 + 显示已解决；线程含引用、消息、回复；解决 / 重新打开 / 删除（确认）/ 重新选择位置；底部添加整篇笔记批注。 */
export function CommentsPanel({ comments, active, readOnly, actions }: { comments: CommentView[]; active: string | null; readOnly: boolean; actions: CommentActions }) {
  const [draft, setDraft] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const shown = comments.filter((c) => showResolved || !c.resolved);
  return (
    <section data-testid="comments-panel">
      <div className="row notes-comment-filter">
        <span className="grow small muted">{comments.filter((c) => !c.resolved).length} 条待处理</span>
        <label className="shell-knowledge-inline-check">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          显示已解决
        </label>
      </div>
      {shown.map((c) => {
        const [first, ...replies] = c.messages;
        return (
          <article
            key={c.id}
            className={`notes-comment${c.resolved ? " is-resolved" : ""}`}
            data-testid="comment-thread"
            data-state={c.resolved ? "resolved" : c.state}
            aria-current={c.id === active ? "true" : undefined}
            style={c.id === active ? { borderColor: "var(--accent)" } : undefined}
          >
            <div className="row">
              <span className="notes-avatar">{(first?.author ?? "我").slice(0, 1)}</span>
              <strong className="grow">{first?.author ?? "我"}</strong>
              <span className="small muted">{first ? shortDate(first.at) : ""}</span>
            </div>
            <button type="button" className="notes-text-button" onClick={() => actions.jump(c)} aria-label="定位到批注位置">
              {c.target === "body" ? "定位到正文" : c.target === "property" ? `属性 · ${c.property}` : "整篇笔记"}
            </button>
            {c.target === "body" && c.anchor ? <blockquote>{c.anchor.exact}</blockquote> : null}
            {c.state === "orphaned" && !c.resolved ? (
              <p className="small muted" data-testid="comment-orphaned">
                原文已变化{" "}
                {readOnly ? null : (
                  <button type="button" className="notes-text-button" onClick={() => void actions.relocate(c.id)}>
                    重新选择位置
                  </button>
                )}
              </p>
            ) : null}
            <p>{first?.text}</p>
            {replies.map((m) => (
              <p key={`${m.at}-${m.author}`} className="small">
                <strong>{m.author}</strong> · {shortDate(m.at)}
                <br />
                {m.text}
              </p>
            ))}
            {readOnly ? null : (
              <input
                aria-label="回复批注"
                placeholder="回复…"
                value={replyDraft[c.id] ?? ""}
                onChange={(e) => setReplyDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && (replyDraft[c.id] ?? "").trim()) void actions.reply(c.id, replyDraft[c.id] ?? "").then(() => setReplyDraft((d) => ({ ...d, [c.id]: "" })));
                }}
              />
            )}
            {readOnly ? null : (
              <div className="row">
                <button type="button" className="notes-text-button" onClick={() => void actions.setResolved(c.id, !c.resolved)}>
                  {c.resolved ? <RotateCcw size={13} aria-hidden /> : <Check size={13} aria-hidden />} {c.resolved ? "重新打开" : "标记解决"}
                </button>
                {confirmDelete === c.id ? (
                  <span className="row">
                    <button type="button" className="notes-text-button danger" data-testid="comment-delete-confirm" onClick={() => (setConfirmDelete(null), void actions.remove(c.id))}>
                      确认删除（正文不变）
                    </button>
                    <button type="button" className="notes-text-button" onClick={() => setConfirmDelete(null)}>
                      取消
                    </button>
                  </span>
                ) : (
                  <button type="button" className="notes-text-button danger" onClick={() => setConfirmDelete(c.id)}>
                    删除
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}
      {shown.length === 0 ? <EmptyState icon={MessageSquare} title="没有待处理批注" hint="选中正文后点击工具栏的批注，可以保留引用上下文。" /> : null}
      {readOnly ? null : (
        <form
          className="hu-knowledge-comment-compose"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) void actions.add(draft).then(() => setDraft(""));
          }}
        >
          <textarea className="notes-comment-input" placeholder="写下整篇笔记的批注…" aria-label="整篇笔记批注" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Button type="submit" variant="primary" icon={Send} disabled={!draft.trim()} data-testid="comment-add-file">
            添加批注
          </Button>
        </form>
      )}
    </section>
  );
}
