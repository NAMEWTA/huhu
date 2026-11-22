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
import { uuid, type StoredDraftContent } from "./draft-content.js";
import { draftsPath, readDraftSnapshot, storedDraft, withMailSnapshot } from "./drafts.js";
import { cachedMessageLocations, portableLocalMessageId, portableMessageLocation } from "./message-cache.js";
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
  messageLocations: z.array(portableMessageLocation).max(100_000).optional(),
});
const packet = z
  .strictObject({
    format: z.literal("huhu-mail-subset"),
    version: z.union([z.literal(1), z.literal(2)]),
    accounts: z.array(accountData).min(1).max(maxAccounts),
    attachments: z.record(attachmentDigest, z.base64()),
  })
  .refine(({ version, accounts }) => version === 2 || accounts.every(({ messageLocations }) => messageLocations === undefined));
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
  canKeepSeparate: z.literal(true).optional(),
  unmappedReadOverrides: z.int().positive().optional(),
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

function draftContents(row: Data) {
  return [...Object.values(row.drafts).flatMap(({ draft }) => (draft ? [draft] : [])), ...row.deliveries.flatMap((record) => ("deleted" in record ? [] : [record.draft]))];
}

function attachmentRefs(row: Data) {
  return new Map(draftContents(row).flatMap((draft) => draft.attachments ?? []).map((ref) => [ref.digest, ref]));
}

function sourceReferences(row: Data) {
  return draftContents(row)
    .flatMap(({ reply, forward }) => [reply, forward])
    .flatMap((source) => (source?.accountId === row.accountId ? [source] : []));
}

function messageIds(row: Data, targetId: string) {
  const ids = new Map<string, string>();
  for (const location of row.messageLocations ?? []) {
    const oldId = portableLocalMessageId(row.accountId, location, row.definition);
    const newId = portableLocalMessageId(targetId, location, row.definition);
    if (oldId && newId) ids.set(oldId, newId);
  }
  return ids;
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
      for (const ref of draftContents(row).flatMap((draft) => draft.attachments ?? [])) {
        if (refs.has(ref.digest) && refs.get(ref.digest) !== ref.size) throw invalid("包内附件大小不一致。");
        refs.set(ref.digest, ref.size);
      }
      if (row.messageLocations?.length) {
        const ids = messageIds(row, row.accountId);
        const referenced = new Set([...row.readOverrides, ...sourceReferences(row).map(({ localMessageId }) => localMessageId)]);
        const folders = new Set(row.definition.folders.map(({ path }) => path));
        if (ids.size !== row.messageLocations.length || [...ids.keys()].some((id) => !referenced.has(id)) || row.messageLocations.some(({ folder }) => !folders.has(folder)))
          throw invalid("包内邮件定位与引用不一致。");
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
    const row: Data = { accountId, definition, drafts, deliveries, readOverrides: [] };
    const referenced = new Set(sourceReferences(row).map(({ localMessageId }) => localMessageId));
    const locations = new Map<string, z.infer<typeof portableMessageLocation>>();
    for (const { path: folder } of definition.folders) {
      for (const { localMessageId, localRead, location } of cachedMessageLocations(files, { accountId, folder })) {
        if (localRead) marked.add(localMessageId);
        if ((marked.has(localMessageId) || referenced.has(localMessageId)) && portableLocalMessageId(accountId, location, definition) === localMessageId) locations.set(localMessageId, location);
      }
    }
    row.readOverrides = [...marked].sort();
    if (locations.size) row.messageLocations = [...locations.keys()].sort().map((id) => locations.get(id)!);
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
  return validate({ format: "huhu-mail-subset", version: selected.some((row) => row.messageLocations) ? 2 : 1, accounts: selected, attachments });
}

function missingFor(files: Files, row: Data, data: Packet) {
  return [...attachmentRefs(row).values()].filter(({ digest, size }) => data.attachments[digest] === undefined && !bytesAt(files, digest, size)).length;
}

async function inspect(files: Files, accounts: Accounts, removals: AccountRemovals, confirmed: ReadonlyMap<string, string>, data: Packet): Promise<PlanRow[]> {
  const current = await accounts.list();
  const { snapshot } = readDraftSnapshot(files);
  return data.accounts.map((row) => {
    const key = fingerprint(row);
    const { messageLocations, ...legacy } = row;
    const legacyKey = messageLocations ? fingerprint(legacy) : key;
    const confirmedTargetId = confirmed.get(key) ?? confirmed.get(legacyKey);
    const restored = current.find(({ accountId, definition }) => {
      if (confirmedTargetId && accountId !== confirmedTargetId) return false;
      return definition.restoredFrom === key || (accountId === row.accountId && definition.restoredFrom === legacyKey);
    });
    const sameId = current.find(({ accountId }) => accountId === row.accountId);
    const sameAddress = current.find(({ definition }) => definition.settings.email.toLowerCase() === emailOf(row));
    const blocked =
      !!confirmedTargetId ||
      !!removals.read(row.accountId) ||
      data.accounts.some((other) => other !== row && emailOf(other) === emailOf(row)) ||
      Object.keys(row.drafts).some((id) => snapshot.drafts[id]) ||
      row.deliveries.some(({ operationId }) => files.exists(outboxRecordPath(operationId))) ||
      [...attachmentRefs(row).values()].some(({ digest, size }) => files.exists(attachmentObjectPath(digest)) && !bytesAt(files, digest, size));
    const canKeepSeparate = !restored && !blocked && !!sameAddress;
    const same = restored ?? sameAddress ?? sameId;
    const messageMap = canKeepSeparate || (restored && restored.accountId !== row.accountId) ? messageIds(row, row.accountId) : undefined;
    const unmappedReadOverrides = messageMap ? [...new Set(row.readOverrides)].filter((id) => !messageMap.has(id)).length : 0;
    const { email, label } = row.definition.settings;
    return {
      accountId: row.accountId,
      email,
      label,
      drafts: Object.keys(row.drafts).length,
      deliveries: row.deliveries.length,
      missingAttachments: missingFor(files, row, data),
      state: restored ? "restored" : blocked || same ? "conflict" : "ready",
      ...(same && { existing: { accountId: same.accountId, email: same.definition.settings.email, label: same.definition.settings.label } }),
      ...(canKeepSeparate && { canKeepSeparate: true }),
      ...(unmappedReadOverrides > 0 && { unmappedReadOverrides }),
    };
  });
}

function prepare(files: Files, row: Data, data: Packet, targetId: string): OpStep[] {
  const steps: OpStep[] = [];
  for (const { digest, size } of attachmentRefs(row).values()) {
    const content = data.attachments[digest];
    if (content === undefined) continue;
    const object = attachmentObjectPath(digest);
    if (bytesAt(files, digest, size)) continue;
    if (files.exists(object)) throw invalid("目标 Vault 中存在损坏的同摘要附件，请先检查附件。");
    steps.push({ action: "write", path: object, bytes: Buffer.from(content, "base64") });
  }
  const remapped = row.accountId === targetId ? undefined : messageIds(row, targetId);
  function reassign(draft: StoredDraftContent): StoredDraftContent {
    if (!remapped) return draft;
    const rebind = <T extends { accountId: string; localMessageId: string }>(source: T): T => {
      if (source.accountId !== row.accountId) return source;
      return { ...source, accountId: targetId, localMessageId: remapped.get(source.localMessageId) ?? source.localMessageId };
    };
    return { ...draft, accountId: targetId, ...(draft.reply && { reply: rebind(draft.reply) }), ...(draft.forward && { forward: rebind(draft.forward) }) };
  }
  const { snapshot } = readDraftSnapshot(files);
  for (const [id, stored] of Object.entries(row.drafts)) {
    if (snapshot.drafts[id]) throw errors.versionConflict(snapshot.drafts[id].revision);
    snapshot.drafts[id] = stored.draft ? { ...stored, draft: reassign(stored.draft) } : stored;
  }
  if (Object.keys(row.drafts).length) steps.push({ action: "write", path: draftsPath, bytes: json(snapshot) });
  for (const record of row.deliveries) {
    const file = outboxRecordPath(record.operationId);
    const version = files.currentVersion(file);
    if (version) throw errors.versionConflict(version);
    steps.push({ action: "write", path: file, bytes: json("deleted" in record ? record : { ...record, draft: reassign(record.draft) }) });
  }
  const messages = remapped ? [...new Set(row.readOverrides.flatMap((id) => remapped.get(id) ?? []))].sort() : row.readOverrides;
  if (messages.length) {
    const file = readOverridePath(targetId);
    const version = files.currentVersion(file);
    if (version) throw errors.versionConflict(version);
    steps.push({ action: "write", path: file, bytes: json(readOverrideFile.parse({ format: 1, messages })) });
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
    input: z
      .strictObject({ previewId: uuid, accountIds: selection, confirm: z.literal(true), keepSeparateAccountIds: selection.optional() })
      .refine(({ accountIds, keepSeparateAccountIds }) => keepSeparateAccountIds?.every((id) => accountIds.includes(id)) ?? true),
    output: z.strictObject({ accounts: z.array(planRow) }),
  }),
};

export async function registerMailSubset(api: HuhuApi, accounts: Accounts | undefined, owner: MailAccountOwner | undefined, removals: AccountRemovals, lifetime: AbortSignal, once: MailIntents) {
  const { files } = api.vault;
  const runtime = owner && path.relative(files.root, owner.vault.runtimeDir).split(path.sep).join("/");
  const journal = runtime && !files.readOnly ? new OperationLog(files, files.abs(`${runtime}/mail-subset-journal`)) : undefined;
  const done = (id: string) => `${runtime}/mail-subset-confirmed/${id}.json`;
  // The journal records the destination ID. The definition stores the source fingerprint.
  const confirmed = new Map<string, string>();
  let blocked = false;
  if (journal && accounts) {
    try {
      for (const operation of journal.list()) {
        const match = /^mail-subset:([0-9a-f-]+):([0-9a-f]{64})$/.exec(operation.kind);
        if (!match || operation.state === "rolled_back") continue;
        const [, accountId, expected] = match;
        if (files.exists(done(operation.opId))) {
          if (operation.state === "committed") confirmed.set(expected!, accountId!);
          continue;
        }
        if (operation.state === "committed" && (accounts.readDefinition(accountId!)?.definition.restoredFrom === expected || removals.read(accountId!))) {
          await files.write(done(operation.opId), json({ format: 1 }), { expectedVersion: null });
          confirmed.set(expected!, accountId!);
        } else if (journal.rollback(operation).state !== "rolled_back") blocked = true;
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
          const rows = await withMailSnapshot(files, () => inspect(files, ownerAccounts, removals, confirmed, parsed));
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
    bindCapability(subsetDescriptors.subsetRestore, (context, { previewId, accountIds, keepSeparateAccountIds }) => {
      const name = subsetDescriptors.subsetRestore.name;
      const ownerAccounts = access(context, name);
      files.assertWritable();
      const signal = AbortSignal.any([context.signal, lifetime]);
      if (!journal || blocked) throw invalid("本机 Mail 恢复记录需要检查。");
      const separate = new Set(keepSeparateAccountIds);
      return once(
        context,
        name,
        previewId,
        separate.size ? { accountIds: accountIds.toSorted(), keepSeparateAccountIds: [...separate].sort() } : accountIds.toSorted(),
        async () => {
          const plan = planOf(context, previewId);
          const previewed = new Map(plan.rows.map((row) => [row.accountId, row]));
          if ([...separate].some((id) => !previewed.get(id)?.canKeepSeparate)) throw invalid("仅可将通过预检的同地址邮箱保留为独立账号。");
          if (!isWorkbenchCaller(context.caller) && accountIds.some((id) => !previewed.has(id) || (previewed.get(id)?.state === "conflict" && !separate.has(id)))) throw invalid("所选邮箱须通过原预检。");
          if (plan.restoring) throw invalid("已开始提交，请等待恢复结果。");
          plan.restoring = true;
          const commit = () =>
            withMailSnapshot(files, async () => {
              signal.throwIfAborted();
              if (blocked) throw invalid("本机 Mail 恢复记录需要检查。");
              const data = plan.packet;
              const chosen = new Set(accountIds);
              const rows = (await inspect(files, ownerAccounts, removals, confirmed, data)).filter(({ accountId }) => chosen.has(accountId));
              const incompatible = rows.some(({ accountId, state, canKeepSeparate, existing }) => {
                if (state === "restored") return false;
                if (separate.has(accountId)) return !canKeepSeparate || existing?.accountId !== previewed.get(accountId)?.existing?.accountId;
                return state === "conflict";
              });
              if (rows.length !== chosen.size || incompatible) throw invalid("所选邮箱存在冲突，请重新预检并选择可恢复项。");
              for (const row of data.accounts) {
                if (!chosen.has(row.accountId) || rows.find(({ accountId }) => accountId === row.accountId)?.state === "restored") continue;
                signal.throwIfAborted();
                const key = fingerprint(row);
                const id = randomUUID();
                const keepSeparate = separate.has(row.accountId);
                // This fresh ID has no visible account until the journaled records and definition are saved.
                const targetId = keepSeparate ? randomUUID() : row.accountId;
                const changes = prepare(files, row, data, targetId);
                try {
                  await journal.run(id, `mail-subset:${targetId}:${key}`, changes, { afterStep: () => signal.throwIfAborted() });
                  signal.throwIfAborted();
                  await ownerAccounts.restoreDefinition(targetId, { ...row.definition, restoredFrom: key }, signal, keepSeparate);
                } catch (error) {
                  if (ownerAccounts.readDefinition(targetId)?.definition.restoredFrom !== key) {
                    try {
                      const op = journal.load(id);
                      if (op && op.state !== "rolled_back" && journal.rollback(op).state !== "rolled_back") blocked = true;
                    } catch {
                      blocked = true;
                    }
                    throw error;
                  }
                }
                confirmed.set(key, targetId);
                await files.write(done(id), json({ format: 1 }), { expectedVersion: null }).catch(() => undefined);
                if (!lifetime.aborted) api.events.publish("entity.changed", { kind: "mail-account", id: targetId, op: "created" });
              }
              return { accounts: (await inspect(files, ownerAccounts, removals, confirmed, data)).filter(({ accountId }) => chosen.has(accountId)) };
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
          accounts.map(({ accountId, drafts, deliveries, missingAttachments, existing, unmappedReadOverrides }) => ({
            accountId,
            targetId: existing?.accountId,
            drafts,
            deliveries,
            missingAttachments,
            unmappedReadOverrides,
            revision: ownerAccounts.readDefinition(existing?.accountId ?? accountId)?.revision,
          })),
        (records) => ({
          accounts: records.map(({ accountId, targetId = accountId, revision, ...counts }) => {
            const current = ownerAccounts.readDefinition(targetId);
            if (!current || removals.read(targetId) || current.revision !== revision) throw mailUnknown();
            const { email, label } = current.definition.settings;
            return { accountId, ...counts, email, label, state: "restored" as const, existing: { accountId: targetId, email, label } };
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
