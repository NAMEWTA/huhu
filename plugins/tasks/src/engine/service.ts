import {
  errors,
  HuhuError,
  isHuhuError,
  matchesTags,
  newId,
  normalizeTags,
  TaskExecutionSchema,
  TaskWritableSchema,
  type EventPayload,
  type EventType,
  type TaskComment,
  type TaskDto,
  type TaskOrigin,
  type TaskPatch,
  type TaskReference,
  type TaskStatus,
  type TaskWritable,
} from "@huhu/contracts";
import { appendComment, buildTaskBody, idFromFilename, parseTaskBody, parseWikiLinks, replaceTaskSection, versionOf, type Entity, type NewComment, type SemanticRepository, type Trash } from "@huhu/vault";
import { inCategory, todayIn, type TaskCategory } from "../shared/categories.js";
import { canonicalJson, inputHash, processingKey } from "../shared/input.js";
import { matchesQuery } from "../shared/search.js";
import { WriteQueue } from "./write-queue.js";

export interface TasksDeps {
  repo: SemanticRepository;
  trash: Trash;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  zone(): string;
  now(): Date;
  /** Vault 内相对路径是文件、文件夹还是不存在；越界或不合法返回 null。 */
  pathKind(rel: string): "file" | "folder" | null;
  /** 任务是否有活动运行（automations 提供；缺省读 task-run 的状态）。 */
  hasActiveRun?(taskId: string): boolean | undefined;
}

export type RuleTemplateTask = { taskId: string; ruleId: string; occurrenceId: string; title: string; body: string; execution: TaskDto["execution"] };

type TaskData = {
  title: string;
  type: "human" | "agent";
  status: TaskStatus;
  completedAt: string | null;
  tags: string[];
  due: string | null;
  availableAt: string | null;
  project: string | null;
  origin: TaskOrigin;
  execution: TaskDto["execution"];
  reminders: TaskDto["reminders"];
  inputRevision: number;
  createdAt: string;
  updatedAt: string;
};

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const refKey = (target: string) => target.replace(/#.*$/, "").trim();

function executionWithDefault(type: TaskDto["type"], execution: TaskDto["execution"]): TaskDto["execution"] {
  if (type === "human" || execution?.target) return execution;
  return { ...(execution ?? TaskExecutionSchema.parse({})), target: { mode: "new" } };
}

export function agentDispatchBlocker(task: TaskDto, newRound = false): string | undefined {
  const canBegin = task.status === "not_started" || (newRound && task.status === "in_progress" && (task.execution?.target?.mode ?? "new") === "new");
  if (task.readOnly || task.type !== "agent" || !canBegin) return "此任务无法开始新的 Agent 执行";
  if (task.problems.length) return "任务文件有结构问题";
  if (!task.body.trim()) return "任务内容为空";
  if (!task.execution?.spaceId) return "没有选择工作目录（Space）";
  if (task.execution.target?.mode !== "existing" && !task.execution.provider) return "没有选择 CLI";
  const historyIssue = historyDispatchBlocker(task.execution);
  if (historyIssue) return historyIssue;
  const invalid = task.references.find((ref) => ref.from === "task" && (ref.path.startsWith("/") || ref.path.split("/").includes("..") || /^[a-z]:/i.test(ref.path) || ref.path.includes("\\")));
  return invalid ? `引用越界：${invalid.path}` : undefined;
}

function historyDispatchBlocker(execution: NonNullable<TaskDto["execution"]>): string | undefined {
  const target = execution.target;
  if (target?.mode !== "resume") return;
  if (execution.provider !== "codex") return "当前 CLI 不支持受控历史派遣";
  if (!target.history || target.history.spaceId !== execution.spaceId) return "请重新选择原生历史会话";
  if (execution.model || execution.effort || execution.fast) return "原生历史使用受控 Codex 配置，请重新选择原生历史会话";
}

function taskInputHash(body: string, execution: TaskDto["execution"]): string {
  // 显式 new 与旧文件的缺省 new 等价，保留现有派发输入身份。
  if (execution?.target?.mode === "new") {
    const { target: _target, ...config } = execution;
    return inputHash({ body, execution: config });
  }
  return inputHash({ body, execution });
}

/** 任务文件 → DTO：区段解析、引用解析、不可派发原因都是派生值，不写回文件。 */
export function toDto(e: Entity, pathKind: TasksDeps["pathKind"] = () => null): TaskDto {
  const d = e.data as unknown as TaskData;
  const r = parseTaskBody(e.body);
  const body = r.task ?? "";
  const problems = r.problems;
  const comments: TaskComment[] = r.comments.map(({ range: _range, ...c }) => c);
  const references: TaskReference[] = [];
  const seen = new Set<string>();
  const add = (markdown: string, from: string) => {
    for (const l of parseWikiLinks(markdown)) {
      const path = refKey(l.target);
      if (!path || seen.has(`${from}|${path}`)) continue;
      seen.add(`${from}|${path}`);
      const folderLike = path.endsWith("/");
      const k = pathKind(folderLike ? path.slice(0, -1) : path);
      references.push({ path, kind: folderLike ? "folder" : (k ?? "file"), exists: k !== null && (folderLike ? k === "folder" : true), from });
    }
  };
  add(body, "task");
  for (const c of comments) add(c.body, c.id);
  const dispatchBlockers: string[] = [];
  if (r.problems.length > 0) dispatchBlockers.push("任务文件的结构有问题，见“文件问题”");
  if (d.type === "agent") {
    if (!d.execution) dispatchBlockers.push("缺少执行配置");
    else {
      if (!d.execution.spaceId) dispatchBlockers.push("没有选择工作目录（Space）");
      if (d.execution.target?.mode !== "existing" && !d.execution.provider) dispatchBlockers.push("没有选择 CLI");
      const historyIssue = historyDispatchBlocker(d.execution);
      if (historyIssue) dispatchBlockers.push(historyIssue);
    }
    if (!body.trim()) dispatchBlockers.push("任务内容为空");
    for (const ref of references.filter((x) => /(^|\/)\.\.(\/|$)/.test(x.path) || x.path.startsWith("/"))) dispatchBlockers.push(`引用越界：${ref.path}`);
  }
  const editable: TaskWritable = {
    title: d.title,
    body,
    type: d.type,
    tags: d.tags ?? [],
    due: d.due ?? null,
    ...(d.availableAt && { availableAt: d.availableAt }),
    project: d.project ?? null,
    execution: d.execution ?? null,
    reminders: d.reminders,
  };
  return {
    ...editable,
    availableAt: d.availableAt ?? null,
    id: e.id,
    path: e.path,
    version: e.version,
    status: d.status,
    completedAt: d.completedAt ?? null,
    origin: d.origin,
    inputRevision: d.inputRevision,
    inputHash: taskInputHash(body, editable.execution),
    editHash: versionOf(Buffer.from(canonicalJson(editable))),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    readOnly: e.readOnly,
    comments,
    references,
    problems,
    dispatchBlockers,
  };
}

export interface ListQuery {
  category?: TaskCategory;
  status?: TaskStatus[];
  type?: "human" | "agent";
  tags?: string[];
  query?: string;
}

/** 带区段级重试的条件写：读取最新版本 → 修改区段 → patch(expectedVersion)；版本冲突时重新读取并重新应用，最多 3 次（spec §3.3）。 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt < 3 && isHuhuError(e) && e.code === "VERSION_CONFLICT") continue;
      throw e;
    }
  }
}

/** 任务业务规则。 */
export class TasksService {
  private readonly writes = new WriteQueue();

  constructor(private readonly d: TasksDeps) {}

  withTaskWrite<T>(taskId: string, write: () => Promise<T>): Promise<T> {
    return this.writes.run(taskId, write);
  }

  drainWrites(): Promise<void> {
    return this.writes.drain();
  }

  private withRetriedTaskWrite<T>(taskId: string, write: () => Promise<T>): Promise<T> {
    return this.withTaskWrite(taskId, () => withRetry(write));
  }

  private dto(e: Entity): TaskDto {
    return toDto(e, this.d.pathKind);
  }
  private all(): TaskDto[] {
    return this.d.repo.list("task").map((e) => this.dto(e));
  }

  /** 列表、看板和自动化“选择任务”共用的筛选（标签是“全部匹配”）。 */
  list(q: ListQuery = {}): TaskDto[] {
    const today = todayIn(this.d.zone(), this.d.now());
    const rank: Record<TaskStatus, number> = { in_progress: 0, not_started: 1, completed: 2 };
    return this.all()
      .filter((t) => inCategory(t, q.category ?? "all", today))
      .filter((t) => !q.status || q.status.length === 0 || q.status.includes(t.status))
      .filter((t) => !q.type || t.type === q.type)
      .filter((t) => !q.tags || matchesTags(t.tags, normalizeTags(q.tags)))
      .filter((t) => !q.query || matchesQuery(t, q.query))
      .sort((a, b) => rank[a.status] - rank[b.status] || (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.title.localeCompare(b.title));
  }

  read(id: string): TaskDto {
    return this.dto(this.d.repo.read("task", id));
  }

  /** 文件级问题列表（健康中心）：schema 1、缺少 type / status 等由仓储按 kind 报告。 */
  async create(input: TaskWritable, origin: TaskOrigin, reservedId?: string): Promise<TaskDto> {
    const now = iso(this.d.now());
    const data = {
      title: input.title,
      type: input.type,
      status: "not_started" as const,
      completedAt: null,
      tags: input.tags,
      due: input.due,
      availableAt: input.availableAt ? new Date(input.availableAt).toISOString() : null,
      project: input.project,
      origin,
      execution: executionWithDefault(input.type, input.execution),
      reminders: input.reminders.map((r) => ({ ...r, id: r.id || newId("cap").replace("cap", "rem"), deliveredAt: null })),
      inputRevision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const e = await this.d.repo.create("task", data, buildTaskBody(input.body), reservedId);
    this.d.publish("entity.changed", { kind: "task", id: e.id, op: "created" });
    return this.dto(e);
  }

  createFromRule({ taskId, ruleId, occurrenceId, title, body, execution }: RuleTemplateTask): Promise<TaskDto> {
    const type = execution === null ? "human" : "agent";
    const input = TaskWritableSchema.parse({ type, title, body, execution });
    const origin = { kind: "automation", ruleId, activationId: occurrenceId } as const;
    return this.withTaskWrite(taskId, async () => {
      let existing: TaskDto | undefined;
      try {
        existing = this.read(taskId);
      } catch (error) {
        if (!isHuhuError(error) || error.code !== "NOT_FOUND") throw error;
      }
      if (existing) {
        const expectedBody = parseTaskBody(buildTaskBody(body)).task ?? "";
        if (
          existing.origin.kind !== "automation" ||
          existing.origin.ruleId !== ruleId ||
          existing.origin.activationId !== occurrenceId ||
          existing.type !== type ||
          existing.inputRevision !== 1 ||
          existing.inputHash !== taskInputHash(expectedBody, executionWithDefault(type, input.execution))
        ) {
          throw new HuhuError("VERSION_CONFLICT", "模板任务已变化，请查看原任务", { details: { reason: "stale_input" } });
        }
        return existing;
      }
      if (this.d.trash.list().some(({ originalPath }) => originalPath.startsWith("Tasks/") && idFromFilename(originalPath) === taskId)) throw errors.notFound("此模板任务已移到回收站");
      if (this.d.repo.problemList().some(({ kind, path }) => kind === "task" && idFromFilename(path) === taskId)) throw new HuhuError("WRITE_PARTIAL", "无法读取原模板任务", { details: { taskId } });
      return this.create(input, origin, taskId);
    });
  }

  /**
   * 更新可写字段。`<task>` 内容只替换 `<task>` 区段，评论与区段外的字节保持不变。
   * 版本变化后，在编辑快照仍匹配时重新应用补丁（B09）。旧输入哈希仅覆盖正文与执行配置。
   */
  async update(
    id: string,
    expectedVersion: string,
    patch: TaskPatch,
    baseInputHash?: string,
    baseEditHash?: string,
    authorize?: (current: TaskDto, type: TaskDto["type"], execution: TaskDto["execution"]) => void | Promise<void>,
  ): Promise<TaskDto> {
    return this.withRetriedTaskWrite(id, async () => {
      const entity = this.d.repo.read("task", id);
      const cur = this.dto(entity);
      if (cur.version !== expectedVersion) {
        const sameEdit = baseEditHash === undefined ? baseInputHash === cur.inputHash && Object.keys(patch).every((key) => key === "body" || key === "execution") : baseEditHash === cur.editHash;
        if (!sameEdit) throw errors.versionConflict(cur.version);
      }
      const changes: Record<string, unknown> = { updatedAt: iso(this.d.now()) };
      if (patch.title !== undefined) changes["title"] = patch.title;
      if (patch.type !== undefined) changes["type"] = patch.type;
      if (patch.tags !== undefined) changes["tags"] = normalizeTags(patch.tags);
      if (patch.due !== undefined) changes["due"] = patch.due;
      if (patch.availableAt !== undefined) changes["availableAt"] = patch.availableAt === null ? null : new Date(patch.availableAt).toISOString();
      if (patch.project !== undefined) changes["project"] = patch.project;
      if (patch.reminders !== undefined) changes["reminders"] = patch.reminders;
      let nextExec = cur.execution;
      if (patch.execution !== undefined || (patch.type !== undefined && patch.type !== cur.type)) {
        const requested = patch.execution === undefined ? cur.execution : patch.execution;
        const target = requested?.target ?? cur.execution?.target;
        nextExec = executionWithDefault(patch.type ?? cur.type, requested && target ? { ...requested, target } : requested);
        changes["execution"] = nextExec;
      }
      await authorize?.(cur, patch.type ?? cur.type, nextExec);
      const body = patch.body !== undefined ? replaceTaskSection(entity.body, patch.body) : undefined;
      const nextBody = body === undefined ? cur.body : (parseTaskBody(body).task ?? "");
      const inputDidChange = taskInputHash(nextBody, nextExec) !== cur.inputHash;
      if (inputDidChange) changes["inputRevision"] = cur.inputRevision + 1;
      const e = await this.d.repo.patch("task", id, changes, cur.version, body);
      const dto = this.dto(e);
      this.d.publish("entity.changed", { kind: "task", id, op: "updated" });
      if (inputDidChange) this.d.publish("task.inputChanged", { taskId: id, inputRevision: dto.inputRevision, inputHash: dto.inputHash });
      return dto;
    });
  }

  /**
   * 状态流转（spec §4.1、§4.4）：
   * - 关闭完成：只改 status / completedAt，不批准请求、不终止进程；
   * - 重开：有活动运行 → 进行中；否则 → 未开始并 inputRevision + 1（新的派发意图）；
   * - agent 任务在收到执行受理回执后进入进行中，仍可手动关闭与重开；
   * 每次流转追加一条系统评论（id 由事件和时间派生）。
   */
  async setStatus(id: string, status: TaskStatus, expectedVersion: string): Promise<TaskDto> {
    return this.withTaskWrite(id, () => this.writeStatus(id, status, expectedVersion));
  }

  private async writeStatus(id: string, status: TaskStatus, expectedVersion: string): Promise<TaskDto> {
    const entity = this.d.repo.read("task", id);
    const cur = this.dto(entity);
    if (cur.status === status) return cur;
    if (cur.type === "agent" && status === "in_progress" && cur.status === "not_started") throw errors.invalidInput("Agent 任务由自动化派发后进入进行中，不能手动开始");
    const now = this.d.now();
    const active = cur.type === "agent" && status !== "completed" && this.d.hasActiveRun?.(id);
    let next: TaskStatus = status;
    const changes: Record<string, unknown> = { status: next, updatedAt: iso(now) };
    let event: "start" | "close" | "reopen" | null = null;
    let bump = false;
    if (status === "completed") {
      changes["completedAt"] = iso(now);
      event = "close";
    } else if (cur.status === "completed") {
      // 重开
      next = active ? "in_progress" : "not_started";
      changes["status"] = next;
      changes["completedAt"] = null;
      bump = cur.type === "agent" && !active;
      event = "reopen";
    } else if (status === "not_started" && cur.type === "agent") {
      if (active) throw errors.invalidInput("这个任务有活动运行，请先停止运行");
      bump = true;
    } else if (status === "in_progress") event = "start";
    if (bump) changes["inputRevision"] = cur.inputRevision + 1;
    const stamp = iso(now);
    const comment: NewComment | null = event ? { id: `sys-${event}-${stamp}`, at: stamp, source: "system", event, body: event === "start" ? "开始处理" : event === "close" ? "关闭" : "重开" } : null;
    const body = comment ? appendComment(entity.body, comment).body : undefined;
    const e = await this.d.repo.patch("task", id, changes, expectedVersion, body);
    const dto = this.dto(e);
    this.d.publish("task.statusChanged", { taskId: id, status: dto.status, previous: cur.status });
    this.d.publish("entity.changed", { kind: "task", id, op: "updated" });
    if (bump) this.d.publish("task.inputChanged", { taskId: id, inputRevision: dto.inputRevision, inputHash: dto.inputHash });
    return dto;
  }

  /**
   * 保存派遣受理状态。当前任务仍未开始且输入版本和哈希匹配时，改为进行中。
   * 不依赖调用方传入的 expectedVersion；追加系统评论 `sys-<runId>-dispatched`（幂等）。
   */
  async recordDispatchAccepted(id: string, key: { inputRevision: number; inputHash: string }, runId: string, signal?: AbortSignal): Promise<TaskDto> {
    return this.withRetriedTaskWrite(id, async () => {
      signal?.throwIfAborted();
      const entity = this.d.repo.read("task", id);
      const cur = this.dto(entity);
      if (cur.status === "in_progress" && cur.comments.some((c) => c.id === `sys-${runId}-dispatched`)) return cur; // 同一 runId 重复调用
      if (cur.type !== "agent" || cur.status !== "not_started") throw errors.invalidInput("只有未开始的 Agent 任务可以派发");
      if (processingKey(cur.id, cur.inputRevision, cur.inputHash) !== processingKey(id, key.inputRevision, key.inputHash)) throw errors.invalidInput("任务内容已变化，不能按旧内容派发");
      const stamp = iso(this.d.now());
      const body = appendComment(entity.body, { id: `sys-${runId}-dispatched`, at: stamp, source: "system", run: runId, event: "dispatched", body: "已派发" }).body;
      const e = await this.d.repo.patch("task", id, { status: "in_progress", updatedAt: stamp }, cur.version, body);
      const dto = this.dto(e);
      this.d.publish("task.statusChanged", { taskId: id, status: "in_progress", previous: "not_started" });
      this.d.publish("entity.changed", { kind: "task", id, op: "updated" });
      return dto;
    });
  }

  /** 追加评论：按 id 去重（已存在就视为成功）；区段级条件写，最多重试 3 次。 */
  async addComment(taskId: string, c: NewComment): Promise<{ comment: TaskComment; added: boolean }> {
    return this.withRetriedTaskWrite(taskId, async () => {
      const entity = this.d.repo.read("task", taskId);
      const next = appendComment(entity.body, c);
      if (!next.added) return { comment: this.dto(entity).comments.find((x) => x.id === c.id)!, added: false };
      const e = await this.d.repo.patch("task", taskId, {}, entity.version, next.body);
      this.d.publish("entity.changed", { kind: "task", id: taskId, op: "updated" });
      return { comment: this.dto(e).comments.find((x) => x.id === c.id)!, added: true };
    });
  }

  async duplicate(id: string, origin: TaskOrigin, authorize?: (current: TaskDto) => void | Promise<void>): Promise<TaskDto> {
    const cur = this.read(id);
    await authorize?.(cur);
    return this.create(
      {
        title: `${cur.title} 副本`.slice(0, 200),
        type: cur.type,
        body: cur.body,
        tags: cur.tags,
        due: cur.due,
        availableAt: cur.availableAt ?? null,
        project: cur.project,
        execution: cur.execution,
        reminders: cur.reminders.map((r) => ({ ...r, deliveredAt: null })),
      },
      origin,
    );
  }

  /** 移入回收站；关联派遣记录留待恢复。 */
  async delete(id: string): Promise<void> {
    const cur = this.read(id);
    await this.d.trash.moveIn(cur.path, cur.id, { expectedVersion: cur.version });
    this.d.publish("entity.changed", { kind: "task", id, op: "deleted" });
  }

  /** 到点未投递的提醒（调度由插件作用域内的定时器驱动）。 */
  dueReminders(): { taskId: string; reminderId: string; title: string; at: string }[] {
    const now = this.d.now().getTime();
    return this.all().flatMap((t) => t.reminders.filter((r) => r.enabled && !r.deliveredAt && new Date(r.at).getTime() <= now).map((r) => ({ taskId: t.id, reminderId: r.id, title: t.title, at: r.at })));
  }

  async markReminderDelivered(taskId: string, reminderId: string): Promise<void> {
    return this.withTaskWrite(taskId, async () => {
      const cur = this.read(taskId);
      const reminders = cur.reminders.map((r) => (r.id === reminderId ? { ...r, deliveredAt: iso(this.d.now()) } : r));
      await this.d.repo.patch("task", taskId, { reminders }, cur.version);
      this.d.publish("reminder.due", { taskId, reminderId, title: cur.title });
    });
  }
}
