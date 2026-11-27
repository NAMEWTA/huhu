// oxlint-disable ok/no-raw-error-toast -- pre-rule backlog: toasts here show raw error text; delete this line once the file maps each failure to written copy. See https://github.com/inkeep/open-knowledge/blob/main/lint-plugins/ok-rules/README.md#no-raw-error-toast
import { t } from '@lingui/core/macro';
import { createContext, createElement, type ReactNode, use, useEffect, useMemo, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { requestDocPanelTab } from '@/components/doc-panel-events';
import { getVisibleEditorForDoc } from '@/editor/active-editor';
import { subscribeToDocumentsChanged } from '@/lib/documents-events';
import { okFetch, useOkFetch } from '@/lib/ok-fetch';
import type { DispatchPayload } from './comments-client';
import * as api from './comments-client';
import { revealComments } from './reveal-queue';
import type { CommentThread } from './types';

const EMPTY: readonly CommentThread[] = Object.freeze([]);
const EMPTY_QUEUE: readonly string[] = Object.freeze([]);

type LoadStatus = 'idle' | 'pending' | 'ready' | 'failed';
type ThreadSnapshot = Readonly<{ load: LoadStatus; threads: readonly CommentThread[] }>;

interface CommentReadStore {
  snapshot: ThreadSnapshot;
  byDoc: Map<string, ThreadSnapshot>;
  request?: Promise<void>;
  invalidateScheduled: boolean;
  listeners: Set<() => void>;
  queue?: readonly string[];
  selected?: readonly string[];
  deselected: Set<string>;
  dispatching: boolean;
  selectionSources: Map<string, () => api.CommentSelectionRevision | undefined>;
}

export interface CommentSurface {
  reads: CommentReadStore;
  fetch?: typeof okFetch;
}

const EMPTY_SNAPSHOT = { load: 'idle', threads: EMPTY } as const;

function createReadStore(): CommentReadStore {
  return { snapshot: EMPTY_SNAPSHOT, byDoc: new Map(), invalidateScheduled: false, listeners: new Set(), deselected: new Set(), dispatching: false, selectionSources: new Map() };
}

const defaultSurface: CommentSurface = { reads: createReadStore() };
const CommentScopeContext = createContext<CommentSurface | null>(null);
const vaultStores = new Map<string, CommentReadStore>();
const rootStores = new WeakMap<typeof okFetch, CommentReadStore>();
const mountedScopes = new Map<string, Set<CommentSurface>>();
const listeners = new Set<() => void>();

export function CommentScopeProvider({ scope, children }: { scope?: string; children: ReactNode }) {
  const fetch = useOkFetch();
  const surface = useMemo(() => getCommentSurface(scope, fetch), [scope, fetch]);
  useEffect(() => {
    if (scope === undefined) return;
    const available = mountedScopes.get(scope) ?? new Set<CommentSurface>();
    available.add(surface);
    mountedScopes.set(scope, available);
    return () => {
      available.delete(surface);
      if (available.size > 0) return;
      mountedScopes.delete(scope);
      queueMicrotask(() => {
        if (!mountedScopes.has(scope) && vaultStores.get(scope) === surface.reads) vaultStores.delete(scope);
      });
    };
  }, [scope, surface]);
  return createElement(CommentScopeContext, { value: surface }, children);
}

function getCommentSurface(scope: string | undefined, fetch: typeof okFetch): CommentSurface {
  if (scope === undefined) {
    if (fetch === okFetch) return defaultSurface;
    const reads = rootStores.get(fetch) ?? createReadStore();
    rootStores.set(fetch, reads);
    return { reads, fetch };
  }
  return { reads: vaultReadStore(scope), fetch };
}

function vaultReadStore(scope: string): CommentReadStore {
  const reads = vaultStores.get(scope) ?? createReadStore();
  vaultStores.set(scope, reads);
  return reads;
}

export function useCommentSurface(): CommentSurface {
  const surface = use(CommentScopeContext);
  const fetch = useOkFetch();
  return useMemo(() => surface ?? getCommentSurface(undefined, fetch), [surface, fetch]);
}

function notify(): void {
  for (const listener of listeners) listener();
}

function toThread(meta: api.CommentThreadMeta): CommentThread {
  return {
    id: meta.threadId,
    docName: meta.docName,
    target: meta.target,
    anchor:
      meta.anchor === null
        ? null
        : {
            quote: meta.anchor.exact,
            prefix: meta.anchor.prefix,
            suffix: meta.anchor.suffix,
            start: meta.anchor.start,
            end: meta.anchor.end,
            ...(meta.scope === 'body' ? { requireUnique: true } : {}),
          },
    status: meta.state === 'anchored' ? 'open' : meta.state,
    body: meta.latestComment,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt ?? meta.createdAt,
    queued: meta.queued,
    // HUHU(P-S4-03)
    ...(meta.scope !== undefined ? { scope: meta.scope } : {}),
    ...(meta.version !== undefined ? { version: meta.version } : {}),
    ...(meta.messages !== undefined ? { messages: meta.messages } : {}),
  };
}

function updateSnapshot(reads: CommentReadStore, snapshot: ThreadSnapshot): void {
  if (reads.snapshot.threads !== snapshot.threads) {
    delete reads.queue;
    delete reads.selected;
  }
  reads.snapshot = snapshot;
  reads.byDoc.clear();
  notifyReads(reads);
}

function notifyReads(reads: CommentReadStore): void {
  for (const listener of reads.listeners) listener();
  if (reads === defaultSurface.reads) notify();
}

function fetchArgs(surface: CommentSurface): [] | [typeof okFetch] {
  return surface.fetch === undefined ? [] : [surface.fetch];
}

function readDoc(reads: CommentReadStore, docName: string): ThreadSnapshot {
  let snapshot = reads.byDoc.get(docName);
  if (snapshot === undefined) {
    snapshot = {
      load: reads.snapshot.load,
      threads: reads.snapshot.threads.filter((thread) => thread.docName === docName),
    };
    reads.byDoc.set(docName, snapshot);
  }
  return snapshot;
}

export function refresh(_docName?: string, surface = defaultSurface, supersede = false): Promise<void> {
  ensureCc1Subscription();
  const reads = surface.reads;
  if (reads.request !== undefined && !supersede) return reads.request;
  const request = Promise.resolve().then(async () => {
    if (reads.request !== request) return;
    updateSnapshot(reads, { ...reads.snapshot, load: 'pending' });
    try {
      const metas = await (surface.fetch === undefined ? api.listThreads() : api.listThreads(undefined, surface.fetch));
      if (reads.request !== request) return;
      const threads = metas.map(toThread).sort((a, b) => b.createdAt - a.createdAt);
      delete reads.request;
      const ownedOpenThread = reads === defaultSurface.reads || reads.snapshot.threads.some((thread) => thread.id === openThreadId);
      updateSnapshot(reads, { load: 'ready', threads });
      if (ownedOpenThread) standDownIfGone(threads);
    } catch (error) {
      if (reads.request !== request) return;
      delete reads.request;
      updateSnapshot(reads, { ...reads.snapshot, load: 'failed' });
      throw error;
    }
  });
  reads.request = request;
  return request;
}

function standDownIfGone(threads: readonly CommentThread[]): void {
  if (openThreadId === null) return;
  if (threads.some((thread) => thread.id === openThreadId && thread.status === 'open')) return;
  emitOpenThread(null);
}

function invalidate(surface: CommentSurface): void {
  if (surface.reads.invalidateScheduled) return;
  surface.reads.invalidateScheduled = true;
  void refresh(undefined, surface, true).catch(() => undefined);
  queueMicrotask(() => {
    surface.reads.invalidateScheduled = false;
  });
}

export function invalidateCommentScope(scope: string): void {
  const surface = mountedScopes.get(scope)?.values().next().value;
  if (surface !== undefined) invalidate(surface);
}

let cc1Installed = false;
function ensureCc1Subscription(): void {
  if (cc1Installed || typeof window === 'undefined') return;
  cc1Installed = true;
  subscribeToDocumentsChanged((channels) => {
    if (channels.includes('comments')) invalidate(defaultSurface);
  });
}

function ensureLoaded(surface: CommentSurface): void {
  if (surface.reads.snapshot.load !== 'idle') return;
  void refresh(undefined, surface).catch(() => undefined);
}

export function getThreads(docName: string, surface = defaultSurface): readonly CommentThread[] {
  ensureLoaded(surface);
  return readDoc(surface.reads, docName).threads;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function subscribeCommentReads(surface: CommentSurface, listener: () => void): () => void {
  surface.reads.listeners.add(listener);
  return () => {
    surface.reads.listeners.delete(listener);
  };
}

export function useCommentThreadSnapshot(docName: string): ThreadSnapshot {
  const surface = useCommentSurface();
  const subscribeToSurface = useMemo(() => (listener: () => void) => subscribeCommentReads(surface, listener), [surface]);
  useEffect(() => ensureLoaded(surface), [surface]);
  return useSyncExternalStore(
    subscribeToSurface,
    () => readDoc(surface.reads, docName),
    () => EMPTY_SNAPSHOT,
  );
}

export function useCommentThreads(docName: string): readonly CommentThread[] {
  return useCommentThreadSnapshot(docName).threads;
}

export function getAllThreads(): readonly CommentThread[] {
  ensureLoaded(defaultSurface);
  return defaultSurface.reads.snapshot.threads;
}

export function useAllThreads(): readonly CommentThread[] {
  const surface = useCommentSurface();
  const subscribeToSurface = useMemo(() => (listener: () => void) => subscribeCommentReads(surface, listener), [surface]);
  useEffect(() => ensureLoaded(surface), [surface]);
  return useSyncExternalStore(subscribeToSurface, () => surface.reads.snapshot.threads, () => EMPTY);
}

export function getThreadById(threadId: string, surface = defaultSurface): CommentThread | null {
  return surface.reads.snapshot.threads.find((thread) => thread.id === threadId) ?? null;
}

export function registerCommentSelectionSource(docName: string, read: () => api.CommentSelectionRevision | undefined, scope?: string): () => void {
  const { selectionSources } = scope === undefined ? defaultSurface.reads : vaultReadStore(scope);
  selectionSources.set(docName, read);
  return () => {
    if (selectionSources.get(docName) === read) selectionSources.delete(docName);
  };
}

export function captureCommentSelectionRevision(docName: string, surface = defaultSurface): api.CommentSelectionRevision | undefined {
  return surface.reads.selectionSources.get(docName)?.();
}

let navigationRevision = 0;
export function invalidateCommentNavigation(): void {
  navigationRevision++;
  bus.dispatchEvent(new Event(NAVIGATION_INVALIDATED_EVENT));
}

export function subscribeCommentNavigationInvalidated(listener: () => void): () => void {
  bus.addEventListener(NAVIGATION_INVALIDATED_EVENT, listener);
  return () => bus.removeEventListener(NAVIGATION_INVALIDATED_EVENT, listener);
}

export function createThread(args: {
  docName: string;
  quote: string;
  body: string;
  prefix?: string;
  suffix?: string;
  selection?: api.CommentSelectionRevision;
  canReveal?: () => boolean;
  onCreated?: (threadId: string) => void;
}, surface = defaultSurface): void {
  if (hostReadOnly) return;
  const revision = navigationRevision;
  void api
    .createThread({
      docName: args.docName,
      quote: args.quote,
      prefix: args.prefix,
      suffix: args.suffix,
      body: args.body,
      selection: args.selection,
      queue: true,
    }, ...fetchArgs(surface))
    .then((meta) => {
      invalidate(surface);
      if (args.onCreated !== undefined) {
        args.onCreated(meta.threadId);
        return;
      }
      if (revision !== navigationRevision || args.canReveal?.() === false) return;
      revealComments('doc', args.docName);
      emitCommentPosted();
    })
    .catch((err: unknown) => {
      toast.error(
        err instanceof Error && err.message
          ? t`Couldn't add that comment: ${err.message}`
          : t`Couldn't add that comment.`,
      );
    });
}

// HUHU(P-S4-06)：宿主只读（文档只读 / 冲突中）时，批注可查看、可定位，写操作入口隐藏
let hostReadOnly = false;
export function setCommentsReadOnly(next: boolean): void {
  if (hostReadOnly === next) return;
  hostReadOnly = next;
  notify();
}
export function useCommentsReadOnly(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hostReadOnly,
    () => false,
  );
}

// HUHU(P-S4-03)：整篇笔记批注、回复、解决
export function createFileThread(args: { docName: string; body: string; onCreated?: (threadId: string) => void }, surface = defaultSurface): void {
  if (hostReadOnly) return;
  const revision = navigationRevision;
  const editor = getVisibleEditorForDoc(args.docName);
  void api
    .createThread({ docName: args.docName, wholeFile: true, body: args.body }, ...fetchArgs(surface))
    .then((meta) => {
      invalidate(surface);
      args.onCreated?.(meta.threadId);
      if (revision === navigationRevision && getVisibleEditorForDoc(args.docName) === editor) emitCommentPosted();
    })
    .catch((err: unknown) => {
      toast.error(
        err instanceof Error && err.message
          ? t`Couldn't add that comment: ${err.message}`
          : t`Couldn't add that comment.`,
      );
    });
}

export function replyToThread(threadId: string, body: string, surface = defaultSurface): void {
  settle(api.replyThread(threadId, body, ...fetchArgs(surface)), surface, t`Couldn't send that reply.`);
}

export function resolveThread(threadId: string, surface = defaultSurface): void {
  settle(api.resolveThread(threadId, ...fetchArgs(surface)), surface, t`Couldn't resolve that comment.`);
}

export function createPropertyThread(args: {
  docName: string;
  propertyKey: string;
  propertyPath?: (string | number)[];
  quote?: string;
  body: string;
}, surface = defaultSurface): void {
  if (hostReadOnly) return;
  const revision = navigationRevision;
  const editor = getVisibleEditorForDoc(args.docName);
  void api
    .createThread({
      docName: args.docName,
      propertyKey: args.propertyKey,
      propertyPath: args.propertyPath,
      quote: args.quote,
      body: args.body,
      queue: true,
    }, ...fetchArgs(surface))
    .then(() => {
      invalidate(surface);
      if (revision !== navigationRevision || getVisibleEditorForDoc(args.docName) !== editor) return;
      revealComments('doc', args.docName);
      emitCommentPosted();
    })
    .catch((err: unknown) => {
      toast.error(
        err instanceof Error && err.message
          ? t`Couldn't add that comment: ${err.message}`
          : t`Couldn't add that comment.`,
      );
    });
}

function settle(promise: Promise<unknown>, surface: CommentSurface, failed: string): void {
  void promise.then(
    () => {
      invalidate(surface);
    },
    (err: unknown) => {
      toast.error(err instanceof Error && err.message ? `${failed} ${err.message}` : failed);
      invalidate(surface);
    },
  );
}

export async function editComment(threadId: string, body: string, surface = defaultSurface, expectedVersion?: string): Promise<boolean> {
  try {
    const [fetch] = fetchArgs(surface);
    await api.editComment(threadId, body, fetch, expectedVersion);
    invalidate(surface);
    return true;
  } catch (err) {
    const failed = t`Couldn't save that edit.`;
    toast.error(err instanceof Error && err.message ? `${failed} ${err.message}` : failed);
    invalidate(surface);
    return false;
  }
}

export function reopenThread(threadId: string, surface = defaultSurface): void {
  clearDeselection(threadId, surface);
  settle(api.reopenThread(threadId, ...fetchArgs(surface)), surface, t`Couldn't reopen that comment.`);
}

export function deleteThread(threadId: string, surface = defaultSurface): void {
  settle(api.deleteThread(threadId, ...fetchArgs(surface)), surface, t`Couldn't delete that comment.`);
}

export function replaceOrphan(
  threadId: string,
  quote: string,
  context?: { prefix: string; suffix: string; selection?: api.CommentSelectionRevision },
  surface = defaultSurface,
): void {
  settle(
    api.replaceAnchor(threadId, { quote, ...context }, ...fetchArgs(surface)),
    surface,
    t`Couldn't re-place that comment.`,
  );
}

export function getQueue(surface = defaultSurface): readonly string[] {
  ensureLoaded(surface);
  const reads = surface.reads;
  if (reads.queue === undefined) {
    const ids = reads.snapshot.threads
      .filter((t) => t.queued && t.status !== 'resolved')
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((t) => t.id);
    reads.queue = ids.length === 0 ? EMPTY_QUEUE : ids;
  }
  return reads.queue;
}

export function getSelectedQueue(surface = defaultSurface): readonly string[] {
  const queued = getQueue(surface);
  const reads = surface.reads;
  if (reads.selected === undefined) {
    const ids = queued.filter((id) => !reads.deselected.has(id));
    reads.selected = ids.length === 0 ? EMPTY_QUEUE : ids;
  }
  return reads.selected;
}

export function useQueueSelection(): readonly string[] {
  const surface = useCommentSurface();
  const subscribeToSurface = useMemo(() => (listener: () => void) => subscribeCommentReads(surface, listener), [surface]);
  return useSyncExternalStore(subscribeToSurface, () => getSelectedQueue(surface), () => EMPTY_QUEUE);
}

export function getSelectedQueueForDoc(docName: string, surface = defaultSurface): readonly string[] {
  return getSelectedQueue(surface).filter((id) => getThreadById(id, surface)?.docName === docName);
}

function selectionChanged(reads: CommentReadStore): void {
  delete reads.selected;
  notifyReads(reads);
}

function clearDeselection(threadId: string, surface: CommentSurface): void {
  if (surface.reads.deselected.delete(threadId)) selectionChanged(surface.reads);
}

function addToQueue(threadId: string, surface: CommentSurface): void {
  clearDeselection(threadId, surface);
  settle(api.queueThread(threadId, ...fetchArgs(surface)), surface, t`Couldn't mark that comment to send.`);
}

export function removeFromQueue(threadId: string, surface = defaultSurface): void {
  settle(
    api.unqueueThread(threadId, ...fetchArgs(surface)),
    surface,
    t`Couldn't unmark that comment — it's still waiting to send.`,
  );
}

export function toggleSending(threadId: string, surface = defaultSurface): void {
  if (getSelectedQueue(surface).includes(threadId)) removeFromQueue(threadId, surface);
  else addToQueue(threadId, surface);
}

export function setSendingAll(threadIds: readonly string[], sending: boolean, surface = defaultSurface): void {
  const wanted = new Set(getSelectedQueue(surface));
  const ids = threadIds.filter((id) => wanted.has(id) !== sending);
  if (ids.length === 0) return;
  if (sending && surface.reads.deselected.size > 0) {
    for (const id of ids) surface.reads.deselected.delete(id);
    selectionChanged(surface.reads);
  }
  void Promise.all(
    ids.map((id) =>
      (sending ? api.queueThread(id, ...fetchArgs(surface)) : api.unqueueThread(id, ...fetchArgs(surface))).then(
        () => true,
        () => false,
      ),
    ),
  ).then((results) => {
    const failed = results.filter((ok) => !ok).length;
    if (failed > 0) {
      toast.error(t`${failed} of ${ids.length} comments could not be updated.`);
    }
    invalidate(surface);
  });
}

export function toggleQueueSelection(threadId: string, surface = defaultSurface): void {
  const reads = surface.reads;
  if (!reads.deselected.delete(threadId)) reads.deselected.add(threadId);
  selectionChanged(reads);
}

export type ComposeDispatch = (items: readonly BatchPreparedItem[]) => Promise<boolean>;

export interface BatchPreparedItem {
  threadId: string;
  payload: DispatchPayload;
}

export async function dispatchComments({
  compose,
  threadIds,
  resolve = true,
}: {
  compose: ComposeDispatch;
  threadIds?: readonly string[];
  resolve?: boolean;
}, surface = defaultSurface): Promise<string[]> {
  const ids = threadIds ?? getSelectedQueue(surface);
  if (ids.length === 0) return [];
  if (surface.reads.dispatching) return [];
  surface.reads.dispatching = true;
  try {
    return await runDispatch(ids, compose, resolve, surface);
  } finally {
    surface.reads.dispatching = false;
  }
}

async function runDispatch(
  ids: readonly string[],
  compose: ComposeDispatch,
  resolve: boolean,
  surface: CommentSurface,
): Promise<string[]> {
  let prepared: Awaited<ReturnType<typeof api.prepareDispatchBatch>>;
  try {
    prepared = await api.prepareDispatchBatch(ids, ...fetchArgs(surface));
  } catch (err) {
    toast.error(
      err instanceof Error && err.message
        ? t`Couldn't read the comments waiting to send: ${err.message}`
        : t`Couldn't read the comments waiting to send — nothing was sent.`,
    );
    return [];
  }
  notifyReads(surface.reads);
  const items = prepared.results.flatMap((item) =>
    item.ok ? [{ threadId: item.threadId, payload: item.payload }] : [],
  );
  if (items.length === 0) {
    await refresh(undefined, surface, true).catch(() => undefined);
    return [];
  }
  let delivered = false;
  try {
    delivered = await compose(items);
  } catch (err) {
    console.warn('[comments] dispatch compose failed; leaving threads queued', err);
    delivered = false;
  }
  const shipped = delivered ? items.map((item) => item.threadId) : [];
  if (shipped.length > 0 && resolve) {
    await api.completeDispatchBatch(shipped, ...fetchArgs(surface)).catch(() => {
      toast.error(
        t`Sent, but the comments could not be marked done — they're still waiting to send.`,
      );
    });
  }
  await refresh(undefined, surface, true).catch(() => undefined);
  return shipped;
}

const FOCUS_EVENT = 'open-knowledge:comment-focus-thread';
const OPEN_THREAD_EVENT = 'open-knowledge:comment-open-thread';
const NAVIGATION_INVALIDATED_EVENT = 'open-knowledge:comment-navigation-invalidated';
const START_EVENT = 'open-knowledge:comment-start';
const POSTED_EVENT = 'open-knowledge:comment-posted';

const bus: EventTarget = typeof window === 'undefined' ? new EventTarget() : window;

export function emitFocusThread(threadId: string): void {
  bus.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: threadId }));
}

export function subscribeFocusThread(onFocus: (threadId: string) => void): () => void {
  const handler = (event: Event): void => onFocus((event as CustomEvent<string>).detail);
  bus.addEventListener(FOCUS_EVENT, handler);
  return () => bus.removeEventListener(FOCUS_EVENT, handler);
}

let openThreadId: string | null = null;
let pointedThreadId: string | null = null;
let activeThreadId: string | null = null;
const activeListeners = new Set<() => void>();

function recomputeActive(): void {
  const next = pointedThreadId ?? openThreadId;
  if (next === activeThreadId) return;
  activeThreadId = next;
  for (const listener of activeListeners) listener();
}

export function getActiveThread(): string | null {
  return activeThreadId;
}

export function setActiveThread(threadId: string | null): void {
  pointedThreadId = threadId;
  recomputeActive();
}

export function clearActiveThread(threadId: string): void {
  if (pointedThreadId !== threadId) return;
  pointedThreadId = null;
  recomputeActive();
}

export function subscribeActiveThread(listener: () => void): () => void {
  activeListeners.add(listener);
  return () => {
    activeListeners.delete(listener);
  };
}

export function useOpenThread(): string | null {
  return useSyncExternalStore(subscribeOpenThreadChanges, getOpenThread, () => null);
}

function subscribeOpenThreadChanges(listener: () => void): () => void {
  return subscribeOpenThread(() => listener());
}

export function getOpenThread(): string | null {
  return openThreadId;
}

export function emitOpenThread(threadId: string | null): void {
  openThreadId = threadId;
  recomputeActive();
  if (threadId !== null) requestDocPanelTab('comments');
  bus.dispatchEvent(new CustomEvent(OPEN_THREAD_EVENT, { detail: threadId }));
}

export function subscribeOpenThread(onChange: (threadId: string | null) => void): () => void {
  const handler = (event: Event): void => onChange((event as CustomEvent<string | null>).detail);
  bus.addEventListener(OPEN_THREAD_EVENT, handler);
  return () => bus.removeEventListener(OPEN_THREAD_EVENT, handler);
}

export function emitCommentPosted(): void {
  bus.dispatchEvent(new CustomEvent(POSTED_EVENT));
}

export function subscribeCommentPosted(onPosted: () => void): () => void {
  const handler = (): void => onPosted();
  bus.addEventListener(POSTED_EVENT, handler);
  return () => bus.removeEventListener(POSTED_EVENT, handler);
}

export function emitStartComment(): void {
  bus.dispatchEvent(new CustomEvent(START_EVENT));
}

export function subscribeStartComment(onStart: () => void): () => void {
  const handler = (): void => onStart();
  bus.addEventListener(START_EVENT, handler);
  return () => bus.removeEventListener(START_EVENT, handler);
}
