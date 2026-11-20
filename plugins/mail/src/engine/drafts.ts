import { randomUUID } from "node:crypto";
import { errors, HuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { defineCapability, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { openMailAccounts } from "./accounts.js";
import { assertAttachmentCapacity, assertImportActive, attachmentDetails, attachmentDigest, DraftAttachmentObjects, readAttachmentSource, type MailAttachmentSource } from "./draft-attachments.js";
import { draftContent, storedDraftContent, uuid, type DraftContent, type StoredDraftContent } from "./draft-content.js";
import { MAIL_OUTBOX_SERVICE, MailOutbox, outboxReceipt, outboxRetryInput, outboxStatusInput, outboxSubmitInput, outboxSummary, outboxView, type MailOutboxService } from "./outbox.js";
import type { MailSmtpTransport } from "./smtp.js";

const draftKey = z.strictObject({ draftId: uuid });
const recipientFields = ["to", "cc", "bcc"] as const;
const draftMetadata = draftKey.extend({ revision: uuid, updatedAt: z.iso.datetime() });
const draftDetails = draftMetadata.extend(draftContent.shape).extend({ attachments: z.array(attachmentDetails).optional() });
export const draftSummary = draftMetadata.extend(draftContent.pick({ accountId: true, subject: true }).shape);
const saveInput = draftKey.extend({ expectedRevision: uuid.nullable(), draft: draftContent });
const discardInput = draftKey.extend({ expectedRevision: uuid });
const attachmentKey = draftKey.extend({ digest: attachmentDigest });
const removeInput = discardInput.extend({ digest: attachmentDigest });
const storedDraft = draftMetadata.omit({ draftId: true }).extend({ draft: storedDraftContent.nullable() });
const snapshotSchema = z.strictObject({ format: z.literal(1), drafts: z.record(uuid, storedDraft) });

export type Draft = z.infer<typeof draftDetails>;
type StoredDraft = z.infer<typeof storedDraft>;
type Snapshot = z.infer<typeof snapshotSchema>;
type VaultFiles = HuhuApi["vault"]["files"];
type MailAccounts = ReturnType<typeof openMailAccounts>;

// This is Vault content. Read-only opens must read the original Vault, even with a scratch stateDir.
const draftsPath = ".huhu/mail/drafts.json";
const workbenchDraft = { plugin: "mail", exposable: false, defaultExposed: false } as const;
export const MAIL_DRAFT_ATTACHMENTS_SERVICE = "mail.draftAttachments";
export type MailDraftAttachments = Pick<MailDrafts, "addAttachment" | "removeAttachment" | "readAttachment" | "withSnapshot"> & {
  sweepUnreferenced(signal?: AbortSignal): ReturnType<MailDrafts["sweepUnreferenced"]>;
};

function authorize(caller: string, capability: string): void {
  if (!isWorkbenchCaller(caller)) throw errors.permissionDenied(capability);
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

class MailDrafts {
  private tail = Promise.resolve();
  private readonly objects: DraftAttachmentObjects;

  constructor(
    private readonly files: VaultFiles,
    private readonly accounts: MailAccounts | undefined,
    private readonly lifetime: AbortSignal,
  ) {
    this.objects = new DraftAttachmentObjects(files);
  }

  get(draftId: string): Draft | null {
    const record = this.read().snapshot.drafts[draftId];
    return record?.draft ? this.details(draftId, record) : null;
  }

  list() {
    return Object.entries(this.read().snapshot.drafts)
      .flatMap(([draftId, record]) => (record.draft ? [{ draftId, revision: record.revision, updatedAt: record.updatedAt, accountId: record.draft.accountId, subject: record.draft.subject }] : []))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.draftId.localeCompare(b.draftId));
  }

  async save({ draftId, expectedRevision, draft: content }: z.infer<typeof saveInput>, signal: AbortSignal): Promise<Draft> {
    const draft = normalizeDraft(content);
    if (draft.reply && draft.accountId !== draft.reply.accountId) throw errors.invalidInput("回复必须使用原邮件所属的邮箱。");
    const record = await this.change(
      draftId,
      expectedRevision,
      () => signal.throwIfAborted(),
      (previous) => {
        if (previous && JSON.stringify(previous.reply) !== JSON.stringify(draft.reply)) throw errors.invalidInput("已保存草稿的原邮件关联不能更改。");
        return { ...draft, attachments: previous?.attachments };
      },
    );
    return this.details(draftId, record);
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
    const { draftId, expectedRevision } = discardInput.parse(input);
    const signal = requestSignal ? AbortSignal.any([requestSignal, this.lifetime]) : this.lifetime;
    let deduped = false;
    const record = await this.change(
      draftId,
      expectedRevision,
      () => assertImportActive(signal),
      async (previous) => {
        const draft = this.requireDraft(previous);
        const { ref, bytes } = await readAttachmentSource(source, signal);
        const refs = draft.attachments ?? [];
        deduped = refs.some((existing) => existing.digest === ref.digest);
        if (!deduped) assertAttachmentCapacity(refs, ref);
        assertImportActive(signal);
        await this.objects.publish(ref, bytes);
        return deduped ? draft : { ...draft, attachments: [...refs, ref] };
      },
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
    const draft = this.requireDraft(this.read().snapshot.drafts[draftId]?.draft);
    const ref = this.requireAttachment(draft, digest);
    return { ...ref, ...this.objects.read(ref) };
  }

  freezeForSend(draftId: string, expectedRevision: string) {
    const record = this.read().snapshot.drafts[draftId];
    if (record && record.revision !== expectedRevision) throw errors.versionConflict(record.revision);
    const draft = this.requireDraft(record?.draft);
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
  sweepUnreferenced(outboxReferences: () => string[], requestSignal?: AbortSignal) {
    this.files.assertWritable();
    return this.withSnapshot(async () => {
      const { snapshot, version } = this.read();
      // A missing draft index cannot establish that existing objects are unreferenced.
      if (version === null) return { removed: [], failed: [] };
      const referenced = new Set(Object.values(snapshot.drafts).flatMap(({ draft }) => draft?.attachments?.map(({ digest }) => digest) ?? []));
      for (const digest of outboxReferences()) referenced.add(digest);
      return this.objects.sweep(referenced);
    }, requestSignal);
  }

  drain(): Promise<void> {
    return this.tail;
  }

  private requireDraft(draft: StoredDraftContent | null | undefined): StoredDraftContent {
    if (!draft) throw errors.notFound("邮件草稿不存在");
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

  private read(): { snapshot: Snapshot; version: string | null } {
    try {
      const file = this.files.read(draftsPath);
      if (!file) return { snapshot: { format: 1, drafts: {} }, version: null };
      return { snapshot: snapshotSchema.parse(JSON.parse(file.bytes.toString("utf8"))), version: file.version };
    } catch (error) {
      if (error instanceof HuhuError) throw error;
      throw new HuhuError("INTERNAL", "无法读取邮件草稿", { retryable: false, details: { reason: "draft-read-failed" } });
    }
  }

  private change(draftId: string, expectedRevision: string | null, assertActive: () => void, edit: (previous: StoredDraftContent | undefined) => StoredDraftContent | null | Promise<StoredDraftContent | null>): Promise<StoredDraft> {
    this.files.assertWritable();
    // Keep business CAS and replacement together. VaultFiles also checks the snapshot bytes at the atomic write.
    return this.serialize(async () => {
      assertActive();
      const { snapshot, version } = this.read();
      const previous = snapshot.drafts[draftId];
      if (previous && previous.revision !== expectedRevision) throw errors.versionConflict(previous.revision);
      if (previous?.draft === null || (!previous && expectedRevision !== null)) throw errors.notFound("邮件草稿不存在");
      const draft = await edit(previous?.draft);
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
        await this.files.write(draftsPath, Buffer.from(JSON.stringify(snapshot) + "\n"), { expectedVersion: version });
      } catch (error) {
        if (error instanceof HuhuError) {
          if (error.code !== "VERSION_CONFLICT" && error.code !== "NAME_CONFLICT" && error.code !== "NOT_FOUND") throw error;
          const current = this.read().snapshot.drafts[draftId];
          if (current && current.revision !== expectedRevision) throw errors.versionConflict(current.revision);
          if (!current && expectedRevision !== null) throw errors.notFound("邮件草稿不存在");
        }
        throw saveFailure();
      }
      return next;
    });
  }

  serialize<T>(run: () => Promise<T>): Promise<T> {
    const operation = this.tail.then(run);
    this.tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}

export function registerDrafts(api: HuhuApi, accounts: MailAccounts | undefined, lifetime: AbortSignal, transport: MailSmtpTransport | undefined): () => Promise<void> {
  const drafts = new MailDrafts(api.vault.files, accounts, lifetime);
  const outbox = new MailOutbox(api.vault.files, drafts, accounts, transport, lifetime);
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
    defineCapability({
      ...workbenchDraft,
      name: "mail.outbox.submit",
      scope: "execute",
      idempotency: "handler",
      input: outboxSubmitInput,
      output: outboxReceipt,
      handler: ({ caller, signal }, input) => {
        authorize(caller, "mail.outbox.submit");
        return outbox.submit(input, signal);
      },
    }),
  );
  api.defineCapability(
    defineCapability({
      ...workbenchDraft,
      name: "mail.outbox.status",
      scope: "read",
      input: outboxStatusInput,
      output: outboxView,
      handler: ({ caller }, input) => {
        authorize(caller, "mail.outbox.status");
        return outbox.status(input);
      },
    }),
  );
  api.defineCapability(
    defineCapability({
      ...workbenchDraft,
      name: "mail.outbox.list",
      scope: "read",
      input: z.strictObject({}),
      output: z.strictObject({ operations: z.array(outboxSummary) }),
      handler: ({ caller }) => {
        authorize(caller, "mail.outbox.list");
        return { operations: outbox.list() };
      },
    }),
  );
  api.defineCapability(
    defineCapability({
      ...workbenchDraft,
      name: "mail.outbox.retry",
      scope: "execute",
      idempotency: "handler",
      input: outboxRetryInput,
      output: outboxReceipt,
      handler: ({ caller, signal }, input) => {
        authorize(caller, "mail.outbox.retry");
        return outbox.retry(input, signal);
      },
    }),
  );
  api.defineCapability(
    defineCapability({
      ...workbenchDraft,
      name: "mail.outbox.deleteLocal",
      scope: "write",
      idempotency: "handler",
      input: outboxStatusInput,
      output: outboxStatusInput.extend({ deleted: z.literal(true) }),
      handler: ({ caller, signal }, input) => {
        authorize(caller, "mail.outbox.deleteLocal");
        return outbox.deleteLocal(input, signal);
      },
    }),
  );
  api.defineCapability(
    defineCapability({
      ...workbenchDraft,
      name: "mail.drafts.list",
      scope: "read",
      input: z.strictObject({}),
      output: z.strictObject({ drafts: z.array(draftSummary) }),
      handler: ({ caller }) => {
        authorize(caller, "mail.drafts.list");
        return { drafts: drafts.list() };
      },
    }),
  );
  api.defineCapability(
    defineCapability({
      ...workbenchDraft,
      name: "mail.drafts.get",
      scope: "read",
      input: draftKey,
      output: z.strictObject({ draft: draftDetails.nullable() }),
      handler: ({ caller }, { draftId }) => {
        authorize(caller, "mail.drafts.get");
        return { draft: drafts.get(draftId) };
      },
    }),
  );
  api.defineCapability(
    defineCapability({
      ...workbenchDraft,
      name: "mail.drafts.save",
      scope: "write",
      idempotency: "handler",
      input: saveInput,
      output: draftDetails,
      handler: ({ caller, signal }, input) => {
        authorize(caller, "mail.drafts.save");
        return drafts.save(input, AbortSignal.any([signal, lifetime]));
      },
    }),
  );
  api.defineCapability(
    defineCapability({
      ...workbenchDraft,
      name: "mail.drafts.discard",
      scope: "write",
      idempotency: "handler",
      input: discardInput,
      output: draftKey.extend({ discarded: z.literal(true) }),
      handler: ({ caller, signal }, input) => {
        authorize(caller, "mail.drafts.discard");
        return drafts.discard(input, AbortSignal.any([signal, lifetime]));
      },
    }),
  );
  return async () => {
    await drafts.drain();
    await outbox.drain();
  };
}
