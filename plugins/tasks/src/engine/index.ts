import {
  ErrorCodeSchema,
  errors,
  ExecutionReceiptAckSchema,
  ExecutionReceiptSchema,
  HuhuError,
  isWorkbenchCaller,
  TaskAttentionSchema,
  TaskCategorySchema,
  TaskCommentSchema,
  TaskDtoSchema,
  TaskExecutionProfileSchema,
  TaskExecutionSchema,
  TaskPatchSchema,
  TaskStatusSchema,
  TaskTypeSchema,
  TaskWritableSchema,
  type TaskAttention,
  type TaskDto,
  type TaskExecution,
  type TaskOrigin,
} from "@huhu/contracts";
import type { Context } from "@huhu/cordis";
import { bindCapability, defineCapability, defineCapabilityDescriptor, ExposureStore, toolSelection, type CapabilityContext, type HuhuApi } from "@huhu/kernel";
import { machineId, resolveReadableAsset, VaultFiles, versionOf, type DeviceDispatchBudget } from "@huhu/vault";
import { newId } from "@huhu/contracts";
import { AgentDispatchTargetInfoSchema } from "@huhu/plugin-agent-cli/engine";
import { agentById } from "@huhu/plugin-agent-cli/shared";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createAgentDispatchExecutor } from "./agent-dispatch-executor.js";
import { TaskDispatch, type TaskDispatchExecutor, type TaskScheduleAdmission } from "./dispatch.js";
import { DispatchInput, DispatchLookup, DispatchReceipt, DispatchStore, fingerprint, RecentTaskRun, RetryDispatch, StopLookup, StopReceipt, TaskDispatchView, TaskRunSummary } from "./dispatch-store.js";
import { GitHubSources, githubSourceDescriptors } from "./github-sources.js";
import { TaskNativeReplies, TaskReplyInput, TaskReplyLookup, TaskReplyView, TaskSupplementInput, TaskSupplementLookup, TaskSupplementView } from "./native-replies.js";
import { TaskQuestionView, TaskReceiptInbox } from "./receipt-inbox.js";
import { GitHubDeliveries, resultDeliveryDescriptors, TaskMailDeliveries } from "./result-delivery.js";
import { ResponseActor } from "./response-actor.js";
import { agentDispatchBlocker, TasksService } from "./service.js";

export { TasksService } from "./service.js";
export type { TaskDispatchExecutor } from "./dispatch.js";
export type TaskRuleDispatch = Pick<TaskDispatch, "acceptRule"> & Partial<Pick<TaskDispatch, "readAcceptedRule">> & Pick<TasksService, "createFromRule">;
export type { TaskScheduleAdmission } from "./dispatch.js";
export type TaskFollowUpDispatch = Pick<TaskDispatch, "acceptFollowUp">;

/** 其他插件通过 `api.service<TaskQuery>("taskQuery")` 使用。 */
export interface TaskQuery {
  listAll(): import("@huhu/contracts").TaskDto[];
  /** 可以派发的 agent 任务：type=agent 且未开始。 */
  listDispatchable(): import("@huhu/contracts").TaskDto[];
  snapshot(taskId: string): import("@huhu/contracts").TaskDto;
  agentDispatchBlocker: typeof agentDispatchBlocker;
  resumeEligibility(task: TaskDto, instructions: string, signal: AbortSignal): ReturnType<NonNullable<TaskDispatchExecutor["resumeEligibility"]>>;
}

const Id = z.object({ id: z.string() });
const ListInput = z.object({ category: TaskCategorySchema.default("all"), status: z.array(TaskStatusSchema).optional(), type: TaskTypeSchema.optional(), tags: z.array(z.string()).optional(), query: z.string().optional() });

const Versioned = Id.extend({ expectedVersion: z.string() });
const count = z.int().nonnegative();
const capacity = z.object({ limit: count.nullable(), occupied: count.nullable() });

export const taskToolDescriptors = {
  ...githubSourceDescriptors,
  ...resultDeliveryDescriptors,
  list: defineCapabilityDescriptor({
    name: "tasks.list",
    plugin: "tasks",
    title: "列出任务",
    description: "按状态、类型、分类、标签或文字查询任务。",
    risk: "normal",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: ListInput,
    output: z.array(TaskDtoSchema),
  }),
  read: defineCapabilityDescriptor({
    name: "tasks.read",
    plugin: "tasks",
    title: "读取任务",
    description: "读取指定任务的当前内容和版本。",
    risk: "normal",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: Id,
    output: TaskDtoSchema,
  }),
  create: defineCapabilityDescriptor({
    name: "tasks.create",
    plugin: "tasks",
    title: "新建任务",
    description: "在当前 Vault 创建任务，并可按原受理意图核实结果。",
    risk: "normal",
    scope: "write",
    exposable: true,
    defaultExposed: false,
    idempotency: "durable",
    input: TaskWritableSchema.extend({ inboxConversionId: z.string().min(1).optional() }),
    output: z.union([TaskDtoSchema, Id]),
  }),
  attention: defineCapabilityDescriptor({
    name: "tasks.attention",
    plugin: "tasks",
    title: "列出待处理任务摘要",
    description: "使用原任务、运行和问题身份汇总工作台需要处理的记录。",
    scope: "read",
    risk: "normal",
    exposable: false,
    defaultExposed: false,
    input: z.strictObject({}),
    output: z.array(TaskAttentionSchema),
  }),
  questionsList: defineCapabilityDescriptor({
    name: "tasks.questions.list",
    plugin: "tasks",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: z.strictObject({ taskId: z.string() }),
    output: z.array(TaskQuestionView.extend({ reply: TaskReplyView.optional() })),
    title: "查看任务请求",
    description: "查询指定任务的原生和普通问题。",
    risk: "normal",
  }),
  reply: defineCapabilityDescriptor({
    name: "tasks.reply",
    plugin: "tasks",
    scope: "write",
    exposable: true,
    defaultExposed: false,
    idempotency: "handler",
    input: TaskReplyInput,
    output: TaskReplyView,
    title: "回答任务请求",
    description: "向原任务的原会话提交回答。",
    risk: "high",
  }),
  replyRead: defineCapabilityDescriptor({
    name: "tasks.reply.read",
    plugin: "tasks",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: TaskReplyLookup,
    output: TaskReplyView,
    title: "查看任务回答",
    description: "按原任务、运行、请求与回答标识查询状态。",
    risk: "normal",
  }),
  supplement: defineCapabilityDescriptor({
    name: "tasks.supplement",
    plugin: "tasks",
    scope: "execute",
    exposable: true,
    defaultExposed: false,
    idempotency: "handler",
    input: TaskSupplementInput,
    output: TaskSupplementView,
    title: "发送任务补充",
    description: "向已绑定的原任务会话受理一条补充输入。",
    risk: "high",
  }),
  supplementRead: defineCapabilityDescriptor({
    name: "tasks.supplement.read",
    plugin: "tasks",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: TaskSupplementLookup,
    output: TaskSupplementView,
    title: "查看任务补充",
    description: "按原运行、会话及补充标识查询状态。",
    risk: "high",
  }),
  dispatch: defineCapabilityDescriptor({
    name: "tasks.dispatch",
    plugin: "tasks",
    scope: "execute",
    exposable: true,
    defaultExposed: false,
    idempotency: "handler",
    input: DispatchInput,
    output: DispatchReceipt,
    title: "派遣任务",
    description: "按任务输入版本受理一次 Agent 派遣。",
    risk: "high",
  }),
  dispatchRead: defineCapabilityDescriptor({
    name: "tasks.dispatch.read",
    plugin: "tasks",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: DispatchLookup,
    output: DispatchReceipt,
    title: "查看派遣回执",
    description: "按任务与派遣标识读取派遣状态。",
    risk: "normal",
  }),
  dispatchTargets: defineCapabilityDescriptor({
    name: "tasks.dispatch.targets",
    plugin: "tasks",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: z.strictObject({ spaceId: z.string().min(1), profile: TaskExecutionProfileSchema.optional() }),
    output: z.array(AgentDispatchTargetInfoSchema.pick({ mode: true, provider: true, sessionId: true, nativeSessionId: true, history: true, historyTitle: true, available: true, reason: true, profile: true, capabilities: true })),
    title: "查看派遣目标",
    description: "查看指定 Space 可选的 Agent 与会话目标。",
    risk: "normal",
  }),
  dispatchResources: defineCapabilityDescriptor({
    name: "tasks.dispatch.resources", plugin: "tasks", scope: "read", exposable: false, defaultExposed: false, risk: "normal",
    title: "查看派遣资源",
    description: "读取本 Vault 的派遣积压和本机已配置的执行、保留进程名额。",
    input: z.strictObject({}),
    output: z.object({
      vault: z.object({
        pending: count, active: count, waitingNative: count, unknown: count, retained: count.nullable(),
        oldestPendingAt: z.iso.datetime().nullable(), oldestNativeWaitAt: z.iso.datetime().nullable(), oldestUnknownAt: z.iso.datetime().nullable(),
      }),
      device: z.object({ active: capacity, retained: capacity }),
    }),
  }),
  dispatchList: defineCapabilityDescriptor({
    name: "tasks.dispatch.list",
    plugin: "tasks",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: z.strictObject({ taskId: z.string() }),
    output: z.array(TaskDispatchView),
    title: "列出任务派遣",
    description: "读取指定任务的派遣记录。",
    risk: "normal",
  }),
  dispatchRetry: defineCapabilityDescriptor({
    name: "tasks.dispatch.retry",
    plugin: "tasks",
    scope: "execute",
    exposable: false,
    defaultExposed: false,
    idempotency: "handler",
    input: RetryDispatch,
    output: DispatchReceipt,
    title: "重试原任务输入",
    description: "以原运行的已保存快照重做证实已结束的失败执行。",
    risk: "high",
  }),
  dispatchRecent: defineCapabilityDescriptor({
    name: "tasks.dispatch.recent",
    plugin: "tasks",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: z.strictObject({ limit: z.int().min(1).max(200).default(200) }),
    output: z.array(RecentTaskRun),
    title: "查看最近派遣",
    description: "读取当前 Vault 可见的最近任务运行。",
    risk: "normal",
  }),
  dispatchCancel: defineCapabilityDescriptor({
    name: "tasks.dispatch.cancel",
    plugin: "tasks",
    scope: "write",
    exposable: true,
    defaultExposed: false,
    idempotency: "handler",
    input: DispatchLookup,
    output: DispatchReceipt,
    title: "取消排队派遣",
    description: "取消指定任务尚可取消的派遣。",
    risk: "high",
  }),
  dispatchStop: defineCapabilityDescriptor({
    name: "tasks.dispatch.stop",
    plugin: "tasks",
    scope: "execute",
    exposable: true,
    defaultExposed: false,
    idempotency: "handler",
    input: StopLookup,
    output: StopReceipt,
    title: "停止任务运行",
    description: "向原运行所属的受控会话提交停止意图。",
    risk: "high",
  }),
  dispatchStopRead: defineCapabilityDescriptor({
    name: "tasks.dispatch.stop.read",
    plugin: "tasks",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: StopLookup,
    output: StopReceipt,
    title: "查看停止回执",
    description: "按原运行与停止标识读取停止状态。",
    risk: "normal",
  }),
  agentCreate: defineCapabilityDescriptor({
    name: "tasks.agent.create",
    plugin: "tasks",
    scope: "write",
    exposable: true,
    defaultExposed: false,
    input: TaskWritableSchema.extend({ type: z.literal("agent").default("agent"), execution: TaskExecutionSchema }),
    output: TaskDtoSchema,
    title: "新建 Agent 任务",
    description: "在当前 Vault 新建具备执行目标的 Agent 任务。",
    risk: "high",
  }),
  update: defineCapabilityDescriptor({
    name: "tasks.update",
    plugin: "tasks",
    scope: "write",
    exposable: true,
    defaultExposed: false,
    input: Versioned.extend({
      patch: TaskPatchSchema,
      baseInputHash: z.string().optional(),
      baseEditHash: z.string().optional(),
    }),
    output: TaskDtoSchema,
    title: "更新任务",
    description: "按任务版本更新任务字段。",
    risk: "high",
  }),
  duplicate: defineCapabilityDescriptor({
    name: "tasks.duplicate",
    plugin: "tasks",
    scope: "write",
    exposable: true,
    defaultExposed: false,
    input: Id,
    output: TaskDtoSchema,
    title: "复制任务",
    description: "从现有任务新建一份副本。",
    risk: "high",
  }),
  delete: defineCapabilityDescriptor({
    name: "tasks.delete",
    plugin: "tasks",
    scope: "write",
    exposable: true,
    defaultExposed: false,
    input: Id,
    output: z.object({ ok: z.literal(true) }),
    title: "删除任务",
    description: "将指定任务移入回收站。",
    risk: "high",
  }),
  setStatus: defineCapabilityDescriptor({
    name: "tasks.setStatus",
    plugin: "tasks",
    scope: "write",
    exposable: true,
    defaultExposed: false,
    input: Versioned.extend({ status: TaskStatusSchema }),
    output: TaskDtoSchema,
    title: "变更任务状态",
    description: "按版本流转指定任务的状态。",
    risk: "high",
  }),
  commentsAdd: defineCapabilityDescriptor({
    name: "tasks.comments.add",
    plugin: "tasks",
    scope: "write",
    exposable: true,
    defaultExposed: false,
    input: z.object({
      taskId: z.string(),
      /** 内置插件按事件派生，保证幂等；桌面与外部调用方不传，由网关生成。 */
      id: z.string().optional(),
      body: z.string().min(1).max(20_000),
      /** 只有内置插件调用时才采信 source（agent / system）；其他调用方一律由网关按 caller 决定。 */
      source: z.enum(["agent", "system"]).optional(),
      author: z.string().optional(),
      run: z.string().optional(),
      ask: z.string().optional(),
      session: z.string().optional(),
      event: z.string().optional(),
    }),
    output: z.object({ comment: TaskCommentSchema, added: z.boolean() }),
    title: "添加任务评论",
    description: "向指定任务添加评论。",
    risk: "high",
  }),
  runs: defineCapabilityDescriptor({
    name: "tasks.runs",
    plugin: "tasks",
    scope: "read",
    exposable: true,
    defaultExposed: false,
    input: Id,
    output: z.array(TaskRunSummary),
    title: "查看任务运行",
    description: "读取指定任务的运行摘要。",
    risk: "normal",
  }),
};

/** 创建来源：种类由网关根据受信的 caller 推导（请求体里自报的来源一律忽略）。明细 ID 由 T02 的 onBehalfOf 补上。 */
export function originOf(caller: string): TaskOrigin {
  if (isWorkbenchCaller(caller)) return { kind: "desktop" };
  if (caller.startsWith("plugin:")) {
    const id = caller.slice("plugin:".length);
    if (id === "inbox") return { kind: "inbox" };
    if (id === "automations") return { kind: "automation" };
    if (id === "agent-cli") return { kind: "session" };
    return { kind: "plugin", id };
  }
  return { kind: "external", caller };
}

const isExternalTool = (caller: string) => caller === "cli" || caller === "mcp" || caller === "http";
const isTaskToolCaller = (caller: string) => isWorkbenchCaller(caller) || isExternalTool(caller);

function toolOwner({ caller, subject }: CapabilityContext, desktopOnly = false): string | undefined {
  if (desktopOnly ? caller === "desktop" : isWorkbenchCaller(caller)) return undefined;
  if (!isExternalTool(caller) || !subject) throw errors.permissionDenied("需要已认证的任务工具调用者");
  return fingerprint([caller, subject]);
}

function responseActor(context: CapabilityContext): ResponseActor {
  return ResponseActor.parse({ caller: context.caller, subject: context.subject ?? context.caller, owner: toolOwner(context) });
}
function agentWriteResult(caller: string, task: TaskDto, includesAgentInput = task.type === "agent"): TaskDto {
  if (!isExternalTool(caller) || !includesAgentInput) return task;
  return { ...task, body: "", comments: [], references: [] };
}

export interface TasksOptions {
  zone?: () => string;
  now?: () => Date;
  dispatchCheckMs?: number;
  dispatchExecutor?: TaskDispatchExecutor | null;
  dispatchBudget?: DeviceDispatchBudget;
  onError?: (e: unknown) => void;
}

/** tasks 插件入口（architecture.md §5）：注册任务能力；资源随作用域释放。 */
export function apply(ctx: Context, api: HuhuApi, opts: TasksOptions = {}): void {
  const now = opts.now ?? (() => new Date());
  const svc = new TasksService({
    repo: api.vault.repo,
    trash: api.vault.trash,
    publish: (t, p) => api.events.publish(t, p),
    zone: opts.zone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    now,
    hasActiveRun: (id) => dispatch.hasActiveRun(id),
    pathKind: (rel) => {
      if (!rel || rel.startsWith("/") || rel.split("/").includes("..")) return null;
      try {
        const st = statSync(api.vault.files.abs(rel));
        return st.isDirectory() ? "folder" : st.isFile() ? "file" : null;
      } catch {
        return null;
      }
    },
  });
  const machine = machineId();
  const files = new VaultFiles(api.vault.stateDir, undefined, api.vault.files.readOnly);
  const publishRun = (runId: string, op: "created" | "updated" = "updated") => api.events.publish("entity.changed", { kind: "task-run", id: runId, op });
  const store = new DispatchStore(files, api.vault.vaultId, machine, ({ runId }, op) => publishRun(runId, op));
  const executor = opts.dispatchExecutor === undefined ? createAgentDispatchExecutor(api, machine) : opts.dispatchExecutor;
  const inbox = new TaskReceiptInbox(files, now, publishRun);
  const replies = new TaskNativeReplies(files, svc, inbox, now, executor ?? undefined);
  const dispatch: TaskDispatch = new TaskDispatch(svc, store, inbox, replies, now, machine, executor ?? undefined, opts.onError, (rel) => {
    try {
      const abs = resolveReadableAsset(api.vault.files.root, rel);
      const stat = statSync(abs);
      if (!stat.isFile() || stat.size > 32_000) return null;
      const bytes = readFileSync(abs);
      if (bytes.length > 32_000) return null;
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return text.length <= 8_000 ? { version: versionOf(bytes), text } : null;
    } catch {
      return null;
    }
  }, opts.dispatchBudget, (source, taskId) => api.service<TaskScheduleAdmission>("taskScheduleAdmission")?.(source, taskId) ?? false);
  const committedResult = (taskId: string, receiptId: string) => dispatch.committedResult(taskId, receiptId);
  const githubSources = new GitHubSources(files, svc, dispatch, now, new GitHubDeliveries(files, committedResult));
  const mailDeliveries = new TaskMailDeliveries(files, committedResult, () => api.service("mail.outbox"));
  api.defineCapability(bindCapability(taskToolDescriptors.githubCreate, (c, input) => githubSources.create(c, input)));
  api.defineCapability(bindCapability(taskToolDescriptors.githubRetire, (c, { sourceId }) => githubSources.retire(c, sourceId)));
  api.defineCapability(bindCapability(taskToolDescriptors.githubAllowReply, (c, input) => githubSources.allowReply(c, input)));
  api.defineCapability(bindCapability(taskToolDescriptors.githubAccept, (c, input) => githubSources.accept(c, input)));
  api.defineCapability(bindCapability(taskToolDescriptors.githubRead, (c, input) => githubSources.readEvent(c, input)));
  api.defineCapability(bindCapability(taskToolDescriptors.githubAllowDelivery, (c, input) => githubSources.allowDelivery(c, input)));
  api.defineCapability(bindCapability(taskToolDescriptors.githubClaimDelivery, (c, input) => githubSources.claimDelivery(c, input)));
  api.defineCapability(bindCapability(taskToolDescriptors.githubConfirmDelivery, (c, input) => githubSources.confirmDelivery(c, input)));
  api.defineCapability(bindCapability(taskToolDescriptors.githubReadDelivery, (c, input) => githubSources.readDelivery(c, input)));
  api.defineCapability(bindCapability(taskToolDescriptors.submitMailDelivery, (c, input) => {
    if (c.caller !== "desktop") throw errors.permissionDenied("需要从本机提交对应邮件草稿");
    return mailDeliveries.submit(c, input);
  }));

  const exposure = new ExposureStore(api.vault.files, path.join(api.vault.stateDir, "plugins.json"));
  const validateAgentTarget = (execution: TaskExecution | null | undefined) => {
    if (!execution) throw errors.invalidInput("请配置 Agent 任务的执行目标");
    const { spaceId, target, provider, model, effort } = execution;
    const spaces = api.service<{ spaces: { list(): { id: string }[] } }>("agentCli")?.spaces;
    if (!spaceId || !spaces?.list().some(({ id }) => id === spaceId)) throw errors.invalidInput("请选择当前 Vault 已配置的工作区");
    if (target?.mode !== "existing" && (!provider || !agentById(provider))) throw errors.invalidInput("请选择已知的 Agent");
    if (model?.startsWith("-") || effort?.startsWith("-")) throw errors.invalidInput("模型或推理强度不能以命令选项开头");
  };
  const validateExecutionSelection = async (c: CapabilityContext, execution: TaskExecution | null | undefined, previous?: TaskExecution | null) => {
    if (execution?.profile === "workspace-write") {
      if (execution.provider !== "codex" || (execution.target && execution.target.mode !== "new")) throw errors.invalidInput("工作区写入只支持受控 Codex 新会话");
      if (c.caller !== "desktop" && JSON.stringify(execution) !== JSON.stringify(previous)) throw errors.permissionDenied("需要在本机桌面选择工作区写入 profile");
    }
    const target = execution?.target;
    if (!execution || target?.mode !== "resume") return;
    if (execution.provider !== "codex" || target.history?.machineId !== machine || !execution.spaceId || target.history.spaceId !== execution.spaceId || execution.model || execution.effort || execution.fast) {
      throw errors.invalidInput("请重新选择受控 Codex 历史会话");
    }
    if (previous?.target?.mode === "resume" && previous.spaceId === execution.spaceId && previous.provider === execution.provider && JSON.stringify(previous.target) === JSON.stringify(target)) return;
    const targets = z.array(AgentDispatchTargetInfoSchema).parse(
      await api.call(
        "agent.targets.list",
        {
          vaultId: api.vault.vaultId,
          machineId: machine,
          spaceId: execution.spaceId,
        },
        { signal: c.signal },
      ),
    );
    const selected = targets.filter(
      (row) =>
        row.mode === "resume" &&
        row.provider === execution.provider &&
        row.spaceId === execution.spaceId &&
        row.nativeSessionId === target.nativeSessionId &&
        row.history?.historyId === target.history?.historyId &&
        row.history?.historyRevision === target.history?.historyRevision &&
        row.history?.spaceRevision === target.history?.spaceRevision &&
        row.history?.machineId === target.history?.machineId &&
        row.history?.spaceId === target.history?.spaceId,
    );
    if (selected.length !== 1 || (!selected[0]?.available && selected[0]?.reason !== "input_owned" && selected[0]?.reason !== "history_writer_busy")) throw errors.invalidInput("原生历史来源已变化或不可派遣，请重新选择");
  };
  const assertStillExposed = (c: CapabilityContext, capability: string) => {
    c.signal.throwIfAborted();
    if (isExternalTool(c.caller) && toolSelection(exposure.snapshot(), capability) !== true) throw errors.capabilityNotExposed(capability);
  };
  const authorizeAgentEdit = (c: CapabilityContext) => {
    toolOwner(c);
    if (toolSelection(exposure.snapshot(), taskToolDescriptors.agentCreate.name) !== true) throw errors.permissionDenied("请先开放 Agent 任务工具");
  };

  api.defineCapability(
    defineCapability({
      name: "tasks.receipts.consume",
      plugin: "tasks",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      idempotency: "handler",
      input: ExecutionReceiptSchema,
      output: ExecutionReceiptAckSchema,
      handler: async ({ caller, signal }, input) => {
        if (caller !== "plugin:agent-cli") throw errors.permissionDenied("接收 Agent 任务回执");
        const result = await dispatch.consumeReceipt(input, signal);
        if (result.stage === "tasks_consumed") {
          publishRun(input.execution.runId);
          if (input.kind === "result" || input.kind === "failed" || input.kind === "no_update") dispatch.wakeAfterReceipt();
        }
        return result;
      },
    }),
  );
  api.defineCapability(
    bindCapability(taskToolDescriptors.questionsList, (c, { taskId }) => {
      if (!isTaskToolCaller(c.caller)) throw errors.permissionDenied("查看任务请求");
      return dispatch.questions(taskId, toolOwner(c));
    }),
  );
  api.defineCapability(
    bindCapability(taskToolDescriptors.reply, async (c, input) => {
      if (!isTaskToolCaller(c.caller)) throw errors.permissionDenied("回答任务请求");
      const reply = await dispatch.reply(input, responseActor(c), c.signal, () => {
        c.assertCapabilityCurrent?.();
        assertStillExposed(c, taskToolDescriptors.reply.name);
      });
      void dispatch.check();
      return reply;
    }),
  );
  api.defineCapability(
    bindCapability(taskToolDescriptors.replyRead, (c, input) => {
      if (!isTaskToolCaller(c.caller)) throw errors.permissionDenied("查看任务回答");
      return dispatch.readReply(input, toolOwner(c));
    }),
  );

  api.defineCapability(
    bindCapability(taskToolDescriptors.supplement, async (c, input) => {
      const accepted = await dispatch.acceptSupplement(input, responseActor(c), c.signal, () => assertStillExposed(c, taskToolDescriptors.supplement.name));
      void dispatch.check();
      return accepted;
    }),
  );
  api.defineCapability(bindCapability(taskToolDescriptors.supplementRead, (c, input) => dispatch.readSupplement(input, toolOwner(c))));
  api.defineCapability(
    bindCapability(taskToolDescriptors.dispatch, async (c, i) => {
      if (!isTaskToolCaller(c.caller) || (!isWorkbenchCaller(c.caller) && i.allowEarly === true)) throw errors.permissionDenied("任务派遣或提前派遣");
      const receipt = await dispatch.accept(i, isWorkbenchCaller(c.caller) ? { kind: "desktop" } : { kind: "tool", owner: toolOwner(c)! });
      void dispatch.check();
      return receipt;
    }),
  );
  api.defineCapability(
    bindCapability(taskToolDescriptors.dispatchRead, (c, i) => {
      if (!isTaskToolCaller(c.caller)) throw errors.permissionDenied("查看任务派遣");
      return dispatch.read(i, toolOwner(c));
    }),
  );
  api.defineCapability(
    bindCapability(taskToolDescriptors.dispatchTargets, async ({ caller, signal }, { spaceId, profile }) => {
      if (!isTaskToolCaller(caller)) throw errors.permissionDenied("查看任务的会话目标");
      const input = { vaultId: api.vault.vaultId, machineId: machineId(), spaceId, ...(profile && { options: { profile } }), ...(!isWorkbenchCaller(caller) && { mode: "snapshot" }) };
      const response = await api.call("agent.targets.list", input, { signal }).catch((error: unknown) => {
        const code = ErrorCodeSchema.safeParse(error instanceof Error && "code" in error ? error.code : undefined);
        if (code.success && error instanceof Error) throw new HuhuError(code.data, error.message);
        throw error;
      });
      const targets = z.array(AgentDispatchTargetInfoSchema).parse(response);
      return targets.map(({ mode, provider, sessionId, nativeSessionId, history, historyTitle, available, reason, profile, capabilities }) => ({ mode, provider, sessionId, nativeSessionId, history, historyTitle, available, reason, profile, capabilities }));
    }),
  );
  api.defineCapability(bindCapability(taskToolDescriptors.dispatchResources, ({ caller }) => {
    if (!isWorkbenchCaller(caller)) throw errors.permissionDenied("查看本机派遣资源");
    const retained = api.service<{ dispatchRetained(): number }>("agentCli")?.dispatchRetained();
    return dispatch.resources(retained ?? null);
  }));
  api.defineCapability(bindCapability(taskToolDescriptors.dispatchList, (c, { taskId }) => dispatch.list(taskId, toolOwner(c))));
  api.defineCapability(
    bindCapability(taskToolDescriptors.dispatchRetry, async ({ caller, signal }, input) => {
      if (!isWorkbenchCaller(caller)) throw errors.permissionDenied("重试原任务输入需要工作台");
      const receipt = await dispatch.retry(input, signal);
      void dispatch.check();
      return receipt;
    }),
  );
  api.defineCapability(bindCapability(taskToolDescriptors.dispatchRecent, (c, { limit }) => dispatch.recent(limit, toolOwner(c))));
  api.defineCapability(
    bindCapability(taskToolDescriptors.dispatchCancel, (c, i) => {
      if (!isTaskToolCaller(c.caller)) throw errors.permissionDenied("取消任务派遣");
      return dispatch.cancel(i, toolOwner(c));
    }),
  );
  api.defineCapability(
    bindCapability(taskToolDescriptors.dispatchStop, async (c, input) => {
      const receipt = await dispatch.acceptStop(input, c.signal, toolOwner(c, true), () => assertStillExposed(c, taskToolDescriptors.dispatchStop.name));
      void dispatch.check();
      return receipt;
    }),
  );
  api.defineCapability(bindCapability(taskToolDescriptors.dispatchStopRead, (c, input) => dispatch.readStop(input, toolOwner(c, true))));
  api.provide("taskDispatch", {
    createFromRule: (input) => svc.createFromRule(input),
    readAcceptedRule: (input, source) => dispatch.readAcceptedRule(input, source),
    acceptRule: async (input, source) => {
      const receipt = await dispatch.acceptRule(input, source);
      void dispatch.check();
      return receipt;
    },
  } satisfies TaskRuleDispatch);
  api.provide("taskResumeClaims", { abandoned: (key: Parameters<TaskDispatch["resumeAbandoned"]>[0]) => dispatch.resumeAbandoned(key) });
  api.provide("taskFollowUpDispatch", {
    acceptFollowUp: async (input) => {
      const receipt = await dispatch.acceptFollowUp(input);
      void dispatch.check();
      return receipt;
    },
  } satisfies TaskFollowUpDispatch);

  api.events.subscribe((event) => {
    const payload = event.payload as { kind?: string; id?: string };
    if ((event.type === "plugin.stateChanged" && payload.id === "automations")
      || (event.type === "entity.changed" && ["automation-rule", "task-follow-up"].includes(payload.kind ?? ""))) dispatch.wakeAfterReceipt();
  });
  ctx.effect(() => {
    dispatch.startRecovery(opts.dispatchCheckMs ?? 5_000);
    return async () => {
      await githubSources.drain();
      await mailDeliveries.drain();
      await dispatch.close();
    };
  });

  api.defineCapability(
    bindCapability(taskToolDescriptors.list, (_c, i) =>
      svc.list({ category: i.category, ...(i.status ? { status: i.status } : {}), ...(i.type ? { type: i.type } : {}), ...(i.tags ? { tags: i.tags } : {}), ...(i.query ? { query: i.query } : {}) }),
    ),
  );
  api.defineCapability(bindCapability(taskToolDescriptors.read, (_c, i) => svc.read(i.id)));
  api.defineCapability(bindCapability(taskToolDescriptors.attention, (c): TaskAttention[] => {
    if (!isWorkbenchCaller(c.caller)) throw errors.permissionDenied("待处理任务摘要");
    return svc.list({ status: ["not_started", "in_progress"] }).flatMap((task): TaskAttention[] => {
      const base = { taskId: task.id, title: task.title };
      if (task.type === "agent") {
        const attention = dispatch.questions(task.id).flatMap(({ status, reply, runId, requestId }): TaskAttention[] => {
          if (status !== "awaiting" || reply?.status === "accepted") return [];
          const state = !reply ? "awaiting"
            : reply.status === "not_sent" || reply.status === "unsupported" || reply.status === "expired" ? "answer-failed" : "answer-unconfirmed";
          return [{ ...base, state, runId, questionId: requestId }];
        });
        if (attention.length) return attention;
        const run = dispatch.activity(task).execution;
        if (run.state === "unknown" || run.state === "failed") {
          return [{ ...base, state: run.state === "unknown" ? "run-unknown" : "run-failed", runId: run.identity.runId }];
        }
      }
      return [{ ...base, state: task.dispatchBlockers.length ? "blocked" : "pending" }];
    });
  }));
  api.defineCapability(
    bindCapability(taskToolDescriptors.create, async (c, i) => {
      if (i.inboxConversionId && (c.caller !== "plugin:inbox" || c.delegatedBy)) throw errors.permissionDenied("收件转换标识");
      if (!isWorkbenchCaller(c.caller) && (i.type === "agent" || i.execution)) {
        authorizeAgentEdit(c);
        if (i.type !== "agent") throw errors.permissionDenied("人工任务不能设置 Agent 执行目标");
        validateAgentTarget(i.execution);
      }
      if (i.type === "agent") await validateExecutionSelection(c, i.execution);
      const task = await svc.create(i, originOf(c.caller), i.inboxConversionId, () => c.signal.throwIfAborted());
      // 受信 Inbox 转换只需要任务 ID：不让下游幂等账本持久化任务正文
      if (c.caller === "plugin:inbox" && !c.delegatedBy) return { id: task.id };
      return agentWriteResult(c.caller, task);
    }),
  );
  api.defineCapability(
    bindCapability(taskToolDescriptors.agentCreate, async (c, input) => {
      const { caller } = c;
      if (!isTaskToolCaller(caller)) throw errors.permissionDenied("创建 Agent 任务");
      validateAgentTarget(input.execution);
      await validateExecutionSelection(c, input.execution);
      return agentWriteResult(caller, await svc.create(input, originOf(caller)));
    }),
  );
  api.defineCapability(
    bindCapability(taskToolDescriptors.update, async (c, i) => {
      let includesAgentInput = false;
      const task = await svc.update(i.id, i.expectedVersion, i.patch, i.baseInputHash, i.baseEditHash, async (current, type, execution) => {
        if (!isWorkbenchCaller(c.caller) && (current.type === "agent" || type === "agent" || execution)) {
          authorizeAgentEdit(c);
          if (current.version !== i.expectedVersion) throw errors.versionConflict(current.version);
          if (type === "agent") validateAgentTarget(execution);
          includesAgentInput = true;
        }
        if (type === "agent" && (i.patch.execution !== undefined || current.type !== type)) await validateExecutionSelection(c, execution, current.type === "agent" ? current.execution : undefined);
      });
      return agentWriteResult(c.caller, task, includesAgentInput);
    }),
  );
  api.defineCapability(
    bindCapability(taskToolDescriptors.duplicate, async (c, i) => {
      const task = await svc.duplicate(i.id, originOf(c.caller), async (current) => {
        if (current.type !== "agent") return;
        if (!isWorkbenchCaller(c.caller)) {
          authorizeAgentEdit(c);
          validateAgentTarget(current.execution);
        }
        await validateExecutionSelection(c, current.execution);
      });
      return agentWriteResult(c.caller, task);
    }),
  );
  api.defineCapability(
    bindCapability(taskToolDescriptors.delete, (_c, i) =>
      svc.withTaskWrite(i.id, async () => {
        await svc.delete(i.id);
        return { ok: true as const };
      }),
    ),
  );
  api.defineCapability(bindCapability(taskToolDescriptors.setStatus, (_c, i) => svc.setStatus(i.id, i.status, i.expectedVersion)));
  api.defineCapability(
    bindCapability(taskToolDescriptors.commentsAdd, (c, i) => {
      const internal = c.caller.startsWith("plugin:");
      const user = isWorkbenchCaller(c.caller);
      const source = user ? "human" : internal ? (i.source ?? "system") : "external";
      const at = (opts.now?.() ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
      return svc.addComment(i.taskId, {
        id: internal && i.id ? i.id : `c-${newId("cap").replace("cap-", "")}`,
        at,
        source,
        author: user ? "我" : internal ? i.author : c.caller,
        run: internal ? i.run : undefined,
        ask: internal ? i.ask : undefined,
        session: internal ? i.session : undefined,
        event: internal ? i.event : undefined,
        body: i.body,
      });
    }),
  );
  api.defineCapability(
    bindCapability(taskToolDescriptors.runs, (_c, i) => {
      svc.read(i.id);
      return dispatch.runs(i.id);
    }),
  );

  // 为 automations 提供进程内服务（modules/tasks.md §6）：冻结的任务快照
  api.provide("taskQuery", {
    listAll: () => svc.list(),
    listDispatchable: () => svc.list({ type: "agent", status: ["not_started"] }),
    snapshot: (taskId: string) => svc.read(taskId),
    agentDispatchBlocker,
    async resumeEligibility(task, instructions, signal) {
      if (!task.execution || !executor?.resumeEligibility) return { state: "unsupported", reason: "native_resume_evidence_unavailable" };
      return executor.resumeEligibility(task.execution, task.body, instructions, signal);
    },
  } satisfies TaskQuery);
  api.provide("taskObservation", {
    comment(taskId: string, id: string, body: string) {
      return svc.addComment(taskId, { id, at: now().toISOString(), source: "system", event: "observation", body });
    },
  });
  api.provide("taskActivity", {
    async readTaskActivity(taskId: string, signal: AbortSignal) {
      signal.throwIfAborted();
      try {
        return dispatch.activity(svc.read(taskId));
      } catch (error) {
        if (error instanceof HuhuError && error.code === "NOT_FOUND") return null;
        throw error;
      }
    },
  });

}
