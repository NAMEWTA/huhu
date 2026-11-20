import { createHash } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import { errors, isWorkbenchCaller } from "@huhu/contracts";
import { defineCapability, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { mailDayFormatter } from "../mail-calendar.js";
import { isPublicMailFolder, mailFolderRole } from "../mail-folder-visibility.js";
import { isInbox } from "./account-definition.js";
import type { AccountRemovals } from "./account-removals.js";
import type { openMailAccounts } from "./accounts.js";
import { draftRecipient } from "./draft-content.js";
import { cachedMailboxMessages, cachedSummary } from "./message-cache.js";
import { operationIdSchema, OutboxStorage, type OutboxIntent, type OutboxRecord } from "./outbox-storage.js";
import { readPublicMail } from "./public-mail.js";
import { makeMailSearchText, searchWords } from "./search-text.js";

const accountId = cachedSummary.shape.accountId;
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
const imapRow = cachedSummary.extend({ source: z.literal("imap"), date: z.iso.datetime().nullable() });
const sentRow = z.strictObject({ source: z.literal("sent"), accountId, operationId: operationIdSchema, subject: z.string(), date: z.iso.datetime() });
const conversationMessage = z.discriminatedUnion("source", [imapRow, sentRow]);
const conversationSummary = z.strictObject({ conversationId, accountId, participants: z.array(draftRecipient).min(1), count: z.int().positive(), unread: z.int().nonnegative(), latest: conversationMessage });
const listOutput = pageOutput.extend({ conversations: z.array(conversationSummary) });
const messagesOutput = pageOutput.extend({ messages: z.array(conversationMessage) });
const locationTarget = z.discriminatedUnion("source", [imapRow.pick({ source: true, accountId: true, folder: true, localMessageId: true, uidValidity: true, uid: true }), sentRow.pick({ source: true, accountId: true, operationId: true })]);
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
const messageKey = (message: ConversationMessage) => (message.source === "imap" ? message.localMessageId : message.operationId);

function compareMessages(a: ConversationMessage, b: ConversationMessage) {
  return (b.date ?? "").localeCompare(a.date ?? "") || a.source.localeCompare(b.source) || (a.source === "imap" && b.source === "imap" ? b.uid - a.uid : 0) || messageKey(a).localeCompare(messageKey(b));
}

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
  candidates.sort((a, b) => a.rank - b.rank || compareMessages(a.message, b.message));
  const unique = new Map<string, { entry: VisibleMessage; addresses: Set<string> }>();
  for (const { message, addresses, internetId, body, senderNames } of candidates) {
    const key = JSON.stringify(internetId ? [message.accountId, internetId] : [message.accountId, message.source, messageKey(message)]);
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
  for (const { entries } of groups.values()) entries.sort((a, b) => compareMessages(a.message, b.message));
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
        unread: entries.filter(({ message }) => message.source === "imap" && message.readState === "unread").length,
      };
    })
    .sort((a, b) => compareMessages(a.latest, b.latest) || a.conversationId.localeCompare(b.conversationId));
}

function targetOf(message: ConversationMessage): MailLocationTarget {
  if (message.source === "sent") return { source: "sent", accountId: message.accountId, operationId: message.operationId };
  const { accountId, folder, localMessageId, uidValidity, uid } = message;
  return { source: "imap", accountId, folder, localMessageId, uidValidity, uid };
}

function sameTarget(message: ConversationMessage, target: MailLocationTarget) {
  if (message.accountId !== target.accountId) return false;
  if (target.source === "sent") return message.source === "sent" && message.operationId === target.operationId;
  return message.source === "imap" && message.localMessageId === target.localMessageId && message.folder === target.folder && message.uidValidity === target.uidValidity && message.uid === target.uid;
}

export function registerConversations(api: HuhuApi, accounts: ReturnType<typeof openMailAccounts> | undefined, removals: AccountRemovals, lifetime: AbortSignal) {
  const files = api.vault.files;
  const outbox = new OutboxStorage(files);
  const searchText = makeMailSearchText();
  const internal = { plugin: "mail", scope: "read", exposable: false, defaultExposed: false } as const;
  function authorize(caller: string, capability: string) {
    if (!isWorkbenchCaller(caller)) throw errors.permissionDenied(capability);
  }

  async function readGroups({ accountId: scope, time }: Pick<z.infer<typeof pageInput>, "accountId" | "time">, request: AbortSignal, text?: string) {
    const signal = AbortSignal.any([request, lifetime]);
    const rows = (await accounts?.list()) ?? [];
    const own = new Set(rows.map(({ definition }) => definition.settings.email.trim().toLowerCase()));
    const selected = rows.filter(({ accountId }) => !scope || scope === accountId);
    const selectedVersions = new Map(selected.map(({ accountId, revision }) => [accountId, revision]));
    const candidates: Candidate[] = [];
    let indexed = 0;
    for (const account of selected) {
      for (const folder of account.definition.folders.filter(isPublicMailFolder)) {
        signal.throwIfAborted();
        const rank = isInbox(folder.path) ? 0 : mailFolderRole(folder.specialUse ?? "") === "sent" ? 1 : 2;
        for (const entry of cachedMailboxMessages(files, { accountId: account.accountId, folder: folder.path })) {
          const existing = entry.publicMail;
          const info = existing && (!text || existing.senderNames) ? existing : ((await readPublicMail(Buffer.from(entry.source, "base64")).catch(() => undefined)) ?? existing);
          if (!info) continue;
          const message: ConversationMessage = { ...entry.summary, source: "imap", date: info.date ?? entry.cachedAt ?? null };
          if (text && ++indexed % 16 === 0) await setImmediate(undefined, { signal });
          signal.throwIfAborted();
          const body = text ? bodyMatch(await searchText(entry.source), text) : undefined;
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
    defineCapability({
      ...internal,
      name: "mail.conversations.list",
      input: pageInput,
      output: listOutput,
      async handler({ caller, signal }, input) {
        authorize(caller, "mail.conversations.list");
        const groups = await readGroups(input, signal);
        const { rows, ...page } = paginate(summarize(groups), input);
        return { ...page, conversations: rows };
      },
    }),
  );
  api.defineCapability(
    defineCapability({
      ...internal,
      name: "mail.conversations.messages",
      input: pageInput.extend({ conversationId }),
      output: messagesOutput,
      async handler({ caller, signal }, input) {
        authorize(caller, "mail.conversations.messages");
        const groups = await readGroups(input, signal);
        const group = groups.get(input.conversationId);
        const { rows, ...page } = paginate(group?.entries.map(({ message }) => message) ?? [], input);
        return { ...page, messages: rows };
      },
    }),
  );
  api.defineCapability(
    defineCapability({
      ...internal,
      name: "mail.conversations.search",
      input: pageInput.extend({ text: z.string().trim().min(1).max(200) }),
      output: searchOutput,
      async handler({ caller, signal: request }, input) {
        authorize(caller, "mail.conversations.search");
        const text = searchWords(input.text);
        const groups = await readGroups(input, request, text);
        const entries = [...groups.values()].flatMap(({ participants, entries }) => entries.map((entry) => ({ ...entry, participants })));
        entries.sort((a, b) => compareMessages(a.message, b.message));
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
      },
    }),
  );
  api.defineCapability(
    defineCapability({
      ...internal,
      name: "mail.conversations.findMessage",
      input: z.strictObject({ target: locationTarget, limit: pageInput.shape.limit }),
      output: locatedMessage.nullable(),
      async handler({ caller, signal }, { target, limit }) {
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
      },
    }),
  );
  api.defineCapability(
    defineCapability({
      ...internal,
      name: "mail.conversations.sentBody",
      input: sentRow.pick({ accountId: true, operationId: true }),
      output: z.strictObject({ text: z.string() }),
      async handler({ caller, signal }, input) {
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
      },
    }),
  );
}
