import type { LinkPreviewMetadata } from '@inkeep/open-knowledge-core/schemas/api';
import { useOkFetch } from '@/lib/ok-fetch';
import { useEffect, useState } from 'react';
import { loadLinkPreview } from './external-link-preview.ts';

interface UseExternalLinkPreviewParams {
  url: string | null;
  enabled: boolean;
}

export function useExternalLinkPreview({
  url,
  enabled,
}: UseExternalLinkPreviewParams): LinkPreviewMetadata | null {
  const request = useOkFetch();
  const [entry, setEntry] = useState<{ request: typeof fetch; url: string; metadata: LinkPreviewMetadata } | null>(null);

  useEffect(() => {
    if (!enabled || !url) return;

    const controller = new AbortController();
    void loadLinkPreview(url, controller.signal, request).then((result) => {
      if (controller.signal.aborted || !result) return;
      setEntry({ request, url, metadata: result });
    });
    return () => controller.abort();
  }, [url, enabled, request]);

  if (!enabled || !url) return null;
  return entry?.request === request && entry.url === url ? entry.metadata : null;
}
