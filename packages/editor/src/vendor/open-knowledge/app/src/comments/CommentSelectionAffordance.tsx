// oxlint-disable ok/no-physical-direction-utility -- pre-rule backlog — physical margin/padding/inset utilities predate the rule; drain by swapping ml/mr → ms/me, pl/pr → ps/pe, left/right → start/end, then deleting this line. See https://github.com/inkeep/open-knowledge/blob/main/lint-plugins/ok-rules/README.md#no-physical-direction-utility

import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';
import { commentQuoteText } from '@inkeep/open-knowledge-core/comments/leaf-text';
import { Trans, useLingui } from '@lingui/react/macro';
import { posToDOMRect } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import type { Node as PMNode } from '@tiptap/pm/model';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getVisibleEditorForDoc } from '@/editor/active-editor';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import {
  ComposerMentionInput,
  type ComposerMentionInputHandle,
} from '@/editor/ComposerMentionInput';
import {
  deriveEditorClipOptions,
  deriveEditorShiftOptions,
  deriveEditorSizeOptions,
  SELECTION_SURFACE_GAP_PX,
} from '@/editor/utils/editor-visible-region';
import { getEditorView } from '@/editor/utils/get-editor-view';
import { focusAwayFromHiddenEditor } from '@/lib/editor-hidden-focus';
import { matchesKeyboardShortcut } from '@/lib/keyboard-shortcuts';
import { useEditorPaneOnScreen } from '@/lib/use-editor-pane-on-screen';
import { cn } from '@/lib/utils';
import { setCommentDraftRange } from './anchor-decorations';
import { captureSelectionContext } from './anchor-search';
import { useCommentsPanelOnScreen } from './comments-panel-visibility';
import { revealComments } from './reveal-queue';
import { selectedSpan } from './selected-span';
import type { CommentSelectionRevision } from './comments-client';
import { captureCommentSelectionRevision, createThread, emitStartComment, subscribeCommentNavigationInvalidated, subscribeStartComment, useCommentsReadOnly, useCommentSurface } from './store';

interface Captured {
  doc: PMNode;
  revision: CommentSelectionRevision | undefined;
  from: number;
  to: number;
  quote: string;
  prefix: string;
  suffix: string;
}

export function CommentSelectionAffordance({
  editor,
  docName,
  shortcutEnabled,
}: {
  editor: Editor;
  docName: string;
  shortcutEnabled: boolean;
}) {
  const { t } = useLingui();
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [empty, setEmpty] = useState(true);
  const commentsOnScreen = useCommentsPanelOnScreen();
  const editorPaneOnScreen = useEditorPaneOnScreen();
  const readOnly = useCommentsReadOnly();
  const surface = useCommentSurface();
  const canCompose = shortcutEnabled && editorPaneOnScreen && !readOnly;
  const lifetime = useRef<object | null>(null);
  useLayoutEffect(() => {
    lifetime.current = canCompose ? {} : null;
    return () => { lifetime.current = null; };
  }, [canCompose, docName]);
  const inputRef = useRef<ComposerMentionInputHandle>(null);
  const floatingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canCompose) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!matchesKeyboardShortcut(event, 'add-comment')) return;
      const target = event.target;
      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (editor.state.selection.empty) return;
      event.preventDefault();
      emitStartComment();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canCompose, editor]);

  useEffect(() => {
    if (canCompose) return;
    const floating = floatingRef.current;
    if (floating?.contains(document.activeElement)) focusAwayFromHiddenEditor();
    setCaptured(null);
    setEmpty(true);
  }, [canCompose]);

  useEffect(() => {
    if (!canCompose) return;
    return subscribeStartComment(() => {
      const { selection, doc } = editor.state;
      if (selection.empty) return;
      const { from, to } = selectedSpan(selection);
      if (to - from < 1) return;
      const quote = commentQuoteText(editor.state.doc, from, to).trim();
      if (quote.length === 0) return;
      const { prefix, suffix } = captureSelectionContext(editor.state.doc, from, to);
      setCaptured({ from, to, quote, prefix, suffix, doc, revision: captureCommentSelectionRevision(docName, surface) });
    });
  }, [canCompose, docName, editor]);

  useLayoutEffect(() => {
    if (!canCompose || captured === null) return;
    setCommentDraftRange(editor, { from: captured.from, to: captured.to });
    return () => setCommentDraftRange(editor, null);
  }, [canCompose, captured, editor]);

  useEffect(() => {
    if (captured === null) return;
    const floating = floatingRef.current;
    if (!floating) return;
    const view = getEditorView(editor);
    if (!view) return;
    const virtualEl = {
      getBoundingClientRect: () => {
        try {
          return posToDOMRect(view, captured.from, captured.to);
        } catch {
          return new DOMRect();
        }
      },
      contextElement: view.dom,
    };
    return autoUpdate(virtualEl, floating, () => {
      computePosition(virtualEl, floating, {
        placement: 'bottom-start',
        strategy: 'fixed',
        middleware: [
          offset(SELECTION_SURFACE_GAP_PX),
          flip(deriveEditorClipOptions(editor)),
          shift(deriveEditorShiftOptions(editor)),
          size(deriveEditorSizeOptions(editor)),
        ],
      })
        .then(({ x, y }) => {
          if (!floating.isConnected) return;
          floating.style.position = 'fixed';
          floating.style.left = `${x}px`;
          floating.style.top = `${y}px`;
        })
        .catch((error: unknown) => {
          if (floating.isConnected) {
            console.warn('[comments] composer computePosition failed', error);
          }
        });
    });
  }, [captured, editor]);

  useEffect(() => {
    if (canCompose && captured !== null) inputRef.current?.focus();
  }, [canCompose, captured]);

  function reset() {
    inputRef.current?.clear();
    setEmpty(true);
    setCaptured(null);
  }

  useEffect(() => {
    if (captured === null) return;
    const onPointerDown = (event: PointerEvent): void => {
      const card = floatingRef.current;
      if (card === null) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (card.contains(target)) return;
      if (target instanceof Element && target.closest('[data-suggestion-popup]') !== null) return;
      reset();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    const unsubscribe = subscribeCommentNavigationInvalidated(reset);
    return () => {
      unsubscribe();
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  });

  function post() {
    if (captured === null) return;
    const body = inputRef.current?.getContent().instruction.trim() ?? '';
    if (body.length === 0) return;
    if (captured.doc !== editor.state.doc) {
      toast.error('文档或选区自发起批注后已改变，请重新选择');
      reset();
      return;
    }
    const postedFrom = lifetime.current;
    createThread({
      docName,
      quote: captured.quote,
      prefix: captured.prefix,
      suffix: captured.suffix,
      ...(captured.revision ? { selection: captured.revision } : {}),
      canReveal: () => postedFrom !== null && lifetime.current === postedFrom && getVisibleEditorForDoc(docName) === editor,
      body,
    }, surface);
    if (!editor.isDestroyed) {
      editor.commands.setTextSelection(Math.min(captured.to, editor.state.doc.content.size));
    }
    reset();
  }

  if (!canCompose || captured === null) return null;

  return createPortal(
    <div
      ref={floatingRef}
      className="z-[60] flex w-80 flex-col gap-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md"
      style={{ position: 'fixed', top: 0, left: 0 }}
      data-testid="comment-composer"
    >
      <ComposerMentionInput
        ref={inputRef}
        ariaLabel={t`Add a comment`}
        mentionRecency={{ currentDocName: docName, recentPaths: [] }}
        placeholder={t`Add a comment`}
        attachmentDrop={{ kind: 'refuse' }}
        onEmptyChange={setEmpty}
        onSubmit={post}
        onEscape={reset}
        className="max-h-40 min-h-16 overflow-y-auto rounded-md border px-2 py-1 text-sm subtle-scrollbar"
      />
      <div
        className={cn(
          'flex items-center gap-1.5',
          commentsOnScreen ? 'justify-end' : 'justify-between',
        )}
      >
        {commentsOnScreen ? null : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => revealComments('doc', docName)}
            className="px-2 text-muted-foreground hover:text-foreground"
          >
            <Trans>View comments</Trans>
          </Button>
        )}
        <Button size="sm" onClick={post} disabled={empty} aria-label={t`Add Comment (Enter)`}>
          <Trans>Add Comment</Trans>
          <span className="ml-0.5 text-[11px] tracking-normal normal-case text-primary-foreground/75">
            ⏎
          </span>
        </Button>
      </div>
    </div>,
    document.body,
  );
}
