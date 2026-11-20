import { createHash } from "node:crypto";
import { errors, isWorkbenchCaller } from "@huhu/contracts";
import { defineCapability, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { isPublicMailFolder, mailFolderRole } from "../mail-folder-visibility.js";
import { isInbox } from "./account-definition.js";
import type { AccountRemovals } from "./account-removals.js";
import type { openMailAccounts } from "./accounts.js";
import { draftRecipient } from "./draft-content.js";
import { cachedMailboxMessages, cachedSummary } from "./message-cache.js";
import { operationIdSchema, OutboxStorage, type OutboxIntent, type OutboxRecord } from "./outbox-storage.js";
import { readPublicMail } from "./public-mail.js";

const accountId = cachedSummary.shape.accountId;
const conversationId = z.hash("sha256", { enc: "hex" });
const pageInput = z.strictObject({ accountId: accountId.optional(), offset: z.int().nonnegative().default(0), limit: z.int().min(1).max(100).default(20) });
const pageOutput = z.strictObject({ total: z.int().nonnegative(), nextOffset: z.int().nonnegative().nullable() });
const imapRow = cachedSummary.extend({ source: z.literal("imap"), date: z.iso.datetime().nullable() });
const sentRow = z.strictObject({ source: z.literal("sent"), accountId, operationId: operationIdSchema, subject: z.string(), date: z.iso.datetime() });
const conversationMessage = z.discriminatedUnion("source", [imapRow, sentRow]);
const conversationSummary = z.strictObject({ conversationId, accountId, participants: z.array(draftRecipient).min(1), count: z.int().positive(), unread: z.int().nonnegative(), latest: conversationMessage });
const listOutput = pageOutput.extend({ conversations: z.array(conversationSummary) });
const messagesOutput = pageOutput.extend({ messages: z.array(conversationMessage) });

export type ConversationSummary = z.infer<typeof conversationSummary>;
export type ConversationMessage = z.infer<typeof conversationMessage>;
export type ConversationsPage = z.infer<typeof listOutput>;
export type ConversationMessagesPage = z.infer<typeof messagesOutput>;

type Candidate = { message: ConversationMessage; addresses: string[]; internetId?: string; rank: number };
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

function groupCandidates(candidates: Candidate[], own: ReadonlySet<string>, scope: string | undefined) {
  candidates.sort((a, b) => a.rank - b.rank || compareMessages(a.message, b.message));
  const unique = new Map<string, { message: ConversationMessage; addresses: Set<string> }>();
  for (const { message, addresses, internetId } of candidates) {
    const key = JSON.stringify(internetId ? [message.accountId, internetId] : [message.accountId, message.source, messageKey(message)]);
    let item = unique.get(key);
    if (!item) unique.set(key, (item = { message, addresses: new Set() }));
    for (const address of addresses) if (!own.has(address)) item.addresses.add(address);
  }
  const groups = new Map<string, { participants: string[]; messages: ConversationMessage[] }>();
  for (const { message, addresses } of unique.values()) {
    if (!addresses.size) continue;
    const participants = [...addresses].sort();
    const id = createHash("sha256")
      .update(JSON.stringify([scope ?? null, participants]))
      .digest("hex");
    let group = groups.get(id);
    if (!group) groups.set(id, (group = { participants, messages: [] }));
    group.messages.push(message);
  }
  return groups;
}

export function registerConversations(api: HuhuApi, accounts: ReturnType<typeof openMailAccounts> | undefined, removals: AccountRemovals, lifetime: AbortSignal) {
  const files = api.vault.files;
  const outbox = new OutboxStorage(files);
  const internal = { plugin: "mail", scope: "read", exposable: false, defaultExposed: false } as const;
  function authorize(caller: string, capability: string) {
    if (!isWorkbenchCaller(caller)) throw errors.permissionDenied(capability);
  }

  async function readGroups(scope: string | undefined, request: AbortSignal) {
    const signal = AbortSignal.any([request, lifetime]);
    const rows = (await accounts?.list()) ?? [];
    const own = new Set(rows.map(({ definition }) => definition.settings.email.trim().toLowerCase()));
    const selected = rows.filter(({ accountId }) => !scope || scope === accountId);
    const selectedIds = new Set(selected.map(({ accountId }) => accountId));
    const candidates: Candidate[] = [];
    for (const account of selected) {
      for (const folder of account.definition.folders.filter(isPublicMailFolder)) {
        signal.throwIfAborted();
        const rank = isInbox(folder.path) ? 0 : mailFolderRole(folder.specialUse ?? "") === "sent" ? 1 : 2;
        for (const entry of cachedMailboxMessages(files, { accountId: account.accountId, folder: folder.path })) {
          const info = entry.publicMail ?? (await readPublicMail(Buffer.from(entry.source, "base64")).catch(() => undefined));
          if (!info) continue;
          const message: ConversationMessage = { ...entry.summary, source: "imap", date: info.date ?? entry.cachedAt ?? null };
          candidates.push({ message, addresses: info.participants, rank, ...(info.internetId && { internetId: info.internetId }) });
        }
      }
    }
    for (const record of outbox.records()) {
      signal.throwIfAborted();
      if (!isPublicSent(record) || !record.draft.accountId || !selectedIds.has(record.draft.accountId)) continue;
      const { draft, operationId, messageId, result, claimedAt } = record;
      const message: ConversationMessage = { source: "sent", accountId: record.draft.accountId, operationId, subject: draft.subject, date: result?.finishedAt ?? claimedAt };
      candidates.push({ message, addresses: [record.from.toLowerCase(), ...draft.to, ...draft.cc], internetId: messageId, rank: 3 });
    }
    signal.throwIfAborted();
    const active = new Set([...selectedIds].filter((id) => !removals.read(id)));
    return groupCandidates(
      candidates.filter(({ message }) => active.has(message.accountId)),
      own,
      scope,
    );
  }

  api.defineCapability(
    defineCapability({
      ...internal,
      name: "mail.conversations.list",
      input: pageInput,
      output: listOutput,
      async handler({ caller, signal }, input) {
        authorize(caller, "mail.conversations.list");
        const groups = await readGroups(input.accountId, signal);
        const summaries = [...groups]
          .map(([id, { participants, messages }]) => {
            const latest = messages.sort(compareMessages)[0]!;
            return {
              conversationId: id,
              accountId: latest.accountId,
              participants,
              latest,
              count: messages.length,
              unread: messages.filter((message) => message.source === "imap" && message.readState === "unread").length,
            };
          })
          .sort((a, b) => compareMessages(a.latest, b.latest) || a.conversationId.localeCompare(b.conversationId));
        const { rows, ...page } = paginate(summaries, input);
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
        const group = (await readGroups(input.accountId, signal)).get(input.conversationId);
        const { rows, ...page } = paginate(group?.messages.sort(compareMessages) ?? [], input);
        return { ...page, messages: rows };
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
