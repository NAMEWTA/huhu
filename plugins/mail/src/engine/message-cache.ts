import { createHash } from "node:crypto";
import { errors, HuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, CredentialError, defineCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { openMailAccounts } from "./accounts.js";
import { MailAccountError } from "./discovery.js";
import { MAX_IMAP_SOURCE_BYTES } from "./imap-message.js";
import { messageBody, parseMessageBody } from "./message-body.js";

const mailbox = z.strictObject({ accountId: z.uuid(), folder: z.string().min(1).max(1024) });
const uidValidity = z.string().regex(/^[1-9][0-9]*$/);
const readState = z.enum(["unread", "local", "synced"]);
const summary = mailbox.extend({
  localMessageId: z.string().regex(/^[a-f0-9]{64}$/),
  uidValidity,
  uid: z.int().positive(),
  subject: z.string(),
  transport: z.literal("imap"),
  readState: readState.optional(),
});
const messageKey = mailbox.extend({ localMessageId: summary.shape.localMessageId });
const cacheSnapshot = z.strictObject({
  format: z.literal(1),
  uidValidity,
  message: z.strictObject({ summary, source: z.base64().max(Math.ceil(MAX_IMAP_SOURCE_BYTES / 3) * 4) }).nullable(),
});
type Mailbox = z.infer<typeof mailbox>;
type Snapshot = z.infer<typeof cacheSnapshot>;
type Files = HuhuApi["vault"]["files"];

const internal = { plugin: "mail", risk: "normal", exposable: false, defaultExposed: false } as const;

export const mailRefreshDescriptor = defineCapabilityDescriptor({
  ...internal,
  name: "mail.sync.refresh",
  title: "刷新邮箱目录",
  description: "从已选 IMAP 目录保存最新一封邮件的摘要与原文。",
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
    const item = snapshot.message?.summary;
    if (!item || (item.accountId === input.accountId && item.folder === input.folder && item.uidValidity === snapshot.uidValidity && item.localMessageId === messageId(input, item.uidValidity, item.uid))) {
      return { snapshot, version: current.version };
    }
  } catch {
    // A subsequent refresh can replace this rebuildable record.
  }
  return { snapshot: null, version: current.version };
}

export function registerMessageCache(api: HuhuApi, accounts: ReturnType<typeof openMailAccounts> | undefined, lifetime: AbortSignal) {
  const files = api.vault.files;
  const writes = new Map<string, Promise<unknown>>();
  const authorize = (caller: string, name: string) => {
    if (!isWorkbenchCaller(caller)) throw errors.permissionDenied(name);
  };
  function serialize<T>(input: Mailbox, run: () => Promise<T>): Promise<T> {
    const key = cachePath(input);
    const task = (writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(run);
    writes.set(key, task);
    return task.finally(() => {
      if (writes.get(key) === task) writes.delete(key);
    });
  }
  function write(input: Mailbox, snapshot: Snapshot, expectedVersion: string | null) {
    return files.write(cachePath(input), Buffer.from(JSON.stringify(snapshot) + "\n"), { expectedVersion });
  }
  api.defineCapability(
    bindCapability(mailRefreshDescriptor, ({ caller, signal }, input) => {
      authorize(caller, mailRefreshDescriptor.name);
      files.assertWritable();
      if (!accounts) throw errors.invalidInput("此 Vault 的本机邮箱凭据不可用");
      const cancelled = AbortSignal.any([signal, lifetime]);
      return serialize(input, async () => {
        cancelled.throwIfAborted();
        const before = readSnapshot(files, input);
        let result: Awaited<ReturnType<typeof accounts.fetchLatest>>;
        try {
          result = await accounts.fetchLatest(input.accountId, input.folder, cancelled);
        } catch (error) {
          if (error instanceof MailAccountError || error instanceof CredentialError) throw new HuhuError("INVALID_INPUT", "无法刷新邮箱目录", { details: { reason: error.code } });
          throw error;
        }
        cancelled.throwIfAborted();
        const { uidValidity: validity, message } = result;
        const localId = message ? messageId(input, validity, message.uid) : undefined;
        const previous = before.snapshot?.message?.summary;
        const locallyRead = previous?.localMessageId === localId && (previous?.readState === "local" || previous?.readState === "synced");
        const next: Snapshot = {
          format: 1,
          uidValidity: validity,
          message: message
            ? {
                summary: { ...input, localMessageId: localId!, uidValidity: validity, uid: message.uid, subject: message.subject, transport: "imap", readState: message.seen ? "synced" : locallyRead ? "local" : "unread" },
                source: message.source.toString("base64"),
              }
            : null,
        };
        await write(input, next, before.version);
        return { message: next.message?.summary ?? null, mailboxChanged: before.snapshot !== null && before.snapshot.uidValidity !== validity };
      });
    }),
  );
  api.defineCapability(
    bindCapability(mailLatestMessageDescriptor, ({ caller }, input) => {
      authorize(caller, mailLatestMessageDescriptor.name);
      return { message: readSnapshot(files, input).snapshot?.message?.summary ?? null };
    }),
  );
  api.defineCapability(
    bindCapability(mailMessageSourceDescriptor, ({ caller }, input) => {
      authorize(caller, mailMessageSourceDescriptor.name);
      const message = readSnapshot(files, input).snapshot?.message;
      return message && message.summary.localMessageId === input.localMessageId ? { state: "ready" as const, message: message.summary, source: message.source } : { state: "needs-refresh" as const };
    }),
  );
  api.defineCapability(
    defineCapability({
      plugin: "mail",
      exposable: false,
      defaultExposed: false,
      name: "mail.messages.loadBody",
      scope: "read",
      input: messageKey,
      output: z.discriminatedUnion("state", [z.strictObject({ state: z.literal("ready"), body: messageBody }), z.strictObject({ state: z.literal("needs-refresh") })]),
      handler: async ({ caller, signal }, input) => {
        authorize(caller, "mail.messages.loadBody");
        const cancelled = AbortSignal.any([signal, lifetime]);
        cancelled.throwIfAborted();
        const message = readSnapshot(files, input).snapshot?.message;
        if (!message || message.summary.localMessageId !== input.localMessageId) return { state: "needs-refresh" as const };
        let body: Awaited<ReturnType<typeof parseMessageBody>>;
        try {
          body = await parseMessageBody(Buffer.from(message.source, "base64"));
        } catch {
          throw new HuhuError("INVALID_INPUT", "无法解析邮件正文。仍可查看原文。", { details: { reason: "mime" } });
        }
        cancelled.throwIfAborted();
        if (readSnapshot(files, input).snapshot?.message?.summary.localMessageId !== input.localMessageId) return { state: "needs-refresh" as const };
        return { state: "ready" as const, body };
      },
    }),
  );
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
        const cancelled = AbortSignal.any([signal, lifetime]);
        return serialize(input, async () => {
          cancelled.throwIfAborted();
          const { snapshot, version } = readSnapshot(files, input);
          const message = snapshot?.message;
          if (!snapshot || !message || message.summary.localMessageId !== input.localMessageId) return { state: "needs-refresh" as const };
          if (message.summary.readState === "synced") return { state: "synced" as const };
          let expectedVersion = version;
          if (message.summary.readState !== "local") {
            message.summary.readState = "local";
            expectedVersion = (await write(input, snapshot, version)).version;
          }
          cancelled.throwIfAborted();
          let state: "local" | "synced" | "needs-refresh" = "local";
          try {
            if (accounts) state = await accounts.markRead(input.accountId, input.folder, snapshot.uidValidity, message.summary.uid, cancelled);
          } catch (error) {
            if (!(error instanceof CredentialError)) throw error;
          }
          cancelled.throwIfAborted();
          if (state === "synced") {
            message.summary.readState = state;
            await write(input, snapshot, expectedVersion);
          }
          return { state };
        });
      },
    }),
  );
  return async () => {
    await Promise.allSettled(writes.values());
  };
}
