import { z } from "zod";
import { IMAP_WINDOW, MAX_IMAP_SOURCE_BYTES } from "./imap-message.js";

export const graphMailEndpoint = "https://graph.microsoft.com/v1.0/me";
export const graphNativeId = z.string().regex(/^[A-Za-z0-9_+=/-]{1,1024}$/);
export const graphDeltaLink = z.string().min(1).max(16_384);
export const graphRecovery = z.literal("delta-expired");
type GraphProblem = "graph-api-auth" | "graph-api-permission" | "graph-api-unavailable";

export class GraphMailError extends Error {
  constructor(readonly reason: GraphProblem) {
    super(reason);
  }
}

const deltaItem = z.object({
  id: graphNativeId,
  "@removed": z.object({}).optional(),
  receivedDateTime: z.iso.datetime({ offset: true }).optional(),
  parentFolderId: graphNativeId.optional(),
  isRead: z.boolean().optional(),
  isDraft: z.boolean().optional(),
});
const deltaPage = z.object({ value: z.array(deltaItem).max(1000), "@odata.nextLink": graphDeltaLink.optional(), "@odata.deltaLink": graphDeltaLink.optional() });
const fullItem = deltaItem.required({ receivedDateTime: true, parentFolderId: true, isRead: true, isDraft: true });
const inboxPage = z.object({
  value: z.array(fullItem).max(1000),
  "@odata.nextLink": graphDeltaLink.optional(),
});
const graphError = z.object({ error: z.object({ code: z.string().regex(/^[A-Za-z0-9_.-]{1,120}$/) }) });
type DeltaItem = z.infer<typeof deltaItem>;
const deltaChange = deltaItem.extend({ verify: z.literal(true).optional() });
type DeltaChange = z.infer<typeof deltaChange>;
const maxPages = 20;
const evidenceVersion = 4;
const roundProgressFields = {
  initial: z.boolean(),
  recovery: graphRecovery.optional(),
  changes: z.array(deltaChange).max(4 * IMAP_WINDOW),
  discardedRemovalFrom: graphNativeId.optional(),
  mergeVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(evidenceVersion)]).optional(),
};
const inboxProgress = z.strictObject({
  next: graphDeltaLink.nullable(),
  visited: z.array(graphDeltaLink).max(maxPages),
  entries: z.array(fullItem).max(IMAP_WINDOW),
  remaining: z.array(fullItem).max(1000),
});
type InboxProgress = z.infer<typeof inboxProgress>;
export const graphProgress = z.union([
  z.strictObject({ ...roundProgressFields, next: graphDeltaLink, reconcile: z.boolean().optional() }),
  z.strictObject({
    ...roundProgressFields,
    cursor: graphDeltaLink,
    reconcile: z.boolean(),
    verified: z.array(deltaItem).max(4 * IMAP_WINDOW),
    inbox: inboxProgress.optional(),
  }),
]);
export const graphPending = z
  .array(
    z.strictObject({
      id: graphNativeId,
      seen: z.boolean(),
      receivedAt: z.iso.datetime(),
      arrival: z.boolean(),
      confirmed: z.literal(true).optional(),
    }),
  )
  .max(IMAP_WINDOW);
type PendingSource = z.infer<typeof graphPending>[number];
export type GraphRow = { id: string; seen: boolean; added?: true; confirmed?: true | undefined; bytes?: Buffer; receivedAt?: string } | { id: string; removed: true };
type NoticeEvidence = { arrived: boolean; seen: boolean };
type IdentityEvidence = { historicalIds: ReadonlySet<string>; removedIds: ReadonlySet<string> };
export type GraphPage = IdentityEvidence & {
  cursor: string;
  initial: boolean;
  recovery?: z.infer<typeof graphRecovery>;
  rows: GraphRow[];
  pending: PendingSource[];
  awaitingDelta: ReadonlySet<string>;
  arrivalWatermark: string | undefined;
  noticeEvidence: ReadonlyMap<string, NoticeEvidence>;
};
export type GraphSyncInput = {
  cursor: string | null;
  cached: ReadonlyMap<string, { seen: boolean }>;
  recovery?: z.infer<typeof graphRecovery> | undefined;
  progress?: z.infer<typeof graphProgress> | undefined;
  pending?: PendingSource[] | undefined;
  awaitingDelta?: string[] | undefined;
  arrivalWatermark?: string | undefined;
};
type GraphCheckpoint = IdentityEvidence & { progress: z.infer<typeof graphProgress> };
type DeltaBatch = Pick<GraphPage, "cursor" | "initial" | "recovery"> & {
  changes: Map<string, DeltaChange>;
  reconcile: boolean;
  discardedRemovalFrom: string | undefined;
};

const inboxPath = "mailFolders/inbox/messages";
const select = "id,receivedDateTime,isRead,isDraft,parentFolderId";
const metadata = { $select: select, $orderby: "receivedDateTime desc" };
const receivedTime = (item: DeltaItem) => (item.receivedDateTime ? Date.parse(item.receivedDateTime) : -Infinity);
const pageBytes = 2 * 1024 * 1024;
const maxSourceBytes = 12 * 1024 * 1024;

class GraphResponseTooLarge extends Error {}
class GraphDeltaExpired extends Error {}

export async function graphRequest(url: URL | string, token: string, signal: AbortSignal, init?: { method: "POST"; body: string; headers: Record<string, string> }) {
  return fetch(url, {
    ...init,
    redirect: "error",
    headers: { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId"', ...init?.headers },
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });
}

async function readBytes(response: Response, limit: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) throw new GraphMailError("graph-api-unavailable");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > limit) throw new GraphResponseTooLarge();
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function graphErrorCode(response: Response) {
  try {
    const body = await readBytes(response, 32 * 1024);
    return graphError.parse(JSON.parse(body.toString("utf8"))).error.code;
  } catch {
    return undefined;
  }
}

export async function probeGraphInbox(endpoint: string, token: string, signal: AbortSignal) {
  const url = new URL(`${endpoint}/mailFolders/inbox`);
  url.searchParams.set("$select", "id");
  const response = await graphRequest(url, token, signal);
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 401) throw new GraphMailError("graph-api-auth");
    if (response.status === 403) throw new GraphMailError("graph-api-permission");
    throw new GraphMailError("graph-api-unavailable");
  }
  return z.object({ id: graphNativeId }).parse(JSON.parse((await readBytes(response, 32 * 1024)).toString("utf8"))).id;
}

export async function readGraphDelta(endpoint: string, token: string, inbox: string, previous: GraphSyncInput | undefined, request: AbortSignal): Promise<GraphPage | GraphCheckpoint> {
  const removedIds = new Set<string>();
  const historicalIds = new Set<string>();
  const stopAfter = Date.now() + 50_000;
  const signal = AbortSignal.any([request, AbortSignal.timeout(75_000)]);
  const initial = new URL(`${endpoint}/${inboxPath}/delta`);
  const root = new URL(endpoint).pathname.toLowerCase();
  initial.search = new URLSearchParams({ ...metadata, $top: "100" }).toString();
  const isThisInbox = (id: string) => id === inbox || id.toLowerCase() === "inbox";

  function inboxLink(link: string, delta = true) {
    const url = new URL(link);
    const collection = /^\/mailfolders(?:\/([^/]+)|\((?:'|%27)([^/]+?)(?:'|%27)\))\/messages(\/delta)?$/i.exec(url.pathname.slice(root.length));
    const folder = collection?.[1] ?? collection?.[2];
    if (url.origin !== initial.origin || !url.pathname.toLowerCase().startsWith(root) || !folder || Boolean(collection?.[3]) !== delta || !isThisInbox(decodeURIComponent(folder)) || url.username || url.password || url.hash)
      throw new GraphMailError("graph-api-unavailable");
    return link;
  }

  async function get(url: URL | string, delta: boolean) {
    const response = await graphRequest(url, token, signal);
    if (response.ok) return response;
    if (delta && response.status === 410) {
      await response.body?.cancel().catch(() => undefined);
      throw new GraphDeltaExpired();
    }
    if (delta && (response.status === 400 || response.status === 404)) {
      const code = await graphErrorCode(response);
      if (code?.toLowerCase() === "syncstatenotfound") throw new GraphDeltaExpired();
    } else await response.body?.cancel().catch(() => undefined);
    if (!delta && response.status === 404) return null;
    if (response.status === 401) throw new GraphMailError("graph-api-auth");
    if (response.status === 403) throw new GraphMailError("graph-api-permission");
    throw new GraphMailError("graph-api-unavailable");
  }

  const removed = (item: DeltaItem) => Boolean(item["@removed"] || item.isDraft || (item.parentFolderId && !isThisInbox(item.parentFolderId)));

  function mergeChange(old: DeltaChange | undefined, item: DeltaItem): DeltaChange {
    if (!old) return item;
    const wasRemoved = removed(old);
    const isRemoved = removed(item);
    if (wasRemoved !== isRemoved) return { ...(wasRemoved ? item : old), verify: true };
    if (isRemoved) return old;
    const conflictingRead = old.isRead !== undefined && item.isRead !== undefined && old.isRead !== item.isRead;
    const conflictingDate = old.receivedDateTime && item.receivedDateTime && receivedTime(old) !== receivedTime(item);
    // Delta pages can replay an older version. Merge complementary fields and verify disagreements by ID.
    return { ...old, ...item, ...((old.verify || conflictingRead || conflictingDate) && { verify: true }) };
  }

  async function lookupMessage(id: string) {
    const url = new URL(`${endpoint}/messages/${encodeURIComponent(id)}`);
    url.searchParams.set("$select", select);
    const response = await get(url, false);
    if (!response) return undefined;
    const item = fullItem.parse(JSON.parse((await readBytes(response, pageBytes)).toString("utf8")));
    if (item.id !== id) throw new GraphMailError("graph-api-unavailable");
    return item;
  }

  async function inboxWindow(excluded: ReadonlySet<string>, needsLookup: (id: string) => boolean, previous?: InboxProgress): Promise<{ entries: Map<string, DeltaItem> } | { progress: InboxProgress }> {
    const start = new URL(`${endpoint}/${inboxPath}`);
    start.search = new URLSearchParams({ ...metadata, $top: String(IMAP_WINDOW) }).toString();
    const entries = new Map(previous?.entries.map((item) => [item.id, item] as const));
    const visited = new Set(previous?.visited.map((link) => inboxLink(link, false)));
    let link = previous ? previous.next : start.href;
    let remaining = previous?.remaining ?? [];
    const suspend = (items: InboxProgress["remaining"]) => ({
      progress: { next: link, visited: [...visited], entries: [...entries.values()], remaining: items },
    });
    for (;;) {
      for (const [index, item] of remaining.entries()) {
        if (excluded.has(item.id) || removed(item)) continue;
        if (needsLookup(item.id)) {
          if (entries.has(item.id)) continue;
          if (Date.now() >= stopAfter) return suspend(remaining.slice(index));
          const verified = await lookupMessage(item.id);
          if (!verified || removed(verified)) continue;
          entries.set(item.id, verified);
        } else entries.set(item.id, item);
        if (entries.size === IMAP_WINDOW) return { entries };
      }
      if (!link) return { entries };
      link = inboxLink(link, false);
      if (visited.has(link) || visited.size === maxPages) throw new GraphMailError("graph-api-unavailable");
      if (Date.now() >= stopAfter) return suspend([]);
      visited.add(link);
      const response = await get(link, false);
      if (!response) throw new GraphMailError("graph-api-unavailable");
      const data = inboxPage.parse(JSON.parse((await readBytes(response, pageBytes)).toString("utf8")));
      remaining = data.value;
      link = data["@odata.nextLink"] ?? null;
    }
  }

  async function pages(input: GraphSyncInput | undefined, recovery?: z.infer<typeof graphRecovery>): Promise<DeltaBatch | GraphCheckpoint> {
    // Replay older checkpoints from the committed cursor to recover trimmed identity evidence.
    const stored = input?.progress;
    const progress = stored && "next" in stored && stored.mergeVersion === evidenceVersion ? stored : undefined;
    const completeScan = progress?.initial ?? !input?.cursor;
    const reason = progress?.recovery ?? recovery;
    const cached = completeScan ? undefined : input?.cached;
    const changes = new Map<string, DeltaChange>(progress?.changes.map((item) => [item.id, item]));
    let reconcile = progress?.reconcile ?? false;
    let discardedRemovalFrom = progress?.discardedRemovalFrom;
    const visited = new Set<string>();
    let link = inboxLink(progress?.next ?? input?.cursor ?? initial.href);
    for (let page = 0; page < maxPages && (page === 0 || Date.now() < stopAfter); page++) {
      if (visited.has(link)) throw new GraphMailError("graph-api-unavailable");
      visited.add(link);
      const response = await get(link, true);
      if (!response) throw new GraphMailError("graph-api-unavailable");
      const data = deltaPage.parse(JSON.parse((await readBytes(response, pageBytes)).toString("utf8")));
      for (const item of data.value) {
        if (removed(item)) {
          // Identity evidence travels with the checkpoint even if this tombstone does not survive compaction.
          removedIds.add(item.id);
          reconcile = true;
        } else if (completeScan) {
          historicalIds.add(item.id);
        }
        changes.set(item.id, mergeChange(changes.get(item.id), item));
      }
      // Keep one additional window of candidate evidence in case later removals expose those arrivals.
      const candidates = [...changes.values()].filter((item) => !cached?.has(item.id) && !removed(item)).sort((a, b) => receivedTime(b) - receivedTime(a) || a.id.localeCompare(b.id));
      if (candidates.length > IMAP_WINDOW) reconcile = true;
      const tombstones = [...changes.values()].filter((item) => !cached?.has(item.id) && removed(item)).sort((a, b) => (a.id === b.id ? 0 : a.id < b.id ? -1 : 1));
      // IDs at or above this bound may have lost an earlier removal during compaction.
      const firstDiscarded = tombstones[IMAP_WINDOW]?.id;
      if (firstDiscarded && (!discardedRemovalFrom || firstDiscarded < discardedRemovalFrom)) {
        discardedRemovalFrom = firstDiscarded;
      }
      const retained = new Set([...candidates.slice(0, 2 * IMAP_WINDOW), ...tombstones.slice(0, IMAP_WINDOW)].map(({ id }) => id));
      for (const id of changes.keys()) if (!cached?.has(id) && !retained.has(id)) changes.delete(id);
      const { "@odata.nextLink": next, "@odata.deltaLink": end } = data;
      if (end && !next) {
        reconcile ||= candidates.some(({ receivedDateTime, isRead }) => !receivedDateTime || isRead === undefined);
        return { cursor: inboxLink(end), changes, reconcile, discardedRemovalFrom, initial: completeScan, ...(reason && { recovery: reason }) };
      }
      if (!next || end) throw new GraphMailError("graph-api-unavailable");
      link = inboxLink(next);
      if (visited.has(link)) throw new GraphMailError("graph-api-unavailable");
    }
    return {
      progress: { next: link, changes: [...changes.values()], reconcile, discardedRemovalFrom, initial: completeScan, mergeVersion: evidenceVersion, ...(reason && { recovery: reason }) },
      removedIds,
      historicalIds,
    };
  }

  async function loadSources(candidates: PendingSource[], rows: GraphRow[]) {
    let remaining = maxSourceBytes;
    for (const [index, candidate] of candidates.entries()) {
      // Reserve room for a whole legal MIME source before issuing its request.
      if (remaining < MAX_IMAP_SOURCE_BYTES || Date.now() >= stopAfter) return candidates.slice(index);
      try {
        const response = await get(new URL(`${endpoint}/${inboxPath}/${encodeURIComponent(candidate.id)}/$value`), false);
        const bytes = response && (await readBytes(response, MAX_IMAP_SOURCE_BYTES));
        if (!bytes?.length) continue;
        remaining -= bytes.length;
        const { arrival, ...row } = candidate;
        rows.push({ ...row, bytes, ...(arrival && { added: true }) });
      } catch (error) {
        if (!(error instanceof GraphResponseTooLarge)) throw error;
      }
    }
    return [];
  }

  async function round(input?: GraphSyncInput, recovery?: z.infer<typeof graphRecovery>): Promise<GraphPage | GraphCheckpoint> {
    if (input?.cursor && input.pending?.length) {
      const rows: GraphRow[] = [];
      const pending = await loadSources(input.pending, rows);
      return {
        cursor: input.cursor,
        initial: false,
        ...(input.recovery && { recovery: input.recovery }),
        rows,
        pending,
        awaitingDelta: new Set(input.awaitingDelta),
        arrivalWatermark: input.arrivalWatermark,
        removedIds,
        historicalIds,
        noticeEvidence: new Map(rows.flatMap((row) => ("added" in row && row.added ? [[row.id, { arrived: true, seen: row.seen }]] : []))),
      };
    }
    const stored = input?.progress;
    const verification = stored && "cursor" in stored && stored.mergeVersion === evidenceVersion ? stored : undefined;
    const batch: DeltaBatch | GraphCheckpoint = verification
      ? {
          cursor: inboxLink(verification.cursor),
          initial: verification.initial,
          reconcile: verification.reconcile,
          changes: new Map(verification.changes.map((item) => [item.id, item])),
          discardedRemovalFrom: verification.discardedRemovalFrom,
          ...(verification.recovery && { recovery: verification.recovery }),
        }
      : await pages(input, recovery);
    if ("progress" in batch) return batch;
    const verified = new Map(verification?.verified.map((item) => [item.id, item]));
    const checkpoint = (inbox?: InboxProgress): GraphCheckpoint => ({
      progress: {
        cursor: batch.cursor,
        mergeVersion: evidenceVersion,
        initial: batch.initial,
        recovery: batch.recovery,
        changes: [...batch.changes.values()],
        reconcile: batch.reconcile,
        discardedRemovalFrom: batch.discardedRemovalFrom,
        verified: [...verified.values()],
        inbox,
      },
      removedIds,
      historicalIds,
    });
    const couldHaveDiscardedRemoval = (id: string) => batch.discardedRemovalFrom !== undefined && (batch.initial || !input?.cached.has(id)) && id >= batch.discardedRemovalFrom;
    for (const change of batch.changes.values()) {
      const { id } = change;
      if (verified.has(id) || (!change.verify && (removed(change) || !couldHaveDiscardedRemoval(id)))) continue;
      if (Date.now() >= stopAfter) return checkpoint();
      const item = await lookupMessage(id);
      verified.set(id, item && !removed(item) ? item : { id, "@removed": {} });
    }

    const rows: GraphRow[] = [];
    const candidates: PendingSource[] = [];
    const noticeEvidence = new Map<string, NoticeEvidence>();
    const previousWatermark = batch.initial ? undefined : input?.arrivalWatermark;
    let arrivalWatermark = previousWatermark;
    const awaitingDelta = new Set(batch.initial ? [] : input?.awaitingDelta);
    const excluded = new Set<string>();
    const resolved = new Map<string, DeltaItem>();
    for (const change of batch.changes.values()) {
      const { id } = change;
      const item = verified.get(id) ?? change;
      if (removed(item)) {
        excluded.add(id);
        awaitingDelta.delete(id);
        removedIds.add(id);
        rows.push({ id, removed: true });
      } else {
        resolved.set(id, item);
      }
    }
    const window = batch.reconcile ? await inboxWindow(excluded, (id) => !batch.changes.has(id) && couldHaveDiscardedRemoval(id), verification?.inbox) : { entries: new Map<string, DeltaItem>() };
    if ("progress" in window) return checkpoint(window.progress);
    const { entries } = window;
    for (const [id, item] of resolved) {
      // The independent list can fill missing metadata, but it can lag or run ahead of this delta round.
      entries.set(id, { ...entries.get(id), ...item });
    }
    for (const item of entries.values()) {
      const { id, isRead, receivedDateTime } = item;
      const change = batch.changes.get(id);
      const receivedAt = receivedDateTime && new Date(receivedDateTime).toISOString();
      if (receivedAt && (batch.initial || change?.receivedDateTime || change?.verify)) {
        if (!arrivalWatermark || receivedAt > arrivalWatermark) arrivalWatermark = receivedAt;
      }
      const existing = batch.initial ? undefined : input?.cached.get(id);
      const arrival = !batch.initial && !!change?.receivedDateTime;
      if (arrival) awaitingDelta.delete(id);
      const deltaRead = verified.has(id) ? isRead : change?.isRead;
      // Preserve delta evidence even when no MIME source fits in the current window.
      const seen = deltaRead ?? existing?.seen ?? isRead;
      if (seen !== undefined && (arrival || deltaRead === true)) noticeEvidence.set(id, { arrived: arrival, seen });
      if (existing) {
        if (!change) continue;
        rows.push({ id, seen: deltaRead ?? existing.seen });
      } else if (receivedAt && isRead !== undefined) {
        // A list-only row newer than the confirmed mail may have arrived after the delta snapshot.
        if (!batch.initial && !change && (!previousWatermark || receivedAt > previousWatermark)) awaitingDelta.add(id);
        candidates.push({ id, seen: isRead, receivedAt, arrival, ...(batch.initial && { confirmed: true as const }) });
      }
    }
    candidates.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || a.id.localeCompare(b.id));
    const pending = await loadSources(candidates.slice(0, IMAP_WINDOW), rows);
    return { cursor: batch.cursor, rows, initial: batch.initial, ...(batch.recovery && { recovery: batch.recovery }), pending, awaitingDelta, arrivalWatermark, removedIds, historicalIds, noticeEvidence };
  }

  try {
    try {
      return await round(previous);
    } catch (error) {
      if (!(error instanceof GraphDeltaExpired) || !previous) throw error;
      return await round(undefined, "delta-expired");
    }
  } catch (error) {
    request.throwIfAborted();
    if (error instanceof GraphMailError) throw error;
    throw new GraphMailError("graph-api-unavailable");
  }
}
