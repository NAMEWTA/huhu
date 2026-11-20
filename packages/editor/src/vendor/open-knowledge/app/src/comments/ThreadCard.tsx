import { Trans, useLingui } from '@lingui/react/macro';
import { Check, CheckCheck, MapPin, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { PanelScope } from '@/components/PanelScopeHeader';
import { getPropertiesCollapsed } from '@/components/properties-collapsed-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getVisibleEditorForDoc } from '@/editor/active-editor';
import {
  ComposerMentionInput,
  type ComposerMentionInputHandle,
} from '@/editor/ComposerMentionInput';
import { getEditorView } from '@/editor/utils/get-editor-view';
import { cn } from '@/lib/utils';
import { captureSelectionContext, findQuoteRange } from './anchor-search';
import { propertyAddress, revealThread } from './comment-chips';
import { revealPropertyValueRange } from './property-row-rect';
import { scrollAnchorIntoView } from './scroll-to-anchor';
import {
  captureCommentSelectionRevision,
  clearActiveThread,
  deleteThread,
  editComment,
  emitOpenThread,
  reopenThread,
  replaceOrphan,
  replyToThread,
  resolveThread,
  setActiveThread,
  toggleSending,
  useCommentsReadOnly,
} from './store';
import type { CommentThread } from './types';

const actionRevealClass =
  'size-6 p-0 pointer-events-none opacity-0 transition-opacity duration-150 ease-out-strong text-muted-foreground group-hover/comment-card:pointer-events-auto group-hover/comment-card:opacity-100 group-has-[:focus-visible]/comment-card:pointer-events-auto group-has-[:focus-visible]/comment-card:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100 motion-reduce:transition-none';

function editedAt(at: number, now: number): string {
  const date = new Date(at);
  const today = new Date(now);
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const time = { hour: 'numeric', minute: '2-digit' } as const;
  if (sameDay) return date.toLocaleTimeString(undefined, time);
  if (date.getFullYear() === today.getFullYear()) {
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', ...time });
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...time,
  });
}

export function ThreadCard({
  thread,
  cardRef,
  focused,
  active,
  sending,
  layout,
  onDestinationComplete,
}: {
  thread: CommentThread;
  cardRef: (el: HTMLElement | null) => void;
  focused: boolean;
  active: boolean;
  sending: boolean;
  layout: PanelScope;
  onDestinationComplete?: (target: HTMLElement) => void;
}) {
  const { t } = useLingui();
  const [renderedAt] = useState(() => Date.now());
  const [editing, setEditing] = useState(false);
  const [draftEmpty, setDraftEmpty] = useState(false);
  // HUHU(P-S4-05)：删除确认、回复草稿
  const hostReadOnly = useCommentsReadOnly();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const editFieldRef = useRef<ComposerMentionInputHandle>(null);
  const isOrphaned = thread.status === 'orphaned';
  const isResolved = thread.status === 'resolved';

  const bodyRef = useRef(thread.body);
  useEffect(() => {
    bodyRef.current = thread.body;
  });

  const liveDraftRef = useRef<string | null>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    settledRef.current = false;
    liveDraftRef.current = null;
    editFieldRef.current?.setText(bodyRef.current);
    editFieldRef.current?.focusEnd();
  }, [editing]);

  function settleEdit(raw: string | null) {
    if (settledRef.current) return;
    settledRef.current = true;
    setEditing(false);
    const next = (raw ?? '').trim();
    if (next.length === 0 || next === bodyRef.current) return;
    editComment(thread.id, next);
  }

  function commitEdit() {
    settleEdit(editFieldRef.current?.getContent().instruction ?? null);
  }

  function cancelEdit() {
    settleEdit(null);
  }

  function deleteComment() {
    cancelEdit();
    deleteThread(thread.id);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: settleEdit is deliberately read at cleanup time; keying the effect on it would re-arm the commit on every render.
  useEffect(() => {
    if (!editing) return;
    return () => {
      settleEdit(liveDraftRef.current);
    };
  }, [editing]);

  function reportPassageMissing() {
    toast.error(t`Couldn't find that passage — the text it was on may have changed.`);
  }

  function jumpToQuote(quote: string) {
    if (thread.anchor === null) return;
    if (getVisibleEditorForDoc(thread.docName) === null) {
      revealThread(thread, onDestinationComplete);
      return;
    }
    if (thread.target.kind === 'property') {
      const target = revealPropertyValueRange({
        key: thread.target.key,
        path: thread.target.path,
        quote,
        start: thread.anchor.start,
        end: thread.anchor.end,
      });
      if (!target) {
        if (getPropertiesCollapsed()) revealThread(thread, onDestinationComplete);
        else reportPassageMissing();
        return;
      }
      emitOpenThread(thread.id);
      onDestinationComplete?.(target);
      return;
    }
    const editor = getVisibleEditorForDoc(thread.docName);
    if (!editor) return;
    const range = findQuoteRange(editor.state.doc, quote, thread.anchor);
    if (!range) {
      reportPassageMissing();
      return;
    }
    if (!scrollAnchorIntoView(editor, range, thread.docName)) {
      revealThread(thread, onDestinationComplete);
      return;
    }
    emitOpenThread(thread.id);
    const target = getEditorView(editor)?.dom;
    if (target) onDestinationComplete?.(target);
  }

  function rePlaceOnSelection() {
    const editor = getVisibleEditorForDoc(thread.docName);
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const quote = editor.state.doc.textBetween(from, to, ' ').trim();
    if (quote.length > 0) {
      const selection = captureCommentSelectionRevision(thread.docName);
      replaceOrphan(thread.id, quote, {
        ...captureSelectionContext(editor.state.doc, from, to),
        ...(selection ? { selection } : {}),
      });
    }
  }

  const cardSelects = false; // HUHU(P-S4-05)：点击卡片空白处不再切换“发送”勾选

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- pointer-only affordance — clicking the card's whitespace solos its tick; keyboard/AT users compose the same state from the real controls (the card's checkbox + the footer's master tick). See focus-composer-on-card-pointer.ts for the sibling pattern.
    <article
      ref={cardRef}
      data-testid="comment-thread"
      data-comment-id={thread.id}
      data-state={isResolved ? 'resolved' : isOrphaned ? 'orphaned' : 'anchored'}
      onPointerEnter={() => setActiveThread(thread.id)}
      onPointerLeave={() => clearActiveThread(thread.id)}
      onFocusCapture={() => setActiveThread(thread.id)}
      onBlurCapture={() => clearActiveThread(thread.id)}
      onClick={(event) => {
        if (!cardSelects) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, [role="checkbox"], [role="textbox"], a, input, textarea')) {
          return;
        }
        const selection = window.getSelection();
        if (
          selection !== null &&
          !selection.isCollapsed &&
          selection.anchorNode !== null &&
          event.currentTarget.contains(selection.anchorNode)
        ) {
          return;
        }
        toggleSending(thread.id);
      }}
      className={cn(
        'group/comment-card flex flex-col gap-1.5 transition-[box-shadow,border-color,background-color]',
        'border-b py-3 last:border-b-0',
        layout === 'doc' &&
          'relative isolate before:pointer-events-none before:absolute before:-inset-x-2 before:inset-y-1 before:-z-10 before:rounded-lg before:bg-foreground/5 before:opacity-0 before:transition-opacity before:duration-150 motion-reduce:before:transition-none',
        layout === 'project' && 'px-3',
        cardSelects && 'cursor-pointer',
        isResolved && 'opacity-70',
        active && (layout === 'doc' ? 'before:opacity-100' : 'bg-foreground/5'),
        focused &&
          (layout === 'doc'
            ? 'before:opacity-100 before:ring-2 before:ring-primary'
            : 'ring-2 ring-primary'),
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* HUHU(P-S4-05)：AI 派发的“发送”勾选不接 */}
          {isResolved && (
            <CheckCheck aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span
            className="shrink-0 text-xs text-muted-foreground"
            title={new Date(thread.updatedAt).toLocaleString()}
          >
            {editedAt(thread.updatedAt, renderedAt)}
          </span>
        </div>
        <div className="grid min-w-0 items-center justify-items-end">
          {isResolved && (
            <Badge
              variant="primary"
              className="pointer-events-none col-start-1 row-start-1 opacity-100 transition-opacity duration-150 ease-out-strong group-hover/comment-card:opacity-0 group-has-[:focus-visible]/comment-card:opacity-0 [@media(hover:none)]:opacity-0 motion-reduce:transition-none"
            >
              <Trans>Resolved</Trans>
            </Badge>
          )}
          {!hostReadOnly && (
          <div className="col-start-1 row-start-1 flex items-center gap-1.5">
            {isResolved ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t`Reopen`}
                    className={cn(actionRevealClass, 'hover:text-foreground')}
                    onClick={() => reopenThread(thread.id)}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <Trans>Reopen</Trans>
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t`Resolve this comment`}
                    data-testid="thread-resolve"
                    className={cn(actionRevealClass, 'hover:text-foreground')}
                    onClick={() => resolveThread(thread.id)}
                  >
                    <Check className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <Trans>Resolve this comment</Trans>
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(actionRevealClass, 'hover:text-destructive')}
                  aria-label={t`Delete this comment`}
                  data-testid="thread-delete"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <Trans>Delete this comment</Trans>
              </TooltipContent>
            </Tooltip>
          </div>
          )}
        </div>
      </div>

      {thread.scope === 'file' ? (
        <p className="border-l-2 border-l-muted-foreground/40 px-2 py-0.5 text-sm text-muted-foreground">
          <Trans>Whole note</Trans>
        </p>
      ) : isOrphaned ? (
        <div className="flex flex-col gap-2">
          {thread.anchor !== null && (
            <p
              className="truncate text-sm text-muted-foreground line-through border-l-2 border-l-muted-foreground/40 px-2 py-0.5"
              title={thread.anchor.quote}
            >
              “{thread.anchor.quote}”
            </p>
          )}
        </div>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="w-full">
              <Button
                type="button"
                variant="ghost"
                disabled={thread.anchor === null}
                onClick={() => jumpToQuote(thread.anchor?.quote ?? '')}
                className="h-auto w-full justify-start truncate rounded-none border-l-2 border-l-muted-foreground/40 px-2 py-0.5 text-left text-sm font-normal text-muted-foreground hover:bg-muted/70 disabled:opacity-100"
              >
                <span className="truncate">
                  {thread.target.kind === 'property' ? (
                    <span className="font-mono">
                      {propertyAddress(thread.target.key, thread.target.path)}:
                      {thread.anchor === null ? '' : ` “${thread.anchor.quote}”`}
                    </span>
                  ) : (
                    <>“{thread.anchor?.quote ?? ''}”</>
                  )}
                </span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {thread.anchor === null ? (
              <Trans>This comment is on the whole property</Trans>
            ) : thread.target.kind === 'property' ? (
              <Trans>Jump to selected text in property</Trans>
            ) : (
              <Trans>Jump to the anchored text</Trans>
            )}
          </TooltipContent>
        </Tooltip>
      )}

      {editing ? (
        <div className="flex flex-col gap-1.5">
          <ComposerMentionInput
            ref={editFieldRef}
            mentionRecency={{ currentDocName: thread.docName, recentPaths: [] }}
            ariaLabel={t`Edit this comment`}
            placeholder={t`Edit this comment`}
            attachmentDrop={{ kind: 'refuse' }}
            onEmptyChange={setDraftEmpty}
            onContentChange={() => {
              liveDraftRef.current = editFieldRef.current?.getContent().instruction ?? null;
            }}
            onSubmit={commitEdit}
            onEscape={cancelEdit}
            className="max-h-40 overflow-y-auto rounded-md border px-2 py-1 text-sm subtle-scrollbar bg-background"
          />
          <div className="flex items-center justify-end gap-1.5">
            <Button size="sm" variant="ghost-mono" onClick={cancelEdit}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              size="sm"
              onClick={commitEdit}
              disabled={draftEmpty}
              aria-label={t`Save this comment (Enter)`}
            >
              <Trans>Save</Trans>
            </Button>
          </div>
        </div>
      ) : (
        <p
          data-testid="thread-comment-body"
          className={cn('text-sm text-foreground/90', isResolved && 'line-through')}
        >
          {thread.body}
        </p>
      )}

      {/* HUHU(P-S4-05)：回复（Huhu 的线程是消息列表）、删除确认 */}
      {(thread.messages ?? []).slice(1).map((m) => (
        <p
          key={`${m.at}-${m.author}`}
          data-testid="thread-reply"
          className="border-l-2 pl-2 text-sm text-foreground/90"
        >
          <strong className="font-medium">{m.author}</strong> · {editedAt(Date.parse(m.at), renderedAt)}
          <br />
          {m.text}
        </p>
      ))}
      {!isResolved && !hostReadOnly && (
        <input
          aria-label={t`Reply`}
          placeholder={t`Reply…`}
          data-testid="thread-reply-input"
          value={replyDraft}
          onChange={(event) => setReplyDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            const text = replyDraft.trim();
            if (text.length === 0) return;
            replyToThread(thread.id, text);
            setReplyDraft('');
          }}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        />
      )}
      {confirmDelete && !hostReadOnly && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Trans>Delete this thread? The document text is unchanged.</Trans>
          <Button
            size="sm"
            variant="ghost-mono"
            data-testid="comment-delete-confirm"
            onClick={() => (setConfirmDelete(false), deleteComment())}
          >
            <Trans>Delete</Trans>
          </Button>
          <Button size="sm" variant="ghost-mono" onClick={() => setConfirmDelete(false)}>
            <Trans>Cancel</Trans>
          </Button>
        </div>
      )}

      {isOrphaned && (
        <div className="flex flex-col items-start gap-0.5">
          <p className="text-xs text-muted-foreground" data-testid="comment-orphaned">
            <Trans>The original text was deleted.</Trans>
          </p>
          {!hostReadOnly && (
            <Button
              type="button"
              size="sm"
              variant="link"
              className="h-auto gap-1 p-0 text-xs font-normal"
              onClick={rePlaceOnSelection}
            >
              <MapPin className="size-3" />
              <Trans>Re-place on selected text</Trans>
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
