import { mailActor, mailRequestId, mailTool, requireMailCaller } from "./tool-access.js";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { errors, HuhuError, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type CapabilityContext, type HuhuApi } from "@huhu/kernel";
import { OperationLog, type OpStep } from "@huhu/vault";
import { z } from "zod";
import { maxMailArchiveBytes } from "../mail-subset-limit.js";
import { mailAccountDefinitionSchema } from "./account-definition.js";
import type { AccountRemovals } from "./account-removals.js";
import type { MailAccountOwner, openMailAccounts } from "./accounts.js";
import { attachmentDigest, attachmentObjectPath, MAX_DRAFT_ATTACHMENT_BYTES } from "./draft-attachments.js";
import { uuid } from "./draft-content.js";
import { draftsPath, readDraftSnapshot, storedDraft, withMailSnapshot } from "./drafts.js";
import { cachedReadOverrides } from "./message-cache.js";
import { outboxRecordPath, outboxRecordSchema, OutboxStorage, parseOutboxRecord } from "./outbox-storage.js";
import { readOverrideFile, readOverrideId, readOverridePath, readOverrides } from "./read-overrides.js";
import { createMailArchive, readMailArchive } from "./subset-archive.js";

import { mailUnknown, type MailIntents } from "./tool-intents.js";

const maxAccounts = 20;
const maxAttachments = 25 * 1024 * 1024;
const selection = z
  .array(uuid)
  .min(1)
  .max(maxAccounts)
  .refine((ids) => new Set(ids).size === ids.length);
const encoded = z.base64().max(Math.ceil(maxMailArchiveBytes / 3) * 4);
const accountData = z.strictObject({
  accountId: uuid,
  definition: mailAccountDefinitionSchema.refine((value) => !value.restoredFrom),
  drafts: z.record(uuid, storedDraft),
  deliveries: z.array(outboxRecordSchema).max(500),
  readOverrides: z.array(readOverrideId).max(100_000),
});
const packet = z.strictObject({ format: z.literal("huhu-mail-subset"), version: z.literal(1), accounts: z.array(accountData).min(1).max(maxAccounts), attachments: z.record(attachmentDigest, z.base64()) });
type Data = z.infer<typeof accountData>;
type Packet = z.infer<typeof packet>;
type Files = HuhuApi["vault"]["files"];
type Accounts = ReturnType<typeof openMailAccounts>;
const planRow = z.strictObject({
  accountId: uuid,
  email: z.string(),
  label: z.string(),
  drafts: z.int(),
  deliveries: z.int(),
  missingAttachments: z.int(),
  state: z.enum(["ready", "conflict", "restored"]),
  existing: z.strictObject({ accountId: uuid, email: z.string(), label: z.string() }).optional(),
});
type PlanRow = z.infer<typeof planRow>;
export type MailSubsetPreview = { previewId: string; accounts: PlanRow[] };
type Plan = { packet: Packet; rows: PlanRow[]; actor: string; expires: number; restoring: boolean };
const ownerOf = (context: CapabilityContext) => mailActor(context, "mail.subset");
const json = (value: unknown) => Buffer.from(JSON.stringify(value) + "\n");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const fingerprint = (row: Data) => hash(json(row));
const emailOf = (row: Data) => row.definition.settings.email.toLowerCase();
const invalid = (message: string) => new HuhuError("INVALID_INPUT", message, { details: { reason: "mail-subset" } });
const expireMs = 5 * 60_000;

function references(row: Data) {
  const drafts = [...Object.values(row.drafts).flatMap(({ draft }) => (draft ? [draft] : [])), ...row.deliveries.flatMap((record) => ("deleted" in record ? [] : [record.draft]))];
  return drafts.flatMap((draft) => draft.attachments ?? []);
}

function attachmentRefs(row: Data) {
  return new Map(references(row).map((ref) => [ref.digest, ref]));
}

function validate(input: unknown): Packet {
  try {
    const data = packet.parse(input);
    const ids = new Set<string>();
    const drafts = new Set<string>();
    const records = new Set<string>();
    const refs = new Map<string, number>();
    for (const row of data.accounts) {
      if (ids.has(row.accountId)) throw invalid("包内邮箱标识重复。");
      ids.add(row.accountId);
      for (const [id, { draft }] of Object.entries(row.drafts)) {
        if (!draft || draft.accountId !== row.accountId || drafts.has(id)) throw invalid("包内草稿归属或标识无效。");
        drafts.add(id);
      }
      const operations = new Set(row.deliveries.filter((record) => !("deleted" in record)).map((record) => record.draftId));
      for (const raw of row.deliveries) {
        const record = parseOutboxRecord(raw);
        if (records.has(record.operationId) || ("deleted" in record ? !operations.has(record.draftId) && !row.drafts[record.draftId] : record.draft.accountId !== row.accountId)) throw invalid("包内投递归属或标识无效。");
        records.add(record.operationId);
      }
      for (const ref of references(row)) {
        if (refs.has(ref.digest) && refs.get(ref.digest) !== ref.size) throw invalid("包内附件大小不一致。");
        refs.set(ref.digest, ref.size);
      }
    }
    let total = 0;
    for (const [digest, content] of Object.entries(data.attachments)) {
      const bytes = Buffer.from(content, "base64");
      total += bytes.length;
      if (total > maxAttachments || bytes.length > MAX_DRAFT_ATTACHMENT_BYTES || refs.get(digest) !== bytes.length || hash(bytes) !== digest) throw invalid("包内附件校验失败或超过上限。");
    }
    return data;
  } catch (error) {
    if (error instanceof HuhuError) throw error;
    throw invalid("Mail 子集内容或版本无效。");
  }
}

function bytesAt(files: Files, digest: string, size: number) {
  const bytes = files.read(attachmentObjectPath(digest))?.bytes;
  return bytes?.length === size && hash(bytes) === digest ? bytes : undefined;
}

async function assemble(files: Files, accounts: Accounts, ids: string[], signal: AbortSignal): Promise<Packet> {
  const available = new Map((await accounts.list()).map((row) => [row.accountId, row.definition]));
  const { snapshot } = readDraftSnapshot(files);
  const recorded = [...new OutboxStorage(files).records()];
  const attachments: Packet["attachments"] = {};
  let total = 0;
  const selected = ids.map((accountId): Data => {
    signal.throwIfAborted();
    const entry = available.get(accountId);
    if (!entry) throw errors.notFound("邮箱");
    const { restoredFrom: _oldRestore, ...definition } = entry;
    const drafts = Object.fromEntries(Object.entries(snapshot.drafts).filter(([, stored]) => stored.draft?.accountId === accountId));
    const sending = recorded.filter((item) => !("deleted" in item) && item.draft.accountId === accountId);
    const draftIds = new Set([...Object.keys(drafts), ...sending.map((item) => item.draftId)]);
    const deliveries = [...sending, ...recorded.filter((item) => "deleted" in item && draftIds.has(item.draftId))];
    const marked = readOverrides(files, accountId).ids;
    for (const { path: folder } of definition.folders) for (const id of cachedReadOverrides(files, { accountId, folder })) marked.add(id);
    const row = { accountId, definition, drafts, deliveries, readOverrides: [...marked].sort() };
    for (const { digest, size } of attachmentRefs(row).values()) {
      if (attachments[digest] !== undefined) continue;
      const bytes = bytesAt(files, digest, size);
      if (!bytes) continue;
      total += bytes.length;
      if (total > maxAttachments) throw invalid("子集附件合计超过 25 MiB。");
      attachments[digest] = bytes.toString("base64");
    }
    return row;
  });
  return validate({ format: "huhu-mail-subset", version: 1, accounts: selected, attachments });
}

function missingFor(files: Files, row: Data, data: Packet) {
  return [...attachmentRefs(row).values()].filter(({ digest, size }) => data.attachments[digest] === undefined && !bytesAt(files, digest, size)).length;
}

async function inspect(files: Files, accounts: Accounts, removals: AccountRemovals, data: Packet): Promise<PlanRow[]> {
  const current = await accounts.list();
  const { snapshot } = readDraftSnapshot(files);
  return data.accounts.map((row) => {
    const same = current.find(({ accountId, definition }) => accountId === row.accountId || definition.settings.email.toLowerCase() === emailOf(row));
    const restored = same?.accountId === row.accountId && same.definition.restoredFrom === fingerprint(row);
    const conflict =
      !!same ||
      !!removals.read(row.accountId) ||
      data.accounts.some((other) => other !== row && emailOf(other) === emailOf(row)) ||
      Object.keys(row.drafts).some((id) => snapshot.drafts[id]) ||
      row.deliveries.some(({ operationId }) => files.exists(outboxRecordPath(operationId)));
    const { email, label } = row.definition.settings;
    return {
      accountId: row.accountId,
      email,
      label,
      drafts: Object.keys(row.drafts).length,
      deliveries: row.deliveries.length,
      missingAttachments: missingFor(files, row, data),
      state: restored ? "restored" : conflict ? "conflict" : "ready",
      ...(same && { existing: { accountId: same.accountId, email: same.definition.settings.email, label: same.definition.settings.label } }),
    };
  });
}

function prepare(files: Files, row: Data, data: Packet): OpStep[] {
  const steps: OpStep[] = [];
  for (const { digest, size } of attachmentRefs(row).values()) {
    const content = data.attachments[digest];
    if (content === undefined) continue;
    const object = attachmentObjectPath(digest);
    if (bytesAt(files, digest, size)) continue;
    if (files.exists(object)) throw invalid("目标 Vault 中存在损坏的同摘要附件，请先检查附件。");
    steps.push({ action: "write", path: object, bytes: Buffer.from(content, "base64") });
  }
  const { snapshot } = readDraftSnapshot(files);
  for (const [id, stored] of Object.entries(row.drafts)) {
    if (snapshot.drafts[id]) throw errors.versionConflict(snapshot.drafts[id].revision);
    snapshot.drafts[id] = stored;
  }
  if (Object.keys(row.drafts).length) steps.push({ action: "write", path: draftsPath, bytes: json(snapshot) });
  for (const record of row.deliveries) {
    const file = outboxRecordPath(record.operationId);
    const version = files.currentVersion(file);
    if (version) throw errors.versionConflict(version);
    steps.push({ action: "write", path: file, bytes: json(record) });
  }
  if (row.readOverrides.length) {
    const file = readOverridePath(row.accountId);
    const version = files.currentVersion(file);
    if (version) throw errors.versionConflict(version);
    steps.push({ action: "write", path: file, bytes: json(readOverrideFile.parse({ format: 1, messages: row.readOverrides })) });
  }
  return steps;
}

export const subsetDescriptors = {
  subsetCreate: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.subset.create",
    title: "导出邮件子集",
    description: "为所选邮箱生成不含本机认证的内存包。",
    risk: "high",
    scope: "read",
    input: z.strictObject({ accountIds: selection }),
    output: z.strictObject({ content: encoded }),
  }),
  subsetPreview: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.subset.preview",
    title: "预检邮件子集",
    description: "为当前调用者创建邮件恢复预检。",
    risk: "high",
    scope: "write",
    input: z.strictObject({ content: encoded, requestId: mailRequestId }),
    output: z.strictObject({ previewId: uuid, accounts: z.array(planRow) }),
    idempotency: "handler",
  }),
  subsetCancel: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.subset.cancel",
    title: "取消邮件恢复预检",
    description: "释放当前调用者的未提交恢复预检。",
    risk: "normal",
    scope: "write",
    input: z.strictObject({ previewId: uuid }),
    output: z.strictObject({ cancelled: z.literal(true) }),
    idempotency: "handler",
  }),
  subsetRestore: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.subset.restore",
    title: "恢复邮件子集",
    description: "提交当前调用者的邮件恢复计划。",
    risk: "high",
    scope: "write",
    idempotency: "handler",
    input: z.strictObject({ previewId: uuid, accountIds: selection, confirm: z.literal(true) }),
    output: z.strictObject({ accounts: z.array(planRow) }),
  }),
};

export async function registerMailSubset(api: HuhuApi, accounts: Accounts | undefined, owner: MailAccountOwner | undefined, removals: AccountRemovals, lifetime: AbortSignal, once: MailIntents) {
  const { files } = api.vault;
  const runtime = owner && path.relative(files.root, owner.vault.runtimeDir).split(path.sep).join("/");
  const journal = runtime && !files.readOnly ? new OperationLog(files, files.abs(`${runtime}/mail-subset-journal`)) : undefined;
  const done = (id: string) => `${runtime}/mail-subset-confirmed/${id}.json`;
  let blocked = false;
  if (journal && accounts) {
    try {
      for (const operation of journal.list()) {
        const match = /^mail-subset:([0-9a-f-]+):([0-9a-f]{64})$/.exec(operation.kind);
        if (!match || files.exists(done(operation.opId)) || operation.state === "rolled_back") continue;
        const [, accountId, expected] = match;
        if (operation.state === "committed" && (accounts.readDefinition(accountId!)?.definition.restoredFrom === expected || removals.read(accountId!)))
          await files.write(done(operation.opId), json({ format: 1 }), { expectedVersion: null });
        else if (journal.rollback(operation).state !== "rolled_back") blocked = true;
      }
      if (!blocked) journal.recover();
    } catch {
      blocked = true;
    }
  }
  const plans = new Map<string, Plan>();
  const pending = new Set<Promise<unknown>>();
  function access(context: CapabilityContext, capability: string) {
    requireMailCaller(context.caller, capability);
    if (!accounts) throw invalid("当前 Vault 未提供 Mail 账号存储。");
    return accounts;
  }
  function planOf(context: CapabilityContext, previewId: string) {
    const plan = plans.get(previewId);
    if (!plan || plan.actor !== ownerOf(context) || plan.expires <= Date.now()) throw errors.notFound("Mail 恢复预检");
    return plan;
  }

  api.defineCapability(
    bindCapability(subsetDescriptors.subsetCreate, async (context, { accountIds }) => {
      const ownerAccounts = access(context, "mail.subset.create");
      const signal = AbortSignal.any([context.signal, lifetime]);
      const vault = files.read(".huhu/vault.json");
      if (!vault) throw errors.notFound("Vault 配置");
      const data = await withMailSnapshot(files, () => assemble(files, ownerAccounts, accountIds, signal));
      return { content: (await createMailArchive(vault.bytes, data, signal)).toString("base64") };
    }),
  );
  api.defineCapability(
    bindCapability(subsetDescriptors.subsetPreview, (context, { content, requestId }) => {
      const name = subsetDescriptors.subsetPreview.name;
      const ownerAccounts = access(context, name);
      const actor = ownerOf(context);
      const signal = AbortSignal.any([context.signal, lifetime]);
      return once(
        context,
        name,
        requestId,
        content,
        async () => {
          signal.throwIfAborted();
          const parsed = validate(readMailArchive(Buffer.from(content, "base64")));
          const rows = await inspect(files, ownerAccounts, removals, parsed);
          signal.throwIfAborted();
          const now = Date.now();
          for (const [id, plan] of plans) if (!plan.restoring && plan.expires <= now) plans.delete(id);
          const own = [...plans].filter(([, plan]) => plan.actor === actor);
          if (own.length >= 2) {
            const replaceable = own.find(([, plan]) => !plan.restoring);
            if (replaceable) plans.delete(replaceable[0]);
            else throw invalid("当前调用者仍有邮件恢复进行中。");
          }
          if (plans.size >= 4) throw invalid("本机邮件恢复预检已满，请稍后重试。");
          const previewId = randomUUID();
          plans.set(previewId, { packet: parsed, rows, actor, expires: now + expireMs, restoring: false });
          return { previewId, accounts: rows };
        },
        ({ previewId }) => previewId,
        (previewId) => ({ previewId, accounts: planOf(context, previewId).rows }),
      );
    }),
  );
  api.defineCapability(
    bindCapability(subsetDescriptors.subsetCancel, (context, { previewId }) => {
      const name = subsetDescriptors.subsetCancel.name;
      access(context, name);
      return once(
        context,
        name,
        previewId,
        { previewId },
        () => {
          if (planOf(context, previewId).restoring) throw invalid("已开始提交，请等待恢复结果。");
          plans.delete(previewId);
          return { cancelled: true as const };
        },
        (data) => data,
        (data) => data,
      );
    }),
  );
  api.defineCapability(
    bindCapability(subsetDescriptors.subsetRestore, (context, { previewId, accountIds }) => {
      const name = subsetDescriptors.subsetRestore.name;
      const ownerAccounts = access(context, name);
      files.assertWritable();
      const signal = AbortSignal.any([context.signal, lifetime]);
      if (!journal || blocked) throw invalid("本机 Mail 恢复记录需要检查。");
      return once(
        context,
        name,
        previewId,
        accountIds.slice().sort(),
        async () => {
          const plan = planOf(context, previewId);
          if (!isWorkbenchCaller(context.caller) && accountIds.some((id) => !plan.rows.some((row) => row.accountId === id && row.state !== "conflict"))) throw invalid("所选邮箱须通过原预检。");
          if (plan.restoring) throw invalid("已开始提交，请等待恢复结果。");
          plan.restoring = true;
          const commit = () =>
            withMailSnapshot(files, async () => {
              signal.throwIfAborted();
              if (blocked) throw invalid("本机 Mail 恢复记录需要检查。");
              const data = plan.packet;
              const chosen = new Set(accountIds);
              const rows = (await inspect(files, ownerAccounts, removals, data)).filter(({ accountId }) => chosen.has(accountId));
              if (rows.length !== chosen.size || rows.some(({ state }) => state === "conflict")) throw invalid("所选邮箱存在冲突，请重新预检并选择可恢复项。");
              for (const row of data.accounts) {
                if (!chosen.has(row.accountId) || rows.find(({ accountId }) => accountId === row.accountId)?.state === "restored") continue;
                signal.throwIfAborted();
                const key = fingerprint(row);
                const id = randomUUID();
                const changes = prepare(files, row, data);
                try {
                  await journal.run(id, `mail-subset:${row.accountId}:${key}`, changes, { afterStep: () => signal.throwIfAborted() });
                  signal.throwIfAborted();
                  await ownerAccounts.restoreDefinition(row.accountId, { ...row.definition, restoredFrom: key }, signal);
                } catch (error) {
                  if (ownerAccounts.readDefinition(row.accountId)?.definition.restoredFrom !== key) {
                    try {
                      const op = journal.load(id);
                      if (op && op.state !== "rolled_back" && journal.rollback(op).state !== "rolled_back") blocked = true;
                    } catch {
                      blocked = true;
                    }
                    throw error;
                  }
                }
                await files.write(done(id), json({ format: 1 }), { expectedVersion: null }).catch(() => undefined);
                if (!lifetime.aborted) api.events.publish("entity.changed", { kind: "mail-account", id: row.accountId, op: "created" });
              }
              return { accounts: (await inspect(files, ownerAccounts, removals, data)).filter(({ accountId }) => chosen.has(accountId)) };
            });
          // Account removal also takes its account lock before entering the snapshot writer.
          const run = [...accountIds].sort().reduceRight((next, id) => () => removals.serialize(id, next), commit);
          const restore = run();
          pending.add(restore);
          try {
            return await restore;
          } finally {
            plan.restoring = false;
            pending.delete(restore);
          }
        },
        ({ accounts }) =>
          accounts.map(({ accountId, drafts, deliveries, missingAttachments }) => ({
            accountId,
            drafts,
            deliveries,
            missingAttachments,
            revision: ownerAccounts.readDefinition(accountId)?.revision,
          })),
        (records) => ({
          accounts: records.map(({ accountId, revision, ...counts }) => {
            const current = ownerAccounts.readDefinition(accountId);
            if (!current || removals.read(accountId) || current.revision !== revision) throw mailUnknown();
            const { email, label } = current.definition.settings;
            return { accountId, ...counts, email, label, state: "restored" as const, existing: { accountId, email, label } };
          }),
        }),
      );
    }),
  );
  return async () => {
    plans.clear();
    await Promise.allSettled(pending);
  };
}
