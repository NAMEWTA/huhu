import { randomUUID } from "node:crypto";
import { errors, isHuhuError, isWorkbenchCaller, newId, TaskWritableSchema, type TaskDto } from "@huhu/contracts";
import { defineCapabilityDescriptor, type CapabilityContext } from "@huhu/kernel";
import type { VaultFiles } from "@huhu/vault";
import { z } from "zod";
import type { TaskDispatch } from "./dispatch.js";
import { fingerprint } from "./dispatch-store.js";
import { TaskReplyInput, TaskReplyLookup } from "./native-replies.js";
import { GitHubDeliveries, resultDeliveryDescriptors } from "./result-delivery.js";
import type { TasksService } from "./service.js";
import { WriteQueue } from "./write-queue.js";

const sourceId = z.uuidv4();
const eventId = z.string().regex(/^\d{1,40}$/u);
const githubId = z.int().positive();
const repoName = z
  .string()
  .max(220)
  .regex(/^[\w-]+\/(?!\.{1,2}$)[\w.-]+$/u)
  .toLowerCase();
const actor = z.object({
  id: githubId,
  login: z
    .string()
    .regex(/^[\w-]+(?:\[bot\])?$/u)
    .max(100),
});
const lookup = z.strictObject({ sourceId, eventId });

const sourceInput = z.strictObject({
  connectorId: z.string().regex(/^tok-[a-z0-9]{5,}$/u),
  repositoryId: githubId,
  repository: repoName,
  replyActorIds: z.array(githubId).max(100).default([]),
});
const source = sourceInput.extend({ schema: z.literal(1), sourceId, retired: z.boolean() });
type Source = z.infer<typeof source>;

const issue = z.object({
  id: githubId,
  number: githubId,
  title: z.string().trim().min(1).max(200),
  body: z.string().nullable(),
  html_url: z.url(),
  updated_at: z.iso.datetime(),
  pull_request: z.unknown().optional(),
});
const comment = z.object({ id: githubId, html_url: z.url(), user: actor, body: z.string() });
const base = z.object({
  id: eventId,
  repo: z.object({ id: githubId, name: repoName }),
  created_at: z.iso.datetime(),
  actor,
});
const event = z.discriminatedUnion("type", [
  base.extend({ type: z.literal("IssuesEvent"), payload: z.object({ action: z.string().min(1), issue }) }),
  base.extend({
    type: z.literal("IssueCommentEvent"),
    payload: z.object({ action: z.literal("created"), issue, comment }),
  }),
]);
type Event = z.infer<typeof event>;

const acceptInput = z.strictObject({ sourceId, raw: z.json() });
const receipt = z.object({
  ...lookup.shape,
  fingerprint: z.string(),
  taskId: z.string().nullable(),
  state: z.enum(["pending", "created", "updated", "discussion", "stale", "reply-accepted", "reply-denied", "reply-rejected", "echo"]),
  reply: TaskReplyLookup.optional(),
  deliveryId: z.string().optional(),
});
const admission = receipt.extend({
  schema: z.literal(1),
  connectorId: z.string(),
  repositoryId: githubId,
  issueId: githubId,
  issueNumber: githubId,
  actor,
  receivedAt: z.iso.datetime(),
  url: z.url(),
  raw: z.json(),
});
type Admission = z.infer<typeof admission>;
const objectMapping = z.strictObject({
  schema: z.literal(1),
  taskId: z.string(),
  issueNumber: githubId,
  createdBy: eventId,
  provisioned: z.boolean(),
  lastIssueAt: z.number(),
  lastUpdateEvent: eventId.optional(),
});
const replyGrant = TaskReplyLookup.omit({ replyId: true }).extend({ sourceId, issueId: githubId });
type ReplyGrant = z.infer<typeof replyGrant>;

const desktop = { plugin: "tasks", exposable: false, defaultExposed: false, desktopOnly: true, scope: "write", risk: "high" } as const;
const external = { plugin: "tasks", exposable: true, defaultExposed: false, individualExposure: true, risk: "high" } as const;

export const githubSourceDescriptors = {
  githubCreate: defineCapabilityDescriptor({
    ...desktop,
    name: "tasks.github.source.create",
    input: sourceInput,
    output: source,
    title: "绑定 GitHub 来源",
    description: "将一个 HTTP 凭据绑定到指定 GitHub 仓库。",
  }),
  githubRetire: defineCapabilityDescriptor({
    ...desktop,
    name: "tasks.github.source.retire",
    input: z.strictObject({ sourceId }),
    output: source,
    title: "停用 GitHub 来源",
    description: "停止该来源受理，保留原事件与工作单关联。",
  }),
  githubAllowReply: defineCapabilityDescriptor({
    ...desktop,
    name: "tasks.github.question.allow",
    input: replyGrant,
    output: replyGrant,
    title: "允许从 GitHub 回答任务问题",
    description: "允许指定仓库问题上的已授权作者回答当前请求版本。",
  }),
  githubAccept: defineCapabilityDescriptor({
    ...external,
    name: "tasks.github.events.accept",
    scope: "write",
    idempotency: "handler",
    input: acceptInput,
    output: receipt,
    title: "受理 GitHub 仓库事件",
    description: "按绑定来源与 GitHub 事件标识受理 Issue 及其评论。",
  }),
  githubRead: defineCapabilityDescriptor({
    ...external,
    name: "tasks.github.events.read",
    scope: "read",
    input: lookup,
    output: admission,
    title: "核对 GitHub 事件",
    description: "查询原始 GitHub 事件、作者与任务受理结果。",
  }),
};

function parseEvent(raw: z.infer<typeof acceptInput>["raw"]): Event {
  const parsed = event.safeParse(raw);
  if (!parsed.success || parsed.data.payload.issue.pull_request !== undefined) {
    throw errors.invalidInput("只支持 GitHub Issue 和新增 Issue 评论");
  }
  return parsed.data;
}

function parseReply(taskId: string, body: string, replyId: string) {
  const firstLine = body.match(/^\/huhu answer (\S+) (\S+) (\S+) (\d+)\r?\n([\s\S]+)$/u);
  if (!firstLine) return undefined;
  const [, runId, sessionId, requestId, version, answer] = firstLine;
  const parsed = TaskReplyInput.safeParse({ taskId, runId, sessionId, requestId, requestVersion: Number(version), replyId, answer });
  if (!parsed.success) return undefined;
  return parsed.data;
}

export class GitHubSources {
  private readonly writes = new WriteQueue();

  constructor(
    private readonly files: VaultFiles,
    private readonly tasks: TasksService,
    private readonly dispatch: Pick<TaskDispatch, "questions" | "reply" | "check">,
    private readonly now: () => Date,
    private readonly deliveries: GitHubDeliveries,
  ) {}

  drain() {
    return this.writes.drain();
  }

  private prefix(id: string) {
    return `tasks/github/${id}`;
  }

  private read<T>(file: string, schema: z.ZodType<T>) {
    const row = this.files.read(file);
    return row && { version: row.version, value: schema.parse(JSON.parse(row.bytes.toString("utf8"))) };
  }

  private async write(file: string, value: unknown, expectedVersion: string | null, beforeCommit?: () => void) {
    return (await this.files.write(file, Buffer.from(JSON.stringify(value)), { expectedVersion, ...(beforeCommit && { beforeCommit }) })).version;
  }

  private configPath(id: string) {
    return `${this.prefix(id)}/source.json`;
  }

  private eventPath(id: string, event: string) {
    return `${this.prefix(id)}/events/${event}.json`;
  }

  private objectPath(id: string, issue: number) {
    return `${this.prefix(id)}/issues/${issue}.json`;
  }

  private grantPath(grant: ReplyGrant) {
    return `${this.prefix(grant.sourceId)}/questions/${fingerprint(grant)}.json`;
  }

  private active(id: string) {
    const row = this.read(this.configPath(id), source)?.value;
    if (!row || row.sourceId !== id || row.retired) throw errors.notFound("GitHub 来源不可用");
    return row;
  }

  private connector(c: CapabilityContext, id: string) {
    c.signal.throwIfAborted();
    c.assertCapabilityCurrent?.();
    const config = this.active(id);
    if (c.caller !== "http" || c.subject !== config.connectorId) throw errors.permissionDenied("该 HTTP 凭据未绑定到此 GitHub 来源");
    return config;
  }

  private deliveryScope(config: Source, issueId: number, taskId?: string) {
    const mapped = this.read(this.objectPath(config.sourceId, issueId), objectMapping)?.value;
    if (!mapped?.provisioned || (taskId !== undefined && mapped.taskId !== taskId)) throw errors.notFound("GitHub Issue 未关联此任务");
    return { sourceId: config.sourceId, repository: config.repository, repositoryId: config.repositoryId, issueId, issueNumber: mapped.issueNumber };
  }

  allowDelivery(c: CapabilityContext, { sourceId, issueId, actorId }: z.output<typeof resultDeliveryDescriptors.githubAllowDelivery.input>) {
    if (c.caller !== "desktop") throw errors.permissionDenied("需要从本机批准 GitHub 投递");
    return this.writes.run(sourceId, () => this.deliveries.allow(this.deliveryScope(this.active(sourceId), issueId), actorId, c.assertCapabilityCurrent));
  }

  claimDelivery(c: CapabilityContext, { actorId, ...key }: z.output<typeof resultDeliveryDescriptors.githubClaimDelivery.input>) {
    return this.writes.run(key.sourceId, () => {
      const scope = this.deliveryScope(this.connector(c, key.sourceId), key.issueId, key.taskId);
      return this.deliveries.claim(key, scope, actorId, () => {
        this.connector(c, key.sourceId);
      });
    });
  }

  confirmDelivery(c: CapabilityContext, input: z.output<typeof resultDeliveryDescriptors.githubConfirmDelivery.input>) {
    const { sourceId, issueId, deliveryId, proof, verificationId } = input;
    return this.writes.run(sourceId, () => {
      const scope = this.deliveryScope(this.connector(c, sourceId), issueId);
      const authorize = () => { this.connector(c, sourceId); };
      if (proof) return this.deliveries.confirm(scope, deliveryId, proof, authorize);
      if (!verificationId) throw errors.invalidInput("需要原投递核实请求标识");
      return this.deliveries.finishUnconfirmed(scope, deliveryId, verificationId, authorize);
    });
  }

  requestVerification(c: CapabilityContext, { verificationId, ...key }: z.output<typeof resultDeliveryDescriptors.githubRequestVerification.input>) {
    if (!isWorkbenchCaller(c.caller)) throw errors.permissionDenied("需要从工作台核实原投递");
    return this.writes.run(key.sourceId, () => {
      c.signal.throwIfAborted();
      const scope = this.deliveryScope(this.active(key.sourceId), key.issueId, key.taskId);
      return this.deliveries.requestVerification(key, scope, verificationId, () => {
        c.signal.throwIfAborted();
        c.assertCapabilityCurrent?.();
      });
    });
  }

  pendingVerification(c: CapabilityContext, sourceId: string) {
    this.connector(c, sourceId);
    return this.deliveries.pendingVerification(sourceId);
  }

  readDelivery(c: CapabilityContext, key: z.output<typeof resultDeliveryDescriptors.githubReadDelivery.input>) {
    if (!isWorkbenchCaller(c.caller)) this.connector(c, key.sourceId);
    return this.deliveries.read(key);
  }

  async create(c: CapabilityContext, input: z.infer<typeof sourceInput>) {
    const config = source.parse({ ...input, schema: 1, sourceId: randomUUID(), retired: false });
    await this.write(this.configPath(config.sourceId), config, null, c.assertCapabilityCurrent);
    return config;
  }

  retire(c: CapabilityContext, id: string) {
    return this.writes.run(id, async () => {
      const path = this.configPath(id);
      const row = this.read(path, source);
      if (!row) throw errors.notFound("GitHub 来源不可用");
      const config = { ...row.value, retired: true };
      if (!row.value.retired) await this.write(path, config, row.version, c.assertCapabilityCurrent);
      return config;
    });
  }

  allowReply(c: CapabilityContext, grant: ReplyGrant) {
    return this.writes.run(grant.sourceId, async () => {
      this.active(grant.sourceId);
      const mapped = this.read(this.objectPath(grant.sourceId, grant.issueId), objectMapping)?.value;
      if (!mapped?.provisioned || mapped.taskId !== grant.taskId) throw errors.notFound("GitHub Issue 未关联此任务");
      const question = this.dispatch
        .questions(grant.taskId)
        .find((item) => item.runId === grant.runId && item.sessionId === grant.sessionId && item.requestId === grant.requestId && item.requestVersion === grant.requestVersion && item.status === "awaiting" && !("reply" in item));
      if (!question) throw errors.notFound("任务问题已变化");
      const path = this.grantPath(grant);
      if (!this.read(path, replyGrant)) await this.write(path, grant, null, c.assertCapabilityCurrent);
      return grant;
    });
  }

  readEvent(c: CapabilityContext, { sourceId, eventId }: z.infer<typeof lookup>) {
    this.connector(c, sourceId);
    const row = this.read(this.eventPath(sourceId, eventId), admission)?.value;
    if (!row) throw errors.notFound("没有该 GitHub 事件的受理记录");
    return row;
  }

  accept(c: CapabilityContext, { sourceId, raw }: z.infer<typeof acceptInput>) {
    return this.writes.run(sourceId, async () => {
      const config = this.connector(c, sourceId);
      const parsed = parseEvent(raw);
      const { payload } = parsed;
      const { id: issueId, number: issueNumber } = payload.issue;
      const eventPath = this.eventPath(sourceId, parsed.id);
      const prior = this.read(eventPath, admission);
      const digest = fingerprint(raw);
      if (prior && prior.value.fingerprint !== digest) throw errors.idempotencyMismatch();
      if (parsed.repo.id !== config.repositoryId || parsed.repo.name !== config.repository) throw errors.permissionDenied("GitHub 事件仓库与来源绑定不符");
      if (prior && prior.value.state !== "pending") return receipt.parse(prior.value);
      const issueUrl = `https://github.com/${config.repository}/issues/${issueNumber}`;
      const author = parsed.type === "IssueCommentEvent" ? parsed.payload.comment.user : parsed.actor;
      const url = parsed.type === "IssueCommentEvent" ? parsed.payload.comment.html_url : payload.issue.html_url;
      const expected = parsed.type === "IssueCommentEvent" ? `${issueUrl}#issuecomment-${parsed.payload.comment.id}` : issueUrl;
      if (payload.issue.html_url.toLowerCase() !== issueUrl || url.toLowerCase() !== expected || (parsed.type === "IssueCommentEvent" && author.id !== parsed.actor.id)) {
        throw errors.invalidInput("GitHub 事件中的对象地址或评论作者不一致");
      }

      const authorize = () => {
        this.connector(c, sourceId);
      };
      const record =
        prior?.value ??
        admission.parse({
          schema: 1,
          sourceId,
          eventId: parsed.id,
          fingerprint: digest,
          state: "pending",
          taskId: null,
          connectorId: config.connectorId,
          repositoryId: config.repositoryId,
          issueId,
          issueNumber,
          actor: author,
          url,
          raw,
          receivedAt: this.now().toISOString(),
        });
      const version = prior?.version ?? (await this.write(eventPath, record, null, authorize));
      const result = await this.applyEvent(c, config, parsed, record, authorize);
      // Once a Task mutation has committed, record its evidence even if the HTTP response has gone away.
      await this.write(eventPath, result, version);
      return receipt.parse(result);
    });
  }

  private async applyEvent(c: CapabilityContext, config: Source, parsed: Event, record: Admission, authorize: () => void): Promise<Admission> {
    const path = this.objectPath(config.sourceId, record.issueId);
    const prior = this.read(path, objectMapping);
    const mapping = prior?.value ?? {
      schema: 1 as const,
      taskId: newId("task"),
      issueNumber: record.issueNumber,
      createdBy: record.eventId,
      provisioned: false,
      lastIssueAt: -1,
    };
    if (mapping.issueNumber !== record.issueNumber) throw errors.idempotencyMismatch();
    let version = prior?.version ?? (await this.write(path, mapping, null, authorize));
    if (!mapping.provisioned) {
      const original = mapping.createdBy === record.eventId ? record : this.readEvent(c, { sourceId: config.sourceId, eventId: mapping.createdBy });
      const originalIssue = parseEvent(original.raw).payload.issue;
      const github = { sourceId: config.sourceId, repositoryId: config.repositoryId, issueId: record.issueId, eventId: original.eventId };
      await this.tasks.withTaskWrite(mapping.taskId, async () => {
        authorize();
        let existing: TaskDto | undefined;
        try {
          existing = this.tasks.read(mapping.taskId);
        } catch (error) {
          if (!isHuhuError(error) || error.code !== "NOT_FOUND") throw error;
        }
        if (existing) {
          if (existing.origin.kind !== "external" || !existing.origin.github || fingerprint(existing.origin.github) !== fingerprint(github)) throw errors.idempotencyMismatch();
        } else {
          const input = TaskWritableSchema.safeParse({ title: originalIssue.title, body: originalIssue.body ?? "" });
          if (!input.success) throw errors.invalidInput("GitHub Issue 内容不能作为任务正文保存");
          await this.tasks.create(input.data, { kind: "external", caller: "http", github }, mapping.taskId, authorize);
        }
      });
      mapping.provisioned = true;
      mapping.lastIssueAt = Date.parse(originalIssue.updated_at);
      version = await this.write(path, mapping, version);
    }
    const result = { ...record, taskId: mapping.taskId };
    const commentId = `github-${fingerprint([config.sourceId, record.eventId])}`;
    const at = parsed.created_at.replace(/\.\d+Z$/u, "Z");
    if (parsed.type === "IssuesEvent") {
      if (mapping.createdBy === record.eventId) return { ...result, state: "created" };
      if (mapping.lastUpdateEvent === record.eventId) return { ...result, state: "updated" };
      const revision = Date.parse(parsed.payload.issue.updated_at);
      if (revision <= mapping.lastIssueAt) return { ...result, state: "stale" };
      const { title, body } = parsed.payload.issue;
      await this.tasks.addComment(
        mapping.taskId,
        {
          id: commentId,
          at,
          source: "external",
          author: `GitHub @${record.actor.login}`,
          event: "github-issue-updated",
          body: [record.url, title, body].filter(Boolean).join("\n\n"),
        },
        authorize,
      );
      await this.write(path, { ...mapping, lastIssueAt: revision, lastUpdateEvent: record.eventId }, version);
      return { ...result, state: "updated" };
    }

    const body = parsed.payload.comment.body;
    const deliveryId = await this.deliveries.echo(this.deliveryScope(config, record.issueId, mapping.taskId), { id: parsed.payload.comment.id, actorId: record.actor.id, url: record.url, body }, authorize);
    if (deliveryId) return { ...result, state: "echo", deliveryId };
    const reply = parseReply(mapping.taskId, body, commentId);
    if (reply) {
      const { answer: _answer, messageIds: _messageIds, ...ref } = reply;
      const { replyId: _replyId, ...question } = ref;
      const grant = replyGrant.parse({ ...question, sourceId: config.sourceId, issueId: record.issueId });
      if (!config.replyActorIds.includes(record.actor.id) || !this.read(this.grantPath(grant), replyGrant)) return { ...result, state: "reply-denied", reply: ref };
      try {
        await this.dispatch.reply(
          reply,
          {
            caller: "http",
            subject: config.connectorId,
            github: { sourceId: config.sourceId, repositoryId: config.repositoryId, issueId: record.issueId, eventId: record.eventId, actorId: record.actor.id, login: record.actor.login },
          },
          c.signal,
          authorize,
        );
      } catch (error) {
        if (isHuhuError(error) && ["VERSION_CONFLICT", "NOT_FOUND", "INVALID_INPUT"].includes(error.code)) {
          return { ...result, state: "reply-rejected", reply: ref };
        }
        throw error;
      }
      void this.dispatch.check();
      return { ...result, state: "reply-accepted", reply: ref };
    }
    await this.tasks.addComment(
      mapping.taskId,
      {
        id: commentId,
        at,
        source: "external",
        author: `GitHub @${record.actor.login}`,
        event: "github-comment",
        body: [record.url, body].join("\n\n"),
      },
      authorize,
    );
    return { ...result, state: "discussion" };
  }
}
