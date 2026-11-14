import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { InboxService, sourceFor, type ConvertTarget } from "./service.js";

export { InboxService, sourceFor } from "./service.js";

const Id = z.object({ id: z.string() });
const Dto = z.object({
  id: z.string(),
  path: z.string(),
  version: z.string(),
  title: z.string(),
  body: z.string(),
  source: z.string(),
  status: z.enum(["pending", "processed", "dismissed"]),
  createdAt: z.string(),
  processedAt: z.string().nullable(),
  result: z.object({ kind: z.enum(["task", "note", "archive"]), id: z.string() }).nullable(),
});
const CREATE_CAP: Record<ConvertTarget, string> = { task: "tasks.create", note: "notes.create", archive: "archives.create" };
const TARGET_PLUGIN: Record<ConvertTarget, string> = { task: "tasks", note: "notes", archive: "notes" };

export interface InboxOptions {
  now?: () => Date;
  isPluginEnabled?: (id: string) => boolean;
}

export function apply(_ctx: Context, api: HuhuApi, opts: InboxOptions = {}): InboxService {
  const svc = new InboxService({
    repo: api.vault.repo,
    trash: api.vault.trash,
    publish: (t, p) => api.events.publish(t, p),
    now: opts.now ?? (() => new Date()),
    isTargetEnabled: (k) => opts.isPluginEnabled?.(TARGET_PLUGIN[k]) ?? true,
    createTarget: async (kind, fields, key) => {
      const r = (await api.call(CREATE_CAP[kind], fields, { idempotencyKey: key })) as { id?: string; path?: string };
      const id = kind === "archive" ? r.path : r.id; // 档案以文件夹路径标识
      if (!id) throw new Error("目标插件没有返回对象 id");
      return { id };
    },
  });

  api.defineCapability(
    def({
      name: "inbox.list",
      plugin: "inbox",
      scope: "read",
      exposable: true,
      defaultExposed: true,
      input: z.object({ status: z.enum(["pending", "processed", "dismissed"]).optional(), source: z.string().optional(), query: z.string().optional() }),
      output: z.array(Dto),
      handler: (_c, i) => svc.list({ ...(i.status ? { status: i.status } : {}), ...(i.source ? { source: i.source } : {}), ...(i.query ? { query: i.query } : {}) }),
    }),
  );
  api.defineCapability(
    def({
      name: "inbox.capture",
      plugin: "inbox",
      scope: "write",
      exposable: true,
      defaultExposed: true,
      input: z.object({ title: z.string().optional(), body: z.string().default(""), source: z.string().optional() }),
      output: Dto,
      handler: (c, i) => svc.capture({ ...(i.title ? { title: i.title } : {}), body: i.body, source: sourceFor(c.caller, i.source) }),
    }),
  );
  api.defineCapability(
    def({
      name: "inbox.update",
      plugin: "inbox",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: Id.extend({ expectedVersion: z.string(), title: z.string().optional(), body: z.string().optional() }),
      output: Dto,
      handler: (_c, i) => svc.update(i.id, i.expectedVersion, { ...(i.title !== undefined ? { title: i.title } : {}), ...(i.body !== undefined ? { body: i.body } : {}) }),
    }),
  );
  api.defineCapability(
    def({
      name: "inbox.convert",
      plugin: "inbox",
      scope: "write",
      exposable: false,
      defaultExposed: false,
      input: Id.extend({ target: z.enum(["task", "note", "archive"]), fields: z.record(z.string(), z.unknown()) }),
      output: Dto,
      handler: (_c, i) => svc.convert(i.id, i.target, i.fields),
    }),
  );
  api.defineCapability(def({ name: "inbox.dismiss", plugin: "inbox", scope: "write", exposable: false, defaultExposed: false, input: Id, output: Dto, handler: (_c, i) => svc.dismiss(i.id) }));
  api.defineCapability(def({ name: "inbox.restore", plugin: "inbox", scope: "write", exposable: false, defaultExposed: false, input: Id, output: Dto, handler: (_c, i) => svc.restore(i.id) }));
  api.defineCapability(def({ name: "inbox.undo", plugin: "inbox", scope: "write", exposable: false, defaultExposed: false, input: Id, output: Dto, handler: (_c, i) => svc.undo(i.id) }));
  api.defineCapability(
    def({ name: "inbox.delete", plugin: "inbox", scope: "write", exposable: false, defaultExposed: false, input: Id, output: z.object({ ok: z.literal(true) }), handler: (_c, i) => (svc.delete(i.id), { ok: true as const }) }),
  );
  return svc;
}
