import { mailRequestId, mailTool, requireMailCaller } from "./tool-access.js";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, unlinkSync } from "node:fs";
import { errors, HuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, CredentialError, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { isPublicMailFolder } from "../mail-folder-visibility.js";
import type { MailAccountDefinition } from "./account-definition.js";
import type { AccountRemovals } from "./account-removals.js";
import type { openMailAccounts } from "./accounts.js";
import { MailAccountError } from "./discovery.js";
import type { MailDrafts } from "./drafts.js";
import { forwardContext } from "./forward-context.js";
import { gmailFallback, gmailHistoryId, GmailHistoryError, gmailNativeId, gmailRecovery, type GmailPage } from "./gmail-history.js";
import { graphDeltaLink, GraphMailError, graphNativeId, graphPending, graphProgress, graphRecovery, type GraphPage } from "./graph-mail.js";
import { IMAP_WINDOW, MAX_IMAP_SOURCE_BYTES } from "./imap-message.js";
import { messageBody, parseMessageBody } from "./message-body.js";
import { forwardSeed, forwardSource, newTopicRecipients, newTopicSeed, sourceDigest } from "./prepare-forward.js";
import { prepareReply, replyMode, replySeed, rootHeaders } from "./prepare-reply.js";
import { publicMail, publicMailHeaders, readPublicMail } from "./public-mail.js";
import { gmailMessageLocation, graphMessageLocation, imapMessageLocation, preserveReadOverrides, readOverridePath, readOverrides, type PortableMessageLocation } from "./read-overrides.js";
import { loadRemoteImages, maxRemoteImages, remoteImageTypes } from "./remote-images.js";
import { sourceMessage } from "./reply-context.js";
import { searchableHtml, type makeMailSearchText } from "./search-text.js";

const mailbox = sourceMessage.omit({ localMessageId: true });
const { uidValidity, uid } = imapMessageLocation.shape;
const readState = z.enum(["unread", "local", "synced"]);
const messageSummary = mailbox.extend({
  localMessageId: sourceMessage.shape.localMessageId,
  subject: z.string(),
  readState: readState.optional(),
});
export const imapSummary = messageSummary.extend(imapMessageLocation.shape);
export const gmailSummary = messageSummary.extend(gmailMessageLocation.shape);
export const graphSummary = messageSummary.extend(graphMessageLocation.shape);
export const cachedSummary = z.discriminatedUnion("transport", [imapSummary, gmailSummary, graphSummary]);
const gmailTarget = sourceMessage.extend({ source: z.literal("gmail"), nativeId: gmailNativeId });
const graphTarget = sourceMessage.extend({ source: z.literal("graph"), nativeId: graphNativeId });
const imapTarget = sourceMessage.extend({ source: z.literal("imap"), uidValidity, uid });
export const receivedTarget = z.discriminatedUnion("source", [imapTarget, gmailTarget, graphTarget]);
export function receivedLocation(item: z.infer<typeof cachedSummary>): z.infer<typeof receivedTarget> {
  const { accountId, folder, localMessageId } = item;
  return item.transport === "imap" ? { source: "imap", accountId, folder, localMessageId, uidValidity: item.uidValidity, uid: item.uid } : { source: item.transport, accountId, folder, localMessageId, nativeId: item.nativeId };
}
const cacheEntry = z.strictObject({
  summary: cachedSummary,
  source: z.base64().max(Math.ceil(MAX_IMAP_SOURCE_BYTES / 3) * 4),
  publicMail: publicMail.optional(),
  cachedAt: z.iso.datetime().optional(),
  receivedAt: z.iso.datetime().optional(),
  localRead: z.literal(true).optional(),
  deleted: z.literal(true).optional(),
});
const messageKey = sourceMessage;
const maxCachedMessages = IMAP_WINDOW;
const maxCacheSourceChars = 24 * 1024 * 1024;
const imapEntry = cacheEntry.omit({ receivedAt: true }).extend({ summary: imapSummary });
const gmailEntry = cacheEntry.extend({ summary: gmailSummary, receivedAt: z.iso.datetime() });
const graphEntry = gmailEntry.extend({ summary: graphSummary });
const noticeKeys = z.array(sourceMessage.shape.localMessageId).max(maxCachedMessages).optional();
const imapSnapshot = z.strictObject({
  format: z.literal(1),
  uidValidity,
  through: z.int().nonnegative().optional(),
  pendingNotices: noticeKeys,
  message: imapEntry.nullable(),
  history: z
    .array(imapEntry)
    .max(maxCachedMessages - 1)
    .optional(),
});
const gmailSnapshot = z.strictObject({
  cursor: gmailHistoryId,
  binding: z.hash("sha256", { enc: "hex" }),
  recovery: gmailRecovery.optional(),
  pendingNotices: noticeKeys,
  message: gmailEntry.nullable(),
  history: z
    .array(gmailEntry)
    .max(maxCachedMessages - 1)
    .optional(),
});
const gmailMailbox = z.strictObject({ format: z.literal(2), active: z.literal("gmail"), gmail: gmailSnapshot, imap: imapSnapshot.optional() });
const imapMailbox = z.strictObject({ format: z.literal(2), active: z.literal("imap"), imap: imapSnapshot, gmail: gmailSnapshot.optional(), fallback: gmailFallback });
const graphSnapshot = gmailSnapshot.extend({
  cursor: graphDeltaLink.nullable(),
  progress: graphProgress.optional(),
  pending: graphPending.optional(),
  awaitingDelta: z
    .array(graphNativeId)
    .max(2 * maxCachedMessages)
    .optional(),
  observedMessageIds: z.array(sourceMessage.shape.localMessageId).optional(),
  deferredNoticeIds: z.array(sourceMessage.shape.localMessageId).optional(),
  arrivalWatermark: z.iso.datetime().optional(),
  recovery: graphRecovery.optional(),
  message: graphEntry.nullable(),
  history: z
    .array(graphEntry)
    .max(maxCachedMessages - 1)
    .optional(),
});
const graphMailbox = z.strictObject({ format: z.literal(3), active: z.literal("graph"), graph: graphSnapshot, imap: imapSnapshot.optional() });
const exchangeMailbox = z.strictObject({ format: z.literal(3), active: z.literal("imap"), graph: graphSnapshot, imap: imapSnapshot });
const cacheRecord = z.union([imapSnapshot, gmailMailbox, imapMailbox, graphMailbox, exchangeMailbox]);
const syncStatus = z.discriminatedUnion("transport", [
  z.strictObject({ transport: z.literal("imap"), range: z.literal("folder"), limit: z.literal(maxCachedMessages), fallback: gmailFallback.optional() }),
  z.strictObject({ transport: z.literal("gmail"), range: z.literal("inbox"), limit: z.literal(maxCachedMessages), recovery: gmailRecovery.optional() }),
  z.strictObject({ transport: z.literal("graph"), range: z.literal("inbox"), limit: z.literal(maxCachedMessages), recovery: graphRecovery.optional() }),
]);

type Mailbox = z.infer<typeof mailbox>;
type CacheRecord = z.infer<typeof cacheRecord>;
type ImapSnapshot = z.infer<typeof imapSnapshot>;
type GmailSnapshot = z.infer<typeof gmailSnapshot>;
type GraphSnapshot = z.infer<typeof graphSnapshot>;
type Snapshot = ImapSnapshot | GmailSnapshot | GraphSnapshot;
type CacheEntry = z.infer<typeof cacheEntry>;
type GmailEntry = z.infer<typeof gmailEntry>;
type ApiTransport = "gmail" | "graph";
type ApiEntry<T extends ApiTransport> = Omit<GmailEntry, "summary"> & { summary: Omit<GmailEntry["summary"], "transport"> & { transport: T } };
type Files = HuhuApi["vault"]["files"];
export type MailFolderSyncStatus = z.infer<typeof syncStatus>;

import { mailUnknown, type MailIntents } from "./tool-intents.js";

const mailboxRevision = { expectedRevision: z.uuid().optional(), requestId: mailRequestId };

export const mailRefreshDescriptor = defineCapabilityDescriptor({
  ...mailTool,
  risk: "high",
  name: "mail.sync.refresh",
  title: "刷新邮箱目录",
  description: "分批刷新已选目录的邮件和已读状态。",
  timeoutMs: 90_000,
  scope: "execute",
  idempotency: "handler",
  input: mailbox.extend(mailboxRevision),
  output: z.strictObject({ message: cachedSummary.nullable(), mailboxChanged: z.boolean(), sync: syncStatus }),
});
export const mailLatestMessageDescriptor = defineCapabilityDescriptor({
  ...mailTool,
  risk: "high",
  name: "mail.messages.latest",
  title: "最新邮件",
  description: "从此 Vault 读取所选目录已缓存的最新邮件摘要。",
  scope: "read",
  input: mailbox,
  output: z.strictObject({ message: cachedSummary.nullable() }),
});
export const mailMessageSourceDescriptor = defineCapabilityDescriptor({
  ...mailTool,
  risk: "high",
  name: "mail.messages.loadSource",
  title: "读取邮件原文",
  description: "读取同一账号、目录和消息代的本机邮件原文。",
  scope: "read",
  input: messageKey,
  output: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("ready"), message: cachedSummary, source: z.base64() }), z.strictObject({ state: z.literal("needs-refresh") })]),
});

const digest = (parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const cacheDirectory = ".huhu/cache/mail";
const cachePath = ({ accountId, folder }: Mailbox) => `${cacheDirectory}/${digest([accountId, folder])}.json`;
const usageSchema = z.strictObject({ files: z.int().nonnegative(), bytes: z.int().nonnegative(), indexEntries: z.int().nonnegative(), indexBytes: z.int().nonnegative() });
export type MailCacheUsage = z.infer<typeof usageSchema>;

function mailCacheFiles(files: Files) {
  try {
    return readdirSync(files.abs(cacheDirectory), { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isFile() || !/^[0-9a-f]{64}\.json$/.test(entry.name)) return [];
      const relative = `${cacheDirectory}/${entry.name}`;
      const file = lstatSync(files.abs(relative));
      return file.isFile() ? [{ relative, bytes: file.size }] : [];
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
const messageId = ({ accountId, folder }: Mailbox, validity: string, uid: number) => digest([accountId, folder, validity, uid]);
const nativeMessageId = ({ accountId, folder }: Mailbox, transport: ApiTransport, binding: string, id: string) => digest([accountId, folder, transport, binding, id]);
const apiBindingId = ({ clientId, subject }: { clientId: string; subject: string }, email: string) => digest([clientId, subject, email.toLowerCase()]);

export function portableLocalMessageId(accountId: string, location: PortableMessageLocation, { settings, oauth }: MailAccountDefinition) {
  const mailbox = { accountId, folder: location.folder };
  if (location.transport === "imap") return messageId(mailbox, location.uidValidity, location.uid);
  if (oauth && location.folder === "INBOX" && (location.transport === "gmail" ? settings.provider === "gmail" : settings.provider === "outlook"))
    return nativeMessageId(mailbox, location.transport, apiBindingId(oauth, settings.email), location.nativeId);
}

function activeSnapshot(record: CacheRecord): Snapshot {
  if (record.format === 1) return record;
  if (record.active === "imap") return record.imap;
  return record.active === "gmail" ? record.gmail : record.graph;
}

function snapshotStatus(record: CacheRecord): MailFolderSyncStatus {
  if (record.format === 2 && record.active === "gmail") return { transport: "gmail", range: "inbox", limit: maxCachedMessages, ...(record.gmail.recovery && { recovery: record.gmail.recovery }) };
  if (record.format === 3 && record.active === "graph") return { transport: "graph", range: "inbox", limit: maxCachedMessages, ...(record.graph.recovery && { recovery: record.graph.recovery }) };
  return { transport: "imap", range: "folder", limit: maxCachedMessages, ...(record.format === 2 && { fallback: record.fallback }) };
}

function allSnapshots(record: CacheRecord): ["imap" | ApiTransport, Snapshot | undefined][] {
  if (record.format === 1) return [["imap", record]];
  return [["imap", record.imap], record.format === 2 ? ["gmail", record.gmail] : ["graph", record.graph]];
}

function readSnapshot(files: Files, input: Mailbox): { record: CacheRecord | null; snapshot: Snapshot | null; version: string | null } {
  const current = files.read(cachePath(input));
  if (!current) return { record: null, snapshot: null, version: null };
  try {
    const record = cacheRecord.parse(JSON.parse(current.bytes.toString("utf8")));
    for (const [transport, snapshot] of allSnapshots(record)) {
      if (!snapshot) continue;
      const entries = cachedEntries<CacheEntry>(snapshot);
      if (new Set(entries.map(({ summary }) => summary.localMessageId)).size !== entries.length) throw new Error();
      for (const { summary } of entries) {
        if (summary.accountId !== input.accountId || summary.folder !== input.folder) throw new Error();
        const valid =
          "binding" in snapshot
            ? summary.transport !== "imap" && summary.transport === transport && summary.localMessageId === nativeMessageId(input, summary.transport, snapshot.binding, summary.nativeId)
            : summary.transport === "imap" && summary.uidValidity === snapshot.uidValidity && summary.localMessageId === messageId(input, summary.uidValidity, summary.uid);
        if (!valid) throw new Error();
      }
    }
    return { record, snapshot: activeSnapshot(record), version: current.version };
  } catch {
    // A subsequent refresh can replace this rebuildable record.
  }
  return { record: null, snapshot: null, version: current.version };
}

function cachedEntries<T>(snapshot: { message: T | null; history?: T[] | undefined } | null): T[] {
  if (!snapshot) return [];
  return [...(snapshot.message ? [snapshot.message] : []), ...(snapshot.history ?? [])];
}

export function cachedMailboxMessages(files: Files, input: Mailbox) {
  return cachedEntries<CacheEntry>(readSnapshot(files, input).snapshot).filter(({ deleted }) => !deleted);
}

function localReadIds(record: CacheRecord) {
  return allSnapshots(record)
    .flatMap(([, snapshot]) => cachedEntries<CacheEntry>(snapshot ?? null))
    .flatMap((item) => (item.localRead || item.summary.readState === "local" ? [item.summary.localMessageId] : []));
}

export function cachedMessageLocations(files: Files, input: Mailbox) {
  const { record } = readSnapshot(files, input);
  return (record ? allSnapshots(record) : [])
    .flatMap(([, snapshot]) => cachedEntries<CacheEntry>(snapshot ?? null))
    .map(({ summary, localRead }) => {
      const { localMessageId, transport, folder } = summary;
      const location: PortableMessageLocation = transport === "imap" ? { transport, folder, uidValidity: summary.uidValidity, uid: summary.uid } : { transport, folder, nativeId: summary.nativeId };
      return {
        localMessageId,
        localRead: localRead || summary.readState === "local",
        location,
      };
    });
}

function findCachedMessage(snapshot: Snapshot | null, localMessageId: string) {
  return cachedEntries<CacheEntry>(snapshot).find(({ summary, deleted }) => !deleted && summary.localMessageId === localMessageId);
}

export function requireCachedMessage(files: Files, input: z.infer<typeof sourceMessage>) {
  const message = findCachedMessage(readSnapshot(files, input).snapshot, input.localMessageId);
  if (!message) throw errors.notFound("原邮件已不在当前缓存，请同步后重新打开。");
  return message;
}

export type MailNotificationSink = (notice: { id: string; module: "mail"; title: string }) => void;

const bodyOutput = z.discriminatedUnion("state", [z.strictObject({ state: z.literal("ready"), body: messageBody, sourceDigest: forwardContext.shape.sourceDigest }), z.strictObject({ state: z.literal("needs-refresh") })]);

export const messageCacheDescriptors = {
  refresh: mailRefreshDescriptor,
  latest: mailLatestMessageDescriptor,
  source: mailMessageSourceDescriptor,
  cacheUsage: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.cache.usage",
    title: "查看邮件缓存用量",
    description: "统计本机可重建的邮件缓存。",
    risk: "normal",
    scope: "read",
    input: z.strictObject({}),
    output: usageSchema.extend({ revision: z.string().optional() }),
  }),
  cacheClear: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.cache.clear",
    title: "清理邮件缓存",
    description: "清理可重建的邮件缓存。",
    risk: "high",
    scope: "write",
    input: z.strictObject({ confirm: z.literal(true), requestId: mailRequestId, expectedRevision: z.string().optional() }),
    output: usageSchema,
    idempotency: "handler",
  }),
  syncStatus: defineCapabilityDescriptor({ ...mailTool, name: "mail.sync.status", title: "查看邮件同步状态", description: "读取指定邮箱目录当前的同步状态。", risk: "normal", scope: "read", input: mailbox, output: syncStatus.nullable() }),
  notificationsTarget: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.notifications.target",
    title: "定位邮件通知",
    description: "读取通知关联的源邮件。",
    risk: "high",
    scope: "read",
    input: z.strictObject({ id: z.string().regex(/^ntf-mail-[0-9a-f]{64}$/) }),
    output: receivedTarget.nullable(),
  }),
  messagesPrepareReply: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.messages.prepareReply",
    title: "准备邮件回复",
    description: "从缓存生成回复草稿种子。",
    risk: "high",
    scope: "read",
    input: messageKey.extend({ mode: replyMode }),
    output: replySeed,
  }),
  messagesPrepareForward: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.messages.prepareForward",
    title: "准备转发邮件",
    description: "从缓存生成转发草稿种子。",
    risk: "high",
    scope: "read",
    input: messageKey,
    output: forwardSeed,
  }),
  messagesPrepareNewTopic: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.messages.prepareNewTopic",
    title: "准备邮件新话题",
    description: "从缓存提取公开参与者。",
    risk: "high",
    scope: "read",
    input: messageKey,
    output: newTopicSeed,
  }),
  messagesMarkRead: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.messages.markRead",
    title: "标记邮件已读",
    description: "将指定缓存邮件标记已读并核对远端状态。",
    risk: "high",
    scope: "write",
    idempotency: "handler",
    input: messageKey.extend(mailboxRevision),
    output: z.strictObject({ state: z.enum(["local", "synced", "needs-refresh"]), remoteSynced: z.boolean() }),
  }),
  messagesLoadBody: defineCapabilityDescriptor({ ...mailTool, name: "mail.messages.loadBody", title: "读取邮件正文", description: "读取指定来源的已缓存正文。", risk: "high", scope: "read", input: messageKey, output: bodyOutput }),
  conversationsLoadBody: defineCapabilityDescriptor({ ...mailTool, name: "mail.conversations.loadBody", title: "读取邮件正文", description: "读取指定来源的已缓存正文。", risk: "high", scope: "read", input: messageKey, output: bodyOutput }),
  remoteImages: defineCapabilityDescriptor({
    plugin: "mail",
    exposable: true,
    defaultExposed: false,
    name: "mail.messages.loadRemoteImages",
    title: "加载单封邮件的外部图片",
    description: "按明确操作加载当前邮件缓存版本中的 HTTPS 图片。",
    risk: "high",
    scope: "execute",
    idempotency: "handler",
    input: messageKey.extend({ sourceDigest: z.hash("sha256", { enc: "hex" }), view: z.enum(["conversation", "mailbox"]) }),
    output: z.strictObject({
      images: z.array(z.strictObject({ url: z.url(), mediaType: z.enum(remoteImageTypes), base64: z.base64() })).max(maxRemoteImages),
      failed: z.int().nonnegative().max(maxRemoteImages),
    }),
  }),
};

export function registerMessageCache(
  api: HuhuApi,
  accounts: ReturnType<typeof openMailAccounts> | undefined,
  lifetime: AbortSignal,
  removals: AccountRemovals,
  writer: Pick<MailDrafts, "serialize">,
  search: Pick<ReturnType<typeof makeMailSearchText>, "clear" | "usage">,
  once: MailIntents,
  notify?: MailNotificationSink,
) {
  const files = api.vault.files;
  let epoch = new AbortController();
  let clearing: Promise<MailCacheUsage> | undefined;
  const writes = new Map<string, { accountId: string; task: Promise<unknown> }>();
  const authorize = (caller: string, name: string) => {
    requireMailCaller(caller, name);
  };
  function configured({ accountId, folder }: Mailbox, publicOnly = false) {
    if (removals.read(accountId)) return;
    const account = accounts?.readDefinition(accountId);
    if (account?.definition.folders.some((row) => row.path === folder && (!publicOnly || isPublicMailFolder(row)))) return account;
  }

  function requireMailboxRevision(input: Mailbox, expectedRevision: string | undefined) {
    const account = configured(input);
    if (!account) throw errors.notFound("邮箱或已选目录");
    if (!expectedRevision) throw errors.invalidInput("此操作需要当前邮箱版本。");
    if (account.revision !== expectedRevision) throw errors.versionConflict(account.revision);
  }
  function serialize<T>(input: Mailbox, run: () => Promise<T>): Promise<T> {
    const key = cachePath(input);
    const task = (writes.get(key)?.task ?? Promise.resolve()).catch(() => undefined).then(run);
    writes.set(key, { accountId: input.accountId, task });
    return task.finally(() => {
      if (writes.get(key)?.task === task) writes.delete(key);
    });
  }
  function write(input: Mailbox, snapshot: CacheRecord, expectedVersion: string | null, signal: AbortSignal, validate?: () => void) {
    return writer.serialize(() => {
      const beforeCommit = () => {
        signal.throwIfAborted();
        removals.assertActive(input.accountId);
        validate?.();
      };
      beforeCommit();
      return files.write(cachePath(input), Buffer.from(JSON.stringify(snapshot) + "\n"), { expectedVersion, beforeCommit });
    });
  }

  function noticeId(localMessageId: string) {
    return `ntf-mail-${digest([api.vault.vaultId, files.root, localMessageId])}`;
  }

  function mailboxRoute(accountId: string) {
    const definition = accounts?.readDefinition(accountId)?.definition;
    return definition && (definition.oauth?.route ?? "imap");
  }

  type SyncJob = { accountId: string; route: ReturnType<typeof mailboxRoute>; controller: AbortController; waiters: number; task: ReturnType<typeof syncMailbox> };
  const jobs = new Map<string, SyncJob>();
  const accountTails = new Map<string, Promise<unknown>>();

  function cancelRetiredRoute(job: SyncJob, route: SyncJob["route"]) {
    if (job.route !== route && !job.controller.signal.aborted) job.controller.abort(new MailAccountError("mailbox-changed"));
  }

  api.events.subscribe((event) => {
    if (event.type !== "entity.changed" || !("kind" in event.payload) || event.payload.kind !== "mail-account") return;
    const accountId = event.payload.id;
    if (!accountId) return;
    const route = mailboxRoute(accountId);
    // Renewing a grant can change the revision without retiring the current transport.
    for (const job of jobs.values()) if (job.accountId === accountId) cancelRetiredRoute(job, route);
  });

  async function publishSync(input: Mailbox, next: CacheRecord, before: CacheRecord | null, version: string | null, signal: AbortSignal, assertCurrent: () => void, changed: boolean) {
    if (JSON.stringify(before) !== JSON.stringify(next)) {
      ({ version } = await write(input, next, version, signal, assertCurrent));
      assertCurrent();
      api.events.publish("entity.changed", { kind: changed ? "mail-mailbox" : "mail-message", id: input.accountId, op: "updated" });
    }
    const snapshot = activeSnapshot(next);
    const pending = snapshot.pendingNotices;
    if (notify && pending?.length) {
      const failed = [];
      for (const localMessageId of pending) {
        assertCurrent();
        try {
          notify({ id: noticeId(localMessageId), module: "mail", title: "收到新邮件" });
        } catch {
          failed.push(localMessageId);
        }
      }
      if (failed.length !== pending.length) {
        delete snapshot.pendingNotices;
        if (failed.length) snapshot.pendingNotices = failed;
        await write(input, next, version, signal, assertCurrent);
      }
    }
  }

  async function apiEntries<T extends ApiTransport>(input: Mailbox, transport: T, result: GmailPage | GraphPage, binding: string, oldEntries: ApiEntry<T>[], marked: ReadonlySet<string>) {
    const old = new Map(oldEntries.map((entry) => [entry.summary.nativeId, entry]));
    const rows = result.initial ? new Map<string, ApiEntry<T>>() : new Map(old);
    for (const row of result.rows) {
      if ("removed" in row) {
        rows.delete(row.id);
        continue;
      }
      const existing = old.get(row.id);
      const localMessageId = nativeMessageId(input, transport, binding, row.id);
      const localRead = existing?.localRead || existing?.summary.readState === "local" || marked.has(localMessageId);
      const state = row.seen ? "synced" : localRead ? "local" : "unread";
      if (row.bytes && row.receivedAt) {
        const headers = await rootHeaders(row.bytes).catch(() => undefined);
        rows.set(row.id, {
          summary: {
            ...input,
            transport,
            nativeId: row.id,
            localMessageId,
            subject: headers?.getDecoded("Subject")[0]?.value ?? "",
            readState: state,
          },
          source: row.bytes.toString("base64"),
          ...(headers && { publicMail: publicMailHeaders(headers) }),
          ...(localRead && { localRead: true }),
          receivedAt: row.receivedAt,
          cachedAt: existing?.cachedAt ?? new Date().toISOString(),
        });
      } else if (existing) rows.set(row.id, { ...existing, summary: { ...existing.summary, readState: state } });
    }
    let size = 0;
    return [...rows.values()]
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || a.summary.nativeId.localeCompare(b.summary.nativeId))
      .slice(0, maxCachedMessages)
      .filter((entry) => {
        if (size + entry.source.length > maxCacheSourceChars) return false;
        size += entry.source.length;
        return true;
      });
  }

  async function syncMailbox(input: Mailbox, signal: AbortSignal) {
    signal.throwIfAborted();
    await accounts!.ensureOAuthAccess(input.accountId, signal);
    const generation = accounts!.readDefinition(input.accountId);
    if (!generation?.definition.folders.some(({ path }) => path === input.folder)) throw new MailAccountError("invalid-selection");
    const assertCurrent = () => {
      signal.throwIfAborted();
      removals.assertActive(input.accountId);
      if (accounts!.readDefinition(input.accountId)?.revision !== generation.revision) throw new MailAccountError("mailbox-changed");
    };
    const before = readSnapshot(files, input);
    const marked = readOverrides(files, input.accountId).ids;
    const oldImap = before.record?.format === 1 ? before.record : before.record?.imap;
    const cachedGmail = before.record?.format === 2 ? before.record.gmail : undefined;
    const cachedGraph = before.record?.format === 3 ? before.record.graph : undefined;
    const activeGmail = before.record?.format === 2 && before.record.active === "gmail";
    const activeGraph = before.record?.format === 3 && before.record.active === "graph";
    const activeApi = activeGmail || activeGraph;
    let fallback: z.infer<typeof gmailFallback> | undefined;
    const identity = generation.definition.oauth;
    if (identity && generation.definition.settings.provider === "gmail") {
      const binding = apiBindingId(identity, generation.definition.settings.email);
      const previous = cachedGmail?.binding === binding ? cachedGmail : undefined;
      const cached = new Set(cachedEntries(previous ?? null).map(({ summary }) => summary.nativeId));
      const fetch = accounts!.fetchGmailHistory(input.accountId, input.folder, previous && { cursor: previous.cursor, cached }, signal);
      const gmail = await fetch?.catch((error: unknown) => {
        if (!(error instanceof GmailHistoryError)) throw error;
        if (error.reason === "gmail-api-account" || error.reason === "gmail-api-unavailable") throw new HuhuError("INVALID_INPUT", "无法刷新 Gmail 收件箱", { details: { reason: error.reason } });
        fallback = error.reason;
      });
      if (gmail) {
        const entries = await apiEntries(input, "gmail", gmail, binding, cachedEntries(previous ?? null), marked);
        assertCurrent();
        const carried = new Set(previous?.pendingNotices);
        const arrivals = new Set(gmail.rows.filter((row) => !("removed" in row) && row.added).map(({ id }) => id));
        const pending = entries
          .filter(
            ({ summary, publicMail }) => publicMail && (carried.has(summary.localMessageId) || (notify && activeGmail && !gmail.initial && arrivals.has(summary.nativeId) && !cached.has(summary.nativeId) && summary.readState === "unread")),
          )
          .map(({ summary }) => summary.localMessageId);
        const snapshot: GmailSnapshot = { cursor: gmail.cursor, binding, message: entries[0] ?? null, history: entries.slice(1), ...(gmail.recovery && { recovery: gmail.recovery }), ...(pending.length && { pendingNotices: pending }) };
        const next: CacheRecord = { format: 2, active: "gmail", gmail: snapshot, ...(oldImap && { imap: oldImap }) };
        const mailboxChanged = Boolean(before.snapshot && (!activeGmail || !previous || gmail.initial));
        await publishSync(input, next, before.record, before.version, signal, assertCurrent, mailboxChanged);
        return { message: snapshot.message?.summary ?? null, mailboxChanged, sync: snapshotStatus(next), more: false, idle: undefined };
      }
    }
    if (identity?.route === "graph") {
      const binding = apiBindingId(identity, generation.definition.settings.email);
      const previous = cachedGraph?.binding === binding ? cachedGraph : undefined;
      const oldEntries = cachedEntries(previous ?? null);
      const cached = new Map(oldEntries.map(({ summary }) => [summary.nativeId, { seen: summary.readState === "synced" }]));
      const graph = await accounts!
        .fetchGraphDelta(
          input.accountId,
          input.folder,
          previous && {
            cursor: previous.cursor,
            cached,
            progress: previous.progress,
            pending: previous.pending,
            recovery: previous.recovery,
            awaitingDelta: previous.awaitingDelta,
            arrivalWatermark: previous.arrivalWatermark ?? previous.message?.receivedAt,
          },
          signal,
        )
        .catch((error: unknown) => {
          if (!(error instanceof GraphMailError)) throw error;
          const message = error.reason === "graph-api-permission" ? "Microsoft Graph 拒绝访问收件箱，已同步邮件仍可查看。" : "无法刷新 Microsoft Graph 收件箱";
          throw new HuhuError("INVALID_INPUT", message, { details: { reason: error.reason } });
        });
      const observed = new Set(previous?.observedMessageIds);
      if (!previous?.observedMessageIds) {
        // Older snapshots only have retained messages and the original list-ahead marker.
        const previouslyAwaitingDelta = new Set(previous?.awaitingDelta);
        for (const { summary } of oldEntries) {
          if (!previouslyAwaitingDelta.has(summary.nativeId)) observed.add(summary.localMessageId);
        }
      }
      const deferred = new Set(previous?.deferredNoticeIds);
      for (const id of deferred) if (marked.has(id)) deferred.delete(id);
      for (const id of graph.historicalIds) observed.add(nativeMessageId(input, "graph", binding, id));
      for (const id of graph.removedIds) {
        const key = nativeMessageId(input, "graph", binding, id);
        observed.add(key);
        deferred.delete(key);
      }
      if ("progress" in graph) {
        const snapshot: GraphSnapshot = { ...(previous ?? { cursor: null, binding, message: null }), progress: graph.progress, observedMessageIds: [...observed] };
        if (deferred.size) snapshot.deferredNoticeIds = [...deferred];
        else delete snapshot.deferredNoticeIds;
        const checkpoint: CacheRecord = oldImap && !activeGraph ? { format: 3, active: "imap", imap: oldImap, graph: snapshot } : { format: 3, active: "graph", graph: snapshot, ...(oldImap && { imap: oldImap }) };
        await write(input, checkpoint, before.version, signal, assertCurrent);
        assertCurrent();
        return { message: activeSnapshot(checkpoint).message?.summary ?? null, mailboxChanged: false, sync: snapshotStatus(checkpoint), more: true, idle: undefined };
      }
      const entries = await apiEntries(input, "graph", graph, binding, oldEntries, marked);
      const carried = new Set(previous?.pendingNotices);
      const canNotify = notify && activeGraph && !graph.initial;
      for (const [id, { arrived, seen }] of graph.noticeEvidence) {
        const key = nativeMessageId(input, "graph", binding, id);
        if (seen) deferred.delete(key);
        if (arrived) {
          if (!seen && canNotify && !observed.has(key) && !marked.has(key)) deferred.add(key);
          observed.add(key);
        }
      }
      for (const row of graph.rows) {
        // A MIME source from the independent list is not delta evidence.
        if (!("removed" in row) && (row.confirmed || row.added)) observed.add(nativeMessageId(input, "graph", binding, row.id));
      }
      const pending: string[] = [];
      for (const {
        summary: { localMessageId, readState },
        publicMail,
      } of entries) {
        if (readState !== "unread") deferred.delete(localMessageId);
        if (!publicMail) continue;
        const ready = canNotify && deferred.delete(localMessageId);
        if (ready || carried.has(localMessageId)) pending.push(localMessageId);
      }
      const retained = new Set([...entries.map(({ summary }) => summary.nativeId), ...graph.pending.map(({ id }) => id)]);
      const awaitingDelta = [...graph.awaitingDelta].filter((id) => retained.has(id));
      const snapshot: GraphSnapshot = {
        cursor: graph.cursor,
        binding,
        message: entries[0] ?? null,
        history: entries.slice(1),
        ...(graph.pending.length && { pending: graph.pending }),
        ...(awaitingDelta.length && { awaitingDelta }),
        observedMessageIds: [...observed],
        ...(deferred.size && { deferredNoticeIds: [...deferred] }),
        ...(graph.arrivalWatermark && { arrivalWatermark: graph.arrivalWatermark }),
        ...(graph.recovery && { recovery: graph.recovery }),
        ...(pending.length && { pendingNotices: pending }),
      };
      const next: CacheRecord = { format: 3, active: "graph", graph: snapshot, ...(oldImap && { imap: oldImap }) };
      const mailboxChanged = Boolean(before.snapshot && (!activeGraph || !previous || graph.initial));
      assertCurrent();
      await publishSync(input, next, before.record, before.version, signal, assertCurrent, mailboxChanged);
      return { message: snapshot.message?.summary ?? null, mailboxChanged, sync: snapshotStatus(next), more: graph.pending.length > 0, idle: undefined };
    }
    const makeRecord = (snapshot: ImapSnapshot): CacheRecord => {
      if (fallback) return { format: 2, active: "imap", imap: snapshot, ...(cachedGmail && { gmail: cachedGmail }), fallback };
      if (cachedGraph) return { format: 3, active: "imap", imap: snapshot, graph: cachedGraph };
      return snapshot;
    };
    let version = before.version;
    let mailboxChanged = false;
    const result = await accounts!.fetchMessages(
      input.accountId,
      input.folder,
      oldImap
        ? {
            uidValidity: oldImap.uidValidity,
            ...(oldImap.through !== undefined && { through: oldImap.through }),
            cached: cachedEntries(oldImap).map(({ summary, source }) => ({ uid: summary.uid, size: Buffer.byteLength(source, "base64") })),
          }
        : undefined,
      async (validity) => {
        assertCurrent();
        mailboxChanged = true;
        if (!activeApi) {
          ({ version } = await write(input, makeRecord({ format: 1, uidValidity: validity, message: null }), version, signal, assertCurrent));
          api.events.publish("entity.changed", { kind: "mail-mailbox", id: input.accountId, op: "updated" });
        }
      },
      signal,
    );
    assertCurrent();
    const previous = new Map(mailboxChanged ? [] : cachedEntries(oldImap ?? null).map((entry) => [entry.summary.uid, entry]));
    const entries: z.infer<typeof imapEntry>[] = [];
    let size = 0;
    for (const row of result.messages.sort((a, b) => b.uid - a.uid)) {
      const existing = previous.get(row.uid);
      if (row.deleted || (!existing && !row.source)) continue;
      const source = row.source?.toString("base64") ?? existing!.source;
      if (entries.length >= maxCachedMessages || size + source.length > maxCacheSourceChars) continue;
      const projection = row.source ? await readPublicMail(row.source).catch(() => undefined) : existing?.publicMail;
      const localMessageId = messageId(input, result.uidValidity, row.uid);
      const localRead = existing?.localRead || existing?.summary.readState === "local" || marked.has(localMessageId);
      const state = row.seen ? "synced" : localRead ? "local" : "unread";
      entries.push({
        summary: { ...input, uidValidity: result.uidValidity, uid: row.uid, localMessageId, subject: row.subject, transport: "imap", readState: state },
        source,
        ...(projection && { publicMail: projection }),
        ...(localRead && { localRead: true }),
        cachedAt: existing?.cachedAt ?? new Date().toISOString(),
      });
      size += source.length;
    }
    assertCurrent();
    const unacknowledged = new Set(mailboxChanged ? [] : oldImap?.pendingNotices);
    const pending = entries
      .filter(({ summary, publicMail }) => {
        if (!publicMail) return false;
        if (unacknowledged.has(summary.localMessageId)) return true;
        return notify && !activeApi && !result.initial && input.folder.toLowerCase() === "inbox" && summary.uid > (oldImap?.through ?? 0) && summary.readState === "unread";
      })
      .map(({ summary }) => summary.localMessageId);
    const snapshot: ImapSnapshot = { format: 1, uidValidity: result.uidValidity, through: result.through, message: entries[0] ?? null, history: entries.slice(1), ...(pending.length && { pendingNotices: pending }) };
    const next = makeRecord(snapshot);
    await publishSync(input, next, before.record, version, signal, assertCurrent, activeApi);
    const idle = result.canIdle && !result.more && input.folder.toLowerCase() === "inbox" ? { folder: input.folder, uidValidity: result.uidValidity, through: result.through } : undefined;
    return { message: snapshot.message?.summary ?? null, mailboxChanged: mailboxChanged || activeApi, sync: snapshotStatus(next), more: result.more, idle };
  }

  function refresh(input: Mailbox, signal: AbortSignal, expectedRevision?: string) {
    files.assertWritable();
    epoch.signal.throwIfAborted();
    if (!accounts) throw errors.invalidInput("此 Vault 的本机邮箱凭据不可用");
    signal.throwIfAborted();
    if (expectedRevision !== undefined) requireMailboxRevision(input, expectedRevision);
    const key = cachePath(input);
    const route = mailboxRoute(input.accountId);
    let active = jobs.get(key);
    // The committed route can become readable before its account event is published.
    if (active) cancelRetiredRoute(active, route);
    if (!active || active.controller.signal.aborted) {
      const controller = new AbortController();
      const cancelled = AbortSignal.any([controller.signal, lifetime, epoch.signal, removals.signal(input.accountId)]);
      const task = (accountTails.get(input.accountId) ?? Promise.resolve())
        .catch(() => undefined)
        .then(() =>
          serialize(input, () => {
            if (expectedRevision !== undefined) requireMailboxRevision(input, expectedRevision);
            return syncMailbox(input, cancelled);
          }),
        );
      active = { accountId: input.accountId, route, controller, task, waiters: 0 };
      jobs.set(key, active);
      accountTails.set(input.accountId, task);
      const clear = () => {
        if (jobs.get(key)?.task === task) jobs.delete(key);
        if (accountTails.get(input.accountId) === task) accountTails.delete(input.accountId);
      };
      void task.then(clear, clear);
    }
    const job = active;
    job.waiters++;
    return new Promise<Awaited<typeof job.task>>((resolve, reject) => {
      let waiting = true;
      const leave = () => {
        if (!waiting) return;
        waiting = false;
        signal.removeEventListener("abort", abort);
        if (--job.waiters === 0 && jobs.get(key) === job) job.controller.abort();
      };
      const abort = () => {
        leave();
        reject(signal.reason);
      };
      signal.addEventListener("abort", abort, { once: true });
      void job.task.then(
        (result) => {
          leave();
          resolve(result);
        },
        (error: unknown) => {
          leave();
          reject(error);
        },
      );
    });
  }

  function usage(): MailCacheUsage {
    const found = mailCacheFiles(files);
    const index = search.usage();
    return { files: found.length, bytes: found.reduce((sum, item) => sum + item.bytes, 0), indexEntries: index.entries, indexBytes: index.bytes };
  }

  function drainCacheWork() {
    return Promise.allSettled([...accountTails.values(), ...[...writes.values()].map(({ task }) => task)]);
  }

  function cacheRevision() {
    return digest(
      mailCacheFiles(files)
        .map(({ relative }) => [relative, files.currentVersion(relative)])
        .sort(),
    );
  }

  async function clearCache(signal: AbortSignal, expectedRevision?: string) {
    files.assertWritable();
    signal.throwIfAborted();
    lifetime.throwIfAborted();
    if (clearing) {
      if (expectedRevision !== undefined) throw errors.invalidInput("邮件缓存正在清理，请读取最新范围。");
      return clearing;
    }
    epoch.abort(errors.invalidInput("邮件缓存正在清理。"));
    clearing = (async () => {
      await drainCacheWork();
      return writer.serialize(async () => {
        lifetime.throwIfAborted();
        if (expectedRevision !== undefined) {
          const current = cacheRevision();
          if (current !== expectedRevision) throw errors.versionConflict(current);
        }
        const found = mailCacheFiles(files);
        const removed = usage();
        const marked = new Map<string, Set<string>>();
        for (const { relative } of found) {
          const content = files.read(relative);
          if (!content) continue;
          let parsed: CacheRecord;
          try {
            parsed = cacheRecord.parse(JSON.parse(content.bytes.toString("utf8")));
          } catch {
            // Corrupt cache is rebuildable and cannot supply a verified local mark.
            continue;
          }
          const entries = allSnapshots(parsed).flatMap(([, snapshot]) => cachedEntries<CacheEntry>(snapshot ?? null));
          const summary = entries[0]?.summary;
          if (!summary || cachePath(summary) !== relative || !readSnapshot(files, summary).record || removals.read(summary.accountId)) continue;
          const ids = marked.get(summary.accountId) ?? new Set<string>();
          for (const id of localReadIds(parsed)) ids.add(id);
          if (ids.size) marked.set(summary.accountId, ids);
        }
        for (const [accountId, ids] of marked) await preserveReadOverrides(files, accountId, ids);
        lifetime.throwIfAborted();
        search.clear();
        for (const { relative } of found) {
          const abs = files.abs(relative);
          if (lstatSync(abs, { throwIfNoEntry: false })?.isFile()) unlinkSync(abs);
        }
        return removed;
      });
    })().finally(() => {
      epoch = new AbortController();
      clearing = undefined;
      if (!lifetime.aborted) api.events.publish("entity.changed", { kind: "mail-cache", id: "all", op: "updated" });
    });
    return clearing;
  }

  api.defineCapability(
    bindCapability(messageCacheDescriptors.cacheUsage, ({ caller }) => {
      authorize(caller, "mail.cache.usage");
      return { ...usage(), ...(!isWorkbenchCaller(caller) && { revision: cacheRevision() }) };
    }),
  );
  api.defineCapability(
    bindCapability(messageCacheDescriptors.cacheClear, (context, input) => {
      const name = messageCacheDescriptors.cacheClear.name;
      authorize(context.caller, name);
      if (!isWorkbenchCaller(context.caller) && !input.expectedRevision) throw errors.invalidInput("请先获取邮件缓存范围版本。");
      return once(
        context,
        name,
        input.expectedRevision,
        input,
        () => clearCache(context.signal, input.expectedRevision),
        (data) => data,
        (data) => data,
      );
    }),
  );

  async function prepareRelated<T>(input: z.infer<typeof sourceMessage>, signal: AbortSignal, prepare: (bytes: Buffer, subject: string, sender: string | null, own: string[]) => Promise<T>) {
    const cancelled = AbortSignal.any([signal, lifetime, epoch.signal, removals.signal(input.accountId)]);
    cancelled.throwIfAborted();
    if (!configured(input)) throw errors.notFound("原邮件所属目录");
    const message = requireCachedMessage(files, input);
    const available = await accounts?.list();
    const sourceAccount = available?.find(({ accountId }) => accountId === input.accountId);
    if (!sourceAccount || !available) throw errors.notFound("原邮件所属邮箱不可用。");
    let seed: T;
    try {
      seed = await prepare(
        Buffer.from(message.source, "base64"),
        message.summary.subject,
        sourceAccount.definition.settings.smtpEnabled ? sourceAccount.accountId : null,
        available.map(({ definition }) => definition.settings.email),
      );
    } catch {
      throw errors.invalidInput("无法解析原邮件。");
    }
    cancelled.throwIfAborted();
    if (requireCachedMessage(files, input).source !== message.source) throw errors.notFound("原邮件缓存已变化，请重新打开。");
    return seed;
  }
  api.defineCapability(
    bindCapability(mailRefreshDescriptor, (context, { expectedRevision, requestId, ...input }) => {
      const { caller, signal } = context;
      authorize(caller, mailRefreshDescriptor.name);
      return once(
        context,
        mailRefreshDescriptor.name,
        requestId,
        { ...input, expectedRevision },
        async () => {
          try {
            if (!isWorkbenchCaller(caller)) requireMailboxRevision(input, expectedRevision);
            const { message, mailboxChanged, sync } = await refresh(input, signal, expectedRevision);
            return { message, mailboxChanged, sync };
          } catch (error) {
            if (!lifetime.aborted && error instanceof MailAccountError && error.code === "oauth-reauthorize") api.events.publish("entity.changed", { kind: "mail-account", id: input.accountId, op: "updated" });
            if (error instanceof MailAccountError || error instanceof CredentialError) throw new HuhuError("INVALID_INPUT", "无法刷新邮箱目录", { details: { reason: error.code } });
            throw error;
          }
        },
        ({ message, mailboxChanged, sync }) => ({ messageId: message?.localMessageId ?? null, mailboxChanged, sync, version: files.currentVersion(cachePath(input)) }),
        ({ messageId, mailboxChanged, sync, version }) => {
          if (!configured(input)) throw errors.notFound("邮箱或已选目录");
          const cached = readSnapshot(files, input);
          if (cached.version !== version) throw mailUnknown();
          const message = messageId ? findCachedMessage(cached.snapshot, messageId)?.summary : null;
          if (message === undefined) throw mailUnknown();
          return { message, mailboxChanged, sync };
        },
      );
    }),
  );
  api.defineCapability(
    bindCapability(messageCacheDescriptors.syncStatus, ({ caller }, input) => {
      authorize(caller, "mail.sync.status");
      if (!configured(input)) return null;
      const record = readSnapshot(files, input).record;
      return record ? snapshotStatus(record) : null;
    }),
  );
  api.defineCapability(
    bindCapability(messageCacheDescriptors.notificationsTarget, async ({ caller, signal }, { id }) => {
      authorize(caller, "mail.notifications.target");
      const rows = (await accounts?.list()) ?? [];
      for (const account of rows) {
        signal.throwIfAborted();
        lifetime.throwIfAborted();
        if (removals.read(account.accountId) || accounts?.readDefinition(account.accountId)?.revision !== account.revision) continue;
        for (const folder of account.definition.folders) {
          if (folder.path.toLowerCase() !== "inbox" || !isPublicMailFolder(folder)) continue;
          const entry = cachedMailboxMessages(files, { accountId: account.accountId, folder: folder.path }).find(({ summary }) => noticeId(summary.localMessageId) === id);
          if (entry?.publicMail) return receivedLocation(entry.summary);
        }
      }
      return null;
    }),
  );
  api.defineCapability(
    bindCapability(mailLatestMessageDescriptor, ({ caller }, input) => {
      authorize(caller, mailLatestMessageDescriptor.name);
      const message = configured(input) ? readSnapshot(files, input).snapshot?.message : null;
      return { message: message && !message.deleted ? message.summary : null };
    }),
  );
  api.defineCapability(
    bindCapability(mailMessageSourceDescriptor, ({ caller }, input) => {
      authorize(caller, mailMessageSourceDescriptor.name);
      const message = configured(input) ? findCachedMessage(readSnapshot(files, input).snapshot, input.localMessageId) : undefined;
      return message ? { state: "ready" as const, message: message.summary, source: message.source } : { state: "needs-refresh" as const };
    }),
  );
  api.defineCapability(
    bindCapability(messageCacheDescriptors.messagesPrepareReply, ({ caller, signal }, { mode, ...input }) => {
      authorize(caller, "mail.messages.prepareReply");
      return prepareRelated(input, signal, (bytes, subject, _sender, own) => prepareReply(bytes, input, subject, mode, own));
    }),
  );
  api.defineCapability(
    bindCapability(messageCacheDescriptors.messagesPrepareForward, ({ caller, signal }, input) => {
      authorize(caller, "mail.messages.prepareForward");
      return prepareRelated(input, signal, async (bytes, subject, accountId) => {
        const { forward } = await forwardSource(bytes, input, subject);
        return { accountId, subject: `转发：${forward.subject}`.slice(0, 8192), forward };
      });
    }),
  );
  api.defineCapability(
    bindCapability(messageCacheDescriptors.messagesPrepareNewTopic, ({ caller, signal }, input) => {
      authorize(caller, "mail.messages.prepareNewTopic");
      return prepareRelated(input, signal, async (bytes, _subject, accountId, own) => ({ accountId, to: await newTopicRecipients(bytes, own) }));
    }),
  );
  for (const [descriptor, publicOnly] of [
    [messageCacheDescriptors.messagesLoadBody, false],
    [messageCacheDescriptors.conversationsLoadBody, true],
  ] as const) {
    api.defineCapability(
      bindCapability(descriptor, async ({ caller, signal }, input) => {
        authorize(caller, descriptor.name);
        const stale = { state: "needs-refresh" } as const;
        if (!configured(input, publicOnly)) return stale;
        const cancelled = AbortSignal.any([signal, lifetime, epoch.signal, removals.signal(input.accountId)]);
        cancelled.throwIfAborted();
        const message = findCachedMessage(readSnapshot(files, input).snapshot, input.localMessageId);
        if (!message) return stale;
        const bytes = Buffer.from(message.source, "base64");
        const body = await parseMessageBody(bytes).catch(() => null);
        if (!configured(input, publicOnly)) return stale;
        cancelled.throwIfAborted();
        const current = findCachedMessage(readSnapshot(files, input).snapshot, input.localMessageId);
        if (current?.source !== message.source) return stale;
        if (!body) throw new HuhuError("INVALID_INPUT", publicOnly ? "无法解析邮件正文。" : "无法解析邮件正文。仍可查看原文。", { details: { reason: "mime" } });
        const externalText = !isWorkbenchCaller(caller) && body.text === null && body.untrustedHtml ? searchableHtml(body.untrustedHtml) : body.text;
        return { state: "ready" as const, body: { ...body, text: externalText }, sourceDigest: sourceDigest(bytes) };
      }),
    );
  }
  api.defineCapability(
    bindCapability(messageCacheDescriptors.remoteImages, async ({ signal }, { sourceDigest: approved, view, ...input }) => {
      const publicOnly = view === "conversation";
      const current = () => configured(input, publicOnly) && findCachedMessage(readSnapshot(files, input).snapshot, input.localMessageId);
      const message = current();
      if (!message) throw errors.notFound("该邮件已不在当前缓存。");
      const bytes = Buffer.from(message.source, "base64");
      if (sourceDigest(bytes) !== approved) throw errors.invalidInput("邮件正文已变化，请核对后重新加载图片。");
      const cancelled = AbortSignal.any([signal, lifetime, epoch.signal, removals.signal(input.accountId)]);
      cancelled.throwIfAborted();
      const body = await parseMessageBody(bytes);
      const assertCurrent = () => {
        cancelled.throwIfAborted();
        const latest = current();
        if (!latest || latest.source !== message.source) throw errors.invalidInput("邮件正文已变化，请核对后重新加载图片。");
      };
      assertCurrent();
      const result = body.untrustedHtml ? await loadRemoteImages(body.untrustedHtml, cancelled) : { images: [], failed: 0 };
      assertCurrent();
      return result;
    }),
  );
  api.defineCapability(
    bindCapability(messageCacheDescriptors.messagesMarkRead, (context, { requestId, expectedRevision, ...input }) => {
      const { caller, signal } = context;
      const name = messageCacheDescriptors.messagesMarkRead.name;
      authorize(caller, name);
      files.assertWritable();
      const cancelled = AbortSignal.any([signal, lifetime, epoch.signal, removals.signal(input.accountId)]);
      cancelled.throwIfAborted();
      return once(
        context,
        name,
        requestId,
        { ...input, expectedRevision },
        () =>
          serialize(input, async () => {
            cancelled.throwIfAborted();
            if (!isWorkbenchCaller(caller)) requireMailboxRevision(input, expectedRevision);
            const { record, snapshot, version } = readSnapshot(files, input);
            const message = findCachedMessage(snapshot, input.localMessageId);
            if (!record || !message || !accounts?.readDefinition(input.accountId)?.definition.folders.some(({ path }) => path === input.folder)) return { state: "needs-refresh" as const, remoteSynced: false };
            if (message.summary.readState === "synced") return { state: "synced" as const, remoteSynced: message.summary.transport === "imap" };
            let expectedVersion = version;
            if (message.summary.readState !== "local") {
              await writer.serialize(() => {
                cancelled.throwIfAborted();
                return preserveReadOverrides(files, input.accountId, [input.localMessageId]);
              });
              message.summary.readState = "local";
              message.localRead = true;
              expectedVersion = (await write(input, record, version, cancelled)).version;
            }
            cancelled.throwIfAborted();
            let state: "local" | "synced" | "needs-refresh" = "local";
            try {
              if (!isWorkbenchCaller(caller)) requireMailboxRevision(input, expectedRevision);
              if (message.summary.transport === "imap") state = await accounts.markRead(input.accountId, input.folder, message.summary.uidValidity, message.summary.uid, cancelled);
            } catch (error) {
              if (!(error instanceof CredentialError || error instanceof MailAccountError)) throw error;
            }
            cancelled.throwIfAborted();
            if (state === "synced") {
              message.summary.readState = state;
              await write(input, record, expectedVersion, cancelled);
            }
            return { state, remoteSynced: state === "synced" };
          }),
        (data) => data,
        (data) => data,
      );
    }),
  );
  return {
    refresh,
    signal: () => epoch.signal,
    versions: (accountId: string, folders: string[]) => folders.map((folder) => [folder, files.currentVersion(cachePath({ accountId, folder }))] as const),
    async drainAccount(accountId: string) {
      await Promise.allSettled([accountTails.get(accountId), ...[...writes.values()].filter((entry) => entry.accountId === accountId).map(({ task }) => task)]);
    },
    retireAccount(accountId: string, folders: string[]) {
      files.assertWritable();
      for (const relative of [readOverridePath(accountId), ...folders.map((folder) => cachePath({ accountId, folder }))]) {
        try {
          unlinkSync(files.abs(relative));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    },
    async drain() {
      await Promise.allSettled([drainCacheWork(), clearing]);
    },
  };
}
