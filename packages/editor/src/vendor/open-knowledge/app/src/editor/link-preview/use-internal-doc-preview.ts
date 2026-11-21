import { useOkFetch } from '@/lib/ok-fetch';
import { useEffect, useState } from 'react';
import { usePageList } from '../../components/PageListContext';
import {
  deriveContentFields,
  deriveFolderPath,
  type InternalDocContentFields,
  type InternalDocPreview,
  loadBacklinkCount,
  loadDocContent,
} from './internal-doc-preview.ts';

interface UseInternalDocPreviewParams {
  docName: string | null;
  anchor: string | null;
  enabled: boolean;
}

export function useInternalDocPreview({
  docName,
  anchor,
  enabled,
}: UseInternalDocPreviewParams): InternalDocPreview | null {
  const request = useOkFetch();
  const { pageTitles, pageMeta } = usePageList();
  const [contentEntry, setContentEntry] = useState<{
    request: typeof fetch;
    docName: string;
    anchor: string | null;
    fields: InternalDocContentFields;
  } | null>(null);
  const [backlinkEntry, setBacklinkEntry] = useState<{
    request: typeof fetch;
    docName: string;
    count: number;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !docName) return;

    let cancelled = false;
    void loadDocContent(docName, request).then((content) => {
      if (cancelled || content === null) return;
      setContentEntry({ request, docName, anchor, fields: deriveContentFields(content, anchor) });
    });
    void loadBacklinkCount(docName, request).then((count) => {
      if (cancelled || count === null) return;
      setBacklinkEntry({ request, docName, count });
    });
    return () => {
      cancelled = true;
    };
  }, [docName, anchor, enabled, request]);

  if (!enabled || !docName) return null;

  const contentFields =
    contentEntry?.request === request && contentEntry.docName === docName && contentEntry.anchor === anchor
      ? contentEntry.fields
      : null;
  const backlinkCount =
    backlinkEntry?.request === request && backlinkEntry.docName === docName ? backlinkEntry.count : null;

  return {
    docName,
    title: pageTitles.get(docName) ?? docName,
    folderPath: deriveFolderPath(docName),
    lastEditedAt: pageMeta.get(docName)?.modified ?? null,
    tags: contentFields?.tags,
    excerpt: contentFields?.excerpt,
    backlinkCount: backlinkCount ?? undefined,
  };
}
