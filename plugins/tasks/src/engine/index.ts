import { TaskCategorySchema, TaskDtoSchema, TaskWritableSchema } from "@huhu/contracts";
import type { Context } from "@huhu/cordis";
import type { HuhuApi } from "@huhu/kernel";
import { defineCapability as def } from "@huhu/kernel";
import { z } from "zod";
import { TasksService } from "./service.js";

export { TasksService } from "./service.js";

const Id = z.object({ id: z.string() });
const Versioned = Id.extend({ expectedVersion: z.string() });
const REMINDER_CHECK_MS = 30_000;

export interface TasksOptions {
  zone?: () => string;
  now?: () => Date;
  reminderCheckMs?: number;
  /** 站内通知：提醒到点时调用（通知中心属于 kernel）。 */
  notify?: (n: { title: string; module: string }) => void;
}

/** tasks 插件入口（architecture.md §5）：注册能力、提醒检查；资源随作用域释放。 */
export function apply(ctx: Context, api: HuhuApi, opts: TasksOptions = {}): void {
  const svc = new TasksService({
    repo: api.vault.repo,
    trash: api.vault.trash,
    publish: (t, p) => api.events.publish(t, p),
    zone: opts.zone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    now: opts.now ?? (() => new Date()),
  });

  api.defineCapability(def({
    name: "tasks.list", plugin: "tasks", scope: "read", exposable: true, defaultExposed: true,
    input: z.object({ category: TaskCategorySchema.default("all"), completed: z.boolean().optional(), query: z.string().optional() }),
    output: z.array(TaskDtoSchema),
    handler: (_c, i) => svc.list({ category: i.category, ...(i.completed !== undefined ? { completed: i.completed } : {}), ...(i.query ? { query: i.query } : {}) }),
  }));
  api.defineCapability(def({ name: "tasks.read", plugin: "tasks", scope: "read", exposable: true, defaultExposed: true, input: Id, output: TaskDtoSchema, handler: (_c, i) => svc.read(i.id) }));
  api.defineCapability(def({ name: "tasks.create", plugin: "tasks", scope: "write", exposable: true, defaultExposed: false, input: TaskWritableSchema, output: TaskDtoSchema, handler: (_c, i) => svc.create(i) }));
  api.defineCapability(def({
    name: "tasks.update", plugin: "tasks", scope: "write", exposable: true, defaultExposed: false,
    input: Versioned.extend({ patch: TaskWritableSchema.partial() }), output: TaskDtoSchema,
    handler: (_c, i) => svc.update(i.id, i.expectedVersion, i.patch as never),
  }));
  api.defineCapability(def({ name: "tasks.duplicate", plugin: "tasks", scope: "write", exposable: true, defaultExposed: false, input: Id, output: TaskDtoSchema, handler: (_c, i) => svc.duplicate(i.id) }));
  api.defineCapability(def({ name: "tasks.delete", plugin: "tasks", scope: "write", exposable: true, defaultExposed: false, input: Id, output: z.object({ ok: z.literal(true) }), handler: (_c, i) => (svc.delete(i.id), { ok: true as const }) }));
  api.defineCapability(def({
    name: "tasks.setCompleted", plugin: "tasks", scope: "write", exposable: true, defaultExposed: false,
    input: Versioned.extend({ completed: z.boolean() }), output: TaskDtoSchema, handler: (_c, i) => svc.setCompleted(i.id, i.completed, i.expectedVersion),
  }));
  api.defineCapability(def({
    name: "tasks.runs", plugin: "tasks", scope: "read", exposable: true, defaultExposed: true, input: Id,
    output: z.array(z.object({ id: z.string(), state: z.string(), startedAt: z.string().nullable(), finishedAt: z.string().nullable(), model: z.string().nullable(), questions: z.number() })),
    handler: (_c, i) => svc.runs(i.id),
  }));

  // 提醒：启动时与每 30 秒检查；应用关闭期间到点的在下次启动补发一次
  let checking = false;
  const check = async () => {
    if (checking) return;
    checking = true;
    try {
      for (const r of svc.dueReminders()) {
        await svc.markReminderDelivered(r.taskId, r.reminderId);
        opts.notify?.({ title: `任务提醒：${r.title}`, module: "tasks" });
      }
    } finally {
      checking = false;
    }
  };
  ctx.effect(() => {
    void check();
    const t = setInterval(() => void check(), opts.reminderCheckMs ?? REMINDER_CHECK_MS);
    return () => clearInterval(t);
  });
}
