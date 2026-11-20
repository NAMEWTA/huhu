// 评论宿主入口（S4）：把 vendor 的 OK 评论 UI（面板、线程卡；选区入口 / 高亮 / 边距轨已在 TiptapEditor 内）接到 Huhu 的 `comments.*`。
// 能力经 CommentsPort 注入（packages/editor 不依赖业务模块）；路由见 host/routes/comments.ts。
import { type ReactNode, useLayoutEffect, useState } from "react";
import { CommentsPanel } from "@/comments/CommentsPanel";
import { createFileThread, emitOpenThread, emitStartComment, getOpenThread, invalidateCommentNavigation, registerCommentSelectionSource, setCommentsReadOnly, subscribeCommentPosted, subscribeOpenThread } from "@/comments/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { emitDocumentsChanged } from "@/lib/documents-events";
import { OkRoot } from "./OkRoot";
import type { HostRoutes } from "../host/host-fetch";

export { commentRoutes, toThreadMeta, type CommentRouteDeps, type CommentsPort, type HuhuComment, type PassageInput } from "../host/routes/comments";

/** 工具栏“添加批注”：触发 OK 的选区入口（选区合法性、取消、上下文冻结都在 CommentSelectionAffordance 里）。 */
export function startComment(): void {
  emitStartComment();
}

/** 在编辑器里发表批注之后（宿主据此打开详情栏的批注页）。返回取消订阅。 */
export function onCommentPosted(handler: () => void): () => void {
  return subscribeCommentPosted(handler);
}

/** 正文高亮或边缘按钮请求打开线程时，让宿主显示文档批注页。 */
export function onCommentThreadOpened(handler: () => void): () => void {
  return subscribeOpenThread((threadId) => {
    if (threadId !== null) handler();
  });
}

export function dismissOpenCommentThread(): void {
  invalidateCommentNavigation();
  if (getOpenThread() !== null) emitOpenThread(null);
}

/** 批注数据在宿主侧变化（engine 事件 / 保存后重定位）：让 OK 的 store 重新拉取。 */
export function notifyCommentsChanged(): void {
  emitDocumentsChanged(["comments"]);
}

export { registerCommentSelectionSource };

let readOnlyOwners = 0;

/** 文档只读时，批注可看可定位。编辑面与面板可独立挂载。 */
export function useCommentsReadOnlySync(readOnly: boolean): void {
  useLayoutEffect(() => {
    if (!readOnly) return;
    readOnlyOwners++;
    setCommentsReadOnly(true);
    return () => {
      readOnlyOwners--;
      setCommentsReadOnly(readOnlyOwners > 0);
    };
  }, [readOnly]);
}

function WholeNoteComposer({ docName, label, placeholder, submit }: { docName: string; label: string; placeholder: string; submit: string }): ReactNode {
  const [text, setText] = useState("");
  const send = () => {
    const body = text.trim();
    if (!body) return;
    createFileThread({ docName, body });
    setText("");
  };
  return (
    <form
      className="editor-comments-composer"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <Textarea aria-label={label} placeholder={placeholder} data-testid="comment-whole-note-input" value={text} onChange={(e) => setText(e.target.value)} rows={2} />
      <Button type="submit" size="sm" disabled={text.trim().length === 0} data-testid="comment-whole-note-add" className="editor-comments-submit">
        {submit}
      </Button>
    </form>
  );
}

export interface CommentsPanelHostProps {
  docName: string;
  routes: HostRoutes;
  locale?: string;
  readOnly?: boolean;
  /** 只读时显示在面板底部的原因 */
  readOnlyReason?: string;
  labels: { wholeNote: string; wholeNotePlaceholder: string; add: string };
}

/** 详情栏“批注”页：OK 的评论列表 + 整篇笔记批注输入（Huhu 的 `target:"file"`）。 */
export function CommentsPanelHost({ docName, routes, locale, readOnly = false, readOnlyReason, labels }: CommentsPanelHostProps) {
  return (
    <OkRoot routes={routes} {...(locale ? { locale } : {})} style={{ height: "100%" }}>
      <CommentsReadOnly readOnly={readOnly} />
      <div className="editor-comments-panel" data-testid="comments-panel">
        <div className="editor-comments-list">
          <CommentsPanel docName={docName} />
        </div>
        {readOnly ? (
          <p className="editor-comments-readonly" data-testid="comments-readonly-reason">
            {readOnlyReason}
          </p>
        ) : (
          <WholeNoteComposer docName={docName} label={labels.wholeNote} placeholder={labels.wholeNotePlaceholder} submit={labels.add} />
        )}
      </div>
    </OkRoot>
  );
}

function CommentsReadOnly({ readOnly }: { readOnly: boolean }): null {
  useCommentsReadOnlySync(readOnly);
  return null;
}
