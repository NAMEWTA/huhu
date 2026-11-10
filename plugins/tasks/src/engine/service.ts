import { newId, type EventPayload, type EventType, type TaskDto, type TaskWritable } from "@huhu/contracts";
import type { Entity, SemanticRepository, Trash } from "@huhu/vault";
import { inCategory, todayIn, type TaskCategory } from "../shared/categories.js";
import { inputChanged, inputHash } from "../shared/input.js";

export interface TasksDeps {
  repo: SemanticRepository;
  trash: Trash;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  zone(): string;
  now(): Date;
}

type TaskData = {
  title: string; completed: boolean; completedAt: string | null; due: string | null; project: string | null;
  execution: TaskDto["execution"]; resources: TaskDto["resources"]; reminders: TaskDto["reminders"];
  inputRevision: number; createdAt: string; updatedAt: string;
};

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

export function toDto(e: Entity): TaskDto {
  const d = e.data as unknown as TaskData;
  const body = e.body.replace(/^\r?\n/, "");
  return {
    id: e.id, path: e.path, version: e.version, title: d.title, body, completed: d.completed, completedAt: d.completedAt ?? null, due: d.due ?? null,
    project: d.project ?? null, execution: d.execution, resources: d.resources, reminders: d.reminders, inputRevision: d.inputRevision,
    inputHash: inputHash({ title: d.title, body, resources: d.resources, execution: d.execution }), createdAt: d.createdAt, updatedAt: d.updatedAt, readOnly: e.readOnly,
  };
}

/** 任务业务规则（modules/tasks.md §1、§5）。 */
export class TasksService {
  constructor(private readonly d: TasksDeps) {}

  private all(): TaskDto[] {
    return this.d.repo.list("task").map(toDto);
  }

  list(q: { category?: TaskCategory; completed?: boolean; query?: string } = {}): TaskDto[] {
    const today = todayIn(this.d.zone(), this.d.now());
    const needle = q.query?.trim().toLowerCase();
    return this.all()
      .filter((t) => inCategory(t, q.category ?? "all", today))
      .filter((t) => (q.completed === undefined ? true : t.completed === q.completed))
      .filter((t) => !needle || `${t.title}\n${t.body}\n${t.project ?? ""}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.title.localeCompare(b.title));
  }

  read(id: string): TaskDto {
    return toDto(this.d.repo.read("task", id));
  }

  async create(input: TaskWritable): Promise<TaskDto> {
    const now = iso(this.d.now());
    const data = {
      title: input.title, completed: false, completedAt: null, due: input.due, project: input.project, execution: input.execution, resources: input.resources,
      reminders: input.reminders.map((r) => ({ ...r, id: r.id || newId("cap").replace("cap", "rem"), deliveredAt: null })), inputRevision: 1, createdAt: now, updatedAt: now,
    };
    const e = await this.d.repo.create("task", data, input.body);
    this.d.publish("entity.changed", { kind: "task", id: e.id, op: "created" });
    return toDto(e);
  }

  async update(id: string, expectedVersion: string, patch: Partial<TaskWritable>): Promise<TaskDto> {
    const cur = this.read(id);
    const next = {
      title: patch.title ?? cur.title, body: patch.body ?? cur.body, resources: patch.resources ?? cur.resources, execution: patch.execution ?? cur.execution,
    };
    const changes: Record<string, unknown> = { updatedAt: iso(this.d.now()) };
    if (patch.title !== undefined) changes["title"] = patch.title;
    if (patch.due !== undefined) changes["due"] = patch.due;
    if (patch.project !== undefined) changes["project"] = patch.project;
    if (patch.execution !== undefined) changes["execution"] = patch.execution;
    if (patch.resources !== undefined) changes["resources"] = patch.resources;
    if (patch.reminders !== undefined) changes["reminders"] = patch.reminders;
    const inputDidChange = inputChanged({ title: cur.title, body: cur.body, resources: cur.resources, execution: cur.execution }, next);
    if (inputDidChange) changes["inputRevision"] = cur.inputRevision + 1;
    const e = await this.d.repo.patch("task", id, changes, expectedVersion, patch.body !== undefined ? (patch.body.startsWith("\n") ? patch.body : `\n${patch.body}`) : undefined);
    const dto = toDto(e);
    this.d.publish("entity.changed", { kind: "task", id, op: "updated" });
    if (inputDidChange) this.d.publish("task.inputChanged", { taskId: id, inputRevision: dto.inputRevision, inputHash: dto.inputHash });
    return dto;
  }

  /** 勾选/取消：只写 completed/completedAt；Agent 任务重新打开时 inputRevision+1。不调用 automations。 */
  async setCompleted(id: string, completed: boolean, expectedVersion: string): Promise<TaskDto> {
    const cur = this.read(id);
    if (cur.completed === completed) return cur;
    const now = this.d.now();
    const changes: Record<string, unknown> = { completed, completedAt: completed ? iso(now) : null, updatedAt: iso(now) };
    const reopenAgent = !completed && cur.execution.kind === "agent";
    if (reopenAgent) changes["inputRevision"] = cur.inputRevision + 1;
    const e = await this.d.repo.patch("task", id, changes, expectedVersion);
    const dto = toDto(e);
    this.d.publish("task.completedChanged", { taskId: id, completed });
    this.d.publish("entity.changed", { kind: "task", id, op: "updated" });
    if (reopenAgent) this.d.publish("task.inputChanged", { taskId: id, inputRevision: dto.inputRevision, inputHash: dto.inputHash });
    return dto;
  }

  async duplicate(id: string): Promise<TaskDto> {
    const cur = this.read(id);
    return this.create({
      title: `${cur.title} 副本`.slice(0, 200), body: cur.body, due: cur.due, project: cur.project, execution: cur.execution, resources: cur.resources,
      reminders: cur.reminders.map((r) => ({ ...r, deliveredAt: null })),
    });
  }

  /** 移入回收站；关联的 task-run 保留。 */
  delete(id: string): void {
    const cur = this.read(id);
    this.d.trash.moveIn(cur.path, cur.id);
    this.d.publish("entity.changed", { kind: "task", id, op: "deleted" });
  }

  runs(taskId: string): { id: string; state: string; startedAt: string | null; finishedAt: string | null; model: string | null; questions: number }[] {
    this.read(taskId);
    return this.d.repo
      .list("task-run")
      .filter((r) => (r.data as { taskId?: string }).taskId === taskId)
      .map((r) => {
        const d = r.data as { state: string; startedAt: string | null; finishedAt: string | null; model: string | null; questions: unknown[] };
        return { id: r.id, state: d.state, startedAt: d.startedAt ?? null, finishedAt: d.finishedAt ?? null, model: d.model ?? null, questions: d.questions?.length ?? 0 };
      });
  }

  /** 到点未投递的提醒（调度由插件作用域内的定时器驱动）。 */
  dueReminders(): { taskId: string; reminderId: string; title: string; at: string }[] {
    const now = this.d.now().getTime();
    return this.all().flatMap((t) => t.reminders.filter((r) => r.enabled && !r.deliveredAt && new Date(r.at).getTime() <= now).map((r) => ({ taskId: t.id, reminderId: r.id, title: t.title, at: r.at })));
  }

  async markReminderDelivered(taskId: string, reminderId: string): Promise<void> {
    const cur = this.read(taskId);
    const reminders = cur.reminders.map((r) => (r.id === reminderId ? { ...r, deliveredAt: iso(this.d.now()) } : r));
    await this.d.repo.patch("task", taskId, { reminders }, cur.version);
    this.d.publish("reminder.due", { taskId, reminderId, title: cur.title });
  }
}

