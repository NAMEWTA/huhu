import { readdirSync } from "node:fs";
import { errors } from "@huhu/contracts";
import { defineCapabilityDescriptor, type CapabilityContext } from "@huhu/kernel";
import type { VaultFiles } from "@huhu/vault";
import { z } from "zod";
import { fingerprint } from "./dispatch-store.js";
import { WriteQueue } from "./write-queue.js";

export type CommittedResult = { receiptId: string; messageId: string; body: string };

const resultKey = z.strictObject({ taskId: z.string().min(1).max(256), receiptId: z.string().regex(/\S/u) });
const issueKey = z.strictObject({ sourceId: z.uuidv4(), issueId: z.int().positive() });
const githubKey = issueKey.extend(resultKey.shape);
const actorId = z.int().positive();
const githubGrant = issueKey.extend({ actorId });
const deliveryId = z.string().regex(/^[a-f0-9]{64}$/u);
const githubCommentProof = z.strictObject({ id: z.int().positive(), actorId, url: z.url(), body: z.string() });
const githubEvidence = githubCommentProof.omit({ body: true });
// The workbench also generates 32 hex digits when opened on a LAN HTTP origin.
const verificationId = z.union([z.uuidv4(), z.string().regex(/^[a-f0-9]{32}$/u)]);
const verification = z.strictObject({ id: verificationId, state: z.enum(["pending", "unconfirmed"]) });
const githubDelivery = githubKey.extend({
  schema: z.literal(1),
  deliveryId,
  repository: z.string(),
  repositoryId: z.int().positive(),
  issueNumber: z.int().positive(),
  actorId,
  messageId: z.string(),
  body: z.string(),
  comment: githubEvidence.optional(),
  verification: verification.optional(),
});
type GitHubKey = z.infer<typeof githubKey>;
type GitHubScope = { sourceId: string; repositoryId: number; repository: string; issueId: number; issueNumber: number };
type GitHubProof = z.infer<typeof githubCommentProof>;
type GitHubDelivery = z.infer<typeof githubDelivery>;

const status = githubDelivery.extend({ state: z.enum(["unknown", "accepted"]) });
const mailInput = resultKey.extend({ draftId: z.uuid(), expectedRevision: z.uuid() });
const mailReceipt = z.object({ operationId: z.string(), messageId: z.string() });
const mailLink = mailInput.extend({ schema: z.literal(1), resultMessageId: z.string(), outbox: mailReceipt.optional() });

const desktop = { plugin: "tasks", exposable: false, defaultExposed: false, desktopOnly: true, scope: "write", risk: "high" } as const;
const connector = { plugin: "tasks", exposable: true, defaultExposed: false, individualExposure: true, scope: "write", risk: "high", idempotency: "handler" } as const;
export const resultDeliveryDescriptors = {
  githubAllowDelivery: defineCapabilityDescriptor({
    ...desktop,
    name: "tasks.github.deliveries.allow",
    input: githubGrant,
    output: githubGrant,
    title: "允许 GitHub 结果投递",
    description: "允许由指定 GitHub 作者向已关联 Issue 投递已保存的任务结果。",
  }),
  githubClaimDelivery: defineCapabilityDescriptor({
    ...connector,
    name: "tasks.github.deliveries.claim",
    input: githubKey.extend({ actorId }),
    output: status.extend({ send: z.boolean() }),
    title: "受理 GitHub 结果投递",
    description: "在发送前保存结果、原 Issue 和渠道关联；原投递只可核实一次发送结果。",
  }),
  githubConfirmDelivery: defineCapabilityDescriptor({
    ...connector,
    name: "tasks.github.deliveries.confirm",
    input: issueKey.extend({ deliveryId, proof: githubCommentProof.nullable(), verificationId: verificationId.optional() }),
    output: status,
    title: "核实 GitHub 投递",
    description: "通过原 Issue 下已验证的评论确认投递。",
  }),
  githubReadDelivery: defineCapabilityDescriptor({
    ...desktop,
    exposable: true,
    desktopOnly: false,
    individualExposure: true,
    scope: "read",
    name: "tasks.github.deliveries.read",
    input: githubKey,
    output: status,
    title: "查看 GitHub 投递",
    description: "查看原结果的投递标记、渠道和已确认评论。",
  }),
  githubRequestVerification: defineCapabilityDescriptor({
    ...desktop,
    desktopOnly: false,
    name: "tasks.github.deliveries.verify",
    idempotency: "handler",
    input: githubKey.extend({ verificationId }),
    output: status,
    title: "核实原 GitHub 投递",
    description: "请已绑定的 GitHub 连接器核查原评论。",
  }),
  githubPendingVerification: defineCapabilityDescriptor({
    ...connector,
    scope: "read",
    name: "tasks.github.deliveries.pendingVerification",
    input: z.strictObject({ sourceId: issueKey.shape.sourceId }),
    output: z.array(status),
    title: "读取待核实的 GitHub 投递",
    description: "仅向绑定来源的连接器返回明确要求核实的原投递。",
  }),
  submitMailDelivery: defineCapabilityDescriptor({
    ...desktop,
    name: "tasks.mail.deliveries.submit",
    idempotency: "handler",
    input: mailInput,
    output: mailReceipt.extend({ resultMessageId: z.string() }),
    title: "通过邮件投递任务结果",
    description: "将已保存的结果关联到明确选择的草稿版本，交给 Mail Outbox。",
  }),
  readMailDelivery: defineCapabilityDescriptor({
    ...desktop, desktopOnly: false, scope: "read", name: "tasks.mail.deliveries.read", input: resultKey,
    output: mailReceipt.nullable(), title: "查看任务邮件投递",
    description: "读取原任务结果已关联的 Mail Outbox 操作。",
  }),
};

function marker(id: string) {
  return `<!-- huhu-delivery:${id} -->`;
}

function view(record: GitHubDelivery) {
  return { ...record, state: record.comment ? ("accepted" as const) : ("unknown" as const) };
}

function sameIssue(record: GitHubDelivery, scope: GitHubScope) {
  return record.sourceId === scope.sourceId && record.repositoryId === scope.repositoryId && record.issueId === scope.issueId &&
    record.issueNumber === scope.issueNumber && record.repository === scope.repository;
}

export class GitHubDeliveries {
  constructor(
    private readonly files: VaultFiles,
    private readonly result: (taskId: string, receiptId: string) => CommittedResult,
  ) {}

  private file(sourceId: string, id: string) {
    return `tasks/github/${sourceId}/deliveries/${id}.json`;
  }

  private grantFile({ sourceId, issueId }: GitHubScope) {
    return `tasks/github/${sourceId}/delivery-grants/${issueId}.json`;
  }

  private key({ sourceId, issueId, taskId, receiptId }: GitHubKey) {
    return fingerprint([sourceId, issueId, taskId, receiptId]);
  }

  private load(sourceId: string, id: string) {
    const file = this.file(sourceId, id);
    const row = this.files.read(file);
    return row && { file, version: row.version, record: githubDelivery.parse(JSON.parse(row.bytes.toString("utf8"))) };
  }

  private grant(scope: GitHubScope) {
    const row = this.files.read(this.grantFile(scope));
    return row && githubGrant.parse(JSON.parse(row.bytes.toString("utf8")));
  }

  async allow(scope: GitHubScope, actorId: number, beforeCommit?: () => void) {
    const prior = this.grant(scope);
    if (prior?.actorId === actorId) return prior;
    if (prior) throw errors.idempotencyMismatch();
    const grant = { sourceId: scope.sourceId, issueId: scope.issueId, actorId };
    await this.files.write(this.grantFile(scope), Buffer.from(JSON.stringify(grant)), { expectedVersion: null, ...(beforeCommit && { beforeCommit }) });
    return grant;
  }

  async claim(key: GitHubKey, scope: GitHubScope, actualActor: number, beforeCommit: () => void) {
    if (this.grant(scope)?.actorId !== actualActor) throw errors.permissionDenied("GitHub 结果投递未授权给此作者和 Issue");
    const id = this.key(key);
    const prior = this.load(key.sourceId, id);
    if (prior) return { ...view(prior.record), send: false };
    const result = this.result(key.taskId, key.receiptId);
    const body = `${result.body}\n\n${marker(id)}`;
    if (Array.from(body).length > 65_536) throw errors.invalidInput("任务结果超出 GitHub 评论长度限制");
    const record = githubDelivery.parse({ ...key, ...scope, deliveryId: id, schema: 1, body, actorId: actualActor, messageId: result.messageId });
    await this.files.write(this.file(key.sourceId, id), Buffer.from(JSON.stringify(record)), { expectedVersion: null, beforeCommit });
    return { ...view(record), send: true };
  }

  read(key: GitHubKey) {
    const row = this.load(key.sourceId, this.key(key));
    if (!row) throw errors.notFound("GitHub 投递记录不存在");
    return view(row.record);
  }

  private matches(record: GitHubDelivery, scope: GitHubScope, proof: GitHubProof) {
    const url = `https://github.com/${scope.repository}/issues/${scope.issueNumber}#issuecomment-${proof.id}`;
    return (
      sameIssue(record, scope) &&
      record.actorId === proof.actorId &&
      (!record.comment || record.comment.id === proof.id) &&
      record.body === proof.body &&
      proof.url.toLowerCase() === url
    );
  }

  async confirm(scope: GitHubScope, id: string, proof: GitHubProof, beforeCommit: () => void) {
    const row = this.load(scope.sourceId, id);
    if (!row || !this.matches(row.record, scope, proof)) throw errors.invalidInput("GitHub 评论与原投递证据不匹配");
    if (row.record.comment) return view(row.record);
    const { body: _body, ...comment } = proof;
    const { verification: _verification, ...original } = row.record;
    const record = { ...original, comment };
    await this.files.write(row.file, Buffer.from(JSON.stringify(record)), { expectedVersion: row.version, beforeCommit });
    return view(record);
  }

  async requestVerification(key: GitHubKey, scope: GitHubScope, id: string, beforeCommit: () => void) {
    const row = this.load(key.sourceId, this.key(key));
    if (!row || !sameIssue(row.record, scope)) throw errors.notFound("GitHub 投递记录不存在");
    const { record } = row;
    if (record.comment || record.verification?.state === "pending" || record.verification?.id === id) return view(record);
    const next = { ...record, verification: { id, state: "pending" as const } };
    await this.files.write(row.file, Buffer.from(JSON.stringify(next)), { expectedVersion: row.version, beforeCommit });
    return view(next);
  }

  pendingVerification(sourceId: string) {
    let names: string[];
    try {
      names = readdirSync(this.files.abs(`tasks/github/${sourceId}/deliveries`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const pending: ReturnType<typeof view>[] = [];
    for (const name of names) {
      const id = name.slice(0, -5);
      if (!name.endsWith(".json") || !deliveryId.safeParse(id).success) continue;
      const record = this.load(sourceId, id)?.record;
      if (record?.sourceId === sourceId && record.deliveryId === id && !record.comment && record.verification?.state === "pending") pending.push(view(record));
      if (pending.length === 20) break;
    }
    return pending;
  }

  async finishUnconfirmed(scope: GitHubScope, id: string, requestId: string, beforeCommit: () => void) {
    const row = this.load(scope.sourceId, id);
    if (!row || !sameIssue(row.record, scope)) throw errors.notFound("GitHub 投递记录不存在");
    const { record } = row;
    if (record.comment || record.verification?.id !== requestId || record.verification.state !== "pending") return view(record);
    const next = { ...record, verification: { id: requestId, state: "unconfirmed" as const } };
    await this.files.write(row.file, Buffer.from(JSON.stringify(next)), { expectedVersion: row.version, beforeCommit });
    return view(next);
  }

  async echo(scope: GitHubScope, proof: GitHubProof, beforeCommit: () => void) {
    const id = /\n\n<!-- huhu-delivery:([a-f0-9]{64}) -->$/u.exec(proof.body)?.[1];
    if (!id) return undefined;
    const row = this.load(scope.sourceId, id);
    if (!row || !this.matches(row.record, scope, proof)) return undefined;
    await this.confirm(scope, id, proof, beforeCommit);
    return id;
  }
}

type MailOutbox = {
  submit(input: { draftId: string; expectedRevision: string }, signal: AbortSignal): Promise<z.infer<typeof mailReceipt>>;
};

export class TaskMailDeliveries {
  private readonly writes = new WriteQueue();

  constructor(
    private readonly files: VaultFiles,
    private readonly result: (taskId: string, receiptId: string) => CommittedResult,
    private readonly outbox: () => MailOutbox | undefined,
  ) {}

  drain() {
    return this.writes.drain();
  }

  private file(taskId: string, receiptId: string) {
    return `tasks/mail-deliveries/${fingerprint([taskId, receiptId])}.json`;
  }

  read({ taskId, receiptId }: z.output<typeof resultKey>) {
    const saved = this.files.read(this.file(taskId, receiptId));
    return saved ? mailLink.parse(JSON.parse(saved.bytes.toString("utf8"))).outbox ?? null : null;
  }

  submit(c: CapabilityContext, input: z.infer<typeof mailInput>) {
    const path = this.file(input.taskId, input.receiptId);
    return this.writes.run(path, async () => {
      c.signal.throwIfAborted();
      c.assertCapabilityCurrent?.();
      const saved = this.files.read(path);
      const record = saved ? mailLink.parse(JSON.parse(saved.bytes.toString("utf8"))) : { ...input, schema: 1 as const, resultMessageId: this.result(input.taskId, input.receiptId).messageId };
      if (record.draftId !== input.draftId || record.expectedRevision !== input.expectedRevision) throw errors.idempotencyMismatch();
      if ("outbox" in record && record.outbox) return { ...record.outbox, resultMessageId: record.resultMessageId };
      const outbox = this.outbox();
      if (!outbox) throw errors.pluginDisabled("mail");
      const expectedVersion =
        saved?.version ??
        (
          await this.files.write(path, Buffer.from(JSON.stringify(record)), {
            expectedVersion: null,
            ...(c.assertCapabilityCurrent && { beforeCommit: c.assertCapabilityCurrent }),
          })
        ).version;
      const receipt = await outbox.submit({ draftId: input.draftId, expectedRevision: input.expectedRevision }, c.signal);
      await this.files.write(path, Buffer.from(JSON.stringify({ ...record, outbox: receipt })), { expectedVersion });
      return { ...receipt, resultMessageId: record.resultMessageId };
    });
  }
}
