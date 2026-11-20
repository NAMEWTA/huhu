import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { errors, HuhuError } from "@huhu/contracts";
import { defineCapability, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { openMailAccounts } from "./accounts.js";
import type { MailDrafts } from "./drafts.js";
import type { registerMessageCache } from "./message-cache.js";
import type { MailOutbox } from "./outbox.js";

export const accountVersion = z.strictObject({ accountId: z.uuid(), expectedRevision: z.uuid() });
const confirmation = accountVersion.extend({ impactKey: z.hash("sha256", { enc: "hex" }) });
const impact = z.strictObject({
  drafts: z.int().nonnegative(),
  attachments: z.int().nonnegative(),
  sharedAttachments: z.int().nonnegative(),
  cache: z.int().nonnegative(),
  history: z.int().nonnegative(),
  retained: z.int().nonnegative(),
  sending: z.int().nonnegative(),
  credentials: z.boolean(),
});
const preview = confirmation.extend({ label: z.string(), email: z.email(), impact, pending: z.boolean() });
export const pendingRemoval = accountVersion.extend({ label: z.string() });
const removalRecord = z.discriminatedUnion("state", [preview.extend({ state: z.literal("pending"), folders: z.array(z.string()), digests: z.array(z.hash("sha256", { enc: "hex" })) }), confirmation.extend({ state: z.literal("removed") })]);
type RemovalRecord = z.infer<typeof removalRecord>;
export type AccountRemovalPreview = z.infer<typeof preview>;
const directory = ".huhu/mail/removed-accounts";
const pathFor = (id: string) => `${directory}/${id}.json`;

export class AccountRemovals {
  private readonly controllers = new Map<string, AbortController>();
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(private readonly files: HuhuApi["vault"]["files"]) {}

  read(id: string) {
    const file = this.files.read(pathFor(id));
    if (!file) return null;
    try {
      const record = removalRecord.parse(JSON.parse(file.bytes.toString("utf8")));
      if (record.accountId !== id) throw new Error("Account removal identity mismatch");
      return { record, version: file.version };
    } catch {
      throw new HuhuError("INTERNAL", "无法读取邮箱清理记录。");
    }
  }

  pending() {
    let paths: string[];
    try {
      paths = readdirSync(this.files.abs(directory));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return paths.flatMap((name) => {
      if (!name.endsWith(".json")) return [];
      const id = z.uuid().safeParse(name.slice(0, -5));
      const record = id.success ? this.read(id.data)?.record : undefined;
      return record?.state === "pending" ? [pendingRemoval.parse({ accountId: record.accountId, expectedRevision: record.expectedRevision, label: record.label })] : [];
    });
  }

  assertActive(id: string | null | undefined) {
    if (id && this.read(id)) throw errors.notFound("邮箱已移除或正在清理。");
  }

  signal(id: string) {
    this.assertActive(id);
    let controller = this.controllers.get(id);
    if (!controller) this.controllers.set(id, (controller = new AbortController()));
    return controller.signal;
  }

  serialize<T>(id: string, run: () => Promise<T>): Promise<T> {
    const task = (this.locks.get(id) ?? Promise.resolve()).catch(() => undefined).then(run);
    this.locks.set(id, task);
    return task.finally(() => {
      if (this.locks.get(id) === task) this.locks.delete(id);
    });
  }

  async write(record: RemovalRecord, expectedVersion: string | null) {
    await this.files.write(pathFor(record.accountId), Buffer.from(JSON.stringify(record) + "\n"), { expectedVersion });
    this.controllers.get(record.accountId)?.abort();
    this.controllers.delete(record.accountId);
  }

  async drain() {
    await Promise.allSettled(this.locks.values());
  }
}

function stale() {
  return new HuhuError("VERSION_CONFLICT", "邮箱或删除影响已变化，请刷新预览后再确认。");
}

function publicPreview({ folders: _folders, digests: _digests, ...view }: Omit<Extract<RemovalRecord, { state: "pending" }>, "state">): AccountRemovalPreview {
  return view;
}

export function registerAccountRemoval(
  api: HuhuApi,
  accounts: ReturnType<typeof openMailAccounts> | undefined,
  removals: AccountRemovals,
  drafts: MailDrafts,
  outbox: MailOutbox,
  messages: ReturnType<typeof registerMessageCache>,
  lifetime: AbortSignal,
) {
  const options = { plugin: "mail", desktopOnly: true, exposable: false, defaultExposed: false } as const;

  function authorize(caller: string, name: string) {
    if (caller !== "desktop") throw errors.permissionDenied(name);
    lifetime.throwIfAborted();
    api.vault.files.assertWritable();
    if (!accounts) throw errors.invalidInput("此主机的本机邮箱凭据存储不可用。");
    return accounts;
  }

  function inspect(account: ReturnType<typeof openMailAccounts>, target: z.infer<typeof accountVersion>) {
    const { accountId, expectedRevision } = target;
    const current = account.readDefinition(accountId);
    if (!current) throw errors.notFound("邮箱账号已不存在。");
    if (current.revision !== expectedRevision) throw stale();
    const { email, label } = current.definition.settings;
    const folders = current.definition.folders.map(({ path }) => path).sort();
    const cache = messages.versions(accountId, folders);
    const draftRecords = drafts.accountRecords(accountId);
    const history = outbox.accountRecords(accountId);
    const attachments = new Set([...draftRecords.flatMap((record) => record.attachments), ...history.flatMap((record) => record.attachments)]);
    const otherDigests = new Set([...drafts.otherAttachmentDigests(accountId), ...outbox.attachmentDigests(accountId)]);
    const shared = [...attachments].filter((digest) => otherDigests.has(digest));
    const impact = {
      drafts: draftRecords.length,
      attachments: attachments.size,
      sharedAttachments: shared.length,
      cache: cache.filter(([, version]) => version !== null).length,
      history: history.length,
      retained: history.filter((record) => record.retained).length,
      sending: history.filter((record) => record.active).length,
      credentials: current.configured.length > 0,
    };
    const impactKey = createHash("sha256")
      .update(JSON.stringify([target, draftRecords, history, cache, shared, current.configured]))
      .digest("hex");
    return { ...target, email, label: label || email, impact, impactKey, pending: false, folders, digests: [...attachments] };
  }

  api.defineCapability(
    defineCapability({
      ...options,
      name: "mail.accounts.previewRemoval",
      scope: "read",
      input: accountVersion,
      output: preview,
      handler: ({ caller, signal }, target) => {
        const owner = authorize(caller, "mail.accounts.previewRemoval");
        return removals.serialize(target.accountId, () =>
          drafts.serialize(async () => {
            signal.throwIfAborted();
            const previous = removals.read(target.accountId)?.record;
            if (previous?.state === "pending" && previous.expectedRevision === target.expectedRevision) {
              const { state: _state, ...planned } = previous;
              return publicPreview(planned);
            }
            removals.assertActive(target.accountId);
            return publicPreview(inspect(owner, target));
          }),
        );
      },
    }),
  );

  const result = confirmation.pick({ accountId: true }).extend({ state: z.enum(["removed", "pending"]) });
  api.defineCapability(
    defineCapability({
      ...options,
      name: "mail.accounts.remove",
      scope: "write",
      idempotency: "handler",
      input: confirmation,
      output: result,
      handler: ({ caller, signal }, input) => {
        const owner = authorize(caller, "mail.accounts.remove");
        const { accountId, expectedRevision, impactKey } = input;
        return removals.serialize(accountId, async () => {
          const record = await drafts.serialize(async () => {
            signal.throwIfAborted();
            lifetime.throwIfAborted();
            const previous = removals.read(accountId)?.record;
            if (previous) {
              if (previous.expectedRevision !== expectedRevision || previous.impactKey !== impactKey) throw stale();
              return previous;
            }
            const planned = inspect(owner, { accountId, expectedRevision });
            if (planned.impactKey !== impactKey) throw stale();
            const pending = { ...planned, pending: true, state: "pending" } as const;
            signal.throwIfAborted();
            await removals.write(pending, null);
            return pending;
          });
          if (record.state === "removed") return { accountId, state: "removed" as const };
          // Once published, the removal can only be completed or resumed. An HTTP disconnect cannot undo it.
          try {
            await messages.drainAccount(accountId);
            await outbox.drainAccount(accountId);
            await drafts.serialize(async () => {
              lifetime.throwIfAborted();
              await outbox.retireAccount(accountId);
              await drafts.retireAccount(accountId);
              messages.retireAccount(accountId, record.folders);
            });
            const swept = await drafts.sweepUnreferenced(() => outbox.attachmentDigests(), undefined, new Set(record.digests));
            if (swept.failed.length) return { accountId, state: "pending" as const };
            await owner.removeDefinition({ accountId, expectedRevision }, lifetime);
            if (!(await owner.recover())) return { accountId, state: "pending" as const };
            await removals.write({ ...input, state: "removed" }, removals.read(accountId)!.version);
            return { accountId, state: "removed" as const };
          } catch {
            return { accountId, state: "pending" as const };
          }
        });
      },
    }),
  );
}
