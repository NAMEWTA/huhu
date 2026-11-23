import { mailTool, requireMailCaller } from "./tool-access.js";
import { createHash } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import { errors, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { mailDayFormatter } from "../mail-calendar.js";
import { isPublicMailFolder } from "../mail-folder-visibility.js";
import type { AccountRemovals } from "./account-removals.js";
import type { openMailAccounts } from "./accounts.js";
import { draftRecipient } from "./draft-content.js";
import { compareMailCopies, compareMailMessages, mailCopyIdentity, mailFolderRank, receivedMailDate } from "./mail-copies.js";
import { cachedMailboxMessages, gmailSummary, graphSummary, imapSummary, receivedLocation, receivedTarget } from "./message-cache.js";
import { operationIdSchema, OutboxStorage, type OutboxIntent, type OutboxRecord } from "./outbox-storage.js";
import { cachedPublicMail } from "./public-mail.js";
import { makeMailSearchText, searchWords } from "./search-text.js";

const accountId = imapSummary.shape.accountId;
const conversationId = z.hash("sha256", { enc: "hex" });
const dateWindow = z.strictObject({ zone: z.string().min(1).max(100), from: z.iso.date(), through: z.iso.date() }).refine(({ zone, from, through }) => {
  try {
    mailDayFormatter(zone);
    return from <= through;
  } catch {
    return false;
  }
});
const pageInput = z.strictObject({ accountId: accountId.optional(), time: dateWindow.optional(), offset: z.int().nonnegative().default(0), limit: z.int().min(1).max(100).default(20) });
const pageOutput = z.strictObject({ total: z.int().nonnegative(), nextOffset: z.int().nonnegative().nullable() });
const imapRow = imapSummary.extend({ source: z.literal("imap"), date: z.iso.datetime().nullable() });
const gmailRow = gmailSummary.extend({ source: z.literal("gmail"), date: z.iso.datetime().nullable() });
const graphRow = graphSummary.extend({ source: z.literal("graph"), date: z.iso.datetime().nullable() });
const sentRow = z.strictObject({ source: z.literal("sent"), accountId, operationId: operationIdSchema, subject: z.string(), date: z.iso.datetime() });
const conversationMessage = z.discriminatedUnion("source", [imapRow, gmailRow, graphRow, sentRow]);
const conversationSummary = z.strictObject({ conversationId, accountId, participants: z.array(draftRecipient).min(1), count: z.int().positive(), unread: z.int().nonnegative(), latest: conversationMessage });
const listOutput = pageOutput.extend({ conversations: z.array(conversationSummary) });
const messagesOutput = pageOutput.extend({ messages: z.array(conversationMessage) });
const locationTarget = z.discriminatedUnion("source", [...receivedTarget.options, sentRow.pick({ source: true, accountId: true, operationId: true })]);
const locatedMessage = z.strictObject({ conversationId, contactOffset: z.int().nonnegative(), messageOffset: z.int().nonnegative(), message: conversationMessage });
const searchHit = z.strictObject({ target: locationTarget, subject: z.string(), senderNames: z.array(z.string()), participants: z.array(draftRecipient), date: z.iso.datetime().nullable(), excerpt: z.string() });
const searchOutput = pageOutput.extend({ hits: z.array(searchHit), cachedMessages: z.int().nonnegative() });

export type ConversationSummary = z.infer<typeof conversationSummary>;
export type ConversationMessage = z.infer<typeof conversationMessage>;
export type ConversationsPage = z.infer<typeof listOutput>;
export type ConversationMessagesPage = z.infer<typeof messagesOutput>;
export type MailLocationTarget = z.infer<typeof locationTarget>;
export type LocatedMessage = z.infer<typeof locatedMessage>;
export type MailSearchPage = z.infer<typeof searchOutput>;

type SearchBody = { matches: boolean; excerpt: string };
type Candidate = { message: ConversationMessage; addresses: string[]; senderNames?: string[]; internetId?: string; rank: number; body?: SearchBody };
type VisibleMessage = Pick<Candidate, "message" | "body"> & { publicAddresses: Set<string>; senderNames: string[] };
type ConversationGroups = Map<string, { participants: string[]; entries: VisibleMessage[] }>;

function isPublicSent(record: OutboxRecord): record is OutboxIntent {
  if ("deleted" in record || !record.result) return false;
  const published = new Set([...record.draft.to, ...record.draft.cc]);
  return record.result.recipients.some(({ address, state }) => state === "accepted" && published.has(address));
}

function paginate<T>(rows: T[], { offset, limit }: { offset: number; limit: number }) {
  return { rows: rows.slice(offset, offset + limit), total: rows.length, nextOffset: offset + limit < rows.length ? offset + limit : null };
}

function bodyMatch(content: string, text: string): SearchBody {
  const at = searchWords(content).indexOf(text);
  const start = Math.max(0, at - 40);
  const end = start + Math.max(160, text.length + 60);
  return { matches: at >= 0, excerpt: (start ? "…" : "") + content.slice(start, end) + (content.length > end ? "…" : "") };
}

function groupCandidates(candidates: Candidate[], own: ReadonlySet<string>, scope: string | undefined, time?: z.infer<typeof dateWindow>) {
  candidates.sort(compareMailCopies);
  const unique = new Map<string, { entry: VisibleMessage; addresses: Set<string> }>();
  for (const candidate of candidates) {
    const { message, addresses, body, senderNames } = candidate;
    const key = mailCopyIdentity(candidate);
    let item = unique.get(key);
    if (!item) unique.set(key, (item = { entry: { message, publicAddresses: new Set(), senderNames: senderNames ?? [], ...(body && { body }) }, addresses: new Set() }));
    for (const address of addresses) {
      item.entry.publicAddresses.add(address);
      if (!own.has(address)) item.addresses.add(address);
    }
  }
  const localDay = time && mailDayFormatter(time.zone);
  const groups: ConversationGroups = new Map();
  for (const { entry, addresses } of unique.values()) {
    if (!addresses.size) continue;
    if (time && localDay) {
      const day = entry.message.date && localDay(new Date(entry.message.date));
      if (!day || day < time.from || day > time.through) continue;
    }
    const participants = [...addresses].sort();
    const id = createHash("sha256")
      .update(JSON.stringify([scope ?? null, participants]))
      .digest("hex");
    let group = groups.get(id);
    if (!group) groups.set(id, (group = { participants, entries: [] }));
    group.entries.push(entry);
  }
  for (const { entries } of groups.values()) entries.sort((a, b) => compareMailMessages(a.message, b.message));
  return groups;
}

function summarize(groups: ConversationGroups) {
  return [...groups]
    .map(([id, { participants, entries }]) => {
      const latest = entries[0]!.message;
      return {
        conversationId: id,
        accountId: latest.accountId,
        participants,
        latest,
        count: entries.length,
        unread: entries.filter(({ message }) => message.source !== "sent" && message.readState === "unread").length,
      };
    })
    .sort((a, b) => compareMailMessages(a.latest, b.latest) || a.conversationId.localeCompare(b.conversationId));
}

function targetOf(message: ConversationMessage): MailLocationTarget {
  if (message.source === "sent") return { source: "sent", accountId: message.accountId, operationId: message.operationId };
  return receivedLocation(message);
}

function sameTarget(message: ConversationMessage, target: MailLocationTarget) {
  if (message.accountId !== target.accountId) return false;
  if (target.source === "sent") return message.source === "sent" && message.operationId === target.operationId;
  if (message.source === "sent" || message.localMessageId !== target.localMessageId || message.folder !== target.folder) return false;
  if (target.source !== "imap") return message.source === target.source && message.nativeId === target.nativeId;
  return message.source === "imap" && message.uidValidity === target.uidValidity && message.uid === target.uid;
}

export const conversationsDescriptors = {
  conversationsList: defineCapabilityDescriptor({ ...mailTool, name: "mail.conversations.list", title: "列出邮件对话", description: "按邮箱和时间范围读取公开对话。", risk: "high", input: pageInput, output: listOutput, scope: "read" }),
  conversationsMessages: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.conversations.messages",
    title: "列出对话邮件",
    description: "按邮箱、对话和时间范围读取邮件。",
    risk: "high",
    input: pageInput.extend({ conversationId }),
    output: messagesOutput,
    scope: "read",
  }),
  conversationsSearch: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.conversations.search",
    title: "搜索邮件",
    description: "在公开缓存内搜索邮件。",
    risk: "high",
    input: pageInput.extend({ text: z.string().trim().min(1).max(200) }),
    output: searchOutput,
    scope: "read",
  }),
  conversationsFindMessage: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.conversations.findMessage",
    title: "定位对话邮件",
    description: "读取指定邮件在对话中的位置。",
    risk: "high",
    input: z.strictObject({ target: locationTarget, limit: pageInput.shape.limit }),
    output: locatedMessage.nullable(),
    scope: "read",
  }),
  conversationsSentBody: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.conversations.sentBody",
    title: "读取已发正文",
    description: "读取公开对话内的本机已发正文。",
    risk: "high",
    input: sentRow.pick({ accountId: true, operationId: true }),
    output: z.strictObject({ text: z.string() }),
    scope: "read",
  }),
};

export function registerConversations(
  api: HuhuApi,
  accounts: ReturnType<typeof openMailAccounts> | undefined,
  removals: AccountRemovals,
  lifetime: AbortSignal,
  cache: { signal(): AbortSignal },
  searchText: ReturnType<typeof makeMailSearchText>,
) {
  const files = api.vault.files;
  const outbox = new OutboxStorage(files);
  function authorize(caller: string, capability: string) {
    requireMailCaller(caller, capability);
  }

  async function readGroups({ accountId: scope, time }: Pick<z.infer<typeof pageInput>, "accountId" | "time">, request: AbortSignal, text?: string, remember = true) {
    const signal = AbortSignal.any([request, lifetime, cache.signal()]);
    const rows = (await accounts?.list()) ?? [];
    const own = new Set(rows.map(({ definition }) => definition.settings.email.trim().toLowerCase()));
    const selected = rows.filter(({ accountId }) => !scope || scope === accountId);
    const selectedVersions = new Map(selected.map(({ accountId, revision }) => [accountId, revision]));
    const candidates: Candidate[] = [];
    let indexed = 0;
    for (const account of selected) {
      for (const folder of account.definition.folders.filter(isPublicMailFolder)) {
        signal.throwIfAborted();
        const rank = mailFolderRank(folder);
        for (const entry of cachedMailboxMessages(files, { accountId: account.accountId, folder: folder.path })) {
          const info = await cachedPublicMail(entry, !!text);
          if (!info) continue;
          const date = receivedMailDate(entry, info);
          const summary = entry.summary;
          const message: ConversationMessage = summary.transport === "imap" ? { ...summary, source: "imap", date } : summary.transport === "gmail" ? { ...summary, source: "gmail", date } : { ...summary, source: "graph", date };
          if (text && ++indexed % 16 === 0) await setImmediate(undefined, { signal });
          signal.throwIfAborted();
          const body = text ? bodyMatch(await searchText.read(entry.source, signal, remember), text) : undefined;
          candidates.push({
            message,
            addresses: info.participants,
            rank,
            ...(info.senderNames && { senderNames: info.senderNames }),
            ...(info.internetId && { internetId: info.internetId }),
            ...(body && { body }),
          });
        }
      }
    }
    for (const record of outbox.records()) {
      signal.throwIfAborted();
      if (!isPublicSent(record) || !record.draft.accountId || !selectedVersions.has(record.draft.accountId)) continue;
      const { draft, operationId, messageId, result, claimedAt } = record;
      const message: ConversationMessage = { source: "sent", accountId: record.draft.accountId, operationId, subject: draft.subject, date: result?.finishedAt ?? claimedAt };
      candidates.push({ message, addresses: [record.from.toLowerCase(), ...draft.to, ...draft.cc], internetId: messageId, rank: 3, ...(text && { body: bodyMatch(record.text.replace(/\s+/g, " ").trim(), text) }) });
    }
    const active = await activeVersions(selectedVersions, signal);
    return groupCandidates(
      candidates.filter(({ message }) => active.has(message.accountId)),
      own,
      scope,
      time,
    );
  }

  async function activeVersions(versions: ReadonlyMap<string, string>, signal: AbortSignal) {
    const current = (await accounts?.list()) ?? [];
    signal.throwIfAborted();
    return new Set(current.filter(({ accountId, revision }) => versions.get(accountId) === revision && !removals.read(accountId)).map(({ accountId }) => accountId));
  }

  api.defineCapability(
    bindCapability(conversationsDescriptors.conversationsList, async ({ caller, signal }, input) => {
      authorize(caller, "mail.conversations.list");
      const groups = await readGroups(input, signal);
      const { rows, ...page } = paginate(summarize(groups), input);
      return { ...page, conversations: rows };
    }),
  );
  api.defineCapability(
    bindCapability(conversationsDescriptors.conversationsMessages, async ({ caller, signal }, input) => {
      authorize(caller, "mail.conversations.messages");
      const groups = await readGroups(input, signal);
      const group = groups.get(input.conversationId);
      const { rows, ...page } = paginate(group?.entries.map(({ message }) => message) ?? [], input);
      return { ...page, messages: rows };
    }),
  );
  api.defineCapability(
    bindCapability(conversationsDescriptors.conversationsSearch, async ({ caller, signal: request }, input) => {
      authorize(caller, "mail.conversations.search");
      const text = searchWords(input.text);
      const groups = await readGroups(input, request, text, isWorkbenchCaller(caller));
      const entries = [...groups.values()].flatMap(({ participants, entries }) => entries.map((entry) => ({ ...entry, participants })));
      entries.sort((a, b) => compareMailMessages(a.message, b.message));
      const hits: z.infer<typeof searchHit>[] = [];
      for (const { message, participants, publicAddresses, senderNames, body } of entries) {
        if (!body?.matches && ![message.subject, ...senderNames, ...publicAddresses].some((value) => searchWords(value).includes(text))) continue;
        hits.push({
          target: targetOf(message),
          subject: message.subject,
          senderNames,
          participants,
          date: message.date,
          excerpt: body?.excerpt ?? "",
        });
      }
      const { rows, ...page } = paginate(hits, input);
      return { ...page, hits: rows, cachedMessages: entries.length };
    }),
  );
  api.defineCapability(
    bindCapability(conversationsDescriptors.conversationsFindMessage, async ({ caller, signal }, { target, limit }) => {
      authorize(caller, "mail.conversations.findMessage");
      const groups = await readGroups({ accountId: target.accountId }, signal);
      const contacts = summarize(groups);
      for (const [index, contact] of contacts.entries()) {
        const entries = groups.get(contact.conversationId)!.entries;
        const row = entries.findIndex(({ message }) => sameTarget(message, target));
        if (row !== -1) {
          return {
            conversationId: contact.conversationId,
            contactOffset: Math.floor(index / limit) * limit,
            messageOffset: Math.floor(row / limit) * limit,
            message: entries[row]!.message,
          };
        }
      }
      return null;
    }),
  );
  api.defineCapability(
    bindCapability(conversationsDescriptors.conversationsSentBody, async ({ caller, signal }, input) => {
      authorize(caller, "mail.conversations.sentBody");
      const rows = (await accounts?.list()) ?? [];
      signal.throwIfAborted();
      lifetime.throwIfAborted();
      const own = new Set(rows.map(({ definition }) => definition.settings.email.trim().toLowerCase()));
      const record = outbox.read(input.operationId)?.record;
      if (
        removals.read(input.accountId) ||
        !rows.some(({ accountId }) => accountId === input.accountId) ||
        !record ||
        !isPublicSent(record) ||
        record.draft.accountId !== input.accountId ||
        ![...record.draft.to, ...record.draft.cc].some((address) => !own.has(address))
      )
        throw errors.notFound("此邮件已不在公开对话中。");
      return { text: record.text };
    }),
  );
}
