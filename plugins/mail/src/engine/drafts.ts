import { randomUUID } from "node:crypto";
import { errors, HuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { defineCapability, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { openMailAccounts } from "./accounts.js";

const uuid = z.uuidv4().toLowerCase();
const draftKey = z.strictObject({ draftId: uuid });
const address = z.string().trim().toLowerCase().max(254).pipe(z.email());
const recipients = z.array(address).max(1_000);
const recipientFields = ["to", "cc", "bcc"] as const;
const maxBodyBytes = 1024 * 1024;

// Tiptap/ProseMirror document JSON. Preserve editor node and mark attributes as supplied.
const editorAttributes = z.record(z.string(), z.json());
const editorMark = z.strictObject({ type: z.string().min(1), attrs: editorAttributes.optional() });
type EditorNode = {
  type: string;
  attrs?: z.infer<typeof editorAttributes> | undefined;
  marks?: z.infer<typeof editorMark>[] | undefined;
  text?: string | undefined;
  content?: EditorNode[] | undefined;
};
const editorNode: z.ZodType<EditorNode> = z.lazy(() =>
  z.strictObject({
    type: z.string().min(1),
    attrs: editorAttributes.optional(),
    marks: z.array(editorMark).optional(),
    text: z.string().optional(),
    content: z.array(editorNode).optional(),
  }),
);
const editorDocument = z
  .strictObject({ type: z.literal("doc"), attrs: editorAttributes.optional(), content: z.array(editorNode).optional() })
  .refine((doc) => Buffer.byteLength(JSON.stringify(doc)) <= maxBodyBytes, "富文本草稿不能超过 1 MiB");

const draftContent = z.strictObject({
  accountId: uuid.nullable(),
  to: recipients,
  cc: recipients,
  bcc: recipients,
  subject: z.string().max(8192),
  body: editorDocument,
});
const draftMetadata = draftKey.extend({ revision: uuid, updatedAt: z.iso.datetime() });
const draftDetails = draftMetadata.extend(draftContent.shape);
const draftSummary = draftMetadata.extend(draftContent.pick({ accountId: true, subject: true }).shape);
const saveInput = draftKey.extend({ expectedRevision: uuid.nullable(), draft: draftContent });
const discardInput = draftKey.extend({ expectedRevision: uuid });
const storedDraft = draftMetadata.omit({ draftId: true }).extend({ draft: draftContent.nullable() });
const snapshotSchema = z.strictObject({ format: z.literal(1), drafts: z.record(uuid, storedDraft) });

type Draft = z.infer<typeof draftDetails>;
type DraftContent = z.infer<typeof draftContent>;
type StoredDraft = z.infer<typeof storedDraft>;
type Snapshot = z.infer<typeof snapshotSchema>;
type VaultFiles = HuhuApi["vault"]["files"];
type MailAccounts = ReturnType<typeof openMailAccounts>;

// This is Vault content. Read-only opens must read the original Vault, even with a scratch stateDir.
const draftsPath = ".huhu/mail/drafts.json";
const workbenchDraft = { plugin: "mail", exposable: false, defaultExposed: false } as const;

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

function activeDraft(draftId: string, record: StoredDraft | undefined): Draft | null {
  return record?.draft ? { draftId, revision: record.revision, updatedAt: record.updatedAt, ...record.draft } : null;
}

function saveFailure(): HuhuError {
  return new HuhuError("INTERNAL", "保存邮件草稿失败", { details: { reason: "draft-write-failed" } });
}

class MailDrafts {
  private tail = Promise.resolve();

  constructor(
    private readonly files: VaultFiles,
    private readonly accounts: MailAccounts | undefined,
  ) {}

  get(draftId: string): Draft | null {
    return activeDraft(draftId, this.read().snapshot.drafts[draftId]);
  }

  list() {
    return Object.entries(this.read().snapshot.drafts)
      .flatMap(([draftId, record]) => (record.draft ? [{ draftId, revision: record.revision, updatedAt: record.updatedAt, accountId: record.draft.accountId, subject: record.draft.subject }] : []))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.draftId.localeCompare(b.draftId));
  }

  async save({ draftId, expectedRevision, draft: content }: z.infer<typeof saveInput>, signal: AbortSignal): Promise<Draft> {
    const draft = normalizeDraft(content);
    const record = await this.change(draftId, expectedRevision, draft, signal);
    return { draftId, revision: record.revision, updatedAt: record.updatedAt, ...draft };
  }

  async discard({ draftId, expectedRevision }: z.infer<typeof discardInput>, signal: AbortSignal) {
    await this.change(draftId, expectedRevision, null, signal);
    return { draftId, discarded: true as const };
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

  private change(draftId: string, expectedRevision: string | null, draft: DraftContent | null, signal: AbortSignal): Promise<StoredDraft> {
    this.files.assertWritable();
    // Keep business CAS and replacement together. VaultFiles also checks the snapshot bytes at the atomic write.
    const operation = this.tail.then(async () => {
      signal.throwIfAborted();
      const { snapshot, version } = this.read();
      const previous = snapshot.drafts[draftId];
      if (previous && previous.revision !== expectedRevision) throw errors.versionConflict(previous.revision);
      if (previous?.draft === null || (!previous && expectedRevision !== null)) throw errors.notFound("邮件草稿不存在");
      const accountId = draft?.accountId;
      if (accountId && accountId !== previous?.draft?.accountId) {
        const available = (await this.accounts?.list())?.some((account) => account.accountId === accountId && account.definition.settings.smtpEnabled);
        if (!available) throw new HuhuError("INVALID_INPUT", "请选择可发信的邮箱账号", { details: { reason: "sender-not-available" } });
      }
      signal.throwIfAborted();
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
    this.tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}

export function registerDrafts(api: HuhuApi, accounts: MailAccounts | undefined, lifetime: AbortSignal): void {
  const drafts = new MailDrafts(api.vault.files, accounts);
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
}
