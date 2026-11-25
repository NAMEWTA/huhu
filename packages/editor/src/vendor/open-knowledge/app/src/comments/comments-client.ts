import { okFetch } from '@/lib/ok-fetch';
import {
  type CommentThreadMeta,
  CommentThreadMetaSchema,
  CompleteBatchSuccessSchema,
  DeleteSuccessSchema,
  type DispatchPayload,
  PrepareBatchSuccessSchema,
  ProblemDetailsSchema,
  QueueSuccessSchema,
} from '@inkeep/open-knowledge-core/schemas/api';

export type { CommentThreadMeta, DispatchPayload };

export type BatchResult<T> =
  | ({ threadId: string; ok: true } & T)
  | { threadId: string; ok: false; error: 'not-found' };

async function request<T>(url: string, init?: RequestInit, fetch = okFetch): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const problem = ProblemDetailsSchema.safeParse(body);
    throw new Error(
      problem.success
        ? (problem.data.title ?? problem.data.detail)
        : `comments request failed (${res.status})`,
    );
  }
  return body as T;
}

function mutate<T>(body: unknown, fetch?: typeof okFetch): Promise<T> {
  return request<T>('/api/comment', { method: 'POST', body: JSON.stringify(body) }, fetch);
}

function parse<T>(
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error('The server returned a response this build cannot read.');
  }
  return parsed.data;
}

function parseThread(value: unknown): CommentThreadMeta {
  const parsed = CommentThreadMetaSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('The server returned a comment thread this build cannot read.');
  }
  return parsed.data;
}

function parseThreads(values: readonly unknown[]): CommentThreadMeta[] {
  const out: CommentThreadMeta[] = [];
  for (const value of values) {
    const parsed = CommentThreadMetaSchema.safeParse(value);
    if (parsed.success) out.push(parsed.data);
    else console.warn('[comments] skipped a thread this build cannot read', parsed.error.issues);
  }
  return out;
}

export async function listThreads(docName?: string, fetch?: typeof okFetch): Promise<CommentThreadMeta[]> {
  const url =
    docName === undefined ? '/api/comments' : `/api/comments?doc=${encodeURIComponent(docName)}`;
  const { threads } = await request<{ threads: unknown[] }>(url, undefined, fetch);
  return parseThreads(threads);
}

// HUHU: identity and revision of the buffer when the selection was captured.
export interface CommentSelectionRevision {
  vaultId: string;
  path: string;
  epoch: number;
  revision: number;
}

export function createThread(input: {
  docName: string;
  quote?: string;
  prefix?: string;
  suffix?: string;
  start?: number;
  end?: number;
  propertyKey?: string;
  propertyPath?: (string | number)[];
  wholeFile?: boolean; // HUHU(P-S4-03)
  selection?: CommentSelectionRevision;
  body: string;
  queue?: boolean;
}, fetch?: typeof okFetch): Promise<CommentThreadMeta> {
  return request<unknown>('/api/comments', {
    method: 'POST',
    body: JSON.stringify(input),
  }, fetch).then(parseThread);
}

// HUHU(P-S4-03)
export function replyThread(threadId: string, body: string, fetch?: typeof okFetch): Promise<CommentThreadMeta> {
  return mutate<unknown>({ action: 'reply', id: threadId, body }, fetch).then(parseThread);
}

export function resolveThread(threadId: string, fetch?: typeof okFetch): Promise<CommentThreadMeta> {
  return mutate<unknown>({ action: 'resolve', id: threadId }, fetch).then(parseThread);
}

export function editComment(threadId: string, body: string, fetch?: typeof okFetch, expectedVersion?: string): Promise<CommentThreadMeta> {
  return mutate<unknown>({ action: 'edit', id: threadId, body, expectedVersion }, fetch).then(parseThread);
}

export function reopenThread(threadId: string, fetch?: typeof okFetch): Promise<CommentThreadMeta> {
  return mutate<unknown>({ action: 'reopen', id: threadId }, fetch).then(parseThread);
}

export function replaceAnchor(
  threadId: string,
  passage: { quote?: string; prefix?: string; suffix?: string; start?: number; end?: number; selection?: CommentSelectionRevision },
  fetch?: typeof okFetch,
): Promise<CommentThreadMeta> {
  return mutate<unknown>({ action: 'replace', id: threadId, ...passage }, fetch).then(parseThread);
}

export function queueThread(
  threadId: string,
  fetch?: typeof okFetch,
): Promise<{ meta: CommentThreadMeta; orphaned: boolean }> {
  return mutate<unknown>({ action: 'queue', id: threadId }, fetch).then((body) =>
    parse(QueueSuccessSchema, body),
  );
}

export function unqueueThread(threadId: string, fetch?: typeof okFetch): Promise<CommentThreadMeta> {
  return mutate<unknown>({ action: 'unqueue', id: threadId }, fetch).then(parseThread);
}

export function deleteThread(threadId: string, fetch?: typeof okFetch): Promise<{ threadId: string }> {
  return request<unknown>(`/api/comment?id=${encodeURIComponent(threadId)}`, {
    method: 'DELETE',
  }, fetch).then((body) => parse(DeleteSuccessSchema, body));
}

export function prepareDispatchBatch(
  ids: readonly string[],
  fetch?: typeof okFetch,
): Promise<{ results: BatchResult<{ meta: CommentThreadMeta; payload: DispatchPayload }>[] }> {
  return mutate<unknown>({ action: 'dispatch-prepare-batch', ids }, fetch).then((body) =>
    parse(PrepareBatchSuccessSchema, body),
  );
}

export function completeDispatchBatch(
  ids: readonly string[],
  fetch?: typeof okFetch,
): Promise<{ results: BatchResult<{ meta: CommentThreadMeta }>[] }> {
  return mutate<unknown>({ action: 'dispatch-complete-batch', ids }, fetch).then((body) =>
    parse(CompleteBatchSuccessSchema, body),
  );
}
