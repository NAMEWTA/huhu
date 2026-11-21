import { okFetch } from '@/lib/ok-fetch';
import {
  type LinkPreviewMetadata,
  LinkPreviewResponseSchema,
} from '@inkeep/open-knowledge-core/schemas/api';

export const SUCCESS_CACHE_MAX_ENTRIES = 128;

const scopes = new WeakMap<typeof okFetch, {
  successCache: Map<string, LinkPreviewMetadata>;
  inflight: Map<string, Promise<LinkPreviewMetadata | null>>;
}>();

async function requestLinkPreview(
  url: string,
  signal: AbortSignal | undefined,
  request: typeof fetch,
): Promise<LinkPreviewMetadata | null> {
  const res = await request('/api/link-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  });
  if (!res.ok) return null;
  const parsed = LinkPreviewResponseSchema.safeParse(await res.json());
  if (!parsed.success || !parsed.data.ok) return null;
  return parsed.data.metadata;
}

export function loadLinkPreview(
  url: string,
  signal?: AbortSignal,
  request = okFetch,
): Promise<LinkPreviewMetadata | null> {
  let cache = scopes.get(request);
  if (!cache) {
    cache = { successCache: new Map(), inflight: new Map() };
    scopes.set(request, cache);
  }
  const { successCache, inflight } = cache;
  const cached = successCache.get(url);
  if (cached) {
    successCache.delete(url);
    successCache.set(url, cached);
    return Promise.resolve(cached);
  }

  const existing = inflight.get(url);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const metadata = await requestLinkPreview(url, signal, request);
      if (metadata) {
        successCache.set(url, metadata);
        while (successCache.size > SUCCESS_CACHE_MAX_ENTRIES) {
          const oldest = successCache.keys().next().value;
          if (oldest === undefined) break;
          successCache.delete(oldest);
        }
      }
      return metadata;
    } catch (err) {
      if (!(err instanceof Error) || err.name !== 'AbortError') {
        console.warn(
          '[link-preview] external preview fetch failed:',
          err instanceof Error ? err.message : String(err),
        );
      }
      return null;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, promise);
  return promise;
}
