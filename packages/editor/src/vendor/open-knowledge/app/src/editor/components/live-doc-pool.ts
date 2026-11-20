import { HocuspocusProvider } from '@hocuspocus/provider';
import { createContext, use, useEffect, useState } from 'react';
import * as Y from 'yjs';
import { useCollabUrl } from '@/lib/use-collab-url';
import { useOkFetch } from '@/lib/ok-fetch';
import { isConfigDoc, isSystemDoc } from '../is-system-doc';

interface LiveDocSubscriber {
  onUpdate: () => void;
  onSynced: () => void;
}

export interface LiveDocPoolEntry {
  provider: HocuspocusProvider;
  ySource: Y.Text;
  readonly refcount: number;
  synced: boolean;
  subscribe: (subscriber: LiveDocSubscriber) => () => void;
}

interface InternalPoolEntry extends LiveDocPoolEntry {
  refcount: number;
}

const liveDocPool = new Map<string, InternalPoolEntry>();

export const LIVE_DOC_POOL_MAX = 30;
export const LIVE_DOC_OBSERVE_DEBOUNCE_MS = 150;
export const LIVE_DOC_SYNC_WATCHDOG_MS = 10_000;

export type AcquireLiveDocResult =
  | { ok: true; entry: LiveDocPoolEntry }
  | { ok: false; reason: 'inadmissible' | 'at-capacity' | 'refused' };

export const LiveDocAccessContext = createContext(true);

function refuseLiveDoc(): AcquireLiveDocResult {
  return { ok: false, reason: 'refused' };
}

export function useLiveDocAcquirer(): (collabUrl: string, docName: string) => AcquireLiveDocResult {
  return use(LiveDocAccessContext) ? acquireLiveDocProvider : refuseLiveDoc;
}

export function acquireLiveDocProvider(collabUrl: string, docName: string): AcquireLiveDocResult {
  if (isSystemDoc(docName) || isConfigDoc(docName)) return { ok: false, reason: 'inadmissible' };
  const key = `${collabUrl}|${docName}`;
  const existing = liveDocPool.get(key);
  if (existing) {
    existing.refcount += 1;
    return { ok: true, entry: existing };
  }
  if (liveDocPool.size >= LIVE_DOC_POOL_MAX) {
    console.warn(
      `[LiveDoc] provider pool at capacity (${LIVE_DOC_POOL_MAX}); refusing "${docName}". Live by-reference embeds and mirrors across all visible documents share this pool.`,
    );
    return { ok: false, reason: 'at-capacity' };
  }
  const yDoc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: collabUrl,
    name: docName,
    document: yDoc,
  });
  const subscribers = new Set<LiveDocSubscriber>();
  const entry: InternalPoolEntry = {
    provider,
    ySource: yDoc.getText('source'),
    refcount: 1,
    synced: false,
    subscribe: (subscriber) => {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
  };
  provider.on('synced', () => {
    entry.synced = true;
    for (const sub of subscribers) sub.onSynced();
  });
  entry.ySource.observe(() => {
    for (const sub of subscribers) sub.onUpdate();
  });
  liveDocPool.set(key, entry);
  return { ok: true, entry };
}

export function releaseLiveDocProvider(collabUrl: string, docName: string): void {
  const key = `${collabUrl}|${docName}`;
  const entry = liveDocPool.get(key);
  if (!entry) return;
  entry.refcount -= 1;
  if (entry.refcount <= 0) {
    try {
      entry.provider.destroy();
    } catch (err) {
      console.warn('[LiveDoc] provider.destroy() failed during release', { docName, err });
    }
    liveDocPool.delete(key);
  }
}

export function __liveDocPoolSize(): number {
  return liveDocPool.size;
}

export function disposeLiveDocPool(): void {
  for (const [key, entry] of liveDocPool) {
    try {
      entry.provider.destroy();
    } catch (err) {
      console.warn('[LiveDoc] provider.destroy() failed during dispose', { key, err });
    }
  }
  liveDocPool.clear();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeLiveDocPool();
  });
}

export type LiveDocTextStatus =
  | { kind: 'loading' }
  | { kind: 'ready'; text: string }
  | { kind: 'empty' }
  | { kind: 'unreachable' }
  | { kind: 'at-capacity' };

function reuseIfSame(prev: LiveDocTextStatus, next: LiveDocTextStatus): LiveDocTextStatus {
  if (prev.kind !== next.kind) return next;
  if (prev.kind === 'ready' && next.kind === 'ready' && prev.text !== next.text) return next;
  return prev;
}

function refusedLiveDocTextStatus(
  docName: string,
  reason: Extract<AcquireLiveDocResult, { ok: false }>['reason'],
): LiveDocTextStatus {
  switch (reason) {
    case 'at-capacity':
      return { kind: 'at-capacity' };
    case 'inadmissible':
      return { kind: 'unreachable' };
    case 'refused':
      console.warn('[LiveDoc] live-document access is off here; refused', { docName });
      return { kind: 'loading' };
  }
}

export interface LocalReferenceHost {
  subscribe(docName: string, refresh: () => void): () => void;
  readPdf(path: string, signal: AbortSignal): Promise<Blob>;
}
export const LocalReferenceContext = createContext<LocalReferenceHost | null>(null);

export function useLocalReferenceText(docName: string | null, retryToken = 0): LiveDocTextStatus | null {
  const host = use(LocalReferenceContext);
  const request = useOkFetch();
  const [result, setResult] = useState<{ host: LocalReferenceHost; docName: string; status: LiveDocTextStatus } | null>(null);
  useEffect(() => {
    if (!host || !docName) return;
    let active: AbortController | undefined;
    const deliver = (status: LiveDocTextStatus) => setResult({ host, docName, status });
    const refresh = () => {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      const query = new URLSearchParams({ doc: docName });
      void (async () => {
        try {
          const response = await request(`/api/reference-text?${query}`, {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(LIVE_DOC_SYNC_WATCHDOG_MS)]),
          });
          if (!response.ok) throw new Error('Reference is unavailable');
          const { text } = await response.json() as { text: string };
          if (!controller.signal.aborted) deliver(text ? { kind: 'ready', text } : { kind: 'empty' });
        } catch {
          if (!controller.signal.aborted) deliver({ kind: 'unreachable' });
        }
      })();
    };
    const unsubscribe = host.subscribe(docName, refresh);
    refresh();
    return () => {
      unsubscribe();
      active?.abort();
    };
  }, [host, docName, retryToken, request]);
  if (!host) return null;
  if (!docName) return { kind: 'unreachable' };
  return result?.host === host && result.docName === docName ? result.status : { kind: 'loading' };
}

export function useLiveDocText(docName: string | null, retryToken = 0): LiveDocTextStatus {
  const local = useLocalReferenceText(docName, retryToken);
  const isLocal = local !== null;
  const { collabUrl } = useCollabUrl(!isLocal);
  const acquireLiveDoc = useLiveDocAcquirer();
  const [status, setStatus] = useState<LiveDocTextStatus>({ kind: 'loading' });

  useEffect(() => {
    if (isLocal) return;
    if (!docName) {
      setStatus({ kind: 'unreachable' });
      return;
    }
    if (!collabUrl) {
      setStatus({ kind: 'loading' });
      return;
    }
    setStatus((prev) => reuseIfSame(prev, { kind: 'loading' }));

    const acquired = acquireLiveDoc(collabUrl, docName);
    if (!acquired.ok) {
      setStatus(refusedLiveDocTextStatus(docName, acquired.reason));
      return;
    }
    const { entry } = acquired;

    const recomputeNow = () => {
      const text = entry.ySource.toString();
      const next: LiveDocTextStatus = !text
        ? entry.synced
          ? { kind: 'empty' }
          : { kind: 'loading' }
        : { kind: 'ready', text };
      setStatus((prev) => reuseIfSame(prev, next));
    };

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = entry.subscribe({
      onUpdate: () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          recomputeNow();
        }, LIVE_DOC_OBSERVE_DEBOUNCE_MS);
      },
      onSynced: () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        recomputeNow();
      },
    });

    let released = false;
    const releaseOnce = () => {
      if (released) return;
      released = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      unsubscribe();
      releaseLiveDocProvider(collabUrl, docName);
    };

    const watchdog = setTimeout(() => {
      if (!entry.synced) {
        setStatus({ kind: 'unreachable' });
        releaseOnce();
      }
    }, LIVE_DOC_SYNC_WATCHDOG_MS);

    recomputeNow();

    return () => {
      clearTimeout(watchdog);
      releaseOnce();
    };
  }, [collabUrl, docName, retryToken, acquireLiveDoc, isLocal]);

  return local ?? status;
}
