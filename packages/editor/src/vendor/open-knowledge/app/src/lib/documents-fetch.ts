import { okFetch } from '@/lib/ok-fetch';
export interface DocumentListFetchResult {
  ok: boolean;
  status: number;
  body: unknown;
}

let inflight = new WeakMap<typeof okFetch, Promise<DocumentListFetchResult>>();

export function fetchDocumentListShared(request = okFetch): Promise<DocumentListFetchResult> {
  const existing = inflight.get(request);
  if (existing) return existing;
  const pending = (async (): Promise<DocumentListFetchResult> => {
    const res = await request('/api/documents');
    const body = (await res.json().catch((err: unknown) => {
      console.warn('[documents-fetch] /api/documents response was not valid JSON:', err);
      return null;
    })) as unknown;
    return { ok: res.ok, status: res.status, body };
  })();
  inflight.set(request, pending);
  void pending.then(
    () => {
      if (inflight.get(request) === pending) inflight.delete(request);
    },
    () => {
      if (inflight.get(request) === pending) inflight.delete(request);
    },
  );
  return pending;
}

export function __resetDocumentListInflightForTests(): void {
  inflight = new WeakMap();
}
