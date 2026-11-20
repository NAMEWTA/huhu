import {
  errors,
  ExecutionReceiptAckSchema,
  ExecutionReceiptSchema,
  isWorkbenchCaller,
  TaskCategorySchema,
  TaskCommentSchema,
  TaskDtoSchema,
  TaskExecutionSchema,
  TaskPatchSchema,
  TaskStatusSchema,
  TaskTypeSchema,
  TaskWritableSchema,
  type TaskOrigin,
} from "@huhu/contracts";
import type { Context } from "@huhu/cordis";
import type { HuhuApi } from "@huhu/kernel";
import { defineCapability as def } from "@huhu/kernel";
import { machineId, VaultFiles } from "@huhu/vault";
import { newId } from "@huhu/contracts";
import { AgentDispatchTargetInfoSchema } from "@huhu/plugin-agent-cli/engine";
import { agentById } from "@huhu/plugin-agent-cli/shared";
import { statSync } from "node:fs";
import { z } from "zod";
import { createAgentDispatchExecutor } from "./agent-dispatch-executor.js";
import { TaskDispatch, type TaskDispatchExecutor } from "./dispatch.js";
import { DispatchInput, DispatchLookup, DispatchReceipt, DispatchStore, RecentTaskRun, StopLookup, StopReceipt, TaskDispatchView, TaskRunSummary } from "./dispatch-store.js";
import { TaskNativeReplies, TaskReplyInput, TaskReplyLookup, TaskReplyView, TaskSupplementInput, TaskSupplementLookup, TaskSupplementView } from "./native-replies.js";
import { TaskQuestionView, TaskReceiptInbox } from "./receipt-inbox.js";
import { agentDispatchBlocker, TasksService } from "./service.js";

export { TasksService } from "./service.js";
export type { TaskDispatchExecutor } from "./dispatch.js";
export type TaskRuleDispatch = Pick<TaskDispatch, "acceptRule"> & Pick<TasksService, "createFromRule">;
export type TaskFollowUpDispatch = Pick<TaskDispatch, "acceptFollowUp">;

/** 其他插件通过 `api.service<TaskQuery>("taskQuery")` 使用。 */
export interface TaskQuery {
  listAll(): import("@huhu/contracts").TaskDto[];
  /** 可以派发的 agent 任务：type=agent 且未开始。 */
  listDispatchable(): import("@huhu/contracts").TaskDto[];
  snapshot(taskId: string): import("@huhu/contracts").TaskDto;
  agentDispatchBlocker: typeof agentDispatchBlocker;
}

const Id = z.object({ id: z.string() });

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

/** 创建和修改 Agent 任务或它的执行配置要求已认证的工作台用户。 */
function assertAgentAllowed(caller: string, i: { type?: string | undefined; execution?: unknown }): void {
  if ((i.type === "agent" || (i.execution !== undefined && i.execution !== null)) && !isWorkbenchCaller(caller)) throw errors.permissionDenied("创建或修改 Agent 任务（仅工作台可用）");
}
const isTaskToolCaller = (caller: string) => isWorkbenchCaller(caller) || caller === "cli" || caller === "mcp" || caller === "http";
const Versioned = Id.extend({ expectedVersion: z.string() });
const REMINDER_CHECK_MS = 30_000;

export interface TasksOptions {
  zone?: () => string;
  now?: () => Date;
  reminderCheckMs?: number;
  dispatchCheckMs?: number;
  dispatchExecutor?: TaskDispatchExecutor | null;
  /** 站内通知：提醒到点时调用（通知中心属于 kernel）。 */
  notify?: (n: { title: string; module: string; body?: string }) => void;
  onError?: (e: unknown) => void;
}

/** tasks 插件入口（architecture.md §5）：注册能力、提醒检查；资源随作用域释放。 */
export function apply(ctx: Context, api: HuhuApi, opts: TasksOptions = {}): void {
  const now = opts.now ?? (() => new Date());
  const svc = new TasksService({
    repo: api.vault.repo,
    trash: api.vault.trash,
    publish: (t, p) => api.events.publish(t, p),
    zone: opts.zone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    now,
    hasDispatchHold: (id) => dispatch.hasHold(id),
    hasStartedDispatch: (id) => dispatch.hasActiveRun(id),
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
  const inbox = new TaskReceiptInbox(files, now);
  const replies = new TaskNativeReplies(files, svc, inbox, now, executor ?? undefined);
  const dispatch: TaskDispatch = new TaskDispatch(svc, store, inbox, replies, now, machine, executor ?? undefined, opts.onError);

  api.defineCapability(
    def({
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
        if (result.stage === "tasks_consumed") publishRun(input.execution.runId);
        return result;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.questions.list",
      plugin: "tasks",
      scope: "read",
      exposable: true,
      defaultExposed: false,
      input: z.strictObject({ taskId: z.string() }),
      output: z.array(TaskQuestionView.extend({ reply: TaskReplyView.optional() })),
      handler: ({ caller }, { taskId }) => {
        if (!isTaskToolCaller(caller)) throw errors.permissionDenied("查看任务请求");
        return dispatch.questions(taskId);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.reply",
      plugin: "tasks",
      scope: "write",
      exposable: true,
      defaultExposed: false,
      idempotency: "handler",
      input: TaskReplyInput,
      output: TaskReplyView,
      handler: async ({ caller, signal }, input) => {
        if (!isTaskToolCaller(caller)) throw errors.permissionDenied("回答任务请求");
        const reply = await dispatch.reply(input, signal);
        void dispatch.check();
        return reply;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.reply.read",
      plugin: "tasks",
      scope: "read",
      exposable: true,
      defaultExposed: false,
      input: TaskReplyLookup,
      output: TaskReplyView,
      handler: ({ caller }, input) => {
        if (!isTaskToolCaller(caller)) throw errors.permissionDenied("查看任务回答");
        return dispatch.readReply(input);
      },
    }),
  );

  api.defineCapability(
    def({
      name: "tasks.supplement",
      plugin: "tasks",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      idempotency: "handler",
      input: TaskSupplementInput,
      output: TaskSupplementView,
      handler: async ({ caller, signal }, input) => {
        if (!isWorkbenchCaller(caller)) throw errors.permissionDenied("发送任务补充");
        const accepted = await dispatch.acceptSupplement(input, signal);
        void dispatch.check();
        return accepted;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.supplement.read",
      plugin: "tasks",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: TaskSupplementLookup,
      output: TaskSupplementView,
      handler: ({ caller }, input) => {
        if (!isWorkbenchCaller(caller)) throw errors.permissionDenied("查看任务补充");
        return dispatch.readSupplement(input);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.dispatch",
      plugin: "tasks",
      scope: "execute",
      exposable: true,
      defaultExposed: false,
      input: DispatchInput,
      output: DispatchReceipt,
      handler: async (c, i) => {
        if (!isTaskToolCaller(c.caller) || (!isWorkbenchCaller(c.caller) && i.allowEarly === true)) throw errors.permissionDenied("任务派遣或提前派遣");
        const receipt = await dispatch.accept(i, isWorkbenchCaller(c.caller) ? { kind: "desktop" } : { kind: "tool" });
        void dispatch.check();
        return receipt;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.dispatch.read",
      plugin: "tasks",
      scope: "read",
      exposable: true,
      defaultExposed: false,
      input: DispatchLookup,
      output: DispatchReceipt,
      handler: (c, i) => {
        if (!isTaskToolCaller(c.caller)) throw errors.permissionDenied("查看任务派遣");
        return dispatch.read(i);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.dispatch.targets",
      plugin: "tasks",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: z.strictObject({ spaceId: z.string().min(1) }),
      output: z.array(AgentDispatchTargetInfoSchema.pick({ mode: true, provider: true, sessionId: true, available: true, reason: true })),
      handler: async ({ caller, signal }, { spaceId }) => {
        if (!isWorkbenchCaller(caller)) throw errors.permissionDenied("查看任务的会话目标");
        const targets = z.array(AgentDispatchTargetInfoSchema).parse(await api.call("agent.targets.list", { vaultId: api.vault.vaultId, machineId: machineId(), spaceId }, { signal }));
        return targets.map(({ mode, provider, sessionId, available, reason }) => ({ mode, provider, sessionId, available, reason }));
      },
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.dispatch.list",
      plugin: "tasks",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: z.strictObject({ taskId: z.string() }),
      output: z.array(TaskDispatchView),
      handler: ({ caller }, { taskId }) => {
        if (!isWorkbenchCaller(caller)) throw errors.permissionDenied("查看任务派遣");
        return dispatch.list(taskId);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.dispatch.recent",
      plugin: "tasks",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: z.strictObject({ limit: z.int().min(1).max(200).default(200) }),
      output: z.array(RecentTaskRun),
      handler: ({ caller }, { limit }) => {
        if (!isWorkbenchCaller(caller)) throw errors.permissionDenied("查看最近的任务运行");
        return dispatch.recent(limit);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.dispatch.cancel",
      plugin: "tasks",
      scope: "write",
      exposable: true,
      defaultExposed: false,
      input: DispatchLookup,
      output: DispatchReceipt,
      handler: (c, i) => {
        if (!isTaskToolCaller(c.caller)) throw errors.permissionDenied("取消任务派遣");
        return dispatch.cancel(i);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.dispatch.stop",
      plugin: "tasks",
      scope: "execute",
      exposable: false,
      defaultExposed: false,
      idempotency: "handler",
      input: StopLookup,
      output: StopReceipt,
      handler: async ({ caller, signal }, input) => {
        if (caller !== "desktop") throw errors.permissionDenied("停止任务运行");
        const receipt = await dispatch.acceptStop(input, signal);
        void dispatch.check();
        return receipt;
      },
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.dispatch.stop.read",
      plugin: "tasks",
      scope: "read",
      exposable: false,
      defaultExposed: false,
      input: StopLookup,
      output: StopReceipt,
      handler: ({ caller }, input) => {
        if (caller !== "desktop") throw errors.permissionDenied("查看任务停止记录");
        return dispatch.readStop(input);
      },
    }),
  );
  api.provide("taskDispatch", {
    createFromRule: (input) => svc.createFromRule(input),
    acceptRule: async (input, source) => {
      const receipt = await dispatch.acceptRule(input, source);
      void dispatch.check();
      return receipt;
    },
  } satisfies TaskRuleDispatch);
  api.provide("taskFollowUpDispatch", {
    acceptFollowUp: async (input) => {
      const receipt = await dispatch.acceptFollowUp(input);
      void dispatch.check();
      return receipt;
    },
  } satisfies TaskFollowUpDispatch);

  ctx.effect(() => {
    void dispatch.check();
    const timer = setInterval(() => void dispatch.check(), opts.dispatchCheckMs ?? 5_000);
    return () => {
      clearInterval(timer);
      return dispatch.close();
    };
  });

  const ListInput = z.object({ category: TaskCategorySchema.default("all"), status: z.array(TaskStatusSchema).optional(), type: TaskTypeSchema.optional(), tags: z.array(z.string()).optional(), query: z.string().optional() });
  api.defineCapability(
    def({
      name: "tasks.list",
      plugin: "tasks",
      scope: "read",
      exposable: true,
      defaultExposed: true,
      input: ListInput,
      output: z.array(TaskDtoSchema),
      handler: (_c, i) => svc.list({ category: i.category, ...(i.status ? { status: i.status } : {}), ...(i.type ? { type: i.type } : {}), ...(i.tags ? { tags: i.tags } : {}), ...(i.query ? { query: i.query } : {}) }),
    }),
  );
  api.defineCapability(def({ name: "tasks.read", plugin: "tasks", scope: "read", exposable: true, defaultExposed: true, input: Id, output: TaskDtoSchema, handler: (_c, i) => svc.read(i.id) }));
  api.defineCapability(
    def({
      name: "tasks.create",
      plugin: "tasks",
      scope: "write",
      exposable: true,
      defaultExposed: false,
      input: TaskWritableSchema,
      output: TaskDtoSchema,
      handler: (c, i) => {
        assertAgentAllowed(c.caller, i);
        return svc.create(i, originOf(c.caller));
      },
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.agent.create",
      plugin: "tasks",
      scope: "write",
      exposable: true,
      defaultExposed: false,
      input: TaskWritableSchema.extend({ type: z.literal("agent").default("agent"), execution: TaskExecutionSchema }),
      output: TaskDtoSchema,
      handler: ({ caller }, input) => {
        if (!isTaskToolCaller(caller)) throw errors.permissionDenied("创建 Agent 任务");
        const { spaceId, target, provider, model, effort } = input.execution;
        const spaces = api.service<{ spaces: { list(): { id: string }[] } }>("agentCli")?.spaces;
        if (!spaceId || !spaces?.list().some(({ id }) => id === spaceId)) throw errors.invalidInput("请选择当前 Vault 已配置的工作区");
        if (target?.mode === "resume") throw errors.invalidInput("此工具需要新会话或明确选中的现有会话");
        if (target?.mode !== "existing" && (!provider || !agentById(provider))) throw errors.invalidInput("请选择已知的 Agent");
        if (model?.startsWith("-") || effort?.startsWith("-")) throw errors.invalidInput("模型或推理强度不能以命令选项开头");
        return svc.create(input, originOf(caller));
      },
    }),
  );
  api.defineCapability(
    def({
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
      handler: (c, i) => {
        assertAgentAllowed(c.caller, i.patch);
        const cur = svc.read(i.id);
        if (cur.type === "agent" && !isWorkbenchCaller(c.caller)) throw errors.permissionDenied("修改 Agent 任务（仅工作台可用）");
        return svc.update(i.id, i.expectedVersion, i.patch, i.baseInputHash, i.baseEditHash);
      },
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.duplicate",
      plugin: "tasks",
      scope: "write",
      exposable: true,
      defaultExposed: false,
      input: Id,
      output: TaskDtoSchema,
      handler: (c, i) => (svc.read(i.id).type === "agent" && !isWorkbenchCaller(c.caller) ? Promise.reject(errors.permissionDenied("复制 Agent 任务（仅工作台可用）")) : svc.duplicate(i.id, originOf(c.caller))),
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.delete",
      plugin: "tasks",
      scope: "write",
      exposable: true,
      defaultExposed: false,
      input: Id,
      output: z.object({ ok: z.literal(true) }),
      handler: (_c, i) => svc.withTaskWrite(i.id, async () => (svc.delete(i.id), { ok: true as const })),
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.setStatus",
      plugin: "tasks",
      scope: "write",
      exposable: true,
      defaultExposed: false,
      input: Versioned.extend({ status: TaskStatusSchema }),
      output: TaskDtoSchema,
      handler: (_c, i) => svc.setStatus(i.id, i.status, i.expectedVersion),
    }),
  );
  api.defineCapability(
    def({
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
      handler: (c, i) => {
        const task = svc.read(i.taskId);
        const internal = c.caller.startsWith("plugin:");
        // 外部入口只能给 human 任务写评论：agent 任务的输入（含评论）不能被外部注入（spec §8.3）
        const user = isWorkbenchCaller(c.caller);
        if (!internal && !user && task.type === "agent") throw errors.permissionDenied("给 Agent 任务写评论（仅工作台可用）");
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
      },
    }),
  );
  api.defineCapability(
    def({
      name: "tasks.runs",
      plugin: "tasks",
      scope: "read",
      exposable: true,
      defaultExposed: true,
      input: Id,
      output: z.array(TaskRunSummary),
      handler: (_c, i) => {
        svc.read(i.id);
        return dispatch.runs(i.id);
      },
    }),
  );

  // 为 automations 提供进程内服务（modules/tasks.md §6）：冻结的任务快照
  api.provide("taskQuery", {
    listAll: () => svc.list(),
    listDispatchable: () => svc.list({ type: "agent", status: ["not_started"] }),
    snapshot: (taskId: string) => svc.read(taskId),
    agentDispatchBlocker,
  } satisfies TaskQuery);

  // 提醒：启动时与每 30 秒检查；应用关闭期间到点的在下次启动补发一次
  let checking = false;
  const check = async () => {
    if (checking) return;
    checking = true;
    try {
      for (const r of svc.dueReminders()) {
        try {
          await svc.markReminderDelivered(r.taskId, r.reminderId);
          opts.notify?.({ title: `任务提醒：${r.title}`, module: "tasks", body: `提醒时间 ${r.at}` });
        } catch (e) {
          // 单个任务无法写入（只读文件、版本冲突）不得影响其他提醒，也不得让进程崩溃
          opts.onError?.(e);
        }
      }
    } finally {
      checking = false;
    }
  };
  ctx.effect(() => {
    const run = () => check().catch((e) => opts.onError?.(e));
    void run();
    const t = setInterval(() => void run(), opts.reminderCheckMs ?? REMINDER_CHECK_MS);
    return () => clearInterval(t);
  });
}
