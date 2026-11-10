import { ArchiveFieldDefSchema } from "@huhu/contracts";
import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { OperationLog } from "@huhu/vault";
import path from "node:path";
import { z } from "zod";
import { ArchivesService } from "./service.js";

export { ArchivesService } from "./service.js";

const Id = z.object({ id: z.string() });
const Dto = z.object({
  id: z.string(), path: z.string(), version: z.string(), name: z.string(), type: z.string(), fields: z.record(z.string(), z.unknown()),
  relatedIds: z.array(z.string()), noteIds: z.array(z.string()), body: z.string(), updatedAt: z.string(), readOnly: z.boolean(),
  undefinedFields: z.array(z.string()), staleRelations: z.array(z.string()),
});
const TypeDto = z.object({ id: z.string(), path: z.string(), version: z.string(), name: z.string(), icon: z.string(), fields: z.array(ArchiveFieldDefSchema), body: z.string() });

export function apply(_ctx: Context, api: HuhuApi, opts: { now?: () => Date } = {}): ArchivesService {
  const files = api.vault.files;
  const svc = new ArchivesService({ repo: api.vault.repo, files, ops: new OperationLog(files, path.join(files.root, ".huhu", "operations")), publish: (t, p) => api.events.publish(t, p), now: opts.now ?? (() => new Date()) });

  api.defineCapability(def({ name: "archives.list", plugin: "archives", scope: "read", exposable: true, defaultExposed: true, input: z.object({ type: z.string().optional(), query: z.string().optional() }), output: z.array(Dto), handler: (_c, i) => svc.list({ ...(i.type ? { type: i.type } : {}), ...(i.query ? { query: i.query } : {}) }) }));
  api.defineCapability(def({ name: "archives.read", plugin: "archives", scope: "read", exposable: true, defaultExposed: true, input: Id, output: Dto, handler: (_c, i) => svc.read(i.id) }));
  api.defineCapability(def({ name: "archives.create", plugin: "archives", scope: "write", exposable: true, defaultExposed: false, input: z.object({ name: z.string(), type: z.string(), fields: z.record(z.string(), z.unknown()).optional(), body: z.string().optional() }), output: Dto, handler: (_c, i) => svc.create(i) }));
  api.defineCapability(def({ name: "archives.update", plugin: "archives", scope: "write", exposable: true, defaultExposed: false, input: Id.extend({ expectedVersion: z.string(), patch: z.object({ name: z.string().optional(), fields: z.record(z.string(), z.unknown()).optional(), body: z.string().optional() }) }), output: Dto, handler: (_c, i) => svc.update(i.id, i.expectedVersion, i.patch) }));
  api.defineCapability(def({ name: "archives.delete", plugin: "archives", scope: "write", exposable: true, defaultExposed: false, input: Id, output: z.object({ ok: z.literal(true) }), handler: async (_c, i) => (await svc.delete(i.id), { ok: true as const }) }));
  api.defineCapability(def({ name: "archives.changeType", plugin: "archives", scope: "write", exposable: true, defaultExposed: false, input: Id.extend({ expectedVersion: z.string(), type: z.string() }), output: Dto, handler: (_c, i) => svc.changeType(i.id, i.expectedVersion, i.type) }));
  api.defineCapability(def({ name: "archives.setRelations", plugin: "archives", scope: "write", exposable: true, defaultExposed: false, input: Id.extend({ relatedIds: z.array(z.string()) }), output: Dto, handler: (_c, i) => svc.setRelations(i.id, i.relatedIds) }));
  api.defineCapability(def({ name: "archives.linkNote", plugin: "archives", scope: "write", exposable: true, defaultExposed: false, input: Id.extend({ noteId: z.string() }), output: Dto, handler: (_c, i) => svc.linkNote(i.id, i.noteId) }));
  api.defineCapability(def({ name: "archives.unlinkNote", plugin: "archives", scope: "write", exposable: true, defaultExposed: false, input: Id.extend({ noteId: z.string() }), output: Dto, handler: (_c, i) => svc.unlinkNote(i.id, i.noteId) }));
  api.defineCapability(def({ name: "archives.types.list", plugin: "archives", scope: "read", exposable: false, defaultExposed: false, input: z.object({}), output: z.array(TypeDto), handler: () => svc.types() }));
  api.defineCapability(def({ name: "archives.types.save", plugin: "archives", scope: "write", exposable: false, defaultExposed: false, input: z.object({ id: z.string().optional(), name: z.string(), icon: z.string().optional(), fields: z.array(ArchiveFieldDefSchema), body: z.string().optional(), expectedVersion: z.string().optional() }), output: TypeDto, handler: (_c, i) => svc.saveType({ name: i.name, fields: i.fields, ...(i.id ? { id: i.id } : {}), ...(i.icon ? { icon: i.icon } : {}), ...(i.body !== undefined ? { body: i.body } : {}), ...(i.expectedVersion ? { expectedVersion: i.expectedVersion } : {}) }) }));
  api.defineCapability(def({ name: "archives.types.delete", plugin: "archives", scope: "write", exposable: false, defaultExposed: false, input: Id.extend({ migrateTo: z.string().optional() }), output: z.object({ migrated: z.number() }), handler: (_c, i) => svc.deleteType(i.id, i.migrateTo) }));
  return svc;
}
