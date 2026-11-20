import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PanelError } from '@/components/ui/panel';
import { ProfilerBoundary } from '@/lib/perf';
import { CommentListPanel } from './CommentListPanel';
import { refresh, useCommentSurface, useCommentThreadSnapshot } from './store';

function CommentsPanelInner({
  docName,
  scopeSwitch,
  onDestinationComplete,
}: {
  docName: string;
  scopeSwitch?: ReactNode;
  onDestinationComplete?: (target: HTMLElement) => void;
}) {
  const { threads, load } = useCommentThreadSnapshot(docName);
  const surface = useCommentSurface();

  useEffect(() => {
    void refresh(docName, surface).catch(() => undefined);
  }, [docName, surface]);

  function retry(): void {
    void refresh(docName, surface).catch(() => undefined);
  }

  return (
    <CommentListPanel
      threads={threads}
      empty={load === 'ready' && <Trans>No comments yet. Select text in the document to add one.</Trans>}
      loadStatus={
        <>
          <PanelError role="status" data-testid="comment-doc-load-status">
            {load === 'failed' && <Trans>Couldn't load comments</Trans>}
          </PanelError>
          {load === 'failed' && (
            <Button type="button" size="sm" variant="outline" className="self-start" onClick={retry}>
              <Trans>Retry</Trans>
            </Button>
          )}
        </>
      }
      testIdPrefix="comment-doc"
      scopeSwitch={scopeSwitch}
      onDestinationComplete={onDestinationComplete}
    />
  );
}

export function CommentsPanel({
  docName,
  scopeSwitch,
  onDestinationComplete,
}: {
  docName: string;
  scopeSwitch?: ReactNode;
  onDestinationComplete?: (target: HTMLElement) => void;
}) {
  return (
    <ProfilerBoundary name="comments-panel">
      <CommentsPanelInner
        key={docName}
        docName={docName}
        scopeSwitch={scopeSwitch}
        onDestinationComplete={onDestinationComplete}
      />
    </ProfilerBoundary>
  );
}
