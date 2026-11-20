import { createHash } from "node:crypto";
import { unlinkSync } from "node:fs";
import { errors, HuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, CredentialError, defineCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { isPublicMailFolder } from "../mail-folder-visibility.js";
import type { AccountRemovals } from "./account-removals.js";
import type { openMailAccounts } from "./accounts.js";
import { MailAccountError } from "./discovery.js";
import type { MailDrafts } from "./drafts.js";
import { forwardContext } from "./forward-context.js";
import { MAX_IMAP_SOURCE_BYTES } from "./imap-message.js";
import { messageBody, parseMessageBody } from "./message-body.js";
import { forwardSeed, forwardSource, newTopicRecipients, newTopicSeed, sourceDigest } from "./prepare-forward.js";
import { prepareReply, replyMode, replySeed } from "./prepare-reply.js";
import { publicMail, readPublicMail } from "./public-mail.js";
import { sourceMessage } from "./reply-context.js";

const mailbox = sourceMessage.omit({ localMessageId: true });
const uidValidity = z.string().regex(/^[1-9][0-9]*$/);
const readState = z.enum(["unread", "local", "synced"]);
export const cachedSummary = mailbox.extend({
  localMessageId: sourceMessage.shape.localMessageId,
  uidValidity,
  uid: z.int().positive(),
  subject: z.string(),
  transport: z.literal("imap"),
  readState: readState.optional(),
});
const summary = cachedSummary;
const cacheEntry = z.strictObject({
  summary,
  source: z.base64().max(Math.ceil(MAX_IMAP_SOURCE_BYTES / 3) * 4),
  publicMail: publicMail.optional(),
  cachedAt: z.iso.datetime().optional(),
  localRead: z.literal(true).optional(),
  deleted: z.literal(true).optional(),
});
const messageKey = sourceMessage;
const maxCachedMessages = 200;
const maxCacheSourceChars = 24 * 1024 * 1024;
const cacheSnapshot = z.strictObject({
  format: z.literal(1),
  uidValidity,
  through: z.int().nonnegative().optional(),
  pendingNotices: z.array(sourceMessage.shape.localMessageId).max(maxCachedMessages).optional(),
  message: cacheEntry.nullable(),
  history: z
    .array(cacheEntry)
    .max(maxCachedMessages - 1)
    .optional(),
});
type Mailbox = z.infer<typeof mailbox>;
type Snapshot = z.infer<typeof cacheSnapshot>;
type CacheEntry = z.infer<typeof cacheEntry>;
type Files = HuhuApi["vault"]["files"];

const internal = { plugin: "mail", risk: "normal", exposable: false, defaultExposed: false } as const;

export const mailRefreshDescriptor = defineCapabilityDescriptor({
  ...internal,
  name: "mail.sync.refresh",
  title: "刷新邮箱目录",
  description: "分批刷新已选 IMAP 目录的邮件和已读状态。",
  timeoutMs: 90_000,
  scope: "write",
  input: mailbox,
  output: z.strictObject({ message: summary.nullable(), mailboxChanged: z.boolean() }),
});
export const mailLatestMessageDescriptor = defineCapabilityDescriptor({
  ...internal,
  name: "mail.messages.latest",
  title: "最新邮件",
  description: "从此 Vault 读取所选目录已缓存的最新邮件摘要。",
  scope: "read",
  input: mailbox,
  output: z.strictObject({ message: summary.nullable() }),
});
export const mailMessageSourceDescriptor = defineCapabilityDescriptor({
  ...internal,
  name: "mail.messages.loadSource",
  title: "读取邮件原文",
  description: "读取同一账号、目录和消息代的本机邮件原文。",
  scope: "read",
  input: messageKey,
  output: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("ready"), message: summary, source: z.base64() }), z.strictObject({ state: z.literal("needs-refresh") })]),
});

const digest = (parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const cachePath = ({ accountId, folder }: Mailbox) => `.huhu/cache/mail/${digest([accountId, folder])}.json`;
const messageId = ({ accountId, folder }: Mailbox, validity: string, uid: number) => digest([accountId, folder, validity, uid]);

function readSnapshot(files: Files, input: Mailbox): { snapshot: Snapshot | null; version: string | null } {
  const current = files.read(cachePath(input));
  if (!current) return { snapshot: null, version: null };
  try {
    const snapshot = cacheSnapshot.parse(JSON.parse(current.bytes.toString("utf8")));
    const entries = cachedEntries(snapshot);
    if (
      entries.every(({ summary: item }) => item.accountId === input.accountId && item.folder === input.folder && item.uidValidity === snapshot.uidValidity && item.localMessageId === messageId(input, item.uidValidity, item.uid)) &&
      new Set(entries.map(({ summary }) => summary.uid)).size === entries.length
    ) {
      return { snapshot, version: current.version };
    }
  } catch {
    // A subsequent refresh can replace this rebuildable record.
  }
  return { snapshot: null, version: current.version };
}

function cachedEntries(snapshot: Snapshot | null): CacheEntry[] {
  if (!snapshot) return [];
  return [...(snapshot.message ? [snapshot.message] : []), ...(snapshot.history ?? [])];
}

export function cachedMailboxMessages(files: Files, input: Mailbox) {
  return cachedEntries(readSnapshot(files, input).snapshot).filter(({ deleted }) => !deleted);
}

function findCachedMessage(snapshot: Snapshot | null, localMessageId: string) {
  return cachedEntries(snapshot).find(({ summary, deleted }) => !deleted && summary.localMessageId === localMessageId);
}

export function requireCachedMessage(files: Files, input: z.infer<typeof sourceMessage>) {
  const message = findCachedMessage(readSnapshot(files, input).snapshot, input.localMessageId);
  if (!message) throw errors.notFound("原邮件已不在当前缓存，请同步后重新打开。");
  return message;
}

export type MailNotificationSink = (notice: { id: string; module: "mail"; title: string }) => void;

export function registerMessageCache(api: HuhuApi, accounts: ReturnType<typeof openMailAccounts> | undefined, lifetime: AbortSignal, removals: AccountRemovals, writer: Pick<MailDrafts, "serialize">, notify?: MailNotificationSink) {
  const files = api.vault.files;
  const writes = new Map<string, { accountId: string; task: Promise<unknown> }>();
  const authorize = (caller: string, name: string) => {
    if (!isWorkbenchCaller(caller)) throw errors.permissionDenied(name);
  };
  function serialize<T>(input: Mailbox, run: () => Promise<T>): Promise<T> {
    const key = cachePath(input);
    const task = (writes.get(key)?.task ?? Promise.resolve()).catch(() => undefined).then(run);
    writes.set(key, { accountId: input.accountId, task });
    return task.finally(() => {
      if (writes.get(key)?.task === task) writes.delete(key);
    });
  }
  function write(input: Mailbox, snapshot: Snapshot, expectedVersion: string | null, signal: AbortSignal, validate?: () => void) {
    return writer.serialize(() => {
      signal.throwIfAborted();
      removals.assertActive(input.accountId);
      validate?.();
      return files.write(cachePath(input), Buffer.from(JSON.stringify(snapshot) + "\n"), { expectedVersion });
    });
  }

  function noticeId(localMessageId: string) {
    return `ntf-mail-${digest([api.vault.vaultId, files.root, localMessageId])}`;
  }

  const jobs = new Map<string, { controller: AbortController; waiters: number; task: ReturnType<typeof syncMailbox> }>();
  const accountTails = new Map<string, Promise<unknown>>();

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
    let version = before.version;
    let mailboxChanged = false;
    const result = await accounts!.fetchMessages(
      input.accountId,
      input.folder,
      before.snapshot
        ? {
            uidValidity: before.snapshot.uidValidity,
            ...(before.snapshot.through !== undefined && { through: before.snapshot.through }),
            cached: cachedEntries(before.snapshot).map(({ summary, source }) => ({ uid: summary.uid, size: Buffer.byteLength(source, "base64") })),
          }
        : undefined,
      async (validity) => {
        assertCurrent();
        ({ version } = await write(input, { format: 1, uidValidity: validity, message: null }, version, signal, assertCurrent));
        mailboxChanged = true;
        api.events.publish("entity.changed", { kind: "mail-mailbox", id: input.accountId, op: "updated" });
      },
      signal,
    );
    assertCurrent();
    const previous = new Map(mailboxChanged ? [] : cachedEntries(before.snapshot).map((entry) => [entry.summary.uid, entry]));
    const entries: CacheEntry[] = [];
    let size = 0;
    for (const row of result.messages.sort((a, b) => b.uid - a.uid)) {
      const existing = previous.get(row.uid);
      if (row.deleted || (!existing && !row.source)) continue;
      const source = row.source?.toString("base64") ?? existing!.source;
      if (entries.length >= maxCachedMessages || size + source.length > maxCacheSourceChars) continue;
      const projection = row.source ? await readPublicMail(row.source).catch(() => undefined) : existing?.publicMail;
      const localRead = existing?.localRead || existing?.summary.readState === "local";
      const state = row.seen ? "synced" : localRead ? "local" : "unread";
      entries.push({
        summary: { ...input, uidValidity: result.uidValidity, uid: row.uid, localMessageId: messageId(input, result.uidValidity, row.uid), subject: row.subject, transport: "imap", readState: state },
        source,
        ...(projection && { publicMail: projection }),
        ...(localRead && { localRead: true }),
        cachedAt: existing?.cachedAt ?? new Date().toISOString(),
      });
      size += source.length;
    }
    assertCurrent();
    const unacknowledged = new Set(mailboxChanged ? [] : before.snapshot?.pendingNotices);
    const pending = entries
      .filter(({ summary, publicMail }) => {
        if (!publicMail) return false;
        if (unacknowledged.has(summary.localMessageId)) return true;
        return notify && !result.initial && input.folder.toLowerCase() === "inbox" && summary.uid > (before.snapshot?.through ?? 0) && summary.readState === "unread";
      })
      .map(({ summary }) => summary.localMessageId);
    const next: Snapshot = { format: 1, uidValidity: result.uidValidity, through: result.through, message: entries[0] ?? null, history: entries.slice(1), ...(pending.length && { pendingNotices: pending }) };
    if (JSON.stringify(before.snapshot) !== JSON.stringify(next)) {
      ({ version } = await write(input, next, version, signal, assertCurrent));
      assertCurrent();
      api.events.publish("entity.changed", { kind: "mail-message", id: input.accountId, op: "updated" });
    }
    if (notify && pending.length) {
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
        delete next.pendingNotices;
        if (failed.length) next.pendingNotices = failed;
        await write(input, next, version, signal, assertCurrent);
      }
    }
    const idle = result.canIdle && !result.more && input.folder.toLowerCase() === "inbox" ? { folder: input.folder, uidValidity: result.uidValidity, through: result.through } : undefined;
    return { message: next.message?.summary ?? null, mailboxChanged, more: result.more, idle };
  }

  function refresh(input: Mailbox, signal: AbortSignal) {
    files.assertWritable();
    if (!accounts) throw errors.invalidInput("此 Vault 的本机邮箱凭据不可用");
    signal.throwIfAborted();
    const key = cachePath(input);
    let active = jobs.get(key);
    if (!active || active.controller.signal.aborted) {
      const controller = new AbortController();
      const cancelled = AbortSignal.any([controller.signal, lifetime, removals.signal(input.accountId)]);
      const task = (accountTails.get(input.accountId) ?? Promise.resolve()).catch(() => undefined).then(() => serialize(input, () => syncMailbox(input, cancelled)));
      active = { controller, task, waiters: 0 };
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
    let abort: () => void;
    return new Promise<Awaited<typeof job.task>>((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      void job.task.then(resolve, reject);
    }).finally(() => {
      signal.removeEventListener("abort", abort);
      if (--job.waiters === 0 && jobs.get(key) === job) job.controller.abort();
    });
  }

  async function prepareRelated<T>(input: z.infer<typeof sourceMessage>, signal: AbortSignal, prepare: (bytes: Buffer, subject: string, sender: string | null, own: string[]) => Promise<T>) {
    const cancelled = AbortSignal.any([signal, lifetime, removals.signal(input.accountId)]);
    cancelled.throwIfAborted();
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
    bindCapability(mailRefreshDescriptor, async ({ caller, signal }, input) => {
      authorize(caller, mailRefreshDescriptor.name);
      try {
        const { message, mailboxChanged } = await refresh(input, signal);
        return { message, mailboxChanged };
      } catch (error) {
        if (!lifetime.aborted && error instanceof MailAccountError && error.code === "oauth-reauthorize") api.events.publish("entity.changed", { kind: "mail-account", id: input.accountId, op: "updated" });
        if (error instanceof MailAccountError || error instanceof CredentialError) throw new HuhuError("INVALID_INPUT", "无法刷新邮箱目录", { details: { reason: error.code } });
        throw error;
      }
    }),
  );
  api.defineCapability(
    defineCapability({
      ...internal,
      name: "mail.notifications.target",
      scope: "read",
      input: z.strictObject({ id: z.string().regex(/^ntf-mail-[0-9a-f]{64}$/) }),
      output: cachedSummary
        .pick({ accountId: true, folder: true, localMessageId: true, uidValidity: true, uid: true })
        .extend({ source: z.literal("imap") })
        .nullable(),
      async handler({ caller, signal }, { id }) {
        authorize(caller, "mail.notifications.target");
        const rows = (await accounts?.list()) ?? [];
        for (const account of rows) {
          signal.throwIfAborted();
          lifetime.throwIfAborted();
          if (removals.read(account.accountId) || accounts?.readDefinition(account.accountId)?.revision !== account.revision) continue;
          for (const folder of account.definition.folders) {
            if (folder.path.toLowerCase() !== "inbox" || !isPublicMailFolder(folder)) continue;
            const entry = cachedMailboxMessages(files, { accountId: account.accountId, folder: folder.path }).find(({ summary }) => noticeId(summary.localMessageId) === id);
            if (entry?.publicMail) {
              const { accountId, folder, localMessageId, uidValidity, uid } = entry.summary;
              return { source: "imap" as const, accountId, folder, localMessageId, uidValidity, uid };
            }
          }
        }
        return null;
      },
    }),
  );
  api.defineCapability(
    bindCapability(mailLatestMessageDescriptor, ({ caller }, input) => {
      authorize(caller, mailLatestMessageDescriptor.name);
      const message = removals.read(input.accountId) ? null : readSnapshot(files, input).snapshot?.message;
      return { message: message && !message.deleted ? message.summary : null };
    }),
  );
  api.defineCapability(
    bindCapability(mailMessageSourceDescriptor, ({ caller }, input) => {
      authorize(caller, mailMessageSourceDescriptor.name);
      const message = removals.read(input.accountId) ? undefined : findCachedMessage(readSnapshot(files, input).snapshot, input.localMessageId);
      return message ? { state: "ready" as const, message: message.summary, source: message.source } : { state: "needs-refresh" as const };
    }),
  );
  api.defineCapability(
    defineCapability({
      plugin: "mail",
      exposable: false,
      defaultExposed: false,
      name: "mail.messages.prepareReply",
      scope: "read",
      input: messageKey.extend({ mode: replyMode }),
      output: replySeed,
      handler: ({ caller, signal }, { mode, ...input }) => {
        authorize(caller, "mail.messages.prepareReply");
        return prepareRelated(input, signal, (bytes, subject, _sender, own) => prepareReply(bytes, input, subject, mode, own));
      },
    }),
  );
  api.defineCapability(
    defineCapability({
      ...internal,
      name: "mail.messages.prepareForward",
      scope: "read",
      input: messageKey,
      output: forwardSeed,
      handler: ({ caller, signal }, input) => {
        authorize(caller, "mail.messages.prepareForward");
        return prepareRelated(input, signal, async (bytes, subject, accountId) => {
          const { forward } = await forwardSource(bytes, input, subject);
          return { accountId, subject: `转发：${forward.subject}`.slice(0, 8192), forward };
        });
      },
    }),
  );
  api.defineCapability(
    defineCapability({
      ...internal,
      name: "mail.messages.prepareNewTopic",
      scope: "read",
      input: messageKey,
      output: newTopicSeed,
      handler: ({ caller, signal }, input) => {
        authorize(caller, "mail.messages.prepareNewTopic");
        return prepareRelated(input, signal, async (bytes, _subject, accountId, own) => ({ accountId, to: await newTopicRecipients(bytes, own) }));
      },
    }),
  );
  const bodyOutput = z.discriminatedUnion("state", [z.strictObject({ state: z.literal("ready"), body: messageBody, sourceDigest: forwardContext.shape.sourceDigest }), z.strictObject({ state: z.literal("needs-refresh") })]);
  async function isPublicSource({ accountId, folder }: Mailbox) {
    const current = (await accounts?.list())?.find((account) => account.accountId === accountId);
    return !removals.read(accountId) && current?.definition.folders.some((row) => row.path === folder && isPublicMailFolder(row));
  }
  for (const [name, publicOnly] of [
    ["mail.messages.loadBody", false],
    ["mail.conversations.loadBody", true],
  ] as const) {
    api.defineCapability(
      defineCapability({
        ...internal,
        name,
        scope: "read",
        input: messageKey,
        output: bodyOutput,
        async handler({ caller, signal }, input) {
          authorize(caller, name);
          const stale = { state: "needs-refresh" } as const;
          if (removals.read(input.accountId) || (publicOnly && !(await isPublicSource(input)))) return stale;
          const cancelled = AbortSignal.any([signal, lifetime, removals.signal(input.accountId)]);
          cancelled.throwIfAborted();
          const message = findCachedMessage(readSnapshot(files, input).snapshot, input.localMessageId);
          if (!message) return stale;
          const bytes = Buffer.from(message.source, "base64");
          const body = await parseMessageBody(bytes).catch(() => null);
          if (publicOnly && !(await isPublicSource(input))) return stale;
          cancelled.throwIfAborted();
          const current = findCachedMessage(readSnapshot(files, input).snapshot, input.localMessageId);
          if (current?.source !== message.source) return stale;
          if (!body) throw new HuhuError("INVALID_INPUT", publicOnly ? "无法解析邮件正文。" : "无法解析邮件正文。仍可查看原文。", { details: { reason: "mime" } });
          return { state: "ready" as const, body, sourceDigest: sourceDigest(bytes) };
        },
      }),
    );
  }
  api.defineCapability(
    defineCapability({
      plugin: "mail",
      exposable: false,
      defaultExposed: false,
      name: "mail.messages.markRead",
      scope: "write",
      idempotency: "handler",
      input: messageKey,
      output: z.strictObject({ state: z.enum(["local", "synced", "needs-refresh"]) }),
      handler: ({ caller, signal }, input) => {
        authorize(caller, "mail.messages.markRead");
        files.assertWritable();
        const cancelled = AbortSignal.any([signal, lifetime, removals.signal(input.accountId)]);
        return serialize(input, async () => {
          cancelled.throwIfAborted();
          const { snapshot, version } = readSnapshot(files, input);
          const message = findCachedMessage(snapshot, input.localMessageId);
          if (!snapshot || !message) return { state: "needs-refresh" as const };
          if (message.summary.readState === "synced") return { state: "synced" as const };
          let expectedVersion = version;
          if (message.summary.readState !== "local") {
            message.summary.readState = "local";
            message.localRead = true;
            expectedVersion = (await write(input, snapshot, version, cancelled)).version;
          }
          cancelled.throwIfAborted();
          let state: "local" | "synced" | "needs-refresh" = "local";
          try {
            if (accounts) state = await accounts.markRead(input.accountId, input.folder, snapshot.uidValidity, message.summary.uid, cancelled);
          } catch (error) {
            if (!(error instanceof CredentialError || error instanceof MailAccountError)) throw error;
          }
          cancelled.throwIfAborted();
          if (state === "synced") {
            message.summary.readState = state;
            await write(input, snapshot, expectedVersion, cancelled);
          }
          return { state };
        });
      },
    }),
  );
  return {
    refresh,
    versions: (accountId: string, folders: string[]) => folders.map((folder) => [folder, files.currentVersion(cachePath({ accountId, folder }))] as const),
    async drainAccount(accountId: string) {
      await Promise.allSettled([accountTails.get(accountId), ...[...writes.values()].filter((entry) => entry.accountId === accountId).map(({ task }) => task)]);
    },
    retireAccount(accountId: string, folders: string[]) {
      files.assertWritable();
      for (const folder of folders) {
        try {
          unlinkSync(files.abs(cachePath({ accountId, folder })));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    },
    async drain() {
      await Promise.allSettled([...accountTails.values(), ...[...writes.values()].map(({ task }) => task)]);
    },
  };
}
