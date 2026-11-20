import { z } from "zod";
import { IMAP_WINDOW, MAX_IMAP_SOURCE_BYTES } from "./imap-message.js";

export const gmailNativeId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const gmailHistoryId = z.string().regex(/^[1-9][0-9]{0,29}$/);
export const gmailRecovery = z.enum(["history-expired", "history-window"]);
export const gmailFallback = z.enum(["gmail-api-permission", "gmail-api-auth"]);

const pageSize = 25;
const parallelReads = 5;
const maxHistoryPages = 20;
const maxHistoryChanges = 400;
const maxSourceBytes = 18 * 1024 * 1024;
const maxRawJson = Math.ceil(MAX_IMAP_SOURCE_BYTES / 3) * 4 + 64 * 1024;
const pageToken = z.string().min(1).max(4096);
const reference = z.object({ id: gmailNativeId });
const labelIds = z.array(z.string().max(1024)).max(512);
const labels = reference.extend({ labelIds: labelIds.optional() });
const encodedMime = z
  .string()
  .transform((value) => value.replace(/={1,2}$/, ""))
  .pipe(z.base64url());
const rawMessage = labels.extend({ internalDate: z.string().regex(/^\d{1,15}$/), raw: encodedMime });
const added = z.object({ message: labels });
const labelChange = z.object({ message: reference, labelIds });
const history = z.object({
  id: gmailHistoryId,
  messagesAdded: z.array(added).optional(),
  messagesDeleted: z.array(z.object({ message: reference })).optional(),
  labelsAdded: z.array(labelChange).optional(),
  labelsRemoved: z.array(labelChange).optional(),
});
const historyPage = z.object({ historyId: gmailHistoryId, nextPageToken: pageToken.optional(), history: z.array(history).max(pageSize).optional() });
const inboxPage = z.object({ nextPageToken: pageToken.optional(), messages: z.array(reference).max(pageSize).optional() });
const profile = z.object({ emailAddress: z.email(), historyId: gmailHistoryId });
const historyFields = "historyId,nextPageToken,history(id,messagesAdded(message(id,labelIds)),messagesDeleted(message(id)),labelsAdded(message(id),labelIds),labelsRemoved(message(id),labelIds))";

type Recovery = z.infer<typeof gmailRecovery>;
type Fallback = z.infer<typeof gmailFallback>;
type Change = { id: string; remove?: true; added?: true | undefined };
export type GmailRow = { id: string; seen: boolean; added?: true | undefined; bytes?: Buffer; receivedAt?: string } | { id: string; removed: true };
export type GmailPage = { cursor: string; initial: boolean; recovery?: Recovery; rows: GmailRow[] };
export type GmailHistoryInput = { cursor: string; cached: Set<string> };
export class GmailHistoryError extends Error {
  constructor(readonly reason: Fallback | "gmail-api-unavailable" | "gmail-api-account") {
    super(reason);
  }
}

class GmailResponseTooLarge extends Error {}

async function readJson(response: Response, limit: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new GmailHistoryError("gmail-api-unavailable");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      size += value.byteLength;
      if (size > limit) throw new GmailResponseTooLarge();
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function isInboxMessage(message: z.infer<typeof labels>) {
  return message.labelIds?.includes("INBOX") && !["SPAM", "TRASH", "DRAFT"].some((label) => message.labelIds?.includes(label));
}

export async function readGmailHistory(endpoint: string, token: string, email: string, previous: GmailHistoryInput | undefined, request: AbortSignal): Promise<GmailPage> {
  const signal = AbortSignal.any([request, AbortSignal.timeout(75_000)]);

  async function get<T>(path: string, query: Record<string, string>, schema: z.ZodType<T>, limit = 256 * 1024): Promise<T | null> {
    const url = new URL(`${endpoint}/${path}`);
    url.search = new URLSearchParams(query).toString();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
    if (!response.ok) {
      if (response.status === 403) {
        const json = await readJson(response, 32 * 1024).catch(() => null);
        const error = z.object({ error: z.object({ errors: z.array(z.object({ reason: z.string() })).optional() }) }).safeParse(json);
        if (error.success && error.data.error.errors?.some(({ reason }) => /rateLimitExceeded|quotaExceeded|dailyLimitExceeded|backendError/i.test(reason))) throw new GmailHistoryError("gmail-api-unavailable");
        throw new GmailHistoryError("gmail-api-permission");
      }
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 404) return null;
      throw new GmailHistoryError(response.status === 401 ? "gmail-api-auth" : "gmail-api-unavailable");
    }
    return schema.parse(await readJson(response, limit));
  }

  async function readMessage(change: Change, cached: boolean, listed: boolean): Promise<GmailRow> {
    const { id, added } = change;
    const removed = { id, removed: true } as const;
    if (change.remove) return removed;
    // History includes mailbox-level events. Only download MIME after establishing INBOX membership.
    const path = `messages/${id}`;
    if (!listed || cached) {
      const metadata = await get(path, { format: "minimal", fields: "id,labelIds" }, labels);
      if (!metadata || !isInboxMessage(metadata)) return removed;
      if (metadata.id !== id) throw new GmailHistoryError("gmail-api-unavailable");
      if (cached) return { id, seen: !metadata.labelIds?.includes("UNREAD"), added };
    }
    const message = await get(path, { format: "raw", fields: "id,labelIds,internalDate,raw" }, rawMessage, maxRawJson).catch((error: unknown) => {
      if (error instanceof GmailResponseTooLarge) return null;
      throw error;
    });
    if (!message || !isInboxMessage(message)) return removed;
    if (message.id !== id) throw new GmailHistoryError("gmail-api-unavailable");
    const bytes = Buffer.from(message.raw, "base64url");
    if (!bytes.length || bytes.length > MAX_IMAP_SOURCE_BYTES) return removed;
    return { id, seen: !message.labelIds?.includes("UNREAD"), bytes, receivedAt: new Date(Number(message.internalDate)).toISOString(), added };
  }

  async function materialize(changes: Change[], cached: Set<string> | undefined) {
    const rows: GmailRow[] = [];
    let total = 0;
    for (let start = 0; start < changes.length; start += parallelReads) {
      // Wait for the batch to finish even on failure before releasing the account operation.
      const batch = await Promise.allSettled(changes.slice(start, start + parallelReads).map((change) => readMessage(change, cached?.has(change.id) ?? false, !cached)));
      for (const item of batch) {
        if (item.status === "rejected") throw item.reason;
        const row = item.value;
        if (!("removed" in row)) total += row.bytes?.length ?? 0;
        if (total > maxSourceBytes) return { rows, limited: true };
        rows.push(row);
      }
    }
    return { rows, limited: false };
  }

  async function scan(recovery?: Recovery): Promise<GmailPage> {
    // Read the history anchor before listing so a message arriving during the scan is replayable.
    const start = await get("profile", { fields: "emailAddress,historyId" }, profile);
    if (!start) throw new GmailHistoryError("gmail-api-permission");
    if (start.emailAddress.toLowerCase() !== email.toLowerCase()) throw new GmailHistoryError("gmail-api-account");
    const ids = new Set<string>();
    const tokens = new Set<string>();
    let token: string | undefined;
    for (let page = 0; page < IMAP_WINDOW / pageSize; page++) {
      const listed = await get("messages", { labelIds: "INBOX", q: "-in:drafts", includeSpamTrash: "false", maxResults: String(pageSize), fields: "nextPageToken,messages(id)", ...(token && { pageToken: token }) }, inboxPage);
      if (!listed) throw new GmailHistoryError("gmail-api-unavailable");
      for (const { id } of listed.messages ?? []) ids.add(id);
      token = listed.nextPageToken;
      if (!token) break;
      if (tokens.has(token)) throw new GmailHistoryError("gmail-api-unavailable");
      tokens.add(token);
    }
    const { rows } = await materialize(
      [...ids].map((id) => ({ id })),
      undefined,
    );
    return { cursor: start.historyId, initial: true, rows, ...(recovery && { recovery }) };
  }

  async function incremental(input: GmailHistoryInput): Promise<GmailPage> {
    const changes = new Map<string, Change>();
    const tokens = new Set<string>();
    const known = (id: string) => changes.has(id) || input.cached.has(id);
    const touch = (id: string) => changes.set(id, { id, added: changes.get(id)?.added });
    let token: string | undefined;
    let lastRecord = BigInt(input.cursor);
    for (let page = 0; page < maxHistoryPages; page++) {
      const updates = await get("history", { startHistoryId: input.cursor, maxResults: String(pageSize), fields: historyFields, ...(token && { pageToken: token }) }, historyPage);
      if (!updates) return scan("history-expired");
      for (const record of updates.history ?? []) {
        const id = BigInt(record.id);
        if (id <= lastRecord) throw new GmailHistoryError("gmail-api-unavailable");
        lastRecord = id;
        for (const { message } of record.messagesAdded ?? []) {
          if (!message.labelIds || isInboxMessage(message) || known(message.id)) changes.set(message.id, { id: message.id, added: true });
        }
        for (const { message, labelIds } of record.labelsAdded ?? []) {
          if (known(message.id) || labelIds.includes("INBOX")) touch(message.id);
        }
        for (const { message } of record.labelsRemoved ?? []) if (known(message.id)) touch(message.id);
        for (const { message } of record.messagesDeleted ?? []) if (known(message.id)) changes.set(message.id, { id: message.id, remove: true });
      }
      if (changes.size > maxHistoryChanges) return scan("history-window");
      token = updates.nextPageToken;
      if (!token) {
        if (BigInt(updates.historyId) < lastRecord) throw new GmailHistoryError("gmail-api-unavailable");
        const { rows, limited } = await materialize([...changes.values()], input.cached);
        return limited ? scan("history-window") : { cursor: updates.historyId, initial: false, rows };
      }
      if (tokens.has(token)) throw new GmailHistoryError("gmail-api-unavailable");
      tokens.add(token);
    }
    return scan("history-window");
  }

  try {
    return await (previous ? incremental(previous) : scan());
  } catch (error) {
    request.throwIfAborted();
    if (error instanceof GmailHistoryError) throw error;
    throw new GmailHistoryError("gmail-api-unavailable");
  }
}
