import { mailTool, requireMailCaller } from "./tool-access.js";
import { createHash, randomUUID } from "node:crypto";
import { errors, HuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { AccountRemovals } from "./account-removals.js";
import type { openMailAccounts } from "./accounts.js";
import { assertAttachmentCapacity, assertImportActive, attachmentDetails, attachmentDigest, attachmentObjectPath, DraftAttachmentObjects, readAttachmentSource, type MailAttachmentSource } from "./draft-attachments.js";
import { draftContent, storedDraftContent, uuid, type DraftContent, type StoredDraftContent } from "./draft-content.js";
import { missingForwardAttachments, sameForwardSource, type ForwardContext } from "./forward-context.js";
import { requireCachedMessage } from "./message-cache.js";
import { MAIL_OUTBOX_SERVICE, MailOutbox, outboxReceipt, outboxRetryInput, outboxStatusInput, outboxSubmitInput, outboxSummary, outboxView, type MailOutboxService } from "./outbox.js";
import { isOutboxRecordPath, OutboxStorage } from "./outbox-storage.js";
import { forwardSource, sourceDigest } from "./prepare-forward.js";
import type { MailSmtpTransport } from "./smtp.js";
import { MAIL_WEB_ATTACHMENTS_SERVICE, registerWebAttachmentUploads } from "./web-attachments.js";

import { mailUnknown, type MailIntents } from "./tool-intents.js";

const draftKey = z.strictObject({ draftId: uuid });
const recipientFields = ["to", "cc", "bcc"] as const;
const draftMetadata = draftKey.extend({ revision: uuid, updatedAt: z.iso.datetime() });
const draftDetails = draftMetadata.extend(draftContent.shape).extend({ attachments: z.array(attachmentDetails).optional() });
export const draftSummary = draftMetadata.extend(draftContent.pick({ accountId: true, subject: true }).shape);
const saveInput = draftKey.extend({ expectedRevision: uuid.nullable(), draft: draftContent });
const discardInput = draftKey.extend({ expectedRevision: uuid });
const attachmentKey = draftKey.extend({ digest: attachmentDigest });
const removeInput = discardInput.extend({ digest: attachmentDigest });
export const storedDraft = draftMetadata.omit({ draftId: true }).extend({ draft: storedDraftContent.nullable() });
const snapshotSchema = z.strictObject({ format: z.literal(1), drafts: z.record(uuid, storedDraft) });

export type Draft = z.infer<typeof draftDetails>;
type StoredDraft = z.infer<typeof storedDraft>;
type Snapshot = z.infer<typeof snapshotSchema>;
type VaultFiles = HuhuApi["vault"]["files"];
type MailAccounts = ReturnType<typeof openMailAccounts>;

// This is Vault content. Read-only opens must read the original Vault, even with a scratch stateDir.
export const draftsPath = ".huhu/mail/drafts.json";
export const MAIL_DRAFT_ATTACHMENTS_SERVICE = "mail.draftAttachments";
export type MailDraftAttachments = Pick<MailDrafts, "addAttachment" | "removeAttachment" | "readAttachment" | "withSnapshot"> & {
  sweepUnreferenced(signal?: AbortSignal): ReturnType<MailDrafts["sweepUnreferenced"]>;
};

function authorize(caller: string, capability: string): void {
  requireMailCaller(caller, capability);
}

function normalizeDraft(draft: DraftContent): DraftContent {
  const seen = new Set<string>();
  const fields = { ...draft };
  for (const field of recipientFields) {
    fields[field] = draft[field].filter((email) => {
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });
  }
  return fields;
}

function saveFailure(): HuhuError {
  return new HuhuError("INTERNAL", "保存邮件草稿失败", { details: { reason: "draft-write-failed" } });
}

export function readDraftSnapshot(files: VaultFiles, onBytes?: (bytes: Buffer) => void): { snapshot: Snapshot; version: string | null } {
  try {
    const file = files.read(draftsPath);
    if (!file) return { snapshot: { format: 1, drafts: {} }, version: null };
    const snapshot = snapshotSchema.parse(JSON.parse(file.bytes.toString("utf8")));
    onBytes?.(file.bytes);
    return { snapshot, version: file.version };
  } catch (error) {
    if (error instanceof HuhuError) throw error;
    throw new HuhuError("INTERNAL", "无法读取邮件草稿", { retryable: false, details: { reason: "draft-read-failed" } });
  }
}

function draftAttachmentDigests(snapshot: Snapshot): string[] {
  return Object.values(snapshot.drafts).flatMap(({ draft }) => draft?.attachments?.map(({ digest }) => digest) ?? []);
}

/** Resolve committed references while holding the Vault's Mail snapshot boundary. */
export function mailAttachmentPackagePaths(files: VaultFiles): ReadonlySet<string> {
  const { snapshot } = readDraftSnapshot(files);
  const outbox = new OutboxStorage(files);
  return new Set([...draftAttachmentDigests(snapshot), ...outbox.attachmentDigests()].map(attachmentObjectPath));
}

export function mailPackageSelection(files: VaultFiles) {
  const records = new Map<string, string>();
  const remember = (path: string, bytes: Buffer) => records.set(path, createHash("sha256").update(bytes).digest("hex"));
  const { snapshot } = readDraftSnapshot(files, (bytes) => remember(draftsPath, bytes));
  const attachments = new Set(draftAttachmentDigests(snapshot).map(attachmentObjectPath));
  for (const record of new OutboxStorage(files).records(remember)) {
    if ("deleted" in record) continue;
    for (const { digest } of record.draft.attachments ?? []) attachments.add(attachmentObjectPath(digest));
  }
  return {
    includeFile(relative: string): boolean {
      const normalized = relative.toLowerCase();
      return !normalized.startsWith(".huhu/mail/attachments/") || attachments.has(normalized);
    },
    verifyFiles(written: ReadonlyMap<string, string>): void {
      const changed = () => new HuhuError("VERSION_CONFLICT", "备份期间邮件草稿或投递记录已变化，请重新导出");
      for (const [path, hash] of records) {
        if (written.get(path) !== hash) throw changed();
      }
      for (const path of written.keys()) {
        const normalized = path.toLowerCase();
        if ((normalized === draftsPath || isOutboxRecordPath(normalized)) && !records.has(path)) throw changed();
      }
      for (const path of attachments) {
        if (written.get(path) !== path.split("/").at(-1)) throw errors.invalidInput("备份所需的邮件附件已变化或缺失，请重新核对后导出");
      }
    },
  };
}

const snapshotTails = new WeakMap<VaultFiles, Promise<void>>();

/** Keep the same writer boundary even if Mail is disabled or installed again during export. */
export function withMailSnapshot<T>(files: VaultFiles, run: () => Promise<T>): Promise<T> {
  const operation = (snapshotTails.get(files) ?? Promise.resolve()).then(run);
  snapshotTails.set(
    files,
    operation.then(
      () => undefined,
      () => undefined,
    ),
  );
  return operation;
}

export class MailDrafts {
  private tail = Promise.resolve();
  private readonly objects: DraftAttachmentObjects;

  constructor(
    private readonly files: VaultFiles,
    private readonly accounts: MailAccounts | undefined,
    private readonly lifetime: AbortSignal,
    private readonly removals: AccountRemovals,
  ) {
    this.objects = new DraftAttachmentObjects(files);
  }

  get(draftId: string, external = false): Draft | null {
    const record = readDraftSnapshot(this.files).snapshot.drafts[draftId];
    return record?.draft && this.visible(record.draft.accountId, external) ? this.details(draftId, record) : null;
  }

  private visible(accountId: string | null, external: boolean) {
    return !accountId || (!this.removals.read(accountId) && (!external || !!this.accounts?.readDefinition(accountId)));
  }

  list(external = false) {
    return Object.entries(readDraftSnapshot(this.files).snapshot.drafts)
      .flatMap(([draftId, record]) =>
        record.draft && this.visible(record.draft.accountId, external) ? [{ draftId, revision: record.revision, updatedAt: record.updatedAt, accountId: record.draft.accountId, subject: record.draft.subject }] : [],
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.draftId.localeCompare(b.draftId));
  }

  accountRecords(accountId: string) {
    return Object.entries(readDraftSnapshot(this.files).snapshot.drafts)
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([draftId, { draft, revision }]) => (draft?.accountId === accountId ? [{ draftId, revision, attachments: draft.attachments?.map(({ digest }) => digest) ?? [] }] : []));
  }

  otherAttachmentDigests(accountId: string) {
    return Object.values(readDraftSnapshot(this.files).snapshot.drafts).flatMap(({ draft }) => (draft && draft.accountId !== accountId ? (draft.attachments?.map(({ digest }) => digest) ?? []) : []));
  }

  /** Caller holds the shared draft/outbox writer. Keep draft IDs reserved against delayed creates. */
  async retireAccount(accountId: string) {
    const { snapshot, version } = readDraftSnapshot(this.files);
    let changed = false;
    for (const [draftId, record] of Object.entries(snapshot.drafts)) {
      if (record.draft?.accountId !== accountId) continue;
      snapshot.drafts[draftId] = { draft: null, revision: randomUUID(), updatedAt: new Date().toISOString() };
      changed = true;
    }
    if (changed) await this.files.write(draftsPath, Buffer.from(JSON.stringify(snapshot) + "\n"), { expectedVersion: version });
  }

  async save({ draftId, expectedRevision, draft: content }: z.infer<typeof saveInput>, signal: AbortSignal): Promise<Draft> {
    const draft = normalizeDraft(content);
    if (draft.reply && draft.accountId !== draft.reply.accountId) throw errors.invalidInput("回复必须使用原邮件所属的邮箱。");
    if (draft.reply && draft.forward) throw errors.invalidInput("一封草稿只能使用一种原邮件关联。");
    const record = await this.change(
      draftId,
      expectedRevision,
      () => signal.throwIfAborted(),
      async (previous) => {
        if (previous && JSON.stringify(previous.reply) !== JSON.stringify(draft.reply)) throw errors.invalidInput("已保存草稿的原邮件关联不能更改。");
        if (previous && !sameForwardSource(previous.forward, draft.forward)) throw errors.invalidInput("已保存草稿的转发来源不能更改。");
        if (!previous && draft.forward) return { ...draft, attachments: await this.importForwardAttachments(draft.forward, signal) };
        return { ...draft, attachments: previous?.attachments };
      },
    );
    return this.details(draftId, record);
  }

  private async importForwardAttachments(context: ForwardContext, signal: AbortSignal) {
    const { accountId, folder, localMessageId, omitted } = context;
    this.removals.assertActive(accountId);
    const identity = { accountId, folder, localMessageId };
    const message = requireCachedMessage(this.files, identity);
    const bytes = Buffer.from(message.source, "base64");
    if (sourceDigest(bytes) !== context.sourceDigest) throw errors.invalidInput("原邮件缓存已变化，请重新打开后转发。");
    const { forward, parts } = await forwardSource(bytes, identity, message.summary.subject);
    if (!sameForwardSource(forward, context)) throw errors.invalidInput("转发来源与当前原邮件不一致。");
    const excluded = new Set(omitted);
    const refs: NonNullable<StoredDraftContent["attachments"]> = [];
    for (const [index, { name, data }] of parts.entries()) {
      if (!data || excluded.has(index)) continue;
      const { ref, bytes: managed } = await readAttachmentSource(
        {
          name,
          size: data.length,
          read: async function* () {
            yield data;
          },
        },
        signal,
      );
      if (refs.some(({ digest }) => digest === ref.digest)) continue;
      assertAttachmentCapacity(refs, ref);
      assertImportActive(signal);
      await this.objects.publish(ref, managed);
      refs.push(ref);
    }
    return refs;
  }

  async discard({ draftId, expectedRevision }: z.infer<typeof discardInput>, signal: AbortSignal) {
    await this.change(
      draftId,
      expectedRevision,
      () => signal.throwIfAborted(),
      () => null,
    );
    return { draftId, discarded: true as const };
  }

  async addAttachment(input: z.infer<typeof discardInput>, source: MailAttachmentSource, requestSignal?: AbortSignal): Promise<{ draft: Draft; deduped: boolean }> {
    const signal = requestSignal ? AbortSignal.any([requestSignal, this.lifetime]) : this.lifetime;
    return this.commitAttachment(input, () => readAttachmentSource(source, signal), signal);
  }

  async addUploadedAttachment(input: z.infer<typeof discardInput>, source: MailAttachmentSource, signal: AbortSignal, sweep: (digest: string) => Promise<unknown>) {
    // A slow browser must finish reading its file before taking the draft writer.
    const staged = await readAttachmentSource(source, signal);
    try {
      return await this.commitAttachment(input, () => staged, signal, true);
    } catch (error) {
      await sweep(staged.ref.digest).catch(() => undefined);
      throw error;
    }
  }

  private async commitAttachment(
    input: z.infer<typeof discardInput>,
    load: () => Awaited<ReturnType<typeof readAttachmentSource>> | ReturnType<typeof readAttachmentSource>,
    signal: AbortSignal,
    guardCommit = false,
  ): Promise<{ draft: Draft; deduped: boolean }> {
    const { draftId, expectedRevision } = discardInput.parse(input);
    let deduped = false;
    const record = await this.change(
      draftId,
      expectedRevision,
      () => assertImportActive(signal),
      async (previous) => {
        const draft = this.requireDraft(previous);
        const { ref, bytes } = await load();
        const refs = draft.attachments ?? [];
        deduped = refs.some((existing) => existing.digest === ref.digest);
        if (!deduped) assertAttachmentCapacity(refs, ref);
        assertImportActive(signal);
        await this.objects.publish(ref, bytes);
        return deduped ? draft : { ...draft, attachments: [...refs, ref] };
      },
      guardCommit,
    );
    return { draft: this.details(draftId, record), deduped };
  }

  async removeAttachment(input: z.infer<typeof removeInput>, requestSignal?: AbortSignal): Promise<Draft> {
    const { draftId, expectedRevision, digest } = removeInput.parse(input);
    const signal = requestSignal ? AbortSignal.any([requestSignal, this.lifetime]) : this.lifetime;
    const record = await this.change(
      draftId,
      expectedRevision,
      () => signal.throwIfAborted(),
      (previous) => {
        const draft = this.requireDraft(previous);
        this.requireAttachment(draft, digest);
        return { ...draft, attachments: draft.attachments?.filter((ref) => ref.digest !== digest) };
      },
    );
    return this.details(draftId, record);
  }

  readAttachment(input: z.infer<typeof attachmentKey>) {
    this.lifetime.throwIfAborted();
    const { draftId, digest } = attachmentKey.parse(input);
    const draft = this.requireDraft(readDraftSnapshot(this.files).snapshot.drafts[draftId]?.draft);
    const ref = this.requireAttachment(draft, digest);
    return { ...ref, ...this.objects.read(ref) };
  }

  freezeForSend(draftId: string, expectedRevision: string) {
    const record = readDraftSnapshot(this.files).snapshot.drafts[draftId];
    if (record && record.revision !== expectedRevision) throw errors.versionConflict(record.revision);
    const draft = this.requireDraft(record?.draft);
    if (draft.reply && draft.forward) throw errors.invalidInput("一封草稿只能使用一种原邮件关联。");
    if (missingForwardAttachments(draft.forward, draft.attachments ?? []).length) throw errors.invalidInput("请补选同名文件，或选择不转发缺少字节的附件。");
    const attachments = (draft.attachments ?? []).map((ref) => {
      const attachment = this.objects.read(ref);
      if (attachment.state !== "ready") {
        throw new HuhuError("INVALID_INPUT", "请重新绑定或移除无法读取的附件", { details: { reason: "attachment-unavailable", digest: ref.digest, state: attachment.state } });
      }
      return { filename: ref.name, content: attachment.bytes };
    });
    return { draft, attachments };
  }

  /** Exporters use the same writer-side boundary from file enumeration through the last read. */
  withSnapshot<T>(run: (signal: AbortSignal) => Promise<T>, requestSignal?: AbortSignal): Promise<T> {
    const signal = requestSignal ? AbortSignal.any([requestSignal, this.lifetime]) : this.lifetime;
    return this.serialize(() => {
      signal.throwIfAborted();
      return run(signal);
    });
  }

  /** Call only when every other exporter is quiescent or uses withSnapshot. */
  sweepUnreferenced(outboxReferences: () => string[], requestSignal?: AbortSignal, candidates?: ReadonlySet<string>) {
    this.files.assertWritable();
    return this.withSnapshot(async () => {
      const { snapshot, version } = readDraftSnapshot(this.files);
      // A missing draft index cannot establish that existing objects are unreferenced.
      if (version === null) return { removed: [], failed: [] };
      const referenced = new Set(draftAttachmentDigests(snapshot));
      for (const digest of outboxReferences()) referenced.add(digest);
      return this.objects.sweep(referenced, candidates);
    }, requestSignal);
  }

  drain(): Promise<void> {
    return this.tail;
  }

  private requireDraft(draft: StoredDraftContent | null | undefined): StoredDraftContent {
    if (!draft) throw errors.notFound("邮件草稿不存在");
    this.removals.assertActive(draft.accountId);
    return draft;
  }

  private requireAttachment(draft: StoredDraftContent, digest: string) {
    const ref = draft.attachments?.find((attachment) => attachment.digest === digest);
    if (!ref) throw errors.notFound("邮件草稿没有此附件");
    return ref;
  }

  private details(draftId: string, record: StoredDraft): Draft {
    const { attachments, ...draft } = this.requireDraft(record.draft);
    return {
      draftId,
      revision: record.revision,
      updatedAt: record.updatedAt,
      ...draft,
      ...(attachments?.length && { attachments: attachments.map((ref) => ({ ...ref, state: this.objects.read(ref).state })) }),
    };
  }

  private change(
    draftId: string,
    expectedRevision: string | null,
    assertActive: () => void,
    edit: (previous: StoredDraftContent | undefined) => StoredDraftContent | null | Promise<StoredDraftContent | null>,
    guardCommit = false,
  ): Promise<StoredDraft> {
    this.files.assertWritable();
    // Keep business CAS and replacement together. VaultFiles also checks the snapshot bytes at the atomic write.
    return this.serialize(async () => {
      assertActive();
      const { snapshot, version } = readDraftSnapshot(this.files);
      const previous = snapshot.drafts[draftId];
      this.removals.assertActive(previous?.draft?.accountId);
      if (previous && previous.revision !== expectedRevision) throw errors.versionConflict(previous.revision);
      if (previous?.draft === null || (!previous && expectedRevision !== null)) throw errors.notFound("邮件草稿不存在");
      const draft = await edit(previous?.draft);
      this.removals.assertActive(draft?.accountId);
      assertActive();
      if (previous && draft === previous.draft) return previous;
      const accountId = draft?.accountId;
      if (accountId && accountId !== previous?.draft?.accountId) {
        const available = (await this.accounts?.list())?.some((account) => account.accountId === accountId && (draft.reply?.accountId === accountId || account.definition.settings.smtpEnabled));
        if (!available) throw new HuhuError("INVALID_INPUT", "请选择可发信的邮箱账号", { details: { reason: "sender-not-available" } });
      }
      assertActive();
      const next = { revision: randomUUID(), updatedAt: new Date().toISOString(), draft };
      // An explicit discard removes all content and retains identity so a delayed creation cannot resurrect it.
      snapshot.drafts[draftId] = next;
      try {
        await this.files.write(draftsPath, Buffer.from(JSON.stringify(snapshot) + "\n"), { expectedVersion: version, ...(guardCommit && { beforeCommit: assertActive }) });
      } catch (error) {
        if (error instanceof HuhuError) {
          if (error.code !== "VERSION_CONFLICT" && error.code !== "NAME_CONFLICT" && error.code !== "NOT_FOUND") throw error;
          const current = readDraftSnapshot(this.files).snapshot.drafts[draftId];
          if (current && current.revision !== expectedRevision) throw errors.versionConflict(current.revision);
          if (!current && expectedRevision !== null) throw errors.notFound("邮件草稿不存在");
        }
        throw saveFailure();
      }
      return next;
    });
  }

  serialize<T>(run: () => Promise<T>): Promise<T> {
    const operation = withMailSnapshot(this.files, run);
    this.tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}

export const draftDescriptors = {
  outboxSubmit: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.outbox.submit",
    title: "提交发件",
    description: "按操作标识和草稿版本发起投递。",
    risk: "high",
    scope: "execute",
    idempotency: "handler",
    input: outboxSubmitInput,
    output: outboxReceipt,
  }),
  outboxStatus: defineCapabilityDescriptor({ ...mailTool, name: "mail.outbox.status", title: "查看投递状态", description: "读取指定本机投递记录。", risk: "high", scope: "read", input: outboxStatusInput, output: outboxView }),
  outboxList: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.outbox.list",
    title: "列出投递记录",
    description: "读取本机投递记录摘要。",
    risk: "high",
    scope: "read",
    input: z.strictObject({}),
    output: z.strictObject({ operations: z.array(outboxSummary) }),
  }),
  outboxRetry: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.outbox.retry",
    title: "重试未投递收件人",
    description: "只重试可证未投递的收件人。",
    risk: "high",
    scope: "execute",
    idempotency: "handler",
    input: outboxRetryInput,
    output: outboxReceipt,
  }),
  outboxDeleteLocal: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.outbox.deleteLocal",
    title: "删除本机投递记录",
    description: "清除本机记录和私有引用。",
    risk: "high",
    scope: "write",
    idempotency: "handler",
    input: outboxStatusInput.extend({ expectedVersion: z.string().optional() }),
    output: outboxStatusInput.extend({ deleted: z.literal(true) }),
  }),
  draftsList: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.drafts.list",
    title: "列出草稿",
    description: "读取本机草稿摘要。",
    risk: "high",
    scope: "read",
    input: z.strictObject({}),
    output: z.strictObject({ drafts: z.array(draftSummary) }),
  }),
  draftsGet: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.drafts.get",
    title: "读取草稿",
    description: "读取指定草稿和附件引用。",
    risk: "high",
    scope: "read",
    input: draftKey,
    output: z.strictObject({ draft: draftDetails.nullable() }),
  }),
  draftsSave: defineCapabilityDescriptor({ ...mailTool, name: "mail.drafts.save", title: "保存草稿", description: "按草稿标识和版本保存。", risk: "normal", scope: "write", idempotency: "handler", input: saveInput, output: draftDetails }),
  draftsDiscard: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.drafts.discard",
    title: "丢弃草稿",
    description: "按草稿版本丢弃本机草稿。",
    risk: "high",
    scope: "write",
    idempotency: "handler",
    input: discardInput,
    output: draftKey.extend({ discarded: z.literal(true) }),
  }),
  draftsRemoveAttachment: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.drafts.removeAttachment",
    title: "移除草稿附件",
    description: "按草稿版本清除指定附件引用。",
    risk: "high",
    scope: "write",
    idempotency: "handler",
    input: removeInput,
    output: draftDetails,
  }),
};

export function registerDrafts(api: HuhuApi, accounts: MailAccounts | undefined, lifetime: AbortSignal, transport: MailSmtpTransport | undefined, removals: AccountRemovals, once: MailIntents) {
  const drafts = new MailDrafts(api.vault.files, accounts, lifetime, removals);
  const outbox = new MailOutbox(api.vault.files, drafts, accounts, transport, lifetime);
  api.provide(
    MAIL_WEB_ATTACHMENTS_SERVICE,
    registerWebAttachmentUploads(api, drafts, lifetime, (digest) => drafts.sweepUnreferenced(() => outbox.attachmentDigests(), undefined, new Set([digest]))),
  );
  api.provide(MAIL_DRAFT_ATTACHMENTS_SERVICE, {
    addAttachment: drafts.addAttachment.bind(drafts),
    removeAttachment: drafts.removeAttachment.bind(drafts),
    readAttachment: drafts.readAttachment.bind(drafts),
    withSnapshot: drafts.withSnapshot.bind(drafts),
    sweepUnreferenced: (signal) => drafts.sweepUnreferenced(() => outbox.attachmentDigests(), signal),
  } satisfies MailDraftAttachments);
  api.provide(MAIL_OUTBOX_SERVICE, {
    submit: outbox.submit.bind(outbox),
    retry: outbox.retry.bind(outbox),
    status: outbox.status.bind(outbox),
    list: outbox.list.bind(outbox),
    deleteLocal: outbox.deleteLocal.bind(outbox),
  } satisfies MailOutboxService);
  api.defineCapability(
    bindCapability(draftDescriptors.outboxSubmit, ({ caller, signal }, input) => {
      authorize(caller, "mail.outbox.submit");
      return outbox.submit(input, signal);
    }),
  );
  api.defineCapability(
    bindCapability(draftDescriptors.outboxStatus, ({ caller }, input) => {
      authorize(caller, "mail.outbox.status");
      return outbox.status(input, !isWorkbenchCaller(caller));
    }),
  );
  api.defineCapability(
    bindCapability(draftDescriptors.outboxList, ({ caller }) => {
      authorize(caller, "mail.outbox.list");
      return { operations: outbox.list(!isWorkbenchCaller(caller)) };
    }),
  );
  api.defineCapability(
    bindCapability(draftDescriptors.outboxRetry, ({ caller, signal }, input) => {
      authorize(caller, "mail.outbox.retry");
      return outbox.retry(input, signal);
    }),
  );
  api.defineCapability(
    bindCapability(draftDescriptors.outboxDeleteLocal, (context, input) => {
      const name = draftDescriptors.outboxDeleteLocal.name;
      authorize(context.caller, name);
      return once(
        context,
        name,
        input.operationId,
        input,
        () => outbox.deleteLocal(input, context.signal, !isWorkbenchCaller(context.caller)),
        (data) => data,
        (data) => data,
      );
    }),
  );
  api.defineCapability(
    bindCapability(draftDescriptors.draftsList, ({ caller }) => {
      authorize(caller, "mail.drafts.list");
      return { drafts: drafts.list(!isWorkbenchCaller(caller)) };
    }),
  );
  api.defineCapability(
    bindCapability(draftDescriptors.draftsGet, ({ caller }, { draftId }) => {
      authorize(caller, "mail.drafts.get");
      return { draft: drafts.get(draftId, !isWorkbenchCaller(caller)) };
    }),
  );
  function readSaved({ draftId, revision }: Pick<Draft, "draftId" | "revision">) {
    const draft = drafts.get(draftId, true);
    if (!draft || draft.revision !== revision) throw mailUnknown();
    return draft;
  }
  const draftIntent = ({ draftId, expectedRevision }: { draftId: string; expectedRevision: string | null }) => JSON.stringify([draftId, expectedRevision]);
  const savedRevision = ({ draftId, revision }: Draft) => ({ draftId, revision });
  api.defineCapability(
    bindCapability(draftDescriptors.draftsSave, (context, input) => {
      const name = draftDescriptors.draftsSave.name;
      authorize(context.caller, name);
      return once(context, name, draftIntent(input), input, () => drafts.save(input, AbortSignal.any([context.signal, lifetime])), savedRevision, readSaved);
    }),
  );
  api.defineCapability(
    bindCapability(draftDescriptors.draftsDiscard, (context, input) => {
      const name = draftDescriptors.draftsDiscard.name;
      authorize(context.caller, name);
      return once(
        context,
        name,
        draftIntent(input),
        input,
        () => drafts.discard(input, AbortSignal.any([context.signal, lifetime])),
        (result) => result,
        (result) => result,
      );
    }),
  );
  api.defineCapability(
    bindCapability(draftDescriptors.draftsRemoveAttachment, (context, input) => {
      const name = draftDescriptors.draftsRemoveAttachment.name;
      if (!isWorkbenchCaller(context.caller)) requireMailCaller(context.caller, name, true);
      return once(
        context,
        name,
        draftIntent(input),
        input,
        async () => {
          const result = await drafts.removeAttachment(input, context.signal);
          // The reference is committed. A failed sweep can be retried without repeating the removal.
          await drafts.sweepUnreferenced(() => outbox.attachmentDigests()).catch(() => undefined);
          return result;
        },
        savedRevision,
        readSaved,
      );
    }),
  );
  const drain = async () => {
    await drafts.drain();
    await outbox.drain();
  };
  return { drafts, outbox, drain };
}
